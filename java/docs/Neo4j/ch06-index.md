# 第6章 Neo4j 索引与查询优化

## 6.1 引言

在图形数据库中，查询性能直接决定了系统的可用性和用户体验。Neo4j 作为业界领先的图数据库，提供了丰富的索引机制和查询优化工具，帮助开发者在海量数据中实现毫秒级的查询响应。本章将深入探讨 Neo4j 的索引体系、查询计划分析以及性能优化策略，通过大量 Cypher 示例帮助读者掌握从理论到实践的完整知识体系。

索引的本质是一种以空间换时间的数据结构，它通过预先组织数据的存储方式，使得查询引擎能够快速定位目标数据，而无需遍历整个数据集。在 Neo4j 中，索引作用于节点的属性或关系，为 Cypher 查询中的匹配操作提供加速。理解索引的工作原理和适用场景，是进行查询优化的基础。

Neo4j 的索引体系经历了多个版本的演进。在 3.x 版本之前，Neo4j 主要依赖 Lucene 索引。从 3.5 版本开始，Neo4j 引入了原生索引（native index），直接构建在存储层之上，消除了 Lucene 的序列化开销。4.x 版本进一步统一了索引 API，5.x 版本则引入了更细粒度的索引类型（RANGE、TEXT、POINT、FULLTEXT），让开发者可以根据查询模式选择最合适的索引类型。

## 6.2 Neo4j 索引类型

Neo4j 支持多种索引类型，每种类型针对不同的查询场景进行了优化。从 3.x 版本开始，Neo4j 引入了原生索引（native index），取代了早期的 Lucene 索引方案。原生索引直接构建在 Neo4j 的存储层之上，具有更高的性能和更低的延迟。

### 6.2.1 B-tree 索引（RANGE 索引）

B-tree（平衡树）索引是 Neo4j 中最基础也是最常用的索引类型。在 Neo4j 5.x 中，它被正式命名为 RANGE 索引。它基于 B+ 树数据结构实现，适用于精确匹配、范围查询、排序和前缀搜索等场景。

**工作原理：** B-tree 索引将节点的属性值按照排序顺序组织成树形结构。每个树节点包含多个键值对，键是属性值，值是指向子节点或实际数据的指针。B+ 树的所有数据都存储在叶子节点中，内部节点仅存储路由信息。由于树的高度保持平衡，从根节点到任意叶子节点的路径长度相同，因此查询时间复杂度稳定在 O(log n)。对于 100 万条数据，B+ 树的典型高度仅为 3-4 层，这意味着最多只需要 3-4 次 I/O 操作就能定位到目标数据。

**B+ 树相比 B 树的优势：** B+ 树将数据全部集中在叶子节点，内部节点只存储键值用于路由，因此内部节点可以容纳更多的键，树的高度更低。同时，叶子节点之间通过链表相连，使得范围查询可以顺序遍历，无需回溯到父节点。

**适用场景：**
- 精确匹配：`WHERE n.name = 'Alice'`
- 范围查询：`WHERE n.age > 25 AND n.age < 50`
- 排序操作：`ORDER BY n.createdAt`
- 前缀匹配：`WHERE n.email STARTS WITH 'alice@'`
- IN 列表查询：`WHERE n.id IN [1, 2, 3]`

**创建 B-tree 索引：**

```cypher
// 创建单属性 B-tree 索引
CREATE INDEX person_name_index FOR (n:Person) ON (n.name);

// 创建单属性索引（显式指定类型）
CREATE BTREE INDEX person_age_index FOR (n:Person) ON (n.age);

// 创建范围索引（用于数值和日期范围查询）
CREATE RANGE INDEX person_created_index FOR (n:Person) ON (n.createdAt);
```

**使用示例：**

```cypher
// 创建测试数据
UNWIND range(1, 10000) AS id
CREATE (:Person {
  id: id,
  name: 'User_' + id,
  age: 20 + id % 50,
  email: 'user' + id + '@example.com',
  createdAt: datetime('2020-01-01') + duration({days: id})
});

// 精确匹配——使用索引
MATCH (p:Person)
WHERE p.name = 'User_5000'
RETURN p;

// 范围查询——使用索引
MATCH (p:Person)
WHERE p.age >= 30 AND p.age <= 40
RETURN count(p);

// 排序——使用索引
MATCH (p:Person)
WHERE p.createdAt > datetime('2020-06-01')
RETURN p.name, p.createdAt
ORDER BY p.createdAt
LIMIT 10;
```

**B-tree 索引的存储结构：** 在 Neo4j 的存储引擎中，B-tree 索引以页（page）为单位进行管理，默认页大小为 8KB。每个索引页可以存储数百个键值对。当索引数据量增长时，B-tree 会通过页分裂（page split）机制保持平衡。页分裂操作会触发写放大（write amplification），这也是为什么大量写入时索引维护成本较高的原因。

### 6.2.2 全文索引（Full-text Index）

全文索引基于 Apache Lucene 构建，专门用于处理文本内容的模糊搜索和语言感知查询。与 B-tree 索引的精确匹配不同，全文索引支持分词、词干提取、模糊匹配和评分排序等高级文本检索功能。

**核心特性：**
- 分词（Tokenization）：将文本拆分为独立的词条
- 词干提取（Stemming）：将单词还原为词根形式，如"running"→"run"
- 模糊匹配（Fuzzy Matching）：处理拼写错误和近似匹配
- 评分排序（Scoring）：基于 TF-IDF 或 BM25 算法对结果排序
- 语言感知：支持多种语言的文本分析，包括中文、日文、阿拉伯文等

**Lucene 的分词器（Analyzer）选择：**

| 分词器名称 | 适用语言 | 特点 |
|-----------|---------|------|
| standard | 英语及多数欧洲语言 | 按空格和标点分词，小写化 |
| chinese | 中文 | 基于词典的中文分词 |
| ik | 中文 | 更智能的中文分词（需安装插件） |
| japanese | 日文 | 支持日文分词和词性标注 |
| arabic | 阿拉伯文 | 支持阿拉伯文词干提取 |

**创建全文索引：**

```cypher
// 创建全文索引（需要调用专门的存储过程）
CALL db.index.fulltext.createNodeIndex(
  'person_fulltext_index',  // 索引名称
  ['Person'],               // 标签列表
  ['name', 'email'],        // 属性列表
  {analyzer: 'standard'}    // 分词器配置
);

// 为文章内容创建全文索引
CALL db.index.fulltext.createNodeIndex(
  'article_content_index',
  ['Article'],
  ['title', 'content'],
  {analyzer: 'chinese'}     // 中文分词器
);

// 创建关系全文索引
CALL db.index.fulltext.createRelationshipIndex(
  'review_content_index',
  ['Review'],
  ['content'],
  {analyzer: 'standard'}
);
```

**全文查询示例：**

```cypher
// 基本全文搜索——返回评分最高的结果
CALL db.index.fulltext.queryNodes(
  'person_fulltext_index',
  'User_5000'
) YIELD node, score
RETURN node.name, score
ORDER BY score DESC;

// 模糊搜索——处理拼写错误
CALL db.index.fulltext.queryNodes(
  'person_fulltext_index',
  'User_5000~'  // ~ 表示模糊匹配
) YIELD node, score
RETURN node.name, score;

// 布尔查询
CALL db.index.fulltext.queryNodes(
  'person_fulltext_index',
  'User_5000 OR User_5001'
) YIELD node, score
RETURN node.name, score;

// 短语查询
CALL db.index.fulltext.queryNodes(
  'article_content_index',
  '"图数据库性能优化"'  // 精确短语匹配
) YIELD node, score
RETURN node.title, score;

// 通配符查询
CALL db.index.fulltext.queryNodes(
  'person_fulltext_index',
  'User_*'  // * 表示任意字符
) YIELD node, score
RETURN node.name, score
LIMIT 10;

// 排除特定词
CALL db.index.fulltext.queryNodes(
  'article_content_index',
  '数据库 -MySQL'  // 减号表示排除
) YIELD node, score
RETURN node.title, score;
```

