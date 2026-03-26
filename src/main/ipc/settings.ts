import { ipcMain } from 'electron'
import { storeService } from '../services/store'
import { IPC } from '../../shared/ipc-channels'
import type { AppSettings } from '../../shared/types'

export function setupSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => {
    const settings = storeService.getSettings()
    // Mask API key before sending to renderer (show only last 4 chars)
    return {
      ...settings,
      openrouterApiKey: settings.openrouterApiKey
        ? '••••••••' + settings.openrouterApiKey.slice(-4)
        : '',
      _hasApiKey: settings.openrouterApiKey.length > 0,
    }
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_event, partial: Partial<AppSettings>) => {
    // Only update API key if it was actually changed (not the masked value)
    const toUpdate: Partial<AppSettings> = { ...partial }
    if (partial.openrouterApiKey?.startsWith('••••••••')) {
      delete toUpdate.openrouterApiKey
    }

    storeService.setSettings(toUpdate)

    return { success: true }
  })
}
