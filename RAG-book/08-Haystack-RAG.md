# 08 -- Haystack RAG

Haystack 是由 deepset 开发的开源 RAG 框架，采用管道（Pipeline）架构和组件化设计，特别适合生产环境中的 RAG 应用。与 LangChain 和 LlamaIndex 相比，Haystack 更强调可组合性、可观测性和生产就绪性。

## 概述

Haystack 的核心理念：**一切皆组件，组件组成管道**。

```
索引管道: 文件转换 → 清洗 → 分割 → 嵌入 → 存储
查询管道: 查询 → 检索 → 重排 → 提示构建 → 生成
```

### 安装

```bash
# 基础安装
pip install haystack-ai

# 向量数据库集成
pip install "chroma-haystack"       # Chroma
pip install "milvus-haystack"       # Milvus
pip install "qdrant-haystack"       # Qdrant
pip install "weaviate-haystack"     # Weaviate
pip install "pgvector-haystack"     # pgvector

# 嵌入模型
pip install "sentence-transformers>=2.2.0"
```

## 核心组件

### DocumentStore — 文档存储

Haystack 支持多种文档存储后端：

```python
# 内存存储（开发/测试）
from haystack.document_stores.in_memory import InMemoryDocumentStore
doc_store = InMemoryDocumentStore()

# Chroma
from chroma_haystack import ChromaDocumentStore
doc_store = ChromaDocumentStore(collection="my_docs")

# Milvus
from milvus_haystack import MilvusDocumentStore
doc_store = MilvusDocumentStore(
    connection_args={"host": "localhost", "port": "19530"},
    collection_name="my_docs",
)

# pgvector
from pgvector_haystack import PgvectorDocumentStore
doc_store = PgvectorDocumentStore(
    connection_string="postgresql://user:pass@localhost:5432/vectordb",
    table_name="documents",
)
```

### Retriever — 检索器

```python
# 嵌入检索器（向量搜索）
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
retriever = InMemoryEmbeddingRetriever(document_store=doc_store)

# BM25 检索器（关键词搜索）
from haystack.components.retrievers.in_memory import InMemoryBM25Retriever
bm25_retriever = InMemoryBM25Retriever(document_store=doc_store)

# 过滤检索器（元数据过滤）
from haystack.components.retrievers.in_memory import InMemoryFilterRetriever
filter_retriever = InMemoryFilterRetriever(document_store=doc_store)
```

### Embedder — 嵌入器

```python
# Sentence Transformers（本地）
from haystack.components.embedders import SentenceTransformersEmbedder
embedder = SentenceTransformersEmbedder(
    model="BAAI/bge-large-zh-v1.5",
    # model="intfloat/e5-large-v2",
)

# OpenAI
from haystack.components.embedders import OpenAITextEmbedder
embedder = OpenAITextEmbedder(
    model="text-embedding-3-small",
    api_key="your-key",
)

# Cohere
from haystack.components.embedders import CohereTextEmbedder
embedder = CohereTextEmbedder(
    model="embed-v4",
    api_key="your-key",
)
```

### Ranker — 重排序器

```python
# Sentence Transformers 重排序
from haystack.components.rankers import TransformersSimilarityRanker
ranker = TransformersSimilarityRanker(
    model="cross-encoder/ms-marco-MiniLM-L-2-v2",
    top_k=5,
)

# Cohere 重排序
from haystack.components.rankers import CohereRanker
ranker = CohereRanker(
    model="rerank-v3.5",
    top_k=5,
)

# Lost-in-the-Middle 重排序（缓解中间位置遗忘问题）
from haystack.components.rankers import LostInTheMiddleRanker
ranker = LostInTheMiddleRanker()
```

### Generator — 生成器

```python
# OpenAI
from haystack.components.generators import OpenAIGenerator
generator = OpenAIGenerator(model="gpt-4o", temperature=0)

# Hugging Face 本地模型
from haystack.components.generators import HuggingFaceLocalGenerator
generator = HuggingFaceLocalGenerator(
    model="Qwen/Qwen2.5-7B-Instruct",
    generation_kwargs={"max_new_tokens": 512},
)

# Cohere
from haystack.components.generators import CohereGenerator
generator = CohereGenerator(model="command-r-plus")
```

### PromptBuilder — 提示词构建器

```python
from haystack.components.builders import PromptBuilder

template = """
基于以下文档回答问题。如果文档中没有答案，请说"我不知道"。

文档：
{% for doc in documents %}
---
{{ doc.content }}
{% endfor %}

问题：{{ query }}

回答：
"""

prompt_builder = PromptBuilder(template=template)
```

