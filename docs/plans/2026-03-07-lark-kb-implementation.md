# Lark KB RAG Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个 OpenClaw Skill，通过飞书 API 同步知识库到本地 SQLite 向量索引，关键词触发时自动检索相关内容回答用户问题。

**Architecture:** 两个部分——`lark-kb` Node.js CLI 工具负责同步/检索；`skills/lark-kb/SKILL.md` 告诉 OpenClaw agent 何时触发以及如何调用 CLI。同步时拉取飞书知识库页面、分块、调用 Ollama embedding、写入 SQLite+sqlite-vec；问答时 embed 用户问题后做向量相似度搜索。

**Tech Stack:** Node.js ≥ 22, better-sqlite3, sqlite-vec, Ollama (nomic-embed-text), 飞书 REST API v2

---

### Task 1: 项目初始化

**Files:**
- Create: `lark-kb/package.json`
- Create: `lark-kb/config.example.json`
- Create: `skills/lark-kb/SKILL.md`

**Step 1: 创建目录结构**

```bash
mkdir -p lark-kb skills/lark-kb
```

**Step 2: 创建 package.json**

```json
{
  "name": "lark-kb",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "lark-kb": "./index.js"
  },
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "better-sqlite3": "^9.6.0",
    "sqlite-vec": "^0.1.6"
  }
}
```

**Step 3: 安装依赖**

```bash
cd lark-kb && npm install
```

预期：`node_modules/` 目录生成，`better-sqlite3` 和 `sqlite-vec` 均已安装。

**Step 4: 创建 config.example.json**

```json
{
  "feishu": {
    "app_id": "cli_xxx",
    "app_secret": "xxx",
    "space_ids": ["spc_xxx"]
  },
  "ollama": {
    "base_url": "http://localhost:11434",
    "model": "nomic-embed-text"
  },
  "db_path": "~/.openclaw/lark-kb/kb.db",
  "top_k": 3
}
```

**Step 5: 确认飞书 App 权限**

飞书开发者后台需开通以下权限：
- `wiki:wiki:readonly` - 读取知识空间

**Step 6: Commit**

```bash
git init
git add lark-kb/package.json lark-kb/package-lock.json lark-kb/config.example.json
git commit -m "chore: init lark-kb project"
```

---

### Task 2: 配置模块（config.js）

**Files:**
- Create: `lark-kb/config.js`
- Create: `lark-kb/config.test.js`

**Step 1: 写失败测试**

创建 `lark-kb/config.test.js`：

```js
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
```

**Step 2: 运行测试确认失败**

```bash
cd lark-kb && node --test config.test.js
```

预期：FAIL，`Cannot find module './config.js'`

**Step 3: 实现 config.js**

```js
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadConfig(configPath) {
  const abs = resolve(configPath)
  if (!existsSync(abs)) throw new Error(`Config not found: ${abs}`)
  return JSON.parse(readFileSync(abs, 'utf8'))
}

export function resolveDbPath(dbPath) {
  return dbPath.replace(/^~/, process.env.HOME)
}
```

**Step 4: 运行测试确认通过**

```bash
node --test config.test.js
```

预期：PASS 2 tests

**Step 5: Commit**

```bash
git add lark-kb/config.js lark-kb/config.test.js
git commit -m "feat: add config loader"
```

---

### Task 3: 数据库模块（db.js）

**Files:**
- Create: `lark-kb/db.js`
- Create: `lark-kb/db.test.js`

**Step 1: 写失败测试**

创建 `lark-kb/db.test.js`：

```js
import { strict as assert } from 'node:assert'
import { test, after } from 'node:test'
import { unlinkSync } from 'node:fs'
import { openDb, upsertDoc, insertChunk, searchChunks, getStatus } from './db.js'

const DB_PATH = '/tmp/test-kb.db'

test('openDb creates schema', () => {
  const db = openDb(DB_PATH)
  // 验证表存在
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
```

**Step 2: 运行测试确认失败**

```bash
node --test db.test.js
```

预期：FAIL

**Step 3: 实现 db.js**

