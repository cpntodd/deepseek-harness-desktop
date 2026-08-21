/**
 * Combined "Providers" settings section: the desktop-owned API-key provider
 * list (top) plus the OAuth subscription cards (bottom, the existing
 * `SubscriptionsSection` composed in). The API-key list reads the
 * configurable-provider directory, settings namespaces, and credential state
 * over the connection API, and writes keys through `credentials.set` — plus
 * an `apiKeyEnv` credential reference on `llm-pi-ai` profiles via
 * `settings.mutate`, mirroring the upstream Models page's core interaction.
 * It deliberately does NOT replicate custom-provider declaration, onboarding
 * dialogs, model discovery, or baseURL/catalog editing.
 *
 * Every color resolves through a `--dsw-alias-*` design token and every
 * user-visible string through the locale-bound `t` of the 'settings.providers'
 * namespace, matching SubscriptionsSection's visual language.
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type {
  ConfigurableProviderView,
  ConnectionHandle,
  CredentialView,
  IApiClient,
  SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { SubscriptionsSection } from './subscriptions/SubscriptionsSection.tsx'
import type { SubscriptionsSectionInjected } from './subscriptions/SubscriptionsSection.tsx'
import { en } from './providers-locales.ts'
import type { ProvidersKey } from './providers-locales.ts'

/** Conventional credential reference for a provider route (mirrors the upstream Models store). */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/**
 * Read a provider profile's `apiKeyEnv` credential reference from a settings
 * namespace's redacted value. `apiKeyEnv` carries role `credential-ref` (not
 * `secret`), so it survives the redaction a settings read applies.
 * @param namespace - the owning namespace's value view, or undefined.
 * @param settingsPath - path from the section root to the profile object.
 * @returns the named reference, or undefined when the profile names none.
 */
export function apiKeyEnvOf(
  namespace: { value: unknown } | undefined,
  settingsPath: readonly string[],
): string | undefined {
  if (namespace === undefined) return undefined
  let node: unknown = namespace.value
  for (const segment of settingsPath) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  if (typeof node === 'object' && node !== null) {
    const ref = (node as { apiKeyEnv?: unknown }).apiKeyEnv
    if (typeof ref === 'string' && ref.length > 0) return ref
  }
  return undefined
}

/** One provider row the API-key list renders. */
export interface ProviderKeyRow {
  /** The directory entry (route id, display name, settings address, live state). */
  provider: ConfigurableProviderView
  /** The credential reference the key for this provider is stored under. */
  ref: string
  /** Whether the reference currently holds a stored credential. */
  configured: boolean
}

/**
 * Join the provider directory with the resolved credential references and
 * their configured state, deriving the reference each profile resolves keys
 * through (its `apiKeyEnv`, or the conventional `<ROUTE>_API_KEY`).
 * @param providers - directory entries from `llm.providers`.
 * @param namespaces - settings namespace values keyed by `ns`.
 * @param credentials - credential views keyed by reference.
 * @returns one row per directory entry.
 */
export function buildProviderRows(
  providers: readonly ConfigurableProviderView[],
  namespaces: ReadonlyMap<string, { value: unknown }>,
  credentials: Readonly<Record<string, CredentialView>>,
): ProviderKeyRow[] {
  return providers.map((entry) => {
    const ref = apiKeyEnvOf(namespaces.get(entry.settingsNs), entry.settingsPath)
      ?? deriveKeyRef(entry.provider)
    return { provider: entry, ref, configured: credentials[ref]?.configured === true }
  })
}

/** Injected dependencies of {@link ProvidersSection} (slot `inject`). */
export interface ProvidersSectionInjected {
  /** Shared API client (directory/settings/credential wire faces). */
  api: IApiClient
  /** Generic logical-RPC caller for the composed Subscriptions cards. */
  rpc: ConnectionHandle['rpc']
  /** Page copy: translate a 'settings.providers' key. */
  t: (key: ProvidersKey, params?: Record<string, unknown>) => string
  /** Subscriptions copy: translate a 'settings.subscriptions' key. */
  subscriptionsT: SubscriptionsSectionInjected['t']
}

/** Props delivered by the slot outlet (the inject face spread flat). */
export type ProvidersSectionProps = Partial<ProvidersSectionInjected>

/** English-dictionary fallback for a missing inject `t` (standalone renders). */
function fallbackTranslate(key: ProvidersKey): string {
  return en[key]
}

/** Human text of a rejected wire call. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const styles: Record<string, CSSProperties> = {
  section: {
    display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560,
    color: 'var(--dsw-alias-label-primary)',
  },
  title: { margin: 0, fontSize: 16, fontWeight: 600, lineHeight: '24px', color: 'var(--dsw-alias-label-primary)' },
  intro: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 14, lineHeight: '22px' },
  group: { display: 'flex', flexDirection: 'column', gap: 8 },
  groupTitle: { margin: 0, fontSize: 14, fontWeight: 500, lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' },
  hint: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  error: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' },
  card: {
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12,
    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  name: { fontWeight: 500, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' },
  statusLine: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  form: { display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' },
  input: {
    flex: 1, height: 32, boxSizing: 'border-box',
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8,
    padding: '0 10px', font: 'inherit', fontSize: 14, lineHeight: '22px',
    background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
  },
  button: {
    boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: 28, padding: '0 10px', borderRadius: 14,
    border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
    color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, lineHeight: '18px',
    cursor: 'pointer',
  },
}

/** Status dot color for one provider's configured state. */
function dotColor(configured: boolean): string {
  return configured ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-dimmed)'
}

