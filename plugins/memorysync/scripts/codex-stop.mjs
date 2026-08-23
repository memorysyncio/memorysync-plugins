#!/usr/bin/env node
/**
 * Codex `Stop` hook (async): persist the assistant's completed reply.
 *
 * Codex documents the Stop event but not a guaranteed final-text field,
 * so extraction runs the tolerant chain: documented-style fields first,
 * then a bounded transcript-tail parse, then skip — never guess. Runs
 * as an async hook, so it can never add latency to a turn; exits 0 on
 * every path.
 */

import { addTurn, apiKey, baseUrl, extractAssistantText, main, networkDisabled, readStdin, resolveProject, resolveTenantId, resolveUserId } from './lib.mjs'

main(async () => {
  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const event = await readStdin()
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
    project: resolveProject(event.cwd || process.cwd()),
    claudeSessionId: event.session_id || event.conversation_id || null,
    timeoutMs: 10000,
  })
})
