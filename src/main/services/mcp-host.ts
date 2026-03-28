import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { tool, type ToolSet } from 'ai'
import { z, type ZodTypeAny } from 'zod'
import { replaceMcpTools } from '../tools'
import { logLlmDebug } from './debug-log'

type McpTransport = 'stdio'

interface McpServerConfig {
  id: string
  enabled?: boolean
  transport: McpTransport
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  toolPrefix?: string
  includeTools?: string[]
  excludeTools?: string[]
  timeoutMs?: number
}

interface McpConfigFile {
  version: number
  servers: McpServerConfig[]
}

const DEFAULT_CONFIG_PATH = 'mcp.config.json'
const BUILTIN_WWISE_SERVER_ID = 'wwise-waapi'
const activeClients = new Map<string, Client>()

function isBuiltinWwiseDisabled(): boolean {
  const value = (process.env.UNIAUDIO_DISABLE_BUILTIN_WWISE_MCP ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

function resolveBuiltinWwiseServer(): McpServerConfig | null {
  if (isBuiltinWwiseDisabled()) {
    return null
  }

  try {
    const packageJsonPath = require.resolve('wwise-waapi-mcp/package.json')
    const packageRoot = dirname(packageJsonPath)
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { main?: string }
    const entryRelativePath = typeof packageJson.main === 'string' && packageJson.main.length > 0
      ? packageJson.main
      : 'dist/src/index.js'
    const entryPath = resolve(packageRoot, entryRelativePath)

    if (!existsSync(entryPath)) {
      console.warn(`[mcp] Builtin Wwise MCP entry not found: ${entryPath}`)
      return null
    }

    return {
      id: BUILTIN_WWISE_SERVER_ID,
      enabled: true,
      transport: 'stdio',
      command: process.execPath,
      args: [entryPath],
      cwd: packageRoot,
      env: {
        ELECTRON_RUN_AS_NODE: '1',
      },
      toolPrefix: 'wwise',
      timeoutMs: 45000,
    }
  } catch {
    return null
  }
}

function mergeBuiltinServers(config: McpConfigFile): McpConfigFile {
  const mergedById = new Map<string, McpServerConfig>()
  const builtinWwise = resolveBuiltinWwiseServer()

  if (builtinWwise) {
    mergedById.set(builtinWwise.id, builtinWwise)
  }

  for (const server of config.servers) {
    // User config with the same id overrides builtin entry (including enabled: false).
    mergedById.set(server.id, server)
  }

  return {
    version: config.version,
    servers: Array.from(mergedById.values()),
  }
}

function normalizeConfig(raw: unknown): McpConfigFile {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, servers: [] }
  }

  const maybe = raw as Partial<McpConfigFile>
  const servers = Array.isArray(maybe.servers) ? maybe.servers : []

  return {
    version: Number(maybe.version ?? 1),
    servers: servers
      .map((s) => {
        if (!s || typeof s !== 'object') return null
        const candidate = s as Partial<McpServerConfig>
        return {
          ...candidate,
          transport: (candidate.transport ?? 'stdio') as McpTransport,
        }
      })
      .filter((s): s is McpServerConfig => {
        if (!s) return false
        const candidate = s as Partial<McpServerConfig>
        return (
          typeof candidate.id === 'string' &&
          candidate.id.length > 0 &&
          typeof candidate.command === 'string' &&
          candidate.command.length > 0 &&
          candidate.transport === 'stdio'
        )
      }),
  }
}

function getConfigPath(): string {
  if (process.env.UNIAUDIO_MCP_CONFIG) {
    return resolve(process.env.UNIAUDIO_MCP_CONFIG)
  }

  const candidates = [
    resolve(process.cwd(), DEFAULT_CONFIG_PATH),
    resolve(app.getAppPath(), DEFAULT_CONFIG_PATH),
    resolve(app.getPath('userData'), DEFAULT_CONFIG_PATH),
  ]

  const found = candidates.find((candidate) => existsSync(candidate))
  return found ?? candidates[0]
}

function loadMcpConfig(): McpConfigFile {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return mergeBuiltinServers({ version: 1, servers: [] })
  }

  try {
    const text = readFileSync(configPath, 'utf-8')
    return mergeBuiltinServers(normalizeConfig(JSON.parse(text) as unknown))
  } catch (err) {
    console.error('[mcp] Failed to parse config:', err)
    return mergeBuiltinServers({ version: 1, servers: [] })
  }
}

