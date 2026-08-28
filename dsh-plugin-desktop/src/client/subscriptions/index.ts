/**
 * Subscription OAuth login, browser half. Every login state fact arrives
 * through the node half's `/subscriptions-auth` RPC channel — this plugin
 * holds no credential state of its own. Copy rides the client locale service:
 * one 'settings.subscriptions' namespace with zh/en dictionaries.
 *
 * The Subscriptions cards no longer own a settings nav entry: the combined
 * Providers section (`../providers.ts`) renders {@link SubscriptionsSection}
 * beneath its API-key list. This apply registers only the non-section
 * surfaces — the image/video toolviews, the composer Speed toggle, and the
 * `/fast` slash command. Provider usage is rendered by Agent Status in the
 * advanced shell.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ui-conversation's SlotMap merge (the 'conversation.input.right' entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the slash-command registry contract (the /fast contribution).
import type { CommandUiContract } from '@deepseek-ai/dsh-client-ui-commands/client'
import { ImageGenerateToolview, createImageLoader } from './ImageGenerateToolview.tsx'
import type { ImageGenerateToolviewInjected } from './ImageGenerateToolview.tsx'
import { VideoGenerateToolview, createVideoLoader } from './VideoGenerateToolview.tsx'
import type { VideoGenerateToolviewInjected } from './VideoGenerateToolview.tsx'
import { SpeedSelect, createSpeedLoader, createSpeedSetter } from './SpeedSelect.tsx'
import type { SpeedSelectInjected } from './SpeedSelect.tsx'
import { en, zh } from './locales.ts'
import type { SubscriptionsKey } from './locales.ts'

// The Subscriptions cards are composed into the combined Providers section
// (`ProvidersSection.tsx`), so the section component itself is re-exported
// rather than registered here.
import type { SubscriptionsSectionInjected } from './SubscriptionsSection.tsx'
export { SubscriptionsSection } from './SubscriptionsSection.tsx'
export type { SubscriptionsSectionInjected, SubscriptionsSectionProps } from './SubscriptionsSection.tsx'
export type { ImageGenerateToolviewInjected, ImageGenerateToolviewProps } from './ImageGenerateToolview.tsx'
export type { VideoGenerateToolviewInjected, VideoGenerateToolviewProps } from './VideoGenerateToolview.tsx'
export type { SpeedSelectInjected, SpeedSelectProps, SpeedState, SpeedTier } from './SpeedSelect.tsx'
export type { SubscriptionsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Subscriptions settings page copy. */
    'settings.subscriptions': SubscriptionsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.subscriptions'

/**
 * Required services (cordis fiber inject): `slots` carries the toolview and
 * composer registrations, `connection` the `/subscriptions-auth` RPC caller,
 * and `locale` the copy dictionaries.
 */
export const inject = ['slots', 'connection', 'locale']

/**
 * Register the Subscriptions toolviews, composer Speed toggle, and `/fast`
 * command. Provider usage is registered by the advanced Agent Status surface.
 * The section nav entry itself is owned by the combined Providers section; this
 * apply contributes no `settings.section`.
 * @param ctx - client root context.
 */
export function applySubscriptionsClient(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'desktop-subscriptions: copy dictionaries')
  // The client-runtime Context merge types `connection` as the host handle;
  // in the browser shell the same key holds the full client ConnectionHandle.
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const t = ctx.locale.bind(NS) as SubscriptionsSectionInjected['t']

  // The image_generate keyed toolview owns how image calls render inline; its
  // gallery bytes ride the same channel through the injected loader. The
  // framework synthesizes the toolview's own `t` seat from `locale: NS`.
  const toolviewInjected = (): ImageGenerateToolviewInjected => ({ load: createImageLoader(connection.rpc) })
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'image_generate',
    locale: NS,
    inject: toolviewInjected,
  }, ImageGenerateToolview))

  // The video_generate keyed toolview plays the saved MP4 inline; its bytes
  // ride the same channel's `video` endpoint through the injected loader.
  const videoToolviewInjected = (): VideoGenerateToolviewInjected => ({ loadVideo: createVideoLoader(connection.rpc) })
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'video_generate',
    locale: NS,
    inject: videoToolviewInjected,
  }, VideoGenerateToolview))

  // The composer Speed toggle (codex fast tier) sits in the right tool row,
  // just left of the model selector; the framework synthesizes its `t` seat
  // from `locale: NS`, and the inject face binds each session's RPC calls.
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'codex-speed',
    order: 0,
    locale: NS,
    inject: (sessionId: SessionId): SpeedSelectInjected => ({
      loadSpeed: createSpeedLoader(connection, sessionId),
      setSpeed: createSpeedSetter(connection, sessionId),
    }),
  }, SpeedSelect))

  // The /fast slash command offers the same Standard/Fast choice as a popup.
  // `available` is synchronous and sees only the session id, so the command
  // stays listed everywhere; `options` throws the friendly gate when the
  // session's current model is not a fast-capable codex model (the same
  // in-popup error posture the /model contribution uses for its guards).
  ctx.inject(['commandUi'], (scope) => {
    const command = scope.get('commandUi') as CommandUiContract
    scope.effect(() => command.register({
      name: 'fast',
      description: t('commandFast'),
      available: () => true,
      ui: {
        kind: 'popupSelect',
        options: async (session) => {
          const state = await createSpeedLoader(connection, session.sessionId)()
          if (!state.visible) throw new Error(t('commandFastUnavailable'))
          return ([
            { id: 'standard', label: t('speedStandard'), detail: t('speedStandardDescription') },
            { id: 'fast', label: t('speedFast'), detail: t('speedFastDescription') },
          ] as const).map(option => ({ ...option, active: option.id === state.tier }))
        },
        onSelect: async (option, session) => {
          await createSpeedSetter(connection, session.sessionId)(option.id as 'standard' | 'fast')
        },
      },
    }), 'desktop-subscriptions: /fast contribution')
  })
}
