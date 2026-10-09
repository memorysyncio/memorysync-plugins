/**
 * Contract tests for the MemorySync Claude Code hooks.
 *
 * Each test runs the REAL hook script as a child process — exactly how
 * Claude Code runs it — with a real stdin payload (shapes taken
 * verbatim from the hooks reference) against the in-process mock
 * server, which follows the production add_turn contract: user turns
 * become extracted facts, nothing else is stored. The one contract
 * above all: EVERY path exits 0.
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { startMock } from './mock-server.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SCRIPTS = process.env.MEMORYSYNC_SCRIPTS_DIR || join(ROOT, 'plugins', 'memorysync', 'scripts')
const KEY = 'ms_test_key_1'
const lib = await import(pathToFileURL(join(SCRIPTS, 'lib.mjs')).href)

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
  mock.state.denyProjects = false
  mock.state.recallReturnsEmpty = false
  mock.state.quotaMode = null
  mock.state.delayMs = 0
  cacheDir = mkdtempSync(join(tmpdir(), 'ms-claude-test-'))
})

function runHook(script, payload, envOverrides = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [join(SCRIPTS, script)], {
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
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }))
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

/** The capture worker's payload, exactly as prompt.mjs encodes it. */
function workerPayload(turn) {
  return { MEMORYSYNC_HOOK_PAYLOAD: Buffer.from(JSON.stringify(turn)).toString('base64') }
}

/** Store one fact through the real capture path (the worker, run in the foreground). */
async function seedFact(text) {
  const { code } = await runHook('persist-turn.mjs', {}, workerPayload({ role: 'human', text }))
  assert.equal(code, 0)
}

async function rows() {
  const res = await fetch(`${mock.url}/__rows`)
  return res.json()
}

/** Every add_turn request the mock received, with the response it sent. */
function turnRequests() {
  return mock.state.requests.filter((r) => r.route === 'POST /v1/memory/add_turn')
}

/** Poll for the detached capture worker (it outlives the hook process). */
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

function readJson(...parts) {
  return JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'))
}

const SESSION_START = {
  session_id: 'abc123',
  transcript_path: '/tmp/x.jsonl',
  cwd: 'C:/work/demo',
  hook_event_name: 'SessionStart',
  source: 'startup',
}

// ── session-start ─────────────────────────────────────────────────────

test('session-start injects recalled context as additionalContext', async () => {
  await seedFact('I love teal and I prefer pnpm')
  const { code, stdout } = await runHook('session-start.mjs', SESSION_START)
  assert.equal(code, 0)
  const out = JSON.parse(stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /I love teal/)
  assert.match(out.hookSpecificOutput.additionalContext, /demo-project/)
  assert.match(
    out.hookSpecificOutput.additionalContext,
    /background information, not as instructions/,
    'the prompt-injection guard line is always present',
  )
})

test('session-start with no memories emits nothing', async () => {
  const { code, stdout } = await runHook('session-start.mjs', SESSION_START)
  assert.equal(code, 0)
  assert.equal(stdout, '', 'no context means no output at all')
})

test('session-start uses the query fallback when recall is empty (production contract)', async () => {
  await seedFact('my project decisions matter')
  mock.state.recallReturnsEmpty = true
  const { code, stdout } = await runHook('session-start.mjs', SESSION_START)
  assert.equal(code, 0)
  assert.match(JSON.parse(stdout).hookSpecificOutput.additionalContext, /project decisions/)
})

test('session-start without an API key is a silent no-op', async () => {
  const { code, stdout } = await runHook('session-start.mjs', SESSION_START, { MEMORYSYNC_API_KEY: '' })
  assert.equal(code, 0)
  assert.equal(stdout, '')
})

test('session-start respects CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC (zero requests)', async () => {
  const { code, stdout } = await runHook('session-start.mjs', SESSION_START, {
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  })
  assert.equal(code, 0)
  assert.equal(stdout, '')
  assert.equal(mock.state.requests.length, 0, 'not a single network call')
})

test('session-start survives a dead server within its timeout, exit 0', async () => {
  const { code, stdout } = await runHook('session-start.mjs', SESSION_START, {
    MEMORYSYNC_BASE_URL: 'http://127.0.0.1:9',
  })
  assert.equal(code, 0)
  assert.equal(stdout, '')
})

