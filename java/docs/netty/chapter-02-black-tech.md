# 第2章 榨干硬件性能：Netty 的四大底层"黑科技"

## 2.1 极致的 I/O 多路复用与 Epoll 优化

### Epoll 的 LT 与 ET 触发机制

Linux epoll 有两种触发模式：**LT（Level-Triggered，水平触发）** 和 **ET（Edge-Triggered，边缘触发）**。理解它们的区别是理解 Netty 网络模型的关键：

```
LT（水平触发）——默认模式：
  ┌────────────────────────────────────────────┐
  │  Socket 缓冲区中有 100 字节数据              │
  │                                              │
  │  epoll_wait() 返回 → 通知有数据可读           │
  │  read() 读了 30 字节                          │
  │                                              │
  │  epoll_wait() 又返回了！← 因为缓冲区还有 70 字节  │
  │  read() 读了 70 字节                          │
  │                                              │
  │  epoll_wait() 阻塞等待 ← 缓冲区空了            │
  │                                              │
  │  特点：只要缓冲区还有数据，每次 epoll_wait 都返回 │
  │  优点：不容易丢事件，编码简单                    │
  │  缺点：可能重复通知，有性能损耗                  │
  └────────────────────────────────────────────┘

ET（边缘触发）——高性能模式：
  ┌────────────────────────────────────────────┐
  │  Socket 缓冲区中有 100 字节数据              │
  │                                              │
  │  epoll_wait() 返回 → 通知有数据可读           │
  │  （从"没数据"变成"有数据"的瞬间触发一次）       │
  │                                              │
  │  read() 读了 30 字节                          │
  │                                              │
  │  epoll_wait() 阻塞等待 ← 不会再通知！           │
  │  （尽管缓冲区还有 70 字节，但"边缘"已经过了）    │
  │                                              │
  │  你必须一次性读完！否则剩下的数据就"丢"了！       │
  │  必须配合非阻塞 I/O，循环 read() 直到 EAGAIN  │
  │                                              │
  │  特点：每个事件只通知一次                       │
  │  优点：事件通知次数少，性能更高                  │
  │  缺点：必须非阻塞循环读完，容易丢失数据           │
  └────────────────────────────────────────────┘
```

**Netty 默认使用 LT 模式**（通过 JDK NIO 的 Selector）。LT 模式虽然不如 ET 极致，但胜在**安全、可靠、编码简单**。Netty 在 LT 模式上通过其他手段（如批量读取）来弥补性能差异。

### Netty 如何绕过 JDK NIO 的 Epoll 空轮询 Bug

Netty 有一个著名的防御机制——`rebuildSelector`，专门应对 JDK 的 Epoll 空轮询 Bug：

```
空轮询 Bug 的触发条件：
  1. Selector.select(timeout) 明明超时了
  2. 但 selectedKeys() 返回值是 0（没有事件）
  3. 按正常逻辑，应该继续 select() 等待
  4. 但 Bug 导致 select() 立即返回 0
  5. 形成了"select → 0 → 立即返回 → select → 0"的死循环
  6. CPU 100%

Netty 的防御策略：
  ┌────────────────────────────────────────────┐
  │  Netty 的 NioEventLoop 循环：                │
  │                                              │
  │  while (true) {                              │
  │    int selected = selector.select(timeout);  │
  │                                              │
  │    if (selected == 0) {                      │
  │      // 计数：连续多少次 select 返回 0        │
  │      selectCnt++;                            │
  │    }                                         │
  │                                              │
  │    if (selectCnt > SELECTOR_AUTO_REBUILD_THRESHOLD(512)) {
  │      // 连续 512 次 select 返回 0！
  │      // 确定触发了空轮询 Bug
  │      rebuildSelector();                      │
  │    }                                         │
  │  }                                           │
  │                                              │
  │  rebuildSelector() 内部：                      │
  │    1. 创建新的 Selector                       │
  │    2. 将旧 Selector 上所有的 Channel 注册到新 │
  │    3. 关闭旧 Selector                        │
  │    4. 用新 Selector 替代旧                    │
  │    → Bug 被绕过了！                           │
  └────────────────────────────────────────────┘
```

