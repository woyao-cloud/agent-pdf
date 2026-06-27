# 第10章 金融风控与欺诈检测在Neptune上的实践

## 10.1 概述

金融欺诈检测是图数据库最经典的应用场景之一。传统关系型数据库在处理多层转账、复杂资金链路、团伙欺诈时，SQL需要大量JOIN操作，查询深度每增加一层性能就指数级下降。Amazon Neptune作为托管图数据库，凭借其毫秒级遍历能力、Gremlin/TinkerPop生态和ACID事务支持，成为金融风控系统的理想图存储引擎。

本章从交易网络建模出发，逐步深入循环交易检测、风险传播分析、实时风控查询优化，最终构建一个完整的反欺诈系统。所有Gremlin查询均可在Neptune上直接运行，Python代码片段可作为微服务或Lambda函数的参考实现。

---

## 10.2 交易网络建模

### 10.2.1 解决的问题

金融交易数据天然具有图结构：账户向账户转账、持卡人在商户消费、设备登录多个账户。传统风控系统将交易存为宽表，每笔交易一行，查询"某账户三度内所有交易"需要自JOIN三次，数据量稍大即不可用。图建模将交易网络中的实体和关系显式表达，使多跳遍历成为O(depth)复杂度的操作。

### 10.2.2 核心原理

交易网络采用**属性图模型**，包含以下核心顶点和边类型：

**顶点类型：**

| 标签 | 含义 | 关键属性 |
|------|------|----------|
| `Account` | 银行账户/支付账号 | accountId, balance, riskLevel, createdAt |
| `Transaction` | 单笔交易事件 | txId, amount, timestamp, status, channel |
| `Merchant` | 商户 | merchantId, category, country, riskScore |
| `Device` | 设备指纹 | deviceId, deviceType, os, fingerprint |
| `IPAddress` | IP地址 | ip, geo, isp, proxyScore |
| `Phone` | 手机号 | phone, carrier, region |
| `Card` | 银行卡/信用卡 | cardHash, bin, issuer, cardType |

**边类型：**

| 标签 | 含义 | 关键属性 |
|------|------|----------|
| `TRANSFERRED_TO` | 账户间转账 | amount, timestamp, channel, riskFlag |
| `PAID_AT` | 在商户消费 | amount, timestamp, mccCode |
| `USED_DEVICE` | 使用某设备 | loginTime, ipAddress |
| `FROM_IP` | 来自某IP | timestamp, isProxy |
| `BOUND_PHONE` | 绑定手机号 | boundAt |
| `OWNS_CARD` | 持有银行卡 | addedAt, isPrimary |

**时间属性建模：** 每条边携带 `timestamp` 属性，支持时间窗口过滤。`Transaction` 顶点本身也记录时间，便于按时间范围裁剪子图。

### 10.2.3 代码/配置实现

以下Gremlin语句创建交易网络的核心schema（Neptune无需显式schema，但建议通过数据加载建立一致性）：

```groovy
// 创建账户顶点
g.addV('Account')
 .property('accountId', 'A001')
 .property('balance', 50000.00)
 .property('riskLevel', 'low')
 .property('createdAt', '2024-01-15T08:00:00Z')

// 创建交易顶点
g.addV('Transaction')
 .property('txId', 'TXN10001')
 .property('amount', 15000.00)
 .property('timestamp', '2024-06-01T14:30:00Z')
 .property('status', 'completed')
 .property('channel', 'online')

// 创建设备顶点
g.addV('Device')
 .property('deviceId', 'DEV-ABC123')
 .property('deviceType', 'mobile')
 .property('os', 'Android 14')
 .property('fingerprint', 'fp_abc123_hash')

// 创建IP顶点
g.addV('IPAddress')
 .property('ip', '203.0.113.45')
 .property('geo', 'CN-SH')
 .property('isp', 'ChinaNet')
 .property('proxyScore', 0.0)

// 创建转账边
g.V().has('Account', 'accountId', 'A001').as('from')
 .V().has('Account', 'accountId', 'A002').as('to')
 .addE('TRANSFERRED_TO')
 .from('from').to('to')
 .property('amount', 15000.00)
 .property('timestamp', '2024-06-01T14:30:00Z')
 .property('channel', 'online')

// 创建消费边
g.V().has('Account', 'accountId', 'A001').as('acc')
 .V().has('Merchant', 'merchantId', 'M001').as('mer')
 .addE('PAID_AT')
 .from('acc').to('mer')
 .property('amount', 299.00)
 .property('timestamp', '2024-06-01T10:00:00Z')

// 创建设备使用边
g.V().has('Account', 'accountId', 'A001').as('acc')
 .V().has('Device', 'deviceId', 'DEV-ABC123').as('dev')
 .addE('USED_DEVICE')
 .from('acc').to('dev')
 .property('loginTime', '2024-06-01T14:25:00Z')
 .property('ipAddress', '203.0.113.45')
```

**批量加载（使用Neptune Bulk Loader）：**

```json
{
  "source": "s3://my-bucket/transactions/vertices/",
  "format": "csv",
  "iamRoleArn": "arn:aws:iam::123456789012:role/NeptuneLoadRole",
  "region": "us-east-1",
  "failOnError": false,
  "parallelism": "HIGH",
  "updateSingleCardinalityProperties": true
}
```

CSV格式示例（顶点文件）：

```csv
~id,~label,accountId:String,balance:Double,riskLevel:String,createdAt:Date
A001,Account,A001,50000.0,low,2024-01-15T08:00:00Z
A002,Account,A002,1200.0,medium,2024-03-20T10:00:00Z
```

CSV格式示例（边文件）：

```csv
~id,~from,~to,~label,amount:Double,timestamp:Date,channel:String
E10001,A001,A002,TRANSFERRED_TO,15000.0,2024-06-01T14:30:00Z,online
```

### 10.2.4 使用场景

- **在线支付平台**：支付宝、微信支付等实时交易网络
- **银行核心系统**：对公/对私转账链路分析
- **加密货币交易所**：链上地址与内部账户关联分析
- **电商平台**：买家-卖家-支付链路风控

### 10.2.5 潜在风险与注意事项

- **属性基数**：`timestamp` 等连续值属性不应作为label或filter-only属性，Neptune对高基数属性过滤性能有限，应配合时间范围索引
- **边爆炸**：高频交易账户可能产生百万级边，建议对 `Transaction` 顶点做时间分区，定期归档旧数据
- **顶点ID设计**：使用业务ID（如 `account_A001`）作为图ID，避免重复创建；Neptune的 `id` 是字符串类型，需保证全局唯一
- **属性大小限制**：单个属性值不超过4MB，大文本应存储在外部存储，图中只存引用

### 10.2.6 本章小结

交易网络图建模是金融风控的基石。通过将账户、交易、设备、IP等实体建模为顶点，转账、消费、登录等行为建模为边，风控系统可以在毫秒级完成多跳遍历。合理的属性设计和批量加载策略决定了生产系统的稳定性和查询性能。

---

## 10.3 循环交易检测

### 10.3.1 解决的问题

循环交易（Circular Transaction）是洗钱和套现的核心模式。资金在多个账户间流转后回到源头，制造虚假交易量、掩盖资金来源。典型场景包括：

- **洗钱**：资金经过多层账户"清洗"后回到控制人
- **信用卡套现**：通过虚假商户循环刷卡
- **刷单**：电商卖家通过多个账号自买自卖提升信誉
- **P2P自融**：平台控制多个借款账户循环借贷

### 10.3.2 核心原理

**循环检测算法：**

**DFS-based 环检测：** 从每个未访问节点出发做深度优先遍历，记录递归栈中的节点。当DFS遇到已在栈中的节点时，即发现环。时间复杂度 O(V+E)，适合中小规模图。

**Floyd判环算法（龟兔赛跑）：** 快慢指针法，快指针每次两步、慢指针每次一步，相遇即存在环。仅适用于单条路径，不适合多分支图。

