# 第6章 队列

## 6.1 队列的原理与实现

### 解决的问题

队列（Queue）是一种**先进先出（FIFO, First In First Out）** 的数据结构。它的核心价值在于：**缓冲和解耦**——当数据的生产速度和消费速度不一致时，队列是天然的缓冲层。

> **核心价值**：队列是解耦生产者和消费者的标准方案，是并发编程和系统架构中的核心组件。

### 实现原理

队列的核心操作：

```
队列（FIFO结构）
├── offer(e)   —— 入队：将元素放入队尾
├── poll()     —— 出队：移除并返回队首元素
├── peek()     —— 查看队首（不移除）
├── isEmpty()  —— 判断是否为空
└── size()     —— 返回队列大小

操作示意图：
offer(1) → [1]
offer(2) → [1, 2]
offer(3) → [1, 2, 3]
poll()   → 返回1，队列变为 [2, 3]
peek()   → 返回2，队列不变 [2, 3]
```

**队列的几种底层实现**：

| 实现方式 | 入队 | 出队 | 特点 |
|---------|------|------|------|
| 链表队列 | O(1) | O(1) | 无限容量 |
| 循环数组 | O(1) | O(1) | 内存连续，有限容量 |
| 双栈队列 | O(1) | 摊还O(1) | 两个栈模拟 |

### 代码实现

```java
/**
 * 基于链表的队列实现
 */
public class LinkedQueue<E> {
    
    private static class Node<E> {
        E data;
        Node<E> next;
        Node(E data) {
            this.data = data;
        }
    }
    
    private Node<E> head;  // 队首
    private Node<E> tail;  // 队尾
    private int size;
    
    public LinkedQueue() {
        this.head = null;
        this.tail = null;
        this.size = 0;
    }
    
    // 入队 —— O(1)
    public boolean offer(E e) {
        Node<E> newNode = new Node<>(e);
        if (tail == null) {
            head = tail = newNode;
        } else {
            tail.next = newNode;
            tail = newNode;
        }
        size++;
        return true;
    }
    
    // 出队 —— O(1)
    public E poll() {
        if (head == null) return null;
        E data = head.data;
        head = head.next;
        if (head == null) tail = null;
        size--;
        return data;
    }
    
    // 查看队首 —— O(1)
    public E peek() {
        return head == null ? null : head.data;
    }
    
    public boolean isEmpty() {
        return size == 0;
    }
    
    public int size() {
        return size;
    }
}
```

```java
/**
 * 基于循环数组的队列
 */
public class CircularQueue<E> {
    private Object[] elements;
    private int head;  // 队首索引
    private int tail;  // 队尾索引（下一个可插入位置）
    private int size;
    
    public CircularQueue(int capacity) {
        // 保证容量为2的幂，便于使用位运算
        int actualCapacity = 1;
        while (actualCapacity < capacity) {
            actualCapacity <<= 1;
        }
        elements = new Object[actualCapacity];
        head = tail = 0;
        size = 0;
    }
    
    // 入队 —— O(1)
    public boolean offer(E e) {
        if (size == elements.length) {
            return false;  // 队列已满
        }
        elements[tail] = e;
        tail = (tail + 1) & (elements.length - 1);
        size++;
        return true;
    }
    
    // 出队 —— O(1)
    @SuppressWarnings("unchecked")
    public E poll() {
        if (size == 0) return null;
        E result = (E) elements[head];
        elements[head] = null;
        head = (head + 1) & (elements.length - 1);
        size--;
        return result;
    }
    
    // 查看队首 —— O(1)
    @SuppressWarnings("unchecked")
    public E peek() {
        return size == 0 ? null : (E) elements[head];
    }
    
    public boolean isEmpty() {
        return size == 0;
    }
    
    public boolean isFull() {
        return size == elements.length;
    }
    
    public int size() {
        return size;
    }
}
```

### 使用场景

