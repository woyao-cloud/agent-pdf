# 第3章 数组与字符串

## 3.1 数组的原理与实现

### 解决的问题

数组是最基本、最古老的数据结构之一。它在内存中连续存储一组相同类型的数据，通过索引直接访问。几乎所有高级数据结构（ArrayList、HashMap、堆、String等）的底层都依赖于数组。

> **核心价值**：理解数组的内存模型是理解所有高级数据结构的基础。

### 实现原理

数组在JVM内存中是一段**连续的内存空间**。每个元素占据固定大小的空间，通过**基地址 + 偏移量**公式直接计算元素地址。

```
内存布局示例（int[] arr = new int[4]）：

地址:  [base]  [base+4]  [base+8]  [base+12]
数据:  [arr[0]] [arr[1]]  [arr[2]]  [arr[3]]
取值:  arr[i] 的地址 = base + i × 4 (int占4字节)
```

**数组的核心特性**：
- **随机访问O(1)**：直接通过地址计算定位
- **连续内存**：CPU缓存友好，遍历速度快
- **固定长度**：创建后不可变
- **类型安全**：Java数组在编译时和运行时都检查类型

**Java中数组的JVM实现**：

```java
// Java数组本质上是对象
int[] arr = new int[10];
// JVM中arr对象的结构：
// [对象头(Mark Word + Klass Pointer)] + [数组长度(length)] + [元素数据]
// 对象头：12-16字节（取决于JVM配置）
// length：4字节
// 元素：n × 元素类型大小
```

### 代码实现

```java
/**
 * 数组操作的核心示例
 */
public class ArrayDemo {
    public static void main(String[] args) {
        // 1. 数组的创建
        int[] arr1 = new int[10];          // 默认值0
        int[] arr2 = {1, 2, 3, 4, 5};      // 静态初始化
        int[] arr3 = new int[]{1, 2, 3};   // 动态初始化
        
        // 2. 数组的随机访问 —— O(1)
        int val = arr2[3];  // 通过索引直接计算地址
        
        // 3. 数组的遍历
        // 方式一：for循环
        for (int i = 0; i < arr2.length; i++) {
            System.out.print(arr2[i] + " ");
        }
        // 方式二：for-each（语法糖，编译后仍然是for循环）
        for (int num : arr2) {
            System.out.print(num + " ");
        }
        
        // 4. 数组的插入和删除 —— O(n)
        int[] arr = new int[5];
        int size = 0;
        
        // 尾部插入 O(1)
        arr[size++] = 10;
        arr[size++] = 20;
        arr[size++] = 30;
        
        // 中间插入 O(n) —— 需要移动后续元素
        // 在index=1处插入15
        int insertIndex = 1;
        for (int i = size; i > insertIndex; i--) {
            arr[i] = arr[i - 1];  // 元素后移
        }
        arr[insertIndex] = 15;
        size++;
        
        // 删除 O(n) —— 需要移动后续元素
        for (int i = insertIndex; i < size - 1; i++) {
            arr[i] = arr[i + 1];  // 元素前移
        }
        size--;
    }
}
```

```java
/**
 * 手写动态数组（简化版ArrayList）
 */
public class DynamicArray<E> {
    private static final int DEFAULT_CAPACITY = 10;
    private Object[] elements;
    private int size;
    
    public DynamicArray() {
        // Java 8+ 的ArrayList使用懒加载：第一次add()时才创建数组
        elements = new Object[DEFAULT_CAPACITY];
    }
    
    public DynamicArray(int initialCapacity) {
        if (initialCapacity < 0) {
            throw new IllegalArgumentException("Illegal Capacity: " + initialCapacity);
        }
        elements = new Object[initialCapacity];
    }
    
    // 尾部添加 —— 摊销O(1)
    public boolean add(E e) {
        ensureCapacity(size + 1);
        elements[size++] = e;
        return true;
    }
    
    // 指定位置插入 —— O(n)
    public void add(int index, E element) {
        rangeCheckForAdd(index);
        ensureCapacity(size + 1);
        // 将[index, size)的元素后移一位
        System.arraycopy(elements, index, elements, index + 1, size - index);
        elements[index] = element;
        size++;
    }
    
    // 获取元素 —— O(1)
    @SuppressWarnings("unchecked")
    public E get(int index) {
        rangeCheck(index);
        return (E) elements[index];
    }
    
    // 删除元素 —— O(n)
    @SuppressWarnings("unchecked")
    public E remove(int index) {
        rangeCheck(index);
        E oldValue = (E) elements[index];
        int numMoved = size - index - 1;
        if (numMoved > 0) {
            // 将[index+1, size)的元素前移一位
            System.arraycopy(elements, index + 1, elements, index, numMoved);
        }
        elements[--size] = null;  // 让GC回收
        return oldValue;
    }
    
    public int size() {
        return size;
    }
    
    // 扩容 —— 1.5倍
    private void ensureCapacity(int minCapacity) {
        if (minCapacity > elements.length) {
            int oldCapacity = elements.length;
            int newCapacity = oldCapacity + (oldCapacity >> 1);  // 1.5倍
            if (newCapacity < minCapacity) {
                newCapacity = minCapacity;
            }
            elements = Arrays.copyOf(elements, newCapacity);
        }
    }
    
    private void rangeCheck(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        }
    }
    
    private void rangeCheckForAdd(int index) {
        if (index < 0 || index > size) {
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        }
    }
}
```

