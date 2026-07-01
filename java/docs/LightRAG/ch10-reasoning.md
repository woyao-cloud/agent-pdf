# 第10章 多文档关系推理

多文档关系推理（Multi-Document Relationship Reasoning）是图增强 RAG 系统最具挑战性也最具价值的应用方向。当信息分散在多个文档中，且需要跨文档关联实体、追踪关系路径、检测信息矛盾时，传统基于向量相似度的 RAG 系统几乎无能为力。LightRAG 的图索引结构天然适合这类任务——它将实体和关系显式建模为图结构，使得跨文档的关联推理成为可能。

本章将从跨文档实体链接、关系路径推理、矛盾检测与一致性检查三个核心问题出发，系统讲解如何基于 LightRAG 构建多文档关系推理系统，并提供一个完整的端到端代码示例。

---

## 10.1 跨文档实体链接

### 10.1.1 问题定义

跨文档实体链接（Cross-Document Entity Linking, CDEL）是指将不同文档中指向同一真实世界对象的实体提及（entity mention）识别并关联起来的过程。这是多文档关系推理的基础——只有正确链接了跨文档的同一实体，后续的关系路径推理和矛盾检测才有意义。

**典型场景**：

- 文档 A 提到"苹果公司发布了新款 iPhone"，文档 B 提到"Apple 的季度营收超出预期"——需要将"苹果公司"和"Apple"链接为同一实体
- 文档 C 提到"OpenAI 的 CEO Sam Altman"，文档 D 提到"奥特曼在国会作证"——需要将"Sam Altman"和"奥特曼"链接为同一实体
- 文档 E 提到"GPT-4 有 1.7 万亿参数"，文档 F 提到"GPT-4 的参数量约为 1 万亿"——需要链接到同一实体"GPT-4"，并标记属性矛盾

**核心挑战**：

| 挑战 | 描述 | 示例 |
|------|------|------|
| **名称变体** | 同一实体在不同文档中使用不同名称 | "OpenAI" vs "OpenAI公司" vs "OpenAI研究机构" |
| **缩写与全称** | 缩写和全称交替使用 | "IBM" vs "International Business Machines" |
| **跨语言指代** | 不同语言的名称指代同一实体 | "乔布斯" vs "Steve Jobs" |
| **指代消解** | 代词和间接指代 | "这家公司"、"该机构" |
| **歧义消解** | 同一名称可能指代不同实体 | "苹果"（水果 vs 公司） |

### 10.1.2 基于图结构的实体链接

LightRAG 的图索引为跨文档实体链接提供了天然的基础设施。每个实体在图中是一个节点，携带名称、类型、描述和向量嵌入。跨文档实体链接的核心任务就是判断两个节点是否指向同一真实世界对象。

以下是一个完整的跨文档实体链接系统实现：

```python
import numpy as np
from typing import List, Dict, Tuple, Optional, Set
from dataclasses import dataclass, field
from collections import defaultdict
import json
import re


@dataclass
class EntityMention:
    """文档中的实体提及"""
    text: str                    # 提及文本
    doc_id: str                  # 来源文档 ID
    position: int = 0            # 在文档中的位置
    context: str = ""            # 上下文片段
    entity_type: str = "unknown" # 实体类型


@dataclass
class EntityNode:
    """图结构中的实体节点"""
    id: str                      # 唯一标识
    canonical_name: str          # 规范名称
    aliases: Set[str] = field(default_factory=set)
    entity_type: str = "unknown"
    description: str = ""
    embedding: Optional[np.ndarray] = None
    mentions: List[EntityMention] = field(default_factory=list)
    source_docs: Set[str] = field(default_factory=set)


class CrossDocEntityLinker:
    """跨文档实体链接器"""

    def __init__(
        self,
        name_sim_threshold: float = 0.78,
        embedding_sim_threshold: float = 0.85,
        context_sim_threshold: float = 0.70,
    ):
        self.name_threshold = name_sim_threshold
        self.embedding_threshold = embedding_sim_threshold
        self.context_threshold = context_sim_threshold
        self.entities: Dict[str, EntityNode] = {}  # id -> EntityNode
        self.name_index: Dict[str, str] = {}        # name -> entity_id

    def add_entity(self, entity: EntityNode):
        """添加实体到索引"""
        self.entities[entity.id] = entity
        self.name_index[entity.canonical_name] = entity.id
        for alias in entity.aliases:
            self.name_index[alias] = entity.id

    def extract_mentions_from_doc(self, text: str, doc_id: str) -> List[EntityMention]:
        """从文档中提取实体提及（简化版 NER）"""
        mentions = []

        # 使用正则匹配常见实体模式
        patterns = [
            (r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:公司|集团|机构|组织|大学|研究院)", "organization"),
            (r"(?:OpenAI|Google|Microsoft|Apple|Meta|Amazon|特斯拉|英伟达|华为|腾讯|阿里巴巴)", "organization"),
            (r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:教授|博士|先生|女士|CEO|创始人|董事长)", "person"),
            (r"(?:GPT-\d|BERT|LLaMA|Claude|Gemini|Stable\s+Diffusion)", "product"),
            (r"(?:iPhone|iPad|Mac|Vision\s+Pro|Model\s+[S3XY])", "product"),
        ]

        for pattern, etype in patterns:
            for match in re.finditer(pattern, text):
                start = max(0, match.start() - 50)
                end = min(len(text), match.end() + 50)
                context = text[start:end]
                mentions.append(EntityMention(
                    text=match.group(),
                    doc_id=doc_id,
                    position=match.start(),
                    context=context,
                    entity_type=etype,
                ))

        return mentions

    def compute_name_similarity(self, name1: str, name2: str) -> float:
        """计算名称相似度（基于字符重叠和编辑距离）"""
        # 归一化
        n1 = name1.lower().replace(" ", "").replace("-", "").replace("_", "")
        n2 = name2.lower().replace(" ", "").replace("-", "").replace("_", "")

        if n1 == n2:
            return 1.0

        # 检查包含关系
        if n1 in n2 or n2 in n1:
            return 0.9

        # 计算 Jaccard 相似度（基于字符 bigram）
        def bigrams(s: str) -> Set[str]:
            return {s[i:i+2] for i in range(len(s)-1)}

        bg1 = bigrams(n1)
        bg2 = bigrams(n2)
        if not bg1 or not bg2:
            return 0.0

        intersection = bg1 & bg2
        union = bg1 | bg2
        return len(intersection) / len(union)

    def compute_context_similarity(self, ctx1: str, ctx2: str) -> float:
        """计算上下文语义相似度"""
        # 使用词袋模型 + TF 权重
        def tokenize(text: str) -> Set[str]:
            tokens = re.findall(r"[a-zA-Z\u4e00-\u9fff]+", text.lower())
            return set(tokens)

        tok1 = tokenize(ctx1)
        tok2 = tokenize(ctx2)

        if not tok1 or not tok2:
            return 0.0

        intersection = tok1 & tok2
        union = tok1 | tok2
        return len(intersection) / len(union)

    def link_mentions_to_entities(
        self, mentions: List[EntityMention]
    ) -> Dict[str, List[EntityMention]]:
        """将提及链接到已有实体"""
        linked: Dict[str, List[EntityMention]] = defaultdict(list)

        for mention in mentions:
            best_entity_id = None
            best_score = 0.0

            for entity_id, entity in self.entities.items():
                # 1. 名称匹配
                name_score = self.compute_name_similarity(
                    mention.text, entity.canonical_name
                )

                # 检查别名
                for alias in entity.aliases:
                    alias_score = self.compute_name_similarity(mention.text, alias)
                    name_score = max(name_score, alias_score)

                # 2. 上下文匹配
                context_score = 0.0
                for existing_mention in entity.mentions:
                    cs = self.compute_context_similarity(
                        mention.context, existing_mention.context
                    )
                    context_score = max(context_score, cs)

                # 3. 类型匹配
                type_score = 1.0 if mention.entity_type == entity.entity_type else 0.3

                # 综合评分
                combined = 0.5 * name_score + 0.3 * context_score + 0.2 * type_score

                if combined > best_score:
                    best_score = combined
                    best_entity_id = entity_id

            # 阈值判断
            if best_score >= self.name_threshold and best_entity_id:
                linked[best_entity_id].append(mention)
            else:
                # 创建新实体
                new_id = f"entity_{len(self.entities)}"
                new_entity = EntityNode(
                    id=new_id,
                    canonical_name=mention.text,
                    entity_type=mention.entity_type,
                    mentions=[mention],
                    source_docs={mention.doc_id},
                )
                self.add_entity(new_entity)
                linked[new_id].append(mention)

        return linked

    def discover_cross_doc_links(self) -> List[Tuple[str, str, float]]:
        """发现跨文档的实体链接（全图扫描）"""
        links = []
        entity_list = list(self.entities.values())

        for i in range(len(entity_list)):
            for j in range(i + 1, len(entity_list)):
                e1, e2 = entity_list[i], entity_list[j]

                # 跳过同一文档的实体
                if e1.source_docs == e2.source_docs:
                    continue

                # 计算综合相似度
                name_score = self.compute_name_similarity(
                    e1.canonical_name, e2.canonical_name
                )

                context_score = 0.0
                for m1 in e1.mentions:
                    for m2 in e2.mentions:
                        cs = self.compute_context_similarity(m1.context, m2.context)
                        context_score = max(context_score, cs)

                type_score = 1.0 if e1.entity_type == e2.entity_type else 0.3
                combined = 0.4 * name_score + 0.4 * context_score + 0.2 * type_score

                if combined >= self.name_threshold:
                    links.append((e1.id, e2.id, combined))

        return links

    def merge_linked_entities(self, links: List[Tuple[str, str, float]]):
        """合并被链接的实体对"""
        for id1, id2, score in links:
            if id1 not in self.entities or id2 not in self.entities:
                continue

            primary = self.entities[id1]
            secondary = self.entities[id2]

            # 合并别名
            primary.aliases.add(secondary.canonical_name)
            primary.aliases.update(secondary.aliases)

            # 合并提及
            primary.mentions.extend(secondary.mentions)

            # 合并来源文档
            primary.source_docs.update(secondary.source_docs)

            # 合并描述
            if secondary.description and secondary.description not in primary.description:
                primary.description = (
                    f"{primary.description}；{secondary.description}"
                    if primary.description else secondary.description
                )

            # 合并嵌入（平均）
            if primary.embedding is not None and secondary.embedding is not None:
                primary.embedding = (primary.embedding + secondary.embedding) / 2.0
            elif secondary.embedding is not None:
                primary.embedding = secondary.embedding

            # 更新名称索引
            self.name_index[secondary.canonical_name] = primary.id

            # 删除被合并的实体
            del self.entities[id2]

    def build_cross_doc_entity_graph(self) -> Dict[str, Dict]:
        """构建跨文档实体关系图"""
        graph = {}
        for eid, entity in self.entities.items():
            graph[eid] = {
                "canonical_name": entity.canonical_name,
                "aliases": list(entity.aliases),
                "entity_type": entity.entity_type,
                "source_docs": list(entity.source_docs),
                "mention_count": len(entity.mentions),
                "description": entity.description[:200] if entity.description else "",
            }
        return graph


# 演示：跨文档实体链接
def demo_cross_doc_entity_linking():
    """跨文档实体链接演示"""
    linker = CrossDocEntityLinker()

    # 模拟多文档输入
    documents = {
        "doc_1": "苹果公司今天发布了新款iPhone 16 Pro Max，搭载A18 Pro芯片。"
                 "这款产品在性能上比上一代提升了30%。",
        "doc_2": "Apple Inc. 公布了2024年第四季度财报，营收超出市场预期。"
                 "Tim Cook 表示对Vision Pro的市场表现感到满意。",
        "doc_3": "OpenAI 发布了GPT-4o模型，支持多模态输入。"
                 "Sam Altman 在发布会上展示了模型的新能力。",
        "doc_4": "OpenAI研究机构宣布与苹果公司达成合作协议，"
                 "将在iOS系统中集成GPT技术。库克和奥特曼共同出席了签约仪式。",
    }

    print("=" * 60)
    print("跨文档实体链接演示")
    print("=" * 60)

    # 提取并链接实体
    all_mentions = []
    for doc_id, text in documents.items():
        mentions = linker.extract_mentions_from_doc(text, doc_id)
        all_mentions.extend(mentions)
        print(f"\n文档 {doc_id} 提取的实体提及:")
        for m in mentions:
            print(f"  [{m.entity_type}] {m.text}")

    # 链接到实体
    linked = linker.link_mentions_to_entities(all_mentions)
    print(f"\n\n链接结果: {len(linker.entities)} 个唯一实体")

    for eid, entity in linker.entities.items():
        print(f"\n  [{eid}] {entity.canonical_name} ({entity.entity_type})")
        print(f"    别名: {list(entity.aliases)}")
        print(f"    来源文档: {entity.source_docs}")
        print(f"    提及次数: {len(entity.mentions)}")

    # 发现跨文档链接
    print("\n\n发现跨文档实体链接...")
    links = linker.discover_cross_doc_links()
    if links:
        for id1, id2, score in links:
            e1 = linker.entities[id1]
            e2 = linker.entities[id2]
            print(f"  {e1.canonical_name} <-> {e2.canonical_name} (相似度: {score:.3f})")

        print("\n合并链接实体...")
        linker.merge_linked_entities(links)
        print(f"合并后实体数量: {len(linker.entities)}")

    # 输出最终实体图
    print("\n\n最终跨文档实体图:")
    graph = linker.build_cross_doc_entity_graph()
    for eid, info in graph.items():
        print(f"  {info['canonical_name']}: 来源 {info['source_docs']}, "
              f"提及 {info['mention_count']} 次")

    return linker


if __name__ == "__main__":
    linker = demo_cross_doc_entity_linking()
```

