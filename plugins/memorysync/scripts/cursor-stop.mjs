#!/usr/bin/env node
/**
 * Cursor `stop` / `afterAgentResponse` hook: persist the assistant's
 * completed reply. Field names in these payloads are not fully
 * documented, so extraction is whitelist-tolerant (lib.extractAssistantText)
 * and skips silently when nothing trustworthy is present — the user
 * turn was already captured, and the idempotent seeds mean both events
 * firing for one reply converge on one stored row.
 *
 * Output is always `{"continue": true}`; failures never surface.
 */

import { addTurn, apiKey, baseUrl, extractAssistantText, main, networkDisabled, readStdin, resolveProject, resolveTenantId, resolveUserId } from './lib.mjs'

main(async () => {
  const event = await readStdin()
  process.stdout.write(JSON.stringify({ continue: true }))

  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const text = extractAssistantText(event)
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
    project: resolveProject(event.cwd || event.workspace_root || process.cwd()),
    claudeSessionId: event.session_id || event.conversation_id || null,
    timeoutMs: 8000,
  })
})
