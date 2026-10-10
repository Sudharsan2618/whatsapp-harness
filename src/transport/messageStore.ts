import { randomUUID } from 'node:crypto'
import {
  BufferJSON,
  type WAMessage,
  type WAMessageKey,
  type proto,
} from '@whiskeysockets/baileys'
import type { Pool } from 'pg'
import type { ConversationTurn } from '../intelligence/adapter'

const encode = (value: unknown) => JSON.parse(JSON.stringify(value, BufferJSON.replacer))
const decode = <T>(value: unknown): T =>
  JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T

function extractText(message: WAMessage): string | null {
  return message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? null
}

/**
 * Per-tenant message store. Backs the getMessage socket callback (retries and
 * poll-vote decryption) and supplies recent turns for conversation memory.
 */
export class MessageStore {
  constructor(
    private readonly pool: Pool,
    private readonly tenantId: string,
  ) {}

  async save(message: WAMessage): Promise<void> {
    const { key } = message
    if (!key.remoteJid || !key.id) return
    await this.pool.query(
      `insert into messages
         (tenant_id, chat_jid, msg_id, from_me, sender_jid, content, text_preview, ts)
       values ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
       on conflict (tenant_id, chat_jid, msg_id)
       do update set content = excluded.content, text_preview = excluded.text_preview`,
      [
        this.tenantId,
        key.remoteJid,
        key.id,
        Boolean(key.fromMe),
        key.participant ?? null,
        message.message ? encode(message.message) : null,
        extractText(message),
        Number(message.messageTimestamp) || null,
      ],
    )
  }

  /** Record an outbound reply so it becomes part of conversation memory. */
  async saveOutgoingText(chatJid: string, text: string): Promise<void> {
    await this.pool.query(
      `insert into messages (tenant_id, chat_jid, msg_id, from_me, text_preview, ts)
       values ($1, $2, $3, true, $4, now())`,
      [this.tenantId, chatJid, `out-${randomUUID()}`, text],
    )
  }

  /** Record an inbound text turn directly (used by the console test harness). */
  async saveIncomingText(chatJid: string, text: string): Promise<void> {
    await this.pool.query(
      `insert into messages (tenant_id, chat_jid, msg_id, from_me, text_preview, ts)
       values ($1, $2, $3, false, $4, now())`,
      [this.tenantId, chatJid, `in-${randomUUID()}`, text],
    )
  }

  async get(key: WAMessageKey): Promise<proto.IMessage | undefined> {
    const { rows } = await this.pool.query(
      `select content from messages
       where tenant_id = $1 and chat_jid = $2 and msg_id = $3`,
      [this.tenantId, key.remoteJid, key.id],
    )
    return rows[0]?.content ? decode<proto.IMessage>(rows[0].content) : undefined
  }

  /** Last `limit` text turns for a chat, oldest first, optionally excluding one id. */
  async recentTurns(
    chatJid: string,
    limit: number,
    excludeMsgId?: string,
  ): Promise<ConversationTurn[]> {
    const { rows } = await this.pool.query<{ text_preview: string; from_me: boolean }>(
      `select text_preview, from_me from messages
       where tenant_id = $1 and chat_jid = $2 and text_preview is not null
         and ($4::text is null or msg_id <> $4)
       order by created_at desc
       limit $3`,
      [this.tenantId, chatJid, limit, excludeMsgId ?? null],
    )
    return rows
      .reverse()
      .map((row) => ({ role: row.from_me ? 'assistant' : 'user', content: row.text_preview }))
  }
}
