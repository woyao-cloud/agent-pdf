# 第7章 向量检索与语义搜索

> **核心问题**：如何将文本语义转化为可计算的向量空间，并在此基础上实现高效、精准的检索？

向量检索是 LightRAG 的基石之一。图结构捕捉了实体间的显式关系，而向量嵌入则编码了文本的隐式语义——两者互补，共同构成了 LightRAG 双级检索的底层能力。本章将从嵌入模型选型出发，逐步深入到向量索引构建、图+向量混合搜索以及重排序策略，完整覆盖 LightRAG 向量检索的全链路。

## 7.1 嵌入模型选择

### 7.1.1 嵌入模型在 LightRAG 中的角色

在 LightRAG 中，嵌入模型承担三个关键角色：

1. **实体与关系的语义编码**：将提取出的实体名称、描述和关系三元组转化为向量，用于后续的语义匹配
2. **查询向量化**：将用户查询转化为同一语义空间中的向量，以便与索引向量进行相似度计算
3. **混合搜索的桥接**：向量相似度与图结构相关性共同决定最终检索结果

嵌入模型的质量直接决定了"语义鸿沟"的宽度——一个优秀的嵌入模型能让"苹果公司的创始人"和"Steve Jobs"在向量空间中彼此靠近，而一个差的模型可能将它们映射到完全不同的区域。

### 7.1.2 主流嵌入模型对比

截至 2025 年，以下是 LightRAG 中最常用的嵌入模型：

| 模型 | 维度 | 最大输入 | 语言支持 | 相对性能 | 适用场景 |
|------|------|---------|---------|---------|---------|
| `text-embedding-3-small` | 512/1536 | 8191 tokens | 多语言 | ★★★★★ | 通用场景，性价比最高 |
| `text-embedding-3-large` | 256/1024/3072 | 8191 tokens | 多语言 | ★★★★★★ | 高精度场景，成本较高 |
| `BAAI/bge-large-zh-v1.5` | 1024 | 512 tokens | 中文优先 | ★★★★☆ | 中文场景，开源可自部署 |
| `BAAI/bge-m3` | 1024 | 8192 tokens | 多语言 | ★★★★★ | 多语言+长文本，开源 |
| `intfloat/multilingual-e5-large` | 1024 | 512 tokens | 多语言 | ★★★★★ | 多语言检索，需前缀 |
| `sentence-transformers/all-MiniLM-L6-v2` | 384 | 256 tokens | 英文 | ★★★☆☆ | 轻量级本地部署 |
| `shibing624/text2vec-base-chinese` | 768 | 512 tokens | 中文 | ★★★★☆ | 中文语义相似度 |

**选型原则**：

- **精度优先**：选择 `text-embedding-3-large` 或 `BAAI/bge-m3`，维度设为 1024 以上
- **成本优先**：选择 `text-embedding-3-small`（维度 512）或 `sentence-transformers/all-MiniLM-L6-v2`
- **中文场景**：优先 `BAAI/bge-large-zh-v1.5` 或 `BAAI/bge-m3`
- **本地部署**：选择开源 Sentence-Transformers 系列模型

### 7.1.3 LightRAG 中的嵌入配置

LightRAG 通过 `LightRAG` 构造函数的 `embedding_func` 参数接入嵌入模型。以下是几种典型配置：

**使用 OpenAI 嵌入（默认）**：

```python
import os
from lightrag import LightRAG
from lightrag.llm import openai_complete
from lightrag.embed import openai_embed

os.environ["OPENAI_API_KEY"] = "sk-your-key"

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=openai_complete,
    llm_model_name="gpt-4o-mini",
    embedding_func=openai_embed,
    embedding_model="text-embedding-3-small",
    embedding_dim=512,          # 显式指定维度
)
```

**使用 BGE 中文模型（本地）**：

```python
from lightrag import LightRAG
from lightrag.llm import openai_complete
from lightrag.embed import sentence_transformer_embed

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=openai_complete,
    llm_model_name="gpt-4o-mini",
    embedding_func=sentence_transformer_embed,
    embedding_model="BAAI/bge-large-zh-v1.5",
    embedding_dim=1024,
    max_token_size=512,          # BGE 模型最大输入长度
)
```

**使用多语言 E5 模型**：

```python
from lightrag.embed import sentence_transformer_embed

# E5 模型需要查询前缀
def e5_embed_func(texts: list[str]) -> list[list[float]]:
    prefixed = [f"query: {t}" for t in texts]
    return sentence_transformer_embed(
        prefixed,
        model_name="intfloat/multilingual-e5-large",
    )

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=openai_complete,
    llm_model_name="gpt-4o-mini",
    embedding_func=e5_embed_func,
    embedding_dim=1024,
)
```

### 7.1.4 嵌入维度选择策略

嵌入维度是精度与效率的核心权衡点：

- **高维度（1536-3072）**：语义区分度更高，适合细粒度检索，但存储和计算成本线性增长
- **中维度（512-1024）**：大多数场景的最佳平衡点
- **低维度（256-384）**：适合大规模索引和低延迟场景

