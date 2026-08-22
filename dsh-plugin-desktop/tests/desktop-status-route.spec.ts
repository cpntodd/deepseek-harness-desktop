import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { configuredLspProviders, handleDesktopLspProvidersRequest } from '../src/desktop-status-route.ts'

/** A Loader entry carrying the two fields our presenter reads. */
function entry(name: string, servers?: Record<string, { extensionToLanguage?: Record<string, string> }>): unknown {
  return { options: { name, ...(servers === undefined ? {} : { config: { servers } }) } }
}

function ctxWith(entries: readonly unknown[]): Context {
  return { loader: { entries: () => entries[Symbol.iterator]() } } as unknown as Context
}

describe('configuredLspProviders', () => {
  it('normalizes dsh-lsp-stdio server rows and ignores other plugins', () => {
    const ctx = ctxWith([
      entry('@deepseek-ai/dsh-lsp-stdio', {
        typescript: { extensionToLanguage: { '.ts': 'typescript', '.tsx': 'typescript' } },
        'rust-analyzer': { extensionToLanguage: { '.rs': 'rust' } },
      }),
      entry('@deepseek-ai/dsh-tool-todo'), // unrelated plugin
    ])

    expect(configuredLspProviders(ctx)).toEqual([
      { id: 'typescript', displayName: 'Typescript', languages: ['typescript'] },
      { id: 'rust-analyzer', displayName: 'Rust Analyzer', languages: ['rust'] },
    ])
  })

  it('returns an empty list when no LSP provider plugin is configured', () => {
    expect(configuredLspProviders(ctxWith([entry('some-other-plugin')]))).toEqual([])
    expect(configuredLspProviders(ctxWith([]))).toEqual([])
  })

  it('handles rows without an extension map as empty languages', () => {
    const ctx = ctxWith([
      entry('@deepseek-ai/dsh-lsp-stdio', { python: {} }),
    ])
    expect(configuredLspProviders(ctx)).toEqual([{ id: 'python', displayName: 'Python', languages: [] }])
  })
})

describe('handleDesktopLspProvidersRequest', () => {
  it('rejects a request that does not arrive on the loopback origin', () => {
    const req = { socket: { remoteAddress: '8.8.8.8' }, headers: {} } as unknown as Parameters<typeof handleDesktopLspProvidersRequest>[0]
    let status = 0
    let body = ''
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((value: string) => { body = value }),
    } as unknown as Parameters<typeof handleDesktopLspProvidersRequest>[1]

    handleDesktopLspProvidersRequest(req, res, 'http://127.0.0.1:1', ctxWith([]))

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(body)).toEqual({ error: 'forbidden' })
    expect(status).toBe(0)
  })
})
