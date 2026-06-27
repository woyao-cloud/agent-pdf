# 第3章 图数据模型：从属性图到超图的建模哲学

## 3.1 概述

> **解决的问题**：关系型数据库用外键和 JOIN 表达关联，但在多跳查询、递归关系、动态 schema 场景下力不从心。图数据模型将"关联"提升为**一等公民**，让数据之间的连接与数据本身同等重要。本章深入剖析四种核心图模型——属性图、RDF、超图、标签属性图——并给出工程化的建模决策指南。

> **核心原理**：图数据模型的核心思想是 **"以边为中心"** 。无论哪种具体模型，都围绕三个基本要素展开：
> 1. **节点（Vertex/Node）**——代表实体
> 2. **边（Edge/Relationship）**——代表实体之间的语义连接
> 3. **属性（Property）**——附着在节点或边上的键值对
>
> 不同模型的差异在于：边能否携带属性、节点是否需要标签、schema 是严格还是灵活、以及一条边能连接多少个节点。

---

## 3.2 属性图模型（Property Graph Model）

### 3.2.1 解决的问题

属性图是工业界最广泛采用的图模型，Neo4j、NebulaGraph、Amazon Neptune 等主流图数据库均基于此模型。它解决的核心问题是：

- **业务实体天然带属性**：用户有姓名、年龄，订单有金额、时间——属性图允许在节点和边上直接存储这些信息
- **关系也需要上下文**："张三在2024年购买了商品A"——"购买"这个关系本身有时间、数量等属性
- **多类型实体共存**：一个图中同时存在用户、商品、订单、地址等多种实体，需要区分类型

### 3.2.2 核心原理

属性图模型的形式化定义：

```
G = (V, E, P)
- V: 节点集合，每个节点有唯一标识符
- E: 有向边集合，每条边连接一个源节点和一个目标节点
- P: 属性集合，键值对可附着于节点或边
- 每个节点可有零个或多个标签（Label），用于分类
- 每条边有且仅有一个类型（Type），表示关系的语义
```

**ASCII 示意图：**

```
  ┌─────────────────────────────────────┐
  │         属性图模型示意                │
  │                                     │
  │   [Person:张三]                      │
  │   ├─ name = "张三"                   │
  │   ├─ age = 32                       │
  │   └─ city = "北京"                  │
  │        │                            │
  │        │ [KNOWS]                     │
  │        │ since = 2020               │
  │        │ level = "colleague"        │
  │        ▼                            │
  │   [Person:李四]                      │
  │   ├─ name = "李四"                   │
  │   └─ age = 28                       │
  │        │                            │
  │        │ [PURCHASED]                 │
  │        │ amount = 299.00            │
  │        │ time = "2024-06-15"        │
  │        ▼                            │
  │   [Product:机械键盘]                  │
  │   ├─ name = "机械键盘"               │
  │   ├─ price = 299.00                 │
  │   └─ category = "电子产品"            │
  └─────────────────────────────────────┘
```

### 3.2.3 代码/配置实现

**Cypher 创建属性图：**

```cypher
// 创建带标签的节点和带属性的关系
CREATE (zhangsan:Person {
  name: "张三",
  age: 32,
  city: "北京"
})
CREATE (lisi:Person {
  name: "李四",
  age: 28
})
CREATE (product:Product:Electronics {
  name: "机械键盘",
  price: 299.00,
  category: "电子产品"
})
CREATE (zhangsan)-[:KNOWS {
  since: 2020,
  level: "colleague"
}]->(lisi)
CREATE (lisi)-[:PURCHASED {
  amount: 299.00,
  time: datetime("2024-06-15")
}]->(product)
```

**Cypher 查询示例：**

```cypher
// 查询张三的同事购买过的电子产品
MATCH (z:Person {name: "张三"})-[:KNOWS]->(friend:Person)
MATCH (friend)-[p:PURCHASED]->(prod:Product:Electronics)
RETURN friend.name AS 朋友, prod.name AS 产品, p.amount AS 金额, p.time AS 时间

// 结果：
// ╒══════╤══════════╤══════╤══════════════════╕
// │朋友  │产品      │金额  │时间              │
// ╞══════╪══════════╪══════╪══════════════════╡
// │李四  │机械键盘  │299.00│2024-06-15        │
// └──────┴──────────┴──────┴──────────────────┘
```

**Gremlin 等价实现：**

```groovy
// 创建
g.addV("Person").property("name", "张三").property("age", 32).property("city", "北京").as("z")
 .addV("Person").property("name", "李四").property("age", 28).as("l")
 .addV("Product").property("name", "机械键盘").property("price", 299.00).as("p")
 .addE("KNOWS").from("z").to("l").property("since", 2020).property("level", "colleague")
 .addE("PURCHASED").from("l").to("p").property("amount", 299.00).property("time", "2024-06-15")
 .iterate()

// 查询
g.V().has("Person", "name", "张三")
 .outE("KNOWS").inV().hasLabel("Person")
 .outE("PURCHASED").inV().hasLabel("Product")
 .project("朋友", "产品", "金额", "时间")
   .by(__.select("friend").values("name"))
   .by(__.select("product").values("name"))
   .by(__.select("purchase").values("amount"))
   .by(__.select("purchase").values("time"))
```

