# 第9章 社交网络与推荐系统：Neo4j 实战

社交网络已成为互联网的核心形态。从 Facebook 的"你可能认识的人"到 LinkedIn 的职业人脉推荐，从 Twitter 的关注推荐到抖音的短视频分发，推荐系统无处不在。传统关系型数据库在处理"朋友的朋友"这类深度关系查询时，往往需要多次 JOIN 操作，性能随深度指数级下降。而图数据库 Neo4j 以其对关系的原生支持，成为构建社交网络和推荐系统的理想选择。

本章将从零开始，使用 Neo4j 构建一个完整的社交网络系统，涵盖关系建模、好友推荐算法、影响力传播分析和内容推荐引擎。

## 9.1 社交网络的关系建模

### 9.1.1 为什么图模型天然适合社交网络

社交网络的核心要素是"人"和"关系"。在关系型数据库中，好友关系通常用中间表存储：

```
users(id, name, age, city)
friendships(user_id, friend_id, created_at)
```

查询"朋友的朋友"需要两次 JOIN：

```sql
SELECT DISTINCT u.* FROM users u
JOIN friendships f1 ON u.id = f1.friend_id
JOIN friendships f2 ON f1.user_id = f2.friend_id
WHERE f2.friend_id = ? AND u.id != ?;
```

当需要查询"朋友的朋友的朋友"时，JOIN 次数线性增长，SQL 复杂度急剧上升。而在图数据库中，这种查询只需一次遍历：

```cypher
MATCH (me:User {id: 'Alice'})-[:FRIENDS_WITH*2]->(fof:User)
WHERE fof <> me
RETURN DISTINCT fof;
```

`*2` 表示沿关系遍历两步，无论深度如何，语法保持不变。这是图模型在社交场景中的核心优势。

### 9.1.2 节点与关系的标签设计

社交网络的图模型围绕以下核心类型设计：

**节点标签：**
- `User`：平台用户，包含个人属性
- `Post`：用户发布的帖子
- `Comment`：对帖子的评论
- `Group`：用户群组
- `Tag`：兴趣标签 / 话题标签
- `Location`：地理位置

**关系类型：**
- `[:FRIENDS_WITH]`：双向好友关系
- `[:FOLLOWS]`：单向关注关系
- `[:POSTED]`：用户 → 帖子
- `[:COMMENTED_ON]`：评论 → 帖子
- `[:LIKES]`：用户 → 帖子/评论
- `[:MEMBER_OF]`：用户 → 群组
- `[:TAGGED_AS]`：帖子 → 标签
- `[:LOCATED_IN]`：用户 → 地点

### 9.1.3 完整的数据模型定义

以下 Cypher 脚本创建完整的社交网络约束和索引：

```cypher
// 创建唯一性约束
CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT post_id_unique IF NOT EXISTS
FOR (p:Post) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT tag_name_unique IF NOT EXISTS
FOR (t:Tag) REQUIRE t.name IS UNIQUE;

CREATE CONSTRAINT group_id_unique IF NOT EXISTS
FOR (g:Group) REQUIRE g.id IS UNIQUE;

CREATE CONSTRAINT location_id_unique IF NOT EXISTS
FOR (l:Location) REQUIRE l.id IS UNIQUE;

// 创建索引以加速查询
CREATE INDEX user_city_index IF NOT EXISTS
FOR (u:User) ON (u.city);

CREATE INDEX user_age_index IF NOT EXISTS
FOR (u:User) ON (u.age);

CREATE INDEX post_created_index IF NOT EXISTS
FOR (p:Post) ON (p.created_at);

CREATE INDEX tag_category_index IF NOT EXISTS
FOR (t:Tag) ON (t.category);
```

### 9.1.4 关系方向与基数设计

社交网络中的关系需要仔细考虑方向和基数：

**双向关系（`[:FRIENDS_WITH]`）：** 好友关系在现实世界中是对称的——A 是 B 的好友，B 也是 A 的好友。在 Neo4j 中，我们通常创建一条无向关系（查询时省略箭头方向），或者创建两条有向关系。推荐使用一条无向关系，节省存储空间且查询更简洁。

**单向关系（`[:FOLLOWS]`）：** 关注关系是非对称的——A 关注 B 不代表 B 关注 A。Twitter/微博模式使用这种关系。查询时需注意方向：

```cypher
// A 关注了哪些人
MATCH (a:User {id: 'user_1'})-[:FOLLOWS]->(followed:User)
RETURN followed;

// 谁关注了 A
MATCH (a:User {id: 'user_1'})<-[:FOLLOWS]-(follower:User)
RETURN follower;
```

**基数约束：** 社交关系通常允许多对多（N:M），但某些场景需要约束。例如，`[:POSTED]` 关系是每个帖子恰好属于一个用户（N:1），而 `[:LIKES]` 是用户和帖子之间的多对多（N:M）。

### 9.1.5 导入示例数据

我们生成一个包含 100 个用户、500 条好友关系、200 篇帖子和多种交互的社交网络数据集：

