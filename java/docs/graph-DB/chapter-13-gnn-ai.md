# 第13章 图神经网络与AI：从图数据库到图智能

---

## 13.1 图神经网络基础

### 13.1.1 解决的问题

传统深度学习（CNN、RNN、Transformer）处理的数据具有**欧几里得结构**——图像是规则网格，文本是线性序列，每个样本的邻居数量和排列顺序是固定的。但图数据是**非欧几里得**的：

- 每个节点的邻居数量不固定（度分布不均）
- 节点没有天然的顺序（排列不变性）
- 图的结构本身携带信息（不仅仅是特征）

例如，在社交网络中预测一个用户的兴趣，不能简单地把他所有朋友的向量"拼起来"送进全连接层——因为朋友数量不同、顺序无关。图神经网络（GNN）正是为了解决这类问题而设计的。

### 13.1.2 核心原理：消息传递范式

GNN 的核心思想是**消息传递（Message Passing）**，每一层做两件事：

1. **聚合（Aggregate）**：从邻居节点收集信息
2. **更新（Update）**：将自身特征与聚合信息融合，生成新的节点表示

数学直觉上，第 \(k\) 层节点 \(v\) 的更新为：

\[
h_v^{(k)} = \text{UPDATE}^{(k)}\left(h_v^{(k-1)}, \text{AGGREGATE}^{(k)}\left(\{h_u^{(k-1)} : u \in \mathcal{N}(v)\}\right)\right)
\]

不同的 GNN 变体本质上是选择了不同的 AGGREGATE 和 UPDATE 函数。

### 13.1.3 GCN：图卷积网络

**解决的问题**：如何将 CNN 的"卷积"操作推广到图上。

**核心原理**：

GCN 分为两个流派：

- **谱域（Spectral）**：基于图拉普拉斯矩阵的特征分解，在傅里叶域定义卷积。计算代价高，且学习到的滤波器依赖特定图结构，无法跨图泛化。
- **空域（Spatial）**：直接在邻居节点上定义卷积操作。Kipf & Welling 提出的经典 GCN 属于空域方法，其聚合方式是对邻居特征做**归一化求和**：

\[
h_v^{(k)} = \sigma\left(W^{(k)} \cdot \sum_{u \in \mathcal{N}(v) \cup \{v\}} \frac{1}{\sqrt{\deg(v)\deg(u)}} h_u^{(k-1)}\right)
\]

直觉上，GCN 做了两件事：对邻居特征取平均（按度归一化），然后做一次线性变换 + 激活。

**代码实现（PyTorch Geometric）**：

```python
import torch
import torch.nn.functional as F
from torch_geometric.nn import GCNConv

class GCN(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.5, training=self.training)
        x = self.conv2(x, edge_index)
        return F.log_softmax(x, dim=1)

# 使用示例
model = GCN(in_channels=1433, hidden_channels=16, out_channels=7)
# x: [N, 1433] 节点特征矩阵
# edge_index: [2, E] 边列表（COO格式）
output = model(data.x, data.edge_index)
```

**使用场景**：同构图上的节点分类、半监督学习（如 Cora、PubMed 引文网络分类）。

**潜在风险与注意事项**：

- GCN 的聚合是各向同性的——所有邻居权重相同，无法区分重要邻居
- 层数加深容易导致过平滑（所有节点表示趋同），通常 2-3 层最佳
- 谱域 GCN 的拉普拉斯计算在大图上不可行

### 13.1.4 GAT：图注意力网络

**解决的问题**：GCN 平等对待所有邻居，但现实中邻居的重要性不同。

**核心原理**：

GAT 引入**注意力机制**，让模型学习每个邻居的权重：

\[
\alpha_{ij} = \frac{\exp\left(\text{LeakyReLU}\left(a^T [W h_i \| W h_j]\right)\right)}{\sum_{k \in \mathcal{N}(i)} \exp\left(\text{LeakyReLU}\left(a^T [W h_i \| W h_k]\right)\right)}
\]

其中 \(a\) 是可学习的注意力向量，\(\|\) 表示拼接。直观理解：GAT 先计算"我"和每个邻居的匹配分数，然后用 softmax 归一化作为聚合权重。

**代码实现（PyTorch Geometric）**：

```python
from torch_geometric.nn import GATConv

class GAT(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels, heads=8):
        super().__init__()
        self.conv1 = GATConv(in_channels, hidden_channels, heads=heads)
        self.conv2 = GATConv(hidden_channels * heads, out_channels, heads=1)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.elu(x)
        x = self.conv2(x, edge_index)
        return F.log_softmax(x, dim=1)
```

**使用场景**：需要区分邻居重要性的任务（如推荐系统中用户对不同好友的信任度不同）。

**潜在风险与注意事项**：

- 多头注意力增加计算量，大图上需权衡
- 注意力权重可能过拟合到训练节点，泛化性不如 GCN 稳定
- 对图结构噪声敏感——错误边会获得注意力分数

### 13.1.5 GraphSAGE：归纳式学习

**解决的问题**：GCN 是直推式（transductive）——训练时需看到全图，无法泛化到新节点。GraphSAGE 实现了**归纳式（inductive）**学习。

**核心原理**：

GraphSAGE 不学习每个节点的独立嵌入，而是学习**如何从邻居特征聚合出嵌入**（即学习聚合函数本身）。关键创新是**邻居采样**：每层只随机采样固定数量的邻居，而非使用全部邻居。

三种聚合器可选：

- **Mean 聚合器**：对邻居特征取平均（类似 GCN）
- **LSTM 聚合器**：将邻居排序后过 LSTM（引入了顺序，不推荐）
- **Pooling 聚合器**：对每个邻居做 MLP 后取 max-pooling

**代码实现（PyTorch Geometric）**：

