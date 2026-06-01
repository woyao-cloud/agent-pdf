# 第4章 场景二：实时消息推送与 IM 系统（百万长连接）

## 本章导读

2020 年初，某知名在线教育平台在疫情爆发的第一天，日活用户从 100 万暴涨到 1000 万。服务器在上午 10 点准时崩溃——不是因为算力不够，而是因为连接数打满了。他们的 IM 系统基于 HTTP 长轮询实现，每个用户每秒轮询一次，1000 万用户就是每秒 1000 万次 HTTP 请求。每个请求带着几百字节的 HTTP 头，光网络带宽就撑不住了。

IM 系统（即时通讯）与 RPC 系统有一个本质区别：**RPC 是"客户端主动请求"，IM 是"服务端主动推送"**。这个区别导致了完全不同的技术选型：

- RPC：请求-响应模式，客户端发送请求，服务端返回响应——HTTP/2 或自定义协议都可以
- IM：双向通信模式，服务端需要主动向客户端推送消息——只有 WebSocket 或原始 TCP 长连接能做到

从本章开始，我们将深入 WebSocket 长连接的实现细节。你将看到：如何在 Netty 中搭建 WebSocket 服务端、如何管理百万连接的内存和生命周期、如何防止消息丢失、以及——**最重要的**——如何在服务器宕机重启后，不让百万客户端同时重连把服务器再次冲垮。

---

## 4.1 实现原理

### WebSocket 与 TCP 长连接——为什么 HTTP 轮询不可行？

在 WebSocket 出现之前，实现"实时推送"的唯一方式是**长轮询（Long Polling）**。客户端发起 HTTP 请求，服务端保持连接挂起，直到有新消息才返回。这种方式看似"实时"，但代价极高：

```
HTTP 轮询 vs WebSocket 长连接的带宽对比：

  HTTP 轮询（假设每秒查一次是否有新消息）：

  每次请求的字节数：
  ┌──────────────────────────────────────────┐
  │  请求头（Cookie、User-Agent、等）≈ 800B   │
  │  响应头（Set-Cookie、Content-Type 等）≈ 200B│
  │  实际数据（{"msg": null}） ≈ 15B           │
  │                                            │
  │  每次 HTTP 往返：约 1015 字节的浪费         │
  │  99% 的请求都在"空转"（没有新消息）         │
  └──────────────────────────────────────────┘

  1000 万用户，每秒轮询 1 次：
  每秒带宽 = 1000 万 × 1KB = 10GB/s
  万兆网卡（10Gbps ≈ 1.25GB/s）直接被打满
  还没算上 HTTP 连接建立的开销

  WebSocket 长连接（双向实时通信）：

  连接建立后，每次消息传输：
  ┌──────────────────────────────────────────┐
  │  WebSocket 帧头 ≈ 2-14 字节               │
  │  实际数据 ≈ N 字节                         │
  │                                            │
  │  没有 HTTP 头，0 字节浪费                   │
  │  服务端有新消息才推，没有"空转"请求          │
  └──────────────────────────────────────────┘

  1000 万在线用户，每秒推送 10 万条消息：
  每秒带宽 = 10 万 × 100B = 10MB/s
  完全在网卡能力范围内
```

所以结论很明确：**任何需要实时双向通信的场景（IM、推送、实时协作），都应该用 WebSocket 而不是 HTTP 轮询。** 这不是"优化建议"，而是"能否支撑大规模用户"的必要条件。

### WebSocket 握手——升级协议的过程

WebSocket 连接以一次 HTTP 请求开始（握手），然后切换到 WebSocket 协议。理解这个握手过程，有助于你配置 Pipeline 中的 Handler 顺序：

```
WebSocket 握手（Netty 内部自动完成）：

  客户端                                服务端
    │                                    │
    │── HTTP Upgrade Request ──────────► │  客户端请求升级协议
    │   GET /ws HTTP/1.1                │  Connection: Upgrade
    │   Upgrade: websocket               │  Sec-WebSocket-Key: dGhl...
    │   Sec-WebSocket-Version: 13        │
    │                                    │
    │                                    │  Netty 的 WebSocketServerProtocolHandler
    │                                    │  自动校验请求头
    │                                    │  计算 Sec-WebSocket-Accept
    │                                    │
    │◄── 101 Switching Protocols ────────│
    │   HTTP/1.1 101 Switching Protocols  │
    │   Upgrade: websocket               │
    │   Sec-WebSocket-Accept: s3pPL...   │
    │                                    │
    │  握手完成！之后的数据都是 WebSocket 帧 │
    │  ─── data (TextWebSocketFrame) ──► │
    │  ◄── data (TextWebSocketFrame) ───│
```

