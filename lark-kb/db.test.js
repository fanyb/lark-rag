import { strict as assert } from 'node:assert'
import { test, after } from 'node:test'
import { unlinkSync } from 'node:fs'
import { openDb, upsertDoc, insertChunk, searchChunks, getStatus } from './db.js'

const DB_PATH = '/tmp/test-kb.db'

test('openDb creates schema', () => {
  const db = openDb(DB_PATH)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all().map(r => r.name)
  assert.ok(tables.includes('docs'))
  assert.ok(tables.includes('chunks'))
  db.close()
})

test('upsertDoc inserts and updates docs', () => {
  const db = openDb(DB_PATH)
  upsertDoc(db, { id: 'doc1', title: '测试文档', url: 'https://test', space_id: 'spc1' })
  const row = db.prepare('SELECT * FROM docs WHERE id=?').get('doc1')
  assert.equal(row.title, '测试文档')
  db.close()
})

test('insertChunk stores content', () => {
  const db = openDb(DB_PATH)
  const embedding = new Float32Array(768).fill(0.1)
  insertChunk(db, { doc_id: 'doc1', content: '测试内容', embedding })
  const row = db.prepare('SELECT * FROM chunks WHERE doc_id=?').get('doc1')
  assert.equal(row.content, '测试内容')
  db.close()
})

test('searchChunks returns top results', () => {
  const db = openDb(DB_PATH)
  const query = new Float32Array(768).fill(0.1)
  const results = searchChunks(db, query, 3)
  assert.ok(Array.isArray(results))
  assert.ok(results.length > 0)
  assert.ok('content' in results[0])
  assert.ok('score' in results[0])
  db.close()
})

test('getStatus returns doc and chunk counts', () => {
  const db = openDb(DB_PATH)
  const status = getStatus(db)
  assert.ok(typeof status.doc_count === 'number')
  assert.ok(typeof status.chunk_count === 'number')
  db.close()
})

after(() => {
  try { unlinkSync(DB_PATH) } catch {}
})
