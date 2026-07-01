# 第6章 增量更新与图维护

## 6.1 概述

### 解决的问题

传统 RAG 系统在知识库更新时面临一个根本性困境：每当新增一批文档，就必须重建整个索引。对于向量数据库而言，重建意味着重新计算所有文档的嵌入向量；对于图增强 RAG 而言，重建意味着重新提取所有实体和关系、重新构建图结构。当知识库规模达到百万级文档时，这种"全量重建"策略在时间和计算成本上都是不可接受的。

LightRAG 的增量更新机制正是为了解决这一问题而设计。它允许系统在不重建完整图索引的前提下，逐步添加新文档、合并重复实体、更新已有关系，并持续优化图结构。这使得 LightRAG 能够支持实时或近实时的知识更新场景，如新闻聚合、动态知识库、持续学习系统等。

### 核心原理

增量更新的核心思想是**局部化**：新文档的加入只影响图中与其直接相关的局部区域，而非整个图结构。具体而言，增量更新涉及以下四个层面：

1. **文档级增量**：新文档经过分块、实体提取、关系提取后，以增量方式插入图结构中
2. **实体级去重**：新提取的实体可能与图中已有实体重复，需要通过相似度匹配进行合并
3. **关系级更新**：新文档可能引入与已有关系矛盾或互补的新关系，需要冲突解决策略
4. **图结构优化**：随着图规模增长，需要定期进行剪枝、压缩和重构以维持检索效率

这四个层面构成了一个从粗到细的增量维护流水线，本章将逐一深入讲解。

---

## 6.2 增量添加文档

### 6.2.1 增量添加的基本流程

LightRAG 的增量添加流程与全量构建共享相同的核心步骤——文本分块、实体提取、关系提取、向量嵌入——但区别在于，增量添加不会清空已有图结构，而是将新提取的实体和关系合并到现有图中。

以下是增量添加文档的完整流程：

```python
import asyncio
from lightrag import LightRAG
from lightrag.base import QueryParam
from lightrag.utils import EmbeddingFunc
import numpy as np
from typing import List, Dict, Any
import json

# 初始化 LightRAG（假设已有索引）
async def init_rag_with_existing_index():
    """初始化一个已有索引的 LightRAG 实例"""
    rag = LightRAG(
        working_dir="./lightrag_data",
        embedding_func=EmbeddingFunc(
            embedding_dim=768,
            max_token_size=8192,
            func=lambda texts: np.random.rand(len(texts), 768)
        ),
        llm_model_func=None,  # 实际使用时传入 LLM 函数
    )
    return rag

async def incremental_insert_documents():
    """演示增量添加文档"""
    rag = await init_rag_with_existing_index()

    # ========== 第一批文档（初始索引） ==========
    initial_docs = [
        "苹果公司由史蒂夫·乔布斯于1976年创立，总部位于加利福尼亚州库比蒂诺。"
        "苹果公司是全球最大的科技公司之一，以iPhone、iPad和Mac等产品闻名。",

        "OpenAI是一家人工智能研究公司，成立于2015年，"
        "总部位于旧金山。其开发的GPT系列模型在自然语言处理领域取得了突破性进展。"
    ]

    print("=== 第一阶段：构建初始索引 ===")
    await rag.ainsert(initial_docs[0])
    await rag.ainsert(initial_docs[1])
    print("初始索引构建完成")

    # ========== 第二批文档（增量添加） ==========
    incremental_docs = [
        "苹果公司在2023年发布了Vision Pro混合现实头显设备，"
        "标志着公司进入空间计算时代。该设备搭载了M2和R1芯片。",

        "OpenAI在2023年发布了GPT-4模型，该模型在多项基准测试中"
        "表现出色，并支持多模态输入。GPT-4的推出进一步巩固了"
        "OpenAI在AI领域的领先地位。"
    ]

    print("\n=== 第二阶段：增量添加新文档 ===")
    for i, doc in enumerate(incremental_docs):
        await rag.ainsert(doc)
        print(f"增量添加文档 {i+1} 完成")

    # ========== 验证增量效果 ==========
    print("\n=== 第三阶段：验证检索效果 ===")

    # 查询新增内容
    query1 = "Vision Pro使用了什么芯片？"
    result1 = await rag.aquery(query1, param=QueryParam(mode="local"))
    print(f"查询: {query1}")
    print(f"结果: {result1}\n")

    query2 = "GPT-4有什么特点？"
    result2 = await rag.aquery(query2, param=QueryParam(mode="local"))
    print(f"查询: {query2}")
    print(f"结果: {result2}\n")

    # 查询跨文档关系（增量文档与初始文档的关联）
    query3 = "苹果公司在空间计算领域有什么布局？"
    result3 = await rag.aquery(query3, param=QueryParam(mode="hybrid"))
    print(f"查询: {query3}")
    print(f"结果: {result3}")

    return rag
```

### 6.2.2 批量增量插入

对于生产环境，逐文档插入效率较低。LightRAG 支持批量增量插入，可以显著提高吞吐量：

```python
async def batch_incremental_insert():
    """批量增量插入演示"""
    rag = await init_rag_with_existing_index()

    # 批量文档
    batch_docs = [
        "特斯拉公司由埃隆·马斯克领导，专注于电动汽车和清洁能源。"
        "其旗舰车型Model S和Model 3在全球市场取得了巨大成功。",

        "英伟达（NVIDIA）是全球领先的GPU制造商，其CUDA平台"
        "广泛应用于深度学习训练和推理。2023年，英伟达市值突破万亿美元。",

        "微软公司投资了OpenAI，并将GPT模型集成到Azure云服务和"
        "Office产品中。这一合作推动了AI技术的商业化应用。"
    ]

    # 批量插入（内部自动并行处理）
    print("开始批量增量插入...")
    await rag.ainsert_batch(batch_docs)
    print(f"批量插入 {len(batch_docs)} 篇文档完成")

    # 验证跨文档关系
    query = "哪些公司参与了AI技术的商业化？"
    result = await rag.aquery(query, param=QueryParam(mode="hybrid"))
    print(f"查询: {query}")
    print(f"结果: {result}")

    return rag
```

### 6.2.3 增量添加的内部机制

理解增量添加的内部机制有助于我们更好地配置和使用这一功能。LightRAG 的 `ainsert` 方法内部执行以下步骤：

