/** Desktop-owned MCP server state and enable/disable persistence. */

import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs'
import { chmod, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { type Context, Service } from '@deepseek-ai/cordis'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { assertDesktopProfileName } from './profile-manager.ts'

const BIN_NAME = 'dsh-plugin-desktop'
const STATE_VERSION = 1
const STATE_FILE_MODE = 0o600
const STATE_DIRECTORY_MODE = 0o700
const MAX_STATE_BYTES = 64 * 1024
const MAX_PROFILES = 64
const MAX_MCP_SERVERS = 256
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u

/**
 * The install method that produced an `mcp-client` config: either a stdio
 * command (npx/uvx running a packaged server) or a streamable-http endpoint.
 * Structural twin of the market's `McpInstallMethod` (duck-typed, no import
 * coupling with the market package).
 */
export type DesktopMcpInstallMethod =
  | { kind: 'stdio'; command: string; args: string[]; env: Array<{ name: string; secret?: boolean; required?: boolean; value?: string }> }
  | { kind: 'streamable-http'; url: string; headers: Array<{ name: string; secret?: boolean; required?: boolean }> }

/** One installed MCP server for the active profile. */
export interface DesktopMcpServer {
  /** Stable server namespace used as the `mcp-client` serverName. */
  readonly serverName: string
  /** Informational display name from the registry catalog. */
  readonly displayName: string
  /** The install method that produced the `mcp-client` config. */
  readonly method: DesktopMcpInstallMethod
  /** Whether the `mcp-client` row is composed on the next generation. */
  readonly enabled: boolean
  /** ISO timestamp of the install. */
  readonly installedAt: string
}

/** Versioned on-disk MCP state. */
export interface DesktopMcpState {
  readonly version: 1
  readonly profiles: readonly {
    readonly profileName: string
    readonly servers: readonly DesktopMcpServer[]
  }[]
}

/** Error codes surfaced by {@link DesktopMcpService}. */
export enum DesktopMcpErrorCode {
  InvalidTarget = 'invalid-target',
  AlreadyInstalled = 'already-installed',
  NotInstalled = 'not-installed',
  AlreadyEnabled = 'already-enabled',
  AlreadyDisabled = 'already-disabled',
  PersistenceFailed = 'persistence-failed',
}

export class DesktopMcpError extends Error {
  constructor(readonly code: DesktopMcpErrorCode, message: string) {
    super(message)
  }
}

/** The mounted MCP state capability (`ctx.desktopMcp`). */
export interface DesktopMcp {
  listMcpServers(): readonly DesktopMcpServer[]
  addMcpServer(input: { serverName: string; displayName: string; method: DesktopMcpInstallMethod }): Promise<void>
  setMcpServerEnabled(serverName: string, enabled: boolean): Promise<void>
  removeMcpServer(serverName: string): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Desktop-owned MCP server state and enable/disable capability. */
    desktopMcp: DesktopMcp
  }
}

/** Parsed state with validation of the versioned layout. */
function parseState(value: string): DesktopMcpState {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state is not valid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state has an invalid layout')
  }
  const state = parsed as Record<string, unknown>
  if (state.version !== STATE_VERSION) {
    throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, `unsupported desktop MCP state version ${String(state.version)}`)
  }
  const profiles = state.profiles
  if (!Array.isArray(profiles)) {
    throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state has no profiles array')
  }
  if (profiles.length > MAX_PROFILES) {
    throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state exceeds the profile limit')
  }
  for (const profile of profiles) {
    if (profile === null || typeof profile !== 'object') {
      throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state has a malformed profile')
    }
    const record = profile as Record<string, unknown>
    if (typeof record.profileName !== 'string' || !Array.isArray(record.servers)) {
      throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state has a malformed profile')
    }
    if (record.servers.length > MAX_MCP_SERVERS) {
      throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state exceeds the server limit')
    }
    for (const server of record.servers) {
      if (server === null || typeof server !== 'object') {
        throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state has a malformed server')
      }
      const entry = server as Record<string, unknown>
      if (typeof entry.serverName !== 'string' || !SERVER_NAME_PATTERN.test(entry.serverName)) {
        throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state has an invalid server name')
      }
    }
  }
  return parsed as DesktopMcpState
}

