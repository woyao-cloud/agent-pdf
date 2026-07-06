# 第6章 GraphRAG 中的全局搜索与局部搜索

## 6.1 引言

检索增强生成（Retrieval-Augmented Generation, RAG）通过在 LLM 推理过程中引入外部知识库，有效缓解了大模型的知识截止、幻觉和领域知识匮乏等问题。然而，传统 RAG 系统基于向量相似度进行检索，在面对需要全局理解、跨文档推理或回答综合性问题时表现不佳。GraphRAG 通过引入图结构作为知识组织的基本范式，将搜索过程划分为**全局搜索（Global Search）** 与**局部搜索（Local Search）** 两个互补的检索策略，从根本上解决了这一困境。

本章将深入剖析 GraphRAG 中两种搜索模式的设计原理、实现细节、适用场景以及融合策略。我们将从图索引结构出发，逐步展开全局搜索的社区摘要机制、局部搜索的实体-关系遍历算法、搜索策略的选择逻辑，以及最终结果融合与排序的工程实践。每部分均配有完整的 Python 代码示例，帮助读者在理解理论的同时掌握可落地的实现方法。

## 6.2 图索引结构概览

在讨论搜索策略之前，有必要先理解 GraphRAG 的图索引结构。GraphRAG 的索引管线通常包含以下层次：

1. **文档层（Document Layer）**：原始文档及其分块（chunks）
2. **实体层（Entity Layer）**：从文本中提取的命名实体，每个实体关联到源文本块
3. **关系层（Relation Layer）**：实体之间的语义关系，带有关系描述和置信度
4. **社区层（Community Layer）**：通过图聚类算法（如 Leiden 算法）将实体图划分为若干社区，每个社区生成一份摘要
5. **协变量层（Covariate Layer）**：实体相关的属性、时间信息、统计信息等

```python
from dataclasses import dataclass, field
from typing import List, Dict, Optional
import numpy as np

@dataclass
class TextChunk:
    id: str
    text: str
    source_doc: str
    embedding: Optional[np.ndarray] = None

@dataclass
class Entity:
    id: str
    name: str
    type: str
    description: str
    chunk_ids: List[str] = field(default_factory=list)
    embedding: Optional[np.ndarray] = None

@dataclass
class Relation:
    id: str
    source_id: str
    target_id: str
    description: str
    weight: float = 1.0
    chunk_ids: List[str] = field(default_factory=list)

@dataclass
class Community:
    id: str
    entity_ids: List[str] = field(default_factory=list)
    summary: str = ""
    level: int = 0

@dataclass
class GraphIndex:
    chunks: Dict[str, TextChunk] = field(default_factory=dict)
    entities: Dict[str, Entity] = field(default_factory=dict)
    relations: List[Relation] = field(default_factory=list)
    communities: Dict[int, List[Community]] = field(default_factory=dict)
```

图索引构建完成后，搜索系统根据用户问题的性质选择不同的检索路径。全局搜索走"社区摘要"路径，局部搜索走"实体-关系-文本块"路径。

## 6.3 全局搜索（Global Search）

### 6.3.1 设计思想

全局搜索的核心思想是：**对于需要整体理解的问题，与其检索零散的文本片段，不如检索经过聚合的社区摘要**。社区摘要是对一组紧密相连的实体及其关系的浓缩描述，天然包含了该子图范围内的全局信息。

全局搜索适用于以下类型的问题：

- **综合性问题**："这家公司的主要业务领域有哪些？"
- **趋势分析**："过去五年该行业发生了哪些重大变化？"
- **对比总结**："A 方案和 B 方案各自的优缺点是什么？"
- **概述性问题**："请总结这份报告的核心观点。"

### 6.3.2 社区摘要的生成

社区摘要是全局搜索的基础。生成过程通常分为三步：

1. **图聚类**：使用 Leiden 算法对实体-关系图进行层次化社区检测
2. **摘要生成**：对每个社区内的实体、关系及其关联文本块，调用 LLM 生成自然语言摘要
3. **层次组织**：将社区按层次组织，高层社区覆盖更广但粒度更粗，低层社区更聚焦

