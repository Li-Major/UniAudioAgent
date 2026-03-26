/**
 * TypeScript declarations for the preload-exposed window.api object.
 * Available in renderer process as window.api or just api (global).
 */
interface Window {
  api: {
    invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
    on: (channel: string, callback: (...args: unknown[]) => void) => () => void
    once: (channel: string, callback: (...args: unknown[]) => void) => void
    send: (channel: string, ...args: unknown[]) => void
  }
}