```python
# 以下代码展示 LightRAG 增量插入的内部逻辑（简化版）
class LightRAGIncrementalEngine:
    """LightRAG 增量更新引擎（内部实现示意）"""

    def __init__(self, graph, embedding_func, llm_func):
        self.graph = graph          # 现有图结构（NetworkX）
        self.embedding_func = embedding_func
        self.llm_func = llm_func
        self.entity_cache = set()   # 已有实体缓存
        self.relation_cache = set()  # 已有关系缓存

    async def incremental_insert(self, document: str):
        """增量插入单篇文档"""
        # 步骤1：文本分块
        chunks = self._split_text(document)

        for chunk in chunks:
            # 步骤2：实体提取（仅提取新文档中的实体）
            new_entities = await self._extract_entities(chunk)

            # 步骤3：去重过滤
            deduped_entities = []
            for entity in new_entities:
                if entity["name"] not in self.entity_cache:
                    deduped_entities.append(entity)
                    self.entity_cache.add(entity["name"])

            # 步骤4：关系提取
            new_relations = await self._extract_relations(chunk, deduped_entities)

            # 步骤5：关系去重
            deduped_relations = []
            for rel in new_relations:
                rel_key = (rel["source"], rel["target"], rel["type"])
                if rel_key not in self.relation_cache:
                    deduped_relations.append(rel)
                    self.relation_cache.add(rel_key)

            # 步骤6：增量更新图结构
            self._update_graph(deduped_entities, deduped_relations)

            # 步骤7：为新实体生成向量嵌入
            if deduped_entities:
                texts = [e["description"] for e in deduped_entities]
                embeddings = await self.embedding_func(texts)
                self._store_embeddings(deduped_entities, embeddings)

    def _split_text(self, text: str) -> List[str]:
        """文本分块（按段落或固定大小）"""
        # 实际实现使用更复杂的分块策略
        chunk_size = 1000
        return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]

    async def _extract_entities(self, chunk: str) -> List[Dict]:
        """使用 LLM 从文本块中提取实体"""
        prompt = f"""从以下文本中提取所有重要实体（人物、组织、产品、概念等）：
        文本：{chunk}
        以 JSON 格式返回实体列表，每个实体包含 name 和 description 字段。"""
        response = await self.llm_func(prompt)
        return json.loads(response)

    async def _extract_relations(
        self, chunk: str, entities: List[Dict]
    ) -> List[Dict]:
        """提取实体之间的关系"""
        entity_names = [e["name"] for e in entities]
        prompt = f"""从以下文本中提取实体之间的关系：
        文本：{chunk}
        实体：{entity_names}
        以 JSON 格式返回关系列表，每个关系包含 source、target、type 和 description。"""
        response = await self.llm_func(prompt)
        return json.loads(response)

    def _update_graph(self, entities: List[Dict], relations: List[Dict]):
        """将新实体和关系合并到现有图结构中"""
        import networkx as nx

        for entity in entities:
            self.graph.add_node(
                entity["name"],
                type=entity.get("type", "unknown"),
                description=entity["description"]
            )

        for rel in relations:
            self.graph.add_edge(
                rel["source"],
                rel["target"],
                type=rel["type"],
                description=rel.get("description", "")
            )

    def _store_embeddings(self, entities: List[Dict], embeddings: np.ndarray):
        """存储新实体的向量嵌入"""
        # 实际实现中，嵌入存储在向量数据库中
        pass
```

### 6.2.4 增量添加的最佳实践

```python
class IncrementalInsertConfig:
    """增量插入配置建议"""

    # 批量大小：根据 LLM 的上下文窗口和 API 限流调整
    BATCH_SIZE = 5  # 每批处理的文档数

    # 分块策略：新文档的分块大小应与初始索引一致
    CHUNK_SIZE = 1200  # 字符数
    CHUNK_OVERLAP = 100  # 块间重叠字符数

    # 并发控制：避免 API 限流
    MAX_CONCURRENT = 3  # 最大并发 LLM 调用数

    # 错误处理：失败重试策略
    MAX_RETRIES = 3
    RETRY_DELAY = 2.0  # 秒


async def production_incremental_insert(
    rag: LightRAG,
    new_docs: List[str],
    config: IncrementalInsertConfig
):
    """生产环境增量插入（带错误处理和进度追踪）"""
    from asyncio import Semaphore, sleep

    sem = Semaphore(config.MAX_CONCURRENT)

    async def insert_with_retry(doc: str, retry_count: int = 0):
        async with sem:
            try:
                await rag.ainsert(doc)
                return True, None
            except Exception as e:
                if retry_count < config.MAX_RETRIES:
                    await sleep(config.RETRY_DELAY * (retry_count + 1))
                    return await insert_with_retry(doc, retry_count + 1)
                return False, str(e)

    results = []
    for i in range(0, len(new_docs), config.BATCH_SIZE):
        batch = new_docs[i:i + config.BATCH_SIZE]
        batch_results = await asyncio.gather(*[
            insert_with_retry(doc) for doc in batch
        ])
        results.extend(batch_results)

        # 进度报告
        success_count = sum(1 for r in results if r[0])
        print(f"进度: {min(i + config.BATCH_SIZE, len(new_docs))}/{len(new_docs)} "
              f"({success_count} 成功)")

    return results
```

---

## 6.3 实体去重与合并

### 6.3.1 为什么需要实体去重

在增量更新场景中，实体去重是最关键也最棘手的问题。不同文档可能以不同方式指代同一实体，例如：

- "苹果公司" vs "Apple Inc." vs "苹果"
- "OpenAI" vs "OpenAI公司" vs "OpenAI研究机构"
- "史蒂夫·乔布斯" vs "Steve Jobs" vs "乔布斯"

如果不进行去重，图结构中将出现大量重复节点，导致：
- 检索时遗漏相关信息（因为信息分散在多个节点上）
- 关系路径断裂（本应相连的实体因名称不同而断开）
- 图规模膨胀（重复节点浪费存储和计算资源）

### 6.3.2 基于相似度的实体匹配

LightRAG 使用多维度相似度计算来判断两个实体是否指向同一真实世界对象：

