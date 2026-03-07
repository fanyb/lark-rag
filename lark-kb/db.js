import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDb(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  sqliteVec.load(db)

  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      id TEXT PRIMARY KEY,
      title TEXT,
      url TEXT,
      space_id TEXT,
      synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id TEXT,
      content TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      embedding FLOAT[768]
    );
  `)
  return db
}

export function upsertDoc(db, { id, title, url, space_id }) {
  db.prepare(`
    INSERT INTO docs (id, title, url, space_id, synced_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, synced_at=excluded.synced_at
  `).run(id, title, url, space_id, Date.now())
}

export function deleteDocChunks(db, docId) {
  const ids = db.prepare('SELECT id FROM chunks WHERE doc_id=?').all(docId).map(r => r.id)
  for (const id of ids) {
    db.prepare(`DELETE FROM vec_chunks WHERE rowid=${id}`).run()
  }
  db.prepare('DELETE FROM chunks WHERE doc_id=?').run(docId)
}

export function insertChunk(db, { doc_id, content, embedding }) {
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO chunks (doc_id, content) VALUES (?, ?)'
  ).run(doc_id, content)

  const bytes = new Uint8Array(embedding.buffer)
  // sqlite-vec v0.1.6: bound parameters cannot be used as rowid in vec0 tables;
  // use vec_f32() to wrap the vector blob and embed the integer rowid directly in SQL.
  db.prepare(`INSERT INTO vec_chunks (rowid, embedding) VALUES (${lastInsertRowid}, vec_f32(?))`).run(bytes)

  return lastInsertRowid
}

export function searchChunks(db, queryEmbedding, topK) {
  const bytes = new Uint8Array(queryEmbedding.buffer)
  // sqlite-vec v0.1.6: when using JOIN, LIMIT ? is not recognized as a knn constraint;
  // use the 'k = ?' syntax in the WHERE clause instead.
  const rows = db.prepare(`
    SELECT c.content, c.doc_id, d.title AS doc_title, d.url,
           v.distance AS score
    FROM vec_chunks v
    JOIN chunks c ON c.id = v.rowid
    JOIN docs d ON d.id = c.doc_id
    WHERE v.embedding MATCH vec_f32(?) AND k = ?
    ORDER BY v.distance
  `).all(bytes, topK)

  return rows.map(r => ({ ...r, score: 1 - r.score }))
}

export function getStatus(db) {
  const { doc_count } = db.prepare('SELECT COUNT(*) AS doc_count FROM docs').get()
  const { chunk_count } = db.prepare('SELECT COUNT(*) AS chunk_count FROM chunks').get()
  const last = db.prepare('SELECT MAX(synced_at) AS last_sync FROM docs').get()
  return { doc_count, chunk_count, last_sync: last.last_sync }
}
