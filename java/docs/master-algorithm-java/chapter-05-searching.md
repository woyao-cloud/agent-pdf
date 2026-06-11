# 第5章 查找算法

> "在数据中寻找目标，是人类最古老的计算需求之一。从图书馆的索引卡片到搜索引擎的倒排索引，查找算法的效率直接决定了系统的响应速度。"

---

## 5.1 线性查找与二分查找

### 5.1.1 线性查找（Linear Search）

#### 原理

线性查找是最直观的查找方式——从头到尾遍历整个数据集，逐个比较每个元素，直到找到目标值或遍历完所有元素。

```
从头遍历到尾，逐个比较
[1] → [3] → [5] → [7] → [9] → [11] → 找到！
```

#### 代码实现

```java
public static int linearSearch(int[] arr, int target) {
    for (int i = 0; i < arr.length; i++) {
        if (arr[i] == target) {
            return i;
        }
    }
    return -1;
}
```

#### 复杂度分析

| 指标 | 值 |
|------|-----|
| 最坏时间复杂度 | $O(n)$ |
| 最好时间复杂度 | $O(1)$（第一个就是目标） |
| 平均时间复杂度 | $O(n)$ |
| 空间复杂度 | $O(1)$ |
| 数据要求 | 无（任何数据集都可用） |

**适用场景：**
- 数据集很小（通常 n < 100）
- 数据无序且无法预排序
- 只需要查找一次，不值得为排序付出成本
- 在链表等不支持随机访问的数据结构中

**优点：** 实现简单，不需要任何预处理，对数据分布无要求。

**缺点：** 当数据量大时性能急剧下降。

---

### 5.1.2 二分查找（Binary Search）

#### 原理

二分查找是一种在 **有序数组** 中查找目标值的高效算法。它通过每次将搜索范围缩小一半来快速定位目标：

```
在有序数组 [1, 3, 5, 7, 9, 11, 13, 15] 中查找 7

Step 1: 左=0, 右=7, mid=3 → arr[3]=7 == target ✓ 找到！
```

#### 代码实现

```java
public static int binarySearch(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2; // 防止溢出
        if (arr[mid] == target) {
            return mid;
        } else if (arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return -1;
}
```

> **关键细节：** `mid = left + (right - left) / 2` 而不是 `(left + right) / 2`，是为了防止 left + right 超过 `int` 最大值导致溢出。这个 bug 在 2006 年 Java 6 的 `Arrays.binarySearch()` 中才被修复。

#### 复杂度分析

| 指标 | 值 |
|------|-----|
| 最坏时间复杂度 | $O(\log n)$ |
| 最好时间复杂度 | $O(1)$（中间就是目标） |
| 平均时间复杂度 | $O(\log n)$ |
| 空间复杂度 | $O(1)$（迭代版本）或 $O(\log n)$（递归版本） |

#### 二分查找的前提条件

二分查找之所以高效，是因为它利用了数组的有序性和随机访问特性。使用二分查找必须满足以下条件：

1. **数据结构支持随机访问**：二分查找要求能在 $O(1)$ 时间内访问任意下标元素。因此数组和 `ArrayList` 可以，链表不行。
2. **数据必须有序**：二分查找依赖"如果 mid 大于 target，那么 target 一定在左半边"这一推理，这要求数据是有序的。
3. **数据量不能太小**：对于 n < 10 的数据集，线性查找可能更快（因为二分查找的分支预测开销更大）。

#### 二分查找的三种区间写法

二分查找的区间定义有多种写法，核心区别在于 `right` 的初始值和循环条件：

| 写法 | right 初始化 | 循环条件 | right 更新 | 适用场景 |
|------|-------------|---------|-----------|---------|
| 闭区间 `[left, right]` | `arr.length - 1` | `left <= right` | `right = mid - 1` | 最常用的标准写法 |
| 左闭右开 `[left, right)` | `arr.length` | `left < right` | `right = mid` | 配合下标操作，STL 风格 |
| 左开右开 `(left, right)` | `arr.length` | `left + 1 < right` | `right = mid` | 特殊变体问题 |

#### 常见的二分查找错误

1. **死循环**：当 `left` 和 `right` 相邻时，如果 `mid` 计算不当（如使用 `mid = (left + right) / 2` 且更新逻辑不一致）可能导致死循环。
2. **溢出**：`(left + right) / 2` 在 `left + right` 超过 `Integer.MAX_VALUE` 时溢出。
3. **边界条件**：混淆了 `left < right` 和 `left <= right`，导致漏掉最后一个元素。
4. **未排序数据**：对未排序的数组使用二分查找，结果不可预测。

