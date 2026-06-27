# 第12章 Neptune + DeepSeek 集成架构

## 12.1 概述

大语言模型（LLM）的快速发展为企业知识管理带来了革命性机遇，但同时也暴露出大模型在专业领域知识、实时数据、私有数据等方面的固有局限。知识图谱（Knowledge Graph）作为结构化知识表示的核心技术，与LLM的结合正在重塑企业级智能应用的架构范式。

本章聚焦于 **Amazon Neptune** 图数据库与 **DeepSeek** 大语言模型的深度集成架构，系统阐述如何构建一个具备图增强检索能力（Graph RAG）的企业级知识问答系统。我们将从模型选型、架构设计、核心原理、代码实现到生产部署，提供完整的工程化指南。

### 12.1.1 为什么是 Neptune + DeepSeek？

| 维度 | Neptune | DeepSeek |
|------|---------|----------|
| 定位 | 托管图数据库，支持 RDF 与 Property Graph | 高性能大语言模型，MoE 架构 |
| 核心能力 | 子图检索、SPARQL/Gremlin 查询、向量存储 | 128K 上下文、深度推理、代码生成 |
| 集成价值 | 作为 LLM 的外部结构化记忆 | 提供自然语言理解与生成能力 |

两者结合的核心价值在于：Neptune 弥补了 LLM 在结构化知识检索上的不足，DeepSeek 弥补了传统图查询在自然语言交互上的门槛。

### 12.1.2 本章目标

- 理解 DeepSeek 模型家族的能力边界与选型策略
- 掌握 Neptune + DeepSeek 集成架构的设计原则
- 深入 Graph RAG 原理并实现完整 pipeline
- 学会使用知识图谱作为 LLM 的外部记忆
- 掌握向量搜索与混合检索的工程实现
- 熟悉 LangChain、LlamaIndex 等框架的集成模式

---

## 12.2 DeepSeek 模型概述

### 12.2.1 解决的问题

企业在选择 LLM 时面临三个核心问题：**推理能力是否足够**、**上下文窗口能否覆盖业务场景**、**成本是否可控**。DeepSeek 系列模型在这三个维度上提供了具有竞争力的解决方案。

### 12.2.2 核心原理

#### DeepSeek-V2 架构

DeepSeek-V2 采用 **MoE（Mixture of Experts）** 架构，核心创新包括：

- **Multi-head Latent Attention (MLA)**：将 Key-Value 缓存压缩为低维潜在向量，显著降低推理时的显存占用
- **DeepSeekMoE**：每个 token 仅激活部分专家网络，在保持模型容量的同时控制计算成本
- **128K 上下文窗口**：支持长文档、多轮对话、大规模知识库的上下文理解

```
输入 Token
    │
    ▼
┌─────────────────────┐
│  Shared Expert      │  ← 所有 token 共享
├─────────────────────┤
│  Routed Experts     │  ← 每个 token 激活 top-k 个
│  ┌───┐ ┌───┐ ┌───┐ │
│  │E1 │ │E2 │ │E3 │...│
│  └───┘ └───┘ └───┘ │
├─────────────────────┤
│  MLA Attention      │  ← 低维 KV 缓存
└─────────────────────┘
    │
    ▼
  输出
```

#### DeepSeek-V3 增强

V3 在 V2 基础上进一步优化：

- **671B 总参数量，37B 激活参数**：在推理时仅激活约 5.5% 的参数
- **Multi-Token Prediction (MTP)**：同时预测多个后续 token，提升推理速度
- **FP8 混合精度训练**：降低训练成本约 42%
- **强化学习对齐**：在数学推理、代码生成等任务上表现优异

#### API 访问方式

DeepSeek 提供两种访问方式：

**REST API（推荐）**

```bash
# 基础调用
curl https://api.deepseek.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "system", "content": "你是一个知识图谱专家。"},
      {"role": "user", "content": "解释什么是 Graph RAG？"}
    ],
    "temperature": 0.7,
    "max_tokens": 2048
  }'
```

**Python SDK**

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-deepseek-api-key",
    base_url="https://api.deepseek.com/v1"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "你是一个知识图谱专家。"},
        {"role": "user", "content": "解释什么是 Graph RAG？"}
    ],
    temperature=0.7,
    max_tokens=2048
)

print(response.choices[0].message.content)
```

#### 模型选择指南

| 场景 | 推荐模型 | 理由 |
|------|---------|------|
| 复杂推理、数学、代码 | DeepSeek-V3 | 更强的推理能力，MTP 加速 |
| 长文档分析、知识问答 | DeepSeek-V2 | 128K 上下文，性价比高 |
| 实时对话、简单查询 | DeepSeek-V2 (lite) | 低延迟，低成本 |
| 批量离线处理 | DeepSeek-V2 | 吞吐量优先 |

**成本对比**（以 2025 年公开价格为准）：

| 模型 | 输入价格（/1M tokens） | 输出价格（/1M tokens） |
|------|----------------------|----------------------|
| DeepSeek-V2 | ¥0.14 | ¥0.28 |
| DeepSeek-V3 | ¥0.28 | ¥1.10 |
| GPT-4o | ¥10.00 | ¥30.00 |

### 12.2.3 代码/配置实现

**环境配置**

```python
# config.py
import os
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class DeepSeekConfig:
    api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-chat"  # deepseek-chat = V2, deepseek-reasoner = V3
    temperature: float = 0.1
    max_tokens: int = 2048
    top_p: float = 0.9
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0

@dataclass
class NeptuneConfig:
    host: str = os.getenv("NEPTUNE_HOST", "your-neptune-endpoint")
    port: int = 8182
    region: str = os.getenv("AWS_REGION", "us-east-1")
    use_iam: bool = True
    graph_type: str = "property_graph"  # property_graph | rdf
```

**DeepSeek 客户端封装**

```python
# deepseek_client.py
from openai import OpenAI
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class DeepSeekClient:
    def __init__(self, config: DeepSeekConfig):
        self.config = config
        self.client = OpenAI(
            api_key=config.api_key,
            base_url=config.base_url
        )

    def chat(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        stream: bool = False
    ) -> str:
        if system_prompt:
            messages = [
                {"role": "system", "content": system_prompt}
            ] + messages

        try:
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                top_p=self.config.top_p,
                frequency_penalty=self.config.frequency_penalty,
                presence_penalty=self.config.presence_penalty,
                stream=stream
            )

            if stream:
                return self._handle_stream(response)
            return response.choices[0].message.content

        except Exception as e:
            logger.error(f"DeepSeek API call failed: {e}")
            raise

    def _handle_stream(self, response) -> str:
        collected = []
        for chunk in response:
            if chunk.choices[0].delta.content:
                collected.append(chunk.choices[0].delta.content)
        return "".join(collected)

    def generate_embedding(self, text: str) -> List[float]:
        response = self.client.embeddings.create(
            model="text-embedding-ada-002",
            input=text
        )
        return response.data[0].embedding
```

### 12.2.4 使用场景

- **企业知识库问答**：利用 128K 上下文处理完整的技术文档
- **代码审查与生成**：V3 的代码能力适合自动化代码分析
- **多轮对话系统**：结合 Neptune 知识图谱实现上下文感知的对话
- **批量文档分析**：低成本 API 适合大规模离线处理

### 12.2.5 潜在风险与注意事项

1. **API 限流**：DeepSeek API 有速率限制，生产环境需实现退避重试
2. **上下文窗口管理**：128K 上下文虽大，但过长输入会增加延迟和成本，应配合检索策略使用
3. **模型幻觉**：即使是最强模型也可能产生幻觉，必须结合 Neptune 知识图谱进行事实校验
4. **数据安全**：敏感数据不应直接发送到外部 API，建议使用私有部署或数据脱敏

### 12.2.6 本章小结

DeepSeek 系列模型以 MoE 架构实现了高性能与低成本的平衡。V2 适合通用知识问答，V3 适合复杂推理任务。通过 REST API 或 Python SDK 可快速集成，128K 上下文窗口为知识图谱增强检索提供了充足的空间。选择模型时需根据任务复杂度、延迟要求和预算进行权衡。

---

## 12.3 集成架构设计

### 12.3.1 解决的问题

单独使用 LLM 或知识图谱都存在明显短板：

- **纯 LLM 方案**：无法访问私有数据、知识截止于训练数据、存在幻觉
- **纯知识图谱方案**：需要专业查询语言（SPARQL/Gremlin）、缺乏自然语言理解、无法生成连贯回答

集成架构的目标是：**让 LLM 理解自然语言问题，从知识图谱中检索精确的结构化信息，再生成带有知识依据的回答**。

### 12.3.2 核心原理

#### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (Application Layer)              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Web 前端     │  │ API 网关     │  │ 管理控制台     │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
┌─────────▼─────────────────▼──────────────────▼──────────┐
│                  编排层 (Orchestration Layer)              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ LangChain    │  │ LlamaIndex   │  │ 自定义中间件   │  │
│  │ 集成模块     │  │ 集成模块     │  │ (FastAPI)     │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
┌─────────▼─────────────────▼──────────────────▼──────────┐
│                   增强检索层 (Augmented Retrieval Layer)   │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 查询理解     │  │ 混合检索     │  │ 结果重排序    │  │
│  │ (NL→GraphQL)│  │ (图+向量)    │  │ (Reranker)    │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
┌─────────▼─────────────────▼──────────────────▼──────────┐
│                   数据层 (Data Layer)                      │
│  ┌─────────────────┐  ┌──────────────────────────────┐   │
│  │ Neptune 图数据库 │  │ 向量存储 (Neptune ML /     │   │
│  │ (RDF/Property   │  │ OpenSearch / pgvector)      │   │
│  │  Graph)         │  │                              │   │
│  └─────────────────┘  └──────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 缓存层 (Redis / ElastiCache)                     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
          │
┌─────────▼─────────────────────────────────────────────────┐
│                  模型层 (Model Layer)                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │ DeepSeek API / 私有部署                          │   │
│  │ (DeepSeek-V2 / V3 / Embedding)                   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### 数据流设计

完整的查询处理流程遵循 **Query → Retrieve → Augment → Generate** 四阶段模式：

```
用户问题
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 1: 查询理解 (Query Understanding)              │
│ • 实体识别：从自然语言中提取关键实体                  │
│ • 意图分类：判断是否需要图查询、向量检索或两者结合      │
│ • 查询改写：将自然语言转化为图查询语言（SPARQL/Gremlin）│
└──────────────────────┬──────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 2: 混合检索 (Hybrid Retrieval)                  │
│ • 图检索：从 Neptune 中检索子图/路径/邻居             │
│ • 向量检索：从向量存储中检索语义相似内容               │
│ • 缓存查询：检查 Redis 中是否有缓存结果               │
└──────────────────────┬──────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 3: 上下文增强 (Context Augmentation)            │
│ • 子图序列化：将子图转化为 LLM 可理解的文本描述        │
│ • 结果融合：图检索结果 + 向量检索结果 + 原始问题       │
│ • 上下文裁剪：确保不超过 DeepSeek 的上下文限制         │
└──────────────────────┬──────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 4: 答案生成 (Answer Generation)                 │
│ • Prompt 组装：系统指令 + 检索上下文 + 用户问题       │
│ • DeepSeek 调用：生成带有知识依据的回答               │
│ • 后处理：格式化、引用标注、缓存写入                  │
└──────────────────────┬──────────────────────────────┘
    │
    ▼
  最终回答
