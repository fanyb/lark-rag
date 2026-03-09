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
- lark-kb、lark kb
- /kb sync

## Commands

The lark-kb CLI is located at: `/Users/fanyb/txt/lark_rag/lark-kb/index.js`

### Sync Knowledge Base

When user sends `/kb sync` or asks to sync the knowledge base:

```bash
node /Users/fanyb/txt/lark_rag/lark-kb/index.js sync
```

Output: `{"status":"ok","docs":N,"chunks":N}`
Report back: "已同步 N 篇文档，共 N 个片段。"

### Search Knowledge Base

When a message triggers this skill, extract the user's question and run:

```bash
node /Users/fanyb/txt/lark_rag/lark-kb/index.js search "<用户问题>"
```

Output: JSON array of results:
```json
[
  {
    "doc_title": "文档标题",
    "content": "相关段落内容",
    "url": "https://feishu.cn/wiki/...",
    "score": -1.43
  }
]
```

**Note on scoring**: The score uses `1 - L2_distance` with non-normalized embeddings. Scores are typically in the range [-15, 0]. A score > -5 indicates a good match; score < -15 indicates a poor match. Do NOT require score > 0.

### Check Status

```bash
node /Users/fanyb/txt/lark_rag/lark-kb/index.js status
```

## Priority Rules

**IMPORTANT: Always follow this order. Never skip to step 2 without attempting step 1 first.**

1. **Primary: Local RAG search** — Always run `node /Users/fanyb/txt/lark_rag/lark-kb/index.js search "<question>"` first.
2. **Fallback: Feishu Wiki** — Only use Feishu Wiki API or browser search if the local RAG search returns an empty array or all results have score < -15.

Do NOT go to Feishu Wiki directly, even if you think it might have better results.

## Response Guidelines

- If RAG returns a non-empty array (even with negative scores): summarize content and cite doc title. Include URL only if non-empty.
- If RAG returns empty array or all scores < -15: inform the user "本地知识库未找到相关内容", then fall back to Feishu Wiki.
- If search command fails: report the error, suggest checking config or running `/kb sync`.

## Notes

- CLI path: `/Users/fanyb/txt/lark_rag/lark-kb/index.js`
- Set `LARK_KB_CONFIG=/path/to/config.json` env var to use a custom config path
- Requires Ollama running locally with nomic-embed-text model
- Score interpretation: score > -5 = excellent, -5 to -10 = good, -10 to -15 = moderate, < -15 = poor
