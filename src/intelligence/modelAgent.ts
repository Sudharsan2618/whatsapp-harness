import type { Pool } from 'pg'
import type { ModelSpec } from '../config/schema'
import type { AgentAdapter, AgentReply, InboundMessage } from './adapter'
import { createModel } from './models/factory'
import type { ChatMessage, ChatModel, ToolSpec } from './models/types'
import { buildSystemPrompt } from './prompt'
import { toolRegistry } from './tools'
import type { OutboundMessage, ToolContext } from './tools/types'

const MAX_TOOL_ITERATIONS = 3

/**
 * Config-driven agent. Runs a tool-calling loop: the model may answer directly,
 * or call enabled tools (which the orchestration executes) before answering.
 * Provider, model, persona, guardrails, tools, history, and knowledge all come
 * from the request, so one instance serves every tenant.
 */
export class ModelAgent implements AgentAdapter {
  readonly name = 'model'
  private readonly models = new Map<string, ChatModel>()

  constructor(private readonly pool: Pool) {}

  async handle(message: InboundMessage): Promise<AgentReply> {
    const spec = message.config.model
    const model = this.getModel(spec)

    const tools = toolRegistry.enabledFor(message.config)
    const toolSpecs: ToolSpec[] = tools.map((tool) => ({
      name: tool.key,
      description: tool.description,
      parameters: tool.parameters,
    }))
    const useTools = model.supportsTools && toolSpecs.length > 0

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(message.config, tools, message.knowledge, message.links) },
      ...message.history,
      { role: 'user', content: message.text },
    ]

    const outbox: OutboundMessage[] = []
    const context: ToolContext = {
      tenantId: message.tenantId,
      chatJid: message.chatJid,
      customerJid: message.customerJid,
      pool: this.pool,
      config: message.config,
      outbox,
    }

    const toolsCalled: string[] = []
    let tokensIn = 0
    let tokensOut = 0

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const result = await model.complete(messages, {
        temperature: spec.temperature,
        tools: useTools ? toolSpecs : undefined,
      })
      tokensIn += result.tokensIn ?? 0
      tokensOut += result.tokensOut ?? 0

      if (!result.toolCalls?.length) {
        return {
          text: result.text,
          tokensIn,
          tokensOut,
          provider: model.provider,
          model: model.model,
          toolsCalled,
          outbox,
        }
      }

      messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls })
      for (const call of result.toolCalls) {
        toolsCalled.push(call.name)
        const tool = toolRegistry.get(call.name)
        const output = tool
          ? await tool.run(call.arguments, context)
          : { ok: false, message: `unknown tool: ${call.name}` }
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify(output),
        })
      }
    }

    // Tool budget exhausted: ask once more for a plain answer.
    const final = await model.complete(messages, { temperature: spec.temperature })
    return {
      text: final.text,
      tokensIn: tokensIn + (final.tokensIn ?? 0),
      tokensOut: tokensOut + (final.tokensOut ?? 0),
      provider: model.provider,
      model: model.model,
      toolsCalled,
      outbox,
    }
  }

  private getModel(spec: ModelSpec): ChatModel {
    const key = `${spec.provider}:${spec.model}`
    let model = this.models.get(key)
    if (!model) {
      model = createModel(spec)
      this.models.set(key, model)
    }
    return model
  }
}
