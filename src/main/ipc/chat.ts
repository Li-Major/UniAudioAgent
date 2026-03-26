import { ipcMain } from 'electron'
import type { CoreMessage } from 'ai'
import { streamChatToRenderer } from '../services/llm'
import { IPC } from '../../shared/ipc-channels'

export function setupChatHandlers(): void {
  ipcMain.handle(IPC.CHAT_SEND, async (event, messages: CoreMessage[]) => {
    await streamChatToRenderer(messages, event.sender)
  })
}