### 10.1.3 基于 LightRAG 的实体链接

在实际的 LightRAG 系统中，跨文档实体链接可以直接利用图索引中的实体节点和关系边。以下代码展示了如何从 LightRAG 的图结构中提取跨文档实体关系：

```python
import networkx as nx
from lightrag import LightRAG
from lightrag.base import QueryParam


class LightRAGEntityLinker:
    """基于 LightRAG 的跨文档实体链接器"""

    def __init__(self, rag: LightRAG):
        self.rag = rag
        self.graph = self._extract_graph()

    def _extract_graph(self) -> nx.Graph:
        """从 LightRAG 中提取图结构"""
        try:
            graph = self.rag.graph
            return graph
        except AttributeError:
            print("警告: 无法直接访问 LightRAG 内部图结构")
            return nx.Graph()

    def find_entity_by_name(self, name: str) -> List[Dict]:
        """通过名称查找实体"""
        results = []
        for node, data in self.graph.nodes(data=True):
            if name.lower() in node.lower():
                results.append({
                    "name": node,
                    "type": data.get("type", "unknown"),
                    "description": data.get("description", ""),
                })
            else:
                aliases = data.get("aliases", [])
                if isinstance(aliases, list):
                    for alias in aliases:
                        if name.lower() in alias.lower():
                            results.append({
                                "name": node,
                                "type": data.get("type", "unknown"),
                                "description": data.get("description", ""),
                                "matched_alias": alias,
                            })
                            break
        return results

    def get_cross_doc_entities(self, doc_ids: List[str]) -> Dict[str, List[str]]:
        """获取跨文档的共享实体"""
        doc_entities = defaultdict(set)

        for node, data in self.graph.nodes(data=True):
            source_docs = data.get("source_docs", [])
            if isinstance(source_docs, str):
                source_docs = [source_docs]

            for doc_id in source_docs:
                if doc_id in doc_ids:
                    doc_entities[doc_id].add(node)

        # 找出跨文档共享的实体
        shared = defaultdict(list)
        for entity in set().union(*doc_entities.values()):
            appearing_docs = [
                doc_id for doc_id in doc_ids
                if entity in doc_entities.get(doc_id, set())
            ]
            if len(appearing_docs) > 1:
                shared[entity] = appearing_docs

        return dict(shared)

    def query_cross_doc_entity(self, entity_name: str) -> Dict:
        """查询跨文档实体的完整信息"""
        entities = self.find_entity_by_name(entity_name)
        if not entities:
            return {"entity": entity_name, "found": False}

        result = {
            "entity": entity_name,
            "found": True,
            "matches": [],
        }

        for ent in entities:
            node_data = self.graph.nodes[ent["name"]]
            neighbors = list(self.graph.neighbors(ent["name"]))

            match_info = {
                "canonical_name": ent["name"],
                "type": ent["type"],
                "description": ent["description"],
                "source_docs": node_data.get("source_docs", []),
                "related_entities": [
                    {
                        "name": n,
                        "relation": self.graph.get_edge_data(ent["name"], n),
                    }
                    for n in neighbors[:10]
                ],
            }
            result["matches"].append(match_info)

        return result


# 使用示例
def demo_lightrag_entity_linking():
    """基于 LightRAG 的实体链接演示"""
    # 假设已有 LightRAG 实例
    # rag = LightRAG(working_dir="./index")
    # linker = LightRAGEntityLinker(rag)

    print("跨文档实体查询示例:")
    print("  query: '苹果公司与OpenAI的关系'")
    print("  预期: 链接 doc_3 和 doc_4 中的实体")
    print("  输出: 跨文档实体关系图")
```

### 10.1.4 实体链接的质量评估

跨文档实体链接的质量直接影响后续推理的准确性。以下是常用的评估指标：

| 指标 | 定义 | 计算公式 |
|------|------|---------|
| **精确率（Precision）** | 正确链接的比例 | TP / (TP + FP) |
| **召回率（Recall）** | 应链接实体的发现比例 | TP / (TP + FN) |
| **F1 分数** | 精确率和召回率的调和平均 | 2 × P × R / (P + R) |
| **链接准确率** | 链接到正确实体的比例 | 正确链接数 / 总链接数 |

```python
class EntityLinkingEvaluator:
    """实体链接质量评估器"""

    def __init__(self, ground_truth: Dict[str, Set[str]]):
        """
        ground_truth: {entity_id: {linked_entity_ids}}
        """
        self.gt = ground_truth

    def evaluate(self, predictions: Dict[str, Set[str]]) -> Dict:
        """评估链接质量"""
        tp = fp = fn = 0

        for eid, predicted_set in predictions.items():
            true_set = self.gt.get(eid, set())

            for pid in predicted_set:
                if pid in true_set:
                    tp += 1
                else:
                    fp += 1

            for tid in true_set:
                if tid not in predicted_set:
                    fn += 1

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

        return {
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
        }
```

---

## 10.2 关系路径推理

### 10.2.1 问题定义

关系路径推理（Relationship Path Reasoning）是指在知识图谱中，通过追踪实体之间的多跳关系路径，发现间接关联和隐含知识的过程。这是多文档关系推理的核心能力——当两个实体没有直接关系时，需要通过中间实体建立关联路径。

**典型问题**：

- "OpenAI 和苹果公司之间有什么关系？" → 需要发现"OpenAI 与苹果合作 → 苹果生产 iPhone → iPhone 使用 AI 技术"的路径
- "Vision Pro 的芯片供应商是谁？" → 需要发现"Vision Pro 使用 M2 芯片 → M2 由苹果设计 → 由台积电生产"的路径
- "Sam Altman 和哪些公司有关联？" → 需要发现"Sam Altman 是 OpenAI 的 CEO → OpenAI 与微软合作 → 微软投资 OpenAI"的路径

### 10.2.2 图路径搜索算法

