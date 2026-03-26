import { IPC } from '@shared/ipc-channels'
import type { WaapiStatus } from '@shared/types'

interface Props {
  waapiStatus: WaapiStatus
}

export default function StatusBar({ waapiStatus }: Props): JSX.Element {
  const handleReconnect = (): void => {
    window.api.send(IPC.WAAPI_RECONNECT)
  }

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 bg-surface-800 border-t border-gray-700/50 text-xs select-none">
      {/* WAAPI status indicator */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            waapiStatus.connected ? 'bg-teal-400' : 'bg-gray-600'
          }`}
        />
        <span className={waapiStatus.connected ? 'text-teal-400' : 'text-gray-600'}>
          Wwise {waapiStatus.connected ? '已连接' : '未连接'}
        </span>
      </div>

      {!waapiStatus.connected && (
        <>
          <span className="text-gray-700">·</span>
          <button
            onClick={handleReconnect}
            className="text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
          >
            重试连接
          </button>
        </>
      )}

      {waapiStatus.error && (
        <>
          <span className="text-gray-700">·</span>
          <span className="text-red-500/70 truncate max-w-[240px]" title={waapiStatus.error}>
            {waapiStatus.error}
          </span>
        </>
      )}

      <span className="text-gray-700 ml-auto font-mono">{waapiStatus.url}</span>
    </div>
  )
}
