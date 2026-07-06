# 第6章：数据导入

> 现实世界中，数据很少是手动创建的。你可能需要从 CSV 文件、关系型数据库、API 接口导入数据。选错了导入方法，100 万行数据可能要等几个小时。

---

## 📖 本章导读

### 一个真实的故事

小吴需要将 50 万行用户数据从旧系统迁移到 Neo4j。他写了一个简单的 `LOAD CSV` 查询：

```cypher
LOAD CSV WITH HEADERS FROM 'file:///users.csv' AS row
CREATE (u:User {userId: row.userId, name: row.name});
```

结果跑了 30 分钟还没结束。为什么这么慢？因为**每条 CREATE 都是一个独立的事务**，50 万条数据就是 50 万次事务提交，每次提交都有开销。

后来他改用了分批提交：

```cypher
LOAD CSV WITH HEADERS FROM 'file:///users.csv' AS row
CALL {
    WITH row
    MERGE (u:User {userId: row.userId})
    ON CREATE SET u.name = row.name
} IN TRANSACTIONS OF 1000 ROWS;
```

同样的 50 万行数据，**从 30 分钟降到了 2 分钟**。

**这就是选择正确导入方法的重要性——15 倍的性能差距。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **根据数据量选择正确的导入方法** — 从几千行到几百万行都有对应方案
2. **使用 LOAD CSV 导入中小文件** — 处理编码、格式问题
3. **使用分批提交处理大文件** — 避免 OOM
4. **使用 UNWIND + MERGE 批量操作** — 从 API 导入数据

---

## 🧠 核心概念详解

### 导入方法选择指南

| 数据量 | 推荐方法 | 特点 |
|--------|---------|------|
| < 1 万行 | `LOAD CSV`（默认） | 简单直接，单事务 |
| 1 万 - 10 万行 | `LOAD CSV` + `CALL IN TRANSACTIONS` | 分批提交，避免大事务 |
| 10 万 - 100 万行 | `apoc.periodic.iterate` | 分批 + 并行，高性能 |
| > 100 万行 | `neo4j-admin database import` | 离线全量导入，最快 |

### LOAD CSV 详解

`LOAD CSV` 是 Neo4j 内置的 CSV 导入工具。

```cypher
LOAD CSV WITH HEADERS FROM 'file:///users.csv' AS row
// row.userId, row.name, row.email  ← CSV 的列名
RETURN row.userId, row.name
LIMIT 5
```

**参数说明**：
- `WITH HEADERS`：第一行作为列名
- `FROM 'file:///...'`：文件路径（文件放在 Neo4j 的 import 目录）
- `AS row`：每行数据作为一个 map
- `FIELDTERMINATOR ';'`：指定分隔符（默认逗号）

### 分批提交原理

**为什么需要分批？**

Neo4j 的每个事务都会在内存中保留所有变更，直到事务提交。如果在一个事务中处理 50 万行数据，内存会被撑爆。

**分批提交**将大数据集拆分成多个小事务，每个事务处理 1000 行，提交后释放内存。

```cypher
LOAD CSV WITH HEADERS FROM 'file:///large_file.csv' AS row
CALL {
    WITH row
    // 你的导入逻辑
    MERGE (n:Label {id: row.id})
    SET n.name = row.name
} IN TRANSACTIONS OF 1000 ROWS;  // ← 每 1000 行提交一次
```

---

## 🛠️ 动手实践

### 第一步：准备 CSV 文件

```bash
cd demos/06-data-import
mkdir import
```

创建 `import/users.csv`：
```csv
userId,name,email,age,city
U1001,张三,zhangsan@email.com,30,Beijing
U1002,李四,lisi@email.com,28,Shanghai
U1003,王五,wangwu@email.com,35,Shenzhen
```

创建 `import/products.csv`：
```csv
productId,name,price,category,stock
P001,iPhone 15 Pro,8999,手机,100
P002,MacBook Air,10999,笔记本,50
P003,AirPods Pro,1899,配件,200
```

创建 `import/orders.csv`：
```csv
orderId,userId,productId,totalAmount,quantity,status,createdAt
ORD001,U1001,P001,8999,1,completed,2024-06-15
ORD002,U1002,P003,1899,2,pending,2024-07-01
```

### 第二步：启动并导入

```bash
docker compose up -d
docker exec -it neo4j-import cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第三步：验证导入结果

```cypher
-- 统计导入的数据量
MATCH (u:User) RETURN count(u) AS user_count;
MATCH (p:Product) RETURN count(p) AS product_count;
MATCH (o:Order) RETURN count(o) AS order_count;
```

---

## ⚠️ 常见误区

### 误区1：大文件不分批提交

**错误做法**：
```cypher
LOAD CSV FROM 'file:///large_file.csv' AS row
CREATE (n:Node)  -- ❌ 50 万行在一个事务中，会 OOM
```

**正确做法**：
```cypher
LOAD CSV FROM 'file:///large_file.csv' AS row
CALL {
    WITH row
    CREATE (n:Node)
} IN TRANSACTIONS OF 1000 ROWS;  -- ✅ 分批提交
```

### 误区2：CSV 编码问题

**问题**：CSV 文件保存为 GBK 编码，Neo4j 默认使用 UTF-8，导致中文乱码。

**解决方案**：用记事本打开 CSV 文件，另存为 UTF-8 编码。

### 误区3：忘记创建约束就导入

**问题**：没有唯一约束时，重复执行导入会创建重复节点。

**正确做法**：导入前先创建约束：
```cypher
CREATE CONSTRAINT FOR (u:User) REQUIRE u.userId IS UNIQUE;
```

---

## 💭 思考题

1. 如果要导入 200 万行数据，你会选择哪种方法？为什么？
2. `MERGE` 和 `CREATE` 在导入时有什么区别？什么时候该用哪个？
3. 如果 CSV 文件中有 10% 的数据是重复的，如何确保导入后没有重复节点？

---

## 🏃 运行命令速查

```bash
# 准备数据
mkdir import
# 将 CSV 文件放入 import/ 目录

# 启动并导入
docker compose up -d
docker exec -it neo4j-import cypher-shell -u neo4j -p password123 -f /init.cypher

# 停止
docker compose down -v
```
