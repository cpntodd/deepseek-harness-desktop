/**
 * Desktop-owned `LlmAdapter` for the OpenAI Codex (ChatGPT Plus/Pro) provider.
 *
 * The harness's `dsh-llm-pi-ai` cannot be extended with an OAuth provider from
 * outside, and its `PROTOCOLS` table deliberately excludes OAuth protocols for
 * hand-declared routes, so the desktop owns its own model surface: a `Models`
 * collection built from pi-ai's `openaiCodexProvider()` over the desktop
 * credential store, registered through `ctx.llm.registerAdapter()`.
 *
 * @module dsh-plugin-desktop/codex-provider
 */

import { createModels } from '@earendil-works/pi-ai'
import type {
  AssistantMessage,
  AssistantMessageEvent,
  AuthContext,
  Context as PiContext,
  CredentialStore,
  Message as PiMessage,
  Models,
  MutableModels,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCall,
  Usage as PiUsage,
} from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { CallId, LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  ContentBlock,
  FinishReason,
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  Message,
  StreamChunk,
  TokenUsage,
} from '@deepseek-ai/dsh-llm'
import { CODEX_PROVIDER_ID } from './codex-auth.ts'

/** Build a `Models` collection holding only the OpenAI Codex provider. */
export function createCodexModels(
  credentials: CredentialStore,
  authContext: AuthContext,
): MutableModels {
  const models = createModels({ credentials, authContext })
  models.setProvider(openaiCodexProvider())
  return models
}

/** Map pi-ai usage into harness counts; cache fields appear only when non-zero. */
export function mapUsage(usage: PiUsage): TokenUsage {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    ...(usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {}),
    ...(usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {}),
  }
}

/** Map a terminal pi-ai stop reason into the harness finish reason. */
export function mapStopReason(message: AssistantMessage): FinishReason {
  switch (message.stopReason) {
    case 'stop':
      if (message.content.length === 0) {
        return {
          kind: 'error',
          failure: {
            message: `model "${message.model}" returned a completed response with no content`,
            code: 'EMPTY_RESPONSE',
          },
        }
      }
      return { kind: 'stop' }
    case 'length':
      return { kind: 'max-tokens' }
    case 'toolUse':
      return { kind: 'tool-calls' }
    case 'aborted':
      return {
        kind: 'aborted',
        failure: { message: message.errorMessage ?? 'codex stream aborted', code: 'ABORTED' },
      }
    case 'error':
      return {
        kind: 'error',
        failure: { message: message.errorMessage ?? 'codex stream error', code: 'PI_AI_ERROR' },
      }
  }
}

/**
 * Translate the pi-ai event stream into StreamChunks. pi-ai never throws
 * mid-stream — failures arrive as `error` events, which become error/aborted
 * finish chunks.
 * @param events - one assistant turn's pi-ai event stream.
 * @returns the harness chunks, ending with `usage` then `finish`; throws
 *   `LlmError` (`STREAM_CLOSED`) if the source ends without a terminal event.
 */
export async function* toStreamChunks(
  events: AsyncIterable<AssistantMessageEvent>,
): AsyncGenerator<StreamChunk> {
  const toolIds = new Map<number, { id: string; name: string }>()
  for await (const event of events) {
    switch (event.type) {
      case 'start':
        break
      case 'text_start':
        yield { type: 'block-start', index: event.contentIndex, blockType: 'text' }
        break
      case 'text_delta':
        yield { type: 'text-delta', index: event.contentIndex, text: event.delta }
        break
      case 'text_end':
        yield { type: 'block-end', index: event.contentIndex, block: { type: 'text', text: event.content } }
        break
      case 'thinking_start':
        yield { type: 'block-start', index: event.contentIndex, blockType: 'reasoning' }
        break
      case 'thinking_delta':
        yield { type: 'reasoning-delta', index: event.contentIndex, text: event.delta }
        break
      case 'thinking_end':
        yield { type: 'block-end', index: event.contentIndex, block: { type: 'reasoning', text: event.content } }
        break
      case 'toolcall_start': {
        const partial = event.partial.content[event.contentIndex]
        const id = partial?.type === 'toolCall' ? partial.id : ''
        const name = partial?.type === 'toolCall' ? partial.name : ''
        toolIds.set(event.contentIndex, { id, name })
        yield { type: 'block-start', index: event.contentIndex, blockType: 'tool-call' }
        break
      }
      case 'toolcall_delta': {
        const known = toolIds.get(event.contentIndex)
        yield {
          type: 'tool-call-delta',
          index: event.contentIndex,
          id: CallId(known?.id ?? ''),
          ...(known?.name !== undefined && known.name.length > 0 ? { name: known.name } : {}),
          argumentsDelta: event.delta,
        }
        break
      }
      case 'toolcall_end':
        yield {
          type: 'block-end',
          index: event.contentIndex,
          block: {
            type: 'tool-call',
            id: CallId(event.toolCall.id),
            name: event.toolCall.name,
            arguments: JSON.stringify(event.toolCall.arguments),
          },
        }
        break
      case 'done':
        yield { type: 'usage', usage: mapUsage(event.message.usage) }
        yield { type: 'finish', reason: mapStopReason(event.message) }
        return
      case 'error':
        yield { type: 'usage', usage: mapUsage(event.error.usage) }
        yield { type: 'finish', reason: mapStopReason(event.error) }
        return
    }
  }
  throw new LlmError('codex event stream ended without done/error', 'STREAM_CLOSED')
}

