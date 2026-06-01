# 第10章 异常处理、优雅停机与安全性

## 本章导读

"我的 Netty 服务运行了三天，突然所有的客户端都连不上了。检查了下，没有 OOM，CPU 也正常。最后发现是一个 Handler 中抛出的异常没有被正确捕获，导致这个 Handler 之后的整条 Pipeline 都处于异常状态。而这个 Handler 负责的是用户认证——它挂了之后，所有需要认证的新连接都无法通过。"

这是 Netty 异常处理的一个典型案例。在 Netty 中，异常传播机制和 Pipeline 的事件传播机制是深度绑定的——**一个没有被处理的异常，会沿着 Pipeline 一路向上传播，直到被某个 Handler 捕获，或者到达 Tail Handler 被默认处理（关闭连接）**。

本章要讲的三件事：异常处理（不要让一个 Channel 的异常拖垮整个系统）、优雅停机（不要让 kill -9 导致数据丢失）、SSL/TLS 加密（生产环境安全的标配）。这三件事都关乎 Netty 应用的**健壮性**——你的代码不仅要跑得快，更要在各种异常情况下不崩溃。

---

## 10.1 异常传播机制

### exceptionCaught 的链路传递

在 Netty 中，Pipeline 的 Handler 链不仅处理业务事件（channelRead、write），还处理异常事件。当某个 Handler 中抛出异常时，异常会沿着 Pipeline **逆流而上**（从出错的 Handler 向 Pipeline 头部方向）传播。

```
Pipeline 异常传播路径：

  Head Handler → Handler A → Handler B → Handler C → Tail Handler
                    ↑            ↑            ↑            ↑
                    │            │            │            │
                    │            │      异常从这里抛出   默认打印日志 + 关闭连接
                    │            │                          (如果不被捕获)
                    │    可在此捕获并处理
                    │    不继续传播
              可在此捕获并处理
```

```java
// 异常的传播和拦截机制
public class ExceptionFlowDemo {

    // Handler A：在 channelRead 中捕获异常，并决定是否传播
    public static class HandlerA extends ChannelInboundHandlerAdapter {
        @Override
        public void channelRead(ChannelHandlerContext ctx, Object msg) {
            try {
                process(msg);
            } catch (BusinessException e) {
                // 业务异常，在这里直接处理（记录日志，发错误响应）
                log.warn("业务异常: {}", e.getMessage());
                ctx.writeAndFlush(new ErrorResponse(400, e.getMessage()));
                // ⚠️ 注意：没有调用 ctx.fireExceptionCaught(e)
                // 所以这个异常不会继续向上传播
                // 如果不希望上游 Handler 感知到这个异常，就不调 fireExceptionCaught
            } catch (Exception e) {
                // 系统异常，记录日志并向上传播
                log.error("系统异常", e);
                ctx.fireExceptionCaught(e); // 继续向上传播
            }
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            // 这个 Handler 收到了上游传下来的异常
            // 注意：自己是 HandlerA，如果有异常从 HandlerB 传下来，会在这里收到
            log.warn("HandlerA 收到异常: {}", cause.getMessage());
            // 如果想继续传播：
            ctx.fireExceptionCaught(cause);
            // 如果不想继续传播（在这里处理了）：
            // ctx.close(); // 不调 fireExceptionCaught，异常就到此为止
        }
    }

    // 正确做法：在 Pipeline 的末尾放一个"兜底 Handler"
    public static class LastLineDefenseHandler extends ChannelInboundHandlerAdapter {
        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            // 到达这里意味着所有上游 Handler 都没有处理这个异常
            log.error("Pipeline 中未捕获的异常, channel={}",
                ctx.channel().remoteAddress(), cause);

            // 如果能发响应，发一个 500 错误
            if (ctx.channel().isActive()) {
                ctx.writeAndFlush(new ErrorResponse(500, "服务器内部错误"))
                   .addListener(ChannelFutureListener.CLOSE);
            } else {
                ctx.close();
            }
        }
    }
}
```

> **💡 关键理解**：异常传播机制保证了"即使某个 Handler 没有处理异常，也不会导致整个 JVM 崩溃"。异常最多传播到 Tail Handler 后关闭连接——不会影响其他 Channel，不会影响 EventLoop。但**如果异常被传播到了 Tail Handler，意味着你的代码有一个 Bug 没被捕获**——应该尽早发现并处理它，而不是依赖兜底。

### 最佳实践：Pipeline 末尾的统一异常处理器