OpenAI 的 `text-embedding-3` 系列支持通过 `dimensions` 参数动态降维，无需重新训练：

```python
# 使用 Matryoshka 表示学习，同一模型可输出不同维度
import openai

client = openai.OpenAI()
response = client.embeddings.create(
    model="text-embedding-3-large",
    input="LightRAG 向量检索原理",
    dimensions=512,  # 从 3072 降维到 512，保留大部分语义信息
)
```

**经验法则**：对于 LightRAG 的实体检索场景，1024 维度通常是最优起点。如果索引规模超过 100 万实体，可考虑降至 512 维度。

## 7.2 向量索引构建

### 7.2.1 LightRAG 的向量存储架构

LightRAG 内部使用双层存储架构：

```
LightRAG Storage
├── Graph Store (NetworkX)
│   ├── 实体节点（含嵌入向量）
│   └── 关系边（含嵌入向量）
└── Vector Store (可选)
    ├── 实体向量索引
    ├── 关系向量索引
    └── 文本块向量索引
```

默认情况下，LightRAG 将向量直接存储在 NetworkX 图的节点和边属性中。对于小规模数据（<10 万实体），这种方式足够高效。当数据规模增长时，需要引入独立的向量数据库。

### 7.2.2 向量索引构建流程

LightRAG 的向量索引构建发生在图索引构建过程中，具体流程如下：

```
文本输入 → 分块 → 实体/关系提取 → 生成嵌入 → 存储到图节点
                                                      ↓
                                              可选：同步到外部向量数据库
```

核心代码路径在 `lightrag/index.py` 中：

```python
# LightRAG 内部向量索引构建的简化示意
async def _build_index(self, docs: list[str]):
    for doc in docs:
        # 1. 实体与关系提取（LLM 驱动）
        entities, relations = await self._extract_entities_and_relations(doc)

        # 2. 为每个实体生成嵌入
        for entity in entities:
            entity_text = f"{entity['name']}: {entity['description']}"
            entity["embedding"] = await self.embedding_func.embed([entity_text])

        # 3. 为每个关系生成嵌入
        for relation in relations:
            rel_text = f"{relation['source']} → {relation['target']}: {relation['description']}"
            relation["embedding"] = await self.embedding_func.embed([rel_text])

        # 4. 存储到图结构
        self._graph.add_entities(entities)
        self._graph.add_relations(relations)
```

### 7.2.3 使用独立向量数据库

对于生产环境，建议将向量存储到专用向量数据库中。LightRAG 支持通过 `kv_storage` 接口接入多种后端：

**使用 ChromaDB**：

```python
from lightrag import LightRAG
from lightrag.llm import openai_complete
from lightrag.embed import openai_embed
from lightrag.storage import ChromaStorage

vector_storage = ChromaStorage(
    collection_name="lightrag_entities",
    persist_directory="./chroma_db",
)

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=openai_complete,
    llm_model_name="gpt-4o-mini",
    embedding_func=openai_embed,
    embedding_model="text-embedding-3-small",
    embedding_dim=512,
    vector_storage=vector_storage,  # 注入外部向量存储
)
```

**使用 FAISS（本地高性能）**：

```python
import faiss
import numpy as np
from lightrag import LightRAG

# 手动构建 FAISS 索引
dimension = 1024
index = faiss.IndexFlatIP(dimension)  # 内积相似度（等价于余弦相似度）

# 对于大规模索引，使用 IVF 加速
nlist = 100  # 聚类中心数
quantizer = faiss.IndexFlatIP(dimension)
index = faiss.IndexIVFFlat(quantizer, dimension, nlist, faiss.METRIC_INNER_PRODUCT)
index.train(vectors)  # 需要预训练
index.add(vectors)    # 添加向量
```

### 7.2.4 向量索引类型选择

| 索引类型 | 搜索精度 | 搜索速度 | 内存占用 | 适用规模 |
|---------|---------|---------|---------|---------|
| Flat (暴力搜索) | 最高 | O(n) 慢 | 高 | < 10 万 |
| IVF (倒排文件) | 高 | O(log n) 快 | 中 | 10 万 - 1000 万 |
| HNSW (分层导航) | 高 | O(log n) 极快 | 高 | 100 万 - 1 亿 |
| PQ (乘积量化) | 中 | O(log n) 快 | 极低 | 1000 万以上 |

**LightRAG 推荐**：对于大多数应用场景（10 万级实体），使用 Flat 索引即可。超过 100 万实体时，切换到 HNSW 或 IVF。

### 7.2.5 批量嵌入与缓存

嵌入生成是索引构建中最耗时的环节之一。LightRAG 内置了嵌入缓存机制：