function schemaToZod(schema: unknown): ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any()
  }

  const withDescription = (base: ZodTypeAny, description?: string): ZodTypeAny => {
    if (typeof description === 'string' && description.trim().length > 0) {
      return base.describe(description)
    }
    return base
  }

  const node = schema as {
    type?: string
    description?: string
    properties?: Record<string, unknown>
    required?: string[]
    items?: unknown
    enum?: unknown[]
    minimum?: number
    maximum?: number
    anyOf?: unknown[]
    oneOf?: unknown[]
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const stringValues = node.enum.filter((v): v is string => typeof v === 'string')
    if (stringValues.length > 0) {
      return withDescription(z.enum(stringValues as [string, ...string[]]), node.description)
    }

    return withDescription(z.any(), node.description)
  }

  if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
    if (node.anyOf.length === 1) {
      return schemaToZod(node.anyOf[0])
    }

    return withDescription(
      z.union(node.anyOf.map((item) => schemaToZod(item)) as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]),
      node.description,
    )
  }

  if (Array.isArray(node.oneOf) && node.oneOf.length > 0) {
    if (node.oneOf.length === 1) {
      return schemaToZod(node.oneOf[0])
    }

    return withDescription(
      z.union(node.oneOf.map((item) => schemaToZod(item)) as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]),
      node.description,
    )
  }

  switch (node.type) {
    case 'string': {
      return withDescription(z.string(), node.description)
    }
    case 'number':
    {
      let schema = z.number()
      if (typeof node.minimum === 'number') schema = schema.min(node.minimum)
      if (typeof node.maximum === 'number') schema = schema.max(node.maximum)
      return withDescription(schema, node.description)
    }
    case 'integer': {
      let schema = z.number().int()
      if (typeof node.minimum === 'number') schema = schema.min(node.minimum)
      if (typeof node.maximum === 'number') schema = schema.max(node.maximum)
      return withDescription(schema, node.description)
    }
    case 'boolean': {
      return withDescription(z.boolean(), node.description)
    }
    case 'array': {
      return withDescription(z.array(schemaToZod(node.items)), node.description)
    }
    case 'object': {
      const shape: Record<string, ZodTypeAny> = {}
      const required = new Set(Array.isArray(node.required) ? node.required : [])
      const properties = node.properties ?? {}

      for (const [key, value] of Object.entries(properties)) {
        const propertySchema = schemaToZod(value)
        shape[key] = required.has(key) ? propertySchema : propertySchema.optional()
      }

      return withDescription(z.object(shape), node.description)
    }
    default:
      return withDescription(z.any(), node.description)
  }
}

function filterToolName(toolName: string, server: McpServerConfig): boolean {
  if (Array.isArray(server.includeTools) && server.includeTools.length > 0) {
    if (!server.includeTools.includes(toolName)) {
      return false
    }
  }

  if (Array.isArray(server.excludeTools) && server.excludeTools.includes(toolName)) {
    return false
  }

  return true
}

function buildRegisteredName(server: McpServerConfig, rawToolName: string): string {
  const prefix = (server.toolPrefix ?? server.id).trim()
  return prefix.length > 0 ? `${prefix}__${rawToolName}` : rawToolName
}

function mergedProcessEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value
    }
  }

  if (extra) {
    Object.assign(env, extra)
  }

  return env
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }

  return JSON.stringify(value)
}

function buildMcpToolErrorResult(params: {
  code: string
  message: string
  serverId: string
  registeredName: string
  rawToolName: string
  input: unknown
  durationMs?: number
  timeoutMs: number
}): Record<string, unknown> {
  const {
    code,
    message,
    serverId,
    registeredName,
    rawToolName,
    input,
    durationMs,
    timeoutMs,
  } = params

  return {
    ok: false,
    error: {
      code,
      message,
      serverId,
      toolName: registeredName,
      rawToolName,
      durationMs,
      timeoutMs,
    },
    input,
    nextAction: {
      instruction:
        'Do not retry with identical arguments. Analyze the error, infer the likely invalid/missing parameters, then call the tool again with revised arguments.',
      checklist: [
        'Check required fields and field names.',
        'Check parameter value types and enum-like constraints.',
        'If timeout occurs, narrow scope or use smaller payload.',
      ],
    },
  }
}

