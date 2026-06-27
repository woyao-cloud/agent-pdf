# 第3章 Neptune 数据模型与查询语言

## 3.1 属性图模型（Property Graph）

### 3.1.1 解决的问题

传统关系型数据库在处理高度关联的数据时面临两大困境：**多表 JOIN 的性能瓶颈**和**schema 僵化难以应对业务变化**。社交网络中的好友关系、电商中的用户-商品-订单链路、知识图谱中的实体关联——这些场景天然是图结构，却被迫用关系表模拟，导致查询复杂度呈指数级上升。

属性图模型（Property Graph Model）正是为解决这些问题而生。它将数据抽象为**节点（Vertex）**和**边（Edge）**，节点和边都可以携带任意数量的**属性（Property）**，边具有明确的**方向（Direction）**和**类型（Label/Type）**。这种模型让开发者以最自然的方式表达关联数据，无需人工拆解为二维表。

### 3.1.2 核心原理

属性图的核心要素：

| 要素 | 说明 | 示例 |
|------|------|------|
| **节点（Vertex）** | 表示实体，可带标签和属性 | 人、城市、订单 |
| **边（Edge）** | 表示关系，有方向、类型和属性 | 关注、购买、位于 |
| **标签（Label）** | 节点或边的类型标识 | `Person`、`City`、`purchased` |
| **属性（Property）** | 键值对，值可以是标量或集合 | `name: "Alice"`, `age: 30` |
| **ID** | 每个节点和边的唯一标识 | 字符串或数字 |

一个典型的属性图结构：

```
[Alice:Person {name:"Alice", age:30}]
    |--[follows {since:2020}]-->[Bob:Person {name:"Bob", age:25}]
    |--[lives_in]-->[Beijing:City {name:"Beijing", population:2154万}]
[Bob]--[lives_in]-->[Beijing]
```

**与 RDF 的核心差异**：

| 维度 | 属性图 | RDF |
|------|--------|-----|
| 数据单元 | 节点和边携带属性 | 三元组（主语-谓语-宾语） |
| Schema | 隐式，通过标签体现 | 显式，通过 RDFS/OWL 定义 |
| 唯一标识 | 内部 ID | IRI（国际化资源标识符） |
| 边属性 | 原生支持 | 需通过 reification 或 named graph 模拟 |
| 查询语言 | Gremlin / openCypher | SPARQL |

### 3.1.3 代码/配置实现

在 Neptune 中创建属性图数据：

```gremlin
// 创建节点
g.addV('Person').property('name', 'Alice').property('age', 30)
g.addV('Person').property('name', 'Bob').property('age', 25)
g.addV('City').property('name', 'Beijing').property('population', 21540000)

// 创建边
g.V().has('Person','name','Alice').as('a')
 .V().has('Person','name','Bob').as('b')
 .addE('follows').from('a').to('b')
 .property('since', 2020)

g.V().has('Person','name','Alice').as('a')
 .V().has('City','name','Beijing').as('c')
 .addE('lives_in').from('a').to('c')

g.V().has('Person','name','Bob').as('b')
 .V().has('City','name','Beijing').as('c')
 .addE('lives_in').from('b').to('c')
```

使用 openCypher 创建相同数据：

```cypher
CREATE (a:Person {name: 'Alice', age: 30})
CREATE (b:Person {name: 'Bob', age: 25})
CREATE (c:City {name: 'Beijing', population: 21540000})
CREATE (a)-[:follows {since: 2020}]->(b)
CREATE (a)-[:lives_in]->(c)
CREATE (b)-[:lives_in]->(c)
```

### 3.1.4 使用场景

- **社交网络**：用户、好友关系、关注链、推荐路径
- **欺诈检测**：账户、交易、设备之间的关联分析，环检测
- **推荐引擎**：用户-物品-标签的多跳关联
- **身份图谱**：人、手机号、设备、地址之间的关联网络
- **实时反洗钱**：资金流转路径追踪

### 3.1.5 潜在风险与注意事项

1. **过度建模**：将每个业务属性都建模为边而非节点属性，导致图过于复杂。原则：如果属性不需要独立关联其他实体，就用节点属性而非边。
2. **标签设计**：标签不宜过多（建议不超过几十个），否则查询性能下降。标签是类型标识，不是分类层级。
3. **属性值大小**：单个属性值不宜过大（建议 < 1MB），大文本应存储在外部系统。
4. **ID 冲突**：Neptune 使用字符串 ID，需确保全局唯一。使用业务 ID 时注意前缀区分。
5. **边方向**：查询时注意边的方向语义。`out()` 和 `in()` 的方向取决于建模时的边方向。

### 3.1.6 本章小结

属性图模型是 Neptune 最核心的数据模型，它以节点和边为基本单元，支持标签和属性，天然适合表达高度关联的数据。与 RDF 相比，属性图更直观、查询性能更优，尤其适合 OLTP 风格的图查询场景。选择属性图还是 RDF，取决于数据是否需要严格的语义推理和跨数据集的 IRI 互操作。

---

## 3.2 RDF 模型与三元组

### 3.2.1 解决的问题

当数据需要在**不同组织、不同系统之间共享和互操作**时，属性图的隐式 schema 和内部 ID 机制成为障碍。例如，两个公司各自维护了"人"的数据，如何确保它们指的是同一个实体？如何让机器自动推理出"如果 A 是 B 的父亲，B 是 C 的父亲，那么 A 是 C 的祖父"？

RDF（Resource Description Framework）模型通过**全局唯一的 IRI** 和**形式化的语义推理**解决了这些问题。它让数据成为 Web 的一部分，而非孤岛。

### 3.2.2 核心原理

**三元组（Triple）** 是 RDF 的基本数据单元，形式为 `(subject, predicate, object)`：

```
<http://example.org/people/Alice> <http://xmlns.com/foaf/0.1/knows> <http://example.org/people/Bob> .
```

| 成分 | 含义 | 示例 |
|------|------|------|
| **Subject（主语）** | 被描述的资源 | `ex:Alice` |
| **Predicate（谓语）** | 属性或关系 | `foaf:knows` |
| **Object（宾语）** | 属性值或另一个资源 | `ex:Bob` 或 `"Alice"^^xsd:string` |

**RDFS（RDF Schema）** 提供基础的 ontology 原语：

```turtle
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex: <http://example.org/> .

ex:Person rdfs:subClassOf ex:Agent .
ex:knows rdfs:domain ex:Person ;
         rdfs:range ex:Person .
ex:age rdfs:domain ex:Person ;
       rdfs:range xsd:integer .
```

**OWL（Web Ontology Language）** 提供更强大的推理能力：

```turtle
@prefix owl: <http://www.w3.org/2002/07/owl#> .

ex:Father owl:subClassOf ex:Parent .
ex:hasChild owl:inverseOf ex:hasParent .

# 传递属性推理：如果 A 是 B 的祖先，B 是 C 的祖先，则 A 是 C 的祖先
ex:ancestorOf rdf:type owl:TransitiveProperty .
```

**Named Graph（命名图）** 允许对三元组集合进行分组：

```sparql
GRAPH <http://example.org/graph/sourceA> {
  <alice> <age> 30 .
  <alice> <knows> <bob> .
}
GRAPH <http://example.org/graph/sourceB> {
  <bob> <age> 25 .
}
```

**属性图 vs RDF 对比**：

| 维度 | 属性图 | RDF |
|------|--------|-----|
| 查询性能 | OLTP 场景更优 | 推理场景更优 |
| 语义推理 | 不支持 | 支持 RDFS/OWL 推理 |
| 数据互操作 | 内部 ID，难跨系统 | IRI，天然支持跨系统 |
| 边属性 | 原生支持 | 需 reification（复杂） |
| 学习曲线 | 较低 | 较高 |
| 工具生态 | Gremlin, Cypher | SPARQL, Protege, Jena |

