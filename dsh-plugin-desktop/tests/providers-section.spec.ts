import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConfigurableProviderView, CredentialView } from '@deepseek-ai/dsh-api-remotes/client'
import { applyProvidersClient } from '../src/client/providers.ts'
import {
  apiKeyEnvOf,
  buildProviderRows,
  deriveKeyRef,
} from '../src/client/ProvidersSection.tsx'
import { en } from '../src/client/providers-locales.ts'

/**
 * A minimal ClientContext fake recording the `settings.section` registration,
 * mirroring client-desktop-settings.spec.ts: `slots.inject` invokes the mount
 * thunk and `slots.register` is a spy that captures the options.
 */
function createHarness(): { ctx: ClientContext; registrations: Array<Record<string, unknown>> } {
  const registrations: Array<Record<string, unknown>> = []
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
    get: vi.fn((key: string) => key === 'connection'
      ? { api: { llm: {}, credentials: {}, settings: {} }, rpc: vi.fn() }
      : undefined),
    slots: { inject, register },
  } as unknown as ClientContext
  return { ctx, registrations }
}

describe('Providers settings section registration', () => {
  it('registers the combined section shadowing upstream Models (id models, priority -1, order 10)', () => {
    const { ctx, registrations } = createHarness()
    applyProvidersClient(ctx)

    const section = registrations.find(entry => entry.name === 'settings.section')
    expect(section).toBeDefined()
    expect(section?.id).toBe('models')
    expect(section?.priority).toBe(-1)
    expect(section?.order).toBe(10)
    const label = section?.label as (() => string) | undefined
    expect(label?.()).toBe('Providers')
  })

  it('injects the api, rpc, and both translate faces', () => {
    const { ctx, registrations } = createHarness()
    applyProvidersClient(ctx)

    const section = registrations.find(entry => entry.name === 'settings.section')
    expect(section).toBeDefined()
    const inject = section?.inject as (() => Record<string, unknown>) | undefined
    const face = inject?.()
    expect(face).toHaveProperty('api')
    expect(face).toHaveProperty('rpc')
    expect(face).toHaveProperty('t')
    expect(face).toHaveProperty('subscriptionsT')
  })
})

describe('provider key helpers', () => {
  it('deriveKeyRef upper-cases and underscores the route', () => {
    expect(deriveKeyRef('deepseek-official')).toBe('DEEPSEEK_OFFICIAL_API_KEY')
    expect(deriveKeyRef('minimax-cn')).toBe('MINIMAX_CN_API_KEY')
  })

  it('apiKeyEnvOf reads a profile reference from a namespace value', () => {
    const namespace = { value: { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY' } } } }
    expect(apiKeyEnvOf(namespace, ['providers', 'openai'])).toBe('OPENAI_API_KEY')
    expect(apiKeyEnvOf(namespace, ['providers', 'missing'])).toBeUndefined()
    expect(apiKeyEnvOf({ value: { apiKeyEnv: 'DEEPSEEK_API_KEY' } }, [])).toBe('DEEPSEEK_API_KEY')
    expect(apiKeyEnvOf(undefined, [])).toBeUndefined()
  })

  it('buildProviderRows derives refs from apiKeyEnv or the conventional reference', () => {
    const providers: ConfigurableProviderView[] = [
      { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true },
      { provider: 'openai', displayName: 'OpenAI', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: true },
    ]
    const namespaces = new Map<string, { value: unknown }>([
      ['llm-deepseek', { value: { apiKeyEnv: 'DEEPSEEK_API_KEY' } }],
      ['llm-pi-ai', { value: { providers: {} } }],
    ])
    const credentials: Record<string, CredentialView> = {
      DEEPSEEK_API_KEY: { configured: true, writable: true },
    }

    const rows = buildProviderRows(providers, namespaces, credentials)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.ref).toBe('DEEPSEEK_API_KEY')
    expect(rows[0]?.configured).toBe(true)
    expect(rows[1]?.ref).toBe('OPENAI_API_KEY')
    expect(rows[1]?.configured).toBe(false)
  })
})