```python
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass
from rapidfuzz import fuzz, process  # 模糊字符串匹配库


@dataclass
class Entity:
    """实体数据结构"""
    name: str
    type: str  # person, organization, product, concept, etc.
    description: str
    embedding: Optional[np.ndarray] = None
    aliases: List[str] = None

    def __post_init__(self):
        if self.aliases is None:
            self.aliases = []


class EntityDeduplicator:
    """实体去重引擎"""

    def __init__(
        self,
        name_similarity_threshold: float = 0.85,
        embedding_similarity_threshold: float = 0.90,
        description_similarity_threshold: float = 0.75
    ):
        self.name_threshold = name_similarity_threshold
        self.embedding_threshold = embedding_similarity_threshold
        self.desc_threshold = description_similarity_threshold

    def compute_name_similarity(self, name1: str, name2: str) -> float:
        """计算实体名称的文本相似度"""
        # 使用多种模糊匹配算法综合评分
        ratio = fuzz.ratio(name1, name2) / 100.0
        partial_ratio = fuzz.partial_ratio(name1, name2) / 100.0
        token_sort = fuzz.token_sort_ratio(name1, name2) / 100.0

        # 加权平均
        return 0.4 * ratio + 0.3 * partial_ratio + 0.3 * token_sort

    def compute_embedding_similarity(
        self, emb1: np.ndarray, emb2: np.ndarray
    ) -> float:
        """计算向量嵌入的余弦相似度"""
        dot_product = np.dot(emb1, emb2)
        norm1 = np.linalg.norm(emb1)
        norm2 = np.linalg.norm(emb2)
        return float(dot_product / (norm1 * norm2 + 1e-10))

    def compute_description_similarity(
        self, desc1: str, desc2: str
    ) -> float:
        """计算实体描述的语义相似度"""
        # 使用 TF-IDF 或嵌入相似度
        return fuzz.token_set_ratio(desc1, desc2) / 100.0

    def are_same_entity(
        self, entity1: Entity, entity2: Entity
    ) -> Tuple[bool, float]:
        """判断两个实体是否指向同一真实对象"""
        scores = []

        # 1. 名称相似度
        name_score = self.compute_name_similarity(
            entity1.name, entity2.name
        )
        scores.append(("name", name_score))

        # 检查别名
        if entity1.aliases:
            alias_scores = [
                self.compute_name_similarity(alias, entity2.name)
                for alias in entity1.aliases
            ]
            name_score = max(name_score, max(alias_scores))

        # 2. 嵌入相似度（如果可用）
        if (entity1.embedding is not None and
                entity2.embedding is not None):
            emb_score = self.compute_embedding_similarity(
                entity1.embedding, entity2.embedding
            )
            scores.append(("embedding", emb_score))

        # 3. 描述相似度
        desc_score = self.compute_description_similarity(
            entity1.description, entity2.description
        )
        scores.append(("description", desc_score))

        # 综合评分（加权平均）
        weights = {
            "name": 0.5,
            "embedding": 0.3,
            "description": 0.2
        }
        total_weight = 0
        weighted_score = 0
        for metric, score in scores:
            w = weights.get(metric, 0.2)
            weighted_score += w * score
            total_weight += w

        final_score = weighted_score / total_weight if total_weight > 0 else 0

        # 判断阈值
        threshold = self.name_threshold
        if any(s[0] == "embedding" for s in scores):
            threshold = max(threshold, self.embedding_threshold)

        return final_score >= threshold, final_score


# 使用示例
def demo_entity_dedup():
    """实体去重演示"""
    dedup = EntityDeduplicator()

    entities = [
        Entity(
            name="苹果公司",
            type="organization",
            description="由史蒂夫·乔布斯创立的科技公司，总部在库比蒂诺"
        ),
        Entity(
            name="Apple Inc.",
            type="organization",
            description="美国跨国科技公司，以iPhone和Mac闻名"
        ),
        Entity(
            name="OpenAI",
            type="organization",
            description="人工智能研究公司，开发了GPT系列模型"
        ),
        Entity(
            name="OpenAI研究机构",
            type="organization",
            description="专注于AI研究的公司，总部在旧金山"
        ),
    ]

    # 两两比较
    for i in range(len(entities)):
        for j in range(i + 1, len(entities)):
            is_same, score = dedup.are_same_entity(
                entities[i], entities[j]
            )
            status = "✓ 重复" if is_same else "✗ 不同"
            print(f"{entities[i].name:15s} vs {entities[j].name:15s}: "
                  f"{status} (相似度: {score:.3f})")


if __name__ == "__main__":
    demo_entity_dedup()
```

### 6.3.3 实体合并策略

当判定两个实体重复后，需要将它们合并为一个节点。合并策略需要决定保留哪些信息、丢弃哪些信息：

```python
class EntityMerger:
    """实体合并引擎"""

    def __init__(self, llm_func=None):
        self.llm_func = llm_func

    def merge_entities(
        self, primary: Entity, secondary: Entity
    ) -> Entity:
        """将 secondary 合并到 primary 中"""
        merged = Entity(
            name=self._resolve_name(primary, secondary),
            type=self._resolve_type(primary, secondary),
            description=self._merge_descriptions(primary, secondary),
            embedding=self._merge_embeddings(primary, secondary),
            aliases=self._merge_aliases(primary, secondary)
        )
        return merged

    def _resolve_name(self, primary: Entity, secondary: Entity) -> str:
        """选择更规范/更常用的名称"""
        # 优先选择英文名（如果存在），否则选择更长的名称
        if primary.name != secondary.name:
            # 检查是否一个是另一个的别名
            if primary.name in secondary.name or secondary.name in primary.name:
                return max(primary.name, secondary.name, key=len)
            # 优先选择非缩写形式
            if len(primary.name) > len(secondary.name):
                return primary.name
        return primary.name

    def _resolve_type(self, primary: Entity, secondary: Entity) -> str:
        """解决类型冲突"""
        if primary.type == secondary.type:
            return primary.type
        if primary.type == "unknown":
            return secondary.type
        if secondary.type == "unknown":
            return primary.type
        # 类型冲突时，使用 LLM 判断（如果有）
        if self.llm_func:
            # 使用 LLM 判断更准确的类型
            pass
        return primary.type  # 默认保留 primary 的类型

    def _merge_descriptions(
        self, primary: Entity, secondary: Entity
    ) -> str:
        """合并描述信息"""
        # 简单策略：拼接去重
        descs = [primary.description, secondary.description]
        # 去重：如果一段描述包含另一段，只保留较长的
        if primary.description in secondary.description:
            return secondary.description
        if secondary.description in primary.description:
            return primary.description
        # 否则拼接
        return f"{primary.description}；{secondary.description}"

    def _merge_embeddings(
        self, primary: Entity, secondary: Entity
    ) -> Optional[np.ndarray]:
        """合并向量嵌入（平均策略）"""
        if primary.embedding is not None and secondary.embedding is not None:
            return (primary.embedding + secondary.embedding) / 2.0
        return primary.embedding or secondary.embedding

    def _merge_aliases(
        self, primary: Entity, secondary: Entity
    ) -> List[str]:
        """合并别名列表"""
        aliases = set(primary.aliases or [])
        aliases.add(secondary.name)
        if secondary.aliases:
            aliases.update(secondary.aliases)
        # 排除主名称
        aliases.discard(primary.name)
        return list(aliases)


def demo_entity_merging():
    """实体合并演示"""
    merger = EntityMerger()

    # 模拟重复实体
    entity_a = Entity(
        name="苹果公司",
        type="organization",
        description="由史蒂夫·乔布斯创立的科技公司，以iPhone闻名",
        aliases=["Apple"]
    )

    entity_b = Entity(
        name="Apple Inc.",
        type="organization",
        description="美国跨国科技公司，总部在库比蒂诺",
        aliases=["苹果"]
    )

    merged = merger.merge_entities(entity_a, entity_b)
    print(f"合并前: {entity_a.name} + {entity_b.name}")
    print(f"合并后: {merged.name}")
    print(f"描述: {merged.description}")
    print(f"别名: {merged.aliases}")


if __name__ == "__main__":
    demo_entity_merging()
```

### 6.3.4 图结构中的实体合并

实体合并不仅仅是修改节点属性，还需要处理图结构中的边关系：

