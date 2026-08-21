import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { applySubscriptionsClient } from '../src/client/subscriptions/index.ts'
import { en } from '../src/client/subscriptions/locales.ts'

/**
 * A minimal ClientContext fake recording slot registrations, mirroring the
 * harness used by client-desktop-settings.spec.ts: `slots.inject` invokes the
 * mount thunk and `slots.register` is a plain spy that captures the options.
 * Only the services applySubscriptionsClient touches are provided.
 */
function createHarness(): { ctx: ClientContext; registrations: Array<Record<string, unknown>>; commands: Array<Record<string, unknown>> } {
  const registrations: Array<Record<string, unknown>> = []
  const commands: Array<Record<string, unknown>> = []
  const register = vi.fn((options: Record<string, unknown>) => {
    registrations.push(options)
    return () => {}
  })
  const inject = vi.fn((_name: string, mount: () => unknown) => mount())
  const ctx = {
    effect: vi.fn(),
    locale: {
      register: vi.fn(() => () => {}),
      bind: () => ((key: string) => en[key as keyof typeof en] ?? key),
    },
    get: vi.fn((key: string) => key === 'connection' ? { rpc: vi.fn() } : undefined),
    slots: { inject, register },
    inject: vi.fn((_services: string[], fn: (scope: { get: (k: string) => unknown; effect: (f: () => unknown) => unknown }) => void) => {
      fn({
        get: (k: string) => k === 'commandUi' ? { register: (cmd: Record<string, unknown>) => commands.push(cmd) } : undefined,
        effect: (f: () => unknown) => { const d = f(); return typeof d === 'function' ? d : () => {} },
      })
      return () => {}
    }),
  } as unknown as ClientContext
  return { ctx, registrations, commands }
}

describe('subscriptions client', () => {
  it('does not register a settings.section (the combined Providers section owns that nav entry)', () => {
    const { ctx, registrations } = createHarness()
    applySubscriptionsClient(ctx)

    const sections = registrations.filter(entry => entry.name === 'settings.section')
    expect(sections).toHaveLength(0)
  })

  it('registers the image and video toolviews', () => {
    const { ctx, registrations } = createHarness()
    applySubscriptionsClient(ctx)

    const toolviews = registrations.filter(entry => entry.name === 'tool.call.toolview')
    expect(toolviews.map(entry => entry.key)).toEqual(['image_generate', 'video_generate'])
  })

  it('registers the codex speed toggle in the composer tool row', () => {
    const { ctx, registrations } = createHarness()
    applySubscriptionsClient(ctx)

    const speed = registrations.find(entry => entry.name === 'conversation.input.right')
    expect(speed).toBeDefined()
    expect(speed?.id).toBe('codex-speed')
  })

  it('registers the /fast slash command', () => {
    const { ctx, commands } = createHarness()
    applySubscriptionsClient(ctx)

    expect(commands.some(cmd => cmd.name === 'fast')).toBe(true)
  })
})
