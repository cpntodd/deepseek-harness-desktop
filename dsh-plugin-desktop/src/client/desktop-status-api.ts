/**
 * Desktop status API: reads the live facts the right-hand agent status panel
 * renders. MCP reads the Desktop host's installed-server route; LSP reads the
 * desktop host's configured-provider route. Both are same-origin GETs with a
 * fetch seam so tests can drive them directly.
 */
import {
  DESKTOP_STATUS_LSP_PROVIDERS_PATH,
  DESKTOP_STATUS_MCP_INSTALLATIONS_PATH,
  type DesktopLspProvidersResponse,
} from '../desktop-status-contract.ts'

export { DESKTOP_STATUS_LSP_PROVIDERS_PATH, DESKTOP_STATUS_MCP_INSTALLATIONS_PATH } from '../desktop-status-contract.ts'
export type { DesktopLspProviderView, DesktopLspProvidersResponse } from '../desktop-status-contract.ts'

/** One installed + enabled MCP server, as served by the community-market host route. */
export interface DesktopMcpServerView {
  /** Stable server namespace used as the `mcp-client` serverName. */
  readonly serverName: string
  /** Informational display name from the registry catalog. */
  readonly displayName: string
  /** Whether the `mcp-client` row is composed on the next generation. */
  readonly enabled: boolean
  /** ISO timestamp of the install. */
  readonly installedAt: string
}

/** Response envelope for the MCP installations route. */
export interface DesktopMcpInstallationsResponse {
  readonly installations: readonly DesktopMcpServerView[]
}

async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { error?: unknown; code?: unknown }
  if (!response.ok) {
    throw new Error(typeof value.error === 'string' ? value.error : `request failed: ${response.status}`)
  }
  return value
}

/** Installed + enabled MCP servers for the active profile (same-origin). */
export async function readDesktopMcpStatus(signal?: AbortSignal): Promise<DesktopMcpInstallationsResponse> {
  return await readJson(await fetch(DESKTOP_STATUS_MCP_INSTALLATIONS_PATH, {
    cache: 'no-store',
    ...(signal === undefined ? {} : { signal }),
  }))
}

/** Configured LSP providers for the active profile (same-origin). */
export async function readDesktopLspStatus(signal?: AbortSignal): Promise<DesktopLspProvidersResponse> {
  return await readJson(await fetch(DESKTOP_STATUS_LSP_PROVIDERS_PATH, {
    cache: 'no-store',
    ...(signal === undefined ? {} : { signal }),
  }))
}
