# 第12章 供应链与网络拓扑分析：Neo4j 实战

## 12.1 引言

供应链管理（Supply Chain Management, SCM）是现代企业运营的核心命脉。传统上，供应链数据被存储在关系型数据库的二维表中——供应商表、物料表、订单表通过外键关联。然而，真实的供应链本质上是**多对多、多层次、动态演化的网络结构**：一个零部件由多家供应商提供，一家供应商服务于多个客户，原材料经过多级加工最终成为成品。这种天然的图结构使得关系型数据库在处理"三级以上供应商是谁""某个物料断供会影响哪些产品"这类问题时，需要编写大量 JOIN 语句，性能随层级深度指数级下降。

Neo4j 作为原生图数据库，将供应链中的实体建模为节点（Node），将实体间的业务关系建模为关系（Relationship），使得多层级遍历、路径分析、影响范围分析等操作变得直观且高效。本章将系统性地介绍如何使用 Neo4j 构建供应链知识图谱，并基于图算法实现多级供应商分析、瓶颈识别、替代路径发现等核心场景。

为什么选择图数据库而非关系型数据库来处理供应链问题？原因有三。第一，供应链天然是图结构而非表结构，图数据库的查询语言 Cypher 专为路径遍历设计，表达力远超 SQL 的递归 CTE。第二，随着供应链全球化程度加深，供应链网络动辄包含数万节点和数十万关系，图数据库的索引邻接表（Index-Free Adjacency）确保遍历性能不随数据量增长而衰减。第三，图算法（介数中心性、PageRank、社区检测等）为供应链风险管理提供了传统数据库无法企及的分析维度。

---

## 12.2 供应链数据建模

### 12.2.1 核心实体与关系

在供应链网络中，我们需要识别以下核心实体（节点）和关系：

**实体类型：**

| 实体 | 标签 | 属性示例 |
|------|------|----------|
| 企业/公司 | `Company` | name, location, tier, type |
| 物料/零部件 | `Part` | sku, name, category, leadTime |
| 产品 | `Product` | productId, name, category |
| 工厂 | `Plant` | plantCode, location, capacity |
| 仓库 | `Warehouse` | code, location, capacity |
| 订单 | `Order` | orderId, date, quantity, status |

**关系类型：**

| 关系 | 语义 | 属性 |
|------|------|------|
| `SUPPLIES` | A 向 B 供应物料 | unitPrice, leadTime, minOrderQty, reliability |
| `PRODUCES` | 工厂生产产品 | costPerUnit, capacityUsed |
| `CONTAINS` | 产品包含物料 | quantity, isCritical |
| `STORES_AT` | 物料存储在仓库 | stockLevel, safetyStock |
| `LOCATED_AT` | 实体位于地点 | — |
| `ALTERNATIVE_TO` | 替代物料关系 | substitutionCost, leadTimeDiff |

### 12.2.2 建模原则

**原则一：将业务关系显式化为边。** 在关系型数据库中，`supplier_id` 和 `customer_id` 只是外键；在 Neo4j 中，`(:Company)-[:SUPPLIES]->(:Company)` 是一条有语义、可携带属性、可被遍历的边。这种显式化使得"找出所有向 A 公司供货的二级供应商"只需一次图遍历。更重要的是，关系可以携带丰富的属性——价格、交期、可靠性评分、合同编号、有效期等——这些属性在路径分析中可以直接参与计算和过滤。

**原则二：为高频遍历路径创建索引。** 对 `Company.tier`、`Part.category`、`Product.productId` 等常用于过滤条件的属性建立索引，可大幅提升查询性能。Neo4j 支持两种索引类型：范围索引（Range Index）用于数值和日期范围查询，文本索引（Text Index）用于字符串模糊匹配。在供应链场景中，建议为以下属性创建索引：

```cypher
CREATE INDEX company_tier IF NOT EXISTS FOR (c:Company) ON (c.tier);
CREATE INDEX part_sku IF NOT EXISTS FOR (p:Part) ON (p.sku);
CREATE INDEX product_id IF NOT EXISTS FOR (p:Product) ON (p.productId);
CREATE INDEX company_name IF NOT EXISTS FOR (c:Company) ON (c.name);
CREATE INDEX part_category IF NOT EXISTS FOR (p:Part) ON (p.category);
```

**原则三：利用关系属性承载动态数据。** 供应商的报价、交货周期、可靠性评分等随时间变化的数据，应放在关系上而非节点上。这样可以在遍历时直接基于关系属性做过滤和排序。例如，查询"可靠性高于 0.95 的供应商"可以直接在关系层面过滤，无需先加载所有供应商再筛选。

**原则四：使用枚举标签而非属性标记。** 对于有限分类（如供应商层级 0-3），除了使用 `tier` 属性外，还可以考虑使用标签（Label）来标记，如 `:Tier1Supplier`、`:Tier2Supplier`。标签在 Neo4j 中天然带有索引，查询效率更高。但需要注意，过多的标签会增加数据模型的复杂度，建议仅在分类数量固定且查询频率极高时使用。

### 12.2.3 数据模型示例

以下 Cypher 语句创建了一个典型的供应链子图，涵盖从原材料供应商到最终产品的完整链路：