### 使用场景

- **固定大小数据**：已知数据量，不需要动态增删
- **频繁随机访问**：需要按索引快速访问元素
- **CPU缓存优化**：需要高效遍历的场景
- **底层数据结构**：作为其他数据结构的底层实现

### 潜在风险与问题

- **数组越界**：访问索引 < 0 或 >= length 时抛出ArrayIndexOutOfBoundsException
- **长度固定**：创建后不能改变长度，需要扩容时只能创建新数组
- **内存浪费**：预分配过大导致内存浪费
- **协变问题**：Java数组是协变的，String[]是Object[]的子类型，运行时检查类型

```java
// 数组协变的陷阱
Object[] objArray = new String[10];
objArray[0] = "hello";         // 没问题
objArray[0] = 123;             // 编译通过，运行时抛出 ArrayStoreException！
```

### 优化策略

- **预分配容量**：如果能预估数据量，直接指定数组大小
- **使用System.arraycopy()**：这是JVM原生方法，比手动循环快得多
- **使用Arrays工具类**：排序、查找、填充等操作使用JDK提供的优化实现
- **数组对象重用**：避免频繁创建和销毁大数组

### 典型问题处理

**面试题：为什么数组的索引从0开始？**

- **历史原因**：C语言从0开始，Java沿用了这个约定
- **地址计算**：如果从0开始，arr[i]的地址 = base + i × size；如果从1开始，arr[i]的地址 = base + (i-1) × size，多了一次减法运算
- **数组名本身就是指向第一个元素的指针**：arr等价于&arr[0]

---

## 3.2 动态数组（ArrayList）源码解析

### 解决的问题

ArrayList是Java中使用频率最高的集合类。它解决了原生数组长度固定的问题，实现了**动态扩容**的数组。深入理解ArrayList源码，是理解Java集合框架设计思想的起点。

> **核心价值**：读懂ArrayList源码，就能理解Java集合框架的设计模式、扩容策略和性能取舍。

### 实现原理

ArrayList的核心设计：

```
ArrayList<E>
├── 底层：Object[] elementData
├── 大小：int size
├── 扩容因子：1.5倍
├── 初始容量：10（懒加载，JDK 8+）
└── 最大容量：Integer.MAX_VALUE - 8
```

**JDK 8+ 的懒加载优化**：
- 空构造器不立即创建数组，而是使用一个共享的空数组
- 第一次add()时才扩容到默认容量10
- 节省了创建空ArrayList却从不使用时的内存

```java
// JDK 8+ ArrayList源码核心
public class ArrayList<E> {
    // 默认空数组（懒加载）
    private static final Object[] DEFAULTCAPACITY_EMPTY_ELEMENTDATA = {};
    
    // 实际存储元素的数组
    transient Object[] elementData;
    
    // 元素个数
    private int size;
    
    // 空构造器 —— 不分配内存！
    public ArrayList() {
        this.elementData = DEFAULTCAPACITY_EMPTY_ELEMENTDATA;
    }
    
    // 指定初始容量的构造器
    public ArrayList(int initialCapacity) {
        if (initialCapacity > 0) {
            this.elementData = new Object[initialCapacity];
        } else if (initialCapacity == 0) {
            this.elementData = EMPTY_ELEMENTDATA;
        } else {
            throw new IllegalArgumentException("Illegal Capacity: " + initialCapacity);
        }
    }
}
```

