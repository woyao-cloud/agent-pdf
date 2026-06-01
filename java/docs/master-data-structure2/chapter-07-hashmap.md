# 第7章 哈希表

## 7.1 哈希函数与哈希冲突

### 解决的问题

哈希表（Hash Table）解决了**快速查找**的问题——在数组中查找一个元素需要O(n)，在有序数组中二分查找需要O(log n)，而哈希表在理想情况下只需要O(1)。

> **核心价值**：哈希表是最重要的"空间换时间"数据结构，它将查找的复杂度从O(n)降到了O(1)。

### 实现原理

哈希表的核心思想：通过**哈希函数**将键（Key）映射到数组的某个位置，从而直接定位数据。

```
哈希表结构：
[Key] → [哈希函数] → [索引] → [数组]
                            ↓
                        [Value]

示例：hash("张三") = 3 → arr[3] = "张三的信息"
```

**哈希函数（Hash Function）**：

一个好的哈希函数需要满足：
1. **确定性**：相同的输入总是产生相同的输出
2. **高效性**：计算速度快
3. **均匀性**：输出均匀分布，减少冲突

```java
// JDK String的hashCode()实现
public int hashCode() {
    int h = hash;
    if (h == 0 && value.length > 0) {
        char val[] = value;
        for (int i = 0; i < value.length; i++) {
            h = 31 * h + val[i];  // 31是质数，乘法可以用移位优化
        }
        hash = h;
    }
    return h;
}
// 31 * h = (h << 5) - h  —— JVM会自动优化
```

**哈希冲突（Hash Collision）**：

当两个不同的Key映射到同一个索引时，就发生了冲突。解决冲突的两种主要方法：

```
链地址法（Separate Chaining）：
[0] → null
[1] → Node("A") → Node("C")  ← A和C冲突，用链表链接
[2] → Node("B")
[3] → null

开放地址法（Open Addressing）：
[0] → null
[1] → Node("A")
[2] → Node("C")  ← A的hash=1，C的hash=1，线性探测到2
[3] → Node("B")
```

### 代码实现

```java
/**
 * 哈希函数演示
 */
public class HashFunctionDemo {
    
    // 常见哈希函数
    static class HashFunctions {
        
        // 1. 除法哈希（最常用）
        static int divisionHash(int key, int tableSize) {
            return key % tableSize;  // 取模运算
        }
        
        // 2. 乘法哈希
        static int multiplicationHash(int key, int tableSize) {
            double A = 0.6180339887;  // 黄金分割比例
            double frac = (key * A) - Math.floor(key * A);
            return (int)(frac * tableSize);
        }
        
        // 3. 平方取中法
        static int midSquareHash(int key, int tableSize) {
            int square = key * key;
            // 取中间的几位
            return (square / 100) % tableSize;
        }
        
        // 4. 位运算哈希（Java HashMap使用）
        static int bitwiseHash(int key, int tableSize) {
            // 扰动函数：让高位参与运算，减少冲突
            int h = key;
            h ^= (h >>> 16);
            return h & (tableSize - 1);  // 等效于 % tableSize（要求tableSize是2的幂）
        }
        
        public static void main(String[] args) {
            int[] keys = {12345, 67890, 11111, 22222, 33333};
            int tableSize = 16;
            
            System.out.println("不同哈希函数的结果对比：");
            for (int key : keys) {
                System.out.printf("Key=%d: division=%d, bitwise=%d%n",
                    key,
                    divisionHash(key, tableSize),
                    bitwiseHash(key, tableSize));
            }
        }
    }
    
    // JDK HashMap的哈希函数
    static class HashMapHashFunction {
        // JDK 8 HashMap.hash()
        static final int hash(Object key) {
            int h;
            // key为null时hash=0（HashMap允许null键）
            // h ^ (h >>> 16)：高16位与低16位异或，让高位参与hash计算
            return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
        }
        
        // 计算数组索引
        static int index(int hash, int tableLength) {
            // 用 & 代替 %，要求 tableLength 是 2 的幂
            return hash & (tableLength - 1);
        }
        
        public static void main(String[] args) {
            // 演示：为什么需要扰动函数
            Integer key1 = 0xAAAA0000;  // 高位不同，低位相同
            Integer key2 = 0xBBBB0000;
            
            int h1 = key1.hashCode();
            int h2 = key2.hashCode();
            
            System.out.println("原始hash：");
            System.out.printf("  key1=%08x, key2=%08x%n", h1, h2);
            
            // 如果不做扰动，tableSize较小（如16）时，两个key全冲突
            System.out.println("未扰动的索引（size=16）：");
            System.out.printf("  key1=%d, key2=%d%n",
                h1 & 15, h2 & 15);  // 两者相同！
            
            // 扰动后
            int hash1 = hash(key1);
            int hash2 = hash(key2);
            System.out.println("扰动后的索引（size=16）：");
            System.out.printf("  key1=%d, key2=%d%n",
                hash1 & 15, hash2 & 15);  // 大概率不同
        }
    }
}
```

### 使用场景

- **快速查找**：字典、缓存、索引
- **去重**：HashSet
- **计数**：词频统计
- **映射**：Key-Value存储
- **缓存**：缓存计算结果

### 潜在风险与问题

- **哈希冲突严重**：退化为链表，O(1) → O(n)
- **负载因子选择**：过大增加冲突，过小浪费空间
- **hashCode()质量**：不均衡的hashCode()会严重影响性能
- **哈希表扩容**：rehash是O(n)的昂贵操作

### 优化策略

- 选择质量好的哈希函数（如JDK的扰动函数）
- 合理的负载因子（通常0.75）
- 使用2的幂作为表大小（位运算加速）
- 高质量实现hashCode()（使用质数乘法）

### 典型问题处理

**面试题：为什么HashMap的容量是2的幂？**

- `hash & (len - 1)` 等效于 `hash % len`，但位运算比取模快得多
- 只有len是2的幂时，`len - 1`的二进制才是全1，&运算才能得到正确结果

---

## 7.2 开放地址法与链地址法

### 解决的问题

哈希冲突是不可避免的，如何高效地解决冲突是哈希表设计的核心问题。开放地址法和链地址法是两种主流的冲突解决策略。

> **核心价值**：理解两种冲突解决策略的取舍，能够解释为什么HashMap选择链地址法。

### 实现原理

