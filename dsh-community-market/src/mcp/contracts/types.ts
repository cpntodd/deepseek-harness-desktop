import type { CatalogHttpClient, CatalogMediaRegistrar, LocalSourceRecord } from '../../contracts/types.js'

/**
 * One reviewed, directly-installable transport for an MCP server. The Host
 * revalidates this exact value before it can create an install receipt.
 */
export type McpInstallMethod = McpStdioInstallMethod | McpStreamableHttpInstallMethod

export interface McpStdioInstallMethod {
  readonly kind: 'stdio'
  /** Fixed reviewed launcher; only `npx` and `uvx` pass Host revalidation. */
  readonly command: string
  readonly args: readonly string[]
  readonly env: readonly McpEnvVariable[]
}

export interface McpStreamableHttpInstallMethod {
  readonly kind: 'streamable-http'
  /** Credential-free HTTPS endpoint on standard port 443. */
  readonly url: string
  readonly headers: readonly McpHttpHeader[]
}

export interface McpEnvVariable {
  readonly name: string
  readonly secret?: boolean
  readonly required?: boolean
  /** Registry-supplied default the desktop may prefill (Phase 2/3). */
  readonly value?: string
}

export interface McpHttpHeader {
  readonly name: string
  readonly secret?: boolean
  readonly required?: boolean
}

export interface McpManualInstall {
  readonly reason: 'unsupported-transport' | 'unsupported-package'
  readonly detail: string
}

export interface McpServerItem {
  /** Registry server name in reverse-DNS form, e.g. `com.pulsemcp/remote-filesystem`. */
  readonly id: string
  /** Derived `mcp-client` `serverName`, `[A-Za-z0-9_-]{1,32}`. */
  readonly name: string
  readonly displayName: string
  readonly summary: string
  readonly version: string
  readonly installMethods: readonly McpInstallMethod[]
  /** Present only when no installable method exists, so the item is browse-only. */
  readonly manualInstall?: McpManualInstall
  readonly homepage?: string
  readonly media?: { readonly icon: { readonly assetRef: string } }
  readonly provenance: {
    readonly sourceRecordId: string
    readonly providerId: string
    readonly itemId: string
  }
}

export interface McpCatalogQuery {
  readonly search?: string
  readonly limit?: number
  readonly cursor?: string
  readonly locale?: string
}

export interface McpCatalogFetchContext {
  readonly signal: AbortSignal
  readonly source: LocalSourceRecord
  readonly http: CatalogHttpClient
  readonly media: CatalogMediaRegistrar
}

export interface McpCatalogAdapter {
  readonly adapterId: string
  list(query: McpCatalogQuery, context: McpCatalogFetchContext): Promise<readonly McpServerItem[]>
}

/** Durable proof that the Host accepted one MCP server install method. */
export interface McpInstallReceipt {
  readonly sourceRecordId: string
  readonly providerId: string
  readonly itemId: string
  readonly serverName: string
  /** Human-facing name shown by the installed list; derived from the registry entry. */
  readonly displayName: string
  readonly method: McpInstallMethod
  readonly installedAt: string
}
