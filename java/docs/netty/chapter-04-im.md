# 第4章 场景二：实时消息推送与 IM 系统（百万长连接）

## 4.1 实现原理

### WebSocket 与 TCP 长连接

IM 系统（即时通讯）的核心能力是**服务端主动推送**。传统 HTTP 是"请求-响应"模式，服务端不能主动给客户端发消息。WebSocket 和 TCP 长连接让**双向通信**成为可能：

```
HTTP 轮询 vs WebSocket 长连接：

  HTTP 轮询（每秒请求一次）：
  客户端                          服务端
    │                               │
    │── HTTP GET /new-msg?since=X ──►│
    │◄── {msg: null} ───────────────│  ← 99% 的请求都在"空转"
    │                               │
    │── HTTP GET /new-msg?since=X ──►│
    │◄── {msg: null} ───────────────│
    │                               │
    │── HTTP GET /new-msg?since=X ──►│
    │◄── {msg: "你好"} ────────────│
    │                               │
    │  每次请求都有 HTTP 头开销      │
    │  每次都要建立/释放连接          │

  WebSocket 长连接：
  客户端                          服务端
    │                               │
    │── WebSocket 握手 ────────────►│
    │◄── 101 Switching Protocols ──│
    │                               │
    │◄── {msg: "你好"} ─────────────│  ← 服务端主动推
    │                               │
    │── {msg: "收到"}──────────────►│  ← 客户端发送
    │                               │
    │  没有 HTTP 头开销             │
    │  连接一直保持，双向实时通信     │
```

### Netty WebSocket 服务端实现

```java
/**
 * Netty WebSocket 服务端
 */
@SpringBootApplication
public class IMNettyServer {

    public static void main(String[] args) {
        EventLoopGroup bossGroup = new NioEventLoopGroup(1);
        EventLoopGroup workerGroup = new NioEventLoopGroup();

        try {
            ServerBootstrap b = new ServerBootstrap();
            b.group(bossGroup, workerGroup)
             .channel(NioServerSocketChannel.class)
             .childHandler(new ChannelInitializer<SocketChannel>() {
                 @Override
                 protected void initChannel(SocketChannel ch) {
                     ChannelPipeline p = ch.pipeline();

                     // HTTP 协议编解码（WebSocket 握手基于 HTTP）
                     p.addLast(new HttpServerCodec());
                     // HTTP 聚合（将 HttpRequest 和 HttpContent 聚合成 FullHttpRequest）
                     p.addLast(new HttpObjectAggregator(65536));
                     // WebSocket 协议（指定路径 /ws）
                     p.addLast(new WebSocketServerProtocolHandler("/ws", null, true));

                     // 业务处理器
                     p.addLast(new WebSocketFrameHandler());
                 }
             })
             .option(ChannelOption.SO_BACKLOG, 128)
             .childOption(ChannelOption.SO_KEEPALIVE, true);

            ChannelFuture f = b.bind(8080).sync();
            log.info("IM 服务端启动，端口: 8080");
            f.channel().closeFuture().sync();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            bossGroup.shutdownGracefully();
            workerGroup.shutdownGracefully();
        }
    }
}
```

### 连接管理（Channel 分组）

百万连接场景下，最核心的是**高效管理所有连接**——发送消息时快速定位到目标用户的 Channel：