### 3.2.3 代码/配置实现

在 Neptune 中加载 RDF 数据（Turtle 格式）：

```turtle
@prefix ex: <http://example.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:Alice a foaf:Person ;
         foaf:name "Alice" ;
         foaf:age 30 ;
         foaf:knows ex:Bob ;
         ex:livesIn ex:Beijing .

ex:Bob a foaf:Person ;
       foaf:name "Bob" ;
       foaf:age 25 ;
       foaf:knows ex:Alice ;
       ex:livesIn ex:Beijing .

ex:Beijing a ex:City ;
           ex:cityName "Beijing" ;
           ex:population 21540000 .
```

使用 SPARQL UPDATE 加载数据：

```sparql
PREFIX ex: <http://example.org/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

INSERT DATA {
  ex:Alice a foaf:Person ; foaf:name "Alice" ; foaf:age 30 .
  ex:Bob a foaf:Person ; foaf:name "Bob" ; foaf:age 25 .
  ex:Beijing a ex:City ; ex:cityName "Beijing" ; ex:population 21540000 .
}
```

启用 Neptune 推理（需在创建实例时配置）：

```bash
# 创建 Neptune 实例时启用 OWL 推理
aws neptune create-db-instance \
    --db-instance-identifier my-neptune \
    --db-instance-class db.r5.large \
    --engine neptune \
    --enable-iam-db-authentication \
    --neptune-owl-config '{"mode":"inferenceOnly"}'
```

### 3.2.4 使用场景

- **开放数据互联（Linked Open Data）**：DBpedia、Wikidata 等开放数据集均使用 RDF
- **知识图谱**：企业级知识图谱需要语义推理能力
- **数据联邦**：跨多个数据源的联合查询
- **Schema 演化频繁的场景**：RDF 的 schema 灵活性最高
- **学术研究与出版**：语义 Web 领域的标准数据模型
- **本体工程**：医学、金融等领域的复杂本体建模

### 3.2.5 潜在风险与注意事项

1. **性能开销**：推理引擎会显著增加查询延迟。生产环境中建议使用 `inferenceOnly` 模式，在数据加载时完成推理，查询时只读取推理结果。
2. **Reification 复杂度**：RDF 原生不支持边属性，需要用 reification（将边变为一个中间节点）模拟，这会使数据量膨胀 3-4 倍，查询复杂度也大幅增加。
3. **IRI 膨胀**：每个资源都需要完整的 IRI，数据文件体积大。可使用前缀缩写（如 `ex:`）缓解。
4. **推理爆炸**：不当的 OWL 规则可能导致推理出大量无用三元组，需谨慎设计 ontology。
5. **Neptune 限制**：Neptune 的推理器不支持所有 OWL 2 特性，仅支持 OWL 2 RL 子集。

### 3.2.6 本章小结

RDF 模型以三元组为基本单元，通过 IRI 实现全局唯一标识，通过 RDFS/OWL 提供形式化的语义推理能力。它解决了跨系统数据互操作和语义推理的问题，但带来了更高的复杂性和性能开销。在 Neptune 中，RDF 和属性图可以共存于同一个实例中（通过不同的 endpoint 访问），这为混合场景提供了灵活性。

---

## 3.3 Gremlin 查询语言详解

### 3.3.1 解决的问题

Gremlin 是 Apache TinkerPop 框架的图遍历语言，它解决了"如何在属性图上进行高效的声明式和命令式混合遍历"的问题。与 SQL 不同，Gremlin 允许开发者以**遍历步骤（Traversal Step）** 的方式逐步导航图结构，每一步都返回一个新的遍历对象，支持链式调用。

Gremlin 的核心哲学是：**遍历就是查询**。你从一组起始节点出发，沿着边一步步走到目标节点，每一步都可以进行过滤、转换、聚合。

### 3.3.2 核心原理

Gremlin 的遍历模型基于**数据流（Dataflow）** 架构：

```
起始步骤 → 中间步骤（可多个） → 终端步骤
   |            |                    |
  V/E()    has()/out()/in()/values()   toList()/next()/count()
```

**关键概念**：

- **Traversal（遍历）**：一系列步骤的链式组合
- **Step（步骤）**：遍历中的每个操作
- **Graph Traversal Source（遍历源）**：`g` 对象，遍历的起点
- **Lazy Evaluation（惰性求值）**：步骤不立即执行，直到遇到终端步骤

**步骤分类**：

| 类别 | 步骤 | 说明 |
|------|------|------|
| **起始** | `V()` / `E()` | 从所有节点/边开始 |
| **导航** | `out()` / `in()` / `both()` | 沿出边/入边/双向边移动 |
| **过滤** | `has()` / `where()` / `filter()` | 按条件过滤 |
| **转换** | `values()` / `select()` / `project()` | 提取或转换数据 |
| **聚合** | `count()` / `groupCount()` / `fold()` | 聚合计算 |
| **路径** | `repeat()` / `until()` / `emit()` | 循环遍历 |
| **排序** | `order()` / `by()` | 排序 |
| **终端** | `toList()` / `next()` / `iterate()` | 触发执行 |

### 3.3.3 代码/配置实现

以下所有示例基于同一数据集：

```gremlin
// 创建示例数据
g.addV('person').property('id', '1').property('name', 'Alice').property('age', 30).as('a')
 .addV('person').property('id', '2').property('name', 'Bob').property('age', 25).as('b')
 .addV('person').property('id', '3').property('name', 'Charlie').property('age', 35).as('c')
 .addV('person').property('id', '4').property('name', 'David').property('age', 28).as('d')
 .addV('person').property('id', '5').property('name', 'Eve').property('age', 22).as('e')
 .addV('software').property('id', '6').property('name', 'Neptune').property('lang', 'java').as('s1')
 .addV('software').property('id', '7').property('name', 'Gremlin').property('lang', 'java').as('s2')
 .addV('city').property('id', '8').property('name', 'Beijing').as('c1')
 .addV('city').property('id', '9').property('name', 'Shanghai').as('c2')
 .addE('knows').from('a').to('b').property('since', 2020)
 .addE('knows').from('a').to('c').property('since', 2019)
 .addE('knows').from('b').to('d').property('since', 2021)
 .addE('knows').from('c').to('e').property('since', 2018)
 .addE('created').from('a').to('s1').property('weight', 0.8)
 .addE('created').from('b').to('s2').property('weight', 0.6)
 .addE('created').from('c').to('s1').property('weight', 0.5)
 .addE('uses').from('a').to('s2').property('proficiency', 'advanced')
 .addE('lives_in').from('a').to('c1')
 .addE('lives_in').from('b').to('c1')
 .addE('lives_in').from('c').to('c2')
 .addE('lives_in').from('d').to('c1')
 .addE('lives_in').from('e').to('c2')
 .iterate()
```

#### 3.3.3.1 基础遍历

**查询所有节点**：

```gremlin
g.V()
// 结果: 9 个节点
```

**查询所有边**：

```gremlin
g.E()
// 结果: 12 条边
```

**按属性过滤**：

```gremlin
// 查找名字为 Alice 的人
g.V().has('person', 'name', 'Alice')

// 查找年龄大于 25 的人
g.V().has('person', 'age', gt(25))

// 多条件过滤
g.V().has('person', 'age', gt(20)).has('name', within('Alice', 'Bob'))

// hasLabel 过滤标签
g.V().hasLabel('person')

// hasNot 排除属性
g.V().hasNot('age')
```

**导航遍历**：

