import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ChatModel, ChatResult, CompleteOptions } from './types'

export class AnthropicModel implements ChatModel {
  readonly provider = 'anthropic' as const
  readonly supportsTools = false
  private readonly client: Anthropic

  constructor(
    readonly model: string,
    apiKey: string,
  ) {
    this.client = new Anthropic({ apiKey })
  }

  async complete(messages: ChatMessage[], options?: CompleteOptions): Promise<ChatResult> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const turns = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: options?.temperature ?? 0.3,
      system: system || undefined,
      messages: turns,
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return {
      text,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    }
  }
}
