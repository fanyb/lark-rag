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
  const results = []
  for (const text of texts) {
    results.push(await embed(text, ollamaConfig))
  }
  return results
}
