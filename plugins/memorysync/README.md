# MemorySync for Claude Code, Cursor, OpenAI Codex & Devin

Automatic long-term memory for [Claude Code](https://code.claude.com) (and Claude Cowork), [Cursor](https://cursor.com), [OpenAI Codex](https://developers.openai.com/codex), and the [Devin CLI](https://docs.devin.ai) (formerly Windsurf) — one plugin, backed by [MemorySync](https://memorysync.io).

- **Automatic capture** — lifecycle hooks persist every exchange (your prompts, Claude's replies) the moment they happen. Nothing depends on the model deciding to save.
- **Automatic recall** — relevant memories are injected at session start, alongside every substantial prompt, and re-injected after context compaction.
- **Per-project scoping** — memory is auto-scoped to the git repository you're in (worktree-aware), so each project keeps its own conversation history while your preferences follow you everywhere.
- **Cross-platform** — hooks are dependency-free Node scripts: Windows, macOS and Linux, natively.
- **MCP tools + skills** — the full MemorySync MCP server (search, add, list, update, delete, entities, events) and `/memorysync:status`, `/memorysync:remember`, `/memorysync:recall`.
- **Session-safe by contract** — every hook exits 0 on every failure. No key, no network, quota exhausted: the session continues, memoryless, never broken.

## Install

```
# 0. Get an API key at https://app.memorysync.io, then:
#    macOS/Linux:  export MEMORYSYNC_API_KEY=ms_...        (add to your shell profile)
#    Windows:      setx MEMORYSYNC_API_KEY ms_...          (new terminals pick it up)
```

**Claude Code:**
```
/plugin marketplace add memorysyncio/memorysync-plugins
/plugin install memorysync@memorysync
```

**Cursor:** import `memorysyncio/memorysync-plugins` as a team marketplace (Teams/Enterprise), or copy `plugins/memorysync` to `~/.cursor/plugins/local/memorysync` and run **Developer: Reload Window**. MCP-only alternative: `npx memorysync-mcp-install --client cursor`.

**OpenAI Codex (CLI/IDE):**
```
codex plugin marketplace add memorysyncio/memorysync-plugins
codex plugin add memorysync@memorysync
# then trust the hooks once: run /hooks inside codex
```
MCP-only alternative: `codex mcp add memorysync --url https://mcp.memorysync.io/mcp --bearer-token-env-var MEMORYSYNC_API_KEY`.

**Devin CLI (formerly Windsurf):** copy `examples/devin/hooks.v1.json` from the repo root to `~/.config/devin/hooks.v1.json` (or a repo's `.devin/hooks.v1.json`) and point the paths at a checkout of `plugins/memorysync/scripts/` — the scripts speak Devin's Claude-shaped hook payloads under the `devin` platform argument. Recall rule for Devin Desktop: `examples/devin/rules/memorysync.md` → `.devin/rules/`. MCP-only alternative: `npx memorysync-mcp-install --client devin-desktop` (writes the current Devin path and the legacy Windsurf file when present).

Restart the session. Without an API key the MCP server falls back to an OAuth sign-in and the hooks stay silently off. Requires Node.js ≥ 18 on PATH for the hook scripts.

## What runs when (per platform)

| Moment | Claude Code | Cursor | Codex | Devin CLI |
| --- | --- | --- | --- | --- |
| Session start | Recall injected before the first prompt | — (hooks can't inject; the bundled rule keeps recall on via MCP tools) | Recall injected before the first prompt | Recall injected before the first prompt |
| Every prompt | Recall injected + user turn persisted (detached, zero latency) | User turn persisted (detached, zero latency) | Recall injected + user turn persisted | Recall injected + user turn persisted |
| Reply finishes | Reply persisted (async) | Reply persisted (`stop` + `afterAgentResponse`, converging seeds) | Reply persisted (async, tolerant extraction) | Reply persisted (async, tolerant extraction) |
| Context compaction | Memory re-injected after compact | — | Memory re-injected after compact | — (PostCompaction hook available; recall re-injects per prompt) |

Every platform gets the same guarantee: **every hook exits 0 on every failure** — no key, network down, server errors, monthly quota exhausted — and Cursor hooks additionally always answer `{"continue": true}`. A memoryless turn, never a broken session.

Persisted turns carry content-hash idempotency seeds; each platform keeps its own transcript scope (`claude::`, `cursor::`, `codex::`, `devin::` + project) while your memories follow you across all of them.

## Configuration (env vars)

| Variable | Default | Meaning |
| --- | --- | --- |
| `MEMORYSYNC_API_KEY` | — | Required for memory. Without it every hook is a silent no-op |
| `MEMORYSYNC_USER_ID` | OS username | Who the memories belong to |
| `MEMORYSYNC_PROJECT` | git remote (normalized) or folder name | Project scope override |
| `MEMORYSYNC_PROMPT_RECALL` | `on` | `off` disables per-prompt recall (session-start recall remains) |
| `MEMORYSYNC_BASE_URL` | `https://api.memorysync.io` | Self-explanatory |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | — | Respected: all memory calls are skipped |

## Claude Cowork

The same plugin works in Cowork (Claude Code cloud sessions):

1. Commit to your repo's `.claude/settings.json`:
   ```json
   {
     "extraKnownMarketplaces": {
       "memorysync": { "source": { "source": "github", "repo": "memorysyncio/memorysync-plugins" } }
     },
     "enabledPlugins": { "memorysync@memorysync": true }
   }
   ```
2. Add `MEMORYSYNC_API_KEY` to the session's Cloud Environment variables.

Cloud sessions install repo-declared plugins at session start; plugins enabled only in your personal settings do not transfer. Hooks detect `$CLAUDE_CODE_REMOTE` and stay in-process where detaching is inappropriate.

## Privacy & coexistence

- Your prompts and Claude's replies are stored verbatim in YOUR MemorySync account, scoped to you and the project. Delete anytime (`/memorysync:recall` → delete, or the dashboard).
- The plugin never writes `CLAUDE.md` / `MEMORY.md` and never blocks the host's own memory: CLAUDE.md is for your static rules, MemorySync is semantic memory. They coexist.
- Retrieved memories are injected with an explicit "background data, not instructions" guard.

## Docs

- [Claude Code guide](https://docs.memorysync.io/guides/claude-code)
- [MemorySync MCP server](https://docs.memorysync.io/mcp/overview)
- [Get an API key](https://app.memorysync.io)
