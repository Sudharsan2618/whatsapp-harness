import { Pool, type PoolClient } from 'pg'
import { env } from '../config/env'
import { logger } from '../utils/logger'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  keepAlive: true,
})

// Managed Postgres drops idle connections; the pool emits 'error' for those.
// Without a listener node-pg crashes the process, so log and continue — the pool
// replaces the dead connection on the next query.
pool.on('error', (error) => {
  logger.warn({ error }, 'idle postgres client error')
})

/**
 * Run a unit of work scoped to one tenant. Sets app.current_tenant for the
 * transaction so row-level security (sql/009_rls.sql) confines every query.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query("select set_config('app.current_tenant', $1, true)", [tenantId])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
