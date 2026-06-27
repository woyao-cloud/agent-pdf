# 第八章 社交网络与推荐系统

社交网络分析与推荐系统是图数据库最经典、最具商业价值的应用场景。Facebook、Twitter、LinkedIn、抖音等平台的核心功能——好友推荐、内容推送、影响力排序——本质上都是图上的计算问题。Amazon Neptune 作为托管图数据库，为这些场景提供了原生 Gremlin 遍历引擎和高效的图算法支持。本章从社交关系建模出发，逐步深入到推荐算法、影响力分析，最终给出一个完整的社交网络实现方案。

---

## 8.1 社交关系图建模

### 8.1.1 解决的问题

传统关系型数据库用 `user_friends` 关联表存储好友关系，查询"朋友的朋友"需要多次 JOIN，深度超过 3 层时性能急剧下降。图数据库将社交关系建模为顶点和边，使多跳遍历成为索引级操作。核心问题包括：

- 如何用顶点和边表达用户、内容、互动三者之间的关系
- 如何平衡查询效率与存储成本
- 如何设计标签（label）和属性（property）以满足多种推荐算法的输入要求

### 8.1.2 核心原理

社交网络的图模型遵循**面向领域的标签设计**原则。每个顶点有一个主标签（如 `User`、`Post`），边标签描述关系类型（如 `FOLLOWS`、`LIKES`）。属性承载业务数据，同时作为算法计算的输入特征。

**顶点模型：**

| 标签 | 属性 | 说明 |
|------|------|------|
| `User` | `userId`, `name`, `age`, `city`, `interests`, `createdAt` | 用户节点，interests 为列表类型 |
| `Post` | `postId`, `content`, `tags`, `createdAt` | 内容节点 |
| `Group` | `groupId`, `name`, `category`, `memberCount` | 兴趣群组 |
| `Topic` | `topicId`, `name` | 话题标签节点 |

**边模型：**

| 边标签 | 起点→终点 | 属性 | 语义 |
|---------|-----------|------|------|
| `FOLLOWS` | User → User | `weight`, `createdAt` | 关注关系（有向） |
| `FRIEND` | User → User | `weight`, `createdAt` | 好友关系（双向） |
| `POST` | User → Post | `createdAt` | 用户发布内容 |
| `LIKE` | User → Post | `weight`, `createdAt` | 用户点赞内容 |
| `SHARE` | User → Post | `createdAt` | 用户分享内容 |
| `MEMBER_OF` | User → Group | `joinedAt`, `role` | 用户加入群组 |
| `BELONGS_TO` | Post → Topic | — | 内容归属话题 |

### 8.1.3 代码/配置实现

以下 Gremlin 语句在 Neptune 中创建完整的社交图 schema（Neptune 是 schema-optional，但推荐显式创建索引）：

```groovy
// 创建顶点标签（Neptune 无需显式创建，插入即自动创建）
// 但推荐创建索引以优化查询性能

// 创建边索引——按标签和属性加速遍历
// Neptune 中通过属性图模型自动维护邻接索引，无需手动创建

// 插入用户顶点
g.addV('User')
  .property('userId', 'u1001')
  .property('name', '张三')
  .property('age', 28)
  .property('city', '北京')
  .property('interests', ['AI', '图数据库', '推荐系统'])
  .property('createdAt', '2024-01-15T08:00:00Z')

g.addV('User')
  .property('userId', 'u1002')
  .property('name', '李四')
  .property('age', 32)
  .property('city', '上海')
  .property('interests', ['云计算', '大数据', 'AI'])
  .property('createdAt', '2024-02-20T10:30:00Z')

// 插入内容顶点
g.addV('Post')
  .property('postId', 'p2001')
  .property('content', '图数据库在推荐系统中的应用实践')
  .property('tags', ['图数据库', '推荐系统'])
  .property('createdAt', '2024-03-01T09:00:00Z')

g.addV('Post')
  .property('postId', 'p2002')
  .property('content', 'Neptune Gremlin 性能调优指南')
  .property('tags', ['Neptune', 'Gremlin'])
  .property('createdAt', '2024-03-05T14:00:00Z')

// 插入群组顶点
g.addV('Group')
  .property('groupId', 'g3001')
  .property('name', '图数据库爱好者')
  .property('category', '技术')
  .property('memberCount', 1560)

// 插入话题顶点
g.addV('Topic')
  .property('topicId', 't4001')
  .property('name', '图数据库')

g.addV('Topic')
  .property('topicId', 't4002')
  .property('name', '推荐系统')
```

**建立关系边：**

```groovy
// 关注关系
g.V().has('User', 'userId', 'u1001').as('a')
  .V().has('User', 'userId', 'u1002').as('b')
  .addE('FOLLOWS').from('a').to('b')
  .property('weight', 1.0)
  .property('createdAt', '2024-03-10T12:00:00Z')

// 好友关系（双向）
g.V().has('User', 'userId', 'u1001').as('a')
  .V().has('User', 'userId', 'u1003').as('b')
  .addE('FRIEND').from('a').to('b')
  .property('weight', 0.8)
g.V().has('User', 'userId', 'u1003').as('a')
  .V().has('User', 'userId', 'u1001').as('b')
  .addE('FRIEND').from('a').to('b')
  .property('weight', 0.8)

// 用户发布内容
g.V().has('User', 'userId', 'u1001').as('a')
  .V().has('Post', 'postId', 'p2001').as('b')
  .addE('POST').from('a').to('b')

// 用户点赞内容
g.V().has('User', 'userId', 'u1002').as('a')
  .V().has('Post', 'postId', 'p2001').as('b')
  .addE('LIKE').from('a').to('b')
  .property('weight', 1.0)

// 用户加入群组
g.V().has('User', 'userId', 'u1001').as('a')
  .V().has('Group', 'groupId', 'g3001').as('b')
  .addE('MEMBER_OF').from('a').to('b')
  .property('joinedAt', '2024-02-01')
  .property('role', 'member')

// 内容归属话题
g.V().has('Post', 'postId', 'p2001').as('a')
  .V().has('Topic', 'topicId', 't4001').as('b')
  .addE('BELONGS_TO').from('a').to('b')
```

### 8.1.4 使用场景

- **社交平台**：微信、微博、抖音的好友关系链
- **企业协作**：组织架构图、项目协作关系
- **内容平台**：知乎、Medium 的作者-文章-话题关系
- **电商社交**：拼多多的拼团关系、淘宝的分享裂变

### 8.1.5 潜在风险与注意事项

- **边方向语义一致性**：`FOLLOWS` 是有向边，`FRIEND` 是双向边，查询时必须区分方向。混淆方向会导致推荐结果完全错误。
- **属性膨胀**：不要在顶点上存储过多动态属性（如"今日活跃度"），这类属性应放在边或独立的时间序列存储中。
- **Neptune 的 ID 策略**：使用业务 ID（如 `userId`）作为属性而非顶点 ID。Neptune 的顶点 ID 是内部标识符，不应暴露给业务层。
- **大规模图的写入吞吐**：批量写入时使用 `g.V().has(...)` 查找顶点再建边的方式在百万级顶点下会变慢，应使用 Neptune 的批量加载器（` NeptuneLoader`）或 `StreamLoader`。

### 8.1.6 本章小结

社交关系图建模的核心是**用边表达关系，用顶点承载实体，用属性提供特征**。设计时需明确每条边的方向语义，避免属性过度膨胀。Neptune 的 schema-optional 特性允许灵活迭代，但生产环境应通过索引和约束保证查询性能。

---

## 8.2 好友推荐算法

### 8.2.1 解决的问题

"你可能认识的人"是社交平台最基础也最重要的功能。好的好友推荐能显著提升用户留存和社交网络密度。核心挑战在于：如何在百万级用户中快速找到与目标用户最可能建立连接的其他用户，并给出合理的排序。

### 8.2.2 核心原理

好友推荐算法可分为以下几类，复杂度递增：

**1. 共同邻居（Common Neighbors）**

最基本的方法：用户 A 和用户 B 的共同好友越多，他们成为好友的概率越高。

$$CN(A, B) = |\Gamma(A) \cap \Gamma(B)|$$

其中 $\Gamma(A)$ 表示用户 A 的邻居集合。

**2. 杰卡德相似度（Jaccard Similarity）**

