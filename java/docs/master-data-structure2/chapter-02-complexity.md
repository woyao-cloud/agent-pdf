# 第2章 复杂度分析

## 2.1 时间复杂度

### 解决的问题

在编写代码时，我们经常需要判断"这段代码跑得快不快"。时间复杂度就是衡量算法运行时间随数据规模增长趋势的标尺。它不关心具体的执行时间（这取决于硬件），而是关注 **当数据量增大时，运行时间如何变化**。

> **核心价值**：时间复杂度帮助你在不运行代码的情况下，就能判断算法在大规模数据下的表现。

### 实现原理

**大O表示法（Big O Notation）** 是最常用的时间复杂度表示方法。它描述的是算法执行时间的**增长率上界**，即最坏情况下的时间复杂度。

常见的时间复杂度按效率排序：

```
O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ) < O(n!)
```

| 复杂度 | 名称 | 10条数据 | 100万条数据 | 典型算法 |
|-------|------|---------|------------|---------|
| O(1) | 常数阶 | 1 | 1 | 数组随机访问 |
| O(log n) | 对数阶 | ~3 | ~20 | 二分查找 |
| O(n) | 线性阶 | 10 | 100万 | 线性查找 |
| O(n log n) | 线性对数阶 | ~33 | ~2000万 | 归并排序 |
| O(n²) | 平方阶 | 100 | 10¹² | 冒泡排序 |
| O(2ⁿ) | 指数阶 | 1024 | 不可计算 | 斐波那契递归 |

**时间复杂度的计算规则**：

1. **忽略常数项**：O(2n) = O(n)，O(n/2) = O(n)
2. **忽略低阶项**：O(n² + n) = O(n²)
3. **乘法法则**：嵌套循环的复杂度相乘
4. **加法法则**：顺序执行的代码取最大值

### 代码实现

```java
/**
 * 各种时间复杂度的代码示例
 */
public class TimeComplexityDemo {
    
    // O(1) —— 常数阶：与数据规模无关
    public int getFirst(int[] arr) {
        return arr[0];  // 无论数组多大，都只执行1次
    }
    
    // O(log n) —— 对数阶：每次循环规模减半
    public int binarySearch(int[] sortedArr, int target) {
        int left = 0, right = sortedArr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (sortedArr[mid] == target) return mid;
            if (sortedArr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }
    // 循环次数 = log₂(n)，所以 O(log n)
    
    // O(n) —— 线性阶：循环次数与n成正比
    public int findMax(int[] arr) {
        int max = arr[0];
        for (int i = 1; i < arr.length; i++) {  // 执行n次
            if (arr[i] > max) max = arr[i];
        }
        return max;
    }
    
    // O(n log n) —— 线性对数阶
    public void mergeSort(int[] arr, int left, int right) {
        if (left < right) {
            int mid = left + (right - left) / 2;
            mergeSort(arr, left, mid);     // 拆分 O(log n)层
            mergeSort(arr, mid + 1, right);
            merge(arr, left, mid, right);  // 每层合并 O(n)
        }
    }
    // 每层O(n)，共log n层 → O(n log n)
    
    // O(n²) —— 平方阶：双层嵌套
    public void bubbleSort(int[] arr) {
        for (int i = 0; i < arr.length - 1; i++) {       // n次
            for (int j = 0; j < arr.length - 1 - i; j++) { // n次
                if (arr[j] > arr[j + 1]) {
                    swap(arr, j, j + 1);
                }
            }
        }
    }
    // 总执行次数 ≈ n²/2 → O(n²)
    
    // O(2ⁿ) —— 指数阶：递归树爆炸
    public int fib(int n) {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);  // 每次调用分裂为2个
    }
    // fib(100) 需要计算约 2¹⁰⁰ 次，宇宙毁灭都算不完
    
    private void swap(int[] arr, int i, int j) {
        int temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    
    private void merge(int[] arr, int left, int mid, int right) {
        // 归并排序的合并操作
        int[] temp = new int[right - left + 1];
        int i = left, j = mid + 1, k = 0;
        while (i <= mid && j <= right) {
            temp[k++] = arr[i] <= arr[j] ? arr[i++] : arr[j++];
        }
        while (i <= mid) temp[k++] = arr[i++];
        while (j <= right) temp[k++] = arr[j++];
        System.arraycopy(temp, 0, arr, left, temp.length);
    }
}
```

