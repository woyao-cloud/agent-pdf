# 第5章 场景三：高并发 API 网关与代理服务器

## 本章导读

2016 年，某电商平台双 11 大促。技术团队提前两个月做了全链路压测，一切正常。零点开抢后，核心交易链路确实扛住了——但网关挂了。原因听起来很简单：**一个后端服务的一个接口变慢了**。原本 10ms 就能返回的库存查询，在缓存穿透后变成了 200ms。这个接口的响应在网关的缓冲区里堆积，堆积越来越多，最终 Direct Memory OOM。网关一挂，所有流量都进不来了——即使后端服务本身是健康的。

这个事故揭示了一个残酷的事实：**微服务架构下，网关是整个系统的"阿喀琉斯之踵"。** 任何一个下游服务的抖动，都可能通过网关放大为整个系统的崩溃。网关不仅要快，更要**稳**——它必须在后端的各种故障模式下都保持可用。

本章将深入 Netty 网关的两个核心能力：**背压控制**（如何让"慢下游"不拖死网关）和**零拷贝传输**（如何让大文件不撑爆 JVM 堆）。

---

## 5.1 实现原理——网关的核心职责

网关在微服务架构中的角色可以用一句话概括：**所有外部请求的唯一入口，做路由、鉴权、限流、协议转换，然后把请求转发给后端服务。**

```
一个请求经过网关的完整生命周期：

  外部客户端（手机 App）             API 网关                         后端服务
    │                                │                                 │
    │ 1. HTTP POST /api/order/create  │                                 │
    │ ──────────────────────────────►│                                 │
    │                                │                                 │
    │                                │ 2. 解析 URL → /api/order/*      │
    │                                │    匹配路由 → order-service     │
    │                                │                                 │
    │                                │ 3. 鉴权：验证 Token             │
    │                                │    限流：检查 QPS 配额            │
    │                                │                                 │
    │                                │ 4. 协议转换：HTTP → RPC         │
    │                                │                                 │
    │                                │ 5. 创建到 order-service 的连接   │
    │                                │ ── RPC Request ──────────────► │
    │                                │                                 │
    │                                │ 6. ← RPC Response ──────────── │
    │                                │                                 │
    │                                │ 7. 协议转换回：RPC → HTTP       │
    │                                │                                 │
    │ ◄── HTTP Response ────────────│                                 │
```

**网关不能做什么**？网关不做业务逻辑。网关不做数据聚合（那是 BFF 的事）。网关不做服务发现（那是注册中心的事）。**网关只做"管道"的事**——让请求快速通过，同时保证管道本身不破。

### Netty 实现 HTTP 反向代理

一个最简的 Netty 反向代理需要 3 个组件：

