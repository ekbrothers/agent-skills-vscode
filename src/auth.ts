import { execFile } from 'child_process';
import * as vscode from 'vscode';

export const GITHUB_PROVIDER = 'github';
export const SCOPES = ['repo'];

export type CredentialSource = 'vscode' | 'gh' | 'anonymous';

export interface Credential {
	source: CredentialSource;
	token?: string;
	/** Shown to the user; never the token. */
	label: string;
}

/** VS Code's built-in GitHub session, without prompting. */
async function vscodeSilent(): Promise<Credential | undefined> {
	try {
		const session = await vscode.authentication.getSession(GITHUB_PROVIDER, SCOPES, { silent: true });
		return session ? { source: 'vscode', token: session.accessToken, label: `VS Code (${session.account.label})` } : undefined;
	} catch {
		return undefined;
	}
}

/** Token from the GitHub CLI, if it is installed and signed in. */
export function ghToken(timeoutMs = 5000): Promise<string | undefined> {
	return new Promise((resolve) => {
		execFile('gh', ['auth', 'token', '--hostname', 'github.com'], { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
			const token = stdout?.trim();
			resolve(!err && token ? token : undefined);
		});
	});
}

/**
 * Credentials to try, in order, none of which prompt the user:
 * the VS Code GitHub session, then the gh CLI, then no token (public repos).
 */
export async function silentCredentials(): Promise<Credential[]> {
	const list: Credential[] = [];
	const vs = await vscodeSilent();
	if (vs) {
		list.push(vs);
	}
	const gh = await ghToken();
	if (gh) {
		list.push({ source: 'gh', token: gh, label: 'GitHub CLI' });
	}
	list.push({ source: 'anonymous', label: 'no sign-in' });
	return list;
}

/** Interactive VS Code sign-in. Shows the consent dialog. */
export async function signIn(): Promise<Credential | undefined> {
	const session = await vscode.authentication.getSession(GITHUB_PROVIDER, SCOPES, { createIfNone: true });
	return session ? { source: 'vscode', token: session.accessToken, label: `VS Code (${session.account.label})` } : undefined;
}