```cypher
// 创建用户
UNWIND range(1, 100) AS i
CREATE (u:User {
  id: 'user_' + toString(i),
  name: '用户' + toString(i),
  age: 18 + toInteger(rand() * 42),
  city: ['北京', '上海', '深圳', '杭州', '成都', '广州', '南京', '武汉'][toInteger(rand() * 8)],
  occupation: ['工程师', '设计师', '产品经理', '教师', '医生', '学生', '自由职业', '运营'][toInteger(rand() * 8)],
  interests: ['编程', '摄影', '旅行', '美食', '运动', '音乐', '阅读', '电影'][toInteger(rand() * 8)],
  registered_at: datetime('2024-01-01') + duration({hours: toInteger(rand() * 8760)})
});

// 创建好友关系（随机生成约 500 条）
MATCH (u1:User), (u2:User)
WHERE u1 <> u2 AND rand() < 0.1
WITH u1, u2, rand() AS r
WHERE r < 0.5 AND NOT exists {
  MATCH (u1)-[:FRIENDS_WITH]-(u2)
}
CREATE (u1)-[:FRIENDS_WITH {
  created_at: datetime('2024-01-01') + duration({hours: toInteger(rand() * 8760)}),
  strength: round(rand() * 10) / 10.0
}]->(u2);

// 创建兴趣标签
FOREACH (tag IN ['编程/Java', '编程/Python', '编程/Go', '摄影/人像', '摄影/风光',
  '旅行/国内', '旅行/海外', '美食/中餐', '美食/西餐', '运动/跑步',
  '运动/篮球', '音乐/流行', '音乐/古典', '阅读/科幻', '阅读/历史',
  '电影/科幻', '电影/剧情', '电影/喜剧'] |
  MERGE (t:Tag {name: tag, category: split(tag, '/')[0]})
);

// 创建群组
UNWIND ['技术交流', '摄影爱好者', '旅行达人', '美食探店', '运动健身',
  '音乐天堂', '读书会', '电影俱乐部'] AS groupName
CREATE (g:Group {
  id: 'group_' + groupName,
  name: groupName,
  description: groupName + '群组，欢迎加入交流',
  created_at: datetime('2024-02-01') + duration({hours: toInteger(rand() * 4320)})
});

// 用户加入群组
MATCH (u:User), (g:Group)
WHERE rand() < 0.3
CREATE (u)-[:MEMBER_OF {joined_at: datetime('2024-03-01') + duration({hours: toInteger(rand() * 2880)})}]->(g);

// 用户发布帖子
MATCH (u:User)
WITH u, rand() AS r
WHERE r < 0.4
CREATE (p:Post {
  id: 'post_' + u.id + '_' + toString(toInteger(rand() * 1000)),
  title: ['分享一个有趣的项目', '今天的收获', '推荐一本好书', '周末去哪玩',
    '新学到的技巧', '大家怎么看', '记录一下', '求助帖'][toInteger(rand() * 8)],
  content: '这是' + u.name + '发布的一篇内容，欢迎大家讨论交流。',
  created_at: datetime('2024-04-01') + duration({hours: toInteger(rand() * 2160)}),
  likes_count: toInteger(rand() * 200)
})
CREATE (u)-[:POSTED]->(p);

// 为帖子打标签
MATCH (p:Post), (t:Tag)
WHERE rand() < 0.15
CREATE (p)-[:TAGGED_AS]->(t);

// 用户点赞帖子
MATCH (u:User), (p:Post)
WHERE rand() < 0.08 AND NOT exists {
  MATCH (u)-[:LIKES]->(p)
}
CREATE (u)-[:LIKES {created_at: p.created_at + duration({hours: toInteger(rand() * 48)})}]->(p);

// 用户评论帖子
MATCH (u:User), (p:Post)
WHERE rand() < 0.05
CREATE (c:Comment {
  id: 'comment_' + toString(toInteger(rand() * 100000)),
  content: ['说得好！', '同意', '有道理', '学到了', '感谢分享', '收藏了',
    '同问', '+1', '不太同意', '能详细说说吗'][toInteger(rand() * 10)],
  created_at: p.created_at + duration({hours: toInteger(rand() * 72)})
})
CREATE (u)-[:COMMENTED_ON]->(c)
CREATE (c)-[:COMMENTED_ON]->(p);
```

## 9.2 好友推荐算法

好友推荐是社交网络的核心功能。本节实现从简单到高级的多种推荐算法。

### 9.2.1 共同好友推荐（Common Neighbors）

共同好友数量是最直观的推荐依据——你和目标用户共同好友越多，你们越可能认识。

```cypher
// 为指定用户推荐共同好友最多的用户
MATCH (me:User {id: 'user_1'})-[:FRIENDS_WITH]-(myFriend:User)
MATCH (myFriend)-[:FRIENDS_WITH]-(candidate:User)
WHERE candidate <> me AND NOT exists {
  MATCH (me)-[:FRIENDS_WITH]-(candidate)
}
RETURN candidate.name AS 推荐用户,
       candidate.city AS 城市,
       candidate.occupation AS 职业,
       count(DISTINCT myFriend) AS 共同好友数,
       collect(DISTINCT myFriend.name) AS 共同好友列表
ORDER BY 共同好友数 DESC
LIMIT 10;
```

**结果示例：**

| 推荐用户 | 城市 | 职业 | 共同好友数 | 共同好友列表 |
|---------|------|------|-----------|------------|
| 用户42 | 北京 | 工程师 | 5 | [用户3, 用户7, 用户15, ...] |
| 用户18 | 上海 | 设计师 | 3 | [用户3, 用户22, ...] |
| 用户55 | 深圳 | 产品经理 | 3 | [用户7, 用户15, ...] |

### 9.2.2 好友的好友推荐（Friends-of-Friends, FoF）

FoF 算法扩展共同好友概念，引入路径权重和距离衰减：

```cypher
// 好友的好友推荐，考虑多重路径和距离衰减
MATCH path = (me:User {id: 'user_1'})-[:FRIENDS_WITH*2..3]-(candidate:User)
WHERE candidate <> me
  AND NOT exists {
    MATCH (me)-[:FRIENDS_WITH]-(candidate)
  }
  AND NOT exists {
    MATCH (me)-[:FOLLOWS]-(candidate)
  }
WITH candidate,
     length(path) AS distance,
     nodes(path) AS pathNodes
WITH candidate,
     distance,
     count(*) AS pathCount
RETURN candidate.name AS 推荐用户,
       candidate.city AS 城市,
       candidate.interests AS 兴趣,
       sum(CASE WHEN distance = 2 THEN pathCount * 1.0
                WHEN distance = 3 THEN pathCount * 0.5
                ELSE 0 END) AS 加权得分,
       collect(DISTINCT {
         distance: distance,
         paths: pathCount
       }) AS 路径分布
ORDER BY 加权得分 DESC
LIMIT 10;
```

这里对距离为 2 的路径赋予权重 1.0，距离为 3 的路径赋予权重 0.5，体现"关系越近，推荐优先级越高"的原则。

### 9.2.3 Jaccard 相似度推荐

Jaccard 系数衡量两个集合的相似度，定义为交集大小除以并集大小。在好友推荐中，集合即用户的好友列表：

```cypher
// 基于 Jaccard 相似度的好友推荐
MATCH (me:User {id: 'user_1'})
MATCH (candidate:User)
WHERE candidate <> me AND NOT exists {
  MATCH (me)-[:FRIENDS_WITH]-(candidate)
}

// 计算共同好友
OPTIONAL MATCH (me)-[:FRIENDS_WITH]-(common)-[:FRIENDS_WITH]-(candidate)
WITH me, candidate, collect(DISTINCT common) AS commonFriends

// 计算各自好友总数
OPTIONAL MATCH (me)-[:FRIENDS_WITH]-(myFriends)
WITH me, candidate, commonFriends, collect(DISTINCT myFriends) AS myAllFriends
OPTIONAL MATCH (candidate)-[:FRIENDS_WITH]-(theirFriends)
WITH me, candidate, commonFriends, myAllFriends, collect(DISTINCT theirFriends) AS theirAllFriends

WITH candidate,
     size(commonFriends) AS intersection,
     size(myAllFriends) + size(theirAllFriends) - size(commonFriends) AS union,
     commonFriends
WITH candidate,
     intersection,
     union,
     CASE WHEN union > 0 THEN toFloat(intersection) / union ELSE 0 END AS jaccardScore,
     [f IN commonFriends | f.name] AS commonNames
WHERE jaccardScore > 0
RETURN candidate.name AS 推荐用户,
       jaccardScore AS Jaccard相似度,
       intersection AS 共同好友数,
       commonNames AS 共同好友
ORDER BY jaccardScore DESC
LIMIT 10;
```

