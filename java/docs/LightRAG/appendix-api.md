# LightRAG API 参考手册

> 版本：基于 LightRAG v1.4+ | 最后更新：2026 年 6 月

---

## 目录

1. [概述](#1-概述)
2. [核心类：LightRAG](#2-核心类lightrag)
3. [查询参数：QueryParam](#3-查询参数queryparam)
4. [REST API 端点](#4-rest-api-端点)
5. [存储后端](#5-存储后端)
6. [环境变量配置](#6-环境变量配置)
7. [服务器命令行选项](#7-服务器命令行选项)
8. [LLM 与 Embedding 注入](#8-llm-与-embedding-注入)
9. [知识图谱操作](#9-知识图谱操作)
10. [文档处理状态机](#10-文档处理状态机)
11. [错误码与异常](#11-错误码与异常)
12. [快速参考表](#12-快速参考表)

---

## 1. 概述

LightRAG 是一个轻量级、高性能的检索增强生成（Retrieval-Augmented Generation）框架。它提供两种使用方式：

- **SDK 模式（LightRAG Core）**：以 Python 库的形式嵌入到应用程序中，适用于研究、评估和嵌入式场景。
- **REST API 模式（LightRAG Server）**：基于 FastAPI 构建的 HTTP 服务，提供完整的 Web UI 和 RESTful 接口，推荐用于生产集成。

本文档涵盖两种模式下的全部公开 API，包括核心类的构造参数、查询参数、REST 端点、存储后端、环境变量配置以及常见错误码。

---

## 2. 核心类：LightRAG

`LightRAG` 是框架的核心类，位于 `lightrag/lightrag.py`。它继承自 `_RoleLLMMixin`、`_StorageMigrationMixin` 和 `_PipelineMixin`。

### 2.1 构造参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `working_dir` | `str` | `"./rag_storage"` | 缓存和临时文件的存储目录 |
| `kv_storage` | `str` | `"JsonKVStorage"` | 键值存储后端类型 |
| `vector_storage` | `str` | `"NanoVectorDBStorage"` | 向量存储后端类型 |
| `graph_storage` | `str` | `"NetworkXStorage"` | 知识图谱存储后端类型 |
| `doc_status_storage` | `str` | `"JsonDocStatusStorage"` | 文档处理状态存储类型 |
| `workspace` | `str` | `""` | 工作空间名称，用于数据隔离 |
| `top_k` | `int` | 环境变量 `TOP_K` 或 60 | 每次查询检索的实体/关系数量 |
| `chunk_top_k` | `int` | 环境变量 `CHUNK_TOP_K` 或 20 | 上下文中的最大文本块数量 |
| `max_entity_tokens` | `int` | 环境变量 `MAX_ENTITY_TOKENS` 或 6000 | 实体上下文的最大 token 数 |
| `max_relation_tokens` | `int` | 环境变量 `MAX_RELATION_TOKENS` 或 8000 | 关系上下文的最大 token 数 |
| `max_total_tokens` | `int` | 环境变量 `MAX_TOTAL_TOKENS` 或 30000 | 总上下文最大 token 数（含系统提示词、实体、关系和文本块） |
| `cosine_threshold` | `int` | 环境变量 `COSINE_THRESHOLD` 或 0.2 | 向量数据库检索的余弦相似度阈值 |
| `related_chunk_number` | `int` | 环境变量 `RELATED_CHUNK_NUMBER` 或 3 | 从单个实体或关系中获取的相关文本块数量 |
| `kg_chunk_pick_method` | `str` | `"WEIGHT"` | 文本块选择方法：`WEIGHT`（基于权重）或 `VECTOR`（基于嵌入相似度） |
| `enable_content_headings` | `bool` | `True` | 是否在发送给 LLM 的文本块 JSON 中包含父标题路径 |
| `entity_extract_max_gleaning` | `int` | 环境变量 `MAX_GLEANING` 或 1 | 对模糊内容的最大实体提取尝试次数 |
| `entity_extract_max_records` | `int` | 环境变量 `MAX_EXTRACTION_RECORDS` 或 1000 | 每次响应中实体+关系的最大记录数 |
| `entity_extract_max_entities` | `int` | 环境变量 `MAX_EXTRACTION_ENTITIES` 或 500 | 每次响应中实体的最大数量 |
| `force_llm_summary_on_merge` | `int` | 环境变量 `FORCE_LLM_SUMMARY_ON_MERGE` 或 0 | 合并时是否强制 LLM 重新生成摘要 |
| `chunk_token_size` | `int \| None` | `None` | 每个文本块的最大 token 数。`None` 表示使用 `addon_params` 中的配置 |
| `chunk_overlap_token_size` | `int \| None` | `None` | 连续文本块之间的重叠 token 数 |
| `tokenizer` | `Tokenizer \| None` | `None` | 分词器实例。为 `None` 时使用默认的 TiktokenTokenizer |
| `tiktoken_model_name` | `str` | `"gpt-4o-mini"` | 用于分词的 tiktoken 模型名称 |
| `chunking_func` | `Callable` | `chunking_by_token_size` | 自定义分块函数 |
| `embedding_func` | `EmbeddingFunc \| None` | `None` | 文本嵌入计算函数，使用前必须设置 |
| `embedding_batch_num` | `int` | 环境变量 `EMBEDDING_BATCH_NUM` 或 10 | 嵌入计算的批处理大小 |
| `embedding_func_max_async` | `int` | 环境变量 `EMBEDDING_FUNC_MAX_ASYNC` 或 8 | 最大并发嵌入函数调用数 |
| `embedding_cache_config` | `dict` | `{"enabled": False, "similarity_threshold": 0.95, "use_llm_check": False}` | 嵌入缓存配置 |
| `llm_model_func` | `Callable \| None` | `None` | LLM 模型函数，使用前必须设置 |
| `llm_model_name` | `str` | `"gpt-4o-mini"` | LLM 模型名称 |
| `summary_max_tokens` | `int` | 环境变量 `SUMMARY_MAX_TOKENS` 或 500 | 实体/关系描述的最大 token 数 |
| `summary_context_size` | `int` | 环境变量 `SUMMARY_CONTEXT_SIZE` 或 4000 | 每次 LLM 响应的最大 token 数 |
| `summary_length_recommended` | `int` | 环境变量 `SUMMARY_LENGTH_RECOMMENDED` 或 500 | LLM 摘要输出的推荐长度 |
| `llm_model_max_async` | `int` | 环境变量 `MAX_ASYNC` 或 4 | 最大并发 LLM 调用数 |
| `llm_model_kwargs` | `dict` | `{}` | 传递给 LLM 模型的额外关键字参数 |
| `entity_extraction_use_json` | `bool` | `False` | 是否使用 JSON 结构化输出进行实体提取 |
| `rerank_model_func` | `Callable \| None` | `None` | 重排序模型函数 |
| `rerank_model_max_async` | `int` | 环境变量 `MAX_ASYNC_RERANK` 或 4 | 最大并发重排序调用数 |
| `min_rerank_score` | `float` | 环境变量 `MIN_RERANK_SCORE` 或 0.0 | 重排序后过滤文本块的最低分数阈值 |
| `vector_db_storage_cls_kwargs` | `dict` | `{}` | 向量数据库存储的额外参数 |
| `enable_llm_cache` | `bool` | `True` | 是否启用 LLM 响应缓存 |
| `enable_llm_cache_for_entity_extract` | `bool` | `True` | 是否对实体提取步骤启用缓存 |
| `max_parallel_insert` | `int` | 环境变量 `MAX_PARALLEL_INSERT` 或 2 | 最大并行插入操作数 |
| `max_graph_nodes` | `int` | 环境变量 `MAX_GRAPH_NODES` 或 1000 | 知识图谱查询返回的最大节点数 |
| `max_source_ids_per_entity` | `int` | 环境变量 `MAX_SOURCE_IDS_PER_ENTITY` 或 32 | 实体关联的最大源文本块 ID 数 |
| `max_source_ids_per_relation` | `int` | 环境变量 `MAX_SOURCE_IDS_PER_RELATION` 或 128 | 关系关联的最大源文本块 ID 数 |
| `source_ids_limit_method` | `str` | `"FIFO"` | 源 ID 限制策略：`IGNORE_NEW` 或 `FIFO` |
| `max_file_paths` | `int` | 环境变量 `MAX_FILE_PATHS` 或 10 | 实体/关系 `file_path` 字段中存储的最大文件路径数 |
| `addon_params` | `dict \| None` | `None` | 运行时参数，用于提取提示词和分块配置 |
| `auto_manage_storages_states` | `bool` | `False` | 是否自动管理存储状态（已弃用） |
| `cosine_better_than_threshold` | `float` | 环境变量 `COSINE_THRESHOLD` 或 0.2 | 向量检索的余弦相似度阈值 |
| `ollama_server_infos` | `OllamaServerInfos \| None` | `None` | Ollama 服务器信息配置 |

### 2.2 核心方法

#### 文档插入

```python
async def ainsert(
    input: str | list[str],
    ids: str | list[str] | None = None,
    file_paths: str | list[str] | None = None,
    track_id: str | None = None,
) -> None:
    """异步插入文本到 RAG 系统。"""
```

```python
def insert(
    input: str | list[str],
    ids: str | list[str] | None = None,
    file_paths: str | list[str] | None = None,
    track_id: str | None = None,
) -> None:
    """同步插入文本到 RAG 系统。"""
```

```python
async def ainsert_custom_chunks(
    full_text: str,
    text_chunks: list[str],
    doc_id: str | list[str] | None = None,
    file_path: str | None = None,
) -> None:
    """插入自定义分块的文本。"""
```

#### 查询

```python
async def aquery(
    query: str,
    param: QueryParam = QueryParam(),
) -> str | AsyncIterator[str]:
    """异步执行 RAG 查询，返回响应文本或流式迭代器。"""
```

```python
def query(
    query: str,
    param: QueryParam = QueryParam(),
) -> str | Iterator[str]:
    """同步执行 RAG 查询。"""
```

```python
async def aquery_llm(
    query: str,
    param: QueryParam = QueryParam(),
) -> dict[str, Any]:
    """异步执行 RAG 查询，返回包含 LLM 响应和结构化数据的统一结果。"""
```

#### 删除

```python
async def adelete_by_entity(
    entity_name: str,
) -> DeletionResult:
    """按实体名称删除。"""
```

```python
async def adelete_by_doc_id(
    doc_id: str,
) -> DeletionResult:
    """按文档 ID 删除。"""
```

```python
async def adelete_by_file_path(
    file_path: str,
) -> DeletionResult:
    """按文件路径删除。"""
```

#### 存储管理

```python
async def initialize_storages() -> None:
    """初始化所有存储后端。"""
```

```python
async def finalize_storages() -> None:
    """终结所有存储后端。"""
```

```python
async def drop_storages() -> dict[str, str]:
    """删除所有存储中的数据。"""
```

---

## 3. 查询参数：QueryParam

`QueryParam` 是控制查询行为的核心数据类，位于 `lightrag/base.py`。

### 3.1 字段说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | `Literal` | `"mix"` | 检索模式：`local`（局部）、`global`（全局）、`hybrid`（混合）、`naive`（朴素）、`mix`（混合推荐）、`bypass`（绕过） |
| `only_need_context` | `bool` | `False` | 为 `True` 时仅返回检索到的上下文，不生成响应 |
| `only_need_prompt` | `bool` | `False` | 为 `True` 时仅返回生成的提示词，不生成响应 |
| `response_type` | `str` | `"Multiple Paragraphs"` | 响应格式，如 `"Multiple Paragraphs"`、`"Single Paragraph"`、`"Bullet Points"` |
| `stream` | `bool` | `False` | 是否启用流式输出 |
| `top_k` | `int` | 环境变量 `TOP_K` 或 60 | 检索的 top 项数。`local` 模式表示实体数，`global` 模式表示关系数 |
| `chunk_top_k` | `int` | 环境变量 `CHUNK_TOP_K` 或 20 | 向量搜索初始检索并在重排序后保留的文本块数 |
| `max_entity_tokens` | `int` | 环境变量 `MAX_ENTITY_TOKENS` 或 6000 | 实体上下文的最大 token 数 |
| `max_relation_tokens` | `int` | 环境变量 `MAX_RELATION_TOKENS` 或 8000 | 关系上下文的最大 token 数 |
| `max_total_tokens` | `int` | 环境变量 `MAX_TOTAL_TOKENS` 或 30000 | 整个查询上下文的总 token 预算 |
| `hl_keywords` | `list[str]` | `[]` | 高优先级关键词列表，用于优先检索 |
| `ll_keywords` | `list[str]` | `[]` | 低优先级关键词列表，用于细化检索焦点 |
| `conversation_history` | `list[dict]` | `[]` | 对话历史，格式：`[{"role": "user/assistant", "content": "message"}]` |
| `user_prompt` | `str \| None` | `None` | 用户提供的自定义提示词，注入到提示词模板中 |
| `enable_rerank` | `bool` | `True` | 是否对检索到的文本块启用重排序 |
| `include_references` | `bool` | `False` | 是否在响应中包含引用列表 |

### 3.2 检索模式详解

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `local` | 聚焦于特定实体及其直接关系 | 需要精确、局部化信息的查询 |
| `global` | 分析知识图谱中的全局模式和关系 | 需要宏观概述和跨领域关联的查询 |
| `hybrid` | 结合局部和全局检索策略 | 需要兼顾细节和全局视角的复杂查询 |
| `naive` | 简单的向量相似度搜索，不使用知识图谱 | 快速检索，对精度要求不高的场景 |
| `mix` | 集成知识图谱检索和向量检索（推荐） | 大多数场景下的最佳默认选择 |
| `bypass` | 直接 LLM 查询，不进行知识检索 | 测试或不需要 RAG 的场景 |

---

## 4. REST API 端点

LightRAG Server 基于 FastAPI 构建，默认运行在 `http://localhost:9621`。所有端点均支持 Swagger UI（`/docs`）和 ReDoc（`/redoc`）。

### 4.1 查询端点

#### POST `/query`

执行 RAG 查询（非流式）。

**请求体：**

```json
{
  "query": "什么是机器学习？",
  "mode": "mix",
  "response_type": "Multiple Paragraphs",
  "top_k": 60,
  "include_references": true,
  "include_chunk_content": false
}
```

**响应：**

```json
{
  "response": "机器学习是人工智能的一个子领域...",
  "references": [
    {
      "reference_id": "1",
      "file_path": "/documents/ml_overview.pdf"
    }
  ]
}
```

#### POST `/query/stream`

执行 RAG 查询（流式）。响应格式为 NDJSON（Newline-Delimited JSON）。

```
{"references": [{"reference_id": "1", "file_path": "/documents/ai.pdf"}]}
{"response": "机器学习是"}
{"response": "人工智能的一个子领域"}
{"response": "它使计算机能够从数据中学习。"}
```

#### POST `/query/data`

执行 RAG 查询并返回结构化数据（实体、关系、文本块）。

**响应：**

```json
{
  "status": "success",
  "message": "Query executed successfully",
  "data": {
    "entities": [...],
    "relationships": [...],
    "chunks": [...],
    "references": [...]
  },
  "metadata": {
    "mode": "mix",
    "hl_keywords": ["machine learning"],
    "ll_keywords": ["neural networks"]
  }
}
```

### 4.2 文档管理端点

#### POST `/documents/text`

插入单条文本。

```json
{
  "text": "要插入的文本内容",
  "file_source": "来源文件名（可选）",
  "chunking": {
    "strategy": "fixed_token",
    "params": {
      "chunk_token_size": 1200,
      "chunk_overlap_token_size": 100
    }
  }
}
```

#### POST `/documents/texts`

批量插入多条文本。

```json
{
  "texts": ["文本1", "文本2"],
  "file_sources": ["来源1", "来源2"],
  "chunking": {
    "strategy": "recursive_character",
    "params": {"chunk_token_size": 1000}
  }
}
```

#### POST `/documents/upload`

上传文件。支持多种文件格式（PDF、TXT、Markdown、DOCX 等）。

- 请求类型：`multipart/form-data`
- 参数：`file`（文件）、`file_source`（可选来源名）

#### POST `/documents/scan`

扫描输入目录中的新文件。

**响应：**

```json
{
  "status": "scanning_started",
  "message": "后台扫描已启动",
  "track_id": "scan_20250729_170612_abc123"
}
```

#### GET `/documents`

获取文档列表（支持分页和状态过滤）。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | `int` | `1` | 页码（从 1 开始） |
| `page_size` | `int` | `50` | 每页文档数（10-200） |
| `status_filter` | `str` | `None` | 按单个状态过滤 |
| `status_filters` | `list[str]` | `None` | 按多个状态过滤 |
| `sort_field` | `str` | `"updated_at"` | 排序字段 |
| `sort_direction` | `str` | `"desc"` | 排序方向 |

#### DELETE `/documents`

删除文档。

```json
{
  "doc_ids": ["doc_123", "doc_456"],
  "delete_file": false,
  "delete_llm_cache": false
}
```

#### POST `/documents/clear`

清除所有文档。

#### POST `/documents/reprocess`

重新处理失败的文档。

#### POST `/documents/cancel`

取消正在进行的管道处理。

#### GET `/documents/status`

获取文档处理状态。

#### GET `/documents/status/pipeline`

获取管道处理状态。

#### GET `/documents/track/{track_id}`

按跟踪 ID 获取文档处理进度。

### 4.3 知识图谱端点

#### GET `/graphs`

获取知识图谱数据。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `label` | `str` | 必填 | 起始节点标签，`*` 表示所有节点 |
| `max_depth` | `int` | `3` | 子图最大深度 |
| `max_nodes` | `int` | `1000` | 返回的最大节点数 |

#### GET `/graph/labels`

获取所有图谱标签。

#### GET `/graph/label/popular`

获取热门标签（按节点度数排序）。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | `int` | `300` | 返回的最大标签数 |

#### GET `/graph/label/search`

搜索标签。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `q` | `str` | 必填 | 搜索查询 |
| `limit` | `int` | `50` | 返回的最大结果数 |

#### POST `/graph/entity`

创建实体。

```json
{
  "name": "实体名称",
  "description": "实体描述",
  "labels": ["标签1", "标签2"]
}
```

#### PUT `/graph/entity`

更新实体。

#### DELETE `/graph/entity/{entity_name}`

删除实体。

#### POST `/graph/entity/merge`

合并实体。

```json
{
  "source_name": "源实体",
  "target_name": "目标实体"
}
```

#### POST `/graph/relation`

创建关系。

```json
{
  "source": "源实体",
  "target": "目标实体",
  "relation": "关系类型",
  "description": "关系描述"
}
```

#### PUT `/graph/relation`

更新关系。

#### DELETE `/graph/relation`

删除关系。

### 4.4 系统端点

#### GET `/health`

健康检查端点。始终返回 HTTP 200。认证用户可获取完整配置信息。

#### GET `/auth-status`

获取认证状态。

#### POST `/login`

登录获取 JWT Token。

#### GET `/version`

获取 API 版本。

#### GET `/tags`

获取可用标签。

#### GET `/models`

获取正在运行的模型列表。

#### POST `/cache/clear`

清除 LLM 响应缓存。

### 4.5 认证

LightRAG Server 支持两种认证方式：

1. **API Key**：通过请求头 `X-API-Key` 传递
2. **JWT Token**：通过请求头 `Authorization: Bearer <token>` 传递

默认情况下，服务器无需认证即可访问。可通过 `--key` 参数或环境变量启用认证。

---

## 5. 存储后端

LightRAG 支持多种存储后端，通过构造参数或环境变量配置。

### 5.1 键值存储（KV Storage）

| 后端类名 | 说明 | 适用场景 |
|----------|------|----------|
| `JsonKVStorage` | 基于 JSON 文件的键值存储 | 单机开发、小规模数据 |
| `RedisKVStorage` | 基于 Redis 的键值存储 | 分布式部署、高性能需求 |
| `MongoKVStorage` | 基于 MongoDB 的键值存储 | 需要持久化和查询能力 |

### 5.2 向量存储（Vector Storage）

| 后端类名 | 说明 | 适用场景 |
|----------|------|----------|
| `NanoVectorDBStorage` | 基于 NanoVectorDB 的向量存储 | 单机开发、轻量部署 |
| `MilvusVectorDBStorage` | 基于 Milvus 的向量存储 | 大规模生产部署 |
| `QdrantVectorDBStorage` | 基于 Qdrant 的向量存储 | 高性能向量检索 |
| `ChromaVectorDBStorage` | 基于 Chroma 的向量存储 | 开发原型、小规模应用 |
| `PGVectorStorage` | 基于 PostgreSQL pgvector 的存储 | 需要与关系数据库集成 |

### 5.3 图谱存储（Graph Storage）

| 后端类名 | 说明 | 适用场景 |
|----------|------|----------|
| `NetworkXStorage` | 基于 NetworkX 的内存图谱 | 单机开发、小规模数据 |
| `Neo4jStorage` | 基于 Neo4j 的图数据库 | 大规模生产部署 |
| `ArangoDBStorage` | 基于 ArangoDB 的多模型数据库 | 需要文档+图谱混合存储 |

### 5.4 文档状态存储（Doc Status Storage）

| 后端类名 | 说明 |
|----------|------|
| `JsonDocStatusStorage` | 基于 JSON 文件的文档状态存储 |
| `RedisDocStatusStorage` | 基于 Redis 的文档状态存储 |

---

## 6. 环境变量配置

### 6.1 核心配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `WORKSPACE` | `""` | 工作空间名称，用于数据隔离 |
| `TOP_K` | `60` | 查询检索的 top 项数 |
| `CHUNK_TOP_K` | `20` | 文本块检索的 top 项数 |
| `MAX_ENTITY_TOKENS` | `6000` | 实体上下文最大 token 数 |
| `MAX_RELATION_TOKENS` | `8000` | 关系上下文最大 token 数 |
| `MAX_TOTAL_TOKENS` | `30000` | 总上下文最大 token 数 |
| `COSINE_THRESHOLD` | `0.2` | 余弦相似度阈值 |
| `RELATED_CHUNK_NUMBER` | `3` | 相关文本块数量 |
| `KG_CHUNK_PICK_METHOD` | `"WEIGHT"` | 文本块选择方法 |

### 6.2 分块配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `CHUNK_SIZE` | `1200` | 文本块大小（token 数） |
| `CHUNK_OVERLAP_SIZE` | `100` | 文本块重叠大小 |
| `CHUNK_F_SIZE` | 无 | 固定 token 策略的块大小 |
| `CHUNK_R_SIZE` | 无 | 递归字符策略的块大小 |
| `CHUNK_P_SIZE` | `1200` | 段落语义策略的块大小 |
| `CHUNK_V_SIZE` | 无 | 语义向量策略的块大小 |
| `CHUNK_F_OVERLAP_SIZE` | 无 | 固定 token 策略的重叠大小 |
| `CHUNK_R_OVERLAP_SIZE` | 无 | 递归字符策略的重叠大小 |
| `CHUNK_P_OVERLAP_SIZE` | 无 | 段落语义策略的重叠大小 |

### 6.3 LLM 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `LLM_BINDING` | `"ollama"` | LLM 绑定类型 |
| `LLM_TIMEOUT` | `150` | LLM 请求超时（秒） |
| `MAX_ASYNC` | `4` | 最大并发 LLM 操作数 |
| `MAX_ASYNC_LLM` | `4` | 最大并发 LLM 调用数 |
| `SUMMARY_MAX_TOKENS` | `500` | 摘要最大 token 数 |
| `SUMMARY_CONTEXT_SIZE` | `4000` | 摘要上下文大小 |
| `SUMMARY_LENGTH_RECOMMENDED` | `500` | 推荐摘要长度 |
| `SUMMARY_LANGUAGE` | `""` | 摘要语言（如 `"Chinese"`） |
| `ENTITY_EXTRACTION_USE_JSON` | `"false"` | 是否使用 JSON 格式进行实体提取 |
| `ENABLE_LLM_CACHE` | `true` | 是否启用 LLM 缓存 |
| `ENABLE_CONTENT_HEADINGS` | `true` | 是否在查询中包含内容标题信息 |
| `FORCE_LLM_SUMMARY_ON_MERGE` | `0` | 合并时是否强制 LLM 摘要 |
| `MAX_GLEANING` | `1` | 最大实体提取清理次数 |
| `MAX_EXTRACTION_RECORDS` | `1000` | 最大提取记录数 |
| `MAX_EXTRACTION_ENTITIES` | `500` | 最大提取实体数 |

### 6.4 Embedding 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `EMBEDDING_BINDING` | `"ollama"` | Embedding 绑定类型 |
| `EMBEDDING_BATCH_NUM` | `10` | 嵌入计算批处理大小 |
| `EMBEDDING_FUNC_MAX_ASYNC` | `8` | 最大并发嵌入调用数 |
| `EMBEDDING_TIMEOUT` | `30` | Embedding 请求超时（秒） |

### 6.5 重排序配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `RERANK_BINDING` | `null` | 重排序绑定类型 |
| `RERANK_BY_DEFAULT` | `"true"` | 默认是否启用重排序 |
| `RERANK_TIMEOUT` | `30` | 重排序请求超时（秒） |
| `MAX_ASYNC_RERANK` | `4` | 最大并发重排序调用数 |
| `MIN_RERANK_SCORE` | `0.0` | 最低重排序分数阈值 |

### 6.6 存储配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `MAX_SOURCE_IDS_PER_ENTITY` | `32` | 实体关联的最大源文本块 ID 数 |
| `MAX_SOURCE_IDS_PER_RELATION` | `128` | 关系关联的最大源文本块 ID 数 |
| `SOURCE_IDS_LIMIT_METHOD` | `"FIFO"` | 源 ID 限制策略 |
| `MAX_FILE_PATHS` | `10` | 最大文件路径存储数 |
| `MAX_GRAPH_NODES` | `1000` | 图谱查询最大节点数 |

### 6.7 管道配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `MAX_PARALLEL_INSERT` | `2` | 最大并行插入数 |
| `MAX_PARALLEL_PARSE_NATIVE` | `2` | 最大并行原生解析数 |
| `MAX_PARALLEL_PARSE_MINERU` | `1` | 最大并行 MinerU 解析数 |
| `MAX_PARALLEL_PARSE_DOCLING` | `1` | 最大并行 Docling 解析数 |
| `MAX_PARALLEL_ANALYZE` | `1` | 最大并行分析数 |
| `QUEUE_SIZE_PARSE` | `1` | 解析队列大小 |
| `QUEUE_SIZE_ANALYZE` | `1` | 分析队列大小 |
| `QUEUE_SIZE_INSERT` | `1` | 插入队列大小 |

---

## 7. 服务器命令行选项

LightRAG Server 支持以下命令行参数（优先级高于 `.env` 文件）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--host` | `0.0.0.0` | 服务器监听地址 |
| `--port` | `9621` | 服务器监听端口 |
| `--working-dir` | `./rag_storage` | RAG 存储工作目录 |
| `--input-dir` | `./inputs` | 输入文档目录 |
| `--timeout` | `150` | Gunicorn worker 超时和请求超时 |
| `--max-async` | `4` | 最大并发 LLM 操作数 |
| `--log-level` | `INFO` | 日志级别（DEBUG/INFO/WARNING/ERROR/CRITICAL） |
| `--verbose` | `False` | 详细调试输出 |
| `--key` | `None` | API 认证密钥 |
| `--ssl` | `False` | 启用 HTTPS |
| `--ssl-certfile` | `None` | SSL 证书文件路径 |
| `--ssl-keyfile` | `None` | SSL 私钥文件路径 |
| `--workspace` | `""` | 工作空间名称 |
| `--api-prefix` | `""` | 反向代理路径前缀 |
| `--workers` | `1` | Gunicorn worker 数量 |
| `--llm-binding` | `ollama` | LLM 绑定类型 |
| `--embedding-binding` | `ollama` | Embedding 绑定类型 |
| `--rerank-binding` | `null` | 重排序绑定类型 |

### 支持的绑定类型

**LLM 绑定：** `lollms`、`ollama`、`openai`、`openai-ollama`、`azure_openai`、`bedrock`、`gemini`

**Embedding 绑定：** `lollms`、`ollama`、`openai`、`azure_openai`、`bedrock`、`jina`、`gemini`、`voyageai`

**重排序绑定：** `cohere`、`jina`、`aliyun`

---

## 8. LLM 与 Embedding 注入

### 8.1 OpenAI 兼容 API

```python
import os
import numpy as np
from lightrag import LightRAG
from lightrag.utils import EmbeddingFunc

async def llm_model_func(
    prompt, system_prompt=None, history_messages=None, **kwargs
) -> str:
    # 实现 LLM 调用逻辑
    return response_text

async def embedding_func(texts: list[str]) -> np.ndarray:
    # 实现 Embedding 调用逻辑
    return embeddings

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=llm_model_func,
    embedding_func=embedding_func,
)
await rag.initialize_storages()
```

### 8.2 角色特定 LLM 配置

LightRAG 支持为不同角色（如实体提取、查询生成等）配置不同的 LLM：

```python
from lightrag import LightRAG
from lightrag.llm_roles import ROLES, RoleLLMConfig

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=base_llm_func,
    role_llm_configs={
        ROLES.ENTITY_EXTRACTION.name: RoleLLMConfig(
            func=specialized_extraction_llm,
            max_async=2,
        ),
    },
)
```

### 8.3 重排序注入

```python
rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=llm_func,
    embedding_func=embedding_func,
    rerank_model_func=rerank_func,  # 重排序函数
)
```

---

## 9. 知识图谱操作

### 9.1 基础图谱存储接口

`BaseGraphStorage` 定义了所有图谱存储后端必须实现的抽象方法：

| 方法 | 说明 |
|------|------|
| `has_node(node_id)` | 检查节点是否存在 |
| `has_edge(src, tgt)` | 检查边是否存在 |
| `node_degree(node_id)` | 获取节点度数 |
| `edge_degree(src, tgt)` | 获取边度数 |
| `get_node(node_id)` | 获取节点属性 |
| `get_edge(src, tgt)` | 获取边属性 |
| `get_node_edges(node_id)` | 获取节点的所有边 |
| `upsert_node(node_id, data)` | 插入或更新节点 |
| `upsert_edge(src, tgt, data)` | 插入或更新边 |
| `delete_node(node_id)` | 删除节点 |
| `remove_nodes(nodes)` | 批量删除节点 |
| `remove_edges(edges)` | 批量删除边 |
| `get_all_labels()` | 获取所有标签 |
| `get_knowledge_graph(label, depth, max_nodes)` | 获取知识图谱子图 |
| `get_all_nodes()` | 获取所有节点 |
| `get_all_edges()` | 获取所有边 |
| `get_popular_labels(limit)` | 获取热门标签 |
| `search_labels(query, limit)` | 搜索标签 |

### 9.2 批量操作

图谱存储支持批量操作以提高性能：

| 方法 | 说明 |
|------|------|
| `get_nodes_batch(node_ids)` | 批量获取节点 |
| `node_degrees_batch(node_ids)` | 批量获取节点度数 |
| `edge_degrees_batch(edge_pairs)` | 批量获取边度数 |
| `get_edges_batch(pairs)` | 批量获取边 |
| `get_nodes_edges_batch(node_ids)` | 批量获取节点的边 |
| `upsert_nodes_batch(nodes)` | 批量插入/更新节点 |
| `has_nodes_batch(node_ids)` | 批量检查节点存在性 |
| `upsert_edges_batch(edges)` | 批量插入/更新边 |

---

## 10. 文档处理状态机

### 10.1 状态定义

文档处理遵循以下状态转换流程：

```
PENDING → PARSING → ANALYZING（可选）→ PROCESSING → PROCESSED
                                                      ↓
                                                   FAILED
```

| 状态 | 说明 |
|------|------|
| `PENDING` | 等待处理 |
| `PARSING` | 阶段 1：内容提取（parse_native/mineru/docling） |
| `ANALYZING` | 阶段 2：多模态分析（VLM） |
| `PROCESSING` | 阶段 3：实体/关系提取 |
| `PREPROCESSED` | 已弃用，在新管道中对应 ANALYZING |
| `PROCESSED` | 处理完成 |
| `FAILED` | 处理失败 |

### 10.2 文档处理状态数据结构

```python
@dataclass
class DocProcessingStatus:
    content_summary: str       # 文档内容前 100 字符预览
    content_length: int        # 文档总长度
    file_path: str             # 规范化的文件路径
    status: DocStatus          # 当前处理状态
    created_at: str            # 创建时间（ISO 格式）
    updated_at: str            # 最后更新时间（ISO 格式）
    track_id: str | None       # 跟踪 ID
    chunks_count: int | None   # 分块数量
    chunks_list: list[str]     # 关联的文本块 ID 列表
    error_msg: str | None      # 错误信息
    metadata: dict             # 额外元数据
    content_hash: str | None   # 文档内容的 MD5 哈希
```

---

## 11. 错误码与异常

### 11.1 HTTP 状态码

| 状态码 | 说明 | 常见原因 |
|--------|------|----------|
| `200` | 成功 | 请求处理完成 |
| `400` | 请求错误 | 查询文本少于 3 个字符、无效参数 |
| `401` | 未认证 | API Key 缺失或无效 |
| `404` | 未找到 | 文档或实体不存在 |
| `409` | 冲突 | 文档已存在（同名文件冲突） |
| `422` | 参数验证失败 | JSON 格式错误、参数超出范围 |
| `500` | 服务器内部错误 | LLM 服务不可用、存储后端异常 |

### 11.2 常见异常

| 异常类 | 说明 |
|--------|------|
| `IndexFlushError` | 索引刷新失败 |
| `FilenameParserHintError` | 文件名解析器提示错误 |
| `ValueError` | 参数验证失败（如 embedding_func 为 None） |
| `RuntimeError` | 运行时错误（如同步方法在异步循环中调用） |

### 11.3 删除操作结果

```python
@dataclass
class DeletionResult:
    status: Literal["success", "not_found", "not_allowed", "fail"]
    doc_id: str
    message: str
    status_code: int = 200
    file_path: str | None = None
```

---

## 12. 快速参考表

### 12.1 查询模式速查

| 模式 | 知识图谱 | 向量检索 | 速度 | 推荐场景 |
|------|----------|----------|------|----------|
| `local` | ✅ 局部 | ✅ | 快 | 精确实体查询 |
| `global` | ✅ 全局 | ✅ | 中 | 宏观知识分析 |
| `hybrid` | ✅ 局部+全局 | ✅ | 中 | 综合查询 |
| `naive` | ❌ | ✅ | 最快 | 简单相似度搜索 |
| `mix` | ✅ 集成 | ✅ | 中 | **默认推荐** |
| `bypass` | ❌ | ❌ | 最快 | 纯 LLM 查询 |

### 12.2 分块策略速查

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `fixed_token` | 基于固定 token 数分块 | 通用场景，默认策略 |
| `recursive_character` | 基于递归字符分隔分块 | 结构化文本（代码、Markdown） |
| `semantic_vector` | 基于语义向量断点分块 | 需要语义完整性的场景 |
| `paragraph_semantic` | 基于段落语义合并分块 | 长文档、需要保持段落完整 |

### 12.3 存储后端速查

| 存储类型 | 轻量开发 | 生产部署 | 分布式 |
|----------|----------|----------|--------|
| KV 存储 | `JsonKVStorage` | `RedisKVStorage` | `MongoKVStorage` |
| 向量存储 | `NanoVectorDBStorage` | `MilvusVectorDBStorage` | `QdrantVectorDBStorage` |
| 图谱存储 | `NetworkXStorage` | `Neo4jStorage` | `ArangoDBStorage` |
| 文档状态 | `JsonDocStatusStorage` | `RedisDocStatusStorage` | `RedisDocStatusStorage` |

### 12.4 环境变量速查

```bash
# 基础配置
WORKSPACE=""                    # 工作空间
TOP_K=60                        # 查询 top-k
CHUNK_TOP_K=20                  # 文本块 top-k

# LLM 配置
LLM_BINDING=openai              # LLM 后端
LLM_TIMEOUT=150                 # LLM 超时（秒）
MAX_ASYNC=4                     # 最大并发

# Embedding 配置
EMBEDDING_BINDING=openai        # Embedding 后端
EMBEDDING_BATCH_NUM=10          # 批处理大小

# 分块配置
CHUNK_SIZE=1200                 # 块大小（token）
CHUNK_OVERLAP_SIZE=100          # 块重叠（token）

# 重排序配置
RERANK_BINDING=cohere           # 重排序后端
RERANK_BY_DEFAULT=true          # 默认启用重排序

# 存储配置
MAX_SOURCE_IDS_PER_ENTITY=32    # 实体最大源 ID
MAX_SOURCE_IDS_PER_RELATION=128 # 关系最大源 ID
MAX_GRAPH_NODES=1000            # 图谱最大节点数
```

### 12.5 快速启动命令

```bash
# 安装 LightRAG Server
uv tool install "lightrag-hku[api]"

# 或使用 pip
pip install "lightrag-hku[api]"

# 启动服务器（默认配置）
lightrag-server

# 启动服务器（自定义配置）
lightrag-server --host 0.0.0.0 --port 9621 \
    --working-dir ./rag_storage \
    --input-dir ./inputs \
    --llm-binding openai \
    --embedding-binding openai \
    --key your-api-key

# 使用 Docker 启动
docker run -p 9621:9621 \
    -v ./rag_storage:/app/rag_storage \
    -v ./inputs:/app/inputs \
    lightrag-server
```

### 12.6 curl 示例

```bash
# 健康检查
curl http://localhost:9621/health

# 插入文本
curl -X POST http://localhost:9621/documents/text \
    -H "Content-Type: application/json" \
    -d '{"text": "机器学习是人工智能的重要分支。"}'

# 执行查询
curl -X POST http://localhost:9621/query \
    -H "Content-Type: application/json" \
    -d '{"query": "什么是机器学习？", "mode": "mix"}'

# 流式查询
curl -X POST http://localhost:9621/query/stream \
    -H "Content-Type: application/json" \
    -d '{"query": "解释神经网络", "stream": true}'

# 上传文件
curl -X POST http://localhost:9621/documents/upload \
    -F "file=@document.pdf"

# 获取文档列表
curl "http://localhost:9621/documents?page=1&page_size=20"

# 带认证的请求
curl -X POST http://localhost:9621/query \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your-api-key" \
    -d '{"query": "什么是 RAG？", "mode": "mix"}'
```

---

> **注意**：本文档基于 LightRAG 主分支的最新代码编写。API 可能随版本更新而变化，请以官方 GitHub 仓库（https://github.com/HKUDS/LightRAG）中的源代码和文档为准。
