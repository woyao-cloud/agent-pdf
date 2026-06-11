# 第18章 真实世界的算法

> "书本上的算法是干净的、优雅的。生产环境中的算法是嘈杂的、容错的、永远在线的。本章带你走出象牙塔。"

---

## 18.1 搜索引擎中的算法

### 18.1.1 PageRank——网页排序

PageRank 是 Google 的奠基算法，核心思想是：被重要页面链接的页面也是重要的。

**核心公式：**

```
PR(A) = (1 - d) + d × (PR(T₁)/C(T₁) + PR(T₂)/C(T₂) + ... + PR(Tₙ)/C(Tₙ))
```

其中：
- PR(A) = 页面 A 的 PageRank 值
- d = 阻尼因子（通常 0.85），模拟用户随机跳转的概率
- PR(Tᵢ) = 指向 A 的第 i 个链接来源页面的 PR 值
- C(Tᵢ) = 页面 Tᵢ 的出链数量

**幂迭代法（Power Iteration）：**

将 Web 视为一个巨大有向图，用邻接矩阵 M 表示转移概率：

1. 初始化所有页面的 PR 值 = 1/N
2. 迭代：`PR(t+1) = (1-d)/N + d × M × PR(t)`
3. 当 `|PR(t+1) - PR(t)| < ε` 时收敛

**数学本质：** PageRank 等价于求解转移矩阵的主特征向量（特征值为 1）。幂迭代是计算最大特征值对应特征向量的标准方法。

**注意几个细节：**
- **悬挂节点（dangling node）**：没有出链的页面，需要特殊处理（假设链接到所有页面）
- **蜘蛛陷阱（spider trap）**：一组页面只有内部链接，没有外部出链
- 阻尼因子 d 解决了上述两个问题，保证 Markov 链的不可约性和非周期性

**简化实现：**

```java
// 每次迭代的核心计算
double[] newRank = new double[N];
for (int i = 0; i < N; i++) {
    double sum = 0;
    for (int j : incomingLinks[i])    // 所有指向 i 的页面
        sum += rank[j] / outDegree[j]; // 均分 PR 值
    newRank[i] = (1 - d) / N + d * sum;
}
rank = normalize(newRank);
```

### 18.1.2 倒排索引（Inverted Index）

倒排索引是搜索引擎的核心数据结构——通过「词 → 文档列表」的映射实现快速检索。

**正向索引（Forward Index）：** `文档 → [词]`
**倒排索引（Inverted Index）：** `词 → [文档ID, 位置列表]`

**构建流程：**

```
原始文档：
  Doc1: "the quick brown fox"
  Doc2: "the lazy dog"
  Doc3: "quick brown cat"

分词及归一化：
  tokenization → 小写化 → 去停用词 → stemming

倒排索引：
  "quick" → [(Doc1, [1]), (Doc3, [0])]
  "brown" → [(Doc1, [2]), (Doc3, [1])]
  "fox"   → [(Doc1, [3])]
  "lazy"  → [(Doc2, [1])]
  "dog"   → [(Doc2, [2])]
```

**关键数据结构：**

| 组件 | 实现 | 作用 |
|:--|:--|:--|
| 词典（Dictionary） | 哈希表 / B+ 树 | 词 → 倒排列表的映射 |
| 倒排列表（Posting List） | 有序数组（delta encoding） | 包含该词的文档 ID 列表 |
| 位置列表（Position List） | 每个文档内的位置 | 支持短语搜索 |

**压缩技巧：** 对文档 ID 用差值编码（delta encoding），相邻 ID 的差值通常很小，可以用可变字节编码（Variable Byte Encoding）压缩。

### 18.1.3 TF-IDF 排序

TF-IDF 是信息检索中最经典的文档相关性评分算法：

**词频（TF, Term Frequency）：** 词 w 在文档 d 中出现的频率

```
TF(w, d) = count(w, d) / |d|
```

**逆文档频率（IDF, Inverse Document Frequency）：** 词 w 在整个文档集合中的稀有程度

```
IDF(w) = log(N / df(w))  // N = 文档总数, df(w) = 包含词 w 的文档数
```

**TF-IDF 分数：**

```
TF-IDF(w, d) = TF(w, d) × IDF(w)
```

**BM25 改进版：**

BM25 是目前搜索引擎主流的相关度算法，引入文档长度归一化和饱和度函数：