---

## 5.2 二分查找变体

在实际工程中，标准的二分查找往往不够用——我们需要查找"第一个"或"最后一个"匹配项，或者在经过旋转的数组中查找。

### 5.2.1 查找第一个匹配（左边界）

当数组中有重复元素时，我们需要找到目标值 **第一次出现** 的位置。

```java
public static int leftmost(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    int result = -1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) {
            result = mid;
            right = mid - 1;  // 继续向左搜索
        } else if (arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return result;
}
```

关键点是：即使找到了目标，也不立即返回，而是继续向左搜索，直到区间为空。

### 5.2.2 查找最后一个匹配（右边界）

与左边界对称，找目标值 **最后一次出现** 的位置：

```java
public static int rightmost(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    int result = -1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) {
            result = mid;
            left = mid + 1;  // 继续向右搜索
        } else if (arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return result;
}
```

### 5.2.3 旋转数组查找

**问题：** 一个有序数组在某个未知点被旋转（例如 `[4,5,6,7,0,1,2]`），如何在此数组中查找目标值？

**思路：** 虽然整个数组不是完全有序的，但我们可以利用旋转数组的特性——从中间分割后，**至少有一半是有序的**。

```
[4, 5, 6, 7, 0, 1, 2] 中查找 1
           ↑mid=3
左半 [4,5,6,7] 有序，但 1 不在这个范围
右半 [0,1,2] 有序，且在范围内 → 在右半继续查找
```

```java
public static int searchRotated(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) return mid;

        // 左半有序
        if (arr[left] <= arr[mid]) {
            if (target >= arr[left] && target < arr[mid]) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
        // 右半有序
        else {
            if (target > arr[mid] && target <= arr[right]) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
    }
    return -1;
}
```

**时间复杂度：** $O(\log n)$，与标准二分查找一致。

### 5.2.4 山脉数组找峰值

**问题：** 一个数组先严格递增后严格递减（形状像山脉），找到峰值元素的索引。

**思路：** 利用 `arr[mid]` 和 `arr[mid + 1]` 的比较关系判断当前处于上坡还是下坡。

```java
public static int findPeakElement(int[] arr) {
    int left = 0, right = arr.length - 1;
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] < arr[mid + 1]) {
            left = mid + 1;  // 上坡，峰值在右侧
        } else {
            right = mid;     // 下坡或峰顶，峰值在左侧或就是mid
        }
    }
    return left;
}
```

这段代码的精妙之处在于：它不需要知道数组的全局结构，仅通过局部相邻比较就能收敛到峰值。

### 5.2.5 用二分法求平方根

二分法不仅可以用来查找元素，还可以用来 **逼近数值解**。

**整数平方根（精确到整数）：**

```java
public static int sqrtInt(int x) {
    if (x < 2) return x;
    int left = 1, right = x / 2;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        long midSq = (long) mid * mid;
        if (midSq == x) return mid;
        if (midSq < x) left = mid + 1;
        else right = mid - 1;
    }
    return right; // 返回 floor 值
}
```

**高精度平方根（指定精度）：**

```java
public static double sqrtDouble(double x, double precision) {
    if (x < 0) return Double.NaN;
    double left = 0, right = Math.max(1, x);
    while (right - left > precision) {
        double mid = left + (right - left) / 2;
        if (mid * mid < x) {
            left = mid;
        } else {
            right = mid;
        }
    }
    return left + (right - left) / 2;
}
```

这种方法体现了二分查找的一个核心思想：**任何具有单调性的问题，都可以用二分法来求解**。

---

## 5.3 插值查找与斐波那契查找

标准二分查找每次固定取中间位置，但如果我们对数据分布有所了解，可以做得更好。

### 5.3.1 插值查找（Interpolation Search）

#### 原理

插值查找是二分查找的改进版本，它不取固定的中点，而是根据目标值在数据范围内的 **大致位置** 来估计探测点。

假设数组元素在值域上均匀分布，查找 `target` 时，探测位置由线性插值公式确定：

```
pos = left + ((target - arr[left]) * (right - left)) / (arr[right] - arr[left])
```

举个直观的例子：在英语词典中查找 "Algorithm"：
- 二分查找：每次都翻到中间页（约 500 页处）
- 插值查找：根据字母 'A' 在字母表中的位置（约 1/26），直接翻到约第 40 页

#### 代码实现

