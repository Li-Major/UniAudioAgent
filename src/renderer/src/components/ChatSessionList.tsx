import { useState } from 'react'
import type { ChatSession } from '@shared/types'

interface ChatSessionListProps {
  sessions: ChatSession[]
  currentSessionId?: string
  onSessionSelect: (session: ChatSession) => void
  onSessionDelete: (id: string) => void
  onNewSession: () => void
  onSessionRename?: (id: string, newTitle: string) => void
}

export default function ChatSessionList({
  sessions,
  currentSessionId,
  onSessionSelect,
  onSessionDelete,
  onNewSession,
  onSessionRename,
}: ChatSessionListProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const handleRenameStart = (session: ChatSession) => {
    setEditingId(session.id)
    setEditingTitle(session.title)
  }

  const handleRenameSave = (id: string) => {
    if (editingTitle.trim() && onSessionRename) {
      onSessionRename(id, editingTitle.trim())
    }
    setEditingId(null)
  }

  const handleRenameCancel = () => {
    setEditingId(null)
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨天'
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-800 border-r border-gray-700/50">
      {/* Header */}
      <div className="p-3 border-b border-gray-700/50 shrink-0">
        <button
          onClick={() => onNewSession()}
          className="w-full px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded text-sm font-medium transition-colors"
        >
          + 新建对话
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            暂无对话
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`group relative px-3 py-2 rounded cursor-pointer transition-colors ${
                  currentSessionId === session.id
                    ? 'bg-teal-600/20 text-teal-400'
                    : 'hover:bg-gray-700/30 text-gray-300'
                }`}
              >
                <div
                  onClick={() => {
                    if (editingId !== session.id) {
                      onSessionSelect(session)
                    }
                  }}
                  className="flex-1 min-w-0"
                >
                  {editingId === session.id ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRenameSave(session.id)
                          } else if (e.key === 'Escape') {
                            handleRenameCancel()
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-gray-700 text-white text-sm px-2 py-1 rounded border border-teal-500 focus:outline-none"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRenameSave(session.id)
                        }}
                        className="text-xs px-2 py-1 bg-teal-600 text-white rounded hover:bg-teal-500"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{session.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(session.updatedAt)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingId !== session.id && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRenameStart(session)
                        }}
                        className="p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-gray-200"
                        title="重命名"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSessionDelete(session.id)
                        }}
                        className="p-1 rounded hover:bg-red-600/20 text-gray-400 hover:text-red-400"
                        title="删除"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
