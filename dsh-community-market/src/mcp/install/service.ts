import { randomBytes } from 'node:crypto'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { MarketSettingsDocument } from '../../catalog/source-store.js'
import type { CatalogHttpClient, CatalogMediaRegistrar, LocalSourceRecord } from '../../contracts/types.js'
import { MarketInstallError } from '../../install/service.js'
import type {
  McpCatalogAdapter,
  McpCatalogFetchContext,
  McpCatalogQuery,
  McpInstallMethod,
  McpInstallReceipt,
  McpServerItem,
} from '../contracts/types.js'

const INSTALL_INTENT_TTL_MS = 5 * 60 * 1000
const MAX_INTENTS = 256
const MAX_RECEIPTS = 512
const NPM_PACKAGE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const HEADER_NAME_PATTERN = /^[^\u0000-\u001f\u007f:]+$/u

interface McpInstallIntent {
  readonly kind: 'install'
  readonly source: LocalSourceRecord
  readonly item: McpServerItem
  readonly method: McpInstallMethod
  readonly expiresAt: number
}

interface McpRestartIntent {
  readonly expiresAt: number
}

export interface McpInstallPreview {
  readonly previewId: string
  readonly action: 'install'
  readonly serverName: string
  readonly displayName: string
  readonly method: McpInstallMethod
  readonly expiresAt: string
}

export interface McpInstallResult {
  readonly action: 'install'
  readonly receipt: McpInstallReceipt
  readonly displayName: string
  readonly restartToken: string
}

export interface McpInstallServiceOptions {
  readonly now?: () => number
  readonly intentTtlMs?: number
  readonly maxIntents?: number
}

function opaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

function safeNpmIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 512 && NPM_PACKAGE_PATTERN.test(value)
}

function safeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && (!url.port || url.port === '443')
  } catch {
    return false
  }
}

function validMethod(value: unknown): value is McpInstallMethod {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const method = value as Record<string, unknown>
  if (method.kind === 'stdio') {
    if (method.command !== 'npx' && method.command !== 'uvx') return false
    if (!Array.isArray(method.args) || method.args.length < 2) return false
    if (method.args[0] !== '-y' || !safeNpmIdentifier(method.args[1])) return false
    if (!method.args.slice(2).every(arg => typeof arg === 'string' && arg.length > 0 && arg.length <= 512 && !arg.includes('\0'))) return false
    if (!Array.isArray(method.env) || !method.env.every(validEnv)) return false
    return true
  }
  if (method.kind === 'streamable-http') {
    if (typeof method.url !== 'string' || !safeHttpsUrl(method.url)) return false
    if (!Array.isArray(method.headers) || !method.headers.every(validHeader)) return false
    return true
  }
  return false
}

function validEnv(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const env = value as Record<string, unknown>
  return typeof env.name === 'string' && env.name.length >= 1 && env.name.length <= 256
    && (env.secret === undefined || typeof env.secret === 'boolean')
    && (env.required === undefined || typeof env.required === 'boolean')
    && (env.value === undefined || typeof env.value === 'string')
}

function validHeader(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const header = value as Record<string, unknown>
  return typeof header.name === 'string' && HEADER_NAME_PATTERN.test(header.name) && header.name.length <= 256
    && (header.secret === undefined || typeof header.secret === 'boolean')
    && (header.required === undefined || typeof header.required === 'boolean')
}

function validReceipt(value: unknown): value is McpInstallReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const receipt = value as Record<string, unknown>
  if (
    typeof receipt.sourceRecordId !== 'string' || receipt.sourceRecordId.length < 1 || receipt.sourceRecordId.length > 200
    || typeof receipt.providerId !== 'string' || receipt.providerId.length < 1 || receipt.providerId.length > 200
    || typeof receipt.itemId !== 'string' || receipt.itemId.length < 1 || receipt.itemId.length > 200
    || typeof receipt.serverName !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/u.test(receipt.serverName)
    || typeof receipt.displayName !== 'string' || receipt.displayName.length < 1 || receipt.displayName.length > 240
    || typeof receipt.installedAt !== 'string' || Number.isNaN(Date.parse(receipt.installedAt))
  ) return false
  return validMethod(receipt.method)
}

