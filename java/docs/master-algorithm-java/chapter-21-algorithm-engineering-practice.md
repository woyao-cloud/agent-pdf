# 第21章 算法工程实践

> "离开课本，走向生产。真正的算法能力不在于知道多少种排序，而在于能在正确的场景做出正确的选择。"

---

## 21.1 开源算法库学习

在生产环境中，不需要重复造轮子。优秀的开源库提供了经过充分测试和高性能的算法实现。

### Google Guava

Guava 是 Google 的核心 Java 库，包含了大量实用算法。

**图处理（common.graph）：**
```java
// Guava 提供了不可变图、可变图、有向/无向图等
MutableGraph<Integer> graph = GraphBuilder.undirected()
    .expectedNodeCount(100)
    .build();
graph.addNode(1);
graph.putEdge(1, 2);  // 添加边，自动添加节点

// 遍历
for (Integer node : graph.nodes()) {
    Set<Integer> adj = graph.adjacentNodes(node);
    // 处理邻接节点
}
```

**布隆过滤器（Bloom Filter）：**
```java
BloomFilter<String> bloom = BloomFilter.create(
    Funnels.stringFunnel(Charsets.UTF_8),
    10_000,        // 预期插入数量
    0.01);         // 期望误判率 1%
bloom.put("key1");
boolean mightContain = bloom.mightContain("key1");  // true
boolean definitelyNot = bloom.mightContain("key2"); // 可能 false positive
```

**哈希：**
```java
// 一致性哈希、最小哈希等高级哈希算法
HashFunction hf = Hashing.murmur3_128();
HashCode hc = hf.hashString("hello", Charsets.UTF_8);
```

### Apache Commons Math

Apache Commons Math 是 Java 最全面的数学和统计算法库。

```java
// 线性优化——求解线性规划
LinearObjectiveFunction f = new LinearObjectiveFunction(
    new double[]{3, 2}, 0);  // 最大化 3x + 2y
Collection<LinearConstraint> constraints = new ArrayList<>();
constraints.add(new LinearConstraint(
    new double[]{2, 1}, Relationship.LEQ, 18));  // 2x + y ≤ 18
constraints.add(new LinearConstraint(
    new double[]{2, 3}, Relationship.LEQ, 42));  // 2x + 3y ≤ 42

SimplexSolver solver = new SimplexSolver();
PointValuePair solution = solver.optimize(f, constraints,
    GoalType.MAXIMIZE, new NonNegativeConstraint(true));
```

```java
// 数值积分
UnivariateFunction f = x -> Math.sin(x);
double result = SimpsonIntegrator().integrate(1000, f, 0, Math.PI);

// 统计
DescriptiveStatistics stats = new DescriptiveStatistics();
stats.addValue(1.2);
stats.addValue(3.4);
double mean = stats.getMean();
double std = stats.getStandardDeviation();
```

### H2O / Spark MLlib（分布式 ML）

```java
// Spark MLlib —— 大规模分布式机器学习
import org.apache.spark.ml.classification.LogisticRegression;
import org.apache.spark.ml.linalg.Vectors;

Dataset<Row> training = spark.read().format("libsvm")
    .load("data/sample_libsvm_data.txt");

LogisticRegression lr = new LogisticRegression()
    .setMaxIter(100)
    .setRegParam(0.01);
LogisticRegressionModel model = lr.fit(training);
```

### JGraphT

JGraphT 是 Java 最完善的图算法库。

```java
// 构建图
Graph<String, DefaultEdge> graph = new SimpleGraph<>(DefaultEdge.class);
graph.addVertex("A");
graph.addVertex("B");
graph.addEdge("A", "B");

// 多种图算法
ShortestPathAlgorithm<String, DefaultEdge> dijkstra =
    new DijkstraShortestPath<>(graph);
double distance = dijkstra.getPathWeight("A", "B");

// 最大流
Graph<Integer, DefaultWeightedEdge> flowGraph =
    new SimpleDirectedWeightedGraph<>(DefaultWeightedEdge.class);
// ...
MaximumFlowAlgorithm<Integer, DefaultWeightedEdge> maxFlow =
    new EdmondsKarpMFImpl<>(flowGraph);
MaximumFlow<Integer, DefaultWeightedEdge> flow =
    maxFlow.getMaximumFlow(source, sink);
```

