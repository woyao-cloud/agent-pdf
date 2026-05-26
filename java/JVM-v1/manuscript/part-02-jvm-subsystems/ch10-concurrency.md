# 第10章 并发与锁优化

> 前三章分别讨论了类加载、内存管理和即时编译——这些都聚焦于单一线程的执行效率。然而，现代Java应用几乎都是多线程的：Web服务器需要同时处理成千上万的请求，大数据平台需要并行计算，微服务架构需要异步处理。在这些场景下，**并发控制**成了性能的关键瓶颈——锁的竞争直接决定了应用的吞吐量和延迟。
>
> Java的并发模型从JDK 1.0的synchronized和volatile，到JDK 5的java.util.concurrent（JUC）框架，再到JDK 8的CompletableFuture和LongAdder，直到JDK 21的虚拟线程（Virtual Threads），经历了漫长而深刻的演进。每一次演进都在解决同一个核心问题：**如何让多线程高效地共享和操作数据，同时保证正确性？**
>
> 本章将从Java内存模型（JMM）出发，深入分析synchronized的底层实现（从偏向锁到重量级锁的升级过程）、AQS框架的设计原理，以及JDK 21虚拟线程对并发编程范式的冲击。随后通过三个实战案例——死锁分析、锁竞争优化、虚拟线程与传统线程池的对比——展示并发诊断与优化的完整方法论。

## 10.1 核心原理

### 10.1.1 Java内存模型（JMM）与happens-before

Java内存模型（Java Memory Model, JMM）是Java并发编程的基石。它定义了多线程程序中，一个线程对共享变量的写入何时对另一个线程可见。JMM的核心目标是**屏蔽不同硬件平台和操作系统的内存访问差异**，让Java开发者能够编写跨平台一致的多线程代码。

**为什么需要JMM？**

现代计算机系统中，CPU的处理速度远超内存的访问速度。为了弥补这一差距，CPU引入了多级缓存（L1/L2/L3 Cache）和乱序执行（Out-of-Order Execution）技术。在多核CPU上，每个核心都有自己的缓存，不同核心之间的缓存可能不一致——一个核心修改了变量，另一个核心可能看到的是旧值。

此外，编译器（包括JIT编译器）在执行代码时，可能会进行指令重排序（Instruction Reordering）优化——只要重排序不影响单线程的执行语义，编译器就可以自由地调整指令顺序。

这些硬件和软件的优化，在单线程环境下是完全透明的（不影响结果），但在多线程环境下会导致"可见性"问题——一个线程的修改对另一个线程不可见，或者看起来"部分可见"。

**JMM的核心规范**

JMM通过以下机制来保证并发正确性：

**happens-before关系**：JMM定义了一组happens-before规则。如果操作A happens-before 操作B，那么A的结果对B可见（且A的执行顺序在B之前）。关键规则包括：

1. **程序次序规则**（Program Order Rule）：在一个线程内，按照控制流顺序，前面的操作happens-before后面的操作。
2. **监视器锁规则**（Monitor Lock Rule）：对一个锁的解锁（unlock）happens-before于随后对这个锁的加锁（lock）。
3. **volatile变量规则**（Volatile Variable Rule）：对一个volatile字段的写操作happens-before于随后对这个volatile字段的读操作。
4. **线程启动规则**（Thread Start Rule）：对Thread.start()的调用happens-before于启动线程中的任何操作。
5. **线程终止规则**（Thread Termination Rule）：线程中的所有操作happens-before于其他线程检测到该线程终止（通过Thread.join()或Thread.isAlive()返回false）。
6. **中断规则**（Interruption Rule）：对线程的interrupt()调用happens-before于被中断线程检测到中断事件（通过Thread.interrupted()或InterruptedException）。
7. **终结器规则**（Finalizer Rule）：对象的构造方法happens-before于该对象的finalizer方法。
8. **传递性**（Transitivity）：如果A happens-before B，且B happens-before C，则A happens-before C。

**volatile语义**

volatile是Java中最轻量级的同步机制。当一个字段被声明为volatile时：

- **可见性**：对一个volatile变量的写操作，会立即刷新到主内存。随后的读操作会从主内存读取，而不是从CPU缓存中读取。这实际上建立了happens-before关系：写操作happens-before于任何后续的读操作。
- **有序性**：禁止对volatile变量的读写操作进行指令重排序。JMM会在volatile操作前后插入内存屏障（Memory Barrier）来阻止重排序。

volatile的典型使用场景包括：
- 状态标志（如`volatile boolean running`）
- 一次性安全发布（如双重检查锁定中的`volatile`修饰）
- 独立观察（如定期更新的配置值）

但volatile不保证原子性——`volatile int count++`仍然不是线程安全的，因为`count++`是读-改-写三步操作。

**可见性、有序性、原子性**

并发编程需要同时保证三个特性：

- **原子性**（Atomicity）：一个操作或多个操作要么全部执行且不被中断，要么全部不执行。Java中的synchronized块、java.util.concurrent.atomic包提供原子性保证。volatile不提供原子性（除了对long/double的读写在64位JVM上是原子的）。
- **可见性**（Visibility）：当一个线程修改了共享变量，其他线程能立即看到这个修改。volatile、synchronized、final和Lock都保证可见性。
- **有序性**（Ordering）：程序执行的顺序按照代码的先后顺序执行。volatile和synchronized保证有序性（禁止重排序）。

三者之间的关系可以理解为：**原子性是基础（操作不可分割），可见性是结果（修改立即可见），有序性是保障（重排序不影响正确性）**。

### 10.1.2 synchronized的演进：从偏向锁到重量级锁

synchronized是Java最基础的同步手段。它的实现经历了从JDK 1.0到JDK 21的漫长演进，从最初的"重量级锁"（完全依赖操作系统互斥量）演变为一套复杂的多级锁机制。

**对象头与Mark Word**

在HotSpot虚拟机中，每个Java对象都有一个对象头（Object Header），其中包含Mark Word——存储对象的运行时元数据，包括锁状态、GC分代年龄、哈希码等。Mark Word是实现锁升级的核心数据结构。

在64位JVM中，Mark Word占用8个字节（64位），不同锁状态下其位含义不同：

