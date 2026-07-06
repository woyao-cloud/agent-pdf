# 第8章 GraphRAG 部署与配置

## 8.1 引言

GraphRAG 的生产部署涉及多个组件的协同工作：Python 运行时环境、大语言模型（LLM）服务、文本嵌入模型、图存储后端以及可选的向量数据库。与传统的 RAG 系统相比，GraphRAG 的部署链路更长、依赖更多、配置项也更复杂。一个典型的 GraphRAG 生产部署包含索引构建管道（Indexing Pipeline）和查询服务（Query Service）两个子系统，前者负责将原始文档转化为知识图谱和社区摘要，后者负责接收用户查询并返回基于图结构的增强回答。

本章从零开始，完整覆盖 GraphRAG 从环境搭建到生产部署的全流程。读者将学习如何配置 Python 环境、选择并接入 LLM 和嵌入模型、编写 settings.yaml 配置文件、执行索引构建和查询命令、使用 Docker 容器化部署，以及构建可对外提供服务的 API 网关。本章所有配置示例均基于 Microsoft GraphRAG 0.3.x 及以上版本。

---

## 8.2 环境准备

### 8.2.1 Python 环境搭建

GraphRAG 官方基于 Python 3.10-3.12 开发，推荐使用 Python 3.11 以获得最佳兼容性。建议使用 conda 或 venv 创建独立的虚拟环境，避免依赖冲突。

**使用 conda 创建环境：**

```bash
conda create -n graphrag python=3.11
conda activate graphrag
```

**使用 venv 创建环境：**

```bash
python -m venv graphrag-env
# Windows
graphrag-env\Scripts\activate
# Linux/macOS
source graphrag-env/bin/activate
```

**安装 GraphRAG 核心包：**

```bash
pip install graphrag
```

该命令会安装 graphrag 核心库及其依赖，包括：
- `networkx`：图数据结构与算法
- `numpy`、`pandas`：数据处理
- `tiktoken`：Token 计数
- `openai`：OpenAI API 客户端（默认 LLM 后端）
- `datashaper`：数据处理管道框架
- `azure-search-documents`：Azure AI Search 客户端（可选）

**验证安装：**

```bash
python -m graphrag --version
```

如果输出类似 `graphrag, version 0.3.0` 的信息，说明安装成功。

### 8.2.2 大语言模型（LLM）准备

GraphRAG 的索引构建和查询生成都依赖 LLM。官方默认支持 OpenAI 兼容的 API，包括：

| LLM 提供商 | API 类型 | 推荐模型 | 适用阶段 |
|-----------|---------|---------|---------|
| OpenAI | OpenAI API | gpt-4o / gpt-4o-mini | 索引 + 查询 |
| Azure OpenAI | Azure OpenAI API | gpt-4o / gpt-4o-mini | 索引 + 查询 |
| DeepSeek | OpenAI 兼容 API | deepseek-chat | 索引 + 查询 |
| Ollama（本地） | OpenAI 兼容 API | llama3 / qwen2 | 查询（索引不推荐） |
| Anthropic | Anthropic API | claude-sonnet-4-20250514 | 查询（索引需适配） |

**关键选择原则：**

- **索引阶段**对 LLM 的指令遵循能力和结构化输出要求极高，推荐使用 gpt-4o 或同等能力的模型。使用弱模型（如 gpt-4o-mini）可能导致实体抽取质量下降，进而影响整个图的质量。
- **查询阶段**对 LLM 的要求相对较低，可以使用 gpt-4o-mini 等低成本模型以控制运营成本。
- **本地模型（Ollama）** 在索引阶段不推荐使用，因为本地小模型的实体抽取质量通常无法满足 GraphRAG 的要求，且索引构建需要大量顺序 LLM 调用，本地推理的延迟会显著拉长构建时间。

**获取 API Key：**

```bash
# OpenAI
export OPENAI_API_KEY="sk-your-api-key"

# Azure OpenAI
export AZURE_OPENAI_API_KEY="your-azure-api-key"
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
```

### 8.2.3 文本嵌入模型准备

GraphRAG 使用嵌入模型将文本转换为向量，用于语义检索。支持的嵌入模型包括：

| 提供商 | 模型 | 向量维度 | 推荐场景 |
|-------|------|---------|---------|
| OpenAI | text-embedding-3-small | 1536 | 默认推荐，性价比高 |
| OpenAI | text-embedding-3-large | 3072 | 高精度场景 |
| Azure OpenAI | text-embedding-3-small/large | 1536/3072 | Azure 用户 |
| DeepSeek | deepseek-embedding | 1024 | DeepSeek 生态 |
| 本地 | sentence-transformers | 384-1024 | 离线/本地部署 |

**嵌入模型选择建议：**

- 生产环境优先使用 `text-embedding-3-small`，它在 1536 维上提供了优秀的性价比。
- 如果使用本地部署，推荐 `BAAI/bge-large-zh-v1.5`（1024 维）或 `intfloat/multilingual-e5-large`（1024 维），对中文支持较好。
- 嵌入模型的维度需要与 settings.yaml 中的 `dimensions` 配置一致。

### 8.2.4 存储后端准备

GraphRAG 的索引构建结果存储在本地文件系统中，默认输出目录为 `output/`。对于生产环境，建议将输出目录挂载到持久化存储（如 NAS、EBS 卷）上。

