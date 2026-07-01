# 第12章 LightRAG 性能优化与生产部署

## 12.1 概述

LightRAG 是一个轻量级的检索增强生成（Retrieval-Augmented Generation, RAG）框架，专为高效的知识检索与 LLM 集成而设计。在生产环境中，LightRAG 的性能直接决定了用户体验和系统吞吐量。本章将从嵌入模型优化、图存储优化、缓存策略、并行处理、API 服务部署以及监控与日志六个维度，系统性地阐述如何将 LightRAG 从原型阶段推向高可用的生产级服务。

---

## 12.2 嵌入模型优化

嵌入模型（Embedding Model）是 RAG 系统的核心组件之一，负责将文本转换为语义向量。其性能直接影响检索质量和响应延迟。

### 12.2.1 模型选型原则

生产环境中嵌入模型的选择需权衡以下因素：

| 维度 | 考量要点 |
|------|----------|
| 向量维度 | 维度越高，语义表达能力越强，但存储和计算开销也越大 |
| 推理速度 | 直接影响端到端延迟，需与业务 QPS 要求匹配 |
| 模型大小 | 影响显存占用和部署成本 |
| 语言适配 | 中文场景优先选择在中文语料上微调的模型 |

**推荐模型对比：**

| 模型 | 维度 | 相对速度 | 中文效果 | 适用场景 |
|------|------|----------|----------|----------|
| BAAI/bge-small-zh-v1.5 | 512 | 快 | 良好 | 高吞吐、低延迟场景 |
| BAAI/bge-base-zh-v1.5 | 768 | 中 | 优秀 | 通用生产场景 |
| BAAI/bge-large-zh-v1.5 | 1024 | 慢 | 卓越 | 精度优先场景 |
| text-embedding-3-small (OpenAI) | 512 | 快 | 优秀 | 调用外部 API 的场景 |

### 12.2.2 模型量化

模型量化是降低推理延迟和显存占用的最有效手段。LightRAG 支持通过 `sentence-transformers` 加载量化后的嵌入模型。

```python
import torch
from sentence_transformers import SentenceTransformer

# 加载半精度模型（FP16），显存占用减半，速度提升约 40%
model = SentenceTransformer(
    "BAAI/bge-base-zh-v1.5",
    device="cuda",
    model_kwargs={"torch_dtype": torch.float16}
)

# 或使用 ONNX 运行时加速
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer

ort_model = ORTModelForFeatureExtraction.from_pretrained(
    "BAAI/bge-base-zh-v1.5",
    export=True,
    provider="CUDAExecutionProvider"  # 使用 ONNX Runtime CUDA 加速
)
tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-base-zh-v1.5")
```

**量化策略总结：**

| 量化方式 | 精度损失 | 显存节省 | 速度提升 | 推荐场景 |
|----------|----------|----------|----------|----------|
| FP16 | 极小 | 50% | 30-50% | 通用推荐 |
| INT8 | 较小 | 75% | 50-80% | 显存受限场景 |
| ONNX + FP16 | 极小 | 50% | 40-60% | 生产部署首选 |

### 12.2.3 批处理编码

对大量文本进行嵌入时，批处理（Batch Processing）能充分利用 GPU 并行计算能力。

```python
from lightrag import LightRAG
from lightrag.base import DocProcessing

class OptimizedEmbedding:
    def __init__(self, model_name: str = "BAAI/bge-base-zh-v1.5", batch_size: int = 64):
        self.model = SentenceTransformer(model_name, device="cuda")
        self.model.half()  # FP16
        self.batch_size = batch_size
        self.tokenizer = self.model.tokenizer

    def encode_documents(self, texts: list[str]) -> list[list[float]]:
        all_embeddings = []
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            # 自动 padding 和 truncation
            embeddings = self.model.encode(
                batch,
                batch_size=self.batch_size,
                show_progress_bar=False,
                normalize_embeddings=True,  # L2 归一化，提升余弦相似度计算效率
                convert_to_numpy=True,
            )
            all_embeddings.extend(embeddings.tolist())
        return all_embeddings

    def encode_query(self, query: str) -> list[float]:
        # 查询编码使用单独的 instruction 前缀（BGE 系列模型需要）
        instruction = "为这个句子生成表示以用于检索相关文章："
        embedding = self.model.encode(
            f"{instruction}{query}",
            normalize_embeddings=True,
        )
        return embedding.tolist()
```

### 12.2.4 异步嵌入调用

在 Web 服务中，嵌入计算应异步执行，避免阻塞事件循环。

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

class AsyncEmbeddingEngine:
    def __init__(self, model_name: str = "BAAI/bge-base-zh-v1.5"):
        self.executor = ThreadPoolExecutor(max_workers=2)
        self.model = SentenceTransformer(model_name, device="cuda")
        self.model.half()

    async def encode(self, texts: list[str]) -> list[list[float]]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self.executor,
            self.model.encode,
            texts,
        )

    async def encode_query(self, query: str) -> list[float]:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            self.executor,
            lambda: self.model.encode(
                [query],
                normalize_embeddings=True,
            ),
        )
        return result[0].tolist()
```

---

## 12.3 图存储优化

LightRAG 的核心创新在于使用图结构（Graph）组织知识。图存储的效率直接影响插入和查询性能。

### 12.3.1 存储后端选型

LightRAG 支持多种存储后端，生产环境推荐如下：

| 后端 | 持久化 | 并发支持 | 查询性能 | 推荐场景 |
|------|--------|----------|----------|----------|
| NetworkX (内存) | 否 | 单进程 | 极快 | 开发/测试 |
| Neo4j | 是 | 高并发 | 快 | 生产首选 |
| PostgreSQL + pgvector | 是 | 高并发 | 中 | 已有 PG 基础设施 |
| RedisGraph | 是 | 高并发 | 极快 | 纯内存场景 |

### 12.3.2 Neo4j 集成与优化

Neo4j 是生产环境中最推荐的图数据库后端。以下展示如何将 LightRAG 与 Neo4j 集成并进行优化。

```python
from neo4j import GraphDatabase, AsyncGraphDatabase
from lightrag import LightRAG
from lightrag.storage import Neo4jStorage

