# 第5章 查找算法

> **查找**是计算机科学中最基础的操作之一。无论你在搜索数据库、在数组中定位元素，还是检查集合中是否存在某个值，背后都依赖着某种查找算法。本章覆盖从最基础的线性扫描到工业级哈希表的完整谱系，并深入 Python 和 JDK 的实现细节。

---

## 5.1 线性查找与二分查找

### 5.1.1 线性查找 (Linear Search)

线性查找是最直观的查找方式：从头到尾遍历整个数据集，逐一比较，直到找到目标元素。

```
def linear_search(arr, target):
    for i, val in enumerate(arr):
        if val == target:
            return i
    return -1
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n) — 最坏情况需遍历全部元素 |
| **空间复杂度** | O(1) — 仅需一个索引变量 |
| **数据要求** | 无需排序，任意数据均可 |
| **适用场景** | 小数据集（n < 100）、无序数据、仅查找一次 |

线性查找的优点是**简单通用**——不依赖任何数据预处理。缺点也同样明显：当 n 很大时，O(n) 的代价不可接受。

### 5.1.2 二分查找 (Binary Search)

二分查找是 Divide & Conquer 思想的经典代表。它要求数据**已排序**，每次将搜索范围缩小一半：

```
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(log n) — 每次迭代减半搜索空间 |
| **空间复杂度** | O(1) — 迭代版本；递归版本为 O(log n) 栈空间 |
| **数据要求** | **必须有序** |
| **适用场景** | 大规模有序数据、多次查询 |

> **思考**：为什么 `mid = (left + right) // 2` 在某些语言中可能溢出？Python 中是否存在此问题？

### 5.1.3 对比总结

| 维度 | 线性查找 | 二分查找 |
|---|---|---|
| 时间复杂度 | O(n) | O(log n) |
| 数据是否有序 | 不需要 | 必须有序 |
| 实现难度 | 极低 | 低 |
| 对小数据集 | 优秀 | 尚可（有预处理成本） |
| 对大数据集 | 不可接受 | 优秀 |
| 能否用于链表 | 能 | 不能（需随机访问） |

**经验法则**：当 n < 100 且只需查找一次时，线性查找更简单；当 n 较大或需要多次查找时，排序 + 二分查找更优。

---

## 5.2 二分查找变体

基础二分查找只能找到"某个等于 target 的元素"，但实际需求往往更复杂。

### 5.2.1 查找第一个等于 target 的位置 (Left Boundary)

当数组中存在重复元素时，基础二分查找返回的是**任意一个**匹配位置。若要找**第一个**出现位置，需要调整收缩策略：

```
def left_boundary(arr, target):
    left, right = 0, len(arr)
    while left < right:
        mid = (left + right) // 2
        if arr[mid] < target:
            left = mid + 1
        else:
            right = mid
    return left  # 第一个 >= target 的位置
```

关键区别：
- `right = len(arr)` 而非 `len(arr) - 1`，区间为 `[left, right)`
- 当 `arr[mid] >= target` 时，**不返回**而是将 `right` 左移
- 循环结束时 `left == right`，即第一个 >= target 的位置
- 调用后需检查 `left < len(arr) and arr[left] == target`

### 5.2.2 查找最后一个等于 target 的位置 (Right Boundary)

对称地，寻找最后一个出现位置：

```
def right_boundary(arr, target):
    left, right = 0, len(arr)
    while left < right:
        mid = (left + right) // 2
        if arr[mid] <= target:
            left = mid + 1
        else:
            right = mid
    return right - 1  # 最后一个 <= target 的位置
```

逻辑对称：
- `arr[mid] <= target` 时左指针右移
- 最终 `right - 1` 是最后一个 <= target 的位置
- 调用后需检查 `right - 1 >= 0 and arr[right - 1] == target`

### 5.2.3 在旋转有序数组中查找

"旋转有序数组"是指将一个有序数组从某点切分后交换两段得到的数组，例如 `[4,5,6,7,0,1,2]`。它的特点是：数组被分为两个有序段，且 `nums[0] > nums[-1]`（除非未旋转）。

```
def search_rotated(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        if nums[left] <= nums[mid]:  # 左半部分有序
            if nums[left] <= target < nums[mid]:
                right = mid - 1
            else:
                left = mid + 1
        else:  # 右半部分有序
            if nums[mid] < target <= nums[right]:
                left = mid + 1
            else:
                right = mid - 1
    return -1
```

核心思路：每次二分时，**至少有一半是有序的**。判断 target 是否在有序半区内，据此缩小范围。

> **LeetCode 33**: Search in Rotated Sorted Array 正是此题。这是面试中出现频率最高的二分查找变体之一。

---

## 5.3 插值查找与斐波那契查找

### 5.3.1 插值查找 (Interpolation Search)

二分查找固定使用中点，而插值查找根据 target 的值**估算**可能的位置，适用于**均匀分布**的数据。

