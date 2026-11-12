import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { GitHubHost } from './host';

export const AUTH_PROVIDERS = ['github', 'github-enterprise'];
export const SCOPES = ['repo'];

export type CredentialSource = 'vscode' | 'gh' | 'anonymous';

export interface Credential {
	source: CredentialSource;
	token?: string;
	/** Shown to the user; never the token. */
	label: string;
}

function fromSession(session: vscode.AuthenticationSession): Credential {
	return { source: 'vscode', token: session.accessToken, label: `VS Code (${session.account.label})` };
}

/** VS Code's built-in session for the host's provider, without prompting. */
async function vscodeSilent(host: GitHubHost): Promise<Credential | undefined> {
	try {
		const session = await vscode.authentication.getSession(host.authProvider, SCOPES, { silent: true });
		return session ? fromSession(session) : undefined;
	} catch {
		// Provider not available, for example github-enterprise without github-enterprise.uris.
		return undefined;
	}
}

/** Token from the GitHub CLI for this host, if it is installed and signed in. */
export function ghToken(hostname: string, timeoutMs = 5000): Promise<string | undefined> {
	return new Promise((resolve) => {
		execFile('gh', ['auth', 'token', '--hostname', hostname], { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
			const token = stdout?.trim();
			resolve(!err && token ? token : undefined);
		});
	});
}

/**
 * Credentials to try, in order, none of which prompt the user:
 * the VS Code session, then the gh CLI, then no token (public repos).
 */
export async function silentCredentials(host: GitHubHost): Promise<Credential[]> {
	const list: Credential[] = [];
	const vs = await vscodeSilent(host);
	if (vs) {
		list.push(vs);
	}
	const gh = await ghToken(host.hostname);
	if (gh) {
		list.push({ source: 'gh', token: gh, label: 'GitHub CLI' });
	}
	list.push({ source: 'anonymous', label: 'no sign-in' });
	return list;
}

/** Interactive VS Code sign-in. Shows the consent dialog. */
export async function signIn(host: GitHubHost): Promise<Credential | undefined> {
	if (host.authProvider === 'github-enterprise') {
		const uris = vscode.workspace.getConfiguration('github-enterprise').get<string[]>('uris') ?? [];
		const legacy = vscode.workspace.getConfiguration('github-enterprise').get<string>('uri') ?? '';
		const known = [...uris, legacy].map((u) => u.replace(/\/+$/, '').toLowerCase());
		if (!known.includes(host.webUrl.toLowerCase())) {
			throw new Error(
				`To sign in to ${host.webUrl}, add it to the github-enterprise.uris setting (VS Code's GitHub Enterprise sign-in), then try again.`,
			);
		}
	}
	const session = await vscode.authentication.getSession(host.authProvider, SCOPES, { createIfNone: true });
	return session ? fromSession(session) : undefined;
}
