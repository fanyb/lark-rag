import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { writeFileSync, unlinkSync } from 'node:fs'
import { loadConfig } from './config.js'

test('loadConfig reads and parses config.json', () => {
  writeFileSync('/tmp/test-config.json', JSON.stringify({
    feishu: { app_id: 'cli_test', app_secret: 'sec', space_ids: ['spc_1'] },
    ollama: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' },
    db_path: '/tmp/test.db',
    top_k: 3
  }))
  const cfg = loadConfig('/tmp/test-config.json')
  assert.equal(cfg.feishu.app_id, 'cli_test')
  assert.equal(cfg.top_k, 3)
  unlinkSync('/tmp/test-config.json')
})

test('loadConfig throws if file missing', () => {
  assert.throws(() => loadConfig('/tmp/nonexistent.json'), /not found/)
})