```java
// Netty 源码级防御（简化自 NioEventLoop）
public class NioEventLoop extends SingleThreadEventLoop {
    private static final int SELECTOR_AUTO_REBUILD_THRESHOLD = 512;
    private int selectCnt = 0;

    private void select() throws IOException {
        for (;;) {
            int selectedKeys = selector.select(timeoutMillis);

            if (selectedKeys != 0 || oldWakenUp) {
                selectCnt = 0; // 正常情况，重置计数
                break;
            }

            selectCnt++;
            if (selectCnt > SELECTOR_AUTO_REBUILD_THRESHOLD) {
                // 触发重建
                rebuildSelector();
                selectCnt = 0;
                break;
            }
        }
    }

    private void rebuildSelector() {
        Selector newSelector = openSelector();
        // 迁移所有 Channel 到新 Selector
        for (SelectionKey key : selector.keys()) {
            int interestOps = key.interestOps();
            Channel ch = (Channel) key.channel();
            ch.register(newSelector, interestOps);
        }
        // 关闭旧的
        selector.close();
        selector = newSelector;
    }
}
```

---

## 2.2 零拷贝（Zero-Copy）技术的深度应用

### 传统 I/O 的数据拷贝痛点

```
传统 I/O 路径（从磁盘读取文件发送到网络）：

  磁盘                   内核空间                  用户空间                  内核空间                 网卡
    │                       │                        │                       │                    │
    │ DMA 读取              │                        │                       │                    │
    │ ──────────────────►   │                        │                       │                    │
    │                  ┌────────┐                    │                       │                    │
    │                  │内核缓冲 │                    │                       │                    │
    │                  │pagecache│                    │                       │                    │
    │                  └────────┘                    │                       │                    │
    │                       │ CPU 拷贝（1次）         │                       │                    │
    │                       │ ──────────────────►   │                       │                    │
    │                       │                ┌──────────┐                  │                    │
    │                       │                │应用缓冲   │                  │                    │
    │                       │                └──────────┘                  │                    │
    │                       │                        │ CPU 拷贝（2次）      │                    │
    │                       │                        │ ──────────────────► │                    │
    │                       │                        │              ┌──────────┐               │
    │                       │                        │              │Socket 缓冲│               │
    │                       │                        │              └──────────┘               │
    │                       │                        │                    │ DMA 拷贝            │
    │                       │                        │                    │ ────────────────►   │
    │                       │                        │                    │                    │
    │  总共 4 次拷贝（2 次 DMA + 2 次 CPU 拷贝）        │                    │                    │
    │  2 次上下文切换                                    │                    │                    │
```

### Netty 的"用户态零拷贝"

Netty 的零拷贝是**用户态**的零拷贝——在 Java 层面避免不必要的内存拷贝，而不是操作系统层面的零拷贝（那是 `sendfile` / `mmap` 做的事）。

**`CompositeByteBuf`——逻辑合并**

```
传统做法：合并两个 ByteBuf
  ByteBuf header = ...; // 头部
  ByteBuf body = ...;   // 体

  // ❌ 需要创建一个新的 ByteBuf，把 header 和 body 都拷进去
  ByteBuf packet = Unpooled.buffer(header.readableBytes() + body.readableBytes());
  packet.writeBytes(header);
  packet.writeBytes(body); // 数据被复制了一次！

Netty 的 CompositeByteBuf：
  // ✅ 逻辑合并，不拷贝数据
  CompositeByteBuf packet = Unpooled.compositeBuffer();
  packet.addComponents(true, header, body);
  // 两个 ByteBuf 在逻辑上被当成一个，但没有数据复制
```

**`FileRegion` + `sendfile` 系统调用**

```
FileRegion 的原理：
  应用程序              内核空间                  网卡
    │                     │                       │
    │ FileRegion          │                       │
    │ ──────────────►    │ sendfile()            │
    │                     │ ──────────────────►  │
    │                     │                       │
    │  数据直接从内核缓冲到网卡                      │
    │  不经过用户空间！                             │
```

```java
// 使用 FileRegion 实现零拷贝文件传输
public class FileServerHandler extends ChannelInboundHandlerAdapter {

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        // 返回文件给客户端——零拷贝
        FileRegion region = new DefaultFileRegion(
            new FileInputStream("/path/to/bigfile.zip").getChannel(),
            0, fileSize
        );
        ctx.writeAndFlush(region);

        // 对比：传统方式（非零拷贝）
        // byte[] bytes = Files.readAllBytes(path);  // 读入用户空间
        // ctx.writeAndFlush(Unpooled.wrappedBuffer(bytes)); // 再写到 Socket
    }
}
```