生产环境中，每个 Pipeline 都应该在末尾添加一个统一的异常处理器。这个处理器的作用是"安全网"——兜住所有上游没有处理的异常，防止连接被"静默关闭"（Tail Handler 的默认行为是不打印异常就关闭连接）。

```java
// 生产标准：Pipeline 配置示例
public class ProductionPipelineInitializer extends ChannelInitializer<SocketChannel> {

    @Override
    protected void initChannel(SocketChannel ch) {
        ChannelPipeline p = ch.pipeline();

        // 1. 解码器（最前面）
        p.addLast("codec", new HttpServerCodec());
        p.addLast("aggregator", new HttpObjectAggregator(65536));

        // 2. 业务 Handler
        p.addLast("auth", new AuthHandler());
        p.addLast("business", new BusinessHandler());

        // 3. ⭐ 安全网 Handler（最后一个！）
        p.addLast("defense", new ChannelInboundHandlerAdapter() {
            @Override
            public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
                log.error("未捕获异常, remote={}",
                    ctx.channel().remoteAddress(), cause);
                if (ctx.channel().isActive()) {
                    ctx.writeAndFlush(Unpooled.unreleasableBuffer(
                        Unpooled.copiedBuffer(
                            "Internal Server Error\n".getBytes())))
                       .addListener(ChannelFutureListener.CLOSE);
                } else {
                    ctx.close();
                }
            }
        });
    }
}
```

---

## 10.2 优雅停机（Graceful Shutdown）

### 为什么要优雅停机？——kill -9 的代价

```yaml
# K8s 中 Pod 被销毁时的典型场景：
# 1. K8s 发送 SIGTERM（信号 15）→ 请求进程优雅退出
# 2. 等待 terminationGracePeriodSeconds（默认 30 秒）
# 3. 如果进程还在运行 → 发送 SIGKILL（信号 9）→ 强制杀死

# 如果没有优雅停机处理：
# SIGTERM 到达 → Netty 没有任何处理 → 继续处理请求
# 30 秒后 → SIGKILL → 进程被强杀
# 正在处理的请求 → 突然断开
# 输出缓冲区中的数据 → 丢失
# 客户端 → Connection Reset

# 如果有优雅停机处理：
# SIGTERM 到达 → JVM Shutdown Hook 触发
# → Netty 的 shutdownGracefully() 被调用
# → 停止接受新连接
# → 等待正在处理的请求完成（最多等 15 秒）
# → 刷新所有输出缓冲区
# → 关闭所有 Channel
# → 关闭 EventLoopGroup
# → 进程安全退出
```

### shutdownGracefully 的完整实现

```java
/**
 * 带优雅停机的 Netty 服务端
 *
 * 关键设计：
 *   1. 注册 JVM ShutdownHook
 *   2. shutdownGracefully 的安静期和超时
 *   3. 等待所有 EventLoop 安全停止
 */
public class GracefulShutdownServer {

    private final EventLoopGroup bossGroup = new NioEventLoopGroup(1);
    private final EventLoopGroup workerGroup = new NioEventLoopGroup();
    private Channel serverChannel;

    public void start(int port) {
        ServerBootstrap b = new ServerBootstrap();
        b.group(bossGroup, workerGroup)
         .channel(NioServerSocketChannel.class)
         .childHandler(new ChannelInitializer<SocketChannel>() {
             @Override
             protected void initChannel(SocketChannel ch) {
                 ch.pipeline().addLast(new BusinessHandler());
             }
         });

        try {
            serverChannel = b.bind(port).sync().channel();
            log.info("服务启动，端口: {}", port);

            // 阻塞等待服务关闭
            serverChannel.closeFuture().sync();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            // 安全关闭
            shutdown();
        }
    }

    /**
     * 优雅关机
     *
     * shutdownGracefully 的两个参数：
     * quietPeriod: 2 秒安静期
     *   如果在这 2 秒内没有新任务提交到 EventLoop
     *   就不等到 timeout 结束，提前关闭
     * timeout: 15 秒超时
     *   最多等 15 秒，不管还有没有任务在处理，都要强制关闭
     *   防止一个慢请求拖住整个关机过程
     */
    public void shutdown() {
        log.info("开始优雅关机...");

        // 第一步：停止接受新连接（关掉 ServerSocket）
        if (serverChannel != null) {
            serverChannel.close();
        }

        // 第二步：优雅关闭 EventLoopGroup
        Future<?> bossFuture = bossGroup.shutdownGracefully(2, 15, TimeUnit.SECONDS);
        Future<?> workerFuture = workerGroup.shutdownGracefully(2, 15, TimeUnit.SECONDS);

        try {
            // 等待所有线程安全停止（最多等 15 秒）
            bossFuture.await(15, TimeUnit.SECONDS);
            workerFuture.await(15, TimeUnit.SECONDS);

            log.info("优雅关机完成");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("优雅关机被中断", e);
        }
    }

    /**
     * 注册 JVM ShutdownHook
     *
     * 当进程收到 SIGTERM（kill）、SIGINT（Ctrl+C）
     * 或 JVM 主动关闭时，这个 Hook 会被触发
     */
    public void registerShutdownHook() {
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("收到关机信号，开始优雅关机...");
            shutdown();
        }));
    }

    public static void main(String[] args) {
        GracefulShutdownServer server = new GracefulShutdownServer();

        // 注册 ShutdownHook——必须！否则 SIGTERM 时什么都不会发生
        server.registerShutdownHook();

        // 启动服务
        server.start(8080);
    }
}
```

