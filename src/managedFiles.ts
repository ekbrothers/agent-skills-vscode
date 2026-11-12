import * as path from 'path';
import * as vscode from 'vscode';
import { toAbsolute } from './fsUtil';
import { readLockFile } from './lockFile';
import { log } from './log';

function key(fsPath: string): string {
	const p = path.normalize(fsPath);
	return process.platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * Tracks every file recorded in the lock files of the open workspace folders.
 * Those files are managed by Prompt Library and open read-only in the editor.
 */
export class ManagedFiles {
	private paths = new Set<string>();

	async reload(): Promise<void> {
		const next = new Set<string>();
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			try {
				const lock = await readLockFile(folder.uri.fsPath);
				for (const item of Object.values(lock.items)) {
					for (const rel of Object.keys(item.files)) {
						next.add(key(toAbsolute(folder.uri.fsPath, rel)));
					}
				}
			} catch (err) {
				log(`Could not read the lock file in ${folder.name}: ${(err as Error).message}`);
			}
		}
		this.paths = next;
	}

	has(uri: vscode.Uri): boolean {
		return uri.scheme === 'file' && this.paths.has(key(uri.fsPath));
	}
}

/** Marks the active editor read-only for this session if it shows a managed file. */
export async function protectActiveEditor(managed: ManagedFiles): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (editor && managed.has(editor.document.uri)) {
		await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
	}
}
