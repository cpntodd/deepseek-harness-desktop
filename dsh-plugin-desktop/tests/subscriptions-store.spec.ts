/**
 * The session store under concurrency. Every writer does a read-modify-write
 * of one JSON file — logins, logouts and the token refreshes each provider
 * adapter fires on its own schedule — so two writers overlapping must not cost
 * a provider its session.
 *
 * Each test writes to its own temp path, passed explicitly, so nothing here
 * depends on `$DSH_HOME` or touches a developer's real store.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { deleteSession, loadStore, saveSession } from '../src/subscriptions/auth/store.ts'
import type { ClaudeSession, CodexSession } from '../src/subscriptions/auth/store.ts'

const TEMP_DIRS: string[] = []

afterEach(() => {
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true })
  TEMP_DIRS.length = 0
})

/** A store path inside a temp directory removed when the file finishes. */
function storePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'store-spec-'))
  TEMP_DIRS.push(dir)
  return join(dir, 'auth.json')
}

const CODEX: CodexSession = {
  accessToken: 'codex-at',
  refreshToken: 'codex-rt',
  expiresAt: Date.now() + 3600_000,
  accountId: 'acct-1',
}

const CLAUDE: ClaudeSession = {
  accessToken: 'claude-at',
  refreshToken: 'claude-rt',
  expiresAt: Date.now() + 3600_000,
  scopes: 'user:inference',
}

describe('subscriptions store', () => {
  it('two providers refreshing at once both keep their session', async () => {
    // The shape of a real double refresh: each adapter saves its own provider,
    // neither knows about the other. Unserialized, both read the same store and
    // the second write drops the first provider's entry.
    const path = storePath()
    await Promise.all([
      saveSession('codex', CODEX, path),
      saveSession('claude', CLAUDE, path),
    ])
    const store = await loadStore(path)
    expect(store.codex?.accessToken).toBe(CODEX.accessToken)
    expect(store.claude?.accessToken).toBe(CLAUDE.accessToken)
  })

  it('a logout concurrent with another provider’s save loses neither', async () => {
    const path = storePath()
    await saveSession('codex', CODEX, path)
    await Promise.all([
      deleteSession('codex', path),
      saveSession('claude', CLAUDE, path),
    ])
    const store = await loadStore(path)
    expect(store.codex).toBeUndefined()
    expect(store.claude?.accessToken).toBe(CLAUDE.accessToken)
  })

  it('writes to one path settle in call order', async () => {
    const path = storePath()
    const writes = [
      saveSession('claude', { ...CLAUDE, accessToken: 'first' }, path),
      saveSession('claude', { ...CLAUDE, accessToken: 'second' }, path),
      saveSession('claude', { ...CLAUDE, accessToken: 'third' }, path),
    ]
    await Promise.all(writes)
    expect((await loadStore(path)).claude?.accessToken).toBe('third')
  })
})