/** Join the text blocks of a harness message. */
function flattenText(message: Message): string {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Flatten text recursively inside one tool result. */
function toolResultText(blocks: readonly ContentBlock[]): string {
  return blocks.map(block => block.type === 'text'
    ? block.text
    : block.type === 'tool-result' ? toolResultText(block.content) : '').join('')
}

/** Assemble the request-level pi-ai tool list. */
function toolsOf(options: GenerateOptions): Tool[] | undefined {
  return options.tools?.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

/** Parse tool-call argument JSON; tolerate malformed values with {}. */
function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  return {}
}

/** The zero usage value required by historical pi-ai assistant messages. */
function emptyPiUsage(): PiUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

/**
 * Convert one durable harness assistant message into pi-ai history without
 * replay state. The desktop adapter never emits replay metadata, so every
 * historical assistant message is provider-neutral.
 */
function toPiAssistant(message: Message): AssistantMessage {
  const source = message.source.kind === 'model' ? message.source : undefined
  const content: Array<TextContent | ThinkingContent | ToolCall> = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text': content.push({ type: 'text', text: block.text }); break
      case 'reasoning': content.push({ type: 'thinking', thinking: block.text }); break
      case 'tool-call': content.push({
        type: 'toolCall',
        id: block.id,
        name: block.name,
        arguments: parseArguments(block.arguments),
      }); break
      case 'image':
        throw new LlmError('codex chat history cannot represent structured assistant image output', 'UNSUPPORTED_CONTENT')
      default:
        break
    }
  }
  return {
    role: 'assistant',
    content,
    api: 'openai-codex-responses',
    provider: source?.provider ?? CODEX_PROVIDER_ID,
    model: source?.model ?? 'dsh-foreign',
    usage: emptyPiUsage(),
    stopReason: content.some(piece => piece.type === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: 0,
  }
}

/**
 * Convert text-only harness history into a pi-ai Context. Tool result names
 * are recovered from preceding assistant tool calls.
 */
export function toPiContext(options: GenerateOptions): PiContext {
  const toolNames = new Map<string, string>()
  const messages: PiMessage[] = []
  for (const message of options.messages) {
    if (message.role === 'system') {
      messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      const assistant = toPiAssistant(message)
      for (const block of assistant.content) if (block.type === 'toolCall') toolNames.set(block.id, block.name)
      messages.push(assistant)
      continue
    }
    const text = flattenText(message)
    const results = message.content.filter(block => block.type === 'tool-result')
    if (text.length > 0 || results.length === 0) messages.push({ role: 'user', content: text, timestamp: 0 })
    for (const result of results) {
      messages.push({
        role: 'toolResult',
        toolCallId: result.toolCallId,
        toolName: toolNames.get(result.toolCallId) ?? 'unknown',
        content: [{ type: 'text', text: toolResultText(result.content) || '(no output)' }],
        isError: result.isError ?? false,
        timestamp: 0,
      })
    }
  }
  const tools = toolsOf(options)
  return {
    ...(options.system !== undefined ? { systemPrompt: options.system } : {}),
    messages,
    ...(tools !== undefined ? { tools } : {}),
  }
}

/** Desktop-owned LLM adapter serving the OpenAI Codex provider route. */
export class CodexLlmAdapter extends LlmAdapter {
  constructor(private readonly models: Models) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'OpenAI Codex' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve().then(() => this.models.getModels(provider).map(model => ({
      provider,
      id: model.id,
      name: model.name,
      inputModalities: [...model.input],
    })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve().then(() => {
      const resolved = this.models.getModel(provider, model)
      if (resolved === undefined) {
        throw new LlmError(`codex provider "${provider}" has no configured model "${model}"`, 'UNKNOWN_MODEL')
      }
      return {
        provider,
        id: model,
        name: resolved.name,
        inputModalities: [...resolved.input],
        context: { contextWindow: resolved.contextWindow },
      }
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const model = this.models.getModel(options.provider, options.model)
    if (model === undefined) {
      throw new LlmError(
        `codex provider "${options.provider}" has no configured model "${options.model}"`,
        'UNKNOWN_MODEL',
      )
    }
    const context = toPiContext(options)
    const events = this.models.streamSimple(model, context, {
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
      ...(options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      maxRetries: 0,
    })
    yield * toStreamChunks(events)
  }
}
