# 第11章 供应链与网络拓扑分析

供应链管理是企业运营的核心命脉，而现代供应链的全球化、复杂化使得传统的表格分析难以为继。当一家 Tier-3 供应商的工厂因自然灾害停产，影响会在几天内沿着供应网络传播到最终产品交付。本章将深入探讨如何使用 Amazon Neptune 图数据库对供应链进行建模、分析和可视化，从底层数据模型到高级风险分析，构建完整的供应链智能分析体系。

---

## 11.1 供应链关系建模

### 11.1.1 解决的问题

传统供应链管理依赖关系型数据库中的多表 JOIN 来追踪供应商关系。当需要回答"某零件的三级供应商是谁"或"哪些最终产品受到某原材料短缺影响"时，SQL 查询需要 5-8 次 JOIN，性能随供应链深度指数级下降。图数据库将供应链中的实体建模为顶点、关系建模为边，使多跳查询成为一次遍历操作，性能与深度无关。

### 11.1.2 核心原理

供应链图模型包含三类核心顶点和四类核心边：

**顶点类型：**
- `Supplier`（供应商）：提供原材料或零部件的企业节点
- `Manufacturer`（制造商）：将原材料加工为成品的节点
- `Distributor`（分销商）：负责仓储和物流分发的节点
- `Retailer`（零售商）：面向终端消费者的销售节点
- `Product`（产品）：最终成品
- `Material`（物料/原材料）：基础原材料或半成品
- `Inventory`（库存）：各节点的库存记录

**边类型：**
- `supplies`：Supplier → Manufacturer/Material，表示供应关系
- `manufactures`：Manufacturer → Product，表示生产制造关系
- `distributes`：Manufacturer/Distributor → Distributor/Retailer，表示分销关系
- `sells`：Distributor/Retailer → Product，表示销售关系
- `contains`：Product → Material，表示 BOM（物料清单）关系
- `stored_at`：Inventory → 任意节点，表示库存位置

### 11.1.3 代码/配置实现

**数据模型定义（Gremlin Schema）：**

```groovy
// 创建顶点标签
schema.propertyKey('name').Text().ifNotExists().create()
schema.propertyKey('type').Text().ifNotExists().create()
schema.propertyKey('tier').Int().ifNotExists().create()
schema.propertyKey('capacity').Int().ifNotExists().create()
schema.propertyKey('quantity').Int().ifNotExists().create()
schema.propertyKey('leadTime').Int().ifNotExists().create()
schema.propertyKey('riskScore').Float().ifNotExists().create()
schema.propertyKey('location').Text().ifNotExists().create()
schema.propertyKey('category').Text().ifNotExists().create()
schema.propertyKey('unit').Text().ifNotExists().create()

schema.vertexLabel('Supplier').properties('name', 'tier', 'capacity', 'riskScore', 'location').ifNotExists().create()
schema.vertexLabel('Manufacturer').properties('name', 'capacity', 'location').ifNotExists().create()
schema.vertexLabel('Distributor').properties('name', 'capacity', 'location').ifNotExists().create()
schema.vertexLabel('Retailer').properties('name', 'location').ifNotExists().create()
schema.vertexLabel('Product').properties('name', 'category', 'unit').ifNotExists().create()
schema.vertexLabel('Material').properties('name', 'category', 'unit').ifNotExists().create()
schema.vertexLabel('Inventory').properties('quantity', 'unit').ifNotExists().create()

// 创建边标签
schema.edgeLabel('supplies').ifNotExists().create()
schema.edgeLabel('manufactures').ifNotExists().create()
schema.edgeLabel('distributes').ifNotExists().create()
schema.edgeLabel('sells').ifNotExists().create()
schema.edgeLabel('contains').ifNotExists().create()
schema.edgeLabel('stored_at').ifNotExists().create()
```

**数据加载（Python + Gremlin）：**

```python
import json
from gremlin_python.driver import client, serializer
from gremlin_python.driver.protocol import GremlinServerError

class SupplyChainGraphLoader:
    def __init__(self, endpoint, port=8182):
        self.client = client.Client(
            f'wss://{endpoint}:{port}/gremlin', 'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )

    def _submit(self, query, bindings=None):
        try:
            result = self.client.submit(query, bindings or {})
            return result.all().result()
        except GremlinServerError as e:
            print(f"Gremlin error: {e}")
            raise

    def add_supplier(self, supplier_id, name, tier, capacity, location):
        query = (
            f"g.addV('Supplier')"
            f".property('id', '{supplier_id}')"
            f".property('name', '{name}')"
            f".property('tier', {tier})"
            f".property('capacity', {capacity})"
            f".property('location', '{location}')"
        )
        self._submit(query)

    def add_product_with_bom(self, product_id, product_name, materials):
        query = f"g.addV('Product').property('id', '{product_id}').property('name', '{product_name}')"
        self._submit(query)
        for mat_id, mat_name, qty in materials:
            mat_query = (
                f"g.addV('Material').property('id', '{mat_id}')"
                f".property('name', '{mat_name}').property('unit', '件')"
            )
            self._submit(mat_query)
            edge_query = (
                f"g.V().has('id', '{product_id}').addE('contains')"
                f".to(g.V().has('id', '{mat_id}'))"
                f".property('quantity', {qty})"
            )
            self._submit(edge_query)

    def add_supply_edge(self, from_id, to_id, lead_time=7):
        query = (
            f"g.V().has('id', '{from_id}').addE('supplies')"
            f".to(g.V().has('id', '{to_id}'))"
            f".property('leadTime', {lead_time})"
        )
        self._submit(query)

    def build_sample_network(self):
        # Tier-3 原材料供应商
        suppliers_t3 = [
            ('S-001', '西部矿业', 3, 50000, '青海'),
            ('S-002', '北方化工', 3, 30000, '辽宁'),
            ('S-003', '南方稀土', 3, 20000, '江西'),
            ('S-004', '华东电子', 3, 40000, '上海'),
        ]
        # Tier-2 零部件供应商
        suppliers_t2 = [
            ('S-005', '精密轴承厂', 2, 15000, '江苏'),
            ('S-006', '鸿基电子', 2, 12000, '广东'),
            ('S-007', '天工铸造', 2, 10000, '河北'),
        ]
        # Tier-1 直接供应商
        suppliers_t1 = [
            ('S-008', '动力总成公司', 1, 8000, '浙江'),
            ('S-009', '电子系统公司', 1, 6000, '广东'),
        ]
        # 制造商
        manufacturers = [
            ('M-001', '重工机械', 5000, '湖南'),
            ('M-002', '精密仪器集团', 3000, '江苏'),
        ]
        # 分销商
        distributors = [
            ('D-001', '华东物流中心', 10000, '上海'),
            ('D-002', '华南物流中心', 8000, '广州'),
        ]
        # 零售商
        retailers = [
            ('R-001', '工业品商城', '北京'),
            ('R-002', '设备大卖场', '深圳'),
        ]
        # 产品
        products = [
            ('P-001', '工业机器人'),
            ('P-002', '数控机床'),
        ]

        for sid, sn, st, sc, sl in suppliers_t3:
            self.add_supplier(sid, sn, st, sc, sl)
        for sid, sn, st, sc, sl in suppliers_t2:
            self.add_supplier(sid, sn, st, sc, sl)
        for sid, sn, st, sc, sl in suppliers_t1:
            self.add_supplier(sid, sn, st, sc, sl)
        for mid, mn, mc, ml in manufacturers:
            self._submit(
                f"g.addV('Manufacturer').property('id', '{mid}')"
                f".property('name', '{mn}').property('capacity', {mc})"
                f".property('location', '{ml}')"
            )
        for did, dn, dc, dl in distributors:
            self._submit(
                f"g.addV('Distributor').property('id', '{did}')"
                f".property('name', '{dn}').property('capacity', {dc})"
                f".property('location', '{dl}')"
            )
        for rid, rn, rl in retailers:
            self._submit(
                f"g.addV('Retailer').property('id', '{rid}')"
                f".property('name', '{rn}').property('location', '{rl}')"
            )
        for pid, pn in products:
            self._submit(
                f"g.addV('Product').property('id', '{pid}').property('name', '{pn}')"
            )

        # 建立供应关系
        # T3 → T2
        self.add_supply_edge('S-001', 'S-005')
        self.add_supply_edge('S-001', 'S-007')
        self.add_supply_edge('S-002', 'S-005')
        self.add_supply_edge('S-003', 'S-006')
        self.add_supply_edge('S-004', 'S-006')
        self.add_supply_edge('S-004', 'S-007')
        # T2 → T1
        self.add_supply_edge('S-005', 'S-008')
        self.add_supply_edge('S-006', 'S-009')
        self.add_supply_edge('S-007', 'S-008')
        self.add_supply_edge('S-007', 'S-009')
        # T1 → Manufacturer
        self.add_supply_edge('S-008', 'M-001')
        self.add_supply_edge('S-009', 'M-001')
        self.add_supply_edge('S-008', 'M-002')
        self.add_supply_edge('S-009', 'M-002')
        # Manufacturer → Distributor
        self._submit(
            "g.V().has('id','M-001').addE('distributes').to(g.V().has('id','D-001'))"
        )
        self._submit(
            "g.V().has('id','M-002').addE('distributes').to(g.V().has('id','D-002'))"
        )
        self._submit(
            "g.V().has('id','M-001').addE('distributes').to(g.V().has('id','D-002'))"
        )
        # Distributor → Retailer
        self._submit(
            "g.V().has('id','D-001').addE('distributes').to(g.V().has('id','R-001'))"
        )
        self._submit(
            "g.V().has('id','D-002').addE('distributes').to(g.V().has('id','R-002'))"
        )
        # Manufacturer → Product
        self._submit(
            "g.V().has('id','M-001').addE('manufactures').to(g.V().has('id','P-001'))"
        )
        self._submit(
            "g.V().has('id','M-002').addE('manufactures').to(g.V().has('id','P-002'))"
        )

        print("示例供应链网络加载完成")
```

