# 第5章 场景三：高并发 API 网关与代理服务器

## 5.1 实现原理

API 网关是微服务架构的"大门"——所有外部请求先经过网关，再由网关转发到后端服务。

```
API 网关的核心功能：

  外部客户端                              API 网关（Netty）                       后端服务
    │                                          │                                     │
    │ ── HTTP Request ──────────────────────►   │                                     │
    │                                          │                                     │
    │ ── HTTP Request ──────────────────────►   │  ┌───────────────────────────────┐  │
    │                                          │  │ 1. 路由匹配                    │  │
    │                                          │  │ 2. 鉴权/限流/日志              │  │
    │                                          │  │ 3. 协议转换 (HTTP→RPC)        │  │
    │                                          │  │ 4. 转发到后端                  │  │
    │                                          │  └───────────────────────────────┘  │
    │                                          │                                     │
    │                                          │ ── RPC/HTTP ────────────────────►  │
    │                                          │                                     │
    │ ◄── Response ──────────────────────────  │ ◄── Response ────────────────────  │
```

### Netty HTTP 反向代理的核心

```java
/**
 * 基于 Netty 的 HTTP 反向代理
 *
 * 核心思路：
 *   1. 接收客户端 HTTP 请求
 *   2. 解析目标地址（从 URL 或 Header）
 *   3. 创建到后端服务的连接
 *   4. 转发请求并代理响应
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
                     new HttpServerCodec(),
                     new HttpObjectAggregator(1024 * 1024), // 1MB
                     new FrontendHandler()  // 前端请求处理器
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
     * 前端 Handler——接收客户端请求，转发到后端
     */
    public class FrontendHandler extends ChannelInboundHandlerAdapter {

        private Channel backendChannel; // 到后端服务的连接

        @Override
        public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (msg instanceof FullHttpRequest) {
                FullHttpRequest request = (FullHttpRequest) msg;

                // 1. 路由解析
                String backendHost = resolveBackendHost(request.uri());

                // 2. 创建到后端的连接
                Bootstrap b = new Bootstrap();
                b.group(ctx.channel().eventLoop()) // 复用 EventLoop
                 .channel(NioSocketChannel.class)
                 .handler(new ChannelInitializer<SocketChannel>() {
                     @Override
                     protected void initChannel(SocketChannel ch) {
                         ch.pipeline().addLast(
                             new HttpClientCodec(),
                             new HttpObjectAggregator(1024 * 1024),
                             new BackendHandler(ctx) // 后端响应处理器
                         );
                     }
                 });

                ChannelFuture f = b.connect(backendHost, 8081);
                backendChannel = f.channel();

                // 3. 转发请求到后端
                //    等待连接建立后再发送
                f.addListener((ChannelFutureListener) future -> {
                    if (future.isSuccess()) {
                        backendChannel.writeAndFlush(request);
                    } else {
                        // 后端不可用，返回 502
                        sendError(ctx, 502, "Bad Gateway");
                    }
                });
            }
        }

        private String resolveBackendHost(String uri) {
            // 路由规则：/api/user/* → user-service:8081
            //          /api/order/* → order-service:8082
            if (uri.startsWith("/api/user")) return "user-service";
            if (uri.startsWith("/api/order")) return "order-service";
            return "default-service";
        }
    }

    /**
     * 后端 Handler——将后端响应写回客户端
     */
    public class BackendHandler extends ChannelInboundHandlerAdapter {

        private final ChannelHandlerContext frontendCtx;

        public BackendHandler(ChannelHandlerContext frontendCtx) {
            this.frontendCtx = frontendCtx;
        }

        @Override
        public void channelRead(ChannelHandlerContext ctx, Object msg) {
            // 将后端响应写回客户端
            frontendCtx.writeAndFlush(msg);
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            sendError(frontendCtx, 502, "Bad Gateway: " + cause.getMessage());
            ctx.close();
        }
    }

    private void sendError(ChannelHandlerContext ctx, int code, String msg) {
        FullHttpResponse response = new DefaultFullHttpResponse(
            HttpVersion.HTTP_1_1, HttpResponseStatus.valueOf(code));
        response.content().writeBytes(msg.getBytes());
        response.headers().set(HttpHeaderNames.CONTENT_TYPE, "text/plain");
        ctx.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE);
    }
}
```

---

## 5.2 两大潜在风险

### 风险一：背压失效（Backpressure）

网关最致命的风险是**下游慢导致上游内存溢出**：

```
背压失效的连锁反应：

  客户端（海量请求）      网关（Netty）             后端（慢服务）
    │                       │                         │
    │ ── 请求 ─────────►    │                         │
    │ ── 请求 ─────────►    │                         │
    │ ── 请求 ─────────►    │  转发 ───────────────►  │
    │ ── 请求 ─────────►    │                         │
    │ ── 请求 ─────────►    │                         │
    │                       │                         │
    │                       │   后端处理慢，响应出不来  │
    │                       │                         │
    │                       │ 网关为每个请求保持连接    │
    │                       │ 缓冲区内数据不断增加      │
    │                       │                         │
    │                       │ ┌──────────────────────┐│
    │                       │ │ ChannelOutboundBuffer ││
    │                       │ │ 积压了 10000 个响应   ││
    │                       │ │ Direct Memory: 500MB  ││
    │                       │ └──────────────────────┘│
    │                       │                         │
    │                       │  最终：Direct Memory OOM │
    │                       │  整个 JVM 挂掉           │
    │                       │  所有连接断开             │
```

### 风险二：大文件传输时的 CPU 和内存瓶颈

