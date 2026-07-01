# 第9章 文档分析与摘要

文档分析与摘要是知识密集型应用的核心需求之一。无论是企业需要从海量报告中提炼关键信息，还是研究人员需要快速掌握文献全貌，自动化的文档分析与摘要系统都能大幅提升工作效率。LightRAG 的图结构索引和双级检索机制为这一任务提供了独特的技术路径：它不仅能够生成高质量的摘要，还能揭示文档集合中的主题结构、实体关系和知识脉络。

本章将从多文档摘要生成、主题提取与聚类、关系图谱可视化三个维度展开，最后给出一个完整的端到端代码示例。

---

## 9.1 多文档摘要生成

### 9.1.1 多文档摘要的挑战

多文档摘要（Multi-Document Summarization, MDS）与单文档摘要有本质区别。单文档摘要只需压缩单一文本，而多文档摘要需要处理以下核心挑战：

**信息冗余**：多个文档可能描述同一事件或概念，但表述方式不同。摘要需要识别并消除冗余，避免重复。

**信息互补**：不同文档可能提供同一主题的不同侧面信息。摘要需要整合互补信息，形成完整图景。

**信息矛盾**：不同来源的文档可能对同一事实存在矛盾描述。摘要需要识别矛盾并做出判断或呈现多角度。

**时序关系**：文档可能包含时间序列信息，摘要需要按时间线组织，反映事件演进。

**全局结构**：多文档集合通常存在隐含的主题层次结构，摘要需要反映这种结构而非简单拼接。

传统方法（如基于向量检索的 RAG）在处理这些挑战时存在明显不足：向量相似度无法捕捉实体间关系，缺乏全局视角，难以处理跨文档的信息整合。LightRAG 的图结构恰好弥补了这些不足。

### 9.1.2 LightRAG 摘要生成原理

LightRAG 生成多文档摘要的核心流程如下：

```
文档集合 → 图索引构建 → 实体/关系提取 → 双级检索 → 摘要生成
```

与传统 RAG 不同，LightRAG 的摘要生成不是简单的"检索-拼接-生成"流水线，而是利用图结构进行信息整合：

1. **图索引阶段**：LightRAG 从文档中提取实体和关系，构建知识图谱。每个实体节点关联其出现的源文本，每条关系边关联其实体对之间的语义连接。

2. **检索阶段**：根据摘要任务的主题，LightRAG 的双级检索机制从不同粒度获取信息：
   - **低层检索**：获取与主题直接相关的具体实体和事实
   - **高层检索**：获取跨实体的抽象关系和全局主题

3. **生成阶段**：将检索结果组织为结构化的上下文，送入 LLM 生成摘要。

这种基于图结构的摘要生成方式具有以下优势：

| 特性 | 传统 RAG | LightRAG |
|------|---------|----------|
| 信息覆盖 | 依赖向量相似度，可能遗漏关键信息 | 图结构保证关联实体的完整覆盖 |
| 冗余控制 | 多个相似文本块可能重复检索 | 实体去重机制天然消除冗余 |
| 关系感知 | 无法捕捉实体间关系 | 关系边提供语义连接信息 |
| 全局视角 | 缺乏主题层次结构 | 高层检索提供抽象摘要 |
| 跨文档整合 | 文档块独立检索，难以整合 | 图结构天然跨文档连接实体 |

### 9.1.3 摘要生成策略

LightRAG 支持多种摘要生成策略，适用于不同的业务场景：

**策略一：基于查询的摘要（Query-Focused Summarization）**

用户提供一个查询主题，LightRAG 围绕该主题检索相关信息并生成摘要。这是最常用的策略，适用于"给我总结一下关于 XX 的内容"这类需求。

```python
from lightrag import LightRAG, QueryParam

rag = LightRAG(working_dir="./index")

# 围绕特定主题生成摘要
param = QueryParam(mode="hybrid", top_k=20)
summary = rag.query("总结所有文档中关于数据库性能优化的内容", param=param)
```

**策略二：全局摘要（Global Summarization）**

不依赖具体查询，对整个文档集合生成全局摘要。LightRAG 的高层检索模式天然支持这一需求——通过提取所有高层关系键，可以获取文档集合的全局主题结构。

```python
param = QueryParam(mode="high", top_k=50)
global_summary = rag.query("请对以上所有文档内容进行全面的总结，涵盖主要主题和关键发现", param=param)
```

**策略三：分层摘要（Hierarchical Summarization）**

先对文档集合进行主题聚类，再对每个主题簇生成摘要，最后汇总为整体摘要。这种策略适用于大规模文档集合，能够生成结构化的多层次摘要。

```python
# 第一步：获取全局主题
param_high = QueryParam(mode="high", top_k=30)
themes = rag.query("这份文档集合包含哪些主要主题？请列出所有主题", param=param_high)

# 第二步：对每个主题深入检索
for theme in extracted_themes:
    param_low = QueryParam(mode="low", top_k=15)
    theme_summary = rag.query(f"详细总结关于「{theme}」的内容", param=param_low)
```

**策略四：对比摘要（Comparative Summarization）**

当文档集合包含多个来源或不同观点时，对比摘要能够突出差异和共识。

```python
param = QueryParam(mode="hybrid", top_k=20)
comparison = rag.query(
    "比较文档中关于PostgreSQL和MySQL的优缺点，列出它们在性能、功能和适用场景上的差异",
    param=param,
)
```

### 9.1.4 摘要质量评估

评估多文档摘要的质量通常从以下维度进行：

| 维度 | 说明 | 评估方法 |
|------|------|---------|
| 相关性 | 摘要内容是否与文档主题相关 | ROUGE-L、BERTScore |
| 完整性 | 摘要是否覆盖了所有重要信息 | 人工评估、问答测试 |
| 简洁性 | 摘要是否消除了冗余 | 压缩率、冗余度指标 |
| 一致性 | 摘要内部是否存在矛盾 | 人工评估、NLI 模型 |
| 可读性 | 摘要是否流畅自然 | 人工评估、困惑度 |

在实际项目中，建议建立领域特定的评估数据集，包含多组文档-摘要对，定期评估系统效果。

---

## 9.2 主题提取与聚类

### 9.2.1 基于图结构的主题发现

LightRAG 的知识图谱天然包含了文档集合的主题结构信息。图中的实体节点代表具体概念，关系边代表概念间的语义连接，而密集连接的子图（社区）则对应着文档集合中的主题簇。

主题提取的核心思路是：**在 LightRAG 构建的知识图谱上运行社区检测算法，将紧密相连的实体群识别为独立主题**。

LightRAG 内部使用 NetworkX 管理图结构，我们可以直接访问图对象并应用社区检测算法：