```cypher
// 创建公司节点
CREATE (apple:Company {name: 'Apple Inc.', tier: 0, type: 'OEM', location: 'Cupertino, CA'});
CREATE (foxconn:Company {name: 'Foxconn', tier: 1, type: 'Manufacturer', location: 'Shenzhen, China'});
CREATE (tsmc:Company {name: 'TSMC', tier: 2, type: 'Semiconductor', location: 'Hsinchu, Taiwan'});
CREATE (qualcomm:Company {name: 'Qualcomm', tier: 2, type: 'Chip Designer', location: 'San Diego, CA'});
CREATE (skHynix:Company {name: 'SK Hynix', tier: 3, type: 'Memory Supplier', location: 'Icheon, South Korea'});
CREATE (asml:Company {name: 'ASML', tier: 3, type: 'Equipment Supplier', location: 'Veldhoven, Netherlands'});
CREATE (sunnyOptical:Company {name: 'Sunny Optical', tier: 2, type: 'Lens Supplier', location: 'Yuyao, China'});
CREATE (samsung:Company {name: 'Samsung Display', tier: 2, type: 'Display Manufacturer', location: 'Asan, South Korea'});
CREATE (corning:Company {name: 'Corning Inc.', tier: 3, type: 'Glass Supplier', location: 'Corning, NY'});

// 创建物料节点
CREATE (a17:Part {sku: 'A17-BIONIC', name: 'A17 Bionic Chip', category: 'Processor', leadTime: 12});
CREATE (lpddr5:Part {sku: 'LPDDR5-8GB', name: 'LPDDR5 8GB Memory', category: 'Memory', leadTime: 8});
CREATE (oled:Part {sku: 'OLED-6.1', name: '6.1" OLED Display', category: 'Display', leadTime: 6});
CREATE (cameraLens:Part {sku: 'CAM-TELE-3X', name: '3x Telephoto Lens', category: 'Camera', leadTime: 4});
CREATE (glassSubstrate:Part {sku: 'GLASS-SUB-001', name: 'Display Glass Substrate', category: 'Raw Material', leadTime: 10});
CREATE (batteryCell:Part {sku: 'BAT-LIPO-3200', name: '3200mAh Li-Po Battery', category: 'Battery', leadTime: 5});

// 创建产品节点
CREATE (iphone15:Product {productId: 'IP15-PRO', name: 'iPhone 15 Pro', category: 'Smartphone'});

// 创建供应关系
CREATE (tsmc)-[:SUPPLIES {unitPrice: 150, leadTime: 12, reliability: 0.97}]->(a17);
CREATE (skHynix)-[:SUPPLIES {unitPrice: 25, leadTime: 8, reliability: 0.95}]->(lpddr5);
CREATE (qualcomm)-[:SUPPLIES {unitPrice: 12, leadTime: 6, reliability: 0.93}]->(lpddr5);
CREATE (sunnyOptical)-[:SUPPLIES {unitPrice: 8, leadTime: 4, reliability: 0.96}]->(cameraLens);
CREATE (foxconn)-[:SUPPLIES {unitPrice: 30, leadTime: 2, reliability: 0.99}]->(oled);
CREATE (samsung)-[:SUPPLIES {unitPrice: 35, leadTime: 3, reliability: 0.98}]->(oled);
CREATE (corning)-[:SUPPLIES {unitPrice: 5, leadTime: 10, reliability: 0.94}]->(glassSubstrate);
CREATE (samsung)-[:SUPPLIES {unitPrice: 15, leadTime: 4, reliability: 0.97}]->(batteryCell);

// 创建产品组成关系
CREATE (a17)-[:CONTAINS {quantity: 1, isCritical: true}]->(iphone15);
CREATE (lpddr5)-[:CONTAINS {quantity: 1, isCritical: true}]->(iphone15);
CREATE (cameraLens)-[:CONTAINS {quantity: 1, isCritical: false}]->(iphone15);
CREATE (oled)-[:CONTAINS {quantity: 1, isCritical: true}]->(iphone15);
CREATE (glassSubstrate)-[:CONTAINS {quantity: 2, isCritical: false}]->(oled);
CREATE (batteryCell)-[:CONTAINS {quantity: 1, isCritical: true}]->(iphone15);

// 创建上游供应关系（三级及以上）
CREATE (asml)-[:SUPPLIES {unitPrice: 5000000, leadTime: 52, reliability: 0.90}]->(tsmc);
```

这个数据模型涵盖了从三级供应商（ASML 的光刻机、Corning 的玻璃基板）到最终产品（iPhone 15 Pro）的完整链路，为后续的多级分析提供了基础。

### 12.2.4 建模中的常见陷阱

**陷阱一：将供应链层级硬编码为节点属性。** 供应商的层级（tier）不是固定不变的——一家公司可能同时是一级供应商（直接向 OEM 供货）和二级供应商（通过中间商向 OEM 供货）。正确的做法是不存储层级属性，而是在查询时通过路径长度动态计算层级。

**陷阱二：忽略时间维度。** 供应链关系随时间变化——供应商合同有有效期，物料清单（BOM）会变更。如果不在模型中考虑时间，历史追溯分析将无法进行。建议在关系上添加 `validFrom` 和 `validTo` 属性，查询时加入时间过滤条件。

**陷阱三：过度规范化。** 图数据库不需要像关系型数据库那样进行范式化设计。将地址、联系方式等低频查询信息直接作为节点属性存储，比创建独立的地址节点更高效。

---

## 12.3 多级供应商分析

### 12.3.1 问题定义

多级供应商分析（Multi-Tier Supplier Analysis）是供应链管理中最常见的图分析场景。典型问题包括：

- "iPhone 15 Pro 的三级供应商有哪些？"
- "从原材料到成品的完整供应链路径是什么？"
- "某个二级供应商的交付可靠性如何影响最终产品？"
- "哪些供应商同时出现在多条供应链中？"

在关系型数据库中，这类查询需要递归 CTE（Common Table Expression），语法复杂且性能随层级增加而急剧下降。在 Neo4j 中，可变长度路径遍历（Variable-Length Path Traversal）是原生操作，语法简洁且性能稳定。

### 12.3.2 向上游追溯：查找所有供应商

```cypher
// 查找 iPhone 15 Pro 的所有直接和间接供应商（向上游追溯）
MATCH path = (p:Product {productId: 'IP15-PRO'})
      <-[:CONTAINS*1..]-(:Part)
      <-[:SUPPLIES*1..]-(supplier:Company)
RETURN p.name AS product,
       supplier.name AS supplier,
       supplier.tier AS tier,
       length(path) AS hops
ORDER BY tier;
```

**结果解读：** 该查询从产品节点出发，沿 `CONTAINS` 和 `SUPPLIES` 关系向上游遍历，不限层级深度（`*1..` 表示至少一跳，无上限）。返回结果按层级排序，清晰展示完整的供应商树。`length(path)` 返回路径中的关系数量，可以反映供应商与产品之间的"距离"。

### 12.3.3 按层级分组统计

```cypher
// 按层级统计供应商数量
MATCH (p:Product {productId: 'IP15-PRO'})
      <-[:CONTAINS*1..]-(:Part)
      <-[:SUPPLIES*1..]-(supplier:Company)
RETURN supplier.tier AS tier,
       count(DISTINCT supplier) AS supplierCount,
       collect(DISTINCT supplier.name) AS suppliers
ORDER BY tier;
```

这个查询的输出可以直观地展示供应链的宽度和深度。如果某一层级的供应商数量过少，说明该层级存在集中度风险。

### 12.3.4 向下游追溯：影响范围分析

当某个供应商出现问题时，我们需要知道哪些产品会受到影响。这是供应链风险管理中最关键的查询之一：

```cypher
// 如果 TSMC 停产，哪些产品会受影响？
MATCH path = (tsmc:Company {name: 'TSMC'})
      -[:SUPPLIES*1..]->(:Part)
      -[:CONTAINS*1..]->(product:Product)
RETURN product.name AS affectedProduct,
       length(path) AS distance,
       nodes(path) AS supplyChain
ORDER BY distance;
```

**扩展分析：** 我们还可以进一步量化影响程度。如果 TSMC 停产 30 天，哪些产品会面临缺货风险？这需要结合库存数据和交期信息：

```cypher
// 量化影响：TSMC 停产 30 天的影响范围
MATCH path = (tsmc:Company {name: 'TSMC'})
      -[s:SUPPLIES*1..]->(part:Part)
      -[c:CONTAINS*1..]->(product:Product)
WITH product, part, tsmc,
     reduce(totalLead = 0, r IN relationships(path) |
       totalLead + CASE WHEN type(r) = 'SUPPLIES' THEN r.leadTime ELSE 0 END
     ) AS totalLeadTime
WHERE totalLeadTime > 30
RETURN product.name AS product,
       part.name AS part,
       totalLeadTime AS daysToImpact
ORDER BY totalLeadTime;
```

### 12.3.5 关键路径识别

