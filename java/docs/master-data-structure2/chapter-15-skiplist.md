# 第15章 跳表

## 15.1 跳表原理与实现

### 解决的问题

跳表（Skip List）解决了**有序链表的二分查找**问题。普通链表无法进行二分查找（O(n)），而跳表通过在链表上建立多级索引，实现了O(log n)的查找性能。

> **核心价值**：跳表是平衡树的一种概率替代方案，实现简单、性能优秀，被Redis等系统广泛使用。

### 实现原理

跳表的结构：
```
Level 3:   1 ─────────────────────────────→ 9
Level 2:   1 ───────────→ 5 ───────────→ 9
Level 1:   1 ───→ 3 ───→ 5 ───→ 7 ───→ 9
Level 0:   1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
```

**核心思想**：
1. 底层是一个完整的有序链表
2. 上层是下层的"快速通道"（每2个或N个节点提取一个到上层）
3. 查找时从上到下，先快速跳过大量元素，再精确定位

**索引层的构建**：插入时通过随机函数决定节点出现在哪些层级。通常每个节点有50%的概率进入上一级索引。

### 代码实现

```java
/**
 * 跳表实现
 */
public class SkipList<K extends Comparable<K>, V> {
    
    private static final int MAX_LEVEL = 32;
    private static final double P = 0.5;  // 晋升概率
    
    private Node<K, V> head;  // 头节点（不存数据）
    private int level;        // 当前最大层级
    private int size;
    private final Random random = new Random();
    
    static class Node<K, V> {
        K key;
        V value;
        Node<K, V>[] forward;  // 每层的前向指针
        
        @SuppressWarnings("unchecked")
        Node(K key, V value, int level) {
            this.key = key;
            this.value = value;
            this.forward = new Node[level];
        }
    }
    
    public SkipList() {
        head = new Node<>(null, null, MAX_LEVEL);
        level = 1;
        size = 0;
    }
    
    // 查找 —— O(log n)
    public V get(K key) {
        Node<K, V> current = head;
        
        // 从最高层开始查找
        for (int i = level - 1; i >= 0; i--) {
            while (current.forward[i] != null 
                   && current.forward[i].key.compareTo(key) < 0) {
                current = current.forward[i];
            }
        }
        
        // 到达底层，检查下一个节点
        current = current.forward[0];
        if (current != null && current.key.compareTo(key) == 0) {
            return current.value;
        }
        return null;
    }
    
    // 插入 —— O(log n)
    public void put(K key, V value) {
        // 记录每层需要更新的节点
        Node<K, V>[] update = new Node[MAX_LEVEL];
        Node<K, V> current = head;
        
        for (int i = level - 1; i >= 0; i--) {
            while (current.forward[i] != null 
                   && current.forward[i].key.compareTo(key) < 0) {
                current = current.forward[i];
            }
            update[i] = current;
        }
        
        current = current.forward[0];
        
        // 如果key已存在，更新value
        if (current != null && current.key.compareTo(key) == 0) {
            current.value = value;
            return;
        }
        
        // 随机确定层级
        int newLevel = randomLevel();
        if (newLevel > level) {
            for (int i = level; i < newLevel; i++) {
                update[i] = head;
            }
            level = newLevel;
        }
        
        // 创建新节点并插入各层
        Node<K, V> newNode = new Node<>(key, value, newLevel);
        for (int i = 0; i < newLevel; i++) {
            newNode.forward[i] = update[i].forward[i];
            update[i].forward[i] = newNode;
        }
        size++;
    }
    
    // 删除 —— O(log n)
    public boolean remove(K key) {
        Node<K, V>[] update = new Node[MAX_LEVEL];
        Node<K, V> current = head;
        
        for (int i = level - 1; i >= 0; i--) {
            while (current.forward[i] != null 
                   && current.forward[i].key.compareTo(key) < 0) {
                current = current.forward[i];
            }
            update[i] = current;
        }
        
        current = current.forward[0];
        if (current == null || current.key.compareTo(key) != 0) {
            return false;
        }
        
        // 从各层删除
        for (int i = 0; i < current.forward.length; i++) {
            update[i].forward[i] = current.forward[i];
        }
        
        // 更新当前最高层
        while (level > 1 && head.forward[level - 1] == null) {
            level--;
        }
        size--;
        return true;
    }
    
    // 随机层级生成
    private int randomLevel() {
        int lvl = 1;
        while (random.nextDouble() < P && lvl < MAX_LEVEL) {
            lvl++;
        }
        return lvl;
    }
    
    public int size() {
        return size;
    }
    
    public static void main(String[] args) {
        SkipList<Integer, String> skipList = new SkipList<>();
        skipList.put(3, "three");
        skipList.put(1, "one");
        skipList.put(5, "five");
        skipList.put(2, "two");
        skipList.put(4, "four");
        
        System.out.println("get(3): " + skipList.get(3));  // three
        System.out.println("get(6): " + skipList.get(6));  // null
        System.out.println("size: " + skipList.size());      // 5
        
        skipList.remove(3);
        System.out.println("after remove: " + skipList.size());  // 4
    }
}
```

