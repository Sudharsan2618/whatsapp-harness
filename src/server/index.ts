import { env } from '../config/env'
import { TenantRepository } from '../control/tenantRepository'
import { pool } from '../db/pool'
import { redis } from '../db/redis'
import { ModelAgent } from '../intelligence/modelAgent'
import { MessagePipeline } from '../orchestration/pipeline'
import { logger } from '../utils/logger'
import { installProcessGuards } from '../utils/resilience'
import { createApp } from './app'
import { ManagerRegistry } from './managerRegistry'

const PORT = Number(process.env.PORT ?? 8787)
// Renew leases well before the 5-minute expiry so ownership never lapses.
const RECONCILE_MS = 120_000

async function main(): Promise<void> {
  installProcessGuards(logger)
  await pool.query('select 1')
  await redis.ping()

  const tenants = new TenantRepository(pool)
  const pipeline = new MessagePipeline({ pool, tenants, agent: new ModelAgent(pool), logger })
  const registry = new ManagerRegistry(pool, logger, pipeline)

  // Only connect numbers this worker holds a lease on, so two processes never
  // open a socket for the same WhatsApp account. Runs on boot and on a timer.
  async function reconcile(): Promise<void> {
    try {
      const owned = await tenants.claimNumbers(env.WORKER_ID, env.MAX_SESSIONS_PER_WORKER)
      const ownedIds = new Set(owned.map((n) => n.id))
      for (const number of owned) await registry.ensure(number, false)
      for (const id of registry.runningIds()) {
        if (!ownedIds.has(id)) await registry.stop(id)
      }
    } catch (error) {
      logger.error({ error }, 'reconcile failed')
    }
  }
  await reconcile()
  const reconcileTimer = setInterval(reconcile, RECONCILE_MS)

  const app = createApp({ pool, logger, tenants, registry })
  const server = app.listen(PORT, () => {
    logger.info({ url: `http://localhost:${PORT}`, worker: env.WORKER_ID }, 'control plane listening')
  })

  const shutdown = async () => {
    logger.info('shutting down')
    clearInterval(reconcileTimer)
    server.close()
    await registry.stopAll()
    // Release leases so a replacement instance can take over without waiting for expiry.
    await tenants.releaseNumbers(env.WORKER_ID).catch(() => {})
    await pool.end()
    redis.disconnect()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  logger.error({ error }, 'control plane startup failed')
  process.exitCode = 1
})
