# Prompt Library

A VS Code extension that installs a shared library of agent skills into a workspace for Claude Code, GitHub Copilot, and Cortex Code.

Status: Stage 2. The extension installs a bundled sample skill. Fetching from a content repo, updates and removal come in later stages (see `CLAUDE.md`).

## Commands

- **Prompt Library: Install Sample Skill** installs one of the bundled sample skills into the open workspace and records it in `.vscode/prompt-library.lock.json`.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `promptLibrary.tools` | `["claude", "copilot", "cortex"]` | Tools to install skills for. |
| `promptLibrary.pathStrategy` | `shared` | `shared` writes each skill once to `.claude/skills/<id>/`, which all three tools read. `dedicated` writes to `.claude/skills/`, `.github/skills/` and `.cortex/skills/` per tool. |

## Development

```
npm install
npm run test:unit   # fast, plain Node
npm test            # full suite inside a VS Code test instance
```

Press F5 to launch an Extension Development Host.
