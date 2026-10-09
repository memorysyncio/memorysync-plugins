#!/usr/bin/env node
/**
 * Detached capture worker. Receives one prompt as a base64 JSON payload
 * in MEMORYSYNC_HOOK_PAYLOAD and sends it to fact extraction
 * (lib.captureTurn, which sends user turns only). Runs outside the hook's
 * lifetime so capture never adds latency to a turn. When the send fails
 * in a way a retry can fix (network, timeout, server error, rate limit),
 * the prompt is kept in the local retry spool for flush.mjs to deliver.
 * Silent on every failure.
 */

import { apiKey, baseUrl, captureTurn, main, networkDisabled, resolveProject, resolveUserId } from './lib.mjs'

main(async () => {
  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const raw = process.env.MEMORYSYNC_HOOK_PAYLOAD
  if (!raw) return
  const payload = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  // Only user turns are sent; any other role needs no network at all.
  const role = payload.role || 'human'
  if (role !== 'human' && role !== 'user') return
  const text = String(payload.text || '').trim()
  if (!text) return

  await captureTurn({
    key,
    base: baseUrl(),
    userId: resolveUserId(),
    text,
    project: resolveProject(payload.cwd || process.cwd()),
    agentSession: payload.claudeSessionId || null,
  })
})
