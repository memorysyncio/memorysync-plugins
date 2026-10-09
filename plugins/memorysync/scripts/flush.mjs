#!/usr/bin/env node
/**
 * Stop / preCompact / sessionEnd hook, every platform: deliver the
 * prompts that could not be sent when they were typed (network down,
 * server error, rate limit) from the local retry spool, oldest first,
 * within a time budget sized to the event. At session end it first
 * prunes the plugin's stale local files (expired spool entries, unused
 * tenant caches). Redelivery is safe to repeat: each prompt keeps its
 * speaker seed, so the server treats a second delivery as a replay.
 *
 * With nothing waiting it makes no request at all — assistant replies
 * are never sent, so a stop with an empty spool is a no-op.
 *
 * Output: `{}` under the cursor platform (Cursor reads JSON; this hook
 * never sets `followup_message` or `user_message`), nothing elsewhere.
 * Exit 0 on every path.
 */

import { PLATFORM, apiKey, baseUrl, flushSpool, main, networkDisabled, pruneLocalState, readStdin, respond } from './lib.mjs'

/**
 * Milliseconds this event may spend delivering. Claude Code and Codex run
 * Stop asynchronously, so nobody waits; Claude Code gives all SessionEnd
 * hooks 1.5 s together; everywhere else the agent is waiting on us.
 */
function budgetFor(eventName) {
  if (eventName === 'sessionend') return PLATFORM === 'claude' ? 1000 : 5000
  if (eventName === 'stop' && (PLATFORM === 'claude' || PLATFORM === 'codex')) return 8000
  return 3000
}

main(async () => {
  if (PLATFORM === 'cursor') respond({})
  const event = await readStdin()
  const eventName = String(event.hook_event_name || '').toLowerCase()
  if (eventName === 'sessionend') pruneLocalState()

  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return
  await flushSpool({ key, base: baseUrl(), budgetMs: budgetFor(eventName) })
})