```
无锁状态：    unused:25 | identity_hashcode:31 | unused:1 | age:4 | biased_lock:1 | lock:2
偏向锁状态：  thread:54 | epoch:2 | unused:1 | age:4 | biased_lock:1 | lock:2
轻量级锁状态：ptr_to_lock_record:62 | lock:2
重量级锁状态：ptr_to_heavyweight_monitor:62 | lock:2
```

`lock`字段的最后两位标识锁状态：
- `01`：无锁或偏向锁（通过biased_lock位进一步区分）
- `00`：轻量级锁
- `10`：重量级锁
- `11`：GC标记

**锁升级过程**

当一个线程首次进入synchronized块时，锁会经历从偏向锁到轻量级锁再到重量级锁的逐级升级（不可逆）：

**偏向锁（Biased Locking）**：偏向锁是JDK 6引入的优化，其核心思想是：**大多数锁在大多数时间只被一个线程持有**。偏向锁让第一个获得锁的线程在未来再次获取同一锁时，无需进行任何同步操作。

获取偏向锁的过程：
1. 检查Mark Word的偏向锁位是否为1、锁标志位是否为01。
2. 如果是可偏向状态，检查当前线程ID是否与Mark Word中的线程ID一致。
3. 如果一致，直接执行同步代码（无额外开销）。
4. 如果不一致，尝试通过CAS将Mark Word中的线程ID设置为当前线程ID。
5. 如果CAS成功，获取偏向锁成功，执行同步代码。
6. 如果CAS失败（表示存在锁竞争），偏向锁被撤销（revoke），升级为轻量级锁。

偏向锁撤销是一个相对昂贵的操作。它需要在全局安全点（SafePoint）暂停所有线程，检查偏向线程是否存活。如果偏向线程已终止，将对象头恢复为无锁状态；如果偏向线程仍在活动，则升级为轻量级锁。

**偏向锁的移除**：由于偏向锁的复杂性和维护成本，且现代Java应用（特别是基于线程池的应用）中锁竞争更加普遍，JDK 15通过JEP 374默认禁用了偏向锁，JDK 18+移除了偏向锁的代码实现。

**轻量级锁（Lightweight Locking）**：当偏向锁被撤销（或由于竞争进入），锁会升级为轻量级锁。

获取轻量级锁的过程：
1. 在当前线程的栈帧中创建一个名为Lock Record的空间，用于存储锁对象的Mark Word副本（Displaced Mark Word）。
2. 通过CAS操作，尝试将锁对象的Mark Word替换为指向Lock Record的指针。
3. 如果CAS成功，当前线程获得锁，Mark Word的锁标志位变为`00`。
4. 如果CAS失败，表示有多个线程在竞争锁。此时轻量级锁会膨胀为重量级锁。

轻量级锁的解锁过程是对称的：通过CAS将Lock Record中的Displaced Mark Word放回对象头。如果CAS成功，解锁完成；如果CAS失败（表示锁已膨胀为重量级锁），则进入重量级锁的解锁流程。

**重量级锁（Heavyweight Locking）**：重量级锁基于操作系统的互斥量（Mutex）实现。当轻量级锁CAS失败时，锁会膨胀为重量级锁。

重量级锁的核心组件是ObjectMonitor，它维护了：
- **Entry Set（入口集）**：等待获取锁的线程队列。
- **Wait Set（等待集）**：调用Object.wait()后释放锁并进入等待状态的线程队列。
- **Owner**：当前持有锁的线程。

重量级锁的获取流程：
1. 尝试通过CAS将Mark Word指向ObjectMonitor。
2. 如果成功，尝试通过系统调用（如pthread_mutex_lock）获取互斥量。
3. 如果获取失败，线程被阻塞并进入Entry Set。
4. 当持有锁的线程释放锁时，ObjectMonitor从Entry Set中唤醒一个线程。

重量级锁的开销主要来自：
- **系统调用**：进入和退出内核态的开销。
- **线程阻塞和唤醒**：涉及线程调度和上下文切换。
- **缓存未命中**：锁的竞争可能导致CPU缓存失效。

**锁升级的状态转换**

```
                 偏向锁获取成功
  无锁 ────────────────────────> 偏向锁 (JDK 15+默认跳过)
    │                              │
    │                              │ 锁竞争（CAS失败或有其他线程
    │                              │ 尝试获取偏向锁）
    │                              │
    │           ┌──────────────────┘
    │           │
    │           v
    │     轻量级锁
    │         │
    │         │ 多个线程同时竞争（CAS失败）
    │         v
    │     重量级锁
    │
    └──> (JDK 15+：无偏向锁，无锁直接进入轻量级锁)
```

**锁消除**

锁消除（Lock Elimination）是JIT编译器（C2）基于逃逸分析的优化。如果JIT分析出锁对象没有线程逃逸（即只在当前线程中访问），那么对该对象的所有同步操作都可以被消除。

```java
// 以下代码中的synchronized可能被锁消除
StringBuffer sb = new StringBuffer();
sb.append("hello");
sb.append("world");
```

如果JIT分析出`StringBuffer`对象没有逃逸出当前线程（实际上，如果`sb`是局部变量且没有被返回，就不会逃逸），则`append`方法内部的synchronized块可以被完全消除。这就是为什么在单线程环境中使用`StringBuffer`的性能开销可以忽略不计（经过充分预热后）。

**锁粗化**

锁粗化（Lock Coarsening）是JIT编译器的另一种锁优化。当JIT检测到一连串连续的锁操作时，会将这些锁操作合并为一次加锁：

```java
// 锁粗化前（JIT视角）：
for (int i = 0; i < n; i++) {
    synchronized (list) {
        list.add(data[i]);
    }
}

// 锁粗化后（等效行为）：
synchronized (list) {
    for (int i = 0; i < n; i++) {
        list.add(data[i]);
    }
}
```

锁粗化的前提是JIT能够确定循环中的锁对象是同一个。锁粗化的效果在循环频繁加锁解锁的场景下十分显著。

### 10.1.3 AQS框架：ReentrantLock、CountDownLatch、Semaphore

抽象队列同步器（AbstractQueuedSynchronizer, AQS）是java.util.concurrent包的核心框架。它提供了一个基于FIFO等待队列的框架，用于构建锁和同步器。

**AQS的设计原理**