并非所有供应链路径都同等重要。结合关系属性，我们可以识别出最关键（成本最高、交期最长、风险最大）的路径：

```cypher
// 找出成本最高的供应链路径
MATCH path = (p:Product {productId: 'IP15-PRO'})
      <-[:CONTAINS*1..]-(part:Part)
      <-[s:SUPPLIES*1..]-(supplier:Company)
RETURN p.name AS product,
       reduce(totalCost = 0, r IN relationships(path) |
         totalCost + CASE WHEN type(r) = 'SUPPLIES' THEN r.unitPrice ELSE 0 END
       ) AS totalCost,
       [node IN nodes(path) | node.name] AS supplyChain
ORDER BY totalCost DESC
LIMIT 5;
```

这里使用 `reduce` 函数累加路径上所有 `SUPPLIES` 关系的 `unitPrice`，找出成本最高的供应链路径。类似地，我们可以找出交期最长的路径：

```cypher
// 找出交期最长的供应链路径
MATCH path = (p:Product {productId: 'IP15-PRO'})
      <-[:CONTAINS*1..]-(:Part)
      <-[s:SUPPLIES*1..]-(:Company)
RETURN p.name AS product,
       reduce(totalLead = 0, r IN relationships(path) |
         totalLead + CASE WHEN type(r) = 'SUPPLIES' THEN r.leadTime ELSE 0 END
       ) AS totalLeadTime,
       [node IN nodes(path) | node.name] AS supplyChain
ORDER BY totalLeadTime DESC
LIMIT 5;
```

### 12.3.6 供应商重叠分析

一个供应商可能同时服务于多条供应链。识别这些重叠供应商有助于评估"单点故障"风险：

```cypher
// 找出同时为多个产品供货的供应商
MATCH (supplier:Company)-[:SUPPLIES]->(:Part)-[:CONTAINS]->(product:Product)
WITH supplier, collect(DISTINCT product.name) AS products, count(DISTINCT product) AS productCount
WHERE productCount > 1
RETURN supplier.name AS supplier,
       productCount AS servesProducts,
       products
ORDER BY productCount DESC;
```

---

## 12.4 瓶颈识别

### 12.4.1 什么是供应链瓶颈

供应链瓶颈是指那些在供应网络中具有**高中心性**的节点——它们连接了大量上下游实体，一旦出现问题，影响范围极广。图论中的**介数中心性（Betweenness Centrality）** 是衡量节点在最短路径中"桥梁"作用的核心指标。

在供应链语境下，瓶颈节点通常具有以下特征：
- **独家供应**：某个物料只有一家供应商
- **高集中度**：某个层级只有少数几家供应商
- **地理位置集中**：多家供应商位于同一地区，面临共同的自然灾害或地缘政治风险
- **技术壁垒**：某些关键工艺或材料只有特定供应商掌握

### 12.4.2 使用 Neo4j GDS 计算介数中心性

Neo4j Graph Data Science (GDS) 库提供了高效的图算法实现。以下示例演示如何计算供应链网络的介数中心性：

```cypher
// 1. 将供应链子图投影到内存中
CALL gds.graph.project(
  'supply-chain',
  ['Company', 'Part', 'Product'],
  ['SUPPLIES', 'CONTAINS']
);

// 2. 计算介数中心性
CALL gds.betweenness.stream('supply-chain')
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS entity,
       gds.util.asNode(nodeId).tier AS tier,
       score AS betweennessScore
ORDER BY score DESC
LIMIT 10;
```

**结果分析：** 介数中心性得分最高的节点就是供应链中的关键瓶颈。这些节点往往是：
- 独家供应商（Single Source）
- 关键物料制造商
- 物流枢纽

如果 GDS 库不可用，也可以使用纯 Cypher 实现近似的瓶颈分析：

```cypher
// 使用纯 Cypher 近似计算瓶颈（统计经过每个节点的路径数）
MATCH (p:Product)
MATCH (supplier:Company)
MATCH path = (p)<-[:CONTAINS*1..]-(:Part)<-[:SUPPLIES*1..]-(supplier)
WITH supplier, count(DISTINCT path) AS pathCount
RETURN supplier.name AS supplier,
       supplier.tier AS tier,
       pathCount
ORDER BY pathCount DESC
LIMIT 10;
```

### 12.4.3 度数中心性分析

度数中心性（Degree Centrality）衡量一个节点连接了多少其他节点。在供应链中，高入度意味着该节点依赖大量供应商，高出度意味着该节点服务大量客户。

```cypher
// 计算入度中心性（依赖了多少供应商）
MATCH (c:Company)<-[:SUPPLIES]-(supplier)
RETURN c.name AS company,
       count(supplier) AS supplierCount
ORDER BY supplierCount DESC;

// 计算出度中心性（服务了多少客户）
MATCH (c:Company)-[:SUPPLIES]->(customer)
RETURN c.name AS company,
       count(customer) AS customerCount
ORDER BY customerCount DESC;
```

**实际应用：** 入度中心性高的公司（如大型 OEM 厂商）需要管理复杂的供应商网络，对供应链可视化和管理系统的需求最高。出度中心性高的公司（如大型原材料供应商）一旦出问题，影响面最广，需要重点监控其运营状况。

### 12.4.4 瓶颈的深层含义

瓶颈识别不仅仅是找"连接最多的节点"，更重要的是理解瓶颈的**可替代性**。一个节点即使连接很多，如果存在替代路径，其实际风险也较低。因此，瓶颈识别需要与替代路径分析结合使用。

我们可以将瓶颈分为三类：

1. **结构性瓶颈**：网络拓扑决定了该节点无法绕过。例如，某个关键芯片只有一家晶圆厂能生产。
2. **容量性瓶颈**：虽然存在替代供应商，但替代供应商的产能不足以满足需求。
3. **地理性瓶颈**：节点本身可替代，但所有替代节点位于同一地理区域，面临共同的外部风险。

针对不同类型的瓶颈，需要采取不同的缓解策略。结构性瓶颈需要长期的技术投资或战略储备，容量性瓶颈可以通过供应商开发（Supplier Development）来培育新的供应源，地理性瓶颈则需要地理多样化的采购策略。

---

## 12.5 替代路径与弹性分析

### 12.5.1 替代供应商查找

当主要供应商出现问题时，快速找到替代供应商是供应链弹性的核心能力：

```cypher
// 为 A17 Bionic 芯片寻找替代供应商
MATCH (part:Part {sku: 'A17-BIONIC'})
MATCH (currentSupplier:Company)-[:SUPPLIES]->(part)
MATCH (altSupplier:Company)-[:SUPPLIES]->(part)
WHERE altSupplier <> currentSupplier
RETURN part.name AS part,
       currentSupplier.name AS currentSupplier,
       altSupplier.name AS alternativeSupplier,
       altSupplier.location AS location,
       altSupplier.tier AS tier;
```

如果当前物料没有替代供应商，我们可以进一步查找功能相似的替代物料及其供应商：

