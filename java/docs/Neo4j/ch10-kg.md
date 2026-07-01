# 第10章 知识图谱构建：从数据到智慧的 Neo4j 实践

## 10.1 知识图谱概述

### 10.1.1 什么是知识图谱

知识图谱（Knowledge Graph, KG）是一种用图结构来建模知识和实体间关系的技术体系。其核心思想是"用节点表示实体，用边表示关系"，从而将分散、异构的数据组织成一张语义网络。知识图谱的概念最早由 Google 于 2012 年提出，用于增强搜索引擎的语义理解能力，但图结构化的知识表示思想可以追溯到语义网络（Semantic Network）和本体论（Ontology）。

一个典型的知识图谱由三元组（Triple）构成，形式为 `(头实体, 关系, 尾实体)`，例如 `(姚明, 效力于, 休斯顿火箭)`。在 Neo4j 中，这种三元组天然映射为：

```
(:Player {name: '姚明'}) -[:PLAYS_FOR]-> (:Team {name: '休斯顿火箭'})
```

知识图谱的价值在于：它不仅能回答"姚明效力于哪支球队"这样的简单问题，还能通过多跳推理回答"姚明效力过的球队中，哪些进入了季后赛"这类复杂问题。这正是图数据库相比传统关系型数据库的核心优势所在。

### 10.1.2 知识图谱的技术栈

构建一个生产级知识图谱通常涉及以下技术层次：

| 层次 | 技术组件 | Neo4j 生态对应 |
|------|----------|----------------|
| 数据接入层 | 爬虫、API、消息队列 | APOC、Kafka 插件 |
| NLP 处理层 | 分词、NER、关系抽取 | Neosemantics、NLP 插件 |
| 知识融合层 | 实体对齐、冲突消解 | Graph Data Science 库 |
| 存储查询层 | 图数据库、索引 | Neo4j 原生图存储、索引 |
| 推理分析层 | 规则推理、图算法 | GDS、Cypher 递归查询 |
| 应用层 | 问答系统、推荐引擎 | Bloom、GraphQL 端点 |

Neo4j 在整个技术栈中扮演着"存储 + 计算 + 推理"三位一体的核心角色。其原生图存储（Native Graph Storage）确保了关联查询的"无索引邻接遍历"（Index-Free Adjacency），使得多跳查询的性能不随数据量增长而退化。

### 10.1.3 知识图谱与图数据库的映射关系

理解知识图谱的 RDF 数据模型与 Neo4j 的属性图模型之间的映射关系至关重要：

| RDF 概念 | 属性图概念 | Neo4j 实现 |
|----------|-----------|------------|
| 三元组 (s, p, o) | 关系 (n1)-[r]->(n2) | 节点 + 关系 |
| 资源 URI | 节点 ID / 属性 | id() / 属性字段 |
| 字面量 (Literal) | 节点属性 | 属性值 |
| 类型 (rdf:type) | 标签 (Label) | :Person, :Company |
| 命名图 (Named Graph) | 数据库 / 图 | 多数据库实例 |
| 本体 (Ontology) | 约束 + 索引 | 模式约束、索引 |

Neo4j 的属性图模型相比 RDF 三元组模型有两个关键优势：一是属性可以直接挂在关系和节点上，避免了 RDF 中需要引入中间节点来表示属性值的复杂模式；二是 Cypher 查询语言比 SPARQL 更直观易用，尤其对开发者友好。

## 10.2 Neo4j 中的知识图谱数据模型设计

### 10.2.1 属性图模型的核心要素

Neo4j 采用属性图模型（Property Graph Model），其核心要素包括：

- **节点（Node）**：表示实体，可以有一个或多个标签（Label）
- **关系（Relationship）**：表示实体间的连接，有且仅有一个类型（Type），必须带有方向
- **属性（Property）**：键值对，可以附加在节点和关系上
- **标签（Label）**：用于对节点进行分类和索引

设计知识图谱的数据模型时，需要遵循以下原则：

**原则一：实体即节点，关系即边。** 不要将关系建模为节点属性，而应使用显式的关系类型。例如，不应在 Player 节点上设置 `teamName` 属性，而应创建 `-[:PLAYS_FOR]->` 关系。

**原则二：关系类型应具有语义明确性。** 关系类型名应使用动词或动词短语，如 `WORKS_AT`、`FOUNDED`、`MARRIED_TO`，而非模糊的 `RELATED_TO`。

**原则三：利用标签进行类型区分。** 标签相当于 RDF 中的 `rdf:type`，应充分利用标签来区分实体类型，而非通过属性值判断。

### 10.2.2 领域本体的图建模

以金融风控领域的知识图谱为例，展示从领域本体到 Neo4j 模型的完整设计过程。

**领域本体定义（简化）：**

```
实体类型：Person, Company, Account, Transaction, Address
关系类型：WORKS_AT(Person→Company), OWNS(Person→Account), 
          TRANSFERS(Account→Account), REGISTERED_AT(Company→Address)
属性：Person {name, idCard, phone}, Company {name, creditCode, regCapital}
```

**对应的 Neo4j 建模：**

