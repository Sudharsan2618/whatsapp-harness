import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  type AnyMessageContent,
  type BaileysEventMap,
  type CacheStore,
  type ConnectionState,
  type GroupMetadata,
  type WAMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import NodeCache from '@cacheable/node-cache'
import type { Pool } from 'pg'
import type { Logger } from 'pino'
import { env } from '../config/env'
import type { NumberAuthStatus, TenantNumber } from '../domain/types'
import { useDbAuthState } from './authStore'
import { MessageStore } from './messageStore'

const MAX_RECONNECT_DELAY_MS = 30_000

export interface ConnectionManagerOptions {
  pool: Pool
  logger: Logger
  number: TenantNumber
  usePairingCode?: boolean
  onQr?: (qr: string) => void
  onPairingCode?: (code: string) => void
}

/**
 * Owns one Baileys socket for one tenant number: auth persistence, reconnection,
 * keep-alive caches, and inbound delivery. Baileys does not reconnect on its
 * own, so closes other than logout are retried here with backoff.
 */
export class ConnectionManager {
  private sock?: ReturnType<typeof makeWASocket>
  private saveCreds?: () => Promise<void>
  private stopped = false
  private reconnectDelay = 1_000
  private pairingRequested = false

  private readonly logger: Logger
  private readonly messageStore: MessageStore
  private readonly groupCache = new NodeCache({ stdTTL: 300, useClones: false })
  private readonly msgRetryCounterCache = new NodeCache() as unknown as CacheStore

  onInbound: (message: WAMessage) => Promise<void> = async () => {}

  constructor(private readonly options: ConnectionManagerOptions) {
    this.logger = options.logger.child({ number: options.number.phoneE164 })
    this.messageStore = new MessageStore(options.pool, options.number.tenantId)
  }

  async start(): Promise<void> {
    this.stopped = false
    await this.connect()
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.sock?.end(undefined)
  }

  /** Remove the linked device from WhatsApp and close the socket. */
  async logout(): Promise<void> {
    this.stopped = true
    try {
      await this.sock?.logout()
    } catch (error) {
      this.logger.warn({ error }, 'logout failed')
    }
    try {
      this.sock?.end(undefined)
    } catch {
      /* already closed */
    }
  }

  async rawSend(jid: string, content: AnyMessageContent): Promise<void> {
    if (!this.sock) throw new Error('socket not connected')
    await this.sock.sendMessage(jid, content)
  }

  /** Update the WhatsApp display name (syncs to WhatsApp). */
  async setProfileName(name: string): Promise<void> {
    if (!this.sock) throw new Error('socket not connected')
    await this.sock.updateProfileName(name)
  }

  /** Update the WhatsApp about/status text (syncs to WhatsApp). */
  async setProfileStatus(status: string): Promise<void> {
    if (!this.sock) throw new Error('socket not connected')
    await this.sock.updateProfileStatus(status)
  }

  /** Read the WhatsApp Business profile card (view-only fields). */
  async getBusinessProfile(): Promise<unknown> {
    if (!this.sock) return null
    const me = this.sock.user?.id
    if (!me) return null
    try {
      return (await this.sock.getBusinessProfile(me)) ?? null
    } catch {
      return null
    }
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useDbAuthState(this.options.pool, this.options.number.id)
    this.saveCreds = saveCreds

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      logger: this.logger,
      browser: Browsers.macOS('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      msgRetryCounterCache: this.msgRetryCounterCache,
      getMessage: async (key) => (await this.messageStore.get(key)) ?? undefined,
      cachedGroupMetadata: async (jid) => this.groupCache.get(jid) as GroupMetadata | undefined,
    })
    this.sock = sock

    sock.ev.process(async (events) => {
      if (events['connection.update']) await this.onConnectionUpdate(events['connection.update'])
      if (events['creds.update']) await this.saveCreds?.()
      if (events['messages.upsert']) await this.onMessagesUpsert(events['messages.upsert'])
      if (events['groups.update']) await this.refreshGroups(events['groups.update'])
      if (events['group-participants.update']) {
        await this.refreshGroup(events['group-participants.update'].id)
      }
    })
  }

  private async onConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
    const { connection, lastDisconnect, qr } = update

    if (qr && this.sock) {
      if (this.options.usePairingCode) {
        if (!this.pairingRequested && !this.sock.authState.creds.registered) {
          this.pairingRequested = true
          const phone = this.options.number.phoneE164.replace(/\D/g, '')
          const code = await this.sock.requestPairingCode(phone)
          this.options.onPairingCode?.(code)
        }
      } else {
        this.options.onQr?.(qr)
      }
    }

    if (connection === 'open') {
      this.reconnectDelay = 1_000
      await this.setStatus('linked')
      this.logger.info('connection open')
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        await this.setStatus('logged_out')
        this.stopped = true
        this.logger.warn('logged out; manual re-link required')
        return
      }
      if (!this.stopped) await this.scheduleReconnect()
    }
  }

  private async scheduleReconnect(): Promise<void> {
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
    this.logger.info({ delay }, 'reconnecting')
    await new Promise((resolve) => setTimeout(resolve, delay))
    if (!this.stopped) await this.connect()
  }

  private async onMessagesUpsert(upsert: BaileysEventMap['messages.upsert']): Promise<void> {
    if (upsert.type !== 'notify') return
    for (const message of upsert.messages) {
      await this.messageStore.save(message)
      try {
        await this.onInbound(message)
      } catch (error) {
        this.logger.error({ error }, 'inbound handler failed')
      }
    }
  }

  private async refreshGroups(updates: BaileysEventMap['groups.update']): Promise<void> {
    for (const update of updates) {
      if (update.id) await this.refreshGroup(update.id)
    }
  }

  private async refreshGroup(jid: string): Promise<void> {
    try {
      const metadata = await this.sock?.groupMetadata(jid)
      if (metadata) this.groupCache.set(jid, metadata)
    } catch (error) {
      this.logger.debug({ error, jid }, 'group metadata refresh failed')
    }
  }

  private async setStatus(status: NumberAuthStatus): Promise<void> {
    await this.options.pool.query(
      'update tenant_numbers set auth_status = $1, worker_id = $2, updated_at = now() where id = $3',
      [status, env.WORKER_ID, this.options.number.id],
    )
  }
}
