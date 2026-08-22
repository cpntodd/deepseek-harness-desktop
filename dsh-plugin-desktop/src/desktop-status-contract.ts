/**
 * Desktop agent-status contract: the same-origin route path and the typed
 * response the right-hand status panel renders. Shared by the host handler
 * (reads configured LSP providers from the running profile) and the browser
 * API client, so the two sides stay in lockstep on shape.
 */

/** Private route serving configured LSP providers for the active profile. */
export const DESKTOP_STATUS_LSP_PROVIDERS_PATH = '/api/desktop/status/lsp-providers'

/** One configured LSP provider, derived from the profile's `dsh-lsp-stdio` server rows. */
export interface DesktopLspProviderView {
  /** Stable provider id (the `servers` map key, e.g. `typescript`, `go`). */
  readonly id: string
  /** Human display name derived from the provider id. */
  readonly displayName: string
  /** Unique LSP language ids this provider serves. */
  readonly languages: readonly string[]
}

/** Response envelope for the configured LSP providers route. */
export interface DesktopLspProvidersResponse {
  readonly providers: readonly DesktopLspProviderView[]
}
