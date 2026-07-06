# 第7章 向量搜索与语义搜索在 GraphRAG 中的应用

## 7.1 引言

GraphRAG（图增强检索增强生成）将知识图谱的结构化推理与大语言模型的生成能力相结合。然而，知识图谱本身存在一个根本性局限：它只能检索显式建模的关系和实体。当用户查询涉及语义相似性而非精确匹配时——例如"找一篇讨论神经网络可解释性的论文"——传统的图查询（Cypher、SPARQL）会完全失效。

向量搜索（Vector Search）和语义搜索（Semantic Search）正是为了填补这一空白而引入 GraphRAG 的核心技术。它们将文本、图像甚至代码表示为高维空间中的向量（嵌入），通过计算向量间的距离来度量语义相似度。本章将深入探讨嵌入模型的选择、向量索引的构建、图搜索与向量搜索的混合策略，以及重排序技术，帮助读者构建一个既能精确推理又能模糊匹配的完整 GraphRAG 系统。

## 7.2 嵌入模型的选择

嵌入模型是将非结构化数据转换为向量的核心组件。选择不当的嵌入模型会直接影响检索质量，进而影响 RAG 系统的最终输出。

### 7.2.1 嵌入模型的基本原理

嵌入模型本质上是一个编码器（Encoder），它将输入文本映射到 d 维实数向量空间。理想情况下，语义相近的文本在向量空间中的距离也相近。常用的距离度量包括：

- **余弦相似度**：$\text{cos}(A,B) = \frac{A \cdot B}{\|A\| \|B\|}$，最常用，对向量长度不敏感
- **欧氏距离**：$\|A - B\|_2$，对向量长度敏感
- **点积**：$A \cdot B$，在某些索引结构中更高效

### 7.2.2 主流嵌入模型对比

| 模型 | 维度 | 最大输入 | 语言 | 适用场景 |
|------|------|----------|------|----------|
| text-embedding-3-small | 1536 | 8191 tokens | 多语言 | 通用，性价比高 |
| text-embedding-3-large | 3072 | 8191 tokens | 多语言 | 高精度需求 |
| BAAI/bge-large-zh-v1.5 | 1024 | 512 tokens | 中文优化 | 中文场景首选 |
| intfloat/multilingual-e5-large | 1024 | 512 tokens | 多语言 | 跨语言检索 |
| sentence-transformers/all-MiniLM-L6-v2 | 384 | 256 tokens | 英文 | 轻量级部署 |
| jina-embeddings-v3 | 1024 | 8192 tokens | 多语言 | 长文档检索 |

**选择建议**：

1. **中文场景优先选择 bge-large-zh-v1.5 或 multilingual-e5-large**。OpenAI 的 embedding 模型虽然支持中文，但在中文语义理解上不如专门针对中文优化的模型。
2. **考虑维度与性能的权衡**。高维度（3072）能编码更丰富的信息，但存储和计算成本也更高。对于百万级以下的文档库，1024 维度通常足够。
3. **注意输入长度限制**。如果文档片段较长（如整段代码或长段落），需要选择支持较长上下文的模型，或在预处理阶段进行分块。

### 7.2.3 嵌入模型的本地部署

对于数据隐私敏感的场景，本地部署嵌入模型是必要选择。以下是一个使用 Sentence-Transformers 加载 BGE 模型的示例：

```python
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("BAAI/bge-large-zh-v1.5")

def embed_texts(texts: list[str], normalize: bool = True) -> np.ndarray:
    embeddings = model.encode(
        texts,
        normalize_embeddings=normalize,
        show_progress_bar=True,
        batch_size=32
    )
    return np.array(embeddings)

texts = [
    "图神经网络在分子性质预测中的应用",
    "知识图谱增强的大语言模型推理方法",
    "基于向量检索的语义搜索技术"
]
embeddings = embed_texts(texts)
print(f"嵌入维度: {embeddings.shape[1]}")
print(f"向量数量: {embeddings.shape[0]}")
```

### 7.2.4 嵌入质量评估

选择嵌入模型时，不应仅依赖基准测试分数，还应针对自己的数据集进行评估。一个实用的评估方法是构建一个小型标注数据集，计算检索命中率（Recall@K）：