```cypher
// 创建约束和索引
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.idCard IS UNIQUE;
CREATE CONSTRAINT company_id IF NOT EXISTS FOR (c:Company) REQUIRE c.creditCode IS UNIQUE;
CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name);
CREATE INDEX company_name IF NOT EXISTS FOR (c:Company) ON (c.name);

// 创建示例数据
CREATE (p:Person {name: '张三', idCard: '110101199001011234', phone: '13800138000'})
CREATE (c:Company {name: '星辰科技有限公司', creditCode: '91110108MA01ABCD1X', regCapital: 10000000})
CREATE (a1:Account {accountNo: '6222021234567890', bank: '工商银行', openDate: date('2020-01-15')})
CREATE (a2:Account {accountNo: '6222020987654321', bank: '工商银行', openDate: date('2021-06-01')})
CREATE (addr:Address {full: '北京市海淀区中关村大街1号', district: '海淀区', city: '北京'})

CREATE (p)-[:WORKS_AT {position: 'CEO', since: date('2020-01-01')}]->(c)
CREATE (p)-[:OWNS {type: '对公账户'}]->(a1)
CREATE (p)-[:OWNS {type: '个人账户'}]->(a2)
CREATE (c)-[:REGISTERED_AT]->(addr)
```

### 10.2.3 复杂关系的建模模式

现实世界中的关系往往带有时间属性、置信度、来源等上下文信息。在 RDF 中，这需要引入"重化关系"（Reified Relation）模式，而在 Neo4j 中，关系属性天然支持这种场景。

**时序关系建模：**

```cypher
// 人员任职关系带有时间区间
CREATE (p:Person {name: '李四'})
CREATE (c:Company {name: '未来科技'})
CREATE (p)-[:WORKS_AT {
  position: 'CTO',
  fromDate: date('2019-03-01'),
  toDate: date('2023-12-31'),
  isCurrent: false,
  source: '企业年报',
  confidence: 0.95
}]->(c)
```

**N-ary 关系（多元关系）建模：**

当关系涉及三个或更多实体时，需要引入中间节点：

```cypher
// 合同关系涉及甲方、乙方、担保方
CREATE (contract:Contract {no: 'HT2024001', amount: 5000000, signDate: date('2024-01-15'})
CREATE (partyA:Company {name: '甲方公司'})
CREATE (partyB:Company {name: '乙方公司'})
CREATE (guarantor:Company {name: '担保公司'})

CREATE (partyA)-[:AS_PARTY_A]->(contract)
CREATE (partyB)-[:AS_PARTY_B]->(contract)
CREATE (guarantor)-[:AS_GUARANTOR]->(contract)
```

### 10.2.4 分层架构设计

企业级知识图谱通常采用分层架构：

```
应用层（Application Layer）
    ↑
概念层（Concept Layer）— 本体定义、类型体系
    ↑
实例层（Instance Layer）— 具体实体和关系
    ↑
原始数据层（Raw Data Layer）— 结构化/非结构化数据源
```

在 Neo4j 中，可以通过多数据库功能实现物理分层：

```cypher
// 创建分层数据库
CREATE DATABASE kg_ontology;    // 概念层：本体定义
CREATE DATABASE kg_instance;    // 实例层：实体关系
CREATE DATABASE kg_raw;         // 原始数据层

// 在概念层创建本体节点
:USE kg_ontology;
CREATE (:OntologyClass {name: 'Person', description: '自然人'})
CREATE (:OntologyClass {name: 'Company', description: '企业法人'})
CREATE (:ObjectProperty {name: 'WORKS_AT', domain: 'Person', range: 'Company'})
```

## 10.3 实体识别与关系抽取

### 10.3.1 命名实体识别（NER）

命名实体识别是从非结构化文本中识别出具有特定意义的实体，如人名、地名、机构名等。在知识图谱构建流程中，NER 是第一步，也是最关键的一步。

**基于 Neo4j + NLP 管道的实体识别架构：**

```
非结构化文本
    ↓
分词 + 词性标注（jieba / HanLP / Stanford NLP）
    ↓
命名实体识别（CRF / BiLSTM-CRF / BERT）
    ↓
实体消歧（Entity Disambiguation）
    ↓
实体链接（Entity Linking）→ 写入 Neo4j
```

**使用 APOC + NLP 插件进行实体识别：**

Neo4j 的 APOC 库提供了与外部 NLP 服务集成的能力：

```cypher
// 配置 NLP 端点（以 Stanford CoreNLP 为例）
CALL apoc.nlp.stanford.graphs('
  姚明出生于上海，曾效力于休斯顿火箭队。退役后，他担任了中国篮球协会主席。
', {
  nodeSpec: 'Person|Organization|Location',
  relSpec: 'MENTIONS'
}) YIELD graph AS g
RETURN g;
```

**自定义实体识别流程：**

在实际项目中，通常需要结合领域词典进行定制化 NER：

```cypher
// 创建领域词典
CREATE (d:DomainDict {entity: '知识图谱', type: 'Technology', weight: 0.9})
CREATE (d2:DomainDict {entity: '图数据库', type: 'Technology', weight: 0.85})
CREATE (d3:DomainDict {entity: 'Neo4j', type: 'Product', weight: 0.95})

// 创建索引加速匹配
CREATE INDEX domain_dict_entity IF NOT EXISTS FOR (d:DomainDict) ON (d.entity);
```

### 10.3.2 关系抽取方法

