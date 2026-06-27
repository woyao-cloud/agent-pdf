# 第4章 图数据库存储引擎：从邻接表到原生图存储

## 4.1 概述

关系数据库用表存数据，用索引加速查询。图数据库面对的是另一组问题：给定一个顶点，找到它的所有邻居；沿着边遍历任意深度；在毫秒级响应"朋友的朋友最近买了什么"这类查询。这些操作的共同特征是**指针追逐**（pointer chasing）——数据访问模式不是顺序扫描，而是沿着引用链随机跳跃。传统 B+Tree 和行存储为此付出了巨大的 IO 代价。

本章深入图数据库的存储引擎层，从最基础的邻接表设计开始，逐步深入到 CSR 格式、分布式分区策略、原生 vs 非原生存储的工程取舍，最后讨论 WAL 和内存管理。目标是让读者理解：**图数据库的"快"不是魔法，而是存储格式对图访问模式的精确匹配**。

---

## 4.2 邻接表存储与索引设计

### 4.2.1 解决的问题

图的核心操作是"给定一个顶点，找到它的所有出边/入边"。邻接表（Adjacency List）是最直观的解决方案：为每个顶点维护一个邻居列表。问题在于：

- 列表存在哪里？行存、列存、还是专用文件？
- 如何支持双向遍历（出边和入边）？
- 如何高效支持属性过滤（"找到年龄 > 30 的朋友"）？
- 如何避免"邻居列表"成为热点写冲突点？

### 4.2.2 核心原理

邻接表的核心数据结构极其简单：

```
Vertex A -> [Vertex B, Vertex C, Vertex D]
Vertex B -> [Vertex A, Vertex E]
```

在工程实现中，每个顶点维护两个列表：出边列表（adjacency list）和入边列表（inverse adjacency list）。每条边除了指向目标顶点外，还携带边 ID、边类型、属性指针等元数据。

存储层面的核心挑战是**列表的物理布局**。有三种主流策略：

| 策略 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| 内联存储 | 邻居列表直接嵌入顶点记录 | 一次 IO 拿到顶点和邻居 | 顶点大小不固定，更新代价高 |
| 分离链表 | 邻居列表存储在独立链表中 | 更新灵活 | 指针追逐导致随机 IO |
| 块数组 | 邻居列表存储在连续块中，块之间用指针链接 | 兼顾局部性和灵活性 | 实现复杂 |

### 4.2.3 代码/配置实现

以下是一个简化的邻接表存储引擎实现，展示了核心读写路径：

```java
public class AdjacencyListStore implements AutoCloseable {

    // 顶点记录：固定大小 24 字节
    // [vertexId: long][firstAdjOffset: long][propertyPtr: long]
    private static final int VERTEX_RECORD_SIZE = 24;

    // 邻接记录：固定大小 32 字节
    // [vertexId: long][edgeType: int][nextOffset: long][propertyPtr: long]
    private static final int ADJ_RECORD_SIZE = 32;

    private final RandomAccessFile vertexFile;
    private final RandomAccessFile adjFile;
    private final Long2LongOpenHashMap vertexIndex = new Long2LongOpenHashMap();

    public AdjacencyListStore(String path) throws IOException {
        this.vertexFile = new RandomAccessFile(path + "/vertices.db", "rw");
        this.adjFile = new RandomAccessFile(path + "/adjacency.db", "rw");
        vertexIndex.defaultReturnValue(-1L);
        loadIndex();
    }

    public void addVertex(long vertexId, long propertyPtr) throws IOException {
        long offset = vertexFile.length();
        vertexFile.seek(offset);
        vertexFile.writeLong(vertexId);
        vertexFile.writeLong(-1L); // firstAdjOffset, -1 means empty
        vertexFile.writeLong(propertyPtr);
        vertexIndex.put(vertexId, offset);
    }

    public void addEdge(long fromId, long toId, int edgeType) throws IOException {
        long fromOffset = vertexIndex.get(fromId);
        if (fromOffset == -1L) throw new IllegalArgumentException("Vertex not found: " + fromId);

        // 读取顶点记录，获取当前邻接表头指针
        vertexFile.seek(fromOffset + 8);
        long firstAdj = vertexFile.readLong();

        // 追加邻接记录到 adjFile
        long adjOffset = adjFile.length();
        adjFile.seek(adjOffset);
        adjFile.writeLong(toId);
        adjFile.writeInt(edgeType);
        adjFile.writeLong(firstAdj); // 头插法：新记录指向旧的头
        adjFile.writeLong(-1L);     // propertyPtr

        // 更新顶点记录的 firstAdjOffset
        vertexFile.seek(fromOffset + 8);
        vertexFile.writeLong(adjOffset);
    }

    public LongArrayList getNeighbors(long vertexId) throws IOException {
        long offset = vertexIndex.get(vertexId);
        if (offset == -1L) return new LongArrayList();

        vertexFile.seek(offset + 8);
        long adjOffset = vertexFile.readLong();

        LongArrayList neighbors = new LongArrayList();
        while (adjOffset != -1L) {
            adjFile.seek(adjOffset);
            long neighborId = adjFile.readLong();
            neighbors.add(neighborId);
            adjFile.seek(adjOffset + 12); // skip edgeType(4) + nextOffset(8)
            adjOffset = adjFile.readLong(); // nextOffset
        }
        return neighbors;
    }

    private void loadIndex() throws IOException {
        long len = vertexFile.length();
        long pos = 0;
        while (pos < len) {
            vertexFile.seek(pos);
            long id = vertexFile.readLong();
            vertexIndex.put(id, pos);
            pos += VERTEX_RECORD_SIZE;
        }
    }

    @Override
    public void close() throws Exception {
        vertexFile.close();
        adjFile.close();
    }
}
```

**关键设计决策**：

1. **头插法链表**：新边插入到邻接表头部，O(1) 写入，无需遍历。遍历时按时间逆序。
2. **固定大小记录**：顶点和邻接记录都是固定大小，支持直接寻址（O(1) 定位）。
3. **内存索引**：vertexId → fileOffset 的映射放在内存中，避免遍历顶点文件。

### 4.2.4 使用场景

- **OLTP 型图查询**：社交网络中的"获取好友列表"、知识图谱中的"查询实体关系"。
- **小图或中等规模图**（百万顶点级别），单机内存可容纳索引。
- **写多读少场景**：头插法链表写入极快，适合事件流式图构建。

### 4.2.5 潜在风险与注意事项

1. **链表遍历的随机 IO**：邻接记录在文件中物理不连续，遍历 N 个邻居需要 N 次随机磁盘读取。当邻接表很大时性能急剧下降。
2. **索引内存消耗**：每个顶点占用一个 long（8 字节），10 亿顶点需要 8GB 内存仅存索引。
3. **无事务支持**：上述实现没有 WAL，崩溃后文件可能损坏。
4. **无并发控制**：多线程写入会导致数据竞争。

### 4.2.6 本章小结