**`wrap()` 包装技术**

```java
// wrap()——将 byte[] 包装为 ByteBuf，不拷贝
byte[] bytes = new byte[1024];
// ❌ 传统方式：复制数据
ByteBuf buf1 = Unpooled.buffer(bytes.length);
buf1.writeBytes(bytes); // 数据被复制了一次

// ✅ Netty 方式：包装，不复制
ByteBuf buf2 = Unpooled.wrappedBuffer(bytes);
// buf2 直接引用 byte[] 的内容，没有复制
// 注意：byte[] 变化时，buf2 的内容也变
```

### 操作系统级零拷贝 vs Netty 级零拷贝

```
零拷贝的两种层次：

  操作系统级零拷贝（sendfile、mmap）：
    数据在内核态内部流转，不经过用户态
    Java 层面无法直接调用，需要通过 FileChannel.transferTo()
    FileRegion 封装了 FileChannel.transferTo()

  Netty 用户态零拷贝（CompositeByteBuf、wrap、Slice）：
    在 Java 堆内避免数据复制
    不是真正的"零系统调用"，但减少了 JVM 堆内的内存拷贝
    核心思想：复用已有内存，不创建新对象

  两者结合：
    - 大文件传输：用 FileRegion（操作系统零拷贝）
    - 协议编解码：用 CompositeByteBuf / wrap（用户态零拷贝）
```

---

## 2.3 内存池（ByteBuf）与 jemalloc 算法

### 为什么不用 JDK 的 ByteBuffer？

| 对比维度 | JDK ByteBuffer | Netty ByteBuf |
|---------|---------------|---------------|
| **读写指针** | 一个 position 指针，读写需要 flip() | 双指针 readerIndex / writerIndex，无需 flip |
| **动态扩容** | ❌ 不支持，需要预判大小 | ✅ 自动扩容 |
| **内存池** | ❌ 每次分配新对象 | ✅ PooledByteBufAllocator，复用内存 |
| **直接内存** | ByteBuffer.allocateDirect() | ✅ 支持，有专门的池化策略 |
| **引用计数** | ❌ | ✅ ReferenceCounted，可追踪泄漏 |

```java
// JDK ByteBuffer 的痛点——flip
ByteBuffer buffer = ByteBuffer.allocate(1024);
buffer.put("hello".getBytes()); // position = 5
buffer.flip(); // position = 0, limit = 5 —— 必须 flip 才能读！
byte[] dst = new byte[buffer.remaining()];
buffer.get(dst); // position = 5

// 想继续写？又要 flip 或 compact...
buffer.compact(); // 把未读数据移到前面

// Netty ByteBuf：读写分离，不需要 flip
ByteBuf buf = Unpooled.buffer(1024);
buf.writeBytes("hello".getBytes()); // writerIndex = 5
byte[] dst = new byte[buf.readableBytes()];
buf.readBytes(dst); // readerIndex = 5
// 继续写？直接从 writerIndex 开始，不需要 flip！
buf.writeBytes(" world".getBytes()); // writerIndex = 11
```

### ByteBuf 的内存模型

```
ByteBuf 的内存结构：
  ┌────────────────────────────────────────────────────┐
  │       读取区域（已读）      │  可读区域       │  可写区域   │
  │                            │  （尚未读取）    │            │
  │                            │                  │            │
  └────────────────────────────────────────────────────┘
  ▲                         ▲                  ▲           ▲
  │                         │                  │           │
  0                   readerIndex       writerIndex    capacity
```

### jemalloc 内存分配算法

Netty 的 `PooledByteBufAllocator` 复用了 Linux jemalloc 的思想，通过层级化的内存管理减少碎片：

```
Netty 的 jemalloc 层级管理：

  Arena（竞技场）——每个线程一个 Arena，减少锁竞争
  ┌────────────────────────────────────────────┐
  │  Arena 1（线程 1 的分配都在这里）             │
  │  ┌────────────────────────────────────┐    │
  │  │  Chunk（16MB 大块）                 │    │
  │  │  ┌──────┬──────┬──────┬──────┐    │    │
  │  │  │ Page │ Page │ Page │ Page │    │    │  ← 每个 Page = 8KB
  │  │  │(8KB) │(8KB) │(8KB) │(8KB) │    │    │
  │  │  ├──────┴──┬───┴──┬───┴──────┤    │    │
  │  │  │  Subpage │      │          │    │    │  ← Subpage = 更小的单位
  │  │  │ (16B-4KB)│      │          │    │    │
  │  │  └─────────┘      └──────────┘    │    │
  │  └────────────────────────────────────┘    │
  │  ...更多 Chunk...                          │
  └────────────────────────────────────────────┘

  Arena 2（线程 2 的分配都在这里）
  ┌────────────────────────────────────────────┐
  │  ...                                       │
  └────────────────────────────────────────────┘
```

