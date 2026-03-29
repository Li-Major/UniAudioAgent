import { useState, useRef, useCallback, useEffect } from 'react'
import { IPC } from '@shared/ipc-channels'
import type { AppSettings } from '@shared/types'

interface Props {
  onSend: (text: string) => void
  isLoading: boolean
  settingsRefreshKey?: number
}

export default function InputBar({ onSend, isLoading, settingsRefreshKey = 0 }: Props): JSX.Element {
  const [input, setInput] = useState('')
  const [providerLabel, setProviderLabel] = useState('OpenRouter')
  const [currentModel, setCurrentModel] = useState('anthropic/claude-3-5-sonnet')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let isMounted = true

    window.api
      .invoke<AppSettings & { _hasApiKey?: boolean }>(IPC.SETTINGS_GET)
      .then((settings) => {
        if (!isMounted) return
        const label = settings.llmProvider === 'ollama' ? 'Ollama' : 'OpenRouter'
        setProviderLabel(label)
        setCurrentModel(settings.defaultModel)
      })
      .catch((err) => {
        console.error('[InputBar] load settings failed:', err)
      })

    return () => {
      isMounted = false
    }
  }, [settingsRefreshKey])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    onSend(text)
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, isLoading, onSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div className="shrink-0 border-t border-gray-700/50 bg-surface-800 px-3 py-3">
      <div className="flex items-end gap-2 bg-surface-700 rounded-xl px-3 py-2 border border-gray-700/50 focus-within:border-teal-600/50 transition-colors">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? '等待回复…' : '输入消息（Enter 发送，Shift+Enter 换行）'}
          disabled={isLoading}
          rows={1}
          className="flex-1 bg-transparent text-gray-100 placeholder-gray-600 resize-none outline-none text-sm leading-relaxed selectable min-h-[24px] max-h-[160px] disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="shrink-0 w-8 h-8 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors mb-0.5"
          aria-label="发送"
        >
          {isLoading ? (
            <svg
              className="animate-spin w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          )}
        </button>
      </div>
      <p className="text-xs text-gray-700 mt-1.5 px-1">
        当前模型：{providerLabel} / {currentModel}
      </p>
    </div>
  )
}