```java
/**
 * 用户连接管理器
 *
 * 核心数据结构：
 *   ConcurrentHashMap<Long, Channel> —— userId → Channel 映射
 *   ChannelGroup —— 所有在线 Channel 组（用于广播）
 */
@Component
public class UserChannelManager {

    // 用户 ID → Channel 映射（登录后绑定）
    private final ConcurrentHashMap<Long, Channel> userChannelMap =
        new ConcurrentHashMap<>();

    // 所有在线 Channel（用于广播）
    private final ChannelGroup allChannels =
        new DefaultChannelGroup(GlobalEventExecutor.INSTANCE);

    /**
     * 用户登录，绑定 Channel
     */
    public void bindUser(Long userId, Channel channel) {
        // 如果用户已在其他设备登录，踢下线
        Channel oldChannel = userChannelMap.get(userId);
        if (oldChannel != null && oldChannel.isActive()) {
            log.warn("用户 {} 在其他设备登录，踢下线", userId);
            oldChannel.writeAndFlush(new TextWebSocketFrame(
                "您的账号在其他设备登录"));
            oldChannel.close();
        }

        userChannelMap.put(userId, channel);
        allChannels.add(channel);

        // 将 userId 附加到 Channel 上（方便其他 Handler 获取）
        channel.attr(AttributeKey.valueOf("userId")).set(userId);

        log.info("用户 {} 上线，当前在线人数: {}", userId, allChannels.size());
    }

    /**
     * 用户断开连接，解绑
     */
    public void unbindUser(Channel channel) {
        Long userId = channel.attr(AttributeKey.valueOf("userId")).getAndSet(null);
        if (userId != null) {
            userChannelMap.remove(userId, channel);
            allChannels.remove(channel);
            log.info("用户 {} 下线，当前在线人数: {}", userId, allChannels.size());
        }
    }

    /**
     * 给指定用户发送消息（单播）
     */
    public boolean sendToUser(Long userId, String message) {
        Channel channel = userChannelMap.get(userId);
        if (channel != null && channel.isActive()) {
            channel.writeAndFlush(new TextWebSocketFrame(message));
            return true;
        }
        return false; // 用户不在线
    }

    /**
     * 广播消息给所有在线用户
     */
    public void broadcast(String message) {
        allChannels.writeAndFlush(new TextWebSocketFrame(message));
    }

    /**
     * 获取在线用户数
     */
    public int onlineCount() {
        return userChannelMap.size();
    }

    /**
     * 批量发送（给一组用户发送消息）
     */
    public void sendToGroup(List<Long> userIds, String message) {
        userIds.forEach(userId -> sendToUser(userId, message));
    }

    /**
     * 获取所有在线用户 ID
     */
    public Set<Long> allOnlineUsers() {
        return userChannelMap.keySet();
    }
}
```

### WebSocket 消息处理器

```java
/**
 * WebSocket 消息处理器
 */
public class WebSocketFrameHandler extends SimpleChannelInboundHandler<WebSocketFrame> {

    @Autowired
    private UserChannelManager channelManager;

    @Autowired
    private MessageService messageService;

    @Override
    public void handlerAdded(ChannelHandlerContext ctx) {
        log.info("新连接: {}", ctx.channel().remoteAddress());
    }

    @Override
    public void handlerRemoved(ChannelHandlerContext ctx) {
        channelManager.unbindUser(ctx.channel());
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
        if (frame instanceof TextWebSocketFrame) {
            // 处理文本消息
            String text = ((TextWebSocketFrame) frame).text();
            handleMessage(ctx, text);
        } else if (frame instanceof PingWebSocketFrame) {
            // 自动响应 Ping（WebSocket 协议层已自动处理 Pong）
            ctx.channel().write(new PongWebSocketFrame(frame.content().retain()));
        } else if (frame instanceof CloseWebSocketFrame) {
            // 客户端关闭
            ctx.close();
        }
    }

    private void handleMessage(ChannelHandlerContext ctx, String text) {
        try {
            // 解析消息 JSON
            IMProtocol protocol = JSON.parseObject(text, IMProtocol.class);

            switch (protocol.getType()) {
                case "LOGIN":
                    // 登录绑定
                    Long userId = Long.parseLong(protocol.getData());
                    channelManager.bindUser(userId, ctx.channel());
                    ctx.channel().writeAndFlush(new TextWebSocketFrame(
                        "{\"type\":\"LOGIN_SUCCESS\",\"data\":\"" + userId + "\"}"));
                    break;

                case "SINGLE_MSG":
                    // 单聊消息
                    SingleMessage msg = JSON.parseObject(protocol.getData(), SingleMessage.class);
                    boolean sent = channelManager.sendToUser(msg.getToUserId(), text);
                    // 如果用户不在线，存储离线消息
                    if (!sent) {
                        messageService.saveOfflineMessage(msg.getToUserId(), text);
                    }
                    // 回执
                    ctx.channel().writeAndFlush(new TextWebSocketFrame(
                        "{\"type\":\"ACK\",\"data\":\"" + msg.getMsgId() + "\"}"));
                    break;

                case "GROUP_MSG":
                    // 群聊消息
                    GroupMessage groupMsg = JSON.parseObject(protocol.getData(), GroupMessage.class);
                    channelManager.sendToGroup(groupMsg.getTargetUserIds(), text);
                    break;

                case "HEARTBEAT":
                    // 心跳响应（只需回复一个空帧即可）
                    ctx.channel().writeAndFlush(new TextWebSocketFrame(
                        "{\"type\":\"HEARTBEAT_ACK\"}"));
                    break;

                default:
                    log.warn("未知消息类型: {}", protocol.getType());
            }
        } catch (Exception e) {
            log.error("消息处理异常", e);
            ctx.channel().writeAndFlush(new TextWebSocketFrame(
                "{\"type\":\"ERROR\",\"data\":\"消息格式错误\"}"));
        }
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        log.error("WebSocket 异常", cause);
        ctx.close();
    }
}
```

