/** Launcher-backed controller for the private Desktop Codex settings API. */

import type {
  AuthorizationOutcome,
  AuthorizationRequest,
} from '@deepseek-ai/dsh-authorization'
import {
  buildCodexInteraction,
  codexCredentialKey,
  CODEX_PROVIDER_ID,
  type CodexNotice,
} from './codex-auth.ts'
import type {
  CodexLoginResponse,
  CodexLogoutResponse,
  CodexSettingsResponse,
} from './codex-settings-contract.ts'

/** Capabilities used without exposing the harness authorization seam directly. */
export interface CodexSettingsControllerBootstrap {
  /** Start one OAuth attempt through the harness `ctx.authorization` flow. */
  authorize(request: AuthorizationRequest): Promise<AuthorizationOutcome>
  /** Whether a Codex credential record is currently stored. */
  isSignedIn(): Promise<boolean>
  /** Remove the stored Codex credential record. */
  signOut(): Promise<void>
  /** Model ids the installed provider exposes, for the status surface. */
  listModels(): Promise<readonly string[]>
  /** Open the device-code verification URL in the system browser. */
  openBrowser(url: string): Promise<void>
}

/**
 * Generation-scoped controller for the ChatGPT (Codex) sign-in surface.
 *
 * A sign-in runs in the background after the login endpoint responds: the flow
 * reports its device code through a notice that `read()` surfaces, so the
 * renderer polls until the state becomes `signed-in`.
 */
export class CodexSettingsController {
  private pending = false
  private notice: CodexNotice | undefined
  private error: string | undefined

  constructor(private readonly bootstrap: CodexSettingsControllerBootstrap) {}

  /** Read a fresh, renderer-safe Codex state projection. */
  async read(): Promise<CodexSettingsResponse> {
    const signedIn = await this.bootstrap.isSignedIn()
    const state: CodexSettingsResponse['state'] = signedIn
      ? 'signed-in'
      : this.pending ? 'in-progress' : 'signed-out'
    const models = signedIn ? await this.bootstrap.listModels() : []
    return Object.freeze({
      state,
      providerId: CODEX_PROVIDER_ID,
      models: Object.freeze([...models]),
      ...(this.notice === undefined ? {} : { notice: this.notice }),
      ...(this.error === undefined ? {} : { error: this.error }),
    })
  }

  /** Begin a device-code sign-in, leaving the flow to run in the background. */
  startLogin(): CodexLoginResponse {
    if (this.pending) return Object.freeze({ accepted: true })
    this.pending = true
    this.notice = undefined
    this.error = undefined
    const interaction = buildCodexInteraction(
      notice => { this.notice = notice },
      url => this.bootstrap.openBrowser(url),
    )
    void this.bootstrap.authorize({
      key: codexCredentialKey(),
      method: 'oauth',
      interaction,
    }).then(
      () => { this.pending = false },
      (cause: unknown) => {
        this.pending = false
        this.error = cause instanceof Error ? cause.message : String(cause)
      },
    )
    return Object.freeze({ accepted: true })
  }

  /** Remove the stored credential and reset the surface. */
  async logout(): Promise<CodexLogoutResponse> {
    await this.bootstrap.signOut()
    this.notice = undefined
    this.error = undefined
    return Object.freeze({ accepted: true })
  }
}

export default CodexSettingsController
