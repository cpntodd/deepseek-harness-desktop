/**
 * Combined "Providers" settings section, browser half. It registers one
 * `settings.section` entry shadowing the upstream Models section (same list
 * id `models`, lower priority) and composes the desktop-owned API-key list
 * with the existing Subscriptions OAuth cards.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ProvidersSection } from './ProvidersSection.tsx'
import type { ProvidersSectionInjected } from './ProvidersSection.tsx'
import type { SubscriptionsSectionInjected } from './subscriptions/SubscriptionsSection.tsx'
import { en, zh } from './providers-locales.ts'
import type { ProvidersKey } from './providers-locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The combined Providers page copy. */
    'settings.providers': ProvidersKey
  }
}

/** Dictionary namespace owned by the combined Providers section. */
const NS = 'settings.providers'
/** The Subscriptions cards reuse their existing dictionary namespace. */
const SUBSCRIPTIONS_NS = 'settings.subscriptions'

/**
 * Register the combined Providers section once the `settings.section`
 * declaration is on the ledger. The upstream Models section registers the
 * same list id (`models`) at `priority: 0`; registering at `priority: -1`
 * shadows it (a list cell's lowest-priority live entry renders), so this page
 * replaces the upstream Models page in the flat settings nav while keeping the
 * shell's `models` data icon and the nav position (`order: 10`).
 * @param ctx - client root context.
 */
export function applyProvidersClient(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'desktop-providers: copy dictionaries')
  // The client-runtime Context merge types `connection` as the host handle;
  // in the browser shell the same key holds the full client ConnectionHandle.
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const t = ctx.locale.bind(NS) as ProvidersSectionInjected['t']
  const subscriptionsT = ctx.locale.bind(SUBSCRIPTIONS_NS) as SubscriptionsSectionInjected['t']
  const injected = (): ProvidersSectionInjected => ({
    api: connection.api,
    rpc: connection.rpc,
    t,
    subscriptionsT,
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'models',
    order: 10,
    priority: -1,
    // A thunk re-evaluated per read, so the nav label follows the active locale.
    label: () => t('nav'),
    inject: injected,
  }, ProvidersSection))
}