/**
 * Host-owned MCP install workflow. No provider command or renderer config
 * crosses this boundary: the adapter's normalized method is revalidated here
 * (npx/uvx stdio or credential-free HTTPS Streamable HTTP) before a receipt is
 * persisted to the `mcpInstallReceipts` settings key. Desktop profile
 * composition is Phase 2 and intentionally absent.
 */
export class McpInstallService {
  private readonly intents = new Map<string, McpInstallIntent>()
  private readonly restartIntents = new Map<string, McpRestartIntent>()
  private readonly now: () => number
  private readonly intentTtlMs: number
  private readonly maxIntents: number
  private closed = false

  constructor(
    private readonly scope: SettingsScope<MarketSettingsDocument>,
    private readonly adapter: McpCatalogAdapter,
    private readonly source: LocalSourceRecord,
    private readonly http: CatalogHttpClient,
    private readonly media: CatalogMediaRegistrar,
    options: McpInstallServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.intentTtlMs = options.intentTtlMs ?? INSTALL_INTENT_TTL_MS
    this.maxIntents = options.maxIntents ?? MAX_INTENTS
    if (!Number.isSafeInteger(this.intentTtlMs) || this.intentTtlMs < 1) {
      throw new TypeError('invalid MCP install intent TTL')
    }
    if (!Number.isSafeInteger(this.maxIntents) || this.maxIntents < 1) {
      throw new TypeError('invalid MCP install intent limit')
    }
  }

  private context(signal: AbortSignal): McpCatalogFetchContext {
    return { signal, source: this.source, http: this.http, media: this.media }
  }

  async listServers(query: McpCatalogQuery, signal: AbortSignal): Promise<readonly McpServerItem[]> {
    this.assertOpen()
    return await this.adapter.list(query, this.context(signal))
  }

  async previewInstall(sourceRecordId: string, itemId: string, signal: AbortSignal): Promise<McpInstallPreview> {
    this.assertOpen()
    this.purge()
    signal.throwIfAborted()
    if (sourceRecordId !== this.source.sourceRecordId) {
      throw new MarketInstallError('source-required', 'This MCP server is not owned by an enabled MCP source.')
    }
    const items = await this.adapter.list({ search: itemId, limit: 1 }, this.context(signal))
    signal.throwIfAborted()
    const item = items.find(candidate => candidate.id === itemId)
    if (item === undefined) {
      throw new MarketInstallError('not-available', 'This MCP server is no longer available. Refresh the MCP registry and try again.')
    }
    const method = item.installMethods[0]
    if (method === undefined) {
      throw new MarketInstallError('not-available', 'This MCP server has no directly installable transport.')
    }
    this.assertInstallable(method)
    const token = this.issueIntent({
      kind: 'install',
      source: this.source,
      item,
      method,
      expiresAt: this.now() + this.intentTtlMs,
    })
    return {
      previewId: token,
      action: 'install',
      serverName: item.name,
      displayName: item.displayName,
      method,
      expiresAt: new Date(this.now() + this.intentTtlMs).toISOString(),
    }
  }

  async executeInstall(token: string, signal: AbortSignal): Promise<McpInstallResult> {
    this.assertOpen()
    this.purge()
    const intent = this.consumeIntent(token, signal)
    this.assertInstallable(intent.method)
    signal.throwIfAborted()
    if (this.receipts().some(receipt => receipt.serverName === intent.item.name)) {
      throw new MarketInstallError('conflict', 'This MCP server already has an install receipt.')
    }
    const receipt: McpInstallReceipt = {
      sourceRecordId: intent.source.sourceRecordId,
      providerId: intent.source.providerId,
      itemId: intent.item.id,
      serverName: intent.item.name,
      displayName: intent.item.displayName,
      method: intent.method,
      installedAt: new Date(this.now()).toISOString(),
    }
    await this.saveReceipts([...this.receipts(), receipt])
    return { action: 'install', receipt, displayName: intent.item.displayName, restartToken: this.issueRestartToken() }
  }