关系抽取的目标是从文本中识别出实体之间的语义关系。主要方法包括：

**基于模板的关系抽取：**

```cypher
// 定义关系抽取模板
CREATE (tpl:ExtractionTemplate {
  name: 'founder_template',
  pattern: '(?<founder>\\S{2,4})创办了(?<company>\\S+(?:科技|技术|网络|有限公司))',
  relationType: 'FOUNDED',
  confidence: 0.8
})
```

**基于远程监督的关系抽取：**

利用已有的知识图谱作为监督信号，自动标注文本中的关系实例：

```cypher
// 利用已有知识图谱中的实体关系对，回标文本数据
MATCH (p:Person)-[:FOUNDED]->(c:Company)
RETURN p.name AS founder, c.name AS company
// 输出结果用于构建训练数据
```

**基于预训练模型的关系抽取：**

使用 BERT 等预训练语言模型进行关系分类，结果通过 APOC 写入 Neo4j：

```cypher
// 将关系抽取结果写入图数据库
CALL apoc.create.node(['ExtractedRelation'], {
  text: '阿里巴巴由马云创立',
  headEntity: '马云',
  tailEntity: '阿里巴巴',
  relationType: 'FOUNDED',
  confidence: 0.92,
  source: 'news_article_001',
  extractedAt: datetime()
}) YIELD node AS relNode
RETURN relNode;
```

### 10.3.3 端到端的抽取流水线

构建一个完整的抽取流水线，将非结构化文本转化为图数据：

```cypher
// 定义完整的抽取流程
CALL apoc.periodic.iterate(
  'MATCH (doc:Document) WHERE doc.processed IS NULL RETURN doc',
  '
    // 1. 调用 NLP 服务进行实体识别
    CALL apoc.nlp.stanford.graphs(doc.content, {
      nodeSpec: "Person|Organization|Location|Date",
      relSpec: "MENTIONS"
    }) YIELD graph AS nlpGraph
    
    // 2. 将识别结果写入图数据库
    CALL apoc.graph.fromData(nlpGraph.nodes, nlpGraph.relationships) YIELD graph
    
    // 3. 标记文档已处理
    SET doc.processed = true,
        doc.processedAt = datetime()
  ',
  {batchSize: 10, parallel: true}
) YIELD batches, total, timeTaken, committedOperations
RETURN batches, total, timeTaken;
```

### 10.3.4 实体链接与消歧

实体链接（Entity Linking）是将文本中识别出的实体指称（Mention）映射到知识图谱中已有实体的过程。实体消歧（Entity Disambiguation）则解决同名实体在不同上下文中的歧义问题。

**基于上下文相似度的实体消歧：**

```cypher
// 计算候选实体与上下文的相似度
MATCH (m:Mention {text: '苹果'})
// 候选实体1：水果
// 候选实体2：科技公司
OPTIONAL MATCH (e1:Entity {name: '苹果', type: 'Fruit'})
OPTIONAL MATCH (e2:Entity {name: '苹果', type: 'Company'})

// 计算上下文相似度（简化示例）
WITH m,
     CASE 
       WHEN m.context CONTAINS '手机' OR m.context CONTAINS 'iPhone' THEN e2
       WHEN m.context CONTAINS '水果' OR m.context CONTAINS '吃' THEN e1
     END AS bestEntity

// 创建实体链接
CALL apoc.create.relationship(m, 'LINKED_TO', {
  confidence: 0.9,
  method: 'context_similarity'
}, bestEntity) YIELD rel
RETURN m, bestEntity, rel;
```

## 10.4 知识融合与对齐

### 10.4.1 实体对齐（Entity Alignment）

实体对齐是知识融合的核心任务，旨在发现不同数据源中指向同一现实世界实体的不同表示。在 Neo4j 中，实体对齐可以通过多种策略实现。

**基于属性相似度的对齐：**

```cypher
// 使用 Jaccard 相似度进行实体对齐
MATCH (a:Person {source: 'source_a'})
MATCH (b:Person {source: 'source_b'})
WHERE a.name = b.name 
   OR a.idCard = b.idCard
   OR a.phone = b.phone

// 计算综合相似度
WITH a, b,
     CASE WHEN a.name = b.name THEN 0.3 ELSE 0 END +
     CASE WHEN a.idCard = b.idCard THEN 0.5 ELSE 0 END +
     CASE WHEN a.phone = b.phone THEN 0.2 ELSE 0 END AS similarity

WHERE similarity >= 0.5

// 创建对齐关系
MERGE (a)-[r:SAME_AS {similarity: similarity, method: 'attribute_matching'}]->(b)
RETURN a.name, b.name, similarity;
```

**基于邻居结构的对齐：**

利用图结构信息进行实体对齐，即如果两个实体的邻居实体相似，则它们本身也可能指向同一实体：

```cypher
// 基于共同邻居的实体对齐
MATCH (a:Person {name: '张三', source: 'source_a'})
MATCH (b:Person {name: 'Zhang San', source: 'source_b'})

// 计算共同邻居数量
OPTIONAL MATCH (a)-[]->(common)<-[]-(b)
WITH a, b, count(DISTINCT common) AS commonNeighbors

// 计算 Jaccard 系数
OPTIONAL MATCH (a)-[]->(aNeighbors)
OPTIONAL MATCH (b)-[]->(bNeighbors)
WITH a, b, commonNeighbors,
     toFloat(commonNeighbors) / (count(DISTINCT aNeighbors) + count(DISTINCT bNeighbors) - commonNeighbors) AS jaccard

WHERE jaccard > 0.3
MERGE (a)-[:SAME_AS {jaccard: jaccard, method: 'structural_matching'}]->(b);
```

