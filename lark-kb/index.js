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