```java
public static int interpolationSearch(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left <= right && target >= arr[left] && target <= arr[right]) {
        if (left == right) {
            return arr[left] == target ? left : -1;
        }
        // 插值公式
        int pos = left + ((target - arr[left]) * (right - left))
                        / (arr[right] - arr[left]);
        if (arr[pos] == target) return pos;
        if (arr[pos] < target) left = pos + 1;
        else right = pos - 1;
    }
    return -1;
}
```

#### 复杂度分析

| 数据分布 | 平均时间复杂度 | 最坏时间复杂度 |
|---------|--------------|--------------|
| 均匀分布 | $O(\log \log n)$ | $O(n)$ |
| 非均匀分布 | 介于 $O(\log \log n)$ 到 $O(n)$ 之间 | $O(n)$ |

> **关键洞察：** 插值查找的 $O(\log \log n)$ 平均性能虽然优于二分查找的 $O(\log n)$，但在实际工程中很少使用——因为它对数据分布极度敏感。当数据分布不均匀时（如指数分布、Zipf 分布），插值查找可能退化为 $O(n)$。

### 5.3.2 斐波那契查找（Fibonacci Search）

#### 原理

斐波那契查找使用斐波那契数列来确定探测点的位置。它不依赖除法运算（mid 计算需要除法），而是使用加减法，在某些平台上可能更快。

斐波那契数列：$F(0)=0, F(1)=1, F(k)=F(k-1)+F(k-2)$

算法思路：
1. 找到最小的 $F(k)$ 使得 $F(k) > n$（数组长度）
2. 初始偏移量 `offset = -1`
3. 每次取 `mid = offset + F(k-2)` 作为探测点
4. 根据比较结果调整 `k` 和 `offset`

#### 代码实现

```java
public static int fibonacciSearch(int[] arr, int target) {
    int n = arr.length;
    // 生成斐波那契数，找到 >= n 的最小 F(k)
    int fk2 = 0, fk1 = 1, fk = fk1 + fk2;
    while (fk < n) {
        fk2 = fk1;
        fk1 = fk;
        fk = fk1 + fk2;
    }
    // offset 是已排除的左半部分长度
    int offset = -1;
    while (fk > 1) {
        int mid = Math.min(offset + fk2, n - 1);
        if (arr[mid] < target) {
            fk = fk1;
            fk1 = fk2;
            fk2 = fk - fk1;
            offset = mid;
        } else if (arr[mid] > target) {
            fk = fk2;
            fk1 = fk1 - fk2;
            fk2 = fk - fk1;
        } else {
            return mid;
        }
    }
    // 检查最后一个元素
    if (fk1 == 1 && arr[offset + 1] == target) {
        return offset + 1;
    }
    return -1;
}
```

#### 复杂度分析

| 指标 | 值 |
|------|-----|
| 时间复杂度 | $O(\log n)$ |
| 空间复杂度 | $O(1)$ |
| 优点 | 只使用加减法，无除法开销 |
| 缺点 | 实现复杂，现代 CPU 上除法并不比加减法慢多少 |

### 5.3.3 三种查找对比

| 特性 | 二分查找 | 插值查找 | 斐波那契查找 |
|------|---------|---------|------------|
| 时间复杂度 | $O(\log n)$ | $O(\log \log n)$ 平均 | $O(\log n)$ |
| 最坏情况 | $O(\log n)$ | $O(n)$ | $O(\log n)$ |
| 使用除法 | 是 | 是 | 否 |
| 数据分布依赖 | 否 | 是 | 否 |
| 实现复杂度 | 低 | 中 | 高 |
| 实际使用频率 | 极高 | 极低 | 极低 |

**工程建议：** 绝大多数情况下使用二分查找即可。插值查找只有在数据量大（$n > 10^6$）且确认数据均匀分布时才有优势。斐波那契查找更多是理论价值，实际工程中极少使用。

---

## 5.4 哈希查找

哈希查找是另一种查找范式——它不依赖比较，而是通过 **键到地址的直接映射** 来实现近乎 $O(1)$ 的查找。

### 5.4.1 哈希函数设计

哈希函数的目标是将任意大小的输入映射到固定范围的输出（哈希值）。好的哈希函数应该：

1. **确定性**：相同的输入始终产生相同的输出
2. **高效计算**：哈希计算本身要快
3. **均匀分布**：不同的输入应该均匀分布在整个输出空间

常见的哈希函数设计方法：

