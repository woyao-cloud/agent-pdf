# 第11章 Amazon Neptune 与 LLM 集成：知识图谱增强的大模型应用

## 11.1 概述

大语言模型（LLM）的兴起为知识密集型应用带来了革命性变化，但纯 LLM 方案面临幻觉（hallucination）、知识截止日期、缺乏结构化推理能力等根本性挑战。图数据库天然擅长表达和查询实体间的复杂关系，将图数据库作为 LLM 的外部知识存储与推理引擎，是解决上述问题的关键路径。

Amazon Neptune 是 AWS 提供的完全托管图数据库服务，支持 SPARQL（RDF）、Gremlin（属性图）和 openCypher（Cypher 兼容）三种查询语言。本章从架构原理到实战代码，全面覆盖 Neptune 与 LLM 集成的技术栈。

---

## 11.2 Amazon Neptune 架构概述

### 11.2.1 解决的问题

传统关系数据库在处理多对多关系、深度关联查询（如"查找与目标账户距离不超过3跳的所有交易"）时，需要大量 JOIN 操作，性能随深度指数级下降。Neptune 专为这类图遍历场景设计，提供毫秒级深度查询能力。

### 11.2.2 核心原理

Neptune 采用**存储与计算分离**架构，由三个核心层组成：

**存储引擎（Storage Engine）**
- 专为图数据设计的分布式存储层，使用 SSD 存储
- 数据在3个可用区（AZ）间自动复制6份副本（共6副本，跨3个AZ）
- 支持高达 128 TiB 的存储容量，自动扩展
- 快照备份到 S3，支持时间点恢复（PITR）

**查询引擎（Query Engine）**
- 同时支持三种查询语言：SPARQL 1.1、Apache TinkerPop Gremlin 3.x、openCypher（Neptune 1.2+）
- 查询编译器将 Gremlin/SPARQL/openCypher 统一编译为底层图执行计划
- 支持查询结果流式返回，避免大结果集内存溢出

**集群管理层（Cluster Management）**
- 主实例（Writer）处理写入和强一致性读取
- 最多15个只读副本（Reader），分布在多个 AZ
- 自动故障转移（failover），通常在30秒内完成
- 终端节点（Endpoint）分为：集群端点（自动路由写入）、读取器端点（负载均衡只读）、自定义端点

```
┌─────────────────────────────────────────────────────┐
│                    Client Applications              │
├─────────────────────────────────────────────────────┤
│  SPARQL  │  Gremlin  │  openCypher  │  LangChain   │
├──────────┴───────────┴──────────────┴──────────────┤
│              Query Engine Layer                     │
│  ┌─────────┐ ┌──────────┐ ┌────────────┐          │
│  │ SPARQL  │ │ Gremlin  │ │ openCypher │          │
│  │ Parser  │ │ Compiler │ │  Compiler  │          │
│  └────┬────┘ └────┬─────┘ └─────┬──────┘          │
│       └───────────┴─────────────┘                  │
│                    │  Unified Execution Plan        │
├────────────────────┴────────────────────────────────┤
│              Storage Engine Layer                   │
│  ┌──────────────────────────────────────────────┐  │
│  │  SSD-backed Distributed Log Store             │  │
│  │  6 replicas across 3 AZs, auto-scale to 128TB│  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 11.2.3 代码/配置实现

**创建 Neptune 集群（AWS CDK Java）：**

```java
import software.amazon.awscdk.services.neptune.CfnDBCluster;
import software.amazon.awscdk.services.neptune.CfnDBInstance;
import software.amazon.awscdk.services.ec2.*;

public class NeptuneClusterStack {
    public void createCluster(Vpc vpc) {
        // 创建子网组
        CfnDBSubnetGroup subnetGroup = CfnDBSubnetGroup.Builder.create(this, "NeptuneSubnetGroup")
            .dbSubnetGroupDescription("Subnet group for Neptune")
            .subnetIds(vpc.getPrivateSubnets().stream()
                .map(Subnet::getSubnetId).collect(Collectors.toList()))
            .build();

        // 创建安全组
        SecurityGroup neptuneSg = SecurityGroup.Builder.create(this, "NeptuneSG")
            .vpc(vpc)
            .description("Security group for Neptune")
            .allowAllOutbound(true)
            .build();
        neptuneSg.addIngressRule(Peer.anyIpv4(), Port.tcp(8182), "Allow Gremlin");
        neptuneSg.addIngressRule(Peer.anyIpv4(), Port.tcp(8182), "Allow SPARQL/opencypher");

        // 创建集群
        CfnDBCluster cluster = CfnDBCluster.Builder.create(this, "NeptuneCluster")
            .dbClusterIdentifier("knowledge-graph-cluster")
            .engine("neptune")
            .dbSubnetGroupName(subnetGroup.getRef())
            .vpcSecurityGroupIds(List.of(neptuneSg.getSecurityGroupId()))
            .storageEncrypted(true)
            .backupRetentionPeriod(7)
            .deletionProtection(true)
            .build();

        // 创建主实例
        CfnDBInstance writer = CfnDBInstance.Builder.create(this, "NeptuneWriter")
            .dbInstanceClass("db.r6g.large")
            .dbClusterIdentifier(cluster.getRef())
            .dbInstanceIdentifier("knowledge-graph-writer")
            .build();
    }
}
```

### 11.2.4 使用场景

- 知识图谱存储与查询（企业知识管理、产品知识库）
- 社交网络分析（好友关系、影响力传播）
- 金融风控（交易链路追踪、团伙欺诈检测）
- 供应链管理（多级供应商关系、物料溯源）
- 生命科学（药物-靶点-疾病关系网络）

### 11.2.5 潜在风险与注意事项

- **跨区域延迟**：Neptune 不支持跨区域复制，多区域部署需自行实现
- **写入吞吐限制**：单集群写入受主实例规格限制，高写入场景需考虑分片策略
- **查询超时**：默认查询超时120秒，复杂遍历需优化或调整 `queryTimeout` 参数
- **成本**：即使空闲也需支付实例费用，Serverless 可缓解但冷启动有延迟

### 11.2.6 本章小结

Neptune 的存算分离架构和三种查询语言支持使其成为构建知识图谱应用的理想选择。理解其架构层次是后续集成 LLM 的基础。

---

## 11.3 Neptune 引擎类型

### 11.3.1 解决的问题

不同工作负载对图数据库的需求差异巨大：在线交易需要强一致性和 ACID，大规模分析需要高吞吐并行计算，开发测试需要弹性伸缩。单一引擎无法满足所有场景。

### 11.3.2 核心原理

**Neptune DB（事务型）**
- 完全 ACID 兼容，支持快照隔离级别
- 适用于 OLTP 场景：实时查询、在线交易、交互式图遍历
- 实例类型：`db.r6g`、`db.r7g`（Graviton）、`db.r5` 等
- 最大 128 TiB 存储，自动扩展

**Neptune Analytics（分析型）**
- 基于内存的图分析引擎，使用 DuckDB 和 Apache Arrow
- 内置 PageRank、社区检测（Louvain）、最短路径、中心性分析等算法
- 数据从 Neptune DB 快照或 S3 加载到内存分析环境
- 适用于批处理分析、周期性报告、图挖掘

**Neptune Serverless**
- 自动扩缩容，按实际查询消耗的 NCU（Neptune Capacity Unit）计费
- 范围：2.5 NCU ~ 128 NCU（约 2.5 GB ~ 128 GB 内存）
- 冷启动延迟约 1-3 秒，适合开发测试和间歇性工作负载
- 支持与 Neptune DB 相同的查询语言和功能

| 特性 | Neptune DB | Neptune Analytics | Neptune Serverless |
|------|-----------|-------------------|-------------------|
| 事务支持 | ACID | 无 | ACID |
| 查询语言 | SPARQL/Gremlin/OC | Gremlin + SQL | SPARQL/Gremlin/OC |
| 内置图算法 | 无 | PageRank/Louvain/等 | 无 |
| 计费模式 | 按实例小时 | 按分析小时 | 按 NCU 小时 |
| 适用场景 | OLTP 在线查询 | OLAP 批量分析 | 弹性/开发场景 |

### 11.3.3 代码/配置实现

**Serverless 集群创建（AWS CLI）：**

```bash
aws neptune create-db-cluster \
    --db-cluster-identifier neptune-serverless-demo \
    --engine neptune \
    --serverless-v2-scaling-configuration MinCapacity=2.5,MaxCapacity=128.0 \
    --vpc-security-group-ids sg-12345678 \
    --db-subnet-group-name my-subnet-group
```

**Neptune Analytics 创建分析图（Python）：**

```python
import boto3

neptune_analytics = boto3.client('neptune-graph')

# 创建分析图
response = neptune_analytics.create_graph(
    graphName='supply-chain-analytics',
    tags={'Project': 'SupplyChain'},
    vectorSearchConfiguration={
        'dimension': 1536  # 支持向量搜索维度
    }
)
graph_id = response['graphId']
print(f"Analytics Graph ID: {graph_id}")

# 从 Neptune DB 快照加载数据
neptune_analytics.start_import(
    importTasks=[{
        'source': {
            'type': 'NEPTUNE_DB_SNAPSHOT',
            'snapshotIdentifier': 'arn:aws:neptune:us-east-1:123456789012:snapshot:my-snapshot'
        },
        'format': 'NEPTUNE_CSV',
        'roleArn': 'arn:aws:iam::123456789012:role/NeptuneAnalyticsRole'
    }],
    graphId=graph_id
)