### 使用场景

- **算法选型**：面试和工程中选择合适的算法
- **架构设计**：预估系统能支撑的数据量级
- **性能评估**：衡量代码优化前后的提升
- **容量规划**：根据数据增长预估所需资源

### 潜在风险与问题

- **忽略常数因子**：O(100n) 和 O(n) 都是 O(n)，但实际性能差100倍
- **平均复杂度 vs 最坏复杂度**：快速排序平均O(n log n)，但最坏O(n²)
- **忽略空间复杂度**：只关注时间，不考虑内存消耗
- **小数据量下的误判**：O(n²)的算法在小数据下可能比O(n log n)快（常数因子小）

### 优化策略

- 优先优化最内层循环的代码
- 善用空间换时间（缓存、预计算）
- 使用更高效的数据结构（如HashMap代替List查找）
- 利用短路求值减少不必要的计算

### 典型问题处理

**面试题：这段代码的时间复杂度是多少？**

```java
for (int i = 0; i < n; i++) {       // 外层n次
    for (int j = i; j < n; j++) {    // 内层n-i次
        // O(1) 操作
    }
}
```

总执行次数 = n + (n-1) + (n-2) + ... + 1 = n(n+1)/2 = O(n²)

---

## 2.2 空间复杂度

### 解决的问题

空间复杂度衡量算法运行过程中占用的内存空间随数据规模增长的趋势。在内存受限的场景（如嵌入式系统、移动端）或处理海量数据时，空间复杂度往往比时间复杂度更关键。

> **核心价值**：理解空间复杂度，避免写出"内存怪兽"般的代码。

### 实现原理

空间复杂度同样使用大O表示法，关注的是**额外内存**的增长趋势。

| 复杂度 | 含义 | 示例 |
|-------|------|------|
| O(1) | 常数空间 | 只使用固定几个变量 |
| O(n) | 线性空间 | 创建了一个大小为n的辅助数组 |
| O(n²) | 平方空间 | 创建了n×n的二维数组 |
| O(log n) | 对数空间 | 递归调用的栈深度 |

**空间复杂度的计算要点**：
- 只计算额外空间（不包括输入数据本身占用的空间）
- 递归调用需要考虑调用栈的空间
- 多个变量同时存在时取最大值

### 代码实现

```java
/**
 * 各种空间复杂度示例
 */
public class SpaceComplexityDemo {
    
    // O(1) —— 只用了常数个变量
    public int sum(int[] arr) {
        int sum = 0;              // 1个变量
        for (int num : arr) {
            sum += num;
        }
        return sum;
    }
    
    // O(n) —— 创建了一个大小为n的辅助数组
    public int[] duplicate(int[] arr) {
        int[] result = new int[arr.length];  // 额外O(n)空间
        System.arraycopy(arr, 0, result, 0, arr.length);
        return result;
    }
    
    // O(n) —— 递归调用栈
    public int factorial(int n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);  // 递归深度n，栈空间O(n)
    }
    
    // O(n²) —— 创建了二维数组
    public int[][] createMatrix(int n) {
        int[][] matrix = new int[n][n];  // n×n = O(n²)空间
        return matrix;
    }
    
    // 空间优化示例：原地算法 O(1)
    public void reverseInPlace(int[] arr) {
        int left = 0, right = arr.length - 1;
        while (left < right) {
            int temp = arr[left];
            arr[left] = arr[right];
            arr[right] = temp;
            left++;
            right--;
        }
    }
    // 对比：如果创建新数组返回，则需要O(n)空间
}
```

### 使用场景

- **内存受限环境**：移动端、嵌入式系统、大数据处理
- **缓存设计**：权衡缓存大小和命中率
- **流式处理**：只能使用O(1)空间的场景
- **递归算法**：避免栈溢出（StackOverflowError）

### 潜在风险与问题

- **Java的自动装箱**：int → Integer 带来额外内存开销（约4倍）
- **String的substring()**：Java 7+ 每次创建新字符串，旧版本共享char[]
- **集合的默认容量**：ArrayList空列表占用10个对象空间（Java 8+ 优化为懒加载）
- **递归过深**：导致StackOverflowError