**全文索引的局限性：**
- 不能用于精确的等值比较（`=` 操作符）
- 不支持范围查询
- 不能用于 `ORDER BY` 排序（但可以按评分排序）
- 不支持复合查询中的部分属性匹配
- 全文索引的更新不是事务性的，存在一定的延迟

### 6.2.3 复合索引（Composite Index）

复合索引是在多个属性上联合建立的索引，用于优化涉及多个属性的查询条件。与单属性索引相比，复合索引可以更精确地定位数据，减少索引回表次数。

**创建复合索引：**

```cypher
// 创建复合 B-tree 索引
CREATE INDEX person_name_age_index FOR (n:Person) ON (n.name, n.age);

// 创建复合范围索引
CREATE RANGE INDEX person_age_created_index
  FOR (n:Person) ON (n.age, n.createdAt);
```

**复合索引的使用规则：**

复合索引遵循"最左前缀"原则：查询条件必须从索引定义的最左侧属性开始匹配，才能有效使用索引。这是因为 B+ 树按照索引定义的属性顺序构建键值，先按第一个属性排序，再按第二个属性排序，以此类推。

```cypher
// 有效使用复合索引 (name, age)
MATCH (p:Person)
WHERE p.name = 'User_100' AND p.age = 30
RETURN p;

// 有效使用复合索引——仅使用前缀部分
MATCH (p:Person)
WHERE p.name = 'User_100'
RETURN p;

// 有效使用复合索引——范围查询
MATCH (p:Person)
WHERE p.name = 'User_100' AND p.age > 25
RETURN p;

// 无效使用复合索引——跳过了 name
// 不会使用 (name, age) 复合索引
MATCH (p:Person)
WHERE p.age = 30
RETURN p;
```

**复合索引的列顺序选择策略：**

选择复合索引的列顺序时，应遵循以下原则：
1. **高选择性列在前**：能过滤掉更多数据的列放在前面。例如，name 的选择性远高于 gender。
2. **等值条件列在前**：查询中使用 `=` 的列放在范围查询列之前。
3. **频繁查询的列在前**：最常出现在查询条件中的列放在前面。

**复合索引 vs 多个单属性索引：**

```cypher
// 场景：同时按 name 和 age 查询

// 方案 A：两个单属性索引
CREATE INDEX person_name_idx FOR (n:Person) ON (n.name);
CREATE INDEX person_age_idx FOR (n:Person) ON (n.age);

// 方案 B：一个复合索引
CREATE INDEX person_name_age_idx FOR (n:Person) ON (n.name, n.age);

// 查询
MATCH (p:Person)
WHERE p.name = 'User_100' AND p.age = 30
RETURN p;
```

方案 A 中，Neo4j 的查询规划器会选择其中一个索引进行查找，然后对结果进行过滤。如果 name 索引返回 1 条记录，age 索引返回 200 条记录，规划器会选择 name 索引。方案 B 中，复合索引可以一步定位到精确结果，通常性能更优。但复合索引会增加写入开销，且灵活性不如多个单属性索引——复合索引无法用于仅查询 age 的场景。

### 6.2.4 文本索引（Text Index）

文本索引是 Neo4j 5.x 引入的新索引类型，专为字符串的精确匹配和前缀搜索优化。它比 B-tree 索引在字符串操作上具有更好的性能，因为文本索引使用了针对字符串优化的存储结构。

```cypher
// 创建文本索引
CREATE TEXT INDEX person_email_text_index FOR (n:Person) ON (n.email);

// 使用文本索引的查询
MATCH (p:Person)
WHERE p.email STARTS WITH 'user_500'
RETURN p.name, p.email;

// 文本索引也支持 CONTAINS 查询
MATCH (p:Person)
WHERE p.email CONTAINS '5000'
RETURN p.name, p.email;

// 文本索引支持 ENDS WITH 查询
MATCH (p:Person)
WHERE p.email ENDS WITH '@example.com'
RETURN p.name, p.email;
```

**文本索引与 RANGE 索引的对比：**

| 特性 | TEXT 索引 | RANGE 索引 |
|------|----------|-----------|
| STARTS WITH | 支持 | 支持 |
| CONTAINS | 支持 | 不支持 |
| ENDS WITH | 支持 | 不支持 |
| 正则表达式 | 不支持 | 不支持 |
| 精确匹配 | 支持 | 支持 |
| 范围查询 | 不支持 | 支持 |
| 排序 | 不支持 | 支持 |

### 6.2.5 点索引（Point Index）

点索引用于优化空间数据的查询，支持距离计算和地理空间操作。Neo4j 支持两种空间坐标系：WGS-84（经纬度，用于地理空间）和 Cartesian（笛卡尔坐标，用于平面空间）。

```cypher
// 创建点索引
CREATE POINT INDEX location_index FOR (n:Location) ON (n.coordinates);

// 创建包含位置信息的节点
CREATE (:Location {
  name: '北京',
  coordinates: point({latitude: 39.9042, longitude: 116.4074})
});

CREATE (:Location {
  name: '上海',
  coordinates: point({latitude: 31.2304, longitude: 121.4737})
});

CREATE (:Location {
  name: '广州',
  coordinates: point({latitude: 23.1291, longitude: 113.2644})
});

// 空间查询——查找附近的地点
MATCH (l:Location)
WHERE point.distance(l.coordinates, point({latitude: 39.9, longitude: 116.4})) < 100000
RETURN l.name, l.coordinates;

// 空间查询——查找指定范围内的点并按距离排序
MATCH (l:Location)
WHERE point.withinBBox(l.coordinates,
  point({latitude: 30, longitude: 110}),
  point({latitude: 40, longitude: 120})
)
RETURN l.name, l.coordinates;
```

### 6.2.6 关系索引

Neo4j 5.x 开始支持在关系属性上创建索引，这对于基于关系属性的过滤和排序操作至关重要。

```cypher
// 在关系属性上创建 RANGE 索引
CREATE RANGE INDEX friendship_weight_index
  FOR ()-[r:FRIEND_OF]-() ON (r.weight);

// 在关系属性上创建 TEXT 索引
CREATE TEXT INDEX review_content_index
  FOR ()-[r:REVIEWED]-() ON (r.content);

// 在关系属性上创建复合索引
CREATE RANGE INDEX friendship_weight_date_index
  FOR ()-[r:FRIEND_OF]-() ON (r.weight, r.createdAt);

// 使用关系索引的查询
MATCH (p:Person)-[r:FRIEND_OF]->(f:Person)
WHERE p.name = 'User_100' AND r.weight > 0.8
RETURN f.name, r.weight, r.createdAt
ORDER BY r.weight DESC;
```

关系索引的创建语法与节点索引类似，区别在于使用 `FOR ()-[r:RELATIONSHIP_TYPE]-() ON (r.property)` 语法。关系索引同样支持 RANGE、TEXT、POINT 和 FULLTEXT 四种类型。

## 6.3 索引创建与管理

### 6.3.1 索引创建语法

Neo4j 5.x 提供了统一的索引创建语法，支持指定索引类型和配置选项。

