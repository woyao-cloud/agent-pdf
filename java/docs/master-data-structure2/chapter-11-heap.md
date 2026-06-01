# 第11章 堆与优先级队列

## 11.1 堆的原理与实现

### 解决的问题

堆（Heap）是一种特殊的完全二叉树，用于快速找到集合中的**最大值**或**最小值**。它解决了"从动态数据集中高效获取极值"的问题——每次插入或删除后，都能在O(log n)内重新找到极值。

> **核心价值**：堆是优先级队列的底层数据结构，是任务调度、TopK、中位数等问题的标准解法。

### 实现原理

**堆的特性**：
1. 完全二叉树结构（除最后一层外，其他层全满）
2. 堆序性：最大堆（max-heap）——父节点≥子节点；最小堆（min-heap）——父节点≤子节点

**数组表示法**（完全二叉树的紧凑存储）：
```
       50
      /  \
     30   40    → 数组：[50, 30, 40, 10, 20]
    /  \
   10  20

父节点索引 = (i - 1) / 2
左子节点索引 = 2*i + 1
右子节点索引 = 2*i + 2
```

**上浮（siftUp）**：插入时，将新节点与父节点比较，如果违反堆序则交换，直到满足堆序。
**下沉（siftDown）**：删除堆顶时，将最后一个元素移到堆顶，然后与子节点中较大的（最大堆）比较并下沉。

### 代码实现

```java
/**
 * 最大堆实现
 */
public class MaxHeap {
    private int[] data;
    private int size;
    private static final int DEFAULT_CAPACITY = 10;
    
    public MaxHeap() {
        data = new int[DEFAULT_CAPACITY];
        size = 0;
    }
    
    public MaxHeap(int[] arr) {
        // 堆化（heapify）：从最后一个非叶子节点开始下沉
        data = Arrays.copyOf(arr, arr.length);
        size = arr.length;
        for (int i = (size / 2 - 1); i >= 0; i--) {
            siftDown(i);
        }
    }
    
    // 插入 —— O(log n)
    public void insert(int val) {
        ensureCapacity();
        data[size++] = val;
        siftUp(size - 1);
    }
    
    // 获取堆顶 —— O(1)
    public int peek() {
        if (size == 0) throw new NoSuchElementException();
        return data[0];
    }
    
    // 删除堆顶 —— O(log n)
    public int extractMax() {
        if (size == 0) throw new NoSuchElementException();
        int max = data[0];
        data[0] = data[--size];
        siftDown(0);
        return max;
    }
    
    // 替换堆顶 —— O(log n)
    public int replace(int newVal) {
        int max = data[0];
        data[0] = newVal;
        siftDown(0);
        return max;
    }
    
    // 上浮
    private void siftUp(int index) {
        int val = data[index];
        while (index > 0) {
            int parent = (index - 1) / 2;
            if (val <= data[parent]) break;
            data[index] = data[parent];
            index = parent;
        }
        data[index] = val;
    }
    
    // 下沉
    private void siftDown(int index) {
        int val = data[index];
        int half = size / 2;
        
        while (index < half) {
            int child = 2 * index + 1;  // 左子节点
            int right = child + 1;
            
            // 选择较大的子节点
            if (right < size && data[right] > data[child]) {
                child = right;
            }
            
            if (val >= data[child]) break;
            
            data[index] = data[child];
            index = child;
        }
        data[index] = val;
    }
    
    private void ensureCapacity() {
        if (size == data.length) {
            data = Arrays.copyOf(data, data.length * 2);
        }
    }
    
    public int size() {
        return size;
    }
    
    public boolean isEmpty() {
        return size == 0;
    }
    
    public static void main(String[] args) {
        // 测试堆化
        MaxHeap heap = new MaxHeap(new int[]{3, 1, 6, 5, 2, 4});
        
        System.out.println("堆化后依次取出最大值：");
        while (!heap.isEmpty()) {
            System.out.print(heap.extractMax() + " ");  // 6 5 4 3 2 1
        }
    }
}
```

