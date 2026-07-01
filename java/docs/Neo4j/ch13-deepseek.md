# 第13章 Neo4j + DeepSeek 集成架构：知识图谱与大语言模型的深度融合

## 13.1 引言

大语言模型（Large Language Model, LLM）的快速发展正在重塑人工智能的边界。以 DeepSeek 为代表的国产大模型在推理能力、代码生成和数学解题等任务上展现出接近甚至超越 GPT-4 的水平。然而，LLM 固有的局限性——知识截止日期、幻觉问题、缺乏领域专精——使其在落地企业级应用时面临严峻挑战。

知识图谱（Knowledge Graph, KG）以结构化的方式组织实体及其关系，天然具备可解释、可更新、可推理的优势。将 Neo4j 图数据库与 DeepSeek 大模型深度集成，形成"图数据库存储知识 + 大模型理解语义"的协同架构，正在成为新一代智能应用的基础范式。

本章将系统性地阐述 Neo4j 与 DeepSeek 的集成架构设计，涵盖模型能力、Graph RAG 原理、向量搜索、LangChain 集成等核心主题，并提供完整的 Python 代码实现。

---

## 13.2 DeepSeek 模型概述

### 13.2.1 DeepSeek 系列模型演进

DeepSeek 由深度求索（DeepSeek）公司开发，是当前最受关注的开源大模型系列之一。其核心模型包括：

**DeepSeek-V2（2024年初）**
- 总参数量 236B，激活参数 21B
- 采用 MoE（Mixture of Experts）架构
- 上下文窗口 128K tokens
- 在数学、编程、推理等基准测试中达到 Llama-3 同等水平
- 训练成本仅为同等性能模型的 1/10

**DeepSeek-V3（2024年底）**
- 总参数量 671B，激活参数 37B
- 采用改进型 MoE 架构，引入 Multi-Token Prediction（MTP）
- 上下文窗口扩展至 128K
- 在多项基准上超越 Llama-3.1-405B 和 GPT-4
- 训练仅耗资约 560 万美元，效率惊人

**DeepSeek-R1（2025年初）**
- 专注于推理增强的版本
- 引入强化学习驱动的思维链（Chain-of-Thought）训练
- 在数学推理、代码生成等任务上表现卓越
- 支持"深度思考"模式，可输出完整的推理过程

### 13.2.2 核心能力分析

DeepSeek 模型的核心技术优势可归纳为以下几个方面：

**MoE 架构的经济性**
DeepSeek 采用 Mixture of Experts 架构，虽然总参数量巨大（V3 达 671B），但每次推理仅激活约 37B 参数。这意味着在保持高性能的同时，推理成本大幅降低——对于企业级知识图谱应用而言，这意味着可以以更低的成本获得接近顶尖水平的语义理解能力。

**长上下文支持**
128K 的上下文窗口使 DeepSeek 能够处理大规模知识图谱的查询上下文。在 Graph RAG 场景中，这意味着可以将大量图遍历结果一次性注入模型上下文，无需分块处理。

**多语言能力**
DeepSeek 在中文理解上具有天然优势，这对于构建中文知识图谱应用至关重要。其分词器对中英文混合场景的 token 利用率远高于 Llama 系列。

**函数调用与工具使用**
DeepSeek 支持函数调用（Function Calling）能力，可以结构化地输出图查询语句（Cypher）或调用外部工具，这是与 Neo4j 集成的关键接口。

### 13.2.3 API 访问方式

DeepSeek 提供两种主要的 API 访问方式：

**官方 API（推荐生产环境）**
```
Base URL: https://api.deepseek.com
Models:   deepseek-chat (V3), deepseek-reasoner (R1)
```

**本地部署（推荐数据敏感场景）**
通过 Ollama、vLLM 或 Hugging Face Transformers 部署：
```bash
# 使用 Ollama 部署（需 32GB+ 显存）
ollama pull deepseek-v3

# 使用 vLLM 部署
vllm serve deepseek-ai/DeepSeek-V3 --tensor-parallel-size 4
```

对于知识图谱集成场景，推荐使用官方 API 以获得最佳性能，同时结合 Neo4j 的本地存储确保数据安全。

---

## 13.3 集成架构设计

### 13.3.1 整体架构

Neo4j + DeepSeek 集成架构采用"三明治"模式：底层是 Neo4j 图数据库，中间层是语义映射与检索引擎，顶层是 DeepSeek 大模型。整体架构如下：

```
┌─────────────────────────────────────────────────┐
│                  应用层 (Application)              │
│  智能问答 │ 知识检索 │ 决策支持 │ 文档生成          │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│               DeepSeek 大模型层                   │
│  ┌─────────────┐  ┌──────────┐  ┌───────────┐  │
│  │ 语义理解    │  │ 推理引擎  │  │ 文本生成   │  │
│  └──────┬──────┘  └────┬─────┘  └─────┬─────┘  │
└─────────┼──────────────┼───────────────┼────────┘
          │              │               │
┌─────────▼──────────────▼───────────────▼────────┐
│              语义映射层 (Semantic Layer)          │
│  ┌────────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ 自然语言→  │ │ 向量嵌入 │ │ 结果结构化   │  │
│  │ Cypher 翻译│ │ 语义检索 │ │ 与格式化     │  │
│  └────────────┘ └──────────┘ └───────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Neo4j 图数据库层                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ 知识图谱 │ │ 向量索引 │ │ 图算法引擎       │ │
│  │ (节点/边) │ │ (Node2Vec)│ │ PageRank/社区发现│ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 13.3.2 核心设计原则

**1. 知识优先（Knowledge-First）**
所有查询首先尝试从知识图谱中获取结构化答案，LLM 仅作为补充和增强。这确保了答案的可追溯性和准确性。

**2. 分层检索（Layered Retrieval）**
检索过程分为三个层次：精确匹配（Cypher 查询）→ 语义匹配（向量检索）→ 图遍历推理（多跳路径）。每一层都在前一层的基上补充。

**3. 上下文窗口优化**
DeepSeek 的 128K 上下文窗口虽然宽裕，但仍需精心设计 prompt 模板，将图查询结果压缩为结构化上下文，避免信息冗余。

**4. 可解释性优先**
所有 LLM 生成的答案必须附带知识图谱中的证据路径，支持用户溯源验证。

### 13.3.3 数据流设计

典型查询的数据流如下：

```
用户提问 "华为的竞争对手有哪些？"
    │
    ▼
