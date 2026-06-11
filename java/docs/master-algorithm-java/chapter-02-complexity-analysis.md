# 第2章 复杂度分析

> "算法分析不是魔法，它就是计数——数你的算法做了多少工作，用了多少空间。" —— 本章的目的，就是让你学会这门"计数"的艺术。

---

## 2.1 时间复杂度深度解析

### 2.1.1 为什么需要时间复杂度？

假设你写了两个排序程序，一个运行了 1 秒，另一个运行了 10 秒。哪个更好？显然第二个。但是如果数据量增大 100 倍呢？第一个可能变成 100 秒，第二个只变成 20 秒——这时第二个反而更好。

**时间复杂度就是用来描述"算法运行时间随输入规模增长的变化趋势"的工具。** 它不关心具体的毫秒数，只关心增长趋势。

### 2.1.2 大O表示法（Big O Notation）

#### 什么是大O？

**大O表示法描述的是算法在最坏情况下，运行时间的**上界**（upper bound）。** 它回答的是："这个算法最多需要多少时间？"

数学定义：

$$O(g(n)) = \{ f(n) \mid \exists c > 0, n_0 > 0, \text{使得 } 0 \leq f(n) \leq c \cdot g(n), \forall n \geq n_0 \}$$

通俗来说：存在一个常数 $c$，使得当 $n$ 足够大时，$f(n)$ 始终不超过 $c \cdot g(n)$。

#### 直观理解

想象你要比较两个公司的增长速度：

| 公司 | 去年收入 | 今年收入 | 说明 |
|------|---------|---------|------|
| A 公司（O(n)） | 100万 | 200万 | 每年翻倍？不，是线性增长 |
| B 公司（O(n²)） | 100万 | 10000万 | 增长越来越快 |

大O关心的是"当 n 很大时，趋势如何"，而不是"n 很小时的具体数字"。

### 2.1.3 大Ω和大Θ

除了大O，还有两个重要的渐进符号：

| 符号 | 含义 | 类比 |
|------|------|------|
| **大O** $O(g(n))$ | 上界，算法**最多**需要这么多时间 | "月薪不超过5万" |
| **大Ω** $\Omega(g(n))$ | 下界，算法**至少**需要这么多时间 | "月薪至少1万" |
| **大Θ** $\Theta(g(n))$ | 紧确界，算法的运行时间被卡在上下界之间 | "月薪正好在2万到3万之间" |

**大Θ是最精确的描述**，但通常很难证明，所以实践中多用大O。

#### 一个具体的例子

考虑二分查找（Binary Search）：
- **最好情况**：第一个就找到 —— $\Omega(1)$
- **最坏情况**：一直找到最后 —— $O(\log n)$
- **平均情况**：随机位置 —— $\Theta(\log n)$

大O描述的是最坏情况，这在工程中是最有意义的：**你需要知道你的算法在最差情况下能不能撑住。**

### 2.1.4 常见复杂度逐级解析

从最快到最慢，我们逐一分析每一种复杂度。

#### O(1) —— 常数时间

无论输入多大，执行时间恒定。

```java
// O(1)：直接访问数组元素
public static int getFirst(int[] arr) {
    return arr[0];  // 不管数组多大，这一步的时间是固定的
}

// O(1)：交换两个变量
public static void swap(int[] arr, int i, int j) {
    int temp = arr[i];  // 常数时间
    arr[i] = arr[j];    // 常数时间
    arr[j] = temp;      // 常数时间
    // 总共 3 条语句，无论数组长度如何，都是 3 条
}
```

**典型操作**：数组访问、哈希表查找、赋值操作、算数运算。

#### O(log n) —— 对数时间

每次操作都大幅缩小问题规模。

```java
// O(log n)：二分查找
public static int binarySearch(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    int operations = 0;  // 记录操作次数

    while (left <= right) {
        operations++;
        int mid = left + (right - left) / 2;

        if (arr[mid] == target) {
            System.out.println("  二分查找操作次数: " + operations);
            return mid;
        } else if (arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    System.out.println("  二分查找操作次数: " + operations);
    return -1;
}
```

为什么是 $\log n$？因为每次迭代，搜索范围缩小一半。对于 $n=1024$，最多只需要 $\log_2 1024 = 10$ 次操作。