AQS的核心是一个`volatile int state`和一个CLH（Craig, Landin, Hagersten）变体等待队列：

- **state**：表示同步状态，不同的同步器对state有不同的语义。例如，ReentrantLock用state表示锁的持有次数（0表示未持有，1表示持有，>1表示重入），Semaphore用state表示剩余许可数量，CountDownLatch用state表示计数器的值。
- **CLH队列**：由Node节点组成的FIFO双向链表。每个Node包装一个等待线程，包含前驱节点、后继节点、等待模式（独占或共享）等信息。

AQS采用模板方法模式，子类需要实现以下方法（根据同步器的语义选择实现）：

- `tryAcquire(int arg)`：独占方式获取同步状态。
- `tryRelease(int arg)`：独占方式释放同步状态。
- `tryAcquireShared(int arg)`：共享方式获取同步状态——返回正数表示成功且后续共享获取可以成功，0表示成功但后续共享获取不能成功，负数表示失败。
- `tryReleaseShared(int arg)`：共享方式释放同步状态。
- `isHeldExclusively()`：当前线程是否独占持有同步状态。

**ReentrantLock的可重入实现**

ReentrantLock是AQS最典型的应用。其内部类Sync继承AQS，NonfairSync和FairSync是Sync的两个实现。

可重入性的实现：
- `tryAcquire`中，如果当前线程是锁的持有线程，将state加1（记录重入次数）。
- `tryRelease`中，将state减1。当state变为0时，锁被完全释放。

非公平锁（NonfairSync）的`tryAcquire`：
1. 检查state：如果为0，直接通过CAS尝试获取锁。
2. 如果state不为0，检查当前线程是否为持有线程，如果是则state++（重入）。
3. 如果以上都不满足，获取失败，线程加入等待队列。

公平锁（FairSync）的`tryAcquire`在非公平锁的基础上增加了`hasQueuedPredecessors()`检查——如果队列中有比当前线程更早的等待节点，当前线程不能获取锁。

**非公平锁 vs 公平锁的性能差异**

非公平锁的吞吐量通常高于公平锁，原因在于：
- 非公平锁允许"插队"：在锁释放的瞬间，正在等待的线程需要被唤醒（涉及上下文切换），而新来的线程可能恰好正处于活跃状态，可以直接获得锁。
- 公平锁的严格排队增加了线程阻塞和唤醒的频率。

但非公平锁可能导致线程饥饿（极端情况下，某个线程可能长时间得不到锁）。

**CountDownLatch**

CountDownLatch基于AQS的共享模式实现，state表示计数器的初始值：
- `await()`：调用`tryAcquireShared`，如果state不为0，线程加入等待队列。
- `countDown()`：调用`tryReleaseShared`，将state减1。如果state变为0，唤醒所有等待线程。

CountDownLatch是一次性的——计数器归零后不能重置。如果需要重置，可以使用`CyclicBarrier`。

**Semaphore**

Semaphore基于AQS的共享模式，state表示剩余的许可数量：
- `acquire()`：调用`tryAcquireShared`，尝试减少state。如果state不够（<0），线程加入等待队列。
- `release()`：调用`tryReleaseShared`，增加state，唤醒等待线程。

Semaphore支持公平和非公平两种模式，其公平性语义与ReentrantLock类似。

**AQS的高级特性**

**条件队列（ConditionObject）**：AQS的内部类ConditionObject实现了`Condition`接口，提供了类似Object.wait/notify的等待通知机制。每个ConditionObject维护一个独立的等待队列（单向链表）。一个锁可以关联多个Condition，实现更精细的等待通知控制。

`await()`的实现：将当前线程加入条件等待队列，释放锁，阻塞。当被signal唤醒时，重新尝试获取锁。
`signal()`的实现：将条件等待队列中的第一个线程节点转移到AQS主队列（CLH队列）中，唤醒该线程。

**超时获取**：AQS支持`tryAcquireNanos`方法，在指定时间内尝试获取同步状态。如果超时，返回false。

**可中断获取**：AQS支持`acquireInterruptibly`方法，在等待过程中响应中断。

### 10.1.4 锁升级与锁消除的JIT实现细节

JIT编译器（特别是C2）对锁的优化是自动进行的，但理解其实现细节有助于编写对锁优化友好的代码。

**逃逸分析与锁消除**

锁消除依赖于逃逸分析的精确度。C2的逃逸分析分为三个步骤：

1. **连接图构建（Connection Graph Building）**：C2构建程序的状态图，追踪每个对象引用的来源和去向。对于每个new指令创建的对象，C2会记录该对象的所有使用点（存储到字段、传递给方法、返回等）。

2. **逃逸状态分析**：根据连接图，C2确定每个对象是否发生了：
   - **NoEscape**：对象仅在当前方法中使用，没有传递给其他方法，也没有返回。
   - **ArgEscape**：对象作为参数传递给其他方法，但被调用方法不会让对象逃逸到调用者的外部（通过方法内联分析确定）。
   - **GlobalEscape**：对象被赋值给字段或返回，可能被其他线程访问。

3. **锁消除决策**：如果对象的逃逸状态是NoEscape或ArgEscape且参数没有线程逃逸，则可以消除该对象上的所有同步操作。

锁消除的日志可以通过`-XX:+PrintEliminateLocks`查看（需要`-XX:+UnlockDiagnosticVMOptions`）：

```
HotSpot Eliminate Locks:
 Eliminated lock at bci 12 in com.jvmbook.ch10.LockContentionDemo::runSynchronized
```

**锁粗化的实现**

C2检测连续的加锁和解锁操作，通过以下条件判断是否可以进行锁粗化：

1. 锁操作之间没有其他可能改变程序状态的副作用。
2. 锁对象是同一个。
3. 连续的加锁-解锁操作形成一个"锁区间"（Lock Region），该区间可以被扩展覆盖整个区域。

锁粗化的日志可以通过`-XX:+PrintCoalesceEliminatedLocks`查看。

**锁升级的触发条件**

锁升级是运行时行为，由HotSpot的字节码解释器和JIT编译后的代码共同实现。触发锁升级的关键事件：

