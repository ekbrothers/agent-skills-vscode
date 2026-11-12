import * as assert from 'assert';
import { compareVersions, parseIndex } from '../../indexSchema';

const SHA = 'a'.repeat(64);

function entry(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id,
		type: 'skill',
		title: id.toUpperCase(),
		description: 'd',
		latest: '1.0.0',
		versions: { '1.0.0': { archive: `${id}-1.0.0.tar.gz`, sha256: SHA, hasScripts: false } },
		tools: ['claude', 'copilot', 'cortex'],
		...extra,
	};
}

function index(items: unknown[], schemaVersion = 1): string {
	return JSON.stringify({ schemaVersion, generatedAt: '2026-11-12T00:00:00Z', items });
}

suite('indexSchema', () => {
	test('parses valid items sorted by title', () => {
		const { index: idx, skipped } = parseIndex(index([entry('zeta'), entry('alpha')]));
		assert.deepStrictEqual(idx.items.map((i) => i.id), ['alpha', 'zeta']);
		assert.deepStrictEqual(skipped, []);
	});

	test('skips bad items but keeps the rest', () => {
		const { index: idx, skipped } = parseIndex(
			index([
				entry('good'),
				entry('../evil'),
				entry('bad-type', { type: 'prompt' }),
				entry('bad-sha', { versions: { '1.0.0': { archive: 'x.tar.gz', sha256: 'nope' } } }),
				entry('bad-archive', { versions: { '1.0.0': { archive: 'dir/x.tar.gz', sha256: SHA } } }),
				entry('no-latest', { latest: '2.0.0' }),
				entry('good'),
			]),
		);
		assert.deepStrictEqual(idx.items.map((i) => i.id), ['good']);
		assert.strictEqual(skipped.length, 6);
	});

	test('drops unknown tools and defaults missing tools to all', () => {
		const { index: idx } = parseIndex(index([entry('a', { tools: ['claude', 'vim'] }), entry('b', { tools: undefined })]));
		assert.deepStrictEqual(idx.items[0].tools, ['claude']);
		assert.deepStrictEqual(idx.items[1].tools, ['claude', 'copilot', 'cortex']);
	});

	test('rejects bad JSON and unsupported schema versions', () => {
		assert.throws(() => parseIndex('{'), /not valid JSON/);
		assert.throws(() => parseIndex('{"schemaVersion":1}'), /items/);
		assert.throws(() => parseIndex(index([], 2)), /Update the extension/);
	});

	test('compareVersions', () => {
		assert.strictEqual(compareVersions('1.10.0', '1.9.0'), 1);
		assert.strictEqual(compareVersions('1.0.0', '1.0.1'), -1);
		assert.strictEqual(compareVersions('2.0.0', '2.0.0'), 0);
		assert.strictEqual(compareVersions('1.0', '1.0.0'), 0);
	});
});
