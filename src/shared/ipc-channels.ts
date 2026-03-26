/** All IPC channel names in one place — never use magic strings. */
export const IPC = {
  // ── Chat ──────────────────────────────────────────────────────────────────
  /** renderer → main: send a new user message. Resolves when streaming ends. */
  CHAT_SEND: 'chat:send',
  /** main → renderer: text token streamed from the LLM */
  CHAT_DELTA: 'chat:delta',
  /** main → renderer: a Wwise tool was called */
  CHAT_TOOL_CALL: 'chat:tool-call',
  /** main → renderer: a Wwise tool returned a result */
  CHAT_TOOL_RESULT: 'chat:tool-result',
  /** main → renderer: streaming finished */
  CHAT_DONE: 'chat:done',
  /** main → renderer: an error occurred during streaming */
  CHAT_ERROR: 'chat:error',

  // ── Settings ──────────────────────────────────────────────────────────────
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // ── WAAPI status ──────────────────────────────────────────────────────────
  /** main → renderer: Wwise connection state changed */
  WAAPI_STATUS: 'waapi:status',
  /** renderer → main: manually request a reconnect attempt */
  WAAPI_RECONNECT: 'waapi:reconnect',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
