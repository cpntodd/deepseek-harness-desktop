import { describe, expect, it, vi } from 'vitest'
import {
  dedupeVersions,
  deriveMcpServerName,
  filterInstallable,
  mcpRegistryAdapter,
  MCP_REGISTRY_ADAPTER_ID,
  MCP_REGISTRY_ORIGIN,
  MCP_REGISTRY_PROVIDER_ID,
  MCP_REGISTRY_SOURCE,
  normalizeServer,
} from '../src/mcp/adapters/mcp-registry.js'
import type { McpCatalogFetchContext, McpServerItem } from '../src/mcp/contracts/types.js'
import { MCP_REGISTRY_SOURCE_RECORD_ID } from '../src/mcp/contracts/identity.js'
import registrySample from './fixtures/mcp-registry-sample.json' with { type: 'json' }
import searchSample from './fixtures/mcp-search.json' with { type: 'json' }

function fetchContext(overrides?: Partial<McpCatalogFetchContext>): McpCatalogFetchContext {
  return {
    signal: new AbortController().signal,
    source: MCP_REGISTRY_SOURCE,
    http: {
      getJson: vi.fn(async () => ({
        value: registrySample,
        finalUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers?limit=2',
      })),
    } as never,
    media: {
      register: vi.fn(async () => 'mktimg_mcp'),
    } as never,
    ...overrides,
  }
}

function entry(name: string, version = '1.0.0'): unknown {
  return { server: { name, version }, _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } } }
}

describe('MCP registry adapter', () => {
  it('declares the reviewed adapter identity', () => {
    expect(MCP_REGISTRY_ADAPTER_ID).toBe('market.mcp-registry-v1')
    expect(mcpRegistryAdapter.adapterId).toBe(MCP_REGISTRY_ADAPTER_ID)
    expect(MCP_REGISTRY_PROVIDER_ID).toBe('io.modelcontextprotocol.registry')
  })

  it('uses the exposed built-in source record id for the registry source', () => {
    // The renderer relies on this id (from `server.provenance` or the shared
    // constant) to preview installs; the compiled-in source must match it.
    expect(MCP_REGISTRY_SOURCE.sourceRecordId).toBe(MCP_REGISTRY_SOURCE_RECORD_ID)
  })

  it('deriveMcpServerName maps reverse-DNS ids to the serverName charset', () => {
    const name = deriveMcpServerName('ac.inference.sh/mcp')
    expect(name).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
    // Same input always maps to the same output.
    expect(deriveMcpServerName('ac.inference.sh/mcp')).toBe(name)
    // Distinct inputs do not collide (suffix hash disambiguates).
    expect(deriveMcpServerName('io.modelcontextprotocol/filesystem')).not.toBe(name)
  })

  it('dedupeVersions keeps one entry per server name', () => {
    const entries = [
      entry('com.pulsemcp/remote-filesystem'),
      entry('com.pulsemcp/remote-filesystem'),
      entry('ac.inference.sh/mcp'),
    ] as never[]
    const deduped = dedupeVersions(entries)
    expect(deduped).toHaveLength(2)
  })

  it('normalizeServer produces an item with provenance and install methods', () => {
    const context = fetchContext()
    const sample = (registrySample as { servers: unknown[] }).servers[0]
    const item = normalizeServer(sample as never, context)

    expect(item).toBeDefined()
    expect(item?.id).toBe('ac.inference.sh/mcp')
    expect(item?.name).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
    expect(item?.provenance).toEqual({
      sourceRecordId: MCP_REGISTRY_SOURCE.sourceRecordId,
      providerId: MCP_REGISTRY_PROVIDER_ID,
      itemId: 'ac.inference.sh/mcp',
    })
    // The captured sample has two streamable-http remotes -> both become methods.
    expect(item?.installMethods.length).toBeGreaterThanOrEqual(2)
    expect(item?.installMethods.every(m => m.kind === 'streamable-http')).toBe(true)
  })

  it('normalizeServer maps npm/stdio packages to an npx install method', () => {
    const context = fetchContext()
    const sample = (searchSample as { servers: unknown[] }).servers[0]
    const item = normalizeServer(sample as never, context)

    expect(item).toBeDefined()
    expect(item?.id).toBe('com.pulsemcp/remote-filesystem')
    const stdio = item?.installMethods.find(m => m.kind === 'stdio')
    expect(stdio).toBeDefined()
    if (stdio?.kind === 'stdio') {
      expect(stdio.command).toBe('npx')
      expect(stdio.args[0]).toBe('-y')
      expect(stdio.args[1]).toBe('remote-filesystem-mcp-server')
    }
  })

  it('normalizeServer drops inactive entries', () => {
    const context = fetchContext()
    const inactive = {
      server: { name: 'io.example/disabled', version: '1.0.0' },
      _meta: { 'io.modelcontextprotocol.registry/official': { status: 'archived' } },
    }
    expect(normalizeServer(inactive as never, context)).toBeUndefined()
  })

  it('filterInstallable keeps only items with an installable method', () => {
    const context = fetchContext()
    const withMethod = normalizeServer((registrySample as { servers: unknown[] }).servers[0] as never, context)
    const withoutMethod = {
      id: 'io.example/oci-only',
      name: 'oci-only',
      displayName: 'OCI only',
      summary: '',
      version: '1.0.0',
      installMethods: [],
      manualInstall: { reason: 'unsupported-package', detail: 'oci' },
      provenance: { sourceRecordId: 'x', providerId: 'y', itemId: 'z' },
    } as unknown as McpServerItem
    const kept = filterInstallable([withMethod as McpServerItem, withoutMethod])
    expect(kept).toContain(withMethod)
    expect(kept).not.toContain(withoutMethod)
  })

  it('pins responses to the registry origin', async () => {
    const getJson = vi.fn(async (_url: string, _signal: AbortSignal, _options?: unknown) => ({
      value: registrySample,
      finalUrl: 'https://evil.example/v0.1/servers',
    }))
    const http = { getJson }
    const context = fetchContext({ http: http as never })
    await expect(mcpRegistryAdapter.list({}, context)).rejects.toThrow(/origin/i)
    expect(http.getJson).toHaveBeenCalledOnce()
    const options = getJson.mock.calls[0]?.[2] as { allowedOrigin?: string } | undefined
    expect(options?.allowedOrigin).toBe(MCP_REGISTRY_ORIGIN)
  })
})