```python
import networkx as nx
from typing import List, Tuple
import openai  # 假设使用 OpenAI API

class CommunityDetector:
    """基于 Leiden 算法的社区检测"""

    def __init__(self, graph_index: GraphIndex):
        self.graph_index = graph_index
        self.graph = self._build_networkx_graph()

    def _build_networkx_graph(self) -> nx.Graph:
        G = nx.Graph()
        for entity in self.graph_index.entities.values():
            G.add_node(entity.id, name=entity.name, type=entity.type)
        for rel in self.graph_index.relations:
            G.add_edge(rel.source_id, rel.target_id,
                       weight=rel.weight, description=rel.description)
        return G

    def detect_communities(self, resolution: float = 1.0) -> List[Community]:
        try:
            from graspologic.partition import hierarchical_leiden
        except ImportError:
            raise ImportError(
                "请安装 graspologic: pip install graspologic"
            )

        partitions = hierarchical_leiden(
            self.graph,
            max_cluster_size=100,
            resolution=resolution
        )

        community_map: Dict[int, List[str]] = {}
        level_map: Dict[int, int] = {}
        for partition in partitions:
            cid = partition.cluster
            if cid not in community_map:
                community_map[cid] = []
                level_map[cid] = partition.level
            community_map[cid].append(partition.node)

        communities = []
        for cid, entity_ids in community_map.items():
            communities.append(Community(
                id=f"community_{cid}",
                entity_ids=entity_ids,
                level=level_map.get(cid, 0)
            ))
        return communities


class CommunitySummarizer:
    """为每个社区生成自然语言摘要"""

    def __init__(self, graph_index: GraphIndex, model: str = "gpt-4o"):
        self.graph_index = graph_index
        self.model = model

    def _collect_community_context(self, community: Community) -> str:
        context_parts = []
        for eid in community.entity_ids:
            entity = self.graph_index.entities.get(eid)
            if not entity:
                continue
            context_parts.append(f"实体: {entity.name} ({entity.type})")
            context_parts.append(f"描述: {entity.description}")

        for rel in self.graph_index.relations:
            if rel.source_id in community.entity_ids and rel.target_id in community.entity_ids:
                src = self.graph_index.entities[rel.source_id].name
                tgt = self.graph_index.entities[rel.target_id].name
                context_parts.append(f"关系: {src} -> {tgt}: {rel.description}")

        return "\n".join(context_parts)

    def generate_summary(self, community: Community) -> str:
        context = self._collect_community_context(community)
        prompt = (
            "你是一个知识图谱分析专家。以下是一个社区中所有实体和关系的描述。\n"
            "请生成一段连贯的摘要，概括这个社区的核心主题、关键实体及其相互关系。\n\n"
            f"{context}\n\n摘要："
        )
        response = openai.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=500
        )
        return response.choices[0].message.content
```

### 6.3.3 全局搜索的检索流程

全局搜索的完整流程如下：

1. **问题嵌入**：将用户问题编码为向量
2. **社区选择**：根据问题与社区摘要的语义相似度，选择最相关的 K 个社区
3. **摘要聚合**：将选中社区的摘要拼接为上下文窗口
4. **答案生成**：将聚合后的摘要作为上下文，调用 LLM 生成答案

```python
class GlobalSearchEngine:
    """全局搜索引擎：基于社区摘要的检索与生成"""

    def __init__(
        self,
        graph_index: GraphIndex,
        embedding_model: str = "text-embedding-3-small",
        llm_model: str = "gpt-4o",
        top_k_communities: int = 5
    ):
        self.graph_index = graph_index
        self.embedding_model = embedding_model
        self.llm_model = llm_model
        self.top_k = top_k_communities
        self.community_embeddings: Dict[str, np.ndarray] = {}

    def _embed(self, text: str) -> np.ndarray:
        response = openai.embeddings.create(
            model=self.embedding_model,
            input=text
        )
        return np.array(response.data[0].embedding)

    def _build_community_embeddings(self):
        """预计算所有社区摘要的向量"""
        for level, communities in self.graph_index.communities.items():
            for comm in communities:
                if comm.summary:
                    self.community_embeddings[comm.id] = self._embed(comm.summary)

    def _select_communities(self, query: str) -> List[Community]:
        """根据问题语义选择最相关的社区"""
        query_emb = self._embed(query)
        scored = []
        for comm_id, comm_emb in self.community_embeddings.items():
            score = np.dot(query_emb, comm_emb) / (
                np.linalg.norm(query_emb) * np.linalg.norm(comm_emb)
            )
            # 查找对应的社区对象
            for level, communities in self.graph_index.communities.items():
                for c in communities:
                    if c.id == comm_id:
                        scored.append((score, c))
                        break
        scored.sort(key=lambda x: x[0], reverse=True)
        return [c for _, c in scored[:self.top_k]]

    def _build_global_context(self, communities: List[Community]) -> str:
        """将多个社区摘要拼接为全局上下文"""
        sections = []
        for i, comm in enumerate(communities, 1):
            sections.append(f"## 社区 {i}\n{comm.summary}")
        return "\n\n".join(sections)

    def search(self, query: str) -> str:
        """执行全局搜索"""
        if not self.community_embeddings:
            self._build_community_embeddings()

        selected = self._select_communities(query)
        context = self._build_global_context(selected)

        prompt = (
            "你是一个知识问答助手。以下是从知识图谱中检索到的社区摘要信息。\n"
            "请基于这些信息回答用户的问题。如果信息不足以回答问题，请如实说明。\n"
            "回答时请引用信息来源（社区编号）。\n\n"
            f"【检索到的社区摘要】\n{context}\n\n"
            f"【用户问题】\n{query}\n\n"
            "【回答】"
        )

        response = openai.chat.completions.create(
            model=self.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1024
        )
        return response.choices[0].message.content
```

### 6.3.4 层次化社区遍历策略

实际应用中，社区具有层次结构。高层社区覆盖范围广但信息密度低，低层社区信息密度高但覆盖窄。全局搜索需要根据问题的范围动态选择层次：

