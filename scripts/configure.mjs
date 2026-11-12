#!/usr/bin/env node
// Bakes organization-specific defaults into package.json before packaging.
// CI runs this with values from GitHub Actions variables, so nothing org-specific
// is committed. Users can still override every setting in their user settings.
//
// Environment (all optional; unset means "leave as is"):
//   PROMPT_LIBRARY_REPO         default for promptLibrary.repo, owner/name
//   PROMPT_LIBRARY_GITHUB_URL   default for promptLibrary.githubUrl
//   PROMPT_LIBRARY_PUBLISHER    the extension's publisher id
//   PROMPT_LIBRARY_REPOSITORY   repository URL for the manifest; in CI it defaults
//                               to this repo ($GITHUB_SERVER_URL/$GITHUB_REPOSITORY)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const props = pkg.contributes.configuration.properties;
const env = (name) => (process.env[name] ?? '').trim();
const changes = [];

const repo = env('PROMPT_LIBRARY_REPO');
if (repo) {
	if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
		throw new Error(`PROMPT_LIBRARY_REPO must look like owner/name (got "${repo}").`);
	}
	props['promptLibrary.repo'].default = repo;
	changes.push(`promptLibrary.repo default = ${repo}`);
}

const githubUrl = env('PROMPT_LIBRARY_GITHUB_URL').replace(/\/+$/, '');
if (githubUrl) {
	const url = new URL(githubUrl);
	if (url.protocol !== 'https:') {
		throw new Error('PROMPT_LIBRARY_GITHUB_URL must use https.');
	}
	props['promptLibrary.githubUrl'].default = githubUrl;
	changes.push(`promptLibrary.githubUrl default = ${githubUrl}`);
	if (url.hostname !== 'github.com') {
		// VS Code's own GitHub Enterprise sign-in needs to know the instance.
		pkg.contributes.configurationDefaults = { ...(pkg.contributes.configurationDefaults ?? {}), 'github-enterprise.uris': [githubUrl] };
		changes.push(`github-enterprise.uris default = [${githubUrl}]`);
	}
}

const publisher = env('PROMPT_LIBRARY_PUBLISHER');
if (publisher) {
	if (!/^[a-z0-9][a-z0-9-]*$/i.test(publisher)) {
		throw new Error(`PROMPT_LIBRARY_PUBLISHER is not a valid publisher id (got "${publisher}").`);
	}
	pkg.publisher = publisher;
	changes.push(`publisher = ${publisher}`);
}

const ci = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}.git` : '';
const repository = env('PROMPT_LIBRARY_REPOSITORY') || ci;
if (repository) {
	pkg.repository = { type: 'git', url: repository };
	changes.push(`repository = ${repository}`);
}

writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log(changes.length ? changes.map((c) => `set ${c}`).join('\n') : 'No configuration variables set; package.json unchanged.');
