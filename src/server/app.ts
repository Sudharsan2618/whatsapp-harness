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
import { closeHandoff, isHandoffOpen, openHandoff } from '../orchestration/handoff'
import { clearSessionCookie, createSession, createUser, destroySession, findUserByEmail, getSessionUser, parseCookies, setSessionCookie, setUserTenant, verifyPassword } from '../control/auth'
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

  // ── Auth ──
  api.post(
    '/auth/signup',
    asyncHandler(async (req, res) => {
      const email = String(req.body.email ?? '').trim().toLowerCase()
      const password = String(req.body.password ?? '')
      const name = String(req.body.name ?? '').trim() || null
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' })
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
      if (await findUserByEmail(pool, email)) return res.status(409).json({ error: 'An account with this email already exists.' })
      const user = await createUser(pool, { email, name: name ?? undefined, password })
      const token = await createSession(pool, user.id)
      setSessionCookie(req, res, token)
      res.json({ user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role } })
    }),
  )
  api.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const email = String(req.body.email ?? '').trim().toLowerCase()
      const password = String(req.body.password ?? '')
      const user = await findUserByEmail(pool, email)
      if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Wrong email or password.' })
      const token = await createSession(pool, user.id)
      setSessionCookie(req, res, token)
      res.json({ user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role } })
    }),
  )
  api.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      const token = parseCookies(req).ac_session
      if (token) await destroySession(pool, token)
      clearSessionCookie(res)
      res.json({ ok: true })
    }),
  )
  api.get(
    '/auth/me',
    asyncHandler(async (req, res) => {
      const user = await getSessionUser(pool, req)
      if (!user) return res.json({ user: null, tenant: null })
      const tenant = user.tenantId ? (await tenants.listTenants()).find((t) => t.id === user.tenantId) ?? null : null
      res.json({ user, tenant })
    }),
  )

  // Gate everything below behind a session. Admins may act on any tenant; owners
  // only on their own. (Routes above — /auth/* — stay public.)
  api.use((req, res, next) => {
    getSessionUser(pool, req)
      .then((user) => {
        if (!user) return res.status(401).json({ error: 'Not signed in' })
        if (user.role === 'admin') return next()
        if (req.path === '/tenants' && req.method === 'GET') return res.status(403).json({ error: 'Forbidden' })
        const m = req.path.match(/^\/tenants\/([^/]+)/)
        if (m && m[1] !== user.tenantId) return res.status(403).json({ error: 'Forbidden' })
        next()
      })
      .catch((error) => res.status(500).json({ error: error instanceof Error ? error.message : String(error) }))
  })

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

      // Link this bot to the signed-in account (one account = one bot for now).
      const authUser = await getSessionUser(pool, req)
      if (authUser && !authUser.tenantId) await setUserTenant(pool, authUser.id, tenant.id)

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
        `select d.id, d.title, d.source_ref, d.source, d.status, d.created_at
         from knowledge_documents d where d.tenant_id = $1 order by d.created_at desc limit 100`,
        [req.params.id!],
      )
      res.json({ documents: rows })
    }),
  )

  // Remove a learned page/document.
  api.delete(
    '/tenants/:id/knowledge/:docId',
    asyncHandler(async (req, res) => {
      await pool.query('delete from knowledge_chunks where tenant_id = $1 and document_id = $2', [req.params.id!, req.params.docId!])
      await pool.query('delete from knowledge_documents where tenant_id = $1 and id = $2', [req.params.id!, req.params.docId!])
      res.json({ ok: true })
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

  // WhatsApp connection + profile (editable name/about) + read-only Business card.
  api.get(
    '/tenants/:id/whatsapp',
    asyncHandler(async (req, res) => {
      const id = req.params.id!
      const n = await pool.query(
        `select id, phone_e164, auth_status, created_at, updated_at from tenant_numbers where tenant_id = $1 order by created_at limit 1`,
        [id],
      )
      const number = n.rows[0] ?? null
      const last = await pool.query(
        `select created_at from message_runs where tenant_id = $1 order by created_at desc limit 1`,
        [id],
      )
      const profile = await tenants.getProfile(id)
      const wa = (profile.whatsapp as { name?: string; about?: string }) ?? {}
      let business: unknown = null
      if (number?.auth_status === 'linked') {
        const mgr = registry.manager(number.id)
        if (mgr) business = await mgr.getBusinessProfile()
      }
      res.json({
        number,
        linkedSince: number?.updated_at ?? number?.created_at ?? null,
        lastHandled: last.rows[0]?.created_at ?? null,
        profile: { name: wa.name ?? (await tenants.listTenants()).find((t) => t.id === id)?.business_name ?? '', about: wa.about ?? '' },
        business,
      })
    }),
  )

  api.post(
    '/tenants/:id/whatsapp/profile',
    asyncHandler(async (req, res) => {
      const id = req.params.id!
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : undefined
      const about = typeof req.body.about === 'string' ? req.body.about.trim() : undefined
      const nums = await tenants.numbersForTenant(id)
      const numberId = nums[0]
      const mgr = numberId ? registry.manager(numberId) : undefined
      if (!mgr) return res.status(409).json({ error: 'WhatsApp is not connected, so the profile can’t be updated right now.' })
      if (name) await mgr.setProfileName(name)
      if (about !== undefined) await mgr.setProfileStatus(about)
      const profile = await tenants.getProfile(id)
      await tenants.setProfile(id, { ...profile, whatsapp: { name, about } })
      res.json({ ok: true })
    }),
  )

  // Delete the whole bot: disconnect numbers, then remove the tenant and its data.
  api.delete(
    '/tenants/:id',
    asyncHandler(async (req, res) => {
      const id = req.params.id!
      const ids = await tenants.numbersForTenant(id)
      for (const numberId of ids) {
        await registry.disconnect(numberId)
        await tenants.deleteNumber(numberId)
      }
      await pool.query('delete from tenants where id = $1', [id])
      res.json({ ok: true })
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

  // Conversations list: who is waiting on a human + recent chats with status.
  api.get(
    '/tenants/:id/conversations',
    asyncHandler(async (req, res) => {
      const id = req.params.id!
      const waiting = await pool.query(
        `select h.chat_jid, h.reason, h.created_at,
                (select text_preview from messages m where m.tenant_id = h.tenant_id and m.chat_jid = h.chat_jid and m.from_me = false and m.text_preview is not null order by m.created_at desc limit 1) as last_text,
                (select display_name from customers c where c.tenant_id = h.tenant_id and c.wa_lid = h.chat_jid) as name
         from handoffs h where h.tenant_id = $1 and h.status = 'open' order by h.created_at asc`,
        [id],
      )
      const recent = await pool.query(
        `select c.chat_jid, c.last_text, c.at,
                (select display_name from customers cu where cu.tenant_id = $1 and cu.wa_lid = c.chat_jid) as name,
                (select status from handoffs h where h.tenant_id = $1 and h.chat_jid = c.chat_jid order by h.created_at desc limit 1) as handoff_status
         from (
           select distinct on (m.chat_jid) m.chat_jid, m.text_preview as last_text, m.created_at as at
           from messages m where m.tenant_id = $1 and m.text_preview is not null
           order by m.chat_jid, m.created_at desc
         ) c order by c.at desc limit 40`,
        [id],
      )
      res.json({
        waiting: waiting.rows.map((r) => ({ chatJid: r.chat_jid, name: r.name, lastText: r.last_text, reason: r.reason, since: r.created_at })),
        recent: recent.rows.map((r) => ({ chatJid: r.chat_jid, name: r.name, lastText: r.last_text, at: r.at, status: r.handoff_status === 'open' ? 'handed' : r.handoff_status === 'closed' ? 'resolved' : 'bot' })),
      })
    }),
  )

  // One conversation thread.
  api.get(
    '/tenants/:id/conversations/:chatJid',
    asyncHandler(async (req, res) => {
      const id = req.params.id!
      const chatJid = decodeURIComponent(req.params.chatJid!)
      const msgs = await pool.query(
        `select from_me, text_preview, created_at from messages
         where tenant_id = $1 and chat_jid = $2 and text_preview is not null order by created_at asc limit 200`,
        [id, chatJid],
      )
      const cust = await pool.query(
        `select display_name, (select min(created_at) from messages m where m.tenant_id = $1 and m.chat_jid = $2) as first_at
         from customers where tenant_id = $1 and wa_lid = $2`,
        [id, chatJid],
      )
      const h = await pool.query(
        `select status, reason, created_at from handoffs where tenant_id = $1 and chat_jid = $2 order by created_at desc limit 1`,
        [id, chatJid],
      )
      res.json({
        chatJid,
        customer: { name: cust.rows[0]?.display_name ?? null, firstAt: cust.rows[0]?.first_at ?? null },
        handoff: h.rows[0] ? { status: h.rows[0].status, reason: h.rows[0].reason, since: h.rows[0].created_at } : null,
        messages: msgs.rows.map((m) => ({ fromMe: m.from_me, text: m.text_preview, at: m.created_at })),
      })
    }),
  )

  // Human reply: take over the chat (open handoff so the bot stays quiet) and send.
  api.post(
    '/tenants/:id/conversations/:chatJid/reply',
    asyncHandler(async (req, res) => {
      const id = req.params.id!
      const chatJid = decodeURIComponent(req.params.chatJid!)
      const text = String(req.body.text ?? '').trim()
      if (!text) return res.status(400).json({ error: 'text is required' })
      const nums = await tenants.numbersForTenant(id)
      const mgr = nums[0] ? registry.manager(nums[0]) : undefined
      if (!mgr) return res.status(409).json({ error: 'WhatsApp is not connected, so the reply can’t be sent.' })
      if (!(await isHandoffOpen(pool, id, chatJid))) await openHandoff(pool, id, chatJid, 'A team member replied')
      await mgr.rawSend(chatJid, { text })
      await new MessageStore(pool, id).saveOutgoingText(chatJid, text)
      res.json({ ok: true })
    }),
  )

  api.post(
    '/tenants/:id/handoffs/close',
    asyncHandler(async (req, res) => {
      await closeHandoff(pool, req.params.id!, String(req.body.chatJid ?? ''))
      res.json({ ok: true })
    }),
  )

  // The tenant (bot) the logged-in customer manages. One account = one bot for now;
  // auth comes later, so resolve the most recently created tenant.
  api.get(
    '/me',
    asyncHandler(async (_req, res) => {
      const list = await tenants.listTenants()
      const tenant = list[0]
      res.json({ tenant: tenant ?? null, configured: Boolean(tenant) })
    }),
  )

  // Everything the Overview screen needs, in plain business terms (no internal ids/counts).
  api.get(
    '/tenants/:id/overview',
    asyncHandler(async (req, res) => {
      const id = req.params.id!
      const range = req.query.range === '7d' ? '7 days' : '1 day'
      const config = await tenants.getResolvedConfig(id)
      const number = (await tenants.listTenants()).find((t) => t.id === id)

      const stats = await pool.query(
        `select
           count(distinct chat_jid)::int as conversations,
           count(*)::int as handled,
           count(*) filter (where route = 'handoff')::int as needed_human,
           coalesce(round(avg(latency_ms) filter (where handled_by = 'bot'))::int, 0) as avg_latency_ms
         from message_runs
         where tenant_id = $1 and created_at > now() - $2::interval`,
        [id, range],
      )
      const messages = await pool.query(
        `select count(*)::int as n from messages
         where tenant_id = $1 and created_at > now() - $2::interval`,
        [id, range],
      )
      const knowledge = await pool.query(
        `select
           count(*) filter (where status = 'approved')::int as pages,
           count(*) filter (where status <> 'approved')::int as processing
         from knowledge_documents where tenant_id = $1`,
        [id],
      )
      const toolTotal = await pool.query(`select count(*)::int as n from tool_registry`)
      const attention = await pool.query(
        `select h.chat_jid, h.reason, h.created_at,
                (select text_preview from messages m
                  where m.tenant_id = h.tenant_id and m.chat_jid = h.chat_jid and m.from_me = false
                    and m.text_preview is not null order by m.created_at desc limit 1) as last_text,
                (select display_name from customers c
                  where c.tenant_id = h.tenant_id and c.wa_lid = h.chat_jid) as name
         from handoffs h
         where h.tenant_id = $1 and h.status = 'open'
         order by h.created_at asc limit 5`,
        [id],
      )

      const integrations: string[] = []
      if (config.integrations?.calendlyUrl) integrations.push('Calendly')
      if (config.integrations?.payment && config.integrations.payment.provider !== 'none') integrations.push('Payments')
      if (Object.keys(config.integrations?.socials ?? {}).length) integrations.push('Social links')

      res.json({
        connection: {
          status: number?.auth_status === 'linked' ? 'live' : 'down',
          phone: number?.phone_e164 ?? null,
        },
        botName: config.persona.botName,
        stats: {
          conversations: stats.rows[0]?.conversations ?? 0,
          messages: messages.rows[0]?.n ?? 0,
          neededHuman: stats.rows[0]?.needed_human ?? 0,
          avgLatencyMs: stats.rows[0]?.avg_latency_ms ?? 0,
        },
        attention: attention.rows.map((r) => ({
          chatJid: r.chat_jid,
          name: r.name,
          lastText: r.last_text,
          reason: r.reason,
          since: r.created_at,
        })),
        knowledge: { pages: knowledge.rows[0]?.pages ?? 0, processing: knowledge.rows[0]?.processing ?? 0 },
        skills: { on: config.tools.length, total: toolTotal.rows[0]?.n ?? 0 },
        integrations: { connected: integrations.length, names: integrations },
      })
    }),
  )

  app.use('/api', api)

  // The console is the only web surface: sign-in is the default page, and it routes
  // by role (admin → all agents, owner → their bot). The old open dashboard is gone.
  const here = dirname(fileURLToPath(import.meta.url))
  const consoleDir = join(here, '..', '..', 'public', 'console')
  app.use('/console', express.static(consoleDir))
  app.get('*', (_req, res) => res.sendFile(join(consoleDir, 'index.html')))

  logger.info('control-plane app ready')
  return app
}
