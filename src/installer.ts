import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exists, listFiles, toAbsolute } from './fsUtil';
import { sha256, sha256File } from './hash';
import { LockFile } from './lockFile';
import { assertValidItemId, LibraryItem, ResolvedTarget } from './targets';

/** Staging area. Inside the workspace so renames stay on one volume, and outside every skills folder. */
export const STAGING_DIR = '.vscode/.prompt-library-tmp';

/**
 * absent: nothing on disk.
 * clean: matches the lock file exactly.
 * modified: recorded in the lock file, but files were changed, removed or added.
 * unmanaged: a folder exists that the lock file does not know about.
 */
export type TargetState = 'absent' | 'clean' | 'modified' | 'unmanaged';

export interface TargetCheck {
	dir: string;
	state: TargetState;
}

export interface InstallResult {
	itemId: string;
	version: string;
	/** Workspace-relative POSIX path to sha256, ready for the lock file. */
	files: Record<string, string>;
}

export async function checkTargets(
	workspaceRoot: string,
	itemId: string,
	targets: readonly ResolvedTarget[],
	lock: LockFile,
): Promise<TargetCheck[]> {
	const locked = lock.items[itemId]?.files ?? {};
	const results: TargetCheck[] = [];
	for (const t of targets) {
		const absDir = toAbsolute(workspaceRoot, t.dir);
		if (!(await exists(absDir))) {
			results.push({ dir: t.dir, state: 'absent' });
			continue;
		}
		const prefix = `${t.dir}/`;
		const expected = Object.entries(locked).filter(([f]) => f.startsWith(prefix));
		if (expected.length === 0) {
			results.push({ dir: t.dir, state: 'unmanaged' });
			continue;
		}
		const onDisk = (await listFiles(absDir)).map((f) => prefix + f);
		let clean = onDisk.length === expected.length;
		for (const [file, hash] of expected) {
			if (!clean) {
				break;
			}
			const abs = toAbsolute(workspaceRoot, file);
			clean = (await exists(abs)) && (await sha256File(abs)) === hash;
		}
		results.push({ dir: t.dir, state: clean ? 'clean' : 'modified' });
	}
	return results;
}

interface StagedTarget {
	stageDir: string;
	backupDir: string;
	dest: string;
}

/**
 * Copies the item into every target directory.
 * Phase 1 stages a full copy per target. Phase 2 swaps each staged copy into
 * place with renames. If any swap fails, every completed swap is rolled back,
 * so the workspace ends up either fully updated or unchanged.
 */
export interface InstallItemOptions {
	/**
	 * Write files without write permission (0444, or 0555 under scripts/).
	 * Library skills are managed: local edits are not supported. Default true.
	 */
	readOnly?: boolean;
}

export async function installItem(
	workspaceRoot: string,
	item: LibraryItem,
	targets: readonly ResolvedTarget[],
	options: InstallItemOptions = {},
): Promise<InstallResult> {
	const readOnly = options.readOnly ?? true;
	assertValidItemId(item.id);
	if (targets.length === 0) {
		throw new Error('No install targets. Check the promptLibrary.tools setting.');
	}
	const sourceFiles = await listFiles(item.sourceDir);
	if (!sourceFiles.includes('SKILL.md')) {
		throw new Error(`Item "${item.id}" has no SKILL.md at its root.`);
	}
	const contents = new Map<string, Buffer>();
	for (const f of sourceFiles) {
		contents.set(f, await fs.readFile(path.join(item.sourceDir, ...f.split('/'))));
	}

	const stagingRoot = toAbsolute(workspaceRoot, STAGING_DIR);
	const runId = `${item.id}-${randomBytes(4).toString('hex')}`;
	const staged: StagedTarget[] = [];
	const files: Record<string, string> = {};

	try {
		// Phase 1: stage.
		for (const [i, target] of targets.entries()) {
			const stageDir = path.join(stagingRoot, `${runId}-${i}`);
			staged.push({
				stageDir,
				backupDir: path.join(stagingRoot, `${runId}-${i}.old`),
				dest: toAbsolute(workspaceRoot, target.dir),
			});
			for (const [rel, data] of contents) {
				const abs = path.join(stageDir, ...rel.split('/'));
				await fs.mkdir(path.dirname(abs), { recursive: true });
				await fs.writeFile(abs, data);
				if (readOnly) {
					await fs.chmod(abs, rel.startsWith('scripts/') ? 0o555 : 0o444);
				}
				files[`${target.dir}/${rel}`] = sha256(data);
			}
		}

		// Phase 2: swap.
		const swapped: StagedTarget[] = [];
		try {
			for (const s of staged) {
				await swapIntoPlace(s);
				swapped.push(s);
			}
		} catch (err) {
			for (const s of swapped.reverse()) {
				await fs.rm(s.dest, { recursive: true, force: true });
				if (await exists(s.backupDir)) {
					await fs.rename(s.backupDir, s.dest);
				}
			}
			throw err;
		}
	} finally {
		for (const s of staged) {
			await fs.rm(s.stageDir, { recursive: true, force: true });
			await fs.rm(s.backupDir, { recursive: true, force: true });
		}
		await removeIfEmpty(stagingRoot);
	}

	return { itemId: item.id, version: item.version, files };
}

/** Renaming onto an existing directory fails on Windows, so move the old one aside first. */
async function swapIntoPlace(s: StagedTarget): Promise<void> {
	await fs.mkdir(path.dirname(s.dest), { recursive: true });
	if (await exists(s.dest)) {
		await fs.rename(s.dest, s.backupDir);
	}
	try {
		await fs.rename(s.stageDir, s.dest);
	} catch (err) {
		if (await exists(s.backupDir)) {
			await fs.rename(s.backupDir, s.dest);
		}
		throw err;
	}
}

async function removeIfEmpty(dir: string): Promise<void> {
	try {
		await fs.rmdir(dir);
	} catch {
		// Not empty or already gone.
	}
}