**链地址法（Separate Chaining）**：
```
每个桶是一个链表（或红黑树）
             [0] → [K1,V1] → [K5,V5] → [K9,V9]
head → 哈希 → [1] → [K2,V2]
             [2] → null
             [3] → [K3,V3] → [K7,V7]
```

**开放地址法（Open Addressing）**：
```
冲突时寻找下一个空位
             [0] → [K1,V1]
             [1] → [K2,V2]   ← K5的hash=0，冲突，线性探测到1
             [2] → [K3,V3]
             [3] → null       ← K7的hash=0，冲突，探测到3
             [4] → [K4,V4]
```

开放地址法的三种探测方式：

| 探测方式 | 公式 | 特点 |
|---------|------|------|
| 线性探测 | hi = (h + i) % m | 简单，但容易产生聚集 |
| 平方探测 | hi = (h + i²) % m | 减少聚集，但可能漏查 |
| 双哈希 | hi = (h + i·h2(key)) % m | 最均匀，但计算量大 |

### 代码实现

```java
/**
 * 链地址法实现
 */
public class ChainingHashMap<K, V> {
    
    private static class Node<K, V> {
        final K key;
        V value;
        Node<K, V> next;
        
        Node(K key, V value) {
            this.key = key;
            this.value = value;
        }
    }
    
    private Node<K, V>[] table;
    private int size;
    private static final float DEFAULT_LOAD_FACTOR = 0.75f;
    private int threshold;
    
    @SuppressWarnings("unchecked")
    public ChainingHashMap(int capacity) {
        table = new Node[capacity];
        threshold = (int)(capacity * DEFAULT_LOAD_FACTOR);
    }
    
    private int hash(K key) {
        int h = key.hashCode();
        return (h ^ (h >>> 16)) & (table.length - 1);
    }
    
    // put —— 平均O(1)
    public V put(K key, V value) {
        int index = hash(key);
        Node<K, V> head = table[index];
        
        // 查找是否已存在
        for (Node<K, V> node = head; node != null; node = node.next) {
            if (node.key.equals(key)) {
                V oldValue = node.value;
                node.value = value;
                return oldValue;
            }
        }
        
        // 头插法（新节点插入链表头部）
        Node<K, V> newNode = new Node<>(key, value);
        newNode.next = table[index];
        table[index] = newNode;
        size++;
        
        // 检查是否需要扩容
        if (size >= threshold) {
            resize();
        }
        return null;
    }
    
    // get —— 平均O(1)
    public V get(K key) {
        int index = hash(key);
        for (Node<K, V> node = table[index]; node != null; node = node.next) {
            if (node.key.equals(key)) {
                return node.value;
            }
        }
        return null;
    }
    
    // remove —— 平均O(1)
    public V remove(K key) {
        int index = hash(key);
        Node<K, V> head = table[index];
        if (head == null) return null;
        
        if (head.key.equals(key)) {
            table[index] = head.next;
            size--;
            return head.value;
        }
        
        for (Node<K, V> prev = head; prev.next != null; prev = prev.next) {
            if (prev.next.key.equals(key)) {
                V value = prev.next.value;
                prev.next = prev.next.next;
                size--;
                return value;
            }
        }
        return null;
    }
    
    @SuppressWarnings("unchecked")
    private void resize() {
        int newCapacity = table.length * 2;
        Node<K, V>[] newTable = new Node[newCapacity];
        
        // 重新哈希所有元素
        for (Node<K, V> node : table) {
            while (node != null) {
                Node<K, V> next = node.next;
                int newIndex = (node.key.hashCode() ^ (node.key.hashCode() >>> 16)) 
                              & (newCapacity - 1);
                node.next = newTable[newIndex];
                newTable[newIndex] = node;
                node = next;
            }
        }
        
        table = newTable;
        threshold = (int)(newCapacity * DEFAULT_LOAD_FACTOR);
    }
    
    public int size() {
        return size;
    }
}
```

```java
/**
 * 开放地址法实现（线性探测）
 */
public class OpenAddressingHashMap<K, V> {
    
    private static class Entry<K, V> {
        final K key;
        V value;
        boolean deleted;  // 惰性删除标记
        
        Entry(K key, V value) {
            this.key = key;
            this.value = value;
        }
    }
    
    private Entry<K, V>[] table;
    private int size;
    private static final float LOAD_FACTOR = 0.5f;  // 开放地址法需要更低的负载因子
    
    @SuppressWarnings("unchecked")
    public OpenAddressingHashMap(int capacity) {
        table = new Entry[capacity];
    }
    
    private int hash(K key) {
        int h = key.hashCode() ^ (key.hashCode() >>> 16);
        return h & (table.length - 1);
    }
    
    // put —— 线性探测
    public V put(K key, V value) {
        if (size >= table.length * LOAD_FACTOR) {
            resize();
        }
        
        int index = hash(key);
        int firstDeleted = -1;
        
        for (int i = 0; i < table.length; i++) {
            int pos = (index + i) % table.length;
            
            if (table[pos] == null) {
                // 遇到空位，插入
                if (firstDeleted != -1) {
                    pos = firstDeleted;  // 复用已删除的位置
                }
                table[pos] = new Entry<>(key, value);
                size++;
                return null;
            }
            
            if (table[pos].deleted) {
                if (firstDeleted == -1) {
                    firstDeleted = pos;
                }
                continue;
            }
            
            if (table[pos].key.equals(key)) {
                V oldValue = table[pos].value;
                table[pos].value = value;
                return oldValue;
            }
        }
        
        throw new RuntimeException("哈希表已满");
    }
    
    // get —— 线性探测
    public V get(K key) {
        int index = hash(key);
        for (int i = 0; i < table.length; i++) {
            int pos = (index + i) % table.length;
            if (table[pos] == null) return null;
            if (!table[pos].deleted && table[pos].key.equals(key)) {
                return table[pos].value;
            }
        }
        return null;
    }
    
    // remove —— 惰性删除
    public V remove(K key) {
        int index = hash(key);
        for (int i = 0; i < table.length; i++) {
            int pos = (index + i) % table.length;
            if (table[pos] == null) return null;
            if (!table[pos].deleted && table[pos].key.equals(key)) {
                V value = table[pos].value;
                table[pos].deleted = true;
                size--;
                return value;
            }
        }
        return null;
    }
    
    @SuppressWarnings("unchecked")
    private void resize() {
        Entry<K, V>[] oldTable = table;
        table = new Entry[oldTable.length * 2];
        size = 0;
        
        for (Entry<K, V> entry : oldTable) {
            if (entry != null && !entry.deleted) {
                put(entry.key, entry.value);
            }
        }
    }
}
```