### 使用场景

- **Redis的有序集合**：ZSET使用跳表实现
- **内存数据库**：LevelDB的MemTable
- **替代平衡树**：实现简单，性能接近红黑树

### 潜在风险与问题

- **最坏情况退化**：随机层级不理想时退化为链表O(n)
- **内存开销**：每个节点多层指针，空间消耗大于平衡树
- **不支持范围查询的优化**：不如B+树的叶节点链表高效

### 优化策略

- 使用更好的随机算法（如固定种子）
- 调整晋升概率P（P越小，索引层越少，查找慢但插入快）
- 结合指纹或布隆过滤器加速不存在元素的查找

### 典型问题处理

**面试题：跳表与红黑树的对比？**

- 实现难度：跳表更简单（不需要旋转）
- 性能：两者都是O(log n)
- 范围查询：跳表更优（底层链表遍历）
- 内存：红黑树稍优
- 并发：跳表更容易实现无锁并发

---

## 15.2 手写SkipList实现

### 跳表的并发思考

跳表的并发实现比红黑树简单得多。因为跳表只在局部修改指针，可以通过细粒度锁或CAS操作实现无锁并发。这是很多系统选择跳表而非红黑树的原因。

---

## 15.3 JDK源码解析（ConcurrentSkipListMap）

### 实现原理

ConcurrentSkipListMap是JDK提供的并发有序Map实现。它使用无锁跳表（基于CAS操作），支持高并发环境下的有序KV操作。

```java
// ConcurrentSkipListMap的特点：
// 1. 有序：基于key排序（Comparable或Comparator）
// 2. 并发：无锁实现，基于CAS
// 3. 性能：O(log n) 
// 4. 线程安全：比ConcurrentSkipListMap更高效（无锁 vs 分段锁）

// 使用场景：
// 需要有序的并发Map时选择ConcurrentSkipListMap
// 不需要有序时选择ConcurrentHashMap（性能更好）
```

---

## 15.4 使用场景与风险分析

### 典型问题处理

**面试题：为什么Redis使用跳表而非红黑树实现ZSET？**

1. 实现简单，易于维护
2. 范围查询高效（底层链表直接遍历）
3. 插入速度与红黑树相当
4. 概率平衡避免了复杂的旋转操作
5. 内存占用通过调整P来控制

---

> **本章总结**：跳表通过在有序链表上建立多层索引，实现了O(log n)的查找性能。它的实现比平衡树简单，且支持高效的范围查询。Redis的ZSET和JDK的ConcurrentSkipListMap都是跳表的工业级应用。概率平衡是跳表的核心——通过随机层级确保整体性能，最坏情况退化的概率极小。