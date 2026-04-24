# 06 -- LangChain RAG

LangChain 是 RAG 开发最流行的框架，提供了从文档加载到检索再到生成的完整工具链。本章详细介绍 LangChain 的 RAG 生态，帮助开发者快速构建生产级 RAG 应用。

## 概述

LangChain RAG 的核心组件：

```
文档加载 (Document Loaders)
    ↓
文本分割 (Text Splitters)
    ↓
嵌入模型 (Embedding Models)
    ↓
向量存储 (Vector Stores)
    ↓
检索器 (Retrievers)
    ↓
链/应用 (Chains / LCEL)
```

## Document Loaders — 文档加载

LangChain 提供 100+ 文档加载器，覆盖常见文件格式和数据源。

### 文件加载器

```python
# PDF
from langchain_community.document_loaders import PyPDFLoader
loader = PyPDFLoader("report.pdf")
docs = loader.load()  # 每个 page 一个 Document

# Word
from langchain_community.document_loaders import Docx2txtLoader
loader = Docx2txtLoader("document.docx")

# Markdown
from langchain_community.document_loaders import UnstructuredMarkdownLoader
loader = UnstructuredMarkdownLoader("readme.md")

# CSV
from langchain_community.document_loaders import CSVLoader
loader = CSVLoader("data.csv", source_column="content")

# HTML
from langchain_community.document_loaders import WebBaseLoader
loader = WebBaseLoader("https://example.com/docs")
```

### 目录批量加载

```python
from langchain_community.document_loaders import DirectoryLoader

loader = DirectoryLoader(
    path="./data",
    glob="**/*.pdf",        # 递归搜索
    loader_cls=PyPDFLoader,
    show_progress=True,
)
docs = loader.load()
```

### 非结构化加载器（推荐用于复杂文档）

```python
from langchain_community.document_loaders import UnstructuredFileLoader

loader = UnstructuredFileLoader(
    "complex_doc.pdf",
    mode="elements",        # 按元素（标题、段落、表格）分割
    strategy="hi_res",     # 高精度 OCR + 布局检测
)
docs = loader.load()
```

### Document 对象

每个加载器返回 `Document` 列表，包含：

```python
Document(
    page_content="文档内容文本...",
    metadata={
        "source": "report.pdf",
        "page": 1,
        "author": "...",
        # 自定义元数据
    }
)
```

元数据在后续的过滤检索中至关重要。

## Text Splitters — 文本分割

文本分割决定了检索粒度，是 RAG 效果的关键因素。

### RecursiveCharacterTextSplitter（最常用）

递归地按分隔符层级分割，尽量保持语义完整性：

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,      # 目标块大小
    chunk_overlap=200,    # 块间重叠
    separators=["\n\n", "\n", "。", "！", "？", ".", " ", ""],
    length_function=len,
)

chunks = splitter.split_documents(docs)
```

**分隔符优先级**：先尝试按段落分割，太大则按句子，再大则按字符。重叠区确保跨块信息不丢失。

### MarkdownHeaderTextSplitter

按 Markdown 标题结构分割，保留层级信息：

```python
from langchain_text_splitters import MarkdownHeaderTextSplitter

headers_to_split_on = [
    ("#", "Header 1"),
    ("##", "Header 2"),
    ("###", "Header 3"),
]

splitter = MarkdownHeaderTextSplitter(headers_to_split_on)
chunks = splitter.split_text(markdown_text)
# 每个块的 metadata 包含 {"Header 1": "xxx", "Header 2": "yyy"}
```

### 代码分割器

```python
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter.from_language(
    language=Language.PYTHON,
    chunk_size=2000,
    chunk_overlap=200,
)
# 按 class/function 边界分割，保持代码完整性
```

### 分割策略选择

| 策略 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| RecursiveCharacter | 通用文档 | 灵活、通用 | 可能切断语义 |
| MarkdownHeader | Markdown/技术文档 | 保留结构 | 仅适用于 Markdown |
| Code Splitter | 代码文件 | 保持函数完整 | 仅适用于代码 |
| Semantic Chunking | 高质量需求 | 语义完整 | 计算开销大 |
| Token Splitter | 精确 token 控制 | token 精确 | 不考虑语义 |

## Embedding Models — 嵌入模型

### OpenAI Embeddings

```python
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(
    model="text-embedding-3-small",  # 1536维，经济
    # model="text-embedding-3-large", # 3072维，精度更高
)
```

### 开源嵌入模型

```python
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-large-zh-v1.5",  # 中文最优
    # model_name="BAAI/bge-m3",            # 多语言
    # model_name="intfloat/e5-large-v2",    # 英文优秀
    model_kwargs={"device": "cuda"},
    encode_kwargs={"normalize_embeddings": True},  # 归一化，cosine=dot product
)
```

### Cohere Embeddings

```python
from langchain_cohere import CohereEmbeddings