### 使用场景

| 策略 | 适用场景 | 优势 | 劣势 |
|------|---------|------|------|
| 链地址法 | 通用场景 | 实现简单、负载因子容忍度高 | 额外指针内存 |
| 线性探测 | 数据量可预测 | 缓存友好、无指针开销 | 聚集问题 |
| 平方探测 | 中等数据量 | 减少聚集 | 可能漏查 |
| 双哈希 | 高性能要求 | 分布均匀 | 计算量大 |

### 潜在风险与问题

- **链地址法的退化**：所有key映射到同一个桶时退化为链表
- **开放地址法的删除**：不能直接删除，需要惰性删除
- **线性探测的聚集**：连续冲突形成"长龙"
- **负载因子的权衡**：链地址法可以到0.75，开放地址法需要更低（0.5左右）

### 优化策略

- 链地址法在链表过长时转红黑树（JDK 8+ HashMap）
- 开放地址法使用平方探测减少聚集
- 合理设置负载因子
- 使用随机探测或双哈希改善分布

### 典型问题处理

**面试题：为什么JDK HashMap使用链地址法而非开放地址法？**

- 链地址法对负载因子容忍度高（0.75 vs 0.5），节省内存
- 链地址法的删除操作简单直接
- 链表在冲突严重时可以转为红黑树（JDK 8+）
- 开放地址法在Java中很少使用（ThreadLocalMap是少有的例子）

---

## 7.3 手写HashMap实现

### 解决的问题

手写HashMap是理解哈希表实现最好的方式。通过亲手实现，可以深刻理解哈希函数、冲突解决、扩容机制、红黑树优化等核心概念。

### 实现原理

一个完整的HashMap需要支持：

```
HashMap<K, V>
├── put(K key, V value)    —— 插入
├── get(K key)             —— 查找
├── remove(K key)          —— 删除
├── containsKey(K key)     —— 是否包含
├── size()                 —— 大小
├── keySet()               —— 键集合
└── resize()               —— 扩容
```

### 代码实现

```java
/**
 * 手写HashMap（链地址法，含扩容）
 */
public class MyHashMap<K, V> {
    
    private static class Node<K, V> {
        final K key;
        V value;
        Node<K, V> next;
        
        Node(K key, V value) {
            this.key = key;
            this.value = value;
        }
    }
    
    // 默认初始容量
    private static final int DEFAULT_CAPACITY = 16;
    // 默认负载因子
    private static final float DEFAULT_LOAD_FACTOR = 0.75f;
    
    private Node<K, V>[] table;
    private int size;
    private int threshold;  // 扩容阈值 = capacity * loadFactor
    
    @SuppressWarnings("unchecked")
    public MyHashMap() {
        table = new Node[DEFAULT_CAPACITY];
        threshold = (int)(DEFAULT_CAPACITY * DEFAULT_LOAD_FACTOR);
    }
    
    @SuppressWarnings("unchecked")
    public MyHashMap(int initialCapacity) {
        // 找到大于等于initialCapacity的最小2的幂
        int capacity = 1;
        while (capacity < initialCapacity) {
            capacity <<= 1;
        }
        table = new Node[capacity];
        threshold = (int)(capacity * DEFAULT_LOAD_FACTOR);
    }
    
    // 哈希函数（JDK 8的扰动函数）
    private int hash(K key) {
        if (key == null) return 0;
        int h = key.hashCode();
        return h ^ (h >>> 16);
    }
    
    // 计算数组索引
    private int index(int hash) {
        return hash & (table.length - 1);
    }
    
    // put —— 摊销O(1)
    public V put(K key, V value) {
        int hash = hash(key);
        int idx = index(hash);
        
        // 如果键已存在，更新值
        for (Node<K, V> node = table[idx]; node != null; node = node.next) {
            if (node.key.equals(key)) {
                V oldValue = node.value;
                node.value = value;
                return oldValue;
            }
        }
        
        // 键不存在，头插法插入新节点
        Node<K, V> newNode = new Node<>(key, value);
        newNode.next = table[idx];
        table[idx] = newNode;
        size++;
        
        // 检查是否需要扩容
        if (size >= threshold) {
            resize();
        }
        return null;
    }
    
    // get —— 平均O(1)
    public V get(K key) {
        int idx = index(hash(key));
        for (Node<K, V> node = table[idx]; node != null; node = node.next) {
            if (node.key.equals(key)) {
                return node.value;
            }
        }
        return null;
    }
    
    // containsKey —— 平均O(1)
    public boolean containsKey(K key) {
        return get(key) != null;
    }
    
    // remove —— 平均O(1)
    public V remove(K key) {
        int idx = index(hash(key));
        Node<K, V> head = table[idx];
        
        if (head == null) return null;
        
        if (head.key.equals(key)) {
            table[idx] = head.next;
            size--;
            return head.value;
        }
        
        for (Node<K, V> prev = head; prev.next != null; prev = prev.next) {
            if (prev.next.key.equals(key)) {
                V value = prev.next.value;
                prev.next = prev.next.next;
                size--;
                return value;
            }
        }
        return null;
    }
    
    // 扩容 —— O(n)
    @SuppressWarnings("unchecked")
    private void resize() {
        int newCapacity = table.length * 2;
        Node<K, V>[] newTable = new Node[newCapacity];
        
        // 重新哈希
        for (Node<K, V> node : table) {
            while (node != null) {
                Node<K, V> next = node.next;
                int newIdx = (hash(node.key)) & (newCapacity - 1);
                // 头插法放入新表
                node.next = newTable[newIdx];
                newTable[newIdx] = node;
                node = next;
            }
        }
        
        table = newTable;
        threshold = (int)(newCapacity * DEFAULT_LOAD_FACTOR);
    }
    
    public int size() {
        return size;
    }
    
    public boolean isEmpty() {
        return size == 0;
    }
    
    // 打印内部状态
    public void printStats() {
        System.out.println("=== HashMap 内部状态 ===");
        System.out.println("容量: " + table.length);
        System.out.println("元素数: " + size);
        System.out.println("负载因子: " + (float)size / table.length);
        System.out.println("每个桶的链表长度:");
        for (int i = 0; i < table.length; i++) {
            int len = 0;
            for (Node<K, V> node = table[i]; node != null; node = node.next) {
                len++;
            }
            if (len > 0) {
                System.out.println("  桶[" + i + "]: " + len + "个元素");
            }
        }
    }
    
    // 使用示例
    public static void main(String[] args) {
        MyHashMap<String, Integer> map = new MyHashMap<>(4);
        
        map.put("one", 1);
        map.put("two", 2);
        map.put("three", 3);
        map.put("four", 4);
        map.put("five", 5);
        
        System.out.println("get('three'): " + map.get("three"));  // 3
        System.out.println("containsKey('six'): " + map.containsKey("six"));  // false
        System.out.println("remove('two'): " + map.remove("two"));  // 2
        System.out.println("size: " + map.size());  // 4
        
        map.printStats();
    }
}
```

