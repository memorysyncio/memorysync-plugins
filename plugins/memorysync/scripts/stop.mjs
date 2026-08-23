#!/usr/bin/env node
/**
 * Stop hook (async): persist the assistant's completed reply. Uses the
 * event's last_assistant_message — the documented reliable field; the
 * transcript file is written asynchronously and lags. Runs as an async
 * hook so it never blocks the turn. Exit 0 on every path.
 */

import { addTurn, apiKey, baseUrl, main, networkDisabled, readStdin, resolveProject, resolveTenantId, resolveUserId } from './lib.mjs'

main(async () => {
  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const event = await readStdin()
  const text = String(event.last_assistant_message || '').trim()
  if (!text) return

  const base = baseUrl()
  const tenant = await resolveTenantId({ key, base })
  await addTurn({
    key,
    base,
    tenant,
    userId: resolveUserId(),
    role: 'ai',
    text,
    project: resolveProject(event.cwd || process.cwd()),
    claudeSessionId: event.session_id || null,
    timeoutMs: 10000,
  })
})
