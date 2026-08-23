/**
 * Desktop-owned deployment-policy guard that hard-enforces the sandbox
 * escalation protocol at the tool layer.
 *
 * The harness advertises OPTIONAL `sandbox_permissions` + `justification`
 * arguments on the bash and filesystem tool families, and the upstream
 * sandbox policy fail-closes a request that is not strictly wider than the
 * call's effective mode (`sandbox escalation to "X" is not strictly wider
 * than this call's current "Y" mode`). The deepseek-v4-flash family keeps
 * attaching the fields to ordinary calls anyway, and a same-mode or narrower
 * request can never be approved — it just burns a call on an error.
 *
 * This plugin shadows every escalation-advertising tool for each live agent
 * with an execution wrapper that strips `sandbox_permissions`/`justification`
 * whenever the requested mode is not strictly wider than the session's
 * effective mode. The call then runs at the current mode instead of failing —
 * which is exactly what Full Access means: no model restriction, no
 * escalation error. Genuine strictly-wider retries in read-only /
 * workspace-write sessions are left untouched, so the user-approval flow
 * keeps working where escalation is meaningful.
 *
 * `@deepseek-ai/dsh-tools` scoped registrations shadow globals without a
 * duplicate-name failure, so each wrapper is registered through the agent's
 * own scoped context on `agent/created`. The tool's schema stays untouched
 * (schemas are registry-global while the effective mode is per-call truth),
 * so a session switched narrower later keeps its escalation lever.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { WIDER_MODES } from '@deepseek-ai/dsh-sandbox'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import type {
  ToolDefinition,
  ToolExecution,
} from '@deepseek-ai/dsh-tools'

/** Stable Cordis plugin name. */
export const name = 'desktop-sandbox-escalation-guard'

/** Services this plugin reads through direct injection. */
export const inject = ['tools', 'shell'] as const

/** The escalation argument pair the guard normalizes. */
export const ESCALATION_ARGUMENTS = ['sandbox_permissions', 'justification'] as const

/** The schema fields the guard reads off each advertised tool. */
export interface EscalationToolSchema {
  readonly name: string
  readonly parameters: unknown
}

/**
 * Strictly-wider ladder: can a call whose effective mode is `currentMode`
 * escalate to `requestedMode`? Delegates to `WIDER_MODES` from
 * `@deepseek-ai/dsh-sandbox` — the exact table the upstream enforcing
 * families consult — so the guard and the enforcement can never disagree.
 */
export function isStrictlyWider(currentMode: string, requestedMode: string): boolean {
  const wider = (WIDER_MODES as Record<string, readonly string[]>)[currentMode] ?? []
  return wider.includes(requestedMode)
}

/** Whether one tool schema advertises the escalation argument pair. */
export function advertisesEscalation(parameters: unknown): boolean {
  return typeof parameters === 'object'
    && parameters !== null
    && 'sandbox_permissions' in (parameters as Record<string, unknown>)
}

/**
 * Normalize one call's escalation arguments. A request carrying either
 * escalation argument whose `sandbox_permissions` is not strictly wider than
 * the call's effective mode — an equal mode, a narrower mode, or a bare
 * `justification` with no widening request — is normalized by dropping BOTH
 * fields so the call runs at its current mode. A genuinely wider request
 * passes through untouched for the approval flow.
 * @param args - the call's model arguments (may be frozen; never mutated).
 * @param effectiveMode - the call's effective sandbox mode.
 * @returns the arguments to hand the upstream tool and whether they were stripped.
 */
export function stripNonWiderEscalation(
  args: Readonly<Record<string, unknown>>,
  effectiveMode: string,
): { args: Record<string, unknown>; stripped: boolean } {
  if (args.sandbox_permissions === undefined && args.justification === undefined) {
    return { args: { ...args }, stripped: false }
  }
  const requested = args.sandbox_permissions
  const wider = typeof requested === 'string' && isStrictlyWider(effectiveMode, requested)
  if (wider) {
    return { args: { ...args }, stripped: false }
  }
  const cleaned = { ...args }
  delete cleaned.sandbox_permissions
  delete cleaned.justification
  return { args: cleaned, stripped: true }
}

