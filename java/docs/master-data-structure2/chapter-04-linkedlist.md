# 第4章 链表

## 4.1 单链表、双链表、循环链表

### 解决的问题

链表解决了数组的两大痛点：**固定长度**和**插入删除开销大**。链表通过不连续的内存存储和指针连接，实现了O(1)的插入和删除（在已知位置时），但牺牲了随机访问能力。

> **核心价值**：当需要频繁增删数据且不依赖随机访问时，链表是首选。

### 实现原理

**链表的三种基本形态**：

**单链表（Singly Linked List）**：每个节点包含数据和指向下一个节点的指针。
```
节点结构：[data | next→] → [data | next→] → [data | next→null]
特点：只能从头到尾单向遍历
```

**双链表（Doubly Linked List）**：每个节点包含指向前一个和后一个节点的指针。
```
节点结构：[null←prev | data | next→] ↔ [←prev | data | next→] ↔ [←prev | data | null]
特点：可以双向遍历，但每个节点多一个指针的开销
```

**循环链表（Circular Linked List）**：尾节点的next指向头节点。
```
单循环：[data | next→] → [data | next→] → [data | next→] ──→ 回到头节点
双循环：[prev← | data | next→] ↔ [prev← | data | next→] ↔ [prev← | data | next→] ──→ 回到头
特点：可以从任何节点出发遍历整个链表
```

### 代码实现

```java
/**
 * 手写单链表实现
 */
public class SinglyLinkedList<E> {
    
    // 节点定义
    private static class Node<E> {
        E data;
        Node<E> next;
        
        Node(E data) {
            this.data = data;
        }
    }
    
    private Node<E> head;   // 头节点
    private Node<E> tail;   // 尾节点
    private int size;
    
    public SinglyLinkedList() {
        this.head = null;
        this.tail = null;
        this.size = 0;
    }
    
    // 尾部插入 —— O(1)
    public void addLast(E e) {
        Node<E> newNode = new Node<>(e);
        if (tail == null) {
            head = tail = newNode;
        } else {
            tail.next = newNode;
            tail = newNode;
        }
        size++;
    }
    
    // 头部插入 —— O(1)
    public void addFirst(E e) {
        Node<E> newNode = new Node<>(e);
        if (head == null) {
            head = tail = newNode;
        } else {
            newNode.next = head;
            head = newNode;
        }
        size++;
    }
    
    // 指定位置插入 —— O(1)找到位置 + O(1)插入 = O(n)
    public void add(int index, E e) {
        if (index < 0 || index > size) {
            throw new IndexOutOfBoundsException();
        }
        if (index == 0) {
            addFirst(e);
            return;
        }
        if (index == size) {
            addLast(e);
            return;
        }
        Node<E> prev = getNode(index - 1);
        Node<E> newNode = new Node<>(e);
        newNode.next = prev.next;
        prev.next = newNode;
        size++;
    }
    
    // 删除头部 —— O(1)
    public E removeFirst() {
        if (head == null) throw new NoSuchElementException();
        E data = head.data;
        head = head.next;
        if (head == null) tail = null;
        size--;
        return data;
    }
    
    // 删除指定位置 —— O(n)
    public E remove(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException();
        }
        if (index == 0) return removeFirst();
        
        Node<E> prev = getNode(index - 1);
        Node<E> target = prev.next;
        prev.next = target.next;
        if (target == tail) tail = prev;
        size--;
        return target.data;
    }
    
    // 查找 —— O(n)
    public E get(int index) {
        return getNode(index).data;
    }
    
    private Node<E> getNode(int index) {
        Node<E> current = head;
        for (int i = 0; i < index; i++) {
            current = current.next;
        }
        return current;
    }
    
    public int size() {
        return size;
    }
    
    public boolean isEmpty() {
        return size == 0;
    }
}
```

