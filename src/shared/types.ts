export type ChatMessageStatus =
  | 'sent'
  | 'responding'
  | 'tool-calling'
  | 'completed'
  | 'completed-tools'
  | 'error'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Streamed model reasoning/thinking text (if provider supports it). */
  thinking?: string
  timestamp: number
  status?: ChatMessageStatus
  /** Tool calls made during this message */
  toolCalls?: ToolCallInfo[]
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ToolCallInfo {
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  status: 'calling' | 'done' | 'error'
}

export interface AppSettings {
  llmProvider: 'openrouter' | 'ollama'
  openrouterApiKey: string
  openrouterBaseUrl: string
  ollamaBaseUrl: string
  defaultModel: string
}

/** Passed from main → renderer to indicate streaming progress */
export interface ChatDeltaEvent {
  delta: string
}

/** Passed from main → renderer to stream model thinking/reasoning tokens. */
export interface ChatThinkingDeltaEvent {
  delta: string
}

export interface ChatToolCallEvent {
  toolName: string
  args: Record<string, unknown>
}

export interface ChatToolResultEvent {
  toolName: string
  result: unknown
}
