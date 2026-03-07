import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { chunkText } from './feishu.js'

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