```cypher
// 基本语法
CREATE [index_type] INDEX index_name [IF NOT EXISTS]
  FOR (n:LabelName) ON (n.propertyName)
  [OPTIONS "{" optionKey: optionValue "}"];

// 示例：带选项的索引创建
CREATE RANGE INDEX person_id_index IF NOT EXISTS
  FOR (n:Person) ON (n.id)
  OPTIONS {indexConfig: {
    `spatial.cartesian.min`: [-100, -100],
    `spatial.cartesian.max`: [100, 100]
  }};

// 创建唯一约束（自动创建关联索引）
CREATE CONSTRAINT person_email_unique FOR (n:Person)
REQUIRE n.email IS UNIQUE;

// 创建节点键约束（复合唯一约束，自动创建复合索引）
CREATE CONSTRAINT person_unique_key FOR (n:Person)
REQUIRE (n.name, n.email) IS NODE KEY;
```

### 6.3.2 查看索引

```cypher
// 查看所有索引
SHOW INDEXES;

// 查看特定类型的索引
SHOW RANGE INDEXES;
SHOW TEXT INDEXES;
SHOW POINT INDEXES;
SHOW FULLTEXT INDEXES;

// 查看索引的详细状态
SHOW INDEXES YIELD id, name, type, entityType, labelsOrTypes,
  properties, state, provider, options, failureMessage;

// 查看索引的创建进度（对于正在填充的索引）
SHOW INDEXES YIELD name, state, progress
WHERE state = 'POPULATING';
```

`SHOW INDEXES` 的输出包含以下重要字段：
- **id**：索引的唯一标识符
- **name**：索引名称
- **type**：索引类型（RANGE, TEXT, POINT, FULLTEXT）
- **entityType**：实体类型（NODE 或 RELATIONSHIP）
- **labelsOrTypes**：标签或类型列表
- **properties**：索引属性列表
- **state**：索引状态（ONLINE, POPULATING, FAILED, OFFLINE）
- **provider**：索引提供者（native-btree-1.0 或 lucene-1.0）
- **failureMessage**：如果索引创建失败，显示错误信息

### 6.3.3 索引监控

```cypher
// 检查索引使用情况
CALL db.index.usage() YIELD index, labels, properties, type,
  entityType, userInstalled, readCount, writeCount
RETURN * ORDER BY readCount DESC;

// 检查索引大小
CALL db.indexes() YIELD indexName, indexType, label, properties,
  progress, provider, state
RETURN *;

// 查看索引的磁盘使用量
CALL db.index.usage() YIELD index, readCount, writeCount
RETURN index, readCount, writeCount,
  (readCount + writeCount) AS totalAccess
ORDER BY totalAccess DESC;
```

### 6.3.4 删除索引

```cypher
// 按名称删除索引
DROP INDEX person_name_index;

// 安全删除（如果存在）
DROP INDEX person_name_index IF EXISTS;

// 删除约束（同时删除关联的索引）
DROP CONSTRAINT person_email_unique IF EXISTS;
```

### 6.3.5 索引填充（Population）

创建索引时，Neo4j 需要将现有数据填充到索引中。这个过程称为索引填充（Index Population）。对于大表，索引填充可能需要较长时间。

```cypher
// 创建索引并监控填充进度
CREATE INDEX person_name_idx FOR (n:Person) ON (n.name);

// 在另一个会话中监控进度
SHOW INDEXES YIELD name, state, progress, type, labelsOrTypes, properties
WHERE name = 'person_name_idx';
```

**索引填充的性能影响：**
- 填充期间，索引对查询不可用（状态为 POPULATING）
- 填充过程会消耗 CPU 和 I/O 资源
- 对于生产环境，建议在维护窗口期创建索引
- 使用 `CREATE INDEX ... OPTIONS {indexConfig: {}}` 可以调整填充的批处理大小

### 6.3.6 索引维护最佳实践

**索引创建时机：**
- 在数据导入前创建索引：避免导入后的全量索引构建，适合数据量较小的场景
- 在数据导入后创建索引：适合批量导入场景，减少写入开销，但需要等待索引填充完成
- 使用 `CREATE INDEX IF NOT EXISTS`：确保幂等性，适合自动化部署脚本

**索引命名规范：**
```cypher
// 推荐命名格式：{Label}_{property}_{type}
CREATE INDEX Person_name_RANGE FOR (n:Person) ON (n.name);
CREATE INDEX Article_content_FULLTEXT FOR (n:Article) ON (n.content);
CREATE INDEX Person_email_TEXT FOR (n:Person) ON (n.email);
```

**索引数量控制：**
- 每个标签的索引数量建议不超过 5-8 个
- 频繁写入的属性谨慎建立索引
- 低选择性的属性（如性别、布尔值）不适合建立索引
- 定期使用 `CALL db.index.usage()` 检查索引使用率，删除从未使用的索引

**索引选择性的概念：**

索引选择性（Index Selectivity）是指索引列中不同值的数量与总行数的比值。选择性越高，索引越有效。例如，`id` 列的选择性为 1（每个值唯一），而 `gender` 列的选择性仅为 0.5（只有两个值）。对于选择性低于 0.1 的列，索引的收益通常有限。

## 6.4 查询计划分析

理解查询计划是进行查询优化的前提。Neo4j 提供了 `PROFILE` 和 `EXPLAIN` 两个关键工具，帮助开发者分析 Cypher 查询的执行过程。

### 6.4.1 EXPLAIN 与 PROFILE

**EXPLAIN** 仅生成查询计划而不执行查询，用于快速了解查询规划器的决策过程。它不产生实际数据，因此对系统无影响。EXPLAIN 适合在开发阶段快速验证索引是否被使用。

**PROFILE** 实际执行查询并收集详细的运行时统计信息，包括每个算子的处理行数、内存使用和执行时间。PROFILE 会实际运行查询，因此对于大查询需要注意执行时间。

```cypher
// 使用 EXPLAIN 查看查询计划
EXPLAIN MATCH (p:Person)
WHERE p.name = 'User_5000'
RETURN p;

// 使用 PROFILE 查看实际执行统计
PROFILE MATCH (p:Person)
WHERE p.name = 'User_5000'
RETURN p;
```

### 6.4.2 理解查询计划算子

查询计划由一系列算子（Operator）组成，每个算子代表一个执行步骤。以下是最常见的算子及其含义：

| 算子 | 含义 | 性能影响 |
|------|------|----------|
| NodeByLabelScan | 扫描标签下的所有节点 | 高（全表扫描） |
| NodeIndexSeek | 索引精确查找 | 低 |
| NodeIndexScan | 索引全扫描 | 中 |
| NodeIndexRangeSeek | 索引范围查找 | 低 |
| NodeIndexContainsScan | 索引 CONTAINS 扫描 | 中 |
| NodeIndexEndsWithScan | 索引 ENDS WITH 扫描 | 中 |
| Filter | 数据过滤 | 中 |
| Expand(All) | 扩展所有关系 | 取决于度数 |
| Expand(Into) | 扩展已知两端的关系 | 低 |
| Expand(RelationshipType) | 扩展指定类型的关系 | 中 |
| HashJoin | 哈希连接 | 中 |
| CartesianProduct | 笛卡尔积 | 极高 |
| Sort | 排序操作 | 中 |
| Top | 带限制的排序 | 低 |
| Skip | 跳过指定行数 | 低 |
| Limit | 限制行数 | 低 |
| Aggregation | 聚合操作 | 中 |
| EagerAggregation | 急切聚合 | 高 |
| Distinct | 去重操作 | 中 |
| Union | 并集操作 | 中 |
| Projection | 投影操作 | 低 |
| Apply | 子查询应用 | 取决于子查询 |

**示例：分析不同查询模式**

```cypher
// 场景 1：无索引的全标签扫描
PROFILE MATCH (p:Person)
WHERE p.name = 'User_5000'
RETURN p;
// 输出：NodeByLabelScan -> Filter

// 场景 2：有索引的精确查找
// 先创建索引
CREATE INDEX person_name_idx FOR (n:Person) ON (n.name);

// 再次分析
PROFILE MATCH (p:Person)
WHERE p.name = 'User_5000'
RETURN p;
// 输出：NodeIndexSeek
// 可以看到 db hits 大幅降低
```

