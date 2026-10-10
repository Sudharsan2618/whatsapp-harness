import type { ResolvedTenantConfig } from '../../config/schema'
import type { Tool } from './types'

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.key, tool)
  }

  get(key: string): Tool | undefined {
    return this.tools.get(key)
  }

  /** The tools a tenant has enabled, in config order. Unknown keys are skipped. */
  enabledFor(config: ResolvedTenantConfig): Tool[] {
    return config.tools
      .map((key) => this.tools.get(key))
      .filter((tool): tool is Tool => Boolean(tool))
  }
}