### 11.1.4 使用场景

该数据模型适用于以下场景：

- **供应链溯源**：从任一节点出发，向上游追溯原材料来源或向下游追踪产品流向
- **BOM 展开**：从产品出发，递归展开物料清单，计算物料需求总量
- **影响范围分析**：当某节点发生故障时，快速识别所有受影响的下游节点
- **合规审查**：验证供应商是否符合特定标准（如冲突矿产、环保要求）

### 11.1.5 潜在风险与注意事项

- **数据质量**：供应链图模型的质量完全取决于输入数据的准确性。不完整的供应关系会导致分析结果偏差
- **动态性**：供应链关系是动态变化的，需要建立增量更新机制而非全量重建
- **粒度选择**：物料粒度过细会导致图规模爆炸（一个产品可能有数千个物料），需要合理选择抽象层级
- **权限管理**：供应链数据涉及商业机密，Neptune 的 IAM 策略需要精细配置

### 11.1.6 本章小结

供应链图模型将传统的表格关系转化为顶点-边结构，使多跳查询从 O(n) 次 JOIN 降为 O(1) 次遍历。通过合理设计顶点标签和边标签，可以覆盖从原材料到终端消费者的完整价值链。该模型是后续所有分析的基础，其质量直接决定了分析结果的可信度。

---

## 11.2 多层级供应商分析

### 11.2.1 解决的问题

大型制造企业通常拥有数百家直接供应商（Tier-1），而这些供应商背后还有数千家 Tier-2、Tier-3 甚至更深层的供应商。当企业需要了解"某关键零件的二级供应商集中在哪个地区"或"哪些三级供应商同时供应多个一级供应商"时，传统方法需要人工梳理采购台账，耗时数周且容易遗漏。

### 11.2.2 核心原理

多层级供应商分析基于图遍历的广度优先搜索（BFS）和深度优先搜索（DFS）：

- **上游遍历**：从目标节点出发，沿 `supplies` 边的反向方向（`in('supplies')`）逐层向上，每跳代表一个层级
- **下游遍历**：从供应商出发，沿 `supplies` 边正向（`out('supplies')`）逐层向下
- **Tier 识别**：通过记录遍历深度自动标注供应商层级
- **依赖分析**：计算每个上游节点到下游节点的路径数量，量化依赖强度
- **集中度风险**：统计同一层级供应商的地理分布、所有权集中度

### 11.2.3 代码/配置实现

**上游多层级供应商查询：**

```groovy
// 查询制造商 M-001 的所有上游供应商，按层级分组
g.V().has('id', 'M-001')
  .repeat(
    __.in('supplies').simplePath()
  )
  .emit()
  .times(10)  // 最多追溯10层
  .dedup()
  .project('tier', 'supplier', 'location')
    .by(
      // 计算当前节点到起点的距离作为层级
      g.V().has('id', 'M-001')
        .repeat(__.in('supplies').simplePath())
        .until(__.has('id', current))
        .path().count(local).unfold()
    )
    .by('name')
    .by('location')
  .order().by('tier', asc)
```

**Python 实现多层级分析：**

```python
from collections import defaultdict, deque
import networkx as nx
from gremlin_python.process.traversal import P
from gremlin_python.process.graph_traversal import __

class SupplyChainAnalyzer:
    def __init__(self, gremlin_client):
        self.client = gremlin_client

    def get_upstream_tiers(self, node_id, max_depth=10):
        """获取指定节点的所有上游供应商，按层级分组"""
        query = (
            f"g.V().has('id', '{node_id}').repeat("
            f"  __.in('supplies').simplePath()"
            f").emit().times({max_depth}).dedup()"
            f".project('id', 'name', 'tier', 'location')"
            f"  .by('id')"
            f"  .by('name')"
            f"  .by(__.loops().add(1))"
            f"  .by('location')"
        )
        results = self.client.submit(query).all().result()

        tiers = defaultdict(list)
        for r in results:
            tier = r['tier']
            tiers[tier].append({
                'id': r['id'],
                'name': r['name'],
                'location': r['location']
            })
        return dict(sorted(tiers.items()))

    def get_downstream_impact(self, supplier_id, max_depth=10):
        """分析供应商故障的下游影响范围"""
        query = (
            f"g.V().has('id', '{supplier_id}').repeat("
            f"  __.out('supplies', 'distributes', 'manufactures').simplePath()"
            f").emit().times({max_depth}).dedup()"
            f".project('id', 'name', 'label', 'distance')"
            f"  .by('id')"
            f"  .by('name')"
            f"  .by(__.label())"
            f"  .by(__.loops().add(1))"
        )
        return self.client.submit(query).all().result()

    def dependency_analysis(self, manufacturer_id):
        """分析制造商对上游供应商的依赖程度"""
        query = (
            f"g.V().has('id', '{manufacturer_id}').repeat("
            f"  __.in('supplies').simplePath()"
            f").emit().times(10).dedup()"
            f".group().by('name')"
            f"  .by(__.inE('supplies').count())"
        )
        return self.client.submit(query).all().result()

    def concentration_risk_by_location(self, tier=2):
        """按地理位置分析供应商集中度风险"""
        query = (
            f"g.V().hasLabel('Supplier').has('tier', {tier})"
            f".group().by('location')"
            f"  .by(__.count())"
        )
        results = self.client.submit(query).all().result()
        total = sum(results[0].values())
        risk_report = {}
        for location, count in results[0].items():
            ratio = count / total
            risk_score = ratio * 100
            risk_report[location] = {
                'count': count,
                'ratio': f"{ratio:.1%}",
                'risk_score': round(risk_score, 1),
                'risk_level': '高' if risk_score > 50 else '中' if risk_score > 30 else '低'
            }
        return risk_report

    def shared_supplier_analysis(self):
        """识别同时供应多个下游客户的共享供应商"""
        query = (
            f"g.V().hasLabel('Supplier')"
            f".where(__.out('supplies').count().is(P.gte(2)))"
            f".project('supplier', 'supply_count', 'customers')"
            f"  .by('name')"
            f"  .by(__.out('supplies').count())"
            f"  .by(__.out('supplies').values('name').fold())"
        )
        return self.client.submit(query).all().result()

    def build_networkx_graph(self, center_node_id, depth=5):
        """将 Neptune 子图导出为 NetworkX 图对象进行本地分析"""
        query = (
            f"g.V().has('id', '{center_node_id}').repeat("
            f"  __.bothE().bothV().simplePath()"
            f").times({depth}).dedup()"
            f".project('v', 'e')"
            f"  .by(__.elementMap())"
            f"  .by(__.bothE().elementMap().fold())"
        )
        results = self.client.submit(query).all().result()

        G = nx.DiGraph()
        for row in results:
            v = row['v']
            vid = v['id']
            G.add_node(vid, label=v.get('label', ''), name=v.get('name', ''))
            for e in row['e']:
                eid = e['id']
                out_v = e['outV']
                in_v = e['inV']
                G.add_edge(out_v, in_v, id=eid, label=e.get('label', ''))
        return G

    def tier_dependency_matrix(self, manufacturer_id):
        """生成层级依赖矩阵"""
        tiers = self.get_upstream_tiers(manufacturer_id)
        matrix = []
        for tier_num, suppliers in tiers.items():
            for s in suppliers:
                matrix.append({
                    'tier': tier_num,
                    'supplier': s['name'],
                    'location': s['location'],
                    'manufacturer': manufacturer_id
                })
        return matrix

    def critical_path_analysis(self, from_id, to_id):
        """分析两个节点之间的关键供应路径"""
        query = (
            f"g.V().has('id', '{from_id}')"
            f".repeat(__.in('supplies').simplePath())"
            f".until(__.has('id', '{to_id}'))"
            f".path()"
            f".project('path', 'length')"
            f"  .by(__.unfold().values('name').fold())"
            f"  .by(__.count(local))"
        )
        return self.client.submit(query).all().result()
```

**集中度风险分析示例：**

```python
analyzer = SupplyChainAnalyzer(client)

# 分析 Tier-2 供应商的地理集中度
risk_report = analyzer.concentration_risk_by_location(tier=2)
print("Tier-2 供应商地理集中度风险：")
for loc, info in risk_report.items():
    print(f"  {loc}: {info['count']}家 ({info['ratio']}), "
          f"风险评分: {info['risk_score']}, 等级: {info['risk_level']}")

# 识别共享供应商
shared = analyzer.shared_supplier_analysis()
print("\n共享供应商（单点故障风险）：")
for s in shared:
    print(f"  {s['supplier']} → 供应 {s['supply_count']} 家客户: {s['customers']}")

# 生成依赖矩阵
matrix = analyzer.tier_dependency_matrix('M-001')
print("\n层级依赖矩阵：")
print(f"{'层级':<6} {'供应商':<16} {'地区':<10} {'制造商':<10}")
print("-" * 42)
for row in matrix:
    print(f"{row['tier']:<6} {row['supplier']:<16} {row['location']:<10} {row['manufacturer']:<10}")
```

### 11.2.4 使用场景

- **供应商尽职调查**：在新供应商准入时，自动识别其上游依赖关系，评估潜在风险
- **供应链审计**：定期扫描多层级供应商网络，发现异常依赖或过度集中
- **合规追溯**：从最终产品出发，追溯所有上游供应商，确保符合法规要求
- **并购评估**：分析目标公司的供应链结构，识别整合风险

### 11.2.5 潜在风险与注意事项

