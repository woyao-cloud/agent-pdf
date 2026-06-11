# 第17章 性能优化实战

> "让程序变快有两种方式：做更少的事，或者更高效地做事。真正的算法工程师两者都要精通。"

---

## 17.1 时间优化技巧

### 17.1.1 降低常数因子

常数因子虽然不影响大 O 复杂度，但在竞赛和面试中往往是 10 倍甚至 100 倍的差距。

**用数组代替 ArrayList（处理基本类型时）**

ArrayList 的每次 `get()` 和 `set()` 都涉及方法调用和边界检查。而原始数组直接通过内存偏移访问，速度快得多。更重要的是，ArrayList\<Integer\> 对每个元素都装箱成了 Integer 对象，带来了额外的内存分配和 GC 压力。

```java
// 慢：ArrayList<Integer>
List<Integer> list = new ArrayList<>();
for (int i = 0; i < 1000000; i++) list.add(i);
int sum = 0;
for (int v : list) sum += v;  // 每次拆箱

// 快：int[]
int[] arr = new int[1000000];
for (int i = 0; i < 1000000; i++) arr[i] = i;
int sum = 0;
for (int v : arr) sum += v;   // 无装箱开销
```

**避免装箱**

在涉及大量数值计算的场景中，优先使用 `int[]`、`long[]`、`double[]` 而非 `List<Integer>`、`List<Long>`。如果必须使用集合框架，考虑 `IntArrayList` 等第三方库（如 Eclipse Collections）。

**减少方法调用**

JVM 的内联优化虽然能消除部分方法调用开销，但不要依赖它。热点路径上的方法调用尽量少——用局部变量缓存重复访问的字段值。

```java
// 优化前：每次循环都访问 this.size
for (int i = 0; i < this.size; i++) { ... }

// 优化后：用局部变量缓存
int n = this.size;
for (int i = 0; i < n; i++) { ... }
```

### 17.1.2 降低复杂度类别

将 O(n²) 优化为 O(n log n) 或 O(n) 是算法优化的核心追求。

**常见降维手段：**

| 原始复杂度 | 优化方法 | 优化后复杂度 |
|:--:|:--|:--:|
| O(n²) | 哈希表替代双重循环 | O(n) |
| O(n²) | 排序 + 双指针 | O(n log n) |
| O(n²) | 单调栈/单调队列 | O(n) |
| O(n²) | 前缀和预处理 | O(n) |
| O(n³) | Floyd → n 次 Dijkstra | O(n² log n) |
| O(2ⁿ) | 动态规划 | O(n²) 或 O(n×W) |

**典型案例：两数之和**

```java
// O(n²) 暴力
for (int i = 0; i < n; i++)
    for (int j = i + 1; j < n; j++)
        if (nums[i] + nums[j] == target) ...

// O(n) 哈希表
Map<Integer, Integer> map = new HashMap<>();
for (int i = 0; i < n; i++) {
    int complement = target - nums[i];
    if (map.containsKey(complement)) return new int[]{map.get(complement), i};
    map.put(nums[i], i);
}
```

### 17.1.3 摊还分析与均摊优化

摊还分析的核心思想是：虽然某些操作的单次代价很高，但均摊到所有操作后，平均代价很低。

**典型例子：动态数组（ArrayList）扩容**

每次扩容都需要将旧数组的所有元素复制到新数组（O(n) 操作）。但如果每次扩容都翻倍，则 n 次插入的均摊代价为 O(1)。

```
插入次数:   1  2  3  4  5  6  7  8  9  ...
实际代价:   1  2  3  1  5  1  1  1  9  ...
               (扩容)    (扩容)       (扩容)
均摊代价 ≈ 3
```

分析：每次复制操作覆盖之前若干次插入「省下」的代价，总操作成本为 O(n)。

**其他摊还优化场景：**
- 并查集（Union-Find）的路径压缩 + 按秩合并 → 几乎 O(1)
- 二叉堆的 `pop()` → O(log n) 但 adjust 是 O(log n) 均摊
- 伸展树（Splay Tree）的均摊 O(log n)