/** Serialize the state in a stable, readable layout. */
function renderState(state: DesktopMcpState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

function emptyState(): DesktopMcpState {
  return { version: STATE_VERSION, profiles: [] }
}

function profileServers(state: DesktopMcpState, profileName: string): readonly DesktopMcpServer[] {
  return state.profiles.find(profile => profile.profileName === profileName)?.servers ?? []
}

async function readStateFile(statePath: string): Promise<DesktopMcpState> {
  let fd: number | undefined
  try {
    try {
      fd = openSync(statePath, constants.O_RDONLY)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState()
      throw error
    }
    const stat = fstatSync(fd)
    if (stat.size > MAX_STATE_BYTES) {
      throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state file is too large')
    }
    return parseState(readFileSync(statePath, 'utf8'))
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** Read the MCP servers declared for one profile, without the service. */
export async function readDesktopMcpServers(statePath: string, profileName: string): Promise<readonly DesktopMcpServer[]> {
  assertDesktopProfileName(profileName)
  const state = await readStateFile(statePath)
  return profileServers(state, profileName)
}

/**
 * Synchronous read of the MCP servers declared for one profile. Used by
 * profile composition, which assembles rows synchronously; missing or invalid
 * state degrades to the empty list (the service is the authority for writes).
 */
export function readDesktopMcpServersSync(statePath: string, profileName: string): readonly DesktopMcpServer[] {
  assertDesktopProfileName(profileName)
  let state: DesktopMcpState
  try {
    state = readStateFileSync(statePath)
  } catch (error) {
      return []
  }
  return profileServers(state, profileName)
}

function readStateFileSync(statePath: string): DesktopMcpState {
  let fd: number | undefined
  try {
    try {
      fd = openSync(statePath, constants.O_RDONLY)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState()
      throw error
    }
    const stat = fstatSync(fd)
    if (stat.size > MAX_STATE_BYTES) throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state file is too large')
    return parseState(readFileSync(statePath, 'utf8'))
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Desktop-owned MCP server state: persists which servers are installed and
 * whether each is enabled, so profile composition can emit one `mcp-client`
 * row per enabled server.
 */
/** Bootstrap options for {@link DesktopMcpService}. */
export interface DesktopMcpBootstrap {
  /** Active profile the service manages MCP state for. */
  readonly profileName: string
  /** Absolute path of the Desktop MCP state file. */
  readonly statePath: string
}

export class DesktopMcpService extends Service {
  private state: DesktopMcpState

  constructor(ctx: Context, private readonly bootstrap: DesktopMcpBootstrap) {
    super(ctx, 'desktopMcp')
    this.state = emptyState()
    ctx.effect(
      async () => {
        const { profileName, statePath } = this.bootstrap
        assertDesktopProfileName(profileName)
        if (!isAbsolute(statePath)) {
          throw new DesktopMcpError(DesktopMcpErrorCode.InvalidTarget, 'desktop MCP state path must be absolute')
        }
        const parent = dirname(statePath)
        await mkdir(parent, { recursive: true, mode: STATE_DIRECTORY_MODE })
        await chmod(parent, STATE_DIRECTORY_MODE)
        this.state = await readStateFile(statePath)
        return () => {}
      },
      `${BIN_NAME}: desktop MCP state`,
    )
  }

  /** All installed servers for the bound profile. */
  listMcpServers(): readonly DesktopMcpServer[] {
    return profileServers(this.state, this.bootstrap.profileName)
  }

  /** Register a newly installed server (idempotent by serverName). */
  async addMcpServer(input: { serverName: string; displayName: string; method: DesktopMcpInstallMethod }): Promise<void> {
    if (!SERVER_NAME_PATTERN.test(input.serverName)) {
      throw new DesktopMcpError(DesktopMcpErrorCode.InvalidTarget, 'invalid MCP server name')
    }
    const servers = profileServers(this.state, this.bootstrap.profileName)
    if (servers.some(server => server.serverName === input.serverName)) {
      throw new DesktopMcpError(DesktopMcpErrorCode.AlreadyInstalled, 'this MCP server is already installed')
    }
    const next: DesktopMcpState = {
      version: STATE_VERSION,
      profiles: [
        ...this.state.profiles.filter(profile => profile.profileName !== this.bootstrap.profileName),
        {
          profileName: this.bootstrap.profileName,
          servers: [
            ...servers,
            {
              serverName: input.serverName,
              displayName: input.displayName,
              method: input.method,
              enabled: true,
              installedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    }
    await this.persist(next)
  }

  /** Enable or disable an installed server. */
  async setMcpServerEnabled(serverName: string, enabled: boolean): Promise<void> {
    const servers = profileServers(this.state, this.bootstrap.profileName)
    const existing = servers.find(server => server.serverName === serverName)
    if (existing === undefined) {
      throw new DesktopMcpError(DesktopMcpErrorCode.NotInstalled, 'this MCP server is not installed')
    }
    if (existing.enabled === enabled) {
      throw new DesktopMcpError(
        enabled ? DesktopMcpErrorCode.AlreadyEnabled : DesktopMcpErrorCode.AlreadyDisabled,
        enabled ? 'this MCP server is already enabled' : 'this MCP server is already disabled',
      )
    }
    const next: DesktopMcpState = {
      version: STATE_VERSION,
      profiles: this.state.profiles.map(profile => profile.profileName === this.bootstrap.profileName
        ? {
            ...profile,
            servers: profile.servers.map(server => server.serverName === serverName
              ? { ...server, enabled }
              : server),
          }
        : profile),
    }
    await this.persist(next)
  }

  /** Remove an installed server entirely. */
  async removeMcpServer(serverName: string): Promise<void> {
    const servers = profileServers(this.state, this.bootstrap.profileName)
    if (!servers.some(server => server.serverName === serverName)) {
      throw new DesktopMcpError(DesktopMcpErrorCode.NotInstalled, 'this MCP server is not installed')
    }
    const next: DesktopMcpState = {
      version: STATE_VERSION,
      profiles: this.state.profiles.map(profile => profile.profileName === this.bootstrap.profileName
        ? { ...profile, servers: profile.servers.filter(server => server.serverName !== serverName) }
        : profile),
    }
    await this.persist(next)
  }

  private async persist(state: DesktopMcpState): Promise<void> {
    try {
      await withFileLock(
        `${this.bootstrap.statePath}.lock`,
        async () => {
          const rendered = renderState(state)
          if (Buffer.byteLength(rendered) > MAX_STATE_BYTES) {
            throw new DesktopMcpError(DesktopMcpErrorCode.PersistenceFailed, 'desktop MCP state exceeds the size limit')
          }
          await writeFileAtomic(this.bootstrap.statePath, rendered, { mode: STATE_FILE_MODE })
        },
      )
      this.state = state
    } catch (error) {
      if (error instanceof DesktopMcpError) throw error
      throw new DesktopMcpError(
        DesktopMcpErrorCode.PersistenceFailed,
        `failed to persist desktop MCP state: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
