import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
	test('registers its commands', async () => {
		const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'prompt-library');
		assert.ok(ext, 'extension not found');
		await ext.activate();
		const commands = await vscode.commands.getCommands(true);
		for (const id of [
			'promptLibrary.installSampleSkill',
			'promptLibrary.installItem',
			'promptLibrary.updateItem',
			'promptLibrary.refresh',
			'promptLibrary.signIn',
			'promptLibrary.showLog',
		]) {
			assert.ok(commands.includes(id), id);
		}
	});

	test('every contributed command is registered', async () => {
		const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'prompt-library')!;
		await ext.activate();
		const registered = new Set(await vscode.commands.getCommands(true));
		for (const c of ext.packageJSON.contributes.commands as { command: string }[]) {
			assert.ok(registered.has(c.command), c.command);
		}
	});
});