```python
# 嵌入缓存的简化实现
class EmbeddingCache:
    def __init__(self, cache_file: str):
        self.cache: dict[str, list[float]] = {}
        self.cache_file = cache_file
        self._load_cache()

    def get(self, text: str) -> list[float] | None:
        key = hashlib.md5(text.encode()).hexdigest()
        return self.cache.get(key)

    def set(self, text: str, embedding: list[float]):
        key = hashlib.md5(text.encode()).hexdigest()
        self.cache[key] = embedding

    def _load_cache(self):
        if os.path.exists(self.cache_file):
            with open(self.cache_file, "r") as f:
                self.cache = json.load(f)

    def save(self):
        with open(self.cache_file, "w") as f:
            json.dump(self.cache, f)
```

批量嵌入可以显著提升吞吐量：

```python
async def batch_embed_texts(
    texts: list[str],
    batch_size: int = 32,
    embedding_func=None,
) -> list[list[float]]:
    """批量生成嵌入，自动处理批次和缓存"""
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        embeddings = await embedding_func.embed(batch)
        all_embeddings.extend(embeddings)
    return all_embeddings
```

## 7.3 混合搜索（图 + 向量）

### 7.3.1 为什么需要混合搜索

纯向量搜索存在一个根本缺陷：**向量相似度不等于语义相关性**。两个文本可能在向量空间中距离很近，但实际含义完全不同。例如：

- "苹果很好吃" vs "苹果公司发布了新手机"——向量距离可能很近，但语义完全不同
- "Python 是一种编程语言" vs "Python 是一种蛇"——同样存在歧义

图结构恰好弥补了这一缺陷。实体间的显式关系（如"苹果公司 → 发布 → iPhone"）提供了向量无法捕捉的结构化语义。混合搜索的核心思想是：**让图结构和向量相似度互相约束，共同决定检索结果**。

### 7.3.2 LightRAG 的混合搜索机制

LightRAG 的混合搜索在 `lightrag/retrieval.py` 中实现，核心流程如下：

```
用户查询
    │
    ├──→ 向量搜索：查询嵌入 → 向量相似度 Top-K
    │        返回：[(实体, 分数), ...]
    │
    ├──→ 图搜索：查询实体 → 图遍历 → 邻居节点
    │        返回：[(实体, 关系路径, 分数), ...]
    │
    └──→ 结果融合：加权合并 → 重排序 → 最终结果
```

**向量搜索路径**：

```python
async def vector_search(
    self,
    query: str,
    top_k: int = 10,
) -> list[tuple[str, float]]:
    """基于向量相似度的语义搜索"""
    query_embedding = await self.embedding_func.embed([query])
    query_vec = query_embedding[0]

    candidates = []
    for node_id, node_data in self._graph.nodes(data=True):
        if "embedding" not in node_data:
            continue
        sim = cosine_similarity(query_vec, node_data["embedding"])
        candidates.append((node_id, sim))

    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[:top_k]
```

**图搜索路径**：

```python
async def graph_search(
    self,
    query: str,
    top_k: int = 10,
    max_depth: int = 2,
) -> list[tuple[str, float]]:
    """基于图结构的关联搜索"""
    # 1. 先用向量找到入口节点
    entry_nodes = await self.vector_search(query, top_k=5)

    # 2. 从入口节点进行图遍历
    visited = set()
    candidates = []

    for node_id, _ in entry_nodes:
        # BFS 遍历邻居
        queue = [(node_id, 0)]  # (节点, 深度)
        while queue:
            current, depth = queue.pop(0)
            if current in visited or depth > max_depth:
                continue
            visited.add(current)

            # 计算图相关分数（基于关系强度）
            graph_score = self._compute_graph_score(current, query)
            candidates.append((current, graph_score))

            # 扩展邻居
            for neighbor in self._graph.neighbors(current):
                if neighbor not in visited:
                    queue.append((neighbor, depth + 1))

    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[:top_k]
```

### 7.3.3 分数融合策略

混合搜索的核心在于如何融合向量分数和图分数。LightRAG 支持多种融合策略：

**加权线性融合**：

```python
def fuse_scores_linear(
    vector_results: list[tuple[str, float]],
    graph_results: list[tuple[str, float]],
    alpha: float = 0.5,  # 向量权重
    beta: float = 0.5,   # 图权重
) -> list[tuple[str, float]]:
    """加权线性融合"""
    score_map: dict[str, float] = {}

    # 归一化向量分数
    vec_scores = {k: v for k, v in vector_results}
    if vec_scores:
        max_v = max(vec_scores.values())
        vec_scores = {k: v / max_v for k, v in vec_scores.items()}

    # 归一化图分数
    graph_scores = {k: v for k, v in graph_results}
    if graph_scores:
        max_g = max(graph_scores.values())
        graph_scores = {k: v / max_g for k, v in graph_scores.items()}

    # 融合
    all_keys = set(vec_scores.keys()) | set(graph_scores.keys())
    for key in all_keys:
        v_score = vec_scores.get(key, 0.0)
        g_score = graph_scores.get(key, 0.0)
        score_map[key] = alpha * v_score + beta * g_score

    return sorted(score_map.items(), key=lambda x: x[1], reverse=True)
```

