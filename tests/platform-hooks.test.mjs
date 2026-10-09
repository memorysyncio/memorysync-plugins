/**
 * Contract tests for the Cursor, Codex, Devin and Antigravity hook
 * surfaces.
 *
 * Same discipline as the Claude suite: every script runs as a REAL
 * child process with realistic stdin payloads against the mock server.
 * Platform-specific contracts pinned here:
 *
 * - Cursor `beforeSubmitPrompt` answers `{"continue": true}` on EVERY
 *   path. `sessionStart` injects `additional_context` when recall has
 *   something; `stop` / `preCompact` / `sessionEnd` answer `{}` and
 *   flush the retry spool (never `followup_message`).
 * - Codex hooks are Claude-shaped: the shared session-start/prompt
 *   scripts must produce identical injection JSON under the `codex`
 *   platform argument, with codex-prefixed session keys.
 * - Every platform sends the user's prompt for fact extraction from its
 *   prompt hook; the stop-style hooks send nothing, because assistant
 *   replies are not stored.
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { startMock } from './mock-server.mjs'

const SCRIPTS =
  process.env.MEMORYSYNC_SCRIPTS_DIR ||
  join(fileURLToPath(new URL('.', import.meta.url)), '..', 'plugins', 'memorysync', 'scripts')
const KEY = 'ms_test_key_1'

let mock
let cacheDir

before(async () => {
  mock = await startMock()
})

after(async () => {
  await mock.close()
})

beforeEach(async () => {
  await fetch(`${mock.url}/__reset`, { method: 'POST' })
  mock.state.failNext = null
  mock.state.quotaMode = null
  mock.state.recallReturnsEmpty = false
  cacheDir = mkdtempSync(join(tmpdir(), 'ms-platform-test-'))
})

function runHook(script, platform, payload, envOverrides = {}) {
  return new Promise((resolvePromise) => {
    const args = [join(SCRIPTS, script)]
    if (platform) args.push(platform)
    const child = spawn(process.execPath, args, {
      env: {
        ...process.env,
        MEMORYSYNC_API_KEY: KEY,
        MEMORYSYNC_BASE_URL: mock.url,
        MEMORYSYNC_USER_ID: 'user-1',
        MEMORYSYNC_PROJECT: 'demo-project',
        MEMORYSYNC_CACHE_DIR: cacheDir,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '',
        ...envOverrides,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.on('close', (code) => resolvePromise({ code, stdout }))
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

async function rows() {
  const res = await fetch(`${mock.url}/__rows`)
  return res.json()
}

function turnRequests() {
  return mock.state.requests.filter((r) => r.route === 'POST /v1/memory/add_turn')
}

async function pollRows(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await rows()
    if (predicate(current)) return current
    await new Promise((r) => setTimeout(r, 150))
  }
  return rows()
}

async function pollTurnRequests(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate(turnRequests())) break
    await new Promise((r) => setTimeout(r, 150))
  }
  return turnRequests()
}

/** A fact already in memory, as extraction would have stored it. */
function seedFact(text) {
  mock.state.rows.push({
    id: mock.state.nextId++,
    user_id: 'user-1',
    tenant_id: 'org_1',
    text,
    source: 'seed',
    metadata: { write_origin: 'turn-extraction', turn_role: 'user' },
  })
}

/** The add_turn request that carried `prompt`, asserted as a plain user turn. */
function sentPrompt(prompt, platform) {
  const request = turnRequests().find((r) => r.body.text === prompt)
  assert.ok(request, `the ${platform} prompt was sent as plain text`)
  assert.equal(request.body.role, 'user')
  assert.match(request.body.speaker, new RegExp(`^human@${platform}::demo-project#h[0-9a-f]{16}$`), `${platform}-prefixed seed`)
  return request
}

const CURSOR_PROMPT = {
  session_id: 'cur-1',
  cwd: 'C:/work/demo',
  hook_event_name: 'beforeSubmitPrompt',
  prompt: 'what colour scheme did we pick for the dashboard?',
}

