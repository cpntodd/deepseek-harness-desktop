/**
 * Agent status panel: the desktop-owned replacement for the right details
 * surface. Renders an auto-expanding vertical stack of the live MCP servers,
 * configured LSP providers, and the current session's todos. Data is read
 * from the same-origin desktop status API (MCP + LSP) and the session's
 * `todos` projection; the panel owns no subscription machinery.
 */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import {
  readDesktopLspStatus,
  readDesktopMcpStatus,
  type DesktopLspProviderView,
  type DesktopMcpServerView,
} from './desktop-status-api.ts'

/** Registration-side business face for the status panel. */
export interface AgentStatusPanelInjected {
  readonly closeDetails: () => void
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
          <div key={item.content} className="dshDesktopStatusTodoRow">
            <span className="dshDesktopStatusTodoDot" data-status={item.status} />
            <span className="dshDesktopStatusTodoContent">{item.content}</span>
          </div>
        ))}
    </section>
  )
}

export function AgentStatusPanel({ sessionId, useProjection, t, closeDetails }: AgentStatusPanelProps) {
  const [mcp, setMcp] = useState<readonly DesktopMcpServerView[]>([])
  const [lsp, setLsp] = useState<readonly DesktopLspProviderView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const controllerRef = useRef<AbortController | undefined>(undefined)
  const todos = useProjection('todos')

  const load = async (): Promise<void> => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError(undefined)
    try {
      const [mcpResult, lspResult] = await Promise.all([
        readDesktopMcpStatus(controller.signal),
        readDesktopLspStatus(controller.signal),
      ])
      if (controller.signal.aborted) return
      setMcp(mcpResult.installations)
      setLsp(lspResult.providers)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'failed')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  // Refresh when the session changes and whenever the todo projection changes
  // (a proxy for "the agent made progress", which can add/activate servers).
  useEffect(() => {
    void load()
    return () => { controllerRef.current?.abort() }
  }, [sessionId, todos])

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
        {error !== undefined && <div className="dshDesktopStatusLoading" role="alert">{t('error')}</div>}
        {loading && <div className="dshDesktopStatusLoading">{t('loading')}</div>}
        <McpSection servers={mcp} t={t} />
        <LspSection providers={lsp} t={t} />
        <TodoSection todos={todos ?? []} t={t} />
      </div>
    </div>
  )
}
