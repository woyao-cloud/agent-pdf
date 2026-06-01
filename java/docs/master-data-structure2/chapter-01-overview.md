# 第1章 数据结构概述

## 1.1 什么是数据结构

### 解决的问题

在软件开发中，我们每天都在处理数据——用户信息、商品列表、交易记录、传感器数据……如何高效地组织、存储和操作这些数据，是每个程序员必须面对的核心问题。数据结构就是解决这个问题的答案。

**数据结构（Data Structure）** 是计算机中存储、组织数据的方式，它定义了数据元素之间的关系以及对这些数据元素的操作方法。简单来说，数据结构决定了数据在内存中"长什么样"以及"能做什么"。

> **核心价值**：选择合适的数据结构，可以将程序的性能提升几个数量级。一个O(n)的算法换成O(log n)的数据结构，在百万级数据下的差异是质的飞跃。

### 实现原理

数据结构可以从两个维度来理解：

**逻辑结构**——数据元素之间的逻辑关系：
- **集合结构**：数据元素同属于一个集合，无其他关系
- **线性结构**：数据元素之间存在一对一的关系（如数组、链表）
- **树形结构**：数据元素之间存在一对多的关系（如二叉树）
- **图形结构**：数据元素之间存在多对多的关系（如图）

**物理结构**——数据在内存中的实际存储方式：
- **顺序存储**：用连续的内存空间存储数据（如数组）
- **链式存储**：用不连续的内存空间存储数据，通过指针连接（如链表）
- **索引存储**：通过索引表定位数据
- **散列存储**：通过哈希函数计算存储位置

```java
// 顺序存储 vs 链式存储的直观对比
// 顺序存储（数组）——连续内存
int[] array = new int[]{1, 2, 3, 4, 5};
// 访问第3个元素：O(1) —— 直接计算地址
int val = array[2];  // 基地址 + 2 × 4字节

// 链式存储（链表）——非连续内存，通过指针连接
class Node {
    int data;
    Node next;  // 指向下一个节点的指针
}
// 访问第3个元素：O(n) —— 需要从头遍历
```

### 代码实现

每一种数据结构都定义了基本的操作接口：

```java
/**
 * 数据结构的核心操作接口
 */
public interface DataStructure<E> {
    // 插入操作
    boolean add(E element);
    
    // 删除操作
    boolean remove(Object o);
    
    // 查找操作
    boolean contains(Object o);
    
    // 大小
    int size();
    
    // 是否为空
    boolean isEmpty();
    
    // 遍历
    void forEach(Consumer<? super E> action);
}
```

不同的数据结构对这些操作的实现效率天差地别。这正是我们需要深入研究数据结构的原因。

### 使用场景

数据结构的选择直接影响系统架构和性能：

| 场景 | 推荐数据结构 | 原因 |
|------|-------------|------|
| 用户会话缓存 | HashMap | O(1)查找 |
| 消息队列 | LinkedList / ArrayDeque | 两端操作高效 |
| 关键词搜索 | Trie树 | 前缀匹配O(m) |
| 任务调度 | PriorityQueue | 优先级排序 |
| 社交关系 | 图 | 多对多关系建模 |

### 潜在风险与问题

- **选择不当**：用ArrayList频繁增删首部元素 → O(n)开销，应改用LinkedList
- **忽视复杂度**：不了解数据结构的时间复杂度，在小数据量下没问题，数据量增长后系统崩溃
- **过度设计**：简单的业务场景用了复杂的数据结构，增加维护成本

### 优化策略

- 根据数据量级选择合适的数据结构
- 遵循"最简原则"：能用数组不用链表，能用List不用Tree
- 理解JDK源码中的设计权衡，如HashMap的负载因子为什么是0.75
- 在性能敏感场景中，优先考虑基本数据结构而非封装类

### 典型问题处理

**面试题：数组和链表的区别是什么？**

- 数组：连续内存、随机访问O(1)、插入删除O(n)
- 链表：非连续内存、随机访问O(n)、插入删除O(1)（已知位置）
- 本质是"空间换时间"还是"时间换空间"的取舍

---

## 1.2 数据结构的重要性

数据结构是程序的骨架。著名公式 **程序 = 数据结构 + 算法** 深刻揭示了这一点。

### 解决的问题

理解数据结构为什么重要，是为了回答一个根本问题：**为什么两个程序员解决同一个问题，性能却差10倍甚至100倍？**

答案往往在于数据结构的选择：

```java
// 错误示例：用ArrayList频繁查找
List<String> names = new ArrayList<>();
// ... 添加100万条数据
// 查找某条数据：O(n) —— 需要遍历整个列表
boolean exists = names.contains("target");  // 需要比较100万次

// 正确示例：用HashSet
Set<String> nameSet = new HashSet<>();
// ... 添加100万条数据
// 查找某条数据：O(1) —— 直接哈希定位
boolean exists = nameSet.contains("target");  // 只需1次计算
```

