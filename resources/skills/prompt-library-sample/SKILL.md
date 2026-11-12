---
name: prompt-library-sample
description: Sample skill that confirms the Prompt Library extension installed skills correctly. Use when the user asks to run the prompt library sample check.
---

# Prompt Library sample check

This skill exists to prove that skills installed by the Prompt Library extension are discovered and that their supporting files can be read.

When invoked:

1. Read `reference.md` in this skill's folder.
2. Reply with one line in this exact form, using the verification code from that file:

   `Prompt Library sample check passed. Code: <verification code>`

3. Do nothing else. Do not edit files or run commands.

If you cannot read `reference.md`, reply `Prompt Library sample check failed: supporting file not found.`