```gremlin
// 从 Alice 出发，沿 knows 出边到达的人
g.V().has('person', 'name', 'Alice').out('knows')
// 结果: Bob, Charlie

// 从 Alice 出发，沿所有出边
g.V().has('person', 'name', 'Alice').out()
// 结果: Bob, Charlie, Neptune, Gremlin, Beijing

// 入边遍历：谁认识 Alice？
g.V().has('person', 'name', 'Alice').in('knows')
// 结果: Bob（如果关系是双向的）

// 双向遍历
g.V().has('person', 'name', 'Alice').both('knows')
// 结果: Bob, Charlie（以及认识 Alice 的人）

// 多跳遍历：Alice 认识的人认识的人
g.V().has('person', 'name', 'Alice').out('knows').out('knows')
// 结果: David, Eve
```

**提取属性值**：

```gremlin
// 获取名字
g.V().has('person', 'name', 'Alice').values('name')
// 结果: "Alice"

// 获取所有属性
g.V().has('person', 'name', 'Alice').valueMap()
// 结果: {name: ["Alice"], age: [30], id: ["1"]}

// 选择特定属性
g.V().has('person', 'name', 'Alice').valueMap('name', 'age')
```

#### 3.3.3.2 路径查询

**repeat-until 循环**：

```gremlin
// 查找从 Alice 出发，沿 knows 边最多 3 跳可达的所有人
g.V().has('person', 'name', 'Alice')
 .repeat(out('knows'))
 .times(3)
 .values('name')
// 结果: Bob, Charlie, David, Eve

// 直到满足条件才停止
g.V().has('person', 'name', 'Alice')
 .repeat(out('knows'))
 .until(has('age', lt(25)))
 .values('name')
// 结果: Eve（第一个年龄小于 25 的人）

// 查找所有可达路径（包括中间节点）
g.V().has('person', 'name', 'Alice')
 .repeat(out('knows'))
 .emit()
 .times(3)
 .values('name')
// 结果: Bob, Charlie, David, Eve（emit 会输出每一步的节点）

// 从两端向中间查找路径
g.V().has('person', 'name', 'Alice')
 .repeat(both('knows'))
 .until(has('name', 'Eve'))
 .path()
 .limit(1)
// 结果: Alice → Bob → ... → Eve 的完整路径
```

**路径信息**：

```gremlin
// 获取路径和边的属性
g.V().has('person', 'name', 'Alice')
 .outE('knows').inV()
 .path()
 .by('name')
 .by('since')
 .by('name')
// 结果: path[Alice, 2020, Bob], path[Alice, 2019, Charlie]

// 使用 select 获取路径中的特定步骤
g.V().has('person', 'name', 'Alice').as('a')
 .out('knows').as('b')
 .out('knows').as('c')
 .select('a', 'b', 'c')
 .by('name')
// 结果: {a: Alice, b: Bob, c: David}, {a: Alice, b: Charlie, c: Eve}
```

#### 3.3.3.3 聚合与分组

**计数**：

```gremlin
// 统计所有人
g.V().hasLabel('person').count()
// 结果: 5

// 统计每个人创建了多少软件
g.V().hasLabel('person')
 .project('name', 'count')
 .by('name')
 .by(out('created').count())
// 结果: {name: Alice, count: 1}, {name: Bob, count: 1}, {name: Charlie, count: 1}
```

**分组**：

```gremlin
// 按城市分组统计人数
g.V().hasLabel('person')
 .group()
 .by('lives_in')
 .by(count())
// 结果过于复杂，因为 by('lives_in') 返回的是边

// 正确的分组方式
g.V().hasLabel('person')
 .group()
 .by(out('lives_in').values('name'))
 .by(count())
// 结果: {Beijing: 3, Shanghai: 2}

// groupCount 简化版
g.V().hasLabel('person')
 .out('lives_in')
 .values('name')
 .groupCount()
// 结果: {Beijing: 3, Shanghai: 2}
```

**fold/unfold**：

```gremlin
// fold 将多个结果合并为列表
g.V().hasLabel('person').values('name').fold()
// 结果: [Alice, Bob, Charlie, David, Eve]

// unfold 将列表展开为多个结果
g.V().hasLabel('person').values('name').fold()
 .unfold()
 .filter(values('name').is(neq('Alice')))
// 结果: Bob, Charlie, David, Eve
```

#### 3.3.3.4 过滤与条件

**where 子句**：

```gremlin
// 查找年龄大于 25 的人
g.V().hasLabel('person').where(values('age').is(gt(25)))

// 查找认识比自己年轻的人
g.V().hasLabel('person').as('p')
 .out('knows')
 .where(values('age').as('friendAge'))
 .where('p', lt('friendAge'))
 .by('age')
 .select('p', 'friendAge')
 .by('name')
 .by('age')
// 结果: {p: Alice, friendAge: 25}, {p: Charlie, friendAge: 22}

// where 与 by 组合
g.V().hasLabel('person')
 .where(out('created').count().is(gt(0)))
 .values('name')
// 结果: Alice, Bob, Charlie（创建过软件的人）
```

**dedup 去重**：

```gremlin
// 查找所有被认识的人（去重）
g.V().hasLabel('person').out('knows').dedup().values('name')
// 结果: Bob, Charlie, David, Eve

// 按属性去重
g.V().hasLabel('person').out('lives_in').dedup().values('name')
// 结果: Beijing, Shanghai
```

#### 3.3.3.5 排序与分页

```gremlin
// 按年龄升序
g.V().hasLabel('person').order().by('age', asc).values('name', 'age')
// 结果: Eve(22), Bob(25), David(28), Alice(30), Charlie(35)

// 按创建软件数量降序
g.V().hasLabel('person')
 .order().by(out('created').count(), desc)
 .project('name', 'creations')
 .by('name')
 .by(out('created').count())

// 分页
g.V().hasLabel('person').order().by('age', asc)
 .range(0, 2)
 .values('name')
// 结果: Eve, Bob（前两个）
```

#### 3.3.3.6 复杂查询示例

**查找 Alice 可能认识的人（好友的好友）**：

```gremlin
g.V().has('person', 'name', 'Alice')
 .out('knows').out('knows')
 .dedup()
 .where(without('Alice'))
 .values('name')
// 结果: David, Eve
```

**查找与 Alice 住在同一城市的人**：

```gremlin
g.V().has('person', 'name', 'Alice')
 .out('lives_in')
 .in('lives_in')
 .where(has('name', neq('Alice')))
 .values('name')
// 结果: Bob, David
```

**查找共同好友**：

```gremlin
g.V().has('person', 'name', 'Alice').out('knows').as('friend')
 .V().has('person', 'name', 'Bob').out('knows')
 .where(eq('friend'))
 .values('name')
// 结果: 空（Alice 和 Bob 没有共同好友）

// 更通用的共同好友查询
g.V().has('person', 'name', within('Alice', 'Bob'))
 .out('knows')
 .groupCount()
 .unfold()
 .where(select(values).is(gt(1)))
 .select(keys).values('name')
```

**推荐好友（基于共同城市和共同认识的人）**：

```gremlin
g.V().has('person', 'name', 'Alice').as('alice')
 .both('lives_in').aggregate('cities')
 .both('knows').where(neq('alice'))
 .groupCount()
 .order().by(values, desc)
 .limit(5)
 .select(keys).values('name')
```

### 3.3.4 使用场景

- **实时图遍历**：社交网络好友链、推荐路径
- **OLTP 图查询**：单次请求需要毫秒级响应
- **复杂路径分析**：最短路径、环检测、子图匹配
- **ETL 数据处理**：图数据的批量转换和清洗
- **与 Java 生态集成**：Gremlin 原生支持 Java，可嵌入应用代码

### 3.3.5 潜在风险与注意事项