Jaccard 系数的优势在于它自动惩罚"社交达人"——一个好友很多的人，即使与你有几个共同好友，Jaccard 值也不会特别高，因为并集很大。

### 9.2.4 Adamic-Adar 算法

Adamic-Adar 是比 Jaccard 更精细的度量。它给"稀有"的共同好友更高权重——如果你和某人的共同好友是一个社交广泛的人，这个共同好友的"信号价值"较低；反之，如果共同好友是一个社交圈很小的人，这个共同好友强烈暗示你们属于同一社交圈。

```cypher
// Adamic-Adar 相似度推荐
MATCH (me:User {id: 'user_1'})-[:FRIENDS_WITH]-(common:User)
MATCH (common)-[:FRIENDS_WITH]-(candidate:User)
WHERE candidate <> me AND NOT exists {
  MATCH (me)-[:FRIENDS_WITH]-(candidate)
}
WITH candidate,
     common,
     size((common)-[:FRIENDS_WITH]-()) AS commonDegree
WITH candidate,
     sum(1.0 / log10(commonDegree + 1)) AS adamicAdarScore
RETURN candidate.name AS 推荐用户,
       adamicAdarScore AS AdamicAdar得分,
       candidate.city AS 城市,
       candidate.interests AS 兴趣
ORDER BY adamicAdarScore DESC
LIMIT 10;
```

`1.0 / log10(commonDegree + 1)` 是核心公式：共同好友的度数（好友数）越大，其对得分的贡献越小。加 1 避免 log10(1)=0 导致除零错误。

### 9.2.5 基于共同群组的推荐

除了好友关系，共同加入的群组也是重要的推荐信号：

```cypher
// 基于共同群组的好友推荐
MATCH (me:User {id: 'user_1'})-[:MEMBER_OF]->(commonGroup:Group)
MATCH (commonGroup)<-[:MEMBER_OF]-(candidate:User)
WHERE candidate <> me AND NOT exists {
  MATCH (me)-[:FRIENDS_WITH]-(candidate)
}
WITH candidate,
     count(DISTINCT commonGroup) AS sharedGroups,
     collect(DISTINCT commonGroup.name) AS groupNames
OPTIONAL MATCH (candidate)-[:MEMBER_OF]->(otherGroup:Group)
WHERE NOT (me)-[:MEMBER_OF]->(otherGroup)
WITH candidate, sharedGroups, groupNames,
     collect(DISTINCT otherGroup.name) AS otherGroups
RETURN candidate.name AS 推荐用户,
       sharedGroups AS 共同群组数,
       groupNames AS 共同群组,
       otherGroups AS 该用户的其他群组
ORDER BY sharedGroups DESC
LIMIT 10;
```

### 9.2.6 混合推荐引擎

生产环境中的推荐系统通常综合多种信号。以下实现一个加权混合推荐引擎：

```cypher
// 混合推荐引擎：综合多种信号
MATCH (me:User {id: 'user_1'})

// 信号1：共同好友得分（Jaccard）
OPTIONAL MATCH (me)-[:FRIENDS_WITH]-(common)-[:FRIENDS_WITH]-(cand1)
WITH me, cand1, collect(DISTINCT common) AS commonF
OPTIONAL MATCH (me)-[:FRIENDS_WITH]-(myF)
WITH me, cand1, commonF, collect(DISTINCT myF) AS allMyF
OPTIONAL MATCH (cand1)-[:FRIENDS_WITH]-(theirF)
WITH me, cand1, commonF, allMyF, collect(DISTINCT theirF) AS allTheirF
WITH me, cand1,
     CASE WHEN size(allMyF) + size(allTheirF) - size(commonF) > 0
       THEN toFloat(size(commonF)) / (size(allMyF) + size(allTheirF) - size(commonF))
       ELSE 0 END AS jaccardScore

// 信号2：共同群组得分
OPTIONAL MATCH (me)-[:MEMBER_OF]->(cg:Group)<-[:MEMBER_OF]-(cand2)
WITH me, cand1, jaccardScore, cand2,
     count(DISTINCT cg) AS groupScore

// 信号3：共同兴趣得分
OPTIONAL MATCH (me)-[:POSTED]->()-[:TAGGED_AS]->(t:Tag)<-[:TAGGED_AS]-()<-[:POSTED]-(cand3)
WITH me, cand1, jaccardScore, groupScore, cand3,
     count(DISTINCT t) AS interestScore

// 信号4：地理位置相近
OPTIONAL MATCH (me) WHERE me.city IS NOT NULL
WITH me, cand1, jaccardScore, groupScore, interestScore,
     CASE WHEN cand1.city = me.city THEN 1.0 ELSE 0 END AS locationScore

// 综合评分
WITH coalesce(cand1, cand2, cand3) AS candidate,
     coalesce(jaccardScore, 0) * 0.35 +
     coalesce(groupScore, 0) * 0.25 +
     coalesce(interestScore, 0) * 0.25 +
     coalesce(locationScore, 0) * 0.15 AS compositeScore
WHERE candidate IS NOT NULL
  AND candidate <> me
  AND NOT exists {
    MATCH (me)-[:FRIENDS_WITH]-(candidate)
  }
  AND NOT exists {
    MATCH (me)-[:FOLLOWS]-(candidate)
  }
RETURN candidate.name AS 推荐用户,
       compositeScore AS 综合得分,
       candidate.city AS 城市,
       candidate.interests AS 兴趣
ORDER BY compositeScore DESC
LIMIT 10;
```

权重分配（0.35 + 0.25 + 0.25 + 0.15 = 1.0）体现了"好友关系 > 群组 ≈ 兴趣 > 地理位置"的优先级。实际生产环境中，这些权重可以通过机器学习模型（如逻辑回归、GBDT）自动学习。

## 9.3 影响力传播分析

影响力分析回答"谁是社交网络中最有影响力的人"以及"信息如何通过网络传播"。

### 9.3.1 PageRank 算法

PageRank 最初由 Google 创始人 Larry Page 和 Sergey Brin 提出，用于网页排名。其核心思想是：一个节点的重要性取决于指向它的节点的重要性之和。在社交网络中，PageRank 可以衡量用户的影响力。

Neo4j 内置了 PageRank 算法（通过 GDS 库）：

```cypher
// 使用 Neo4j GDS 库运行 PageRank
CALL gds.graph.project('socialGraph', 'User', 'FRIENDS_WITH', {
  relationshipProperties: 'strength'
});

CALL gds.pageRank.write('socialGraph', {
  maxIterations: 20,
  dampingFactor: 0.85,
  relationshipWeightProperty: 'strength',
  writeProperty: 'pagerank'
});

// 查看影响力最高的用户
MATCH (u:User)
RETURN u.name AS 用户名,
       u.pagerank AS PageRank值,
       u.city AS 城市,
       u.occupation AS 职业
ORDER BY u.pagerank DESC
LIMIT 20;
```