### 优化策略

- 优先使用基本类型（int[] 优于 Integer[]）
- 使用原地算法（in-place）减少额外空间
- 使用StringBuilder而非String拼接
- 明确集合的初始容量
- 用迭代代替递归（将O(n)栈空间降为O(1)）

### 典型问题处理

**面试题：如何判断一个链表是否有环，要求O(1)空间？**

使用快慢指针法（Floyd判圈算法）：
```java
public boolean hasCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) return true;
    }
    return false;
}
```
只用两个指针，空间复杂度O(1)。如果使用HashSet则需要O(n)空间。

---

## 2.3 递归算法分析

### 解决的问题

递归是数据结构和算法中的重要工具（树遍历、分治、动态规划），但递归的时间复杂度分析比迭代复杂得多。掌握递归分析方法是深入理解高级算法的基础。

> **核心价值**：学会用递推公式和主定理分析递归算法的时间复杂度。

### 实现原理

递归算法的时间复杂度分析主要有两种方法：

**方法一：递推公式法（Recurrence Relation）**

```
T(n) = a·T(n/b) + f(n)
```
- a：递归子问题的数量
- n/b：每个子问题的规模
- f(n)：合并子问题结果的开销

**方法二：主定理（Master Theorem）**

对于形如 T(n) = a·T(n/b) + O(nᵈ) 的递推关系：
- 如果 log_b(a) > d：T(n) = O(n^log_b(a))
- 如果 log_b(a) = d：T(n) = O(nᵈ·log n)
- 如果 log_b(a) < d：T(n) = O(nᵈ)

| 算法 | 递推关系 | 时间复杂度 |
|------|---------|-----------|
| 二分查找 | T(n) = T(n/2) + O(1) | O(log n) |
| 归并排序 | T(n) = 2·T(n/2) + O(n) | O(n log n) |
| 斐波那契（朴素） | T(n) = T(n-1) + T(n-2) + O(1) | O(2ⁿ) |
| 二叉树遍历 | T(n) = 2·T(n/2) + O(1) | O(n) |

### 代码实现

```java
/**
 * 递归算法分析示例
 */
public class RecursionAnalysis {
    
    // 例1：二分查找 —— O(log n)
    // 递推公式：T(n) = T(n/2) + O(1)
    // 主定理：a=1, b=2, d=0, log_2(1)=0=d → O(log n)
    public int binarySearchRecursive(int[] arr, int target, int left, int right) {
        if (left > right) return -1;
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] > target) {
            return binarySearchRecursive(arr, target, left, mid - 1);
        }
        return binarySearchRecursive(arr, target, mid + 1, right);
    }
    
    // 例2：归并排序 —— O(n log n)
    // 递推公式：T(n) = 2·T(n/2) + O(n)
    // 主定理：a=2, b=2, d=1, log_2(2)=1=d → O(n log n)
    public void mergeSort(int[] arr, int left, int right) {
        if (left < right) {
            int mid = left + (right - left) / 2;
            mergeSort(arr, left, mid);       // 左半 T(n/2)
            mergeSort(arr, mid + 1, right);  // 右半 T(n/2)
            merge(arr, left, mid, right);    // 合并 O(n)
        }
    }
    
    // 例3：斐波那契（优化版）—— O(n)
    // 使用记忆化递归消除重复计算
    public int fibOptimized(int n, int[] memo) {
        if (n <= 1) return n;
        if (memo[n] != 0) return memo[n];  // 已计算过直接返回
        memo[n] = fibOptimized(n - 1, memo) + fibOptimized(n - 2, memo);
        return memo[n];
    }
    // 每个n只计算1次 → O(n)
    
    // 例4：汉诺塔 —— O(2ⁿ)
    // 递推公式：T(n) = 2·T(n-1) + O(1) → O(2ⁿ)
    public void hanoi(int n, char from, char to, char aux) {
        if (n == 1) {
            System.out.println("Move disk 1 from " + from + " to " + to);
            return;
        }
        hanoi(n - 1, from, aux, to);  // 移走n-1个
        System.out.println("Move disk " + n + " from " + from + " to " + to);
        hanoi(n - 1, aux, to, from);  // 移回n-1个
    }
    
    private void merge(int[] arr, int left, int mid, int right) {
        int[] temp = new int[right - left + 1];
        int i = left, j = mid + 1, k = 0;
        while (i <= mid && j <= right) {
            temp[k++] = arr[i] <= arr[j] ? arr[i++] : arr[j++];
        }
        while (i <= mid) temp[k++] = arr[i++];
        while (j <= right) temp[k++] = arr[j++];
        System.arraycopy(temp, 0, arr, left, temp.length);
    }
}
```