- **遍历深度限制**：实际供应链可能超过 10 层，需要设置合理的 `times()` 限制并处理截断警告
- **环路检测**：供应链中可能存在循环供应关系（如回收材料），必须使用 `simplePath()` 防止无限循环
- **数据时效性**：供应商层级会随时间变化，分析结果需要标注时间戳
- **性能优化**：超过 5 层的全图遍历可能消耗大量资源，建议使用 `withSideEffect` 缓存中间结果

### 11.2.6 本章小结

多层级供应商分析是供应链管理的核心能力。通过图遍历的 BFS/DFS 机制，可以在毫秒级完成传统方法需要数天的层级识别和依赖分析。集中度风险分析和共享供应商识别能够提前预警潜在的单点故障风险，为供应链韧性建设提供数据支撑。

---

## 11.3 瓶颈识别与替代路径

### 11.3.1 解决的问题

供应链网络中的瓶颈节点是指那些一旦失效就会导致大范围供应中断的关键节点。传统方法依赖业务专家的经验判断，主观性强且容易遗漏。同时，当瓶颈节点出现问题时，如何快速找到替代供应路径也是供应链韧性管理的核心挑战。

### 11.3.2 核心原理

瓶颈识别和替代路径分析基于以下图论算法：

- **介数中心性（Betweenness Centrality）**：衡量一个节点在多少条最短路径上经过。介数越高的节点，在网络中的"桥梁"作用越关键，失效后的影响范围越大
- **K-最短路径（K-Shortest Paths）**：寻找两个节点之间的前 K 条最短路径，用于发现替代供应路线
- **单点故障分析（SPOF）**：识别那些删除后会导致网络分裂的节点（割点/关节点）
- **路径多样性评分**：衡量两个节点之间是否存在足够多的独立路径

### 11.3.3 代码/配置实现

**介数中心性计算（Neptune 内置算法）：**

```groovy
// 使用 Neptune 的内置 betweenness centrality 算法
// 注意：需要 Neptune 引擎支持
g.call('neptune.algo.betweennessCentrality', {
  "vertexIds": g.V().hasLabel('Supplier').id().fold().next(),
  "direction": "BOTH",
  "sampling": 0.1  // 采样比例，大图使用采样提高性能
})
  .project('vertexId', 'centrality')
    .by(__.select('vertexId'))
    .by(__.select('value'))
  .order().by('centrality', desc)
  .limit(10)
```

**Python 实现瓶颈分析：**

```python
import networkx as nx
from itertools import islice

class BottleneckAnalyzer:
    def __init__(self, gremlin_client):
        self.client = gremlin_client

    def betweenness_centrality(self, graph: nx.DiGraph):
        """计算有向图的介数中心性"""
        bc = nx.betweenness_centrality(graph, k=min(100, len(graph.nodes())),
                                       normalized=True)
        sorted_nodes = sorted(bc.items(), key=lambda x: x[1], reverse=True)
        return sorted_nodes

    def find_bottlenecks(self, graph: nx.DiGraph, top_n=10):
        """识别瓶颈节点"""
        bc = self.betweenness_centrality(graph)
        bottlenecks = []
        for node, score in bc[:top_n]:
            node_data = graph.nodes[node]
            bottlenecks.append({
                'node': node,
                'name': node_data.get('name', node),
                'label': node_data.get('label', ''),
                'betweenness': round(score, 4),
                'risk_level': '严重' if score > 0.3 else '高' if score > 0.15 else '中' if score > 0.05 else '低'
            })
        return bottlenecks

    def k_shortest_paths(self, graph: nx.DiGraph, source, target, k=5):
        """寻找 K 条最短路径（Yen 算法）"""
        try:
            paths = list(islice(
                nx.shortest_simple_paths(graph, source, target), k
            ))
            result = []
            for i, path in enumerate(paths):
                path_info = {
                    'rank': i + 1,
                    'length': len(path) - 1,
                    'nodes': path,
                    'names': [graph.nodes[n].get('name', n) for n in path]
                }
                result.append(path_info)
            return result
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    def find_alternative_supply_paths(self, manufacturer_id, supplier_id, k=5):
        """查找从供应商到制造商的所有替代路径"""
        query = (
            f"g.V().has('id', '{supplier_id}')"
            f".repeat(__.out('supplies').simplePath())"
            f".until(__.has('id', '{manufacturer_id}'))"
            f".limit({k * 10})"
            f".path()"
            f".project('path', 'length')"
            f"  .by(__.unfold().values('name').fold())"
            f"  .by(__.count(local))"
        )
        results = self.client.submit(query).all().result()
        # 按路径长度排序，取前 K 条
        results.sort(key=lambda x: x['length'])
        return results[:k]

    def articulation_points(self, graph: nx.DiGraph):
        """识别割点（单点故障）"""
        # 将有向图转为无向图进行割点分析
        undirected = graph.to_undirected()
        if not nx.is_connected(undirected):
            components = list(nx.connected_components(undirected))
            print(f"图包含 {len(components)} 个连通分量")
            # 对每个连通分量分别计算
            all_aps = set()
            for comp in components:
                subgraph = undirected.subgraph(comp)
                if len(subgraph) > 1:
                    aps = nx.articulation_points(subgraph)
                    all_aps.update(aps)
            return all_aps
        else:
            return nx.articulation_points(undirected)

    def path_diversity_score(self, graph: nx.DiGraph, source, target):
        """计算路径多样性评分（0-1），衡量替代路径的丰富程度"""
        try:
            paths = list(islice(
                nx.shortest_simple_paths(graph, source, target), 10
            ))
            if not paths:
                return 0.0

            # 计算路径之间的节点重叠度
            total_overlap = 0
            pair_count = 0
            for i in range(len(paths)):
                for j in range(i + 1, len(paths)):
                    set_i = set(paths[i][1:-1])  # 排除起点和终点
                    set_j = set(paths[j][1:-1])
                    if len(set_i) == 0 and len(set_j) == 0:
                        overlap = 1.0
                    else:
                        overlap = len(set_i & set_j) / max(len(set_i | set_j), 1)
                    total_overlap += overlap
                    pair_count += 1

            avg_overlap = total_overlap / max(pair_count, 1)
            # 多样性评分 = 1 - 平均重叠度
            diversity = 1.0 - avg_overlap
            return round(diversity, 4)

        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return 0.0

    def single_point_of_failure_analysis(self, graph: nx.DiGraph):
        """全面的单点故障分析"""
        aps = self.articulation_points(graph)
        spof_report = []
        for node in aps:
            node_data = graph.nodes[node]
            # 计算该节点承载的供应关系数量
            in_degree = graph.in_degree(node)
            out_degree = graph.out_degree(node)
            spof_report.append({
                'node': node,
                'name': node_data.get('name', node),
                'label': node_data.get('label', ''),
                'in_degree': in_degree,
                'out_degree': out_degree,
                'total_connections': in_degree + out_degree,
                'risk': '严重' if (in_degree + out_degree) > 5 else '高'
            })
        return sorted(spof_report, key=lambda x: x['total_connections'], reverse=True)

    def full_bottleneck_report(self, graph: nx.DiGraph, manufacturer_node=None):
        """生成完整的瓶颈分析报告"""
        report = {}

        # 1. 介数中心性瓶颈
        report['bottlenecks'] = self.find_bottlenecks(graph)

        # 2. 割点分析
        report['spof'] = self.single_point_of_failure_analysis(graph)

        # 3. 如果指定了制造商，分析其到所有上游供应商的路径多样性
        if manufacturer_node:
            upstream_nodes = [
                n for n in graph.predecessors(manufacturer_node)
            ]
            diversity_scores = []
            for supplier in upstream_nodes:
                score = self.path_diversity_score(graph, supplier, manufacturer_node)
                diversity_scores.append({
                    'supplier': graph.nodes[supplier].get('name', supplier),
                    'diversity_score': score,
                    'risk': '低' if score > 0.5 else '中' if score > 0.2 else '高'
                })
            report['path_diversity'] = diversity_scores

        return report
```

**替代路径发现示例：**

```python
analyzer = BottleneckAnalyzer(client)

# 从 Neptune 导出子图
G = analyzer.build_networkx_graph('M-001', depth=5)

# 寻找从 S-001（西部矿业）到 M-001（重工机械）的替代路径
paths = analyzer.k_shortest_paths(G, 'S-001', 'M-001', k=3)
print("从西部矿业到重工机械的替代路径：")
for p in paths:
    print(f"  路径 #{p['rank']} (长度 {p['length']}):")
    print(f"    {' → '.join(p['names'])}")

# 路径多样性评分
diversity = analyzer.path_diversity_score(G, 'S-001', 'M-001')
print(f"\n路径多样性评分: {diversity} (1=完全独立, 0=完全重叠)")

# 单点故障分析
spof = analyzer.single_point_of_failure_analysis(G)
print("\n单点故障节点：")
for s in spof:
    print(f"  {s['name']} ({s['label']}) - "
          f"连接数: {s['total_connections']}, 风险: {s['risk']}")

# 完整报告
report = analyzer.full_bottleneck_report(G, 'M-001')
print("\n瓶颈节点 Top 5：")
for b in report['bottlenecks'][:5]:
    print(f"  {b['name']}: 介数中心性={b['betweenness']}, 风险等级={b['risk_level']}")
```

### 11.3.4 使用场景

- **供应链韧性评估**：定期扫描网络瓶颈，评估整体供应链的抗风险能力
- **应急响应**：当某供应商出现问题时，快速计算替代路径和切换成本
- **供应商组合优化**：根据路径多样性评分，优化供应商组合，降低单一依赖
- **网络设计**：在供应链设计阶段，通过瓶颈分析优化网络拓扑结构

### 11.3.5 潜在风险与注意事项

