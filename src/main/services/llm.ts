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
- 回答游戏音频设计、Wwise 工作流和实现思路相关问题
- 协助用户整理需求、生成操作建议和技术方案
- 在接入 MCP 工具后，基于外部工具扩展实际执行能力

操作规范：
- 当前应用不再直接发起 WAAPI WebSocket 连接，也不直接操作 Wwise
- 如果用户要求读取或修改 Wwise 项目，明确说明需要等待后续 MCP 接入
- 使用中文回复，但保留 Wwise 专业术语（如 Event、Bus、SoundBank）的英文命名

局限：
- 当前版本不具备内置 Wwise 工具调用能力
- 复杂的自动化操作需要等待 MCP 工具接入后再执行`

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