```python
class HierarchicalGlobalSearch:
    """支持层次化社区选择的全局搜索"""

    def __init__(
        self,
        graph_index: GraphIndex,
        max_level: int = 3
    ):
        self.graph_index = graph_index
        self.max_level = max_level

    def _estimate_query_scope(self, query: str) -> int:
        """根据问题类型估计需要的社区层次
        返回: 层次级别（0=最细粒度, max_level=最粗粒度）
        """
        broad_keywords = [
            "总结", "概述", "总体", "所有", "整体",
            "趋势", "发展", "变化", "行业", "领域",
            "summary", "overview", "overall", "trend", "industry"
        ]
        query_lower = query.lower()
        broad_score = sum(1 for kw in broad_keywords if kw in query_lower)

        if broad_score >= 3:
            return self.max_level
        elif broad_score >= 1:
            return max(1, self.max_level - 1)
        return max(0, self.max_level - 2)

    def search_at_level(self, query: str, level: int) -> str:
        """在指定层次上执行全局搜索"""
        if level not in self.graph_index.communities:
            return ""

        communities = self.graph_index.communities[level]
        query_emb = self._embed(query)
        scored = []
        for comm in communities:
            if not comm.summary:
                continue
            comm_emb = self._embed(comm.summary)
            score = np.dot(query_emb, comm_emb) / (
                np.linalg.norm(query_emb) * np.linalg.norm(comm_emb)
            )
            scored.append((score, comm))
        scored.sort(key=lambda x: x[0], reverse=True)

        top_comm = [c for _, c in scored[:3]]
        context = "\n\n".join(
            f"【社区 {c.id}】\n{c.summary}" for c in top_comm
        )
        return context

    def search(self, query: str) -> str:
        level = self._estimate_query_scope(query)
        context = self.search_at_level(query, level)
        # ... 后续调用 LLM 生成答案
        return context
```

## 6.4 局部搜索（Local Search）

### 6.4.1 设计思想

局部搜索的核心思想是：**对于需要精确事实的问题，直接检索相关的实体、关系及其原始文本块**。局部搜索不依赖社区摘要，而是从用户问题中提取关键实体，然后在图结构中沿关系进行广度优先遍历，收集邻居实体和相关证据。

局部搜索适用于以下类型的问题：

- **事实性问题**："张三的出生日期是什么？"
- **关系查询**："A 公司和 B 公司之间是什么合作关系？"
- **属性查询**："这款产品的价格是多少？"
- **路径查询**："从 C 到 D 的供应链路径是怎样的？"

### 6.4.2 实体识别与链接

局部搜索的第一步是从用户问题中识别出相关实体。这可以通过两种方式实现：

1. **基于 LLM 的实体提取**：调用 LLM 从问题中提取实体名称
2. **基于向量匹配的实体链接**：将问题编码为向量，与实体名称/描述的向量进行相似度匹配

```python
class EntityLinker:
    """将用户问题中的提及链接到知识图谱中的实体"""

    def __init__(
        self,
        graph_index: GraphIndex,
        embedding_model: str = "text-embedding-3-small"
    ):
        self.graph_index = graph_index
        self.embedding_model = embedding_model
        self._entity_embeddings: Dict[str, np.ndarray] = {}

    def _build_entity_embeddings(self):
        for eid, entity in self.graph_index.entities.items():
            text_for_embedding = f"{entity.name}: {entity.description}"
            response = openai.embeddings.create(
                model=self.embedding_model,
                input=text_for_embedding
            )
            self._entity_embeddings[eid] = np.array(
                response.data[0].embedding
            )

    def extract_entities_llm(self, query: str) -> List[str]:
        """使用 LLM 从问题中提取实体名称"""
        prompt = (
            "从以下问题中提取所有提到的实体名称。"
            "只返回实体名称列表，每行一个。\n\n"
            f"问题: {query}"
        )
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=200
        )
        names = response.choices[0].message.content.strip().split("\n")
        return [n.strip("- ").strip() for n in names if n.strip()]

    def link_entities(self, query: str) -> List[Entity]:
        """将问题链接到知识图谱中的实体"""
        if not self._entity_embeddings:
            self._build_entity_embeddings()

        query_emb = self._embed(query)
        scored = []
        for eid, emb in self._entity_embeddings.items():
            score = np.dot(query_emb, emb) / (
                np.linalg.norm(query_emb) * np.linalg.norm(emb)
            )
            scored.append((score, eid))
        scored.sort(key=lambda x: x[0], reverse=True)

        # 返回相似度最高的前 N 个实体
        threshold = 0.5
        linked = []
        for score, eid in scored[:5]:
            if score >= threshold:
                linked.append(self.graph_index.entities[eid])
        return linked

    def _embed(self, text: str) -> np.ndarray:
        response = openai.embeddings.create(
            model=self.embedding_model,
            input=text
        )
        return np.array(response.data[0].embedding)
```

### 6.4.3 图遍历与证据收集

实体链接完成后，局部搜索以这些实体为种子节点，沿关系边进行广度优先遍历（BFS），收集邻居实体、关系描述和原始文本块。

