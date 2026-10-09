# Live local E2E — MemorySync Claude Code plugin

Two layers of verification exist for this plugin:

1. **Automated (CI, no Claude account needed):** `node --test tests/hooks.test.mjs`
   — 26 checks driving every hook script exactly as Claude Code runs them
   (same exec-form spawn, same documented stdin payloads) against a mock
   MemorySync that follows the production add_turn contract (user turns
   become extracted facts; nothing else is stored), plus
   `claude plugin validate --strict` on both manifests.
2. **Model-visible (requires a logged-in Claude Code with usage):** the
   script below. Verified inventory registration on Claude Code 2.1.197
   (4 skills, 3 hooks, 2 MCP servers, ~206 always-on tokens); the model
   round-trip needs an account with available usage.

## Model-visible run (one command per step)

```powershell
# 0. Prereqs: claude logged in (`claude` once, interactive), node >= 18.

# 1. Start the seeded mock (prints its URL, stays up):
node tests/live-mock.mjs      # note the printed http://127.0.0.1:PORT

# 2. Install the plugin from this repo:
claude plugin marketplace add <path-to>/sdk/agent-plugins
claude plugin install memorysync@memorysync

# 3. In a NEW terminal, point the plugin at the mock and ask:
$env:MEMORYSYNC_API_KEY="ms_live_test_key"
$env:MEMORYSYNC_BASE_URL="http://127.0.0.1:PORT"   # from step 1
$env:MEMORYSYNC_USER_ID="live-probe"
$env:MEMORYSYNC_PROJECT="live-probe-project"
claude -p "What is my favourite colour according to your memory of me? Answer with exactly one word."
```

**Expected:** the answer contains **teal** — proof the SessionStart hook
recalled the seeded memory and injected it before the first prompt.

```powershell
# 4. Verify capture (the prompt reached fact extraction):
Invoke-WebRequest http://127.0.0.1:PORT/__rows -UseBasicParsing | Select-Object -Expand Content
```

**Expected:** two rows — the seed, and the fact the mock extracted from
your prompt (`What is my favourite colour…`: the mock stores a user
turn's text as its stand-in for extraction), with `source: claude-code`,
`metadata.session_id: claude::live-probe-project` and
`metadata.write_origin: turn-extraction`. There is no row for Claude's
reply: the Stop hook sends nothing.

```powershell
# 5. Against PRODUCTION instead of the mock: unset MEMORYSYNC_BASE_URL,
#    set a real MEMORYSYNC_API_KEY (with quota headroom), repeat step 3
#    with a prompt that states a durable fact (e.g. "I prefer pnpm over
#    npm. Which package manager should this repo use?"), then find the
#    extracted fact in the dashboard (app.memorysync.io -> Memories);
#    extraction is asynchronous, so allow a few seconds.

# 6. Clean up:
claude plugin uninstall memorysync@memorysync
claude plugin marketplace remove memorysync
```

## What was verified on this machine (2026-08-23, Claude Code 2.1.197)

| Check | Result |
| --- | --- |
| `claude plugin validate --strict` (plugin) | PASS |
| `claude plugin validate --strict` (marketplace) | PASS |
| `claude plugin marketplace add <local>` | PASS |
| `claude plugin install memorysync@memorysync` | PASS (user scope) |
| Component inventory parsed | 4 skills, hooks registered for SessionStart + UserPromptSubmit + Stop, 2 MCP servers |
| Projected always-on token cost | ~206 tokens (lean) |
| Hook contract suite | 22/22 |
| Model round-trip | requires an account with usage — step 3 above |