### 6.4.3 解读 PROFILE 输出

PROFILE 输出的关键指标：

```cypher
PROFILE MATCH (p:Person)-[:FRIEND_OF]->(f:Person)
WHERE p.name = 'User_100'
RETURN f.name, f.age
ORDER BY f.age DESC
LIMIT 10;
```

输出解读要点：

1. **Rows**：每个算子处理的行数。如果某算子处理的行数远大于最终结果，说明存在过滤效率问题。例如，Filter 算子处理了 10000 行但只输出 100 行，说明过滤条件可以提前应用。

2. **DbHits**：数据库访问次数，是衡量查询成本的核心指标。理想情况下应接近结果集大小。DbHits 包括索引查找、节点访问、关系遍历等所有存储层操作。一个高效的查询应该将 DbHits 控制在结果集大小的 2-3 倍以内。

3. **Memory (Bytes)**：算子使用的内存量，对于排序、聚合等操作尤为重要。如果 Memory 值很大，说明查询需要在内存中缓存大量数据，可能导致 GC 压力或 OOM。

4. **Page Cache Hits/Misses**：页面缓存命中率，影响 I/O 性能。高命中率说明数据在内存中，低命中率说明需要从磁盘读取。

5. **Time (ms)**：实际执行时间。注意，首次执行的时间可能包含编译开销，多次执行的平均时间更有参考价值。

**优化目标：**
- 最小化 DbHits
- 尽早使用索引过滤数据
- 避免笛卡尔积和全标签扫描
- 减少不必要的展开操作
- 控制内存使用，避免 Eager 操作

### 6.4.4 查询规划器的选择逻辑

Neo4j 的查询规划器（Cypher Planner）基于成本优化（CBO，Cost-Based Optimizer）策略，为每个查询选择最优执行计划。规划器会考虑以下因素：

1. **索引可用性**：是否存在匹配的索引
2. **谓词选择性**：过滤条件的筛选能力
3. **数据分布**：属性的值分布情况
4. **统计信息**：节点数、关系数、度数分布

```cypher
// 查看数据库统计信息
CALL db.stats.retrieve('GRAPH');

// 查看特定标签的统计信息
CALL db.stats.retrieve('GRAPH') YIELD section, data
WHERE section = 'nodes'
RETURN section, data;

// 查看关系统计信息
CALL db.stats.retrieve('GRAPH') YIELD section, data
WHERE section = 'relationships'
RETURN section, data;
```

**规划器提示（Planner Hints）：**

在复杂查询中，可以使用提示来影响规划器的决策。但提示应谨慎使用，通常只在规划器做出次优选择时作为最后手段。

```cypher
// 强制使用特定索引
MATCH (p:Person)
USING INDEX p:Person(name)
WHERE p.name = 'User_100'
RETURN p;

// 强制使用标签扫描（不使用索引）
MATCH (p:Person)
USING SCAN p:Person
WHERE p.name = 'User_100'
RETURN p;

// 指定连接顺序
MATCH (a:Person)-[:FRIEND_OF]->(b:Person)-[:FRIEND_OF]->(c:Person)
USING JOIN ON b
WHERE a.name = 'User_100'
RETURN c.name;
```

### 6.4.5 常见查询计划模式解读

**模式一：索引查找 + 关系展开**

```
NodeIndexSeek → Expand(All) → Filter → Projection
```

这是最常见的模式。先通过索引定位起始节点，然后展开关系，最后过滤和投影。优化方向是确保起始节点的索引被使用，并限制展开的关系类型。

**模式二：全标签扫描 + 过滤**

```
NodeByLabelScan → Filter → Projection
```

这是需要避免的模式。说明查询条件没有使用索引，Neo4j 不得不扫描所有节点。解决方案是为查询条件创建合适的索引。

**模式三：笛卡尔积 + 过滤**

```
CartesianProduct → Filter → Projection
```

这是最危险的模式。两个无关联的 MATCH 子句会产生笛卡尔积，中间结果呈指数级增长。解决方案是确保 MATCH 子句之间存在关系连接。

**模式四：Eager 操作**

```
EagerAggregation → Sort → Projection
```

Eager 操作意味着 Neo4j 需要在继续执行之前消费所有上游数据。这通常发生在需要全局排序或聚合的场景。如果数据量很大，Eager 操作可能导致内存溢出。

## 6.5 查询模式优化

### 6.5.1 模式匹配优化

**避免无限制的路径匹配：**

```cypher
// 低效：无限制的变长路径
MATCH (a:Person)-[:FRIEND_OF*]->(b:Person)
WHERE a.name = 'User_100'
RETURN b;

// 高效：限制路径长度
MATCH (a:Person)-[:FRIEND_OF*1..3]->(b:Person)
WHERE a.name = 'User_100'
RETURN DISTINCT b;
```

无限制的变长路径（`[*]`）是性能杀手。Neo4j 需要探索所有可能的路径长度，在最坏情况下，路径数量随深度呈指数增长。始终指定最大长度可以显著减少搜索空间。

**使用方向约束：**

```cypher
// 低效：无方向匹配（需要双向搜索）
MATCH (a:Person)-[:FRIEND_OF]-(b:Person)
WHERE a.name = 'User_100'
RETURN b;

// 高效：指定方向
MATCH (a:Person)-[:FRIEND_OF]->(b:Person)
WHERE a.name = 'User_100'
RETURN b;
```

无方向匹配需要 Neo4j 同时检查出向和入向关系，搜索空间翻倍。如果业务逻辑允许，始终指定关系方向。

**使用最短路径函数：**

```cypher
// 使用 shortestPath 替代变长路径
MATCH (a:Person {name: 'User_100'}), (b:Person {name: 'User_500'})
MATCH path = shortestPath((a)-[:FRIEND_OF*]-(b))
RETURN length(path) AS distance;

// 使用 allShortestPaths 查找所有最短路径
MATCH (a:Person {name: 'User_100'}), (b:Person {name: 'User_500'})
MATCH path = allShortestPaths((a)-[:FRIEND_OF*]-(b))
RETURN path;
```

`shortestPath` 使用双向 BFS（广度优先搜索）算法，比普通的变长路径匹配高效得多。

### 6.5.2 WHERE 子句优化

**将过滤条件前置：**

```cypher
// 低效：先展开再过滤
MATCH (p:Person)-[:FRIEND_OF]->(f:Person)
WHERE p.name = 'User_100' AND f.age > 30
RETURN f;

// 高效：先过滤再展开
MATCH (p:Person)
WHERE p.name = 'User_100'
MATCH (p)-[:FRIEND_OF]->(f:Person)
WHERE f.age > 30
RETURN f;
```

将过滤条件前置可以减少中间结果集的大小。在第一个示例中，Neo4j 可能先展开所有 Person 的 FRIEND_OF 关系，然后再过滤。在第二个示例中，先通过索引定位到单个节点，再展开关系，效率高得多。

**使用 IN 替代多个 OR：**

```cypher
// 低效：多个 OR 条件
MATCH (p:Person)
WHERE p.name = 'User_100' OR p.name = 'User_200' OR p.name = 'User_300'
RETURN p;

// 高效：使用 IN 列表
MATCH (p:Person)
WHERE p.name IN ['User_100', 'User_200', 'User_300']
RETURN p;
```

IN 列表可以转换为一次索引范围查找，而多个 OR 条件可能需要多次独立的索引查找。

**避免在索引列上使用函数：**

```cypher
// 低效：函数包裹索引列，无法使用索引
MATCH (p:Person)
WHERE toUpper(p.name) = 'USER_100'
RETURN p;

// 高效：直接比较，可以使用索引
MATCH (p:Person)
WHERE p.name = 'User_100'
RETURN p;
```

