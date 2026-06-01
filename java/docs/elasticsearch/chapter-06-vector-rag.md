# 第6章 场景四：AI 时代的向量检索（RAG 架构基石）

## 本章导读

2023 年 ChatGPT 爆发后，一个概念迅速走红：**RAG（Retrieval-Augmented Generation，检索增强生成）**。RAG 的核心思想是：当用户向 AI 提问时，不是让 AI 凭空回答，而是先从一个知识库中检索出相关文档，然后将这些文档作为"参考资料"连同问题一起给到 AI。这样 AI 的回答就有了事实依据，大幅降低了"幻觉"（Hallucination）。

在这个架构中，"从知识库中检索出相关文档"这一步的关键技术就是**向量检索**。传统的全文检索（Term-based）只能找到"包含相同关键词的文档"，但向量检索可以找到"语义相似的文档"——即使文档中完全不包含用户问题中的任何一个词。

举个例子：
- **用户提问**："怎么修 iPhone 的电池寿命？"
- **关键词检索**：搜索"修"+"iPhone"+"电池"+"寿命" → 找到包含这些词的手册
- **向量检索**："iPhone 电池健康度下降怎么办" → 找到了一篇标题为"延长 iPhone 使用时间的技巧"的文章（虽然没有"修"或"寿命"这两个词，但语义上高度相关）

ES 从 8.x 版本开始原生支持向量检索，使得 Elasticsearch 可以作为 RAG 架构的**知识库底座**。本章将讲解如何在 ES 中做向量检索，以及如何将向量检索与传统的标量字段过滤结合起来。

---

## 6.1 实现原理

### 从文本到向量——Embedding 模型

向量检索的第一步，是将文本转化为一个**浮点数数组**（向量）。这个过程由 Embedding 模型（如 OpenAI 的 text-embedding-ada-002、BERT 等）完成：

```
Embedding 的过程：

  原始文本：
  "iPhone 电池寿命短怎么办？"

      │
      ▼
  Embedding 模型（如 text-embedding-ada-002，输出 1536 维向量）
      │
      ▼
  向量（1536 个浮点数）：
  [0.0123, -0.0456, 0.0789, ..., 0.0034]
   ↑ 1536 维，每维一个 float32（4 字节）
  总共：1536 × 4 = 6KB 每个文档

  向量空间中的位置关系：
  
  "iPhone 电池寿命短怎么办" → 在"手机相关"区域的"维修"子区域
  "苹果手机电池健康度"    → 在"手机相关"区域的"健康"子区域（靠近）
  "今天天气真好"          → 在"天气"区域（远离）
  
  向量检索的核心：计算两个向量的距离（余弦相似度）
  距离近 → 语义相似
  距离远 → 语义不相关
```

### HNSW 算法——近似最近邻搜索

在向量空间中查找最近邻，最朴素的方法是"遍历所有向量、计算每个向量的距离"——这在百万级向量中是完全不可行的（检索一次可能需要几秒钟）。ES 使用 **HNSW（Hierarchical Navigable Small World，分层导航小世界）** 算法来实现**近似最近邻（ANN）搜索**，将检索时间从 O(N) 降低到 O(log N)。

```
HNSW 的分层结构：

  顶层（Level 3）——稀疏链接的"高速公路"
  ┌─────────────────────────────────────────┐
  │  节点 A ───────────── 节点 E            │
  │    │                                      │
  │    │             节点 G                    │
  │    │                                      │
  │  节点 C ───────────── 节点 K              │
  └─────────────────────────────────────────┘
  ↓ 从顶层开始，快速定位到目标区域

  中间层（Level 2）——区域内的"主干道"
  ┌─────────────────────────────────────────┐
  │  节点 A ── 节点 B ── 节点 D             │
  │    │        │                           │
  │  节点 C ── 节点 F ── 节点 G             │
  └─────────────────────────────────────────┘
  ↓ 逐层往下，精度逐步增加

  底层（Level 1）——密集链接的"街区路"
  ┌─────────────────────────────────────────┐
  │  节点 A ── 节点 B ── 节点 D ── 节点 E   │
  │    │        │        │        │         │
  │  节点 C ── 节点 F ── 节点 G ── 节点 H   │
  │    │        │        │        │         │
  │  节点 I ── 节点 J ── 节点 K ── 节点 L   │
  └─────────────────────────────────────────┘
  ↓ 在底层找到精确的 Top K 最近邻

  搜索过程：
  在顶层找到最近的节点 → 进入下一层 → 在该层找到最近的节点
  → 进入下一层 → ... → 在底层拿到精确的 Top K
  
  类似于：在地图上找目标城市
  先看地图概览（顶层），定位到目标省份
  再看城市地图（中层），定位到目标区域
  最后看街道地图（底层），找到精确位置
```