# 运行 PageRank 分析
result = neptune_analytics.execute_query(
    graphId=graph_id,
    queryString="CALL neptune.algo.pageRank() YIELD node, rank RETURN node.id, rank ORDER BY rank DESC LIMIT 10",
    language="OPENCYPHER"
)
```

### 11.3.4 使用场景

- **Neptune DB**：在线知识图谱查询、实时风控、用户实时推荐
- **Neptune Analytics**：全图 PageRank 分析、社区发现、周期性供应链报告
- **Neptune Serverless**：开发测试环境、低频查询应用、POC 验证

### 11.3.5 潜在风险与注意事项

- Neptune Analytics 不支持实时写入，需从快照或 S3 加载
- Serverless 冷启动在突发流量下可能导致查询延迟抖动
- 不同引擎间数据同步需自行实现 ETL 流程

### 11.3.6 本章小结

根据工作负载特性选择引擎：在线查询用 Neptune DB，批量分析用 Neptune Analytics，弹性场景用 Serverless。生产环境通常采用 Neptune DB + Neptune Analytics 的混合架构。

---

## 11.4 Neptune 数据模型与查询语言

### 11.4.1 解决的问题

图数据有两种主流建模方式：RDF（资源描述框架）和属性图（Property Graph）。Neptune 同时支持两者，开发者需根据业务场景选择最合适的建模方式和查询语言。

### 11.4.2 核心原理

**SPARQL（RDF 模型）**
- 数据以三元组（主体-谓词-客体）表示：`<Alice> <knows> <Bob>`
- 遵循 W3C 标准，支持 RDFS/OWL 推理
- 适合数据交换、语义网、本体驱动的知识图谱
- 查询示例：`SELECT ?s ?o WHERE { ?s <knows> ?o }`

**Gremlin（属性图模型）**
- 数据以顶点（Vertex）和边（Edge）表示，顶点和边可带属性
- 基于遍历（Traversal）的声明式+命令式混合查询
- 适合深度遍历、路径发现、图算法
- 查询示例：`g.V().has('name','Alice').out('knows').values('name')`

**openCypher（属性图模型）**
- 与 Gremlin 相同的属性图数据模型
- 使用 ASCII-art 模式匹配语法：`(a)-[:KNOWS]->(b)`
- 兼容 Neo4j Cypher 语法子集
- 适合模式匹配和声明式查询

### 11.4.3 代码/代码实现

#### SPARQL 示例：查询药物-靶点关系

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX drug: <http://example.org/drug/>

# 查询与特定靶点相关的所有药物及其作用机制
SELECT ?drug ?drugName ?mechanism ?confidence
WHERE {
  ?drug rdf:type drug:Drug ;
        drug:hasTarget drug:Target_EGFR ;
        drug:name ?drugName .
  OPTIONAL { ?drug drug:mechanism ?mechanism }
  OPTIONAL { ?drug drug:confidence ?confidence }
}
ORDER BY DESC(?confidence)
LIMIT 20
```

**Java SPARQL 客户端：**

```java
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class NeptuneSparqlClient {
    private final String endpoint;
    private final CloseableHttpClient httpClient;
    private final ObjectMapper mapper;

    public NeptuneSparqlClient(String endpoint) {
        this.endpoint = endpoint + "/sparql";
        this.httpClient = HttpClients.createDefault();
        this.mapper = new ObjectMapper();
    }

    public JsonNode query(String sparql) throws Exception {
        HttpPost post = new HttpPost(endpoint);
        post.setHeader("Content-Type", "application/x-www-form-urlencoded");
        post.setEntity(new StringEntity("query=" + java.net.URLEncoder.encode(sparql, "UTF-8")));
        String response = EntityUtils.toString(httpClient.execute(post).getEntity());
        return mapper.readTree(response);
    }

    public static void main(String[] args) throws Exception {
        NeptuneSparqlClient client = new NeptuneSparqlClient(
            "https://your-neptune-endpoint:8182");

        String query = "PREFIX drug: <http://example.org/drug/>\n" +
            "SELECT ?drug ?name WHERE {\n" +
            "  ?drug drug:hasTarget drug:Target_EGFR ;\n" +
            "        drug:name ?name .\n" +
            "} LIMIT 10";

        JsonNode result = client.query(query);
        result.get("results").get("bindings").forEach(binding -> {
            System.out.println(binding.get("name").get("value").asText());
        });
    }
}
```

#### Gremlin 示例：社交网络查询

```groovy
// 查找 Alice 的二度好友及其共同群组
g.V().has('person', 'name', 'Alice')
 .union(
    // 直接好友
    out('knows').hasLabel('person').values('name'),
    // 二度好友（朋友的朋友）
    out('knows').out('knows')
      .where(neq('Alice'))
      .dedup().values('name'),
    // 共同群组
    out('member_of').in('member_of')
      .where(neq('Alice'))
      .dedup().values('name')
 )
 .fold()
 .project('direct_friends', 'friends_of_friends', 'common_groups')
```

**Python Gremlin 客户端：**

```python
from gremlin_python.driver import client, serializer
from gremlin_python.driver.protocol import GremlinServerError
import asyncio

class NeptuneGremlinClient:
    def __init__(self, endpoint: str, port: int = 8182):
        self.url = f"wss://{endpoint}:{port}/gremlin"
        self.client = client.Client(
            self.url, 'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )

    def query(self, gremlin_query: str, bindings: dict = None):
        try:
            result = self.client.submit(gremlin_query, bindings or {})
            return result.all().result()
        except GremlinServerError as e:
            print(f"Gremlin error: {e}")
            raise

    def close(self):
        self.client.close()

# 使用示例
neptune = NeptuneGremlinClient("your-neptune-cluster.cluster-xxx.us-east-1.neptune.amazonaws.com")

# 查找影响力路径
result = neptune.query("""
    g.V().has('account', 'accountId', 'ACC-001')
     .repeat(out('transfers').simplePath())
     .times(3)
     .has('account', 'riskLevel', 'high')
     .path()
     .by('accountId')
     .by('amount')
""")

for path in result:
    print(f"Path: {' -> '.join(str(p) for p in path)}")
```

#### openCypher 示例：供应链查询

```cypher
// 查找特定产品的多级供应商
MATCH (product:Product {productId: 'PROD-100'})
MATCH path = (product)<-[:SUPPLIES*1..5]-(supplier:Supplier)
WHERE ALL(rel IN relationships(path) WHERE rel.status = 'active')
RETURN supplier.name AS supplier_name,
       supplier.tier AS tier,
       length(path) AS hop_count,
       [node IN nodes(path) | node.name] AS supply_chain
ORDER BY hop_count
LIMIT 50
```

### 11.4.4 使用场景

| 查询语言 | 最佳场景 | 典型用户 |
|---------|---------|---------|
| SPARQL | 语义网、本体推理、数据联邦 | 知识图谱工程师、数据科学家 |
| Gremlin | 深度遍历、路径分析、图算法 | 图数据库开发者、反欺诈工程师 |
| openCypher | 模式匹配、声明式查询 | Cypher 背景开发者、Neo4j 迁移 |

### 11.4.5 潜在风险与注意事项

- **语言混用限制**：同一集群支持三种语言，但跨语言的事务隔离需注意
- **Gremlin 遍历深度**：`repeat().times(N)` 的 N 值过大会导致查询超时，建议 N ≤ 10
- **SPARQL 推理性能**：启用 OWL 推理会显著增加查询延迟
- **openCypher 兼容性**：Neptune 的 openCypher 实现并非 100% 兼容 Neo4j Cypher

### 11.4.6 本章小结

三种查询语言覆盖了从语义网到属性图的全谱系需求。对于 LLM 集成场景，Gremlin 和 openCypher 更适合表达路径遍历和模式匹配，SPARQL 更适合本体驱动的知识检索。

---

## 11.5 Neptune + LLM 集成模式（核心章节）

### 11.5.1 解决的问题

LLM 的知识来自训练数据，存在三个根本缺陷：
1. **知识截止**：训练数据有截止日期，无法获取最新信息
2. **幻觉**：对不确定的事实会编造答案
3. **缺乏结构化推理**：无法进行多跳关系推理

图数据库作为 LLM 的外部知识存储，可以精确存储实体关系，通过图遍历实现结构化推理，从根本上解决上述问题。

### 11.5.2 核心原理

Neptune + LLM 集成有四种核心模式，按复杂度递增排列：

```
模式1: Graph RAG ── 图增强检索生成
  用户问题 → 图检索(子图) → LLM生成(图上下文) → 答案

模式2: 外部记忆 ── 知识图谱作为持久化记忆
  用户问题 → LLM解析实体 → 图查询关系 → LLM推理 → 答案

模式3: 图引导推理 ── 图遍历指导LLM推理链
  用户问题 → 图遍历路径 → 路径引导提示 → LLM逐步推理 → 答案

模式4: Agent + 图工具 ── LLM Agent 调用图查询工具
  用户问题 → LLM Agent → 调用图工具 → 观察结果 → 循环推理 → 答案
```

---

### 11.5.3 模式一：Graph RAG（图增强检索生成）

#### 解决的问题

传统 RAG 使用向量相似度检索文本块，但无法捕获实体间的结构关系。例如"A 投资了 B 公司，B 的 CEO 是 C，C 还担任 D 的董事"，向量检索只能找到包含这些实体的文本块，但无法理解其中的关系链。

#### 核心原理

Graph RAG 将知识图谱作为检索源，检索过程返回子图结构而非纯文本，LLM 在生成时同时获得实体信息和关系结构。

```
用户问题
    │
    ▼
┌─────────────────────┐
│ 实体识别与链接       │  ← LLM 或 NER 模型
│ "A公司" "B公司"     │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 图检索（子图提取）   │  ← Neptune Gremlin/SPARQL
│ 1跳/2跳邻居子图     │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 子图序列化           │  ← 图 → 文本
│ "A--投资→B"         │
│ "B--CEO→C"          │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ LLM 生成             │  ← 上下文增强
│ 图结构 + 问题 → 答案 │
└─────────────────────┘
```

#### 代码/代码实现

**完整 Graph RAG 实现（Python）：**

