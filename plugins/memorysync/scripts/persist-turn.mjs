#!/usr/bin/env node
/**
 * Detached persistence worker. Receives one turn as a base64 JSON
 * payload in MEMORYSYNC_HOOK_PAYLOAD and writes it through the
 * idempotent episodic plane. Runs outside the hook's lifetime so
 * persistence never adds latency to a turn. Silent on every failure.
 */

import { addTurn, apiKey, baseUrl, main, networkDisabled, resolveProject, resolveTenantId, resolveUserId } from './lib.mjs'

main(async () => {
  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const raw = process.env.MEMORYSYNC_HOOK_PAYLOAD
  if (!raw) return
  const payload = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  const text = String(payload.text || '').trim()
  if (!text) return

  const base = baseUrl()
  const tenant = await resolveTenantId({ key, base })
  await addTurn({
    key,
    base,
    tenant,
    userId: resolveUserId(),
    role: payload.role === 'ai' ? 'ai' : 'human',
    text,
    project: resolveProject(payload.cwd || process.cwd()),
    claudeSessionId: payload.claudeSessionId || null,
  })
})
