import type { ChatMessage, ChatModel, ChatResult } from './types'

// No-op model: echoes the last user message. Lets the whole pipeline run
// without any provider key configured.
export class EchoModel implements ChatModel {
  readonly provider = 'echo' as const
  readonly model = 'echo'
  readonly supportsTools = false

  async complete(messages: ChatMessage[]): Promise<ChatResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    return { text: lastUser?.content ?? '' }
  }
}