- **偏向锁撤销**：当另一个线程尝试获取偏向锁时，偏向锁被撤销。撤销的代价较高（需要安全点），因此高竞争场景下偏向锁会成为性能拖累。这也是JDK 15移除偏向锁的原因。
- **轻量级锁膨胀**：当多个线程同时竞争轻量级锁（CAS失败），轻量级锁膨胀为重量级锁。膨胀过程需要创建ObjectMonitor、初始化等待队列等。

JDK 8及之前版本的锁升级不可逆——一旦升级为重量级锁，即使后续没有竞争，也不会降级。JDK 9引入的锁降级机制（在全局安全点进行）可以缓解这一问题，但实际效果有限。

### 10.1.5 JDK 21虚拟线程：并发编程的新范式

虚拟线程（Virtual Threads，项目Loom）是JDK 21正式发布的重量级特性。它从根本上改变了Java并发编程的模型——从"以线程为中心"变为"以任务为中心"。

**平台线程 vs 虚拟线程**

- **平台线程（Platform Thread）**：传统的Java线程，是对操作系统线程的包装。每个平台线程都占用1MB左右的栈空间（可配置），创建和切换的开销较大。一个典型的Java应用通常只能承载几千到几万个平台线程。
- **虚拟线程（Virtual Thread）**：由JVM管理的轻量级线程，栈空间只有几百字节。一个虚拟线程对应一个或多个平台线程——当虚拟线程执行阻塞操作（如I/O、锁等待）时，JVM会将其从当前平台线程上"卸载"（Unmount），然后在该平台线程上调度另一个虚拟线程。

**虚拟线程的实现原理**

虚拟线程的核心是一个**工作窃取调度器（Work-Stealing Scheduler）**——基于ForkJoinPool的实现。

虚拟线程的生命周期：

1. **创建**：`Thread.startVirtualThread()`或`Executors.newVirtualThreadPerTaskExecutor()`创建一个虚拟线程。此时，虚拟线程还没有绑定到任何平台线程。
2. **挂载（Mount）**：当虚拟线程开始执行时，JVM的调度器将其"挂载"到一个平台线程（称为载体线程，Carrier Thread）上执行。
3. **执行**：虚拟线程在载体线程上执行其任务。从虚拟线程内部的视角看，执行是连续的；但从外部视角看，一个虚拟线程可能多次在不同的载体线程上执行（由于yield或阻塞）。
4. **卸载（Unmount）**：当虚拟线程执行阻塞操作（如`socket.read()`、`锁等待`）时，JVM将其从载体线程上卸载，保存其栈帧和状态。载体线程转而执行其他虚拟线程。
5. **恢复**：当阻塞操作完成（如数据到达、锁可用）时，JVM将虚拟线程重新挂载到一个可用的载体线程上继续执行。

**挂载/卸载的关键机制——Continuation**

虚拟线程的核心实现是Continuation（延续）。Continuation是JVM层面的一个抽象，它捕获了一个执行点的状态（包括局部变量、操作数栈、程序计数器等）。当虚拟线程阻塞时，Continuation被冻结（Freeze）；当虚拟线程恢复时，Continuation被解冻（Thaw）。

Continuation的冻结和解冻不需要操作系统参与——完全由JVM在用户空间完成。这也是虚拟线程轻量的根本原因。

**虚拟线程的适用场景**

虚拟线程最适合**IO密集型**应用：
- Web服务器处理大量并发请求（每个请求涉及多次I/O操作）。
- 数据库访问层（JDBC连接等待）。
- 消息队列消费端。
- 微服务间的HTTP/RPC调用。

虚拟线程不适合**CPU密集型**应用：
- 并行计算、数据处理（这些场景下，线程数通常等于CPU核心数，虚拟线程没有优势）。
- 长时间持有锁的操作（锁竞争时，虚拟线程被阻塞，但载体线程仍然存在，可能反而增加开销）。

**虚拟线程的注意事项**

1. **线程池的语义改变**：在虚拟线程时代，传统的"线程池"模式不再适用。创建虚拟线程的开销极低（约1微秒），因此不需要池化。`Executors.newVirtualThreadPerTaskExecutor()`为每个任务创建一个新的虚拟线程。

2. **synchronized与虚拟线程**：当虚拟线程在synchronized块中阻塞时，JVM当前的实现是**固定（Pin）**虚拟线程——即在synchronized阻塞期间，虚拟线程不会被卸载，它占用的载体线程也无法被其他虚拟线程使用。这意味着，在大规模使用synchronized的场景下，虚拟线程的伸缩性优势会被削弱。建议在高并发场景下使用`ReentrantLock`代替synchronized。

3. **ThreadLocal的重新思考**：虚拟线程数量可能极大（百万级），每个虚拟线程维护的ThreadLocal对象也会占用大量内存。传统的ThreadLocal使用模式（如在Web请求中存储用户会话）在虚拟线程场景下需要谨慎评估。

4. **调试与诊断**：虚拟线程的栈轨迹可能非常深（由于多次挂载/卸载），传统的jstack输出会包含大量Continuation相关帧。JDK 21引入了`jcmd`命令的`Thread.vthread`子命令来专门诊断虚拟线程。

---

## 10.2 案例实践

### Case 10-1: 线程转储分析死锁

#### 场景与问题

某金融交易系统在运行一段时间后，出现偶发性**完全无响应**的情况——所有HTTP请求都超时，数据库连接池耗尽，CPU使用率降至接近0。这种"假死"状态持续几分钟后，系统自行恢复（因为某些等待线程超时），但不久后又再次发生。

现场保留的jstack线程转储显示，系统中存在典型的**ABBA死锁**：

```
"Thread-1" #13 prio=5 os_prio=0 cpu=12.50ms elapsed=120.32s
  java.lang.Thread.State: BLOCKED
    at com.trade.OrderService.lambda$processOrder$1(OrderService.java:45)
    - waiting to lock <0x000000076b8c6a50> (a java.lang.Object)
    - locked <0x000000076b8c6978> (a java.lang.Object)

"Thread-2" #14 prio=5 os_prio=0 cpu=8.23ms elapsed=120.31s
  java.lang.Thread.State: BLOCKED
    at com.trade.InventoryService.lambda$updateStock$2(InventoryService.java:38)
    - waiting to lock <0x000000076b8c6978> (a java.lang.Object)
    - locked <0x000000076b8c6a50> (a java.lang.Object)
```

