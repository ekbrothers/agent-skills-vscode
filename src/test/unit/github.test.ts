import * as assert from 'assert';
import { downloadAsset, FetchFn, getLatestRelease, GitHubError, isValidRepo, MAX_ASSET_BYTES } from '../../github';

interface Call {
	url: string;
	headers: Record<string, string>;
	redirect?: string;
}

function stub(responses: Response[]): { fetchFn: FetchFn; calls: Call[] } {
	const calls: Call[] = [];
	const fetchFn = (async (url: string, init?: RequestInit) => {
		calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, redirect: init?.redirect });
		const r = responses.shift();
		if (!r) {
			throw new Error('unexpected request');
		}
		return r;
	}) as unknown as FetchFn;
	return { fetchFn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

async function rejectsKind(p: Promise<unknown>, kind: string): Promise<GitHubError> {
	try {
		await p;
	} catch (err) {
		assert.ok(err instanceof GitHubError, String(err));
		assert.strictEqual(err.kind, kind);
		return err;
	}
	assert.fail('expected rejection');
}

suite('github', () => {
	test('latest release maps assets and sends the token', async () => {
		const { fetchFn, calls } = stub([json({ tag_name: 'content-1', assets: [{ name: 'index.json', url: 'https://api/a/1', size: 10 }] })]);
		const r = await getLatestRelease('o/r', 'tok', fetchFn);
		assert.deepStrictEqual(r, { tag: 'content-1', assets: [{ name: 'index.json', url: 'https://api/a/1', size: 10 }] });
		assert.strictEqual(calls[0].url, 'https://api.github.com/repos/o/r/releases/latest');
		assert.strictEqual(calls[0].headers.Authorization, 'Bearer tok');
	});

	test('anonymous requests send no Authorization header', async () => {
		const { fetchFn, calls } = stub([json({ tag_name: 't', assets: [] })]);
		await getLatestRelease('o/r', undefined, fetchFn);
		assert.strictEqual(calls[0].headers.Authorization, undefined);
	});

	test('error mapping', async () => {
		await rejectsKind(getLatestRelease('o/r', 't', stub([json({}, 404)]).fetchFn), 'notFound');
		await rejectsKind(getLatestRelease('o/r', 't', stub([json({}, 401)]).fetchFn), 'unauthorized');
		await rejectsKind(
			getLatestRelease('o/r', 't', stub([json({}, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1' })]).fetchFn),
			'rateLimit',
		);
		await rejectsKind(getLatestRelease('o/r', 't', stub([json({ message: 'boom' }, 500)]).fetchFn), 'http');
		const failing = (async () => {
			throw new Error('ECONNRESET');
		}) as unknown as FetchFn;
		await rejectsKind(getLatestRelease('o/r', 't', failing), 'network');
	});

	test('SAML SSO response carries the authorization URL', async () => {
		const sso = json({ message: 'Resource protected by organization SAML enforcement.' }, 403, {
			'x-github-sso': 'required; url=https://github.com/orgs/acme/sso?authorization_request=abc',
		});
		const err = await rejectsKind(getLatestRelease('o/r', 't', stub([sso]).fetchFn), 'sso');
		assert.strictEqual(err.url, 'https://github.com/orgs/acme/sso?authorization_request=abc');
	});

	test('asset download follows the redirect without the token', async () => {
		const redirect = new Response(null, { status: 302, headers: { location: 'https://objects.example/signed' } });
		const { fetchFn, calls } = stub([redirect, new Response('payload')]);
		const data = await downloadAsset({ name: 'a.tar.gz', url: 'https://api/asset/1', size: 7 }, 'tok', fetchFn);
		assert.strictEqual(data.toString(), 'payload');
		assert.strictEqual(calls[0].headers.Authorization, 'Bearer tok');
		assert.strictEqual(calls[0].headers.Accept, 'application/octet-stream');
		assert.strictEqual(calls[0].redirect, 'manual');
		assert.strictEqual(calls[1].url, 'https://objects.example/signed');
		assert.strictEqual(calls[1].headers.Authorization, undefined);
	});

	test('asset download refuses oversized assets before fetching', async () => {
		const { fetchFn, calls } = stub([]);
		await rejectsKind(downloadAsset({ name: 'big', url: 'u', size: MAX_ASSET_BYTES + 1 }, undefined, fetchFn), 'http');
		assert.strictEqual(calls.length, 0);
	});

	test('repo name validation', () => {
		assert.ok(isValidRepo('ekbrothers/agent-skills-library'));
		for (const bad of ['', 'noslash', 'a/b/c', '../x', 'a/b?c', 'https://github.com/a/b']) {
			assert.ok(!isValidRepo(bad), bad);
		}
	});
});
