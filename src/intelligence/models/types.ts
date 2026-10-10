import type { ModelProvider } from '../../config/schema'

export type { ModelProvider }

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export interface CompleteOptions {
  temperature?: number
  tools?: ToolSpec[]
}

export interface ChatResult {
  text: string
  toolCalls?: ToolCall[]
  tokensIn?: number
  tokensOut?: number
}

/** Provider-agnostic chat model. Implementations wrap one vendor SDK. */
export interface ChatModel {
  readonly provider: ModelProvider
  readonly model: string
  readonly supportsTools: boolean
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<ChatResult>
}
