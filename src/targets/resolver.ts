import { ADAPTERS } from './adapters';
import { PathStrategy, TOOL_IDS, ToolId } from './types';

export interface ResolvedTarget {
	/** Workspace-relative POSIX directory. */
	dir: string;
	/** Tools that read this directory. */
	tools: ToolId[];
}

/** Drops unknown and repeated tool ids, keeps the order given. */
export function normalizeTools(tools: readonly string[] | undefined): ToolId[] {
	const known = new Set<string>(TOOL_IDS);
	const result: ToolId[] = [];
	for (const t of tools ?? []) {
		if (known.has(t) && !result.includes(t as ToolId)) {
			result.push(t as ToolId);
		}
	}
	return result;
}

/**
 * Resolves the directories an item is written to. Paths are deduplicated,
 * so with the shared strategy all three tools collapse to one directory.
 */
export function resolveTargets(itemId: string, tools: readonly ToolId[], strategy: PathStrategy): ResolvedTarget[] {
	const byDir = new Map<string, ToolId[]>();
	for (const tool of tools) {
		const dir = ADAPTERS[tool].resolvePath(itemId, strategy);
		const list = byDir.get(dir) ?? [];
		list.push(tool);
		byDir.set(dir, list);
	}
	return [...byDir.entries()].map(([dir, t]) => ({ dir, tools: t }));
}