### 代码实现

```java
/**
 * ArrayList核心方法源码分析
 */
public class ArrayListSourceAnalysis {
    
    // ========== add(E e) —— 尾部添加 ==========
    // 1. 确保内部容量足够
    // 2. 在size位置放入元素
    // 3. size++
    //
    // public boolean add(E e) {
    //     ensureCapacityInternal(size + 1);  // 扩容检查
    //     elementData[size++] = e;           // 赋值并自增
    //     return true;
    // }
    
    // ========== 扩容机制 ==========
    // private void grow(int minCapacity) {
    //     int oldCapacity = elementData.length;
    //     int newCapacity = oldCapacity + (oldCapacity >> 1);  // 1.5倍
    //     if (newCapacity - minCapacity < 0)
    //         newCapacity = minCapacity;
    //     if (newCapacity - MAX_ARRAY_SIZE > 0)
    //         newCapacity = hugeCapacity(minCapacity);
    //     elementData = Arrays.copyOf(elementData, newCapacity);
    // }
    //
    // 为什么是1.5倍？
    // - 如果增长因子太小（如1.25），频繁扩容导致性能下降
    // - 如果增长因子太大（如2），浪费内存
    // - 1.5倍是经过权衡的经验值
    
    // ========== add(int index, E element) —— 指定位置插入 ==========
    // 关键：System.arraycopy() 移动元素
    // public void add(int index, E element) {
    //     rangeCheckForAdd(index);
    //     ensureCapacityInternal(size + 1);
    //     // 将 index及之后的元素后移一位
    //     System.arraycopy(elementData, index,
    //                      elementData, index + 1,
    //                      size - index);
    //     elementData[index] = element;
    //     size++;
    // }
    
    // ========== get(int index) —— 随机访问 ==========
    // 直接数组访问，O(1)
    // public E get(int index) {
    //     rangeCheck(index);
    //     return elementData(index);  // return (E) elementData[index];
    // }
    
    // ========== remove(int index) —— 删除 ==========
    // 使用System.arraycopy()前移元素
    // public E remove(int index) {
    //     rangeCheck(index);
    //     modCount++;
    //     E oldValue = elementData(index);
    //     int numMoved = size - index - 1;
    //     if (numMoved > 0)
    //         System.arraycopy(elementData, index+1,
    //                          elementData, index, numMoved);
    //     elementData[--size] = null;  // help GC
    //     return oldValue;
    // }
    
    // ========== 迭代器 ==========
    // ArrayList的迭代器是 fail-fast 的：
    // 如果在迭代过程中通过非迭代器方法修改了列表，
    // 会抛出 ConcurrentModificationException
    //
    // private class Itr implements Iterator<E> {
    //     int expectedModCount = modCount;
    //     ...
    //     final void checkForComodification() {
    //         if (modCount != expectedModCount)
    //             throw new ConcurrentModificationException();
    //     }
    // }
}
```

```java
/**
 * ArrayList性能对比测试
 */
public class ArrayListPerformance {
    public static void main(String[] args) {
        int dataSize = 100_000;
        
        // 1. 预分配容量 vs 不预分配
        long start1 = System.nanoTime();
        List<Integer> list1 = new ArrayList<>();  // 不指定容量
        for (int i = 0; i < dataSize; i++) {
            list1.add(i);  // 多次扩容
        }
        long end1 = System.nanoTime();
        System.out.println("不预分配: " + (end1 - start1) / 1_000_000 + "ms");
        
        long start2 = System.nanoTime();
        List<Integer> list2 = new ArrayList<>(dataSize);  // 预分配
        for (int i = 0; i < dataSize; i++) {
            list2.add(i);  // 无需扩容
        }
        long end2 = System.nanoTime();
        System.out.println("预分配: " + (end2 - start2) / 1_000_000 + "ms");
        // 预分配通常比不预分配快2-5倍
        
        // 2. 尾部插入 vs 头部插入
        List<Integer> tailInsert = new ArrayList<>();
        long t1 = System.nanoTime();
        for (int i = 0; i < dataSize; i++) {
            tailInsert.add(i);  // 尾部插入 O(1)
        }
        long t2 = System.nanoTime();
        System.out.println("尾部插入: " + (t2 - t1) / 1_000_000 + "ms");
        
        List<Integer> headInsert = new ArrayList<>();
        long t3 = System.nanoTime();
        for (int i = 0; i < dataSize; i++) {
            headInsert.add(0, i);  // 头部插入 O(n)
        }
        long t4 = System.nanoTime();
        System.out.println("头部插入: " + (t4 - t3) / 1_000_000 + "ms");
        // 头部插入比尾部插入慢几百倍！
    }
}
```

