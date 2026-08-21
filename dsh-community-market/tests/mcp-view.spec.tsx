// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  MarketMcpInstallationView,
  MarketMcpServerView,
  McpOperationExecuteResult,
  McpOperationPreviewResult,
} from '../src/api-types.js'
import { McpView } from '../src/client/McpView.js'
import {
  executeMcpOperation,
  mutateMcpServer,
  previewMcpOperation,
  readMcpInstallations,
  readMcpServers,
} from '../src/client/api.js'
import { en, type MarketLocaleKey } from '../src/client/locales.js'
import { MCP_REGISTRY_SOURCE_RECORD_ID } from '../src/mcp/contracts/identity.js'

vi.mock('../src/client/api.js', () => ({
  executeMcpOperation: vi.fn(),
  mutateMcpServer: vi.fn(),
  previewMcpOperation: vi.fn(),
  readMcpInstallations: vi.fn(),
  readMcpServers: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const t = ((key: MarketLocaleKey): string => en[key])

function makeServer(overrides: Partial<MarketMcpServerView> = {}): MarketMcpServerView {
  return {
    id: 'ac.inference.sh/mcp',
    name: 'ac_inference_sh_mcp',
    displayName: 'inference.sh',
    summary: 'Run 150+ AI apps',
    version: '1.0.1',
    installMethods: [{ kind: 'streamable-http', url: 'https://sh.inference.ac', headers: [] }],
    media: { icon: { assetRef: 'mktimg_0123456789abcdefghijklmnopqrstuv' } },
    provenance: {
      sourceRecordId: MCP_REGISTRY_SOURCE_RECORD_ID,
      providerId: 'io.modelcontextprotocol.registry',
      itemId: 'ac.inference.sh/mcp',
    },
    ...overrides,
  }
}

function makePreview(server: MarketMcpServerView): McpOperationPreviewResult {
  return {
    action: 'install',
    serverName: server.name,
    displayName: server.displayName,
    method: server.installMethods[0]!,
    expiresAt: '2026-08-18T00:05:00.000Z',
    previewId: 'opaque-mcp-install-preview',
  }
}

function makeExecute(server: MarketMcpServerView): McpOperationExecuteResult {
  return {
    action: 'install',
    receipt: {
      sourceRecordId: server.provenance.sourceRecordId,
      providerId: server.provenance.providerId,
      itemId: server.provenance.itemId,
      serverName: server.name,
      displayName: server.displayName,
      method: server.installMethods[0]!,
      installedAt: '2026-08-18T00:00:00.000Z',
    },
    displayName: server.displayName,
    restartToken: 'opaque-mcp-restart',
  }
}

describe('McpView', () => {
  it('one-click install sends the API-response sourceRecordId (built-in MCP source), not a catalog source id', async () => {
    const server = makeServer()
    vi.mocked(readMcpServers).mockResolvedValue({ servers: [server] })
    vi.mocked(readMcpInstallations).mockResolvedValue({ installations: [] })
    vi.mocked(previewMcpOperation).mockResolvedValue(makePreview(server))

    render(<McpView t={t} locale="en" requestRestart={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: en.mcpInstall }))

    await waitFor(() => {
      expect(previewMcpOperation).toHaveBeenCalledWith(
        server.provenance.sourceRecordId,
        server.id,
      )
    })
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('falls back to the compiled-in MCP source id when the API response lacks provenance', async () => {
    const server = makeServer({
      provenance: { sourceRecordId: '', providerId: 'io.modelcontextprotocol.registry', itemId: 'ac.inference.sh/mcp' },
    })
    vi.mocked(readMcpServers).mockResolvedValue({ servers: [server] })
    vi.mocked(readMcpInstallations).mockResolvedValue({ installations: [] })
    vi.mocked(previewMcpOperation).mockResolvedValue(makePreview(server))

    render(<McpView t={t} locale="en" requestRestart={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: en.mcpInstall }))

    await waitFor(() => {
      expect(previewMcpOperation).toHaveBeenCalledWith(
        MCP_REGISTRY_SOURCE_RECORD_ID,
        server.id,
      )
    })
  })

  it('renders server.media.icon through marketMediaAssetUrl and falls back safely on load error', async () => {
    const server = makeServer()
    vi.mocked(readMcpServers).mockResolvedValue({ servers: [server] })
    vi.mocked(readMcpInstallations).mockResolvedValue({ installations: [] })

    const { container } = render(<McpView t={t} locale="en" requestRestart={vi.fn()} />)

    const image = await waitFor(() => {
      const found = container.querySelector('img')
      expect(found).not.toBeNull()
      return found!
    })
    expect(image.getAttribute('src')).toBe(
      '/api/community-market/assets?ref=mktimg_0123456789abcdefghijklmnopqrstuv',
    )

    fireEvent.error(image)
    expect(container.querySelector('img')).toBeNull()
    // The fallback glyph and the install action remain usable.
    expect(screen.getByRole('button', { name: en.mcpInstall })).toBeTruthy()
  })

  it('executes the preview id on confirm and requests a restart', async () => {
    const server = makeServer()
    vi.mocked(readMcpServers).mockResolvedValue({ servers: [server] })
    vi.mocked(readMcpInstallations).mockResolvedValue({ installations: [] })
    vi.mocked(previewMcpOperation).mockResolvedValue(makePreview(server))
    vi.mocked(executeMcpOperation).mockResolvedValue(makeExecute(server))
    const requestRestart = vi.fn(async () => {})

    render(<McpView t={t} locale="en" requestRestart={requestRestart} />)

    fireEvent.click(await screen.findByRole('button', { name: en.mcpInstall }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: en.mcpInstall }))

    await waitFor(() => {
      expect(executeMcpOperation).toHaveBeenCalledWith('opaque-mcp-install-preview')
    })
    await waitFor(() => {
      expect(requestRestart).toHaveBeenCalledWith('opaque-mcp-restart')
    })
  })

  it('enables and disables installed servers through the mutation endpoint', async () => {
    const server = makeServer()
    const installation: MarketMcpInstallationView = {
      serverName: server.name,
      displayName: server.displayName,
      method: server.installMethods[0]!,
      enabled: true,
      installedAt: '2026-08-18T00:00:00.000Z',
    }
    vi.mocked(readMcpServers).mockResolvedValue({ servers: [server] })
    vi.mocked(readMcpInstallations).mockResolvedValue({ installations: [installation] })
    vi.mocked(mutateMcpServer).mockResolvedValue({ action: 'disable', serverName: server.name, restartToken: 'rt' })

    render(<McpView t={t} locale="en" requestRestart={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: en.mcpDisable }))
    await waitFor(() => {
      expect(mutateMcpServer).toHaveBeenCalledWith('disable', server.name)
    })
  })
})
