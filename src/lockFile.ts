import { promises as fs } from 'fs';
import { toAbsolute, writeFileAtomic } from './fsUtil';

export const LOCK_FILE_PATH = '.vscode/prompt-library.lock.json';
export const LOCK_SCHEMA_VERSION = 1;

export interface LockedItem {
	version: string;
	/** Workspace-relative POSIX path to sha256 of the file as written. */
	files: Record<string, string>;
}

export interface LockFile {
	schemaVersion: number;
	items: Record<string, LockedItem>;
}

export function emptyLockFile(): LockFile {
	return { schemaVersion: LOCK_SCHEMA_VERSION, items: {} };
}

export function parseLockFile(text: string): LockFile {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (err) {
		throw new Error(`${LOCK_FILE_PATH} is not valid JSON: ${(err as Error).message}`);
	}
	const obj = data as Partial<LockFile> | null;
	if (!obj || typeof obj !== 'object' || typeof obj.items !== 'object' || obj.items === null) {
		throw new Error(`${LOCK_FILE_PATH} is missing the "items" object.`);
	}
	if (obj.schemaVersion !== LOCK_SCHEMA_VERSION) {
		throw new Error(
			`${LOCK_FILE_PATH} has schemaVersion ${String(obj.schemaVersion)}; this extension supports ${LOCK_SCHEMA_VERSION}.`,
		);
	}
	for (const [id, item] of Object.entries(obj.items)) {
		if (!item || typeof item.version !== 'string' || typeof item.files !== 'object' || item.files === null) {
			throw new Error(`${LOCK_FILE_PATH}: entry "${id}" is malformed.`);
		}
	}
	return obj as LockFile;
}

/** Stable output: sorted item ids and file paths, two-space indent, trailing newline. */
export function serializeLockFile(lock: LockFile): string {
	const items: Record<string, LockedItem> = {};
	for (const id of Object.keys(lock.items).sort()) {
		const item = lock.items[id];
		const files: Record<string, string> = {};
		for (const f of Object.keys(item.files).sort()) {
			files[f] = item.files[f];
		}
		items[id] = { version: item.version, files };
	}
	return JSON.stringify({ schemaVersion: lock.schemaVersion, items }, null, 2) + '\n';
}

/** Returns an empty lock file when none exists yet. */
export async function readLockFile(workspaceRoot: string): Promise<LockFile> {
	let text: string;
	try {
		text = await fs.readFile(toAbsolute(workspaceRoot, LOCK_FILE_PATH), 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return emptyLockFile();
		}
		throw err;
	}
	return parseLockFile(text);
}

export async function writeLockFile(workspaceRoot: string, lock: LockFile): Promise<void> {
	await writeFileAtomic(toAbsolute(workspaceRoot, LOCK_FILE_PATH), serializeLockFile(lock));
}

export function withItem(lock: LockFile, id: string, item: LockedItem): LockFile {
	return { ...lock, items: { ...lock.items, [id]: item } };
}