```cypher
// 查找功能相似的替代物料
MATCH (part:Part {sku: 'A17-BIONIC'})
MATCH (altPart:Part)
WHERE altPart.category = part.category
  AND altPart.sku <> part.sku
MATCH (altPart)<-[:SUPPLIES]-(altSupplier:Company)
RETURN part.name AS originalPart,
       altPart.name AS alternativePart,
       altSupplier.name AS supplier,
       altSupplier.location AS location
ORDER BY altPart.leadTime;
```

### 12.5.2 物料级替代关系

更复杂的场景是：某个物料本身可以被替代。例如，LPDDR5 内存可以用 LPDDR5X 替代：

```cypher
// 创建替代物料关系
MATCH (lpddr5:Part {sku: 'LPDDR5-8GB'})
MATCH (lpddr5x:Part {sku: 'LPDDR5X-8GB'})
CREATE (lpddr5)-[:ALTERNATIVE_TO {
  substitutionCost: 5,
  leadTimeDiff: 2,
  compatibilityScore: 0.95
}]->(lpddr5x);

// 查询替代路径
MATCH (p:Product {productId: 'IP15-PRO'})
      <-[:CONTAINS]-(originalPart:Part)
MATCH (originalPart)-[:ALTERNATIVE_TO]->(altPart:Part)
MATCH (altPart)<-[:SUPPLIES]-(altSupplier:Company)
RETURN p.name AS product,
       originalPart.name AS originalPart,
       altPart.name AS alternativePart,
       altSupplier.name AS alternativeSupplier,
       altSupplier.location AS location;
```

### 12.5.3 完全替代路径

有时需要找到一条完全绕过某个瓶颈节点的替代供应链路径。这在供应商出现重大事故（如火灾、破产）时尤为关键：

```cypher
// 找到绕过 TSMC 的替代路径
MATCH (p:Product {productId: 'IP15-PRO'})
MATCH (blocked:Company {name: 'TSMC'})

MATCH path = (p)
      <-[:CONTAINS*1..]-(:Part)
      <-[:SUPPLIES*1..]-(supplier:Company)
WHERE NOT blocked IN nodes(path)
  AND supplier <> blocked
RETURN p.name AS product,
       [n IN nodes(path) | n.name] AS alternativeChain,
       length(path) AS hops
ORDER BY hops
LIMIT 5;
```

**进阶用法：** 我们还可以要求替代路径不仅绕过特定节点，还要满足额外的约束条件，如总成本不超过预算、总交期不超过期限等：

```cypher
// 带约束的替代路径查找
MATCH (p:Product {productId: 'IP15-PRO'})
MATCH (blocked:Company {name: 'TSMC'})

MATCH path = (p)
      <-[:CONTAINS*1..]-(:Part)
      <-[s:SUPPLIES*1..]-(supplier:Company)
WHERE NOT blocked IN nodes(path)
  AND supplier <> blocked
WITH path, p,
     reduce(totalCost = 0, r IN relationships(path) |
       totalCost + CASE WHEN type(r) = 'SUPPLIES' THEN r.unitPrice ELSE 0 END
     ) AS totalCost,
     reduce(totalLead = 0, r IN relationships(path) |
       totalLead + CASE WHEN type(r) = 'SUPPLIES' THEN r.leadTime ELSE 0 END
     ) AS totalLeadTime
WHERE totalCost < 200 AND totalLeadTime < 30
RETURN [n IN nodes(path) | n.name] AS alternativeChain,
       totalCost, totalLeadTime
ORDER BY totalCost
LIMIT 5;
```

### 12.5.4 弹性评分

我们可以为每条供应链路径计算弹性评分，综合考虑供应商数量、地理分布、可靠性等因素。弹性评分是一个综合指标，用于量化供应链面对 disruptions 时的恢复能力：

```cypher
// 计算每个物料的供应链弹性评分
MATCH (part:Part)
OPTIONAL MATCH (part)<-[s:SUPPLIES]-(supplier:Company)
WITH part,
     count(s) AS supplierCount,
     avg(s.reliability) AS avgReliability,
     collect(DISTINCT supplier.location) AS locations
WITH part,
     supplierCount,
     avgReliability,
     size(locations) AS geoDiversity,
     // 弹性评分 = 供应商数量 * 0.3 + 平均可靠性 * 0.4 + 地理多样性 * 0.3
     (supplierCount * 0.3 + coalesce(avgReliability, 0) * 0.4 + size(locations) * 0.3) AS resilienceScore
RETURN part.name AS part,
       supplierCount,
       avgReliability,
       geoDiversity,
       round(resilienceScore, 2) AS resilienceScore
ORDER BY resilienceScore ASC;
```

得分最低的物料就是供应链中最脆弱的环节，需要优先建立替代供应渠道。弹性评分还可以进一步扩展，加入更多维度：

- **财务健康度**：供应商的信用评级
- **合规评分**：供应商的环境、社会和治理（ESG）表现
- **历史表现**：过去 12 个月的准时交付率趋势
- **产能利用率**：供应商当前的产能占用情况

### 12.5.5 多源供应策略分析

多源供应（Multi-Sourcing）是提高供应链弹性的重要策略。我们可以用图分析来评估当前的多源供应状况：

```cypher
// 分析每个物料的多源供应情况
MATCH (part:Part)
OPTIONAL MATCH (part)<-[s:SUPPLIES]-(supplier:Company)
WITH part, count(s) AS sourceCount, collect(supplier.name) AS suppliers
RETURN part.name AS part,
       sourceCount,
       CASE
         WHEN sourceCount = 0 THEN '无供应商'
         WHEN sourceCount = 1 THEN '独家供应 - 高风险'
         WHEN sourceCount = 2 THEN '双源供应 - 中等风险'
         ELSE '多源供应 - 低风险'
       END AS riskLevel,
       suppliers
ORDER BY sourceCount;
```

---

## 12.6 供应链管理实现

### 12.6.1 供应商绩效监控

实时监控供应商的交付表现，识别表现下滑的趋势，是供应链运营的核心任务。我们可以将绩效数据建模为时间序列节点，并与供应商关联：

```cypher
// 创建供应商绩效时间序列
CREATE (perf:PerformanceRecord {
  date: date('2025-06-01'),
  onTimeDelivery: 0.95,
  defectRate: 0.02,
  leadTimeCompliance: 0.90
});
MATCH (tsmc:Company {name: 'TSMC'})
MATCH (a17:Part {sku: 'A17-BIONIC'})
MATCH (s:SUPPLIES)-[r:SUPPLIES]->(a17)
CREATE (tsmc)-[:HAS_PERFORMANCE]->(perf);

// 查询供应商绩效趋势
MATCH (c:Company {name: 'TSMC'})-[:HAS_PERFORMANCE]->(perf:PerformanceRecord)
RETURN perf.date AS date,
       perf.onTimeDelivery AS onTimeDelivery,
       perf.defectRate AS defectRate
ORDER BY perf.date;
```

更实用的做法是批量导入历史绩效数据，然后计算趋势指标：