```java
/**
 * 基于 Netty 的 HTTP 反向代理
 *
 * 核心组件：
 *   1. HttpServerCodec —— 解析客户端 HTTP 请求
 *   2. FrontendHandler —— 接收客户端请求，解析路由，转发到后端
 *   3. BackendHandler —— 接收后端响应，写回客户端
 */
public class NettyHttpProxy {

    private final EventLoopGroup bossGroup = new NioEventLoopGroup(1);
    private final EventLoopGroup workerGroup = new NioEventLoopGroup();

    public void start(int port) {
        ServerBootstrap b = new ServerBootstrap();
        b.group(bossGroup, workerGroup)
         .channel(NioServerSocketChannel.class)
         .childHandler(new ChannelInitializer<SocketChannel>() {
             @Override
             protected void initChannel(SocketChannel ch) {
                 ch.pipeline().addLast(
                     // 1. HTTP 编解码：字节 ↔ HttpRequest/HttpResponse
                     new HttpServerCodec(),
                     // 2. HTTP 聚合：将分块传输的请求体拼成一个 FullHttpRequest
                     // 参数 1MB 表示最大请求体大小
                     new HttpObjectAggregator(1024 * 1024),
                     // 3. 业务 Handler：路由 + 转发
                     new FrontendHandler()
                 );
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

    /**
     * 前端 Handler——网关的核心逻辑
     *
     * 职责：
     *   1. 解析 URL，决定发到哪个后端服务
     *   2. 创建到后端服务的 TCP 连接
     *   3. 将请求转发给后端
     *   4. 把后端的响应写回客户端
     */
    public class FrontendHandler extends ChannelInboundHandlerAdapter {

        @Override
        public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (!(msg instanceof FullHttpRequest)) {
                return;
            }

            FullHttpRequest request = (FullHttpRequest) msg;

            // 1. 路由解析——从 URL 中提取目标服务
            String backendHost = resolveBackendHost(request.uri());

            // 2. 限流检查（伪代码）
            // if (!rateLimiter.tryAcquire()) {
            //     sendError(ctx, 429, "Too Many Requests");
            //     return;
            // }

            // 3. 创建一个到后端服务的连接
            //    关键：复用客户端的 EventLoop，减少线程切换
            Bootstrap b = new Bootstrap();
            b.group(ctx.channel().eventLoop()) // ⚠️ 复用 EventLoop
             .channel(NioSocketChannel.class)
             .handler(new ChannelInitializer<SocketChannel>() {
                 @Override
                 protected void initChannel(SocketChannel ch) {
                     ch.pipeline().addLast(
                         new HttpClientCodec(),
                         new HttpObjectAggregator(1024 * 1024),
                         new BackendHandler(ctx) // 传递客户端的 ctx
                     );
                 }
             });

            // 4. 连接到后端。异步的——不等连接建立好就返回
            ChannelFuture connectFuture = b.connect(backendHost, 8081);

            // 5. 连接建立后再转发请求
            connectFuture.addListener((ChannelFutureListener) future -> {
                if (future.isSuccess()) {
                    // 连接成功→转发请求
                    future.channel().writeAndFlush(request);
                } else {
                    // 连接失败→返回 502
                    sendError(ctx, 502, "Bad Gateway: "
                        + backendHost + " 不可用");
                    ReferenceCountUtil.release(request);
                }
            });
        }

        private String resolveBackendHost(String uri) {
            if (uri.startsWith("/api/user"))  return "user-service";
            if (uri.startsWith("/api/order")) return "order-service";
            return "default-service";
        }
    }

    /**
     * 后端 Handler——将后端响应写回客户端
     *
     * 设计要点：这个 Handler 实例持有前端连接的 ctx
     * 后端的响应到达时，通过这个 ctx 直接写回客户端
     */
    public class BackendHandler extends ChannelInboundHandlerAdapter {

        private final ChannelHandlerContext frontendCtx;

        public BackendHandler(ChannelHandlerContext frontendCtx) {
            this.frontendCtx = frontendCtx;
        }

        @Override
        public void channelRead(ChannelHandlerContext ctx, Object msg) {
            // 后端响应到达，直接写回客户端
            // 注意：这里在 EventLoop 线程中执行
            // 因为有"同一个 Channel 在同一 EventLoop 处理"的保证
            // 写回操作不需要额外加锁
            frontendCtx.writeAndFlush(msg);

            // 如果是短连接场景，可以关闭后端连接：
            // ctx.close();
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            log.error("后端连接异常", cause);
            sendError(frontendCtx, 502, "Bad Gateway");
            ctx.close();
        }
    }

    private void sendError(ChannelHandlerContext ctx, int code, String msg) {
        FullHttpResponse response = new DefaultFullHttpResponse(
            HttpVersion.HTTP_1_1, HttpResponseStatus.valueOf(code));
        response.content().writeBytes(msg.getBytes(StandardCharsets.UTF_8));
        response.headers()
            .set(HttpHeaderNames.CONTENT_TYPE, "text/plain; charset=utf-8")
            .set(HttpHeaderNames.CONTENT_LENGTH, response.content().readableBytes());
        ctx.writeAndFlush(response)
            .addListener(ChannelFutureListener.CLOSE);
    }
}
```

> **💡 为什么要复用 `ctx.channel().eventLoop()`？** `Bootstrap.group()` 通常传入一个独立的 EventLoopGroup。但在这里，我们传入了客户端连接的 EventLoop。效果是：**到后端的连接和到前端的连接使用同一个 EventLoop 线程**。这意味着后端响应到达时，与写回客户端是同一个线程——不需要跨线程调度，没有锁竞争。这是 Netty 网关编码中的一个关键优化技巧。

---

## 5.2 三大潜在风险

### 风险一：背压失效——后端慢如何导致网关 OOM

这是网关最致命的风险，也是 5.1 节代码中没有处理的隐患。理解背压需要从 HTTP 反向代理的"缓冲区链"说起：