**Netty 的 Pipeline 中，WebSocket 握手相关的 Handler 顺序必须严格遵守**：

```java
p.addLast(new HttpServerCodec());                       // 1. HTTP 编解码（解析握手请求）
p.addLast(new HttpObjectAggregator(65536));             // 2. HTTP 聚合（将多个 HttpChunk 合成完整请求）
p.addLast(new WebSocketServerProtocolHandler("/ws"));   // 3. WebSocket 协议处理（握手 + 帧转换）
// 4. 之后就可以直接用 TextWebSocketFrame / BinaryWebSocketFrame 通信了
p.addLast(new WebSocketFrameHandler());                 // 5. 业务处理器
```

**为什么需要前面的 HTTP Handler？** WebSocket 握手本身是基于 HTTP 的升级请求。`HttpServerCodec` 将字节解码为 HttpRequest，`HttpObjectAggregator` 将分块的 HTTP 体聚合成完整的 FullHttpRequest，然后 `WebSocketServerProtocolHandler` 从中提取出握手信息，完成协议升级。升级成功后，这条连接上后续的所有数据都直接以 WebSocket 帧的形式传递，不再经过 HTTP 编解码器。

### 连接管理——在线用户的核心数据结构

IM 系统的核心就是**在线用户管理**——知道谁在线，能快速找到他的连接，并给他发送消息。这个需求看似简单，但在百万连接规模下，每一步都有陷阱：

```java
/**
 * 用户连接管理器
 *
 * 核心设计：
 *   1. ConcurrentHashMap<Long, Channel> —— 用户 ID → 连接
 *   2. Channel.attr() —— 将用户 ID 附加到 Channel 上（方便解绑时知道谁谁）
 *   3. 踢下线逻辑 —— 同一用户在另一个设备登录时，强制断开旧连接
 *
 * 为什么这些设计很重要？
 */
@Component
public class UserChannelManager {

    // 核心 Map：用户 ID → Channel
    // 为什么用 ConcurrentHashMap？
    // bindUser() 和 unbindUser() 可能在不同 EventLoop 线程中被调用
    // bindUser() —— 用户登录时，在 EventLoop 线程中调用
    // unbindUser() —— 连接断开时，在同一个或另一个 EventLoop 线程中调用
    // 它们之间没有 happens-before 关系，所以必须用线程安全容器
    //
    // 为什么不用 synchronized？
    // 百万连接的 IM 系统中，登录/登出是非常频繁的操作
    // synchronized 会阻塞其他所有操作，成为并发瓶颈
    private final ConcurrentHashMap<Long, Channel> userChannelMap =
        new ConcurrentHashMap<>();

    // 所有在线 Channel 组（用于全服广播、状态统计）
    private final ChannelGroup allChannels =
        new DefaultChannelGroup(GlobalEventExecutor.INSTANCE);

    /**
     * 用户登录，绑定 Channel
     *
     * 多端登录策略：同一用户在另一设备登录时，踢掉旧设备
     * 这是大多数 IM 系统的默认策略（微信也是如此）
     */
    public void bindUser(Long userId, Channel newChannel) {
        // 关键操作：用 ConcurrentHashMap 的 get+put 复合操作
        // 这里不是原子的，但我们的设计允许"短暂的两个 Channel 存在"
        Channel oldChannel = userChannelMap.get(userId);

        if (oldChannel != null && oldChannel.isActive()) {
            // 用户已在其他设备登录
            // 通知旧设备被踢下线（发送一条通知消息）
            log.warn("用户 {} 在其他设备登录，踢下线", userId);
            oldChannel.writeAndFlush(
                new TextWebSocketFrame("{\"type\":\"KICK\",\"msg\":\"您的账号在其他设备登录\"}")
            );
            // 强制关闭旧连接
            oldChannel.close();
        }

        // 绑定新连接
        userChannelMap.put(userId, newChannel);
        allChannels.add(newChannel);

        // ⚠️ 关键设计：将用户 ID 附加到 Channel 上
        // 当 Channel 断开时（channelInactive / handlerRemoved），
        // 我们需要知道这个 Channel 对应哪个用户
        // 如果没有这行代码，unbindUser 就没法从 Map 中正确移除
        newChannel.attr(AttributeKey.valueOf("userId")).set(userId);

        log.info("用户 {} 上线，当前在线: {}", userId, allChannels.size());
    }

    /**
     * 用户断开连接，解绑
     *
     * 调用时机：
     * 1. 客户端主动断开（关闭 App/浏览器）
     * 2. 网络断开触发 channelInactive
     * 3. 被踢下线
     * 4. 连接假死被检测到后关闭
     */
    public void unbindUser(Channel channel) {
        // 从 Channel 的属性中取出用户 ID
        Long userId = channel.attr(AttributeKey.valueOf("userId"))
            .getAndSet(null);

        if (userId != null) {
            // remove(userId, channel) 而不是简单的 remove(userId)
            // 防止"用户在新连接中登录了，旧连接才触发 unbind"的竞态条件
            userChannelMap.remove(userId, channel);
            allChannels.remove(channel);
            log.info("用户 {} 下线，当前在线: {}", userId, allChannels.size());
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
     * 广播给所有在线用户（慎用！）
     */
    public void broadcast(String message) {
        // ChannelGroup 的 writeAndFlush 会自动遍历所有 Channel
        allChannels.writeAndFlush(new TextWebSocketFrame(message));
    }
}
```