[1] 语义解析层：DeepSeek 将自然语言解析为查询意图
    ├─ 实体识别：["华为"]
    ├─ 关系识别：["竞争对手"]
    └─ 约束条件：[无]
    │
    ▼
[2] 查询路由层：根据意图选择检索策略
    ├─ 精确查询 → Cypher: MATCH (c:Company{name:'华为'})-[r:COMPETES_WITH]->(comp) RETURN comp
    ├─ 语义查询 → 向量检索：查找与"华为"语义相似的实体
    └─ 混合查询 → 结合以上两种
    │
    ▼
[3] Neo4j 执行层：执行图查询和向量检索
    ├─ 返回结构化结果：[{name:"中兴", industry:"通信"}, {name:"爱立信", industry:"通信"}]
    └─ 返回证据路径：华为 -[:COMPETES_WITH]-> 中兴
    │
    ▼
[4] DeepSeek 生成层：将结构化结果转化为自然语言答案
    └─ "华为的主要竞争对手包括中兴通讯、爱立信和诺基亚..."
```

---

## 13.4 Graph RAG 原理与实践

### 13.4.1 传统 RAG 的局限性

检索增强生成（Retrieval-Augmented Generation, RAG）是解决 LLM 知识截止和幻觉问题的主流方案。传统的基于向量数据库的 RAG 架构如下：

```
用户提问 → 向量化 → 向量检索(相似度Top-K) → 拼接上下文 → LLM生成
```

这种方案存在以下根本性缺陷：

**语义孤岛问题**
向量检索基于语义相似度，但无法理解实体之间的多跳关系。例如，查询"华为的芯片供应商的竞争对手有哪些"，传统 RAG 需要多次检索才能覆盖"华为→芯片供应商→竞争对手"这条路径，且每次检索都是独立的，丢失了路径上下文。

**缺乏结构化推理**
向量检索返回的是文本块，而非结构化的事实。当需要精确的数字、日期或关系时，文本块中可能包含大量无关信息，稀释了关键事实的密度。

**上下文窗口浪费**
传统 RAG 将大量文本块拼接后送入 LLM 上下文，其中可能包含大量冗余信息。对于 128K 上下文窗口的 DeepSeek 而言，虽然容量充足，但冗余信息会降低推理质量。

**无法处理复杂逻辑查询**
对于"找出所有与华为有合作关系的公司中，市值超过 1000 亿且总部在深圳的企业"这类多条件查询，向量检索几乎无能为力。

### 13.4.2 图增强检索的优势

Graph RAG（Graph-enhanced RAG）通过在检索阶段引入知识图谱，解决了传统 RAG 的核心痛点：

**多跳推理能力**
图数据库天然支持高效的图遍历操作。一条 Cypher 查询即可完成多跳路径检索：

```cypher
// 查询"华为的芯片供应商的竞争对手"
MATCH (h:Company {name: '华为'})-[:SUPPLIES]->(s:Supplier)
MATCH (s)-[:COMPETES_WITH]->(competitor:Company)
RETURN h.name, s.name, competitor.name
```

**结构化事实检索**
图数据库返回的是精确的结构化数据（节点属性、关系类型），而非模糊的文本块。这使 LLM 能够基于精确事实进行推理。

**可解释的证据链**
每条查询结果都附带完整的路径信息，用户可以追溯"答案是如何得出的"，这在金融、医疗等监管严格的领域至关重要。

**混合检索能力**
结合向量索引和图遍历，可以实现"语义相似 + 结构精确"的混合检索。例如，先用向量检索找到与"高端芯片"语义相关的实体，再在图谱中遍历这些实体的供应链关系。

### 13.4.3 Graph RAG 的三种模式

根据应用场景的不同，Graph RAG 可分为三种实现模式：

**模式一：NL2Cypher + 图执行**
将自然语言直接翻译为 Cypher 查询，在 Neo4j 中执行后返回结果。

```
用户提问 → DeepSeek NL2Cypher → Neo4j 执行 → 结构化结果 → DeepSeek 生成答案
```

优势：精确、高效，适合结构化查询场景。
劣势：对复杂自然语言的理解准确率有限，需要精心设计的 prompt。

**模式二：向量检索 + 图增强**
先用向量检索找到相关实体，再在图谱中扩展这些实体的邻域信息。

```
用户提问 → 向量检索(Top-K) → 图邻域扩展 → 合并上下文 → DeepSeek 生成
```

优势：兼顾语义灵活性和结构化信息，适合开放域问答。
劣势：检索延迟较高，需要平衡 K 值和扩展深度。

**模式三：图遍历 + 语义重排序**
先通过图遍历获取候选结果，再用 DeepSeek 进行语义重排序和过滤。

```
用户提问 → Cypher 查询 → 候选结果集 → DeepSeek 语义重排序 → 最终答案
```

优势：保证召回率，利用 LLM 的语义理解进行精排。
劣势：候选集过大时成本较高。

### 13.4.4 完整实现示例

以下是一个完整的 Graph RAG 实现，结合了 NL2Cypher 和向量检索两种模式：

```python
import os
from neo4j import GraphDatabase
from openai import OpenAI
import numpy as np
from typing import List, Dict, Any

# DeepSeek 客户端配置
client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

# Neo4j 连接配置
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "password"