索引输出包含以下文件结构：

```
output/
├── artifacts/
│   ├── create_final_documents.parquet
│   ├── create_final_entities.parquet
│   ├── create_final_relationships.parquet
│   ├── create_final_communities.parquet
│   ├── create_final_community_reports.parquet
│   ├── create_final_text_units.parquet
│   └── create_final_nodes.parquet
├── cache/
│   ├── embeddings/
│   └── llm/
└── stats/
    └── stats.json
```

这些 Parquet 文件是 GraphRAG 查询服务的核心数据源，必须妥善保管。如果使用 Docker 部署，需要将这些文件通过卷挂载（volume mount）共享给查询容器。

---

## 8.3 配置文件详解（settings.yaml）

### 8.3.1 初始化配置文件

GraphRAG 使用 `settings.yaml` 作为统一的配置文件。在项目根目录下执行以下命令初始化配置：

```bash
# 初始化项目（会在当前目录创建 settings.yaml 和 prompts/ 目录）
python -m graphrag init --root ./my_graphrag_project
```

执行后生成的文件结构：

```
my_graphrag_project/
├── settings.yaml          # 主配置文件
├── prompts/               # 提示词模板目录
│   ├── claim_extraction.txt
│   ├── community_report.txt
│   ├── entity_extraction.txt
│   ├── entity_summarization.txt
│   └── ...
└── input/                 # 输入文档目录（需手动创建）
    └── *.txt              # 待处理的文档
```

### 8.3.2 完整配置示例

以下是一个面向生产环境的完整 `settings.yaml` 配置，使用 OpenAI 作为 LLM 和嵌入模型后端：

```yaml
### 基础配置
encoding_model: cl100k_base
skip_workflows: []
mode: default

### LLM 配置（索引阶段）
llm:
  model: gpt-4o
  model_supports_json: true
  api_key: ${OPENAI_API_KEY}
  api_base: https://api.openai.com/v1
  type: openai_chat
  max_tokens: 4000
  request_timeout: 180.0
  api_version: 2024-02-15-preview
  organization: null
  deployment_name: null
  tokens_per_minute: 0
  requests_per_minute: 0
  max_retries: 10
  max_retry_wait: 60.0
  sleep_on_rate_limit_recommendation: true
  concurrent_requests: 25

### LLM 配置（查询阶段，可独立配置）
parallelization:
  llm:
    model: gpt-4o-mini
    api_key: ${OPENAI_API_KEY}
    api_base: https://api.openai.com/v1
    type: openai_chat
    max_tokens: 2000
    request_timeout: 60.0
    concurrent_requests: 10

### 嵌入模型配置
embeddings:
  llm:
    model: text-embedding-3-small
    api_key: ${OPENAI_API_KEY}
    api_base: https://api.openai.com/v1
    type: openai_embedding
    dimensions: 1536
    request_timeout: 30.0
    concurrent_requests: 25

### 分块配置
chunks:
  size: 1200
  overlap: 200
  group_by_columns:
    - id

### 图存储配置
storage:
  type: file
  base_dir: output

### 缓存配置
cache:
  type: file
  base_dir: cache
  embeddings:
    type: file
    base_dir: cache/embeddings

### 报告配置
reporting:
  type: file
  base_dir: logs

### 节点解析配置
entity_resolution:
  enabled: false
  strategy: graph_intelligence

### 社区检测配置
community:
  hierarchy_level: 2
  max_cluster_size: 10
  seed: 0
  use_community_summary: true

### 摘要配置
summarize:
  descriptions:
    model: gpt-4o-mini
    max_tokens: 500
    temperature: 0

### 本地搜索配置
local_search:
  llm:
    model: gpt-4o-mini
    api_key: ${OPENAI_API_KEY}
    api_base: https://api.openai.com/v1
    type: openai_chat
    max_tokens: 2000
    temperature: 0
  text_unit_prop:
    count: 250
    n_levels: 1
  community_prop:
    count: 4
    n_levels: 2
  conversation_history:
    max_turns: 5
    window_size: 5

### 全局搜索配置
global_search:
  llm:
    model: gpt-4o-mini
    api_key: ${OPENAI_API_KEY}
    api_base: https://api.openai.com/v1
    type: openai_chat
    max_tokens: 2000
    temperature: 0
  map_temperature: 0
  reduce_temperature: 0
  max_tokens: 2000
  data_max_tokens: 8000
  map_max_tokens: 2000
  reduce_max_tokens: 2000
  concurrency: 32
  dynamic_search:
    enabled: false
    llm:
      model: gpt-4o-mini
      api_key: ${OPENAI_API_KEY}
      api_base: https://api.openai.com/v1
      type: openai_chat
      max_tokens: 2000
      temperature: 0
```

### 8.3.3 配置项详解

**LLM 配置（索引阶段）：**