**底数重要吗？** 不重要！$\log_2 n$ 和 $\log_{10} n$ 只差一个常数因子，在大O表示法中被忽略。

**典型操作**：二分查找、平衡二叉搜索树查找、某些分治算法。

#### O(n) —— 线性时间

时间和输入规模成正比。

```java
// O(n)：遍历数组求和
public static int sumArray(int[] arr) {
    int sum = 0;
    for (int num : arr) {
        sum += num;  // 执行 n 次
    }
    return sum;
}

// O(n)：查找最大元素
public static int findMax(int[] arr) {
    int max = arr[0];
    for (int i = 1; i < arr.length; i++) {
        if (arr[i] > max) {
            max = arr[i];  // 执行 n-1 次
        }
    }
    return max;
}
```

**典型操作**：数组遍历、线性查找、计算列表长度。

#### O(n log n) —— 线性对数时间

许多高效排序算法的时间复杂度。

```java
// O(n log n)：归并排序的分解与合并过程演示
// 分解：log n 层
// 合并：每层需要 O(n)
// 总计：O(n log n)
public static void mergeSortDemo(int[] arr, int left, int right) {
    if (left < right) {
        int mid = left + (right - left) / 2;
        mergeSortDemo(arr, left, mid);   // 排序左半
        mergeSortDemo(arr, mid + 1, right); // 排序右半
        merge(arr, left, mid, right);    // 合并：O(n)
    }
}
```

为什么是 $n \log n$？想象有 8 个元素，归并排序需要 $\log_2 8 = 3$ 层递归，每层都要合并 $n$ 个元素。$3 \times 8 = 24 \approx 8 \log_2 8$。

**典型操作**：归并排序、快速排序（平均）、堆排序。

#### O(n²) —— 平方时间

两层嵌套循环的典型复杂度。

```java
// O(n²)：冒泡排序
public static void bubbleSort(int[] arr) {
    int n = arr.length;
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}
```

内层循环的执行次数是 $n + (n-1) + (n-2) + ... + 1 = \frac{n(n-1)}{2} = O(n²)$。

**典型操作**：冒泡排序、选择排序、插入排序、双重嵌套循环。

#### O(2^n) —— 指数时间

递归树呈指数增长的算法。

```java
// O(2^n)：朴素的斐波那契数列
public static int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}
```

为什么是 $O(2^n)$？每次调用产生 2 个新的调用，递归深度为 $n$，所以总的调用次数约等于 $2^n$。

**典型操作**：朴素的斐波那契、子集生成、某些回溯算法。

### 2.1.5 复杂度增长对比

| n | O(1) | O(log n) | O(n) | O(n log n) | O(n²) | O(2ⁿ) |
|---|------|----------|------|------------|-------|-------|
| 10 | 1 | 3 | 10 | 30 | 100 | 1024 |
| 100 | 1 | 7 | 100 | 700 | 10,000 | 天文数字 |
| 1000 | 1 | 10 | 1000 | 10,000 | 1,000,000 | 无可估量 |
| 10⁶ | 1 | 20 | 10⁶ | 20 × 10⁶ | 10¹² | 宇宙毁灭 |

**关键观察**：当 $n$ 从 10 变成 1000，$O(n²)$ 算法慢了 10,000 倍，而 $O(n \log n)$ 只慢了约 333 倍。

### 2.1.6 如何分析代码的时间复杂度

#### 规则一：顺序执行，复杂度相加，取最大

```java
public void example(int[] arr) {
    method1(arr);  // O(n)
    method2(arr);  // O(n²)
    method3(arr);  // O(n)
}
// 总复杂度：O(n) + O(n²) + O(n) = O(n²)
```

#### 规则二：循环，看嵌套层数

```java
// 单层循环 → O(n)
for (int i = 0; i < n; i++) { ... }

// 双层循环 → O(n²)  
for (int i = 0; i < n; i++) {
    for (int j = 0; j < n; j++) { ... }
}

// 三层循环 → O(n³)
for (int i = 0; i < n; i++) {
    for (int j = 0; j < n; j++) {
        for (int k = 0; k < n; k++) { ... }
    }
}
```

#### 规则三：循环变量每次减半 → O(log n)

