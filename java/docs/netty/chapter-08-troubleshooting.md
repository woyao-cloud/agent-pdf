# 第8章 生产环境"三大杀手"排查

## 8.1 内存泄漏（Memory Leak）排查

### 根因：ByteBuf 未 release

Netty 的内存泄漏排查，90% 的根因是同一个：**ByteBuf 申请后没有调用 `release()`**。

```
为什么 ByteBuf 会导致内存泄漏？

  堆内存（Heap ByteBuf）：
  ┌──────────────────────────────────────────────┐
  │  ByteBuf 数据存储在 JVM 堆中                   │
  │  受 GC 管理 → 忘记 release 最多延迟回收         │
  │  不会泄漏（GC 最终会回收）                      │
  └──────────────────────────────────────────────┘

  直接内存（Direct ByteBuf）：
  ┌──────────────────────────────────────────────┐
  │  ByteBuf 数据存储在堆外内存                    │
  │  不归 GC 管！                                 │
  │  release() 告诉 Netty：这块内存可以回收了       │
  │  忘记 release → Direct Memory 只增不减        │
  │  最终：-XX:MaxDirectMemorySize 耗尽 → OOM     │
  └──────────────────────────────────────────────┘

  关键区别：
  GC 能管堆内存（Heap），管不了直接内存（Direct）
  所以 Direct ByteBuf 必须显示 release()
```

### 谁负责 release？

```
Netty 的引用计数规则：

  谁创建（或增加引用），谁负责 release

  ┌─────────────────────────────────────────────────────────┐
  │  场景 1：你在 Handler 中通过 allocate() 创建了 ByteBuf    │
  │  ByteBuf buf = ctx.alloc().buffer(1024);                 │
  │  → 你负责 release                                        │
  │                                                           │
  │  场景 2：你从 channelRead() 中收到 ByteBuf                │
  │  channelRead(ctx, msg)  // msg 是 ByteBuf                │
  │  → 如果你不传给下一个 Handler，你负责 release              │
  │  → 如果你调用了 ctx.fireChannelRead(msg)，你不负责        │
  │     （后续 Handler 负责）                                  │
  │                                                           │
  │  场景 3：你调用了 retain() 增加了引用计数                   │
  │  msg.retain();   // refCnt = 2                           │
  │  → 必须调用 release() 减回来                              │
  │                                                           │
  │  场景 4：使用 SimpleChannelInboundHandler                  │
  │  → 不需要 release！SimpleChannelInboundHandler 自动释放    │
  └─────────────────────────────────────────────────────────┘
```

### 泄漏检测工具：ResourceLeakDetector

Netty 内置了内存泄漏检测工具 `ResourceLeakDetector`：

```bash
# JVM 启动参数
-Dio.netty.leakDetection.level=PARANOID    # 最严格模式（生产慎用，有性能开销）
-Dio.netty.leakDetection.level=ADVANCED    # 推荐模式（生产可用）
-Dio.netty.leakDetection.level=SIMPLE      # 默认模式，只报告"泄漏了"
-Dio.netty.leakDetection.level=DISABLED    # 禁用检测
```

```java
// 启用泄漏检测（编程方式）
ResourceLeakDetector.setLevel(ResourceLeakDetector.Level.ADVANCED);
```

```
不同级别的输出：

  SIMPLE 模式输出：
  LEAK: ByteBuf.release() was not called before it's garbage-collected.

  ADVANCED 模式输出：
  LEAK: ByteBuf.release() was not called before it's garbage-collected.
  Recent access records: 
  Created at:
      at io.netty.buffer.PooledByteBufAllocator.newDirectBuffer(...)
      at com.example.MyHandler.channelRead(MyHandler.java:42)  ← 创建位置！
      at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(...)
  ↑ 这个堆栈可以精确定位到哪行代码创建的 ByteBuf 泄漏了

  PARANOID 模式输出：
  会记录每次访问的堆栈，性能开销大（生产不推荐）
```

### 规范建议

