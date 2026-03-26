import { useState, useCallback, useRef } from 'react'
import { IPC } from '@shared/ipc-channels'
import type { ChatMessage, ToolCallInfo } from '@shared/types'
import type { CoreMessage } from 'ai'

type ChatToolCallPayload = { toolName: string; args: Record<string, unknown> }
type ChatToolResultPayload = { toolName: string; result: unknown }

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Ref to the currently streaming assistant message id
  const streamingIdRef = useRef<string | null>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return

      // 1 – Add user message
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }

      // 2 – Add empty assistant message for streaming
      const assistantId = crypto.randomUUID()
      streamingIdRef.current = assistantId
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [],
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsLoading(true)

      // Build CoreMessage list for LLM (history + new user msg)
      // Rebuild from current state plus the new user message
      const historyForLLM: CoreMessage[] = []
      setMessages((prev) => {
        for (const m of prev) {
          if (m.role === 'user' || m.role === 'assistant') {
            if (m.id !== assistantId) {
              historyForLLM.push({ role: m.role, content: m.content })
            }
          }
        }
        return prev
      })
      historyForLLM.push({ role: 'user', content: text })

      // 3 – Subscribe to streaming events
      const cleanups: (() => void)[] = []

      cleanups.push(
        window.api.on(IPC.CHAT_DELTA, (delta) => {
          const id = streamingIdRef.current
          if (!id) return
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, content: m.content + (delta as string) } : m,
            ),
          )
        }),
      )

      cleanups.push(
        window.api.on(IPC.CHAT_TOOL_CALL, (payload) => {
          const id = streamingIdRef.current
          if (!id) return
          const { toolName, args } = payload as ChatToolCallPayload
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    toolCalls: [
                      ...(m.toolCalls ?? []),
                      { toolName, args, status: 'calling' } satisfies ToolCallInfo,
                    ],
                  }
                : m,
            ),
          )
        }),
      )

      cleanups.push(
        window.api.on(IPC.CHAT_TOOL_RESULT, (payload) => {
          const id = streamingIdRef.current
          if (!id) return
          const { toolName, result } = payload as ChatToolResultPayload
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.toolName === toolName && tc.status === 'calling'
                        ? { ...tc, result, status: 'done' }
                        : tc,
                    ),
                  }
                : m,
            ),
          )
        }),
      )

      cleanups.push(
        window.api.on(IPC.CHAT_ERROR, (errMsg) => {
          const id = streamingIdRef.current
          if (!id) return
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    content:
                      m.content || `⚠️ 发生错误: ${String(errMsg)}`,
                  }
                : m,
            ),
          )
        }),
      )

      cleanups.push(
        window.api.on(IPC.CHAT_DONE, () => {
          streamingIdRef.current = null
          setIsLoading(false)
          cleanups.forEach((fn) => fn())
        }),
      )

      // 4 – Send to main process
      await window.api.invoke(IPC.CHAT_SEND, historyForLLM)
    },
    [isLoading],
  )

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return { messages, isLoading, sendMessage, clearMessages }
}
