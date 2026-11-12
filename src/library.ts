import * as vscode from 'vscode';
import { Credential, signIn, silentCredentials } from './auth';
import { downloadAsset, getLatestRelease, GitHubError, isValidRepo, Release } from './github';
import { GitHubHost, resolveGitHubHost } from './host';
import { sha256 } from './hash';
import { IndexItem, LibraryIndex, parseIndex } from './indexSchema';
import { log } from './log';

export const INDEX_ASSET = 'index.json';

export type LibraryStatus =
	| { kind: 'noRepo' }
	| { kind: 'loading' }
	| { kind: 'signInRequired'; message: string }
	| { kind: 'sso'; message: string; url?: string }
	| { kind: 'error'; message: string }
	| { kind: 'ready' };

/** Holds the content repo's latest index and the credential that fetched it. */
export class LibraryService implements vscode.Disposable {
	status: LibraryStatus = { kind: 'loading' };
	index?: LibraryIndex;
	private release?: Release;
	private credential?: Credential;
	private repo = '';
	private generation = 0;
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChange = this.emitter.event;

	dispose(): void {
		this.emitter.dispose();
	}

	private setStatus(status: LibraryStatus): void {
		this.status = status;
		void vscode.commands.executeCommand('setContext', 'promptLibrary.status', status.kind);
		this.emitter.fire();
	}

	/** Re-reads the latest release. Tries each silent credential until one can see the repo. */
	async refresh(interactive = false): Promise<void> {
		const gen = ++this.generation;
		const config = vscode.workspace.getConfiguration('promptLibrary');
		const repo = config.get<string>('repo', '').trim();
		let host: GitHubHost;
		try {
			host = resolveGitHubHost(config.get<string>('githubUrl'));
		} catch (err) {
			this.setStatus({ kind: 'error', message: (err as Error).message });
			return;
		}
		this.repo = repo;
		if (!repo) {
			this.index = undefined;
			this.setStatus({ kind: 'noRepo' });
			return;
		}
		if (!isValidRepo(repo)) {
			this.setStatus({ kind: 'error', message: `promptLibrary.repo must look like owner/name (got "${repo}").` });
			return;
		}
		this.setStatus({ kind: 'loading' });

		let candidates: Credential[];
		if (interactive) {
			const c = await signIn(host);
			candidates = c ? [c] : [];
		} else {
			candidates = await silentCredentials(host);
		}

		let lastError: GitHubError | undefined;
		for (const cred of candidates) {
			try {
				const release = await getLatestRelease(host.apiBase, repo, cred.token);
				const asset = release.assets.find((a) => a.name === INDEX_ASSET);
				if (!asset) {
					throw new Error(`The latest release of ${repo} (${release.tag}) has no ${INDEX_ASSET}.`);
				}
				const { index, skipped } = parseIndex((await downloadAsset(asset, cred.token)).toString('utf8'));
				if (gen !== this.generation) {
					return;
				}
				for (const s of skipped) {
					log(`Skipped index entry: ${s}`);
				}
				this.release = release;
				this.credential = cred;
				this.index = index;
				log(`Loaded ${index.items.length} items from ${host.webUrl}/${repo} ${release.tag} using ${cred.label}.`);
				this.setStatus({ kind: 'ready' });
				return;
			} catch (err) {
				if (gen !== this.generation) {
					return;
				}
				if (err instanceof GitHubError && (err.kind === 'unauthorized' || err.kind === 'notFound')) {
					log(`${cred.label}: ${err.message}`);
					lastError = err;
					continue;
				}
				this.index = undefined;
				const message = err instanceof Error ? err.message : String(err);
				log(`Refresh failed using ${cred.label}: ${message}`);
				if (err instanceof GitHubError && err.kind === 'sso') {
					this.setStatus({ kind: 'sso', message, url: err.url });
				} else {
					this.setStatus({ kind: 'error', message });
				}
				return;
			}
		}

		this.index = undefined;
		const signedIn = candidates.some((c) => c.source === 'vscode');
		if (signedIn) {
			this.setStatus({
				kind: 'error',
				message: `Cannot read ${repo}. Check that the repo exists, has a release, and that your GitHub account has access. ${lastError?.message ?? ''}`.trim(),
			});
		} else {
			this.setStatus({ kind: 'signInRequired', message: `Sign in to GitHub to read ${repo}.` });
		}
	}

	/** Downloads an item's archive and verifies its sha256 against the index. Nothing is written to disk. */
	async downloadArchive(item: IndexItem): Promise<Buffer> {
		const version = item.versions[item.latest];
		const asset = this.release?.assets.find((a) => a.name === version.archive);
		if (!asset) {
			throw new Error(`The release has no asset named ${version.archive}. Refresh and try again.`);
		}
		const data = await downloadAsset(asset, this.credential?.token);
		const actual = sha256(data);
		if (actual !== version.sha256) {
			throw new Error(`Checksum mismatch for ${version.archive}: expected ${version.sha256}, got ${actual}. Nothing was installed.`);
		}
		return data;
	}

	get repoName(): string {
		return this.repo;
	}
}