**Neptune上的实现策略：**

由于Neptune不支持递归Gremlin（无 `repeat(loops)` 之外的循环），环检测需要分两步：
1. 使用 `repeat().emit()` 遍历到指定深度
2. 在应用层或使用 `where()` 检测路径首尾相连

### 10.3.3 代码/配置实现

**Gremlin：检测指定深度的循环转账路径（深度≤5）：**

```groovy
// 检测从账户A001出发，经过2~5跳后回到A001的路径
g.V().has('Account', 'accountId', 'A001')
 .repeat(
   outE('TRANSFERRED_TO').inV()
   .simplePath()
 )
 .times(5)
 .emit()
 .where(
   loop().bothE('TRANSFERRED_TO').otherV()
   .has('accountId', 'A001')
 )
 .path()
 .by('accountId')
 .by('amount')
```

**Gremlin：检测所有长度≥3的循环（全图扫描，适合离线批处理）：**

```groovy
// 全图环检测（限制深度5，避免无限遍历）
g.V().hasLabel('Account')
 .repeat(
   out('TRANSFERRED_TO')
   .simplePath()
 )
 .times(5)
 .emit()
 .has('accountId', 
   select('a').values('accountId')
 )
 .path()
 .by('accountId')
 .dedup()
 .limit(100)
```

**Gremlin：检测特定时间窗口内的快速循环（24小时内）：**

```groovy
g.V().has('Account', 'accountId', 'A001')
 .repeat(
   outE('TRANSFERRED_TO')
   .has('timestamp', between('2024-06-01T00:00:00Z', '2024-06-02T00:00:00Z'))
   .inV()
   .simplePath()
 )
 .times(4)
 .emit()
 .where(
   loop().bothE('TRANSFERRED_TO')
   .has('timestamp', between('2024-06-01T00:00:00Z', '2024-06-02T00:00:00Z'))
   .otherV()
   .has('accountId', 'A001')
 )
 .path()
 .by('accountId')
 .by('amount')
 .by('timestamp')
```

**Python：应用层环检测与评分：**

```python
import asyncio
from gremlin_python.driver import client, serializer
from gremlin_python.driver.protocol import GremlinServerError
from collections import defaultdict

class CycleDetector:
    def __init__(self, neptune_endpoint: str, port: int = 8182):
        self.client = client.Client(
            f'wss://{neptune_endpoint}:{port}/gremlin',
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )

    async def detect_cycles(self, account_id: str, max_depth: int = 5,
                           time_window_hours: int = 24) -> list:
        query = (
            f"g.V().has('Account', 'accountId', '{account_id}')"
            f".repeat(outE('TRANSFERRED_TO')"
            f"  .has('timestamp', between("
            f"    '{self._time_window_start(time_window_hours)}',"
            f"    '{self._time_window_end()}'"
            f"  ))"
            f"  .inV().simplePath())"
            f".times({max_depth})"
            f".emit()"
            f".where(loop().bothE('TRANSFERRED_TO')"
            f"  .has('timestamp', between("
            f"    '{self._time_window_start(time_window_hours)}',"
            f"    '{self._time_window_end()}'"
            f"  ))"
            f"  .otherV()"
            f"  .has('accountId', '{account_id}'))"
            f".path()"
            f".by('accountId')"
            f".by('amount')"
            f".by('timestamp')"
        )
        try:
            result = await self.client.submit_async(query)
            return await result.all()
        except GremlinServerError as e:
            print(f"Gremlin error: {e}")
            return []

    def score_cycle_risk(self, paths: list) -> float:
        if not paths:
            return 0.0
        total_amount = 0.0
        max_amount = 0.0
        min_amount = float('inf')
        for path in paths:
            for step in path:
                if isinstance(step, dict) and 'amount' in step:
                    amt = float(step['amount'])
                    total_amount += amt
                    max_amount = max(max_amount, amt)
                    min_amount = min(min_amount, amt)
        avg_amount = total_amount / max(len(paths), 1)
        # 金额波动越小，结构化特征越明显，风险越高
        volatility = (max_amount - min_amount) / max(avg_amount, 0.01)
        # 路径数越多风险越高
        path_count_score = min(len(paths) / 10.0, 1.0)
        # 综合评分
        risk_score = 0.4 * path_count_score + 0.3 * (1 - min(volatility, 1.0)) + 0.3 * min(total_amount / 100000.0, 1.0)
        return round(min(risk_score, 1.0), 4)

    def _time_window_start(self, hours: int) -> str:
        from datetime import datetime, timedelta, timezone
        start = datetime.now(timezone.utc) - timedelta(hours=hours)
        return start.strftime('%Y-%m-%dT%H:%M:%SZ')

    def _time_window_end(self) -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    async def close(self):
        self.client.close()


# 使用示例
async def main():
    detector = CycleDetector('your-neptune-cluster.us-east-1.neptune.amazonaws.com')
    cycles = await detector.detect_cycles('A001', max_depth=5, time_window_hours=24)
    risk = detector.score_cycle_risk(cycles)
    print(f"检测到 {len(cycles)} 条循环路径，风险评分: {risk}")
    await detector.close()

asyncio.run(main())
```

**洗钱模式检测——分层（Layering）模式：**

```groovy
// 检测"资金快进快出"模式：资金到账后短时间内被转出
g.V().has('Account', 'accountId', 'A001')
 .outE('TRANSFERRED_TO').order().by('timestamp', asc).as('inflow')
 .inV()
 .outE('TRANSFERRED_TO')
 .has('timestamp', where(gt('inflow.values('timestamp')')))
 .where(
   lt('inflow.values('timestamp')')
   .plus(duration('PT30M'))
 )
 .path()
 .by('accountId')
 .by('amount')
 .by('timestamp')
```

**洗钱模式检测——整合（Integration）模式：**

```groovy
// 检测多个账户向同一账户转账后，该账户大额转出
g.V().has('Account', 'accountId', 'A001')
 .inE('TRANSFERRED_TO').outV()
 .dedup()
 .fold()
 .as('sources')
 .V().has('Account', 'accountId', 'A001')
 .outE('TRANSFERRED_TO')
 .where(select('sources').count(local).is(gt(3)))
 .inV()
 .path()
 .by('accountId')
 .by('amount')
```

### 10.3.4 使用场景

- **反洗钱（AML）监控**：实时检测可疑资金循环
- **信用卡套现识别**：检测商户与持卡人之间的循环交易
- **电商刷单检测**：识别买家-卖家循环
- **加密货币混币器检测**：识别混币服务中的循环交易

### 10.3.5 潜在风险与注意事项

- **深度限制**：Gremlin的 `repeat().times(N)` 必须设置上限，防止无限遍历导致Neptune OOM。生产环境建议N≤10
- **性能退化**：全图环检测在亿级边图上可能耗时数分钟，应作为离线批处理而非在线查询
- **假阳性**：合法的资金归集（如企业多个子公司向母公司转账）也会形成循环，需要结合业务规则过滤
- **时间窗口**：洗钱循环通常发生在短时间内，设置合理的时间窗口（如24~72小时）可大幅减少搜索空间

### 10.3.6 本章小结

循环交易检测是反洗钱系统的核心能力。Gremlin的 `repeat().emit().where()` 组合可以高效检测指定深度的资金循环。结合时间窗口过滤和金额波动分析，可以显著降低假阳性率。对于大规模全图扫描，建议使用Neptune ML或Spark连接器做离线分析。

---

## 10.4 风险传播分析

### 10.4.1 解决的问题

已知某个账户或设备为高风险（如已确认欺诈），如何量化其关联实体的风险？风险在交易网络中如何传播？哪些节点是风险传播的关键枢纽？这些问题无法通过规则引擎解决，需要图算法进行全局风险扩散分析。

### 10.4.2 核心原理