class GraphRAGEngine:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
        )

    def close(self):
        self.driver.close()

    def get_embedding(self, text: str) -> List[float]:
        """使用 DeepSeek 获取文本嵌入向量"""
        response = client.embeddings.create(
            model="deepseek-chat",
            input=text
        )
        return response.data[0].embedding

    def nl2cypher(self, question: str, schema: str) -> str:
        """将自然语言转换为 Cypher 查询"""
        prompt = f"""你是一个 Neo4j Cypher 查询专家。根据以下图模式，将用户问题转换为 Cypher 查询。

图模式：
{schema}

用户问题：{question}

请只返回 Cypher 查询语句，不要包含任何解释。"""

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        return response.choices[0].message.content.strip()

    def execute_cypher(self, query: str) -> List[Dict[str, Any]]:
        """执行 Cypher 查询并返回结果"""
        with self.driver.session() as session:
            result = session.run(query)
            return [record.data() for record in result]

    def vector_search(self, query_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """向量语义检索"""
        query_embedding = self.get_embedding(query_text)

        with self.driver.session() as session:
            result = session.run(
                """
                CALL db.index.vector.queryNodes('entity_embeddings', $top_k, $embedding)
                YIELD node, score
                RETURN node.name AS name, node.description AS description,
                       labels(node) AS labels, score
                """,
                top_k=top_k,
                embedding=query_embedding
            )
            return [record.data() for record in result]

    def graph_expand(self, entity_name: str, hops: int = 1) -> List[Dict[str, Any]]:
        """从指定实体出发，扩展邻域信息"""
        with self.driver.session() as session:
            result = session.run(
                f"""
                MATCH (n {{name: $name}})
                OPTIONAL MATCH path = (n)-[*1..{hops}]-(connected)
                RETURN n.name AS source,
                       [rel IN relationships(path) | type(rel)] AS relations,
                       connected.name AS target,
                       labels(connected) AS target_labels
                LIMIT 50
                """,
                name=entity_name
            )
            return [record.data() for record in result]

    def hybrid_retrieve(self, question: str, schema: str) -> Dict[str, Any]:
        """混合检索：先尝试 NL2Cypher，再补充向量检索"""
        # 第一步：尝试 NL2Cypher 精确查询
        try:
            cypher_query = self.nl2cypher(question, schema)
            exact_results = self.execute_cypher(cypher_query)
        except Exception as e:
            exact_results = []
            print(f"NL2Cypher 失败: {e}")

        # 第二步：向量语义检索
        vector_results = self.vector_search(question)

        # 第三步：从向量结果中扩展图邻域
        expanded_context = []
        for result in vector_results[:3]:
            name = result.get("name")
            if name:
                neighbors = self.graph_expand(name, hops=1)
                expanded_context.extend(neighbors)

        return {
            "exact_results": exact_results,
            "vector_results": vector_results,
            "expanded_context": expanded_context
        }

    def answer(self, question: str, schema: str) -> str:
        """端到端问答"""
        context = self.hybrid_retrieve(question, schema)

        prompt = f"""你是一个知识图谱问答助手。基于以下检索结果回答用户问题。

精确查询结果：
{context['exact_results']}

语义检索结果：
{context['vector_results']}

图邻域扩展信息：
{context['expanded_context']}

用户问题：{question}

请基于以上信息给出准确、简洁的回答。如果信息不足，请明确说明。"""

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        return response.choices[0].message.content


# 使用示例
if __name__ == "__main__":
    schema = """
    节点类型：Company(name, industry, market_cap, headquarters)
              Person(name, title, expertise)
              Technology(name, category, maturity)
    关系类型：COMPETES_WITH, SUPPLIES, PARTNERS_WITH, EMPLOYS, DEVELOPS
    """

    engine = GraphRAGEngine()
    answer = engine.answer("华为在芯片领域有哪些合作伙伴？", schema)
    print(answer)
    engine.close()
```

---

## 13.5 知识图谱作为 LLM 的外部记忆

### 13.5.1 为什么需要外部记忆

LLM 的知识存储在模型参数中，这带来了三个根本性问题：

**知识固化**：模型训练完成后，知识就"冻结"了。新知识需要重新训练或微调，成本高昂。

**知识混淆**：参数化存储意味着知识以分布式方式编码，无法精确删除或更新特定事实。

**知识不透明**：无法确定模型"知道什么"和"不知道什么"，导致幻觉难以检测。

知识图谱作为外部记忆，完美解决了这些问题：

```
┌─────────────────────────────────────────────────────┐
│                  LLM 内部记忆                          │
│  ┌──────────────────────────────────────────────┐   │
│  │  参数化知识（权重中编码）                        │   │
│  │  - 通用语言能力                                │   │
│  │  - 常识推理                                    │   │
│  │  - 领域范式                                    │   │
│  └──────────────────────────────────────────────┘   │
├───────────────────┬─────────────────────────────────┤
│  外部记忆(Neo4j)   │   外部记忆(向量数据库)           │
│  ┌──────────────┐  │  ┌──────────────────────────┐   │
│  │ 结构化事实    │  │  │ 非结构化文本片段          │   │
│  │ 实体关系      │  │  │ 文档嵌入                  │   │
│  │ 业务规则      │  │  │ 代码片段                  │   │
│  │ 时序数据      │  │  └──────────────────────────┘   │
│  └──────────────┘  │                                 │
└─────────────────────┴─────────────────────────────────┘
```

### 13.5.2 知识图谱记忆的读写模式

**写入模式**：从非结构化文本中提取结构化知识，写入 Neo4j

```python
def extract_and_store(text: str, source: str):
    """从文本中提取知识并存入图数据库"""
    prompt = f"""从以下文本中提取实体和关系，以 JSON 格式输出。

文本：{text}

输出格式：
{{
    "entities": [
        {{"name": "...", "type": "...", "properties": {{...}}}}
    ],
    "relations": [
        {{"source": "...", "target": "...", "type": "...", "properties": {{...}}}}
    ]
}}
"""

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.1
    )

    knowledge = json.loads(response.choices[0].message.content)

    with engine.driver.session() as session:
        # 创建实体节点
        for entity in knowledge["entities"]:
            session.run(
                f"""
                MERGE (n:{entity['type']} {{name: $name}})
                SET n += $properties
                """,
                name=entity["name"],
                properties=entity.get("properties", {})
            )

        # 创建关系
        for rel in knowledge["relations"]:
            session.run(
                f"""
                MATCH (a {{name: $source}})
                MATCH (b {{name: $target}})
                MERGE (a)-[r:{rel['type']}]->(b)
                SET r += $properties
                """,
                source=rel["source"],
                target=rel["target"],
                properties=rel.get("properties", {})
            )

    return knowledge
```

**读取模式**：根据查询需求，从图数据库中检索相关知识

```python
def retrieve_memory(question: str, max_depth: int = 2) -> str:
    """从知识图谱记忆中检索相关信息"""
    # 使用 DeepSeek 提取查询中的关键实体
    extract_prompt = f"""从问题中提取关键实体名称，以 JSON 数组格式返回。

问题：{question}

输出格式：["实体1", "实体2", ...]"""

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": extract_prompt}],
        response_format={"type": "json_object"},
        temperature=0.1
    )

    entities = json.loads(response.choices[0].message.content)

    # 对每个实体进行图遍历
    memory_context = []
    with engine.driver.session() as session:
        for entity in entities:
            result = session.run(
                f"""
                MATCH (n {{name: $name}})
                OPTIONAL MATCH path = (n)-[*1..{max_depth}]-(m)
                RETURN n, [rel IN relationships(path) | type(rel)] AS rels,
                       m, labels(m) AS m_labels
                LIMIT 30
                """,
                name=entity
            )
            for record in result:
                memory_context.append(record.data())

    return json.dumps(memory_context, ensure_ascii=False, default=str)
