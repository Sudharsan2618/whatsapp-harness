import { z } from 'zod'

export const personaSchema = z.object({
  botName: z.string().default('Assistant'),
  languages: z.array(z.string()).default(['en']),
  tone: z.string().default('friendly, concise'),
  businessHours: z.string().optional(),
  systemPromptExtra: z.string().optional(),
})

export const guardrailsSchema = z.object({
  mustRefuse: z.array(z.string()).default([]),
  disclaimers: z.array(z.string()).default([]),
  escalateWhen: z.array(z.string()).default([]),
})

export const retrievalSchema = z.object({
  topK: z.number().int().positive().default(5),
  minConfidence: z.number().min(0).max(1).default(0.35),
})

export const modelProviders = ['echo', 'anthropic', 'openai', 'gemini', 'openrouter'] as const

export const modelSchema = z.object({
  provider: z.enum(modelProviders).default('echo'),
  model: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.3),
})

export const paymentSchema = z.object({
  // 'razorpay' creates real links via API; 'link' shares the tenant's own hosted
  // checkout page (pageUrl); 'none' disables payment links entirely.
  provider: z.enum(['none', 'razorpay', 'link']).default('none'),
  keyId: z.string().optional(),
  keySecret: z.string().optional(),
  pageUrl: z.string().optional(),
})

export const integrationsSchema = z.object({
  calendlyUrl: z.string().optional(),
  payment: paymentSchema.optional(),
  socials: z.record(z.string()).default({}),
})

export const tenantConfigSchema = z.object({
  persona: personaSchema.default({}),
  guardrails: guardrailsSchema.default({}),
  tools: z.array(z.string()).default([]),
  model: modelSchema.default({}),
  retrieval: retrievalSchema.default({}),
  integrations: integrationsSchema.default({}),
  workflows: z.record(z.unknown()).default({}),
})

export type Persona = z.infer<typeof personaSchema>
export type Guardrails = z.infer<typeof guardrailsSchema>
export type ModelProvider = (typeof modelProviders)[number]
export type ModelSpec = z.infer<typeof modelSchema>
export type ResolvedTenantConfig = z.infer<typeof tenantConfigSchema>