在百万级数据下，前者需要毫秒级，后者是纳秒级，差距超过1000倍。

### 实现原理

数据结构对系统性能的影响体现在三个层面：

**1. CPU层面**：数据在内存中的布局影响缓存命中率
- 数组（连续内存）→ CPU缓存友好 → 遍历速度快
- 链表（离散内存）→ CPU缓存不友好 → 遍历速度慢

**2. 内存层面**：不同的存储方式导致不同的内存开销
- 数组：每个元素只存数据，无额外开销
- 链表：每个节点需要额外的指针开销（Java中约16-24字节）

**3. 算法层面**：时间复杂度决定扩展性
- O(1)：完美扩展，数据量不影响性能
- O(n)：线性增长，数据量翻倍则时间翻倍
- O(n²)：平方增长，数据量翻倍则时间变为4倍

### 使用场景

理解数据结构的重要性，有助于在架构设计阶段做出正确的技术选型：

- **高并发缓存**：选择ConcurrentHashMap而非Hashtable
- **实时排行榜**：选择Redis Zset（跳表实现）而非数据库排序
- **全文搜索**：选择倒排索引而非LIKE查询
- **任务队列**：选择阻塞队列（BlockingQueue）而非自旋等待

### 潜在风险与问题

- "数据结构不重要"的认知误区
- 只关注业务逻辑，不关注数据组织方式
- 在性能分析时忽略数据结构选择带来的影响

### 优化策略

- 将数据结构选择纳入技术设计评审
- 建立数据结构性能基线
- 使用JMH等工具对关键路径进行基准测试

### 典型问题处理

为什么HashMap的查找是O(1)但有时会变慢？
- 正常情况下O(1)，但哈希冲突严重时退化为O(n)（Java 8后优化为红黑树O(log n)）

---

## 1.3 常见数据结构分类

### 解决的问题

面对众多的数据结构，需要建立一个分类体系，帮助开发者在面对问题时快速定位应该使用哪种数据结构。

### 实现原理

按逻辑结构分类：

```
数据结构
├── 线性结构
│   ├── 数组（Array）
│   ├── 链表（LinkedList）
│   ├── 栈（Stack）
│   └── 队列（Queue）
├── 树形结构
│   ├── 二叉树（Binary Tree）
│   ├── 平衡树（AVL、红黑树）
│   ├── 堆（Heap）
│   ├── B树/B+树
│   └── Trie树
├── 图形结构
│   └── 图（Graph）
└── 散列结构
    └── 哈希表（Hash Table）
```

按底层实现分类：

| 底层实现 | 代表数据结构 | 特点 |
|---------|-------------|------|
| 数组 | ArrayList、String、HashMap的桶数组 | 连续内存，随机访问快 |
| 链表 | LinkedList、LinkedHashMap | 非连续内存，增删快 |
| 哈希 | HashSet、HashMap、Hashtable | O(1)平均查找 |
| 树 | TreeMap、TreeSet、PriorityQueue | 有序，范围查询快 |

### 代码实现

```java
/**
 * 常见数据结构的时间复杂度对比
 */
public class DataStructureComparison {
    public static void main(String[] args) {
        // 1. 数组 —— 随机访问快，插入删除慢
        ArrayList<Integer> arrayList = new ArrayList<>();
        arrayList.add(1);                   // 末尾插入 O(1)
        arrayList.add(0, 0);                // 头部插入 O(n)
        int val = arrayList.get(2);         // 随机访问 O(1)
        
        // 2. 链表 —— 插入删除快，随机访问慢
        LinkedList<Integer> linkedList = new LinkedList<>();
        linkedList.addFirst(1);             // 头部插入 O(1)
        linkedList.addLast(2);              // 尾部插入 O(1)
        int val2 = linkedList.get(2);       // 随机访问 O(n)
        
        // 3. 哈希表 —— 查找极快
        HashMap<String, Integer> map = new HashMap<>();
        map.put("key", 1);                  // 插入 O(1)
        Integer val3 = map.get("key");      // 查找 O(1)
        
        // 4. 树 —— 有序，范围查询
        TreeMap<Integer, String> treeMap = new TreeMap<>();
        treeMap.put(1, "one");              // 插入 O(log n)
        treeMap.put(2, "two");
        NavigableMap<Integer, String> subMap = treeMap.subMap(1, true, 10, true); // 范围查询
    }
}
```

### 使用场景

- **数组**：固定大小、频繁随机访问的场景
- **链表**：频繁增删、数据量不确定的场景
- **栈**：需要LIFO后进先出的场景（如括号匹配）
- **队列**：需要FIFO先进先出的场景（如任务调度）
- **树**：需要有序存储、范围查询的场景
- **图**：需要建模复杂关系和路径的场景
- **哈希表**：需要快速查找、无需排序的场景