```

#### 缓存策略

合理的缓存策略可以显著降低延迟和 API 成本：

```python
# cache_strategy.py
import hashlib
import json
from typing import Optional, Any
import redis.asyncio as redis
from dataclasses import dataclass
from enum import Enum

class CacheLevel(Enum):
    NONE = 0       # 不缓存
    QUERY = 1      # 缓存查询结果（短 TTL）
    RESULT = 2     # 缓存最终回答（长 TTL）

@dataclass
class CacheConfig:
    redis_url: str = "redis://localhost:6379"
    query_cache_ttl: int = 300       # 5 分钟
    result_cache_ttl: int = 86400    # 24 小时
    max_cache_size: int = 10000

class NeptuneDeepSeekCache:
    def __init__(self, config: CacheConfig):
        self.config = config
        self.redis = redis.from_url(config.redis_url)

    def _hash_query(self, query: str, context: dict = None) -> str:
        content = json.dumps({"query": query, "context": context}, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()

    async def get_query_cache(self, query: str) -> Optional[dict]:
        key = f"query:{self._hash_query(query)}"
        data = await self.redis.get(key)
        return json.loads(data) if data else None

    async def set_query_cache(self, query: str, result: dict):
        key = f"query:{self._hash_query(query)}"
        await self.redis.setex(key, self.config.query_cache_ttl, json.dumps(result))

    async def get_result_cache(self, query: str, user_id: str = "") -> Optional[str]:
        key = f"result:{self._hash_query(query, {'user': user_id})}"
        return await self.redis.get(key)

    async def set_result_cache(self, query: str, answer: str, user_id: str = ""):
        key = f"result:{self._hash_query(query, {'user': user_id})}"
        await self.redis.setex(key, self.config.result_cache_ttl, answer)

    async def invalidate_by_pattern(self, pattern: str):
        """按模式失效缓存，在知识图谱更新时调用"""
        cursor = 0
        while True:
            cursor, keys = await self.redis.scan(cursor, match=pattern)
            if keys:
                await self.redis.delete(*keys)
            if cursor == 0:
                break
```

**缓存策略选择矩阵**：

| 场景 | 缓存级别 | TTL | 说明 |
|------|---------|-----|------|
| 高频常见问题 | RESULT | 24h | 直接返回缓存回答 |
| 时效性敏感查询 | QUERY | 5min | 缓存中间检索结果 |
| 个性化问题 | NONE | - | 不缓存，保证准确性 |
| 知识图谱更新后 | - | - | 失效相关缓存 |

### 12.3.3 代码/配置实现

**完整集成架构实现**

```python
# neptune_deepseek_pipeline.py
import asyncio
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)

@dataclass
class QueryResult:
    query: str
    subgraph_data: Optional[Dict] = None
    vector_results: Optional[List[Dict]] = None
    context_text: Optional[str] = None
    answer: Optional[str] = None
    sources: List[str] = field(default_factory=list)
    latency_ms: float = 0.0

class NeptuneDeepSeekPipeline:
    def __init__(
        self,
        neptune_client: Any,  # NeptuneGremlinClient or NeptuneSparqlClient
        deepseek_client: DeepSeekClient,
        cache: NeptuneDeepSeekCache,
        config: dict = None
    ):
        self.neptune = neptune_client
        self.deepseek = deepseek_client
        self.cache = cache
        self.config = config or {}

    async def query(self, user_query: str, use_cache: bool = True) -> QueryResult:
        import time
        start = time.time()
        result = QueryResult(query=user_query)

        # 1. 检查缓存
        if use_cache:
            cached = await self.cache.get_result_cache(user_query)
            if cached:
                result.answer = cached
                result.latency_ms = (time.time() - start) * 1000
                return result

        # 2. 查询理解 - 实体识别与意图分类
        entities = await self._extract_entities(user_query)
        intent = await self._classify_intent(user_query)

        # 3. 混合检索
        if intent.get("need_graph", True):
            subgraph = await self._retrieve_subgraph(entities)
            result.subgraph_data = subgraph

        if intent.get("need_vector", True):
            vectors = await self._vector_search(user_query)
            result.vector_results = vectors

        # 4. 上下文增强
        context = self._build_context(result)
        result.context_text = context

        # 5. 答案生成
        answer = await self._generate_answer(user_query, context)
        result.answer = answer

        # 6. 缓存结果
        if use_cache:
            await self.cache.set_result_cache(user_query, answer)

        result.latency_ms = (time.time() - start) * 1000
        return result

    async def _extract_entities(self, query: str) -> List[str]:
        """使用 DeepSeek 从查询中提取实体"""
        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
从以下问题中提取关键实体（人名、组织名、产品名、技术术语等），
以逗号分隔的列表形式返回：

问题：{query}

实体列表：
"""}
            ],
            system_prompt="你是一个实体识别助手。只返回实体列表，不要其他内容。"
        )
        return [e.strip() for e in response.split(",") if e.strip()]

    async def _classify_intent(self, query: str) -> Dict[str, bool]:
        """判断查询是否需要图检索和/或向量检索"""
        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
判断以下问题是否需要：
1. 图数据库检索（涉及实体关系、层级结构、路径查询）
2. 向量语义检索（涉及概念匹配、相似内容查找）

以 JSON 格式返回：{{"need_graph": bool, "need_vector": bool}}

问题：{query}
"""}
            ],
            system_prompt="你是一个查询意图分类器。只返回 JSON。"
        )
        import json
        try:
            return json.loads(response)
        except:
            return {"need_graph": True, "need_vector": True}

    async def _retrieve_subgraph(self, entities: List[str]) -> Dict:
        """从 Neptune 检索相关子图"""
        # 具体实现见 12.4 节
        pass

    async def _vector_search(self, query: str) -> List[Dict]:
        """执行向量语义搜索"""
        # 具体实现见 12.7 节
        pass

    def _build_context(self, result: QueryResult) -> str:
        """将检索结果组装为 LLM 上下文"""
        parts = []

        if result.subgraph_data:
            parts.append("【知识图谱上下文】")
            parts.append(self._serialize_subgraph(result.subgraph_data))

        if result.vector_results:
            parts.append("【语义相似内容】")
            for i, doc in enumerate(result.vector_results[:5], 1):
                parts.append(f"{i}. {doc.get('content', '')}")

        return "\n\n".join(parts)

    def _serialize_subgraph(self, subgraph: Dict) -> str:
        """将子图序列化为文本"""
        lines = []
        for node in subgraph.get("nodes", []):
            lines.append(f"实体：{node['label']}（类型：{node['type']}）")
        for edge in subgraph.get("edges", []):
            lines.append(f"关系：{edge['source']} --[{edge['relation']}]--> {edge['target']}")
        return "\n".join(lines)

    async def _generate_answer(self, query: str, context: str) -> str:
        """使用 DeepSeek 生成最终回答"""
        system_prompt = """你是一个基于知识图谱的企业知识助手。你的回答必须：
1. 严格基于提供的知识图谱上下文，不要编造事实
2. 如果上下文不足以回答问题，明确说明
3. 在回答中引用知识图谱中的实体和关系
4. 使用专业但易懂的语言"""

        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
上下文信息：
{context}

用户问题：{query}