```java
// 每次迭代，n 减半 → O(log n)
for (int i = n; i > 0; i /= 2) { ... }

// 另一个例子
int i = 1;
while (i < n) {
    i *= 2;  // 需要乘以 2 的次数 = log₂(n)
}
```

#### 规则四：递归调用，分析递推关系

```java
// T(n) = T(n-1) + O(1) → O(n)
public void countDown(int n) {
    if (n <= 0) return;
    System.out.println(n);  // O(1)
    countDown(n - 1);       // T(n-1)
}

// T(n) = 2T(n/2) + O(n) → O(n log n)
public void mergeSort(int[] arr, int l, int r) {
    if (l >= r) return;
    int mid = l + (r - l) / 2;
    mergeSort(arr, l, mid);
    mergeSort(arr, mid + 1, r);
    merge(arr, l, mid, r);  // O(n)
}

// T(n) = T(n-1) + T(n-2) + O(1) → O(2ⁿ)
public int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}
```

### 2.1.7 最好、最坏、平均情况

以一个最简单的例子来说明：**在数组中查找目标值**。

```java
public int linearSearch(int[] arr, int target) {
    for (int i = 0; i < arr.length; i++) {
        if (arr[i] == target) return i;
    }
    return -1;
}
```

| 情况 | 何时发生 | 复杂度 |
|------|---------|--------|
| **最好** | 目标在第一个位置 | $O(1)$ |
| **最坏** | 目标在最后一个位置，或不存在 | $O(n)$ |
| **平均** | 随机位置 | $O(n)$ |

**关键点**：没有"一律"的复杂度。同一个算法在不同输入下表现可以天差地别。这就是为什么必须分情况讨论。

---

## 2.2 空间复杂度分析

### 2.2.1 什么是空间复杂度

**空间复杂度衡量的是算法在运行过程中占用的额外内存空间**，不包括输入数据本身占用的空间。也就是说，它回答的是"为了解决问题，你额外需要多少内存"。

### 2.2.2 常见空间复杂度

#### O(1) —— 常数空间（原地算法）

```java
// O(1) 空间：原地反转数组
public static void reverseInPlace(int[] arr) {
    int left = 0, right = arr.length - 1;
    while (left < right) {
        int temp = arr[left];   // 只有一个临时变量
        arr[left] = arr[right];
        arr[right] = temp;
        left++;
        right--;
    }
    // 不论数组多大，只用了 3 个额外变量：left, right, temp
}
```

**特点**：只用了有限几个变量，不随输入规模变化。这种算法称为**原地算法（in-place algorithm）**。

#### O(n) —— 线性空间

```java
// O(n) 空间：复制数组
public static int[] copyArray(int[] arr) {
    int[] copy = new int[arr.length];  // 额外空间 = arr.length
    for (int i = 0; i < arr.length; i++) {
        copy[i] = arr[i];
    }
    return copy;
}
```

**特点**：额外空间与输入规模成正比。

#### O(n²) —— 平方空间

```java
// O(n²) 空间：创建 n×n 的矩阵
public static int[][] createMatrix(int n) {
    int[][] matrix = new int[n][n];  // n × n = n² 个元素
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            matrix[i][j] = i * j;
        }
    }
    return matrix;
}
```

**特点**：常见于需要二维存储的算法（如图的邻接矩阵、动态规划的二维表）。

### 2.2.3 递归调用与栈空间

递归函数不仅占用堆内存，还会占用**调用栈空间**。

```java
// 空间复杂度 O(n)：因为递归深度为 n，调用栈需要 n 层
public static int factorialRecursive(int n) {
    if (n <= 1) return 1;
    return n * factorialRecursive(n - 1);
}
```

当 `factorialRecursive(5)` 被调用时，调用栈的情况：

```
factorialRecursive(5)
  → factorialRecursive(4)
    → factorialRecursive(3)
      → factorialRecursive(2)
        → factorialRecursive(1)  ← 到达基准条件，开始返回
      ← 返回 2
    ← 返回 6
  ← 返回 24
← 返回 120
```

**递归深度 = 空间复杂度**。`factorialRecursive(n)` 的递归深度为 $n$，所以空间复杂度为 $O(n)$。

### 2.2.4 尾递归优化

