import type { ToolSet } from 'ai'

/**
 * Runtime tool registry consumed by AI SDK.
 * MCP host will hydrate this object during app startup.
 */
export const allTools: ToolSet = {}

export function replaceAllTools(nextTools: ToolSet): void {
	for (const key of Object.keys(allTools)) {
		delete allTools[key]
	}

	Object.assign(allTools, nextTools)
}
