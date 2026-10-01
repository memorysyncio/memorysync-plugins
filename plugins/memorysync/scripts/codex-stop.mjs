#!/usr/bin/env node
/**
 * `Stop` hook for Codex, Devin and Antigravity: sends nothing. MemorySync
 * stores the durable facts extracted from the user's prompts, and each of
 * these platforms' UserPromptSubmit hook (prompt.mjs) already sent this
 * exchange's prompt. Assistant replies are not stored as memories, so
 * there is nothing to send. The hook reads its event and exits 0,
 * silently, on every path.
 */

import { main, readStdin } from './lib.mjs'

main(async () => {
  await readStdin()
})