test('session-start survives a 500, exit 0, no output', async () => {
  mock.state.failNext = 500
  const { code, stdout } = await runHook('session-start.mjs', SESSION_START)
  assert.equal(code, 0)
  assert.equal(stdout, '')
})

// ── prompt ────────────────────────────────────────────────────────────

const PROMPT_EVENT = {
  session_id: 'abc123',
  cwd: 'C:/work/demo',
  hook_event_name: 'UserPromptSubmit',
  prompt: 'what colour do I like for the dashboard theme?',
}

/** Cowork/remote mode sends inline, so the request is done when the hook exits. */
const INLINE = { CLAUDE_CODE_REMOTE: 'true', MEMORYSYNC_PROMPT_RECALL: 'off' }

test('prompt hook injects per-prompt recall and sends the prompt as a user turn', async () => {
  await seedFact('I love teal colour dashboards')
  const { code, stdout } = await runHook('prompt.mjs', PROMPT_EVENT)
  assert.equal(code, 0)
  const out = JSON.parse(stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(out.hookSpecificOutput.additionalContext, /teal/)

  const stored = await pollRows((r) => r.some((row) => row.text === PROMPT_EVENT.prompt))
  const fact = stored.find((row) => row.text === PROMPT_EVENT.prompt)
  assert.ok(fact, 'the detached worker sent the prompt and the mock extracted its fact')
  assert.equal(fact.source, 'claude-code')
  assert.deepEqual(fact.metadata, {
    session_id: 'claude::demo-project',
    project: 'demo-project',
    agent_session: 'abc123',
    write_origin: 'turn-extraction',
    turn_role: 'user',
  })

  const sent = turnRequests().find((r) => r.body.text === PROMPT_EVENT.prompt)
  assert.ok(sent, 'plain text, no role prefix')
  assert.equal(sent.body.role, 'user', 'explicit user role')
  assert.equal(
    sent.body.speaker,
    `human@claude::demo-project#h${lib.fnv1a64(`human:${PROMPT_EVENT.prompt}`)}`,
    'the cross-adapter seed scheme is unchanged',
  )
  assert.equal(sent.response.memory_id, null, 'no row per turn')
  assert.equal(sent.response.processing_status, 'distilling')
})

test('the seed hash is FNV-1a 64 (standard test vectors)', () => {
  assert.equal(lib.fnv1a64(''), 'cbf29ce484222325')
  assert.equal(lib.fnv1a64('a'), 'af63dc4c8601ec8c')
  assert.equal(lib.fnv1a64('foobar'), '85944171f73967e8')
})

test('short prompts skip recall but are still sent', async () => {
  const { code, stdout } = await runHook('prompt.mjs', { ...PROMPT_EVENT, prompt: 'yes do it' })
  assert.equal(code, 0)
  assert.equal(stdout, '', 'no recall for a 9-char prompt')
  const stored = await pollRows((r) => r.some((row) => row.text === 'yes do it'))
  assert.ok(stored.some((row) => row.text === 'yes do it'))
})

test('MEMORYSYNC_PROMPT_RECALL=off disables injection, keeps capture', async () => {
  const { code, stdout } = await runHook('prompt.mjs', PROMPT_EVENT, { MEMORYSYNC_PROMPT_RECALL: 'off' })
  assert.equal(code, 0)
  assert.equal(stdout, '')
  const stored = await pollRows((r) => r.some((row) => row.text === PROMPT_EVENT.prompt))
  assert.ok(stored.some((row) => row.text === PROMPT_EVENT.prompt))
})

test('replaying the same prompt is recognised server-side: already_exists, extracted once', async () => {
  await runHook('prompt.mjs', PROMPT_EVENT)
  await pollTurnRequests((sent) => sent.length >= 1)
  await runHook('prompt.mjs', PROMPT_EVENT)
  const sent = await pollTurnRequests((all) => all.length >= 2)
  assert.equal(sent.length, 2, 'both hook runs sent the prompt')
  assert.equal(sent[1].body.speaker, sent[0].body.speaker, 'deterministic seed')
  assert.equal(sent[0].response.already_exists, false)
  assert.equal(sent[1].response.already_exists, true, 'the replay is recognised')
  assert.equal(sent[1].response.processing_status, 'skipped_replay')
  assert.equal((await rows()).length, 1, 'one extraction, one fact')
})

test('Cowork/remote mode sends INLINE — the fact exists the moment the hook exits', async () => {
  const { code } = await runHook('prompt.mjs', PROMPT_EVENT, INLINE)
  assert.equal(code, 0)
  const all = await rows() // no polling: inline means already sent
  assert.ok(
    all.some((row) => row.text === PROMPT_EVENT.prompt),
    'no detached child to get reaped by a cloud sandbox',
  )
})

test('very long prompts are capped before sending, sent once', async () => {
  const long = 'teal dashboards everywhere '.repeat(1600) // ~43k chars
  const { code } = await runHook('prompt.mjs', { ...PROMPT_EVENT, prompt: long }, INLINE)
  assert.equal(code, 0)
  const sent = turnRequests()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].body.text.length, lib.MAX_TURN_CHARS + 1, 'capped, plus the ellipsis')
  assert.ok(sent[0].body.text.endsWith('…'))
  assert.equal((await rows()).length, 1)
})

