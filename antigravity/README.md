# MemorySync for Google Antigravity

Automatic long-term memory for [Antigravity](https://antigravity.google)
agents — AGY, the AGY IDE, and the AGY CLI — backed by
[MemorySync](https://memorysync.io). Lifecycle hooks inject relevant
memories at session start and per prompt and capture the durable facts in
your prompts; the full MemorySync MCP tool set, four skills, and an
always-on recall rule come along. Hooks are dependency-free **Node**
scripts: Windows, macOS and Linux natively (Mem0's Antigravity hooks are
bash-only).

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
| Every prompt | Recalls memories relevant to the prompt (prompts of 24+ characters); sends your message for fact extraction in a detached process (zero added latency) — only the durable facts in it are stored. |
| Reply finishes (Stop) | Nothing is sent — assistant replies are not stored. |
| Any failure — no key, network down, monthly quota exhausted | Silent skip, exit 0. Memory can never break an Antigravity session. |

Facts captured here carry the `antigravity::` session key (plus the
project), which tells them apart from facts captured in Claude Code,
Cursor, Codex, OpenCode and Devin; the memories themselves are shared
everywhere. A retried or redelivered hook is recognised server-side, so
a prompt's facts are extracted once.

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
