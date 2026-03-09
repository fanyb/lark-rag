# 飞书知识库 RAG 问答 Skill 设计文档

**日期**：2026-03-07
**平台**：OpenClaw
**状态**：已批准

---

## 目标

为 OpenClaw 构建一个飞书知识库问答 Skill。用户在任意渠道（飞书/WhatsApp 等）发送消息时，若消息包含知识库相关关键词，系统自动从本地向量索引中检索飞书知识库内容并回答。支持手动触发同步。

---

## 项目结构

```
skills/lark-kb/
└── SKILL.md              # OpenClaw Skill 定义文件

lark-kb/                  # 独立 Node.js CLI 工具
├── package.json
├── index.js              # 入口：解析命令 sync / search
├── feishu.js             # 飞书 API 拉取知识库内容
├── embed.js              # Ollama embedding 封装
├── db.js                 # SQLite + sqlite-vec 向量存储
└── config.json           # 飞书配置（App ID/Secret、Space ID 列表）
```

---

## 技术选型

| 模块 | 选型 |
|---|---|
| 飞书 API | 官方 REST API（知识库 v2）|
| 向量存储 | better-sqlite3 + sqlite-vec 扩展 |
| Embedding 模型 | Ollama nomic-embed-text（本地） |
| 文本分块 | 按标题+段落切分，500 token 上限 |
| 运行时 | Node.js ≥ 22 |

---

## 数据流

### 同步流程（手动触发 `/kb sync`）

```
用户发送 "/kb sync"
  → agent 调用 lark-kb sync
  → 拉取飞书知识空间列表
  → 递归获取所有页面内容（Markdown）
  → 按标题/段落分块（≤500 tokens）
  → 每块调用 Ollama embed → 获取 768 维向量
  → 写入 SQLite（chunks 表 + sqlite-vec 虚拟表）
  → 返回同步统计（文档数、chunk 数）
```

### 问答流程（关键词触发）

```
用户发送消息（含触发词）
  → SKILL.md 触发规则匹配
  → agent 提取用户问题
  → 调用 lark-kb search "<问题>"
  → 问题 embed → 向量相似度搜索（Top-3）
  → 返回 JSON：[{content, doc_title, url, score}]
  → agent 组织最终回答
```

---

## CLI 接口

```bash
# 手动同步飞书知识库
lark-kb sync

# 搜索（返回 JSON）
lark-kb search "如何申请年假"

# 查看同步状态
lark-kb status
```

### search 输出格式

```json
[
  {
    "doc_title": "HR 政策手册",
    "content": "年假申请流程：员工需提前3天...",
    "url": "https://xxx.feishu.cn/wiki/...",
    "score": 0.89
  }
]
```

---

## SKILL.md 设计

- **触发词**：知识库、文档、wiki、资料库、查一下文档、查文档、内部文档
- **同步触发**：用户发送 `/kb sync`
- **搜索触发**：消息包含触发词时，agent 自动调用 search
- **失败处理**：未找到相关内容时，告知用户并建议先执行 sync

---

## SQLite 数据库结构

```sql
-- 文档元数据
CREATE TABLE docs (
  id TEXT PRIMARY KEY,
  title TEXT,
  url TEXT,
  space_id TEXT,
  synced_at INTEGER
);

-- 文本块
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  doc_id TEXT,
  content TEXT,
  embedding BLOB  -- 由 sqlite-vec 管理
);

-- 向量索引（sqlite-vec 虚拟表）
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[768]
);
```

---

## 配置文件（config.json）

```json
{
  "feishu": {
    "app_id": "cli_xxx",
    "app_secret": "xxx",
    "space_ids": ["spc_xxx"]
  },
  "ollama": {
    "base_url": "http://localhost:11434",
    "model": "nomic-embed-text"
  },
  "db_path": "~/.openclaw/lark-kb/kb.db",
  "top_k": 3
}
```

---

## 依赖项

- `better-sqlite3` - SQLite 驱动
- `sqlite-vec` - 向量搜索扩展
- Node.js 内置 `fetch` - 飞书 API 调用 + Ollama API 调用

无其他重型依赖。
