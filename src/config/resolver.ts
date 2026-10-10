import { tenantConfigSchema, type ResolvedTenantConfig } from './schema'

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function deepMerge(base: Json, override: Json): Json {
  const result: Json = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const current = result[key]
    result[key] = isObject(current) && isObject(value) ? deepMerge(current, value) : value
  }
  return result
}

/**
 * Resolve the effective config for a tenant by merging layers in order of
 * increasing specificity: platform defaults, then the vertical pack, then the
 * tenant's own overrides. Later layers win.
 */
export function resolveTenantConfig(layers: Array<Json | null | undefined>): ResolvedTenantConfig {
  const merged = layers.reduce<Json>((acc, layer) => deepMerge(acc, layer ?? {}), {})
  return tenantConfigSchema.parse(merged)
}