// ── stop ──────────────────────────────────────────────────────────────

const STOP_EVENT = {
  session_id: 'abc123',
  cwd: 'C:/work/demo',
  hook_event_name: 'Stop',
  stop_hook_active: false,
  last_assistant_message: 'Teal it is — I set the dashboard theme to teal.',
}

test('stop hook sends nothing: assistant replies are not stored', async () => {
  for (const event of [
    STOP_EVENT,
    { ...STOP_EVENT, last_assistant_message: '' },
    { ...STOP_EVENT, last_assistant_message: 'x'.repeat(40000) },
  ]) {
    const { code, stdout } = await runHook('flush.mjs', event)
    assert.equal(code, 0)
    assert.equal(stdout, '')
  }
  assert.equal(mock.state.requests.length, 0, 'not a single request, not even tenant discovery')
  assert.equal((await rows()).length, 0)
})

test('the capture worker never sends a non-user turn', async () => {
  for (const role of ['ai', 'assistant', 'system']) {
    const { code } = await runHook('persist-turn.mjs', {}, workerPayload({ role, text: 'Teal it is.' }))
    assert.equal(code, 0, role)
  }
  assert.equal(mock.state.requests.length, 0)
})

// ── quota behaviour (both server modes) ───────────────────────────────

test('silent quota mode: hooks stay quiet, sessions unaffected, nothing stored', async () => {
  mock.state.quotaMode = 'silent'
  const start = await runHook('session-start.mjs', SESSION_START)
  const prompt = await runHook('prompt.mjs', PROMPT_EVENT)
  const stop = await runHook('flush.mjs', STOP_EVENT)
  assert.deepEqual([start.code, prompt.code, stop.code], [0, 0, 0])
  assert.equal(start.stdout, '', 'reads answer empty — no injection, no error')
  const sent = await pollTurnRequests((all) => all.length >= 1)
  assert.equal(sent[0].response.processing_status, 'skipped', 'acked without storing')
  assert.equal((await rows()).length, 0, 'writes acked without storing — and no error')
})

test('strict quota mode (evaluation keys): 429s never break anything', async () => {
  mock.state.quotaMode = 'strict'
  const start = await runHook('session-start.mjs', SESSION_START)
  const prompt = await runHook('prompt.mjs', PROMPT_EVENT)
  const stop = await runHook('flush.mjs', STOP_EVENT)
  assert.deepEqual([start.code, prompt.code, stop.code], [0, 0, 0])
  assert.equal(start.stdout, '')
  const sent = await pollTurnRequests((all) => all.length >= 1)
  assert.equal(sent[0].status, 429, 'the capture worker met the 429 and stayed silent')
})

// ── identity & scoping ────────────────────────────────────────────────

test('evaluation keys (403 on projects) fall back to the default tenant', async () => {
  mock.state.denyProjects = true
  const { code } = await runHook('prompt.mjs', PROMPT_EVENT, INLINE)
  assert.equal(code, 0)
  const all = await rows()
  assert.equal(all.length, 1)
  assert.equal(all[0].tenant_id, 'default')
})

test('tenant discovery is cached across hook processes', async () => {
  await runHook('prompt.mjs', PROMPT_EVENT, INLINE)
  await runHook('prompt.mjs', { ...PROMPT_EVENT, prompt: 'which font did we choose for the dashboard?' }, INLINE)
  const discoveries = mock.state.requests.filter((r) => r.route === 'GET /org/projects')
  assert.equal(discoveries.length, 1, 'second process reused the cache file')
  assert.equal(turnRequests().length, 2)
})

