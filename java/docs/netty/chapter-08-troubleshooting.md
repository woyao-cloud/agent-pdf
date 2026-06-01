# 第8章 生产环境"三大杀手"排查

## 本章导读

有一次，一个同事半夜打电话给我："Netty 服务 OOM 了，重启了三次，每次都撑不过 2 小时就挂了。"我登录服务器看了下：`jmap -heap <pid>` 显示堆内存完全正常（老年代只用了 30%），但 `cat /proc/<pid>/status | grep VmRSS` 显示进程占用了 4GB 物理内存。问题不在堆内，在堆外。加上 `-Dio.netty.leakDetection.level=ADVANCED` 重启后，不到 5 分钟日志里就出现了：

```
LEAK: ByteBuf.release() was not called before it's garbage-collected.
Created at:
    at com.example.MyHandler.channelRead(MyHandler.java:42)
```

找到那一行代码，果然是一个 catch 块中 `ByteBuf` 没有 release。修复后重启，问题再也没出现过。

Netty 生产环境的"三大杀手"——**内存泄漏、CPU 100%、连接假死**——每一个都有清晰的症状、明确的排查工具和标准的解决方案。本章将用真实的排查案例来讲解每种问题的诊断方法和修复手段。

---

## 8.1 内存泄漏（Memory Leak）排查

### 根因：ByteBuf 未 release——Netty 中最常见的 Bug

Netty 内存泄漏的原因 90% 是一样的：**ByteBuf 申请后没有调用 `release()`**。但为什么这个看似简单的问题频繁出现？原因是大多数 Java 开发者习惯了"只管分配，GC 会回收"的思维模式，而 ByteBuf 使用的直接内存（Direct Memory）根本不受 GC 管理。

```
堆内存 vs 直接内存的回收区别：

  堆内存 ByteBuf（HeapByteBuf）：
  ┌──────────────────────────────────────────────┐
  │  数据存储在 JVM 堆中                           │
  │  GC 可以看到它                                │
  │  忘记 release → 最终 GC 会回收                │
  │  后果：最多延迟回收，不会 OOM                  │
  └──────────────────────────────────────────────┘

  直接内存 ByteBuf（DirectByteBuf）：
  ┌──────────────────────────────────────────────┐
  │  数据存储在堆外（通过 malloc() 分配）            │
  │  GC 看不到它！                                │
  │  release() 告诉 Netty：这块内存可以回收了       │
  │  忘记 release → 内存永不被回收                 │
  │  后果：Direct Memory 持续增长 → OOM           │
  └──────────────────────────────────────────────┘

  Netty 默认使用 PooledByteBufAllocator，
  默认分配 Direct Memory（因为网络 I/O 性能最好）
  所以默认情况下，你用的就是"不 release 就会泄漏"的内存类型！
```

### 谁负责 release？——引用计数规则详解

Netty 的 ByteBuf 使用引用计数（Reference Count）来管理生命周期。引用计数的规则很简单：**谁创建（或增加了引用计数），谁负责 release。**

```
ByteBuf 的引用计数生命周期：

  refCnt = 0：内存已被回收，不能再使用
  refCnt = 1：内存正在被使用，只有一个持有者
  refCnt > 1：retain() 被调用过，多个持有者

  关键原则：
  每次 retain() 必须对应一次 release()
  创建一个 ByteBuf 相当于 refCnt = 1
  释放到 refCnt = 0 时，底层 Direct Memory 被归还到池中
```

