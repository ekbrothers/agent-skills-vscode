import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exists } from '../../fsUtil';
import { sha256 } from '../../hash';
import { checkTargets, installItem, STAGING_DIR } from '../../installer';
import { emptyLockFile, LockFile, withItem } from '../../lockFile';
import { LibraryItem, resolveTargets } from '../../targets';

async function write(root: string, rel: string, data: string): Promise<void> {
	const abs = path.join(root, ...rel.split('/'));
	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, data);
}

async function read(root: string, rel: string): Promise<string> {
	return fs.readFile(path.join(root, ...rel.split('/')), 'utf8');
}

suite('installer', () => {
	let tmp: string;
	let ws: string;
	let item: LibraryItem;

	setup(async () => {
		tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-inst-'));
		ws = path.join(tmp, 'ws');
		const src = path.join(tmp, 'src');
		await fs.mkdir(ws);
		await write(src, 'SKILL.md', '---\nname: demo\ndescription: d\n---\nbody\n');
		await write(src, 'templates/t.md', 'template');
		item = { id: 'demo', version: '1.0.0', sourceDir: src };
	});

	teardown(async () => {
		await fs.rm(tmp, { recursive: true, force: true });
	});

	async function installAndLock(lock: LockFile, strategy: 'shared' | 'dedicated' = 'shared'): Promise<LockFile> {
		const targets = resolveTargets('demo', ['claude', 'copilot', 'cortex'], strategy);
		const result = await installItem(ws, item, targets);
		return withItem(lock, 'demo', { version: result.version, files: result.files });
	}

	test('fresh shared install writes once and records hashes', async () => {
		const targets = resolveTargets('demo', ['claude', 'copilot', 'cortex'], 'shared');
		const result = await installItem(ws, item, targets);
		assert.deepStrictEqual(Object.keys(result.files).sort(), [
			'.claude/skills/demo/SKILL.md',
			'.claude/skills/demo/templates/t.md',
		]);
		assert.strictEqual(result.files['.claude/skills/demo/templates/t.md'], sha256('template'));
		assert.strictEqual(await read(ws, '.claude/skills/demo/templates/t.md'), 'template');
		assert.ok(!(await exists(path.join(ws, ...STAGING_DIR.split('/')))), 'staging folder removed');
	});

	test('dedicated install writes three folders', async () => {
		const lock = await installAndLock(emptyLockFile(), 'dedicated');
		assert.strictEqual(Object.keys(lock.items.demo.files).length, 6);
		for (const base of ['.claude', '.github', '.cortex']) {
			assert.ok(await exists(path.join(ws, base, 'skills', 'demo', 'SKILL.md')), base);
		}
	});

	test('checkTargets reports absent, clean, modified and unmanaged', async () => {
		const targets = resolveTargets('demo', ['claude'], 'shared');
		assert.strictEqual((await checkTargets(ws, 'demo', targets, emptyLockFile()))[0].state, 'absent');

		await write(ws, '.claude/skills/demo/SKILL.md', 'someone else');
		assert.strictEqual((await checkTargets(ws, 'demo', targets, emptyLockFile()))[0].state, 'unmanaged');

		const lock = await installAndLock(emptyLockFile());
		assert.strictEqual((await checkTargets(ws, 'demo', targets, lock))[0].state, 'clean');

		await write(ws, '.claude/skills/demo/SKILL.md', 'edited');
		assert.strictEqual((await checkTargets(ws, 'demo', targets, lock))[0].state, 'modified');
	});

	test('an added or deleted file counts as modified', async () => {
		const targets = resolveTargets('demo', ['claude'], 'shared');
		let lock = await installAndLock(emptyLockFile());
		await write(ws, '.claude/skills/demo/extra.md', 'x');
		assert.strictEqual((await checkTargets(ws, 'demo', targets, lock))[0].state, 'modified');

		lock = await installAndLock(lock);
		await fs.rm(path.join(ws, '.claude', 'skills', 'demo', 'templates', 't.md'));
		assert.strictEqual((await checkTargets(ws, 'demo', targets, lock))[0].state, 'modified');
	});

	test('reinstall replaces the folder and drops stale files', async () => {
		await installAndLock(emptyLockFile());
		await write(ws, '.claude/skills/demo/stale.md', 'old');
		await write(item.sourceDir, 'SKILL.md', 'v2');
		await installItem(ws, { ...item, version: '2.0.0' }, resolveTargets('demo', ['claude'], 'shared'));
		assert.strictEqual(await read(ws, '.claude/skills/demo/SKILL.md'), 'v2');
		assert.ok(!(await exists(path.join(ws, '.claude', 'skills', 'demo', 'stale.md'))));
	});

	test('a failed swap rolls back folders already swapped', async () => {
		await installAndLock(emptyLockFile(), 'dedicated');
		await write(ws, '.claude/skills/demo/SKILL.md', 'previous');
		// Make the second target unwritable: .github becomes a file, so mkdir under it fails.
		await fs.rm(path.join(ws, '.github'), { recursive: true });
		await fs.writeFile(path.join(ws, '.github'), 'not a folder');
		await write(item.sourceDir, 'SKILL.md', 'new');

		await assert.rejects(installItem(ws, item, resolveTargets('demo', ['claude', 'copilot'], 'dedicated')));
		assert.strictEqual(await read(ws, '.claude/skills/demo/SKILL.md'), 'previous');
		assert.ok(!(await exists(path.join(ws, ...STAGING_DIR.split('/')))), 'staging folder removed');
	});

	test('rejects an item without SKILL.md', async () => {
		await fs.rm(path.join(item.sourceDir, 'SKILL.md'));
		await assert.rejects(installItem(ws, item, resolveTargets('demo', ['claude'], 'shared')), /SKILL\.md/);
	});

	test('rejects an empty target list', async () => {
		await assert.rejects(installItem(ws, item, []), /No install targets/);
	});
});