```js
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
      chunk_id INTEGER PRIMARY KEY,
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
    db.prepare('DELETE FROM vec_chunks WHERE chunk_id=?').run(id)
  }
  db.prepare('DELETE FROM chunks WHERE doc_id=?').run(docId)
}

export function insertChunk(db, { doc_id, content, embedding }) {
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO chunks (doc_id, content) VALUES (?, ?)'
  ).run(doc_id, content)

  db.prepare('INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)').run(
    lastInsertRowid,
    new Uint8Array(embedding.buffer)
  )
  return lastInsertRowid
}

export function searchChunks(db, queryEmbedding, topK) {
  const rows = db.prepare(`
    SELECT c.content, c.doc_id, d.title AS doc_title, d.url,
           v.distance AS score
    FROM vec_chunks v
    JOIN chunks c ON c.id = v.chunk_id
    JOIN docs d ON d.id = c.doc_id
    WHERE embedding MATCH ?
    ORDER BY v.distance
    LIMIT ?
  `).all(new Uint8Array(queryEmbedding.buffer), topK)

  return rows.map(r => ({ ...r, score: 1 - r.score }))
}

export function getStatus(db) {
  const { doc_count } = db.prepare('SELECT COUNT(*) AS doc_count FROM docs').get()
  const { chunk_count } = db.prepare('SELECT COUNT(*) AS chunk_count FROM chunks').get()
  const last = db.prepare('SELECT MAX(synced_at) AS last_sync FROM docs').get()
  return { doc_count, chunk_count, last_sync: last.last_sync }
}
```

**Step 4: 运行测试确认通过**

```bash
node --test db.test.js
```

预期：PASS 5 tests

**Step 5: Commit**

```bash
git add lark-kb/db.js lark-kb/db.test.js
git commit -m "feat: add SQLite+sqlite-vec db module"
```

---

### Task 4: Embedding 模块（embed.js）

**Files:**
- Create: `lark-kb/embed.js`
- Create: `lark-kb/embed.test.js`

**Step 1: 确认 Ollama 已运行**

```bash
curl http://localhost:11434/api/tags
```

预期：返回模型列表 JSON。若失败先启动：`ollama serve`

**Step 2: 确认 nomic-embed-text 已拉取**

```bash
ollama list | grep nomic-embed-text
```

若不存在：`ollama pull nomic-embed-text`

**Step 3: 写失败测试**

创建 `lark-kb/embed.test.js`：

```js
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { embed, embedBatch } from './embed.js'

// 注意：这是集成测试，需要 Ollama 运行中
test('embed returns Float32Array of correct length', async () => {
  const vec = await embed('测试文本', {
    base_url: 'http://localhost:11434',
    model: 'nomic-embed-text'
  })
  assert.ok(vec instanceof Float32Array)
  assert.equal(vec.length, 768)
})

test('embedBatch returns array of embeddings', async () => {
  const vecs = await embedBatch(['文本一', '文本二'], {
    base_url: 'http://localhost:11434',
    model: 'nomic-embed-text'
  })
  assert.equal(vecs.length, 2)
  assert.ok(vecs[0] instanceof Float32Array)
})
```

**Step 4: 运行测试确认失败**

```bash
node --test embed.test.js
```

预期：FAIL，`Cannot find module './embed.js'`

**Step 5: 实现 embed.js**

```js
export async function embed(text, { base_url, model }) {
  const res = await fetch(`${base_url}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text })
  })
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`)
  const { embedding } = await res.json()
  return new Float32Array(embedding)
}

export async function embedBatch(texts, ollamaConfig) {
  // Ollama 暂不支持批量，顺序调用
  const results = []
  for (const text of texts) {
    results.push(await embed(text, ollamaConfig))
  }
  return results
}
```

**Step 6: 运行测试确认通过**

```bash
node --test embed.test.js
```

预期：PASS 2 tests（需要 Ollama 运行）

**Step 7: Commit**

```bash
git add lark-kb/embed.js lark-kb/embed.test.js
git commit -m "feat: add Ollama embedding module"
```

---

### Task 5: 飞书 API 模块（feishu.js）

**Files:**
- Create: `lark-kb/feishu.js`
- Create: `lark-kb/feishu.test.js`

**背景知识：飞书 Wiki API**

- 获取 token：`POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal`
- 获取知识空间节点列表：`GET https://open.feishu.cn/open-apis/wiki/v2/spaces/{space_id}/nodes`
- 获取文档内容（Markdown）：`GET https://open.feishu.cn/open-apis/docx/v1/documents/{document_id}/raw_content`

**Step 1: 写失败测试（使用 mock fetch）**

创建 `lark-kb/feishu.test.js`：

