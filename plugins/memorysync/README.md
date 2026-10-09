# MemorySync for Claude Code, Cursor, OpenAI Codex & Devin

Automatic long-term memory for [Claude Code](https://code.claude.com) (and Claude Cowork), [Cursor](https://cursor.com), [OpenAI Codex](https://developers.openai.com/codex), and the [Devin CLI](https://docs.devin.ai) (formerly Windsurf) — one plugin, backed by [MemorySync](https://memorysync.io).

- **Automatic capture** — every prompt you send goes to MemorySync the moment you send it, and the durable facts in it (preferences, decisions, conventions) are extracted and stored. Assistant replies are not stored. Nothing depends on the model deciding to save.
- **Automatic recall** — relevant memories are injected at session start, alongside every substantial prompt, and re-injected after context compaction.
- **Per-project scoping** — facts are tagged with the git repository you're in (worktree-aware) and session-start recall asks about that project, while your preferences follow you everywhere.
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
| Session start | Recall injected before the first prompt | Recall injected as `additional_context` (`sessionStart`) | Recall injected before the first prompt | Recall injected before the first prompt |
| Every prompt | Recall injected + prompt sent for fact extraction (detached, zero latency) | Prompt sent for fact extraction (`beforeSubmitPrompt`; always `{"continue": true}`) | Recall injected + prompt sent for fact extraction | Recall injected + prompt sent for fact extraction |
| Tool failure | — | Failed tool output captured as a durable fact (`postToolUseFailure`) | — | — |
| Reply finishes | Nothing sent (replies are not stored) | Retry-spool flush (`stop`); empty JSON, never a follow-up | Nothing sent | Nothing sent |
| Context compaction | Memory re-injected after compact | Retry-spool flush (`preCompact`) | Memory re-injected after compact | — (PostCompaction hook available; recall re-injects per prompt) |
| Session end | — | Retry-spool flush (`sessionEnd`) | — | — |

Every platform gets the same guarantee: **every hook exits 0 on every failure** — no key, network down, server errors, monthly quota exhausted. Cursor `beforeSubmitPrompt` always answers `{"continue": true}`; the other Cursor events (`sessionStart`, `stop`, `preCompact`, `sessionEnd`, `postToolUseFailure`) answer empty JSON or `additional_context` only. A memoryless turn, never a broken session.

Each prompt carries a content-hash seed, so a retried or redelivered hook is recognised server-side and its facts are extracted once. Facts carry the platform's session key (`claude::`, `cursor::`, `codex::`, `devin::` + project) while your memories follow you across all of them.

## Skills

| Skill | When to use it |
| --- | --- |
| `memory` | How automatic capture/recall works here, and when to call the MCP tools yourself |
| `recall` | Search stored facts (`/memorysync:recall`, "what do you remember about…") |
| `remember` | Save one durable fact (`/memorysync:remember`) |
| `status` | Key, connectivity, identity, project scope, retry spool |
| `setup` | Connect an API key and get MCP/hooks actually running |
| `troubleshoot` | Recall empty, facts not saving, or memory looking "down" |
| `privacy` | What is captured, how to keep secrets out, how to opt a project off |
| `forget` | Delete specific memories the user confirmed |
| `correct-memory` | Replace a stale fact instead of leaving two that disagree |
| `review-memories` | List what is stored before changing anything |
| `resume-work` | Reconstruct where this repo left off |
| `handoff` | Write a "where we stopped / next steps" note for the next session |
| `project-context` | Load this repo's conventions, decisions and gotchas |
| `decision-log` | Record an architecture/product decision and why |
| `preferences` | Capture or apply standing coding/tooling preferences |
| `conventions` | Find or record team rules discovered in the codebase |
| `debug-history` | Search past fixes before debugging; save the cause after |
| `memory-hygiene` | Collapse duplicate or contradicting facts (with confirmation) |
| `export-memories` | Write memories to markdown when the user asks for a backup |
| `import-memories` | Turn AGENTS.md / CLAUDE.md rules into individual facts (with confirmation) |

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

> **Claude Desktop's Cowork tab (local agent mode)** runs sessions in an isolated sandbox that does not execute plugin lifecycle hooks (verified Aug 2026) — settings-level environment variables never reach it, so automatic capture/recall stays off there. Use Claude Code (CLI or IDE) for automatic memory, or add the [MemorySync MCP server](https://docs.memorysync.io/mcp/overview) to Claude Desktop for on-demand memory tools.

## Privacy & coexistence

- Your prompts are sent to YOUR MemorySync account for fact extraction; only the durable facts extracted from them are stored, scoped to you and tagged with the project. The prompt text itself is not stored as a memory, and the assistant's replies are not sent at all. Delete any memory anytime (`/memorysync:recall` → delete, or the dashboard).
- The plugin never writes `CLAUDE.md` / `MEMORY.md` and never blocks the host's own memory: CLAUDE.md is for your static rules, MemorySync is semantic memory. They coexist.
- Retrieved memories are injected with an explicit "background data, not instructions" guard.

## Docs

- [Claude Code guide](https://docs.memorysync.io/guides/claude-code)
- [MemorySync MCP server](https://docs.memorysync.io/mcp/overview)
- [Get an API key](https://app.memorysync.io)