在共同邻居基础上归一化，消除"大 V"效应——一个关注了 10000 人的用户与任何人都有大量共同邻居。

$$J(A, B) = \frac{|\Gamma(A) \cap \Gamma(B)|}{|\Gamma(A) \cup \Gamma(B)|}$$

**3. 二跳遍历（Friends-of-Friends, 2-Hop）**

从目标用户出发，沿 `FOLLOWS` 边走两步，到达的所有用户即为"朋友的朋友"。这是最直观的推荐候选集生成方式。

**4. 个性化 PageRank（Personalized PageRank, PPR）**

以目标用户为起点进行随机游走，游走过程中以概率 $\alpha$ 回到起点、以概率 $1-\alpha$ 继续沿边前进。最终每个顶点的访问概率即为该顶点与目标用户的相关性分数。PPR 能捕捉到多跳之外的弱连接，效果优于纯拓扑方法。

### 8.2.3 代码/配置实现

**二跳好友推荐（基础版）：**

```groovy
// 查找用户 u1001 的朋友的朋友（排除已直接关注的人）
g.V().has('User', 'userId', 'u1001').as('me')
  // 我关注的人
  .out('FOLLOWS').aggregate('my_friends')
  // 他们关注的人
  .out('FOLLOWS')
  // 排除我自己
  .where(neq('me'))
  // 排除已关注的人
  .where(without('my_friends'))
  // 去重并统计共同好友数
  .groupCount()
  .order(local).by(values, desc)
  .limit(10)
```

**共同邻居计数：**

```groovy
// 计算 u1001 和 u1002 的共同好友数
g.V().has('User', 'userId', 'u1001').as('a')
  .V().has('User', 'userId', 'u1002').as('b')
  .select('a').out('FOLLOWS').where(
    __.in('FOLLOWS').hasId(select('b').id())
  ).count()
```

**杰卡德相似度计算：**

```groovy
// 计算 u1001 和 u1002 的杰卡德相似度
g.V().has('User', 'userId', 'u1001').as('a')
  .V().has('User', 'userId', 'u1002').as('b')
  .select('a').out('FOLLOWS').fold().as('neighbors_a')
  .select('b').out('FOLLOWS').fold().as('neighbors_b')
  .select('neighbors_a', 'neighbors_b')
  .map(
    // 计算交集大小
    union(
      select('neighbors_a').unfold().where(
        within(select('neighbors_b'))
      ).count(),
      // 计算并集大小
      union(
        select('neighbors_a').unfold(),
        select('neighbors_b').unfold()
      ).dedup().count()
    ).fold()
    // Jaccard = 交集 / 并集
    .map{ it.get()[0] / (it.get()[1] as double) }
  )
```

**基于兴趣的推荐（利用顶点属性）：**

```groovy
// 推荐与 u1001 兴趣相似的用户
g.V().has('User', 'userId', 'u1001').as('me')
  .property('interests').as('my_interests')
  // 找到所有其他用户
  .V().hasLabel('User')
  .where(neq('me'))
  .not(__.in('FOLLOWS').where(eq('me')))
  // 计算兴趣交集大小
  .map{
    def my = (List) it.get('my_interests')
    def their = (List) it.get().property('interests').value()
    def intersection = my.intersect(their)
    intersection.size()
  }
  .order(local).by(values, desc)
  .limit(10)
```

**个性化 PageRank（使用 Neptune ML 或 Gremlin 内置算法）：**

```groovy
// Neptune 内置的 PageRank 算法
// 以 u1001 为起点计算个性化 PageRank
g.V().has('User', 'userId', 'u1001')
  .pageRank()
    .by('pageRank')
    .edges(__.outE('FOLLOWS'))
  .order().by('pageRank', desc)
  .limit(10)
  .valueMap('userId', 'name', 'pageRank')
```

**Python 客户端调用示例：**

```python
import requests
import json
from gremlin_python.driver import client, serializer

# 使用 Gremlin Python 客户端连接 Neptune
neptune_endpoint = "your-neptune-cluster.cluster-xxxxx.neptune.amazonaws.com"
neptune_port = 8182

def get_friend_recommendations(user_id: str, limit: int = 10) -> list:
    """获取好友推荐列表"""
    query = f"""
    g.V().has('User', 'userId', '{user_id}').as('me')
      .out('FOLLOWS').aggregate('my_friends')
      .out('FOLLOWS')
      .where(neq('me'))
      .where(without('my_friends'))
      .groupCount()
      .order(local).by(values, desc)
      .limit({limit})
    """
    
    conn = client.Client(
        f'wss://{neptune_endpoint}:{neptune_port}/gremlin',
        'g',
        message_serializer=serializer.GraphSONSerializersV3d0()
    )
    
    result = conn.submit(query).all().result()
    conn.close()
    return result

def get_jaccard_recommendations(user_id: str, limit: int = 10) -> list:
    """基于杰卡德相似度的好友推荐"""
    query = f"""
    g.V().has('User', 'userId', '{user_id}').as('me')
      .out('FOLLOWS').aggregate('my_friends')
      .out('FOLLOWS')
      .where(neq('me'))
      .where(without('my_friends'))
      .dedup()
      .limit({limit * 3})
      .map({{
        def other = it.get()
        def my_neighbors = __.select('me').out('FOLLOWS').fold().next()
        def other_neighbors = __.V(other).out('FOLLOWS').fold().next()
        def intersection = my_neighbors.intersect(other_neighbors)
        def union = (my_neighbors + other_neighbors).unique()
        double jaccard = union.isEmpty() ? 0.0 : intersection.size() / (double) union.size()
        return [userId: other.property('userId').value(), jaccard: jaccard]
      }})
      .order(local).by('jaccard', desc)
      .limit({limit})
    """
    # 执行查询...
    pass

# 批量推荐——为所有活跃用户计算推荐
def batch_recommend_all_users():
    """为所有用户批量计算好友推荐（离线任务）"""
    # 1. 获取所有用户
    all_users_query = "g.V().hasLabel('User').values('userId').fold()"
    # 2. 对每个用户计算推荐
    # 3. 将结果写入推荐缓存表（DynamoDB 或 Redis）
    pass
```

### 8.2.4 使用场景

- **新用户冷启动**：基于注册信息（城市、学校、公司）做属性匹配推荐
- **社交裂变**：拼多多"邀请好友助力"中的潜在好友推荐
- **职场社交**：LinkedIn 的"你可能认识的人"基于二度人脉
- **游戏社交**：王者荣耀的"可能认识的好友"推荐

### 8.2.5 潜在风险与注意事项

- **冷启动问题**：新用户没有关注关系，无法使用图拓扑算法。应退化为基于属性的推荐（同城、同校、同兴趣）。
- **算法偏见**：共同邻居算法倾向于推荐"大 V"用户，导致推荐结果同质化。应结合杰卡德系数或 PPR 做归一化。
- **实时性**：好友推荐通常不需要实时更新。建议使用离线批处理（每小时/每天）计算结果写入缓存，在线服务从缓存读取。
- **Neptune 查询超时**：`groupCount()` 在大量候选集上可能超时。应使用 `limit()` 提前截断，或使用 Neptune 的 `queryTimeout` 配置。
- **隐私合规**：推荐算法不应暴露用户未公开的信息。例如，不应基于"共同群组"推荐用户给不想被发现的人。

### 8.2.6 本章小结

好友推荐的核心是**候选集生成 + 排序**。二跳遍历生成候选集，共同邻居和杰卡德相似度做基础排序，个性化 PageRank 做深度排序。生产环境中应使用离线批处理 + 在线缓存的架构，避免实时图遍历的开销。冷启动场景需退化为基于属性的推荐策略。

---

## 8.3 影响力传播分析

### 8.3.1 解决的问题

在社交网络中，哪些用户是"意见领袖"？一条信息如何从源头扩散到整个网络？社区是如何形成的？这些问题对应三个核心分析任务：**影响力评分**、**信息传播路径追踪**、**社区发现**。它们共同构成了社交网络分析的"上层建筑"。

### 8.3.2 核心原理

**PageRank 影响力评分：**

PageRank 最初用于网页排名，其核心思想被广泛用于社交网络影响力分析：一个用户的影响力取决于（a）有多少人关注他，以及（b）关注他的人本身有多大的影响力。数学上，用户 $u$ 的 PageRank 值 $PR(u)$ 为：