- **介数中心性的计算成本**：全图介数中心性计算复杂度为 O(V*E)，大图必须使用采样或近似算法
- **路径数量爆炸**：在稠密图中，K-最短路径的搜索空间可能指数级增长，需要设置合理的 K 值和剪枝策略
- **业务约束缺失**：纯拓扑分析不考虑产能约束、质量认证等业务因素，替代路径在业务上可能不可行
- **动态权重**：路径的"最短"应综合考虑距离、时间、成本、风险等多维因素，而非仅跳数

### 11.3.6 本章小结

瓶颈识别和替代路径分析是供应链从"被动响应"转向"主动防御"的关键技术。介数中心性从全局视角识别网络中的关键桥梁节点，K-最短路径提供应急场景下的备选方案，路径多样性评分量化网络的冗余程度。这些图算法共同构成了供应链韧性管理的量化分析基础。

---

## 11.4 网络拓扑可视化

### 11.4.1 解决的问题

供应链网络的复杂性使得纯文本或表格形式的分析结果难以理解和沟通。业务决策者需要直观的图形化展示来快速把握供应链的整体结构、关键节点和潜在风险。同时，分析团队需要将子图导出到专业可视化工具中进行深入探索。

### 11.4.2 核心原理

网络拓扑可视化涉及三个层面：

1. **数据导出**：将 Neptune 中的子图数据导出为标准图交换格式（GraphML、GEXF、JSON）
2. **布局算法**：使用力导向布局（Force-Directed）、层次布局（Hierarchical）或圆形布局展示网络结构
3. **视觉编码**：通过节点大小、颜色、标签等视觉变量编码业务属性（风险等级、层级、类型）

### 11.4.3 代码/配置实现

**Neptune 子图导出：**

```groovy
// 导出以制造商 M-001 为中心、深度为 3 的子图
g.V().has('id', 'M-001')
  .repeat(__.bothE('supplies', 'distributes', 'manufactures')
            .bothV().simplePath())
  .times(3)
  .dedup()
  .elementMap()
```

**Python 可视化工具集：**

```python
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pyvis.network import Network
import json

class SupplyChainVisualizer:
    def __init__(self, graph: nx.DiGraph):
        self.G = graph

    def export_graphml(self, filepath):
        """导出为 GraphML 格式（兼容 Gephi、Cytoscape）"""
        nx.write_graphml(self.G, filepath)
        print(f"GraphML 已导出到 {filepath}")

    def export_gexf(self, filepath):
        """导出为 GEXF 格式（兼容 Gephi）"""
        nx.write_gexf(self.G, filepath)
        print(f"GEXF 已导出到 {filepath}")

    def export_json(self, filepath):
        """导出为自定义 JSON 格式"""
        data = {
            'nodes': [],
            'edges': []
        }
        for n, attrs in self.G.nodes(data=True):
            data['nodes'].append({
                'id': n,
                'name': attrs.get('name', n),
                'label': attrs.get('label', ''),
                'tier': attrs.get('tier', 0),
                'riskScore': attrs.get('riskScore', 0)
            })
        for u, v, attrs in self.G.edges(data=True):
            data['edges'].append({
                'source': u,
                'target': v,
                'label': attrs.get('label', ''),
                'leadTime': attrs.get('leadTime', 0)
            })
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"JSON 已导出到 {filepath}")

    def compute_topology_metrics(self):
        """计算网络拓扑指标"""
        metrics = {}

        # 基础指标
        metrics['node_count'] = self.G.number_of_nodes()
        metrics['edge_count'] = self.G.number_of_edges()

        # 图直径（最长最短路径）
        if nx.is_weakly_connected(self.G):
            try:
                metrics['diameter'] = nx.diameter(self.G.to_undirected())
            except nx.NetworkXError:
                # 不连通图取最大连通分量的直径
                components = list(nx.weakly_connected_components(self.G))
                largest = self.G.subgraph(max(components, key=len))
                metrics['diameter'] = nx.diameter(largest.to_undirected())
                metrics['note'] = '图不连通，直径为最大连通分量直径'
        else:
            metrics['diameter'] = float('inf')

        # 图密度
        metrics['density'] = round(nx.density(self.G), 4)

        # 聚类系数
        undirected = self.G.to_undirected()
        metrics['avg_clustering'] = round(nx.average_clustering(undirected), 4)
        metrics['global_clustering'] = round(nx.transitivity(undirected), 4)

        # 平均路径长度
        if nx.is_weakly_connected(self.G):
            try:
                metrics['avg_path_length'] = round(
                    nx.average_shortest_path_length(self.G.to_undirected()), 2
                )
            except nx.NetworkXError:
                metrics['avg_path_length'] = None
        else:
            metrics['avg_path_length'] = None

        # 度分布统计
        degrees = [d for _, d in self.G.degree()]
        metrics['avg_degree'] = round(sum(degrees) / len(degrees), 2) if degrees else 0
        metrics['max_degree'] = max(degrees) if degrees else 0
        metrics['min_degree'] = min(degrees) if degrees else 0

        # 连通分量
        wcc = list(nx.weakly_connected_components(self.G))
        metrics['weakly_connected_components'] = len(wcc)
        scc = list(nx.strongly_connected_components(self.G))
        metrics['strongly_connected_components'] = len(scc)

        return metrics

    def plot_static(self, figsize=(16, 12), output_path=None):
        """生成静态可视化图"""
        plt.figure(figsize=figsize)

        # 节点颜色映射
        color_map = {
            'Supplier': '#FF6B6B',
            'Manufacturer': '#4ECDC4',
            'Distributor': '#45B7D1',
            'Retailer': '#96CEB4',
            'Product': '#FFEAA7',
            'Material': '#DDA0DD',
            'Inventory': '#98D8C8'
        }

        # 节点大小映射（基于出度+入度）
        degrees = dict(self.G.degree())
        max_deg = max(degrees.values()) if degrees else 1
        node_sizes = [
            300 + 1500 * (degrees[n] / max_deg) for n in self.G.nodes()
        ]

        # 节点颜色
        node_colors = []
        for n in self.G.nodes():
            label = self.G.nodes[n].get('label', '')
            node_colors.append(color_map.get(label, '#CCCCCC'))

        # 布局算法
        pos = nx.spring_layout(self.G, k=2, iterations=50, seed=42)

        # 绘制边
        nx.draw_networkx_edges(
            self.G, pos, alpha=0.3, edge_color='gray',
            arrows=True, arrowsize=15, arrowstyle='->'
        )

        # 绘制节点
        nx.draw_networkx_nodes(
            self.G, pos, node_size=node_sizes,
            node_color=node_colors, alpha=0.9,
            edgecolors='white', linewidths=1.5
        )

        # 绘制标签（仅显示名称）
        labels = {n: self.G.nodes[n].get('name', n) for n in self.G.nodes()}
        nx.draw_networkx_labels(self.G, pos, labels, font_size=8, font_family='SimHei')

        # 图例
        patches = []
        for label, color in color_map.items():
            patches.append(mpatches.Patch(color=color, label=label))
        plt.legend(handles=patches, loc='upper left', fontsize=10)

        plt.title('供应链网络拓扑图', fontsize=16, fontfamily='SimHei')
        plt.axis('off')

        if output_path:
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            print(f"图片已保存到 {output_path}")
        plt.show()

    def plot_interactive(self, output_path='supply_chain.html'):
        """生成交互式 HTML 可视化（基于 PyVis）"""
        net = Network(height='800px', width='100%', directed=True,
                      notebook=False, bgcolor='#FFFFFF', font_color='#333333')

        # 节点颜色映射
        color_map = {
            'Supplier': '#FF6B6B',
            'Manufacturer': '#4ECDC4',
            'Distributor': '#45B7D1',
            'Retailer': '#96CEB4',
            'Product': '#FFEAA7',
            'Material': '#DDA0DD',
        }

        # 添加节点
        for n, attrs in self.G.nodes(data=True):
            label = attrs.get('label', '')
            name = attrs.get('name', n)
            tier = attrs.get('tier', 0)
            risk = attrs.get('riskScore', 0)

            # 节点大小基于度数
            degree = self.G.degree(n)
            size = 15 + 30 * (degree / max(self.G.degree(), key=lambda x: x[1])[1] if self.G.degree() else 1)

            title = f"<b>{name}</b><br>类型: {label}<br>层级: {tier}<br>风险: {risk}"

            net.add_node(
                n, label=name, title=title,
                color=color_map.get(label, '#CCCCCC'),
                size=size,
                borderWidth=2,
                borderWidthSelected=4
            )

        # 添加边
        for u, v, attrs in self.G.edges(data=True):
            edge_label = attrs.get('label', '')
            lead_time = attrs.get('leadTime', 0)
            title = f"关系: {edge_label}<br>前置时间: {lead_time}天"
            net.add_edge(u, v, title=title, label=edge_label,
                         arrows='to', width=2)

        # 物理布局配置
        net.set_options("""
        {
            "physics": {
                "forceAtlas2Based": {
                    "gravitationalConstant": -50,
                    "centralGravity": 0.01,
                    "springLength": 200,
                    "springConstant": 0.08,
                    "damping": 0.4
                },
                "stabilization": {
                    "iterations": 200
                }
            },
            "interaction": {
                "hover": true,
                "tooltipDelay": 200,
                "zoomView": true,
                "dragView": true
            },
            "edges": {
                "smooth": {
                    "type": "continuous",
                    "forceDirection": "none"
                }
            }
        }
        """)

        net.save_graph(output_path)
        print(f"交互式可视化已保存到 {output_path}")

    def extract_subgraph(self, center_node, depth=2, direction='both'):
        """提取以某节点为中心的子图"""
        if direction == 'upstream':
            nodes = {center_node}
            frontier = {center_node}
            for _ in range(depth):
                new_frontier = set()
                for n in frontier:
                    predecessors = list(self.G.predecessors(n))
                    new_frontier.update(predecessors)
                    nodes.update(predecessors)
                frontier = new_frontier
        elif direction == 'downstream':
            nodes = {center_node}
            frontier = {center_node}
            for _ in range(depth):
                new_frontier = set()
                for n in frontier:
                    successors = list(self.G.successors(n))
                    new_frontier.update(successors)
                    nodes.update(successors)
                frontier = new_frontier
        else:
            # BFS 双向
            nodes = {center_node}
            frontier = {center_node}
            visited = {center_node}
            for _ in range(depth):
                new_frontier = set()
                for n in frontier:
                    for neighbor in nx.all_neighbors(self.G, n):
                        if neighbor not in visited:
                            visited.add(neighbor)
                            new_frontier.add(neighbor)
                            nodes.add(neighbor)
                frontier = new_frontier

        subgraph = self.G.subgraph(nodes).copy()
        return subgraph

    def risk_heatmap_visualization(self, output_path='risk_heatmap.html'):
        """生成风险热力图可视化"""
        net = Network(height='800px', width='100%', directed=True,
                      bgcolor='#FFFFFF', font_color='#333333')

        # 风险颜色渐变
        def risk_color(score):
            if score > 0.7:
                return '#FF0000'
            elif score > 0.4:
                return '#FFA500'
            elif score > 0.2:
                return '#FFD700'
            else:
                return '#90EE90'

        for n, attrs in self.G.nodes(data=True):
            risk = attrs.get('riskScore', 0)
            name = attrs.get('name', n)
            label = attrs.get('label', '')
            degree = self.G.degree(n)
            size = 20 + 40 * risk

            title = (
                f"<b>{name}</b><br>"
                f"类型: {label}<br>"
                f"风险评分: {risk:.2f}<br>"
                f"连接数: {degree}"
            )

            net.add_node(
                n, label=name, title=title,
                color=risk_color(risk),
                size=size
            )

        for u, v, attrs in self.G.edges(data=True):
            net.add_edge(u, v, arrows='to', width=2)

        net.set_options("""
        {
            "physics": {
                "forceAtlas2Based": {
                    "gravitationalConstant": -50,
                    "springLength": 200
                },
                "stabilization": {"iterations": 200}
            },
            "interaction": {"hover": true, "tooltipDelay": 200}
        }
        """)

        net.save_graph(output_path)
        print(f"风险热力图已保存到 {output_path}")
```

