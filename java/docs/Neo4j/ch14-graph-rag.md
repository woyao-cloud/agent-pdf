# 第14章 图检索增强生成（Graph RAG）与数据分析：Neo4j + DeepSeek 实战

## 14.1 概述

大语言模型（LLM）在知识密集型任务中面临两个核心瓶颈：**知识截止日期**（模型训练数据存在时效性）和**幻觉问题**（模型可能生成看似合理但实际错误的内容）。检索增强生成（Retrieval-Augmented Generation, RAG）通过引入外部知识库来缓解这些问题，而**图数据库**（如 Neo4j）作为知识存储的载体，相比传统向量数据库具有结构化关系表达、多跳推理可追溯、支持复杂聚合查询等独特优势。

**Graph RAG** 将图数据库的结构化查询能力与 LLM 的语义理解能力相结合，形成"图检索 + 大模型生成"的协同架构。本章将以 Neo4j 为图存储引擎、DeepSeek 为生成模型，系统讲解 Graph RAG 的完整实现路径，涵盖数据建模、图构建、检索策略、提示工程以及金融、社交网络、供应链、异常检测四大分析场景。

### 14.1.1 技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| 图数据库 | Neo4j 5.x | 原生图存储，支持 Cypher 查询与 GDS 图算法库 |
| 嵌入模型 | text2vec-base-chinese / BGE | 中文文本向量化，用于语义检索 |
| 大语言模型 | DeepSeek (deepseek-chat) | 推理与生成，支持长上下文与工具调用 |
| 开发框架 | Python + LangChain / 原生驱动 | 编排检索与生成流程 |
| 向量索引 | Neo4j Vector Index | 基于 Lucene 的 HNSW 向量索引 |

### 14.1.2 架构总览

```
用户问题
    │
    ▼
┌─────────────────────────────┐
│  问题理解与路由              │
│  (DeepSeek 分类 + 实体抽取)  │
└──────────┬──────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌─────────┐ ┌──────────┐
│ 向量检索 │ │ 图结构检索 │
│ (语义)   │ │ (Cypher)  │
└────┬────┘ └─────┬────┘
     │            │
     └──────┬─────┘
            ▼
┌─────────────────────────────┐
│  检索结果融合与重排序       │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  DeepSeek 生成最终答案      │
│  (带上下文 + 图证据)        │
└─────────────────────────────┘
```

---

## 14.2 数据准备与图构建

### 14.2.1 数据建模原则

图数据建模的核心是回答"业务问题需要怎样的遍历路径"。以金融风控场景为例：

- **节点类型**：客户（Customer）、账户（Account）、交易（Transaction）、设备（Device）、地理位置（Location）
- **关系类型**：`[:OWNS]`（拥有账户）、`[:TRANSFERRED_TO]`（转账）、`[:USED_DEVICE]`（使用设备）、`[:LOCATED_AT]`（位于）

建模时遵循以下原则：

1. **以查询为中心**：从最频繁的查询模式反推模型结构
2. **避免过度建模**：不要为每个属性创建节点，除非需要多跳遍历
3. **利用关系属性**：金额、时间戳等应作为关系属性而非中间节点
4. **适度冗余**：高频查询路径可添加直接关系以跳过中间节点

### 14.2.2 数据导入：从 CSV 到图

以下代码演示从 CSV 文件批量导入交易数据并构建图结构：

```python
import pandas as pd
from neo4j import GraphDatabase
from typing import List, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Neo4jGraphBuilder:
    """Neo4j 图数据构建器"""

    def __init__(self, uri: str, user: str, password: str):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def _run(self, query: str, params: Dict = None):
        with self.driver.session() as session:
            return session.run(query, params or {})

    def create_constraints_and_indexes(self):
        """创建约束与索引"""
        constraints = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Customer) REQUIRE c.customer_id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (a:Account) REQUIRE a.account_id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (t:Transaction) REQUIRE t.tx_id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Device) REQUIRE d.device_id IS UNIQUE",
        ]
        for c in constraints:
            self._run(c)
            logger.info(f"约束已创建: {c[:60]}...")

        # 为常用属性创建索引以加速查询
        indexes = [
            "CREATE INDEX IF NOT EXISTS FOR (t:Transaction) ON (t.amount)",
            "CREATE INDEX IF NOT EXISTS FOR (t:Transaction) ON (t.timestamp)",
            "CREATE INDEX IF NOT EXISTS FOR (c:Customer) ON (c.risk_level)",
        ]
        for idx in indexes:
            self._run(idx)

    def import_customers(self, csv_path: str):
        """导入客户数据"""
        df = pd.read_csv(csv_path)
        logger.info(f"导入 {len(df)} 条客户记录")
        query = """
        UNWIND $rows AS row
        MERGE (c:Customer {customer_id: row.customer_id})
        SET c.name = row.name,
            c.age = row.age,
            c.risk_level = row.risk_level,
            c.phone = row.phone,
            c.email = row.email,
            c.registered_at = datetime(row.registered_at)
        """
        self._run(query, {"rows": df.to_dict("records")})

    def import_transactions(self, csv_path: str):
        """导入交易数据并构建关系"""
        df = pd.read_csv(csv_path)
        logger.info(f"导入 {len(df)} 条交易记录")
        query = """
        UNWIND $rows AS row
        MERGE (t:Transaction {tx_id: row.tx_id})
        SET t.amount = row.amount,
            t.timestamp = datetime(row.timestamp),
            t.type = row.type,
            t.status = row.status,
            t.currency = row.currency

        WITH t, row
        MATCH (from:Account {account_id: row.from_account})
        MATCH (to:Account {account_id: row.to_account})
        MERGE (from)-[r:TRANSFERRED_TO {tx_id: row.tx_id}]->(to)
        SET r.amount = row.amount,
            r.timestamp = datetime(row.timestamp)
        """
        self._run(query, {"rows": df.to_dict("records")})

    def link_customer_account(self, csv_path: str):
        """关联客户与账户"""
        df = pd.read_csv(csv_path)
        query = """
        UNWIND $rows AS row
        MATCH (c:Customer {customer_id: row.customer_id})
        MATCH (a:Account {account_id: row.account_id})
        MERGE (c)-[:OWNS {since: datetime(row.since)}]->(a)
        """
        self._run(query, {"rows": df.to_dict("records")})

    def build_graph_pipeline(self, config: Dict[str, str]):
        """完整图构建流水线"""
        logger.info("=== 开始图构建流水线 ===")
        self.create_constraints_and_indexes()
        self.import_customers(config["customers_csv"])
        self.import_transactions(config["transactions_csv"])
        self.link_customer_account(config["ownership_csv"])
        logger.info("=== 图构建完成 ===")

    def get_graph_statistics(self) -> Dict[str, Any]:
        """获取图统计信息"""
        queries = {
            "node_count": "MATCH (n) RETURN count(n) AS count",
            "rel_count": "MATCH ()-[r]->() RETURN count(r) AS count",
            "label_distribution": """
                MATCH (n)
                RETURN labels(n) AS label, count(*) AS count
                ORDER BY count DESC
            """,
            "degree_distribution": """
                MATCH (n)
                RETURN labels(n) AS label,
                       avg(apoc.node.degree(n, 'ALL')) AS avg_degree,
                       max(apoc.node.degree(n, 'ALL')) AS max_degree
            """,
        }
        stats = {}
        for name, query in queries.items():
            result = self._run(query)
            stats[name] = [r.data() for r in result]
        return stats


# 使用示例
if __name__ == "__main__":
    builder = Neo4jGraphBuilder("bolt://localhost:7687", "neo4j", "password")
    config = {
        "customers_csv": "data/customers.csv",
        "transactions_csv": "data/transactions.csv",
        "ownership_csv": "data/ownership.csv",
    }
    builder.build_graph_pipeline(config)
    stats = builder.get_graph_statistics()
    print(stats)
    builder.close()
```