### 使用场景

- **通用集合**：大多数需要有序集合的场景
- **随机访问频繁**：按索引取元素的场景
- **尾部添加为主**：主要在列表末尾添加元素的场景
- **替代数组**：需要动态大小的数组

### 潜在风险与问题

- **扩容性能开销**：扩容时需要复制整个数组，单次操作O(n)
- **删除开销大**：删除中间元素需要移动后续所有元素
- **内存浪费**：实际元素远少于容量时浪费内存（trimToSize()可解决）
- **线程不安全**：多线程环境需使用Collections.synchronizedList()或CopyOnWriteArrayList
- **subList()视图问题**：subList()返回的是视图而非独立副本，对原List的修改会导致子列表失效

```java
// subList() 的陷阱
List<Integer> list = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
List<Integer> subList = list.subList(1, 3);  // [2, 3]
list.add(6);  // 修改原List
// subList.get(0);  // ❌ ConcurrentModificationException！
```

### 优化策略

- **预分配容量**：使用 new ArrayList<>(expectedSize)
- **使用trimToSize()**：确定不再添加元素后释放多余空间
- **批量操作**：使用addAll()而非逐个add()
- **用ArrayDeque替代**：在只需要栈或队列操作时，使用ArrayDeque而非ArrayList

### 典型问题处理

**面试题：ArrayList扩容为什么是1.5倍而不是2倍？**

- 如果扩容2倍，每次扩容后浪费一半空间
- 如果扩容1.5倍，可以复用之前释放的内存（内存分配的对齐策略）
- 1.5倍的增长速度足够快（log_{1.5}(N) 次扩容），又不会浪费太多空间
- JDK开发者经过大量测试后的权衡结果

---

## 3.3 字符串（String）原理

### 解决的问题

String是Java中使用频率最高的类。它的不可变性、字符串常量池、以及各种操作（拼接、截取、查找）的实现原理，直接影响着系统的性能和内存使用。

> **核心价值**：深入理解String原理，避免写出"内存泄漏"般的字符串操作代码。

### 实现原理

**String的不可变性**：

```java
public final class String {
    private final char[] value;  // Java 8及之前：char[]
    // private final byte[] value;  // Java 9+：byte[]（紧凑字符串）
    private final int hash;      // 缓存hashCode，不可变对象可以安全缓存
    
    // String类是final的，不可继承
    // char[] value是final的，引用不可变
    // 所有"修改"操作都返回新String对象
}
```

**Java 9+ 的紧凑字符串（Compact Strings）优化**：
- Java 8及之前：String内部用char[]（每个char占2字节）
- Java 9+：String内部用byte[]，使用coder字段标记编码
- 如果字符串所有字符都在Latin-1范围内（0-255），每个字符只占1字节
- 内存节省约50%

**字符串常量池（String Pool）**：
- JVM维护一个字符串常量池（JDK 7+ 在堆中）
- 使用字面量创建的字符串会入池
- 相同内容的字面量字符串共享同一个对象
- intern()方法可以手动将字符串加入常量池

### 代码实现