> **⚠️ 常见陷阱——`bindUser` 和 `unbindUser` 的竞态条件**：假设用户 A 在手机登录（`bindUser` 正在执行，执行到一半：新 Channel 已创建但尚未放入 Map），这个时候用户 A 的网络突然断开（`unbindUser` 被调用）。如果不小心处理，新 Channel 永远不会被放入 Map，用户 A 再也连不上。Netty 的 EventLoop 单线程模型保证了同一个 Channel 的事件是串行的，但不同 Channel 的事件仍然可能并发（不同 EventLoop 线程处理不同 Channel）。所以在 `unbindUser` 中使用 `remove(userId, channel)` 而不是 `remove(userId)`，确保只移除确切的 Channel 实例。

### WebSocket 消息处理器

```java
/**
 * WebSocket 消息处理器
 *
 * 职责：
 *   1. 处理登录/登出（绑定/解绑用户连接）
 *   2. 转发单聊消息
 *   3. 转发群聊消息
 *   4. 处理心跳
 *   5. 管理离线消息
 */
public class WebSocketFrameHandler extends SimpleChannelInboundHandler<WebSocketFrame> {

    @Autowired
    private UserChannelManager channelManager;

    @Autowired
    private MessageService messageService;

    @Override
    public void handlerAdded(ChannelHandlerContext ctx) {
        log.info("新 WebSocket 连接: {}", ctx.channel().remoteAddress());
    }

    @Override
    public void handlerRemoved(ChannelHandlerContext ctx) {
        // ⚠️ 关键：连接断开时一定要解绑！
        // 否则 userChannelMap 中永久残留着这个用户的旧连接
        // 下次给这个用户发消息时，会发到已经不存在的 Channel 上
        channelManager.unbindUser(ctx.channel());
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
        if (frame instanceof TextWebSocketFrame) {
            String text = ((TextWebSocketFrame) frame).text();
            handleMessage(ctx, text);
        } else if (frame instanceof PingWebSocketFrame) {
            // 自动响应 Ping
            ctx.channel().write(new PongWebSocketFrame(frame.content().retain()));
        } else if (frame instanceof CloseWebSocketFrame) {
            ctx.close();
        }
    }

    private void handleMessage(ChannelHandlerContext ctx, String text) {
        try {
            IMProtocol protocol = JSON.parseObject(text, IMProtocol.class);

            switch (protocol.getType()) {
                case "LOGIN":
                    handleLogin(ctx, protocol);
                    break;
                case "SINGLE_MSG":
                    handleSingleMessage(ctx, protocol);
                    break;
                case "GROUP_MSG":
                    handleGroupMessage(ctx, protocol);
                    break;
                case "HEARTBEAT":
                    // 心跳——只需要回复一个空帧
                    // 不回复的话，客户端可能判定连接假死
                    ctx.channel().writeAndFlush(
                        new TextWebSocketFrame("{\"type\":\"HEARTBEAT_ACK\"}"));
                    break;
                default:
                    log.warn("未知消息类型: {}", protocol.getType());
                    ctx.channel().writeAndFlush(
                        new TextWebSocketFrame("{\"type\":\"ERROR\",\"data\":\"未知类型\"}"));
            }
        } catch (Exception e) {
            log.error("消息处理异常", e);
            ctx.channel().writeAndFlush(
                new TextWebSocketFrame("{\"type\":\"ERROR\",\"data\":\"格式错误\"}"));
        }
    }

    private void handleLogin(ChannelHandlerContext ctx, IMProtocol protocol) {
        Long userId = Long.parseLong(protocol.getData());
        channelManager.bindUser(userId, ctx.channel());

        // 通知登录成功
        ctx.channel().writeAndFlush(new TextWebSocketFrame(
            "{\"type\":\"LOGIN_SUCCESS\",\"data\":\"" + userId + "\"}"));

        // 读取离线消息（如果有）
        List<String> offlineMessages = messageService.getOfflineMessages(userId);
        for (String msg : offlineMessages) {
            ctx.channel().writeAndFlush(new TextWebSocketFrame(msg));
        }
    }

    private void handleSingleMessage(ChannelHandlerContext ctx, IMProtocol protocol) {
        SingleMessage msg = JSON.parseObject(protocol.getData(), SingleMessage.class);

        // 尝试发送给目标用户
        boolean sent = channelManager.sendToUser(msg.getToUserId(), text);

        if (!sent) {
            // 用户不在线 → 存离线消息
            messageService.saveOfflineMessage(msg.getToUserId(), text);
        }

        // 给发送者回执
        ctx.channel().writeAndFlush(new TextWebSocketFrame(
            "{\"type\":\"ACK\",\"data\":\"" + msg.getMsgId() + "\",\"sent\":" + sent + "}"));
    }

    private void handleGroupMessage(ChannelHandlerContext ctx, IMProtocol protocol) {
        GroupMessage groupMsg = JSON.parseObject(protocol.getData(), GroupMessage.class);
        channelManager.sendToGroup(groupMsg.getTargetUserIds(), text);
    }
}
```