### 14.2.3 向量索引创建

为支持语义检索，需要为图中的文本属性创建向量索引：

```python
def create_vector_index(driver, index_name: str = "entity_embeddings",
                        dimension: int = 768, similarity: str = "cosine"):
    """创建 Neo4j 向量索引"""
    query = f"""
    CREATE VECTOR INDEX {index_name} IF NOT EXISTS
    FOR (n:Entity) ON (n.embedding)
    OPTIONS {{
        indexConfig: {{
            `vector.dimensions`: {dimension},
            `vector.similarity_function`: '{similarity}'
        }}
    }}
    """
    with driver.session() as session:
        session.run(query)
    logger.info(f"向量索引 {index_name} 已创建 (维度={dimension}, 相似度={similarity})")


def embed_and_store(driver, nodes: List[Dict], embed_func):
    """为节点生成嵌入并存储到图数据库"""
    query = """
    UNWIND $nodes AS node
    MATCH (n) WHERE elementId(n) = node.id
    SET n.embedding = node.embedding,
        n.embedding_text = node.text
    """
    batch_size = 100
    for i in range(0, len(nodes), batch_size):
        batch = nodes[i:i + batch_size]
        texts = [n["text"] for n in batch]
        embeddings = embed_func(texts)
        for j, emb in enumerate(embeddings):
            batch[j]["embedding"] = emb
        with driver.session() as session:
            session.run(query, {"nodes": batch})
        logger.info(f"已存储第 {i}-{i+len(batch)} 个节点的嵌入")
```

---

## 14.3 检索策略设计

Graph RAG 的检索策略决定了最终生成质量的上限。本节介绍三种核心检索模式及其组合策略。

### 14.3.1 向量语义检索

向量检索用于找到与问题语义最接近的图节点，适合"模糊匹配"场景：

```python
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass, field

@dataclass
class RetrievedContext:
    """检索结果的数据结构"""
    nodes: List[Dict] = field(default_factory=list)
    relationships: List[Dict] = field(default_factory=list)
    paths: List[List[Dict]] = field(default_factory=list)
    subgraph_cypher: Optional[str] = None


class VectorRetriever:
    """基于向量索引的语义检索器"""

    def __init__(self, driver, embed_model):
        self.driver = driver
        self.embed_model = embed_model

    def search(self, query_text: str, top_k: int = 10,
               label_filter: str = None) -> List[Dict]:
        """向量相似度搜索"""
        query_emb = self.embed_model.embed_query(query_text)

        cypher = """
        CALL db.index.vector.queryNodes('entity_embeddings', $top_k, $embedding)
        YIELD node, score
        """
        if label_filter:
            cypher += f" WHERE '{label_filter}' IN labels(node)"
        cypher += """
        RETURN elementId(node) AS id,
               labels(node) AS labels,
               node.embedding_text AS text,
               score
        ORDER BY score DESC
        """
        with self.driver.session() as session:
            result = session.run(cypher, {
                "top_k": top_k,
                "embedding": query_emb.tolist(),
            })
            return [r.data() for r in result]

    def search_with_context(self, query_text: str, top_k: int = 5,
                            hop: int = 1) -> RetrievedContext:
        """向量检索 + 邻域扩展"""
        seed_nodes = self.search(query_text, top_k)
        node_ids = [n["id"] for n in seed_nodes]

        context = RetrievedContext(nodes=seed_nodes)

        if not node_ids:
            return context

        # 扩展邻域
        expand_query = f"""
        MATCH (n) WHERE elementId(n) IN $ids
        OPTIONAL MATCH (n)-[r]-(neighbor)
        RETURN elementId(n) AS source_id,
               labels(n) AS source_labels,
               n.embedding_text AS source_text,
               type(r) AS rel_type,
               elementId(neighbor) AS neighbor_id,
               labels(neighbor) AS neighbor_labels,
               neighbor.embedding_text AS neighbor_text
        LIMIT 200
        """
        with self.driver.session() as session:
            result = session.run(expand_query, {"ids": node_ids})
            for record in result:
                context.relationships.append(record.data())

        return context
```

### 14.3.2 图结构检索（Cypher 路径查询）

图结构检索通过 Cypher 查询精确匹配图模式，适合"精确推理"场景：

```python
class GraphStructureRetriever:
    """基于 Cypher 的图结构检索器"""

    def __init__(self, driver):
        self.driver = driver

    def find_paths_between(self, start_id: str, end_id: str,
                           max_hops: int = 4) -> List[Dict]:
        """查找两点之间的所有路径"""
        query = f"""
        MATCH path = shortestPath(
            (start) WHERE elementId(start) = $start_id
            -[*..{max_hops}]-
            (end) WHERE elementId(end) = $end_id
        )
        RETURN [n IN nodes(path) | {{
            id: elementId(n),
            labels: labels(n),
            properties: properties(n)
        }}] AS nodes,
        [r IN relationships(path) | {{
            type: type(r),
            properties: properties(r)
        }}] AS relationships,
        length(path) AS path_length
        """
        with self.driver.session() as session:
            result = session.run(query, {
                "start_id": start_id,
                "end_id": end_id,
            })
            return [r.data() for r in result]

    def find_k_hop_neighborhood(self, node_id: str, k: int = 2) -> RetrievedContext:
        """查找节点的 K 跳邻域"""
        query = f"""
        MATCH (center) WHERE elementId(center) = $node_id
        OPTIONAL MATCH path = (center)-[*..{k}]-(neighbor)
        RETURN [n IN nodes(path) | {{
            id: elementId(n),
            labels: labels(n),
            properties: properties(n)
        }}] AS path_nodes,
        [r IN relationships(path) | {{
            type: type(r),
            properties: properties(r)
        }}] AS path_rels
        """
        with self.driver.session() as session:
            result = session.run(query, {"node_id": node_id})
            records = [r.data() for r in result]

        context = RetrievedContext()
        seen_nodes = set()
        seen_rels = set()

        for rec in records:
            for n in rec.get("path_nodes", []):
                if n["id"] not in seen_nodes:
                    context.nodes.append(n)
                    seen_nodes.add(n["id"])
            for r in rec.get("path_rels", []):
                key = (r["type"], str(r.get("properties", {})))
                if key not in seen_rels:
                    context.relationships.append(r)
                    seen_rels.add(key)

        return context

    def find_pattern(self, pattern_cypher: str, params: Dict = None) -> List[Dict]:
        """执行自定义图模式查询"""
        with self.driver.session() as session:
            result = session.run(pattern_cypher, params or {})
            return [r.data() for r in result]

    def suspicious_flow_pattern(self, amount_threshold: float = 100000,
                                time_window_hours: int = 24) -> List[Dict]:
        """可疑资金流转模式：大额资金在短时间内经过多层账户"""
        query = """
        MATCH path = (a:Account)-[t1:TRANSFERRED_TO]->(b:Account)
                      -[t2:TRANSFERRED_TO]->(c:Account)
        WHERE t1.amount >= $threshold
          AND t2.amount >= $threshold
          AND abs(duration.inSeconds(t1.timestamp, t2.timestamp).seconds)
              <= $window_seconds
        RETURN elementId(a) AS a_id, elementId(b) AS b_id, elementId(c) AS c_id,
               t1.amount AS t1_amount, t2.amount AS t2_amount,
               t1.timestamp AS t1_time, t2.timestamp AS t2_time,
               (t1.amount + t2.amount) AS total_flow
        ORDER BY total_flow DESC
        LIMIT 50
        """
        params = {
            "threshold": amount_threshold,
            "window_seconds": time_window_hours * 3600,
        }
        return self.find_pattern(query, params)
```