### 10.4.2 冲突消解（Conflict Resolution）

当多个数据源对同一实体的属性值存在矛盾时，需要进行冲突消解。常见的策略包括：

**基于置信度的冲突消解：**

```cypher
// 为每个数据源分配置信度
CREATE (ds1:DataSource {name: '工商注册系统', confidence: 0.95})
CREATE (ds2:DataSource {name: '企业官网', confidence: 0.7})
CREATE (ds3:DataSource {name: '新闻媒体', confidence: 0.5})

// 冲突消解：选择置信度最高的值
MATCH (c:Company {name: '星辰科技'})
MATCH (c)-[r:HAS_ATTRIBUTE]->(attr:Attribute {name: '注册资本'})
WITH c, attr, max(r.confidence) AS maxConf
MATCH (c)-[r:HAS_ATTRIBUTE]->(attr)
WHERE r.confidence = maxConf
SET c.regCapital = attr.value,
    c.regCapitalSource = r.source,
    c.regCapitalConfidence = maxConf;
```

**基于时间戳的冲突消解：**

```cypher
// 选择最新的属性值
MATCH (c:Company {name: '星辰科技'})
MATCH (c)-[r:HAS_ATTRIBUTE]->(attr:Attribute {name: '注册资本'})
WITH c, attr, max(r.updatedAt) AS latestUpdate
MATCH (c)-[r:HAS_ATTRIBUTE]->(attr)
WHERE r.updatedAt = latestUpdate
SET c.regCapital = attr.value,
    c.regCapitalUpdatedAt = latestUpdate;
```

### 10.4.3 知识融合的 GDS 实践

Neo4j Graph Data Science (GDS) 库提供了丰富的图算法，可用于知识融合的相似度计算：

```cypher
// 使用 GDS 的 Node Similarity 算法进行实体对齐
// 1. 创建投影图
CALL gds.graph.project(
  'entity_similarity',
  ['Person', 'Company', 'Account'],
  ['WORKS_AT', 'OWNS', 'TRANSFERS']
)

// 2. 运行节点相似度算法
CALL gds.nodeSimilarity.write('entity_similarity', {
  writeRelationshipType: 'SIMILAR',
  writeProperty: 'similarity',
  similarityCutoff: 0.5,
  topK: 10
}) YIELD nodesCompared, relationshipsWritten
RETURN nodesCompared, relationshipsWritten;

// 3. 基于相似度创建对齐关系
MATCH (a)-[r:SIMILAR]->(b)
WHERE r.similarity > 0.7
  AND a.source <> b.source
MERGE (a)-[:SAME_AS {similarity: r.similarity}]->(b);
```

## 10.5 知识推理与查询

### 10.5.1 基于规则的推理

知识推理是从已知事实推导出新知识的过程。Neo4j 支持多种推理方式，最直接的是基于 Cypher 的规则推理。

**传递闭包推理：**

```cypher
// 定义传递规则：如果 A 控制 B，B 控制 C，则 A 控制 C
MATCH (a:Person)-[:CONTROLS]->(b:Company)-[:CONTROLS]->(c:Company)
WHERE NOT EXISTS ((a)-[:CONTROLS]->(c))
CREATE (a)-[:CONTROLS {
  inferred: true,
  rule: 'transitive_control',
  confidence: 0.8
}]->(c)
RETURN a.name, c.name;
```

**基于属性的分类推理：**

```cypher
// 规则：持股比例超过 50% 视为控制
MATCH (p:Person)-[:HOLDS_SHARES {ratio: ratio}]->(c:Company)
WHERE ratio > 0.5
  AND NOT EXISTS ((p)-[:CONTROLS]->(c))
CREATE (p)-[:CONTROLS {
  inferred: true,
  rule: 'majority_shareholding',
  confidence: 0.95,
  shareRatio: ratio
}]->(c);
```

**多步推理链：**

```cypher
// 推理：实际控制人识别
// 规则链：A 控制 B，B 控制 C → A 是 C 的实际控制人
MATCH path = (p:Person)-[:CONTROLS*1..5]->(c:Company)
WHERE ALL(rel IN relationships(path) WHERE rel.inferred = true OR rel.inferred IS NULL)
WITH p, c, 
     reduce(conf = 1.0, rel IN relationships(path) | conf * rel.confidence) AS pathConfidence,
     length(path) AS depth
WHERE pathConfidence > 0.5
MERGE (p)-[:ACTUAL_CONTROLLER {
  inferred: true,
  confidence: pathConfidence,
  controlDepth: depth
}]->(c)
RETURN p.name, c.name, pathConfidence, depth
ORDER BY pathConfidence DESC;
```

### 10.5.2 基于图算法的推理

Neo4j GDS 库提供了丰富的图算法，可用于知识图谱中的隐含关系发现。

**社区发现用于隐含关系推理：**