/** Resolve the effective sandbox mode for one pending tool call. */
export type EffectiveModeResolver = (exec: ToolExecution) => string | undefined

/**
 * Resolve the standing per-session policy mode, falling back to the shell
 * executor's default sandbox mode. The same resolution the upstream bash/fs
 * tools perform, so the guard judges the same effective mode they enforce.
 */
export function resolveEffectiveMode(ctx: Context, exec: ToolExecution): string | undefined {
  const policy = ctx.get('sandboxPolicy') as SandboxPolicyService | undefined
  if (policy !== undefined) {
    const standing = policy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
    if (standing !== undefined) return standing.mode
  }
  return ctx.shell.sandboxMode
}

/**
 * Wrap one upstream tool `execute` so a non-widening escalation request runs
 * at the call's current mode instead of failing the strictly-wider check.
 * Pure over the resolved effective mode and the upstream execution, so it is
 * unit-testable without a live harness.
 * @param upstreamExecute - the registered tool's original `execute`.
 * @param resolveEffectiveMode - per-call effective-mode resolver.
 * @returns the hardened `execute`.
 */
export function wrapEscalationGuardedExecute(
  upstreamExecute: ToolDefinition['execute'],
  resolveEffectiveMode: EffectiveModeResolver,
): ToolDefinition['execute'] {
  return async (args, exec) => {
    const raw = args as Readonly<Record<string, unknown>>
    if (raw.sandbox_permissions === undefined && raw.justification === undefined) {
      return upstreamExecute(args, exec)
    }
    const effectiveMode = resolveEffectiveMode(exec)
    if (effectiveMode === undefined) {
      // No resolvable policy: leave the call alone; the upstream fail-closed
      // check owns the outcome.
      return upstreamExecute(args, exec)
    }
    const normalized = stripNonWiderEscalation(raw, effectiveMode)
    return normalized.stripped
      ? upstreamExecute(normalized.args, exec)
      : upstreamExecute(args, exec)
  }
}

/** A minimal facade over the parts of `@deepseek-ai/dsh-tools` the guard reads. */
export interface EscalationToolFacade {
  schemas(scope: unknown): ReadonlyArray<EscalationToolSchema>
  get(name: string, scope: unknown): ToolDefinition | undefined
  register(definition: ToolDefinition): () => void
}

/**
 * Shadow every escalation-advertising tool the agent can see with the
 * hardened wrapper, leaving non-escalation tools and genuinely-wider
 * escalation flow untouched.
 * @param facade - the agent-scoped tools service.
 * @param scope - the agent scope key.
 * @param resolveEffectiveMode - per-call effective-mode resolver.
 * @returns the number of tools shadowed.
 */
export function shadowEscalationTools(
  facade: EscalationToolFacade,
  scope: unknown,
  resolveEffectiveMode: EffectiveModeResolver,
): number {
  let shadowed = 0
  for (const schema of facade.schemas(scope)) {
    if (!advertisesEscalation(schema.parameters)) continue
    const upstream = facade.get(schema.name, scope)
    if (upstream === undefined) continue
    facade.register({
      ...upstream,
      execute: wrapEscalationGuardedExecute(upstream.execute, resolveEffectiveMode),
    })
    shadowed += 1
  }
  return shadowed
}

/**
 * Register the guard: on every live agent, harden the escalation-advertising
 * tools the agent can see.
 * @param ctx - host context whose tools and agent lifecycle the guard reads.
 */
export function apply(ctx: Context): void {
  ctx.on('agent/created', (payload: { agent: Agent }) => {
    const { agent } = payload
    const shadowed = shadowEscalationTools(
      agent.ctx.tools,
      agent,
      exec => resolveEffectiveMode(ctx, exec),
    )
    if (shadowed > 0) {
      ctx.logger.info(`desktop-sandbox-escalation-guard: hardened ${shadowed} escalation tool(s) for agent ${agent.id}`)
    }
  })
}
