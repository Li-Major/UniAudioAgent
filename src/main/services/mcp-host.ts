import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { tool, type ToolSet } from 'ai'
import { z, type ZodTypeAny } from 'zod'
import { replaceAllTools } from '../tools'

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
const activeClients = new Map<string, Client>()

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
    return { version: 1, servers: [] }
  }

  try {
    const text = readFileSync(configPath, 'utf-8')
    return normalizeConfig(JSON.parse(text) as unknown)
  } catch (err) {
    console.error('[mcp] Failed to parse config:', err)
    return { version: 1, servers: [] }
  }
}

function schemaToZod(schema: unknown): ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any()
  }

  const node = schema as {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
    items?: unknown
    enum?: unknown[]
    anyOf?: unknown[]
    oneOf?: unknown[]
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const stringValues = node.enum.filter((v): v is string => typeof v === 'string')
    if (stringValues.length > 0) {
      return z.enum(stringValues as [string, ...string[]])
    }

    return z.any()
  }

  if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
    if (node.anyOf.length === 1) {
      return schemaToZod(node.anyOf[0])
    }

    return z.union(node.anyOf.map((item) => schemaToZod(item)) as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
  }

  if (Array.isArray(node.oneOf) && node.oneOf.length > 0) {
    if (node.oneOf.length === 1) {
      return schemaToZod(node.oneOf[0])
    }

    return z.union(node.oneOf.map((item) => schemaToZod(item)) as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
  }

  switch (node.type) {
    case 'string':
      return z.string()
    case 'number':
      return z.number()
    case 'integer':
      return z.number().int()
    case 'boolean':
      return z.boolean()
    case 'array':
      return z.array(schemaToZod(node.items))
    case 'object': {
      const shape: Record<string, ZodTypeAny> = {}
      const required = new Set(Array.isArray(node.required) ? node.required : [])
      const properties = node.properties ?? {}

      for (const [key, value] of Object.entries(properties)) {
        const propertySchema = schemaToZod(value)
        shape[key] = required.has(key) ? propertySchema : propertySchema.optional()
      }

      return z.object(shape)
    }
    default:
      return z.any()
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

async function createServerTools(server: McpServerConfig): Promise<{ client: Client; tools: ToolSet }> {
  const client = new Client({
    name: 'uni-audio-agent',
    version: '0.1.0',
  })

  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    env: server.env,
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

    tools[registeredName] = tool({
      description: remoteTool.description ?? `MCP tool: ${rawToolName}`,
      parameters: schemaToZod(remoteTool.inputSchema),
      execute: async (input) => {
        const run = client.callTool({ name: rawToolName, arguments: input as Record<string, unknown> })
        const timeout = new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error(`[mcp] Tool timeout after ${timeoutMs}ms: ${registeredName}`)), timeoutMs)
        })

        const result = await Promise.race([run, timeout])
        return result
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

  replaceAllTools(nextTools)
  console.info(`[mcp] Registered total tools: ${Object.keys(nextTools).length}`)
}

export async function shutdownMcpHost(): Promise<void> {
  const closing: Promise<unknown>[] = []
  for (const client of activeClients.values()) {
    closing.push(client.close())
  }

  await Promise.allSettled(closing)
  activeClients.clear()
  replaceAllTools({})
}
