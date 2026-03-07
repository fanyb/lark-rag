import { strict as assert } from 'node:assert'
import { test, after } from 'node:test'
import { unlinkSync } from 'node:fs'
import { openDb, upsertDoc, insertChunk } from './db.js'
import { searchKb } from './search.js'

const DB_PATH = '/tmp/search-test.db'

test('searchKb returns relevant results', async () => {
  const db = openDb(DB_PATH)

  // 插入测试数据
  upsertDoc(db, { id: 'd1', title: '年假政策', url: 'https://test/d1', space_id: 'spc1' })
  const embedding = new Float32Array(768).fill(0.5)
  insertChunk(db, { doc_id: 'd1', content: '员工每年享有10天年假', embedding })

  // mock embed 函数（依赖注入）
  const mockEmbed = async () => new Float32Array(768).fill(0.5)

  const results = await searchKb(db, '年假有几天', {
    ollama: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' },
    top_k: 3
  }, mockEmbed)

  assert.ok(Array.isArray(results))
  assert.ok(results.length > 0)
  assert.ok('content' in results[0])
  assert.ok('doc_title' in results[0])
  assert.ok('score' in results[0])
  db.close()
})

after(() => { try { unlinkSync(DB_PATH) } catch {} })
