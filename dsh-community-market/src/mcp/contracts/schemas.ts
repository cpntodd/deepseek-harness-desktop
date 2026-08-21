import { createRequire } from 'node:module'
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js'
import type { FormatsPlugin } from 'ajv-formats'

/**
 * Raw registry `ServerResponse` subset the adapter consumes. This mirrors the
 * live `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`
 * fields and the `_meta` extension the registry adds to list responses. Unknown
 * fields are tolerated (additional properties are allowed) so a future registry
 * addition does not invalidate an otherwise useful catalog entry.
 */
export interface McpRegistryKeyValue {
  readonly name: string
  readonly description?: string
  readonly isSecret?: boolean
  readonly isRequired?: boolean
  readonly default?: string
}

export interface McpRegistryArgument {
  readonly type?: 'positional' | 'named'
  readonly value?: string
  readonly valueHint?: string
}

export interface McpRegistryPackage {
  readonly registryType: string
  readonly registryBaseUrl?: string
  readonly identifier: string
  readonly version?: string
  readonly runtimeHint?: string
  readonly transport?: { readonly type?: string }
  readonly runtimeArguments?: readonly McpRegistryArgument[]
  readonly environmentVariables?: readonly McpRegistryKeyValue[]
}

export interface McpRegistryRemote {
  readonly type: 'streamable-http' | 'sse'
  readonly url: string
  readonly headers?: readonly McpRegistryKeyValue[]
}

export interface McpRegistryIcon {
  readonly src: string
  readonly mimeType?: string
}

export interface McpRegistryServer {
  readonly name: string
  readonly title?: string
  readonly description: string
  readonly version: string
  readonly packages?: readonly McpRegistryPackage[]
  readonly remotes?: readonly McpRegistryRemote[]
  readonly icons?: readonly McpRegistryIcon[]
  readonly websiteUrl?: string
}

export interface McpRegistryOfficialMeta {
  readonly status?: string
  readonly statusChangedAt?: string
  readonly publishedAt?: string
  readonly updatedAt?: string
  readonly isLatest?: boolean
}

export interface McpRegistryServerEntry {
  readonly server: McpRegistryServer
  readonly _meta?: {
    readonly 'io.modelcontextprotocol.registry/official'?: McpRegistryOfficialMeta
  }
}

export interface McpRegistryList {
  readonly servers: readonly McpRegistryServerEntry[]
  readonly metadata?: { readonly nextCursor?: string; readonly count?: number }
}

const registryListSchema = {
  type: 'object',
  required: ['servers'],
  properties: {
    servers: { type: 'array', items: { $ref: '#/$defs/serverEntry' } },
    metadata: {
      type: 'object',
      properties: {
        nextCursor: { type: 'string' },
        count: { type: 'number' },
      },
    },
  },
  $defs: {
    serverEntry: {
      type: 'object',
      required: ['server'],
      properties: {
        server: { $ref: '#/$defs/server' },
        _meta: { $ref: '#/$defs/meta' },
      },
    },
    server: {
      type: 'object',
      required: ['name', 'description', 'version'],
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 200, pattern: '^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$' },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', minLength: 1, maxLength: 5_000 },
        version: { type: 'string', minLength: 1, maxLength: 255 },
        packages: { type: 'array', items: { $ref: '#/$defs/package' } },
        remotes: { type: 'array', items: { $ref: '#/$defs/remote' } },
        icons: { type: 'array', items: { $ref: '#/$defs/icon' } },
        websiteUrl: { type: 'string', maxLength: 2_048 },
      },
    },
    package: {
      type: 'object',
      required: ['registryType', 'identifier'],
      properties: {
        registryType: { type: 'string', maxLength: 64 },
        registryBaseUrl: { type: 'string', maxLength: 2_048 },
        identifier: { type: 'string', maxLength: 512 },
        version: { type: 'string', maxLength: 255 },
        runtimeHint: { type: 'string', maxLength: 64 },
        transport: { type: 'object', properties: { type: { type: 'string', maxLength: 64 } } },
        runtimeArguments: { type: 'array', items: { $ref: '#/$defs/argument' } },
        environmentVariables: { type: 'array', items: { $ref: '#/$defs/keyValue' } },
      },
    },
    remote: {
      type: 'object',
      required: ['type', 'url'],
      properties: {
        type: { enum: ['streamable-http', 'sse'] },
        url: { type: 'string', maxLength: 2_048 },
        headers: { type: 'array', items: { $ref: '#/$defs/keyValue' } },
      },
    },
    keyValue: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', maxLength: 256 },
        description: { type: 'string', maxLength: 2_000 },
        isSecret: { type: 'boolean' },
        isRequired: { type: 'boolean' },
        default: { type: 'string' },
      },
    },
    argument: {
      type: 'object',
      properties: {
        type: { enum: ['positional', 'named'] },
        value: { type: 'string', maxLength: 2_048 },
        valueHint: { type: 'string', maxLength: 512 },
      },
    },
    icon: {
      type: 'object',
      required: ['src'],
      properties: {
        src: { type: 'string', maxLength: 2_048 },
        mimeType: { type: 'string', maxLength: 64 },
      },
    },
    meta: {
      type: 'object',
      properties: {
        'io.modelcontextprotocol.registry/official': {
          type: 'object',
          properties: {
            status: { type: 'string', maxLength: 64 },
            statusChangedAt: { type: 'string' },
            publishedAt: { type: 'string' },
            updatedAt: { type: 'string' },
            isLatest: { type: 'boolean' },
          },
        },
      },
    },
  },
} as const

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
})
const require = createRequire(import.meta.url)
const addFormats = require('ajv-formats') as FormatsPlugin
addFormats(ajv)

const validateList: ValidateFunction<McpRegistryList> = ajv.compile<McpRegistryList>(registryListSchema)

/** Validate and narrow one registry list payload to the subset the adapter reads. */
export function parseMcpRegistryList(value: unknown): McpRegistryList {
  if (!validateList(value)) {
    throw new Error('MCP registry response is invalid')
  }
  return value
}