```java
/**
 * 双链表实现（核心操作）
 */
public class DoublyLinkedList<E> {
    
    private static class Node<E> {
        E data;
        Node<E> prev;
        Node<E> next;
        
        Node(Node<E> prev, E data, Node<E> next) {
            this.prev = prev;
            this.data = data;
            this.next = next;
        }
    }
    
    private Node<E> head;
    private Node<E> tail;
    private int size;
    
    public DoublyLinkedList() {
        head = new Node<>(null, null, null);   // dummy head
        tail = new Node<>(head, null, null);   // dummy tail
        head.next = tail;
    }
    
    // 利用dummy节点简化边界处理
    // 无论链表是否为空，head和tail都是固定的dummy节点
    
    // 尾部插入 —— O(1)
    public void addLast(E e) {
        Node<E> last = tail.prev;
        Node<E> newNode = new Node<>(last, e, tail);
        last.next = newNode;
        tail.prev = newNode;
        size++;
    }
    
    // 头部插入 —— O(1)
    public void addFirst(E e) {
        Node<E> first = head.next;
        Node<E> newNode = new Node<>(head, e, first);
        head.next = newNode;
        first.prev = newNode;
        size++;
    }
    
    // 删除尾部 —— O(1)
    public E removeLast() {
        if (size == 0) throw new NoSuchElementException();
        Node<E> node = tail.prev;
        Node<E> prev = node.prev;
        prev.next = tail;
        tail.prev = prev;
        size--;
        return node.data;
    }
    
    // 双向查找：根据index靠近头部还是尾部选择遍历方向
    public E get(int index) {
        Node<E> current;
        if (index < size / 2) {
            // 从头部开始遍历
            current = head.next;
            for (int i = 0; i < index; i++) {
                current = current.next;
            }
        } else {
            // 从尾部开始遍历
            current = tail.prev;
            for (int i = size - 1; i > index; i--) {
                current = current.prev;
            }
        }
        return current.data;
    }
}
```

```java
/**
 * 循环链表的典型应用：约瑟夫环问题
 */
public class JosephusProblem {
    
    private static class Node {
        int data;
        Node next;
        Node(int data) {
            this.data = data;
        }
    }
    
    // 约瑟夫环：n个人围成一圈，从第1个开始报数，数到m的人出列
    // 求最后剩下的人的编号
    public static int josephus(int n, int m) {
        // 构建循环链表
        Node head = new Node(1);
        Node prev = head;
        for (int i = 2; i <= n; i++) {
            prev.next = new Node(i);
            prev = prev.next;
        }
        prev.next = head;  // 形成循环
        
        Node current = head;
        Node pre = prev;   // 前驱节点
        
        while (current.next != current) {
            // 报数 m-1 次
            for (int count = 1; count < m; count++) {
                pre = current;
                current = current.next;
            }
            // 移除当前节点
            pre.next = current.next;
            current = pre.next;
        }
        return current.data;
    }
    
    public static void main(String[] args) {
        // n=7, m=3: 最后剩下的是4号
        System.out.println("最后剩下: " + josephus(7, 3));
    }
}
```

### 使用场景

| 场景 | 推荐类型 | 原因 |
|------|---------|------|
| 双向遍历 | 双链表 | prev指针支持反向遍历 |
| 约瑟夫环 | 循环链表 | 自然循环结构 |
| LRU缓存 | 双链表+哈希表 | 快速移动到头部、快速删除 |
| 任务队列 | 单链表 | 只需要尾部插入头部删除 |
| 斐波那契堆 | 循环双链表 | 合并和删除操作 |

### 潜在风险与问题

- **随机访问O(n)**：需要遍历，不适合查找频繁的场景
- **额外内存开销**：每个节点需要额外的指针内存
- **CPU缓存不友好**：内存不连续，遍历性能比数组差
- **指针错误**：空指针、循环引用等容易出错
- **边界处理**：空链表、单节点链表的操作需要特殊处理

### 优化策略

- **使用dummy节点**：统一空链表和非空链表的操作逻辑
- **双链表分段查找**：根据索引在链表中的位置选择遍历方向
- **跳表**：当链表数据量大且需要快速查找时，使用跳表替代
- **内存池**：在频繁创建删除节点的场景中，使用对象池复用节点

### 典型问题处理

**面试题：反转链表**