---

## 4.2 四大潜在风险

### 风险一：内存 OOM——百万连接的"隐形杀手"

这里不得不提及一个真实的线上事故：某公司的 IM 服务在用户量突破 200 万后，频繁出现 OOM。运维人员检查了堆内存——正常。又检查了 GC 日志——也正常。最后在 `Native Memory Tracking` 中发现了问题：**Direct Memory 涨到了 3GB，而 `-XX:MaxDirectMemorySize` 设置了 2GB。**

问题的根源就是每个连接的 Socket 读写缓冲区。Netty 在分配 Channel 时，默认会为每个连接分配 64KB 的读缓冲区和 64KB 的写缓冲区。200 万连接 × 128KB = 约 24GB。即使实际使用的没有这么多，Netty 的内存池也会预留大量空间。

```
百万连接内存的精细估算：

  必须消耗的部分（无法避免）：
  ┌──────────────────────────────────────────────┐
  │  Channel 对象 + Pipeline 骨架:    ~2KB        │
  │  Socket 数据结构（fd + TCP 缓冲区）:  ~4KB     │
  │  Netty 连接相关内部结构:          ~2KB         │
  ├──────────────────────────────────────────────┤
  │  每个连接最少:                    ~8KB         │
  │  100 万连接:                      8GB          │
  └──────────────────────────────────────────────┘

  可优化的部分（Netty 默认值偏保守）：
  ┌──────────────────────────────────────────────┐
  │  默认读缓冲区（AdaptiveRecvByteBufAllocator） │
  │  初始 2KB，会根据数据大小动态调整，最多 64KB   │
  │  → 如果只有心跳，大部分时间只有 2KB           │
  │                                              │
  │  写缓冲区（WriteBufferWaterMark）             │
  │  默认低水位 32KB，高水位 64KB                │
  │  → 大部分时间缓冲区是空的                      │
  │                                              │
  │  共享 Handler（@Sharable）                     │
  │  如果一个 Handler 实例被多个 Channel 共享       │
  │  → 每个 Channel 省掉了 Handler 实例的内存      │
  └──────────────────────────────────────────────┘

  关键结论：
  100 万连接的最小内存 ≈ 8-10GB（加上 JVM 本身 ≈ 12GB）
  这是物理机的底线——低于这个配置，百万连接不现实
```

### 风险二：消息丢失——TCP 的"可靠"不等于应用的"可靠"

"TCP 是可靠传输协议"——这句话误导了无数开发者。TCP 可靠的是：**数据从 A 进程的内核缓冲区传输到 B 进程的内核缓冲区**。但以下场景 TCP 无法保证：

