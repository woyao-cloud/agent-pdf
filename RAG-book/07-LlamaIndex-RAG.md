# 07 -- LlamaIndex RAG

LlamaIndex（原名 GPT Index）是专为 RAG 设计的数据框架，以"数据连接"为核心理念，提供了比 LangChain 更专注的 RAG 开发体验。

## 概述

LlamaIndex 的核心抽象：

```
数据源 (Documents/Nodes)
    ↓
索引构建 (Index)
    ↓
查询引擎 (Query Engine)
    ↓
响应合成 (Response Synthesizer)
```

与 LangChain 的通用性不同，LlamaIndex 专门为"用 LLM 查询数据"这个场景优化，在索引类型、查询策略和检索优化方面更加深入。

## 核心概念

### Document 与 Node

```python
from llama_index.core import Document

# 创建文档
doc = Document(
    text="文档内容...",
    metadata={"source": "report.pdf", "author": "张三"},
)

# Node 是文档的子单元（分块后的结果）
from llama_index.core.schema import TextNode

node = TextNode(
    text="分块后的文本内容...",
    metadata={"source": "report.pdf", "page": 1},
)
```

- **Document**：完整文档，对应一个文件
- **Node**：文档的分块单元，是 LlamaIndex 最小的检索单位

### SimpleDirectoryReader

```python
from llama_index.core import SimpleDirectoryReader

# 加载目录中的所有文件
reader = SimpleDirectoryReader(
    input_dir="./data",
    required_exts=[".pdf", ".md", ".txt"],  # 可选：过滤文件类型
    recursive=True,                          # 递归子目录
)
documents = reader.load_data()

# 加载特定文件
documents = SimpleDirectoryReader(input_files=["report.pdf"]).load_data()
```

### LlamaParse（高级解析）

```python
from llama_parse import LlamaParse

parser = LlamaParse(
    api_key="your-api-key",
    result_type="markdown",   # 输出 Markdown 格式
    language="zh",            # 中文优化
)

documents = parser.load_data("complex_report.pdf")
# 自动处理表格、图片、多栏布局
```

## 索引类型

LlamaIndex 提供多种索引类型，适用于不同场景：

### VectorStoreIndex（最常用）

基于向量相似度的索引：

```python
from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.embeddings.openai import OpenAIEmbedding

# 从文档创建
index = VectorStoreIndex.from_documents(documents)

# 从节点创建
index = VectorStoreIndex(nodes=nodes)

# 查询
query_engine = index.as_query_engine()
response = query_engine.query("什么是 RAG？")
print(response)
```

### SummaryIndex

存储所有文档的摘要，适合需要全量概览的查询：

```python
from llama_index.core import SummaryIndex

summary_index = SummaryIndex.from_documents(documents)
query_engine = summary_index.as_query_engine(response_mode="tree_summarize")
# 对所有文档生成摘要后再回答
```

### KeywordTableIndex

基于关键词的索引，适合精确关键词匹配场景：

```python
from llama_index.core import KeywordTableIndex

keyword_index = KeywordTableIndex.from_documents(documents)
```

### 知识图谱索引

结合知识图谱与向量检索：

```python
from llama_index.core import KnowledgeGraphIndex

kg_index = KnowledgeGraphIndex.from_documents(
    documents,
    max_triplets_per_chunk=10,  # 每块提取的三元组数
    kg_triplet_extract_fn=extract_triplets,  # 自定义提取函数
)
```

### 索引类型对比

| 索引类型 | 构建成本 | 查询精度 | 适用场景 |
|---------|---------|---------|---------|
| VectorStoreIndex | 中 | 高 | 通用 RAG |
| SummaryIndex | 低 | 中 | 概览性查询 |
| KeywordTableIndex | 低 | 中 | 关键词精确匹配 |
| KnowledgeGraphIndex | 高 | 高 | 关系推理、多跳查询 |

## 查询引擎

### 基础查询引擎

```python
# 默认查询引擎
query_engine = index.as_query_engine(
    similarity_top_k=5,          # 返回 top-5 文档
    response_mode="refine",      # 响应模式
    streaming=True,              # 流式输出
)

# 流式响应
response = query_engine.query("什么是 RAG？")
response.print_response_stream()  # 流式打印
```

### 响应模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `refine` | 逐块精炼答案 | 需要综合多个文档 |
| `compact` | 紧凑模式（默认） | 通用 |
| `tree_summarize` | 树状总结 | 需要高度压缩的答案 |
| `simple_summarize` | 简单总结 | 快速概览 |
| `no_text` | 只返回检索结果 | 不需要 LLM 生成 |
| `accumulate` | 累积所有块答案 | 需要完整信息 |