```
网关中的双重缓冲区：

  客户端（浏览器）                   网关                             后端服务
    │                                │                                │
    │ HTTP Request ────────────────► │                                │
    │                                │ 后端连接建立中...               │
    │                                │                                │
    │                                │ HTTP Request ────────────────► │
    │                                │                                │
    │                                │ [后端处理中，需要 500ms]        │
    │                                │                                │
    │  等待响应中...                  │                                │
    │                                │                                │
    │                          500ms 后...                            │
    │                                │                                │
    │                                │◄── HTTP Response ───────────── │
    │                                │                                │
    │                                │ ┌──────────────────────────┐   │
    │                                │ │ ChannelOutboundBuffer    │   │
    │                                │ │ (写回客户端的缓冲区)      │   │
    │                                │ │ 这一步也可能积压！        │   │
    │                                │ └──────────────────────────┘   │
    │◄── HTTP Response ──────────────│                                │

  这个过程中，网关内部维护了两组缓冲区：

  缓冲区 1：后端连接的 ChannelOutboundBuffer
            → 请求从网关发往后端时，在这里排队
            → 如果后端慢，请求在 Netty 的输出缓冲区中排队

  缓冲区 2：客户端连接的 ChannelOutboundBuffer
            → 后端响应到达，写回客户端时，在这里排队
            → 如果客户端慢（比如手机 2G 网络），响应在这里排队

  如果后端持续慢 → 缓冲区 1 膨胀
  如果客户端慢 → 缓冲区 2 膨胀
  如果两者都慢 → 两个缓冲区同时膨胀
  最终 → Direct Memory OOM
```

**但更隐蔽的问题是**：上述手动管理后端的代码中，每次客户端请求到达时，都会创建一个新的 `Bootstrap` 到后端连接。这意味着 1 万个并发请求 = 1 万个到后端的连接。不仅浪费资源，而且这些连接的缓冲区全部堆积在内存中。

### 风险二：连接泄漏——构建 Bootstrap 的隐形成本

上述 `FrontendHandler` 中有一个隐蔽的问题：**每次请求都创建一个 `Bootstrap` 实例，并且每次请求都创建一个到后端的 TCP 连接。** TCP 连接的建立和关闭本身就有开销（三次握手 + 四次挥手），而且关闭后的连接会进入 TIME_WAIT 状态，占用端口资源。

```java
// 在 FrontendHandler 中，每个请求都执行这段代码
// 如果网关每秒处理 5000 个请求 → 每秒建立 5000 个 TCP 连接 → 每秒关闭 5000 个
// → 大量 TIME_WAIT（操作系统默认 60 秒才释放）
// → 可用端口耗尽
// → 新连接无法建立 → 503 Service Unavailable
```

正确的做法是使用**连接池**，复用已有的后端连接。

### 风险三：大文件传输的 CPU 和内存灾难

```
500MB 文件通过网关的三种方式：

  方式 A（错误）：整个文件读入 byte[]
  ├── byte[] data = Files.readAllBytes(path);
  ├── JVM 堆分配 500MB
  ├── 大对象直接进入老年代 → 触发 Full GC
  ├── CPU 拷贝一次（byte[] → Direct Memory）
  └── 吞吐量：~100MB/s（GC 拖累）

  方式 B（次优）：分块读取
  ├── while ((len = fis.read(buf)) > 0) { ctx.write(buf); }
  ├── 每次只占 8KB 堆内存
  ├── 但仍然有 CPU 拷贝（堆 → 直接内存 → 网卡）
  └── 吞吐量：~300MB/s（没有 GC，但 CPU 拷贝还在）

  方式 C（最优）：FileRegion + sendfile
  ├── FileRegion region = new DefaultFileRegion(channel, 0, fileSize);
  ├── 0 字节 JVM 堆内存占用
  ├── 0 次 CPU 拷贝（数据直接 DMA 到网卡）
  └── 吞吐量：~800MB/s（接近网卡极限）
```

---

## 5.3 优化与应对方案

### 方案一：连接池 + 背压控制（完整实现）