```
TCP 可靠 vs 应用可靠：

  TCP 保证的"可靠"：
  客户端 Socket 缓冲区 ──── TCP 协议 ────► 服务端 Socket 缓冲区
          ✓ 不丢包
          ✓ 按序到达
          ✓ 无重复到达

  TCP 不保证的"可靠"：
  场景 1：客户端进程把数据写入 Socket 缓冲区的瞬间崩溃
          → 数据在内核缓冲区中，但还没来得及发出去 → 丢了
          → 对端完全不知道

  场景 2：服务端收到数据，放入 ChannelOutboundBuffer
          → 正要处理，内存满了 JVM OOM → 丢了
          → 客户端不知道服务端有没有收到

  场景 3：服务端处理完数据，要写入 DB
          → 写入 DB 前系统断电 → 丢了
          → 客户端收到 ACK 以为消息送达了
```

所以结论是：**业务层的"送达确认"必须由应用层自己实现。** TCP 只保证"字节流到了对端网卡"，不保证"对端应用处理了这条消息"。

### 风险三：惊群效应——服务器重启的"二次灾难"

惊群效应不是 IM 系统独有的，但 IM 系统受冲击最大——因为 IM 的连接数通常是 RPC 的 10-100 倍。一次服务器重启，如果客户端全部在同一瞬间重连，造成的破坏甚至比服务器宕机本身更大：

```
惊群效应的完整时间线（真实线上事故）：

  T0: 服务器硬盘故障，进程退出
      100 万客户端同时检测到连接断开

  T0+0.5s: 100 万客户端几乎同时调用 reconnect()
      ┌─────────────────────────────────────────┐
      │  服务器 TCP 全连接队列：1    ← backlog=1024  │
      │  1024 个连接成功 → 其余全部拒绝              │
      │  被拒绝的客户端收到 Connection Refused        │
      └─────────────────────────────────────────┘

  T0+0.5s: 被拒绝的 99 万客户端立即再次重连
      ┌─────────────────────────────────────────┐
      │  服务器刚刚在处理前 1024 个连接的握手      │
      │  CPU 已经很高了 → 又来了 99 万个 SYN      │
      │  CPU 100%，但实际连接数不到 5000           │
      └─────────────────────────────────────────┘

  T0+1s: 大量连接超时 → 客户端发起第三次重连
      ┌─────────────────────────────────────────┐
      │  服务器 CPU 100%，无法正常处理任何请求    │
      │  现有的 5000 个连接也频繁超时             │
      │  这就是"二次崩溃"                         │
      └─────────────────────────────────────────┘

  T0+10s: 服务器彻底不可用 → 运维被迫重启服务器
          重启后 → 同样的流程再来一遍
          直到有人手动修改代码或限制重连速率
```

### 风险四：发送缓冲区积压——慢客户端拖垮服务器

这是最隐蔽的风险。想象一个群里有 10 万人，有人在群里发了一张大图（10MB）。服务端需要给 10 万个客户端推送这条消息。假设其中 9 万个客户端是手机（网络快，WiFi），但 1 万个客户端是 2G 网络（下载速度 50KB/s）。

```
发一张 10MB 图片到 10 万人群的后果：

  前 9 万人（WiFi）：
  推送完成时间：~1 秒
  缓冲区大小：正常

  后 1 万人（2G，50KB/s）：
  每人的发送速度：50KB/s → 推送 10MB 需要 ~200 秒
  这 1 万人的 Channel 写缓冲区在这 200 秒内持续占用内存
  
  每个人的缓冲区变化：
  T=0: 开始推送 → 缓冲区写入 10MB
  T=1s: 网卡发送完毕 50KB → 缓冲区还剩 9.95MB
  T=10s: 发送完毕 500KB → 缓冲区还剩 9.5MB
  T=200s: 终于发完了...
  
  1 万人的缓冲区总量：
  平均 9MB × 10000 = 90GB！→ Direct Memory 必然 OOM！
```

这就是为什么**水位线 + 消息丢弃/持久化**的背压机制必不可少的原因。

---

## 4.3 优化与应对方案

### 方案一：内存控制——精简 Pipeline + 精确配置缓冲区