### 阅读开源库源代码的方法

1. **从使用开始**：看官方文档和示例代码，先用起来
2. **从入口切入**：找到核心类的核心方法，作为阅读起点
3. **忽略细节**：先理解数据结构和整体流程，再深入细节
4. **对比学习**：对比不同的实现方式
   - Guava 的 BloomFilter 与其他实现有何不同？
   - JGraphT 与 Guava graph 的设计哲学差异？
5. **关注测试**：看测试用例怎么写的，理解预期行为

---

## 21.2 生产环境问题排查

### 性能剖析（Profiling）

**Java Flight Recorder (JFR)：**
```bash
# 启动时启用 JFR（低开销，适合生产）
java -XX:StartFlightRecording=duration=60s,filename=recording.jfr \
     -XX:+UnlockDiagnosticVMOptions -XX:+DebugNonSafepoints \
     -jar application.jar

# 运行时 attach
jcmd <pid> JFR.start duration=60s filename=recording.jfr
```

JFR 能告诉你：
- 每个方法分配了多少 CPU 时间（热点方法）
- 对象分配热点（哪些方法创建了大量对象）
- GC 暂停的频率和原因
- 锁竞争情况

**VisualVM：**
- 可视化监控堆内存、线程、GC
- 适合开发/测试环境
- 可安装插件扩展功能（如 VisualGC）

**async-profiler：**
```bash
# 低开销采样分析，支持火焰图
./profiler.sh -d 30 -o flamegraph.html <pid>

# CPU profiling
./profiler.sh -e cpu -d 30 -f cpu.html <pid>

# 分配 profiling
./profiler.sh -e alloc -d 30 -f alloc.html <pid>
```

**火焰图解读：**
- x 轴：按字母排序的函数调用
- y 轴：调用栈深度
- 宽度：越宽说明占用 CPU 时间越多
- 关注：顶部宽框（热点函数本身）和底部宽框（调用链上的问题）

### 内存泄漏排查

**生成堆转储（Heap Dump）：**
```bash
# 方式1：JVM 参数，OOM 时自动 dump
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/path/to/dumps/

# 方式2：使用 jmap
jmap -dump:live,format=b,file=heap.hprof <pid>

# 方式3：使用 jcmd
jcmd <pid> GC.heap_dump heap.hprof
```

**使用 MAT（Memory Analyzer Tool）分析：**

| 分析步骤 | 操作 |
|---------|------|
| 1. 打开 dump | File → Open Heap Dump |
| 2. 看概要 | 总大小、类统计、最大的对象 |
| 3. 找泄漏嫌疑 | Leak Suspects Report |
| 4. 追踪 GC root | 从泄​​漏对象追溯到 GC root |
| 5. 对比分析 | 对比多个时间点的 dump |

**常见内存泄漏模式：**
- 集合中不断添加元素但从未移除（缓存未设置淘汰策略）
- ThreadLocal 未清理（线程池复用导致）
- 内部类持有外部类引用（匿名内部类隐式持有 this）
- ClassLoader 泄漏（频繁重新部署未卸载）
- 字符串 intern 不当

### 线程 Dump 分析

```bash
# 方式1
jstack <pid> > threaddump.txt

# 方式2
jcmd <pid> Thread.print

# 方式3（自动连续 dump）
for i in {1..5}; do
    jstack <pid> > "dump_$(date +%H%M%S).txt"
    sleep 3
done
```

**线程 dump 的常见状态：**
| 状态 | 含义 | 排查方向 |
|------|------|---------|
| RUNNABLE | 正在执行 | 长期占用 CPU 则可能是死循环 |
| BLOCKED | 等待锁 | 锁竞争激烈，需要优化锁粒度 |
| WAITING | 等待通知 | 可能是 wait/notify 缺失 |
| TIMED_WAITING | 限时等待 | sleep/await 通常是正常的 |

### 算法性能回归测试

**建立性能基线：**
每次代码变更后，自动运行基准测试并与基线对比：

```java
// 性能回归测试框架
class PerfRegressionTest {
    static class BenchmarkResult {
        String name;
        double meanMs;
        double baselineMs;
        double degradation; // > 1.0 表示退化
    }

    static void assertNotDegraded(BenchmarkResult result, double threshold) {
        if (result.degradation > threshold) {
            throw new AssertionError(
                String.format("性能退化 %.1f%%: %s (%.2fms → %.2fms)",
                    (result.degradation - 1) * 100,
                    result.name, result.baselineMs, result.meanMs));
        }
    }
}
```