### 使用场景

- **分治算法分析**：归并排序、快速排序、大数乘法
- **树形结构操作**：二叉树遍历、B树搜索
- **动态规划**：状态转移方程本质上就是递推公式
- **回溯算法**：N皇后、全排列的复杂度分析

### 潜在风险与问题

- **栈溢出**：递归深度过大导致StackOverflowError
- **重复计算**：未使用记忆化导致指数级爆炸
- **尾递归优化**：Java不支持尾递归优化，不能像函数式语言那样优化
- **分析误区**：混淆递归深度和总调用次数

### 优化策略

- 使用记忆化递归（Memoization）消除重复计算
- 用迭代代替递归（如用循环实现斐波那契）
- 使用尾递归形式（虽然Java不优化，但便于转换为迭代）
- 增大栈空间（-Xss参数），但治标不治本

### 典型问题处理

**面试题：分析快速排序的时间复杂度**

- 最好情况：每次pivot在中间 → T(n) = 2·T(n/2) + O(n) → O(n log n)
- 最坏情况：数组已有序 → T(n) = T(n-1) + O(n) → O(n²)
- 平均情况：随机选择pivot → O(n log n)

---

## 2.4 摊销分析

### 解决的问题

有些操作偶尔很慢，但大多数时候很快。如果用最坏时间复杂度来评估，会高估实际运行成本。摊销分析（Amortized Analysis）解决了这个问题——它评估**一系列操作**的平均时间复杂度。

> **核心价值**：理解为什么ArrayList的add()虽然是O(1)——因为扩容的O(n)成本被摊销到了之前的n次O(1)操作中。

### 实现原理

摊销分析的三种常用方法：

**1. 聚合分析（Aggregate Analysis）**
- 计算n次操作的总时间 T(n)
- 摊销成本 = T(n) / n

**2. 记账法（Accounting Method）**
- 为廉价操作"多收"费用，存入信用
- 昂贵操作使用累积的信用支付

**3. 势能法（Potential Method）**
- 定义势能函数 Φ(Dᵢ)
- 摊销成本 = 实际成本 + Φ(Dᵢ) - Φ(Dᵢ₋₁)

### 代码实现

```java
/**
 * 摊销分析示例：ArrayList的扩容机制
 */
public class AmortizedAnalysisDemo {
    
    // 简化的ArrayList扩容实现
    static class SimpleArrayList<E> {
        private Object[] data;
        private int size;
        private int operationCount = 0;
        private long totalCost = 0;
        
        public SimpleArrayList() {
            data = new Object[1];  // 初始容量1，方便观察
        }
        
        public void add(E e) {
            long startTime = System.nanoTime();
            
            if (size == data.length) {
                // 扩容操作：复制整个数组 —— O(n)
                Object[] newData = new Object[data.length * 2];
                System.arraycopy(data, 0, newData, 0, data.length);
                data = newData;
            }
            data[size++] = e;
            
            long cost = System.nanoTime() - startTime;
            totalCost += cost;
            operationCount++;
            
            if (operationCount <= 16) {
                System.out.printf("操作%d: size=%d, 实际耗时=%dns, 平均摊销=%dns%n",
                    operationCount, size, cost, totalCost / operationCount);
            }
        }
    }
    
    public static void main(String[] args) {
        SimpleArrayList<Integer> list = new SimpleArrayList<>();
        
        // 观察：扩容操作（1→2→4→8→16）的耗时
        for (int i = 0; i < 16; i++) {
            list.add(i);
        }
        // 结论：虽然个别扩容操作很慢（复制数组），
        // 但平摊到所有操作上，add()的摊销成本仍然是O(1)
        
        // 数学证明：
        // 总复制次数 = 1 + 2 + 4 + 8 = 15（最后一个扩容到16）
        // 总操作数 = 16
        // 摊销成本 = 15/16 + 1 ≈ 2（常数）
        // 所以 ArrayList.add() 的摊销时间复杂度是 O(1)！
    }
}
```