```java
/**
 * 百万连接优化的 Pipeline 配置
 *
 * 核心：每个连接省 1KB，100 万连接就省 1GB
 */
public class OptimizedIMInitializer extends ChannelInitializer<SocketChannel> {

    // ⚠️ 关键优化：@Sharable 单例 Handler
    // 所有 Channel 共享同一个实例，不重复创建
    // 条件：Handler 中不能有线程不安全的成员变量
    private static final WebSocketFrameHandler SHARED_HANDLER =
        new WebSocketFrameHandler();

    @Override
    protected void initChannel(SocketChannel ch) {
        ChannelPipeline p = ch.pipeline();

        // 精简的 Pipeline——只保留必须的 Handler
        p.addLast("http-codec", new HttpServerCodec());
        p.addLast("aggregator", new HttpObjectAggregator(65536));
        p.addLast("ws-protocol", new WebSocketServerProtocolHandler("/ws", null, true));
        p.addLast("handler", SHARED_HANDLER); // 共享实例！

        // 精确配置 TCP 读写缓冲区
        // 默认 64KB 太大 → 对于 IM 消息（平均 1-2KB），调小
        ch.config().setRecvByteBufAllocator(
            new FixedRecvByteBufAllocator(2048)); // 读缓冲区固定 2KB

        ch.config().setWriteBufferHighWaterMark(32 * 1024);   // 高水位 32KB
        ch.config().setWriteBufferLowWaterMark(16 * 1024);    // 低水位 16KB
    }
}
```

### 方案二：应用层 ACK + 离线消息（完整实现）

```java
/**
 * 可靠消息传输——应用层 ACK 机制
 *
 * 核心流程：
 *   发送消息 → 等待 ACK → 超时重发 → 3 次失败 → 存离线消息
 *
 * 为什么需要 ACK？
 *   服务端 writeAndFlush 成功 ≠ 客户端收到了
 *   writeAndFlush 只保证数据进入了 TCP 输出缓冲区
 *   如果此时客户端网络突然断开，缓冲区中的数据会被丢弃
 *   只有客户端主动回复 ACK，服务端才能确认"消息已到达客户端应用层"
 */
public class ReliableMessageHandler
        extends SimpleChannelInboundHandler<TextWebSocketFrame> {

    // 等待 ACK 的消息队列
    private final ConcurrentHashMap<String, PendingMessage> pendingAck =
        new ConcurrentHashMap<>();

    private final ScheduledExecutorService scheduler =
        Executors.newScheduledThreadPool(1);

    private static final int MAX_RETRY = 3;
    private static final int ACK_TIMEOUT_SEC = 5;

    @Override
    public void channelActive(ChannelHandlerContext ctx) {
        // 连接建立后，推送离线消息
        Long userId = ctx.channel().attr(AttributeKey.valueOf("userId")).get();
        if (userId != null) {
            List<String> offlineMessages =
                messageService.getOfflineMessages(userId);
            for (String msg : offlineMessages) {
                // 每条离线消息都需要 ACK 确认
                sendWithAck(ctx, msg);
            }
        }
        ctx.fireChannelActive();
    }

    /**
     * 发送消息并等待 ACK
     */
    public void sendWithAck(ChannelHandlerContext ctx, String message) {
        String msgId = UUID.randomUUID().toString();
        String wrappedMsg = wrapWithMsgId(msgId, message);

        // 发送（writeAndFlush 是异步的，不会阻塞）
        ctx.channel().writeAndFlush(new TextWebSocketFrame(wrappedMsg));

        // 放入待确认队列
        PendingMessage pm = new PendingMessage(msgId, wrappedMsg, 0);
        pendingAck.put(msgId, pm);

        // 启动超时检测
        scheduleAckCheck(ctx, msgId);
    }

    private void scheduleAckCheck(ChannelHandlerContext ctx, String msgId) {
        scheduler.schedule(() -> {
            PendingMessage pm = pendingAck.get(msgId);
            if (pm == null) {
                return; // 已经收到 ACK 了，正常
            }

            if (pm.retryCount >= MAX_RETRY) {
                // 重试 3 次都失败 → 存离线消息
                log.error("消息重试 3 次失败，转离线: msgId={}", msgId);
                messageService.saveOfflineMessage(
                    getUserId(ctx), pm.content);
                pendingAck.remove(msgId);
                return;
            }

            // 重发
            log.warn("消息未收到 ACK，第{}次重发: msgId={}",
                pm.retryCount + 1, msgId);
            ctx.channel().writeAndFlush(
                new TextWebSocketFrame(pm.content));
            pm.retryCount++;
            scheduleAckCheck(ctx, msgId); // 继续等待 ACK
        }, ACK_TIMEOUT_SEC, TimeUnit.SECONDS);
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, TextWebSocketFrame frame) {
        try {
            String text = frame.text();
            IMProtocol protocol = JSON.parseObject(text, IMProtocol.class);

            if ("ACK".equals(protocol.getType())) {
                // 收到 ACK → 移除待确认记录
                String msgId = protocol.getData();
                pendingAck.remove(msgId);
                return;
            }
            // 非 ACK 消息，交给下一个 Handler
            ctx.fireChannelRead(frame);

        } catch (Exception e) {
            ctx.fireChannelRead(frame); // 解析失败，交给下游
        }
    }

    private String wrapWithMsgId(String msgId, String content) {
        // 在消息中嵌入 msgId，客户端收到后回复 ACK
        return "{\"msgId\":\"" + msgId + "\",\"data\":" + content + "}";
    }

    @Data
    @AllArgsConstructor
    private static class PendingMessage {
        private String msgId;
        private String content;
        private int retryCount;
    }
}
```

