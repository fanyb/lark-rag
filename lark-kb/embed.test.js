import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { embed, embedBatch } from './embed.js'

// 集成测试：需要 Ollama 运行中
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
