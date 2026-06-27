# 第5章 图查询语言：从Cypher到Gremlin的全面解析

图数据库的核心价值在于其查询表达能力。与传统SQL基于表连接不同，图查询语言围绕**节点-关系-属性**模型设计，天然支持关联深度遍历、路径分析和模式匹配。本章深入剖析四种主流图查询语言——Cypher、Gremlin、SPARQL、nGQL——并探讨查询优化器与子图匹配的理论基础。

---

## 5.1 Cypher：声明式模式匹配语言

Cypher由Neo4j于2011年创建，是目前生态最完善的图查询语言，2015年开源为openCypher标准，后被Amazon Neptune、SAP HANA等数据库采纳。

### 5.1.1 解决的问题

传统SQL在表达多跳关联查询时需大量JOIN，代码冗长且难以维护。例如"找到张三的朋友的朋友推荐的商品"，SQL需要3次JOIN，而Cypher用一行模式即可表达。Cypher将图模式可视化为ASCII艺术语法——`(节点)-[:关系]->(节点)`——使查询意图一目了然。

### 5.1.2 核心原理

Cypher是**声明式**语言：用户描述"要什么"，数据库决定"怎么查"。其执行流程为：

1. **解析** → 将ASCII模式解析为内部抽象语法树
2. **模式匹配** → 在图数据上寻找与模式同构的子图
3. **过滤** → 应用WHERE条件
4. **投影** → 执行RETURN表达式和聚合
5. **排序分页** → ORDER BY / SKIP / LIMIT

### 5.1.3 代码/配置实现

#### 基础模式匹配 (MATCH)

```cypher
// 查找所有用户及其关注的人
MATCH (u:User)-[:FOLLOWS]->(f:User)
RETURN u.name, f.name
```

```cypher
// 查找张三的2度好友（朋友的朋友）
MATCH (zhang:User {name: '张三'})-[:FOLLOWS]->(friend:User)-[:FOLLOWS]->(fof:User)
RETURN fof.name AS 推荐好友
```

#### 过滤 (WHERE)

```cypher
// 查找北京地区、粉丝数超过1000的活跃用户
MATCH (u:User)-[:FOLLOWS]->(f:User)
WHERE u.city = '北京' AND u.followers > 1000
  AND f.lastLogin > datetime('2024-01-01')
RETURN u.name, f.name, u.followers
ORDER BY u.followers DESC
LIMIT 20
```

```cypher
// 使用NOT EXISTS过滤
MATCH (u:User)
WHERE NOT EXISTS {
  MATCH (u)-[:PURCHASED]->(:Product)
}
RETURN u.name AS 从未购物的用户
```

#### 创建与更新 (CREATE / MERGE / SET)

```cypher
// 创建用户和关系
CREATE (u:User {
  name: '李四',
  age: 28,
  city: '上海',
  createdAt: datetime()
})
RETURN u
```

```cypher
// MERGE：存在则匹配，不存在则创建（幂等操作）
MERGE (u:User {email: 'lisi@example.com'})
  ON CREATE SET u.name = '李四', u.createdAt = datetime()
  ON MATCH SET u.lastLogin = datetime()
RETURN u
```

```cypher
// 批量创建关系
MATCH (buyer:User {email: 'buyer@example.com'})
MATCH (product:Product {sku: 'P10086'})
MERGE (buyer)-[p:PURCHASED {amount: 299.00, date: date()}]->(product)
RETURN p
```

#### 聚合与分组 (RETURN + GROUP BY)

```cypher
// 按城市统计用户数和平均粉丝数
MATCH (u:User)
RETURN u.city AS 城市,
       count(u) AS 用户数,
       avg(u.followers) AS 平均粉丝数,
       sum(u.followers) AS 粉丝总数
ORDER BY 用户数 DESC
```

```cypher
// 统计每个商品类别的销售额
MATCH (p:Product)<-[pu:PURCHASED]-(:User)
RETURN p.category AS 类别,
       count(pu) AS 销售次数,
       sum(pu.amount) AS 总销售额,
       avg(pu.amount) AS 客单价
ORDER BY 总销售额 DESC
```

#### 变长路径查询

```cypher
// 查找1到3跳内的所有好友关系链
MATCH (u:User {name: '张三'})-[:FOLLOWS*1..3]->(target:User)
RETURN target.name, length(路径) AS 距离
ORDER BY 距离
```

```cypher
// 最短路径查询（社交网络中的推荐链）
MATCH p = shortestPath(
  (a:User {name: '张三'})-[:FOLLOWS*..6]->(b:User {name: '王五'})
)
RETURN [n IN nodes(p) | n.name] AS 路径,
       length(p) AS 跳数
```

```cypher
// 查找所有可达路径（用于欺诈检测中的资金流转）
MATCH p = (start:Account {id: 'A001'})-[:TRANSFER_TO*1..5]->(end:Account)
WHERE start <> end
RETURN p, length(p) AS 跳数
LIMIT 100
```

#### 复杂模式：反欺诈检测

```cypher
// 检测可疑的环形资金流转
MATCH p = (a:Account)-[:TRANSFER_TO]->(b:Account)-[:TRANSFER_TO]->(c:Account)-[:TRANSFER_TO]->(a)
WHERE a.amount > 10000 AND b.amount > 10000 AND c.amount > 10000
RETURN a.id, b.id, c.id,
       a.amount + b.amount + c.amount AS 总金额
```

```cypher
// 检测团伙欺诈：同一IP注册多个账号，且共享设备指纹
MATCH (ip:IP {address: '192.168.1.1'})<-[:REGISTERED_FROM]-(u1:User),
      (ip)<-[:REGISTERED_FROM]-(u2:User),
      (u1)-[:USED_DEVICE]->(d:Device)<-[:USED_DEVICE]-(u2)
WHERE u1 <> u2
RETURN u1.name, u2.name, d.fingerprint, ip.address
```