- **任务调度**：线程池的工作队列
- **消息中间件**：Kafka、RocketMQ的队列模型
- **缓冲区**：IO操作的缓冲区
- **广度优先遍历**：树的层序遍历、图的BFS
- **生产者-消费者**：解耦生产者和消费者

### 潜在风险与问题

- **空队列操作**：poll()和peek()在队列为空时返回null
- **有界队列满**：offer()在队列满时返回false
- **线程安全**：普通队列不是线程安全的
- **内存泄漏**：出队后元素引用未清除

### 优化策略

- 使用ArrayDeque作为非线程安全的队列实现
- 使用LinkedBlockingQueue作为有界阻塞队列
- 使用ConcurrentLinkedQueue作为无锁并发队列
- 批量操作使用addAll()或drainTo()

### 典型问题处理

**面试题：用两个栈实现一个队列**

```java
class QueueByTwoStacks<E> {
    private Deque<E> inStack = new ArrayDeque<>();   // 入队栈
    private Deque<E> outStack = new ArrayDeque<>();  // 出队栈
    
    public void offer(E e) {
        inStack.push(e);  // 入队：压入inStack
    }
    
    public E poll() {
        if (outStack.isEmpty()) {
            // 将inStack全部弹出到outStack
            while (!inStack.isEmpty()) {
                outStack.push(inStack.pop());
            }
        }
        return outStack.isEmpty() ? null : outStack.pop();
    }
    
    // 摊销分析：每个元素最多入栈2次、出栈2次，摊销O(1)
}
```

---

## 6.2 循环队列、双端队列、阻塞队列

### 解决的问题

队列在工程中有多种变体，每种解决特定的问题。循环队列解决数组空间的浪费，双端队列提供两端操作的能力，阻塞队列解决多线程下的协调问题。

> **核心价值**：不同的队列变体适应不同的工程场景，理解它们的设计是架构能力的体现。

### 实现原理

**循环队列（Circular Queue）**：
```
传统数组队列：出队后前面的空间浪费
[_, _, _, 4, 5, 6]  ← 前3个位置空着但无法使用

循环队列：head和tail循环移动，充分利用空间
索引: [6] [7] [0] [1] [2] [3] [4] [5]
      tail ↑              ↑ head
```

**双端队列（Deque）**：两端都可以插入和删除。

**阻塞队列（BlockingQueue）**：在队列为空时自动阻塞消费者，在队列满时自动阻塞生产者。

### 代码实现

```java
/**
 * 循环队列（绕环复用空间）
 */
public class CircularBuffer<E> {
    private final Object[] buffer;
    private int head;
    private int tail;
    private int count;
    
    public CircularBuffer(int capacity) {
        this.buffer = new Object[capacity];
        this.head = 0;
        this.tail = 0;
        this.count = 0;
    }
    
    public boolean offer(E e) {
        if (count == buffer.length) return false;
        buffer[tail] = e;
        tail = (tail + 1) % buffer.length;
        count++;
        return true;
    }
    
    @SuppressWarnings("unchecked")
    public E poll() {
        if (count == 0) return null;
        E result = (E) buffer[head];
        buffer[head] = null;
        head = (head + 1) % buffer.length;
        count--;
        return result;
    }
    
    public int capacity() {
        return buffer.length;
    }
    
    public int size() {
        return count;
    }
    
    public boolean isEmpty() {
        return count == 0;
    }
    
    public boolean isFull() {
        return count == buffer.length;
    }
}
```