```

### 13.5.3 记忆更新策略

知识图谱作为外部记忆的核心优势之一是可增量更新。以下是三种更新策略：

**策略一：增量追加**
新知识直接追加到图谱中，不影响已有知识。适用于持续增长的知识库。

```python
def incremental_update(new_documents: List[str]):
    """增量更新知识图谱"""
    for doc in new_documents:
        extract_and_store(doc, source="continuous_ingest")
```

**策略二：版本化更新**
为每个事实附加时间戳和版本号，支持时间旅行查询。

```cypher
// 创建带版本的知识节点
CREATE (f:Fact {
    id: "fact_001",
    statement: "华为2024年营收8621亿元",
    valid_from: datetime("2024-01-01"),
    valid_to: datetime("2025-03-31"),
    confidence: 0.95,
    source: "华为2024年报"
})
```

**策略三：冲突检测与合并**
当新知识与现有知识冲突时，通过 LLM 进行消歧。

```python
def resolve_conflict(existing_fact: dict, new_fact: dict) -> dict:
    """使用 DeepSeek 解决知识冲突"""
    prompt = f"""以下两条知识存在冲突，请判断哪条更可信，或给出合并方案。

现有知识：{json.dumps(existing_fact, ensure_ascii=False)}
新知识：{json.dumps(new_fact, ensure_ascii=False)}

请输出 JSON：{{"resolution": "use_existing" | "use_new" | "merge", "reason": "...", "merged_fact": {{...}}}}"""

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.1
    )

    return json.loads(response.choices[0].message.content)
```

---

## 13.6 向量搜索与语义搜索

### 13.6.1 Neo4j 向量索引

Neo4j 5.15+ 版本原生支持向量索引，基于 Lucene HNSW（Hierarchical Navigable Small World）算法实现。这使得 Neo4j 可以同时作为图数据库和向量数据库使用，无需引入额外的向量存储系统。

**创建向量索引：**

```cypher
// 为实体描述创建向量索引
CREATE VECTOR INDEX entity_embeddings IF NOT EXISTS
FOR (n:Entity)
ON n.embedding
OPTIONS {indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
}}
```

**向量查询：**

```cypher
// 语义相似度查询
CALL db.index.vector.queryNodes('entity_embeddings', 5, $query_embedding)
YIELD node, score
RETURN node.name, node.description, score
```

### 13.6.2 嵌入模型选择

在 Neo4j + DeepSeek 架构中，嵌入模型的选择直接影响检索质量。以下是几种方案：

| 方案 | 模型 | 维度 | 适用场景 | 部署方式 |
|------|------|------|----------|----------|
| DeepSeek Embeddings | deepseek-chat | 1536 | 通用语义检索 | API |
| BGE-M3 | BAAI/bge-m3 | 1024 | 多语言检索 | 本地/API |
| text2vec-large-chinese | 大模型 | 1024 | 中文优化 | 本地 |
| OpenAI Ada-002 | text-embedding-3 | 1536 | 英文为主 | API |

对于中文知识图谱场景，推荐使用 DeepSeek 自带的嵌入接口或 BGE-M3：

```python
def get_embedding_bge(text: str) -> List[float]:
    """使用 BGE-M3 生成嵌入向量（本地部署）"""
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("BAAI/bge-m3")
    return model.encode(text).tolist()

def batch_embed_nodes(driver, batch_size: int = 100):
    """批量更新节点的嵌入向量"""
    with driver.session() as session:
        # 获取所有需要嵌入的节点
        nodes = session.run(
            "MATCH (n:Entity) WHERE n.embedding IS NULL RETURN n"
        ).data()

        for i in range(0, len(nodes), batch_size):
            batch = nodes[i:i + batch_size]
            for record in batch:
                node = record["n"]
                text = f"{node.get('name', '')} {node.get('description', '')}"
                embedding = get_embedding_bge(text)

                session.run(
                    "MATCH (n) WHERE elementId(n) = $id SET n.embedding = $emb",
                    id=node.element_id,
                    emb=embedding
                )
```

### 13.6.3 混合搜索实现

混合搜索（Hybrid Search）结合了向量语义搜索和关键词精确搜索，是知识图谱检索的最佳实践：

```python
def hybrid_search(
    query: str,
    top_k: int = 10,
    alpha: float = 0.5
) -> List[Dict[str, Any]]:
    """
    混合搜索：结合向量搜索和关键词搜索
    alpha: 向量搜索权重 (0-1)，1为纯向量搜索，0为纯关键词搜索
    """
    query_embedding = get_embedding(query)

    with engine.driver.session() as session:
        # 向量搜索
        vector_results = session.run(
            """
            CALL db.index.vector.queryNodes('entity_embeddings', $top_k, $embedding)
            YIELD node, score
            RETURN node.name AS name, node.description AS description,
                   score AS vector_score, elementId(node) AS node_id
            """,
            top_k=top_k,
            embedding=query_embedding
        ).data()

        # 关键词搜索（使用 Neo4j 全文索引）
        keyword_results = session.run(
            """
            CALL db.index.fulltext.queryNodes('entity_fulltext', $query)
            YIELD node, score
            RETURN node.name AS name, node.description AS description,
                   score AS text_score, elementId(node) AS node_id
            """,
            query=query
        ).data()

    # 合并结果（加权融合）
    scores = {}
    for r in vector_results:
        scores[r["node_id"]] = {
            "name": r["name"],
            "description": r["description"],
            "score": alpha * r["vector_score"]
        }

    for r in keyword_results:
        nid = r["node_id"]
        if nid in scores:
            scores[nid]["score"] += (1 - alpha) * r["text_score"]
        else:
            scores[nid] = {
                "name": r["name"],
                "description": r["description"],
                "score": (1 - alpha) * r["text_score"]
            }

    # 按加权分数排序
    sorted_results = sorted(
        scores.values(),
        key=lambda x: x["score"],
        reverse=True
    )

    return sorted_results[:top_k]
