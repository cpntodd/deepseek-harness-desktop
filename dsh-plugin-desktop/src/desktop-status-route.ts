/**
 * Strict loopback HTTP handler for the private Desktop LSP-provider status route.
 * Reads the configured `@deepseek-ai/dsh-lsp-stdio` rows out of the live Loader
 * and normalizes them into the panel's provider view. The Loader tree is fully
 * populated at apply() time, so this reflects the active profile's config.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { DesktopLspProviderView } from './desktop-status-contract.ts'
import { finishJson, isSameOriginLoopbackRequest } from './desktop-settings-route.ts'

/** The LSP providers configured by the active profile are `dsh-lsp-stdio` rows. */
const LSP_PROVIDER_PLUGIN_NAME = '@deepseek-ai/dsh-lsp-stdio'

/** Minimal server-row shape our presenter reads. */
interface LspServerRow {
  readonly extensionToLanguage?: Readonly<Record<string, string>>
}

/** Minimal Loader entry shape our presenter reads. */
interface LspLoaderEntry {
  readonly options?: {
    readonly name?: string
    readonly config?: { readonly servers?: Readonly<Record<string, LspServerRow>> }
  }
}

/** Derive a human display name from a provider id (e.g. `rust-analyzer` → `Rust Analyzer`). */
function displayNameForProviderId(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

/** Normalize the profile's configured LSP servers into the panel's provider view. */
export function configuredLspProviders(ctx: Context): readonly DesktopLspProviderView[] {
  const providers: DesktopLspProviderView[] = []
  for (const raw of ctx.loader.entries()) {
    const entry = raw as unknown as LspLoaderEntry
    if (entry.options?.name !== LSP_PROVIDER_PLUGIN_NAME) continue
    const servers = entry.options.config?.servers
    if (servers === undefined) continue
    for (const [id, row] of Object.entries(servers)) {
      const languages = [...new Set(Object.values(row.extensionToLanguage ?? {}))]
      providers.push({ id, displayName: displayNameForProviderId(id), languages })
    }
  }
  return providers
}

/** Handle a GET for the configured LSP providers. @param ctx - host context for the live Loader. */
export function handleDesktopLspProvidersRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rendererOrigin: string,
  ctx: Context,
): void {
  if (!isSameOriginLoopbackRequest(req, rendererOrigin, false)) {
    finishJson(res, 403, { error: 'forbidden' })
    return
  }
  finishJson(res, 200, { providers: configuredLspProviders(ctx) })
}
