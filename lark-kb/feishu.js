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

export async function getAllNodes(token, spaceId, startNodeToken = null) {
  const nodes = []
  const queue = [startNodeToken] // null = root level, or specific node

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
  if (data.code === 403 || data.msg === 'forBidden') return ''
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