```python
from torch_geometric.nn import SAGEConv

class GraphSAGE(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.5, training=self.training)
        x = self.conv2(x, edge_index)
        return F.log_softmax(x, dim=1)
```

**使用场景**：动态图（新用户不断加入的社交网络）、大规模图（通过采样控制每层计算量）。

**潜在风险与注意事项**：

- 邻居采样数过小会丢失信息，过大会失去采样意义
- 采样引入随机性，训练方差增大
- 归纳式泛化依赖特征质量，特征弱时效果不如直推式

### 13.1.6 本章小结

| 模型 | 聚合方式 | 学习范式 | 适用场景 |
|------|---------|---------|---------|
| GCN | 度归一化求和 | 直推式 | 小规模同构图 |
| GAT | 注意力加权求和 | 直推式 | 需区分邻居重要性 |
| GraphSAGE | 采样 + 多种聚合 | 归纳式 | 大规模/动态图 |

选择原则：图小且静态用 GCN，需要区分邻居重要性用 GAT，图大或动态用 GraphSAGE。

---

## 13.2 图表示学习

### 13.2.1 解决的问题

GNN 需要节点特征作为输入。但很多场景下，图只有结构信息（如社交网络只有"谁关注了谁"，没有用户画像）。**图表示学习**的目标是从图结构中直接学习节点的低维向量表示，使得图中相近的节点在向量空间中也相近。

### 13.2.2 DeepWalk

**核心原理**：

DeepWalk 将 NLP 中的 Word2Vec 思想迁移到图上：

1. 在图上做**随机游走**，生成节点序列（类比句子）
2. 将节点序列送入 SkipGram 模型，学习节点嵌入

直觉上：如果两个节点在随机游走中经常同时出现，它们在图中的角色和位置相似。

```python
# 使用 PyG 的 Node2Vec 实现（DeepWalk 是 Node2Vec 的特例）
from torch_geometric.nn import Node2Vec

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

model = Node2Vec(
    edge_index=data.edge_index,
    embedding_dim=128,
    walk_length=20,
    context_size=10,
    walks_per_node=10,
    p=1.0,  # 返回参数（=1 时退化为 DeepWalk）
    q=1.0,  # 出入参数（=1 时退化为 DeepWalk）
).to(device)

loader = model.loader(batch_size=128, shuffle=True)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

for epoch in range(100):
    for pos_rw, neg_rw in loader:
        optimizer.zero_grad()
        loss = model.loss(pos_rw.to(device), neg_rw.to(device))
        loss.backward()
        optimizer.step()
```

### 13.2.3 Node2Vec：有偏随机游走

**解决的问题**：DeepWalk 的随机游走是完全无偏的，无法控制游走是偏向 BFS（探索局部结构）还是 DFS（探索全局结构）。

**核心原理**：

Node2Vec 引入两个超参数控制游走策略：

- **p（Return parameter）**：控制返回上一个节点的概率。p 小 → 倾向于 BFS（局部探索）
- **q（In-out parameter）**：控制向外走 vs 向内走。q 小 → 倾向于 DFS（全局探索）

游走概率：

\[
\alpha_{pq}(t, x) = 
\begin{cases}
1/p & \text{if } d_{tx} = 0 \text{（回到上一步）} \\
1 & \text{if } d_{tx} = 1 \text{（继续向外）} \\
1/q & \text{if } d_{tx} = 2 \text{（远离上一步）}
\end{cases}
\]

其中 \(t\) 是上一步节点，\(x\) 是候选下一步节点，\(d_{tx}\) 是 \(t\) 到 \(x\) 的最短距离。

**使用场景**：

- p 小、q 大（BFS 模式）：适合同质性预测（节点分类）
- p 大、q 小（DFS 模式）：适合结构等价性预测（角色识别）

**潜在风险与注意事项**：

- p 和 q 需要调参，默认 p=1, q=1 退化为 DeepWalk
- 随机游走在大图上计算量大，可预计算后缓存
- 无法利用节点特征，仅依赖结构

### 13.2.4 知识图谱嵌入：TransE 与 RotatE

**解决的问题**：知识图谱中的三元组（头实体, 关系, 尾实体）如何嵌入到连续向量空间，使得推理（如链接预测）成为可能。

**TransE 核心原理**：

将关系视为头实体到尾实体的**平移**：

\[
h + r \approx t
\]

评分函数：\(f(h, r, t) = -\|h + r - t\|\)

如果 (北京, 首都, 中国) 成立，则 `vec(北京) + vec(首都) ≈ vec(中国)`。

**RotatE 核心原理**：

TransE 无法处理对称/反对称关系。RotatE 将嵌入放在复数空间，将关系视为**旋转**：

\[
f(h, r, t) = -\|h \circ r - t\|
\]

其中 \(\circ\) 是逐元素复数乘法，\(r\) 的模长为 1（纯旋转）。对称关系对应旋转 0° 或 180°，反对称关系对应旋转 90°。

```python
import torch
import torch.nn as nn

class RotatE(nn.Module):
    def __init__(self, num_entities, num_relations, dim):
        super().__init__()
        self.entity_emb = nn.Embedding(num_entities, dim * 2)  # 实部和虚部
        self.relation_emb = nn.Embedding(num_relations, dim)   # 旋转角度

    def forward(self, h, r, t):
        # 将嵌入拆分为实部/虚部
        h_real, h_imag = self.entity_emb(h).chunk(2, dim=-1)
        t_real, t_imag = self.entity_emb(t).chunk(2, dim=-1)
        phase = self.relation_emb(r)
        # 旋转：h * r（复数乘法）
        r_real, r_imag = torch.cos(phase), torch.sin(phase)
        h_rotated_real = h_real * r_real - h_imag * r_imag
        h_rotated_imag = h_real * r_imag + h_imag * r_real
        # 评分：-||h∘r - t||
        score = -torch.norm(
            torch.cat([h_rotated_real - t_real, h_rotated_imag - t_imag], dim=-1),
            dim=-1
        )
        return score
```

