/**
 * Integration proof for the desktop sandbox escalation guard against the REAL
 * agent machinery: mount the standard agent-loop prerequisite services, boot
 * the real AgentLoop, create a real agent in danger-full-access, and dispatch
 * a bash call that attaches an equal-mode `sandbox_permissions`. Without the
 * guard the upstream policy fail-closes with the "not strictly wider" error;
 * with the guard the call must RUN at the current mode instead.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import * as ToolBash from '@deepseek-ai/dsh-tool-bash'
import * as BashEnvPlugin from '@deepseek-ai/dsh-shell-env'
import { apply as applyGuard } from '../src/sandbox-escalation-guard.ts'

/** A shell executor that records the sandbox mode each call ran under. */
class RecordingSandboxExecutor extends ShellExecutor {
  readonly modes: Array<string | undefined> = []

  override get sandboxMode() {
    return 'danger-full-access' as const
  }

  resolve(request: ShellExecRequest): ShellExecSpec {
    return {
      command: request.command,
      workdir: request.workdir ?? process.cwd(),
      stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
      timeoutMs: request.timeoutMs ?? 1000,
      ...request.signal ? { signal: request.signal } : {},
      sandboxPolicy: request.sandboxPolicy ?? { mode: 'danger-full-access', workspaceRoot: process.cwd() },
    }
  }

  run(spec: ShellExecSpec): Promise<ShellRunResult> {
    this.modes.push(spec.sandboxPolicy?.mode)
    return Promise.resolve({
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: spec.timeoutMs,
      stdout: { text: 'ok', truncated: false },
      stderr: { text: '', truncated: false },
      sandbox: { mode: spec.sandboxPolicy?.mode ?? 'danger-full-access', denied: false },
    })
  }

  start(spec: ShellExecSpec): ShellProcess {
    this.modes.push(spec.sandboxPolicy?.mode)
    return {
      status: 'completed',
      exitCode: 0,
      signal: null,
      done: Promise.resolve(),
      sandbox: { mode: spec.sandboxPolicy?.mode ?? 'danger-full-access', denied: false },
      readOutput: () => ({ delta: '', lossy: false }),
      kill: () => false,
    }
  }
}

/** Minimal adapter so the real AgentLoop can create agents on the `mock` route. */
class TrivialAdapter extends LlmAdapter {
  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    return
  }
}

interface Harness {
  ctx: Context
  bash: RecordingSandboxExecutor
  dispose: () => Promise<void>
}

async function setupHarness(withGuard: boolean): Promise<Harness> {
  const ctx = new Context()
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-guard-'))
  // The standard agent-loop prerequisites (the same five services the
  // upstream agent-loop testkit mounts), then the desktop's sandbox + bash +
  // guard, then the real AgentLoop.
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root })
  await ctx.plugin(SandboxPolicyService, {})
  await ctx.plugin(RecordingSandboxExecutor)
  await ctx.plugin(BashEnvPlugin)
  await ctx.plugin(ToolBash)
  if (withGuard) await ctx.plugin(applyGuard)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], new TrivialAdapter())
  const dispose = async (): Promise<void> => {
    await ctx.fiber.dispose()
    rmSync(root, { recursive: true, force: true })
  }
  return { ctx, bash: ctx.shell as RecordingSandboxExecutor, dispose }
}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** Create a REAL agent through the AgentLoop and switch its session to a mode. */
function realAgent(ctx: Context, mode: 'read-only' | 'workspace-write' | 'danger-full-access', sessionId: string): Agent {
  const agent = ctx.agentLoop.create(SessionId(sessionId), { provider: 'mock', model: 'mock' })
  agent.session.append('sandbox/mode', { mode })
  return agent
}

let callCounter = 0
function call(ctx: Context, name: string, args: unknown, agent?: Agent) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`guard-call-${++callCounter}`),
    name,
    arguments: args,
    ...agent ? { agent } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

const FULL_ACCESS_CALL = {
  command: 'true',
  description: 'reproduce the full-access escalation error',
  sandbox_permissions: 'danger-full-access',
  justification: 'the session already runs with full access',
}

describe('sandbox escalation guard — real agent integration', () => {
  it('reproduces the upstream fail-closed error WITHOUT the guard', async () => {
    const harness = await setupHarness(false)
    cleanups.push(harness.dispose)
    const agent = realAgent(harness.ctx, 'danger-full-access', 'session-baseline')
    const result = await call(harness.ctx, 'bash', FULL_ACCESS_CALL, agent)
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('not strictly wider')
  })

  it('runs the same call at the current mode WITH the guard (no error, no prompt)', async () => {
    const harness = await setupHarness(true)
    cleanups.push(harness.dispose)
    const agent = realAgent(harness.ctx, 'danger-full-access', 'session-guarded')
    const result = await call(harness.ctx, 'bash', FULL_ACCESS_CALL, agent)
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('ok')
    // The command actually ran, under the session's full-access mode.
    expect(harness.bash.modes).toEqual(['danger-full-access'])
  })

  it('strips an equal-mode escalation in a narrower session too', async () => {
    const harness = await setupHarness(true)
    cleanups.push(harness.dispose)
    const agent = realAgent(harness.ctx, 'workspace-write', 'session-equal')
    const result = await call(harness.ctx, 'bash', {
      command: 'true',
      description: 'equal-mode escalation in workspace-write',
      sandbox_permissions: 'workspace-write',
      justification: 'the session already runs in workspace-write',
    }, agent)
    expect(result.isError).toBe(false)
    expect(harness.bash.modes).toEqual(['workspace-write'])
  })

  it('preserves a genuinely wider escalation for the approval flow', async () => {
    const harness = await setupHarness(true)
    cleanups.push(harness.dispose)
    const agent = realAgent(harness.ctx, 'workspace-write', 'session-wider')
    const result = await call(harness.ctx, 'bash', {
      command: 'true',
      description: 'genuine escalation to full access',
      sandbox_permissions: 'danger-full-access',
      justification: 'this command needs full access',
    }, agent)
    // Not stripped: the upstream approval flow is reached and fails closed
    // because no approval service is composed — proving the guard did not
    // swallow a legitimate wider request.
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('requires approval')
  })
})