## 管道架构

### 索引管道

```python
from haystack import Pipeline
from haystack.components.converters import PyPDFToDocument, TextFileToDocument
from haystack.components.preprocessors import DocumentCleaner, DocumentSplitter
from haystack.components.writers import DocumentWriter

# 构建索引管道
indexing_pipeline = Pipeline()

# 添加组件
indexing_pipeline.add_component("converter", PyPDFToDocument())
indexing_pipeline.add_component("cleaner", DocumentCleaner(
    remove_empty_lines=True,
    remove_whitespace=True,
    remove_repeated_substrings=True,
))
indexing_pipeline.add_component("splitter", DocumentSplitter(
    split_by="sentence",
    split_length=10,
    split_overlap=2,
))
indexing_pipeline.add_component("embedder", SentenceTransformersEmbedder(
    model="BAAI/bge-large-zh-v1.5",
))
indexing_pipeline.add_component("writer", DocumentWriter(document_store=doc_store))

# 连接组件
indexing_pipeline.connect("converter.documents", "cleaner.documents")
indexing_pipeline.connect("cleaner.documents", "splitter.documents")
indexing_pipeline.connect("splitter.documents", "embedder.documents")
indexing_pipeline.connect("embedder.documents", "writer.documents")

# 运行
indexing_pipeline.run({"converter": {"sources": ["report.pdf"]}})
```

### 查询管道（向量检索）

```python
query_pipeline = Pipeline()

query_pipeline.add_component("embedder", SentenceTransformersEmbedder(
    model="BAAI/bge-large-zh-v1.5",
))
query_pipeline.add_component("retriever", InMemoryEmbeddingRetriever(
    document_store=doc_store, top_k=10,
))
query_pipeline.add_component("ranker", TransformersSimilarityRanker(
    model="cross-encoder/ms-marco-MiniLM-L-2-v2", top_k=5,
))
query_pipeline.add_component("prompt_builder", PromptBuilder(template=template))
query_pipeline.add_component("generator", OpenAIGenerator(
    model="gpt-4o", temperature=0,
))

# 连接
query_pipeline.connect("embedder.embedding", "retriever.query_embedding")
query_pipeline.connect("retriever.documents", "ranker.documents")
query_pipeline.connect("ranker.documents", "prompt_builder.documents")
query_pipeline.connect("prompt_builder.prompt", "generator.prompt")

# 运行
result = query_pipeline.run({
    "embedder": {"text": "什么是 RAG？"},
    "prompt_builder": {"query": "什么是 RAG？"},
})
print(result["generator"]["replies"][0])
```

### 混合检索管道

BM25 + 向量检索，使用 `JoinDocuments` 合并结果：

```python
from haystack.components.joiners import DocumentJoiner

hybrid_pipeline = Pipeline()

# BM25 分支
hybrid_pipeline.add_component("bm25_retriever", InMemoryBM25Retriever(
    document_store=doc_store, top_k=10,
))

# 向量检索分支
hybrid_pipeline.add_component("embedder", SentenceTransformersEmbedder(
    model="BAAI/bge-large-zh-v1.5",
))
hybrid_pipeline.add_component("embedding_retriever", InMemoryEmbeddingRetriever(
    document_store=doc_store, top_k=10,
))

# 合并结果（Reciprocal Rank Fusion）
hybrid_pipeline.add_component("joiner", DocumentJoiner(
    join_mode="reciprocal_rank_fusion",
    weights=[0.4, 0.6],  # BM25: 40%, 向量: 60%
))

# 后续处理
hybrid_pipeline.add_component("ranker", TransformersSimilarityRanker(top_k=5))
hybrid_pipeline.add_component("prompt_builder", PromptBuilder(template=template))
hybrid_pipeline.add_component("generator", OpenAIGenerator(model="gpt-4o"))

# 连接
hybrid_pipeline.connect("bm25_retriever.documents", "joiner.documents")
hybrid_pipeline.connect("embedder.embedding", "embedding_retriever.query_embedding")
hybrid_pipeline.connect("embedding_retriever.documents", "joiner.documents")
hybrid_pipeline.connect("joiner.documents", "ranker.documents")
hybrid_pipeline.connect("ranker.documents", "prompt_builder.documents")
hybrid_pipeline.connect("prompt_builder.prompt", "generator.prompt")

# 运行
result = hybrid_pipeline.run({
    "bm25_retriever": {"query": "什么是 RAG？"},
    "embedder": {"text": "什么是 RAG？"},
    "prompt_builder": {"query": "什么是 RAG？"},
})
```

## 管道序列化

Haystack 支持将管道保存为 YAML，方便版本控制和部署：

