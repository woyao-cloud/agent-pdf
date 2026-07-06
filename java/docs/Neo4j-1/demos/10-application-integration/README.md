# 第10章：应用集成

> Neo4j 不是孤立的——你需要把它集成到你的应用中。这章教你如何使用 Python 驱动连接 Neo4j，管理连接池，处理事务，以及构建 REST API。

---

## 📖 本章导读

### 一个真实的故事

小杨的团队在开发一个电商平台，后端用 Python Flask，数据库用 Neo4j。他需要实现：

1. 用户浏览商品列表
2. 用户下单购买
3. 基于"买了这个的人也买了"的推荐

他面临几个问题：
- 每次请求都创建新的数据库连接？太慢了
- 多个请求同时操作数据库？需要事务管理
- 推荐查询怎么写？需要图遍历

最终他使用 `neo4j` Python Driver 的**连接池**和**事务管理**，构建了一个完整的 REST API：

```python
from neo4j import GraphDatabase

class Neo4jConnection:
    def __init__(self, uri, user, password):
        # 连接池：自动管理连接，复用已有连接
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def query(self, cypher, parameters=None):
        with self.driver.session() as session:
            result = session.run(cypher, parameters or {})
            return [record.data() for record in result]
```

**这就是应用集成的核心——用驱动连接 Neo4j，用连接池管理资源，用事务保证数据一致性。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **使用 Python 驱动连接 Neo4j** — 连接管理、Session 管理
2. **执行事务性操作** — 保证数据一致性
3. **构建 REST API** — 用 Flask 暴露 Neo4j 数据
4. **实现基于图的推荐系统** — 协同过滤推荐

---

## 🧠 核心概念详解

### Neo4j 驱动架构

```
你的应用
    │
    ├── Driver（连接池，线程安全）
    │       │
    │       ├── Session（工作单元，轻量级）
    │       │       │
    │       │       ├── Transaction（事务，原子操作）
    │       │       │       ├── run("CREATE ...")
    │       │       │       └── run("MATCH ...")
    │       │       │
    │       │       └── Transaction（另一个事务）
    │       │
    │       └── Session（另一个工作单元）
    │
    └── Bolt 协议（二进制，高效）
            │
        Neo4j 数据库
```

**关键概念**：
- **Driver**：连接池，线程安全，整个应用共享一个实例
- **Session**：工作单元，从连接池获取连接，使用完后归还
- **Transaction**：事务，原子操作，自动提交或回滚

### 连接池管理

```python
# 正确做法：全局共享一个 Driver 实例
db = Neo4jConnection("bolt://localhost:7687", "neo4j", "password")

# 错误做法：每次请求都创建新的 Driver
def bad_api():
    driver = GraphDatabase.driver(...)  # ❌ 每次创建新连接，浪费资源
```

### 事务处理

```python
# 自动事务（推荐）
def get_user(user_id):
    with driver.session() as session:
        # session.run 自动管理事务
        result = session.run("MATCH (u:User {id: $id}) RETURN u", id=user_id)
        return result.single()

# 手动事务（需要精确控制时）
def create_order(user_id, items):
    with driver.session() as session:
        tx = session.begin_transaction()
        try:
            tx.run("CREATE (o:Order {id: $id})", id="ORD001")
            tx.run("MATCH (u:User {id: $id}) CREATE (u)-[:PLACED]->(o)", id=user_id)
            tx.commit()
        except:
            tx.rollback()
            raise
```

---

## 🛠️ 动手实践

### 第一步：启动

```bash
cd demos/10-application-integration
docker compose up -d
```

### 第二步：测试 API

```bash
# 健康检查
curl http://localhost:5000/health

# 获取所有用户
curl http://localhost:5000/users

# 获取用户订单
curl http://localhost:5000/users/U001/orders

# 获取商品推荐
curl http://localhost:5000/users/U001/recommendations

# 创建订单
curl -X POST http://localhost:5000/orders \
  -H "Content-Type: application/json" \
  -d '{"userId": "U001", "items": [{"productId": "P002", "qty": 1}]}'

# 获取统计信息
curl http://localhost:5000/stats
```

### 第三步：理解推荐算法

推荐 API 使用**协同过滤**算法：

```cypher
// 买了相同商品的人还买了什么
MATCH (target:User {userId: $userId})-[:PLACED]->(:Order)-[:INCLUDES]->(bought:Product)
MATCH (bought)<-[:INCLUDES]-(:Order)<-[:PLACED]-(other:User)
WHERE other <> target
MATCH (other)-[:PLACED]->(:Order)-[:INCLUDES]->(recommended:Product)
WHERE NOT EXISTS {
    MATCH (target)-[:PLACED]->(:Order)-[:INCLUDES]->(recommended)
}
RETURN recommended.name, count(DISTINCT other) AS recommenders
ORDER BY recommenders DESC
```

**原理**：找到买了相同商品的其他用户 → 看他们还买了什么 → 排除目标用户已经买过的 → 按推荐人数排序。

---

## ⚠️ 常见误区

### 误区1：每次请求创建新的 Driver

**错误做法**：
```python
@app.route("/users")
def get_users():
    driver = GraphDatabase.driver(...)  # ❌ 每次请求都创建
    ...
```

**正确做法**：全局共享一个 Driver 实例。

### 误区2：忘记处理连接异常

**错误做法**：
```python
result = session.run("MATCH ...")  # ❌ 没有 try/except
```

**正确做法**：
```python
try:
    result = session.run("MATCH ...")
except Exception as e:
    return jsonify({"error": str(e)}), 500
```

### 误区3：在事务中执行耗时操作

**问题**：事务持有数据库连接，长时间不提交会阻塞其他操作。

**正确做法**：事务中只执行数据库操作，不要在事务中调用外部 API 或执行耗时计算。

---

## 💭 思考题

1. 为什么 Driver 应该是全局单例？如果每次请求都创建新的 Driver 会有什么问题？
2. 自动事务（`session.run`）和手动事务（`begin_transaction`）分别在什么场景下使用？
3. 如果要实现"分页查询用户列表"的 API，Cypher 和 Flask 代码应该怎么写？

---

## 🏃 运行命令速查

```bash
# 启动
docker compose up -d

# 测试 API
curl http://localhost:5000
curl http://localhost:5000/users
curl http://localhost:5000/users/U001/orders
curl http://localhost:5000/users/U001/recommendations
curl http://localhost:5000/stats

# 创建订单
curl -X POST http://localhost:5000/orders \
  -H "Content-Type: application/json" \
  -d '{"userId": "U001", "items": [{"productId": "P002", "qty": 1}]}'

# 停止
docker compose down -v
```