在索引列上使用函数会阻止索引的使用，因为索引存储的是原始值而非函数计算结果。

### 6.5.3 关系查询优化

**使用关系类型过滤：**

```cypher
// 低效：展开所有关系再过滤
MATCH (p:Person)-[r]->(f:Person)
WHERE p.name = 'User_100' AND type(r) = 'FRIEND_OF'
RETURN f;

// 高效：在模式中指定关系类型
MATCH (p:Person)-[:FRIEND_OF]->(f:Person)
WHERE p.name = 'User_100'
RETURN f;
```

在模式中指定关系类型可以让 Neo4j 的存储引擎直接定位到特定类型的关系，避免遍历所有关系。

**利用关系属性索引：**

Neo4j 5.x 支持在关系属性上创建索引：

```cypher
// 在关系属性上创建索引
CREATE RANGE INDEX friendship_weight_index FOR ()-[r:FRIEND_OF]-() ON (r.weight);

// 使用关系属性过滤
MATCH (p:Person)-[r:FRIEND_OF]->(f:Person)
WHERE p.name = 'User_100' AND r.weight > 0.8
RETURN f.name, r.weight;
```

### 6.5.4 聚合与排序优化

**使用 Top 算子避免全量排序：**

```cypher
// 低效：全量排序
MATCH (p:Person)
WHERE p.age IS NOT NULL
RETURN p.name, p.age
ORDER BY p.age DESC;

// 高效：带限制的排序（使用 Top 算子）
MATCH (p:Person)
WHERE p.age IS NOT NULL
RETURN p.name, p.age
ORDER BY p.age DESC
LIMIT 10;
```

当查询包含 `ORDER BY` 和 `LIMIT` 时，Neo4j 可以使用 Top 算子，它只需要维护一个大小为 LIMIT 的堆，而不需要对所有结果进行全量排序。这在数据量很大时性能差异非常显著。

**利用索引排序：**

```cypher
// 如果 age 上有索引，ORDER BY 可以直接使用索引顺序
MATCH (p:Person)
WHERE p.age > 20
RETURN p.name, p.age
ORDER BY p.age
LIMIT 100;
```

当 `ORDER BY` 的列与索引的排序列一致时，Neo4j 可以直接按索引顺序读取数据，避免额外的排序操作。

**提前聚合减少数据量：**

```cypher
// 低效：先展开所有数据再聚合
MATCH (p:Person)-[:PURCHASED]->(o:Order)
RETURN p.name, count(o) AS orderCount, sum(o.total) AS totalSpent;

// 高效：使用 WITH 分步聚合
MATCH (p:Person)-[:PURCHASED]->(o:Order)
WITH p, count(o) AS orderCount, sum(o.total) AS totalSpent
WHERE orderCount > 5
RETURN p.name, orderCount, totalSpent
ORDER BY totalSpent DESC
LIMIT 20;
```

### 6.5.5 分页查询优化

```cypher
// 低效的分页方式（随着 SKIP 增大性能下降）
MATCH (p:Person)
RETURN p.name
ORDER BY p.id
SKIP 10000 LIMIT 10;

// 高效的分页方式——基于游标
MATCH (p:Person)
WHERE p.id > 10000
RETURN p.name, p.id
ORDER BY p.id
LIMIT 10;
```

基于 SKIP 的分页需要 Neo4j 获取并丢弃前 N 条记录，随着页码增大，性能急剧下降。基于游标的分页（也称为"键集分页"）利用索引直接定位到起始位置，性能稳定。

### 6.5.6 使用 EXISTS 和 IS NULL

```cypher
// 检查属性是否存在
MATCH (p:Person)
WHERE p.email IS NOT NULL
RETURN count(p);

// 使用 EXISTS 函数（功能相同，语义更清晰）
MATCH (p:Person)
WHERE EXISTS(p.email)
RETURN count(p);

// 查找缺少属性的节点
MATCH (p:Person)
WHERE p.email IS NULL
RETURN p.name;
```

### 6.5.7 Eager 与 Lazy 操作的理解

Neo4j 的查询执行分为 Eager（急切）和 Lazy（惰性）两种模式。Lazy 操作在需要时才从上游拉取数据，而 Eager 操作需要先消费所有上游数据才能继续。

**触发 Eager 操作的场景：**
- `MERGE` 操作
- `CREATE UNIQUE` 操作
- 需要在同一模式中同时创建和匹配的操作
- 某些 `SET` 操作（当属性被索引时）

```cypher
// 可能触发 Eager 的操作
MATCH (p:Person)
WHERE p.name = 'User_100'
SET p.age = 31
// 如果 age 上有索引，SET 操作可能触发 Eager

// 避免 Eager 的方法：分步执行
MATCH (p:Person)
WHERE p.name = 'User_100'
WITH p
SKIP 0
SET p.age = 31
```

## 6.6 避免全扫描

全标签扫描（NodeByLabelScan）是查询性能的最大敌人。当查询条件无法使用索引时，Neo4j 必须扫描标签下的所有节点，逐一检查条件是否满足。对于包含数百万节点的标签，全扫描的代价极高。

### 6.6.1 识别全扫描

```cypher
// 使用 PROFILE 识别全扫描
PROFILE MATCH (p:Person)
WHERE p.name CONTAINS 'User'
RETURN count(p);
// 输出中会出现 NodeByLabelScan + Filter 算子
```

**全扫描的典型场景：**

1. 查询条件使用的属性没有索引
2. 使用了不支持索引的操作符（如某些字符串函数）
3. 查询条件跳过了复合索引的前缀列
4. 使用了索引不支持的数据类型转换
5. 在索引列上使用了函数包裹

### 6.6.2 索引覆盖查询

当查询所需的所有数据都可以从索引中获取时，Neo4j 可以执行索引覆盖扫描（Index-Only Scan），避免访问实际节点。这是最高效的查询模式之一。

```cypher
// 创建覆盖索引所需的复合索引
CREATE INDEX person_name_age_idx FOR (n:Person) ON (n.name, n.age);

// 索引覆盖查询——所有返回字段都在索引中
PROFILE MATCH (p:Person)
WHERE p.name STARTS WITH 'User_100'
RETURN p.name, p.age;
// 输出：NodeIndexScan，无需回表访问

// 非覆盖查询——需要访问节点获取额外属性
PROFILE MATCH (p:Person)
WHERE p.name STARTS WITH 'User_100'
RETURN p.name, p.age, p.email;
// 输出：NodeIndexScan + Projection，需要回表获取 email
```

### 6.6.3 使用约束替代索引

在某些场景下，使用节点属性存在性约束可以替代索引，同时保证数据完整性：

```cypher
// 创建存在性约束（自动创建索引）
CREATE CONSTRAINT person_name_unique FOR (n:Person) REQUIRE n.name IS UNIQUE;

// 创建节点键约束（复合唯一约束）
CREATE CONSTRAINT person_unique_key FOR (n:Person)
REQUIRE (n.name, n.email) IS NODE KEY;

// 创建存在约束
CREATE CONSTRAINT person_email_exists FOR (n:Person)
REQUIRE n.email IS NOT NULL;
```

约束不仅保证数据完整性，还会自动创建对应的索引，一举两得。使用约束比手动创建索引更安全，因为约束确保了数据的唯一性和完整性。

### 6.6.4 查询重写技巧

**将 CONTAINS 转换为 STARTS WITH：**

```cypher
// 低效：CONTAINS 无法使用索引
MATCH (p:Person)
WHERE p.name CONTAINS 'User_100'
RETURN p;

// 高效：STARTS WITH 可以使用文本索引
MATCH (p:Person)
WHERE p.name STARTS WITH 'User_100'
RETURN p;
```

**使用路径长度限制：**

