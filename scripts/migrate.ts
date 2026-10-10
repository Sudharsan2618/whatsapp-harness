import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pool } from '../src/db/pool'
import { logger } from '../src/utils/logger'

const dir = join(process.cwd(), 'sql')

// Postgres "already exists" classes — hit when the schema was applied before this
// script tracked migrations (e.g. SQL run by hand). We baseline such files rather
// than fail, so the same command is safe on a fresh DB and an existing one.
const DUPLICATE_CODES = new Set([
  '42P07', // duplicate_table
  '42710', // duplicate_object (type, extension, policy, trigger)
  '42701', // duplicate_column
  '42P06', // duplicate_schema
  '42723', // duplicate_function
  '42P16', // invalid_table_definition (re-add constraint)
  '42P11', // duplicate index name variants
])

async function run(): Promise<void> {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  await pool.query(
    `create table if not exists schema_migrations (
       filename text primary key,
       applied_at timestamptz not null default now()
     )`,
  )
  const { rows } = await pool.query<{ filename: string }>('select filename from schema_migrations')
  const applied = new Set(rows.map((r) => r.filename))

  let ran = 0
  let baselined = 0
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into schema_migrations (filename) values ($1)', [file])
      await client.query('commit')
      logger.info({ file }, 'migration applied')
      ran += 1
    } catch (error) {
      await client.query('rollback')
      const code = (error as { code?: string }).code
      if (code && DUPLICATE_CODES.has(code)) {
        await client.query('insert into schema_migrations (filename) values ($1) on conflict do nothing', [file])
        logger.warn({ file }, 'objects already present — baselined (marked applied without running)')
        baselined += 1
      } else {
        logger.error({ file, code }, 'migration failed')
        throw error
      }
    } finally {
      client.release()
    }
  }

  logger.info({ total: files.length, applied: ran, baselined }, 'migrations complete')
}

run()
  .catch((error) => {
    logger.error({ error }, 'migration run failed')
    process.exitCode = 1
  })
  .finally(() => pool.end())
