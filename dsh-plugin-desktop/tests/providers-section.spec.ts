import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConfigurableProviderView, CredentialView } from '@deepseek-ai/dsh-api-remotes/client'
import { applyProvidersClient } from '../src/client/providers.ts'
import {
  apiKeyEnvOf,
  buildProviderRows,
  deriveKeyRef,
  sortProviderRowsByName,
  SUBSCRIPTION_PROVIDER_IDS,
  validateProviderRoute,
} from '../src/client/ProvidersSection.tsx'
import type { ProviderKeyRow } from '../src/client/ProvidersSection.tsx'
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

/** A configured credential view (writable, no source). */
const configured: CredentialView = { configured: true, writable: true }

/** Build a minimal directory entry for a provider route. */
function makeProvider(
  id: string,
  displayName: string,
  settingsNs = 'llm-pi-ai',
  settingsPath: string[] = [],
): ConfigurableProviderView {
  return { provider: id, displayName, settingsNs, settingsPath, active: true }
}

describe('Providers settings section registration', () => {
  it('registers the combined Models section (id models, priority -1, order 10)', () => {
    const { ctx, registrations } = createHarness()
    applyProvidersClient(ctx)

    const section = registrations.find(entry => entry.name === 'settings.section')
    expect(section).toBeDefined()
    expect(section?.id).toBe('models')
    expect(section?.priority).toBe(-1)
    expect(section?.order).toBe(10)
    const label = section?.label as (() => string) | undefined
    expect(label?.()).toBe('Models')
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

  it('validateProviderRoute accepts lowercase route ids with single hyphens', () => {
    expect(validateProviderRoute('my-provider')).toBe(true)
    expect(validateProviderRoute('openai')).toBe(true)
    expect(validateProviderRoute('a')).toBe(true)
    expect(validateProviderRoute('grok-4-5')).toBe(true)
  })

  it('validateProviderRoute rejects uppercase, separators, and empty routes', () => {
    expect(validateProviderRoute('My-Provider')).toBe(false)
    expect(validateProviderRoute('my_provider')).toBe(false)
    expect(validateProviderRoute('-leading')).toBe(false)
    expect(validateProviderRoute('trailing-')).toBe(false)
    expect(validateProviderRoute('')).toBe(false)
    expect(validateProviderRoute('with space')).toBe(false)
  })

  it('apiKeyEnvOf reads a profile reference from a namespace value', () => {
    const namespace = { value: { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY' } } } }
    expect(apiKeyEnvOf(namespace, ['providers', 'openai'])).toBe('OPENAI_API_KEY')
    expect(apiKeyEnvOf(namespace, ['providers', 'missing'])).toBeUndefined()
    expect(apiKeyEnvOf({ value: { apiKeyEnv: 'DEEPSEEK_API_KEY' } }, [])).toBe('DEEPSEEK_API_KEY')
    expect(apiKeyEnvOf(undefined, [])).toBeUndefined()
  })

  it('buildProviderRows keeps only configured, non-subscription providers', () => {
    const providers: ConfigurableProviderView[] = [
      makeProvider('deepseek-official', 'DeepSeek', 'llm-deepseek'),
      makeProvider('anthropic', 'Anthropic', 'llm-anthropic'),
      makeProvider('openai', 'OpenAI'),
    ]
    const namespaces = new Map<string, { value: unknown }>([
      ['llm-deepseek', { value: { apiKeyEnv: 'DEEPSEEK_API_KEY' } }],
      ['llm-anthropic', { value: { apiKeyEnv: 'ANTHROPIC_API_KEY' } }],
      ['llm-pi-ai', { value: { providers: {} } }],
    ])
    const credentials: Record<string, CredentialView> = {
      DEEPSEEK_API_KEY: configured,
      ANTHROPIC_API_KEY: configured,
      // openai → OPENAI_API_KEY is unconfigured and must be dropped.
    }

    const rows = buildProviderRows(providers, namespaces, credentials)

    expect(rows.map(row => row.provider.provider)).toEqual(['deepseek-official', 'anthropic'])
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.configured)).toBe(true)
  })

  it('buildProviderRows can include unconfigured providers for the add selector', () => {
    const providers = [makeProvider('openai', 'OpenAI')]
    expect(buildProviderRows(providers, new Map(), {}, true)).toHaveLength(1)
  })

  it('buildProviderRows excludes subscription providers even when configured', () => {
    const providers: ConfigurableProviderView[] = [
      makeProvider('anthropic', 'Anthropic', 'llm-anthropic'),
      ...SUBSCRIPTION_PROVIDER_IDS.map(id => makeProvider(id, id)),
    ]
    const namespaces = new Map<string, { value: unknown }>([
      ['llm-anthropic', { value: { apiKeyEnv: 'ANTHROPIC_API_KEY' } }],
    ])
    const credentials: Record<string, CredentialView> = {
      ANTHROPIC_API_KEY: configured,
      CODEX_API_KEY: configured,
      CLAUDE_API_KEY: configured,
      GROK_API_KEY: configured,
      OPENAI_CODEX_API_KEY: configured,
    }

    const rows = buildProviderRows(providers, namespaces, credentials)

    expect(rows.map(row => row.provider.provider)).toEqual(['anthropic'])
    for (const id of SUBSCRIPTION_PROVIDER_IDS) {
      expect(rows.some(row => row.provider.provider === id)).toBe(false)
    }
  })

  it('buildProviderRows deduplicates same-service routes differing only by case', () => {
    const providers: ConfigurableProviderView[] = [
      makeProvider('deepseek-official', 'DeepSeek', 'llm-deepseek'),
      makeProvider('deepseek', 'deepseek', 'llm-pi-ai', ['providers', 'deepseek']),
      makeProvider('anthropic', 'Anthropic', 'llm-anthropic'),
    ]
    const namespaces = new Map<string, { value: unknown }>([
      ['llm-deepseek', { value: {} }],
      ['llm-pi-ai', { value: { providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' } } } }],
      ['llm-anthropic', { value: { apiKeyEnv: 'ANTHROPIC_API_KEY' } }],
    ])
    const credentials: Record<string, CredentialView> = {
      DEEPSEEK_OFFICIAL_API_KEY: configured,
      ANTHROPIC_API_KEY: configured,
    }

    const rows = buildProviderRows(providers, namespaces, credentials)

    // Both routes display the same service name differing only by case
    // ("DeepSeek" vs "deepseek"); the case-insensitive display-name dedupe
    // keeps the first directory entry (deepseek-official) and drops the
    // generic `deepseek` duplicate.
    expect(rows.map(row => row.provider.provider)).toEqual(['deepseek-official', 'anthropic'])
    expect(rows.some(row => row.provider.provider === 'deepseek')).toBe(false)
  })

  it('buildProviderRows derives refs from apiKeyEnv or the conventional reference', () => {
    const providers: ConfigurableProviderView[] = [
      makeProvider('deepseek-official', 'DeepSeek', 'llm-deepseek'),
      makeProvider('anthropic', 'Anthropic', 'llm-anthropic'),
    ]
    const namespaces = new Map<string, { value: unknown }>([
      ['llm-deepseek', { value: { apiKeyEnv: 'DEEPSEEK_API_KEY' } }],
      ['llm-anthropic', { value: {} }],
    ])
    const credentials: Record<string, CredentialView> = {
      DEEPSEEK_API_KEY: configured,
      ANTHROPIC_API_KEY: configured,
    }

    const rows = buildProviderRows(providers, namespaces, credentials)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.ref).toBe('DEEPSEEK_API_KEY')
    expect(rows[0]?.configured).toBe(true)
    expect(rows[1]?.ref).toBe('ANTHROPIC_API_KEY')
    expect(rows[1]?.configured).toBe(true)
  })

  it('sortProviderRowsByName orders by display name case-insensitively', () => {
    const rows: ProviderKeyRow[] = [
      { provider: makeProvider('z', 'Zebra'), ref: 'ZEBRA_API_KEY', configured: true },
      { provider: makeProvider('a', 'alpha'), ref: 'ALPHA_API_KEY', configured: true },
      { provider: makeProvider('m', 'MiXeD'), ref: 'MIXED_API_KEY', configured: true },
    ]

    expect(sortProviderRowsByName(rows).map(row => row.provider.displayName)).toEqual(['alpha', 'MiXeD', 'Zebra'])
  })
})