#### 推荐系统查询

```cypher
// 基于协同过滤的商品推荐：
// 找到与目标用户相似的用户（购买过相同商品），推荐他们购买的其他商品
MATCH (target:User {name: '张三'})-[:PURCHASED]->(p:Product)<-[:PURCHASED]-(similar:User)
MATCH (similar)-[:PURCHASED]->(rec:Product)
WHERE NOT EXISTS {
  MATCH (target)-[:PURCHASED]->(rec)
}
RETURN rec.name AS 推荐商品,
       count(DISTINCT similar) AS 相似用户数,
       avg(rec.rating) AS 平均评分
ORDER BY 相似用户数 DESC, 平均评分 DESC
LIMIT 10
```

### 5.1.4 使用场景

| 场景 | 典型查询 | Cypher优势 |
|------|---------|-----------|
| 社交网络 | 好友推荐、影响力传播 | 变长路径天然支持 |
| 反欺诈 | 资金环检测、团伙识别 | 环形模式一行表达 |
| 推荐系统 | 协同过滤、知识图谱推荐 | 多跳模式组合灵活 |
| 权限管理 | 角色继承、资源可达性 | 路径查询验证权限 |
| 知识图谱 | 实体关系探索 | ASCII模式直观可读 |

### 5.1.5 潜在风险与注意事项

1. **变长路径爆炸**：`[*1..10]`在稠密图上可能产生指数级中间结果，必须配合LIMIT或剪枝条件
2. **无索引的MATCH**：未对标签/属性建索引时，MATCH会全表扫描，生产环境必须配合`CREATE INDEX`
3. **MERGE的并发问题**：高并发下MERGE存在竞态条件，需配合重试机制或使用唯一约束
4. **笛卡尔积陷阱**：多个MATCH子句若未正确连接，会产生笛卡尔积，应使用逗号或显式连接
5. **大事务风险**：单条CREATE语句创建大量节点/关系可能导致事务过大，应分批提交

### 5.1.6 本章小结

Cypher以ASCII艺术语法将图模式可视化，学习曲线平缓，适合大多数图查询场景。其声明式特性让开发者专注于"查什么"而非"怎么查"。但变长路径的性能开销和缺乏标准化（各厂商实现有差异）是主要局限。

---

## 5.2 Gremlin：图遍历机器

Gremlin是Apache TinkerPop框架的图遍历语言，支持**命令式**和**声明式**两种风格，被JanusGraph、Neo4j（通过插件）、Cosmos DB等广泛支持。

### 5.2.1 解决的问题

Cypher的声明式模型在需要精细控制遍历顺序、提前剪枝或实现复杂图算法时力不从心。Gremlin提供**函数式遍历流**——每一步都是显式的数据变换操作——让开发者能精确控制查询执行路径，适合性能敏感和算法密集型场景。

### 5.2.2 核心原理

Gremlin基于**遍历器模式**：查询被建模为一系列步骤（step）组成的管道（pipeline），数据流经每个步骤被变换、过滤或分支。

```
数据源 → 步骤1 → 步骤2 → ... → 结果
```

核心概念：
- **遍历器（Traversal）**：惰性求值的数据流
- **步骤（Step）**：对当前数据的操作（map、filter、sideEffect、branch）
- **遍历策略（TraversalStrategy）**：优化器自动注入的步骤重排规则

### 5.2.3 代码/配置实现

#### 基础遍历

```groovy
// 查找所有用户（Java/Groovy语法）
g.V().hasLabel('User')

// 查找名为"张三"的用户
g.V().has('User', 'name', '张三')

// 查找所有关注关系
g.E().hasLabel('FOLLOWS')
```

```groovy
// 查找张三关注的人
g.V().has('User', 'name', '张三')
  .out('FOLLOWS')
  .values('name')
```

```groovy
// 查找张三的2度好友
g.V().has('User', 'name', '张三')
  .out('FOLLOWS')
  .out('FOLLOWS')
  .dedup()
  .values('name')
```

#### 过滤与条件

```groovy
// 北京地区粉丝数>1000的用户
g.V().hasLabel('User')
  .has('city', '北京')
  .has('followers', gt(1000))
  .values('name', 'followers')
```

```groovy
// 多条件组合：年龄在18-30之间或粉丝数>5000
g.V().hasLabel('User')
  .or(
    has('age', between(18, 30)),
    has('followers', gt(5000))
  )
  .order().by('followers', desc)
  .limit(20)
  .valueMap('name', 'age', 'followers')
```

#### 聚合与统计

```groovy
// 按城市统计用户数
g.V().hasLabel('User')
  .groupCount()
  .by('city')
```

```groovy
// 统计每个商品类别的销售额
g.V().hasLabel('Product')
  .group()
    .by('category')
    .by(
      inE('PURCHASED').values('amount').sum()
    )
```

```groovy
// 使用project进行多维度统计
g.V().hasLabel('User')
  .limit(100)
  .project('name', 'followers', 'friends_count')
    .by('name')
    .by('followers')
    .by(out('FOLLOWS').count())
  .order().by(select('friends_count'), desc)
```

#### 变长路径与循环

```groovy
// 1到3跳的好友关系（使用repeat+times）
g.V().has('User', 'name', '张三')
  .repeat(out('FOLLOWS'))
    .times(3)
    .emit()
  .dedup()
  .values('name')
```

```groovy
// 最短路径（使用until+循环）
g.V().has('User', 'name', '张三')
  .repeat(out('FOLLOWS'))
    .until(has('name', '王五'))
    .path()
    .limit(1)
```

```groovy
// 条件循环：一直遍历直到没有更多节点
g.V().has('User', 'name', '张三')
  .repeat(out('FOLLOWS'))
    .until(out('FOLLOWS').count().is(0))
  .path()
```

#### 反欺诈检测