邻接表是图存储最直观的方案，头插法链表实现了 O(1) 写入。但链表式的物理布局导致遍历时大量随机 IO，这是后续 CSR 格式要解决的核心问题。

---

## 4.3 CSR（Compressed Sparse Row）格式

### 4.3.1 解决的问题

邻接表的链表实现有两个致命问题：
1. **缓存不友好**：邻居节点在内存中分散，遍历时 CPU 缓存命中率极低。
2. **空间开销**：每个邻接记录需要存储 next 指针，额外占用 8 字节。

CSR 格式来自稀疏矩阵计算领域，将图表示为两个紧密排列的数组，彻底消除指针开销，实现**顺序内存访问**。

### 4.3.2 核心原理

CSR 用两个数组表示一个有向图：

- **`offsets[]`**：长度为 `|V| + 1`，`offsets[i]` 表示顶点 i 的邻居在 `edges[]` 中的起始位置。`offsets[i+1] - offsets[i]` 就是顶点 i 的出度。
- **`edges[]`**：长度为 `|E|`，按顶点顺序紧密排列所有邻居 ID。

对于无向图，每条边存储两次（一次作为出边，一次作为入边）。

**内存布局示例**：

```
顶点:       0      1      2      3
offsets: [0, 2, 4, 7, 9]
edges:   [1, 2, 0, 3, 0, 1, 3, 1, 2]
         |--0--|--1--|----2----|--3--|
```

顶点 0 的邻居：edges[0..2) = [1, 2]
顶点 2 的邻居：edges[4..7) = [0, 1, 3]

**遍历顶点 2 的所有邻居**：

```java
int start = offsets[2];   // 4
int end = offsets[3];     // 7
for (int i = start; i < end; i++) {
    int neighbor = edges[i];
    // 处理邻居
}
```

这个循环是**完全顺序的**内存访问，CPU 预取器可以完美预测，L1/L2 缓存命中率接近 100%。

### 4.3.3 代码/配置实现

#### 基础 CSR 构建与遍历

```java
public class CSRGraph {
    private final int[] offsets;   // [V+1]
    private final int[] edges;     // [E]

    public CSRGraph(int[][] adjacencyList) {
        int vCount = adjacencyList.length;
        int eCount = 0;
        for (int[] neighbors : adjacencyList) {
            eCount += neighbors.length;
        }

        offsets = new int[vCount + 1];
        edges = new int[eCount];

        int pos = 0;
        for (int v = 0; v < vCount; v++) {
            offsets[v] = pos;
            int[] neighbors = adjacencyList[v];
            System.arraycopy(neighbors, 0, edges, pos, neighbors.length);
            pos += neighbors.length;
        }
        offsets[vCount] = eCount;
    }

    public int degree(int vertex) {
        return offsets[vertex + 1] - offsets[vertex];
    }

    public void forEachNeighbor(int vertex, IntConsumer consumer) {
        int start = offsets[vertex];
        int end = offsets[vertex + 1];
        for (int i = start; i < end; i++) {
            consumer.accept(edges[i]);
        }
    }

    public int[] neighbors(int vertex) {
        int start = offsets[vertex];
        int end = offsets[vertex + 1];
        return Arrays.copyOfRange(edges, start, end);
    }
}
```

#### 带权重的 CSR

```java
public class WeightedCSRGraph {
    private final int[] offsets;
    private final int[] edges;
    private final float[] weights;

    public WeightedCSRGraph(int[][] adjacencyList, float[][] weightList) {
        int vCount = adjacencyList.length;
        int eCount = 0;
        for (int[] neighbors : adjacencyList) eCount += neighbors.length;

        offsets = new int[vCount + 1];
        edges = new int[eCount];
        weights = new float[eCount];

        int pos = 0;
        for (int v = 0; v < vCount; v++) {
            offsets[v] = pos;
            int[] ns = adjacencyList[v];
            float[] ws = weightList[v];
            for (int i = 0; i < ns.length; i++) {
                edges[pos] = ns[i];
                weights[pos] = ws[i];
                pos++;
            }
        }
        offsets[vCount] = eCount;
    }

    public void forEachEdge(int vertex, BiConsumer<Integer, Float> consumer) {
        int start = offsets[vertex];
        int end = offsets[vertex + 1];
        for (int i = start; i < end; i++) {
            consumer.accept(edges[i], weights[i]);
        }
    }
}
```

#### 支持动态更新的分段 CSR

CSR 的致命弱点是**静态**——构建后无法高效增删边。分段 CSR（Doug Lea 在 JSR-166 中提出的思路）通过预留空隙解决：

```java
public class SegmentedCSR {
    private static final int SEGMENT_SIZE = 64;

    private final int[] offsets;       // [V+1]
    private final int[] edges;         // [E + slack]
    private final int[] nextFree;      // 每个顶点的下一个空闲槽

    public SegmentedCSR(int vCount, int eCount, double slackFactor) {
        int totalSlots = (int)(eCount * (1 + slackFactor));
        offsets = new int[vCount + 1];
        edges = new int[totalSlots];
        nextFree = new int[vCount];
        Arrays.fill(edges, -1);
    }

    public boolean addEdge(int from, int to) {
        int slot = nextFree[from];
        if (slot < offsets[from + 1]) {
            edges[slot] = to;
            nextFree[from] = slot + 1;
            return true;
        }
        // 需要重新平衡（compact + expand）
        return rebalanceAndInsert(from, to);
    }

    private boolean rebalanceAndInsert(int from, int to) {
        // 将 edges[offsets[from]..offsets[from+1]) 压缩到连续区域
        // 然后扩展预留空间
        // 实际实现需要处理后续顶点的偏移量更新
        throw new UnsupportedOperationException("Compact + expand needed");
    }

    public void forEachNeighbor(int vertex, IntConsumer consumer) {
        int end = nextFree[vertex];
        for (int i = offsets[vertex]; i < end; i++) {
            int n = edges[i];
            if (n != -1) consumer.accept(n);
        }
    }
}
```

### 4.3.4 使用场景

- **BFS/DFS 遍历**：CSR 的顺序内存访问使 BFS 吞吐量达到每秒数亿条边。
- **PageRank、Label Propagation 等迭代算法**：每轮迭代只需顺序扫描 edges[] 数组。
- **只读或批量加载场景**：图构建后很少修改（如知识图谱、静态社交网络分析）。
- **GPU 图计算**：CSR 是 cuGraph、Gunrock 等 GPU 图框架的标准输入格式。

### 4.3.5 潜在风险与注意事项

1. **更新代价高**：插入一条边可能需要移动大量数据。动态图需要分段 CSR 或 Log-structured 变体。
2. **只支持整数顶点 ID**：需要额外的映射层（String → int）。
3. **无属性存储**：CSR 只存拓扑，属性需要额外的数组或外部存储。
4. **内存占用**：即使压缩，edges[] 数组仍需要 4|E| 字节（int 类型）。对于超大规模图，需要分页或 mmap。

### 4.3.6 本章小结