**使用场景**：知识图谱补全、关系推理、问答系统。

**潜在风险与注意事项**：

- TransE 无法处理 1-N、N-1、N-N 关系
- RotatE 参数量大，训练慢
- 负采样策略对效果影响大

### 13.2.5 对比学习在图上的应用：GraphCL

**解决的问题**：图数据标注成本高，如何利用无标签数据学习好的图表示。

**核心原理**：

GraphCL 借鉴 SimCLR 的思想，对每个图做两种不同的**数据增强**（节点丢弃、边扰动、子图采样、特征掩码），然后拉近同一图的两个增强视图，推远不同图的视图。

```python
import torch
import torch.nn.functional as F
from torch_geometric.nn import GCNConv, global_mean_pool

class GraphCL(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels):
        super().__init__()
        self.encoder = torch.nn.Sequential(
            GCNConv(in_channels, hidden_channels),
            torch.nn.ReLU(),
            GCNConv(hidden_channels, out_channels),
        )

    def forward(self, x, edge_index, batch):
        x = self.encoder(x, edge_index)
        return global_mean_pool(x, batch)  # 图级别表示

    def contrastive_loss(self, z1, z2, temperature=0.5):
        # NT-Xent loss
        batch_size = z1.size(0)
        z = torch.cat([z1, z2], dim=0)
        sim = F.cosine_similarity(z.unsqueeze(1), z.unsqueeze(0), dim=2) / temperature
        mask = torch.eye(batch_size * 2, device=z.device).bool()
        sim = sim[~mask].view(batch_size * 2, -1)
        pos = torch.cat([
            torch.arange(batch_size, batch_size * 2),
            torch.arange(batch_size)
        ])
        return F.cross_entropy(sim, pos.to(z.device))
```

**使用场景**：分子性质预测（无标签分子数据丰富）、社交网络预训练。

**潜在风险与注意事项**：

- 数据增强策略高度依赖图类型（分子图适合边扰动，社交图适合节点丢弃）
- 对比学习需要大 batch size，GPU 显存需求高
- 负样本选择策略影响收敛质量

### 13.2.6 本章小结

| 方法 | 输入 | 输出 | 特点 |
|------|------|------|------|
| DeepWalk | 图结构 | 节点嵌入 | 无偏随机游走 |
| Node2Vec | 图结构 | 节点嵌入 | 可控 BFS/DFS |
| TransE | 三元组 | 实体+关系嵌入 | 平移假设 |
| RotatE | 三元组 | 复数嵌入 | 旋转假设 |
| GraphCL | 图+增强 | 图/节点嵌入 | 无监督对比学习 |

---

## 13.3 图数据库与机器学习集成

### 13.3.1 解决的问题

图数据库（如 Neo4j、NebulaGraph）存储了丰富的关联数据，但 ML 框架（PyTorch、TensorFlow）无法直接读取图数据库中的数据。需要一套流程将图数据库中的子图导出为 ML 训练数据，并将训练好的模型结果写回图数据库。

### 13.3.2 导出子图用于 ML 训练

**核心流程**：

```
图数据库 → Cypher/Gremlin 查询 → 子图导出 → 特征工程 → PyG/DGL Data 对象 → 模型训练
```

**Neo4j 导出示例**：

```cypher
// 导出用户及其二阶好友的子图
MATCH (u:User)-[r:FOLLOWS]->(f:User)
OPTIONAL MATCH (f)-[r2:FOLLOWS]->(f2:User)
WITH u, collect(DISTINCT f.id) AS friends, collect(DISTINCT f2.id) AS friends_of_friends
RETURN u.id AS user_id,
       u.age AS age,
       u.gender AS gender,
       friends,
       friends_of_friends
LIMIT 10000
```

**Python 端处理**：

```python
import pandas as pd
import torch
from torch_geometric.data import Data

def neo4j_to_pyg(neo4j_df):
    """将 Neo4j 导出的 DataFrame 转为 PyG Data 对象"""
    # 构建节点映射
    all_nodes = pd.concat([
        neo4j_df[['user_id']].rename(columns={'user_id': 'node_id'}),
        neo4j_df['friends'].explode().dropna().to_frame('node_id'),
        neo4j_df['friends_of_friends'].explode().dropna().to_frame('node_id'),
    ]).drop_duplicates().reset_index(drop=True)

    node_id_to_idx = {nid: i for i, nid in enumerate(all_nodes['node_id'])}

    # 构建边索引
    edges = []
    for _, row in neo4j_df.iterrows():
        u = node_id_to_idx[row['user_id']]
        for f in row['friends']:
            if pd.notna(f):
                edges.append([u, node_id_to_idx[f]])
        for fof in row['friends_of_friends']:
            if pd.notna(fof):
                edges.append([node_id_to_idx[f], node_id_to_idx[fof]])

    edge_index = torch.tensor(edges, dtype=torch.long).t().contiguous()

    # 构建节点特征
    node_features = torch.randn(len(all_nodes), 128)  # 实际应使用真实特征

    return Data(x=node_features, edge_index=edge_index)
```

### 13.3.3 图数据上的特征工程

**解决的问题**：图结构本身可以衍生出丰富的特征，这些特征对 ML 模型有很强的预测能力。

**常用图特征**：

