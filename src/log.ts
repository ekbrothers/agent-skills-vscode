import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLog(context: vscode.ExtensionContext): void {
	channel = vscode.window.createOutputChannel('Prompt Library');
	context.subscriptions.push(channel);
}

/** Never pass tokens or request headers here. */
export function log(line: string): void {
	channel?.appendLine(`[${new Date().toISOString()}] ${line}`);
}

export function showLog(): void {
	channel?.show(true);
}
