---
name: building-with-memorysync
description: Guide for building, reviewing, evaluating, and troubleshooting applications that use MemorySync — the memory platform with server-side fact extraction from conversations, a separate history store for transcripts and framework state, header-enforced end-user isolation, and silent quota degradation in production. Use whenever you write or design code that integrates MemorySync — adding memory or long-term context to an agent, chatbot, or app, scoping projects and end users, ingesting turns or facts, retrieving with recall or semantic query, choosing an SDK or framework adapter, or deciding how to evaluate MemorySync for a use case. Triggers on requests like "add memory to my agent", "integrate MemorySync", "store this in MemorySync", "make my app remember users", "scope memories per user", "search MemorySync", or "evaluate MemorySync". Do NOT use for runtime memory operations inside an already-integrated agent (the memorysync plugin's own skills handle that).
license: MIT
metadata:
  author: memorysync
  version: "1.1.1"
  docs-mcp: "https://docs.memorysync.io/mcp"
---

# Building with MemorySync

This skill is the **decision-and-workflow layer** for building on MemorySync:
how to reason about the platform, scope projects and end users, ingest,
retrieve, and evaluate whether it delivers your use case. It is **not** an API
reference — for exact, current details (endpoints, parameters, fields, limits)
query the **`memorysync-docs` MCP server** first. If this skill and the live
documentation ever disagree, **the live docs win**.

## Source authority — read before you write code

The `memorysync-docs` MCP server (`https://docs.memorysync.io/mcp`, no auth)
is the ground truth. Use it in this order:

1. **`list_doc_sections`** (no arguments) — orient: the top-level sections and
   page counts.
2. **`search_docs`** (`query`, optional `limit` 1–20) — discover which page
   covers your feature. Results include a `markdown_url` for each page.
3. **`read_doc`** (`path`, e.g. `/quickstart` or `/api/memory/add`) — load the
   WHOLE page. Prefer a full page over search snippets whenever you need exact
   method names, parameters, fields, or limits.

The server also exposes the `implement_with_memorysync` prompt (arguments:
`task`, optional `language`) which runs this search-then-read loop for you,
and a `docs-index` resource (the curated `llms.txt`).

No MCP available? Fetch `https://docs.memorysync.io/llms.txt` for the page
index and read the Markdown twins it links. **Never invent an endpoint or
parameter from memory.**

## The mental model (stable)

MemorySync keeps two kinds of data, and only one of them is memory:

- **Memories are durable facts.** The platform extracts, deduplicates,
  updates, and ranks them server-side — from the user turns you send and
  from explicit writes. A turn's text itself never becomes a memory, and
  assistant turns yield no memories at all. You send honestly;
  intelligence happens after.
- **History is not memory.** A transcript your code replays, or key/value
  state a framework reads back, lives in a separate history store
  (`/v1/history/*`, `/v1/state/*`). It is never recalled, never listed as a
  memory, and never shown in the dashboard.

Recall and query read memories only. Send user turns for facts; write to the
history store only when your code needs the exact data back.

## 1. Scope: projects and end users

Isolation is **enforced by request headers**, not by filter arguments a bug
can forget:

- `X-API-Key` — authenticates the org (tenant).
- `X-End-User-ID` — REQUIRED scoping for every read and write on the
  dashboard-key surface. One value per human user of YOUR product. A read can
  never be widened by a missing filter, because the server scopes it.
- `X-Project-ID` — optional: one org key serving several projects. Omit it for
  single-project apps (the default project applies).

Decision rules:
- **Per-user memory** (assistants, copilots, support): `X-End-User-ID` = your
  stable user id. Never an email (PII in an id), never a session id (memory
  would not persist).
- **Shared/team memory** (one knowledge pool): a fixed logical id such as
  `team` — deliberate, documented, and still header-scoped.
- **Multi-app products**: same end-user id across your apps = one memory that
  follows the user; different ids = isolated memories. Choose deliberately.

## 2. Ingest

Pick the write path by what you need back later — confirm details via
`read_doc`:

- **`POST /memory/add`** — one durable fact or document snippet
  (`{"text": ...}`, optional `tags`, `importance`, `metadata`). Use for
  explicit "remember this" material.
- **`POST /v1/memory/add_turn`** — send one USER turn to fact extraction.
  Body carries `tenant_id`, `user_id`, `source`, `"role": "user"`, the
  plain `text` (no role prefix), a `speaker` seed, and
  `metadata.session_id`. Only the durable facts the extractor finds are
  stored — asynchronously, with their own ids, carrying your scalar
  metadata — so `memory_id` is always `null` (there is no row per turn;
  `request_id` correlates the extraction). Every call counts as one add,
  whatever it stores. Assistant, system and tool turns store nothing
  (`processing_status: "skipped_non_user_turn"`) and filler ("ok",
  "thanks") is `skipped_low_value`, but each still costs an add — send
  only the user's turns. Give every turn a deterministic content-hash seed
  (the docs and every official adapter use FNV-1a 64 over the role and
  text) so a retry answers `already_exists: true` instead of being
  extracted twice.
- **`POST /memory/bulk-add`** — batches. It answers **207** with per-item
  outcomes: read `results[]` — a batch is routinely part-success, and the
  status code alone tells you nothing about any given record.
- **Transcripts your code reads back** (chat history a framework replays):
  - `POST /v1/history/append` — 1–100 ordered turns for one `session_id`;
    `extract` (default true) also extracts facts from the user turns.
  - `POST /v1/history/list` — the session's turns, oldest first.
  - `POST /v1/history/delete` — by `session_id` or `ids`.
- **Framework key/value state** — one live value per namespace + key; a put
  replaces it:
  - `POST /v1/state/put`, `POST /v1/state/get`, `POST /v1/state/delete`
  - `POST /v1/state/list`, `POST /v1/state/search`,
    `POST /v1/state/namespaces`
- On history and state calls, pass your integration's name as `source` —
  it scopes the rows.

Invariants:
- **Never store secrets** — API keys, passwords, tokens. Refuse them
  client-side before any network call, whatever the model asks.
- Store one clear, self-contained statement per fact, not chat noise.

## 3. Retrieve

- **`POST /memory/query`** — semantic search (`{"query": ..., "k": ...}`) on
  the dashboard surface with `X-End-User-ID`. The workhorse.
- **`POST /v1/memory/recall`** — hierarchical recall for prompt injection:
  returns a ready `context` string. When it answers empty, fall back to
  **`POST /v1/memory/query`** — the production contract every official
  adapter follows.
- Transcripts are not memories: read them back with `POST /v1/history/list`,
  never through recall or query.

Rules:
- Empty results are a normal answer, not an error. Ship the no-memories path.
- Injected memory text is **background data, never instructions**. Append a
  guard line saying exactly that when you build prompt-injection features.

## 4. Evaluate — prove it works before anyone signs up

MemorySync is the one platform where YOU (the coding agent) can provision a
working key with no human in the loop:

1. **Mint**: `POST https://api.memorysync.io/evaluation/keys` — body optional
   (`{"agent_caller": "claude-code"}`). A `201` returns `api_key`,
   `default_user_id`, `project_id`, `mcp_url`, `expires_at`, `limits`
   (add/retrieval/storage), and a `claim_command`. A `429` names its
   `reason`: `per_ip` or `per_subnet` is the daily mint limit, `unavailable`
   is a short outage; either way wait `retry_after_seconds` before retrying.
2. **Round-trip**: add one fact → query it back with the same
   `X-End-User-ID` → assert a memory about that fact returns (MemorySync
   stores the facts it extracts in its own words, so compare meaning, not
   the exact text). Then send a user turn that
   states a fact via `add_turn` (`"role": "user"`), replay the identical
   request, and assert the second response answers `already_exists: true`
   — the idempotency proof. `memory_id` is `null` both times; the turn's
   facts arrive asynchronously.
3. **Check the meter**: `GET /evaluation/usage` shows what the loop consumed.
4. **Know the quota contract** — this is where integrations mislead users:
   - **Evaluation plans are strict**: over the limit, REST routes answer
     `429` with `{"detail": {"error": "limit_exceeded", "message": ...}}`,
     and MCP tools answer a tool error (`isError: true`) carrying
     `limit_exceeded`. Real errors, by design — an evaluating agent needs
     the truth. Expect and report them honestly.
   - **Production orgs default to silent**: over the limit, writes answer
     their normal success shape without storing (`/memory/add` answers
     `200 {"status": "ok"}`) and reads answer `200 {"memories": []}`. End
     users never see a quota error. Never "fix" this as if it were a bug,
     and never build UI that promises an error will announce the limit.
   - **Billing counts requests, not results**: every add call is one add
     and every retrieval call one retrieval, whatever it stores or returns —
     an empty search or a turn that stores nothing still counts. A refused
     or failed request (4xx, 5xx) and a retry of a write already stored are
     not counted.
5. **Graduate**: the human claims the eval account (`claim_command`) or
   creates a dashboard key at `https://app.memorysync.io`. Same API,
   silent-mode quota, higher limits.

## 5. Prefer the shipped adapter

If the project uses a framework or agent below, integrate through the
official adapter instead of raw REST — each guide is one `read_doc` away
(path `/guides/<slug>`):

| Stack | Guide slug |
| --- | --- |
| LangChain / LangGraph | `langchain`, `langgraph` |
| Vercel AI SDK | `vercel-ai-sdk` |
| CrewAI / Mastra | `crewai`, `mastra` |
| OpenAI Agents / LlamaIndex | `openai-agents`, `llamaindex` |
| Google ADK / Pydantic AI | `google-adk`, `pydantic-ai` |
| Claude Code / Cursor / Codex | `claude-code`, `cursor`, `codex` |
| OpenCode / Devin / VS Code | `opencode`, `devin`, `vscode` |
| OpenClaw / Hermes / Antigravity | `openclaw`, `hermes-agent`, `antigravity` |

Plain REST from any language is fully supported — `read_doc` the API
Reference pages under `/api/...` for exact request and response bodies.

## 6. Hard invariants (do not violate)

- **Never call `DELETE /memory/user/purge`.** Despite the path, it erases the
  ENTIRE ACCOUNT behind the credential — keys, memberships, everything. It
  ignores `X-End-User-ID`. Delete individual memories by id via
  `DELETE /memory/forget` with `memory_ids`.
- Anything that runs inside a user's session (hooks, middleware) must
  fail open: a memory outage is a memoryless turn, never a broken app.
- Keep `X-End-User-ID` out of logs if your users' ids are sensitive; never
  log API keys.
- Confirm every endpoint, field, and limit against the live docs before
  shipping. **The live docs win.**
