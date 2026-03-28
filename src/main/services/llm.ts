import { streamText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOllama } from 'ollama-ai-provider'
import type { CoreMessage } from 'ai'
import type { WebContents } from 'electron'
import { allTools } from '../tools'
import { storeService } from './store'
import { IPC } from '../../shared/ipc-channels'

function isLlmDebugEnabled(): boolean {
  const debugFlags = process.env.UNIAUDIO_DEBUG ?? ''
  return debugFlags === '1' || debugFlags.split(',').some((flag) => flag.trim().toLowerCase() === 'llm')
}

function serializeDebugPayload(value: unknown): string {
  const seen = new WeakSet<object>()

  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === 'string' && currentValue.length > 4000) {
        return `${currentValue.slice(0, 4000)}... [truncated ${currentValue.length - 4000} chars]`
      }

      if (typeof currentValue === 'bigint') {
        return currentValue.toString()
      }

      if (currentValue instanceof Error) {
        return {
          name: currentValue.name,
          message: currentValue.message,
          stack: currentValue.stack,
        }
      }

      if (typeof currentValue === 'object' && currentValue !== null) {
        if (seen.has(currentValue)) {
          return '[Circular]'
        }
        seen.add(currentValue)
      }

      return currentValue
    },
    2,
  )
}

function logLlmDebug(event: string, payload: unknown): void {
  if (!isLlmDebugEnabled()) {
    return
  }

  console.info(`[llm-debug] ${event}\n${serializeDebugPayload(payload)}`)
}

const SYSTEM_PROMPT = `你是 UniAudioAgent，一个专业的游戏音频助手。你帮助音频设计师通过自然语言完成工作，包括与 Wwise 音频中间件交互。

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
- 如果用户要求直接操作 Wwise 项目内容，检查是否有对应 MCP 工具可用
- 使用中文回复，但保留 Wwise 专业术语（如 Event、Bus、SoundBank）的英文命名
- 执行 exec_command 时，优先使用具体可执行文件路径，避免依赖环境变量`

export async function streamChatToRenderer(
  messages: CoreMessage[],
  sender: WebContents,
): Promise<void> {
  const settings = storeService.getSettings()
  const requestId = `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  try {
    let modelFactory: ((modelId: string) => ReturnType<ReturnType<typeof createOpenRouter>>) | ((modelId: string) => ReturnType<ReturnType<typeof createOllama>>)
    const provider = settings.llmProvider

    if (provider === 'ollama') {
      const ollama = createOllama({ baseURL: settings.ollamaBaseUrl })
      modelFactory = ollama
    } else {
      if (!settings.openrouterApiKey) {
        sender.send(IPC.CHAT_ERROR, '请先在设置中填写 OpenRouter API Key')
        sender.send(IPC.CHAT_DONE)
        return
      }

      const openrouter = createOpenRouter({ apiKey: settings.openrouterApiKey })
      modelFactory = openrouter
    }

    logLlmDebug('request', {
      requestId,
      provider,
      model: settings.defaultModel,
      toolNames: Object.keys(allTools),
      system: SYSTEM_PROMPT,
      messages,
    })

    const result = streamText({
      model: modelFactory(settings.defaultModel),
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
  } catch (err) {
    logLlmDebug('failure', { requestId, error: err })
    if (!sender.isDestroyed()) {
      sender.send(IPC.CHAT_ERROR, `LLM 调用失败: ${String(err)}`)
      sender.send(IPC.CHAT_DONE)
    }
  }
}