```js
import { strict as assert } from 'node:assert'
import { test, mock } from 'node:test'
import { getTenantToken, listNodes, getDocContent, chunkText } from './feishu.js'

test('chunkText splits text into chunks under maxTokens', () => {
  const text = Array(20).fill('这是一段测试文本，包含若干汉字内容。').join('\n\n')
  const chunks = chunkText(text, 500)
  assert.ok(chunks.length > 1)
  for (const chunk of chunks) {
    // 粗略估计：汉字约1.5 token，500 token ≈ 333字符
    assert.ok(chunk.length <= 1200, `Chunk too long: ${chunk.length}`)
  }
})

test('chunkText preserves content', () => {
  const text = '段落一\n\n段落二\n\n段落三'
  const chunks = chunkText(text, 500)
  const rejoined = chunks.join(' ')
  assert.ok(rejoined.includes('段落一'))
  assert.ok(rejoined.includes('段落三'))
})
```

**Step 2: 运行测试确认失败**

```bash
node --test feishu.test.js
```

预期：FAIL

**Step 3: 实现 feishu.js**

```js
const BASE_URL = 'https://open.feishu.cn/open-apis'

export async function getTenantToken(appId, appSecret) {
  const res = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Feishu auth failed: ${data.msg}`)
  return data.tenant_access_token
}