### 17.1.4 预计算与预处理

**前缀和（Prefix Sum）**

将区间求和从 O(n) 降为 O(1)：

```java
// 预处理 O(n)
int[] prefix = new int[n + 1];
for (int i = 0; i < n; i++)
    prefix[i + 1] = prefix[i] + nums[i];

// 区间 [L, R] 求和 O(1)
// sum(L, R) = prefix[R + 1] - prefix[L]
```

**二维前缀和**

子矩阵求和 O(1)：

```java
// sum[r2][c2] - sum[r1-1][c2] - sum[r2][c1-1] + sum[r1-1][c1-1]
```

**下一个更大元素预处理（单调栈）**

```java
int[] nextGreater = new int[n];
Arrays.fill(nextGreater, -1);
Deque<Integer> stack = new ArrayDeque<>();
for (int i = 0; i < n; i++) {
    while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) {
        nextGreater[stack.pop()] = i;
    }
    stack.push(i);
}
```

预处理一次，后续每次查询 O(1)。

**其他常用预计算：**
- `prefMin[i]` = 前缀最小值
- `suffixMax[i]` = 后缀最大值
- 差分数组（区间增量更新，最后统一求值）
- 稀疏表（Sparse Table）——RMQ O(1) 查询
- 常见数字的质因数分解表

### 17.1.5 惰性求值与短路

**短路的威力：**

```java
// 用 if-else 顺序避免不必要的计算
if (a != null && a.isValid() && a.getValue() > 100) { ... }

// 一旦 a == null，后面不再执行
```

在复杂业务逻辑中，合理排列条件判断的顺序——把计算代价低、筛选能力强的条件放在前面。

**惰性展开：**

延迟计算直到真正需要结果时。例如在遍历中，只在需要时才创建对象，而不是预先准备好所有可能的值。

```java
// 传统方式：预先计算所有结果
List<Result> results = new ArrayList<>();
for (Data d : allData) results.add(expensiveCompute(d));

// 惰性方式：用迭代器按需计算
Iterator<Result> lazyResults = new Iterator<>() {
    int index = 0;
    public boolean hasNext() { return index < allData.size(); }
    public Result next() {
        return expensiveCompute(allData.get(index++));
    }
};
```

---

## 17.2 空间优化技巧

### 17.2.1 原地算法

原地算法的核心是要求额外空间为 O(1)——直接在输入数据上修改。

**经典原地算法：**

1. **数组反转**
```java
void reverse(int[] arr) {
    int i = 0, j = arr.length - 1;
    while (i < j) {
        int t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        i++; j--;
    }
}
```

2. **原地数组去重**（接雨水双指针）
3. **原地矩阵旋转**（先转置再翻转）
4. **原地洗牌**（Fisher-Yates）

**原地归并的技巧：**

若两个有序子数组合并时有足够的尾部空间，可以从后向前合并，避免额外数组。

```java
// nums1 有足够空间容纳 nums1 + nums2
void merge(int[] nums1, int m, int[] nums2, int n) {
    int p = m + n - 1, p1 = m - 1, p2 = n - 1;
    while (p2 >= 0) {
        if (p1 >= 0 && nums1[p1] > nums2[p2]) {
            nums1[p--] = nums1[p1--];
        } else {
            nums1[p--] = nums2[p2--];
        }
    }
}
```

### 17.2.2 滚动数组（Sliding Array）

用于将 DP 的空间复杂度从 O(n) 压缩到 O(1) 或 O(k)（k 为常数）。

**斐波那契数列：**

```java
// O(n) 空间
int[] dp = new int[n];
dp[0] = 0; dp[1] = 1;
for (int i = 2; i < n; i++) dp[i] = dp[i-1] + dp[i-2];

// O(1) 空间（滚动数组）
int a = 0, b = 1;
for (int i = 2; i < n; i++) {
    int c = a + b;
    a = b;
    b = c;
}
```

**0/1 背包的空间优化（二维→一维）：**