```

### 13.6.4 语义缓存

语义缓存（Semantic Caching）是一种优化策略：对于语义相似的重复查询，直接返回缓存结果，避免重复的 LLM 调用和图查询：

```python
import hashlib
import json
from datetime import datetime, timedelta

class SemanticCache:
    def __init__(self, similarity_threshold: float = 0.92):
        self.threshold = similarity_threshold
        self.cache = {}  # embedding_hash -> {result, timestamp}

    def _get_embedding(self, text: str) -> List[float]:
        return get_embedding(text)

    def _embedding_hash(self, embedding: List[float]) -> str:
        return hashlib.md5(
            np.array(embedding, dtype=np.float32).tobytes()
        ).hexdigest()

    def get(self, query: str) -> Dict[str, Any] | None:
        query_emb = self._get_embedding(query)
        query_hash = self._embedding_hash(query_emb)

        # 精确哈希匹配
        if query_hash in self.cache:
            entry = self.cache[query_hash]
            if datetime.now() - entry["timestamp"] < timedelta(hours=1):
                return entry["result"]

        # 语义相似度匹配
        for cached_hash, entry in self.cache.items():
            cached_emb = self._hash_to_embedding(cached_hash)
            similarity = cosine_similarity(query_emb, cached_emb)
            if similarity > self.threshold:
                if datetime.now() - entry["timestamp"] < timedelta(hours=1):
                    return entry["result"]

        return None

    def set(self, query: str, result: Dict[str, Any]):
        query_emb = self._get_embedding(query)
        query_hash = self._embedding_hash(query_emb)
        self.cache[query_hash] = {
            "result": result,
            "timestamp": datetime.now()
        }

    def cosine_similarity(self, a: List[float], b: List[float]) -> float:
        a_arr = np.array(a)
        b_arr = np.array(b)
        return np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr))
```

---

## 13.7 LangChain 集成

### 13.7.1 LangChain 与 Neo4j 的集成架构

LangChain 是目前最流行的 LLM 应用开发框架，提供了与 Neo4j 深度集成的模块。通过 LangChain，可以快速构建从自然语言到图查询的完整链路。

```
┌─────────────────────────────────────────────┐
│              LangChain 应用                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Chain    │ │ Agent    │ │ Tool         │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│       │            │              │          │
│  ┌────▼────────────▼──────────────▼───────┐  │
│  │        Neo4j 集成组件                    │  │
│  │  ┌────────────┐ ┌──────────────────┐   │  │
│  │  │ GraphCypher│ │ Neo4jVector      │   │  │
│  │  │ QAChain    │ │ Store            │   │  │
│  │  └────────────┘ └──────────────────┘   │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 13.7.2 GraphCypherQAChain

GraphCypherQAChain 是 LangChain 提供的核心组件，它将自然语言问题转换为 Cypher 查询，执行查询后使用 LLM 生成答案：

```python
from langchain_community.graphs import Neo4jGraph
from langchain.chains import GraphCypherQAChain
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
import os

# 连接 Neo4j
graph = Neo4jGraph(
    url="bolt://localhost:7687",
    username="neo4j",
    password="password"
)

# 配置 DeepSeek LLM
llm = ChatOpenAI(
    model="deepseek-chat",
    openai_api_key=os.getenv("DEEPSEEK_API_KEY"),
    openai_api_base="https://api.deepseek.com",
    temperature=0.1
)

# 自定义 Cypher 生成提示模板
cypher_prompt = PromptTemplate(
    template="""你是一个 Neo4j 专家。根据以下图模式，将用户问题转换为 Cypher 查询。

图模式：
{schema}

注意事项：
1. 只使用模式中存在的节点标签和关系类型
2. 使用 MERGE 而非 CREATE 避免重复
3. 对字符串值使用参数化查询
4. 如果问题涉及模糊匹配，使用 CONTAINS 或 STARTS WITH

用户问题：{question}

Cypher 查询：""",
    input_variables=["schema", "question"]
)

# 创建 QA Chain
chain = GraphCypherQAChain.from_llm(
    llm=llm,
    graph=graph,
    cypher_prompt=cypher_prompt,
    verbose=True,
    validate_cypher=True,
    top_k=10,
    return_direct=False,
    exclude_types=["Embedding"]  # 排除向量嵌入节点
)

# 执行查询
result = chain.invoke({"query": "华为的主要竞争对手有哪些？"})
print(result)
```

### 13.7.3 Neo4jVector 向量存储

LangChain 的 Neo4jVector 模块将 Neo4j 作为向量存储使用，支持完整的向量检索功能：

```python
from langchain_community.vectorstores import Neo4jVector
from langchain_openai import OpenAIEmbeddings

# 使用 DeepSeek 嵌入
class DeepSeekEmbeddings:
    def __init__(self):
        self.client = OpenAI(
            api_key=os.getenv("DEEPSEEK_API_KEY"),
            base_url="https://api.deepseek.com"
        )

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        embeddings = []
        for text in texts:
            response = self.client.embeddings.create(
                model="deepseek-chat",
                input=text
            )
            embeddings.append(response.data[0].embedding)
        return embeddings

    def embed_query(self, text: str) -> List[float]:
        response = self.client.embeddings.create(
            model="deepseek-chat",
            input=text
        )
        return response.data[0].embedding

# 创建向量存储
vector_store = Neo4jVector.from_documents(
    documents=documents,
    embedding=DeepSeekEmbeddings(),
    url="bolt://localhost:7687",
    username="neo4j",
    password="password",
    index_name="deepseek_vector_index",
    node_label="Chunk",
    embedding_node_property="embedding",
    text_node_property="text",
    create_id_index=True
)

# 相似度检索
results = vector_store.similarity_search(
    "华为的芯片战略是什么？",
    k=5
)

# 带分数的检索
results_with_score = vector_store.similarity_search_with_score(
    "华为的芯片战略是什么？",
    k=5
)
```

### 13.7.4 Graph Agent 实现

使用 LangChain Agent 实现更复杂的图查询逻辑，支持多步推理和工具调用：