---

## 21.3 算法选型与风险评估

### 选型标准

| 维度 | 评估问题 |
|------|---------|
| 数据规模 | 每天处理多少条数据？峰值 QPS 多少？数据量增长趋势？ |
| 延迟要求 | P99 延迟要求多少？是同步还是异步处理？ |
| 精度要求 | 需要精确结果还是近似即可？容许多少误差？ |
| 内存预算 | 可用堆内存多少？能否接受 GB 级的内存使用？ |
| 维护成本 | 团队成员能理解该算法吗？未来需要多少人维护？ |
| 数据特征 | 数据分布是否均匀？有热点数据吗？是否经常变化？ |

### 复杂算法的风险

| 风险类型 | 具体表现 | 缓解措施 |
|---------|---------|---------|
| 实现 bug | 边界条件处理错误、状态更新遗漏 | 充分的单元测试、模糊测试 |
| 性能退化 | 在特定输入下性能骤降 | benchmark、性能 regression test |
| 维护困难 | 团队成员不理解，不敢修改 | 详细注释、设计文档、知识分享 |
| 隐藏依赖 | 依赖数据分布、硬件特性等外部因素 | 做好抽象、文档化假设条件 |
| 扩展性差 | 无法横向扩展或分布式化 | 架构评审时考虑扩展性 |

### 简单方案 vs 复杂方案决策树

```
能用简单的吗？
├── 简单方案满足需求？
│   ├── 是 → 用简单的（O(n²) 但在业务规模下够用）
│   └── 否 → 继续↓
│
├── 复杂的收益明显吗？
│   ├── 是 → 收益 > 成本？ 
│   │       ├── 是 → 用复杂的
│   │       └── 否 → 接受简单方案的不足
│   └── 否 → 继续看是否有中间方案
│
├── 有折中方案吗？
│   ├── 有 → 用折中方案
│   └── 无 → 需要深度定制或选复杂方案
│
└── 最简单的永远是最好的
```

**经典案例：**
- 你要的真的是红黑树吗？很可能 `ArrayList` + `Collections.binarySearch()` 就够了
- 你要的真的是 PageRank 吗？一个简单的统计指标可能已经能解决 80% 的问题
- 你要的真的是神经网络吗？逻辑回归可能更好解释、更好部署

### A/B 测试算法变更

在生产环境中更换算法或调整参数时，始终做 A/B 测试：

```java
// A/B 测试框架的核心逻辑
class ABTest {
    // 根据用户 ID 将用户分桶
    static String assignBucket(String userId) {
        int hash = Math.abs(userId.hashCode());
        return hash % 100 < 50 ? "A" : "B";  // 50/50 分流
    }

    // 对比指标
    record Metrics(long totalRequests, long successCount, long totalLatencyMs) {
        double successRate() { return (double) successCount / totalRequests; }
        double avgLatencyMs() { return (double) totalLatencyMs / totalRequests; }
    }

    static boolean isSignificant(Metrics a, Metrics b, String metric) {
        // 简化的显著性检验（生产应使用更严谨的统计方法）
        double diff = switch(metric) {
            case "successRate" -> b.successRate() - a.successRate();
            case "avgLatency" -> a.avgLatencyMs() - b.avgLatencyMs();
            default -> throw new IllegalArgumentException();
        };
        return diff > 0.01; // 至少 1% 的提升才算显著
    }
}
```

---

## 21.4 持续学习路径

### 经典书籍

**入门必读：**
- 《算法导论》（CLRS）：最权威的算法教材。适合系统学习，但不必一次读完
  - 重点章节：分治、排序、DP、图算法、贪心
  - 略读章节：数论、矩阵运算、计算几何
- 《算法设计手册》（The Algorithm Design Manual）：更实用的算法书
  - 第一部分：算法设计技巧（推荐优先读）
  - 第二部分：算法目录（当工具书查阅）
- 《编程珠玑》（Programming Pearls）：短小精悍，培养算法思维