```python
import networkx as nx

def extract_graph_features(G):
    """从 NetworkX 图中提取节点级特征"""
    features = {}

    for node in G.nodes():
        f = {}

        # 基础度特征
        f['degree'] = G.degree(node)
        f['in_degree'] = G.in_degree(node) if G.is_directed() else G.degree(node)
        f['out_degree'] = G.out_degree(node) if G.is_directed() else G.degree(node)

        # 中心性
        f['betweenness'] = nx.betweenness_centrality(G, k=100).get(node, 0)
        f['pagerank'] = nx.pagerank(G).get(node, 0)
        f['closeness'] = nx.closeness_centrality(G).get(node, 0)

        # 局部结构
        f['clustering'] = nx.clustering(G, node)
        f['triangles'] = nx.triangles(G, node)

        # 邻居统计
        neighbors = list(G.neighbors(node))
        f['neighbor_avg_degree'] = (
            sum(G.degree(n) for n in neighbors) / len(neighbors)
            if neighbors else 0
        )

        features[node] = f

    return pd.DataFrame.from_dict(features, orient='index')
```

**使用场景**：将图特征作为传统 ML 模型（XGBoost、LightGBM）的输入，或作为 GNN 的补充特征。

**潜在风险与注意事项**：

- 中心性指标计算复杂度高，大图上需采样近似
- 图特征与目标变量可能存在高度共线性
- 动态图特征需定期重新计算

### 13.3.4 在线推理与特征存储

**解决的问题**：训练好的 GNN 模型如何用于生产环境的实时推理。

**架构设计**：

```
请求（用户ID）
    ↓
特征存储（Feature Store）→ 获取节点特征 + 邻居特征
    ↓
图特征服务（Graph Feature Service）→ 实时聚合邻居特征
    ↓
模型推理（TorchServe / Triton）→ GNN 前向传播
    ↓
结果写回图数据库
```

**特征存储集成**：

```python
# 使用 Feast Feature Store 管理图特征
from feast import FeatureStore, Entity, FeatureView, Field
from feast.types import Float32, Int64

# 定义图特征视图
user_graph_features = FeatureView(
    name="user_graph_features",
    entities=[Entity(name="user_id", value_type=Int64)],
    schema=[
        Field(name="pagerank", dtype=Float32),
        Field(name="clustering_coef", dtype=Float32),
        Field(name="neighbor_avg_degree", dtype=Float32),
        Field(name="community_id", dtype=Int64),
    ],
    source=...,
)

# 在线推理时获取特征
fs = FeatureStore(repo_path=".")
feature_vector = fs.get_online_features(
    features=["user_graph_features:pagerank",
              "user_graph_features:clustering_coef"],
    entity_rows=[{"user_id": 12345}]
).to_dict()
```

**TorchServe 部署 GNN**：

```python
# 自定义 handler
from ts.torch_handler.base_handler import BaseHandler

class GNNHandler(BaseHandler):
    def __init__(self):
        super().__init__()
        self.initialized = False

    def initialize(self, context):
        self.manifest = context.manifest
        properties = context.system_properties
        model_dir = properties.get("model_dir")
        self.model = torch.jit.load(f"{model_dir}/gnn_model.pt")
        self.model.eval()
        self.initialized = True

    def preprocess(self, data):
        # 从请求中解析子图数据
        inputs = data[0]["body"]
        x = torch.tensor(inputs["node_features"])
        edge_index = torch.tensor(inputs["edge_index"])
        return x, edge_index

    def inference(self, data):
        x, edge_index = data
        with torch.no_grad():
            output = self.model(x, edge_index)
        return output

    def postprocess(self, inference_output):
        return [{"predictions": inference_output.tolist()}]
```

### 13.3.5 本章小结

图数据库与 ML 的集成需要解决三个核心问题：数据导出（子图提取）、特征工程（图结构特征）、在线推理（低延迟服务）。生产环境中推荐使用 Feature Store 统一管理图特征，使用 TorchServe/Triton 部署 GNN 模型，并将推理结果写回图数据库形成闭环。

---

## 13.4 大规模图学习框架

### 13.4.1 解决的问题

工业级图数据通常包含数亿节点和数十亿边，单机训练不可行。需要分布式图学习框架来支持大规模图的采样、训练和推理。

### 13.4.2 PyTorch Geometric（PyG）

**核心概念**：

PyG 是当前最流行的 GNN 框架，核心抽象包括：

- **`Data` 对象**：统一表示图（`x` 节点特征、`edge_index` 边索引、`y` 标签）
- **`MessagePassing` 基类**：自定义 GNN 层的标准接口
- **`NeighborLoader`**：邻居采样器，支持小批量训练

**自定义 MessagePassing 层**：

```python
import torch
from torch_geometric.nn import MessagePassing
from torch_geometric.utils import add_self_loops, degree

class CustomGCNConv(MessagePassing):
    def __init__(self, in_channels, out_channels):
        super().__init__(aggr='mean')  # 聚合方式：mean/sum/max
        self.lin = torch.nn.Linear(in_channels, out_channels)

    def forward(self, x, edge_index):
        # 添加自环
        edge_index, _ = add_self_loops(edge_index, num_nodes=x.size(0))
        # 度归一化
        row, col = edge_index
        deg = degree(col, x.size(0), dtype=x.dtype)
        deg_inv_sqrt = deg.pow(-0.5)
        edge_weight = deg_inv_sqrt[row] * deg_inv_sqrt[col]
        # 消息传递
        return self.propagate(edge_index, x=x, edge_weight=edge_weight)

    def message(self, x_j, edge_weight):
        # 消息函数：对邻居特征加权
        return edge_weight.view(-1, 1) * x_j

    def update(self, aggr_out):
        # 更新函数：线性变换
        return self.lin(aggr_out)
```

**大规模图训练（NeighborLoader）**：

