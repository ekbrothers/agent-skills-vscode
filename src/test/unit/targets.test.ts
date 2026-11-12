import * as assert from 'assert';
import { isValidItemId, normalizeTools, resolveTargets } from '../../targets';

suite('targets', () => {
	test('shared strategy writes every tool to one folder', () => {
		const targets = resolveTargets('my-skill', ['claude', 'copilot', 'cortex'], 'shared');
		assert.deepStrictEqual(targets, [{ dir: '.claude/skills/my-skill', tools: ['claude', 'copilot', 'cortex'] }]);
	});

	test('dedicated strategy gives each tool its own folder', () => {
		const targets = resolveTargets('my-skill', ['claude', 'copilot', 'cortex'], 'dedicated');
		assert.deepStrictEqual(
			targets.map((t) => t.dir),
			['.claude/skills/my-skill', '.github/skills/my-skill', '.cortex/skills/my-skill'],
		);
	});

	test('dedicated strategy for one tool only', () => {
		assert.deepStrictEqual(resolveTargets('a', ['copilot'], 'dedicated'), [{ dir: '.github/skills/a', tools: ['copilot'] }]);
	});

	test('normalizeTools drops unknown and repeated ids', () => {
		assert.deepStrictEqual(normalizeTools(['cortex', 'bogus', 'cortex', 'claude']), ['cortex', 'claude']);
		assert.deepStrictEqual(normalizeTools(undefined), []);
	});

	test('item ids follow the Agent Skills naming rule', () => {
		for (const ok of ['a', 'my-skill', 'skill-2', 'x'.repeat(64)]) {
			assert.ok(isValidItemId(ok), ok);
		}
		for (const bad of ['', 'My-Skill', 'a--b', '-a', 'a-', 'a_b', 'a.b', '../evil', 'a/b', 'a\\b', 'x'.repeat(65)]) {
			assert.ok(!isValidItemId(bad), bad);
		}
	});

	test('resolveTargets rejects an invalid id', () => {
		assert.throws(() => resolveTargets('../evil', ['claude'], 'shared'));
	});
});
