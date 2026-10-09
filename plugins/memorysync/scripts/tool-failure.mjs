#!/usr/bin/env node
/**
 * Failed-shell-command hook: when a command fails, look in MemorySync for
 * notes about that failure from earlier sessions — a root cause and fix
 * saved with the debug-history skill, or a fact extracted from one of
 * the user's prompts — and put the ones that clearly match next to the
 * error, where the agent reads them before its next step.
 *
 * Events:
 * - Claude Code `PostToolUseFailure` (matcher Bash|PowerShell).
 * - Cursor `postToolUseFailure` (matcher Shell), and `postToolUse`
 *   (matcher Shell), which acts only when `tool_output` reports a
 *   non-zero `exitCode`; a command that exits 0 returns at once with no
 *   request.
 *
 * Skipped without a request: user interrupts, permission denials,
 * failures with nothing distinctive to search for, and
 * MEMORYSYNC_FAILURE_RECALL=off. One small query per failure; a memory
 * is used only when lib.relevantMemories ties it to this error.
 *
 * Output: Cursor `{"additional_context": ...}` or `{}`; Claude Code
 * `hookSpecificOutput.additionalContext` or nothing. Exit 0 on every path.
 */

import {
  PLATFORM,
  apiKey,
  baseUrl,
  describeFailure,
  eventCwd,
  failureContext,
  main,
  networkDisabled,
  readStdin,
  resolveProject,
  resolveUserId,
  respond,
} from './lib.mjs'

async function lookup() {
  const event = await readStdin()
  const failure = describeFailure(event)
  if (!failure) return ''
  if ((process.env.MEMORYSYNC_FAILURE_RECALL || '').toLowerCase() === 'off') return ''
  if (networkDisabled()) return ''
  const key = apiKey()
  if (!key) return ''
  const cwd = eventCwd(event)
  return failureContext({
    key,
    base: baseUrl(),
    userId: resolveUserId(),
    failure,
    cwd,
    project: resolveProject(cwd),
  })
}

main(async () => {
  const block = await lookup().catch(() => '')
  if (PLATFORM === 'cursor') {
    respond(block ? { additional_context: block } : {})
  } else if (block) {
    respond({ hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: block } })
  }
})
