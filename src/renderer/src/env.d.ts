/// <reference types="vite/client" />

interface Window {
  api: {
    invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
    on: (channel: string, callback: (...args: unknown[]) => void) => () => void
    once: (channel: string, callback: (...args: unknown[]) => void) => void
    send: (channel: string, ...args: unknown[]) => void
  }
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