### 3.2.4 使用场景

| 场景 | 为什么用属性图 |
|------|---------------|
| 社交网络 | 用户节点有大量属性，好友关系有"认识时间""亲密度"等属性 |
| 金融风控 | 账户、交易、设备都是节点，交易关系需要金额、时间戳属性 |
| 实时推荐 | 用户-商品-标签构成多跳路径，边属性用于权重计算 |
| 知识图谱 | 实体和关系都需要丰富的属性描述 |

### 3.2.5 潜在风险与注意事项

1. **属性膨胀**：一个节点挂载数百个属性会导致存储和查询效率下降。应将高频查询属性和低频属性分离，或考虑将低频属性 JSON 化存储。
2. **边方向混淆**：属性图的边是有向的，但业务关系可能是双向的（如"同事"）。建模时需明确方向语义，或通过双向边模拟。
3. **标签爆炸**：标签用于分类，但过多标签（>100）会导致索引膨胀。建议用层级标签（如 `Product:Electronics:Keyboard`）而非扁平标签。

### 3.2.6 本章小结

属性图模型是图数据库的"通用语言"。它将实体、关系、属性三者统一在一个灵活的结构中，适合 90% 以上的业务场景。核心建模原则是：**节点放实体，边放关系，属性放描述**。选择属性图时，重点关注边属性的设计——这是它区别于 RDF 的最大优势。

---

## 3.3 RDF 模型（Resource Description Framework）

### 3.3.1 解决的问题

RDF 是 W3C 制定的语义网标准，解决的是**数据互操作性和语义推理**问题：

- **跨组织数据共享**：不同公司的数据使用统一 URI 标识，可以无缝融合
- **逻辑推理**：通过 OWL 本体，机器可以自动推导出隐式知识
- **标准化查询**：SPARQL 是 W3C 标准，不同厂商的 RDF 数据库查询语法一致

### 3.3.2 核心原理

RDF 的核心是**三元组（Triple）**：

```
(主体, 谓词, 客体)   →   (Subject, Predicate, Object)
```

每个三元组表达一个原子事实。主体和客体是资源（用 URI 标识），谓词描述它们之间的关系。

**ASCII 示意图：**

```
  ┌──────────────────────────────────────────┐
  │            RDF 三元组模型                  │
  │                                          │
  │  ex:张三  ── ex:hasName ──→ "张三"        │
  │  ex:张三  ── ex:hasAge  ──→ "32"^^xsd:int│
  │  ex:张三  ── ex:knows  ──→ ex:李四       │
  │  ex:李四  ── ex:purchased ──→ ex:键盘     │
  │  ex:键盘  ── rdf:type ──→ ex:Product     │
  │  ex:键盘  ── ex:price ──→ "299.00"^^xsd:decimal
  │                                          │
  │  每个三元组是独立的原子事实                 │
  │  整个图是三元组的集合                       │
  └──────────────────────────────────────────┘
```

**RDF 与属性图的关键差异：**

| 维度 | 属性图 | RDF |
|------|--------|-----|
| 标识方式 | 内部 ID | 全局 URI |
| 边属性 | 支持 | 不支持（需用 Reification 或 RDF*） |
| Schema | 可选标签 | RDFS/OWL 本体 |
| 查询语言 | Cypher/Gremlin（厂商绑定） | SPARQL（W3C 标准） |
| 推理能力 | 无原生支持 | OWL 推理机 |
| 序列化 | 内部二进制 | Turtle/JSON-LD/RDF-XML |

### 3.3.3 代码/配置实现

**Turtle 格式的 RDF 数据：**

```turtle
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

ex:张三  ex:hasName  "张三" ;
         ex:hasAge   "32"^^xsd:int ;
         ex:knows    ex:李四 .

ex:李四  ex:hasName  "李四" ;
         ex:hasAge   "28"^^xsd:int ;
         ex:purchased  ex:键盘 .

ex:键盘  rdf:type    ex:Product ;
         ex:productName  "机械键盘" ;
         ex:price    "299.00"^^xsd:decimal .
```

**SPARQL 查询：**

```sparql
PREFIX ex: <http://example.org/>

# 查询张三认识的人购买的产品
SELECT ?friendName ?productName ?price WHERE {
  ex:张三 ex:knows ?friend .
  ?friend ex:hasName ?friendName .
  ?friend ex:purchased ?product .
  ?product ex:productName ?productName .
  ?product ex:price ?price .
}

# 结果：
# ┌──────────┬──────────┬────────┐
# │friendName│productName│price   │
# ├──────────┼──────────┼────────┤
# │"李四"    │"机械键盘" │"299.00"│
# └──────────┴──────────┴────────┘
```

**OWL 本体示例（用于推理）：**

```turtle
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex: <http://example.org/> .

ex:Person  rdf:type  owl:Class .
ex:Product rdf:type  owl:Class .

ex:hasColleague  rdf:type  owl:ObjectProperty ;
                 rdfs:domain ex:Person ;
                 rdfs:range  ex:Person .

# 推理规则：如果 A knows B 且 B knows C，则 A 可能认识 C
ex:knows  rdf:type       owl:ObjectProperty ;
          rdfs:domain    ex:Person ;
          rdfs:range     ex:Person .

# 定义 knows 的传递性
ex:knows  rdf:type  owl:TransitiveProperty .
```