### 使用场景

- **快速查找**：任何需要O(1)查找的场景
- **缓存实现**：缓存计算结果或数据
- **索引构建**：数据库索引、搜索引擎
- **数据聚合**：分组计数、状态统计

### 潜在风险与问题

- **红黑树优化未实现**：链表超过8个时性能退化
- **并发问题**：非线程安全
- **扩容耗时**：大数据量时resize()可能导致延迟抖动

### 优化策略

- 预分配容量：new HashMap<>(expectedSize / 0.75f + 1)
- 使用ConcurrentHashMap处理并发
- JDK 8+的树化优化：链表长度>8时转为红黑树

### 典型问题处理

**面试题：HashMap扩容时为什么是2倍？**

- 保证容量是2的幂，使位运算生效
- 扩容后元素要么在原位置，要么在原位置+原容量
- 利用这个特性，扩容时不需要重新计算hash，提升了效率

---

## 7.4 JDK源码解析（HashMap/Hashtable）

### 解决的问题

HashMap是Java中使用最频繁的集合类之一。从JDK 7到8有重大升级，理解源码才能在实际项目中正确使用和调优。

> **核心价值**：深度解析HashMap源码，理解工业级哈希表的设计智慧。

### 实现原理

**JDK 8 HashMap的核心变革**：

```
JDK 7：数组 + 链表
JDK 8：数组 + 链表/红黑树

链表转红黑树的条件：
1. 链表长度 >= 8（TREEIFY_THRESHOLD）
2. 总容量 >= 64（MIN_TREEIFY_CAPACITY）

红黑树转回链表：树节点数 <= 6（UNTREEIFY_THRESHOLD）
```

**核心字段**：

```java
public class HashMap<K,V> {
    // 底层存储数组（2的幂）
    transient Node<K,V>[] table;
    
    // 键值对数量
    transient int size;
    
    // 结构性修改次数（用于fail-fast迭代器）
    transient int modCount;
    
    // 扩容阈值 = capacity * loadFactor
    int threshold;
    
    // 负载因子
    final float loadFactor;
    
    // 默认初始容量（16）
    static final int DEFAULT_INITIAL_CAPACITY = 1 << 4;
    
    // 最大容量
    static final int MAXIMUM_CAPACITY = 1 << 30;
    
    // 默认负载因子（0.75）
    static final float DEFAULT_LOAD_FACTOR = 0.75f;
    
    // 树化阈值（链表长度超过8转为红黑树）
    static final int TREEIFY_THRESHOLD = 8;
    
    // 树退化阈值
    static final int UNTREEIFY_THRESHOLD = 6;
    
    // 最小树化容量（容量>=64才转树）
    static final int MIN_TREEIFY_CAPACITY = 64;
}
```

### 代码实现