const CURSOR_STOP = {
  session_id: 'cur-1',
  cwd: 'C:/work/demo',
  hook_event_name: 'stop',
  last_assistant_message: 'We picked teal for the dashboard.',
}

// ── Cursor: the continue-true-always contract ─────────────────────────

test('cursor-prompt always answers {"continue": true} and sends the prompt', async () => {
  const { code, stdout } = await runHook('cursor-prompt.mjs', 'cursor', CURSOR_PROMPT)
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(stdout), { continue: true })
  const stored = await pollRows((r) => r.length >= 1)
  const fact = stored.find((r) => r.text === CURSOR_PROMPT.prompt)
  assert.ok(fact, 'the prompt reached fact extraction')
  assert.equal(fact.source, 'cursor', 'platform stamp')
  assert.equal(fact.metadata.session_id, 'cursor::demo-project')
  assert.equal(fact.metadata.agent_session, 'cur-1')
  sentPrompt(CURSOR_PROMPT.prompt, 'cursor')
})

test('cursor-prompt without a key: continue true, zero writes', async () => {
  const { code, stdout } = await runHook('cursor-prompt.mjs', 'cursor', CURSOR_PROMPT, {
    MEMORYSYNC_API_KEY: '',
  })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(stdout), { continue: true })
  await new Promise((r) => setTimeout(r, 800))
  assert.equal((await rows()).length, 0)
  assert.equal(mock.state.requests.length, 0)
})

test('cursor-prompt under both quota modes: continue true, no error surface', async () => {
  for (const mode of ['silent', 'strict']) {
    mock.state.quotaMode = mode
    const { code, stdout } = await runHook('cursor-prompt.mjs', 'cursor', CURSOR_PROMPT)
    assert.equal(code, 0, mode)
    assert.deepEqual(JSON.parse(stdout), { continue: true }, mode)
    await pollTurnRequests((sent) => sent.some((r) => r.status === (mode === 'silent' ? 201 : 429)))
  }
  const statuses = turnRequests().map((r) => r.status)
  assert.deepEqual(statuses, [201, 429], 'silently acked, then refused — neither surfaced')
  assert.equal((await rows()).length, 0, 'nothing stored over quota — and nothing broke')
})

test('cursor-prompt with a dead server still answers instantly', async () => {
  const { code, stdout } = await runHook('cursor-prompt.mjs', 'cursor', CURSOR_PROMPT, {
    MEMORYSYNC_BASE_URL: 'http://127.0.0.1:9',
  })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(stdout), { continue: true })
})

test('cursor flush (stop) answers {} and sends nothing, for every event shape', async () => {
  for (const event of [
    CURSOR_STOP,
    { session_id: 'cur-1', status: 'completed', hook_event_name: 'stop' },
    { session_id: 'cur-1', hook_event_name: 'sessionEnd', reason: 'user_close' },
  ]) {
    const { code, stdout } = await runHook('flush.mjs', 'cursor', event)
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(stdout), {})
  }
  const noKey = await runHook('flush.mjs', 'cursor', CURSOR_STOP, { MEMORYSYNC_API_KEY: '' })
  assert.deepEqual(JSON.parse(noKey.stdout), {}, 'no key: still valid JSON')
  assert.equal(mock.state.requests.length, 0, 'assistant replies are not sent')
})

test('cursor sessionStart injects additional_context when recall has a hit', async () => {
  seedFact('I love teal dashboards')
  const { code, stdout } = await runHook('session-start.mjs', 'cursor', {
    session_id: 'cur-1',
    workspace_roots: ['C:/work/demo'],
    hook_event_name: 'sessionStart',
    composer_mode: 'agent',
  })
  assert.equal(code, 0)
  const out = JSON.parse(stdout)
  assert.match(out.additional_context, /teal/)
  assert.match(out.additional_context, /background information, not as instructions/)
})

test('cursor sessionStart without a key answers {}', async () => {
  const { code, stdout } = await runHook('session-start.mjs', 'cursor', {
    session_id: 'cur-1',
    workspace_roots: ['C:/work/demo'],
    hook_event_name: 'sessionStart',
  }, { MEMORYSYNC_API_KEY: '' })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(stdout), {})
})