### 方案三：指数退避 + 随机抖动——抗惊群的标准解法

```java
/**
 * 防惊群重连策略
 *
 * 核心公式：
 *   delay = min(基础延迟 × 2^retryCount, 最大延迟) + random(0, delay × 抖动比例)
 *
 * 设计目标：100 万个客户端的重连时间分布到 2 分钟内
 * 而不是集中在 1 秒内
 */
public class AntiHerdingReconnectStrategy {

    private static final int BASE_DELAY_MS = 1000;    // 基础延迟：1 秒
    private static final int MAX_DELAY_MS = 120_000;  // 最大延迟：2 分钟
    private static final double JITTER_RATE = 0.5;    // 抖动：50%

    private final EventLoopGroup eventLoopGroup;
    private final Bootstrap bootstrap;
    private final String host;
    private final int port;

    private int retryCount = 0;

    public AntiHerdingReconnectStrategy(
            EventLoopGroup eventLoopGroup,
            Bootstrap bootstrap,
            String host, int port) {
        this.eventLoopGroup = eventLoopGroup;
        this.bootstrap = bootstrap;
        this.host = host;
        this.port = port;
    }

    /**
     * 发起一次重连（可能会多次调用，直到成功）
     */
    public void reconnect() {
        // 计算延迟：指数退避，上限封顶
        int exponentialDelay = BASE_DELAY_MS *
            (1 << Math.min(retryCount, 7)); // 限制最多 2^7 = 128 倍
        int baseDelay = Math.min(exponentialDelay, MAX_DELAY_MS);

        // 加上随机抖动：每个客户端抖动的幅度不同
        // 抖动范围 [0, baseDelay × JITTER_RATE]
        int jitter = ThreadLocalRandom.current()
            .nextInt(0, (int) (baseDelay * JITTER_RATE) + 1);
        int totalDelay = baseDelay + jitter;

        log.info("计划重连: retry={}, base={}ms, jitter={}ms, total={}ms",
            retryCount, baseDelay, jitter, totalDelay);

        // 在 Netty 的 EventLoop 中调度
        eventLoopGroup.schedule(() -> {
            bootstrap.connect(host, port).addListener(
                (ChannelFutureListener) future -> {
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

**100 万客户端使用指数退避 + 抖动后的分布**：

```
时间（T=服务器恢复时刻）    重连客户端数（累计）     每秒到达数
──────────────────────────────────────────────────────────
T0 ~ T+1.5s:               ~5,000                ~3,300/s
T+1.5 ~ T+3s:              ~15,000               ~6,700/s
T+3 ~ T+6s:                ~35,000               ~6,700/s
T+6 ~ T+12s:               ~75,000              ~6,700/s
T+12 ~ T+24s:              ~155,000             ~6,700/s
T+24 ~ T+48s:              ~315,000             ~6,700/s
T+48 ~ T+96s:              ~635,000             ~6,700/s
T+96 ~ T+180s:             ~1,000,000           ~5,200/s

服务器的连接速率稳定在 ~6,700/s，远低于 10,000/s 的阈值
不会出现任何"连接风暴"
```

### 方案四：背压 + 消息降级

```java
/**
 * 背压控制 Handler
 *
 * 核心逻辑：
 *   检查 Channel 是否"可写"（缓冲区是否超限）
 *   如果不可写，丢弃这条消息并记录（或持久化）
 *   而不是让缓冲区无限膨胀导致 OOM
 */
public class BackpressureHandler extends ChannelDuplexHandler {