```java
/**
 * 双端队列（Deque）实现
 */
public class SimpleDeque<E> {
    private static final int DEFAULT_CAPACITY = 16;
    private Object[] elements;
    private int head;
    private int tail;
    private int size;
    
    public SimpleDeque() {
        elements = new Object[DEFAULT_CAPACITY];
        head = tail = 0;
        size = 0;
    }
    
    // 头部插入 —— O(1)
    public void addFirst(E e) {
        if (size == elements.length) grow();
        head = (head - 1) & (elements.length - 1);
        elements[head] = e;
        size++;
    }
    
    // 尾部插入 —— O(1)
    public void addLast(E e) {
        if (size == elements.length) grow();
        elements[tail] = e;
        tail = (tail + 1) & (elements.length - 1);
        size++;
    }
    
    // 头部删除 —— O(1)
    @SuppressWarnings("unchecked")
    public E removeFirst() {
        if (size == 0) throw new NoSuchElementException();
        E result = (E) elements[head];
        elements[head] = null;
        head = (head + 1) & (elements.length - 1);
        size--;
        return result;
    }
    
    // 尾部删除 —— O(1)
    @SuppressWarnings("unchecked")
    public E removeLast() {
        if (size == 0) throw new NoSuchElementException();
        tail = (tail - 1) & (elements.length - 1);
        E result = (E) elements[tail];
        elements[tail] = null;
        size--;
        return result;
    }
    
    private void grow() {
        int newCapacity = elements.length << 1;
        Object[] newElements = new Object[newCapacity];
        // 复制head到末尾的元素
        int r = elements.length - head;
        System.arraycopy(elements, head, newElements, 0, r);
        // 复制开头到head的元素
        System.arraycopy(elements, 0, newElements, r, head);
        elements = newElements;
        head = 0;
        tail = size;
    }
}
```

```java
/**
 * 阻塞队列（简化版，使用synchronized）
 */
class SimpleBlockingQueue<E> {
    private final Object[] queue;
    private int head;
    private int tail;
    private int count;
    
    public SimpleBlockingQueue(int capacity) {
        this.queue = new Object[capacity];
    }
    
    public synchronized void put(E e) throws InterruptedException {
        while (count == queue.length) {
            wait();  // 队列满，等待消费者消费
        }
        queue[tail] = e;
        tail = (tail + 1) % queue.length;
        count++;
        notifyAll();  // 通知等待的消费者
    }
    
    @SuppressWarnings("unchecked")
    public synchronized E take() throws InterruptedException {
        while (count == 0) {
            wait();  // 队列空，等待生产者生产
        }
        E result = (E) queue[head];
        queue[head] = null;
        head = (head + 1) % queue.length;
        count--;
        notifyAll();  // 通知等待的生产者
        return result;
    }
    
    public synchronized int size() {
        return count;
    }
}
```

### 使用场景

| 队列类型 | 适用场景 | 实例 |
|---------|---------|------|
| 普通队列 | FIFO场景 | 打印机队列 |
| 循环队列 | 固定大小缓冲区 | 环形日志缓冲区 |
| 双端队列 | 两端操作 | 工作窃取（Work-Stealing） |
| 阻塞队列 | 生产者-消费者 | 线程池工作队列 |
| 优先队列 | 按优先级处理 | 任务调度 |

### 潜在风险与问题

- **有界队列满**：不处理会导致生产者阻塞或数据丢失
- **无界队列膨胀**：生产速度远大于消费速度时OOM
- **虚假唤醒**：wait()可能被意外唤醒，需要while循环检查条件
- **锁竞争**：高并发下锁成为瓶颈

### 优化策略

- 使用Java标准库的BlockingQueue（LinkedBlockingQueue、ArrayBlockingQueue）
- 使用Disruptor（高性能无锁环形队列）应对超高吞吐
- 使用 transferQueue 在需要确认消费的场景
- 合理设置队列容量，避免OOM

### 典型问题处理

**工程实践：线程池的队列策略**

```java
// Executors.newFixedThreadPool(n)
// 使用 LinkedBlockingQueue（无界队列）
// 风险：任务堆积可能导致OOM

// Executors.newCachedThreadPool()
// 使用 SynchronousQueue（直接交接）
// 特点：不存储任务，直接交给线程

// 自定义线程池推荐：
new ThreadPoolExecutor(
    corePoolSize, maximumPoolSize,
    keepAliveTime, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(queueSize),  // 有界队列
    new ThreadPoolExecutor.CallerRunsPolicy()  // 拒绝策略
);
```

---

## 6.3 JDK源码解析（Queue系列）