```java
/**
 * 最小堆（泛型版本）
 */
public class MinHeap<T extends Comparable<T>> {
    private Object[] data;
    private int size;
    private static final int DEFAULT_CAPACITY = 10;
    
    public MinHeap() {
        data = new Object[DEFAULT_CAPACITY];
        size = 0;
    }
    
    public void insert(T val) {
        if (size == data.length) {
            data = Arrays.copyOf(data, data.length * 2);
        }
        data[size] = val;
        siftUp(size);
        size++;
    }
    
    @SuppressWarnings("unchecked")
    public T extractMin() {
        if (size == 0) throw new NoSuchElementException();
        T min = (T) data[0];
        data[0] = data[--size];
        data[size] = null;
        siftDown(0);
        return min;
    }
    
    private void siftUp(int index) {
        T val = (T) data[index];
        while (index > 0) {
            int parent = (index - 1) / 2;
            if (val.compareTo((T) data[parent]) >= 0) break;
            data[index] = data[parent];
            index = parent;
        }
        data[index] = val;
    }
    
    private void siftDown(int index) {
        T val = (T) data[index];
        int half = size / 2;
        
        while (index < half) {
            int child = 2 * index + 1;
            int right = child + 1;
            
            if (right < size && ((T) data[right]).compareTo((T) data[child]) < 0) {
                child = right;
            }
            
            if (val.compareTo((T) data[child]) <= 0) break;
            
            data[index] = data[child];
            index = child;
        }
        data[index] = val;
    }
}
```

### 使用场景

| 场景 | 堆类型 | 说明 |
|------|--------|------|
| 任务调度 | 最小堆 | 按优先级/时间排序 |
| TopK问题 | 最小堆 | 维护大小为K的堆 |
| 中位数 | 最大堆+最小堆 | 两个堆维护数据流 |
| 堆排序 | 最大堆 | 就地排序 |
| Dijkstra | 最小堆 | 最短路径算法 |

### 潜在风险与问题

- **扩容开销**：动态数组扩容时需要复制
- **线程安全**：PriorityQueue不是线程安全的
- **删除非堆顶元素**：堆不支持直接删除任意元素（需要线性扫描）

### 优化策略

- 使用heapify()初始化：O(n)而非逐个插入的O(n log n)
- 批量插入后重新堆化
- 使用PriorityBlockingQueue处理并发

### 典型问题处理

**面试题：heapify()为什么是O(n)而非O(n log n)？**

每个节点下沉的时间与其深度成正比。在完全二叉树中，底层节点数量多但深度浅，顶层节点数量少但深度深。数学证明总下沉次数 ≤ 2n，所以是O(n)。

---

## 11.2 手写PriorityQueue实现

### 代码实现

```java
/**
 * 通用优先级队列
 */
public class MyPriorityQueue<E> {
    
    private static final int DEFAULT_CAPACITY = 11;
    private Object[] queue;
    private int size;
    private final Comparator<? super E> comparator;
    
    public MyPriorityQueue() {
        this(DEFAULT_CAPACITY, null);
    }
    
    public MyPriorityQueue(int initialCapacity, Comparator<? super E> comparator) {
        this.queue = new Object[initialCapacity];
        this.comparator = comparator;
    }
    
    public boolean offer(E e) {
        if (e == null) throw new NullPointerException();
        int i = size;
        if (i >= queue.length) grow();
        size = i + 1;
        if (i == 0) {
            queue[0] = e;
        } else {
            siftUp(i, e);
        }
        return true;
    }
    
    @SuppressWarnings("unchecked")
    public E poll() {
        if (size == 0) return null;
        int s = --size;
        E result = (E) queue[0];
        E moved = (E) queue[s];
        queue[s] = null;
        if (s != 0) siftDown(0, moved);
        return result;
    }
    
    @SuppressWarnings("unchecked")
    public E peek() {
        return (E) queue[0];
    }
    
    private void siftUp(int k, E x) {
        if (comparator != null) {
            siftUpUsingComparator(k, x);
        } else {
            siftUpComparable(k, x);
        }
    }
    
    @SuppressWarnings("unchecked")
    private void siftUpComparable(int k, E x) {
        Comparable<? super E> key = (Comparable<? super E>) x;
        while (k > 0) {
            int parent = (k - 1) >>> 1;
            Object e = queue[parent];
            if (key.compareTo((E) e) >= 0) break;
            queue[k] = e;
            k = parent;
        }
        queue[k] = x;
    }
    
    @SuppressWarnings("unchecked")
    private void siftUpUsingComparator(int k, E x) {
        while (k > 0) {
            int parent = (k - 1) >>> 1;
            Object e = queue[parent];
            if (comparator.compare(x, (E) e) >= 0) break;
            queue[k] = e;
            k = parent;
        }
        queue[k] = x;
    }
    
    private void siftDown(int k, E x) {
        if (comparator != null) {
            siftDownUsingComparator(k, x);
        } else {
            siftDownComparable(k, x);
        }
    }
    
    @SuppressWarnings("unchecked")
    private void siftDownComparable(int k, E x) {
        Comparable<? super E> key = (Comparable<? super E>) x;
        int half = size >>> 1;
        while (k < half) {
            int child = (k << 1) + 1;
            int right = child + 1;
            Object c = queue[child];
            if (right < size && ((Comparable<? super E>) c).compareTo((E) queue[right]) > 0) {
                c = queue[child = right];
            }
            if (key.compareTo((E) c) <= 0) break;
            queue[k] = c;
            k = child;
        }
        queue[k] = x;
    }
    
    @SuppressWarnings("unchecked")
    private void siftDownUsingComparator(int k, E x) {
        int half = size >>> 1;
        while (k < half) {
            int child = (k << 1) + 1;
            int right = child + 1;
            Object c = queue[child];
            if (right < size && comparator.compare((E) c, (E) queue[right]) > 0) {
                c = queue[child = right];
            }
            if (comparator.compare(x, (E) c) <= 0) break;
            queue[k] = c;
            k = child;
        }
        queue[k] = x;
    }
    
    private void grow() {
        int oldCapacity = queue.length;
        int newCapacity = oldCapacity < 64 ? 
            oldCapacity + 2 : 
            oldCapacity + (oldCapacity >> 1);
        queue = Arrays.copyOf(queue, newCapacity);
    }
    
    public int size() {
        return size;
    }
}
```

