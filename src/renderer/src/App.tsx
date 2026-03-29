import { useState } from 'react'
import ChatWindow from './components/ChatWindow'
import ChatSessionList from './components/ChatSessionList'
import SettingsPanel from './components/SettingsPanel'
import { ChatProvider, useChat } from './context/ChatContext'

function AppInner(): JSX.Element {
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsRefreshKey, setSettingsRefreshKey] = useState(0)

  const { currentSession, sessions, initError, createNewSession, switchSession, deleteSession, updateSessionTitle } = useChat()

  return (
    <div className="flex flex-col h-screen bg-surface-900 text-gray-100 overflow-hidden">
      {/* Title bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-surface-800 border-b border-gray-700/50 select-none shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            title="切换侧边栏"
            aria-label="切换侧边栏"
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
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
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

      {/* Main layout */}
      <main className="flex flex-1 overflow-hidden">
        {/* Init error banner */}
        {initError && (
          <div className="absolute top-10 left-0 right-0 z-50 mx-4 mt-2 p-3 bg-red-900/80 border border-red-500 rounded text-red-200 text-xs">
            ⚠️ IPC 初始化失败（请查看 DevTools 控制台）: {initError}
          </div>
        )}
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-64 min-w-64 border-r border-gray-700/50 flex flex-col shrink-0">
            <ChatSessionList
              sessions={sessions}
              currentSessionId={currentSession?.id}
              onSessionSelect={switchSession}
              onSessionDelete={deleteSession}
              onNewSession={createNewSession}
              onSessionRename={updateSessionTitle}
            />
          </div>
        )}

        {/* Chat window */}
        <div className="flex-1 overflow-hidden">
          <ChatWindow settingsRefreshKey={settingsRefreshKey} />
        </div>
      </main>

      {/* Settings panel overlay */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSaved={() => setSettingsRefreshKey((prev) => prev + 1)}
        />
      )}
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <ChatProvider>
      <AppInner />
    </ChatProvider>
  )
}