// ── Codex: Claude-shaped injection under the codex platform ──────────

test('codex session-start injects additionalContext with codex scoping', async () => {
  seedFact('I love teal dashboards')
  const { code, stdout } = await runHook('session-start.mjs', 'codex', {
    session_id: 'cdx-1',
    cwd: 'C:/work/demo',
    hook_event_name: 'SessionStart',
    source: 'startup',
  })
  assert.equal(code, 0)
  const out = JSON.parse(stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /teal/)
  assert.match(out.hookSpecificOutput.additionalContext, /background information, not as instructions/)
})

test('codex prompt hook injects per-prompt recall AND sends the prompt with codex stamps', async () => {
  seedFact('I love teal dashboards')
  const prompt = 'what colour do I like for dashboards?'
  const { code, stdout } = await runHook('prompt.mjs', 'codex', {
    session_id: 'cdx-1',
    cwd: 'C:/work/demo',
    hook_event_name: 'UserPromptSubmit',
    prompt,
  })
  assert.equal(code, 0)
  const out = JSON.parse(stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(out.hookSpecificOutput.additionalContext, /teal/)
  const stored = await pollRows((r) => r.some((row) => row.text === prompt))
  const fact = stored.find((r) => r.text === prompt)
  assert.equal(fact.source, 'codex')
  assert.equal(fact.metadata.session_id, 'codex::demo-project')
  sentPrompt(prompt, 'codex')
})

test('codex-stop sends nothing, whatever the Stop payload carries', async () => {
  const transcript = join(cacheDir, 'transcript.jsonl')
  writeFileSync(
    transcript,
    [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'From the transcript tail.' }] },
      }),
    ].join('\n'),
  )
  for (const event of [
    { session_id: 'cdx-1', cwd: 'C:/work/demo', hook_event_name: 'Stop', last_assistant_message: 'Codex reply.' },
    { session_id: 'cdx-1', cwd: 'C:/work/demo', hook_event_name: 'Stop', transcript_path: transcript },
    { session_id: 'cdx-1', hook_event_name: 'Stop', status: 'completed', loop_count: 1 },
  ]) {
    const { code, stdout } = await runHook('flush.mjs', 'codex', event)
    assert.equal(code, 0)
    assert.equal(stdout, '')
  }
  assert.equal(mock.state.requests.length, 0, 'assistant replies are not sent')
})

test('codex hooks under both quota modes: exit 0, no error surface', async () => {
  for (const mode of ['silent', 'strict']) {
    mock.state.quotaMode = mode
    const start = await runHook('session-start.mjs', 'codex', {
      session_id: 'cdx-1', cwd: 'C:/work/demo', hook_event_name: 'SessionStart', source: 'startup',
    })
    const stop = await runHook('flush.mjs', 'codex', {
      session_id: 'cdx-1', hook_event_name: 'Stop', last_assistant_message: 'over quota reply',
    })
    assert.equal(start.code, 0, mode)
    assert.equal(start.stdout, '', `${mode}: reads answer empty — no injection, no error`)
    assert.equal(stop.code, 0, mode)
  }
})

// ── Devin and Antigravity: the same scripts under their platform args ─

test('devin platform: session-start injects, prompt sends with devin stamps', async () => {
  seedFact('I love teal dashboards')
  const start = await runHook('session-start.mjs', 'devin', {
    session_id: 'dv-1',
    cwd: 'C:/work/demo',
    hook_event_name: 'SessionStart',
  })
  assert.equal(start.code, 0)
  const out = JSON.parse(start.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /teal/)

  const prompt = 'what colour scheme did we pick for the dashboard?'
  const p = await runHook('prompt.mjs', 'devin', {
    session_id: 'dv-1',
    cwd: 'C:/work/demo',
    hook_event_name: 'UserPromptSubmit',
    prompt,
  })
  assert.equal(p.code, 0)
  const stored = await pollRows((r) => r.some((row) => row.text === prompt))
  const fact = stored.find((r) => r.text === prompt)
  assert.equal(fact.source, 'devin')
  assert.equal(fact.metadata.session_id, 'devin::demo-project')
  sentPrompt(prompt, 'devin')
})