| 方法 | 描述 | 示例 |
|------|------|------|
| 直接定址法 | `hash(key) = a * key + b` | `hash(id) = id - 1` |
| 除留余数法 | `hash(key) = key % p`，p 取质数 | `hash(key) = key % 31` |
| 平方取中法 | 取 key² 的中间几位 | key=1234, key²=1522756, 取 227 |
| 折叠法 | 将 key 分成几段后叠加 | key=123456 → 12+34+56=102 |
| 随机数法 | 使用伪随机数生成器 | `hash(key) = rand(key)` |

对于字符串哈希，Java 的 `String.hashCode()` 实现采用了如下公式：

```
s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]
```

选择 31 的原因是：31 是一个不大不小的质数，且 `31 * i` 可以被 JVM 优化为 `(i << 5) - i`，计算效率高。

### 5.4.2 冲突解决方法

即使是最完美的哈希函数，由于输出空间有限，冲突（两个不同的 key 映射到同一个位置）也无法避免。处理冲突的策略主要有两种：

#### 链地址法（Separate Chaining）

每个哈希槽位维护一个链表（或树），所有映射到该槽位的键值对存储在链表中。

```
哈希表:
[0] → null
[1] → (key1, val1) → (key5, val5)
[2] → (key2, val2)
[3] → null
...
```

**优点：**
- 实现简单
- 删除操作容易
- 哈希表永远不会"满"（可以继续添加）

**缺点：**
- 需要额外的指针内存
- 缓存不友好（链表节点在内存中不连续）
- 当冲突严重时，链表变长，查找退化为 $O(n)$

#### 开放地址法（Open Addressing）

当冲突发生时，探测下一个可用槽位。常见的探测策略：

| 探测策略 | 公式 | 说明 |
|---------|------|------|
| 线性探测 | $h(k, i) = (h(k) + i) \mod m$ | 按顺序探测下一个槽，可能出现"一次聚集" |
| 二次探测 | $h(k, i) = (h(k) + i^2) \mod m$ | 探测步长呈二次增长，减轻一次聚集，但可能产生二次聚集 |
| 双重哈希 | $h(k, i) = (h_1(k) + i \cdot h_2(k)) \mod m$ | 使用第二个哈希函数决定步长，效果最好 |

```java
// 线性探测示例
public int findSlot(int key) {
    int hash = key % table.length;
    while (table[hash] != null && table[hash].key != key) {
        hash = (hash + 1) % table.length; // 线性探测
    }
    return hash;
}
```

**优点：**
- 无需额外指针，空间利用率高
- 缓存友好（数据存储在连续内存中）

**缺点：**
- 删除操作复杂（需要使用惰性删除标记）
- 容易产生聚集现象
- 当负载因子高时性能显著下降

### 5.4.3 负载因子与扩容

**负载因子（Load Factor）** = $\frac{\text{已存储的元素数量}}{\text{哈希表总容量}}$

负载因子是时间与空间的权衡：

| 负载因子 | 空间利用率 | 查找效率 | 适用场景 |
|---------|-----------|---------|---------|
| 0.5 以下 | 低 | 高 | 对性能要求极高的场景 |
| 0.75（JDK默认） | 中等 | 高 | 大多数场景 |
| 0.9 以上 | 高 | 低 | 内存受限的场景 |

当负载因子超过阈值时，哈希表需要 **扩容（Rehash）**：
1. 创建一个更大的桶数组（通常扩大为原来的 2 倍）
2. 将所有现有元素重新计算哈希值，放入新数组
3. 释放旧数组

> **扩容成本：** 扩容是 $O(n)$ 操作，但使用摊销分析可以证明，在元素总数从 0 增长到 n 的过程中，扩容的总成本为 $O(n)$，因此每次插入的摊销成本仍为 $O(1)$。

### 5.4.4 Java HashMap 查找分析

Java 8+ 的 `HashMap` 实现是链地址法与红黑树的结合：

1. **槽位计算：** `(n - 1) & hash` 替代 `hash % n`（要求 n 为 2 的幂次方）
2. **哈希扰动：** 将高位参与运算，减少碰撞 `h = key.hashCode() ^ (h >>> 16)`
3. **链表转红黑树：** 当某个桶的链表长度 $\ge 8$ 且总容量 $\ge 64$ 时，链表转换为红黑树，最坏情况从 $O(n)$ 降为 $O(\log n)$
4. **树退链表：** 当红黑树节点数 $\le 6$ 时，树退化回链表