Thread-1持有锁A等待锁B，Thread-2持有锁B等待锁A——经典的死锁环路。

但更深层的分析发现，**还有一个隐藏的资源饥饿问题**：一个名为"ReportWorker"的后台线程长时间没有获得CPU时间，导致其维护的一个计数器长期未被更新，使得主线程（等待该计数）也陷入阻塞。

#### 工具与准备

**jstack**是JDK自带的线程转储工具，可以快速确认死锁：

```bash
jstack -l <pid>
```

输出中，jstack会自动检测死锁循环并在末尾打印"Found one Java-level deadlock"。

**Arthas的thread命令**提供了更友好的死锁诊断：

```bash
# 查看所有线程状态
thread

# 自动检测死锁并打印导致死锁的线程
thread -b

# 查看单个线程的堆栈和CPU消耗
thread 13
```

**JFR（JDK Flight Recorder）**可以捕获Java Monitor的等待事件，用于分析锁竞争历史而非当前快照：

```bash
java -XX:StartFlightRecording:name=deadlock,filename=deadlock.jfr
```

启动后，通过JFR事件"Java Monitor Blocked"和"Java Monitor Wait"可以分析锁等待的时间分布。

#### 问题分析

**死锁的四个必要条件：**
1. **互斥**（Mutual Exclusion）：资源一次只能被一个线程使用。
2. **持有并等待**（Hold and Wait）：线程持有至少一个资源，同时等待另一个资源。
3. **不可剥夺**（No Preemption）：资源只能由持有它的线程自愿释放。
4. **循环等待**（Circular Wait）：存在一个线程-资源的循环链。

在本案例中，代码结构如下：

```java
// OrderService.java
public void processOrder(Order order) {
    synchronized (lockOrder) {
        // ... 订单处理逻辑 ...
        synchronized (lockInventory) {
            // ... 库存扣减 ...
        }
    }
}

// InventoryService.java
public void updateStock(Item item) {
    synchronized (lockInventory) {
        // ... 库存更新 ...
        synchronized (lockOrder) {
            // ... 订单状态检查 ...
        }
    }
}
```

两个服务获取锁的顺序不一致——OrderService先锁订单再锁库存，InventoryService先锁库存再锁订单。当两个线程同时调用这两个方法时，死锁发生。

**资源饥饿分析**：

进一步查看jstack输出，发现"ReportWorker"线程的状态为`RUNNABLE`，但其CPU消耗几乎为0（elapsed time很大但cpu time很小）。这表明该线程虽然未被阻塞，但获得的调度时间极少。原因在于系统中的其他线程（特别是死锁线程）占用了大量CPU调度资源，导致ReportWorker被"饿死"。

#### 解决方案

**方案1：锁顺序规范化**

最简单的解决方案是确保所有线程以相同的顺序获取锁：

```java
public class LockOrdering {
    // 定义全局锁顺序
    private static final Object LOCK_ORDER = new Object();
    private static final Object LOCK_INVENTORY = new Object();

    public void processOrder(Order order) {
        synchronized (LOCK_ORDER) {      // 先订单锁
            synchronized (LOCK_INVENTORY) {  // 再库存锁
                // ...
            }
        }
    }

    public void updateStock(Item item) {
        synchronized (LOCK_ORDER) {      // 先订单锁（与原代码不同！）
            synchronized (LOCK_INVENTORY) {  // 再库存锁
                // ...
            }
        }
    }
}
```

通过为每个锁分配一个全局序号，所有线程按照序号递增的顺序获取锁，可以打破循环等待条件。

**方案2：使用tryLock超时**

使用ReentrantLock的`tryLock`方法，在指定时间内无法获取锁时主动放弃并释放已有锁：

```java
public void processOrder(Order order) {
    if (lockOrder.tryLock()) {
        try {
            if (lockInventory.tryLock(1, TimeUnit.SECONDS)) {
                try {
                    // ... 业务逻辑 ...
                } finally {
                    lockInventory.unlock();
                }
            } else {
                // 获取库存锁超时，记录日志，重试或回滚
                log.warn("Failed to acquire inventory lock, retrying...");
            }
        } finally {
            lockOrder.unlock();
        }
    }
}
```

`tryLock`超时机制将死锁转化为锁获取失败，避免系统永久阻塞。

**方案3：使用jstack和JFR做在线诊断**

在容器化部署环境中，建议将jstack和JFR集成到监控体系中：

```bash
# 自动化死锁检测脚本
PID=$(jps -l | grep TradeApplication | awk '{print $1}')
jstack -l $PID | grep -A 20 "deadlock" > /tmp/deadlock_$(date +%Y%m%d_%H%M%S).log
```

JFR配置建议：
```bash
-XX:StartFlightRecording:delay=30s,duration=60s,\
  filename=deadlock_analysis.jfr,\
  settings=profile
```

JFR的"Java Monitor Blocked"事件显示每个线程在锁上的等待时间和等待次数，帮助识别哪些锁是热点锁。

#### 小结

死锁是最难以排查的并发问题之一——因为它具有偶发性、与环境相关、且发生后系统"静默失败"（没有异常，只有无响应）。诊断死锁的最佳实践：

1. **保留现场**：系统无响应时，立即执行jstack -l保存所有线程的堆栈。
2. **检测死锁环路**：jstack自动检测Java-level死锁，Arthas thread -b提供类似功能。
3. **分析锁顺序**：检查所有获取多个锁的代码路径，确保锁顺序一致。
4. **使用超时机制**：ReentrantLock.tryLock()将死锁转化为可处理的超时异常。
5. **监控锁等待**：JFR的Java Monitor事件可以帮助分析生产环境中的锁竞争。

### Case 10-2: 锁竞争导致吞吐下降

#### 场景与问题

某电商平台的大促活动期间，核心商品详情接口（QPS从平时的5万飙升至50万）的P99延迟从10ms飙升到800ms。CPU使用率仅30%，但系统吞吐量停滞在远低于预期的水平。

初步分析发现，接口内部使用了一个全局的`ConcurrentHashMap`来做商品信息的本地缓存（Tiered Cache），并通过`synchronized`来保护缓存的更新操作。由于大促期间大量请求首次访问缓存（缓存预热阶段），synchronized块的竞争变得异常激烈。

#### 工具与准备

