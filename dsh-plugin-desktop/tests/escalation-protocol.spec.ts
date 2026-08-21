import { describe, expect, it, vi } from 'vitest'
import { renderPrompt, type AssembledSection } from '@deepseek-ai/dsh-system-prompt'
import {
  apply,
  ESCALATION_PROTOCOL_SECTION_NAME,
  ESCALATION_PROTOCOL_SECTION_ORDER,
  ESCALATION_PROTOCOL_TEXT,
  escalationProtocolSection,
  inject,
  name,
} from '../src/escalation-protocol.ts'

describe('desktop escalation protocol prompt section', () => {
  it('declares the plugin name and systemPrompt injection', () => {
    expect(name).toBe('desktop-escalation-protocol')
    expect(inject).toEqual(['systemPrompt'])
  })

  it('builds a section with the pinned name, order, and verbatim text', () => {
    const section = escalationProtocolSection()
    expect(section.name).toBe('desktop:sandbox-escalation-protocol')
    expect(section.name).toBe(ESCALATION_PROTOCOL_SECTION_NAME)
    expect(section.order).toBe(106)
    expect(section.order).toBe(ESCALATION_PROTOCOL_SECTION_ORDER)
    expect(section.text).toBe(ESCALATION_PROTOCOL_TEXT)
  })

  it('renders the escalation protocol alongside a persona section', () => {
    const persona: AssembledSection = {
      name: 'deployment:persona',
      text: 'You are a helpful assistant. Work carefully and verify your changes.',
    }
    const rendered = renderPrompt({
      sections: [persona, { name: ESCALATION_PROTOCOL_SECTION_NAME, text: ESCALATION_PROTOCOL_TEXT }],
      contexts: [],
      tools: [],
      variables: {},
    })
    expect(rendered).toContain('You are a helpful assistant.')
    expect(rendered).toContain(ESCALATION_PROTOCOL_TEXT)
    expect(rendered).toContain('narrowest strictly-wider mode')
    expect(rendered).toContain('Never send an empty justification')
  })

  it('registers the section through ctx.effect and disposes it', () => {
    const disposers: Array<() => void> = []
    const effect = vi.fn((fn: () => unknown, _label: string) => {
      const dispose = fn()
      disposers.push(() => { void dispose })
      return () => {}
    })
    const section = vi.fn((s: unknown) => {
      expect((s as { name: string }).name).toBe(ESCALATION_PROTOCOL_SECTION_NAME)
      return () => {}
    })
    const ctx = {
      effect,
      systemPrompt: { section },
    } as never

    apply(ctx as Parameters<typeof apply>[0])

    expect(effect).toHaveBeenCalledWith(expect.any(Function), 'dsh-plugin-desktop: sandbox escalation protocol section')
    expect(section).toHaveBeenCalledWith(escalationProtocolSection())
    // Calling the registered effect callback registers the section; disposing
    // runs the returned disposer.
    const registered = effect.mock.calls[0]?.[0] as () => unknown
    registered()
    expect(disposers).toHaveLength(1)
  })
})
