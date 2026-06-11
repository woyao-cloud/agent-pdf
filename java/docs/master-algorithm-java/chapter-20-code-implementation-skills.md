# 第20章 代码实现能力

> "设计是一回事，写出正确、高效、可维护的实现是另一回事。高手和新手的差距往往在执行力。"

---

## 20.1 手写算法实现

在面试或竞赛中手写算法时，需要在有限时间内完成编码。以下是关键技巧。

### 时间压力下的编码策略

**三遍法：**
1. **第一遍：想清楚再动手**（占 30% 时间）
   - 理解问题 → 确认输入输出 → 构思算法 → 在纸上画流程
   - 确定边界条件 → 确定数据结构
2. **第二遍：写核心逻辑**（占 50% 时间）
   - 从核心算法开始写，先不管细节
   - 写完主线再补充辅助代码
3. **第三遍：检查和完善**（占 20% 时间）
   - 走读代码，检查边界
   - 修复 bug，优化细节

### 变量命名规范

好的命名能让你在调试时少费一半精力：

| 场景 | 好的命名 | 差的命名 |
|------|---------|---------|
| 数组下标 | i, j, k（循环变量），left, right（双指针） | a, b, c |
| 计数 | count, freq, sum | cnt, ans |
| 指针/索引 | slow, fast, p, q | p1, p2, p3 |
| 中间结果 | cur, prev, next, temp | t, tt, ttt |
| 集合 | seen, visited, memo | set, map |
| 结果 | result, maxVal, minVal | res, ans |

**双指针命名惯例：**
- 相向双指针：`left`, `right`
- 同向双指针：`slow`, `fast`
- 滑动窗口：`windowStart`, `windowEnd`

### 边界条件处理

**常见边界场景及 Java 处理：**

| 边界场景 | 处理方式 |
|---------|---------|
| 空数组 | 先 `if (arr == null || arr.length == 0)` 返回默认值 |
| 单个元素 | 确保循环和索引逻辑支持 n=1 |
| 整数溢出 | 用 `long` 作中间计算，比较时用 `Integer.compare()` |
| 负值输入 | 显式处理，不要假设输入非负 |
| 大输入规模 | 避免 O(n²)，注意递归深度（StackOverflow） |

**示例：二分查找的边界处理**

```java
// ✅ 正确的二分查找
int binarySearch(int[] arr, int target) {
    if (arr == null || arr.length == 0) return -1;
    int low = 0, high = arr.length - 1;
    while (low <= high) {                     // <= 而不是 <
        int mid = low + (high - low) / 2;     // 防溢出
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}
```

### 常见陷阱

| 陷阱 | 错误写法 | 正确写法 |
|------|---------|---------|
| 死循环 | `while (i <= j)` + `i = mid` | `i = mid + 1` 或 `j = mid - 1` |
| 整数溢出 | `(i + j) / 2` | `i + (j - i) / 2` |
| 除零 | `int x = 1 / count`（count 可能为0） | 先检查 count != 0 |
| 空指针 | `str.equals("")` | `"".equals(str)` 或 `Objects.equals()` |
| 索引越界 | `arr[i-1]` 当 i=0 时 | 确保 i > 0 |
| 递归深度 | 不做限制 | 改用迭代或设置最大深度 |

---

## 20.2 代码优化技巧

### 避免不必要的对象创建

```java
// ❌ 坏的：循环内创建对象
for (int i = 0; i < n; i++) {
    List<Integer> list = new ArrayList<>();  // 每次循环都 new
    list.add(arr[i]);
    // ...
}

// ✅ 好的：复用对象
List<Integer> list = new ArrayList<>();
for (int i = 0; i < n; i++) {
    list.clear();
    list.add(arr[i]);
    // ...
}
```

**装箱/拆箱开销：**

```java
// ❌ 坏的：隐式装箱
Integer sum = 0;
for (int i = 0; i < 1000000; i++) {
    sum += i;   // 每次都要 Integer.valueOf() 和 intValue()
}

// ✅ 好的：用原始类型
int sum = 0;
for (int i = 0; i < 1000000; i++) {
    sum += i;
}
```

### StringBuilder 的使用

