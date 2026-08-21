import { describe, expect, it } from 'vitest'
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Models,
} from '@earendil-works/pi-ai'
import { CodexLlmAdapter, mapStopReason, mapUsage, toStreamChunks } from '../src/codex-provider.ts'

function usage(overrides: Partial<AssistantMessage['usage']> = {}): AssistantMessage['usage'] {
  return {
    input: 1,
    output: 2,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 3,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    ...overrides,
  }
}

function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'openai-codex-responses',
    provider: 'openai-codex',
    model: 'gpt-5.4',
    usage: usage(),
    stopReason: 'stop',
    timestamp: 0,
    ...overrides,
  }
}

function fakeModels(): Models {
  return {
    getProviders: () => [],
    getProvider: () => undefined,
    getModels: () => [],
    getModel: () => undefined,
    refresh: () => Promise.resolve({ aborted: false, errors: new Map() }),
    checkAuth: () => Promise.resolve(undefined),
    getAvailable: () => Promise.resolve([]),
    getAuth: () => Promise.resolve(undefined),
    login: () => Promise.reject(new Error('unused')),
    logout: () => Promise.resolve(),
    stream: () => { throw new Error('unused') },
    complete: () => Promise.reject(new Error('unused')),
    streamSimple: () => { throw new Error('unused') },
    completeSimple: () => Promise.reject(new Error('unused')),
  } as unknown as Models
}

describe('codex LLM adapter', () => {
  it('owns exactly the openai-codex provider route', () => {
    const adapter = new CodexLlmAdapter(fakeModels())
    expect(adapter.providerInfo('openai-codex')).toEqual({ id: 'openai-codex', name: 'OpenAI Codex' })
  })

  it('maps pi-ai usage into harness counts, omitting zero cache fields', () => {
    expect(mapUsage(usage())).toEqual({ inputTokens: 1, outputTokens: 2 })
    expect(mapUsage(usage({ cacheRead: 4, cacheWrite: 5 }))).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 4,
      cacheWriteTokens: 5,
    })
  })

  it('maps a stop reason with no content to an empty-response error', () => {
    expect(mapStopReason(assistant({ stopReason: 'stop', content: [] }))).toEqual({
      kind: 'error',
      failure: {
        message: 'model "gpt-5.4" returned a completed response with no content',
        code: 'EMPTY_RESPONSE',
      },
    })
  })

  it('maps a tool-use stop reason to tool-calls', () => {
    expect(mapStopReason(assistant({ stopReason: 'toolUse' }))).toEqual({ kind: 'tool-calls' })
  })

  it('translates a text event stream into harness chunks', async () => {
    const events: AsyncIterable<AssistantMessageEvent> = (async function* () {
      yield { type: 'start', partial: assistant() }
      yield { type: 'text_start', contentIndex: 0, partial: assistant() }
      yield { type: 'text_delta', contentIndex: 0, delta: 'hello', partial: assistant() }
      yield { type: 'text_end', contentIndex: 0, content: 'hello', partial: assistant() }
      yield {
        type: 'done',
        reason: 'stop',
        message: assistant({ content: [{ type: 'text', text: 'hello' }] }),
      }
    })()

    const chunks = []
    for await (const chunk of toStreamChunks(events)) chunks.push(chunk)

    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'hello' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'hello' } },
      { type: 'usage', usage: { inputTokens: 1, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })
})
