import { useEffect, useRef, useState } from 'react'
import { IconCordisPluginOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarketLocaleKey } from './locales.js'
import {
  executeMcpOperation,
  mutateMcpServer,
  previewMcpOperation,
  readMcpInstallations,
  readMcpServers,
} from './api.js'
import type {
  MarketMcpInstallationView,
  MarketMcpServerView,
  McpOperationPreviewResult,
} from '../api-types.js'
import { marketMediaAssetUrl } from '../media/ref.js'
import { MCP_REGISTRY_SOURCE_RECORD_ID } from '../mcp/contracts/identity.js'

/** MCP servers view: browse the registry, one-click install, enable/disable. */
export function McpView(props: {
  t: (key: MarketLocaleKey) => string
  locale: string
  requestRestart: (restartToken: string) => Promise<void>
}): React.JSX.Element {
  const { t } = props
  const [search, setSearch] = useState('')
  const [servers, setServers] = useState<readonly MarketMcpServerView[]>([])
  const [installations, setInstallations] = useState<readonly MarketMcpInstallationView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [preview, setPreview] = useState<McpOperationPreviewResult | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const controllerRef = useRef<AbortController | undefined>(undefined)

  const load = async (): Promise<void> => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError(undefined)
    try {
      const [catalog, installed] = await Promise.all([
        readMcpServers(search.trim() || undefined, props.locale, controller.signal),
        readMcpInstallations(controller.signal),
      ])
      setServers(catalog.servers)
      setInstallations(installed.installations)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'failed')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return () => { controllerRef.current?.abort() }
  }, [props.locale])

  const installedNames = new Set(installations.map(installation => installation.serverName))

  const install = async (server: MarketMcpServerView): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      // The MCP registry is a compiled-in source that is never part of the
      // catalog source list, so its id cannot be derived from enabled catalog
      // sources. The API response carries the authoritative id per server;
      // fall back to the compiled-in id when provenance is missing.
      const sourceRecordId = server.provenance.sourceRecordId || MCP_REGISTRY_SOURCE_RECORD_ID
      const result = await previewMcpOperation(sourceRecordId, server.id)
      setPreview(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'install failed')
    } finally {
      setBusy(false)
    }
  }

  const confirmInstall = async (): Promise<void> => {
    if (preview === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await executeMcpOperation(preview.previewId)
      setPreview(undefined)
      await props.requestRestart(result.restartToken)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'install failed')
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (installation: MarketMcpInstallationView): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await mutateMcpServer(installation.enabled ? 'disable' : 'enable', installation.serverName)
      await props.requestRestart(result.restartToken)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'toggle failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (installation: MarketMcpInstallationView): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await mutateMcpServer('remove', installation.serverName)
      await props.requestRestart(result.restartToken)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'uninstall failed')
    } finally {
      setBusy(false)
    }
  }

  const methodLabel = (method: { kind: string }): string => (
    method.kind === 'stdio' ? t('mcpMethodStdio') : t('mcpMethodHttp')
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--dsw-alias-border)',
            background: 'var(--dsw-alias-input-bg)',
            color: 'var(--dsw-alias-text)',
          }}
          value={search}
          placeholder={t('mcpSearch')}
          onChange={event => setSearch(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void load() }}
        />
        <button
          type="button"
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--dsw-alias-primary)',
            color: 'var(--dsw-alias-on-primary)',
          }}
          onClick={() => { void load() }}
        >
          {t('searchAction')}
        </button>
      </div>

      {error !== undefined && (
        <div style={{ color: 'var(--dsw-alias-error)', fontSize: '13px' }} role="alert">{error}</div>
      )}
      {loading && <div style={{ fontSize: '13px', opacity: 0.7 }}>{t('mcpLoading')}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!loading && servers.length === 0 && (
          <div style={{ fontSize: '13px', opacity: 0.7 }}>{t('mcpEmpty')}</div>
        )}
        {servers.map(server => {
          const installed = installedNames.has(server.name)
          const installation = installations.find(entry => entry.serverName === server.name)
          return (
            <div
              key={server.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--dsw-alias-border)',
                background: 'var(--dsw-alias-surface)',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
                  <div className="dshMarketGlyph">
                    <IconCordisPluginOutline14 size={20} />
                    {server.media?.icon !== undefined && (
                      <img
                        src={marketMediaAssetUrl(server.media.icon.assetRef)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={event => { event.currentTarget.remove() }}
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: '14px' }}>{server.displayName}</strong>
                    <div style={{ fontSize: '12px', opacity: 0.7 }}>{server.summary}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {installed && installation !== undefined ? (
                    <>
                      <span style={{ fontSize: '12px', opacity: 0.7 }}>
                        {installation.enabled ? t('mcpEnabled') : t('mcpDisabled')}
                      </span>
                      <button
                        type="button"
                        style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'var(--dsw-alias-surface-raised)' }}
                        disabled={busy}
                        onClick={() => { void toggle(installation) }}
                      >
                        {installation.enabled ? t('mcpDisable') : t('mcpEnable')}
                      </button>
                      <button
                        type="button"
                        style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'var(--dsw-alias-error)' }}
                        disabled={busy}
                        onClick={() => { void remove(installation) }}
                      >
                        {t('mcpRemove')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'var(--dsw-alias-primary)', color: 'var(--dsw-alias-on-primary)' }}
                      disabled={busy}
                      onClick={() => { void install(server) }}
                    >
                      {t('mcpInstall')}
                    </button>
                  )}
                </div>
              </div>
              {server.manualInstall !== undefined && (
                <div style={{ fontSize: '12px', opacity: 0.7 }}>{t('mcpManualHint')}</div>
              )}
            </div>
          )
        })}
      </div>

      {preview !== undefined && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '20px',
              borderRadius: '12px',
              background: 'var(--dsw-alias-surface)',
              border: '1px solid var(--dsw-alias-border)',
              maxWidth: '420px',
            }}
            role="dialog"
          >
            <strong>{preview.displayName}</strong>
            <div style={{ fontSize: '13px', opacity: 0.8 }}>
              {methodLabel(preview.method)}
            </div>
            {preview.method.kind === 'stdio'
              ? (
                  <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                    {preview.method.command} {preview.method.args.join(' ')}
                  </code>
                )
              : (
                  <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>{preview.method.url}</code>
                )}
            <div style={{ fontSize: '12px', opacity: 0.7 }}>{t('mcpRestartRequired')}</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: 'var(--dsw-alias-surface-raised)' }}
                disabled={busy}
                onClick={() => setPreview(undefined)}
              >
                {t('close')}
              </button>
              <button
                type="button"
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: 'var(--dsw-alias-primary)', color: 'var(--dsw-alias-on-primary)' }}
                disabled={busy}
                onClick={() => { void confirmInstall() }}
              >
                {busy ? '…' : t('mcpInstall')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
