---
name: setup
description: Get MemorySync working in this agent — API key, MCP authentication, and project scoping. Use when hooks or MCP tools are missing, the user asks how to install or connect MemorySync, or whoami/status shows they are not authenticated.
---

# Setup

1. Call the `status` skill's MCP check: `whoami`. If it fails or `authenticated` is false, there is no usable key on this connection.
2. The user creates a key at https://app.memorysync.io (never ask them to paste an existing key into chat). They set `MEMORYSYNC_API_KEY` in the environment the agent actually inherits:
   - Cursor: Plugins → MemorySync → Configure, or a user/environment variable the MCP header `${env:MEMORYSYNC_API_KEY}` can see.
   - Claude Code: `export MEMORYSYNC_API_KEY=ms_...` in the shell profile.
   - Codex: the same env var, or `--bearer-token-env-var MEMORYSYNC_API_KEY` on the MCP add command.
3. Optional overrides, used by the hooks in `scripts/lib.mjs`: `MEMORYSYNC_USER_ID` (defaults to the OS username), `MEMORYSYNC_PROJECT` (defaults to the git origin, then the folder name), `MEMORYSYNC_BASE_URL` (defaults to https://api.memorysync.io).
4. Restart the agent session after setting the key. Hooks stay silently off without it; they never break the session.
5. If tools exist but writes fail, `whoami` — `can_write` / `can_delete` reflect the key's scopes. A read-only key cannot `add_memory`.

## Rules

- Never store, echo or commit the API key, a token, or a password.
- If a memory tool fails, continue the user's actual task; setup is an enhancement.