```
def interpolation_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right and arr[left] <= target <= arr[right]:
        if left == right:
            return left if arr[left] == target else -1
        pos = left + (target - arr[left]) * (right - left) // (arr[right] - arr[left])
        if arr[pos] == target:
            return pos
        if arr[pos] < target:
            left = pos + 1
        else:
            right = pos - 1
    return -1
```

位置计算公式：
```
pos = left + (target - arr[left]) * (right - left) / (arr[right] - arr[left])
```

| 特性 | 说明 |
|---|---|
| **平均时间复杂度** | O(log log n) |
| **最坏时间复杂度** | O(n) — 数据分布极不均匀时退化为线性 |
| **数据要求** | 有序且**均匀分布**（如等差数列） |
| **适用场景** | 大规模均匀数据，如 ID 递增的记录、按字母排序的均匀词表 |

### 5.3.2 斐波那契查找 (Fibonacci Search)

斐波那契查找使用黄金分割比例（≈0.618）来划分搜索区间，而不是中点或插值点。

```
def fibonacci_search(arr, target):
    n = len(arr)
    fib2, fib1 = 0, 1       # F(k-2), F(k-1)
    fib = fib1 + fib2       # F(k)
    while fib < n:
        fib2, fib1 = fib1, fib
        fib = fib1 + fib2
    offset = -1
    while fib > 1:
        i = min(offset + fib2, n - 1)
        if arr[i] < target:
            fib, fib1, fib2 = fib1, fib2, fib - fib1
            offset = i
        elif arr[i] > target:
            fib, fib1, fib2 = fib2, fib1 - fib2, fib - fib1
        else:
            return i
    if fib1 and offset + 1 < n and arr[offset + 1] == target:
        return offset + 1
    return -1
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(log n) |
| **优势** | 仅使用加减法（无除法运算），在 CPU 指令层面更高效 |
| **现代意义** | 主要用于理论教学；实际生产中被二分查找替代 |
| **适用场景** | 极端嵌入式环境、除法运算代价极高的平台 |

### 5.3.3 何时使用哪种？

| 场景 | 推荐算法 |
|---|---|
| 小数据集或无序数据 | 线性查找 |
| 有序数据，通用场景 | 二分查找 |
| 均匀分布的大规模有序数据 | 插值查找 |
| 除法开销极大的特殊硬件 | 斐波那契查找 |

---

## 5.4 哈希查找

哈希表是**最强大**的查找结构，实现了 **O(1) 平均时间复杂度**。

### 5.4.1 基本原理

哈希查找的核心思想：通过一个**哈希函数 (Hash Function)** 将 key 直接映射到存储位置，从而省去比较过程。

```
hash(key) → index  (0 ≤ index < table_size)
```

**理想情况**：每个 key 映射到唯一位置 → O(1) 查找/插入/删除。

**现实问题**：多个 key 映射到同一位置 → **哈希冲突 (Collision)**。

### 5.4.2 冲突解决方法

#### 链地址法 (Chaining)

每个槽位维护一个链表（或其他容器），冲突元素链入同一槽位。

```
槽位 0: [] → (key1, val1) → (key2, val2)
槽位 1: [] → (key3, val3)
槽位 2: [] → (key4, val4) → (key5, val5) → (key6, val6)
```

- **优点**：实现简单；删除方便；负载因子 (load factor) 可以 > 1
- **缺点**：链表遍历有额外指针开销；缓存不友好

#### 开放地址法 (Open Addressing)

冲突时寻找下一个可用槽位。常见探测策略：

| 策略 | 探测序列 | 说明 |
|---|---|---|
| **线性探测** | `(hash + i) % M` | 简单但有**聚类 (clustering)** 问题 |
| **二次探测** | `(hash + i²) % M` | 减少聚类，但可能无法遍历所有槽位 |
| **双重哈希** | `(hash + i · h₂(key)) % M` | 使用第二个哈希函数决定步长，聚类最少 |

```
# 线性探测示例
插入 key=17, hash(17)=3, 但槽位3已被占用
→ 检查 4, 5, 6... 直到找到空位
```

### 5.4.3 负载因子与重哈希

**负载因子 (Load Factor)** 的定义：
```
α = n / m   (n = 已存储元素数, m = 槽位数)
```

| α 值 | 对性能的影响 |
|---|---|
| α < 0.5 | 冲突概率低，空间浪费较多 |
| α ≈ 0.75 | Java HashMap 的默认阈值，性能与空间的良好平衡 |
| α > 1.0 | 仅链地址法允许；冲突增多，性能下降 |

当 α 超过阈值时，执行 **Rehashing（重哈希）**：
1. 分配更大的数组（通常 2 倍）
2. 重新计算所有元素的哈希值并插入新数组
3. 释放旧数组

> Rehashing 的均摊成本为 O(1) —— 虽然单次操作可能很慢，但分摊到所有操作上是常数级别的。

### 5.4.4 Python dict 内部实现

Python 的 dict 是**工业级哈希表**的典范。截至 CPython 3.11，其核心设计如下：

| 特性 | Python dict |
|---|---|
| 冲突解决 | 开放地址法 + 二次探测 |
| 哈希函数 | `hash()` 内置函数，对 str 和 int 有专用优化 |
| 初始容量 | 8 个槽位 |
| 负载因子阈值 | 约 2/3（即 α > 0.66 时触发 rehash） |
| 增长策略 | 扩容约 2~4 倍（具体为 `2**ceil(log2(n*4/3))` 附近） |
| 插入顺序 | **Python 3.7+ 保序**——底层使用 compact dict 实现 |

**Compact Dict (Python 3.6+)** 的核心改进：
- 将哈希表分为两个数组：`indices`（稀疏，存储索引）和 `entries`（紧凑，存储实际键值对）
- 遍历时只需扫描 `entries`，保持了**插入顺序**
- 内存占用降低约 20-30%

> **例**：执行 `d = {"a": 1, "b": 2, "c": 3}` 时，实际存储结构大致如下：
> ```
> indices:  [-1, 0, -1, 1, -1, -1, -1, 2]
> entries:  [("a",1, hash_a), ("b",2, hash_b), ("c",3, hash_c)]
> ```

---

## 5.5 Python 查找源码解析

### 5.5.1 `bisect` 模块

`bisect` 模块提供了基于二分查找的数组操作，底层使用 C 实现，性能极高。

| 函数 | 行为 |
|---|---|
| `bisect_left(a, x)` | 返回 x 在有序数组 a 中的插入点（左侧），即第一个 >= x 的位置 |
| `bisect_right(a, x)` | 返回 x 的插入点（右侧），即第一个 > x 的位置 |
| `insort_left(a, x)` | 在 bisect_left 位置插入 x，保持有序 |
| `insort_right(a, x)` | 在 bisect_right 位置插入 x，保持有序 |

```python
import bisect