class OptimizedNeo4jStorage:
    def __init__(self, uri: str, user: str, password: str, database: str = "lightrag"):
        self.driver = GraphDatabase.driver(
            uri,
            auth=(user, password),
            max_connection_pool_size=50,       # 连接池大小
            connection_acquisition_timeout=60,  # 获取连接超时
            max_transaction_retry_time=30,     # 事务重试时间
        )
        self.database = database
        self._init_schema()

    def _init_schema(self):
        """创建索引和约束以加速图查询"""
        with self.driver.session(database=self.database) as session:
            # 为节点标签创建索引
            session.run("CREATE INDEX IF NOT EXISTS FOR (d:Document) ON (d.id)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (c:Chunk) ON (c.id)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (e:Entity) ON (e.name)")

            # 全文索引（用于文本搜索）
            session.run(
                "CREATE FULLTEXT INDEX fulltext_chunk IF NOT EXISTS "
                "FOR (c:Chunk) ON EACH [c.text]"
            )

            # 约束：确保实体名称唯一
            session.run(
                "CREATE CONSTRAINT unique_entity IF NOT EXISTS "
                "FOR (e:Entity) REQUIRE e.name IS UNIQUE"
            )

    async def batch_insert_chunks(self, chunks: list[dict]):
        """批量插入文档块，使用 UNWIND 减少事务次数"""
        query = """
        UNWIND $chunks AS chunk
        MERGE (c:Chunk {id: chunk.id})
        SET c.text = chunk.text,
            c.embedding = chunk.embedding,
            c.metadata = chunk.metadata
        WITH c, chunk
        UNWIND chunk.entities AS entity_name
        MERGE (e:Entity {name: entity_name})
        MERGE (c)-[:MENTIONS]->(e)
        """
        async with self.driver.session(database=self.database) as session:
            await session.run(query, chunks=chunks)

    async def similarity_search(
        self, query_embedding: list[float], top_k: int = 10
    ) -> list[dict]:
        """基于向量相似度的图遍历查询"""
        query = """
        CALL db.index.vector.queryNodes(
            'chunk_embedding_index',
            $top_k,
            $query_embedding
        )
        YIELD node, score
        OPTIONAL MATCH (node)-[:MENTIONS]->(e:Entity)
        RETURN node.id AS id,
               node.text AS text,
               score,
               collect(DISTINCT e.name) AS entities
        ORDER BY score DESC
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(
                query,
                query_embedding=query_embedding,
                top_k=top_k,
            )
            return [record.data() async for record in result]

    def close(self):
        self.driver.close()
```

### 12.3.3 图剪枝与压缩

随着知识库增长，图规模会持续膨胀。定期剪枝是维持性能的关键。

```python
class GraphPruner:
    def __init__(self, storage: OptimizedNeo4jStorage):
        self.storage = storage

    async def prune_orphan_nodes(self):
        """删除没有任何关联的孤立节点"""
        query = """
        MATCH (n)
        WHERE NOT (n)--()
        DETACH DELETE n
        RETURN count(*) AS deleted_count
        """
        async with self.storage.driver.session(
            database=self.storage.database
        ) as session:
            result = await session.run(query)
            record = await result.single()
            return record["deleted_count"] if record else 0

    async def merge_duplicate_entities(
        self, similarity_threshold: float = 0.92
    ):
        """合并语义相似的重复实体节点"""
        query = """
        MATCH (e1:Entity)-[:MENTIONS]->(c:Chunk)
        WITH e1, collect(DISTINCT c) AS chunks
        MATCH (e2:Entity)
        WHERE e1.name < e2.name
          AND gds.similarity.cosine(e1.embedding, e2.embedding) > $threshold
        WITH e1, e2, chunks
        // 将 e2 的关系迁移到 e1
        MATCH (e2)-[r:MENTIONS]->(target)
        MERGE (e1)-[:MENTIONS]->(target)
        DELETE r
        // 删除 e2
        DETACH DELETE e2
        RETURN count(*) AS merged_count
        """
        async with self.storage.driver.session(
            database=self.storage.database
        ) as session:
            result = await session.run(
                query, threshold=similarity_threshold
            )
            record = await result.single()
            return record["merged_count"] if record else 0

    async def archive_old_versions(self, retention_days: int = 90):
        """归档超过保留期限的历史版本"""
        query = """
        MATCH (c:Chunk)
        WHERE c.created_at < datetime() - duration({days: $days})
          AND c.version > 1
        SET c.archived = true
        RETURN count(*) AS archived_count
        """
        async with self.storage.driver.session(
            database=self.storage.database
        ) as session:
            result = await session.run(query, days=retention_days)
            record = await result.single()
            return record["archived_count"] if record else 0
```

### 12.3.4 向量索引配置

对于基于向量的相似度搜索，索引类型和参数的选择至关重要。

```python
def configure_vector_index(driver, dimension: int = 768):
    """创建并配置向量索引"""
    with driver.session() as session:
        # 删除旧索引（如果存在）
        session.run("DROP INDEX chunk_embedding_index IF EXISTS")

        # 创建新的向量索引
        # Neo4j 5.13+ 支持向量索引
        session.run(f"""
        CREATE VECTOR INDEX chunk_embedding_index IF NOT EXISTS
        FOR (c:Chunk) ON (c.embedding)
        OPTIONS {{
            indexConfig: {{
                `vector.dimension`: {dimension},
                `vector.similarity_function`: 'cosine'
            }}
        }}
        """)

        # 验证索引状态
        result = session.run(
            "SHOW INDEXES WHERE name = 'chunk_embedding_index'"
        )
        for record in result:
            print(f"Index status: {record['state']}")
            print(f"Index provider: {record['provider']}")
```

---

## 12.4 缓存策略

缓存是降低延迟、减少重复计算的核心手段。LightRAG 生产部署应构建多级缓存体系。

### 12.4.1 多级缓存架构

```
┌─────────────────────────────────────────────┐
│             客户端请求                        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│          L1: 内存缓存 (Redis)                │
│     Key: query_hash → result                │
│     TTL: 5-30 分钟                          │
└──────────────────┬──────────────────────────┘
                   │ 未命中
                   ▼
┌─────────────────────────────────────────────┐
│          L2: 嵌入缓存 (Redis)                │
│     Key: text_hash → embedding              │
│     TTL: 24 小时                            │
└──────────────────┬──────────────────────────┘
                   │ 未命中
                   ▼
┌─────────────────────────────────────────────┐
│          L3: 图数据库查询                    │
│     Neo4j / 向量索引                        │
└─────────────────────────────────────────────┘
```

### 12.4.2 Redis 缓存实现

```python
import json
import hashlib
import redis.asyncio as aioredis
from typing import Optional

class LightRAGCache:
    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        default_ttl: int = 300,        # 查询缓存 5 分钟
        embedding_ttl: int = 86400,    # 嵌入缓存 24 小时
    ):
        self.redis = aioredis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=100,        # 连接池大小
            socket_timeout=2,           # 超时控制
            socket_connect_timeout=2,
        )
        self.default_ttl = default_ttl
        self.embedding_ttl = embedding_ttl

    def _hash_query(self, query: str, top_k: int) -> str:
        """生成查询缓存键"""
        content = f"{query}:{top_k}"
        return f"query:{hashlib.md5(content.encode()).hexdigest()}"

    def _hash_text(self, text: str) -> str:
        """生成文本缓存键"""
        return f"embed:{hashlib.md5(text.encode()).hexdigest()}"

    async def get_query_result(self, query: str, top_k: int) -> Optional[dict]:
        """获取缓存的查询结果"""
        key = self._hash_query(query, top_k)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_query_result(
        self, query: str, top_k: int, result: dict
    ):
        """缓存查询结果"""
        key = self._hash_query(query, top_k)
        await self.redis.setex(
            key, self.default_ttl, json.dumps(result, ensure_ascii=False)
        )

    async def get_embedding(self, text: str) -> Optional[list[float]]:
        """获取缓存的嵌入向量"""
        key = self._hash_text(text)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_embedding(self, text: str, embedding: list[float]):
        """缓存嵌入向量"""
        key = self._hash_text(text)
        await self.redis.setex(
            key, self.embedding_ttl, json.dumps(embedding)
        )

    async def invalidate_by_prefix(self, prefix: str):
        """按前缀批量失效缓存"""
        cursor = 0
        pattern = f"{prefix}:*"
        while True:
            cursor, keys = await self.redis.scan(
                cursor=cursor, match=pattern, count=100
            )
            if keys:
                await self.redis.delete(*keys)
            if cursor == 0:
                break

    async def get_cache_stats(self) -> dict:
        """获取缓存统计信息"""
        info = await self.redis.info("stats")
        return {
            "hits": info.get("keyspace_hits", 0),
            "misses": info.get("keyspace_misses", 0),
            "hit_rate": info.get("keyspace_hits", 0) / max(
                info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1
            ),
            "used_memory": info.get("used_memory_human", "N/A"),
        }

    async def close(self):
        await self.redis.close()
```

### 12.4.3 本地内存缓存（LRU）

对于不需要跨进程共享的缓存，使用本地 LRU 缓存可以获得更低延迟。

```python
from functools import lru_cache
import time

class LocalEmbeddingCache:
    def __init__(self, max_size: int = 10000):
        self.max_size = max_size
        self.cache: dict[str, tuple[list[float], float]] = {}
        self.access_order: list[str] = []

    def get(self, text_hash: str) -> list[float] | None:
        if text_hash in self.cache:
            embedding, _ = self.cache[text_hash]
            # 更新访问顺序（LRU）
            self.access_order.remove(text_hash)
            self.access_order.append(text_hash)
            return embedding
        return None

    def set(self, text_hash: str, embedding: list[float]):
        if len(self.cache) >= self.max_size:
            # 淘汰最久未使用的条目
            oldest = self.access_order.pop(0)
            del self.cache[oldest]

        self.cache[text_hash] = (embedding, time.time())
        self.access_order.append(text_hash)

    @property
    def size(self) -> int:
        return len(self.cache)

    def clear(self):
        self.cache.clear()
        self.access_order.clear()
```

### 12.4.4 缓存预热

系统启动时，预先加载高频查询的缓存，避免冷启动导致的性能毛刺。

```python
class CacheWarmer:
    def __init__(
        self,
        cache: LightRAGCache,
        embedding_engine: AsyncEmbeddingEngine,
        frequent_queries: list[str],
    ):
        self.cache = cache
        self.embedding_engine = embedding_engine
        self.frequent_queries = frequent_queries

    async def warm_up(self):
        """预热高频查询的嵌入缓存"""
        print(f"开始缓存预热，共 {len(self.frequent_queries)} 条高频查询...")
        tasks = []
        for query in self.frequent_queries:
            text_hash = hashlib.md5(query.encode()).hexdigest()
            cached = await self.cache.get_embedding(query)
            if cached is None:
                tasks.append(self._warm_single(query))

        if tasks:
            await asyncio.gather(*tasks)
        print("缓存预热完成")

    async def _warm_single(self, query: str):
        embedding = await self.embedding_engine.encode_query(query)
        await self.cache.set_embedding(query, embedding)
```

---

## 12.5 并行处理

LightRAG 的文档处理和查询涉及多个可并行的阶段。合理利用并行可以显著提升吞吐量。

### 12.5.1 文档处理的并行流水线

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass, field

@dataclass
class ProcessingPipeline:
    """文档处理流水线：分块 → 嵌入 → 图插入"""
    chunk_size: int = 512
    chunk_overlap: int = 50
    batch_size: int = 64
    max_workers: int = 4

    def __post_init__(self):
        self.process_executor = ProcessPoolExecutor(
            max_workers=self.max_workers
        )
        self.thread_executor = ThreadPoolExecutor(
            max_workers=self.max_workers * 2
        )

    async def process_document(self, text: str, doc_id: str) -> dict:
        """处理单个文档的完整流水线"""
        # 阶段 1: 文本分块（CPU 密集型，使用进程池）
        chunks = await self._chunk_text(text)

        # 阶段 2: 并行嵌入（I/O + GPU 密集型）
        embeddings = await self._batch_embed(chunks)

        # 阶段 3: 实体提取（CPU 密集型）
        entities = await self._extract_entities(chunks)

        # 阶段 4: 构建图结构
        graph_data = self._build_graph(chunks, embeddings, entities)

        return graph_data

    async def _chunk_text(self, text: str) -> list[str]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self.process_executor,
            self._split_text,
            text,
        )

    def _split_text(self, text: str) -> list[str]:
        """按段落和长度分割文本"""
        import re
        paragraphs = re.split(r'\n\s*\n', text)
        chunks = []
        current = []
        current_len = 0

        for para in paragraphs:
            para_len = len(para)
            if current_len + para_len > self.chunk_size and current:
                chunks.append('\n\n'.join(current))
                # 重叠处理
                overlap_text = current[-int(self.chunk_overlap / 10):]
                current = overlap_text
                current_len = sum(len(p) for p in current)
            current.append(para)
            current_len += para_len

        if current:
            chunks.append('\n\n'.join(current))
        return chunks

    async def _batch_embed(
        self, chunks: list[str]
    ) -> list[list[float]]:
        """批量嵌入，自动分批"""
        # 实际项目中应调用嵌入引擎
        return await asyncio.gather(*[
            self._embed_chunk(chunk) for chunk in chunks
        ])

    async def _embed_chunk(self, chunk: str) -> list[float]:
        # 模拟嵌入调用
        await asyncio.sleep(0.01)
        return [0.0] * 768

    async def _extract_entities(
        self, chunks: list[str]
    ) -> list[list[str]]:
        """并行实体提取"""
        loop = asyncio.get_event_loop()
        tasks = []
        for chunk in chunks:
            tasks.append(
                loop.run_in_executor(
                    self.thread_executor,
                    self._extract_entities_from_text,
                    chunk,
                )
            )
        return await asyncio.gather(*tasks)

    def _extract_entities_from_text(self, text: str) -> list[str]:
        """从文本中提取命名实体"""
        import re
        # 简单的中文实体提取（生产环境应使用 NER 模型）
        entities = re.findall(r'[A-Z\u4e00-\u9fff]{2,}', text)
        return list(set(entities))

    def _build_graph(
        self,
        chunks: list[str],
        embeddings: list[list[float]],
        entities: list[list[str]],
    ) -> dict:
        """构建图数据结构"""
        nodes = []
        edges = []
        for i, (chunk, embedding, ents) in enumerate(
            zip(chunks, embeddings, entities)
        ):
            node_id = f"chunk_{i}"
            nodes.append({
                "id": node_id,
                "text": chunk,
                "embedding": embedding,
            })
            for ent in ents:
                edges.append({
                    "source": node_id,
                    "target": ent,
                    "relation": "MENTIONS",
                })
        return {"nodes": nodes, "edges": edges}
```

### 12.5.2 查询阶段的并行检索

```python
class ParallelRetriever:
    """多路并行检索器"""

    def __init__(
        self,
        vector_weight: float = 0.6,
        graph_weight: float = 0.4,
    ):
        self.vector_weight = vector_weight
        self.graph_weight = graph_weight

    async def parallel_search(
        self,
        query: str,
        query_embedding: list[float],
        vector_store,
        graph_store,
        top_k: int = 10,
    ) -> list[dict]:
        """同时执行向量检索和图检索，然后融合结果"""
        # 并行执行两种检索
        vector_task = self._vector_search(
            query_embedding, vector_store, top_k
        )
        graph_task = self._graph_search(
            query, graph_store, top_k
        )

        vector_results, graph_results = await asyncio.gather(
            vector_task, graph_task
        )

        # 融合排序
        return self._fuse_results(
            vector_results, graph_results, top_k
        )

    async def _vector_search(
        self,
        embedding: list[float],
        vector_store,
        top_k: int,
    ) -> list[dict]:
        """向量相似度检索"""
        results = await vector_store.similarity_search(
            embedding, top_k=top_k * 2
        )
        for r in results:
            r["score"] = r["score"] * self.vector_weight
        return results

    async def _graph_search(
        self,
        query: str,
        graph_store,
        top_k: int,
    ) -> list[dict]:
        """基于图的检索（实体关系传播）"""
        results = await graph_store.graph_based_search(
            query, top_k=top_k * 2
        )
        for r in results:
            r["score"] = r.get("graph_score", 0) * self.graph_weight
        return results

    def _fuse_results(
        self,
        vector_results: list[dict],
        graph_results: list[dict],
        top_k: int,
    ) -> list[dict]:
        """加权融合并去重"""
        seen = set()
        fused = []

        for r in vector_results + graph_results:
            doc_id = r.get("id")
            if doc_id not in seen:
                seen.add(doc_id)
                fused.append(r)
            else:
                # 合并分数
                for existing in fused:
                    if existing["id"] == doc_id:
                        existing["score"] = max(
                            existing["score"], r["score"]
                        )
                        break

        fused.sort(key=lambda x: x["score"], reverse=True)
        return fused[:top_k]
```

### 12.5.3 异步任务队列

对于耗时的文档插入操作，应使用任务队列异步处理，避免阻塞 API 响应。

```python
from redis import asyncio as aioredis
import pickle
import uuid

class DocumentTaskQueue:
    """基于 Redis 的异步文档处理任务队列"""

    def __init__(self, redis_url: str = "redis://localhost:6379/1"):
        self.redis = aioredis.from_url(redis_url)
        self.queue_key = "lightrag:doc_queue"
        self.result_prefix = "lightrag:doc_result:"

    async def enqueue(
        self, text: str, metadata: dict = None
    ) -> str:
        """将文档处理任务加入队列"""
        task_id = str(uuid.uuid4())
        task = {
            "id": task_id,
            "text": text,
            "metadata": metadata or {},
            "status": "pending",
        }
        await self.redis.rpush(
            self.queue_key, pickle.dumps(task)
        )
        return task_id

    async def dequeue(self) -> dict | None:
        """从队列中取出待处理任务"""
        data = await self.redis.lpop(self.queue_key)
        if data:
            return pickle.loads(data)
        return None

    async def get_result(self, task_id: str) -> dict | None:
        """获取任务处理结果"""
        data = await self.redis.get(
            f"{self.result_prefix}{task_id}"
        )
        if data:
            return json.loads(data)
        return None

    async def set_result(self, task_id: str, result: dict):
        """设置任务处理结果"""
        await self.redis.setex(
            f"{self.result_prefix}{task_id}",
            3600,  # 结果保留 1 小时
            json.dumps(result, ensure_ascii=False),
        )


# 后台 Worker 示例
async def document_worker(queue: DocumentTaskQueue, pipeline: ProcessingPipeline):
    """后台文档处理 Worker"""
    while True:
        task = await queue.dequeue()
        if task is None:
            await asyncio.sleep(1)
            continue

        try:
            result = await pipeline.process_document(
                task["text"], task["id"]
            )
            await queue.set_result(task["id"], {
                "status": "completed",
                "data": result,
            })
        except Exception as e:
            await queue.set_result(task["id"], {
                "status": "failed",
                "error": str(e),
            })
```

---

## 12.6 API 服务部署

将 LightRAG 封装为高性能的 API 服务是生产部署的核心环节。本节使用 FastAPI 构建完整的 RESTful API。

### 12.6.1 FastAPI 服务完整实现

```python
"""
LightRAG Production API Server
FastAPI 实现，支持异步处理、缓存、限流和健康检查
"""

import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ---------- 数据模型 ----------

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4096, description="用户查询")
    top_k: int = Field(default=10, ge=1, le=100, description="返回结果数量")
    mode: str = Field(default="hybrid", pattern="^(hybrid|local|global)$")
    use_cache: bool = Field(default=True, description="是否使用缓存")

class QueryResponse(BaseModel):
    answer: str
    sources: list[dict] = []
    latency_ms: float = 0.0
    cache_hit: bool = False

class DocumentIngestRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10_000_000)
    doc_id: Optional[str] = None
    metadata: dict = {}

class DocumentIngestResponse(BaseModel):
    task_id: str
    status: str
    message: str

class HealthResponse(BaseModel):
    status: str
    version: str
    uptime: float
    cache_stats: dict = {}
    embedding_model: str = ""

# ---------- 全局状态 ----------

class AppState:
    def __init__(self):
        self.start_time = time.time()
        self.rag: Optional[LightRAG] = None
        self.cache: Optional[LightRAGCache] = None
        self.embedding_engine: Optional[AsyncEmbeddingEngine] = None
        self.task_queue: Optional[DocumentTaskQueue] = None
        self.logger = logging.getLogger("lightrag.api")

state = AppState()

# ---------- 生命周期管理 ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动和关闭时的资源管理"""
    # 启动时初始化
    state.logger.info("正在初始化 LightRAG 服务...")

    # 初始化嵌入引擎
    state.embedding_engine = AsyncEmbeddingEngine(
        model_name="BAAI/bge-base-zh-v1.5"
    )

    # 初始化缓存
    state.cache = LightRAGCache(
        redis_url="redis://localhost:6379/0"
    )

    # 初始化任务队列
    state.task_queue = DocumentTaskQueue(
        redis_url="redis://localhost:6379/1"
    )

    # 初始化 LightRAG 核心
    state.rag = LightRAG(
        embedding_function=state.embedding_engine.encode,
        vector_store_config={
            "type": "neo4j",
            "uri": "bolt://localhost:7687",
            "user": "neo4j",
            "password": "your_password",
        },
        graph_storage=OptimizedNeo4jStorage(
            uri="bolt://localhost:7687",
            user="neo4j",
            password="your_password",
        ),
    )

    state.logger.info("LightRAG 服务初始化完成")
    yield

    # 关闭时清理资源
    state.logger.info("正在关闭 LightRAG 服务...")
    if state.cache:
        await state.cache.close()
    if state.task_queue:
        await state.task_queue.redis.close()