**PageRank 参数说明：**
- `dampingFactor`（阻尼系数，默认 0.85）：模拟用户随机跳转的概率。值越大，影响力越容易在强连接网络中传播；值越小，随机性越强。
- `maxIterations`：最大迭代次数。PageRank 是迭代算法，通常 20 次即可收敛。
- `relationshipWeightProperty`：关系权重属性。如果好友关系有亲密度权重，可以传入。

如果不使用 GDS 库，也可以手动实现 PageRank：

```cypher
// 手动实现 PageRank（迭代版本）
// 初始化：每个用户赋予初始 PR 值 1.0
MATCH (u:User)
SET u.pr = 1.0;

// 迭代 10 次
UNWIND range(1, 10) AS iteration
MATCH (u:User)
OPTIONAL MATCH (u)<-[:FRIENDS_WITH]-(follower:User)
WITH u, collect(follower) AS followers, iteration
SET u.pr = 0.15 + 0.85 * reduce(
  s = 0.0, f IN followers |
  s + f.pr / size((f)-[:FRIENDS_WITH]-())
);

// 查看结果
MATCH (u:User)
RETURN u.name AS 用户名, u.pr AS PageRank值
ORDER BY u.pr DESC
LIMIT 10;
```

### 9.3.2 Betweenness Centrality（介数中心性）

介数中心性衡量一个节点作为"桥梁"的重要性——如果一个用户位于许多其他用户之间的最短路径上，ta 在信息传播中扮演关键角色。

```cypher
// 使用 GDS 计算介数中心性
CALL gds.betweenness.write('socialGraph', {
  writeProperty: 'betweenness'
});

// 查看桥梁用户
MATCH (u:User)
RETURN u.name AS 用户名,
       u.betweenness AS 介数中心性,
       u.pagerank AS PageRank值
ORDER BY u.betweenness DESC
LIMIT 10;
```

介数中心性高的用户是社交网络中的"关键节点"——如果 ta 离开平台，信息传播效率会显著下降。

### 9.3.3 社区发现（Louvain 算法）

社区发现算法将用户划分为紧密连接的群组，有助于理解社交网络的结构：

```cypher
// Louvain 社区发现
CALL gds.louvain.write('socialGraph', {
  writeProperty: 'community'
});

// 查看各社区规模
MATCH (u:User)
RETURN u.community AS 社区ID,
       count(u) AS 成员数,
       collect(u.name)[0..5] AS 部分成员
ORDER BY 成员数 DESC;
```

### 9.3.4 影响力传播路径分析

理解信息如何在用户之间传播，有助于设计病毒式营销策略：

```cypher
// 查找两个用户之间的最短传播路径
MATCH path = shortestPath(
  (start:User {id: 'user_1'})-[:FRIENDS_WITH*]-(target:User {id: 'user_50'})
)
RETURN [n IN nodes(path) | n.name] AS 传播路径,
       length(path) AS 传播距离;

// 查找从某个用户出发，3 步内可达的所有用户
MATCH (start:User {id: 'user_1'})
MATCH path = (start)-[:FRIENDS_WITH*1..3]-(reachable:User)
RETURN reachable.name AS 可达用户,
       min(length(path)) AS 最短距离,
       count(DISTINCT reachable) AS 三度内可达总数;
```

六度分隔理论（Six Degrees of Separation）认为任何两个人之间最多通过六个中间人就能建立联系。通过 Neo4j，我们可以验证这个理论：

```cypher
// 验证六度分隔理论：计算所有用户对之间的平均最短路径长度
MATCH (u1:User), (u2:User)
WHERE u1 <> u2
MATCH path = shortestPath((u1)-[:FRIENDS_WITH*]-(u2))
WITH u1, u2, length(path) AS distance
RETURN avg(distance) AS 平均距离,
       max(distance) AS 最大距离,
       min(distance) AS 最小距离,
       stdev(distance) AS 标准差;
```

### 9.3.5 影响力最大化（CELF 算法）

影响力最大化问题：选择 k 个种子用户，使得信息传播范围最大。CELF（Cost-Effective Lazy Forward）算法是贪心算法的高效变体：

```cypher
// 使用 PageRank 选择 Top-K 种子用户（近似影响力最大化）
MATCH (u:User)
RETURN u.name AS 用户名,
       u.pagerank AS 影响力得分,
       u.city AS 城市,
       u.occupation AS 职业
ORDER BY u.pagerank DESC
LIMIT 5;
```

更精确的方法是模拟独立级联（Independent Cascade）模型，但计算成本较高。PageRank 作为近似方法，在实际工程中已被证明效果良好。

## 9.4 内容推荐引擎

内容推荐是社交网络的另一核心功能。本节实现基于协同过滤和内容匹配的推荐。

### 9.4.1 基于好友行为的推荐（Social Filtering）

好友点赞或评论过的内容，对用户有更高的推荐价值：

```cypher
// 推荐好友最近点赞的帖子
MATCH (me:User {id: 'user_1'})-[:FRIENDS_WITH]-(friend:User)
MATCH (friend)-[:LIKES]->(post:Post)
WHERE NOT exists {
  MATCH (me)-[:LIKES]->(post)
}
  AND NOT exists {
    MATCH (me)-[:POSTED]->(post)
  }
WITH post,
     count(DISTINCT friend) AS friendLikes,
     collect(DISTINCT friend.name) AS likedByFriends
RETURN post.title AS 帖子标题,
       friendLikes AS 好友点赞数,
       likedByFriends AS 点赞好友
ORDER BY friendLikes DESC
LIMIT 10;
```

### 9.4.2 基于兴趣标签的推荐

根据用户的兴趣标签匹配内容：

```cypher
// 基于兴趣标签的内容推荐
MATCH (me:User {id: 'user_1'})
// 找到用户感兴趣的话题标签
OPTIONAL MATCH (me)-[:POSTED]->()-[:TAGGED_AS]->(myTag:Tag)
OPTIONAL MATCH (me)-[:LIKES]->()-[:TAGGED_AS]->(likedTag:Tag)
WITH me, collect(DISTINCT myTag) + collect(DISTINCT likedTag) AS interestTags

// 找到这些标签下的热门帖子
UNWIND interestTags AS tag
MATCH (tag)<-[:TAGGED_AS]-(post:Post)<-[:POSTED]-(author:User)
WHERE author <> me
  AND NOT exists {
    MATCH (me)-[:LIKES]->(post)
  }
  AND NOT exists {
    MATCH (me)-[:POSTED]->(post)
  }
WITH post, author, tag,
     post.likes_count AS popularity
RETURN post.title AS 帖子标题,
       author.name AS 作者,
       tag.name AS 匹配标签,
       popularity AS 热度
ORDER BY popularity DESC
LIMIT 10;
```

