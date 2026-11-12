import * as vscode from 'vscode';
import { compareVersions, IndexItem } from './indexSchema';
import { LibraryService } from './library';
import { LockFile, readLockFile } from './lockFile';
import { log } from './log';

export type ItemState = 'notInstalled' | 'installed' | 'updateAvailable';

export function itemState(item: IndexItem, installedVersion: string | undefined): ItemState {
	if (!installedVersion) {
		return 'notInstalled';
	}
	return compareVersions(item.latest, installedVersion) > 0 ? 'updateAvailable' : 'installed';
}

/**
 * Lists library items with their install state. State is read from the lock
 * file of the first workspace folder.
 */
export class SkillsTreeProvider implements vscode.TreeDataProvider<IndexItem>, vscode.Disposable {
	private lock?: LockFile;
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.emitter.event;
	private readonly subs: vscode.Disposable[] = [];

	constructor(private readonly library: LibraryService) {
		this.subs.push(library.onDidChange(() => void this.reloadLock()));
	}

	dispose(): void {
		this.emitter.dispose();
		this.subs.forEach((d) => d.dispose());
	}

	async reloadLock(): Promise<void> {
		const folder = vscode.workspace.workspaceFolders?.[0];
		try {
			this.lock = folder ? await readLockFile(folder.uri.fsPath) : undefined;
		} catch (err) {
			this.lock = undefined;
			log(`Could not read the lock file: ${(err as Error).message}`);
		}
		this.emitter.fire();
	}

	getChildren(element?: IndexItem): IndexItem[] {
		if (element || this.library.status.kind !== 'ready') {
			return [];
		}
		return this.library.index?.items ?? [];
	}

	getTreeItem(item: IndexItem): vscode.TreeItem {
		const installed = this.lock?.items[item.id]?.version;
		const state = itemState(item, installed);
		const version = item.versions[item.latest];
		const ti = new vscode.TreeItem(item.title, vscode.TreeItemCollapsibleState.None);
		ti.id = item.id;
		ti.contextValue = `skill.${state}`;
		switch (state) {
			case 'notInstalled':
				ti.description = `v${item.latest}`;
				ti.iconPath = new vscode.ThemeIcon('circle-outline');
				break;
			case 'installed':
				ti.description = `v${installed} installed`;
				ti.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
				break;
			case 'updateAvailable':
				ti.description = `v${installed}, update to v${item.latest}`;
				ti.iconPath = new vscode.ThemeIcon('arrow-circle-up', new vscode.ThemeColor('notificationsInfoIcon.foreground'));
				break;
		}
		const md = new vscode.MarkdownString(undefined, true);
		md.appendMarkdown(`**${item.title}** \`${item.id}\`\n\n${item.description}\n\n`);
		md.appendMarkdown(`Latest: ${item.latest}${installed ? `, installed: ${installed}` : ''}\n\n`);
		md.appendMarkdown(`Tools: ${item.tools.join(', ')}`);
		if (version.hasScripts) {
			md.appendMarkdown('\n\n$(warning) Contains scripts');
		}
		ti.tooltip = md;
		return ti;
	}
}