```cypher
// 使用 Louvain 算法发现资金往来社区
CALL gds.graph.project(
  'transaction_network',
  'Account',
  {TRANSFERS: {orientation: 'UNDIRECTED'}}
)

CALL gds.louvain.write('transaction_network', {
  writeProperty: 'communityId'
}) YIELD communityCount, modularity;

// 同一社区内的账户可能具有隐含关联
MATCH (a1:Account)-[:TRANSFERS*2..5]-(a2:Account)
WHERE a1.communityId = a2.communityId
  AND a1 <> a2
  AND NOT EXISTS ((a1)-[:IMPLICIT_LINK]->(a2))
CREATE (a1)-[:IMPLICIT_LINK {
  inferred: true,
  method: 'community_detection',
  communityId: a1.communityId
}]->(a2);
```

**PageRank 用于实体重要性推理：**

```cypher
// 计算实体的影响力
CALL gds.pageRank.write('entity_similarity', {
  writeProperty: 'influenceScore',
  maxIterations: 100,
  dampingFactor: 0.85
}) YIELD nodePropertiesWritten;

// 高影响力实体可能是关键节点
MATCH (n) WHERE n.influenceScore > 0.1
SET n:KeyEntity
RETURN labels(n), n.name, n.influenceScore
ORDER BY n.influenceScore DESC;
```

### 10.5.3 基于路径的查询推理

Cypher 的路径查询能力使得多跳推理变得非常自然：

```cypher
// 查询：找出与目标公司存在间接关联的所有自然人和法人
MATCH path = (target:Company {name: '目标公司'})
      <-[:CONTROLS|HOLDS_SHARES*1..5]-
      (entity)
WHERE entity:Person OR entity:Company
RETURN entity.name AS entityName,
       labels(entity) AS entityType,
       [rel IN relationships(path) | type(rel)] AS relationChain,
       length(path) AS distance
ORDER BY distance;
```

**最短路径用于关联分析：**

```cypher
// 查询两个实体之间的最短关联路径
MATCH path = shortestPath(
  (a:Person {name: '张三'})-[*..10]-(b:Company {name: '目标公司'})
)
RETURN [node IN nodes(path) | 
  CASE 
    WHEN node:Person THEN '人:' + node.name
    WHEN node:Company THEN '公司:' + node.name
    WHEN node:Account THEN '账户:' + node.accountNo
    ELSE node.name
  END
] AS pathNodes,
[rel IN relationships(path) | type(rel)] AS pathRelations,
length(path) AS pathLength;
```

**所有路径查询用于全面关联分析：**

```cypher
// 查询所有可能的关联路径（用于合规审查）
MATCH path = (a:Person {name: '张三'})-[*1..6]-(b:Company {name: '目标公司'})
WHERE ALL(n IN nodes(path) WHERE n IS NOT NULL)
RETURN path, length(path) AS depth
ORDER BY depth
LIMIT 100;
```

### 10.5.4 时序推理

结合时间属性的推理是知识图谱的高级应用：

```cypher
// 时序推理：查询某个时间点的有效关系
MATCH (p:Person)-[r:WORKS_AT]->(c:Company)
WHERE r.fromDate <= date('2023-06-01')
  AND (r.toDate IS NULL OR r.toDate >= date('2023-06-01'))
RETURN p.name, c.name, r.position, r.fromDate, r.toDate;

// 时序推理：检测时间冲突
MATCH (p:Person)-[r1:WORKS_AT]->(c1:Company)
MATCH (p)-[r2:WORKS_AT]->(c2:Company)
WHERE c1 <> c2
  AND r1.fromDate <= r2.toDate
  AND r2.fromDate <= r1.toDate
  AND r1.fromDate IS NOT NULL
  AND r2.fromDate IS NOT NULL
RETURN p.name AS person,
       c1.name AS company1, r1.fromDate AS start1, r1.toDate AS end1,
       c2.name AS company2, r2.fromDate AS start2, r2.toDate AS end2;
```

## 10.6 企业级知识图谱实现

### 10.6.1 架构设计

企业级知识图谱的典型架构包括以下组件：

```
┌─────────────────────────────────────────────┐
│              应用层 (API / Bloom / GraphQL)  │
├─────────────────────────────────────────────┤
│              查询层 (Cypher / GDS)          │
├─────────────────────────────────────────────┤
│              推理层 (规则引擎 / 图算法)       │
├─────────────────────────────────────────────┤
│              融合层 (实体对齐 / 冲突消解)     │
├─────────────────────────────────────────────┤
│              存储层 (Neo4j 集群)             │
├─────────────────────────────────────────────┤
│              接入层 (ETL / Kafka / APOC)     │
└─────────────────────────────────────────────┘
```

### 10.6.2 数据接入与 ETL

**基于 APOC 的批量数据导入：**

```cypher
// 从 CSV 文件批量导入企业数据
LOAD CSV WITH HEADERS FROM 'file:///enterprise_data.csv' AS row
FIELDTERMINATOR ','
CREATE (c:Company {
  name: row.company_name,
  creditCode: row.credit_code,
  regCapital: toIntegerOrNull(row.reg_capital),
  status: row.status,
  establishDate: date(row.establish_date),
  source: row.source,
  importedAt: datetime()
});

// 创建关系索引以加速后续关联
CREATE INDEX rel_company_credit IF NOT EXISTS FOR (c:Company) ON (c.creditCode);
```