```java
// ❌ 坏的：字符串拼接
String s = "";
for (int i = 0; i < 1000; i++) {
    s += i;     // 每次生成新的 String 对象 O(n²)
}

// ✅ 好的：StringBuilder
StringBuilder sb = new StringBuilder(5000);  // 预分配容量
for (int i = 0; i < 1000; i++) {
    sb.append(i);
}
String s = sb.toString();
```

### 预分配集合容量

```java
// ❌ 坏的：默认容量，频繁扩容
List<String> list = new ArrayList<>();
for (int i = 0; i < 100000; i++) {
    list.add(items[i]);   // 多次扩容
}

// ✅ 好的：预分配
List<String> list = new ArrayList<>(100000);  // 一次到位
```

```java
// ❌ 坏的
Map<String, Integer> map = new HashMap<>();
// 默认负载因子 0.75，当超过 12 个元素时扩容

// ✅ 好的：已知大小时指定容量
Map<String, Integer> map = new HashMap<>(size / 0.75f + 1);
```

### Stream API vs 传统循环

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| 简单遍历输出 | Stream | 代码更简洁 |
| 简单的 map/filter/collect | Stream | 链式调用，可读性好 |
| 复杂逻辑的条件分支 | 传统循环 | break/return 更自然 |
| 性能关键路径 | 传统循环 | 避免 Stream 的额外开销 |
| 并行处理大数据集 | parallelStream | 充分利用多核 |

**性能对比经验数据（常规场景下）：**
- 传统 `for` 循环 ≈ `forEach` lambda ≈ 基线
- Stream API ≈ 1.1x - 1.5x 传统循环
- parallelStream ≈ 需要数据量 > 10K 才有优势
- 不要在单次调用中过度链式（超过 5 个操作），可读性下降且性能有损耗

### 数组 vs 集合的选择

```java
// 固定大小、性能关键 → 数组
int[] scores = new int[1000];

// 动态大小、便利性优先 → ArrayList
List<Integer> scores = new ArrayList<>();

// 查找密集 → HashSet
Set<Integer> set = new HashSet<>();

// 排序后遍历 + 查找 → TreeSet
TreeSet<Integer> sortedSet = new TreeSet<>();
```

---

## 20.3 测试驱动开发

TDD 的核心循环：**红 → 绿 → 重构**
1. 写一个失败的测试（红）
2. 写最少代码让测试通过（绿）
3. 重构代码，保持测试通过

### 测试用例分类

| 类型 | 目的 | 例子（二分查找） |
|------|------|----------------|
| 正常用例 | 验证基本功能 | `search([1,2,3], 2) → 1` |
| 边界用例 | 验证边界 | `search([1], 1) → 0` |
| 退化用例 | 验证极端 | `search([], 5) → -1` |
| 错误输入 | 验证防御 | `search(null, 5) → -1` |
| 重复值 | 验证稳定性 | `search([1,1,1], 1) → 0 或 1 或 2` |

### 手动测试框架

在无法使用 JUnit 的环境中，可以编写简单的测试框架：

```java
class TestCase {
    String name;
    Runnable test;
    TestCase(String name, Runnable test) {
        this.name = name;
        this.test = test;
    }
}

void runTests(List<TestCase> tests) {
    int passed = 0, failed = 0;
    for (TestCase tc : tests) {
        try {
            tc.test.run();
            System.out.println("  ✓ " + tc.name);
            passed++;
        } catch (AssertionError | Exception e) {
            System.out.println("  ✗ " + tc.name + ": " + e.getMessage());
            failed++;
        }
    }
    System.out.printf("\n结果: %d 通过, %d 失败\n", passed, failed);
}
```

### 参数化测试

同一段逻辑，用多组数据验证：

```java
void verifyBinarySearch() {
    // 参数组：数组, 目标值, 期望结果
    Object[][] cases = {
        {new int[]{1, 2, 3, 4, 5}, 3, 2},
        {new int[]{1, 2, 3, 4, 5}, 1, 0},
        {new int[]{1, 2, 3, 4, 5}, 5, 4},
        {new int[]{1, 2, 3, 4, 5}, 0, -1},
        {new int[]{1, 2, 3, 4, 5}, 6, -1},
        {new int[]{}, 1, -1},
        {new int[]{5}, 5, 0},
        {new int[]{5}, 3, -1},
    };
    for (Object[] c : cases) {
        int[] arr = (int[]) c[0];
        int target = (int) c[1];
        int expected = (int) c[2];
        int actual = binarySearch(arr, target);
        if (actual != expected) {
            throw new AssertionError(
                String.format("search(%s, %d) = %d, 期望 %d",
                    Arrays.toString(arr), target, actual, expected));
        }
    }
}
```