$$PR(u) = \frac{1-d}{N} + d \sum_{v \in In(u)} \frac{PR(v)}{Out(v)}$$

其中 $d$ 是阻尼因子（通常取 0.85），$In(u)$ 是关注 $u$ 的用户集合，$Out(v)$ 是 $v$ 关注的用户数。

**Louvain 社区检测：**

Louvain 算法通过最大化**模块度（Modularity）**来发现社区结构。模块度衡量社区内边的密度与随机图中边密度的差异：

$$Q = \frac{1}{2m} \sum_{ij} \left[ A_{ij} - \frac{k_i k_j}{2m} \right] \delta(c_i, c_j)$$

其中 $A_{ij}$ 是邻接矩阵，$k_i$ 是节点 $i$ 的度数，$m$ 是总边数，$\delta(c_i, c_j)$ 表示节点 $i$ 和 $j$ 是否在同一社区。

**信息传播路径：**

信息在社交网络中的传播遵循**独立级联模型（Independent Cascade Model）**：当一个用户看到信息后，以概率 $p$ 激活其邻居。传播路径本质上是在图上做 BFS，但边上有激活概率权重。

### 8.3.3 代码/配置实现

**PageRank 计算（Neptune 内置算法）：**

```groovy
// 全图 PageRank——找出最具影响力的用户
g.V().hasLabel('User')
  .pageRank()
    .by('influenceScore')
    .edges(__.outE('FOLLOWS'))
  .order().by('influenceScore', desc)
  .limit(20)
  .valueMap('userId', 'name', 'influenceScore')

// 带权重的 PageRank（考虑互动强度）
g.V().hasLabel('User')
  .pageRank()
    .by('influenceScore')
    .edges(__.outE('FOLLOWS').has('weight', gt(0)))
  .order().by('influenceScore', desc)
  .limit(20)
  .valueMap('userId', 'name', 'influenceScore')
```

**社区检测（Louvain 算法）：**

Neptune 通过 `neptune#` 图算法端点或 Spark 连接器支持 Louvain 算法。以下是通过 Neptune ML 或自定义 Gremlin 实现的社区检测：

```groovy
// 使用 Gremlin 的 connectedComponents 做社区发现
g.V().hasLabel('User')
  .connectedComponents()
    .by('componentId')
    .edges(__.outE('FOLLOWS'))
  .valueMap('userId', 'componentId')
  .group()
    .by('componentId')
    .by(count())
  .order(local).by(values, desc)
```

**信息传播路径追踪：**

```groovy
// 从用户 u1001 出发，追踪信息传播路径（广度优先，限制深度为 3）
g.V().has('User', 'userId', 'u1001')
  .repeat(
    __.out('FOLLOWS')
      .simplePath()
  )
  .times(3)
  .path()
  .limit(100)

// 带传播概率的路径（假设每条 FOLLOWS 边有 activationProb 属性）
g.V().has('User', 'userId', 'u1001')
  .repeat(
    __.outE('FOLLOWS')
      .has('activationProb', gte(0.3))  // 只走激活概率 >= 0.3 的边
      .inV()
      .simplePath()
  )
  .times(3)
  .path()
  .limit(100)
```

**最短路径分析（信息传播的最快路径）：**

```groovy
// 查找 u1001 到 u1050 的最短路径
g.V().has('User', 'userId', 'u1001')
  .repeat(
    __.out('FOLLOWS')
      .simplePath()
  )
  .until(has('User', 'userId', 'u1050'))
  .path()
  .limit(5)

// 带权最短路径（边权重代表传播成本，越低越好）
g.V().has('User', 'userId', 'u1001')
  .repeat(
    __.outE('FOLLOWS')
      .order().by('weight', asc)
      .inV()
      .simplePath()
  )
  .until(has('User', 'userId', 'u1050'))
  .path()
  .limit(3)
```

**Python 实现影响力分析：**

```python
import boto3
from gremlin_python.driver import client, serializer
import networkx as nx
from collections import defaultdict

class SocialInfluenceAnalyzer:
    """社交影响力分析器"""
    
    def __init__(self, neptune_endpoint: str, neptune_port: int = 8182):
        self.endpoint = neptune_endpoint
        self.port = neptune_port
    
    def _query(self, gremlin_query: str) -> list:
        conn = client.Client(
            f'wss://{self.endpoint}:{self.port}/gremlin',
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        try:
            return conn.submit(gremlin_query).all().result()
        finally:
            conn.close()
    
    def get_top_influencers(self, top_n: int = 20) -> list:
        """获取最具影响力的 Top N 用户"""
        query = f"""
        g.V().hasLabel('User')
          .pageRank()
            .by('influenceScore')
            .edges(__.outE('FOLLOWS'))
          .order().by('influenceScore', desc)
          .limit({top_n})
          .valueMap('userId', 'name', 'influenceScore')
        """
        return self._query(query)
    
    def trace_propagation_path(self, start_user: str, max_depth: int = 3) -> list:
        """追踪信息传播路径"""
        query = f"""
        g.V().has('User', 'userId', '{start_user}')
          .repeat(
            __.out('FOLLOWS').simplePath()
          )
          .times({max_depth})
          .path()
          .limit(100)
        """
        return self._query(query)
    
    def detect_communities(self) -> dict:
        """检测社交网络中的社区"""
        query = """
        g.V().hasLabel('User')
          .connectedComponents()
            .by('componentId')
            .edges(__.outE('FOLLOWS'))
          .group()
            .by('componentId')
            .by(__.fold().project('members', 'size')
              .by(__.unfold().values('userId').fold())
              .by(__.unfold().count()))
        """
        return self._query(query)
    
    def shortest_influence_path(self, from_user: str, to_user: str) -> list:
        """查找两个用户之间的最短影响路径"""
        query = f"""
        g.V().has('User', 'userId', '{from_user}')
          .repeat(
            __.out('FOLLOWS').simplePath()
          )
          .until(has('User', 'userId', '{to_user}'))
          .path()
          .limit(3)
        """
        return self._query(query)
    
    def compute_influence_centrality(self) -> dict:
        """计算多种中心性指标"""
        # 下载子图到本地用 NetworkX 计算
        query = """
        g.V().hasLabel('User')
          .project('userId', 'followers', 'following')
            .by('userId')
            .by(__.in('FOLLOWS').count())
            .by(__.out('FOLLOWS').count())
        """
        results = self._query(query)
        
        # 构建 NetworkX 图做更复杂的分析
        G = nx.DiGraph()
        for r in results:
            G.add_node(r['userId'])
        
        # 添加边
        edges_query = "g.E().hasLabel('FOLLOWS').project('from','to').by(outV().values('userId')).by(inV().values('userId'))"
        edges = self._query(edges_query)
        for e in edges:
            G.add_edge(e['from'], e['to'])
        
        # 计算多种中心性
        return {
            'degree_centrality': nx.degree_centrality(G),
            'betweenness_centrality': nx.betweenness_centrality(G),
            'closeness_centrality': nx.closeness_centrality(G),
            'pagerank': nx.pagerank(G, alpha=0.85)
        }


# 使用示例
analyzer = SocialInfluenceAnalyzer(
    neptune_endpoint="your-neptune-cluster.xxxxx.neptune.amazonaws.com"
)

# 获取 Top 10 意见领袖
influencers = analyzer.get_top_influencers(10)
for u in influencers:
    print(f"用户 {u['name']}: 影响力分数 {u['influenceScore']}")

# 检测社区
communities = analyzer.detect_communities()
for comp_id, data in communities.items():
    print(f"社区 {comp_id}: {data['size']} 个成员")
```

### 8.3.4 使用场景

- **KOL 识别**：抖音、小红书的内容创作者影响力评分
- **舆情监控**：追踪谣言或热点事件的传播路径
- **精准营销**：找到社区中的"关键意见消费者"（KOC）进行产品投放
- **反欺诈**：检测异常传播模式（如僵尸粉的传播路径与正常用户不同）
- **推荐冷启动**：将新用户分配到检测到的社区，推荐该社区热门内容

### 8.3.5 潜在风险与注意事项