**PooledByteBufAllocator 的分配策略**：

```java
// Netty 默认使用 PooledByteBufAllocator（内存池版本）
// 字节数小于 512：在缓存中分配（最快，无锁）
// 字节数小于 8KB：在 Page 中分配
// 字节数小于 16MB：在 Chunk 中分配
// 字节数大于 16MB：直接使用 JDK 的 ByteBuffer.allocateDirect()

// 生产环境推荐：强制使用 DirectMemory + Pooled
ServerBootstrap b = new ServerBootstrap();
b.childOption(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT);
// 或者在启动参数中全局设置
// -Dio.netty.allocator.type=pooled
```

### 直接内存 vs 堆内存

```java
// 直接内存（Direct Memory）：读写 Socket 时不需要中间拷贝
ByteBuf directBuf = PooledByteBufAllocator.DEFAULT.directBuffer();
directBuf.writeBytes(data);
// 写 Socket：directBuf 的内核地址可以直接交给网卡 DMA
// 不需要经过 JVM 堆 → 零拷贝

// 堆内存（Heap Memory）：需要一次额外的拷贝
ByteBuf heapBuf = PooledByteBufAllocator.DEFAULT.heapBuffer();
heapBuf.writeBytes(data);
// 写 Socket：需要先把 heapBuf 复制到 Direct 缓冲区
// 再交给网卡 → 多一次拷贝
// ↑ 这就是为什么 Netty 默认使用 Direct Memory
```

| 对比 | Direct Memory | Heap Memory |
|------|-------------|-------------|
| 分配/回收速度 | 慢（系统调用） | 快（JVM 管理） |
| I/O 性能 | **快**（无需额外拷贝） | 慢（需要中间缓冲区） |
| GC 影响 | 不受 GC 管理（但需手动释放） | 受 GC 管理 |
| 适用场景 | **网络 I/O** | 业务编码/解码、临时操作 |

---

## 2.4 对象池（Recycler）与无锁并发组件

### Recycler 对象池——减少 GC 压力

在高并发场景下，频繁创建对象会导致两个问题：**GC 压力大**（Young GC 频繁）和 **CPU 时间损耗**（对象分配本身就是耗 CPU 的操作）。Netty 的 `Recycler` 通过线程局部缓存来复用对象：

```
Recycler 的工作原理：
  线程 1                      线程 2
    │                          │
    │ get() → 从本地缓存取     │ get() → 从本地缓存取
    │    ↓                     │    ↓
    │ ┌─────────────┐         │ ┌─────────────┐
    │ │ ThreadLocal │         │ │ ThreadLocal │
    │ │ 缓存池       │         │ │ 缓存池       │
    │ │ [obj, obj]  │         │ │ [obj, obj]  │
    │ └─────────────┘         │ └─────────────┘
    │                          │
    │ 如果本地缓存为空：         │
    │ 从共享池 borrow          │
    │ ↓                        │
    │ ┌─────────────┐         │
    │ │ 共享池       │         │
    │ │ (弱引用管理)  │         │
    │ └─────────────┘         │
```

```java
// 使用 Netty 的 Recycler 复用对象
public class NettyObjectPool {

    // 定义一个可回收的对象
    public static class Message {
        private String content;

        public void setContent(String content) {
            this.content = content;
        }

        public String getContent() {
            return content;
        }

        // 重置状态（回收前调用）
        public void recycle() {
            content = null;
        }
    }

    // 创建 Recycler
    private static final Recycler<Message> MESSAGE_RECYCLER = new Recycler<Message>() {
        @Override
        protected Message newObject(Handle<Message> handle) {
            return new Message();
        }
    };

    // 获取对象（优先从池中取）
    public static Message get() {
        return MESSAGE_RECYCLER.get();
    }

    // 回收对象
    public static void recycle(Message msg) {
        msg.recycle();
        // 自动归还到 Recycler 的缓存池
    }

    // 使用示例
    public static void main(String[] args) {
        Message msg = get();
        msg.setContent("Hello");
        System.out.println(msg.getContent());

        // 回收
        recycle(msg);
    }
}
```