有了上述本体，SPARQL 引擎可以自动推导出 `ex:张三 ex:knows ex:王五`（如果存在 `ex:张三 ex:knows ex:李四` 和 `ex:李四 ex:knows ex:王五`）。

**RDF\*（RDF-star）——解决边属性问题：**

```turtle
# RDF* 允许将三元组作为主体或客体
<<ex:李四 ex:purchased ex:键盘>>  ex:amount  "299.00"^^xsd:decimal ;
                                 ex:time    "2024-06-15"^^xsd:date .
```

### 3.3.4 使用场景

| 场景 | 为什么用 RDF |
|------|-------------|
| 开放知识图谱 | Wikidata、DBpedia 等需要全局唯一标识和跨域链接 |
| 数据联邦 | 多个组织的数据需要统一查询（如医疗数据共享） |
| 语义推理 | 需要自动推导新知识（如基因-疾病关联发现） |
| 数据溯源 | 需要记录数据来源和 provenance 信息 |

### 3.3.5 潜在风险与注意事项

1. **性能瓶颈**：RDF 的 SPARQL 查询性能通常比 Cypher 慢 2-10 倍，尤其是在多跳路径查询上。原因在于 RDF 的存储是三元组表，路径查询需要大量自 JOIN。
2. **边属性复杂**：标准 RDF 不支持边属性，需要用 Reification（将关系本身建模为节点）或 RDF* 扩展，这增加了查询复杂度。
3. **URI 管理成本**：每个资源需要全局唯一的 URI，在内部系统中这是不必要的开销。
4. **学习曲线陡峭**：SPARQL 的语法比 Cypher 复杂，OWL 本体设计需要专业知识。

### 3.3.6 本章小结

RDF 模型适合**开放、跨组织、需要推理**的场景。它的优势是标准化和互操作性，代价是性能和易用性。工程决策的关键是：**你的数据是否需要与外部世界融合？是否需要机器自动推理？** 如果答案都是"否"，属性图通常是更好的选择。

---

## 3.4 超图模型（Hypergraph Model）

### 3.4.1 解决的问题

传统图模型中，一条边只能连接两个节点。但在现实世界中，许多关系天然涉及**多个实体**：

- 一次电商订单包含多个商品、一个收货地址、一个支付记录
- 一篇学术论文有多个作者、多个关键词、一个会议
- 一次银行转账涉及多个账户（拆分转账）

超图（Hypergraph）用**超边（Hyperedge）** 解决这个问题——一条边可以连接任意数量的节点。

### 3.4.2 核心原理

超图的形式化定义：

```
H = (V, E)
- V: 节点集合
- E: 超边集合，每条超边 e ∈ E 是 V 的一个非空子集
- 超边可以有自己的属性
```

**ASCII 示意图：**

```
  ┌──────────────────────────────────────────┐
  │             超图模型示意                   │
  │                                          │
  │   [用户:张三] ──┐                        │
  │                 │                        │
  │   [商品:键盘] ──┤                        │
  │                 ├── [超边:订单#2024001]   │
  │   [商品:鼠标] ──┤    ├─ time = "2024-06" │
  │                 │    └─ total = 598.00   │
  │   [地址:北京] ──┘                        │
  │                                          │
  │   ┌──────────────────────┐               │
  │   │ 超边连接 4 个节点     │               │
  │   │ 表达"一次订单"语义    │               │
  │   └──────────────────────┘               │
  │                                          │
  │   [论文:GraphDB] ──┐                     │
  │   [作者:Alice] ────┤                     │
  │   [作者:Bob] ──────┼── [超边:发表关系]    │
  │   [会议:VLDB] ────┤                     │
  │   [关键词:NoSQL] ─┘                     │
  └──────────────────────────────────────────┘
```

### 3.4.3 代码/配置实现

**使用 HyperGraphDB 的 Java API：**

```java
// 创建超图
HyperGraph graph = new HyperGraph("/data/hypergraph");

// 创建节点
HGHandle zhangsan = graph.addAtom(new Atom("Person", "张三"));
HGHandle keyboard = graph.addAtom(new Atom("Product", "机械键盘"));
HGHandle mouse = graph.addAtom(new Atom("Product", "鼠标"));
HGHandle address = graph.addAtom(new Atom("Address", "北京市朝阳区"));

// 创建超边——连接所有订单相关节点
Map<String, Object> orderProps = new HashMap<>();
orderProps.put("orderId", "2024001");
orderProps.put("time", "2024-06-15");
orderProps.put("total", 598.00);

HGHandle orderEdge = graph.addAtom(new HyperEdge(
    zhangsan, keyboard, mouse, address
), orderProps);
```

**在属性图数据库中模拟超图（Neo4j 实现）：**