```python
from torch_geometric.loader import NeighborLoader
from torch_geometric.datasets import Planetoid

# 加载数据集
dataset = Planetoid(root='/tmp/Cora', name='Cora')
data = dataset[0]

# 创建邻居采样加载器
train_loader = NeighborLoader(
    data,
    num_neighbors=[10, 5],  # 第一层采样10个邻居，第二层5个
    batch_size=256,
    input_nodes=data.train_mask,
    shuffle=True,
)

# 训练循环
model = GCN(in_channels=dataset.num_features,
            hidden_channels=16,
            out_channels=dataset.num_classes)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

for epoch in range(200):
    for batch in train_loader:
        optimizer.zero_grad()
        out = model(batch.x, batch.edge_index)
        loss = F.nll_loss(out[:batch.batch_size], batch.y[:batch.batch_size])
        loss.backward()
        optimizer.step()
```

**数据集处理**：

```python
from torch_geometric.data import Dataset, Data
import os

class CustomGraphDataset(Dataset):
    def __init__(self, root, graph_files, transform=None):
        self.graph_files = graph_files
        super().__init__(root, transform)

    def len(self):
        return len(self.graph_files)

    def get(self, idx):
        # 从文件加载单个图
        data = torch.load(self.graph_files[idx])
        return data
```

### 13.4.3 Deep Graph Library（DGL）

**核心概念**：

DGL 是另一个主流 GNN 框架，与 PyG 的设计哲学不同：

- **显式图对象**：`dgl.graph()` 创建图，图结构在 CPU 上，特征在 GPU 上
- **消息传递 API**：`update_all(message_func, reduce_func)` 显式定义消息和聚合
- **采样器**：`dgl.dataloading.NeighborSampler` 支持分布式采样

**DGL 基础使用**：

```python
import dgl
import torch
import torch.nn as nn
import torch.nn.functional as F
from dgl.nn import GraphConv

class DGLGCN(nn.Module):
    def __init__(self, in_feats, hidden_feats, out_feats):
        super().__init__()
        self.conv1 = GraphConv(in_feats, hidden_feats)
        self.conv2 = GraphConv(hidden_feats, out_feats)

    def forward(self, g, features):
        h = self.conv1(g, features)
        h = F.relu(h)
        h = self.conv2(g, h)
        return h

# 构建图
g = dgl.graph(([0, 1, 2], [1, 2, 3]))  # 边列表
g = dgl.add_self_loop(g)
g = dgl.to_bidirected(g)

# 添加特征
g.ndata['feat'] = torch.randn(4, 16)
g.ndata['label'] = torch.tensor([0, 1, 0, 1])

model = DGLGCN(16, 8, 2)
output = model(g, g.ndata['feat'])
```

**DGL 邻居采样与分布式训练**：

```python
import dgl
from dgl.dataloading import NeighborSampler, DataLoader

# 创建采样器
sampler = NeighborSampler(
    fanouts=[15, 10, 5],  # 三层采样，每层分别采15/10/5个邻居
)

# 分布式数据加载器
train_dataloader = DataLoader(
    g,
    train_nids,
    sampler,
    batch_size=1024,
    shuffle=True,
    drop_last=False,
    num_workers=4,
    use_uva=True,  # 使用统一虚拟寻址（GPU 直接访问 CPU 内存）
)

for input_nodes, output_nodes, blocks in train_dataloader:
    # blocks 是采样得到的子图列表（每层一个）
    logits = model(blocks, blocks[0].srcdata['feat'])
    loss = F.cross_entropy(logits, blocks[-1].dstdata['label'])
```

**DGL 分布式训练**：

```python
# 启动分布式训练（命令行）
# python -m torch.distributed.run --nnodes=2 --nproc_per_node=4 train_dist.py

import dgl.distributed as dist

def train_dist():
    dist.initialize('ip_config.txt')
    g = dist.DistGraph('my_graph', part_config='data/my_graph.json')
    train_nids = dgl.distributed.node_split(g.ndata['train_mask'], g.get_partition_book())

    sampler = dgl.dataloading.NeighborSampler([15, 10])
    dataloader = dgl.dataloading.DistDataLoader(
        dataset=train_nids,
        batch_size=1000,
        collate_fn=sampler.sample,
        shuffle=True,
    )
    # ... 训练循环
```

### 13.4.4 PyG vs DGL 对比与选型指南

| 维度 | PyG | DGL |
|------|-----|-----|
| 设计哲学 | 轻量、Pythonic、与 PyTorch 无缝集成 | 功能全面、企业级、多后端支持 |
| 图对象 | `Data` 对象（无状态） | `DGLGraph`（有状态，图结构可原地修改） |
| 消息传递 | `MessagePassing` 基类（简洁） | `update_all()` + 自定义 message/reduce 函数 |
| 采样器 | `NeighborLoader`（易用） | `NeighborSampler` + `DataLoader`（灵活） |
| 分布式 | 依赖 PyTorch DDP | 原生分布式支持（DistGraph） |
| 异构图 | `HeteroData` | `dgl.heterograph()` |
| 社区生态 | 学术界主流，论文复现首选 | 工业界广泛使用，AWS 支持 |
| 学习曲线 | 低（PyTorch 用户友好） | 中（API 更底层） |

**选型建议**：

- **学术研究、快速原型**：选 PyG。代码简洁，论文复现代码多
- **工业级大规模图**：选 DGL。分布式支持成熟，采样器性能好
- **异构图表征学习**：两者均可，DGL 的异构图 API 更直观
- **需要多后端（PyTorch/TensorFlow/MXNet）**：选 DGL

### 13.4.5 本章小结

PyG 和 DGL 是当前最主流的两个 GNN 框架。PyG 适合快速迭代和学术研究，DGL 适合工业级大规模部署。两者都支持邻居采样、小批量训练和 GPU 加速。生产环境中，建议先用 PyG 做原型验证，再用 DGL 做大规模分布式训练。

---

## 13.5 图数据库中的向量搜索

### 13.5.1 解决的问题

图数据库擅长存储关联关系，但无法高效处理"找与某节点最相似的 Top-K 节点"这类**语义相似性搜索**。将图节点的嵌入向量存储在向量索引中，可以实现毫秒级的近似最近邻（ANN）搜索。