请基于以上上下文回答问题：
"""}
            ],
            system_prompt=system_prompt
        )
        return response
```

### 12.3.4 使用场景

- **企业智能客服**：结合产品知识图谱，提供精准的产品咨询
- **科研文献分析**：从论文知识图谱中检索相关研究，生成综述
- **金融风控决策**：查询企业关联关系图谱，辅助风险评估
- **医疗辅助诊断**：结合医学知识图谱，提供诊断建议

### 12.3.5 潜在风险与注意事项

1. **延迟控制**：完整 pipeline 涉及多次 API 调用，端到端延迟可能超过 5 秒，需设计异步流式响应
2. **错误传播**：任一环节失败（Neptune 超时、DeepSeek 限流）都会影响整体可用性，需实现优雅降级
3. **上下文窗口管理**：检索结果可能超过 DeepSeek 的上下文限制，需实现智能裁剪
4. **成本控制**：每次查询可能消耗数千 token，高频场景下需优化检索策略

### 12.3.6 本章小结

Neptune + DeepSeek 集成架构采用四层设计：数据层（Neptune + 向量存储）、增强检索层（混合检索）、编排层（LangChain/LlamaIndex）、应用层。数据流遵循 Query → Retrieve → Augment → Generate 四阶段模式，配合多级缓存策略（查询缓存 + 结果缓存），在保证回答质量的同时控制延迟和成本。架构的核心设计原则是：让 Neptune 负责精确的结构化知识检索，让 DeepSeek 负责自然语言理解和生成，两者互补而非替代。

---

## 12.4 Graph RAG（图增强检索增强生成）

### 12.4.1 解决的问题

#### 传统 RAG 的三大局限

**局限一：平面检索（Flat Retrieval）**

传统 RAG 将文档切分为独立块（chunk），每个块之间没有关系信息。当问题涉及多个实体之间的关联时，检索到的块可能只包含部分信息，导致回答不完整。

```
传统 RAG 检索结果：
┌──────────────────┐
│ Chunk 1: "A公司   │
│ 开发了 X产品"    │
├──────────────────┤
│ Chunk 2: "B公司   │
│ 是 A公司的竞对"   │
├──────────────────┤
│ Chunk 3: "X产品   │
│ 使用 Y技术"      │
└──────────────────┘
→ LLM 需要自行推断 A公司、B公司、X产品、Y技术之间的关系
→ 容易遗漏或错误连接
```

**局限二：无关系感知（No Relationship Awareness）**

传统 RAG 无法回答涉及多跳关系的问题，如"X产品的竞对公司开发了什么类似产品？"——这需要跨越"X产品 → A公司 → 竞对 → B公司 → 产品"的关系链。

**局限三：上下文碎片化（Context Fragmentation）**

相关但分散在不同文档块中的信息被割裂，LLM 难以从碎片化信息中重建完整的知识图景。

#### Graph RAG 的解决方案

Graph RAG 将知识图谱作为检索的中间表示层，在检索阶段就保留实体之间的关系结构，为 LLM 提供结构化的上下文。

### 12.4.2 核心原理

#### 图增强检索的优势

1. **子图检索保留关系**：检索结果是一个连通子图，实体之间的关系被完整保留
2. **多跳推理**：通过图遍历实现 2-3 跳的关系推理
3. **结构化上下文**：序列化后的子图为 LLM 提供清晰的知识结构
4. **可解释性**：回答可以追溯到具体的实体和关系路径

#### Retrieval-Augment-Generate Pipeline

```
自然语言问题
    │
    ▼
┌─────────────────────────────────────────────┐
│ 步骤 1: 自然语言 → 图查询                    │
│                                             │
│ "X产品的竞对公司开发了什么类似产品？"          │
│    │                                         │
│    ▼                                         │
│ 实体识别: [X产品]                             │
│ 关系检测: [竞对公司, 开发, 类似产品]            │
│    │                                         │
│    ▼                                         │
│ Gremlin: g.V().has('name','X产品')           │
│   .out('竞对公司').out('开发').values('name') │
└──────────────────────┬──────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 步骤 2: 图查询 → 子图                        │
│                                             │
│ 查询结果:                                    │
│ ┌─────┐  竞对公司  ┌─────┐  开发  ┌───────┐ │
│ │X产品│ ────────→ │A公司│ ─────→ │Y产品  │ │
│ └─────┘           └─────┘       └───────┘ │
│                      │  开发                │
│                      └────────→ ┌───────┐  │
│                                 │Z产品   │  │
│                                 └───────┘  │
└──────────────────────┬──────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 步骤 3: 子图 → 上下文                        │
│                                             │
│ 序列化结果:                                   │
│ "X产品的竞对公司是A公司。                      │
│  A公司开发了Y产品和Z产品。"                    │
└──────────────────────┬──────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 步骤 4: 上下文 + 问题 → LLM → 答案          │
│                                             │
│ "X产品的竞对公司A公司开发了Y产品和Z产品，      │
│  其中Y产品与X产品功能类似..."                 │
└─────────────────────────────────────────────┘
```

#### 子图序列化策略

子图数据不能直接输入 LLM，需要转化为文本。以下是三种序列化策略：

```python
# subgraph_serializer.py
from typing import Dict, List

class SubgraphSerializer:
    """子图序列化器：将图结构转化为 LLM 可理解的文本"""

    @staticmethod
    def triple_serialization(subgraph: Dict) -> str:
        """三元组序列化：适用于 RDF 图"""
        lines = ["知识图谱三元组："]
        for triple in subgraph.get("triples", []):
            lines.append(f"  ({triple['subject']}) --[{triple['predicate']}]--> ({triple['object']})")
        return "\n".join(lines)

    @staticmethod
    def narrative_serialization(subgraph: Dict) -> str:
        """叙事序列化：生成自然语言描述"""
        lines = ["知识图谱上下文："]
        for node in subgraph.get("nodes", []):
            props = node.get("properties", {})
            desc = f"实体「{node['label']}」"
            if props:
                desc += "（" + "，".join(f"{k}: {v}" for k, v in props.items()) + "）"
            lines.append(f"  - {desc}")

        lines.append("\n实体关系：")
        for edge in subgraph.get("edges", []):
            lines.append(f"  - {edge['source']} 的 {edge['relation']} 是 {edge['target']}")

        return "\n".join(lines)

    @staticmethod
    def hierarchical_serialization(subgraph: Dict) -> str:
        """层级序列化：适用于有层级结构的图"""
        lines = ["知识图谱层级结构："]
        root = subgraph.get("root", {})
        lines.append(f"根节点：{root.get('label', 'N/A')}")

        def _serialize_tree(node, depth=1):
            result = []
            for child in node.get("children", []):
                indent = "  " * depth
                result.append(f"{indent}├─ {child['label']}")
                if child.get("children"):
                    result.extend(_serialize_tree(child, depth + 1))
            return result

        lines.extend(_serialize_tree(root))
        return "\n".join(lines)
```

### 12.4.3 代码/配置实现

**完整 Graph RAG Pipeline**

```python
# graph_rag_pipeline.py
import asyncio
from typing import List, Dict, Optional
from gremlin_python.driver import client as gremlin_client
from gremlin_python.driver.protocol import GremlinServerError

class GraphRAGPipeline:
    def __init__(
        self,
        neptune_endpoint: str,
        deepseek_client: DeepSeekClient,
        max_hops: int = 3,
        max_nodes: int = 50
    ):
        self.neptune = gremlin_client.Client(
            f"wss://{neptune_endpoint}:8182/gremlin",
            "g"
        )
        self.deepseek = deepseek_client
        self.max_hops = max_hops
        self.max_nodes = max_nodes

    async def query(self, natural_language_query: str) -> Dict:
        """完整的 Graph RAG 查询流程"""

        # 1. 自然语言 → 图查询
        gremlin_query = await self._nl_to_gremlin(natural_language_query)

        # 2. 执行图查询，获取子图
        subgraph = await self._execute_graph_query(gremlin_query)

        if not subgraph or not subgraph.get("nodes"):
            return {
                "answer": "未在知识图谱中找到相关信息。",
                "subgraph": None,
                "confidence": 0.0
            }

        # 3. 子图扩展（多跳）
        expanded_subgraph = await self._expand_subgraph(subgraph)

        # 4. 子图序列化
        context = SubgraphSerializer.narrative_serialization(expanded_subgraph)

        # 5. 生成回答
        answer = await self._generate_answer(natural_language_query, context)

        return {
            "answer": answer,
            "subgraph": expanded_subgraph,
            "context": context,
            "confidence": self._calculate_confidence(expanded_subgraph)
        }

    async def _nl_to_gremlin(self, nl_query: str) -> str:
        """使用 DeepSeek 将自然语言转化为 Gremlin 查询"""
        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
将以下自然语言问题转化为 Gremlin 图查询语句。
知识图谱包含：Person, Company, Product, Technology 等顶点类型，
以及 knows, works_for, develops, competes_with, uses 等边类型。

自然语言：{nl_query}

只返回 Gremlin 查询语句，不要解释：
"""}
            ],
            system_prompt="你是一个 Gremlin 查询生成器。只输出 Gremlin 代码。",
            temperature=0.1
        )
        return response.strip()

    async def _execute_graph_query(self, gremlin_query: str) -> Dict:
        """执行 Gremlin 查询并构建子图"""
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.neptune.submit(gremlin_query).all().result()
            )
            return self._build_subgraph(result)
        except GremlinServerError as e:
            logger.error(f"Neptune query failed: {e}")
            return {"nodes": [], "edges": []}

    def _build_subgraph(self, query_result: List) -> Dict:
        """将 Gremlin 查询结果构建为子图结构"""
        nodes = {}
        edges = []

        for item in query_result:
            if isinstance(item, dict):
                # 处理顶点
                if "id" in item and "label" in item:
                    node_id = str(item["id"])
                    nodes[node_id] = {
                        "id": node_id,
                        "label": item.get("label", "Unknown"),
                        "type": item.get("type", "vertex"),
                        "properties": item.get("properties", {})
                    }
                # 处理边
                if "outV" in item and "inV" in item:
                    edges.append({
                        "id": str(item.get("id", "")),
                        "source": str(item["outV"]),
                        "target": str(item["inV"]),
                        "relation": item.get("label", "related_to")
                    })

        return {
            "nodes": list(nodes.values()),
            "edges": edges
        }

    async def _expand_subgraph(self, subgraph: Dict) -> Dict:
        """多跳扩展子图"""
        if not subgraph.get("nodes"):
            return subgraph

        node_ids = [n["id"] for n in subgraph["nodes"]]
        existing_ids = set(node_ids)

        for hop in range(1, self.max_hops):
            new_nodes = []
            new_edges = []

            for node_id in node_ids:
                # 查询一跳邻居
                neighbor_query = f"""
                g.V('{node_id}').bothE().otherV().dedup()
                """
                try:
                    neighbors = await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: self.neptune.submit(neighbor_query).all().result()
                    )
                    for n in neighbors:
                        nid = str(n["id"])
                        if nid not in existing_ids:
                            new_nodes.append({
                                "id": nid,
                                "label": n.get("label", "Unknown"),
                                "type": n.get("type", "vertex"),
                                "properties": n.get("properties", {})
                            })
                            existing_ids.add(nid)
                except Exception as e:
                    logger.warning(f"Hop {hop} expansion failed for {node_id}: {e}")

            if not new_nodes:
                break

            subgraph["nodes"].extend(new_nodes)
            node_ids = [n["id"] for n in new_nodes]

            if len(existing_ids) >= self.max_nodes:
                break

        return subgraph

    async def _generate_answer(self, query: str, context: str) -> str:
        """基于子图上下文生成回答"""
        prompt = f"""请基于以下知识图谱信息回答问题。

知识图谱信息：
{context}

问题：{query}

要求：
1. 严格基于知识图谱信息回答
2. 如果信息不足，明确指出缺少什么
3. 引用具体的实体和关系
4. 回答要结构化、清晰"""

        return await self.deepseek.chat(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="你是一个基于知识图谱的智能问答助手。"
        )

    def _calculate_confidence(self, subgraph: Dict) -> float:
        """基于子图质量计算置信度"""
        if not subgraph.get("nodes"):
            return 0.0

        node_count = len(subgraph["nodes"])
        edge_count = len(subgraph["edges"])

        # 节点越多、边越多，信息越丰富
        node_score = min(node_count / 10, 1.0)
        edge_score = min(edge_count / 15, 1.0)

        # 有边连接的图比孤立节点更有价值
        connectivity = edge_count / max(node_count, 1)
        connectivity_score = min(connectivity, 1.0)

        return round((node_score * 0.3 + edge_score * 0.3 + connectivity_score * 0.4), 2)
