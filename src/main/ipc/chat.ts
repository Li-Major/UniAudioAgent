import { ipcMain } from 'electron'
import type { CoreMessage } from 'ai'
import type { ChatSession } from '@shared/types'
import { streamChatToRenderer } from '../services/llm'
import { storeService } from '../services/store'
import { IPC } from '../../shared/ipc-channels'

export function setupChatHandlers(): void {
  // Remove handlers first to prevent "second handler" errors on hot reload
  const channels = [
    IPC.CHAT_SEND,
    IPC.CHAT_SESSIONS_LIST,
    IPC.CHAT_SESSIONS_CREATE,
    IPC.CHAT_SESSIONS_LOAD,
    IPC.CHAT_SESSIONS_DELETE,
    IPC.CHAT_SESSIONS_SAVE,
  ]
  for (const ch of channels) ipcMain.removeHandler(ch)

  ipcMain.handle(IPC.CHAT_SEND, async (event, messages: CoreMessage[]) => {
    await streamChatToRenderer(messages, event.sender)
  })

  // Chat Sessions
  ipcMain.handle(IPC.CHAT_SESSIONS_LIST, () => {
    return storeService.getAllSessions()
  })

  ipcMain.handle(IPC.CHAT_SESSIONS_CREATE, (_event, title: string) => {
    return storeService.createSession(title)
  })

  ipcMain.handle(IPC.CHAT_SESSIONS_LOAD, (_event, id: string) => {
    return storeService.getSession(id)
  })

  ipcMain.handle(IPC.CHAT_SESSIONS_DELETE, (_event, id: string) => {
    storeService.deleteSession(id)
  })

  ipcMain.handle(IPC.CHAT_SESSIONS_SAVE, (_event, session: ChatSession) => {
    storeService.saveSession(session)
  })
}