### 14.3.3 混合检索策略

实际生产环境中，单一检索策略往往不够。混合检索将向量语义检索与图结构检索结合：

```python
class HybridRetriever:
    """混合检索器：向量语义 + 图结构"""

    def __init__(self, vector_retriever: VectorRetriever,
                 graph_retriever: GraphStructureRetriever):
        self.vector_retriever = vector_retriever
        self.graph_retriever = graph_retriever

    def retrieve(self, question: str, strategy: str = "auto",
                 top_k: int = 5) -> RetrievedContext:
        """
        根据问题类型自动选择检索策略

        strategy:
          - "auto": 自动判断
          - "vector": 仅向量检索
          - "graph": 仅图结构检索
          - "hybrid": 两者结合
        """
        if strategy == "auto":
            strategy = self._classify_question(question)

        context = RetrievedContext()

        if strategy in ("vector", "hybrid"):
            vec_context = self.vector_retriever.search_with_context(
                question, top_k=top_k, hop=1
            )
            context.nodes.extend(vec_context.nodes)
            context.relationships.extend(vec_context.relationships)

        if strategy in ("graph", "hybrid"):
            # 从问题中提取实体，然后进行图检索
            entities = self._extract_entities(question)
            for entity in entities:
                graph_context = self.graph_retriever.find_k_hop_neighborhood(
                    entity["id"], k=2
                )
                context.nodes.extend(graph_context.nodes)
                context.relationships.extend(graph_context.relationships)

        # 去重
        context.nodes = self._deduplicate(context.nodes, "id")
        context.relationships = self._deduplicate(
            context.relationships,
            lambda r: (r.get("type"), str(r.get("properties", {})))
        )

        # 生成子图 Cypher 供 LLM 参考
        context.subgraph_cypher = self._build_subgraph_cypher(context)

        return context

    def _classify_question(self, question: str) -> str:
        """基于关键词判断问题类型"""
        graph_keywords = [
            "路径", "关系", "关联", "网络", "链条", "上下游",
            "最短", "连通", "层次", "结构", "模式", "环路",
            "path", "route", "connection", "network", "chain",
        ]
        vector_keywords = [
            "相似", "类似", "相关", "推荐", "匹配", "最近",
            "similar", "recommend", "match", "near",
        ]

        q_lower = question.lower()
        has_graph = any(kw in q_lower for kw in graph_keywords)
        has_vector = any(kw in q_lower for kw in vector_keywords)

        if has_graph and not has_vector:
            return "graph"
        elif has_vector and not has_graph:
            return "vector"
        else:
            return "hybrid"

    def _extract_entities(self, question: str) -> List[Dict]:
        """从问题中提取实体（可对接 NER 模型或 DeepSeek）"""
        # 简化实现：使用正则或关键词匹配
        # 生产环境应使用 DeepSeek 或专门的 NER 模型
        return []

    def _deduplicate(self, items: List[Dict], key_fn) -> List[Dict]:
        seen = set()
        result = []
        for item in items:
            k = key_fn(item) if callable(key_fn) else item.get(key_fn)
            if k not in seen:
                seen.add(k)
                result.append(item)
        return result

    def _build_subgraph_cypher(self, context: RetrievedContext) -> str:
        """从检索结果生成子图 Cypher 语句（供 LLM 理解图结构）"""
        if not context.nodes:
            return ""

        node_ids = [n["id"] for n in context.nodes[:20]]
        cypher = f"""
        // 检索到的子图（{len(context.nodes)} 个节点, {len(context.relationships)} 条关系）
        MATCH (n) WHERE elementId(n) IN $node_ids
        OPTIONAL MATCH (n)-[r]-(m) WHERE elementId(m) IN $node_ids
        RETURN n, r, m
        """
        return cypher
```

### 14.3.4 检索结果重排序

检索到的上下文需要按相关性重排序，以控制输入到 LLM 的上下文长度：

```python
class ContextReRanker:
    """基于交叉编码器的检索结果重排序"""

    def __init__(self, model_name: str = "BAAI/bge-reranker-v2-m3"):
        # 实际使用时加载交叉编码器模型
        # self.model = CrossEncoder(model_name)
        pass

    def rerank(self, question: str, contexts: List[Dict],
               top_k: int = 5) -> List[Dict]:
        """对检索结果进行重排序"""
        # 构建 (question, text) 对
        pairs = []
        for ctx in contexts:
            text = ctx.get("text") or ctx.get("source_text", "")
            pairs.append((question, text))

        # 使用模型计算相关性分数
        # scores = self.model.predict(pairs)

        # 简化实现：按原始分数排序
        scored = list(zip(contexts, [1.0] * len(contexts)))
        scored.sort(key=lambda x: x[1], reverse=True)

        return [ctx for ctx, _ in scored[:top_k]]
```

---

## 14.4 DeepSeek 提示工程

提示工程是 Graph RAG 系统的关键环节。DeepSeek 模型（特别是 deepseek-chat 和 deepseek-reasoner）对结构化输入有良好的理解能力，但需要精心设计的提示模板来发挥图检索的优势。

### 14.4.1 提示设计原则

1. **上下文结构化**：将图检索结果以结构化格式呈现，而非纯文本段落
2. **证据可追溯**：要求模型在答案中引用具体的图节点或关系
3. **分步推理**：引导模型先分析图结构，再生成答案
4. **约束明确**：明确告知模型"仅基于提供的数据回答"

### 14.4.2 核心提示模板