**HashMap的rehash摊销分析**：

```java
/**
 * HashMap扩容的摊销分析
 * 每次扩容需要重新计算所有key的hash，并将entry移到新的桶数组中
 */
public class HashMapAmortizedAnalysis {
    // HashMap扩容策略：
    // 负载因子 = 0.75
    // 容量翻倍：oldCapacity × 2
    
    // 分析：
    // 初始容量16，扩容到... → 32, 64, 128, 256
    // 总rehash成本 = 16 + 32 + 64 + 128 + ... + n/2 ≈ n
    // 总put操作数 = n
    // 摊销成本 = n/n = O(1)
}
```

### 使用场景

- **动态数组（ArrayList）**：扩容操作的成本摊销
- **HashMap/ HashSet**：rehash操作的成本摊销
- **二叉堆**：插入操作的向上调整
- **伸展树（Splay Tree）**：每次操作后调整树结构

### 潜在风险与问题

- **混淆最坏和摊销**：虽然摊销是O(1)，但单次操作可能是O(n)（如扩容时）
- **实时系统不可用**：实时系统要求每次操作都在时限内完成，摊销分析不适用
- **不考虑内存碎片**：摊销分析只关注时间，不考虑扩容带来的内存碎片

### 优化策略

- **预分配容量**：如果能预知数据量，提前指定容量避免扩容
- **选择合适的增长因子**：ArrayList是1.5倍，HashMap是2倍，各有优劣
- **实时系统**：使用分段数据结构（如分段的Hash表）避免单次大延迟

### 典型问题处理

**面试题：为什么ArrayList的add()是O(1)而不是O(n)？**

因为扩容操作不是每次add()都发生。每次扩容后，后续n/2次add()都不需要扩容。将扩容的O(n)成本平摊到之前的所有操作上，每个操作的平均成本是O(1)。数学证明：n次add()操作的总复杂度是O(n)，所以摊销O(1)。

---

## 2.5 实战：性能分析工具与技巧

### 解决的问题

理论分析告诉你"应该"快，但实际跑起来"到底"多快？本节介绍Java生态中的性能分析工具，将复杂度理论应用于实际工程。

> **核心价值**：学会用工具验证复杂度的理论分析结果，发现真正的性能瓶颈。

### 实现原理

Java性能分析工具栈：

```
工具层次
├── 微基准测试：JMH（Java Microbenchmark Harness）
│   └── 精确测量小段代码的性能
├── 性能剖析：JProfiler、VisualVM、Async Profiler
│   └── 分析CPU和内存热点
├── 日志分析：JFR（Java Flight Recorder）
│   └── 低开销的运行时监控
└── 在线监控：Prometheus + Grafana、Arthas
    └── 生产环境的持续监控
```

### 代码实现

```java
// ============ 使用JMH进行微基准测试 ============
// Maven依赖：
// org.openjdk.jmh:jmh-core:1.35
// org.openjdk.jmh:jmh-generator-annprocess:1.35

import org.openjdk.jmh.annotations.*;
import org.openjdk.jmh.infra.Blackhole;
import java.util.*;
import java.util.concurrent.TimeUnit;

@BenchmarkMode(Mode.AverageTime)    // 测量平均时间
@OutputTimeUnit(TimeUnit.NANOSECONDS)  // 纳秒精度
@State(Scope.Thread)
@Warmup(iterations = 3, time = 1)     // 预热3轮
@Measurement(iterations = 5, time = 1) // 正式测量5轮
@Fork(1)
public class DataStructureBenchmark {
    
    // 不同数据量下的性能对比
    @Param({"1000", "10000", "100000"})
    private int size;
    
    private List<Integer> arrayList;
    private List<Integer> linkedList;
    private Set<Integer> hashSet;
    private Set<Integer> treeSet;
    private int target;
    
    @Setup
    public void setup() {
        arrayList = new ArrayList<>();
        linkedList = new LinkedList<>();
        hashSet = new HashSet<>();
        treeSet = new TreeSet<>();
        
        Random random = new Random(42);
        for (int i = 0; i < size; i++) {
            int val = random.nextInt();
            arrayList.add(val);
            linkedList.add(val);
            hashSet.add(val);
            treeSet.add(val);
        }
        // 取一个不存在的值，测最坏情况
        target = Integer.MAX_VALUE;
    }
    
    @Benchmark
    public void arrayListContains(Blackhole bh) {
        bh.consume(arrayList.contains(target));  // O(n)
    }
    
    @Benchmark
    public void linkedListContains(Blackhole bh) {
        bh.consume(linkedList.contains(target)); // O(n)
    }
    
    @Benchmark
    public void hashSetContains(Blackhole bh) {
        bh.consume(hashSet.contains(target));    // O(1)
    }
    
    @Benchmark
    public void treeSetContains(Blackhole bh) {
        bh.consume(treeSet.contains(target));    // O(log n)
    }
}
```