**拓扑指标计算示例：**

```python
visualizer = SupplyChainVisualizer(G)

# 计算拓扑指标
metrics = visualizer.compute_topology_metrics()
print("=== 供应链网络拓扑指标 ===")
print(f"节点数: {metrics['node_count']}")
print(f"边数: {metrics['edge_count']}")
print(f"图直径: {metrics['diameter']}")
print(f"图密度: {metrics['density']}")
print(f"平均聚类系数: {metrics['avg_clustering']}")
print(f"全局聚类系数: {metrics['global_clustering']}")
print(f"平均路径长度: {metrics['avg_path_length']}")
print(f"平均度数: {metrics['avg_degree']}")
print(f"最大度数: {metrics['max_degree']}")
print(f"弱连通分量数: {metrics['weakly_connected_components']}")
print(f"强连通分量数: {metrics['strongly_connected_components']}")

# 提取上游子图
upstream = visualizer.extract_subgraph('M-001', depth=3, direction='upstream')
print(f"\n上游子图: {upstream.number_of_nodes()} 节点, {upstream.number_of_edges()} 边")

# 导出可视化
visualizer.export_gexf('supply_chain.gexf')
visualizer.plot_interactive('supply_chain.html')
```

### 11.4.4 使用场景

- **供应链全景图**：管理层通过交互式可视化快速了解供应链整体结构
- **风险热力图**：将风险评分映射为节点颜色，直观展示风险分布
- **子图聚焦**：针对特定产品线或地区，提取子图进行深入分析
- **汇报材料**：导出高分辨率静态图用于 PPT 和报告

### 11.4.5 潜在风险与注意事项

- **视觉过载**：超过 200 个节点的全图可视化会变得难以阅读，需要分层展示或使用子图
- **布局稳定性**：力导向布局每次渲染结果不同，生产环境应固定随机种子
- **中文字体**：matplotlib 在非中文系统上需要额外配置中文字体支持
- **性能**：交互式可视化在节点超过 500 时可能出现卡顿，建议使用 Gephi 处理大图

### 11.4.6 本章小结

网络拓扑可视化将抽象的图数据转化为直观的视觉信息，是供应链分析结果落地的关键环节。通过 GraphML/GEXF 导出可以对接专业分析工具，交互式 HTML 可视化适合日常探索，静态图适合汇报场景。拓扑指标（直径、密度、聚类系数）从宏观层面量化网络结构特征，为供应链优化提供量化依据。

---

## 11.5 供应链风险管理系统实战

### 11.5.1 解决的问题

本节将前四节的技术整合为一个完整的供应链风险管理系统。该系统需要实现：统一的数据模型管理、影响分析查询、替代路径发现、风险评分计算，以及基于实时数据的风险预警能力。

### 11.5.2 核心原理

系统架构采用分层设计：

1. **数据层**：Neptune 图数据库存储供应链网络数据
2. **分析层**：Python 分析引擎封装图算法和业务逻辑
3. **API 层**：RESTful API 暴露分析能力
4. **展示层**：交互式可视化前端

风险评分模型综合考虑以下因素：
- 介数中心性（网络结构重要性）
- 供应商层级（越上游影响范围越大）
- 替代路径数量（冗余度）
- 地理集中度（区域风险）
- 产能利用率（供应能力）

### 11.5.3 代码/配置实现

**完整数据模型（Gremlin）：**

```groovy
// 完整的供应链数据模型定义
schema.vertexLabel('Supplier').ifNotExists().create()
schema.vertexLabel('Manufacturer').ifNotExists().create()
schema.vertexLabel('Distributor').ifNotExists().create()
schema.vertexLabel('Retailer').ifNotExists().create()
schema.vertexLabel('Product').ifNotExists().create()
schema.vertexLabel('Material').ifNotExists().create()
schema.vertexLabel('Inventory').ifNotExists().create()
schema.vertexLabel('RiskEvent').ifNotExists().create()
schema.vertexLabel('Contract').ifNotExists().create()

// 风险事件属性
schema.propertyKey('eventType').Text().ifNotExists().create()     // 事件类型
schema.propertyKey('severity').Int().ifNotExists().create()       // 严重程度 1-5
schema.propertyKey('status').Text().ifNotExists().create()        // 状态
schema.propertyKey('timestamp').Text().ifNotExists().create()    // 时间戳
schema.propertyKey('description').Text().ifNotExists().create()   // 描述

// 合同属性
schema.propertyKey('contractValue').Float().ifNotExists().create()
schema.propertyKey('startDate').Text().ifNotExists().create()
schema.propertyKey('endDate').Text().ifNotExists().create()

// 风险事件边
schema.edgeLabel('impacts').ifNotExists().create()
schema.edgeLabel('has_contract').ifNotExists().create()
```

**影响分析查询：**

```groovy
// 查询供应商 S-001 故障对所有下游产品的影响
g.V().has('id', 'S-001')
  .repeat(
    __.out('supplies', 'manufactures', 'distributes', 'sells')
      .simplePath()
  )
  .emit(__.hasLabel('Product'))
  .times(10)
  .hasLabel('Product')
  .dedup()
  .project('product', 'affected_paths', 'distance')
    .by('name')
    .by(
      __.inE('contains').outV()
        .repeat(__.in('manufactures', 'distributes', 'supplies'))
        .until(__.has('id', 'S-001'))
        .path().count(local)
        .fold()
    )
    .by(
      g.V().has('id', 'S-001')
        .repeat(__.out('supplies', 'manufactures', 'distributes', 'sells'))
        .until(__.has('id', current))
        .path().count(local)
    )
```

**Python 风险管理系统：**

