import { assertValidItemId, LibraryItem, PathStrategy, ToolAdapter, ToolId } from './types';

/** Every tool reads this location, so the shared strategy writes here once. */
export const SHARED_SKILLS_DIR = '.claude/skills';

function makeAdapter(tool: ToolId, dedicatedDir: string, label: string): ToolAdapter {
	return {
		tool,
		resolvePath(itemId: string, strategy: PathStrategy): string {
			assertValidItemId(itemId);
			const base = strategy === 'dedicated' ? dedicatedDir : SHARED_SKILLS_DIR;
			return `${base}/${itemId}`;
		},
		transform(item: LibraryItem): LibraryItem {
			return item;
		},
		describe(): string {
			return `${label} (shared: ${SHARED_SKILLS_DIR}, dedicated: ${dedicatedDir})`;
		},
	};
}

export const claudeAdapter = makeAdapter('claude', '.claude/skills', 'Claude Code');
export const copilotAdapter = makeAdapter('copilot', '.github/skills', 'GitHub Copilot');
export const cortexAdapter = makeAdapter('cortex', '.cortex/skills', 'Cortex Code');

export const ADAPTERS: Record<ToolId, ToolAdapter> = {
	claude: claudeAdapter,
	copilot: copilotAdapter,
	cortex: cortexAdapter,
};