- **PageRank 的"大 V"偏差**：PageRank 天然偏向粉丝量大的用户，可能忽略"垂直领域专家"。建议在 PageRank 基础上结合领域权重做修正。
- **社区检测的稳定性**：Louvain 算法的结果受顶点遍历顺序影响，同一网络多次运行可能得到不同社区划分。生产环境应固定随机种子。
- **大规模图的计算成本**：全图 PageRank 和 Louvain 在亿级边网络上的计算时间可能长达数小时。建议使用 Neptune 的 Spark 连接器（Neptune Analytics）做分布式计算。
- **传播路径的近似性**：独立级联模型假设传播概率是静态的，实际传播受内容质量、时间窗口、用户活跃度等多因素影响。模型输出应视为"潜在路径"而非"实际路径"。
- **Neptune 算法限制**：Neptune 内置的 PageRank 和 Connected Components 适用于中小规模图（千万级边）。更大规模需使用 Neptune Analytics 或导出到 SageMaker。

### 8.3.6 本章小结

影响力分析的三根支柱是**PageRank 评分**（谁有影响力）、**社区检测**（谁和谁是一类人）、**传播路径追踪**（信息如何流动）。Neptune 内置的图算法可以覆盖中小规模网络的分析需求，大规模场景需借助 Neptune Analytics 或外部计算框架。实际应用中，影响力分数应作为推荐排序的权重因子，而非唯一依据。

---

## 8.4 内容推荐引擎

### 8.4.1 解决的问题

内容推荐是社交平台的核心功能——Feed 流、视频推荐、文章推送。目标是：在用户打开应用时，从海量内容中筛选出用户最可能感兴趣的内容。图数据库在此场景中的优势在于：可以自然地融合**用户-内容交互图**和**用户-用户社交图**，实现混合推荐。

### 8.4.2 核心原理

**协同过滤（Collaborative Filtering）：**

- **基于用户的协同过滤（User-Based CF）**：找到与目标用户兴趣相似的用户群，推荐这群用户喜欢的内容。用户相似度可以通过共同点赞/分享的内容数量计算。
- **基于物品的协同过滤（Item-Based CF）**：找到与目标内容相似的其他内容，推荐给看过目标内容的用户。内容相似度可以通过共同被点赞/分享的用户数量计算。

**基于内容的过滤（Content-Based Filtering）：**

利用内容的属性（标签、分类、关键词）和用户的属性（兴趣标签、历史行为）做匹配。在图模型中，这表现为用户顶点和内容顶点之间的属性相似度计算。

**混合推荐（Hybrid Recommendation）：**

将协同过滤和基于内容的过滤结果加权融合，弥补各自的不足。图数据库天然适合混合推荐——一次遍历可以同时利用社交关系和内容属性。

### 8.4.3 代码/配置实现

**基于用户的协同过滤（User-Based CF）：**

```groovy
// 为用户 u1001 推荐内容
// 1. 找到与 u1001 兴趣相似的用户（共同点赞/分享的内容多）
// 2. 推荐这些用户喜欢但 u1001 未看过的内容
g.V().has('User', 'userId', 'u1001').as('me')
  // 我点赞过的内容
  .out('LIKE').aggregate('my_likes')
  // 谁还点赞了这些内容
  .in('LIKE').where(neq('me')).dedup().as('similar_user')
  // 这些相似用户点赞的其他内容
  .out('LIKE').where(without('my_likes')).dedup()
  // 按相似用户数排序（越多相似用户喜欢，推荐优先级越高）
  .groupCount()
  .order(local).by(values, desc)
  .limit(20)
```

**基于物品的协同过滤（Item-Based CF）：**

```groovy
// 推荐与内容 p2001 相似的内容
g.V().has('Post', 'postId', 'p2001').as('target')
  // 谁点赞了目标内容
  .in('LIKE').as('user')
  // 他们还点赞了什么
  .out('LIKE').where(neq('target')).dedup().as('similar_post')
  // 按共同点赞用户数排序
  .groupCount()
  .order(local).by(values, desc)
  .limit(10)
```

**基于内容的过滤（Content-Based Filtering）：**

```groovy
// 基于用户兴趣标签推荐内容
g.V().has('User', 'userId', 'u1001').as('me')
  .property('interests').as('my_interests')
  // 找到所有未看过的内容
  .V().hasLabel('Post')
  .not(__.in('LIKE').where(eq('me')))
  .not(__.in('SHARE').where(eq('me')))
  // 计算内容标签与用户兴趣的交集
  .map{
    def interests = (List) it.get('my_interests')
    def tags = (List) it.get().property('tags').value()
    def overlap = interests.intersect(tags)
    [post: it.get().property('postId').value(), score: overlap.size()]
  }
  .order(local).by('score', desc)
  .limit(20)
```

**混合推荐（融合社交 + 内容 + 热度）：**

```groovy
// 混合推荐——融合多种信号
g.V().has('User', 'userId', 'u1001').as('me')
  // 信号1: 好友点赞的内容（社交信号）
  .out('FOLLOWS').out('LIKE').dedup().as('friend_liked')
  // 信号2: 与我兴趣标签匹配的内容（内容信号）
  .V().hasLabel('Post')
    .where(__.has('tags', within(
      __.select('me').property('interests').value()
    )))
  // 合并两个信号源
  .union(
    select('friend_liked'),
    select('me').out('LIKE').aggregate('seen')
      .V().hasLabel('Post')
      .where(without('seen'))
      .where(__.has('tags', within(
        __.select('me').property('interests').value()
      )))
  )
  .dedup()
  .limit(30)
```

**带时间衰减的推荐（考虑内容新鲜度）：**

```groovy
// 推荐时考虑内容的新鲜度（7天内的内容权重更高）
g.V().has('User', 'userId', 'u1001').as('me')
  .out('FOLLOWS').out('LIKE').dedup().as('post')
  .project('postId', 'content', 'score')
    .by(select('post').property('postId'))
    .by(select('post').property('content'))
    .by(
      // 基础分 + 时间衰减
      union(
        select('post').in('LIKE').count(),  // 点赞数
        constant(1)
      ).fold()
      .map{
        def likes = it.get()[0]
        def age = System.currentTimeMillis() / 1000 - 
                  select('post').property('createdAt').value().toTimestamp().getTime() / 1000
        def hours = age / 3600
        likes * Math.exp(-hours / 72.0)  // 72小时半衰期
      }
    )
  .order().by('score', desc)
  .limit(20)
```

**Python 实现推荐引擎：**

