import { getTenantToken as _getTenantToken, getAllNodes as _getAllNodes, getDocContent as _getDocContent, chunkText } from './feishu.js'
import { embed as _embed } from './embed.js'
import { upsertDoc, deleteDocChunks, insertChunk } from './db.js'

export async function syncSpace(db, spaceId, config, feishuDeps, embedFn) {
  // 支持依赖注入（测试用），默认使用真实实现
  const getTenantToken = feishuDeps?.getTenantToken ?? _getTenantToken
  const getAllNodes = feishuDeps?.getAllNodes ?? _getAllNodes
  const getDocContent = feishuDeps?.getDocContent ?? _getDocContent
  const embed = embedFn ?? _embed

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