```
大文件传输的性能问题：

  传统方式（非零拷贝）：
  磁盘 → 内核缓冲区 → 用户缓冲区（拷贝1）→ Socket缓冲（拷贝2）→ 网卡
  每个 100MB 的文件传输需要：
  1. 分配 100MB 的 JVM 堆内存
  2. 两次 CPU 拷贝
  3. GC 压力巨大（大对象直接进入老年代）
```

---

## 5.3 优化与应对方案

### 方案一：流量控制——水位线 + 背压

```java
/**
 * 网关核心——背压控制
 *
 * 关键设计：
 *   通过 Netty 的 Channel.isWritable() 判断下游是否健康
 *   当下游处理慢时，暂停从上游读取数据
 *   形成"反压"回客户端
 */
public class GatewayBackpressureHandler extends ChannelDuplexHandler {

    /**
     * 后端服务响应回到网关时，检查是否还能继续接收
     */
    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        // 将响应写回客户端时检查水位线
        ctx.writeAndFlush(msg).addListener((ChannelFutureListener) future -> {
            if (!future.isSuccess()) {
                log.error("写回客户端失败", future.cause());
            }
        });
    }

    /**
     * 网关和后端之间的连接——背压核心
     */
    public static class BackendProxyHandler extends ChannelDuplexHandler {

        private final ChannelHandlerContext clientCtx; // 客户端连接
        private final AtomicInteger pendingResponses = new AtomicInteger(0);
        private static final int MAX_PENDING = 100; // 最多 100 个未响应的请求

        public BackendProxyHandler(ChannelHandlerContext clientCtx) {
            this.clientCtx = clientCtx;
        }

        @Override
        public void write(ChannelHandlerContext ctx, Object msg, ChannelPromise promise) {
            if (pendingResponses.get() >= MAX_PENDING) {
                // 后端积压太多 → 暂停从客户端读
                clientCtx.channel().config().setAutoRead(false);
                log.warn("背压触发: pending={}, 暂停读取客户端", pendingResponses.get());
            }

            pendingResponses.incrementAndGet();
            ctx.write(msg, promise);
        }

        @Override
        public void channelRead(ChannelHandlerContext ctx, Object msg) {
            pendingResponses.decrementAndGet();

            if (pendingResponses.get() < MAX_PENDING * 0.8) {
                // 积压减轻 → 恢复读取
                clientCtx.channel().config().setAutoRead(true);
            }

            // 将后端响应写回客户端
            clientCtx.writeAndFlush(msg);
        }
    }
}
```

```java
// 网关初始化时配置水位线
public class GatewayInitializer extends ChannelInitializer<SocketChannel> {

    @Override
    protected void initChannel(SocketChannel ch) {
        ch.config().setWriteBufferWaterMark(
            new WriteBufferWaterMark(64 * 1024, 256 * 1024));

        ch.pipeline().addLast(
            new HttpServerCodec(),
            new HttpObjectAggregator(1024 * 1024),
            new GatewayRouterHandler()
        );
    }
}
```

### 方案二：大文件零拷贝传输

```java
/**
 * 大文件传输 Handler
 *
 * 使用 FileRegion + sendfile 实现零拷贝
 * 避免大文件占用 JVM 堆内存
 */
public class FileTransferHandler extends SimpleChannelInboundHandler<FullHttpRequest> {

    private static final String FILE_BASE_DIR = "/data/files/";

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest request) {
        String uri = request.uri();

        if (uri.startsWith("/download/")) {
            String filePath = FILE_BASE_DIR + uri.substring(9);
            File file = new File(filePath);

            if (!file.exists()) {
                sendError(ctx, 404, "File not found");
                return;
            }

            try {
                // 使用 FileRegion 零拷贝传输
                FileRegion region = new DefaultFileRegion(
                    new FileInputStream(file).getChannel(),
                    0, file.length());

                // 构建 HTTP 响应头
                HttpResponse response = new DefaultHttpResponse(
                    HttpVersion.HTTP_1_1, HttpResponseStatus.OK);
                response.headers()
                    .set(HttpHeaderNames.CONTENT_LENGTH, file.length())
                    .set(HttpHeaderNames.CONTENT_TYPE, "application/octet-stream");

                // 先写响应头
                ctx.write(response);
                // 再写文件内容（零拷贝！）
                ctx.writeAndFlush(region)
                    .addListener(ChannelFutureListener.CLOSE);

                log.info("零拷贝传输文件: {}, size={}", filePath, file.length());

            } catch (IOException e) {
                sendError(ctx, 500, "Internal error");
            }
        } else {
            ctx.fireChannelRead(request); // 不是文件下载，交给下游
        }
    }

    private void sendError(ChannelHandlerContext ctx, int code, String msg) {
        FullHttpResponse response = new DefaultFullHttpResponse(
            HttpVersion.HTTP_1_1, HttpResponseStatus.valueOf(code));
        response.content().writeBytes(msg.getBytes());
        response.headers().set(HttpHeaderNames.CONTENT_TYPE, "text/plain");
        ctx.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE);
    }
}
```

---

## 本章总结

| 风险 | 原因 | 解决方案 |
|------|------|---------|
| **背压失效导致 OOM** | 后端慢，前端快，缓冲区无限膨胀 | WriteBufferWaterMark + 暂停读取（setAutoRead） |
| **大文件传输耗尽内存** | 整个文件加载到 JVM 堆 | FileRegion + sendfile 零拷贝 |
| **连接泄漏** | 转发后未及时关闭后端连接 | 监听 close 事件，清理资源 |

**核心原则**：
1. **背压是网关的生命线**——没有背压控制的网关，在遇到后端慢服务时一定会 OOM
2. **大文件必须零拷贝**——网关中任何涉及大文件传输的场景，都不应该把文件加载到堆内存
3. **网关不要处理业务逻辑**——网关只做路由、鉴权、限流、转发。业务逻辑应该下沉到后端服务