尾递归是一种特殊的递归形式，编译器可以将其优化为循环，从而将空间复杂度降到 $O(1)$。

```java
// 普通递归：O(n) 空间
public static int factorialNormal(int n) {
    if (n <= 1) return 1;
    return n * factorialNormal(n - 1);  // 乘法在递归返回后执行
}

// 尾递归：可以被优化为 O(1) 空间
public static int factorialTail(int n, int accumulator) {
    if (n <= 1) return accumulator;
    return factorialTail(n - 1, n * accumulator);  // 递归调用是最后一步
}
```

**尾递归的关键**：递归调用必须是函数的**最后一个操作**，且其结果直接返回，不需要再做任何额外计算。

Java 目前**没有强制实现尾递归优化**，但理解这个概念有助于你写出更优的递归代码。在其他语言（如 Kotlin、Scala 的 JVM 实现）中，尾递归优化是标准特性。

### 2.2.5 原地算法 vs 非原地算法

| | 原地算法（In-place） | 非原地算法（Out-of-place） |
|------|-------------------|------------------------|
| **空间复杂度** | $O(1)$ | $O(n)$ 或更高 |
| **是否修改输入** | 通常直接修改原数据 | 返回新的数据结构 |
| **优点** | 内存效率高 | 不破坏原始数据 |
| **缺点** | 可能破坏原始数据 | 需要额外内存 |

**选择建议**：
- 内存受限的场景：优先选择原地算法
- 原始数据需要保留：只能选择非原地算法
- 大多数情况下，先在纸上设计好算法，再决定是否优化为原地版本

---

## 2.3 递归算法复杂度分析

递归算法的复杂度分析比迭代算法复杂，因为你需要处理"自己调用自己"带来的数学关系。本节介绍两种最实用的方法。

### 2.3.1 主定理（Master Theorem）

主定理是分析分治算法复杂度最强大的工具。它直接给出了形式为 $T(n) = aT(n/b) + f(n)$ 的递推关系的解。

#### 标准形式

对于递推关系 $T(n) = aT(n/b) + f(n)$，其中：
- $a \geq 1$：子问题的个数
- $b > 1$：子问题规模缩小的因子
- $f(n)$：分解和合并的开销

主定理将 $f(n)$ 与 $n^{\log_b a}$ 进行比较，分三种情况：

| 情况 | 条件 | 复杂度 |
|------|------|--------|
| 情况1 | $f(n) = O(n^{\log_b a - \varepsilon})$ | $T(n) = \Theta(n^{\log_b a})$ |
| 情况2 | $f(n) = \Theta(n^{\log_b a})$ | $T(n) = \Theta(n^{\log_b a} \log n)$ |
| 情况3 | $f(n) = \Omega(n^{\log_b a + \varepsilon})$ | $T(n) = \Theta(f(n))$ |

#### 经典应用

**二分查找**：$T(n) = T(n/2) + O(1)$
- $a = 1, b = 2, f(n) = O(1)$
- $n^{\log_b a} = n^{\log_2 1} = n^0 = 1$
- $f(n) = O(1) = \Theta(1)$ → 情况2
- **结果**：$T(n) = \Theta(\log n)$

**归并排序**：$T(n) = 2T(n/2) + O(n)$
- $a = 2, b = 2, f(n) = O(n)$
- $n^{\log_b a} = n^{\log_2 2} = n^1 = n$
- $f(n) = O(n) = \Theta(n)$ → 情况2
- **结果**：$T(n) = \Theta(n \log n)$

**朴素斐波那契**：$T(n) = T(n-1) + T(n-2) + O(1)$
- 不满足主定理的标准形式（$n/b$ 不是 $n-1$ 这种形式）
- **结果**：$O(2^n)$（需要用树方法分析）

**矩阵乘法（简单分治）**：$T(n) = 8T(n/2) + O(n^2)$
- $a = 8, b = 2, f(n) = O(n^2)$
- $n^{\log_b a} = n^{\log_2 8} = n^3$
- $f(n) = O(n^2) = O(n^{3 - 1})$ → 情况1（$\varepsilon = 1$）
- **结果**：$T(n) = \Theta(n^3)$

#### 主定理的局限