```cypher
// 计算供应商绩效趋势（最近 6 个月）
MATCH (c:Company {name: 'TSMC'})-[:HAS_PERFORMANCE]->(perf:PerformanceRecord)
WHERE perf.date >= date('2025-01-01')
WITH c, perf
ORDER BY perf.date DESC
WITH c, collect(perf) AS records
WITH c,
     records[0].onTimeDelivery AS latestOTD,
     records[0].defectRate AS latestDefect,
     records[5].onTimeDelivery AS previousOTD,
     records[5].defectRate AS previousDefect
RETURN c.name AS supplier,
       latestOTD,
       previousOTD,
       round((latestOTD - previousOTD) * 100, 1) AS otdChangePercent,
       latestDefect,
       previousDefect,
       CASE
         WHEN latestOTD < previousOTD - 0.05 THEN '⚠️ 交付表现下降'
         WHEN latestDefect > previousDefect * 1.2 THEN '⚠️ 缺陷率上升'
         ELSE '✅ 表现稳定'
       END AS alert
```

### 12.6.2 风险传播分析

当某个供应商出现风险（如自然灾害、罢工、破产）时，分析风险如何沿供应链传播是制定应急计划的基础：

```cypher
// 模拟风险传播：从 TSMC 出发，沿供应链向下游传播
MATCH path = (riskSource:Company {name: 'TSMC'})
      -[:SUPPLIES*1..3]->(:Part)
      -[:CONTAINS*1..3]->(downstream)
WHERE downstream:Company OR downstream:Product
RETURN riskSource.name AS riskSource,
       downstream.name AS affectedEntity,
       labels(downstream) AS entityType,
       length(path) AS propagationDepth
ORDER BY propagationDepth;
```

**风险传播的量化分析：** 我们可以进一步量化风险传播的"冲击强度"。假设 TSMC 的供应能力下降 50%，我们可以计算每个下游产品的供应缺口：

```cypher
// 量化风险传播：TSMC 产能下降 50% 的影响
MATCH (tsmc:Company {name: 'TSMC'})
MATCH (tsmc)-[s:SUPPLIES]->(part:Part)
MATCH (part)-[c:CONTAINS]->(product:Product)
WITH product, part, s,
     s.unitPrice AS originalPrice,
     s.unitPrice * 0.5 AS reducedPrice
RETURN product.name AS product,
       part.name AS part,
       originalPrice,
       reducedPrice,
       round((originalPrice - reducedPrice) / originalPrice * 100, 1) AS impactPercent
ORDER BY impactPercent DESC;
```

### 12.6.3 库存优化建议

结合图遍历和库存数据，生成智能补货建议。这是供应链运营中最具实际价值的应用之一：

```cypher
// 识别库存不足的关键物料
MATCH (part:Part)<-[:CONTAINS]-(product:Product)
MATCH (part)<-[:SUPPLIES]-(supplier:Company)
OPTIONAL MATCH (part)-[:STORES_AT]->(wh:Warehouse)
WITH part, product, supplier, wh,
     wh.stockLevel AS stock,
     wh.safetyStock AS safetyStock,
     supplier.leadTime AS leadTime
WHERE stock IS NULL OR stock < safetyStock
RETURN part.name AS part,
       product.name AS product,
       supplier.name AS supplier,
       stock,
       safetyStock,
       leadTime,
       (safetyStock - coalesce(stock, 0)) AS suggestedOrderQty
ORDER BY leadTime DESC;
```

**高级补货建议：** 结合交期和需求预测，生成更精准的补货计划：

```cypher
// 基于交期和需求预测的补货建议
MATCH (part:Part)<-[:CONTAINS]-(product:Product)
MATCH (part)<-[s:SUPPLIES]-(supplier:Company)
OPTIONAL MATCH (part)-[:STORES_AT]->(wh:Warehouse)
WITH part, product, supplier, wh,
     coalesce(wh.stockLevel, 0) AS stock,
     coalesce(wh.safetyStock, 0) AS safetyStock,
     s.leadTime AS leadTime,
     s.reliability AS reliability
// 安全库存 = 日均需求 * 交期 * 安全系数
// 假设日均需求为 1000 件，安全系数为 1.5
WITH part, product, supplier, stock, safetyStock, leadTime, reliability,
     1000 AS dailyDemand,
     1.5 AS safetyFactor
WITH part, product, supplier, stock, safetyStock, leadTime, reliability,
     dailyDemand * leadTime * safetyFactor AS targetStock
WHERE stock < targetStock
RETURN part.name AS part,
       product.name AS product,
       supplier.name AS supplier,
       stock AS currentStock,
       targetStock AS targetStock,
       (targetStock - stock) AS reorderQty,
       leadTime,
       reliability
ORDER BY (targetStock - stock) DESC;
```

### 12.6.4 采购决策支持

当需要为某个物料选择最佳供应商时，可以综合考虑价格、交期、可靠性等多维因素。这是一个典型的多准则决策（MCDM）问题：

```cypher
// 为 A17 Bionic 芯片选择最优供应商
MATCH (part:Part {sku: 'A17-BIONIC'})<-[s:SUPPLIES]-(supplier:Company)
WITH part, supplier, s,
     // 综合评分 = 价格竞争力 * 0.3 + 交期 * 0.3 + 可靠性 * 0.4
     (1 / s.unitPrice * 1000 * 0.3 +
      (1 / s.leadTime) * 10 * 0.3 +
      s.reliability * 0.4) AS compositeScore
RETURN part.name AS part,
       supplier.name AS supplier,
       s.unitPrice AS unitPrice,
       s.leadTime AS leadTimeDays,
       s.reliability AS reliability,
       round(compositeScore, 3) AS score
ORDER BY score DESC;
```

**加权评分模型：** 实际业务中，不同物料对价格、交期、可靠性的敏感度不同。关键物料可能更看重可靠性，而通用物料可能更看重价格。我们可以将权重参数化：

```cypher
// 参数化的供应商评分模型
:param weightPrice => 0.2;
:param weightLeadTime => 0.3;
:param weightReliability => 0.5;

MATCH (part:Part {sku: 'A17-BIONIC'})<-[s:SUPPLIES]-(supplier:Company)
WITH part, supplier, s,
     (1 / s.unitPrice * 1000 * $weightPrice +
      (1 / s.leadTime) * 10 * $weightLeadTime +
      s.reliability * $weightReliability) AS compositeScore
RETURN part.name AS part,
       supplier.name AS supplier,
       s.unitPrice AS unitPrice,
       s.leadTime AS leadTimeDays,
       s.reliability AS reliability,
       round(compositeScore, 3) AS score
ORDER BY score DESC;
```

### 12.6.5 合同合规性检查

供应链管理中，确保供应商的履约行为符合合同约定是一项重要但容易被忽视的工作。我们可以将合同条款建模为图的一部分，实现自动化的合规检查：