```python
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import networkx as nx
import numpy as np

@dataclass
class RiskConfig:
    """风险评分配置"""
    betweenness_weight: float = 0.30
    tier_weight: float = 0.20
    alternative_path_weight: float = 0.25
    concentration_weight: float = 0.15
    capacity_weight: float = 0.10

    # 风险阈值
    critical_threshold: float = 0.75
    high_threshold: float = 0.55
    medium_threshold: float = 0.35

@dataclass
class ImpactResult:
    """影响分析结果"""
    affected_products: List[Dict] = field(default_factory=list)
    affected_manufacturers: List[Dict] = field(default_factory=list)
    total_downstream_nodes: int = 0
    estimated_recovery_time: int = 0
    estimated_financial_impact: float = 0.0

@dataclass
class AlternativePath:
    """替代路径"""
    rank: int = 0
    path: List[str] = field(default_factory=list)
    path_names: List[str] = field(default_factory=list)
    length: int = 0
    total_lead_time: int = 0
    feasibility_score: float = 0.0

class SupplyChainRiskManager:
    def __init__(self, gremlin_client, config: RiskConfig = None):
        self.client = gremlin_client
        self.config = config or RiskConfig()
        self.graph: Optional[nx.DiGraph] = None

    def load_network(self, center_node=None, depth=5):
        """加载供应链网络到本地图对象"""
        if center_node:
            query = (
                f"g.V().has('id', '{center_node}').repeat("
                f"  __.bothE('supplies', 'distributes', 'manufactures', 'sells')"
                f"    .bothV().simplePath()"
                f").times({depth}).dedup()"
                f".project('v', 'e')"
                f"  .by(__.elementMap())"
                f"  .by(__.bothE().elementMap().fold())"
            )
        else:
            query = (
                "g.V().project('v', 'e')"
                "  .by(__.elementMap())"
                "  .by(__.bothE().elementMap().fold())"
            )

        results = self.client.submit(query).all().result()
        self.graph = nx.DiGraph()

        for row in results:
            v = row['v']
            vid = str(v['id'])
            attrs = {k: v for k, v in v.items() if k != 'id'}
            self.graph.add_node(vid, **attrs)
            for e in row['e']:
                eid = str(e['id'])
                out_v = str(e['outV'])
                in_v = str(e['inV'])
                e_attrs = {k: v for k, v in e.items()
                          if k not in ('id', 'outV', 'inV')}
                self.graph.add_edge(out_v, in_v, id=eid, **e_attrs)

        return self.graph

    def impact_analysis(self, failed_node_id: str) -> ImpactResult:
        """影响分析：模拟节点故障的影响范围"""
        result = ImpactResult()

        # 从故障节点出发，向下游遍历
        query = (
            f"g.V().has('id', '{failed_node_id}').repeat("
            f"  __.out('supplies', 'manufactures', 'distributes', 'sells')"
            f"    .simplePath()"
            f").emit().times(15).dedup()"
            f".project('id', 'name', 'label', 'distance')"
            f"  .by('id')"
            f"  .by('name')"
            f"  .by(__.label())"
            f"  .by(__.loops().add(1))"
        )
        downstream = self.client.submit(query).all().result()

        for node in downstream:
            label = node['label']
            if label == 'Product':
                result.affected_products.append(node)
            elif label == 'Manufacturer':
                result.affected_manufacturers.append(node)

        result.total_downstream_nodes = len(downstream)

        # 估算恢复时间（基于受影响路径的平均前置时间）
        lead_times = []
        for node in downstream:
            lt_query = (
                f"g.V().has('id', '{failed_node_id}')"
                f".repeat(__.outE('supplies').inV().simplePath())"
                f".until(__.has('id', '{node['id']}'))"
                f".unfold().values('leadTime').fold()"
            )
            lts = self.client.submit(lt_query).all().result()
            if lts and lts[0]:
                lead_times.extend([int(x) for x in lts[0]])

        result.estimated_recovery_time = max(lead_times) * 2 if lead_times else 30

        # 财务影响估算
        result.estimated_financial_impact = (
            len(result.affected_products) * 50000 +
            len(result.affected_manufacturers) * 200000
        )

        return result

    def find_alternative_paths(self, source_id: str, target_id: str,
                                k: int = 5) -> List[AlternativePath]:
        """发现替代路径"""
        if not self.graph:
            self.load_network(target_id)

        try:
            from itertools import islice
            paths = list(islice(
                nx.shortest_simple_paths(self.graph, source_id, target_id), k
            ))
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

        alternatives = []
        for i, path in enumerate(paths):
            alt = AlternativePath(
                rank=i + 1,
                path=path,
                path_names=[self.graph.nodes[n].get('name', n) for n in path],
                length=len(path) - 1
            )

            # 计算总前置时间
            total_lt = 0
            for j in range(len(path) - 1):
                edge_data = self.graph.get_edge_data(path[j], path[j + 1])
                if edge_data:
                    total_lt += int(edge_data.get('leadTime', 7))
            alt.total_lead_time = total_lt

            # 可行性评分（基于路径长度和前置时间）
            alt.feasibility_score = round(
                1.0 / (1 + 0.1 * alt.length + 0.02 * alt.total_lead_time), 4
            )

            alternatives.append(alt)

        return alternatives

    def risk_scoring(self, node_id: str) -> Dict:
        """对单个节点进行综合风险评分"""
        if not self.graph:
            self.load_network()

        node_data = self.graph.nodes.get(node_id)
        if not node_data:
            return {'error': f'Node {node_id} not found'}

        scores = {}
        reasons = []

        # 1. 介数中心性评分
        bc = nx.betweenness_centrality(self.graph, k=min(100, len(self.graph)))
        bc_score = bc.get(node_id, 0)
        scores['betweenness'] = round(bc_score, 4)
        if bc_score > 0.2:
            reasons.append(f"介数中心性高({bc_score:.3f})，网络桥梁节点")

        # 2. 层级评分（越上游风险越高）
        tier = node_data.get('tier', 0)
        if isinstance(tier, str):
            tier = int(tier)
        tier_score = min(1.0, tier / 5.0)
        scores['tier'] = round(tier_score, 4)
        if tier >= 3:
            reasons.append(f"上游层级(Tier-{tier})，影响范围广")

        # 3. 替代路径评分
        successors = list(self.graph.successors(node_id))
        alt_scores = []
        for succ in successors:
            paths = self.find_alternative_paths(node_id, succ, k=3)
            alt_scores.append(len(paths))
        avg_alternatives = np.mean(alt_scores) if alt_scores else 0
        alt_path_score = max(0, 1.0 - avg_alternatives / 5.0)
        scores['alternative_paths'] = round(alt_path_score, 4)
        if avg_alternatives < 2:
            reasons.append(f"替代路径不足(平均{avg_alternatives:.1f}条)")

        # 4. 集中度评分
        location = node_data.get('location', '')
        if location:
            same_loc_count = sum(
                1 for n, d in self.graph.nodes(data=True)
                if d.get('location') == location and n != node_id
            )
            total_count = max(len(self.graph.nodes()), 1)
            concentration = same_loc_count / total_count
            scores['concentration'] = round(concentration, 4)
            if concentration > 0.1:
                reasons.append(f"地区集中度高({location}: {same_loc_count}家)")
        else:
            scores['concentration'] = 0.0

        # 5. 产能评分
        capacity = node_data.get('capacity', 0)
        if isinstance(capacity, str):
            capacity = int(capacity) if capacity.isdigit() else 0
        capacity_score = max(0, 1.0 - capacity / 100000)
        scores['capacity'] = round(capacity_score, 4)
        if capacity < 10000 and capacity > 0:
            reasons.append(f"产能偏低({capacity})")

        # 综合评分
        total_score = (
            self.config.betweenness_weight * scores['betweenness'] +
            self.config.tier_weight * scores['tier'] +
            self.config.alternative_path_weight * scores['alternative_paths'] +
            self.config.concentration_weight * scores['concentration'] +
            self.config.capacity_weight * scores['capacity']
        )

        # 风险等级
        if total_score >= self.config.critical_threshold:
            level = '严重'
        elif total_score >= self.config.high_threshold:
            level = '高'
        elif total_score >= self.config.medium_threshold:
            level = '中'
        else:
            level = '低'

        return {
            'node_id': node_id,
            'node_name': node_data.get('name', node_id),
            'total_score': round(total_score, 4),
            'risk_level': level,
            'dimension_scores': scores,
            'risk_reasons': reasons
        }

    def batch_risk_scoring(self, label_filter: str = None) -> List[Dict]:
        """批量风险评分"""
        if not self.graph:
            self.load_network()

        nodes_to_score = self.graph.nodes()
        if label_filter:
            nodes_to_score = [
                n for n in self.graph.nodes()
                if self.graph.nodes[n].get('label') == label_filter
            ]

        results = []
        for node in nodes_to_score:
            score = self.risk_scoring(node)
            results.append(score)

        results.sort(key=lambda x: x['total_score'], reverse=True)
        return results

    def risk_alerts(self, threshold: float = 0.55) -> List[Dict]:
        """生成风险预警列表"""
        scores = self.batch_risk_scoring()
        alerts = [s for s in scores if s['total_score'] >= threshold]
        return alerts

    def scenario_simulation(self, failed_node_id: str) -> Dict:
        """场景模拟：节点故障的完整影响评估"""
        print(f"正在模拟 {failed_node_id} 故障场景...")

        # 1. 影响分析
        impact = self.impact_analysis(failed_node_id)

        # 2. 风险评分
        risk = self.risk_scoring(failed_node_id)

        # 3. 寻找替代路径
        alternatives = []
        if self.graph:
            successors = list(self.graph.successors(failed_node_id))
            for succ in successors[:3]:
                paths = self.find_alternative_paths(failed_node_id, succ, k=3)
                alternatives.extend(paths)

        # 4. 生成报告
        report = {
            'simulation_time': datetime.now().isoformat(),
            'failed_node': {
                'id': failed_node_id,
                'name': risk.get('node_name', failed_node_id),
                'risk_score': risk.get('total_score', 0),
                'risk_level': risk.get('risk_level', '未知')
            },
            'impact': {
                'affected_products': [p['name'] for p in impact.affected_products],
                'affected_manufacturers': [m['name'] for m in impact.affected_manufacturers],
                'total_downstream_nodes': impact.total_downstream_nodes,
                'estimated_recovery_days': impact.estimated_recovery_time,
                'estimated_financial_loss': f"¥{impact.estimated_financial_impact:,.0f}"
            },
            'alternatives': [
                {
                    'rank': a.rank,
                    'path': a.path_names,
                    'length': a.length,
                    'lead_time': a.total_lead_time,
                    'feasibility': a.feasibility_score
                }
                for a in alternatives[:5]
            ],
            'recommendations': self._generate_recommendations(risk, impact, alternatives)
        }

        return report

    def _generate_recommendations(self, risk: Dict, impact: ImpactResult,
                                    alternatives: List[AlternativePath]) -> List[str]:
        """生成风险缓解建议"""
        recommendations = []

        if risk.get('risk_level') in ('严重', '高'):
            recommendations.append(
                f"立即关注 {risk.get('node_name')}，风险等级为{risk.get('risk_level')}"
            )

        if impact.affected_products:
            recommendations.append(
                f"受影响产品 {len(impact.affected_products)} 个，建议启动库存缓冲"
            )

        if alternatives:
            best = alternatives[0]
            recommendations.append(
                f"最佳替代路径: {' → '.join(best.path_names[:4])}..."
                f" (前置时间 {best.total_lead_time} 天)"
            )
        else:
            recommendations.append("未发现替代路径，建议开发备选供应商")

        if impact.estimated_financial_impact > 1000000:
            recommendations.append(
                f"预估财务影响超过 ¥1,000,000，建议启动应急预案"
            )

        return recommendations

    def generate_risk_report(self, output_path='risk_report.json'):
        """生成完整风险报告"""
        report = {
            'generated_at': datetime.now().isoformat(),
            'network_summary': {
                'total_nodes': len(self.graph.nodes()) if self.graph else 0,
                'total_edges': len(self.graph.edges()) if self.graph else 0
            },
            'risk_alerts': self.risk_alerts(),
            'top_risks': self.batch_risk_scoring()[:10]
        }

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        return report
```