**倒数排名融合（RRF）**：

```python
def fuse_scores_rrf(
    vector_results: list[tuple[str, float]],
    graph_results: list[tuple[str, float]],
    k: int = 60,  # RRF 常数
) -> list[tuple[str, float]]:
    """倒数排名融合（Reciprocal Rank Fusion）"""
    score_map: dict[str, float] = {}

    # 为每个结果集分配排名
    for rank, (key, _) in enumerate(vector_results):
        score_map[key] = score_map.get(key, 0.0) + 1.0 / (k + rank + 1)

    for rank, (key, _) in enumerate(graph_results):
        score_map[key] = score_map.get(key, 0.0) + 1.0 / (k + rank + 1)

    return sorted(score_map.items(), key=lambda x: x[1], reverse=True)
```

**自适应融合**：

```python
def fuse_scores_adaptive(
    vector_results: list[tuple[str, float]],
    graph_results: list[tuple[str, float]],
    query_type: str = "hybrid",
) -> list[tuple[str, float]]:
    """根据查询类型自适应调整融合权重"""
    # 具体事实查询 → 偏向图搜索
    # 抽象主题查询 → 偏向向量搜索
    # 混合查询 → 均衡
    weights = {
        "specific": {"alpha": 0.3, "beta": 0.7},  # 具体事实
        "abstract": {"alpha": 0.7, "beta": 0.3},  # 抽象主题
        "hybrid":   {"alpha": 0.5, "beta": 0.5},  # 混合
    }
    w = weights.get(query_type, weights["hybrid"])
    return fuse_scores_linear(vector_results, graph_results, w["alpha"], w["beta"])
```

### 7.3.4 LightRAG 中的混合搜索调用

在 LightRAG 中，混合搜索通过 `query` 方法的 `mode` 参数控制：

```python
from lightrag import LightRAG, QueryParam

rag = LightRAG(working_dir="./rag_storage", ...)

# 纯向量搜索（语义相似度）
result_vec = rag.query(
    "Transformer 架构的核心创新是什么？",
    param=QueryParam(mode="local"),  # 低层检索 = 向量优先
)

# 纯图搜索（关系路径）
result_graph = rag.query(
    "苹果公司和三星电子之间有哪些合作关系？",
    param=QueryParam(mode="global"),  # 高层检索 = 图优先
)

# 混合搜索（图 + 向量融合）
result_hybrid = rag.query(
    "深度学习框架在自然语言处理中的应用",
    param=QueryParam(mode="hybrid"),  # 混合模式
)
```

三种模式的内部行为差异：

| 模式 | 向量搜索权重 | 图搜索权重 | 适用查询 |
|------|------------|-----------|---------|
| `local` | 高 (0.7) | 低 (0.3) | 具体事实："Python 的列表推导式语法" |
| `global` | 低 (0.3) | 高 (0.7) | 抽象主题："文档集的主要研究方向" |
| `hybrid` | 中 (0.5) | 中 (0.5) | 混合查询："Transformer 在 NLP 中的应用" |

### 7.3.5 自定义混合搜索实现

对于需要精细控制混合策略的场景，可以直接操作 LightRAG 的内部组件：

```python
import numpy as np
from lightrag import LightRAG
from lightrag.utils import cosine_similarity

class CustomHybridSearch:
    def __init__(self, rag: LightRAG):
        self.rag = rag
        self.graph = rag.graph

    async def search(
        self,
        query: str,
        top_k: int = 10,
        alpha: float = 0.5,
        beta: float = 0.3,
        gamma: float = 0.2,  # 文本匹配权重
    ) -> list[dict]:
        """三因子混合搜索：向量 + 图 + 文本"""
        query_embedding = (await self.rag.embedding_func.embed([query]))[0]

        results = []
        for node_id, node_data in self.graph.nodes(data=True):
            # 1. 向量相似度
            vec_sim = cosine_similarity(
                query_embedding, node_data.get("embedding", [0.0] * 1024)
            )

            # 2. 图中心性（PageRank 分数）
            centrality = self.graph.get_node_centrality(node_id)

            # 3. 文本关键词匹配
            text_match = self._keyword_match(query, node_data.get("description", ""))

            # 综合分数
            combined = (
                alpha * vec_sim
                + beta * centrality
                + gamma * text_match
            )
            results.append({
                "entity": node_id,
                "score": combined,
                "vector_score": vec_sim,
                "graph_score": centrality,
                "text_score": text_match,
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _keyword_match(self, query: str, text: str) -> float:
        """简单的关键词重叠率"""
        query_words = set(query.lower().split())
        text_words = set(text.lower().split())
        if not query_words:
            return 0.0
        overlap = len(query_words & text_words)
        return overlap / len(query_words)
```

## 7.4 重排序策略

### 7.4.1 为什么需要重排序

向量检索的 Top-K 结果通常包含大量噪声。原因在于：