```
BM25(w, d) = IDF(w) × (TF(w,d) × (k₁ + 1)) / (TF(w,d) + k₁ × (1 - b + b × |d| / avgdl))
```

其中 k₁ 和 b 是调参因子（通常 k₁=1.2, b=0.75），avgdl 为平均文档长度。

### 18.1.4 查询处理

**布尔检索（Boolean Retrieval）：**

对查询 `"hello" AND "world"`，从两个词的倒排列表中取交集：

```java
// 两个有序 posting list 取交集
List<Integer> intersect(List<Integer> list1, List<Integer> list2) {
    List<Integer> result = new ArrayList<>();
    int i = 0, j = 0;
    while (i < list1.size() && j < list2.size()) {
        if (list1.get(i) < list2.get(j)) i++;
        else if (list1.get(i) > list2.get(j)) j++;
        else { result.add(list1.get(i)); i++; j++; }
    }
    return result;
}
```

**短语搜索（Phrase Search）：**

对 `"brown fox"`，需要同时满足：
1. 两个词出现在同一文档中
2. 位置差为 1（brown 在前，fox 在后）

**容错搜索：** 通过拼写纠正（编辑距离）、同义词扩展、模糊匹配等处理用户输入错误。

---

## 18.2 推荐系统算法

### 18.2.1 协同过滤（Collaborative Filtering）

协同过滤的核心假设：**过去品味相似的用户，未来也相似。**

**基于用户的协同过滤（User-Based CF）：**

1. 找到与目标用户品味最相似的 k 个用户
2. 聚合这些用户对物品的评分，预测目标用户对未评分物品的兴趣

**相似度计算——皮尔逊相关系数（Pearson Correlation）：**

```
sim(u, v) = Σ(rᵤᵢ - r̄ᵤ)(rᵥᵢ - r̄ᵥ) / √(Σ(rᵤᵢ - r̄ᵤ)² × Σ(rᵥᵢ - r̄ᵥ)²)
```

其中 rᵤᵢ 是用户 u 对物品 i 的评分，r̄ᵤ 是用户 u 的平均评分。

**评分预测：**

```
pred(u, i) = r̄ᵤ + Σ(sim(u, v) × (rᵥᵢ - r̄ᵥ)) / Σ|sim(u, v)|
```

**基于物品的协同过滤（Item-Based CF）：**

计算物品之间的相似度（而非用户之间的），然后推荐与用户历史喜欢的物品最相似的物品。实际应用中效果通常优于 User-Based CF，因为物品之间的关系更稳定。

| 对比 | User-Based CF | Item-Based CF |
|:--|:--|:--|
| 计算量 | 用户变化快，需要频繁更新 | 物品关系稳定，可离线计算 |
| 可解释性 | 弱（"和你相似的用户也喜欢"） | 强（"因为你喜欢 X"） |
| 冷启动 | 新用户无历史行为 | 新物品无评分 |

**矩阵分解（Matrix Factorization）——SVD：**

将用户-物品评分矩阵 R（m × n）分解为两个低秩矩阵的乘积：

```
R ≈ P × Qᵀ
```

其中 P 是 m × k 的用户隐因子矩阵，Q 是 n × k 的物品隐因子矩阵，k 是隐因子维度（通常 10-200）。

**SVD 的优化目标（最小化正则化平方误差）：**

```
min Σ(Rᵤᵢ - Pᵤ·Qᵢ)² + λ(||Pᵤ||² + ||Qᵢ||²)
```

使用**随机梯度下降（SGD）** 优化：

```java
for (int iter = 0; iter < maxIter; iter++) {
    for (each rating Rᵤᵢ) {
        double err = Rᵤᵢ - dot(P[u], Q[i]);
        for (int k = 0; k < K; k++) {
            P[u][k] += lr * (err * Q[i][k] - reg * P[u][k]);
            Q[i][k] += lr * (err * P[u][k] - reg * Q[i][k]);
        }
    }
}
```

### 18.2.2 基于内容的过滤（Content-Based Filtering）

不需要其他用户的行为，根据**物品本身的特征**和**用户的历史偏好**做推荐。

**余弦相似度（Cosine Similarity）：**

```
cos(A, B) = (A · B) / (||A|| × ||B||)
```

适用于文本特征（TF-IDF 向量）的比较。

