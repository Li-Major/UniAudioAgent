import { useState, useEffect } from 'react'
import { IPC } from '@shared/ipc-channels'
import type { AppSettings } from '@shared/types'

interface Props {
  onClose: () => void
}

const MODELS = [
  { label: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3-5-sonnet' },
  { label: 'Claude 3 Haiku (快速/低价)', value: 'anthropic/claude-3-haiku' },
  { label: 'Claude 3 Opus', value: 'anthropic/claude-3-opus' },
  { label: 'GPT-4o', value: 'openai/gpt-4o' },
  { label: 'GPT-4o mini (快速/低价)', value: 'openai/gpt-4o-mini' },
  { label: 'Gemini Flash 1.5', value: 'google/gemini-flash-1.5' },
  { label: 'DeepSeek V3', value: 'deepseek/deepseek-chat' },
  { label: 'Qwen 2.5 72B', value: 'qwen/qwen-2.5-72b-instruct' },
  { label: 'Llama 3.1 8B (OpenRouter 路由)', value: 'meta-llama/llama-3.1-8b-instruct' },
  { label: 'Llama 3.1 70B (OpenRouter 路由)', value: 'meta-llama/llama-3.1-70b-instruct' },
  { label: 'Llama 3.3 70B (OpenRouter 路由)', value: 'meta-llama/llama-3.3-70b-instruct' },
  { label: 'Mistral Nemo (OpenRouter 路由)', value: 'mistralai/mistral-nemo' },
  { label: 'Qwen 2.5 7B (OpenRouter 路由)', value: 'qwen/qwen-2.5-7b-instruct' },
]

const OLLAMA_MODELS = [
  { label: 'Llama 3.1 8B', value: 'llama3.1:8b' },
  { label: 'Llama 3.2 3B', value: 'llama3.2:3b' },
  { label: 'Qwen 2.5 7B', value: 'qwen2.5:7b' },
  { label: 'Mistral 7B', value: 'mistral:7b' },
  { label: 'DeepSeek R1 7B', value: 'deepseek-r1:7b' },
]

export default function SettingsPanel({ onClose }: Props): JSX.Element {
  const [settings, setSettings] = useState<AppSettings & { _hasApiKey?: boolean }>({
    llmProvider: 'openrouter',
    openrouterApiKey: '',
    ollamaBaseUrl: 'http://127.0.0.1:11434/api',
    defaultModel: 'anthropic/claude-3-5-sonnet',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.invoke<AppSettings & { _hasApiKey?: boolean }>(IPC.SETTINGS_GET).then((s) => {
      setSettings(s)
    })
  }, [])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    await window.api.invoke(IPC.SETTINGS_SET, settings)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-800 border border-gray-700 rounded-2xl w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-gray-100">设置</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="关闭"
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
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6">
          <section>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              LLM Provider
            </label>
            <select
              value={settings.llmProvider}
              onChange={(e) => {
                const llmProvider = e.target.value as AppSettings['llmProvider']
                setSettings((s) => ({
                  ...s,
                  llmProvider,
                  defaultModel:
                    llmProvider === 'ollama' ? 'llama3.1:8b' : 'anthropic/claude-3-5-sonnet',
                }))
              }}
              className="w-full bg-surface-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-teal-600 transition-colors"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama</option>
            </select>
            <p className="text-xs text-gray-600 mt-1">
              OpenRouter 走云端 API，Ollama 连接本地模型服务。
            </p>
          </section>

          {/* OpenRouter API Key */}
          <section className={settings.llmProvider === 'openrouter' ? '' : 'opacity-50'}>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              OpenRouter API Key
            </label>
            {settings._hasApiKey && (
              <p className="text-xs text-teal-500 mb-1.5">✓ 已配置 API Key</p>
            )}
            <input
              type="password"
              value={settings.openrouterApiKey}
              onChange={(e) => setSettings((s) => ({ ...s, openrouterApiKey: e.target.value }))}
              placeholder={settings._hasApiKey ? '输入新 Key 以替换现有配置…' : 'sk-or-…'}
              disabled={settings.llmProvider !== 'openrouter'}
              className="w-full bg-surface-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-teal-600 transition-colors selectable"
            />
            <p className="text-xs text-gray-600 mt-1">
              前往{' '}
              <span className="text-teal-600">openrouter.ai/keys</span> 获取 API Key
            </p>
          </section>

          {/* Default Model */}
          <section>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              默认模型
            </label>
            <select
              value={settings.defaultModel}
              onChange={(e) => setSettings((s) => ({ ...s, defaultModel: e.target.value }))}
              className="w-full bg-surface-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-teal-600 transition-colors"
            >
              {(settings.llmProvider === 'ollama' ? OLLAMA_MODELS : MODELS).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1">
              {settings.llmProvider === 'ollama'
                ? '也可直接输入本地 Ollama 模型名，例如 llama3.1:8b'
                : '也可直接输入任意 OpenRouter 模型 ID，包括 OpenRouter 提供的 Llama、Mistral、Qwen 等开源模型'}
            </p>
            <input
              type="text"
              value={settings.defaultModel}
              onChange={(e) => setSettings((s) => ({ ...s, defaultModel: e.target.value }))}
              placeholder={
                settings.llmProvider === 'ollama'
                  ? '自定义模型名，如 qwen2.5:14b'
                  : '自定义模型 ID，如 meta-llama/llama-3.1-70b-instruct'
              }
              className="w-full mt-1.5 bg-surface-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-teal-600 transition-colors selectable"
            />
          </section>

          {settings.llmProvider === 'ollama' && (
            <section>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Ollama Base URL
              </label>
              <input
                type="text"
                value={settings.ollamaBaseUrl}
                onChange={(e) => setSettings((s) => ({ ...s, ollamaBaseUrl: e.target.value }))}
                placeholder="http://127.0.0.1:11434/api"
                className="w-full bg-surface-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-teal-600 transition-colors selectable font-mono"
              />
              <p className="text-xs text-gray-600 mt-1">
                启动本地 Ollama 服务后使用，通常地址为 http://127.0.0.1:11434/api。
              </p>
            </section>
          )}

          <section>
            <p className="text-xs text-gray-600 leading-5">
              当前应用已移除内置 WAAPI 连接。后续 Wwise 接入将通过 MCP 完成，由 MCP 侧负责发起 WebSocket 连接和工具执行。
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 disabled:bg-teal-800 text-white rounded-lg transition-colors font-medium"
          >
            {saved ? '✓ 已保存' : saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