### SubQuestionQueryEngine（问题分解）

将复杂问题分解为子问题，分别检索后合并：

```python
from llama_index.core.query_engine import SubQuestionQueryEngine
from llama_index.core.tools import QueryEngineTool

# 为每个子索引创建工具
tool1 = QueryEngineTool.from_defaults(
    query_engine=index1.as_query_engine(),
    name="financial_data",
    description="包含财务报告数据",
)

tool2 = QueryEngineTool.from_defaults(
    query_engine=index2.as_query_engine(),
    name="product_docs",
    description="包含产品文档",
)

# 子问题查询引擎
sub_query_engine = SubQuestionQueryEngine.from_defaults(
    query_engine_tools=[tool1, tool2],
)

# 自动分解: "2024年产品A的收入是多少？" → "2024年收入" + "产品A信息"
response = sub_query_engine.query("2024年产品A的收入是多少？")
```

### RouterQueryEngine（查询路由）

根据问题内容路由到不同索引：

```python
from llama_index.core.query_engine import RouterQueryEngine
from llama_index.core.selectors import LLMSingleSelector

router_engine = RouterQueryEngine(
    selector=LLMSingleSelector.from_defaults(),
    query_engine_tools=[tool1, tool2],
)

# 自动选择: 财务问题 → index1, 产品问题 → index2
```

### CitationQueryEngine（带引用）

```python
from llama_index.core.query_engine import CitationQueryEngine

citation_engine = CitationQueryEngine.from_args(
    index,
    citation_chunk_size=512,
)

response = citation_engine.query("什么是 RAG？")
# 辔回带 [1] [2] 引用标记的答案
```

## Node 后处理器

```python
from llama_index.core.postprocessor import (
    SimilarityPostprocessor,
    KeywordNodePostprocessor,
    SentenceTransformerRerank,
)

# 相似度阈值过滤
similarity_filter = SimilarityPostprocessor(similarity_cutoff=0.7)

# 关键词过滤
keyword_filter = KeywordNodePostprocessor(
    required_keywords=["RAG"],
    exclude_keywords=["deprecated"],
)

# 重排序
reranker = SentenceTransformerRerank(
    model="cross-encoder/ms-marco-MiniLM-L-2-v2",
    top_n=5,
)

query_engine = index.as_query_engine(
    similarity_top_k=20,  # 先多取
    node_postprocessors=[similarity_filter, reranker],  # 过滤+重排
)
```

## 存储上下文

```python
from llama_index.core import StorageContext
from llama_index.vector_stores.milvus import MilvusVectorStore

# 使用 Milvus 作为向量存储
vector_store = MilvusVectorStore(
    uri="http://localhost:19530",
    collection_name="my_docs",
)

storage_context = StorageContext.from_defaults(
    vector_store=vector_store,
)

# 构建索引时使用
index = VectorStoreIndex.from_documents(
    documents,
    storage_context=storage_context,
)

# 持久化
index.storage_context.persist(persist_dir="./storage")

# 加载
from llama_index.core import load_index_from_storage
storage_context = StorageContext.from_defaults(persist_dir="./storage")
index = load_index_from_storage(storage_context)
```

## 嵌入模型配置

```python
from llama_index.core import Settings
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

# 全局配置
Settings.embed_model = HuggingFaceEmbedding(
    model_name="BAAI/bge-large-zh-v1.5",
)

Settings.chunk_size = 1024
Settings.chunk_overlap = 200

# 或按索引配置
index = VectorStoreIndex.from_documents(
    documents,
    embed_model=HuggingFaceEmbedding(model_name="BAAI/bge-m3"),
)
```

## 完整示例

```python
from llama_index.core import (
    VectorStoreIndex, SimpleDirectoryReader, Settings,
    StorageContext, PromptTemplate,
)
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI

# 1. 配置
Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-large-zh-v1.5")
Settings.llm = OpenAI(model="gpt-4o", temperature=0)
Settings.chunk_size = 1024
Settings.chunk_overlap = 200

# 2. 加载文档
documents = SimpleDirectoryReader("./data", recursive=True).load_data()

# 3. 构建索引
index = VectorStoreIndex.from_documents(documents)

# 4. 创建查询引擎
query_engine = index.as_query_engine(
    similarity_top_k=5,
    response_mode="refine",
    streaming=True,
)

# 5. 查询
response = query_engine.query("公司的年假政策是什么？")
print(str(response))

# 6. 查看来源
for source_node in response.source_nodes:
    print(f"来源: {source_node.metadata['filename']}, 相关度: {source_node.score:.3f}")
```