import { describe, expect, it, vi } from 'vitest'
import { McpInstallService } from '../src/mcp/install/service.js'
import type { McpCatalogAdapter, McpServerItem } from '../src/mcp/contracts/types.js'
import { MCP_REGISTRY_PROVIDER_ID, MCP_REGISTRY_SOURCE } from '../src/mcp/adapters/mcp-registry.js'

function stdioItem(overrides?: Partial<McpServerItem>): McpServerItem {
  return {
    id: 'com.example/filesystem',
    name: 'com_example_filesystem',
    displayName: 'Filesystem',
    summary: 'Example filesystem server',
    version: '1.0.0',
    installMethods: [
      { kind: 'stdio', command: 'npx', args: ['-y', 'example-filesystem-server'], env: [] },
    ],
    provenance: {
      sourceRecordId: MCP_REGISTRY_SOURCE.sourceRecordId,
      providerId: MCP_REGISTRY_PROVIDER_ID,
      itemId: 'com.example/filesystem',
    },
    ...overrides,
  }
}

function fakeScope() {
  let document: { mcpInstallReceipts?: unknown } = {}
  return {
    get: () => document,
    update: vi.fn(async (patch: unknown) => {
      document = { ...document, ...(patch as object) }
    }),
  }
}

function makeService(scope: ReturnType<typeof fakeScope>, adapter: McpCatalogAdapter) {
  return new McpInstallService(
    scope as never,
    adapter,
    MCP_REGISTRY_SOURCE,
    { getJson: vi.fn() } as never,
    { register: vi.fn(async () => 'mktimg_mcp') } as never,
  )
}

describe('MCP install service', () => {
  it('previews an installable stdio server with an npx plan', async () => {
    const scope = fakeScope()
    const item = stdioItem()
    const adapter: McpCatalogAdapter = {
      adapterId: 'market.mcp-registry-v1',
      list: vi.fn(async () => [item]),
    }
    const service = makeService(scope, adapter)

    const preview = await service.previewInstall(MCP_REGISTRY_SOURCE.sourceRecordId, item.id, new AbortController().signal)

    expect(preview.action).toBe('install')
    expect(preview.serverName).toBe('com_example_filesystem')
    expect(preview.method.kind).toBe('stdio')
    if (preview.method.kind === 'stdio') {
      expect(preview.method.command).toBe('npx')
      expect(preview.method.args).toEqual(['-y', 'example-filesystem-server'])
    }
  })

  it('executes a preview and persists a receipt plus a restart token', async () => {
    const scope = fakeScope()
    const item = stdioItem()
    const adapter: McpCatalogAdapter = {
      adapterId: 'market.mcp-registry-v1',
      list: vi.fn(async () => [item]),
    }
    const service = makeService(scope, adapter)
    const signal = new AbortController().signal
    const preview = await service.previewInstall(MCP_REGISTRY_SOURCE.sourceRecordId, item.id, signal)

    const result = await service.executeInstall(preview.previewId, signal)

    expect(result.action).toBe('install')
    expect(result.receipt.serverName).toBe('com_example_filesystem')
    expect(result.restartToken).toBeTruthy()
    expect(scope.update).toHaveBeenCalledOnce()
    expect(scope.get().mcpInstallReceipts).toHaveLength(1)
  })

  it('rejects a preview for a server not owned by the MCP source', async () => {
    const scope = fakeScope()
    const adapter: McpCatalogAdapter = {
      adapterId: 'market.mcp-registry-v1',
      list: vi.fn(async () => []),
    }
    const service = makeService(scope, adapter)

    await expect(service.previewInstall('other-source', 'com.example/x', new AbortController().signal))
      .rejects.toThrow(/not owned by an enabled MCP source/i)
  })

  it('rejects a preview when the server has no installable transport', async () => {
    const scope = fakeScope()
    const item = stdioItem({ installMethods: [], manualInstall: { reason: 'unsupported-transport', detail: 'sse' } })
    const adapter: McpCatalogAdapter = {
      adapterId: 'market.mcp-registry-v1',
      list: vi.fn(async () => [item]),
    }
    const service = makeService(scope, adapter)

    await expect(service.previewInstall(MCP_REGISTRY_SOURCE.sourceRecordId, item.id, new AbortController().signal))
      .rejects.toThrow(/no directly installable transport/i)
  })

  it('denies an unsafe stdio command at preview', async () => {
    const scope = fakeScope()
    const item = stdioItem({
      installMethods: [{ kind: 'stdio', command: 'curl', args: ['https://evil.example'], env: [] }],
    })
    const adapter: McpCatalogAdapter = {
      adapterId: 'market.mcp-registry-v1',
      list: vi.fn(async () => [item]),
    }
    const service = makeService(scope, adapter)

    await expect(service.previewInstall(MCP_REGISTRY_SOURCE.sourceRecordId, item.id, new AbortController().signal))
      .rejects.toThrow(/unsupported stdio command/i)
  })

  it('denies a streamable-http endpoint with credentials', async () => {
    const scope = fakeScope()
    const item = stdioItem({
      installMethods: [{ kind: 'streamable-http', url: 'https://user:pass@example.com/mcp', headers: [] }],
    })
    const adapter: McpCatalogAdapter = {
      adapterId: 'market.mcp-registry-v1',
      list: vi.fn(async () => [item]),
    }
    const service = makeService(scope, adapter)

    await expect(service.previewInstall(MCP_REGISTRY_SOURCE.sourceRecordId, item.id, new AbortController().signal))
      .rejects.toThrow(/not a credential-free HTTPS URL/i)
  })

  it('rejects a duplicate install of the same server', async () => {
    const scope = fakeScope()
    const item = stdioItem()
    const adapter: McpCatalogAdapter = {
      adapterId: 'market.mcp-registry-v1',
      list: vi.fn(async () => [item]),
    }
    const service = makeService(scope, adapter)
    const signal = new AbortController().signal
    const preview = await service.previewInstall(MCP_REGISTRY_SOURCE.sourceRecordId, item.id, signal)
    await service.executeInstall(preview.previewId, signal)

    const second = await service.previewInstall(MCP_REGISTRY_SOURCE.sourceRecordId, item.id, signal)
    await expect(service.executeInstall(second.previewId, signal)).rejects.toThrow(/already has an install receipt/i)
  })
})