1. **语义近似 ≠ 精确匹配**：向量空间中的"邻居"可能只是主题相似，而非答案相关
2. **缺乏上下文感知**：向量相似度是独立计算的，不考虑结果之间的冗余和互补关系
3. **图分数偏差**：高度连接的实体（如"人工智能"）天然获得更高的图分数，但不一定与查询相关

重排序（Re-ranking）作为检索后处理步骤，通过更精细的模型对候选结果重新打分，显著提升最终质量。

### 7.4.2 重排序的典型架构

```
初始检索 (Top-100)
    │
    ├──→ 轻量级过滤（规则/关键词）
    │
    ├──→ 交叉编码器重排序（Cross-Encoder）
    │
    ├──→ 多样性重排序（MMR）
    │
    └──→ 最终 Top-K 结果
```

### 7.4.3 基于交叉编码器的重排序

交叉编码器（Cross-Encoder）将查询和候选文本拼接后输入 Transformer，输出相关性分数。相比双编码器（Bi-Encoder），精度更高但速度更慢：

```python
from sentence_transformers import CrossEncoder

# 加载交叉编码器重排序模型
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3", max_length=512)

def rerank_with_cross_encoder(
    query: str,
    candidates: list[tuple[str, str, float]],  # [(实体ID, 描述文本, 初始分数)]
    top_k: int = 10,
) -> list[tuple[str, float]]:
    """使用交叉编码器重排序"""
    # 准备查询-文档对
    pairs = [(query, desc) for _, desc, _ in candidates]

    # 计算相关性分数
    scores = reranker.predict(pairs)

    # 合并分数
    reranked = []
    for (entity_id, _, orig_score), new_score in zip(candidates, scores):
        # 可以融合原始分数和重排序分数
        final_score = 0.3 * orig_score + 0.7 * new_score
        reranked.append((entity_id, final_score))

    reranked.sort(key=lambda x: x[1], reverse=True)
    return reranked[:top_k]
```

**在 LightRAG 中集成重排序**：

```python
from lightrag import LightRAG, QueryParam
from sentence_transformers import CrossEncoder

class LightRAGWithRerank(LightRAG):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")

    async def query_with_rerank(
        self,
        query: str,
        param: QueryParam = None,
        initial_k: int = 50,
        final_k: int = 10,
    ) -> str:
        # 1. 获取更多候选结果
        param.top_k = initial_k
        raw_results = await super().query(query, param=param)

        # 2. 解析结果为实体列表
        candidates = self._parse_entities_from_result(raw_results)

        # 3. 重排序
        reranked = self._rerank(query, candidates, final_k)

        # 4. 用重排序后的结果重新生成回答
        return await self._generate_with_reranked(query, reranked)

    def _rerank(
        self,
        query: str,
        candidates: list[dict],
        top_k: int,
    ) -> list[dict]:
        pairs = [(query, c["description"]) for c in candidates]
        scores = self.reranker.predict(pairs)

        for c, s in zip(candidates, scores):
            c["rerank_score"] = float(s)

        candidates.sort(key=lambda x: x["rerank_score"], reverse=True)
        return candidates[:top_k]
```

### 7.4.4 基于 MMR 的多样性重排序

最大边际相关性（Maximal Marginal Relevance, MMR）在相关性和多样性之间取得平衡：

```python
import numpy as np

def mmr_rerank(
    query_embedding: list[float],
    candidate_embeddings: list[list[float]],
    candidate_ids: list[str],
    top_k: int = 10,
    lambda_param: float = 0.7,  # 相关性 vs 多样性权衡
) -> list[str]:
    """
    MMR 重排序：选择与查询相关且彼此不冗余的结果
    MMR = argmax [ λ * Sim(q, d) - (1-λ) * max Sim(d, selected) ]
    """
    selected = []
    candidate_set = list(range(len(candidate_ids)))

    query_vec = np.array(query_embedding)
    cand_vecs = np.array(candidate_embeddings)

    for _ in range(top_k):
        if not candidate_set:
            break

        mmr_scores = []
        for idx in candidate_set:
            # 与查询的相关性
            relevance = np.dot(query_vec, cand_vecs[idx])

            # 与已选结果的最大相似度
            if selected:
                selected_vecs = cand_vecs[selected]
                similarities = np.dot(cand_vecs[idx], selected_vecs.T)
                max_sim = np.max(similarities)
            else:
                max_sim = 0.0

            mmr = lambda_param * relevance - (1 - lambda_param) * max_sim
            mmr_scores.append(mmr)

        best_idx = candidate_set[np.argmax(mmr_scores)]
        selected.append(best_idx)
        candidate_set.remove(best_idx)

    return [candidate_ids[i] for i in selected]
```

### 7.4.5 基于 LLM 的重排序

对于需要深度语义理解的场景，可以直接使用 LLM 进行重排序：