| 配置项 | 说明 | 推荐值 |
|-------|------|-------|
| `model` | LLM 模型名称 | gpt-4o（索引）/ gpt-4o-mini（查询） |
| `api_key` | API 密钥，支持 `${ENV_VAR}` 引用环境变量 | - |
| `api_base` | API 端点 URL | https://api.openai.com/v1 |
| `type` | API 类型 | openai_chat / azure_openai_chat |
| `max_tokens` | 每次 LLM 调用的最大输出 Token | 2000-4000 |
| `request_timeout` | 请求超时时间（秒） | 60-180 |
| `concurrent_requests` | 并发请求数 | 10-50（取决于 API 配额） |
| `tokens_per_minute` | 每分钟 Token 限制（0 表示不限制） | 0 或 API 配额值 |
| `requests_per_minute` | 每分钟请求限制（0 表示不限制） | 0 或 API 配额值 |
| `max_retries` | 最大重试次数 | 10 |
| `sleep_on_rate_limit_recommendation` | 遇到限速时是否自动等待 | true |

**嵌入模型配置：**

| 配置项 | 说明 | 推荐值 |
|-------|------|-------|
| `model` | 嵌入模型名称 | text-embedding-3-small |
| `dimensions` | 向量维度（必须与模型匹配） | 1536 |
| `concurrent_requests` | 嵌入请求并发数 | 25-50 |

**分块配置：**

| 配置项 | 说明 | 推荐值 |
|-------|------|-------|
| `size` | 每个文本块的目标 Token 数 | 1200 |
| `overlap` | 相邻块之间的重叠 Token 数 | 200 |
| `group_by_columns` | 分块的分组依据列 | [id] |

分块大小直接影响实体抽取的质量。过大的块（>2000 tokens）可能导致 LLM 遗漏细节实体；过小的块（<300 tokens）则可能导致上下文不足，实体抽取不完整。

**社区检测配置：**

| 配置项 | 说明 | 推荐值 |
|-------|------|-------|
| `hierarchy_level` | 社区层次级别数 | 2-3 |
| `max_cluster_size` | 每个社区的最大实体数 | 10 |
| `use_community_summary` | 是否生成社区摘要 | true |

`hierarchy_level` 控制社区检测的深度。级别越多，社区摘要的粒度越细，但 Token 消耗也越大。对于大多数场景，2 级是一个良好的平衡点。

### 8.3.4 使用 Azure OpenAI 的配置

如果使用 Azure OpenAI 服务，LLM 配置需要调整为：

```yaml
llm:
  model: gpt-4o
  api_key: ${AZURE_OPENAI_API_KEY}
  api_base: https://your-resource.openai.azure.com
  type: azure_openai_chat
  deployment_name: your-deployment-name
  api_version: 2024-02-15-preview

embeddings:
  llm:
    model: text-embedding-3-small
    api_key: ${AZURE_OPENAI_API_KEY}
    api_base: https://your-resource.openai.azure.com
    type: azure_openai_embedding
    deployment_name: your-embedding-deployment
    dimensions: 1536
```

注意 Azure OpenAI 需要额外指定 `deployment_name`（部署名称），该名称是在 Azure OpenAI Studio 中创建部署时指定的。

### 8.3.5 使用 DeepSeek 的配置

将 LLM 替换为 DeepSeek 的配置示例：

```yaml
llm:
  model: deepseek-chat
  api_key: ${DEEPSEEK_API_KEY}
  api_base: https://api.deepseek.com/v1
  type: openai_chat
  max_tokens: 4000
  model_supports_json: true

embeddings:
  llm:
    model: deepseek-embedding
    api_key: ${DEEPSEEK_API_KEY}
    api_base: https://api.deepseek.com/v1
    type: openai_embedding
    dimensions: 1024
```

DeepSeek 使用 OpenAI 兼容的 API 协议，因此 `type` 仍为 `openai_chat`。注意 DeepSeek 嵌入模型的维度为 1024，与 OpenAI 的 1536 不同，需要在 `dimensions` 中正确配置。

### 8.3.6 使用 Ollama 本地模型的配置

```yaml
llm:
  model: llama3.1:70b
  api_key: ollama
  api_base: http://localhost:11434/v1
  type: openai_chat
  max_tokens: 2000
  model_supports_json: false
  concurrent_requests: 1

embeddings:
  llm:
    model: nomic-embed-text
    api_key: ollama
    api_base: http://localhost:11434/v1
    type: openai_embedding
    dimensions: 768
    concurrent_requests: 1
```

**重要限制：** Ollama 本地模型在索引阶段仅适用于小规模实验（<100 份文档）。由于本地推理速度远低于云端 API，且小模型的实体抽取质量不稳定，生产环境不推荐此方案。

---

## 8.4 索引构建命令

### 8.4.1 准备输入文档

在项目根目录下创建 `input/` 目录，将待处理的文档放入其中。GraphRAG 支持以下输入格式：

- `.txt`：纯文本文件
- `.csv`：CSV 文件（需包含 `id` 和 `text` 列）
- `.json`：JSON 文件（需包含 `id` 和 `text` 字段）

**目录结构示例：**

```
my_graphrag_project/
├── input/
│   ├── doc1.txt
│   ├── doc2.txt
│   └── ...
├── settings.yaml
└── prompts/
```

### 8.4.2 执行索引构建

```bash
# 基本索引命令
python -m graphrag index --root ./my_graphrag_project

# 指定自定义输出目录
python -m graphrag index --root ./my_graphrag_project --output ./custom_output

# 指定自定义配置路径
python -m graphrag index --root ./my_graphrag_project --config ./custom_settings.yaml

# 仅执行特定工作流（跳过其他步骤）
python -m graphrag index --root ./my_graphrag_project --workflow create_final_entities

# 从缓存恢复（跳过已完成的步骤）
python -m graphrag index --root ./my_graphrag_project --resume
```