```java
// 迭代反转
public ListNode reverseList(ListNode head) {
    ListNode prev = null;
    ListNode curr = head;
    while (curr != null) {
        ListNode nextTemp = curr.next;
        curr.next = prev;
        prev = curr;
        curr = nextTemp;
    }
    return prev;
}

// 递归反转
public ListNode reverseListRecursive(ListNode head) {
    if (head == null || head.next == null) return head;
    ListNode newHead = reverseListRecursive(head.next);
    head.next.next = head;
    head.next = null;
    return newHead;
}
```

**面试题：判断链表是否有环**

```java
// 快慢指针（Floyd判圈算法）
public boolean hasCycle(ListNode head) {
    if (head == null || head.next == null) return false;
    ListNode slow = head;
    ListNode fast = head.next;
    while (slow != fast) {
        if (fast == null || fast.next == null) return false;
        slow = slow.next;
        fast = fast.next.next;
    }
    return true;
}
```

---

## 4.2 手写LinkedList实现

### 解决的问题

深入理解LinkedList的底层实现，是掌握链表的核心方法。通过手写，可以体会JDK源码中的设计选择和边界处理。

### 实现原理

LinkedList在JDK中是一个**双向链表**，同时实现了List和Deque接口，因此既可以作为List使用，也可以作为队列或双端队列使用。

```
LinkedList的核心字段：
- size: 元素个数
- first: 头节点（指向第一个元素）
- last: 尾节点（指向最后一个元素）
```

### 代码实现

