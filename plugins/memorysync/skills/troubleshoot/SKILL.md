---
name: troubleshoot
description: Diagnose why MemorySync hooks or MCP tools are not working. Use when recall is empty, facts are not saving, status fails, or the user says memory is down / not connected / not capturing.
---

# Troubleshoot

1. Run the `status` skill (MCP `whoami`, plus whatever the status skill prints about the key and project). Note `authenticated`, `auth_method`, `can_write`, `can_delete`, `project_id`.
2. Check the environment the hooks actually see (`scripts/lib.mjs`):
   - No `MEMORYSYNC_API_KEY` → every hook is a silent no-op. The session still runs.
   - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` set → hooks will not call the network.
   - `MEMORYSYNC_BASE_URL` pointing at the wrong host.
   - `MEMORYSYNC_PROJECT` overriding the git remote, so this checkout is scoped away from the memories they expect.
3. Quota: a 429 from add/search is a plan limit, not a plugin bug. Tell them to check usage at https://app.memorysync.io. Hooks still exit 0, so the only symptom is missing recall.
4. Cursor-specific: session-start recall needs the `sessionStart` hook from this plugin; if they only added the MCP server by hand, capture and injection will not run. Re-install from the MemorySync marketplace so hooks ship with the server.
5. Do not dump env values that look like keys. If `whoami` works but hooks do not, the MCP server has a key and the hook process does not — they are separate.

## Rules

- Never print secrets, tokens or passwords.
- If a memory tool fails, report the error in one line and continue the user's task.