```java
// ✅ 正确做法 1：使用 SimpleChannelInboundHandler（自动 release）
public class GoodHandler extends SimpleChannelInboundHandler<ByteBuf> {
    @Override
    protected void channelRead0(ChannelHandlerContext ctx, ByteBuf msg) {
        // 方法返回后，msg 自动 release
        String text = msg.toString(CharsetUtil.UTF_8);
        System.out.println(text);
        // 不需要调用 release()
    }
}

// ✅ 正确做法 2：手动 release（如果继承 ChannelInboundHandlerAdapter）
public class ManualReleaseHandler extends ChannelInboundHandlerAdapter {
    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        try {
            // 处理消息...
            process((ByteBuf) msg);
        } finally {
            // 必须在 finally 中 release！
            ReferenceCountUtil.release(msg);
        }
    }
}

// ❌ 错误做法：忘记 release
public class LeakyHandler extends ChannelInboundHandlerAdapter {
    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        ByteBuf buf = (ByteBuf) msg;
        byte[] bytes = new byte[buf.readableBytes()];
        buf.readBytes(bytes);
        // buf.release() 没有被调用 → 泄漏！
    }
}

// ✅ 正确做法 3：retain/release 配对
public void scatterMessage(ChannelHandlerContext ctx, ByteBuf msg) {
    // 需要将同一个消息发给两个人
    msg.retain(); // refCnt: 1 → 2
    try {
        channel1.writeAndFlush(msg.retainedDuplicate());
        channel2.writeAndFlush(msg);
    } finally {
        msg.release(); // refCnt: 2 → 1 (channel2 会再 release 到 0)
    }
}
```

---

## 8.2 CPU 100% 飙高排查

### 三大根因

CPU 100% 是最常见的线上故障之一，其中与 Netty 相关的有：

```
根因 1：NIO Epoll 空轮询 Bug
  ┌────────────────────────────────────────────┐
  │  表现：Selector.select() 在无事件时立即返回  │
  │  特征：CPU 100%，但 QPS 很低                │
  │  定位：jstack 看到大量 epollWait 调用        │
  │  解决：Netty 的 rebuildSelector 机制已防御   │
  │        升级 JDK 版本（JDK 8u252+ 已修复）    │
  └────────────────────────────────────────────┘

根因 2：业务 Handler 死循环
  ┌────────────────────────────────────────────┐
  │  表现：某个 Channel 的请求全部卡住          │
  │  特征：CPU 100%，GC 正常，但 QPS 为 0       │
  │  定位：jstack → 找到 RUNNABLE 状态线程      │
  │        看到业务代码的 while/for 循环         │
  │  案例：正则表达式回溯陷阱                    │
  │        Pattern.compile("(a|aa)+b")          │
  │        .matcher("aaaaaaaaaaaaac").matches()  │
  │        → 回溯几百万次！CPU 100%             │
  └────────────────────────────────────────────┘

根因 3：频繁 GC
  ┌────────────────────────────────────────────┐
  │  表现：CPU 100% 但 GC 日志频繁              │
  │  特征：每秒多次 Young GC / Full GC          │
  │  定位：-XX:+PrintGCDetails → GC 频率高     │
  │  原因：Handler 中创建了大量临时对象           │
  │        或 ByteBuf 泄漏导致 Direct Memory    │
  │        触发 CMS GC                        │
  └────────────────────────────────────────────┘
```

### 排查方法

```bash
# Step 1：找到 CPU 最高的线程
top -Hp <pid>
# 记下 CPU 最高的线程 ID

# Step 2：将线程 ID 转为十六进制
printf "%x\n" <thread-id>
# 输出：1a2b

# Step 3：查看线程栈
jstack <pid> | grep -A 30 "0x1a2b"
# 或者
jstack <pid> > jstack.log
# 在 jstack.log 中搜索 nid=0x1a2b

# 输出示例（Epoll 空轮询）：
# "nioEventLoopGroup-2-1" #11 prio=5 os_prio=0 tid=0x...
#   nid=0x1a2b runnable [0x...]
#   java.lang.Thread.State: RUNNABLE
#     at sun.nio.ch.EPollArrayWrapper.epollWait(Native Method)
#     at sun.nio.ch.EPollArrayWrapper.poll(EPollArrayWrapper.java:269)
#     at sun.nio.ch.EPollSelectorImpl.doSelect(EPollSelectorImpl.java:93)
#     at io.netty.channel.nio.NioEventLoop.run(NioEventLoop.java:510)
#     → 正常状态，epoll 在等待事件

# 输出示例（Epoll 空轮询 Bug）：
# "nioEventLoopGroup-2-1" ... RUNNABLE
#   at sun.nio.ch.EPollArrayWrapper.epollWait(Native Method)  ← 立即返回
#   ... 无业务代码，只有 selector.select()
#   → 连续 512 次 select 返回 0 → Netty 触发 rebuildSelector
```