### 8.4.3 索引构建流程详解

执行索引命令后，GraphRAG 会依次执行以下工作流（workflow）：

| 工作流 | 说明 | 输入 | 输出 |
|-------|------|------|------|
| `create_base_text_units` | 文档分块 | 原始文档 | 文本块 |
| `create_base_extracted_entities` | 实体抽取 | 文本块 | 原始实体 |
| `create_final_documents` | 文档元数据 | 原始文档 | 文档索引 |
| `create_final_text_units` | 文本块元数据 | 文本块 | 文本块索引 |
| `create_base_entity_graph` | 实体关系图构建 | 实体 | 图结构 |
| `create_final_entities` | 实体合并与去重 | 原始实体 | 最终实体 |
| `create_final_relationships` | 关系合并 | 原始关系 | 最终关系 |
| `create_final_communities` | 社区检测 | 图结构 | 社区划分 |
| `create_final_community_reports` | 社区摘要生成 | 社区 | 社区报告 |
| `create_final_nodes` | 节点数据 | 实体+社区 | 节点索引 |
| `create_final_embeddings` | 向量嵌入 | 文本块+实体 | 向量索引 |

### 8.4.4 索引构建监控

索引构建过程中，GraphRAG 会输出详细的进度日志：

```
🚀 Starting indexing pipeline...
✅ create_base_text_units completed (1200 chunks) in 2.3s
✅ create_base_extracted_entities completed (850 entities) in 45.6s
✅ create_final_documents completed (50 documents) in 0.5s
✅ create_final_text_units completed (1200 units) in 0.3s
✅ create_base_entity_graph completed (850 nodes, 1200 edges) in 12.1s
✅ create_final_entities completed (620 entities) in 8.4s
✅ create_final_relationships completed (980 relationships) in 5.2s
✅ create_final_communities completed (45 communities) in 3.1s
✅ create_final_community_reports completed (45 reports) in 120.5s
✅ create_final_nodes completed (620 nodes) in 0.8s
✅ create_final_embeddings completed (620 embeddings) in 15.3s
🎉 Indexing pipeline completed in 214.1s
```

**关键监控指标：**

- **实体抽取速度**：通常为 5-20 秒/文档（取决于文档长度和 LLM 响应速度）
- **社区摘要生成速度**：通常为 2-5 秒/社区（取决于社区大小）
- **总构建时间**：100 份文档约需 10-30 分钟，1000 份文档约需 2-8 小时

### 8.4.5 索引构建常见问题

**问题 1：API 限速（Rate Limit）**

```
ERROR: Rate limit exceeded for OpenAI API. Retrying in 60s...
```

**解决方案：** 在 settings.yaml 中降低 `concurrent_requests` 值，或设置 `tokens_per_minute` 和 `requests_per_minute` 限制。

**问题 2：Token 超出上下文窗口**

```
ERROR: This model's maximum context length is 128000 tokens...
```

**解决方案：** 减小 `chunks.size` 配置值（如从 1200 降至 600），或使用支持更长上下文的模型。

**问题 3：内存不足**

```
ERROR: MemoryError: Unable to allocate...
```

**解决方案：** 减少 `concurrent_requests` 值，或增加系统内存/交换空间。对于大规模索引，建议使用至少 16GB 内存的机器。

---

## 8.5 查询命令

### 8.5.1 全局搜索（Global Search）

全局搜索适用于需要理解整体语料库主题、趋势和模式的查询。它基于社区摘要进行检索，能够回答"整个文档集的主要主题是什么？"这类全局性问题。

```bash
# 基本全局搜索
python -m graphrag query \
    --root ./my_graphrag_project \
    --method global \
    --query "整个文档集讨论了哪些主要主题？"

# 指定社区层次级别（级别越高，摘要越宏观）
python -m graphrag query \
    --root ./my_graphrag_project \
    --method global \
    --query "主要趋势是什么？" \
    --community_level 2

# 指定最大输出 Token
python -m graphrag query \
    --root ./my_graphrag_project \
    --method global \
    --query "总结核心发现" \
    --max_tokens 3000
```

**全局搜索的工作原理：**

1. 将用户查询与所有社区摘要进行语义匹配
2. 选择最相关的 N 个社区摘要（默认 4 个）
3. 将选中的社区摘要拼接为上下文
4. 调用 LLM 生成基于这些摘要的回答

**适用场景：**
- "这份报告集的主要结论是什么？"
- "整个知识库中提到了哪些关键技术？"
- "这些文档中反复出现的主题有哪些？"

### 8.5.2 局部搜索（Local Search）

局部搜索适用于需要精确事实的查询，它基于实体匹配和图邻居扩展进行检索。

```bash
# 基本局部搜索
python -m graphrag query \
    --root ./my_graphrag_project \
    --method local \
    --query "某公司的创始人是谁？"

# 指定检索的文本单元数量
python -m graphrag query \
    --root ./my_graphrag_project \
    --method local \
    --query "A和B之间有什么关系？" \
    --text_unit_count 500

# 指定社区报告数量
python -m graphrag query \
    --root ./my_graphrag_project \
    --method local \
    --query "描述C项目的技术架构" \
    --community_count 6
```