关系路径推理的核心是图路径搜索。以下实现提供了多种路径搜索策略：

```python
from typing import List, Tuple, Generator
import heapq
from collections import deque


class RelationshipPathFinder:
    """关系路径查找器"""

    def __init__(self, graph: nx.Graph):
        self.graph = graph

    def find_all_paths(
        self, source: str, target: str,
        max_depth: int = 4, max_paths: int = 10
    ) -> List[List[Dict]]:
        """查找两个实体之间的所有路径（BFS）"""
        paths = []
        queue = deque()
        queue.append([source])

        while queue and len(paths) < max_paths:
            current_path = queue.popleft()
            current_node = current_path[-1]

            if len(current_path) > max_depth:
                continue

            for neighbor in self.graph.neighbors(current_node):
                if neighbor in current_path:
                    continue

                new_path = current_path + [neighbor]
                edge_data = self.graph.get_edge_data(current_node, neighbor)

                if neighbor == target:
                    paths.append(self._path_to_detail(new_path))
                    if len(paths) >= max_paths:
                        break
                else:
                    if len(new_path) < max_depth:
                        queue.append(new_path)

        return paths

    def find_shortest_path(
        self, source: str, target: str
    ) -> Optional[List[Dict]]:
        """查找最短路径（BFS）"""
        try:
            path = nx.shortest_path(self.graph, source=source, target=target)
            return self._path_to_detail(path)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None

    def find_weighted_shortest_path(
        self, source: str, target: str
    ) -> Optional[List[Dict]]:
        """查找加权最短路径（Dijkstra）"""
        try:
            path = nx.shortest_path(
                self.graph, source=source, target=target,
                weight="weight"
            )
            return self._path_to_detail(path)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None

    def find_top_k_paths(
        self, source: str, target: str,
        k: int = 5, max_depth: int = 5
    ) -> List[List[Dict]]:
        """查找 Top-K 路径（基于路径长度和边权重）"""
        all_paths = self.find_all_paths(source, target, max_depth, k * 3)
        scored_paths = []

        for path in all_paths:
            score = self._score_path(path)
            scored_paths.append((score, path))

        scored_paths.sort(key=lambda x: x[0], reverse=True)
        return [p for _, p in scored_paths[:k]]

    def find_paths_between_groups(
        self, source_group: List[str], target_group: List[str],
        max_depth: int = 4, max_paths: int = 20
    ) -> List[Dict]:
        """查找两组实体之间的所有路径"""
        results = []

        for src in source_group:
            for tgt in target_group:
                if src == tgt:
                    continue
                paths = self.find_all_paths(src, tgt, max_depth, 5)
                for path in paths:
                    results.append({
                        "source": src,
                        "target": tgt,
                        "path": path,
                        "path_length": len(path) - 1,
                    })

        results.sort(key=lambda x: x["path_length"])
        return results[:max_paths]

    def _path_to_detail(self, path: List[str]) -> List[Dict]:
        """将路径节点列表转换为详细路径"""
        detail = []
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            edge_data = self.graph.get_edge_data(u, v) or {}
            detail.append({
                "source": u,
                "target": v,
                "relation_type": edge_data.get("type", "related_to"),
                "description": edge_data.get("description", ""),
                "weight": edge_data.get("weight", 1.0),
            })
        return detail

    def _score_path(self, path: List[Dict]) -> float:
        """评估路径质量"""
        if not path:
            return 0.0

        # 路径越短越好
        length_penalty = 1.0 / (1.0 + len(path) * 0.2)

        # 边权重越高越好
        avg_weight = sum(
            step.get("weight", 1.0) for step in path
        ) / len(path)

        return length_penalty * avg_weight

    def explain_relationship(
        self, source: str, target: str, max_depth: int = 4
    ) -> Dict:
        """解释两个实体之间的关系"""
        # 1. 检查直接关系
        if self.graph.has_edge(source, target):
            edge_data = self.graph.get_edge_data(source, target)
            return {
                "source": source,
                "target": target,
                "relationship": "direct",
                "direct_relation": {
                    "type": edge_data.get("type", "related_to"),
                    "description": edge_data.get("description", ""),
                },
                "paths": [],
            }

        # 2. 查找间接路径
        paths = self.find_all_paths(source, target, max_depth, 5)

        if not paths:
            return {
                "source": source,
                "target": target,
                "relationship": "none",
                "direct_relation": None,
                "paths": [],
                "message": f"在 {max_depth} 跳内未发现关联路径",
            }

        # 3. 选择最佳路径
        best_path = max(paths, key=self._score_path)

        return {
            "source": source,
            "target": target,
            "relationship": "indirect",
            "direct_relation": None,
            "paths": paths,
            "best_path": best_path,
            "path_length": len(best_path),
            "path_description": self._describe_path(best_path),
        }

    def _describe_path(self, path: List[Dict]) -> str:
        """生成路径的自然语言描述"""
        if not path:
            return "无路径"

        parts = [path[0]["source"]]
        for step in path:
            rel = step.get("relation_type", "关联")
            desc = step.get("description", "")
            parts.append(f"--[{rel}]--> {step['target']}")

        return " → ".join(parts)


# 演示：关系路径推理
def demo_relationship_path_reasoning():
    """关系路径推理演示"""
    import networkx as nx

    # 构建示例图
    G = nx.Graph()

    # 添加实体节点
    entities = [
        ("苹果公司", {"type": "organization", "description": "科技公司"}),
        ("OpenAI", {"type": "organization", "description": "AI研究公司"}),
        ("微软", {"type": "organization", "description": "软件公司"}),
        ("Sam Altman", {"type": "person", "description": "OpenAI CEO"}),
        ("Tim Cook", {"type": "person", "description": "苹果公司 CEO"}),
        ("GPT-4", {"type": "product", "description": "大语言模型"}),
        ("Vision Pro", {"type": "product", "description": "混合现实头显"}),
        ("M2芯片", {"type": "product", "description": "苹果自研芯片"}),
        ("台积电", {"type": "organization", "description": "半导体代工厂"}),
        ("iOS", {"type": "product", "description": "苹果操作系统"}),
    ]

    for name, data in entities:
        G.add_node(name, **data)

    # 添加关系边
    relations = [
        ("苹果公司", "Tim Cook", {"type": "雇佣", "weight": 0.9}),
        ("苹果公司", "Vision Pro", {"type": "生产", "weight": 0.9}),
        ("苹果公司", "M2芯片", {"type": "设计", "weight": 0.8}),
        ("苹果公司", "iOS", {"type": "开发", "weight": 0.9}),
        ("苹果公司", "OpenAI", {"type": "合作", "weight": 0.7}),
        ("OpenAI", "Sam Altman", {"type": "雇佣", "weight": 0.9}),
        ("OpenAI", "GPT-4", {"type": "开发", "weight": 0.9}),
        ("OpenAI", "微软", {"type": "投资", "weight": 0.8}),
        ("微软", "Sam Altman", {"type": "合作", "weight": 0.6}),
        ("M2芯片", "台积电", {"type": "代工", "weight": 0.8}),
        ("Vision Pro", "M2芯片", {"type": "搭载", "weight": 0.9}),
        ("iOS", "GPT-4", {"type": "集成", "weight": 0.6}),
    ]

    for u, v, data in relations:
        G.add_edge(u, v, **data)

    finder = RelationshipPathFinder(G)

    print("=" * 60)
    print("关系路径推理演示")
    print("=" * 60)

    # 测试 1：直接关系
    print("\n--- 测试 1: 直接关系 ---")
    result = finder.explain_relationship("苹果公司", "Tim Cook")
    print(f"  关系: {result['relationship']}")
    if result.get("direct_relation"):
        print(f"  类型: {result['direct_relation']['type']}")

    # 测试 2：间接关系（多跳）
    print("\n--- 测试 2: 间接关系（多跳）---")
    result = finder.explain_relationship("Sam Altman", "Vision Pro", max_depth=4)
    print(f"  关系: {result['relationship']}")
    print(f"  路径长度: {result.get('path_length', 'N/A')}")
    print(f"  最佳路径: {result.get('path_description', '无')}")

    # 测试 3：多路径发现
    print("\n--- 测试 3: 多路径发现 ---")
    paths = finder.find_all_paths("Sam Altman", "苹果公司", max_depth=4, max_paths=5)
    print(f"  发现 {len(paths)} 条路径:")
    for i, path in enumerate(paths, 1):
        desc = finder._describe_path(path)
        score = finder._score_path(path)
        print(f"  路径 {i} (评分 {score:.3f}): {desc}")

    # 测试 4：Top-K 路径
    print("\n--- 测试 4: Top-K 路径 ---")
    top_paths = finder.find_top_k_paths("Sam Altman", "苹果公司", k=3, max_depth=4)
    for i, path in enumerate(top_paths, 1):
        desc = finder._describe_path(path)
        print(f"  Top-{i}: {desc}")

    # 测试 5：组间路径
    print("\n--- 测试 5: 组间路径 ---")
    group_a = ["Sam Altman", "Tim Cook"]
    group_b = ["GPT-4", "Vision Pro"]
    group_paths = finder.find_paths_between_groups(group_a, group_b, max_depth=3)
    print(f"  发现 {len(group_paths)} 条组间路径:")
    for gp in group_paths[:5]:
        desc = finder._describe_path(gp["path"])
        print(f"  {gp['source']} -> {gp['target']}: {desc}")

    return finder


if __name__ == "__main__":
    finder = demo_relationship_path_reasoning()
```

### 10.2.3 基于 LightRAG 的关系路径推理

将路径推理与 LightRAG 的检索能力结合，可以实现更智能的多文档关系推理：