export async function listNodes(token, spaceId, parentNodeToken = null) {
  const params = new URLSearchParams({ page_size: '50' })
  if (parentNodeToken) params.set('parent_node_token', parentNodeToken)
  const url = `${BASE_URL}/wiki/v2/spaces/${spaceId}/nodes?${params}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`listNodes failed: ${data.msg}`)
  return data.data?.items ?? []
}

export async function getAllNodes(token, spaceId) {
  const nodes = []
  const queue = [null] // null = root level

  while (queue.length > 0) {
    const parentToken = queue.shift()
    const items = await listNodes(token, spaceId, parentToken)
    for (const item of items) {
      if (item.obj_type === 'doc' || item.obj_type === 'docx') {
        nodes.push(item)
      }
      if (item.has_child) queue.push(item.node_token)
    }
  }
  return nodes
}

export async function getDocContent(token, documentId) {
  const url = `${BASE_URL}/docx/v1/documents/${documentId}/raw_content`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`getDocContent failed: ${data.msg}`)
  return data.data?.content ?? ''
}

export function chunkText(text, maxTokens = 500) {
  // 粗略估算：中文1字≈1.5token，英文1词≈1token；用字符数代理
  const maxChars = Math.floor(maxTokens / 1.5)
  const paragraphs = text.split(/\n\n+/)
  const chunks = []
  let current = ''

  for (const para of paragraphs) {
    if ((current + para).length > maxChars && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(c => c.length > 0)
}
```

**Step 4: 运行测试确认通过**

```bash
node --test feishu.test.js
```

预期：PASS 2 tests

**Step 5: Commit**

```bash
git add lark-kb/feishu.js lark-kb/feishu.test.js
git commit -m "feat: add Feishu API module with chunking"
```

---

### Task 6: 同步流程（sync.js）

**Files:**
- Create: `lark-kb/sync.js`
- Create: `lark-kb/sync.test.js`

**Step 1: 写失败测试**

创建 `lark-kb/sync.test.js`：

```js
import { strict as assert } from 'node:assert'
import { test, mock, after } from 'node:test'
import { unlinkSync } from 'node:fs'
import { openDb, getStatus } from './db.js'
import { syncSpace } from './sync.js'

const DB_PATH = '/tmp/sync-test.db'

test('syncSpace writes docs and chunks to db', async (t) => {
  // mock feishu functions
  const feishu = await import('./feishu.js')
  t.mock.method(feishu, 'getTenantToken', async () => 'mock-token')
  t.mock.method(feishu, 'getAllNodes', async () => [
    { obj_token: 'doc1', title: '测试文档', obj_type: 'docx', url: 'https://test/doc1' }
  ])
  t.mock.method(feishu, 'getDocContent', async () => '这是测试文档的内容。\n\n第二段内容。')

  // mock embed
  const embedMod = await import('./embed.js')
  t.mock.method(embedMod, 'embed', async () => new Float32Array(768).fill(0.1))

  const db = openDb(DB_PATH)
  const result = await syncSpace(db, 'spc_test', {
    feishu: { app_id: 'id', app_secret: 'sec' },
    ollama: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' }
  })

  assert.equal(result.docs, 1)
  assert.ok(result.chunks >= 1)

  const status = getStatus(db)
  assert.equal(status.doc_count, 1)
  assert.ok(status.chunk_count >= 1)
  db.close()
})

after(() => { try { unlinkSync(DB_PATH) } catch {} })
```

**Step 2: 运行测试确认失败**

```bash
node --test sync.test.js
```

**Step 3: 实现 sync.js**

```js
import { getTenantToken, getAllNodes, getDocContent, chunkText } from './feishu.js'
import { embed } from './embed.js'
import { upsertDoc, deleteDocChunks, insertChunk } from './db.js'

export async function syncSpace(db, spaceId, config) {
  const token = await getTenantToken(config.feishu.app_id, config.feishu.app_secret)
  const nodes = await getAllNodes(token, spaceId)

  let totalChunks = 0

  for (const node of nodes) {
    const docId = node.obj_token
    const content = await getDocContent(token, docId)

    upsertDoc(db, {
      id: docId,
      title: node.title,
      url: node.url ?? '',
      space_id: spaceId
    })

    deleteDocChunks(db, docId)

    const chunks = chunkText(content)
    for (const chunk of chunks) {
      const embedding = await embed(chunk, config.ollama)
      insertChunk(db, { doc_id: docId, content: chunk, embedding })
      totalChunks++
    }
  }

  return { docs: nodes.length, chunks: totalChunks }
}
```

**Step 4: 运行测试确认通过**

```bash
node --test sync.test.js
```

预期：PASS 1 test

**Step 5: Commit**

```bash
git add lark-kb/sync.js lark-kb/sync.test.js
git commit -m "feat: add sync pipeline"
```

---

### Task 7: 检索流程（search.js）

**Files:**
- Create: `lark-kb/search.js`
- Create: `lark-kb/search.test.js`

**Step 1: 写失败测试**

创建 `lark-kb/search.test.js`：

```js
import { strict as assert } from 'node:assert'
import { test, after } from 'node:test'
import { unlinkSync } from 'node:fs'
import { openDb, upsertDoc, insertChunk } from './db.js'
import { searchKb } from './search.js'

const DB_PATH = '/tmp/search-test.db'

test('searchKb returns relevant results', async (t) => {
  const db = openDb(DB_PATH)

  // 插入测试数据
  upsertDoc(db, { id: 'd1', title: '年假政策', url: 'https://test/d1', space_id: 'spc1' })
  const embedding = new Float32Array(768).fill(0.5)
  insertChunk(db, { doc_id: 'd1', content: '员工每年享有10天年假', embedding })

  // mock embed
  const embedMod = await import('./embed.js')
  t.mock.method(embedMod, 'embed', async () => new Float32Array(768).fill(0.5))

  const results = await searchKb(db, '年假有几天', {
    ollama: { base_url: 'http://localhost:11434', model: 'nomic-embed-text' },
    top_k: 3
  })

  assert.ok(Array.isArray(results))
  assert.ok(results.length > 0)
  assert.ok('content' in results[0])
  assert.ok('doc_title' in results[0])
  assert.ok('score' in results[0])
  db.close()
})

after(() => { try { unlinkSync(DB_PATH) } catch {} })
```

**Step 2: 运行测试确认失败**

```bash
node --test search.test.js
```

**Step 3: 实现 search.js**

```js
import { embed } from './embed.js'
import { searchChunks } from './db.js'

export async function searchKb(db, query, config) {
  const queryEmbedding = await embed(query, config.ollama)
  return searchChunks(db, queryEmbedding, config.top_k ?? 3)
}
```

**Step 4: 运行测试确认通过**

```bash
node --test search.test.js
```

**Step 5: Commit**

```bash
git add lark-kb/search.js lark-kb/search.test.js
git commit -m "feat: add search module"
```

---

### Task 8: CLI 入口（index.js）

**Files:**
- Create: `lark-kb/index.js`

**Step 1: 实现 index.js**

```js
#!/usr/bin/env node
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync } from 'node:fs'
import { loadConfig, resolveDbPath } from './config.js'
import { openDb, getStatus } from './db.js'
import { syncSpace } from './sync.js'
import { searchKb } from './search.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CONFIG = resolve(__dirname, 'config.json')

const [,, command, ...args] = process.argv

const configPath = process.env.LARK_KB_CONFIG ?? DEFAULT_CONFIG

if (!existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`)
  console.error(`Copy config.example.json to config.json and fill in your credentials.`)
  process.exit(1)
}

const config = loadConfig(configPath)
const dbPath = resolveDbPath(config.db_path)
mkdirSync(dirname(dbPath), { recursive: true })
const db = openDb(dbPath)