### 13.5.2 嵌入存储与 ANN 搜索

**核心流程**：

```
GNN 模型 → 节点嵌入向量 → 向量数据库（FAISS/pgvector） → ANN 索引 → 相似节点查询
```

**使用 FAISS 构建 ANN 索引**：

```python
import faiss
import numpy as np

# 假设已通过 GNN 得到所有节点的嵌入
# node_embeddings: [N, dim] numpy array
dim = 128
node_embeddings = np.random.randn(1000000, dim).astype(np.float32)

# 构建 IVF（倒排文件）索引
nlist = 100  # 聚类中心数
quantizer = faiss.IndexFlatIP(dim)  # 内积（余弦相似度）
index = faiss.IndexIVFFlat(quantizer, dim, nlist, faiss.METRIC_INNER_PRODUCT)

# 训练索引
index.train(node_embeddings)
index.add(node_embeddings)

# 搜索 Top-K 相似节点
query = node_embeddings[0:1]  # 查询节点
k = 10
distances, indices = index.search(query, k)
print(f"与节点0最相似的10个节点: {indices[0]}")
```

### 13.5.3 HNSW 算法

**解决的问题**：IVF 索引在数据量极大时召回率下降，HNSW 提供更高的召回率和更快的搜索速度。

**核心原理**：

HNSW（Hierarchical Navigable Small World）构建多层图结构：

- **底层**：包含所有节点，每个节点连接到最近的若干邻居
- **上层**：节点稀疏，作为"高速公路"快速导航到目标区域

搜索时从顶层开始，逐层向下，每层做贪心搜索。直觉上类似二分查找——先跳到大致区域，再精细搜索。

```python
# FAISS HNSW 索引
dim = 128
index = faiss.IndexHNSWFlat(dim, faiss.METRIC_INNER_PRODUCT)
index.hnsw.efConstruction = 200  # 构建时的搜索宽度（越大索引质量越高）
index.hnsw.efSearch = 64         # 搜索时的探索宽度（越大召回越高但越慢）

index.add(node_embeddings)

# 搜索
index.hnsw.efSearch = 128  # 搜索时动态调整
distances, indices = index.search(query, k=10)
```

**HNSW 参数调优**：

| 参数 | 作用 | 推荐值 |
|------|------|--------|
| M | 每层最大连接数 | 16-64（越大召回越高，内存越大） |
| efConstruction | 构建质量 | 200-500（越大索引越好但构建越慢） |
| efSearch | 搜索精度 | 64-256（越大召回越高，查询越慢） |

### 13.5.4 混合图 + 向量查询

**解决的问题**：实际场景中需要同时利用图结构和向量相似性。例如"找与用户 A 兴趣相似且在同一个社交圈内的用户"。

**实现方案**：

```python
def hybrid_graph_vector_search(user_id, graph_db, vector_index, top_k=20):
    """
    混合查询：先向量搜索候选，再用图结构过滤
    """
    # 1. 向量搜索：找兴趣相似的 Top-K 用户
    query_emb = get_user_embedding(user_id)
    distances, candidate_ids = vector_index.search(query_emb, top_k * 2)

    # 2. 图结构过滤：只保留在同一个社区/社交圈内的用户
    user_community = graph_db.get_community(user_id)
    filtered = []
    for cid in candidate_ids[0]:
        if graph_db.get_community(int(cid)) == user_community:
            filtered.append(int(cid))

    # 3. 按向量相似度排序
    return filtered[:top_k]
```

**Neo4j + pgvector 集成**：

```sql
-- 在 PostgreSQL 中创建向量扩展
CREATE EXTENSION vector;

-- 存储节点嵌入
CREATE TABLE node_embeddings (
    node_id BIGINT PRIMARY KEY,
    embedding VECTOR(128)
);

-- 创建 HNSW 索引
CREATE INDEX ON node_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- 混合查询：向量相似度 + 图关系过滤
SELECT n.node_id, 1 - (n.embedding <=> query_emb) AS similarity
FROM node_embeddings n
WHERE n.node_id IN (
    -- 图数据库中的邻居
    SELECT target_id FROM graph_edges WHERE source_id = 12345
)
ORDER BY n.embedding <=> query_emb
LIMIT 10;
```

### 13.5.5 与 pgvector / FAISS 深度集成

**pgvector 优势**：

- 与 PostgreSQL 事务集成，无需额外运维
- 支持 SQL 过滤 + 向量搜索的混合查询
- 适合数据量 < 1000 万的场景

**FAISS 优势**：

- 纯向量搜索性能极佳（GPU 加速）
- 支持多种索引类型（Flat、IVF、HNSW、PQ）
- 适合数据量 > 1000 万或对延迟要求极高的场景

**选型指南**：

```python
def choose_vector_db(num_vectors, dim, latency_sla_ms):
    if num_vectors < 10_000_000 and latency_sla_ms > 10:
        return "pgvector"  # 简单、事务一致
    elif num_vectors < 100_000_000:
        return "FAISS + HNSW"  # 高性能、中等规模
    else:
        return "FAISS + IVF+PQ"  # 极致压缩、超大规模
```

### 13.5.6 本章小结

向量搜索是图数据库能力的重要补充。通过将 GNN 生成的节点嵌入存储在 FAISS 或 pgvector 中，可以实现毫秒级的语义相似性搜索。HNSW 是当前最推荐的 ANN 算法，在召回率和查询速度之间取得了最佳平衡。生产环境中，通常采用"向量搜索召回候选 + 图结构过滤"的混合查询模式。

---

## 13.6 图神经网络实战应用

### 13.6.1 节点分类：用户类型预测

**解决的问题**：在社交平台中，根据用户的行为和关系网络预测用户类型（如"正常用户"、"营销号"、"机器人"）。

**实现方案**：