**HNSW 的核心参数**：

| 参数 | 含义 | 值越大 | 默认值 | 推荐值 |
|------|------|-------|-------|-------|
| `m` | 每个节点在底层最多连接的邻居数 | 精度越高、内存越大 | 16 | 16-64 |
| `ef_construction` | 构建索引时考虑的候选邻居数 | 索引质量越高、构建越慢 | 100 | 100-500 |
| `ef_search` | 搜索时考虑的候选邻居数 | 召回率越高、搜索越慢 | 在查询时指定 | 100-500 |

### 在 ES 中创建向量索引

```json
// 1. 创建索引——定义向量字段
PUT knowledge_base
{
  "mappings": {
    "properties": {
      "title": {                     // 文档标题（用于标量过滤）
        "type": "text",
        "analyzer": "ik_max_word"
      },
      "content": {                   // 文档内容（用于标量过滤）
        "type": "text",
        "analyzer": "ik_max_word"
      },
      "category": {                  // 分类（用于过滤）
        "type": "keyword"
      },
      "status": {                    // 状态（用于过滤）
        "type": "keyword"
      },
      "content_vector": {            // 向量字段——存储 Embedding
        "type": "dense_vector",      // 稠密向量类型
        "dims": 1536,                // 向量维度（与 Embedding 模型一致）
        "index": true,               // 构建 HNSW 索引
        "similarity": "cosine",      // 相似度度量方式
        "index_options": {
          "type": "hnsw",
          "m": 16,                   // 每个节点连接数
          "ef_construction": 100     // 构建时的候选集大小
        }
      },
      "publish_time": {              // 发布时间（用于过滤）
        "type": "date"
      }
    }
  }
}
```

---

## 6.2 潜在风险

### 风险一：高维向量极耗内存

```
向量索引的内存估算：

  HNSW 索引的内存消耗 = 向量数据 + 图的邻接表

  向量数据：
    每个向量：1536 维 × 4 字节（float32）= 6KB
    100 万文档：100 万 × 6KB = 6GB

  图的邻接表：
    每个节点：m × 2 × 4 字节（出边 + 入边）
    m=16：每个节点 128 字节
    100 万节点：100 万 × 128B = 128MB

  总计：
    100 万文档的 HNSW 索引 ≈ 6.13GB（不包括原始文档）

  1 亿文档的向量索引：
    1 亿 × 6KB = 600GB！
    这通常需要多台机器才能放下
```

### 风险二：纯向量搜索缺乏业务规则过滤

```
一个典型的 RAG 搜索需求：

  用户：帮我查一下"iPhone 电池维修"的相关资料
  业务规则：
  - 只搜索"status: published"（已发布的文章）
  - 只搜索"category: phone_repair"（手机维修类）
  - 过滤掉 "price > 1000" 的付费文章

  纯向量搜索的问题：
  向量搜索只根据语义相似度排序，它不知道"已发布"、"手机维修类"这些条件
  如果在向量搜索之后再过滤，可能会发现 Top 10 中有 5 条不符合业务规则
  → 返回的结果不够数

  解决方法：Pre-filtering（先过滤，再搜索）
  → 先用标量字段过滤出一个子集
  → 在子集中做向量搜索
```

---

## 6.3 优化与应对方案

### kNN Search with Pre-filter（ES 8.x+）

ES 8.x 引入了 `knn` 查询，支持在向量搜索之前先做标量过滤：

```json
// kNN Search with Pre-filter
// 先在标量字段上过滤，再在子集中做向量搜索

GET knowledge_base/_search
{
  "knn": {
    "field": "content_vector",
    "k": 10,                      // 返回 Top 10
    "num_candidates": 100,        // 候选集大小（越大精度越高，搜索越慢）
    "query_vector": [             // 用户问题的向量（由 Embedding 模型生成）
      0.0123, -0.0456, 0.0789, ...
    ],
    "filter": {                   // ⚠️ Pre-filter：先过滤
      "bool": {
        "filter": [
          { "term": { "status": "published" } },
          { "term": { "category": "phone_repair" } },
          { "range": { "publish_time": { "gte": "2023-01-01" } } }
        ]
      }
    }
  },
  "_source": ["title", "content", "category", "publish_time"]
}
```

### kNN + Bool Query 混合搜索

在一些场景中，你可能需要**同时做全文搜索和向量搜索**，然后把结果结合。这在 ES 中通过 `knn` + `query` 来实现：