test('devin stop sends nothing', async () => {
  const { code, stdout } = await runHook('flush.mjs', 'devin', {
    session_id: 'dv-1',
    cwd: 'C:/work/demo',
    hook_event_name: 'Stop',
    last_assistant_message: 'Devin reply.',
  })
  assert.equal(code, 0)
  assert.equal(stdout, '')
  assert.equal(mock.state.requests.length, 0)
})

test('devin hooks under both quota modes: exit 0, silence', async () => {
  for (const mode of ['silent', 'strict']) {
    mock.state.quotaMode = mode
    const start = await runHook('session-start.mjs', 'devin', {
      session_id: 'dv-1', cwd: 'C:/work/demo', hook_event_name: 'SessionStart',
    })
    assert.equal(start.code, 0, mode)
    assert.equal(start.stdout, '', mode)
  }
})

test('antigravity platform: session-start injects, prompt sends with antigravity stamps', async () => {
  seedFact('I love teal dashboards')
  const start = await runHook('session-start.mjs', 'antigravity', {
    session_id: 'ag-1',
    cwd: 'C:/work/demo',
    hook_event_name: 'SessionStart',
  })
  assert.equal(start.code, 0)
  const out = JSON.parse(start.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /teal/)

  const prompt = 'what colour scheme did we pick for the dashboard?'
  const p = await runHook('prompt.mjs', 'antigravity', {
    session_id: 'ag-1',
    cwd: 'C:/work/demo',
    hook_event_name: 'UserPromptSubmit',
    prompt,
  })
  assert.equal(p.code, 0)
  const stored = await pollRows((r) => r.some((row) => row.text === prompt))
  const fact = stored.find((r) => r.text === prompt)
  assert.equal(fact.source, 'antigravity')
  assert.equal(fact.metadata.session_id, 'antigravity::demo-project')
  sentPrompt(prompt, 'antigravity')
})

test('antigravity stop sends nothing; quota modes stay silent', async () => {
  const { code, stdout } = await runHook('flush.mjs', 'antigravity', {
    session_id: 'ag-1',
    cwd: 'C:/work/demo',
    hook_event_name: 'Stop',
    last_assistant_message: 'Antigravity reply.',
  })
  assert.equal(code, 0)
  assert.equal(stdout, '')
  assert.equal(mock.state.requests.length, 0)

  for (const mode of ['silent', 'strict']) {
    mock.state.quotaMode = mode
    const start = await runHook('session-start.mjs', 'antigravity', {
      session_id: 'ag-1', cwd: 'C:/work/demo', hook_event_name: 'SessionStart',
    })
    assert.equal(start.code, 0, mode)
    assert.equal(start.stdout, '', mode)
  }
  mock.state.quotaMode = null
})

