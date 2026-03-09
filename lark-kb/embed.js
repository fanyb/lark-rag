export async function embed(text, { base_url, model }) {
  // 清洗：去除控制字符，截断超长内容（nomic-embed-text 上限 ~2048 字符安全）
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, 2048)
  if (!cleaned.trim()) return null

  const res = await fetch(`${base_url}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: cleaned })
  })
  if (res.status === 500) return null // 跳过无法 embed 的内容
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`)
  const { embedding } = await res.json()
  return new Float32Array(embedding)
}

export async function embedBatch(texts, ollamaConfig) {
  const results = []
  for (const text of texts) {
    results.push(await embed(text, ollamaConfig))
  }
  return results
}