/**
 * Render the combined Providers page.
 * @param props - the slot inject face ({@link ProvidersSectionInjected}).
 * @returns the page body, or a notice while the RPC face is absent.
 */
export function ProvidersSection(props: ProvidersSectionProps) {
  const { api, rpc, subscriptionsT } = props
  const t = props.t ?? fallbackTranslate
  const [rows, setRows] = useState<ProviderKeyRow[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  const load = useCallback(async (): Promise<void> => {
    if (api === undefined) return
    setStatus('loading')
    setError(undefined)
    try {
      const [providersResponse, settingsResponse] = await Promise.all([
        api.llm.providers({}),
        api.settings.describe({}),
      ])
      if (!providersResponse.result.ok) throw new Error(providersResponse.result.error.message)
      if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
      const providers = providersResponse.result.value.providers
      const namespaces = new Map<string, SettingsNamespaceView>(
        settingsResponse.result.value.namespaces.map(ns => [ns.ns, ns]),
      )
      const refs = [...new Set(providers.map(entry =>
        apiKeyEnvOf(namespaces.get(entry.settingsNs), entry.settingsPath) ?? deriveKeyRef(entry.provider)))]
      const credentialsResponse = await api.credentials.describe({ refs })
      if (!credentialsResponse.result.ok) throw new Error(credentialsResponse.result.error.message)
      setRows(buildProviderRows(providers, namespaces, credentialsResponse.result.value.credentials))
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(messageOf(err))
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const saveKey = useCallback(async (row: ProviderKeyRow): Promise<void> => {
    if (api === undefined) return
    const value = (drafts[row.provider.provider] ?? '').trim()
    if (value.length === 0) return
    setSaving(prev => ({ ...prev, [row.provider.provider]: true }))
    setSaved(prev => ({ ...prev, [row.provider.provider]: false }))
    setError(undefined)
    try {
      const stored = await api.credentials.set({ ref: row.ref, value })
      if (!stored.result.ok) throw new Error(stored.result.error.message)
      // A pi-ai profile that names no credential reference yet must record
      // the derived reference the key was stored under, so the resolver finds
      // it. Other profiles already name their reference (schema default or a
      // prior write), so nothing needs the profile touched.
      if (row.provider.settingsNs === 'llm-pi-ai'
        && row.provider.settingsPath.length > 0
        && row.ref === deriveKeyRef(row.provider.provider)) {
        const mutate = await api.settings.mutate({
          ns: row.provider.settingsNs,
          ops: [{ op: 'set', path: [...row.provider.settingsPath, 'apiKeyEnv'], value: row.ref }],
        })
        if (!mutate.result.ok) throw new Error(mutate.result.error.message)
      }
      setDrafts(prev => ({ ...prev, [row.provider.provider]: '' }))
      setSaved(prev => ({ ...prev, [row.provider.provider]: true }))
      setRows(prev => prev.map(entry => entry.provider.provider === row.provider.provider
        ? { ...entry, configured: true }
        : entry))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(prev => ({ ...prev, [row.provider.provider]: false }))
    }
  }, [api, drafts])

  if (api === undefined || rpc === undefined) {
    return <div style={styles.section}><p style={styles.intro}>{t('unavailable')}</p></div>
  }

  return (
    <div style={styles.section}>
      <h2 style={styles.title}>{t('title')}</h2>
      <p style={styles.intro}>{t('intro')}</p>

      <section style={styles.group}>
        <h3 style={styles.groupTitle}>{t('apiKeysTitle')}</h3>
        <p style={styles.intro}>{t('apiKeysIntro')}</p>
        {error !== undefined && (
          <p style={styles.error} role="alert">{error}</p>
        )}
        {status === 'loading' && <p style={styles.hint}>{t('loading')}</p>}
        {status === 'error' && (
          <div>
            <p style={styles.error} role="alert">{`${t('loadFailed')}${error === undefined ? '' : ` ${error}`}`}</p>
            <button type="button" style={styles.button} onClick={() => { void load() }}>{t('retry')}</button>
          </div>
        )}
        {rows.map((row) => {
          const draft = drafts[row.provider.provider] ?? ''
          const busy = saving[row.provider.provider] === true
          return (
            <div key={row.provider.provider} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={{ ...styles.dot, background: dotColor(row.configured) }} />
                <span style={styles.name}>{row.provider.displayName}</span>
              </div>
              <p style={styles.statusLine}>{row.configured ? t('configured') : t('notConfigured')}</p>
              {saved[row.provider.provider] === true && <p style={styles.statusLine}>{t('keySaved')}</p>}
              <div style={styles.form}>
                <input
                  style={styles.input}
                  type="password"
                  autoComplete="off"
                  value={draft}
                  aria-label={`${t('keyLabel')} — ${row.provider.displayName}`}
                  placeholder={t('keyPlaceholder')}
                  disabled={busy}
                  onChange={event => setDrafts(prev => ({ ...prev, [row.provider.provider]: event.target.value }))}
                />
                <button
                  type="button"
                  style={styles.button}
                  disabled={busy || draft.trim().length === 0}
                  onClick={() => { void saveKey(row) }}
                >
                  {busy ? t('savingKey') : t('saveKey')}
                </button>
              </div>
            </div>
          )
        })}
      </section>

      <section style={styles.group}>
        <h3 style={styles.groupTitle}>{t('subscriptionsTitle')}</h3>
        <SubscriptionsSection
          rpc={rpc}
          {...subscriptionsT === undefined ? {} : { t: subscriptionsT }}
        />
      </section>
    </div>
  )
}