```java
// O(n×W) 空间
int[][] dp = new int[n + 1][W + 1];

// O(W) 空间（滚动数组，j 必须逆序）
int[] dp = new int[W + 1];
for (int i = 0; i < n; i++)
    for (int j = W; j >= w[i]; j--)
        dp[j] = Math.max(dp[j], dp[j - w[i]] + v[i]);
```

**LCS 的空间优化：**

当只需要最长公共子串的长度时，可以只用两行：

```java
int[] prev = new int[m + 1];
for (int i = 1; i <= n; i++) {
    int[] cur = new int[m + 1];
    for (int j = 1; j <= m; j++) {
        if (a[i-1] == b[j-1]) cur[j] = prev[j-1] + 1;
        else cur[j] = Math.max(prev[j], cur[j-1]);
    }
    prev = cur;
}
// prev[m] = LCS 长度
```

### 17.2.3 位压缩（使用 int 作为位集）

当需要存储布尔值集合时，一个 int 可以表示 32 个状态，比 boolean[] 节省 32 倍空间。

```java
// boolean[] 占用 n 字节（每个 boolean 在 JVM 中实际占 1 字节）
boolean[] visited = new boolean[n];

// BitSet 方式：n/32 个字
int[] bitSet = new int[(n + 31) / 32];

void set(int i) { bitSet[i >> 5] |= (1 << (i & 31)); }
boolean get(int i) { return (bitSet[i >> 5] & (1 << (i & 31))) != 0; }
```

**实战案例——N 皇后问题的状态压缩**（用三个 int 表示列和对角线占用）。

### 17.2.4 享元模式（Flyweight）

当大量对象具有重复的内部状态时，将共享状态提取出来复用。

```java
// 优化前：每个字符一个对象
class Character {
    char ch;
    int x, y;          // 外部状态
    String font;       // 内部状态，大量重复
    int size;          // 内部状态，大量重复
}

// 优化后：内部状态共享
class FlyweightChar {
    char ch;
    String font;
    int size;
}

// 每个字符位置的坐标作为外部状态传入
```

### 17.2.5 时间与空间的权衡

| 用空间换时间 | 用时间换空间 |
|:--|:--|
| 缓存计算结果（Memoization） | 重新计算而非存储 |
| 哈希表加速查找 | 遍历查找 |
| 数据库索引 | 全表扫描 |
| 内存映射文件 | 按需读取 |

**经典例子——计算组合数 C(n,k)：**

```java
// 用时间换空间：每次递归计算
int C(int n, int k) {
    if (k == 0 || k == n) return 1;
    return C(n-1, k-1) + C(n-1, k);
}

// 用空间换时间：杨辉三角预计算
int[][] C = new int[n + 1][n + 1];
for (int i = 0; i <= n; i++) {
    C[i][0] = C[i][i] = 1;
    for (int j = 1; j < i; j++)
        C[i][j] = C[i-1][j-1] + C[i-1][j];
}
```

---

## 17.3 并行算法基础

### 17.3.1 Fork/Join 框架

Java 7 引入的 Fork/Join 框架是分治思想在并行计算中的体现：一个大任务被递归拆分为子任务（fork），然后合并子任务结果（join）。

**核心类：**
- `ForkJoinPool`——工作窃取（work-stealing）线程池
- `RecursiveTask<V>`——有返回值的并行任务
- `RecursiveAction`——无返回值的并行任务

**计算数组和的并行版本：**

```java
class SumTask extends RecursiveTask<Long> {
    static final int THRESHOLD = 10000;
    int[] arr; int lo, hi;

    SumTask(int[] arr, int lo, int hi) { this.arr = arr; this.lo = lo; this.hi = hi; }

    protected Long compute() {
        if (hi - lo < THRESHOLD) {
            long sum = 0;
            for (int i = lo; i < hi; i++) sum += arr[i];
            return sum;
        }
        int mid = (lo + hi) / 2;
        SumTask left = new SumTask(arr, lo, mid);
        SumTask right = new SumTask(arr, mid, hi);
        left.fork();               // 异步执行左半
        long rightResult = right.compute();  // 当前线程执行右半
        long leftResult = left.join();       // 等待左半结果
        return leftResult + rightResult;
    }
}
```