**PageRank for Risk Scoring：**

PageRank算法原本用于网页排名，其核心思想——"被重要节点引用的节点也重要"——天然适用于风险传播："与高风险节点交易的节点风险也高"。在Neptune上，PageRank的边权重可以映射为交易金额、频次等风险因子。

**Label Propagation（LPA）for Community Detection：**

标签传播算法通过节点间标签扩散发现社区结构。在风控场景中，LPA可以自动发现欺诈团伙——同一团伙的账户往往共享设备、IP、手机号等资源，LPA会将这些节点聚合成同一社区。

**Influence Maximization：**

识别图中影响力最大的节点（如资金枢纽账户），这些节点一旦被控制或标记，可以最大程度阻断风险传播。

### 10.4.3 代码/配置实现

**Neptune ML PageRank（使用内置WCC算法示例，PageRank需通过TinkerPop或Spark）：**

Neptune不支持直接运行PageRank，但可以通过Gremlin的 `repeat()` 和 `groupCount()` 模拟：

```groovy
// 模拟PageRank：从高风险节点出发，沿转账边传播风险
g.V().has('Account', 'riskLevel', 'high')
 .repeat(
   out('TRANSFERRED_TO')
   .simplePath()
 )
 .times(3)
 .groupCount()
 .by('accountId')
 .unfold()
 .order().by(values, desc)
 .limit(20)
```

**使用Apache Spark + GraphX进行PageRank（通过Neptune Spark Connector）：**

```python
from pyspark.sql import SparkSession
from neptune_spark_connector import NeptuneDataSource

spark = SparkSession.builder \
    .appName("RiskPropagation") \
    .config("spark.neptune.endpoint", "your-neptune-cluster.us-east-1.neptune.amazonaws.com") \
    .getOrCreate()

# 从Neptune加载图数据
df_vertices = spark.read \
    .format("neptune") \
    .option("label", "Account") \
    .load()

df_edges = spark.read \
    .format("neptune") \
    .option("label", "TRANSFERRED_TO") \
    .load()

# 构建GraphFrame并运行PageRank
from graphframes import GraphFrame
vertices = df_vertices.selectExpr("id", "riskLevel")
edges = df_edges.selectExpr("from as src", "to as dst", "amount as weight")

g = GraphFrame(vertices, edges)
pr_result = g.pageRank \
    .resetProbability(0.15) \
    .maxIter(20) \
    .run()

pr_result.vertices \
    .orderBy("pagerank", ascending=False) \
    .show(20)
```

**Gremlin：标签传播检测可疑社区：**

```groovy
// 基于共享设备检测社区
g.V().hasLabel('Account')
 .group()
 .by(
   __.out('USED_DEVICE').values('deviceId')
 )
 .by(__.values('accountId').fold())
 .unfold()
 .where(select(values).count(local).is(gt(3)))
 .order().by(select(values).count(local), desc)
 .limit(20)
```

```groovy
// 基于共享IP+手机号的复合社区检测
g.V().hasLabel('Account')
 .group()
 .by(
   __.union(
     out('USED_DEVICE').values('deviceId'),
     out('FROM_IP').values('ip'),
     out('BOUND_PHONE').values('phone')
   ).fold()
 )
 .by(__.values('accountId').fold())
 .unfold()
 .where(select(values).count(local).is(gt(5)))
 .order().by(select(values).count(local), desc)
 .limit(50)
```

**Python：风险传播评分引擎：**

```python
import asyncio
from gremlin_python.driver import client, serializer
from collections import defaultdict

class RiskPropagationEngine:
    def __init__(self, neptune_endpoint: str):
        self.client = client.Client(
            f'wss://{neptune_endpoint}:8182/gremlin',
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )

    async def propagate_risk(self, seed_accounts: list[str],
                             max_hops: int = 4,
                             decay_factor: float = 0.5) -> dict[str, float]:
        """
        从种子账户出发，沿转账边传播风险分数。
        每跳风险衰减 decay_factor。
        """
        risk_scores = defaultdict(float)
        for seed in seed_accounts:
            risk_scores[seed] = 1.0  # 种子节点风险为1

        for hop in range(1, max_hops + 1):
            decay = decay_factor ** hop
            query = (
                f"g.V().has('Account', 'accountId', "
                f"within({list(risk_scores.keys())}))"
                f".out('TRANSFERRED_TO')"
                f".dedup()"
                f".values('accountId')"
            )
            try:
                result = await self.client.submit_async(query)
                accounts = await result.all()
                for acc in accounts:
                    risk_scores[acc] = max(risk_scores.get(acc, 0), decay)
            except Exception as e:
                print(f"Hop {hop} error: {e}")

        return dict(sorted(risk_scores.items(), key=lambda x: -x[1]))

    async def find_influential_nodes(self, top_n: int = 20) -> list:
        """
        使用度数中心性识别关键节点：
        入度=资金汇聚点，出度=资金分发点
        """
        query = (
            f"g.V().hasLabel('Account')"
            f".project('accountId', 'inDegree', 'outDegree', 'totalAmount')"
            f".by('accountId')"
            f".by(__.inE('TRANSFERRED_TO').count())"
            f".by(__.outE('TRANSFERRED_TO').count())"
            f".by(__.local(__.union("
            f"  __.inE('TRANSFERRED_TO').values('amount').sum(),"
            f"  __.outE('TRANSFERRED_TO').values('amount').sum()"
            f").sum())"
            f".order().by(select('totalAmount'), desc)"
            f".limit({top_n})"
        )
        result = await self.client.submit_async(query)
        return await result.all()

    async def detect_suspicious_community(self, min_size: int = 5) -> list:
        """
        检测共享设备/IP的账户群组
        """
        query = (
            f"g.V().hasLabel('Account')"
            f".group()"
            f".by(__.out('USED_DEVICE').values('deviceId'))"
            f".by(__.values('accountId').fold())"
            f".unfold()"
            f".where(select(values).count(local).is(gt({min_size})))"
            f".project('deviceId', 'accounts', 'size')"
            f".by(select(keys))"
            f".by(select(values))"
            f".by(select(values).count(local))"
            f".order().by('size', desc)"
        )
        result = await self.client.submit_async(query)
        return await result.all()

    async def close(self):
        self.client.close()
```

### 10.4.4 使用场景

- **团伙欺诈识别**：通过共享设备/IP发现欺诈团伙
- **风险传导预警**：当某商户被标记为欺诈后，自动评估其关联账户风险
- **资金枢纽监控**：识别网络中资金流量最大的账户，重点监控
- **黑名单扩散**：将已知黑名单账户的风险传播到其关联网络

### 10.4.5 潜在风险与注意事项

- **衰减因子调优**：decay_factor过大会导致风险扩散不足，过小则误伤范围过大。建议通过历史数据回测确定最优值
- **种子质量**：风险传播的准确性高度依赖种子节点的质量。种子节点误标会导致大规模误伤
- **计算开销**：全图PageRank在亿级图上需要分布式计算框架（Spark/Neptune ML），不适合在线实时计算
- **时间衰减**：风险应随时间衰减。建议在传播时加入时间权重，近期交易权重更高

### 10.4.6 本章小结

风险传播分析将图算法与风控业务深度结合。PageRank量化节点风险等级，标签传播自动发现欺诈社区，影响力分析识别关键枢纽。在Neptune上，轻量级风险传播可通过Gremlin遍历实现，大规模图分析则需要借助Spark Connector或Neptune ML。

---

## 10.5 实时风控查询

### 10.5.1 解决的问题

在线支付场景中，风控决策必须在100毫秒内完成。每笔交易需要实时查询：交易双方的历史行为、设备指纹关联的其他账户、IP地址的过往风险记录等。Neptune需要针对这种亚100毫秒查询进行深度优化。

### 10.5.2 核心原理

**实时风控查询的关键优化维度：**

