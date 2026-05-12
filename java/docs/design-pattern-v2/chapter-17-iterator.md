# 第17章 迭代器模式（Iterator）

**迭代器模式**是一种行为型设计模式，它提供一种方法顺序访问一个聚合对象中的各个元素，而又不需要暴露该对象的内部表示。

## 17.1 解决的问题与应用场景

### 17.1.1 问题分析

在软件开发中，我们经常需要遍历集合中的元素。如果直接使用集合的内部结构进行遍历，会带来以下问题：

```java
// 问题1：遍历代码依赖于集合的内部实现
public void printAll(List<String> list) {
    for (int i = 0; i < list.size(); i++) {
        System.out.println(list.get(i));  // 依赖于 List 的随机访问
    }
}

public void printAll(Set<String> set) {
    for (String s : set) {
        System.out.println(s);  // Set 不能使用索引遍历
    }
}

// 如果要同时支持 List 和 Set，需要写不同的遍历代码
```

- **遍历代码与集合耦合**：不同的集合需要不同的遍历方式，客户端代码需要了解集合的内部结构
- **违反开闭原则**：如果要为集合添加新的遍历方式（如逆序遍历、过滤遍历），需要修改集合类
- **无法支持多种遍历**：一个集合同时进行多个遍历时，需要各自维护遍历状态
- **暴露内部表示**：直接访问集合内部结构破坏了封装性

迭代器模式通过将遍历逻辑抽取到独立的迭代器对象中，完美解决上述问题。

### 17.1.2 典型应用场景

**1. 统一不同集合的遍历接口**

```java
// 无论底层是数组、链表还是树，客户端都用统一的方式遍历
Iterator<String> it = collection.iterator();
while (it.hasNext()) {
    String element = it.next();
    // 统一的遍历方式
}
```

**2. 支持多种遍历方式**

```java
// 同一个集合可以有不同的迭代器
List<String> list = Arrays.asList("A", "B", "C");

// 正序遍历
Iterator<String> forward = list.iterator();

// 逆序遍历（ListIterator支持）
ListIterator<String> backward = list.listIterator(list.size());
while (backward.hasPrevious()) {
    backward.previous();
}
```

**3. 惰性求值和大数据遍历**

```java
// 迭代器可以按需生成元素，不必预先加载全部数据
Iterator<Record> it = database.query("SELECT * FROM huge_table");
while (it.hasNext()) {
    Record r = it.next();
    process(r);  // 每次只处理一条记录
}
```

**4. 并行遍历**

```java
// 多个迭代器可以独立遍历同一个集合
Iterator<String> it1 = list.iterator();
Iterator<String> it2 = list.iterator();

// 两个线程独立推进各自的迭代器
executor.submit(() -> { while(it1.hasNext()) process(it1.next()); });
executor.submit(() -> { while(it2.hasNext()) process(it2.next()); });
```

## 17.2 实现原理与UML

### 17.2.1 核心思想

迭代器模式的核心思想是：**将遍历行为从集合中分离出来，封装到独立的迭代器对象中**。

两个关键角色：

1. **Iterable/Aggregate**：提供创建迭代器的工厂方法
2. **Iterator**：维护遍历状态，提供统一的遍历接口

迭代器分为两种类型：
- **外部迭代器**：由客户端控制迭代过程（调用 hasNext/next），更灵活
- **内部迭代器**：由迭代器内部控制，客户端传入回调函数（如 `forEach`）

### 17.2.2 UML类图

```
┌───────────────────┐          ┌─────────────────────┐
│  Aggregate        │          │  Iterator           │
│  (聚合接口)        │          │  (迭代器接口)        │
├───────────────────┤          ├─────────────────────┤
│ + iterator()      │─────────►│ + hasNext(): boolean│
└───────────────────┘          │ + next(): E         │
            │                  │ + remove()          │
            │                  └─────────────────────┘
            │                            ▲
            │                            │
            ▼                            │
┌───────────────────┐          ┌────────┴────────────┐
│ ConcreteAggregate │          │ ConcreteIterator    │
│ (具体聚合类)       │          │ (具体迭代器)        │
├───────────────────┤          ├─────────────────────┤
│ - elements: E[]   │─────────►│ - aggregate ref     │
│ + iterator()      │ 创建      │ - cursor: int      │
└───────────────────┘          │ + hasNext()         │
                               │ + next()            │
                               └─────────────────────┘
```

### 17.2.3 角色分析

| 角色 | 类型 | 职责 | 关键行为 |
|------|------|------|----------|
| **Iterator** | 接口 | 定义遍历操作的接口 | `hasNext()`, `next()`, `remove()` |
| **ConcreteIterator** | 具体类 | 实现具体的遍历逻辑，维护遍历位置 | 持有集合引用和游标 |
| **Aggregate** | 接口 | 定义创建迭代器的接口 | `iterator()` |
| **ConcreteAggregate** | 具体类 | 实现创建迭代器的方法，返回对应的迭代器 | 存储元素集合 |

### 17.2.4 时序图

```
Client          Aggregate         Iterator
  │                 │                │
  │ iterator()      │                │
  │ ──────────────►│                │
  │                 │ 创建迭代器      │
  │                 │ ─────────────►│
  │                 │                │
  │ hasNext()       │                │
  │ ───────────────────────────────►│
  │ true                            │
  │ ◄───────────────────────────────│
  │                                 │
  │ next()                          │
  │ ───────────────────────────────►│
  │ element                         │
  │ ◄───────────────────────────────│
  │                                 │
  │ // 继续遍历...                   │
```

## 17.3 代码实现

### 17.3.1 自定义迭代器接口

```java
/**
 * 自定义迭代器接口
 * @param <E> 元素类型
 */
public interface MyIterator<E> {
    /** 是否还有下一个元素 */
    boolean hasNext();

    /** 返回下一个元素，并将游标后移 */
    E next();

    /** 删除当前元素（可选操作） */
    default void remove() {
        throw new UnsupportedOperationException("remove");
    }
}

/**
 * 可迭代接口 - 提供创建迭代器的工厂方法
 * @param <E> 元素类型
 */
public interface MyIterable<E> {
    /** 创建迭代器 */
    MyIterator<E> iterator();
}
```

### 17.3.2 示例1：自定义 ArrayList 实现