### MpscQueue（多生产者单消费者无锁队列）

`MpscQueue` 是 Netty **内部使用**的核心数据结构——"多生产者单消费者"无锁队列。

```
MpscQueue 的使用场景（Netty 内部）：

  多个业务线程（生产者）          EventLoop 线程（消费者）
    │                              │
    │ submit(task1)                │
    │ ────────────────────────────►│
    │ submit(task2)                │  ┌──────────────────────┐
    │ ────────────────────────────►│  │  EventLoop 的任务队列  │
    │ submit(task3)                │  │  (MpscQueue)         │
    │ ────────────────────────────►│  │                      │
    │                              │  │  task1 → task3 → task2│
    │                              │  │                      │
    │                              │  │  单线程依次执行       │
    │                              │  └──────────────────────┘
```

**为什么是 Mpsc？** EventLoop 的模型是"一个线程处理多个 Channel"。业务线程需要提交任务到 EventLoop 线程执行（如写数据、关闭连接）。如果使用 `ConcurrentLinkedQueue`，生产者和消费者之间需要 CAS 操作，存在性能损耗。Mpsc 针对"多生产者单消费者"做了专门优化——生产者之间需要 CAS（多线程竞争入队），但**消费者不需要 CAS**（只有一个线程消费）。

### FastThreadLocal——用空间换时间

Netty 的 `FastThreadLocal` 比 JDK 的 `ThreadLocal` 更快：

```
FastThreadLocal vs ThreadLocal：

  JDK ThreadLocal 的查找：
    1. Thread.currentThread() → 获取当前线程
    2. threadLocals（ThreadLocalMap）
    3. 通过 hash 找 entry（哈希冲突时线性探测）
    → O(1) 平均，但最坏情况 O(N)

  Netty FastThreadLocal 的查找：
    1. Thread.currentThread() → 必须是 FastThreadLocalThread
    2. threadLocalMap（数组，不是哈希表！）
    3. index（直接下标访问！）
    → O(1) 严格，没有哈希冲突
```

```java
// FastThreadLocal 的使用
public class FastThreadLocalExample {

    // 定义 FastThreadLocal
    private static final FastThreadLocal<String> THREAD_LOCAL =
        new FastThreadLocal<String>() {
            @Override
            protected String initialValue() {
                return "default";
            }
        };

    public static void main(String[] args) {
        // 注意：必须使用 FastThreadLocalThread（Netty 的线程）
        // 如果用普通 Thread，FastThreadLocal 会退化为 JDK 的 ThreadLocal
        FastThreadLocalThread thread = new FastThreadLocalThread(() -> {
            System.out.println(THREAD_LOCAL.get()); // "default"
            THREAD_LOCAL.set("hello");
            System.out.println(THREAD_LOCAL.get()); // "hello"
            THREAD_LOCAL.remove();
        });
        thread.start();
    }
}
```

---

## 本章总结

| 技术 | 核心原理 | 性能收益 |
|------|---------|---------|
| **Epoll 空轮询防御** | select 返回 0 连续超过 512 次时重建 Selector | 防止 CPU 100% |
| **零拷贝（CompositeByteBuf）** | 逻辑合并多个 ByteBuf，不复制数据 | 减少内存拷贝和 GC |
| **零拷贝（FileRegion）** | 封装 sendfile 系统调用 | 数据不经过用户空间 |
| **内存池（PooledByteBufAllocator）** | jemalloc 层级管理，复用内存块 | 减少 GC 和分配开销 |
| **对象池（Recycler）** | 线程本地缓存 + 共享池 | 减少 GC 压力 |
| **MpscQueue** | 多生产者单消费者无锁队列 | 避免锁竞争 |
| **FastThreadLocal** | 数组下标直接访问 | 避免哈希冲突 |

> **对 Java 开发者的启示**：这些底层优化是 Netty 框架内部实现的，你**不需要**在业务代码中直接使用 Recycler 或 MpscQueue。但理解它们有助于你写出对 Netty 更友好的 Handler——例如，在 Handler 中尽量复用 ByteBuf 而不是每次都创建新的，尽量将非 I/O 操作异步化以避免阻塞 EventLoop 线程。