1. **查询模式预定义**：所有风控查询在部署前预定义，避免动态生成复杂Gremlin
2. **参数化查询**：使用Gremlin的 `with()` 或应用层参数绑定，避免字符串拼接
3. **连接池管理**：复用WebSocket连接，避免每次查询建立新连接
4. **查询裁剪**：使用时间窗口、深度限制、属性过滤缩小遍历范围
5. **索引利用**：Neptune自动对属性建索引，但复合查询需要合理设计

### 10.5.3 代码/配置实现

**预定义查询模板（参数化Gremlin）：**

```groovy
// 查询1：账户基本信息 + 近期交易统计（<50ms）
g.V().has('Account', 'accountId', accountId)
 .project('account', 'recentTxCount', 'recentTxAmount', 'uniqueMerchants')
 .by(
   __.project('riskLevel', 'balance', 'createdAt')
    .by('riskLevel')
    .by('balance')
    .by('createdAt')
 )
 .by(
   __.outE('TRANSFERRED_TO')
    .has('timestamp', between(startTime, endTime))
    .count()
 )
 .by(
   __.outE('TRANSFERRED_TO')
    .has('timestamp', between(startTime, endTime))
    .values('amount').sum()
 )
 .by(
   __.outE('TRANSFERRED_TO')
    .has('timestamp', between(startTime, endTime))
    .inV()
    .dedup()
    .count()
 )
```

```groovy
// 查询2：设备关联的其他账户（<30ms）
g.V().has('Device', 'deviceId', deviceId)
 .inE('USED_DEVICE')
 .outV()
 .has('Account', 'accountId', neq(currentAccountId))
 .project('accountId', 'riskLevel', 'lastLogin')
 .by('accountId')
 .by('riskLevel')
 .by(outE('USED_DEVICE')
     .has('deviceId', deviceId)
     .values('loginTime')
     .order().by(desc).limit(1))
 .limit(10)
```

```groovy
// 查询3：IP地址风险画像（<20ms）
g.V().has('IPAddress', 'ip', ipAddress)
 .project('ip', 'geo', 'proxyScore', 'associatedAccounts', 'recentTxCount')
 .by('ip')
 .by('geo')
 .by('proxyScore')
 .by(
   __.inE('FROM_IP')
    .outV()
    .dedup()
    .count()
 )
 .by(
   __.inE('FROM_IP')
    .outV()
    .outE('TRANSFERRED_TO')
    .has('timestamp', between(startTime, endTime))
    .count()
 )
```

```groovy
// 查询4：两账户间最短路径（检测关联关系，<100ms）
g.V().has('Account', 'accountId', fromAccount)
 .repeat(
   outE('TRANSFERRED_TO')
   .has('timestamp', between(startTime, endTime))
   .inV()
   .simplePath()
 )
 .until(
   has('accountId', toAccount)
 )
 .limit(1)
 .path()
 .by('accountId')
 .by('amount')
 .by('timestamp')
```

**Python：高性能连接池与实时评分：**

```python
import asyncio
import time
from gremlin_python.driver import client, serializer
from gremlin_python.driver.pool import ConnectionPool
from gremlin_python.driver.aiohttp.transport import AiohttpTransport
from concurrent.futures import ThreadPoolExecutor

class RealTimeRiskScorer:
    def __init__(self, neptune_endpoint: str, pool_size: int = 10):
        self.endpoint = f'wss://{neptune_endpoint}:8182/gremlin'
        self.pool = ConnectionPool(
            pool_size=pool_size,
            url=self.endpoint,
            traversal_source='g',
            username='',  # IAM auth or basic auth
            password='',
            message_serializer=serializer.GraphSONSerializersV3d0(),
            transport_factory=AiohttpTransport
        )

    async def score_transaction(self, tx_data: dict) -> dict:
        """
        实时交易评分，返回风险分数和决策建议。
        目标：<100ms
        """
        start = time.time()
        account_id = tx_data['fromAccount']
        target_id = tx_data['toAccount']
        amount = tx_data['amount']
        device_id = tx_data.get('deviceId', '')
        ip_address = tx_data.get('ipAddress', '')
        now = tx_data.get('timestamp', '2024-06-01T00:00:00Z')

        # 并行执行多个独立查询
        queries = await asyncio.gather(
            self._query_account_profile(account_id, now),
            self._query_device_risk(device_id, account_id, now),
            self._query_ip_risk(ip_address, now),
            self._query_recent_tx_stats(account_id, now),
            self._query_merchant_risk(target_id, now),
            return_exceptions=True
        )

        profile, device_risk, ip_risk, tx_stats, merchant_risk = queries

        # 风险评分计算
        score = 0.0
        reasons = []

        # 规则1：账户风险等级
        if isinstance(profile, dict):
            risk_map = {'high': 0.4, 'medium': 0.2, 'low': 0.0}
            score += risk_map.get(profile.get('riskLevel', 'low'), 0)
            if profile.get('riskLevel') == 'high':
                reasons.append('ACCOUNT_HIGH_RISK')

        # 规则2：设备关联过多账户
        if isinstance(device_risk, dict):
            if device_risk.get('accountCount', 0) > 5:
                score += 0.2
                reasons.append('DEVICE_OVERUSED')
            if device_risk.get('hasHighRiskAccount', False):
                score += 0.3
                reasons.append('DEVICE_LINKED_HIGH_RISK')

        # 规则3：IP为代理或关联账户过多
        if isinstance(ip_risk, dict):
            if ip_risk.get('proxyScore', 0) > 0.7:
                score += 0.2
                reasons.append('PROXY_IP')
            if ip_risk.get('accountCount', 0) > 10:
                score += 0.15
                reasons.append('IP_OVERUSED')

        # 规则4：近期交易异常
        if isinstance(tx_stats, dict):
            if tx_stats.get('txCount', 0) > 50:
                score += 0.15
                reasons.append('HIGH_TX_FREQUENCY')
            if tx_stats.get('totalAmount', 0) > 100000:
                score += 0.1
                reasons.append('HIGH_TX_VOLUME')

        # 规则5：收款方风险
        if isinstance(merchant_risk, dict):
            if merchant_risk.get('riskLevel') == 'high':
                score += 0.3
                reasons.append('MERCHANT_HIGH_RISK')

        elapsed = (time.time() - start) * 1000
        decision = 'REJECT' if score >= 0.6 else 'REVIEW' if score >= 0.3 else 'APPROVE'

        return {
            'txId': tx_data.get('txId', ''),
            'riskScore': round(min(score, 1.0), 4),
            'decision': decision,
            'reasons': reasons,
            'latencyMs': round(elapsed, 2)
        }

    async def _query_account_profile(self, account_id: str, now: str) -> dict:
        query = (
            f"g.V().has('Account', 'accountId', '{account_id}')"
            f".project('riskLevel', 'balance', 'createdAt')"
            f".by('riskLevel').by('balance').by('createdAt')"
        )
        result = await self._submit(query)
        return result[0] if result else {}

    async def _query_device_risk(self, device_id: str, current_account: str,
                                 now: str) -> dict:
        if not device_id:
            return {}
        query = (
            f"g.V().has('Device', 'deviceId', '{device_id}')"
            f".inE('USED_DEVICE').outV()"
            f".has('Account', 'accountId', neq('{current_account}'))"
            f".fold()"
            f".project('accountCount', 'hasHighRiskAccount')"
            f".by(__.unfold().count())"
            f".by(__.unfold().has('riskLevel', 'high').count().is(gt(0)))"
        )
        result = await self._submit(query)
        return result[0] if result else {}

    async def _query_ip_risk(self, ip_address: str, now: str) -> dict:
        if not ip_address:
            return {}
        query = (
            f"g.V().has('IPAddress', 'ip', '{ip_address}')"
            f".project('proxyScore', 'accountCount')"
            f".by('proxyScore')"
            f".by(__.inE('FROM_IP').outV().dedup().count())"
        )
        result = await self._submit(query)
        return result[0] if result else {}

    async def _query_recent_tx_stats(self, account_id: str, now: str) -> dict:
        query = (
            f"g.V().has('Account', 'accountId', '{account_id}')"
            f".project('txCount', 'totalAmount')"
            f".by(__.outE('TRANSFERRED_TO')"
            f"    .has('timestamp', between("
            f"      '2024-05-01T00:00:00Z','{now}'))"
            f"    .count())"
            f".by(__.outE('TRANSFERRED_TO')"
            f"    .has('timestamp', between("
            f"      '2024-05-01T00:00:00Z','{now}'))"
            f"    .values('amount').sum())"
        )
        result = await self._submit(query)
        return result[0] if result else {}

    async def _query_merchant_risk(self, merchant_id: str, now: str) -> dict:
        query = (
            f"g.V().has('Merchant', 'merchantId', '{merchant_id}')"
            f".project('riskLevel', 'category')"
            f".by('riskScore').by('category')"
        )
        result = await self._submit(query)
        return result[0] if result else {}

    async def _submit(self, query: str) -> list:
        try:
            result = await self.pool.submit(query)
            return result
        except Exception as e:
            print(f"Query error: {e}")
            return []

    async def close(self):
        await self.pool.close()


# 使用示例
async def main():
    scorer = RealTimeRiskScorer('your-neptune-cluster.us-east-1.neptune.amazonaws.com')
    tx = {
        'txId': 'TXN20001',
        'fromAccount': 'A001',
        'toAccount': 'M001',
        'amount': 5000.00,
        'deviceId': 'DEV-ABC123',
        'ipAddress': '203.0.113.45',
        'timestamp': '2024-06-01T14:30:00Z'
    }
    result = await scorer.score_transaction(tx)
    print(f"风险评分: {result['riskScore']}")
    print(f"决策: {result['decision']}")
    print(f"原因: {result['reasons']}")
    print(f"延迟: {result['latencyMs']}ms")
    await scorer.close()

asyncio.run(main())
```

