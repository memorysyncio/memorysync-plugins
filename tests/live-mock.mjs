/**
 * Standalone mock MemorySync for the LIVE local E2E: seeds one
 * distinctive memory, prints its URL, stays up until killed. The live
 * test points MEMORYSYNC_BASE_URL at this while driving the REAL
 * installed plugin through the REAL Claude Code runtime.
 */

import { startMock } from './mock-server.mjs'

const mock = await startMock()
mock.state.rows.push({
  id: mock.state.nextId++,
  user_id: process.env.LIVE_USER || 'live-probe',
  tenant_id: 'org_1',
  text: 'My favourite colour is teal and I always want teal used in examples',
  source: 'seed',
  metadata: { write_origin: 'turn-extraction', turn_role: 'user' },
})
console.log(mock.url)
// keep alive; parent kills the process when done
setInterval(() => {}, 60000)