```java
/**
 * String核心原理演示
 */
public class StringDemo {
    public static void main(String[] args) {
        // ========== 字符串常量池 ==========
        String s1 = "hello";           // 字面量，入池
        String s2 = "hello";           // 从池中获取
        System.out.println(s1 == s2);  // true（同一个对象）
        
        String s3 = new String("hello");  // 强制创建新对象
        System.out.println(s1 == s3);     // false（不同对象）
        
        String s4 = s3.intern();          // 从池中获取
        System.out.println(s1 == s4);     // true
        
        // ========== 字符串拼接的性能陷阱 ==========
        int count = 100_000;
        
        // ❌ 错误方式：使用+拼接（每次创建新String对象）
        long start1 = System.nanoTime();
        String result1 = "";
        for (int i = 0; i < count; i++) {
            result1 += i;  // 每次创建新对象！O(n²)
        }
        long end1 = System.nanoTime();
        System.out.println("String+拼接: " + (end1 - start1) / 1_000_000 + "ms");
        
        // ✅ 正确方式：使用StringBuilder
        long start2 = System.nanoTime();
        StringBuilder sb = new StringBuilder(count * 5);  // 预分配容量
        for (int i = 0; i < count; i++) {
            sb.append(i);  // 内部数组操作，不会创建新对象
        }
        String result2 = sb.toString();
        long end2 = System.nanoTime();
        System.out.println("StringBuilder: " + (end2 - start2) / 1_000_000 + "ms");
        // StringBuilder 比 + 拼接快几个数量级！
        
        // ========== 常用方法原理 ==========
        String str = "Hello, World!";
        
        // substring() —— 创建新字符串
        // Java 6: 共享char[]，有内存泄漏风险
        // Java 7+: 创建新的char[]（或byte[]），无内存泄漏
        String sub = str.substring(0, 5);  // "Hello"
        
        // split() —— 正则表达式分割，效率较低
        String[] parts = str.split(", ");
        
        // 对于固定分隔符，使用StringTokenizer或indexOf更快
        int idx = str.indexOf(", ");
        String part1 = str.substring(0, idx);
        String part2 = str.substring(idx + 2);
    }
}
```

```java
/**
 * StringBuilder源码解析
 */
public class StringBuilderAnalysis {
    // StringBuilder继承自AbstractStringBuilder
    // 底层也是char[]（Java 9+ byte[]）
    
    // 核心方法：append()
    // public StringBuilder append(String str) {
    //     super.append(str);  // 调用父类方法
    //     return this;        // 返回自身，支持链式调用
    // }
    
    // 父类 AbstractStringBuilder.append()
    // public AbstractStringBuilder append(String str) {
    //     if (str == null) return appendNull();
    //     int len = str.length();
    //     ensureCapacityInternal(count + len);  // 确保容量
    //     str.getChars(0, len, value, count);   // 复制字符到内部数组
    //     count += len;
    //     return this;
    // }
    
    // 扩容策略：（原始容量 × 2）+ 2
    // private void ensureCapacityInternal(int minimumCapacity) {
    //     if (minimumCapacity - value.length > 0) {
    //         value = Arrays.copyOf(value, newCapacity(minimumCapacity));
    //     }
    // }
    //
    // private int newCapacity(int minCapacity) {
    //     int newCapacity = (value.length << 1) + 2;  // 2倍+2
    //     if (newCapacity - minCapacity < 0)
    //         newCapacity = minCapacity;
    //     return newCapacity;
    // }
}
```

### 使用场景

- **字符串拼接**：使用StringBuilder（单线程）或StringBuffer（多线程）
- **字符串查找**：使用indexOf()而不是contains()（需要确定性能场景）
- **字符串比较**：使用equals()而非==
- **大量字符串处理**：预分配StringBuilder容量

### 潜在风险与问题

- **字符串拼接性能**：循环中使用+拼接会产生大量临时对象，严重影响性能
- **substring()内存泄漏**：Java 6中substring()共享char[]，可能导致大字符串无法GC
- **split()性能**：split()使用正则表达式，简单分割用indexOf更高效
- **== vs equals()**：字符串比较务必用equals()
- **StringBuffer vs StringBuilder**：StringBuffer线程安全但有同步开销，单线程用StringBuilder

```java
// Java 6 substring() 内存泄漏问题
// String substring(int beginIndex, int endIndex) {
//     // Java 6: 返回的String共享原String的char[]
//     return new String(offset + beginIndex, endIndex - beginIndex, value);
//     // 如果原String有1MB，只取前10个字符，整个1MB都无法GC！
// }
//
// Java 7+: 创建新的char[]副本
// return new String(value, beginIndex, subLen);
// 修复了内存泄漏问题
```

### 优化策略

- **使用StringBuilder**：所有字符串拼接操作都使用StringBuilder
- **预分配容量**：new StringBuilder(expectedLength)
- **String.intern()**：重复出现的字符串可以使用intern()节省内存（需谨慎，常量池也有开销）
- **字符流处理**：处理大文本时使用Reader/Writer而非全部读入String
- **编译期优化**：编译期常量字符串拼接会在编译时直接完成

