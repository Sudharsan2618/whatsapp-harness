import type { Pool } from 'pg'

export type KnowledgeSource = 'upload' | 'crawl' | 'manual'

export interface IngestInput {
  title: string
  sourceRef: string
  source: KnowledgeSource
  markdown: string
  approve?: boolean
}

/** Split text into retrieval-sized chunks on paragraph boundaries. */
export function chunkText(text: string, maxChars = 900): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > maxChars) {
      chunks.push(current)
      current = ''
    }
    current = current ? `${current} ${paragraph}` : paragraph
    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars))
      current = current.slice(maxChars)
    }
  }
  if (current) chunks.push(current)
  return chunks
}

export class KnowledgeIngestor {
  constructor(
    private readonly pool: Pool,
    private readonly tenantId: string,
  ) {}

  async ingestMarkdown(input: IngestInput): Promise<{ documentId: string; chunks: number }> {
    const chunks = chunkText(input.markdown)
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const doc = await client.query<{ id: string }>(
        `insert into knowledge_documents (tenant_id, source, source_ref, title, status)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [
          this.tenantId,
          input.source,
          input.sourceRef,
          input.title,
          input.approve === false ? 'pending' : 'approved',
        ],
      )
      const documentId = doc.rows[0]!.id
      for (const chunk of chunks) {
        await client.query(
          'insert into knowledge_chunks (tenant_id, document_id, content) values ($1, $2, $3)',
          [this.tenantId, documentId, chunk],
        )
      }
      await client.query('commit')
      return { documentId, chunks: chunks.length }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
}