```python
def evaluate_embedding_model(model, queries, relevant_docs, corpus, k=10):
    query_embs = model.encode(queries, normalize_embeddings=True)
    corpus_embs = model.encode(corpus, normalize_embeddings=True)

    hits = 0
    for i, q_emb in enumerate(query_embs):
        scores = np.dot(corpus_embs, q_emb)
        top_k_indices = np.argsort(scores)[-k:][::-1]
        if any(idx in relevant_docs[i] for idx in top_k_indices):
            hits += 1

    return hits / len(queries)
```

## 7.3 向量索引的构建

有了嵌入向量之后，下一个核心问题是如何高效地检索与查询向量最相似的向量。暴力搜索（Brute Force）的时间复杂度为 O(n·d)，在百万级数据量下完全不可行。向量索引（Vector Index）通过近似最近邻搜索（Approximate Nearest Neighbor, ANN）将检索时间降低到亚秒级。

### 7.3.1 主流向量索引算法

#### IVF（Inverted File Index）

IVF 将向量空间划分为 K 个聚类（通常使用 K-Means），检索时只搜索与查询最近的几个聚类。其核心参数是 nprobe（搜索的聚类数），控制精度与速度的权衡。

```python
import faiss
import numpy as np

d = 1024
nlist = 100
nprobe = 10

quantizer = faiss.IndexFlatIP(d)
index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)

embeddings = np.random.rand(100000, d).astype(np.float32)
index.train(embeddings)
index.add(embeddings)
index.nprobe = nprobe

query = np.random.rand(1, d).astype(np.float32)
distances, indices = index.search(query, k=10)
print(f"Top-10 索引: {indices[0]}")
```

#### HNSW（Hierarchical Navigable Small World）

HNSW 是目前最流行的 ANN 算法之一，通过构建多层图结构实现高效的近似搜索。它在精度和速度上通常优于 IVF，但内存消耗更大。

```python
import faiss

d = 1024
M = 32
efConstruction = 200
efSearch = 64

index = faiss.IndexHNSWFlat(d, M)
index.hnsw.efConstruction = efConstruction
index.hnsw.efSearch = efSearch

embeddings = np.random.rand(100000, d).astype(np.float32)
index.add(embeddings)

query = np.random.rand(1, d).astype(np.float32)
distances, indices = index.search(query, k=10)
```

#### PQ（Product Quantization）

PQ 将向量分割为多个子空间，分别量化后组合编码，大幅降低内存占用。适合超大规模（千万级以上）场景，但精度损失较大。

```python
import faiss

d = 1024
m = 16  # 子空间数量
nbits = 8  # 每个子空间的编码位数

index = faiss.IndexPQ(d, m, nbits)
embeddings = np.random.rand(100000, d).astype(np.float32)
index.train(embeddings)
index.add(embeddings)

query = np.random.rand(1, d).astype(np.float32)
distances, indices = index.search(query, k=10)
```

### 7.3.2 算法选择指南

| 算法 | 检索速度 | 内存占用 | 建索引时间 | 精度 | 适用规模 |
|------|---------|---------|-----------|------|---------|
| Flat (暴力) | 极慢 | 高 | 无 | 100% | < 1万 |
| IVF | 快 | 中 | 快 | 90-95% | 10万-100万 |
| HNSW | 极快 | 高 | 中 | 95-99% | 1万-1000万 |
| IVF+PQ | 快 | 极低 | 中 | 80-90% | 1000万+ |
| HNSW+PQ | 极快 | 低 | 慢 | 90-95% | 100万-1亿 |

**经验法则**：
- 数据量 < 1万：直接使用 Flat（暴力搜索），无需 ANN
- 数据量 1万-100万：HNSW 是最佳平衡选择
- 数据量 100万-1000万：IVF 或 HNSW 均可，取决于内存预算
- 数据量 > 1000万：必须使用 PQ 或其变体

### 7.3.3 多模态向量索引

在 GraphRAG 中，不同类型的节点（实体、关系、文档块）可能需要不同的嵌入策略。一个实用的做法是为每种类型维护独立的索引：

