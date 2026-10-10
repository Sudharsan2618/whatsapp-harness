import OpenAI from 'openai'
import type {
  ChatMessage,
  ChatModel,
  ChatResult,
  CompleteOptions,
  ModelProvider,
  ToolCall,
} from './types'

type Param = OpenAI.Chat.Completions.ChatCompletionMessageParam

function toParam(message: ChatMessage): Param {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId ?? '', content: message.content }
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    }
  }
  return { role: message.role, content: message.content } as Param
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

// Serves both OpenAI and OpenRouter, which share the OpenAI chat API; only the
// base URL and key differ.
export class OpenAiCompatibleModel implements ChatModel {
  readonly supportsTools = true
  private readonly client: OpenAI

  constructor(
    readonly provider: ModelProvider,
    readonly model: string,
    apiKey: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL })
  }

  async complete(messages: ChatMessage[], options?: CompleteOptions): Promise<ChatResult> {
    const tools = options?.tools?.length
      ? options.tools.map((tool) => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }))
      : undefined

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: options?.temperature ?? 0.3,
      messages: messages.map(toParam),
      tools,
    })

    const message = response.choices[0]?.message
    const toolCalls: ToolCall[] | undefined = message?.tool_calls
      ?.filter((call) => call.type === 'function')
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseArgs(call.function.arguments),
      }))

    return {
      text: message?.content ?? '',
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      tokensIn: response.usage?.prompt_tokens,
      tokensOut: response.usage?.completion_tokens,
    }
  }
}
