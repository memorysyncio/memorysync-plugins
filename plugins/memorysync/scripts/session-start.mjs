#!/usr/bin/env node
/**
 * Session-start hook: recall what MemorySync knows about this user and
 * project and inject it before the first prompt.
 *
 * - Claude Code, Codex, Devin, Antigravity (`SessionStart`; on Claude
 *   Code and Codex also matcher `compact`, for post-compaction
 *   re-injection): `hookSpecificOutput.additionalContext`, or nothing.
 * - Cursor (`sessionStart`, cursor platform argument): the project comes
 *   from `workspace_roots[0]`; the answer is `{"additional_context": ...}`,
 *   which Cursor adds to the conversation's initial context, or `{}`.
 *
 * Exit 0 on every path — a memoryless session start is normal; a broken
 * one is never acceptable.
 */

import {
  PLATFORM,
  apiKey,
  baseUrl,
  eventCwd,
  main,
  networkDisabled,
  readStdin,
  recallContext,
  renderContext,
  resolveProject,
  resolveTenantId,
  resolveUserId,
  respond,
} from './lib.mjs'

async function recall() {
  const event = await readStdin()
  if (networkDisabled()) return ''
  const key = apiKey()
  if (!key) return ''

  const project = resolveProject(eventCwd(event))
  const userId = resolveUserId()
  const base = baseUrl()

  const tenant = await resolveTenantId({ key, base })
  const context = await recallContext({
    key,
    base,
    tenant,
    userId,
    prompt: `profile overview: preferences, decisions, facts and context about this user's work on ${project}`,
    k: 8,
    timeoutMs: 6000,
  })
  return renderContext(context, project)
}

main(async () => {
  const block = await recall().catch(() => '')
  if (PLATFORM === 'cursor') {
    respond(block ? { additional_context: block } : {})
  } else if (block) {
    respond({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: block } })
  }
})