```python
import networkx as nx
from networkx.algorithms.community import greedy_modularity_communities
import json


class TopicExtractor:
    """基于图结构的主题提取器"""

    def __init__(self, rag: LightRAG):
        self.rag = rag

    def extract_topics(
        self, min_community_size: int = 3, max_topics: int = 20
    ) -> list[dict]:
        graph = self._get_graph()
        communities = self._detect_communities(graph, min_community_size)
        topics = []
        for i, community in enumerate(communities[:max_topics]):
            entities = list(community)
            topic_name = self._generate_topic_name(entities)
            topics.append({
                "topic_id": i + 1,
                "topic_name": topic_name,
                "entities": entities,
                "entity_count": len(entities),
                "central_entity": self._find_central_entity(graph, community),
            })
        return topics

    def _get_graph(self) -> nx.Graph:
        graph_path = f"{self.rag.working_dir}/graph_chunk_entity_relation.graphml"
        if not os.path.exists(graph_path):
            graph_path = f"{self.rag.working_dir}/graph_data.json"
            if os.path.exists(graph_path):
                with open(graph_path, "r") as f:
                    data = json.load(f)
                g = nx.Graph()
                for node in data.get("nodes", []):
                    g.add_node(node["id"], **node)
                for edge in data.get("edges", []):
                    g.add_edge(edge["source"], edge["target"], **edge)
                return g
            raise FileNotFoundError("Graph data not found in working directory")
        return nx.read_graphml(graph_path)

    def _detect_communities(
        self, graph: nx.Graph, min_size: int
    ) -> list[set]:
        communities = list(greedy_modularity_communities(graph))
        return [c for c in communities if len(c) >= min_size]

    def _find_central_entity(self, graph: nx.Graph, community: set) -> str:
        subgraph = graph.subgraph(community)
        centrality = nx.degree_centrality(subgraph)
        return max(centrality, key=centrality.get)

    def _generate_topic_name(self, entities: list[str]) -> str:
        prompt = (
            f"基于以下实体列表，生成一个简洁的主题名称（10个字以内）：\n"
            f"实体：{', '.join(entities[:10])}\n"
            f"主题名称："
        )
        return self.rag.llm_model_func(prompt)
```

### 9.2.2 主题聚类算法

除了基于图社区的检测方法，还可以结合向量嵌入进行主题聚类。LightRAG 的实体和关系都带有向量嵌入，这使得我们可以使用传统的聚类算法（如 K-Means、DBSCAN、HDBSCAN）对实体进行主题聚类。

**方法一：基于图社区的聚类（推荐）**

利用 NetworkX 的社区检测算法，直接在知识图谱上发现主题簇。这种方法利用了图的结构信息，聚类结果具有可解释性。

| 算法 | 特点 | 适用场景 |
|------|------|---------|
| Greedy Modularity | 速度快，适合中小规模图 | 通用场景 |
| Label Propagation | 无需指定社区数量 | 主题数量未知 |
| Louvain/Leiden | 层次化社区划分 | 大规模图，需要层次结构 |
| Girvan-Newman | 基于边介数，质量高但慢 | 小规模精确分析 |

**方法二：基于向量嵌入的聚类**

将实体的向量嵌入作为特征，使用传统聚类算法：

```python
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score


class EmbeddingCluster:
    """基于向量嵌入的主题聚类"""

    def __init__(self, rag: LightRAG):
        self.rag = rag

    def cluster_by_embedding(
        self, n_clusters: int = 8, algorithm: str = "kmeans"
    ) -> list[dict]:
        entities, embeddings = self._get_entity_embeddings()
        if len(entities) < n_clusters:
            return [{"cluster_id": 0, "entities": entities, "topic": "全部"}]

        embeddings_array = np.array(embeddings)

        if algorithm == "kmeans":
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(embeddings_array)
        elif algorithm == "dbscan":
            model = DBSCAN(eps=0.5, min_samples=2)
            labels = model.fit_predict(embeddings_array)
        else:
            raise ValueError(f"Unknown algorithm: {algorithm}")

        clusters = {}
        for entity, label in zip(entities, labels):
            if label == -1:
                continue
            clusters.setdefault(int(label), []).append(entity)

        results = []
        for cid, members in clusters.items():
            topic = self._name_cluster(members)
            results.append({
                "cluster_id": cid,
                "topic": topic,
                "entities": members,
                "entity_count": len(members),
            })

        if algorithm == "kmeans" and len(clusters) > 1:
            sil = silhouette_score(embeddings_array, labels)
            print(f"轮廓系数: {sil:.3f}")

        return results

    def _get_entity_embeddings(self) -> tuple[list[str], list[list[float]]]:
        entities = []
        embeddings = []
        graph = self._load_graph()
        for node, data in graph.nodes(data=True):
            if "embedding" in data:
                entities.append(node)
                embeddings.append(data["embedding"])
        return entities, embeddings

    def _load_graph(self) -> nx.Graph:
        path = f"{self.rag.working_dir}/graph_chunk_entity_relation.graphml"
        if os.path.exists(path):
            return nx.read_graphml(path)
        path = f"{self.rag.working_dir}/graph_data.json"
        if os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
            g = nx.Graph()
            for n in data.get("nodes", []):
                g.add_node(n["id"], embedding=n.get("embedding", []))
            for e in data.get("edges", []):
                g.add_edge(e["source"], e["target"])
            return g
        raise FileNotFoundError("No graph data found")

    def _name_cluster(self, entities: list[str]) -> str:
        prompt = (
            f"以下是一组相关的实体，请用一句话概括它们的共同主题（20字以内）：\n"
            f"实体：{', '.join(entities[:8])}\n"
            f"主题名称："
        )
        return self.rag.llm_model_func(prompt)
```

**方法三：混合聚类（推荐）**

结合图社区和向量嵌入的混合方法，先使用社区检测获得粗粒度主题簇，再在每个簇内使用向量聚类进行细粒度划分：

```python
class HybridTopicClustering:
    """混合主题聚类：图社区 + 向量嵌入"""

    def __init__(self, rag: LightRAG):
        self.rag = rag
        self.graph_cluster = TopicExtractor(rag)
        self.embed_cluster = EmbeddingCluster(rag)

    def hierarchical_clustering(
        self, top_n_communities: int = 10
    ) -> list[dict]:
        communities = self.graph_cluster.extract_topics(
            min_community_size=3, max_topics=top_n_communities
        )
        result = []
        for comm in communities:
            if comm["entity_count"] > 10:
                sub_clusters = self.embed_cluster.cluster_by_embedding(
                    n_clusters=min(3, comm["entity_count"] // 3)
                )
                for sub in sub_clusters:
                    result.append({
                        "parent_topic": comm["topic_name"],
                        "sub_topic": sub["topic"],
                        "entities": sub["entities"],
                        "entity_count": sub["entity_count"],
                    })
            else:
                result.append({
                    "parent_topic": comm["topic_name"],
                    "sub_topic": comm["topic_name"],
                    "entities": comm["entities"],
                    "entity_count": comm["entity_count"],
                })
        return result
```

### 9.2.3 主题演化分析

对于时间序列文档集合（如新闻、科研论文、项目报告），主题演化分析能够揭示主题随时间的变化趋势：