主定理并非万能。以下情况主定理不适用：
1. $T(n) = T(n-1) + O(n)$ — 递归不是"分成 $a$ 个部分"的形式
2. $T(n) = T(\sqrt{n}) + O(1)$ — 规模缩小方式不是除以 $b$
3. $f(n)$ 和 $n^{\log_b a}$ 之间的比较不是多项式级别的差异

### 2.3.2 树方法（Recursion Tree Method）

当主定理不适用时，树方法是最直观的分析手段。

#### 方法步骤

1. 画出递归树，每个节点代表一次递归调用
2. 计算每层的工作量
3. 对所有层求和

#### 例1：归并排序 $T(n) = 2T(n/2) + cn$

```
                    cn                    ← 第0层：cn
                   /  \
               cn/2    cn/2              ← 第1层：2 × cn/2 = cn
              /  \    /   \
           cn/4 cn/4 cn/4 cn/4          ← 第2层：4 × cn/4 = cn
           ...  ...  ...  ...
            /     \    /    \
          1 1     1 1  1 1  1 1        ← 第log₂n层：n × 1 = cn
```

- 共 $\log_2 n + 1$ 层
- 每层工作量：$cn$
- 总计：$cn \cdot (\log_2 n + 1) = \Theta(n \log n)$

#### 例2：$T(n) = 3T(n/4) + cn^2$

```
                    cn²                  ← 第0层：cn²
         /          |          \
    c(n/4)²    c(n/4)²    c(n/4)²       ← 第1层：3 × c(n/4)² = (3/16)cn²
   /  |  \     /  |  \    /  |  \
  ... ... ... ... ... ... ... ... ...   ← 第2层：9 × c(n/16)² = (9/256)cn²
```

- 几何级数：$cn²[1 + 3/16 + (3/16)² + ... + (3/16)^{\log_4 n}]$
- 公比 $3/16 < 1$，所以是收敛的
- 总计：$\Theta(n²)$

#### 例3：朴素斐波那契 $T(n) = T(n-1) + T(n-2) + O(1)$

```
                n                    ← 第0层：1 个节点
              /   \
            n-1    n-2              ← 第1层：2 个节点
           /  \    /  \
         n-2  n-3 n-3 n-4          ← 第2层：4 个节点
        ...  ... ...  ...
```

- 树的高度 ≈ $n$
- 每层节点数约为 $2^i$
- 节点总数 ≈ $2^n$
- **结果**：$O(2^n)$

### 2.3.3 常见递归关系速查表

| 递推关系 | 典型算法 | 时间复杂度 |
|---------|---------|-----------|
| $T(n) = T(n/2) + O(1)$ | 二分查找 | $O(\log n)$ |
| $T(n) = T(n-1) + O(1)$ | 线性递归（计数） | $O(n)$ |
| $T(n) = T(n-1) + O(n)$ | 选择排序 | $O(n^2)$ |
| $T(n) = 2T(n/2) + O(1)$ | 二叉树遍历 | $O(n)$ |
| $T(n) = 2T(n/2) + O(n)$ | 归并排序 | $O(n \log n)$ |
| $T(n) = T(n/2) + O(n)$ | 无关（无此经典算法） | $O(n)$ |
| $T(n) = T(n-1) + T(n-2) + O(1)$ | 朴素斐波那契 | $O(2^n)$ |
| $T(n) = 2T(n/2) + O(n^2)$ | 某些分治算法 | $O(n^2)$ |

---

## 2.4 摊销分析与实际应用

### 2.4.1 什么是摊销分析

有些操作的"单次"成本可能很高，但在连续操作中，昂贵操作发生的频率很低。**摊销分析（Amortized Analysis）** 就是用来分析这种"一系列操作"的平均时间成本。

> 摊销分析 ≠ 平均情况分析
> - 平均情况分析：对输入分布的概率假设
> - 摊销分析：对最坏情况下操作序列的保证，不依赖概率

### 2.4.2 三种分析方法

#### 方法一：聚合分析（Aggregate Analysis）

聚合分析是最简单的方法：计算 $n$ 次操作的总时间 $T(n)$，然后平均得到每次操作的摊销成本 $T(n)/n$。

**例子**：**动态数组（ArrayList）的扩容**