```groovy
// 检测资金环（3跳内回到起点）
g.V().has('Account', 'id', 'A001')
  .repeat(out('TRANSFER_TO'))
    .times(3)
  .where(has('id', 'A001'))
  .path()
```

```groovy
// 检测共享设备/IP的团伙
g.V().has('User', 'name', '张三')
  .out('USED_DEVICE')
  .in('USED_DEVICE')
  .where(neq('张三'))
  .dedup()
  .values('name')
```

#### 推荐系统

```groovy
// 协同过滤推荐
g.V().has('User', 'name', '张三')
  .out('PURCHASED')           // 张三买的商品
  .aggregate('myProducts')
  .in('PURCHASED')             // 买过相同商品的其他用户
  .dedup()
  .out('PURCHASED')            // 他们买的商品
  .where(without('myProducts')) // 排除张三已买的
  .groupCount()                 // 按商品统计推荐次数
  .order(local).by(values, desc)
  .limit(local, 10)
```

#### 命令式 vs 声明式风格对比

```groovy
// 命令式：精确控制每一步
g.V().has('User', 'name', '张三')
  .local(
    union(
      out('FOLLOWS').count(),
      in('FOLLOWS').count()
    ).fold()
  )

// 声明式（使用match步骤，类似Cypher风格）
g.V().match(
  as('a').has('User', 'name', '张三'),
  as('a').out('FOLLOWS').as('b'),
  as('b').out('FOLLOWS').as('c')
).select('a', 'b', 'c')
```

#### 高级图算法

```groovy
// PageRank 计算
g.V().hasLabel('User')
  .pageRank()
    .by('followers')
  .order().by(pageRank, desc)
  .limit(10)
  .valueMap('name', 'pageRank')
```

```groovy
// 社区发现（LPA标签传播）
g.V().hasLabel('User')
  .labelPropagation()
    .group('communities')
      .by('label')
      .by(count())
  .cap('communities')
```

### 5.2.4 使用场景

| 场景 | Gremlin优势 |
|------|------------|
| 图算法执行 | 内置PageRank、LPA、最短路径等算法步骤 |
| 性能敏感查询 | 精确控制遍历顺序，提前剪枝 |
| 复杂ETL管道 | 函数式链式调用适合数据清洗和变换 |
| 多语言集成 | Java/Groovy/Python/Golang原生驱动 |
| 实时推荐 | 流式处理，无需物化中间结果 |

### 5.2.5 潜在风险与注意事项

1. **学习曲线陡峭**：函数式链式调用对新手不友好，调试困难
2. **步骤顺序敏感**：`has().out()`和`out().has()`语义不同，前者先过滤后遍历，后者先遍历后过滤，性能差异巨大
3. **惰性求值陷阱**：Gremlin默认惰性求值，多次迭代同一遍历器会重新执行
4. **内存压力**：`aggregate()`和`fold()`会将数据全部加载到内存，大数据量时需谨慎
5. **缺乏标准化**：各数据库对Gremlin的实现程度不一，迁移成本高

### 5.2.6 本章小结

Gremlin是图查询领域的"汇编语言"——灵活、强大但复杂。它适合需要精细控制执行路径的场景，如图算法实现和性能调优。对于大多数业务查询，Cypher的声明式模型更高效；当需要底层控制时，Gremlin是不可替代的。

---

## 5.3 SPARQL：语义网的标准查询语言

SPARQL是W3C制定的RDF图数据查询标准，广泛用于知识图谱、语义网和开放数据（如Wikidata、DBpedia）。

### 5.3.1 解决的问题

RDF数据以三元组（主语-谓词-宾语）形式存储语义信息，传统查询语言无法有效处理语义推理和本体查询。SPARQL支持RDF数据的精确查询、推理查询和跨数据源联邦查询，是语义网生态的核心。

### 5.3.2 核心原理

SPARQL基于**图模式匹配**：查询由三元组模式（triple pattern）组成，每个模式是带变量的三元组。执行引擎将变量绑定到RDF图中的具体值。

```
SELECT ?name WHERE {
  ?person rdf:type foaf:Person .
  ?person foaf:name ?name .
  ?person foaf:age ?age .
  FILTER(?age > 18)
}
```

查询形式：
- **SELECT**：返回变量绑定的表格
- **CONSTRUCT**：根据绑定结果构建新的RDF图
- **ASK**：返回布尔值，判断模式是否存在
- **DESCRIBE**：返回资源的描述信息

### 5.3.3 代码/配置实现

#### SELECT 查询

```sparql
# 查找所有用户及其姓名
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?user ?name ?age
WHERE {
  ?user rdf:type foaf:Person .
  ?user foaf:name ?name .
  ?user foaf:age ?age .
}
ORDER BY DESC(?age)
LIMIT 20
```

```sparql
# 查找张三的朋友的朋友
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

SELECT ?friend ?fof
WHERE {
  ex:张三 foaf:knows ?friend .
  ?friend foaf:knows ?fof .
  FILTER(?friend != ?fof)
}
```

#### 属性路径（Property Paths，类似Cypher的变长模式）

```sparql
# 1到3跳的朋友关系
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?person
WHERE {
  ex:张三 foaf:knows+ ?person  # + 表示1次或多次
}
```

```sparql
# 可选路径和替代路径
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

SELECT ?person ?name
WHERE {
  ex:张三 foaf:knows* ?person .  # * 表示0次或多次
  OPTIONAL { ?person foaf:name ?name }
}
```

```sparql
# 复杂属性路径：朋友或同事
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

SELECT ?person
WHERE {
  ex:张三 (foaf:knows|ex:worksWith)+ ?person
}
```

#### CONSTRUCT 查询