```java
import java.util.Arrays;
import java.util.ConcurrentModificationException;
import java.util.Objects;

/**
 * 自定义 ArrayList - 实现了 Iterable 接口
 * 包含 fail-fast 机制
 */
public class MyArrayList<E> implements MyIterable<E> {
    private static final int DEFAULT_CAPACITY = 10;

    private Object[] elements;
    private int size;
    private int modCount = 0;  // 修改计数器，用于 fail-fast 检测

    public MyArrayList() {
        this.elements = new Object[DEFAULT_CAPACITY];
        this.size = 0;
    }

    public MyArrayList(E... initialElements) {
        this();
        for (E e : initialElements) {
            add(e);
        }
    }

    public void add(E element) {
        ensureCapacity(size + 1);
        elements[size++] = element;
        modCount++;
    }

    @SuppressWarnings("unchecked")
    public E get(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        }
        return (E) elements[index];
    }

    public E set(int index, E element) {
        E old = get(index);
        elements[index] = element;
        return old;
    }

    @SuppressWarnings("unchecked")
    public E remove(int index) {
        Objects.checkIndex(index, size);
        E oldValue = (E) elements[index];
        int numMoved = size - index - 1;
        if (numMoved > 0) {
            System.arraycopy(elements, index + 1, elements, index, numMoved);
        }
        elements[--size] = null;
        modCount++;
        return oldValue;
    }

    public int size() {
        return size;
    }

    public boolean isEmpty() {
        return size == 0;
    }

    private void ensureCapacity(int minCapacity) {
        if (minCapacity > elements.length) {
            int newCapacity = Math.max(elements.length * 2, DEFAULT_CAPACITY);
            elements = Arrays.copyOf(elements, newCapacity);
        }
    }

    @Override
    public MyIterator<E> iterator() {
        return new ArrayListIterator();
    }

    /**
     * 内部类迭代器 - 可以访问外部类的私有字段
     * 实现了 fail-fast 机制
     */
    private class ArrayListIterator implements MyIterator<E> {
        private int cursor = 0;                // 当前游标位置
        private final int expectedModCount = modCount;  // 创建时的 modCount

        @Override
        public boolean hasNext() {
            return cursor < size;
        }

        @Override
        @SuppressWarnings("unchecked")
        public E next() {
            checkForComodification();
            if (!hasNext()) {
                throw new java.util.NoSuchElementException();
            }
            return (E) elements[cursor++];
        }

        @Override
        public void remove() {
            checkForComodification();
            if (cursor <= 0) {
                throw new IllegalStateException(
                    "必须先调用 next() 才能删除");
            }
            MyArrayList.this.remove(--cursor);
            // 注意：remove 后，expectedModCount 需要同步
            // 这里通过反射或重新赋值来绕过，实际实现中会使用
            // 更复杂的方式，这里简化处理
        }

        /**
         * fail-fast 检测：如果在迭代过程中集合被修改，
         * 则抛出 ConcurrentModificationException
         */
        private void checkForComodification() {
            if (modCount != expectedModCount) {
                throw new ConcurrentModificationException(
                    "在迭代过程中集合被修改");
            }
        }
    }

    // 测试代码
    public static void main(String[] args) {
        MyArrayList<String> list = new MyArrayList<>("A", "B", "C", "D", "E");

        System.out.println("===== 正向遍历 =====");
        MyIterator<String> it = list.iterator();
        while (it.hasNext()) {
            System.out.println("元素: " + it.next());
        }

        // 多个迭代器同时遍历
        System.out.println("\n===== 两个迭代器同时遍历 =====");
        MyIterator<String> it1 = list.iterator();
        MyIterator<String> it2 = list.iterator();

        System.out.println("迭代器1: " + it1.next());
        System.out.println("迭代器2: " + it2.next());
        System.out.println("迭代器1: " + it1.next());
        System.out.println("迭代器2: " + it2.next());

        // fail-fast 测试
        System.out.println("\n===== fail-fast 测试 =====");
        try {
            MyIterator<String> it3 = list.iterator();
            list.add("F");  // 在迭代过程中修改集合
            it3.next();     // 抛出 ConcurrentModificationException
        } catch (ConcurrentModificationException e) {
            System.out.println("捕获到异常: " + e.getMessage());
        }
    }
}
```

### 17.3.3 示例2：二叉树迭代器

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.NoSuchElementException;

/**
 * 二叉树节点
 */
class TreeNode<E> {
    E value;
    TreeNode<E> left;
    TreeNode<E> right;

    TreeNode(E value) {
        this.value = value;
    }

    TreeNode(E value, TreeNode<E> left, TreeNode<E> right) {
        this.value = value;
        this.left = left;
        this.right = right;
    }
}

/**
 * 二叉树 - 支持多种遍历方式的迭代器
 */
public class BinaryTree<E> implements MyIterable<E> {
    private final TreeNode<E> root;

    public BinaryTree(TreeNode<E> root) {
        this.root = root;
    }

    @Override
    public MyIterator<E> iterator() {
        return new InOrderIterator();  // 默认中序遍历
    }

    /** 获取前序遍历迭代器 */
    public MyIterator<E> preOrderIterator() {
        return new PreOrderIterator();
    }

    /** 获取中序遍历迭代器 */
    public MyIterator<E> inOrderIterator() {
        return new InOrderIterator();
    }

    /** 获取后序遍历迭代器 */
    public MyIterator<E> postOrderIterator() {
        return new PostOrderIterator();
    }

    /**
     * 前序遍历迭代器：根 -> 左 -> 右
     */
    private class PreOrderIterator implements MyIterator<E> {
        private final Deque<TreeNode<E>> stack = new ArrayDeque<>();

        PreOrderIterator() {
            if (root != null) {
                stack.push(root);
            }
        }

        @Override
        public boolean hasNext() {
            return !stack.isEmpty();
        }

        @Override
        public E next() {
            if (!hasNext()) {
                throw new NoSuchElementException();
            }
            TreeNode<E> node = stack.pop();

            // 先压右子节点，再压左子节点（栈是LIFO，左子节点先出栈）
            if (node.right != null) {
                stack.push(node.right);
            }
            if (node.left != null) {
                stack.push(node.left);
            }

            return node.value;
        }
    }

    /**
     * 中序遍历迭代器：左 -> 根 -> 右
     */
    private class InOrderIterator implements MyIterator<E> {
        private final Deque<TreeNode<E>> stack = new ArrayDeque<>();
        private TreeNode<E> current = root;

        @Override
        public boolean hasNext() {
            return current != null || !stack.isEmpty();
        }

        @Override
        public E next() {
            if (!hasNext()) {
                throw new NoSuchElementException();
            }

            // 走到最左边
            while (current != null) {
                stack.push(current);
                current = current.left;
            }

            TreeNode<E> node = stack.pop();
            current = node.right;  // 转向右子树
            return node.value;
        }
    }

