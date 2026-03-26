import { useState, useEffect } from 'react'
import { IPC } from '@shared/ipc-channels'
import type { WaapiStatus } from '@shared/types'
import ChatWindow from './components/ChatWindow'
import SettingsPanel from './components/SettingsPanel'
import StatusBar from './components/StatusBar'

export default function App(): JSX.Element {
  const [showSettings, setShowSettings] = useState(false)
  const [waapiStatus, setWaapiStatus] = useState<WaapiStatus>({
    connected: false,
    url: 'ws://127.0.0.1:8080/waapi',
  })

  useEffect(() => {
    const removeListener = window.api.on(IPC.WAAPI_STATUS, (status) => {
      setWaapiStatus(status as WaapiStatus)
    })
    return removeListener
  }, [])

  return (
    <div className="flex flex-col h-screen bg-surface-900 text-gray-100 overflow-hidden">
      {/* Title bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-surface-800 border-b border-gray-700/50 select-none shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-teal-400 font-bold text-sm tracking-wide">UniAudioAgent</span>
          <span className="text-gray-600 text-xs">Wwise AI Assistant</span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          title="设置"
          aria-label="打开设置"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </header>

      {/* Main chat area */}
      <main className="flex-1 overflow-hidden">
        <ChatWindow />
      </main>

      {/* Status bar */}
      <StatusBar waapiStatus={waapiStatus} />

      {/* Settings panel overlay */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
