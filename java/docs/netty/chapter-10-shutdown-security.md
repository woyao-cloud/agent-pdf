# 第10章 异常处理、优雅停机与安全性

## 10.1 异常传播机制

### exceptionCaught 的链路传递

在 Netty 的 Pipeline 中，异常像"逆流而上"一样沿着 Handler 链从出错的 Handler 向上传播：

```
异常传播路径：

                      Inbound 方向（从下往上）
                      
  Handler A  ────►  Handler B  ────►  Handler C  ────►  Tail Handler
  (业务逻辑)         (业务逻辑)          (出错位置)           (默认打印异常)
  
                    异常从 C 触发，传到 B，再到 A
                    如果都不处理，最终到 Tail Handler
                    Tail Handler 默认打印日志并关闭连接
```

```java
// 异常的传播机制
public class ExceptionPropagationHandler extends ChannelInboundHandlerAdapter {

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        try {
            process(msg);
        } catch (Exception e) {
            // 方式一：触发异常传播（继续向上抛）
            ctx.fireExceptionCaught(e);

            // 方式二：直接处理，不传播
            // log.error("处理异常", e);
            // ctx.close();
        }
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        // 这个 Handler 收到了上游传下来的异常
        // 如果不调用 ctx.fireExceptionCaught，异常就止于此
        log.error("异常到达 Handler B: {}", cause.getMessage());
        // 继续向上传播或直接处理
        ctx.fireExceptionCaught(cause);
    }
}
```

### 如何避免一个 Channel 的异常导致整个 Pipeline 崩溃？

```java
/**
 * 最佳实践：在 Pipeline 的"最末尾"放置一个统一的异常处理器
 *
 * 这样所有未处理的异常都会被捕获
 * 不会导致整个 EventLoop 崩溃
 */
public class LastLineDefenseHandler extends ChannelInboundHandlerAdapter {

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        // 记录异常
        log.error("Pipeline 未捕获异常，channel={}",
            ctx.channel().remoteAddress(), cause);

        // 如果是业务异常，可以发错误响应
        if (ctx.channel().isActive()) {
            ctx.writeAndFlush(new ErrorResponse(500, "服务器内部错误"))
               .addListener(ChannelFutureListener.CLOSE);
        } else {
            ctx.close();
        }
    }
}

// 在 Pipeline 中，LastLineDefenseHandler 放在最末尾
pipeline.addLast("decoder", new StringDecoder());
pipeline.addLast("business", new BusinessHandler());
pipeline.addLast("defense", new LastLineDefenseHandler()); // 最后一个！
```

---

## 10.2 优雅停机（Graceful Shutdown）

### 为什么需要优雅停机？

```
普通 kill（kill -9）vs 优雅关机（shutdownGracefully）：

  kill -9：
  ┌────────────────────────────────────────────┐
  │  PID 1（Netty 服务）                         │
  │  ├── 正在处理 500 个客户端请求                │
  │  ├── 输出缓冲区有 200 条未发送的消息           │
  │  └── 啪！全部终止                              │
  │                                              │
  │  后果：                                       │
  │  - 500 个请求处理到一半，数据不一致             │
  │  - 200 条消息没发出去，数据丢失                 │
  │  - 所有连接突然断开，客户端需要处理异常          │
  └────────────────────────────────────────────┘

  shutdownGracefully()：
  ┌────────────────────────────────────────────┐
  │  1. 停止接受新连接                          │
  │  2. 继续处理已连接的请求                     │
  │  3. 等待输出缓冲区中的数据发送完毕             │
  │  4. 关闭所有 Channel                        │
  │  5. 终止 EventLoopGroup 的线程               │
  │                                              │
  │  整个过程有超时控制，不会无限等待               │
  └────────────────────────────────────────────┘
```

### shutdownGracefully 的实现

```java
// Netty 服务端完整优雅关机代码
public class NettyServer {

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
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * 优雅关机
     */
    public void shutdown() {
        log.info("开始优雅关机...");

        // 1. 先关闭 ServerSocketChannel（停止接受新连接）
        if (serverChannel != null) {
            serverChannel.close();
        }

        // 2. 优雅关闭 EventLoopGroup
        //    参数：quietPeriod（安静期）, timeout（超时）, unit
        //    在 quietPeriod 内如果没有新的任务提交，就关闭
        //    最多等待 timeout 时间
        Future<?> bossFuture = bossGroup.shutdownGracefully(2, 15, TimeUnit.SECONDS);
        Future<?> workerFuture = workerGroup.shutdownGracefully(2, 15, TimeUnit.SECONDS);

        try {
            // 等待所有线程安全关闭
            bossFuture.await(15, TimeUnit.SECONDS);
            workerFuture.await(15, TimeUnit.SECONDS);

            log.info("优雅关机完成");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("优雅关机被中断", e);
        }
    }

    // 注册 JVM Shutdown Hook
    public void registerShutdownHook() {
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("收到关机信号");
            shutdown();
        }));
    }

    public static void main(String[] args) {
        NettyServer server = new NettyServer();
        server.registerShutdownHook(); // 提前注册 Hook
        server.start(8080);
    }
}
```