    /**
     * 后序遍历迭代器：左 -> 右 -> 根
     * 使用两个栈实现
     */
    private class PostOrderIterator implements MyIterator<E> {
        private final Deque<TreeNode<E>> stack1 = new ArrayDeque<>();
        private final Deque<TreeNode<E>> stack2 = new ArrayDeque<>();

        PostOrderIterator() {
            if (root != null) {
                stack1.push(root);
                while (!stack1.isEmpty()) {
                    TreeNode<E> node = stack1.pop();
                    stack2.push(node);
                    if (node.left != null) {
                        stack1.push(node.left);
                    }
                    if (node.right != null) {
                        stack1.push(node.right);
                    }
                }
            }
        }

        @Override
        public boolean hasNext() {
            return !stack2.isEmpty();
        }

        @Override
        public E next() {
            if (!hasNext()) {
                throw new NoSuchElementException();
            }
            return stack2.pop().value;
        }
    }

    // 测试代码
    public static void main(String[] args) {
        /*
         * 构建二叉树：
         *        F
         *      /   \
         *     B     G
         *    / \     \
         *   A   D     I
         *      / \   /
         *     C   E H
         */
        TreeNode<String> root = new TreeNode<>("F",
            new TreeNode<>("B",
                new TreeNode<>("A"),
                new TreeNode<>("D",
                    new TreeNode<>("C"),
                    new TreeNode<>("E")
                )
            ),
            new TreeNode<>("G",
                null,
                new TreeNode<>("I",
                    new TreeNode<>("H"),
                    null
                )
            )
        );

        BinaryTree<String> tree = new BinaryTree<>(root);

        System.out.println("前序遍历: ");
        MyIterator<String> preIt = tree.preOrderIterator();
        while (preIt.hasNext()) {
            System.out.print(preIt.next() + " ");
        }
        // 预期: F B A D C E G I H

        System.out.println("\n\n中序遍历: ");
        MyIterator<String> inIt = tree.inOrderIterator();
        while (inIt.hasNext()) {
            System.out.print(inIt.next() + " ");
        }
        // 预期: A B C D E F G H I

        System.out.println("\n\n后序遍历: ");
        MyIterator<String> postIt = tree.postOrderIterator();
        while (postIt.hasNext()) {
            System.out.print(postIt.next() + " ");
        }
        // 预期: A C E D B H I G F
        System.out.println();
    }
}
```

### 17.3.4 示例3：分页迭代器

```java
import java.sql.*;
import java.util.*;

/**
 * 数据库分页迭代器 - 逐页查询，避免一次性加载大量数据
 * 适用于分页查询结果集的遍历
 */
public class PaginationIterator<E> implements MyIterator<E> {
    private static final int DEFAULT_PAGE_SIZE = 1000;

    private final PaginationQuery<E> query;
    private final int pageSize;

    private int currentPage = 0;
    private List<E> currentPageData;
    private int cursorInPage = 0;
    private boolean hasMore = true;

    /**
     * @param query    分页查询接口
     * @param pageSize 每页大小
     */
    public PaginationIterator(PaginationQuery<E> query, int pageSize) {
        this.query = query;
        this.pageSize = pageSize;
        loadNextPage();
    }

    public PaginationIterator(PaginationQuery<E> query) {
        this(query, DEFAULT_PAGE_SIZE);
    }

    @Override
    public boolean hasNext() {
        // 当前页还有数据
        if (currentPageData != null && cursorInPage < currentPageData.size()) {
            return true;
        }
        // 当前页耗尽，尝试加载下一页
        if (hasMore) {
            loadNextPage();
            return currentPageData != null && !currentPageData.isEmpty();
        }
        return false;
    }

    @Override
    public E next() {
        if (!hasNext()) {
            throw new NoSuchElementException();
        }
        return currentPageData.get(cursorInPage++);
    }

    private void loadNextPage() {
        currentPage++;
        currentPageData = query.fetchPage(currentPage, pageSize);
        cursorInPage = 0;

        // 如果返回的数据小于页大小，说明没有更多数据
        if (currentPageData.size() < pageSize) {
            hasMore = false;
        }
    }

    /**
     * 分页查询接口
     */
    @FunctionalInterface
    public interface PaginationQuery<E> {
        /** 获取指定页的数据 */
        List<E> fetchPage(int page, int pageSize);
    }

    // 使用示例
    public static void main(String[] args) {
        // 模拟数据库查询
        List<String> allData = new ArrayList<>();
        for (int i = 0; i < 10000; i++) {
            allData.add("Record-" + i);
        }

        PaginationIterator<String> it = new PaginationIterator<>(
            (page, pageSize) -> {
                int fromIndex = (page - 1) * pageSize;
                int toIndex = Math.min(fromIndex + pageSize, allData.size());
                if (fromIndex >= allData.size()) {
                    return Collections.emptyList();
                }
                System.out.println("加载第" + page + "页数据 (" +
                    (toIndex - fromIndex) + "条)");
                return allData.subList(fromIndex, toIndex);
            },
            100  // 每页100条
        );

        // 遍历前5条数据
        int count = 0;
        while (it.hasNext() && count < 5) {
            System.out.println("处理: " + it.next());
            count++;
        }
    }
}
```

### 17.3.5 示例4：过滤迭代器

```java
import java.util.function.Predicate;

/**
 * 过滤迭代器 - 装饰另一个迭代器，只返回匹配条件的元素
 * 这是迭代器模式和装饰器模式的结合
 */
public class FilteringIterator<E> implements MyIterator<E> {
    private final MyIterator<E> source;
    private final Predicate<E> predicate;
    private E nextElement;
    private boolean hasNextCached = false;

    /**
     * @param source    源迭代器
     * @param predicate 过滤条件
     */
    public FilteringIterator(MyIterator<E> source, Predicate<E> predicate) {
        this.source = source;
        this.predicate = predicate;
    }

    @Override
    public boolean hasNext() {
        if (hasNextCached) {
            return true;
        }
        // 预读下一个匹配的元素
        while (source.hasNext()) {
            E element = source.next();
            if (predicate.test(element)) {
                nextElement = element;
                hasNextCached = true;
                return true;
            }
        }
        return false;
    }

    @Override
    public E next() {
        if (!hasNext()) {
            throw new NoSuchElementException();
        }
        hasNextCached = false;
        return nextElement;
    }