```cypher
// 低效：可能产生大量中间结果
MATCH path = (a:Person)-[:FRIEND_OF*]->(b:Person)
WHERE a.name = 'User_1'
RETURN length(path) AS distance, count(*) AS count;

// 高效：限制路径长度
MATCH path = (a:Person)-[:FRIEND_OF*1..4]->(b:Person)
WHERE a.name = 'User_1'
RETURN length(path) AS distance, count(*) AS count;
```

**使用子查询提前过滤：**

```cypher
// 低效：先展开再过滤
MATCH (p:Person)-[:FRIEND_OF]->(f:Person)
WHERE p.name = 'User_100'
MATCH (f)-[:PURCHASED]->(o:Order)
WHERE o.total > 1000
RETURN f.name, o.total;

// 高效：使用子查询提前缩小范围
MATCH (p:Person)
WHERE p.name = 'User_100'
CALL {
  WITH p
  MATCH (p)-[:FRIEND_OF]->(f:Person)
  RETURN f
}
MATCH (f)-[:PURCHASED]->(o:Order)
WHERE o.total > 1000
RETURN f.name, o.total;
```

**使用 EXISTS 子查询替代 OPTIONAL MATCH：**

```cypher
// 低效：OPTIONAL MATCH 后过滤 NULL
MATCH (p:Person)
OPTIONAL MATCH (p)-[:PURCHASED]->(o:Order)
WITH p, o
WHERE o IS NULL
RETURN p.name;

// 高效：使用 NOT EXISTS 子查询
MATCH (p:Person)
WHERE NOT EXISTS {
  MATCH (p)-[:PURCHASED]->(:Order)
}
RETURN p.name;
```

### 6.6.5 使用标签过滤减少扫描范围

当数据模型中存在多个标签时，利用标签过滤可以缩小扫描范围：

```cypher
// 低效：扫描所有 Person
MATCH (p:Person)
WHERE p.status = 'active' AND p.role = 'premium'
RETURN p;

// 高效：使用子标签缩小范围
// 假设 PremiumUser 是 Person 的子标签
MATCH (p:PremiumUser)
WHERE p.status = 'active'
RETURN p;
```

## 6.7 高级优化技术

### 6.7.1 使用 CALL 子查询

CALL 子查询（Subqueries）可以将复杂查询分解为多个步骤，每个步骤独立优化。子查询可以控制数据流，避免 Eager 操作，并允许在子查询内部使用 `LIMIT` 提前减少数据量。

```cypher
// 使用 CALL 子查询进行分步处理
MATCH (p:Person)
WHERE p.name = 'User_100'
CALL {
  WITH p
  MATCH (p)-[:FRIEND_OF]->(f:Person)
  WHERE f.age > 25
  RETURN f
}
CALL {
  WITH f
  MATCH (f)-[:PURCHASED]->(o:Order)
  WHERE o.total > 500
  RETURN o
}
RETURN f.name, o.id, o.total;
```

**CALL 子查询的三种模式：**

1. **独立子查询**：不依赖外部变量，可以独立执行
2. **关联子查询**：使用 `WITH` 传递外部变量
3. **聚合子查询**：在子查询内部进行聚合，返回汇总结果

```cypher
// 聚合子查询示例
MATCH (p:Person)
WHERE p.name = 'User_100'
CALL {
  WITH p
  MATCH (p)-[:PURCHASED]->(o:Order)
  RETURN count(o) AS orderCount, sum(o.total) AS totalSpent
}
RETURN p.name, orderCount, totalSpent;
```

### 6.7.2 使用 APOC 进行批量操作

APOC（Awesome Procedures on Cypher）提供了大量性能优化工具：

```cypher
// 使用 APOC 进行批量更新
CALL apoc.periodic.iterate(
  'MATCH (p:Person) WHERE p.age IS NULL RETURN p',
  'SET p.age = 30',
  {batchSize: 1000, parallel: true}
);

// 使用 APOC 进行批量索引创建
CALL apoc.index.addIndex('Person', 'name');

// 使用 APOC 进行批量删除
CALL apoc.periodic.iterate(
  'MATCH (p:Person) WHERE p.age > 100 RETURN p',
  'DETACH DELETE p',
  {batchSize: 500}
);

// 使用 APOC 进行数据导入
CALL apoc.periodic.iterate(
  'LOAD CSV FROM "file:///users.csv" AS row RETURN row',
  'CREATE (:Person {name: row.name, age: toInteger(row.age)})',
  {batchSize: 2000, parallel: true, retries: 3}
);
```

`apoc.periodic.iterate` 将操作分解为多个批次，每个批次在独立的事务中执行，避免了大事务导致的堆内存溢出和锁竞争。

### 6.7.3 查询缓存

Neo4j 会缓存编译后的查询计划，重复执行相同查询时可以跳过编译阶段：

```cypher
// 使用参数化查询以利用查询缓存
MATCH (p:Person)
WHERE p.name = $name AND p.age > $minAge
RETURN p;

// 执行时传入参数
:params {name: 'User_100', minAge: 25}
```

**参数化查询的优势：**
- 查询计划可复用，避免重复编译
- 避免 Cypher 注入攻击
- 减少查询编译开销
- 提高系统吞吐量

**不推荐的做法：**

```cypher
// 不推荐：每次使用不同的字面量
MATCH (p:Person)
WHERE p.name = 'User_100' AND p.age > 25
RETURN p;

MATCH (p:Person)
WHERE p.name = 'User_200' AND p.age > 30
RETURN p;
// 每次查询都会重新编译
```

### 6.7.4 使用安全性检查

```cypher
// 检查查询是否使用了索引
EXPLAIN MATCH (p:Person)
WHERE p.name = 'User_100'
RETURN p;
// 如果计划中包含 NodeIndexSeek，说明索引被使用
// 如果计划中包含 NodeByLabelScan，说明索引未被使用

// 检查索引状态
SHOW INDEXES
WHERE state = 'ONLINE' AND labelsOrTypes = ['Person'];

// 检查查询是否产生了笛卡尔积
EXPLAIN MATCH (a:Person), (b:Person)
WHERE a.name = 'User_100' AND b.name = 'User_200'
RETURN a, b;
// 如果计划中包含 CartesianProduct，需要警惕
```

### 6.7.5 数据模型优化

索引和查询优化不仅仅是技术层面的调整，数据模型的设计同样至关重要。

**合理使用标签：**

```cypher
// 低效：使用属性区分类型
MATCH (u:User)
WHERE u.type = 'premium' AND u.status = 'active'
RETURN u;

// 高效：使用标签区分类型
MATCH (u:PremiumUser)
WHERE u.status = 'active'
RETURN u;
```

使用标签而非属性来区分实体类型，可以让 Neo4j 利用标签索引快速定位数据。

**避免过度建模：**

```cypher
// 低效：过度使用中间节点
MATCH (u:User)-[:HAS_ADDRESS]->(a:Address)-[:IN_CITY]->(c:City)
WHERE u.name = 'User_100'
RETURN c.name;

// 高效：将地址信息作为属性
MATCH (u:User)
WHERE u.name = 'User_100'
RETURN u.city;
```

在关系型数据库中，规范化是好的实践。但在图数据库中，适度的反规范化可以减少遍历深度，提高查询性能。

### 6.7.6 内存配置优化

Neo4j 的性能不仅取决于查询本身，还与内存配置密切相关。

**关键配置参数：**

```
# neo4j.conf 中的内存配置

# 页面缓存（用于缓存节点、关系和属性）
server.memory.pagecache.size=4G

# 堆内存（用于查询执行和事务处理）
server.memory.heap.max_size=4G
server.memory.heap.initial_size=2G

# 事务内存
dbms.memory.transaction.global_max_size=256M
dbms.memory.transaction.max_size=64M
```

