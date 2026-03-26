import MessageList from './MessageList'
import InputBar from './InputBar'
import { useChat } from '../hooks/useChat'

export default function ChatWindow(): JSX.Element {
  const { messages, isLoading, sendMessage, clearMessages } = useChat()

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-gray-700/30 shrink-0">
        <button
          onClick={clearMessages}
          disabled={messages.length === 0 || isLoading}
          className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          清空对话
        </button>
      </div>

      {/* Messages */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Input */}
      <InputBar onSend={sendMessage} isLoading={isLoading} />
    </div>
  )
}

