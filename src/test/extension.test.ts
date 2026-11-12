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

	test('host and repo settings are user-only, so a workspace cannot redirect the token', () => {
		const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'prompt-library')!;
		const props = ext.packageJSON.contributes.configuration.properties;
		assert.strictEqual(props['promptLibrary.githubUrl'].scope, 'application');
		assert.strictEqual(props['promptLibrary.repo'].scope, 'application');
	});

	test('baked-in github-enterprise.uris default takes effect', function () {
		const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'prompt-library')!;
		const baked = ext.packageJSON.contributes.configurationDefaults?.['github-enterprise.uris'];
		if (!baked) {
			this.skip(); // Only present in builds configured for GHE.com or Enterprise Server.
		}
		assert.deepStrictEqual(vscode.workspace.getConfiguration('github-enterprise').get('uris'), baked);
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