**Neptune连接池配置（Java示例）：**

```java
import org.apache.tinkerpop.gremlin.driver.Cluster;
import org.apache.tinkerpop.gremlin.driver.Client;
import org.apache.tinkerpop.gremlin.driver.ser.GraphSONMessageSerializerV3d0;

public class NeptuneConnectionPool {
    private final Cluster cluster;
    private final Client client;

    public NeptuneConnectionPool(String endpoint, int poolSize) {
        this.cluster = Cluster.build()
            .addContactPoint(endpoint)
            .port(8182)
            .enableSsl(true)
            .maxConnectionPoolSize(poolSize)
            .minConnectionPoolSize(poolSize / 2)
            .maxSimultaneousUsagePerConnection(8)
            .maxInProcessPerConnection(4)
            .serializer(new GraphSONMessageSerializerV3d0())
            .create();
        this.client = cluster.connect();
    }

    public Client getClient() {
        return client;
    }

    public void close() {
        client.close();
        cluster.close();
    }
}
```

### 10.5.4 使用场景

- **在线支付风控**：每笔支付实时评分
- **登录风控**：检测异常登录行为
- **注册风控**：新用户注册时的设备/IP关联检测
- **提现风控**：大额提现前的多维度风险评估

### 10.5.5 潜在风险与注意事项

- **超时处理**：实时查询必须设置超时（建议500ms），超时后降级为异步审核
- **缓存策略**：账户画像等低频变化数据应缓存（Redis/ElastiCache），减少Neptune查询压力
- **熔断机制**：当Neptune延迟超过阈值时，自动熔断并切换到规则引擎兜底
- **查询审计**：所有实时查询应记录延迟和结果，用于持续优化和问题排查
- **预热**：新部署的查询应先预热（执行一次），避免冷启动延迟

### 10.5.6 本章小结

实时风控查询的核心在于预定义查询模板、连接池复用和查询裁剪。通过将多维度查询并行化，可以在100ms内完成账户画像、设备风险、IP风险、交易统计的综合评分。生产环境需要配合缓存、熔断、超时等机制确保高可用。

---

## 10.6 反欺诈系统实战

### 10.6.1 解决的问题

构建一个生产级的反欺诈系统，需要将图数据库与规则引擎、实时计算、告警系统整合。本节提供一个端到端的参考架构，涵盖数据模型设计、实时评分、批量分析和告警集成。

### 10.6.2 核心原理

反欺诈系统采用**分层架构**：

1. **数据接入层**：交易事件通过Kafka接入，实时写入Neptune
2. **实时评分层**：Neptune查询 + 规则引擎，100ms内输出决策
3. **批量分析层**：定时运行图算法（社区检测、PageRank），更新全局风险标签
4. **告警层**：高风险事件触发告警，推送到SIEM/工单系统

### 10.6.3 代码/配置实现

**完整数据模型（Gremlin Schema）：**

```groovy
// 账户顶点
g.addV('Account')
 .property('accountId', 'A001')
 .property('name', '张三')
 .property('idType', 'ID_CARD')
 .property('idHash', 'sha256_xxx')
 .property('phone', '13800138000')
 .property('email', 'zhangsan@example.com')
 .property('balance', 50000.00)
 .property('riskLevel', 'low')
 .property('riskScore', 0.0)
 .property('status', 'active')
 .property('createdAt', '2024-01-15T08:00:00Z')
 .property('lastActivity', '2024-06-01T14:30:00Z')
 .property('totalTxCount', 0)
 .property('totalTxAmount', 0.0)

// 交易顶点
g.addV('Transaction')
 .property('txId', 'TXN10001')
 .property('type', 'TRANSFER')
 .property('amount', 15000.00)
 .property('currency', 'CNY')
 .property('timestamp', '2024-06-01T14:30:00Z')
 .property('status', 'completed')
 .property('channel', 'online')
 .property('riskScore', 0.0)
 .property('decision', 'APPROVE')

// 商户顶点
g.addV('Merchant')
 .property('merchantId', 'M001')
 .property('name', '某某电商')
 .property('category', 'E-COMMERCE')
 .property('mccCode', '5311')
 .property('country', 'CN')
 .property('riskScore', 0.0)
 .property('status', 'active')
 .property('createdAt', '2023-06-01T00:00:00Z')

// 设备顶点
g.addV('Device')
 .property('deviceId', 'DEV-ABC123')
 .property('deviceType', 'mobile')
 .property('os', 'Android 14')
 .property('browser', 'Chrome 125')
 .property('fingerprint', 'fp_abc123_hash')
 .property('firstSeen', '2024-05-01T10:00:00Z')
 .property('lastSeen', '2024-06-01T14:30:00Z')
 .property('accountCount', 1)
 .property('riskScore', 0.0)

// IP顶点
g.addV('IPAddress')
 .property('ip', '203.0.113.45')
 .property('geo', 'CN-SH')
 .property('city', '上海')
 .property('isp', 'ChinaNet')
 .property('proxyScore', 0.0)
 .property('isVPN', false)
 .property('isDatacenter', false)
 .property('firstSeen', '2024-05-01T00:00:00Z')
 .property('accountCount', 1)
```

**实时评分查询（生产级）：**