**局部搜索的工作原理：**

1. 对用户查询进行向量化
2. 在实体向量索引中检索最相关的实体（Top-K）
3. 沿图边扩展，获取邻居实体和相关关系
4. 收集与这些实体关联的文本块和社区报告
5. 将所有信息拼接为上下文
6. 调用 LLM 生成回答

**适用场景：**
- "X 公司的营收是多少？"
- "A 和 B 之间有什么合作关系？"
- "C 产品的发布时间是什么时候？"

### 8.5.3 搜索策略选择指南

| 查询类型 | 推荐方法 | 原因 |
|---------|---------|------|
| 事实性问答 | local | 需要精确实体匹配 |
| 关系查询 | local | 利用图结构进行邻居扩展 |
| 主题分析 | global | 需要社区摘要的宏观视角 |
| 趋势分析 | global | 跨社区的模式识别 |
| 比较分析 | local + global | 需要实体细节和全局背景 |
| 概述总结 | global | 社区摘要天然适合概括 |

### 8.5.4 编程方式调用查询

除了命令行，还可以通过 Python API 编程方式调用查询：

```python
from graphrag.query import GlobalSearch, LocalSearch
from graphrag.config import load_config

# 加载配置
config = load_config("./my_graphrag_project/settings.yaml")

# 全局搜索
global_search = GlobalSearch(config)
result = global_search.search("整个文档集的主要主题是什么？")
print(result.response)

# 局部搜索
local_search = LocalSearch(config)
result = local_search.search("某公司的创始人是谁？")
print(result.response)
```

---

## 8.6 Docker 部署

### 8.6.1 Docker 镜像构建

GraphRAG 官方提供了 Docker 镜像支持。以下是一个完整的 Dockerfile 示例：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 安装 GraphRAG
RUN pip install --no-cache-dir graphrag

# 创建项目目录
RUN mkdir -p /app/input /app/output /app/cache /app/logs

# 复制配置文件
COPY settings.yaml /app/settings.yaml
COPY prompts/ /app/prompts/

# 设置环境变量
ENV OPENAI_API_KEY=""
ENV GRAPHRAG_ROOT=/app

# 默认命令
CMD ["python", "-m", "graphrag", "index", "--root", "/app"]
```

### 8.6.2 Docker Compose 部署

对于生产环境，推荐使用 Docker Compose 编排多个服务。以下是一个包含索引构建和查询 API 的完整部署方案：

```yaml
version: "3.8"

services:
  # 索引构建服务（一次性任务）
  graphrag-index:
    build:
      context: .
      dockerfile: Dockerfile.index
    image: graphrag-index:latest
    container_name: graphrag-index
    volumes:
      - ./input:/app/input:ro
      - ./output:/app/output
      - ./cache:/app/cache
      - ./logs:/app/logs
      - ./settings.yaml:/app/settings.yaml:ro
      - ./prompts:/app/prompts:ro
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
    command: >
      sh -c "python -m graphrag index --root /app"
    networks:
      - graphrag-network
    restart: "no"

  # 查询 API 服务
  graphrag-api:
    build:
      context: .
      dockerfile: Dockerfile.api
    image: graphrag-api:latest
    container_name: graphrag-api
    ports:
      - "8000:8000"
    volumes:
      - ./output:/app/output:ro
      - ./settings.yaml:/app/settings.yaml:ro
      - ./prompts:/app/prompts:ro
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
    command: >
      sh -c "uvicorn api:app --host 0.0.0.0 --port 8000 --workers 4"
    depends_on:
      graphrag-index:
        condition: service_completed_successfully
    networks:
      - graphrag-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  graphrag-network:
    driver: bridge
```

### 8.6.3 索引构建 Dockerfile

```dockerfile
# Dockerfile.index
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir graphrag

RUN mkdir -p /app/input /app/output /app/cache /app/logs

COPY settings.yaml /app/settings.yaml
COPY prompts/ /app/prompts/

ENTRYPOINT ["python", "-m", "graphrag", "index", "--root", "/app"]
```

### 8.6.4 查询 API Dockerfile

```dockerfile
# Dockerfile.api
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir graphrag uvicorn fastapi

COPY api.py /app/api.py
COPY settings.yaml /app/settings.yaml
COPY prompts/ /app/prompts/

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### 8.6.5 构建和运行

```bash
# 构建镜像
docker-compose build

# 启动服务（先执行索引构建，再启动 API）
docker-compose up -d

# 查看索引构建日志
docker-compose logs -f graphrag-index

# 仅启动 API 服务（索引已存在时）
docker-compose up -d graphrag-api

# 停止服务
docker-compose down

# 清理所有数据（包括卷）
docker-compose down -v
```

---

## 8.7 API 服务部署

### 8.7.1 FastAPI 服务实现

以下是一个基于 FastAPI 的 GraphRAG 查询 API 实现：

