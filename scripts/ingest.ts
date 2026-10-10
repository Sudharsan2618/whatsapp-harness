import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnowledgeIngestor, type KnowledgeSource } from '../src/intelligence/knowledge/ingest'
import { pool } from '../src/db/pool'
import { logger } from '../src/utils/logger'

// Ingest knowledge for a tenant from a local file or a scraped URL.
// Usage:
//   npx tsx scripts/ingest.ts --slug kokoexports --file docs/sample-koko-profile.md
//   npx tsx scripts/ingest.ts --slug kokoexports --url https://example.com
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function scrapeUrl(url: string): string {
  const out = join(tmpdir(), `ingest-${Date.now()}.md`)
  execFileSync('firecrawl', ['scrape', url, '-o', out], { stdio: 'pipe', shell: true })
  return readFileSync(out, 'utf8')
}

async function run(): Promise<void> {
  const slug = arg('slug')
  const url = arg('url')
  const file = arg('file')
  if (!slug || (!url && !file)) throw new Error('required: --slug and (--url or --file)')

  const { rows } = await pool.query<{ id: string }>('select id from tenants where slug = $1', [slug])
  const tenantId = rows[0]?.id
  if (!tenantId) throw new Error(`tenant not found: ${slug}`)

  const markdown = url ? scrapeUrl(url) : readFileSync(file!, 'utf8')
  const source: KnowledgeSource = url ? 'crawl' : 'upload'
  const ingestor = new KnowledgeIngestor(pool, tenantId)
  const result = await ingestor.ingestMarkdown({
    title: arg('title') ?? url ?? file!,
    sourceRef: url ?? file!,
    source,
    markdown,
  })

  logger.info({ slug, ...result }, 'ingested knowledge')
}

run()
  .catch((error) => {
    logger.error({ error }, 'ingest failed')
    process.exitCode = 1
  })
  .finally(() => pool.end())
