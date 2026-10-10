import { builtinTools } from './builtin'
import { ToolRegistry } from './registry'

export const toolRegistry = new ToolRegistry()
for (const tool of builtinTools) toolRegistry.register(tool)

export { ToolRegistry } from './registry'
export type { Tool, ToolContext } from './types'