```python
async def llm_rerank(
    query: str,
    candidates: list[dict],
    llm_func,
    top_k: int = 5,
) -> list[dict]:
    """使用 LLM 对候选结果进行重排序"""
    prompt = f"""你是一个搜索结果重排序专家。请根据以下查询，对候选结果进行相关性评分（1-10分）。

查询：{query}

候选结果：
"""
    for i, c in enumerate(candidates):
        prompt += f"\n[{i + 1}] {c['name']}: {c['description'][:200]}"

    prompt += """
请以 JSON 格式输出每个结果的评分和理由：
{"scores": [{"index": 1, "score": 8, "reason": "..."}, ...]}
仅输出 JSON，不要其他内容。"""

    response = await llm_func(prompt)
    scores = json.loads(response)["scores"]

    score_map = {s["index"] - 1: s["score"] for s in scores}
    for i, c in enumerate(candidates):
        c["llm_score"] = score_map.get(i, 0)

    candidates.sort(key=lambda x: x["llm_score"], reverse=True)
    return candidates[:top_k]
```

### 7.4.6 多阶段重排序流水线

将多种重排序策略组合成流水线，兼顾效率和精度：

```python
class RerankPipeline:
    def __init__(self, rag: LightRAG):
        self.rag = rag
        self.cross_encoder = CrossEncoder("BAAI/bge-reranker-v2-m3")

    async def pipeline(
        self,
        query: str,
        initial_k: int = 100,
        final_k: int = 10,
    ) -> list[dict]:
        # 阶段 1: 初始检索（获取大量候选）
        candidates = await self._initial_retrieve(query, initial_k)

        # 阶段 2: 快速过滤（关键词 + 规则）
        candidates = self._fast_filter(query, candidates)

        # 阶段 3: 交叉编码器重排序（精度高，速度慢）
        candidates = self._cross_encoder_rerank(query, candidates, top_k=30)

        # 阶段 4: MMR 多样性重排序
        candidates = self._mmr_rerank(query, candidates, top_k=final_k)

        return candidates

    def _fast_filter(
        self, query: str, candidates: list[dict]
    ) -> list[dict]:
        """快速规则过滤"""
        query_words = set(query.lower().split())
        filtered = []
        for c in candidates:
            desc = c.get("description", "").lower()
            # 至少包含一个查询关键词
            if any(w in desc for w in query_words):
                filtered.append(c)
        return filtered or candidates  # 如果全部过滤掉，保留原结果

    def _cross_encoder_rerank(
        self, query: str, candidates: list[dict], top_k: int
    ) -> list[dict]:
        pairs = [(query, c["description"]) for c in candidates]
        scores = self.cross_encoder.predict(pairs)
        for c, s in zip(candidates, scores):
            c["rerank_score"] = float(s)
        candidates.sort(key=lambda x: x["rerank_score"], reverse=True)
        return candidates[:top_k]

    def _mmr_rerank(
        self, query: str, candidates: list[dict], top_k: int
    ) -> list[dict]:
        query_emb = (self.rag.embedding_func.embed([query]))[0]
        cand_embs = [c["embedding"] for c in candidates]
        cand_ids = [c["id"] for c in candidates]

        selected_indices = mmr_rerank(
            query_emb, cand_embs, cand_ids,
            top_k=top_k, lambda_param=0.6,
        )
        return [candidates[i] for i in selected_indices]
```

### 7.4.7 重排序性能对比

| 方法 | 延迟 | 精度提升 | 适用场景 |
|------|------|---------|---------|
| 无重排序 | 0ms | 基准 | 低延迟要求 |
| 关键词过滤 | <1ms | +5-10% | 快速去噪 |
| 交叉编码器 | 50-500ms | +15-30% | 通用场景 |
| MMR | 10-50ms | +5-15%（多样性） | 需要结果多样性 |
| LLM 重排序 | 1-10s | +20-40% | 高精度场景 |

## 7.5 完整示例：端到端向量检索系统

以下是一个完整的端到端示例，展示了从嵌入模型配置到混合搜索再到重排序的全流程：