### 9.4.3 协同过滤推荐

协同过滤（Collaborative Filtering）基于"兴趣相似的用户可能喜欢相同内容"的假设：

```cypher
// 基于用户的协同过滤
// 步骤1：找到与当前用户兴趣相似的用户（基于点赞和标签）
MATCH (me:User {id: 'user_1'})
MATCH (me)-[:LIKES]->(likedPost:Post)
MATCH (likedPost)<-[:LIKES]-(similarUser:User)
WHERE similarUser <> me
WITH similarUser, count(DISTINCT likedPost) AS commonLikes

// 步骤2：从相似用户中找到当前用户未看过的帖子
MATCH (similarUser)-[:LIKES]->(recommendedPost:Post)
WHERE NOT exists {
  MATCH (me)-[:LIKES]->(recommendedPost)
}
  AND NOT exists {
    MATCH (me)-[:POSTED]->(recommendedPost)
  }
WITH recommendedPost,
     sum(commonLikes) AS similarityScore,
     count(DISTINCT similarUser) AS userCount
RETURN recommendedPost.title AS 推荐帖子,
       similarityScore AS 相似度得分,
       userCount AS 相关用户数
ORDER BY similarityScore DESC
LIMIT 10;
```

### 9.4.4 基于内容的推荐（Content-Based Filtering）

基于内容的推荐分析用户历史偏好，推荐属性相似的内容：

```cypher
// 基于内容的推荐：分析用户喜欢的帖子标签分布
MATCH (me:User {id: 'user_1'})-[:LIKES]->()-[:TAGGED_AS]->(tag:Tag)
WITH tag, count(*) AS weight
ORDER BY weight DESC

// 找到包含这些标签但用户未交互的帖子
MATCH (tag)<-[:TAGGED_AS]-(post:Post)<-[:POSTED]-(author:User)
WHERE author <> me
  AND NOT exists {
    MATCH (me)-[:LIKES]->(post)
  }
  AND NOT exists {
    MATCH (me)-[:POSTED]->(post)
  }
WITH post, author, tag, weight,
     post.likes_count AS popularity
WITH post, author,
     sum(weight) AS tagRelevance,
     max(popularity) AS popularity,
     collect(tag.name) AS matchedTags
RETURN post.title AS 帖子标题,
       author.name AS 作者,
       tagRelevance AS 标签相关度,
       popularity AS 热度,
       matchedTags AS 匹配标签
ORDER BY tagRelevance * 0.7 + popularity * 0.3 DESC
LIMIT 10;
```

### 9.4.5 混合内容推荐引擎

综合多种推荐策略的混合引擎：

```cypher
// 混合内容推荐引擎
MATCH (me:User {id: 'user_1'})

// 信号1：好友推荐得分
OPTIONAL MATCH (me)-[:FRIENDS_WITH]-(friend)
MATCH (friend)-[:LIKES|:POSTED]->(p1:Post)
WHERE NOT exists { MATCH (me)-[:LIKES]->(p1) }
  AND NOT exists { MATCH (me)-[:POSTED]->(p1) }
WITH me, p1, count(DISTINCT friend) AS friendScore

// 信号2：兴趣标签匹配得分
OPTIONAL MATCH (me)-[:LIKES|:POSTED]->()-[:TAGGED_AS]->(t:Tag)
WITH me, p1, friendScore, t
MATCH (t)<-[:TAGGED_AS]-(p2:Post)
WHERE p2 = p1
WITH me, p1, friendScore, count(DISTINCT t) AS tagScore

// 信号3：协同过滤得分
OPTIONAL MATCH (me)-[:LIKES]->(lp:Post)
MATCH (lp)<-[:LIKES]-(su:User)
MATCH (su)-[:LIKES]->(p3:Post)
WHERE p3 = p1
WITH me, p1, friendScore, tagScore,
     count(DISTINCT su) AS cfScore

// 综合评分
WITH p1,
     coalesce(friendScore, 0) * 0.4 +
     coalesce(tagScore, 0) * 0.35 +
     coalesce(cfScore, 0) * 0.25 AS compositeScore,
     p1.likes_count AS popularity
WHERE compositeScore > 0
RETURN p1.title AS 推荐内容,
       compositeScore AS 综合得分,
       popularity AS 热度
ORDER BY compositeScore DESC
LIMIT 10;
```

## 9.5 完整社交网络应用实现

本节将前面各模块整合为一个完整的社交网络应用，包含用户管理、动态推送、好友管理和数据分析功能。

### 9.5.1 用户注册与资料管理

```cypher
// 用户注册
CREATE (u:User {
  id: 'user_' + apoc.create.uuid(),
  name: '新用户',
  age: 25,
  city: '北京',
  occupation: '工程师',
  interests: '编程',
  registered_at: datetime(),
  pagerank: 0.15,
  betweenness: 0.0,
  community: -1
})
RETURN u;

// 更新用户资料
MATCH (u:User {id: 'user_101'})
SET u.name = '张三',
    u.city = '上海',
    u.interests = '摄影,旅行,美食'
RETURN u;

// 获取用户资料及社交统计
MATCH (u:User {id: 'user_1'})
OPTIONAL MATCH (u)-[:FRIENDS_WITH]-() 
WITH u, count(*) AS friendCount
OPTIONAL MATCH (u)-[:POSTED]->(p:Post)
WITH u, friendCount, count(p) AS postCount
OPTIONAL MATCH (u)-[:MEMBER_OF]->(g:Group)
WITH u, friendCount, postCount, collect(g.name) AS groups
RETURN u.name AS 用户名,
       u.city AS 城市,
       u.occupation AS 职业,
       u.interests AS 兴趣,
       friendCount AS 好友数,
       postCount AS 发帖数,
       groups AS 加入群组;
```

### 9.5.2 动态推送（News Feed）

动态推送是社交网络的核心功能，需要综合好友发帖、点赞和评论信息：

```cypher
// 生成用户动态推送
MATCH (me:User {id: 'user_1'})

// 好友发布的帖子
OPTIONAL MATCH (me)-[:FRIENDS_WITH]-(friend:User)
MATCH (friend)-[:POSTED]->(post:Post)
OPTIONAL MATCH (post)<-[:LIKES]-(liker:User)
OPTIONAL MATCH (post)<-[:COMMENTED_ON]-(:Comment)-[:COMMENTED_ON]->(post)
  WITH post, friend, count(DISTINCT liker) AS likes, 
       count(DISTINCT Comment) AS comments

// 计算动态得分（时间衰减 + 互动热度）
WITH post, friend, likes, comments,
     post.likes_count AS totalLikes,
     datetime() - post.created_at AS age
WITH post, friend, likes, comments, totalLikes,
     CASE
       WHEN age.hours < 1 THEN 10.0
       WHEN age.hours < 24 THEN 5.0
       WHEN age.days < 7 THEN 2.0
       ELSE 1.0
     END AS recencyScore,
     (likes * 0.3 + comments * 0.5 + totalLikes * 0.2) AS engagementScore

RETURN friend.name AS 好友,
       post.title AS 帖子标题,
       post.created_at AS 发布时间,
       recencyScore AS 时效得分,
       engagementScore AS 互动得分,
       recencyScore * 0.6 + engagementScore * 0.4 AS 综合得分
ORDER BY 综合得分 DESC
LIMIT 20;
```