embeddings = CohereEmbeddings(
    model="embed-v4",
)
```

### 模型对比

| 模型 | 维度 | 语言 | MTEB 排名 | 特点 |
|------|------|------|----------|------|
| text-embedding-3-small | 1536 | 多语言 | 高 | 性价比最优 |
| text-embedding-3-large | 3072 | 多语言 | 最高 | 精度最高，成本高 |
| bge-large-zh-v1.5 | 1024 | 中文 | 中文最优 | 中文场景首选 |
| bge-m3 | 1024 | 多语言 | 高 | 支持密集+稀疏+ColBERT |
| e5-large-v2 | 1024 | 英文 | 高 | 指令感知嵌入 |
| all-MiniLM-L6-v2 | 384 | 英文 | 中 | 轻量、快速 |

**选择建议**：
- 中文场景 → `bge-large-zh-v1.5` 或 `bge-m3`
- 英文/通用 → `text-embedding-3-small`
- 高精度 → `text-embedding-3-large`
- 本地部署 → `bge-m3` 或 `e5-large-v2`

## Vector Stores — 向量存储

LangChain 集成了 50+ 向量数据库。以下是 RAG 开发最常用的：

### Chroma（开发/原型首选）

```python
from langchain_chroma import Chroma

# 从文档创建
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db",  # 持久化目录
)

# 检索
results = vectorstore.similarity_search("查询内容", k=5)
results = vectorstore.similarity_search_with_score("查询内容", k=5)  # 带分数
```

### FAISS（高性能本地搜索）

```python
from langchain_community.vectorstores import FAISS

vectorstore = FAISS.from_documents(chunks, embeddings)

# 保存/加载
vectorstore.save_local("./faiss_index")
vectorstore = FAISS.load_local("./faiss_index", embeddings, allow_dangerous_deserialization=True)
```

### Milvus / Zilliz（企业级）

```python
from langchain_milvus import Milvus

vectorstore = Milvus.from_documents(
    documents=chunks,
    embedding=embeddings,
    connection_args={"host": "localhost", "port": "19530"},
    collection_name="my_collection",
)
```

### Qdrant

```python
from langchain_qdrant import QdrantVectorStore

vectorstore = QdrantVectorStore.from_documents(
    documents=chunks,
    embedding=embeddings,
    url="http://localhost:6333",
    collection_name="my_collection",
)
```

### pgvector（PostgreSQL 扩展）

```python
from langchain_community.vectorstores import PGVector

vectorstore = PGVector.from_documents(
    documents=chunks,
    embedding=embeddings,
    connection_string="postgresql://user:pass@localhost:5432/vectordb",
    collection_name="my_collection",
)
```

### 带元数据过滤的检索

```python
# Chroma 元数据过滤
results = vectorstore.similarity_search(
    "查询内容",
    k=5,
    filter={"department": "engineering"},  # 只检索工程部门文档
)

# Qdrant 元数据过滤
from qdrant_client.models import Filter, FieldCondition, MatchValue

results = vectorstore.similarity_search(
    "查询内容",
    k=5,
    filter=Filter(must=[
        FieldCondition(key="metadata.department", match=MatchValue(value="engineering"))
    ]),
)
```

## Retrievers — 检索器

检索器是 LangChain RAG 的核心抽象，封装了检索策略。

### 基础检索器

```python
# 向量存储检索器
retriever = vectorstore.as_retriever(
    search_type="similarity",      # 相似度搜索
    search_kwargs={"k": 5},
)

# 也可以用 MMR（最大边际相关性），减少冗余
retriever = vectorstore.as_retriever(
    search_type="mmr",
    search_kwargs={"k": 5, "fetch_k": 20},
)

# 相似度阈值检索
retriever = vectorstore.as_retriever(
    search_type="similarity_score_threshold",
    search_kwargs={"score_threshold": 0.7, "k": 10},
)
```

### BM25 检索器（关键词检索）

```python
from langchain_community.retrievers import BM25Retriever

bm25_retriever = BM25Retriever.from_documents(chunks, k=5)
```

### 混合检索器（Ensemble）

```python
from langchain.retrievers import EnsembleRetriever

# BM25 + 向量检索，权重各 50%
ensemble_retriever = EnsembleRetriever(
    retrievers=[bm25_retriever, vectorstore.as_retriever(k=5)],
    weights=[0.5, 0.5],
)
```

### 多查询检索器（MultiQuery）

自动生成多个查询变体，提高召回率：

```python
from langchain.retrievers.multi_query import MultiQueryRetriever

retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(),
    llm=ChatOpenAI(model="gpt-4o"),
)
# 自动生成 3 个查询变体，合并去重后返回
```

### 父文档检索器（ParentDocument）

小块检索，大块返回上下文：

```python
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage import InMemoryStore

