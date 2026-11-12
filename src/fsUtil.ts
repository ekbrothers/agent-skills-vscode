import { promises as fs } from 'fs';
import * as path from 'path';

/** Workspace-relative POSIX path to an absolute native path. */
export function toAbsolute(root: string, relPosix: string): string {
	return path.join(root, ...relPosix.split('/'));
}

export async function exists(p: string): Promise<boolean> {
	try {
		await fs.lstat(p);
		return true;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}

/**
 * Lists regular files under dir as sorted POSIX paths relative to dir.
 * Symlinks are refused so an item can never write or read outside its folder.
 */
export async function listFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	async function walk(current: string, prefix: string): Promise<void> {
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const e of entries) {
			const rel = prefix ? `${prefix}/${e.name}` : e.name;
			const abs = path.join(current, e.name);
			if (e.isSymbolicLink()) {
				throw new Error(`Symbolic links are not supported: ${abs}`);
			} else if (e.isDirectory()) {
				await walk(abs, rel);
			} else if (e.isFile()) {
				out.push(rel);
			}
		}
	}
	await walk(dir, '');
	return out.sort();
}

/** Writes via a temp file and rename, so readers never see a half-written file. */
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await fs.writeFile(tmp, data, 'utf8');
	try {
		await fs.rename(tmp, filePath);
	} catch (err) {
		await fs.rm(tmp, { force: true });
		throw err;
	}
}
