/**
 * Stable Host-side identity of the compiled-in MCP registry source
 * (`MCP_REGISTRY_SOURCE` in `../adapters/mcp-registry.js`).
 *
 * The Host never enters this source into the catalog source store, so the
 * renderer cannot derive it from enabled catalog sources. Prefer the
 * authoritative value carried by the MCP servers API response
 * (`server.provenance.sourceRecordId`); this constant is the client-visible
 * fallback and must stay in sync with `MCP_REGISTRY_SOURCE.sourceRecordId`.
 */
export const MCP_REGISTRY_SOURCE_RECORD_ID = 'built-in-mcp-registry'
