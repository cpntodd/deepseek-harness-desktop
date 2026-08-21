import { createHash } from 'node:crypto'
import { compare as semverCompare, valid as semverValid } from 'semver'
import type { LocalSourceRecord } from '../../contracts/types.js'
import { MCP_REGISTRY_SOURCE_RECORD_ID } from '../contracts/identity.js'
import { parseMcpRegistryList, type McpRegistryServerEntry } from '../contracts/schemas.js'
import type {
  McpCatalogAdapter,
  McpCatalogFetchContext,
  McpCatalogQuery,
  McpEnvVariable,
  McpHttpHeader,
  McpInstallMethod,
  McpManualInstall,
  McpServerItem,
  McpStdioInstallMethod,
} from '../contracts/types.js'

export const MCP_REGISTRY_KEY = 'mcp-registry'
export const MCP_REGISTRY_ENDPOINT = 'https://registry.modelcontextprotocol.io/v0.1/servers'
export const MCP_REGISTRY_HOSTNAME = 'registry.modelcontextprotocol.io'
export const MCP_REGISTRY_ORIGIN = `https://${MCP_REGISTRY_HOSTNAME}`
export const MCP_REGISTRY_PROVIDER_ID = 'io.modelcontextprotocol.registry'
export const MCP_REGISTRY_ADAPTER_ID = 'market.mcp-registry-v1'

/** The single compiled-in MCP source for v1; never entered into the catalog source list. */
export const MCP_REGISTRY_SOURCE: LocalSourceRecord = {
  sourceRecordId: MCP_REGISTRY_SOURCE_RECORD_ID,
  registrationKind: 'built-in',
  adapterId: MCP_REGISTRY_ADAPTER_ID,
  providerId: MCP_REGISTRY_PROVIDER_ID,
  builtInProviderKey: MCP_REGISTRY_KEY,
  enabled: true,
  order: 0,
}

const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u
const SERVER_NAME_HASH_LENGTH = 6
const NPM_PACKAGE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_PAGES = 20