    // 使用示例
    public static void main(String[] args) {
        MyArrayList<Integer> numbers = new MyArrayList<>(
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

        // 过滤出所有偶数
        FilteringIterator<Integer> evenIt = new FilteringIterator<>(
            numbers.iterator(),
            n -> n % 2 == 0
        );

        System.out.println("偶数: ");
        while (evenIt.hasNext()) {
            System.out.print(evenIt.next() + " ");
        }
        // 输出: 2 4 6 8 10

        System.out.println("\n\n大于5的数: ");
        FilteringIterator<Integer> gt5It = new FilteringIterator<>(
            numbers.iterator(),
            n -> n > 5
        );
        while (gt5It.hasNext()) {
            System.out.print(gt5It.next() + " ");
        }
        // 输出: 6 7 8 9 10
    }
}
```

### 17.3.6 使用 for-each 循环

Java 的 `for-each` 循环本质上是迭代器模式的语法糖。

```java
/**
 * 实现 java.lang.Iterable 接口以支持 for-each 循环
 */
public class MyArrayListWithForeach<E> implements Iterable<E> {
    private Object[] elements;
    private int size;

    // ... 其他方法同 MyArrayList ...

    @Override
    public java.util.Iterator<E> iterator() {
        return new java.util.Iterator<E>() {
            private int cursor = 0;

            @Override
            public boolean hasNext() {
                return cursor < size;
            }

            @Override
            @SuppressWarnings("unchecked")
            public E next() {
                if (!hasNext()) {
                    throw new java.util.NoSuchElementException();
                }
                return (E) elements[cursor++];
            }
        };
    }

    // 使用示例
    public static void main(String[] args) {
        // 使用 for-each 循环（语法糖）
        java.util.List<String> list = java.util.Arrays.asList("A", "B", "C");

        // 这段代码：
        for (String s : list) {
            System.out.println(s);
        }

        // 编译后等价于：
        java.util.Iterator<String> it = list.iterator();
        while (it.hasNext()) {
            String s = it.next();
            System.out.println(s);
        }
    }
}
```

## 17.4 JDK/框架源码解析

### 17.4.1 java.util.Iterator 和 java.lang.Iterable

```java
/**
 * java.lang.Iterable 接口 - 可使对象支持 for-each 循环
 */
public interface Iterable<T> {
    /** 返回迭代器 */
    Iterator<T> iterator();

    /** Java 8 新增：默认的 forEach 实现，内部迭代 */
    default void forEach(Consumer<? super T> action) {
        Objects.requireNonNull(action);
        for (T t : this) {
            action.accept(t);
        }
    }

    /** Java 8 新增：返回 Spliterator */
    default Spliterator<T> spliterator() {
        return Spliterators.spliteratorUnknownSize(iterator(), 0);
    }
}

/**
 * java.util.Iterator 接口
 */
public interface Iterator<E> {
    boolean hasNext();
    E next();

    /** 删除当前元素（可选操作） */
    default void remove() {
        throw new UnsupportedOperationException("remove");
    }

    /** Java 8 新增：对剩余元素执行操作 */
    default void forEachRemaining(Consumer<? super E> action) {
        Objects.requireNonNull(action);
        while (hasNext()) {
            action.accept(next());
        }
    }
}
```

### 17.4.2 ArrayList.Itr 内部类源码分析

```java
/**
 * java.util.ArrayList 中的迭代器实现
 * 私有内部类，可以访问 ArrayList 的私有字段
 */
public class ArrayList<E> {
    private transient Object[] elementData;
    private int size;
    protected transient int modCount = 0;

    public Iterator<E> iterator() {
        return new Itr();
    }

    /**
     * ArrayList 的迭代器实现
     * 这是一个内部类迭代器的经典示例
     */
    private class Itr implements Iterator<E> {
        int cursor;           // 下一个要返回的元素的索引
        int lastRet = -1;     // 上一个返回的元素的索引（-1 表示没有）
        int expectedModCount = modCount;  // 用于 fail-fast 检测

        Itr() {}

        @Override
        public boolean hasNext() {
            return cursor != size;
        }

        @Override
        @SuppressWarnings("unchecked")
        public E next() {
            checkForComodification();
            int i = cursor;
            if (i >= size) {
                throw new NoSuchElementException();
            }
            Object[] elementData = ArrayList.this.elementData;
            if (i >= elementData.length) {
                throw new ConcurrentModificationException();
            }
            cursor = i + 1;
            lastRet = i;  // 记录当前返回的位置，供 remove 使用
            return (E) elementData[i];
        }

        @Override
        public void remove() {
            if (lastRet < 0) {
                throw new IllegalStateException();
            }
            checkForComodification();

            try {
                // 调用外部类的 remove 方法
                ArrayList.this.remove(lastRet);
                cursor = lastRet;       // 游标回退
                lastRet = -1;
                expectedModCount = modCount;  // 同步修改计数
            } catch (IndexOutOfBoundsException ex) {
                throw new ConcurrentModificationException();
            }
        }

        @Override
        @SuppressWarnings("unchecked")
        public void forEachRemaining(Consumer<? super E> action) {
            Objects.requireNonNull(action);
            final int size = ArrayList.this.size;
            int i = cursor;
            if (i >= size) {
                return;
            }
            final Object[] es = elementData;
            if (i >= es.length) {
                throw new ConcurrentModificationException();
            }
            while (i < size && modCount == expectedModCount) {
                action.accept((E) es[i++]);
            }
            cursor = i;
            lastRet = i - 1;
            checkForComodification();
        }

        final void checkForComodification() {
            if (modCount != expectedModCount) {
                throw new ConcurrentModificationException();
            }
        }
    }
}

/**
 * fail-fast 机制分析：
 *
 * 1. 创建迭代器时，保存 expectedModCount = modCount
 * 2. 每次调用 next() 时检查 modCount == expectedModCount
 * 3. 如果集合在迭代过程中被修改（如调用 add/remove），modCount 增加
 * 4. 检测到不一致时抛出 ConcurrentModificationException
 *
 * 注意：fail-fast 行为是尽力而为的，不能保证在所有并发场景下都生效
 */
```

### 17.4.3 HashMap 的迭代器

```java
/**
 * HashMap的迭代器 - 遍历所有键值对
 * HashMap内部使用数组 + 链表/红黑树存储，迭代器封装了遍历细节
 */
public class HashMap<K, V> {
    transient Node<K, V>[] table;

    // 内部节点类
    static class Node<K, V> {
        final int hash;
        final K key;
        V value;
        Node<K, V> next;
    }

