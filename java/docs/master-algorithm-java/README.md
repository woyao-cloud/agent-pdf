# 精通算法（Java版）

> 原理·实现·工程·优化

## 书籍定位

本书面向中高级Java开发工程师、架构师，系统讲解常用算法的原理、实现、工程应用与性能优化。内容兼顾理论与实践，既深入算法原理分析，又注重实际场景应用。本书与《精通数据结构》互补，独立成书，只讲算法。

---

## 目录

### 第1篇：基础篇 — 算法思维基石

| # | 章节 | 内容 | Demo代码 |
|---|------|------|----------|
| 1 | [算法概述](chapter-01-algorithm-overview.md) | 什么是算法、特征与评价标准、算法与程序、设计流程 | [AlgorithmDesignProcess.java](demos/chapter01/AlgorithmDesignProcess.java)、[AlgorithmCharacteristics.java](demos/chapter01/AlgorithmCharacteristics.java) |
| 2 | [复杂度分析](chapter-02-complexity-analysis.md) | 时间复杂度、空间复杂度、递归复杂度、摊销分析 | [TimeComplexityAnalyzer.java](demos/chapter02/TimeComplexityAnalyzer.java)、[SpaceComplexityAnalyzer.java](demos/chapter02/SpaceComplexityAnalyzer.java) |
| 3 | [算法思维模式](chapter-03-algorithm-patterns.md) | 分治、贪心、DP、回溯、分支限界、枚举与启发式 | [DivideAndConquerDemo.java](demos/chapter03/DivideAndConquerDemo.java)、[GreedyVsDPDemo.java](demos/chapter03/GreedyVsDPDemo.java)、[BacktrackingDemo.java](demos/chapter03/BacktrackingDemo.java)、[EnumerationDemo.java](demos/chapter03/EnumerationDemo.java) |

### 第2篇：核心篇 — 基础算法与应用

| # | 章节 | 内容 | Demo代码 |
|---|------|------|----------|
| 4 | [排序算法](chapter-04-sorting.md) | 交换/插入/选择/归并/线性排序、JDK源码解析、选型策略 | [SortingComparison.java](demos/chapter04/SortingComparison.java)、[JDKSortAnalysis.java](demos/chapter04/JDKSortAnalysis.java)、[StableSortDemo.java](demos/chapter04/StableSortDemo.java) |
| 5 | [查找算法](chapter-05-searching.md) | 二分查找变体、插值/斐波那契查找、哈希查找、JDK源码 | [BinarySearchVariants.java](demos/chapter05/BinarySearchVariants.java)、[SearchComparison.java](demos/chapter05/SearchComparison.java)、[HashMapLookupDemo.java](demos/chapter05/HashMapLookupDemo.java) |
| 6 | [递归与迭代](chapter-06-recursion-iteration.md) | 递归原理、vs迭代、尾递归/记忆化/蹦床、经典问题 | [RecursionBasics.java](demos/chapter06/RecursionBasics.java)、[RecursionToIteration.java](demos/chapter06/RecursionToIteration.java)、[TailCallOptimization.java](demos/chapter06/TailCallOptimization.java) |

### 第3篇：高级篇 — 进阶算法

| # | 章节 | 内容 | Demo代码 |
|---|------|------|----------|
| 7 | [动态规划](chapter-07-dynamic-programming.md) | 状态定义、经典问题、状态压缩、树形/区间DP、进阶DP | [ClassicDPProblems.java](demos/chapter07/ClassicDPProblems.java)、[AdvancedDPProblems.java](demos/chapter07/AdvancedDPProblems.java)、[TreeDPDemo.java](demos/chapter07/TreeDPDemo.java) |
| 8 | [贪心算法](chapter-08-greedy.md) | 基本思想、vs DP、活动选择/Huffman/MST、正确性证明 | [GreedyClassicProblems.java](demos/chapter08/GreedyClassicProblems.java)、[GreedyVsDP.java](demos/chapter08/GreedyVsDP.java)、[MinimumSpanningTree.java](demos/chapter08/MinimumSpanningTree.java) |
| 9 | [回溯算法](chapter-09-backtracking.md) | 全排列/子集、N皇后、组合求和、Sudoku、剪枝优化 | [PermutationsAndSubsets.java](demos/chapter09/PermutationsAndSubsets.java)、[NQueensSolver.java](demos/chapter09/NQueensSolver.java)、[SudokuSolver.java](demos/chapter09/SudokuSolver.java) |
| 10 | [图算法-遍历与基础](chapter-10-graph-traversal.md) | 图表示、DFS/BFS、连通分量/割点、拓扑排序 | [GraphRepresentation.java](demos/chapter10/GraphRepresentation.java)、[DFSAndBFS.java](demos/chapter10/DFSAndBFS.java)、[TopologicalSort.java](demos/chapter10/TopologicalSort.java)、[SCCAndArticulation.java](demos/chapter10/SCCAndArticulation.java) |
| 11 | [图算法-最短路径](chapter-11-shortest-path.md) | Dijkstra、Bellman-Ford、SPFA、Floyd-Warshall、变形 | [DijkstraAndBellmanFord.java](demos/chapter11/DijkstraAndBellmanFord.java)、[FloydWarshallDemo.java](demos/chapter11/FloydWarshallDemo.java)、[ShortestPathVariants.java](demos/chapter11/ShortestPathVariants.java) |
| 12 | [图算法-网络流与匹配](chapter-12-network-flow.md) | 最大流、最小割、二分图匹配、费用流 | [MaxFlowDemos.java](demos/chapter12/MaxFlowDemos.java)、[MinCutDemo.java](demos/chapter12/MinCutDemo.java)、[BipartiteMatching.java](demos/chapter12/BipartiteMatching.java)、[MinCostMaxFlow.java](demos/chapter12/MinCostMaxFlow.java) |
| 13 | [字符串算法](chapter-13-string-algorithms.md) | KMP/BM/RK匹配、Trie、AC自动机、后缀数组、编辑距离 | [StringMatchingComparison.java](demos/chapter13/StringMatchingComparison.java)、[TrieAndACAutomaton.java](demos/chapter13/TrieAndACAutomaton.java)、[EditDistanceDemo.java](demos/chapter13/EditDistanceDemo.java) |
| 14 | [组合优化](chapter-14-combinatorial-optimization.md) | 近似算法、模拟退火、遗传算法、线性规划 | [ApproximationAlgorithms.java](demos/chapter14/ApproximationAlgorithms.java)、[SimulatedAnnealing.java](demos/chapter14/SimulatedAnnealing.java)、[GeneticAlgorithmDemo.java](demos/chapter14/GeneticAlgorithmDemo.java) |

