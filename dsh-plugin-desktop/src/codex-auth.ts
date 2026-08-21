/**
 * Desktop-owned OAuth login driver for the OpenAI Codex (ChatGPT Plus/Pro)
 * provider.
 *
 * The harness's `dsh-llm-pi-ai` plugin already registers an `oauth`
 * authorization flow for the `openai-codex` catalog provider and persists the
 * returned grant through `ctx.credentials`. This module owns the desktop half:
 * it rebuilds the pi-ai `CredentialStore` and `AuthContext` the desktop's own
 * `LlmAdapter` needs, and it maps the harness's neutral authorization
 * interaction into the device-code surface the desktop settings UI renders.
 *
 * @module dsh-plugin-desktop/codex-auth
 */

import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve as resolvePath } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AuthContext,
  Credential,
  CredentialInfo,
  CredentialStore,
} from '@earendil-works/pi-ai'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import type {
  AuthorizationInteraction,
  AuthorizationNotice,
} from '@deepseek-ai/dsh-authorization'
import {
  credentialKey,
  credentialRef,
  isCredentialKeySegment,
  isCredentialRefName,
} from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'

/** The pi-ai catalog provider id; also the harness route key and `Models` collection key. */
export const CODEX_PROVIDER_ID = 'openai-codex'

/**
 * The credential-record scope the harness's `dsh-llm-pi-ai` plugin writes
 * under (its `RECORD_SCOPE`). The desktop must address the same record the
 * harness flow writes, or the adapter and the login surface would disagree
 * about what is stored.
 */
export const CODEX_RECORD_SCOPE = 'llm-pi-ai'

/** The ChatGPT Codex login method the desktop surface always selects. */
export const CODEX_DEVICE_CODE_METHOD = 'device_code'

/** The credential record the desktop adapter and login surface share. */
export function codexCredentialKey(): CredentialKey {
  return credentialKey(CODEX_RECORD_SCOPE, CODEX_PROVIDER_ID)
}

/** Translate a stored harness credential record into the pi-ai credential. */
function toPiCredential(record: CredentialRecord | undefined): Credential | undefined {
  if (record === undefined) return undefined
  if (record.kind === 'api-key') {
    return {
      type: 'api_key',
      ...(record.key === undefined ? {} : { key: record.key }),
      ...(record.env === undefined ? {} : { env: { ...record.env } }),
    }
  }
  return record.payload as Credential
}

/** Translate a pi-ai credential into the harness record to store. */
function toRecord(credential: Credential): CredentialRecord {
  if (credential.type === 'api_key') {
    return {
      kind: 'api-key',
      ...(credential.key === undefined ? {} : { key: credential.key }),
      ...(credential.env === undefined ? {} : { env: { ...credential.env } }),
    }
  }
  return { kind: 'grant', payload: credential }
}

/**
 * A pi-ai `CredentialStore` over the harness credential records.
 *
 * The desktop's own `LlmAdapter` builds a `Models` collection with this store,
 * so a sign-in the harness flow wrote (through `ctx.credentials`) is the same
 * record the desktop adapter reads and refreshes. OAuth refresh runs inside
 * `modify()`, which is why the write path goes through `modifyRecord`'s
 * serialized read-modify-write rather than a raw write.
 * @param ctx - the plugin context carrying `ctx.credentials`.
 * @returns the store to hand `createModels()`.
 */