```python
from langchain.agents import AgentExecutor, create_react_agent
from langchain.tools import Tool
from langchain.prompts import ChatPromptTemplate

# 定义工具
def query_graph(cypher: str) -> str:
    """执行 Cypher 查询并返回结果"""
    with graph._driver.session() as session:
        result = session.run(cypher)
        return str([record.data() for record in result])

def vector_search(query: str) -> str:
    """向量语义搜索"""
    results = vector_store.similarity_search(query, k=3)
    return str([r.page_content for r in results])

def get_schema(_: str) -> str:
    """获取图数据库模式"""
    return graph.get_schema

tools = [
    Tool(
        name="query_graph",
        func=query_graph,
        description="执行 Cypher 查询，输入是合法的 Cypher 语句"
    ),
    Tool(
        name="vector_search",
        func=vector_search,
        description="语义搜索，输入是自然语言查询"
    ),
    Tool(
        name="get_schema",
        func=get_schema,
        description="获取图数据库的模式信息"
    )
]

# 创建 Agent
prompt = ChatPromptTemplate.from_messages([
    ("system", """你是一个知识图谱专家助手。你可以使用以下工具回答用户问题：
1. query_graph: 执行精确的 Cypher 查询
2. vector_search: 进行语义搜索
3. get_schema: 查看图模式

请根据问题选择合适的工具。对于需要多步推理的复杂问题，请分步使用工具。"""),
    ("user", "{input}"),
    ("assistant", "{agent_scratchpad}")
])

agent = create_react_agent(
    llm=llm,
    tools=tools,
    prompt=prompt
)

agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=5,
    handle_parsing_errors=True
)

# 执行复杂查询
result = agent_executor.invoke({
    "input": "找出华为在通信领域的竞争对手，以及这些竞争对手在AI领域的合作伙伴"
})
print(result["output"])
```

### 13.7.5 流式输出

对于需要实时交互的应用，DeepSeek 支持流式输出，结合 Neo4j 的图查询可以实现流式问答：

```python
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler

streaming_llm = ChatOpenAI(
    model="deepseek-chat",
    openai_api_key=os.getenv("DEEPSEEK_API_KEY"),
    openai_api_base="https://api.deepseek.com",
    streaming=True,
    callbacks=[StreamingStdOutCallbackHandler()],
    temperature=0.3
)

streaming_chain = GraphCypherQAChain.from_llm(
    llm=streaming_llm,
    graph=graph,
    verbose=True,
    return_intermediate_steps=True
)

# 流式输出答案
result = streaming_chain.invoke({"query": "请详细分析华为的全球供应链布局"})
```

---

## 13.8 实战案例：企业知识图谱智能问答系统

### 13.8.1 系统设计

本节构建一个完整的企业知识图谱智能问答系统，涵盖从数据建模到部署的全流程。

**系统架构：**

```
┌─────────────────────────────────────────────────────┐
│                   前端 (Streamlit)                     │
│  对话界面 │ 知识可视化 │ 查询历史 │ 反馈机制          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  后端 API (FastAPI)                  │
│  /chat │ /query │ /graph │ /feedback │ /ingest      │
└──────┬──────────────┬──────────────┬────────────────┘
       │              │              │
┌──────▼────┐ ┌──────▼────┐ ┌──────▼────────────────┐
│ DeepSeek  │ │ LangChain │ │ Neo4j                │
│ API       │ │ Agent     │ │ 图数据库 + 向量索引    │
└───────────┘ └───────────┘ └───────────────────────┘
```

### 13.8.2 数据模型设计

```cypher
// 企业知识图谱数据模型
// 节点类型
CREATE CONSTRAINT company_name IF NOT EXISTS FOR (c:Company) REQUIRE c.name IS UNIQUE;
CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE;
CREATE CONSTRAINT product_name IF NOT EXISTS FOR (p:Product) REQUIRE p.name IS UNIQUE;

// 创建示例数据
CREATE (hw:Company {
    name: "华为技术有限公司",
    short_name: "华为",
    industry: "信息与通信技术",
    founded: 1987,
    headquarters: "深圳",
    revenue: 8621,
    revenue_year: 2024,
    employees: 207000,
    description: "全球领先的信息与通信技术解决方案提供商"
})

CREATE (zx:Company {
    name: "中兴通讯股份有限公司",
    short_name: "中兴",
    industry: "信息与通信技术",
    founded: 1985,
    headquarters: "深圳",
    revenue: 1243,
    revenue_year: 2024,
    employees: 75000,
    description: "综合通信信息解决方案提供商"
})

CREATE (hisilicon:Company {
    name: "海思半导体",
    short_name: "海思",
    industry: "半导体设计",
    founded: 2004,
    headquarters: "深圳",
    description: "华为旗下的半导体设计公司"
})

CREATE (tsmc:Company {
    name: "台积电",
    short_name: "TSMC",
    industry: "半导体制造",
    founded: 1987,
    headquarters: "新竹",
    revenue: 693,
    revenue_year: 2024,
    description: "全球最大的半导体代工厂"
})

CREATE (kirin:Product {
    name: "麒麟芯片",
    category: "移动处理器",
    description: "华为海思设计的旗舰移动处理器系列"
})

CREATE (ascend:Product {
    name: "昇腾AI芯片",
    category: "AI加速器",
    description: "华为海思设计的AI训练和推理芯片"
})

// 创建关系
CREATE (hw)-[:SUBSIDIARY_OF]->(hisilicon)
CREATE (hisilicon)-[:DEVELOPS]->(kirin)
CREATE (hisilicon)-[:DEVELOPS]->(ascend)
CREATE (hisilicon)-[:PARTNERS_WITH {type: "代工"}]->(tsmc)
CREATE (hw)-[:COMPETES_WITH]->(zx)
CREATE (zx)-[:COMPETES_WITH]->(hw)
```

### 13.8.3 完整问答系统实现