async function createServerTools(server: McpServerConfig): Promise<{ client: Client; tools: ToolSet }> {
  const client = new Client({
    name: 'uni-audio-agent',
    version: '0.1.0',
  })

  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    env: mergedProcessEnv(server.env),
    cwd: server.cwd,
    stderr: 'pipe',
  })

  await client.connect(transport)

  const listed = await client.listTools()
  const tools: ToolSet = {}

  for (const remoteTool of listed.tools) {
    const rawToolName = remoteTool.name
    if (!filterToolName(rawToolName, server)) {
      continue
    }

    const registeredName = buildRegisteredName(server, rawToolName)
    const timeoutMs = server.timeoutMs ?? 30000
    const failedCallSignatures = new Map<string, { at: number; error: string }>()
    const repeatedFailureWindowMs = 2 * 60 * 1000

    tools[registeredName] = tool({
      description: remoteTool.description ?? `MCP tool: ${rawToolName}`,
      parameters: schemaToZod(remoteTool.inputSchema),
      execute: async (input) => {
        const startedAt = Date.now()
        const argsSignature = stableStringify(input)
        const now = Date.now()

        for (const [key, item] of failedCallSignatures.entries()) {
          if (now - item.at > repeatedFailureWindowMs) {
            failedCallSignatures.delete(key)
          }
        }

        const previousFailure = failedCallSignatures.get(argsSignature)
        if (previousFailure) {
          const repeatedError = `Repeated failed MCP call with identical arguments: ${registeredName}`
          logLlmDebug('tool-exec-error', {
            source: 'mcp',
            serverId: server.id,
            toolName: registeredName,
            rawToolName,
            durationMs: 0,
            error: repeatedError,
            previousError: previousFailure.error,
            input,
          })

          return buildMcpToolErrorResult({
            code: 'mcp_repeated_failed_args',
            message: `${repeatedError}. Analyze previous error and adjust arguments before trying again.`,
            serverId: server.id,
            registeredName,
            rawToolName,
            input,
            durationMs: 0,
            timeoutMs,
          })
        }

        logLlmDebug('tool-exec-start', {
          source: 'mcp',
          serverId: server.id,
          toolName: registeredName,
          rawToolName,
          input,
        })

        const run = client.callTool({ name: rawToolName, arguments: input as Record<string, unknown> })
        const timeout = new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error(`[mcp] Tool timeout after ${timeoutMs}ms: ${registeredName}`)), timeoutMs)
        })

        try {
          const result = await Promise.race([run, timeout])
          failedCallSignatures.delete(argsSignature)
          logLlmDebug('tool-exec-result', {
            source: 'mcp',
            serverId: server.id,
            toolName: registeredName,
            rawToolName,
            durationMs: Date.now() - startedAt,
            result,
          })
          return result
        } catch (err) {
          const error = String(err)
          failedCallSignatures.set(argsSignature, {
            at: Date.now(),
            error,
          })

          logLlmDebug('tool-exec-error', {
            source: 'mcp',
            serverId: server.id,
            toolName: registeredName,
            rawToolName,
            durationMs: Date.now() - startedAt,
            error,
          })

          const errorCode = error.includes('timeout') ? 'mcp_tool_timeout' : 'mcp_tool_error'

          return buildMcpToolErrorResult({
            code: errorCode,
            message: error,
            serverId: server.id,
            registeredName,
            rawToolName,
            input,
            durationMs: Date.now() - startedAt,
            timeoutMs,
          })
        }
      },
    })
  }

  return { client, tools }
}

export async function initializeMcpHost(): Promise<void> {
  const config = loadMcpConfig()
  const nextTools: ToolSet = {}

  for (const server of config.servers) {
    if (server.enabled === false) {
      continue
    }

    try {
      const { client, tools } = await createServerTools(server)
      activeClients.set(server.id, client)
      Object.assign(nextTools, tools)
      console.info(`[mcp] Connected server \"${server.id}\" with ${Object.keys(tools).length} tools`)
    } catch (err) {
      console.error(`[mcp] Failed to connect server \"${server.id}\":`, err)
    }
  }

  replaceMcpTools(nextTools)
  console.info(`[mcp] Registered MCP tools: ${Object.keys(nextTools).length}`)
}

export async function shutdownMcpHost(): Promise<void> {
  const closing: Promise<unknown>[] = []
  activeClients.forEach((client) => {
    closing.push(client.close())
  })

  await Promise.allSettled(closing)
  activeClients.clear()
  replaceMcpTools({})
}