```java
/**
 * 手写简化版LinkedList（双链表）
 */
public class MyLinkedList<E> implements Iterable<E> {
    
    private static class Node<E> {
        E item;
        Node<E> prev;
        Node<E> next;
        
        Node(Node<E> prev, E element, Node<E> next) {
            this.item = element;
            this.prev = prev;
            this.next = next;
        }
    }
    
    private int size;
    private Node<E> first;
    private Node<E> last;
    
    public MyLinkedList() {
        size = 0;
        first = last = null;
    }
    
    // ========== List接口实现 ==========
    
    // 尾部添加 —— O(1)
    public boolean add(E e) {
        linkLast(e);
        return true;
    }
    
    // 指定位置添加 —— O(n)
    public void add(int index, E element) {
        checkPositionIndex(index);
        if (index == size) {
            linkLast(element);
        } else {
            linkBefore(element, node(index));
        }
    }
    
    // 获取 —— O(n)
    public E get(int index) {
        checkElementIndex(index);
        return node(index).item;
    }
    
    // 设置 —— O(n)
    public E set(int index, E element) {
        checkElementIndex(index);
        Node<E> x = node(index);
        E oldVal = x.item;
        x.item = element;
        return oldVal;
    }
    
    // 删除指定位置 —— O(n)
    public E remove(int index) {
        checkElementIndex(index);
        return unlink(node(index));
    }
    
    // 删除对象 —— O(n)
    public boolean remove(Object o) {
        if (o == null) {
            for (Node<E> x = first; x != null; x = x.next) {
                if (x.item == null) {
                    unlink(x);
                    return true;
                }
            }
        } else {
            for (Node<E> x = first; x != null; x = x.next) {
                if (o.equals(x.item)) {
                    unlink(x);
                    return true;
                }
            }
        }
        return false;
    }
    
    // 包含 —— O(n)
    public boolean contains(Object o) {
        return indexOf(o) >= 0;
    }
    
    // 查找索引 —— O(n)
    public int indexOf(Object o) {
        int index = 0;
        if (o == null) {
            for (Node<E> x = first; x != null; x = x.next) {
                if (x.item == null) return index;
                index++;
            }
        } else {
            for (Node<E> x = first; x != null; x = x.next) {
                if (o.equals(x.item)) return index;
                index++;
            }
        }
        return -1;
    }
    
    public int size() {
        return size;
    }
    
    public boolean isEmpty() {
        return size == 0;
    }
    
    // ========== Deque接口实现 ==========
    
    // 头部添加 —— O(1)
    public void addFirst(E e) {
        linkFirst(e);
    }
    
    // 尾部添加 —— O(1)
    public void addLast(E e) {
        linkLast(e);
    }
    
    // 获取头部 —— O(1)
    public E getFirst() {
        if (first == null) throw new NoSuchElementException();
        return first.item;
    }
    
    // 获取尾部 —— O(1)
    public E getLast() {
        if (last == null) throw new NoSuchElementException();
        return last.item;
    }
    
    // 删除头部 —— O(1)
    public E removeFirst() {
        if (first == null) throw new NoSuchElementException();
        return unlinkFirst();
    }
    
    // 删除尾部 —— O(1)
    public E removeLast() {
        if (last == null) throw new NoSuchElementException();
        return unlinkLast();
    }
    
    // ========== 内部链接/取消链接操作 ==========
    
    // 链接到头部
    private void linkFirst(E e) {
        Node<E> f = first;
        Node<E> newNode = new Node<>(null, e, f);
        first = newNode;
        if (f == null) {
            last = newNode;
        } else {
            f.prev = newNode;
        }
        size++;
    }
    
    // 链接到尾部
    private void linkLast(E e) {
        Node<E> l = last;
        Node<E> newNode = new Node<>(l, e, null);
        last = newNode;
        if (l == null) {
            first = newNode;
        } else {
            l.next = newNode;
        }
        size++;
    }
    
    // 在指定节点前插入
    private void linkBefore(E e, Node<E> succ) {
        Node<E> pred = succ.prev;
        Node<E> newNode = new Node<>(pred, e, succ);
        succ.prev = newNode;
        if (pred == null) {
            first = newNode;
        } else {
            pred.next = newNode;
        }
        size++;
    }
    
    // 取消链接（删除节点）
    private E unlink(Node<E> x) {
        E element = x.item;
        Node<E> next = x.next;
        Node<E> prev = x.prev;
        
        if (prev == null) {
            first = next;
        } else {
            prev.next = next;
            x.prev = null;
        }
        
        if (next == null) {
            last = prev;
        } else {
            next.prev = prev;
            x.next = null;
        }
        
        x.item = null;
        size--;
        return element;
    }
    
    private E unlinkFirst() {
        Node<E> f = first;
        E element = f.item;
        Node<E> next = f.next;
        f.item = null;
        f.next = null;
        first = next;
        if (next == null) {
            last = null;
        } else {
            next.prev = null;
        }
        size--;
        return element;
    }
    
    private E unlinkLast() {
        Node<E> l = last;
        E element = l.item;
        Node<E> prev = l.prev;
        l.item = null;
        l.prev = null;
        last = prev;
        if (prev == null) {
            first = null;
        } else {
            prev.next = null;
        }
        size--;
        return element;
    }
    
    // 根据索引查找节点（优化：二分查找方向）
    private Node<E> node(int index) {
        if (index < (size >> 1)) {
            Node<E> x = first;
            for (int i = 0; i < index; i++) {
                x = x.next;
            }
            return x;
        } else {
            Node<E> x = last;
            for (int i = size - 1; i > index; i--) {
                x = x.prev;
            }
            return x;
        }
    }
    
    private void checkElementIndex(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        }
    }
    
    private void checkPositionIndex(int index) {
        if (index < 0 || index > size) {
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        }
    }
    
    // 迭代器
    @Override
    public Iterator<E> iterator() {
        return new ListItr(0);
    }
    
    private class ListItr implements Iterator<E> {
        private Node<E> lastReturned;
        private Node<E> next;
        private int nextIndex;
        
        ListItr(int index) {
            next = (index == size) ? null : node(index);
            nextIndex = index;
        }
        
        public boolean hasNext() {
            return nextIndex < size;
        }
        
        public E next() {
            if (!hasNext()) throw new NoSuchElementException();
            lastReturned = next;
            next = next.next;
            nextIndex++;
            return lastReturned.item;
        }
    }
}
```

### 使用场景

- **高性能队列**：利用双链表的首尾O(1)操作
- **实现LRU缓存**：结合HashMap，O(1)访问和O(1)淘汰
- **实现Deque**：双端队列的首尾操作都是O(1)
- **编辑器操作**：文档的插入删除操作频繁