```python
# 保存
hybrid_pipeline.save_to_yaml("hybrid_pipeline.yaml")

# 加载
from haystack import Pipeline
loaded_pipeline = Pipeline.load_from_yaml("hybrid_pipeline.yaml")
```

示例 YAML：

```yaml
components:
  bm25_retriever:
    type: InMemoryBM25Retriever
    init_parameters:
      document_store: doc_store
      top_k: 10
  embedder:
    type: SentenceTransformersEmbedder
    init_parameters:
      model: BAAI/bge-large-zh-v1.5
connections:
  - sender: bm25_retriever.documents
    receiver: joiner.documents
```

## Haystack Hooks

自定义钩子用于管道监控和日志：

```python
from haystack import Pipeline

def log_retrieval(component_name, result):
    """检索后记录日志"""
    docs = result.get("documents", [])
    print(f"[{component_name}] 检索到 {len(docs)} 个文档")
    for doc in docs[:3]:
        print(f"  - {doc.content[:50]}... (score: {doc.score:.3f})")

pipeline = Pipeline()
# ... 添加组件 ...
pipeline.add_component_hook("retriever", "run", log_retrieval)
```

## 与 LangChain/LlamaIndex 对比

| 维度 | Haystack | LangChain | LlamaIndex |
|------|---------|-----------|------------|
| 架构 | 管道 + 组件 | 链 + 工具 | 索引 + 引擎 |
| 可组合性 | 高（管道连接） | 高（LCEL） | 中 |
| 生产就绪性 | 高 | 中 | 中 |
| 可观测性 | 内置 | 需集成 | 需集成 |
| 灵活性 | 高 | 最高 | 中 |
| 学习曲线 | 中 | 高 | 低 |
| 最适合 | 生产 RAG | 通用 AI 应用 | RAG 原型 |

**选择建议**：
- **生产级 RAG** → Haystack（管道序列化、组件热插拔、内置可观测性）
- **快速原型** → LangChain 或 LlamaIndex
- **需要高度定制** → LangChain（LCEL 最灵活）

## 完整示例

```python
from haystack import Pipeline
from haystack.components.converters import PyPDFToDocument
from haystack.components.preprocessors import DocumentCleaner, DocumentSplitter
from haystack.components.embedders import SentenceTransformersEmbedder, SentenceTransformersTextEmbedder
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
from haystack.components.rankers import TransformersSimilarityRanker
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.components.writers import DocumentWriter

# 1. 文档存储
doc_store = InMemoryDocumentStore()

# 2. 索引管道
index_pipeline = Pipeline()
index_pipeline.add_component("converter", PyPDFToDocument())
index_pipeline.add_component("cleaner", DocumentCleaner())
index_pipeline.add_component("splitter", DocumentSplitter(
    split_by="sentence", split_length=10, split_overlap=2,
))
index_pipeline.add_component("embedder", SentenceTransformersEmbedder(
    model="BAAI/bge-large-zh-v1.5",
))
index_pipeline.add_component("writer", DocumentWriter(document_store=doc_store))

index_pipeline.connect("converter", "cleaner")
index_pipeline.connect("cleaner", "splitter")
index_pipeline.connect("splitter", "embedder")
index_pipeline.connect("embedder", "writer")

index_pipeline.run({"converter": {"sources": ["./data/report.pdf"]}})

# 3. 查询管道
template = """基于以下文档回答问题：

{% for doc in documents %}
{{ doc.content }}
{% endfor %}

问题：{{ query }}
回答："""

query_pipeline = Pipeline()
query_pipeline.add_component("embedder", SentenceTransformersTextEmbedder(
    model="BAAI/bge-large-zh-v1.5",
))
query_pipeline.add_component("retriever", InMemoryEmbeddingRetriever(
    document_store=doc_store, top_k=20,
))
query_pipeline.add_component("ranker", TransformersSimilarityRanker(top_k=5))
query_pipeline.add_component("prompt_builder", PromptBuilder(template=template))
query_pipeline.add_component("generator", OpenAIGenerator(model="gpt-4o", temperature=0))

query_pipeline.connect("embedder.embedding", "retriever.query_embedding")
query_pipeline.connect("retriever.documents", "ranker.documents")
query_pipeline.connect("ranker.documents", "prompt_builder.documents")
query_pipeline.connect("prompt_builder.prompt", "generator.prompt")

# 4. 查询
result = query_pipeline.run({
    "embedder": {"text": "公司的年假政策是什么？"},
    "prompt_builder": {"query": "公司的年假政策是什么？"},
})
print(result["generator"]["replies"][0])
```