**async-profiler的wall模式**可以精确测量锁竞争导致的线程阻塞时间：

```bash
# wall模式：采样所有线程状态，包括阻塞的线程
./profiler.sh -e wall -d 60 -f wall-flamegraph.html <pid>

# lock模式：专门分析锁竞争
./profiler.sh -e lock -d 60 -f lock-flamegraph.html <pid>
```

wall模式火焰图中，宽大的"java.lang.Object.wait"或"unsafe.park"条块表明锁竞争严重。

**JFR的Java Monitor事件**提供了锁竞争的定量分析：

```bash
# 使用JFR profile配置
-XX:StartFlightRecording:delay=10s,duration=120s,\
  filename=lock-contention.jfr,\
  settings=profile
```

使用JDK Mission Control（JMC）打开JFR文件，查看"Java Monitor Blocked"和"Java Monitor Park"事件的聚合统计，可以识别出"热点锁"——即等待时间总和最高的锁对象。

#### 问题分析

通过async-profiler的wall模式火焰图分析，发现超过60%的线程时间被消耗在以下调用栈上：

```
synchronized (CacheManager.class) { cache.put(key, value); }
    ^-- 约60%的采样点落在此处
```

进一步分析锁持有时间，发现每次锁持有时间中位数为5ms——这是因为缓存更新时涉及序列化和外部存储读取（在同步块内部）。

锁的持有时间分布：
- P50：5ms
- P90：15ms
- P99：50ms

在50万QPS下，锁的平均等待时间呈指数级增长——因为锁的持有时间较长，大量线程在排队等待。

#### 解决方案

**方案1：锁拆分（分段锁）**

将单一的全局锁拆分为多个分段锁，每个分段保护一部分缓存键：

```java
public class StripedCache {
    private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();
    private final StripedLock[] locks = new StripedLock[256];

    public CacheEntry getOrCompute(String key, Supplier<CacheEntry> loader) {
        CacheEntry entry = cache.get(key);
        if (entry != null) return entry;

        // 根据key的哈希值选择分段锁
        int stripe = Math.abs(key.hashCode() % locks.length);
        locks[stripe].lock();
        try {
            // 双重检查
            entry = cache.get(key);
            if (entry == null) {
                entry = loader.get();
                cache.put(key, entry);
            }
            return entry;
        } finally {
            locks[stripe].unlock();
        }
    }
}
```

分段锁的效果取决于哈希分布的均匀性。在键分布均匀的情况下，256个分段可以将锁竞争降低到原来的1/256。

**方案2：读写锁优化**

在缓存场景中，读操作远多于写操作（读多写少）。使用`ReentrantReadWriteLock`可以让读操作并行执行：

```java
public class ReadWriteCache {
    private final ReentrantReadWriteLock rwLock = new ReentrantReadWriteLock();
    private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public CacheEntry get(String key) {
        rwLock.readLock().lock();
        try {
            return cache.get(key);
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public void put(String key, CacheEntry entry) {
        rwLock.writeLock().lock();
        try {
            cache.put(key, entry);
        } finally {
            rwLock.writeLock().unlock();
        }
    }
}
```

在JDK 8+中，`ConcurrentHashMap`本身就支持高效并发读（读操作不需要加锁），因此读写锁在缓存场景中的实际收益有限。更推荐使用`ConcurrentHashMap`的原子方法。

**方案3：无锁化——CAS和LongAdder**

对于计数器类的操作，使用`LongAdder`代替`synchronized`可以彻底消除锁竞争：

`LongAdder`内部维护了一个`Cell[]`数组，每个Cell对应一个CPU核心或线程——不同的线程更新不同的Cell，最后汇总时求和。这种"分而治之"的策略将锁竞争分散到多个Cell上。

```java
// 有锁版本
private long total = 0;
synchronized void increment() { total++; }

// 无锁版本（LongAdder）
private final LongAdder total = new LongAdder();
void increment() { total.increment(); }
```

在高度并发（8线程以上）场景下，LongAdder的吞吐量可以达到synchronized版本的5-10倍。

**方案4：使用LockContentionDemo验证优化效果**

本章提供的`LockContentionDemo`程序直观地展示了三种策略的对比：

```bash
# 运行演示程序
java -cp ch10-concurrency.jar com.jvmbook.ch10.LockContentionDemo
```

典型输出：

```
=== Lock Contention Demo ===
Threads: 8, Iterations per thread: 1000000

--- Measured Run ---
synchronized: 8432 ms (baseline)
striped lock: 1543 ms  (5.5x faster)
lock-free:    312 ms   (27.0x faster)
```

这个对比清晰地展示了锁竞争对性能的巨大影响。在真实的缓存场景中，结合分段锁和ConcurrentHashMap的原子方法，可以将锁竞争降低一个数量级以上。

#### 调优验证

优化后的缓存接口在生产环境经过灰度验证：

| 指标 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| P99延迟 | 800ms | 45ms | 94% |
| P50延迟 | 150ms | 8ms | 95% |
| 吞吐量 | 50K QPS | 200K QPS | 300% |
| CPU使用率 | 30% | 65% | 116% |

CPU使用率从30%提升到65%，说明系统从"锁等待"状态变为"实际工作"状态——这是正面的变化（不再浪费调度周期在锁等待上）。

#### 小结

锁竞争是并发性能的头号杀手。诊断和优化锁竞争的标准步骤：

1. **诊断**：使用async-profiler wall模式或JFR Java Monitor事件，识别热点锁和锁持有时间。
2. **分析**：确定锁竞争的根源——是锁粒度太大（保护了过多数据），还是锁持有时间太长（同步块内部有耗时操作）。
3. **优化**：根据分析结果选择优化策略——锁拆分、读写锁、无锁化等。
4. **验证**：使用LockContentionDemo或JMH验证优化效果，确认性能提升。

### Case 10-3: 虚拟线程 vs 传统线程池

#### 场景与问题

某API网关服务需要同时处理大量IO密集型请求——每个请求涉及多次上游服务调用（HTTP RPC调用，平均延迟20ms）。传统上，团队使用固定线程池（200线程）来处理并发请求。随着业务增长，并发请求数从2000增长到10000，线程池频繁满载，请求排队时间激增。

