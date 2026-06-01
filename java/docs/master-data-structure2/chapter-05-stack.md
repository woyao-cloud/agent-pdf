# 第5章 栈

## 5.1 栈的原理与实现

### 解决的问题

栈（Stack）是一种**后进先出（LIFO, Last In First Out）** 的数据结构。它限制数据的操作只能在一端进行——这一端称为栈顶。栈的核心价值在于：**它天然适合需要"回溯"的场景**。

> **核心价值**：无论是最简单的括号匹配还是复杂的JVM方法调用，栈都是不可替代的核心数据结构。

### 实现原理

栈的核心操作：

```
栈（LIFO结构）
├── push(e)   —— 压栈：将元素放入栈顶
├── pop()     —— 出栈：移除并返回栈顶元素
├── peek()    —— 查看栈顶元素（不移除）
├── isEmpty() —— 判断栈是否为空
└── size()    —— 返回栈中元素个数

操作示意图：
push(1) → [1]
push(2) → [1, 2]
push(3) → [1, 2, 3]
pop()   → 返回3，栈变为 [1, 2]
peek()  → 返回2，栈不变 [1, 2]
```

**栈的底层实现有两种方式**：

| 实现方式 | 优点 | 缺点 |
|---------|------|------|
| 数组栈（ArrayStack） | 内存连续，CPU缓存友好 | 需要扩容 |
| 链表栈（LinkedStack） | 无容量限制 | 额外指针开销 |

### 代码实现

```java
/**
 * 基于数组的栈实现
 */
public class ArrayStack<E> {
    private static final int DEFAULT_CAPACITY = 10;
    private Object[] elements;
    private int top;  // 栈顶指针，指向下一个可用的位置
    
    public ArrayStack() {
        elements = new Object[DEFAULT_CAPACITY];
        top = 0;
    }
    
    public ArrayStack(int initialCapacity) {
        if (initialCapacity <= 0) {
            throw new IllegalArgumentException("Capacity must be positive");
        }
        elements = new Object[initialCapacity];
        top = 0;
    }
    
    // 压栈 —— 摊销O(1)
    public void push(E e) {
        ensureCapacity();
        elements[top++] = e;
    }
    
    // 出栈 —— O(1)
    @SuppressWarnings("unchecked")
    public E pop() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        E e = (E) elements[--top];
        elements[top] = null;  // help GC
        return e;
    }
    
    // 查看栈顶 —— O(1)
    @SuppressWarnings("unchecked")
    public E peek() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        return (E) elements[top - 1];
    }
    
    public boolean isEmpty() {
        return top == 0;
    }
    
    public int size() {
        return top;
    }
    
    private void ensureCapacity() {
        if (top == elements.length) {
            int newCapacity = elements.length + (elements.length >> 1);
            elements = Arrays.copyOf(elements, newCapacity);
        }
    }
}
```

```java
/**
 * 基于链表的栈实现
 */
public class LinkedStack<E> {
    
    private static class Node<E> {
        E data;
        Node<E> next;
        
        Node(E data, Node<E> next) {
            this.data = data;
            this.next = next;
        }
    }
    
    private Node<E> top;  // 栈顶
    private int size;
    
    public LinkedStack() {
        top = null;
        size = 0;
    }
    
    // 压栈 —— O(1)（在头部插入）
    public void push(E e) {
        Node<E> newNode = new Node<>(e, top);
        top = newNode;
        size++;
    }
    
    // 出栈 —— O(1)（删除头节点）
    public E pop() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        E data = top.data;
        top = top.next;
        size--;
        return data;
    }
    
    // 查看栈顶 —— O(1)
    public E peek() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        return top.data;
    }
    
    public boolean isEmpty() {
        return top == null;
    }
    
    public int size() {
        return size;
    }
}
```

### 使用场景

| 场景 | 说明 |
|------|------|
| 函数调用 | JVM虚拟机栈，方法调用与返回 |
| 表达式求值 | 中缀转后缀、计算表达式 |
| 括号匹配 | 编译器的语法检查 |
| 撤销操作 | 编辑器的Undo/Redo |
| 深度优先遍历 | 树的DFS、图的深度遍历 |
| 浏览历史 | 浏览器的前进后退 |