### 解决的问题

JDK提供了丰富的队列实现，从简单的LinkedList到复杂的并发队列。理解这些实现的原理和适用场景，是正确选型的保障。

> **核心价值**：掌握JDK队列家族的源码设计，能够在不同场景下选对队列实现。

### 实现原理

```
JDK Queue 家族树

Queue（接口）
├── LinkedList（双链表，无限容量）
├── PriorityQueue（二叉堆，优先级排序）
├── ArrayDeque（循环数组，高性能）
│
├── BlockingQueue（阻塞队列接口）
│   ├── ArrayBlockingQueue（有界，数组，一把锁）
│   ├── LinkedBlockingQueue（可选有界，链表，两把锁）
│   ├── PriorityBlockingQueue（无界，优先级）
│   ├── SynchronousQueue（0容量，直接交接）
│   ├── LinkedTransferQueue（无界，支持异步）
│   └── DelayQueue（延迟执行）
│
└── Deque（双端队列接口）
    ├── LinkedList
    ├── ArrayDeque
    └── ConcurrentLinkedDeque（无锁并发）
```

### 代码实现

```java
/**
 * JDK Queue源码解析
 */
public class QueueSourceAnalysis {
    
    /**
     * ========== 1. LinkedList作为队列 ==========
     * 
     * LinkedList.offer(e) = addLast(e) —— 尾部入队 O(1)
     * LinkedList.poll() = removeFirst() —— 头部出队 O(1)
     * LinkedList.peek() = getFirst() —— 查看队首 O(1)
     */
    
    /**
     * ========== 2. ArrayDeque源码关键点 ==========
     *
     * 容量总是2的幂：确保 (head-1) & (len-1) 等效于取模
     * 最小容量8：JDK 8+ 优化
     * 扩容翻倍：确保容量始终是2的幂
     *
     * addFirst():
     *   elements[head = (head - 1) & (elements.length - 1)] = e;
     *
     * addLast():
     *   elements[tail] = e;
     *   tail = (tail + 1) & (elements.length - 1);
     *
     * pollFirst():
     *   result = elements[head];
     *   elements[head] = null;
     *   head = (head + 1) & (elements.length - 1);
     */
    
    /**
     * ========== 3. PriorityQueue源码关键点 ==========
     *
     * 底层：Object[] queue（二叉堆数组）
     * 比较器：Comparator（自然顺序或自定义）
     * 容量：默认11，不够时扩容
     *
     * offer(E e): 尾部插入，然后上浮（siftUp）
     *   // 将e放在数组末尾
     *   // 与父节点比较，如果小于父节点则交换
     *   // 重复直到根节点或大于父节点
     *
     * poll(): 弹出堆顶，尾部移至堆顶，然后下沉（siftDown）
     *   // 将堆顶（queue[0]）作为结果
     *   // 将最后一个元素移到堆顶
     *   // 与子节点比较，如果大于子节点则交换
     *   // 重复直到叶节点或小于子节点
     */
    
    /**
     * ========== 4. BlockingQueue 实现原理 ==========
     */
    
    // ArrayBlockingQueue：有界阻塞队列
    // 特点：
    // - 底层是循环数组（固定大小）
    // - 使用一把锁 + 两个Condition（notFull, notEmpty）
    // - put()/take() 会阻塞
    // - offer()/poll() 带超时
    //
    // public void put(E e) throws InterruptedException {
    //     final ReentrantLock lock = this.lock;
    //     lock.lockInterruptibly();
    //     try {
    //         while (count == items.length)
    //             notFull.await();  // 队列满，等待
    //         enqueue(e);
    //     } finally {
    //         lock.unlock();
    //     }
    // }
    //
    // private void enqueue(E x) {
    //     final Object[] items = this.items;
    //     items[putIndex] = x;
    //     if (++putIndex == items.length) putIndex = 0;  // 循环
    //     count++;
    //     notEmpty.signal();  // 唤醒消费者
    // }
    
    // LinkedBlockingQueue：可选有界阻塞队列
    // 特点：
    // - 底层是单向链表
    // - 使用两把锁 + 两个Condition
    //   - putLock：控制入队（生产者锁）
    //   - takeLock：控制出队（消费者锁）
    // - 入队和出队可以并发执行（比ArrayBlockingQueue吞吐量高）
    //
    // public void put(E e) throws InterruptedException {
    //     int c = -1;
    //     final ReentrantLock putLock = this.putLock;
    //     final AtomicInteger count = this.count;
    //     putLock.lockInterruptibly();
    //     try {
    //         while (count.get() == capacity) {
    //             notFull.await();
    //         }
    //         enqueue(node);
    //         c = count.getAndIncrement();
    //         if (c + 1 < capacity)
    //             notFull.signal();  // 还有空间，通知其他生产者
    //     } finally {
    //         putLock.unlock();
    //     }
    //     if (c == 0)
    //         signalNotEmpty();  // 从无到有，唤醒消费者
    // }
    
    // ========== 性能对比 ==========
    public static void main(String[] args) {
        // ArrayBlockingQueue vs LinkedBlockingQueue
        // ArrayBlockingQueue：
        //   - 性能更稳定（数组预分配，无GC压力）
        //   - 适合有界的、容量固定的场景
        //   - 单锁，入队出队互斥
        // 
        // LinkedBlockingQueue：
        //   - 可选有界（默认为Integer.MAX_VALUE）
        //   - 双锁，入队出队可并发
        //   - 链表有GC压力
        //   - 适合高吞吐场景
        //
        // 选择建议：
        // - 有界且容量较小 → ArrayBlockingQueue
        // - 需要高吞吐 → LinkedBlockingQueue
        // - 需要无界 → LinkedBlockingQueue（注意OOM风险）
    }
}
```