团队考虑引入虚拟线程（JDK 21）来解决这一问题——理论上，虚拟线程可以支持数百万并发任务，且创建和切换的开销极低。

#### 工具与准备

**JMH（Java Microbenchmark Harness）**可用于精确对比平台线程和虚拟线程在IO密集型场景下的吞吐量：

```bash
# 运行JMH基准测试
java -jar jmh-benchmark.jar -bm thrpt -t 100 -w 10 -r 10 -f 3
```

**JFR线程事件**可以分析虚拟线程的挂载/卸载开销：

```bash
-XX:StartFlightRecording:delay=5s,duration=60s,\
  filename=vt-profile.jfr,\
  settings=profile
```

在JMC中查看"Virtual Thread Start"、"Virtual Thread Mount"、"Virtual Thread Unmount"事件，统计虚拟线程的生命周期开销。

#### 问题分析

`VirtualThreadDemo`程序（本章提供）对比了固定线程池（100平台线程）和虚拟线程在10000个IO任务（每个模拟等待10ms）场景下的表现：

```bash
java -cp ch10-concurrency.jar com.jvmbook.ch10.VirtualThreadDemo
```

典型输出：

```
=== Virtual Thread Demo ===
Tasks: 10000, simulated IO delay: 10ms per task

--- Measured Run ---
Platform threads (pool=100): 10250 ms
Virtual threads:              110 ms
Speedup ratio:               93.2x
```

平台线程版本需要约10秒——因为100个线程每次只能处理100个任务，10000个任务需要100个批次，每个批次等待10ms（任务延迟）+ 调度开销。

虚拟线程版本只需要110ms——因为10000个虚拟线程几乎同时启动，大部分时间都处于IO等待状态，JVM将等待中的虚拟线程卸载，使其他虚拟线程得以执行。

**虚拟线程开销的定量分析**

通过JFR事件分析，虚拟线程的挂载/卸载开销约为0.3-1.0微秒（取决于JVM实现和任务特征）。相比于平台线程的上下文切换开销（约3-10微秒，涉及系统调用），虚拟线程的开销降低了约一个数量级。

**池化 vs 按需创建**

在平台线程场景中，线程池是必要的——因为创建平台线程的开销很大（约1ms，需要系统调用分配栈空间）。但在虚拟线程场景中，创建开销极低（约1微秒），因此不需要池化。`Executors.newVirtualThreadPerTaskExecutor()`为每个任务创建一个新的虚拟线程，然后立即销毁——这种"用完即弃"的模式在虚拟线程时代是合理的。

#### 解决方案

**方案1：从平台线程池迁移到虚拟线程**

最直接的迁移方案是将固定线程池替换为虚拟线程的按需执行器：

```java
// 平台线程池版本
ExecutorService pool = Executors.newFixedThreadPool(200);
for (Request req : requests) {
    pool.submit(() -> processRequest(req));
}

// 虚拟线程版本
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Request req : requests) {
        executor.submit(() -> processRequest(req));
    }
}
```

这种迁移在IO密集型场景下可以立即获得显著的吞吐量提升。

**方案2：保留线程池的虚拟线程包装**

对于需要控制并发度的场景（如限制数据库连接数），可以使用`Semaphore`配合虚拟线程：

```java
public class VirtualThreadWithSemaphore {
    private final Semaphore limiter = new Semaphore(100); // 限制并发数

    public void processTasks(List<Task> tasks) {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (Task task : tasks) {
                executor.submit(() -> {
                    limiter.acquire();
                    try {
                        task.process();
                    } finally {
                        limiter.release();
                    }
                });
            }
        } catch (Exception e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

这种方法既利用了虚拟线程的轻量特性，又通过Semaphore保护了有限资源（数据库连接池、外部服务连接等）。

**方案3：synchronized替换为ReentrantLock**

如前所述，虚拟线程在synchronized块中被"固定"（Pinned），无法被卸载。如果代码中大量使用synchronized，虚拟线程的伸缩性会大打折扣。建议替换为ReentrantLock：

```java
// 避免：虚拟线程在synchronized中被Pinned
private final Object lock = new Object();
public void doSomething() {
    synchronized (lock) {
        // ...
    }
}

