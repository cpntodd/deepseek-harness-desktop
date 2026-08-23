import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  advertisesEscalation,
  apply,
  inject,
  isStrictlyWider,
  name,
  resolveEffectiveMode,
  shadowEscalationTools,
  stripNonWiderEscalation,
  wrapEscalationGuardedExecute,
} from '../src/sandbox-escalation-guard.ts'

describe('desktop sandbox escalation guard', () => {
  it('declares the plugin name and tool/shell injection', () => {
    expect(name).toBe('desktop-sandbox-escalation-guard')
    expect(inject).toEqual(['tools', 'shell'])
  })

  describe('isStrictlyWider', () => {
    it('follows the upstream strictly-wider ladder', () => {
      expect(isStrictlyWider('read-only', 'workspace-write')).toBe(true)
      expect(isStrictlyWider('read-only', 'danger-full-access')).toBe(true)
      expect(isStrictlyWider('workspace-write', 'danger-full-access')).toBe(true)
    })

    it('rejects equal, narrower, and unknown modes', () => {
      expect(isStrictlyWider('read-only', 'read-only')).toBe(false)
      expect(isStrictlyWider('workspace-write', 'workspace-write')).toBe(false)
      expect(isStrictlyWider('workspace-write', 'read-only')).toBe(false)
      expect(isStrictlyWider('danger-full-access', 'danger-full-access')).toBe(false)
      expect(isStrictlyWider('danger-full-access', 'workspace-write')).toBe(false)
      expect(isStrictlyWider('danger-full-access', 'read-only')).toBe(false)
      expect(isStrictlyWider('unknown-mode', 'danger-full-access')).toBe(false)
    })
  })

  describe('advertisesEscalation', () => {
    it('detects the sandbox_permissions parameter in flat tool schemas', () => {
      expect(advertisesEscalation({ command: {}, sandbox_permissions: {}, justification: {} })).toBe(true)
      expect(advertisesEscalation({ command: {} })).toBe(false)
      expect(advertisesEscalation(undefined)).toBe(false)
      expect(advertisesEscalation(null)).toBe(false)
      expect(advertisesEscalation('command')).toBe(false)
    })

    it('detects the sandbox_permissions parameter in JSON-Schema tool parameters', () => {
      // The registry normalizes tool parameters into { type, properties, required }.
      expect(advertisesEscalation({
        type: 'object',
        properties: { command: {}, sandbox_permissions: {}, justification: {} },
        required: ['command'],
      })).toBe(true)
      expect(advertisesEscalation({
        type: 'object',
        properties: { command: {} },
        required: ['command'],
      })).toBe(false)
    })
  })

  describe('stripNonWiderEscalation', () => {
    it('leaves calls without escalation fields untouched', () => {
      const args = { command: 'ls' }
      const result = stripNonWiderEscalation(args, 'danger-full-access')
      expect(result.stripped).toBe(false)
      expect(result.args).toEqual({ command: 'ls' })
      expect(result.args).not.toBe(args)
    })

    it('strips an equal-mode escalation request', () => {
      const args = { command: 'ls', sandbox_permissions: 'danger-full-access', justification: 'run it' }
      const result = stripNonWiderEscalation(args, 'danger-full-access')
      expect(result.stripped).toBe(true)
      expect(result.args).toEqual({ command: 'ls' })
    })

    it('strips a narrower-mode escalation request', () => {
      const args = { command: 'ls', sandbox_permissions: 'read-only', justification: 'run it' }
      const result = stripNonWiderEscalation(args, 'workspace-write')
      expect(result.stripped).toBe(true)
      expect(result.args).toEqual({ command: 'ls' })
    })

    it('strips a bare justification with no widening request', () => {
      const args = { command: 'ls', justification: 'run it' }
      const result = stripNonWiderEscalation(args, 'workspace-write')
      expect(result.stripped).toBe(true)
      expect(result.args).toEqual({ command: 'ls' })
    })

    it('preserves a genuinely wider escalation request', () => {
      const args = { command: 'ls', sandbox_permissions: 'danger-full-access', justification: 'needs full access' }
      const result = stripNonWiderEscalation(args, 'workspace-write')
      expect(result.stripped).toBe(false)
      expect(result.args).toEqual(args)
    })

    it('never mutates the caller arguments', () => {
      const args = Object.freeze({ command: 'ls', sandbox_permissions: 'danger-full-access', justification: 'run it' })
      const result = stripNonWiderEscalation(args, 'danger-full-access')
      expect(result.stripped).toBe(true)
      expect(result.args).toEqual({ command: 'ls' })
      expect(args).toEqual({ command: 'ls', sandbox_permissions: 'danger-full-access', justification: 'run it' })
    })
  })

  describe('wrapEscalationGuardedExecute', () => {
    const exec = {
      agent: { session: {} },
      deferContext: () => {},
      concludeTurn: () => {},
    } as unknown as ToolRunContext

    it('delegates ordinary calls unchanged', async () => {
      const upstream = vi.fn(async (_args: unknown) => ({ ok: true }))
      const wrapped = wrapEscalationGuardedExecute(upstream as ToolDefinition['execute'], () => 'danger-full-access')
      const result = await wrapped({ command: 'ls' }, exec)
      expect(result).toEqual({ ok: true })
      expect(upstream).toHaveBeenCalledWith({ command: 'ls' }, exec)
    })

    it('runs a full-access call with an equal-mode escalation instead of erroring', async () => {
      const upstream = vi.fn(async (_args: unknown) => ({ exitCode: 0 }))
      const wrapped = wrapEscalationGuardedExecute(upstream as ToolDefinition['execute'], () => 'danger-full-access')
      const result = await wrapped(
        { command: 'git status', sandbox_permissions: 'danger-full-access', justification: 'run it' },
        exec,
      )
      expect(result).toEqual({ exitCode: 0 })
      expect(upstream).toHaveBeenCalledTimes(1)
      expect(upstream.mock.calls[0]?.[0]).toEqual({ command: 'git status' })
    })

    it('strips any escalation request while the session is in danger-full-access', async () => {
      const upstream = vi.fn(async (_args: unknown) => ({ exitCode: 0 }))
      const wrapped = wrapEscalationGuardedExecute(upstream as ToolDefinition['execute'], () => 'danger-full-access')
      await wrapped(
        { command: 'git status', sandbox_permissions: 'workspace-write', justification: 'run it' },
        exec,
      )
      expect(upstream.mock.calls[0]?.[0]).toEqual({ command: 'git status' })
    })

    it('preserves a genuine wider escalation for the approval flow', async () => {
      const upstream = vi.fn(async (_args: unknown) => ({ exitCode: 0 }))
      const wrapped = wrapEscalationGuardedExecute(upstream as ToolDefinition['execute'], () => 'workspace-write')
      const original = { command: 'rm -rf /tmp/x', sandbox_permissions: 'danger-full-access', justification: 'clean temp' }
      await wrapped(original, exec)
      expect(upstream).toHaveBeenCalledWith(original, exec)
    })

    it('leaves the call alone when the effective mode cannot be resolved', async () => {
      const upstream = vi.fn(async (_args: unknown) => ({ exitCode: 0 }))
      const wrapped = wrapEscalationGuardedExecute(upstream as ToolDefinition['execute'], () => undefined)
      const original = { command: 'ls', sandbox_permissions: 'danger-full-access', justification: 'run it' }
      await wrapped(original, exec)
      expect(upstream).toHaveBeenCalledWith(original, exec)
    })
  })

  describe('shadowEscalationTools', () => {
    const escalationTool: ToolDefinition = {
      name: 'bash',
      description: 'run a command',
      parameters: { command: {}, sandbox_permissions: {}, justification: {} },
      output: {
        schema: { type: 'object', properties: { exitCode: {} } },
        render: (_args: unknown) => [{ type: 'text' as const, text: 'ok' }],
      },
      execute: async (_args: unknown) => ({ exitCode: 0 }),
    }
    const plainTool: ToolDefinition = {
      name: 'ls_files',
      description: 'list files',
      parameters: { path: {} },
      output: {
        schema: { type: 'object', properties: {} },
        render: (_args: unknown) => [{ type: 'text' as const, text: 'ok' }],
      },
      execute: async (_args: unknown) => ({ ok: true }),
    }

    it('shadows escalation-advertising tools and leaves plain tools alone', () => {
      const schemas = [
        { name: 'bash', description: 'run a command', parameters: escalationTool.parameters },
        { name: 'ls_files', description: 'list files', parameters: plainTool.parameters },
      ]
      const get = vi.fn((toolName: string) => toolName === 'bash' ? escalationTool : plainTool)
      const register = vi.fn((_definition: ToolDefinition) => () => {})
      const facade = { schemas: () => schemas, get, register }
      const resolve = () => 'danger-full-access'

      const count = shadowEscalationTools(facade, { agentId: 'a' }, resolve)

      expect(count).toBe(1)
      expect(register).toHaveBeenCalledTimes(1)
      const shadow = register.mock.calls[0]![0] as ToolDefinition
      expect(shadow.name).toBe('bash')
      expect(shadow.execute).not.toBe(escalationTool.execute)
      // The shadow keeps the upstream schema and presentation contract.
      expect(shadow.parameters).toBe(escalationTool.parameters)
      expect(shadow.output).toBe(escalationTool.output)
      // The shadowed execute strips a same-mode escalation before delegating.
      const result = shadow.execute(
        { command: 'git status', sandbox_permissions: 'danger-full-access', justification: 'run it' },
        { agent: { session: {} }, deferContext: () => {}, concludeTurn: () => {} } as unknown as ToolRunContext,
      )
      void expect(result).resolves.toEqual({ exitCode: 0 })
    })

    it('skips tools the agent cannot see', () => {
      const schemas = [{ name: 'bash', description: 'run a command', parameters: escalationTool.parameters }]
      const get = vi.fn(() => undefined)
      const register = vi.fn((_definition: ToolDefinition) => () => {})
      const count = shadowEscalationTools({ schemas: () => schemas, get, register }, {}, () => 'danger-full-access')
      expect(count).toBe(0)
      expect(register).not.toHaveBeenCalled()
    })
  })

  describe('resolveEffectiveMode', () => {
    it('prefers the standing per-session policy mode', () => {
      const ctx = {
        get: vi.fn(() => ({ resolve: () => ({ mode: 'danger-full-access', workspaceRoot: '/tmp' }) })),
        shell: { sandboxMode: 'workspace-write' },
      } as never
      const mode = resolveEffectiveMode(ctx as Parameters<typeof resolveEffectiveMode>[0], { agent: { session: {} } } as ToolExecution)
      expect(mode).toBe('danger-full-access')
    })

    it('falls back to the shell executor sandbox mode without a policy service', () => {
      const ctx = {
        get: vi.fn(() => undefined),
        shell: { sandboxMode: 'workspace-write' },
      } as never
      const mode = resolveEffectiveMode(ctx as Parameters<typeof resolveEffectiveMode>[0], { agent: { session: {} } } as ToolExecution)
      expect(mode).toBe('workspace-write')
    })
  })

  describe('apply', () => {
    it('hardens escalation tools for every live agent on agent/created', () => {
      const listeners: Record<string, (payload: unknown) => void> = {}
      const on = vi.fn((event: string, listener: (payload: unknown) => void) => {
        listeners[event] = listener
        return () => {}
      })
      const shadowSchemas = [
        { name: 'bash', description: 'run a command', parameters: { command: {}, sandbox_permissions: {}, justification: {} } },
      ]
      const escalationTool: ToolDefinition = {
        name: 'bash',
        description: 'run a command',
        parameters: { command: {}, sandbox_permissions: {}, justification: {} },
        output: {
          schema: { type: 'object', properties: { exitCode: {} } },
          render: (_args: unknown) => [{ type: 'text' as const, text: 'ok' }],
        },
        execute: async (_args: unknown) => ({ exitCode: 0 }),
      }
      const agentTools = {
        schemas: () => shadowSchemas,
        get: () => escalationTool,
        register: vi.fn((_definition: ToolDefinition) => () => {}),
      }
      const agent = {
        id: 'session-1',
        ctx: {
          // The real agent scope inherits tools from the agent loop, so the
          // guard shadows through agent.ctx.tools directly.
          tools: agentTools,
        },
      }
      const logger = { info: vi.fn() }
      const ctx = {
        on,
        logger,
        get: vi.fn(() => ({ resolve: () => ({ mode: 'danger-full-access', workspaceRoot: '/tmp' }) })),
        shell: { sandboxMode: 'danger-full-access' },
      } as never

      apply(ctx as Parameters<typeof apply>[0])

      expect(on).toHaveBeenCalledWith('agent/created', expect.any(Function))
      listeners['agent/created']?.({ agent })

      expect(agentTools.register).toHaveBeenCalledTimes(1)
      const shadow = agentTools.register.mock.calls[0]![0] as ToolDefinition
      expect(shadow.name).toBe('bash')
      expect(shadow.execute).not.toBe(escalationTool.execute)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('hardened 1 escalation tool(s) for agent session-1'))
    })
  })
})
