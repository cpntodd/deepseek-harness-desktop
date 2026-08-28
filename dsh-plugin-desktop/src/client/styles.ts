import {
  MACOS_DRAG_REGION_HEIGHT,
  MACOS_TITLEBAR_HEIGHT,
  MACOS_TRAFFIC_LIGHT_SAFE_WIDTH,
  WINDOWS_CAPTION_CONTROLS_WIDTH,
  WINDOWS_TITLEBAR_HEIGHT,
} from '../window-chrome.ts'
import { SIDEBAR_COLLAPSED } from './layout-state.ts'

/** Advanced-shell stylesheet kept as a plain string so the package client bundle stays self-contained. */
const ADVANCED_STYLES = `
html, body, #root { width: 100%; height: 100%; }
body[data-dsh-desktop-mode="advanced"] { margin: 0; background: transparent !important; }
.dshDesktopFrame { position: relative; display: grid; grid-template-rows: 100%; width: 100%; height: 100%; overflow: hidden; background: transparent; transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopSidebarSurface { --dsw-specific-sidebar-fill: transparent; position: relative; grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; background: transparent; border-right: 1px solid var(--dsw-alias-border-l1); }
.dshDesktopUpstreamSidebar { box-sizing: border-box; width: 100%; height: 100%; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopUpstreamSidebar { padding-top: ${MACOS_TITLEBAR_HEIGHT}px; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"][data-sidebar-collapsed] .dshDesktopUpstreamSidebar { width: ${SIDEBAR_COLLAPSED}px; margin: 0 auto; }
.dshDesktopFrame[data-desktop-platform="darwin"] { grid-template-rows: ${MACOS_TITLEBAR_HEIGHT}px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface { grid-row: 1 / -1; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface::before { content: ""; position: absolute; top: 0; right: 0; left: ${MACOS_TRAFFIC_LIGHT_SAFE_WIDTH}px; height: ${MACOS_DRAG_REGION_HEIGHT}px; user-select: none; -webkit-app-region: drag; }
.dshDesktopMacCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopMacCaptionRow::before { content: ""; position: absolute; top: 0; right: 0; left: 0; height: ${MACOS_DRAG_REGION_HEIGHT}px; user-select: none; -webkit-app-region: drag; }
.dshDesktopConversationSurface { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); }
.dshDesktopDetailsSurface { grid-column: 3; grid-row: 1; min-width: 0; min-height: 0; overflow: hidden; background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l2); }
/* Advanced mode renders session metrics in Agent Status below the usage bars;
   remove the upstream dock copy so its single-line ellipsis cannot remain visible. */
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] {
  display: none !important;
}
/* The conversation package owns the metrics content, while the desktop shell
   owns the window-wide status-bar geometry. This selector deliberately scopes
   the promotion to advanced mode so compatibility mode is unchanged. */
/* This rule is intentionally kept as a no-op marker for the retired upstream
   row; AgentStatusPanel is now its sole visible owner. */
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  width: 100vw;
  max-width: none;
  margin: 0;
  box-sizing: border-box;
  padding: 4px 16px 5px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 96%, transparent);
  box-shadow: 0 -4px 14px color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent);
  overflow-x: hidden;
  overflow-y: visible;
  text-overflow: clip;
}
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] > span { display: inline !important; }
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] .sep { margin: 0 8px; }
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: baseline;
  justify-content: center;
  height: auto !important;
  min-height: 20px !important;
  max-height: none !important;
  white-space: normal !important;
  overflow: visible !important;
  overflow-wrap: anywhere;
  word-break: break-word;
}
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] > span {
  display: inline-flex !important;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] .sep {
  flex: 0 0 auto;
}
/* Keep the row in the composer flow. A fixed descendant is clipped by the
   conversation surface when its wrapped height exceeds the original band. */
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] {
  position: static !important;
  inset: auto !important;
  align-self: stretch !important;
  flex: none !important;
  width: 100% !important;
  max-width: none !important;
  height: auto !important;
  max-height: none !important;
  min-height: 20px !important;
  padding: 4px 16px 5px !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-wrap: wrap !important;
  overflow: visible !important;
  overflow-x: visible !important;
  overflow-y: visible !important;
  overflow-wrap: anywhere !important;
  white-space: normal !important;
  text-overflow: clip !important;
}
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] * {
  min-width: 0 !important;
  max-width: 100% !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  overflow-wrap: anywhere !important;
}
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] > span:last-child {
  flex-basis: 100%;
  justify-content: center;
}
html body[data-dsh-desktop-mode="advanced"] div[class*="StatsLine_root"] {
  -webkit-line-clamp: unset !important;
  line-clamp: unset !important;
  text-overflow: unset !important;
  white-space: normal !important;
  overflow: visible !important;
}
body[data-dsh-desktop-mode="advanced"] [data-slot="conversation.composer.dock"],
body[data-dsh-desktop-mode="advanced"] [data-slot="conversation.composer.dock"] > * {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
  overflow-x: visible !important;
  overflow-y: visible !important;
  white-space: normal !important;
  text-overflow: clip !important;
}
body[data-dsh-desktop-mode="advanced"] [data-conversation-scroll] { padding-bottom: 0; }
/* Keep the complete metrics sentence visible in every Desktop mode. The
   composer may be narrow, so wrapping is preferred to an ellipsis. */
[class*="StatsLine_root"] {
  max-width: none !important;
  width: 100% !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  overflow-wrap: anywhere;
}
[class*="StatsLine_root"] > span { display: inline !important; }
[class*="StatsLine_root"] .sep { margin: 0 8px; }
/* The original conversation stats dock is retired in advanced mode. The
   complete presentation is owned by AgentStatusPanel below Usage. */
body[data-dsh-desktop-mode="advanced"] [data-slot="conversation.composer.dock"]:has([class*="StatsLine_root"]),
body[data-dsh-desktop-mode="advanced"] [data-slot="conversation.composer.dock"] [class*="StatsLine_root"] {
  display: none !important;
}
/* Final declaration wins over every upstream and compatibility rule above. */
body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] {
  display: none !important;
}
@media (max-width: 640px) {
  body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] { text-align: left; }
}
@media (prefers-reduced-transparency: reduce) {
  body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] { background: var(--dsw-alias-bg-base); }
}
@media (prefers-reduced-motion: reduce) {
  body[data-dsh-desktop-mode="advanced"] [class*="StatsLine_root"] { box-shadow: none; }
}
.dshDesktopFrame[data-details-collapsed] .dshDesktopDetailsSurface { border-left: none; }
.dshDesktopFrame[data-desktop-platform="win32"] { grid-template-rows: ${WINDOWS_TITLEBAR_HEIGHT}px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopSidebarSurface { grid-row: 1 / -1; }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopWindowsCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopWindowsCaptionRow::before { content: ""; position: absolute; inset: 0 ${WINDOWS_CAPTION_CONTROLS_WIDTH}px 0 0; user-select: none; -webkit-app-region: drag; }
.dshDesktopFrame[data-dragging] { transition: none; }
.dshDesktopOverlay { position: absolute; z-index: 1000; inset: 0; pointer-events: none; }
.dshDesktopOverlay > * { pointer-events: auto; }
.dshDesktopResizeHandle { position: absolute; z-index: 50; top: 0; bottom: 0; width: 8px; margin-left: -4px; cursor: col-resize; touch-action: none; -webkit-app-region: no-drag; transition: left var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopFrame[data-dragging] .dshDesktopResizeHandle { transition: none; }
/* Desktop stop-gap: the inline chat Todo strip moves into the right status
   panel (upstream removal is a separate PR). Hide it in advanced mode. */
body[data-dsh-desktop-mode="advanced"] [data-testid="todo-panel"] { display: none !important; }
/* Reopen control for the collapsed right status panel (narrow window or closed). */
.dshDesktopStatusReopen {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 60;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-right: 0;
  border-radius: 12px 0 0 12px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  writing-mode: vertical-rl;
  font-size: 12px;
  line-height: 16px;
  -webkit-app-region: no-drag;
}
.dshDesktopStatusReopen:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshDesktopStatusReopenIcon {
  writing-mode: horizontal-tb;
  color: var(--dsw-alias-state-business-primary);
}
.dshDesktopNoDrag, button, input, textarea, select, a, [role="button"], [role="dialog"], [role="presentation"] { -webkit-app-region: no-drag; }
[role="dialog"], [aria-modal="true"] { -webkit-app-region: no-drag !important; }
html:has([aria-modal="true"]) .dshDesktopWindowsCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopMacCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface::before { -webkit-app-region: no-drag !important; }
@media (prefers-reduced-motion: reduce) {
  .dshDesktopFrame,
  .dshDesktopResizeHandle { transition: none !important; }
}
`

/** Install and remove the advanced shell's global native-window styles. @returns the style disposer. */
export function installAdvancedStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/advanced-shell'
  style.textContent = ADVANCED_STYLES
  document.head.appendChild(style)

  // The upstream conversation package can replace the dock node after each
  // session projection update. Hide the mounted node imperatively as well as
  // through CSS so the duplicate can never reappear between style recalculations.
  const hideUpstreamStats = () => {
    // StatsLine_root is the upstream conversation status bar. Agent Status uses
    // dshDesktopStatusSessionStats and is deliberately not selected here.
    document.querySelectorAll<HTMLElement>('[class*="StatsLine_root"]').forEach(element => {
      element.style.setProperty('display', 'none', 'important')
    })
  }
  hideUpstreamStats()
  const observer = new MutationObserver(hideUpstreamStats)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    document.querySelectorAll<HTMLElement>('[class*="StatsLine_root"]').forEach(element => {
      element.style.removeProperty('display')
    })
    style.remove()
  }
}