// 推荐：使用ReentrantLock
private final ReentrantLock lock = new ReentrantLock();
public void doSomething() {
    lock.lock();
    try {
        // ...
    } finally {
        lock.unlock();
    }
}
```

#### 虚拟线程迁移指南

从基于平台线程的并发模型迁移到虚拟线程，建议遵循以下步骤：

1. **评估适用性**：确认应用是否为IO密集型（I/O等待时间占比超过50%）。CPU密集型应用不适合虚拟线程。

2. **替换线程池**：将`newFixedThreadPool`、`newCachedThreadPool`等替换为`newVirtualThreadPerTaskExecutor()`。

3. **处理synchronized**：检查代码中是否有大量使用synchronized保护的临界区。如果有，评估替换为ReentrantLock。如果临界区很短（微秒级），synchronized的Pinning影响可以忽略。

4. **评估ThreadLocal使用**：虚拟线程数量可能极大，ThreadLocal占用的内存会线性增长。如果每个虚拟线程都创建了ThreadLocal对象（如SimpleDateFormat实例），可能造成内存压力。推荐使用对象池或将ThreadLocal迁移为任务本地变量（ScopedValue，JDK 21预览特性）。

5. **监控与诊断**：使用JFR监控虚拟线程的挂载/卸载次数和持续时间。异常高的挂载次数（>100次/秒/虚拟线程）可能表明存在频繁的锁竞争或I/O重试。

6. **逐步灰度**：先迁移非核心服务，验证虚拟线程的稳定性和性能表现，再逐步推广到核心服务。

#### 小结

虚拟线程是Java并发编程的一次革命。它让IO密集型应用的开发模型从"通过线程池限制并发"变为"每个请求一个线程，用完即弃"。以下是虚拟线程的决策指南：

| 场景 | 推荐模型 | 原因 |
|------|----------|------|
| IO密集型（HTTP/RPC/DB调用） | 虚拟线程 | 挂载/卸载开销极低，吞吐量大幅提升 |
| CPU密集型（计算/数据处理） | 平台线程池（核心数） | 虚拟线程无优势，上下文切换不减少 |
| 混合型 | 虚拟线程 | 大多数应用属于此类，推荐尝试 |
| 大量synchronized | 先替换为ReentrantLock | 避免Pinning导致的伸缩性损失 |
| 大量ThreadLocal | 评估后迁移 | 高并发下内存占用可能巨大 |
| 需要控制并发度 | 虚拟线程 + Semaphore | 结合两者优势 |

---

## 本章总结

### 并发诊断工具总结

| 工具/参数 | 用途 | 使用场景 |
|-----------|------|----------|
| jstack -l | 线程转储，死锁检测 | 立即诊断系统无响应、死锁 |
| jcmd Thread.print | 线程转储替代命令 | 与jstack类似，JDK 9+推荐 |
| Arthas thread -b | 自动死锁检测 | 实时诊断死锁，无需等待jstack输出 |
| async-profiler (-e wall) | 锁竞争分析 | 识别热点锁、锁持有时间 |
| async-profiler (-e lock) | 锁事件采样 | 轻量级锁事件分析 |
| JFR Java Monitor Blocked | 锁阻塞事件记录 | 历史锁竞争分析，生产环境可用 |
| JFR Java Monitor Wait | Object.wait事件记录 | 等待-通知模式分析 |
| JFR Virtual Thread事件 | 虚拟线程生命周期分析 | JDK 21+虚拟线程诊断 |
| JMH | 微基准测试 | 精确测量锁优化效果 |
| LockContentionDemo | 三种锁策略对比 | 本章教学演示 |
| VirtualThreadDemo | 虚拟线程 vs 线程池对比 | 本章教学演示 |

### 锁优化Checklist

在多线程开发中，逐项检查以下内容可以帮助识别和解决锁问题：

**设计阶段：**
- [ ] 是否需要锁？能否使用无锁数据结构（ConcurrentHashMap、LongAdder、AtomicXXX）？
- [ ] 锁的粒度是否最小（保护尽可能少的数据）？
- [ ] 锁的持有时间是否最短（不在同步块内执行耗时操作）？
- [ ] 锁的顺序是否全局一致？（防止死锁）
- [ ] 是否使用更高效的锁机制（ReentrantLock vs synchronized，读写锁 vs 互斥锁）？

**诊断阶段：**
- [ ] 是否存在死锁？（jstack -l、Arthas thread -b检查）
- [ ] 哪些锁是热点锁？（async-profiler wall模式、JFR检查）
- [ ] 锁的持有时间分布如何？（P50/P90/P99）
- [ ] 锁竞争导致多少线程阻塞？（阻塞线程数/总线程数）
- [ ] 系统是否因为锁等待而CPU使用率偏低？

**优化阶段：**
- [ ] 能否将锁拆分为分段锁？（Striped Lock模式）
- [ ] 能否将互斥锁替换为读写锁？（读多写少场景）
- [ ] 能否将锁替换为CAS/LongAdder？（计数器/累加器场景）
- [ ] 能否将同步块从循环中移出？（锁粗化）
- [ ] 能否使用tryLock超时机制？（替代无限制锁等待）

### 虚拟线程迁移指南

从平台线程迁移到虚拟线程的推荐路线图：

**第一阶段：评估与准备（1-2天）**
1. 使用JFR记录应用的线程使用情况（平台线程数量、阻塞时间分布）。
2. 识别IO密集型组件：HTTP客户端、数据库访问层、消息队列消费端。
3. 审计synchronized使用：列出所有synchronized块，评估其持有时间和竞争程度。
4. 审计ThreadLocal使用：估算高并发下的内存占用。

**第二阶段：试点迁移（1-2周）**
1. 选择非核心、IO密集型的服务组件作为试点。
2. 将`ExecutorService`替换为`Executors.newVirtualThreadPerTaskExecutor()`。
3. 将短临界区的synchronized替换为ReentrantLock（保留长临界区的synchronized）。
4. 部署到预发布环境，使用JMH和JFR对比性能。

**第三阶段：推广与优化（持续）**
1. 根据试点经验，逐步推广到核心服务。
2. 使用JFR持续监控虚拟线程的健康状况（挂载/卸载频率、Pinning事件）。
3. 关注JDK后续版本对虚拟线程的改进（如synchronized Pinning的优化）。
4. 在新项目中默认使用虚拟线程（除非有明确的反指示）。

### 常见并发问题解答

**1. "ConcurrentHashMap还需要加锁吗？"**
   ConcurrentHashMap的单个操作（get、put、computeIfAbsent）是线程安全的。但复合操作（如先get再put）不是原子的。如果多个操作需要原子性组合，仍然需要外部锁。推荐使用ConcurrentHashMap提供的原子组合方法（如`compute`、`merge`）来避免外部加锁。

**2. "volatile和synchronized的区别是什么？"**
   volatile保证可见性和有序性，但不保证原子性。synchronized同时保证可见性、有序性和原子性。对于简单的状态标志（如`running`标志），volatile足够。对于读-改-写操作（如`count++`），必须使用synchronized或Atomic类。

**3. "为什么轻量级锁在竞争激烈时反而比重量级锁慢？"**
   轻量级锁通过自旋（CAS）来获取锁，自旋会消耗CPU。当锁持有时间较长时，大量自旋浪费CPU周期。重量级锁在竞争时直接阻塞线程，线程不消耗CPU。因此，短持有时间、低竞争场景下轻量级锁高效，长持有时间、高竞争场景下重量级锁更合适。

**4. "虚拟线程中使用了synchronized会怎样？"**
   虚拟线程在synchronized块中被固定（Pinned），无法从载体线程卸载。这会导致载体线程被占用，其他虚拟线程无法在该载体线程上执行。如果大量虚拟线程同时进入synchronized块，可能导致载体线程耗尽，系统退化回平台线程模式。建议在虚拟线程场景下使用ReentrantLock代替synchronized。

**5. "偏向锁移除后性能会变差吗？"**
   JDK 15+默认禁用了偏向锁（JDK 18+移除了实现）。对于大多数现代应用（特别是基于线程池的应用），偏向锁的维护成本超过了其收益。偏向锁移除后，在确实存在"单线程重复获取锁"的场景下，性能可能会略有下降（从无开销的偏向锁变为CAS操作的轻量级锁）。但这种性能差异通常不超过几个百分点，且换来了更简单可靠的锁实现。