### 使用场景

- **ArrayBlockingQueue**：有界、低数据量、要求稳定延迟
- **LinkedBlockingQueue**：高吞吐、可选无界
- **PriorityBlockingQueue**：需要优先级排序
- **SynchronousQueue**：直接交接、零缓冲
- **DelayQueue**：延迟执行任务

### 潜在风险与问题

- **无界队列OOM**：LinkedBlockingQueue默认无界
- **锁竞争**：ArrayBlockingQueue单锁可能成为瓶颈
- **优先级翻转**：高优先级任务被低优先级任务阻塞
- **队列积压**：消费者处理不过来导致任务堆积

### 优化策略

- 使用有界队列控制资源使用
- 监控队列深度，设置告警阈值
- 使用Disruptor替代BlockingQueue（超高性能场景）
- 使用 transferQueue 减少不必要的入队操作

### 典型问题处理

**面试题：ArrayBlockingQueue和LinkedBlockingQueue的区别？**

| 维度 | ArrayBlockingQueue | LinkedBlockingQueue |
|------|-------------------|-------------------|
| 底层 | 循环数组 | 单向链表 |
| 容量 | 固定（必须有界） | 可选有界（默认无界） |
| 锁 | 单锁 | 双锁（入队/出队分离） |
| 吞吐量 | 中等 | 高 |
| GC影响 | 无（预分配） | 有（节点创建/回收） |
| 公平锁 | 支持 | 不支持 |

---

## 6.4 使用场景与风险分析

### 解决的问题

队列在工程中的应用非常广泛，从线程池到消息中间件。正确的选型和使用对系统稳定性至关重要。

### 实现原理

**队列在系统架构中的角色**：

```
生产者 → [队列缓冲区] → 消费者
            ↓
       流量削峰、异步解耦、负载均衡
```

**队列的核心价值**：
- **异步解耦**：生产者无需等待消费者处理完毕
- **流量削峰**：瞬时高流量通过队列缓冲，消费者按能力处理
- **负载均衡**：多个消费者从同一个队列消费，自动负载均衡
- **延迟处理**：任务可以延迟执行（DelayQueue）

### 代码实现