---

## 8.3 连接假死与心跳设计

### 为什么 TCP 层无法感知假死？

```
连接假死的典型场景：

  客户端                             服务端
    │                                 │
    │ ← TCP 连接建立成功 →              │
    │ ← 正常收发数据 →                  │
    │                                 │
    │ [网线松了]                        │
    │ 但是操作系统不知道！               │
    │（TCP 没有"心跳"机制）              │
    │                                 │
    │ 客户端认为连接正常                │
    │ 服务端也认为连接正常              │
    │                                 │
    │ [防火墙静默断开连接]              │
    │ 两边都不知道！                    │
    │                                 │
    │ 服务端：这个连接一直 idle          │
    │ 但它占着一个 Channel              │
    │ 占着一个文件描述符                │
    │ 不主动发数据，永远发现不了          │
```

### IdleStateHandler 的三维心跳

Netty 的 `IdleStateHandler` 提供三个维度的空闲检测：

```java
// 服务端：检测客户端是否存活
pipeline.addLast(new IdleStateHandler(
    60,  // readerIdleTime：60 秒没收到客户端数据 → 触发
    0,   // writerIdleTime：不检测写空闲
    0    // allIdleTime：不检测读写都空闲
));

// 客户端：定时发送心跳
pipeline.addLast(new IdleStateHandler(
    0,          // readerIdleTime
    15,         // writerIdleTime：15 秒没写数据 → 触发（发送心跳）
    0
));
```

```
IdleStateHandler 的三维检测：

  读空闲（readerIdleTime）：
    60 秒内 Channel 没有读操作 → 触发 READER_IDLE 事件
    适用：服务端检测客户端是否还活着

  写空闲（writerIdleTime）：
    15 秒内 Channel 没有写操作 → 触发 WRITER_IDLE 事件
    适用：客户端定期发送心跳

  读写空闲（allIdleTime）：
    60 秒内既没有读也没有写 → 触发 ALL_IDLE 事件
    适用：双向检测
```

```java
/**
 * 服务端心跳检测 Handler
 */
public class ServerHeartbeatHandler extends ChannelDuplexHandler {

    private static final int MAX_MISSED_HEARTBEATS = 3;

    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object evt) {
        if (evt instanceof IdleStateEvent) {
            IdleStateEvent e = (IdleStateEvent) evt;

            if (e.state() == IdleState.READER_IDLE) {
                // 60 秒没收到数据 → 可能假死

                // 记录未收到心跳的次数
                Integer missed = ctx.channel()
                    .attr(AttributeKey.valueOf("missedHeartbeats"))
                    .getAndUpdate(v -> v == null ? 1 : v + 1);

                if (missed >= MAX_MISSED_HEARTBEATS) {
                    // 连续 3 次（180 秒）没收到心跳 → 判定假死
                    log.warn("连接假死，关闭: remote={}",
                        ctx.channel().remoteAddress());
                    ctx.close();
                } else {
                    log.debug("未收到心跳, 已连续{}次", missed);
                }
            }
        } else {
            ctx.fireUserEventTriggered(evt);
        }
    }
}
```

---

## 本章总结

| 杀手 | 根因 | 排查工具 | 解决方案 |
|------|------|---------|---------|
| **内存泄漏** | ByteBuf 未 release | ResourceLeakDetector + jmap | SimpleChannelInboundHandler / finally release |
| **CPU 100%** | Epoll 空轮询 / 死循环 / GC | top -Hp + jstack | 升级 JDK / 修复代码 / 优化对象创建 |
| **连接假死** | 网络闪断 TCP 无感知 | netstat + 连接数监控 | IdleStateHandler + 心跳 |

**核心原则**：
1. **Netty 内存泄漏是中国特色问题**——大多数 Java 开发者习惯了 GC 替自己回收资源，容易忘记 Direct Memory 需要手动 release
2. **CPU 100% 先用 top 定位线程，再用 jstack 定位代码**——不要猜，不要重启，先看堆栈
3. **心跳是 Netty 应用的标配**——没有心跳的应用，线上迟早遇到连接假死