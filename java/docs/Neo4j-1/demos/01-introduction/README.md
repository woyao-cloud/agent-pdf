# 第1章：图数据库与Neo4j概述

> 如果把关系型数据库比作 Excel 表格，图数据库就是一张"知识图谱"——它关心的不是"数据长什么样"，而是"数据之间怎么连接"。

---

## 📖 本章导读

### 一个真实的故事

小王在一家电商公司做后端开发。一天，产品经理提了一个需求："在商品详情页加一个'买了这个商品的顾客也买了'的推荐模块。"

小王心想：这不就是"协同过滤"吗？他在 MySQL 里设计了 3 张表：`users`、`products`、`orders`，然后用一个 3 表 JOIN 的 SQL 查询：

```sql
SELECT DISTINCT p2.name FROM orders o1
JOIN orders o2 ON o1.user_id = o2.user_id
JOIN products p2 ON o2.product_id = p2.id
WHERE o1.product_id = 'P001' AND o2.product_id != 'P001';
```

这个查询在数据量小时跑得还行。但当用户量突破 100 万、订单量突破 1000 万后，这个查询从"秒级"变成了"分钟级"，数据库 CPU 直接飙到 100%。

后来小王听说了 Neo4j，用图数据库重新设计了数据模型。同样的推荐查询，在 Neo4j 中只需要：

```cypher
MATCH (u:User)-[:BOUGHT]->(p:Product {id: 'P001'})
MATCH (u)-[:BOUGHT]->(other:Product)
WHERE other.id <> 'P001'
RETURN other.name, count(*) AS frequency
ORDER BY frequency DESC
```

查询时间从"分钟级"降到了"毫秒级"。

**这就是图数据库的威力——当你的业务核心是"关系"时，用图数据库比关系型数据库快几个数量级。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **理解图数据库和关系型数据库的本质区别** — 知道什么时候该用图数据库，什么时候不该用
2. **掌握 Neo4j 的核心概念** — 节点、关系、属性、标签，以及它们如何组合成图
3. **了解 Neo4j 的生态全景** — 知道有哪些工具和库可用
4. **成功启动第一个 Neo4j 实例** — 用 Docker 一键启动，在 Browser 中看到你的第一张图

---

## 🧠 核心概念详解

### 什么是图数据库？

想象你在画一张"人际关系图"：

- 你把每个朋友画成一个**圆圈**，圆圈里写上他们的名字
- 如果两个朋友认识，你在他们之间画一条**线**
- 如果他们是大学同学，你在线上标注"同学"
- 如果他们是同事，你标注"同事"

**这就是图数据库的核心思想**——用圆圈（节点）表示实体，用线（关系）表示连接。

### 图数据库 vs 关系型数据库

| 对比维度 | 关系型数据库（MySQL） | 图数据库（Neo4j） |
|---------|-------------------|----------------|
| **数据模型** | 表 + 行 + 外键 | 节点 + 关系 + 属性 |
| **查询关系** | JOIN（表连接） | 路径遍历（指针跳转） |
| **关系性能** | 随数据量增长指数级下降 | 随数据量增长线性下降 |
| **模式灵活性** | 固定 Schema，改表结构麻烦 | 无 Schema，随时加属性/标签 |
| **适合场景** | 事务处理、报表统计 | 关系分析、路径查询、推荐 |

**💡 类比**：关系型数据库像一本**电话簿**——按字母顺序排列，查找一个人的信息很快，但想知道"张三的所有朋友的朋友"就很麻烦。图数据库像一张**地铁线路图**——每个站（节点）通过线路（关系）连接，找"从A站到B站怎么换乘"一目了然。

### 属性图模型的四个要素

Neo4j 使用**属性图模型**，由四个要素组成：

#### 1️⃣ 节点（Node）— 图中的"名词"

节点表示**实体**——人、公司、商品、订单，任何你想记录的东西。