# 子文档分割器（小块，用于检索）
child_splitter = RecursiveCharacterTextSplitter(chunk_size=400)
# 父文档分割器（大块，用于上下文）
parent_splitter = RecursiveCharacterTextSplitter(chunk_size=2000)

retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=InMemoryStore(),
    child_splitter=child_splitter,
    parent_splitter=parent_splitter,
)
```

### 上下文压缩检索器

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain_cohere import CohereRerank

compressor = CohereRerank(top_n=5)
compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=vectorstore.as_retriever(k=20),  # 先多取
)
# 返回重排序后的 top 5
```

### 自查询检索器

自动从用户查询中提取元数据过滤条件：

```python
from langchain.retrievers.self_query.base import SelfQueryRetriever
from langchain.chains.query_constructor.base import AttributeInfo

metadata_field_info = [
    AttributeInfo(name="department", description="部门", type="string"),
    AttributeInfo(name="year", description="年份", type="integer"),
]

retriever = SelfQueryRetriever.from_llm(
    llm=ChatOpenAI(model="gpt-4o"),
    vectorstore=vectorstore,
    document_contents="企业知识库文档",
    metadata_field_info=metadata_field_info,
)
# 查询 "2024年工程部门的报告" → 自动提取 filter: department=engineering, year=2024
```

## Chains — RAG 链

### LCEL 方式（推荐）

LangChain Expression Language 提供了灵活的链组合：

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# 提示词模板
template = """基于以下上下文回答问题。如果上下文中没有答案，请说"我不知道"。

上下文：
{context}

问题：{question}

回答："""

prompt = ChatPromptTemplate.from_template(template)

# 构建 RAG 链
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | ChatOpenAI(model="gpt-4o")
    | StrOutputParser()
)

# 调用
answer = rag_chain.invoke("什么是 RAG？")
```

### 对话式 RAG

```python
from langchain_core.messages import HumanMessage, AIMessage
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

# 历史感知检索器（基于对话历史改写查询）
contextualize_prompt = ChatPromptTemplate.from_messages([
    ("system", "基于对话历史，改写用户问题为独立的检索查询"),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])

history_aware_retriever = create_history_aware_retriever(
    llm=ChatOpenAI(model="gpt-4o"),
    retriever=retriever,
    prompt=contextualize_prompt,
)

# 问答链
qa_prompt = ChatPromptTemplate.from_messages([
    ("system", "基于以下上下文回答问题：\n\n{context}"),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])

question_answer_chain = create_stuff_documents_chain(
    llm=ChatOpenAI(model="gpt-4o"),
    prompt=qa_prompt,
)

# 完整 RAG 链
rag_chain = create_retrieval_chain(
    history_aware_retriever,
    question_answer_chain,
)

# 调用（带对话历史）
response = rag_chain.invoke({
    "input": "它有什么优势？",
    "chat_history": [
        HumanMessage(content="什么是 RAG？"),
        AIMessage(content="RAG 是检索增强生成..."),
    ],
})
```

### 带来源引用的 RAG

```python
# 返回答案和来源文档
response = rag_chain.invoke("什么是 RAG？")
print(response["answer"])      # 答案
print(response["context"])     # 来源文档列表

# 在提示词中要求引用
template = """基于以下上下文回答问题。在答案中引用来源 [1], [2] 等。

上下文：
{context}

问题：{question}

回答（请引用来源）："""
```

## 完整示例：企业知识库 RAG

```python
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# 1. 加载文档
loader = DirectoryLoader("./data", glob="**/*.pdf", loader_cls=PyPDFLoader)
docs = loader.load()

# 2. 分割
splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000, chunk_overlap=200,
    separators=["\n\n", "\n", "。", ".", " ", ""],
)
chunks = splitter.split_documents(docs)

# 3. 创建向量存储
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = Chroma.from_documents(
    chunks, embeddings, persist_directory="./chroma_db"
)

# 4. 创建检索器
retriever = vectorstore.as_retriever(search_type="mmr", search_kwargs={"k": 5})

# 5. 构建 RAG 链
template = """你是企业知识库助手。基于以下上下文回答问题。
如果上下文中没有答案，请说"根据现有资料无法回答"，不要编造。

上下文：
{context}

问题：{question}

回答："""

prompt = ChatPromptTemplate.from_template(template)

def format_docs(docs):
    return "\n\n---\n\n".join(
        f"[来源: {d.metadata.get('source', 'unknown')}]\n{d.page_content}"
        for d in docs
    )

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | ChatOpenAI(model="gpt-4o", temperature=0)
    | StrOutputParser()
)

# 6. 使用
answer = rag_chain.invoke("公司的远程办公政策是什么？")
print(answer)
```