```cypher
// 创建合同节点
CREATE (contract:Contract {
  contractId: 'CT-2025-001',
  startDate: date('2025-01-01'),
  endDate: date('2025-12-31'),
  maxUnitPrice: 160,
  minReliability: 0.95,
  maxLeadTime: 14
});

MATCH (tsmc:Company {name: 'TSMC'})
MATCH (a17:Part {sku: 'A17-BIONIC'})
MATCH (tsmc)-[s:SUPPLIES]->(a17)
CREATE (contract)-[:GOVERNS]->(s);

// 检查合同合规性
MATCH (c:Contract {contractId: 'CT-2025-001'})-[g:GOVERNS]->(s:SUPPLIES)
MATCH (supplier)-[s]->(part)
RETURN supplier.name AS supplier,
       part.name AS part,
       s.unitPrice AS actualPrice,
       c.maxUnitPrice AS contractMaxPrice,
       CASE WHEN s.unitPrice > c.maxUnitPrice THEN '❌ 超价' ELSE '✅ 合规' END AS priceCheck,
       s.reliability AS actualReliability,
       c.minReliability AS contractMinReliability,
       CASE WHEN s.reliability < c.minReliability THEN '❌ 可靠性不足' ELSE '✅ 合规' END AS reliabilityCheck,
       s.leadTime AS actualLeadTime,
       c.maxLeadTime AS contractMaxLeadTime,
       CASE WHEN s.leadTime > c.maxLeadTime THEN '❌ 超期' ELSE '✅ 合规' END AS leadTimeCheck
```

---

## 12.7 高级图算法应用

### 12.7.1 社区检测

供应链网络中，社区检测可以揭示隐藏的供应商集群、地理集群或行业集群。Louvain 算法是社区检测中最常用的算法之一：

```cypher
// 使用 Louvain 算法检测供应链社区
CALL gds.graph.project(
  'supply-chain-community',
  ['Company', 'Part'],
  ['SUPPLIES']
);

CALL gds.louvain.stream('supply-chain-community')
YIELD nodeId, communityId
RETURN communityId,
       collect(gds.util.asNode(nodeId).name) AS members,
       count(*) AS memberCount
ORDER BY memberCount DESC;
```

社区检测结果可以帮助采购团队发现：
- **过度依赖同一地理区域的供应商集群**：如果某个社区的所有成员都位于同一国家或地区，该社区面临共同的地缘政治或自然灾害风险。
- **被少数中间商控制的物料集群**：如果某个社区的核心节点是贸易商或分销商，说明该物料类别的供应被少数中间商控制。
- **潜在的共谋风险**：同一社区内的供应商如果频繁出现在同一招标项目中，可能存在协同定价行为。

### 12.7.2 PageRank 与供应商重要性

PageRank 算法最初由 Google 用于网页排名，但在供应链分析中同样有效。它可以评估供应商在整个网络中的相对重要性——不仅考虑节点连接的数量，还考虑连接节点的质量：

```cypher
CALL gds.pageRank.stream('supply-chain')
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS entity,
       gds.util.asNode(nodeId).tier AS tier,
       score AS pageRank
ORDER BY score DESC
LIMIT 10;
```

与介数中心性不同，PageRank 不仅考虑节点在路径中的"桥梁"作用，还考虑其连接节点的质量——被重要节点连接的节点自身也更重要。在供应链中，这意味着：
- 向大型 OEM 直接供货的 Tier 1 供应商会获得较高的 PageRank 分数
- 为这些 Tier 1 供应商供货的 Tier 2 供应商也会获得较高的分数（因为被重要节点连接）
- 这种递归重要性评估比简单的度数中心性更有洞察力

### 12.7.3 最短路径与最优路径

在供应链中，"最短"不一定指地理距离最短，而是综合成本、时间、风险的最优路径。Dijkstra 算法可以找到加权图中的最短路径：

```cypher
// 使用 Dijkstra 算法找成本最低的供应路径
MATCH (source:Company {name: 'ASML'})
MATCH (target:Product {productId: 'IP15-PRO'})

CALL gds.shortestPath.dijkstra.stream('supply-chain', {
  sourceNode: source,
  targetNode: target,
  relationshipWeightProperty: 'unitPrice'
})
YIELD index, sourceNode, targetNode, totalCost, nodeIds, costs
RETURN index,
       [nodeId IN nodeIds | gds.util.asNode(nodeId).name] AS path,
       totalCost;
```

**多目标优化：** 实际业务中，我们往往需要同时优化多个目标（成本、交期、可靠性）。可以通过将多个指标加权合并为一个综合权重来实现：

```cypher
// 使用 GDS 的 mutate 步骤添加综合权重
CALL gds.graph.project(
  'supply-chain-weighted',
  ['Company', 'Part', 'Product'],
  {
    SUPPLIES: {
      properties: {
        compositeWeight: {
          defaultValue: 1.0
        }
      }
    },
    CONTAINS: {
      properties: {
        compositeWeight: {
          defaultValue: 0
        }
      }
    }
  }
);

// 为 SUPPLIES 关系设置综合权重（价格 * 0.4 + 交期 * 0.3 + (1-可靠性) * 0.3）
MATCH (s:Company)-[r:SUPPLIES]->(p:Part)
SET r.compositeWeight = r.unitPrice * 0.4 + r.leadTime * 0.3 + (1 - r.reliability) * 0.3;

// 使用综合权重找最优路径
MATCH (source:Company {name: 'ASML'})
MATCH (target:Product {productId: 'IP15-PRO'})
CALL gds.shortestPath.dijkstra.stream('supply-chain-weighted', {
  sourceNode: source,
  targetNode: target,
  relationshipWeightProperty: 'compositeWeight'
})
YIELD index, sourceNode, targetNode, totalCost, nodeIds
RETURN [nodeId IN nodeIds | gds.util.asNode(nodeId).name] AS optimalPath,
       totalCost AS compositeScore;
```

### 12.7.4 节点删除模拟

模拟移除某个节点（如供应商破产），观察网络连通性的变化，是评估供应链鲁棒性的重要方法：

```cypher
// 模拟移除 TSMC 后的影响
MATCH (removed:Company {name: 'TSMC'})

// 找出所有必须经过 TSMC 才能到达的路径
MATCH (p:Product {productId: 'IP15-PRO'})
MATCH path = (p)<-[:CONTAINS*1..]-(:Part)<-[:SUPPLIES*1..]-(supplier:Company)
WHERE removed IN nodes(path)
  AND NOT EXISTS {
    // 存在绕过 TSMC 的替代路径
    MATCH altPath = (p)<-[:CONTAINS*1..]-(:Part)<-[:SUPPLIES*1..]-(supplier)
    WHERE NOT removed IN nodes(altPath)
  }
RETURN DISTINCT supplier.name AS strandedSupplier,
       supplier.tier AS tier
ORDER BY tier;
```

**批量节点删除模拟：** 更全面的鲁棒性分析可以模拟多个节点同时失效的场景：

```cypher
// 模拟多个供应商同时失效
WITH ['TSMC', 'SK Hynix', 'Corning Inc.'] AS failedSuppliers

// 找出所有受影响的产品
MATCH (p:Product)
MATCH path = (p)<-[:CONTAINS*1..]-(:Part)<-[:SUPPLIES*1..]-(supplier:Company)
WHERE supplier.name IN failedSuppliers
WITH p, collect(DISTINCT supplier.name) AS failedInPath
WHERE size(failedInPath) = size(failedSuppliers)
  // 所有关键供应商都在该产品的供应链中
RETURN p.name AS product,
       failedInPath AS failedSuppliers,
       'CRITICAL' AS impactLevel;
```

