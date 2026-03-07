import { strict as assert } from 'node:assert'
import { test, after } from 'node:test'
import { unlinkSync } from 'node:fs'
import { openDb, getStatus } from './db.js'
import { syncSpace } from './sync.js'

const DB_PATH = '/tmp/sync-test.db'

test('syncSpace writes docs and chunks to db', async () => {
  const db = openDb(DB_PATH)

  // 提供 mock 依赖
  const mockFeishu = {
    getTenantToken: async () => 'mock-token',
    getAllNodes: async () => [
      { obj_token: 'doc1', title: '测试文档', obj_type: 'docx', url: 'https://test/doc1' }
    ],
    getDocContent: async () => '这是测试文档的内容。\n\n第二段内容。'
  }
  const mockEmbed = async () => new Float32Array(768).fill(0.1)

  const result = await syncSpace(db, 'spc_test', {
    feishu: { app_id: 'id', app_secret: 'sec' },
    ollama: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
  }, mockFeishu, mockEmbed)

  assert.equal(result.docs, 1)
  assert.ok(result.chunks >= 1)

  const status = getStatus(db)
  assert.equal(status.doc_count, 1)
  assert.ok(status.chunk_count >= 1)
  db.close()
})

after(() => { try { unlinkSync(DB_PATH) } catch {} })