```java
/**
 * 队列的实战应用
 */
public class QueueApplications {
    
    // ========== 应用1：生产者-消费者模式 ==========
    static class ProducerConsumerExample {
        private static final BlockingQueue<String> queue = 
            new LinkedBlockingQueue<>(100);
        
        static class Producer implements Runnable {
            private final String name;
            
            Producer(String name) { this.name = name; }
            
            public void run() {
                try {
                    for (int i = 0; i < 100; i++) {
                        String msg = name + "-message-" + i;
                        queue.put(msg);  // 队列满时阻塞
                        System.out.println("Produced: " + msg);
                        Thread.sleep(10);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }
        
        static class Consumer implements Runnable {
            public void run() {
                try {
                    while (true) {
                        String msg = queue.take();  // 队列空时阻塞
                        System.out.println("Consumed: " + msg);
                        Thread.sleep(50);  // 消费慢于生产
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }
        
        public static void main(String[] args) {
            // 3个生产者，2个消费者
            for (int i = 0; i < 3; i++) {
                new Thread(new Producer("P" + i)).start();
            }
            for (int i = 0; i < 2; i++) {
                new Thread(new Consumer()).start();
            }
            // 队列天然平衡了生产和消费的速度差异
        }
    }
    
    // ========== 应用2：工作窃取（Work-Stealing） ==========
    // Fork/Join框架使用工作窃取算法
    // 每个线程有自己的双端队列
    // 线程优先从自己的队尾取任务（LIFO，利用局部性）
    // 空闲线程从其他线程的队首窃取任务（FIFO，避免竞争）
    // 
    // ForkJoinPool.commonPool() 默认使用这种模式
    
    // ========== 应用3：延迟任务调度 ==========
    static class DelayedTask implements Delayed {
        private final String name;
        private final long executeTime;
        
        DelayedTask(String name, long delayMillis) {
            this.name = name;
            this.executeTime = System.currentTimeMillis() + delayMillis;
        }
        
        @Override
        public long getDelay(TimeUnit unit) {
            return unit.convert(executeTime - System.currentTimeMillis(), 
                               TimeUnit.MILLISECONDS);
        }
        
        @Override
        public int compareTo(Delayed o) {
            return Long.compare(this.executeTime, 
                              ((DelayedTask) o).executeTime);
        }
        
        public void execute() {
            System.out.println("Executing: " + name + " at " + 
                             System.currentTimeMillis());
        }
        
        public static void main(String[] args) {
            DelayQueue<DelayedTask> delayQueue = new DelayQueue<>();
            delayQueue.put(new DelayedTask("Task1", 3000));  // 3秒后执行
            delayQueue.put(new DelayedTask("Task2", 1000));  // 1秒后执行
            delayQueue.put(new DelayedTask("Task3", 2000));  // 2秒后执行
            
            while (!delayQueue.isEmpty()) {
                DelayedTask task = delayQueue.take();  // 只有到时间才能取出
                task.execute();
            }
            // 输出顺序：Task2, Task3, Task1
        }
    }
}
```

### 使用场景

| 场景 | 推荐队列 | 原因 |
|------|---------|------|
| 线程池工作队列 | LinkedBlockingQueue/ArrayBlockingQueue | 线程安全、阻塞 |
| 消息中间件 | 高性能无锁队列（Disruptor） | 极致吞吐 |
| 日志缓冲 | ConcurrentLinkedQueue | 无锁、高并发 |
| 定时任务 | DelayQueue | 延迟执行 |
| 工作窃取 | 双端队列 | 提高CPU利用率 |

### 潜在风险与问题

- **队列积压**：消费者处理速度跟不上生产者，导致内存飙升
- **死锁**：生产者和消费者互相等待
- **消息丢失**：系统崩溃时内存队列中的消息丢失
- **无限阻塞**：消费者异常退出导致生产者永远阻塞

### 优化策略

