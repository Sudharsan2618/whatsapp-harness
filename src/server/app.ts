import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express, { type Express } from 'express'
import type { Pool } from 'pg'
import type { Logger } from 'pino'
import { archetypes, getArchetype } from '../control/archetypes'
import { buildProfile, crawlSite, crawlUrls, mapSite, profileSummary, scrapeUrl, type BusinessProfile } from '../control/profileExtract'
import { discoverRelevantUrls } from '../control/siteIntel'
import { extractCatalog, ProductStore } from '../intelligence/catalog'
import { TenantRepository } from '../control/tenantRepository'
import { recordLlmUsage } from '../control/usage'
import { tenantConfigSchema, type ModelSpec } from '../config/schema'
import { KnowledgeIngestor } from '../intelligence/knowledge/ingest'
import { KnowledgeStore } from '../intelligence/knowledge/store'
import { ModelAgent } from '../intelligence/modelAgent'
import { closeHandoff } from '../orchestration/handoff'
import { enforceLinks, toWhatsAppText } from '../orchestration/waFormat'
import { MessageStore } from '../transport/messageStore'
import type { ManagerRegistry } from './managerRegistry'

const DEFAULT_MODEL: ModelSpec = { provider: 'openrouter', model: 'openai/gpt-6-luna', temperature: 0.3 }

export interface AppDeps {
  pool: Pool
  logger: Logger
  tenants: TenantRepository
  registry: ManagerRegistry
}

function asyncHandler(fn: (req: express.Request, res: express.Response) => Promise<unknown>) {
  return (req: express.Request, res: express.Response) => {
    fn(req, res).catch((error) => {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    })
  }
}