```java
// 编译期优化示例
// 以下代码在编译时就被优化为一个字符串
String s = "Hello, " + "World!";
// 编译后相当于：
// String s = "Hello, World!";

// 但如果包含变量，则不会优化
String world = "World!";
String s2 = "Hello, " + world;
// 编译后使用 StringBuilder.append() 实现
```

### 典型问题处理

**面试题：String、StringBuilder、StringBuffer的区别？**

| 特性 | String | StringBuilder | StringBuffer |
|------|--------|--------------|-------------|
| 可变性 | 不可变 | 可变 | 可变 |
| 线程安全 | 安全（不可变） | 不安全 | 安全（synchronized） |
| 性能 | 慢（拼接创建新对象） | 快 | 较慢（同步开销） |
| 使用场景 | 不变的字符串 | 单线程字符串拼接 | 多线程字符串拼接 |

---

## 3.4 使用场景与风险分析

### 解决的问题

数组和字符串在项目中处处可见，但用错场景会导致严重的性能问题。本节总结数组和字符串在实际项目中的最佳实践和风险点。

> **核心价值**：在真实项目中正确使用数组和字符串，避免常见陷阱。

### 实现原理

**数组选择的决策因素**：

```
数组类型选择树
├── 数据量固定？ → 原生数组（int[]而非ArrayList<Integer>）
├── 需要动态大小？
│   ├── 尾部操作为主？ → ArrayList
│   ├── 首部操作频繁？ → LinkedList / ArrayDeque
│   └── 线程安全？
│       ├── 读多写少？ → CopyOnWriteArrayList
│       └── 读写都多？ → Collections.synchronizedList()
```

**字符串处理的性能模型**：
```
字符串操作类型
├── 频繁拼接 → StringBuilder
├── 频繁分割 → 使用indexOf + substring（比split快3-5倍）
├── 大量替换 → 使用Matcher.appendReplacement而非replaceAll
├── 国际文本 → 使用CharsetEncoder而非String.getBytes()
└── 二进制数据 → 使用byte[]而非String
```

### 代码实现

```java
/**
 * 实际项目中的最佳实践
 */
public class BestPractices {
    
    // ========== 1. 使用原始类型数组而非包装类型 ==========
    // ❌ 浪费内存
    Integer[] wrapperArray = new Integer[1000];  // 每个Integer对象16+字节
    // ✅ 更高效
    int[] primitiveArray = new int[1000];        // 每个int 4字节
    
    // ========== 2. 正确使用数组复制 ==========
    public void arrayCopy() {
        int[] source = {1, 2, 3, 4, 5};
        
        // ❌ 手动循环复制
        int[] dest1 = new int[source.length];
        for (int i = 0; i < source.length; i++) {
            dest1[i] = source[i];
        }
        
        // ✅ System.arraycopy()（JVM原生方法，效率最高）
        int[] dest2 = new int[source.length];
        System.arraycopy(source, 0, dest2, 0, source.length);
        
        // ✅ Arrays.copyOf()（更简洁）
        int[] dest3 = Arrays.copyOf(source, source.length);
    }
    
    // ========== 3. 字符串高效拼接 ==========
    public String efficientConcat(List<String> items) {
        if (items.isEmpty()) return "";
        
        // 预计算所需容量
        int totalLength = 0;
        for (String item : items) {
            totalLength += item.length();
        }
        totalLength += (items.size() - 1) * 2;  // 分隔符
        
        StringBuilder sb = new StringBuilder(totalLength);
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(items.get(i));
        }
        return sb.toString();
    }
    
    // ========== 4. 高效字符串分割 ==========
    public String[] efficientSplit(String str, char delimiter) {
        // 对于简单分隔符，比 str.split(regex) 快得多
        List<String> parts = new ArrayList<>();
        int start = 0;
        for (int i = 0; i < str.length(); i++) {
            if (str.charAt(i) == delimiter) {
                parts.add(str.substring(start, i));
                start = i + 1;
            }
        }
        parts.add(str.substring(start));
        return parts.toArray(new String[0]);
    }
    
    // ========== 5. 多维度数组的空间局部性 ==========
    public void spatialLocality() {
        int[][] matrix = new int[1000][1000];
        
        // ✅ 按行遍历（连续内存，CPU缓存友好）
        long start1 = System.nanoTime();
        int sum1 = 0;
        for (int i = 0; i < 1000; i++) {
            for (int j = 0; j < 1000; j++) {
                sum1 += matrix[i][j];  // 内存连续性好
            }
        }
        long end1 = System.nanoTime();
        
        // ❌ 按列遍历（跳跃访问，CPU缓存不友好）
        long start2 = System.nanoTime();
        int sum2 = 0;
        for (int j = 0; j < 1000; j++) {
            for (int i = 0; i < 1000; i++) {
                sum2 += matrix[i][j];  // 内存跨越行，缓存失效
            }
        }
        long end2 = System.nanoTime();
        
        // 按行遍历比按列遍历快数倍甚至数十倍！
    }
}
```