### shutdownGracefully 的内部流程——它做了什么？

```
shutdownGracefully 的 4 步操作：

  第一步：标记为"关闭中"
  ┌────────────────────────────────────────┐
  │  EventLoopGroup 设置关闭标志             │
  │  新的 submit() 调用被拒绝                │
  │  已经提交但未执行的任务会继续执行          │
  └────────────────────────────────────────┘

  第二步：关闭所有 Selector
  ┌────────────────────────────────────────┐
  │  遍历所有 EventLoop                    │
  │  对每个 EventLoop：                     │
  │  1. 关闭 Selector                      │
  │  2. 取消所有注册的 SelectionKey          │
  │  3. 所有 Selector 上的 select() 立即返回 │
  └────────────────────────────────────────┘

  第三步：关闭所有 Channel
  ┌────────────────────────────────────────┐
  │  遍历每个 EventLoop 注册的 Channel      │
  │  对每个 Channel：                       │
  │  1. 调用 ChannelOutboundBuffer 的 flush │
  │     （尝试将缓冲区中未发送的数据发出去）   │
  │  2. 关闭 Channel                       │
  │  3. 触发 channelInactive 事件           │
  └────────────────────────────────────────┘

  第四步：终止线程
  ┌────────────────────────────────────────┐
  │  停止 EventLoop 的事件循环              │
  │  等待正在执行的任务完成                  │
  │  等待 quietPeriod（2 秒）               │
  │  如果期间没有新任务提交：提前完成         │
  │  否则：最多等 timeout（15 秒）          │
  │  最终：线程退出                         │
  └────────────────────────────────────────┘
```

> **⚠️ 常见遗漏**：很多人在代码注册了 ShutdownHook，但却忘了在 Spring Boot 退出或 K8s 滚动更新时触发它。在 Spring Boot 中，需要使用 `@PreDestroy` 或在 `ApplicationListener<ContextClosedEvent>` 中调用 `shutdown()`，而不是依赖 JVM ShutdownHook。

```java
// Spring Boot 中的优雅停机
@Component
public class NettyLifecycleManager {

    @Autowired
    private GracefulShutdownServer nettyServer;

    @PreDestroy
    public void onDestroy() {
        // Spring 容器关闭时调用这个
        // 比 JVM ShutdownHook 更早触发
        log.info("Spring 容器关闭，触发 Netty 优雅停机");
        nettyServer.shutdown();
    }
}
```

---

## 10.3 网络安全：TLS/SSL

### SslHandler 必须放在 Pipeline 的第一个

这是一个绝对不能违反的规则。SSL 解密必须在任何其他处理之前完成——否则解码器收到的是密文，根本没法解析：

```
Pipeline 中的 SslHandler 位置对比：

  ✅ 正确的顺序：
  ┌────────────────────────────────────────────────┐
  │  SslHandler（第 1 个）                           │
  │    在 channelActive 时开始 TLS 握手              │
  │    握手完成后，后续的所有 channelRead 收到的      │
  │    都是解密后的明文                              │
  │    ↓                                           │
  │  HttpServerCodec                                 │
  │    收到的是解密后的明文 HTTP 请求                  │
  │    ↓                                           │
  │  BusinessHandler                                 │
  │    收到的是完整的 HTTP 请求对象                  │
  └────────────────────────────────────────────────┘

  ❌ 错误顺序：
  ┌────────────────────────────────────────────────┐
  │  HttpServerCodex（第 1 个）                      │
  │    收到的是 SSL 加密的字节流                     │
  │    → 解析失败！不是合法的 HTTP 请求              │
  │    → 报错或关闭连接                             │
  │    ↓                                           │
  │  SslHandler（拿到的是乱码，已经晚了）              │
  └────────────────────────────────────────────────┘
```