**内存配置建议：**
- 页面缓存通常设置为可用内存的 50-70%
- 堆内存设置为可用内存的 15-25%
- 页面缓存 + 堆内存不应超过物理内存的 80%，留出操作系统和其他进程的空间
- 对于大查询，适当增加事务内存限制

## 6.8 性能调优实战案例

### 6.8.1 案例一：社交网络好友查询

**场景：** 查询用户的好友中，年龄在 25-35 之间且最近一周有登录的活跃用户。

**初始查询：**

```cypher
MATCH (p:Person {name: 'User_100'})-[:FRIEND_OF]->(f:Person)
WHERE f.age >= 25 AND f.age <= 35
  AND f.lastLogin > datetime() - duration('P7D')
RETURN f.name, f.age, f.lastLogin
ORDER BY f.lastLogin DESC;
```

**优化过程：**

步骤 1：分析查询计划

```cypher
PROFILE MATCH (p:Person {name: 'User_100'})-[:FRIEND_OF]->(f:Person)
WHERE f.age >= 25 AND f.age <= 35
  AND f.lastLogin > datetime() - duration('P7D')
RETURN f.name, f.age, f.lastLogin
ORDER BY f.lastLogin DESC;
```

步骤 2：创建必要的索引

```cypher
// 为起始节点创建索引
CREATE INDEX person_name_idx FOR (n:Person) ON (n.name);

// 为过滤条件创建复合索引
CREATE INDEX person_age_login_idx FOR (n:Person) ON (n.age, n.lastLogin);
```

步骤 3：优化后的查询

```cypher
PROFILE MATCH (p:Person)
WHERE p.name = 'User_100'
MATCH (p)-[:FRIEND_OF]->(f:Person)
WHERE f.age >= 25 AND f.age <= 35
  AND f.lastLogin > datetime() - duration('P7D')
RETURN f.name, f.age, f.lastLogin
ORDER BY f.lastLogin DESC;
```

**优化效果分析：**
- 优化前：NodeByLabelScan（扫描所有 Person）+ Filter（过滤 name）+ Expand + Filter
- 优化后：NodeIndexSeek（通过 name 索引定位）+ Expand + NodeIndexRangeSeek（通过 age+lastLogin 索引过滤）
- DbHits 从数万降低到数十

### 6.8.2 案例二：商品推荐查询

**场景：** 为用户推荐其好友购买过但用户未购买的商品。

**初始查询：**

```cypher
MATCH (u:Person {name: 'User_100'})-[:FRIEND_OF]->(f:Person)
MATCH (f)-[:PURCHASED]->(p:Product)
WHERE NOT EXISTS {
  MATCH (u)-[:PURCHASED]->(p)
}
RETURN p.name, count(*) AS friendCount
ORDER BY friendCount DESC
LIMIT 10;
```

**优化过程：**

```cypher
// 创建索引
CREATE INDEX person_name_idx FOR (n:Person) ON (n.name);
CREATE INDEX product_name_idx FOR (n:Product) ON (n.name);

// 使用 PROFILE 分析
PROFILE MATCH (u:Person {name: 'User_100'})-[:FRIEND_OF]->(f:Person)
MATCH (f)-[:PURCHASED]->(p:Product)
WHERE NOT EXISTS {
  MATCH (u)-[:PURCHASED]->(p)
}
RETURN p.name, count(*) AS friendCount
ORDER BY friendCount DESC
LIMIT 10;
```

**进一步优化：**

```cypher
// 使用 WITH 提前过滤，减少子查询执行次数
MATCH (u:Person)
WHERE u.name = 'User_100'
MATCH (u)-[:FRIEND_OF]->(f:Person)
WITH u, f
MATCH (f)-[:PURCHASED]->(p:Product)
WHERE NOT EXISTS {
  MATCH (u)-[:PURCHASED]->(p)
}
RETURN p.name, count(*) AS friendCount
ORDER BY friendCount DESC
LIMIT 10;
```

### 6.8.3 案例三：时间序列数据查询

**场景：** 查询最近 30 天的订单数据，按日期聚合统计。

```cypher
// 创建时间索引
CREATE RANGE INDEX order_date_idx FOR (n:Order) ON (n.createdAt);

// 优化后的时间范围查询
PROFILE MATCH (o:Order)
WHERE o.createdAt >= datetime() - duration('P30D')
  AND o.createdAt < datetime()
RETURN date(o.createdAt) AS orderDate,
       count(*) AS orderCount,
       sum(o.total) AS totalAmount
ORDER BY orderDate;
```

**进一步优化——预聚合：**

对于时间序列数据，如果查询模式固定，可以考虑使用预聚合节点来避免每次实时计算：

```cypher
// 创建日聚合节点
MATCH (o:Order)
WHERE o.createdAt >= datetime() - duration('P30D')
WITH date(o.createdAt) AS orderDate,
     count(*) AS orderCount,
     sum(o.total) AS totalAmount
MERGE (d:DailySummary {date: orderDate})
SET d.orderCount = orderCount,
    d.totalAmount = totalAmount;

// 查询预聚合数据
MATCH (d:DailySummary)
WHERE d.date >= date() - duration('P30D')
RETURN d.date, d.orderCount, d.totalAmount
ORDER BY d.date;
```

### 6.8.4 案例四：图遍历深度优化

**场景：** 查找两个用户之间的最短社交路径。

```cypher
// 低效：使用变长路径
MATCH (a:Person {name: 'User_100'}), (b:Person {name: 'User_500'})
MATCH path = (a)-[:FRIEND_OF*]-(b)
RETURN path
ORDER BY length(path)
LIMIT 1;

// 高效：使用 shortestPath
MATCH (a:Person {name: 'User_100'}), (b:Person {name: 'User_500'})
MATCH path = shortestPath((a)-[:FRIEND_OF*]-(b))
RETURN path;

// 更高效：限制搜索深度
MATCH (a:Person {name: 'User_100'}), (b:Person {name: 'User_500'})
MATCH path = shortestPath((a)-[:FRIEND_OF*..6]-(b))
RETURN path;
```

`shortestPath` 使用双向 BFS 算法，从起点和终点同时向中间搜索，搜索空间从 O(b^d) 降低到 O(b^(d/2))，其中 b 是分支因子，d 是路径深度。

## 6.9 索引与查询优化的常见误区

### 误区一：索引越多越好

过多的索引会增加写入开销，每个索引在数据插入、更新、删除时都需要同步维护。对于写密集型的应用，需要仔细权衡索引数量。每个额外的索引都会使写入操作的延迟增加 10-30%。

```cypher
// 错误做法：为每个属性都创建索引
CREATE INDEX idx1 FOR (n:Person) ON (n.name);
CREATE INDEX idx2 FOR (n:Person) ON (n.age);
CREATE INDEX idx3 FOR (n:Person) ON (n.email);
CREATE INDEX idx4 FOR (n:Person) ON (n.city);
CREATE INDEX idx5 FOR (n:Person) ON (n.gender);  // 低选择性，无意义

// 正确做法：只为高频查询属性创建索引
CREATE INDEX idx_name FOR (n:Person) ON (n.name);
CREATE INDEX idx_email FOR (n:Person) ON (n.email);
```

### 误区二：忽略查询计划

不分析查询计划就进行优化，如同闭着眼睛开车。始终使用 `PROFILE` 或 `EXPLAIN` 验证优化效果。很多开发者凭直觉添加索引，却不验证索引是否被实际使用。

### 误区三：过度使用变长路径

变长路径匹配（`[*]`）是性能杀手，应始终指定最大长度。无限制的变长路径可能导致指数级的搜索空间爆炸。

### 误区四：忽略参数化

每次使用不同的字面量都会导致查询重新编译，浪费 CPU 资源。使用参数化查询不仅可以利用查询缓存，还能提高安全性。

