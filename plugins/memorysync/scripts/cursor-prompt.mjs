#!/usr/bin/env node
/**
 * Cursor `beforeSubmitPrompt` hook: persist the user's message in a
 * detached process and let the prompt through immediately.
 *
 * Cursor hooks cannot inject model context (their output contract is
 * allow/deny/message only), so recall on Cursor rides the bundled
 * `rules/memorysync.mdc` rule + the MCP tools instead — this hook's
 * only job is capture, and its only promise is `{"continue": true}`
 * on every path, always, in under a second.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import { addTurn, apiKey, baseUrl, main, networkDisabled, readStdin, resolveProject, resolveTenantId, resolveUserId } from './lib.mjs'

function allow() {
  process.stdout.write(JSON.stringify({ continue: true }))
}

main(async () => {
  const event = await readStdin()
  allow() // the answer never depends on what follows

  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const prompt = String(event.prompt || event.user_message || event.text || '').trim()
  if (!prompt) return
  const cwd = event.cwd || event.workspace_root || process.cwd()
  const payload = { role: 'human', text: prompt, cwd, claudeSessionId: event.session_id || event.conversation_id || null }

  try {
    const persister = join(dirname(fileURLToPath(import.meta.url)), 'persist-turn.mjs')
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
    spawn(process.execPath, [persister, process.argv[2] || ''], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, MEMORYSYNC_HOOK_PAYLOAD: encoded },
    }).unref()
  } catch {
    // Detach unavailable: persist inline with a tight cap instead.
    try {
      const base = baseUrl()
      const tenant = await resolveTenantId({ key, base })
      await addTurn({
        key, base, tenant,
        userId: resolveUserId(),
        role: 'human',
        text: prompt,
        project: resolveProject(cwd),
        claudeSessionId: payload.claudeSessionId,
        timeoutMs: 3000,
      })
    } catch {
      /* capture is best-effort; the prompt already went through */
    }
  }
})
