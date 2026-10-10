import type { Pool } from 'pg'
import type { Logger } from 'pino'
import { env } from '../config/env'
import { MessagePipeline } from '../orchestration/pipeline'
import { SafeSender } from '../orchestration/safeSender'
import { ConnectionManager } from '../transport/connectionManager'
import type { TenantRepository } from './tenantRepository'

export interface WorkerRuntimeDeps {
  pool: Pool
  logger: Logger
  tenants: TenantRepository
  pipeline: MessagePipeline
}

/**
 * Hosts every number leased to this worker: one ConnectionManager and one
 * SafeSender per number, wired to the shared pipeline.
 */
export class WorkerRuntime {
  private readonly managers = new Map<string, ConnectionManager>()

  constructor(private readonly deps: WorkerRuntimeDeps) {}

  async start(): Promise<void> {
    const numbers = await this.deps.tenants.claimNumbers(env.WORKER_ID, env.MAX_SESSIONS_PER_WORKER)
    this.deps.logger.info({ count: numbers.length, worker: env.WORKER_ID }, 'starting leased numbers')

    for (const number of numbers) {
      const manager = new ConnectionManager({
        pool: this.deps.pool,
        logger: this.deps.logger,
        number,
      })
      const sender = new SafeSender(
        (jid, content) => manager.rawSend(jid, content),
        this.deps.logger,
      )
      manager.onInbound = (message) => this.deps.pipeline.handle(number, message, sender)
      this.managers.set(number.id, manager)
      await manager.start()
    }
  }

  async stop(): Promise<void> {
    for (const manager of this.managers.values()) await manager.stop()
    this.managers.clear()
  }
}
