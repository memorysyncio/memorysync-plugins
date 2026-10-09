#!/usr/bin/env node
/**
 * Cursor `beforeSubmitPrompt` hook: send the user's message to fact
 * extraction in a detached process and let the prompt through
 * immediately. Only the durable facts extracted from it are stored;
 * Cursor's replies are not sent.
 *
 * `beforeSubmitPrompt` cannot add model context (its output is
 * allow/block only), so recall on Cursor comes from the `sessionStart`
 * hook (session-start.mjs), the failed-command hook (tool-failure.mjs),
 * the bundled `rules/memorysync.mdc` rule and the MCP tools. This hook's
 * only job is capture, and its only promise is `{"continue": true}` on
 * every path, always, in under a second. A prompt the network refused
 * waits in the retry spool until the `stop` hook (flush.mjs) delivers it.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import { apiKey, baseUrl, captureTurn, eventCwd, main, networkDisabled, readStdin, resolveProject, resolveUserId, respond } from './lib.mjs'

main(async () => {
  const event = await readStdin()
  respond({ continue: true }) // the answer never depends on what follows

  if (networkDisabled()) return
  const key = apiKey()
  if (!key) return

  const prompt = String(event.prompt || event.user_message || event.text || '').trim()
  if (!prompt) return
  const cwd = eventCwd(event)
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
    // Detach unavailable: send inline with a tight cap instead.
    await captureTurn({
      key,
      base: baseUrl(),
      userId: resolveUserId(),
      text: prompt,
      project: resolveProject(cwd),
      agentSession: payload.claudeSessionId,
      timeoutMs: 3000,
    })
  }
})
