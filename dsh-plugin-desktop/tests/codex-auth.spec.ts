import { describe, expect, it, vi } from 'vitest'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import {
  buildCodexInteraction,
  codexCredentialKey,
  CODEX_DEVICE_CODE_METHOD,
  CODEX_PROVIDER_ID,
  CODEX_RECORD_SCOPE,
  projectNotice,
} from '../src/codex-auth.ts'

describe('codex auth interaction mapping', () => {
  it('projects notices into the renderer-safe shape', () => {
    expect(projectNotice({
      message: 'Enter this code on the verification page to finish signing in.',
      url: 'https://auth.openai.com/codex/device',
      code: 'ABCD-EFGH',
    })).toEqual({
      message: 'Enter this code on the verification page to finish signing in.',
      url: 'https://auth.openai.com/codex/device',
      code: 'ABCD-EFGH',
    })
    expect(projectNotice({ message: 'Signing in…' })).toEqual({ message: 'Signing in…' })
  })

  it('answers the login-method select prompt with the device-code method', async () => {
    const onNotice = vi.fn()
    const interaction = buildCodexInteraction(onNotice)
    await expect(interaction.prompt({
      kind: 'select',
      message: 'Select OpenAI Codex login method:',
      options: [
        { id: 'browser', label: 'Browser login (default)' },
        { id: 'device_code', label: 'Device code login (headless)' },
      ],
    })).resolves.toBe(CODEX_DEVICE_CODE_METHOD)
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('declines any prompt that is not the login-method select', async () => {
    const interaction = buildCodexInteraction(() => {})
    await expect(interaction.prompt({ kind: 'text', message: 'paste a code' }))
      .rejects.toBeInstanceOf(AuthorizationDeclinedError)
  })

  it('forwards device-code notices through the callback', () => {
    const onNotice = vi.fn()
    const interaction = buildCodexInteraction(onNotice)
    interaction.notify({
      message: 'Enter this code on the verification page to finish signing in.',
      url: 'https://auth.openai.com/codex/device',
      code: 'ABCD-EFGH',
    })
    expect(onNotice).toHaveBeenCalledWith({
      message: 'Enter this code on the verification page to finish signing in.',
      url: 'https://auth.openai.com/codex/device',
      code: 'ABCD-EFGH',
    })
  })

  it('opens the verification URI when a device-code notice carries a url', async () => {
    const openBrowser = vi.fn(async () => {})
    const onNotice = vi.fn()
    const interaction = buildCodexInteraction(onNotice, openBrowser)
    interaction.notify({
      message: 'Enter this code on the verification page to finish signing in.',
      url: 'https://auth.openai.com/codex/device',
      code: 'ABCD-EFGH',
    })
    await vi.waitFor(() => {
      expect(openBrowser).toHaveBeenCalledWith('https://auth.openai.com/codex/device')
    })
    expect(onNotice).toHaveBeenCalledWith({
      message: 'Enter this code on the verification page to finish signing in.',
      url: 'https://auth.openai.com/codex/device',
      code: 'ABCD-EFGH',
    })
  })

  it('does not open a browser for a notice without a url', async () => {
    const openBrowser = vi.fn(async () => {})
    const interaction = buildCodexInteraction(() => {}, openBrowser)
    interaction.notify({ message: 'Signing in…' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(openBrowser).not.toHaveBeenCalled()
  })

  it('swallows a browser-open failure so the authorization still proceeds', async () => {
    const openBrowser = vi.fn(async () => { throw new Error('no browser') })
    const onNotice = vi.fn()
    const interaction = buildCodexInteraction(onNotice, openBrowser)
    expect(() => interaction.notify({
      message: 'Enter this code on the verification page to finish signing in.',
      url: 'https://auth.openai.com/codex/device',
      code: 'ABCD-EFGH',
    })).not.toThrow()
    await vi.waitFor(() => {
      expect(openBrowser).toHaveBeenCalledWith('https://auth.openai.com/codex/device')
    })
    expect(onNotice).toHaveBeenCalledOnce()
  })

  it('addresses the harness credential record for openai-codex', () => {
    expect(codexCredentialKey()).toBe(`${CODEX_RECORD_SCOPE}/${CODEX_PROVIDER_ID}`)
  })
})