```
💡 类比：节点 ≈ Excel 表中的"一行记录"
区别：节点可以同时属于多个类别（标签），而行只能属于一个表
```

**例子**：
- `(:Person {name: "张三", age: 30})` — 一个人
- `(:Company {name: "Acme Corp", founded: 2010})` — 一家公司
- `(:Skill {name: "Python"})` — 一个技能

#### 2️⃣ 关系（Relationship）— 图中的"动词"

关系表示**连接**——两个节点之间的有向联系。关系**必须有方向**（从 → 到），**必须有类型**，**可以有属性**。

```
💡 类比：关系 ≈ Excel 中的"外键关联"
区别：关系是"一等公民"，可以有自己的属性，而外键只是字段
```

**例子**：
- `(张三)-[:FRIENDS_WITH {since: 2020}]->(李四)` — 张三和李四是朋友
- `(张三)-[:WORKS_AT {role: "Engineer"}]->(Acme Corp)` — 张三在 Acme Corp 工作
- `(张三)-[:KNOWS {level: "expert"}]->(Python)` — 张三精通 Python

#### 3️⃣ 标签（Label）— 节点的"分类"

标签给节点分类，一个节点可以有**多个标签**。

```
💡 类比：标签 ≈ Excel 中的"表名"
区别：一行只能属于一个表，但一个节点可以有多个标签
```

**例子**：
- `(:Person:Employee)` — 既是人又是员工
- `(:Movie:ScienceFiction)` — 既是电影又是科幻片

#### 4️⃣ 属性（Property）— 节点和关系的"特征"

属性是键值对，存储具体数据。

```
💡 类比：属性 ≈ Excel 中的"列"
区别：图数据库中每个节点可以有不同的属性集合
```

**例子**：
- 节点属性：`{name: "张三", age: 30, city: "Beijing"}`
- 关系属性：`{since: 2020, weight: 5}`

### 四个要素的关系

```
节点（实体） ←── 标签（分类）
    │
    ├── 属性（特征）
    │
    └── 关系（连接）──→ 另一个节点
              │
              └── 属性（关系的特征）
```

---

## 🛠️ 动手实践

### 第一步：启动 Neo4j

```bash
# 进入本章示例目录
cd demos/01-introduction

# 启动 Neo4j（后台运行）
docker compose up -d

# 等待启动完成（约 10-15 秒）
# 你可以用以下命令查看日志：
docker compose logs -f
# 看到 "Started." 就说明启动完成了
```

**预期结果**：
- 终端输出类似 `Container neo4j-intro Started`
- Neo4j 在后台运行，占用端口 7474（Web界面）和 7687（驱动连接）

### 第二步：访问 Neo4j Browser

打开浏览器访问 **http://localhost:7474**

你会看到一个登录界面：
- **Connect URL**：`bolt://localhost:7687`（保持默认）
- **Username**：`neo4j`
- **Password**：`password123`

点击 "Connect" 后，你会看到一个空白的查询界面。这就是 Neo4j Browser——你可以在这里执行 Cypher 查询并看到结果的可视化。

### 第三步：初始化数据

在 Neo4j Browser 的编辑器中，复制并执行 `init.cypher` 中的内容。或者用命令行执行：

```bash
docker exec -it neo4j-intro cypher-shell -u neo4j -p password123 -f /init.cypher
```

**预期结果**：终端输出没有错误信息，说明数据创建成功。

### 第四步：执行你的第一个查询

在 Neo4j Browser 的编辑器中输入：

```cypher
MATCH (n) RETURN n
```

点击运行按钮（▶️），你会看到一张图——圆圈代表节点，箭头代表关系。你可以拖拽圆圈来调整布局。

**你看到什么了？**
- 3 个 `Person` 节点（Alice、Bob、Charlie）
- 2 个 `Company` 节点（Acme Corp、Beta Inc）
- 3 个 `Skill` 节点（Python、JavaScript、Machine Learning）
- 它们之间的各种关系（FRIENDS_WITH、WORKS_AT、KNOWS）

