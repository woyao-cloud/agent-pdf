# 第11章：Neo4j + DeepSeek 大模型集成

> 这是本书的"王牌章节"。传统 BI 工具只能做预设好的报表，而大模型可以理解自然语言、分析复杂关系、生成洞察报告。将 Neo4j 的图数据能力与 DeepSeek 的语义理解能力结合，你可以构建出前所未有的智能分析系统。

---

## 📖 本章导读

### 一个真实的故事

小刘是一家电商公司的数据分析师。每天，运营经理都会在群里问各种问题：

- "上个月买 iPhone 的用户中，有多少人也买了 AirPods？"
- "这些用户还浏览过哪些商品？"
- "北京地区的用户最喜欢什么品类？"
- "找出那些买了又退的异常用户"

每个问题，小刘都要写 SQL/Cypher 查询、跑数据、整理成报表。一天下来，光回答这些问题就要花 3-4 个小时。

后来，小刘用 Neo4j + DeepSeek 搭建了一个智能问答系统：

```
运营经理问："上个月买 iPhone 的用户还喜欢什么？"
  ↓
DeepSeek 自动生成 Cypher 查询
  ↓
Neo4j 执行查询，返回数据
  ↓
DeepSeek 把数据转成自然语言回答
  ↓
"上个月购买 iPhone 的 1,234 位用户中，有 45% 也购买了 AirPods，
 30% 浏览了 MacBook Air，最受欢迎的三个配件是..."
```

现在，运营经理可以直接在群里问问题，系统自动回答。小刘从"查数工具人"变成了"系统架构师"。

**这就是 Neo4j + DeepSeek 的威力——让数据从"被动查询"变成"主动智能"。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **理解 LLM + 图数据库的集成架构** — 知道各个组件如何协同工作
2. **实现 NL2Cypher** — 让 DeepSeek 自动将自然语言转为 Cypher 查询
3. **构建知识图谱增强 RAG** — 从 Neo4j 检索图上下文，提升 LLM 回答质量
4. **实现图分析智能体** — DeepSeek 自动选择图算法并解读结果
5. **优化 Prompt 和成本** — 让系统更准确、更省钱

---

## 🧠 核心概念详解

### 为什么需要 LLM + 图数据库？

**传统 BI 的困境**：

| 问题 | 说明 |
|------|------|
| **预设报表** | 只能回答"设计好的问题"，新问题需要重新开发 |
| **技术门槛** | 运营/产品人员不会写 Cypher，依赖技术人员 |
| **缺乏洞察** | 数据是"冷"的，需要人工分析才能变成洞察 |
| **响应慢** | 从提问到拿到答案，平均需要 2-4 小时 |

**LLM + 图数据库的解法**：

| 能力 | 说明 |
|------|------|
| **自然语言接口** | 直接问"谁和谁有关系？"，不需要写查询 |
| **自动分析** | LLM 自动选择分析策略，生成洞察报告 |
| **实时响应** | 从提问到回答，平均 3-5 秒 |
| **知识增强** | 图数据提供结构化知识，LLM 提供语义理解 |

### 四大核心能力详解

#### 能力1：NL2Cypher — 自然语言转 Cypher 查询

**工作原理**：

```
用户问题 → [Schema上下文 + Few-shot示例] → DeepSeek → Cypher查询 → Neo4j执行 → 结果
```

**关键组件**：

1. **Schema 上下文**：告诉 DeepSeek 数据库中有哪些标签、属性、关系类型
2. **Few-shot 示例**：给 DeepSeek 几个"问题→Cypher"的例子，让它学会模式
3. **结果格式化**：将查询结果转成自然语言

**Schema 上下文示例**：
```
数据库中有以下标签和关系：
- User: {userId, name, email, age, city}
- Product: {productId, name, price, category, stock}
- Order: {orderId, totalAmount, status, createdAt}
- User -[:PLACED]-> Order
- Order -[:INCLUDES {qty}]-> Product
```

**Few-shot 示例**：
```
用户问题: "谁买了 iPhone？"
Cypher: MATCH (u:User)-[:PLACED]->(:Order)-[:INCLUDES]->(p:Product {name: "iPhone"}) RETURN u.name

用户问题: "北京用户最喜欢什么商品？"
Cypher: MATCH (u:User {city: "北京"})-[:PLACED]->(:Order)-[:INCLUDES]->(p:Product) RETURN p.name, count(*) AS sales ORDER BY sales DESC LIMIT 5
```

#### 能力2：知识图谱增强 RAG

**什么是 RAG？**

RAG（Retrieval-Augmented Generation）是一种让 LLM 基于**外部知识**回答问题的技术。传统 LLM 只能基于训练数据回答，而 RAG 让 LLM 先检索相关知识，再基于这些知识生成回答。

**图增强 RAG 的优势**：

```
传统 RAG：从向量数据库检索相似文本片段
  → 只能找到"文字上相似"的内容
  → 无法理解实体之间的关系

图增强 RAG：从 Neo4j 检索图上下文
  → 能找到"结构上相关"的内容
  → 可以遍历关系链，找到间接关联
```

