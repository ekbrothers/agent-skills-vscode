import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
	test('registers the install command', async () => {
		const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'prompt-library');
		assert.ok(ext, 'extension not found');
		await ext.activate();
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('promptLibrary.installSampleSkill'));
	});
});