```python
import boto3
import json
from typing import List, Dict, Any
from gremlin_python.driver import client, serializer

class NeptuneGraphRAG:
    """Neptune 图增强检索生成器"""

    def __init__(self, neptune_endpoint: str, region: str = "us-east-1"):
        self.neptune_client = client.Client(
            f"wss://{neptune_endpoint}:8182/gremlin", 'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        self.bedrock = boto3.client('bedrock-runtime', region_name=region)

    def _extract_entities(self, question: str) -> List[str]:
        """使用 LLM 从问题中提取实体"""
        prompt = f"""从以下问题中提取关键实体名称，返回 JSON 数组。
问题：{question}
只返回实体名称列表，格式：["实体1", "实体2", ...]"""
        
        response = self.bedrock.invoke_model(
            modelId="anthropic.claude-3-sonnet-20240229-v1:0",
            contentType="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}]
            })
        )
        result = json.loads(response['body'].read())
        content = result['content'][0]['text']
        return json.loads(content)

    def _retrieve_subgraph(self, entities: List[str], max_depth: int = 2) -> str:
        """从 Neptune 检索实体周围的子图并序列化为文本"""
        subgraph_parts = []
        
        for entity in entities:
            # 查询实体的一跳和二跳邻居
            query = f"""
            g.V().has('name', '{entity}')
             .union(
                // 出边邻居
                outE().inV().path().by('name').by(label).by('name'),
                // 入边邻居
                inE().outV().path().by('name').by(label).by('name')
             )
             .limit(50)
             .toList()
            """
            
            try:
                paths = self.neptune_client.submit(query).all().result()
                for path in paths:
                    if len(path.objects) == 3:
                        src, rel, tgt = path.objects
                        subgraph_parts.append(f"{src} --[{rel}]--> {tgt}")
            except Exception as e:
                print(f"Query error for {entity}: {e}")
        
        return "\n".join(subgraph_parts)

    def _build_context(self, subgraph_text: str, question: str) -> str:
        """构建包含图结构的增强提示"""
        return f"""你是一个知识图谱增强的 AI 助手。以下是相关的知识图谱关系数据：

{'-'*40}
知识图谱关系：
{subgraph_text}
{'-'*40}

请基于上述知识图谱中的结构化关系回答以下问题。如果图谱信息不足以回答问题，请明确指出。
注意图谱中的关系方向：A --[关系]--> B 表示 A 指向 B。

问题：{question}

回答："""

    def query(self, question: str) -> str:
        """执行 Graph RAG 查询"""
        # 1. 实体提取
        entities = self._extract_entities(question)
        print(f"提取实体: {entities}")
        
        # 2. 图检索
        subgraph = self._retrieve_subgraph(entities)
        print(f"检索到子图: {len(subgraph.split(chr(10)))} 条关系")
        
        # 3. 构建增强上下文
        prompt = self._build_context(subgraph, question)
        
        # 4. LLM 生成
        response = self.bedrock.invoke_model(
            modelId="anthropic.claude-3-sonnet-20240229-v1:0",
            contentType="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}]
            })
        )
        result = json.loads(response['body'].read())
        return result['content'][0]['text']

    def close(self):
        self.neptune_client.close()


# ========== 使用示例 ==========
if __name__ == "__main__":
    rag = NeptuneGraphRAG(
        neptune_endpoint="your-cluster.cluster-xxx.us-east-1.neptune.amazonaws.com"
    )
    
    answer = rag.query("A公司投资了哪些企业？这些企业的CEO是否在其他公司担任董事？")
    print(f"答案：\n{answer}")
    
    rag.close()
```

#### 使用场景

- 企业知识库问答（组织结构、产品关系、项目依赖）
- 金融关系查询（投资关系、股权穿透、关联交易）
- 医疗知识问答（药物相互作用、疾病-症状关系）
- 法律条文关联查询（法条引用、判例关系）

#### 潜在风险与注意事项

- 子图大小控制：2跳子图可能指数级增长，需设置 `limit` 和 `max_depth`
- 实体链接准确性：LLM 提取的实体名需与图中精确匹配，建议使用模糊匹配或别名表
- 上下文窗口限制：序列化后的子图文本可能超过 LLM 上下文长度，需截断或摘要

---

### 11.5.4 模式二：知识图谱作为 LLM 外部记忆

#### 解决的问题

LLM 在对话中缺乏长期记忆，无法记住之前提到的实体关系。将知识图谱作为持久化外部记忆，每次推理时从图中检索相关实体关系，实现"记忆持久化"。

#### 核心原理

每次 LLM 推理前，从 Neptune 查询与当前上下文相关的实体关系，将结果注入提示词。同时，LLM 生成的新知识可以写回 Neptune，实现记忆的持续更新。

```
对话历史 + 当前问题
        │
        ▼
┌─────────────────────┐
│ 从Neptune检索相关记忆 │  ← 基于实体和关系的图查询
│ "用户上次提到项目X"  │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ LLM 推理（记忆增强）  │
│ 历史记忆 + 图数据    │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 新知识写入Neptune    │  ← 提取新实体关系并持久化
│ "用户决定采用方案Y"  │
└─────────────────────┘
```

#### 代码/代码实现

```python
from gremlin_python.driver import client, serializer
from datetime import datetime
import json

class NeptuneExternalMemory:
    """基于 Neptune 的 LLM 外部记忆系统"""

    def __init__(self, neptune_endpoint: str):
        self.gremlin = client.Client(
            f"wss://{neptune_endpoint}:8182/gremlin", 'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )

    def retrieve_memory(self, session_id: str, entities: List[str]) -> str:
        """检索与当前会话和实体相关的记忆"""
        memory_parts = []
        
        for entity in entities:
            query = f"""
            g.V().has('entity', 'name', '{entity}')
             .outE('related_to', 'mentioned_in', 'part_of')
             .inV()
             .hasLabel('memory', 'entity')
             .values('content', 'name')
             .fold()
            """
            try:
                results = self.gremlin.submit(query).all().result()
                for r in results:
                    if r:
                        memory_parts.append(str(r))
            except Exception:
                pass
        
        # 也检索会话级别的记忆
        session_query = f"""
        g.V().has('session', 'sessionId', '{session_id}')
         .out('has_memory')
         .values('content')
         .fold()
        """
        try:
            session_memories = self.gremlin.submit(session_query).all().result()
            for m in session_memories:
                if m:
                    memory_parts.append(str(m))
        except Exception:
            pass
        
        return "\n".join(memory_parts) if memory_parts else "无相关记忆"

    def store_memory(self, session_id: str, subject: str, relation: str, 
                     obj: str, content: str = ""):
        """将新知识写入 Neptune 记忆图"""
        timestamp = datetime.utcnow().isoformat()
        
        query = f"""
        g.V().has('session', 'sessionId', '{session_id}')
         .fold()
         .coalesce(
            unfold(),
            g.addV('session').property('sessionId', '{session_id}')
         )
         .addV('memory')
         .property('content', '{content.replace(chr(39), chr(39)*2)}')
         .property('timestamp', '{timestamp}')
         .property('subject', '{subject}')
         .property('relation', '{relation}')
         .property('object', '{obj}')
         .as('mem')
         .V().has('entity', 'name', '{subject}')
         .fold()
         .coalesce(
            unfold(),
            g.addV('entity').property('name', '{subject}')
         )
         .addE('mentioned_in').to('mem')
         .toList()
        """
        self.gremlin.submit(query).all().result()

    def close(self):
        self.gremlin.close()


# 使用示例
memory = NeptuneExternalMemory("your-neptune-endpoint")

# 存储对话中产生的新知识
memory.store_memory(
    session_id="ses-001",
    subject="ProjectX",
    relation="采用技术栈",
    obj="Python + Neptune",
    content="用户决定在 ProjectX 中使用 Python 和 Neptune 构建知识图谱"
)

# 检索相关记忆
entities = ["ProjectX", "技术栈"]
past_memory = memory.retrieve_memory("ses-001", entities)
print(f"检索到的记忆：\n{past_memory}")
```

#### 使用场景

- 长期对话助手（记住用户偏好、项目历史）
- 企业知识管理（持续积累组织知识）
- 研究助手（跟踪研究脉络、实验记录）

#### 潜在风险与注意事项

- 记忆污染：错误信息写入后会影响后续推理，需设计验证机制
- 记忆膨胀：需定期清理过期或低质量记忆
- 写入延迟：Neptune 写入有毫秒级延迟，高频写入需批量处理

---

### 11.5.5 模式三：图结构引导的 LLM 推理链

#### 解决的问题

LLM 在多跳推理（multi-hop reasoning）中容易丢失中间步骤，尤其在需要跟踪实体间长距离关系时。图遍历天然提供了结构化的推理路径。

#### 核心原理

先通过图遍历找到实体间的路径，然后将路径上的每个节点和边作为推理步骤的"锚点"，引导 LLM 沿着图结构逐步推理。

```
问题："A公司通过哪些路径最终控制E公司？"

图遍历结果路径：
A --[持股51%]--> B --[持股30%]--> C --[持股60%]--> D --[持股25%]--> E

构建推理链提示：
Step 1: A 持有 B 51% 股权 → B 是 A 的子公司
Step 2: B 持有 C 30% 股权 → C 是 B 的联营公司
Step 3: C 持有 D 60% 股权 → D 是 C 的子公司
Step 4: D 持有 E 25% 股权 → E 是 D 的重要参股公司
结论: A 通过 B→C→D 的链条对 E 拥有间接控制权
```

#### 代码/代码实现

```python
class GraphGuidedReasoning:
    """图结构引导的 LLM 推理链"""

    def __init__(self, neptune_endpoint: str):
        self.gremlin = client.Client(
            f"wss://{neptune_endpoint}:8182/gremlin", 'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        self.bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

    def find_reasoning_paths(self, start_entity: str, end_entity: str, 
                             max_hops: int = 5) -> List[Dict]:
        """查找两个实体间的所有路径"""
        query = f"""
        g.V().has('name', '{start_entity}')
         .repeat(outE().inV().simplePath())
         .times({max_hops})
         .has('name', '{end_entity}')
         .path()
         .limit(10)
         .toList()
        """
        
        paths = self.gremlin.submit(query).all().result()
        result = []
        
        for p in paths:
            path_steps = []
            for i in range(0, len(p.objects) - 1, 2):
                if i + 1 < len(p.objects):
                    source = p.objects[i]
                    edge = p.objects[i + 1]
                    target = p.objects[i + 2] if i + 2 < len(p.objects) else None
                    if target:
                        path_steps.append({
                            'source': str(source),
                            'relation': str(edge),
                            'target': str(target)
                        })
            result.append(path_steps)
        
        return result

    def build_reasoning_prompt(self, question: str, paths: List[Dict]) -> str:
        """基于图路径构建逐步推理提示"""
        prompt = f"""问题：{question}

以下是图数据库检索到的实体关系路径。请沿着每条路径逐步推理，最后给出综合结论。

"""
        for idx, path in enumerate(paths):
            prompt += f"\n路径 {idx + 1}:\n"
            for step in path:
                prompt += f"  {step['source']} --[{step['relation']}]--> {step['target']}\n"
            
            prompt += f"\n逐步推理（路径 {idx + 1}）:\n"
            for i, step in enumerate(path):
                prompt += (
                    f"步骤 {i + 1}: {step['source']} 通过 {step['relation']} "
                    f"连接到 {step['target']}。"
                )
                if '持股' in step['relation'] or '控股' in step['relation']:
                    prompt += " 这表示控制权或所有权的传递。"
                elif '投资' in step['relation']:
                    prompt += " 这表示资本流动方向。"
                prompt += "\n"
        
        prompt += "\n综合结论：请基于以上所有路径的推理，给出最终答案。"
        return prompt

    def reason(self, question: str, start: str, end: str) -> str:
        paths = self.find_reasoning_paths(start, end)
        if not paths:
            return f"未找到从 {start} 到 {end} 的路径"
        
        prompt = self.build_reasoning_prompt(question, paths)
        
        response = self.bedrock.invoke_model(
            modelId="anthropic.claude-3-sonnet-20240229-v1:0",
            contentType="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2048,
                "messages": [{"role": "user", "content": prompt}]
            })
        )
        result = json.loads(response['body'].read())
        return result['content'][0]['text']

    def close(self):
        self.gremlin.close()
```

