import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function isLlmDebugEnabled(): boolean {
  const debugFlags = process.env.UNIAUDIO_DEBUG ?? ''
  return debugFlags === '1' || debugFlags.split(',').some((flag) => flag.trim().toLowerCase() === 'llm')
}

function serializeDebugPayload(value: unknown): string {
  const seen = new WeakSet<object>()

  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === 'string' && currentValue.length > 4000) {
        return `${currentValue.slice(0, 4000)}... [truncated ${currentValue.length - 4000} chars]`
      }

      if (typeof currentValue === 'bigint') {
        return currentValue.toString()
      }

      if (currentValue instanceof Error) {
        return {
          name: currentValue.name,
          message: currentValue.message,
          stack: currentValue.stack,
        }
      }

      if (typeof currentValue === 'object' && currentValue !== null) {
        if (seen.has(currentValue)) {
          return '[Circular]'
        }
        seen.add(currentValue)
      }

      return currentValue
    },
    2,
  )
}

export function logLlmDebug(event: string, payload: unknown): void {
  if (!isLlmDebugEnabled()) {
    return
  }

  const message = `[llm-debug] ${event}\n${serializeDebugPayload(payload)}`

  console.info(message)

  try {
    const logsDir = app.getPath('logs')
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true })
    }

    const logPath = join(logsDir, 'llm-debug.log')
    appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, { encoding: 'utf8' })
  } catch (error) {
    console.error('[llm-debug] failed to write debug log file:', error)
  }
}