```python
import torch
import torch.nn.functional as F
from torch_geometric.nn import GCNConv
from torch_geometric.loader import NeighborLoader

class UserClassifier(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, num_classes):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, hidden_channels)
        self.conv3 = GCNConv(hidden_channels, num_classes)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = F.dropout(x, p=0.3, training=self.training)
        x = self.conv2(x, edge_index).relu()
        x = F.dropout(x, p=0.3, training=self.training)
        x = self.conv3(x, edge_index)
        return x

# 特征工程：用户特征 + 图结构特征
def build_user_features(users_df, graph):
    features = []
    for uid in users_df['user_id']:
        feat = [
            users_df.loc[users_df['user_id'] == uid, 'age'].values[0],
            users_df.loc[users_df['user_id'] == uid, 'post_count'].values[0],
            graph.degree(uid),
            nx.clustering(graph, uid),
            nx.pagerank(graph).get(uid, 0),
        ]
        features.append(feat)
    return torch.tensor(features, dtype=torch.float)

# 训练
model = UserClassifier(in_channels=5, hidden_channels=64, num_classes=3)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

for epoch in range(100):
    model.train()
    optimizer.zero_grad()
    out = model(data.x, data.edge_index)
    loss = F.cross_entropy(out[data.train_mask], data.y[data.train_mask])
    loss.backward()
    optimizer.step()

    # 评估
    model.eval()
    pred = out[data.test_mask].argmax(dim=1)
    acc = (pred == data.y[data.test_mask]).float().mean()
    print(f"Epoch {epoch:03d} | Loss: {loss:.4f} | Test Acc: {acc:.4f}")
```

**使用场景**：社交网络用户分类、欺诈检测、内容推荐。

**潜在风险与注意事项**：

- 类别不平衡（正常用户远多于异常用户）需使用加权损失或过采样
- 图结构可能被对抗性操纵（刷粉、制造虚假关系）
- 节点分类的标签传播效应——错误标签会通过消息传递污染邻居

### 13.6.2 链接预测：好友推荐

**解决的问题**：预测两个用户之间是否可能存在好友关系，用于社交推荐。

**实现方案**：

```python
import torch
from torch_geometric.utils import train_test_split_edges, negative_sampling
from torch_geometric.nn import GCNConv

class LinkPredictor(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, hidden_channels)
        # 边评分 MLP
        self.mlp = torch.nn.Sequential(
            torch.nn.Linear(hidden_channels * 2, hidden_channels),
            torch.nn.ReLU(),
            torch.nn.Linear(hidden_channels, 1),
        )

    def encode(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        return self.conv2(x, edge_index)

    def decode(self, z, edge_index):
        # 对每条边，拼接两端节点表示后评分
        src, dst = edge_index
        edge_feat = torch.cat([z[src], z[dst]], dim=-1)
        return self.mlp(edge_feat).sigmoid().squeeze()

    def forward(self, x, edge_index, pos_edge_index, neg_edge_index):
        z = self.encode(x, edge_index)
        pos_score = self.decode(z, pos_edge_index)
        neg_score = self.decode(z, neg_edge_index)
        return pos_score, neg_score

# 训练
data = train_test_split_edges(data)
model = LinkPredictor(in_channels=data.x.size(1), hidden_channels=64)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

for epoch in range(100):
    model.train()
    optimizer.zero_grad()

    # 负采样
    neg_edge_index = negative_sampling(
        edge_index=data.train_pos_edge_index,
        num_nodes=data.num_nodes,
        num_neg_samples=data.train_pos_edge_index.size(1),
    )

    pos_score, neg_score = model(
        data.x, data.train_pos_edge_index,
        data.train_pos_edge_index, neg_edge_index
    )

    # 二分类损失
    loss = F.binary_cross_entropy(
        torch.cat([pos_score, neg_score]),
        torch.cat([torch.ones_like(pos_score), torch.zeros_like(neg_score)])
    )
    loss.backward()
    optimizer.step()

    # 评估 AUC
    model.eval()
    z = model.encode(data.x, data.train_pos_edge_index)
    pos_score = model.decode(z, data.val_pos_edge_index)
    neg_score = model.decode(z, data.val_neg_edge_index)
    auc = compute_auc(pos_score, neg_score)
    print(f"Epoch {epoch:03d} | Loss: {loss:.4f} | Val AUC: {auc:.4f}")
```

**使用场景**：社交好友推荐、商品搭配推荐、知识图谱补全。

**潜在风险与注意事项**：

- 负采样策略至关重要——随机负采样太简单，需使用"难负例"（hard negative mining）
- 链接预测存在冷启动问题（新节点无历史边）
- 评估指标需关注 Precision@K 而非仅 AUC

### 13.6.3 图分类：分子性质预测

**解决的问题**：根据分子结构图预测其化学性质（如毒性、溶解度、药物活性）。

**实现方案**：