### 第五步：尝试更多查询

在编辑器中逐个执行以下查询，观察结果：

```cypher
-- 查询1：看看 Alice 的朋友
MATCH (a:Person {name: "Alice"})-[:FRIENDS_WITH]->(friend)
RETURN a.name, friend.name, friend.city
```

**预期结果**：显示 Alice 的两个朋友——Bob（上海）和 Charlie（北京）。

```cypher
-- 查询2：看看谁在 Acme Corp 工作
MATCH (p:Person)-[:WORKS_AT]->(c:Company {name: "Acme Corp"})
RETURN p.name, p.role
```

**预期结果**：显示 Alice（Engineer）和 Charlie（CTO）。

```cypher
-- 查询3：看看谁是 Python 专家
MATCH (p:Person)-[:KNOWS {level: "expert"}]->(s:Skill {name: "Python"})
RETURN p.name, p.city
```

**预期结果**：显示 Alice（Beijing）和 Charlie（Beijing）。

### 第六步：停止并清理

```bash
# 停止容器并删除数据
docker compose down -v
```

---

## ⚠️ 常见误区

### 误区1：把 Neo4j 当关系数据库用

**错误做法**：
```cypher
// 用关系型思维建模——创建"用户表"和"订单表"
CREATE (u:User {id: 1, name: "张三"});
CREATE (o:Order {id: 1, userId: 1, amount: 100});  // ❌ 用属性存外键
```

**正确做法**：
```cypher
// 用图思维建模——用关系连接
CREATE (u:User {id: 1, name: "张三"});
CREATE (o:Order {id: 1, amount: 100});
CREATE (u)-[:PLACED]->(o);  // ✅ 用关系代替外键
```

### 误区2：忘记关系方向

**错误做法**：
```cypher
// 创建关系时忘记方向
MATCH (a:Person {name: "Alice"}), (b:Person {name: "Bob"})
CREATE (a)-[:FRIENDS_WITH]-(b);  // ❌ 无方向关系
```

**正确做法**：
```cypher
// 关系必须有方向
MATCH (a:Person {name: "Alice"}), (b:Person {name: "Bob"})
CREATE (a)-[:FRIENDS_WITH]->(b);  // ✅ 有方向
```

### 误区3：认为图数据库能替代关系型数据库

图数据库**不是**关系型数据库的替代品，而是**补充**。它们各有擅长的场景：

| 场景 | 用哪个 |
|------|--------|
| 银行交易记录（ACID 严格） | 关系型数据库 |
| 用户订单管理 | 关系型数据库 |
| 好友推荐、路径分析 | 图数据库 |
| 知识图谱、关系分析 | 图数据库 |
| 报表统计、数据仓库 | 关系型数据库 |

---

## 💭 思考题

1. 如果我们要在图中添加"Alice 和 Bob 是大学同学"这个信息，应该用节点属性还是关系属性？为什么？
2. 假设我们要查询"Alice 的朋友的朋友"，Cypher 应该怎么写？这和 SQL 的 3 表 JOIN 相比，哪个更直观？
3. 在什么场景下，你会选择关系型数据库而不是图数据库？举一个具体的例子。

---

## 📚 扩展阅读

- [Neo4j 官方文档](https://neo4j.com/docs/) — 最权威的参考资料
- [Neo4j Browser 使用指南](https://neo4j.com/docs/browser-manual/current/) — 学习 Browser 的高级功能
- [属性图模型详解](https://neo4j.com/docs/getting-started/appendix/graphdb-concepts/) — 深入理解图数据库理论

---

## 🏃 运行命令速查

```bash
# 启动
docker compose up -d

# 查看日志
docker compose logs -f

# 执行初始化脚本
docker exec -it neo4j-intro cypher-shell -u neo4j -p password123 -f /init.cypher

# 打开交互式 Shell
docker exec -it neo4j-intro cypher-shell -u neo4j -p password123

# 停止并清理数据
docker compose down -v
```