```python
from gremlin_python.driver import client, serializer
import numpy as np
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

class ContentRecommender:
    """内容推荐引擎"""
    
    def __init__(self, neptune_endpoint: str, neptune_port: int = 8182):
        self.endpoint = neptune_endpoint
        self.port = neptune_port
    
    def _query(self, gremlin_query: str) -> list:
        conn = client.Client(
            f'wss://{self.endpoint}:{self.port}/gremlin',
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        try:
            return conn.submit(gremlin_query).all().result()
        finally:
            conn.close()
    
    def user_based_cf(self, user_id: str, limit: int = 20) -> list:
        """基于用户的协同过滤推荐"""
        query = f"""
        g.V().has('User', 'userId', '{user_id}').as('me')
          .out('LIKE').aggregate('my_likes')
          .in('LIKE').where(neq('me')).dedup().as('similar_user')
          .out('LIKE').where(without('my_likes')).dedup()
          .groupCount()
          .order(local).by(values, desc)
          .limit({limit})
        """
        return self._query(query)
    
    def content_based_filtering(self, user_id: str, limit: int = 20) -> list:
        """基于内容的过滤推荐"""
        query = f"""
        g.V().has('User', 'userId', '{user_id}').as('me')
          .property('interests').as('my_interests')
          .V().hasLabel('Post')
          .not(__.in('LIKE').where(eq('me')))
          .not(__.in('SHARE').where(eq('me')))
          .map{{
            def interests = (List) it.get('my_interests')
            def tags = (List) it.get().property('tags').value()
            def overlap = interests.intersect(tags)
            [postId: it.get().property('postId').value(), score: overlap.size()]
          }}
          .order(local).by('score', desc)
          .limit({limit})
        """
        return self._query(query)
    
    def hybrid_recommend(self, user_id: str, 
                         cf_weight: float = 0.6,
                         cb_weight: float = 0.3,
                         popularity_weight: float = 0.1,
                         limit: int = 30) -> list:
        """混合推荐——加权融合多种推荐策略"""
        
        # 获取协同过滤结果
        cf_results = self.user_based_cf(user_id, limit=limit)
        # 获取基于内容的结果
        cb_results = self.content_based_filtering(user_id, limit=limit)
        # 获取热门内容
        popularity_query = f"""
        g.V().hasLabel('Post')
          .project('postId', 'popularity')
            .by('postId')
            .by(__.in('LIKE').count())
          .order().by('popularity', desc)
          .limit({limit})
        """
        popularity_results = self._query(popularity_query)
        
        # 融合评分
        scores = {}
        
        for item in cf_results:
            post_id = list(item.keys())[0]
            score = list(item.values())[0]
            scores[post_id] = scores.get(post_id, 0) + score * cf_weight
        
        for item in cb_results:
            post_id = item['postId']
            score = item['score']
            scores[post_id] = scores.get(post_id, 0) + score * cb_weight
        
        for item in popularity_results:
            post_id = item['postId']
            score = item['popularity']
            scores[post_id] = scores.get(post_id, 0) + score * popularity_weight
        
        # 排序并返回 Top N
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]
        return [{'postId': pid, 'finalScore': round(score, 4)} 
                for pid, score in ranked]
    
    def get_personalized_feed(self, user_id: str, limit: int = 50) -> list:
        """获取个性化 Feed 流"""
        # 1. 好友发布的内容（社交权重最高）
        friends_posts_query = f"""
        g.V().has('User', 'userId', '{user_id}')
          .out('FOLLOWS')
          .out('POST')
          .order().by('createdAt', desc)
          .limit({limit})
          .valueMap('postId', 'content', 'createdAt', 'tags')
        """
        friends_posts = self._query(friends_posts_query)
        
        # 2. 好友点赞的内容
        friends_liked_query = f"""
        g.V().has('User', 'userId', '{user_id}')
          .out('FOLLOWS')
          .out('LIKE')
          .order().by('createdAt', desc)
          .limit({limit})
          .valueMap('postId', 'content', 'createdAt', 'tags')
        """
        friends_liked = self._query(friends_liked_query)
        
        # 3. 混合推荐内容
        recommended = self.hybrid_recommend(user_id, limit=limit)
        
        return {
            'friends_posts': friends_posts,
            'friends_liked': friends_liked,
            'recommended': recommended
        }


# 使用示例
recommender = ContentRecommender(
    neptune_endpoint="your-neptune-cluster.xxxxx.neptune.amazonaws.com"
)

# 为用户 u1001 获取个性化 Feed
feed = recommender.get_personalized_feed('u1001')
print(f"好友发布: {len(feed['friends_posts'])} 条")
print(f"好友点赞: {len(feed['friends_liked'])} 条")
print(f"推荐内容: {len(feed['recommended'])} 条")
```

### 8.4.4 使用场景

- **短视频推荐**：抖音、快手的 Feed 流推荐
- **电商推荐**：淘宝"猜你喜欢"、Amazon 商品推荐
- **新闻推荐**：今日头条、Google News 的个性化推送
- **音乐推荐**：Spotify 的 Discover Weekly、网易云音乐日推

### 8.4.5 潜在风险与注意事项

- **冷启动**：新用户没有交互历史，协同过滤失效。应使用基于内容或热门推荐兜底。
- **过滤气泡**：过度个性化推荐会导致用户被困在"信息茧房"中。应定期插入多样性内容（探索 vs. 利用的平衡）。
- **实时性**：用户刚点赞的内容应立即影响推荐结果。建议使用 Lambda 架构——实时流处理（Kinesis + Lambda）更新用户状态，离线批处理（Spark）计算完整推荐。
- **Neptune 查询优化**：混合推荐涉及多次图遍历，建议使用 `project()` 和 `union()` 合并为单次查询，减少网络往返。
- **A/B 测试**：推荐算法的效果必须通过 A/B 测试验证。建议在推荐结果中注入实验标记，跟踪用户点击率、停留时长、转化率等指标。

### 8.4.6 本章小结

内容推荐引擎的核心是**多信号融合**。协同过滤利用"群体的智慧"，基于内容的过滤利用"属性的匹配"，热度排序利用"时间的价值"。图数据库的独特优势在于：一次 Gremlin 遍历可以同时获取社交信号、内容信号和交互信号，天然支持混合推荐。生产环境中应使用离线+在线结合的架构，并始终通过 A/B 测试验证推荐效果。

---

## 8.5 完整社交网络实现

### 8.5.1 解决的问题

前面各节分别讨论了建模、推荐、影响力分析等技术点。本节将它们整合为一个完整的社交网络系统，涵盖数据模型设计、批量数据加载、推荐查询流水线和性能优化策略。

### 8.5.2 核心原理

一个生产级社交网络系统需要三个层次：

1. **数据层**：Neptune 图数据库存储社交关系，DynamoDB/ElastiCache 缓存推荐结果
2. **计算层**：离线批处理（Spark + Neptune Analytics）计算推荐和影响力分数，实时流处理（Lambda + Kinesis）处理用户行为事件
3. **服务层**：API Gateway + Lambda 提供 RESTful 推荐接口

### 8.5.3 代码/配置实现

**完整数据模型（Gremlin）：**

```groovy
// ========== 完整社交网络 Schema ==========

// 用户顶点
g.addV('User')
  .property('userId', 'u1001')
  .property('name', '张三')
  .property('age', 28)
  .property('city', '北京')
  .property('interests', ['AI', '图数据库', '推荐系统'])
  .property('influenceScore', 0.0)  // PageRank 结果缓存
  .property('createdAt', '2024-01-15T08:00:00Z')

// 内容顶点
g.addV('Post')
  .property('postId', 'p2001')
  .property('content', '图数据库在推荐系统中的应用实践')
  .property('tags', ['图数据库', '推荐系统'])
  .property('likeCount', 0)  // 冗余计数，避免实时 count()
  .property('shareCount', 0)
  .property('createdAt', '2024-03-01T09:00:00Z')

// 群组顶点
g.addV('Group')
  .property('groupId', 'g3001')
  .property('name', '图数据库爱好者')
  .property('category', '技术')
  .property('memberCount', 1560)

// 话题顶点
g.addV('Topic')
  .property('topicId', 't4001')
  .property('name', '图数据库')

// 关系边
g.V().has('User', 'userId', 'u1001').as('a')
  .V().has('User', 'userId', 'u1002').as('b')
  .addE('FOLLOWS').from('a').to('b')
  .property('weight', 1.0)
  .property('createdAt', '2024-03-10T12:00:00Z')

g.V().has('User', 'userId', 'u1001').as('a')
  .V().has('Post', 'postId', 'p2001').as('b')
  .addE('LIKE').from('a').to('b')
  .property('weight', 1.0)
  .property('createdAt', '2024-03-11T08:00:00Z')
```

**批量数据加载（使用 Neptune Bulk Loader）：**

