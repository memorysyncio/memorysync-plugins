#!/usr/bin/env node
/**
 * Cursor `stop` / `afterAgentResponse` hook: answers `{"continue": true}`
 * and sends nothing. MemorySync stores the durable facts extracted from
 * the user's prompts, and `beforeSubmitPrompt` (cursor-prompt.mjs)
 * already sent this exchange's prompt. Assistant replies are not stored
 * as memories, so there is nothing to send.
 *
 * Output is always `{"continue": true}`; exit 0 on every path.
 */

import { main, readStdin } from './lib.mjs'

main(async () => {
  await readStdin()
  process.stdout.write(JSON.stringify({ continue: true }))
})
