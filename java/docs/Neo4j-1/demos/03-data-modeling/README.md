# 第3章：数据建模

> "把 Neo4j 当关系数据库用"是新手最常见的错误。图数据库的建模思路和关系型数据库完全不同——你需要从"关系"的角度思考，而不是从"表"的角度。

---

## 📖 本章导读

### 一个真实的故事

小李的团队要开发一个电商系统，他决定用 Neo4j 来存储数据。因为之前一直用 MySQL，他自然而然地按照"表"的思路来建模：

```cypher
// ❌ 关系型思维建模
CREATE (u:User {id: 1, name: "张三"});
CREATE (o:Order {id: 1, userId: 1, amount: 100});  // 用属性存外键
CREATE (p:Product {id: 1, name: "iPhone", orderId: 1});  // 用属性存外键
```

结果发现：查询"张三买了哪些商品"需要写复杂的条件匹配，和 SQL 的 JOIN 没什么区别，完全没有发挥图数据库的优势。

后来他学习了图数据库的建模方法，重新设计：

```cypher
// ✅ 图思维建模
CREATE (u:User {id: 1, name: "张三"});
CREATE (o:Order {id: 1, amount: 100});
CREATE (p:Product {id: 1, name: "iPhone"});
CREATE (u)-[:PLACED]->(o);
CREATE (o)-[:INCLUDES {qty: 1}]->(p);
```

现在查询"张三买了哪些商品"变成了：

```cypher
MATCH (u:User {name: "张三"})-[:PLACED]->(:Order)-[:INCLUDES]->(p:Product)
RETURN p.name
```

**这就是图建模的核心——用关系代替外键，用路径代替 JOIN。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **区分"图思维"和"表思维"** — 知道什么时候该用节点，什么时候该用关系
2. **掌握四种常见建模模式** — 星型、树型、多对多、时间线
3. **识别并避免反模式** — 不犯新手常见的建模错误
4. **设计出高效、易查询的图模型** — 为后续章节打下基础

---

## 🧠 核心概念详解

### 图建模的核心原则

#### 原则1：节点表示实体，关系表示行为

```
💡 判断标准：
- 如果它是一个"东西"（人、商品、公司）→ 节点
- 如果它是一种"连接"（购买、属于、工作于）→ 关系
- 如果它是一个"事件"（订单、交易、日志）→ 节点
```

**例子**：
- "张三" → 节点（:Person）
- "购买" → 关系（:PURCHASED）
- "订单#001" → 节点（:Order），因为它有自己的属性（金额、时间、状态）

#### 原则2：关系可以有属性

关系属性用来描述"这个连接的特征"。

```cypher
// 关系属性：描述"购买"这个行为
(u:User)-[:PURCHASED {quantity: 2, unitPrice: 100, timestamp: datetime()}]->(p:Product)
```

**💡 类比**：关系属性 ≈ 关系型数据库中"关联表"的额外字段。

#### 原则3：一个节点可以有多个标签

```cypher
// 一个节点同时属于 Person 和 Employee
CREATE (:Person:Employee {name: "张三", employeeId: "E001"});
```

**💡 类比**：多标签 ≈ 一个对象实现多个接口。

### 四种常见建模模式

#### 模式1：星型模式（Star Pattern）

**场景**：一个中心节点辐射到多个关联节点。

**例子**：用户 → 地址、订单、购物车、支付方式

```
        [Address]
           ↑
    [Cart] ← [User] → [Order]
               ↓
          [Payment]
```

**适用场景**：用户中心系统、客户管理系统

**Cypher 实现**：
```cypher
CREATE (u:User {userId: "U001", name: "张三"});
CREATE (a:Address {street: "朝阳区建国路88号", city: "北京"});
CREATE (o:Order {orderId: "ORD001", totalAmount: 100});
CREATE (u)-[:HAS_ADDRESS]->(a);
CREATE (u)-[:PLACED]->(o);
```

**查询示例**：
```cypher
-- 查询用户的所有地址和订单
MATCH (u:User {name: "张三"})
OPTIONAL MATCH (u)-[:HAS_ADDRESS]->(a:Address)
OPTIONAL MATCH (u)-[:PLACED]->(o:Order)
RETURN u.name, collect(DISTINCT a.city) AS addresses, count(o) AS order_count
```

#### 模式2：树型模式（Tree Pattern）