```python
import boto3
import json
import s3fs
from typing import List, Dict

class NeptuneBulkLoader:
    """Neptune 批量数据加载器"""
    
    def __init__(self, neptune_endpoint: str, iam_role_arn: str, s3_bucket: str):
        self.neptune = boto3.client('neptune')
        self.s3 = boto3.client('s3')
        self.endpoint = neptune_endpoint
        self.iam_role_arn = iam_role_arn
        self.bucket = s3_bucket
    
    def prepare_vertex_csv(self, vertices: List[Dict], label: str, s3_key: str):
        """准备顶点 CSV 文件并上传到 S3"""
        # CSV 格式: ~id, label, property1:type, property2:type, ...
        lines = [f"~id,~label,userId:String,name:String,age:Int,city:String,interests:String,createdAt:Date"]
        for v in vertices:
            interests = ';'.join(v.get('interests', []))
            lines.append(
                f"{v['userId']},User,{v['userId']},{v['name']},{v.get('age','')},"
                f"{v.get('city','')},{interests},{v.get('createdAt','')}"
            )
        
        content = '\n'.join(lines)
        self.s3.put_object(Bucket=self.bucket, Key=s3_key, Body=content)
        return f"s3://{self.bucket}/{s3_key}"
    
    def prepare_edge_csv(self, edges: List[Dict], label: str, s3_key: str):
        """准备边 CSV 文件并上传到 S3"""
        # CSV 格式: ~id, ~from, ~to, ~label, property1:type, ...
        lines = [f"~id,~from,~to,~label,weight:Double,createdAt:Date"]
        for i, e in enumerate(edges):
            lines.append(
                f"e{i},{e['from']},{e['to']},{e['label']},{e.get('weight',1.0)},{e.get('createdAt','')}"
            )
        
        content = '\n'.join(lines)
        self.s3.put_object(Bucket=self.bucket, Key=s3_key, Body=content)
        return f"s3://{self.bucket}/{s3_key}"
    
    def start_bulk_load(self, s3_uri: str, format: str = 'csv') -> str:
        """启动 Neptune 批量加载任务"""
        response = self.neptune.start_loader_job(
            source=s3_uri,
            format=format,
            s3BucketRegion='us-east-1',
            iamRoleArn=self.iam_role_arn,
            mode='RESUME',  # 或 'OVERWRITE' / 'NEW'
            failOnError=False,
            parallelism='HIGH'
        )
        return response['jobId']
    
    def load_social_graph(self, users: List[Dict], posts: List[Dict], 
                          follows: List[Dict], likes: List[Dict]):
        """完整加载社交网络数据"""
        # 上传顶点数据
        user_s3 = self.prepare_vertex_csv(users, 'User', 'data/users.csv')
        post_s3 = self.prepare_vertex_csv(posts, 'Post', 'data/posts.csv')
        
        # 上传边数据
        follow_s3 = self.prepare_edge_csv(follows, 'FOLLOWS', 'data/follows.csv')
        like_s3 = self.prepare_edge_csv(likes, 'LIKE', 'data/likes.csv')
        
        # 启动批量加载
        job_id = self.start_bulk_load(user_s3)
        print(f"批量加载任务 ID: {job_id}")
        return job_id


# 使用示例
loader = NeptuneBulkLoader(
    neptune_endpoint="your-neptune-cluster.xxxxx.neptune.amazonaws.com",
    iam_role_arn="arn:aws:iam::123456789:role/NeptuneLoadRole",
    s3_bucket="my-social-graph-data"
)

# 准备数据
users = [
    {'userId': 'u1001', 'name': '张三', 'age': 28, 'city': '北京', 
     'interests': ['AI', '图数据库'], 'createdAt': '2024-01-15T08:00:00Z'},
    {'userId': 'u1002', 'name': '李四', 'age': 32, 'city': '上海', 
     'interests': ['云计算', '大数据'], 'createdAt': '2024-02-20T10:30:00Z'},
]

follows = [
    {'from': 'u1001', 'to': 'u1002', 'label': 'FOLLOWS', 'weight': 1.0, 
     'createdAt': '2024-03-10T12:00:00Z'},
]

loader.load_social_graph(users, [], follows, [])
```

**推荐查询流水线（Lambda 函数）：**

```python
import json
import os
import boto3
from gremlin_python.driver import client, serializer

neptune_endpoint = os.environ['NEPTUNE_ENDPOINT']
neptune_port = int(os.environ.get('NEPTUNE_PORT', '8182'))

def lambda_handler(event, context):
    """API Gateway Lambda 处理函数"""
    user_id = event['pathParameters']['userId']
    action = event['pathParameters']['action']  # 'friends', 'feed', 'influencers'
    
    conn = client.Client(
        f'wss://{neptune_endpoint}:{neptune_port}/gremlin',
        'g',
        message_serializer=serializer.GraphSONSerializersV3d0()
    )
    
    try:
        if action == 'friends':
            result = _recommend_friends(conn, user_id)
        elif action == 'feed':
            result = _get_feed(conn, user_id)
        elif action == 'influencers':
            result = _get_influencers(conn)
        else:
            return {'statusCode': 400, 'body': json.dumps({'error': 'Unknown action'})}
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(result)
        }
    finally:
        conn.close()

def _recommend_friends(conn, user_id: str) -> dict:
    """好友推荐"""
    query = f"""
    g.V().has('User', 'userId', '{user_id}').as('me')
      .out('FOLLOWS').aggregate('my_friends')
      .out('FOLLOWS')
      .where(neq('me'))
      .where(without('my_friends'))
      .groupCount()
      .order(local).by(values, desc)
      .limit(20)
    """
    results = conn.submit(query).all().result()
    recommendations = []
    for r in results:
        for uid, count in r.items():
            recommendations.append({'userId': uid, 'commonFriends': count})
    return {'userId': user_id, 'recommendations': recommendations}

def _get_feed(conn, user_id: str) -> dict:
    """获取 Feed 流"""
    query = f"""
    g.V().has('User', 'userId', '{user_id}')
      .out('FOLLOWS')
      .out('POST')
      .order().by('createdAt', desc)
      .limit(50)
      .project('postId', 'content', 'author', 'createdAt')
        .by('postId')
        .by('content')
        .by(__.in('POST').values('name').fold())
        .by('createdAt')
    """
    results = conn.submit(query).all().result()
    return {'userId': user_id, 'feed': results}

def _get_influencers(conn) -> dict:
    """获取影响力排行榜"""
    query = """
    g.V().hasLabel('User')
      .pageRank()
        .by('influenceScore')
        .edges(__.outE('FOLLOWS'))
      .order().by('influenceScore', desc)
      .limit(20)
      .project('userId', 'name', 'influenceScore')
        .by('userId')
        .by('name')
        .by('influenceScore')
    """
    results = conn.submit(query).all().result()
    return {'influencers': results}
```

**性能优化策略：**

```python
class NeptuneQueryOptimizer:
    """Neptune 查询优化器"""
    
    @staticmethod
    def use_indexed_lookup(vertex_label: str, property_name: str, property_value: str) -> str:
        """使用索引查找而非全表扫描"""
        # 推荐方式（使用 Neptune 的 SPARQL/Gremlin 索引）
        return f"g.V().has('{vertex_label}', '{property_name}', '{property_value}')"
        
        # 不推荐方式（全表扫描）
        # return f"g.V().hasLabel('{vertex_label}').has('{property_name}', '{property_value}')"
    
    @staticmethod
    def batch_vertices(vertex_ids: list) -> str:
        """批量获取顶点"""
        ids = ', '.join([f"'{vid}'" for vid in vertex_ids])
        return f"g.V({ids}).valueMap()"
    
    @staticmethod
    def use_projection_instead_of_multiple_queries() -> str:
        """使用 project() 合并多次查询"""
        return """
        g.V().has('User', 'userId', 'u1001')
          .project('profile', 'friends', 'feed')
            .by(__.valueMap('name', 'age', 'city'))
            .by(__.out('FOLLOWS').count())
            .by(__.out('FOLLOWS').out('POST').count())
        """
    
    @staticmethod
    def paginate_results(page: int, page_size: int) -> str:
        """分页查询"""
        skip = (page - 1) * page_size
        return f"""
        g.V().hasLabel('User')
          .order().by('createdAt', desc)
          .skip({skip})
          .limit({page_size})
          .valueMap('userId', 'name')
        """
    
    @staticmethod
    def use_local_traversal_for_hot_paths() -> str:
        """热点路径使用 local() 限制中间结果集大小"""
        return """
        g.V().has('User', 'userId', 'u1001')
          .local(
            __.out('FOLLOWS')
              .limit(100)  // 限制每个用户的关注数
              .out('LIKE')
              .limit(200)  // 限制候选内容数
          )
          .dedup()
          .limit(50)
        """
    
    @staticmethod
    def cache_frequent_queries():
        """缓存频繁查询的结果"""
        # 使用 ElastiCache (Redis) 缓存推荐结果
        # TTL 设置：好友推荐 1 小时，Feed 流 5 分钟，影响力排行 1 天
        cache_config = {
            'friend_recommendation': {'ttl': 3600, 'key_prefix': 'rec:friends:'},
            'feed': {'ttl': 300, 'key_prefix': 'feed:'},
            'influencer_ranking': {'ttl': 86400, 'key_prefix': 'rank:influencers'},
        }
        return cache_config


# 查询性能监控
class QueryMonitor:
    """查询性能监控"""
    
    def __init__(self, neptune_client):
        self.client = neptune_client
        self.stats = {
            'total_queries': 0,
            'slow_queries': 0,
            'total_duration_ms': 0,
        }
    
    def execute_with_monitoring(self, query: str) -> list:
        """执行查询并监控性能"""
        import time
        start = time.time()
        result = self.client.submit(query).all().result()
        duration_ms = (time.time() - start) * 1000
        
        self.stats['total_queries'] += 1
        self.stats['total_duration_ms'] += duration_ms
        
        if duration_ms > 1000:  # 慢查询阈值 1 秒
            self.stats['slow_queries'] += 1
            logger.warning(f"慢查询 ({duration_ms:.0f}ms): {query[:200]}...")
        
        return result
```