    /**
     * HashMap 的核心迭代器抽象类
     * 遍历底层数组 + 链表结构
     */
    abstract class HashIterator {
        Node<K, V> next;       // 下一个要返回的节点
        Node<K, V> current;    // 当前节点
        int expectedModCount;  // fail-fast 检测
        int index;             // 数组索引

        HashIterator() {
            expectedModCount = modCount;
            Node<K, V>[] t = table;
            current = next = null;
            index = 0;
            // 找到第一个非空桶
            if (t != null) {
                advanceToNextNonEmptyBucket();
            }
        }

        /** 前进到下一个非空桶的第一个节点 */
        final void advanceToNextNonEmptyBucket() {
            Node<K, V>[] t = table;
            while (next == null && index < t.length) {
                next = t[index++];  // 跳到下一个非空桶
            }
        }

        public final boolean hasNext() {
            return next != null;
        }

        /** 获取下一个节点 */
        final Node<K, V> nextNode() {
            Node<K, V>[] t = table;
            Node<K, V> e = next;
            if (e == null) {
                throw new NoSuchElementException();
            }
            // 在同一桶的链表中前进
            if ((next = (current = e).next) == null && t != null) {
                advanceToNextNonEmptyBucket();
            }
            return e;
        }
    }

    /**
     * HashMap 的迭代器遍历过程：
     *
     * table: [null, Node(K1,V1)->Node(K2,V2), null, Node(K3,V3), null]
     *         index:0     index:1              index:2  index:3    index:4
     *
     * 遍历顺序: K1 -> K2 -> K3
     * 先遍历数组，在每个非空桶中遍历链表
     */

    /**
     * KeySet 的迭代器
     * 注意：HashMap 不保证遍历顺序（Java 8+ 后保持稳定）
     * 而 LinkedHashMap 则保证按插入顺序或访问顺序遍历
     */
    final class KeyIterator extends HashIterator implements Iterator<K> {
        public final K next() { return nextNode().key; }
    }

    final class ValueIterator extends HashIterator implements Iterator<V> {
        public final V next() { return nextNode().value; }
    }

    final class EntryIterator extends HashIterator implements Iterator<Map.Entry<K, V>> {
        public final Map.Entry<K, V> next() { return nextNode(); }
    }
}
```

### 17.4.4 CopyOnWriteArrayList 的 COWIterator

```java
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * CopyOnWriteArrayList - 线程安全的 ArrayList 变体
 * 它的迭代器是 fail-safe 的（不会抛出 ConcurrentModificationException）
 */
public class CopyOnWriteArrayListExample {

    /**
     * COWIterator 源码分析
     *
     * 核心原理：迭代器在创建时获取底层数组的"快照"
     * 后续的迭代操作都在这个快照上进行
     * 即使其他线程修改了集合，迭代器也不受影响
     */
    static class COWIterator<E> implements java.util.ListIterator<E> {
        /** 快照：迭代器创建时的数组 */
        private final Object[] snapshot;
        /** 当前游标位置 */
        private int cursor;

        COWIterator(Object[] snapshot, int cursor) {
            this.snapshot = snapshot;
            this.cursor = cursor;
        }

        @Override
        public boolean hasNext() {
            return cursor < snapshot.length;
        }

        @Override
        @SuppressWarnings("unchecked")
        public E next() {
            if (!hasNext()) {
                throw new NoSuchElementException();
            }
            return (E) snapshot[cursor++];
        }

        // COWIterator 不支持 remove
        @Override
        public void remove() {
            throw new UnsupportedOperationException("快照迭代器不支持修改");
        }
    }

    public static void main(String[] args) {
        CopyOnWriteArrayList<String> list = new CopyOnWriteArrayList<>();
        list.add("A");
        list.add("B");
        list.add("C");

        // 创建迭代器（此时获取快照）
        java.util.Iterator<String> it = list.iterator();

        // 其他线程修改集合
        list.add("D");
        list.remove("A");

        // 迭代器仍然按旧快照遍历
        System.out.println("迭代器（快照）: ");
        while (it.hasNext()) {
            System.out.print(it.next() + " ");  // 输出: A B C（不是 B C D）
        }

        System.out.println("\n当前集合: ");
        for (String s : list) {
            System.out.print(s + " ");  // 输出: B C D
        }
    }
}

/**
 * fail-fast vs fail-safe 对比：
 *
 *              fail-fast (ArrayList)      fail-safe (CopyOnWriteArrayList)
 * ───────────  ───────────────────────    ─────────────────────────────────
 * 实现原理      迭代时检查 modCount         迭代器持有快照
 * 并发修改     抛出 ConcurrentModificationException  不会抛出异常
 * 内存占用      低                          高（需要复制数组）
 * 数据一致性    强一致性（反映最新状态）        弱一致性（可能读到旧数据）
 * 性能          高                          写入时性能差（数组复制）
 * 适用场景      单线程或同步的集合             读多写少的并发场景
 */
```

### 17.4.5 ListIterator — 双向迭代器

```java
import java.util.ListIterator;

/**
 * java.util.ListIterator - 支持双向遍历的迭代器
 */
public class ListIteratorExample {
    public static void main(String[] args) {
        java.util.List<String> list = java.util.Arrays.asList(
            "A", "B", "C", "D", "E");

        // 正向遍历
        System.out.println("=== 正向遍历 ===");
        ListIterator<String> forward = list.listIterator();
        while (forward.hasNext()) {
            int idx = forward.nextIndex();
            String val = forward.next();
            System.out.println("[" + idx + "] = " + val);
        }

        // 反向遍历
        System.out.println("\n=== 反向遍历 ===");
        ListIterator<String> backward = list.listIterator(list.size());
        while (backward.hasPrevious()) {
            int idx = backward.previousIndex();
            String val = backward.previous();
            System.out.println("[" + idx + "] = " + val);
        }

        // 在迭代过程中修改
        System.out.println("\n=== 迭代中修改 ===");
        ListIterator<String> modifier = list.listIterator();
        while (modifier.hasNext()) {
            String val = modifier.next();
            if ("C".equals(val)) {
                modifier.set("X");  // 替换当前元素
            }
        }
        System.out.println("修改后: " + list);  // [A, B, X, D, E]
    }
}
```

### 17.4.6 Spliterator — 可拆分迭代器

```java
import java.util.Spliterator;
import java.util.stream.StreamSupport;

/**
 * Spliterator（可拆分迭代器）- Java 8 引入
 * 支持并行遍历，是 Stream API 的底层基础
 */
public class SpliteratorExample {