假设数组初始容量为 1，每次满了就翻倍扩容：

| 操作 | 数组大小 | 是否扩容 | 实际成本 |
|------|---------|---------|---------|
| add(1) | 1 | 否 | 1 |
| add(2) | 1→2 | 是（容量翻倍） | 1 + 1 = 2（复制1个元素） |
| add(3) | 2→4 | 是 | 1 + 2 = 3（复制2个元素） |
| add(4) | 4 | 否 | 1 |
| add(5) | 4→8 | 是 | 1 + 4 = 5（复制4个元素） |
| add(6) | 8 | 否 | 1 |
| add(7) | 8 | 否 | 1 |
| add(8) | 8 | 否 | 1 |

总成本计算（$n=8$ 次插入）：
- 各次插入的成本：1 + 2 + 3 + 1 + 5 + 1 + 1 + 1 = 15
- 或者用公式：$n + (1 + 2 + 4) = 8 + 7 = 15$
- 摊销成本：$15 / 8 \approx 1.875 = O(1)$

对于 $n$ 次插入：
- 总成本 = $n + (1 + 2 + 4 + ... + n/2) = n + (n - 1) = 2n - 1 = O(n)$
- 每次操作的摊销成本 = $O(1)$

**结论**：尽管某些单次操作成本是 $O(n)$，但 $n$ 次连续插入的平均成本仍然是 $O(1)$。

#### 方法二：记账法（Accounting Method）

给不同的操作分配不同的"费用"，提前为未来的昂贵操作"存钱"。

**核心思想**：
- 对便宜操作多收一点（多出来的"存款"存起来）
- 对昂贵操作少收一点（用存款支付）

**例子**：还是动态数组扩容

设定每次插入操作收费 3 元：
- 1 元用于本次插入
- 2 元存入"扩容基金"

| 操作 | 收费 | 实际成本 | 存入"银行" | 余额 |
|------|------|---------|-----------|------|
| 插入1 | 3 | 1 | 2 | 2 |
| 插入2 | 3 | 2 | 1 | 3 |
| 插入3 | 3 | 1 | 2 | 5 |
| 插入4 | 3 | 3 | 0 | 5 |
| 插入5 | 3 | 1 | 2 | 7 |
| 插入6 | 3 | 1 | 2 | 9 |
| 插入7 | 3 | 1 | 2 | 11 |
| 插入8 | 3 | 5 | -2 | 9 |

可以看到，余额始终为正。这证明了"每次操作收费 3 元"的摊销策略是可行的。

**摊销成本 $= 3 = O(1)$**。

#### 方法三：势能法（Potential Method）

势能法是记账法的数学化版本。定义一个**势能函数** $\Phi$，表示数据结构的"势能"。

**核心思想**：
- 每次操作的实际成本为 $c_i$
- 每次操作的摊销成本为 $\hat{c_i} = c_i + \Phi_i - \Phi_{i-1}$
- 所有操作的摊销成本和必须 ≥ 实际成本和（即 $\Phi_n - \Phi_0 \geq 0$）

**例子**：动态数组扩容

定义势能函数：$\Phi = 2 \times \text{size} - \text{capacity}$

- 初始状态：$\text{size} = 0, \text{capacity} = 0, \Phi_0 = 0$

**普通插入（不扩容）**：
- $\text{size}$ 从 $k$ 变成 $k+1$，$\text{capacity}$ 不变
- $\Phi_i - \Phi_{i-1} = 2(k+1) - C - (2k - C) = 2$
- $\hat{c_i} = c_i + 2 = 1 + 2 = 3$

**扩容插入**：
- $\text{size}$ 从 $k$ 变成 $k+1$，$\text{capacity}$ 从 $C$ 变成 $2C$
- 实际成本 $c_i = k + 1$（复制 $k$ 个元素 + 插入 1 个）
- $\Phi_{i-1} = 2k - C$
- $\Phi_i = 2(k+1) - 2C = 2k + 2 - 2C$
- $\Phi_i - \Phi_{i-1} = (2k + 2 - 2C) - (2k - C) = 2 - C$
- $\hat{c_i} = (k + 1) + (2 - C) = k + 3 - C$

注意在扩容时 $C = k$（因为满了才扩容），所以 $\hat{c_i} = k + 3 - k = 3$