### 8.5.4 使用场景

- **社交平台 MVP**：快速搭建具备好友推荐和 Feed 流功能的社交应用
- **企业知识社区**：内部员工社交网络，推荐专家和知识内容
- **电商社交化**：在电商平台中增加社交关系链和好友推荐功能
- **游戏社交**：游戏内的好友推荐、公会推荐、内容推荐

### 8.5.5 潜在风险与注意事项

- **Neptune 实例规格选择**：社交网络的查询模式以遍历为主，建议选择内存优化型实例（如 `db.r5` 系列）。写入密集型场景考虑 `db.t3` 系列。
- **批量加载的幂等性**：使用 `RESUME` 模式时，重复加载相同数据不会产生重复边。但 `OVERWRITE` 模式会删除已有数据再写入，需谨慎使用。
- **查询超时配置**：Neptune 默认查询超时为 120 秒。复杂推荐查询应设置合理的超时时间，避免阻塞实例资源。
- **成本控制**：Neptune 按实例小时计费，开发环境建议使用无服务器（Serverless）实例，按需付费。
- **数据备份**：启用 Neptune 的自动快照功能，设置每日备份。大规模社交网络的数据恢复时间可能较长，建议同时维护 DynamoDB 缓存作为降级方案。

### 8.5.6 本章小结

一个完整的社交网络系统需要**数据模型、批量加载、查询流水线、性能优化**四个环节的协同。Neptune 的 Bulk Loader 支持 TB 级数据的快速加载，Gremlin 遍历引擎支持复杂的多跳推荐查询，Lambda + API Gateway 提供无服务器的在线服务层。生产环境中应始终关注查询性能，使用缓存、分页、投影等技术优化用户体验。

---

## 8.6 Gremlin 社交网络查询大全

### 8.6.1 解决的问题

本节汇总社交网络分析中最常用的 Gremlin 查询模式，作为日常开发的速查手册。每个查询附带说明和性能提示。

### 8.6.2 核心原理

Gremlin 查询的核心模式是**遍历（Traversal）**——从起点出发，沿边移动，在移动过程中进行过滤、聚合、分支。社交网络查询可以归纳为几种基本模式：邻居查询、路径查询、聚合查询、子图查询。

### 8.6.3 代码/配置实现

**好友推荐类：**

```groovy
// Q1: 二跳好友推荐（基础版）
g.V().has('User', 'userId', 'u1001').as('me')
  .out('FOLLOWS').aggregate('my_friends')
  .out('FOLLOWS')
  .where(neq('me'))
  .where(without('my_friends'))
  .groupCount()
  .order(local).by(values, desc)
  .limit(10)

// Q2: 二跳好友推荐（带共同好友详情）
g.V().has('User', 'userId', 'u1001').as('me')
  .out('FOLLOWS').aggregate('my_friends')
  .out('FOLLOWS')
  .where(neq('me'))
  .where(without('my_friends'))
  .dedup()
  .limit(10)
  .project('candidate', 'commonFriends')
    .by('userId')
    .by(__.in('FOLLOWS')
      .where(
        __.out('FOLLOWS').has('userId', 'u1001')
      )
      .values('name')
      .fold())

// Q3: 基于群组的好友推荐（同群组但非好友）
g.V().has('User', 'userId', 'u1001').as('me')
  .out('MEMBER_OF').as('my_groups')
  .in('MEMBER_OF').where(neq('me'))
  .not(__.both('FOLLOWS', 'FRIEND').where(eq('me')))
  .dedup()
  .limit(10)
  .project('candidate', 'commonGroups')
    .by('userId')
    .by(__.out('MEMBER_OF')
      .where(within('my_groups'))
      .values('name')
      .fold())

// Q4: 基于共同点赞的推荐
g.V().has('User', 'userId', 'u1001').as('me')
  .out('LIKE').aggregate('my_likes')
  .in('LIKE').where(neq('me'))
  .not(__.both('FOLLOWS', 'FRIEND').where(eq('me')))
  .dedup()
  .limit(10)
  .project('candidate', 'commonLikes')
    .by('userId')
    .by(__.out('LIKE')
      .where(within('my_likes'))
      .count())
```

**影响力排名类：**

```groovy
// Q5: 粉丝数排名（简单影响力）
g.V().hasLabel('User')
  .project('userId', 'name', 'followerCount')
    .by('userId')
    .by('name')
    .by(__.in('FOLLOWS').count())
  .order().by('followerCount', desc)
  .limit(20)

// Q6: PageRank 影响力排名
g.V().hasLabel('User')
  .pageRank()
    .by('influenceScore')
    .edges(__.outE('FOLLOWS'))
  .order().by('influenceScore', desc)
  .limit(20)
  .valueMap('userId', 'name', 'influenceScore')

// Q7: 互动率排名（点赞数 / 粉丝数）
g.V().hasLabel('User')
  .project('userId', 'name', 'engagementRate')
    .by('userId')
    .by('name')
    .by(__.union(
      __.out('POST').in('LIKE').count(),
      __.in('FOLLOWS').count()
    ).fold()
      .map{
        def likes = it.get()[0]
        def followers = it.get()[1]
        followers > 0 ? (double) likes / followers : 0.0
      })
  .order().by('engagementRate', desc)
  .limit(20)
```

**社区检测类：**

```groovy
// Q8: 连通分量检测
g.V().hasLabel('User')
  .connectedComponents()
    .by('componentId')
    .edges(__.outE('FOLLOWS'))
  .group()
    .by('componentId')
    .by(__.fold().project('size', 'members')
      .by(__.unfold().count())
      .by(__.unfold().values('userId').fold()))
  .order(local).by('size', desc)

// Q9: 三角计数（衡量社区紧密程度）
g.V().hasLabel('User')
  .out('FOLLOWS').as('friend')
  .out('FOLLOWS').as('fof')
  .where('fof', eq('friend'))
  .by('userId')
  .select('friend')
  .dedup()
  .groupCount()
  .order(local).by(values, desc)
  .limit(20)

// Q10: 社区内推荐（推荐同社区但未关注的人）
g.V().has('User', 'userId', 'u1001').as('me')
  .out('MEMBER_OF').as('my_group')
  .in('MEMBER_OF').where(neq('me'))
  .not(__.out('FOLLOWS').where(eq('me')))
  .dedup()
  .limit(10)
```

**最短路径类：**

```groovy
// Q11: 最短路径（无权）
g.V().has('User', 'userId', 'u1001')
  .repeat(__.out('FOLLOWS').simplePath())
  .until(has('User', 'userId', 'u1050'))
  .path()
  .limit(5)

// Q12: 最短路径（带权，边权重代表亲密度，越高越好）
g.V().has('User', 'userId', 'u1001')
  .repeat(
    __.outE('FOLLOWS')
      .order().by('weight', desc)
      .inV()
      .simplePath()
  )
  .until(has('User', 'userId', 'u1050'))
  .path()
  .limit(3)

// Q13: 所有路径（限制深度）
g.V().has('User', 'userId', 'u1001')
  .repeat(__.out('FOLLOWS').simplePath())
  .until(
    has('User', 'userId', 'u1050')
    .or().loops().is(gt(5))
  )
  .has('User', 'userId', 'u1050')
  .path()
  .limit(10)

// Q14: 最短路径（按路径长度排序）
g.V().has('User', 'userId', 'u1001')
  .repeat(__.out('FOLLOWS').simplePath())
  .until(has('User', 'userId', 'u1050'))
  .path()
  .groupCount()
    .by(__.count(local))
  .order(local).by(values, asc)
  .limit(5)
```

**内容推荐类：**

