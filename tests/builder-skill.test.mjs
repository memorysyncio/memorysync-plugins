/**
 * Contract tests for the building-with-memorysync builder skill.
 *
 * A builder skill's failure mode is silent staleness: it names a tool,
 * endpoint, or guide that no longer exists and the coding agent builds
 * on fiction. These tests pin every such reference to the actual
 * codebase, so the skill physically cannot drift:
 *
 * - AgentSkills 1.0 spec compliance (name/dir match, length caps)
 * - docs-MCP tool + prompt names verified against the live route source
 * - every REST endpoint named in the skill verified against server code
 * - every /guides/<slug> verified against the docs content registry
 * - the plugin wrapper's copy is byte-identical to the canonical skill
 * - the marketplace carries both plugins with coherent versions
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = join(root, '..', '..')
const canonicalPath = join(root, 'skills', 'building-with-memorysync', 'SKILL.md')
const skill = readFileSync(canonicalPath, 'utf8')

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert.ok(match, 'frontmatter present')
  return match[1]
}

// ── AgentSkills 1.0 spec compliance ───────────────────────────────────

test('frontmatter follows the AgentSkills spec', () => {
  const fm = frontmatter(skill)
  const name = fm.match(/^name:\s*(.+)$/m)[1].trim()
  assert.equal(name, 'building-with-memorysync', 'name matches the directory')
  assert.ok(name.length <= 64)
  assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, numbers, single hyphens')

  const description = fm.match(/^description:\s*(.+)$/m)[1].trim()
  assert.ok(description.length <= 1024, `description ${description.length} chars (max 1024)`)
  for (const trigger of ['add memory to my agent', 'integrate MemorySync', 'evaluate MemorySync']) {
    assert.ok(description.includes(trigger), `description carries the trigger phrase: ${trigger}`)
  }
  assert.match(description, /Do NOT use for runtime memory/, 'anti-trigger present')
  assert.match(fm, /^license:\s*MIT$/m)
})

test('the body stays inside the progressive-disclosure budget', () => {
  const body = skill.slice(skill.indexOf('---', 4) + 3)
  const lines = body.split('\n').length
  assert.ok(lines <= 500, `${lines} lines (spec recommends <= 500)`)
  // ~4 chars/token: stay comfortably under the 5k-token guidance.
  assert.ok(body.length <= 20000, `${body.length} chars`)
})

test('references/ is deliberately empty — facts live in the docs MCP', async () => {
  const { readdirSync } = await import('node:fs')
  const refs = readdirSync(join(root, 'skills', 'building-with-memorysync', 'references'))
  assert.deepEqual(refs, ['.gitkeep'])
})

// ── the docs-MCP contract pin ─────────────────────────────────────────

test('every docs-MCP tool and prompt the skill names exists in the route source', () => {
  const route = readFileSync(
    join(repoRoot, 'dashboard', 'src', 'app', 'api', 'docs-mcp', 'route.ts'),
    'utf8',
  )
  for (const tool of ['search_docs', 'read_doc', 'list_doc_sections']) {
    assert.ok(skill.includes(`\`${tool}\``), `skill teaches ${tool}`)
    assert.ok(route.includes(`name: '${tool}'`), `route serves ${tool}`)
  }
  assert.ok(skill.includes('implement_with_memorysync'), 'skill names the prompt')
  assert.ok(route.includes("name: 'implement_with_memorysync'"), 'route serves the prompt')
  assert.ok(skill.includes('docs-index'), 'skill names the index resource')
  assert.ok(route.includes("name: 'docs-index'"), 'route serves the index resource')
  assert.ok(skill.includes('https://docs.memorysync.io/mcp'), 'server URL stated')
  assert.ok(skill.includes('the live docs win'), 'the authority rule is explicit')
})

// ── endpoint truth ────────────────────────────────────────────────────

test('every REST endpoint the skill names exists in the codebase', () => {
  const cliHttp = readFileSync(join(repoRoot, 'sdk', 'cli', 'src', 'http.mjs'), 'utf8')
  const evaluation = readFileSync(join(repoRoot, 'app', 'api', 'routes', 'evaluation.py'), 'utf8')
  const history = readFileSync(join(repoRoot, 'app', 'api', 'routes', 'v1', 'history.py'), 'utf8')
  const appMain = readFileSync(join(repoRoot, 'app', 'main.py'), 'utf8')
  const historyUnderV1 = appMain.includes('include_router(v1_history_router, prefix="/v1"')

  const expectations = [
    ['POST /memory/add', () => cliHttp.includes("post('/memory/add'")],
    ['POST /v1/memory/add_turn', () => cliHttp.includes('/v1/memory/add_turn') || skillAdapterUses('/v1/memory/add_turn')],
    ['POST /memory/bulk-add', () => cliHttp.includes("post('/memory/bulk-add'")],
    ['POST /memory/query', () => cliHttp.includes("post('/memory/query'")],
    ['POST /v1/memory/recall', () => skillAdapterUses('/v1/memory/recall')],
    ['POST /v1/memory/query', () => skillAdapterUses('/v1/memory/query')],
    ['DELETE /memory/forget', () => cliHttp.includes("'/memory/forget'")],
    ['POST /evaluation/keys', () => evaluation.includes('@router.post("/keys"')],
    ['GET /evaluation/usage', () => cliHttp.includes("get('/evaluation/usage')")],
  ]
  for (const route of [
    '/history/append', '/history/list', '/history/delete',
    '/state/put', '/state/get', '/state/list', '/state/search', '/state/delete', '/state/namespaces',
  ]) {
    expectations.push([`POST /v1${route}`, () => historyUnderV1 && history.includes(`@router.post("${route}"`)])
  }
  for (const [name, verify] of expectations) {
    const path = name.split(' ')[1]
    assert.ok(skill.includes(path), `skill names ${name}`)
    assert.ok(verify(), `${name} exists in the codebase`)
  }
  // The one endpoint the skill must FORBID, with the reason.
  assert.ok(skill.includes('DELETE /memory/user/purge'), 'the purge trap is named')
  assert.match(skill, /Never call `DELETE \/memory\/user\/purge`/, 'and explicitly forbidden')
})

test('add_turn is taught as the facts-only contract the server implements', () => {
  const route = readFileSync(join(repoRoot, 'app', 'api', 'routes', 'v1', 'memory.py'), 'utf8')
  for (const token of ['already_exists', 'skipped_non_user_turn', 'skipped_low_value', 'request_id']) {
    assert.ok(route.includes(token), `the add_turn route answers ${token}`)
    assert.ok(skill.includes(token), `the skill teaches ${token}`)
  }
  assert.ok(skill.includes('"role": "user"'), 'user turns are sent with an explicit role')
  assert.match(skill, /`memory_id` is always `null`/, 'no row per turn')
  assert.match(skill, /answers `already_exists: true`/, 'the replay is the idempotency proof')
  assert.doesNotMatch(skill, /"(human|ai): \.\.\."/, 'no role-prefixed turn text')
  assert.doesNotMatch(skill, /row already exists/, 'a replay creates no row')
})

function skillAdapterUses(path) {
  const lib = readFileSync(
    join(root, 'plugins', 'memorysync', 'scripts', 'lib.mjs'),
    'utf8',
  )
  return lib.includes(path)
}

// ── guide-slug truth ──────────────────────────────────────────────────

test('every /guides/<slug> in the delegation table exists in the docs registry', () => {
  const content = readFileSync(
    join(repoRoot, 'dashboard', 'src', 'components', 'docs', 'first-tab-content.ts'),
    'utf8',
  )
  const slugs = [
    'langchain', 'langgraph', 'vercel-ai-sdk', 'crewai', 'mastra',
    'openai-agents', 'llamaindex', 'google-adk', 'pydantic-ai',
    'claude-code', 'cursor', 'codex', 'opencode', 'devin', 'vscode',
    'openclaw', 'hermes-agent', 'antigravity',
  ]
  for (const slug of slugs) {
    assert.ok(skill.includes(`\`${slug}\``), `skill routes to ${slug}`)
    const key = slug.includes('-') ? `'${slug}'` : `${slug}:`
    assert.ok(
      content.includes(`'${slug}': page(`) || content.includes(`${slug}: page(`),
      `guide page exists for ${slug} (${key})`,
    )
  }
})

// ── scoping headers are taught exactly ────────────────────────────────

test('the three scoping headers are taught by exact name', () => {
  for (const header of ['X-API-Key', 'X-End-User-ID', 'X-Project-ID']) {
    assert.ok(skill.includes(`\`${header}\``), header)
  }
  assert.match(skill, /strict/i, 'evaluation strict mode taught')
  assert.ok(skill.includes('"limit_exceeded"'), 'the strict 429 payload shape is shown')
  assert.ok(skill.includes('{"status": "ok"}'), 'the silent write shape is shown')
  assert.ok(skill.includes('{"memories": []}'), 'the silent read shape is shown')
})

// ── wrapper plugin coherence ──────────────────────────────────────────

test('the plugin wrapper copy is byte-identical to the canonical skill', () => {
  const copy = readFileSync(
    join(root, 'building-with-memorysync', 'skills', 'building-with-memorysync', 'SKILL.md'),
    'utf8',
  )
  assert.equal(copy, skill, 'run the sync copy step after editing the canonical skill')
})

test('the marketplace carries both plugins and the wrapper is coherent', () => {
  const marketplace = JSON.parse(
    readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'),
  )
  const names = marketplace.plugins.map((p) => p.name)
  assert.deepEqual(names, ['memorysync', 'building-with-memorysync'])
  const builder = marketplace.plugins[1]
  assert.equal(builder.source, './building-with-memorysync')

  const manifest = JSON.parse(
    readFileSync(join(root, 'building-with-memorysync', '.claude-plugin', 'plugin.json'), 'utf8'),
  )
  assert.equal(manifest.name, 'building-with-memorysync')
  assert.equal(manifest.version, builder.version, 'manifest and marketplace versions agree')
  assert.match(
    frontmatter(skill),
    new RegExp(`^\\s+version:\\s*"${manifest.version.replace(/\./g, '\\.')}"$`, 'm'),
    'the skill metadata carries the plugin version',
  )

  const mcp = JSON.parse(
    readFileSync(join(root, 'building-with-memorysync', '.mcp.json'), 'utf8'),
  )
  assert.equal(mcp.mcpServers['memorysync-docs'].url, 'https://docs.memorysync.io/mcp')
  assert.equal(mcp.mcpServers['memorysync-docs'].type, 'http')
  assert.equal(Object.keys(mcp.mcpServers).length, 1, 'docs server only — no auth surface')
})