### 17.3.2 并行前缀和（Parallel Prefix Sum）

前缀和看起来是顺序的（每个结果依赖前一个），但可以通过**平衡树**方法并行化——分两步：

1. **向上归约（reduce）**：构建二叉树，每个节点存子树和
2. **向下分发（down-sweep）**：从根向下，每个节点将父节点的前缀和传给子节点

两种方法的比较：

| 方法 | 时间复杂度（P 个处理器） |
|:--|:--:|
| 顺序扫描 | O(n) |
| 并行扫描（平衡树） | O(n/P + log P) |
| 完美并行 | O(log n)（当 P = n 时） |

### 17.3.3 并行快速排序

在递归划分时，对子数组的排序可以并行执行：

```java
class ParallelQuickSort extends RecursiveAction {
    int[] arr; int lo, hi;
    static final int THRESHOLD = 10000;

    protected void compute() {
        if (hi - lo < THRESHOLD) {
            Arrays.sort(arr, lo, hi);  // 串行排序
            return;
        }
        int p = partition(arr, lo, hi);
        ParallelQuickSort left  = new ParallelQuickSort(arr, lo, p);
        ParallelQuickSort right = new ParallelQuickSort(arr, p + 1, hi);
        invokeAll(left, right);  // 两个子任务并行执行
    }
}
```

### 17.3.4 MapReduce 思想模型

MapReduce 是一种编程模型，不是具体实现：

1. **Map 阶段**：将输入数据映射为键值对 `(K, V)`
2. **Shuffle 阶段**：系统自动按键分组（无需手动编码）
3. **Reduce 阶段**：对每个键的一组值进行归约

```java
// MapReduce 风格的词频统计
// Map：(word, 1) 对每个单词
// Reduce：对相同 word 的 value 求和

// 伪代码
map(String key, String document):
    for each word w in document:
        emit(w, 1)

reduce(String key, Iterator<Integer> counts):
    int sum = 0;
    for each c in counts: sum += c;
    emit(key, sum);
```

在单机场景下，`parallelStream()` 配合 `Collectors.groupingByConcurrent()` 可以模拟 MapReduce：

```java
Map<String, Long> wordCount = words.parallelStream()
    .collect(Collectors.groupingByConcurrent(
        Function.identity(), Collectors.counting()));
```

### 17.3.5 Amdahl 定律与何时需要并行化

Amdahl 定律给出了并行化的理论加速上限：

```
Speedup = 1 / ( (1 - P) + P/N )
```

其中：
- P = 可并行化部分的比例
- N = 处理器核心数
- (1 - P) = 必须串行执行的比例

**关键启示：**
- P = 0.9（90% 可并行）时，16 核加速仅 6.4 倍
- P = 0.99（99% 可并行）时，16 核加速约 13.9 倍
- 少量串行瓶颈就能显著限制加速比

**实际指导：**
- 1-2 核心的小任务 → 不太值得并行
- 单次耗时 > 1ms 且数据量大的任务 → 可以考虑
- 必须串行的 I/O、锁争用 → 可能是瓶颈
- 小数组的排序、求和 → 并行化的开销可能超过收益

---

## 17.4 缓存优化策略

### 17.4.1 Cache 友好的算法

CPU 缓存的延迟差距：
| 层次 | 延迟 | 大小 |
|:--:|:--:|:--:|
| L1 | ~1ns（4 周期） | 32KB |
| L2 | ~5ns（12 周期） | 256KB |
| L3 | ~15ns（40 周期） | 8-32MB |
| 主存 | ~100ns（250 周期） | 64GB+ |

**顺序内存访问 vs 随机跳转：**