function safeHttpsUrl(value: string, label: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} is not a valid URL`)
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    throw new Error(`${label} must use credential-free standard HTTPS port 443 without a fragment`)
  }
  return url
}

function requireOrigin(value: string, expectedOrigin: string, label: string): URL {
  const url = safeHttpsUrl(value, label)
  if (url.origin !== expectedOrigin) throw new Error(`${label} changed the MCP registry origin`)
  return url
}

function hashSuffix(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, SERVER_NAME_HASH_LENGTH)
}

/**
 * Derive a stable `mcp-client` `serverName` (`[A-Za-z0-9_-]{1,32}`) from a
 * registry reverse-DNS id. The sanitized name is always suffixed with a short
 * deterministic hash of the original id, so distinct ids that sanitize to the
 * same text never collide, and long ids are truncated to the 32-char budget.
 */
export function deriveMcpServerName(id: string): string {
  const base = id
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^-+|-+$/gu, '')
  const root = base.length === 0 ? 'mcp' : base
  const suffix = hashSuffix(id)
  const budget = 32 - 1 - suffix.length
  const truncated = root.slice(0, budget).replace(/-+$/u, '')
  const name = `${truncated}-${suffix}`
  if (!SERVER_NAME_PATTERN.test(name)) throw new Error(`cannot derive a serverName from "${id}"`)
  return name
}

function compareServerVersions(left: McpRegistryServerEntry, right: McpRegistryServerEntry): number {
  const l = semverValid(left.server.version)
  const r = semverValid(right.server.version)
  if (l !== null && r !== null) return semverCompare(l, r)
  const lLatest = left._meta?.['io.modelcontextprotocol.registry/official']?.isLatest === true
  const rLatest = right._meta?.['io.modelcontextprotocol.registry/official']?.isLatest === true
  if (lLatest !== rLatest) return lLatest ? 1 : -1
  return left.server.version.localeCompare(right.server.version)
}

/** Keep one entry per `server.name`, the latest version. */
export function dedupeVersions(entries: readonly McpRegistryServerEntry[]): readonly McpRegistryServerEntry[] {
  const latest = new Map<string, McpRegistryServerEntry>()
  for (const entry of entries) {
    const existing = latest.get(entry.server.name)
    if (existing === undefined || compareServerVersions(entry, existing) > 0) {
      latest.set(entry.server.name, entry)
    }
  }
  return [...latest.values()]
}

function isActive(entry: McpRegistryServerEntry): boolean {
  return entry._meta?.['io.modelcontextprotocol.registry/official']?.status === 'active'
}

function npmPackageName(value: string): boolean {
  return NPM_PACKAGE_PATTERN.test(value)
}

function stdioFromPackage(
  registryType: string,
  identifier: string,
  transportType: string | undefined,
  runtimeArguments: readonly { readonly type?: string; readonly value?: string }[] | undefined,
  environmentVariables: readonly { readonly name: string; readonly isSecret?: boolean; readonly isRequired?: boolean; readonly default?: string }[] | undefined,
): McpStdioInstallMethod | undefined {
  if (registryType !== 'npm' || transportType !== 'stdio') return undefined
  if (identifier.length === 0 || identifier.length > 512 || !npmPackageName(identifier)) return undefined
  const args: string[] = ['-y', identifier]
  for (const arg of runtimeArguments ?? []) {
    if (arg.type === 'positional' && typeof arg.value === 'string' && arg.value.length > 0) {
      args.push(arg.value)
    }
  }
  const env: McpEnvVariable[] = []
  for (const variable of environmentVariables ?? []) {
    if (variable.name.length === 0 || variable.name.length > 256) continue
    env.push({
      name: variable.name,
      ...(variable.isSecret === true ? { secret: true } : {}),
      ...(variable.isRequired === true ? { required: true } : {}),
      ...(typeof variable.default === 'string' && variable.default.length > 0 ? { value: variable.default } : {}),
    })
  }
  return { kind: 'stdio', command: 'npx', args, env }
}

function streamableHttpFromRemote(
  type: 'streamable-http' | 'sse',
  url: string,
  headers: readonly { readonly name: string; readonly isSecret?: boolean; readonly isRequired?: boolean }[] | undefined,
): McpInstallMethod | undefined {
  if (type !== 'streamable-http') return undefined
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || (parsed.port && parsed.port !== '443')) {
      return undefined
    }
  } catch {
    return undefined
  }
  const resolved: McpHttpHeader[] = []
  for (const header of headers ?? []) {
    if (header.name.length === 0 || header.name.length > 256) continue
    resolved.push({
      name: header.name,
      ...(header.isSecret === true ? { secret: true } : {}),
      ...(header.isRequired === true ? { required: true } : {}),
    })
  }
  return { kind: 'streamable-http', url, headers: resolved }
}

function manualInstallDetail(entry: McpRegistryServerEntry): McpManualInstall {
  const packageTypes = new Set((entry.server.packages ?? []).map(pkg => pkg.registryType).filter(type => type !== 'npm'))
  const remoteTypes = new Set((entry.server.remotes ?? []).map(remote => remote.type).filter(type => type !== 'streamable-http'))
  if (packageTypes.size > 0) {
    return {
      reason: 'unsupported-package',
      detail: `Only unsupported package targets are available: ${[...packageTypes].sort().join(', ')}.`,
    }
  }
  return {
    reason: 'unsupported-transport',
    detail: `Only unsupported remote transports are available: ${[...remoteTypes].sort().join(', ')}.`,
  }
}

function registerIcon(
  entry: McpRegistryServerEntry,
  context: McpCatalogFetchContext,
): { readonly icon: { readonly assetRef: string } } | undefined {
  for (const icon of entry.server.icons ?? []) {
    try {
      const url = new URL(icon.src)
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) continue
      const hostname = url.hostname.toLowerCase()
      if (hostname.length === 0 || hostname.includes('*') || hostname.includes('@') || hostname.includes('/')) continue
      const assetRef = context.media.register({
        remoteUrl: url.href,
        role: 'plugin-icon',
        sourceRecordId: context.source.sourceRecordId,
        itemId: entry.server.name,
        allowedHostnames: [hostname],
      })
      return { icon: { assetRef } }
    } catch {
      // An invalid optional icon never hides an otherwise valid item.
    }
  }
  return undefined
}

/**
 * Normalize one active registry entry into an `McpServerItem`. Entries whose
 * official status is not `active` are dropped. When no installable transport
 * exists, the item keeps its `manualInstall` hint and an empty method list.
 */
export function normalizeServer(entry: McpRegistryServerEntry, context: McpCatalogFetchContext): McpServerItem | undefined {
  if (!isActive(entry)) return undefined
  const server = entry.server
  const id = server.name
  const installMethods: McpInstallMethod[] = []
  for (const pkg of server.packages ?? []) {
    const stdio = stdioFromPackage(
      pkg.registryType,
      pkg.identifier,
      pkg.transport?.type,
      pkg.runtimeArguments,
      pkg.environmentVariables,
    )
    if (stdio !== undefined) installMethods.push(stdio)
  }
  for (const remote of server.remotes ?? []) {
    const method = streamableHttpFromRemote(remote.type, remote.url, remote.headers)
    if (method !== undefined) installMethods.push(method)
  }
  const homepage = server.websiteUrl === undefined
    ? undefined
    : (() => {
        try {
          const parsed = new URL(server.websiteUrl)
          return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash
            ? parsed.href
            : undefined
        } catch {
          return undefined
        }
      })()
  const displayName = server.title ?? id.split('/').pop() ?? id
  const icon = registerIcon(entry, context)
  return {
    id,
    name: deriveMcpServerName(id),
    displayName,
    summary: server.description,
    version: server.version,
    installMethods,
    ...(installMethods.length === 0 ? { manualInstall: manualInstallDetail(entry) } : {}),
    ...(homepage === undefined ? {} : { homepage }),
    ...(icon === undefined ? {} : { media: icon }),
    provenance: {
      sourceRecordId: context.source.sourceRecordId,
      providerId: context.source.providerId,
      itemId: id,
    },
  }
}

/** Keep only items with at least one directly installable transport. */
export function filterInstallable(items: readonly McpServerItem[]): readonly McpServerItem[] {
  return items.filter(item => item.installMethods.length > 0)
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT
  if (!Number.isSafeInteger(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(limit, 1), MAX_LIMIT)
}

function listUrl(query: McpCatalogQuery): string {
  const url = new URL(MCP_REGISTRY_ENDPOINT)
  url.searchParams.set('limit', String(clampLimit(query.limit)))
  if (query.search !== undefined && query.search.length > 0) url.searchParams.set('search', query.search)
  if (query.cursor !== undefined && query.cursor.length > 0) url.searchParams.set('cursor', query.cursor)
  return url.href
}

export const mcpRegistryAdapter: McpCatalogAdapter = {
  adapterId: MCP_REGISTRY_ADAPTER_ID,
  async list(query, context) {
    const limit = clampLimit(query.limit)
    const entries: McpRegistryServerEntry[] = []
    let cursor = query.cursor
    let pages = 0
    while (pages < MAX_PAGES) {
      context.signal.throwIfAborted()
      const response = await context.http.getJson(
        listUrl({ ...query, ...cursor === undefined ? {} : { cursor } }),
        context.signal,
        { allowedOrigin: MCP_REGISTRY_ORIGIN },
      )
      context.signal.throwIfAborted()
      requireOrigin(response.finalUrl, MCP_REGISTRY_ORIGIN, 'MCP registry list final URL')
      const parsed = parseMcpRegistryList(response.value)
      entries.push(...parsed.servers)
      pages += 1
      const nextCursor = parsed.metadata?.nextCursor
      if (dedupeVersions(entries).length >= limit || nextCursor === undefined || nextCursor === cursor) break
      cursor = nextCursor
    }
    const items: McpServerItem[] = []
    for (const entry of dedupeVersions(entries)) {
      const item = normalizeServer(entry, context)
      if (item !== undefined) items.push(item)
    }
    return items.slice(0, limit)
  },
}