arr = [1, 3, 5, 5, 7, 9]
idx = bisect.bisect_left(arr, 5)   # → 2 (第一个5的位置)
idx = bisect.bisect_right(arr, 5)  # → 4 (最后一个5的下一个位置)

# 常用技巧：通过 bisect_left 实现"查找第一个等于 target"：
def find_first(arr, target):
    i = bisect.bisect_left(arr, target)
    return i if i < len(arr) and arr[i] == target else -1
```

`bisect` 的源码（Python 版）本质上就是 5.2 节的 left_boundary 和 right_boundary：

```python
# bisect 模块的纯 Python 等价实现
def bisect_left(a, x, lo=0, hi=None):
    if hi is None: hi = len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo
```

### 5.5.2 dict 的查找流程

当你执行 `d[key]` 时，Python 内部发生的过程：

```
1. 计算 hash = hash(key)
2. 计算初始索引 i = hash & mask    (mask = capacity - 1)
3. 检查 entries[i] 是否为空 → 是则 KeyError
4. 比较 entries[i].hash == hash 且 entries[i].key == key → 是则返回值
5. 否则根据探测序列继续查找下一个槽位
```

核心源码位于 `Objects/dictobject.c` 的 `lookdict` 函数中：

```c
// 伪代码：dict 查找核心逻辑
size_t i = hash & mask;
for (size_t perturb = hash; ; perturb >>= PERTURB_SHIFT) {
    if (dk_entries[i].me_key == NULL) {
        // 未找到，返回 dummy 或引发 KeyError
    }
    if (dk_entries[i].me_key == key ||
        (dk_entries[i].me_hash == hash &&
         _PyUnicode_Equal(dk_entries[i].me_key, key))) {
        return &dk_entries[i].me_value;   // 找到
    }
    i = (i * 5 + perturb + 1) & mask;     // 探测序列
}
```

关键优化：
- **指针比较**优先：先比较 `me_key == key`（同一对象），快速命中
- **哈希值比较**过滤：只有 hash 相同的才调用完整等价比较
- **PERTURB_SHIFT**：使用扰动函数减少聚类

### 5.5.3 性能特征总结

| 操作 | dict 均摊 | list 二分查找 | list 线性查找 |
|---|---|---|---|
| 查找 | O(1) | O(log n) | O(n) |
| 插入 | O(1) | O(n)（需移动元素） | O(1)（尾部）|
| 删除 | O(1) | O(n) | O(n) |
| 有序遍历 | O(n)（保序） | O(n) | O(n) |

**何时用 dict，何时用 list + 二分？**

- **dict**：key 无顺序要求，需要极致插入/查找速度
- **list + 二分**：需要按顺序访问、范围查询（如"找出 20～30 之间的所有元素"）、需要按索引随机访问

---

## 本章小结

1. **线性查找**最简单但最慢（O(n)），适合小规模无序数据
2. **二分查找**以 O(log n) 的速度统治有序数据，其变体（边界查找、旋转数组查找）是面试高频考点
3. **插值查找**和**斐波那契查找**是二分查找的特化版本，在特定条件下更优
4. **哈希查找**是通用场景下的王者，平均 O(1) 的性能使其成为 dict/set 等核心数据结构的基石
5. Python 的 `bisect` 模块封装了二分查找，dict 的 compact 实现兼顾了性能与保序需求

> **下一步**：第6章将介绍排序算法——查找和排序常被合称为"算法的基本功"，二者相辅相成。