- 使用有界队列限制内存使用
- 设置监控告警：队列深度超过阈值时报警
- 使用持久化队列（如Kafka）确保消息不丢失
- 配置合理的拒绝策略（丢弃、重试、降级）

### 典型问题处理

**工程实践：消息队列在微服务中的应用**

```java
// 使用RabbitMQ/Kafka/RocketMQ实现分布式队列
// 核心优势：
// 1. 解耦服务：服务之间不直接调用
// 2. 削峰填谷：瞬时流量被队列缓冲
// 3. 异步处理：非核心流程异步化
// 4. 可靠投递：消息持久化，消费者离线后恢复
//
// 典型架构：
// [订单服务] → [消息队列] → [库存服务]
//                ↓
//            [通知服务]
//                ↓
//            [统计分析]
```

---

## 6.5 典型问题：任务调度、生产者-消费者

### 解决的问题

任务调度和生产者-消费者是队列最经典的应用场景。前者展示了队列在系统设计中作为缓冲和解耦工具的价值，后者展示了队列在并发编程中的协调能力。

### 实现原理

**任务调度系统架构**：

```
[任务提交] → [队列] → [工作线程池]
                         ↓
                  [任务执行 & 结果回调]
```

**生产者-消费者模式**：
```
[生产者线程1] ──┐
[生产者线程2] ──┤──→ [共享队列] ←── [消费者线程1]
[生产者线程3] ──┘                    ←── [消费者线程2]
```

### 代码实现

```java
/**
 * 队列实战：基于队列的简单任务调度器
 */
public class TaskScheduler {
    
    interface Task extends Comparable<Task> {
        void execute();
        int priority();  // 优先级，值越大优先级越高
        String name();
        
        @Override
        default int compareTo(Task o) {
            return Integer.compare(o.priority(), this.priority());
        }
    }
    
    private final PriorityBlockingQueue<Task> taskQueue = 
        new PriorityBlockingQueue<>();
    
    private final List<Thread> workers;
    private volatile boolean running = true;
    
    public TaskScheduler(int workerCount) {
        this.workers = new ArrayList<>(workerCount);
        for (int i = 0; i < workerCount; i++) {
            Thread worker = new Thread(() -> {
                while (running) {
                    try {
                        Task task = taskQueue.take();  // 没有任务时阻塞
                        System.out.println(Thread.currentThread().getName() 
                                         + " 执行: " + task.name());
                        task.execute();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    } catch (Exception e) {
                        System.err.println("任务执行失败: " + e.getMessage());
                    }
                }
            }, "worker-" + i);
            workers.add(worker);
            worker.start();
        }
    }
    
    public void submit(Task task) {
        taskQueue.offer(task);
    }
    
    public void shutdown() {
        running = false;
        workers.forEach(Thread::interrupt);
    }
    
    public int pendingTasks() {
        return taskQueue.size();
    }
    
    // 使用示例
    public static void main(String[] args) {
        TaskScheduler scheduler = new TaskScheduler(3);
        
        // 提交带优先级的任务
        scheduler.submit(new Task() {
            public void execute() { System.out.println("高优先级任务"); }
            public int priority() { return 10; }
            public String name() { return "high-priority"; }
        });
        
        scheduler.submit(new Task() {
            public void execute() { System.out.println("低优先级任务"); }
            public int priority() { return 1; }
            public String name() { return "low-priority"; }
        });
        
        // 高优先级任务总是先执行
        scheduler.shutdown();
    }
}
```