```python
from collections import deque

class LocalGraphTraverser:
    """局部图遍历引擎：从种子实体出发收集邻居信息"""

    def __init__(
        self,
        graph_index: GraphIndex,
        max_depth: int = 2,
        max_nodes: int = 50
    ):
        self.graph_index = graph_index
        self.max_depth = max_depth
        self.max_nodes = max_nodes

    def traverse(self, seed_entities: List[Entity]) -> Dict:
        """从种子实体出发进行 BFS 遍历"""
        visited_entities = set()
        visited_relations = set()
        collected_chunks = set()

        queue = deque()
        for entity in seed_entities:
            queue.append((entity.id, 0))
            visited_entities.add(entity.id)

        # 构建邻接表
        adjacency: Dict[str, List[Tuple[str, str, float]]] = {}
        for rel in self.graph_index.relations:
            if rel.source_id not in adjacency:
                adjacency[rel.source_id] = []
            adjacency[rel.source_id].append(
                (rel.target_id, rel.id, rel.weight)
            )
            if rel.target_id not in adjacency:
                adjacency[rel.target_id] = []
            adjacency[rel.target_id].append(
                (rel.source_id, rel.id, rel.weight)
            )

        while queue and len(visited_entities) < self.max_nodes:
            current_id, depth = queue.popleft()
            if depth >= self.max_depth:
                continue

            for neighbor_id, rel_id, weight in adjacency.get(current_id, []):
                visited_relations.add(rel_id)
                if neighbor_id not in visited_entities:
                    visited_entities.add(neighbor_id)
                    queue.append((neighbor_id, depth + 1))

        # 收集关联的文本块
        for eid in visited_entities:
            entity = self.graph_index.entities.get(eid)
            if entity:
                collected_chunks.update(entity.chunk_ids)
        for rel in self.graph_index.relations:
            if rel.id in visited_relations:
                collected_chunks.update(rel.chunk_ids)

        return {
            "entities": [
                self.graph_index.entities[eid]
                for eid in visited_entities
                if eid in self.graph_index.entities
            ],
            "relations": [
                rel for rel in self.graph_index.relations
                if rel.id in visited_relations
            ],
            "chunks": [
                self.graph_index.chunks[cid]
                for cid in collected_chunks
                if cid in self.graph_index.chunks
            ]
        }
```

### 6.4.4 局部搜索的完整实现

将实体链接、图遍历和答案生成串联起来：

```python
class LocalSearchEngine:
    """局部搜索引擎：基于实体和关系的精确检索"""

    def __init__(
        self,
        graph_index: GraphIndex,
        embedding_model: str = "text-embedding-3-small",
        llm_model: str = "gpt-4o",
        max_depth: int = 2,
        max_nodes: int = 30
    ):
        self.linker = EntityLinker(graph_index, embedding_model)
        self.traverser = LocalGraphTraverser(
            graph_index, max_depth, max_nodes
        )
        self.llm_model = llm_model

    def _build_local_context(self, traversal_result: Dict) -> str:
        """将遍历结果组织为结构化的上下文"""
        parts = []

        # 实体信息
        if traversal_result["entities"]:
            parts.append("## 相关实体")
            for entity in traversal_result["entities"]:
                parts.append(
                    f"- {entity.name} ({entity.type}): {entity.description}"
                )

        # 关系信息
        if traversal_result["relations"]:
            parts.append("\n## 相关关系")
            for rel in traversal_result["relations"]:
                src = self.linker.graph_index.entities[rel.source_id].name
                tgt = self.linker.graph_index.entities[rel.target_id].name
                parts.append(f"- {src} --[{rel.description}]--> {tgt}")

        # 原始文本块
        if traversal_result["chunks"]:
            parts.append("\n## 原始文本证据")
            for i, chunk in enumerate(traversal_result["chunks"], 1):
                parts.append(f"[证据 {i}] {chunk.text}")

        return "\n".join(parts)

    def search(self, query: str) -> str:
        """执行局部搜索"""
        # 步骤 1: 实体链接
        linked_entities = self.linker.link_entities(query)
        if not linked_entities:
            # 回退：使用 LLM 提取
            names = self.linker.extract_entities_llm(query)
            linked_entities = [
                e for e in self.linker.graph_index.entities.values()
                if e.name in names
            ]

        if not linked_entities:
            return "无法在知识图谱中找到与问题相关的实体。"

        # 步骤 2: 图遍历
        traversal = self.traverser.traverse(linked_entities)

        # 步骤 3: 构建上下文
        context = self._build_local_context(traversal)

        # 步骤 4: 生成答案
        prompt = (
            "你是一个知识问答助手。以下是从知识图谱中检索到的"
            "实体、关系和相关文本证据。\n"
            "请基于这些信息精确回答用户的问题。"
            "如果信息不足以回答问题，请如实说明。\n"
            "回答时请引用具体的证据编号。\n\n"
            f"【检索到的局部信息】\n{context}\n\n"
            f"【用户问题】\n{query}\n\n"
            "【回答】"
        )

        response = openai.chat.completions.create(
            model=self.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1024
        )
        return response.choices[0].message.content
```

## 6.5 搜索策略的选择

### 6.5.1 基于问题分类的自动选择

全局搜索和局部搜索各有优劣，选择的关键在于正确理解用户问题的类型。我们可以训练一个轻量级的问题分类器来自动选择搜索策略：

