import type { CatalogSnapshot } from './contracts/generated/catalog-snapshot.js'
import type { CatalogSourceManifest } from './contracts/generated/catalog-source.js'
import type { LocalSourceRecord } from './contracts/types.js'
import type { McpInstallMethod, McpInstallReceipt, McpManualInstall } from './mcp/contracts/types.js'

export interface MarketBuiltInProvider {
  readonly key: string
  readonly name: string
  readonly description: string
  readonly providerId: string
  readonly adapterId: string
  readonly endpoint: string
  readonly attribution: {
    readonly name: string
    readonly url: string
    readonly notice?: string
  }
  readonly partnership: boolean
}

export interface MarketSourceView extends LocalSourceRecord {
  readonly name: string
  readonly description?: string
  readonly endpoint: string
  readonly homepage?: string
  readonly attribution?: {
    readonly name: string
    readonly url: string
    readonly notice?: string
  }
  readonly partnership: boolean
}

export interface MarketStateResponse {
  readonly sources: readonly MarketSourceView[]
  readonly builtIns: readonly MarketBuiltInProvider[]
  readonly desktopActions: {
    readonly openTerminal: boolean
    readonly requestRestart: boolean
  }
}

/** Display-only instruction reconstructed by the Host from normalized identity. */
export interface MarketManualInstallHint {
  readonly sourceRecordId: string
  readonly providerId: string
  readonly itemId: string
  readonly kind: 'npm' | 'github'
  /** GitHub instructions resolve a moving repository HEAD; exact npm targets do not. */
  readonly mutable: boolean
  readonly desktopVerification: 'not-verified'
  readonly displayCommand: string
}

export interface MarketCatalogSourceResult {
  readonly source: MarketSourceView
  readonly snapshot?: CatalogSnapshot
  readonly error?: string
  readonly stale: boolean
}

export interface MarketCatalogResponse {
  readonly query: Record<string, unknown>
  readonly results: readonly MarketCatalogSourceResult[]
  /** Categories derived from the complete active-source index, not only this page. */
  readonly categories: readonly string[]
  /** Display-only hints for items in this response page; never executable targets. */
  readonly manualInstall: readonly MarketManualInstallHint[]
  readonly metadata?: MarketCatalogMetadata
  readonly fetchedAt: string
}

/** Bounded catalog failure identity returned by the Host without upstream details. */
export type MarketCatalogErrorCode =
  | 'catalog-timeout'
  | 'catalog-invalid-response'
  | 'catalog-unavailable'

export interface MarketCatalogMetadata {
  readonly scannedAt: string
  readonly expiresAt: string
  readonly providerRevision?: string
  readonly cacheStatus: 'fresh' | 'cached'
}

export interface MarketSourceManifestResponse {
  readonly source: CatalogSourceManifest
}

export type MarketSourceMutation =
  | { readonly action: 'add-builtin'; readonly key: string }
  | { readonly action: 'add-standard'; readonly manifestUrl: string }
  | { readonly action: 'select'; readonly sourceRecordId: string }
  | { readonly action: 'enable'; readonly sourceRecordId: string }
  | { readonly action: 'disable'; readonly sourceRecordId: string }
  | { readonly action: 'move'; readonly sourceRecordId: string; readonly direction: 'up' | 'down' }
  | { readonly action: 'remove'; readonly sourceRecordId: string }

/** Durable proof that the Market installed one exact npm package into one profile. */
export interface MarketInstallReceipt {
  readonly receiptId: string
  readonly profileName: string
  readonly packageName: string
  readonly version: string
  readonly integrity: string
  readonly bundlePatch: string
  readonly sourceRecordId: string
  readonly providerId: string
  readonly itemId: string
  readonly displayName: string
  readonly installedAt: string
}

export type MarketInstallationView =
  | {
      readonly kind: 'managed'
      readonly status: 'active' | 'disabled'
      readonly action: 'uninstall'
      /** An active mutable bundle can be disabled without surrendering uninstall ownership. */
      readonly disableBundleId?: string
      /** A disabled mutable bundle can be enabled without surrendering uninstall ownership. */
      readonly enableBundleId?: string
      readonly receipt: MarketInstallReceipt
    }
  | {
      readonly kind: 'external'
      readonly status: 'active'
      readonly action: 'disable'
      /** Generation-scoped Host capability; never a path or package argument. */
      readonly bundleId: string
      readonly packageName: string
    }
  | {
      readonly kind: 'external'
      readonly status: 'disabled'
      readonly action: 'enable'
      /** Generation-scoped Host capability; never a path or package argument. */
      readonly bundleId: string
      readonly packageName: string
    }
  | {
      readonly kind: 'immutable'
      readonly status: 'active' | 'disabled'
      readonly action: 'none'
      readonly packageName: string
    }

