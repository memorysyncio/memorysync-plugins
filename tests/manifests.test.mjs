/**
 * Cursor / Claude plugin surfaces that people actually see in the UI:
 * display name, logo file, skill count, hook events.
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pluginRoot = join(root, 'plugins', 'memorysync')
const docsRoot = join(root, 'building-with-memorysync')

function readJson(...parts) {
  return JSON.parse(readFileSync(join(...parts), 'utf8'))
}

function skillDirs(plugin) {
  return readdirSync(join(plugin, 'skills')).filter((name) =>
    existsSync(join(plugin, 'skills', name, 'SKILL.md')),
  )
}

test('Cursor plugins use brand display names, not kebab-case identifiers', () => {
  const memory = readJson(pluginRoot, '.cursor-plugin', 'plugin.json')
  const docs = readJson(docsRoot, '.cursor-plugin', 'plugin.json')
  assert.equal(memory.name, 'memorysync')
  assert.equal(memory.displayName, 'MemorySync')
  assert.equal(docs.name, 'building-with-memorysync')
  assert.equal(docs.displayName, 'MemorySync Docs')
  assert.equal(memory.author.name, 'MemorySync')
  assert.equal(docs.author.name, 'MemorySync')
})

test('each plugin ships a real PNG logo next to the path its manifest names', () => {
  for (const plugin of [pluginRoot, docsRoot]) {
    const manifest = readJson(plugin, '.cursor-plugin', 'plugin.json')
    assert.equal(manifest.logo, 'assets/logo.png')
    const logo = join(plugin, manifest.logo)
    assert.ok(existsSync(logo), `${logo} missing`)
    assert.ok(statSync(logo).size > 1024, `${logo} looks empty`)
    const bytes = readFileSync(logo)
    assert.equal(bytes[0], 0x89)
    assert.equal(bytes[1], 0x50)
    assert.equal(bytes[2], 0x4e)
    assert.equal(bytes[3], 0x47)
  }
})

test('MemorySync ships 16+ skills with real, non-placeholder descriptions', () => {
  const names = skillDirs(pluginRoot)
  assert.ok(names.length >= 16, `expected >= 16 skills, got ${names.length}: ${names.join(', ')}`)
  for (const name of names) {
    const text = readFileSync(join(pluginRoot, 'skills', name, 'SKILL.md'), 'utf8')
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    assert.ok(fm, `${name} has frontmatter`)
    assert.match(fm[1], new RegExp(`^name:\\s*${name}\\s*$`, 'm'), `${name} name matches directory`)
    const description = fm[1].match(/^description:\s*(.+)$/m)
    assert.ok(description, `${name} has a description`)
    assert.ok(description[1].trim().length >= 60, `${name} description is too thin`)
    assert.doesNotMatch(description[1], /lorem|todo|placeholder|randomly/i)
  }
})

test('Cursor hooks cover 6+ lifecycle events with a written description', () => {
  const hooks = readJson(pluginRoot, 'hooks', 'cursor-hooks.json')
  const events = Object.keys(hooks.hooks)
  assert.ok(events.length >= 6, `expected >= 6 hook events, got ${events.join(', ')}`)
  for (const required of [
    'sessionStart',
    'beforeSubmitPrompt',
    'postToolUseFailure',
    'preCompact',
    'stop',
    'sessionEnd',
  ]) {
    assert.ok(events.includes(required), `missing ${required}`)
  }
  assert.ok((hooks.description || '').length >= 80, 'cursor-hooks.json needs a real description')
  assert.doesNotMatch(hooks.description, /lorem|todo|placeholder/i)
})

test('Cursor marketplace points at both plugins and keeps logo paths inside each plugin', () => {
  const marketplace = readJson(root, '.cursor-plugin', 'marketplace.json')
  assert.equal(marketplace.owner.name, 'MemorySync')
  const names = marketplace.plugins.map((p) => p.name)
  assert.deepEqual(names, ['memorysync', 'building-with-memorysync'])
  assert.equal(marketplace.plugins[0].source, './plugins/memorysync')
  assert.equal(marketplace.plugins[0].displayName, 'MemorySync')
  assert.equal(marketplace.plugins[1].source, './building-with-memorysync')
  assert.equal(marketplace.plugins[1].displayName, 'MemorySync Docs')
  for (const entry of marketplace.plugins) {
    assert.equal(entry.logo, 'assets/logo.png')
  }
})