#### 使用场景

- 股权穿透分析（"公司A如何控制公司Z？"）
- 金融交易溯源（"资金如何从账户X流向账户Y？"）
- 知识推理（"药物A通过哪些生物通路影响疾病B？"）
- 社交关系分析（"用户A通过什么关系链认识用户B？"）

#### 潜在风险与注意事项

- 路径爆炸：在密集图中，两个节点间可能存在指数级路径，需限制 `limit` 和 `max_hops`
- 推理深度：超过5跳的路径对 LLM 的推理能力挑战较大，建议分阶段推理
- 关系语义：边标签的语义需要清晰，否则 LLM 可能误解关系含义

---

### 11.5.6 模式四：LLM Agent + 图工具

#### 解决的问题

前三种模式中图查询逻辑是硬编码的，无法灵活应对多样化的用户问题。LLM Agent 可以自主决定何时以及如何查询图数据库。

#### 核心原理

LLM Agent 将图查询作为工具（Tool），根据用户问题自主选择调用 Gremlin/SPARQL/openCypher 查询，观察结果后决定下一步行动。

```python
from langchain.agents import AgentExecutor, create_react_agent
from langchain.tools import Tool
from langchain.prompts import PromptTemplate
from langchain_community.chat_models import ChatBedrock
from langchain_community.graphs import NeptuneGraph
from langchain_community.chains.graph_qa.neptune_sparql import NeptuneSparqlQAChain
from langchain_community.chains.graph_qa.neptune_cypher import NeptuneOpenCypherQAChain

class NeptuneAgent:
    """LLM Agent + Neptune 图查询工具"""

    def __init__(self, neptune_endpoint: str, region: str = "us-east-1"):
        self.graph = NeptuneGraph(
            host=neptune_endpoint,
            port=8182,
            use_https=True
        )
        self.llm = ChatBedrock(
            model_id="anthropic.claude-3-sonnet-20240229-v1:0",
            region_name=region,
            model_kwargs={"temperature": 0}
        )

    def _create_tools(self) -> List[Tool]:
        """创建图查询工具集"""
        
        # 工具1: openCypher 查询
        cypher_chain = NeptuneOpenCypherQAChain.from_llm(
            llm=self.llm,
            graph=self.graph,
            verbose=True,
            validate_cypher=True,
            top_k=10
        )
        
        # 工具2: SPARQL 查询
        sparql_chain = NeptuneSparqlQAChain.from_llm(
            llm=self.llm,
            graph=self.graph,
            verbose=True,
            top_k=10
        )

        # 工具3: 自定义 Gremlin 查询
        def gremlin_query(query: str) -> str:
            """执行 Gremlin 查询并返回结果"""
            result = self.graph.query(query)
            return str(result)

        return [
            Tool(
                name="openCypher查询",
                func=cypher_chain.run,
                description=(
                    "用于查询属性图的 Cypher 查询。输入应为自然语言问题，"
                    "会自动转换为 openCypher 查询。适用于：查找实体关系、"
                    "路径分析、模式匹配。"
                )
            ),
            Tool(
                name="SPARQL查询",
                func=sparql_chain.run,
                description=(
                    "用于查询 RDF 知识图谱的 SPARQL 查询。输入应为自然语言问题，"
                    "会自动转换为 SPARQL。适用于：本体查询、语义推理、"
                    "W3C 标准知识图谱。"
                )
            ),
            Tool(
                name="Gremlin遍历",
                func=gremlin_query,
                description=(
                    "执行 Gremlin 图遍历查询。输入应为 Gremlin 查询语句。"
                    "适用于：深度路径遍历、图算法、复杂图分析。"
                )
            )
        ]

    def run(self, question: str) -> str:
        """运行 Agent 处理问题"""
        tools = self._create_tools()
        
        prompt = PromptTemplate.from_template(
            """你是一个图数据库专家助手。你有以下工具可用：
{tools}

工具名称: openCypher查询
工具描述: 用于查询属性图的 Cypher 查询

工具名称: SPARQL查询
工具描述: 用于查询 RDF 知识图谱的 SPARQL 查询

工具名称: Gremlin遍历
工具描述: 执行 Gremlin 图遍历查询

请根据用户问题选择合适的工具。如果需要多步推理，可以依次使用多个工具。

用户问题: {input}

{agent_scratchpad}"""
        )
        
        agent = create_react_agent(
            llm=self.llm,
            tools=tools,
            prompt=prompt
        )
        
        agent_executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True,
            max_iterations=5,
            handle_parsing_errors=True
        )
        
        return agent_executor.invoke({"input": question})
```

#### 使用场景

- 开放式知识问答（用户问题不可预测，Agent 自主选择查询策略）
- 多步骤分析（先查实体再查关系，最后综合分析）
- 混合查询（同时使用图查询和向量搜索）

#### 潜在风险与注意事项

- Agent 循环：LLM 可能陷入重复调用工具的循环，需设置 `max_iterations`
- 查询生成错误：LLM 生成的 Gremlin/SPARQL 可能语法错误，需添加验证和重试
- 权限控制：Agent 调用的查询应限制在只读操作，防止意外写入

---

### 11.5.7 本章小结

四种集成模式各有适用场景：Graph RAG 适合知识问答，外部记忆适合对话系统，图引导推理适合多跳分析，Agent 模式适合复杂开放式查询。生产系统通常组合使用多种模式。

---

## 11.6 图数据库数据分析场景

### 11.6.1 金融交易网络分析

#### 解决的问题

金融交易网络是天然图结构。传统 SQL 无法高效回答"资金从账户A经过不超过5跳最终流向哪些高风险账户"这类深度查询。

#### 核心原理

将账户建模为顶点，交易建模为边，利用图遍历追踪资金流向。

```cypher
// 资金流向追踪（openCypher）
MATCH path = (source:Account {accountId: 'ACC-001'})
      -[:TRANSFERS*1..5]->(target:Account)
WHERE target.riskLevel IN ['high', 'critical']
RETURN [node IN nodes(path) | node.accountId] AS flow_path,
       [rel IN relationships(path) | rel.amount] AS amounts,
       length(path) AS hop_count,
       target.riskLevel
ORDER BY hop_count
LIMIT 100
```

```java
// Java: 循环交易检测
import org.apache.tinkerpop.gremlin.driver.Cluster;
import org.apache.tinkerpop.gremlin.driver.Client;
import org.apache.tinkerpop.gremlin.process.traversal.dsl.graph.GraphTraversalSource;

public class CircularTransactionDetector {
    private final Client client;
    
    public CircularTransactionDetector(String endpoint) {
        Cluster cluster = Cluster.build()
            .addContactPoint(endpoint)
            .port(8182)
            .enableSsl(true)
            .create();
        this.client = cluster.connect();
    }
    
    public List<List<String>> detectCircularTransactions(int maxLength) {
        GraphTraversalSource g = traversal().withRemote(DriverRemoteConnection.using(client));
        
        // 检测长度不超过 maxLength 的循环交易
        List<List<String>> cycles = g.V().hasLabel("account")
            .as("start")
            .repeat(out("transfers").simplePath())
            .times(maxLength)
            .where(eq("start"))
            .path()
            .by("accountId")
            .limit(100)
            .toList()
            .stream()
            .map(path -> path.objects().stream()
                .map(Object::toString)
                .collect(Collectors.toList()))
            .collect(Collectors.toList());
        
        return cycles;
    }
}
```

#### 使用场景

- 反洗钱（AML）资金追踪
- 循环交易检测（刷单、自交易）
- 风险传播路径分析

#### 潜在风险与注意事项

- 大规模图中的循环检测计算量大，建议限制路径长度
- 交易金额的聚合计算需注意精度

---

### 11.6.2 社交网络影响力分析

#### 解决的问题

识别社交网络中的关键意见领袖（KOL）、衡量信息传播路径、发现兴趣社群。

#### 核心原理

使用 PageRank 和社区检测算法分析社交图结构。

```python
# Neptune Analytics 社交网络分析
import boto3

def social_network_analysis(graph_id: str):
    client = boto3.client('neptune-graph')
    
    # 1. PageRank 计算节点影响力
    pagerank_query = """
    CALL neptune.algo.pageRank({
        graphName: 'social_network',
        nodeLabels: ['user'],
        edgeLabels: ['follows'],
        maxIterations: 20,
        dampingFactor: 0.85
    })
    YIELD node, rank
    RETURN node.id AS user_id, node.name AS name, rank
    ORDER BY rank DESC
    LIMIT 20
    """
    
    result = client.execute_query(
        graphId=graph_id,
        queryString=pagerank_query,
        language="OPENCYPHER"
    )
    
    # 2. Louvain 社区检测
    community_query = """
    CALL neptune.algo.louvain({
        graphName: 'social_network',
        nodeLabels: ['user'],
        edgeLabels: ['follows', 'interacts']
    })
    YIELD node, communityId
    RETURN communityId, count(*) AS member_count,
           collect(node.name)[0..5] AS sample_members
    ORDER BY member_count DESC
    """
    
    communities = client.execute_query(
        graphId=graph_id,
        queryString=community_query,
        language="OPENCYPHER"
    )
    
    return pagerank_result, communities
```

#### 使用场景

- 营销 KOL 识别
- 信息传播路径预测
- 社群运营分析

---

### 11.6.3 供应链关系挖掘

#### 解决的问题

现代供应链深度嵌套，企业往往不清楚三级以上供应商的依赖关系。