```
HashMap.get(key) 流程:
1. 计算 key.hashCode()
2. 扰动处理 h = h ^ (h >>> 16)
3. 定位桶 (n - 1) & h
4. 如果桶为空 → 返回 null
5. 如果桶的第一个节点匹配 → 直接返回
6. 如果桶是红黑树 → 红黑树查找 O(log n)
7. 如果桶是链表 → 遍历链表 O(n)（但通常很短）
```

```java
// JDK HashMap.getNode() 核心逻辑（简化）
final Node<K,V> getNode(int hash, Object key) {
    Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
    if ((tab = table) != null && (n = tab.length) > 0
        && (first = tab[(n - 1) & hash]) != null) {
        if (first.hash == hash && ((k = first.key) == key
            || (key != null && key.equals(k))))
            return first;  // 第一个就匹配，O(1)
        if ((e = first.next) != null) {
            if (first instanceof TreeNode)
                return ((TreeNode<K,V>)first).getTreeNode(hash, key);
            do {
                if (e.hash == hash &&
                    ((k = e.key) == key || (key != null && key.equals(k))))
                    return e;
            } while ((e = e.next) != null);
        }
    }
    return null;
}
```

---

## 5.5 JDK查找源码解析

### 5.5.1 Arrays.binarySearch()

Java 标准库中的 `Arrays.binarySearch()` 实现（JDK 8+）：

```java
// 针对 int[] 的二分查找
public static int binarySearch(int[] a, int key) {
    return binarySearch0(a, 0, a.length, key);
}

private static int binarySearch0(int[] a, int fromIndex, int toIndex,
                                  int key) {
    int low = fromIndex;
    int high = toIndex - 1;
    while (low <= high) {
        int mid = (low + high) >>> 1;  // 注意：使用 >>> 无符号右移
        int midVal = a[mid];
        if (midVal < key)
            low = mid + 1;
        else if (midVal > key)
            high = mid - 1;
        else
            return mid; // key found
    }
    return -(low + 1);  // key not found.
}
```

**实现细节分析：**

1. **使用 `>>> 1` 而非 `/ 2`：** `(low + high) >>> 1` 是无符号右移，等效于除以 2，且能正确处理 `low + high` 溢出的情况（虽然 low 和 high 不会为负，但 `>>>` 和 `/` 在处理负数时的行为不同，使用 `>>>` 是一种更安全的习惯）。

2. **找不到时返回 `-(插入点) - 1`：** 返回值总是负数。`-(low + 1)` 的巧妙之处在于：如果 `low = 0`，返回 `-1`；如果 `low = 1`，返回 `-2`，以此类推。调用方可以通过 `int index = Arrays.binarySearch(arr, key); if (index < 0) { int insertPoint = -index - 1; }` 来获取插入点。

3. **为什么不用 `left + (right - left) / 2`：** 在 `Arrays.binarySearch0` 中，low 和 high 都是 `int`，且 JDK 开发团队选择了 `(low + high) >>> 1` 这种更简洁的形式，利用无符号右移来安全处理溢出。

### 5.5.2 HashMap.get() 源码分析

`HashMap.get(Object key)` 的完整调用链：

```java
// HashMap.java - JDK 8+
public V get(Object key) {
    Node<K,V> e;
    return (e = getNode(hash(key), key)) == null ? null : e.value;
}

static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}

final Node<K,V> getNode(int hash, Object key) {
    Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
    if ((tab = table) != null && (n = tab.length) > 0
        && (first = tab[(n - 1) & hash]) != null) {
        // 1. 检查第一个节点（大部分情况到这里就结束了）
        if (first.hash == hash &&
            ((k = first.key) == key || (key != null && key.equals(k))))
            return first;
        // 2. 检查后续节点
        if ((e = first.next) != null) {
            if (first instanceof TreeNode)
                // 3. 红黑树查找
                return ((TreeNode<K,V>)first).getTreeNode(hash, key);
            // 4. 链表遍历
            do {
                if (e.hash == hash &&
                    ((k = e.key) == key || (key != null && key.equals(k))))
                    return e;
            } while ((e = e.next) != null);
        }
    }
    return null;
}
```

**关键设计决策：**

1. **为什么用 `(n - 1) & hash` 而不是 `hash % n`：**
   - 当 `n` 是 2 的幂次方时，`(n - 1) & hash` 等效于 `hash % n`
   - 位运算比取模快数十倍
   - 这也是为什么 HashMap 的容量总是 2 的幂次方