```cypher
// 用中间节点模拟超边
CREATE (order:Order {
  orderId: "2024001",
  time: datetime("2024-06-15"),
  total: 598.00
})

// 将超边连接的所有节点关联到中间节点
MATCH (order:Order {orderId: "2024001"})
MATCH (user:Person {name: "张三"})
MATCH (kb:Product {name: "机械键盘"})
MATCH (ms:Product {name: "鼠标"})
MATCH (addr:Address {city: "北京"})

CREATE (user)-[:PLACED]->(order)
CREATE (order)-[:INCLUDES]->(kb)
CREATE (order)-[:INCLUDES]->(ms)
CREATE (order)-[:SHIPS_TO]->(addr)

// 查询：找出张三订单中的所有商品
MATCH (z:Person {name: "张三"})-[:PLACED]->(o:Order)-[:INCLUDES]->(p:Product)
RETURN o.orderId AS 订单号, collect(p.name) AS 商品列表, o.total AS 总金额

// 结果：
// ╒═══════╤══════════════════╤══════╕
// │订单号 │商品列表          │总金额│
// ╞═══════╪══════════════════╪══════╡
// │2024001│["机械键盘","鼠标"]│598.00│
// └───────┴──────────────────┴──────┘
```

### 3.4.4 使用场景

| 场景 | 为什么用超图 |
|------|-------------|
| 电商订单 | 一个订单天然连接用户、多个商品、地址、支付记录 |
| 学术图谱 | 一篇论文连接多个作者、关键词、引用、会议 |
| 生物信息 | 一个基因参与多个通路，一个药物作用于多个靶点 |
| 供应链 | 一个物流批次包含多个货物、经过多个节点 |

### 3.4.5 潜在风险与注意事项

1. **工具生态薄弱**：原生超图数据库（如 HyperGraphDB、PyHypergraph）的成熟度远低于属性图数据库，社区小、工具少。
2. **查询语言不统一**：超图没有类似 Cypher/SPARQL 的标准查询语言，每个实现都有自己的 API。
3. **模拟成本**：在属性图中用中间节点模拟超边，会增加一跳查询深度，影响性能。
4. **建模过度**：并非所有多对多关系都需要超图。简单的多对多关系用普通边加中间节点即可。

### 3.4.6 本章小结

超图模型在理论上优雅地解决了"多元关系"问题，但工程实践中**不建议直接使用原生超图数据库**。更务实的做法是：在属性图数据库中用"中间节点"模式模拟超边。只有当你的核心业务逻辑确实需要 n 元关系（n > 2）作为一等公民时，才考虑超图。

---

## 3.5 标签属性图（Labeled Property Graph, LPG）

### 3.5.1 解决的问题

LPG 是属性图的工业实现标准，解决了属性图在工程落地中的具体问题：

- **节点分类**：通过标签（Label）快速过滤实体类型
- **索引优化**：基于标签的索引可以加速查询
- **存储效率**：二进制存储比 RDF 的三元组表更紧凑

### 3.5.2 核心原理

LPG 在属性图基础上增加了两个关键约束：

1. **每个节点可以有多个标签**（如 `:Person:Employee:Manager`）
2. **每条边有且仅有一个类型**（如 `:KNOWS`、`:PURCHASED`）

**Neo4j 存储架构示意：**

```
┌────────────────────────────────────────────┐
│          Neo4j LPG 存储模型                │
│                                            │
│  Node Store (固定大小记录, 15字节/节点)     │
│  ┌─────────┬──────────┬──────────┐        │
│  │ Node ID │ Label ID │ Prop IDs │        │
│  ├─────────┼──────────┼──────────┤        │
│  │ 0x001   │ 0x03     │ 0x07,.. │        │
│  └─────────┴──────────┴──────────┘        │
│                                            │
│  Relationship Store (固定大小, 34字节/边)   │
│  ┌──────┬──────┬──────┬──────┬──────┐     │
│  │ RelID│SrcID│TgtID│TypeID│PropID│     │
│  ├──────┼──────┼──────┼──────┼──────┤     │
│  │0x002 │0x001 │0x002 │0x01  │0x09  │     │
│  └──────┴──────┴──────┴──────┴──────┘     │
│                                            │
│  Property Store (动态大小, 链式存储)        │
│  ┌──────────┬────────┬──────────┐         │
│  │ Prop ID  │ Key    │ Value    │         │
│  ├──────────┼────────┼──────────┤         │
│  │ 0x07     │ "name" │ "张三"   │         │
│  │ 0x08     │ "age"  │ 32       │         │
│  └──────────┴────────┴──────────┘         │
└────────────────────────────────────────────┘
```

**NebulaGraph 的 LPG 实现差异：**

NebulaGraph 将 LPG 模型做了"存算分离"的改造：

- **点（Vertex）**：由 Tag（类似 Label）和属性组成，一个点可以有多个 Tag
- **边（Edge）**：由 Edge Type 和属性组成，边是**有向**的
- **图空间（Graph Space）**：逻辑隔离的数据分区