### 潜在风险与问题

- **空栈操作**：pop()/peek()前必须检查isEmpty()
- **栈溢出**：递归过深导致StackOverflowError
- **线程安全**：普通栈实现不是线程安全的
- **容量耗尽**：数组栈可能扩容失败（OOM）

### 优化策略

- 使用ArrayDeque替代Stack（JDK官方推荐）
- 预分配栈容量以减少扩容
- 多线程环境使用ConcurrentLinkedDeque或加锁
- 递归改迭代（使用自定义栈避免StackOverflowError）

### 典型问题处理

**面试题：如何用两个队列实现一个栈？**

```java
class StackByTwoQueues<E> {
    private Queue<E> q1 = new LinkedList<>();
    private Queue<E> q2 = new LinkedList<>();
    
    public void push(E e) {
        q1.offer(e);  // 总是入到q1
    }
    
    public E pop() {
        if (q1.isEmpty()) throw new EmptyStackException();
        // 将q1中除最后一个元素外的所有元素移到q2
        while (q1.size() > 1) {
            q2.offer(q1.poll());
        }
        E result = q1.poll();  // 最后一个元素出队
        // 交换q1和q2
        Queue<E> temp = q1;
        q1 = q2;
        q2 = temp;
        return result;
    }
}
```

---

## 5.2 手写Stack实现

### 解决的问题

JDK中的Stack类已不推荐使用，官方推荐使用Deque（ArrayDeque）替代。但理解栈的实现原理，对于深入理解JVM方法调用、编译原理等都有重要意义。

> **核心价值**：手写栈的实现，深入理解LIFO数据结构的本质。

### 实现原理

一个完整的栈实现需要支持以下操作：

```
栈接口定义：
- void push(E e)      —— 压栈
- E pop()             —— 出栈（删除栈顶）
- E peek()            —— 查看栈顶
- boolean isEmpty()   —— 是否为空
- int size()          —— 元素个数
- int search(Object o) —— 查找元素在栈中的位置
```

### 代码实现

```java
/**
 * 完整的栈接口
 */
public interface Stack<E> {
    void push(E e);
    E pop();
    E peek();
    boolean isEmpty();
    int size();
    int search(Object o);
}
```

```java
/**
 * 动态数组实现的栈（完整版）
 */
public class DynamicArrayStack<E> implements Stack<E> {
    
    private static final int DEFAULT_CAPACITY = 10;
    private Object[] elements;
    private int top;
    
    public DynamicArrayStack() {
        this.elements = new Object[DEFAULT_CAPACITY];
        this.top = 0;
    }
    
    public DynamicArrayStack(int initialCapacity) {
        if (initialCapacity <= 0) {
            throw new IllegalArgumentException("Illegal capacity: " + initialCapacity);
        }
        this.elements = new Object[initialCapacity];
        this.top = 0;
    }
    
    @Override
    public void push(E e) {
        if (top == elements.length) {
            grow();
        }
        elements[top++] = e;
    }
    
    @Override
    @SuppressWarnings("unchecked")
    public E pop() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        E result = (E) elements[--top];
        elements[top] = null;  // help GC
        return result;
    }
    
    @Override
    @SuppressWarnings("unchecked")
    public E peek() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        return (E) elements[top - 1];
    }
    
    @Override
    public boolean isEmpty() {
        return top == 0;
    }
    
    @Override
    public int size() {
        return top;
    }
    
    @Override
    public int search(Object o) {
        // 从栈顶向下搜索（栈顶算1）
        if (o == null) {
            for (int i = top - 1; i >= 0; i--) {
                if (elements[i] == null) {
                    return top - i;
                }
            }
        } else {
            for (int i = top - 1; i >= 0; i--) {
                if (o.equals(elements[i])) {
                    return top - i;
                }
            }
        }
        return -1;
    }
    
    private void grow() {
        int newCapacity = elements.length + (elements.length >> 1);
        if (newCapacity < DEFAULT_CAPACITY) {
            newCapacity = DEFAULT_CAPACITY;
        }
        elements = Arrays.copyOf(elements, newCapacity);
    }
    
    // 压缩容量（释放多余空间）
    public void trimToSize() {
        if (top < elements.length) {
            elements = Arrays.copyOf(elements, Math.max(top, DEFAULT_CAPACITY));
        }
    }
    
    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < top; i++) {
            if (i > 0) sb.append(", ");
            sb.append(elements[i]);
        }
        sb.append("]");
        return sb.toString();
    }
    
    // 使用示例
    public static void main(String[] args) {
        DynamicArrayStack<Integer> stack = new DynamicArrayStack<>();
        stack.push(1);
        stack.push(2);
        stack.push(3);
        System.out.println(stack);       // [1, 2, 3]
        System.out.println(stack.peek());// 3
        System.out.println(stack.pop()); // 3
        System.out.println(stack);       // [1, 2]
        System.out.println(stack.search(1)); // 2（距离栈顶2个位置）
    }
}
```