**增量数据同步：**

```cypher
// 使用 MERGE 实现增量更新
LOAD CSV WITH HEADERS FROM 'file:///incremental_data.csv' AS row
MERGE (c:Company {creditCode: row.credit_code})
ON CREATE SET 
  c.name = row.company_name,
  c.regCapital = toIntegerOrNull(row.reg_capital),
  c.status = row.status,
  c.createdAt = datetime()
ON MATCH SET
  c.name = row.company_name,
  c.regCapital = toIntegerOrNull(row.reg_capital),
  c.status = row.status,
  c.updatedAt = datetime();
```

**基于 Kafka 的流式接入：**

```cypher
// 使用 Neo4j Streams 插件消费 Kafka 消息
// 在 neo4j.conf 中配置：
// streams.sink.enabled=true
// streams.source.topic.entities=kg_entity_events

// Cypher 处理流式数据
CALL streams.consume('kg_entity_events', {
  timeout: 1000
}) YIELD data
UNWIND data AS event
CALL apoc.merge.node(
  [event.entityType],
  {id: event.entityId},
  event.properties,
  {updatedAt: datetime()}
) YIELD node
RETURN node;
```

### 10.6.3 数据质量与治理

**数据质量检查：**

```cypher
// 检查孤立节点（没有任何关系的节点）
MATCH (n)
WHERE size([(n)--() | 1]) = 0
  AND n:Person OR n:Company OR n:Account
SET n:Orphan
RETURN labels(n) AS type, count(*) AS orphanCount;

// 检查重复实体
MATCH (c:Company)
WITH c.name AS name, collect(c) AS companies
WHERE size(companies) > 1
UNWIND companies AS company
RETURN name, company.creditCode, company.source, company.importedAt
ORDER BY name, company.importedAt;

// 检查属性完整性
MATCH (p:Person)
WHERE p.idCard IS NULL OR p.name IS NULL
SET p:Incomplete
RETURN count(*) AS incompleteCount;
```

**数据血缘追踪：**

```cypher
// 为每个实体记录数据来源
CREATE (source:DataSource {
  name: '工商数据源',
  type: 'API',
  endpoint: 'https://api.gsxt.gov.cn/v1/company',
  lastSync: datetime(),
  recordCount: 10000
})

// 实体与数据源关联
MATCH (c:Company {creditCode: '91110108MA01ABCD1X'})
MATCH (ds:DataSource {name: '工商数据源'})
CREATE (c)-[:FROM_SOURCE {
  importedAt: datetime(),
  batchId: 'BATCH_20240101',
  rawData: '{"company_name":"星辰科技","reg_capital":10000000}'
}]->(ds);
```

### 10.6.4 性能优化

**索引策略：**

```cypher
// 创建复合索引
CREATE INDEX company_name_status IF NOT EXISTS FOR (c:Company) ON (c.name, c.status);

// 创建全文索引
CREATE FULLTEXT INDEX company_fulltext IF NOT EXISTS FOR (n:Company) ON EACH [n.name, n.address];

// 使用全文索引进行模糊搜索
CALL db.index.fulltext.queryNodes('company_fulltext', '星辰科技 OR 星辰科技有限') 
YIELD node, score
RETURN node.name, node.creditCode, score
ORDER BY score DESC;
```

**查询优化技巧：**

```cypher
// 避免全表扫描：使用索引
// 不推荐：
MATCH (c:Company) WHERE c.name CONTAINS '科技' RETURN c;

// 推荐：使用全文索引
CALL db.index.fulltext.queryNodes('company_fulltext', '科技') YIELD node, score
RETURN node.name, score;

// 使用 PROFILE 分析查询计划
PROFILE
MATCH (p:Person {idCard: '110101199001011234'})
MATCH (c:Company {creditCode: '91110108MA01ABCD1X'})
MATCH path = shortestPath((p)-[*..10]-(c))
RETURN length(path) AS distance;
```

**批量操作优化：**

```cypher
// 使用 apoc.periodic.iterate 进行大批量操作
CALL apoc.periodic.iterate(
  'MATCH (c:Company) WHERE c.regCapital IS NOT NULL RETURN c',
  'SET c.regCapitalLevel = 
     CASE 
       WHEN c.regCapital < 1000000 THEN "小型"
       WHEN c.regCapital < 50000000 THEN "中型"
       ELSE "大型"
     END',
  {batchSize: 1000, parallel: true, retries: 3}
) YIELD batches, total, timeTaken, retries
RETURN batches, total, timeTaken, retries;
```

### 10.6.5 安全与权限管理