```python
class QueryClassifier:
    """问题分类器：自动选择搜索策略"""

    def __init__(self, llm_model: str = "gpt-4o-mini"):
        self.llm_model = llm_model

    def classify(self, query: str) -> str:
        """返回 'global' 或 'local' 或 'hybrid'"""
        prompt = (
            "分析以下问题，判断它最适合哪种搜索策略。\n\n"
            "策略说明：\n"
            "- global: 需要整体理解、总结、趋势分析、对比归纳的综合性问题\n"
            "- local: 需要精确事实、具体属性、关系路径的事实性问题\n"
            "- hybrid: 既需要整体背景又需要具体细节的复合型问题\n\n"
            "只返回策略名称（global/local/hybrid），不要其他内容。\n\n"
            f"问题: {query}"
        )
        response = openai.chat.completions.create(
            model=self.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=20
        )
        return response.choices[0].message.content.strip().lower()

    def classify_with_features(self, query: str) -> str:
        """基于特征工程的问题分类（无需 LLM 调用）"""
        query_lower = query.lower()

        # 全局搜索关键词
        global_keywords = {
            "总结", "概述", "总体", "所有", "全部", "整体",
            "趋势", "发展", "变化", "行业", "领域", "市场",
            "对比", "比较", "区别", "异同", "优缺点",
            "summary", "overview", "overall", "trend",
            "compare", "contrast", "difference"
        }

        # 局部搜索关键词
        local_keywords = {
            "是什么", "多少", "何时", "哪里", "谁",
            "关系", "属性", "属性值", "路径",
            "what is", "how many", "when", "where", "who",
            "relation", "attribute", "path between"
        }

        global_score = sum(
            1 for kw in global_keywords if kw in query_lower
        )
        local_score = sum(
            1 for kw in local_keywords if kw in query_lower
        )

        if global_score >= 2 and local_score >= 2:
            return "hybrid"
        elif global_score >= local_score:
            return "global"
        else:
            return "local"
```

### 6.5.2 混合搜索策略

对于复合型问题，最佳策略是同时执行全局搜索和局部搜索，然后融合结果：

```python
class HybridSearchEngine:
    """混合搜索引擎：融合全局与局部搜索"""

    def __init__(
        self,
        graph_index: GraphIndex,
        embedding_model: str = "text-embedding-3-small",
        llm_model: str = "gpt-4o"
    ):
        self.global_engine = GlobalSearchEngine(
            graph_index, embedding_model, llm_model
        )
        self.local_engine = LocalSearchEngine(
            graph_index, embedding_model, llm_model
        )
        self.classifier = QueryClassifier()

    def search(self, query: str) -> str:
        strategy = self.classifier.classify(query)

        if strategy == "global":
            return self.global_engine.search(query)
        elif strategy == "local":
            return self.local_engine.search(query)
        else:
            return self._hybrid_search(query)

    def _hybrid_search(self, query: str) -> str:
        """混合搜索：并行执行两种搜索后融合"""
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            global_future = executor.submit(
                self.global_engine.search, query
            )
            local_future = executor.submit(
                self.local_engine.search, query
            )

            global_result = global_future.result()
            local_result = local_future.result()

        return self._fuse_results(query, global_result, local_result)

    def _fuse_results(
        self,
        query: str,
        global_result: str,
        local_result: str
    ) -> str:
        """融合全局和局部搜索结果"""
        prompt = (
            "你是一个知识问答助手。以下是针对同一问题的两种搜索结果：\n\n"
            "【全局搜索（社区摘要）】\n"
            f"{global_result}\n\n"
            "【局部搜索（实体关系）】\n"
            f"{local_result}\n\n"
            "请综合以上两种来源的信息，生成一个全面、准确的回答。\n"
            "优先使用局部搜索中的精确事实，"
            "用全局搜索中的背景信息进行补充。\n"
            "如果存在矛盾，请指出并分析原因。\n\n"
            f"用户问题: {query}\n\n"
            "【综合回答】"
        )

        response = openai.chat.completions.create(
            model=self.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500
        )
        return response.choices[0].message.content
```

## 6.6 结果融合与排序

### 6.6.1 多源结果的结构化融合

当多个搜索路径返回结果时，需要将它们融合为一个连贯的答案。融合的关键挑战包括：

1. **信息冗余**：不同来源可能包含重复信息
2. **信息矛盾**：不同来源可能给出不一致的信息
3. **粒度差异**：全局信息偏概览，局部信息偏细节

```python
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class SearchResult:
    source: str  # "global" 或 "local"
    content: str
    relevance_score: float
    evidence_ids: List[str] = field(default_factory=list)
    community_id: Optional[str] = None
    entity_ids: List[str] = field(default_factory=list)

class ResultFusion:
    """多源搜索结果融合器"""

    def __init__(self, graph_index: GraphIndex):
        self.graph_index = graph_index

    def deduplicate(self, results: List[SearchResult]) -> List[SearchResult]:
        """基于语义相似度的去重"""
        if len(results) <= 1:
            return results

        texts = [r.content for r in results]
        embeddings = []
        for text in texts:
            response = openai.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            embeddings.append(np.array(response.data[0].embedding))

        # 计算相似度矩阵，合并高度相似的结果
        merged = []
        used = set()
        for i in range(len(results)):
            if i in used:
                continue
            cluster = [i]
            for j in range(i + 1, len(results)):
                if j in used:
                    continue
                sim = np.dot(embeddings[i], embeddings[j]) / (
                    np.linalg.norm(embeddings[i]) *
                    np.linalg.norm(embeddings[j])
                )
                if sim > 0.85:
                    cluster.append(j)
                    used.add(j)
            used.add(i)

            # 合并簇内结果
            cluster_results = [results[idx] for idx in cluster]
            merged.append(self._merge_cluster(cluster_results))

        return merged

    def _merge_cluster(
        self, cluster: List[SearchResult]
    ) -> SearchResult:
        """合并一个簇内的多个结果"""
        primary = max(cluster, key=lambda r: r.relevance_score)
        all_evidence = set()
        all_entities = set()
        for r in cluster:
            all_evidence.update(r.evidence_ids)
            all_entities.update(r.entity_ids)

        primary.evidence_ids = list(all_evidence)
        primary.entity_ids = list(all_entities)
        return primary

    def rank(self, results: List[SearchResult], query: str) -> List[SearchResult]:
        """基于多因素排序"""
        query_emb = self._embed(query)

        for result in results:
            result_emb = self._embed(result.content)
            semantic_score = np.dot(query_emb, result_emb) / (
                np.linalg.norm(query_emb) * np.linalg.norm(result_emb)
            )

            # 证据丰富度加分
            evidence_bonus = min(
                len(result.evidence_ids) * 0.05, 0.2
            )

            # 来源多样性加分（全局+局部优于单一来源）
            source_bonus = 0.1 if result.source == "hybrid" else 0.0

            result.relevance_score = (
                semantic_score * 0.7 +
                evidence_bonus +
                source_bonus
            )

        results.sort(key=lambda r: r.relevance_score, reverse=True)
        return results

    def _embed(self, text: str) -> np.ndarray:
        response = openai.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return np.array(response.data[0].embedding)
```