1. **内存溢出**：`g.V()` 不加过滤会加载所有节点到内存。生产环境务必加 `has()` 或 `limit()`。
2. **深度遍历风险**：`repeat().times(N)` 中 N 过大（如 > 10）可能导致性能问题。建议设置上限。
3. **匿名遍历陷阱**：在 `repeat()` 内部使用 `V()` 会重新从全图开始，而非当前节点。应使用 `out()`/`in()` 等相对遍历。
4. **Lambda 表达式限制**：Neptune 不支持 Groovy Lambda（如 `filter{it.get().value('age') > 25}`），必须使用 Gremlin 步骤。
5. **事务管理**：Neptune 的 Gremlin 实现是自动提交事务的，不支持多语句事务。复杂写入需使用 `tx.commit()` 模式。
6. **字符串 ID**：Neptune 要求所有 ID 为字符串，使用数字 ID 会自动转为字符串。

### 3.3.6 本章小结

Gremlin 是 Neptune 最强大的查询语言，它采用遍历步骤的链式组合方式，支持从简单查找到复杂路径分析的各种场景。其核心优势在于：声明式和命令式的混合能力、丰富的步骤库、以及跨语言的可移植性（TinkerPop 生态）。但 Gremlin 的学习曲线较陡，需要理解遍历模型和惰性求值的概念。对于需要复杂路径遍历和实时 OLTP 查询的场景，Gremlin 是首选。

---

## 3.4 SPARQL 查询语言

### 3.4.1 解决的问题

SPARQL（SPARQL Protocol and RDF Query Language）是 W3C 标准的 RDF 查询语言，它解决了"如何在 RDF 数据上进行声明式查询"的问题。SPARQL 的核心思想是**图模式匹配（Graph Pattern Matching）**——你描述你想要的数据模式，引擎负责找到所有匹配。

与 Gremlin 的命令式遍历不同，SPARQL 是纯声明式的：你告诉系统"要什么"，而不是"怎么找"。

### 3.4.2 核心原理

SPARQL 查询的核心是 **Basic Graph Pattern（BGP）**——一组三元组模式的集合：

```sparql
SELECT ?name ?age
WHERE {
  ?person foaf:name ?name .
  ?person foaf:age ?age .
}
```

**查询形式**：

| 形式 | 说明 | 返回 |
|------|------|------|
| `SELECT` | 返回投影后的变量值 | 表格 |
| `CONSTRUCT` | 根据结果构建新的 RDF 图 | RDF 图 |
| `ASK` | 判断是否存在匹配 | 布尔值 |
| `DESCRIBE` | 返回描述资源的 RDF 数据 | RDF 图 |

**关键概念**：

- **变量**：以 `?` 或 `$` 开头，如 `?person`
- **三元组模式**：`<subject> <predicate> <object>`，其中任何位置可以是变量
- **FILTER**：过滤条件
- **OPTIONAL**：可选匹配
- **UNION**：并集
- **Property Path**：属性路径（类似正则表达式）

### 3.4.3 代码/配置实现

#### 3.4.3.1 SELECT 查询

**基础查询**：

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

# 查询所有人的名字和年龄
SELECT ?name ?age
WHERE {
  ?person a foaf:Person .
  ?person foaf:name ?name .
  ?person foaf:age ?age .
}
ORDER BY DESC(?age)
```

**带过滤的查询**：

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

# 查询年龄大于 25 的人
SELECT ?name ?age
WHERE {
  ?person a foaf:Person .
  ?person foaf:name ?name .
  ?person foaf:age ?age .
  FILTER(?age > 25)
}
```

**多条件过滤**：

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?name ?age
WHERE {
  ?person a foaf:Person .
  ?person foaf:name ?name .
  ?person foaf:age ?age .
  FILTER(?age > 20 && ?age < 35)
  FILTER(?name != "Alice")
}
```

**OPTIONAL 查询**：

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

# 查询所有人，可选地获取他们居住的城市
SELECT ?name ?city
WHERE {
  ?person foaf:name ?name .
  OPTIONAL {
    ?person ex:livesIn ?cityNode .
    ?cityNode ex:cityName ?city .
  }
}
```

**UNION 查询**：

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

# 查询认识 Alice 或年龄大于 30 的人
SELECT ?name
WHERE {
  ?person foaf:name ?name .
  {
    ?person foaf:knows ex:Alice .
  } UNION {
    ?person foaf:age ?age .
    FILTER(?age > 30)
  }
}
```

#### 3.4.3.2 CONSTRUCT 查询

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

# 构建一个"年长者认识年轻者"的关系图
CONSTRUCT {
  ?older ex:mentors ?younger .
}
WHERE {
  ?older foaf:age ?olderAge .
  ?younger foaf:age ?youngerAge .
  ?older foaf:knows ?younger .
  FILTER(?olderAge > ?youngerAge)
}
```

#### 3.4.3.3 ASK 查询

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

# 检查 Alice 是否认识年龄小于 25 的人
ASK {
  ex:Alice foaf:knows ?person .
  ?person foaf:age ?age .
  FILTER(?age < 25)
}
# 返回: true（如果 Eve 被 Alice 认识）
```

#### 3.4.3.4 Property Path（属性路径）

SPARQL 1.1 支持类似正则表达式的属性路径：

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

# 查找 Alice 认识的人认识的人（2 跳）
SELECT ?name
WHERE {
  ex:Alice foaf:knows/foaf:knows ?person .
  ?person foaf:name ?name .
}

# 查找 Alice 认识的人（1 跳或多跳）
SELECT ?name
WHERE {
  ex:Alice foaf:knows+ ?person .
  ?person foaf:name ?name .
}

# 查找 Alice 可能认识的人（0 跳或多跳）
SELECT ?name
WHERE {
  ex:Alice foaf:knows* ?person .
  ?person foaf:name ?name .
}

# 查找与 Alice 有共同认识的人
SELECT ?name
WHERE {
  ex:Alice ^foaf:knows/foaf:knows ?person .
  FILTER(?person != ex:Alice)
  ?person foaf:name ?name .
}

# 使用 | 表示或
SELECT ?name
WHERE {
  ex:Alice (foaf:knows|ex:livesIn) ?target .
  ?target foaf:name|ex:cityName ?name .
}
```

#### 3.4.3.5 聚合查询

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

# 统计每个城市的人数
SELECT ?cityName (COUNT(?person) AS ?count)
WHERE {
  ?person ex:livesIn ?city .
  ?city ex:cityName ?cityName .
}
GROUP BY ?cityName
ORDER BY DESC(?count)

# 统计每个人创建的软件数量
SELECT ?name (COUNT(?software) AS ?creations)
WHERE {
  ?person foaf:name ?name .
  OPTIONAL { ?person ex:created ?software . }
}
GROUP BY ?name
HAVING (COUNT(?software) > 0)
```

#### 3.4.3.6 联邦查询

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

# 联合查询本地数据和远程 SPARQL endpoint
SELECT ?name ?abstract
WHERE {
  ex:Alice foaf:knows ?person .
  ?person foaf:name ?name .

  # 远程查询 DBpedia 获取人物摘要
  SERVICE <http://dbpedia.org/sparql> {
    ?dbPerson rdfs:label ?name .
    ?dbPerson dbo:abstract ?abstract .
    FILTER(LANG(?abstract) = 'en')
  }
}
LIMIT 10
```

#### 3.4.3.7 Named Graph 查询

```sparql
# 查询特定命名图中的数据
SELECT ?subject ?predicate ?object
WHERE {
  GRAPH <http://example.org/graph/sourceA> {
    ?subject ?predicate ?object .
  }
}

# 跨命名图查询
SELECT ?subject ?predicate ?object ?graph
WHERE {
  GRAPH ?graph {
    ?subject ?predicate ?object .
  }
}
```

### 3.4.4 使用场景

- **语义查询**：需要 RDFS/OWL 推理的场景
- **开放数据查询**：查询 DBpedia、Wikidata 等开放数据集
- **数据联邦**：跨多个 SPARQL endpoint 的联合查询
- **本体查询**：查询 OWL 本体中的类和关系
- **数据集成**：将多个 RDF 数据源合并查询
- **BI 报表**：复杂的聚合分析查询