### 潜在风险与问题

- **内存消耗大**：每个节点存储数据和两个指针，比ArrayList多3倍以上内存
- **遍历效率低**：CPU缓存不友好，遍历100万元素，LinkedList比ArrayList慢10倍
- **随机访问慢**：get(n)需要从头或尾遍历
- **节点对象开销**：每个Node是一个独立对象，GC压力大

### 优化策略

- 遍历时使用迭代器而非get(index)（get(index)会从头遍历）
- 在对首尾操作频繁的场景中优先考虑
- 避免在LinkedList上使用随机访问模式
- 大量数据考虑使用ArrayDeque替代（做队列/栈时）

### 典型问题处理

**面试题：为什么LinkedList做队列时首选ArrayDeque而不是LinkedList？**

ArrayDeque底层用循环数组实现，内存连续，CPU缓存友好，而且不需要存储额外的指针，内存效率更高。作为队列使用时，ArrayDeque的性能普遍优于LinkedList。

---

## 4.3 JDK源码解析（LinkedList）

### 解决的问题

JDK中的LinkedList是工业级的双链表实现。解析其源码可以学习工业级链表的以下要点：fail-fast迭代器、序列化优化、Deque接口的实现技巧。

> **核心价值**：通过源码理解真实世界的链表是如何设计和优化的。

### 实现原理

JDK LinkedList 的核心设计：

```
LinkedList<E>
├── 底层：双向链表
├── 字段：size, first, last（没有dummy节点！）
├── 特性：List + Deque 双接口
├── 迭代器：fail-fast（modCount机制）
└── 序列化：transient nodes，自定义序列化
```

**为什么不使用dummy节点？**
- JDK设计者认为dummy节点增加了额外的内存开销
- 不使用dummy，通过null检查来处理边界
- 代价是代码中多了很多null判断

**fail-fast机制**：
```java
// LinkedList继承自AbstractList，有modCount字段
// 迭代器在创建时记录expectedModCount = modCount
// 每次迭代操作（next/remove）都会检查
// 如果发现modCount != expectedModCount，抛出ConcurrentModificationException
// 这是"尽力而为"的并发检测，不能保证100%发现
```

### 代码实现