CSR 是图存储格式的"黄金标准"——用两个紧密数组实现了理论最优的遍历性能。代价是静态性和更新困难。实际图数据库（如 Neo4j 的底层存储）在 CSR 基础上增加了可变长记录和空闲列表管理，实现了"CSR 的遍历性能 + 邻接表的更新灵活性"。

---

## 4.4 图分区策略：分布式存储的核心挑战

### 4.4.1 解决的问题

当一张图无法放入单机内存时，需要将图切分到多台机器。图分区与关系数据库分片有本质区别：关系表的分片键通常是独立的（如 user_id % N），但图的一条边连接的两个顶点可能被分到不同机器，导致**跨分区查询**成为性能瓶颈。

### 4.4.2 核心原理

#### 边切分（Edge-Cut）vs 顶点切分（Vertex-Cut）

**边切分**：每个顶点只属于一个分区，边可能跨分区。

```
分区 1: {A, B, C}    分区 2: {D, E, F}
边: A→B (本地), A→D (跨分区)
```

- 优点：顶点属性只需存储一份，查询顶点时无网络开销。
- 缺点：跨分区边导致遍历时需要远程调用；幂律图中高度顶点（如 Twitter 的大 V）的边会大量跨分区。

**顶点切分**：每条边只属于一个分区，顶点可能出现在多个分区。

```
分区 1: 边 A→B, A→C   分区 2: 边 A→D, B→E
顶点 A 在分区 1 和 2 都有副本
```

- 优点：边遍历完全本地，无跨分区通信。
- 缺点：高度顶点的副本同步开销大；顶点属性多副本一致性复杂。

| 维度 | Edge-Cut | Vertex-Cut |
|------|----------|------------|
| 典型系统 | Neo4j Fabric, JanusGraph | PowerGraph, GraphLab |
| 通信模式 | 遍历时跨分区 | 顶点更新时跨分区 |
| 幂律图表现 | 差（高度顶点成为通信热点） | 好（边均匀分布） |
| 一致性代价 | 低（顶点单副本） | 高（顶点多副本） |

#### 哈希分区 vs 范围分区

**哈希分区**：`partition = hash(vertexId) % N`

- 优点：实现简单，数据均匀分布。
- 缺点：破坏了图的局部性——相邻顶点大概率在不同分区。

**范围分区**：按顶点 ID 范围划分（如 0-1M → P1, 1M-2M → P2）

- 优点：如果顶点 ID 分配保持了局部性（如广度优先分配），相邻顶点在同一分区。
- 缺点：ID 分配策略至关重要；热点分区问题。

#### Metis 与高级分区算法

Metis 是多级图分区算法的代表，流程如下：

1. **粗化阶段**：合并顶点和边，将原图逐步缩小为小图。
2. **初始分区**：在小图上用贪心算法做 k 路切分。
3. **细化阶段**：将分区映射回原图，用 KL（Kernighan-Lin）算法优化切边数。

```java
// 伪代码：Metis 风格分区
public class MetisPartitioner {
    public int[] partition(Graph graph, int numParts) {
        List<Graph> coarsened = new ArrayList<>();
        coarsened.add(graph);

        // Phase 1: Coarsening
        while (coarsened.getLast().vertexCount() > numParts * 100) {
            Graph coarse = heavyEdgeMatching(coarsened.getLast());
            coarsened.add(coarse);
        }

        // Phase 2: Initial partitioning
        Graph smallest = coarsened.getLast();
        int[] partition = greedyBisect(smallest, numParts);

        // Phase 3: Uncoarsening + refinement
        for (int i = coarsened.size() - 2; i >= 0; i--) {
            partition = projectPartition(partition, coarsened.get(i + 1), coarsened.get(i));
            partition = kernighanLinRefine(coarsened.get(i), partition, numParts);
        }

        return partition;
    }

    private Graph heavyEdgeMatching(Graph g) {
        // 找到权重最大的边进行顶点合并
        // 返回粗化后的图
        return null; // 简化
    }
}
```

### 4.4.3 配置实现

JanusGraph 的哈希分区配置：

```properties
# janusgraph-cassandra.properties
storage.backend=cassandra
storage.hostname=192.168.1.10,192.168.1.11,192.168.1.12

# 分区策略
cluster.partition=true
storage.disk-optimized=true

# 顶点分区
ids.block-size=10000
ids.renew-timeout=3600000

# 缓存
cache.db-cache=true
cache.db-cache-clean-wait=20
cache.db-cache-time=180000
```

Neo4j Fabric 的联邦分区配置（Cypher）：

```cypher
// 创建两个分片
CREATE DATABASE shard1 ON "/data/shard1";
CREATE DATABASE shard2 ON "/data/shard2";

// 配置 Fabric 数据库
CREATE DATABASE fabric {
    OPTIONS {
        "fabric.database.name": "graph",
        "fabric.graph.0.database": "shard1",
        "fabric.graph.1.database": "shard2"
    }
};

// 查询时自动路由
USE fabric.graph;
MATCH (u:User)-[:FRIEND]->(f:User)
WHERE u.id = 42
RETURN f.name;
```

### 4.4.4 使用场景

| 分区策略 | 适用场景 |
|----------|----------|
| 哈希分区 | 均匀随机图、OLTP 点查为主 |
| 范围分区 | 顶点 ID 有序、范围扫描频繁 |
| Metis 分区 | 离线分析、PageRank、批量计算 |
| Vertex-Cut | 幂律图、社交网络大 V 场景 |

### 4.4.5 潜在风险与注意事项

1. **跨分区查询放大**：BFS 每层都可能跨分区，深度 6 的 BFS 可能产生指数级跨分区请求。
2. **数据倾斜**：幂律图中少数顶点拥有大部分边，哈希分区无法解决。
3. **重分区代价**：图增长后需要重新分区，数据迁移成本极高。
4. **事务边界**：跨分区事务需要两阶段提交（2PC），性能急剧下降。

### 4.4.6 本章小结

没有完美的分区策略。Edge-Cut 适合遍历密集型负载，Vertex-Cut 适合幂律图。哈希分区简单但局部性差，Metis 局部性好但离线。实际系统通常组合使用：在线查询用哈希分区保证均匀，离线分析用 Metis 重分区。

---

## 4.5 原生图存储 vs 非原生存储

### 4.5.1 解决的问题

"图数据库"这个标签下隐藏着一个根本分歧：**数据到底应该以什么格式存在磁盘上？**

- **原生图存储**：磁盘上的记录格式直接对应图模型——顶点记录、边记录、属性记录，通过文件内偏移量（pointer）连接。
- **非原生存储**：图数据映射到关系表或键值对，通过二级索引模拟图遍历。

这个选择决定了查询性能的 10-100 倍差距。

### 4.5.2 核心原理

#### Neo4j 原生存储文件

Neo4j 的每个数据库包含一组固定大小的记录文件：