```python
class GraphRAGVectorIndex:
    def __init__(self, dim: int = 1024):
        self.dim = dim
        self.indices = {}
        self.id_maps = {}

    def add_index(self, index_name: str, index_type: str = "hnsw", M: int = 32):
        if index_type == "hnsw":
            index = faiss.IndexHNSWFlat(self.dim, M)
        elif index_type == "ivf":
            quantizer = faiss.IndexFlatIP(self.dim)
            index = faiss.IndexIVFFlat(quantizer, self.dim, 100, faiss.METRIC_INNER_PRODUCT)
        else:
            raise ValueError(f"Unknown index type: {index_type}")
        self.indices[index_name] = index
        self.id_maps[index_name] = {}

    def add_vectors(self, index_name: str, vectors: np.ndarray, ids: list[str]):
        start = self.indices[index_name].ntotal
        self.indices[index_name].add(vectors)
        for i, id_ in enumerate(ids):
            self.id_maps[index_name][start + i] = id_

    def search(self, index_name: str, query_vector: np.ndarray, k: int = 10):
        distances, indices = self.indices[index_name].search(query_vector, k)
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1:
                continue
            results.append({
                "id": self.id_maps[index_name][idx],
                "score": float(dist),
                "index_name": index_name
            })
        return results

index_manager = GraphRAGVectorIndex(dim=1024)
index_manager.add_index("entity", "hnsw")
index_manager.add_index("chunk", "ivf")
```

## 7.4 混合搜索：图搜索 + 向量搜索

GraphRAG 的核心优势在于能够同时利用图的结构化信息和向量的语义信息。混合搜索（Hybrid Search）将这两种检索范式融合，产生比单一方法更优的结果。

### 7.4.1 为什么需要混合搜索

纯图搜索的局限：

1. **词汇鸿沟**：用户查询"深度学习的最新进展"与图中存储的"神经网络研究"语义相同但词汇不同，图搜索无法匹配
2. **隐式关系**：图中只存储了显式关系，如"A 引用 B"，但无法表达"A 的方法与 B 的方法相似"
3. **冷启动问题**：新实体尚未与图充分连接时，图搜索效果极差

纯向量搜索的局限：

1. **缺乏结构约束**：向量搜索可能返回语义相似但实体类型完全无关的结果
2. **无法利用关系路径**：无法回答"A 通过哪些路径影响 C"这类多跳问题
3. **精度上限**：ANN 是近似搜索，永远存在精度损失

混合搜索将两者结合，取长补短。

### 7.4.2 混合搜索架构

一个典型的 GraphRAG 混合搜索流程如下：

```
用户查询
    │
    ├──→ 嵌入模型 → 向量索引搜索 → 候选集 A
    │
    ├──→ 查询解析 → 图数据库搜索 → 候选集 B
    │
    └──→ 融合与重排序 → 最终结果
```

### 7.4.3 融合策略

#### 加权融合（Weighted Fusion）

最简单的融合方式，对两个来源的得分进行加权求和：