```java
/**
 * HashMap源码深度解析
 */
public class HashMapSourceAnalysis {
    
    /**
     * ========== 1. put() 流程 ==========
     *
     * final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
     *                boolean evict) {
     *     Node<K,V>[] tab; Node<K,V> p; int n, i;
     *
     *     // 懒加载：第一次put时才创建数组
     *     if ((tab = table) == null || (n = tab.length) == 0)
     *         n = (tab = resize()).length;
     *
     *     // 计算索引，如果桶为空直接插入
     *     if ((p = tab[i = (n - 1) & hash]) == null)
     *         tab[i] = newNode(hash, key, value, null);
     *     else {
     *         Node<K,V> e; K k;
     *
     *         // 检查第一个节点是否匹配
     *         if (p.hash == hash &&
     *             ((k = p.key) == key || (key != null && key.equals(k))))
     *             e = p;
     *
     *         // 如果是红黑树节点
     *         else if (p instanceof TreeNode)
     *             e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
     *
     *         // 遍历链表
     *         else {
     *             for (int binCount = 0; ; ++binCount) {
     *                 if ((e = p.next) == null) {
     *                     p.next = newNode(hash, key, value, null);
     *                     // 链表长度达到阈值，转为红黑树
     *                     if (binCount >= TREEIFY_THRESHOLD - 1)
     *                         treeifyBin(tab, hash);
     *                     break;
     *                 }
     *                 if (e.hash == hash &&
     *                     ((k = e.key) == key || (key != null && key.equals(k))))
     *                     break;
     *                 p = e;
     *             }
     *         }
     *         if (e != null) {  // 找到已存在的key
     *             V oldValue = e.value;
     *             if (!onlyIfAbsent || oldValue == null)
     *                 e.value = value;
     *             afterNodeAccess(e);  // LinkedHashMap的回调
     *             return oldValue;
     *         }
     *     }
     *     ++modCount;
     *     if (++size > threshold)
     *         resize();
     *     afterNodeInsertion(evict);
     *     return null;
     * }
     */
    
    /**
     * ========== 2. get() 流程 ==========
     *
     * public V get(Object key) {
     *     Node<K,V> e;
     *     return (e = getNode(hash(key), key)) == null ? null : e.value;
     * }
     *
     * final Node<K,V> getNode(int hash, Object key) {
     *     Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
     *
     *     // 表不为空且桶不为空
     *     if ((tab = table) != null && (n = tab.length) > 0 &&
     *         (first = tab[(n - 1) & hash]) != null) {
     *
     *         // 检查第一个节点
     *         if (first.hash == hash &&
     *             ((k = first.key) == key || (key != null && key.equals(k))))
     *             return first;
     *
     *         if ((e = first.next) != null) {
     *             // 红黑树中查找
     *             if (first instanceof TreeNode)
     *                 return ((TreeNode<K,V>)first).getTreeNode(hash, key);
     *             // 链表中查找
     *             do {
     *                 if (e.hash == hash &&
     *                     ((k = e.key) == key || (key != null && key.equals(k))))
     *                     return e;
     *             } while ((e = e.next) != null);
     *         }
     *     }
     *     return null;
     * }
     */
    
    /**
     * ========== 3. resize() 扩容 ==========
     *
     * JDK 8的优化：扩容后元素位置要么不变，要么在原位置+旧容量
     *
     * final Node<K,V>[] resize() {
     *     Node<K,V>[] oldTab = table;
     *     int oldCap = (oldTab == null) ? 0 : oldTab.length;
     *     int oldThr = threshold;
     *     int newCap, newThr = 0;
     *
     *     if (oldCap > 0) {
     *         if (oldCap >= MAXIMUM_CAPACITY) {
     *             threshold = Integer.MAX_VALUE;
     *             return oldTab;
     *         }
     *         // 容量翻倍
     *         else if ((newCap = oldCap << 1) <= MAXIMUM_CAPACITY &&
     *                  oldCap >= DEFAULT_INITIAL_CAPACITY)
     *             newThr = oldThr << 1;  // 阈值也翻倍
     *     }
     *     ...
     *
     *     // 迁移元素优化：
     *     // 元素的新位置 = 原位置 或 原位置 + oldCap
     *     // 判断依据：(e.hash & oldCap) == 0 则位置不变，否则偏移oldCap
     *     if ((e.hash & oldCap) == 0) {
     *         // 留在原位置
     *     } else {
     *         // 移动到原位置 + oldCap
     *     }
     * }
     *
     * 这里利用了一个特性：扩容后容量翻倍，
     * 元素hash的"新增"最高位决定元素位置的变化。
     * 避免了JDK 7中需要重新计算hash的问题。
     */
    
    /**
     * ========== 4. 为什么负载因子是0.75？ ==========
     *
     * 官方注释中的解释：
     * "As a general rule, the default load factor (.75) offers a good
     *  tradeoff between time and space costs."
     *
     * 0.75的来源：泊松分布
     * 在负载因子0.75且随机hash下，桶中链表长度超过8的概率
     * 非常小（约0.00000006），所以TREEIFY_THRESHOLD=8是安全的。
     *
     * 泊松分布计算（链表长度概率）：
     * 0: 0.60653066
     * 1: 0.30326533
     * 2: 0.07581633
     * 3: 0.01263606
     * 4: 0.00157952
     * 5: 0.00015795
     * 6: 0.00001316
     * 7: 0.00000094
     * 8: 0.00000006  ← 链表长度8的概率极低
     */
    
    /**
     * ========== 5. JDK 7 vs JDK 8 HashMap 对比 ==========
     *
     * | 特性 | JDK 7 | JDK 8 |
     * |-----|-------|-------|
     * | 数据结构 | 数组+链表 | 数组+链表+红黑树 |
     * | 插入方式 | 头插法 | 尾插法 |
     * | hash计算 | 复杂(9次扰动) | 简单(1次扰动) |
     * | 扩容后位置 | 重新计算 | hash & oldCap判断 |
     * | 扩容并发 | 死循环(环形链表) | 无环但丢数据 |
     * | 初始化 | 构造器初始化 | 第一次put时初始化 |
     *
     * 为什么JDK 7的头插法改成了JDK 8的尾插法？
     * - 头插法在并发扩容时可能形成环形链表（死循环）
     * - 尾插法避免了这个问题
     * - 但HashMap本来就不是线程安全的
     */
    
    /**
     * ========== 6. Hashtable vs HashMap ==========
     *
     * Hashtable（已淘汰，不建议使用）
     * - 线程安全（方法用synchronized修饰）
     * - 不允许null键和null值
     * - 初始容量11，扩容2倍+1
     * - 使用取模运算计算索引
     * - 迭代器是fail-safe（不抛出ConcurrentModificationException）
     *
     * HashMap
     * - 线程不安全
     * - 允许null键（hash=0）和null值
     * - 初始容量16，扩容2倍
     * - 使用位运算计算索引
     * - 迭代器是fail-fast
     *
     * 结论：永远用HashMap，多线程用ConcurrentHashMap
     */
    
    public static void main(String[] args) {
        // 验证JDK 8扩容优化
        // 扩容前位置 i = hash & (oldCap - 1)
        // 扩容后位置 = i 或 i + oldCap
        // 判断：(hash & oldCap) == 0 ? i : i + oldCap
        
        int oldCap = 16;
        int hash1 = 0b0001_0101;  // hash & oldCap = 0 → 位置不变
        int hash2 = 0b0001_0111;  // hash & oldCap ≠ 0 → 位置+16
        
        int oldIdx1 = hash1 & (oldCap - 1);
        int oldIdx2 = hash2 & (oldCap - 1);
        
        int newIdx1 = hash1 & (oldCap * 2 - 1);
        int newIdx2 = hash2 & (oldCap * 2 - 1);
        
        System.out.println("扩容前 hash1=" + hash1 + " 位置=" + oldIdx1);
        System.out.println("扩容后 hash1=" + hash1 + " 位置=" + newIdx1);
        System.out.println("扩容前 hash2=" + hash2 + " 位置=" + oldIdx2);
        System.out.println("扩容后 hash2=" + hash2 + " 位置=" + newIdx2);
        System.out.println("验证：hash2的新位置 = " + (oldIdx2 + oldCap) + " ✓");
    }
}
```

### 使用场景

- **通用KV存储**：大多数Map场景
- **缓存**：但需要注意内存限制
- **配置存储**：系统配置的键值对
- **数据库结果映射**：ORM框架

### 潜在风险与问题

- **HashMap不是线程安全的**：多线程使用ConcurrentHashMap
- **扩容性能开销**：大数据量扩容可能导致延迟
- **红黑树退化**：某些hashCode()实现极差时
- **key的hashCode()必须稳定**：放入HashMap后修改key的hashCode会导致无法找到

```java
// hashCode不稳定的问题
MutableKey key = new MutableKey(1);  // hash=1
map.put(key, "value");
key.setValue(2);  // hashCode变为2！
map.get(key);     // null —— 找不到了！
// 永远不要用可变对象作为HashMap的key！
```

### 优化策略

- 预分配容量：new HashMap<>(expectedSize / 0.75f + 1)
- 使用不可变对象作为key
- 高质量实现hashCode()（使用31质数乘法）
- 大数据量时初始化足够的容量避免频繁扩容

### 典型问题处理

