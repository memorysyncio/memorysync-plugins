---
name: status
description: Show MemorySync plugin status — API key, connectivity, identity and project scope. Use when the user runs /memorysync:status or asks whether MemorySync memory is working, configured or connected.
disable-model-invocation: false
---

# MemorySync status

Run the bundled diagnostic and show the user its output verbatim, then briefly explain anything that needs fixing:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs"
```

Use the Bash tool to run it (the `CLAUDE_PLUGIN_ROOT` environment variable is set for this plugin's processes; if it is not available in your shell, locate the plugin root via the path of this skill file).

What the fields mean:

- **API key NOT SET** — memory is off. The fix: create a key at https://app.memorysync.io, then `export MEMORYSYNC_API_KEY=ms_...` (or `setx MEMORYSYNC_API_KEY ms_...` on Windows) and restart Claude Code.
- **Tenant namespace: default** — an evaluation key; memory works, with evaluation limits.
- **API reachability FAILED** — the hooks skip silently until the network or service recovers; sessions are unaffected.
- **Project scope** — where this repo's conversation memory lives. Override with `MEMORYSYNC_PROJECT` for monorepos.