```java
/**
 * 网关后端连接池
 *
 * 与简单的 RPC 连接池不同，网关的连接池需要管理到多个后端服务的连接
 * 每个后端服务有自己的连接池
 */
@Component
public class GatewayBackendConnectionPool {

    // 后端服务 → 连接池
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<Channel>> poolMap =
        new ConcurrentHashMap<>();

    private final Bootstrap bootstrapTemplate;

    private static final int POOL_PER_SERVICE = 4; // 每个后端 4 条连接

    public GatewayBackendConnectionPool(EventLoopGroup workerGroup) {
        this.bootstrapTemplate = new Bootstrap();
        bootstrapTemplate.group(workerGroup)
            .channel(NioSocketChannel.class)
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3000)
            .option(ChannelOption.SO_KEEPALIVE, true)
            .option(ChannelOption.TCP_NODELAY, true);
    }

    /**
     * 获取一条到指定后端服务的连接（轮询）
     */
    public Channel acquire(String serviceName) {
        CopyOnWriteArrayList<Channel> pool = poolMap.get(serviceName);
        if (pool == null || pool.isEmpty()) {
            // 连接池为空，可能是第一次调用或连接全断了
            // 返回 null，让上层创建临时连接（但不推荐）
            return null;
        }
        // 轮询
        int index = ThreadLocalRandom.current().nextInt(pool.size());
        return pool.get(index);
    }

    /**
     * 初始化到某个后端服务的连接池
     */
    @PostConstruct
    public void initPool(String serviceName, String host, int port) {
        CopyOnWriteArrayList<Channel> pool = new CopyOnWriteArrayList<>();

        for (int i = 0; i < POOL_PER_SERVICE; i++) {
            Bootstrap b = bootstrapTemplate.clone();
            b.handler(new ChannelInitializer<SocketChannel>() {
                @Override
                protected void initChannel(SocketChannel ch) {
                    ch.pipeline().addLast(
                        new HttpClientCodec(),
                        new HttpObjectAggregator(1024 * 1024),
                        new BackendResponseHandler()
                    );
                }
            });

            b.connect(host, port).addListener((ChannelFutureListener) f -> {
                if (f.isSuccess()) {
                    pool.add(f.channel());
                    // 监听断开事件，自动重连
                    f.channel().closeFuture().addListener(closeFuture -> {
                        pool.remove(f.channel());
                        // 延迟重连
                        workerGroup.schedule(
                            () -> initPool(serviceName, host, port),
                            1, TimeUnit.SECONDS);
                    });
                }
            });
        }
        poolMap.put(serviceName, pool);
    }
}

/**
 * 核心背压 Handler
 *
 * 作用：当 ChannelOutboundBuffer 超过高水位时，
 * 暂停从客户端读取数据，形成反压
 */
public class GatewayBackpressureHandler extends ChannelDuplexHandler {

    // 前端连接（客户端）的背压
    @Override
    public void channelWritabilityChanged(ChannelHandlerContext ctx) {
        if (ctx.channel().isWritable()) {
            // 缓冲区水位下降 → 恢复读取
            ctx.channel().config().setAutoRead(true);
            log.debug("前端连接恢复可写");
        } else {
            // 缓冲区水位过高 → 暂停从客户端读取
            ctx.channel().config().setAutoRead(false);
            log.warn("前端连接不可写，暂停读取客户端数据");
        }
        ctx.fireChannelWritabilityChanged();
    }

    /**
     * 前端 Handler——背压集成版
     */
    public static class BackpressureFrontendHandler
            extends ChannelInboundHandlerAdapter {

        @Autowired
        private GatewayBackendConnectionPool pool;

        private static final int MAX_PENDING = 200;

        // 记录当前未完成的后端请求数
        private static final AttributeKey<AtomicInteger> PENDING_KEY =
            AttributeKey.valueOf("pending");

        @Override
        public void channelRead(ChannelHandlerContext ctx, Object msg) {
            // 1. 检查积压数
            AtomicInteger pending = ctx.channel().attr(PENDING_KEY).get();
            if (pending == null) {
                pending = new AtomicInteger(0);
                ctx.channel().attr(PENDING_KEY).set(pending);
            }

            if (pending.get() >= MAX_PENDING) {
                // 积压请求太多 → 拒绝新的
                sendError(ctx, 503, "后端服务繁忙，请稍后重试");
                ReferenceCountUtil.release(msg);
                return;
            }

            // 2. 获取后端连接
            FullHttpRequest request = (FullHttpRequest) msg;
            String serviceName = resolveService(request.uri());
            Channel backendChannel = pool.acquire(serviceName);

            if (backendChannel == null || !backendChannel.isActive()) {
                sendError(ctx, 502, "后端服务不可用");
                ReferenceCountUtil.release(msg);
                return;
            }

            // 3. 积压数 +1，转发请求
            pending.incrementAndGet();

            // 在请求中附加一个"响应写回"的监听器
            backendChannel.writeAndFlush(request).addListener(
                (ChannelFutureListener) f -> {
                    if (!f.isSuccess()) {
                        pending.decrementAndGet();
                        sendError(ctx, 502, "转发失败");
                    }
                }
            );
        }

        private void decrementPending(ChannelHandlerContext ctx) {
            AtomicInteger pending = ctx.channel().attr(PENDING_KEY).get();
            if (pending != null) {
                int left = pending.decrementAndGet();
                // 积压减轻 → 通知背压
                if (left < MAX_PENDING * 0.7) {
                    ctx.channel().config().setAutoRead(true);
                }
            }
        }
    }
}
```