test('the antigravity bundle is internally consistent and in sync', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const bundle = new URL('../antigravity/', import.meta.url)
  const bundlePath = (...parts) => join(decodeURIComponent(bundle.pathname.replace(/^\/(?=[A-Za-z]:)/, '')), ...parts)

  // 1. Scripts are byte-identical to the canonical plugin scripts — the
  //    bundle must never drift from the tested surface.
  const canonical = (...parts) =>
    join(decodeURIComponent(new URL('../plugins/memorysync/scripts/', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), ...parts)
  const bundled = readdirSync(bundlePath('scripts')).filter((f) => f.endsWith('.mjs')).sort()
  for (const file of bundled) {
    assert.equal(
      readFileSync(bundlePath('scripts', file), 'utf8'),
      readFileSync(canonical(file), 'utf8'),
      `${file} must stay byte-identical to plugins/memorysync/scripts`,
    )
  }

  // 1b. Every script a bundled script imports or launches ships in the
  //     bundle. prompt.mjs hands each prompt to persist-turn.mjs in a
  //     detached process; with that file missing the child died on start,
  //     spawn() did not throw, and no prompt was ever captured.
  for (const file of bundled) {
    const source = readFileSync(bundlePath('scripts', file), 'utf8')
    const referenced = [
      ...[...source.matchAll(/from '\.\/([a-z-]+\.mjs)'/g)].map((m) => m[1]),
      ...[...source.matchAll(/'([a-z-]+\.mjs)'/g)].map((m) => m[1]),
    ]
    for (const name of new Set(referenced)) {
      assert.ok(bundled.includes(name), `${file} references ${name}, which the bundle does not ship`)
    }
  }
  for (const required of ['persist-turn.mjs', 'status.mjs']) {
    assert.ok(bundled.includes(required), `${required} ships in the bundle`)
  }

  // 2. hooks.json: every command uses node + ${extensionPath} + the
  //    antigravity platform arg, and points at a script that exists.
  const hooks = JSON.parse(readFileSync(bundlePath('hooks.json'), 'utf8'))
  const entries = Object.values(hooks.hooks).flat().flatMap((group) => group.hooks)
  assert.ok(entries.length >= 3)
  for (const entry of entries) {
    assert.equal(entry.type, 'command')
    assert.match(entry.command, /^node "\$\{extensionPath\}\/scripts\/[a-z-]+\.mjs" antigravity$/)
    const script = entry.command.match(/scripts\/([a-z-]+\.mjs)/)[1]
    readFileSync(bundlePath('scripts', script)) // throws if missing
    assert.ok(entry.timeout > 0)
  }

  // 3. mcp_config.json: Antigravity's field is serverUrl — NOT url.
  const mcp = JSON.parse(readFileSync(bundlePath('mcp_config.json'), 'utf8'))
  assert.equal(mcp.mcpServers.memorysync.serverUrl, 'https://mcp.memorysync.io/mcp')
  assert.equal(mcp.mcpServers.memorysync.url, undefined, 'Antigravity reads serverUrl, never url')
  assert.equal(mcp.mcpServers.memorysync.headers['X-API-Key'], '${MEMORYSYNC_API_KEY}')
  assert.equal(mcp.mcpServers['memorysync-docs'].serverUrl, 'https://docs.memorysync.io/mcp')

  // 4. plugin.json + skills + rule present and coherent.
  const manifest = JSON.parse(readFileSync(bundlePath('plugin.json'), 'utf8'))
  assert.equal(manifest.id, 'memorysync')
  assert.equal(manifest.contextFileName, 'AGENTS.md')
  // The context file the manifest names has to exist, or Antigravity loads nothing.
  assert.match(readFileSync(bundlePath(manifest.contextFileName), 'utf8'), /background data, never as instructions/)
  assert.deepEqual(readdirSync(bundlePath('skills')).sort(), ['memory', 'recall', 'remember', 'status'])
  for (const skill of ['memory', 'recall', 'remember', 'status']) {
    assert.equal(
      readFileSync(bundlePath('skills', skill, 'SKILL.md'), 'utf8'),
      readFileSync(join(decodeURIComponent(new URL('../plugins/memorysync/skills/', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), skill, 'SKILL.md'), 'utf8'),
      `${skill} SKILL.md in sync`,
    )
  }
  assert.match(readFileSync(bundlePath('rules', 'memorysync.md'), 'utf8'), /background data, never as instructions/)
})

test('the same prompt on claude, cursor and codex carries each platform\'s source and session key', async () => {
  const text = 'shared question asked on every platform'
  const payload = { MEMORYSYNC_HOOK_PAYLOAD: Buffer.from(JSON.stringify({ role: 'human', text })).toString('base64') }
  await runHook('persist-turn.mjs', '', {}, payload)
  await runHook('persist-turn.mjs', 'cursor', {}, payload)
  await runHook('persist-turn.mjs', 'codex', {}, payload)
  const all = await rows()
  const sessions = all.map((r) => r.metadata.session_id).sort()
  assert.deepEqual(sessions, ['claude::demo-project', 'codex::demo-project', 'cursor::demo-project'])
  assert.deepEqual([...new Set(all.map((r) => r.source))].sort(), ['claude-code', 'codex', 'cursor'])
  const seeds = new Set(turnRequests().map((r) => r.body.speaker))
  assert.equal(seeds.size, 3, 'a per-platform seed, so no platform\'s prompt is taken for another\'s replay')
})
