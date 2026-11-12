# Prompts and Skills VS Code Extension

## Recommendation

Build a VS Code extension that installs a shared library of skills (prompts are authored as skills) into a workspace and keeps them updated, for all three tools: Claude Code, GitHub Copilot, and Snowflake Cortex Code ("CoCo").

Default install path is `.claude/skills/<id>/SKILL.md`, because the current docs show all three tools read it. Each tool is still an explicit target with its own adapter, and any tool that fails the Stage 2 visibility check gets its own dedicated path instead.

Distribute the extension through the VS Code Private Marketplace. Pull content from a private repo in the GitHub Enterprise Cloud org. Keep content updates separate from extension updates.

## Working style (rules for Claude Code in this repo)

1. Build in stages. Stop for review after each stage and summarize what is done and what remains.
2. Implement only what is asked. Ask before touching anything not named in the current stage.
3. Classify every proposed change as Small, Medium, or Large. For Large, write the plan and wait for approval.
4. After each component: give a usage example, list edge cases and limitations, and suggest tests.
5. If scope is ambiguous, choose the minimal interpretation or ask. Ask at most a few questions at a time.
6. Verify current vendor docs before relying on any tool path or API (see "Verified facts" for sources and date).
7. No emojis. No em-dashes. Do not put any company name in code, docs, item content, or the extension manifest.
8. Language and tooling: TypeScript, scaffolded with `yo code`.

## Decisions

Confirmed by Evan:
- Deliverable is a VS Code extension.
- Targets all three tools: Claude Code, GitHub Copilot, Snowflake Cortex Code.
- Users must be able to update content continually and automatically from VS Code.
- Distribution is an internal gallery (VS Code Private Marketplace, GitHub Enterprise Cloud org).

Decided by Claude on 2026-11-12 after Evan said "figure it out". Revisit any that turn out wrong:
- Audience: MLOps and data science developers, same as the sister project DIP (its spec covers Python, Streamlit and FastAPI data products on Snowflake).
- Editor: stock VS Code desktop only. The Private Marketplace does not support VS Code Server or Web anyway.
- Content source: the `agent-skills-library` repo. CI builds `index.json` and one archive per item version, attached to a GitHub Release (see "Content repo" below).
- Item types in v1: skills only. Skills may include supporting files (scripts, templates).
- The extension writes only inside its own skill folders. It never edits `CLAUDE.md`, `AGENTS.md`, or `.github/copilot-instructions.md`.
- Install target: workspace only. Installed files and the lock file are committed to the repo.
- Auto-update default: `auto`, overridable by admins. Everyone on latest, no pinning in v1.
- Removal deletes exactly the files recorded in the lock file.
- Security: verify sha256 from the index before writing anything. Show a notice for items that contain scripts.
- Network: proxy support through VS Code networking. No offline cache. No telemetry.
- Scale: under 500 users, under 100 items.

## Verified facts (checked 2026-11-12, re-verify before building)

Skill locations:
- Cortex Code project skills: `.cortex/skills/` or `.claude/skills/`. Global: `~/.snowflake/cortex/skills/`. User: `~/.claude/skills/`. Source: https://docs.snowflake.com/en/user-guide/cortex-code/extensibility
- Cortex Code commands: `.cortex/commands/` or `.claude/commands/` (project), `~/.snowflake/cortex/commands/` (global). Same source.
- Cortex Code also has its own plugin system that installs from Git and updates with `/plugin update`. Source: https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code-plugins
- Copilot in VS Code, project skills: `.github/skills/`, `.claude/skills/`, `.agents/skills/`. Personal: `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`. Skills also show up as slash commands. Source: https://code.visualstudio.com/docs/agent-customization/agent-skills
- Copilot prompt files: `.github/prompts/*.prompt.md`. Custom agents: `.github/agents/*.agent.md`. Skills table at https://skillselion.com/skills/microsoft/vscode-copilot-chat/agent-customization (secondary source, confirm against VS Code docs).
- Claude Code: `.claude/skills/<name>/SKILL.md` (native), `.claude/commands/`, `CLAUDE.md`. Verify against current Claude Code docs.
- Format: Agent Skills open standard, a folder with `SKILL.md` containing `name` and `description` frontmatter. Cortex also supports an optional `tools:` field.

