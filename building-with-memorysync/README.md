# Build with MemorySync — the builder plugin

Helps Claude Code, Cursor, Codex, and any AgentSkills-compatible coding
agent **build applications that use [MemorySync](https://memorysync.io)**.
Ask the agent to design, review, or debug a MemorySync integration — it
uses the `building-with-memorysync` skill for decision rules and the
bundled zero-auth `memorysync-docs` MCP server for current API details.
If the skill and the live docs ever disagree, the live docs win.

This is the **builder** plugin. It is separate from the `memorysync`
runtime plugin (automatic memory for your own sessions) on purpose:
install this one when you are *writing code against the MemorySync API*.

## Install

**Claude Code (marketplace):**

```
/plugin marketplace add memorysyncio/memorysync-plugins
/plugin install building-with-memorysync@memorysync
```

**Any client, skill only (skills.sh standard):**

```bash
npx skills add https://github.com/memorysyncio/memorysync-plugins --skill building-with-memorysync
```

**Manual (cross-client convention):** copy `skills/building-with-memorysync/`
into `.agents/skills/` (project) or `~/.agents/skills/` (personal) —
Claude Code also reads `.claude/skills/`.

**Docs MCP only** (no skill): add `https://docs.memorysync.io/mcp` as an
HTTP MCP server — no auth required.

## What the skill teaches

- **Source authority**: query the `memorysync-docs` MCP first
  (`search_docs`, `read_doc`, `list_doc_sections`, and the
  `implement_with_memorysync` prompt) — never invent endpoints.
- **Scope**: header-enforced isolation — `X-API-Key`, `X-End-User-ID`,
  `X-Project-ID` — and how to choose per-user vs shared memory.
- **Ingest**: facts vs verbatim turns (idempotency seeds) vs batches
  (207 per-item outcomes).
- **Retrieve**: semantic query, hierarchical recall, the fallback chain,
  and the background-data guard.
- **Evaluate**: mint a self-serve evaluation key
  (`POST /evaluation/keys` — no signup), run the round-trip proof, and
  understand the quota contract (strict 429s on evaluation plans, silent
  degradation in production).
- **Hard invariants**: never store secrets, never touch
  `DELETE /memory/user/purge`, fail open inside user sessions.

## Starter prompt

```
You are integrating MemorySync into my app.
- Use the memorysync-docs MCP server (or https://docs.memorysync.io/llms.txt)
  before inventing any endpoint or parameter.
- Follow the building-with-memorysync skill for scoping, ingest, retrieval,
  and the evaluation loop.
- Prove the integration with a minted evaluation key before asking me for one.
```

Full guide: [docs.memorysync.io/guides/agent-built-integrations](https://docs.memorysync.io/guides/agent-built-integrations)