```cypher
// 多级供应商映射
MATCH path = (product:Product {name: 'Widget-X'})
             <-[:SUPPLIES*1..6]-(supplier:Supplier)
WHERE supplier.riskScore > 0.7
RETURN supplier.name AS risky_supplier,
       supplier.riskScore,
       length(path) AS tier_depth,
       [n IN nodes(path) | n.name] AS supply_chain
ORDER BY tier_depth DESC, supplier.riskScore DESC

// 瓶颈识别：被最多产品依赖的供应商
MATCH (s:Supplier)<-[:SUPPLIES]-(:Product)
WITH s, count(*) AS product_count
WHERE product_count > 5
MATCH (s)<-[:SUPPLIES*1..3]-(raw:RawMaterial)
RETURN s.name, product_count,
       collect(DISTINCT raw.name) AS critical_materials
ORDER BY product_count DESC
```

#### 使用场景

- 供应链风险预警
- 替代供应商发现
- 物料溯源与合规

---

### 11.6.4 异常检测与欺诈分析

#### 核心原理

利用图结构特征识别异常模式：星形结构（一个节点连接大量节点）、环形结构（资金回流）、密集子图（团伙欺诈）。

```python
class FraudDetectionEngine:
    """基于图结构的欺诈检测引擎"""

    def __init__(self, neptune_endpoint: str):
        self.gremlin = client.Client(
            f"wss://{neptune_endpoint}:8182/gremlin", 'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )

    def detect_star_patterns(self, threshold: int = 50) -> List[Dict]:
        """检测星形异常模式：一个账户连接大量其他账户"""
        query = f"""
        g.V().hasLabel('account')
         .where(out('transfers').count().is(gt({threshold})))
         .project('account', 'out_degree', 'total_amount', 'unique_counterparties')
         .by('accountId')
         .by(out('transfers').count())
         .by(out('transfers').values('amount').sum())
         .by(out('transfers').dedup().count())
         .toList()
        """
        return self.gremlin.submit(query).all().result()

    def detect_dense_subgraphs(self, min_density: float = 0.3) -> List[Dict]:
        """检测密集子图：团伙欺诈模式"""
        query = """
        g.V().hasLabel('account')
         .both('transfers')
         .groupCount()
         .unfold()
         .where(select(values).is(gt(5)))
         .project('account_pair', 'transaction_count')
         .by(select(keys).unfold().values('accountId').fold())
         .by(select(values))
         .toList()
        """
        return self.gremlin.submit(query).all().result()

    def real_time_score(self, account_id: str) -> Dict:
        """实时计算账户风险评分"""
        query = f"""
        g.V().has('account', 'accountId', '{account_id}')
         .project('account', 'risk_score', 'anomaly_indicators')
         .by('accountId')
         .by(
            // 风险评分：综合多个图特征
            union(
                out('transfers').count(),                    // 出度
                in('transfers').count(),                      // 入度
                out('transfers').values('amount').mean(),     // 平均转账金额
                out('transfers').where(
                    inV().out('transfers')
                         .has('timestamp', within(.., '2024-01-01'))
                ).count()                                     // 循环交易数
            ).fold()
            .map {{ 
                scores = it.get();
                return scores[0] * 0.2 + scores[1] * 0.2 + 
                       (scores[2] / 10000) * 0.3 + scores[3] * 0.3;
            }}
         )
         .by(
            union(
                out('transfers').where(inV().out('transfers')
                    .has('accountId', '{account_id}')).count(),
                out('transfers').values('amount')
                    .filter(gt(100000)).count()
            ).fold()
         )
         .next()
        """
        return self.gremlin.submit(query).all().result()
```

#### 使用场景

- 实时交易风控
- 团伙欺诈识别
- 账户异常行为检测

---

## 11.7 Neptune + LangChain / LlamaIndex 集成

### 11.7.1 解决的问题

LangChain 和 LlamaIndex 是 LLM 应用开发的主流框架，提供与 Neptune 的官方集成。开发者无需手写图查询逻辑，通过声明式 API 即可实现图增强的 LLM 应用。

### 11.7.2 核心原理

LangChain 提供 `NeptuneGraph` 封装和 `GraphCypherQAChain` / `GraphSparqlQAChain` 等链式组件，自动完成"自然语言 → 图查询 → 结果 → 自然语言"的转换。

### 11.7.3 代码/代码实现

#### LangChain Neptune 集成

```python
from langchain_community.graphs import NeptuneGraph
from langchain_community.chains.graph_qa.neptune_cypher import (
    NeptuneOpenCypherQAChain
)
from langchain_community.chains.graph_qa.neptune_sparql import (
    NeptuneSparqlQAChain
)
from langchain_aws import ChatBedrock
from langchain.prompts import PromptTemplate

# 初始化 Neptune 图连接
graph = NeptuneGraph(
    host="your-cluster.cluster-xxx.us-east-1.neptune.amazonaws.com",
    port=8182,
    use_https=True
)

# 初始化 LLM
llm = ChatBedrock(
    model_id="anthropic.claude-3-sonnet-20240229-v1:0",
    region_name="us-east-1",
    model_kwargs={"temperature": 0}
)

# ===== openCypher QA Chain =====
cypher_chain = NeptuneOpenCypherQAChain.from_llm(
    llm=llm,
    graph=graph,
    verbose=True,
    validate_cypher=True,       # 验证生成的 Cypher 语法
    top_k=10,                   # 返回前 N 条结果
    return_direct=False,        # True 则只返回查询结果不经过 LLM
    cypher_prompt=PromptTemplate.from_template(
        """根据以下图模式生成 openCypher 查询。
图模式：
{schema}
问题：{question}
只返回 openCypher 查询语句，不要任何解释。"""
    )
)

# 执行查询
result = cypher_chain.run("查找与 ProjectX 相关的所有人员及其角色")
print(result)

# ===== SPARQL QA Chain =====
sparql_chain = NeptuneSparqlQAChain.from_llm(
    llm=llm,
    graph=graph,
    verbose=True,
    top_k=10,
    return_direct=False
)

result = sparql_chain.run(
    "查询所有类型为 Drug 且靶向 EGFR 的实体及其作用机制"
)
print(result)
```

#### 自定义图检索器

```python
from langchain.schema import BaseRetriever
from langchain.schema.document import Document
from typing import List
import json

class NeptuneGraphRetriever(BaseRetriever):
    """自定义 Neptune 图检索器，支持混合检索策略"""

    graph: NeptuneGraph
    max_depth: int = 2
    max_nodes: int = 50

    def _get_relevant_documents(self, query: str) -> List[Document]:
        # 策略1: 关键词匹配检索
        keyword_docs = self._keyword_search(query)
        
        # 策略2: 实体关系检索
        entity_docs = self._entity_relation_search(query)
        
        # 策略3: 路径检索
        path_docs = self._path_search(query)
        
        # 合并去重
        seen = set()
        all_docs = []
        for doc in keyword_docs + entity_docs + path_docs:
            if doc.page_content not in seen:
                seen.add(doc.page_content)
                all_docs.append(doc)
        
        return all_docs[:self.max_nodes]

    def _keyword_search(self, query: str) -> List[Document]:
        cypher = f"""
        MATCH (n)
        WHERE n.name CONTAINS '{query}' OR n.description CONTAINS '{query}'
        RETURN n.name AS name, labels(n) AS labels,
               n.description AS description
        LIMIT {self.max_nodes}
        """
        try:
            results = self.graph.query(cypher)
            return [
                Document(
                    page_content=json.dumps(r, ensure_ascii=False),
                    metadata={"source": "neptune_keyword", "type": r.get("labels")}
                )
                for r in results
            ]
        except Exception:
            return []

    def _entity_relation_search(self, query: str) -> List[Document]:
        cypher = f"""
        MATCH (n)-[r]->(m)
        WHERE n.name CONTAINS '{query}' OR m.name CONTAINS '{query}'
        RETURN n.name AS source, type(r) AS relation, m.name AS target,
               r.description AS description
        LIMIT {self.max_nodes}
        """
        try:
            results = self.graph.query(cypher)
            return [
                Document(
                    page_content=f"{r['source']} --[{r['relation']}]--> {r['target']}",
                    metadata={"source": "neptune_relation", "relation": r["relation"]}
                )
                for r in results
            ]
        except Exception:
            return []

    def _path_search(self, query: str) -> List[Document]:
        cypher = f"""
        MATCH path = (start)-[*1..{self.max_depth}]-(end)
        WHERE start.name CONTAINS '{query}' OR end.name CONTAINS '{query}'
        RETURN [n IN nodes(path) | n.name] AS node_path,
               [r IN relationships(path) | type(r)] AS rel_path
        LIMIT 10
        """
        try:
            results = self.graph.query(cypher)
            docs = []
            for r in results:
                path_str = " -> ".join(
                    f"{n}[{r['rel_path'][i] if i < len(r['rel_path']) else ''}]"
                    for i, n in enumerate(r['node_path'])
                )
                docs.append(Document(
                    page_content=path_str,
                    metadata={"source": "neptune_path"}
                ))
            return docs
        except Exception:
            return []
```

#### LlamaIndex Neptune 集成

```python
from llama_index.core import KnowledgeGraphIndex, Settings
from llama_index.core.graph_stores import NeptuneGraphStore
from llama_index.llms.bedrock import Bedrock
from llama_index.embeddings.bedrock import BedrockEmbedding

# 配置
Settings.llm = Bedrock(
    model="anthropic.claude-3-sonnet-20240229-v1:0",
    region_name="us-east-1"
)
Settings.embed_model = BedrockEmbedding(
    model="amazon.titan-embed-text-v2:0",
    region_name="us-east-1"
)

# 初始化 Neptune 图存储
graph_store = NeptuneGraphStore(
    host="your-cluster.cluster-xxx.us-east-1.neptune.amazonaws.com",
    port=8182,
    use_https=True
)

# 创建知识图谱索引
kg_index = KnowledgeGraphIndex.from_documents(
    documents=[],  # 可以从文档自动构建知识图谱
    graph_store=graph_store,
    max_triplets_per_chunk=10,
    include_embeddings=True  # 同时存储向量嵌入
)

# 查询知识图谱
kg_query_engine = kg_index.as_query_engine(
    include_text=True,
    retriever_mode="keyword",  # keyword | embedding | hybrid
    response_type="tree"       # 以树形结构组织答案
)

response = kg_query_engine.query("ProjectX 的负责人是谁？他负责哪些其他项目？")
print(response)
```

#### 向量 + 图混合搜索