### 6.6.2 基于图结构的重排序

除了语义相似度，还可以利用图结构信息进行重排序。例如，与更多实体相连的节点（高中心性）可能包含更重要的信息：

```python
class GraphAwareRanker:
    """基于图结构的重排序器"""

    def __init__(self, graph_index: GraphIndex):
        self.graph_index = graph_index
        self._centrality: Dict[str, float] = {}

    def compute_centrality(self):
        """计算实体的 PageRank 中心性"""
        G = nx.Graph()
        for eid in self.graph_index.entities:
            G.add_node(eid)
        for rel in self.graph_index.relations:
            G.add_edge(rel.source_id, rel.target_id, weight=rel.weight)

        self._centrality = nx.pagerank(G, weight="weight")

    def rerank_by_centrality(
        self,
        results: List[SearchResult],
        alpha: float = 0.3
    ) -> List[SearchResult]:
        """用实体中心性调整排序分数"""
        if not self._centrality:
            self.compute_centrality()

        for result in results:
            if not result.entity_ids:
                continue
            avg_centrality = np.mean([
                self._centrality.get(eid, 0)
                for eid in result.entity_ids
            ])
            result.relevance_score = (
                (1 - alpha) * result.relevance_score +
                alpha * avg_centrality
            )

        results.sort(key=lambda r: r.relevance_score, reverse=True)
        return results
```

### 6.6.3 带引用的答案生成

最终答案应包含引用来源，增强可信度：

```python
class AnswerGenerator:
    """带引用的答案生成器"""

    def __init__(self, llm_model: str = "gpt-4o"):
        self.llm_model = llm_model

    def generate_with_citations(
        self,
        query: str,
        results: List[SearchResult]
    ) -> str:
        """生成带引用的答案"""
        evidence_sections = []
        for i, result in enumerate(results, 1):
            evidence_sections.append(
                f"[来源 {i}] ({result.source}) {result.content}"
            )

        evidence_text = "\n\n".join(evidence_sections)

        prompt = (
            "请基于以下检索结果回答用户问题。\n"
            "在回答中标注信息来源，格式为【来源 N】。\n"
            "如果多个来源信息一致，合并引用。\n"
            "如果存在矛盾，请指出。\n\n"
            f"【检索结果】\n{evidence_text}\n\n"
            f"【问题】\n{query}\n\n"
            "【回答】"
        )

        response = openai.chat.completions.create(
            model=self.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500
        )
        return response.choices[0].message.content
```

## 6.7 性能优化与工程实践

### 6.7.1 缓存策略

社区摘要和实体嵌入的计算成本较高，需要合理缓存：

```python
import hashlib
import json
from pathlib import Path

class SearchCache:
    """搜索缓存层"""

    def __init__(self, cache_dir: str = ".graphrag_cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _hash(self, text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()[:16]

    def get_community_summary(self, community_id: str) -> Optional[str]:
        path = self.cache_dir / f"comm_{community_id}.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return None

    def set_community_summary(self, community_id: str, summary: str):
        path = self.cache_dir / f"comm_{community_id}.json"
        path.write_text(
            json.dumps(summary, ensure_ascii=False),
            encoding="utf-8"
        )

    def get_embedding(self, text: str) -> Optional[np.ndarray]:
        key = self._hash(text)
        path = self.cache_dir / f"emb_{key}.npy"
        if path.exists():
            return np.load(str(path))
        return None

    def set_embedding(self, text: str, embedding: np.ndarray):
        key = self._hash(text)
        path = self.cache_dir / f"emb_{key}.npy"
        np.save(str(path), embedding)
```

### 6.7.2 批量处理与异步检索

对于大规模知识图谱，批量处理和异步检索可以显著提升性能：

