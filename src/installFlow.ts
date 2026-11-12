import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { readTarGz, writeTree } from './archive';
import { IndexItem } from './indexSchema';
import { checkTargets, installItem, TargetCheck } from './installer';
import { LibraryService } from './library';
import { readLockFile, withItem, writeLockFile } from './lockFile';
import { log } from './log';
import { LibraryItem, normalizeTools, PathStrategy, resolveTargets, TOOL_IDS, ToolId } from './targets';

export async function pickWorkspaceFolder(placeHolder: string): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) {
		vscode.window.showErrorMessage('Prompt Library: open a folder first. Skills are installed into the workspace.');
		return undefined;
	}
	if (folders.length === 1) {
		return folders[0];
	}
	return vscode.window.showWorkspaceFolderPick({ placeHolder });
}

export interface InstallOptions {
	/** Tools the item supports. Intersected with the promptLibrary.tools setting. */
	itemTools?: readonly ToolId[];
	hasScripts?: boolean;
}

/**
 * Shared install path for bundled samples and library items: resolves targets,
 * asks before replacing local changes or warning about scripts, installs, then
 * records the result in the lock file. Returns true when something was installed.
 */
export async function installIntoWorkspace(folder: vscode.WorkspaceFolder, item: LibraryItem, opts: InstallOptions = {}): Promise<boolean> {
	const config = vscode.workspace.getConfiguration('promptLibrary', folder.uri);
	let tools = normalizeTools(config.get<string[]>('tools', [...TOOL_IDS]));
	if (opts.itemTools) {
		tools = tools.filter((t) => opts.itemTools!.includes(t));
	}
	if (tools.length === 0) {
		vscode.window.showErrorMessage(`Prompt Library: ${item.id} does not support any tool selected in promptLibrary.tools.`);
		return false;
	}
	const strategy: PathStrategy = config.get<string>('pathStrategy', 'shared') === 'dedicated' ? 'dedicated' : 'shared';

	if (opts.hasScripts) {
		const choice = await vscode.window.showWarningMessage(
			`${item.id} contains scripts.`,
			{
				modal: true,
				detail: 'AI tools may run these scripts when they use the skill. Review the files under scripts/ after installing.',
			},
			'Install',
		);
		if (choice !== 'Install') {
			return false;
		}
	}

	const root = folder.uri.fsPath;
	const targets = resolveTargets(item.id, tools, strategy);
	const lock = await readLockFile(root);
	const checks = await checkTargets(root, item.id, targets, lock);
	if (!(await confirmUnmanagedOverwrite(item.id, checks))) {
		return false;
	}
	for (const c of checks.filter((x) => x.state === 'modified')) {
		// Library skills are managed. Local edits are not supported and are replaced without asking.
		log(`Discarding local changes in ${c.dir}; library skills are managed and cannot be edited locally.`);
	}

	const result = await installItem(root, item, targets);
	await writeLockFile(root, withItem(lock, item.id, { version: result.version, files: result.files }));

	log(`Installed ${item.id}@${item.version} into ${root}: ${targets.map((t) => `${t.dir} (${t.tools.join(', ')})`).join('; ')}`);
	return true;
}

/**
 * Asks only when a folder exists that Prompt Library did not install, which is
 * a name collision with someone's own skill, not an edit of a library skill.
 */
async function confirmUnmanagedOverwrite(itemId: string, checks: TargetCheck[]): Promise<boolean> {
	const unmanaged = checks.filter((c) => c.state === 'unmanaged');
	if (unmanaged.length === 0) {
		return true;
	}
	const detail = unmanaged.map((c) => `${c.dir} exists but was not installed by Prompt Library.`).join('\n');
	const choice = await vscode.window.showWarningMessage(
		`Installing ${itemId} will replace a folder with the same name.`,
		{ modal: true, detail },
		'Replace',
	);
	return choice === 'Replace';
}

/** Downloads, verifies and unpacks a library item into a temp folder, then installs it. */
export async function installFromLibrary(library: LibraryService, entry: IndexItem): Promise<boolean> {
	const folder = await pickWorkspaceFolder(`Install ${entry.title} into which folder?`);
	if (!folder) {
		return false;
	}
	const version = entry.versions[entry.latest];
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-library-'));
	try {
		const archive = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `Downloading ${entry.title} ${entry.latest}` },
			() => library.downloadArchive(entry),
		);
		const files = readTarGz(archive);
		if (!files.has('SKILL.md')) {
			throw new Error(`${version.archive} has no SKILL.md at its root.`);
		}
		await writeTree(files, tmp);
		return await installIntoWorkspace(
			folder,
			{ id: entry.id, version: entry.latest, sourceDir: tmp },
			// Trust the archive over the index flag: warn if either says there are scripts.
			{ itemTools: entry.tools, hasScripts: version.hasScripts || [...files.keys()].some((f) => f.startsWith('scripts/')) },
		);
	} finally {
		await fs.rm(tmp, { recursive: true, force: true });
	}
}