### 方案二：大文件零拷贝——FileRegion + sendfile

```java
/**
 * 大文件网关传输 Handler
 *
 * 关键设计：
 *   1. 文件不经过 JVM 堆内存
 *   2. 使用 sendfile 系统调用
 *   3. 如果客户端断开，立即停止传输（避免浪费）
 */
public class FileTransferHandler
        extends SimpleChannelInboundHandler<FullHttpRequest> {

    private static final String FILE_BASE_DIR = "/data/files/";

    @Override
    protected void channelRead0(ChannelHandlerContext ctx,
                                FullHttpRequest request) {

        String uri = request.uri();
        if (!uri.startsWith("/download/")) {
            ctx.fireChannelRead(request);
            return;
        }

        // 1. 获取文件路径（注意防止路径穿越攻击！）
        String filePath = sanitizePath(FILE_BASE_DIR + uri.substring(9));
        File file = new File(filePath);

        if (!file.exists() || file.isDirectory()) {
            sendError(ctx, 404, "File not found");
            return;
        }

        try {
            long fileLength = file.length();
            FileChannel fileChannel = new FileInputStream(file).getChannel();

            // 2. 构建 HTTP 响应头
            HttpResponse response = new DefaultHttpResponse(
                HttpVersion.HTTP_1_1, HttpResponseStatus.OK);
            response.headers()
                .set(HttpHeaderNames.CONTENT_LENGTH, fileLength)
                .set(HttpHeaderNames.CONTENT_TYPE,
                    "application/octet-stream")
                .set(HttpHeaderNames.CACHE_CONTROL,
                    "public, max-age=3600");

            // 3. 先写响应头（这部分走正常的写路径）
            ctx.write(response);

            // 4. 再写文件内容——零拷贝！
            //    FileRegion 封装了 FileChannel.transferTo()
            //    底层调用 sendfile 系统调用
            //    数据路径：磁盘 → 内核缓冲区 → 网卡
            //    不经过 JVM 堆
            FileRegion region = new DefaultFileRegion(
                fileChannel, 0, fileLength);

            // 写入完成后自动关闭连接
            ctx.writeAndFlush(region)
               .addListener(ChannelFutureListener.CLOSE);

            log.info("零拷贝传输: file={}, size={}MB",
                file.getName(), fileLength / 1024 / 1024);

        } catch (IOException e) {
            log.error("文件传输失败", e);
            sendError(ctx, 500, "Internal error");
        }
    }

    /**
     * 防止路径穿越攻击（../../etc/passwd）
     */
    private String sanitizePath(String path) {
        Path normalized = Paths.get(path).normalize();
        // 确保在允许的目录范围内
        if (!normalized.startsWith(FILE_BASE_DIR)) {
            throw new SecurityException("非法路径");
        }
        return normalized.toString();
    }
}
```

---

## 本章总结

| 风险 | 根因 | 具体表现 | 解决方案 |
|------|------|---------|---------|
| **背压失效 OOM** | 后端慢 → 响应在缓冲区堆积 | Direct Memory 暴涨，进程挂掉 | 高水位停读 + 积压计数拒绝新请求 |
| **大文件 JVM 撑爆** | 文件全部加载到堆内存 | 老年代 500MB+，Full GC | FileRegion + sendfile 零拷贝 |
| **连接泄漏** | 每个请求新建 TCP 连接 | TIME_WAIT 堆积，端口耗尽 | 连接池 + 复用后端连接 + 自动重连 |
| **连接泄漏** | 后端关闭后网关不知 | 向死连接写数据 → 异常 | 监听 closeFuture 自动重连 |

**核心原则**：
1. **背压是网关的生命线**——没有背压控制的网关，在遇到后端慢服务时一定会 OOM。这不是"可能"的事，而是"迟早"的事
2. **网关不要为每个请求创建后端连接**——连接池 + 复用是基础要求。即使用了连接池，也要对每个后端服务的积压数量做上限控制
3. **大文件传输永远不要进堆内存**——FileRegion + sendfile 是唯一正确的方式。任何涉及"将文件全部读入 byte[]"的代码都必须在代码审查中被拒绝
4. **网关不做业务逻辑**——网关只做路由、鉴权、限流、转发这三件事。业务逻辑（数据聚合、格式转换、复杂缓存）应该在 BFF 或后端服务中处理