```python
import asyncio
from openai import AsyncOpenAI

class AsyncSearchEngine:
    """异步搜索引擎"""

    def __init__(self, graph_index: GraphIndex):
        self.graph_index = graph_index
        self.client = AsyncOpenAI()

    async def batch_embed(self, texts: List[str]) -> List[np.ndarray]:
        """批量计算向量"""
        response = await self.client.embeddings.create(
            model="text-embedding-3-small",
            input=texts
        )
        return [
            np.array(d.embedding) for d in response.data
        ]

    async def parallel_global_local_search(
        self, query: str
    ) -> Tuple[str, str]:
        """并行执行全局和局部搜索"""
        async def global_search():
            # 全局搜索逻辑
            ...

        async def local_search():
            # 局部搜索逻辑
            ...

        results = await asyncio.gather(
            global_search(),
            local_search()
        )
        return results[0], results[1]
```

### 6.7.3 增量更新

知识图谱是动态变化的，搜索系统需要支持增量更新：

```python
class IncrementalIndexUpdater:
    """增量索引更新器"""

    def __init__(self, graph_index: GraphIndex):
        self.graph_index = graph_index

    def add_entity(self, entity: Entity):
        self.graph_index.entities[entity.id] = entity

    def add_relation(self, relation: Relation):
        self.graph_index.relations.append(relation)

    def remove_entity(self, entity_id: str):
        if entity_id in self.graph_index.entities:
            del self.graph_index.entities[entity_id]
        self.graph_index.relations = [
            r for r in self.graph_index.relations
            if r.source_id != entity_id and r.target_id != entity_id
        ]

    def mark_community_stale(self, entity_id: str):
        """标记包含该实体的社区为"脏"状态，需要重新生成摘要"""
        for level, communities in self.graph_index.communities.items():
            for comm in communities:
                if entity_id in comm.entity_ids:
                    comm.summary = ""  # 清空摘要，触发重新生成
```

## 6.8 评估与调优

### 6.8.1 搜索质量评估指标

评估搜索质量需要从多个维度进行：

```python
class SearchEvaluator:
    """搜索质量评估器"""

    def __init__(self):
        self.metrics = {}

    def evaluate_relevance(
        self,
        query: str,
        retrieved_contexts: List[str],
        ground_truth: str
    ) -> Dict:
        """评估检索相关性"""
        from rouge import Rouge

        rouge = Rouge()
        scores = rouge.get_scores(
            " ".join(retrieved_contexts),
            ground_truth
        )
        return {
            "rouge-1": scores[0]["rouge-1"]["f"],
            "rouge-2": scores[0]["rouge-2"]["f"],
            "rouge-l": scores[0]["rouge-l"]["f"]
        }

    def evaluate_answer_quality(
        self,
        query: str,
        answer: str,
        ground_truth: str
    ) -> Dict:
        """评估答案质量（使用 LLM 作为评判）"""
        prompt = (
            "请评估以下回答的质量。评估维度包括：\n"
            "1. 准确性（0-10）：信息是否准确\n"
            "2. 完整性（0-10）：是否覆盖了所有关键点\n"
            "3. 简洁性（0-10）：是否简洁明了\n"
            "4. 引用质量（0-10）：引用是否恰当\n\n"
            f"问题: {query}\n"
            f"标准答案: {ground_truth}\n"
            f"模型回答: {answer}\n\n"
            "返回 JSON 格式: "
            '{"accuracy": N, "completeness": N, '
            '"conciseness": N, "citation_quality": N}'
        )

        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"}
        )
        return json.loads(
            response.choices[0].message.content
        )
```

### 6.8.2 超参数调优

搜索系统的关键超参数包括：

| 参数 | 全局搜索 | 局部搜索 | 影响 |
|------|---------|---------|------|
| top_k_communities | 3-10 | - | 社区数量越多，上下文越丰富但噪声也越多 |
| max_depth | - | 1-3 | 深度越大，覆盖范围越广但可能偏离主题 |
| max_nodes | - | 20-100 | 节点数限制影响检索的广度 |
| similarity_threshold | 0.5-0.7 | 0.5-0.7 | 阈值越高，检索越精确但可能遗漏 |
| temperature | 0.2-0.4 | 0.1-0.3 | 生成温度影响答案的创造性 |

```python
class HyperparameterTuner:
    """超参数自动调优"""

    def __init__(self, graph_index: GraphIndex, eval_queries: List[Tuple[str, str]]):
        self.graph_index = graph_index
        self.eval_queries = eval_queries  # (query, ground_truth) 列表

    def grid_search(self):
        """网格搜索最佳超参数"""
        param_grid = {
            "top_k_communities": [3, 5, 7, 10],
            "max_depth": [1, 2, 3],
            "max_nodes": [20, 50, 100],
        }

        best_score = 0
        best_params = {}

        for top_k in param_grid["top_k_communities"]:
            for depth in param_grid["max_depth"]:
                for nodes in param_grid["max_nodes"]:
                    score = self._evaluate_params(top_k, depth, nodes)
                    if score > best_score:
                        best_score = score
                        best_params = {
                            "top_k_communities": top_k,
                            "max_depth": depth,
                            "max_nodes": nodes
                        }

        return best_params, best_score

    def _evaluate_params(
        self, top_k: int, depth: int, max_nodes: int
    ) -> float:
        """评估一组参数的平均得分"""
        total_score = 0.0
        for query, truth in self.eval_queries:
            # 使用当前参数执行搜索
            engine = LocalSearchEngine(
                self.graph_index,
                max_depth=depth,
                max_nodes=max_nodes
            )
            answer = engine.search(query)
            # 简单评估：计算与标准答案的语义相似度
            score = self._semantic_similarity(answer, truth)
            total_score += score

        return total_score / len(self.eval_queries)

    def _semantic_similarity(self, text1: str, text2: str) -> float:
        emb1 = self._embed(text1)
        emb2 = self._embed(text2)
        return float(np.dot(emb1, emb2) / (
            np.linalg.norm(emb1) * np.linalg.norm(emb2)
        ))

    def _embed(self, text: str) -> np.ndarray:
        response = openai.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return np.array(response.data[0].embedding)
```