### 使用场景

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| 配置常量 | private static final String | 编译期常量，性能最好 |
| 日志拼接 | StringBuilder | 避免浪费 |
| JSON序列化 | String.format() / 模板 | 可读性好 |
| 二进制数据 | byte[] / ByteBuffer | String不适合存二进制 |
| 敏感信息 | char[]（用完即清） | String不可变，无法主动清除 |

```java
// 处理密码等敏感信息的正确方式
public void handlePassword() {
    char[] password = new char[]{'s', 'e', 'c', 'r', 'e', 't'};
    // ... 使用密码
    // 使用完毕后主动清除
    Arrays.fill(password, '\0');  // ✅ 可以手动清除
    // 如果用String，内容一直在常量池中无法清除
}
```

### 潜在风险与问题

- **字符串驻留（intern）滥用**：大量使用intern()可能导致永久代（元空间）内存溢出
- **数组协变风险**：运行时类型检查而非编译时
- **ArrayList的序列化**：elementData用transient修饰，序列化时只序列化实际元素
- **String不可变的双刃剑**：线程安全但无法主动释放内存

### 优化策略

- 优先使用数组而非集合（在性能敏感场景）
- 使用Arrays.asList()将数组转换为List（注意这是视图，不是副本）
- 使用String.join()拼接字符串（JDK 8+，内部使用StringJoiner）
- 使用Pattern.compile()预编译正则表达式

### 典型问题处理

**工程实践：ArrayList扩容时如何避免性能抖动？**

在实时系统中，ArrayList扩容导致的单次O(n)操作可能引起延迟抖动。解决方案：
1. 预分配容量：new ArrayList<>(expectedSize)
2. 使用分段结构：如使用多个ArrayList分片存储
3. 使用环形缓冲：如果使用场景适合FIFO

---

## 3.5 性能优化技巧

### 解决的问题

数组和字符串是最基础的数据结构，它们的性能优化技巧可以应用于几乎所有Java程序。本节整理了一些高阶优化技巧。

> **核心价值**：掌握JVM层面的数组和字符串优化手段，写出高性能代码。

### 实现原理

**JVM对数组的特殊优化**：
- JVM识别数组为特殊类型，有专门的字节码指令（iaload、iastore等）
- 数组边界检查：JVM在运行时检查索引是否越界，但JIT编译器会优化掉循环中可预见的边界检查
- 标量替换：JIT的逃逸分析可以将数组对象分解为局部变量

**CPU对数组的优化**：
- 空间局部性：数组元素在内存中连续，CPU预取机制会提前加载相邻数据到缓存
- 缓存行（Cache Line）：通常64字节，一次加载多个数组元素

### 代码实现

