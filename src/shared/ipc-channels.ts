/** All IPC channel names in one place — never use magic strings. */
export const IPC = {
  // ── Chat ──────────────────────────────────────────────────────────────────
  /** renderer → main: send a new user message. Resolves when streaming ends. */
  CHAT_SEND: 'chat:send',
  /** main → renderer: text token streamed from the LLM */
  CHAT_DELTA: 'chat:delta',
  /** main → renderer: a tool was called */
  CHAT_TOOL_CALL: 'chat:tool-call',
  /** main → renderer: a tool returned a result */
  CHAT_TOOL_RESULT: 'chat:tool-result',
  /** main → renderer: streaming finished */
  CHAT_DONE: 'chat:done',
  /** main → renderer: an error occurred during streaming */
  CHAT_ERROR: 'chat:error',

  // ── Settings ──────────────────────────────────────────────────────────────
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // ── Chat Sessions ─────────────────────────────────────────────────────────
  /** renderer → main: get all chat sessions list */
  CHAT_SESSIONS_LIST: 'chat:sessions-list',
  /** renderer → main: create a new empty chat session */
  CHAT_SESSIONS_CREATE: 'chat:sessions-create',
  /** renderer → main: load a specific chat session by id */
  CHAT_SESSIONS_LOAD: 'chat:sessions-load',
  /** renderer → main: delete a chat session by id */
  CHAT_SESSIONS_DELETE: 'chat:sessions-delete',
  /** renderer → main: save current session (title + messages) */
  CHAT_SESSIONS_SAVE: 'chat:sessions-save',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