**场景**：层级分类结构。

**例子**：商品分类（电子产品 → 手机/笔记本/配件）

```
[电子产品]
    ├── [手机]
    ├── [笔记本电脑]
    └── [配件]
[服装]
    ├── [男装]
    └── [女装]
```

**适用场景**：分类系统、组织架构、菜单树

**Cypher 实现**：
```cypher
CREATE (root:Category {name: "电子产品"});
CREATE (child:Category {name: "手机"});
CREATE (child)-[:BELONGS_TO]->(root);
```

**查询示例**：
```cypher
-- 查询某个分类下的所有子分类（递归）
MATCH (parent:Category {name: "电子产品"})<-[:BELONGS_TO*]-(child:Category)
RETURN child.name
```

**🔍 解读**：`[:BELONGS_TO*]` 是变长路径匹配，可以匹配任意深度的层级关系。

#### 模式3：多对多模式（Many-to-Many）

**场景**：两个实体之间的双向关联。

**例子**：商品 ↔ 分类（一个商品可以属于多个分类，一个分类可以有多个商品）

```
[Product: iPhone] ←──CATEGORIZED_AS──→ [Category: 手机]
[Product: iPhone] ←──CATEGORIZED_AS──→ [Category: 高端机]
```

**适用场景**：标签系统、权限角色、课程学生

**Cypher 实现**：
```cypher
CREATE (p:Product {name: "iPhone 15 Pro"});
CREATE (c1:Category {name: "手机"});
CREATE (c2:Category {name: "高端机"});
CREATE (p)-[:CATEGORIZED_AS]->(c1);
CREATE (p)-[:CATEGORIZED_AS]->(c2);
```

**查询示例**：
```cypher
-- 查询属于"手机"分类的所有商品
MATCH (p:Product)-[:CATEGORIZED_AS]->(c:Category {name: "手机"})
RETURN p.name, p.price
```

#### 模式4：时间线模式（Timeline Pattern）

**场景**：事件链表示状态流转。

**例子**：订单状态 → 支付 → 发货 → 签收

```
[Order] → [Event: 支付成功] → [Event: 已发货] → [Event: 已签收]
```

**适用场景**：订单状态跟踪、工作流、日志审计

**Cypher 实现**：
```cypher
CREATE (o:Order {orderId: "ORD001", status: "completed"});
CREATE (e1:Event {type: "payment", timestamp: datetime("2024-06-15T10:31:00")});
CREATE (e2:Event {type: "shipment", timestamp: datetime("2024-06-15T14:00:00")});
CREATE (o)-[:HAS_EVENT]->(e1);
CREATE (e1)-[:NEXT]->(e2);
```

**查询示例**：
```cypher
-- 查询订单的完整时间线
MATCH (o:Order {orderId: "ORD001"})-[:HAS_EVENT]->(e:Event)
OPTIONAL MATCH path = (e)-[:NEXT*]->(next:Event)
RETURN o.orderId, e.type, e.timestamp, e.detail
ORDER BY e.timestamp
```

---

## 🛠️ 动手实践

### 第一步：启动并初始化