# ---------- FastAPI 应用 ----------

app = FastAPI(
    title="LightRAG Production API",
    version="2.0.0",
    description="高性能 LightRAG 检索增强生成服务",
    lifespan=lifespan,
)

# 中间件配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"],
)

# ---------- 请求/响应中间件 ----------

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """记录请求处理时间"""
    start = time.time()
    response = await call_next(request)
    process_time = (time.time() - start) * 1000
    response.headers["X-Process-Time-MS"] = str(round(process_time, 2))
    return response

@app.middleware("http")
async def catch_exceptions(request: Request, call_next):
    """全局异常捕获"""
    try:
        return await call_next(request)
    except Exception as e:
        state.logger.error(
            f"请求处理异常: {request.url.path} - {str(e)}",
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "内部服务器错误",
                "detail": str(e) if app.debug else "请稍后重试",
            },
        )

# ---------- API 端点 ----------

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """健康检查端点"""
    cache_stats = {}
    if state.cache:
        try:
            cache_stats = await state.cache.get_cache_stats()
        except Exception:
            cache_stats = {"error": "缓存不可用"}

    return HealthResponse(
        status="healthy",
        version="2.0.0",
        uptime=time.time() - state.start_time,
        cache_stats=cache_stats,
        embedding_model="BAAI/bge-base-zh-v1.5",
    )