**工作流程**：

```
用户问题
  ↓
1. 从 Neo4j 检索相关图数据
   - 实体关系（谁和谁有关联）
   - 路径信息（如何连接）
   - 统计信息（数量、分布）
  ↓
2. 将图数据注入 DeepSeek
   - 作为上下文的一部分
   - 让 LLM 基于真实数据回答
  ↓
3. DeepSeek 生成回答
   - 基于图数据 + 自身知识
   - 回答更准确、更有数据支撑
```

#### 能力3：图分析智能体

**工作原理**：

```
用户任务 → DeepSeek 分析任务类型 → 选择分析策略 → 执行图查询 → DeepSeek 解读结果
```

**分析策略选择**：

| 任务类型 | 选择策略 | 执行算法 |
|---------|---------|---------|
| "找出关键人物" | 中心性分析 | PageRank / Degree Centrality |
| "发现用户群组" | 社区检测 | Louvain / Label Propagation |
| "分析关系路径" | 路径分析 | shortestPath / 变长路径 |
| "检测异常模式" | 模式匹配 | 三角关系检测 / 环检测 |
| "了解整体情况" | 统计汇总 | count / 聚合查询 |

#### 能力4：向量 + 图混合检索

**为什么需要混合检索？**

- **向量检索**：找到"语义相似"的内容（如"手机"和"移动设备"）
- **图检索**：找到"结构相关"的内容（如"买了 iPhone 的人也买了 AirPods"）
- **混合检索**：两者结合，既理解语义又理解关系

**架构**：

```
用户问题
  ↓
┌─────────────────────────────────────┐
│ 混合检索                            │
│                                     │
│  向量检索（语义相似）                │
│  ┌─────────────────────────────┐    │
│  │ 问题 → Embedding → 向量搜索 │    │
│  └──────────┬──────────────────┘    │
│             ↓                       │
│  图检索（结构相关）                  │
│  ┌─────────────────────────────┐    │
│  │ 实体 → 图遍历 → 关系路径    │    │
│  └──────────┬──────────────────┘    │
│             ↓                       │
│  结果融合 → 排序 → 返回             │
└─────────────────────────────────────┘
  ↓
DeepSeek 生成回答
```

---

## 🛠️ 动手实践

### 第一步：配置 DeepSeek API Key

```bash
cd demos/11-deepseek-integration

# 设置 API Key（替换为你的真实 Key）
$env:DEEPSEEK_API_KEY="your-actual-api-key"
```

### 第二步：启动

```bash
docker compose up -d
docker exec -it neo4j-deepseek cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第三步：访问 Web 界面

打开 http://localhost:5001，你会看到一个交互式问答界面。

**快速示例**：
1. 点击"谁掌握了Neo4j？" → 系统自动生成 Cypher 并执行
2. 点击"分析团队中的关键人物" → 系统运行图算法并解读
3. 点击"我们的团队在技术栈上有什么优势？" → 系统检索图数据并生成分析报告

### 第四步：API 调用

```bash
# NL2Cypher：自然语言转查询
curl -X POST http://localhost:5001/nl2cypher \
  -H "Content-Type: application/json" \
  -d '{"question": "谁掌握了Neo4j？"}'

# 智能问答：自动判断类型
curl -X POST http://localhost:5001/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Alice和谁合作过？"}'

# 图分析：自动选择算法
curl -X POST http://localhost:5001/analyze \
  -H "Content-Type: application/json" \
  -d '{"task": "分析团队中的关键人物"}'
```

---

## 🧠 Prompt 工程最佳实践

### Schema 上下文怎么写效果最好？

**不好的写法**：
```
数据库中有 User、Product、Order 等标签。
```

**好的写法**：
```
数据库 Schema：
标签: User
  属性: userId (String), name (String), email (String), age (Integer), city (String)
  关系: -[:PLACED]-> Order, -[:BROWSED]-> Product

标签: Product
  属性: productId (String), name (String), price (Float), category (String)
  关系: <-[:INCLUDES]- Order

标签: Order
  属性: orderId (String), totalAmount (Float), status (String), createdAt (DateTime)
  关系: <-[:PLACED]- User, -[:INCLUDES]-> Product