### 12.7.5 三角计数与聚类系数

三角计数（Triangle Count）和聚类系数（Clustering Coefficient）可以衡量供应链网络的局部密集程度。高聚类系数意味着供应商之间形成了紧密的合作网络，这既可能意味着高效的协同，也可能意味着共谋风险：

```cypher
// 计算供应链网络的聚类系数
CALL gds.graph.project(
  'supply-chain-triangle',
  ['Company'],
  {SUPPLIES: {orientation: 'UNDIRECTED'}}
);

CALL gds.triangleCount.stream('supply-chain-triangle')
YIELD nodeId, triangleCount, coefficient
RETURN gds.util.asNode(nodeId).name AS company,
       triangleCount,
       round(coefficient, 3) AS clusteringCoefficient
ORDER BY triangleCount DESC
LIMIT 10;
```

---

## 12.8 实战案例：构建完整的供应链管理系统

### 12.8.1 系统架构

一个基于 Neo4j 的供应链管理系统通常包含以下层次：

1. **数据接入层**：从 ERP（如 SAP、Oracle EBS）、SRM（供应商关系管理）系统抽取数据，通过 ETL 管道写入 Neo4j。常用的 ETL 工具包括 Apache NiFi、Talend、以及 Neo4j 自带的 apoc.load 系列函数。

2. **图数据层**：Neo4j 数据库存储供应链知识图谱，包含公司、物料、产品、订单、合同等节点及其关系。这一层负责数据的持久化、索引维护和查询优化。

3. **分析服务层**：封装 Cypher 查询和 GDS 算法，提供 RESTful API 或 GraphQL 接口供上层调用。这一层实现了多级供应商查询、瓶颈识别、替代路径分析等业务逻辑。

4. **应用展示层**：提供可视化仪表板（如 Neo4j Bloom、Grafana 或自定义 Web 应用），将图分析结果以直观的方式呈现给供应链管理人员。

### 12.8.2 数据导入最佳实践

对于大规模供应链数据，逐条 CREATE 效率低下。推荐使用批量导入方式：

```cypher
// 使用 LOAD CSV 批量导入供应商数据
LOAD CSV WITH HEADERS FROM 'file:///suppliers.csv' AS row
MERGE (c:Company {name: row.name})
ON CREATE SET
  c.tier = toInteger(row.tier),
  c.type = row.type,
  c.location = row.location,
  c.country = row.country;

// 批量导入供应关系
LOAD CSV WITH HEADERS FROM 'file:///supply_relations.csv' AS row
MATCH (supplier:Company {name: row.supplier})
MATCH (part:Part {sku: row.partSku})
MERGE (supplier)-[s:SUPPLIES]->(part)
ON CREATE SET
  s.unitPrice = toFloat(row.unitPrice),
  s.leadTime = toInteger(row.leadTime),
  s.reliability = toFloat(row.reliability);
```

对于千万级以上的数据，应使用 Neo4j Admin Import 工具（离线批量导入，速度最快）或 Bulk Import API（在线流式导入）。Admin Import 工具可以直接从 CSV 文件构建数据库文件，导入速度可达每秒百万级节点。

### 12.8.3 供应链仪表板查询集

以下是一组支撑供应链管理仪表板的核心查询：

**概览指标：**

```cypher
// 总供应商数
MATCH (c:Company) RETURN count(c) AS totalSuppliers;

// 按层级分布
MATCH (c:Company)
RETURN c.tier AS tier, count(c) AS count
ORDER BY tier;

// 关键物料数（独家供应）
MATCH (part:Part)
WHERE size((part)<-[:SUPPLIES]-()) = 1
RETURN count(part) AS singleSourceParts;
```

**风险热力图：**

```cypher
// 按国家和层级统计供应商集中度
MATCH (c:Company)
RETURN c.country AS country,
       c.tier AS tier,
       count(c) AS supplierCount
ORDER BY country, tier;
```

**交期分析：**

```cypher
// 最长交期的物料及其供应商
MATCH (s:Company)-[r:SUPPLIES]->(p:Part)
RETURN p.name AS part,
       s.name AS supplier,
       r.leadTime AS leadTimeDays
ORDER BY r.leadTime DESC
LIMIT 10;
```

**供应链深度分析：**

```cypher
// 计算每个产品的供应链深度（最长路径长度）
MATCH (p:Product)
MATCH path = (p)<-[:CONTAINS*1..]-(:Part)<-[:SUPPLIES*1..]-(:Company)
RETURN p.name AS product,
       max(length(path)) AS maxDepth,
       min(length(path)) AS minDepth
ORDER BY maxDepth DESC;
```

### 12.8.4 告警规则实现

将图查询嵌入自动化告警系统，实现主动风险管理。以下是一些实用的告警规则：

```cypher
// 告警规则 1：检测独家供应物料
MATCH (part:Part)
WHERE size((part)<-[:SUPPLIES]-()) = 1
MATCH (part)<-[:SUPPLIES]-(soleSupplier:Company)
MATCH (part)-[:CONTAINS]->(product:Product)
RETURN 'SINGLE_SOURCE_RISK' AS alertType,
       part.name AS part,
       soleSupplier.name AS supplier,
       collect(DISTINCT product.name) AS affectedProducts;

// 告警规则 2：检测地理集中度过高
MATCH (c:Company)
WITH c.country AS country,
     c.tier AS tier,
     count(c) AS count
WHERE count > 5  // 阈值可配置
RETURN 'GEO_CONCENTRATION_RISK' AS alertType,
       country,
       tier,
       count;

// 告警规则 3：检测可靠性下降的供应商
MATCH (c:Company)-[:HAS_PERFORMANCE]->(perf:PerformanceRecord)
WITH c, perf
ORDER BY perf.date DESC
WITH c, collect(perf) AS records
WHERE records[0].onTimeDelivery < 0.85
RETURN 'RELIABILITY_ALERT' AS alertType,
       c.name AS supplier,
       records[0].onTimeDelivery AS currentOTD,
       records[0].date AS asOfDate;

// 告警规则 4：检测供应链深度异常
MATCH (p:Product)
MATCH path = (p)<-[:CONTAINS*1..]-(:Part)<-[:SUPPLIES*1..]-(:Company)
WITH p, max(length(path)) AS maxDepth
WHERE maxDepth > 5
RETURN 'CHAIN_DEPTH_ALERT' AS alertType,
       p.name AS product,
       maxDepth AS depth;
```

### 12.8.5 与外部系统集成

Neo4j 可以通过 JDBC、REST API 或 Kafka 与现有企业系统集成。以下是通过 apoc 库从外部数据库加载数据的示例：

```cypher
// 示例：通过 apoc.load.jdbc 从 ERP 系统加载订单数据
CALL apoc.load.jdbc('jdbc:oracle:thin:@erp-host:1521:orcl',
  'SELECT order_id, supplier_id, part_sku, quantity, order_date FROM purchase_orders',
  []) YIELD row
MERGE (o:Order {orderId: row.order_id})
SET o.quantity = row.quantity,
    o.date = date(row.order_date);
```