    private static final WriteBufferWaterMark WATER_MARK =
        new WriteBufferWaterMark(32 * 1024, 64 * 1024);

    // 分布式限流：每个客户端每秒最多接收 10 条推送
    private final RateLimiter clientRateLimiter =
        RateLimiter.create(10);

    @Override
    public void channelActive(ChannelHandlerContext ctx) {
        ctx.channel().config().setWriteBufferWaterMark(WATER_MARK);
        ctx.fireChannelActive();
    }

    @Override
    public void write(ChannelHandlerContext ctx, Object msg,
                      ChannelPromise promise) {
        if (!ctx.channel().isWritable()) {
            // 不可写 → 消息丢弃或降级
            // 对于 IM 消息，应该存到离线消息，而不是直接丢弃
            storeForLater(ctx, msg);
            ReferenceCountUtil.release(msg);
            promise.setSuccess();
            return;
        }

        if (!clientRateLimiter.tryAcquire()) {
            // 给这个客户端的推送超过了 10 条/秒
            // 降级：合并多条消息为一条"您有 N 条新消息"的通知
            storeForLater(ctx, msg);
            ReferenceCountUtil.release(msg);
            promise.setSuccess();
            return;
        }

        ctx.write(msg, promise);
    }

    @Override
    public void channelWritabilityChanged(ChannelHandlerContext ctx) {
        if (ctx.channel().isWritable()) {
            ctx.channel().config().setAutoRead(true);
        } else {
            ctx.channel().config().setAutoRead(false);
            log.warn("Channel 不可写，暂停读取: {}",
                ctx.channel().remoteAddress());
        }
        ctx.fireChannelWritabilityChanged();
    }
}
```

---

## 4.4 百万连接压测监控

```java
/**
 * 连接数监控——及时发现异常波动
 *
 * 正常的连接增长曲线：
 *   早上 8 点：100 万（高峰）
 *   中午 12 点：80 万
 *   凌晨 2 点：20 万（低谷）
 *
 * 异常场景：
 *   假如 10 分钟内从 100 万跌到 50 万
 *   → 可能是网络故障或服务器问题
 */
@Component
public class IMConnectionMonitor {

    @Autowired
    private UserChannelManager channelManager;

    private final MeterRegistry meterRegistry;

    // 记录过去 5 分钟的采样点，用于趋势分析
    private final LinkedList<Integer> history = new LinkedList<>();

    @Scheduled(fixedRate = 5000)
    public void reportMetrics() {
        int onlineCount = channelManager.onlineCount();
        meterRegistry.gauge("im.online.users", onlineCount);

        history.addLast(onlineCount);
        if (history.size() > 60) { // 5 分钟 × 12 次/分 = 60 点
            history.removeFirst();
        }

        // 检测异常下降
        if (history.size() >= 10) {
            int first = history.getFirst();
            int last = history.getLast();
            if (first > 100_000 && last < first * 0.5) {
                log.error("连接数异常下降：{} → {}，可能发生故障",
                    first, last);
            }
        }
    }
}
```

---

## 本章总结

| 风险 | 根因 | 症状 | 解决方案 |
|------|-----|------|---------|
| **内存 OOM** | 百万连接 × 每个连接的缓冲区 | 频繁 GC、Direct Memory 激增 | 调小读写缓冲区、精简 Pipeline、共享 Handler |
| **消息丢失** | TCP"可靠"不保证应用层送达 | 用户投诉收不到消息 | 应用层 ACK + 离线消息存储 + 重试 |
| **惊群效应** | 所有客户端同时重连 | 服务器挂→重启→再挂 | 指数退避 + 随机抖动（分散到 2 分钟） |
| **缓冲区积压** | 慢客户端拖住推送 | Direct Memory OOM | WriteBufferWaterMark + 背压停读 |

**对 Java 开发者的核心启示**：
1. **不要用 HTTP 长轮询做 IM**——WebSocket 的长连接模式比轮询节省 100 倍的带宽和 10 倍的服务器资源
2. **在线用户管理 = ConcurrentHashMap + Channel.attr**——这是 IM 系统的核心数据结构，务必理解为什么用 ConcurrentHashMap 而不是 synchronized
3. **没有抗惊群设计的 IM 系统到千万连接必然出问题**——这不是"也许"会出问题，而是一定会出
4. **应用层 ACK 是 IM 的必需品**——TCP 保证的是"内核到内核"，不是"应用到应用"。没有应用层 ACK，你永远不知道消息到底送达了没有