## 6.9 实战案例：完整的搜索系统

下面给出一个完整的端到端搜索系统实现，整合本章所有核心概念：

```python
class GraphRAGSearchSystem:
    """完整的 GraphRAG 搜索系统"""

    def __init__(
        self,
        graph_index: GraphIndex,
        cache_dir: str = ".graphrag_cache",
        default_strategy: str = "auto"
    ):
        self.graph_index = graph_index
        self.cache = SearchCache(cache_dir)
        self.classifier = QueryClassifier()
        self.default_strategy = default_strategy

        # 初始化引擎
        self.global_engine = GlobalSearchEngine(graph_index)
        self.local_engine = LocalSearchEngine(graph_index)
        self.hybrid_engine = HybridSearchEngine(graph_index)
        self.fusion = ResultFusion(graph_index)
        self.ranker = GraphAwareRanker(graph_index)
        self.generator = AnswerGenerator()

    def search(
        self,
        query: str,
        strategy: Optional[str] = None,
        with_citations: bool = True
    ) -> Dict:
        """
        执行搜索

        Args:
            query: 用户问题
            strategy: 搜索策略 (global/local/hybrid/auto)
            with_citations: 是否生成带引用的答案

        Returns:
            {"answer": str, "strategy": str, "sources": List[SearchResult]}
        """
        strategy = strategy or self.default_strategy
        if strategy == "auto":
            strategy = self.classifier.classify(query)

        # 执行搜索
        if strategy == "global":
            answer = self.global_engine.search(query)
            sources = []
        elif strategy == "local":
            answer = self.local_engine.search(query)
            sources = []
        else:
            answer = self.hybrid_engine.search(query)
            sources = []

        return {
            "answer": answer,
            "strategy": strategy,
            "sources": sources
        }

    def search_with_ranking(
        self,
        query: str,
        strategy: str = "hybrid"
    ) -> Dict:
        """带排序和融合的高级搜索"""
        # 并行执行两种搜索
        global_result = self.global_engine.search(query)
        local_result = self.local_engine.search(query)

        # 构建 SearchResult 对象
        results = [
            SearchResult(
                source="global",
                content=global_result,
                relevance_score=0.0
            ),
            SearchResult(
                source="local",
                content=local_result,
                relevance_score=0.0
            )
        ]

        # 去重与排序
        results = self.fusion.deduplicate(results)
        results = self.fusion.rank(results, query)
        results = self.ranker.rerank_by_centrality(results)

        # 生成带引用的答案
        answer = self.generator.generate_with_citations(query, results)

        return {
            "answer": answer,
            "strategy": "hybrid",
            "sources": results
        }


# 使用示例
if __name__ == "__main__":
    # 假设已经构建了 graph_index
    # graph_index = build_graph_index(...)

    # system = GraphRAGSearchSystem(graph_index)
    #
    # # 全局搜索示例
    # result = system.search(
    #     "请总结这家公司的主要业务和发展历程",
    #     strategy="global"
    # )
    # print(result["answer"])
    #
    # # 局部搜索示例
    # result = system.search(
    #     "张三的职位是什么？他和李四是什么关系？",
    #     strategy="local"
    # )
    # print(result["answer"])
    #
    # # 自动选择策略
    # result = system.search("对比A方案和B方案的优缺点", strategy="auto")
    # print(result["answer"])
    pass
```

## 6.10 本章小结

GraphRAG 的全局搜索与局部搜索构成了一个完整的检索增强生成体系。全局搜索通过社区摘要提供宏观视角，适合回答综合性、概述性问题；局部搜索通过实体-关系遍历提供精确事实，适合回答具体、事实性问题。两种策略的融合使用，使得 GraphRAG 能够在单一框架内同时处理"森林"和"树木"两个层面的查询需求。

关键要点总结：

1. **全局搜索**以社区摘要为检索单元，通过 Leiden 算法聚类、LLM 摘要生成和语义匹配实现宏观检索
2. **局部搜索**以实体为入口，通过 BFS 图遍历收集邻居实体、关系和原始文本，实现微观检索
3. **策略选择**可通过关键词特征或 LLM 分类器自动判断，也可根据业务场景固定配置
4. **结果融合**需要解决冗余、矛盾和粒度差异问题，图结构信息可作为重排序的额外信号
5. **工程实践**中应关注缓存、异步处理、增量更新和超参数调优等性能优化手段

在实际生产系统中，建议采用"混合搜索 + 自动分类"的默认配置，同时提供显式策略参数供高级用户覆盖。随着图索引规模的扩大，社区摘要的预计算和缓存策略将成为系统性能的关键瓶颈，值得投入更多的工程优化。

在下一章中，我们将探讨 GraphRAG 的查询改写与多轮对话机制，进一步扩展搜索系统的交互能力。