```java
// 快：顺序访问（row-major）
int sum = 0;
for (int i = 0; i < n; i++)
    for (int j = 0; j < n; j++)
        sum += matrix[i][j];  // 命中缓存

// 慢：跳跃访问（column-major）
int sum = 0;
for (int j = 0; j < n; j++)
    for (int i = 0; i < n; i++)
        sum += matrix[i][j];  // 缓存未命中
```

**避免指针追逐（pointer chasing）：**

链表遍历比数组遍历慢得多，因为每个节点在内存中可能不连续，每次 `next` 访问都可能触发缓存缺失。

```java
// 快：连续内存的数组
for (int i = 0; i < n; i++) sum += arr[i];

// 慢：不连续内存的链表
Node cur = head;
while (cur != null) { sum += cur.val; cur = cur.next; }
```

### 17.4.2 循环分块（Loop Tiling/Blocking）

矩阵乘法 `C = A × B` 的朴素实现缓存极不友好——内层循环访问 B 时发生大量缓存缺失：

```java
// 朴素 O(n³)：缓存不友好
for (int i = 0; i < n; i++)
    for (int j = 0; j < n; j++)
        for (int k = 0; k < n; k++)
            C[i][j] += A[i][k] * B[k][j];  // B[k][j] 跳跃访问
```

改进思路：将矩阵分成小块（block），每个块完全在缓存中运算完再处理下一个块。

```java
// 分块矩阵乘法
int B = 64;  // 块大小（根据 L1 cache 大小调整）
for (int ii = 0; ii < n; ii += B)
    for (int jj = 0; jj < n; jj += B)
        for (int kk = 0; kk < n; kk += B)
            for (int i = ii; i < ii + B && i < n; i++)
                for (int j = jj; j < jj + B && j < n; j++)
                    for (int k = kk; k < kk + B && k < n; k++)
                        C[i][j] += A[i][k] * B[k][j];
```

内部三重循环处理的是三个 B×B 的小块，A[i][k] 和 B[k][j] 都在缓存中。

### 17.4.3 预取（Prefetching）

现代 CPU 能自动预测顺序访问模式并提前加载数据。但非连续访问模式需要手动提示：

```java
// 不需要手动优化，CPU 自动预取
for (int i = 0; i < n; i += 4) {
    sum += arr[i] + arr[i+1] + arr[i+2] + arr[i+3];
}

// 使用 prefetch 指令（JVM 不直接支持，但 JIT 可能优化）
// 替代方案：确保数据布局是顺序的
```

### 17.4.4 伪共享（False Sharing）

多线程场景下，不同线程修改同一缓存行（cache line，通常 64 字节）中的不同变量时，会导致缓存行在不同核心间频繁失效。

```java
// ❌ 伪共享：两个线程修改相邻的 long
long[] counter = new long[2];  // counter[0] 和 counter[1] 在同一缓存行
// 线程 1: counter[0]++
// 线程 2: counter[1]++

// ✅ 使用 padding 避免伪共享
class PaddedCounter {
    volatile long value;
    long p1, p2, p3, p4, p5, p6;  // padding 到 64 字节
}
```

Java 8 提供了 `@Contended` 注解（需要 JVM 参数 `-XX:-RestrictContended`）：

```java
@sun.misc.Contended
class Counter {
    volatile long value;
}
```

---

## 本章小结

性能优化不是一蹴而就的工程，需要在正确性、可读性和性能之间找到平衡。本章的核心要点：

1. **先做对，再优化。** 正确的基准测试比直觉更可靠。
2. **从算法层面优化（降复杂度）优先于常数因子优化。** O(n²) 到 O(n log n) 的收益远超微优化。
3. **缓存是新的内存层次。** 现代 CPU 大部分时间花在等待数据上，缓存友好的数据结构是关键。
4. **并行不是银弹。** Amdahl 定律告诉我们串行瓶颈是硬天花板。只对大任务并行，小任务的开销吃掉收益。
5. **测了再说。** 用 JMH 等工具做微基准测试，不要靠猜测。

下一章我们将把目光投向真实世界的算法——搜索引擎、推荐系统、分布式系统和大数据中那些每天都在发挥巨大作用的算法。