/**
 * In-process mock MemorySync server for the hook contract tests.
 *
 * Reproduces the routes and response shapes the hooks touch, following
 * the production `POST /v1/memory/add_turn` contract:
 *
 * - a USER turn is "extracted" into one fact row — a stand-in for the LLM
 *   extractor — whose text is the turn text with any leading role prefix
 *   removed and whose metadata is the caller's scalar metadata plus
 *   `write_origin: "turn-extraction"` and `turn_role: "user"`;
 * - assistant/system/tool turns store nothing (`skipped_non_user_turn`)
 *   and filler stores nothing (`skipped_low_value`);
 * - a replay of the same (speaker, occurred_at, text) for the same user
 *   stores nothing and answers `already_exists: true` (`skipped_replay`);
 * - `memory_id` is always null: there is no row per turn.
 *
 * Also modelled: the production recall behaviour (`recallReturnsEmpty`);
 * the server's two monthly-quota modes ("silent": success-shaped
 * ok/empty payloads; "strict": 429 with the production limit_exceeded
 * payload); an `outage` (every API route answers that status until
 * cleared — 429 with the production RATE_LIMIT_EXCEEDED body, anything
 * else with a plain detail); and `queryMatchesAll`, where
 * /v1/memory/query returns the user's memories whatever the prompt, the
 * way production vector search always returns its nearest neighbours.
 *
 * `state.requests` logs every API request with its body, headers, and
 * the status and body the mock answered. Control endpoints for tests:
 * GET /__rows, POST /__reset (not logged).
 */

import { createServer } from 'node:http'

const USER_ROLES = new Set(['human', 'user', 'customer', 'caller'])
const NON_USER_ROLES = new Set(['ai', 'assistant', 'bot', 'system', 'tool', 'function', 'agent', 'model', 'developer'])
const ROLE_PREFIX = /^\s*(human|user|customer|caller|ai|assistant|bot|system|tool|function|agent|model)\s*:\s*/i
const RESERVED_FACT_KEYS = new Set(['write_origin', 'distilled_from', 'turn_role', 'history_id', 'episodic'])
const FILLER_WORDS = new Set([
  'and', 'or', 'but', 'so', 'then', 'also', 'plus', 'like', 'well',
  'ok', 'okay', 'kk', 'k', 'yes', 'yeah', 'yep', 'yup', 'no', 'nope',
  'nah', 'sure', 'right', 'fine', 'good', 'cool', 'nice', 'great',
  'awesome', 'perfect', 'exactly', 'really', 'totally', 'indeed',
  'alright', 'done', 'wow', 'oops', 'whoops',
  'hi', 'hello', 'hey', 'yo', 'bye', 'goodbye', 'thanks', 'thank',
  'you', 'please', 'welcome', 'morning', 'evening', 'night',
  'um', 'uh', 'umm', 'uhh', 'hmm', 'hm', 'huh', 'oh', 'ah', 'er',
  'haha', 'hehe', 'lol',
  'what', 'why', 'how', 'when', 'where', 'who', 'which',
  'the', 'a', 'an', 'it', 'this', 'that', 'me', 'my',
])

function normRole(value) {
  if (typeof value !== 'string') return null
  const lowered = value.trim().toLowerCase()
  if (USER_ROLES.has(lowered)) return 'user'
  if (NON_USER_ROLES.has(lowered)) return 'assistant'
  return null
}

/**
 * The server's role inference: the `role` field, then a leading role
 * prefix on the text (always stripped), then the speaker seed head
 * (`role@...`), then `metadata.role`; default user.
 */
function planTurn(body) {
  let content = String(body.text || '')
  let prefixRole = null
  const match = content.match(ROLE_PREFIX)
  if (match) {
    prefixRole = match[1]
    content = content.slice(match[0].length)
  }
  const speaker = typeof body.speaker === 'string' ? body.speaker : ''
  const head = speaker.includes('@') ? speaker.split('@')[0].trim() : null
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
  const role = normRole(body.role) || normRole(prefixRole) || normRole(head) || normRole(metadata.role) || 'user'
  return { role, content: content.trim() }
}

