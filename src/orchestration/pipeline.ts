import type { AnyMessageContent, WAMessage } from '@whiskeysockets/baileys'
import type { Pool } from 'pg'
import type { Logger } from 'pino'
import type { TenantRepository } from '../control/tenantRepository'
import { recordLlmUsage } from '../control/usage'
import type { TenantNumber } from '../domain/types'
import type { AgentAdapter } from '../intelligence/adapter'
import { KnowledgeStore } from '../intelligence/knowledge/store'
import type { OutboundMessage } from '../intelligence/tools/types'
import { normalizeInbound } from '../transport/eventRouter'
import { MessageStore } from '../transport/messageStore'
import { isHandoffOpen } from './handoff'
import type { SafeSender } from './safeSender'
import { enforceLinks, toWhatsAppText } from './waFormat'

/** URLs the agent is allowed to put in free text: verified pages + configured integrations. */
function allowedLinks(
  links: string[],
  config: { integrations?: { calendlyUrl?: string; payment?: { pageUrl?: string }; socials?: Record<string, string> } },
): string[] {
  const socials = Object.values(config.integrations?.socials ?? {})
  return [links, socials, config.integrations?.calendlyUrl, config.integrations?.payment?.pageUrl]
    .flat()
    .filter((l): l is string => Boolean(l))
}

/** The site root, used to replace any link the model invents. */
function homepage(links: string[]): string {
  return links.find((l) => /^https?:\/\/[^/]+\/?$/.test(l)) ?? links[0] ?? ''
}

function toContent(message: OutboundMessage): AnyMessageContent {
  switch (message.kind) {
    case 'text':
      return { text: toWhatsAppText(message.text) }
    case 'image':
      return { image: { url: message.url }, caption: message.caption ? toWhatsAppText(message.caption) : undefined }
    case 'document':
      return { document: { url: message.url }, fileName: message.fileName, mimetype: message.mimetype ?? 'application/pdf' }
    case 'location':
      return { location: { degreesLatitude: message.latitude, degreesLongitude: message.longitude, name: message.name } }
  }
}

/** A short text record of a rich outbound message, so it enters conversation memory. */
function outboxMemory(message: OutboundMessage): string | null {
  switch (message.kind) {
    case 'text':
      return message.text
    case 'image':
      return message.caption ? `[sent image] ${message.caption}` : '[sent an image]'
    case 'document':
      return `[sent document] ${message.fileName ?? ''}`.trim()
    case 'location':
      return `[sent location] ${message.name ?? ''}`.trim()
  }
}

const HISTORY_TURNS = 8

type Route = 'info' | 'action' | 'handoff'

export interface PipelineDeps {
  pool: Pool
  tenants: TenantRepository
  agent: AgentAdapter
  logger: Logger
}

/**
 * Turns one inbound message into a reply: honor an open handoff, resolve config,
 * assemble memory + retrieved knowledge, run the agent (which may call tools),
 * send through the SafeSender, and record usage and the route taken.
 */
export class MessagePipeline {
  constructor(private readonly deps: PipelineDeps) {}

  async handle(number: TenantNumber, message: WAMessage, sender: SafeSender): Promise<void> {
    const inbound = normalizeInbound(message)
    if (!inbound) return

    const started = Date.now()
    const messages = new MessageStore(this.deps.pool, number.tenantId)
    const knowledge = new KnowledgeStore(this.deps.pool, number.tenantId)
    const msgId = message.key.id ?? null

    await this.touchCustomer(number.tenantId, inbound.customerJid, message.pushName ?? null)

    // A human has taken over this chat — stay silent until the handoff is closed.
    if (await isHandoffOpen(this.deps.pool, number.tenantId, inbound.chatJid)) {
      await this.recordRun(number.tenantId, inbound.chatJid, msgId, Date.now() - started, 'handoff', 'human')
      return
    }

    const config = await this.deps.tenants.getResolvedConfig(number.tenantId)
    const [history, context, sources] = await Promise.all([
      messages.recentTurns(inbound.chatJid, HISTORY_TURNS, msgId ?? undefined),
      knowledge.retrieve(inbound.text, config.retrieval.topK),
      knowledge.sources(),
    ])
    const links = allowedLinks(sources, config)

    const reply = await this.deps.agent.handle({
      tenantId: number.tenantId,
      chatJid: inbound.chatJid,
      customerJid: inbound.customerJid,
      text: inbound.text,
      config,
      history,
      knowledge: context,
      links,
    })

    if (reply.text) {
      const text = toWhatsAppText(enforceLinks(reply.text, links, homepage(sources)))
      await sender.enqueue(inbound.chatJid, { text })
      await messages.saveOutgoingText(inbound.chatJid, text)
    }
    for (const item of reply.outbox ?? []) {
      await sender.enqueue(inbound.chatJid, toContent(item))
      const memo = outboxMemory(item)
      if (memo) await messages.saveOutgoingText(inbound.chatJid, memo)
    }

    await recordLlmUsage(this.deps.pool, number.tenantId, reply)
    const route: Route = reply.toolsCalled?.includes('handoff_human')
      ? 'handoff'
      : reply.toolsCalled?.length
        ? 'action'
        : 'info'
    await this.recordRun(number.tenantId, inbound.chatJid, msgId, Date.now() - started, route, 'bot')
  }

  private async touchCustomer(
    tenantId: string,
    customerJid: string,
    name: string | null,
  ): Promise<void> {
    await this.deps.pool.query(
      `insert into customers (tenant_id, wa_lid, display_name, last_seen_at)
       values ($1, $2, $3, now())
       on conflict (tenant_id, wa_lid)
       do update set last_seen_at = now(),
                     display_name = coalesce(excluded.display_name, customers.display_name)`,
      [tenantId, customerJid, name],
    )
  }

  private async recordRun(
    tenantId: string,
    chatJid: string,
    msgId: string | null,
    latencyMs: number,
    route: Route,
    handledBy: 'bot' | 'human',
  ): Promise<void> {
    await this.deps.pool.query(
      `insert into message_runs (tenant_id, chat_jid, msg_id, route, handled_by, latency_ms)
       values ($1, $2, $3, $4, $5, $6)`,
      [tenantId, chatJid, msgId, route, handledBy, latencyMs],
    )
  }
}
