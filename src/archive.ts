import { promises as fs } from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';

export const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;
export const MAX_ENTRIES = 2000;

function readString(buf: Buffer, offset: number, length: number): string {
	const slice = buf.subarray(offset, offset + length);
	const nul = slice.indexOf(0);
	return slice.subarray(0, nul === -1 ? length : nul).toString('utf8');
}

function readOctal(buf: Buffer, offset: number, length: number): number {
	const text = readString(buf, offset, length).trim();
	if (!/^[0-7]*$/.test(text)) {
		throw new Error('archive header has a malformed number field');
	}
	return text ? parseInt(text, 8) : 0;
}

function checksumOk(header: Buffer): boolean {
	const stored = readOctal(header, 148, 8);
	let sum = 0;
	for (let i = 0; i < 512; i++) {
		sum += i >= 148 && i < 156 ? 0x20 : header[i];
	}
	return sum === stored;
}

/** Rejects absolute paths, drive letters, backslashes and any "." or ".." segment. */
export function safeEntryPath(name: string): string {
	const trimmed = name.replace(/\/+$/, '');
	const parts = trimmed.split('/');
	if (
		trimmed === '' ||
		trimmed.startsWith('/') ||
		trimmed.includes('\\') ||
		trimmed.includes(':') ||
		parts.some((p) => p === '' || p === '.' || p === '..')
	) {
		throw new Error(`archive entry has an unsafe path: ${JSON.stringify(name)}`);
	}
	return trimmed;
}

/**
 * Reads a gzipped ustar archive into memory. Accepts regular files and
 * directories only; links, devices and pax extensions are refused.
 */
export function readTarGz(data: Buffer): Map<string, Buffer> {
	let tar: Buffer;
	try {
		tar = gunzipSync(data, { maxOutputLength: MAX_UNPACKED_BYTES });
	} catch (err) {
		throw new Error(`archive is not valid gzip or is too large: ${(err as Error).message}`);
	}
	const files = new Map<string, Buffer>();
	let offset = 0;
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((b) => b === 0)) {
			break;
		}
		if (!checksumOk(header)) {
			throw new Error('archive header checksum mismatch');
		}
		const name = readString(header, 0, 100);
		const prefix = readString(header, 345, 155);
		const size = readOctal(header, 124, 12);
		const type = String.fromCharCode(header[156] || 0x30);
		offset += 512;
		if (offset + size > tar.length) {
			throw new Error('archive is truncated');
		}
		const full = safeEntryPath(prefix ? `${prefix}/${name}` : name);
		if (type === '0') {
			if (files.has(full)) {
				throw new Error(`archive has a duplicate entry: ${full}`);
			}
			files.set(full, Buffer.from(tar.subarray(offset, offset + size)));
			if (files.size > MAX_ENTRIES) {
				throw new Error('archive has too many entries');
			}
		} else if (type !== '5') {
			throw new Error(`archive entry ${full} has unsupported type "${type}"`);
		}
		offset += Math.ceil(size / 512) * 512;
	}
	return files;
}

export async function writeTree(files: Map<string, Buffer>, dir: string): Promise<void> {
	for (const [rel, data] of files) {
		const abs = path.join(dir, ...safeEntryPath(rel).split('/'));
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, data);
	}
}