```python
# api.py
import os
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from graphrag.config import load_config
from graphrag.query import GlobalSearch, LocalSearch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="GraphRAG Query API",
    description="基于知识图谱的增强检索生成查询服务",
    version="1.0.0",
)

# 全局变量：在启动时加载搜索器
global_searcher = None
local_searcher = None


class QueryRequest(BaseModel):
    query: str = Field(..., description="用户查询文本")
    method: str = Field(default="local", description="搜索方法：local 或 global")
    community_level: int = Field(default=2, ge=1, le=5, description="社区层次级别")
    max_tokens: int = Field(default=2000, ge=100, le=8000, description="最大输出 Token 数")


class QueryResponse(BaseModel):
    query: str
    response: str
    method: str
    community_level: int


class HealthResponse(BaseModel):
    status: str
    index_exists: bool


@app.on_event("startup")
async def startup_event():
    """应用启动时加载配置和索引"""
    global global_searcher, local_searcher

    root_dir = os.environ.get("GRAPHRAG_ROOT", "/app")
    config_path = os.path.join(root_dir, "settings.yaml")

    if not os.path.exists(config_path):
        logger.warning(f"配置文件不存在: {config_path}")
        return

    try:
        config = load_config(config_path)
        global_searcher = GlobalSearch(config)
        local_searcher = LocalSearch(config)
        logger.info("GraphRAG 搜索器加载成功")
    except Exception as e:
        logger.error(f"加载 GraphRAG 搜索器失败: {e}")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """健康检查接口"""
    root_dir = os.environ.get("GRAPHRAG_ROOT", "/app")
    output_dir = os.path.join(root_dir, "output", "artifacts")
    index_exists = os.path.exists(output_dir)

    return HealthResponse(
        status="ok" if global_searcher else "not_ready",
        index_exists=index_exists,
    )


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """执行 GraphRAG 查询"""
    if not global_searcher or not local_searcher:
        raise HTTPException(
            status_code=503,
            detail="GraphRAG 搜索器未就绪，请先执行索引构建",
        )

    try:
        if request.method == "global":
            result = global_searcher.search(
                query=request.query,
                community_level=request.community_level,
                max_tokens=request.max_tokens,
            )
        elif request.method == "local":
            result = local_searcher.search(
                query=request.query,
                community_level=request.community_level,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的搜索方法: {request.method}，仅支持 local 和 global",
            )

        return QueryResponse(
            query=request.query,
            response=result.response,
            method=request.method,
            community_level=request.community_level,
        )

    except Exception as e:
        logger.error(f"查询失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询执行失败: {str(e)}")


@app.post("/query/global", response_model=QueryResponse)
async def global_query(
    query: str,
    community_level: int = 2,
    max_tokens: int = 2000,
):
    """全局搜索快捷接口"""
    return await query(QueryRequest(
        query=query,
        method="global",
        community_level=community_level,
        max_tokens=max_tokens,
    ))


@app.post("/query/local", response_model=QueryResponse)
async def local_query(
    query: str,
    community_level: int = 2,
):
    """局部搜索快捷接口"""
    return await query(QueryRequest(
        query=query,
        method="local",
        community_level=community_level,
    ))
```

### 8.7.2 启动 API 服务

```bash
# 直接启动
uvicorn api:app --host 0.0.0.0 --port 8000 --workers 4

# 热重载模式（开发环境）
uvicorn api:app --host 0.0.0.0 --port 8000 --reload

# 设置根目录环境变量
export GRAPHRAG_ROOT=/path/to/graphrag_project
uvicorn api:app --host 0.0.0.0 --port 8000
```

### 8.7.3 API 使用示例

**健康检查：**

```bash
curl http://localhost:8000/health
```

响应示例：
```json
{
  "status": "ok",
  "index_exists": true
}
```

**执行查询：**

```bash
# 局部搜索
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "某公司的核心技术是什么？",
    "method": "local"
  }'

# 全局搜索
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "整个文档集的主要主题是什么？",
    "method": "global",
    "community_level": 2
  }'
```

**使用 Python 客户端调用：**

```python
import requests

api_base = "http://localhost:8000"

# 健康检查
resp = requests.get(f"{api_base}/health")
print(resp.json())

# 局部搜索
resp = requests.post(
    f"{api_base}/query",
    json={
        "query": "某公司的创始人是谁？",
        "method": "local",
    },
)
print(resp.json()["response"])

# 全局搜索
resp = requests.post(
    f"{api_base}/query",
    json={
        "query": "主要趋势是什么？",
        "method": "global",
        "community_level": 2,
    },
)
print(resp.json()["response"])
```

### 8.7.4 生产部署注意事项

**1. 使用 Gunicorn + Uvicorn 作为生产级 WSGI 服务器：**

```bash
pip install gunicorn
gunicorn api:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --workers 4 \
    --timeout 120 \
    --max-requests 1000 \
    --max-requests-jitter 50
```

**2. 配置反向代理（Nginx）：**

```nginx
server {
    listen 80;
    server_name graphrag.example.com;

    client_max_body_size 10m;
    proxy_read_timeout 120s;
    proxy_connect_timeout 10s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 监控端点不需要认证
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
```

**3. 配置 API 认证（简单 Token 认证）：**

```python
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()
API_TOKEN = os.environ.get("API_TOKEN", "your-secret-token")

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != API_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 API Token",
        )
    return credentials.credentials

@app.post("/query", response_model=QueryResponse)
async def query(
    request: QueryRequest,
    token: str = Depends(verify_token),
):
    # ... 查询逻辑
```

**4. 配置日志和监控：**