```cypher
// 创建用户和角色
CREATE USER kg_admin SET PASSWORD 'secure_password_here' CHANGE NOT REQUIRED;
CREATE USER kg_reader SET PASSWORD 'reader_password' CHANGE NOT REQUIRED;
CREATE USER kg_etl SET PASSWORD 'etl_password' CHANGE NOT REQUIRED;

// 创建角色
CREATE ROLE kg_full_access;
CREATE ROLE kg_read_only;
CREATE ROLE kg_etl_role;

// 授予权限
GRANT ALL ON DATABASE kg_instance TO kg_full_access;
GRANT MATCH ON GRAPH kg_instance TO kg_read_only;
GRANT READ ON GRAPH kg_instance TO kg_read_only;
GRANT WRITE ON GRAPH kg_instance TO kg_etl_role;
GRANT MATCH ON GRAPH kg_instance TO kg_etl_role;

// 分配角色
GRANT ROLE kg_full_access TO kg_admin;
GRANT ROLE kg_read_only TO kg_reader;
GRANT ROLE kg_etl_role TO kg_etl;

// 属性级权限控制（通过 Cypher 查询实现）
// 敏感信息脱敏查询
MATCH (p:Person)
RETURN p.name, 
       apoc.text.mask(p.idCard, 4, '****') AS maskedIdCard,
       apoc.text.mask(p.phone, 3, '****') AS maskedPhone;
```

## 10.7 企业级应用案例

### 10.7.1 金融风控知识图谱

**场景：** 某银行构建企业信贷风控知识图谱，整合工商、司法、税务、舆情等多源数据。

**数据模型：**

```cypher
// 核心实体
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.idCard IS UNIQUE;
CREATE CONSTRAINT company_credit IF NOT EXISTS FOR (c:Company) REQUIRE c.creditCode IS UNIQUE;
CREATE CONSTRAINT case_id IF NOT EXISTS FOR (c:CourtCase) REQUIRE c.caseNo IS UNIQUE;

// 关系类型
// Person -[:IS_LEGAL_REP]-> Company      法定代表人
// Person -[:IS_SHAREHOLDER {ratio}]-> Company  股东
// Company -[:IS_SUPPLIER]-> Company       供应商关系
// Person -[:IS_INVOLVED_IN]-> CourtCase  涉案
// Company -[:HAS_RISK_EVENT]-> RiskEvent 风险事件
```

**风控查询示例：**

```cypher
// 企业关联风险传导分析
MATCH (target:Company {creditCode: '91110108MA01ABCD1X'})
MATCH path = (target)-[*1..4]-(risky:Company)-[:HAS_RISK_EVENT]->(event:RiskEvent)
WHERE event.severity >= 3
RETURN target.name AS targetCompany,
       [n IN nodes(path) WHERE n:Company | n.name] AS riskPath,
       event.type AS riskType,
       event.severity AS riskSeverity,
       event.occurDate AS riskDate,
       length(path) AS distance
ORDER BY riskSeverity DESC, distance;

// 实际控制人穿透
MATCH (target:Company {creditCode: '91110108MA01ABCD1X'})
MATCH path = (controller:Person)-[:CONTROLS|IS_SHAREHOLDER*1..5]->(target)
WHERE controller:Person
RETURN controller.name AS actualController,
       [rel IN relationships(path) | 
         type(rel) + ':' + 
         CASE WHEN rel.ratio IS NOT NULL THEN toString(rel.ratio * 100) + '%' ELSE '控制' END
       ] AS controlChain,
       reduce(prod = 1.0, rel IN relationships(path) | 
         prod * CASE WHEN rel.ratio IS NOT NULL THEN rel.ratio ELSE 1.0 END
       ) AS effectiveShareholding
ORDER BY effectiveShareholding DESC;
```

### 10.7.2 医疗知识图谱

**场景：** 构建辅助诊断知识图谱，整合疾病、症状、药物、检查等医学知识。

```cypher
// 医疗知识图谱数据模型
CREATE (d:Disease {name: '2型糖尿病', icdCode: 'E11', category: '内分泌'})
CREATE (s:Symptom {name: '多饮', description: '饮水量明显增加'})
CREATE (s2:Symptom {name: '多尿'})
CREATE (s3:Symptom {name: '体重下降'})
CREATE (drug:Drug {name: '二甲双胍', category: '双胍类', dosage: '0.5g tid'})
CREATE (test:LaboratoryTest {name: '空腹血糖', normalRange: '3.9-6.1 mmol/L'})

CREATE (d)-[:HAS_SYMPTOM {weight: 0.9}]->(s)
CREATE (d)-[:HAS_SYMPTOM {weight: 0.85}]->(s2)
CREATE (d)-[:HAS_SYMPTOM {weight: 0.7}]->(s3)
CREATE (drug)-[:TREATS {line: 'first', evidence: 'ADA指南'}]->(d)
CREATE (test)-[:DIAGNOSES {condition: '>7.0 mmol/L'}]->(d)

// 辅助诊断查询
MATCH (symptoms:Symptom)
WHERE symptoms.name IN ['多饮', '多尿', '体重下降']
MATCH (d:Disease)-[:HAS_SYMPTOM]->(symptoms)
WITH d, count(symptoms) AS matchedCount, 
     sum(CASE WHEN symptoms.name IN ['多饮', '多尿'] THEN 1 ELSE 0 END) AS coreCount
WHERE matchedCount >= 2 AND coreCount >= 1
MATCH (d)-[:HAS_SYMPTOM]->(allSymptom:Symptom)
WITH d, matchedCount, collect(allSymptom.name) AS allSymptoms
MATCH (drug:Drug)-[:TREATS]->(d)
RETURN d.name AS disease, 
       d.icdCode AS icdCode,
       matchedCount AS matchedSymptoms,
       allSymptoms AS allSymptoms,
       collect(drug.name) AS recommendedDrugs
ORDER BY matchedCount DESC;
```