```python
class LightRAGRelationshipReasoner:
    """基于 LightRAG 的关系路径推理器"""

    def __init__(self, rag: LightRAG):
        self.rag = rag
        self.graph = self._get_graph()
        self.path_finder = RelationshipPathFinder(self.graph)

    def _get_graph(self) -> nx.Graph:
        """获取 LightRAG 内部图结构"""
        try:
            return self.rag.graph
        except AttributeError:
            return nx.Graph()

    def reason_relationship(
        self, entity_a: str, entity_b: str,
        max_depth: int = 4
    ) -> Dict:
        """推理两个实体之间的关系"""
        # 1. 在图中查找实体
        nodes_a = self._find_nodes(entity_a)
        nodes_b = self._find_nodes(entity_b)

        if not nodes_a or not nodes_b:
            return {
                "query": f"{entity_a} 与 {entity_b}",
                "found": False,
                "message": "未在知识图谱中找到相关实体",
            }

        # 2. 查找路径
        all_paths = []
        for na in nodes_a:
            for nb in nodes_b:
                if na == nb:
                    continue
                paths = self.path_finder.find_all_paths(na, nb, max_depth, 3)
                all_paths.extend(paths)

        # 3. 使用 LightRAG 查询增强推理
        query = f"请解释 {entity_a} 和 {entity_b} 之间的关系，基于以下路径信息："
        path_context = ""
        for i, path in enumerate(all_paths[:3], 1):
            desc = self.path_finder._describe_path(path)
            path_context += f"\n路径{i}: {desc}"

        rag_result = self.rag.query(
            query + path_context,
            param=QueryParam(mode="hybrid")
        )

        return {
            "query": f"{entity_a} 与 {entity_b}",
            "found": True,
            "paths": all_paths,
            "path_count": len(all_paths),
            "reasoning": rag_result,
        }

    def _find_nodes(self, name: str) -> List[str]:
        """在图中查找匹配的节点"""
        matches = []
        for node in self.graph.nodes():
            if name.lower() in node.lower():
                matches.append(node)
            else:
                node_data = self.graph.nodes[node]
                aliases = node_data.get("aliases", [])
                if isinstance(aliases, list):
                    for alias in aliases:
                        if name.lower() in alias.lower():
                            matches.append(node)
                            break
        return matches

    def multi_hop_query(self, question: str, max_depth: int = 3) -> Dict:
        """多跳查询：自动发现并推理关系路径"""
        # 1. 使用 LLM 提取查询中的关键实体
        entity_extraction_prompt = (
            f"从以下问题中提取关键实体（人名、组织名、产品名等），"
            f"以逗号分隔返回：\n问题：{question}"
        )
        entities_text = self.rag.llm_model_func(entity_extraction_prompt)
        entities = [e.strip() for e in entities_text.split(",") if e.strip()]

        if len(entities) < 2:
            # 回退到标准查询
            return {
                "question": question,
                "answer": self.rag.query(question, param=QueryParam(mode="hybrid")),
                "reasoning_type": "standard",
            }

        # 2. 对每对实体进行关系推理
        relationships = []
        for i in range(len(entities)):
            for j in range(i + 1, len(entities)):
                result = self.reason_relationship(
                    entities[i], entities[j], max_depth
                )
                if result.get("found"):
                    relationships.append(result)

        # 3. 综合推理结果生成答案
        context = f"问题: {question}\n\n发现的关系路径:\n"
        for rel in relationships:
            for path in rel.get("paths", []):
                context += self.path_finder._describe_path(path) + "\n"

        answer = self.rag.query(
            context + "\n基于以上关系路径，请回答原始问题。",
            param=QueryParam(mode="hybrid")
        )

        return {
            "question": question,
            "answer": answer,
            "reasoning_type": "multi_hop",
            "entities_found": entities,
            "relationships": relationships,
        }
```

### 10.2.4 路径推理的评估

关系路径推理的质量可以从以下维度评估：

| 维度 | 评估标准 | 说明 |
|------|---------|------|
| **路径正确性** | 路径中的每一步关系是否真实存在 | 需要人工验证或与知识库对照 |
| **路径完整性** | 是否覆盖了所有可能的关联路径 | 路径数量 vs 已知关系数量 |
| **路径简洁性** | 是否找到了最短/最优路径 | 路径长度越短越好 |
| **推理可解释性** | 路径描述是否清晰易懂 | 自然语言描述的质量 |

---

## 10.3 矛盾检测与一致性检查

### 10.3.1 问题定义

当多个文档描述同一实体或事件时，信息可能不一致甚至相互矛盾。矛盾检测（Contradiction Detection）与一致性检查（Consistency Checking）的目标是自动识别这些矛盾，评估信息的可信度，并在必要时进行冲突消解。

**矛盾类型**：

| 类型 | 描述 | 示例 |
|------|------|------|
| **数值矛盾** | 同一属性的数值不一致 | 文档A: "GPT-4 有 1.7 万亿参数"；文档B: "GPT-4 有 1 万亿参数" |
| **事实矛盾** | 对同一事实的描述相反 | 文档A: "苹果公司与 OpenAI 已达成合作"；文档B: "苹果公司与 OpenAI 的谈判已破裂" |
| **时间矛盾** | 事件时间线不一致 | 文档A: "Vision Pro 于 2024 年初发布"；文档B: "Vision Pro 于 2023 年底发布" |
| **关系矛盾** | 实体间关系类型冲突 | 文档A: "微软收购了 OpenAI"；文档B: "微软投资了 OpenAI" |
| **属性矛盾** | 实体属性描述冲突 | 文档A: "M2 芯片采用 5nm 工艺"；文档B: "M2 芯片采用 3nm 工艺" |

### 10.3.2 矛盾检测引擎

以下实现了一个完整的矛盾检测系统，能够自动发现并分类多文档间的信息矛盾：