```python
import networkx as nx


class GraphEntityMerger:
    """图结构中的实体合并器"""

    def __init__(self, graph: nx.Graph, deduplicator: EntityDeduplicator):
        self.graph = graph
        self.dedup = deduplicator

    def find_and_merge_duplicates(self) -> int:
        """扫描全图并合并重复实体"""
        nodes = list(self.graph.nodes(data=True))
        merge_count = 0

        for i in range(len(nodes)):
            for j in range(i + 1, len(nodes)):
                name_i, data_i = nodes[i]
                name_j, data_j = nodes[j]

                entity_i = Entity(
                    name=name_i,
                    type=data_i.get("type", "unknown"),
                    description=data_i.get("description", ""),
                    embedding=data_i.get("embedding")
                )
                entity_j = Entity(
                    name=name_j,
                    type=data_j.get("type", "unknown"),
                    description=data_j.get("description", ""),
                    embedding=data_j.get("embedding")
                )

                is_same, score = self.dedup.are_same_entity(
                    entity_i, entity_j
                )

                if is_same:
                    self._merge_in_graph(name_i, name_j, entity_i, entity_j)
                    merge_count += 1

        return merge_count

    def _merge_in_graph(
        self, keep_name: str, remove_name: str,
        keep_entity: Entity, remove_entity: Entity
    ):
        """在图结构中合并两个实体节点"""
        # 1. 合并节点属性
        merger = EntityMerger()
        merged = merger.merge_entities(keep_entity, remove_entity)
        self.graph.nodes[keep_name].update({
            "name": merged.name,
            "type": merged.type,
            "description": merged.description,
            "embedding": merged.embedding,
            "aliases": merged.aliases
        })

        # 2. 重定向所有指向被删除节点的边
        for neighbor in list(self.graph.neighbors(remove_name)):
            if neighbor == keep_name:
                continue

            # 获取边的属性
            edge_data = self.graph.get_edge_data(remove_name, neighbor)
            if edge_data:
                # 检查 keep_name 和 neighbor 之间是否已有边
                if self.graph.has_edge(keep_name, neighbor):
                    # 已有边：合并关系
                    existing_data = self.graph.get_edge_data(
                        keep_name, neighbor
                    )
                    self._merge_edges(
                        keep_name, neighbor,
                        existing_data, edge_data
                    )
                else:
                    # 无现有边：直接重定向
                    self.graph.add_edge(
                        keep_name, neighbor, **edge_data
                    )

        # 3. 删除被合并的节点
        self.graph.remove_node(remove_name)

    def _merge_edges(
        self, u: str, v: str,
        existing_data: dict, new_data: dict
    ):
        """合并两条边的关系数据"""
        merged = existing_data.copy()

        # 合并关系类型（如果不同）
        existing_types = existing_data.get("type", "")
        new_types = new_data.get("type", "")
        if existing_types != new_types:
            types_set = set()
            if existing_types:
                types_set.update(existing_types.split(";"))
            if new_types:
                types_set.update(new_types.split(";"))
            merged["type"] = ";".join(types_set)

        # 合并描述
        existing_desc = existing_data.get("description", "")
        new_desc = new_data.get("description", "")
        if existing_desc and new_desc and existing_desc != new_desc:
            merged["description"] = f"{existing_desc}；{new_desc}"

        # 增加权重
        merged["weight"] = (
            existing_data.get("weight", 1) + new_data.get("weight", 1)
        )

        self.graph.edges[(u, v)].update(merged)
```

### 6.3.5 增量场景下的实时去重

在增量添加文档时，新提取的实体需要立即与图中已有实体进行去重匹配：

```python
class IncrementalEntityDedup:
    """增量场景下的实时实体去重"""

    def __init__(self, graph: nx.Graph, dedup: EntityDeduplicator):
        self.graph = graph
        self.dedup = dedup

    async def dedup_new_entities(
        self, new_entities: List[Entity]
    ) -> List[Entity]:
        """对新提取的实体进行去重，返回需要新增的实体列表"""
        final_entities = []

        for new_entity in new_entities:
            matched = False

            for existing_node in self.graph.nodes(data=True):
                name, data = existing_node
                existing_entity = Entity(
                    name=name,
                    type=data.get("type", "unknown"),
                    description=data.get("description", ""),
                    embedding=data.get("embedding")
                )

                is_same, score = self.dedup.are_same_entity(
                    new_entity, existing_entity
                )

                if is_same:
                    # 合并到已有节点
                    merger = EntityMerger()
                    merged = merger.merge_entities(
                        existing_entity, new_entity
                    )
                    self.graph.nodes[name].update({
                        "description": merged.description,
                        "embedding": merged.embedding,
                        "aliases": merged.aliases
                    })
                    matched = True
                    break

            if not matched:
                final_entities.append(new_entity)

        return final_entities
```

---

## 6.4 关系更新与冲突解决

### 6.4.1 关系冲突的类型

增量更新中，新文档可能引入与已有关系相矛盾的信息。关系冲突主要有以下几种类型：

| 冲突类型 | 描述 | 示例 |
|---------|------|------|
| **类型冲突** | 同一对实体间的关系类型不同 | 文档A："苹果公司收购了Beats"；文档B："苹果公司与Beats合作" |
| **属性冲突** | 关系属性值矛盾 | 文档A："成立于1976年"；文档B："成立于1977年" |
| **方向冲突** | 关系方向相反 | 文档A："OpenAI被微软投资"；文档B："微软被OpenAI投资" |
| **事实冲突** | 同一事实的描述矛盾 | 文档A："GPT-4有1万亿参数"；文档B："GPT-4有1.7万亿参数" |

### 6.4.2 基于置信度的冲突解决