### OpenSSL vs JDK SSL——性能差距在哪里？

Netty 支持两种 SSL 实现。它们在功能上等价，但性能差距巨大：

```
为什么 OpenSSL 比 JDK SSL 快 2-3 倍？

  JDK SSL 的实现：
  1. JSSE 是纯 Java 实现（部分操作用 Java 写的）
  2. 加密/解密操作在 JVM 中执行
  3. 每次加密/解密涉及 JNI 调用（但 JDK 的加密扩展不直接调用 OpenSSL）
  4. 受 JVM 内存管理影响（大对象、GC）

  OpenSSL（netty-tcnative）的实现：
  1. C 语言实现，直接调用 Linux 内核的加密指令（AES-NI）
  2. 加密/解密在 native 内存中完成，不经过 JVM 堆
  3. 利用 CPU 的硬件加速指令（如果 CPU 支持 AES-NI，AES 加密速度提升 10 倍）
  4. 不产生 JVM 垃圾，不影响 GC
```

```xml
<!-- 引入 netty-tcnative（OpenSSL 支持） -->
<!-- 选择与你操作系统匹配的版本 -->
<dependency>
    <groupId>io.netty</groupId>
    <artifactId>netty-tcnative-boringssl-static</artifactId>
    <version>2.0.65.Final</version>
</dependency>
```

```java
/**
 * Netty HTTPS 服务端（OpenSSL）
 *
 * 两个关键配置：
 *   1. SslProvider.OPENSSL —— 使用 OpenSSL 而不是 JDK SSL
 *   2. SslHandler 必须是 Pipeline 的第一个 Handler
 */
public class NettySslServer {

    public void start(int port, File certFile, File keyFile) {

        SslContext sslCtx = SslContextBuilder.forServer(certFile, keyFile)
            .sslProvider(SslProvider.OPENSSL) // ⚠️ 关键：使用 OpenSSL
            .ciphers(null, IdentityCipherSuiteFilter.INSTANCE)
            .build();

        EventLoopGroup bossGroup = new NioEventLoopGroup(1);
        EventLoopGroup workerGroup = new NioEventLoopGroup();

        ServerBootstrap b = new ServerBootstrap();
        b.group(bossGroup, workerGroup)
         .channel(NioServerSocketChannel.class)
         .childHandler(new ChannelInitializer<SocketChannel>() {
             @Override
             protected void initChannel(SocketChannel ch) {
                 ChannelPipeline p = ch.pipeline();

                 // ⚠️ SslHandler 必须是第一个！
                 p.addLast(sslCtx.newHandler(ch.alloc()));

                 p.addLast(new HttpServerCodec());
                 p.addLast(new HttpObjectAggregator(65536));
                 p.addLast(new BusinessHandler());
             }
         });

        try {
            b.bind(port).sync().channel().closeFuture().sync();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            bossGroup.shutdownGracefully();
            workerGroup.shutdownGracefully();
        }
    }
}
```

---

## 本章总结

| 主题 | 核心要点 | 常见错误 | 最佳实践 |
|------|---------|---------|---------|
| **异常处理** | 异常沿 Pipeline 逆流传播 | 在 catch 中既不处理也不传播，导致异常被吞没 | Pipeline 末尾放兜底 Handler，业务 Handler 中捕获自己应处理的异常 |
| **优雅停机** | shutdownGracefully 安全关闭所有资源 | 忘了注册 ShutdownHook → SIGTERM 时无反应 | 注册 ShutdownHook，设置合理的 quietPeriod(2s) + timeout(15s) |
| **SSL/TLS** | SslHandler 必须在 Pipeline 最前面 | 顺序放错 → 解码器解析密文失败 | 使用 OpenSSL(netty-tcnative) 替代 JDK SSL，性能提升 2-3 倍 |

**核心原则**：
1. **统一异常处理器是 Pipeline 的"安全网"**——没有它，未捕获的异常只会在 Tail Handler 中被静默处理（关闭连接），你连日志都看不到。这是排查线上问题的最大障碍
2. **优雅停机是生产级应用的标配**——kill -9 导致的数据丢失和连接中断是可以避免的。注册一个 ShutdownHook，在 SIGTERM 时调用 shutdownGracefully，成本极低但收益巨大
3. **SSL 必须使用 OpenSSL 实现**——在 Netty 场景下，JDK SSL 的性能差距不可接受。一个简单的依赖 `netty-tcnative-boringssl-static` 就能获得 2-3 倍的性能提升