```python
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
from enum import Enum
import re
from collections import defaultdict


class ContradictionType(Enum):
    """矛盾类型枚举"""
    NUMERIC = "numeric"           # 数值矛盾
    FACTUAL = "factual"           # 事实矛盾
    TEMPORAL = "temporal"         # 时间矛盾
    RELATION = "relation"         # 关系矛盾
    ATTRIBUTE = "attribute"       # 属性矛盾
    UNKNOWN = "unknown"           # 未知类型


@dataclass
class Contradiction:
    """矛盾记录"""
    id: str
    type: ContradictionType
    entity: str                    # 涉及的实体
    attribute: str                 # 矛盾的属性
    statements: List[Dict]         # 矛盾陈述列表
    confidence: float = 0.0        # 检测置信度
    resolution: str = ""           # 建议的解决方案
    source_docs: List[str] = field(default_factory=list)


class ContradictionDetector:
    """矛盾检测器"""

    def __init__(self, graph: nx.Graph, llm_func=None):
        self.graph = graph
        self.llm_func = llm_func
        self.contradictions: List[Contradiction] = []

    def detect_numeric_contradictions(
        self, entity_name: str
    ) -> List[Contradiction]:
        """检测数值矛盾"""
        contradictions = []
        node_data = self.graph.nodes.get(entity_name)
        if not node_data:
            return contradictions

        # 提取所有数值属性
        numeric_attrs = defaultdict(list)
        description = node_data.get("description", "")

        # 从描述中提取数值
        numbers = re.findall(
            r"(\d+[\.\d]*)\s*(万亿|亿|万|千|百|%|美元|元|年|月|日|nm|GB|TB)?",
            description
        )
        for num, unit in numbers:
            key = f"数值_{unit}" if unit else "数值"
            numeric_attrs[key].append({
                "value": num,
                "unit": unit,
                "source": entity_name,
            })

        # 从关系边中提取数值
        for neighbor in self.graph.neighbors(entity_name):
            edge_data = self.graph.get_edge_data(entity_name, neighbor)
            edge_desc = edge_data.get("description", "")
            edge_numbers = re.findall(
                r"(\d+[\.\d]*)\s*(万亿|亿|万|千|百|%|美元|元|年|月|日|nm|GB|TB)?",
                edge_desc
            )
            for num, unit in edge_numbers:
                key = f"数值_{unit}" if unit else "数值"
                numeric_attrs[key].append({
                    "value": num,
                    "unit": unit,
                    "source": f"{entity_name} --[{edge_data.get('type','')}]--> {neighbor}",
                })

        # 检测矛盾
        for attr_key, values in numeric_attrs.items():
            if len(values) < 2:
                continue

            unique_values = set(v["value"] for v in values)
            if len(unique_values) > 1:
                contradiction = Contradiction(
                    id=f"contra_num_{len(self.contradictions)}",
                    type=ContradictionType.NUMERIC,
                    entity=entity_name,
                    attribute=attr_key,
                    statements=values,
                    confidence=0.85,
                    source_docs=list(set(
                        v.get("source", "") for v in values
                    )),
                )
                contradictions.append(contradiction)
                self.contradictions.append(contradiction)

        return contradictions

    def detect_relation_contradictions(
        self, entity_name: str
    ) -> List[Contradiction]:
        """检测关系矛盾"""
        contradictions = []
        neighbors = list(self.graph.neighbors(entity_name))

        # 按邻居分组，检查关系类型是否一致
        relation_groups = defaultdict(list)
        for neighbor in neighbors:
            edge_data = self.graph.get_edge_data(entity_name, neighbor)
            rel_type = edge_data.get("type", "related_to")
            relation_groups[neighbor].append({
                "type": rel_type,
                "description": edge_data.get("description", ""),
                "weight": edge_data.get("weight", 1.0),
            })

        for neighbor, rels in relation_groups.items():
            if len(rels) < 2:
                continue

            types = set(r["type"] for r in rels)
            if len(types) > 1:
                contradiction = Contradiction(
                    id=f"contra_rel_{len(self.contradictions)}",
                    type=ContradictionType.RELATION,
                    entity=entity_name,
                    attribute=f"与 {neighbor} 的关系",
                    statements=rels,
                    confidence=0.75,
                    source_docs=[],
                )
                contradictions.append(contradiction)
                self.contradictions.append(contradiction)

        return contradictions

    def detect_factual_contradictions(
        self, entity_name: str
    ) -> List[Contradiction]:
        """检测事实矛盾（使用 LLM）"""
        if not self.llm_func:
            return []

        contradictions = []
        node_data = self.graph.nodes.get(entity_name)
        if not node_data:
            return contradictions

        description = node_data.get("description", "")
        if not description:
            return contradictions

        # 将描述按句号分割，检查内部矛盾
        sentences = [s.strip() for s in re.split(r"[。；]", description) if s.strip()]

        if len(sentences) < 2:
            return contradictions

        # 使用 LLM 检测矛盾
        prompt = (
            f"以下是对实体「{entity_name}」的多条描述，请判断是否存在矛盾：\n\n"
        )
        for i, sent in enumerate(sentences, 1):
            prompt += f"{i}. {sent}\n"

        prompt += (
            "\n如果存在矛盾，请按以下 JSON 格式输出：\n"
            '{"has_contradiction": true/false, '
            '"contradictory_pairs": [[1,3]], '
            '"explanation": "矛盾说明"}'
        )

        try:
            response = self.llm_func(prompt)
            result = json.loads(response)

            if result.get("has_contradiction"):
                for pair in result.get("contradictory_pairs", []):
                    i, j = pair
                    if i <= len(sentences) and j <= len(sentences):
                        contradiction = Contradiction(
                            id=f"contra_fact_{len(self.contradictions)}",
                            type=ContradictionType.FACTUAL,
                            entity=entity_name,
                            attribute="事实描述",
                            statements=[
                                {"text": sentences[i-1], "index": i},
                                {"text": sentences[j-1], "index": j},
                            ],
                            confidence=0.8,
                            resolution=result.get("explanation", ""),
                        )
                        contradictions.append(contradiction)
                        self.contradictions.append(contradiction)
        except (json.JSONDecodeError, Exception):
            pass

        return contradictions

    def detect_all_contradictions(
        self, entity_name: str
    ) -> List[Contradiction]:
        """检测实体的所有矛盾"""
        all_contra = []
        all_contra.extend(self.detect_numeric_contradictions(entity_name))
        all_contra.extend(self.detect_relation_contradictions(entity_name))
        all_contra.extend(self.detect_factual_contradictions(entity_name))
        return all_contra

    def scan_graph_for_contradictions(
        self, max_entities: int = 100
    ) -> List[Contradiction]:
        """扫描全图检测矛盾"""
        all_contra = []
        entities = list(self.graph.nodes())[:max_entities]

        for i, entity in enumerate(entities):
            print(f"扫描 {i+1}/{len(entities)}: {entity}")
            contra = self.detect_all_contradictions(entity)
            all_contra.extend(contra)

        return all_contra


# 演示：矛盾检测
def demo_contradiction_detection():
    """矛盾检测演示"""
    import networkx as nx

    G = nx.Graph()

    # 添加实体（包含矛盾信息）
    entities = [
        ("GPT-4", {
            "type": "product",
            "description": (
                "GPT-4 是 OpenAI 开发的大语言模型，拥有 1.7 万亿参数。"
                "该模型在多项基准测试中表现出色。"
                "GPT-4 的参数量约为 1 万亿。"
                "GPT-4 支持多模态输入，包括文本和图像。"
                "GPT-4 仅支持文本输入，不支持图像。"
            ),
        }),
        ("苹果公司", {
            "type": "organization",
            "description": (
                "苹果公司是一家科技公司，总部位于库比蒂诺。"
                "苹果公司与 OpenAI 达成了合作协议。"
                "苹果公司与 OpenAI 的谈判已经破裂。"
            ),
        }),
        ("Vision Pro", {
            "type": "product",
            "description": (
                "Vision Pro 是苹果公司的混合现实头显设备。"
                "该设备于 2024 年初在美国上市。"
                "Vision Pro 于 2023 年底开始发售。"
            ),
        }),
    ]

    for name, data in entities:
        G.add_node(name, **data)

    # 添加关系（包含矛盾）
    relations = [
        ("苹果公司", "OpenAI", {"type": "合作", "description": "双方达成合作协议", "weight": 0.7}),
        ("苹果公司", "OpenAI", {"type": "谈判破裂", "description": "合作谈判已终止", "weight": 0.6}),
        ("Vision Pro", "M2芯片", {"type": "搭载", "description": "使用 M2 芯片", "weight": 0.9}),
        ("Vision Pro", "M2芯片", {"type": "使用", "description": "搭载 M2 和 R1 芯片", "weight": 0.8}),
    ]

    for u, v, data in relations:
        if G.has_edge(u, v):
            existing = G.get_edge_data(u, v)
            if isinstance(existing, dict):
                G.add_edge(u, v, **{**existing, **data})
        else:
            G.add_edge(u, v, **data)

    detector = ContradictionDetector(G)

    print("=" * 60)
    print("矛盾检测与一致性检查演示")
    print("=" * 60)

    # 检测各实体的矛盾
    for entity in ["GPT-4", "苹果公司", "Vision Pro"]:
        print(f"\n--- 检测实体: {entity} ---")
        contradictions = detector.detect_all_contradictions(entity)

        if not contradictions:
            print("  未发现矛盾")
        else:
            for c in contradictions:
                print(f"  [{c.type.value}] {c.attribute}")
                print(f"    置信度: {c.confidence}")
                for stmt in c.statements:
                    if "value" in stmt:
                        print(f"    - 数值: {stmt['value']} {stmt.get('unit', '')}")
                    elif "text" in stmt:
                        print(f"    - 描述: {stmt['text'][:80]}...")
                    elif "type" in stmt:
                        print(f"    - 关系: {stmt['type']}")
                if c.resolution:
                    print(f"    建议: {c.resolution}")

    return detector


if __name__ == "__main__":
    detector = demo_contradiction_detection()
```

### 10.3.3 一致性检查与冲突消解

检测到矛盾后，需要进一步进行一致性检查（Consistency Checking）和冲突消解（Conflict Resolution）。以下实现了一个完整的冲突消解引擎：