```python
# app.py - 企业知识图谱问答系统
import streamlit as st
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json
import os
from neo4j import GraphDatabase
from openai import OpenAI
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============ 配置 ============
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "your-api-key")
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

# ============ 数据模型 ============
class QueryRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    use_graph: bool = True
    use_vector: bool = True

class QueryResponse(BaseModel):
    answer: str
    evidence: List[dict]
    cypher_query: Optional[str] = None
    confidence: float

class FeedbackRequest(BaseModel):
    session_id: str
    question: str
    answer: str
    rating: int
    comment: Optional[str] = None

# ============ 核心引擎 ============
class EnterpriseKGEngine:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
        )
        self.llm = OpenAI(
            api_key=DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com"
        )
        self.schema = self._get_schema()

    def _get_schema(self) -> str:
        with self.driver.session() as session:
            result = session.run("CALL db.schema.visualization()")
            return str(result.data())

    def _generate_cypher(self, question: str) -> str:
        prompt = f"""你是一个 Neo4j Cypher 专家。根据以下图模式，将问题转换为 Cypher 查询。

图模式：
{self.schema}

问题：{question}

要求：
- 只使用模式中存在的标签和关系
- 对字符串值使用参数化查询
- 如果涉及模糊匹配，使用 CONTAINS
- 返回结果限制在 20 条以内

Cypher 查询："""

        response = self.llm.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=500
        )
        return response.choices[0].message.content.strip()

    def _execute_cypher(self, query: str) -> List[dict]:
        with self.driver.session() as session:
            result = session.run(query)
            return [record.data() for record in result]

    def _vector_search(self, question: str, top_k: int = 5) -> List[dict]:
        response = self.llm.embeddings.create(
            model="deepseek-chat",
            input=question
        )
        embedding = response.data[0].embedding

        with self.driver.session() as session:
            result = session.run(
                """
                CALL db.index.vector.queryNodes('entity_embeddings', $top_k, $embedding)
                YIELD node, score
                RETURN node.name AS name, labels(node) AS labels,
                       node.description AS description, score
                """,
                top_k=top_k,
                embedding=embedding
            )
            return [record.data() for record in result]

    def _generate_answer(
        self,
        question: str,
        graph_results: List[dict],
        vector_results: List[dict]
    ) -> str:
        context_parts = []

        if graph_results:
            context_parts.append(
                f"图查询结果：\n{json.dumps(graph_results, ensure_ascii=False, indent=2)}"
            )

        if vector_results:
            context_parts.append(
                f"语义检索结果：\n{json.dumps(vector_results, ensure_ascii=False, indent=2)}"
            )

        context = "\n\n".join(context_parts)

        prompt = f"""你是一个企业知识图谱问答助手。基于以下检索结果回答用户问题。

{context}

用户问题：{question}

回答要求：
1. 优先使用图查询结果中的结构化数据
2. 语义检索结果作为补充
3. 如果信息不足，明确说明
4. 给出具体的数字和事实
5. 保持回答简洁专业"""

        response = self.llm.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000
        )
        return response.choices[0].message.content

    def query(self, request: QueryRequest) -> QueryResponse:
        graph_results = []
        cypher_query = None

        if request.use_graph:
            try:
                cypher_query = self._generate_cypher(request.question)
                graph_results = self._execute_cypher(cypher_query)
                logger.info(f"Cypher: {cypher_query}")
                logger.info(f"Results: {len(graph_results)} rows")
            except Exception as e:
                logger.error(f"Graph query failed: {e}")

        vector_results = []
        if request.use_vector:
            try:
                vector_results = self._vector_search(request.question)
                logger.info(f"Vector results: {len(vector_results)} rows")
            except Exception as e:
                logger.error(f"Vector search failed: {e}")

        answer = self._generate_answer(
            request.question, graph_results, vector_results
        )

        evidence = graph_results + vector_results
        confidence = min(0.95, 0.5 + 0.1 * len(graph_results) + 0.05 * len(vector_results))

        return QueryResponse(
            answer=answer,
            evidence=evidence[:10],
            cypher_query=cypher_query,
            confidence=confidence
        )

    def close(self):
        self.driver.close()


# ============ FastAPI 应用 ============
app = FastAPI(title="企业知识图谱问答系统")
engine = EnterpriseKGEngine()

@app.post("/chat", response_model=QueryResponse)
async def chat(request: QueryRequest):
    try:
        return engine.query(request)
    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/feedback")
async def feedback(request: FeedbackRequest):
    # 存储反馈用于模型改进
    with engine.driver.session() as session:
        session.run(
            """
            CREATE (f:Feedback {
                session_id: $session_id,
                question: $question,
                answer: $answer,
                rating: $rating,
                comment: $comment,
                created_at: datetime()
            })
            """,
            session_id=request.session_id,
            question=request.question,
            answer=request.answer,
            rating=request.rating,
            comment=request.comment
        )
    return {"status": "ok"}

@app.on_event("shutdown")
def shutdown():
    engine.close()


# ============ Streamlit 前端 ============
def streamlit_ui():
    st.set_page_config(
        page_title="企业知识图谱智能问答",
        page_icon="🧠",
        layout="wide"
    )

    st.title("🧠 企业知识图谱智能问答系统")
    st.markdown("基于 Neo4j + DeepSeek 的智能知识问答")

    col1, col2 = st.columns([2, 1])

    with col1:
        st.subheader("对话")
        if "messages" not in st.session_state:
            st.session_state.messages = []

        for msg in st.session_state.messages:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])
                if "evidence" in msg:
                    with st.expander("查看证据"):
                        st.json(msg["evidence"])

        if prompt := st.chat_input("请输入您的问题..."):
            st.session_state.messages.append(
                {"role": "user", "content": prompt}
            )
            with st.chat_message("user"):
                st.markdown(prompt)

            with st.chat_message("assistant"):
                with st.spinner("正在查询知识图谱..."):
                    response = engine.query(QueryRequest(question=prompt))
                    st.markdown(response.answer)
                    if response.cypher_query:
                        with st.expander("Cypher 查询"):
                            st.code(response.cypher_query, language="cypher")
                    with st.expander("证据来源"):
                        st.json(response.evidence)

                st.session_state.messages.append({
                    "role": "assistant",
                    "content": response.answer,
                    "evidence": response.evidence
                })

    with col2:
        st.subheader("知识图谱概览")
        with engine.driver.session() as session:
            node_count = session.run(
                "MATCH (n) RETURN count(n) AS count"
            ).single()["count"]
            rel_count = session.run(
                "MATCH ()-[r]->() RETURN count(r) AS count"
            ).single()["count"]

        st.metric("实体数量", node_count)
        st.metric("关系数量", rel_count)

        st.subheader("系统配置")
        st.checkbox("启用图查询", value=True, key="use_graph")
        st.checkbox("启用向量检索", value=True, key="use_vector")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "api":
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8000)
    else:
        streamlit_ui()
```

### 13.8.4 部署与运行

```bash
# 1. 安装依赖
pip install neo4j openai langchain langchain-community \
            fastapi uvicorn streamlit pydantic

# 2. 设置环境变量
export DEEPSEEK_API_KEY="your-deepseek-api-key"
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="your-password"

# 3. 启动 API 服务
python app.py api

# 4. 启动前端（新终端）
streamlit run app.py
```