```python
class DeepSeekPromptTemplates:
    """DeepSeek 提示模板集合"""

    @staticmethod
    def graph_qa_system_prompt() -> str:
        return """你是一个基于图数据库的智能分析助手。你的知识来源仅限于下方提供的图数据上下文。

## 核心原则
1. 仅基于提供的图数据回答，不要编造不存在的关系或节点
2. 如果数据不足以回答问题，请明确说明
3. 在答案中引用具体的图元素（节点标签、关系类型、属性值）
4. 对于分析类问题，展示推理步骤

## 图数据格式说明
- 节点表示为: (标签 {属性键: 属性值})
- 关系表示为: (节点1)-[:关系类型 {属性}]->(节点2)
- 路径表示为多个连续的关系链
"""

    @staticmethod
    def graph_qa_user_prompt(question: str, context: RetrievedContext) -> str:
        """构建用户提示，包含图检索上下文"""
        # 格式化节点
        nodes_text = ""
        for n in context.nodes[:30]:
            labels = ", ".join(n.get("labels", ["Entity"]))
            props = n.get("properties", {})
            props_str = ", ".join(f"{k}: {v}" for k, v in props.items()
                                  if k != "embedding")
            nodes_text += f"- ({n.get('id', '?')[:8]} :{labels} {{{props_str}}})\n"

        # 格式化关系
        rels_text = ""
        for r in context.relationships[:30]:
            rel_type = r.get("type", "RELATED")
            props = r.get("properties", {})
            props_str = ", ".join(f"{k}: {v}" for k, v in props.items())
            rels_text += f"- [:${rel_type} {{{props_str}}}]\n"

        # 格式化路径
        paths_text = ""
        for i, path in enumerate(context.paths[:5]):
            path_str = " -> ".join(
                f"({p.get('labels', ['Node'])[0]})"
                for p in path
            )
            paths_text += f"路径{i + 1}: {path_str}\n"

        return f"""## 图数据上下文

### 相关节点（{len(context.nodes)} 个）
{nodes_text}

### 相关关系（{len(context.relationships)} 条）
{rels_text}

### 相关路径
{paths_text}

## 用户问题
{question}

## 回答要求
- 如果问题涉及路径分析，请描述完整的路径链条
- 如果问题涉及统计聚合，请给出具体数值
- 对于异常检测，请说明判断依据
- 使用中文回答
"""

    @staticmethod
    def analysis_system_prompt() -> str:
        return """你是一个数据分析专家，擅长从图数据中提取洞察。

## 分析能力
1. **模式识别**：识别图中的重复模式、环路、星型结构等
2. **异常检测**：发现偏离正常模式的节点或关系
3. **路径分析**：追踪实体间的关联路径
4. **社区发现**：识别紧密连接的节点群体
5. **中心性分析**：判断节点在图中的重要性

## 输出格式
- 分析结论：明确的判断结果
- 证据链：引用具体的图数据作为支撑
- 置信度：对分析结果的可信度评估（高/中/低）
- 建议：基于分析的可操作建议
"""

    @staticmethod
    def cypher_generation_prompt(question: str, schema: str) -> str:
        """生成 Cypher 查询的提示"""
        return f"""根据用户问题生成 Cypher 查询语句。

## 图模式
{schema}

## 用户问题
{question}

## 要求
- 只输出 Cypher 语句，不要额外解释
- 使用参数化查询（$param 格式）
- 添加 LIMIT 防止返回过多结果
- 确保语法与 Neo4j 5.x 兼容

Cypher:
"""

    @staticmethod
    def multi_hop_reasoning_prompt(question: str, paths: List[List[Dict]]) -> str:
        """多跳推理提示"""
        paths_text = ""
        for i, path in enumerate(paths):
            steps = []
            for step in path:
                if "source" in step:
                    steps.append(f"{step['source']} --[{step['rel']}]--> {step['target']}")
            paths_text += f"路径{i + 1}: {' | '.join(steps)}\n"

        return f"""基于以下实体关联路径进行推理分析。

## 关联路径
{paths_text}

## 问题
{question}

## 推理要求
1. 逐跳分析每条路径的含义
2. 综合多条路径得出整体结论
3. 标注推理过程中的关键证据
4. 如果存在矛盾信息，请明确指出
"""
```

### 14.4.3 DeepSeek API 调用封装

```python
import json
import requests
from typing import Optional, Generator

class DeepSeekClient:
    """DeepSeek API 客户端封装"""

    def __init__(self, api_key: str, base_url: str = "https://api.deepseek.com/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def chat(self, messages: List[Dict], model: str = "deepseek-chat",
             temperature: float = 0.1, max_tokens: int = 4096,
             stream: bool = False) -> str:
        """调用 DeepSeek 对话 API"""
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }

        if stream:
            return self._stream_chat(url, payload)

        resp = self.session.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def _stream_chat(self, url: str, payload: Dict) -> str:
        """流式对话"""
        resp = self.session.post(url, json=payload, stream=True, timeout=120)
        resp.raise_for_status()
        full_content = ""
        for line in resp.iter_lines():
            if line:
                line = line.decode("utf-8")
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        full_content += content
                        print(content, end="", flush=True)
                    except json.JSONDecodeError:
                        continue
        return full_content

    def function_call(self, messages: List[Dict], tools: List[Dict],
                      model: str = "deepseek-chat") -> Dict:
        """工具调用（Function Calling）"""
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
        }
        resp = self.session.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]
```

### 14.4.4 结构化输出（JSON Mode）

DeepSeek 支持 JSON 格式输出，适合需要结构化分析结果的场景：

```python
def analyze_with_json_mode(client: DeepSeekClient, question: str,
                           context: RetrievedContext) -> Dict:
    """使用 JSON Mode 进行结构化分析"""
    system_prompt = """你是一个图数据分析专家。请以 JSON 格式输出分析结果。

输出格式必须严格遵循以下 JSON Schema:
{
    "analysis_type": "路径分析/异常检测/社区发现/中心性分析",
    "conclusion": "分析结论",
    "confidence": "高/中/低",
    "evidence": [
        {
            "type": "节点/关系/路径",
            "description": "证据描述",
            "reference": "引用的图元素标识"
        }
    ],
    "recommendations": ["建议1", "建议2"]
}
"""

    user_prompt = DeepSeekPromptTemplates.graph_qa_user_prompt(question, context)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # 使用 JSON Mode
    url = f"{client.base_url}/chat/completions"
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    resp = client.session.post(url, json=payload, timeout=60)
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"error": "JSON 解析失败", "raw": content}
```

---

## 14.5 完整问答系统实现

本节将上述组件整合为一个完整的 Graph RAG 问答系统。

### 14.5.1 系统主类

