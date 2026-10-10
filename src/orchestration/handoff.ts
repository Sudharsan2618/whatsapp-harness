import type { Pool } from 'pg'

/** Open a handoff for a chat (idempotent — one open handoff per chat). */
export async function openHandoff(
  pool: Pool,
  tenantId: string,
  chatJid: string,
  reason: string,
): Promise<void> {
  await pool.query(
    `insert into handoffs (tenant_id, chat_jid, reason, status)
     select $1, $2, $3, 'open'
     where not exists (
       select 1 from handoffs
       where tenant_id = $1 and chat_jid = $2 and status = 'open'
     )`,
    [tenantId, chatJid, reason],
  )
}

export async function isHandoffOpen(
  pool: Pool,
  tenantId: string,
  chatJid: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from handoffs
     where tenant_id = $1 and chat_jid = $2 and status = 'open'
     limit 1`,
    [tenantId, chatJid],
  )
  return rows.length > 0
}

/** Close the open handoff for a chat and let the bot resume. */
export async function closeHandoff(
  pool: Pool,
  tenantId: string,
  chatJid: string,
): Promise<void> {
  await pool.query(
    `update handoffs set status = 'closed', closed_at = now()
     where tenant_id = $1 and chat_jid = $2 and status = 'open'`,
    [tenantId, chatJid],
  )
}
