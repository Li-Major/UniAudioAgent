import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, ChatMessageStatus } from '@shared/types'

interface Props {
  messages: ChatMessage[]
  isLoading: boolean
}

function formatToolPayload(value: unknown): string {
  if (value === undefined) {
    return '暂无'
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ToolCallDetails({
  toolName,
  status,
  args,
  result,
}: {
  toolName: string
  status: string
  args: Record<string, unknown>
  result?: unknown
}): JSX.Element {
  const isCalling = status === 'calling'

  return (
    <details className="mt-2 rounded-xl border border-surface-600/80 bg-surface-800/70 overflow-hidden">
      <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-3 hover:bg-surface-700/60 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-mono shrink-0 ${
              isCalling
                ? 'bg-yellow-900/50 text-yellow-400 animate-pulse'
                : 'bg-teal-900/40 text-teal-400'
            }`}
          >
            {isCalling ? '⟳ 执行中' : '✓ 已完成'}
          </span>
          <span className="text-sm text-gray-200 font-mono truncate">{toolName}</span>
        </div>
        <span className="text-gray-500 text-xs">展开详情</span>
      </summary>

      <div className="border-t border-surface-600/80 px-3 py-3 space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Status</div>
          <div className="text-sm text-gray-200">{status}</div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Arguments</div>
          <pre className="text-xs leading-5 whitespace-pre-wrap break-words rounded-lg bg-surface-900/90 border border-surface-600 px-3 py-2 text-gray-300 overflow-x-auto selectable">
            {formatToolPayload(args)}
          </pre>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Result</div>
          <pre className="text-xs leading-5 whitespace-pre-wrap break-words rounded-lg bg-surface-900/90 border border-surface-600 px-3 py-2 text-gray-300 overflow-x-auto selectable">
            {formatToolPayload(result)}
          </pre>
        </div>
      </div>
    </details>
  )
}

function getStatusMeta(status: ChatMessageStatus | undefined, role: ChatMessage['role']): {
  label: string
  className: string
} {
  if (role === 'user') {
    return {
      label: '已发送',
      className: 'text-white/70',
    }
  }

  switch (status) {
    case 'responding':
      return {
        label: 'LLM 响应中',
        className: 'text-yellow-400',
      }
    case 'tool-calling':
      return {
        label: '调用工具中',
        className: 'text-cyan-400',
      }
    case 'completed-tools':
      return {
        label: '已完成（仅工具）',
        className: 'text-teal-300',
      }
    case 'error':
      return {
        label: '响应出错',
        className: 'text-rose-400',
      }
    case 'completed':
      return {
        label: '已完成',
        className: 'text-teal-300',
      }
    default:
      return {
        label: '已完成',
        className: 'text-teal-300',
      }
  }
}

function MessageStatusTag({ message }: { message: ChatMessage }): JSX.Element {
  const meta = getStatusMeta(message.status, message.role)

  return (
    <div className={`mt-2 text-[11px] leading-none text-right ${meta.className}`}>
      {meta.label}
    </div>
  )
}

function MessageBubble({ message, showThinking }: { message: ChatMessage; showThinking: boolean }): JSX.Element {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-teal-700 flex items-center justify-center text-xs font-bold shrink-0 mr-2 mt-0.5">
          AI
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-teal-700 text-white rounded-tr-sm'
            : 'bg-surface-700 text-gray-200 rounded-tl-sm'
        }`}
      >
        {/* Tool calls */}
        {(message.toolCalls ?? []).length > 0 && (
          <div className="mb-3">
            <div className="space-y-2">
              {message.toolCalls!.map((tc, i) => (
                <ToolCallDetails
                  key={`${tc.toolName}-${i}`}
                  toolName={tc.toolName}
                  status={tc.status}
                  args={tc.args}
                  result={tc.result}
                />
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words selectable leading-relaxed">{message.content}</p>
        ) : (
          <div className="prose-chat selectable">
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            ) : showThinking ? (
              <span className="text-gray-500 text-sm italic">思考中…</span>
            ) : (
              <span className="text-gray-500 text-sm italic">未返回文本结果（可能仅执行了工具调用）</span>
            )}
          </div>
        )}

        <MessageStatusTag message={message} />
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 ml-2 mt-0.5">
          我
        </div>
      )}
    </div>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="text-4xl mb-4">🎵</div>
      <h2 className="text-gray-300 font-semibold text-lg mb-2">UniAudioAgent</h2>
      <p className="text-gray-500 text-sm max-w-sm">
        通过自然语言与各类音频工具交互。<br/>试试问<br/>"查看当前Wwise项目信息"<br/>或<br/>"搜索所有名称包含 Footstep 的 Wwise 对象"
      </p>
    </div>
  )
}

export default function MessageList({ messages, isLoading }: Props): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((m, idx) => (
        <MessageBubble
          key={m.id}
          message={m}
          showThinking={
            isLoading && idx === messages.length - 1 && m.role === 'assistant' && m.content.length === 0
          }
        />
      ))}
      {isLoading && messages[messages.length - 1]?.role === 'assistant' && (
        <div /> // handled inside the last message bubble
      )}
      <div ref={bottomRef} />
    </div>
  )
}