```python
@dataclass
class Relation:
    """关系数据结构"""
    source: str
    target: str
    type: str  # 关系类型
    description: str
    confidence: float = 1.0  # 置信度 [0, 1]
    source_doc: str = ""     # 来源文档标识
    timestamp: float = 0.0   # 时间戳
    metadata: Dict = None    # 额外元数据


class ConflictResolver:
    """关系冲突解决引擎"""

    def __init__(self, llm_func=None):
        self.llm_func = llm_func

    def resolve_conflict(
        self, existing_rel: Relation, new_rel: Relation
    ) -> Relation:
        """解决两个关系之间的冲突"""
        # 步骤1：检测冲突类型
        conflict_type = self._detect_conflict_type(existing_rel, new_rel)

        if conflict_type == "none":
            # 无冲突：合并信息
            return self._merge_compatible_relations(existing_rel, new_rel)

        elif conflict_type == "type_conflict":
            return self._resolve_type_conflict(existing_rel, new_rel)

        elif conflict_type == "attribute_conflict":
            return self._resolve_attribute_conflict(existing_rel, new_rel)

        elif conflict_type == "fact_conflict":
            return self._resolve_fact_conflict(existing_rel, new_rel)

        return existing_rel  # 默认保留已有关系

    def _detect_conflict_type(
        self, rel1: Relation, rel2: Relation
    ) -> str:
        """检测冲突类型"""
        # 同一对实体
        same_pair = (
            (rel1.source == rel2.source and rel1.target == rel2.target) or
            (rel1.source == rel2.target and rel1.target == rel2.source)
        )
        if not same_pair:
            return "none"

        # 类型冲突
        if rel1.type != rel2.type:
            return "type_conflict"

        # 事实冲突（描述矛盾）
        if (rel1.description and rel2.description and
                rel1.description != rel2.description):
            # 使用 LLM 判断是否矛盾
            if self.llm_func:
                if self._is_contradictory(rel1.description, rel2.description):
                    return "fact_conflict"
            return "attribute_conflict"

        return "none"

    def _resolve_type_conflict(
        self, rel1: Relation, rel2: Relation
    ) -> Relation:
        """解决关系类型冲突"""
        # 基于置信度选择
        if rel1.confidence > rel2.confidence + 0.1:
            return rel1
        elif rel2.confidence > rel1.confidence + 0.1:
            return rel2
        else:
            # 置信度相近时，使用 LLM 判断
            if self.llm_func:
                return self._llm_resolve_type(rel1, rel2)
            # 默认保留置信度更高的
            return rel1 if rel1.confidence >= rel2.confidence else rel2

    def _resolve_attribute_conflict(
        self, rel1: Relation, rel2: Relation
    ) -> Relation:
        """解决属性冲突"""
        # 合并描述信息
        merged = Relation(
            source=rel1.source,
            target=rel1.target,
            type=rel1.type,
            description=f"{rel1.description}（来源1）；{rel2.description}（来源2）",
            confidence=max(rel1.confidence, rel2.confidence),
            source_doc=f"{rel1.source_doc}; {rel2.source_doc}",
            timestamp=max(rel1.timestamp, rel2.timestamp)
        )
        return merged

    def _resolve_fact_conflict(
        self, rel1: Relation, rel2: Relation
    ) -> Relation:
        """解决事实冲突"""
        # 基于置信度和时间戳
        if rel1.confidence > rel2.confidence:
            return rel1
        elif rel2.confidence > rel1.confidence:
            return rel2
        else:
            # 置信度相同时，选择更新的信息
            return rel1 if rel1.timestamp >= rel2.timestamp else rel2

    def _is_contradictory(self, desc1: str, desc2: str) -> bool:
        """使用 LLM 判断两个描述是否矛盾"""
        prompt = f"""判断以下两个描述是否矛盾（仅回答"是"或"否"）：
        描述1：{desc1}
        描述2：{desc2}"""
        # 实际调用 LLM
        return False  # 简化实现

    def _llm_resolve_type(
        self, rel1: Relation, rel2: Relation
    ) -> Relation:
        """使用 LLM 解决类型冲突"""
        prompt = f"""实体"{rel1.source}"和"{rel1.target}"之间存在两种关系描述：
        1. 类型：{rel1.type}，描述：{rel1.description}
        2. 类型：{rel2.type}，描述：{rel2.description}
        请判断哪种关系更准确，并给出理由。"""
        # 实际调用 LLM
        return rel1  # 简化实现

    def _merge_compatible_relations(
        self, rel1: Relation, rel2: Relation
    ) -> Relation:
        """合并兼容的关系"""
        return Relation(
            source=rel1.source,
            target=rel1.target,
            type=rel1.type,
            description=(
                f"{rel1.description}；{rel2.description}"
                if rel1.description != rel2.description
                else rel1.description
            ),
            confidence=max(rel1.confidence, rel2.confidence),
            source_doc=f"{rel1.source_doc}; {rel2.source_doc}",
            timestamp=max(rel1.timestamp, rel2.timestamp),
            metadata={**(rel1.metadata or {}), **(rel2.metadata or {})}
        )
```

### 6.4.3 基于 LLM 的智能冲突解决

对于复杂的关系冲突，可以引入 LLM 进行智能判断：

```python
class LLMConflictResolver(ConflictResolver):
    """基于 LLM 的智能冲突解决器"""

    def __init__(self, llm_func):
        super().__init__(llm_func)
        self.llm_func = llm_func

    async def resolve_with_llm(
        self, existing_rel: Relation, new_rel: Relation,
        context: str = ""
    ) -> Relation:
        """使用 LLM 进行智能冲突解决"""
        prompt = f"""你是一个知识图谱维护专家。现有关系和新关系之间存在冲突，请分析并给出解决方案。

        上下文信息：
        {context}

        现有关系：
        - 源实体：{existing_rel.source}
        - 目标实体：{existing_rel.target}
        - 关系类型：{existing_rel.type}
        - 描述：{existing_rel.description}
        - 置信度：{existing_rel.confidence}
        - 来源：{existing_rel.source_doc}

        新关系：
        - 源实体：{new_rel.source}
        - 目标实体：{new_rel.target}
        - 关系类型：{new_rel.type}
        - 描述：{new_rel.description}
        - 置信度：{new_rel.confidence}
        - 来源：{new_rel.source_doc}

        请按以下 JSON 格式输出解决方案：
        {{
            "decision": "keep_existing" | "use_new" | "merge",
            "reason": "决策理由",
            "merged_relation": {{
                "type": "合并后的关系类型",
                "description": "合并后的描述",
                "confidence": 0.95
            }}
        }}
        """
        response = await self.llm_func(prompt)
        try:
            decision = json.loads(response)
            if decision["decision"] == "keep_existing":
                return existing_rel
            elif decision["decision"] == "use_new":
                return new_rel
            elif decision["decision"] == "merge":
                merged_data = decision["merged_relation"]
                return Relation(
                    source=existing_rel.source,
                    target=existing_rel.target,
                    type=merged_data["type"],
                    description=merged_data["description"],
                    confidence=merged_data["confidence"],
                    source_doc=f"{existing_rel.source_doc}; {new_rel.source_doc}",
                    timestamp=max(existing_rel.timestamp, new_rel.timestamp)
                )
        except (json.JSONDecodeError, KeyError):
            # LLM 输出解析失败，回退到基于规则的策略
            return super().resolve_conflict(existing_rel, new_rel)
```

### 6.4.4 关系版本控制

对于需要审计追踪的场景，可以实现关系版本控制：

```python
@dataclass
class RelationVersion:
    """关系版本快照"""
    relation: Relation
    version: int
    action: str  # "create", "update", "merge", "delete"
    timestamp: float
    reason: str


class VersionedRelationStore:
    """带版本控制的关系存储"""

    def __init__(self):
        self.relations: Dict[str, Relation] = {}  # key: "source|target|type"
        self.versions: Dict[str, List[RelationVersion]] = {}
        self.current_version = 0

    def _make_key(self, source: str, target: str, rel_type: str) -> str:
        return f"{source}|{target}|{rel_type}"

    def add_or_update(
        self, relation: Relation, reason: str = ""
    ) -> RelationVersion:
        """添加或更新关系，并记录版本"""
        key = self._make_key(
            relation.source, relation.target, relation.type
        )

        self.current_version += 1
        action = "create" if key not in self.relations else "update"

        if key in self.relations:
            existing = self.relations[key]
            resolver = ConflictResolver()
            merged = resolver.resolve_conflict(existing, relation)
            self.relations[key] = merged
            action = "merge" if merged != existing else "update"
        else:
            self.relations[key] = relation

        version = RelationVersion(
            relation=self.relations[key],
            version=self.current_version,
            action=action,
            timestamp=relation.timestamp,
            reason=reason
        )

        if key not in self.versions:
            self.versions[key] = []
        self.versions[key].append(version)

        return version

    def get_history(
        self, source: str, target: str, rel_type: str
    ) -> List[RelationVersion]:
        """获取关系的历史版本"""
        key = self._make_key(source, target, rel_type)
        return self.versions.get(key, [])

    def rollback(self, source: str, target: str, rel_type: str,
                 target_version: int) -> bool:
        """回滚到指定版本"""
        key = self._make_key(source, target, rel_type)
        history = self.versions.get(key, [])

        for version in history:
            if version.version == target_version:
                self.relations[key] = version.relation
                return True

        return False
```