```python
from langchain_community.vectorstores import NeptuneVectorStore
from langchain_aws import BedrockEmbeddings

# 初始化嵌入模型
embeddings = BedrockEmbeddings(
    model_id="amazon.titan-embed-text-v2:0",
    region_name="us-east-1"
)

# 创建 Neptune 向量存储
vector_store = NeptuneVectorStore(
    graph=graph,
    embeddings=embeddings,
    node_label="Document",           # 存储向量的顶点标签
    embedding_property="embedding",  # 向量属性名
    id_property="docId"              # 文档 ID 属性
)

# 混合检索：向量相似度 + 图关系
def hybrid_search(query: str, top_k: int = 5):
    # 1. 向量相似度检索
    vector_results = vector_store.similarity_search(query, k=top_k)
    
    # 2. 图关系增强：对每个结果检索其图邻居
    enhanced_docs = []
    for doc in vector_results:
        doc_id = doc.metadata.get("docId")
        if doc_id:
            cypher = f"""
            MATCH (d:Document {{docId: '{doc_id}'}})-[r]->(n)
            RETURN n.name AS related_name, type(r) AS relation,
                   n.description AS description
            LIMIT 5
            """
            relations = graph.query(cypher)
            doc.metadata["graph_context"] = relations
        
        enhanced_docs.append(doc)
    
    return enhanced_docs
```

### 11.7.4 使用场景

- 快速构建知识图谱问答系统
- 企业文档与知识图谱联合检索
- 多模态（向量 + 图）混合搜索

### 11.7.5 潜在风险与注意事项

- LangChain 自动生成的 Cypher/SPARQL 可能不准确，需设置 `validate_cypher=True`
- 图 Schema 信息对 LLM 生成查询至关重要，确保 schema 描述完整
- 生产环境建议对生成的查询进行人工审核或添加查询白名单

### 11.7.6 本章小结

LangChain 和 LlamaIndex 提供了与 Neptune 的高层抽象，大幅降低了开发门槛。对于复杂场景，自定义检索器提供更大的灵活性。

---

## 11.8 Neptune 向量搜索与语义搜索

### 11.8.1 解决的问题

纯图查询依赖精确匹配，无法处理语义相似度搜索。例如"查找与'抗肿瘤药物'概念相似的实体"，需要向量嵌入和语义搜索能力。

### 11.8.2 核心原理

Neptune 支持将向量嵌入存储为顶点属性，通过 `neptune.algo.vectorSearch` 进行近似最近邻（ANN）搜索。结合图遍历，可以实现"向量搜索 → 图遍历增强"的混合查询。

### 11.8.3 代码/代码实现

```python
import numpy as np
from gremlin_python.driver import client, serializer

class NeptuneVectorSearch:
    """Neptune 向量搜索与混合查询"""

    def __init__(self, neptune_endpoint: str):
        self.gremlin = client.Client(
            f"wss://{neptune_endpoint}:8182/gremlin", 'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        self.bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

    def get_embedding(self, text: str) -> List[float]:
        """使用 Bedrock 获取文本嵌入"""
        response = self.bedrock.invoke_model(
            modelId="amazon.titan-embed-text-v2:0",
            contentType="application/json",
            body=json.dumps({"inputText": text})
        )
        result = json.loads(response['body'].read())
        return result['embedding']

    def vector_search(self, query_text: str, top_k: int = 10) -> List[Dict]:
        """向量相似度搜索"""
        embedding = self.get_embedding(query_text)
        embedding_str = json.dumps(embedding)
        
        # 使用 Neptune 的向量搜索
        query = f"""
        g.withSideEffect('Neptune#ml.vectorSearch', {{
            'vectorField': 'embedding',
            'filter': '{'{'}label: 'Entity'{'}'}',
            'k': {top_k}
        }})
        .V()
        .hasLabel('Entity')
        .order()
        .by('neptune_ml_vector_similarity')
        .limit({top_k})
        .project('id', 'name', 'description', 'score')
        .by('entityId')
        .by('name')
        .by('description')
        .by('neptune_ml_vector_similarity')
        .toList()
        """
        
        # 注意：实际 Neptune ML 向量搜索使用不同的 API
        # 这里展示概念，实际实现需使用 NeptuneVectorStore
        return self.gremlin.submit(query).all().result()

    def hybrid_graph_vector_search(self, query_text: str, top_k: int = 5):
        """混合搜索：向量搜索 + 图关系增强"""
        # 1. 向量搜索找到种子节点
        seed_entities = self.vector_search(query_text, top_k)
        
        # 2. 对每个种子节点进行图遍历增强
        results = []
        for entity in seed_entities:
            entity_id = entity['id']
            
            # 查询一跳邻居
            neighbor_query = f"""
            g.V().has('entityId', '{entity_id}')
             .union(
                outE().inV().path()
                    .by('name').by(label).by('name'),
                inE().outV().path()
                    .by('name').by(label).by('name')
             )
             .limit(10)
             .toList()
            """
            
            neighbors = self.gremlin.submit(neighbor_query).all().result()
            
            results.append({
                'entity': entity,
                'neighbors': [
                    {'source': str(p.objects[0]),
                     'relation': str(p.objects[1]),
                     'target': str(p.objects[2])}
                    for p in neighbors if len(p.objects) == 3
                ]
            })
        
        return results

    def close(self):
        self.gremlin.close()
```

### 11.8.4 使用场景

- 语义实体搜索（"找与'糖尿病治疗'相关的药物"）
- 知识图谱补全（发现语义相似的实体关系）
- 推荐系统（向量相似 + 图关系协同过滤）

### 11.8.5 潜在风险与注意事项

- 向量维度限制：Neptune 向量搜索支持最大 2000 维嵌入
- 索引构建时间：大规模向量索引构建需要时间，建议批量写入
- 精度与召回：ANN 搜索是近似算法，精度不如精确搜索

### 11.8.6 本章小结

向量搜索为图数据库增加了语义理解能力，与图遍历结合形成强大的混合查询能力，是 Graph RAG 的关键技术组件。

---

## 11.9 部署与运维最佳实践

### 11.9.1 VPC 与网络安全

```java
// AWS CDK: Neptune VPC 配置
public class NeptuneVpcStack {
    public void configureNetworking() {
        // 隔离 Neptune 在私有子网
        ISubnet[] privateSubnets = vpc.getPrivateSubnets().toArray(new ISubnet[0]);
        
        // Neptune 安全组：仅允许应用服务器访问
        ISecurityGroup appSg = SecurityGroup.fromLookup(this, "AppSG", "sg-xxxxxxxx");
        
        SecurityGroup neptuneSg = SecurityGroup.Builder.create(this, "NeptuneSG")
            .vpc(vpc)
            .description("Neptune cluster security group")
            .build();
        
        // 仅允许应用安全组访问 8182 端口
        neptuneSg.addIngressRule(
            appSg,
            Port.tcp(8182),
            "Allow Gremlin/SPARQL from app servers"
        );
        
        // 禁止公网访问
        neptuneSg.addEgressRule(Peer.anyIpv4(), Port.allTraffic());
    }
}
```

### 11.9.2 IAM 权限策略

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "neptune-db:ReadDataViaQuery",
                "neptune-db:WriteDataViaQuery"
            ],
            "Resource": "arn:aws:neptune-db:us-east-1:123456789012:cluster-xxx/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "neptune-db:GetEngineStatus",
                "neptune-db:ListEngineTasks"
            ],
            "Resource": "*"
        }
    ]
}
```

### 11.9.3 CloudWatch 监控

```python
import boto3

class NeptuneMonitor:
    """Neptune 集群监控"""

    def __init__(self, cluster_id: str, region: str = "us-east-1"):
        self.cloudwatch = boto3.client('cloudwatch', region_name=region)
        self.cluster_id = cluster_id

    def get_metrics(self, minutes: int = 60):
        metrics = [
            "CPUUtilization", "MemoryUtilization",
            "ReadLatency", "WriteLatency",
            "NumQueriesPerSec", "NumActiveQueries",
            "VolumeBytesUsed", "FreeStorage"
        ]
        
        results = {}
        for metric in metrics:
            response = self.cloudwatch.get_metric_statistics(
                Namespace="AWS/Neptune",
                MetricName=metric,
                Dimensions=[{
                    'Name': 'DBClusterIdentifier',
                    'Value': self.cluster_id
                }],
                StartTime=datetime.utcnow() - timedelta(minutes=minutes),
                EndTime=datetime.utcnow(),
                Period=300,
                Statistics=['Average', 'Maximum', 'P99']
            )
            results[metric] = response['Datapoints']
        
        return results

    def set_alarms(self):
        """设置关键告警"""
        alarms = [
            {
                'AlarmName': f'{self.cluster_id}-HighCPU',
                'MetricName': 'CPUUtilization',
                'Threshold': 80.0,
                'ComparisonOperator': 'GreaterThanThreshold'
            },
            {
                'AlarmName': f'{self.cluster_id}-HighLatency',
                'MetricName': 'ReadLatency',
                'Threshold': 50.0,  # 毫秒
                'ComparisonOperator': 'GreaterThanThreshold'
            },
            {
                'AlarmName': f'{self.cluster_id}-LowStorage',
                'MetricName': 'FreeStorage',
                'Threshold': 10.0 * 1024 * 1024 * 1024,  # 10GB
                'ComparisonOperator': 'LessThanThreshold'
            }
        ]
        
        for alarm in alarms:
            self.cloudwatch.put_metric_alarm(
                AlarmName=alarm['AlarmName'],
                Namespace='AWS/Neptune',
                MetricName=alarm['MetricName'],
                Dimensions=[{
                    'Name': 'DBClusterIdentifier',
                    'Value': self.cluster_id
                }],
                Period=300,
                EvaluationPeriods=2,
                Threshold=alarm['Threshold'],
                ComparisonOperator=alarm['ComparisonOperator'],
                Statistic='Average',
                AlarmActions=['arn:aws:sns:us-east-1:123456789012:NeptuneAlerts']
            )
```

### 11.9.4 备份与恢复

```bash
# 手动创建快照
aws neptune create-db-cluster-snapshot \
    --db-cluster-snapshot-identifier kg-backup-$(date +%Y%m%d) \
    --db-cluster-identifier knowledge-graph-cluster

# 从快照恢复
aws neptune restore-db-cluster-from-snapshot \
    --db-cluster-identifier kg-restored-cluster \
    --snapshot-identifier kg-backup-20250101 \
    --engine neptune \
    --vpc-security-group-ids sg-12345678

# 时间点恢复（PITR）
aws neptune restore-db-cluster-to-point-in-time \
    --db-cluster-identifier kg-pitr-cluster \
    --source-db-cluster-identifier knowledge-graph-cluster \
    --restore-to-time 2025-01-15T14:00:00Z
