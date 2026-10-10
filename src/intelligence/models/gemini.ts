import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, ChatModel, ChatResult, CompleteOptions } from './types'

export class GeminiModel implements ChatModel {
  readonly provider = 'gemini' as const
  readonly supportsTools = false
  private readonly client: GoogleGenerativeAI

  constructor(
    readonly model: string,
    apiKey: string,
  ) {
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async complete(messages: ChatMessage[], options?: CompleteOptions): Promise<ChatResult> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: system || undefined,
    })

    const contents = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const result = await model.generateContent({
      contents,
      generationConfig: { temperature: options?.temperature ?? 0.3 },
    })

    const usage = result.response.usageMetadata
    return {
      text: result.response.text(),
      tokensIn: usage?.promptTokenCount,
      tokensOut: usage?.candidatesTokenCount,
    }
  }
}