```python
@dataclass
class SourceCredibility:
    """来源可信度"""
    source_id: str
    authority_score: float = 0.5    # 权威性 [0, 1]
    recency_score: float = 0.5      # 时效性 [0, 1]
    consistency_score: float = 0.5  # 一致性 [0, 1]

    @property
    def overall_score(self) -> float:
        """综合可信度评分"""
        return (
            0.4 * self.authority_score +
            0.3 * self.recency_score +
            0.3 * self.consistency_score
        )


class ConflictResolver:
    """冲突消解器"""

    def __init__(self, llm_func=None):
        self.llm_func = llm_func
        self.source_credibility: Dict[str, SourceCredibility] = {}

    def register_source(
        self, source_id: str,
        authority: float = 0.5,
        recency: float = 0.5
    ):
        """注册来源可信度"""
        self.source_credibility[source_id] = SourceCredibility(
            source_id=source_id,
            authority_score=authority,
            recency_score=recency,
        )

    def resolve_contradiction(
        self, contradiction: Contradiction
    ) -> Dict:
        """解决单个矛盾"""
        if contradiction.type == ContradictionType.NUMERIC:
            return self._resolve_numeric(contradiction)
        elif contradiction.type == ContradictionType.RELATION:
            return self._resolve_relation(contradiction)
        elif contradiction.type == ContradictionType.FACTUAL:
            return self._resolve_factual(contradiction)
        else:
            return self._resolve_generic(contradiction)

    def _resolve_numeric(
        self, contradiction: Contradiction
    ) -> Dict:
        """解决数值矛盾"""
        statements = contradiction.statements

        # 策略1：基于来源可信度选择
        scored = []
        for stmt in statements:
            source = stmt.get("source", "")
            credibility = self.source_credibility.get(
                source, SourceCredibility(source)
            )
            scored.append((credibility.overall_score, stmt))

        scored.sort(key=lambda x: x[0], reverse=True)
        best_stmt = scored[0][1] if scored else None

        # 策略2：如果有 LLM，让 LLM 判断
        if self.llm_func and len(scored) >= 2:
            prompt = (
                f"实体「{contradiction.entity}」的「{contradiction.attribute}」存在数值矛盾：\n"
            )
            for i, (score, stmt) in enumerate(scored, 1):
                prompt += (
                    f"{i}. 数值 {stmt['value']} {stmt.get('unit', '')} "
                    f"(来源可信度: {score:.2f})\n"
                )
            prompt += "\n请判断哪个数值更准确，并给出理由。"

            try:
                llm_judgment = self.llm_func(prompt)
            except Exception:
                llm_judgment = ""

        return {
            "contradiction_id": contradiction.id,
            "type": "numeric",
            "resolution_strategy": "source_credibility",
            "recommended_value": best_stmt["value"] if best_stmt else None,
            "alternative_values": [
                s["value"] for s in statements if s != best_stmt
            ] if best_stmt else [],
            "confidence": scored[0][0] if scored else 0.0,
        }

    def _resolve_relation(
        self, contradiction: Contradiction
    ) -> Dict:
        """解决关系矛盾"""
        statements = contradiction.statements

        # 基于权重选择
        weighted = sorted(
            statements,
            key=lambda s: s.get("weight", 1.0),
            reverse=True
        )

        return {
            "contradiction_id": contradiction.id,
            "type": "relation",
            "resolution_strategy": "weight_based",
            "recommended_relation": weighted[0] if weighted else None,
            "alternative_relations": weighted[1:] if len(weighted) > 1 else [],
        }

    def _resolve_factual(
        self, contradiction: Contradiction
    ) -> Dict:
        """解决事实矛盾"""
        if self.llm_func:
            statements = contradiction.statements
            prompt = (
                f"实体「{contradiction.entity}」存在事实描述矛盾：\n\n"
            )
            for stmt in statements:
                prompt += f"- {stmt.get('text', '')}\n"
            prompt += (
                "\n请分析这些描述，判断哪个更准确，"
                "或者它们是否可以从不同角度解释。"
                "给出你的判断和理由。"
            )

            try:
                analysis = self.llm_func(prompt)
                return {
                    "contradiction_id": contradiction.id,
                    "type": "factual",
                    "resolution_strategy": "llm_judgment",
                    "analysis": analysis,
                }
            except Exception:
                pass

        return {
            "contradiction_id": contradiction.id,
            "type": "factual",
            "resolution_strategy": "unresolved",
            "analysis": "需要人工判断",
        }

    def _resolve_generic(
        self, contradiction: Contradiction
    ) -> Dict:
        """通用矛盾解决"""
        return {
            "contradiction_id": contradiction.id,
            "type": "generic",
            "resolution_strategy": "manual_review",
            "analysis": "无法自动解决，需要人工审核",
        }

    def batch_resolve(
        self, contradictions: List[Contradiction]
    ) -> List[Dict]:
        """批量解决矛盾"""
        return [
            self.resolve_contradiction(c) for c in contradictions
        ]

    def generate_consistency_report(
        self, contradictions: List[Contradiction]
    ) -> Dict:
        """生成一致性检查报告"""
        by_type = defaultdict(list)
        for c in contradictions:
            by_type[c.type.value].append(c)

        report = {
            "total_contradictions": len(contradictions),
            "by_type": {
                t: len(cs) for t, cs in by_type.items()
            },
            "severity": self._assess_severity(contradictions),
            "details": [],
        }

        for c in contradictions:
            resolution = self.resolve_contradiction(c)
            report["details"].append({
                "entity": c.entity,
                "attribute": c.attribute,
                "type": c.type.value,
                "confidence": c.confidence,
                "resolution": resolution,
            })

        return report

    def _assess_severity(
        self, contradictions: List[Contradiction]
    ) -> str:
        """评估矛盾严重程度"""
        if not contradictions:
            return "none"

        high_confidence = sum(
            1 for c in contradictions if c.confidence > 0.8
        )
        numeric_count = sum(
            1 for c in contradictions
            if c.type == ContradictionType.NUMERIC
        )

        if high_confidence >= 3 or numeric_count >= 2:
            return "high"
        elif high_confidence >= 1:
            return "medium"
        else:
            return "low"


# 演示：冲突消解
def demo_conflict_resolution():
    """冲突消解演示"""
    print("=" * 60)
    print("冲突消解演示")
    print("=" * 60)

    resolver = ConflictResolver()

    # 注册来源可信度
    resolver.register_source("官方文档", authority=0.9, recency=0.8)
    resolver.register_source("新闻报道", authority=0.6, recency=0.9)
    resolver.register_source("维基百科", authority=0.7, recency=0.6)
    resolver.register_source("社交媒体", authority=0.3, recency=0.9)

    # 模拟矛盾
    contradictions = [
        Contradiction(
            id="c1",
            type=ContradictionType.NUMERIC,
            entity="GPT-4",
            attribute="参数量",
            statements=[
                {"value": "1.7万亿", "unit": "参数", "source": "社交媒体"},
                {"value": "1万亿", "unit": "参数", "source": "官方文档"},
            ],
            confidence=0.9,
        ),
        Contradiction(
            id="c2",
            type=ContradictionType.RELATION,
            entity="苹果公司",
            attribute="与 OpenAI 的关系",
            statements=[
                {"type": "合作", "weight": 0.7, "source": "新闻报道"},
                {"type": "谈判破裂", "weight": 0.6, "source": "社交媒体"},
            ],
            confidence=0.75,
        ),
    ]

    print("\n解决矛盾:")
    for c in contradictions:
        print(f"\n  [{c.type.value}] {c.entity} - {c.attribute}")
        resolution = resolver.resolve_contradiction(c)
        print(f"    策略: {resolution['resolution_strategy']}")
        if resolution.get("recommended_value"):
            print(f"    推荐值: {resolution['recommended_value']}")
        if resolution.get("analysis"):
            print(f"    分析: {resolution['analysis'][:100]}...")

    # 生成一致性报告
    print("\n\n一致性检查报告:")
    report = resolver.generate_consistency_report(contradictions)
    print(f"  总矛盾数: {report['total_contradictions']}")
    print(f"  严重程度: {report['severity']}")
    print(f"  按类型: {report['by_type']}")

    return resolver


if __name__ == "__main__":
    resolver = demo_conflict_resolution()
```

### 10.3.4 基于 LightRAG 的一致性检查

将矛盾检测与 LightRAG 的图检索能力结合，可以实现对知识库整体一致性的持续监控：

```python
class LightRAGConsistencyChecker:
    """基于 LightRAG 的一致性检查器"""

    def __init__(self, rag: LightRAG, llm_func=None):
        self.rag = rag
        self.graph = self._get_graph()
        self.detector = ContradictionDetector(self.graph, llm_func)
        self.resolver = ConflictResolver(llm_func)

    def _get_graph(self) -> nx.Graph:
        try:
            return self.rag.graph
        except AttributeError:
            return nx.Graph()

    def check_entity_consistency(
        self, entity_name: str
    ) -> Dict:
        """检查单个实体的一致性"""
        contradictions = self.detector.detect_all_contradictions(entity_name)

        if not contradictions:
            return {
                "entity": entity_name,
                "consistent": True,
                "contradictions": [],
            }

        resolutions = self.resolver.batch_resolve(contradictions)

        return {
            "entity": entity_name,
            "consistent": False,
            "contradiction_count": len(contradictions),
            "contradictions": [
                {
                    "type": c.type.value,
                    "attribute": c.attribute,
                    "confidence": c.confidence,
                    "resolution": resolutions[i],
                }
                for i, c in enumerate(contradictions)
            ],
        }

    def check_knowledge_base_consistency(
        self, max_entities: int = 50
    ) -> Dict:
        """检查整个知识库的一致性"""
        print("正在扫描知识库一致性...")
        contradictions = self.detector.scan_graph_for_contradictions(max_entities)

        if not contradictions:
            return {
                "consistent": True,
                "total_contradictions": 0,
                "report": "知识库一致性好，未发现矛盾",
            }

        report = self.resolver.generate_consistency_report(contradictions)

        return {
            "consistent": False,
            "total_contradictions": len(contradictions),
            "severity": report["severity"],
            "by_type": report["by_type"],
            "report": report,
        }

    def query_with_consistency_check(
        self, question: str, mode: str = "hybrid"
    ) -> Dict:
        """带一致性检查的查询"""
        # 1. 标准查询
        answer = self.rag.query(question, param=QueryParam(mode=mode))

        # 2. 提取查询中的实体
        extract_prompt = (
            f"从以下问题中提取关键实体名称，以逗号分隔：\n{question}"
        )
        try:
            entities_text = self.rag.llm_model_func(extract_prompt)
            entities = [e.strip() for e in entities_text.split(",") if e.strip()]
        except Exception:
            entities = []

        # 3. 检查相关实体的一致性
        consistency_issues = []
        for entity in entities[:5]:
            result = self.check_entity_consistency(entity)
            if not result.get("consistent", True):
                consistency_issues.append(result)

        # 4. 如果有矛盾，在答案中附加警告
        if consistency_issues:
            warning = "\n\n⚠️ **一致性警告**：以下实体存在信息矛盾：\n"
            for issue in consistency_issues:
                warning += f"- {issue['entity']}: {issue['contradiction_count']} 处矛盾\n"
            answer += warning

        return {
            "question": question,
            "answer": answer,
            "consistency_checked": True,
            "consistency_issues": consistency_issues,
        }
```

---

## 10.4 完整代码示例

本节将前三节的所有组件整合为一个完整的**多文档关系推理系统**，提供可直接运行的端到端实现。

### 10.4.1 系统架构

```
demos/ch10-reasoning/
├── __init__.py
├── entity_linker.py          # 跨文档实体链接
├── path_finder.py            # 关系路径推理
├── contradiction_detector.py # 矛盾检测
├── conflict_resolver.py      # 冲突消解
├── reasoning_engine.py       # 推理引擎（整合）
├── app.py                    # Web API 服务
├── requirements.txt          # 依赖
└── sample_docs/              # 示例文档
```

### 10.4.2 推理引擎实现