@app.post("/v1/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """执行 RAG 查询"""
    start = time.time()

    # 1. 检查缓存
    if request.use_cache and state.cache:
        cached = await state.cache.get_query_result(
            request.query, request.top_k
        )
        if cached:
            return QueryResponse(
                **cached,
                cache_hit=True,
                latency_ms=(time.time() - start) * 1000,
            )

    # 2. 生成查询嵌入
    query_embedding = await state.embedding_engine.encode_query(
        request.query
    )

    # 3. 执行检索
    retriever = ParallelRetriever()
    results = await retriever.parallel_search(
        query=request.query,
        query_embedding=query_embedding,
        vector_store=state.rag.vector_store,
        graph_store=state.rag.graph_storage,
        top_k=request.top_k,
    )

    # 4. 生成回答
    answer = await state.rag.generate(
        query=request.query,
        context=results,
        mode=request.mode,
    )

    response_data = {
        "answer": answer,
        "sources": [
            {
                "id": r["id"],
                "text": r.get("text", "")[:500],
                "score": round(r.get("score", 0), 4),
            }
            for r in results
        ],
        "latency_ms": (time.time() - start) * 1000,
        "cache_hit": False,
    }

    # 5. 写入缓存
    if request.use_cache and state.cache:
        await state.cache.set_query_result(
            request.query, request.top_k, response_data
        )

    return QueryResponse(**response_data)


@app.post("/v1/ingest", response_model=DocumentIngestResponse)
async def ingest_document(request: DocumentIngestRequest):
    """异步接收文档并加入处理队列"""
    task_id = await state.task_queue.enqueue(
        text=request.text,
        metadata={
            "doc_id": request.doc_id,
            **request.metadata,
        },
    )

    return DocumentIngestResponse(
        task_id=task_id,
        status="queued",
        message=f"文档已加入处理队列，任务 ID: {task_id}",
    )


@app.get("/v1/task/{task_id}")
async def get_task_status(task_id: str):
    """查询文档处理任务状态"""
    result = await state.task_queue.get_result(task_id)
    if result is None:
        return {"task_id": task_id, "status": "pending"}
    return {"task_id": task_id, **result}


@app.post("/v1/cache/clear")
async def clear_cache(prefix: str = "query"):
    """清除指定前缀的缓存"""
    if state.cache:
        await state.cache.invalidate_by_prefix(prefix)
        return {"status": "ok", "message": f"已清除 {prefix} 前缀的缓存"}
    return {"status": "error", "message": "缓存未初始化"}


@app.get("/v1/stats")
async def get_stats():
    """获取服务统计信息"""
    return {
        "uptime_seconds": time.time() - state.start_time,
        "cache": await state.cache.get_cache_stats() if state.cache else {},
        "embedding_model": "BAAI/bge-base-zh-v1.5",
    }

# ---------- 启动入口 ----------

if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        workers=4,              # 多 Worker 进程
        loop="uvloop",          # 高性能事件循环
        http="httptools",       # 高性能 HTTP 解析
        limit_concurrency=1000, # 最大并发连接数
        backlog=2048,           # 连接等待队列大小
        timeout_keep_alive=30,  # 长连接超时
        log_level="info",
        access_log=True,
    )
```

### 12.6.2 限流与保护

```python
from fastapi import Request, HTTPException
import time
from collections import defaultdict

class RateLimiter:
    """基于令牌桶的限流器"""

    def __init__(self, requests_per_second: int = 100):
        self.rate = requests_per_second
        self.tokens: dict[str, tuple[float, int]] = defaultdict(
            lambda: (time.time(), requests_per_second)
        )

    async def check(self, request: Request):
        client_ip = request.client.host
        last_time, tokens = self.tokens[client_ip]
        now = time.time()

        # 补充令牌
        elapsed = now - last_time
        tokens = min(
            self.rate,
            tokens + elapsed * self.rate,
        )

        if tokens < 1:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "请求过于频繁",
                    "retry_after": f"{1 / self.rate:.2f}s",
                },
            )

        self.tokens[client_ip] = (now, tokens - 1)


rate_limiter = RateLimiter(requests_per_second=100)

# 在路由中使用
@app.post("/v1/query")
async def query_with_rate_limit(
    request: Request,
    query_req: QueryRequest,
    _=Depends(lambda req: rate_limiter.check(req)),
):
    # ... 查询逻辑
    pass
```

### 12.6.3 Docker 部署配置

```dockerfile
# Dockerfile
FROM python:3.11-slim AS builder

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 生产阶段
FROM python:3.11-slim

WORKDIR /app

# 仅复制必要文件
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY . .

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--loop", "uvloop"]
```

```yaml
# docker-compose.yml
version: "3.8"

services:
  lightrag-api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - REDIS_URL=redis://redis:6379/0
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=${NEO4J_PASSWORD}
      - LOG_LEVEL=INFO
    depends_on:
      redis:
        condition: service_healthy
      neo4j:
        condition: service_healthy
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "4"
          memory: "8G"
        reservations:
          cpus: "2"
          memory: "4G"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
    command: redis-server --appendonly yes --maxmemory 4gb --maxmemory-policy allkeys-lru

  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/${NEO4J_PASSWORD}
      - NEO4J_PLUGINS='["graph-data-science", "apoc"]'
      - NEO4J_dbms_memory_heap_maxSize=4G
      - NEO4J_dbms_memory_pagecache_size=2G
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "${NEO4J_PASSWORD}", "RETURN 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  worker:
    build: .
    command: python worker.py
    environment:
      - REDIS_URL=redis://redis:6379/1
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=${NEO4J_PASSWORD}
    depends_on:
      redis:
        condition: service_healthy
      neo4j:
        condition: service_healthy
    deploy:
      replicas: 2
    restart: unless-stopped

volumes:
  redis_data:
  neo4j_data:
  neo4j_logs:
```

### 12.6.4 Nginx 反向代理配置

```nginx
# /etc/nginx/sites-available/lightrag.conf
upstream lightrag_backend {
    least_conn;
    server 127.0.0.1:8001 weight=3;
    server 127.0.0.1:8002 weight=3;
    server 127.0.0.1:8003 weight=3;
    server 127.0.0.1:8004 weight=3;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.lightrag.example.com;

    ssl_certificate /etc/ssl/certs/lightrag.crt;
    ssl_certificate_key /etc/ssl/private/lightrag.key;

    # 请求体大小限制（支持大文档上传）
    client_max_body_size 50M;

    # 超时配置
    proxy_connect_timeout 10s;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;

    # 缓冲配置
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 16k;
    proxy_busy_buffers_size 32k;

    location / {
        proxy_pass http://lightrag_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 限流
        limit_req zone=api burst=200 nodelay;
        limit_req_status 429;
    }

    location /health {
        proxy_pass http://lightrag_backend;
        proxy_http_version 1.1;
        # 健康检查不限制
        limit_req off;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name api.lightrag.example.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 12.7 监控与日志

生产系统必须可观测。本节构建完整的监控体系。

### 12.7.1 结构化日志

```python
import json
import logging
import sys
from datetime import datetime, timezone

class JSONFormatter(logging.Formatter):
    """JSON 格式的日志格式化器，便于日志收集系统解析"""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
            }

        if hasattr(record, "extra"):
            log_entry.update(record.extra)

        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging(level: str = "INFO"):
    """配置结构化日志"""
    logger = logging.getLogger("lightrag")
    logger.setLevel(getattr(logging, level.upper()))

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)

    return logger


# 使用示例
logger = setup_logging("INFO")
logger.info(
    "查询处理完成",
    extra={
        "query_length": len(query),
        "top_k": top_k,
        "latency_ms": round(latency, 2),
        "cache_hit": cache_hit,
    },
)
```

### 12.7.2 Prometheus 指标收集

```python
from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    generate_latest,
    REGISTRY,
)
from fastapi import Response

# ---------- 指标定义 ----------

# 请求计数
QUERY_REQUESTS = Counter(
    "lightrag_query_requests_total",
    "查询请求总数",
    ["mode"],  # hybrid, local, global
)

# 请求延迟（毫秒）
QUERY_LATENCY = Histogram(
    "lightrag_query_latency_ms",
    "查询延迟分布（毫秒）",
    buckets=[10, 50, 100, 200, 500, 1000, 2000, 5000],
)

# 文档处理计数
DOCUMENT_INGESTED = Counter(
    "lightrag_documents_ingested_total",
    "已处理的文档总数",
)

# 缓存命中率
CACHE_HITS = Counter(
    "lightrag_cache_hits_total",
    "缓存命中次数",
    ["level"],  # query, embedding
)
CACHE_MISSES = Counter(
    "lightrag_cache_misses_total",
    "缓存未命中次数",
    ["level"],
)

# 图数据库连接数
GRAPH_CONNECTIONS = Gauge(
    "lightrag_graph_connections_active",
    "当前活跃的图数据库连接数",
)

# 嵌入队列深度
EMBEDDING_QUEUE_DEPTH = Gauge(
    "lightrag_embedding_queue_depth",
    "嵌入处理队列深度",
)

# 检索结果数量
RETRIEVAL_RESULTS = Histogram(
    "lightrag_retrieval_results_count",
    "每次检索返回的结果数量",
    buckets=[1, 5, 10, 20, 50],
)


class MetricsMiddleware:
    """自动记录请求指标的中间件"""

    async def __call__(self, request: Request, call_next):
        if request.url.path == "/metrics":
            return await call_next(request)

        start = time.time()
        response = await call_next(request)
        latency = (time.time() - start) * 1000

        if request.url.path == "/v1/query":
            QUERY_LATENCY.observe(latency)
            mode = request.query_params.get("mode", "hybrid")
            QUERY_REQUESTS.labels(mode=mode).inc()

        return response


# 添加 metrics 端点
@app.get("/metrics")
async def metrics():
    """Prometheus 指标暴露端点"""
    return Response(
        content=generate_latest(REGISTRY),
        media_type="text/plain; version=0.0.4",
    )
```

### 12.7.3 性能追踪

```python
import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import time

@dataclass
class TraceSpan:
    """追踪跨度"""
    name: str
    start: float = 0.0
    end: float = 0.0
    children: list = field(default_factory=list)

    @property
    def duration_ms(self) -> float:
        return (self.end - self.start) * 1000

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "duration_ms": round(self.duration_ms, 2),
            "children": [c.to_dict() for c in self.children],
        }


class QueryTracer:
    """查询性能追踪器"""

    def __init__(self, query: str):
        self.query = query[:100]
        self.root = TraceSpan(name="total")
        self.stack = [self.root]
        self.enabled = True

    @asynccontextmanager
    async def span(self, name: str):
        """创建一个追踪跨度"""
        if not self.enabled:
            yield
            return

        span = TraceSpan(name=name, start=time.time())
        self.stack[-1].children.append(span)
        self.stack.append(span)
        try:
            yield
        finally:
            span.end = time.time()
            self.stack.pop()

    def report(self) -> dict:
        """生成追踪报告"""
        self.root.end = time.time()
        return {
            "query": self.query,
            "total_ms": round(self.root.duration_ms, 2),
            "spans": self.root.to_dict(),
        }


# 在查询中使用
@app.post("/v1/query")
async def query_with_trace(request: QueryRequest):
    tracer = QueryTracer(request.query)

    async with tracer.span("embedding"):
        query_embedding = await state.embedding_engine.encode_query(
            request.query
        )

    async with tracer.span("retrieval"):
        results = await retriever.parallel_search(...)

    async with tracer.span("generation"):
        answer = await state.rag.generate(...)

    # 记录追踪信息
    trace_report = tracer.report()
    logger.info("查询追踪", extra={"trace": trace_report})

    return QueryResponse(
        answer=answer,
        sources=...,
        latency_ms=trace_report["total_ms"],
        trace=trace_report if app.debug else None,
    )
```

### 12.7.4 告警规则

```yaml
# prometheus/alerts.yml
groups:
  - name: lightrag_alerts
    rules:
      - alert: HighQueryLatency
        expr: |
          histogram_quantile(0.95,
            rate(lightrag_query_latency_ms_bucket[5m])
          ) > 2000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "查询延迟过高（P95 > 2s）"
          description: "过去 5 分钟 P95 查询延迟为 {{ $value }}ms"

      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status=~"5.."}[5m])
          /
          rate(http_requests_total[5m]) > 0.05
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "错误率超过 5%"
          description: "过去 3 分钟错误率为 {{ $value | humanizePercentage }}"

      - alert: CacheHitRateDrop
        expr: |
          rate(lightrag_cache_hits_total[10m])
          /
          (rate(lightrag_cache_hits_total[10m]) + rate(lightrag_cache_misses_total[10m]))
          < 0.3
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "缓存命中率低于 30%"
          description: "当前缓存命中率为 {{ $value | humanizePercentage }}"

      - alert: GraphConnectionExhaustion
        expr: lightrag_graph_connections_active > 40
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "图数据库连接数过高"
          description: "当前活跃连接数 {{ $value }}"

      - alert: EmbeddingQueueBacklog
        expr: lightrag_embedding_queue_depth > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "嵌入队列积压"
          description: "当前队列深度 {{ $value }}"
```

### 12.7.5 Grafana 仪表板配置

```json
{
  "title": "LightRAG 生产监控",
  "panels": [
    {
      "title": "QPS 与延迟",
      "type": "timeseries",
      "targets": [
        {
          "expr": "rate(lightrag_query_requests_total[1m])",
          "legendFormat": "QPS"
        },
        {
          "expr": "rate(lightrag_query_latency_ms_sum[1m]) / rate(lightrag_query_latency_ms_count[1m])",
          "legendFormat": "平均延迟 (ms)"
        }
      ]
    },
    {
      "title": "延迟分布 (P50/P95/P99)",
      "type": "timeseries",
      "targets": [
        {
          "expr": "histogram_quantile(0.50, rate(lightrag_query_latency_ms_bucket[5m]))",
          "legendFormat": "P50"
        },
        {
          "expr": "histogram_quantile(0.95, rate(lightrag_query_latency_ms_bucket[5m]))",
          "legendFormat": "P95"
        },
        {
          "expr": "histogram_quantile(0.99, rate(lightrag_query_latency_ms_bucket[5m]))",
          "legendFormat": "P99"
        }
      ]
    },
    {
      "title": "缓存命中率",
      "type": "stat",
      "targets": [
        {
          "expr": "rate(lightrag_cache_hits_total[5m]) / (rate(lightrag_cache_hits_total[5m]) + rate(lightrag_cache_misses_total[5m])) * 100",
          "legendFormat": "命中率"
        }
      ]
    },
    {
      "title": "错误率",
      "type": "timeseries",
      "targets": [
        {
          "expr": "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m]) * 100",
          "legendFormat": "错误率 %"
        }
      ]
    }
  ]
}
```

---

## 12.8 性能调优清单

以下清单总结了生产部署中需要关注的关键配置项：

### 12.8.1 嵌入层

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| 模型精度 | FP16 | 显存减半，速度提升 40% |
| 批处理大小 | 32-128 | 根据显存和延迟要求调整 |
| 查询前缀 | BGE 模型需要 | 提升检索精度 |
| 向量归一化 | 开启 | 提升余弦相似度计算效率 |
| 异步执行 | 必须 | 避免阻塞事件循环 |

### 12.8.2 图存储层

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| 连接池大小 | 50-100 | 根据并发量调整 |
| 向量索引类型 | HNSW | 高维向量检索最优 |
| 索引维度 | 匹配模型 | 768 维为通用选择 |
| 相似度函数 | cosine | 语义搜索推荐 |
| 定期剪枝 | 每日 | 删除孤立节点和重复实体 |

### 12.8.3 缓存层

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| 查询缓存 TTL | 5-30 分钟 | 根据数据更新频率调整 |
| 嵌入缓存 TTL | 24 小时 | 嵌入向量不随时间变化 |
| 本地缓存大小 | 10000 条 | LRU 淘汰策略 |
| Redis 最大内存 | 4GB | 根据可用内存调整 |
| Redis 淘汰策略 | allkeys-lru | 内存满时淘汰最久未使用 |

### 12.8.4 API 服务层

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| Worker 数 | 2-4 × CPU 核心 | GIL 限制，多进程并行 |
| 最大并发 | 1000 | 防止连接耗尽 |
| 请求超时 | 60s | 包含 LLM 生成时间 |
| 限流 | 100 QPS/IP | 防止滥用 |
| 健康检查间隔 | 30s | 及时发现异常实例 |

---

## 12.9 常见问题与排查

### 12.9.1 查询延迟过高

**可能原因：**
1. 嵌入模型未使用 FP16 量化
2. 图数据库缺少向量索引
3. 缓存未命中率过高
4. LLM 生成阶段耗时过长

**排查步骤：**
```bash
# 1. 检查嵌入模型推理时间
curl -X POST http://localhost:8000/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "测试查询", "top_k": 5}' \
  -w "\n\n耗时: %{time_total}s\n"

# 2. 检查 Neo4j 查询计划
EXPLAIN MATCH (c:Chunk)
WHERE c.embedding IS NOT NULL
RETURN c.id LIMIT 1;

# 3. 检查缓存命中率
curl http://localhost:8000/v1/stats | jq '.cache'
```

### 12.9.2 内存泄漏

**可能原因：**
1. 嵌入模型未正确释放显存
2. 图数据库连接未关闭
3. 缓存无限增长

**解决方案：**
```python
# 显式释放显存
import torch

def clear_gpu_memory():
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()

# 定期执行
async def periodic_cleanup(interval: int = 3600):
    while True:
        await asyncio.sleep(interval)
        clear_gpu_memory()
        logger.info("GPU 显存已清理")
```

### 12.9.3 连接池耗尽

**可能原因：**
1. 数据库连接未归还到连接池
2. 连接泄漏（未正确关闭 session）
3. 突发流量超过连接池上限

**解决方案：**
- 使用 `async with` 确保 session 自动关闭
- 设置合理的 `max_connection_pool_size`
- 配置连接超时和重试策略
- 使用连接池监控指标提前预警

---

## 12.10 本章小结

本章从六个核心维度系统性地阐述了 LightRAG 在生产环境中的性能优化与部署实践：

1. **嵌入模型优化**：通过 FP16 量化、批处理编码和异步调用，可将嵌入延迟降低 50% 以上。
2. **图存储优化**：选择合适的图数据库后端（推荐 Neo4j），配合向量索引、连接池和定期剪枝策略，确保图查询性能随数据增长保持稳定。
3. **缓存策略**：构建多级缓存体系（本地 LRU + Redis），配合缓存预热机制，可将查询延迟降低 60-80%。
4. **并行处理**：利用异步流水线和多路并行检索，充分发挥现代硬件的并行能力。
5. **API 服务部署**：基于 FastAPI 构建高性能 RESTful 服务，配合 Docker 容器化和 Nginx 反向代理，实现水平扩展和高可用。
6. **监控与日志**：通过结构化日志、Prometheus 指标和性能追踪，构建完整的可观测性体系。

生产部署不是一次性工作，而是一个持续优化的过程。建议团队建立性能基准测试（Benchmark）体系，在每次变更后验证性能指标，确保系统在迭代中保持高效稳定。