export function buildCodexCredentialStore(ctx: Context): CredentialStore {
  return {
    async read(providerId) {
      const credentials = ctx.get('credentials')
      if (credentials === undefined || !isCredentialKeySegment(providerId)) return undefined
      return toPiCredential(await credentials.readRecord(credentialKey(CODEX_RECORD_SCOPE, providerId)))
    },
    async list(): Promise<readonly CredentialInfo[]> {
      const record = await ctx.get('credentials')?.readRecord(codexCredentialKey())
      if (record === undefined) return []
      return [{
        providerId: CODEX_PROVIDER_ID,
        type: record.kind === 'api-key' ? 'api_key' : 'oauth',
      }]
    },
    async modify(providerId, mutate) {
      if (!isCredentialKeySegment(providerId)) {
        throw new LlmError(
          `codex: provider id "${providerId}" cannot address a stored credential record`,
          'UNSTORABLE_PROVIDER_ID',
        )
      }
      const credentials = ctx.get('credentials')
      if (credentials === undefined) {
        throw new LlmError('codex: this composition mounts no credentials service', 'NO_CREDENTIAL_STORE')
      }
      const stored = await credentials.modifyRecord(
        credentialKey(CODEX_RECORD_SCOPE, providerId),
        async current => {
          const next = await mutate(toPiCredential(current))
          return next === undefined ? undefined : toRecord(next)
        },
      )
      return toPiCredential(stored)
    },
    async delete(providerId) {
      if (!isCredentialKeySegment(providerId)) return
      await ctx.get('credentials')?.deleteRecord(credentialKey(CODEX_RECORD_SCOPE, providerId))
    },
  }
}

/**
 * A pi-ai `AuthContext` over the harness credential plane and the process
 * environment. Codex OAuth needs neither env keys nor files, but pi-ai still
 * asks; answering from the credential seam keeps a stored value visible to a
 * provider's own ambient discovery.
 * @param ctx - the plugin context carrying the optional `ctx.credentials`.
 * @returns the auth context to hand `createModels()`.
 */
export function buildCodexAuthContext(ctx: Context): AuthContext {
  return {
    async env(name) {
      if (isCredentialRefName(name)) {
        const hit = await ctx.get('credentials')?.resolve(credentialRef(name))
        if (hit !== undefined) return hit.value
      }
      return process.env[name]
    },
    async fileExists(path) {
      const expanded = path === '~' || path.startsWith('~/')
        ? resolvePath(homedir(), path.slice(1).replace(/^\//, ''))
        : path
      try {
        await access(expanded)
        return true
      } catch {
        return false
      }
    },
  }
}

/** Renderer-safe projection of one authorization notice. Never carries a secret. */
export interface CodexNotice {
  readonly message: string
  readonly url?: string
  readonly code?: string
}

/** Project an authorization notice into the renderer-safe shape. */
export function projectNotice(notice: AuthorizationNotice): CodexNotice {
  return {
    message: notice.message,
    ...(notice.url === undefined ? {} : { url: notice.url }),
    ...(notice.code === undefined ? {} : { code: notice.code }),
  }
}

/**
 * Build the authorization interaction that drives the harness Codex flow as a
 * device-code sign-in.
 *
 * The ChatGPT Codex flow first asks which login method to use; the desktop
 * surface is device-code only, so the select prompt is answered with
 * `device_code`. Any other prompt is declined, and every notice is projected
 * into the renderer-safe shape. When a notice carries a verification URL (the
 * device-code page the human must open), the injected browser-opener is invoked
 * so a real browser window appears without any further user action.
 * @param onNotice - receives each projected notice as the flow progresses.
 * @param openBrowser - optional opener for the notice URL; failures are
 * swallowed so a browser-launch problem never fails the authorization itself.
 * @returns the interaction to pass to `ctx.authorization.begin()`.
 */
export function buildCodexInteraction(
  onNotice: (notice: CodexNotice) => void,
  openBrowser?: (url: string) => Promise<void>,
): AuthorizationInteraction {
  return {
    notify: (notice) => {
      onNotice(projectNotice(notice))
      if (notice.url !== undefined && openBrowser !== undefined) {
        void Promise.resolve(openBrowser(notice.url)).catch(() => {})
      }
    },
    async prompt(prompt) {
      if (prompt.kind === 'select') {
        const device = prompt.options.find(option => option.id === CODEX_DEVICE_CODE_METHOD)
        if (device !== undefined) return device.id
      }
      throw new AuthorizationDeclinedError()
    },
  }
}
