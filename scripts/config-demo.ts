import { resolveTenantConfig } from '../src/config/resolver'
import { pool } from '../src/db/pool'

// Shows how the same platform resolves a different bot per vertical pack.
// Usage: npm run demo:config -- clinic
const packKey = process.argv[2] ?? 'clinic'

async function run(): Promise<void> {
  const { rows } = await pool.query(
    `select
       (select config from platform_defaults where id) as platform,
       (select config from vertical_packs where key = $1) as pack`,
    [packKey],
  )
  const row = rows[0]
  if (!row?.pack) throw new Error(`vertical pack not found: ${packKey}`)

  const config = resolveTenantConfig([row.platform, row.pack, {}])
  console.log(`Resolved config for pack "${packKey}":`)
  console.log(JSON.stringify(config, null, 2))
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