```python
from collections import defaultdict
from datetime import datetime


class TopicEvolution:
    """主题演化分析"""

    def __init__(self, rag: LightRAG):
        self.rag = rag

    def analyze_evolution(
        self, time_field: str = "created_at"
    ) -> list[dict]:
        graph = self._load_graph()
        communities = list(greedy_modularity_communities(graph))
        evolution = []

        for community in communities:
            entities = list(community)
            time_dist = self._get_time_distribution(entities, time_field)
            if len(time_dist) < 2:
                continue
            topic_name = self._name_topic(entities)
            trend = self._compute_trend(time_dist)
            evolution.append({
                "topic": topic_name,
                "entities": entities,
                "time_distribution": time_dist,
                "trend": trend,
                "entity_count": len(entities),
            })

        evolution.sort(key=lambda x: abs(x["trend"]), reverse=True)
        return evolution

    def _get_time_distribution(
        self, entities: list[str], time_field: str
    ) -> dict[str, int]:
        dist = defaultdict(int)
        for entity in entities:
            timestamp = self._get_entity_meta(entity, time_field)
            if timestamp:
                period = timestamp[:7]
                dist[period] += 1
        return dict(dist)

    def _compute_trend(self, time_dist: dict[str, int]) -> float:
        periods = sorted(time_dist.keys())
        if len(periods) < 2:
            return 0.0
        values = [time_dist[p] for p in periods]
        n = len(values)
        x_mean = (n - 1) / 2
        y_mean = sum(values) / n
        numerator = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        return numerator / denominator if denominator != 0 else 0.0

    def _get_entity_meta(self, entity: str, field: str) -> str | None:
        graph = self._load_graph()
        if entity in graph.nodes:
            return graph.nodes[entity].get(field)
        return None

    def _load_graph(self) -> nx.Graph:
        path = f"{self.rag.working_dir}/graph_chunk_entity_relation.graphml"
        return nx.read_graphml(path) if os.path.exists(path) else nx.Graph()

    def _name_topic(self, entities: list[str]) -> str:
        prompt = f"为以下实体集合生成一个主题名称：{', '.join(entities[:8])}\n主题："
        return self.rag.llm_model_func(prompt)
```

### 9.2.4 主题摘要生成

对每个主题簇，可以生成独立的主题摘要，形成结构化的主题报告：

```python
class TopicSummaryGenerator:
    """主题摘要生成器"""

    def __init__(self, rag: LightRAG):
        self.rag = rag

    def generate_topic_summary(self, topic_name: str, entities: list[str]) -> dict:
        entity_context = "\n".join(f"- {e}" for e in entities)
        prompt = (
            f"你是一个文档分析专家。请基于以下实体列表，生成一份主题分析报告。\n\n"
            f"主题名称：{topic_name}\n\n"
            f"相关实体：\n{entity_context}\n\n"
            f"请生成包含以下内容的报告：\n"
            f"1. 主题概述（2-3句话）\n"
            f"2. 关键实体及其角色\n"
            f"3. 实体间的主要关系\n"
            f"4. 该主题的核心发现或结论\n"
        )
        summary = self.rag.llm_model_func(prompt)

        return {
            "topic": topic_name,
            "summary": summary,
            "entities": entities,
            "entity_count": len(entities),
        }

    def generate_full_report(self, topics: list[dict]) -> str:
        sections = []
        for t in topics:
            report = self.generate_topic_summary(t["topic_name"], t["entities"])
            sections.append(f"## {report['topic']}\n\n{report['summary']}")

        header = "# 文档集合主题分析报告\n\n"
        header += f"共识别 {len(topics)} 个主题\n\n---\n\n"
        return header + "\n\n---\n\n".join(sections)
```

---

## 9.3 关系图谱可视化

### 9.3.1 可视化的重要性

关系图谱可视化是将 LightRAG 构建的知识图谱以图形方式呈现的过程。一个好的可视化能够：

- **直观展示主题结构**：一眼看出文档集合包含哪些主题以及它们之间的关系
- **发现隐含模式**：通过视觉布局发现实体间的隐含关联
- **支持交互式探索**：用户可以通过缩放、点击、拖拽等方式探索知识图谱
- **增强可解释性**：让摘要和检索结果变得可追溯、可理解

### 9.3.2 使用 NetworkX + Matplotlib 静态可视化

最基础的可视化方式，适合快速查看图结构：

```python
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.patches import FancyBboxPatch
import numpy as np


class StaticGraphVisualizer:
    """静态关系图谱可视化"""

    def __init__(self, figsize: tuple = (16, 12)):
        self.figsize = figsize

    def visualize(
        self,
        graph: nx.Graph,
        title: str = "LightRAG 知识图谱",
        output_path: str = "graph_visualization.png",
        node_color_by: str = "community",
        max_nodes: int = 200,
    ):
        if graph.number_of_nodes() > max_nodes:
            largest_cc = max(nx.connected_components(graph), key=len)
            graph = graph.subgraph(list(largest_cc)[:max_nodes])

        fig, ax = plt.subplots(1, 1, figsize=self.figsize)
        pos = nx.spring_layout(graph, k=2, iterations=50, seed=42)

        if node_color_by == "community" and graph.number_of_nodes() > 5:
            communities = list(greedy_modularity_communities(graph))
            node_colors = self._assign_community_colors(graph, communities)
        else:
            node_colors = "#4A90D9"

        node_sizes = self._compute_node_sizes(graph)
        edge_widths = self._compute_edge_widths(graph)

        nx.draw_networkx_edges(
            graph, pos, alpha=0.3, width=edge_widths,
            edge_color="#888888", ax=ax,
        )
        nx.draw_networkx_nodes(
            graph, pos, node_size=node_sizes,
            node_color=node_colors, alpha=0.85,
            edgecolors="white", linewidths=0.5, ax=ax,
        )

        labels = {n: n for n in list(graph.nodes())[:30]}
        nx.draw_networkx_labels(
            graph, pos, labels=labels, font_size=8,
            font_family="sans-serif", ax=ax,
        )

        ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
        ax.axis("off")
        plt.tight_layout()
        plt.savefig(output_path, dpi=150, bbox_inches="tight")
        plt.close()
        print(f"图谱已保存至: {output_path}")

    def _assign_community_colors(
        self, graph: nx.Graph, communities: list[set]
    ) -> list:
        colors = list(mcolors.TABLEAU_COLORS.values())
        node_to_color = {}
        for i, comm in enumerate(communities):
            color = colors[i % len(colors)]
            for node in comm:
                node_to_color[node] = color
        return [node_to_color.get(n, "#999999") for n in graph.nodes()]

    def _compute_node_sizes(self, graph: nx.Graph) -> list:
        degrees = dict(graph.degree())
        max_deg = max(degrees.values()) if degrees else 1
        return [50 + 200 * (degrees[n] / max_deg) for n in graph.nodes()]

    def _compute_edge_widths(self, graph: nx.Graph) -> list:
        weights = []
        for u, v, data in graph.edges(data=True):
            w = data.get("weight", data.get("importance", 1))
            weights.append(max(0.5, min(5, float(w))))
        return weights
```

### 9.3.3 使用 PyVis 交互式可视化

PyVis 生成基于浏览器的交互式 HTML 可视化，支持缩放、拖拽、点击查看详情等交互操作：