export interface MarketInstallationsResponse {
  /** Host-reconciled direct bundles for the active profile. */
  readonly installations: readonly MarketInstallationView[]
}

/** Complete Host-derived structural subset; local install state never changes catalog membership. */
export interface MarketInstallableResponse {
  readonly sources: readonly MarketSourceView[]
  readonly items: CatalogSnapshot['items']
  readonly manualInstall: readonly MarketManualInstallHint[]
  readonly metadata: MarketCatalogMetadata
}

/** Renderer input for the non-mutating verification stage. */
export type MarketOperationPreviewRequest =
  | {
      readonly action: 'install'
      readonly sourceRecordId: string
      readonly itemId: string
    }
  | {
      readonly action: 'uninstall'
      readonly receiptId: string
    }
  | {
      readonly action: 'disable'
      /** Opaque exact target obtained from the current Host inventory. */
      readonly bundleId: string
    }
  | {
      readonly action: 'enable'
      /** Opaque exact target obtained from the current Host inventory. */
      readonly bundleId: string
    }

/** Host-verified facts shown before the user confirms a package mutation. */
export interface MarketOperationPreviewResponse {
  readonly action: 'install' | 'uninstall' | 'disable' | 'enable'
  readonly profileName: string
  readonly packageName: string
  readonly version?: string
  readonly displayName: string
  readonly expiresAt: string
  readonly previewId: string
}

export type MarketOperationExecuteResponse =
  | {
      readonly action: 'install'
      readonly receipt: MarketInstallReceipt
      readonly restartToken: string
    }
  | {
      readonly action: 'uninstall'
      readonly receiptId: string
      readonly packageName: string
      readonly restartToken: string
    }
  | {
      readonly action: 'disable'
      readonly packageName: string
      readonly restartToken: string
    }
  | {
      readonly action: 'enable'
      readonly packageName: string
      readonly restartToken: string
    }

export interface MarketDesktopActionResponse {
  readonly ok: true
}

/** Renderer-facing view of one normalized MCP server entry. */
export interface MarketMcpServerView {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly summary: string
  readonly version: string
  readonly installMethods: readonly McpInstallMethod[]
  readonly manualInstall?: McpManualInstall
  readonly homepage?: string
  readonly media?: { readonly icon: { readonly assetRef: string } }
  readonly provenance: {
    readonly sourceRecordId: string
    readonly providerId: string
    readonly itemId: string
  }
}

export interface MarketMcpServersResponse {
  readonly servers: readonly MarketMcpServerView[]
}

export type McpOperationPreviewRequest =
  | { readonly action: 'install'; readonly sourceRecordId: string; readonly itemId: string }

/** Host-verified facts shown before the user confirms an MCP install. */
export interface McpOperationPreviewResult {
  readonly action: 'install'
  readonly serverName: string
  readonly displayName: string
  readonly method: McpInstallMethod
  readonly expiresAt: string
  readonly previewId: string
}

export interface McpOperationExecuteRequest {
  readonly previewId: string
}

export interface McpOperationExecuteResult {
  readonly action: 'install'
  readonly receipt: McpInstallReceipt
  readonly displayName: string
  readonly restartToken: string
}

/** One installed MCP server reconciled with its Desktop enable state. */
export interface MarketMcpInstallationView {
  readonly serverName: string
  readonly displayName: string
  readonly method: McpInstallMethod
  readonly enabled: boolean
  readonly installedAt: string
}

export interface MarketMcpInstallationsResponse {
  readonly installations: readonly MarketMcpInstallationView[]
}

/** Renderer input for an MCP server enable/disable/remove mutation. */
export type MarketMcpMutationRequest =
  | { readonly action: 'enable'; readonly serverName: string }
  | { readonly action: 'disable'; readonly serverName: string }
  | { readonly action: 'remove'; readonly serverName: string }

/** Result of a completed MCP server state mutation. */
export interface MarketMcpMutationResult {
  readonly action: 'enable' | 'disable' | 'remove'
  readonly serverName: string
  readonly restartToken: string
}