### 3.4.5 潜在风险与注意事项

1. **性能问题**：SPARQL 的 BGP 匹配是 NP 难问题，复杂查询可能极慢。务必使用 `LIMIT` 和查询超时。
2. **推理性能**：启用推理后，查询延迟可能增加 2-10 倍。建议在数据加载时预计算推理结果。
3. **Property Path 深度**：`+` 和 `*` 路径可能导致无限循环。Neptune 对属性路径深度有限制（默认 100）。
4. **SERVICE 关键字**：联邦查询中的远程 endpoint 可能成为性能瓶颈，且远程服务不可用会导致整个查询失败。
5. **Neptune 限制**：Neptune 不支持 SPARQL Update 的全部特性（如 `DELETE WHERE` 的某些变体），也不支持 SPARQL 1.2 的新特性。
6. **结果大小**：`CONSTRUCT` 查询可能产生大量三元组，需注意 Neptune 的结果集大小限制（默认 100 万条）。

### 3.4.6 本章小结

SPARQL 是 RDF 世界的标准查询语言，以声明式图模式匹配为核心。它支持 SELECT、CONSTRUCT、ASK、DESCRIBE 四种查询形式，以及属性路径、联邦查询、命名图等高级特性。SPARQL 的优势在于标准化程度高、语义推理能力强、适合跨系统数据集成。但其性能在复杂查询下可能不如 Gremlin，且学习曲线较陡。在需要语义推理和开放数据互操作的场景中，SPARQL 是不可替代的选择。

---

## 3.5 openCypher 查询语言

### 3.5.1 解决的问题

openCypher 是 Cypher 查询语言的开源实现，最初由 Neo4j 开发。它解决了"如何用更直观、类似 ASCII art 的方式表达图模式"的问题。Cypher 的核心理念是：**用括号表示节点，用箭头表示边**，让查询模式看起来就像图本身。

```cypher
(a:Person {name: 'Alice'})-[:knows]->(b:Person {name: 'Bob'})
```

这种视觉化的语法大大降低了图查询的学习门槛，让开发者可以用接近自然语言的方式表达复杂的图模式。

### 3.5.2 核心原理

openCypher 的查询模型基于 **模式匹配（Pattern Matching）**：

```
MATCH (模式)
WHERE (条件)
RETURN (结果)
```

**关键子句**：

| 子句 | 说明 | 示例 |
|------|------|------|
| `MATCH` | 匹配图模式 | `(a)-[:knows]->(b)` |
| `WHERE` | 过滤条件 | `WHERE a.age > 25` |
| `RETURN` | 返回结果 | `RETURN a.name, b.name` |
| `CREATE` | 创建节点或边 | `CREATE (a:Person {name: 'Alice'})` |
| `MERGE` | 查找或创建 | `MERGE (a:Person {name: 'Alice'})` |
| `DELETE` | 删除节点或边 | `DELETE a, r` |
| `SET` | 设置属性 | `SET a.age = 30` |
| `WITH` | 管道传递结果 | `WITH a, count(*) AS cnt` |
| `ORDER BY` | 排序 | `ORDER BY a.age DESC` |
| `SKIP` / `LIMIT` | 分页 | `SKIP 10 LIMIT 10` |

**节点模式语法**：

```
(变量名:标签 {属性名: 属性值})
```

**边模式语法**：

```
-[变量名:类型 {属性名: 属性值}]->
<-[变量名:类型]-  (入边)
-[变量名:类型]-    (无方向)
```

### 3.5.3 代码/配置实现

#### 3.5.3.1 基础 MATCH 查询

**查询所有节点**：

```cypher
MATCH (n)
RETURN n
LIMIT 10
```

**按标签和属性过滤**：

```cypher
// 查找名字为 Alice 的人
MATCH (p:Person {name: 'Alice'})
RETURN p.name, p.age

// 查找年龄大于 25 的人
MATCH (p:Person)
WHERE p.age > 25
RETURN p.name, p.age

// 多条件
MATCH (p:Person)
WHERE p.age > 20 AND p.name STARTS WITH 'A'
RETURN p.name
```

**关系查询**：

```cypher
// Alice 认识的人
MATCH (a:Person {name: 'Alice'})-[:knows]->(friend:Person)
RETURN friend.name

// Alice 认识的人认识的人（2 跳）
MATCH (a:Person {name: 'Alice'})-[:knows]->()-[:knows]->(friend:Person)
RETURN DISTINCT friend.name

// 谁认识 Alice？
MATCH (person:Person)-[:knows]->(a:Person {name: 'Alice'})
RETURN person.name
```

#### 3.5.3.2 可变长度路径

```cypher
// 1 到 3 跳的 knows 关系
MATCH (a:Person {name: 'Alice'})-[:knows*1..3]->(target:Person)
RETURN DISTINCT target.name

// 任意长度（1 跳以上）
MATCH (a:Person {name: 'Alice'})-[:knows*]->(target:Person)
RETURN DISTINCT target.name

// 获取路径信息
MATCH path = (a:Person {name: 'Alice'})-[:knows*1..3]->(target:Person)
RETURN path
LIMIT 5
```

#### 3.5.3.3 多模式匹配

```cypher
// 查找 Alice 认识的人以及他们居住的城市
MATCH (a:Person {name: 'Alice'})-[:knows]->(friend:Person)
MATCH (friend)-[:lives_in]->(city:City)
RETURN friend.name, city.name

// 查找共同好友
MATCH (a:Person {name: 'Alice'})-[:knows]->(common:Person)<-[:knows]-(b:Person {name: 'Bob'})
RETURN common.name

// 查找与 Alice 住在同一城市的人
MATCH (a:Person {name: 'Alice'})-[:lives_in]->(city:City)<-[:lives_in]-(person:Person)
WHERE person.name <> 'Alice'
RETURN person.name
```

#### 3.5.3.4 聚合与分组

```cypher
// 统计每个城市的人数
MATCH (p:Person)-[:lives_in]->(c:City)
RETURN c.name AS city, COUNT(p) AS population
ORDER BY population DESC

// 统计每个人创建的软件数量
MATCH (p:Person)
OPTIONAL MATCH (p)-[:created]->(s:Software)
RETURN p.name, COUNT(s) AS creations
ORDER BY creations DESC

// 平均年龄
MATCH (p:Person)
RETURN AVG(p.age) AS avgAge, MAX(p.age) AS maxAge, MIN(p.age) AS minAge
```

#### 3.5.3.5 CREATE 和 MERGE

```cypher
// 创建节点
CREATE (p:Person {name: 'Frank', age: 32})
RETURN p

// 创建关系
MATCH (a:Person {name: 'Alice'})
MATCH (f:Person {name: 'Frank'})
CREATE (a)-[:knows {since: 2023}]->(f)

// MERGE：查找或创建（避免重复）
MERGE (p:Person {name: 'Grace'})
ON CREATE SET p.age = 28
ON MATCH SET p.lastSeen = timestamp()
RETURN p

// MERGE 创建关系
MATCH (a:Person {name: 'Alice'})
MATCH (g:Person {name: 'Grace'})
MERGE (a)-[:knows]->(g)
```

#### 3.5.3.6 DELETE

```cypher
// 删除节点（必须先删除关联的边）
MATCH (p:Person {name: 'Frank'})
DETACH DELETE p

// 删除特定关系
MATCH (a:Person {name: 'Alice'})-[r:knows]->(g:Person {name: 'Grace'})
DELETE r

// 删除所有数据（危险操作）
MATCH (n)
DETACH DELETE n
```

#### 3.5.3.7 复杂查询示例

**推荐好友（好友的好友，排除直接好友）**：