### 9.5.3 好友管理操作

```cypher
// 发送好友请求
MATCH (u1:User {id: 'user_1'}), (u2:User {id: 'user_50'})
CREATE (u1)-[:FRIENDS_WITH {
  created_at: datetime(),
  strength: 0.5
}]->(u2);

// 删除好友
MATCH (u1:User {id: 'user_1'})-[r:FRIENDS_WITH]-(u2:User {id: 'user_50'})
DELETE r;

// 获取好友列表（按亲密度排序）
MATCH (u:User {id: 'user_1'})-[r:FRIENDS_WITH]-(friend:User)
RETURN friend.name AS 好友名,
       r.strength AS 亲密度,
       friend.city AS 城市,
       friend.interests AS 兴趣
ORDER BY r.strength DESC;

// 获取共同好友
MATCH (u1:User {id: 'user_1'})-[:FRIENDS_WITH]-(common:User)-[:FRIENDS_WITH]-(u2:User {id: 'user_50'})
RETURN common.name AS 共同好友,
       common.city AS 城市;
```

### 9.5.4 社交网络数据分析

```cypher
// 用户分布统计
MATCH (u:User)
RETURN u.city AS 城市,
       count(u) AS 用户数,
       avg(u.age) AS 平均年龄,
       collect(DISTINCT u.occupation) AS 职业分布
ORDER BY 用户数 DESC;

// 社交网络密度
MATCH (u:User)
WITH count(u) AS totalUsers
MATCH ()-[:FRIENDS_WITH]-()
WITH totalUsers, count(*) / 2 AS totalEdges
RETURN totalUsers AS 总用户数,
       totalEdges AS 总关系数,
       toFloat(totalEdges * 2) / (totalUsers * (totalUsers - 1)) AS 网络密度;

// 最活跃用户
MATCH (u:User)
OPTIONAL MATCH (u)-[:POSTED]->(p:Post)
OPTIONAL MATCH (u)-[:LIKES]->()
OPTIONAL MATCH (u)-[:COMMENTED_ON]->()
WITH u, count(p) AS posts, count(Likes) AS likes, count(Comment) AS comments
RETURN u.name AS 用户名,
       posts AS 发帖数,
       likes AS 点赞数,
       comments AS 评论数,
       posts + likes + comments AS 活跃度
ORDER BY 活跃度 DESC
LIMIT 10;

// 社交网络中的孤立节点
MATCH (u:User)
WHERE NOT (u)-[:FRIENDS_WITH]-()
RETURN u.name AS 孤立用户,
       u.registered_at AS 注册时间
ORDER BY u.registered_at DESC;
```

### 9.5.5 推荐系统的冷启动处理

新用户没有行为数据时，推荐系统面临冷启动问题。以下策略可以缓解：

```cypher
// 冷启动推荐：基于用户注册信息
MATCH (newUser:User {id: 'user_101'})

// 策略1：推荐同城热门用户
MATCH (popular:User)
WHERE popular.city = newUser.city
  AND popular.id <> newUser.id
  AND popular.pagerank > 0.5
RETURN popular.name AS 推荐用户,
       popular.pagerank AS 影响力,
       '同城热门' AS 推荐理由
ORDER BY popular.pagerank DESC
LIMIT 5

UNION

// 策略2：推荐同龄段热门用户
MATCH (newUser:User {id: 'user_101'})
MATCH (popular:User)
WHERE abs(popular.age - newUser.age) <= 5
  AND popular.id <> newUser.id
  AND popular.pagerank > 0.3
RETURN popular.name AS 推荐用户,
       popular.pagerank AS 影响力,
       '同龄热门' AS 推荐理由
ORDER BY popular.pagerank DESC
LIMIT 5

UNION

// 策略3：推荐平台全局热门用户
MATCH (popular:User)
WHERE popular.pagerank > 1.0
RETURN popular.name AS 推荐用户,
       popular.pagerank AS 影响力,
       '平台热门' AS 推荐理由
ORDER BY popular.pagerank DESC
LIMIT 5;
```

## 9.6 性能优化与生产实践

### 9.6.1 查询优化技巧

```cypher
// 避免全表扫描：使用索引
PROFILE
MATCH (u:User {city: '北京'})
RETURN u.name, u.age;

// 使用 EXISTS 子查询替代 OPTIONAL MATCH 过滤
// 不推荐：
MATCH (u:User {id: 'user_1'})
OPTIONAL MATCH (u)-[:FRIENDS_WITH]-(f)
WITH u, f WHERE f IS NOT NULL;

// 推荐：
MATCH (u:User {id: 'user_1'})
WHERE exists {
  MATCH (u)-[:FRIENDS_WITH]-(:User)
}
RETURN u;

// 限制路径长度避免爆炸
// 不推荐（可能遍历整个图）：
MATCH path = (u:User)-[:FRIENDS_WITH*]-(f);

// 推荐（限制深度）：
MATCH path = (u:User)-[:FRIENDS_WITH*1..4]-(f);
```

### 9.6.2 批量操作与数据导入

```cypher
// 批量创建关系（使用 UNWIND + 事务）
UNWIND $relationships AS rel
MATCH (u1:User {id: rel.from})
MATCH (u2:User {id: rel.to})
CREATE (u1)-[:FRIENDS_WITH {
  created_at: datetime(rel.created_at),
  strength: rel.strength
}]->(u2);

// 使用 apoc.periodic.commit 分批处理大数据
CALL apoc.periodic.commit(
  'MATCH (u:User) WHERE u.pagerank IS NULL
   WITH u LIMIT 1000
   SET u.pagerank = 0.15
   RETURN count(u)',
  {batchSize: 1000}
);
```

### 9.6.3 图投影与内存管理

对于大规模图，使用 GDS 的图投影功能可以显著提升算法性能：

```cypher
// 创建带权重的图投影
CALL gds.graph.project(
  'weightedSocialGraph',
  'User',
  {
    FRIENDS_WITH: {
      orientation: 'UNDIRECTED',
      properties: ['strength']
    }
  }
);

// 在投影图上运行算法
CALL gds.pageRank.stream('weightedSocialGraph', {
  relationshipWeightProperty: 'strength'
})
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS 用户名, score AS PageRank值
ORDER BY score DESC
LIMIT 10;

// 清理图投影
CALL gds.graph.drop('weightedSocialGraph');
```

