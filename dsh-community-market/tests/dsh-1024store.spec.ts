import { describe, expect, it, vi } from 'vitest'
import {
  dsh1024StoreAdapter,
  DSH_1024STORE_ADAPTER_ID,
  DSH_1024STORE_ENDPOINT,
  DSH_1024STORE_KEY,
  DSH_1024STORE_PROVIDER_ID,
} from '../src/adapters/dsh-1024store.js'
import type { CatalogHttpClient, LocalSourceRecord } from '../src/contracts/index.js'

const source = (): LocalSourceRecord => ({
  sourceRecordId: '000757bd-8263-4b96-8e33-8c224f2ecd11',
  registrationKind: 'built-in',
  adapterId: DSH_1024STORE_ADAPTER_ID,
  providerId: DSH_1024STORE_PROVIDER_ID,
  builtInProviderKey: DSH_1024STORE_KEY,
  enabled: true,
  order: 0,
})

function rawItem(index: number): Record<string, unknown> {
  return {
    id: `owner/plugin-${index}`,
    name: `plugin-${index}`,
    owner: 'owner',
    url: `https://github.com/owner/plugin-${index}`,
    category: 'memory',
    description: { en: `Plugin ${index} summary` },
    stars: 10,
    installCount: 5,
    pushedAt: '2026-08-17T12:00:00Z',
  }
}

function payload(packageCount: number, declaredTotal: number): unknown {
  return {
    packages: Array.from({ length: packageCount }, (_, index) => rawItem(index)),
    rankings: [],
    categories: [],
    meta: {
      total: declaredTotal,
      catalogTotal: declaredTotal,
      updated: '2026-08-21',
      generatedAt: '2026-08-21T12:35:15.000Z',
      revision: `sha256:${'a'.repeat(64)}`,
      source: 'kv',
      metricCoverage: declaredTotal,
    },
  }
}

function scan(value: unknown) {
  const http: CatalogHttpClient = {
    getJson: vi.fn(async () => ({ value, finalUrl: DSH_1024STORE_ENDPOINT })),
  }
  return dsh1024StoreAdapter.scanCatalog!({ limit: 50, locale: 'en' }, {
    source: source(),
    signal: new AbortController().signal,
    http,
    media: { register: vi.fn(() => 'mktimg_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') },
  })
}

describe('dsh1024store adapter', () => {
  it('scans the fixed provider window without treating the database total as a completeness requirement', async () => {
    const snapshots = await scan(payload(300, 8899))

    const items = snapshots.flatMap(snapshot => snapshot.items)
    expect(items).toHaveLength(300)
    expect(snapshots).toHaveLength(3)
    expect(snapshots.every(snapshot => snapshot.page.total === 300)).toBe(true)
  })

  it('rejects a window that exceeds the declared provider total', async () => {
    await expect(scan(payload(301, 300))).rejects.toThrow(/exceeded the provider total/u)
  })

  it('tolerates a missing provider total by reporting the received item count', async () => {
    const value = payload(100, 8899)
    delete (value as { meta?: Record<string, unknown> }).meta
    const snapshots = await scan(value)

    const items = snapshots.flatMap(snapshot => snapshot.items)
    expect(items).toHaveLength(100)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.page.total).toBe(100)
  })
})