```
neostore.nodestore.db      — 顶点记录，固定 15 字节
neostore.relationshipstore.db — 边记录，固定 34 字节  
neostore.propertystore.db   — 属性记录，固定 41 字节
neostore.labelstore.db      — 标签记录
```

**顶点记录（15 字节）**：

```
[inUse:1B][firstRel:4B][firstProp:4B][label:5B][extra:1B]
```

- `inUse`：是否被使用（支持删除后复用）
- `firstRel`：第一条关系记录的 ID（文件偏移量）
- `firstProp`：第一条属性记录的 ID
- `label`：标签编码

**边记录（34 字节）**：

```
[inUse:1B][firstNode:4B][secondNode:4B][relType:4B]
[firstPrev:4B][firstNext:4B][secondPrev:4B][secondNext:4B]
[firstProp:4B][nextProp:1B]
```

关键设计：每条边记录同时属于两个双向链表——以 firstNode 为起点的链表和以 secondNode 为终点的链表。`firstPrev`/`firstNext` 是起点视角的前驱/后继，`secondPrev`/`secondNext` 是终点视角的。

**遍历示例**：查找顶点 A 的所有出边

```java
public class Neo4jStyleTraversal {
    private static final int NODE_RECORD_SIZE = 15;
    private static final int REL_RECORD_SIZE = 34;

    // 关系记录字段偏移
    private static final int REL_FIRST_NODE = 1;
    private static final int REL_SECOND_NODE = 5;
    private static final int REL_FIRST_NEXT = 13;  // 从 firstNode 视角的下一条边

    private final RandomAccessFile relStore;

    public Neo4jStyleTraversal(String path) throws IOException {
        this.relStore = new RandomAccessFile(path + "/neostore.relationshipstore.db", "r");
    }

    public void traverseOutgoing(long nodeId, BiConsumer<Long, Long> edgeConsumer) throws IOException {
        // 读取顶点的 firstRel
        long relId = getFirstRel(nodeId);
        while (relId != -1L) {
            long offset = relId * REL_RECORD_SIZE;
            relStore.seek(offset + REL_FIRST_NODE);
            long firstNode = relStore.readInt() & 0xFFFFFFFFL;
            long secondNode = relStore.readInt() & 0xFFFFFFFFL;

            if (firstNode == nodeId) {
                edgeConsumer.accept(secondNode, relId);
                // 沿着 firstNext 前进
                relStore.seek(offset + REL_FIRST_NEXT);
                relId = relStore.readInt() & 0xFFFFFFFFL;
            } else {
                // 这是入边，沿着 secondNext 前进
                edgeConsumer.accept(firstNode, relId);
                relStore.seek(offset + 17); // secondNext offset
                relId = relStore.readInt() & 0xFFFFFFFFL;
            }
        }
    }

    private long getFirstRel(long nodeId) throws IOException {
        long offset = nodeId * NODE_RECORD_SIZE + 1; // skip inUse
        // 实际实现需要读取 nodestore.db
        return 0; // 简化
    }
}
```

**指针追逐的代价与收益**：

```
遍历深度 3 的 BFS：
  Neo4j 原生: 3 次随机读（每次读一个记录页）
  MySQL + 邻接表: 3 次 B+Tree 索引查找（每次 3-4 层）≈ 9-12 次随机读
```

在 HDD 上，随机 IO 的代价是 10ms/次，差距是 90ms vs 30ms。在 SSD 上差距缩小（0.1ms/次），但 B+Tree 的放大效应仍然存在。

#### JanusGraph 在 Cassandra 上的存储

JanusGraph 将图映射到 Cassandra 的宽行（wide row）：

```
Row Key (vertexId) → Column Names (edge label + neighborId) → Column Value (edge properties)
```

Cassandra 的存储布局：

```
=== 顶点 42 的行 ===
Column: friend/100    → Value: {since: 2020}
Column: friend/200    → Value: {since: 2019}
Column: follow/300    → Value: {timestamp: 1680000000}
Column: follow/400    → Value: {timestamp: 1680000001}

=== 顶点 100 的行 ===
Column: friend/42     → Value: {since: 2020}   // 反向边
Column: follow/500    → Value: {timestamp: 1680000002}
```

**查询"顶点 42 的所有朋友"**：

```java
// Cassandra CQL
SELECT * FROM janusgraph.edgestore
WHERE vertex_id = 42
  AND column_name >= 'friend/'
  AND column_name < 'friend0';  // 前缀扫描
```

Cassandra 的 SSTable 存储使这个扫描是顺序的——所有 `friend/` 前缀的列在 SSTable 中物理连续。

### 4.5.3 代码/配置实现

#### Neo4j 存储文件配置

```properties
# neo4j.conf
# 存储文件位置
dbms.directories.data=/data/neo4j/data

# 记录文件配置
dbms.record_format=standard
dbms.memory.pagecache.size=4G

# 关系分组（relationship group）——优化超节点
dbms.relationship_grouping_threshold=10000

# 空闲列表空间复用
dbms.records.nodestore.allow_reuse=true
dbms.records.relationshipstore.allow_reuse=true
```

#### JanusGraph + Cassandra 配置

```properties
# janusgraph-hbase.properties
storage.backend=cassandra
storage.hostname=localhost

# 键空间和表配置
storage.cassandra.keyspace=janusgraph
storage.cassandra.read-consistency-level=LOCAL_QUORUM
storage.cassandra.write-consistency-level=LOCAL_QUORUM

# 存储后端优化
storage.lock.wait-time=10000
storage.lock.retries=10

# 索引后端
index.search.backend=elasticsearch
index.search.hostname=localhost
index.search.elasticsearch.client-only=true
```

### 4.5.4 使用场景

| 维度 | Neo4j 原生存储 | JanusGraph + Cassandra |
|------|---------------|----------------------|
| 遍历性能 | 极快（指针追逐） | 中等（宽行扫描） |
| 水平扩展 | 有限（Fabric 联邦） | 优秀（Cassandra 原生分布式） |
| 事务 | ACID（单机） | 最终一致性 |
| 存储效率 | 高（固定大小记录） | 低（宽行 + 反向边冗余） |
| 适合负载 | OLTP 深度遍历 | OLAP 大规模图分析 |

### 4.5.5 潜在风险与注意事项

1. **Neo4j 的指针追逐在 SSD 上优势缩小**：SSD 的随机读延迟约 0.1ms，B+Tree 的 3 层查找约 0.3ms，差距从 10 倍缩小到 3 倍。
2. **JanusGraph 的反向边存储放大**：每条无向边存储两次，存储量翻倍。
3. **Cassandra 的宽行限制**：单行超过 100MB 时性能下降，超节点（百万级邻居）需要特殊处理。
4. **Neo4j 的存储文件碎片化**：频繁删除和插入导致空闲列表碎片，需要定期 `store rebuild`。

### 4.5.6 本章小结

原生图存储的核心优势是**无索引的指针追逐**——边记录直接包含文件偏移量，不需要 B+Tree 或哈希索引的中间查找。非原生存储的优势是**复用成熟分布式系统**。选择取决于负载：深度遍历密集型选原生，大规模分布式选非原生 + 宽行存储。

