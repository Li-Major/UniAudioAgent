import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { AppSettings } from '../../shared/types'

interface StoreSchema {
  llmProvider: 'openrouter' | 'ollama'
  ollamaBaseUrl: string
  defaultModel: string
  openrouterApiKeyEncrypted: string
}

const store = new Store<StoreSchema>({
  defaults: {
    llmProvider: 'openrouter',
    ollamaBaseUrl: 'http://127.0.0.1:11434/api',
    defaultModel: 'anthropic/claude-3-5-sonnet',
    openrouterApiKeyEncrypted: '',
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
      ollamaBaseUrl: store.get('ollamaBaseUrl'),
      defaultModel: store.get('defaultModel'),
    }
  },

  setSettings(partial: Partial<AppSettings>): void {
    if (partial.openrouterApiKey !== undefined) {
      this.setApiKey(partial.openrouterApiKey)
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
}