**进阶读物：**
- 《计算机程序设计艺术》（TAOCP, Knuth）：算法圣经，数学推导详细
- 《具体数学》（Graham, Knuth, Patashnik）：算法所需数学基础
- 《计算理论导引》（Sipser）：计算理论、可计算性、NP 完全性

### 在线评测系统

| 平台 | 特点 | 适合人群 |
|------|------|---------|
| LeetCode | 题目分类好，讨论区活跃，有周赛 | 面试准备、系统学习 |
| Codeforces | 比赛密集，题目质量高，区分度好 | 竞赛选手、提升速度 |
| AtCoder | 题目思维含量高，难度梯度合理 | 培养算法思维 |
| Google Code Jam | 题目创意好，注重解决问题而非套路 | 突破瓶颈 |

**刻意练习计划（12 周）：**

| 阶段 | 主题 | 每周题量 | 目标 |
|------|------|---------|------|
| 第 1-2 周 | 数组、字符串、哈希表 | 10-15 题 | 基础编码能力 |
| 第 3-4 周 | 链表、栈、队列、树 | 10-15 题 | 数据结构运用 |
| 第 5-6 周 | 排序、搜索、二分 | 10-15 题 | 算法思维 |
| 第 7-8 周 | 动态规划入门 | 8-12 题 | DP 思维建立 |
| 第 9-10 周 | 图算法（DFS/BFS/最短路径） | 8-12 题 | 图思维 |
| 第 11-12 周 | 综合复习+模拟面试 | 10 题 | 融会贯通 |

### 研究论文

**关注顶级会议：**
- **FOCS** (IEEE Foundations of Computer Science)：理论色彩最浓
- **STOC** (ACM Symposium on Theory of Computing)：理论
- **SODA** (ACM-SIAM Symposium on Discrete Algorithms)：离散算法
- **ICML / NeurIPS**：机器学习算法
- **VLDB / SIGMOD**：数据库与大数据算法

**论文阅读技巧：**
1. 先读标题+摘要，判断是否相关
2. 看引言，理解问题和贡献
3. 看图表和实验结果
4. 再看核心证明（不看细节证明）
5. 根据需要决定是否深入细节

**值得一读的经典论文：**
- "A Note on Two Problems in Connexion with Graphs" (Dijkstra, 1959) —— 最短路径
- "Fast Pattern Matching in Strings" (KMP, 1977) —— 字符串匹配
- "The Ubiquitous Binary Search" ( Bentley, 1982) —— 二分查找的变体
- "MapReduce: Simplified Data Processing on Large Clusters" (Dean & Ghemawat, 2004) —— 分布式算法

### 培养算法直觉的方法

**1. 解题后复盘**

每做完一道题，问自己：
- 我能用自己的话解释这个算法吗？
- 为什么这个算法是对的？
- 如果换一种输入（更大/更小/不同分布），算法表现如何？
- 有没有更好的解法？为什么没想到？

**2. 一题多解**

同一道题，尝试多种解法并比较：
```java
// 问题：找到数组中的多数元素
// 解法1: 哈希表 —— O(n) 时间, O(n) 空间
// 解法2: 排序 —— O(nlogn) 时间, O(1) 空间
// 解法3: Boyer-Moore 投票 —— O(n) 时间, O(1) 空间 ★
```

**3. 多题一解**

识别不同题目间的共性模式：
- "三数之和" → "最接近的三数之和" → "四数之和"：双指针模式
- "爬楼梯" → "不同路径" → "最小路径和"：基础 DP 模式
- "岛屿数量" → "包围区域" → "扫雷"：DFS 感染模式

**4. 看别人代码**

看高质量的题解代码，关注：
- 代码是如何组织的？
- 边界是怎么处理的？
- 哪些代码写得很巧妙？
- 如果是竞赛代码，关注速度和技巧；如果是工程代码，关注可读性

**5. 教别人**

最好的学习方式就是教。试着：
- 写技术博客解释算法
- 给同事做技术分享
- 在开源项目评论区写解答

---

> **本章总结：** 算法工程实践是连接理论与生产的桥梁。会用 Guava 的 BloomFilter、能分析 JFR 性能数据、能在简单与复杂方案之间做出理性决策——这些能力比照搬课本算法更贴近真实世界。保持学习的习惯，持续在 LeetCode、论文、开源项目中磨练，才能真正成为算法高手。