---

## 4.6 图数据库索引策略

### 4.6.1 解决的问题

图遍历是"沿着边找邻居"，但很多查询需要**从属性出发**："找到所有名字叫 Alice 的用户"、"找到 2024 年之后创建的订单"。没有索引，这些查询需要全表扫描。

### 4.6.2 核心原理

#### 顶点中心索引（Vertex-Centric Index）

在顶点级别对边按属性排序，避免遍历所有边后再过滤：

```
顶点 A 的出边（按时间排序）：
  [2020-01] → B
  [2021-03] → C  
  [2023-07] → D
  [2024-12] → E

查询："A 在 2023 年之后的出边"
→ 二分查找定位到 [2023-07]，只扫描 D 和 E
```

Neo4j 的实现方式是在关系记录组（Relationship Group）内维护排序索引：

```cypher
// Neo4j 顶点中心索引
CREATE INDEX FOR ()-[r:ORDERED]-() ON (r.timestamp);
```

#### 复合索引（Composite Index）

多个属性的联合索引，用于精确匹配：

```java
// JanusGraph 复合索引
mgmt.buildIndex("byNameAndAge", Vertex.class)
    .addKey(mgmt.getPropertyKey("name"))
    .addKey(mgmt.getPropertyKey("age"))
    .buildCompositeIndex();
```

复合索引的查询模式必须是**前缀匹配**：

```cypher
// 有效：使用了 name 和 age
MATCH (u:User) WHERE u.name = "Alice" AND u.age = 30

// 有效：使用了 name（前缀匹配）
MATCH (u:User) WHERE u.name = "Alice"

// 无效：age 不是前缀，不会使用复合索引
MATCH (u:User) WHERE u.age = 30
```

#### 混合索引（Mixed Index）

混合索引将索引数据存储在外部系统（Elasticsearch、Solr），支持全文搜索、范围查询、模糊匹配：

```java
// JanusGraph 混合索引
mgmt.buildIndex("byNameAndAge", Vertex.class)
    .addKey(mgmt.getPropertyKey("name"))
    .addKey(mgmt.getPropertyKey("age"))
    .buildMixedIndex("search");
```

混合索引的查询能力：

```cypher
// 全文搜索
MATCH (u:User) WHERE u.name CONTAINS "Ali"

// 范围查询
MATCH (o:Order) WHERE o.amount > 1000

// 模糊匹配
MATCH (u:User) WHERE u.bio =~ ".*engineer.*"

// 地理空间查询
MATCH (l:Location) WHERE within(l.coord, GEO_WITHIN({radius: 10}))
```

#### 全文搜索索引

基于 Lucene/Elasticsearch 的倒排索引：

```java
// Neo4j 全文索引
CALL db.index.fulltext.createNodeIndex(
    "userSearch",      // 索引名
    ["User"],          // 标签
    ["name", "bio"]   // 属性
);

// 查询
CALL db.index.fulltext.queryNodes(
    "userSearch",
    "Alice OR engineer"
) YIELD node, score
RETURN node.name, score
ORDER BY score DESC;
```

### 4.6.3 配置实现

#### Neo4j 索引配置

```cypher
// 单属性索引
CREATE INDEX user_name IF NOT EXISTS FOR (u:User) ON (u.name);

// 复合索引
CREATE INDEX user_name_age IF NOT EXISTS FOR (u:User) ON (u.name, u.age);

// 全文索引
CREATE FULLTEXT INDEX userSearch IF NOT EXISTS
FOR (u:User) ON EACH [u.name, u.bio];

// 文本索引（支持前缀和包含查询）
CREATE TEXT INDEX user_description IF NOT EXISTS
FOR (u:User) ON (u.description);

// 点查索引（精确匹配）
CREATE POINT INDEX user_location IF NOT EXISTS
FOR (u:User) ON (u.location);
```

#### JanusGraph 索引 Schema

```java
// JanusGraph Schema API
GraphTraversalSource g = graph.traversal();
JanusGraphManagement mgmt = graph.openManagement();

// 属性键
PropertyKey name = mgmt.makePropertyKey("name")
    .dataType(String.class)
    .cardinality(Cardinality.SINGLE)
    .make();

PropertyKey age = mgmt.makePropertyKey("age")
    .dataType(Integer.class)
    .cardinality(Cardinality.SINGLE)
    .make();

// 复合索引（内部维护，不需要外部系统）
mgmt.buildIndex("byName", Vertex.class)
    .addKey(name)
    .unique()
    .buildCompositeIndex();

// 混合索引（需要 Elasticsearch）
mgmt.buildIndex("searchByName", Vertex.class)
    .addKey(name, Mapping.TEXT.asParameter())
    .buildMixedIndex("search");

mgmt.commit();
```

### 4.6.4 使用场景

| 索引类型 | 查询模式 | 延迟 | 典型场景 |
|----------|----------|------|----------|
| 顶点中心索引 | 边属性过滤 | 微秒级 | 时间线查询、排序遍历 |
| 复合索引 | 精确匹配 | 毫秒级 | 用户登录、ID 查找 |
| 混合索引 | 范围/模糊/全文 | 10ms 级 | 搜索、分析查询 |
| 全文索引 | 文本搜索 | 10ms 级 | 知识图谱搜索 |

### 4.6.5 潜在风险与注意事项

1. **索引写放大**：每个索引更新都转化为一次写入。N 个索引 = N 倍写入放大。
2. **复合索引的顺序敏感性**：`(name, age)` 索引不能加速 `WHERE age = 30`。
3. **顶点中心索引的维护代价**：插入边时需要维护排序顺序，超节点的索引更新成为瓶颈。
4. **混合索引的一致性**：外部索引（ES）和存储引擎之间是异步更新，存在短暂不一致窗口。

### 4.6.6 本章小结

图数据库的索引策略是"遍历优先，索引辅助"。顶点中心索引是图特有的优化——在遍历路径上做索引，而不是全局索引。复合索引和混合索引解决的是"从属性找顶点"的问题，这是图数据库与关系数据库的交集部分。

---

## 4.7 存储引擎对比：Neo4j vs Cassandra

### 4.7.1 解决的问题

选择图数据库时，存储引擎的架构差异直接决定了性能特征、扩展能力和运维复杂度。本节深入对比两种最具代表性的实现。

### 4.7.2 核心原理

#### Neo4j 原生存储架构

```
内存层: [Page Cache] ← 按需加载 4KB/8KB 页
         ↓
文件层: [neostore.nodestore.db]    固定 15B/record
         [neostore.relationshipstore.db] 固定 34B/record
         [neostore.propertystore.db]    固定 41B/record
         [neostore.labelstore.db]       固定 5B/record
         ↓
存储模型: 双向链表（指针 = 文件偏移量）
```

**读路径**：顶点 → 读顶点记录 → 获取 firstRel 偏移量 → 读边记录 → 获取 firstNext 偏移量 → 读下一条边 → ...