### 使用场景

- **方法调用栈模拟**：理解递归的执行过程
- **JVM栈帧管理**：每个线程的栈帧
- **编译器的语法分析**：LL语法分析中的分析栈
- **函数式编程**：使用栈实现continuation

### 潜在风险与问题

- **已弃用的Stack类**：JDK的Stack继承自Vector，有同步开销
- **search()语义**：JDK的Stack.search()返回从栈顶开始的距离（1-indexed），容易混淆
- **容量问题**：无限push会导致内存溢出

### 优化策略

- 永远使用ArrayDeque替代Stack
- 预分配容量：new ArrayDeque<>(expectedSize)
- 实现shrink机制：当使用率低时自动收缩容量

### 典型问题处理

**面试题：为什么JDK的Stack被弃用？**

- Stack继承自Vector，而Vector已弃用
- 继承关系不合理（Stack IS-A Vector，但栈不允许中间插入删除）
- 同步开销不必要（大多数场景不需要线程安全）
- 使用Deque替代更灵活（ArrayDeque性能更好）

---

## 5.3 JDK源码解析（Deque/Stack）

### 解决的问题

JDK中栈的实现有一个演进过程：从最初的Stack类（JDK 1.0），到后来推荐使用Deque接口（JDK 1.6+）。理解这个过程和ArrayDeque的实现，是学习栈的正确方式。

> **核心价值**：掌握ArrayDeque作为栈和队列的工业级实现。

### 实现原理

**ArrayDeque的核心设计**：

```
ArrayDeque（循环数组实现）
├── 底层：Object[] elements（循环数组）
├── head：队列头索引
├── tail：队列尾索引（指向下一个可插入位置）
├── 容量：2的幂次（初始16）
└── 扩容：翻倍（head和tail之间的数据复制）
```

循环数组的关键：
```
初始状态（容量=8）：
索引: [0] [1] [2] [3] [4] [5] [6] [7]
      ↑
    head=tail=0

push(1, 2, 3)之后：
索引: [1] [2] [3] [0] [0] [0] [0] [0]
                    ↑           ↑
                  tail=3      head=0

push更多，head向左移动（循环）：
索引: [1] [2] [3] [0] [0] [0] [6] [7]
              ↑                   ↑
            tail=3              head=6
```

### 代码实现