```python
import os
from typing import List, Optional
from dataclasses import dataclass, field

@dataclass
class QAResult:
    """问答结果"""
    question: str
    answer: str
    context: RetrievedContext = field(default_factory=RetrievedContext)
    strategy: str = "auto"
    tokens_used: int = 0
    latency_ms: float = 0.0
    confidence: str = "中"


class GraphRAGSystem:
    """Graph RAG 问答系统主类"""

    def __init__(self, neo4j_uri: str, neo4j_user: str, neo4j_password: str,
                 deepseek_api_key: str, embed_model=None):
        # 初始化 Neo4j 驱动
        self.driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))

        # 初始化检索器
        self.vector_retriever = VectorRetriever(self.driver, embed_model)
        self.graph_retriever = GraphStructureRetriever(self.driver)
        self.hybrid_retriever = HybridRetriever(
            self.vector_retriever, self.graph_retriever
        )
        self.reranker = ContextReRanker()

        # 初始化 DeepSeek 客户端
        self.llm = DeepSeekClient(api_key=deepseek_api_key)

        # 提示模板
        self.prompts = DeepSeekPromptTemplates()

    def answer(self, question: str, strategy: str = "auto",
               top_k: int = 5, use_rerank: bool = True,
               stream: bool = False) -> QAResult:
        """回答用户问题"""
        import time
        start = time.time()

        result = QAResult(question=question, strategy=strategy)

        # Step 1: 检索
        context = self.hybrid_retriever.retrieve(question, strategy, top_k)

        # Step 2: 重排序（可选）
        if use_rerank and context.nodes:
            context.nodes = self.reranker.rerank(question, context.nodes, top_k)

        result.context = context

        # Step 3: 构建提示
        messages = [
            {"role": "system", "content": self.prompts.graph_qa_system_prompt()},
            {"role": "user", "content": self.prompts.graph_qa_user_prompt(
                question, context
            )},
        ]

        # Step 4: 调用 DeepSeek
        answer = self.llm.chat(messages, stream=stream)
        result.answer = answer
        result.latency_ms = (time.time() - start) * 1000

        return result

    def analyze(self, question: str, analysis_type: str = "general") -> Dict:
        """执行结构化分析"""
        context = self.hybrid_retriever.retrieve(question, "hybrid", top_k=10)

        if analysis_type == "structured":
            return analyze_with_json_mode(self.llm, question, context)

        messages = [
            {"role": "system", "content": self.prompts.analysis_system_prompt()},
            {"role": "user", "content": self.prompts.graph_qa_user_prompt(
                question, context
            )},
        ]
        answer = self.llm.chat(messages)
        return {
            "question": question,
            "analysis": answer,
            "context_size": len(context.nodes),
        }

    def generate_cypher(self, question: str, schema: str) -> str:
        """根据自然语言生成 Cypher 查询"""
        prompt = self.prompts.cypher_generation_prompt(question, schema)
        messages = [
            {"role": "system", "content": "你是一个 Neo4j Cypher 查询专家。"},
            {"role": "user", "content": prompt},
        ]
        return self.llm.chat(messages, temperature=0.0)

    def close(self):
        self.driver.close()
```

### 14.5.2 交互式命令行界面

```python
class GraphRAGCLI:
    """Graph RAG 命令行交互界面"""

    def __init__(self, system: GraphRAGSystem):
        self.system = system

    def run(self):
        """启动交互式问答循环"""
        print("=" * 60)
        print("  Graph RAG 问答系统 (Neo4j + DeepSeek)")
        print("  输入 'exit' 退出, '/help' 查看命令")
        print("=" * 60)

        while True:
            try:
                question = input("\n❓ 请输入问题: ").strip()
                if not question:
                    continue
                if question.lower() == "exit":
                    break
                if question.lower() == "/help":
                    self._show_help()
                    continue
                if question.startswith("/"):
                    self._handle_command(question)
                    continue

                # 自动判断策略
                result = self.system.answer(question, stream=True)
                print(f"\n\n📊 检索策略: {result.strategy}")
                print(f"📎 检索节点数: {len(result.context.nodes)}")
                print(f"🔗 检索关系数: {len(result.context.relationships)}")
                print(f"⏱ 响应时间: {result.latency_ms:.0f}ms")

            except KeyboardInterrupt:
                print("\n\n再见！")
                break
            except Exception as e:
                print(f"\n❌ 错误: {e}")

    def _show_help(self):
        print("""
可用命令:
  /analyze <问题>    - 执行深度分析
  /cypher <问题>     - 生成 Cypher 查询
  /strategy <类型>   - 设置检索策略 (auto/vector/graph/hybrid)
  /stats            - 查看图统计信息
  /exit             - 退出
        """)

    def _handle_command(self, cmd: str):
        parts = cmd.split(" ", 1)
        command = parts[0].lower()
        args = parts[1] if len(parts) > 1 else ""

        if command == "/analyze" and args:
            result = self.system.analyze(args)
            print(f"\n📈 分析结果:\n{result.get('analysis', result)}")
        elif command == "/cypher" and args:
            schema = "(:Customer)-[:OWNS]->(:Account)-[:TRANSFERRED_TO]->(:Account)"
            cypher = self.system.generate_cypher(args, schema)
            print(f"\n🔍 生成的 Cypher:\n{cypher}")
        elif command == "/stats":
            builder = Neo4jGraphBuilder(
                self.system.driver._pool.acquire().__class__.__name__, "", ""
            )
            # 简化处理
            print("图统计信息功能需要 Neo4jGraphBuilder 实例")
        else:
            print("未知命令，输入 /help 查看帮助")
```

### 14.5.3 Web API 服务（FastAPI）

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Graph RAG API", version="1.0.0")

# 全局系统实例（实际使用时应通过依赖注入）
rag_system: Optional[GraphRAGSystem] = None


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    strategy: str = Field(default="auto", pattern="^(auto|vector|graph|hybrid)$")
    top_k: int = Field(default=5, ge=1, le=50)
    stream: bool = False


class AnalysisRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    analysis_type: str = Field(default="general", pattern="^(general|structured)$")


class QAResponse(BaseModel):
    question: str
    answer: str
    strategy: str
    context_size: int
    latency_ms: float


@app.on_event("startup")
def startup():
    global rag_system
    rag_system = GraphRAGSystem(
        neo4j_uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        neo4j_user=os.getenv("NEO4J_USER", "neo4j"),
        neo4j_password=os.getenv("NEO4J_PASSWORD", "password"),
        deepseek_api_key=os.getenv("DEEPSEEK_API_KEY", ""),
    )


@app.on_event("shutdown")
def shutdown():
    if rag_system:
        rag_system.close()


@app.post("/qa", response_model=QAResponse)
async def qa_endpoint(request: QuestionRequest):
    """问答接口"""
    if not rag_system:
        raise HTTPException(503, "系统未初始化")

    result = rag_system.answer(
        question=request.question,
        strategy=request.strategy,
        top_k=request.top_k,
        stream=request.stream,
    )
    return QAResponse(
        question=result.question,
        answer=result.answer,
        strategy=result.strategy,
        context_size=len(result.context.nodes),
        latency_ms=result.latency_ms,
    )


@app.post("/analyze")
async def analyze_endpoint(request: AnalysisRequest):
    """分析接口"""
    if not rag_system:
        raise HTTPException(503, "系统未初始化")

    return rag_system.analyze(request.question, request.analysis_type)


