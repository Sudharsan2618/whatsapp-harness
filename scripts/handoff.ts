import { closeHandoff } from '../src/orchestration/handoff'
import { pool } from '../src/db/pool'

// Inspect or resume handoffs.
// Usage:
//   npx tsx scripts/handoff.ts --list
//   npx tsx scripts/handoff.ts --slug kokoexports --chat <jid> --close
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function run(): Promise<void> {
  if (process.argv.includes('--list')) {
    const { rows } = await pool.query(
      `select t.slug, h.chat_jid, h.status, h.reason, h.created_at
       from handoffs h join tenants t on t.id = h.tenant_id
       order by h.created_at desc limit 50`,
    )
    console.table(rows)
    return
  }

  if (process.argv.includes('--close')) {
    const slug = arg('slug')
    const chatJid = arg('chat')
    if (!slug || !chatJid) throw new Error('required: --slug and --chat with --close')
    const { rows } = await pool.query<{ id: string }>('select id from tenants where slug = $1', [slug])
    const tenantId = rows[0]?.id
    if (!tenantId) throw new Error(`tenant not found: ${slug}`)
    await closeHandoff(pool, tenantId, chatJid)
    console.log(`closed handoff for ${slug} / ${chatJid}; the bot will resume`)
    return
  }

  throw new Error('use --list, or --slug --chat --close')
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