**Jaccard 相似度：**

```
J(A, B) = |A ∩ B| / |A ∪ B|
```

适用于类别标签、关键词等集合特征。

**基于内容的推荐流程：**

1. 对物品提取特征（关键词、分类、标签等）
2. 根据用户历史好评的物品，构建用户画像向量
3. 计算候选物品与用户画像的相似度
4. 推荐 Top-N

**优点：** 无冷启动问题（新物品立即可以被推荐）
**缺点：** 推荐结果多样性差（永远推荐和过去类似的物品）

### 18.2.3 混合推荐（Hybrid Approaches）

结合协同过滤和基于内容推荐的优点：

1. **加权融合：** `score = α × CF_score + (1-α) × CBF_score`
2. **切换策略：** 有足够协同过滤数据时用 CF，否则用 CBF
3. **特征融合：** 将 CF 中的隐因子和 CBF 中的内容特征一起作为输入
4. **级联模型：** 用 CBF 做粗排，CF 做精排

**工业级推荐系统的典型架构：**

```
召回（Recall）→ 粗排（Coarse Ranking）→ 精排（Fine Ranking）→ 重排（ReRanking）
```
- **召回阶段：** 多路召回（CF、CBF、热门、社交关系……），从百万级候选降到千级
- **粗排阶段：** 轻量模型，千级降到百级
- **精排阶段：** 复杂模型（GBDT、Wide&Deep、DIN），百级排序
- **重排阶段：** 业务规则（多样性、去重、打散）

---

## 18.3 分布式算法基础

### 18.3.1 CAP 定理

分布式系统无法同时满足三个特性：

| 特性 | 含义 | 类比 |
|:--|:--|:--|
| **C**onsistency（一致性） | 所有节点在同一时刻看到相同的数据 | 银行账户余额永不错 |
| **A**vailability（可用性） | 每个请求都能得到（非错误的）响应 | 系统永远在线 |
| **P**artition Tolerance（分区容忍性） | 网络分区时系统仍能正常工作 | 电缆断了仍服务 |

**CAP 选择策略：**
- **CP 系统**（牺牲可用性）：ZooKeeper、etcd
- **AP 系统**（牺牲一致性）：Cassandra、DynamoDB
- **CA 系统**（实际上不存在，因为网络分区必然发生）

**实际工程中是 "P 必选，C 和 A 做权衡"。** 在网络分区发生时，要么停止写入保持一致性（CP），要么继续写入但允许短暂不一致（AP）。

### 18.3.2 一致性哈希（Consistent Hashing）

**解决什么问题：** 分布式缓存中，服务器增删时最小化数据迁移量。

**传统哈希的问题：** hash(key) % N，当 N 变化时几乎所有 key 都需要迁移。

**一致性哈希方案：**

1. 将哈希值空间映射为一个环（0 ~ 2³²-1）
2. 服务器节点按哈希值分布在环上
3. 每个 key 分配到顺时针第一个节点

```
        节点A
    ↙         ↘
  0             2³²-1
    ↘         ↗
        节点B
```

**节点增删的影响：** 只影响环上相邻节点之间的数据，平均迁移量仅 1/N。

**虚拟节点（Virtual Nodes）：**

为了解决真实节点在环上分布不均匀的问题，每个物理节点映射到多个虚拟节点（如 150 个），使负载更均衡。

```java
// 例：一致性哈希的查找
TreeMap<Integer, String> ring = new TreeMap<>();

void addNode(String node, int vnodes) {
    for (int i = 0; i < vnodes; i++)
        ring.put(hash(node + "#" + i), node);
}

String getNode(String key) {
    int h = hash(key);
    Map.Entry<Integer, String> entry = ring.ceilingEntry(h);
    if (entry == null) entry = ring.firstEntry();  // 环回
    return entry.getValue();
}
```

### 18.3.3 流言协议（Gossip Protocol）

用于分布式系统中的信息传播，如 Cassandra 的节点间状态同步。

**流言传播原理（类似病毒传播）：**

每个周期，每个节点随机选择 f 个其他节点，交换各自知道的信息：

```
P(t) = 1 / (1 + (N - 1) × e^(-β×f×t))
```

其中 P(t) 是 t 个周期后的知情节点比例，β 是传播速率。

