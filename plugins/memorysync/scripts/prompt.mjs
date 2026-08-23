#!/usr/bin/env node
/**
 * UserPromptSubmit hook: two jobs, one process.
 *
 * 1. Recall memories relevant to THIS prompt and inject them alongside
 *    it (synchronous — injection requires the hook's stdout — but hard
 *    capped so a slow network can only ever cost a few quiet seconds).
 * 2. Persist the user's message as a verbatim turn — in a DETACHED
 *    child process, so persistence adds zero latency to the turn.
 *
 * Recall is skipped for tiny prompts ("yes", "continue") and when
 * MEMORYSYNC_PROMPT_RECALL=off; persistence still happens. Exit 0 on
 * every path.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import {
  addTurn,
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

const MIN_RECALL_PROMPT_CHARS = 24

main(async () => {
  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const event = await readStdin()
  const prompt = String(event.prompt || '').trim()
  if (!prompt) return

  const cwd = event.cwd || process.cwd()
  const project = resolveProject(cwd)
  const userId = resolveUserId()
  const base = baseUrl()

  // 2. Persistence of the user turn. Locally: a DETACHED child, so the
  // turn pays zero latency. In cloud/Cowork sessions ($CLAUDE_CODE_REMOTE):
  // inline with a short cap — a sandbox may reap detached children when
  // the hook exits, and a quietly lost turn is worse than ~1s of latency.
  const payload = { role: 'human', text: prompt, cwd, claudeSessionId: event.session_id || null }
  let persistInline = Boolean(process.env.CLAUDE_CODE_REMOTE)
  if (!persistInline) {
    try {
      const persister = join(dirname(fileURLToPath(import.meta.url)), 'persist-turn.mjs')
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
      const child = spawn(process.execPath, [persister, process.argv[2] || ''], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, MEMORYSYNC_HOOK_PAYLOAD: encoded },
      })
      child.unref()
    } catch {
      persistInline = true // spawn unavailable — fall back to inline
    }
  }

  if (persistInline) {
    try {
      const tenantForPersist = await resolveTenantId({ key, base })
      await addTurn({
        key,
        base,
        tenant: tenantForPersist,
        userId,
        role: 'human',
        text: prompt,
        project,
        claudeSessionId: payload.claudeSessionId,
        timeoutMs: 3000,
      })
    } catch {
      /* best-effort — never surface */
    }
  }

  // 1. Synchronous recall for injection.
  if ((process.env.MEMORYSYNC_PROMPT_RECALL || '').toLowerCase() === 'off') return
  if (prompt.length < MIN_RECALL_PROMPT_CHARS) return

  const tenant = await resolveTenantId({ key, base })
  const context = await recallContext({ key, base, tenant, userId, prompt, k: 6, timeoutMs: 5000 })
  const block = renderContext(context, project)
  if (!block) return

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: block,
      },
    }),
  )
})