```java
/**
 * 高阶优化技巧
 */
public class AdvancedOptimization {
    
    // ========== 1. 利用CPU缓存行 ==========
    // CPU缓存行通常64字节，一次加载8个long
    // 连续访问数组元素时，大部分数据已经在缓存中
    public void cacheFriendlyAccess(int[] arr) {
        // ✅ 顺序访问 —— 缓存友好
        int sum = 0;
        for (int i = 0; i < arr.length; i++) {
            sum += arr[i];  // 每次访问都在缓存行中
        }
        
        // ❌ 跳跃访问 —— 缓存不友好
        int sum2 = 0;
        for (int i = 0; i < arr.length; i += 64) {  // 每次跳过一个缓存行
            sum2 += arr[i];  // 大部分时间在等待内存访问
        }
    }
    
    // ========== 2. String.intern() 的工程应用 ==========
    // 大量重复字符串的场景下使用intern()可以节省大量内存
    // 但要注意：intern()字符串不会GC（JDK 7+ 在堆中，可以被GC）
    public class StringDeduplication {
        // 例如：从数据库中读取大量重复的状态码
        // "SUCCESS", "FAILED", "PENDING" ...
        // 每个状态码出现百万次
        public String dedup(String status) {
            return status.intern();  // 确保相同内容的字符串共享同一个对象
        }
        // 也可以使用 Map<String, String> 手动池化
        private final Map<String, String> pool = new HashMap<>();
        public String manualPool(String s) {
            return pool.computeIfAbsent(s, k -> k);
        }
    }
    
    // ========== 3. 零拷贝（Zero-Copy）技术 ==========
    // 使用 ByteBuffer.allocateDirect() 分配直接内存
    // 避免数据在内核空间和用户空间之间的复制
    // 适用于网络传输和文件I/O场景
    import java.nio.ByteBuffer;
    public class ZeroCopyExample {
        public void processData() {
            // 分配直接缓冲区（堆外内存）
            ByteBuffer buffer = ByteBuffer.allocateDirect(1024);
            // 写入数据
            buffer.putInt(12345);
            buffer.flip();
            // 直接从缓冲区发送到网络或文件
            // 避免中间复制到Java堆数组
        }
    }
    
    // ========== 4. 数组排序优化 ==========
    // Arrays.sort() 对不同类型使用不同算法
    public void sortingOptimization() {
        int[] arr = {3, 1, 4, 1, 5, 9, 2, 6, 5};
        
        // 对基本类型数组：Dual-Pivot QuickSort（O(n log n)）
        Arrays.sort(arr);
        
        // 对对象数组：TimSort（归并+插入的混合排序，稳定）
        String[] strs = {"banana", "apple", "cherry"};
        Arrays.sort(strs);
        
        // 并行排序：数据量大时使用
        // Arrays.parallelSort(arr);  // 使用Fork/Join框架
        // 数据量大时（>10000），并行排序比普通排序快得多
    }
    
    // ========== 5. 避免装箱/拆箱 ==========
    public void boxingOptimization() {
        int count = 10_000_000;
        
        // ❌ 使用包装类型集合
        List<Integer> list = new ArrayList<>(count);
        long start1 = System.nanoTime();
        for (int i = 0; i < count; i++) {
            list.add(i);  // 每次装箱
        }
        long end1 = System.nanoTime();
        
        // ✅ 使用原始类型数组
        int[] array = new int[count];
        long start2 = System.nanoTime();
        for (int i = 0; i < count; i++) {
            array[i] = i;  // 无需装箱
        }
        long end2 = System.nanoTime();
        
        // 1000万次操作，数组比ArrayList快3-5倍
    }
}
```

### 使用场景

- **高性能计算**：使用原始类型数组、直接内存
- **大数据处理**：预分配容量、避免装箱
- **实时系统**：避免动态扩容、避免字符串拼接
- **内存敏感应用**：共享字符串、主动清除数组

### 潜在风险与问题

- **过早优化**：在不必要的地方使用高级技巧，增加代码复杂度
- **直接内存泄漏**：Direct ByteBuffer需要显式释放
- **逃逸分析不稳定**：依赖JIT编译器优化，不同JVM版本表现不同
- **可读性牺牲**：过度优化导致代码难以维护

### 优化策略

优化应遵循"先测量，再优化"的原则：

1. **建立基线**：测量当前性能
2. **定位瓶颈**：使用Profiler找到热点
3. **局部优化**：只优化瓶颈，不碰其他代码
4. **再次测量**：验证优化效果
5. **权衡取舍**：性能提升是否值得增加的复杂度

### 典型问题处理

**工程实践：如何选择ArrayList的初始容量？**

如果知道最终数据量是N，可以使用公式计算最佳初始容量：
- 扩容因子是1.5倍
- 避免扩容的条件：initialCapacity × 1.5^k ≥ N
- 也可以直接设置为N（ArrayList扩容不会超过最大容量）
- 或者设置N + N/2的容量，牺牲一点内存换取完全无扩容

---

> **本章总结**：数组是数据结构的基石，String是日常开发中使用最多的类。理解数组的内存模型和String的不可变性原理，掌握ArrayList的扩容策略和StringBuilder的高效拼接，能够帮助写出高性能、低内存的Java代码。数组和字符串的优化技巧可以应用于几乎所有Java程序中。