```python
def weighted_fusion(
    vector_results: list[dict],
    graph_results: list[dict],
    alpha: float = 0.5
) -> list[dict]:
    scores = {}
    for r in vector_results:
        scores[r["id"]] = alpha * r["score"]
    for r in graph_results:
        scores[r["id"]] = scores.get(r["id"], 0) + (1 - alpha) * r["score"]
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

`alpha` 控制向量搜索和图搜索的相对权重。实践中，alpha 可以通过网格搜索在验证集上调优。

#### 倒数排名融合（Reciprocal Rank Fusion, RRF）

RRF 不依赖原始得分，而是基于排名位置进行融合，对得分尺度差异不敏感：

```python
def reciprocal_rank_fusion(
    vector_results: list[dict],
    graph_results: list[dict],
    k: int = 60
) -> list[dict]:
    scores = {}
    for rank, r in enumerate(vector_results):
        scores[r["id"]] = 1.0 / (k + rank + 1)
    for rank, r in enumerate(graph_results):
        scores[r["id"]] = scores.get(r["id"], 0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

RRF 的优势在于不需要对两个检索系统的得分进行归一化，且对异常值不敏感。`k` 参数通常设为 60，经验表明这个值在大多数场景下表现良好。

#### 级联搜索（Cascade Search）

先用向量搜索快速召回候选集，再在图数据库中验证和扩展这些候选：

```python
def cascade_search(
    query: str,
    vector_index,
    graph_db,
    top_k_vector: int = 50,
    top_k_final: int = 10
):
    query_emb = embed_texts([query])[0]
    vector_candidates = vector_index.search(query_emb, k=top_k_vector)

    candidate_ids = [c["id"] for c in vector_candidates]
    graph_expanded = graph_db.expand_neighbors(candidate_ids, depth=1)

    expanded_ids = set(candidate_ids) | set(graph_expanded)
    graph_scores = graph_db.score_by_relevance(expanded_ids, query)

    return sorted(graph_scores.items(), key=lambda x: x[1], reverse=True)[:top_k_final]
```

级联搜索适合对精度要求高、且图数据库查询延迟可控的场景。

### 7.4.4 完整混合搜索实现

以下是一个完整的 GraphRAG 混合搜索实现：

```python
from typing import Any
import numpy as np
import faiss

class GraphRAGHybridSearch:
    def __init__(self, embedding_model, graph_db, dim: int = 1024):
        self.embedding_model = embedding_model
        self.graph_db = graph_db
        self.dim = dim
        self.vector_index = faiss.IndexHNSWFlat(dim, 32)
        self.id_to_node = {}

    def add_documents(self, nodes: list[dict]):
        texts = [n["text"] for n in nodes]
        embeddings = self.embedding_model.encode(texts, normalize_embeddings=True)
        embeddings = np.array(embeddings).astype(np.float32)

        start = self.vector_index.ntotal
        self.vector_index.add(embeddings)
        for i, node in enumerate(nodes):
            self.id_to_node[start + i] = node

        for node in nodes:
            self.graph_db.add_node(node)

    def search(
        self,
        query: str,
        k: int = 10,
        alpha: float = 0.5,
        fusion: str = "weighted"
    ) -> list[dict]:
        query_emb = self.embedding_model.encode([query], normalize_embeddings=True)
        query_emb = np.array(query_emb).astype(np.float32)

        vector_distances, vector_indices = self.vector_index.search(query_emb, k * 2)
        vector_results = []
        for dist, idx in zip(vector_distances[0], vector_indices[0]):
            if idx == -1:
                continue
            node = self.id_to_node[idx]
            vector_results.append({
                "id": node["id"],
                "score": float(dist),
                "text": node["text"],
                "source": "vector"
            })

        graph_results = self.graph_db.search(query, k=k * 2)

        if fusion == "weighted":
            return self._weighted_fusion(vector_results, graph_results, alpha, k)
        elif fusion == "rrf":
            return self._rrf_fusion(vector_results, graph_results, k)
        else:
            raise ValueError(f"Unknown fusion: {fusion}")

    def _weighted_fusion(self, vector_results, graph_results, alpha, k):
        score_map = {}
        for r in vector_results:
            score_map[r["id"]] = {
                "score": alpha * r["score"],
                "text": r["text"],
                "sources": ["vector"]
            }
        for r in graph_results:
            if r["id"] in score_map:
                score_map[r["id"]]["score"] += (1 - alpha) * r["score"]
                score_map[r["id"]]["sources"].append("graph")
            else:
                score_map[r["id"]] = {
                    "score": (1 - alpha) * r["score"],
                    "text": r["text"],
                    "sources": ["graph"]
                }
        sorted_results = sorted(score_map.items(), key=lambda x: x[1]["score"], reverse=True)
        return [v for _, v in sorted_results[:k]]

    def _rrf_fusion(self, vector_results, graph_results, k, k_rrf=60):
        score_map = {}
        for rank, r in enumerate(vector_results):
            score_map[r["id"]] = {
                "score": 1.0 / (k_rrf + rank + 1),
                "text": r["text"],
                "sources": ["vector"]
            }
        for rank, r in enumerate(graph_results):
            if r["id"] in score_map:
                score_map[r["id"]]["score"] += 1.0 / (k_rrf + rank + 1)
                score_map[r["id"]]["sources"].append("graph")
            else:
                score_map[r["id"]] = {
                    "score": 1.0 / (k_rrf + rank + 1),
                    "text": r["text"],
                    "sources": ["graph"]
                }
        sorted_results = sorted(score_map.items(), key=lambda x: x[1]["score"], reverse=True)
        return [v for _, v in sorted_results[:k]]
```

## 7.5 重排序策略

混合搜索的初步结果通常包含噪声——一些语义相似但实际不相关的结果可能排名靠前。重排序（Re-ranking）是 GraphRAG 流水线中提升最终质量的关键环节。

### 7.5.1 为什么需要重排序

向量搜索和混合搜索的初步排序基于浅层语义匹配（如向量余弦相似度），无法捕捉细粒度的相关性。重排序使用更精确（但更慢）的模型对候选集重新打分，在可接受的延迟内大幅提升精度。

典型的"检索-重排序"流水线：

1. **第一阶段（检索）**：使用高效的 ANN 搜索从百万级文档中召回 Top-100
2. **第二阶段（重排序）**：使用交叉编码器对 Top-100 进行精确排序，输出 Top-10

### 7.5.2 交叉编码器重排序

交叉编码器（Cross-Encoder）将查询和文档拼接后输入 Transformer，输出相关性分数。它比双编码器（Bi-Encoder，即嵌入模型）更精确，但速度慢几个数量级。

```python
from sentence_transformers import CrossEncoder

cross_encoder = CrossEncoder("BAAI/bge-reranker-v2-m3")

def rerank(query: str, candidates: list[dict], top_k: int = 10) -> list[dict]:
    pairs = [[query, c["text"]] for c in candidates]
    scores = cross_encoder.predict(pairs)

    for i, c in enumerate(candidates):
        c["rerank_score"] = float(scores[i])

    candidates.sort(key=lambda x: x["rerank_score"], reverse=True)
    return candidates[:top_k]

query = "图神经网络的可解释性"
candidates = hybrid_search.search(query, k=20)
reranked = rerank(query, candidates, top_k=5)
for r in reranked:
    print(f"得分: {r['rerank_score']:.4f} | {r['text'][:50]}")
```

### 7.5.3 主流重排序模型

| 模型 | 参数量 | 语言 | 特点 |
|------|--------|------|------|
| BAAI/bge-reranker-v2-m3 | 568M | 多语言 | 中文场景首选 |
| BAAI/bge-reranker-large | 1.3B | 多语言 | 更高精度，更慢 |
| cross-encoder/ms-marco-MiniLM-L-6-v2 | 80M | 英文 | 轻量级 |
| Cohere Rerank API | - | 多语言 | 托管服务 |
| jina-reranker-v2 | 1.5B | 多语言 | 长上下文支持 |

### 7.5.4 基于图的重排序

GraphRAG 特有的重排序策略是利用图结构信息对候选结果进行重新排序。核心思想是：如果一个候选实体与查询相关的其他实体在图中有紧密连接，则其相关性更高。

```python
def graph_aware_rerank(
    query: str,
    candidates: list[dict],
    graph_db,
    alpha: float = 0.3
) -> list[dict]:
    query_entities = graph_db.extract_entities(query)

    for c in candidates:
        vector_score = c.get("score", 0)
        graph_score = 0

        c_entity_ids = graph_db.get_entity_ids(c["id"])
        for q_entity in query_entities:
            shortest_path = graph_db.shortest_path(q_entity, c_entity_ids)
            if shortest_path is not None:
                graph_score += 1.0 / (1 + len(shortest_path))

        c["graph_rerank_score"] = (1 - alpha) * vector_score + alpha * graph_score

    candidates.sort(key=lambda x: x["graph_rerank_score"], reverse=True)
    return candidates
```

### 7.5.5 多阶段重排序流水线

在实际生产系统中，通常采用多阶段重排序来平衡精度和延迟：

```python
class MultiStageReranker:
    def __init__(self):
        self.cross_encoder = CrossEncoder("BAAI/bge-reranker-v2-m3")
        self.llm_ranker = None

    def rerank(self, query: str, candidates: list[dict], top_k: int = 10) -> list[dict]:
        stage1 = self._stage1_filter(query, candidates, top_k=top_k * 3)
        stage2 = self._stage2_cross_encoder(query, stage1, top_k=top_k * 2)
        stage3 = self._stage3_graph_boost(query, stage2, top_k=top_k)
        return stage3

    def _stage1_filter(self, query, candidates, top_k):
        candidates.sort(key=lambda x: x.get("score", 0), reverse=True)
        return candidates[:top_k]

    def _stage2_cross_encoder(self, query, candidates, top_k):
        pairs = [[query, c["text"]] for c in candidates]
        scores = self.cross_encoder.predict(pairs)
        for i, c in enumerate(candidates):
            c["ce_score"] = float(scores[i])
        candidates.sort(key=lambda x: x["ce_score"], reverse=True)
        return candidates[:top_k]

    def _stage3_graph_boost(self, query, candidates, top_k):
        for c in candidates:
            c["final_score"] = 0.7 * c["ce_score"] + 0.3 * c.get("graph_score", 0)
        candidates.sort(key=lambda x: x["final_score"], reverse=True)
        return candidates[:top_k]
```

## 7.6 实践：构建完整的 GraphRAG 向量搜索系统

本节将综合前述技术，构建一个端到端的 GraphRAG 系统，包含知识图谱构建、向量索引、混合搜索和重排序。

### 7.6.1 系统架构

```
文档输入
    │
    ├──→ 文档分块 (Chunking)
    │
    ├──→ 实体抽取 → 知识图谱 (Neo4j)
    │
    ├──→ 嵌入生成 → 向量索引 (FAISS)
    │
    └──→ 元数据存储 → 关系数据库
```

### 7.6.2 完整实现

```python
import json
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer, CrossEncoder
from typing import Optional

class GraphRAGVectorSystem:
    def __init__(
        self,
        embed_model_name: str = "BAAI/bge-large-zh-v1.5",
        rerank_model_name: str = "BAAI/bge-reranker-v2-m3",
        dim: int = 1024
    ):
        self.embedder = SentenceTransformer(embed_model_name)
        self.reranker = CrossEncoder(rerank_model_name)
        self.dim = dim

        self.vector_index = faiss.IndexHNSWFlat(dim, 32)
        self.documents = {}
        self.entity_graph = {}
        self.id_counter = 0

    def add_document(self, text: str, metadata: dict = None):
        doc_id = f"doc_{self.id_counter}"
        self.id_counter += 1

        embedding = self.embedder.encode([text], normalize_embeddings=True)
        embedding = np.array(embedding).astype(np.float32)
        self.vector_index.add(embedding)

        self.documents[doc_id] = {
            "text": text,
            "metadata": metadata or {},
            "embedding": embedding[0]
        }

        entities = self._extract_entities(text)
        for entity in entities:
            if entity not in self.entity_graph:
                self.entity_graph[entity] = set()
            self.entity_graph[entity].add(doc_id)

        return doc_id

    def _extract_entities(self, text: str) -> list[str]:
        import jieba
        import jieba.posseg as pseg
        entities = []
        for word, flag in pseg.cut(text):
            if flag in ("nr", "ns", "nt", "nz"):
                entities.append(word)
        return entities

    def search(
        self,
        query: str,
        k: int = 10,
        alpha: float = 0.5,
        use_rerank: bool = True
    ) -> list[dict]:
        query_emb = self.embedder.encode([query], normalize_embeddings=True)
        query_emb = np.array(query_emb).astype(np.float32)

        distances, indices = self.vector_index.search(query_emb, k * 2)
        vector_results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1:
                continue
            doc_id = f"doc_{idx}"
            if doc_id in self.documents:
                vector_results.append({
                    "id": doc_id,
                    "score": float(dist),
                    "text": self.documents[doc_id]["text"],
                    "metadata": self.documents[doc_id]["metadata"],
                    "source": "vector"
                })

        query_entities = self._extract_entities(query)
        graph_results = []
        for entity in query_entities:
            if entity in self.entity_graph:
                for doc_id in self.entity_graph[entity]:
                    if doc_id in self.documents:
                        graph_results.append({
                            "id": doc_id,
                            "score": 1.0,
                            "text": self.documents[doc_id]["text"],
                            "metadata": self.documents[doc_id]["metadata"],
                            "source": "graph",
                            "matched_entity": entity
                        })

        fused = self._rrf_fusion(vector_results, graph_results, k * 2)

        if use_rerank and len(fused) > 1:
            fused = self._rerank(query, fused, k)

        return fused[:k]

    def _rrf_fusion(self, vector_results, graph_results, k, k_rrf=60):
        score_map = {}
        for rank, r in enumerate(vector_results):
            score_map[r["id"]] = {
                "score": 1.0 / (k_rrf + rank + 1),
                "text": r["text"],
                "metadata": r["metadata"],
                "sources": ["vector"]
            }
        for rank, r in enumerate(graph_results):
            if r["id"] in score_map:
                score_map[r["id"]]["score"] += 1.0 / (k_rrf + rank + 1)
                score_map[r["id"]]["sources"].append("graph")
            else:
                score_map[r["id"]] = {
                    "score": 1.0 / (k_rrf + rank + 1),
                    "text": r["text"],
                    "metadata": r["metadata"],
                    "sources": ["graph"]
                }
        sorted_results = sorted(score_map.items(), key=lambda x: x[1]["score"], reverse=True)
        return [v for _, v in sorted_results]

    def _rerank(self, query, candidates, top_k):
        pairs = [[query, c["text"]] for c in candidates]
        scores = self.reranker.predict(pairs)
        for i, c in enumerate(candidates):
            c["rerank_score"] = float(scores[i])
        candidates.sort(key=lambda x: x["rerank_score"], reverse=True)
        return candidates[:top_k]

    def save(self, path: str):
        faiss.write_index(self.vector_index, f"{path}/vector_index.faiss")
        with open(f"{path}/documents.json", "w", encoding="utf-8") as f:
            json.dump({
                "documents": {k: {kk: vv for kk, vv in v.items() if kk != "embedding"}
                              for k, v in self.documents.items()},
                "entity_graph": {k: list(v) for k, v in self.entity_graph.items()},
                "id_counter": self.id_counter
            }, f, ensure_ascii=False, indent=2)

    def load(self, path: str):
        self.vector_index = faiss.read_index(f"{path}/vector_index.faiss")
        with open(f"{path}/documents.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            self.documents = data["documents"]
            self.entity_graph = {k: set(v) for k, v in data["entity_graph"].items()}
            self.id_counter = data["id_counter"]


system = GraphRAGVectorSystem()

docs = [
    "图神经网络（GNN）在分子性质预测中取得了显著成果，特别是消息传递神经网络（MPNN）框架。",
    "知识图谱增强的检索增强生成（GraphRAG）通过结合图结构和语义搜索提升了问答质量。",
    "向量数据库是构建大规模语义搜索系统的核心基础设施，支持近似最近邻搜索。",
    "Transformer架构中的自注意力机制使得模型能够捕捉长距离依赖关系。",
    "重排序策略在信息检索系统中扮演着关键角色，交叉编码器通常比双编码器更精确。"
]
for doc in docs:
    system.add_document(doc)

results = system.search("图神经网络在分子预测中的应用", k=3, use_rerank=True)
for r in results:
    print(f"[{r['score']:.4f}] {r['text'][:60]}")
```

### 7.6.3 性能优化建议

1. **批处理嵌入**：在添加大量文档时，使用批处理而非逐条处理，可充分利用 GPU 并行能力
2. **异步索引构建**：对于持续更新的系统，使用异步队列处理文档添加，避免阻塞查询
3. **缓存热门查询**：对高频查询缓存结果，设置合理的 TTL
4. **分片索引**：当单索引超过千万级别时，使用分片策略将索引分布到多台机器
5. **量化压缩**：对内存敏感的场景，使用标量量化（SQ）或乘积量化（PQ）压缩向量

## 7.7 评估指标

构建向量搜索系统后，需要系统性地评估其效果。以下是 GraphRAG 向量搜索的核心评估指标：

### 7.7.1 检索质量指标

| 指标 | 定义 | 说明 |
|------|------|------|
| Recall@K | 前 K 个结果中包含相关文档的比例 | 衡量召回能力 |
| MRR (Mean Reciprocal Rank) | 第一个相关结果的倒数排名的均值 | 衡量首位命中能力 |
| NDCG@K (Normalized Discounted Cumulative Gain) | 考虑排序位置的加权累计收益 | 衡量排序质量 |
| MAP (Mean Average Precision) | 每个查询的平均精度的均值 | 综合衡量 |

### 7.7.2 评估实现

```python
def evaluate_retrieval(system, test_queries, relevant_docs, k=10):
    recall_total = 0
    mrr_total = 0

    for query, relevant in zip(test_queries, relevant_docs):
        results = system.search(query, k=k, use_rerank=False)
        retrieved_ids = [r["id"] for r in results]

        relevant_set = set(relevant)
        retrieved_set = set(retrieved_ids)

        recall = len(relevant_set & retrieved_set) / len(relevant_set)
        recall_total += recall

        for rank, doc_id in enumerate(retrieved_ids):
            if doc_id in relevant_set:
                mrr_total += 1.0 / (rank + 1)
                break

    n = len(test_queries)
    return {
        f"Recall@{k}": recall_total / n,
        f"MRR@{k}": mrr_total / n
    }
```

### 7.7.3 消融实验

为了验证混合搜索和重排序各自的效果，应进行消融实验：

```python
def ablation_study(system, test_queries, relevant_docs, k=10):
    results = {}

    configs = [
        ("vector_only", {"use_rerank": False, "alpha": 1.0}),
        ("graph_only", {"use_rerank": False, "alpha": 0.0}),
        ("hybrid_rrf", {"use_rerank": False, "fusion": "rrf"}),
        ("hybrid_weighted", {"use_rerank": False, "fusion": "weighted"}),
        ("hybrid+rerank", {"use_rerank": True, "fusion": "rrf"}),
    ]

    for name, config in configs:
        metrics = evaluate_retrieval(system, test_queries, relevant_docs, k)
        results[name] = metrics

    return results
```

## 7.8 生产环境注意事项

### 7.8.1 向量数据库选型

| 产品 | 开源 | 分布式 | 混合搜索 | 适用场景 |
|------|------|--------|---------|---------|
| FAISS | 是 | 否 | 需自建 | 单机原型、小规模 |
| Milvus | 是 | 是 | 是 | 生产级大规模 |
| Qdrant | 是 | 是 | 是 | Rust 实现，高性能 |
| Weaviate | 是 | 是 | 是 | 原生 GraphRAG 支持 |
| Pinecone | 否 | 是 | 是 | 托管服务，免运维 |
| pgvector | 是 | 是 | 是 | PostgreSQL 扩展 |

### 7.8.2 延迟预算

一个典型的 GraphRAG 查询延迟分配：

```
嵌入生成:    50-200ms  (取决于模型大小和硬件)
向量搜索:    10-50ms   (取决于索引类型和数据量)
图搜索:      20-100ms  (取决于查询复杂度)
重排序:      100-500ms (取决于候选数量和模型)
LLM 生成:    1-5s      (取决于模型和输出长度)
```

总延迟通常在 2-6 秒之间。如果超过用户可接受范围，可以考虑：
- 减少重排序的候选数量
- 使用更轻量的嵌入模型
- 将重排序和 LLM 生成并行化

### 7.8.3 增量更新

知识图谱和向量索引都需要支持增量更新。FAISS 的 HNSW 索引支持 `add()` 操作，但不支持删除。如果需要删除功能，可以考虑使用支持删除的向量数据库（如 Milvus），或维护一个删除掩码表：

```python
class DeletableVectorIndex:
    def __init__(self, dim, M=32):
        self.index = faiss.IndexHNSWFlat(dim, M)
        self.deleted = set()

    def add(self, vectors):
        self.index.add(vectors)

    def delete(self, id_):
        self.deleted.add(id_)

    def search(self, query, k):
        distances, indices = self.index.search(query, k + len(self.deleted))
        valid = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx not in self.deleted and idx != -1:
                valid.append((dist, idx))
                if len(valid) == k:
                    break
        return np.array([v[0] for v in valid]), np.array([v[1] for v in valid])
```

## 7.9 本章小结

向量搜索和语义搜索是 GraphRAG 系统不可或缺的组成部分。本章从嵌入模型的选择出发，详细讨论了向量索引的构建方法、图搜索与向量搜索的混合策略，以及重排序技术。核心要点如下：

1. **嵌入模型选择**：中文场景优先选择 bge-large-zh-v1.5 或 multilingual-e5-large，根据数据规模和精度需求权衡维度大小
2. **向量索引**：HNSW 在大多数场景下是最佳平衡选择，千万级以上数据需使用 PQ 压缩
3. **混合搜索**：RRF 融合策略简单有效，对得分尺度不敏感；级联搜索适合高精度场景
4. **重排序**：交叉编码器重排序是提升精度的关键步骤，图感知重排序是 GraphRAG 特有的优势
5. **评估**：消融实验是验证各组件贡献的必要手段，Recall@K 和 MRR 是最常用的指标

向量搜索赋予了 GraphRAG 语义理解的能力，而图结构则提供了精确推理的骨架。两者的有机结合，使得 GraphRAG 既能回答"什么是 X"这样的语义问题，也能回答"X 如何影响 Y"这样的结构化推理问题，这是纯向量搜索或纯图搜索都无法独立完成的任务。

在下一章中，我们将探讨 GraphRAG 中的查询理解与查询分解技术，进一步扩展系统的推理能力。