**写路径**：追加或复用空闲槽 → 更新前后指针 → 写入 WAL → 写入数据文件

#### Cassandra 后端存储架构

```
内存层: [MemTable] → 写入缓冲区
         ↓
文件层: [SSTable] ← 不可变文件，定期合并
         [CommitLog] ← WAL
         ↓
存储模型: [vertexId → SortedMap<columnName, columnValue>]
```

**读路径**：计算 token → 路由到对应节点 → 读 MemTable → 读 Bloom Filter → 读 SSTable

**写路径**：写 CommitLog → 写 MemTable → 达到阈值后 flush 为 SSTable → 后台 compaction

### 4.7.3 代码/配置实现

#### 性能基准测试框架

```java
public class StorageBenchmark {
    private static final int VERTEX_COUNT = 1_000_000;
    private static final int EDGE_COUNT = 10_000_000;

    public static void main(String[] args) throws Exception {
        // Neo4j 测试
        try (Neo4jStorage neo4j = new Neo4jStorage("/data/neo4j")) {
            neo4j.init();
            long t1 = System.nanoTime();
            neo4j.batchLoad(VERTEX_COUNT, EDGE_COUNT);
            long t2 = System.nanoTime();
            System.out.printf("Neo4j 批量加载: %.2f M edges/sec%n",
                EDGE_COUNT / ((t2 - t1) / 1e9) / 1_000_000);

            long t3 = System.nanoTime();
            int total = 0;
            for (int i = 0; i < 10000; i++) {
                total += neo4j.traverseDepth2(i).size();
            }
            long t4 = System.nanoTime();
            System.out.printf("Neo4j 深度2遍历: %.2f μs/query%n",
                (t4 - t3) / 10000.0 / 1000);
        }

        // Cassandra 测试
        try (CassandraStorage cass = new CassandraStorage("localhost")) {
            cass.init();
            long t1 = System.nanoTime();
            cass.batchLoad(VERTEX_COUNT, EDGE_COUNT);
            long t2 = System.nanoTime();
            System.out.printf("Cassandra 批量加载: %.2f M edges/sec%n",
                EDGE_COUNT / ((t2 - t1) / 1e9) / 1_000_000);

            long t3 = System.nanoTime();
            int total = 0;
            for (int i = 0; i < 10000; i++) {
                total += cass.traverseDepth2(i).size();
            }
            long t4 = System.nanoTime();
            System.out.printf("Cassandra 深度2遍历: %.2f μs/query%n",
                (t4 - t3) / 10000.0 / 1000);
        }
    }
}
```

#### 典型性能数据

| 操作 | Neo4j Native | Cassandra Backend | 差距 |
|------|-------------|-------------------|------|
| 单点查询（1 hop） | 0.1-0.5 ms | 1-5 ms | 10x |
| 深度 2 遍历 | 0.5-2 ms | 5-50 ms | 10-25x |
| 深度 3 遍历 | 2-10 ms | 50-500 ms | 25-50x |
| 批量加载 | 1M edges/sec | 0.5M edges/sec | 2x |
| 水平扩展 | 有限（读扩展） | 线性扩展 | Cassandra 胜 |

### 4.7.4 使用场景

| 场景 | 推荐引擎 | 原因 |
|------|----------|------|
| 实时推荐、欺诈检测 | Neo4j Native | 深度遍历延迟关键 |
| 知识图谱、主数据管理 | Neo4j Native | ACID 事务 + 复杂关联查询 |
| 物联网图分析、日志图 | Cassandra Backend | 写入吞吐量 + 水平扩展 |
| 多数据中心部署 | Cassandra Backend | 原生多 DC 复制 |
| 百亿级边以上 | Cassandra Backend | 单机放不下 |

### 4.7.5 潜在风险与注意事项

1. **Neo4j 的单机瓶颈**：单机存储上限受磁盘容量限制，写吞吐受单机 IOPS 限制。
2. **Cassandra 的遍历放大**：深度 N 的遍历需要 N 次独立查询，每次查询经过完整读路径（Bloom Filter → 索引 → 数据）。
3. **Neo4j 的存储碎片**：频繁删除导致空闲列表碎片化，遍历时指针跳跃增加。
4. **Cassandra 的 Tombstone 问题**：删除操作产生墓碑标记，大量墓碑导致读性能下降。

### 4.7.6 本章小结

Neo4j 原生存储为图遍历做了极致优化——固定大小记录 + 文件内指针 = 最小化随机 IO。Cassandra 后端为分布式和写入吞吐做了优化——宽行存储 + LSM-Tree = 高写入吞吐 + 水平扩展。两者不是替代关系，而是不同负载下的最优选择。

---

## 4.8 预写日志（WAL）与恢复机制

### 4.8.1 解决的问题

图数据库的写入涉及多个数据文件（顶点文件、边文件、属性文件、索引文件）。如果写入过程中崩溃，可能出现：
- 边已写入但顶点未更新 firstRel 指针
- 属性已写入但边未更新属性指针
- 索引已更新但数据未写入

WAL 保证**原子性**和**持久性**：先写日志，再写数据。崩溃后通过重放日志恢复到一致状态。

### 4.8.2 核心原理

WAL 的基本流程：

```
1. 事务开始 → 写入 BEGIN 日志
2. 修改数据 → 写入 REDO 日志（旧值 + 新值）
3. 事务提交 → 写入 COMMIT 日志（强制 fsync）
4. 应用修改 → 写入数据文件（可延迟）
5. 检查点 → 写入 CHECKPOINT 日志（标记已持久化的位置）
```

**恢复流程**：

```
1. 找到最后一个 CHECKPOINT
2. 从 CHECKPOINT 之后重放所有 COMMITTED 事务
3. 回滚所有 UNCOMMITTED 事务（UNDO）
```

#### 简化的图数据库 WAL 实现

