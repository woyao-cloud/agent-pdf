# 第7章：图算法

> 图数据库不仅能存储关系，还能分析关系。PageRank 可以找出社交网络中的意见领袖，社区检测可以自动发现用户群组，最短路径可以规划最优路线。

---

## 📖 本章导读

### 一个真实的故事

小郑在运营一个社交平台，他想知道三件事：

1. **谁是平台最有影响力的人？** — 用来做 KOL 营销
2. **用户之间形成了哪些小圈子？** — 用来做精准推荐
3. **两个用户之间最短通过几个人认识？** — 用来做"可能认识的人"推荐

在传统数据库中，这些问题需要复杂的统计分析。但在 Neo4j 中，有现成的图算法可以解决：

```cypher
-- 1. PageRank：找出最有影响力的人
CALL gds.pageRank.stream('social-graph')
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS person, score
ORDER BY score DESC

-- 2. Louvain：发现用户社区
CALL gds.louvain.stream('social-graph')
YIELD nodeId, communityId
RETURN communityId, collect(gds.util.asNode(nodeId).name) AS members

-- 3. 最短路径
MATCH p = shortestPath((a:Person)-[:FOLLOWS*]-(b:Person))
RETURN p
```

**这就是图算法的威力——一行代码解决一个复杂的关系分析问题。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **理解核心图算法的原理和用途** — 知道什么时候该用什么算法
2. **使用 GDS 库执行图算法** — 创建投影图、运行算法、解读结果
3. **用原生 Cypher 实现简单的图分析** — 不依赖 GDS 也能做基本分析
4. **将图算法应用到实际场景** — 推荐系统、社交分析、异常检测

---

## 🧠 核心概念详解

### 图算法分类

| 类别 | 算法 | 用途 | 现实例子 |
|------|------|------|---------|
| **路径算法** | 最短路径、A*、K 最短路径 | 两点间最优路径 | 地图导航、社交距离 |
| **中心性算法** | PageRank、Betweenness、Degree | 节点重要性 | 意见领袖、关键枢纽 |
| **社区检测** | Louvain、Label Propagation、WCC | 发现群组 | 用户分群、兴趣小组 |
| **相似度算法** | Jaccard、余弦相似度 | 节点相似度 | 商品推荐、用户匹配 |

### 核心算法详解

#### PageRank — 节点影响力

**原理**：一个节点被越多"重要"的节点引用，它就越重要。

**💡 类比**：学术论文引用——一篇论文被越多重要论文引用，它的影响力就越大。Google 最初就是用 PageRank 来排序网页的。

**适用场景**：
- 社交网络中的意见领袖
- 知识图谱中的核心实体
- 推荐系统中的热门商品

#### Betweenness Centrality — 桥接者识别

**原理**：一个节点出现在越多最短路径上，它的中介性就越高。

**💡 类比**：一个社交圈里的"中间人"——ta 认识不同圈子的人，是信息传递的枢纽。

**适用场景**：
- 找出连接不同团队的"关键人物"
- 识别网络中的"桥接节点"
- 分析信息传播路径

#### Louvain — 社区发现

**原理**：自动将节点分组，使得组内连接紧密、组间连接稀疏。

**💡 类比**：一个公司里，市场部的人经常互相交流，技术部的人经常互相交流，但跨部门交流较少。Louvain 算法会自动发现这些"部门"。

**适用场景**：
- 用户分群
- 兴趣小组发现
- 异常检测（孤立节点）

### GDS 使用流程

GDS（Graph Data Science）库的算法执行分为三步：

```
1. 创建投影图  →  gds.graph.project('name', 'NodeLabel', 'REL_TYPE')
2. 运行算法    →  gds.pageRank.stream('name')
3. 清理投影图  →  gds.graph.drop('name')
```

**为什么需要投影图？** 算法运行在内存中的投影图上，不会修改原始数据。这样可以安全地运行算法，不用担心数据被破坏。

---

## 🛠️ 动手实践

### 第一步：启动并初始化

```bash
cd demos/07-graph-algorithms
docker compose up -d
docker exec -it neo4j-algorithms cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第二步：创建投影图

打开 http://localhost:7480，执行：

```cypher
CALL gds.graph.project(
    'social-graph',
    'Person',
    'FOLLOWS'
);
```

### 第三步：运行算法

#### 练习1：PageRank — 谁最有影响力？

```cypher
CALL gds.pageRank.stream('social-graph')
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS person, score
ORDER BY score DESC
```

**预期结果**：Alice 和 Charlie 的 PageRank 值最高，因为他们被多个重要用户关注。

#### 练习2：Degree Centrality — 谁的连接最多？

```cypher
CALL gds.degree.stream('social-graph')
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS person, score AS connections
ORDER BY connections DESC
```

**预期结果**：Alice 和 Charlie 的入度最高（粉丝最多），Eve 的出度最高（关注最多）。

#### 练习3：Louvain — 有哪些社区？

```cypher
CALL gds.louvain.stream('social-graph')
YIELD nodeId, communityId
RETURN communityId, collect(gds.util.asNode(nodeId).name) AS members
ORDER BY communityId
```

**预期结果**：用户被分成 2-3 个社区，同一社区内的用户关注关系更紧密。

### 第四步：清理

```cypher
CALL gds.graph.drop('social-graph');
```

---

## ⚠️ 常见误区

### 误区1：忘记创建投影图

**错误做法**：
```cypher
CALL gds.pageRank.stream('social-graph')  -- ❌ 投影图不存在
```

**正确做法**：先创建投影图，再运行算法。

### 误区2：投影图不释放

**问题**：投影图占用内存，不释放会导致内存不足。

**正确做法**：使用完后删除投影图：
```cypher
CALL gds.graph.drop('social-graph');
```

### 误区3：混淆入度和出度

- **入度（In-Degree）**：指向该节点的关系数（粉丝数）
- **出度（Out-Degree）**：从该节点出发的关系数（关注数）

在社交网络中，入度高意味着"受欢迎"，出度高意味着"活跃"。

---

## 💭 思考题

1. PageRank 和 Degree Centrality 有什么区别？什么情况下 PageRank 比 Degree 更有意义？
2. 如果要在电商系统中用图算法做商品推荐，你会用哪些算法？
3. Louvain 社区检测的结果如何应用到实际业务中？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it neo4j-algorithms cypher-shell -u neo4j -p password123 -f /init.cypher
docker compose down -v
```