```ngql
// NebulaGraph nGQL
CREATE TAG person(name string, age int, city string);
CREATE TAG product(name string, price double, category string);
CREATE EDGE knows(since int, level string);
CREATE EDGE purchased(amount double, time timestamp);

INSERT VERTEX person(name, age, city) VALUES "101":("张三", 32, "北京");
INSERT VERTEX person(name, age) VALUES "102":("李四", 28);
INSERT VERTEX product(name, price, category) VALUES "201":("机械键盘", 299.00, "电子产品");

INSERT EDGE knows(since, level) VALUES "101"->"102":(2020, "colleague");
INSERT EDGE purchased(amount, time) VALUES "102"->"201":(299.00, 1647360000);

-- 查询
GO FROM "101" OVER knows YIELD dst(edge) AS friend_id
| GO FROM $-.friend_id OVER purchased YIELD dst(edge) AS product_id,
  $^.person.name AS person, edge.amount AS amount;
```

### 3.5.3 使用场景

| 数据库 | 特点 | 适用场景 |
|--------|------|---------|
| Neo4j | 最成熟的 LPG 实现，ACID 事务，Cypher 查询 | 企业级 OLTP 图应用 |
| NebulaGraph | 分布式架构，存算分离，水平扩展 | 超大规模图（千亿节点） |
| Amazon Neptune | 托管服务，同时支持 LPG 和 RDF | AWS 生态内的图应用 |
| JanusGraph | 开源分布式，HBase/Cassandra 后端 | 需要开源分布式方案 |

### 3.5.4 潜在风险与注意事项

1. **标签设计**：标签是 LPG 的核心索引单位。标签粒度过粗（只有一个 `:Node`）会导致全表扫描；粒度过细（每个实体一个标签）会导致索引膨胀。
2. **存储引擎差异**：不同 LPG 数据库的存储引擎差异巨大。Neo4j 是原生图存储（无 JOIN），JanusGraph 基于 BigTable 模型（有 JOIN 成本），迁移时需重新评估性能。
3. **事务边界**：Neo4j 支持完整 ACID，但分布式 LPG（如 NebulaGraph）通常只提供最终一致性或弱事务。

### 3.5.5 本章小结

LPG 是属性图模型的工业标准实现。选择 LPG 数据库时，核心决策维度是：**数据规模**（单机 vs 分布式）、**事务需求**（ACID vs 最终一致性）、**查询复杂度**（OLTP vs OLAP）。Neo4j 适合中小规模 OLTP，NebulaGraph 适合大规模分布式场景。

---

## 3.6 数据模型选择指南

### 3.6.1 解决的问题

面对一个具体的业务问题，工程师需要回答：**该用图数据库吗？用哪种图模型？**

### 3.6.2 核心原理

选择决策树：

```
业务问题需要图数据库吗？
├── 核心操作是多跳关联查询？ → 是 → 进入图模型选择
│                             否 → 考虑关系型或文档数据库
│
├── 图模型选择
│   ├── 需要语义推理/跨组织数据共享？ → RDF + SPARQL
│   ├── 关系需要携带属性？ → 属性图 / LPG
│   ├── 核心是 n 元关系（n>2）？ → 超图（或用中间节点模拟）
│   └── 需要全文搜索+图遍历？ → 考虑 Elasticsearch + 图数据库混合
│
├── 属性图/LPG 内部选择
│   ├── 数据量 < 100亿节点，单机可承载？ → Neo4j
│   ├── 数据量 > 100亿，需要水平扩展？ → NebulaGraph / JanusGraph
│   └── 需要 AWS 托管服务？ → Amazon Neptune
│
└── 混合架构
    ├── 图用于关联查询，关系型用于事务 → 图+关系型双写
    └── 图用于推荐，搜索引擎用于检索 → 图+ES 互补
```

### 3.6.3 对比表格

| 维度 | 属性图/LPG | RDF | 超图 |
|------|-----------|-----|------|
| 学习成本 | 低 | 高 | 高 |
| 查询性能 | 高 | 中 | 低 |
| 标准化程度 | 低（厂商绑定） | 高（W3C） | 无标准 |
| 推理能力 | 无 | 强（OWL） | 无 |
| 边属性 | 原生支持 | 需扩展 | 支持 |
| 工具生态 | 丰富 | 中等 | 贫乏 |
| 适合场景 | OLTP 图应用 | 知识图谱/数据联邦 | 学术/生物信息 |

### 3.6.4 使用场景

**选型案例：**

1. **社交网络好友推荐** → 属性图（Neo4j）。关系需要"亲密度""共同群组"等属性，查询模式是 2-3 跳路径遍历。
2. **企业级知识图谱** → RDF（Stardog/GraphDB）。需要 OWL 推理推导隐式知识，需要与外部知识库（Wikidata）链接。
3. **电商订单系统** → 属性图（中间节点模拟超边）。订单-商品-用户-地址的多元关系用 Order 中间节点建模。
4. **生物通路分析** → 超图（PyHypergraph）或属性图模拟。基因-蛋白-药物-通路的复杂 n 元关系。

### 3.6.5 潜在风险与注意事项

1. **不要为了用图而用图**：如果查询模式固定、深度不超过 2 跳，关系型数据库 + 索引可能更快。
2. **混合架构的复杂度**：图+关系型双写带来一致性问题，通常需要最终一致性方案或分布式事务。
3. **迁移成本**：从关系型迁移到图数据库不是简单的 schema 映射，需要重新设计查询模式。

### 3.6.6 本章小结

