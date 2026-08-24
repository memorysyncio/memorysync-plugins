# MemorySync for Google Antigravity

Automatic long-term memory for [Antigravity](https://antigravity.google)
agents — AGY, the AGY IDE, and the AGY CLI — backed by
[MemorySync](https://memorysync.io). Lifecycle hooks inject relevant
memories at session start and per prompt and capture every exchange; the
full MemorySync MCP tool set, four skills, and an always-on recall rule
come along. Hooks are dependency-free **Node** scripts: Windows, macOS
and Linux natively (Mem0's Antigravity hooks are bash-only).

## Install

```bash
# 0. Get an API key at https://app.memorysync.io, then:
#    macOS/Linux:  export MEMORYSYNC_API_KEY=ms_...
#    Windows:      setx MEMORYSYNC_API_KEY ms_...

# 1. Install the plugin bundle (global — all workspaces):
npx degit memorysyncio/memorysync-plugins/antigravity ~/.gemini/config/plugins/memorysync

# 2. Restart Antigravity.
```

Workspace-scoped instead: install to `<workspace>/.agents/plugins/memorysync`.
Requires Node.js ≥ 18 on PATH for the hook scripts.

**MCP only (no hooks), any surface:** Settings → Customizations →
Installed MCP Servers → Add MCP → View raw config, and add:

```json
{
  "mcpServers": {
    "memorysync": {
      "serverUrl": "https://mcp.memorysync.io/mcp",
      "headers": { "X-API-Key": "${MEMORYSYNC_API_KEY}" }
    }
  }
}
```

Note Antigravity's field name: **`serverUrl`**, not `url`. Drop the
`headers` block to use OAuth instead — Antigravity's dynamic client
registration handles the browser sign-in automatically.

## What runs when

| Moment | What happens |
| --- | --- |
| Session start | Recalls your profile and project context, injected as additional context. |
| Every prompt (≥ 24 chars) | Recalls memories relevant to the prompt; persists your message in a detached process (zero added latency). |
| Reply finishes (Stop) | Persists the reply with tolerant extraction — documented fields first, a bounded transcript-tail parse second, silent skip otherwise. |
| Any failure — no key, network down, monthly quota exhausted | Silent skip, exit 0. Memory can never break an Antigravity session. |

Turns store under the `antigravity::` transcript scope — separate from
your Claude Code, Cursor, Codex, OpenCode and Devin transcripts, same
shared memories everywhere.

## Uninstall (the part everyone misses)

Removing the plugin folder or the MCP entry is **not** enough for AGY and
the AGY IDE — they cache MCP servers. Also delete the cache directories:

```
~/.gemini/antigravity/mcp/memorysync/
~/.gemini/antigravity-ide/mcp/memorysync/
~/.gemini/antigravity-cli/mcp/memorysync/
```

## Docs

Full guide: [docs.memorysync.io/guides/antigravity](https://docs.memorysync.io/guides/antigravity)