```java
public class GraphWAL {
    private final RandomAccessFile walFile;
    private final ByteBuffer buffer = ByteBuffer.allocate(4096);
    private long lastCheckpointOffset = 0;

    // 日志记录类型
    private static final byte OP_BEGIN = 1;
    private static final byte OP_COMMIT = 2;
    private static final byte OP_ADD_VERTEX = 3;
    private static final byte OP_ADD_EDGE = 4;
    private static final byte OP_UPDATE_PROPERTY = 5;
    private static final byte OP_CHECKPOINT = 6;

    public GraphWAL(String path) throws IOException {
        this.walFile = new RandomAccessFile(path + "/neostore.wal", "rw");
        loadCheckpoint();
    }

    public synchronized void beginTx(long txId) throws IOException {
        buffer.clear();
        buffer.put(OP_BEGIN);
        buffer.putLong(txId);
        buffer.putLong(System.currentTimeMillis());
        flushBuffer();
    }

    public synchronized void logAddEdge(long txId, long fromId, long toId,
                                        int edgeType) throws IOException {
        buffer.clear();
        buffer.put(OP_ADD_EDGE);
        buffer.putLong(txId);
        buffer.putLong(fromId);
        buffer.putLong(toId);
        buffer.putInt(edgeType);
        flushBuffer();
    }

    public synchronized void commitTx(long txId) throws IOException {
        buffer.clear();
        buffer.put(OP_COMMIT);
        buffer.putLong(txId);
        buffer.putLong(System.currentTimeMillis());
        flushBuffer();
        walFile.getFD().sync(); // 强制 fsync
    }

    public synchronized void checkpoint(long dataFilePosition) throws IOException {
        buffer.clear();
        buffer.put(OP_CHECKPOINT);
        buffer.putLong(dataFilePosition);
        buffer.putLong(walFile.getFilePointer());
        flushBuffer();
        walFile.getFD().sync();
        lastCheckpointOffset = walFile.getFilePointer();
    }

    public void recover(DataStore dataStore) throws IOException {
        walFile.seek(lastCheckpointOffset);
        Map<Long, List<Runnable>> committedOps = new HashMap<>();
        Set<Long> committed = new HashSet<>();

        while (walFile.getFilePointer() < walFile.length()) {
            byte op = walFile.readByte();
            switch (op) {
                case OP_BEGIN -> {
                    long txId = walFile.readLong();
                    walFile.readLong(); // timestamp
                    committedOps.putIfAbsent(txId, new ArrayList<>());
                }
                case OP_ADD_EDGE -> {
                    long txId = walFile.readLong();
                    long fromId = walFile.readLong();
                    long toId = walFile.readLong();
                    int edgeType = walFile.readInt();
                    if (committedOps.containsKey(txId)) {
                        committedOps.get(txId).add(() -> {
                            try {
                                dataStore.addEdge(fromId, toId, edgeType);
                            } catch (IOException e) {
                                throw new RuntimeException(e);
                            }
                        });
                    }
                }
                case OP_COMMIT -> {
                    long txId = walFile.readLong();
                    committed.add(txId);
                }
                case OP_CHECKPOINT -> {
                    // 跳过，已从 lastCheckpointOffset 开始
                    walFile.readLong();
                    walFile.readLong();
                }
            }
        }

        // 重放已提交的事务
        for (long txId : committed) {
            List<Runnable> ops = committedOps.get(txId);
            if (ops != null) {
                ops.forEach(Runnable::run);
            }
        }

        // 截断 WAL
        walFile.setLength(lastCheckpointOffset);
    }

    private void flushBuffer() throws IOException {
        buffer.flip();
        walFile.write(buffer.array(), 0, buffer.limit());
    }

    private void loadCheckpoint() throws IOException {
        if (walFile.length() == 0) return;
        // 从文件末尾向前扫描最后一个 CHECKPOINT
        long pos = walFile.length() - 17; // OP_CHECKPOINT(1) + dataPos(8) + walPos(8)
        while (pos >= 0) {
            walFile.seek(pos);
            if (walFile.readByte() == OP_CHECKPOINT) {
                walFile.readLong(); // dataFilePosition
                lastCheckpointOffset = walFile.readLong();
                return;
            }
            pos -= 17;
        }
    }
}
```

### 4.8.3 配置实现

#### Neo4j WAL 配置

```properties
# neo4j.conf
# 事务日志配置
dbms.tx_log.rotation.retention_policy=7 days
dbms.tx_log.rotation.size=250M
dbms.tx_log.path=/data/neo4j/data/transactions

# 恢复配置
dbms.recovery.verify_checksums=true
dbms.recovery.fail_on_missing_files=true

# 检查点配置
dbms.checkpoint.interval.time=5m
dbms.checkpoint.interval.tx=100000
dbms.checkpoint.interval.volume=1000M
```

#### Cassandra CommitLog 配置

```yaml
# cassandra.yaml
commitlog:
  directory: /data/cassandra/commitlog
  sync: periodic
  sync_period_in_ms: 10000
  segment_size_in_mb: 32
  total_space_in_mb: 8192
  compression:
    - class_name: LZ4Compressor
```

### 4.8.4 使用场景

- **所有需要 ACID 事务的图数据库**：Neo4j、TigerGraph、ArangoDB。
- **崩溃恢复**：断电、进程崩溃、磁盘故障后的自动恢复。
- **备份与时间点恢复**：通过归档 WAL 实现任意时间点恢复。

### 4.8.5 潜在风险与注意事项

1. **fsync 性能瓶颈**：每次提交都 fsync，在 SSD 上约 0.1-1ms，HDD 上约 10ms。批量提交可以缓解。
2. **WAL 无限增长**：没有 checkpoint 机制时 WAL 无限增长，恢复时间无限长。
3. **Group Commit**：多个事务的 fsync 合并为一次，是重要的优化手段。
4. **WAL 与数据文件的一致性**：checkpoint 必须保证数据文件已持久化到 WAL 位置。

### 4.8.6 本章小结

WAL 是图数据库可靠性的基石。核心设计是"先写日志再写数据"和"检查点截断"。Group Commit 和异步 checkpoint 是性能优化的关键。没有 WAL 的图数据库只适合缓存或实验场景。

---

## 4.9 内存管理：缓冲池与页缓存

### 4.9.1 解决的问题

磁盘比内存慢 10^5 倍。图遍历的指针追逐特性导致访问模式高度随机，传统 OS 页缓存（4KB 页）无法有效预取。图数据库需要自己的内存管理层，精确控制哪些数据驻留内存。

### 4.9.2 核心原理

#### 缓冲池（Buffer Pool）

与数据库类似，图数据库将数据文件划分为固定大小的页（Page），缓冲池管理这些页在内存中的缓存：

```
磁盘文件: [Page 0][Page 1][Page 2]...[Page N]
                ↓ 按需加载
缓冲池:   [Frame 0][Frame 1]...[Frame M]  (M << N)
                ↓
管理策略: LRU / Clock / 2Q / LIRS
```

**关键设计**：图数据库的页大小通常比关系数据库大（8KB-64KB vs 4KB-8KB），因为图遍历需要在一个页内命中多个相关记录。

#### Neo4j 的页缓存

Neo4j 使用 mmap 风格的页缓存，但不是直接 mmap（避免 OS 不可控的刷盘行为），而是自己管理：

