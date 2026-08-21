import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DesktopMcpError,
  DesktopMcpErrorCode,
  DesktopMcpService,
  readDesktopMcpServersSync,
  type DesktopMcp,
} from '../src/desktop-mcp.ts'
import type { DesktopMcpInstallMethod } from '../src/desktop-mcp.ts'

const stdioMethod: DesktopMcpInstallMethod = {
  kind: 'stdio',
  command: 'npx',
  args: ['-y', 'example-filesystem-server'],
  env: [],
}

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    try { chmodSync(root, 0o700) } catch {}
    rmSync(root, { recursive: true, force: true })
  }
})

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-mcp-'))
  roots.push(root)
  return root
}

async function makeService(root: string): Promise<{ ctx: Context; service: DesktopMcp; dispose(): Promise<void> }> {
  const ctx = new Context()
  const fiber = ctx.plugin(DesktopMcpService, { profileName: 'desktop', statePath: join(root, 'desktop-mcp.json') })
  await fiber
  const service = ctx.get('desktopMcp')
  if (service === undefined) throw new Error('desktopMcp did not mount')
  return { ctx, service, dispose: fiber.dispose }
}

describe('desktop MCP state service', () => {
  it('persists an installed server and reads it back', async () => {
    const root = temporaryRoot()
    const harness = await makeService(root)
    const service = harness.service
    await service.addMcpServer({
      serverName: 'example-filesystem',
      displayName: 'Filesystem',
      method: stdioMethod,
    })

    const servers = service.listMcpServers()
    expect(servers).toHaveLength(1)
    expect(servers[0]?.serverName).toBe('example-filesystem')
    expect(servers[0]?.enabled).toBe(true)

    // The pure sync reader sees the same state from disk.
    const statePath = join(root, 'desktop-mcp.json')
    const fromDisk = readDesktopMcpServersSync(statePath, 'desktop')
    expect(fromDisk).toHaveLength(1)
    expect(fromDisk[0]?.displayName).toBe('Filesystem')
  })

  it('rejects a duplicate server name', async () => {
    const root = temporaryRoot()
    const harness = await makeService(root)
    const service = harness.service
    await service.addMcpServer({ serverName: 'example-filesystem', displayName: 'Filesystem', method: stdioMethod })
    await expect(service.addMcpServer({
      serverName: 'example-filesystem',
      displayName: 'Filesystem again',
      method: stdioMethod,
    })).rejects.toThrow(DesktopMcpError)
  })

  it('toggles enable/disable and rejects redundant toggles', async () => {
    const root = temporaryRoot()
    const harness = await makeService(root)
    const service = harness.service
    await service.addMcpServer({ serverName: 'example-filesystem', displayName: 'Filesystem', method: stdioMethod })

    await service.setMcpServerEnabled('example-filesystem', false)
    expect(service.listMcpServers()[0]?.enabled).toBe(false)

    await expect(service.setMcpServerEnabled('example-filesystem', false)).rejects.toMatchObject({
      code: DesktopMcpErrorCode.AlreadyDisabled,
    })

    await service.setMcpServerEnabled('example-filesystem', true)
    expect(service.listMcpServers()[0]?.enabled).toBe(true)
  })

  it('removes an installed server and rejects removal of a missing one', async () => {
    const root = temporaryRoot()
    const harness = await makeService(root)
    const service = harness.service
    await service.addMcpServer({ serverName: 'example-filesystem', displayName: 'Filesystem', method: stdioMethod })

    await service.removeMcpServer('example-filesystem')
    expect(service.listMcpServers()).toHaveLength(0)

    await expect(service.removeMcpServer('example-filesystem')).rejects.toMatchObject({
      code: DesktopMcpErrorCode.NotInstalled,
    })
  })

  it('persists state with a 0600 file mode', async () => {
    const root = temporaryRoot()
    const harness = await makeService(root)
    const service = harness.service
    await service.addMcpServer({ serverName: 'example-filesystem', displayName: 'Filesystem', method: stdioMethod })

    const statePath = join(root, 'desktop-mcp.json')
    const stat = await import('node:fs/promises').then(fs => fs.stat(statePath))
    expect(stat.mode & 0o777).toBe(0o600)
    const raw = readFileSync(statePath, 'utf8')
    expect(raw).toContain('example-filesystem')
  })
})
