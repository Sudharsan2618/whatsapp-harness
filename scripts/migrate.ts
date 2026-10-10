import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pool } from '../src/db/pool'
import { logger } from '../src/utils/logger'

const dir = join(process.cwd(), 'sql')

async function run(): Promise<void> {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    logger.info({ file }, 'applying migration')
    await pool.query(readFileSync(join(dir, file), 'utf8'))
  }

  logger.info({ count: files.length }, 'migrations applied')
}

run()
  .catch((error) => {
    logger.error({ error }, 'migration failed')
    process.exitCode = 1
  })
  .finally(() => pool.end())