选型的核心原则是：**匹配查询模式**。你的业务查询是"多跳路径遍历"还是"固定模式匹配"？前者选图，后者选关系型。在图模型内部，**属性图是默认选择**，RDF 是"需要标准化和推理"时的选择，超图是"n 元关系"时的选择。

---

## 3.7 Schema 设计模式

### 3.7.1 解决的问题

图数据库的 schema 设计没有关系型数据库的范式理论指导，工程师容易陷入"怎么都行"的困境。本节总结经过工业验证的建模模式。

### 3.7.2 核心原理

图建模的黄金法则：**查询驱动设计（Query-Driven Design）**。

```
1. 列出所有业务查询
2. 分析查询的遍历路径
3. 将路径中的"跳"映射为边
4. 将路径中的"停留点"映射为节点
5. 将过滤条件映射为节点/边的属性
```

### 3.7.3 模式一：实体建模

**问题**：如何将关系型数据库的实体映射到图？

**反模式**：直接将关系型表的每一行作为一个节点，外键作为边。

**正确做法**：

```cypher
// 关系型：users 表 + orders 表 + order_items 表
// 图建模：将业务"实体"作为节点，"事件"也作为节点

// 用户是实体节点
CREATE (u:User:Person {
  userId: "U1001",
  name: "张三",
  registeredAt: datetime("2024-01-01")
})

// 订单是事件节点（不是边！）
CREATE (o:Order {
  orderId: "ORD2024001",
  totalAmount: 598.00,
  status: "completed",
  createdAt: datetime("2024-06-15")
})

// 用户和订单之间用边连接
CREATE (u)-[:PLACED]->(o)

// 商品是实体节点
CREATE (p1:Product {productId: "P2001", name: "机械键盘", price: 299.00})
CREATE (p2:Product {productId: "P2002", name: "鼠标", price: 299.00})

// 订单和商品之间用边连接（带数量属性）
CREATE (o)-[:INCLUDES {quantity: 1, unitPrice: 299.00}]->(p1)
CREATE (o)-[:INCLUDES {quantity: 1, unitPrice: 299.00}]->(p2)
```

**关键原则**：事件（Event）建模为节点而非边。虽然"下单"听起来像关系，但订单有独立的生命周期和属性，作为节点更灵活。

### 3.7.4 模式二：关系建模

**问题**：如何决定一个业务关系应该建模为边还是节点？

**决策规则**：

```
关系需要属性吗？
├── 否 → 建模为边
└── 是 → 关系本身有独立生命周期吗？
        ├── 是 → 建模为节点（关系节点模式）
        └── 否 → 建模为边（带属性）
```

**关系节点模式示例（"转账"关系需要追踪状态）：**

```cypher
// 转账作为关系节点
CREATE (a:Account {accountId: "A1001", balance: 10000})
CREATE (b:Account {accountId: "A1002", balance: 5000})
CREATE (t:Transfer {
  transferId: "TXN001",
  amount: 2000,
  status: "pending",    // pending → completed → failed
  createdAt: datetime("2024-06-15"),
  completedAt: null
})
CREATE (a)-[:SENT]->(t)
CREATE (t)-[:RECEIVED_BY]->(b)

// 查询：找出所有"处理中"的转账
MATCH (a:Account)-[:SENT]->(t:Transfer {status: "pending"})-[:RECEIVED_BY]->(b:Account)
RETURN a.accountId AS 发送方, b.accountId AS 接收方, t.amount AS 金额, t.createdAt AS 时间
```

### 3.7.5 模式三：时间建模

**问题**：图数据库如何处理时间维度？关系会随时间变化。

**三种时间建模策略：**

**策略 A：时间戳属性（简单场景）**

```cypher
CREATE (a)-[:KNOWS {since: 2020, until: null}]->(b)
```

**策略 B：时间线边（需要历史追溯）**

```cypher
// 每个时间段一条边
CREATE (a)-[:KNOWS {validFrom: datetime("2020-01-01"), validTo: datetime("2022-12-31")}]->(b)
CREATE (a)-[:KNOWS {validFrom: datetime("2023-01-01"), validTo: null}]->(b)

// 查询：2021年的关系
MATCH (a {name: "张三"})-[r:KNOWS]->(b)
WHERE r.validFrom <= datetime("2021-06-01")
  AND (r.validTo IS NULL OR r.validTo >= datetime("2021-06-01"))
RETURN b.name
```

**策略 C：事件溯源（审计场景）**

```cypher
// 不修改关系，只追加事件
CREATE (e:RelationshipEvent {
  type: "KNOWS",
  from: "张三",
  to: "李四",
  action: "CREATE",
  timestamp: datetime("2020-01-01")
})
CREATE (e2:RelationshipEvent {
  type: "KNOWS",
  from: "张三",
  to: "李四",
  action: "UPDATE",
  newLevel: "close_friend",
  timestamp: datetime("2023-06-01")
})
```

### 3.7.6 模式四：层级数据建模

**问题**：组织架构、分类树、评论回复等层级数据如何建模？

**邻接表模式（最常用）：**