```python
from pyvis.network import Network
import json


class InteractiveGraphVisualizer:
    """交互式关系图谱可视化（PyVis）"""

    def __init__(self, height: str = "750px", width: str = "100%"):
        self.height = height
        self.width = width

    def visualize(
        self,
        graph: nx.Graph,
        output_path: str = "graph_interactive.html",
        show_buttons: bool = True,
        physics: bool = True,
    ) -> str:
        net = Network(height=self.height, width=self.width, directed=False)
        net.set_options(self._build_options(show_buttons, physics))

        degrees = dict(graph.degree())
        max_deg = max(degrees.values()) if degrees else 1

        communities = list(greedy_modularity_communities(graph))
        community_colors = self._generate_colors(len(communities))
        node_community = {}
        for i, comm in enumerate(communities):
            for node in comm:
                node_community[node] = i

        for node, data in graph.nodes(data=True):
            deg = degrees.get(node, 1)
            size = 10 + 30 * (deg / max_deg)
            comm_id = node_community.get(node, -1)
            color = community_colors[comm_id % len(community_colors)] if comm_id >= 0 else "#97C2FC"
            title = self._build_node_tooltip(node, data)
            net.add_node(
                node, label=node, title=title,
                size=size, color=color,
                borderWidth=1, borderWidthSelected=3,
            )

        for u, v, data in graph.edges(data=True):
            weight = float(data.get("weight", data.get("importance", 1)))
            width = max(0.5, min(8, weight))
            title = data.get("description", data.get("relation_name", ""))
            net.add_edge(u, v, value=weight, width=width, title=title)

        net.show(output_path)
        print(f"交互式图谱已保存至: {output_path}")
        return output_path

    def _build_options(self, show_buttons: bool, physics: bool) -> str:
        options = {
            "nodes": {
                "font": {"size": 14, "face": "Microsoft YaHei"},
                "shape": "dot",
            },
            "edges": {
                "font": {"size": 10, "face": "Microsoft YaHei"},
                "smooth": {"type": "continuous"},
            },
            "physics": {
                "enabled": physics,
                "stabilization": {"iterations": 200},
                "barnesHut": {
                    "gravitationalConstant": -3000,
                    "centralGravity": 0.3,
                    "springLength": 200,
                    "springConstant": 0.04,
                },
            },
            "interaction": {
                "hover": True,
                "tooltipDelay": 200,
                "navigationButtons": True,
                "keyboard": True,
            },
        }
        return json.dumps(options)

    def _build_node_tooltip(self, node: str, data: dict) -> str:
        lines = [f"<b>{node}</b>"]
        for key in ["type", "description", "source", "summary"]:
            if key in data:
                val = str(data[key])[:200]
                lines.append(f"{key}: {val}")
        return "<br>".join(lines)

    def _generate_colors(self, n: int) -> list[str]:
        base = [
            "#4A90D9", "#E74C3C", "#2ECC71", "#F39C12", "#9B59B6",
            "#1ABC9C", "#E67E22", "#3498DB", "#E91E63", "#00BCD4",
            "#FF5722", "#8BC34A", "#FFC107", "#673AB7", "#009688",
            "#CDDC39", "#FF9800", "#795548", "#607D8B", "#F44336",
        ]
        return base[:n] if n <= len(base) else base * (n // len(base) + 1)
```

### 9.3.4 主题子图可视化

对于大规模知识图谱，整体可视化可能过于拥挤。主题子图可视化只展示特定主题相关的子图，更加清晰：

```python
class TopicSubgraphVisualizer:
    """主题子图可视化"""

    def __init__(self, rag: LightRAG):
        self.rag = rag

    def visualize_topic(
        self,
        topic_name: str,
        entities: list[str],
        output_path: str = "topic_subgraph.html",
        hop: int = 1,
    ) -> str:
        graph = self._load_graph()
        subgraph = self._extract_subgraph(graph, entities, hop)
        viz = InteractiveGraphVisualizer()
        return viz.visualize(subgraph, output_path)

    def visualize_multiple_topics(
        self,
        topics: list[dict],
        output_path: str = "multi_topic_graph.html",
    ) -> str:
        graph = self._load_graph()
        all_entities = []
        for t in topics:
            all_entities.extend(t["entities"])
        subgraph = self._extract_subgraph(graph, all_entities, hop=0)
        viz = InteractiveGraphVisualizer()
        return viz.visualize(subgraph, output_path)

    def _load_graph(self) -> nx.Graph:
        path = f"{self.rag.working_dir}/graph_chunk_entity_relation.graphml"
        if os.path.exists(path):
            return nx.read_graphml(path)
        path = f"{self.rag.working_dir}/graph_data.json"
        if os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
            g = nx.Graph()
            for n in data.get("nodes", []):
                g.add_node(n["id"])
            for e in data.get("edges", []):
                g.add_edge(e["source"], e["target"])
            return g
        raise FileNotFoundError("No graph data found")

    def _extract_subgraph(
        self, graph: nx.Graph, seed_entities: list[str], hop: int
    ) -> nx.Graph:
        nodes = set(seed_entities)
        for _ in range(hop):
            neighbors = set()
            for node in nodes:
                if node in graph:
                    neighbors.update(graph.neighbors(node))
            nodes.update(neighbors)
        return graph.subgraph(nodes)
```

### 9.3.5 可视化布局策略

不同的布局算法适用于不同的分析目的：

| 布局算法 | 特点 | 适用场景 |
|---------|------|---------|
| Spring Layout (Fruchterman-Reingold) | 力导向，节点均匀分布 | 通用场景，展示整体结构 |
| Kamada-Kawai | 基于最短路径，对称性好 | 展示实体间距离关系 |
| Circular Layout | 节点沿圆周排列 | 展示环状关系结构 |
| Spectral Layout | 基于拉普拉斯矩阵特征向量 | 展示图的内在结构 |
| Hierarchical Layout | 分层排列 | 展示层次化主题结构 |
| Community Layout | 按社区分组排列 | 展示主题簇分布 |

```python
def visualize_with_layout(
    graph: nx.Graph,
    layout: str = "spring",
    output_path: str = "graph_layout.png",
):
    layout_funcs = {
        "spring": nx.spring_layout,
        "kamada_kawai": nx.kamada_kawai_layout,
        "circular": nx.circular_layout,
        "spectral": nx.spectral_layout,
        "shell": nx.shell_layout,
        "random": nx.random_layout,
    }
    pos = layout_funcs.get(layout, nx.spring_layout)(graph, seed=42)
    fig, ax = plt.subplots(figsize=(14, 10))
    nx.draw(graph, pos, with_labels=True, node_size=80,
            node_color="#4A90D9", edge_color="#CCCCCC",
            font_size=7, ax=ax)
    ax.set_title(f"Layout: {layout}", fontsize=14)
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
```

---

## 9.4 完整代码示例

本节提供一个完整的端到端文档分析与摘要系统，涵盖从文档索引到主题提取、摘要生成和图谱可视化的全流程。完整代码位于 `demos/ch09-summary/` 目录。

### 9.4.1 系统架构

```
demos/ch09-summary/
├── __init__.py
├── doc_analyzer.py          # 文档分析器（核心类）
├── topic_extractor.py       # 主题提取与聚类
├── summary_generator.py     # 摘要生成器
├── graph_visualizer.py      # 图谱可视化
├── report_generator.py      # 报告生成器
├── app.py                   # Web API 服务
├── requirements.txt         # 依赖
├── sample_docs/             # 示例文档
└── output/                  # 输出目录
```

### 9.4.2 核心实现

**doc_analyzer.py** — 文档分析器核心类：