```java
/**
 * ArrayDeque源码解析（作为栈使用）
 */
public class ArrayDequeSourceAnalysis {
    
    /**
     * ========== 核心字段 ==========
     * 
     * transient Object[] elements;  // 存储元素的数组
     * transient int head;           // 头部索引
     * transient int tail;           // 尾部索引（下一个要插入的位置）
     * 
     * 最小容量：8（必须为2的幂）
     * 扩容策略：翻倍
     */
    
    /**
     * ========== push(E e) —— 压栈 ==========
     * 
     * public void push(E e) {
     *     addFirst(e);  // push = 在头部添加
     * }
     * 
     * public void addFirst(E e) {
     *     if (e == null)
     *         throw new NullPointerException();
     *     // head = (head - 1) & (elements.length - 1)
     *     // 利用2的幂次特性，用 & 代替取模
     *     elements[head = (head - 1) & (elements.length - 1)] = e;
     *     if (head == tail)
     *         doubleCapacity();  // 满了，翻倍扩容
     * }
     * 
     * 关键技巧：head指针向左移动（循环）
     * 使用位运算 & (len-1) 处理循环，等效于 % len
     */
    
    /**
     * ========== pop() —— 出栈 ==========
     * 
     * public E pop() {
     *     return removeFirst();  // pop = 删除头部
     * }
     * 
     * public E removeFirst() {
     *     E x = pollFirst();
     *     if (x == null)
     *         throw new NoSuchElementException();
     *     return x;
     * }
     * 
     * public E pollFirst() {
     *     int h = head;
     *     @SuppressWarnings("unchecked")
     *     E result = (E) elements[h];
     *     if (result == null)
     *         return null;
     *     elements[h] = null;  // 清除引用
     *     head = (h + 1) & (elements.length - 1);
     *     return result;
     * }
     */
    
    /**
     * ========== 扩容 doubleCapacity() ==========
     * 
     * private void doubleCapacity() {
     *     assert head == tail;
     *     int p = head;
     *     int n = elements.length;
     *     int r = n - p;  // head右边的元素个数
     *     int newCapacity = n << 1;  // 翻倍
     *     if (newCapacity < 0)
     *         throw new IllegalStateException("Sorry, deque too big");
     *     Object[] a = new Object[newCapacity];
     *     // 复制head右边的元素到新数组开头
     *     System.arraycopy(elements, p, a, 0, r);
     *     // 复制head左边的元素到新数组后续位置
     *     System.arraycopy(elements, 0, a, r, p);
     *     elements = a;
     *     head = 0;
     *     tail = n;  // 新容量的一半，即原来的所有元素
     * }
     * 
     * 扩容示意图（容量=8）：
     * 扩容前：[h, x, x, x, x, x, t, h+1]
     *          ↑              ↑
     *        head           tail
     * 扩容后：[x, x, x, x, x, x, _, _, _, _, _, _, _, _, _, _]
     *          ↑              ↑
     *        head=0        tail=8
     */
    
    /**
     * ========== 为什么ArrayDeque比Stack好？ ==========
     * 
     * 1. 无同步开销（Stack继承自Vector，所有方法都synchronized）
     * 2. 内存连续（数组实现，CPU缓存友好）
     * 3. 容量可扩展（自动翻倍扩容）
     * 4. 支持双端操作（同时是栈和队列）
     * 5. 不允许null（避免混淆）
     * 6. 迭代器支持（可以遍历，但Stack也支持）
     * 
     * 性能对比（JDK 8+ JMH测试）：
     * | 操作 | Stack | ArrayDeque | 倍数 |
     * |-----|-------|-----------|------|
     * | push/pop | ~20ns | ~10ns | 2x |
     * | peek | ~15ns | ~5ns | 3x |
     *  
     * 注意：这是单线程无竞争的对比。实际多线程下差距更大。
     */
    
    public static void main(String[] args) {
        // ✅ 正确的栈使用方式
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(1);     // 压栈
        stack.push(2);
        stack.push(3);
        int top = stack.peek();  // 查看栈顶：3
        int popped = stack.pop(); // 出栈：3
        boolean empty = stack.isEmpty(); // false
        
        // ❌ 过时的使用方式
        Stack<Integer> oldStack = new Stack<>();
        oldStack.push(1);
        oldStack.push(2);
        oldStack.pop();    // 虽然能用，但不推荐
    }
}
```

### 使用场景

- **栈操作**：使用ArrayDeque.push()/pop()
- **队列操作**：使用ArrayDeque.offer()/poll()
- **双端队列**：使用addFirst()/addLast()/removeFirst()/removeLast()
- **性能敏感场景**：ArrayDeque是最高效的栈/队列实现

### 潜在风险与问题

- **不允许null**：ArrayDeque不允许插入null
- **迭代器弱一致性**：非线程安全，迭代过程中修改可能出问题
- **扩容开销**：翻倍扩容可能浪费内存
- **不实现List接口**：不能通过索引访问元素

### 优化策略

- **初始容量设2的幂**：new ArrayDeque<>(32)，避免扩容
- **批量操作预分配**：能预估数据量时指定容量
- **使用addAll()**：批量添加使用addAll()而非逐个push()

### 典型问题处理