**特性：**
- **去中心化：** 没有单点故障
- **容错性：** 部分节点失效不影响传播
- **最终一致性：** 保证所有节点最终收到信息
- **可控的负载：** 通过 f（每次通信的节点数）控制带宽消耗

**反熵（Anti-Entropy）：** 定期用 Gossip 同步节点之间的数据差异，确保最终一致。

### 18.3.4 Raft 共识算法

Raft 是 Paxos 的简化版本，用于在分布式系统中达成共识。

**核心概念：**

| 角色 | 职责 |
|:--|:--|
| Leader（领导者） | 处理所有客户端请求，管理日志复制 |
| Follower（跟随者） | 被动接受 Leader 的日志复制 |
| Candidate（候选人） | Leader 选举过程中的过渡角色 |

**Leader 选举：**

1. Follower 在选举超时（150-300ms 随机）内未收到 Leader 心跳，转为 Candidate
2. Candidate 递增 term，向所有节点发起投票请求
3. 获得多数（N/2 + 1）投票的 Candidate 成为 Leader
4. Leader 开始定期发送心跳维持权威

**日志复制：**

```
Client → Leader → Follower₁, Follower₂, Follower₃
                  ↓ (多数确认)
                 提交状态机
```

每个日志条目包含命令和 term 号。Leader 将日志复制到所有 Follower，多数节点写入成功后即提交。

**安全性保证：** Raft 保证一个 term 内只有一个 Leader；日志的一致性通过 Leader 强制 Follower 匹配自己的日志来保证。

### 18.3.5 分布式事务

**两阶段提交（2PC, Two-Phase Commit）：**

| 阶段 | 协调者 | 参与者 |
|:--|:--|:--|
| Phase 1: Prepare | 问所有参与者"准备好提交？" | 回应 Yes/No |
| Phase 2: Commit | 根据回应决定 Commit/Rollback | 执行并确认 |

**问题：** 协调者是单点故障；Phase 2 期间参与者阻塞。

**Paxos：** 更通用的共识协议，不阻塞、容错。但实现极为复杂（即使是 Google 的工程师也承认 Paxos 难以理解——因此有了 Raft）。

**现实权衡：** 大多数互联网公司放弃分布式事务，采用**最终一致性** + **补偿事务（Saga 模式）**。

---

## 18.4 大数据算法思想

当数据量远超内存容量时，传统算法失效。大数据算法设计的核心思想是：**用近似换取速度，用概率换取空间。**

### 18.4.1 草图算法（Sketch Algorithms）

**Bloom Filter（布隆过滤器）**

判断一个元素是否在集合中，用空间换准确性：

```
数据结构：长度为 m 的 bitset + k 个哈希函数
add(x):     对 x 计算 k 个哈希，将对应位设为 1
mightContain(x): 检查 k 位是否全为 1
```

| 特性 | 说明 |
|:--|:--|
| 空间 | 每个元素约 2-10 bits（远小于存储完整元素） |
| 假阳性 | 可能误判元素存在（"在"不一定真在） |
| 假阴性 | 不会漏判（"不在"一定不在） |
| 不可删除 | 标准 Bloom Filter 不支持删除 |

**假阳性率：** `p ≈ (1 - e^(-k×n/m))^k`

**Count-Min Sketch（CMS）**

用于频率估计，回答"元素 x 出现了多少次？"

```
数据结构：d 行 × w 列的二维计数数组
add(x, count): 对每行，用哈希定位并加上 count
estimate(x):   取所有行中最小值作为估计值
```

**特性：** 总是高估（不会低估），误差范围可控。

**HyperLogLog（HLL）**

用于基数估计，回答"集合中有多少个不同的元素？"

```
空间复杂度：O(log log N)——约 1.5KB 即可估计 10⁹ 个元素的基数
精度：约 2% 的相对误差
```

**核心思想：** 用哈希函数值中前导零的最大数量来估计基数。出现长前导零序列的概率很小，因此观察到长序列表明元素数量多。

**应用场景：**
- Redis 中的 `PFADD` / `PFCOUNT` 命令
- 大规模网站的 UV（独立访客）统计
- 数据库的 DISTINCT 近似查询

### 18.4.2 采样（Sampling）

**蓄水池采样（Reservoir Sampling）**

从长度为 N（未知且可能巨大）的流中随机均匀抽取 k 个元素，一次遍历，O(k) 空间。