```

### 12.4.4 使用场景

- **企业竞争分析**："A公司的竞对有哪些？它们最近发布了什么产品？"
- **药物研发**："与靶点T相关的药物有哪些？它们的临床试验阶段如何？"
- **供应链管理**："产品P的供应商有哪些？这些供应商是否共享原材料？"
- **学术研究**："作者A的合作者网络是怎样的？他们主要研究哪些方向？"

### 12.4.5 潜在风险与注意事项

1. **子图爆炸**：多跳扩展可能导致子图过大，需设置 max_hops 和 max_nodes 限制
2. **查询生成错误**：DeepSeek 生成的 Gremlin 查询可能语法错误，需实现查询验证和回退策略
3. **知识图谱覆盖不足**：如果知识图谱不完整，检索结果可能误导 LLM，需在 prompt 中强调"基于提供的信息"
4. **序列化信息损失**：图结构序列化为文本时可能丢失部分关系信息，需选择合适的序列化策略

### 12.4.6 本章小结

Graph RAG 通过引入知识图谱作为检索中间层，解决了传统 RAG 的平面检索、无关系感知和上下文碎片化三大问题。核心 pipeline 为：自然语言 → 图查询 → 子图 → 上下文 → LLM → 答案。子图检索保留了实体之间的关系结构，多跳扩展支持复杂推理，序列化策略将图结构转化为 LLM 可理解的文本。Graph RAG 特别适合需要关系推理和多跳查询的企业级知识问答场景。

---

## 12.5 知识图谱作为 LLM 外部记忆

### 12.5.1 解决的问题

LLM 的"记忆"存在三个根本性局限：

1. **静态知识截止**：训练数据有截止日期，无法获取最新信息
2. **参数化记忆不可控**：知识存储在模型参数中，无法精确更新或删除
3. **事实性不可靠**：模型可能混淆或编造事实（幻觉）

知识图谱作为外部记忆，将知识从模型参数中解耦出来，实现可精确控制、可实时更新、可追溯来源的结构化记忆系统。

### 12.5.2 核心原理

#### 实体链接（Entity Linking）

实体链接是将自然语言中的实体指称映射到知识图谱中具体节点的过程。

```
"苹果发布了新款 MacBook Pro"
    │
    ▼
┌─────────────────────────────────────────────┐
│ 实体识别                                      │
│ • 苹果 → 指称 (Mention)                       │
│ • MacBook Pro → 指称                          │
└──────────────────────┬──────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 候选实体生成                                  │
│ • "苹果" → [Apple Inc., 苹果公司, 苹果(水果)] │
│ • "MacBook Pro" → [MacBook Pro, MacBook Pro  │
│   (2023), MacBook Pro M3]                    │
└──────────────────────┬──────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 实体消歧                                      │
│ • 上下文判断："发布了新款" → Apple Inc.       │
│ • 最终映射：                                   │
│   "苹果" → neptune:AppleInc                   │
│   "MacBook Pro" → neptune:MacBookPro2023      │
└─────────────────────────────────────────────┘
```

**实现方案**：

```python
# entity_linker.py
from typing import List, Tuple, Optional
import re

class EntityLinker:
    def __init__(self, neptune_client, deepseek_client: DeepSeekClient):
        self.neptune = neptune_client
        self.deepseek = deepseek_client

    async def link_entities(self, text: str) -> List[Tuple[str, str, float]]:
        """将文本中的实体链接到知识图谱节点
        返回: [(mention, graph_node_id, confidence), ...]
        """
        # 1. 使用 DeepSeek 提取实体指称
        mentions = await self._extract_mentions(text)

        linked = []
        for mention in mentions:
            # 2. 在 Neptune 中搜索候选实体
            candidates = await self._find_candidates(mention)

            if not candidates:
                continue

            # 3. 使用上下文进行消歧
            best_match = await self._disambiguate(mention, candidates, text)
            if best_match:
                linked.append(best_match)

        return linked

    async def _extract_mentions(self, text: str) -> List[str]:
        """提取文本中的实体指称"""
        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
从以下文本中提取所有实体指称（人名、组织名、产品名、地名等）。
以 JSON 数组格式返回。

文本：{text}

["""}
            ],
            system_prompt="只返回 JSON 数组。"
        )
        try:
            import json
            return json.loads("[" + response)
        except:
            return []

    async def _find_candidates(self, mention: str) -> List[dict]:
        """在 Neptune 中查找候选实体"""
        query = f"""
        g.V().has('name', containing('{mention}'))
           .project('id', 'label', 'type')
           .by('id')
           .by('name')
           .by('type')
           .limit(10)
        """
        try:
            result = self.neptune.submit(query).all().result()
            return [
                {"id": str(r["id"]), "label": r["label"], "type": r.get("type", "")}
                for r in result
            ]
        except Exception as e:
            logger.error(f"Candidate search failed: {e}")
            return []

    async def _disambiguate(
        self, mention: str, candidates: List[dict], context: str
    ) -> Optional[Tuple[str, str, float]]:
        """使用上下文进行实体消歧"""
        if len(candidates) == 1:
            return (mention, candidates[0]["id"], 0.9)

        candidates_desc = "\n".join(
            f"{i}. {c['label']} (类型: {c['type']})"
            for i, c in enumerate(candidates)
        )

        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
上下文：{context}

实体指称「{mention}」可能对应以下知识图谱实体：
{candidates_desc}

请选择最匹配的一个，只返回序号（数字）：
"""}
            ],
            temperature=0.1
        )

        try:
            idx = int(response.strip())
            if 0 <= idx < len(candidates):
                return (mention, candidates[idx]["id"], 0.8)
        except:
            pass

        return None
```

#### 关系路径推理（Relationship Path Reasoning）

关系路径推理是在知识图谱中寻找两个实体之间的连通路径，用于解释实体间的间接关系。

```python
# path_reasoner.py
from typing import List, Dict

class PathReasoner:
    def __init__(self, neptune_client, deepseek_client: DeepSeekClient):
        self.neptune = neptune_client
        self.deepseek = deepseek_client

    async def find_paths(
        self,
        source_entity: str,
        target_entity: str,
        max_depth: int = 4,
        max_paths: int = 5
    ) -> List[Dict]:
        """查找两个实体之间的路径"""
        query = f"""
        g.V('{source_entity}')
         .repeat(bothE().otherV().simplePath())
         .until(has('id', '{target_entity}'))
         .limit({max_paths})
         .path()
         .by(valueMap('name', 'type').fold())
         .by(label)
        """
        try:
            result = self.neptune.submit(query).all().result()
            return self._parse_paths(result)
        except Exception as e:
            logger.error(f"Path finding failed: {e}")
            return []

    def _parse_paths(self, raw_paths: List) -> List[Dict]:
        """解析路径结果"""
        paths = []
        for path in raw_paths:
            nodes = []
            edges = []
            for i, step in enumerate(path):
                if i % 2 == 0:  # 节点
                    nodes.append({
                        "name": step.get("name", [""])[0],
                        "type": step.get("type", [""])[0]
                    })
                else:  # 边
                    edges.append({"relation": step})
            paths.append({"nodes": nodes, "edges": edges, "length": len(edges)})
        return paths

    async def explain_path(self, path: Dict) -> str:
        """将路径转化为自然语言解释"""
        path_desc = " → ".join(
            f"{path['nodes'][i]['name']} --[{path['edges'][i]['relation']}]--> {path['nodes'][i+1]['name']}"
            for i in range(len(path['edges']))
        )

        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
请解释以下知识图谱路径的含义：

路径：{path_desc}

请用自然语言描述这两个实体之间的关系：
"""}
            ]
        )
        return response
```

#### 多跳查询（Multi-hop Query）

多跳查询是 Graph RAG 的核心能力，通过遍历 2-3 跳关系来回答需要间接推理的问题。

```python
# multi_hop_query.py
from typing import List, Dict, Any

class MultiHopQuery:
    def __init__(self, neptune_client, deepseek_client: DeepSeekClient):
        self.neptune = neptune_client
        self.deepseek = deepseek_client

    async def execute(self, question: str) -> Dict[str, Any]:
        """执行多跳查询"""

        # 1. 解析查询为多跳计划
        plan = await self._decompose_question(question)

        # 2. 逐跳执行
        context = []
        current_entities = plan.get("start_entities", [])

        for hop in plan.get("hops", []):
            hop_results = []
            for entity in current_entities:
                result = await self._execute_hop(entity, hop)
                hop_results.extend(result)

            context.append({
                "hop": hop["description"],
                "results": hop_results
            })
            current_entities = [r["target"] for r in hop_results]

        # 3. 合成最终回答
        answer = await self._synthesize(question, context)
        return {
            "question": question,
            "plan": plan,
            "context": context,
            "answer": answer
        }

    async def _decompose_question(self, question: str) -> Dict:
        """将复杂问题分解为多跳查询计划"""
        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
将以下问题分解为多跳知识图谱查询计划。
每跳包括：起始实体、关系类型、目标实体类型。

问题：{question}

以 JSON 格式返回：
{{
  "start_entities": ["起始实体名称"],
  "hops": [
    {{"relation": "关系类型", "target_type": "目标类型", "description": "描述"}}
  ]
}}
"""}
            ],
            temperature=0.1
        )
        import json
        try:
            return json.loads(response)
        except:
            return {"start_entities": [], "hops": []}

    async def _execute_hop(self, entity_id: str, hop: Dict) -> List[Dict]:
        """执行单跳查询"""
        query = f"""
        g.V('{entity_id}')
         .out('{hop["relation"]}')
         .dedup()
         .project('id', 'label', 'type')
         .by('id')
         .by('name')
         .by('type')
         .fold()
        """
        try:
            result = self.neptune.submit(query).all().result()
            return [
                {"source": entity_id, "target": str(r["id"]), "label": r["label"]}
                for r in result[0]
            ]
        except Exception as e:
            logger.error(f"Hop execution failed: {e}")
            return []

    async def _synthesize(self, question: str, context: List) -> str:
        """合成多跳查询结果"""
        context_str = json.dumps(context, ensure_ascii=False, indent=2)
        return await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