```groovy
// Q15: 好友发布的内容（Feed 流）
g.V().has('User', 'userId', 'u1001')
  .out('FOLLOWS')
  .out('POST')
  .order().by('createdAt', desc)
  .limit(50)
  .project('postId', 'content', 'author', 'likes', 'createdAt')
    .by('postId')
    .by('content')
    .by(__.in('POST').values('name'))
    .by(__.in('LIKE').count())
    .by('createdAt')

// Q16: 好友点赞的内容
g.V().has('User', 'userId', 'u1001')
  .out('FOLLOWS')
  .out('LIKE')
  .order().by('createdAt', desc)
  .limit(50)
  .project('postId', 'content', 'likedBy')
    .by('postId')
    .by('content')
    .by(__.in('LIKE').values('name').fold())

// Q17: 热门内容（按点赞数）
g.V().hasLabel('Post')
  .project('postId', 'content', 'likeCount')
    .by('postId')
    .by('content')
    .by(__.in('LIKE').count())
  .order().by('likeCount', desc)
  .limit(20)

// Q18: 个性化推荐（融合社交 + 兴趣）
g.V().has('User', 'userId', 'u1001').as('me')
  .union(
    // 好友点赞的内容
    __.out('FOLLOWS').out('LIKE'),
    // 兴趣标签匹配的内容
    __.V().hasLabel('Post')
      .where(__.has('tags', within(
        __.select('me').property('interests').value()
      )))
  )
  .dedup()
  .limit(30)
```

**图统计与分析类：**

```groovy
// Q19: 图基本统计
g.V().hasLabel('User').count().as('users')
  .V().hasLabel('Post').count().as('posts')
  .E().hasLabel('FOLLOWS').count().as('follows')
  .E().hasLabel('LIKE').count().as('likes')
  .select('users', 'posts', 'follows', 'likes')

// Q20: 度分布统计
g.V().hasLabel('User')
  .group()
    .by(__.in('FOLLOWS').count())
    .by(count())
  .order(local).by(values, desc)

// Q21: 每个用户的聚类系数
g.V().hasLabel('User').as('u')
  .project('userId', 'clusteringCoefficient')
    .by('userId')
    .by(__.out('FOLLOWS').fold()
      .map{
        def neighbors = it.get()
        int n = neighbors.size()
        if (n < 2) return 0.0
        int triangles = 0
        for (int i = 0; i < n; i++) {
          for (int j = i + 1; j < n; j++) {
            if (g.V(neighbors[i]).out('FOLLOWS').hasId(neighbors[j]).hasNext()) {
              triangles++
            }
          }
        }
        return (2.0 * triangles) / (n * (n - 1))
      })
  .order().by('clusteringCoefficient', desc)
  .limit(20)
```

**Python 封装工具类：**

```python
from gremlin_python.driver import client, serializer
from typing import List, Optional

class SocialGraphQueries:
    """社交网络 Gremlin 查询工具类"""
    
    def __init__(self, neptune_endpoint: str, neptune_port: int = 8182):
        self.endpoint = neptune_endpoint
        self.port = neptune_port
    
    def _run(self, query: str) -> list:
        conn = client.Client(
            f'wss://{self.endpoint}:{self.port}/gremlin',
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        try:
            return conn.submit(query).all().result()
        finally:
            conn.close()
    
    def recommend_friends(self, user_id: str, limit: int = 10) -> list:
        """好友推荐"""
        q = f"""
        g.V().has('User', 'userId', '{user_id}').as('me')
          .out('FOLLOWS').aggregate('my_friends')
          .out('FOLLOWS')
          .where(neq('me')).where(without('my_friends'))
          .groupCount().order(local).by(values, desc).limit({limit})
        """
        return self._run(q)
    
    def shortest_path(self, from_user: str, to_user: str, max_depth: int = 6) -> list:
        """最短路径"""
        q = f"""
        g.V().has('User', 'userId', '{from_user}')
          .repeat(__.out('FOLLOWS').simplePath())
          .until(has('User', 'userId', '{to_user}').or().loops().is(gt({max_depth})))
          .has('User', 'userId', '{to_user}')
          .path().limit(5)
        """
        return self._run(q)
    
    def get_feed(self, user_id: str, limit: int = 50) -> list:
        """获取 Feed"""
        q = f"""
        g.V().has('User', 'userId', '{user_id}')
          .out('FOLLOWS').out('POST')
          .order().by('createdAt', desc).limit({limit})
          .valueMap('postId', 'content', 'createdAt')
        """
        return self._run(q)
    
    def top_influencers(self, limit: int = 20) -> list:
        """影响力排行"""
        q = f"""
        g.V().hasLabel('User')
          .pageRank().by('influenceScore').edges(__.outE('FOLLOWS'))
          .order().by('influenceScore', desc).limit({limit})
          .valueMap('userId', 'name', 'influenceScore')
        """
        return self._run(q)
    
    def detect_communities(self) -> list:
        """社区检测"""
        q = """
        g.V().hasLabel('User')
          .connectedComponents().by('componentId').edges(__.outE('FOLLOWS'))
          .group().by('componentId')
            .by(__.fold().project('size', 'members')
              .by(__.unfold().count())
              .by(__.unfold().values('userId').fold()))
          .order(local).by('size', desc)
        """
        return self._run(q)
    
    def graph_statistics(self) -> dict:
        """图统计"""
        q = """
        g.V().hasLabel('User').count().as('users')
          .V().hasLabel('Post').count().as('posts')
          .E().hasLabel('FOLLOWS').count().as('follows')
          .E().hasLabel('LIKE').count().as('likes')
          .select('users', 'posts', 'follows', 'likes')
        """
        return self._run(q)[0]
```

### 8.6.4 使用场景

- **日常开发**：作为 Gremlin 查询速查手册
- **性能调优**：参考查询模式优化慢查询
- **新人培训**：通过示例快速上手社交网络图查询
- **架构设计**：参考查询模式设计数据模型

### 8.6.5 潜在风险与注意事项

- **`groupCount()` 的内存风险**：在百万级候选集上使用 `groupCount()` 可能导致 Neptune 内存溢出。务必先使用 `limit()` 限制候选集大小。
- **`simplePath()` 的性能开销**：`simplePath()` 需要维护路径历史，在深度遍历中开销较大。如果不需要去环，可以省略。
- **`repeat().times()` 的深度限制**：建议设置合理的最大深度（通常 3-5），避免无限循环。
- **`project()` 与 `valueMap()` 的选择**：`project()` 更灵活但开销更大，`valueMap()` 更高效。按需选择。
- **Neptune 的查询计划**：使用 `gremlin.explain()` 查看查询计划，识别全表扫描和索引缺失。

### 8.6.6 本章小结

Gremlin 提供了丰富的遍历模式来支持社交网络分析。核心模式包括：**邻居遍历**（`out()/in()/both()`）、**路径遍历**（`repeat().until()`）、**聚合分析**（`groupCount()/project()`）、**图算法**（`pageRank()/connectedComponents()`）。掌握这些模式可以覆盖 90% 以上的社交网络查询需求。实际使用中应关注查询的内存开销和超时配置，对复杂查询使用 `explain()` 做性能分析。

---

## 附录：推荐系统评估指标

| 指标 | 公式 | 说明 |
|------|------|------|
| 精确率 (Precision) | $P = \frac{TP}{TP+FP}$ | 推荐结果中用户真正感兴趣的比例 |
| 召回率 (Recall) | $R = \frac{TP}{TP+FN}$ | 用户感兴趣的内容被推荐出来的比例 |
| F1 分数 | $F1 = 2 \cdot \frac{P \cdot R}{P + R}$ | 精确率和召回率的调和平均 |
| NDCG | $NDCG = \frac{DCG}{IDCG}$ | 考虑排序位置的推荐质量 |
| 点击率 (CTR) | $CTR = \frac{Clicks}{Impressions}$ | 推荐内容的点击比例 |
| 平均精度 (MAP) | $MAP = \frac{1}{N} \sum AP_i$ | 多次推荐的精度均值 |

评估推荐系统时，离线指标（Precision/Recall）只能反映模型的理论效果，最终应以在线 A/B 测试的业务指标（CTR、留存率、转化率）为准。

---

*本章完整代码示例可在 GitHub 仓库 `aws-samples/neptune-social-network` 中找到。*