---

## 6.5 图结构优化

### 6.5.1 图规模膨胀问题

随着增量更新的持续进行，图结构会面临以下问题：

1. **节点膨胀**：即使经过去重，节点数量仍会持续增长
2. **边密度增加**：实体间关系增多，图密度上升，检索效率下降
3. **信息冗余**：低价值实体和关系占用存储空间
4. **检索退化**：图规模过大时，路径搜索和子图匹配的延迟显著增加

### 6.5.2 图剪枝策略

图剪枝是移除低价值节点和边以控制图规模的核心技术：

```python
class GraphPruner:
    """图结构剪枝器"""

    def __init__(self, graph: nx.Graph):
        self.graph = graph

    def prune_low_degree_nodes(self, min_degree: int = 2) -> int:
        """移除度低于阈值的节点"""
        nodes_to_remove = [
            node for node, degree in self.graph.degree()
            if degree < min_degree
        ]
        self.graph.remove_nodes_from(nodes_to_remove)
        return len(nodes_to_remove)

    def prune_low_weight_edges(self, min_weight: float = 0.3) -> int:
        """移除权重低于阈值的边"""
        edges_to_remove = []
        for u, v, data in self.graph.edges(data=True):
            weight = data.get("weight", 1.0)
            if weight < min_weight:
                edges_to_remove.append((u, v))

        self.graph.remove_edges_from(edges_to_remove)
        return len(edges_to_remove)

    def prune_by_entity_type(self, keep_types: set) -> int:
        """仅保留指定类型的实体节点"""
        nodes_to_remove = []
        for node, data in self.graph.nodes(data=True):
            if data.get("type", "unknown") not in keep_types:
                nodes_to_remove.append(node)

        self.graph.remove_nodes_from(nodes_to_remove)
        return len(nodes_to_remove)

    def prune_low_centrality_nodes(self, percentile: float = 0.1) -> int:
        """移除中心性最低的节点"""
        centrality = nx.degree_centrality(self.graph)
        threshold = sorted(centrality.values())[
            int(len(centrality) * percentile)
        ]
        nodes_to_remove = [
            node for node, cent in centrality.items()
            if cent <= threshold
        ]
        self.graph.remove_nodes_from(nodes_to_remove)
        return len(nodes_to_remove)

    def smart_prune(
        self,
        min_degree: int = 2,
        min_edge_weight: float = 0.3,
        keep_types: set = None
    ) -> dict:
        """智能剪枝：综合多种策略"""
        stats = {}

        # 1. 按实体类型过滤
        if keep_types:
            removed = self.prune_by_entity_type(keep_types)
            stats["by_type"] = removed

        # 2. 移除低度节点
        removed = self.prune_low_degree_nodes(min_degree)
        stats["low_degree"] = removed

        # 3. 移除低权重边
        removed = self.prune_low_weight_edges(min_edge_weight)
        stats["low_weight_edges"] = removed

        # 4. 移除低中心性节点
        removed = self.prune_low_centrality_nodes(0.05)
        stats["low_centrality"] = removed

        stats["remaining_nodes"] = self.graph.number_of_nodes()
        stats["remaining_edges"] = self.graph.number_of_edges()

        return stats
```

### 6.5.3 图压缩与重构

除了剪枝，图压缩和周期性重构也是重要的优化手段：

```python
class GraphOptimizer:
    """图结构优化器"""

    def __init__(self, graph: nx.Graph):
        self.graph = graph

    def compress_entity_clusters(self, similarity_threshold: float = 0.8):
        """将高度相似的实体聚类为超节点"""
        # 基于嵌入相似度聚类
        nodes = list(self.graph.nodes(data=True))
        clusters = []
        assigned = set()

        for i, (name_i, data_i) in enumerate(nodes):
            if name_i in assigned:
                continue

            cluster = [name_i]
            assigned.add(name_i)

            for j, (name_j, _) in enumerate(nodes[i+1:], i+1):
                if name_j in assigned:
                    continue

                # 计算 Jaccard 相似度（基于共同邻居）
                neighbors_i = set(self.graph.neighbors(name_i))
                neighbors_j = set(self.graph.neighbors(name_j))
                if len(neighbors_i) > 0 and len(neighbors_j) > 0:
                    jaccard = len(neighbors_i & neighbors_j) / \
                              len(neighbors_i | neighbors_j)
                    if jaccard > similarity_threshold:
                        cluster.append(name_j)
                        assigned.add(name_j)

            if len(cluster) > 1:
                clusters.append(cluster)

        # 将每个聚类合并为超节点
        for cluster in clusters:
            self._merge_to_supernode(cluster)

        return len(clusters)

    def _merge_to_supernode(self, cluster: List[str]):
        """将一组节点合并为超节点"""
        super_name = f"super_{'_'.join(cluster[:3])}"

        # 收集所有邻居
        all_neighbors = set()
        for node in cluster:
            all_neighbors.update(self.graph.neighbors(node))
        all_neighbors -= set(cluster)

        # 添加超节点
        self.graph.add_node(super_name, type="super_node",
                            members=cluster)

        # 连接超节点到外部邻居
        for neighbor in all_neighbors:
            self.graph.add_edge(super_name, neighbor,
                                weight=1.0)

        # 删除原节点
        self.graph.remove_nodes_from(cluster)

    def rebuild_graph_structure(self):
        """重构图结构：优化边权重和节点属性"""
        # 1. 归一化边权重
        weights = [
            data.get("weight", 1.0)
            for _, _, data in self.graph.edges(data=True)
        ]
        if weights:
            max_weight = max(weights)
            min_weight = min(weights)
            if max_weight > min_weight:
                for u, v, data in self.graph.edges(data=True):
                    w = data.get("weight", 1.0)
                    data["weight"] = (w - min_weight) / (max_weight - min_weight)

        # 2. 更新节点度属性
        for node in self.graph.nodes():
            self.graph.nodes[node]["degree"] = self.graph.degree(node)

    def periodic_maintenance(
        self,
        prune_config: dict = None,
        compress: bool = True,
        rebuild: bool = True
    ) -> dict:
        """定期维护：综合优化"""
        stats = {}

        # 剪枝
        if prune_config:
            pruner = GraphPruner(self.graph)
            prune_stats = pruner.smart_prune(**prune_config)
            stats["prune"] = prune_stats

        # 压缩
        if compress:
            clusters = self.compress_entity_clusters()
            stats["compressed_clusters"] = clusters

        # 重构
        if rebuild:
            self.rebuild_graph_structure()
            stats["rebuild"] = True

        stats["final_nodes"] = self.graph.number_of_nodes()
        stats["final_edges"] = self.graph.number_of_edges()

        return stats
```

### 6.5.4 增量维护调度器

将上述所有维护操作整合到一个可配置的调度器中：