```python
import os
import asyncio
from lightrag import LightRAG, QueryParam
from lightrag.llm import openai_complete
from lightrag.embed import openai_embed
from sentence_transformers import CrossEncoder

os.environ["OPENAI_API_KEY"] = "sk-your-key"

class VectorSearchSystem:
    def __init__(self):
        # 初始化 LightRAG
        self.rag = LightRAG(
            working_dir="./rag_storage",
            llm_model_func=openai_complete,
            llm_model_name="gpt-4o-mini",
            embedding_func=openai_embed,
            embedding_model="text-embedding-3-small",
            embedding_dim=512,
        )
        # 初始化重排序器
        self.reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")

    async def insert_documents(self, docs: list[str]):
        """插入文档并构建索引"""
        for doc in docs:
            await self.rag.insert(doc)
        print(f"已插入 {len(docs)} 篇文档")

    async def search(
        self,
        query: str,
        mode: str = "hybrid",
        use_rerank: bool = True,
        top_k: int = 10,
    ) -> dict:
        """执行搜索"""
        # 1. 初始检索
        param = QueryParam(mode=mode, top_k=top_k * 5 if use_rerank else top_k)
        result = await self.rag.query(query, param=param)

        # 2. 重排序（可选）
        if use_rerank:
            result = await self._rerank(query, result, top_k)

        return {
            "query": query,
            "mode": mode,
            "result": result,
            "reranked": use_rerank,
        }

    async def _rerank(
        self, query: str, initial_result: str, top_k: int
    ) -> str:
        """对检索结果进行重排序后重新生成回答"""
        # 解析初始结果中的实体/段落
        segments = self._parse_segments(initial_result)

        if len(segments) <= 1:
            return initial_result

        # 交叉编码器重排序
        pairs = [(query, seg) for seg in segments]
        scores = self.reranker.predict(pairs)

        # 按分数排序
        ranked = sorted(
            zip(segments, scores), key=lambda x: x[1], reverse=True
        )
        top_segments = [seg for seg, _ in ranked[:top_k]]

        # 用重排序后的内容重新生成回答
        rerank_prompt = f"""基于以下最相关的信息回答用户问题。

问题：{query}

相关信息：
{chr(10).join(f'- {seg[:300]}' for seg in top_segments)}

请给出简洁准确的回答。"""
        return await self.rag.llm_model_func(rerank_prompt)

    def _parse_segments(self, result: str) -> list[str]:
        """将 LLM 回答解析为可重排序的段落"""
        return [s.strip() for s in result.split("\n") if s.strip() and len(s) > 20]


async def main():
    system = VectorSearchSystem()

    # 插入示例文档
    docs = [
        "LightRAG 是一种基于图结构的检索增强生成方法，"
        "由香港大学团队提出。它通过构建实体关系图来增强 LLM 的知识检索能力。",

        "向量检索的核心是将文本转化为稠密向量，"
        "通过计算向量相似度来找到语义相关的内容。"
        "常用的嵌入模型包括 OpenAI 的 text-embedding 系列和 BGE 系列。",

        "混合搜索结合了向量检索的语义理解能力和图检索的结构化关系能力，"
        "能够同时捕捉文本的隐式语义和显式关系。",

        "重排序是检索后处理的关键步骤。"
        "交叉编码器（Cross-Encoder）通过对查询-文档对进行深度交互，"
        "能够显著提升检索结果的精度。",
    ]
    await system.insert_documents(docs)

    # 执行搜索
    result = await system.search(
        query="向量检索如何与图结构结合？",
        mode="hybrid",
        use_rerank=True,
    )
    print(f"查询: {result['query']}")
    print(f"模式: {result['mode']}")
    print(f"结果:\n{result['result']}")

asyncio.run(main())
```

## 7.6 使用场景

### 7.6.1 企业知识库搜索

**场景**：企业内部有数千份技术文档、产品手册和项目报告，需要支持员工快速找到相关信息。

**方案**：
- 嵌入模型：`BAAI/bge-large-zh-v1.5`（中文文档为主）
- 向量索引：FAISS IVF（10 万级文档）
- 混合搜索：`hybrid` 模式，alpha=0.6（偏向语义理解）
- 重排序：交叉编码器 + MMR 组合

### 7.6.2 法律文档检索

**场景**：法律团队需要从大量判例和法规中检索与当前案件相关的条款。

**方案**：
- 嵌入模型：`text-embedding-3-large`（高精度要求）
- 向量索引：HNSW（需要精确的近邻搜索）
- 混合搜索：`local` 模式，强调实体匹配
- 重排序：LLM 重排序（法律术语的语义理解要求极高）

### 7.6.3 科研文献综述

**场景**：研究人员需要从论文库中找出与某个研究方向相关的文献，并生成综述。

**方案**：
- 嵌入模型：`intfloat/multilingual-e5-large`（多语言论文）
- 向量索引：Flat（精度优先，规模可控）
- 混合搜索：`global` 模式，强调主题聚类
- 重排序：交叉编码器 + MMR（保证结果多样性）

## 7.7 潜在风险与注意事项

### 7.7.1 嵌入模型选择陷阱

**陷阱 1：维度不匹配**

```python
# 错误：嵌入维度与配置不一致
rag = LightRAG(
    embedding_model="text-embedding-3-large",  # 默认 3072 维
    embedding_dim=512,  # 但 OpenAI 需要显式指定 dimensions 参数
)
# 正确做法：确保 embedding_func 内部传递了 dimensions 参数
```

**陷阱 2：忽略模型输入长度限制**

BGE 系列模型最大输入为 512 tokens。如果实体描述超过此长度，会被静默截断，导致语义丢失：

```python
# 安全做法：在嵌入前截断文本
def safe_embed(texts: list[str], max_tokens: int = 512):
    truncated = [t[:max_tokens] for t in texts]
    return embedding_func(truncated)
```

### 7.7.2 向量索引性能问题

**问题**：随着索引规模增长，检索延迟线性增加。