```

### 11.9.5 本章小结

Neptune 的运维重点在于网络安全隔离、监控告警和备份策略。IAM 权限应遵循最小权限原则，监控应覆盖 CPU、延迟、存储和查询并发等关键指标。

---

## 11.10 性能优化与成本控制

### 11.10.1 实例选型策略

| 工作负载 | 推荐实例 | 理由 |
|---------|---------|------|
| 开发测试 | Serverless (2.5-16 NCU) | 低成本，按需付费 |
| 中小型生产 | db.r6g.large - 2xlarge | Graviton 性价比高 |
| 高写入 | db.r6g.2xlarge + 多副本 | 写入吞吐与主实例规格正相关 |
| 高读取 | db.r6g.xlarge + 5-10 只读副本 | 水平扩展读取能力 |
| 内存密集型 | db.r7g.4xlarge+ | 大图需要更多内存缓存 |

### 11.10.2 查询优化

```python
# 查询性能分析
def analyze_query_performance(gremlin_client, query: str):
    """分析 Gremlin 查询性能"""
    # 使用 explain 分析执行计划
    explain_query = query.replace('.toList()', '.explain()')
    plan = gremlin_client.submit(explain_query).all().result()
    print("执行计划:", plan)
    
    # 使用 profile 查看实际执行统计
    profile_query = query.replace('.toList()', '.profile()')
    stats = gremlin_client.submit(profile_query).all().result()
    print("执行统计:", stats)

# 优化建议
OPTIMIZATION_TIPS = """
1. 使用索引：确保查询属性上有索引
   g.V().has('name', 'Alice')  → 需要 name 索引

2. 限制遍历深度：避免无限制的 repeat()
   推荐: repeat(out()).times(5)  不推荐: repeat(out())

3. 尽早过滤：先过滤再遍历
   推荐: g.V().has('type', 'person').out('knows')
   不推荐: g.V().out('knows').has('type', 'person')

4. 使用 hasLabel 替代 has('label', ...)
   推荐: g.V().hasLabel('person')
   不推荐: g.V().has('label', 'person')

5. 避免大结果集：使用 limit() 和 range()
   g.V().limit(100) 而不是 g.V()

6. 使用 sideEffect 进行聚合而非全局遍历
   推荐: g.V().hasLabel('person').sideEffect(outE('knows').count())
"""
```

### 11.10.3 批量加载优化

```java
// Java: 使用 Neptune Bulk Loader
import software.amazon.awssdk.services.neptune.NeptuneClient;
import software.amazon.awssdk.services.neptune.model.*;

public class NeptuneBulkLoader {
    private final NeptuneClient neptune;
    
    public NeptuneBulkLoader() {
        this.neptune = NeptuneClient.builder()
            .region(Region.US_EAST_1)
            .build();
    }
    
    public void loadData(String s3Path, String roleArn) {
        StartLoadBalancerActionRequest request = StartLoadBalancerActionRequest.builder()
            .source(s3Path)
            .format("csv")  // CSV 格式，支持 VERTEX/EDGE
            .s3BucketRegion("us-east-1")
            .iamRoleArn(roleArn)
            .failOnError(false)
            .parallelism("HIGH")  // HIGH | MEDIUM | LOW | OVERSUBSCRIBE
            .updateSingleCardinalityProperties(true)
            .queueRequest(true)
            .build();
        
        StartLoadBalancerActionResponse response = neptune.startLoadBalancerAction(request);
        System.out.println("Load ID: " + response.loadId());
    }
    
    // CSV 数据格式
    // 顶点: ~id,~label,name:string,description:string
    // 边:   ~id,~label,~from,~to,weight:double
}
```

### 11.10.4 只读副本策略

```python
class NeptuneReadReplicaManager:
    """只读副本管理"""

    def __init__(self, cluster_id: str):
        self.rds = boto3.client('neptune', region_name='us-east-1')
        self.cluster_id = cluster_id

    def add_replicas_based_on_load(self, min_replicas: int = 1, max_replicas: int = 15):
        """根据负载自动调整只读副本数量"""
        cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
        
        # 获取当前查询负载
        response = cloudwatch.get_metric_statistics(
            Namespace='AWS/Neptune',
            MetricName='NumQueriesPerSec',
            Dimensions=[{
                'Name': 'DBClusterIdentifier',
                'Value': self.cluster_id
            }],
            StartTime=datetime.utcnow() - timedelta(minutes=5),
            EndTime=datetime.utcnow(),
            Period=60,
            Statistics=['Average']
        )
        
        avg_qps = response['Datapoints'][-1]['Average'] if response['Datapoints'] else 0
        
        # 简单策略：每 100 QPS 增加一个副本
        target_replicas = max(min_replicas, min(max_replicas, int(avg_qps / 100)))
        
        current_replicas = self._count_current_replicas()
        
        if target_replicas > current_replicas:
            for _ in range(target_replicas - current_replicas):
                self.rds.create_db_instance(
                    DBInstanceIdentifier=f"{self.cluster_id}-reader-{uuid.uuid4().hex[:8]}",
                    DBClusterIdentifier=self.cluster_id,
                    DBInstanceClass="db.r6g.large",
                    PromotionTier=15
                )
        elif target_replicas < current_replicas:
            # 删除多余的副本
            excess = current_replicas - target_replicas
            readers = self._list_readers()
            for reader in readers[:excess]:
                self.rds.delete_db_instance(
                    DBInstanceIdentifier=reader,
                    SkipFinalSnapshot=True
                )

    def _count_current_replicas(self) -> int:
        response = self.rds.describe_db_clusters(
            DBClusterIdentifier=self.cluster_id
        )
        return len(response['DBClusters'][0]['DBClusterMembers']) - 1  # 排除主实例

    def _list_readers(self) -> List[str]:
        response = self.rds.describe_db_instances(
            Filters=[{
                'Name': 'db-cluster-id',
                'Values': [self.cluster_id]
            }]
        )
        return [
            inst['DBInstanceIdentifier']
            for inst in response['DBInstances']
            if not inst['IsClusterWriter']
        ]
```

### 11.10.5 本章小结

性能优化应遵循"先分析后优化"原则：使用 explain/profile 分析查询瓶颈，优化索引和遍历策略，合理配置只读副本。成本控制方面，Serverless 适合弹性场景，预留实例适合稳态负载。

---

## 11.11 实战：构建 LLM + 知识图谱智能问答系统

### 11.11.1 系统架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    用户界面 (Streamlit/React)               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    API Gateway / ALB                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    应用服务层 (FastAPI)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 实体提取  │  │ 图查询   │  │ 向量检索  │  │ LLM 生成 │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└───────┬──────────────┬──────────────┬───────────────────────┘
        │              │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌───▼────────────┐
│  Neptune DB  │ │ Neptune ML │ │ Bedrock (LLM)  │
│  (知识图谱)   │ │ (向量搜索)  │ │ Claude/Titan   │
└──────────────┘ └────────────┘ └────────────────┘
```

### 11.11.2 数据流设计

```
用户提问: "A公司投资了哪些AI创业公司？它们的创始人还创办过什么公司？"

Step 1: 实体提取
  → LLM 提取: ["A公司", "AI创业公司"]
  
Step 2: 图查询
  → openCypher: MATCH (a:Company {name:'A公司'})-[:INVESTED_IN]->(s:Company)
                WHERE s.tags CONTAINS 'AI'
                MATCH (s)<-[:FOUNDED]-(f:Person)
                OPTIONAL MATCH (f)-[:FOUNDED]->(other:Company)
                RETURN s.name, f.name, collect(other.name)
  
Step 3: 结果增强
  → 图查询结果 + 向量检索相关文档
  
Step 4: LLM 综合生成
  → 基于图结构 + 文档上下文生成最终答案
```

### 11.11.3 完整代码实现

