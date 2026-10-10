import type { Pool } from 'pg'
import type { ResolvedTenantConfig } from '../../config/schema'

export type OutboundMessage =
  | { kind: 'text'; text: string }
  | { kind: 'image'; url: string; caption?: string }
  | { kind: 'document'; url: string; fileName?: string; mimetype?: string }
  | { kind: 'location'; latitude: number; longitude: number; name?: string }

export interface ToolContext {
  tenantId: string
  chatJid: string
  customerJid: string
  pool: Pool
  config: ResolvedTenantConfig
  // Rich messages a tool wants sent to the customer after the text reply.
  outbox: OutboundMessage[]
}

export interface ToolResult {
  ok: boolean
  message?: string
  data?: unknown
}

/** A capability a tenant can enable. `parameters` is a JSON Schema for the args. */
export interface Tool {
  readonly key: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  run(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>
}
