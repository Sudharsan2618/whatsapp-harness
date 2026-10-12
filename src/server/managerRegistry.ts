import type { Pool } from 'pg'
import type { Logger } from 'pino'
import type { TenantNumber } from '../domain/types'
import type { MessagePipeline } from '../orchestration/pipeline'
import { SafeSender } from '../orchestration/safeSender'
import { clearDbAuthState } from '../transport/authStore'
import { ConnectionManager } from '../transport/connectionManager'

interface Pairing {
  code?: string
  qr?: string
}

/**
 * Holds one ConnectionManager per number inside the control-plane process:
 * serves already-linked numbers and drives pairing for new ones. One manager per
 * number — never two sockets for the same number.
 */
export class ManagerRegistry {
  private readonly managers = new Map<string, { manager: ConnectionManager; tenantId: string; pairing: boolean }>()
  private readonly pairing = new Map<string, Pairing>()

  constructor(
    private readonly pool: Pool,
    private readonly logger: Logger,
    private readonly pipeline: MessagePipeline,
  ) {}

  async startLinked(numbers: TenantNumber[]): Promise<void> {
    for (const number of numbers) await this.ensure(number, false)
  }

  /**
   * Linked numbers this process currently serves (live, not mid-pairing). Used by
   * the reconcile sweep to drop sessions whose lease moved to another worker,
   * without ever interrupting a pairing in progress.
   */
  runningIds(): string[] {
    return [...this.managers.entries()]
      .filter(([, e]) => !e.manager.isStopped && !e.pairing)
      .map(([id]) => id)
  }

  /** Stop and drop a number's manager (does not log it out of WhatsApp). */
  async stop(numberId: string): Promise<void> {
    const entry = this.managers.get(numberId)
    if (entry) {
      await entry.manager.stop()
      this.managers.delete(numberId)
    }
    this.pairing.delete(numberId)
  }

  async ensure(number: TenantNumber, usePairingCode: boolean): Promise<void> {
    const existing = this.managers.get(number.id)
    if (existing) {
      // Reuse only a live manager for the same tenant; recreate a stopped or
      // reassigned one (a logged-out manager must not block a fresh re-link).
      if (existing.tenantId === number.tenantId && !existing.manager.isStopped) return
      await existing.manager.stop()
      this.managers.delete(number.id)
    }
    const manager = new ConnectionManager({
      pool: this.pool,
      logger: this.logger,
      number,
      usePairingCode,
      onPairingCode: (code) => this.pairing.set(number.id, { ...this.pairing.get(number.id), code }),
      onQr: (qr) => this.pairing.set(number.id, { ...this.pairing.get(number.id), qr }),
      onLoggedOut: () => {
        this.managers.delete(number.id)
        this.pairing.delete(number.id)
        clearDbAuthState(this.pool, number.id).catch((error) =>
          this.logger.warn({ error, number: number.id }, 'failed to clear auth after logout'),
        )
      },
      // Once linked, it is a normal session, not a pairing in progress.
      onLinked: () => {
        const entry = this.managers.get(number.id)
        if (entry) entry.pairing = false
        this.pairing.delete(number.id)
      },
    })
    const sender = new SafeSender((jid, content) => manager.rawSend(jid, content), this.logger)
    manager.onInbound = (message) => this.pipeline.handle(number, message, sender)
    this.managers.set(number.id, { manager, tenantId: number.tenantId, pairing: usePairingCode })
    await manager.start()
  }

  getPairing(numberId: string): Pairing {
    return this.pairing.get(numberId) ?? {}
  }

  /** The live ConnectionManager for a number, if it is running in this process. */
  manager(numberId: string): ConnectionManager | undefined {
    return this.managers.get(numberId)?.manager
  }

  /** Log the number out of WhatsApp and drop its manager. */
  async disconnect(numberId: string): Promise<void> {
    const entry = this.managers.get(numberId)
    if (entry) {
      await entry.manager.logout()
      this.managers.delete(numberId)
    }
    this.pairing.delete(numberId)
  }

  async stopAll(): Promise<void> {
    for (const { manager } of this.managers.values()) await manager.stop()
    this.managers.clear()
  }
}