---

## 4.2 四大潜在风险

### 风险一：内存 OOM

百万连接的 IM 系统，最隐蔽的风险就是**内存被不知不觉吃掉**：

```
百万连接下的内存分析：

  每个 Channel 的内存：
  ┌────────────────────────────────────┐
  │ Channel 对象本身:     ~1KB         │
  │ ChannelPipeline:      ~2KB         │
  │ 各 Handler 实例:      ~3KB         │
  │ Socket 读写缓冲区:     ~64KB        │ ← 最大头！
  │ ChannelOutboundBuffer: ~32KB       │ ← 消息积压时膨胀
  ├────────────────────────────────────┤
  │ 平均每个连接:  ~100KB               │
  │ 100 万连接:    100GB ← 不可能！     │
  └────────────────────────────────────┘

  实际优化后：
  ┌────────────────────────────────────┐
  │ 精简 Pipeline:        ~2KB         │
  │ 调整 SO_RCVBUF/SO_SNDBUF: ~4KB    │
  │ Channel 共享 Handler:  ~1KB        │
  │ ByteBuf 池化:          ~2KB        │
  ├────────────────────────────────────┤
  │ 平均每个连接:  ~10KB                │
  │ 100 万连接:    10GB ← 还勉强可以   │
  └────────────────────────────────────┘
```

### 风险二：消息丢失

```
消息丢失的三种场景：

  场景 1：客户端写入失败
    客户端发送消息 → 写入 Socket 缓冲区 → 网络中断
    → writeAndFlush 返回成功（TCP buffer 还在本地）
    → 但实际上远程没收到
    → 需要应用层 ACK 确认

  场景 2：服务端宕机
    收到消息 → 内存存储（还没来得及写入 DB）
    → 服务宕机 → 消息丢失
    → 需要消息持久化

  场景 3：消费者处理慢
    服务端收到消息 → 放入队列 → 消费者来不及处理
    → 队列积压 → OOM → 消息丢失
    → 需要背压机制
```

### 风险三：惊群效应

```
惊群效应的时间线：

  场景：服务器重启，100 万客户端同时重连

  时间       事件
  ─────────────────────────────────────
  T0:    服务器宕机
  T0+1ms: 100 万客户端检测到连接断开
  T0+2ms: 50 万个客户端发起重连（CF: 同时！）
  T0+3ms: 另外 50 万个也发起重连
  T0+3ms: 服务器 TCP 队列被打满
  T0+4ms: 大量连接超时 → 再发起重连
  T0+5ms: 服务器 CPU 100%、内存暴涨
  T0+10ms: 服务器第二次宕机

  这就是惊群效应——100 万只"羊"同时冲向服务器
```