### 第4篇：实战篇 — 算法应用与优化

| # | 章节 | 内容 | Demo代码 |
|---|------|------|----------|
| 15 | [面试高频算法题](chapter-15-interview-algorithms.md) | 链表/树/DP/数组字符串高频题、系统设计算法 | [LinkedListAlgorithms.java](demos/chapter15/LinkedListAlgorithms.java)、[TreeAlgorithms.java](demos/chapter15/TreeAlgorithms.java)、[HighFrequencyProblems.java](demos/chapter15/HighFrequencyProblems.java) |
| 16 | [典型问题与解题模板](chapter-16-problem-templates.md) | 双指针、滑动窗口、区间问题、位运算、解题模板 | [TwoPointersSlidingWindow.java](demos/chapter16/TwoPointersSlidingWindow.java)、[IntervalAndBitOps.java](demos/chapter16/IntervalAndBitOps.java) |
| 17 | [算法性能优化](chapter-17-performance-optimization.md) | 时间/空间优化、并行算法、缓存优化 | [PrefixSumDemo.java](demos/chapter17/PrefixSumDemo.java)、[ParallelAlgorithms.java](demos/chapter17/ParallelAlgorithms.java)、[CacheFriendlyDemo.java](demos/chapter17/CacheFriendlyDemo.java) |
| 18 | [实际工程中的算法应用](chapter-18-real-world-algorithms.md) | 搜索引擎、推荐系统、分布式算法、大数据算法 | [PageRankDemo.java](demos/chapter18/PageRankDemo.java)、[CollaborativeFilteringDemo.java](demos/chapter18/CollaborativeFilteringDemo.java)、[SketchAlgorithms.java](demos/chapter18/SketchAlgorithms.java) |

### 第5篇：技能篇 — 算法工程师必备能力

| # | 章节 | 内容 | Demo代码 |
|---|------|------|----------|
| 19 | [算法设计能力](chapter-19-algorithm-design-skills.md) | 问题分析、策略选择、正确性证明、复杂度分析技巧 | [LoopInvariantDemo.java](demos/chapter19/LoopInvariantDemo.java) |
| 20 | [代码实现能力](chapter-20-code-implementation-skills.md) | 手写算法、代码优化、TDD、可读性与维护 | [AlgorithmTestingDemo.java](demos/chapter20/AlgorithmTestingDemo.java) |
| 21 | [算法工程实践](chapter-21-algorithm-engineering-practice.md) | 开源库学习、性能排查、选型评估、持续学习路径 | [AlgoBenchmarkDemo.java](demos/chapter21/AlgoBenchmarkDemo.java) |

---

## 代码总览

全书包含 **57个Java Demo文件**，涵盖所有核心算法的完整实现。代码按章节组织在 `demos/` 目录下：

```
demos/
├── chapter01/   — 算法概述（2个demo）
├── chapter02/   — 复杂度分析（2个demo）
├── chapter03/   — 算法思维模式（4个demo）
├── chapter04/   — 排序算法（3个demo）
├── chapter05/   — 查找算法（3个demo）
├── chapter06/   — 递归与迭代（3个demo）
├── chapter07/   — 动态规划（3个demo）
├── chapter08/   — 贪心算法（3个demo）
├── chapter09/   — 回溯算法（3个demo）
├── chapter10/   — 图遍历（4个demo）
├── chapter11/   — 最短路径（3个demo）
├── chapter12/   — 网络流（4个demo）
├── chapter13/   — 字符串算法（3个demo）
├── chapter14/   — 组合优化（3个demo）
├── chapter15/   — 面试高频题（3个demo）
├── chapter16/   — 解题模板（2个demo）
├── chapter17/   — 性能优化（3个demo）
├── chapter18/   — 工程应用（3个demo）
├── chapter19/   — 算法设计（1个demo）
├── chapter20/   — 代码实现（1个demo）
└── chapter21/   — 工程实践（1个demo）
```

编译运行（使用 Java 11+）：

```bash
javac -d out demos/chapter01/*.java demos/chapter02/*.java  # 以此类推
java -cp out masteralgo.chapter01.AlgorithmDesignProcess
```

## 阅读建议

1. **基础篇（第1-3章）** — 理解算法思维基石，掌握复杂度分析
2. **核心篇（第4-6章）** — 掌握最常用的基础算法
3. **高级篇（第7-14章）** — 学习进阶算法，深入理解算法思想
4. **实战篇（第15-18章）** — 将知识转化为能力，掌握实际应用
5. **技能篇（第19-21章）** — 综合提升，培养算法工程师核心能力

每章的结构保持一致：**解决的问题 → 实现原理 → 代码实现 → 使用场景 → 潜在风险 → 优化策略**，理论讲解与可运行的Java示例相结合。