```python
import logging
from logging.handlers import RotatingFileHandler

# 文件日志（按大小轮转）
handler = RotatingFileHandler(
    "api.log",
    maxBytes=100 * 1024 * 1024,  # 100MB
    backupCount=10,
)
handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
))
logging.getLogger().addHandler(handler)
```

### 8.7.5 水平扩展策略

当查询负载增加时，可以通过以下方式水平扩展：

**方案一：多 Worker 进程**

```bash
# 单机多进程
gunicorn api:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 8 \
    --bind 0.0.0.0:8000
```

每个 Worker 进程独立加载索引，共享相同的输出目录（只读）。适用于单机多核场景。

**方案二：多实例负载均衡**

```yaml
# docker-compose.yml 扩展
version: "3.8"

services:
  graphrag-api:
    build:
      context: .
      dockerfile: Dockerfile.api
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "2"
          memory: "4G"
    volumes:
      - ./output:/app/output:ro
      - ./settings.yaml:/app/settings.yaml:ro
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    networks:
      - graphrag-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - graphrag-api
    networks:
      - graphrag-network
```

**方案三：索引预加载与缓存**

对于高吞吐场景，可以在 API 启动时预加载索引到内存，并添加结果缓存层：

```python
from functools import lru_cache
import hashlib
import json

class QueryCache:
    def __init__(self, max_size=1000):
        self.cache = {}
        self.max_size = max_size

    def _make_key(self, query: str, method: str) -> str:
        return hashlib.md5(f"{query}:{method}".encode()).hexdigest()

    def get(self, query: str, method: str):
        key = self._make_key(query, method)
        return self.cache.get(key)

    def set(self, query: str, method: str, response: str):
        key = self._make_key(query, method)
        if len(self.cache) >= self.max_size:
            # 简单淘汰策略：删除最早的一半
            keys = list(self.cache.keys())
            for k in keys[:len(keys)//2]:
                del self.cache[k]
        self.cache[key] = response

cache = QueryCache(max_size=5000)
```

---

## 8.8 部署架构总览

一个完整的 GraphRAP 生产部署架构如下：

```
┌─────────────────────────────────────────────────────────┐
│                     负载均衡器 (Nginx)                    │
└──────────┬──────────────────────────┬──────────────────┘
           │                          │
    ┌──────▼──────┐           ┌──────▼──────┐
    │  API 实例 1  │           │  API 实例 2  │  ... (水平扩展)
    │  (FastAPI)   │           │  (FastAPI)   │
    └──────┬──────┘           └──────┬──────┘
           │                          │
           └──────────┬───────────────┘
                      │
              ┌───────▼────────┐
              │   共享存储卷     │
              │  (NFS/EBS)     │
              │  ├─ output/    │
              │  ├─ cache/     │
              │  └─ logs/      │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  LLM API 服务   │
              │  (OpenAI/Azure) │
              └────────────────┘
```

**部署流程总结：**

1. **环境准备**：安装 Python 3.11，创建虚拟环境，安装 graphrag 包
2. **配置编写**：根据 LLM 和嵌入模型提供商编写 settings.yaml
3. **数据准备**：将文档放入 input/ 目录
4. **索引构建**：执行 `python -m graphrag index` 命令
5. **服务部署**：使用 Docker Compose 或直接启动 FastAPI 服务
6. **负载测试**：验证 API 响应时间和正确性
7. **监控告警**：配置日志、健康检查和性能监控

---

## 8.9 使用场景

### 8.9.1 企业内部知识库

**场景描述：** 某企业需要将数千份内部文档（技术规范、项目文档、会议纪要）构建为可查询的知识库。

**部署方案：**
- 使用 gpt-4o 进行索引构建（确保实体抽取质量）
- 使用 gpt-4o-mini 进行查询（控制成本）
- 使用 Docker Compose 部署，索引构建为一次性任务，API 服务持续运行
- 配置 Nginx 反向代理和 API Token 认证

**关键配置：**
```yaml
chunks:
  size: 800
  overlap: 100
community:
  hierarchy_level: 3
  max_cluster_size: 8
```

### 8.9.2 学术文献分析平台

**场景描述：** 研究团队需要分析数百篇学术论文，提取关键实体、关系和主题趋势。

**部署方案：**
- 使用 Azure OpenAI 服务（满足数据合规要求）
- 使用 text-embedding-3-large 提高检索精度
- 社区层次设为 3 级，以支持从细粒度到宏观的多层次分析
- 配置全局搜索作为主要查询方式

**关键配置：**
```yaml
embeddings:
  llm:
    model: text-embedding-3-large
    dimensions: 3072
community:
  hierarchy_level: 3
  max_cluster_size: 5
```

### 8.9.3 实时文档更新场景

**场景描述：** 知识库需要定期更新（如每周新增一批文档），但 GraphRAG 不支持增量索引。

**部署方案：**
- 使用 CI/CD 管道（如 GitHub Actions）定期触发全量重建
- 在重建期间，旧索引继续提供查询服务
- 重建完成后，通过蓝绿部署切换 API 服务的数据源

**CI/CD 管道示例（GitHub Actions）：**

