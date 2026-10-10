import { TenantRepository } from './control/tenantRepository'
import { WorkerRuntime } from './control/workerRuntime'
import { env } from './config/env'
import { pool } from './db/pool'
import { redis } from './db/redis'
import { ModelAgent } from './intelligence/modelAgent'
import { MessagePipeline } from './orchestration/pipeline'
import { logger } from './utils/logger'
import { installProcessGuards } from './utils/resilience'

async function main(): Promise<void> {
  installProcessGuards(logger)
  await pool.query('select 1')
  await redis.ping()

  const tenants = new TenantRepository(pool)
  const agent = new ModelAgent(pool)
  const pipeline = new MessagePipeline({ pool, tenants, agent, logger })
  const runtime = new WorkerRuntime({ pool, logger, tenants, pipeline })
  await runtime.start()

  logger.info({ worker: env.WORKER_ID }, 'worker runtime started')

  const shutdown = async () => {
    logger.info('shutting down')
    await runtime.stop()
    await pool.end()
    redis.disconnect()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  logger.error({ error }, 'startup failed')
  process.exitCode = 1
})