### 风险四：发送缓冲区积压

当服务端向客户端推送消息，但客户端消费速度跟不上时，`ChannelOutboundBuffer` 会持续膨胀：

```
发送缓冲区积压的连锁反应：

  生产者（推送消息） │      ChannelOutboundBuffer      │ 消费者（客户端网络写入）
                    │                                   │
   10 msg/s ──────► │  ┌─────────────────────────┐      │
                    │  │ msg1 → msg2 → ... → msgN │      │  → 3 msg/s（写不进去）
                    │  └─────────────────────────┘      │
                    │           ↑                       │
                    │    缓冲区持续膨胀！                  │
                    │    占用 Direct Memory 越来越多！     │
                    │                                   │
  如果不加控制 → Direct Memory OOM → 整个 JVM 挂掉
```

---

## 4.3 优化与应对方案

### 方案一：内存优化——精简 Pipeline 与调整缓冲区

```java
public class OptimizedIMInitializer extends ChannelInitializer<SocketChannel> {

    @Override
    protected void initChannel(SocketChannel ch) {
        // 1. 精简 Pipeline：移除不必要的 Handler
        ChannelPipeline p = ch.pipeline();
        p.addLast("codec", new WebSocketServerProtocolHandler("/ws", null, true));
        p.addLast("handler", SHARED_HANDLER); // 单例共享，不每个连接创建

        // 2. 调整 TCP 缓冲区（减少每个连接的内存占用）
        ch.config().setRecvByteBufAllocator(new FixedRecvByteBufAllocator(2048));
        ch.config().setWriteBufferHighWaterMark(64 * 1024);  // 64KB
        ch.config().setWriteBufferLowWaterMark(32 * 1024);   // 32KB
    }
}
```

### 方案二：应用层 ACK 与离线消息

```java
/**
 * 可靠消息——应用层 ACK 机制
 *
 * 每发送一条消息，等待客户端 ACK
 * 如果未收到 ACK，重新推送或存储为离线消息
 */
public class ReliableMessageHandler extends SimpleChannelInboundHandler<TextWebSocketFrame> {

    // 等待 ACK 的消息
    private final ConcurrentHashMap<String, PendingMessage> pendingAck =
        new ConcurrentHashMap<>();

    // 定时重发未 ACK 的消息
    private final ScheduledExecutorService scheduler =
        Executors.newScheduledThreadPool(1);

    @Override
    public void channelActive(ChannelHandlerContext ctx) {
        // 连接建立后，检查是否有离线消息
        Long userId = ctx.channel().attr(AttributeKey.valueOf("userId")).get();
        if (userId != null) {
            List<String> offlineMessages = messageService.getOfflineMessages(userId);
            offlineMessages.forEach(msg -> sendWithAck(ctx, msg));
        }
    }

    /**
     * 发送消息并等待 ACK
     */
    public void sendWithAck(ChannelHandlerContext ctx, String message) {
        String msgId = UUID.randomUUID().toString();
        String wrappedMsg = wrapWithMsgId(msgId, message);

        ctx.channel().writeAndFlush(new TextWebSocketFrame(wrappedMsg));

        // 放入待确认队列
        PendingMessage pending = new PendingMessage(msgId, wrappedMsg, 0);
        pendingAck.put(msgId, pending);

        // 3 秒后未收到 ACK → 重发
        scheduler.schedule(() -> {
            PendingMessage pm = pendingAck.get(msgId);
            if (pm != null && pm.retryCount < 3) {
                log.warn("消息未收到 ACK，重发: msgId={}, retry={}", msgId, pm.retryCount);
                ctx.channel().writeAndFlush(new TextWebSocketFrame(pm.content));
                pm.retryCount++;
                // 继续调度
                scheduler.schedule(this::retryCheck, 3, TimeUnit.SECONDS);
            } else if (pm != null) {
                // 3 次重试都失败 → 存离线消息
                log.error("消息重试 3 次失败，转为离线消息: msgId={}", msgId);
                messageService.saveOfflineMessage(userId, pm.content);
                pendingAck.remove(msgId);
            }
        }, 3, TimeUnit.SECONDS);
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, TextWebSocketFrame frame) {
        String text = frame.text();
        IMProtocol protocol = JSON.parseObject(text, IMProtocol.class);

        if ("ACK".equals(protocol.getType())) {
            // 收到 ACK，移除待确认
            String msgId = protocol.getData();
            pendingAck.remove(msgId);
            return;
        }

        // 非 ACK 消息，交给下一个 Handler
        ctx.fireChannelRead(frame);
    }

    @Data
    private static class PendingMessage {
        private final String msgId;
        private final String content;
        private int retryCount;

        public PendingMessage(String msgId, String content, int retryCount) {
            this.msgId = msgId;
            this.content = content;
            this.retryCount = retryCount;
        }
    }
}
```