```python
import os
import json
import networkx as nx
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from lightrag import LightRAG, QueryParam
from lightrag.llm import gpt_4o_mini_complete
from lightrag.embedding import openai_embedding
from networkx.algorithms.community import greedy_modularity_communities


@dataclass
class AnalysisResult:
    """文档分析结果"""
    summary: str = ""
    topics: List[Dict] = field(default_factory=list)
    entity_count: int = 0
    relation_count: int = 0
    community_count: int = 0
    graph_stats: Dict[str, Any] = field(default_factory=dict)


class DocumentAnalyzer:
    """文档分析与摘要系统核心类"""

    def __init__(
        self,
        working_dir: str = "./analysis_index",
        llm_func=None,
        embedding_func=None,
        embedding_dim: int = 1536,
    ):
        self.working_dir = working_dir
        os.makedirs(working_dir, exist_ok=True)
        self.rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=llm_func or gpt_4o_mini_complete,
            embedding_func=embedding_func or openai_embedding,
            embedding_dim=embedding_dim,
        )

    def insert_document(self, text: str) -> None:
        self.rag.insert(text)

    def insert_documents(self, texts: List[str]) -> int:
        count = 0
        for text in texts:
            if len(text.strip()) >= 50:
                self.rag.insert(text)
                count += 1
        return count

    def insert_directory(self, dir_path: str) -> Dict[str, int]:
        total = 0
        files = 0
        for root, _, fnames in os.walk(dir_path):
            for fname in fnames:
                ext = Path(fname).suffix.lower()
                if ext not in {".md", ".txt", ".html", ".pdf"}:
                    continue
                file_path = os.path.join(root, fname)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        text = f.read()
                    self.rag.insert(text)
                    total += 1
                    files += 1
                    print(f"  ✓ {fname}")
                except Exception as e:
                    print(f"  ✗ {fname}: {e}")
        return {"files": files, "chunks": total}

    def generate_summary(
        self,
        query: str = "请对以上所有文档内容进行全面总结",
        mode: str = "hybrid",
        top_k: int = 30,
    ) -> str:
        param = QueryParam(mode=mode, top_k=top_k)
        return self.rag.query(query, param=param)

    def extract_topics(
        self,
        min_community_size: int = 3,
        max_topics: int = 20,
    ) -> List[Dict]:
        graph = self._load_graph()
        if graph.number_of_nodes() == 0:
            return []

        communities = list(greedy_modularity_communities(graph))
        communities = [c for c in communities if len(c) >= min_community_size]

        topics = []
        for i, community in enumerate(communities[:max_topics]):
            entities = sorted(community)
            subgraph = graph.subgraph(community)
            centrality = nx.degree_centrality(subgraph)
            central = max(centrality, key=centrality.get)
            topic_name = self._name_topic(entities)
            topics.append({
                "topic_id": i + 1,
                "topic_name": topic_name,
                "entities": entities,
                "entity_count": len(entities),
                "central_entity": central,
                "density": nx.density(subgraph),
            })

        topics.sort(key=lambda t: t["entity_count"], reverse=True)
        return topics

    def generate_topic_summaries(self, topics: List[Dict]) -> List[Dict]:
        results = []
        for topic in topics:
            entity_text = "\n".join(f"- {e}" for e in topic["entities"][:15])
            prompt = (
                f"你是一个文档分析专家。请基于以下实体列表，生成一份主题分析。\n\n"
                f"主题名称：{topic['topic_name']}\n\n"
                f"相关实体：\n{entity_text}\n\n"
                f"请包含：\n"
                f"1. 主题概述（2-3句话）\n"
                f"2. 关键实体及其角色\n"
                f"3. 核心发现\n"
            )
            summary = self.rag.llm_model_func(prompt)
            results.append({
                "topic_id": topic["topic_id"],
                "topic_name": topic["topic_name"],
                "summary": summary,
                "entities": topic["entities"],
                "entity_count": topic["entity_count"],
            })
        return results

    def get_graph_stats(self) -> Dict[str, Any]:
        graph = self._load_graph()
        if graph.number_of_nodes() == 0:
            return {"status": "empty"}
        communities = list(greedy_modularity_communities(graph))
        return {
            "node_count": graph.number_of_nodes(),
            "edge_count": graph.number_of_edges(),
            "community_count": len(communities),
            "density": nx.density(graph),
            "avg_degree": sum(dict(graph.degree()).values()) / max(graph.number_of_nodes(), 1),
            "is_connected": nx.is_connected(graph) if graph.number_of_nodes() > 0 else False,
        }

    def full_analysis(self) -> AnalysisResult:
        result = AnalysisResult()
        result.summary = self.generate_summary()
        result.topics = self.extract_topics()
        result.graph_stats = self.get_graph_stats()
        result.entity_count = result.graph_stats.get("node_count", 0)
        result.relation_count = result.graph_stats.get("edge_count", 0)
        result.community_count = result.graph_stats.get("community_count", 0)
        return result

    def _load_graph(self) -> nx.Graph:
        path = os.path.join(self.working_dir, "graph_chunk_entity_relation.graphml")
        if os.path.exists(path):
            return nx.read_graphml(path)
        path = os.path.join(self.working_dir, "graph_data.json")
        if os.path.exists(path):
            with open(path, "r") as f:
                data = json.load(f)
            g = nx.Graph()
            for n in data.get("nodes", []):
                g.add_node(n["id"])
            for e in data.get("edges", []):
                g.add_edge(e["source"], e["target"])
            return g
        return nx.Graph()

    def _name_topic(self, entities: List[str]) -> str:
        prompt = (
            f"基于以下实体列表，生成一个简洁的主题名称（10个字以内）：\n"
            f"实体：{', '.join(entities[:10])}\n"
            f"主题名称："
        )
        return self.rag.llm_model_func(prompt).strip()
```

**summary_generator.py** — 多策略摘要生成器：

```python
from typing import List, Dict, Optional
from lightrag import QueryParam


class SummaryGenerator:
    """多策略摘要生成器"""

    def __init__(self, analyzer: "DocumentAnalyzer"):
        self.rag = analyzer.rag

    def query_summary(self, query: str, mode: str = "hybrid") -> str:
        param = QueryParam(mode=mode, top_k=20)
        return self.rag.query(query, param=param)

    def global_summary(self) -> str:
        return self.query_summary(
            "请对文档集合进行全面总结，涵盖所有主要主题和关键信息",
            mode="high",
        )

    def focused_summary(self, topic: str) -> str:
        return self.query_summary(
            f"请详细总结关于「{topic}」的所有内容",
            mode="hybrid",
        )

    def comparative_summary(self, aspect_a: str, aspect_b: str) -> str:
        return self.query_summary(
            f"比较文档中关于「{aspect_a}」和「{aspect_b}」的内容，"
            f"列出它们的异同点和各自特点",
            mode="hybrid",
        )

    def timeline_summary(self) -> str:
        return self.query_summary(
            "请按时间顺序总结文档中的事件和变化",
            mode="hybrid",
        )

    def bullet_summary(self, max_points: int = 10) -> str:
        return self.query_summary(
            f"请用{max_points}个要点总结文档集合的核心内容，每个要点一句话",
            mode="high",
        )

    def executive_summary(self) -> str:
        return self.query_summary(
            "请生成一份执行摘要（Executive Summary），面向管理层，"
            "包含：背景、关键发现、建议行动",
            mode="hybrid",
        )
```

**report_generator.py** — 完整分析报告生成器：