### 基于属性的测试

不同于基于示例的测试（测试具体输入输出），属性测试验证通用的不变量：

```
排序算法的属性：
  ∀ array:  sorted(array) 是有序的
  ∀ array:  sorted(array) 是原数组的一个排列
  ∀ array:  sorted(array).length == array.length

二分查找的属性：
  ∀ arr, target:  search(arr, target) >= -1
  ∀ arr, target:  若 search(arr, target) != -1, 则 arr[result] == target
  ∀ arr, target:  若 target ∈ arr, 则 search(arr, target) != -1
```

Java 中的属性测试框架推荐 `jqwik` 或 `quickcheck`。

---

## 20.4 代码可读性与维护

### 有意义的命名

不仅变量名要有意义，类名和方法名也要反映其职责：

```java
// ❌ 坏的
int calc(int[] a) { ... }

// ✅ 好的
int findFirstDuplicate(int[] array) { ... }

// ❌ 坏的
public void process(List<Item> items) { ... }

// ✅ 好的：明确处理逻辑
public void removeExpiredItems(List<Item> items, Instant deadline) { ... }
```

### 单一职责原则

每个方法只做一件事：

```java
// ❌ 坏的：一个方法做了三件事
void processOrder(Order order) {
    // 1. 验证订单
    if (order.getTotal() < 0) throw new IllegalArgumentException();
    // 2. 计算折扣
    double discount = order.getTotal() > 100 ? 0.1 : 0;
    // 3. 保存订单
    database.save(order);
}

// ✅ 好的：拆分为三个方法
void validateOrder(Order order) { ... }
double calculateDiscount(Order order) { ... }
void saveOrder(Order order) { ... }
```

### 注释：写为什么，不写是什么

```java
// ❌ 坏的：注释说"是什么"
int sum = 0;  // 将 sum 设为 0
for (int i = 0; i < n; i++) {  // 循环 n 次
    sum += arr[i];  // 累加
}

// ✅ 好的：注释说"为什么"
// 使用 Dijkstra 算法而非 Bellman-Ford，因为图中没有负权边
int[] shortestDistances = dijkstra(graph, source);

// 使用低通滤波器消除高频噪声
// 截止频率 100Hz 是基于硬件手册推荐的传感器采样率
double[] filtered = lowPassFilter(rawData, 100);
```

### 防御性编程

对不可信输入进行校验：

```java
// 输入校验
public int divide(int a, int b) {
    if (b == 0) {
        throw new IllegalArgumentException("除数不能为 0");
    }
    return a / b;
}

// 断言（仅开发/测试环境开启，生产环境通常关闭）
public int pop() {
    assert size > 0 : "不能从空栈中弹出元素";
    return data[--size];
}
```

### 算法代码的 code review 清单

| 检查项 | 具体内容 |
|--------|---------|
| 正确性 | 是否覆盖了所有边界条件？有空数组/单一元素/全相同元素/全逆序？ |
| 复杂度 | 时间/空间复杂度是否符合预期？有隐藏的高复杂度操作吗？ |
| 溢出 | 整数加法/乘法可能溢出吗？mid = (low+high)/2 安全吗？ |
| 递归 | 递归深度可控吗？有栈溢出风险吗？尾递归优化？ |
| 可变性 | 是否不小心修改了输入数据？需要防御性拷贝吗？ |
| 并发 | 有共享可变状态吗？线程安全吗？ |
| API 设计 | 方法签名清晰吗？参数顺序合理吗？返回类型合适吗？ |
| 测试覆盖 | 所有分支都被测试了吗？异常路径呢？ |

---

> **本章总结：** 好的算法实现 = 正确的边界处理 + 合理的性能优化 + 充分的测试 + 干净的代码。算法能力不仅体现在设计上，更体现在稳定、高效的交付上。