```sparql
# 从FOAF数据构建社交网络图
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

CONSTRUCT {
  ?person ex:hasFriend ?friend .
  ?person ex:friendCount ?count .
}
WHERE {
  SELECT ?person (COUNT(?friend) AS ?count)
  WHERE {
    ?person foaf:knows ?friend .
  }
  GROUP BY ?person
}
```

#### ASK 查询

```sparql
# 判断张三和王五之间是否存在3跳内的路径
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

ASK {
  ex:张三 foaf:knows+ ex:王五
}
```

#### 联邦查询（Federated Query）

```sparql
# 同时查询本地数据和Wikidata
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>

SELECT ?person ?name ?birthDate
WHERE {
  # 本地数据
  ?person foaf:name ?name .
  ?person foaf:age ?age .
  FILTER(?age > 18)

  # 联邦查询Wikidata获取出生日期
  SERVICE <https://query.wikidata.org/sparql> {
    ?person wdt:P569 ?birthDate .
  }
}
```

#### 知识图谱查询示例

```sparql
# 查询"出演了诺兰导演电影的演员"
PREFIX dbo: <http://dbpedia.org/ontology/>
PREFIX dbr: <http://dbpedia.org/resource/>

SELECT DISTINCT ?actor ?movie
WHERE {
  ?movie dbo:director dbr:Christopher_Nolan .
  ?movie dbo:starring ?actor .
  ?actor rdf:type dbo:Actor .
}
ORDER BY ?actor
```

```sparql
# 查询"中国导演执导的、评分>8.5的电影"
PREFIX dbo: <http://dbpedia.org/ontology/>
PREFIX dbr: <http://dbpedia.org/resource/>

SELECT ?film ?rating
WHERE {
  ?film dbo:director ?director .
  ?director dbo:birthPlace dbr:China .
  ?film dbo:imdbRating ?rating .
  FILTER(xsd:decimal(?rating) > 8.5)
}
ORDER BY DESC(?rating)
```

### 5.3.4 使用场景

| 场景 | 说明 |
|------|------|
| 开放知识图谱 | Wikidata、DBpedia、YAGO等开放数据查询 |
| 企业知识管理 | 本体驱动的企业知识图谱 |
| 生物信息学 | UniProt、GO等生物医学数据关联查询 |
| 数据集成 | 联邦查询整合多个异构数据源 |
| 语义推理 | 结合OWL/RDFS推理进行隐式知识发现 |

### 5.3.5 潜在风险与注意事项

1. **性能问题**：联邦查询依赖远程端点响应速度，复杂推理查询可能耗时极长
2. **数据稀疏性**：RDF数据通常高度稀疏，OPTIONAL模式可能导致大量NULL值
3. **缺乏图遍历能力**：SPARQL不擅长深度优先的图遍历，变长路径性能不如Cypher/Gremlin
4. **学习曲线**：需要理解RDF、OWL、本体等语义网概念，入门门槛高
5. **生态碎片化**：各三元组存储（Virtuoso、Blazegraph、Jena）的SPARQL实现有差异

### 5.3.6 本章小结

SPARQL是语义网生态的基石，在知识图谱和开放数据领域不可替代。其联邦查询和推理支持是独特优势，但在图遍历性能和易用性上不如Cypher。选择SPARQL的前提是数据模型为RDF，且需要语义推理能力。

---

## 5.4 nGQL：NebulaGraph的分布式图查询语言

nGQL是NebulaGraph自研的类SQL图查询语言，专为分布式图数据库设计，融合了Cypher的易读性和SQL的熟悉语法。

### 5.4.1 解决的问题

Cypher在分布式场景下存在优化困难，Gremlin学习成本高。nGQL的目标是：在保持类SQL语法的同时，提供原生分布式图遍历能力，支持万亿边规模的在线查询。

### 5.4.2 核心原理

nGQL采用**管道（pipe）运算符** `|` 串联多个查询步骤，每个步骤的输出作为下一步的输入，类似Unix管道。这种设计天然适合分布式执行——每个步骤可独立调度到不同存储节点。

```
查询语句 = 数据源 | 步骤1 | 步骤2 | ... | 步骤N
```

### 5.4.3 代码/配置实现

#### 基础查询

```nGQL
# 查找用户及其属性
FETCH PROP ON User '张三' YIELD name, age, city

# 批量查找
FETCH PROP ON User '张三', '李四', '王五' YIELD name, age
```

#### GO 语句（图遍历核心）

```nGQL
# 查找张三关注的人（1跳）
GO FROM '张三' OVER FOLLOWS
YIELD dst(edge) AS 好友, $$.User.name AS 好友名

# 查找2度好友
GO 2 STEPS FROM '张三' OVER FOLLOWS
YIELD dst(edge) AS 好友, $$.User.name AS 好友名
```

```nGQL
# 带过滤条件的多跳查询
GO 1 TO 3 STEPS FROM '张三' OVER FOLLOWS
WHERE $$.User.age > 18 AND $$.User.city == '北京'
YIELD dst(edge) AS 好友, $$.User.name AS 好友名, $$.User.age AS 年龄
```

#### LOOKUP 语句（基于索引的查询）

```nGQL
# 按属性查找用户
LOOKUP ON User WHERE User.age > 30 AND User.city == '上海'
YIELD User.name, User.age, User.city
```

```nGQL
# 聚合统计
LOOKUP ON User
YIELD count(DISTINCT User.city) AS 城市数,
      avg(User.age) AS 平均年龄
```

#### FIND PATH 路径查询

```nGQL
# 查找最短路径
FIND SHORTEST PATH FROM '张三' TO '王五' OVER FOLLOWS
YIELD path AS 最短路径

# 查找所有路径（最多5跳）
FIND ALL PATH FROM '张三' TO '王五' OVER FOLLOWS UPTO 5 STEPS
YIELD path AS 所有路径
```

#### 管道运算符