```json
// 混合搜索：全文检索 + 向量检索，结合各自的优势

GET knowledge_base/_search
{
  "knn": {
    "field": "content_vector",
    "k": 5,
    "num_candidates": 50,
    "query_vector": [/* 向量 */],
    "filter": { "term": { "status": "published" } }
  },
  "query": {
    "bool": {
      "must": [
        { "match": { "title": "iPhone 电池" } }
      ],
      "filter": [
        { "term": { "status": "published" } }
      ]
    }
  },
  "size": 10,
  // 排序：按 _score 混合排序
  // 注意：knn 的 _score（余弦相似度）和 query 的 _score（BM25）
  // 取值范围不同，ES 会做归一化
  "sort": [
    { "_score": { "order": "desc" } }
  ]
}
```

### 调整 HNSW 参数

```json
// 根据业务场景调整 HNSW 参数

// 场景 A：精度优先（如法律文档检索，需要高召回率）
PUT legal_docs
{
  "mappings": {
    "properties": {
      "content_vector": {
        "type": "dense_vector",
        "dims": 1536,
        "index": true,
        "similarity": "cosine",
        "index_options": {
          "type": "hnsw",
          "m": 64,                    // 增加连接数
          "ef_construction": 500      // 增加构建时的候选数
        }
      }
    }
  }
}

// 场景 B：性能优先（如商品推荐，需要低延迟）
PUT product_recommend
{
  "mappings": {
    "properties": {
      "product_vector": {
        "type": "dense_vector",
        "dims": 256,                  // 降低维度（使用更小的 Embedding 模型）
        "index": true,
        "similarity": "cosine",
        "index_options": {
          "type": "hnsw",
          "m": 8,                     // 减少连接数
          "ef_construction": 50       // 减少候选数
        }
      }
    }
  }
}
```

### Java 集成：Spring Boot 向量搜索

```xml
<dependency>
    <groupId>co.elastic.clients</groupId>
    <artifactId>elasticsearch-java</artifactId>
    <version>8.12.0</version>
</dependency>
```

```java
@Service
public class VectorSearchService {

    private final ElasticsearchClient client;

    public VectorSearchService(ElasticsearchClient client) {
        this.client = client;
    }

    /**
     * 执行 RAG 向量搜索
     *
     * @param queryText   用户问题
     * @param statusFilter 状态过滤
     * @param size        返回条数
     */
    public List<Document> search(String queryText, String statusFilter, int size)
            throws IOException {

        // 1. 将用户问题转为向量（调用 Embedding 服务）
        float[] queryVector = embeddingService.embed(queryText);

        // 2. 构建 kNN 查询
        SearchResponse<Document> response = client.search(s -> s
            .index("knowledge_base")
            .knn(k -> k
                .field("content_vector")
                .queryVector(queryVector)
                .k(size)
                .numCandidates(size * 10)
                .filter(f -> f
                    .term(t -> t.field("status").value(statusFilter)))
            )
            .source(sc -> sc
                .filter(ff -> ff
                    .includes("title", "content", "category"))),
            Document.class
        );

        // 3. 封装结果
        return response.hits().hits().stream()
            .map(hit -> {
                Document doc = hit.source();
                doc.setScore(hit.score());
                return doc;
            })
            .collect(Collectors.toList());
    }
}
```

---

## 本章总结

| 技术组件 | 解决的问题 | 注意点 |
|---------|-----------|-------|
| **Dense Vector 字段** | 存储 Embedding 向量 | dims 必须与 Embedding 模型一致 |
| **HNSW 索引** | 近似最近邻搜索 | m/ef_construction 调优精度与性能 |
| **Pre-filter** | 标量字段先过滤 | ES 8.x+ 支持 |
| **kNN + Query 混合** | 全文搜索 + 向量搜索结合 | _score 的归一化 |
| **RAG** | 检索增强生成 | Embedding 模型选择是关键 |

**核心原则**：
1. **向量检索是 RAG 的核心，但不是全部**——完整的 RAG 系统还需要 Embedding 模型、Prompt 工程、LLM 三个组件。ES 负责的是中间的"检索"部分
2. **Pre-filtering 先做标量过滤再做向量搜索**——这是 ES 8.x 的正确做法，比 Post-filtering（先搜索再过滤）精度更高
3. **高维向量非常占用内存**——1536 维 × float32 = 6KB/文档。100 万文档 = 6GB。在规划集群容量时必须纳入考量
4. **HNSW 参数要根据业务调优**——m 和 ef_construction 越大，精度越高（内存消耗也越大）。不要无脑设最大值，要在自己的数据集上做 benchmark