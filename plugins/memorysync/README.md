# MemorySync for Claude Code & Claude Cowork

Automatic long-term memory for [Claude Code](https://code.claude.com) and Claude Cowork, backed by [MemorySync](https://memorysync.io).

- **Automatic capture** — lifecycle hooks persist every exchange (your prompts, Claude's replies) the moment they happen. Nothing depends on the model deciding to save.
- **Automatic recall** — relevant memories are injected at session start, alongside every substantial prompt, and re-injected after context compaction.
- **Per-project scoping** — memory is auto-scoped to the git repository you're in (worktree-aware), so each project keeps its own conversation history while your preferences follow you everywhere.
- **Cross-platform** — hooks are dependency-free Node scripts: Windows, macOS and Linux, natively.
- **MCP tools + skills** — the full MemorySync MCP server (search, add, list, update, delete, entities, events) and `/memorysync:status`, `/memorysync:remember`, `/memorysync:recall`.
- **Session-safe by contract** — every hook exits 0 on every failure. No key, no network, quota exhausted: the session continues, memoryless, never broken.

## Install

```
# 1. Get an API key at https://app.memorysync.io, then:
#    macOS/Linux:  export MEMORYSYNC_API_KEY=ms_...        (add to your shell profile)
#    Windows:      setx MEMORYSYNC_API_KEY ms_...          (new terminals pick it up)

# 2. In Claude Code:
/plugin marketplace add memorysyncio/memorysync-plugins
/plugin install memorysync@memorysync
```

Restart the session. That's it — the next session starts with what MemorySync knows about you, and everything you discuss is remembered. Without an API key the MCP server falls back to an OAuth sign-in and the hooks stay silently off.

Requires Node.js ≥ 18 on PATH (for the hook scripts). Verify anytime with `/memorysync:status`.

## What runs when

| Moment | What happens |
| --- | --- |
| Session start / resume / clear | Recalls your profile + this project's context, injects it before the first prompt |
| Every prompt (≥ 24 chars) | Recalls memories relevant to that prompt; persists your message in a detached process (zero added latency) |
| Claude finishes replying | Persists the reply (`Stop` hook, async) |
| Context compaction | Re-injects memory after the compact, so long sessions never go amnesiac |

Persisted turns carry content-hash idempotency seeds — retries and replays converge on one stored row, and turns stored here can never double-store against MemorySync SDK writes.

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
