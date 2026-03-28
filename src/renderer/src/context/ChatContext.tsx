import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { IPC } from '@shared/ipc-channels'
import type { ChatMessage, ChatSession, ToolCallInfo } from '@shared/types'
import type { CoreMessage } from 'ai'

type ChatToolCallPayload = { toolName: string; args: Record<string, unknown> }
type ChatToolResultPayload = { toolName: string; result: unknown }

interface ChatContextValue {
  currentSession: ChatSession | null
  sessions: ChatSession[]
  isLoading: boolean
  initError: string | null
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
  createNewSession: (title?: string) => Promise<ChatSession>
  switchSession: (session: ChatSession) => void
  deleteSession: (id: string) => Promise<void>
  updateSessionTitle: (id: string, newTitle: string) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }): JSX.Element {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const initCalledRef = useRef(false)

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (initCalledRef.current) return
    initCalledRef.current = true
    loadSessions()
  }, [])

  const loadSessions = async (): Promise<void> => {
    try {
      const sessionList = (await window.api.invoke(IPC.CHAT_SESSIONS_LIST)) as ChatSession[]
      setSessions(sessionList)
      if (sessionList.length === 0) {
        const newSession = (await window.api.invoke(IPC.CHAT_SESSIONS_CREATE, '新对话')) as ChatSession
        setCurrentSession(newSession)
        setSessions([newSession])
      } else {
        setCurrentSession(sessionList[0])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ChatContext] loadSessions failed:', err)
      setInitError(msg)
    }
  }

  const createNewSession = useCallback(async (title?: string): Promise<ChatSession> => {
    try {
      const newSession = (await window.api.invoke(
        IPC.CHAT_SESSIONS_CREATE,
        title || `对话 ${new Date().toLocaleString()}`,
      )) as ChatSession
      setSessions((prev) => [...prev, newSession])
      setCurrentSession(newSession)
      return newSession
    } catch (err) {
      console.error('[ChatContext] createNewSession failed:', err)
      throw err
    }
  }, [])

  const switchSession = useCallback((session: ChatSession) => {
    setCurrentSession(session)
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await window.api.invoke(IPC.CHAT_SESSIONS_DELETE, id)
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id)
      setCurrentSession((cur) => {
        if (cur?.id === id) {
          if (remaining.length > 0) return remaining[0]
          // async: create new session
          window.api.invoke(IPC.CHAT_SESSIONS_CREATE, '新对话').then((s) => {
            const newSession = s as ChatSession
            setSessions([newSession])
            setCurrentSession(newSession)
          })
          return null
        }
        return cur
      })
      return remaining
    })
  }, [])

  const updateSessionTitle = useCallback((id: string, newTitle: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s)))
    setCurrentSession((cur) => (cur?.id === id ? { ...cur, title: newTitle } : cur))
  }, [])

  const saveCurrentSession = useCallback((session: ChatSession) => {
    window.api.invoke(IPC.CHAT_SESSIONS_SAVE, session)
    setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)))
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || !currentSession) return

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }

      const assistantId = crypto.randomUUID()
      streamingIdRef.current = assistantId
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [],
      }

      const historyForLLM: CoreMessage[] = currentSession.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      historyForLLM.push({ role: 'user', content: text })

      setCurrentSession((prev) =>
        prev ? { ...prev, messages: [...prev.messages, userMsg, assistantMsg] } : prev,
      )
      setIsLoading(true)

      const cleanups: (() => void)[] = []
      let finalized = false

      const finalizeStream = (source: 'done-event' | 'invoke-fallback' | 'invoke-error'): void => {
        if (finalized) return
        finalized = true

        streamingIdRef.current = null
        setIsLoading(false)
        cleanups.forEach((fn) => fn())

        setCurrentSession((prev) => {
          if (!prev) return prev

          const normalized = {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.status === 'calling' ? { ...tc, status: 'done' as const } : tc,
                    ),
                  }
                : m,
            ),
          }

          saveCurrentSession(normalized)
          return normalized
        })

        if (source !== 'done-event') {
          console.warn(`[chat] Stream finalized via ${source} (CHAT_DONE was missed or delayed)`)
        }
      }

      cleanups.push(
        window.api.on(IPC.CHAT_DELTA, (delta) => {
          const id = streamingIdRef.current
          if (!id) return
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === id ? { ...m, content: m.content + (delta as string) } : m,
                  ),
                }
              : prev,
          )
        }),
      )

      cleanups.push(
        window.api.on(IPC.CHAT_TOOL_CALL, (payload) => {
          const id = streamingIdRef.current
          if (!id) return
          const { toolName, args } = payload as ChatToolCallPayload
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  messages: prev.messages.map((m) =>
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
                }
              : prev,
          )
        }),
      )

      cleanups.push(
        window.api.on(IPC.CHAT_TOOL_RESULT, (payload) => {
          const id = streamingIdRef.current
          if (!id) return
          const { toolName, result } = payload as ChatToolResultPayload
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  messages: prev.messages.map((m) =>
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
                }
              : prev,
          )
        }),
      )

      cleanups.push(
        window.api.on(IPC.CHAT_ERROR, (errMsg) => {
          const id = streamingIdRef.current
          if (!id) return
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === id
                      ? { ...m, content: m.content || `⚠️ 发生错误: ${String(errMsg)}` }
                      : m,
                  ),
                }
              : prev,
          )
        }),
      )

      cleanups.push(
        window.api.on(IPC.CHAT_DONE, () => {
          finalizeStream('done-event')
        }),
      )

      try {
        await window.api.invoke(IPC.CHAT_SEND, historyForLLM)
      } catch (err) {
        const id = streamingIdRef.current
        setCurrentSession((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === id ? { ...m, content: m.content || `⚠️ 调用失败: ${String(err)}` } : m,
                ),
              }
            : prev,
        )
        finalizeStream('invoke-error')
      } finally {
        // Fallback: if CHAT_DONE event is lost due IPC timing edge cases,
        // finalize shortly after invoke resolves to avoid permanent loading state.
        setTimeout(() => {
          finalizeStream('invoke-fallback')
        }, 300)
      }
    },
    [isLoading, currentSession, saveCurrentSession],
  )

  const clearMessages = useCallback(() => {
    setCurrentSession((prev) => {
      if (!prev) return prev
      const updated = { ...prev, messages: [] }
      window.api.invoke(IPC.CHAT_SESSIONS_SAVE, updated)
      return updated
    })
  }, [])

  return (
    <ChatContext.Provider
      value={{
        currentSession,
        sessions,
        isLoading,
        initError,
        sendMessage,
        clearMessages,
        createNewSession,
        switchSession,
        deleteSession,
        updateSessionTitle,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used inside ChatProvider')
  return ctx
}