```python
"""
LLM + 知识图谱智能问答系统
技术栈: FastAPI + Neptune + LangChain + Bedrock
"""

import os
import json
import logging
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager

from langchain_community.graphs import NeptuneGraph
from langchain_community.chains.graph_qa.neptune_cypher import (
    NeptuneOpenCypherQAChain
)
from langchain_aws import ChatBedrock
from langchain.prompts import PromptTemplate
from langchain.schema import Document

import boto3
from gremlin_python.driver import client, serializer

# ==================== 配置 ====================

class Config:
    NEPTUNE_ENDPOINT = os.getenv("NEPTUNE_ENDPOINT", "localhost")
    NEPTUNE_PORT = int(os.getenv("NEPTUNE_PORT", "8182"))
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    BEDROCK_MODEL = os.getenv("BEDROCK_MODEL", 
        "anthropic.claude-3-sonnet-20240229-v1:0")
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL",
        "amazon.titan-embed-text-v2:0")
    MAX_GRAPH_DEPTH = int(os.getenv("MAX_GRAPH_DEPTH", "2"))
    TOP_K_RESULTS = int(os.getenv("TOP_K_RESULTS", "10"))

config = Config()

# ==================== 数据模型 ====================

class QueryRequest(BaseModel):
    question: str = Field(..., description="用户问题")
    session_id: Optional[str] = Field(None, description="会话ID")
    use_graph: bool = Field(True, description="是否使用图查询")
    use_vector: bool = Field(True, description="是否使用向量检索")
    max_depth: int = Field(2, description="图遍历最大深度")

class QueryResponse(BaseModel):
    answer: str
    sources: List[Dict]
    graph_paths: Optional[List[List[Dict]]] = None
    confidence: float

class EntityRelation(BaseModel):
    source: str
    relation: str
    target: str
    properties: Optional[Dict] = None

# ==================== 知识图谱引擎 ====================

class KnowledgeGraphEngine:
    """知识图谱查询引擎"""

    def __init__(self):
        self.graph = NeptuneGraph(
            host=config.NEPTUNE_ENDPOINT,
            port=config.NEPTUNE_PORT,
            use_https=True
        )
        self.gremlin = client.Client(
            f"wss://{config.NEPTUNE_ENDPOINT}:{config.NEPTUNE_PORT}/gremlin",
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        self.llm = ChatBedrock(
            model_id=config.BEDROCK_MODEL,
            region_name=config.AWS_REGION,
            model_kwargs={"temperature": 0}
        )
        self.bedrock = boto3.client('bedrock-runtime', 
                                     region_name=config.AWS_REGION)

    def extract_entities(self, question: str) -> List[str]:
        """从问题中提取实体"""
        prompt = f"""从以下问题中提取关键实体名称，返回 JSON 字符串数组。
要求：
- 只提取具体的实体名称（人名、公司名、产品名等）
- 排除抽象概念和疑问词
- 如果无法提取任何实体，返回空数组

问题：{question}

JSON 数组："""

        response = self.bedrock.invoke_model(
            modelId=config.BEDROCK_MODEL,
            contentType="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}]
            })
        )
        result = json.loads(response['body'].read())
        content = result['content'][0]['text']
        
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return []

    def query_subgraph(self, entities: List[str], depth: int = 2) -> List[EntityRelation]:
        """查询实体周围的子图"""
        relations = []
        
        for entity in entities:
            query = f"""
            g.V().has('name', '{entity}')
             .union(
                outE().inV().hasLabel('entity', 'company', 'person', 'product')
                    .path().by('name').by(label).by('name'),
                inE().outV().hasLabel('entity', 'company', 'person', 'product')
                    .path().by('name').by(label).by('name')
             )
             .limit({config.TOP_K_RESULTS})
             .toList()
            """
            
            try:
                paths = self.gremlin.submit(query).all().result()
                for p in paths:
                    if len(p.objects) >= 3:
                        relations.append(EntityRelation(
                            source=str(p.objects[0]),
                            relation=str(p.objects[1]),
                            target=str(p.objects[2])
                        ))
            except Exception as e:
                logging.warning(f"Query failed for {entity}: {e}")
        
        return relations

    def find_paths(self, start: str, end: str, max_depth: int = 5) -> List[List[Dict]]:
        """查找两个实体间的路径"""
        query = f"""
        g.V().has('name', '{start}')
         .repeat(outE().inV().simplePath())
         .times({max_depth})
         .has('name', '{end}')
         .path().limit(5)
         .toList()
        """
        
        try:
            paths = self.gremlin.submit(query).all().result()
            result = []
            for p in paths:
                path_steps = []
                for i in range(0, len(p.objects) - 1, 2):
                    if i + 2 < len(p.objects):
                        path_steps.append({
                            'source': str(p.objects[i]),
                            'relation': str(p.objects[i + 1]),
                            'target': str(p.objects[i + 2])
                        })
                result.append(path_steps)
            return result
        except Exception as e:
            logging.error(f"Path finding failed: {e}")
            return []

    def generate_answer(self, question: str, relations: List[EntityRelation],
                        paths: List[List[Dict]]) -> str:
        """基于图结构生成答案"""
        # 构建图上下文
        graph_context = "知识图谱关系:\n"
        for r in relations:
            graph_context += f"  {r.source} --[{r.relation}]--> {r.target}\n"
        
        if paths:
            graph_context += "\n关系路径:\n"
            for i, path in enumerate(paths):
                path_str = " → ".join(
                    f"{step['source']}[{step['relation']}]"
                    for step in path
                )
                path_str += f" → {path[-1]['target']}"
                graph_context += f"  路径{i+1}: {path_str}\n"

        prompt = f"""你是一个知识图谱增强的 AI 助手。请基于以下知识图谱数据回答问题。

{graph_context}

问题：{question}

要求：
1. 优先使用知识图谱中的结构化关系回答问题
2. 如果图谱信息不足，明确指出缺少哪些信息
3. 对于多跳关系，展示推理过程
4. 答案应简洁准确

回答："""

        response = self.bedrock.invoke_model(
            modelId=config.BEDROCK_MODEL,
            contentType="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}]
            })
        )
        result = json.loads(response['body'].read())
        return result['content'][0]['text']

    def close(self):
        self.gremlin.close()


# ==================== FastAPI 应用 ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    global kg_engine
    kg_engine = KnowledgeGraphEngine()
    yield
    kg_engine.close()

app = FastAPI(
    title="Neptune KG + LLM Q&A System",
    version="1.0.0",
    lifespan=lifespan
)

kg_engine: KnowledgeGraphEngine = None

@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """处理用户查询"""
    try:
        # 1. 实体提取
        entities = kg_engine.extract_entities(request.question)
        
        # 2. 图查询
        relations = []
        paths = []
        if request.use_graph and entities:
            relations = kg_engine.query_subgraph(entities, request.max_depth)
            
            # 如果提取到两个以上实体，尝试查找路径
            if len(entities) >= 2:
                paths = kg_engine.find_paths(
                    entities[0], entities[1], request.max_depth + 2
                )
        
        # 3. 生成答案
        answer = kg_engine.generate_answer(
            request.question, relations, paths
        )
        
        # 4. 构建响应
        sources = [
            {"type": "graph_relation", "content": r.dict()}
            for r in relations[:5]
        ]
        
        return QueryResponse(
            answer=answer,
            sources=sources,
            graph_paths=paths if paths else None,
            confidence=0.85 if relations else 0.5
        )
        
    except Exception as e:
        logging.error(f"Query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """健康检查"""
    return {
        "status": "healthy",
        "neptune_connected": kg_engine is not None
    }


# ==================== 数据初始化脚本 ====================

def init_sample_data():
    """初始化示例知识图谱数据"""
    gremlin = client.Client(
        f"wss://{config.NEPTUNE_ENDPOINT}:{config.NEPTUNE_PORT}/gremlin",
        'g',
        message_serializer=serializer.GraphSONSerializersV3d0()
    )
    
    # 创建示例数据：投资关系网络
    queries = [
        # 创建公司顶点
        "g.addV('company').property('name', 'A公司').property('type', 'investment').next()",
        "g.addV('company').property('name', 'B科技').property('type', 'ai_startup').next()",
        "g.addV('company').property('name', 'C智能').property('type', 'ai_startup').next()",
        "g.addV('company').property('name', 'D数据').property('type', 'bigdata').next()",
        
        # 创建人员顶点
        "g.addV('person').property('name', '张三').property('title', 'CEO').next()",
        "g.addV('person').property('name', '李四').property('title', 'CTO').next()",
        "g.addV('person').property('name', '王五').property('title', '创始人').next()",
        
        # 创建投资关系
        "g.V().has('name','A公司').addE('invested_in').to(g.V().has('name','B科技')).property('amount',5000000).next()",
        "g.V().has('name','A公司').addE('invested_in').to(g.V().has('name','C智能')).property('amount',3000000).next()",
        "g.V().has('name','A公司').addE('invested_in').to(g.V().has('name','D数据')).property('amount',8000000).next()",
        
        # 创建任职关系
        "g.V().has('name','张三').addE('ceo_of').to(g.V().has('name','B科技')).next()",
        "g.V().has('name','李四').addE('cto_of').to(g.V().has('name','C智能')).next()",
        "g.V().has('name','王五').addE('founder_of').to(g.V().has('name','D数据')).next()",
        
        # 创建合作关系
        "g.V().has('name','B科技').addE('partners_with').to(g.V().has('name','C智能')).next()",
    ]
    
    for q in queries:
        try:
            gremlin.submit(q).all().result()
        except Exception as e:
            print(f"Query warning: {e}")
    
    print("示例数据初始化完成")
    gremlin.close()


# ==================== 启动入口 ====================

if __name__ == "__main__":
    import uvicorn
    
    # 初始化示例数据（首次运行）
    init_sample_data()
    
    # 启动 API 服务
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
```

### 11.11.4 部署脚本

```bash
# Dockerfile
cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF

# requirements.txt
cat > requirements.txt << 'EOF'
fastapi==0.109.0
uvicorn[standard]==0.27.0
langchain==0.1.5
langchain-aws==0.1.0
langchain-community==0.0.19
gremlinpython==3.7.2
boto3==1.34.40
pydantic==2.6.0
httpx==0.26.0
EOF

# 构建和部署
docker build -t neptune-llm-qa .
docker run -d -p 8000:8000 \
    -e NEPTUNE_ENDPOINT=your-neptune-endpoint \
    -e AWS_REGION=us-east-1 \
    -e AWS_ACCESS_KEY_ID=xxx \
    -e AWS_SECRET_ACCESS_KEY=xxx \
    neptune-llm-qa
```

### 11.11.5 测试验证

```python
# 测试脚本
import httpx
import json

def test_qa_system():
    base_url = "http://localhost:8000"
    
    # 测试健康检查
    health = httpx.get(f"{base_url}/health")
    print(f"Health: {health.json()}")
    
    # 测试查询
    test_questions = [
        "A公司投资了哪些公司？",
        "张三在哪家公司任职？",
        "A公司投资的AI创业公司有哪些？它们的创始人是谁？",
        "B科技和C智能是什么关系？",
    ]
    
    for question in test_questions:
        response = httpx.post(
            f"{base_url}/query",
            json={"question": question, "max_depth": 2}
        )
        result = response.json()
        print(f"\n问题: {question}")
        print(f"答案: {result['answer'][:200]}...")
        print(f"来源数: {len(result['sources'])}")
        print(f"置信度: {result['confidence']}")
```

### 11.11.6 本章小结

本节实现了一个完整的 LLM + 知识图谱智能问答系统，涵盖实体提取、图查询、路径分析和 LLM 生成的全流程。该系统可作为企业知识管理、智能客服、风险分析等场景的基础框架。

---

## 11.12 总结与展望

### 关键要点

1. **Neptune 架构**：存算分离、三种查询语言、三种引擎类型，为知识图谱提供了灵活的基础设施
2. **LLM 集成模式**：Graph RAG、外部记忆、图引导推理、Agent 工具四种模式覆盖从简单到复杂的全部场景
3. **数据分析**：金融、社交、供应链、风控四大场景展示了图数据库的分析价值
4. **框架集成**：LangChain 和 LlamaIndex 提供了开箱即用的集成能力
5. **运维实践**：安全、监控、备份、优化是生产系统的基石

### 发展趋势

- **Graph + Vector 融合**：Neptune 正在增强向量搜索能力，未来图查询和向量搜索将无缝融合
- **多模态知识图谱**：图数据库将存储文本、图像、代码等多模态知识
- **Agent 原生集成**：LLM Agent 将图数据库作为核心工具，实现自主知识探索
- **实时图学习**：图神经网络与图数据库的深度集成，支持在线学习

Amazon Neptune 与 LLM 的结合，正在重新定义知识密集型应用的架构范式。从简单的 Graph RAG 到复杂的多步推理 Agent，图数据库为 LLM 提供了结构化、可追溯、可验证的外部知识基础，是通往可信 AI 的关键技术路径。