基于以下多跳知识图谱查询结果回答问题。

查询结果：
{context_str}

问题：{question}
"""}
            ]
        )
```

### 12.5.3 代码/配置实现

**完整的外部记忆系统**

```python
# external_memory.py
from typing import List, Dict, Optional, Any

class ExternalMemory:
    """知识图谱作为 LLM 外部记忆的统一接口"""

    def __init__(self, neptune_client, deepseek_client: DeepSeekClient):
        self.linker = EntityLinker(neptune_client, deepseek_client)
        self.path_reasoner = PathReasoner(neptune_client, deepseek_client)
        self.multi_hop = MultiHopQuery(neptune_client, deepseek_client)

    async def retrieve(self, question: str, mode: str = "auto") -> Dict[str, Any]:
        """根据问题自动选择检索策略"""
        if mode == "auto":
            mode = await self._select_mode(question)

        if mode == "entity":
            return await self._entity_retrieval(question)
        elif mode == "path":
            return await self._path_retrieval(question)
        elif mode == "multi_hop":
            return await self._multi_hop_retrieval(question)
        else:
            return {"error": f"Unknown mode: {mode}"}

    async def _select_mode(self, question: str) -> str:
        """自动选择检索模式"""
        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
判断以下问题最适合哪种知识图谱检索模式：

1. entity - 单实体查询（问某个实体的属性）
2. path - 两实体间关系路径（问两个实体如何关联）
3. multi_hop - 多跳推理（需要间接推理）

问题：{question}

只返回模式名称：entity / path / multi_hop
"""}
            ],
            temperature=0.1
        )
        mode = response.strip().lower()
        return mode if mode in ("entity", "path", "multi_hop") else "entity"

    async def _entity_retrieval(self, question: str) -> Dict:
        linked = await self.linker.link_entities(question)
        return {"mode": "entity", "linked_entities": linked}

    async def _path_retrieval(self, question: str) -> Dict:
        linked = await self.linker.link_entities(question)
        if len(linked) >= 2:
            paths = await self.path_reasoner.find_paths(
                linked[0][1], linked[1][1]
            )
            return {"mode": "path", "paths": paths}
        return {"mode": "path", "paths": []}

    async def _multi_hop_retrieval(self, question: str) -> Dict:
        return await self.multi_hop.execute(question)
```

### 12.5.4 使用场景

- **企业知识管理**：将内部文档、流程、组织架构构建为知识图谱，作为 LLM 的企业记忆
- **动态知识更新**：知识图谱实时更新，LLM 回答始终基于最新知识
- **合规与审计**：所有回答可追溯到知识图谱中的具体节点和关系，满足合规要求
- **多语言知识访问**：知识图谱使用标准化标识符，LLM 负责多语言转换

### 12.5.5 潜在风险与注意事项

1. **实体链接错误**：错误的实体链接会导致后续所有推理错误，需实现置信度阈值和人工审核机制
2. **路径爆炸**：在大图中寻找路径可能产生指数级结果，需限制搜索深度和路径数量
3. **知识图谱更新同步**：外部记忆系统需与知识图谱的更新保持同步，避免使用过期知识
4. **混合记忆管理**：LLM 的参数化记忆与外部知识图谱记忆可能冲突，需设计冲突解决策略

### 12.5.6 本章小结

知识图谱作为 LLM 的外部记忆，通过实体链接、关系路径推理和多跳查询三种机制，实现了可精确控制、可实时更新、可追溯来源的结构化记忆。实体链接将自然语言指称映射到图节点，关系路径推理解释实体间的间接关联，多跳查询支持复杂推理。三者结合使 LLM 能够访问和推理超出其训练数据范围的知识，同时保持事实准确性和可解释性。

---

## 12.6 Neptune 图数据库连接与操作

### 12.6.1 解决的问题

Neptune 作为托管图数据库服务，提供了高性能的图存储和查询能力。但在与 DeepSeek 集成时，需要解决连接管理、查询优化、数据序列化等工程问题。

### 12.6.2 核心原理

#### 连接管理

Neptune 支持两种查询协议：

| 协议 | 适用图模型 | 查询语言 | 适用场景 |
|------|-----------|---------|---------|
| Gremlin | Property Graph | Gremlin | 实时查询、图遍历 |
| SPARQL | RDF | SPARQL | 语义查询、知识推理 |

#### 连接池与重试

```python
# neptune_connection.py
from gremlin_python.driver import client, serializer, protocol
from gremlin_python.driver.aiohttp.transport import AiohttpTransport
import asyncio
from typing import Optional
import backoff
import logging

logger = logging.getLogger(__name__)

class NeptuneConnectionPool:
    """Neptune 连接池管理"""

    def __init__(
        self,
        host: str,
        port: int = 8182,
        pool_size: int = 10,
        max_retries: int = 3,
        use_iam: bool = True
    ):
        self.host = host
        self.port = port
        self.pool_size = pool_size
        self.max_retries = max_retries
        self.use_iam = use_iam
        self._pool = []
        self._lock = asyncio.Lock()

    async def get_client(self) -> client.Client:
        """获取连接池中的客户端"""
        async with self._lock:
            if not self._pool:
                await self._init_pool()
            # 简单轮询
            c = self._pool.pop(0)
            self._pool.append(c)
            return c

    async def _init_pool(self):
        """初始化连接池"""
        for _ in range(self.pool_size):
            c = client.Client(
                f"wss://{self.host}:{self.port}/gremlin",
                "g",
                message_serializer=serializer.GraphSONSerializersV3d0(),
                transport_factory=AiohttpTransport
            )
            self._pool.append(c)

    @backoff.on_exception(
        backoff.expo,
        (protocol.GremlinServerError, ConnectionError),
        max_tries=3
    )
    async def execute_query(self, query: str, bindings: dict = None) -> list:
        """执行 Gremlin 查询，带重试"""
        c = await self.get_client()
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: c.submit(query, bindings).all().result()
            )
            return result
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            raise

    async def close_all(self):
        """关闭所有连接"""
        for c in self._pool:
            try:
                c.close()
            except:
                pass
        self._pool = []
```

#### SPARQL 查询支持

```python
# neptune_sparql.py
import requests
from typing import List, Dict
import json

class NeptuneSPARQLClient:
    """Neptune SPARQL 查询客户端"""

    def __init__(self, host: str, port: int = 8182):
        self.endpoint = f"https://{host}:{port}/sparql"

    def query(self, sparql: str) -> List[Dict]:
        """执行 SPARQL 查询"""
        response = requests.post(
            self.endpoint,
            data={"query": sparql},
            headers={"Accept": "application/sparql-results+json"}
        )
        response.raise_for_status()
        return self._parse_results(response.json())

    def _parse_results(self, raw: dict) -> List[Dict]:
        """解析 SPARQL JSON 结果"""
        results = []
        vars = raw.get("head", {}).get("vars", [])
        for binding in raw.get("results", {}).get("bindings", []):
            row = {}
            for var in vars:
                if var in binding:
                    row[var] = binding[var].get("value", "")
            results.append(row)
        return results

    def construct_query(self, sparql: str) -> str:
        """执行 CONSTRUCT 查询，返回 RDF 三元组"""
        response = requests.post(
            self.endpoint,
            data={"query": sparql},
            headers={"Accept": "text/turtle"}
        )
        response.raise_for_status()
        return response.text
```

### 12.6.3 代码/配置实现

**Neptune 数据操作工具集**

```python
# neptune_operations.py
from typing import List, Dict, Any, Optional