### 误区五：在低选择性列上建索引

布尔值、性别等低基数（cardinality）属性不适合建立索引，索引无法有效缩小搜索范围。如果一个索引列的值只有 2-3 种可能，索引扫描仍然需要访问大部分数据。

### 误区六：忽略数据模型设计

索引不是万能的。糟糕的数据模型设计无法通过索引完全弥补。例如，将所有实体放在一个标签下，或者使用属性而非关系来表示连接，都会导致查询性能问题。

### 误区七：在生产环境直接创建索引

在生产环境创建索引时，索引填充过程会消耗大量资源，可能导致查询性能下降。建议在维护窗口期创建索引，或者使用 `CREATE INDEX ... OPTIONS {indexConfig: {}}` 控制填充速度。

### 误区八：认为 EXPLAIN 和 PROFILE 结果相同

EXPLAIN 显示的是规划器的预期计划，而 PROFILE 显示的是实际执行情况。两者可能不同，因为实际执行时的数据分布和统计信息可能与规划器的预期不一致。始终以 PROFILE 的结果为准。

## 6.10 性能监控与持续优化

### 6.10.1 慢查询日志

```cypher
// 配置慢查询日志（在 neo4j.conf 中）
// dbms.logs.query.enabled=true
// dbms.logs.query.threshold=1000ms  // 记录超过 1 秒的查询
// dbms.logs.query.parameter_logging_enabled=true
// dbms.logs.query.allocation_logging_enabled=true
// dbms.logs.query.page_logging_enabled=true
```

慢查询日志是发现性能问题的第一道防线。通过分析慢查询日志，可以识别出需要优化的查询模式。

### 6.10.2 使用 Metrics 监控

```cypher
// 查看数据库指标
CALL dbms.listConfig() YIELD name, value
WHERE name CONTAINS 'query'
RETURN name, value;

// 查看事务指标
CALL dbms.listConfig() YIELD name, value
WHERE name CONTAINS 'transaction'
RETURN name, value;
```

Neo4j 提供了丰富的 JMX 指标，可以通过监控工具（如 Prometheus + Grafana）进行可视化监控。关键指标包括：
- 查询执行时间分布
- 事务吞吐量
- 页面缓存命中率
- 索引使用统计

### 6.10.3 定期索引维护

```cypher
// 定期检查索引状态
SHOW INDEXES YIELD name, type, state, labelsOrTypes, properties
WHERE state <> 'ONLINE'
RETURN name, state, failureMessage;

// 重建失败索引
DROP INDEX failed_index IF EXISTS;
CREATE INDEX failed_index FOR (n:Label) ON (n.property);

// 检查未使用的索引
CALL db.index.usage() YIELD index, readCount, writeCount
WHERE readCount = 0 AND writeCount > 0
RETURN index, writeCount
ORDER BY writeCount DESC;
```

### 6.10.4 查询性能基准测试

```cypher
// 使用 APOC 进行性能测试
CALL apoc.periodic.commit(
  'MATCH (p:Person)
   WHERE p.name = $name
   WITH p
   LIMIT 1
   MATCH (p)-[:FRIEND_OF]->(f:Person)
   RETURN f',
  {name: 'User_100'}
);

// 使用 APOC 进行多次执行取平均值
CALL apoc.cypher.runMany(
  'MATCH (p:Person {name: "User_100"})-[:FRIEND_OF]->(f:Person)
   RETURN f.name LIMIT 10',
  {},
  {statistics: true}
);
```

### 6.10.5 查询日志分析

```cypher
// 查看最近执行的查询
CALL dbms.listActiveQueries() YIELD query, elapsedTimeMillis, status
RETURN query, elapsedTimeMillis, status
ORDER BY elapsedTimeMillis DESC;

// 终止长时间运行的查询
CALL dbms.killQuery('query-id');

// 查看查询执行统计
CALL dbms.queryJStack('query-id');
```

## 6.11 总结

本章详细介绍了 Neo4j 的索引体系和查询优化策略。核心要点总结如下：

1. **索引类型选择**：B-tree（RANGE）索引适用于精确匹配和范围查询；全文索引适用于文本搜索；复合索引适用于多条件查询；文本索引优化字符串操作；点索引用于空间查询。选择合适的索引类型是性能优化的第一步。

2. **索引管理**：使用 `CREATE INDEX` 创建索引，`SHOW INDEXES` 查看索引状态，`DROP INDEX` 删除索引。索引创建应遵循实际查询需求，避免过度索引。使用 `CALL db.index.usage()` 监控索引使用情况，及时清理未使用的索引。

3. **查询计划分析**：`EXPLAIN` 预览执行计划，`PROFILE` 获取实际执行统计。关注 DbHits、Rows 和 Memory 指标，识别全标签扫描和笛卡尔积等性能瓶颈。理解常见算子（NodeIndexSeek、NodeByLabelScan、Expand、Filter 等）的含义和性能影响。

4. **查询模式优化**：将过滤条件前置、使用方向约束、限制路径长度、使用参数化查询、利用索引排序和 Top 算子。避免在索引列上使用函数，使用 IN 替代多个 OR，使用 shortestPath 替代变长路径。

5. **避免全扫描**：为查询条件创建合适的索引，使用索引覆盖查询，利用约束自动创建索引，重写不兼容索引的查询模式。使用 PROFILE 验证索引是否被实际使用。

6. **高级优化技术**：使用 CALL 子查询分解复杂查询，使用 APOC 进行批量操作，利用查询缓存减少编译开销，合理配置内存参数。

7. **持续优化**：建立性能基准，监控慢查询，定期检查索引状态，根据实际查询模式调整索引策略。性能优化是一个持续的过程，需要结合具体的业务场景和数据特征进行针对性调整。

索引和查询优化是 Neo4j 开发中的核心技能。掌握本章介绍的技术和方法，可以帮助开发者构建高性能的图数据库应用。建议开发者在每次重大数据变更或查询模式变更后，重新评估索引策略和查询性能，确保系统始终运行在最佳状态。

## 6.12 练习与思考

1. 在 100 万节点的 Person 标签上，比较有索引和无索引时 `MATCH (p:Person {name: 'Alice'}) RETURN p` 的性能差异。使用 PROFILE 分析 DbHits 和执行时间的变化。

2. 设计一个电商系统的索引方案，包含用户、商品、订单三个标签，需要支持以下查询：
   - 按用户名查找用户
   - 查询用户最近 30 天的订单
   - 按商品分类和价格范围搜索商品
   - 推荐好友购买过的商品

3. 分析以下查询的性能问题并提出优化方案：

```cypher
MATCH (u:User)-[:FRIEND]->(f:User)
WHERE u.name = 'Alice'
MATCH (f)-[:BOUGHT]->(p:Product)
WHERE p.price > 100
MATCH (u)-[:BOUGHT]->(p2:Product)
WHERE NOT (u)-[:BOUGHT]->(p)
RETURN p.name, count(f) AS recommendScore
ORDER BY recommendScore DESC
LIMIT 20;
```

4. 使用 PROFILE 分析一个你正在开发的 Neo4j 查询，找出性能瓶颈并优化。记录优化前后的 DbHits 和执行时间对比。

5. 讨论在什么场景下应该使用全文索引而不是 B-tree 索引，两者的优缺点分别是什么。给出至少三个具体的业务场景。

6. 设计一个实验，比较复合索引和多个单属性索引在以下查询中的性能差异：
   - 等值查询：`WHERE a = 1 AND b = 2`
   - 范围查询：`WHERE a > 1 AND b < 10`
   - 单列查询：`WHERE b = 2`
   分析不同索引策略在不同查询模式下的优劣。

7. 思考在什么情况下即使有合适的索引，查询性能仍然不理想？列出至少三种可能的原因和对应的解决方案。
