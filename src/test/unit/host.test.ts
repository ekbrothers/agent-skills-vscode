import * as assert from 'assert';
import { resolveGitHubHost } from '../../host';

suite('host', () => {
	test('github.com is the default', () => {
		for (const input of [undefined, '', '  ', 'https://github.com', 'https://github.com/', 'https://GitHub.com']) {
			const h = resolveGitHubHost(input);
			assert.strictEqual(h.apiBase, 'https://api.github.com', String(input));
			assert.strictEqual(h.authProvider, 'github');
			assert.strictEqual(h.hostname, 'github.com');
		}
	});

	test('GHE.com data residency', () => {
		const h = resolveGitHubHost('https://Acme.ghe.com/');
		assert.deepStrictEqual(h, {
			webUrl: 'https://acme.ghe.com',
			hostname: 'acme.ghe.com',
			apiBase: 'https://api.acme.ghe.com',
			authProvider: 'github-enterprise',
			kind: 'ghe.com',
		});
	});

	test('Enterprise Server, with and without a path prefix', () => {
		assert.strictEqual(resolveGitHubHost('https://github.example.com').apiBase, 'https://github.example.com/api/v3');
		assert.strictEqual(resolveGitHubHost('https://git.example.com/gh/').apiBase, 'https://git.example.com/gh/api/v3');
		assert.strictEqual(resolveGitHubHost('https://github.example.com:8443').hostname, 'github.example.com');
	});

	test('rejects unsafe or malformed URLs', () => {
		for (const bad of ['http://github.com', 'github.com', 'https://user:pw@github.com', 'https://github.com?x=1', 'ftp://x', 'not a url']) {
			assert.throws(() => resolveGitHubHost(bad), Error, bad);
		}
	});
});
