// Minimal GitHub REST client: latest release and asset download. No vscode imports, so it is unit-testable.

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export type GitHubErrorKind = 'unauthorized' | 'notFound' | 'sso' | 'rateLimit' | 'network' | 'http';

export class GitHubError extends Error {
	constructor(
		message: string,
		readonly kind: GitHubErrorKind,
		/** For sso: the URL where the user authorizes the token for the org. */
		readonly url?: string,
	) {
		super(message);
		this.name = 'GitHubError';
	}
}

export interface ReleaseAsset {
	name: string;
	/** API URL of the asset; download with Accept: application/octet-stream. */
	url: string;
	size: number;
}

export interface Release {
	tag: string;
	assets: ReleaseAsset[];
}

export type FetchFn = typeof fetch;

export function isValidRepo(repo: string): boolean {
	return /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo);
}

function headers(token: string | undefined, accept: string): Record<string, string> {
	const h: Record<string, string> = {
		Accept: accept,
		'User-Agent': 'prompt-library-vscode',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (token) {
		h.Authorization = `Bearer ${token}`;
	}
	return h;
}

/** Turns a failed response into a typed error. GitHub returns 404, not 403, for private repos you cannot see. */
export async function toError(res: Response, what: string): Promise<GitHubError> {
	const sso = res.headers.get('x-github-sso');
	if (res.status === 403 && sso) {
		const url = /url=(\S+)/.exec(sso)?.[1];
		return new GitHubError(`${what}: the organization requires SAML SSO authorization for this token.`, 'sso', url);
	}
	if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
		const reset = Number(res.headers.get('x-ratelimit-reset'));
		const when = reset ? ` Resets at ${new Date(reset * 1000).toLocaleTimeString()}.` : '';
		return new GitHubError(`${what}: GitHub API rate limit reached.${when}`, 'rateLimit');
	}
	if (res.status === 401) {
		return new GitHubError(`${what}: GitHub rejected the credentials.`, 'unauthorized');
	}
	if (res.status === 404) {
		return new GitHubError(`${what}: not found, or you do not have access.`, 'notFound');
	}
	let detail = '';
	try {
		detail = ((await res.json()) as { message?: string }).message ?? '';
	} catch {
		// Body is not JSON.
	}
	return new GitHubError(`${what}: HTTP ${res.status}${detail ? ` (${detail})` : ''}.`, 'http');
}

async function send(fetchFn: FetchFn, url: string, init: RequestInit, what: string): Promise<Response> {
	try {
		return await fetchFn(url, init);
	} catch (err) {
		throw new GitHubError(`${what}: network error (${(err as Error).message}).`, 'network');
	}
}

export async function getLatestRelease(
	apiBase: string,
	repo: string,
	token: string | undefined,
	fetchFn: FetchFn = fetch,
): Promise<Release> {
	const what = `Latest release of ${repo}`;
	const res = await send(fetchFn, `${apiBase}/repos/${repo}/releases/latest`, { headers: headers(token, 'application/vnd.github+json') }, what);
	if (!res.ok) {
		throw await toError(res, what);
	}
	const body = (await res.json()) as { tag_name?: string; assets?: { name: string; url: string; size: number }[] };
	return {
		tag: body.tag_name ?? '',
		assets: (body.assets ?? []).map((a) => ({ name: a.name, url: a.url, size: a.size })),
	};
}

/**
 * Downloads a release asset. GitHub answers with a redirect to signed storage;
 * the redirect is followed by hand so the token is never sent to another host.
 */
export async function downloadAsset(asset: ReleaseAsset, token: string | undefined, fetchFn: FetchFn = fetch): Promise<Buffer> {
	const what = `Download of ${asset.name}`;
	if (asset.size > MAX_ASSET_BYTES) {
		throw new GitHubError(`${what}: ${asset.size} bytes exceeds the ${MAX_ASSET_BYTES} byte limit.`, 'http');
	}
	let res = await send(fetchFn, asset.url, { headers: headers(token, 'application/octet-stream'), redirect: 'manual' }, what);
	if (res.status >= 300 && res.status < 400) {
		const location = res.headers.get('location');
		if (!location) {
			throw new GitHubError(`${what}: redirect without a location.`, 'http');
		}
		res = await send(fetchFn, location, { headers: { 'User-Agent': 'prompt-library-vscode' }, redirect: 'follow' }, what);
	}
	if (!res.ok) {
		throw await toError(res, what);
	}
	const data = Buffer.from(await res.arrayBuffer());
	if (data.length > MAX_ASSET_BYTES) {
		throw new GitHubError(`${what}: response exceeds the ${MAX_ASSET_BYTES} byte limit.`, 'http');
	}
	return data;
}