```nGQL
# 管道串联：先查张三关注的人，再查他们关注的商品
GO FROM '张三' OVER FOLLOWS
YIELD dst(edge) AS friend
| GO FROM $-.friend OVER PURCHASED
YIELD dst(edge) AS product, $$.Product.name AS 商品名
```

```nGQL
# 管道+聚合：统计每个好友购买的商品数
GO FROM '张三' OVER FOLLOWS
YIELD dst(edge) AS friend
| GO FROM $-.friend OVER PURCHASED
YIELD $-.friend AS 好友, dst(edge) AS 商品
| GROUP BY $-.好友
YIELD $-.好友 AS 好友, count(*) AS 购买商品数
```

#### 反欺诈检测

```nGQL
# 检测资金环
FIND ALL PATH FROM 'A001' TO 'A001' OVER TRANSFER_TO UPTO 5 STEPS
YIELD path AS 资金环
| YIELD count(*) AS 环数
```

```nGQL
# 检测共享设备团伙
GO FROM '张三' OVER USED_DEVICE
YIELD dst(edge) AS device
| GO FROM $-.device OVER USED_DEVICE REVERSELY
WHERE $-.device != dst(edge)
YIELD $-.device AS 设备, dst(edge) AS 疑似同伙
```

#### 与Cypher语法对比

```nGQL
# nGQL风格
GO 2 STEPS FROM '张三' OVER FOLLOWS
WHERE $$.User.age > 18
YIELD dst(edge) AS 好友

# 等效Cypher
MATCH (zhang:User {name: '张三'})-[:FOLLOWS*2]->(friend:User)
WHERE friend.age > 18
RETURN friend.name AS 好友
```

### 5.4.4 使用场景

| 场景 | nGQL优势 |
|------|---------|
| 超大规模图 | 原生分布式，支持万亿边 |
| 实时在线查询 | 管道模型适合流式处理 |
| 图探索分析 | GO/FIND PATH语法直观 |
| 时序图数据 | 支持时间维度的图遍历 |
| 混合负载 | OLTP+OLAP统一查询 |

### 5.4.5 潜在风险与注意事项

1. **生态不成熟**：相比Neo4j和JanusGraph，NebulaGraph的周边工具和社区较小
2. **语法局限**：管道模型在表达复杂嵌套模式时不如Cypher灵活
3. **索引依赖**：LOOKUP和GO语句依赖索引，无索引时性能急剧下降
4. **事务支持**：NebulaGraph的事务模型较弱，不支持跨分区ACID
5. **学习迁移成本**：nGQL是私有语言，与其他图数据库不兼容

### 5.4.6 本章小结

nGQL以管道模型和类SQL语法在分布式图查询中独树一帜。它在大规模场景下的性能表现优异，但生态和标准化程度不如Cypher和Gremlin。适合对数据规模有极致要求、且能接受一定锁定风险的团队。

---

## 5.5 查询优化器与执行计划

图查询优化器决定了查询性能的优劣。与关系型数据库优化器不同，图优化器需要处理**模式匹配的NP难问题**和**变长路径的指数爆炸**。

### 5.5.1 解决的问题

一个看似简单的Cypher查询`MATCH (a)-[*1..6]->(b) WHERE a.id = 'X'`，在稠密图上可能产生数百万条中间路径。优化器的目标是：在可接受时间内找到最优执行计划，避免穷举搜索。

### 5.5.2 核心原理

#### 优化器架构

```
SQL/图查询 → 解析器 → AST → 逻辑计划 → 物理计划 → 执行
                              ↓              ↓
                        规则优化(RBO)    代价优化(CBO)
```

#### 关键优化技术

**1. 模式匹配顺序优化**

```cypher
// 原始查询
MATCH (a:User)-[:FOLLOWS]->(b:User)-[:PURCHASED]->(c:Product)
WHERE a.name = '张三' AND c.category = '电子产品'

// 优化后执行顺序：
// 1. 先通过索引定位 a (选择性最高)
// 2. 再遍历 FOLLOWS 找到 b
// 3. 最后遍历 PURCHASED 找到 c
// 4. 过滤 c.category
```

**2. 索引选择**

```cypher
// 创建索引
CREATE INDEX user_name_index FOR (n:User) ON (n.name)
CREATE INDEX product_category_index FOR (n:Product) ON (n.category)

// 优化器会优先使用选择性最高的索引
// 如果 name 的区分度 > category，则先走 name 索引
```

**3. 连接顺序优化**

图数据库将模式匹配转化为多表连接问题，使用类似关系数据库的优化策略：

- **贪心算法**：从选择性最高的节点开始，逐步扩展
- **动态规划**：枚举所有连接顺序，选择代价最小的
- **左深树 vs 浓密树**：左深树适合单起点遍历，浓密树适合多起点汇合

**4. 变长路径剪枝**

```cypher
// 优化器对变长路径的剪枝策略：
// 1. 提前应用WHERE条件
// 2. 使用双向BFS（起点和终点同时遍历）
// 3. 限制中间结果大小
// 4. 使用位图标记已访问节点（防环）

MATCH p = (a:User {name: '张三'})-[:FOLLOWS*1..6]->(b:User {name: '王五'})
WHERE all(n IN nodes(p) WHERE n.age > 18)
RETURN p
```

#### 执行计划查看

```cypher
// Neo4j 查看执行计划
EXPLAIN MATCH (a:User {name: '张三'})-[:FOLLOWS]->(b:User)
RETURN b.name

// 输出：
// +-----------------+----------------+----------------+------+
// | Operator        | EstimatedRows | Variables      | Other |
// +-----------------+----------------+----------------+------+
// | Projection      | 5              | b.name         |      |
// | Expand(All)     | 5              | b              |     |
// | NodeByLabelScan | 1000           | a:User         |     |
// | Filter          | 1              | a              | a.name = $param |
// +-----------------+----------------+----------------+------+
```