```python
from torch_geometric.nn import GCNConv, global_mean_pool, global_max_pool
from torch_geometric.datasets import MoleculeNet
from torch_geometric.loader import DataLoader

class MoleculeClassifier(torch.nn.Module):
    def __init__(self, node_feat_dim, edge_feat_dim, hidden_dim, num_classes):
        super().__init__()
        self.node_encoder = torch.nn.Linear(node_feat_dim, hidden_dim)
        self.conv1 = GCNConv(hidden_dim, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)
        self.conv3 = GCNConv(hidden_dim, hidden_dim)
        self.classifier = torch.nn.Sequential(
            torch.nn.Linear(hidden_dim * 2, hidden_dim),
            torch.nn.ReLU(),
            torch.nn.Dropout(0.5),
            torch.nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, x, edge_index, batch):
        x = self.node_encoder(x)
        x = self.conv1(x, edge_index).relu()
        x = self.conv2(x, edge_index).relu()
        x = self.conv3(x, edge_index).relu()
        # 全局池化：平均池化 + 最大池化拼接
        x_mean = global_mean_pool(x, batch)
        x_max = global_max_pool(x, batch)
        x = torch.cat([x_mean, x_max], dim=-1)
        return self.classifier(x)

# 加载分子数据集
dataset = MoleculeNet(root='/tmp/tox21', name='tox21')
# 划分训练/验证/测试
train_loader = DataLoader(dataset[:7000], batch_size=128, shuffle=True)
val_loader = DataLoader(dataset[7000:8000], batch_size=128)
test_loader = DataLoader(dataset[8000:], batch_size=128)

model = MoleculeClassifier(
    node_feat_dim=dataset.num_node_features,
    edge_feat_dim=dataset.num_edge_features,
    hidden_dim=128,
    num_classes=dataset.num_classes,
)
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

for epoch in range(50):
    model.train()
    total_loss = 0
    for batch in train_loader:
        optimizer.zero_grad()
        out = model(batch.x, batch.edge_index, batch.batch)
        loss = F.binary_cross_entropy_with_logits(
            out, batch.y.float()
        )
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    print(f"Epoch {epoch:03d} | Loss: {total_loss / len(train_loader):.4f}")
```

**使用场景**：药物发现、材料科学、化合物毒性预测。

**潜在风险与注意事项**：

- 分子图数据量通常较小（几千到几万），容易过拟合
- 分子性质预测需使用交叉验证而非单次划分
- 图分类的全局池化会丢失结构信息，可考虑虚拟节点（virtual node）或图同构网络（GIN）

### 13.6.4 图异常检测

**解决的问题**：在交易网络、通信网络或 IoT 网络中检测异常行为。

**实现方案**：

```python
import torch
from torch_geometric.nn import GCNConv
from torch_geometric.utils import k_hop_subgraph

class GraphAnomalyDetector(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels):
        super().__init__()
        self.encoder = torch.nn.Sequential(
            GCNConv(in_channels, hidden_channels),
            torch.nn.ReLU(),
            GCNConv(hidden_channels, hidden_channels),
        )
        # 使用自编码器结构：重建节点特征
        self.decoder = torch.nn.Sequential(
            torch.nn.Linear(hidden_channels, hidden_channels),
            torch.nn.ReLU(),
            torch.nn.Linear(hidden_channels, in_channels),
        )

    def forward(self, x, edge_index):
        z = self.encoder(x, edge_index)
        x_recon = self.decoder(z)
        return x_recon

    def anomaly_score(self, x, edge_index):
        x_recon = self.forward(x, edge_index)
        # 重建误差作为异常分数
        score = torch.mean((x - x_recon) ** 2, dim=-1)
        return score

# 训练：最小化正常节点的重建误差
model = GraphAnomalyDetector(in_channels=data.x.size(1), hidden_channels=64)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

for epoch in range(200):
    model.train()
    optimizer.zero_grad()
    x_recon = model(data.x, data.edge_index)
    # 只对正常节点计算重建损失
    loss = F.mse_loss(x_recon[data.normal_mask], data.x[data.normal_mask])
    loss.backward()
    optimizer.step()

# 推理：计算所有节点的异常分数
model.eval()
scores = model.anomaly_score(data.x, data.edge_index)
anomaly_nodes = torch.topk(scores, k=100).indices
print(f"Top-100 异常节点: {anomaly_nodes.tolist()}")
```

**使用场景**：金融交易反欺诈、网络入侵检测、异常账户识别。

**潜在风险与注意事项**：

- 异常检测通常极度不平衡（异常 < 1%），需使用无监督或半监督方法
- 图异常可能表现为"结构异常"（度异常高/低）或"特征异常"（属性偏离邻居）
- 自编码器方法假设异常节点难以重建，但复杂异常可能被"记住"
- 推荐结合多种方法：结构异常用 GNN + 特征异常用孤立森林

### 13.6.5 本章小结

| 任务 | 输入 | 输出 | 典型应用 |
|------|------|------|---------|
| 节点分类 | 节点特征 + 图结构 | 节点类别 | 用户类型预测 |
| 链接预测 | 节点特征 + 图结构 | 边存在概率 | 好友推荐 |
| 图分类 | 图结构 | 图类别 | 分子性质预测 |
| 异常检测 | 节点特征 + 图结构 | 异常分数 | 欺诈检测 |

四个任务覆盖了图学习的主要应用场景。生产环境中，特征工程和数据质量往往比模型选择更重要——好的图特征 + 简单 GCN 通常优于弱特征 + 复杂 GAT。

---

## 13.7 总结与展望

本章从图神经网络的基础原理出发，逐步深入到图表示学习、图数据库与 ML 集成、大规模图学习框架、向量搜索以及实战应用。

**核心要点**：

1. **GNN 的本质是消息传递**——聚合邻居信息更新自身表示，不同变体（GCN/GAT/GraphSAGE）的区别在于聚合方式
2. **图表示学习**让无标签图也能学到有效嵌入，Node2Vec 的 BFS/DFS 控制是关键调参点
3. **图数据库 + ML 集成**需要解决数据导出、特征工程和在线推理三个问题
4. **PyG 适合研究，DGL 适合生产**——根据场景选择合适的框架
5. **向量搜索**是图数据库能力的重要补充，HNSW 是当前最优的 ANN 算法
6. **实战中特征工程比模型选择更重要**——好的特征 + 简单模型 > 弱特征 + 复杂模型

**未来趋势**：

- **大语言模型 + 图**：LLM 作为图推理的 Agent，自然语言描述图查询
- **时序图神经网络**：处理动态图（如交易网络的时间演化）
- **图基础模型**：预训练一个通用图编码器，下游任务微调
- **图数据库原生 ML**：图数据库内置 GNN 训练和推理能力（如 Neo4j GDS）
