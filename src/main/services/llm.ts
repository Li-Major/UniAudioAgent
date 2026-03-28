import { streamText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import ollama, { Ollama, type Message as OllamaMessage, type Tool as OllamaTool, type ToolCall as OllamaToolCall } from 'ollama'
import type { CoreMessage, Tool, ToolExecutionOptions, ToolSet } from 'ai'
import type { WebContents } from 'electron'
import type { ZodTypeAny } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { allTools } from '../tools'
import { storeService } from './store'
import { logLlmDebug } from './debug-log'
import { IPC } from '../../shared/ipc-channels'

const SYSTEM_PROMPT = `你是 UniAudioAgent，一个专业的游戏音频助手。你了解主流的音频中间件如Wwise、FMOD等，了解游戏设计领域的相关知识。你帮助音频设计师通过自然语言完成工作，包括与 Wwise 音频中间件交互。

内置工具能力（始终可用）：
- read_file：读取本地文件内容
- write_file：写入或创建本地文件
- list_directory：列出目录中的文件和子目录
- get_directory_tree：递归获取目录树结构
- search_files：按文件名或内容关键词搜索文件
- exec_command：执行 Shell 命令（如 git、node、python 等）

扩展工具能力（通过 MCP 服务接入）：
- 用户可在 mcp.config.json 中配置额外的 MCP 服务（如 Wwise WAAPI 工具），接入后可直接操作 Wwise 项目
- 已连接的 MCP 工具会自动注册，可通过工具名前缀识别来源（如 wwise__getProjectInfo）

操作规范：
- 优先使用内置工具完成文件操作、目录查询等任务，无需等待 MCP 接入
- 如果用户要求直接操作 Wwise 项目内容，则使用 Wwise MCP 工具
- 对 Wwise MCP 工具优先采用“先发现、后执行”流程：先调用 wwise__catalog.listDomains 了解可操作域，再根据结果调用 wwise__catalog.listTools / wwise__catalog.getToolSchema，最后再执行具体工具
- wwise__session.getConfig 的语义是“读取当前 WAAPI 连接配置”（如 URL/端口/配置），不是直接查询 Wwise 工程连接状态；如需连通性与能力判断，优先使用 catalog 发现接口与具体 WAAPI 工具结果综合判断
- 使用中文回复，但保留 Wwise 专业术语（如 Event、Bus、SoundBank）的英文命名
- 执行 exec_command 时，优先使用具体可执行文件路径，避免依赖环境变量
- 当任意工具返回错误（尤其是参数校验错误/超时）时，必须先分析错误原因，再调整参数后重试；禁止使用完全相同的参数进行盲重试`

function normalizeOllamaHost(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed
}

function messageContentToText(content: CoreMessage['content']): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'type' in part && (part as { type?: string }).type === 'text') {
          return String((part as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
  }

  return ''
}

function toOllamaMessages(messages: CoreMessage[]): OllamaMessage[] {
  const converted: OllamaMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

  for (const msg of messages) {
    const role = msg.role === 'tool' ? 'tool' : msg.role
    const content = messageContentToText(msg.content)
    converted.push({ role, content })
  }

  return converted
}

function isZodSchema(value: unknown): value is ZodTypeAny {
  return Boolean(value) && typeof value === 'object' && typeof (value as { safeParse?: unknown }).safeParse === 'function'
}

function toJsonSchema(parameters: unknown): Record<string, unknown> {
  if (isZodSchema(parameters)) {
    return zodToJsonSchema(parameters, { $refStrategy: 'none' }) as Record<string, unknown>
  }

  if (parameters && typeof parameters === 'object') {
    return parameters as Record<string, unknown>
  }

  return { type: 'object', properties: {} }
}

function buildOllamaTools(toolSet: ToolSet): OllamaTool[] {
  const tools: OllamaTool[] = []

  for (const [toolName, maybeTool] of Object.entries(toolSet)) {
    const localTool = maybeTool as Tool
    if (localTool.type === 'provider-defined') {
      continue
    }

    tools.push({
      type: 'function',
      function: {
        name: toolName,
        description: localTool.description,
        parameters: toJsonSchema(localTool.parameters),
      },
    })
  }

  return tools
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') {
    return raw as Record<string, unknown>
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }

  return {}
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }

  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