```java
// 四种常见的 release 场景

// 场景 1：你创建了 ByteBuf → 你负责 release
// 高频出错点：在 if/else 分支中忘记 release
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    // 自己创建的直接内存 ByteBuf
    ByteBuf buf = ctx.alloc().directBuffer(1024);
    try {
        buf.writeBytes(...);
        // 处理 buf...
        ctx.writeAndFlush(buf);
    } finally {
        // 即使上面 writeAndFlush 失败了，buf 也要 release
        // 所以 release 必须在 finally 中
        buf.release();
    }
}

// 场景 2：从 channelRead 中收到的 ByteBuf
// 如果你不传给下一个 Handler → 你负责 release
// 如果你传了 → 下一个 Handler 负责
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    try {
        // 处理 msg...
        String text = ((ByteBuf) msg).toString(CharsetUtil.UTF_8);
        System.out.println(text);
        // 处理完了，不传给下一个 Handler → 自己 release
    } finally {
        ReferenceCountUtil.release(msg);
    }
}

// 场景 3：retain() 增加引用计数 → 必须 release()
// 当你需要把一个消息发给多个 Channel 时：
public void broadcast(ChannelHandlerContext ctx, ByteBuf msg) {
    // 假设有三个 Channel 需要发送
    msg.retain(); // refCnt: 1 → 2（为 channel1 保留一份）
    msg.retain(); // refCnt: 2 → 3（为 channel2 保留一份）
    // 原始引用给 channel3                      
    channel1.writeAndFlush(msg);     // 发送后会 release 一次
    channel2.writeAndFlush(msg);     // 发送后会 release 一次
    channel3.writeAndFlush(msg);     // 发送后会 release 一次
    // 三次 release → refCnt 回到 0 → 内存回收
}

// 场景 4：SimpleChannelInboundHandler 自动 release
// ✅ 推荐：不需要手动 release
public class MyHandler extends SimpleChannelInboundHandler<ByteBuf> {
    @Override
    protected void channelRead0(ChannelHandlerContext ctx, ByteBuf msg) {
        // 这里处理 msg
        // 方法返回后，Netty 自动调用 ReferenceCountUtil.release(msg)
        // 你不需要（也不应该）手动 release
        String text = msg.toString(CharsetUtil.UTF_8);
        process(text);
    }
}
```

### 泄漏检测工具——ResourceLeakDetector

Netty 内置了专门检测内存泄漏的工具 `ResourceLeakDetector`。它通过在创建 ByteBuf 时记录堆栈信息，当 ByteBuf 被 GC 回收但 refCnt > 0 时，打印出创建时的堆栈。

```bash
# JVM 启动参数配置泄漏检测级别
-Dio.netty.leakDetection.level=DISABLED   # 关闭检测（性能最好，但不推荐）
-Dio.netty.leakDetection.level=SIMPLE     # 默认级别，只报告"泄漏了"，没有堆栈
-Dio.netty.leakDetection.level=ADVANCED   # ✅ 推荐！报告泄漏位置（创建堆栈）
-Dio.netty.leakDetection.level=PARANOID   # 每次访问都记录堆栈（性能有开销）
```

```
不同级别下的输出差异：

  SIMPLE 级别——知道泄漏了，但不知道在哪：
  [pool-1-thread-1] WARN io.netty.util.ResourceLeakDetector -
  LEAK: ByteBuf.release() was not called before it's garbage-collected.

  ADVANCED 级别——能定位到创建位置：
  [pool-1-thread-1] WARN io.netty.util.ResourceLeakDetector -
  LEAK: ByteBuf.release() was not called before it's garbage-collected.
  Recent access records: 
  Created at:
      at io.netty.buffer.PooledByteBufAllocator.newDirectBuffer(
          PooledByteBufAllocator.java:333)
      at io.netty.buffer.AbstractByteBufAllocator.directBuffer(
          AbstractByteBufAllocator.java:187)
      at com.example.MyHandler.channelRead(MyHandler.java:42)  ← 精确定位！
      at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(
          AbstractChannelHandlerContext.java:379)

  PARANOID 级别——有性能开销，生产环境慎用：
  在 ADVANCED 的基础上，每次访问（getByte/readByte/writeByte 等）都会记录堆栈
  用于极难复现的泄漏问题
```

**在实际的生产排查中，标准做法是**：
1. 在 JVM 启动参数中设置 `-Dio.netty.leakDetection.level=ADVANCED`
2. 重启服务
3. 观察日志中的 `LEAK:` 关键字
4. 根据堆栈定位到具体的代码行
5. 修复后，将级别改回 SIMPLE（减少性能开销）

### 预防性写法——可靠的 release 代码模板