```java
// ============ 使用Arthas进行生产环境诊断 ============
// 命令行工具，无需修改代码
//
// # 安装 Arthas
// curl -O https://arthas.aliyun.com/arthas-boot.jar
// java -jar arthas-boot.jar
//
// # 常用命令
// dashboard          # 实时监控面板
// thread             # 查看线程状态
// stack com.example.MyService  # 查看方法调用栈
// trace com.example.MyService method  # 追踪方法调用链和耗时
// monitor com.example.MyService method  # 监控方法调用统计
```

```java
// ============ 使用StopWatch进行简单计时 ============
import org.springframework.util.StopWatch;

public class SimpleProfiling {
    public static void main(String[] args) {
        StopWatch stopWatch = new StopWatch("数据结构性能对比");
        
        // 测试ArrayList vs LinkedList的头部插入性能
        int dataSize = 100_000;
        
        stopWatch.start("ArrayList头部插入 " + dataSize + "条");
        List<Integer> arrayList = new ArrayList<>();
        for (int i = 0; i < dataSize; i++) {
            arrayList.add(0, i);  // 头部插入，O(n)
        }
        stopWatch.stop();
        
        stopWatch.start("LinkedList头部插入 " + dataSize + "条");
        List<Integer> linkedList = new LinkedList<>();
        for (int i = 0; i < dataSize; i++) {
            linkedList.add(0, i);  // 头部插入，O(1)
        }
        stopWatch.stop();
        
        System.out.println(stopWatch.prettyPrint());
        // 典型输出：
        // ArrayList头部插入 100000条: ~5秒
        // LinkedList头部插入 100000条: ~0.01秒
        // 差距: 500倍！
    }
}
```

### 使用场景

- **技术选型**：用JMH对比不同数据结构的性能
- **性能调优**：用Profiler定位热点方法
- **生产诊断**：用Arthas定位线上问题
- **容量规划**：用压力测试评估系统上限

### 潜在风险与问题

- **JVM预热**：未预热时测试的是JIT编译前的性能，而非真实性能
- **编译器优化**：JMH使用Blackhole防止编译器将无副作用的代码优化掉
- **测试污染**：不同测试间的相互影响（GC、缓存）
- **微基准陷阱**：在微基准测试中测量I/O操作

### 优化策略

- 使用JMH进行微基准测试，而非手动System.nanoTime()
- 测试前充分预热（通常3-5轮）
- 使用Profiler而非猜测来定位性能瓶颈
- 遵循"先测量，后优化"的原则

### 典型问题处理

**工程实践：如何验证HashMap的时间复杂度是O(1)？**

使用JMH测试不同数据量下HashMap的get()耗时。理论上，10万、100万、1000万数据的get()耗时应该基本一致。如果发现数据量大时显著变慢，说明哈希冲突严重，需要检查hashCode()的分布质量。

---

> **本章总结**：复杂度分析是评价算法和数据结构的核心工具。时间复杂度关注运行效率，空间复杂度关注内存消耗，递归分析利用递推公式和主定理，摊销分析揭示动态数据结构真实成本。配合JMH、Arthas等工具，可以在工程实践中验证和优化代码性能。