**系统使用示例：**

```python
# 初始化风险管理系统
config = RiskConfig(
    betweenness_weight=0.30,
    tier_weight=0.20,
    alternative_path_weight=0.25,
    concentration_weight=0.15,
    capacity_weight=0.10
)
manager = SupplyChainRiskManager(client, config)

# 加载网络
manager.load_network('M-001', depth=5)

# 批量风险评分
all_risks = manager.batch_risk_scoring()
print("=== 供应链风险评分 Top 10 ===")
for r in all_risks[:10]:
    print(f"  {r['node_name']:12s} | 评分: {r['total_score']:.3f} | "
          f"等级: {r['risk_level']} | 原因: {'; '.join(r['risk_reasons'][:2])}")

# 场景模拟：供应商 S-001 故障
simulation = manager.scenario_simulation('S-001')
print(f"\n=== 场景模拟: {simulation['failed_node']['name']} 故障 ===")
print(f"影响产品: {simulation['impact']['affected_products']}")
print(f"恢复时间: {simulation['impact']['estimated_recovery_days']} 天")
print(f"财务损失: {simulation['impact']['estimated_financial_loss']}")
print("建议:")
for rec in simulation['recommendations']:
    print(f"  - {rec}")

# 生成完整报告
manager.generate_risk_report('supply_chain_risk_report.json')
```

### 11.5.4 使用场景

- **日常风险监控**：定时扫描供应链网络，自动生成风险预警
- **供应商准入评估**：新供应商加入时自动评估其引入的网络风险
- **应急响应**：供应商突发故障时，快速评估影响并生成应对方案
- **供应链优化**：根据风险评分结果，制定供应商多元化策略

### 11.5.5 潜在风险与注意事项

- **模型过拟合**：风险评分权重需要根据实际业务反馈持续调优，避免过度依赖固定公式
- **数据延迟**：实时分析依赖实时数据，需要建立 CDC（变更数据捕获）机制保持图数据同步
- **误报率**：风险预警需要设置合理的阈值，避免过多误报导致"狼来了"效应
- **计算资源**：全图介数中心性计算在大型网络中资源消耗大，建议使用增量更新或采样

### 11.5.6 本章小结

供应链风险管理系统将图分析能力封装为可落地的业务工具。通过影响分析、替代路径发现、风险评分三大核心功能，系统能够从被动响应转向主动防御。风险评分模型综合考虑网络结构、业务属性和地理分布等多维因素，为供应链管理提供量化决策依据。场景模拟功能使管理者能够在安全环境中测试各种"what-if"假设，提前制定应急预案。

---

## 11.6 供应链风险场景实战

### 11.6.1 解决的问题

理论分析框架需要经过实际场景的检验。本节通过三个典型的供应链风险场景——供应商破产、物流中断、库存短缺传播——展示图数据库在实际危机中的分析能力和决策支持价值。

### 11.6.2 核心原理

每个风险场景都遵循"事件注入 → 影响传播 → 影响评估 → 缓解方案"的分析流程：

- **供应商破产**：删除/禁用供应商节点，观察下游网络的连通性变化
- **物流中断**：阻断特定地理区域的运输边，评估区域隔离的影响
- **库存短缺**：沿 BOM 树向上传播短缺信号，计算缺料影响的产品范围

### 11.6.3 代码/配置实现

**场景一：供应商破产影响分析**

```python
class RiskScenarioSimulator:
    def __init__(self, gremlin_client):
        self.client = gremlin_client

    def supplier_bankruptcy_scenario(self, supplier_id: str):
        """模拟供应商破产场景"""
        print(f"\n{'='*60}")
        print(f"场景一：供应商 {supplier_id} 破产")
        print(f"{'='*60}")

        # 1. 获取供应商信息
        info_query = (
            f"g.V().has('id', '{supplier_id}')"
            f".project('name', 'tier', 'location', 'customers')"
            f"  .by('name')"
            f"  .by('tier')"
            f"  .by('location')"
            f"  .by(__.out('supplies').values('name').fold())"
        )
        info = self.client.submit(info_query).all().result()
        if not info:
            print(f"未找到供应商 {supplier_id}")
            return

        info = info[0]
        print(f"供应商: {info['name']}")
        print(f"层级: Tier-{info['tier']}")
        print(f"所在地: {info['location']}")
        print(f"直接客户: {info['customers']}")

        # 2. 影响范围分析
        impact_query = (
            f"g.V().has('id', '{supplier_id}')"
            f".repeat(__.out('supplies', 'manufactures', 'distributes', 'sells')"
            f"          .simplePath())"
            f".emit().times(10).dedup()"
            f".group().by(__.label())"
            f"  .by(__.values('name').fold())"
        )
        impact = self.client.submit(impact_query).all().result()

        print("\n受影响节点：")
        for label, nodes in impact[0].items():
            print(f"  {label} ({len(nodes)}个): {nodes}")

        # 3. 受影响产品列表
        products_query = (
            f"g.V().has('id', '{supplier_id}')"
            f".repeat(__.out('supplies', 'manufactures', 'distributes', 'sells')"
            f"          .simplePath())"
            f".emit(__.hasLabel('Product')).times(10)"
            f".hasLabel('Product').dedup()"
            f".values('name').fold()"
        )
        products = self.client.submit(products_query).all().result()
        print(f"\n受影响产品: {products[0] if products else []}")

        # 4. 寻找替代供应源
        alt_query = (
            f"g.V().has('id', '{supplier_id}')"
            f".out('supplies').aggregate('customers')"
            f".V().hasLabel('Supplier')"
            f".where(__.without(g.V().has('id', '{supplier_id}')))"
            f".where(__.out('supplies')"
            f"  .where(__.within('customers')))"
            f".dedup()"
            f".project('alternative', 'location', 'shared_customers')"
            f"  .by('name')"
            f"  .by('location')"
            f"  .by(__.out('supplies')"
            f"    .where(__.within('customers'))"
            f"    .values('name').fold())"
        )
        alternatives = self.client.submit(alt_query).all().result()

        if alternatives:
            print("\n潜在替代供应商：")
            for alt in alternatives:
                print(f"  {alt['alternative']} ({alt['location']})")
                print(f"    可供应: {alt['shared_customers']}")
        else:
            print("\n未发现替代供应商，风险极高！")

        # 5. 风险等级评估
        total_products = len(products[0]) if products else 0
        alt_count = len(alternatives)
        if total_products > 5 and alt_count == 0:
            risk_level = "严重"
        elif total_products > 3 or alt_count <= 1:
            risk_level = "高"
        elif total_products > 0:
            risk_level = "中"
        else:
            risk_level = "低"

        print(f"\n风险等级: {risk_level}")
        print(f"关键指标: 影响 {total_products} 个产品, "
              f"替代供应商 {alt_count} 家")

        return {
            'scenario': 'supplier_bankruptcy',
            'supplier': info['name'],
            'risk_level': risk_level,
            'affected_products': products[0] if products else [],
            'alternatives': alternatives,
            'impact_detail': impact[0]
        }
```

**场景二：物流中断分析：**

