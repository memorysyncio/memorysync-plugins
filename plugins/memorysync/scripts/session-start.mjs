#!/usr/bin/env node
/**
 * SessionStart hook (matchers: startup|resume|clear, and compact for
 * post-compaction re-injection): recall what MemorySync knows about
 * this user and project and inject it as additionalContext before the
 * first prompt. Exit 0 on every path — a memoryless session start is
 * normal; a broken one is never acceptable.
 */

import {
  apiKey,
  baseUrl,
  main,
  networkDisabled,
  readStdin,
  recallContext,
  renderContext,
  resolveProject,
  resolveTenantId,
  resolveUserId,
} from './lib.mjs'

main(async () => {
  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const event = await readStdin()
  const cwd = event.cwd || process.cwd()
  const project = resolveProject(cwd)
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
  const block = renderContext(context, project)
  if (!block) return

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: block,
      },
    }),
  )
})
