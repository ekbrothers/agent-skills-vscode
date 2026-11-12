export const TOOL_IDS = ['claude', 'copilot', 'cortex'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export type PathStrategy = 'shared' | 'dedicated';

/** Minimal description of a library item. Grows in Stage 3 when index.json arrives. */
export interface LibraryItem {
	id: string;
	version: string;
	/** Absolute path to a directory holding the item's files, ready to install. */
	sourceDir: string;
}

export interface ToolAdapter {
	readonly tool: ToolId;
	/** Workspace-relative POSIX directory the item is installed into. */
	resolvePath(itemId: string, strategy: PathStrategy): string;
	/** Identity for skills in v1. */
	transform(item: LibraryItem): LibraryItem;
	describe(): string;
}

/**
 * Agent Skills naming rule as enforced by VS Code: lowercase letters, digits
 * and hyphens, 1 to 64 characters, and the name must match the folder.
 * Also rules out path traversal, since "/", "\" and "." are not allowed.
 */
const ITEM_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidItemId(id: string): boolean {
	return id.length <= 64 && ITEM_ID.test(id);
}

export function assertValidItemId(id: string): void {
	if (!isValidItemId(id)) {
		throw new Error(`Invalid item id "${id}". Use lowercase letters, digits and single hyphens, up to 64 characters.`);
	}
}