2. **为什么用 `hash ^ (h >>> 16)`：**
   - 将 hash 的高 16 位与低 16 位进行异或
   - 使高位信息参与低位运算
   - 减少因 hashCode 实现不佳导致的碰撞

3. **为什么 `equals()` 和 `hashCode()` 必须同时重写：**
   - `hashCode()` 决定元素进入哪个桶
   - `equals()` 在桶内确定是否匹配
   - 如果只重写 `equals()` 不重写 `hashCode()`，两个逻辑相等的对象可能被分到不同的桶，导致 HashMap 无法正确查找

4. **Java 8 的树化优化：**
   - Java 7 及之前：冲突严重的桶就是长链表，`get()` 最坏 $O(n)$
   - Java 8+：当链表长度 $\ge 8$ 时转换为红黑树，`get()` 最坏 $O(\log n)$
   - 这个优化防御了恶意哈希碰撞攻击（攻击者可以构造大量哈希值相同的 key 使 HashMap 退化为链表）

### 5.5.3 TreeMap/TreeSet 红黑树查找

`TreeMap` 基于红黑树（Red-Black Tree）实现，提供 $O(\log n)$ 的查找性能。

红黑树是一种自平衡的二叉搜索树，它通过以下 5 条规则保持平衡：

1. 每个节点是红色或黑色
2. 根节点是黑色
3. 叶子节点（NIL）是黑色
4. 红色节点的子节点必须是黑色（不能有连续的红色节点）
5. 从任一节点到其每个叶子节点的路径上，黑色节点数量相同

```java
// TreeMap.java - JDK 8+
public V get(Object key) {
    Entry<K,V> p = getEntry(key);
    return (p == null ? null : p.value);
}

final Entry<K,V> getEntry(Object key) {
    // 有 Comparator 时的查找逻辑
    if (comparator != null)
        return getEntryUsingComparator(key);
    if (key == null)
        throw new NullPointerException();
    @SuppressWarnings("unchecked")
    Comparable<? super K> k = (Comparable<? super K>) key;
    Entry<K,V> p = root;
    // 标准的二叉搜索树查找
    while (p != null) {
        int cmp = k.compareTo(p.key);
        if (cmp < 0)
            p = p.left;
        else if (cmp > 0)
            p = p.right;
        else
            return p;
    }
    return null;
}
```

**`TreeMap.getEntry()` 的时间复杂度分析：**

- 红黑树的高度最多为 $2\log_2(n+1)$
- 因此每次查找最多执行 $2\log_2(n+1)$ 次比较
- 时间复杂度为 $O(\log n)$

**HashMap vs TreeMap 查找对比：**

| 特性 | HashMap | TreeMap |
|------|---------|---------|
| 时间复杂度 | $O(1)$ 平均，$O(\log n)$ 最坏 | $O(\log n)$ |
| 空间开销 | 桶数组 + 节点 | 红黑树节点 |
| 顺序保证 | 无 | 按键的自然顺序或 Comparator 排序 |
| 键要求 | 实现 `hashCode()` 和 `equals()` | 实现 `Comparable` 或提供 `Comparator` |
| 适用场景 | 通用查找 | 需要有序遍历或范围查询 |

> **工程选择建议：** 90% 的场景使用 HashMap。仅当需要有序遍历（如输出按字母排序的结果）或范围查询（如查找"价格在 100-200 之间的商品"）时，才考虑 TreeMap。

---

## 本章小结

| 算法 | 时间复杂度 | 空间复杂度 | 要求 | 适用场景 |
|------|-----------|-----------|------|---------|
| 线性查找 | $O(n)$ | $O(1)$ | 无 | 小数据集、无序数据 |
| 二分查找 | $O(\log n)$ | $O(1)$ | 有序 + 随机访问 | 通用有序查找 |
| 插值查找 | $O(\log \log n)$ 平均 | $O(1)$ | 有序 + 均匀分布 | 大均匀数据集 |
| 斐波那契查找 | $O(\log n)$ | $O(1)$ | 有序 | 理论教学（极少实际用） |
| 哈希查找 | $O(1)$ 平均 | $O(n)$ | 好的哈希函数 | 通用键值查找 |
| 红黑树查找 | $O(\log n)$ | $O(n)$ | 可比较键 | 需要排序的查找 |

**一条经验法则：**
- 一次查找 → 线性查找（无需预处理）
- 多次查找 + 数据固定 → 先排序再用二分查找
- 查找 + 频繁插入/删除 → HashMap（$O(1)$ 平均）
- 查找 + 需要范围查询 → TreeMap（$O(\log n)$）