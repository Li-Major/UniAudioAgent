import { streamText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOllama } from 'ollama-ai-provider'
import type { CoreMessage } from 'ai'
import type { WebContents } from 'electron'
import { allTools } from '../tools'
import { storeService } from './store'
import { IPC } from '../../shared/ipc-channels'

const SYSTEM_PROMPT = `你是 UniAudioAgent，一个专业的游戏音频助手。你帮助音频设计师通过自然语言与 Wwise 音频中间件交互。

你的能力：
- 查询 Wwise 项目中的对象、属性和层级结构
- 读取和修改对象属性（如 Volume、Pitch、Output Bus 等）
- 获取当前项目信息

操作规范：
- 在执行任何写操作（setProperty）前，必须先向用户描述即将进行的修改并请求确认
- 当工具返回错误时，清晰地向用户解释问题，并提供具体的解决建议
- 如果查询结果过多，主动提示用户缩小搜索范围
- 使用中文回复，但保留 Wwise 专业术语（如 Event、Bus、SoundBank）的英文命名

局限：
- 你只能操作当前在 Wwise 中打开的项目
- 复杂的批量操作需要多次工具调用，请耐心执行`

export async function streamChatToRenderer(
  messages: CoreMessage[],
  sender: WebContents,
): Promise<void> {
  const settings = storeService.getSettings()

  try {
    let modelFactory: ((modelId: string) => ReturnType<ReturnType<typeof createOpenRouter>>) | ((modelId: string) => ReturnType<ReturnType<typeof createOllama>>)

    if (settings.llmProvider === 'ollama') {
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

    const result = streamText({
      model: modelFactory(settings.defaultModel),
      messages,
      tools: allTools,
      maxSteps: 10,
      system: SYSTEM_PROMPT,
    })

    for await (const part of result.fullStream) {
      if (sender.isDestroyed()) break

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
        case 'tool-result':
          sender.send(IPC.CHAT_TOOL_RESULT, {
            toolName: part.toolName,
            result: part.result,
          })
          break
        case 'error':
          sender.send(IPC.CHAT_ERROR, String(part.error))
          break
      }
    }

    sender.send(IPC.CHAT_DONE)
  } catch (err) {
    if (!sender.isDestroyed()) {
      sender.send(IPC.CHAT_ERROR, `LLM 调用失败: ${String(err)}`)
      sender.send(IPC.CHAT_DONE)
    }
  }
}