```python
"""
reasoning_engine.py — 多文档关系推理引擎
整合实体链接、路径推理、矛盾检测与一致性检查
"""

import os
import json
from typing import List, Dict, Optional, Any
from pathlib import Path
import networkx as nx

from lightrag import LightRAG, QueryParam
from lightrag.llm import gpt_4o_mini_complete
from lightrag.embedding import openai_embedding

from entity_linker import CrossDocEntityLinker, EntityNode, EntityMention
from path_finder import RelationshipPathFinder
from contradiction_detector import (
    ContradictionDetector, Contradiction, ContradictionType
)
from conflict_resolver import ConflictResolver, SourceCredibility


class MultiDocReasoningEngine:
    """多文档关系推理引擎"""

    def __init__(
        self,
        working_dir: str = "./reasoning_index",
        llm_func=None,
        embedding_func=None,
        embedding_dim: int = 1536,
    ):
        self.working_dir = working_dir
        os.makedirs(working_dir, exist_ok=True)

        # 初始化 LightRAG
        self.rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=llm_func or gpt_4o_mini_complete,
            embedding_func=embedding_func or openai_embedding,
            embedding_dim=embedding_dim,
        )

        # 初始化各组件
        self.entity_linker = CrossDocEntityLinker()
        self.path_finder = None
        self.detector = None
        self.resolver = ConflictResolver(llm_func)

        # 文档索引
        self.documents: Dict[str, str] = {}

    def index_document(self, doc_id: str, text: str):
        """索引单篇文档"""
        self.documents[doc_id] = text
        self.rag.insert(text)

        # 提取实体提及
        mentions = self.entity_linker.extract_mentions_from_doc(text, doc_id)
        self.entity_linker.link_mentions_to_entities(mentions)

        print(f"  已索引: {doc_id} ({len(text)} 字符, {len(mentions)} 个实体提及)")

    def index_documents(self, docs: Dict[str, str]):
        """批量索引文档"""
        for doc_id, text in docs.items():
            self.index_document(doc_id, text)

        # 发现并合并跨文档实体链接
        links = self.entity_linker.discover_cross_doc_links()
        if links:
            print(f"\n发现 {len(links)} 个跨文档实体链接，正在合并...")
            self.entity_linker.merge_linked_entities(links)

        # 初始化路径查找器和矛盾检测器
        self._init_graph_components()

    def _init_graph_components(self):
        """初始化图相关组件"""
        try:
            graph = self.rag.graph
            self.path_finder = RelationshipPathFinder(graph)
            self.detector = ContradictionDetector(graph, self.rag.llm_model_func)
        except AttributeError:
            # 使用实体链接器构建的图
            graph = nx.Graph()
            for eid, entity in self.entity_linker.entities.items():
                graph.add_node(
                    entity.canonical_name,
                    type=entity.entity_type,
                    description=entity.description,
                )
            self.path_finder = RelationshipPathFinder(graph)
            self.detector = ContradictionDetector(graph, self.rag.llm_model_func)

    def query(self, question: str, mode: str = "hybrid") -> Dict:
        """标准查询"""
        answer = self.rag.query(question, param=QueryParam(mode=mode))
        return {
            "question": question,
            "answer": answer,
            "mode": mode,
        }

    def reason_relationship(
        self, entity_a: str, entity_b: str, max_depth: int = 4
    ) -> Dict:
        """关系路径推理"""
        if not self.path_finder:
            return {"error": "图组件未初始化，请先索引文档"}

        # 查找实体
        nodes_a = self._find_nodes(entity_a)
        nodes_b = self._find_nodes(entity_b)

        if not nodes_a:
            return {"error": f"未找到实体: {entity_a}"}
        if not nodes_b:
            return {"error": f"未找到实体: {entity_b}"}

        # 查找路径
        all_paths = []
        for na in nodes_a:
            for nb in nodes_b:
                if na == nb:
                    continue
                paths = self.path_finder.find_all_paths(na, nb, max_depth, 5)
                all_paths.extend(paths)

        # 生成推理结果
        result = {
            "source_entity": entity_a,
            "target_entity": entity_b,
            "matched_sources": nodes_a,
            "matched_targets": nodes_b,
            "path_count": len(all_paths),
        }

        if all_paths:
            best_path = max(all_paths, key=self.path_finder._score_path)
            result["has_path"] = True
            result["best_path"] = best_path
            result["path_description"] = self.path_finder._describe_path(best_path)
            result["all_paths"] = all_paths
        else:
            result["has_path"] = False
            result["message"] = f"在 {max_depth} 跳内未发现关联路径"

        return result

    def check_consistency(self, entity_name: str) -> Dict:
        """一致性检查"""
        if not self.detector:
            return {"error": "检测器未初始化，请先索引文档"}

        contradictions = self.detector.detect_all_contradictions(entity_name)

        if not contradictions:
            return {
                "entity": entity_name,
                "consistent": True,
                "message": "未发现矛盾",
            }

        resolutions = self.resolver.batch_resolve(contradictions)

        return {
            "entity": entity_name,
            "consistent": False,
            "contradiction_count": len(contradictions),
            "contradictions": [
                {
                    "type": c.type.value,
                    "attribute": c.attribute,
                    "confidence": c.confidence,
                    "statements": c.statements,
                    "resolution": resolutions[i],
                }
                for i, c in enumerate(contradictions)
            ],
        }

    def full_reasoning_pipeline(
        self, question: str
    ) -> Dict:
        """完整推理流水线"""
        # 1. 提取问题中的实体
        extract_prompt = (
            f"从以下问题中提取关键实体（人名、组织名、产品名等），"
            f"以逗号分隔返回：\n{question}"
        )
        try:
            entities_text = self.rag.llm_model_func(extract_prompt)
            entities = [e.strip() for e in entities_text.split(",") if e.strip()]
        except Exception:
            entities = []

        # 2. 标准检索
        answer = self.rag.query(question, param=QueryParam(mode="hybrid"))

        # 3. 关系推理（如果检测到多个实体）
        relationship_insights = []
        if len(entities) >= 2:
            for i in range(len(entities)):
                for j in range(i + 1, len(entities)):
                    rel_result = self.reason_relationship(
                        entities[i], entities[j]
                    )
                    if rel_result.get("has_path"):
                        relationship_insights.append(rel_result)

        # 4. 一致性检查
        consistency_issues = []
        for entity in entities[:5]:
            cons_result = self.check_consistency(entity)
            if not cons_result.get("consistent", True):
                consistency_issues.append(cons_result)

        # 5. 综合结果
        result = {
            "question": question,
            "answer": answer,
            "entities_found": entities,
            "relationship_insights": relationship_insights,
            "consistency_issues": consistency_issues,
        }

        # 如果有关系推理结果，附加到答案
        if relationship_insights:
            path_summary = "\n\n**关系推理**：\n"
            for insight in relationship_insights:
                path_summary += (
                    f"- {insight['source_entity']} 与 {insight['target_entity']} 的关联路径："
                    f"{insight.get('path_description', '无直接路径')}\n"
                )
            result["answer"] += path_summary

        # 如果有矛盾，附加警告
        if consistency_issues:
            warning = "\n\n⚠️ **一致性警告**：\n"
            for issue in consistency_issues:
                warning += (
                    f"- {issue['entity']}: {issue['contradiction_count']} 处矛盾\n"
                )
            result["answer"] += warning

        return result

    def _find_nodes(self, name: str) -> List[str]:
        """在图中查找匹配节点"""
        if not self.path_finder:
            return []
        matches = []
        for node in self.path_finder.graph.nodes():
            if name.lower() in node.lower():
                matches.append(node)
        return matches

    def get_stats(self) -> Dict:
        """获取系统统计信息"""
        stats = {
            "document_count": len(self.documents),
            "entity_count": len(self.entity_linker.entities),
        }
        if self.path_finder:
            stats["graph_nodes"] = self.path_finder.graph.number_of_nodes()
            stats["graph_edges"] = self.path_finder.graph.number_of_edges()
        return stats
```

### 10.4.3 Web API 服务

