import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

/**
 * Secure bridge between renderer process and main process.
 * Only these methods are accessible from the renderer via window.api.
 */
const api = {
  /** Invoke a main-process IPC handler and await the result. */
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>,

  /**
   * Subscribe to events pushed from the main process.
   * Returns a cleanup function — call it to unsubscribe.
   */
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  /** One-time event listener. */
  once: (channel: string, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args))
  },

  /** Send a fire-and-forget message to main process (no response). */
  send: (channel: string, ...args: unknown[]): void => {
    ipcRenderer.send(channel, ...args)
  },
}

contextBridge.exposeInMainWorld('api', api)