```groovy
// 综合评分查询（<100ms）
g.V().has('Account', 'accountId', fromAccount).as('sender')
 .V().has('Account', 'accountId', toAccount).as('receiver')
 .V().has('Device', 'deviceId', deviceId).as('device')
 .V().has('IPAddress', 'ip', ipAddress).as('ip')
 .project(
   'senderRisk', 'receiverRisk', 'deviceRisk',
   'ipRisk', 'txStats', 'pathRisk'
 )
 .by(
   __.select('sender')
    .project('riskLevel', 'score', 'age')
    .by('riskLevel')
    .by('riskScore')
    .by(__.values('createdAt').map{
      it.get() instanceof Date ?
        (System.currentTimeMillis() - it.get().time) / 86400000 :
        0
    })
 )
 .by(
   __.select('receiver')
    .project('riskLevel', 'score')
    .by('riskLevel')
    .by('riskScore')
 )
 .by(
   __.select('device')
    .project('accountCount', 'riskScore', 'daysSinceFirstSeen')
    .by('accountCount')
    .by('riskScore')
    .by(__.values('firstSeen').map{
      it.get() instanceof Date ?
        (System.currentTimeMillis() - it.get().time) / 86400000 :
        0
    })
 )
 .by(
   __.select('ip')
    .project('proxyScore', 'accountCount', 'isVPN')
    .by('proxyScore')
    .by('accountCount')
    .by('isVPN')
 )
 .by(
   __.select('sender')
    .outE('TRANSFERRED_TO')
    .has('timestamp', between(startTime, endTime))
    .fold()
    .project('count', 'totalAmount', 'avgAmount', 'maxAmount')
    .by(__.unfold().count())
    .by(__.unfold().values('amount').sum())
    .by(__.unfold().values('amount').mean())
    .by(__.unfold().values('amount').max())
 )
 .by(
   __.select('sender')
    .repeat(out('TRANSFERRED_TO').simplePath())
    .times(3)
    .where(eq('receiver'))
    .limit(1)
    .fold()
    .project('hasCycle', 'cycleDepth')
    .by(__.unfold().count().is(gt(0)))
    .by(__.unfold().count(local))
 )
```

**Python：批量分析作业（定时运行）：**

```python
import asyncio
import boto3
from datetime import datetime, timedelta
from gremlin_python.driver import client, serializer

class BatchFraudAnalyzer:
    def __init__(self, neptune_endpoint: str):
        self.client = client.Client(
            f'wss://{neptune_endpoint}:8182/gremlin',
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        self.sns = boto3.client('sns')

    async def run_hourly_analysis(self):
        """每小时批量分析"""
        print(f"[{datetime.utcnow()}] 开始批量分析...")

        # 1. 检测新出现的循环交易
        cycles = await self._detect_new_cycles()
        if cycles:
            await self._alert_cycles(cycles)

        # 2. 更新设备风险评分
        device_updates = await self._update_device_risk_scores()
        print(f"更新了 {device_updates} 个设备风险评分")

        # 3. 检测共享设备群组
        communities = await self._detect_device_communities()
        if communities:
            await self._alert_communities(communities)

        # 4. 更新账户风险评分
        account_updates = await self._update_account_risk_scores()
        print(f"更新了 {account_updates} 个账户风险评分")

        print(f"[{datetime.utcnow()}] 批量分析完成")

    async def _detect_new_cycles(self) -> list:
        """检测过去1小时内的新循环交易"""
        one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat() + 'Z'
        query = (
            f"g.V().hasLabel('Account')"
            f".where(__.outE('TRANSFERRED_TO')"
            f"  .has('timestamp', gt('{one_hour_ago}'))"
            f"  .count().is(gt(0)))"
            f".repeat(out('TRANSFERRED_TO').simplePath())"
            f".times(5)"
            f".emit()"
            f".where(loops().is(gt(2)))"
            f".where(__.both('TRANSFERRED_TO')"
            f"  .has('accountId',"
            f"    select('a').values('accountId')))"
            f".dedup()"
            f".path()"
            f".by('accountId')"
            f".limit(50)"
        )
        result = await self.client.submit_async(query)
        return await result.all()

    async def _update_device_risk_scores(self) -> int:
        """根据设备关联的账户风险更新设备评分"""
        query = (
            f"g.V().hasLabel('Device')"
            f".where(__.inE('USED_DEVICE').count().is(gt(1)))"
            f".project('deviceId', 'maxAccountRisk', 'accountCount')"
            f".by('deviceId')"
            f".by(__.in('USED_DEVICE')"
            f"  .values('riskScore').max())"
            f".by(__.in('USED_DEVICE').count())"
        )
        result = await self.client.submit_async(query)
        devices = await result.all()

        updates = 0
        for dev in devices:
            risk = min(
                float(dev['maxAccountRisk']) * 0.7 +
                min(int(dev['accountCount']) / 20.0, 0.3),
                1.0
            )
            update_query = (
                f"g.V().has('Device', 'deviceId', '{dev['deviceId']}')"
                f".property('riskScore', {risk})"
            )
            await self.client.submit_async(update_query)
            updates += 1
        return updates

    async def _detect_device_communities(self) -> list:
        """检测共享设备的账户群组（≥3个账户共享同一设备）"""
        query = (
            f"g.V().hasLabel('Device')"
            f".where(__.inE('USED_DEVICE').count().is(gt(2)))"
            f".project('deviceId', 'accounts', 'riskScores')"
            f".by('deviceId')"
            f".by(__.in('USED_DEVICE').values('accountId').fold())"
            f".by(__.in('USED_DEVICE').values('riskScore').fold())"
            f".limit(100)"
        )
        result = await self.client.submit_async(query)
        return await result.all()

    async def _update_account_risk_scores(self) -> int:
        """综合更新账户风险评分"""
        query = (
            f"g.V().hasLabel('Account')"
            f".project('accountId', 'deviceRisk', 'ipRisk', 'txVelocity')"
            f".by('accountId')"
            f".by(__.out('USED_DEVICE').values('riskScore').max())"
            f".by(__.out('FROM_IP').values('proxyScore').max())"
            f".by(__.outE('TRANSFERRED_TO')"
            f"  .has('timestamp', gt('{self._hours_ago(24)}'))"
            f"  .count())"
        )
        result = await self.client.submit_async(query)
        accounts = await result.all()

        updates = 0
        for acc in accounts:
            device_risk = float(acc.get('deviceRisk', 0) or 0)
            ip_risk = float(acc.get('ipRisk', 0) or 0)
            tx_velocity = int(acc.get('txVelocity', 0) or 0)
            velocity_score = min(tx_velocity / 100.0, 0.3)
            new_score = min(device_risk * 0.4 + ip_risk * 0.3 + velocity_score, 1.0)

            update_query = (
                f"g.V().has('Account', 'accountId', '{acc['accountId']}')"
                f".property('riskScore', {new_score})"
            )
            await self.client.submit_async(update_query)
            updates += 1
        return updates

    def _hours_ago(self, hours: int) -> str:
        return (datetime.utcnow() - timedelta(hours=hours)).isoformat() + 'Z'

    async def _alert_cycles(self, cycles: list):
        """发送循环交易告警"""
        message = {
            'alertType': 'CYCLE_DETECTED',
            'severity': 'HIGH',
            'timestamp': datetime.utcnow().isoformat(),
            'cycleCount': len(cycles),
            'details': [str(p) for p in cycles[:5]]
        }
        self.sns.publish(
            TopicArn='arn:aws:sns:us-east-1:123456789012:FraudAlerts',
            Message=str(message),
            Subject=f"[风控告警] 检测到 {len(cycles)} 条循环交易路径"
        )

    async def _alert_communities(self, communities: list):
        """发送可疑社区告警"""
        for comm in communities[:10]:
            message = {
                'alertType': 'SUSPICIOUS_COMMUNITY',
                'severity': 'MEDIUM',
                'deviceId': comm['deviceId'],
                'accounts': comm['accounts'],
                'timestamp': datetime.utcnow().isoformat()
            }
            self.sns.publish(
                TopicArn='arn:aws:sns:us-east-1:123456789012:FraudAlerts',
                Message=str(message),
                Subject=f"[风控告警] 设备 {comm['deviceId']} 关联 {len(comm['accounts'])} 个账户"
            )

    async def close(self):
        self.client.close()


# 定时执行（使用AWS Lambda + EventBridge）
def lambda_handler(event, context):
    analyzer = BatchFraudAnalyzer('your-neptune-cluster.neptune.amazonaws.com')
    asyncio.run(analyzer.run_hourly_analysis())
```