```cypher
// PROFILE 查看实际执行统计
PROFILE MATCH (a:User {name: '张三'})-[:FOLLOWS]->(b:User)
RETURN b.name
```

### 5.5.3 代码/配置实现

#### Neo4j 优化器配置

```cypher
// 查看当前优化器配置
CALL dbms.listConfig() YIELD name, value
WHERE name CONTAINS 'planner' OR name CONTAINS 'optimizer'

// 强制使用规则优化器（RBO）
CYPHER planner=rule
MATCH (a:User)-[:FOLLOWS]->(b:User)
WHERE a.name = '张三'
RETURN b

// 强制使用代价优化器（CBO）
CYPHER planner=cost
MATCH (a:User)-[:FOLLOWS]->(b:User)
WHERE a.name = '张三'
RETURN b
```

#### 索引策略

```cypher
// 单属性索引
CREATE INDEX user_name_idx FOR (n:User) ON (n.name)

// 复合索引
CREATE INDEX user_city_age_idx FOR (n:User) ON (n.city, n.age)

// 全文索引
CREATE FULLTEXT INDEX user_search_idx FOR (n:User) ON EACH [n.name, n.bio]

// 文本索引（用于CONTAINS/STARTS WITH）
CREATE TEXT INDEX user_bio_idx FOR (n:User) ON (n.bio)
```

#### 查询提示

```cypher
// 使用USING INDEX强制指定索引
MATCH (a:User)
USING INDEX a:User(name)
WHERE a.name = '张三'
RETURN a

// 使用USING JOIN强制连接顺序
MATCH (a:User)-[:FOLLOWS]->(b:User)-[:PURCHASED]->(c:Product)
USING JOIN ON b
WHERE a.name = '张三'
RETURN c.name
```

### 5.5.4 使用场景

| 场景 | 优化重点 |
|------|---------|
| OLTP点查 | 索引选择、快速定位 |
| 多跳分析 | 变长路径剪枝、双向BFS |
| 聚合报表 | 分组聚合下推、内存管理 |
| 子图匹配 | 连接顺序、中间结果控制 |
| 图算法 | 迭代次数控制、增量计算 |

### 5.5.5 潜在风险与注意事项

1. **统计信息过时**：CBO依赖统计信息，数据大量变更后需手动更新统计信息
2. **参数嗅探**：优化器根据第一次执行的参数值生成计划，后续不同参数可能性能退化
3. **过度优化**：查询提示可能阻碍优化器选择更好的计划，应谨慎使用
4. **内存限制**：排序、聚合、变长路径等操作可能消耗大量内存，需配置合理上限
5. **分布式优化**：分布式图数据库的优化器还需考虑数据本地性和网络传输成本

### 5.5.6 本章小结

查询优化器是图数据库性能的核心。理解执行计划、合理创建索引、掌握查询提示，是图数据库调优的三大支柱。RBO适合简单查询，CBO适合复杂查询，实际使用中两者互补。

---

## 5.6 图模式匹配与子图查询

图模式匹配是图查询的理论基础，涉及子图同构、图同态等计算理论问题。

### 5.6.1 解决的问题

"在图中找到与给定模式匹配的所有子图"是NP完全问题。实际系统中需要在**精确性**和**可计算性**之间取得平衡，使用近似算法和剪枝策略在多项式时间内返回结果。

### 5.6.2 核心原理

#### 子图同构（Subgraph Isomorphism）

给定查询图Q和数据图G，子图同构寻找G中与Q结构完全一致的子图——节点和边的标签必须匹配，且映射是单射（不同节点映射到不同节点）。

```
查询图 Q: (User:张三)-[:FOLLOWS]->(User)-[:FOLLOWS]->(User)
数据图 G: (User:A)-[:FOLLOWS]->(User:B)-[:FOLLOWS]->(User:C)
          (User:A)-[:FOLLOWS]->(User:D)-[:FOLLOWS]->(User:E)

匹配结果: {张三→A, ?→B, ?→C} 和 {张三→A, ?→D, ?→E}
```

#### 图同态（Graph Homomorphism）

同态比同构更宽松——允许多个查询节点映射到同一个数据节点。Cypher的MATCH默认使用同态语义。

```
// Cypher默认同态：a和b可以映射到同一节点
MATCH (a:User)-[:FOLLOWS]->(b:User)
// 如果用户关注了自己，a和b可以是同一节点
```

#### 常用算法

| 算法 | 复杂度 | 特点 |
|------|--------|------|
| Ullmann | O(n!·n²) | 经典回溯，适合小图 |
| VF2 | O(n²) | 基于状态空间搜索，工业标准 |
| QuickSI | O(n·m) | 基于查询图特征排序 |
| GraphQL | O(n·m) | 基于邻域签名过滤 |
| TurboISO | O(n²) | 基于候选区域划分 |

### 5.6.3 代码/配置实现

#### VF2算法示例（伪代码）

```java
// VF2子图同构匹配核心逻辑
public class VF2Matcher {
    private Graph queryGraph;
    private Graph dataGraph;
    private Map<Node, Node> mapping = new HashMap<>();

    public boolean match() {
        return matchRecursive(new State(queryGraph, dataGraph));
    }

    private boolean matchRecursive(State s) {
        if (s.isGoal()) return true;  // 所有查询节点已匹配

        for (Pair candidate : s.getCandidates()) {
            if (s.isFeasible(candidate)) {
                s.extend(candidate);
                if (matchRecursive(s)) return true;
                s.backtrack(candidate);
            }
        }
        return false;
    }
}
```

#### Cypher中的子图匹配

```cypher
// 三角形检测（3人互相关注）
MATCH (a:User)-[:FOLLOWS]->(b:User)-[:FOLLOWS]->(c:User)-[:FOLLOWS]->(a)
WHERE a.name < b.name AND b.name < c.name  // 去重
RETURN a.name, b.name, c.name
```

