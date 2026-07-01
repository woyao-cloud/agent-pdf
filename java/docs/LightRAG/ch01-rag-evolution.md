# 第1章 RAG 技术演进与 LightRAG 定位

## 1.1 RAG 技术发展简史

### 解决的问题

大语言模型（LLM）虽然能力强大，但存在知识截止日期、幻觉问题、无法访问私有数据等固有缺陷。RAG（Retrieval-Augmented Generation）通过引入外部知识检索来解决这些问题，让 LLM 能够基于检索到的真实信息生成回答。

### 核心原理

RAG 的核心流程可以概括为三个步骤：**检索 → 增强 → 生成**。

```
用户查询 → 向量检索 → 相关文档 → 增强提示 → LLM 生成 → 最终回答
```

**RAG 发展的三个阶段：**

**1. 朴素 RAG（Naive RAG）**
最早的 RAG 实现，采用"检索-阅读"框架：
- 将文档切分为固定大小的块（Chunk）
- 使用嵌入模型将每个块转换为向量
- 用户查询时，通过向量相似度检索最相关的块
- 将检索到的块作为上下文输入 LLM

**2. 高级 RAG（Advanced RAG）**
在朴素 RAG 基础上引入多种优化策略：
- **查询重写**：将用户问题改写为更适合检索的形式
- **重排序**：对检索结果进行二次排序，提升相关性
- **HyDE（Hypothetical Document Embeddings）**：先生成假设性回答，再用该回答检索
- **多路召回**：同时使用多种检索策略，融合结果

**3. 模块化 RAG（Modular RAG）**
将 RAG 流程拆分为可组合的模块：
- **路由**：根据问题类型选择不同的检索策略
- **多模态**：支持文本、图像、表格等多种数据格式
- **Agent 化**：引入 Agent 自主决定检索时机和策略

### 代码/配置实现

**朴素 RAG 示例：**

```python
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import OpenAIEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 文档分块
text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
chunks = text_splitter.split_documents(documents)

# 构建向量索引
embeddings = OpenAIEmbeddings()
vectorstore = FAISS.from_documents(chunks, embeddings)

# 检索
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
docs = retriever.get_relevant_documents("用户问题")
```

### 使用场景

- 企业知识库问答
- 智能客服系统
- 文档分析助手
- 法律/医疗文档检索

### 潜在风险与注意事项

- 朴素 RAG 无法处理需要跨文档推理的问题
- 向量相似度不等于语义相关性
- 分块策略严重影响检索质量

### 本章小结

- RAG 经历了朴素 → 高级 → 模块化三个阶段
- 传统 RAG 在关系理解和全局概览方面存在局限
- 图增强 RAG 是解决这些局限的重要方向

---

## 1.2 传统 RAG 的局限性

### 解决的问题

理解传统 RAG 的局限性，才能理解为什么需要 LightRAG 这样的图增强方案。

### 核心原理

**三大核心局限：**

**1. 语义鸿沟**
向量相似度基于嵌入空间的距离，但语义相关性不等于向量距离。两个语义相关的概念可能在向量空间中距离很远。

**2. 关系缺失**
传统 RAG 将文档切分为独立的块，丢失了块之间的实体关系和语义关联。例如，"苹果发布了 iPhone 15"和"iPhone 15 搭载了 A17 芯片"这两条信息之间的实体关系被切断了。

**3. 全局理解差**
传统 RAG 只能检索与查询最相似的局部块，无法回答需要综合多文档信息的问题，如"这份报告的主要结论是什么？"

### 代码/配置实现

```python
# 传统 RAG 的局限示例
query = "苹果公司最新产品的芯片是什么？"
# 需要跨两个文档块推理：
# 块1: "苹果发布了 iPhone 15"
# 块2: "iPhone 15 搭载了 A17 芯片"
# 传统 RAG 可能只检索到块1，无法关联到块2
```

### 使用场景

- 需要多跳推理的复杂问题
- 需要理解实体间关系的问题
- 需要全局概览的问题

### 潜在风险与注意事项

- 分块大小和重叠度的选择对结果影响很大
- 传统 RAG 在知识密集型场景下表现不佳

### 本章小结

- 语义鸿沟、关系缺失、全局理解差是传统 RAG 的三大局限
- 图增强 RAG 通过显式建模实体关系来解决这些问题

---

## 1.3 图增强 RAG 的兴起

### 解决的问题

图增强 RAG 通过在文档之上构建知识图谱，显式建模实体和关系，解决传统 RAG 的关系缺失和全局理解问题。

### 核心原理

**主流图增强 RAG 方案：**

| 方案 | 机构 | 核心思路 | 特点 |
|------|------|---------|------|
| **GraphRAG** | 微软 | 社区检测 + 分层摘要 | 全局理解强，Token 消耗大 |
| **LightRAG** | 港大 | 图索引 + 双级检索 | 轻量高效，增量更新 |
| **KAG** | 蚂蚁 | 知识图谱增强 | 结构化知识融合 |
| **HippoRAG** | 斯坦福 | 长期记忆 + 图索引 | 持续学习 |

### 代码/配置实现

```python
# LightRAG 安装
# pip install lightrag-hku

from lightrag import LightRAG
from lightrag.llm import gpt_4o_mini_complete

# 初始化 LightRAG
rag = LightRAG(
    working_dir="./lightrag_cache",
    llm_func=gpt_4o_mini_complete
)

# 插入文档
rag.insert("苹果发布了 iPhone 15，搭载了 A17 芯片。")
rag.insert("iPhone 15 的起售价为 799 美元。")

# 查询
answer = rag.query("iPhone 15 的芯片和价格是什么？", mode="hybrid")
```

### 使用场景

- 需要关系推理的知识密集型问答
- 多文档综合分析
- 持续更新的知识库

### 潜在风险与注意事项

- 图构建需要 LLM 调用，增加 Token 消耗
- 实体提取质量影响整体效果

### 本章小结

- GraphRAG 适合全局理解，但 Token 消耗大
- LightRAG 轻量高效，支持增量更新
- 选择方案需根据具体场景权衡
