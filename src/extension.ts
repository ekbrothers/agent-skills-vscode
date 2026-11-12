import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { GITHUB_PROVIDER } from './auth';
import { IndexItem } from './indexSchema';
import { installFromLibrary, installIntoWorkspace, pickWorkspaceFolder } from './installFlow';
import { LibraryService } from './library';
import { LOCK_FILE_PATH } from './lockFile';
import { initLog, log, showLog } from './log';
import { isValidItemId } from './targets';
import { SkillsTreeProvider } from './treeView';

const SAMPLE_VERSION = '1.0.0';

export function activate(context: vscode.ExtensionContext): void {
	initLog(context);
	const library = new LibraryService();
	const tree = new SkillsTreeProvider(library);
	const view = vscode.window.createTreeView('promptLibrary.skills', { treeDataProvider: tree, showCollapseAll: false });

	const updateMessage = (): void => {
		const s = library.status;
		view.message = s.kind === 'loading' ? 'Loading...' : s.kind === 'error' || s.kind === 'sso' ? s.message : undefined;
		if (s.kind === 'sso') {
			void offerSsoAuthorization(s.url);
		}
	};

	const lockWatcher = vscode.workspace.createFileSystemWatcher(`**/${LOCK_FILE_PATH}`);
	const reloadLock = (): void => void tree.reloadLock();

	context.subscriptions.push(
		library,
		tree,
		view,
		lockWatcher,
		library.onDidChange(updateMessage),
		lockWatcher.onDidCreate(reloadLock),
		lockWatcher.onDidChange(reloadLock),
		lockWatcher.onDidDelete(reloadLock),
		vscode.workspace.onDidChangeWorkspaceFolders(reloadLock),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('promptLibrary.repo')) {
				void library.refresh();
			}
		}),
		vscode.authentication.onDidChangeSessions((e) => {
			if (e.provider.id === GITHUB_PROVIDER) {
				void library.refresh();
			}
		}),
		vscode.commands.registerCommand('promptLibrary.installSampleSkill', () => guarded(() => installSampleSkill(context))),
		vscode.commands.registerCommand('promptLibrary.refresh', () => library.refresh()),
		vscode.commands.registerCommand('promptLibrary.signIn', () => guarded(() => library.refresh(true))),
		vscode.commands.registerCommand('promptLibrary.showLog', () => showLog()),
		vscode.commands.registerCommand('promptLibrary.installItem', (item?: IndexItem) => guarded(() => installCommand(library, item))),
		vscode.commands.registerCommand('promptLibrary.updateItem', (item?: IndexItem) => guarded(() => installCommand(library, item))),
	);

	void library.refresh();
}

export function deactivate(): void {}

async function guarded(fn: () => Promise<unknown>): Promise<void> {
	try {
		await fn();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log(`Error: ${message}`);
		const choice = await vscode.window.showErrorMessage(`Prompt Library: ${message}`, 'Show Log');
		if (choice === 'Show Log') {
			showLog();
		}
	}
}

async function installCommand(library: LibraryService, item?: IndexItem): Promise<void> {
	if (!item) {
		if (library.status.kind !== 'ready' || !library.index) {
			await library.refresh();
		}
		if (!library.index) {
			throw new Error('The skills library is not available. Open the Prompt Library view for details.');
		}
		const picked = await vscode.window.showQuickPick(
			library.index.items.map((it) => ({ label: it.title, description: `v${it.latest}`, detail: it.description, item: it })),
			{ placeHolder: 'Choose a skill to install', matchOnDetail: true },
		);
		if (!picked) {
			return;
		}
		item = picked.item;
	}
	if (await installFromLibrary(library, item)) {
		vscode.window.showInformationMessage(`Prompt Library: installed ${item.title} ${item.latest}.`);
	}
}

let ssoPrompted = false;
async function offerSsoAuthorization(url: string | undefined): Promise<void> {
	if (ssoPrompted) {
		return;
	}
	ssoPrompted = true;
	const actions = url ? ['Authorize', 'Show Log'] : ['Show Log'];
	const choice = await vscode.window.showWarningMessage(
		'Prompt Library: your organization requires SAML SSO authorization for this GitHub token. Authorize it, then refresh.',
		...actions,
	);
	if (choice === 'Authorize' && url) {
		await vscode.env.openExternal(vscode.Uri.parse(url));
	} else if (choice === 'Show Log') {
		showLog();
	}
	ssoPrompted = false;
}

async function installSampleSkill(context: vscode.ExtensionContext): Promise<void> {
	const folder = await pickWorkspaceFolder('Install the sample skill into which folder?');
	if (!folder) {
		return;
	}
	const skillsRoot = vscode.Uri.joinPath(context.extensionUri, 'resources', 'skills');
	const entries = await fs.readdir(skillsRoot.fsPath, { withFileTypes: true });
	const ids = entries.filter((e) => e.isDirectory() && isValidItemId(e.name)).map((e) => e.name).sort();
	if (ids.length === 0) {
		throw new Error('No bundled sample skills found.');
	}
	const picked = await vscode.window.showQuickPick(
		ids.map((id) => ({ label: id, description: id.endsWith('-tools') ? 'with an extra tools: frontmatter field' : 'plain frontmatter' })),
		{ placeHolder: 'Choose a sample skill to install' },
	);
	if (!picked) {
		return;
	}
	const item = { id: picked.label, version: SAMPLE_VERSION, sourceDir: vscode.Uri.joinPath(skillsRoot, picked.label).fsPath };
	if (await installIntoWorkspace(folder, item)) {
		vscode.window.showInformationMessage(
			`Prompt Library: installed ${item.id}. If a Claude Code session was already running and the skills folder is new, run /reload-skills.`,
		);
	}
}
