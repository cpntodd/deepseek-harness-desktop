import { useCallback, useEffect, useId, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ChevronDown } from 'lucide-react'
import type { DesktopSettingsApi, DesktopSettingsView } from './desktop-settings-api.ts'

export type DesktopPluginListTabProps = PropsRuntime<'settings.plugins.tab'> & PropsLocale<'desktop.settings'> & { api: DesktopSettingsApi }

type Plugin = NonNullable<DesktopSettingsView['plugins']>[number]

export function DesktopPluginListTab({ api, t }: DesktopPluginListTabProps) {
  const [plugins, setPlugins] = useState<readonly Plugin[]>([])
  const [busy, setBusy] = useState<string>()
  const [expanded, setExpanded] = useState<string>()
  const [error, setError] = useState(false)
  const panelId = useId()
  const load = useCallback(async () => {
    try {
      const view = await api.read()
      setPlugins(view.plugins ?? [])
      setError(false)
    } catch { setError(true) }
  }, [api])
  useEffect(() => { void load() }, [load])
  const toggle = async (plugin: Plugin): Promise<void> => {
    setBusy(plugin.bundleId)
    try {
      const preview = await api.previewPlugin(plugin.status === 'active' ? 'disable' : 'enable', plugin.bundleId)
      const result = await api.executePlugin(preview.previewId)
      setPlugins(current => current.map(item => item.bundleId === plugin.bundleId
        ? { ...item, status: plugin.status === 'active' ? 'disabled' : 'active' }
        : item))
      void result
    } catch { setError(true) } finally { setBusy(undefined) }
  }
  if (error) return <p className="dshDesktopSettingsError" role="alert">{t('operationFailed')}</p>
  if (plugins.length === 0) return <p className="dshDesktopSettingsHint">{t('unavailable')}</p>
  return <div className="dshDesktopSettingsList">
    {plugins.map(plugin => {
      const open = expanded === plugin.bundleId
      const detailsId = `${panelId}-${plugin.bundleId}`
      return <div key={plugin.bundleId} className="dshDesktopSettingsPluginCard">
        <button
          type="button"
          className="dshDesktopSettingsPluginCardHeader"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => { setExpanded(current => current === plugin.bundleId ? undefined : plugin.bundleId) }}
        >
          <strong>{plugin.packageName}</strong>
          <span className="dshDesktopSettingsPluginCardState">{plugin.status === 'active' ? t('pluginEnabled') : t('pluginDisabled')}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
        {open ? <div id={detailsId} className="dshDesktopSettingsPluginCardDetails">
          <span>{plugin.status === 'active' ? t('pluginEnabled') : t('pluginDisabled')}</span>
          <button type="button" role="switch" aria-label={plugin.packageName} aria-checked={plugin.status === 'active'} disabled={!plugin.mutable || busy !== undefined} className="dshDesktopSettingsToggle" onClick={() => { void toggle(plugin) }}>
            <span className="dshDesktopSettingsToggleKnob" aria-hidden="true" />
          </button>
        </div> : null}
      </div>
    })}
  </div>
}