```

**关键点**：
- 明确标注属性类型（String/Integer/Float）
- 明确标注关系方向（`->` 或 `<-`）
- 包含关系属性（如 `INCLUDES {qty}`）

### Few-shot 示例怎么选？

**原则**：
1. **覆盖常见模式**：精确匹配、路径查询、聚合查询各一个
2. **使用真实数据**：示例中的标签名、属性名要和实际数据一致
3. **由简到难**：先给简单示例，再给复杂示例

**示例选择策略**：

| 模式 | 示例问题 | 对应 Cypher |
|------|---------|------------|
| 精确匹配 | "谁掌握了Neo4j？" | `MATCH (e)-[:KNOWS]->(t {name:"Neo4j"})` |
| 路径查询 | "FastAPI依赖哪些技术？" | `MATCH (f)-[:DEPENDS_ON*]->(t)` |
| 聚合查询 | "统计每种技术的数量" | `MATCH (n) RETURN labels(n), count(*)` |
| 关系查询 | "Alice和谁合作过？" | `MATCH (e)-[:COLLABORATES_WITH]->(other)` |

### 温度参数怎么调？

| 温度 | 效果 | 适用场景 |
|------|------|---------|
| 0.0 - 0.1 | 确定性高，每次输出相同 | NL2Cypher（需要精确的 Cypher） |
| 0.2 - 0.3 | 略有变化，但基本稳定 | 结果解读、分析报告 |
| 0.5 - 0.7 | 创造性高，每次不同 | 头脑风暴、建议生成 |

---

## 💰 成本优化策略

### Token 消耗分析

| 操作 | 输入 Token | 输出 Token | 单次成本（约） |
|------|-----------|-----------|--------------|
| NL2Cypher（简单） | 500-800 | 50-100 | ¥0.003 |
| NL2Cypher（复杂） | 1000-2000 | 100-200 | ¥0.008 |
| RAG 查询 | 2000-4000 | 200-500 | ¥0.015 |
| 图分析+解读 | 3000-5000 | 500-1000 | ¥0.02 |

### 优化策略

#### 1. 缓存 Schema 上下文

**问题**：每次 NL2Cypher 都查询 Schema，浪费 Token。

**优化**：
```python
# 缓存 Schema，每小时刷新一次
schema_cache = None
schema_cache_time = 0

def get_schema():
    global schema_cache, schema_cache_time
    if time.time() - schema_cache_time > 3600:  # 1 小时过期
        schema_cache = build_schema_context()
        schema_cache_time = time.time()
    return schema_cache
```

#### 2. 精简 Few-shot 示例

**问题**：示例太多，输入 Token 太大。

**优化**：只保留 3-5 个最相关的示例，覆盖最常见的查询模式。

#### 3. 使用短模型名

**问题**：长模型名可能对应更贵的模型。

**优化**：使用 `deepseek-chat`（性价比最高）。

#### 4. 结果缓存

**问题**：相同的问题反复查询。

**优化**：
```python
# 缓存查询结果
query_cache = {}

def cached_query(question):
    if question in query_cache:
        return query_cache[question]
    result = execute_query(question)
    query_cache[question] = result
    return result
```

---

## ⚠️ 常见误区

### 误区1：Schema 上下文太简略

**问题**：只给标签名不给属性，DeepSeek 生成的 Cypher 可能使用不存在的属性。

**正确做法**：提供完整的 Schema，包括标签、属性名、属性类型、关系类型和方向。

### 误区2：温度设置过高

**问题**：NL2Cypher 使用高温度（如 0.7），每次生成的 Cypher 都不一样，可能生成错误的查询。

**正确做法**：NL2Cypher 使用 0.0-0.1 温度，结果解读使用 0.2-0.3 温度。

### 误区3：没有错误处理

**问题**：DeepSeek 生成的 Cypher 可能语法错误或逻辑错误，直接执行会报错。

**正确做法**：
```python
try:
    result = db.query(cypher)
except Exception as e:
    # 把错误信息返回给 DeepSeek，让它修正
    corrected = call_deepseek(f"查询出错: {e}，请修正", question)
    result = db.query(corrected)
```

### 误区4：忽略 Token 成本

**问题**：不加限制地调用 DeepSeek，月底发现账单很高。

**正确做法**：
- 缓存 Schema 和查询结果
- 限制每次调用的 max_tokens
- 设置月度预算上限

---

## 💭 思考题

1. 如果要让 NL2Cypher 支持"查询上个月的数据"，Few-shot 示例应该怎么设计？
2. 图增强 RAG 和传统向量 RAG 相比，各有什么优缺点？什么场景下该用哪个？
3. 如果 DeepSeek 生成的 Cypher 查询报错了，应该怎么处理？设计一个错误恢复流程。

---

## 📚 扩展阅读

- [DeepSeek API 文档](https://platform.deepseek.com/docs) — API 调用指南
- [Neo4j + LLM 集成指南](https://neo4j.com/developer/llm/) — 官方 LLM 集成方案
- [LangChain + Neo4j 集成](https://python.langchain.com/docs/integrations/graphs/neo4j_cypher/) — 使用 LangChain 简化集成
- [RAG 最佳实践](https://neo4j.com/developer-blog/knowledge-graph-rag/) — 知识图谱 RAG 实战

---

## 🏃 运行命令速查

```bash
# 设置 API Key
$env:DEEPSEEK_API_KEY="your-api-key"

# 启动
docker compose up -d
docker exec -it neo4j-deepseek cypher-shell -u neo4j -p password123 -f /init.cypher

# 访问 Web 界面
# http://localhost:5001

# API 调用
curl -X POST http://localhost:5001/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "谁掌握了Neo4j？"}'

# 停止
docker compose down -v
```
