/**
 * Agent status panel: the desktop-owned replacement for the right details
 * surface. Renders an auto-expanding vertical stack of the live MCP servers,
 * configured LSP providers, and the current session's todos. Data is read
 * from the same-origin desktop status API (MCP + LSP) and the session's
 * `todos` projection; the panel owns no subscription machinery.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import { ActiveUsageMeter, type ActiveUsageMeterProps } from './subscriptions/SubscriptionsSection.tsx'
import {
  readDesktopLspStatus,
  readDesktopMcpStatus,
  type DesktopLspProviderView,
  type DesktopMcpServerView,
} from './desktop-status-api.ts'

/** Registration-side business face for the status panel. */
export interface AgentStatusPanelInjected {
  readonly closeDetails: () => void
  readonly rpc: ActiveUsageMeterProps['rpc']
  readonly usageT: ActiveUsageMeterProps['t']
}

/** Renderer-composed props for the details status panel entry. */
export type AgentStatusPanelProps =
  PropsRuntime<'details'>
  & PropsLocale<'desktop.status'>
  & AgentStatusPanelInjected

function McpBadge({ enabled, t }: { enabled: boolean; t: AgentStatusPanelProps['t'] }) {
  return (
    <span className="dshDesktopStatusBadge" data-state={enabled ? 'enabled' : 'disabled'}>
      {t(enabled ? 'enabled' : 'disabled')}
    </span>
  )
}

function McpSection({ servers, t }: { servers: readonly DesktopMcpServerView[]; t: AgentStatusPanelProps['t'] }) {
  return (
    <section className="dshDesktopStatusSection">
      <div className="dshDesktopStatusSectionHead">
        <h3>{t('mcp')}</h3>
        <span className="dshDesktopStatusCount">{servers.length}</span>
      </div>
      {servers.length === 0
        ? <div className="dshDesktopStatusEmpty">{t('empty')}</div>
        : servers.map(server => (
          <div key={server.serverName} className="dshDesktopStatusRow">
            <span className="dshDesktopStatusRowName">{server.displayName}</span>
            <McpBadge enabled={server.enabled} t={t} />
          </div>
        ))}
    </section>
  )
}

function LspSection({ providers, t }: { providers: readonly DesktopLspProviderView[]; t: AgentStatusPanelProps['t'] }) {
  return (
    <section className="dshDesktopStatusSection">
      <div className="dshDesktopStatusSectionHead">
        <h3>{t('lsp')}</h3>
        <span className="dshDesktopStatusCount">{providers.length}</span>
      </div>
      {providers.length === 0
        ? <div className="dshDesktopStatusEmpty">{t('empty')}</div>
        : providers.map(provider => (
          <div key={provider.id} className="dshDesktopStatusRow">
            <span className="dshDesktopStatusRowName">{provider.displayName}</span>
            <span className="dshDesktopStatusRowMeta">{provider.languages.join(', ')}</span>
          </div>
        ))}
    </section>
  )
}

function TodoStatusGlyph({ status }: { status: TodoItem['status'] }) {
  const gradientId = useId()
  if (status === 'in_progress') {
    return (
      <svg className="dshDesktopStatusTodoGlyph dshDesktopStatusTodoGlyphProgress" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="2.5" y1="12" x2="10.5" y2="3.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="currentColor" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="7" cy="7" r="6.4" stroke={`url(#${gradientId})`} strokeWidth="1.2" />
      </svg>
    )
  }
  if (status === 'completed') {
    return <span className="dshDesktopStatusTodoGlyph dshDesktopStatusTodoGlyphCompleted" aria-hidden="true">✓</span>
  }
  return <span className="dshDesktopStatusTodoGlyph dshDesktopStatusTodoGlyphPending" aria-hidden="true" />
}

function TodoSection({ todos, t }: { todos: readonly TodoItem[]; t: AgentStatusPanelProps['t'] }) {
  return (
    <section className="dshDesktopStatusSection">
      <div className="dshDesktopStatusSectionHead">
        <h3>{t('todo')}</h3>
        <span className="dshDesktopStatusCount">{todos.length}</span>
      </div>
      {todos.length === 0
        ? <div className="dshDesktopStatusEmpty">{t('todoEmpty')}</div>
        : todos.map(item => (
          <div key={item.content} className="dshDesktopStatusTodoRow" data-status={item.status}>
            <TodoStatusGlyph status={item.status} />
            <span className="dshDesktopStatusTodoContent">{item.content}</span>
          </div>
        ))}
    </section>
  )
}

export function AgentStatusPanel({ sessionId, useProjection, t, closeDetails, rpc, usageT }: AgentStatusPanelProps) {
  const [mcp, setMcp] = useState<readonly DesktopMcpServerView[]>([])
  const [lsp, setLsp] = useState<readonly DesktopLspProviderView[]>([])
  const controllerRef = useRef<AbortController | undefined>(undefined)
  const mountedRef = useRef(true)
  const todos = useProjection('todos')

  const load = async (): Promise<void> => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const [mcpResult, lspResult] = await Promise.allSettled([
        readDesktopMcpStatus(controller.signal),
        readDesktopLspStatus(controller.signal),
      ])
      if (controller.signal.aborted || !mountedRef.current) return
      if (mcpResult.status === 'fulfilled') setMcp(mcpResult.value.installations)
      if (lspResult.status === 'fulfilled') setLsp(lspResult.value.providers)
    } catch {
      // Status refresh is best-effort; retain the last settled panel snapshot.
    }
  }

  // Refresh on session changes and at a modest cadence while the panel is
  // open. The projection is intentionally not an effect dependency: some
  // projection implementations return a fresh object on every frame, which
  // would abort/restart the request loop and prevent live facts settling.
  useEffect(() => {
    mountedRef.current = true
    void load()
    const timer = window.setInterval(() => { void load() }, 20_000)
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
      controllerRef.current?.abort()
    }
  }, [sessionId])

  return (
    <div className="dshDesktopStatus" role="region" aria-label={t('title')}>
      <div className="dshDesktopStatusHeader">
        <h2 className="dshDesktopStatusTitle">{t('title')}</h2>
        <button
          type="button"
          className="dshDesktopStatusClose"
          aria-label={t('close')}
          onClick={() => { closeDetails() }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="dshDesktopStatusBody">
        <section className="dshDesktopStatusSection dshDesktopStatusUsageSection">
          <div className="dshDesktopStatusSectionHead">
            <h3>{t('usage')}</h3>
          </div>
          <ActiveUsageMeter rpc={rpc} t={usageT} sessionId={sessionId} />
        </section>
        <McpSection servers={mcp} t={t} />
        <LspSection providers={lsp} t={t} />
        <TodoSection todos={todos ?? []} t={t} />
      </div>
    </div>
  )
}