```java
/**
 * JDK LinkedList 源码关键点解析
 */
public class LinkedListSourceAnalysis {
    
    /**
     * ========== 1. 节点定义 ==========
     * private static class Node<E> {
     *     E item;       // 数据
     *     Node<E> next; // 后驱指针
     *     Node<E> prev; // 前驱指针
     *
     *     Node(Node<E> prev, E element, Node<E> next) {
     *         this.item = element;
     *         this.next = next;
     *         this.prev = prev;
     *     }
     * }
     *
     * 注意：JDK的Node是private static class
     * - static：不持有外部类的引用，避免内存泄漏
     * - private：不对用户暴露实现细节
     */
    
    /**
     * ========== 2. 双端操作（Deque） ==========
     * 
     * LinkedList同时实现了List和Deque接口：
     * - 作为List：add(int, E), get(int), remove(int)
     * - 作为Deque：addFirst, addLast, offer, poll, peek
     * - 作为Queue：offer(E), poll(), peek()
     * - 作为Stack：push(E), pop()
     *
     * 所以LinkedList可以当做队列、栈、双端队列来使用！
     */
    
    /**
     * ========== 3. 序列化优化 ==========
     *
     * 链表的节点之间通过指针连接，序列化时不需要序列化指针。
     * JDK LinkedList 自定义了序列化：
     *
     * private void writeObject(ObjectOutputStream s) throws IOException {
     *     s.defaultWriteObject();        // 写入size和modCount
     *     s.writeInt(size);               // 写入元素个数
     *     for (Node<E> x = first; x != null; x = x.next) {
     *         s.writeObject(x.item);      // 只写入数据，不写入指针
     *     }
     * }
     *
     * private void readObject(ObjectInputStream s) throws IOException, ClassNotFoundException {
     *     s.defaultReadObject();          // 读取非transient字段
     *     int size = s.readInt();         // 读取元素个数
     *     for (int i = 0; i < size; i++) {
     *         linkLast((E)s.readObject());// 逐个重建链表
     *     }
     * }
     *
     * 好处：
     * - 序列化结果更紧凑（不包含指针）
     * - 反序列化时重新建立节点连接
     * - 避免了序列化循环引用
     */
    
    /**
     * ========== 4. 批量操作 ==========
     *
     * addAll(int index, Collection<? extends E> c):
     * 1. 将集合c转为数组（toArray()）
     * 2. 找到插入位置的前驱和后继节点
     * 3. 将数组中的元素逐个创建节点并链接
     *
     * 批量操作比逐个add()快，因为：
     * - 只遍历一次找到插入位置
     * - 减少了方法调用次数
     * - 减少了modCount的增量次数
     */
    
    /**
     * ========== 5. 性能对比 ==========
     */
    public static void main(String[] args) {
        int dataSize = 100_000;
        
        // 测试1：遍历性能（迭代器 vs get(index)）
        List<Integer> linkedList = new LinkedList<>();
        for (int i = 0; i < dataSize; i++) {
            linkedList.add(i);
        }
        
        // ❌ 错误遍历方式：get(index) —— O(n²)
        long start1 = System.nanoTime();
        int sum1 = 0;
        for (int i = 0; i < linkedList.size(); i++) {
            sum1 += linkedList.get(i);  // 每次从头部遍历！O(n²)
        }
        long end1 = System.nanoTime();
        System.out.println("get(index)遍历: " + (end1 - start1) / 1_000_000 + "ms");
        
        // ✅ 正确遍历方式：迭代器 —— O(n)
        long start2 = System.nanoTime();
        int sum2 = 0;
        for (Integer val : linkedList) {  // 使用迭代器
            sum2 += val;
        }
        long end2 = System.nanoTime();
        System.out.println("迭代器遍历: " + (end2 - start2) / 1_000_000 + "ms");
        // 迭代器比get(index)快几百到几千倍！
        
        // 测试2：ArrayList vs LinkedList 头部插入
        List<Integer> arrayList = new ArrayList<>();
        long start3 = System.nanoTime();
        for (int i = 0; i < dataSize; i++) {
            arrayList.add(0, i);  // ArrayList头部插入 O(n²)
        }
        long end3 = System.nanoTime();
        System.out.println("ArrayList头部插入: " + (end3 - start3) / 1_000_000 + "ms");
        
        List<Integer> linkedList2 = new LinkedList<>();
        long start4 = System.nanoTime();
        for (int i = 0; i < dataSize; i++) {
            linkedList2.add(0, i);  // LinkedList头部插入 O(n)
        }
        long end4 = System.nanoTime();
        System.out.println("LinkedList头部插入: " + (end4 - start4) / 1_000_000 + "ms");
    }
}
```

### 使用场景

- **实现队列/栈/双端队列**：LinkedList实现了Deque接口
- **频繁首尾操作**：addFirst/addLast/removeFirst/removeLast都是O(1)
- **需要List和Deque双重语义**：同一实例在不同场景下扮演不同角色
- **中间插入删除频繁**：已知位置时插入删除O(1)

### 潜在风险与问题

- **遍历性能远低于ArrayList**：由于内存不连续，无法利用CPU缓存
- **get(index)是最糟糕的操作**：O(n) + 常数因子大
- **内存开销巨大**：每个元素额外两个指针（16字节） + Node对象头（12-16字节）
- **对GC不友好**：节点分散在堆中，GC扫描时间长

### 优化策略

- 使用迭代器遍历，绝对不要使用get(index)
- 做队列/栈时使用ArrayDeque替代LinkedList
- 在随机访问频繁的场景使用ArrayList
- 批量操作使用addAll()而非逐个add()

### 典型问题处理

**面试题：LinkedList和ArrayList的对比**

