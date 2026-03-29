import Store from 'electron-store'
import { safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import type { AppSettings, ChatSession } from '../../shared/types'

interface StoreSchema {
  llmProvider: 'openrouter' | 'ollama'
  openrouterBaseUrl: string
  ollamaBaseUrl: string
  defaultModel: string
  openrouterApiKeyEncrypted: string
  chatSessions: ChatSession[]
  currentSessionId: string
}

const store = new Store<StoreSchema>({
  defaults: {
    llmProvider: 'openrouter',
    openrouterBaseUrl: 'https://openrouter.ai/api/v1',
    ollamaBaseUrl: 'http://127.0.0.1:11434/api',
    defaultModel: 'anthropic/claude-3-5-sonnet',
    openrouterApiKeyEncrypted: '',
    chatSessions: [],
    currentSessionId: '',
  },
})

export const storeService = {
  getApiKey(): string {
    const encrypted = store.get('openrouterApiKeyEncrypted')
    if (!encrypted) return ''
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      }
      // Fallback: stored as plain text (dev machines without keychain)
      return Buffer.from(encrypted, 'base64').toString('utf-8')
    } catch {
      return ''
    }
  },

  setApiKey(apiKey: string): void {
    if (!apiKey) {
      store.set('openrouterApiKeyEncrypted', '')
      return
    }
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(apiKey).toString('base64')
      store.set('openrouterApiKeyEncrypted', encrypted)
    } else {
      // Fallback: base64 encode (not secure, only for dev environments)
      store.set('openrouterApiKeyEncrypted', Buffer.from(apiKey).toString('base64'))
    }
  },

  getSettings(): AppSettings {
    return {
      llmProvider: store.get('llmProvider'),
      openrouterApiKey: this.getApiKey(),
      openrouterBaseUrl: store.get('openrouterBaseUrl'),
      ollamaBaseUrl: store.get('ollamaBaseUrl'),
      defaultModel: store.get('defaultModel'),
    }
  },

  setSettings(partial: Partial<AppSettings>): void {
    if (partial.openrouterApiKey !== undefined) {
      this.setApiKey(partial.openrouterApiKey)
    }
    if (partial.openrouterBaseUrl !== undefined) {
      store.set('openrouterBaseUrl', partial.openrouterBaseUrl)
    }
    if (partial.ollamaBaseUrl !== undefined) {
      store.set('ollamaBaseUrl', partial.ollamaBaseUrl)
    }
    if (partial.llmProvider !== undefined) {
      store.set('llmProvider', partial.llmProvider)
    }
    if (partial.defaultModel !== undefined) {
      store.set('defaultModel', partial.defaultModel)
    }
  },

  // Chat Sessions
  getAllSessions(): ChatSession[] {
    return store.get('chatSessions') || []
  },

  createSession(title: string): ChatSession {
    const session: ChatSession = {
      id: randomUUID(),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const sessions = this.getAllSessions()
    sessions.push(session)
    store.set('chatSessions', sessions)
    store.set('currentSessionId', session.id)
    return session
  },

  getSession(id: string): ChatSession | null {
    const sessions = this.getAllSessions()
    return sessions.find((s) => s.id === id) || null
  },

  saveSession(session: ChatSession): void {
    const sessions = this.getAllSessions()
    const index = sessions.findIndex((s) => s.id === session.id)
    if (index >= 0) {
      sessions[index] = { ...session, updatedAt: Date.now() }
    } else {
      sessions.push({ ...session, createdAt: Date.now(), updatedAt: Date.now() })
    }
    store.set('chatSessions', sessions)
    store.set('currentSessionId', session.id)
  },

  deleteSession(id: string): void {
    const sessions = this.getAllSessions().filter((s) => s.id !== id)
    store.set('chatSessions', sessions)
    if (store.get('currentSessionId') === id) {
      store.set('currentSessionId', sessions[0]?.id || '')
    }
  },

  getCurrentSessionId(): string {
    return store.get('currentSessionId') || ''
  },

  setCurrentSessionId(id: string): void {
    store.set('currentSessionId', id)
  },
}