```yaml
name: GraphRAG Index Rebuild

on:
  schedule:
    - cron: "0 2 * * 0"  # 每周日凌晨2点
  workflow_dispatch:      # 手动触发

jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install GraphRAG
        run: pip install graphrag

      - name: Run Indexing
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          python -m graphrag index --root ./project

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: graphrag-index
          path: ./project/output/
```

---

## 8.10 潜在风险与注意事项

### 8.10.1 成本风险

GraphRAG 的索引构建成本可能远超预期。以下是一些实际案例：

| 数据规模 | 文档数 | 总 Token 消耗 | 估算成本 (gpt-4o) | 估算成本 (gpt-4o-mini) |
|---------|-------|-------------|-----------------|---------------------|
| 小型 | 100 | 1.5M-7M | $7.5-$35 | $0.3-$1.4 |
| 中型 | 1,000 | 15M-70M | $75-$350 | $3-$14 |
| 大型 | 10,000 | 150M-700M | $750-$3,500 | $30-$140 |

**成本控制建议：**
- 先用 10-20 份文档做小规模测试，估算 Token 消耗
- 索引阶段使用 gpt-4o-mini 作为低成本替代（但需验证实体抽取质量）
- 设置 `tokens_per_minute` 和 `requests_per_minute` 限制，避免突发高消耗
- 启用缓存（`cache.type: file`），避免重复 LLM 调用

### 8.10.2 数据安全

- API Key 必须通过环境变量注入，切勿硬编码在配置文件中
- 如果使用 OpenAI API，文档内容会发送到 OpenAI 服务器。对数据敏感的场景应使用 Azure OpenAI 或本地部署方案
- 索引输出文件（Parquet）包含原始文档的实体和关系信息，需要妥善保管

### 8.10.3 性能瓶颈

| 瓶颈点 | 原因 | 解决方案 |
|-------|------|---------|
| LLM 调用延迟 | 索引阶段大量顺序 LLM 调用 | 提高 `concurrent_requests`，使用更快的模型 |
| 社区摘要生成 | 每个社区需要独立的 LLM 调用 | 减少 `max_cluster_size`，降低社区数量 |
| 内存占用 | 大规模图数据加载到内存 | 使用 32GB+ 内存的机器，或分片处理 |
| 磁盘 I/O | 大量 Parquet 文件读写 | 使用 SSD 存储，或挂载高性能文件系统 |

### 8.10.4 常见部署错误

**错误 1：配置文件格式错误**

```
ERROR: Failed to load settings.yaml: mapping values are not allowed here
```

**原因：** YAML 缩进错误。GraphRAG 对缩进非常敏感，必须使用空格（不能用 Tab），且嵌套层级必须对齐。

**错误 2：API Key 未设置**

```
ERROR: OpenAI API key is required but not provided
```

**原因：** 环境变量未设置或 settings.yaml 中的 `api_key` 配置错误。检查 `${OPENAI_API_KEY}` 是否能正确解析。

**错误 3：嵌入模型维度不匹配**

```
ERROR: Embedding dimension mismatch: expected 1536, got 1024
```

**原因：** settings.yaml 中的 `dimensions` 值与实际嵌入模型的输出维度不一致。检查模型文档确认正确维度。

**错误 4：索引目录不存在**

```
ERROR: Root directory does not contain input/ directory
```

**原因：** 执行索引命令前未创建 `input/` 目录。确保项目根目录下存在 `input/` 目录并包含文档。

---

## 8.11 本章小结

GraphRAG 的部署与配置涉及从环境搭建到生产服务的完整链路。本章的核心要点如下：

1. **环境准备**是基础。Python 3.11 + graphrag 包 + LLM API Key 是最小可行配置。嵌入模型推荐 text-embedding-3-small，LLM 推荐 gpt-4o（索引）+ gpt-4o-mini（查询）的组合。

2. **settings.yaml** 是 GraphRAG 的配置核心。LLM 配置、嵌入模型配置、分块参数、社区检测参数、搜索参数全部集中在此文件中。建议使用环境变量引用敏感信息（如 API Key）。

3. **索引构建**是 GraphRAG 部署中最耗时的环节。1000 份文档的索引构建可能需要数小时，Token 消耗在 15M-70M 之间。建议先用小规模数据测试，确认配置正确后再进行全量构建。

4. **查询服务**支持全局搜索和局部搜索两种模式。全局搜索适用于主题分析和趋势发现，局部搜索适用于精确事实问答。可以通过 FastAPI 构建 RESTful API 服务。

5. **Docker 部署**将索引构建和 API 服务容器化，便于在任意环境中一致地运行。Docker Compose 可以编排多服务架构，Nginx 反向代理提供负载均衡和 SSL 终止。

6. **生产部署**需要考虑成本控制、数据安全、性能监控和水平扩展。API 认证、日志轮转、健康检查和缓存策略是生产环境必不可少的组件。

在实际项目中，建议按照"小规模验证 → 全量构建 → API 部署 → 监控优化"的路径逐步推进，避免一次性投入过大导致成本失控。

---

## 参考资源

- Microsoft GraphRAG 官方文档：https://microsoft.github.io/graphrag/
- GraphRAG GitHub 仓库：https://github.com/microsoft/graphrag
- OpenAI API 文档：https://platform.openai.com/docs/
- FastAPI 官方文档：https://fastapi.tiangolo.com/
- Docker Compose 文档：https://docs.docker.com/compose/