**解决方案**：
1. 使用 IVF 或 HNSW 索引替代 Flat
2. 实施分片策略，将索引按文档域或时间范围分区
3. 使用量化（PQ）降低内存占用

```python
# FAISS 索引优化示例
def build_optimized_index(vectors: np.ndarray, dimension: int):
    n = len(vectors)
    if n < 10000:
        # 小规模：暴力搜索
        return faiss.IndexFlatIP(dimension)
    elif n < 100000:
        # 中等规模：IVF
        nlist = int(np.sqrt(n))
        quantizer = faiss.IndexFlatIP(dimension)
        index = faiss.IndexIVFFlat(quantizer, dimension, nlist, faiss.METRIC_INNER_PRODUCT)
        index.train(vectors)
        index.add(vectors)
        index.nprobe = min(nlist, 10)  # 搜索时探测的聚类数
        return index
    else:
        # 大规模：HNSW
        index = faiss.IndexHNSWFlat(dimension, faiss.METRIC_INNER_PRODUCT)
        index.hnsw.efConstruction = 200
        index.add(vectors)
        return index
```

### 7.7.3 混合搜索的权重调优

**问题**：固定的融合权重无法适应所有查询类型。

**解决方案**：
1. 使用查询分类器动态选择权重
2. 实施 A/B 测试，根据用户反馈调整权重
3. 使用学习排序（Learning to Rank）自动学习最优权重

```python
class AdaptiveWeightSearch:
    def __init__(self, rag: LightRAG):
        self.rag = rag

    async def classify_query(self, query: str) -> str:
        """判断查询类型"""
        prompt = f"""判断以下查询的类型，只输出一个词：
- specific：询问具体事实、数据、定义
- abstract：询问主题、趋势、概述
- hybrid：混合型

查询：{query}"""
        result = await self.rag.llm_model_func(prompt)
        result = result.strip().lower()
        return result if result in ("specific", "abstract", "hybrid") else "hybrid"

    async def search(self, query: str):
        query_type = await self.classify_query(query)
        weights = {
            "specific": {"alpha": 0.3, "beta": 0.7},
            "abstract": {"alpha": 0.7, "beta": 0.3},
            "hybrid":   {"alpha": 0.5, "beta": 0.5},
        }
        w = weights[query_type]
        # 使用动态权重执行混合搜索
        ...
```

### 7.7.4 重排序的延迟预算

重排序是检索链路中延迟最高的环节。需要根据业务需求设定延迟预算：

| 场景 | 延迟预算 | 重排序策略 |
|------|---------|-----------|
| 实时对话 | <500ms | 仅关键词过滤 |
| 搜索建议 | <2s | 交叉编码器（Top-50 → Top-10） |
| 深度分析 | <10s | 交叉编码器 + MMR + LLM |

```python
class LatencyAwareReranker:
    def __init__(self, budget_ms: int = 2000):
        self.budget_ms = budget_ms

    async def rerank(self, query: str, candidates: list, top_k: int):
        start = time.time()

        # 阶段 1: 快速过滤（总是执行）
        candidates = self.fast_filter(query, candidates)
        elapsed = (time.time() - start) * 1000

        if elapsed > self.budget_ms * 0.5:
            return candidates[:top_k]  # 预算不足，直接返回

        # 阶段 2: 交叉编码器（预算允许时执行）
        remaining = self.budget_ms - elapsed
        rerank_top = min(len(candidates), int(remaining / 10))  # 估计每个候选 10ms
        if rerank_top >= top_k:
            candidates = self.cross_encoder_rerank(
                query, candidates[:rerank_top], top_k
            )

        return candidates[:top_k]
```

## 本章小结

1. **嵌入模型是向量检索的基石**：选型需权衡精度、成本、语言支持和部署方式。对于中文场景，BGE 系列和 text-embedding-3 系列是最优选择。

2. **向量索引构建需考虑规模**：小规模用 Flat，中等规模用 IVF，大规模用 HNSW。LightRAG 默认将向量存储在 NetworkX 图中，生产环境建议接入独立向量数据库。

3. **混合搜索是 LightRAG 的核心优势**：向量搜索捕捉语义相似度，图搜索捕捉结构化关系，两者融合（加权线性融合或 RRF）能显著提升检索质量。

4. **重排序是检索质量的最后保障**：交叉编码器提供最高精度，MMR 保证结果多样性，LLM 重排序适合深度语义理解场景。多阶段流水线可以在延迟预算内最大化精度。

5. **自适应策略是生产环境的关键**：根据查询类型动态调整混合权重，根据延迟预算动态选择重排序策略，才能在实际业务中达到最优效果。

---

**延伸阅读**：
- [OpenAI Embeddings API 文档](https://platform.openai.com/docs/guides/embeddings)
- [BGE 模型系列介绍](https://github.com/FlagOpen/FlagEmbedding)
- [FAISS 官方文档](https://github.com/facebookresearch/faiss)
- [Sentence-Transformers 文档](https://www.sbert.net/)