```java
// ❌ 错误写法——分支中的 release
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    ByteBuf buf = (ByteBuf) msg;
    if (buf.readableBytes() > 1024) {
        // 太长，只处理前 1024 字节
        String text = buf.readSlice(1024).toString(CharsetUtil.UTF_8);
        System.out.println(text);
        // ❌ 忘记 release！如果走这个分支，buf 不会被释放
        return;
    }
    String text = buf.toString(CharsetUtil.UTF_8);
    System.out.println(text);
    ReferenceCountUtil.release(msg); // ✅ 这个分支释放了
    // 但 if 分支没有！
}

// ✅ 正确写法——finally 保证 release
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    try {
        ByteBuf buf = (ByteBuf) msg;
        if (buf.readableBytes() > 1024) {
            String text = buf.readSlice(1024).toString(CharsetUtil.UTF_8);
            System.out.println(text);
            return; // 没问题，finally 会 release
        }
        String text = buf.toString(CharsetUtil.UTF_8);
        System.out.println(text);
    } finally {
        // 不管哪个分支，都会执行 release
        ReferenceCountUtil.release(msg);
    }
}

// ✅ 最佳写法——SimpleChannelInboundHandler 自动释放
public class SafeHandler extends SimpleChannelInboundHandler<ByteBuf> {
    @Override
    protected void channelRead0(ChannelHandlerContext ctx, ByteBuf msg) {
        // 不需要 try-finally，不需要 release
        // channelRead0 返回后，Netty 自动释放 msg
        String text = msg.toString(CharsetUtil.UTF_8);
        process(text);
    }
}
```

---

## 8.2 CPU 100% 飙高排查

### 三大根因

CPU 100% 听起来可怕，但只要你掌握了排查方法，大多数情况 10 分钟内就能定位到根因。

**根因一：NIO Epoll 空轮询 Bug**

这个 Bug 我们在第 2 章详细讲过。在生产环境中，即使 Netty 有 `rebuildSelector` 防御机制，空轮询仍然可能导致 CPU 异常。

```
症状：
  - 某个 Worker 线程的 CPU 占用 100%
  - 但 QPS 很低（或为 0）
  - 其他 Worker 线程正常

定位方法：
  top -Hp <pid>
  找到 CPU 最高的线程 ID（比如 12345）
  printf "%x\n" 12345 → 输出 0x3039
  jstack <pid> | grep -A 50 "0x3039"

  正常输出（epoll 在等待事件）：
  "nioEventLoopGroup-2-1" ... RUNNABLE
      at sun.nio.ch.EPollArrayWrapper.epollWait(Native Method)
      at io.netty.channel.nio.NioEventLoop.run(NioEventLoop.java:510)
      → 正常！epollWait 是 native 方法，等待时 CPU 占用为 0

  异常输出（空轮询触发重建）：
  "nioEventLoopGroup-2-1" ... RUNNABLE
      at sun.nio.ch.EPollArrayWrapper.epollWait(Native Method)
      ...（在 select() 和 run() 之间循环，没有阻塞）
      → 触发了空轮询，Netty 正在重建 Selector
      → 日志中会有 "Selector auto rebuild" 的记录
```

**根因二：业务 Handler 中的死循环**

更常见的 CPU 100% 原因是业务代码中的死循环或耗时操作。

```
真实案例：
  IM 系统中有一个消息转发 Handler，将收到的消息广播给群成员。
  某天用户在一个 1 万人的群里发了一条消息，Handler 代码：

  for (Long memberId : groupMembers) {
      channelManager.sendToUser(memberId, message);
  }

  sendToUser 内部：
  Channel channel = userChannelMap.get(userId);
  channel.writeAndFlush(...);

  问题：群里有 500 个用户已经离线（Channel 为 null）
  sendToUser 对 null 处理不当，进入了一个错误的重试循环
  → 这个 Handler 的 EventLoop 线程 CPU 100%
  → 这个线程管理的其他 3000 个连接全部卡住
```

**根因三：正则表达式回溯**

这个"隐形杀手"曾经让无数 Java 应用 CPU 100%。

```java
// 看似无害的正则：匹配 以 a 或 aa 重复多次，结尾为 b
Pattern pattern = Pattern.compile("(a|aa)+b");
Matcher matcher = pattern.matcher("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaac");

// 目标是：判断这个字符串是否匹配正则
// 结果是：CPU 100%
// 原因：正则引擎回溯爆炸

// 简化分析：
// (a|aa)+ 匹配了一长串 a，但结尾需要 b
// 实际结尾是 c，不匹配
// 正则引擎开始"回溯"——尝试所有可能的 (a|aa) 组合
// 对于 N 个 a，有约 2^N 种分割方式！
// 32 个 a → 约 40 亿次尝试 → CPU 100%
```