```cypher
// 星型模式：一个中心节点连接多个叶子节点
MATCH (center:User)-[:FOLLOWS]->(leaf:User)
WITH center, collect(leaf.name) AS followers
WHERE size(followers) >= 10
RETURN center.name, followers
```

```cypher
// 链式模式：A→B→C→D
MATCH path = (a:User)-[:FOLLOWS]->(b:User)-[:FOLLOWS]->(c:User)-[:FOLLOWS]->(d:User)
WHERE a.name = '张三'
RETURN [n IN nodes(path) | n.name] AS 关系链
```

#### 近似匹配算法

```cypher
// 使用Jaccard相似度进行近似匹配
MATCH (a:User {name: '张三'})-[:FOLLOWS]->(common:User)
WITH a, collect(common) AS myFriends
MATCH (b:User)-[:FOLLOWS]->(common:User)
WHERE b <> a
WITH a, b, myFriends, collect(common) AS theirFriends
RETURN a.name, b.name,
       (size(apoc.coll.intersection(myFriends, theirFriends)) * 1.0 /
        size(apoc.coll.union(myFriends, theirFriends))) AS 相似度
ORDER BY 相似度 DESC
LIMIT 10
```

```cypher
// 使用Neo4j GDS库进行近似子图匹配
CALL gds.graph.project('myGraph', 'User', 'FOLLOWS')
YIELD graphName

// 社区检测作为子图匹配的近似
CALL gds.louvain.stream('myGraph')
YIELD nodeId, communityId
RETURN gds.util.asNode(nodeId).name AS 用户, communityId AS 社区
ORDER BY communityId
```

### 5.6.4 使用场景

| 场景 | 匹配类型 | 说明 |
|------|---------|------|
| 社交网络模式检测 | 子图同构 | 发现特定社交模式（三角、星型、链式） |
| 反洗钱 | 近似匹配 | 发现与已知洗钱模式相似的交易网络 |
| 化学信息学 | 精确子图同构 | 分子结构匹配 |
| 程序分析 | 图同态 | 代码依赖图模式匹配 |
| 知识图谱补全 | 近似匹配 | 基于已有模式推断缺失关系 |

### 5.6.5 潜在风险与注意事项

1. **NP完全性**：子图同构在最坏情况下是指数级复杂度，大图必须使用近似算法
2. **标签选择性**：节点/边的标签越少，候选集越大，匹配越慢
3. **图密度**：稠密图（如社交网络）的匹配难度远大于稀疏图
4. **内存消耗**：中间候选集可能极大，需设置合理的内存上限
5. **近似误差**：近似算法可能漏报（false negative）或误报（false positive）

### 5.6.6 本章小结

图模式匹配是图查询的理论基石。子图同构保证精确性但计算代价高，图同态更灵活但可能产生冗余结果。实际系统中，VF2及其变体是工业标准，而近似算法和剪枝策略是处理大规模图的必要手段。

---

## 5.7 语言对比与选型指南

### 5.7.1 解决的问题

面对多种图查询语言，开发团队需要根据业务需求、团队技能和基础设施做出合理选择。

### 5.7.2 核心原理

#### 多维度对比

| 维度 | Cypher | Gremlin | SPARQL | nGQL |
|------|--------|---------|--------|------|
| **范式** | 声明式 | 命令式+声明式 | 声明式 | 管道式 |
| **学习曲线** | 低 | 高 | 中 | 中 |
| **表达能力** | 强 | 最强 | 中（推理强） | 中 |
| **标准化** | openCypher | Apache TinkerPop | W3C标准 | 私有 |
| **分布式支持** | 弱 | 中 | 中 | 强 |
| **图算法** | 需插件 | 内置 | 需扩展 | 有限 |
| **RDF/语义网** | 不支持 | 不支持 | 原生支持 | 不支持 |
| **主要数据库** | Neo4j, Neptune | JanusGraph, Cosmos DB | Virtuoso, Blazegraph | NebulaGraph |
| **社区生态** | 最大 | 大 | 中 | 小 |
| **性能(OLTP)** | 优 | 优 | 中 | 优 |
| **性能(OLAP)** | 中 | 优 | 中 | 优 |

#### 表达力对比示例

```cypher
// Cypher: 查找张三的2度好友
MATCH (a:User {name: '张三'})-[:FOLLOWS*2]->(b:User)
RETURN DISTINCT b.name
```

```groovy
// Gremlin: 等效查询
g.V().has('User', 'name', '张三')
  .repeat(out('FOLLOWS')).times(2)
  .dedup()
  .values('name')
```

```nGQL
// nGQL: 等效查询
GO 2 STEPS FROM '张三' OVER FOLLOWS
YIELD DISTINCT dst(edge) AS 好友
```

```sparql
// SPARQL: 等效查询
PREFIX ex: <http://example.org/>
SELECT DISTINCT ?name WHERE {
  ex:张三 ex:follows ?friend .
  ?friend ex:follows ?fof .
  ?fof ex:name ?name .
}
```

#### 选型决策树

```
数据模型是RDF吗？
├── 是 → 需要语义推理吗？
│   ├── 是 → SPARQL (Virtuoso/Stardog)
│   └── 否 → SPARQL 或 Cypher (Neptune支持两者)
└── 否 → 数据规模？
    ├── 万亿级 → nGQL (NebulaGraph)
    ├── 百亿级 → 需要图算法吗？
    │   ├── 是 → Gremlin (JanusGraph)
    │   └── 否 → Cypher (Neo4j)
    └── 十亿级以下 → 团队熟悉SQL吗？
        ├── 是 → Cypher (学习成本最低)
        └── 否 → Cypher (语法最直观)
```

### 5.7.3 代码/配置实现

#### 多语言混合使用策略