**结果**：每次操作的摊销成本是 3，即 $O(1)$。

### 2.4.3 工程中的摊销分析

#### JDK ArrayList 源码解读

ArrayList 的扩容机制是摊销分析最经典的工程案例：

```java
// JDK ArrayList.grow() 的核心逻辑（简化版）
private Object[] grow(int minCapacity) {
    int oldCapacity = elementData.length;
    // 新容量 = 旧容量 + 旧容量右移1位（即增长50%）
    int newCapacity = oldCapacity + (oldCapacity >> 1);
    if (newCapacity - minCapacity < 0)
        newCapacity = minCapacity;
    if (newCapacity - MAX_ARRAY_SIZE > 0)
        newCapacity = hugeCapacity(minCapacity);
    // 复制到新数组
    elementData = Arrays.copyOf(elementData, newCapacity);
    return elementData;
}
```

JDK 中 ArrayList 的扩容因子是 **1.5 倍**（而不是简单的 2 倍），这是空间和时间之间的权衡：
- 2 倍扩容：复制次数更少，但可能浪费更多空间
- 1.5 倍扩容：更节省空间，复制次数略多，但摊销复杂度仍然是 $O(1)$

#### 其他摊销分析的应用

| 场景 | 昂贵操作 | 摊销复杂度 |
|------|---------|-----------|
| HashMap 扩容 | rehash 所有元素 | $O(1)$ 平均插入 |
| StringBuilder append | 内部数组扩容 | $O(1)$ 每次追加 |
| 栈的 push/pop | 数组满时扩容 | $O(1)$ 每次操作 |
| 并查集（Union-Find） | 路径压缩 | 接近 $O(1)$ |
| 二叉堆插入 | 上浮操作 | $O(1)$ 摊销 |

---

## 本章配套代码

| 文件 | 内容 | 对应章节 |
|------|------|---------|
| `demos/chapter02/TimeComplexityAnalyzer.java` | 各类时间复杂度的演示与操作计数 | 2.1 |
| `demos/chapter02/SpaceComplexityAnalyzer.java` | 各类空间复杂度的演示与内存追踪 | 2.2 |

---

## 本章小结

- **大O表示法**描述算法运行时间的上界，是最常用的复杂度分析工具
- **复杂度谱系**：$O(1) < O(\log n) < O(n) < O(n \log n) < O(n²) < O(2ⁿ)$
- **大Ω、大Θ**补充描述了算法的下界和紧确界
- **分析技巧**：关注循环嵌套层数、递归深度、每次迭代的规模缩小速度
- **空间复杂度**需要考虑显式的数据结构分配和隐式的递归调用栈
- **原地算法**使用 $O(1)$ 额外空间，但会修改原始数据
- **尾递归**可以被编译器优化为迭代，从 $O(n)$ 空间降到 $O(1)$
- **主定理**是分析分治算法 $T(n) = aT(n/b) + f(n)$ 的利器
- **树方法**在主定理不适用时提供了直观的分析手段
- **摊销分析**揭示了"偶尔昂贵、长期便宜"的操作序列的真实成本

---

## 练习与思考

1. 分析以下代码的时间复杂度：
   ```java
   for (int i = 0; i < n; i++) {
       for (int j = i; j < n; j++) {
           for (int k = j; k < n; k++) {
               System.out.println(i + j + k);
           }
       }
   }
   ```

2. 分析以下代码的时间复杂度：
   ```java
   for (int i = 1; i < n; i *= 2) {
       for (int j = 0; j < n; j++) {
           System.out.println(i + j);
       }
   }
   ```

3. 用主定理分析 $T(n) = 4T(n/2) + n$。

4. 用递归树方法分析 $T(n) = T(n/3) + T(2n/3) + O(n)$。

5. 修改 `TimeComplexityAnalyzer.java`，为每个算法添加实际运行时间测量（`System.nanoTime()`），比较理论复杂度和实际运行时间的关系。

6. 思考：如果 ArrayList 扩容因子改为 1.25，摊销复杂度还是 $O(1)$ 吗？证明你的结论。

7. 实现一个动态数组（类似 ArrayList），打印每次扩容时的复制成本，验证摊销分析的结论。