### 排查方法——标准操作流程

```
Step 1: 找到 CPU 最高的线程
┌──────────────────────────────────────────┐
│  $ top -Hp <pid>                          │
│                                            │
│  PID     USER    PR  NI  VIRT  RES   S  %CPU│
│  12345   netty   20  0   ...  ...   R  99.7│  ← 这个线程吃了 99.7%
│  12346   netty   20  0   ...  ...   S   0.3│
│  12347   netty   20  0   ...  ...   S   0.1│
└──────────────────────────────────────────┘

Step 2: 将线程 ID 转为十六进制
┌──────────────────────────────────────────┐
│  $ printf "%x\n" 12345                    │
│  3039                                     │
└──────────────────────────────────────────┘

Step 3: 用 jstack 查看线程堆栈
┌──────────────────────────────────────────┐
│  $ jstack <pid> | grep -A 60 "0x3039"     │
│                                            │
│  "nioEventLoopGroup-2-1" #12 prio=5       │
│  java.lang.Thread.State: RUNNABLE         │
│      at com.example.MyHandler.channelRead  │
│      at com.example.MyHandler.process      │
│      at com.example.MyHandler.loopMethod   │ ← 看到循环方法
│      ...                                  │
└──────────────────────────────────────────┘

Step 4: 查看对应的源代码
→ 打开 MyHandler.java，找到 loopMethod
→ 检查循环条件是否可能退出
→ 修复代码

Step 5（如果堆栈在 epollWait）：
→ 检查 WARN 级别日志中是否有 "Selector auto rebuild"
→ 如果有 → 升级 JDK
→ 如果没有 → 检查业务 Handler 中是否有阻塞操作
```

---

## 8.3 连接假死与心跳设计

### 为什么 TCP 层无法感知假死？

这是最常见的误解。"TCP 是可靠的"——但"可靠"只针对"数据正在传输"的时候。当连接上没有数据传输时，TCP 没有任何机制来检测对方是否还活着。

```
连接假死的四种常见原因：

  原因 1：物理链路中断
  客户端（机房 A）                       服务端（机房 B）
    │  [光纤被施工挖断]                    │
    │  但操作系统不知道！                   │
    │  Socket 仍然显示 ESTABLISHED          │
    │  因为物理层断开不会主动通知 TCP 层      │

  原因 2：防火墙静默丢弃
    │  [防火墙设置了 600 秒空闲超时]         │
    │  [防火墙默默丢弃了这个连接，不通知双方]  │
    │  双方 Socket 都显示 ESTABLISHED        │
    │  但任何数据发送都会收到 RST           │

  原因 3：对端进程僵死
    │  [对端 Java 进程触发 Full GC，STW 30 秒]│
    │  不是进程挂了，是"卡住了"              │
    │  Socket 还在，但不会处理新数据         │

  原因 4：操作系统资源耗尽
    │  [对端文件描述符耗尽]                  │
    │  新连接无法建立但已有连接不受影响       │
    │  但已有连接也收不到数据了              │
    │  (内核没有资源来传递数据)              │
```

### IdleStateHandler + 心跳的完整设计

Netty 的 `IdleStateHandler` 是解决连接假死的标准工具。它通过检测三个维度的空闲时间来判断连接是否"假死"：

```java
// Pipeline 配置——服务端
pipeline.addLast("idle", new IdleStateHandler(
    60,    // readerIdleTime：60 秒内没收到数据 → 触发 READER_IDLE
    0,     // writerIdleTime：不检测写空闲
    0      // allIdleTime：不检测读写都空闲
));
// 服务端只检测"客户端有没有发数据"，不主动发心跳

// Pipeline 配置——客户端
pipeline.addLast("idle", new IdleStateHandler(
    0,     // readerIdleTime：不检测读空闲
    15,    // writerIdleTime：15 秒内没写数据 → 触发 WRITER_IDLE（发心跳）
    0      // allIdleTime：不检测读写都空闲
));
// 客户端检测"有没有写数据"，如果没有，说明该发心跳了
```