**面试题：ArrayDeque的初始容量为什么是2的幂？**

- `(head - 1) & (length - 1)` 等效于 `(head - 1) % length`
- 位运算比取模运算快得多
- 这种技巧在HashMap中也有应用
- 所以ArrayDeque的容量总是2的幂

---

## 5.4 使用场景与风险分析

### 解决的问题

栈的应用场景非常广泛，从编译原理到算法设计，从JVM实现到日常编程。理解栈的应用场景，可以帮助在适当时机使用栈来简化问题。

### 实现原理

**栈与递归的关系**：
- 每次递归调用，JVM在栈帧中压入方法的参数、局部变量和返回地址
- 递归返回时，从栈帧中弹出
- 递归深度受限于栈大小（JVM默认约1MB，约1000-10000层）

**栈与回溯算法的关系**：
- 回溯算法（八皇后、迷宫寻路）天然使用栈保存状态
- 深度优先搜索（DFS）也可以使用栈实现

### 代码实现

```java
/**
 * 栈的实际应用场景
 */
public class StackApplications {
    
    // ========== 场景1：浏览器的前进后退 ==========
    static class BrowserHistory {
        private Deque<String> backStack = new ArrayDeque<>();   // 后退栈
        private Deque<String> forwardStack = new ArrayDeque<>(); // 前进栈
        private String current;
        
        public BrowserHistory(String homepage) {
            this.current = homepage;
        }
        
        public void visit(String url) {
            backStack.push(current);
            current = url;
            forwardStack.clear();  // 新访问清除前进记录
        }
        
        public String back() {
            if (backStack.isEmpty()) return current;
            forwardStack.push(current);
            current = backStack.pop();
            return current;
        }
        
        public String forward() {
            if (forwardStack.isEmpty()) return current;
            backStack.push(current);
            current = forwardStack.pop();
            return current;
        }
    }
    
    // ========== 场景2：撤销/重做操作 ==========
    static class UndoRedoManager {
        private Deque<String> undoStack = new ArrayDeque<>();
        private Deque<String> redoStack = new ArrayDeque<>();
        
        public void performAction(String action) {
            undoStack.push(action);
            redoStack.clear();  // 新操作清除重做记录
        }
        
        public String undo() {
            if (undoStack.isEmpty()) return null;
            String action = undoStack.pop();
            redoStack.push(action);
            return "Undo: " + action;
        }
        
        public String redo() {
            if (redoStack.isEmpty()) return null;
            String action = redoStack.pop();
            undoStack.push(action);
            return "Redo: " + action;
        }
    }
    
    // ========== 场景3：JVM调用栈模拟 ==========
    static class CallStack {
        private Deque<String> stackFrames = new ArrayDeque<>();
        
        public void callMethod(String methodName) {
            System.out.println("Enter: " + methodName);
            stackFrames.push(methodName);
        }
        
        public void returnMethod() {
            String method = stackFrames.pop();
            System.out.println("Exit: " + method);
        }
        
        public void printStackTrace() {
            System.out.println("Call stack (top to bottom):");
            for (String frame : stackFrames) {
                System.out.println("  at " + frame);
            }
        }
        
        public static void main(String[] args) {
            CallStack jvmStack = new CallStack();
            jvmStack.callMethod("main");
            jvmStack.callMethod("service()");
            jvmStack.callMethod("dao()");
            jvmStack.printStackTrace();
            // 输出：
            // Enter: main
            // Enter: service()
            // Enter: dao()
            // Call stack (top to bottom):
            //   at dao()
            //   at service()
            //   at main()
            
            // 模拟JVM栈溢出
            try {
                recursiveCall(100000);  // 递归太深
            } catch (StackOverflowError e) {
                System.out.println("Stack overflow! 默认栈深度约10000层");
                // 解决方案：增大栈（-Xss2m）或改为迭代
            }
        }
        
        static void recursiveCall(int depth) {
            if (depth == 0) return;
            recursiveCall(depth - 1);
        }
    }
}
```

### 使用场景