```bash
cd demos/03-data-modeling
docker compose up -d
docker exec -it neo4j-modeling cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第二步：探索电商图模型

打开 http://localhost:7476，执行以下查询。

#### 查询1：查看完整的图结构

```cypher
MATCH (n)
RETURN n
LIMIT 30
```

你会看到电商系统的完整图结构：用户、地址、商品、分类、订单、事件。

#### 查询2：查询用户的地址

```cypher
MATCH (u:User {name: "张三"})-[:HAS_ADDRESS]->(a:Address)
RETURN u.name, a.street, a.city, a["HAS_ADDRESS"].type AS address_type
```

**预期结果**：张三有两个地址——家（北京朝阳区）和工作地（上海浦东）。

**🔍 解读**：`a["HAS_ADDRESS"].type` 访问关系的属性。注意这里 `HAS_ADDRESS` 是关系类型，`.type` 是关系上的属性。

#### 查询3：查询分类树

```cypher
MATCH (child:Category)-[:BELONGS_TO*]->(root:Category)
WHERE NOT EXISTS { (root)-[:BELONGS_TO]->() }
RETURN root.name AS root_category, collect(child.name) AS sub_categories
```

**预期结果**：
```
╔═══════════════╤══════════════════════════════════════╗
║ root_category │ sub_categories                      ║
╠═══════════════╪══════════════════════════════════════╣
║ "电子产品"    │ ["手机", "笔记本电脑", "配件"]      ║
║ "服装"        │ ["男装", "女装"]                    ║
╚═══════════════╧══════════════════════════════════════╝
```

**🔍 解读**：`[:BELONGS_TO*]` 匹配任意深度的层级。`NOT EXISTS { (root)-[:BELONGS_TO]->() }` 找到最顶层的分类（没有父分类的分类）。

#### 查询4：查询订单时间线

```cypher
MATCH (o:Order {orderId: "ORD001"})-[:HAS_EVENT]->(e:Event)
RETURN o.orderId, e.type, e.timestamp, e.detail
ORDER BY e.timestamp
```

**预期结果**：显示订单 ORD001 的完整生命周期——支付成功 → 已发货 → 已签收。

---

## ⚠️ 常见误区

### 反模式1：用关系属性代替节点

**错误做法**：
```cypher
// ❌ 把"订单项"作为关系属性
(o:Order)-[:INCLUDES {productName: "iPhone", qty: 1, price: 8999}]->(p:Product)
```

**问题**：如果订单项有自己的生命周期（退款、评价），用关系属性就无法表达了。

**正确做法**：
```cypher
// ✅ 把"订单项"作为节点
CREATE (o:Order)-[:HAS_ITEM]->(li:LineItem {qty: 1, price: 8999});
CREATE (li)-[:FOR_PRODUCT]->(p:Product {name: "iPhone"});
```

### 反模式2：过度使用属性值作为标签

**错误做法**：
```cypher
// ❌ 用标签表示分类
CREATE (:Product_手机 {name: "iPhone"});
CREATE (:Product_笔记本 {name: "MacBook"});
```

**问题**：每增加一个分类就要创建新的标签，查询跨分类商品变得困难。

**正确做法**：
```cypher
// ✅ 用关系表示分类
CREATE (:Product {name: "iPhone"})-[:CATEGORIZED_AS]->(:Category {name: "手机"});
CREATE (:Product {name: "MacBook"})-[:CATEGORIZED_AS]->(:Category {name: "笔记本"});
```

### 反模式3：创建孤立节点

**错误做法**：
```cypher
// ❌ 创建了没有关系的节点
CREATE (:Product {name: "iPhone", stock: 100});
// 这个节点没有任何关系连接，查询时很难被发现
```

**问题**：孤立节点无法通过图遍历到达，相当于"数据孤岛"。

**正确做法**：
```cypher
// ✅ 创建节点时同时创建关系
MATCH (c:Category {name: "手机"})
CREATE (:Product {name: "iPhone", stock: 100})-[:CATEGORIZED_AS]->(c);
```

### 反模式4：过度建模

**错误做法**：
```cypher
// ❌ 为每个属性都创建节点
CREATE (:Name {value: "张三"});
CREATE (:Age {value: 30});
CREATE (:Person)-[:HAS_NAME]->(:Name);
CREATE (:Person)-[:HAS_AGE]->(:Age);
```

**问题**：过度复杂化，查询需要遍历多层关系，性能差。

**正确做法**：
```cypher
// ✅ 属性直接放在节点上
CREATE (:Person {name: "张三", age: 30});
```

---

## 💭 思考题

1. 如果要设计一个"学生选课系统"，有学生、课程、教师三个实体，你会怎么建模？用 Cypher 写出来。
2. 在电商系统中，"用户浏览商品"这个行为应该建模为关系还是节点？为什么？
3. 树型模式中，如果要查询"某个分类下的所有商品（包括子分类的商品）"，Cypher 应该怎么写？

---

## 📚 扩展阅读

- [Neo4j 数据建模指南](https://neo4j.com/developer/data-modeling/) — 官方建模最佳实践
- [Graph Data Modeling](https://neo4j.com/docs/getting-started/data-modeling/) — 深入理解图建模理论
- [常见的图模型反模式](https://neo4j.com/blog/graph-modeling-antipatterns/) — 避免踩坑

---

## 🏃 运行命令速查

```bash
# 启动
docker compose up -d

# 初始化数据
docker exec -it neo4j-modeling cypher-shell -u neo4j -p password123 -f /init.cypher

# 停止并清理
docker compose down -v
```
