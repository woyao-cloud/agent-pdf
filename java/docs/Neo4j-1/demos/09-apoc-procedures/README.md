# 第9章：APOC过程库实战

> APOC 是 Neo4j 的"瑞士军刀"——400+ 个实用过程，覆盖数据转换、日期处理、文本分析、图操作等。很多在 Cypher 中难以实现的操作，用 APOC 一行就能搞定。

---

## 📖 本章导读

### 一个真实的故事

小王的团队需要完成几个"简单"的数据处理任务：

1. 把节点数据导出为 JSON 格式给前端
2. 计算两个字符串的相似度来做模糊匹配
3. 在创建订单时自动记录审计日志
4. 把日期格式从 "2024-01-15" 转为 "2024年1月15日"

在纯 Cypher 中，这些任务要么很复杂，要么根本做不到。但有了 APOC，一切都变得简单：

```cypher
-- 1. 节点转 JSON
RETURN apoc.convert.toJson(node) AS json;

-- 2. 字符串相似度
RETURN apoc.text.sorensenDiceSimilarity("Neo4j数据库", "Neo4j图数据库") AS similarity;

-- 3. 自动审计日志（触发器）
CALL apoc.trigger.add('audit_log', '...', {phase: 'after'});

-- 4. 日期格式化
RETURN apoc.date.format(timestamp(), "yyyy年MM月dd日") AS formatted;
```

**这就是 APOC 的价值——把 Cypher 做不到或做不好的事情，变成一行代码。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **使用 APOC 进行数据转换** — JSON/Map/列表互转
2. **处理日期和时间** — 格式化、解析、加减
3. **进行文本分析** — 模糊匹配、相似度计算、正则提取
4. **查看数据库元数据** — Schema 结构、统计信息
5. **使用触发器自动响应数据变更** — 审计日志、数据同步

---

## 🧠 核心概念详解

### APOC 是什么？

APOC（Awesome Procedures on Cypher）是 Neo4j 的**标准过程库**，提供了 400+ 个实用过程。

**💡 类比**：APOC 就像 Python 的标准库——有了它，你不需要自己造轮子。

### APOC 功能分类

| 类别 | 过程 | 用途 | 类比 |
|------|------|------|------|
| **数据转换** | `apoc.convert.*` | JSON/Map/列表互转 | Python json 模块 |
| **日期处理** | `apoc.date.*` | 日期格式化、解析、加减 | Python datetime 模块 |
| **文本处理** | `apoc.text.*` | 模糊匹配、相似度、正则 | Python re 模块 |
| **图操作** | `apoc.graph.*` | 子图提取、虚拟关系 | 图论工具 |
| **元数据** | `apoc.meta.*` | Schema 查看、统计信息 | DESCRIBE TABLE |
| **数据导出** | `apoc.export.*` | JSON/GraphML/CSV 导出 | 数据导出工具 |
| **触发器** | `apoc.trigger.*` | 数据变更自动响应 | 数据库触发器 |
| **并行执行** | `apoc.periodic.*` | 分批提交、并行处理 | 批处理框架 |

---

## 🛠️ 动手实践

### 第一步：启动并初始化

```bash
cd demos/09-apoc-procedures
docker compose up -d
docker exec -it neo4j-apoc cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第二步：APOC 实战

打开 http://localhost:7482，执行以下查询。

#### 练习1：数据转换

```cypher
-- 节点转 JSON
MATCH (u:User {name: "张三"})
RETURN apoc.convert.toJson(u) AS user_json
```

**预期结果**：返回张三节点的 JSON 字符串。

```cypher
-- 列表转字符串
RETURN apoc.text.join(["Python", "Java", "Go"], ", ") AS joined
```

**预期结果**：`"Python, Java, Go"`

#### 练习2：日期处理

```cypher
-- 当前时间格式化
RETURN apoc.date.format(timestamp(), "yyyy-MM-dd HH:mm:ss") AS now;

-- 7 天前的日期
RETURN apoc.date.format(apoc.date.add(timestamp(), "day", -7), "yyyy-MM-dd") AS last_week;
```

#### 练习3：文本分析

```cypher
-- 模糊匹配
RETURN apoc.text.fuzzyCompare("张三", "张山") AS similar;

-- 文本相似度
RETURN apoc.text.sorensenDiceSimilarity("Neo4j数据库", "Neo4j图数据库") AS similarity;
```

#### 练习4：查看数据库 Schema

```cypher
CALL apoc.meta.schema()
YIELD label, properties, relationships
RETURN label, properties, relationships
```

**预期结果**：显示数据库中所有标签、它们的属性类型、以及关系信息。

---

## ⚠️ 常见误区

### 误区1：APOC 需要单独安装

**问题**：APOC 不是 Neo4j 内置的，需要安装插件。

**解决方案**：在 Docker Compose 中通过环境变量安装：
```yaml
environment:
  - NEO4J_PLUGINS=["apoc"]
```

### 误区2：APOC 过程需要授权

**问题**：某些 APOC 过程（如文件操作）需要额外授权。

**解决方案**：
```yaml
environment:
  - NEO4J_dbms_security_procedures_unrestricted=apoc.*
```

### 误区3：触发器会影响性能

**问题**：每个数据变更都会触发触发器，大量写入时会影响性能。

**解决方案**：只在必要的场景使用触发器，避免在触发器中执行复杂操作。

---

## 💭 思考题

1. 如果要实现"当用户创建订单时，自动更新用户的最后活跃时间"，用 APOC 触发器应该怎么写？
2. `apoc.text.fuzzyCompare` 和 `apoc.text.sorensenDiceSimilarity` 有什么区别？分别在什么场景下使用？
3. 如何用 APOC 将 Neo4j 中的数据导出为 JSON 文件？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it neo4j-apoc cypher-shell -u neo4j -p password123 -f /init.cypher
docker compose down -v
```