    /**
     * 自定义 Spliterator - 遍历数组
     */
    static class ArraySpliterator<T> implements Spliterator<T> {
        private final T[] array;
        private int start;   // 包含
        private int end;     // 不包含

        ArraySpliterator(T[] array, int start, int end) {
            this.array = array;
            this.start = start;
            this.end = end;
        }

        @Override
        public boolean tryAdvance(java.util.function.Consumer<? super T> action) {
            if (start < end) {
                action.accept(array[start++]);
                return true;
            }
            return false;
        }

        @Override
        public Spliterator<T> trySplit() {
            int middle = (start + end) >>> 1;
            if (middle == start) {
                return null;  // 不可再拆分
            }
            // 拆分前一半给新的 Spliterator
            Spliterator<T> newSpliterator = new ArraySpliterator<>(array, start, middle);
            start = middle;  // 当前 Spliterator 处理后一半
            return newSpliterator;
        }

        @Override
        public long estimateSize() {
            return end - start;
        }

        @Override
        public int characteristics() {
            return ORDERED | SIZED | SUBSIZED | NONNULL;
        }
    }

    public static void main(String[] args) {
        Integer[] numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

        // 使用自定义 Spliterator 创建并行流
        Spliterator<Integer> spliterator = new ArraySpliterator<>(numbers, 0, numbers.length);

        System.out.println("并行处理: ");
        StreamSupport.stream(spliterator, true)
            .forEach(n -> System.out.println(Thread.currentThread().getName()
                + " 处理: " + n));
    }
}

/**
 * Spliterator 特性（characteristics）：
 *
 * ORDERED    - 元素有顺序
 * DISTINCT   - 元素不重复
 * SORTED     - 元素已排序
 * SIZED      - estimateSize 返回精确值
 * NONNULL    - 元素不为 null
 * IMMUTABLE  - 数据源不可变
 * CONCURRENT - 数据源可被并发修改
 * SUBSIZED   - trySplit 后的 Spliterator 也是 SIZED
 */
```

## 17.5 使用场景与案例

### 17.5.1 文件系统目录遍历

```java
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;

/**
 * 文件系统遍历器 - 使用迭代器模式遍历目录树
 */
public class FileSystemIterator implements Iterator<Path> {
    private final Deque<Iterator<Path>> stack = new ArrayDeque<>();
    private Path nextPath = null;

    public FileSystemIterator(Path rootDir) throws IOException {
        stack.push(Files.list(rootDir).iterator());
        advanceToNextFile();
    }

    @Override
    public boolean hasNext() {
        return nextPath != null;
    }

    @Override
    public Path next() {
        if (!hasNext()) {
            throw new NoSuchElementException();
        }
        Path current = nextPath;
        advanceToNextFile();
        return current;
    }

    private void advanceToNextFile() {
        nextPath = null;

        while (!stack.isEmpty()) {
            Iterator<Path> currentDir = stack.peek();

            if (!currentDir.hasNext()) {
                stack.pop();  // 当前目录遍历完毕，返回父目录
                continue;
            }

            Path candidate = currentDir.next();
            if (Files.isDirectory(candidate)) {
                // 遇到子目录，压入栈
                try {
                    stack.push(Files.list(candidate).iterator());
                } catch (IOException e) {
                    continue;  // 跳过无法访问的目录
                }
                // 深度优先，递归访问子目录
                continue;
            }

            // 找到文件
            nextPath = candidate;
            break;
        }
    }

    // 使用示例
    public static void main(String[] args) throws IOException {
        Path startDir = Paths.get(".");
        System.out.println("遍历目录: " + startDir.toAbsolutePath());

        // 使用迭代器遍历文件系统
        // Iterator<Path> it = new FileSystemIterator(startDir);
        // int count = 0;
        // while (it.hasNext() && count < 20) {
        //     System.out.println(it.next());
        //     count++;
        // }

        // Java 8 的 Files.walk 本质也是迭代器模式
        System.out.println("\n使用 Files.walk（Java 8）:");
        try (Stream<Path> stream = Files.walk(startDir).limit(10)) {
            stream.forEach(System.out::println);
        }
    }
}
```

### 17.5.2 数据库 ResultSet 游标迭代

```java
import java.sql.*;

/**
 * JDBC ResultSet 的迭代器适配
 * ResultSet 本身就实现了类似迭代器的游标机制
 */
public class ResultSetIterator<T> implements Iterator<T>, AutoCloseable {
    private final ResultSet resultSet;
    private final RowMapper<T> rowMapper;
    private boolean hasNext;
    private boolean moved = false;

    public ResultSetIterator(ResultSet resultSet, RowMapper<T> rowMapper) {
        this.resultSet = resultSet;
        this.rowMapper = rowMapper;
    }

