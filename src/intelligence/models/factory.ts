import { env } from '../../config/env'
import type { ModelProvider, ModelSpec } from '../../config/schema'
import { AnthropicModel } from './anthropic'
import { EchoModel } from './echo'
import { GeminiModel } from './gemini'
import { OpenAiCompatibleModel } from './openaiCompatible'
import type { ChatModel } from './types'

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  echo: 'echo',
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-6-luna',
  gemini: 'gemini-3.8-flash',
  openrouter: 'openai/gpt-6-luna',
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

function requireKey(provider: ModelProvider, key: string | undefined): string {
  if (!key) throw new Error(`Missing API key for provider "${provider}"`)
  return key
}

export function createModel(spec: ModelSpec): ChatModel {
  const model = spec.model || DEFAULT_MODELS[spec.provider]
  switch (spec.provider) {
    case 'echo':
      return new EchoModel()
    case 'anthropic':
      return new AnthropicModel(model, requireKey('anthropic', env.ANTHROPIC_API_KEY))
    case 'openai':
      return new OpenAiCompatibleModel('openai', model, requireKey('openai', env.OPENAI_API_KEY))
    case 'openrouter':
      return new OpenAiCompatibleModel(
        'openrouter',
        model,
        requireKey('openrouter', env.OPENROUTER_API_KEY),
        OPENROUTER_BASE_URL,
      )
    case 'gemini':
      return new GeminiModel(model, requireKey('gemini', env.GEMINI_API_KEY))
  }
}