### 9.6.4 推荐系统的评估指标

推荐系统的效果需要量化评估。以下是社交网络推荐场景中常用的评估指标及其 Cypher 实现：

```cypher
// 精确率（Precision）：推荐的好友中，用户实际添加的比例
MATCH (u:User {id: 'user_1'})
// 假设系统推荐了 10 个用户
WITH u, 10 AS recommendedCount
OPTIONAL MATCH (u)-[:FRIENDS_WITH]->(accepted:User)
WHERE accepted.recommended = true
WITH recommendedCount, count(accepted) AS acceptedCount
RETURN toFloat(acceptedCount) / recommendedCount AS 精确率;

// 召回率（Recall）：用户实际添加的好友中，被系统推荐的比例
MATCH (u:User {id: 'user_1'})-[:FRIENDS_WITH]->(friend:User)
WITH count(friend) AS totalFriends
MATCH (u:User {id: 'user_1'})-[:FRIENDS_WITH]->(recommendedFriend:User)
WHERE recommendedFriend.recommended = true
WITH totalFriends, count(recommendedFriend) AS recommendedAndAccepted
RETURN toFloat(recommendedAndAccepted) / totalFriends AS 召回率;

// 覆盖率（Coverage）：推荐系统能够推荐的用户占总用户的比例
MATCH (u:User)
WHERE u.recommendable = true
WITH count(u) AS recommendableUsers
MATCH (u:User)
WITH count(u) AS totalUsers, recommendableUsers
RETURN toFloat(recommendableUsers) / totalUsers AS 覆盖率;

// 多样性（Diversity）：推荐结果中不同属性用户的占比
MATCH (me:User {id: 'user_1'})
// 假设推荐了 10 个用户
MATCH (me)-[:FRIENDS_WITH]-(friend:User)
WHERE friend.recommended = true
WITH count(DISTINCT friend.city) AS cityVariety,
     count(DISTINCT friend.occupation) AS occupationVariety,
     count(friend) AS totalRecommended
RETURN toFloat(cityVariety) / totalRecommended AS 城市多样性,
       toFloat(occupationVariety) / totalRecommended AS 职业多样性;
```

### 9.6.6 实时推荐与缓存策略

社交网络的推荐系统需要平衡实时性和计算成本。以下策略可以在生产环境中实现高效的实时推荐：

**预计算 + 缓存模式：**

```cypher
// 预计算 Top-N 推荐结果并存储为关系
MATCH (me:User {id: 'user_1'})
// 执行混合推荐算法（省略详细匹配逻辑）
WITH me, candidate, compositeScore
ORDER BY compositeScore DESC
LIMIT 20
CREATE (me)-[:RECOMMENDED {
  score: compositeScore,
  computed_at: datetime(),
  expires_at: datetime() + duration({hours: 24})
}]->(candidate);

// 查询时直接读取缓存
MATCH (me:User {id: 'user_1'})-[r:RECOMMENDED]->(candidate:User)
WHERE r.expires_at > datetime()
RETURN candidate.name AS 推荐用户,
       r.score AS 推荐得分
ORDER BY r.score DESC;
```

**增量更新策略：** 当用户产生新行为（添加好友、点赞帖子）时，只更新受影响的推荐结果，而非全量重算：

```cypher
// 用户添加新好友后，增量更新推荐
MATCH (me:User {id: 'user_1'})-[:FRIENDS_WITH]-(newFriend:User {id: 'user_50'})
// 找到新好友的好友作为候选
MATCH (newFriend)-[:FRIENDS_WITH]-(candidate:User)
WHERE candidate <> me
  AND NOT exists { MATCH (me)-[:FRIENDS_WITH]-(candidate) }
  AND NOT exists { MATCH (me)-[:RECOMMENDED]-(candidate) }
// 增量计算推荐得分
WITH me, candidate,
     1.0 / log10(size((candidate)-[:FRIENDS_WITH]-()) + 1) AS incrementalScore
CREATE (me)-[:RECOMMENDED {
  score: incrementalScore,
  computed_at: datetime(),
  expires_at: datetime() + duration({hours: 24}),
  source: 'incremental'
}]->(candidate);
```

### 9.6.7 图嵌入与深度学习推荐

传统图算法（PageRank、Jaccard）虽然有效，但无法捕捉节点属性的深层语义。图嵌入（Graph Embedding）技术将图中的节点映射到低维向量空间，使得相似的节点在向量空间中距离更近。Neo4j 可以与深度学习框架结合实现图嵌入推荐：

**Node2Vec 算法原理：** Node2Vec 通过随机游走生成节点序列，然后使用 Word2Vec 风格的 Skip-Gram 模型学习节点嵌入。游走策略在广度优先（BFS）和深度优先（DFS）之间平衡，BFS 捕捉结构相似性，DFS 捕捉社区归属。

```cypher
// 使用 GDS 的 Node2Vec 算法生成图嵌入
CALL gds.graph.project('embeddingGraph', 'User', {
  FRIENDS_WITH: { orientation: 'UNDIRECTED' },
  MEMBER_OF: { orientation: 'UNDIRECTED' }
});

CALL gds.node2vec.write('embeddingGraph', {
  embeddingDimension: 64,
  walkLength: 80,
  walksPerNode: 10,
  returnFactor: 1.0,
  inOutFactor: 1.0,
  writeProperty: 'embedding',
  randomSeed: 42
});

// 基于嵌入向量的相似度推荐
// 注意：向量相似度计算需要 APOC 插件或自定义过程
MATCH (me:User {id: 'user_1'})
MATCH (candidate:User)
WHERE candidate <> me
  AND NOT exists { MATCH (me)-[:FRIENDS_WITH]-(candidate) }
  AND me.embedding IS NOT NULL
  AND candidate.embedding IS NOT NULL
// 计算余弦相似度（简化版本，实际应使用向量索引）
WITH me, candidate,
     gds.similarity.cosine(me.embedding, candidate.embedding) AS cosineSim
WHERE cosineSim > 0.7
RETURN candidate.name AS 推荐用户,
       cosineSim AS 向量相似度
ORDER BY cosineSim DESC
LIMIT 10;
```

图嵌入的优势在于：
1. **自动特征学习**：无需手动设计特征，嵌入向量自动编码图结构信息
2. **多关系融合**：可以同时考虑好友关系、群组关系、点赞关系等多种关系类型
3. **冷启动缓解**：新用户的属性信息可以映射到嵌入空间，即使没有社交关系也能推荐

### 9.6.8 大规模图的分区与分布式部署

当社交网络规模达到千万级节点和亿级关系时，单机 Neo4j 无法满足性能需求。此时需要图分区和分布式部署策略：

**分区策略对比：**

