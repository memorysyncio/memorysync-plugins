#!/usr/bin/env node
/**
 * Diagnostic for /memorysync:status — prints a plain-text report of
 * everything a user needs to debug the plugin: key presence, API
 * reachability, tenant namespace, resolved identity and project scope.
 * Never exits nonzero (it is run inside a session).
 */

import { apiKey, baseUrl, main, networkDisabled, resolveProject, resolveTenantId, resolveUserId, sessionKey } from './lib.mjs'

main(async () => {
  const lines = []
  const key = apiKey()
  const base = baseUrl()
  const cwd = process.cwd()
  const project = resolveProject(cwd)

  lines.push('MemorySync plugin status')
  lines.push('------------------------')
  lines.push(`API key (MEMORYSYNC_API_KEY): ${key ? `set (${key.slice(0, 8)}…)` : 'NOT SET — memory is off. Create a key at https://app.memorysync.io and export MEMORYSYNC_API_KEY.'}`)
  lines.push(`API origin: ${base}`)
  lines.push(`Network: ${networkDisabled() ? 'DISABLED via CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC — all memory calls are skipped.' : 'allowed'}`)
  lines.push(`User scope: ${resolveUserId()} ${process.env.MEMORYSYNC_USER_ID ? '(from MEMORYSYNC_USER_ID)' : '(OS username; override with MEMORYSYNC_USER_ID)'}`)
  lines.push(`Project scope: ${project} ${process.env.MEMORYSYNC_PROJECT ? '(from MEMORYSYNC_PROJECT)' : '(auto-detected; override with MEMORYSYNC_PROJECT)'}`)
  lines.push(`Conversation key: ${sessionKey(project)}`)
  lines.push(`Per-prompt recall: ${(process.env.MEMORYSYNC_PROMPT_RECALL || '').toLowerCase() === 'off' ? 'off (MEMORYSYNC_PROMPT_RECALL=off)' : 'on'}`)

  if (key && !networkDisabled()) {
    try {
      const started = Date.now()
      const tenant = await resolveTenantId({ key, base })
      lines.push(`API reachability: OK in ${Date.now() - started}ms (tenant namespace: ${tenant}${tenant === 'default' ? ' — evaluation-key fallback' : ''})`)
    } catch (error) {
      lines.push(`API reachability: FAILED (${error && error.message ? error.message : 'unknown error'}) — hooks will silently skip until this recovers.`)
    }
  }

  process.stdout.write(lines.join('\n'))
})