```cypher
MATCH (a:Person {name: 'Alice'})-[:knows]->(friend:Person)-[:knows]->(fof:Person)
WHERE NOT (a)-[:knows]->(fof)
  AND a <> fof
RETURN DISTINCT fof.name AS recommended, COUNT(friend) AS commonFriends
ORDER BY commonFriends DESC
LIMIT 5
```

**查找最短路径**：

```cypher
MATCH p = shortestPath(
  (a:Person {name: 'Alice'})-[:knows*]-(e:Person {name: 'Eve'})
)
RETURN [node IN nodes(p) | node.name] AS path
```

**查找环**：

```cypher
// 查找长度为 3 的环
MATCH (a:Person)-[:knows]->(b:Person)-[:knows]->(c:Person)-[:knows]->(a)
RETURN a.name, b.name, c.name
```

**子图匹配**：

```cypher
// 查找"认识并住在同一城市"的模式
MATCH (a:Person)-[:knows]->(b:Person)
MATCH (a)-[:lives_in]->(city:City)
MATCH (b)-[:lives_in]->(city)
RETURN a.name, b.name, city.name
```

### 3.5.4 使用场景

- **快速原型开发**：Cypher 语法直观，适合快速验证图模型
- **数据分析与探索**：交互式图数据探索
- **ETL 数据加载**：使用 CREATE/MERGE 进行数据导入
- **Neo4j 迁移**：从 Neo4j 迁移到 Neptune 的应用
- **团队协作**：非技术团队成员也能理解 Cypher 查询
- **教学培训**：图数据库入门教学的首选语言

### 3.5.5 潜在风险与注意事项

1. **Neptune 兼容性**：Neptune 的 openCypher 实现并非 100% 兼容 Neo4j Cypher。不支持的特性包括：`FOREACH`、`REDUCE`、`UNWIND` 的某些用法、`LOAD CSV`、`CALL` 子句、`CREATE INDEX` 等。
2. **性能差异**：Neptune 的 openCypher 执行计划与 Neo4j 不同，在 Neo4j 上优化的查询在 Neptune 上可能表现不同。
3. **可变长度路径限制**：Neptune 对可变长度路径的深度有限制（默认 100），超限会报错。
4. **无 schema 约束**：openCypher 不强制 schema，同一标签的节点可能有不同属性，需在应用层保证数据一致性。
5. **事务模型**：Neptune 的 openCypher 是自动提交的，不支持多语句事务。复杂写入需使用 HTTP 批量请求。
6. **字符串 ID**：与 Gremlin 一样，Neptune 要求 ID 为字符串。openCypher 的 `id()` 函数返回字符串 ID。

### 3.5.6 本章小结

openCypher 以其直观的 ASCII-art 语法成为最容易上手的图查询语言。它采用声明式模式匹配，用 `MATCH-WHERE-RETURN` 的简洁结构表达复杂的图查询。对于从 Neo4j 迁移到 Neptune 的团队，openCypher 提供了最低的迁移成本。但需要注意 Neptune 的 openCypher 实现与标准 Cypher 的差异，以及性能调优方面的特殊性。在快速原型开发、数据探索和团队协作场景中，openCypher 是最佳选择。

---

## 3.6 查询语言选择指南

### 3.6.1 解决的问题

Neptune 支持三种查询语言（Gremlin、SPARQL、openCypher），每种语言有不同的设计哲学、适用场景和性能特征。开发者面临的核心问题是：**在特定业务场景下，应该选择哪种查询语言？** 错误的选择可能导致开发效率低下、查询性能不佳，甚至需要后期大规模重构。

### 3.6.2 核心原理

**三种语言的哲学对比**：

| 维度 | Gremlin | SPARQL | openCypher |
|------|---------|--------|------------|
| **范式** | 命令式 + 声明式 | 纯声明式 | 声明式 |
| **数据模型** | 属性图 | RDF | 属性图 |
| **学习曲线** | 陡峭 | 中等 | 平缓 |
| **表达能力** | 最强 | 强 | 中等 |
| **标准化** | Apache TinkerPop | W3C | openCypher |
| **推理支持** | 无 | RDFS/OWL | 无 |
| **路径查询** | 灵活强大 | Property Path | 有限 |
| **聚合分析** | 中等 | 强 | 中等 |
| **实时 OLTP** | 优秀 | 一般 | 良好 |
| **批量 ETL** | 良好 | 良好 | 良好 |

**选择决策树**：

```
需要语义推理（RDFS/OWL）？
  ├── 是 → SPARQL
  └── 否 → 需要复杂路径遍历（如最短路径、环检测）？
           ├── 是 → Gremlin
           └── 否 → 团队熟悉哪种语言？
                    ├── Java/Groovy 背景 → Gremlin
                    ├── SQL 背景 → openCypher
                    └── 语义 Web 背景 → SPARQL
```

### 3.6.3 代码/配置实现

**同一查询在三种语言中的对比**：

查询：查找 Alice 认识的人认识的人（2 跳），返回名字和年龄。

**Gremlin**：

```gremlin
g.V().has('person', 'name', 'Alice')
 .out('knows').out('knows')
 .dedup()
 .project('name', 'age')
 .by('name')
 .by('age')
```

**SPARQL**：

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name ?age
WHERE {
  ex:Alice foaf:knows/foaf:knows ?person .
  ?person foaf:name ?name .
  ?person foaf:age ?age .
}
```

**openCypher**：

```cypher
MATCH (a:Person {name: 'Alice'})-[:knows*2]->(target:Person)
RETURN DISTINCT target.name AS name, target.age AS age
```

**性能对比**：

| 查询类型 | Gremlin | SPARQL | openCypher |
|----------|---------|--------|------------|
| 单点查询（O(1)） | 1-2ms | 2-5ms | 1-3ms |
| 2 跳遍历 | 3-10ms | 5-20ms | 3-15ms |
| 5 跳遍历 | 10-50ms | 50-200ms | 20-100ms |
| 聚合查询 | 10-30ms | 5-15ms | 10-20ms |
| 推理查询 | N/A | 20-100ms | N/A |

> 注：以上数据为典型值，实际性能取决于数据规模、实例规格和查询复杂度。

**迁移注意事项**：

从 Neo4j 迁移到 Neptune：

```cypher
// Neo4j Cypher（可能不兼容）
MATCH (a:Person)
WHERE a.name =~ 'A.*'
RETURN a.name

// Neptune openCypher（使用 CONTAINS 或 STARTS WITH）
MATCH (a:Person)
WHERE a.name STARTS WITH 'A'
RETURN a.name
```

从 Gremlin 迁移到 SPARQL（或反之）：

```sparql
# SPARQL 中的路径查询
SELECT ?name WHERE {
  ex:Alice foaf:knows+ ?person .
  ?person foaf:name ?name .
}
```

```gremlin
// Gremlin 中的等价查询
g.V().has('person', 'name', 'Alice')
 .repeat(out('knows')).emit().times(5)
 .values('name')
 .dedup()