class NeptuneOperations:
    """Neptune 常用图操作封装"""

    def __init__(self, pool: NeptuneConnectionPool):
        self.pool = pool

    # ─── 顶点操作 ───

    async def add_vertex(self, label: str, properties: Dict[str, Any]) -> str:
        """添加顶点"""
        props_str = ", ".join(
            f"'{k}': '{v}'" if isinstance(v, str) else f"'{k}': {v}"
            for k, v in properties.items()
        )
        query = f"g.addV('{label}').property(id, '{properties.get('id', '')}').property('name', '{properties.get('name', '')}')"
        # 使用更健壮的方式
        query = f"""
        g.addV('{label}')
         .property('name', '{properties.get('name', '')}')
         .property('type', '{label}')
        """
        for k, v in properties.items():
            if k not in ('name', 'id'):
                if isinstance(v, str):
                    query += f".property('{k}', '{v}')"
                else:
                    query += f".property('{k}', {v})"

        query += ".elementMap()"

        result = await self.pool.execute_query(query)
        return str(result[0].get("id", ""))

    async def get_vertex(self, vertex_id: str) -> Optional[Dict]:
        """获取顶点"""
        query = f"g.V('{vertex_id}').elementMap()"
        try:
            result = await self.pool.execute_query(query)
            if result:
                return dict(result[0])
            return None
        except:
            return None

    async def update_vertex(self, vertex_id: str, properties: Dict[str, Any]):
        """更新顶点属性"""
        for k, v in properties.items():
            if isinstance(v, str):
                query = f"g.V('{vertex_id}').property('{k}', '{v}')"
            else:
                query = f"g.V('{vertex_id}').property('{k}', {v})"
            await self.pool.execute_query(query)

    async def delete_vertex(self, vertex_id: str):
        """删除顶点及其关联边"""
        query = f"g.V('{vertex_id}').drop()"
        await self.pool.execute_query(query)

    # ─── 边操作 ───

    async def add_edge(
        self,
        source_id: str,
        target_id: str,
        label: str,
        properties: Dict[str, Any] = None
    ) -> str:
        """添加边"""
        query = f"g.V('{source_id}').addE('{label}').to(g.V('{target_id}'))"
        if properties:
            for k, v in properties.items():
                if isinstance(v, str):
                    query += f".property('{k}', '{v}')"
                else:
                    query += f".property('{k}', {v})"
        query += ".elementMap()"

        result = await self.pool.execute_query(query)
        return str(result[0].get("id", ""))

    async def get_neighbors(
        self,
        vertex_id: str,
        edge_labels: List[str] = None,
        direction: str = "both"
    ) -> List[Dict]:
        """获取邻居顶点"""
        labels_filter = ""
        if edge_labels:
            labels_filter = f".{direction}E({','.join(f"'{l}'" for l in edge_labels)})"

        query = f"""
        g.V('{vertex_id}'){labels_filter or f'.{direction}E()'}
         .otherV()
         .dedup()
         .elementMap()
        """
        result = await self.pool.execute_query(query)
        return [dict(r) for r in result]

    # ─── 子图查询 ───

    async def get_subgraph(
        self,
        center_id: str,
        max_depth: int = 2,
        max_nodes: int = 50
    ) -> Dict:
        """获取以某顶点为中心的子图"""
        query = f"""
        g.V('{center_id}')
         .repeat(bothE().otherV().simplePath())
         .times({max_depth})
         .dedup()
         .limit({max_nodes})
         .elementMap()
        """
        nodes = await self.pool.execute_query(query)

        # 获取这些节点之间的边
        node_ids = [str(n.get("id", "")) for n in nodes]
        edges = []
        for nid in node_ids:
            edge_query = f"""
            g.V('{nid').bothE().project('id','label','outV','inV')
              .by('id').by('label').by('outV').by('inV')
            """
            try:
                edge_result = await self.pool.execute_query(edge_query)
                for e in edge_result:
                    if str(e.get("outV", "")) in node_ids and str(e.get("inV", "")) in node_ids:
                        edges.append(dict(e))
            except:
                pass

        return {"nodes": nodes, "edges": edges}

    # ─── 全文搜索 ───

    async def search_vertices(
        self,
        search_term: str,
        field: str = "name",
        limit: int = 20
    ) -> List[Dict]:
        """搜索顶点"""
        query = f"""
        g.V().has('{field}', containing('{search_term}'))
         .limit({limit})
         .elementMap()
        """
        result = await self.pool.execute_query(query)
        return [dict(r) for r in result]
```

### 12.6.4 使用场景

- **实时知识图谱查询**：为 LLM 提供低延迟的图数据访问
- **批量数据导入**：将结构化数据批量写入 Neptune
- **图分析**：执行 PageRank、社区发现等图算法
- **增量更新**：实时更新知识图谱中的实体和关系

### 12.6.5 潜在风险与注意事项

1. **连接超时**：Neptune 空闲连接可能超时断开，需实现心跳检测和自动重连
2. **查询超时**：复杂图查询可能超过 Neptune 的 30 秒超时限制，需设置合理的查询超时
3. **IAM 认证**：生产环境必须使用 IAM 认证，需正确配置 AWS 凭证
4. **写入限流**：Neptune 写入有 TPS 限制，批量写入时需控制速率

### 12.6.6 本章小结

Neptune 连接管理需要关注连接池、重试策略、查询超时等工程细节。Gremlin 适合实时图遍历查询，SPARQL 适合语义推理。通过封装常用的顶点操作、边操作、子图查询和搜索功能，可以大幅简化与 DeepSeek 集成时的数据访问代码。

---

## 12.7 向量搜索与语义搜索

### 12.7.1 解决的问题

图查询擅长精确匹配和关系遍历，但无法处理语义相似性搜索。例如，"高性能计算框架"和"GPU 加速的分布式计算平台"在语义上相似，但图查询无法直接匹配。向量搜索弥补了这一缺口。

### 12.7.2 核心原理

#### Neptune 向量存储

Neptune 通过 `neptune-ai` 库支持向量存储和搜索：

```python
# neptune_vector.py
from neptune_ai import NeptuneVectorStore
import numpy as np
from typing import List, Dict, Optional

class NeptuneVectorStore:
    """Neptune 向量存储封装"""

    def __init__(self, neptune_client, embedding_dim: int = 1536):
        self.neptune = neptune_client
        self.dim = embedding_dim

    async def add_embedding(
        self,
        vertex_id: str,
        embedding: List[float],
        field_name: str = "embedding"
    ):
        """为顶点添加向量嵌入"""
        emb_str = ",".join(str(x) for x in embedding)
        query = f"""
        g.V('{vertex_id}')
         .property('{field_name}', [{emb_str}])
        """
        await self.neptune.execute_query(query)

    async def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = 10,
        field_name: str = "embedding"
    ) -> List[Dict]:
        """向量相似度搜索"""
        # 使用 Neptune ML 的向量搜索
        query = f"""
        g.withSideEffect('Neptune#ml.embeddings', '{field_name}')
         .V()
         .order()
         .by(neptune_ml_distance(query_embedding))
         .limit({top_k})
         .elementMap()
        """
        result = await self.neptune.execute_query(query)
        return [dict(r) for r in result]

    def cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """计算余弦相似度"""
        a_arr = np.array(a)
        b_arr = np.array(b)
        return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr)))
```

#### 混合搜索（Hybrid Search）

混合搜索将图结构搜索与向量语义搜索结合，实现"结构 + 语义"的双重检索：

```python
# hybrid_search.py
from typing import List, Dict, Tuple
import numpy as np

class HybridSearch:
    """混合搜索：图搜索 + 向量搜索"""

    def __init__(
        self,
        neptune_ops: NeptuneOperations,
        vector_store: NeptuneVectorStore,
        deepseek_client: DeepSeekClient,
        alpha: float = 0.5  # 图搜索权重
    ):
        self.neptune_ops = neptune_ops
        self.vector_store = vector_store
        self.deepseek = deepseek_client
        self.alpha = alpha

    async def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """执行混合搜索"""

        # 1. 生成查询向量
        query_embedding = await self.deepseek.generate_embedding(query)

        # 2. 向量搜索
        vector_results = await self.vector_store.similarity_search(
            query_embedding, top_k=top_k * 2
        )

        # 3. 图搜索（基于实体匹配）
        entities = await self._extract_entities_for_search(query)
        graph_results = []
        for entity in entities:
            neighbors = await self.neptune_ops.get_neighbors(entity)
            graph_results.extend(neighbors)

        # 4. 结果融合
        fused = self._fuse_results(vector_results, graph_results, top_k)
        return fused

    async def _extract_entities_for_search(self, query: str) -> List[str]:
        """提取查询中的实体 ID"""
        response = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
从查询中提取关键实体名称，用于知识图谱搜索。

查询：{query}