/** The server's filler gate: no letters, one word, or two filler words. */
function isLowValue(text) {
  if (!/[a-z]/i.test(text)) return true
  const words = text.toLowerCase().match(/[a-z']+/g) || []
  if (words.length <= 1) return true
  return words.length === 2 && words.every((w) => FILLER_WORDS.has(w))
}

/** Caller's scalar metadata minus server-owned keys, plus the extraction markers. */
function factMetadata(metadata) {
  const out = {}
  for (const [key, value] of Object.entries(metadata && typeof metadata === 'object' ? metadata : {})) {
    if (RESERVED_FACT_KEYS.has(key)) continue
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value
  }
  out.write_origin = 'turn-extraction'
  out.turn_role = 'user'
  return out
}

function turnAck(processingStatus, extra = {}) {
  return {
    memory_id: null,
    status: 'ok',
    processing_status: processingStatus,
    embed_mode: 'none',
    already_exists: false,
    request_id: null,
    ...extra,
  }
}

export function startMock() {
  const state = {
    rows: [],
    requests: [],
    receipts: new Set(),
    nextId: 1,
    failNext: null, // one-shot HTTP status
    denyProjects: false,
    recallReturnsEmpty: false,
    quotaMode: null, // null | 'silent' | 'strict'
    delayMs: 0,
    outage: null, // HTTP status every API route answers while set
    queryMatchesAll: false,
  }

  const METERED_ADDS = new Set(['POST /v1/memory/add_turn', 'POST /memory/add'])
  const METERED_READS = new Set(['POST /v1/memory/recall', 'POST /v1/memory/query', 'POST /memory/query'])

  function quotaResponse(route) {
    if (!state.quotaMode) return null
    const isAdd = METERED_ADDS.has(route)
    const isRead = METERED_READS.has(route)
    if (!isAdd && !isRead) return null
    if (state.quotaMode === 'strict') {
      return {
        status: 429,
        body: { detail: { error: 'limit_exceeded', message: 'You have reached your monthly limit. Upgrade your plan.' } },
      }
    }
    if (route === 'POST /v1/memory/add_turn') return { status: 201, body: turnAck('skipped') }
    return isAdd ? { status: 200, body: { status: 'ok' } } : { status: 200, body: { memories: [] } }
  }

  function addTurn(body) {
    const text = typeof body.text === 'string' ? body.text : ''
    if (!text.trim()) return { status: 422, body: { detail: "'text' must be a non-empty string" } }
    const { role, content } = planTurn(body)
    if (role !== 'user') return { status: 201, body: turnAck('skipped_non_user_turn') }
    if (isLowValue(content)) return { status: 201, body: turnAck('skipped_low_value') }
    const receipt = JSON.stringify([body.tenant_id, body.user_id, body.speaker || '', body.occurred_at || '', text])
    if (state.receipts.has(receipt)) {
      return { status: 201, body: turnAck('skipped_replay', { already_exists: true }) }
    }
    state.receipts.add(receipt)
    const id = state.nextId++
    const requestId = `req_${id}`
    state.rows.push({
      id,
      user_id: body.user_id,
      tenant_id: body.tenant_id,
      text: content,
      source: body.source,
      metadata: factMetadata(body.metadata),
      request_id: requestId,
    })
    return {
      status: 201,
      body: turnAck('distilling', { status: 'processing', request_id: requestId }),
    }
  }

  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      setTimeout(() => {
        const body = raw ? JSON.parse(raw) : {}
        const route = `${req.method} ${req.url.split('?')[0]}`

        const reply = (status, payload) => {
          res.writeHead(status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(payload))
        }

        if (route === 'GET /__rows') return reply(200, state.rows)
        if (route === 'POST /__reset') {
          state.rows = []
          state.requests = []
          state.receipts = new Set()
          return reply(200, { ok: true })
        }

        const entry = { route, body, headers: req.headers, status: null, response: null }
        state.requests.push(entry)
        const send = (status, payload) => {
          entry.status = status
          entry.response = payload
          reply(status, payload)
        }

        if (state.failNext !== null) {
          const status = state.failNext
          state.failNext = null
          return send(status, { detail: 'injected failure' })
        }

        if (state.outage !== null) {
          if (state.outage === 429) {
            return send(429, {
              error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded (per-minute). Try again in 30 seconds.', retry_after: 30 },
            })
          }
          return send(state.outage, { detail: 'service unavailable' })
        }

        const quota = quotaResponse(route)
        if (quota) return send(quota.status, quota.body)

        if (route === 'GET /org/projects') {
          if (state.denyProjects) return send(403, { detail: 'Insufficient scope. Missing: projects:read' })
          return send(200, [{ id: 'proj_1', tenant_id: 'org_1', name: 'Default' }])
        }

        if (route === 'POST /v1/memory/add_turn') {
          const result = addTurn(body)
          return send(result.status, result.body)
        }

        if (route === 'POST /v1/memory/recall') {
          const mine = state.recallReturnsEmpty
            ? []
            : state.rows.filter((r) => r.user_id === body.user_id)
          return send(200, {
            context: mine.map((r) => `- ${r.text}`).join('\n'),
            memories: [],
            used_fallback: false,
          })
        }

        if (route === 'POST /v1/memory/query') {
          const needle = String(body.prompt || '').toLowerCase()
          const words = needle.split(/\s+/).filter(Boolean)
          const hits = state.rows
            .filter((r) => r.user_id === body.user_id)
            .filter((r) => state.queryMatchesAll || words.some((w) => r.text.toLowerCase().includes(w)))
            .map((r) => ({ memory_id: `m_${r.id}`, raw_text: r.text, score: 0.9 }))
          return send(200, { memories: hits.slice(0, body.k || 8) })
        }

        return send(404, { detail: `no mock for ${route}` })
      }, state.delayMs)
    })
  })

  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      resolvePromise({
        state,
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((r) => server.close(r)),
      })
    })
  })
}