```java
public class Neo4jPageCache {
    private final Page[] pages;
    private final int pageSize;
    private final long totalMemory;
    private final ClockReplacementPolicy eviction;

    public Neo4jPageCache(long memoryBytes, int pageSize) {
        this.pageSize = pageSize;
        int pageCount = (int)(memoryBytes / pageSize);
        this.pages = new Page[pageCount];
        this.totalMemory = memoryBytes;
        this.eviction = new ClockReplacementPolicy(pageCount);

        for (int i = 0; i < pageCount; i++) {
            pages[i] = new Page(ByteBuffer.allocateDirect(pageSize));
        }
    }

    public ByteBuffer readPage(long filePageId, RandomAccessFile file) throws IOException {
        int frameId = eviction.findVictim();
        Page page = pages[frameId];

        if (page.isDirty()) {
            flushPage(page, file);
        }

        file.seek(filePageId * pageSize);
        page.buffer.clear();
        file.getChannel().read(page.buffer);
        page.buffer.flip();
        page.filePageId = filePageId;
        page.isDirty = false;
        page.pinCount = 1;

        return page.buffer;
    }

    public void pinPage(long filePageId) {
        for (Page page : pages) {
            if (page.filePageId == filePageId && page.pinCount > 0) {
                page.pinCount++;
                eviction.markAccessed(frameIdOf(page));
                return;
            }
        }
    }

    public void unpinPage(long filePageId) {
        for (Page page : pages) {
            if (page.filePageId == filePageId && page.pinCount > 0) {
                page.pinCount--;
                return;
            }
        }
    }

    private void flushPage(Page page, RandomAccessFile file) throws IOException {
        file.seek(page.filePageId * pageSize);
        page.buffer.position(0);
        file.getChannel().write(page.buffer);
    }

    static class Page {
        final ByteBuffer buffer;
        long filePageId = -1;
        boolean isDirty = false;
        int pinCount = 0;

        Page(ByteBuffer buffer) {
            this.buffer = buffer;
        }
    }
}
```

#### Clock 淘汰算法

```java
public class ClockReplacementPolicy {
    private final int[] referenceBits;
    private final int frameCount;
    private int hand = 0;

    public ClockReplacementPolicy(int frameCount) {
        this.referenceBits = new int[frameCount];
        this.frameCount = frameCount;
    }

    public void markAccessed(int frameId) {
        referenceBits[frameId] = 1;
    }

    public int findVictim() {
        while (true) {
            if (referenceBits[hand] == 0) {
                int victim = hand;
                hand = (hand + 1) % frameCount;
                return victim;
            }
            referenceBits[hand] = 0; // 给第二次机会
            hand = (hand + 1) % frameCount;
        }
    }
}
```

#### 直接内存分配（Direct Memory）

Neo4j 和 JanusGraph 都使用 `ByteBuffer.allocateDirect()` 分配堆外内存：

```java
public class DirectMemoryPool {
    private final long maxMemory;
    private final AtomicLong usedMemory = new AtomicLong(0);
    private final Queue<ByteBuffer> freeBuffers = new ConcurrentLinkedQueue<>();

    public DirectMemoryPool(long maxBytes) {
        this.maxMemory = maxBytes;
    }

    public ByteBuffer allocate(int size) {
        ByteBuffer buf = freeBuffers.poll();
        if (buf != null && buf.capacity() >= size) {
            buf.clear();
            return buf;
        }

        long current = usedMemory.get();
        if (current + size > maxMemory) {
            throw new OutOfMemoryError("Direct memory limit exceeded: "
                + current + " + " + size + " > " + maxMemory);
        }

        ByteBuffer direct = ByteBuffer.allocateDirect(size);
        usedMemory.addAndGet(size);
        return direct;
    }

    public void deallocate(ByteBuffer buf) {
        freeBuffers.offer(buf);
    }

    public long used() {
        return usedMemory.get();
    }
}
```

**堆外内存的优势**：
1. 不受 GC 管理，避免 GC 暂停导致的长尾延迟。
2. 减少数据拷贝（磁盘 → 内核 → 堆外 → 堆内 → 应用 → 堆外 → 内核 → 网络，堆外可以跳过堆内拷贝）。
3. 页缓存本身不需要 GC。

### 4.9.3 配置实现

#### Neo4j 内存配置

```properties
# neo4j.conf
# 页缓存（堆外）
dbms.memory.pagecache.size=8G

# 堆内存
dbms.memory.heap.initial_size=4G
dbms.memory.heap.max_size=4G

# 事务内存
dbms.memory.transaction.global_max_size=256M
dbms.memory.transaction.max_size=64M

# 离线堆外内存（用于批量导入）
dbms.memory.off_heap.max_size=2G
```

#### JanusGraph + Cassandra 内存配置

```properties
# janusgraph-env.sh
# JanusGraph 堆内存
JANUSGRAPH_HEAP_SIZE=8G

# cassandra-env.sh
# Cassandra 堆内存
MAX_HEAP_SIZE=8G
HEAP_NEWSIZE=2G

# 页缓存由 OS 管理
# cassandra.yaml
memtable_allocation_type: offheap_buffers
memtable_heap_space_in_mb: 2048
memtable_offheap_space_in_mb: 2048
```

### 4.9.4 使用场景

| 内存策略 | 适用场景 | 原因 |
|----------|----------|------|
| 堆外页缓存 | 图遍历密集型 | 避免 GC 暂停，大页缓存 |
| 堆内缓存 | 属性缓存 | 属性值通常较小，GC 压力小 |
| mmap | 只读场景 | 简化实现，OS 自动管理 |
| Direct Memory | 网络传输 | 零拷贝发送 |

### 4.9.5 潜在风险与注意事项

1. **页缓存命中率**：图遍历的随机性导致页缓存命中率可能低于关系数据库。需要更大的缓存比例。
2. **大页（Huge Pages）**：TLB 缺失在遍历大图时是显著开销，启用透明大页（THP）可提升 10-20% 性能。
3. **内存超卖**：堆外内存 + 堆内存 + 线程栈 + 网络缓冲区可能超过物理内存，导致 swap。
4. **NUMA 亲和性**：多路服务器上，页缓存应该分配在访问它的 CPU 所在 NUMA 节点。

### 4.9.6 本章小结

图数据库的内存管理核心是**堆外页缓存 + Clock 淘汰 + 直接内存分配**。堆外内存避免了 GC 对遍历延迟的影响，Clock 算法比 LRU 更高效（无链表操作），直接内存减少了数据拷贝。配置的关键是给页缓存足够的内存——通常建议为数据集的 20-50%。

---

## 4.10 本章总结

图数据库存储引擎的设计，本质上是在回答一个问题：**如何让"沿着边找邻居"这个操作尽可能快？**

| 技术 | 解决的问题 | 代价 |
|------|-----------|------|
| 邻接表 | 直观的邻居存储 | 随机 IO |
| CSR | 缓存友好的顺序遍历 | 静态不可变 |
| 原生存储 | 指针追逐无索引开销 | 存储碎片 |
| 宽行存储 | 分布式扩展 | 遍历放大 |
| WAL | 崩溃恢复 | 写入延迟 |
| 页缓存 | 内存加速 | 内存消耗 |

**工程取舍的黄金法则**：图数据库的存储设计必须与访问模式匹配。如果负载是深度遍历（欺诈检测、推荐），选择原生存储 + 大页缓存。如果负载是宽表扫描（图分析、ETL），选择 CSR 或列存。如果负载是海量写入（事件图、IoT），选择 LSM-Tree 后端。

下一章将讨论图查询引擎——在存储层之上，如何将 Cypher/Gremlin 查询编译为高效的执行计划。