```python
"""
app.py — 多文档关系推理 API 服务
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import uvicorn
import os

from reasoning_engine import MultiDocReasoningEngine

app = FastAPI(
    title="Multi-Document Relationship Reasoning API",
    version="1.0.0",
)

engine = MultiDocReasoningEngine(working_dir="./reasoning_index")


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    mode: str = Field(default="hybrid", pattern="^(low|high|hybrid)$")


class RelationshipRequest(BaseModel):
    entity_a: str = Field(..., min_length=1)
    entity_b: str = Field(..., min_length=1)
    max_depth: int = Field(default=4, ge=1, le=10)


class ConsistencyRequest(BaseModel):
    entity_name: str = Field(..., min_length=1)


class IndexRequest(BaseModel):
    doc_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=10)


class BatchIndexRequest(BaseModel):
    documents: dict


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "multi-doc-reasoning"}


@app.post("/query")
def query_endpoint(req: QueryRequest):
    try:
        result = engine.full_reasoning_pipeline(req.question)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reason")
def reason_endpoint(req: RelationshipRequest):
    try:
        result = engine.reason_relationship(
            req.entity_a, req.entity_b, req.max_depth
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/consistency")
def consistency_endpoint(req: ConsistencyRequest):
    try:
        result = engine.check_consistency(req.entity_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index")
def index_endpoint(req: IndexRequest):
    try:
        engine.index_document(req.doc_id, req.text)
        return {"status": "ok", "doc_id": req.doc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index/batch")
def batch_index_endpoint(req: BatchIndexRequest):
    try:
        engine.index_documents(req.documents)
        return {
            "status": "ok",
            "total_docs": len(req.documents),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
def stats_endpoint():
    return engine.get_stats()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 10.4.4 命令行使用示例

```python
"""
main.py — 多文档关系推理命令行工具
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from reasoning_engine import MultiDocReasoningEngine


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Multi-Document Relationship Reasoning System"
    )
    parser.add_argument("--index", type=str, help="索引文档目录")
    parser.add_argument("--query", type=str, help="提问")
    parser.add_argument("--reason", type=str, nargs=2,
                        metavar=("ENTITY_A", "ENTITY_B"),
                        help="关系路径推理")
    parser.add_argument("--consistency", type=str, help="一致性检查")
    parser.add_argument("--working-dir", type=str,
                        default="./reasoning_index")
    parser.add_argument("--demo", action="store_true", help="运行完整演示")
    args = parser.parse_args()

    engine = MultiDocReasoningEngine(working_dir=args.working_dir)

    if args.demo:
        run_demo(engine)
        return

    if args.index:
        print(f"正在索引目录: {args.index}")
        docs = {}
        for root, _, files in os.walk(args.index):
            for file in files:
                if file.endswith((".md", ".txt", ".html")):
                    file_path = os.path.join(root, file)
                    with open(file_path, "r", encoding="utf-8") as f:
                        docs[file] = f.read()
        engine.index_documents(docs)
        print(f"索引完成: {len(docs)} 篇文档")

    if args.query:
        result = engine.full_reasoning_pipeline(args.query)
        print(f"\n问题: {result['question']}")
        print(f"答案: {result['answer']}")
        if result.get("relationship_insights"):
            print(f"\n关系推理: {len(result['relationship_insights'])} 条路径")
        if result.get("consistency_issues"):
            print(f"一致性警告: {len(result['consistency_issues'])} 处")

    if args.reason:
        entity_a, entity_b = args.reason
        result = engine.reason_relationship(entity_a, entity_b)
        print(f"\n关系推理: {entity_a} <-> {entity_b}")
        if result.get("has_path"):
            print(f"路径: {result['path_description']}")
        else:
            print(f"结果: {result.get('message', '未发现路径')}")

    if args.consistency:
        result = engine.check_consistency(args.consistency)
        print(f"\n一致性检查: {args.consistency}")
        if result.get("consistent"):
            print("状态: 一致")
        else:
            print(f"矛盾数: {result['contradiction_count']}")


def run_demo(engine: MultiDocReasoningEngine):
    """运行完整演示"""
    print("=" * 60)
    print("多文档关系推理系统 — 完整演示")
    print("=" * 60)

    # 1. 创建示例文档
    print("\n[1/4] 创建示例文档...")
    documents = {
        "产品发布.md": (
            "苹果公司今天发布了新款iPhone 16 Pro Max，搭载A18 Pro芯片。"
            "这款产品在性能上比上一代提升了30%。"
            "Tim Cook 在发布会上表示，Vision Pro的市场表现超出预期。"
        ),
        "财报分析.md": (
            "Apple Inc. 公布了2024年第四季度财报，营收超出市场预期。"
            "库克表示对AI领域的布局感到兴奋。"
            "苹果公司与OpenAI达成合作协议，将在iOS中集成GPT技术。"
        ),
        "AI合作.md": (
            "OpenAI 发布了GPT-4o模型，支持多模态输入。"
            "Sam Altman 在发布会上展示了模型的新能力。"
            "OpenAI研究机构宣布与苹果公司达成战略合作。"
        ),
        "行业分析.md": (
            "微软投资了OpenAI，并将GPT模型集成到Azure云服务中。"
            "Sam Altman 表示AI技术将重塑整个科技行业。"
            "苹果公司的Vision Pro搭载了M2芯片，由台积电代工生产。"
        ),
    }

    for doc_id, text in documents.items():
        print(f"  - {doc_id}")

    # 2. 构建索引
    print("\n[2/4] 构建 LightRAG 索引...")
    engine.index_documents(documents)
    stats = engine.get_stats()
    print(f"  索引完成: {stats['document_count']} 篇文档, "
          f"{stats.get('graph_nodes', 0)} 个图节点")

    # 3. 关系推理测试
    print("\n[3/4] 关系推理测试...")
    test_cases = [
        ("Sam Altman", "苹果公司"),
        ("OpenAI", "Vision Pro"),
        ("Tim Cook", "微软"),
    ]

    for entity_a, entity_b in test_cases:
        result = engine.reason_relationship(entity_a, entity_b)
        print(f"\n  {entity_a} <-> {entity_b}:")
        if result.get("has_path"):
            print(f"    路径: {result['path_description']}")
        else:
            print(f"    {result.get('message', '无路径')}")

    # 4. 一致性检查
    print("\n[4/4] 一致性检查...")
    for entity in ["苹果公司", "OpenAI", "GPT-4"]:
        result = engine.check_consistency(entity)
        status = "✓ 一致" if result.get("consistent") else "✗ 有矛盾"
        count = result.get("contradiction_count", 0)
        print(f"  {entity}: {status}" + (f" ({count} 处)" if count else ""))

    # 5. 综合查询
    print("\n\n综合查询测试:")
    questions = [
        "Sam Altman 和苹果公司之间有什么关系？",
        "Vision Pro 使用了哪些技术？",
        "OpenAI 与哪些公司有合作？",
    ]

    for question in questions:
        result = engine.full_reasoning_pipeline(question)
        print(f"\n  Q: {question}")
        print(f"  A: {result['answer'][:200]}...")

    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

### 10.4.5 运行指南

**安装依赖**：

```bash
pip install lightrag fastapi uvicorn pydantic networkx numpy
```

**运行完整演示**：

```bash
python main.py --demo
```

**索引文档并查询**：

```bash
# 索引文档目录
python main.py --index ./sample_docs

# 关系路径推理
python main.py --reason "Sam Altman" "苹果公司"

# 一致性检查
python main.py --consistency "GPT-4"

# 综合查询
python main.py --query "OpenAI 与哪些公司有合作？"
```

**启动 Web 服务**：

```bash
python app.py

# API 调用示例
curl -X POST http://localhost:8000/reason \
  -H "Content-Type: application/json" \
  -d '{"entity_a": "Sam Altman", "entity_b": "苹果公司", "max_depth": 4}'

curl -X POST http://localhost:8000/consistency \
  -H "Content-Type: application/json" \
  -d '{"entity_name": "GPT-4"}'

curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "Sam Altman 和苹果公司之间有什么关系？"}'
```

### 10.4.6 完整运行示例

```python
# run_demo.py — 端到端演示脚本
from reasoning_engine import MultiDocReasoningEngine


def main():
    engine = MultiDocReasoningEngine(working_dir="./demo_index")

    # 索引文档
    docs = {
        "doc1": "苹果公司由史蒂夫·乔布斯于1976年创立，总部位于库比蒂诺。"
                "苹果公司是全球最大的科技公司之一，以iPhone、iPad和Mac闻名。"
                "Tim Cook 自2011年起担任苹果公司CEO。",
        "doc2": "OpenAI 是一家人工智能研究公司，成立于2015年，总部在旧金山。"
                "Sam Altman 是 OpenAI 的 CEO。"
                "OpenAI 开发了 GPT 系列模型，包括 GPT-4 和 GPT-4o。",
        "doc3": "苹果公司与 OpenAI 达成合作协议，将在 iOS 系统中集成 GPT 技术。"
                "这一合作将提升 Siri 的智能水平。"
                "GPT-4 拥有约 1 万亿参数，支持多模态输入。",
        "doc4": "微软投资了 OpenAI 超过 100 亿美元。"
                "Sam Altman 曾短暂离开 OpenAI 后回归。"
                "GPT-4 的参数量约为 1.7 万亿。",
    }
    engine.index_documents(docs)

    # 关系推理
    print("\n关系推理: Sam Altman <-> 苹果公司")
    result = engine.reason_relationship("Sam Altman", "苹果公司")
    if result.get("has_path"):
        print(f"  路径: {result['path_description']}")

    # 一致性检查
    print("\n一致性检查: GPT-4")
    result = engine.check_consistency("GPT-4")
    if not result.get("consistent"):
        for c in result.get("contradictions", []):
            print(f"  [{c['type']}] {c['attribute']} (置信度: {c['confidence']})")

    # 综合查询
    print("\n综合查询: 苹果公司与 OpenAI 的合作关系")
    result = engine.full_reasoning_pipeline("苹果公司与 OpenAI 的合作关系")
    print(f"  答案: {result['answer'][:300]}...")


if __name__ == "__main__":
    main()
```

---

## 10.5 潜在风险与注意事项

### 10.5.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 实体链接错误 | 名称相似度阈值设置不当 | 调整阈值，增加上下文匹配权重 |
| 路径推理遗漏 | 图结构不完整或 max_depth 过小 | 增加 max_depth，检查实体提取质量 |
| 矛盾误报 | 上下文理解不足导致误判 | 使用 LLM 辅助判断，降低自动检测阈值 |
| 矛盾漏报 | 矛盾信息分散在长文本中 | 增加文本分块粒度，提高检测覆盖率 |
| 推理结果不可解释 | 路径描述过于技术化 | 使用 LLM 生成自然语言解释 |

### 10.5.2 架构陷阱

1. **图规模失控**：随着文档持续增加，图节点和边数量快速增长，路径搜索性能下降。建议定期进行图剪枝和压缩（参考第6章）。

2. **实体链接的级联错误**：实体链接错误会传导到路径推理和矛盾检测，导致后续所有推理结果不可靠。建议在实体链接阶段引入人工审核机制。

3. **矛盾检测的过度敏感**：不同文档可能从不同角度描述同一实体，看似矛盾实则互补。建议使用 LLM 辅助判断，避免过度报告。

4. **路径推理的语义漂移**：长路径（超过 3 跳）的语义相关性可能急剧下降。建议对长路径进行语义相关性过滤，只保留高相关性的路径。

### 10.5.3 最佳实践

1. **分层推理策略**：先进行实体链接，再进行路径推理，最后进行矛盾检测。每一层的输出作为下一层的输入，形成推理流水线。

2. **人机协作**：对于高置信度的矛盾（>0.9），自动消解；对于中等置信度的矛盾（0.7-0.9），标记为待人工审核；对于低置信度的矛盾（<0.7），忽略。

3. **增量一致性维护**：每次增量添加文档后，自动触发对受影响实体的一致性检查，而不是全量扫描。

4. **推理结果缓存**：对高频查询的关系推理结果进行缓存，避免重复计算。

5. **多源可信度建模**：为不同来源的文档建立可信度模型，在矛盾消解时优先采信高可信度来源的信息。

---

## 本章小结

1. **跨文档实体链接**是多文档关系推理的基础，通过名称相似度、上下文相似度和类型匹配的综合评分，将不同文档中的同一实体关联起来。LightRAG 的图索引结构为实体链接提供了天然的基础设施。

2. **关系路径推理**通过 BFS、Dijkstra 等图路径搜索算法，发现实体之间的间接关联。路径长度、边权重和语义相关性是评估路径质量的核心指标。

3. **矛盾检测与一致性检查**自动识别多文档间的数值矛盾、事实矛盾、关系矛盾和属性矛盾，并通过来源可信度、LLM 判断等策略进行冲突消解。

4. **完整的代码示例**提供了从实体链接到矛盾检测的全链路实现，包括 Web API 服务和命令行工具，可直接用于实际项目。

5. **多文档关系推理**是 LightRAG 区别于传统 RAG 的核心能力之一，它使得系统不仅能够"找到相关信息"，更能够"理解信息之间的关系"。
