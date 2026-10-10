import type { Pool } from 'pg'
import type { AgentReply } from '../intelligence/adapter'

/** Record token usage for one LLM call. Cost is computed later from a price table. */
export async function recordLlmUsage(
  pool: Pool,
  tenantId: string,
  reply: AgentReply,
): Promise<void> {
  if (reply.tokensIn === undefined && reply.tokensOut === undefined) return
  await pool.query(
    `insert into usage_events (tenant_id, kind, tokens_in, tokens_out)
     values ($1, 'llm_call', $2, $3)`,
    [tenantId, reply.tokensIn ?? 0, reply.tokensOut ?? 0],
  )
}