```java
/**
 * 服务端心跳检测 Handler——三级判定
 *
 * 第一级（60 秒）：没收到数据，记录一次"丢失"计数
 * 第二级（120 秒）：连续两次丢失，再次发出探测
 * 第三级（180 秒）：连续三次丢失，判定连接假死，关闭
 */
public class ServerHeartbeatHandler extends ChannelDuplexHandler {

    private static final int MAX_MISSED_HEARTBEATS = 3;

    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object evt) {
        if (!(evt instanceof IdleStateEvent)) {
            ctx.fireUserEventTriggered(evt);
            return;
        }

        IdleStateEvent e = (IdleStateEvent) evt;
        if (e.state() != IdleState.READER_IDLE) {
            return;
        }

        // 60 秒没收到数据 → 记录一次"未收到心跳"计数
        // 使用 Channel 的 AttributeMap 来存储计数（线程安全）
        Integer missedCount = ctx.channel()
            .attr(AttributeKey.valueOf("missedHeartbeats"))
            .getAndUpdate(v -> v == null ? 1 : v + 1);

        log.warn("未收到心跳，当前连续丢失次数: {}，remote: {}",
            missedCount, ctx.channel().remoteAddress());

        if (missedCount >= MAX_MISSED_HEARTBEATS) {
            // 连续 3 次（180 秒）没收到心跳
            // 判定连接假死
            log.error("连接假死，关闭连接: remote={}",
                ctx.channel().remoteAddress());
            ctx.close();

            // 如果有关联的资源（如用户在 IM 中的会话），在这里清理
            // userChannelManager.unbindUser(ctx.channel());
        }

        // 注意：如果未达到阈值，不主动关闭
        // 因为可能只是网络抖动，不是真死了
    }

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        // 每次收到数据（包括心跳），重置丢失计数
        ctx.channel().attr(AttributeKey.valueOf("missedHeartbeats"))
            .set(0);
        ctx.fireChannelRead(msg);
    }
}
```

> **⚠️ 时间配置的黄金比例**：客户端的写空闲时间（心跳间隔）应该设置服务端读空闲时间的 1/3 到 1/4。如果服务端 60 秒判定超时，客户端应该每 15-20 秒发一次心跳。这样可以确保即使一次心跳丢失（网络抖动），也不会被误判为假死。

---

## 本章总结

| 杀手 | 根因 | 典型症状 | 排查工具 | 解决方案 |
|------|------|---------|---------|---------|
| **内存泄漏** | ByteBuf 未 release | Direct Memory 持续增长，最终 OOM | ResourceLeakDetector(ADVANCED) | 用 SimpleChannelInboundHandler / finally 中 release |
| **CPU 100%** | Epoll 空轮询 Bug | 单个 EventLoop 线程 100%，QPS 为 0 | top -Hp + jstack | 升级 JDK 8u252+ |
| **CPU 100%** | 业务死循环/正则回溯 | CPU 100%，QPS 为 0 | jstack 看线程栈 | 修复业务代码 |
| **CPU 100%** | 频繁 GC | CPU 100%，GC 日志频繁 | -XX:+PrintGCDetails | 减少临时对象创建，检查内存泄漏 |
| **连接假死** | 网络中断但 TCP 无感知 | 连接看似正常但无数据 | netstat + 连接数监控 | IdleStateHandler + 心跳 |

**核心原则**：
1. **Netty 内存泄漏是"中国特色问题"**——大多数 Java 开发者习惯了 GC 替自己回收资源，容易忘记 Direct Memory 需要手动 release。养成"创建 ByteBuf 时立刻写 try-finally"的习惯
2. **CPU 100% 先用 top 定位线程，再用 jstack 定位代码**——不要猜，不要重启（重启会丢失现场），先看堆栈。90% 的情况堆栈会直接告诉你问题在哪
3. **心跳是 Netty 应用的标配**——没有心跳的应用，线上迟早遇到连接假死。配置一个简单的 IdleStateHandler + 心跳的成本极低，但收益巨大
4. **泄漏检测要在测试环境就开启**——不要在线上 OOM 了才开始排查。在测试/预发布环境开启 `ADVANCED` 级别的泄漏检测，提前发现泄漏