@app.get("/health")
async def health_check():
    """健康检查"""
    if not rag_system:
        return {"status": "unhealthy", "detail": "系统未初始化"}
    try:
        with rag_system.driver.session() as session:
            session.run("RETURN 1")
        return {"status": "healthy", "neo4j": "connected"}
    except Exception as e:
        return {"status": "degraded", "neo4j": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 14.6 数据分析场景实战

### 14.6.1 金融风控：反洗钱资金追踪

金融场景的核心需求是从海量交易中识别可疑资金流转模式。

```python
class FinancialFraudAnalyzer:
    """金融反欺诈分析器"""

    def __init__(self, driver, llm_client: DeepSeekClient):
        self.driver = driver
        self.llm = llm_client

    def detect_cyclical_transactions(self, max_hops: int = 6) -> List[Dict]:
        """检测循环交易（资金闭环，典型洗钱特征）"""
        query = f"""
        MATCH path = (a:Account)-[:TRANSFERRED_TO*{2}..{max_hops}]->(a)
        WHERE ALL(r IN relationships(path) WHERE r.amount >= 10000)
        RETURN [n IN nodes(path) | elementId(n)] AS account_chain,
               [r IN relationships(path) | r.amount] AS amounts,
               length(path) AS cycle_length,
               reduce(s = 0, r IN relationships(path) | s + r.amount) AS total_amount
        ORDER BY total_amount DESC
        LIMIT 20
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query)]

    def detect_smurfing_pattern(self, threshold: float = 50000,
                                 count_threshold: int = 3) -> List[Dict]:
        """检测拆分交易（Smurfing）：大额资金拆分为多笔小额转账"""
        query = """
        MATCH (from:Account)-[r:TRANSFERRED_TO]->(to:Account)
        WITH from, to, count(r) AS tx_count, sum(r.amount) AS total_amount
        WHERE tx_count >= $count_threshold AND total_amount >= $threshold
        OPTIONAL MATCH (from)<-[:OWNS]-(c:Customer)
        RETURN elementId(from) AS from_account,
               elementId(to) AS to_account,
               tx_count, total_amount,
               c.name AS customer_name,
               c.risk_level AS risk_level
        ORDER BY total_amount DESC
        LIMIT 20
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query, {
                "threshold": threshold,
                "count_threshold": count_threshold,
            })]

    def analyze_suspicious_account(self, account_id: str) -> Dict:
        """综合分析可疑账户"""
        # 1. 获取账户基本信息
        # 2. 获取交易网络
        # 3. 检测异常模式
        # 4. 使用 DeepSeek 生成分析报告

        # 获取交易网络
        network_query = """
        MATCH (a:Account {account_id: $account_id})
        OPTIONAL MATCH (a)-[r:TRANSFERRED_TO*1..3]->(target:Account)
        WHERE ALL(rel IN r WHERE rel.amount > 0)
        RETURN a, r, target
        LIMIT 100
        """
        with self.driver.session() as session:
            network = [r.data() for r in session.run(network_query,
                                                     {"account_id": account_id})]

        # 检测循环交易
        cycles = self.detect_cyclical_transactions()

        # 使用 DeepSeek 生成分析报告
        prompt = f"""
        分析以下账户的交易网络数据，判断是否存在洗钱风险。

        账户ID: {account_id}
        交易网络节点数: {len(network)}
        检测到的资金闭环数: {len(cycles)}

        请从以下维度分析：
        1. 交易频率与金额模式
        2. 是否存在资金闭环
        3. 交易对手风险
        4. 综合风险评级
        """
        messages = [
            {"role": "system", "content": "你是一个金融反洗钱分析专家。"},
            {"role": "user", "content": prompt},
        ]
        analysis = self.llm.chat(messages)

        return {
            "account_id": account_id,
            "network_size": len(network),
            "cycles_detected": len(cycles),
            "cycle_details": cycles[:5],
            "analysis": analysis,
            "risk_level": self._calculate_risk_level(network, cycles),
        }

    def _calculate_risk_level(self, network: List, cycles: List) -> str:
        """计算风险等级"""
        if len(cycles) >= 3:
            return "高风险"
        if len(cycles) >= 1 or len(network) > 50:
            return "中风险"
        return "低风险"


# 使用示例
def financial_analysis_demo(rag: GraphRAGSystem):
    """金融分析演示"""
    analyzer = FinancialFraudAnalyzer(rag.driver, rag.llm)

    print("=== 检测资金闭环 ===")
    cycles = analyzer.detect_cyclical_transactions()
    for c in cycles[:3]:
        print(f"  闭环长度: {c['cycle_length']}, 总金额: {c['total_amount']:.2f}")

    print("\n=== 检测拆分交易 ===")
    smurfing = analyzer.detect_smurfing_pattern()
    for s in smurfing[:3]:
        print(f"  账户: {s['from_account'][:8]} -> {s['to_account'][:8]}, "
              f"交易次数: {s['tx_count']}, 总金额: {s['total_amount']:.2f}")

    print("\n=== 可疑账户深度分析 ===")
    if smurfing:
        result = analyzer.analyze_suspicious_account(smurfing[0]["from_account"])
        print(f"  风险等级: {result['risk_level']}")
        print(f"  分析报告:\n{result['analysis']}")
```

### 14.6.2 社交网络分析

社交网络分析关注用户之间的关系结构、影响力传播和社区发现。

```python
class SocialNetworkAnalyzer:
    """社交网络分析器"""

    def __init__(self, driver, llm_client: DeepSeekClient):
        self.driver = driver
        self.llm = llm_client

    def find_influencers(self, min_followers: int = 100) -> List[Dict]:
        """基于 PageRank 发现关键意见领袖"""
        # 首先运行 PageRank 算法
        query = """
        CALL gds.pageRank.stream('user-graph')
        YIELD nodeId, score
        MATCH (u:User) WHERE elementId(u) = nodeId
        RETURN u.user_id AS user_id, u.name AS name, score
        ORDER BY score DESC
        LIMIT 20
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query)]

    def detect_communities(self) -> List[Dict]:
        """使用 Louvain 算法检测社区"""
        query = """
        CALL gds.louvain.stream('user-graph')
        YIELD nodeId, communityId
        MATCH (u:User) WHERE elementId(u) = nodeId
        RETURN communityId, collect(u.name) AS members,
               count(*) AS community_size
        ORDER BY community_size DESC
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query)]

    def find_shortest_path(self, user_a: str, user_b: str) -> List[Dict]:
        """查找两个用户之间的最短社交路径"""
        query = """
        MATCH path = shortestPath(
            (a:User {user_id: $user_a})
            -[:FOLLOWS|FRIEND*]-
            (b:User {user_id: $user_b})
        )
        RETURN [n IN nodes(path) | n.name] AS user_chain,
               length(path) AS degrees_of_separation
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query, {
                "user_a": user_a,
                "user_b": user_b,
            })]

    def analyze_information_flow(self, topic: str, seed_user: str) -> Dict:
        """分析信息在社交网络中的传播路径"""
        query = """
        MATCH (seed:User {user_id: $seed_user})
        OPTIONAL MATCH path = (seed)-[:POSTED]->(p:Post)
            -[:MENTIONED]->(t:Topic {name: $topic})
        OPTIONAL MATCH (p)<-[:LIKED|SHARED]-(other:User)
        RETURN seed.name AS seed_user,
               p.content AS post_content,
               collect(DISTINCT other.name) AS interacted_users,
               count(DISTINCT other) AS interaction_count
        """
        with self.driver.session() as session:
            data = [r.data() for r in session.run(query, {
                "seed_user": seed_user,
                "topic": topic,
            })]

        # 使用 DeepSeek 分析传播模式
        prompt = f"""
        分析以下社交网络信息传播数据：

        种子用户: {seed_user}
        话题: {topic}
        互动用户数: {len(data)}

        请分析：
        1. 信息传播的广度与深度
        2. 关键传播节点
        3. 传播路径特征
        4. 优化传播策略的建议
        """
        messages = [
            {"role": "system", "content": "你是一个社交网络分析专家。"},
            {"role": "user", "content": prompt},
        ]
        analysis = self.llm.chat(messages)

        return {
            "seed_user": seed_user,
            "topic": topic,
            "raw_data": data,
            "analysis": analysis,
        }
```

### 14.6.3 供应链分析

供应链分析需要追踪物料、资金、信息在上下游企业间的流动。

```python
class SupplyChainAnalyzer:
    """供应链分析器"""

    def __init__(self, driver, llm_client: DeepSeekClient):
        self.driver = driver
        self.llm = llm_client

    def trace_product_path(self, product_id: str) -> List[Dict]:
        """追踪产品从原材料到成品的完整路径"""
        query = """
        MATCH path = (raw:Material)
            -[:SUPPLIED_TO]->(supplier:Supplier)
            -[:MANUFACTURES]->(product:Product {product_id: $product_id})
            -[:DISTRIBUTED_TO]->(distributor:Distributor)
            -[:SOLD_TO]->(retailer:Retailer)
        RETURN [n IN nodes(path) | {{
            type: labels(n)[0],
            name: coalesce(n.name, n.company_name),
            id: coalesce(n.product_id, n.supplier_id)
        }}] AS supply_chain,
        length(path) AS chain_length
        ORDER BY chain_length
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query,
                                                   {"product_id": product_id})]

    def find_bottlenecks(self) -> List[Dict]:
        """识别供应链瓶颈（被最多下游依赖的节点）"""
        query = """
        MATCH (n)-[:SUPPLIED_TO|MANUFACTURES|DISTRIBUTED_TO*]->()
        WITH n, count(*) AS downstream_count
        WHERE downstream_count > 5
        RETURN labels(n)[0] AS node_type,
               coalesce(n.name, n.company_name) AS node_name,
               downstream_count
        ORDER BY downstream_count DESC
        LIMIT 10
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query)]

    def analyze_supplier_risk(self, supplier_id: str) -> Dict:
        """分析供应商风险（单点故障、替代性等）"""
        # 获取供应商的客户分布
        query = """
        MATCH (s:Supplier {supplier_id: $supplier_id})
            -[:SUPPLIED_TO]->(m:Manufacturer)
        OPTIONAL MATCH (m)-[:MANUFACTURES]->(p:Product)
        RETURN s.name AS supplier_name,
               count(DISTINCT m) AS customer_count,
               count(DISTINCT p) AS product_count,
               collect(DISTINCT p.name) AS products
        """
        with self.driver.session() as session:
            data = [r.data() for r in session.run(query,
                                                    {"supplier_id": supplier_id})]

        # 查找替代供应商
        alt_query = """
        MATCH (s:Supplier {supplier_id: $supplier_id})
            -[:SUPPLIED_TO]->(m:Manufacturer)
        MATCH (alt:Supplier)-[:SUPPLIED_TO]->(m)
        WHERE alt.supplier_id <> $supplier_id
        RETURN alt.name AS alternative_supplier,
               count(DISTINCT m) AS common_customers
        ORDER BY common_customers DESC
        """
        with self.driver.session() as session:
            alternatives = [r.data() for r in session.run(alt_query,
                                                           {"supplier_id": supplier_id})]

        prompt = f"""
        分析以下供应商风险数据：

        供应商: {data[0] if data else "无数据"}
        替代供应商: {alternatives[:5]}

        请分析：
        1. 供应商集中度风险
        2. 可替代性评估
        3. 如果该供应商中断，对供应链的影响范围
        4. 风险缓解建议
        """
        messages = [
            {"role": "system", "content": "你是一个供应链风险管理专家。"},
            {"role": "user", "content": prompt},
        ]
        analysis = self.llm.chat(messages)

        return {
            "supplier_id": supplier_id,
            "supplier_data": data,
            "alternatives": alternatives,
            "risk_analysis": analysis,
        }
```

### 14.6.4 异常检测

异常检测是图分析中最具实用价值的场景之一，涵盖交易异常、行为异常、结构异常等。

```python
class AnomalyDetector:
    """图异常检测器"""

    def __init__(self, driver, llm_client: DeepSeekClient):
        self.driver = driver
        self.llm = llm_client

    def detect_structural_anomalies(self) -> List[Dict]:
        """检测图结构异常（异常高/低度节点、孤立节点等）"""
        query = """
        // 异常高度节点（可能是中心攻击点）
        MATCH (n)
        OPTIONAL MATCH (n)-[r]-()
        WITH n, labels(n) AS labels, count(r) AS degree
        WHERE degree > 0
        WITH percentileCont(degree, 0.95) AS p95,
             percentileCont(degree, 0.99) AS p99
        MATCH (n)
        OPTIONAL MATCH (n)-[r]-()
        WITH n, labels(n) AS labels, count(r) AS degree, p95, p99
        WHERE degree > p99 OR degree < 2
        RETURN labels[0] AS node_type,
               elementId(n) AS node_id,
               degree,
               CASE
                   WHEN degree > p99 THEN '异常高连接'
                   WHEN degree < 2 THEN '低连接'
               END AS anomaly_type
        ORDER BY degree DESC
        LIMIT 20
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query)]

    def detect_temporal_anomalies(self, time_window: str = "1h") -> List[Dict]:
        """检测时间序列异常（突发高频交易等）"""
        query = """
        // 检测短时间内高频交易
        MATCH (from:Account)-[r:TRANSFERRED_TO]->(to:Account)
        WITH from, to, count(r) AS tx_count,
             sum(r.amount) AS total_amount,
             min(r.timestamp) AS first_tx,
             max(r.timestamp) AS last_tx
        WHERE tx_count >= 5
          AND duration.inSeconds(first_tx, last_tx).seconds <= 3600
        OPTIONAL MATCH (from)<-[:OWNS]-(c:Customer)
        RETURN elementId(from) AS from_account,
               elementId(to) AS to_account,
               tx_count, total_amount,
               first_tx, last_tx,
               c.name AS customer_name,
               c.risk_level AS risk_level
        ORDER BY tx_count DESC
        LIMIT 20
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query)]

    def detect_similarity_anomalies(self, reference_node_id: str) -> List[Dict]:
        """基于向量相似度的异常检测"""
        query = """
        MATCH (ref) WHERE elementId(ref) = $ref_id
        CALL db.index.vector.queryNodes('entity_embeddings', 20, ref.embedding)
        YIELD node, score
        WHERE elementId(node) <> $ref_id
        RETURN elementId(node) AS node_id,
               labels(node) AS labels,
               node.embedding_text AS text,
               score
        ORDER BY score
        LIMIT 10
        """
        with self.driver.session() as session:
            return [r.data() for r in session.run(query,
                                                    {"ref_id": reference_node_id})]

    def comprehensive_anomaly_report(self) -> Dict:
        """生成综合异常检测报告"""
        structural = self.detect_structural_anomalies()
        temporal = self.detect_temporal_anomalies()

        prompt = f"""
        基于以下图异常检测数据，生成综合分析报告。

        ## 结构异常
        {json.dumps(structural[:10], ensure_ascii=False, indent=2)}

        ## 时间异常
        {json.dumps(temporal[:10], ensure_ascii=False, indent=2)}

        请分析：
        1. 异常的整体分布特征
        2. 各类异常的严重程度排序
        3. 异常之间的关联性
        4. 优先级最高的需要人工核查的异常
        5. 系统性的改进建议
        """
        messages = [
            {"role": "system", "content": "你是一个图数据异常检测专家。"},
            {"role": "user", "content": prompt},
        ]
        analysis = self.llm.chat(messages)

        return {
            "structural_anomalies": structural,
            "temporal_anomalies": temporal,
            "analysis": analysis,
            "total_anomalies": len(structural) + len(temporal),
            "critical_count": sum(
                1 for s in structural if s.get("anomaly_type") == "异常高连接"
            ),
        }
```

---

## 14.7 系统优化与生产化

### 14.7.1 缓存策略

```python
import hashlib
import pickle
from functools import wraps
from datetime import datetime, timedelta

class RAGCache:
    """Graph RAG 多级缓存"""

    def __init__(self, redis_client=None, ttl: int = 3600):
        self.redis = redis_client
        self.ttl = ttl
        self.local_cache = {}

    def _make_key(self, question: str, strategy: str) -> str:
        raw = f"{question}:{strategy}"
        return f"rag_cache:{hashlib.md5(raw.encode()).hexdigest()}"

    def get(self, question: str, strategy: str):
        key = self._make_key(question, strategy)
        # 本地缓存优先
        if key in self.local_cache:
            entry = self.local_cache[key]
            if datetime.now() < entry["expires"]:
                return entry["data"]
            del self.local_cache[key]

        # Redis 缓存
        if self.redis:
            data = self.redis.get(key)
            if data:
                result = pickle.loads(data)
                self.local_cache[key] = {
                    "data": result,
                    "expires": datetime.now() + timedelta(seconds=self.ttl),
                }
                return result
        return None

    def set(self, question: str, strategy: str, data):
        key = self._make_key(question, strategy)
        self.local_cache[key] = {
            "data": data,
            "expires": datetime.now() + timedelta(seconds=self.ttl),
        }
        if self.redis:
            self.redis.setex(key, self.ttl, pickle.dumps(data))

    def invalidate(self, pattern: str = None):
        """缓存失效"""
        if pattern:
            keys = [k for k in self.local_cache if pattern in k]
            for k in keys:
                del self.local_cache[k]
        else:
            self.local_cache.clear()


def cached_rag(cache: RAGCache):
    """缓存装饰器"""
    def decorator(func):
        @wraps(func)
        def wrapper(self, question: str, strategy: str = "auto", **kwargs):
            cached = cache.get(question, strategy)
            if cached:
                return cached
            result = func(self, question, strategy, **kwargs)
            cache.set(question, strategy, result)
            return result
        return wrapper
    return decorator
```

### 14.7.2 异步处理

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

class AsyncGraphRAG:
    """异步 Graph RAG 系统"""

    def __init__(self, sync_system: GraphRAGSystem):
        self.sync = sync_system
        self.executor = ThreadPoolExecutor(max_workers=4)

    async def answer_async(self, question: str, **kwargs) -> QAResult:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self.executor,
            self.sync.answer,
            question,
            kwargs.get("strategy", "auto"),
            kwargs.get("top_k", 5),
            kwargs.get("use_rerank", True),
            kwargs.get("stream", False),
        )

    async def batch_answer(self, questions: List[str], **kwargs) -> List[QAResult]:
        tasks = [self.answer_async(q, **kwargs) for q in questions]
        return await asyncio.gather(*tasks)
