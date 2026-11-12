import { isValidItemId, TOOL_IDS, ToolId } from './targets';

export const SUPPORTED_INDEX_SCHEMA = 1;

export interface IndexVersion {
	archive: string;
	sha256: string;
	contentHash?: string;
	hasScripts: boolean;
}

export interface IndexItem {
	id: string;
	type: 'skill';
	title: string;
	description: string;
	latest: string;
	versions: Record<string, IndexVersion>;
	tools: ToolId[];
}

export interface LibraryIndex {
	schemaVersion: number;
	generatedAt: string;
	items: IndexItem[];
}

export interface ParsedIndex {
	index: LibraryIndex;
	/** Items skipped as invalid, with the reason. The rest of the index still loads. */
	skipped: string[];
}

const SHA256 = /^[0-9a-f]{64}$/;

/** Compares MAJOR.MINOR.PATCH strings. Missing or non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
	const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x !== y) {
			return x < y ? -1 : 1;
		}
	}
	return 0;
}

function str(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

function checkItem(raw: unknown): IndexItem | string {
	const it = raw as Partial<IndexItem> | null;
	if (!it || typeof it !== 'object') {
		return 'not an object';
	}
	if (!str(it.id) || !isValidItemId(it.id)) {
		return `invalid id ${JSON.stringify(it.id)}`;
	}
	if (it.type !== 'skill') {
		return `${it.id}: unsupported type ${JSON.stringify(it.type)}`;
	}
	if (!str(it.title) || typeof it.description !== 'string' || !str(it.latest)) {
		return `${it.id}: missing title, description or latest`;
	}
	const v = it.versions?.[it.latest];
	if (!v || !str(v.archive) || v.archive.includes('/') || !str(v.sha256) || !SHA256.test(v.sha256)) {
		return `${it.id}: latest version ${it.latest} has no valid archive and sha256`;
	}
	const tools = Array.isArray(it.tools) ? it.tools.filter((t): t is ToolId => (TOOL_IDS as readonly string[]).includes(t)) : [...TOOL_IDS];
	return {
		id: it.id,
		type: 'skill',
		title: it.title,
		description: it.description,
		latest: it.latest,
		versions: { [it.latest]: { archive: v.archive, sha256: v.sha256, contentHash: v.contentHash, hasScripts: v.hasScripts === true } },
		tools,
	};
}

export function parseIndex(text: string): ParsedIndex {
	let data: Partial<LibraryIndex>;
	try {
		data = JSON.parse(text);
	} catch (err) {
		throw new Error(`index.json is not valid JSON: ${(err as Error).message}`);
	}
	if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
		throw new Error('index.json has no "items" array.');
	}
	if (data.schemaVersion !== SUPPORTED_INDEX_SCHEMA) {
		throw new Error(
			`index.json uses schemaVersion ${String(data.schemaVersion)}; this extension reads ${SUPPORTED_INDEX_SCHEMA}. Update the extension.`,
		);
	}
	const items: IndexItem[] = [];
	const skipped: string[] = [];
	const seen = new Set<string>();
	for (const raw of data.items) {
		const r = checkItem(raw);
		if (typeof r === 'string') {
			skipped.push(r);
		} else if (seen.has(r.id)) {
			skipped.push(`${r.id}: duplicate id`);
		} else {
			seen.add(r.id);
			items.push(r);
		}
	}
	items.sort((a, b) => a.title.localeCompare(b.title));
	return { index: { schemaVersion: data.schemaVersion, generatedAt: String(data.generatedAt ?? ''), items }, skipped };
}