**面试题：HashMap在JDK 7和8中的区别？**

1. 数据结构：JDK 7只有数组+链表，JDK 8增加了红黑树
2. 插入方式：JDK 7头插法，JDK 8尾插法
3. hash计算：JDK 7 9次扰动，JDK 8 1次扰动
4. 扩容优化：JDK 8使用(e.hash & oldCap)判断新位置
5. 初始化时机：JDK 7构造器初始化，JDK 8第一次put时初始化

---

## 7.5 使用场景与风险分析

### 解决的问题

哈希表在实际项目中使用频率极高，但误用也很常见。总结HashMap的实际应用场景和潜在风险，有助于做出正确的技术决策。

### 实现原理

**哈希表的工程选型**：

```
需要Map？
├── 单线程 → HashMap
├── 多线程
│   ├── 高并发 → ConcurrentHashMap
│   ├── 低并发 → Collections.synchronizedMap()
│   └── 读多写少 → ConcurrentHashMap
├── 需要有序
│   ├── 插入顺序 → LinkedHashMap
│   └── 排序顺序 → TreeMap
└── 需要并发且有序 → ConcurrentSkipListMap
```

### 代码实现

```java
/**
 * HashMap实战中的常见问题和最佳实践
 */
public class HashMapBestPractices {
    
    // ========== 1. 容量预分配 ==========
    public void capacityPlanning() {
        int expectedSize = 1000;
        
        // ❌ 不指定容量：需要多次扩容
        HashMap<String, Integer> map1 = new HashMap<>();
        // 扩容次数 ≈ log_{1.5}(1000/16) ≈ 7次
        
        // ✅ 指定容量：减少扩容次数
        // 公式：expectedSize / loadFactor + 1
        HashMap<String, Integer> map2 = new HashMap<>((int)(expectedSize / 0.75f) + 1);
        // 扩容次数：0次！
    }
    
    // ========== 2. 自定义对象作为key ==========
    static class Person {
        private final String id;  // final —— 不可变
        private String name;
        
        Person(String id, String name) {
            this.id = id;
            this.name = name;
        }
        
        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            Person person = (Person) o;
            return id.equals(person.id);  // 只用业务标识字段
        }
        
        @Override
        public int hashCode() {
            return id.hashCode();  // 只用不可变字段！
        }
        
        // hashCode()的正确实现原则：
        // 1. 使用不可变字段（放入HashMap后hashCode不能变化）
        // 2. equals()返回true的两个对象，hashCode()必须相同
        // 3. 使用31作为乘数：31 * 素数减少冲突
    }
    
    // ========== 3. 使用computeIfAbsent简化代码 ==========
    public void computeIfAbsentExample() {
        Map<String, List<String>> multiMap = new HashMap<>();
        
        // ❌ 传统方式
        String key = "fruit";
        List<String> list = multiMap.get(key);
        if (list == null) {
            list = new ArrayList<>();
            multiMap.put(key, list);
        }
        list.add("apple");
        
        // ✅ Java 8+ 方式
        multiMap.computeIfAbsent("fruit", k -> new ArrayList<>())
                .add("banana");
    }
    
    // ========== 4. 遍历方式的性能对比 ==========
    public void iterationPerformance(Map<String, Integer> map) {
        // 方式1：entrySet（推荐）
        for (Map.Entry<String, Integer> entry : map.entrySet()) {
            System.out.println(entry.getKey() + "=" + entry.getValue());
        }
        
        // 方式2：keySet + get（最慢！每次get() O(1)但多一次hash计算）
        for (String key : map.keySet()) {
            System.out.println(key + "=" + map.get(key));
        }
        
        // 方式3：forEach（JDK 8+）
        map.forEach((key, value) -> System.out.println(key + "=" + value));
    }
    
    // ========== 5. 使用LinkedHashMap构建LRU缓存 ==========
    public void lruCacheExample() {
        LRUCache<String, String> cache = new LRUCache<>(3);
        cache.put("a", "1");
        cache.put("b", "2");
        cache.put("c", "3");
        cache.get("a");  // 访问a，a被移到末尾
        cache.put("d", "4");  // 超出容量，删除最久未访问的b
        System.out.println(cache);  // {c=3, a=1, d=4}
    }
    
    static class LRUCache<K, V> extends LinkedHashMap<K, V> {
        private final int maxCapacity;
        
        LRUCache(int maxCapacity) {
            super(16, 0.75f, true);  // accessOrder = true
            this.maxCapacity = maxCapacity;
        }
        
        @Override
        protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
            return size() > maxCapacity;
        }
    }
}
```

### 使用场景

| 场景 | 推荐实现 | 原因 |
|------|---------|------|
| 普通KV存储 | HashMap | 性能最好 |
| 高并发 | ConcurrentHashMap | 分段锁/无锁 |
| 保持顺序 | LinkedHashMap | 双向链表维护顺序 |
| 排序 | TreeMap | 红黑树 |
| 缓存 | LinkedHashMap/LRUCache | 支持淘汰策略 |

### 潜在风险与问题

- **key的可变性**：不可变对象作key
- **hashCode()质量**：差的hashCode()导致HashMap退化为链表
- **扩容抖动**：大数据量下扩容导致延迟
- **内存浪费**：负载因子过低导致大量空桶
- **死循环（JDK 7）**：并发扩容导致环形链表

### 优化策略

- 预估容量，避免扩容
- 使用不可变对象作key
- hash均匀时使用HashMap，需要顺序使用TreeMap/LinkedHashMap
- 使用ConcurrentHashMap进行并发访问

### 典型问题处理

**工程实践：HashMap的内存优化**

```java
// 1. 使用基本类型集合
// Eclipse Collections 或 fastutil 提供原始类型Map
// IntIntHashMap 比 HashMap<Integer, Integer> 节省约80%内存

// 2. 合理设置初始容量
Map<String, String> map = new HashMap<>(expectedSize, loadFactor);

// 3. 使用EnumMap（key是枚举类型时）
Map<Status, String> statusMap = new EnumMap<>(Status.class);
// 内部用数组实现，性能和内存都优于HashMap
```

---

## 7.6 性能优化技巧

### 解决的问题

HashMap的性能直接影响系统的响应速度。深入理解其性能特征，能在关键场景中做出正确的优化决策。

### 实现原理

**HashMap的性能关键因素**：

```
影响HashMap性能的三要素
├── 哈希函数质量：hashCode()的分布均匀性
├── 负载因子：空间和时间的平衡
└── 初始容量：扩容次数的影响
```