```python
import time
from enum import Enum
from dataclasses import dataclass


class MaintenanceLevel(Enum):
    """维护级别"""
    LIGHT = "light"      # 仅去重
    MEDIUM = "medium"    # 去重 + 剪枝
    FULL = "full"        # 去重 + 剪枝 + 压缩 + 重构


@dataclass
class MaintenanceConfig:
    """维护配置"""
    level: MaintenanceLevel = MaintenanceLevel.MEDIUM
    entity_dedup_threshold: float = 0.85
    min_degree: int = 2
    min_edge_weight: float = 0.3
    compress_clusters: bool = True
    rebuild_weights: bool = True
    # 自动维护触发条件
    max_nodes_before_maintenance: int = 10000
    max_edges_before_maintenance: int = 50000
    maintenance_interval_hours: float = 24.0


class IncrementalMaintenanceScheduler:
    """增量维护调度器"""

    def __init__(
        self,
        graph: nx.Graph,
        config: MaintenanceConfig = None
    ):
        self.graph = graph
        self.config = config or MaintenanceConfig()
        self.last_maintenance_time = time.time()
        self.maintenance_count = 0

    def should_run_maintenance(self) -> bool:
        """判断是否需要执行维护"""
        # 基于图规模
        if self.graph.number_of_nodes() >= \
                self.config.max_nodes_before_maintenance:
            return True
        if self.graph.number_of_edges() >= \
                self.config.max_edges_before_maintenance:
            return True

        # 基于时间间隔
        elapsed = (time.time() - self.last_maintenance_time) / 3600
        if elapsed >= self.config.maintenance_interval_hours:
            return True

        return False

    def run_maintenance(self) -> dict:
        """执行维护"""
        stats = {
            "timestamp": time.time(),
            "level": self.config.level.value,
            "before_nodes": self.graph.number_of_nodes(),
            "before_edges": self.graph.number_of_edges()
        }

        # 1. 实体去重
        dedup = EntityDeduplicator(
            name_similarity_threshold=self.config.entity_dedup_threshold
        )
        merger = GraphEntityMerger(self.graph, dedup)
        merged_count = merger.find_and_merge_duplicates()
        stats["merged_entities"] = merged_count

        # 2. 图优化（根据级别）
        optimizer = GraphOptimizer(self.graph)

        if self.config.level in [MaintenanceLevel.MEDIUM,
                                  MaintenanceLevel.FULL]:
            pruner = GraphPruner(self.graph)
            prune_stats = pruner.smart_prune(
                min_degree=self.config.min_degree,
                min_edge_weight=self.config.min_edge_weight
            )
            stats["prune"] = prune_stats

        if self.config.level == MaintenanceLevel.FULL:
            if self.config.compress_clusters:
                clusters = optimizer.compress_entity_clusters()
                stats["compressed_clusters"] = clusters

            if self.config.rebuild_weights:
                optimizer.rebuild_graph_structure()
                stats["rebuild"] = True

        stats["after_nodes"] = self.graph.number_of_nodes()
        stats["after_edges"] = self.graph.number_of_edges()
        stats["node_reduction"] = (
            (stats["before_nodes"] - stats["after_nodes"]) /
            max(stats["before_nodes"], 1) * 100
        )

        self.last_maintenance_time = time.time()
        self.maintenance_count += 1

        return stats
```

---

## 6.6 完整增量更新流水线

将本章所有组件整合为一个完整的增量更新流水线：

```python
class IncrementalPipeline:
    """完整的增量更新流水线"""

    def __init__(
        self,
        graph: nx.Graph,
        llm_func,
        embedding_func,
        config: MaintenanceConfig = None
    ):
        self.graph = graph
        self.llm_func = llm_func
        self.embedding_func = embedding_func
        self.config = config or MaintenanceConfig()
        self.scheduler = IncrementalMaintenanceScheduler(graph, config)
        self.dedup = EntityDeduplicator()
        self.conflict_resolver = LLMConflictResolver(llm_func)

    async def process_new_documents(
        self, documents: List[str]
    ) -> dict:
        """处理新文档的完整流水线"""
        pipeline_stats = {
            "total_docs": len(documents),
            "new_entities": 0,
            "merged_entities": 0,
            "new_relations": 0,
            "conflicts_resolved": 0
        }

        for doc in documents:
            # 步骤1：文本分块
            chunks = self._split_document(doc)

            for chunk in chunks:
                # 步骤2：提取实体
                new_entities = await self._extract_entities(chunk)

                # 步骤3：实体去重
                deduped_entities = []
                for entity in new_entities:
                    is_dup = False
                    for existing_node in self.graph.nodes(data=True):
                        name, data = existing_node
                        existing = Entity(
                            name=name,
                            type=data.get("type", "unknown"),
                            description=data.get("description", "")
                        )
                        same, _ = self.dedup.are_same_entity(
                            entity, existing
                        )
                        if same:
                            # 合并到已有节点
                            merger = EntityMerger()
                            merged = merger.merge_entities(
                                existing, entity
                            )
                            self.graph.nodes[name].update({
                                "description": merged.description,
                                "aliases": merged.aliases
                            })
                            pipeline_stats["merged_entities"] += 1
                            is_dup = True
                            break

                    if not is_dup:
                        deduped_entities.append(entity)

                # 步骤4：提取关系
                new_relations = await self._extract_relations(
                    chunk, deduped_entities
                )

                # 步骤5：关系冲突解决
                for rel in new_relations:
                    relation = Relation(
                        source=rel["source"],
                        target=rel["target"],
                        type=rel["type"],
                        description=rel.get("description", ""),
                        confidence=rel.get("confidence", 0.8)
                    )
                    self._resolve_and_add_relation(relation)
                    pipeline_stats["conflicts_resolved"] += 1

                # 步骤6：添加新实体到图
                for entity in deduped_entities:
                    self.graph.add_node(
                        entity.name,
                        type=entity.type,
                        description=entity.description
                    )
                    pipeline_stats["new_entities"] += 1

                # 步骤7：添加新关系到图
                for rel in new_relations:
                    if not self.graph.has_edge(
                        rel["source"], rel["target"]
                    ):
                        self.graph.add_edge(
                            rel["source"],
                            rel["target"],
                            type=rel["type"],
                            description=rel.get("description", ""),
                            weight=1.0
                        )
                        pipeline_stats["new_relations"] += 1

        # 步骤8：检查是否需要维护
        if self.scheduler.should_run_maintenance():
            maintenance_stats = self.scheduler.run_maintenance()
            pipeline_stats["maintenance"] = maintenance_stats

        return pipeline_stats

    def _split_document(self, doc: str) -> List[str]:
        """文档分块"""
        chunk_size = 1000
        return [doc[i:i+chunk_size]
                for i in range(0, len(doc), chunk_size)]

    async def _extract_entities(self, chunk: str) -> List[Entity]:
        """使用 LLM 提取实体"""
        prompt = f"""从以下文本中提取实体：
        文本：{chunk}
        返回 JSON 格式的实体列表，每个实体包含 name、type、description。"""
        response = await self.llm_func(prompt)
        try:
            data = json.loads(response)
            return [Entity(**e) for e in data]
        except:
            return []

    async def _extract_relations(
        self, chunk: str, entities: List[Entity]
    ) -> List[dict]:
        """使用 LLM 提取关系"""
        names = [e.name for e in entities]
        prompt = f"""从以下文本中提取实体间关系：
        文本：{chunk}
        实体：{names}
        返回 JSON 格式的关系列表。"""
        response = await self.llm_func(prompt)
        try:
            return json.loads(response)
        except:
            return []

    def _resolve_and_add_relation(self, new_rel: Relation):
        """解决冲突并添加关系"""
        # 查找已有关系
        for u, v, data in self.graph.edges(data=True):
            if (u == new_rel.source and v == new_rel.target) or \
               (u == new_rel.target and v == new_rel.source):
                existing = Relation(
                    source=u, target=v,
                    type=data.get("type", ""),
                    description=data.get("description", ""),
                    confidence=data.get("confidence", 1.0)
                )
                resolved = self.conflict_resolver.resolve_conflict(
                    existing, new_rel
                )
                self.graph.edges[(u, v)].update({
                    "type": resolved.type,
                    "description": resolved.description,
                    "confidence": resolved.confidence
                })
                return

        # 无冲突，直接添加
        self.graph.add_edge(
            new_rel.source, new_rel.target,
            type=new_rel.type,
            description=new_rel.description,
            confidence=new_rel.confidence,
            weight=1.0
        )
```