```python
    def logistics_disruption_scenario(self, location: str):
        """模拟某地区物流中断场景"""
        print(f"\n{'='*60}")
        print(f"场景二：{location} 地区物流中断")
        print(f"{'='*60}")

        # 1. 识别该地区的所有节点
        nodes_query = (
            f"g.V().has('location', '{location}')"
            f".project('id', 'name', 'label', 'tier')"
            f"  .by('id')"
            f"  .by('name')"
            f"  .by(__.label())"
            f"  .by(__.coalesce(__.values('tier'), __.constant(0)))"
        )
        local_nodes = self.client.submit(nodes_query).all().result()

        print(f"\n{location} 的供应链节点 ({len(local_nodes)}个)：")
        for n in local_nodes:
            print(f"  [{n['label']}] {n['name']} (Tier-{n['tier']})")

        # 2. 分析进出该地区的所有供应关系
        edge_query = (
            f"g.V().has('location', '{location}')"
            f".union("
            f"  __.inE('supplies', 'distributes').outV()"
            f"    .has('location', P.neq('{location}'))"
            f"    .project('direction', 'partner', 'partner_loc')"
            f"      .by(__.constant('流入'))"
            f"      .by('name')"
            f"      .by('location'),"
            f"  __.outE('supplies', 'distributes').inV()"
            f"    .has('location', P.neq('{location}'))"
            f"    .project('direction', 'partner', 'partner_loc')"
            f"      .by(__.constant('流出'))"
            f"      .by('name')"
            f"      .by('location')"
            f").dedup()"
        )
        flows = self.client.submit(edge_query).all().result()

        print(f"\n跨区域物流依赖 ({len(flows)}条)：")
        inflows = [f for f in flows if f['direction'] == '流入']
        outflows = [f for f in flows if f['direction'] == '流出']
        print(f"  流入 {location}: {len(inflows)} 条")
        for f in inflows[:5]:
            print(f"    {f['partner']} ({f['partner_loc']}) → {location}")
        print(f"  流出 {location}: {len(outflows)} 条")
        for f in outflows[:5]:
            print(f"    {location} → {f['partner']} ({f['partner_loc']})")

        # 3. 评估中断影响
        # 流入中断：该地区无法获得外部供应
        # 流出中断：外部无法获得该地区的供应
        print(f"\n影响评估：")
        print(f"  流入中断影响: {location} 的 {len(local_nodes)} 个节点无法获得外部物料")
        print(f"  流出中断影响: {len(outflows)} 条供应关系中断")

        # 4. 寻找替代物流路线
        alt_routes = []
        for f in inflows[:3]:
            route_query = (
                f"g.V().has('name', '{f['partner']}')"
                f".repeat(__.out('supplies', 'distributes')"
                f"          .has('location', P.neq('{location}'))"
                f"          .simplePath())"
                f".times(3)"
                f".has('location', '{location}')"
                f".path().limit(3)"
                f".unfold().values('name').fold()"
            )
            routes = self.client.submit(route_query).all().result()
            if routes:
                alt_routes.append({
                    'from': f['partner'],
                    'to': location,
                    'alternative_routes': routes[:2]
                })

        if alt_routes:
            print("\n替代物流路线：")
            for r in alt_routes:
                print(f"  {r['from']} → {location}:")
                for i, route in enumerate(r['alternative_routes']):
                    print(f"    路线 {i+1}: {' → '.join(route)}")

        return {
            'scenario': 'logistics_disruption',
            'location': location,
            'affected_nodes': len(local_nodes),
            'inflow_count': len(inflows),
            'outflow_count': len(outflows),
            'alternative_routes': alt_routes
        }
```

**场景三：库存短缺传播分析：**

```python
    def inventory_shortage_scenario(self, material_id: str, shortage_pct: float = 0.5):
        """模拟原材料短缺的传播效应"""
        print(f"\n{'='*60}")
        print(f"场景三：物料 {material_id} 短缺 {shortage_pct*100:.0f}%")
        print(f"{'='*60}")

        # 1. 获取物料信息
        mat_query = (
            f"g.V().has('id', '{material_id}')"
            f".project('name', 'category', 'unit')"
            f"  .by('name')"
            f"  .by(__.coalesce(__.values('category'), __.constant('未知')))"
            f"  .by(__.coalesce(__.values('unit'), __.constant('件')))"
        )
        mat_info = self.client.submit(mat_query).all().result()
        if not mat_info:
            print(f"未找到物料 {material_id}")
            return

        mat_info = mat_info[0]
        print(f"物料: {mat_info['name']}")
        print(f"类别: {mat_info['category']}")
        print(f"单位: {mat_info['unit']}")

        # 2. 查找使用该物料的所有产品（BOM 展开）
        products_query = (
            f"g.V().has('id', '{material_id}')"
            f".in('contains')"
            f".project('product', 'required_qty')"
            f"  .by('name')"
            f"  .by(__.inE('contains').values('quantity').fold())"
        )
        products = self.client.submit(products_query).all().result()

        print(f"\n使用该物料的产品 ({len(products)}个)：")
        for p in products:
            qty = p['required_qty'][0] if p['required_qty'] else 0
            print(f"  {p['product']} (用量: {qty} {mat_info['unit']}/件)")

        # 3. 短缺传播路径
        print(f"\n短缺传播路径：")
        propagation_query = (
            f"g.V().has('id', '{material_id}')"
            f".repeat(__.in('contains', 'manufactures', 'distributes', 'sells')"
            f"          .simplePath())"
            f".emit().times(8).dedup()"
            f".path().limit(20)"
            f".unfold().values('name').fold()"
        )
        paths = self.client.submit(propagation_query).all().result()

        for i, path in enumerate(paths[:5]):
            print(f"  路径 {i+1}: {' → '.join(path)}")

        # 4. 库存检查
        inventory_query = (
            f"g.V().has('id', '{material_id}')"
            f".in('stored_at')"
            f".project('location', 'quantity')"
            f"  .by(__.in('stored_at').values('name'))"
            f"  .by('quantity')"
        )
        inventories = self.client.submit(inventory_query).all().result()

        if inventories:
            total_stock = sum(
                int(i['quantity']) for i in inventories if i['quantity']
            )
            print(f"\n当前总库存: {total_stock} {mat_info['unit']}")
            print(f"短缺后可用: {int(total_stock * (1 - shortage_pct))} {mat_info['unit']}")
        else:
            print("\n未找到库存记录")
            total_stock = 0

        # 5. 影响量化
        total_demand = sum(
            int(p['required_qty'][0]) for p in products if p['required_qty']
        )
        available = int(total_stock * (1 - shortage_pct))
        if total_demand > 0:
            affected_ratio = 1.0 - (available / total_demand)
            affected_ratio = max(0, min(1, affected_ratio))
            print(f"\n短缺影响量化：")
            print(f"  总需求: {total_demand} {mat_info['unit']}")
            print(f"  可用量: {available} {mat_info['unit']}")
            print(f"  产能影响: {affected_ratio*100:.1f}%")
            print(f"  受影响产品数: {int(len(products) * affected_ratio)}/{len(products)}")

        return {
            'scenario': 'inventory_shortage',
            'material': mat_info['name'],
            'shortage_pct': shortage_pct,
            'affected_products': [p['product'] for p in products],
            'propagation_paths': paths[:5],
            'total_stock': total_stock,
            'impact_ratio': affected_ratio if total_demand > 0 else 0
        }

    def run_all_scenarios(self):
        """运行所有风险场景"""
        results = {}

        # 场景一：供应商破产
        results['bankruptcy'] = self.supplier_bankruptcy_scenario('S-001')

        # 场景二：物流中断
        results['logistics'] = self.logistics_disruption_scenario('广东')

        # 场景三：库存短缺
        results['shortage'] = self.inventory_shortage_scenario('S-001', 0.5)

        # 生成综合报告
        print(f"\n\n{'='*60}")
        print("综合风险评估报告")
        print(f"{'='*60}")

        total_risk_score = 0
        for scenario, result in results.items():
            if result and 'risk_level' in result:
                level_map = {'严重': 5, '高': 4, '中': 3, '低': 1}
                total_risk_score += level_map.get(result.get('risk_level', '低'), 1)

        avg_risk = total_risk_score / max(len(results), 1)
        if avg_risk >= 4:
            overall = "需要立即关注"
        elif avg_risk >= 3:
            overall = "需要持续监控"
        else:
            overall = "风险可控"

        print(f"综合风险等级: {overall}")
        print(f"平均风险评分: {avg_risk:.1f}/5")

        return results
```

**运行所有场景：**

```python
simulator = RiskScenarioSimulator(client)

# 运行所有场景
results = simulator.run_all_scenarios()

# 单独运行特定场景
# simulator.supplier_bankruptcy_scenario('S-001')
# simulator.logistics_disruption_scenario('广东')
# simulator.inventory_shortage_scenario('S-001', 0.5)
```

### 11.6.4 使用场景

- **应急预案制定**：基于场景模拟结果，制定针对性的应急预案
- **保险评估**：量化风险场景的财务影响，为保险投保提供依据
- **供应链审计**：定期运行风险场景，评估供应链韧性变化趋势
- **投资决策**：评估不同供应商策略在风险场景下的表现

### 11.6.5 潜在风险与注意事项

- **场景覆盖度**：实际风险场景远多于本文覆盖的三种，需要根据行业特点扩展
- **连锁反应**：一个风险可能触发连锁反应（如供应商破产导致其上游也破产），模拟需要考虑级联效应
- **数据时效性**：场景分析结果的有效性取决于输入数据的时效性，过时数据会导致误判
- **过度依赖模型**：图模型是现实世界的简化，不能完全替代业务专家的判断

### 11.6.6 本章小结

三个风险场景展示了图数据库在供应链危机管理中的实战价值。供应商破产场景验证了影响范围追溯和替代供应商发现能力；物流中断场景展示了地理维度风险分析和替代路线规划能力；库存短缺场景揭示了短缺信号沿 BOM 树传播的路径和量化影响。这些场景模拟为供应链管理者提供了"数字沙盘"，在真实危机发生前就能测试和优化应对方案。

---

## 附录：本章 Gremlin 查询速查表

| 目的 | 查询 |
|------|------|
| 查询上游供应商 | `g.V().has('id','M-001').repeat(__.in('supplies').simplePath()).emit().times(10).dedup()` |
| 查询下游影响 | `g.V().has('id','S-001').repeat(__.out('supplies','manufactures','distributes').simplePath()).emit().times(10).dedup()` |
| 按层级分组 | `g.V().hasLabel('Supplier').group().by('tier').by(__.count())` |
| 地理集中度 | `g.V().hasLabel('Supplier').has('tier',2).group().by('location').by(__.count())` |
| 共享供应商 | `g.V().hasLabel('Supplier').where(__.out('supplies').count().is(P.gte(2)))` |
| 介数中心性 | `g.call('neptune.algo.betweennessCentrality', {...})` |
| 子图导出 | `g.V().has('id','M-001').repeat(__.bothE().bothV().simplePath()).times(3).dedup().elementMap()` |
| 路径查询 | `g.V().has('id','S-001').repeat(__.out('supplies')).until(__.has('id','M-001')).path()` |
| 风险事件注入 | `g.addV('RiskEvent').property('eventType','bankruptcy').property('severity',5)` |
| 影响关系建立 | `g.V().has('id','S-001').addE('impacts').to(g.V().has('id','P-001'))` |
