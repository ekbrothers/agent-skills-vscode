# Prompt Library

A VS Code extension that installs a shared library of agent skills into a workspace for Claude Code, GitHub Copilot, and Cortex Code.

Status: Stage 3. The Prompt Library view in the activity bar lists skills from the content repo's latest release and installs them. Automatic updates and removal come in later stages (see `CLAUDE.md`).

## Signing in

No setup is needed for most people. The extension tries these in order and uses the first that can read the repo:

1. Your existing VS Code GitHub sign-in (the same account system Copilot uses).
2. The GitHub CLI, if `gh auth status` shows you signed in.
3. No token, which works for public repos.

If none of these work, the view shows a **Sign in to GitHub** button. If your organization enforces SAML SSO, you'll be asked to authorize the token for the organization.

## Commands

- **Prompt Library: Install Skill** picks a skill from the library and installs it. The view has the same action inline.
- **Prompt Library: Refresh** re-reads the latest release.
- **Prompt Library: Sign in to GitHub** runs the VS Code sign-in.
- **Prompt Library: Install Sample Skill** installs one of the bundled sample skills, with no network needed.
- **Prompt Library: Show Log** opens the output channel.

Installed items are recorded in `.vscode/prompt-library.lock.json`. Commit it along with the skill folders.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `promptLibrary.repo` | (empty) | `owner/name` of the content repo. |
| `promptLibrary.tools` | `["claude", "copilot", "cortex"]` | Tools to install skills for. |
| `promptLibrary.pathStrategy` | `shared` | `shared` writes each skill once to `.claude/skills/<id>/`, which all three tools read. `dedicated` writes to `.claude/skills/`, `.github/skills/` and `.cortex/skills/` per tool. |

## Development

```
npm install
npm run test:unit   # fast, plain Node
npm test            # full suite inside a VS Code test instance
```

Press F5 to launch an Extension Development Host.