---

## 6.7 使用场景

### 6.7.1 新闻聚合与实时更新

新闻聚合系统需要持续摄入新文章，同时保持知识图谱的时效性：

```python
async def news_aggregation_pipeline():
    """新闻聚合场景的增量更新"""
    pipeline = IncrementalPipeline(
        graph=nx.Graph(),
        llm_func=None,  # 实际 LLM 函数
        embedding_func=None  # 实际嵌入函数
    )

    # 模拟持续流入的新闻
    news_feeds = [
        "英伟达发布新一代 Blackwell GPU，性能提升 2 倍...",
        "微软宣布 Azure AI 服务全面集成 GPT-4o...",
        "特斯拉 Q2 交付量超预期，股价上涨 5%...",
        "英伟达 Blackwell GPU 已获得多家云服务商订单...",
        "特斯拉与英伟达合作开发自动驾驶芯片..."
    ]

    for news in news_feeds:
        stats = await pipeline.process_new_documents([news])
        print(f"处理新闻完成: {stats}")

    # 查询最新关系
    query = "英伟达 Blackwell GPU 有哪些合作伙伴？"
    # 使用 LightRAG 检索
    print(f"查询: {query}")
```

### 6.7.2 企业知识库持续更新

企业知识库需要在不中断服务的情况下持续更新：

```python
class EnterpriseKnowledgeBase:
    """企业知识库持续更新系统"""

    def __init__(self, rag: LightRAG):
        self.rag = rag
        self.update_queue = []
        self.maintenance_config = MaintenanceConfig(
            level=MaintenanceLevel.MEDIUM,
            max_nodes_before_maintenance=50000,
            maintenance_interval_hours=12.0
        )

    async def add_documents(self, docs: List[str]):
        """添加文档到更新队列"""
        self.update_queue.extend(docs)

        # 批量处理
        batch_size = 10
        for i in range(0, len(self.update_queue), batch_size):
            batch = self.update_queue[:batch_size]
            self.update_queue = self.update_queue[batch_size:]

            for doc in batch:
                await self.rag.ainsert(doc)

            print(f"已处理 {min(i + batch_size, len(self.update_queue))} 篇文档")

    async def scheduled_maintenance(self):
        """定时维护任务"""
        while True:
            await asyncio.sleep(3600)  # 每小时检查一次
            # 检查并执行维护
            # self._run_maintenance()
```

---

## 6.8 潜在风险与注意事项

### 6.8.1 性能问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 增量插入慢 | LLM 调用频繁 | 使用批量插入、增加并发度 |
| 检索退化 | 图规模膨胀 | 定期剪枝和压缩 |
| 内存溢出 | 图结构过大 | 使用图数据库替代内存图 |
| 去重计算慢 | 全图扫描 | 使用索引加速匹配 |

### 6.8.2 数据一致性问题

```python
class ConsistencyChecker:
    """数据一致性检查器"""

    def __init__(self, graph: nx.Graph):
        self.graph = graph

    def check_consistency(self) -> List[str]:
        """检查图结构的一致性"""
        issues = []

        # 1. 检查悬空引用
        for u, v in self.graph.edges():
            if not self.graph.has_node(u):
                issues.append(f"边 ({u}, {v}) 引用了不存在的源节点 {u}")
            if not self.graph.has_node(v):
                issues.append(f"边 ({u}, {v}) 引用了不存在的目标节点 {v}")

        # 2. 检查孤立节点
        for node in self.graph.nodes():
            if self.graph.degree(node) == 0:
                issues.append(f"节点 {node} 是孤立节点")

        # 3. 检查重复边
        edge_count = {}
        for u, v in self.graph.edges():
            key = (min(u, v), max(u, v))
            edge_count[key] = edge_count.get(key, 0) + 1
        for (u, v), count in edge_count.items():
            if count > 1:
                issues.append(f"节点 {u} 和 {v} 之间存在 {count} 条重复边")

        return issues
```

### 6.8.3 常见陷阱

1. **过度去重**：将本应不同的实体错误合并，导致信息丢失。建议设置保守的相似度阈值（0.85+），并对高风险的合并操作进行人工审核。

2. **级联删除**：删除实体时未正确处理关联关系，导致悬空引用。始终使用图数据库的事务机制或实现级联删除逻辑。

3. **维护频率过高**：频繁的全量维护会消耗大量计算资源。建议根据图规模增长率动态调整维护频率。

4. **忽略时间衰减**：旧信息可能随时间变得不准确。引入时间衰减因子，降低旧关系的权重。

---

## 6.9 本章小结

增量更新与图维护是 LightRAG 在生产环境中长期稳定运行的关键保障。本章涵盖的核心要点：

1. **增量添加文档**：通过局部化处理，新文档的加入只影响图中局部区域，无需重建全量索引。批量插入和并发控制是提升吞吐量的关键。

2. **实体去重与合并**：基于多维度相似度（名称、嵌入、描述）的实体匹配，配合智能合并策略，有效控制图节点膨胀。去重阈值的选择需要在精确率和召回率之间权衡。

3. **关系更新与冲突解决**：新文档可能引入与已有关系矛盾的信息，需要基于置信度、时间戳和 LLM 判断的冲突解决策略。版本控制为审计和回滚提供了保障。

4. **图结构优化**：剪枝、压缩和周期性重构是控制图规模、维持检索效率的核心手段。维护调度器根据图规模和时间间隔自动触发维护操作。

增量更新不是一次性工作，而是伴随知识库全生命周期的持续过程。一个设计良好的增量维护系统，应该能够在保证数据一致性的前提下，自动平衡更新效率、存储成本和检索质量三者之间的关系。在实际部署中，建议从简单的去重和剪枝策略开始，根据图规模的增长曲线逐步引入更复杂的优化手段。