**实时数据同步：** 对于需要实时更新的场景，可以使用 Neo4j 的 Kafka 插件或 Change Data Capture（CDC）机制，实现供应链数据的近实时同步：

```cypher
// 通过 apoc.kafka 消费供应链事件
CALL apoc.kafka.consume('supply-chain-events', ['bootstrap.servers=localhost:9092'])
YIELD value
WITH apoc.convert.fromJsonMap(value) AS event
CALL apoc.cypher.doWhen(
  event.type = 'ORDER_CREATED',
  'MERGE (o:Order {orderId: $orderId})
   SET o.quantity = $quantity, o.date = date($date)',
  {orderId: event.orderId, quantity: event.quantity, date: event.date}
)
YIELD value
RETURN value;
```

---

## 12.9 性能优化与最佳实践

### 12.9.1 查询优化策略

1. **使用 Profile 分析查询**：在 Cypher 查询前加上 `PROFILE` 关键字，查看数据库的查询计划，识别全表扫描（NodeByLabelScan）等低效操作。重点关注 `db hits` 指标，数值过高的步骤通常是性能瓶颈所在。

2. **合理使用索引**：为所有参与过滤的属性创建索引。对于复合查询条件，考虑创建复合索引。例如，如果经常按 `category` 和 `leadTime` 同时过滤物料，可以创建复合索引：
   ```cypher
   CREATE INDEX part_category_lead IF NOT EXISTS FOR (p:Part) ON (p.category, p.leadTime);
   ```

3. **限制路径深度**：在可变长度路径中，尽量指定合理的最大深度，避免意外的大范围遍历。例如，`*1..5` 比 `*1..` 更安全，可以防止查询意外遍历整个图。

4. **使用 `DISTINCT` 谨慎**：图遍历可能产生重复路径，但过早使用 `DISTINCT` 可能阻止查询优化器使用索引。建议在查询的最后阶段再使用 `DISTINCT`。

5. **避免在 WHERE 子句中使用函数**：如 `WHERE toUpper(c.name) = 'TSMC'` 会导致索引失效。应确保数据在写入时已规范化，查询时直接使用原始值。

### 12.9.2 数据模型优化

1. **避免过度建模**：不是所有关系都需要建模为边。低频查询的关联可以保留为节点属性。例如，如果很少按"合同"维度查询，可以将合同信息作为关系属性而非独立节点。

2. **合理使用超节点**：某些节点（如大型 OEM 厂商）可能连接数万个关系。对于这类超节点，考虑拆分或使用关系属性过滤。例如，可以在查询时先通过关系属性过滤减少遍历范围：
   ```cypher
   MATCH (oem:Company {name: 'Apple'})-[r:SUPPLIES {year: 2025}]->(part)
   ```

3. **时间维度处理**：供应链数据具有强时间属性。可以使用时间分片（如按月创建关系副本）或属性标记来处理历史数据。对于需要频繁进行时间范围查询的场景，建议在关系上添加 `validFrom` 和 `validTo` 属性并建立索引。

4. **使用命名图缓存**：对于频繁运行的 GDS 算法，将图投影保存为命名图，避免重复投影：
   ```cypher
   CALL gds.graph.project('supply-chain', ...);
   // 后续查询直接使用命名图
   CALL gds.betweenness.stream('supply-chain') ...;
   ```

### 12.9.3 大规模图计算策略

对于超过千万节点的供应链网络：

1. **使用 GDS 的批处理模式**：`gds.betweenness.write` 将结果写回图，避免重复计算。`stream` 模式适合探索性分析，`write` 模式适合生产环境。

2. **子图投影**：只投影需要的节点标签和关系类型，减少内存占用。例如，如果只分析公司之间的供应关系，不需要投影物料和产品节点：
   ```cypher
   CALL gds.graph.project('company-network', 'Company', {SUPPLIES: {orientation: 'UNDIRECTED'}});
   ```

3. **增量更新**：使用 `gds.graph.filter` 在已有投影上添加/删除节点，避免全量重建。对于每日更新的供应链数据，增量更新可以大幅减少计算资源消耗。

4. **分而治之**：对于超大规模的供应链网络，可以按产品线、地理区域或业务单元拆分为多个子图分别分析，最后汇总结果。

---

## 12.10 总结

本章系统性地介绍了使用 Neo4j 进行供应链与网络拓扑分析的方法论和实战技术。核心要点总结如下：

1. **图模型天然匹配供应链结构**：将企业、物料、产品建模为节点，将供应、包含关系建模为边，使得多层级遍历成为原生操作，避免了关系型数据库中递归 JOIN 的性能瓶颈。Cypher 查询语言的路径表达力远超 SQL，使得复杂的供应链分析变得直观可读。

2. **多级供应商分析是图数据库的杀手级应用**：可变长度路径遍历可以在一秒内完成传统 SQL 需要数十秒甚至超时的递归查询，且语法直观易懂。无论是向上游追溯供应商层级，还是向下游分析影响范围，Neo4j 都能提供近乎实时的响应。

3. **瓶颈识别依赖图算法**：介数中心性、PageRank、社区检测等图算法为供应链风险管理提供了量化工具，帮助从"凭经验判断"升级为"数据驱动决策"。这些算法能够揭示肉眼无法发现的隐藏模式和风险点。

4. **替代路径分析保障供应链弹性**：通过图遍历快速发现替代供应商、替代物料和完全绕行路径，是构建弹性供应链的技术基础。结合弹性评分模型，可以量化每个物料和每条供应链的脆弱程度，为风险管理提供优先级排序。

5. **从查询到系统**：将 Cypher 查询封装为告警规则、仪表板指标和决策支持模型，可以构建端到端的供应链智能管理系统。从数据导入、图建模、算法分析到可视化展示，Neo4j 提供了完整的技术栈。

6. **性能优化是生产落地的关键**：合理使用索引、限制路径深度、避免超节点、使用命名图缓存等策略，是确保供应链分析系统在生产环境中稳定运行的必要条件。

供应链网络的复杂性不会消失，但有了图数据库和图分析技术，企业可以将这种复杂性从负担转化为竞争优势。在日益不确定的全球贸易环境中，基于 Neo4j 的供应链智能系统将成为企业数字化运营的核心基础设施。随着供应链可视化、风险预警、智能决策等能力的逐步建设，企业将能够更早地识别风险、更快地响应变化、更精准地优化资源配置，最终实现从"被动应对"到"主动管理"的供应链运营模式升级。

---

## 参考资源

- Neo4j Graph Data Science 官方文档：https://neo4j.com/docs/graph-data-science/current/
- Cypher Query Language 参考：https://neo4j.com/docs/cypher-manual/current/
- 供应链图建模最佳实践：https://neo4j.com/use-cases/supply-chain/
- GDS 算法列表：Betweenness Centrality, PageRank, Louvain, Dijkstra Shortest Path, Triangle Count
- APOC 标准库文档：https://neo4j.com/docs/apoc/current/
- Neo4j 数据导入指南：https://neo4j.com/docs/operations-manual/current/tools/import/