if (command === 'sync') {
  console.error('Syncing Feishu knowledge base...')
  let totalDocs = 0, totalChunks = 0
  for (const spaceId of config.feishu.space_ids) {
    const result = await syncSpace(db, spaceId, config)
    totalDocs += result.docs
    totalChunks += result.chunks
    console.error(`  Space ${spaceId}: ${result.docs} docs, ${result.chunks} chunks`)
  }
  console.log(JSON.stringify({ status: 'ok', docs: totalDocs, chunks: totalChunks }))

} else if (command === 'search') {
  const query = args.join(' ')
  if (!query) {
    console.error('Usage: lark-kb search <query>')
    process.exit(1)
  }
  const results = await searchKb(db, query, config)
  console.log(JSON.stringify(results))

} else if (command === 'status') {
  const status = getStatus(db)
  console.log(JSON.stringify(status))

} else {
  console.error('Usage: lark-kb <sync|search|status>')
  console.error('  sync          - sync Feishu knowledge base to local index')
  console.error('  search <q>    - search knowledge base, output JSON')
  console.error('  status        - show index stats')
  process.exit(1)
}
```

**Step 2: 添加可执行权限**

```bash
chmod +x lark-kb/index.js
```

**Step 3: 测试 CLI**

```bash
cd lark-kb
node index.js status
```

预期：`{"doc_count":0,"chunk_count":0,"last_sync":null}`

**Step 4: Commit**

```bash
git add lark-kb/index.js
git commit -m "feat: add CLI entry point"
```

---

### Task 9: OpenClaw SKILL.md

**Files:**
- Create: `skills/lark-kb/SKILL.md`

**Step 1: 创建 SKILL.md**

```markdown
# Feishu (Lark) Knowledge Base Q&A

This skill enables searching and Q&A against a locally indexed Feishu (Lark) knowledge base using RAG (Retrieval-Augmented Generation).

## Setup

1. Copy `lark-kb/config.example.json` to `lark-kb/config.json`
2. Fill in your Feishu App ID, App Secret, and Space IDs
3. Install dependencies: `cd lark-kb && npm install`
4. Pull embedding model: `ollama pull nomic-embed-text`
5. Run initial sync: `node lark-kb/index.js sync`

## Trigger Conditions

Activate this skill when the user's message contains any of:
- 知识库、知识空间
- 查文档、查一下文档、内部文档
- wiki、Wiki
- 资料库
- /kb sync

## Commands

### Sync Knowledge Base

When user sends `/kb sync` or asks to sync the knowledge base:

```bash
node /path/to/lark-kb/index.js sync
```

Output: `{"status":"ok","docs":N,"chunks":N}`
Report back: "已同步 N 篇文档，共 N 个片段。"

### Search Knowledge Base

When a message triggers this skill, extract the user's question and run:

```bash
node /path/to/lark-kb/index.js search "<用户问题>"
```

Output: JSON array of results:
```json
[
  {
    "doc_title": "文档标题",
    "content": "相关段落内容",
    "url": "https://xxx.feishu.cn/wiki/...",
    "score": 0.89
  }
]
```

### Check Status

```bash
node /path/to/lark-kb/index.js status
```

## Response Guidelines

- If results are found (score > 0.5): summarize the relevant content and cite the doc title
- If no results found: say "未在知识库中找到相关内容，建议先执行 /kb sync 同步最新文档"
- If search fails (command error): report the error and suggest checking config

## Notes

- `lark-kb/index.js` path depends on where you placed the lark-kb directory
- Set `LARK_KB_CONFIG=/path/to/config.json` env var to use a custom config path
- Requires Ollama running locally with nomic-embed-text model
```

**Step 2: Commit**

```bash
git add skills/lark-kb/SKILL.md
git commit -m "feat: add OpenClaw SKILL.md for lark-kb"
```

---

### Task 10: 运行全部测试 + 端到端验证

**Step 1: 运行全部单元测试**

```bash
cd lark-kb && node --test
```

预期：全部 PASS（embed 测试需要 Ollama 运行）

**Step 2: 端到端验证（需要真实飞书凭证）**

```bash
cp config.example.json config.json
# 填入真实的 app_id / app_secret / space_ids
node index.js sync
node index.js status
node index.js search "如何申请年假"
```

**Step 3: 将 lark-kb 注册为全局命令（可选）**

```bash
cd lark-kb && npm link
# 之后可直接运行：
lark-kb sync
lark-kb search "问题"
```

**Step 4: 最终 Commit**

```bash
git add .
git commit -m "feat: complete lark-kb RAG skill for OpenClaw"
```

---

## 依赖清单

```bash
# Node.js 依赖
cd lark-kb && npm install

# Ollama（macOS）
brew install ollama
ollama serve &
ollama pull nomic-embed-text

# 飞书配置
# 1. 前往 https://open.feishu.cn/app 创建企业自建应用
# 2. 开通权限：wiki:wiki:readonly, docx:document:readonly
# 3. 发布应用并获取 App ID + App Secret
# 4. 在知识空间设置中将应用添加为成员
```