---

## 11.3 JDK源码解析（PriorityQueue）

### 实现原理

```
PriorityQueue<E>
├── 底层：Object[] queue（最小堆）
├── 比较器：Comparator（可选）
├── 默认容量：11
├── 扩容策略：小容量时+2，大容量时1.5倍
└── 特性：无界、非线程安全
```

### 典型问题处理

**面试题：PriorityQueue和TreeSet的区别？**

PriorityQueue只保证堆顶是最小元素，不保证全局有序。TreeSet保证全部有序。PriorityQueue适合优先级队列场景，TreeSet适合需要全局排序的场景。

---

## 11.4 使用场景与风险分析

### 典型问题处理

**面试题：如何用堆实现快速TopK？**

```java
// 找前K个最大的元素
public List<Integer> topK(int[] nums, int k) {
    PriorityQueue<Integer> minHeap = new PriorityQueue<>(k);
    for (int num : nums) {
        if (minHeap.size() < k) {
            minHeap.offer(num);
        } else if (num > minHeap.peek()) {
            minHeap.poll();
            minHeap.offer(num);
        }
    }
    return new ArrayList<>(minHeap);
}
// 时间复杂度：O(n log k)，空间复杂度：O(k)
```

---

## 11.5 典型问题：TopK、堆排序

### 堆排序实现

```java
/**
 * 堆排序（就地排序）
 */
public class HeapSort {
    
    public void sort(int[] arr) {
        int n = arr.length;
        
        // 建堆 O(n)
        for (int i = n / 2 - 1; i >= 0; i--) {
            heapify(arr, n, i);
        }
        
        // 一个个取出堆顶 O(n log n)
        for (int i = n - 1; i > 0; i--) {
            // 将堆顶（最大值）移到末尾
            int temp = arr[0];
            arr[0] = arr[i];
            arr[i] = temp;
            
            // 对剩余元素重新堆化
            heapify(arr, i, 0);
        }
    }
    
    private void heapify(int[] arr, int n, int i) {
        int largest = i;
        int left = 2 * i + 1;
        int right = 2 * i + 2;
        
        if (left < n && arr[left] > arr[largest]) largest = left;
        if (right < n && arr[right] > arr[largest]) largest = right;
        
        if (largest != i) {
            int swap = arr[i];
            arr[i] = arr[largest];
            arr[largest] = swap;
            heapify(arr, n, largest);
        }
    }
    
    // 堆排序特点：
    // 时间复杂度：O(n log n)（任何情况下）
    // 空间复杂度：O(1)（就地排序）
    // 不稳定
}
```

---

> **本章总结**：堆是完全二叉树的高效实现，通过上浮和下沉操作在O(log n)内维护极值。PriorityQueue是JDK中堆的实现，广泛应用于优先级队列、TopK问题、任务调度等场景。堆排序虽然性能不如快速排序，但在需要保障最坏情况性能的场景下是可靠的选择。