```python
import os
from datetime import datetime
from typing import List, Dict, Optional


class ReportGenerator:
    """文档分析报告生成器"""

    def __init__(self, analyzer: "DocumentAnalyzer"):
        self.analyzer = analyzer

    def generate_full_report(self, output_path: str = "analysis_report.md") -> str:
        print("正在执行全量分析...")
        result = self.analyzer.full_analysis()

        print("正在生成主题摘要...")
        topic_summaries = self.analyzer.generate_topic_summaries(result.topics)

        report = self._build_report(result, topic_summaries)
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"报告已保存至: {output_path}")
        return output_path

    def _build_report(
        self, result, topic_summaries: List[Dict]
    ) -> str:
        lines = []
        lines.append("# 文档分析报告\n")
        lines.append(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        lines.append("---\n")

        lines.append("## 1. 图结构统计\n\n")
        stats = result.graph_stats
        lines.append(f"| 指标 | 数值 |\n|------|------|\n")
        lines.append(f"| 实体数量 | {stats.get('node_count', 0)} |\n")
        lines.append(f"| 关系数量 | {stats.get('edge_count', 0)} |\n")
        lines.append(f"| 主题簇数量 | {stats.get('community_count', 0)} |\n")
        lines.append(f"| 图密度 | {stats.get('density', 0):.4f} |\n")
        lines.append(f"| 平均度 | {stats.get('avg_degree', 0):.2f} |\n")
        lines.append(f"| 连通性 | {'是' if stats.get('is_connected') else '否'} |\n")
        lines.append("\n")

        lines.append("## 2. 全局摘要\n\n")
        lines.append(result.summary)
        lines.append("\n\n")

        lines.append("## 3. 主题分析\n\n")
        for ts in topic_summaries:
            lines.append(f"### 3.{ts['topic_id']} {ts['topic_name']}\n\n")
            lines.append(f"**实体数量**: {ts['entity_count']}\n\n")
            lines.append(f"{ts['summary']}\n\n")
            lines.append(f"**相关实体**: {', '.join(ts['entities'][:10])}\n\n")

        lines.append("---\n")
        lines.append("*报告由 LightRAG 文档分析系统自动生成*\n")

        return "".join(lines)
```

### 9.4.3 Web API 服务

**app.py** — 基于 FastAPI 的文档分析服务：

```python
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional
import uvicorn
import tempfile
import os

from doc_analyzer import DocumentAnalyzer
from summary_generator import SummaryGenerator
from report_generator import ReportGenerator

app = FastAPI(title="LightRAG 文档分析与摘要 API", version="1.0.0")

analyzer = DocumentAnalyzer(working_dir="./analysis_index")
summarizer = SummaryGenerator(analyzer)
report_gen = ReportGenerator(analyzer)


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    mode: str = Field(default="hybrid", pattern="^(low|high|hybrid)$")
    top_k: int = Field(default=20, ge=1, le=100)


class TextInsertRequest(BaseModel):
    text: str = Field(..., min_length=10)
    title: Optional[str] = None


class AnalysisResponse(BaseModel):
    summary: str
    entity_count: int
    relation_count: int
    community_count: int
    topics: List[dict]


@app.get("/health")
def health():
    return {"status": "ok", "service": "document-analysis"}


@app.post("/insert")
def insert_text(req: TextInsertRequest):
    try:
        analyzer.insert_document(req.text)
        stats = analyzer.get_graph_stats()
        return {"status": "ok", "graph_stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/insert/file")
async def insert_file(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text = content.decode("utf-8")
        analyzer.insert_document(text)
        return {"status": "ok", "file": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
def query(req: QueryRequest):
    try:
        answer = summarizer.query_summary(req.query, mode=req.mode)
        return {"query": req.query, "answer": answer, "mode": req.mode}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/summary")
def get_summary():
    return {"summary": summarizer.global_summary()}


@app.get("/topics")
def get_topics():
    topics = analyzer.extract_topics()
    return {"topics": topics, "count": len(topics)}


@app.get("/analysis")
def get_analysis():
    result = analyzer.full_analysis()
    return AnalysisResponse(
        summary=result.summary,
        entity_count=result.entity_count,
        relation_count=result.relation_count,
        community_count=result.community_count,
        topics=result.topics,
    )


@app.get("/stats")
def get_stats():
    return analyzer.get_graph_stats()


@app.post("/report")
def generate_report():
    try:
        path = report_gen.generate_full_report("output/analysis_report.md")
        return {"status": "ok", "report_path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 9.4.4 命令行工具

**cli.py** — 命令行交互工具：

```python
import sys
import os
import argparse
import json
from doc_analyzer import DocumentAnalyzer
from summary_generator import SummaryGenerator
from report_generator import ReportGenerator
from graph_visualizer import StaticGraphVisualizer, InteractiveGraphVisualizer


def main():
    parser = argparse.ArgumentParser(description="LightRAG 文档分析与摘要工具")
    parser.add_argument("--index-dir", type=str, help="索引文档目录")
    parser.add_argument("--summary", action="store_true", help="生成全局摘要")
    parser.add_argument("--topics", action="store_true", help="提取主题")
    parser.add_argument("--query", type=str, help="查询式摘要")
    parser.add_argument("--mode", type=str, default="hybrid", choices=["low", "high", "hybrid"])
    parser.add_argument("--report", action="store_true", help="生成完整分析报告")
    parser.add_argument("--visualize", type=str, choices=["static", "interactive"], help="图谱可视化")
    parser.add_argument("--working-dir", type=str, default="./analysis_index")
    parser.add_argument("--output-dir", type=str, default="./output")
    parser.add_argument("--chat", action="store_true", help="交互式分析模式")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    analyzer = DocumentAnalyzer(working_dir=args.working_dir)
    summarizer = SummaryGenerator(analyzer)

    if args.index_dir:
        print(f"正在索引目录: {args.index_dir}")
        result = analyzer.insert_directory(args.index_dir)
        print(f"索引完成: {result['files']} 个文件, {result['chunks']} 个文档块")

    if args.summary:
        print("\n=== 全局摘要 ===")
        print(summarizer.global_summary())

    if args.topics:
        print("\n=== 主题提取 ===")
        topics = analyzer.extract_topics()
        for t in topics:
            print(f"  [{t['topic_id']}] {t['topic_name']} ({t['entity_count']} 实体)")
        print(f"\n共 {len(topics)} 个主题")

    if args.query:
        print(f"\n=== 查询: {args.query} ===")
        print(summarizer.query_summary(args.query, mode=args.mode))

    if args.report:
        print("\n=== 生成分析报告 ===")
        report_path = os.path.join(args.output_dir, "analysis_report.md")
        report_gen = ReportGenerator(analyzer)
        report_gen.generate_full_report(report_path)

    if args.visualize:
        print(f"\n=== 图谱可视化 ({args.visualize}) ===")
        graph = analyzer._load_graph()
        if args.visualize == "static":
            viz = StaticGraphVisualizer()
            path = os.path.join(args.output_dir, "graph_static.png")
            viz.visualize(graph, output_path=path)
        else:
            viz = InteractiveGraphVisualizer()
            path = os.path.join(args.output_dir, "graph_interactive.html")
            viz.visualize(graph, output_path=path)

    if args.chat:
        print("\n" + "=" * 50)
        print("文档分析交互模式 (输入 'exit' 退出)")
        print("命令: /summary, /topics, /stats, /report, /viz")
        print("=" * 50)
        while True:
            cmd = input("\n> ").strip()
            if cmd.lower() == "exit":
                break
            if cmd == "/summary":
                print(summarizer.global_summary())
            elif cmd == "/topics":
                topics = analyzer.extract_topics()
                for t in topics:
                    print(f"  [{t['topic_id']}] {t['topic_name']} ({t['entity_count']} 实体)")
            elif cmd == "/stats":
                stats = analyzer.get_graph_stats()
                print(json.dumps(stats, ensure_ascii=False, indent=2))
            elif cmd == "/report":
                report_gen = ReportGenerator(analyzer)
                report_gen.generate_full_report(os.path.join(args.output_dir, "analysis_report.md"))
            elif cmd == "/viz":
                graph = analyzer._load_graph()
                viz = InteractiveGraphVisualizer()
                viz.visualize(graph, os.path.join(args.output_dir, "graph_interactive.html"))
            elif cmd:
                print(summarizer.query_summary(cmd))