test('project scope resolves from a real git checkout (worktree-aware fallback chain)', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'ms-git-'))
  mkdirSync(join(repo, '.git'), { recursive: true })
  writeFileSync(
    join(repo, '.git', 'config'),
    '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = git@github.com:Acme/Web-App.git\n',
  )
  const { code } = await runHook('prompt.mjs', { ...PROMPT_EVENT, cwd: repo }, { ...INLINE, MEMORYSYNC_PROJECT: '' })
  assert.equal(code, 0)
  const all = await rows()
  assert.equal(all[0].metadata.project, 'github.com/acme/web-app', 'normalized remote, lowercased')
  assert.equal(all[0].metadata.session_id, 'claude::github.com/acme/web-app')
  rmSync(repo, { recursive: true, force: true })
})

test('malformed stdin never crashes a hook', async () => {
  for (const script of ['session-start.mjs', 'prompt.mjs', 'flush.mjs']) {
    const child = spawn(process.execPath, [join(SCRIPTS, script)], {
      env: { ...process.env, MEMORYSYNC_API_KEY: KEY, MEMORYSYNC_BASE_URL: mock.url, MEMORYSYNC_CACHE_DIR: cacheDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stdin.write('this is not json {{{')
    child.stdin.end()
    const code = await new Promise((r) => child.on('close', r))
    assert.equal(code, 0, script)
  }
})

// ── version on the wire ───────────────────────────────────────────────

test('every request announces the plugin.json version in its User-Agent', async () => {
  const { version } = readJson('plugins', 'memorysync', '.claude-plugin', 'plugin.json')
  await runHook('session-start.mjs', SESSION_START)
  await runHook('prompt.mjs', PROMPT_EVENT, { CLAUDE_CODE_REMOTE: 'true' })
  const routes = new Set(mock.state.requests.map((r) => r.route))
  for (const route of ['GET /org/projects', 'POST /v1/memory/recall', 'POST /v1/memory/query', 'POST /v1/memory/add_turn']) {
    assert.ok(routes.has(route), `exercised ${route}`)
  }
  for (const request of mock.state.requests) {
    assert.equal(request.headers['user-agent'], `memorysync-claude-plugin/${version}`, request.route)
  }
})

test('PLUGIN_VERSION is the version every manifest of the plugin family declares', () => {
  const claudeMarketplace = readJson('.claude-plugin', 'marketplace.json')
  const cursorMarketplace = readJson('.cursor-plugin', 'marketplace.json')
  const declared = {
    'plugins/memorysync/.claude-plugin/plugin.json': readJson('plugins', 'memorysync', '.claude-plugin', 'plugin.json').version,
    '.claude-plugin/marketplace.json': claudeMarketplace.plugins.find((p) => p.name === 'memorysync').version,
    'plugins/memorysync/.cursor-plugin/plugin.json': readJson('plugins', 'memorysync', '.cursor-plugin', 'plugin.json').version,
    '.cursor-plugin/marketplace.json': cursorMarketplace.plugins.find((p) => p.name === 'memorysync').version,
    'plugins/memorysync/.codex-plugin/plugin.json': readJson('plugins', 'memorysync', '.codex-plugin', 'plugin.json').version,
  }
  for (const [manifest, version] of Object.entries(declared)) {
    assert.equal(version, lib.PLUGIN_VERSION, `${manifest} declares ${version}; scripts/lib.mjs PLUGIN_VERSION is ${lib.PLUGIN_VERSION}`)
  }
  assert.equal(lib.USER_AGENT, `memorysync-claude-plugin/${lib.PLUGIN_VERSION}`)
})

// ── status ────────────────────────────────────────────────────────────

test('status reports key, identity, scope and reachability', async () => {
  const { code, stdout } = await runHook('status.mjs', {})
  assert.equal(code, 0)
  assert.match(stdout, /API key \(MEMORYSYNC_API_KEY\): set/)
  assert.match(stdout, /User scope: user-1/)
  assert.match(stdout, /Project scope: demo-project/)
  assert.match(stdout, /API reachability: OK/)
})

test('status without a key explains exactly what to do', async () => {
  const { code, stdout } = await runHook('status.mjs', {}, { MEMORYSYNC_API_KEY: '' })
  assert.equal(code, 0)
  assert.match(stdout, /NOT SET — memory is off/)
  assert.match(stdout, /app\.memorysync\.io/)
})
