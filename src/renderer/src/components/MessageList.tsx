import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@shared/types'

interface Props {
  messages: ChatMessage[]
  isLoading: boolean
}

function ToolCallBadge({ name, status }: { name: string; status: string }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-mono ${
        status === 'calling'
          ? 'bg-yellow-900/50 text-yellow-400 animate-pulse'
          : 'bg-teal-900/40 text-teal-400'
      }`}
    >
      {status === 'calling' ? '⟳' : '✓'} {name}
    </span>
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
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.toolCalls!.map((tc, i) => (
              <ToolCallBadge key={i} name={tc.toolName} status={tc.status} />
            ))}
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
