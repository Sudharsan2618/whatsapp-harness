import type { Pool } from 'pg'

// Drop degenerate (near-zero) matches. Real semantic confidence arrives with
// vector retrieval (backlog 1.9); keyword rank is a coarse floor.
const MIN_RANK = 1e-6

/**
 * Per-tenant knowledge retrieval (Postgres full-text, v1). Queries use OR
 * semantics so conversational filler ("ok thanks, what is your MOQ?") still
 * matches on the salient terms, with ts_rank ordering by relevance. Each result
 * carries its real source URL so the agent can cite links instead of guessing.
 */
export class KnowledgeStore {
  constructor(
    private readonly pool: Pool,
    private readonly tenantId: string,
  ) {}

  async retrieve(query: string, topK: number): Promise<string[]> {
    if (!query.trim()) return []
    const { rows } = await this.pool.query<{ content: string; source_ref: string | null }>(
      `with q as (
         select replace(plainto_tsquery('english', $2)::text, ' & ', ' | ')::tsquery as tsq
       )
       select c.content, d.source_ref
       from knowledge_chunks c
       join knowledge_documents d on d.id = c.document_id
       cross join q
       where c.tenant_id = $1
         and d.status = 'approved'
         and q.tsq <> ''::tsquery
         and c.content_tsv @@ q.tsq
         and ts_rank(c.content_tsv, q.tsq) > $4
       order by ts_rank(c.content_tsv, q.tsq) desc
       limit $3`,
      [this.tenantId, query, topK, MIN_RANK],
    )
    return rows.map((row) =>
      row.source_ref ? `${row.content}\n(source: ${row.source_ref})` : row.content,
    )
  }

  /** Real page URLs the tenant has in its knowledge base — the only links the agent may share. */
  async sources(limit = 30): Promise<string[]> {
    const { rows } = await this.pool.query<{ source_ref: string }>(
      `select distinct source_ref from knowledge_documents
       where tenant_id = $1 and status = 'approved' and source_ref ~ '^https?://'
       order by source_ref limit $2`,
      [this.tenantId, limit],
    )
    return rows.map((row) => row.source_ref)
  }
}