```

### 14.7.3 性能监控

```python
import time
import statistics
from collections import defaultdict

class PerformanceMonitor:
    """性能监控器"""

    def __init__(self):
        self.metrics = defaultdict(list)

    def record(self, stage: str, duration_ms: float):
        self.metrics[stage].append(duration_ms)

    def summary(self) -> Dict:
        result = {}
        for stage, durations in self.metrics.items():
            result[stage] = {
                "avg_ms": statistics.mean(durations),
                "p50_ms": statistics.median(durations),
                "p95_ms": sorted(durations)[int(len(durations) * 0.95)],
                "p99_ms": sorted(durations)[int(len(durations) * 0.99)],
                "max_ms": max(durations),
                "count": len(durations),
            }
        return result

    def report(self) -> str:
        s = self.summary()
        lines = ["## 性能报告", f"{'阶段':<20} {'平均(ms)':<12} {'P95(ms)':<12} {'P99(ms)':<12} {'次数':<8}"]
        lines.append("-" * 64)
        for stage, m in sorted(s.items()):
            lines.append(
                f"{stage:<20} {m['avg_ms']:<12.1f} {m['p95_ms']:<12.1f} "
                f"{m['p99_ms']:<12.1f} {m['count']:<8}"
            )
        return "\n".join(lines)
