/**
 * Desktop-owned system-prompt section teaching the sandbox escalation protocol.
 *
 * The harness advertises OPTIONAL `sandbox_permissions` + `justification`
 * arguments on the bash and filesystem tools and fails closed when the model
 * emits them unnecessarily (a mode equal to or narrower than the call's current
 * mode, or an empty justification). The escalation ladder and pairing rule are
 * correct; the model (deepseek-v4-flash family) keeps attaching the fields to
 * ordinary calls anyway. This section pins the protocol imperatively so the
 * model omits the fields unless a `[sandbox: ...]` denial actually invites an
 * escalation, and never retries with a non-widening mode.
 *
 * It is a GLOBAL prompt section (a host row, not a per-preset row), so it
 * reaches every agent the desktop composes except presets whose persona is
 * `complete: true` (the `minimal` preset, whose sandbox-free toolset has no
 * escalation fields anyway).
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PromptSection } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Stable Cordis plugin name. */
export const name = 'desktop-escalation-protocol'

/** Prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/**
 * Prompt-section name. Unique and desktop-namespaced so it never collides with
 * the upstream `deployment:persona` slot it must not shadow.
 */
export const ESCALATION_PROTOCOL_SECTION_NAME = 'desktop:sandbox-escalation-protocol'

/**
 * Prompt-section order: the tool-guidance band, immediately after `tool-bash`
 * (order 105) and before the per-tool sections that follow. Escalation is a
 * bash/fs discipline, so it sits at the head of the sandbox tooling guidance.
 */
export const ESCALATION_PROTOCOL_SECTION_ORDER = 106

/**
 * The pinned, verbatim escalation-protocol guidance the model reads. One
 * physical paragraph per rule; no template variables, so the text renders
 * identically for every assembly.
 */
export const ESCALATION_PROTOCOL_TEXT = `Sandbox escalation protocol (always follow).

Do not set sandbox_permissions or justification on ordinary tool calls (bash, file reads, file writes). A call that runs in the session's current mode needs no escalation fields.

Only after a call is DENIED with a [sandbox: ...] marker may you retry the exact same operation once, setting sandbox_permissions to the narrowest strictly-wider mode (workspace-write is wider than read-only; danger-full-access is wider than workspace-write) and justification to one sentence stating why the escalation is needed.

Never set sandbox_permissions equal to the current mode: that is not an escalation and is rejected.

Never send an empty justification: the two fields travel together or not at all.

Never leave a stale sandbox_permissions on a later, unrelated call.`

/** Build the prompt section this plugin registers. */
export function escalationProtocolSection(): PromptSection {
  return {
    name: ESCALATION_PROTOCOL_SECTION_NAME,
    order: ESCALATION_PROTOCOL_SECTION_ORDER,
    text: ESCALATION_PROTOCOL_TEXT,
  }
}

/**
 * Register the escalation-protocol section for the mounting context's scope.
 * @param ctx - host context whose prompt registry receives the section.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.systemPrompt.section(escalationProtocolSection()),
    'dsh-plugin-desktop: sandbox escalation protocol section',
  )
}