### 方案三：指数退避 + 随机抖动防惊群

```java
/**
 * 客户端重连策略——指数退避 + 随机抖动
 *
 * 核心思想：
 *   100 万客户端同时重连 = 服务器爆炸
 *   让每个客户端在不同的时间点重连
 */
public class ReconnectStrategy {

    private static final int BASE_DELAY_MS = 1000;   // 基础延迟 1 秒
    private static final int MAX_DELAY_MS = 120_000; // 最大延迟 2 分钟
    private static final double JITTER_RATE = 0.5;   // 50% 的随机抖动

    private final EventLoopGroup eventLoopGroup;
    private final Bootstrap bootstrap;

    private int retryCount = 0;

    public ReconnectStrategy(EventLoopGroup eventLoopGroup, Bootstrap bootstrap) {
        this.eventLoopGroup = eventLoopGroup;
        this.bootstrap = bootstrap;
    }

    /**
     * 计算下一次重连的延迟时间
     *
     * 公式：delay = min(BASE_DELAY × 2^retry, MAX_DELAY) + random(0, delay × JITTER_RATE)
     *
     * 效果：
     *   第 1 次重试: 1s + random(0, 0.5s)   = 1.0-1.5s
     *   第 2 次重试: 2s + random(0, 1s)     = 2.0-3.0s
     *   第 3 次重试: 4s + random(0, 2s)     = 4.0-6.0s
     *   ...
     *   第 8 次重试: 128s + random(0, 64s)  = 128-192s
     *   第 9 次以后: 120s + random(0, 60s)  = 120-180s（封顶）
     */
    public void reconnect() {
        int delay = Math.min(MAX_DELAY_MS,
            BASE_DELAY_MS * (1 << Math.min(retryCount, 7))); // 限制指数增长

        int jitter = ThreadLocalRandom.current().nextInt(0, (int) (delay * JITTER_RATE));
        int totalDelay = delay + jitter;

        log.info("计划重连: retry={}, delay={}ms", retryCount, totalDelay);

        eventLoopGroup.schedule(() -> {
            bootstrap.connect("127.0.0.1", 8080).addListener((ChannelFutureListener) future -> {
                if (future.isSuccess()) {
                    log.info("重连成功");
                    retryCount = 0; // 重置计数
                } else {
                    retryCount++;
                    reconnect(); // 继续重试
                }
            });
        }, totalDelay, TimeUnit.MILLISECONDS);
    }
}
```

**100 万客户端使用指数退避 + 抖动的效果**：

```
时间         重连客户端数
────────────────────────────────────
T0+1~1.5s:    ~5000  ← 少量客户端开始重连
T0+2~3s:      ~10000 ← 第二次重试窗口
T0+4~6s:      ~20000
T0+8~12s:     ~40000
T0+16~24s:    ~80000
T0+32~48s:    ~160000
T0+64~96s:    ~320000
T0+120~180s:   ~363000 (剩余 + 封顶后的)

→ 没有惊群！服务器平稳度过重连期
```