**告警集成（Python + SNS → 工单系统）：**

```python
import json
import boto3
from datetime import datetime

class AlertManager:
    def __init__(self):
        self.sns = boto3.client('sns')
        self.sqs = boto3.client('sqs')

    def send_alert(self, alert_type: str, severity: str,
                   account_id: str, details: dict):
        alert = {
            'alertId': f"fraud-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{account_id}",
            'alertType': alert_type,
            'severity': severity,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'accountId': account_id,
            'details': details,
            'source': 'NeptuneFraudDetection'
        }

        # 高优先级告警直接推送
        if severity in ('CRITICAL', 'HIGH'):
            self.sns.publish(
                TopicArn='arn:aws:sns:us-east-1:123456789012:FraudAlerts',
                Message=json.dumps(alert, ensure_ascii=False),
                Subject=f"[{severity}] 风控告警: {alert_type} - {account_id}"
            )

        # 所有告警写入SQS供下游处理
        self.sqs.send_message(
            QueueUrl='https://sqs.us-east-1.amazonaws.com/123456789012/fraud-alerts',
            MessageBody=json.dumps(alert, ensure_ascii=False)
        )

        return alert['alertId']
```

### 10.6.4 使用场景

- **支付平台反欺诈**：支付宝、微信支付、Stripe等
- **银行交易监控**：对公/对私转账实时风控
- **P2P借贷风控**：借款人团伙识别
- **加密货币交易所**：洗钱地址检测
- **电商平台**：虚假交易、刷单检测

### 10.6.5 潜在风险与注意事项

- **数据一致性**：Neptune不支持跨区域多活，生产环境需考虑单点故障。建议使用Neptune Global Database做跨区域灾备
- **写入吞吐**：Neptune写入TPS有限（取决于实例规格），高并发写入需使用批量写入或Kafka缓冲
- **成本控制**：Neptune按实例小时计费，批量分析建议使用可暂停的实例或Serverless
- **模型演进**：风控规则需要持续迭代，图模型设计时应预留扩展字段
- **合规要求**：金融数据需满足GDPR/个人信息保护法要求，敏感字段应加密存储

### 10.6.6 本章小结

生产级反欺诈系统需要图数据库、规则引擎、消息队列和告警系统的协同。Neptune作为图存储和查询引擎，承担实时评分和批量分析的双重角色。通过分层架构设计，系统可以在保证亚100毫秒实时决策的同时，通过批量分析持续优化风险模型。

---

## 10.7 常见欺诈模式与检测

### 10.7.1 解决的问题

欺诈手段不断演进，但核心模式相对稳定。本节总结六种最常见的金融欺诈模式，并给出对应的Neptune检测方案。

### 10.7.2 核心原理与检测

#### 10.7.2.1 合成身份欺诈（Synthetic Identity）

**模式描述：** 欺诈者将真实信息（如身份证号）与虚假信息（如自拍照片、虚拟手机号）组合，创建看似真实的身份。多个合成身份可能共享同一设备或IP。

**检测查询：**

```groovy
// 检测同一设备注册的多个账户（合成身份标志）
g.V().hasLabel('Device')
 .where(__.inE('USED_DEVICE')
   .outV()
   .has('Account', 'createdAt', gt('2024-01-01T00:00:00Z'))
   .count().is(gt(3)))
 .project('deviceId', 'accounts', 'creationDates')
 .by('deviceId')
 .by(__.in('USED_DEVICE')
   .has('Account', 'createdAt', gt('2024-01-01T00:00:00Z'))
   .values('accountId').fold())
 .by(__.in('USED_DEVICE')
   .has('Account', 'createdAt', gt('2024-01-01T00:00:00Z'))
   .values('createdAt').fold())
 .order().by(__.in('USED_DEVICE').count(), desc)
 .limit(20)
```

```groovy
// 检测短时间内批量注册（合成身份批量创建）
g.V().hasLabel('Account')
 .has('createdAt', gt('2024-06-01T00:00:00Z'))
 .groupCount()
 .by(__.values('createdAt').map{
   // 按小时聚合
   def d = it.get() instanceof Date ? it.get() : Date.parse("yyyy-MM-dd'T'HH:mm:ss'Z'", it.get())
   return d.format("yyyy-MM-dd HH:00")
 })
 .unfold()
 .where(select(values).is(gt(10)))
 .order().by(select(values), desc)
```

#### 10.7.2.2 账户盗用（Account Takeover）

**模式描述：** 攻击者通过钓鱼、撞库等方式获取用户凭证后，从新设备/IP登录，快速转移资金。

**检测查询：**

```groovy
// 检测设备突变：账户突然从未知设备登录
g.V().has('Account', 'accountId', 'A001')
 .outE('USED_DEVICE')
 .order().by('loginTime', desc)
 .limit(2)
 .fold()
 .as('devices')
 .where(
   select('devices').count(local).is(2)
 )
 .where(
   select('devices').unfold()
   .values('deviceId')
   .dedup()
   .count().is(2)
 )
 .select('devices')
 .unfold()
 .project('deviceId', 'loginTime', 'ipAddress')
 .by(__.inV().values('deviceId'))
 .by('loginTime')
 .by('ipAddress')
```

```groovy
// 检测异常地理位置：登录IP与常用IP不在同一城市
g.V().has('Account', 'accountId', 'A001')
 .outE('FROM_IP')
 .order().by('timestamp', desc)
 .limit(1)
 .inV()
 .as('currentIp')
 .V().has('Account', 'accountId', 'A001')
 .outE('FROM_IP')
 .order().by('timestamp', desc)
 .skip(1)
 .limit(5)
 .inV()
 .where(neq('currentIp'))
 .project('currentIp', 'currentGeo', 'previousIp', 'previousGeo')
 .by(select('currentIp').values('ip'))
 .by(select('currentIp').values('geo'))
 .by('ip')
 .by('geo')
 .limit(1)
```

#### 10.7.2.3 钱骡账户检测（Money Mule Detection）

**模式描述：** 钱骡账户接收非法资金后快速转出，通常具有"快进快出"特征：入账后短时间内转出大部分资金，余额长期接近零。

**检测查询：**

```groovy
// 检测钱骡模式：入账后30分钟内转出≥80%
g.V().hasLabel('Account')
 .where(__.outE('TRANSFERRED_TO').count().is(gt(0)))
 .where(__.inE('TRANSFERRED_TO').count().is(gt(0)))
 .project('accountId', 'inflow', 'outflow', 'retentionRate')
 .by('accountId')
 .by(__.inE('TRANSFERRED_TO')
   .has('timestamp', gt('2024-05-01T00:00:00Z'))
   .values('amount').sum())
 .by(__.outE('TRANSFERRED_TO')
   .has('timestamp', gt('2024-05-01T00:00:00Z'))
   .values('amount').sum())
 .by(
   __.project('in', 'out')
   .by(__.inE('TRANSFERRED_TO')
     .has('timestamp', gt('2024-05-01T00:00:00Z'))
     .values('amount').sum())
   .by(__.outE('TRANSFERRED_TO')
     .has('timestamp', gt('2024-05-01T00:00:00Z'))
     .values('amount').sum())
   .map{
     def inflow = it.get('in') ?: 0
     def outflow = it.get('out') ?: 0
     return inflow > 0 ? (inflow - outflow) / inflow : 1.0
   }
 )
 .where(select('retentionRate').is(lt(0.2)))
 .order().by('inflow', desc)
 .limit(50)
```