```

### 3.6.4 使用场景

**推荐 Gremlin 的场景**：
- 实时 OLTP 查询，需要毫秒级响应
- 复杂路径分析（最短路径、环检测、子图匹配）
- 需要细粒度控制遍历过程
- Java 技术栈团队
- 需要与 TinkerPop 生态集成

**推荐 SPARQL 的场景**：
- 需要 RDFS/OWL 语义推理
- 跨组织数据共享和互操作
- 查询开放数据（DBpedia、Wikidata）
- 需要联邦查询多个数据源
- 学术研究和本体工程

**推荐 openCypher 的场景**：
- 快速原型开发和数据探索
- 从 Neo4j 迁移到 Neptune
- 团队以 SQL 背景为主
- 需要直观的查询语法
- 教学和培训场景

### 3.6.5 潜在风险与注意事项

1. **混合使用风险**：Neptune 支持在同一实例中混合使用 Gremlin 和 SPARQL（通过不同 endpoint），但不建议在同一应用中混用。数据模型（属性图 vs RDF）的差异会导致数据不一致。
2. **迁移成本**：从一种语言迁移到另一种需要重写所有查询，且可能涉及数据模型转换（如属性图转 RDF）。
3. **性能基准测试**：不要仅凭语言特性做选择，应基于实际数据量和查询模式做性能基准测试。
4. **团队技能**：选择团队最熟悉的语言，而非理论上最优的语言。开发效率往往比微小的性能差异更重要。
5. **长期维护**：考虑语言的社区活跃度、文档质量和人才市场。Gremlin 和 SPARQL 的社区更成熟，openCypher 的标准化进程仍在进行中。

### 3.6.6 本章小结

选择查询语言没有银弹。Gremlin 适合需要精细控制遍历过程的 OLTP 场景，SPARQL 在语义推理和开放数据领域不可替代，openCypher 则以最低的学习成本提供了良好的图查询能力。建议根据业务需求、团队技能和性能要求综合评估。在不确定的情况下，从 Gremlin 开始是最安全的选择——它提供了最强的表达能力和最好的性能，且 TinkerPop 生态最为成熟。

---

## 3.7 Neptune 特定查询特性

### 3.7.1 解决的问题

Amazon Neptune 作为托管图数据库服务，在标准查询语言之上提供了许多**企业级特性**，帮助开发者优化查询性能、控制资源使用、确保服务稳定性。这些特性解决了生产环境中常见的痛点：查询超时、资源耗尽、结果集过大、以及如何在不修改应用代码的情况下调优查询。

### 3.7.2 核心原理

Neptune 的查询优化机制基于**查询计划（Query Plan）** 和**执行引擎（Execution Engine）** 的深度集成。Neptune 在接收到查询请求后，会经过以下流程：

```
查询请求 → 解析 → 优化 → 执行计划生成 → 执行 → 结果返回
                ↓
          查询提示（Query Hints）影响优化器决策
```

**关键特性概览**：

| 特性 | 说明 | 支持的语言 |
|------|------|-------------|
| 查询提示（Query Hints） | 影响优化器行为 | Gremlin, SPARQL |
| 查询超时（Query Timeout） | 限制查询最大执行时间 | 全部 |
| 结果限制（Result Limit） | 限制返回结果数量 | 全部 |
| 参数化查询（Parameterized Query） | 预编译查询模板 | Gremlin, SPARQL |
| 查询缓存（Query Cache） | 缓存查询计划 | 全部 |
| 查询解释（Query Explain） | 查看执行计划 | Gremlin, SPARQL |

### 3.7.3 代码/配置实现

#### 3.7.3.1 查询提示（Query Hints）

Gremlin 查询提示使用 `withSideEffect` 或 `property()` 方式传递：

```gremlin
// 强制使用索引
g.withSideEffect('Neptune#useIndex', 'true')
 .V().has('person', 'name', 'Alice')

// 指定使用哪个索引
g.withSideEffect('Neptune#indexName', 'byName')
 .V().has('person', 'name', 'Alice')

// 禁用查询缓存
g.withSideEffect('Neptune#queryPlanCache', 'false')
 .V().has('person', 'name', 'Alice')

// 设置查询优先级（HIGH/NORMAL/LOW）
g.withSideEffect('Neptune#priority', 'HIGH')
 .V().has('person', 'name', 'Alice')

// 强制使用特定查询引擎
g.withSideEffect('Neptune#queryEngine', 'traversal')
 .V().has('person', 'name', 'Alice')
```

SPARQL 查询提示使用注释语法：

```sparql
# 强制使用索引
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name
WHERE {
  ?person foaf:name ?name .
}
# Neptune: useIndex=true

# 指定查询优先级
SELECT ?name ?age
WHERE {
  ?person foaf:name ?name .
  ?person foaf:age ?age .
}
# Neptune: priority=HIGH
```

#### 3.7.3.2 查询超时

**Gremlin 超时设置**：

```gremlin
// 设置超时时间为 5 秒
g.withSideEffect('Neptune#timeout', '5000')
 .V().has('person', 'name', 'Alice')
 .repeat(out('knows')).times(10)
 .values('name')

// 在 HTTP 请求头中设置超时
// X-Neptune-Timeout: 5000
```

**SPARQL 超时设置**：

```sparql
# 在查询中设置超时
SELECT ?name
WHERE {
  ?person foaf:name ?name .
}
LIMIT 1000
# Neptune: timeout=5000
```

**openCypher 超时设置**：

```cypher
// 在 HTTP 请求头中设置超时
// X-Neptune-Timeout: 5000

MATCH (a:Person {name: 'Alice'})-[:knows*1..5]->(target)
RETURN target.name
```

**实例级超时配置**：

```bash
# 通过 AWS CLI 设置实例参数
aws neptune modify-db-parameter-group \
    --db-parameter-group-name my-neptune-params \
    --parameters "ParameterName=neptune_query_timeout,ParameterValue=120000,ApplyMethod=pending-reboot"
```

#### 3.7.3.3 结果限制

**Gremlin 结果限制**：

```gremlin
// 限制返回结果数
g.V().hasLabel('person').limit(100).values('name')

// 分页
g.V().hasLabel('person').range(0, 50).values('name')
```

**SPARQL 结果限制**：

```sparql
SELECT ?name ?age
WHERE {
  ?person foaf:name ?name .
  ?person foaf:age ?age .
}
ORDER BY ?age
LIMIT 100
OFFSET 0
```

**openCypher 结果限制**：

```cypher
MATCH (p:Person)
RETURN p.name, p.age
ORDER BY p.age
LIMIT 100
SKIP 0
```

**实例级结果限制**：

```bash
# 设置最大返回结果数
aws neptune modify-db-parameter-group \
    --db-parameter-group-name my-neptune-params \
    --parameters "ParameterName=neptune_max_results,ParameterValue=1000000,ApplyMethod=pending-reboot"
```

#### 3.7.3.4 参数化查询

**Gremlin 参数化查询**：

```gremlin
// 使用绑定参数
g.V().has('person', 'name', name).out('knows').values('name')

// 通过 HTTP API 传递参数
// POST https://your-neptune-endpoint:8182/gremlin
// Body: {
//   "gremlin": "g.V().has('person', 'name', name).out('knows').values('name')",
//   "bindings": {"name": "Alice"}
// }
```

**SPARQL 参数化查询**：

```sparql
# 使用变量绑定
SELECT ?name
WHERE {
  ?person foaf:name ?name .
  ?person foaf:age ?age .
  FILTER(?age > ?minAge)
}
```

```bash
# 通过 SPARQL endpoint 传递参数
curl -X POST https://your-neptune-endpoint:8182/sparql \
  -d "query=SELECT ?name WHERE { ?person foaf:name ?name . ?person foaf:age ?age . FILTER(?age > ?minAge) }" \
  -d "minAge=25"
```

**openCypher 参数化查询**：

```cypher
// 使用参数
MATCH (p:Person {name: $name})
RETURN p.age
```

```bash
# 通过 HTTP API 传递参数
curl -X POST https://your-neptune-endpoint:8182/openCypher \
  -H "Content-Type: application/json" \
  -d '{
    "query": "MATCH (p:Person {name: $name}) RETURN p.age",
    "parameters": {"name": "Alice"}
  }'
```

#### 3.7.3.5 查询解释（Explain）

**Gremlin 查询解释**：

```gremlin
// 查看查询执行计划
g.V().has('person', 'name', 'Alice').out('knows').explain()