### 方案四：背压控制——WriteBufferWaterMark

```java
/**
 * 背压控制——当 Channel 写缓冲区超限时暂停读取上游数据
 *
 * 在 Netty 中通过 Channel.isWritable() 和水位线机制实现
 */
public class BackpressureHandler extends ChannelDuplexHandler {

    // 配置水位线（在初始化时设置）
    private static final WriteBufferWaterMark WATER_MARK =
        new WriteBufferWaterMark(32 * 1024, 64 * 1024); // 低水位 32KB，高水位 64KB

    @Override
    public void channelActive(ChannelHandlerContext ctx) {
        // 设置水位线
        ctx.channel().config().setWriteBufferWaterMark(WATER_MARK);
        ctx.fireChannelActive();
    }

    @Override
    public void write(ChannelHandlerContext ctx, Object msg, ChannelPromise promise) {
        // 检查是否可写
        if (!ctx.channel().isWritable()) {
            // 缓冲区超限，丢弃消息（或存到 DB）
            log.warn("Channel 不可写，丢弃消息: remote={}",
                ctx.channel().remoteAddress());
            ReferenceCountUtil.release(msg);
            promise.setFailure(new RuntimeException("Channel 不可写"));
            return;
        }
        ctx.write(msg, promise);
    }

    @Override
    public void channelWritabilityChanged(ChannelHandlerContext ctx) {
        if (ctx.channel().isWritable()) {
            // 缓冲区内数据已写入 Socket，恢复从上游读取
            ctx.channel().config().setAutoRead(true);
            log.debug("Channel 恢复可写");
        } else {
            // 缓冲区水位过高，暂停读取上游数据
            ctx.channel().config().setAutoRead(false);
            log.warn("Channel 不可写，暂停读取");
        }
        ctx.fireChannelWritabilityChanged();
    }
}
```

---

## 4.4 百万长连接压测与监控

### 连接数监控

```java
@Component
public class IMConnectionMonitor {

    @Autowired
    private UserChannelManager channelManager;

    @Autowired
    private MeterRegistry meterRegistry;

    @Scheduled(fixedRate = 5000)
    public void reportMetrics() {
        int onlineCount = channelManager.onlineCount();

        // 上报到 Prometheus
        meterRegistry.gauge("im.online.users", onlineCount);

        // 日志（用于告警）
        log.info("当前在线用户: {}", onlineCount);

        if (onlineCount > 900_000) {
            log.warn("在线用户数接近上限: {}", onlineCount);
        }
        if (onlineCount > 980_000) {
            log.error("在线用户数超过安全阈值: {}", onlineCount);
            // TODO: 触发限流/扩容
        }
    }
}
```

---

## 本章总结

| 风险 | 危害 | 解决方案 |
|------|------|---------|
| **内存 OOM** | 百万连接直接撑爆 JVM | 精简 Pipeline、调整缓冲区、ByteBuf 池化 |
| **消息丢失** | 用户收不到消息 | 应用层 ACK + 离线消息存储 |
| **惊群效应** | 服务器重启即融断 | 指数退避 + 随机抖动（重连时间分散到 2 分钟） |
| **缓冲区积压** | Direct Memory OOM | WriteBufferWaterMark + 背压停读 |

**对 Java 开发者的启示**：
1. **不要用 HTTP 轮询做 IM**——WebSocket 的成本和延迟都远低于轮询，Netty 是 Java 生态中最成熟的 WebSocket 实现
2. **在线用户管理是 IM 的核心**——`ConcurrentHashMap<Long, Channel>` 是最关键的数据结构，务必保证线程安全
3. **重连策略决定系统稳定性**——没有抗惊群设计的 IM 系统上线必挂
4. **应用层 ACK 是 IM 的必需品**——TCP 只能保证"发送了"，不能保证"收到了"