### 潜在风险与问题

- 混淆数据结构的逻辑分类和物理实现
- 不了解Java集合框架中每个类的底层数据结构
- 在并发场景下选择非线程安全的数据结构

### 优化策略

- 建立"问题 → 数据结构"的映射思维
- 深入理解JDK集合框架中每个类的底层实现
- 区分单线程和并发场景下的数据结构选择

### 典型问题处理

**面试题：Java集合框架中哪些类是基于数组实现的？**
- ArrayList、HashMap（桶数组）、ArrayDeque、EnumMap、HashSet（内部是HashMap）

---

## 1.4 Java中的数据结构生态

### 解决的问题

Java拥有世界上最丰富的集合框架之一——Java Collections Framework（JCF）。理解这个生态体系，能够帮助开发者在面对具体问题时，直接从标准库中找到解决方案。

### 实现原理

Java集合框架的顶层架构：

```
Collection（接口）
├── List（有序可重复）
│   ├── ArrayList（数组实现）
│   ├── LinkedList（双向链表实现）
│   └── Vector（线程安全，已淘汰）
├── Set（无序不可重复）
│   ├── HashSet（基于HashMap）
│   ├── LinkedHashSet（有序的HashSet）
│   └── TreeSet（红黑树实现，有序）
└── Queue（队列）
    ├── LinkedList / ArrayDeque
    ├── PriorityQueue（堆实现）
    └── BlockingQueue（线程安全，JUC包）
    
Map（键值对）
├── HashMap（哈希表）
├── LinkedHashMap（可维护插入顺序）
├── TreeMap（红黑树，键有序）
├── Hashtable（线程安全，已淘汰）
└── ConcurrentHashMap（高性能并发）
```

Java 8+引入的重要增强：
- HashMap引入红黑树优化（链表长度>8时转为红黑树）
- Arrays.parallelSort() 并行排序
- Stream API 对集合的操作增强
- Optional 避免空指针

Java 9+引入的不变集合：
- List.of()、Set.of()、Map.of() 创建不可变集合
- 性能更优，内存更省

### 代码实现

```java
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.*;

/**
 * Java集合框架使用示例
 */
public class JavaCollectionEcosystem {
    public static void main(String[] args) {
        // ----- List系列 -----
        // ArrayList: 随机访问频繁时使用
        List<String> arrayList = new ArrayList<>();
        arrayList.add("A");
        arrayList.add("B");
        String s = arrayList.get(0);  // O(1)
        
        // LinkedList: 频繁增删首尾时使用
        List<String> linkedList = new LinkedList<>();
        linkedList.add("A");
        ((LinkedList<String>) linkedList).addFirst("First");  // O(1)
        
        // ----- Set系列 -----
        Set<Integer> hashSet = new HashSet<>();
        hashSet.add(1);               // O(1)
        boolean exists = hashSet.contains(1);  // O(1)
        
        Set<Integer> treeSet = new TreeSet<>();
        treeSet.add(3);
        treeSet.add(1);
        treeSet.add(2);               // 自动排序
        // treeSet: [1, 2, 3]
        
        // ----- Map系列 -----
        Map<String, Integer> hashMap = new HashMap<>();
        hashMap.put("one", 1);
        hashMap.put("two", 2);
        
        // LinkedHashMap: 维护插入顺序
        Map<String, Integer> linkedHashMap = new LinkedHashMap<>(16, 0.75f, true);
        linkedHashMap.put("a", 1);
        linkedHashMap.put("b", 2);
        linkedHashMap.get("a");  // 访问后，"a"移到末尾（accessOrder=true时）
        
        // 使用LinkedHashMap实现LRU缓存
        class LRUCache<K, V> extends LinkedHashMap<K, V> {
            private final int maxCapacity;
            
            public LRUCache(int maxCapacity) {
                super(16, 0.75f, true);
                this.maxCapacity = maxCapacity;
            }
            
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                return size() > maxCapacity;
            }
        }
        
        // ----- Queue系列 -----
        Queue<Integer> queue = new LinkedList<>();     // 普通队列
        Queue<Integer> priorityQueue = new PriorityQueue<>();  // 优先级队列
        Deque<Integer> deque = new ArrayDeque<>();     // 双端队列
        
        // ----- 并发集合 -----
        Map<String, String> concurrentMap = new ConcurrentHashMap<>();  // 高并发
        Queue<String> blockingQueue = new LinkedBlockingQueue<>();      // 阻塞队列
        Deque<String> workStealing = new LinkedBlockingDeque<>();       // 工作窃取
    }
}
```

### 使用场景