### 10.7.3 社交网络知识图谱

**场景：** 构建企业人才社交网络，分析人员关系、技能图谱和团队结构。

```cypher
// 社交网络分析：寻找关键意见领袖
CALL gds.graph.project(
  'social_network',
  'Person',
  {
    FOLLOWS: {orientation: 'NATURAL'},
    COLLABORATES_WITH: {orientation: 'UNDIRECTED'}
  }
)

CALL gds.betweenness.write('social_network', {
  writeProperty: 'betweenness'
}) YIELD centralityDistribution;

// 查询高影响力人物
MATCH (p:Person)
WHERE p.betweenness > percentileCont(p.betweenness, 0.9)
RETURN p.name, p.title, p.betweenness
ORDER BY p.betweenness DESC;

// 团队推荐：寻找与目标人员技能互补的候选人
MATCH (target:Person {name: '张三'})
MATCH (target)-[:HAS_SKILL]->(skill:Skill)
MATCH (candidate:Person)-[:HAS_SKILL]->(skill)
WHERE candidate <> target
WITH candidate, count(skill) AS commonSkills
MATCH (candidate)-[:HAS_SKILL]->(candidateSkills:Skill)
WHERE NOT EXISTS ((target)-[:HAS_SKILL]->(candidateSkills))
WITH candidate, commonSkills, collect(candidateSkills.name) AS complementarySkills
WHERE commonSkills >= 2
RETURN candidate.name, commonSkills, complementarySkills
ORDER BY commonSkills DESC;
```

## 10.8 知识图谱的评估与维护

### 10.8.1 质量评估指标

```cypher
// 知识图谱完整性评估
MATCH (c:Company)
OPTIONAL MATCH (c)-[:HAS_LEGAL_REP]->(legalRep:Person)
OPTIONAL MATCH (c)-[:HAS_SHAREHOLDER]->(shareholder)
OPTIONAL MATCH (c)-[:REGISTERED_AT]->(address:Address)
RETURN 
  count(c) AS totalCompanies,
  count(legalRep) AS withLegalRep,
  count(shareholder) AS withShareholder,
  count(address) AS withAddress,
  toFloat(count(legalRep)) / count(c) * 100 AS legalRepRate,
  toFloat(count(shareholder)) / count(c) * 100 AS shareholderRate;

// 知识图谱准确性评估（抽样验证）
MATCH (c:Company)-[:HAS_LEGAL_REP]->(p:Person)
WHERE rand() < 0.01  // 1% 抽样
RETURN c.name, c.creditCode, p.name, p.idCard
// 输出结果用于人工校验
```

### 10.8.2 知识图谱的持续维护

```cypher
// 定期更新策略：标记过期数据
MATCH (c:Company)
WHERE c.updatedAt IS NULL 
   OR c.updatedAt < datetime() - duration('P90D')
SET c.needsRefresh = true
RETURN count(*) AS needsRefreshCount;

// 自动清理低置信度数据
MATCH ()-[r]-()
WHERE r.confidence IS NOT NULL 
  AND r.confidence < 0.3
  AND r.inferred = true
DELETE r;

// 版本管理：使用时间戳属性追踪变更历史
MATCH (c:Company {creditCode: '91110108MA01ABCD1X'})
SET c.regCapitalHistory = 
  CASE 
    WHEN c.regCapitalHistory IS NULL 
    THEN [{value: c.regCapital, timestamp: c.updatedAt}]
    ELSE c.regCapitalHistory + [{value: c.regCapital, timestamp: c.updatedAt}]
  END;
```

## 10.9 总结与展望

本章详细介绍了基于 Neo4j 构建知识图谱的完整技术体系。从数据模型设计、实体关系抽取、知识融合对齐，到推理查询和企业级实现，Neo4j 提供了从原型到生产的全链路支持。

知识图谱技术正在快速发展，以下几个方向值得关注：

1. **大语言模型与知识图谱的融合**：LLM 可以用于增强实体识别和关系抽取的准确性，而知识图谱可以为 LLM 提供可验证的事实基础，减少幻觉问题。

2. **实时知识图谱**：随着流处理技术的发展，知识图谱正从批处理模式向实时更新模式演进，Neo4j 的 CDC（Change Data Capture）功能和 Kafka 集成为此提供了基础。

3. **图神经网络（GNN）**：将知识图谱的结构信息输入 GNN 进行表示学习，可以大幅提升链接预测、实体分类等任务的性能。Neo4j GDS 已开始集成 GNN 相关功能。

4. **知识图谱即服务（KGaaS）**：云原生部署和 Serverless 架构使得知识图谱的构建和运维成本大幅降低，Neo4j AuraDB 提供了全托管的云服务。

5. **多模态知识图谱**：融合文本、图像、语音等多种模态数据的知识图谱是未来的重要方向，Neo4j 的灵活属性图模型可以天然支持多模态数据的存储和关联。

知识图谱的构建不是一次性的工程，而是一个持续迭代、不断优化的过程。选择合适的图数据库技术栈，建立完善的数据治理体系，结合业务场景不断优化推理规则，才能充分发挥知识图谱的价值，实现从数据到智慧的跨越。