返回实体名称列表（JSON 数组）：
["""}
            ],
            temperature=0.1
        )
        import json
        try:
            names = json.loads("[" + response)
            # 在 Neptune 中查找这些名称对应的 ID
            ids = []
            for name in names[:5]:
                results = await self.neptune_ops.search_vertices(name)
                ids.extend([r.get("id", "") for r in results])
            return ids
        except:
            return []

    def _fuse_results(
        self,
        vector_results: List[Dict],
        graph_results: List[Dict],
        top_k: int
    ) -> List[Dict]:
        """融合图搜索和向量搜索结果"""
        # 构建得分字典
        scores = {}

        # 向量搜索得分
        for i, r in enumerate(vector_results):
            rid = r.get("id", "")
            scores[rid] = {
                "score": (1 - self.alpha) * (1 - i / len(vector_results)),
                "data": r,
                "source": "vector"
            }

        # 图搜索得分
        for i, r in enumerate(graph_results):
            rid = r.get("id", "")
            graph_score = self.alpha * (1 - i / len(graph_results))
            if rid in scores:
                scores[rid]["score"] += graph_score
                scores[rid]["source"] = "hybrid"
            else:
                scores[rid] = {
                    "score": graph_score,
                    "data": r,
                    "source": "graph"
                }

        # 排序并返回 top_k
        sorted_results = sorted(
            scores.values(),
            key=lambda x: x["score"],
            reverse=True
        )
        return sorted_results[:top_k]
```

#### 嵌入生成策略

```python
# embedding_strategy.py
from typing import List, Optional
import hashlib

class EmbeddingCache:
    """嵌入缓存，避免重复计算"""

    def __init__(self, redis_client=None):
        self.redis = redis_client
        self._local_cache = {}

    async def get_or_generate(
        self,
        text: str,
        generator: callable
    ) -> List[float]:
        """获取缓存或生成新嵌入"""
        key = hashlib.md5(text.encode()).hexdigest()

        # 检查本地缓存
        if key in self._local_cache:
            return self._local_cache[key]

        # 检查 Redis 缓存
        if self.redis:
            cached = await self.redis.get(f"emb:{key}")
            if cached:
                import json
                emb = json.loads(cached)
                self._local_cache[key] = emb
                return emb

        # 生成新嵌入
        embedding = await generator(text)

        # 写入缓存
        self._local_cache[key] = embedding
        if self.redis:
            import json
            await self.redis.setex(f"emb:{key}", 86400, json.dumps(embedding))

        return embedding
```

### 12.7.3 代码/配置实现

**完整向量搜索集成**

```python
# vector_search_integration.py
from typing import List, Dict, Optional
import asyncio

class VectorSearchIntegration:
    """向量搜索与 DeepSeek 的完整集成"""

    def __init__(
        self,
        neptune_ops: NeptuneOperations,
        deepseek_client: DeepSeekClient,
        embedding_cache: EmbeddingCache
    ):
        self.neptune_ops = neptune_ops
        self.deepseek = deepseek_client
        self.cache = embedding_cache
        self.vector_store = NeptuneVectorStore(neptune_ops)

    async def index_document(self, doc_id: str, content: str, metadata: Dict = None):
        """索引文档到向量存储"""
        # 生成嵌入
        embedding = await self.cache.get_or_generate(
            content,
            self.deepseek.generate_embedding
        )

        # 确保顶点存在
        vertex = await self.neptune_ops.get_vertex(doc_id)
        if not vertex:
            await self.neptune_ops.add_vertex(
                "Document",
                {"id": doc_id, "name": metadata.get("name", ""), "content": content[:1000]}
            )

        # 存储嵌入
        await self.vector_store.add_embedding(doc_id, embedding)

        # 存储原始内容（用于检索后展示）
        if metadata:
            await self.neptune_ops.update_vertex(doc_id, metadata)

    async def semantic_search(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.7
    ) -> List[Dict]:
        """语义搜索"""
        # 生成查询嵌入
        query_emb = await self.cache.get_or_generate(
            query,
            self.deepseek.generate_embedding
        )

        # 向量搜索
        results = await self.vector_store.similarity_search(
            query_emb, top_k=top_k
        )

        # 过滤低分结果
        filtered = []
        for r in results:
            emb = r.get("embedding", [])
            if emb:
                score = self.vector_store.cosine_similarity(query_emb, emb)
                if score >= min_score:
                    r["similarity_score"] = score
                    filtered.append(r)

        return sorted(filtered, key=lambda x: x["similarity_score"], reverse=True)

    async def hybrid_qa(
        self,
        question: str,
        top_k: int = 5
    ) -> Dict:
        """基于混合搜索的问答"""
        # 混合搜索
        search = HybridSearch(
            self.neptune_ops,
            self.vector_store,
            self.deepseek
        )
        results = await search.search(question, top_k)

        # 构建上下文
        context_parts = []
        for r in results:
            data = r.get("data", {})
            name = data.get("name", "")
            content = data.get("content", "")
            source = r.get("source", "unknown")
            context_parts.append(f"[{source}] {name}: {content[:500]}")

        context = "\n\n".join(context_parts)

        # 生成回答
        answer = await self.deepseek.chat(
            messages=[
                {"role": "user", "content": f"""
基于以下检索结果回答问题。

检索结果：
{context}

问题：{question}

请给出基于检索结果的回答，并标注信息来源。
"""}
            ],
            system_prompt="你是一个基于知识库的问答助手。严格基于检索结果回答。"
        )

        return {
            "question": question,
            "answer": answer,
            "sources": [r.get("data", {}).get("name", "") for r in results],
            "result_count": len(results)
        }
```

### 12.7.4 使用场景

- **语义文档搜索**：搜索与查询语义相似的文档，而非仅关键词匹配
- **知识图谱实体推荐**：基于向量相似度推荐相关实体
- **多模态检索**：将文本、图片等不同模态的数据统一为向量表示
- **异常检测**：通过向量距离检测知识图谱中的异常实体

### 12.7.5 潜在风险与注意事项

1. **嵌入维度选择**：DeepSeek 的 embedding 模型输出 1536 维向量，需确保向量存储支持该维度
2. **嵌入质量**：嵌入质量直接影响搜索效果，需定期评估和更新嵌入模型
3. **混合搜索权重**：alpha 参数控制图搜索和向量搜索的权重，需根据业务场景调优
4. **存储成本**：高维向量存储占用大量空间，大规模场景需考虑向量压缩

### 12.7.6 本章小结

向量搜索通过语义嵌入弥补了图查询在语义匹配上的不足。Neptune 向量存储支持在图中直接存储和搜索向量，混合搜索将图结构搜索与向量语义搜索融合，实现了"结构精确 + 语义灵活"的双重检索能力。嵌入缓存策略避免了重复计算，提升了系统效率。

---

## 12.8 集成模式

### 12.8.1 解决的问题

将 Neptune 和 DeepSeek 集成到现有应用架构中，需要选择合适的集成框架和模式。不同的框架提供不同的抽象层次和功能特性。

### 12.8.2 核心原理

#### 模式一：LangChain 集成

LangChain 提供了 `GraphCypherQAChain` 和自定义检索器，是最常用的集成方式。

```python
# langchain_integration.py
from langchain.chains import GraphCypherQAChain
from langchain.graphs import NeptuneGraph
from langchain.llms import DeepSeekLLM
from langchain.prompts import PromptTemplate
from langchain.schema import BaseRetriever
from langchain.vectorstores import NeptuneVectorStore
from typing import List, Dict, Any

class LangChainNeptuneDeepSeek:
    """LangChain 集成 Neptune + DeepSeek"""

    def __init__(self, neptune_endpoint: str, deepseek_api_key: str):
        # 初始化 Neptune 图连接
        self.graph = NeptuneGraph(
            host=neptune_endpoint,
            port=8182,
            use_iam=True
        )

        # 初始化 DeepSeek LLM
        self.llm = DeepSeekLLM(
            api_key=deepseek_api_key,
            model="deepseek-chat",
            temperature=0.1
        )

    def create_qa_chain(self) -> GraphCypherQAChain:
        """创建图查询问答链"""
        chain = GraphCypherQAChain.from_llm(
            llm=self.llm,
            graph=self.graph,
            verbose=True,
            return_intermediate_steps=True,
            top_k=10,
            cypher_prompt=PromptTemplate(
                template="""
你是一个 Neptune 图数据库专家。根据用户问题生成 Gremlin 查询。

图模式：
- 顶点类型：Person, Company, Product, Technology
- 边类型：knows, works_for, develops, competes_with, uses
- 顶点属性：name, type, description

问题：{question}

生成 Gremlin 查询：
""",
                input_variables=["question"]
            ),
            qa_prompt=PromptTemplate(
                template="""
你是一个知识图谱问答助手。基于以下图查询结果回答问题。

图查询结果：{context}

原始问题：{question}

请用中文回答：
""",
                input_variables=["context", "question"]
            )
        )
        return chain

    async def query(self, question: str) -> Dict[str, Any]:
        """执行问答"""
        chain = self.create_qa_chain()
        result = chain(question)
        return {
            "question": question,
            "answer": result.get("result", ""),
            "intermediate_steps": result.get("intermediate_steps", [])
        }

class GraphRetriever(BaseRetriever):
    """自定义图检索器"""

    def __init__(self, neptune_ops: NeptuneOperations, deepseek: DeepSeekClient):
        super().__init__()
        self.neptune_ops = neptune_ops
        self.deepseek = deepseek

    def get_relevant_documents(self, query: str) -> List[Dict]:
        """检索相关文档（同步接口）"""
        import asyncio
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self._aretrieve(query))
        finally:
            loop.close()

    async def _aretrieve(self, query: str) -> List[Dict]:
        """异步检索"""
        # 实体提取
        entities = await self.deepseek.chat(
            messages=[{"role": "user", "content": f"从以下查询中提取实体：{query}"}]
        )

        # 图检索
        documents = []
        for entity_name in entities.split(","):
            entity_name = entity_name.strip()
            if not entity_name:
                continue

            vertices = await self.neptune_ops.search_vertices(entity_name)
            for v in vertices:
                neighbors = await self.neptune_ops.get_neighbors(v.get("id", ""))
                doc_text = f"实体：{v.get('name', '')}\n"
                doc_text += f"类型：{v.get('type', '')}\n"
                doc_text += "关联：\n"
                for n in neighbors[:5]:
                    doc_text += f"  - {n.get('name', '')}\n"

                documents.append({
                    "page_content": doc_text,
                    "metadata": {
                        "source": "neptune",
                        "entity_id": v.get("id", ""),
                        "entity_name": v.get("name", "")
                    }
                })

        return documents
```

#### 模式二：LlamaIndex 集成

```python
# llamaindex_integration.py
from llama_index.core import KnowledgeGraphIndex, ServiceContext
from llama_index.core.graph_stores import NeptuneGraphStore
from llama_index.llms.deepseek import DeepSeek
from llama_index.embeddings.deepseek import DeepSeekEmbedding
from typing import List, Optional

class LlamaIndexNeptuneDeepSeek:
    """LlamaIndex 集成 Neptune + DeepSeek"""

    def __init__(
        self,
        neptune_endpoint: str,
        deepseek_api_key: str
    ):
        # 初始化 LLM 和 Embedding
        self.llm = DeepSeek(
            api_key=deepseek_api_key,
            model="deepseek-chat"
        )
        self.embed_model = DeepSeekEmbedding(
            api_key=deepseek_api_key
        )

        # 初始化服务上下文
        self.service_context = ServiceContext.from_defaults(
            llm=self.llm,
            embed_model=self.embed_model
        )

        # 初始化 Neptune 图存储
        self.graph_store = NeptuneGraphStore(
            host=neptune_endpoint,
            port=8182
        )

    def create_knowledge_graph_index(self) -> KnowledgeGraphIndex:
        """创建知识图谱索引"""
        index = KnowledgeGraphIndex.from_existing(
            graph_store=self.graph_store,
            service_context=self.service_context
        )
        return index

    def query(self, question: str) -> str:
        """执行查询"""
        index = self.create_knowledge_graph_index()
        query_engine = index.as_query_engine(
            include_text=True,
            retriever_mode="keyword",
            response_mode="tree_summarize"
        )
        response = query_engine.query(question)
        return str(response)

    def build_index_from_documents(self, documents: List[str]):
        """从文档构建知识图谱索引"""
        from llama_index.core import Document

        docs = [Document(text=d) for d in documents]
        index = KnowledgeGraphIndex.from_documents(
            documents=docs,
            graph_store=self.graph_store,
            service_context=self.service_context,
            max_triplets_per_chunk=10,
            include_embeddings=True
        )
        return index
```

#### 模式三：自定义 FastAPI 中间件

```python
# fastapi_middleware.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import asyncio
import uuid
import time
import logging

logger = logging.getLogger(__name__)

app = FastAPI(title="Neptune + DeepSeek API", version="1.0.0")

# ─── 数据模型 ───

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    mode: str = Field(default="auto", pattern="^(auto|graph|vector|hybrid)$")
    top_k: int = Field(default=5, ge=1, le=50)
    use_cache: bool = True
    stream: bool = False
    user_id: Optional[str] = None

class QueryResponse(BaseModel):
    request_id: str
    question: str
    answer: str
    sources: List[str] = []
    confidence: float = 0.0
    latency_ms: float = 0.0
    mode: str = ""

class BatchQueryRequest(BaseModel):
    questions: List[str] = Field(..., min_items=1, max_items=100)
    mode: str = "auto"

class BatchQueryResponse(BaseModel):
    results: List[QueryResponse]
    total_latency_ms: float = 0.0

# ─── 全局实例 ───

pipeline: Optional[NeptuneDeepSeekPipeline] = None

def get_pipeline() -> NeptuneDeepSeekPipeline:
    global pipeline
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")
    return pipeline

# ─── API 端点 ───

@app.on_event("startup")
async def startup():
    """初始化全局 pipeline"""
    global pipeline
    config = load_config()  # 从环境变量或配置文件加载
    neptune_pool = NeptuneConnectionPool(config.neptune_host)
    deepseek = DeepSeekClient(config.deepseek)
    cache = NeptuneDeepSeekCache(CacheConfig())
    pipeline = NeptuneDeepSeekPipeline(neptune_pool, deepseek, cache)

@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest, background_tasks: BackgroundTasks):
    """单查询接口"""
    start = time.time()
    request_id = str(uuid.uuid4())

    try:
        result = await get_pipeline().query(
            request.question,
            use_cache=request.use_cache
        )

        response = QueryResponse(
            request_id=request_id,
            question=request.question,
            answer=result.answer or "未找到相关信息",
            sources=result.sources,
            confidence=0.85,
            latency_ms=(time.time() - start) * 1000,
            mode=request.mode
        )

        # 异步记录日志
        background_tasks.add_task(log_query, request, response)

        return response

    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query/stream")
async def query_stream(request: QueryRequest):
    """流式查询接口"""
    async def generate():
        try:
            result = await get_pipeline().query(request.question)
            # 模拟流式输出
            for chunk in result.answer:
                yield f"data: {chunk}\n\n"
                await asyncio.sleep(0.01)
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/query/batch", response_model=BatchQueryResponse)
async def batch_query(request: BatchQueryRequest):
    """批量查询接口"""
    start = time.time()
    tasks = [
        get_pipeline().query(q, use_cache=True)
        for q in request.questions
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    responses = []
    for q, r in zip(request.questions, results):
        if isinstance(r, Exception):
            responses.append(QueryResponse(
                request_id=str(uuid.uuid4()),
                question=q,
                answer=f"查询失败: {str(r)}",
                latency_ms=0.0
            ))
        else:
            responses.append(QueryResponse(
                request_id=str(uuid.uuid4()),
                question=q,
                answer=r.answer or "",
                sources=r.sources,
                latency_ms=r.latency_ms
            ))

    return BatchQueryResponse(
        results=responses,
        total_latency_ms=(time.time() - start) * 1000
    )

@app.post("/knowledge/update")
async def update_knowledge(data: Dict[str, Any]):
    """更新知识图谱"""
    try:
        ops = NeptuneOperations(get_pipeline().neptune)
        for entity in data.get("entities", []):
            await ops.add_vertex(
                entity["type"],
                {k: v for k, v in entity.items() if k != "type"}
            )
        for relation in data.get("relations", []):
            await ops.add_edge(
                relation["source"],
                relation["target"],
                relation["type"],
                relation.get("properties", {})
            )
        return {"status": "success", "updated": len(data.get("entities", []))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """健康检查"""
    try:
        # 检查 Neptune 连接
        await get_pipeline().neptune.execute_query("g.V().limit(1)")
        neptune_ok = True
    except:
        neptune_ok = False

    return {
        "status": "healthy" if neptune_ok else "degraded",
        "neptune": "connected" if neptune_ok else "disconnected",
        "deepseek": "configured" if get_pipeline().deepseek.config.api_key else "not configured"
    }

async def log_query(request: QueryRequest, response: QueryResponse):
    """异步记录查询日志"""
    logger.info(f"Query | {response.request_id} | {request.question[:50]}... | {response.latency_ms:.0f}ms")

def load_config() -> Dict:
    """从环境变量加载配置"""
    import os
    return {
        "neptune_host": os.getenv("NEPTUNE_HOST", ""),
        "deepseek": {
            "api_key": os.getenv("DEEPSEEK_API_KEY", ""),
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        }
    }
```

### 12.8.3 代码/配置实现

**Docker Compose 部署配置**

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - NEPTUNE_HOST=${NEPTUNE_HOST}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - DEEPSEEK_MODEL=deepseek-chat
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  monitor:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  redis_data:
  grafana_data:
```

**环境配置**

```bash
# .env
NEPTUNE_HOST=your-neptune-cluster.cluster-xxxxx.us-east-1.neptune.amazonaws.com
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-chat
REDIS_URL=redis://redis:6379
GRAFANA_PASSWORD=admin123
```

### 12.8.4 使用场景

- **企业级知识问答系统**：基于 FastAPI 构建 RESTful API，支持高并发
- **智能客服**：LangChain 的 QA Chain 适合构建对话式问答
- **文档分析平台**：LlamaIndex 的知识图谱索引适合大规模文档处理
- **实时数据管道**：自定义中间件支持流式响应和批量处理

### 12.8.5 潜在风险与注意事项

1. **框架版本兼容性**：LangChain 和 LlamaIndex 版本更新频繁，需锁定版本号
2. **异步编程模型**：FastAPI 使用 asyncio，需确保所有 I/O 操作都是异步的
3. **错误处理**：不同框架的错误处理机制不同，需统一异常处理
4. **性能监控**：生产环境需集成 Prometheus + Grafana 监控 API 性能和模型调用

### 12.8.6 本章小结

三种集成模式各有侧重：LangChain 的 GraphCypherQAChain 适合快速构建图问答，LlamaIndex 的 KnowledgeGraphIndex 适合大规模文档索引，自定义 FastAPI 中间件提供最大的灵活性和控制力。生产部署建议使用 Docker Compose 编排多服务，配合 Redis 缓存和健康检查机制。

---

## 12.9 总结与最佳实践

### 12.9.1 架构决策矩阵

| 决策点 | 选项 | 推荐场景 |
|--------|------|---------|
| 图模型 | Property Graph / RDF | 应用集成选 Property Graph，语义推理选 RDF |
| 查询语言 | Gremlin / SPARQL | 实时查询选 Gremlin，复杂推理选 SPARQL |
| 集成框架 | LangChain / LlamaIndex / 自定义 | 快速原型选 LangChain，文档处理选 LlamaIndex，生产系统选自定义 |
| 检索模式 | 图检索 / 向量检索 / 混合 | 关系查询选图检索，语义匹配选向量检索，综合场景选混合 |
| 缓存策略 | 查询缓存 / 结果缓存 / 无缓存 | 高频查询选结果缓存，时效敏感选查询缓存 |
| 部署方式 | API 调用 / 私有部署 | 低成本选 API，数据安全选私有部署 |

### 12.9.2 性能优化建议

1. **Neptune 优化**
   - 使用连接池复用连接
   - 为常用查询创建索引
   - 限制子图查询的深度和宽度
   - 批量写入时使用异步提交

2. **DeepSeek 优化**
   - 使用流式响应降低首字延迟
   - 实现请求合并减少 API 调用
   - 使用语义缓存避免重复查询
   - 选择合适模型平衡成本和质量

3. **Pipeline 优化**
   - 并行执行图检索和向量检索
   - 使用异步 I/O 避免阻塞
   - 实现智能上下文裁剪控制 token 消耗
   - 使用 LRU 缓存减少重复计算

### 12.9.3 监控指标

```python
# monitoring.py
from prometheus_client import Counter, Histogram, Gauge
import time

# 指标定义
QUERY_COUNTER = Counter(
    'neptune_deepseek_queries_total',
    'Total number of queries',
    ['mode', 'status']
)

QUERY_LATENCY = Histogram(
    'neptune_deepseek_query_latency_seconds',
    'Query latency in seconds',
    ['stage'],
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0)
)

CACHE_HIT_RATIO = Gauge(
    'neptune_deepseek_cache_hit_ratio',
    'Cache hit ratio'
)

NEPTUNE_QUERY_LATENCY = Histogram(
    'neptune_query_latency_seconds',
    'Neptune query latency',
    buckets=(0.05, 0.1, 0.5, 1.0, 2.0)
)

DEEPSEEK_API_LATENCY = Histogram(
    'deepseek_api_latency_seconds',
    'DeepSeek API call latency',
    buckets=(0.5, 1.0, 2.0, 5.0, 10.0, 30.0)
)

class MetricsMiddleware:
    """性能监控中间件"""

    def __init__(self, pipeline: NeptuneDeepSeekPipeline):
        self.pipeline = pipeline
        self._original_query = pipeline.query

    async def query(self, *args, **kwargs):
        start = time.time()
        mode = kwargs.get("mode", "auto")

        try:
            result = await self._original_query(*args, **kwargs)
            QUERY_COUNTER.labels(mode=mode, status="success").inc()
            return result
        except Exception as e:
            QUERY_COUNTER.labels(mode=mode, status="error").inc()
            raise
        finally:
            QUERY_LATENCY.labels(stage="total").observe(time.time() - start)
```

### 12.9.4 未来展望

1. **Agent 化集成**：将 Neptune + DeepSeek 封装为 AI Agent，支持自主规划、工具调用和多步推理
2. **知识图谱自动构建**：利用 DeepSeek 从非结构化文档中自动抽取实体和关系，构建知识图谱
3. **多模态知识图谱**：融合文本、图片、代码等多模态数据，构建更丰富的知识表示
4. **联邦知识图谱**：跨组织共享知识图谱，在保护数据隐私的前提下实现知识协作

### 12.9.5 本章小结

Neptune + DeepSeek 集成架构通过知识图谱弥补了大语言模型在结构化知识检索上的不足，通过大语言模型降低了图数据库的使用门槛。Graph RAG 作为核心范式，将图结构检索与 LLM 生成能力有机结合，实现了精确、可解释、可追溯的企业级知识问答。向量搜索的引入进一步扩展了语义匹配能力，混合搜索策略在结构精确性和语义灵活性之间取得了平衡。

三种集成模式（LangChain、LlamaIndex、自定义 FastAPI）覆盖了从快速原型到生产系统的不同需求。性能优化、缓存策略和监控体系是生产化部署的关键保障。

随着 AI Agent 和多模态技术的发展，Neptune + DeepSeek 的集成将向更自主、更智能的方向演进，成为企业知识基础设施的核心组件。
