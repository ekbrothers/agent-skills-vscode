import * as assert from 'assert';
import { gzipSync } from 'zlib';
import { readTarGz, safeEntryPath } from '../../archive';

/** Minimal ustar writer for tests. Same layout as the content repo's build. */
function header(name: string, size: number, type = '0', prefix = ''): Buffer {
	const h = Buffer.alloc(512);
	h.write(name, 0, 'utf8');
	h.write('0000644\0', 100);
	h.write('0000000\0', 108);
	h.write('0000000\0', 116);
	h.write(size.toString(8).padStart(11, '0') + '\0', 124);
	h.write('00000000000\0', 136);
	h.fill(0x20, 148, 156);
	h.write(type, 156);
	h.write('ustar\0', 257);
	h.write('00', 263);
	h.write(prefix, 345, 'utf8');
	let sum = 0;
	for (const b of h) {
		sum += b;
	}
	h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
	return h;
}

function tarGz(entries: { name: string; data?: string; type?: string; prefix?: string }[]): Buffer {
	const parts: Buffer[] = [];
	for (const e of entries) {
		const data = Buffer.from(e.data ?? '');
		parts.push(header(e.name, data.length, e.type, e.prefix), data, Buffer.alloc((512 - (data.length % 512)) % 512));
	}
	parts.push(Buffer.alloc(1024));
	return gzipSync(Buffer.concat(parts));
}

suite('archive', () => {
	test('reads files and skips directory entries', () => {
		const files = readTarGz(
			tarGz([{ name: 'SKILL.md', data: 'hello' }, { name: 'templates/', type: '5' }, { name: 'templates/t.md', data: 'x'.repeat(700) }]),
		);
		assert.deepStrictEqual([...files.keys()], ['SKILL.md', 'templates/t.md']);
		assert.strictEqual(files.get('SKILL.md')!.toString(), 'hello');
		assert.strictEqual(files.get('templates/t.md')!.length, 700);
	});

	test('joins the ustar prefix field', () => {
		const files = readTarGz(tarGz([{ name: 'file.md', data: 'a', prefix: 'deep/dir' }]));
		assert.deepStrictEqual([...files.keys()], ['deep/dir/file.md']);
	});

	test('refuses path traversal and absolute paths', () => {
		for (const name of ['../evil', 'a/../../evil', '/etc/passwd', 'C:/x', 'a\\b', './a', 'a//b']) {
			assert.throws(() => readTarGz(tarGz([{ name, data: 'x' }])), /unsafe path/, name);
		}
	});

	test('refuses symlinks and other entry types', () => {
		assert.throws(() => readTarGz(tarGz([{ name: 'link', type: '2' }])), /unsupported type/);
		assert.throws(() => readTarGz(tarGz([{ name: 'pax', type: 'x', data: 'k=v' }])), /unsupported type/);
	});

	test('refuses duplicates, bad checksums, truncation and non-gzip data', () => {
		assert.throws(() => readTarGz(tarGz([{ name: 'a', data: '1' }, { name: 'a', data: '2' }])), /duplicate/);
		const raw = Buffer.concat([header('a', 1), Buffer.from('x'), Buffer.alloc(511), Buffer.alloc(1024)]);
		raw[0] = 'b'.charCodeAt(0);
		assert.throws(() => readTarGz(gzipSync(raw)), /checksum/);
		assert.throws(() => readTarGz(gzipSync(header('a', 5000))), /truncated/);
		assert.throws(() => readTarGz(Buffer.from('not gzip')), /gzip/);
	});

	test('safeEntryPath strips a trailing slash', () => {
		assert.strictEqual(safeEntryPath('dir/'), 'dir');
	});
});
