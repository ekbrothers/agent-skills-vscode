---
name: prompt-library-sample-tools
description: Sample skill with an extra tools field in its frontmatter. Use when the user asks to run the prompt library tools field check.
tools:
- read
---

# Prompt Library tools field check

This skill carries a `tools:` frontmatter field, which Cortex Code supports and the other tools may not. It exists to confirm that every tool still loads a skill that has extra frontmatter fields.

When invoked:

1. Read `reference.md` in this skill's folder.
2. Reply with one line in this exact form, using the verification code from that file:

   `Prompt Library tools field check passed. Code: <verification code>`

3. Do nothing else. Do not edit files or run commands.

If you cannot read `reference.md`, reply `Prompt Library tools field check failed: supporting file not found.`
