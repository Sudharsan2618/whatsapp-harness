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

async function main(): Promise<void> {
  installProcessGuards(logger)
  await pool.query('select 1')
  await redis.ping()

  const tenants = new TenantRepository(pool)
  const pipeline = new MessagePipeline({ pool, tenants, agent: new ModelAgent(pool), logger })
  const registry = new ManagerRegistry(pool, logger, pipeline)

  await registry.startLinked(await tenants.listLinkedNumbers())

  const app = createApp({ pool, logger, tenants, registry })
  const server = app.listen(PORT, () => {
    logger.info({ url: `http://localhost:${PORT}` }, 'control plane listening')
  })

  const shutdown = async () => {
    logger.info('shutting down')
    server.close()
    await registry.stopAll()
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