Distribution:
- VS Code Private Marketplace is available to GitHub Enterprise customers. Users sign in with a GitHub Enterprise or Copilot Business or Enterprise account. Extensions can be hosted on any file system or Azure Artifacts. Rollout is by group policy on Windows and macOS. Installed private extensions auto-update. Not supported in VS Code Server or VS Code for the Web.
- Sources: https://code.visualstudio.com/blogs/2025/11/18/privatemarketplace and https://code.visualstudio.com/docs/enterprise/extensions

## Architecture

### Two update layers
- Layer 1, content (we build it): the extension checks the content repo and applies skill updates.
- Layer 2, the extension itself (VS Code handles it): Private Marketplace auto-update. Keep the extension small and stable so it rarely needs a release.

### Modules
- `auth`: `vscode.authentication.getSession('github', ['repo'])`. Anything else goes in `SecretStorage`.
- `indexClient`: fetches `index.json` from the latest release of the content repo.
- `installer`: downloads the archive, verifies sha256, extracts to a temp folder, then renames into place atomically.
- `targets`: the three adapters (claude, copilot, cortex) plus the path resolver (below).
- `lockFile`: reads and writes `.vscode/prompt-library.lock.json`.
- `updateEngine`: compares index to lock, then disk hashes to lock to detect local edits.
- `treeView`: activity bar view listing items with install, update, and remove actions.
- `settings`: see below.

### Target resolution
Logical tools: `claude`, `copilot`, `cortex`. Setting `promptLibrary.tools` defaults to all three.

Setting `promptLibrary.pathStrategy`:
- `shared` (default): every selected tool resolves to `.claude/skills/<id>/`. Paths are deduplicated, so a skill is written once.
- `dedicated`: claude uses `.claude/skills/`, copilot uses `.github/skills/`, cortex uses `.cortex/skills/`.

Why `shared` is the default: it avoids duplicate skill names across locations. Behavior for duplicates is not verified for Cortex, and Copilot gives the primary workspace root precedence. Use `dedicated` only for a tool that fails the Stage 2 check, and then only for that tool.

Each adapter exposes the same small interface: `resolvePath(itemId)`, `transform(item)` (identity for skills in v1), and `describe()`. Do not build prompt-file translation (`.github/prompts/`, `.claude/commands/`) until Evan asks for it.