```java
int[] reservoir = new int[k];
for (int i = 0; i < k; i++) reservoir[i] = stream[i];  // 先填满
for (int i = k; i < N; i++) {
    int j = random.nextInt(i + 1);  // [0, i] 之间随机
    if (j < k) reservoir[j] = stream[i];  // 以 k/i 概率替换
}
```

**为什么正确：** 每个元素留在蓄水池中的概率始终是 k/N。

**加权采样：** 当元素有不同的重要性权重时，可以使用 Alias Method 或逆变换法。

### 18.4.3 在线算法（Online Algorithms）

在线算法的特点是：**输入是逐步到达的，必须在不知未来数据的情况下做出决定。**

**在线学习（Online Learning）：**

与批处理（batch）学习不同，在线学习在处理每个样本后立即更新模型：

```java
// 在线梯度下降
for (each training sample (x, y)) {
    double pred = dot(weights, x);
    double loss = pred - y;
    for (int j = 0; j < d; j++)
        weights[j] -= lr * loss * x[j];  // 立即更新
}
```

**遗憾最小化（Regret Minimization）：**

在线算法的好坏通过遗憾值衡量——与离线最优策略的差距：

```
Regret(T) = 算法累计损失 - 离线最优损失
```

| 算法 | 遗憾界 | 适用场景 |
|:--|:--|:--|
| Follow the Leader | O(log T) | 凸损失 |
| Hedge / MWU | O(√T log N) | 专家建议组合 |
| UCB（上置信界） | O(log T) | 多臂老虎机 |
| Thompson Sampling | O(√T) | 贝叶斯方法 |

**MAB（Multi-Armed Bandit）问题：** 用户访问网站时，推荐哪篇文章点击率最高？同时面对探索（exploration——尝试新文章）和利用（exploitation——推荐已知高点击率文章）的权衡。

### 18.4.4 外部存储算法

当数据无法完全载入内存时，需要最小化磁盘 I/O 次数。

**B-树：**

相比二叉搜索树，B-树的一个节点可以包含成百上千个键值对，极大减少磁盘 I/O。

```
每个节点：最多 M 个子节点
树高度：O(log_M N)
搜索一次：O(log_M N) 次磁盘 I/O
```

| 特性 | 二叉搜索树 | B-树（M=1000） |
|:--|:--|:--|
| 高度（N=10⁶） | 20 | 2 |
| 高度（N=10⁹） | 30 | 3 |
| 磁盘 I/O | 20-30 次 | 2-3 次 |

**外部排序（External Sort）：**

处理无法一次载入内存的大文件排序：

1. **分割阶段：** 将大文件分成若干块，每块可载入内存，排序后写回
2. **归并阶段：** 多路归并（使用堆），边读取边归并输出

```
总 I/O 代价：O(n × (1 + log_M (n/M)))
其中 n = 总记录数，M = 内存可装记录数
```

**典型实现：**

```java
// Phase 1: 生成有序的临时文件
List<File> sortedRuns = new ArrayList<>();
while (inputFile.hasMore()) {
    Record[] chunk = inputFile.readNextChunk(MEM_SIZE);
    Arrays.sort(chunk);  // 内存排序
    File temp = writeToTempFile(chunk);
    sortedRuns.add(temp);
}

// Phase 2: 多路归并
PriorityQueue<BufferedReader> heap = merge(sortedRuns);
while (heap is not empty) {
    outputFile.write(heap.poll().readLine());
}
```

---

## 本章小结

真实世界的算法远比教科书复杂，不是因为原理更难，而是因为**工程约束**：

1. **数据量太大**，内存装不下——需要用分布式、流式、近似算法
2. **数据分布不均**，算法需要稳健——需要处理数据倾斜、长尾分布
3. **系统不能停**，需要容错——共识协议、副本机制至关重要
4. **变化随时发生**，算法需要自适应——在线学习、增量更新

本章介绍的技术——PageRank、协同过滤、一致性哈希、Raft、Bloom Filter——是工业界经过大量工程实践验证的经典方法。理解它们的核心思想和适用场景，远比背诵实现细节更有价值。

这是本书的最后一章。从第 1 章的基本概念到第 18 章的大数据算法，我们走完了从算法理论到工程实践的完整旅程。希望这本书能成为你算法之路上的一盏灯，指引方向但不止于路标。真正的学习，从关上书开始。