```

---

## 14.8 最佳实践与注意事项

### 14.8.1 图建模建议

1. **适度使用关系属性**：将金额、时间戳等关键信息存储在关系上，而非创建中间节点
2. **命名规范**：节点标签使用 PascalCase（如 `Transaction`），关系类型使用大写蛇形（如 `TRANSFERRED_TO`）
3. **索引策略**：为所有参与查询的属性创建索引，为文本属性创建全文索引
4. **数据分片**：超大规模图（>1 亿节点）考虑按业务域分片存储

### 14.8.2 检索优化

1. **检索深度控制**：向量检索 top_k 建议 5-20，图邻域扩展建议 1-2 跳
2. **上下文窗口管理**：DeepSeek 上下文窗口虽大（128K），但过长上下文会降低推理质量，建议控制检索结果在 3000 token 以内
3. **重排序必要性**：向量检索结果中前 5 的准确率约 70%，重排序后可提升至 85%+
4. **混合检索权重**：建议向量检索与图结构检索结果按 3:7 比例融合

### 14.8.3 DeepSeek 调用优化

1. **Temperature 设置**：事实性问答设为 0.0-0.1，创造性分析设为 0.3-0.5
2. **System Prompt 长度**：控制在 500 token 以内，避免稀释用户问题的重要性
3. **错误重试**：API 调用失败时，采用指数退避重试（1s, 2s, 4s, 8s）
4. **流式输出**：长答案使用 stream=True 提升用户体验

### 14.8.4 安全与合规

1. **数据脱敏**：在导入图数据库前对敏感字段（身份证号、手机号等）进行脱敏
2. **访问控制**：使用 Neo4j 的 RBAC 机制限制不同角色的查询范围
3. **审计日志**：记录所有通过 Graph RAG 系统发起的查询和生成的答案
4. **提示注入防护**：对用户输入进行清洗，防止提示注入攻击

---

## 14.9 本章小结

本章系统讲解了基于 Neo4j 和 DeepSeek 构建 Graph RAG 系统的完整方法论：

- **数据准备与图构建**：从 CSV 等原始数据出发，遵循"以查询为中心"的建模原则，构建高效的图结构
- **检索策略设计**：向量语义检索、图结构路径检索、混合检索三种策略各有适用场景，实际应用中应组合使用
- **DeepSeek 提示工程**：结构化上下文呈现、证据可追溯、分步推理是提升生成质量的关键
- **完整系统实现**：从 CLI 到 Web API，提供了可直接使用的代码框架
- **四大分析场景**：金融风控、社交网络、供应链、异常检测，覆盖了 Graph RAG 的主要应用领域

Graph RAG 的核心价值在于将图数据库的结构化查询能力与 LLM 的语义理解能力深度融合。相比传统 RAG，Graph RAG 在需要多跳推理、关系追溯、结构化聚合的场景中具有不可替代的优势。随着图数据库和 LLM 技术的持续演进，Graph RAG 将成为企业级知识问答和智能分析的基础设施级解决方案。

### 进一步阅读

- Neo4j GDS 图算法库文档：https://neo4j.com/docs/graph-data-science/current/
- DeepSeek API 文档：https://platform.deepseek.com/docs
- LangChain Neo4j 集成：https://python.langchain.com/docs/integrations/graphs/neo4j/
- Graph RAG 论文：https://arxiv.org/abs/2404.16130
