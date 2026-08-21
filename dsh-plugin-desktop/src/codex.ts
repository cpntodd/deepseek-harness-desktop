/** Cordis Host plugin contributing ChatGPT (Codex) sign-in and model routing. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from './runtime.ts'
import {
  buildCodexAuthContext,
  buildCodexCredentialStore,
  codexCredentialKey,
  CODEX_PROVIDER_ID,
} from './codex-auth.ts'
import { CodexLlmAdapter, createCodexModels } from './codex-provider.ts'
import {
  CODEX_LOGIN_PATH,
  CODEX_LOGOUT_PATH,
  CODEX_SETTINGS_PATH,
} from './codex-settings-contract.ts'
import { CodexSettingsController } from './codex-settings-controller.ts'
import {
  handleCodexLoginRequest,
  handleCodexLogoutRequest,
  handleCodexSettingsRequest,
} from './codex-settings-route.ts'
import { desktopTrayLabel } from './tray-locale.ts'

/** Stable Cordis plugin name. */
export const name = 'desktop-codex'

/** Services required before the Codex route and settings surface can mount. */
export const inject = ['llm', 'webServer', 'desktopRuntime']

/**
 * Register the desktop-owned OpenAI Codex adapter route plus a device-code
 * sign-in surface reachable from the native tray and the loopback settings API.
 * @param ctx - Host context carrying the LLM registry and Web server.
 */
export function apply(ctx: Context): void {
  const runtime = ctx.get('desktopRuntime')
  if (runtime === undefined) return

  const store = buildCodexCredentialStore(ctx)
  const authContext = buildCodexAuthContext(ctx)
  const models = createCodexModels(store, authContext)
  const adapter = new CodexLlmAdapter(models)

  // The harness's `dsh-llm-pi-ai` leaves `openai-codex` dormant unless a
  // profile declares it in settings.yaml; if it ever does, that adapter owns
  // the route and the desktop must not collide on the next boot.
  try {
    ctx.llm.registerAdapter([CODEX_PROVIDER_ID], adapter)
  } catch (cause) {
    ctx.logger.warn(
      'dsh-plugin-desktop: the OpenAI Codex adapter route is already owned by another adapter;'
      + ' skipping the desktop route',
    )
    ctx.logger.warn(cause)
  }

  const authorization = ctx.get('authorization')
  const credentials = ctx.get('credentials')
  if (authorization === undefined || credentials === undefined) {
    // A composition without the harness authorization/credential seams has no
    // surface to sign in from; the adapter route above still serves an
    // already-stored credential, so there is nothing further to register.
    return
  }

  const controller = new CodexSettingsController({
    authorize: request => authorization.begin(request),
    isSignedIn: async () => (await credentials.readRecord(codexCredentialKey())) !== undefined,
    signOut: async () => { await credentials.deleteRecord(codexCredentialKey()) },
    listModels: async () => models.getModels(CODEX_PROVIDER_ID).map(model => model.id),
    openBrowser: url => runtime.openExternal(url),
  })

  const reportError = (operation: string, cause: unknown): void => {
    ctx.logger.error(
      `dsh-plugin-desktop: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  const rendererOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const routes = [
    [CODEX_SETTINGS_PATH, handleCodexSettingsRequest],
    [CODEX_LOGIN_PATH, handleCodexLoginRequest],
    [CODEX_LOGOUT_PATH, handleCodexLogoutRequest],
  ] as const
  for (const [path, handler] of routes) {
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path,
        handler: (req, res) => handler(
          req,
          res,
          rendererOrigin,
          controller,
          reportError,
        ),
      }),
      `dsh-plugin-desktop: private Codex route ${path}`,
    )
  }

  ctx.effect(() => {
    const registration = runtime.registerTrayItem({
      group: 'status',
      order: 20,
      label: () => desktopTrayLabel(runtime.locale, 'signInWithChatgpt'),
      invoke: () => {
        controller.startLogin()
        runtime.show()
      },
    })
    return () => { registration.dispose() }
  }, 'dsh-plugin-desktop: ChatGPT sign-in tray command')
}
