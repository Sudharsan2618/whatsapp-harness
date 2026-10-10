import type { AnyMessageContent } from '@whiskeysockets/baileys'
import type { Logger } from 'pino'

export interface SafeSenderOptions {
  minDelayMs?: number
  maxDelayMs?: number
  dailyCap?: number
}

type SendFn = (jid: string, content: AnyMessageContent) => Promise<void>

interface QueueItem {
  jid: string
  content: AnyMessageContent
  resolve: () => void
  reject: (error: unknown) => void
}

/**
 * Serializes outbound messages per number and paces them with random jitter,
 * with an optional daily cap. This is the ban-avoidance seam: pacing and warm-up
 * limits live here rather than at the call sites.
 */
export class SafeSender {
  private readonly queue: QueueItem[] = []
  private running = false
  private sentToday = 0
  private day = new Date().toISOString().slice(0, 10)

  constructor(
    private readonly send: SendFn,
    private readonly logger: Logger,
    private readonly options: SafeSenderOptions = {},
  ) {}

  enqueue(jid: string, content: AnyMessageContent): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ jid, content, resolve, reject })
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0) {
        this.rolloverDay()
        if (this.options.dailyCap && this.sentToday >= this.options.dailyCap) {
          this.logger.warn({ cap: this.options.dailyCap }, 'daily send cap reached; pausing queue')
          break
        }
        const item = this.queue.shift()!
        await this.pause()
        try {
          await this.send(item.jid, item.content)
          this.sentToday += 1
          item.resolve()
        } catch (error) {
          item.reject(error)
        }
      }
    } finally {
      this.running = false
    }
  }

  private rolloverDay(): void {
    const today = new Date().toISOString().slice(0, 10)
    if (today !== this.day) {
      this.day = today
      this.sentToday = 0
    }
  }

  private pause(): Promise<void> {
    const min = this.options.minDelayMs ?? 1_200
    const max = this.options.maxDelayMs ?? 4_000
    const ms = min + Math.random() * Math.max(0, max - min)
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