### `index.json` schema
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-12T00:00:00Z",
  "items": [
    {
      "id": "data-quality-check",
      "type": "skill",
      "title": "Data quality check",
      "description": "One line shown in the tree view",
      "latest": "1.1.0",
      "versions": {
        "1.1.0": {
          "archive": "data-quality-check-1.1.0.tar.gz",
          "sha256": "...",
          "contentHash": "...",
          "hasScripts": false
        }
      },
      "tools": ["claude", "copilot", "cortex"]
    }
  ]
}
```

Notes on the index:
- `archive` is a release asset name, not a path. GitHub release assets cannot contain slashes.
- `sha256` is the archive's hash; the extension verifies it before writing anything.
- `contentHash` hashes the unpacked file tree. The content repo's CI uses it to fail a change that skips a version bump.
- `versions` holds only the latest version per item. Older archives stay on older releases. That is enough for v1 (no pinning).
- Archives are gzipped ustar with files only (no directory entries), paths relative to the skill folder, mtime 0. Executable mode is set on files under `scripts/`.

### Content repo (`agent-skills-library`, sibling folder)
- `skills/<id>/SKILL.md` plus supporting files, and `skills/<id>/item.json` (title, summary, version, tools). `item.json` is not shipped.
- `tooling/build.mjs` validates (id rule, name equals folder, required fields, no em-dashes or emojis, size limit) and writes `dist/`.
- `validate.yml` runs on pull requests. `release.yml` runs on push to `main` and creates a release tagged `content-<date>-<run>`, marked latest, unless nothing changed.
- The extension's `indexClient` reads `index.json` from the latest release.

### Extension release
- `ci.yml`: lint, unit tests, integration tests under xvfb, `vsce package`, uploads the `.vsix` as a build artifact.
- `release.yml`: on a `v*.*.*` tag that matches `package.json`, runs the same checks and attaches the `.vsix` to a GitHub Release. Private Marketplace publishing is a placeholder step until the admin confirms the process.

### Lock file schema (`.vscode/prompt-library.lock.json`)
```json
{
  "schemaVersion": 1,
  "items": {
    "data-quality-check": {
      "version": "1.1.0",
      "files": {
        ".claude/skills/data-quality-check/SKILL.md": "sha256-of-written-file"
      }
    }
  }
}
```
Local edit detection: hash the file on disk and compare to the recorded hash. Store version and per-file hashes from Stage 2 on, so Stage 4 needs no rework.

### Update flow
1. Triggers: `onStartupFinished`, a timer (every few hours while open), and the command "Prompt Library: Check for Updates".
2. Fetch `index.json`. Compare `latest` to the lock file for each installed item.
3. For each item needing an update, hash installed files.
   - Hashes match the lock: update silently.
   - Hashes differ: notification with Overwrite, Keep Mine, Show Diff (`vscode.diff`).
4. After silent updates, show one low-key message ("Updated N skills") with a "View changes" button.

### Settings
- `promptLibrary.autoUpdate`: `off` | `notify` | `auto` (default `auto`)
- `promptLibrary.tools`: array of `claude` | `copilot` | `cortex` (default all three)
- `promptLibrary.pathStrategy`: `shared` | `dedicated` (default `shared`)
- `promptLibrary.repo`: `owner/repo` of the content repo

## Stages

Status (2026-11-12): Stage 2 code is done and tested; the acceptance check below still needs Evan. The content repo and the `.vsix` workflows from Stage 5 were pulled forward at Evan's request.

### Stage 2: scaffold and install
Do:
1. Scaffold the extension with `yo code` (TypeScript, no bundler yet).
2. Bundle one sample skill inside the extension, with one supporting file.
3. Build `targets` (three adapters, `shared` strategy), `installer`, and `lockFile`.
4. Add one command: "Prompt Library: Install Sample Skill".

Acceptance check (Evan runs this, report results back):
1. Run the command in a test workspace.
2. Claude Code: start `claude` in the workspace and confirm the skill is listed and invocable.
3. Copilot: open Copilot Chat, type `/skills`, confirm it is listed.
4. Cortex Code: run `/skill list`, confirm it is listed.
5. If any tool does not see it, report which one. Then add a dedicated path for that tool only.
6. Confirm a sample skill with extra frontmatter fields (for example `tools:`) loads in all three.

Stop and summarize.

### Stage 3: index, auth, tree view
- GitHub sign-in, fetch `index.json`, tree view with install actions.
- First check whether SAML SSO or OAuth app restrictions block the sign-in. Report before building further.

### Stage 4: update engine
- Triggers, silent update, local edit handling, diff view, `autoUpdate` setting.

### Stage 5: removal, packaging, publish
- Uninstall driven by the lock file, `vsce package`, publish to the Private Marketplace.

## Risks and unknowns
- The test content repo `github.com/ekbrothers/agent-skills-library` is public. The real content repo must be private in the GitHub Enterprise Cloud org.
- SSO: the built-in GitHub sign-in may need org approval. Test in Stage 3.
- Duplicate skill names across `.claude/skills/` and `.cortex/skills/` or `.github/skills/`. Avoided by the `shared` strategy.
- Unknown frontmatter fields may behave differently per tool. Covered by the Stage 2 check.
- Cortex Code CLI and CoCo Desktop may discover skills differently. Test both if users use both.
- Private Marketplace needs an admin. Lead time unknown.

## Questions to put to people (exact wording)
To the IDE or developer tooling admin: "Is the VS Code Private Marketplace deployed for us? Who administers it, and what is the process and lead time to publish an internal extension?"

To the GitHub org owner: "Is SAML SSO enforced, and are OAuth apps restricted? Is the built-in VS Code GitHub sign-in approved, and can a private repo's release assets be read with that token?"

## Related
- DIP (Data Innovation Platform) is the sister project. Same audience, and the same no-company-name rule applies here.
