import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupChatHandlers } from './ipc/chat'
import { setupSettingsHandlers } from './ipc/settings'
import { waapiService } from './services/waapi'
import { storeService } from './services/store'
import { IPC } from '../shared/ipc-channels'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.uni-audio-agent')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  // Register IPC handlers
  setupChatHandlers()
  setupSettingsHandlers()

  // WAAPI status → renderer
  waapiService.setStatusCallback((status) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.WAAPI_STATUS, status)
    }
  })

  // Manual reconnect from renderer
  ipcMain.on(IPC.WAAPI_RECONNECT, () => {
    const settings = storeService.getSettings()
    waapiService.setUrl(settings.waapiUrl)
    waapiService.connect()
  })

  // Start WAAPI connection with stored URL
  const settings = storeService.getSettings()
  waapiService.setUrl(settings.waapiUrl)
  waapiService.connect()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  waapiService.disconnect()
  if (process.platform !== 'darwin') app.quit()
})