| 维度 | ArrayList | LinkedList |
|------|-----------|-----------|
| 底层实现 | 动态数组 | 双向链表 |
| 随机访问 | O(1) | O(n) |
| 尾部插入 | O(1)摊销 | O(1) |
| 头部插入 | O(n) | O(1) |
| 内存占用 | 较小（只需存数据） | 大（数据和指针） |
| CPU缓存 | 友好 | 不友好 |
| 适用场景 | 随机访问、尾部操作 | 首部操作、队列/栈 |

---

## 4.4 使用场景与风险分析

### 解决的问题

链表的实际工程应用非常广泛，但很多开发者对它的使用场景不够清晰，导致选型错误。

### 实现原理

**链表在真实系统中的应用**：

```
链表工程应用
├── 操作系统
│   ├── 进程调度队列
│   └── 内存管理（空闲块链表）
├── 数据库
│   ├── 事务日志（redo log）
│   └── 缓存淘汰策略（LRU链表）
├── Java框架
│   ├── LinkedHashMap（双向链表维护顺序）
│   ├── AQS队列（CLH锁队列）
│   └── Tomcat NIO（事件队列）
└── 算法实现
    ├── LRU缓存
    ├── 一致性哈希
    └── 大数运算
```

### 代码实现

```java
/**
 * 链表实战：实现LRU缓存（LinkedHashMap方式）
 */
public class LRUCache<K, V> extends LinkedHashMap<K, V> {
    
    private final int maxCapacity;
    
    public LRUCache(int maxCapacity) {
        // accessOrder=true：按照访问顺序排序
        super(16, 0.75f, true);
        this.maxCapacity = maxCapacity;
    }
    
    // 当元素个数超过最大容量时，删除最久未访问的元素
    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > maxCapacity;
    }
    
    // 使用示例
    public static void main(String[] args) {
        LRUCache<Integer, String> cache = new LRUCache<>(3);
        cache.put(1, "A");
        cache.put(2, "B");
        cache.put(3, "C");
        System.out.println(cache); // {1=A, 2=B, 3=C}
        
        cache.get(1);  // 访问1，1被移到末尾
        cache.put(4, "D");  // 超出容量，删除最久未访问的2
        System.out.println(cache); // {3=C, 1=A, 4=D}
    }
}
```

```java
/**
 * 手写LRU缓存（HashMap + 双链表）
 */
public class LRUCacheManual<K, V> {
    
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
    
    public LRUCacheManual(int capacity) {
        this.capacity = capacity;
        this.map = new HashMap<>(capacity);
        this.head = new Node<>(null, null);
        this.tail = new Node<>(null, null);
        head.next = tail;
        tail.prev = head;
    }
    
    public V get(K key) {
        Node<K, V> node = map.get(key);
        if (node == null) return null;
        moveToHead(node);  // 访问后移到头部（最近使用）
        return node.value;
    }
    
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
}
```

### 使用场景

- **LRU缓存**：LinkedList + HashMap 实现
- **消息队列**：需要频繁在首尾操作
- **大数计算**：用链表表示大整数，方便进位
- **多项式计算**：稀疏多项式的存储和运算
- **内存管理**：操作系统的空闲内存块管理

### 潜在风险与问题

- **内存碎片**：节点分散在堆中，增加GC压力
- **不合适的数据量**：几十个元素时不需要链表，ArrayList更好
- **错误的遍历方式**：使用get(index)遍历是致命错误
- **并发问题**：LinkedList不是线程安全的

### 优化策略

- **评估数据量**：小数据量使用ArrayList，大数据量且首尾操作频繁使用LinkedList
- **遍历方式**：强制使用迭代器
- **容量预估**：LinkedList不需要预分配，这是它的优势
- **替代方案**：ArrayDeque、ConcurrentLinkedDeque等

### 典型问题处理

**工程实践：什么时候绝对不能用LinkedList？**

- 需要随机访问（get/set）的场景
- 需要频繁遍历的场景（遍历性能比ArrayList差10倍）
- 内存极其受限的场景
- 大量节点创建删除的场景（GC压力大）

---

## 4.5 性能优化技巧

### 解决的问题

链表的性能瓶颈主要在于节点分散导致CPU缓存不友好，以及节点对象的GC压力。本节介绍一些针对性的优化技巧。

