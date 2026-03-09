# lark-rag

飞书知识库 RAG 问答 Skill，适用于 [OpenClaw](https://github.com/openclaw/openclaw) 平台。

通过飞书 API 将知识库内容同步到本地 SQLite 向量索引，用户在任意渠道发问时自动检索相关内容并回答。

## 功能

- 手动触发同步飞书知识库（支持指定知识空间或子节点目录）
- 本地向量检索（SQLite + sqlite-vec，零额外依赖）
- Ollama 本地 embedding（nomic-embed-text，完全离线）
- 关键词触发问答，自动引用来源文档

## 目录结构

```
lark-kb/                  # Node.js CLI 工具
├── index.js              # 入口：sync / search / status
├── config.js             # 配置加载
├── db.js                 # SQLite + sqlite-vec 向量存储
├── embed.js              # Ollama embedding
├── feishu.js             # 飞书 API + 文本分块
├── sync.js               # 同步流程
├── search.js             # 检索流程
└── config.example.json   # 配置模板

skills/lark-kb/
└── SKILL.md              # OpenClaw Skill 定义
```

## 快速开始

### 1. 安装依赖

```bash
cd lark-kb && npm install
```

### 2. 配置

```bash
cp lark-kb/config.example.json lark-kb/config.json
```

编辑 `config.json`：

```json
{
  "feishu": {
    "app_id": "cli_xxx",
    "app_secret": "xxx",
    "spaces": [
      { "space_id": "spc_xxx" },
      { "space_id": "spc_yyy", "node_token": "wiki_zzz" }
    ]
  },
  "ollama": {
    "base_url": "http://localhost:11434",
    "model": "nomic-embed-text"
  },
  "db_path": "~/.openclaw/lark-kb/kb.db",
  "top_k": 3
}
```

`node_token` 可选，指定后只同步该节点目录下的文档。

### 3. 启动 Ollama

```bash
ollama serve
ollama pull nomic-embed-text
```

### 4. 飞书应用权限

前往 [飞书开发者后台](https://open.feishu.cn/app) 创建自建应用，开通以下权限：

- `wiki:wiki:readonly`
- `docx:document:readonly`

在知识空间设置中将应用添加为成员。

### 5. 同步知识库

```bash
node lark-kb/index.js sync
```

### 6. 安装到 OpenClaw

```bash
cp -r skills/lark-kb ~/.openclaw/workspace/skills/
```

## CLI 用法

```bash
# 同步飞书知识库
node lark-kb/index.js sync

# 搜索（返回 JSON）
node lark-kb/index.js search "如何申请年假"

# 查看索引状态
node lark-kb/index.js status
```

## OpenClaw 触发词

安装 Skill 后，在任意渠道发送包含以下关键词的消息即可触发：

`知识库` `知识空间` `查文档` `内部文档` `wiki` `资料库`

发送 `/kb sync` 手动触发同步。

## 技术栈

| 模块 | 技术 |
|---|---|
| 运行时 | Node.js ≥ 22，ESM |
| 向量存储 | better-sqlite3 + sqlite-vec |
| Embedding | Ollama nomic-embed-text（768 维） |
| 飞书 API | Wiki v2 + Docx v1 |
