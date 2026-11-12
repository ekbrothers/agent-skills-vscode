// Maps the configured GitHub web URL to the API base, the VS Code auth provider
// and the gh CLI hostname. No vscode imports, so it is unit-testable.

export const DEFAULT_GITHUB_URL = 'https://github.com';

export interface GitHubHost {
	/** Normalized web URL, for example https://github.com or https://acme.ghe.com. */
	webUrl: string;
	/** Hostname for `gh auth token --hostname`. */
	hostname: string;
	apiBase: string;
	/** VS Code authentication provider id. */
	authProvider: 'github' | 'github-enterprise';
	kind: 'github.com' | 'ghe.com' | 'server';
}

/**
 * github.com (including Enterprise Cloud orgs and Enterprise Managed Users) uses
 * api.github.com and the "github" provider. GHE.com data residency uses
 * api.<subdomain>.ghe.com. Enterprise Server uses <url>/api/v3. Both of the latter
 * use the "github-enterprise" provider, which reads github-enterprise.uris.
 */
export function resolveGitHubHost(raw: string | undefined): GitHubHost {
	const input = (raw ?? '').trim() || DEFAULT_GITHUB_URL;
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`promptLibrary.githubUrl is not a valid URL: "${input}".`);
	}
	if (url.protocol !== 'https:') {
		throw new Error(`promptLibrary.githubUrl must use https (got "${input}").`);
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error('promptLibrary.githubUrl must not contain credentials, a query or a fragment.');
	}
	const hostname = url.hostname.toLowerCase();
	const path = url.pathname.replace(/\/+$/, '');
	const webUrl = `https://${url.host.toLowerCase()}${path}`;

	if (hostname === 'github.com' || hostname === 'www.github.com') {
		return { webUrl: DEFAULT_GITHUB_URL, hostname: 'github.com', apiBase: 'https://api.github.com', authProvider: 'github', kind: 'github.com' };
	}
	if (hostname.endsWith('.ghe.com')) {
		return { webUrl, hostname, apiBase: `https://api.${hostname}`, authProvider: 'github-enterprise', kind: 'ghe.com' };
	}
	return { webUrl, hostname, apiBase: `${webUrl}/api/v3`, authProvider: 'github-enterprise', kind: 'server' };
}
