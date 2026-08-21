import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { AuthorizationOutcome, AuthorizationRequest } from '@deepseek-ai/dsh-authorization'
import CodexSettingsController, {
  type CodexSettingsControllerBootstrap,
} from '../src/codex-settings-controller.ts'
import {
  handleCodexLoginRequest,
  handleCodexLogoutRequest,
  handleCodexSettingsRequest,
} from '../src/codex-settings-route.ts'
import { CODEX_PROVIDER_ID } from '../src/codex-auth.ts'

const ORIGIN = 'http://127.0.0.1:43120'

function bootstrap(
  overrides: Partial<CodexSettingsControllerBootstrap> = {},
): CodexSettingsControllerBootstrap {
  return {
    authorize: async () => ({ status: 'authorized' }),
    isSignedIn: async () => false,
    signOut: async () => {},
    listModels: async () => ['gpt-5.4', 'gpt-5.4-mini'],
    openBrowser: async () => {},
    ...overrides,
  }
}

interface RequestOptions {
  readonly body?: string | Buffer
  readonly headers?: Readonly<Record<string, string | undefined>>
  readonly remoteAddress?: string
}

function request(method: string, options: RequestOptions = {}): IncomingMessage {
  const req = Readable.from(options.body === undefined ? [] : [options.body]) as IncomingMessage
  req.method = method
  req.headers = {
    host: '127.0.0.1:43120',
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    ...options.headers,
  }
  Object.defineProperty(req, 'socket', {
    configurable: true,
    value: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
  })
  return req
}

function jsonRequest(value: unknown, options: RequestOptions = {}): IncomingMessage {
  const body = JSON.stringify(value)
  return request('POST', {
    ...options,
    body,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(body)),
      ...options.headers,
    },
  })
}

function response(): ServerResponse & {
  body: string
  end: ReturnType<typeof vi.fn>
  setHeader: ReturnType<typeof vi.fn>
} {
  const res = {
    body: '',
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((body?: string) => { res.body = body ?? '' }),
  }
  return res as unknown as ServerResponse & typeof res
}

describe('codex settings controller', () => {
  it('reports signed-out with no models while nothing is stored', async () => {
    const controller = new CodexSettingsController(bootstrap())
    await expect(controller.read()).resolves.toEqual({
      state: 'signed-out',
      providerId: CODEX_PROVIDER_ID,
      models: [],
    })
  })

  it('reports signed-in with the available model ids once stored', async () => {
    const controller = new CodexSettingsController(bootstrap({ isSignedIn: async () => true }))
    await expect(controller.read()).resolves.toEqual({
      state: 'signed-in',
      providerId: CODEX_PROVIDER_ID,
      models: ['gpt-5.4', 'gpt-5.4-mini'],
    })
  })

  it('starts a login and surfaces the device-code notice on the next read', async () => {
    const authorize = vi.fn(async (request: AuthorizationRequest): Promise<AuthorizationOutcome> => {
      // Exercise the interaction exactly as the harness flow would.
      request.interaction.notify({
        message: 'Enter this code on the verification page to finish signing in.',
        url: 'https://auth.openai.com/codex/device',
        code: 'ABCD-EFGH',
      })
      return { status: 'authorized' }
    })
    const controller = new CodexSettingsController(bootstrap({
      authorize,
      isSignedIn: async () => true,
    }))
    expect(controller.startLogin()).toEqual({ accepted: true })
    await expect(controller.read()).resolves.toEqual({
      state: 'signed-in',
      providerId: CODEX_PROVIDER_ID,
      models: ['gpt-5.4', 'gpt-5.4-mini'],
      notice: {
        message: 'Enter this code on the verification page to finish signing in.',
        url: 'https://auth.openai.com/codex/device',
        code: 'ABCD-EFGH',
      },
    })
    expect(authorize).toHaveBeenCalledOnce()
  })

  it('records a failure message when the authorization attempt rejects', async () => {
    const controller = new CodexSettingsController(bootstrap({
      authorize: async () => { throw new Error('no such flow') },
      isSignedIn: async () => false,
    }))
    controller.startLogin()
    await vi.waitFor(async () => {
      await expect(controller.read()).resolves.toMatchObject({ error: 'no such flow' })
    })
  })

  it('logout clears the stored credential and resets the surface', async () => {
    const signOut = vi.fn(async () => {})
    const controller = new CodexSettingsController(bootstrap({ signOut, isSignedIn: async () => false }))
    await expect(controller.logout()).resolves.toEqual({ accepted: true })
    expect(signOut).toHaveBeenCalledOnce()
  })
})

describe('codex settings routes', () => {
  it('serves the state over a same-origin GET', async () => {
    const controller = new CodexSettingsController(bootstrap())
    const res = response()
    await handleCodexSettingsRequest(request('GET'), res, ORIGIN, controller)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      state: 'signed-out',
      providerId: CODEX_PROVIDER_ID,
      models: [],
    })
  })

  it('starts a login from an exact empty POST and returns 202', async () => {
    const controller = new CodexSettingsController(bootstrap())
    const res = response()
    await handleCodexLoginRequest(jsonRequest({}), res, ORIGIN, controller)
    expect(res.statusCode).toBe(202)
    expect(JSON.parse(res.body)).toEqual({ accepted: true })
  })

  it('rejects a login with a non-empty body', async () => {
    const controller = new CodexSettingsController(bootstrap())
    const res = response()
    await handleCodexLoginRequest(jsonRequest({ extra: true }), res, ORIGIN, controller)
    expect(res.statusCode).toBe(400)
  })

  it('refuses a mutating request from a non-loopback origin', async () => {
    const controller = new CodexSettingsController(bootstrap())
    const res = response()
    await handleCodexLoginRequest(
      jsonRequest({}, { headers: { origin: 'https://evil.example' } }),
      res,
      ORIGIN,
      controller,
    )
    expect(res.statusCode).toBe(403)
  })

  it('completes a logout from an exact empty POST', async () => {
    const signOut = vi.fn(async () => {})
    const controller = new CodexSettingsController(bootstrap({ signOut }))
    const res = response()
    await handleCodexLogoutRequest(jsonRequest({}), res, ORIGIN, controller)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ accepted: true })
    expect(signOut).toHaveBeenCalledOnce()
  })
})