export function createApp(deps: AppDeps): Express {
  const { pool, tenants, registry, logger } = deps
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  const api = express.Router()

  api.get('/archetypes', (_req, res) => res.json({ archetypes }))

  api.get(
    '/tools',
    asyncHandler(async (_req, res) => {
      const { rows } = await pool.query('select key, name, description from tool_registry order by name')
      res.json({ tools: rows })
    }),
  )

  // Agentically scan a website: map it, let the model pick the relevant pages
  // (rejecting blogs/system URLs), then extract a draft profile with socials.
  api.post(
    '/onboard/scrape',
    asyncHandler(async (req, res) => {
      const url = String(req.body.url ?? '').trim()
      if (!url) return res.status(400).json({ error: 'url is required' })
      const links = await mapSite(url).catch(() => [])
      const discovery = await discoverRelevantUrls(url, links, DEFAULT_MODEL)
      const { profile, markdown } = await buildProfile(url, DEFAULT_MODEL)
      res.json({
        profile,
        markdown,
        selected: discovery.keep,
        scanned: discovery.totalCount,
        rejected: discovery.rejectedCount,
      })
    }),
  )

  // Create a tenant from the onboarding form, seed config, and ingest knowledge.
  api.post(
    '/tenants',
    asyncHandler(async (req, res) => {
      const { slug, businessName, archetype: archetypeKey, tools, model, profile, markdown, calendlyUrl, url, selected } = req.body as {
        slug: string
        businessName: string
        archetype: string
        tools?: string[]
        model?: ModelSpec
        profile?: BusinessProfile
        markdown?: string
        calendlyUrl?: string
        url?: string
        selected?: Array<{ url: string }>
      }
      if (!slug || !businessName) return res.status(400).json({ error: 'slug and businessName are required' })
      const archetype = getArchetype(archetypeKey)
      if (!archetype) return res.status(400).json({ error: 'unknown archetype' })

      const tenant = await tenants.createTenant({ slug, businessName, vertical: null })

      const selectedTools = tools?.length ? [...tools] : [...archetype.tools]
      if (calendlyUrl && !selectedTools.includes('book_meeting')) selectedTools.push('book_meeting')

      const overrides = tenantConfigSchema.parse({
        persona: {
          botName: businessName,
          languages: profile?.languages ?? ['en'],
          tone: archetype.tone,
          businessHours: profile?.hours || undefined,
          systemPromptExtra: [archetype.guidance, profile ? profileSummary(profile) : '']
            .filter(Boolean)
            .join('\n'),
        },
        tools: selectedTools,
        model: model ?? DEFAULT_MODEL,
        integrations: {
          ...(calendlyUrl ? { calendlyUrl } : {}),
          socials: profile?.socials ?? {},
        },
      })
      await tenants.setOverrides(tenant.id, overrides)
      await tenants.setProfile(tenant.id, profile ?? {})

      // Ingest the pages the agentic scan selected; re-discover if the wizard did not pass them.
      const ingestor = new KnowledgeIngestor(pool, tenant.id)
      const chosen = selected?.length ? selected.map((s) => s.url) : []
      const pages = chosen.length
        ? await crawlUrls(chosen)
        : url
          ? await crawlSite(url, 12, model ?? DEFAULT_MODEL)
          : []
      if (pages.length) {
        for (const page of pages) {
          await ingestor.ingestMarkdown({ title: page.url, sourceRef: page.url, source: 'crawl', markdown: page.markdown })
        }
      } else if (markdown?.trim()) {
        await ingestor.ingestMarkdown({ title: `${businessName} website`, sourceRef: url ?? 'onboarding', source: 'crawl', markdown })
      }

      // Pull a product catalog for e-commerce agents.
      if (archetypeKey === 'ecommerce') {
        const source = pages[0]?.markdown ?? markdown
        if (source) {
          const products = await extractCatalog(source, model ?? DEFAULT_MODEL)
          await new ProductStore(pool, tenant.id).replaceAll(products)
        }
      }

      res.json({ tenant, documents: pages.length || (markdown ? 1 : 0) })
    }),
  )

  api.get(
    '/tenants',
    asyncHandler(async (_req, res) => {
      res.json({ tenants: await tenants.listTenants() })
    }),
  )

  api.get(
    '/tenants/:id',
    asyncHandler(async (req, res) => {
      const config = await tenants.getResolvedConfig(req.params.id!)
      const number = (await tenants.listTenants()).find((t) => t.id === req.params.id!)
      const runs = await pool.query(
        `select route, handled_by, latency_ms, created_at from message_runs
         where tenant_id = $1 order by created_at desc limit 20`,
        [req.params.id!],
      )
      const handoffs = await pool.query(
        `select chat_jid, status, reason, created_at from handoffs
         where tenant_id = $1 order by created_at desc limit 20`,
        [req.params.id!],
      )
      const docs = await pool.query(
        'select count(*)::int as count from knowledge_documents where tenant_id = $1',
        [req.params.id!],
      )
      const products = await new ProductStore(pool, req.params.id!).count()
      const profile = await tenants.getProfile(req.params.id!)
      res.json({
        config,
        number,
        profile,
        runs: runs.rows,
        handoffs: handoffs.rows,
        knowledgeDocs: docs.rows[0]?.count ?? 0,
        products,
      })
    }),
  )

  api.patch(
    '/tenants/:id',
    asyncHandler(async (req, res) => {
      const overrides = tenantConfigSchema.parse(req.body.overrides ?? {})
      await tenants.setOverrides(req.params.id!, overrides)
      res.json({ ok: true })
    }),
  )

  api.patch(
    '/tenants/:id/profile',
    asyncHandler(async (req, res) => {
      await tenants.setProfile(req.params.id!, req.body.profile ?? {})
      res.json({ ok: true })
    }),
  )

  api.get(
    '/tenants/:id/knowledge',
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `select d.title, d.source, d.status, d.created_at,
                (select count(*) from knowledge_chunks c where c.document_id = d.id) as chunks
         from knowledge_documents d where d.tenant_id = $1 order by d.created_at desc limit 50`,
        [req.params.id!],
      )
      res.json({ documents: rows })
    }),
  )

  // Deep-crawl a site and ingest multiple pages as knowledge.
  api.post(
    '/tenants/:id/crawl',
    asyncHandler(async (req, res) => {
      const url = String(req.body.url ?? '').trim()
      if (!url) return res.status(400).json({ error: 'url is required' })
      const pages = await crawlSite(url, Number(req.body.maxPages) || 12, DEFAULT_MODEL)
      const ingestor = new KnowledgeIngestor(pool, req.params.id!)
      for (const page of pages) {
        await ingestor.ingestMarkdown({ title: page.url, sourceRef: page.url, source: 'crawl', markdown: page.markdown })
      }
      res.json({ pages: pages.length })
    }),
  )

  // Ingest more knowledge for a tenant from a single URL.
  api.post(
    '/tenants/:id/ingest',
    asyncHandler(async (req, res) => {
      const url = String(req.body.url ?? '').trim()
      if (!url) return res.status(400).json({ error: 'url is required' })
      const markdown = await scrapeUrl(url)
      const ingestor = new KnowledgeIngestor(pool, req.params.id!)
      const result = await ingestor.ingestMarkdown({
        title: url,
        sourceRef: url,
        source: 'crawl',
        markdown,
      })
      res.json(result)
    }),
  )

  // Extract a product catalog from a URL and replace the tenant's catalog.
  api.post(
    '/tenants/:id/catalog',
    asyncHandler(async (req, res) => {
      const url = String(req.body.url ?? '').trim()
      if (!url) return res.status(400).json({ error: 'url is required' })
      const markdown = await scrapeUrl(url)
      const products = await extractCatalog(markdown, DEFAULT_MODEL)
      const count = await new ProductStore(pool, req.params.id!).replaceAll(products)
      res.json({ count })
    }),
  )

  api.get(
    '/tenants/:id/products',
    asyncHandler(async (req, res) => {
      const products = await new ProductStore(pool, req.params.id!).list(50)
      res.json({ products })
    }),
  )

  // Sandbox chat: run the agent without WhatsApp so the owner can test.
  api.post(
    '/tenants/:id/chat',
    asyncHandler(async (req, res) => {
      const text = String(req.body.text ?? '').trim()
      const chatJid = String(req.body.chatJid ?? 'sandbox@console')
      if (!text) return res.status(400).json({ error: 'text is required' })
      const tenantId = req.params.id!
      const config = await tenants.getResolvedConfig(tenantId)
      const messages = new MessageStore(pool, tenantId)
      const knowledge = new KnowledgeStore(pool, tenantId)
      const agent = new ModelAgent(pool)
      const history = await messages.recentTurns(chatJid, 8)
      const [context, sources] = await Promise.all([
        knowledge.retrieve(text, config.retrieval.topK),
        knowledge.sources(),
      ])
      const socials = Object.values(config.integrations?.socials ?? {})
      const links = [sources, socials, config.integrations?.calendlyUrl, config.integrations?.payment?.pageUrl]
        .flat()
        .filter((l): l is string => Boolean(l))
      const reply = await agent.handle({
        tenantId,
        chatJid,
        customerJid: chatJid,
        text,
        config,
        history,
        knowledge: context,
        links,
      })
      const home = sources.find((l) => /^https?:\/\/[^/]+\/?$/.test(l)) ?? sources[0] ?? ''
      const replyText = reply.text ? toWhatsAppText(enforceLinks(reply.text, links, home)) : ''
      const outbox = (reply.outbox ?? []).map((item) =>
        item.kind === 'text' ? { ...item, text: toWhatsAppText(item.text) } : item,
      )
      await messages.saveIncomingText(chatJid, text)
      if (replyText) await messages.saveOutgoingText(chatJid, replyText)
      for (const item of outbox) {
        if (item.kind === 'text') await messages.saveOutgoingText(chatJid, item.text)
      }
      await recordLlmUsage(pool, tenantId, reply)
      res.json({
        reply: replyText,
        toolsCalled: reply.toolsCalled ?? [],
        outbox,
        knowledgeUsed: context.length,
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
      })
    }),
  )

  // Start linking a number (provisions the number if a phone is given).
  api.post(
    '/tenants/:id/link',
    asyncHandler(async (req, res) => {
      const phone = String(req.body.phone ?? '').replace(/\D/g, '')
      if (!phone) return res.status(400).json({ error: 'phone is required (digits only)' })
      const number = await tenants.addNumber(req.params.id!, phone)
      await registry.ensure(number, true)
      res.json({ numberId: number.id })
    }),
  )

  // Disconnect: log the number out of WhatsApp and free it from the tenant.
  api.post(
    '/tenants/:id/disconnect',
    asyncHandler(async (req, res) => {
      const ids = await tenants.numbersForTenant(req.params.id!)
      for (const numberId of ids) {
        await registry.disconnect(numberId)
        await tenants.deleteNumber(numberId)
      }
      res.json({ disconnected: ids.length })
    }),
  )

  api.get(
    '/numbers/:id/status',
    asyncHandler(async (req, res) => {
      const number = await tenants.findNumberById(req.params.id!)
      if (!number) return res.status(404).json({ error: 'number not found' })
      res.json({ authStatus: number.authStatus, ...registry.getPairing(number.id) })
    }),
  )

  api.post(
    '/tenants/:id/handoffs/close',
    asyncHandler(async (req, res) => {
      await closeHandoff(pool, req.params.id!, String(req.body.chatJid ?? ''))
      res.json({ ok: true })
    }),
  )

  app.use('/api', api)

  const here = dirname(fileURLToPath(import.meta.url))
  const dashboard = join(here, '..', '..', 'public', 'dashboard')
  app.use(express.static(dashboard))
  app.get('*', (_req, res) => res.sendFile(join(dashboard, 'index.html')))

  logger.info('control-plane app ready')
  return app
}