  async listReceipts(): Promise<readonly McpInstallReceipt[]> {
    this.assertOpen()
    return this.receipts()
  }

  /** Consume one short-lived restart grant issued after a completed install. */
  consumeRestartToken(token: string): void {
    this.assertOpen()
    this.purge()
    if (!this.restartIntents.delete(token)) {
      throw new MarketInstallError('intent-expired', 'The restart confirmation expired or was already used.')
    }
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    this.intents.clear()
    this.restartIntents.clear()
  }

  private receipts(): readonly McpInstallReceipt[] {
    const value = this.scope.get().mcpInstallReceipts ?? []
    if (!Array.isArray(value) || value.length > MAX_RECEIPTS || !value.every(validReceipt)) {
      throw new MarketInstallError('persistence-failed', 'The MCP install receipt store is invalid.')
    }
    const names = new Set(value.map(receipt => receipt.serverName))
    if (names.size !== value.length) {
      throw new MarketInstallError('persistence-failed', 'The MCP install receipt store is invalid.')
    }
    return value
  }

  private async saveReceipts(receipts: readonly McpInstallReceipt[]): Promise<void> {
    if (receipts.length > MAX_RECEIPTS || !receipts.every(validReceipt)) throw new Error('invalid MCP install receipts')
    await this.scope.update({ mcpInstallReceipts: receipts })
  }

  private assertInstallable(method: McpInstallMethod): void {
    if (method.kind === 'stdio') {
      if (
        (method.command !== 'npx' && method.command !== 'uvx')
        || !Array.isArray(method.args)
        || method.args.length < 2
        || method.args[0] !== '-y'
        || !safeNpmIdentifier(method.args[1])
        || !method.args.slice(2).every(arg => typeof arg === 'string' && arg.length > 0 && arg.length <= 512 && !arg.includes('\0'))
      ) {
        throw new MarketInstallError('install-denied', 'This MCP server uses an unsupported stdio command or argument shape and cannot be installed automatically.')
      }
      return
    }
    if (!safeHttpsUrl(method.url)) {
      throw new MarketInstallError('install-denied', 'This MCP server endpoint is not a credential-free HTTPS URL on port 443.')
    }
    for (const header of method.headers) {
      if (!HEADER_NAME_PATTERN.test(header.name) || header.name.length > 256) {
        throw new MarketInstallError('install-denied', 'This MCP server declares an unsafe request header and cannot be installed automatically.')
      }
    }
  }

  private issueIntent(intent: McpInstallIntent): string {
    this.assertOpen()
    this.purge()
    let token = opaqueToken()
    while (this.intents.has(token)) token = opaqueToken()
    this.intents.set(token, intent)
    while (this.intents.size > this.maxIntents) {
      const oldest = this.intents.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.intents.delete(oldest)
    }
    return token
  }

  private issueRestartToken(): string {
    this.assertOpen()
    this.purge()
    let token = opaqueToken()
    while (this.restartIntents.has(token)) token = opaqueToken()
    this.restartIntents.set(token, { expiresAt: this.now() + this.intentTtlMs })
    return token
  }

  private consumeIntent(token: string, signal: AbortSignal): McpInstallIntent {
    this.purge()
    const intent = this.intents.get(token)
    if (intent === undefined) {
      throw new MarketInstallError('intent-expired', 'The confirmation expired or was already used. Preview the install again.')
    }
    this.intents.delete(token)
    signal.throwIfAborted()
    return intent
  }

  private purge(): void {
    const now = this.now()
    for (const [token, intent] of this.intents) {
      if (now >= intent.expiresAt) this.intents.delete(token)
    }
    for (const [token, intent] of this.restartIntents) {
      if (now >= intent.expiresAt) this.restartIntents.delete(token)
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new MarketInstallError('operation-failed', 'The MCP install service is unavailable.')
  }
}
