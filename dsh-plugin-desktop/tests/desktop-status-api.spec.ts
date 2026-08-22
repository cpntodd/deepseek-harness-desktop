import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_STATUS_MCP_INSTALLATIONS_PATH,
  readDesktopLspStatus,
  readDesktopMcpStatus,
} from '../src/client/desktop-status-api.ts'
import { DESKTOP_STATUS_LSP_PROVIDERS_PATH } from '../src/desktop-status-contract.ts'

afterEach(() => { vi.unstubAllGlobals() })

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('desktop status API', () => {
  it('reads MCP installations from the community-market route, with no-store cache', async () => {
    const fetcher = vi.fn(async () => json({ installations: [
      { serverName: 'mcp-hub', displayName: 'mcp-hub', enabled: true, installedAt: '2026-08-18T00:00:00.000Z' },
    ] }))
    vi.stubGlobal('fetch', fetcher)

    const result = await readDesktopMcpStatus()

    expect(fetcher).toHaveBeenCalledWith(DESKTOP_STATUS_MCP_INSTALLATIONS_PATH, expect.objectContaining({ cache: 'no-store' }))
    expect(result.installations).toHaveLength(1)
    expect(result.installations[0]?.serverName).toBe('mcp-hub')
  })

  it('reads configured LSP providers from the desktop route', async () => {
    const fetcher = vi.fn(async () => json({ providers: [
      { id: 'typescript', displayName: 'Typescript', languages: ['typescript'] },
    ] }))
    vi.stubGlobal('fetch', fetcher)

    const result = await readDesktopLspStatus()

    expect(fetcher).toHaveBeenCalledWith(DESKTOP_STATUS_LSP_PROVIDERS_PATH, expect.objectContaining({ cache: 'no-store' }))
    expect(result.providers[0]?.id).toBe('typescript')
  })

  it('throws the server error message on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'forbidden' }, 403)))

    await expect(readDesktopMcpStatus()).rejects.toThrow('forbidden')
  })
})
