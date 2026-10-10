import type { ResolvedTenantConfig } from '../config/schema'
import type { OutboundMessage } from './tools/types'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface InboundMessage {
  tenantId: string
  chatJid: string
  customerJid: string
  text: string
  config: ResolvedTenantConfig
  history: ConversationTurn[]
  knowledge: string[]
  links?: string[]
}

export interface AgentReply {
  text: string
  tokensIn?: number
  tokensOut?: number
  provider?: string
  model?: string
  toolsCalled?: string[]
  outbox?: OutboundMessage[]
}

/**
 * The seam between the transport and any model or agent. The orchestration
 * layer only ever calls handle(); it never imports a model SDK directly, which
 * keeps the WhatsApp engine swappable.
 */
export interface AgentAdapter {
  readonly name: string
  handle(message: InboundMessage): Promise<AgentReply>
}
