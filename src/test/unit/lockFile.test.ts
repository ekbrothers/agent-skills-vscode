import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	emptyLockFile,
	LOCK_FILE_PATH,
	parseLockFile,
	readLockFile,
	serializeLockFile,
	withItem,
	writeLockFile,
} from '../../lockFile';

suite('lockFile', () => {
	let root: string;

	setup(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-lock-'));
	});

	teardown(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	test('missing lock file reads as empty', async () => {
		assert.deepStrictEqual(await readLockFile(root), emptyLockFile());
	});

	test('round trip through disk', async () => {
		const lock = withItem(emptyLockFile(), 'a', { version: '1.0.0', files: { '.claude/skills/a/SKILL.md': 'abc' } });
		await writeLockFile(root, lock);
		assert.deepStrictEqual(await readLockFile(root), lock);
		const leftovers = (await fs.readdir(path.join(root, '.vscode'))).filter((f) => f.endsWith('.tmp'));
		assert.deepStrictEqual(leftovers, []);
	});

	test('serialization is sorted and stable', () => {
		const lock = {
			schemaVersion: 1,
			items: {
				zeta: { version: '1', files: { 'b': '2', 'a': '1' } },
				alpha: { version: '1', files: {} },
			},
		};
		const text = serializeLockFile(lock);
		assert.ok(text.indexOf('"alpha"') < text.indexOf('"zeta"'));
		assert.ok(text.indexOf('"a"') < text.indexOf('"b"'));
		assert.ok(text.endsWith('}\n'));
		assert.strictEqual(serializeLockFile(parseLockFile(text)), text);
	});

	test('rejects bad JSON, wrong schema and malformed entries', () => {
		assert.throws(() => parseLockFile('{'), /not valid JSON/);
		assert.throws(() => parseLockFile('{"schemaVersion":2,"items":{}}'), /schemaVersion 2/);
		assert.throws(() => parseLockFile('{"schemaVersion":1}'), /items/);
		assert.throws(() => parseLockFile('{"schemaVersion":1,"items":{"a":{"version":1,"files":{}}}}'), /malformed/);
	});

	test('a corrupt lock file on disk is reported, not replaced', async () => {
		await fs.mkdir(path.join(root, '.vscode'));
		await fs.writeFile(path.join(root, ...LOCK_FILE_PATH.split('/')), 'garbage');
		await assert.rejects(readLockFile(root), /not valid JSON/);
	});
});