```cypher
// 组织架构树
CREATE (ceo:Employee:Manager {name: "CEO", title: "首席执行官"})
CREATE (cto:Employee:Manager {name: "CTO", title: "首席技术官"})
CREATE (cfo:Employee:Manager {name: "CFO", title: "首席财务官"})
CREATE (eng1:Employee {name: "张三", title: "高级工程师"})
CREATE (eng2:Employee {name: "李四", title: "工程师"})

CREATE (ceo)-[:MANAGES]->(cto)
CREATE (ceo)-[:MANAGES]->(cfo)
CREATE (cto)-[:MANAGES]->(eng1)
CREATE (cto)-[:MANAGES]->(eng2)

// 查询：CTO 下属的所有员工（递归）
MATCH (cto:Employee {name: "CTO"})-[:MANAGES*1..]->(sub)
RETURN sub.name, sub.title

// 结果：
// ╒══════╤══════════════╕
// │sub.name│sub.title   │
// ╞══════╪══════════════╡
// │张三  │高级工程师    │
// │李四  │工程师        │
// └──────┴──────────────┘
```

**物化路径模式（适用于频繁读取子树）：**

```cypher
// 每个节点存储从根到自身的路径
CREATE (c:Category {
  name: "电子产品",
  path: "/root/电子产品",
  depth: 1
})
CREATE (sub:Category {
  name: "电脑外设",
  path: "/root/电子产品/电脑外设",
  depth: 2
})
CREATE (sub)-[:BELONGS_TO]->(c)

// 查询所有"电子产品"下的子分类
MATCH (c:Category {name: "电子产品"})
MATCH (sub:Category)
WHERE sub.path STARTS WITH c.path
RETURN sub.name, sub.depth ORDER BY sub.depth
```

### 3.7.7 潜在风险与注意事项

1. **过度建模**：不要把所有关系都变成节点。只有需要独立生命周期或状态的关系才值得这样做。
2. **深度递归性能**：Cypher 的变长路径查询（`[:MANAGES*1..]`）在深度 > 10 时性能下降明显，考虑物化路径或嵌套集。
3. **时间查询复杂度**：时间线边模式在查询时需要比较时间范围，索引设计不当会导致全表扫描。

### 3.7.8 本章小结

图建模的核心是**查询驱动**：先列出所有查询，再设计节点和边。四个模式覆盖了 80% 的场景：实体建模（事件即节点）、关系建模（有状态的关系即节点）、时间建模（追加而非修改）、层级建模（邻接表 + 物化路径）。记住：**图建模不是 ER 图的翻译，而是查询路径的优化**。

---

## 3.8 常见建模反模式

### 3.8.1 解决的问题

即使理解了图模型的理论，工程师在实践中仍会犯一些典型错误。本节列出最常见的反模式及其修正方案。

### 3.8.2 反模式一：过度使用属性而非关系

**症状**：

```cypher
// ❌ 反模式：将关联实体作为属性存储
CREATE (:User {
  name: "张三",
  friends: "李四,王五,赵六",  // 逗号分隔的字符串！
  recentOrders: "ORD001,ORD002"  // 丢失了关系语义
})
```

**问题**：无法查询"张三的朋友的朋友"，无法对关系附加属性，无法索引。

**修正**：

```cypher
// ✅ 正确做法：用边表达关系
CREATE (z:User {name: "张三"})
CREATE (l:User {name: "李四"})
CREATE (z)-[:KNOWS {since: 2020}]->(l)
```

**判断标准**：如果两个实体之间需要"多跳查询"或"关系属性"，就必须用边。

### 3.8.3 反模式二：过度使用关系而非属性

**症状**：

```cypher
// ❌ 反模式：把简单属性也变成关系
CREATE (z:User {name: "张三"})
CREATE (ageNode:Attribute {key: "age", value: 32})
CREATE (z)-[:HAS_ATTRIBUTE]->(ageNode)
```

**问题**：每个属性查询都需要一跳，查询复杂度从 O(1) 变成 O(n)，存储膨胀。

**修正**：

```cypher
// ✅ 正确做法：属性直接放在节点上
CREATE (z:User {name: "张三", age: 32})
```

**判断标准**：属性是否需要独立查询？"找出所有年龄为 32 的用户"可以用索引解决，不需要把年龄变成节点。

### 3.8.4 反模式三：深度嵌套

**症状**：

```cypher
// ❌ 反模式：超深度的树形结构
// 评论的评论的评论的评论...
MATCH (c:Comment)-[:REPLIES_TO*1..100]->(parent)
```

**问题**：深度 > 10 的变长路径查询性能急剧下降，内存消耗巨大。

**修正**：

```cypher
// ✅ 方案 A：限制查询深度
MATCH (c:Comment)-[:REPLIES_TO*1..5]->(parent)

// ✅ 方案 B：物化路径（适用于频繁读取）
CREATE (c:Comment {
  id: "C001",
  text: "好文章！",
  path: "/post/123/C001",  // 从根到自身的路径
  depth: 1
})

// ✅ 方案 C：嵌套集（适用于频繁子树查询）
// 每个节点存储 left 和 right 值
CREATE (c:Comment {
  id: "C001",
  text: "好文章！",
  lft: 2,
  rgt: 5
})
```