- **单线程环境**：使用非同步集合（ArrayList、HashMap）
- **多线程环境**：使用并发集合（ConcurrentHashMap、CopyOnWriteArrayList）
- **需要排序**：使用TreeSet/TreeMap
- **需要保持插入顺序**：使用LinkedHashSet/LinkedHashMap
- **不可变集合**：使用List.of()、Set.of()、Map.of()

### 潜在风险与问题

- **ConcurrentModificationException**：遍历时修改集合，需使用迭代器的remove方法
- **Hashtable已淘汰**：使用synchronized方法实现线程安全，性能差，应用ConcurrentHashMap替代
- **Vector已淘汰**：与ArrayList功能重复，应用ArrayList或CopyOnWriteArrayList替代
- **Stack已淘汰**：使用Deque（ArrayDeque）替代

### 优化策略

- 优先使用ArrayList而非LinkedList（ArrayList在大多数场景下性能更好）
- 初始化时指定集合容量，避免频繁扩容
- 使用Collections.unmodifiableList()返回只读视图
- 善用Stream API减少集合操作代码

### 典型问题处理

**为什么HashMap的默认容量是16？**
- 太大浪费内存，太小频繁扩容
- 16是2的幂，便于使用位运算代替取模
- 经验值，经过大量测试后的权衡

---

## 1.5 如何学习数据结构

### 解决的问题

数据结构是计算机科学的核心课程，但很多开发者觉得难以掌握。本节提供系统化学习路径和方法论。

### 实现原理

学习数据结构应当遵循"理解 → 实现 → 应用 → 优化"的递进路径：

**第一阶段：理解**
- 理解每种数据结构的定义和特点
- 理解时间复杂度分析
- 理解适用场景

**第二阶段：实现**
- 手写核心实现
- 阅读JDK源码
- 编写单元测试验证

**第三阶段：应用**
- 在项目中选择合适的数据结构
- 解决经典算法题
- 参与开源项目

**第四阶段：优化**
- 分析性能瓶颈
- 了解底层实现优化
- 掌握并发数据结构

### 代码实现

```java
/**
 * 学习路径：从ArrayList源码理解学习数据结构的正确方式
 */
public class StudyApproach {
    public static void main(String[] args) {
        // 1️⃣ 理解：ArrayList基于数组，随机访问O(1)，插入删除O(n)
        
        // 2️⃣ 实现：手写简化版ArrayList
        class SimpleArrayList<E> {
            private static final int DEFAULT_CAPACITY = 10;
            private Object[] elements;
            private int size;
            
            public SimpleArrayList() {
                elements = new Object[DEFAULT_CAPACITY];
            }
            
            public void add(E e) {
                if (size == elements.length) {
                    grow();  // 扩容
                }
                elements[size++] = e;
            }
            
            @SuppressWarnings("unchecked")
            public E get(int index) {
                if (index < 0 || index >= size) {
                    throw new IndexOutOfBoundsException();
                }
                return (E) elements[index];
            }
            
            private void grow() {
                int newCapacity = elements.length + (elements.length >> 1);  // 1.5倍
                elements = Arrays.copyOf(elements, newCapacity);
            }
        }
        
        // 3️⃣ 应用：在项目中使用ArrayList
        
        // 4️⃣ 优化：预分配容量避免扩容
        List<String> optimized = new ArrayList<>(1000);  // 预分配1000
    }
}
```

### 使用场景

学习建议的时间分配：

| 阶段 | 时间占比 | 方法 |
|------|---------|------|
| 理解概念 | 20% | 阅读、画图、类比 |
| 实现代码 | 30% | 手写、跑测试、debug |
| 阅读源码 | 20% | JDK源码、Guava等 |
| 刷题练习 | 20% | LeetCode、牛客网 |
| 项目应用 | 10% | 重构、Code Review |

### 潜在风险与问题

- **只学不练**：光看书不写代码
- **只刷题不思考**：不理解为什么用这个数据结构
- **浅尝辄止**：知道接口不知道实现

### 优化策略

- **费曼学习法**：用自己的话讲给别人听
- **可视化工具**：使用visualgo.net等可视化学习
- **源码驱动**：从JDK源码倒推设计思想
- **项目驱动**：在真实项目中刻意练习

### 典型问题处理

**如何高效阅读JDK源码？**
1. 先看类注释（Javadoc）了解设计意图
2. 看核心字段了解底层数据结构
3. 看核心方法的实现
4. 对照调试看执行流程
5. 思考为什么这么设计（trade-off）

---

> **本章总结**：数据结构是程序的骨架，决定了程序的性能和扩展性。Java拥有丰富的集合框架，理解每种数据结构的特性、时间复杂度、适用场景和潜在风险，是成为高级Java工程师的必修课。后续章节将深入每种数据结构的原理与实现。
