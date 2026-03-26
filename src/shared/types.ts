export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** Tool calls made during this message */
  toolCalls?: ToolCallInfo[]
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
  ollamaBaseUrl: string
  waapiUrl: string
  defaultModel: string
}

export interface WaapiStatus {
  connected: boolean
  url: string
  error?: string
}

/** Passed from main → renderer to indicate streaming progress */
export interface ChatDeltaEvent {
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