| 场景 | 具体应用 | 栈的作用 |
|------|---------|---------|
| 表达式处理 | 计算器、编译器 | 运算符栈、操作数栈 |
| 语法分析 | JSON/XML解析 | 标签匹配 |
| 状态管理 | 游戏AI | 决策栈 |
| 内存管理 | JVM | 栈帧管理 |
| 图算法 | 深度优先搜索 | 待访问节点 |

### 潜在风险与问题

- **栈溢出**：递归过深或无限递归
- **内存泄漏**：栈中引用对象未清理，阻止GC
- **线程安全**：非线程安全的栈在多线程下数据错乱
- **搜索效率低**：search()操作是O(n)

### 优化策略

- 递归转迭代，使用显式栈
- 使用-Xss参数调整JVM栈大小
- 多线程使用ConcurrentLinkedDeque
- 共享栈：当两个栈的需求相反时（一个增一个减），可以用一个数组实现两个栈

### 典型问题处理

**工程实践：线程栈溢出的诊断和解决**

```java
// 诊断工具：
// 1. jstack <pid> —— 查看线程栈
// 2. -XX:+StackTraceInThrowable —— 异常时打印栈信息
// 
// 解决方案：
// 1. 增加栈大小：-Xss2m
// 2. 检查无限递归
// 3. 尾递归优化（Java不支持，需要改写成循环）
// 4. 使用自定义栈数据结构替代JVM调用栈
```

---

## 5.5 典型问题：表达式求值、括号匹配

### 解决的问题

表达式求值和括号匹配是栈最经典的应用场景。通过这两个问题，可以深刻理解栈在"嵌套结构处理"中的核心价值。

### 实现原理

**表达式求值的关键思路**：
1. 两个栈：操作数栈（operands）和运算符栈（operators）
2. 运算符优先级比较：当前运算符高于栈顶运算符时入栈，否则弹出计算
3. 括号处理：左括号直接入栈，右括号则计算到遇到左括号

**括号匹配的关键思路**：
1. 遇到左括号入栈
2. 遇到右括号，检查栈顶是否匹配
3. 最终栈为空则匹配成功

### 代码实现

```java
/**
 * 栈的经典应用：括号匹配
 */
public class BracketMatching {
    
    // 检查括号是否匹配
    public static boolean isValid(String s) {
        Deque<Character> stack = new ArrayDeque<>();
        
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '{' || c == '[') {
                stack.push(c);  // 左括号入栈
            } else {
                if (stack.isEmpty()) return false;  // 右括号多于左括号
                char top = stack.pop();
                // 检查是否匹配
                if (c == ')' && top != '(') return false;
                if (c == '}' && top != '{') return false;
                if (c == ']' && top != '[') return false;
            }
        }
        return stack.isEmpty();  // 左括号多于右括号时不匹配
    }
    
    // 检查并给出错误位置
    public static String matchWithError(String s) {
        Deque<Character> stack = new ArrayDeque<>();
        Deque<Integer> positions = new ArrayDeque<>();  // 记录左括号位置
        
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '(' || c == '{' || c == '[') {
                stack.push(c);
                positions.push(i);
            } else if (c == ')' || c == '}' || c == ']') {
                if (stack.isEmpty()) {
                    return "位置" + i + "处有多余的右括号 " + c;
                }
                char top = stack.pop();
                positions.pop();
                if ((c == ')' && top != '(') ||
                    (c == '}' && top != '{') ||
                    (c == ']' && top != '[')) {
                    return "位置" + i + "处括号不匹配：" + top + " vs " + c;
                }
            }
        }
        if (!stack.isEmpty()) {
            return "位置" + positions.peek() + "处有未闭合的左括号 " + stack.peek();
        }
        return "括号匹配成功！";
    }
    
    public static void main(String[] args) {
        System.out.println(matchWithError("()"));      // 成功
        System.out.println(matchWithError("()[]{}"));  // 成功
        System.out.println(matchWithError("(]"));      // 不匹配
        System.out.println(matchWithError("([)]"));    // 不匹配
        System.out.println(matchWithError("{[]}"));    // 成功（嵌套匹配）
    }
}
```

