import { embed as _embed } from './embed.js'
import { searchChunks } from './db.js'

export async function searchKb(db, query, config, embedFn) {
  const embed = embedFn ?? _embed
  const queryEmbedding = await embed(query, config.ollama)
  return searchChunks(db, queryEmbedding, config.top_k ?? 3)
}
