/** Agent status panel styles, installed in advanced desktop mode only. */

const STYLE_ID = 'dsh-desktop-status-styles'

const CSS = `
.dshDesktopStatus {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 16px 14px;
  color: var(--dsw-alias-label-primary);
  box-sizing: border-box;
  overflow: hidden;
}
.dshDesktopStatusHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dshDesktopStatusTitle {
  margin: 0;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
.dshDesktopStatusClose {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dshDesktopStatusClose:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dshDesktopStatusBody {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
}
.dshDesktopStatusSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dshDesktopStatusSectionHead {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dshDesktopStatusSectionHead h3 {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dshDesktopStatusCount {
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dshDesktopStatusRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.dshDesktopStatusRowName {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 19px;
}
.dshDesktopStatusRowMeta {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dshDesktopStatusBadge {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}
.dshDesktopStatusBadge[data-state="enabled"] {
  color: var(--dsw-alias-state-success-primary);
  background: var(--dsw-alias-state-success-tertiary);
}
.dshDesktopStatusBadge[data-state="disabled"] {
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-3);
}
.dshDesktopStatusTodoRow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
}
.dshDesktopStatusTodoGlyph {
  display: grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  box-sizing: border-box;
}
.dshDesktopStatusTodoGlyphProgress {
  color: var(--dsw-alias-state-business-primary);
  animation: dsh-desktop-todo-progress-spin 1s linear infinite;
}
.dshDesktopStatusTodoGlyphCompleted {
  color: var(--dsw-alias-state-success-primary);
  font-size: 14px;
  line-height: 16px;
  font-weight: 700;
}
.dshDesktopStatusTodoGlyphPending {
  width: 14px;
  height: 14px;
  margin: 1px;
  border: 1.2px dashed var(--dsw-alias-label-caption);
  border-radius: 50%;
}
@keyframes dsh-desktop-todo-progress-spin {
  to { transform: rotate(360deg); }
}
.dshDesktopStatusTodoContent {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 19px;
}
.dshDesktopStatusEmpty,
.dshDesktopStatusLoading {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 19px;
}
`

/** Install and remove the agent status panel styles. @returns the style disposer. */
export function installDesktopStatusStyles(): () => void {
  const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin="${STYLE_ID}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
