import type { ToolSet } from 'ai'
import { builtinTools } from './built-in'

/**
 * Builtin tools are always registered (file I/O, shell, etc.)
 * MCP tools are dynamic and replaced on each MCP host (re)initialization.
 */
const mcpTools: ToolSet = {}

/** Unified tool registry consumed by the AI SDK — builtin + MCP tools merged. */
export const allTools: ToolSet = { ...builtinTools }

export function replaceMcpTools(nextMcpTools: ToolSet): void {
	// Remove all previously registered MCP tools
	for (const key of Object.keys(mcpTools)) {
		delete mcpTools[key]
		delete allTools[key]
	}

	// Register new MCP tools
	Object.assign(mcpTools, nextMcpTools)
	Object.assign(allTools, mcpTools)
}