```
shutdownGracefully 的内部流程：

  shutdownGracefully() 调用后：
  
  ┌──────────────────────────────────────────────────────┐
  │  EventLoopGroup                                  │
  │                                                     │
  │  1. 标记为"关闭中"状态（不再接受新任务）              │
  │                                                     │
  │  2. 遍历所有 EventLoop                               │
  │     ├── 每个 EventLoop 关闭自己的 Selector           │
  │     │   ├── 取消所有 SelectionKey                    │
  │     │   └── 关闭 Selector                           │
  │     │                                               │
  │     ├── 遍历所有注册的 Channel                        │
  │     │   ├── 刷新输出缓冲区（等待 unsent 数据发送完）  │
  │     │   └── 关闭 Channel                            │
  │     │                                               │
  │     └── 关闭 EventLoop 的线程                       │
  │                                                     │
  │  3. 等待 quietPeriod（安静期）                        │
  │     如果没有新任务提交，提前完成                       │
  │     最多等待 timeout（超时时间）                       │
  │                                                     │
  │  4. 返回 Future，调用方可以 await                     │
  └──────────────────────────────────────────────────────┘
```

---

## 10.3 网络安全：TLS/SSL

### SslHandler 的放置位置

```
Pipeline 中的 SslHandler 位置：

  ✅ 正确的顺序：
  ┌────────────────────────────────────────────┐
  │  SslHandler（第一个！）                      │
  │    ↓                                        │
  │  Decoder（解码器）                           │
  │    ↓                                        │
  │  BusinessHandler（业务处理器）                │
  └────────────────────────────────────────────┘

  原因：SSL 解密必须在解码之前完成
        如果先解码后解密，解码器收到的是密文，无法解析

  ❌ 错误顺序：
  ┌────────────────────────────────────────────┐
  │  Decoder                                   │
  │  SslHandler                                │
  │  BusinessHandler                           │
  └────────────────────────────────────────────┘
```

### Netty 集成 OpenSSL

Netty 支持两种 SSL 实现：JDK SSL（`javax.net.ssl.SSLContext`）和 **OpenSSL**（通过 netty-tcnative）。OpenSSL 性能远超 JDK SSL：

```xml
<!-- pom.xml 引入 netty-tcnative（OpenSSL 支持） -->
<dependency>
    <groupId>io.netty</groupId>
    <artifactId>netty-tcnative-boringssl-static</artifactId>
    <version>2.0.65.Final</version>
</dependency>
```

```java
/**
 * Netty HTTPS 服务端（OpenSSL）
 */
public class NettySslServer {

    public void start(int port) {
        // 1. 配置 SSL
        SelfSignedCertificate cert = new SelfSignedCertificate(); // 生产用正式证书
        SslContext sslCtx = SslContextBuilder.forServer(cert.certificate(), cert.privateKey())
            .sslProvider(SslProvider.OPENSSL) // 使用 OpenSSL（而非 JDK SSL）
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

                 // SslHandler 必须是第一个！
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

```
OpenSSL vs JDK SSL 性能对比（256 位 AES，1000 次握手）：

  ┌────────────┬────────────┬──────────────┐
  │  实现       │  握手耗时    │  吞吐量       │
  ├────────────┼────────────┼──────────────┤
  │ JDK SSL    │  12ms       │  1500 TPS    │
  │ OpenSSL    │  5ms        │  3500 TPS    │
  └────────────┴────────────┴──────────────┘

  OpenSSL 使用 native 代码，通过 netty-tcnative JNI 调用
  性能比 JDK SSL 高约 2-3 倍
```

---

## 本章总结

| 主题 | 要点 | 关键操作 |
|------|------|---------|
| **异常处理** | Pipeline 末尾放统一异常处理器 | `exceptionCaught` 兜底，用 `fireExceptionCaught` 传播 |
| **优雅停机** | 先关 ServerSocket，再关 EventLoopGroup | `shutdownGracefully` + JVM Shutdown Hook |
| **TLS/SSL** | SslHandler 必须是 Pipeline 第一个 | 使用 OpenSSL（netty-tcnative）替代 JDK SSL |

**核心原则**：
1. **统一异常处理器是 Pipeline 的"安全网"**——没有它，未捕获的异常会关闭连接，但不会打印有用的日志
2. **优雅停机是生产级应用的标配**——kill -9 导致的连接意外中断在客户端看来就是"服务端挂了"
3. **SSL 必须使用 OpenSSL 实现**——在 Netty 场景下，JDK SSL 的性能差距不可接受