    @Override
    public boolean hasNext() {
        if (!moved) {
            try {
                hasNext = resultSet.next();
                moved = true;
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
        return hasNext;
    }

    @Override
    public T next() {
        if (!hasNext()) {
            throw new NoSuchElementException();
        }
        try {
            T result = rowMapper.mapRow(resultSet);
            moved = false;  // 准备下一次移动
            return result;
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public void close() throws Exception {
        resultSet.close();
    }

    @FunctionalInterface
    public interface RowMapper<T> {
        T mapRow(ResultSet rs) throws SQLException;
    }

    // 使用示例
    public static void main(String[] args) throws SQLException {
        // 示例：将 ResultSet 包装为迭代器
        // try (Connection conn = getConnection();
        //      PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users");
        //      ResultSet rs = stmt.executeQuery()) {
        //
        //     ResultSetIterator<User> it = new ResultSetIterator<>(rs, row -> {
        //         User user = new User();
        //         user.setId(row.getLong("id"));
        //         user.setName(row.getString("name"));
        //         return user;
        //     });
        //
        //     while (it.hasNext()) {
        //         User user = it.next();
        //         System.out.println(user);
        //     }
        // }
        System.out.println("ResultSetIterator 示例 - 将 ResultSet 适配为迭代器");
    }
}
```

### 17.5.3 惰性数据管道

```java
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.function.Function;

/**
 * 惰性数据管道 - 使用迭代器实现流式数据处理
 * 一次只处理一行，不将整个文件加载到内存
 */
public class LazyDataPipeline<T> implements Iterable<T> {
    private final Iterator<T> iterator;

    private LazyDataPipeline(Iterator<T> iterator) {
        this.iterator = iterator;
    }

    @Override
    public Iterator<T> iterator() {
        return iterator;
    }

    /**
     * 从文件创建行迭代器
     */
    public static LazyDataPipeline<String> fromFile(Path filePath) throws IOException {
        BufferedReader reader = Files.newBufferedReader(filePath);
        return new LazyDataPipeline<>(new Iterator<>() {
            private String nextLine;

            {
                advance();
            }

            private void advance() {
                try {
                    nextLine = reader.readLine();
                    if (nextLine == null) {
                        reader.close();
                    }
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }

            @Override
            public boolean hasNext() {
                return nextLine != null;
            }

            @Override
            public String next() {
                String line = nextLine;
                advance();
                return line;
            }
        });
    }

    /**
     * 转换操作 - 生成新的管道
     */
    public <R> LazyDataPipeline<R> map(Function<T, R> mapper) {
        Iterator<T> source = this.iterator;
        return new LazyDataPipeline<>(new Iterator<>() {
            @Override
            public boolean hasNext() {
                return source.hasNext();
            }

            @Override
            public R next() {
                return mapper.apply(source.next());
            }
        });
    }

    /**
     * 过滤操作
     */
    public LazyDataPipeline<T> filter(java.util.function.Predicate<T> predicate) {
        Iterator<T> source = this.iterator;
        return new LazyDataPipeline<>(new Iterator<>() {
            private T nextElement;
            private boolean hasCached = false;

            @Override
            public boolean hasNext() {
                if (hasCached) return true;
                while (source.hasNext()) {
                    T elem = source.next();
                    if (predicate.test(elem)) {
                        nextElement = elem;
                        hasCached = true;
                        return true;
                    }
                }
                return false;
            }

            @Override
            public T next() {
                if (!hasNext()) throw new NoSuchElementException();
                hasCached = false;
                return nextElement;
            }
        });
    }

    public void forEach(java.util.function.Consumer<T> action) {
        iterator.forEachRemaining(action);
    }

    // 使用示例
    public static void main(String[] args) throws IOException {
        System.out.println("惰性数据管道 - 模拟大数据处理");

        // 模拟大数据集（实际场景中可能是数百万行的大文件）
        List<String> simulatedData = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            simulatedData.add("Line-" + i + "," +
                (i % 2 == 0 ? "EVEN" : "ODD") + "," +
                "data-" + i);
        }

        // 模拟管道处理（实际中 fromFile 读取文件）
        LazyDataPipeline<String> pipeline = new LazyDataPipeline<>(simulatedData.iterator());

        System.out.println("惰性处理（只处理前5条偶数行）:");
        pipeline
            .filter(line -> line.contains("EVEN"))     // 只处理偶数行
            .map(line -> line.split(",")[0])            // 只取第一部分
            .forEach(line -> System.out.println(line)); // 处理

        // 关键：所有操作都是惰性的，只在 forEach 时真正执行
    }
}
```

## 17.6 潜在风险与问题

### 17.6.1 ConcurrentModificationException（fail-fast）

```java
/**
 * fail-fast 导致的问题
 */
public class FailFastProblem {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>(Arrays.asList("A", "B", "C", "D"));

        // 问题：迭代中修改集合
        try {
            for (String s : list) {
                if ("B".equals(s)) {
                    list.remove(s);  // 抛出 ConcurrentModificationException!
                }
            }
        } catch (ConcurrentModificationException e) {
            System.out.println("错误: 迭代中不能修改集合");
        }

        // 正确做法1：使用 Iterator 的 remove 方法
        Iterator<String> it = list.iterator();
        while (it.hasNext()) {
            String s = it.next();
            if ("C".equals(s)) {
                it.remove();  // 正确：使用迭代器的 remove
            }
        }
        System.out.println("使用 it.remove() 后: " + list);

        // 正确做法2：收集后统一删除
        List<String> toRemove = new ArrayList<>();
        for (String s : list) {
            if ("D".equals(s)) {
                toRemove.add(s);
            }
        }
        list.removeAll(toRemove);

        // 正确做法3：使用 Java 8 removeIf
        list.removeIf(s -> "A".equals(s));

        // 正确做法4：使用 CopyOnWriteArrayList（fail-safe）
        List<String> safeList = new CopyOnWriteArrayList<>(Arrays.asList("X", "Y", "Z"));
        for (String s : safeList) {
            if ("Y".equals(s)) {
                safeList.remove(s);  // 不会抛出异常
            }
        }
        System.out.println("CopyOnWriteArrayList 修改后: " + safeList);
    }
}
```

### 17.6.2 迭代器资源泄漏

```java
/**
 * 迭代器资源泄漏问题
 * 当迭代器持有文件句柄、数据库连接等资源时，必须确保被正确关闭
 */
public class IteratorResourceLeak {
    public static void main(String[] args) {
        // 问题：迭代器持有资源，提前退出时资源无法释放
        // Iterator<String> it = new FileLineIterator("huge.log");
        // int count = 0;
        // while (it.hasNext() && count < 10) {  // 只处理前10行就退出了
        //     System.out.println(it.next());
        //     count++;
        // }
        // // 文件句柄未关闭！资源泄漏！

        // 解决方案1：实现 AutoCloseable
        // try (FileLineIterator it = new FileLineIterator("huge.log")) {
        //     int count = 0;
        //     while (it.hasNext() && count < 10) {
        //         System.out.println(it.next());
        //         count++;
        //     }
        // } // 自动关闭

        // 解决方案2：使用 try-finally
        // FileLineIterator it = null;
        // try {
        //     it = new FileLineIterator("huge.log");
        //     // ... 使用
        // } finally {
        //     if (it != null) it.close();
        // }
    }
}
```

### 17.6.3 remove() 方法的不一致性

```java
/**
 * remove() 在不同实现中的行为差异
 */
public class RemoveInconsistency {
    public static void main(String[] args) {
        // ArrayList: 支持 remove
        List<String> arrayList = new ArrayList<>(Arrays.asList("A", "B", "C"));
        Iterator<String> it1 = arrayList.iterator();
        it1.next();
        it1.remove();  // OK：ArrayList 支持

        // 不可变集合: 不支持 remove
        List<String> immutableList = List.of("A", "B", "C");
        Iterator<String> it2 = immutableList.iterator();
        it2.next();
        try {
            it2.remove();  // 抛出 UnsupportedOperationException!
        } catch (UnsupportedOperationException e) {
            System.out.println("不可变集合不支持 remove");
        }

        // CopyOnWriteArrayList: 不支持 remove
        CopyOnWriteArrayList<String> cowList = new CopyOnWriteArrayList<>("A", "B", "C");
        Iterator<String> it3 = cowList.iterator();
        it3.next();
        try {
            it3.remove();  // 抛出 UnsupportedOperationException!
        } catch (UnsupportedOperationException e) {
            System.out.println("COWIterator 不支持 remove");
        }
    }
}
```

### 17.6.4 重复创建迭代器的性能问题

```java
/**
 * 频繁创建迭代器的性能开销
 */
public class IteratorCreationOverhead {
    public static void main(String[] args) {
        List<Integer> list = new ArrayList<>();
        for (int i = 0; i < 10000; i++) {
            list.add(i);
        }

        // 低效：每次循环都创建新的迭代器
        long start1 = System.nanoTime();
        for (int i = 0; i < 1000; i++) {
            Iterator<Integer> it = list.iterator();
            while (it.hasNext()) {
                it.next();
            }
        }
        long end1 = System.nanoTime();
        System.out.println("重复创建迭代器: " + (end1 - start1) / 1_000_000 + "ms");

        // 优化：直接使用 for-each
        long start2 = System.nanoTime();
        for (int i = 0; i < 1000; i++) {
            for (Integer val : list) {
                // 遍历
            }
        }
        long end2 = System.nanoTime();
        System.out.println("for-each: " + (end2 - start2) / 1_000_000 + "ms");
    }
}
```

## 17.7 优化策略

### 17.7.1 实现 Iterable 接口

始终为自定义集合实现 `Iterable` 接口，以便支持 for-each 循环和 Stream API。

```java
public class OptimizedCollection<E> implements Iterable<E> {
    @Override
    public Iterator<E> iterator() {
        return new OptimizedIterator();
    }

    /**
     * Java 8 默认方法：forEach
     * 如果集合有更高效的遍历方式，可以覆盖默认实现
     */
    @Override
    public void forEach(Consumer<? super E> action) {
        // 自定义高效的内部迭代
        for (int i = 0; i < size; i++) {
            action.accept(get(i));
        }
    }

    /**
     * Java 8 默认方法：spliterator
     * 覆盖以提供并行流支持
     */
    @Override
    public Spliterator<E> spliterator() {
        return Spliterators.spliterator(
            iterator(), size, Spliterator.ORDERED);
    }
}
```

### 17.7.2 使用 Stream API 替代迭代器

```java
/**
 * Java 8 Stream API 是迭代器模式的现代替代方案
 * 提供声明式 + 惰性求值 + 并行处理的优势
 */
public class StreamVsIterator {
    public static void main(String[] args) {
        List<String> items = Arrays.asList("apple", "banana", "cherry", "date");

        // 传统的迭代器方式
        System.out.println("=== 迭代器方式 ===");
        Iterator<String> it = items.iterator();
        List<String> result1 = new ArrayList<>();
        while (it.hasNext()) {
            String s = it.next();
            if (s.startsWith("a") || s.startsWith("b")) {
                result1.add(s.toUpperCase());
            }
        }
        System.out.println(result1);

        // Stream API 方式（更简洁、更可读）
        System.out.println("\n=== Stream 方式 ===");
        List<String> result2 = items.stream()
            .filter(s -> s.startsWith("a") || s.startsWith("b"))
            .map(String::toUpperCase)
            .collect(Collectors.toList());
        System.out.println(result2);

        // Stream 的优势：惰性求值
        System.out.println("\n=== 惰性求值 ===");
        items.stream()
            .peek(s -> System.out.println("处理: " + s))  // 调试用
            .filter(s -> {
                System.out.println("  过滤: " + s);
                return s.length() > 4;
            })
            .map(s -> {
                System.out.println("  转换: " + s);
                return s.toUpperCase();
            })
            .findFirst()  // 只处理到找到第一个匹配
            .ifPresent(System.out::println);
        // 注意：并不会处理所有元素，找到第一个后就停止
    }
}
```

### 17.7.3 使用 Spliterator 支持并行

```java
/**
 * Spliterator 实现并行遍历
 */
public class ParallelIteratorExample {
    public static void main(String[] args) {
        List<Integer> numbers = new ArrayList<>();
        for (int i = 0; i < 1_000_000; i++) {
            numbers.add(i);
        }

        // 串行处理
        long start1 = System.currentTimeMillis();
        long sum1 = numbers.stream()
            .mapToInt(Integer::intValue)
            .sum();
        long end1 = System.currentTimeMillis();
        System.out.println("串行: " + sum1 + ", 耗时: " + (end1 - start1) + "ms");

        // 并行处理（使用 Spliterator）
        long start2 = System.currentTimeMillis();
        long sum2 = numbers.parallelStream()
            .mapToInt(Integer::intValue)
            .sum();
        long end2 = System.currentTimeMillis();
        System.out.println("并行: " + sum2 + ", 耗时: " + (end2 - start2) + "ms");
    }
}
```

### 17.7.4 惰性求值迭代器

```java
/**
 * 惰性求值迭代器 - 只在需要时计算下一个元素
 * 适用于无限序列或大数据集
 */
public class LazyEvaluatingIterator<T> implements Iterator<T> {
    private final Supplier<T> generator;
    private T nextElement;
    private boolean hasNext = true;

    public LazyEvaluatingIterator(Supplier<T> generator) {
        this.generator = generator;
    }

    @Override
    public boolean hasNext() {
        return hasNext;
    }

    @Override
    public T next() {
        if (!hasNext) {
            throw new NoSuchElementException();
        }
        nextElement = generator.get();
        if (nextElement == null) {
            hasNext = false;
        }
        return nextElement;
    }

    // 使用示例：生成斐波那契数列
    public static void main(String[] args) {
        Iterator<Integer> fibonacci = new Iterator<>() {
            private int a = 0, b = 1;

            @Override
            public boolean hasNext() {
                return true;  // 无限序列
            }

            @Override
            public Integer next() {
                int result = a;
                a = b;
                b = a + result;
                return result;
            }
        };

        // 只取前10个斐波那契数
        System.out.println("斐波那契数列前10项: ");
        new Iterator<Integer>() {
            int count = 0;
            {
                while (hasNext() && count < 10) {
                    System.out.print(fibonacci.next() + " ");
                    count++;
                }
            }
            public boolean hasNext() { return count < 10; }
            public Integer next() { return null; }
        };
    }
}
```

迭代器模式是 Java 集合框架的基石，深入理解它的实现原理和优化策略，对于编写高效、可维护的代码至关重要。在现代 Java 开发中，Stream API 虽然提供了更声明式的数据处理方式，但它们的底层仍然依赖 Spliterator 这一迭代器的进化形态。