### 实现原理

**链表优化的主要方向**：

1. **内存局部性**：尽量让节点在内存中连续
2. **节点复用**：减少节点创建和销毁
3. **遍历优化**：避免寻址开销
4. **批量操作**：减少操作次数

### 代码实现

```java
/**
 * 链表性能优化技巧
 */
public class LinkedListOptimization {
    
    // ========== 1. 使用自定义内存池复用节点 ==========
    static class PooledLinkedList<E> {
        
        private static class Node<E> {
            E data;
            Node<E> next;
            
            void reset() {
                data = null;
                next = null;
            }
        }
        
        private final Queue<Node<E>> nodePool = new ArrayDeque<>();
        private Node<E> head;
        private Node<E> tail;
        private int size;
        
        public void add(E e) {
            Node<E> node = allocateNode(e);
            if (tail == null) {
                head = tail = node;
            } else {
                tail.next = node;
                tail = node;
            }
            size++;
        }
        
        public E removeFirst() {
            if (head == null) return null;
            E data = head.data;
            Node<E> oldHead = head;
            head = head.next;
            if (head == null) tail = null;
            // 回收节点
            oldHead.reset();
            nodePool.offer(oldHead);
            size--;
            return data;
        }
        
        private Node<E> allocateNode(E data) {
            Node<E> node = nodePool.poll();
            if (node == null) {
                node = new Node<>();
            }
            node.data = data;
            return node;
        }
    }
    
    // ========== 2. 使用ArrayDeque替代LinkedList做队列/栈 ==========
    public void useArrayDequeInstead() {
        // ✅ 做栈（性能优于LinkedList）
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(1);
        stack.push(2);
        stack.pop();  // 2
        
        // ✅ 做队列（性能优于LinkedList）
        Queue<Integer> queue = new ArrayDeque<>();
        queue.offer(1);
        queue.offer(2);
        queue.poll();  // 1
        
        // ArrayDeque优点：
        // - 底层是循环数组，内存连续
        // - 不需要存储指针，内存效率高
        // - CPU缓存友好
    }
    
    // ========== 3. 使用ConcurrentLinkedDeque处理并发场景 ==========
    public void concurrentLinkedList() {
        // 多线程场景使用并发链表
        Deque<String> deque = new ConcurrentLinkedDeque<>();
        
        // 或者使用阻塞队列（生产者-消费者模式）
        BlockingQueue<String> queue = new LinkedBlockingQueue<>();
        
        // 注意：不要对并发链表做size()操作
        // ConcurrentLinkedDeque.size() 是O(n)的！
    }
}
```

### 使用场景

- **高频节点创建/删除**：使用对象池复用节点
- **队列/栈操作**：使用ArrayDeque替代LinkedList
- **多线程环境**：使用并发链表

### 潜在风险与问题

- 对象池增加代码复杂度
- 对象池大小管理不当会内存泄漏
- 并发链表的迭代器是弱一致性的（不保证看到所有修改）

### 优化策略

- 首选ArrayDeque替代LinkedList做队列/栈
- 使用LinkedBlockingQueue替代手写阻塞队列
- 使用ConcurrentLinkedDeque替代加锁的双链表
- 使用不可变链表（Immutable List）在函数式编程中

### 典型问题处理

**工程实践：链表在JDK源码中的应用**

- **LinkedHashMap**：维护插入/访问顺序
- **LinkedHashSet**：基于LinkedHashMap
- **AQS（AbstractQueuedSynchronizer）**：CLH锁队列（双链表）
- **线程池**：工作队列使用BlockingQueue
- **ConcurrentLinkedQueue**：无锁链表实现

---

> **本章总结**：链表通过非连续存储和指针连接，实现了O(1)的首尾操作。单链表、双链表、循环链表各有适用场景。在JDK中，LinkedList同时扮演List和Deque的角色，但遍历性能和内存效率不如ArrayList和ArrayDeque。在实际工程中，链表的LRU缓存应用广泛，但需要正确评估使用场景，避免在不适合的场合使用链表。