```java
/**
 * 栈的经典应用：表达式求值（中缀表达式）
 */
public class ExpressionEvaluator {
    
    // 运算符优先级
    private static int precedence(char op) {
        switch (op) {
            case '+': case '-': return 1;
            case '*': case '/': return 2;
            case '^': return 3;  // 幂运算
            default: return 0;
        }
    }
    
    // 中缀表达式求值
    public static double evaluate(String expression) {
        Deque<Double> operands = new ArrayDeque<>();  // 操作数栈
        Deque<Character> operators = new ArrayDeque<>();  // 运算符栈
        
        for (int i = 0; i < expression.length(); i++) {
            char c = expression.charAt(i);
            
            if (c == ' ') continue;  // 跳过空格
            
            if (Character.isDigit(c) || c == '.') {
                // 解析多位数
                StringBuilder sb = new StringBuilder();
                while (i < expression.length() && 
                       (Character.isDigit(expression.charAt(i)) || expression.charAt(i) == '.')) {
                    sb.append(expression.charAt(i++));
                }
                i--;
                operands.push(Double.parseDouble(sb.toString()));
            } else if (c == '(') {
                operators.push(c);
            } else if (c == ')') {
                // 计算直到遇到左括号
                while (operators.peek() != '(') {
                    operands.push(applyOp(operators.pop(), operands.pop(), operands.pop()));
                }
                operators.pop();  // 弹出左括号
            } else if (isOperator(c)) {
                // 处理负号
                if (c == '-' && (i == 0 || expression.charAt(i-1) == '(')) {
                    operands.push(0.0);
                }
                // 当前运算符优先级低于栈顶时，先计算栈顶
                while (!operators.isEmpty() && precedence(operators.peek()) >= precedence(c)) {
                    operands.push(applyOp(operators.pop(), operands.pop(), operands.pop()));
                }
                operators.push(c);
            }
        }
        
        // 计算剩余的运算符
        while (!operators.isEmpty()) {
            operands.push(applyOp(operators.pop(), operands.pop(), operands.pop()));
        }
        
        return operands.pop();
    }
    
    private static boolean isOperator(char c) {
        return c == '+' || c == '-' || c == '*' || c == '/' || c == '^';
    }
    
    private static double applyOp(char op, double b, double a) {
        switch (op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': 
                if (b == 0) throw new ArithmeticException("除数不能为0");
                return a / b;
            case '^': return Math.pow(a, b);
        }
        return 0;
    }
    
    public static void main(String[] args) {
        System.out.println(evaluate("3 + 4 * 2"));        // 11.0
        System.out.println(evaluate("(3 + 4) * 2"));      // 14.0
        System.out.println(evaluate("10 / (2 + 3)"));     // 2.0
        System.out.println(evaluate("2 ^ 3 + 1"));        // 9.0
        System.out.println(evaluate("-5 + 3"));           // -2.0
    }
}
```

### 使用场景

- **表达式求值**：计算器、公式引擎
- **括号匹配**：IDE的语法高亮、编译器
- **HTML/XML解析**：标签嵌套匹配
- **Markdown解析**：嵌套的标记解析

### 潜在风险与问题

- **表达式复杂度**：不支持函数调用、变量等
- **精度问题**：浮点数计算精度损失
- **异常输入**：空表达式、非法字符、除零
- **大数溢出**：表达式结果超出double范围

### 优化策略

- 使用后缀表达式（逆波兰式）预处理
- 使用BigDecimal处理精确计算
- 使用编译原理的递归下降分析法处理更复杂的表达式

### 典型问题处理

**面试题：中缀转后缀（逆波兰式）**

```java
// 中缀: a + b * c - d
// 后缀: a b c * + d -
// 
// 转换算法：
// 1. 操作数直接输出
// 2. 左括号入栈
// 3. 右括号弹出到左括号
// 4. 运算符：优先级高于栈顶则入栈，否则弹出再入栈
```

---

> **本章总结**：栈是最简单但最重要的数据结构之一。它的LIFO特性天然适合处理嵌套结构、回溯场景和表达式求值。JDK中推荐使用ArrayDeque而非Stack作为栈的实现，因为ArrayDeque性能更好、功能更灵活。括号匹配和表达式求值是栈的经典应用，通过这两个问题可以深入理解栈的精髓。在实际工程中，栈被广泛应用于浏览历史、撤销重做、JVM调用栈等场景。