**不同数据量下的理论性能**：

```
数据量     HashMap(O(1) avg)     TreeMap(O(log n))     数组二分(O(log n))
1000       ~100ns               ~500ns                 ~200ns
10000      ~100ns               ~700ns                 ~300ns
100000     ~100ns               ~900ns                 ~400ns
（注：实际性能还要考虑hash冲突、CPU缓存等因素）
```

### 代码实现

```java
/**
 * HashMap性能优化实战
 */
public class HashMapOptimization {
    
    // ========== 1. 高质量hashCode()的实现 ==========
    static class OptimizedKey {
        private final int id;
        private final String name;
        private final long timestamp;
        
        OptimizedKey(int id, String name, long timestamp) {
            this.id = id;
            this.name = name;
            this.timestamp = timestamp;
        }
        
        // 标准hashCode实现（使用31质数乘法）
        @Override
        public int hashCode() {
            int result = 17;  // 非零初始值
            result = 31 * result + id;
            result = 31 * result + (name != null ? name.hashCode() : 0);
            result = 31 * result + (int)(timestamp ^ (timestamp >>> 32));
            return result;
        }
        
        // Objects.hash()替代方案（性能略低但简洁）
        // @Override
        // public int hashCode() {
        //     return Objects.hash(id, name, timestamp);
        // }
    }
    
    // ========== 2. 使用IntObjectHashMap（第三方库） ==========
    // Eclipse Collections:
    // IntObjectHashMap<String> map = new IntObjectHashMap<>();
    // map.put(1, "one");
    // 优点：使用int数组而非Integer对象，减少装箱开销和内存占用
    //
    // Maven: org.eclipse.collections:eclipse-collections:10.4.0
    
    // ========== 3. HashMap的性能基准测试 ==========
    public static class HashMapBenchmark {
        public static void main(String[] args) {
            int size = 100_000;
            
            // 测试：预分配 vs 不预分配
            long t1 = System.nanoTime();
            Map<Integer, Integer> map1 = new HashMap<>();
            for (int i = 0; i < size; i++) {
                map1.put(i, i);
            }
            long t2 = System.nanoTime();
            System.out.println("不预分配: " + (t2 - t1) / 1_000_000 + "ms");
            
            long t3 = System.nanoTime();
            Map<Integer, Integer> map2 = new HashMap<>((int)(size / 0.75f) + 1);
            for (int i = 0; i < size; i++) {
                map2.put(i, i);
            }
            long t4 = System.nanoTime();
            System.out.println("预分配: " + (t4 - t3) / 1_000_000 + "ms");
            
            // 测试：hash冲突对性能的影响
            class BadHash {
                int value;
                BadHash(int value) { this.value = value; }
                @Override public int hashCode() { return 1; }  // 所有key的hash相同！
                @Override public boolean equals(Object o) {
                    return (o instanceof BadHash) && ((BadHash)o).value == this.value;
                }
            }
            
            Map<BadHash, Integer> badMap = new HashMap<>();
            long t5 = System.nanoTime();
            for (int i = 0; i < 10000; i++) {
                badMap.put(new BadHash(i), i);
            }
            long t6 = System.nanoTime();
            System.out.println("hash冲突(10000个): " + (t6 - t5) / 1_000_000 + "ms");
            // 由于所有元素在一个桶中，JDK 8的红黑树确保O(log n)
            // JDK 7的话是O(n)，性能更差
        }
    }
}
```

### 使用场景

- **大数据量Map**：需要关注初始容量
- **高频访问**：需要关注hash分布和冲突
- **内存敏感**：可以考虑使用专门优化过的Map实现
- **性能基准测试**：使用JMH进行真实性能对比

### 潜在风险与问题

- **容量过大浪费内存**：初始化容量远大于实际数据量
- **hashCode()的连锁问题**：hashCode()影响整个HashMap的性能
- **JIT优化不确定性**：JIT可能内联hashCode()，也可能不内联
- **并发时的rehash问题**：即使JDK 8解决了死循环问题，并发put仍可能丢失数据

### 优化策略

1. **预分配容量**：避免扩容带来的性能损耗
2. **高质量hashCode()**：使用31质数乘法，确保hash均匀
3. **使用int/long key时考虑Int2IntOpenHashMap**：减少内存占用
4. **使用EnumMap**：当key是枚举类型时
5. **使用ConcurrentHashMap替代synchronizedMap**

### 典型问题处理

**面试题：如何优化HashMap的put性能？**

1. 预估数据量，设置合适的初始容量
2. 确保key的hashCode()分布均匀
3. 使用不可变对象作key
4. 在JDK 8+上运行以享受红黑树优化
5. 必要时使用第三方优化库（Eclipse Collections、fastutil）

---

## 7.7 典型问题：LRU缓存、哈希分片

### 解决的问题

LRU缓存和哈希分片是哈希表在工程中的高阶应用。LRU缓存是缓存淘汰策略的标准方案，哈希分片是分布式系统中数据分片的核心技术。

### 实现原理

**LRU缓存（Least Recently Used）**：
```
[访问顺序] ← 最近使用
每次访问一个元素，将其移到链表头部
当缓存满时，淘汰链表尾部的元素（最久未使用）

LinkedHashMap + accessOrder=true：
- 每次get()后将元素移到链表末尾
- removeEldestEntry()在插入新元素时调用
- 如果超过容量，删除链表头部的元素
```

**一致性哈希（Consistent Hashing）**：
```
哈希环上的数据分布：
        Node1
    ○━━━━━●━━━━━○
   ┃               ┃
Node●               ●Node2
   ┃               ┃
    ○━━━━━●━━━━━○
        Node3

每个节点在哈希环上占据一个位置
数据按哈希值在环上找到最近的节点
节点增减只影响相邻节点，不影响全局
```

### 代码实现

