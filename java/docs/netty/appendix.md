# 附录

## 附录A：Netty 核心 API 与常用 Handler 速查手册

### ChannelHandler 体系

| Handler 类型 | 说明 | 典型实现 |
|-------------|------|---------|
| `ChannelInboundHandler` | 处理入站数据（读） | 解码器、业务处理器 |
| `ChannelOutboundHandler` | 处理出站数据（写） | 编码器 |
| `ChannelDuplexHandler` | 同时处理入站和出站 | 指标收集、心跳 |
| `SimpleChannelInboundHandler<T>` | 自动释放消息的入站 Handler | **业务代码首选** |
| `ChannelInitializer<Channel>` | 在 Channel 注册时初始化 Pipeline | 配置 Handler 链 |

### 解码器

| 类 | 作用 | 使用场景 |
|----|------|---------|
| `ByteToMessageDecoder` | 字节 → 消息 | 自定义协议解码 |
| `MessageToMessageDecoder` | 消息 → 另一种消息 | 协议转换 |
| `ReplayingDecoder` | 无需检查可读字节数的解码器 | 简化解码器实现 |
| `LengthFieldBasedFrameDecoder` | 基于长度字段分包 | **自定义 RPC 协议（最常用）** |
| `LineBasedFrameDecoder` | 换行符分包 | 文本协议 |
| `DelimiterBasedFrameDecoder` | 自定义分隔符分包 | 特殊文本协议 |
| `FixedLengthFrameDecoder` | 固定长度分包 | 简单协议 |
| `HttpServerCodec` | HTTP 协议编解码 | Web 应用 |
| `WebSocketServerProtocolHandler` | WebSocket 协议 | IM 系统 |
| `MqttDecoder` / `MqttEncoder` | MQTT 协议编解码 | IoT 设备接入 |

### 编码器

| 类 | 作用 |
|----|------|
| `MessageToByteEncoder` | 消息 → 字节（出站） |
| `MessageToMessageEncoder` | 消息 → 另一种消息（出站） |

### 公共 Handler

| Handler | 作用 | 配置参数 |
|---------|------|---------|
| `IdleStateHandler` | 空闲检测（心跳） | `readerIdleTime`, `writerIdleTime`, `allIdleTime` |
| `LoggingHandler` | 日志记录 | `LogLevel`（TRACE/DEBUG/INFO/WARN/ERROR） |
| `SslHandler` | SSL/TLS 加密 | `SslContext`, 握手超时 |
| `WriteBufferWaterMark` | 写缓冲区水位线（背压） | `low`, `high` |
| `HttpObjectAggregator` | HTTP 消息聚合 | `maxContentLength` |

### 启动器

| 类 | 说明 |
|----|------|
| `ServerBootstrap` | 服务端启动器（bind） |
| `Bootstrap` | 客户端启动器（connect） |
| `ChannelInitializer` | 配置 Pipeline 的回调 |

### 线程模型

| 类 | 说明 |
|----|------|
| `NioEventLoopGroup` | NIO 线程池（基于 Selector） |
| `EpollEventLoopGroup` | Epoll 线程池（Linux 原生，性能更高） |
| `DefaultEventLoopGroup` | 普通线程池（非 NIO，用于业务处理） |

---

## 附录B：从 Socket 编程到 Netty 的踩坑血泪史（案例集）

### 案例 1：Channel 和 ChannelHandlerContext 混淆

```
❌ 错误：
  ChannelHandlerContext ctx = ...;
  ctx.channel().writeAndFlush(msg);  // 从 Channel 开始写

✅ 正确：
  ctx.writeAndFlush(msg);  // 从当前 Handler 开始写入

  区别：
    ctx.writeAndFlush(msg):     从当前 Handler 开始（经过后续 Outbound Handler）
    ctx.channel().writeAndFlush(msg): 从 Pipeline 尾部开始（经过所有 Outbound Handler）
  
  后果：从 channel 写入可能导致消息经过不应该经过的 Handler
```

### 案例 2：Handler 未使用 @Sharable 却作为单例

```
❌ 错误：
  // 同一个 Handler 实例被添加到多个 Pipeline
  pipeline.addLast(SAME_HANDLER_INSTANCE);

✅ 正确：
  // 方案 1：每个 Channel 创建新的 Handler 实例
  pipeline.addLast(new MyHandler());

  // 方案 2：如果 Handler 是无状态的，加 @Sharable 注解
  @Sharable
  public class StatelessHandler extends ChannelInboundHandlerAdapter { ... }

  后果：多个 Channel 共享 Handler 的成员变量 → 数据错乱
```

### 案例 3：阻塞 EventLoop 线程

```
❌ 错误：
  public class BlockingHandler extends ChannelInboundHandlerAdapter {
      public void channelRead(ChannelHandlerContext ctx, Object msg) {
          Thread.sleep(5000);  // 阻塞 EventLoop 线程！
          process(msg);
      }
  }

  后果：EventLoop 被阻塞 5 秒
       该 EventLoop 管理的所有 Channel 在这 5 秒内都不能读写
       其他 999 个连接被拖累

✅ 正确：
  public void channelRead(ChannelHandlerContext ctx, Object msg) {
      // 将耗时任务提交到业务线程池
      businessExecutor.submit(() -> {
          Thread.sleep(5000);
          process(msg);
          // 写回结果时记得使用 ctx（注意线程安全）
          ctx.executor().submit(() -> {
              ctx.writeAndFlush(response);
          });
      });
  }
```