```java
/**
 * 生产者-消费者实战：日志处理系统
 */
public class LogProcessingSystem {
    
    // 日志缓冲区 —— 有界阻塞队列
    private static final BlockingQueue<LogEntry> logBuffer = 
        new ArrayBlockingQueue<>(10000);
    
    // 日志条目
    static class LogEntry {
        final long timestamp;
        final String level;
        final String message;
        final String thread;
        
        LogEntry(String level, String message) {
            this.timestamp = System.currentTimeMillis();
            this.level = level;
            this.message = message;
            this.thread = Thread.currentThread().getName();
        }
        
        @Override
        public String toString() {
            return String.format("[%s] [%s] [%s] %s", 
                new java.text.SimpleDateFormat("HH:mm:ss.SSS")
                    .format(new java.util.Date(timestamp)),
                level, thread, message);
        }
    }
    
    // 日志生产者（业务线程调用）
    static class Logger {
        static void info(String msg) {
            logBuffer.offer(new LogEntry("INFO", msg));
        }
        
        static void error(String msg) {
            logBuffer.offer(new LogEntry("ERROR", msg));
        }
        
        static void warn(String msg) {
            logBuffer.offer(new LogEntry("WARN", msg));
        }
    }
    
    // 日志消费者（后台线程，批量写入文件）
    static class LogWriter implements Runnable {
        private final List<LogEntry> batch = new ArrayList<>(100);
        
        public void run() {
            try {
                while (true) {
                    // 阻塞直到有第一条日志
                    LogEntry first = logBuffer.poll(1, TimeUnit.SECONDS);
                    if (first == null) {
                        // 超时，检查是否还有待写入的
                        flushBatch();
                        continue;
                    }
                    batch.add(first);
                    
                    // 尽量批量收集，提高写入效率
                    logBuffer.drainTo(batch, 99);  // 最多再取99条
                    
                    if (batch.size() >= 100) {
                        flushBatch();
                    }
                }
            } catch (InterruptedException e) {
                flushBatch();
                Thread.currentThread().interrupt();
            }
        }
        
        private void flushBatch() {
            if (batch.isEmpty()) return;
            // 批量写入文件（实际项目中这里是I/O操作）
            for (LogEntry entry : batch) {
                System.out.println(entry);  // 模拟写入
            }
            batch.clear();
        }
    }
    
    public static void main(String[] args) {
        // 启动日志消费者线程
        new Thread(new LogWriter(), "log-writer").start();
        
        // 模拟业务线程产生日志
        for (int i = 0; i < 100; i++) {
            final int id = i;
            new Thread(() -> {
                Logger.info("处理请求 #" + id);
                try { Thread.sleep((long)(Math.random() * 10)); } 
                catch (InterruptedException e) {}
                Logger.error("请求 #" + id + " 异常");
            }, "worker-" + i).start();
        }
        
        System.out.println("日志系统使用队列解耦了日志生产者和消费者");
        System.out.println("生产者不需要等待I/O，消费者可以批量处理");
    }
}
```

### 使用场景

- **日志收集**：异步日志写入
- **消息处理**：异步消息分发
- **任务调度**：线程池执行任务
- **事件驱动**：事件发布订阅
- **流式处理**：数据流水线处理

### 潜在风险与问题

- **消息丢失**：系统崩溃时未处理的消息丢失
- **重复消费**：消费者处理完但未确认时崩溃
- **顺序问题**：多个消费者可能导致消息乱序
- **死信处理**：反复处理失败的消息

### 优化策略

- 使用有界队列避免OOM
- 实现背压（Backpressure）机制
- 使用批量操作提高吞吐量
- 引入死信队列处理异常消息
- 使用事务性队列确保消息可靠性

### 典型问题处理

**工程实践：如何设计一个高性能任务调度系统？**

1. **队列选择**：使用PriorityBlockingQueue支持优先级
2. **线程池**：使用ForkJoinPool支持工作窃取
3. **拒绝策略**：根据系统负载动态调整
4. **监控**：任务等待时间、执行时间、队列深度
5. **容错**：失败重试、死信队列、超时机制

---

> **本章总结**：队列是最常用的数据结构之一，其FIFO特性天然适合解耦生产者和消费者。循环队列、双端队列、阻塞队列等变体适应不同的工程场景。JDK提供了丰富的队列实现，从ArrayDeque到各种BlockingQueue。在并发编程和系统架构中，队列是实现异步、削峰、解耦的核心组件。生产者-消费者模式是队列最经典的应用，广泛用于线程池、日志系统、消息中间件等场景。