async function executeToolByName(
  toolName: string,
  args: Record<string, unknown>,
  messages: CoreMessage[],
): Promise<unknown> {
  const tool = (allTools as Record<string, Tool>)[toolName]
  if (!tool || tool.type === 'provider-defined' || !tool.execute) {
    return { error: `Tool not found or not executable: ${toolName}` }
  }

  let validatedArgs: Record<string, unknown> = args
  if (isZodSchema(tool.parameters)) {
    const parsed = tool.parameters.safeParse(args)
    if (!parsed.success) {
      return {
        error: `Tool args validation failed: ${parsed.error.message}`,
      }
    }
    validatedArgs = parsed.data as Record<string, unknown>
  }

  const options: ToolExecutionOptions = {
    toolCallId: `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    messages,
  }

  try {
    return await tool.execute(validatedArgs, options)
  } catch (err) {
    return { error: String(err) }
  }
}

async function streamOllamaWithTools(
  requestId: string,
  model: string,
  baseUrl: string,
  messages: CoreMessage[],
  sender: WebContents,
): Promise<void> {
  const ollamaMessages = toOllamaMessages(messages)
  const ollamaTools = buildOllamaTools(allTools)
  const host = normalizeOllamaHost(baseUrl)
  const client = host ? new Ollama({ host }) : ollama

  logLlmDebug('ollama-loop-start', {
    requestId,
    model,
    host,
    messageCount: ollamaMessages.length,
    toolNames: ollamaTools.map((t) => t.function.name),
  })

  const maxSteps = 10
  for (let step = 0; step < maxSteps; step += 1) {
    if (sender.isDestroyed()) {
      break
    }

    const stream = await client.chat({
      model,
      messages: ollamaMessages,
      tools: ollamaTools,
      stream: true,
      think: true,
      options: {
        temperature: 0,
      },
    })

    let thinking = ''
    let content = ''
    const toolCalls: OllamaToolCall[] = []

    for await (const chunk of stream) {
      if (sender.isDestroyed()) {
        break
      }

      logLlmDebug('stream-part', {
        requestId,
        step,
        part: chunk,
      })

      if (chunk.message.thinking) {
        thinking += chunk.message.thinking
      }

      if (chunk.message.content) {
        content += chunk.message.content
        sender.send(IPC.CHAT_DELTA, chunk.message.content)
      }

      if (chunk.message.tool_calls?.length) {
        toolCalls.push(...chunk.message.tool_calls)
      }
    }

    if (thinking || content || toolCalls.length > 0) {
      ollamaMessages.push({
        role: 'assistant',
        content,
        thinking,
        tool_calls: toolCalls,
      })
    }

    if (toolCalls.length === 0) {
      break
    }

    for (const call of toolCalls) {
      const toolName = call.function?.name ?? ''
      const args = parseToolArgs(call.function?.arguments)

      logLlmDebug('tool-call-event', {
        requestId,
        toolName,
        args,
        source: 'ollama-native',
      })

      sender.send(IPC.CHAT_TOOL_CALL, { toolName, args })

      const result = await executeToolByName(toolName, args, messages)
      sender.send(IPC.CHAT_TOOL_RESULT, { toolName, result })

      logLlmDebug('tool-result-event', {
        requestId,
        toolName,
        result,
        source: 'ollama-native',
      })

      ollamaMessages.push({
        role: 'tool',
        tool_name: toolName,
        content: stringifyToolResult(result),
      })
    }
  }
}

export async function streamChatToRenderer(
  messages: CoreMessage[],
  sender: WebContents,
): Promise<void> {
  const settings = storeService.getSettings()
  const requestId = `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  try {
    const provider = settings.llmProvider

    if (provider === 'ollama') {
      logLlmDebug('request', {
        requestId,
        provider,
        model: settings.defaultModel,
        toolNames: Object.keys(allTools),
        system: SYSTEM_PROMPT,
        messages,
      })

      await streamOllamaWithTools(
        requestId,
        settings.defaultModel,
        settings.ollamaBaseUrl,
        messages,
        sender,
      )

      logLlmDebug('done', { requestId })
      sender.send(IPC.CHAT_DONE)
      return
    } else {
      if (!settings.openrouterApiKey) {
        sender.send(IPC.CHAT_ERROR, '请先在设置中填写 OpenRouter API Key')
        sender.send(IPC.CHAT_DONE)
        return
      }

      const openrouter = createOpenRouter({ apiKey: settings.openrouterApiKey })
      logLlmDebug('request', {
        requestId,
        provider,
        model: settings.defaultModel,
        toolNames: Object.keys(allTools),
        system: SYSTEM_PROMPT,
        messages,
      })

      const result = streamText({
        model: openrouter(settings.defaultModel),
        messages,
        tools: allTools,
        maxSteps: 10,
        system: SYSTEM_PROMPT,
      })

      for await (const part of result.fullStream) {
        if (sender.isDestroyed()) break
        logLlmDebug('stream-part', { requestId, part })

        switch (part.type) {
          case 'text-delta':
            sender.send(IPC.CHAT_DELTA, part.textDelta)
            break
          case 'tool-call':
            logLlmDebug('tool-call-event', {
              requestId,
              toolName: part.toolName,
              args: part.args,
            })
            sender.send(IPC.CHAT_TOOL_CALL, {
              toolName: part.toolName,
              args: part.args,
            })
            break
          case 'error':
            sender.send(IPC.CHAT_ERROR, String(part.error))
            break
        }
      }

      logLlmDebug('done', { requestId })
      sender.send(IPC.CHAT_DONE)
    }
  } catch (err) {
    logLlmDebug('failure', { requestId, error: err })
    if (!sender.isDestroyed()) {
      sender.send(IPC.CHAT_ERROR, `LLM 调用失败: ${String(err)}`)
      sender.send(IPC.CHAT_DONE)
    }
  }
}