```java
// Java应用中混合使用Cypher和Gremlin
// Neo4j使用Cypher
try (Session session = neo4jDriver.session()) {
    Result result = session.run(
        "MATCH (u:User {name: $name})-[:FOLLOWS]->(f) RETURN f.name",
        parameters("name", "张三")
    );
}

// JanusGraph使用Gremlin
GraphTraversalSource g = graph.traversal();
List<Object> friends = g.V()
    .has("User", "name", "张三")
    .out("FOLLOWS")
    .values("name")
    .toList();
```

#### 跨语言迁移对照表

| 操作 | Cypher | Gremlin | nGQL |
|------|--------|---------|------|
| 按标签查找 | `MATCH (n:User)` | `g.V().hasLabel('User')` | `LOOKUP ON User` |
| 按属性过滤 | `WHERE n.age > 18` | `.has('age', gt(18))` | `WHERE User.age > 18` |
| 出边遍历 | `(a)-[:FOLLOWS]->(b)` | `.out('FOLLOWS')` | `GO FROM ... OVER FOLLOWS` |
| 入边遍历 | `(a)<-[:FOLLOWS]-(b)` | `.in('FOLLOWS')` | `GO FROM ... OVER FOLLOWS REVERSELY` |
| 聚合 | `RETURN count(n)` | `.count()` | `YIELD count(*)` |
| 分组 | `RETURN n.city, count(n)` | `.groupCount().by('city')` | `GROUP BY ... YIELD ...` |
| 排序 | `ORDER BY n.age DESC` | `.order().by('age', desc)` | `ORDER BY ... DESC` |
| 分页 | `SKIP 10 LIMIT 5` | `.skip(10).limit(5)` | `SKIP 10 LIMIT 5` |

### 5.7.4 使用场景

| 场景 | 推荐语言 | 理由 |
|------|---------|------|
| 快速原型开发 | Cypher | 语法直观，学习成本低 |
| 高性能图算法 | Gremlin | 精细控制执行路径 |
| 知识图谱/语义网 | SPARQL | RDF原生支持，联邦查询 |
| 超大规模在线查询 | nGQL | 分布式优化，管道模型 |
| 企业级混合负载 | Cypher + Gremlin | 简单查询用Cypher，复杂算法用Gremlin |

### 5.7.5 潜在风险与注意事项

1. **锁定风险**：选择私有语言（nGQL）或厂商特定实现（Neo4j的Cypher扩展）可能导致迁移困难
2. **团队技能**：Gremlin的陡峭学习曲线可能拖慢开发进度
3. **性能预期**：SPARQL的推理查询性能可能远低于预期，需充分测试
4. **生态依赖**：语言生态决定了可用的工具、驱动和社区支持
5. **未来趋势**：GQL（ISO新标准）正在统一图查询语言，长期应关注其发展

### 5.7.6 本章小结

没有"最好"的图查询语言，只有"最合适"的。Cypher适合快速开发和标准图查询，Gremlin适合算法密集型场景，SPARQL是知识图谱的标准答案，nGQL适合超大规模分布式部署。建议团队根据数据模型、规模、技能和生态四个维度综合评估。

---

## 5.8 综合练习

#### 练习1：社交推荐

用Cypher和Gremlin分别实现：找到与张三有共同好友但张三不认识的人，按共同好友数排序。

<details>
<summary>Cypher答案</summary>

```cypher
MATCH (zhang:User {name: '张三'})-[:FOLLOWS]->(friend:User)
MATCH (friend)-[:FOLLOWS]->(candidate:User)
WHERE NOT EXISTS {
  MATCH (zhang)-[:FOLLOWS]->(candidate)
}
RETURN candidate.name AS 推荐用户,
       count(DISTINCT friend) AS 共同好友数
ORDER BY 共同好友数 DESC
LIMIT 10
```
</details>

<details>
<summary>Gremlin答案</summary>

```groovy
g.V().has('User', 'name', '张三')
  .out('FOLLOWS').aggregate('friends')
  .out('FOLLOWS')
  .where(without('friends'))
  .groupCount()
  .order(local).by(values, desc)
  .limit(local, 10)
```
</details>

#### 练习2：反欺诈

用nGQL实现：查找3跳内存在资金环路的账户对。

<details>
<summary>nGQL答案</summary>

```nGQL
FIND ALL PATH FROM 'A001' OVER TRANSFER_TO UPTO 3 STEPS
| WHERE id($-.path[0]) == id($-.path[-1])
YIELD $-.path AS 环路
```
</details>

#### 练习3：知识图谱

用SPARQL查询：找出与"张三"在同一城市、有共同兴趣的人。

<details>
<summary>SPARQL答案</summary>

```sparql
PREFIX ex: <http://example.org/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?person ?interest
WHERE {
  ex:张三 ex:livesIn ?city .
  ex:张三 foaf:interest ?interest .
  ?person ex:livesIn ?city .
  ?person foaf:interest ?interest .
  FILTER(?person != ex:张三)
}
```
</details>

---

## 本章总结

1. **Cypher** 以ASCII模式语法著称，是图查询的入门首选，适合大多数业务场景
2. **Gremlin** 提供最精细的执行控制，是图算法和性能调优的利器
3. **SPARQL** 是语义网和知识图谱的标准语言，联邦查询和推理支持独一无二
4. **nGQL** 以管道模型应对分布式大规模图查询，性能优异但生态待完善
5. **查询优化器** 通过RBO和CBO将声明式查询转化为高效执行计划，索引策略是关键
6. **子图匹配** 是图查询的理论基础，VF2算法是工业标准，近似算法处理大规模图
7. **语言选型** 需综合考虑数据模型、规模、团队技能和生态，GQL标准值得关注

图查询语言仍在快速演进。ISO正在制定的GQL标准（2024年发布初版）融合了Cypher和SQL的优点，有望成为图查询的统一标准。建议读者持续关注GQL的发展，同时深入掌握至少一种现有语言以解决实际问题。