### 3.8.5 反模式四：扇出问题（Fan-out）

**症状**：

```cypher
// ❌ 反模式：超级节点
// 一个"热门商品"被数百万用户购买
CREATE (hotProduct:Product {name: "iPhone 20"})
// 数百万条 PURCHASED 边指向这个节点
```

**问题**：超级节点（Supernode）——一个节点有数百万条边。查询这个节点时，数据库需要遍历所有边，导致查询超时。

**修正**：

```cypher
// ✅ 方案 A：分桶——按时间分组
CREATE (hotProduct:Product {name: "iPhone 20"})
CREATE (batch:PurchaseBatch {
  date: "2024-06",
  count: 50000
})
CREATE (hotProduct)-[:HAS_BATCH]->(batch)

// 查询某个月的购买量
MATCH (p:Product {name: "iPhone 20"})-[:HAS_BATCH]->(b:PurchaseBatch {date: "2024-06"})
RETURN b.count

// ✅ 方案 B：引入中间维度
// 用户 → 城市 → 商品（按地域聚合）
CREATE (u:User {name: "张三"})
CREATE (city:City {name: "北京"})
CREATE (p:Product {name: "iPhone 20"})
CREATE (u)-[:LIVES_IN]->(city)
CREATE (city)-[:HAS_PURCHASES {count: 50000}]->(p)

// ✅ 方案 C：外部存储
// 将高频边存储在外部（如 Redis 计数器），图数据库只存低频边
```

### 3.8.6 反模式五：忽略索引

**症状**：

```cypher
// ❌ 反模式：无索引的全局扫描
MATCH (u:User)
WHERE u.name CONTAINS "张"  // 全表扫描！
```

**修正**：

```cypher
// ✅ 创建索引
CREATE INDEX user_name_index FOR (u:User) ON (u.name)
CREATE TEXT INDEX user_name_text_index FOR (u:User) ON (u.name)

// 然后查询
MATCH (u:User)
WHERE u.name CONTAINS "张"  // 使用文本索引
RETURN u
```

**判断标准**：任何用于过滤的属性都应该有索引。图数据库的索引策略包括：
- **标签索引**：按标签过滤
- **属性索引**：按属性值精确匹配
- **全文索引**：文本搜索
- **复合索引**：多条件组合查询

### 3.8.7 反模式六：忽略边的方向

**症状**：

```cypher
// ❌ 反模式：方向混乱
CREATE (a:Person {name: "A"})-[:FRIEND_OF]->(b:Person {name: "B"})
// 查询时忘记方向
MATCH (a:Person {name: "A"})-[:FRIEND_OF]-(b:Person)  // 无方向
```

**问题**：无方向查询在底层会尝试两个方向，性能减半。更重要的是，语义不清晰——"A 是 B 的朋友"和"B 是 A 的朋友"可能不同。

**修正**：

```cypher
// ✅ 明确方向语义
// 使用双向边或明确约定方向
CREATE (a)-[:FRIEND_OF]->(b)
CREATE (b)-[:FRIEND_OF]->(a)  // 双向好友

// 查询时明确方向
MATCH (a:Person {name: "A"})-[:FRIEND_OF]->(friends)
RETURN friends
```

### 3.8.8 本章小结

六个反模式可以归纳为三个原则：

1. **边 vs 属性**：需要多跳查询或关系属性 → 用边；否则 → 用属性
2. **深度控制**：树深度 > 5 时考虑物化路径或嵌套集
3. **热点管理**：超级节点用分桶、中间维度或外部存储解决

反模式的本质是**用关系型思维建模图数据**。图建模需要从"表 JOIN"思维切换到"路径遍历"思维。

---

## 3.9 本章总结

图数据模型的选择和设计是图数据库落地的核心环节。本章的核心结论：

1. **属性图（LPG）是默认选择**，适合 90% 的业务场景。它平衡了表达能力、查询性能和易用性。
2. **RDF 是标准化选择**，适合需要跨组织数据共享和语义推理的场景。代价是性能和复杂度。
3. **超图是理论选择**，适合 n 元关系场景。工程实践中建议用属性图 + 中间节点模拟。
4. **查询驱动设计**是图建模的第一原则。先列查询，再建模。
5. **反模式的核心是"关系型思维"**。避免用属性替代关系、避免超级节点、避免深度递归。

**最终建议**：从属性图开始，用 Cypher 快速验证查询模式。只有在明确需要 RDF 的标准化或推理能力时，才考虑迁移。图建模是一个迭代过程——先建模，写查询，发现问题，重构模型。

---

## 参考资源

- Neo4j Graph Data Modeling Guidelines: https://neo4j.com/developer/graph-data-modeling/
- W3C RDF 1.1 Primer: https://www.w3.org/TR/rdf11-primer/
- SPARQL 1.1 Query Language: https://www.w3.org/TR/sparql11-query/
- OWL 2 Web Ontology Language Primer: https://www.w3.org/TR/owl2-primer/
- HyperGraphDB Documentation: http://hypergraphdb.org/
- NebulaGraph Data Modeling: https://docs.nebula-graph.io/
- "Graph Databases" by Ian Robinson, Jim Webber, Emil Eifrem (O'Reilly)
