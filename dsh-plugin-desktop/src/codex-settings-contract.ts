/** Private same-origin Desktop Codex (ChatGPT Plus/Pro) settings API. */

import type { CodexNotice } from './codex-auth.ts'

/** Read the current Codex sign-in and model availability state. */
export const CODEX_SETTINGS_PATH = '/api/desktop/codex'

/** Start one device-code sign-in attempt through the harness OAuth flow. */
export const CODEX_LOGIN_PATH = '/api/desktop/codex/login'

/** Remove the stored Codex credential. */
export const CODEX_LOGOUT_PATH = '/api/desktop/codex/logout'

/** Login lifecycle phase reported by the controller. */
export type CodexAuthState = 'signed-out' | 'in-progress' | 'signed-in'

/** Renderer-safe projection of the current Codex sign-in state. */
export interface CodexSettingsResponse {
  /** Where the device-code attempt stands. */
  readonly state: CodexAuthState
  /** The pi-ai provider id this surface signs into. */
  readonly providerId: string
  /** Model ids available once signed in. */
  readonly models: readonly string[]
  /** Latest device-code / auth-URL notice, while the flow is running. */
  readonly notice?: CodexNotice
  /** Stable error text from the most recent failed attempt. */
  readonly error?: string
}

/** Exact empty body accepted by the login endpoint. */
export type CodexLoginRequest = Readonly<Record<string, never>>

/** Successful login handoff: the flow runs in the background while the surface polls. */
export interface CodexLoginResponse {
  readonly accepted: true
}

/** Exact empty body accepted by the logout endpoint. */
export type CodexLogoutRequest = Readonly<Record<string, never>>

/** Successful sign-out. */
export interface CodexLogoutResponse {
  readonly accepted: true
}

/** Stable API failure shape that never contains native paths or raw causes. */
export interface CodexSettingsErrorResponse {
  readonly error: string
}
