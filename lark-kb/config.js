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