### 案例 4：忘记调用 ctx.fireChannelRead()

```
❌ 错误：
  @Override
  public void channelRead(ChannelHandlerContext ctx, Object msg) {
      // 处理完消息后，没有调用 ctx.fireChannelRead()
      // 后续的 Handler 永远收不到消息！
  }

✅ 正确：
  @Override
  public void channelRead(ChannelHandlerContext ctx, Object msg) {
      // 可以修改 msg，然后传给下一个 Handler
      ctx.fireChannelRead(modifiedMsg);
  }

  例外：如果这个 Handler 是 Pipeline 的"终点"（消息消费掉了）
       不调用 fireChannelRead 是正确的
```

---

## 附录C：生产环境 Netty 标准启动模板与优化脚本

### 标准 Spring Boot + Netty 启动模板

```java
@Configuration
public class NettyServerConfig {

    @Value("${netty.server.port:8080}")
    private int port;

    @Value("${netty.boss.threads:1}")
    private int bossThreads;

    @Value("${netty.worker.threads:0}") // 0 = 自动
    private int workerThreads;

    @Bean(destroyMethod = "shutdownGracefully")
    public NioEventLoopGroup bossGroup() {
        return new NioEventLoopGroup(bossThreads);
    }

    @Bean(destroyMethod = "shutdownGracefully")
    public NioEventLoopGroup workerGroup() {
        if (workerThreads > 0) {
            return new NioEventLoopGroup(workerThreads);
        }
        return new NioEventLoopGroup(); // 默认 CPU×2
    }

    @Bean
    public NettyMetricsCollector metricsCollector(MeterRegistry registry) {
        return new NettyMetricsCollector(registry);
    }

    @Bean
    public ChannelFuture nettyServer(
            NioEventLoopGroup bossGroup,
            NioEventLoopGroup workerGroup,
            NettyMetricsCollector metricsCollector) {

        ServerBootstrap b = new ServerBootstrap();
        b.group(bossGroup, workerGroup)
         .channel(NioServerSocketChannel.class)
         .option(ChannelOption.SO_BACKLOG, 1024)
         .option(ChannelOption.SO_REUSEADDR, true)
         .childOption(ChannelOption.TCP_NODELAY, true)
         .childOption(ChannelOption.SO_KEEPALIVE, true)
         .childOption(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT)
         .childOption(ChannelOption.WRITE_BUFFER_WATER_MARK,
             new WriteBufferWaterMark(32 * 1024, 64 * 1024))
         .childHandler(new ChannelInitializer<SocketChannel>() {
             @Override
             protected void initChannel(SocketChannel ch) {
                 ChannelPipeline p = ch.pipeline();
                 // 监控
                 p.addLast("metrics", new MetricsHandler(metricsCollector));
                 // 空闲检测
                 p.addLast("idle", new IdleStateHandler(60, 0, 0));
                 // 解码
                 p.addLast("decoder", new StringDecoder());
                 p.addLast("encoder", new StringEncoder());
                 // 心跳
                 p.addLast("heartbeat", new ServerHeartbeatHandler());
                 // 业务
                 p.addLast("business", new BusinessHandler());
                 // 兜底异常处理
                 p.addLast("defense", new LastLineDefenseHandler());
             }
         });

        try {
            ChannelFuture f = b.bind(port).sync();
            log.info("Netty 服务启动成功，端口: {}", port);
            return f.channel().closeFuture();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("启动失败", e);
        }
    }
}
```

```yaml
# application.yml
netty:
  server:
    port: 8080
  boss:
    threads: 1
  worker:
    threads: 0  # 0 = 自动 = CPU核数×2

spring:
  application:
    name: netty-server
```

### JVM 参数推荐

```bash
# JVM 参数（Netty 生产推荐）
-server
-Xms4g -Xmx4g                       # 堆内存 4GB
-XX:MaxDirectMemorySize=2g          # 直接内存 2GB（重要！）
-XX:+UseG1GC                        # G1 垃圾回收器
-XX:MaxGCPauseMillis=50             # GC 目标暂停 50ms
-XX:+PrintGCDetails                 # GC 日志
-XX:+PrintGCDateStamps
-Xloggc:/var/log/netty-gc.log

# Netty 特有参数
-Dio.netty.leakDetection.level=ADVANCED   # 内存泄漏检测
-Dio.netty.allocator.type=pooled          # 池化分配器
-Dio.netty.maxDirectMemory=0              # 使用 JVM 的 MaxDirectMemorySize
-Dio.netty.allocator.numDirectArenas=8    # Direct Arena 数
-Dio.netty.allocator.numHeapArenas=8      # Heap Arena 数

# 其他
-Djava.io.tmpdir=/data/tmp
```