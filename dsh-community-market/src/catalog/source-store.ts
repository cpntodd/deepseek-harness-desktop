import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { MarketInstallReceipt } from '../api-types.js'
import type { McpInstallReceipt } from '../mcp/contracts/types.js'
import type { CatalogSnapshot } from '../contracts/generated/catalog-snapshot.js'
import { validateLocalSourceRecords } from '../contracts/validate.js'
import type { CatalogSourceStore, LocalSourceRecord } from '../contracts/types.js'

export interface MarketCatalogCache {
  readonly version: 1
  readonly sourceRecordId: string
  readonly locale: string
  readonly savedAt: string
  readonly snapshot: CatalogSnapshot
  readonly categories: readonly string[]
  readonly scannedAt: string
  readonly expiresAt: string
  readonly providerRevision?: string
}

export interface MarketSettingsDocument {
  readonly sources: readonly LocalSourceRecord[]
  readonly installReceipts?: readonly MarketInstallReceipt[]
  readonly mcpInstallReceipts?: readonly McpInstallReceipt[]
  readonly catalogCache?: MarketCatalogCache
}

/**
 * Normalize the source registry to a stable user-defined order while preserving
 * every per-source `enabled` flag. Multiple sources may be enabled at once; an
 * all-disabled registry keeps its explicit no-selection state.
 */
export function normalizeActiveSourceRecords(
  records: readonly LocalSourceRecord[],
): readonly LocalSourceRecord[] {
  return [...records].sort((left, right) => left.order - right.order)
}

export class SettingsCatalogSourceStore implements CatalogSourceStore {
  constructor(private readonly scope: SettingsScope<MarketSettingsDocument>) {}

  async load(): Promise<readonly LocalSourceRecord[]> {
    const records = [...this.scope.get().sources]
    validateLocalSourceRecords(records)
    return normalizeActiveSourceRecords(records)
  }

  async save(records: readonly LocalSourceRecord[]): Promise<void> {
    const normalized = normalizeActiveSourceRecords(records)
    validateLocalSourceRecords(normalized)
    await this.scope.update({ sources: normalized })
  }
}

export class MemoryCatalogSourceStore implements CatalogSourceStore {
  private records: readonly LocalSourceRecord[] = []

  async load(): Promise<readonly LocalSourceRecord[]> {
    return this.records
  }

  async save(records: readonly LocalSourceRecord[]): Promise<void> {
    const normalized = normalizeActiveSourceRecords(records)
    validateLocalSourceRecords(normalized)
    this.records = normalized.map(record => ({ ...record }))
  }
}