```java
/**
 * LRU缓存完整实现
 */
public class LRUCacheComplete<K, V> {
    
    // 双链表节点
    private static class Node<K, V> {
        K key;
        V value;
        Node<K, V> prev;
        Node<K, V> next;
        
        Node(K key, V value) {
            this.key = key;
            this.value = value;
        }
    }
    
    private final int capacity;
    private final Map<K, Node<K, V>> map;
    private final Node<K, V> head;  // dummy头
    private final Node<K, V> tail;  // dummy尾
    
    public LRUCacheComplete(int capacity) {
        this.capacity = capacity;
        this.map = new HashMap<>(capacity);
        this.head = new Node<>(null, null);
        this.tail = new Node<>(null, null);
        head.next = tail;
        tail.prev = head;
    }
    
    // get —— O(1)
    public V get(K key) {
        Node<K, V> node = map.get(key);
        if (node == null) return null;
        moveToHead(node);  // 最近访问，移到头部
        return node.value;
    }
    
    // put —— O(1)
    public void put(K key, V value) {
        Node<K, V> node = map.get(key);
        if (node == null) {
            node = new Node<>(key, value);
            map.put(key, node);
            addToHead(node);
            if (map.size() > capacity) {
                Node<K, V> tail = removeTail();
                map.remove(tail.key);
            }
        } else {
            node.value = value;
            moveToHead(node);
        }
    }
    
    private void addToHead(Node<K, V> node) {
        node.prev = head;
        node.next = head.next;
        head.next.prev = node;
        head.next = node;
    }
    
    private void removeNode(Node<K, V> node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }
    
    private void moveToHead(Node<K, V> node) {
        removeNode(node);
        addToHead(node);
    }
    
    private Node<K, V> removeTail() {
        Node<K, V> node = tail.prev;
        removeNode(node);
        return node;
    }
    
    public int size() {
        return map.size();
    }
    
    public void printCache() {
        System.out.print("Cache: ");
        Node<K, V> current = head.next;
        while (current != tail) {
            System.out.print(current.key + "=" + current.value + " ");
            current = current.next;
        }
        System.out.println();
    }
    
    public static void main(String[] args) {
        LRUCacheComplete<Integer, String> cache = new LRUCacheComplete<>(3);
        
        cache.put(1, "A");
        cache.put(2, "B");
        cache.put(3, "C");
        cache.printCache();  // A B C
        
        cache.get(1);  // 访问1
        cache.printCache();  // B C A（1移到末尾）
        
        cache.put(4, "D");  // 超出容量，淘汰B
        cache.printCache();  // C A D
        
        cache.get(2);  // null（已被淘汰）
    }
}
```

```java
/**
 * 一致性哈希实现（简化版）
 */
public class ConsistentHash<T> {
    
    private final int virtualNodes;  // 每个物理节点对应的虚拟节点数
    private final TreeMap<Integer, T> ring = new TreeMap<>();  // 哈希环
    
    public ConsistentHash(int virtualNodes) {
        this.virtualNodes = virtualNodes;
    }
    
    // 添加物理节点
    public void addNode(T node) {
        for (int i = 0; i < virtualNodes; i++) {
            int hash = hash(node.toString() + "#" + i);
            ring.put(hash, node);
        }
    }
    
    // 移除物理节点
    public void removeNode(T node) {
        for (int i = 0; i < virtualNodes; i++) {
            int hash = hash(node.toString() + "#" + i);
            ring.remove(hash);
        }
    }
    
    // 根据key获取对应的物理节点
    public T getNode(String key) {
        if (ring.isEmpty()) return null;
        int hash = hash(key);
        // 找到>=hash的第一个节点，如果没有则取环上的第一个节点
        Map.Entry<Integer, T> entry = ring.ceilingEntry(hash);
        if (entry == null) {
            entry = ring.firstEntry();  // 环形回绕
        }
        return entry.getValue();
    }
    
    private int hash(String key) {
        int h = key.hashCode();
        // 确保哈希值非负（TreeMap需要）
        return h & 0x7FFFFFFF;
    }
    
    public int size() {
        return ring.size();
    }
    
    public static void main(String[] args) {
        ConsistentHash<String> hash = new ConsistentHash<>(3);
        
        // 添加3个物理节点，每个有3个虚拟节点
        hash.addNode("server1");
        hash.addNode("server2");
        hash.addNode("server3");
        
        // 分配数据
        String[] keys = {"data1", "data2", "data3", "data4", "data5"};
        for (String key : keys) {
            System.out.println(key + " → " + hash.getNode(key));
        }
        
        // 移除一个节点，只有部分数据需要迁移
        System.out.println("\n移除 server2 后：");
        hash.removeNode("server2");
        for (String key : keys) {
            System.out.println(key + " → " + hash.getNode(key));
        }
        // 只有分配到server2的数据会迁移到其他节点
    }
}
```

### 使用场景

| 技术 | 应用场景 | 核心优势 |
|------|---------|---------|
| LRU缓存 | 本地缓存、数据库缓冲池 | O(1)淘汰 |
| 一致性哈希 | Redis集群、分布式缓存 | 最小数据迁移 |
| 哈希分片 | 数据库分库分表 | 水平扩展 |
| 布隆过滤器 | 缓存穿透防护、垃圾邮件过滤 | 极省空间 |

### 潜在风险与问题

- **LRU缓存污染**：全表扫描导致所有数据进入缓存，淘汰真正的热点数据
- **哈希偏斜**：哈希分布不均匀导致某些分片数据过多
- **虚拟节点开销**：虚拟节点太多增加内存和计算开销
- **热点Key**：某些Key访问频率极高，导致单个节点过载

### 优化策略

- **LRU + TTL**：结合过期时间防止缓存污染
- **一致性哈希 + 虚拟节点**：均匀分布数据
- **本地缓存 + 分布式缓存**：多级缓存策略
- **热key探测**：监控热点并做本地缓存

### 典型问题处理

**工程实践：设计一个本地缓存系统**

```java
// 实际项目中可以使用 Caffeine（高性能Java缓存库）
//
// Cache<String, Object> cache = Caffeine.newBuilder()
//     .maximumSize(10_000)        // 最大条目数
//     .expireAfterWrite(10, TimeUnit.MINUTES)  // 写入后过期
//     .recordStats()              // 记录统计信息
//     .build();
//
// Caffeine内部使用W-TinyLFU算法，比LRU更适合缓存场景
// W-TinyLFU = Window + TinyLFU，能够抵抗缓存污染
```

---

> **本章总结**：哈希表是数据结构中最重要的"空间换时间"方案，通过哈希函数实现O(1)的平均查找性能。哈希冲突不可避免，链地址法是最通用的解决方案。JDK 8之后的HashMap引入了红黑树优化，显著提高了最坏情况下的性能。在实际工程中，哈希表被广泛应用于缓存、索引、去重等场景。LRU缓存和一致性哈希是哈希表的高阶应用，在分布式系统中扮演着关键角色。