if __name__ == "__main__":
    main()
```

### 9.4.5 完整演示脚本

**run_demo.py** — 端到端演示：

```python
import os
import tempfile
import json
from doc_analyzer import DocumentAnalyzer
from summary_generator import SummaryGenerator
from report_generator import ReportGenerator
from graph_visualizer import StaticGraphVisualizer, InteractiveGraphVisualizer


def create_sample_docs() -> str:
    """创建示例文档集合"""
    docs = {
        "人工智能发展趋势.md": """# 人工智能发展趋势报告 2024

## 大语言模型
2024年，大语言模型（LLM）继续快速发展。GPT-4、Claude 3、Gemini等模型在推理能力、多模态理解和长上下文处理方面取得显著进步。开源模型如Llama 3、Mistral、Qwen等也在追赶闭源模型的性能。

## 多模态AI
多模态AI成为重要趋势。模型不再局限于文本，而是能够同时理解图像、音频、视频等多种数据形式。GPT-4V、Gemini Pro Vision等模型展示了强大的多模态理解能力。

## AI Agent
AI Agent（智能体）是2024年最热门的方向之一。AutoGPT、LangChain Agent、CrewAI等框架使得AI能够自主规划和执行复杂任务。Agent正在从概念验证走向实际应用。

## 边缘AI
AI模型正在向边缘设备迁移。Apple Intelligence、Qualcomm AI Engine等使得手机和PC能够本地运行AI模型，保护用户隐私的同时提供智能服务。
""",
        "数据库技术趋势.md": """# 数据库技术趋势分析

## 向量数据库
随着RAG（检索增强生成）的普及，向量数据库成为AI基础设施的关键组件。Milvus、Pinecone、Weaviate、Qdrant等向量数据库在性能和功能上持续进化。PostgreSQL通过pgvector扩展也加入了向量检索能力。

## NewSQL与分布式数据库
TiDB、CockroachDB、Spanner等分布式数据库在OLTP场景中越来越成熟。它们结合了传统关系数据库的事务一致性和NoSQL的扩展性。

## 图数据库
Neo4j、Amazon Neptune、ArangoDB等图数据库在社交网络分析、推荐系统、知识图谱等场景中发挥重要作用。图数据库与AI的结合（GraphRAG、LightRAG）成为新的研究热点。

## 数据湖与湖仓一体
Delta Lake、Apache Iceberg、Apache Hudi等湖仓一体技术正在统一数据湖和数据仓库的边界。Databricks和Snowflake在这一领域激烈竞争。
""",
        "云计算趋势.md": """# 云计算技术趋势

## 云原生
Kubernetes已成为云原生的事实标准。Service Mesh（Istio）、Serverless（Knative）、GitOps（ArgoCD）等生态工具日趋成熟。云原生正在从"容器化"走向"平台化"。

## 多云与混合云
企业越来越多地采用多云策略以避免供应商锁定。Terraform、Crossplane等基础设施即代码（IaC）工具使得多云管理更加便捷。混合云在金融、医疗等合规要求高的行业尤为流行。

## AI云服务
所有主流云厂商（AWS、Azure、GCP、阿里云）都在大力推广AI云服务。GPU即服务、模型托管服务（SageMaker、Vertex AI）、AI Agent平台成为新的增长点。

## 边缘计算
5G和IoT推动了边缘计算的发展。AWS Outposts、Azure Stack、Google Distributed Cloud等方案使得云服务能够延伸到边缘位置。
""",
        "网络安全趋势.md": """# 网络安全趋势 2024

## AI安全
AI本身的安全问题成为焦点。提示注入（Prompt Injection）、模型越狱、数据投毒等攻击手段不断演进。AI红队测试和AI安全评估成为新的安全实践。

## 零信任架构
零信任安全模型（Zero Trust）从概念走向落地。SASE（安全访问服务边缘）、ZTNA（零信任网络访问）等方案被广泛采用。身份认证和权限管理成为安全基础设施的核心。

## 供应链安全
软件供应链攻击日益频繁。SBOM（软件物料清单）、Sigstore（签名服务）、SLSA（供应链安全框架）等标准和工具被广泛采用。开源软件的安全治理成为企业关注重点。

## 数据隐私
全球数据隐私法规持续加强。GDPR、CCPA、PIPL等法规要求企业加强数据保护。隐私增强技术（PET）如同态加密、联邦学习、差分隐私等受到更多关注。
""",
        "软件工程趋势.md": """# 软件工程趋势 2024

## AI辅助编程
GitHub Copilot、Cursor、Codeium等AI编程助手正在改变开发者的工作方式。AI不仅能够补全代码，还能生成测试、编写文档、重构代码。AI辅助编程使开发效率提升30-50%。

## 平台工程
平台工程（Platform Engineering）成为DevOps的演进方向。内部开发者平台（IDP）通过标准化工具链和自助服务提升开发体验。Backstage、Port、Humanitec等平台工程工具受到关注。

## 低代码/无代码
低代码平台（Retool、OutSystems、Mendix）和无代码平台（Bubble、Airtable）在企业应用中快速增长。它们使得非技术人员也能构建应用，加速了业务数字化。

## 可观测性
OpenTelemetry成为可观测性的行业标准。Metrics、Logs、Traces三 pillar 的融合使得系统监控更加全面。Grafana、Datadog、New Relic等平台持续演进。
""",
    }
    doc_dir = tempfile.mkdtemp(prefix="tech_docs_")
    for name, content in docs.items():
        with open(os.path.join(doc_dir, name), "w", encoding="utf-8") as f:
            f.write(content)
    return doc_dir


