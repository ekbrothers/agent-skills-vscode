import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { checkTargets, installItem, TargetCheck } from './installer';
import { readLockFile, withItem, writeLockFile } from './lockFile';
import { isValidItemId, LibraryItem, normalizeTools, PathStrategy, resolveTargets, TOOL_IDS } from './targets';

const SAMPLE_VERSION = '1.0.0';

let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
	output = vscode.window.createOutputChannel('Prompt Library');
	context.subscriptions.push(
		output,
		vscode.commands.registerCommand('promptLibrary.installSampleSkill', () => installSampleSkill(context)),
	);
}

export function deactivate(): void {}

async function installSampleSkill(context: vscode.ExtensionContext): Promise<void> {
	try {
		const folder = await pickWorkspaceFolder();
		if (!folder) {
			return;
		}
		const item = await pickSample(context);
		if (!item) {
			return;
		}

		const config = vscode.workspace.getConfiguration('promptLibrary', folder.uri);
		const tools = normalizeTools(config.get<string[]>('tools', [...TOOL_IDS]));
		const strategy = config.get<PathStrategy>('pathStrategy', 'shared') === 'dedicated' ? 'dedicated' : 'shared';
		if (tools.length === 0) {
			vscode.window.showErrorMessage('Prompt Library: the promptLibrary.tools setting selects no known tools.');
			return;
		}

		const root = folder.uri.fsPath;
		const targets = resolveTargets(item.id, tools, strategy);
		const lock = await readLockFile(root);
		const checks = await checkTargets(root, item.id, targets, lock);
		if (!(await confirmOverwrite(item.id, checks))) {
			return;
		}

		const result = await installItem(root, item, targets);
		await writeLockFile(root, withItem(lock, item.id, { version: result.version, files: result.files }));

		const dirs = targets.map((t) => `${t.dir} (${t.tools.join(', ')})`);
		log(`Installed ${item.id}@${item.version} into ${root}: ${dirs.join('; ')}`);
		for (const f of Object.keys(result.files)) {
			log(`  ${f}`);
		}
		vscode.window.showInformationMessage(
			`Prompt Library: installed ${item.id} to ${targets.map((t) => t.dir).join(', ')}. ` +
				'If a Claude Code session was already running and the skills folder is new, run /reload-skills.',
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log(`Install failed: ${message}`);
		vscode.window.showErrorMessage(`Prompt Library: install failed. ${message}`);
	}
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) {
		vscode.window.showErrorMessage('Prompt Library: open a folder first. Skills are installed into the workspace.');
		return undefined;
	}
	if (folders.length === 1) {
		return folders[0];
	}
	return vscode.window.showWorkspaceFolderPick({ placeHolder: 'Install the sample skill into which folder?' });
}

async function pickSample(context: vscode.ExtensionContext): Promise<LibraryItem | undefined> {
	const skillsRoot = vscode.Uri.joinPath(context.extensionUri, 'resources', 'skills');
	const entries = await fs.readdir(skillsRoot.fsPath, { withFileTypes: true });
	const ids = entries.filter((e) => e.isDirectory() && isValidItemId(e.name)).map((e) => e.name).sort();
	if (ids.length === 0) {
		throw new Error('No bundled sample skills found.');
	}
	const picked = await vscode.window.showQuickPick(
		ids.map((id) => ({
			label: id,
			description: id.endsWith('-tools') ? 'with an extra tools: frontmatter field' : 'plain frontmatter',
		})),
		{ placeHolder: 'Choose a sample skill to install' },
	);
	if (!picked) {
		return undefined;
	}
	return {
		id: picked.label,
		version: SAMPLE_VERSION,
		sourceDir: vscode.Uri.joinPath(skillsRoot, picked.label).fsPath,
	};
}

/** Returns true when it is safe to write, asking first if local files would be replaced. */
async function confirmOverwrite(itemId: string, checks: TargetCheck[]): Promise<boolean> {
	const risky = checks.filter((c) => c.state === 'modified' || c.state === 'unmanaged');
	if (risky.length === 0) {
		return true;
	}
	const detail = risky
		.map((c) => (c.state === 'modified' ? `${c.dir} has local changes.` : `${c.dir} exists but was not installed by Prompt Library.`))
		.join('\n');
	const choice = await vscode.window.showWarningMessage(
		`Installing ${itemId} will replace existing files.`,
		{ modal: true, detail },
		'Overwrite',
	);
	return choice === 'Overwrite';
}

function log(line: string): void {
	output.appendLine(`[${new Date().toISOString()}] ${line}`);
}