| 策略 | 描述 | 适用场景 |
|------|------|---------|
| 哈希分区 | 按节点 ID 哈希值分配到不同分片 | 均匀分布，但跨分区查询代价高 |
| 社区分区 | 按 Louvain 社区划分，同一社区尽量在同一分片 | 社交网络天然适合，跨社区查询少 |
| 地理位置分区 | 按用户城市/地区划分 | 本地化社交网络，如基于位置的交友 |

**读写分离架构：**

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  写入集群   │────▶│  读取副本1   │     │  推荐引擎     │
│  (主节点)   │     │  (从节点)    │◀────│  (批量计算)   │
└─────────────┘     ├──────────────┤     └──────────────┘
                    │  读取副本2   │
                    │  (从节点)    │◀────┐
                    ├──────────────┤     │ 实时推荐查询
                    │  读取副本3   │◀────┘
                    │  (从节点)    │
                    └──────────────┘
```

**Cypher 层面的读写分离：**

```cypher
// 写操作发送到主节点
:use system
CREATE DATABASE social;

// 读操作发送到从节点（推荐查询）
:use social
MATCH (me:User {id: 'user_1'})
MATCH (me)-[:RECOMMENDED]->(candidate:User)
WHERE candidate.pagerank > 0.3
RETURN candidate.name, candidate.pagerank
ORDER BY candidate.pagerank DESC;
```

### 9.6.9 推荐系统的安全与隐私

社交网络推荐系统涉及用户隐私数据，必须考虑以下安全措施：

**数据脱敏：** 推荐算法不应直接暴露用户的敏感属性：

```cypher
// 不安全的做法：直接暴露用户年龄
MATCH (u:User)
RETURN u.name, u.age;

// 安全的做法：返回年龄段而非精确年龄
MATCH (u:User)
RETURN u.name,
       CASE
         WHEN u.age < 18 THEN '未成年'
         WHEN u.age < 25 THEN '18-24岁'
         WHEN u.age < 35 THEN '25-34岁'
         WHEN u.age < 50 THEN '35-49岁'
         ELSE '50岁以上'
       END AS 年龄段;
```

**关系可见性控制：** 用户应能控制自己的关系是否被用于推荐：

```cypher
// 在关系上添加可见性属性
MATCH (u1:User {id: 'user_1'})-[r:FRIENDS_WITH]-(u2:User {id: 'user_50'})
SET r.visible_to_recommendation = false;

// 推荐查询时过滤不可见关系
MATCH (me:User {id: 'user_1'})-[:FRIENDS_WITH {visible_to_recommendation: true}]-(friend:User)
MATCH (friend)-[:FRIENDS_WITH {visible_to_recommendation: true}]-(candidate:User)
WHERE candidate <> me
  AND NOT exists { MATCH (me)-[:FRIENDS_WITH]-(candidate) }
RETURN candidate.name, count(friend) AS commonFriends
ORDER BY commonFriends DESC;
```

**推荐结果去偏：** 避免推荐系统放大社会偏见（如性别、地域歧视）：

```cypher
// 在推荐结果中确保多样性约束
MATCH (me:User {id: 'user_1'})
MATCH (me)-[:FRIENDS_WITH]-(friend:User)
MATCH (friend)-[:FRIENDS_WITH]-(candidate:User)
WHERE candidate <> me
  AND NOT exists { MATCH (me)-[:FRIENDS_WITH]-(candidate) }
WITH candidate, count(friend) AS commonFriends,
     candidate.gender AS gender,
     candidate.city AS city
// 确保推荐结果中男女比例均衡
WITH candidate, commonFriends,
     CASE WHEN gender = '男' THEN 1 ELSE 0 END AS isMale,
     CASE WHEN gender = '女' THEN 1 ELSE 0 END AS isFemale
ORDER BY commonFriends DESC
// 应用层实现多样性约束（此处示意逻辑）
RETURN candidate.name, commonFriends, gender, city;
```

### 9.6.10 推荐系统的 A/B 测试框架

```cypher
// 为用户分配实验组
MATCH (u:User)
WHERE rand() < 0.5
SET u.recommendation_version = 'v1_hybrid'
WITH u
WHERE rand() < 0.5
SET u.recommendation_version = 'v2_deep_learning';

// 统计各版本推荐效果
MATCH (u:User)
WHERE u.recommendation_version IS NOT NULL
OPTIONAL MATCH (u)-[:LIKES]->(p:Post)
WHERE p.recommended = true
WITH u.recommendation_version AS version,
     u,
     count(p) AS acceptedCount
RETURN version AS 推荐版本,
       count(u) AS 用户数,
       avg(acceptedCount) AS 平均接受数,
       max(acceptedCount) AS 最大接受数
ORDER BY 平均接受数 DESC;
```

## 9.7 本章小结

本章从零开始构建了一个完整的社交网络与推荐系统，涵盖以下核心内容：

1. **图数据建模**：使用 `User`、`Post`、`Tag`、`Group` 等节点和 `FRIENDS_WITH`、`LIKES`、`POSTED` 等关系，构建了丰富的社交网络图模型。

2. **好友推荐算法**：实现了从基础的共同好友推荐、Jaccard 相似度、Adamic-Adar 到加权混合推荐引擎的完整演进路径。每种算法都有其适用场景：Jaccard 适合惩罚社交达人，Adamic-Adar 适合发现强联系，混合引擎适合生产环境。

3. **影响力传播分析**：利用 PageRank 识别高影响力用户，介数中心性发现关键桥梁节点，Louvain 算法进行社区发现，以及传播路径分析验证六度分隔理论。

4. **内容推荐引擎**：实现了基于好友行为的社交过滤、基于兴趣标签的内容匹配、基于用户的协同过滤，以及综合多种策略的混合推荐引擎。

5. **完整应用实现**：涵盖用户管理、动态推送、好友操作、数据分析和冷启动处理等生产级功能。

6. **性能优化**：介绍了查询优化、批量操作、图投影管理和 A/B 测试框架等工程实践。

### 关键公式总结

| 算法 | 公式 | 适用场景 |
|------|------|---------|
| Jaccard 相似度 | J(A,B) = \|A ∩ B\| / \|A ∪ B\| | 好友推荐、兴趣匹配 |
| Adamic-Adar | AA(x,y) = Σ 1/log(deg(z)) | 发现强社交联系 |
| PageRank | PR(u) = (1-d) + d × Σ PR(v)/deg(v) | 影响力排名 |
| 混合推荐 | Score = Σ w_i × signal_i | 生产环境推荐系统 |

### 进一步阅读

- Neo4j GDS 手册：https://neo4j.com/docs/graph-data-science/current/
- 推荐系统实践（项亮）：系统介绍推荐算法理论
- Graph Algorithms（Mark Needham）：图算法的工程实践指南

在下一章中，我们将探讨如何使用 Neo4j 构建知识图谱，包括实体识别、关系抽取和智能问答系统。