def main():
    print("=" * 60)
    print("LightRAG 文档分析与摘要 — 完整演示")
    print("=" * 60)

    # 1. 创建示例文档
    print("\n[1/5] 创建示例文档...")
    doc_dir = create_sample_docs()
    for f in sorted(os.listdir(doc_dir)):
        print(f"  - {f}")

    # 2. 构建索引
    print("\n[2/5] 构建 LightRAG 索引...")
    index_dir = tempfile.mkdtemp(prefix="analysis_index_")
    analyzer = DocumentAnalyzer(working_dir=index_dir)
    result = analyzer.insert_directory(doc_dir)
    print(f"  索引完成: {result['files']} 个文件")

    # 3. 图结构统计
    print("\n[3/5] 图结构分析...")
    stats = analyzer.get_graph_stats()
    print(f"  实体数量: {stats['node_count']}")
    print(f"  关系数量: {stats['edge_count']}")
    print(f"  主题簇数量: {stats['community_count']}")
    print(f"  图密度: {stats['density']:.4f}")

    # 4. 主题提取
    print("\n[4/5] 主题提取...")
    topics = analyzer.extract_topics()
    for t in topics:
        print(f"  [{t['topic_id']}] {t['topic_name']} ({t['entity_count']} 实体)")
    print(f"  共 {len(topics)} 个主题")

    # 5. 摘要生成
    print("\n[5/5] 摘要生成...")
    summarizer = SummaryGenerator(analyzer)

    print("\n  --- 全局摘要 ---")
    print(f"  {summarizer.global_summary()[:500]}...")

    print("\n  --- 要点摘要 ---")
    print(f"  {summarizer.bullet_summary(max_points=5)}")

    print("\n  --- 聚焦摘要: AI ---")
    print(f"  {summarizer.focused_summary('AI')[:300]}...")

    # 生成完整报告
    print("\n  正在生成完整分析报告...")
    output_dir = tempfile.mkdtemp(prefix="analysis_output_")
    report_gen = ReportGenerator(analyzer)
    report_path = report_gen.generate_full_report(os.path.join(output_dir, "report.md"))
    print(f"  报告已保存至: {report_path}")

    # 可视化
    print("\n  正在生成图谱可视化...")
    graph = analyzer._load_graph()
    if graph.number_of_nodes() > 0:
        static_viz = StaticGraphVisualizer()
        static_viz.visualize(graph, output_path=os.path.join(output_dir, "graph.png"))
        interactive_viz = InteractiveGraphVisualizer()
        interactive_viz.visualize(graph, output_path=os.path.join(output_dir, "graph.html"))
        print(f"  静态图谱: {output_dir}/graph.png")
        print(f"  交互式图谱: {output_dir}/graph.html")

    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

### 9.4.6 运行指南

**安装依赖**：

```bash
pip install lightrag fastapi uvicorn pydantic networkx matplotlib pyvis scikit-learn
```

**索引文档并生成摘要**：

```bash
# 索引文档目录
python cli.py --index-dir ./sample_docs --working-dir ./analysis_index

# 生成全局摘要
python cli.py --summary --working-dir ./analysis_index

# 提取主题
python cli.py --topics --working-dir ./analysis_index

# 查询式摘要
python cli.py --query "总结所有关于AI的内容" --mode hybrid --working-dir ./analysis_index

# 生成完整分析报告
python cli.py --report --working-dir ./analysis_index --output-dir ./output

# 图谱可视化
python cli.py --visualize interactive --working-dir ./analysis_index --output-dir ./output

# 交互式分析模式
python cli.py --chat --working-dir ./analysis_index
```

**启动 Web API 服务**：

```bash
python app.py
# 服务运行在 http://localhost:8000

# API 调用示例
curl http://localhost:8000/summary
curl http://localhost:8000/topics
curl http://localhost:8000/analysis
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "总结AI相关趋势", "mode": "hybrid"}'
```

**运行完整演示**：

```bash
python run_demo.py
```

---

## 9.5 潜在风险与注意事项

### 9.5.1 摘要质量风险

| 风险 | 原因 | 缓解措施 |
|------|------|---------|
| 摘要遗漏关键信息 | 检索 top_k 过小，或实体提取不完整 | 增大 top_k，检查实体提取质量 |
| 摘要包含冗余信息 | 多个文档块包含相似内容 | 使用高层检索模式，减少重复 |
| 摘要存在事实错误 | LLM 幻觉或实体提取错误 | 添加事实核查步骤，引用源文本 |
| 摘要偏向某些主题 | 文档分布不均匀 | 检查文档覆盖度，调整检索权重 |
| 摘要过于泛化 | 高层检索过于抽象 | 使用混合模式，结合低层细节 |

### 9.5.2 主题提取风险

| 风险 | 原因 | 缓解措施 |
|------|------|---------|
| 主题粒度过粗 | 社区检测参数过大 | 减小 min_community_size |
| 主题粒度过细 | 社区检测参数过小 | 增大 min_community_size |
| 主题命名不准确 | LLM 对实体理解偏差 | 提供领域词典，优化命名 prompt |
| 遗漏重要主题 | 实体提取遗漏关键实体 | 检查实体提取质量，调整分块策略 |
| 主题重叠严重 | 图结构过于密集 | 使用层次化聚类，合并相似主题 |

### 9.5.3 可视化风险

| 风险 | 原因 | 缓解措施 |
|------|------|---------|
| 图谱过于拥挤 | 实体数量过多 | 限制显示节点数，使用子图 |
| 布局混乱 | 图结构复杂 | 使用社区布局，增加物理引擎迭代 |
| 交互卡顿 | 节点/边过多 | 使用子图或采样，降低复杂度 |
| 中文显示异常 | 字体缺失 | 指定中文字体（如 Microsoft YaHei） |
| 颜色区分度低 | 主题簇过多 | 使用更丰富的色板，添加图例 |

### 9.5.4 架构陷阱

1. **索引质量决定分析上限**：文档分析的质量上限取决于 LightRAG 索引构建的质量。如果实体提取不准确、关系提取遗漏，后续的摘要和主题分析都会受到影响。建议在索引构建后检查实体和关系的质量。

2. **大规模文档的性能问题**：当文档数量超过数千篇时，图结构可能变得非常庞大，导致社区检测和可视化变得缓慢。建议对大规模文档集合进行分批次处理，或使用采样策略。

3. **领域适配的重要性**：通用 LLM 在特定领域的实体提取和主题命名上可能表现不佳。建议针对领域特点优化提取 prompt，或使用领域微调的 LLM。

4. **评估体系的缺失**：文档分析系统的效果评估比问答系统更加困难，因为摘要和主题提取缺乏标准答案。建议建立人工评估流程，定期抽样检查分析质量。

5. **增量更新对分析结果的影响**：增量添加新文档后，图结构会发生变化，可能导致主题簇的重新划分。建议在重要分析任务前重新运行主题提取，确保结果反映最新状态。

---

## 本章小结

1. **多文档摘要生成**是 LightRAG 的核心能力之一，通过图结构索引和双级检索机制，能够生成比传统 RAG 更全面、更连贯的多文档摘要。四种摘要策略（查询式、全局式、分层式、对比式）覆盖了不同的业务需求。

2. **主题提取与聚类**利用 LightRAG 知识图谱的社区结构，可以自动发现文档集合中的主题簇。三种聚类方法（图社区、向量嵌入、混合方法）各有优劣，推荐使用混合方法以获得最佳效果。主题演化分析还能揭示主题随时间的变化趋势。

3. **关系图谱可视化**将抽象的知识图谱转化为直观的图形展示。静态可视化适合快速查看和报告嵌入，交互式可视化（PyVis）支持缩放、拖拽、点击查看详情等操作，适合探索性分析。

4. **完整的代码示例**提供了从文档索引到分析报告生成的全链路实现，包括 Web API 服务和命令行工具，可直接用于实际项目。

5. **文档分析与摘要的质量**取决于索引构建质量、检索参数配置和 LLM 能力。建议在实际应用中建立评估体系，持续优化系统效果。

6. **LightRAG 在文档分析领域的独特价值**在于其图结构天然支持跨文档的信息整合和关系感知，这是传统向量检索 RAG 无法比拟的。结合主题提取和图谱可视化，LightRAG 不仅是一个问答系统，更是一个完整的文档智能分析平台。
