import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from './contracts.ts'
import type { DesktopClientEnvironment } from './environment.ts'
import { AdvancedFrame } from './AdvancedFrame.tsx'
import { AgentStatusPanel } from './AgentStatusPanel.tsx'
import { DesktopLayoutState } from './layout-state.ts'
import { provideDesktopLayout } from './layout-service.ts'
import { installAdvancedStyles } from './styles.ts'
import { en, zh } from './desktop-status-locales.ts'
import { installDesktopStatusStyles } from './desktop-status-styles.ts'
import { DesktopThemePresenter } from './theme-presenter.ts'

/**
 * Provide the advanced layout service and own the desktop root slot.
 * @param ctx - active browser Cordis context.
 * @param environment - validated mode and platform marker.
 */
export function applyAdvancedShell(ctx: ClientContext, environment: DesktopClientEnvironment): void {
  if (environment.mode !== 'advanced') {
    throw new Error(`dsh-plugin-desktop: advanced shell received mode ${JSON.stringify(environment.mode)}`)
  }

  const desktopLayout = new DesktopLayoutState()
  ctx.effect(
    () => provideDesktopLayout(ctx, desktopLayout),
    'desktop: layout service',
  )

  ctx.effect(() => {
    document.body.dataset.dshDesktopMode = 'advanced'
    document.body.dataset.dshDesktopPlatform = environment.platform
    const removeStyles = installAdvancedStyles()
    return () => {
      removeStyles()
      delete document.body.dataset.dshDesktopMode
      delete document.body.dataset.dshDesktopPlatform
    }
  }, 'desktop: advanced shell styles')

  ctx.effect(() => {
    const presenter = new DesktopThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', snapshot => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'desktop: theme presenter')

  ctx.effect(() => ctx.slots.register({
    name: 'root',
    children: {
      'sidebar': { kind: 'single', scope: 'root' },
      'conversation': { kind: 'single', scope: 'session-maybe' },
      'details': { kind: 'single', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
    inject: () => ({
      layout: desktopLayout,
      platform: environment.platform,
      statusT: ctx.locale.bind('desktop.status'),
    }),
  }, AdvancedFrame), 'desktop: advanced root slot')

  // The desktop owns the right details surface in advanced mode: an agent
  // status panel (MCP + LSP + Todo + provider usage). It registers at a lower priority than the
  // upstream tool-call inspector so it shadows that occupant (slot shadowing).
  ctx.effect(
    () => ctx.locale.register('desktop.status', { en, zh }),
    'desktop: status dictionaries',
  )
  ctx.effect(
    () => installDesktopStatusStyles(),
    'desktop: status styles',
  )
  ctx.slots.inject('details', () => ctx.slots.register({
    name: 'details',
    priority: -1,
    locale: 'desktop.status',
    inject: () => ({
      closeDetails: () => { desktopLayout.closeDetails() },
      rpc: (ctx.get('connection') as ConnectionHandle).rpc,
      usageT: ctx.locale.bind('settings.subscriptions'),
    }),
  }, AgentStatusPanel))
}