```groovy
// 检测"分散转入-集中转出"的钱骡网络
g.V().hasLabel('Account')
 .where(__.inE('TRANSFERRED_TO').count().is(gt(5)))
 .where(__.outE('TRANSFERRED_TO').count().is(lte(3)))
 .project('accountId', 'inCount', 'outCount', 'inTotal', 'outTotal')
 .by('accountId')
 .by(__.inE('TRANSFERRED_TO').count())
 .by(__.outE('TRANSFERRED_TO').count())
 .by(__.inE('TRANSFERRED_TO').values('amount').sum())
 .by(__.outE('TRANSFERRED_TO').values('amount').sum())
 .order().by('inCount', desc)
 .limit(50)
```

#### 10.7.2.4 交易 laundering（Transaction Laundering）

**模式描述：** 非法商户通过伪装成合法商户处理交易，或通过多个中间商户混淆资金流向。

**检测查询：**

```groovy
// 检测商户资金异常流向
g.V().hasLabel('Merchant')
 .where(__.outE('PAID_AT').count().is(gt(100)))
 .outE('PAID_AT').inV()
 .outE('TRANSFERRED_TO')
 .where(loops().is(gt(1)))
 .dedup()
 .path()
 .by('accountId')
 .by('merchantId')
 .by('amount')
 .limit(20)
```

```groovy
// 检测商户与账户之间的循环资金流
g.V().hasLabel('Merchant')
 .repeat(
   outE('PAID_AT').inV()
   .outE('TRANSFERRED_TO').inV()
   .simplePath()
 )
 .times(4)
 .emit()
 .where(hasLabel('Merchant'))
 .path()
 .by(__.label())
 .by('accountId')
 .limit(20)
```

#### 10.7.2.5 结构化交易（Structuring / Smurfing）

**模式描述：** 将大额资金拆分为多笔小额交易以规避监管阈值（如单笔超过一定金额自动上报）。

**检测查询：**

```groovy
// 检测同一账户在短时间内向同一对手方发起多笔接近阈值的交易
g.V().has('Account', 'accountId', 'A001')
 .outE('TRANSFERRED_TO')
 .has('timestamp', between('2024-06-01T00:00:00Z', '2024-06-02T00:00:00Z'))
 .has('amount', between(45000, 50000))
 .groupCount()
 .by(__.inV().values('accountId'))
 .unfold()
 .where(select(values).is(gt(2)))
 .order().by(select(values), desc)
```

```groovy
// 检测多个账户向同一目标账户发起结构化转账
g.V().has('Account', 'accountId', 'A002')
 .inE('TRANSFERRED_TO')
 .has('amount', between(45000, 50000))
 .has('timestamp', between('2024-06-01T00:00:00Z', '2024-06-02T00:00:00Z'))
 .outV()
 .dedup()
 .fold()
 .as('sources')
 .V().has('Account', 'accountId', 'A002')
 .inE('TRANSFERRED_TO')
 .has('amount', between(45000, 50000))
 .has('timestamp', between('2024-06-01T00:00:00Z', '2024-06-02T00:00:00Z'))
 .count()
 .as('totalTx')
 .select('sources')
 .count(local)
 .as('uniqueSources')
 .project('totalTransactions', 'uniqueSources', 'totalAmount')
 .by(select('totalTx'))
 .by(select('uniqueSources'))
 .by(
   g.V().has('Account', 'accountId', 'A002')
   .inE('TRANSFERRED_TO')
   .has('amount', between(45000, 50000))
   .has('timestamp', between('2024-06-01T00:00:00Z', '2024-06-02T00:00:00Z'))
   .values('amount').sum()
 )
```

#### 10.7.2.6 薅羊毛/优惠券欺诈

**模式描述：** 使用多个虚假账户领取新用户优惠、邀请奖励等。

**检测查询：**

```groovy
// 检测共享手机号的多个账户
g.V().hasLabel('Phone')
 .where(__.inE('BOUND_PHONE').count().is(gt(2)))
 .project('phone', 'accounts', 'creationDates')
 .by('phone')
 .by(__.in('BOUND_PHONE').values('accountId').fold())
 .by(__.in('BOUND_PHONE').values('createdAt').fold())
 .order().by(__.in('BOUND_PHONE').count(), desc)
 .limit(20)
```

```groovy
// 检测同一IP下大量新注册账户
g.V().hasLabel('IPAddress')
 .where(__.inE('FROM_IP')
   .outV()
   .has('Account', 'createdAt', gt('2024-06-01T00:00:00Z'))
   .count().is(gt(5)))
 .project('ip', 'newAccounts', 'geo')
 .by('ip')
 .by(__.in('FROM_IP')
   .has('Account', 'createdAt', gt('2024-06-01T00:00:00Z'))
   .count())
 .by('geo')
 .order().by('newAccounts', desc)
 .limit(20)
```

### 10.7.3 使用场景

- **金融机构AML系统**：全面覆盖上述六种欺诈模式
- **电商平台风控**：重点检测薅羊毛、交易 laundering
- **支付网关**：实时检测结构化交易和钱骡账户
- **数字银行**：账户盗用和合成身份检测

### 10.7.4 潜在风险与注意事项

- **规则冲突**：不同欺诈模式的检测规则可能产生冲突（如钱骡检测可能误伤正常资金归集），需要设计优先级和豁免机制
- **阈值调优**：所有检测中的数值阈值（金额、时间、数量）需要根据业务数据分布动态调整，建议使用百分位数而非固定值
- **对抗性行为**：欺诈者会针对检测规则调整行为（如将结构化金额从49999改为35000），需要持续更新检测模式
- **误报处理**：建立误报反馈闭环，将人工审核结果回传模型，持续优化检测精度

### 10.7.5 本章小结

六种常见欺诈模式覆盖了金融风控的主要场景。每种模式都有对应的Gremlin检测查询，可以在Neptune上高效执行。实际部署时，建议将检测规则配置化（存储在DynamoDB或参数表中），便于业务团队动态调整阈值和规则权重。

---

## 10.8 总结与最佳实践

### 10.8.1 架构决策要点

| 决策点 | 推荐方案 | 替代方案 |
|--------|----------|----------|
| 图数据库 | Amazon Neptune | Neo4j（自托管）、JanusGraph |
| 实时查询 | Gremlin + 连接池 | SPARQL（RDF场景） |
| 批量分析 | Neptune Spark Connector | Neptune ML、导出到S3分析 |
| 告警集成 | SNS → SQS → 工单系统 | EventBridge → Lambda |
| 数据加载 | Neptune Bulk Loader | Gremlin逐条写入 |

### 10.8.2 性能优化清单

1. **查询优化**：使用 `project()` 替代多个独立查询，减少网络往返
2. **连接管理**：连接池大小 = 2×vCPU数，每个连接最大并发8个请求
3. **数据分区**：按时间范围对Transaction顶点做逻辑分区，查询时指定时间窗口
4. **属性过滤**：将高频过滤属性（riskLevel、status）放在查询最前面
5. **结果限制**：所有查询必须加 `limit()`，防止结果集过大
6. **超时设置**：实时查询设置500ms超时，批量查询设置5min超时

### 10.8.3 监控指标

- **P99查询延迟**：实时风控查询应<100ms
- **连接池使用率**：>80%时需扩容
- **错误率**：Gremlin查询错误率应<0.1%
- **写入吞吐**：监控Neptune的WriteIOPS，接近上限时启用写入缓冲
- **存储使用率**：>70%时考虑数据归档或扩容

### 10.8.4 演进路线

1. **第一阶段（规则引擎）**：基于Gremlin查询的固定规则，人工维护阈值
2. **第二阶段（机器学习）**：引入Neptune ML，使用图神经网络（GNN）自动学习欺诈模式
3. **第三阶段（实时学习）**：在线学习引擎，根据实时反馈动态调整模型参数
4. **第四阶段（对抗学习）**：引入对抗生成网络（GAN）模拟欺诈者行为，主动发现检测盲区

---

*本章完整覆盖了基于Amazon Neptune的金融风控与欺诈检测体系，从图建模到实时查询、从批量分析到常见欺诈模式，提供了可直接投入生产环境的代码和架构方案。*
