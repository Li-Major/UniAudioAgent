/**
 * Lightweight WAMP v2 client over WebSocket.
 * Implements only the subset needed for Wwise WAAPI:
 *   HELLO / WELCOME / ABORT / CALL / RESULT / ERROR
 *
 * Does NOT depend on `waapi-client` (8 years unmaintained).
 * Uses `ws` for Node.js WebSocket support.
 */

import WebSocket from 'ws'
import type { WaapiStatus } from '../../shared/types'

// WAMP message type IDs
const TYPE_HELLO = 1
const TYPE_WELCOME = 2
const TYPE_ABORT = 3
const TYPE_CALL = 48
const TYPE_RESULT = 50
const TYPE_ERROR = 8

// SSRF guard: only allow loopback addresses
const ALLOWED_HOSTS = /^(localhost|127\.0\.0\.1|::1)$/

function assertLocalUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (!ALLOWED_HOSTS.test(parsed.hostname)) {
      throw new Error(`WAAPI URL must be a local address (got: ${parsed.hostname})`)
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Invalid WAAPI URL: ${url}`)
    }
    throw err
  }
}

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

class WaapiService {
  private ws: WebSocket | null = null
  private sessionId: number | null = null
  private requestCounter = 0
  private pending = new Map<number, PendingCall>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 2000
  private url = 'ws://127.0.0.1:8080/waapi'
  private shouldConnect = false
  private statusCallback: ((status: WaapiStatus) => void) | null = null

  setUrl(url: string): void {
    assertLocalUrl(url)
    this.url = url
  }

  setStatusCallback(cb: (status: WaapiStatus) => void): void {
    this.statusCallback = cb
  }

  get isConnected(): boolean {
    return this.sessionId !== null
  }

  connect(): void {
    this.shouldConnect = true
    this.reconnectDelay = 2000
    this.doConnect()
  }

  disconnect(): void {
    this.shouldConnect = false
    this.cleanup()
  }

  async call(uri: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.ws || this.sessionId === null) {
      throw new Error('WAAPI: not connected to Wwise')
    }

    const requestId = ++this.requestCounter
    const message = [TYPE_CALL, requestId, {}, uri, [args]]

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`WAAPI call timeout: ${uri}`))
      }, 15_000)

      this.pending.set(requestId, { resolve, reject, timer })

      try {
        this.ws!.send(JSON.stringify(message))
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(requestId)
        reject(err as Error)
      }
    })
  }

  private doConnect(): void {
    if (this.ws) this.cleanup(false)

    try {
      this.ws = new WebSocket(this.url, ['wamp.2.json'])

      this.ws.on('open', () => {
        const hello = [TYPE_HELLO, 'realm1', { roles: { caller: {} } }]
        this.ws!.send(JSON.stringify(hello))
      })

      this.ws.on('message', (data: Buffer | string) => {
        this.handleMessage(typeof data === 'string' ? data : data.toString())
      })

      this.ws.on('close', () => {
        const wasConnected = this.sessionId !== null
        this.sessionId = null
        this.rejectAllPending('WAAPI connection closed')
        if (wasConnected) this.notifyStatus(false)
        if (this.shouldConnect) this.scheduleReconnect()
      })

      this.ws.on('error', (err) => {
        // 'error' is always followed by 'close'; log only
        console.error('[WAAPI] WebSocket error:', err.message)
        if (this.sessionId === null) {
          // Never connected — notify immediately so UI shows error
          this.notifyStatus(false, err.message)
        }
      })
    } catch (err) {
      this.notifyStatus(false, String(err))
      if (this.shouldConnect) this.scheduleReconnect()
    }
  }

  private handleMessage(raw: string): void {
    let msg: unknown[]
    try {
      msg = JSON.parse(raw) as unknown[]
    } catch {
      return
    }

    const type = msg[0] as number

    if (type === TYPE_WELCOME) {
      this.sessionId = msg[1] as number
      this.reconnectDelay = 2000 // reset on successful connect
      this.notifyStatus(true)
    } else if (type === TYPE_ABORT) {
      const reason = (msg[2] as string) || 'Aborted by Wwise'
      this.sessionId = null
      this.notifyStatus(false, reason)
    } else if (type === TYPE_RESULT) {
      const requestId = msg[1] as number
      const entry = this.pending.get(requestId)
      if (entry) {
        clearTimeout(entry.timer)
        this.pending.delete(requestId)
        const resultArgs = msg[3] as unknown[] | undefined
        entry.resolve(resultArgs?.[0] ?? null)
      }
    } else if (type === TYPE_ERROR) {
      const requestId = msg[2] as number
      const entry = this.pending.get(requestId)
      if (entry) {
        clearTimeout(entry.timer)
        this.pending.delete(requestId)
        const errorUri = msg[4] as string
        const errorArgs = msg[5] as unknown[] | undefined
        const detail = errorArgs ? JSON.stringify(errorArgs) : ''
        entry.reject(new Error(`${errorUri}${detail ? ': ' + detail : ''}`))
      }
    }
  }

  private cleanup(notify = true): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.terminate()
      this.ws = null
    }
    if (this.sessionId !== null) {
      this.sessionId = null
      if (notify) this.notifyStatus(false)
    }
    this.rejectAllPending('Disconnected')
  }

  private rejectAllPending(reason: string): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error(reason))
    }
    this.pending.clear()
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldConnect) this.doConnect()
    }, this.reconnectDelay)
    // Exponential backoff, capped at 30 s
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
  }

  private notifyStatus(connected: boolean, error?: string): void {
    this.statusCallback?.({ connected, url: this.url, error })
  }
}

export const waapiService = new WaapiService()