// 输出示例：
// Neptune Gremlin Explain
// ========================
// 1. GraphStep(vertex,[]) | cost=1.0
// 2. HasStep([~label.eq(person), name.eq(Alice)]) | cost=0.1
// 3. VertexStep(OUT,[knows],vertex) | cost=0.5
```

**SPARQL 查询解释**：

```sparql
# 查看 SPARQL 查询计划
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name
WHERE {
  ?person foaf:name ?name .
  ?person foaf:age ?age .
  FILTER(?age > 25)
}
# Neptune: explain=true
```

#### 3.7.3.6 查询缓存

```gremlin
// 启用查询计划缓存（默认启用）
g.withSideEffect('Neptune#queryPlanCache', 'true')
 .V().has('person', 'name', 'Alice')

// 清除查询缓存（通过管理 API）
// POST https://your-neptune-endpoint:8182/system?action=clearQueryPlanCache
```

### 3.7.4 使用场景

- **生产环境调优**：使用查询提示优化慢查询
- **资源控制**：设置超时和结果限制防止资源耗尽
- **安全防护**：防止恶意查询导致服务不可用
- **应用集成**：使用参数化查询构建安全的 API
- **性能诊断**：使用 Explain 分析查询瓶颈
- **批量处理**：使用分页和结果限制处理大规模数据

### 3.7.5 潜在风险与注意事项

1. **查询提示的副作用**：不当的查询提示（如强制使用错误索引）可能导致性能更差。建议在测试环境中充分验证。
2. **超时设置**：实例级超时会影响所有查询，建议在查询级别设置更精细的超时。超时值不宜过小（< 100ms），否则正常查询也会被中断。
3. **结果限制**：`LIMIT` 和 `OFFSET` 用于分页时，`OFFSET` 越大性能越差。对于深度分页，建议使用游标（cursor）方式。
4. **参数化查询安全**：参数化查询可防止注入攻击，但需注意参数类型匹配。Gremlin 的绑定参数不支持复杂对象。
5. **缓存失效**：查询计划缓存在数据更新后会自动失效，但大量写入操作可能导致缓存频繁失效，影响查询性能。
6. **Explain 的局限性**：Explain 显示的是优化前的计划，实际执行计划可能因数据分布和运行时条件而不同。

### 3.7.6 本章小结

Neptune 提供了丰富的查询优化和控制特性，包括查询提示、超时控制、结果限制、参数化查询和查询解释等。这些特性让开发者能够在生产环境中精细控制查询行为，平衡性能、稳定性和资源消耗。合理使用这些特性，可以将 Neptune 的查询性能提升 2-10 倍，同时有效防止资源耗尽和查询超时等问题。在生产环境中，建议始终使用参数化查询、设置合理的超时和结果限制，并定期使用 Explain 分析慢查询。

---

## 3.8 综合案例：构建社交关系图谱

### 3.8.1 场景描述

构建一个社交网络的关系图谱，支持以下功能：
1. 查找用户的好友列表
2. 查找好友的好友（二度人脉）
3. 查找两个用户之间的最短路径
4. 推荐可能认识的人
5. 统计用户的影响力（粉丝数、互动数）

### 3.8.2 数据模型

**属性图模型**：

```
(User) -[follows]-> (User)
(User) -[posts]-> (Post)
(Post) -[has_tag]-> (Tag)
(User) -[likes]-> (Post)
(User) -[comments]-> (Post)
```

**RDF 模型**：

```turtle
@prefix ex: <http://social.example/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix sioc: <http://rdfs.org/sioc/ns#> .

ex:Alice a foaf:Person ; foaf:name "Alice" .
ex:Post1 a sioc:Post ; sioc:content "Hello World" .
ex:Alice foaf:knows ex:Bob .
ex:Alice sioc:creator_of ex:Post1 .
```

### 3.8.3 查询实现

**Gremlin 实现**：

```gremlin
// 1. 查找用户的好友
g.V().has('user', 'name', 'Alice').out('follows').values('name')

// 2. 二度人脉
g.V().has('user', 'name', 'Alice')
 .out('follows').out('follows')
 .dedup()
 .where(without('Alice'))
 .values('name')

// 3. 最短路径
g.V().has('user', 'name', 'Alice')
 .repeat(both('follows')).until(has('name', 'David'))
 .path().limit(1)

// 4. 推荐好友
g.V().has('user', 'name', 'Alice')
 .out('follows').aggregate('friends')
 .out('follows')
 .where(without('friends'))
 .where(neq('Alice'))
 .groupCount()
 .order().by(values, desc)
 .limit(5)

// 5. 用户影响力
g.V().has('user', 'name', 'Alice')
 .project('name', 'followers', 'posts', 'likes')
 .by('name')
 .by(in('follows').count())
 .by(out('posts').count())
 .by(out('posts').in('likes').count())
```

**SPARQL 实现**：

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX sioc: <http://rdfs.org/sioc/ns#>

# 1. 查找好友
SELECT ?friendName
WHERE {
  ex:Alice foaf:knows ?friend .
  ?friend foaf:name ?friendName .
}

# 2. 二度人脉
SELECT DISTINCT ?name
WHERE {
  ex:Alice foaf:knows/foaf:knows ?person .
  ?person foaf:name ?name .
  FILTER(?person != ex:Alice)
}

# 4. 推荐好友
SELECT ?name (COUNT(?mutual) AS ?score)
WHERE {
  ex:Alice foaf:knows ?mutual .
  ?mutual foaf:knows ?candidate .
  ?candidate foaf:name ?name .
  FILTER NOT EXISTS { ex:Alice foaf:knows ?candidate }
  FILTER(?candidate != ex:Alice)
}
GROUP BY ?candidate ?name
ORDER BY DESC(?score)
LIMIT 5
```

**openCypher 实现**：

```cypher
// 1. 查找好友
MATCH (a:User {name: 'Alice'})-[:follows]->(friend:User)
RETURN friend.name

// 2. 二度人脉
MATCH (a:User {name: 'Alice'})-[:follows*2]->(target:User)
WHERE NOT (a)-[:follows]->(target)
  AND a <> target
RETURN DISTINCT target.name

// 3. 最短路径
MATCH p = shortestPath(
  (a:User {name: 'Alice'})-[:follows*]-(d:User {name: 'David'})
)
RETURN [n IN nodes(p) | n.name] AS path

// 4. 推荐好友
MATCH (a:User {name: 'Alice'})-[:follows]->(friend:User)-[:follows]->(candidate:User)
WHERE NOT (a)-[:follows]->(candidate)
  AND a <> candidate
RETURN candidate.name, COUNT(friend) AS commonFriends
ORDER BY commonFriends DESC
LIMIT 5
```

---

## 3.9 本章总结

本章全面介绍了 Neptune 的数据模型和查询语言体系：

1. **属性图模型**以节点和边为基本单元，支持标签和属性，是最直观的图数据模型，适合 OLTP 场景。
2. **RDF 模型**以三元组为基本单元，通过 IRI 实现全局唯一标识，支持 RDFS/OWL 语义推理，适合开放数据互操作。
3. **Gremlin** 是功能最强大的图遍历语言，支持命令式和声明式混合编程，适合复杂路径分析和实时查询。
4. **SPARQL** 是 W3C 标准的 RDF 查询语言，采用声明式图模式匹配，适合语义查询和数据联邦。
5. **openCypher** 以直观的 ASCII-art 语法降低了图查询的学习门槛，适合快速原型开发和 Neo4j 迁移。
6. **查询语言选择**应基于业务需求、团队技能和性能要求综合评估，没有银弹。
7. **Neptune 特定特性**（查询提示、超时、结果限制、参数化查询）帮助开发者在生产环境中精细控制查询行为。

在实际项目中，建议从简单的查询语言（如 openCypher）开始快速验证，在需要复杂路径遍历时切换到 Gremlin，在需要语义推理时使用 SPARQL。无论选择哪种语言，合理使用 Neptune 的查询优化特性都是确保生产环境稳定运行的关键。
