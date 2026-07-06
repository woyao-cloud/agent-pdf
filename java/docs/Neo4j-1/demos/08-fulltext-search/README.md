# 第8章：全文搜索

> 当你要在大量文本中搜索时，`CONTAINS` 的性能会非常差。全文索引基于 Lucene 搜索引擎，支持模糊搜索、评分排序，性能好 100 倍以上。

---

## 📖 本章导读

### 一个真实的故事

小冯在开发一个知识库系统，用户需要搜索文档。他最初用 `CONTAINS` 来实现：

```cypher
MATCH (d:Document)
WHERE d.content CONTAINS "图数据库"
RETURN d.title
```

数据量只有几百条时还好，当文档增长到 10 万条后，这个查询需要 10 秒以上。因为 `CONTAINS` 是**全表扫描**——Neo4j 遍历每个文档，逐字检查内容是否包含关键词。

后来他改用全文索引：

```cypher
CREATE FULLTEXT INDEX fulltext_document FOR (n:Document) ON EACH [n.title, n.content];

CALL db.index.fulltext.queryNodes('fulltext_document', '图数据库')
YIELD node, score
RETURN node.title, score
ORDER BY score DESC
```

查询时间从 10 秒降到了 **50 毫秒**，还支持评分排序、模糊搜索、多字段联合搜索。

**这就是全文索引的威力——200 倍的性能提升，还多了搜索功能。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **创建全文索引** — 在指定字段上建立 Lucene 搜索引擎
2. **执行各种全文搜索** — 基本搜索、模糊搜索、短语搜索、排除搜索
3. **理解评分机制** — 知道搜索结果为什么按这个顺序排列
4. **管理全文索引** — 刷新、删除、查看索引状态

---

## 🧠 核心概念详解

### 全文索引 vs 普通索引

| 对比 | 普通索引（B-tree） | 全文索引（Lucene） |
|------|------------------|------------------|
| 支持的操作 | `=`, `>`, `<`, `IN` | 关键词搜索、模糊搜索、短语搜索 |
| 中文支持 | 不支持 | 需要配置中文分词器 |
| 评分排序 | 不支持 | 支持（TF-IDF/BM25） |
| 多字段搜索 | 不支持 | 支持 |
| 性能（文本搜索） | 慢（全表扫描） | 快（倒排索引） |

### 全文搜索语法

| 搜索类型 | 语法 | 例子 |
|---------|------|------|
| 基本搜索 | `关键词` | `'图数据库'` |
| 多词搜索（AND） | `词1 词2` | `'Cypher 查询'` |
| 模糊搜索 | `关键词*` | `'优化*'` |
| 短语搜索 | `"精确短语"` | `'"图数据库建模"'` |
| 排除搜索 | `词1 -词2` | `'图数据库 -入门'` |
| OR 搜索 | `词1 OR 词2` | `'Neo4j OR Cypher'` |

### 评分机制

全文搜索返回的 `score` 表示匹配程度，分数越高表示越相关。评分基于 **BM25 算法**（改进的 TF-IDF）：

- **词频（TF）**：关键词在文档中出现的次数越多，分数越高
- **逆文档频率（IDF）**：关键词在整个文档集中越罕见，分数越高
- **字段权重**：标题中的匹配比内容中的匹配权重更高

---

## 🛠️ 动手实践

### 第一步：启动并初始化

```bash
cd demos/08-fulltext-search
docker compose up -d
docker exec -it neo4j-fulltext cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第二步：执行全文搜索

打开 http://localhost:7481，执行以下查询。

#### 练习1：基本搜索

```cypher
CALL db.index.fulltext.queryNodes('fulltext_document', '图数据库')
YIELD node, score
RETURN node.title AS title, score
ORDER BY score DESC
```

**预期结果**：返回包含"图数据库"的文档，按相关性评分排序。最相关的应该是《图数据库建模最佳实践》和《Neo4j入门指南》。

#### 练习2：模糊搜索

```cypher
CALL db.index.fulltext.queryNodes('fulltext_document', '优化*')
YIELD node, score
RETURN node.title AS title, score
```

**预期结果**：匹配"优化"开头的词，如"优化技巧"、"优化查询"。

#### 练习3：短语搜索

```cypher
CALL db.index.fulltext.queryNodes('fulltext_document', '"图数据库建模"')
YIELD node, score
RETURN node.title AS title, score
```

**预期结果**：只匹配包含"图数据库建模"这个精确短语的文档。

#### 练习4：排除搜索

```cypher
CALL db.index.fulltext.queryNodes('fulltext_document', '图数据库 -入门')
YIELD node, score
RETURN node.title AS title, score
```

**预期结果**：返回包含"图数据库"但不包含"入门"的文档。

---

## ⚠️ 常见误区

### 误区1：全文索引是同步的

**问题**：刚创建全文索引后，数据可能还没有被索引。立即搜索可能找不到刚创建的数据。

**解决方案**：
```cypher
-- 等待索引刷新
CALL db.index.fulltext.awaitEventuallyConsistentIndexRefresh();
```

### 误区2：中文分词需要额外配置

**问题**：Neo4j 默认的全文索引使用标准分析器，对中文支持有限。

**解决方案**：需要配置中文分词器（如 IK Analyzer、jieba），或者使用外部搜索引擎（如 Elasticsearch）。

### 误区3：全文索引不能用于精确匹配

**问题**：全文索引适合搜索"包含关键词"的文档，不适合精确匹配（如 `WHERE id = "DOC001"`）。

**正确做法**：精确匹配用 B-tree 索引，全文搜索用全文索引。

---

## 💭 思考题

1. 全文搜索的评分（score）是怎么计算的？为什么有些文档评分更高？
2. 如果要实现"搜索标题和内容，但标题匹配的权重更高"，应该怎么做？
3. 全文索引和 Elasticsearch 相比，各有什么优缺点？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it neo4j-fulltext cypher-shell -u neo4j -p password123 -f /init.cypher
docker compose down -v
```