---

## 13.9 性能优化与最佳实践

### 13.9.1 查询优化

**Cypher 查询优化原则：**

1. **使用标签过滤**：始终在 MATCH 子句中指定节点标签，减少扫描范围
2. **限制路径长度**：使用可变长度路径时设置合理的上下界 `[*1..3]`
3. **利用索引**：为频繁查询的属性创建索引
4. **避免笛卡尔积**：多个 MATCH 子句可能导致笛卡尔积，使用 OPTIONAL MATCH 或子查询

```cypher
-- 优化前（全表扫描）
MATCH (n) WHERE n.name = '华为' RETURN n

-- 优化后（利用索引）
MATCH (n:Company {name: '华为'}) RETURN n
```

**向量检索优化：**

```python
def optimized_vector_search(
    query: str,
    top_k: int = 10,
    ef_search: int = 200  # HNSW 搜索宽度
) -> List[dict]:
    """优化后的向量检索"""
    embedding = get_embedding(query)

    with engine.driver.session() as session:
        # 使用索引提示和参数化查询
        result = session.run(
            """
            CALL db.index.vector.queryNodes(
                'entity_embeddings',
                $top_k,
                $embedding,
                {efSearch: $ef_search}
            )
            YIELD node, score
            RETURN node.name AS name,
                   node.description AS description,
                   score
            """,
            top_k=top_k,
            embedding=embedding,
            ef_search=ef_search
        )
        return result.data()
```

### 13.9.2 LLM 调用优化

**Prompt 缓存：**

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def get_cached_cypher(schema_hash: str, question: str) -> str:
    """缓存 NL2Cypher 结果"""
    return generate_cypher(question)
```

**批量处理：**

```python
async def batch_query(questions: List[str]) -> List[QueryResponse]:
    """批量处理多个查询"""
    import asyncio

    async def single_query(q: str) -> QueryResponse:
        return engine.query(QueryRequest(question=q))

    tasks = [single_query(q) for q in questions]
    return await asyncio.gather(*tasks)
```

### 13.9.3 成本控制

DeepSeek API 按 token 计费，以下策略可有效控制成本：

```python
class CostController:
    def __init__(self, max_tokens_per_query: int = 2000):
        self.max_tokens = max_tokens_per_query
        self.daily_budget = 10.0  # 每日预算（美元）
        self.daily_spent = 0.0

    def estimate_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        # DeepSeek 定价（示例）
        input_price = 0.0005 / 1000  # 每千 token
        output_price = 0.002 / 1000
        return (prompt_tokens * input_price +
                completion_tokens * output_price)

    def should_proceed(self, question: str) -> bool:
        if self.daily_spent >= self.daily_budget:
            logger.warning("每日预算已用尽")
            return False

        # 估算查询成本
        estimated_tokens = len(question) * 1.5
        cost = self.estimate_cost(estimated_tokens, 500)

        if self.daily_spent + cost > self.daily_budget:
            logger.warning("此查询将超出预算")
            return False

        return True
```

### 13.9.4 监控与可观测性

```python
import time
from prometheus_client import Counter, Histogram, Gauge

# 指标定义
query_counter = Counter(
    'kg_queries_total',
    'Total number of knowledge graph queries',
    ['query_type']
)

query_duration = Histogram(
    'kg_query_duration_seconds',
    'Query duration in seconds',
    ['query_type']
)

cache_hit_ratio = Gauge(
    'kg_cache_hit_ratio',
    'Cache hit ratio'
)

def monitored_query(question: str, query_type: str = "hybrid"):
    """带监控的查询"""
    start = time.time()
    query_counter.labels(query_type=query_type).inc()

    try:
        result = engine.query(QueryRequest(question=question))
        duration = time.time() - start
        query_duration.labels(query_type=query_type).observe(duration)
        return result
    except Exception as e:
        duration = time.time() - start
        query_duration.labels(query_type=query_type).observe(duration)
        raise
```

---

## 13.10 未来展望

### 13.10.1 图基础模型（Graph Foundation Model）

随着 DeepSeek 等大模型能力的持续提升，一个重要的研究方向是训练专门的"图基础模型"——能够原生理解图结构数据的 LLM。这类模型将不再需要 NL2Cypher 翻译步骤，而是直接在图结构上进行推理。

### 13.10.2 多模态知识图谱

未来的知识图谱将不仅包含文本和关系，还将集成图像、音频、视频等多模态数据。DeepSeek 的多模态能力（如 DeepSeek-VL）将能够直接理解图节点中的图像内容，实现"看图识关系"的智能检索。

### 13.10.3 自主知识进化

结合 DeepSeek 的推理能力和 Neo4j 的图存储，未来的系统将具备"自主知识进化"能力：系统自动发现知识图谱中的缺失和矛盾，主动从外部数据源补充知识，并通过图算法验证新知识的合理性。

### 13.10.4 Agent 协作网络

多个基于 Neo4j + DeepSeek 的智能 Agent 可以组成协作网络，每个 Agent 负责特定领域的知识图谱，通过图查询协议进行知识共享和协同推理，形成企业级的"知识联邦"。

---

## 13.11 本章小结

本章系统性地阐述了 Neo4j 与 DeepSeek 的集成架构，涵盖以下核心内容：

- **DeepSeek 模型能力**：V2/V3/R1 系列的技术特点、MoE 架构的经济性、API 访问方式
- **集成架构设计**：三明治架构模式、核心设计原则、完整数据流
- **Graph RAG 原理**：传统 RAG 的局限性、图增强检索的三大优势、三种实现模式
- **知识图谱作为外部记忆**：读写模式、更新策略、冲突解决
- **向量搜索与语义搜索**：Neo4j 向量索引、嵌入模型选择、混合搜索、语义缓存
- **LangChain 集成**：GraphCypherQAChain、Neo4jVector、Graph Agent、流式输出
- **实战案例**：企业知识图谱问答系统的完整实现
- **性能优化**：查询优化、成本控制、监控可观测性

Neo4j 与 DeepSeek 的集成代表了知识图谱与大语言模型融合的技术前沿。通过将图数据库的结构化存储能力与 LLM 的语义理解能力相结合，企业可以构建出既准确又灵活、既可追溯又可进化的新一代智能应用。随着 DeepSeek 模型的持续迭代和 Neo4j 图技术的不断演进，这一集成架构将在企业智能化转型中发挥越来越重要的作用。
