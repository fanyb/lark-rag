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
- /kb sync

## Commands

### Sync Knowledge Base

When user sends `/kb sync` or asks to sync the knowledge base:

```bash
node /path/to/lark-kb/index.js sync
```

Output: `{"status":"ok","docs":N,"chunks":N}`
Report back: "已同步 N 篇文档，共 N 个片段。"

### Search Knowledge Base

When a message triggers this skill, extract the user's question and run:

```bash
node /path/to/lark-kb/index.js search "<用户问题>"
```

Output: JSON array of results:
```json
[
  {
    "doc_title": "文档标题",
    "content": "相关段落内容",
    "url": "https://xxx.feishu.cn/wiki/...",
    "score": 0.89
  }
]
```

### Check Status

```bash
node /path/to/lark-kb/index.js status
```

## Response Guidelines

- If results are found (score > 0.5): summarize the relevant content and cite the doc title
- If no results found: say "未在知识库中找到相关内容，建议先执行 /kb sync 同步最新文档"
- If search fails (command error): report the error and suggest checking config

## Notes

- `lark-kb/index.js` path depends on where you placed the lark-kb directory
- Set `LARK_KB_CONFIG=/path/to/config.json` env var to use a custom config path
- Requires Ollama running locally with nomic-embed-text model
