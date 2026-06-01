# 第6章 场景四：物联网（IoT）海量设备接入（MQTT/TCP）

## 本章导读

2017 年，某智能电表厂商在南方某省的部署上线后，运维人员发现了一个奇怪的现象：每天凌晨 2 点，服务器 CPU 飙升到 100%，持续 10 分钟后恢复正常。排查了整整一周才发现问题根源——某个村庄的 5000 个电表固件有一个 Bug：在每天的特定时间，它们会同时发送一个超长的畸形报文（剩余长度字段被错误地设置为一个超大值），导致服务端尝试分配 2GB 的内存来处理这个"大包"，OOM Killer 杀掉了进程，然后系统重启，一切恢复正常，直到第二天凌晨 2 点。

IoT（物联网）场景与互联网应用有本质区别，这些区别对网络框架提出了完全不同的要求：

- **设备数量巨大**：一个 IoT 平台接入 100 万台设备是很正常的规模
- **网络条件恶劣**：2G/NB-IoT 网络下，带宽可能只有 10KB/s，延迟可能高达数秒
- **设备固件质量参差不齐**：有些设备使用的是未经严格测试的嵌入式协议栈，可能发送畸形报文
- **协议的多样性**：MQTT、CoAP、Modbus、私有协议……每种协议都有自己的编解码规则
- **安全问题突出**：IoT 设备一旦被攻破，就可能被用来攻击平台本身

这些特征决定了 IoT 网关必须同时具备三个能力：**海量连接**（Netty 天然优势）、**严格的安全校验**（防止畸形报文破坏服务）、**灵活的协议适配**（支持多种协议的接入和转换）。

---

## 6.1 实现原理

### MQTT 协议——为什么是 IoT 的事实标准？

MQTT（Message Queuing Telemetry Transport）是 IBM 在 1999 年开发的轻量级发布-订阅协议。它的核心设计哲学可以用一句话概括：**在尽可能少的字节内，完成尽可能多的通信功能。**

```
MQTT vs HTTP —— 一条消息的对比：

  HTTP POST 一条温度数据：
  ┌─────────────────────────────────────────────┐
  │  POST /api/temperatures  HTTP/1.1            │
  │  Host: iot.example.com                       │
  │  User-Agent: ESP32-Client                    │
  │  Content-Type: application/json              │
  │  Authorization: Bearer xxxxx...              │
  │  Content-Length: 27                          │
  │                                              │
  │  {"device":"sensor1","temp":25.5}             │
  │                                              │
  │  总大小：约 600 字节                          │
  │  其中有效数据：27 字节                        │
  │  有效载荷比例：4.5%                           │
  └─────────────────────────────────────────────┘

  MQTT PUBLISH 同一条数据：
  ┌─────────────────────────────────────────────┐
  │  固定头 (2B)                                 │
  │  Topic: "sensor/temp" (12B)                 │
  │  Payload: {"temp":25.5} (16B)               │
  │                                              │
  │  总大小：约 30 字节                           │
  │  其中有效数据：16 字节                        │
  │  有效载荷比例：53%                            │
  └─────────────────────────────────────────────┘

  在 NB-IoT 网络下（带宽限制 20KB/s）：
  HTTP：600B / 20KB/s = 30ms 传输时间
  MQTT：30B / 20KB/s = 1.5ms 传输时间
  
  每发送一条消息，MQTT 比 HTTP 快 20 倍
  而且 MQTT 有 QoS 级别保证，HTTP 没有内置
```

**MQTT 的三个 QoS 级别**——这是 MQTT 最重要的设计之一，在不同的场景下选择不同的级别：

| QoS 级别 | 含义 | 消息送达保证 | 网络开销 | 适用场景 |
|---------|------|------------|---------|---------|
| **QoS 0** | 最多一次 (At most once) | 消息可能丢失 | 最小（无 ACK） | 环境监测（温度丢了等下一次） |
| **QoS 1** | 至少一次 (At least once) | 消息至少送达一次，可能重复 | 中（1 次 ACK） | 智能电表读数（重复也不影响统计） |
| **QoS 2** | 恰好一次 (Exactly once) | 消息保证送达且不重复 | 最大（4 次交互） | 门锁开关指令（不能重复也不能力丢失） |

```
QoS 1 的交互流程（"至少一次"——最常用）：

  设备                              MQTT Broker
    │                                    │
    │── PUBLISH (msgId=1, QoS=1) ──────► │
    │                                    │  收到消息，存储
    │◄── PUBACK (msgId=1) ──────────────│  确认收到
    │                                    │
    │  如果 PUBACK 丢失，设备会重发：     │
    │── PUBLISH (msgId=1, QoS=1) ──────► │  收到重复消息（通过 msgId 去重）
    │◄── PUBACK (msgId=1) ──────────────│
    │                                    │
    │  结论：设备至少发一次，Broker 至少收一次
    │  可能重复，但不会丢失
```

### Netty 的 MQTT 支持

Netty 内置了完整的 MQTT 编解码器（`io.netty.handler.codec.mqtt` 包），这一点在 IoT 场景中是巨大的优势——你不需要引入额外的 MQTT Broker（如 Mosquitto、EMQX），在 Netty 应用中直接解析 MQTT 协议。

```
MQTT 消息的结构（Netty 的 MqttMessage 对象模型）：

  每个 MQTT 消息包含三个部分：
  ┌──────────────────────────────────────────────────────┐
  │  MqttFixedHeader（固定头）                            │
  │  ├── messageType: CONNECT/PUBLISH/SUBSCRIBE/PINGREQ  │
  │  ├── qos: 0/1/2                                       │
  │  ├── dup: 是否重复消息                                 │
  │  ├── retain: 是否保留消息                              │
  │  └── remainingLength: 剩余长度                        │
  ├──────────────────────────────────────────────────────┤
  │  MqttVariableHeader（可变头，因消息类型而异）           │
  │  ├── CONNECT: 协议名、版本、KeepAlive                  │
  │  ├── PUBLISH: Topic名、msgId                          │
  │  └── SUBSCRIBE: msgId                                 │
  ├──────────────────────────────────────────────────────┤
  │  MqttPayload（负载，因消息类型而异）                    │
  │  ├── CONNECT: ClientId、用户名、密码                    │
  │  ├── PUBLISH: 实际数据（传感器读数等）                  │
  │  └── SUBSCRIBE: 订阅列表                               │
  └──────────────────────────────────────────────────────┘
```

### Netty 实现 MQTT Broker（完整实现）

```java
/**
 * 基于 Netty 的轻量级 MQTT Broker
 *
 * 核心功能：
 *   1. 设备认证（用户名/密码或 ClientId）
 *   2. 主题订阅管理
 *   3. 消息发布与转发
 *   4. 心跳保活
 *   5. 离线消息存储（可选）
 *
 * 不需要外部 MQTT Broker —— Netty 内置了完整的 MQTT 编解码
 */
public class MqttBrokerServer {

    private final EventLoopGroup bossGroup = new NioEventLoopGroup(1);
    private final EventLoopGroup workerGroup = new NioEventLoopGroup();

    public void start(int port) {
        ServerBootstrap b = new ServerBootstrap();
        b.group(bossGroup, workerGroup)
         .channel(NioServerSocketChannel.class)
         .childHandler(new ChannelInitializer<SocketChannel>() {
             @Override
             protected void initChannel(SocketChannel ch) {
                 ChannelPipeline p = ch.pipeline();

                 // 第 1 层：安全防御——最优先
                 // 限制每 IP 的连接速率
                 p.addLast("rate-limiter", new ConnectionRateLimiter());
                 // 60 秒没有收到任何数据 → 踢出
                 p.addLast("idle", new IdleStateHandler(60, 0, 0));

                 // 第 2 层：MQTT 协议解析
                 // MqttDecoder 的参数是 maxPayloadSize = 10240（10KB）
                 // 这本身就是一道安全防线——超过 10KB 的报文会被拒绝
                 p.addLast("decoder", new MqttDecoder(10240));
                 p.addLast("encoder", new MqttEncoder());

                 // 第 3 层：报文完整性校验
                 p.addLast("validator", new MessageValidator());

                 // 第 4 层：业务处理
                 p.addLast("handler", new MqttBrokerHandler());
             }
         })
         .option(ChannelOption.SO_BACKLOG, 1024)
         .childOption(ChannelOption.SO_KEEPALIVE, true)
         .childOption(ChannelOption.TCP_NODELAY, true);

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

```java
/**
 * MQTT Broker 核心业务 Handler
 *
 * 这个 Handler 管理三张表：
 *   1. deviceChannels: 设备 ID → Channel（在线设备）
 *   2. topicSubscriptions: 主题 → 设备 ID 列表（谁订阅了什么）
 *   3. sessionStore: 设备 ID → 会话信息（持久化，用于离线消息）
 */
public class MqttBrokerHandler extends SimpleChannelInboundHandler<MqttMessage> {

    // 在线设备表：deviceId → Channel
    private final ConcurrentHashMap<String, Channel> deviceChannels =
        new ConcurrentHashMap<>();

    // 主题订阅表：topic → 设备 ID 集合
    private final ConcurrentHashMap<String, Set<String>> topicSubscriptions =
        new ConcurrentHashMap<>();

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, MqttMessage msg) {
        // 首先做基本的完整性检查
        if (msg.fixedHeader() == null) {
            log.warn("收到无效 MQTT 消息，关闭连接");
            ctx.close();
            return;
        }

        switch (msg.fixedHeader().messageType()) {
            case CONNECT:
                handleConnect(ctx, (MqttConnectMessage) msg);
                break;
            case PUBLISH:
                handlePublish(ctx, (MqttPublishMessage) msg);
                break;
            case SUBSCRIBE:
                handleSubscribe(ctx, (MqttSubscribeMessage) msg);
                break;
            case PINGREQ:
                // 心跳——MQTT 协议规定必须回复 PINGRESP
                // 如果设备连续几次没收到 PINGRESP，就会判定连接断开
                ctx.writeAndFlush(new MqttMessage(
                    new MqttFixedHeader(
                        MqttMessageType.PINGRESP, false,
                        MqttQoS.valueOf(0), false, 0)));
                break;
            case DISCONNECT:
                handleDisconnect(ctx);
                break;
            default:
                log.warn("未知消息类型: {}",
                    msg.fixedHeader().messageType());
                ctx.close(); // 未知类型 → 断开安全
        }
    }

    private void handleConnect(ChannelHandlerContext ctx,
                               MqttConnectMessage msg) {
        String deviceId = msg.payload().clientIdentifier();

        // ⚠️ 注意：MQTT 协议要求 ClientId 不能为空
        // 有些恶意设备可能发空的 ClientId
        if (deviceId == null || deviceId.isEmpty()) {
            ctx.writeAndFlush(createConnAck(
                MqttConnectReturnCode.CONNECTION_REFUSED_IDENTIFIER_REJECTED));
            ctx.close();
            return;
        }

        // 1. 设备认证
        String username = msg.payload().userName();
        byte[] password = msg.payload().passwordInBytes();

        if (!authenticate(deviceId, username, password)) {
            // 认证失败
            ctx.writeAndFlush(createConnAck(
                MqttConnectReturnCode
                    .CONNECTION_REFUSED_BAD_USER_NAME_OR_PASSWORD));
            ctx.close();
            return;
        }

        // 2. 如果设备已在线，踢掉旧连接
        Channel oldChannel = deviceChannels.get(deviceId);
        if (oldChannel != null && oldChannel.isActive()) {
            log.warn("设备 {} 重复连接，踢掉旧连接", deviceId);
            oldChannel.close();
        }

        // 3. 注册新连接
        deviceChannels.put(deviceId, ctx.channel());
        ctx.channel().attr(AttributeKey.valueOf("deviceId")).set(deviceId);

        // 4. 回复连接成功
        ctx.writeAndFlush(createConnAck(
            MqttConnectReturnCode.CONNECTION_ACCEPTED));

        log.info("设备连接成功: deviceId={}", deviceId);
    }

    private void handlePublish(ChannelHandlerContext ctx,
                               MqttPublishMessage msg) {
        String topic = msg.variableHeader().topicName();
        ByteBuf payload = msg.payload();

        // 读取消息体
        byte[] data = new byte[payload.readableBytes()];
        payload.readBytes(data);

        String deviceId = ctx.channel()
            .attr(AttributeKey.valueOf("deviceId")).get();

        log.info("设备上报: deviceId={}, topic={}, size={}B",
            deviceId, topic, data.length);

        // 1. 转发给订阅了该主题的其他设备
        Set<String> subscribers = topicSubscriptions.get(topic);
        if (subscribers != null) {
            for (String subscriberId : subscribers) {
                // 不转发给发送者自己（除非订阅了自己的 topic）
                if (subscriberId.equals(deviceId)) continue;

                Channel subscriberChannel =
                    deviceChannels.get(subscriberId);
                if (subscriberChannel != null
                        && subscriberChannel.isActive()) {
                    // 每个订阅者收到的消息需要 retain() 增加引用计数
                    // 因为 writeAndFlush 完成后会 release 一次
                    subscriberChannel.writeAndFlush(
                        msg.retainedDuplicate());
                }
            }
        }

        // 2. 转发给后端服务（通过消息队列）
        forwardToBackend(deviceId, topic, data);
    }

    /**
     * 处理设备订阅请求
     *
     * MQTT 支持通配符订阅：
     *   sensor/+/temp    → 匹配 sensor/device1/temp, sensor/device2/temp
     *   sensor/#         → 匹配 sensor/ 下的所有主题
     * Netty 的 MqttDecoder 已经帮我们解析好了通配符
     */
    private void handleSubscribe(ChannelHandlerContext ctx,
                                 MqttSubscribeMessage msg) {
        String deviceId = ctx.channel()
            .attr(AttributeKey.valueOf("deviceId")).get();

        List<Integer> grantedQos = new ArrayList<>();

        for (MqttTopicSubscription subscription :
                msg.payload().topicSubscriptions()) {

            String topic = subscription.topicName();

            // 添加到订阅表
            topicSubscriptions
                .computeIfAbsent(topic,
                    k -> ConcurrentHashMap.newKeySet())
                .add(deviceId);

            // 记录对这个主题申请的 QoS
            grantedQos.add(
                subscription.qualityOfService().value());

            log.info("设备订阅: deviceId={}, topic={}, qos={}",
                deviceId, topic,
                subscription.qualityOfService().value());
        }

        // 回复 SUBACK（带上每个主题授予的 QoS）
        ctx.writeAndFlush(new MqttSubAckMessage(
            new MqttFixedHeader(MqttMessageType.SUBACK,
                false, MqttQoS.valueOf(0), false, 0),
            MqttMessageIdVariableHeader.from(
                msg.variableHeader().messageId()),
            new MqttSubAckPayload(grantedQos)));
    }

    private void handleDisconnect(ChannelHandlerContext ctx) {
        String deviceId = ctx.channel()
            .attr(AttributeKey.valueOf("deviceId")).get();
        if (deviceId != null) {
            deviceChannels.remove(deviceId);
            log.info("设备主动断开: deviceId={}", deviceId);
        }
        ctx.close();
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) {
        // 连接异常断开（非 DISCONNECT 消息）
        String deviceId = ctx.channel()
            .attr(AttributeKey.valueOf("deviceId")).get();
        if (deviceId != null) {
            deviceChannels.remove(deviceId);
            log.warn("设备异常断开: deviceId={}", deviceId);
        }
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx,
                                Throwable cause) {
        log.error("MQTT 连接异常", cause);
        ctx.close();
    }

    private boolean authenticate(String deviceId,
                                 String username,
                                 byte[] password) {
        // 实际生产环境：查询设备鉴权信息
        // 可以用 Redis 缓存（设备证书缓存）
        // 也可以用 JWT 或预共享密钥
        return true;
    }

    private MqttConnAckMessage createConnAck(
            MqttConnectReturnCode code) {
        return new MqttConnAckMessage(
            new MqttFixedHeader(MqttMessageType.CONNACK,
                false, MqttQoS.valueOf(0), false, 0),
            new MqttConnAckVariableHeader(code, false));
    }

    private void forwardToBackend(String deviceId,
                                  String topic,
                                  byte[] data) {
        // 通过 MQ/RPC 转发到后端业务服务
        // 例如写入 Kafka/TimescaleDB/InfluxDB
        // rocketMQTemplate.convertAndSend("iot-data",
        //     new IotMessage(deviceId, topic, data));
    }
}
```

---

## 6.2 三大潜在风险

### 风险一：畸形报文——有心无心的破坏

IoT 设备发送畸形报文的原因有两种：**无意的**（固件 Bug）和**有意的**（设备被攻破后发起的攻击）。无论哪种原因，服务器都必须能防御。

```
MQTT 固定头的"剩余长度"字段攻击：

  MQTT 固定头的剩余长度字段使用变长编码（类似 UTF-8）：
  一个字节的剩余长度：0-127 字节
  两个字节的剩余长度：128-16383 字节
  三个字节的剩余长度：16384-2097151 字节
  四个字节的剩余长度：2097152-268435455 字节（≈ 268MB！）

  攻击者构造的报文：
  固定头(1B) = 0x3A (PUBLISH, QoS=2)
  剩余长度 = 0xFF 0xFF 0xFF 0x7F (268MB)

  Netty 的 MqttDecoder 如果收到这个报文：
  它会认为接下来还有 268MB 的数据要接收
  于是它在内部缓冲区中预留 268MB 空间
  但如果攻击者只发了这 5 个字节就不再发了
  → MqttDecoder 的累积缓冲区会一直等待，占用 ~268MB 的虚拟内存
  → 大量这样的连接 → OOM
```

**解决方案**：`MqttDecoder` 的构造函数的第一个参数就是 `maxPayloadSize`。设置为 10240（10KB）意味着任何声称"剩余长度 > 10KB"的报文都会被直接拒绝。这是第一道防线。

### 风险二：慢连接攻击（Slowloris）

慢连接攻击的原理极其简单，但破坏力巨大：**攻击者建立大量 TCP 连接，但几乎不发送数据（或发送速度极慢）。服务器为每个连接分配了资源，但这些连接什么都没有做，只是占着茅坑不拉屎。**

```
慢连接攻击 vs 正常设备连接：

  正常设备（10000 台电表）：
  连接后 1 秒内：发送 CONNECT 报文
  连接后 2 秒内：发送 PUBLISH 数据
  之后每 30 秒：发送 PINGREQ 心跳

  攻击者模拟的"设备"（10000 个伪造连接）：
  建立 TCP 连接后：什么都不发
  或者每 10 秒发 1 个字节

  结果：服务器的 20000 个连接槽位全部被占满
  真正的设备无法连接
  服务器内存被每个连接的 Channel/缓冲区消耗
```

### 风险三：协议多样性——五种设备五种协议

```
一个典型的 IoT 平台可能需要支持的协议：

  协议             设备类型        接入方式
  ───────────────────────────────────────────
  MQTT             传感器、电表     TCP 长连接
  Modbus TCP       工控设备         TCP 短连接
  CoAP             低功耗设备       UDP
  HTTP REST        摄像头、网关     HTTP
  私有二进制协议    老式设备         TCP（自定义编解码）

  如果每一种协议写一套独立的业务处理逻辑：
  → 业务代码大量重复（每种协议都要做认证、数据解析、告警）
  → 新增协议成本高
  → Bug 修复必须在多个协议实现中同步
```

---

## 6.3 优化与应对方案

### 方案一：多层安全防御

```java
/**
 * IoT 安全防御——三层防御
 *
 * 第一层：连接速率限制（防慢连接攻击）
 * 第二层：IdleStateHandler 踢出空闲连接（防死连接）
 * 第三层：报文完整性校验（防畸形报文）
 *
 * 这三层必须全部启用，缺一不可
 */
public class IotSecurityDefense {

    /**
     * 第一层防御：连接速率限制
     *
     * 限制每个 IP 每秒最多建立 N 个 TCP 连接
     * 防止同一个 IP 发起大量连接耗尽服务器资源
     */
    public static class ConnectionRateLimiter
            extends ChannelInboundHandlerAdapter {

        // Caffeine 缓存：IP → Guava RateLimiter
        // expireAfterWrite 1 分钟：防止缓存无限膨胀
        private final Cache<String, com.google.common.util.concurrent.RateLimiter> ipLimiters =
            Caffeine.newBuilder()
                .maximumSize(100_000)   // 最多缓存 10 万个 IP
                .expireAfterWrite(1, TimeUnit.MINUTES)
                .build();

        @Override
        public void channelActive(ChannelHandlerContext ctx) {
            String ip = ctx.channel().remoteAddress().toString();

            // 从缓存中获取这个 IP 的限流器
            // 如果没有，创建新的（每秒最多 10 个连接）
            com.google.common.util.concurrent.RateLimiter limiter =
                ipLimiters.get(ip, k ->
                    com.google.common.util.concurrent.RateLimiter
                        .create(10.0));

            if (!limiter.tryAcquire()) {
                // 超过了速率限制 → 直接断开连接，不给任何响应
                log.warn("连接速率超限，断开: IP={}", ip);
                ctx.close();
                return;
            }

            ctx.fireChannelActive();
        }
    }

    /**
     * 第二层防御：IdleStateHandler 已在前面的 Pipeline 中配置
     * 60 秒无数据 → 自动关闭
     */

    /**
     * 第三层防御：报文完整性校验
     *
     * 在 MqttDecoder 解码之后，业务 Handler 之前
     * 对所有报文做额外的安全检查
     */
    public static class MessageValidator
            extends SimpleChannelInboundHandler<MqttMessage> {

        @Override
        protected void channelRead0(ChannelHandlerContext ctx,
                                    MqttMessage msg) {
            try {
                // 1. 必须有固定头
                if (msg.fixedHeader() == null) {
                    // 连固定头都没有 → 非法报文
                    throw new IllegalArgumentException(
                        "缺少固定头");
                }

                // 2. 校验剩余长度
                int remainingLength =
                    msg.fixedHeader().remainingLength();
                if (remainingLength < 0
                        || remainingLength > 10240) {
                    // 剩余长度在 0-10240 之外 → 非法
                    throw new IllegalArgumentException(
                        "非法剩余长度: " + remainingLength);
                }

                // 3. 对 CONNECT 消息校验 ClientId
                if (msg instanceof MqttConnectMessage) {
                    String clientId = ((MqttConnectMessage) msg)
                        .payload().clientIdentifier();
                    if (clientId == null
                            || clientId.length() > 128) {
                        // ClientId 太长或为空 → 拒绝
                        throw new IllegalArgumentException(
                            "非法 ClientId");
                    }
                }

                // 校验通过 → 传递给业务 Handler
                ctx.fireChannelRead(msg);

            } catch (Exception e) {
                log.warn("报文校验不通过: {}", e.getMessage());
                ctx.close(); // 安全：关闭连接
            }
        }
    }
}
```

### 方案二：MessageToMessageCodec 协议适配器

当系统需要支持多种协议时，核心设计模式是：**将不同协议的消息统一为内部消息格式，后续业务逻辑只处理统一格式**。

```
协议适配架构：

  设备 1 (MQTT) ──► MqttDecoder ──► MqttToIotCodec ──┐
                                                      │
  设备 2 (Modbus) ─► ModbusDecoder ─► ModbusToIotCodec ─┼──► IotBusinessHandler
                                                      │    （只处理统一格式）
  设备 3 (私有) ───► PrvtDecoder ──► PrvtToIotCodec ──┘
```

```java
/**
 * MQTT → 内部统一消息格式 编解码器
 *
 * 解码（设备 → 平台）：MQTT PUBLISH → IotMessage
 * 编码（平台 → 设备）：IotMessage → MQTT PUBLISH
 *
 * 核心价值：业务逻辑只需要处理 IotMessage
 * 无论设备用什么协议接入
 */
public class MqttToIotMessageCodec
        extends MessageToMessageCodec<MqttMessage, IotMessage> {

    @Override
    protected void decode(ChannelHandlerContext ctx,
                          MqttMessage msg,
                          List<Object> out) {
        if (!(msg instanceof MqttPublishMessage)) {
            // 非 PUBLISH 消息（CONNECT/SUBSCRIBE 等）不过这里
            // 它们需要在之前被处理掉
            out.add(msg);
            return;
        }

        MqttPublishMessage publish = (MqttPublishMessage) msg;

        // 从 Channel 属性中获取设备 ID
        String deviceId = ctx.channel()
            .attr(AttributeKey.valueOf("deviceId")).get();

        // 统一格式
        IotMessage iotMsg = new IotMessage();
        iotMsg.setDeviceId(deviceId);
        iotMsg.setProtocol("MQTT");
        iotMsg.setTopic(publish.variableHeader().topicName());
        iotMsg.setQos(publish.fixedHeader().qos().value());

        byte[] payload = new byte[publish.payload().readableBytes()];
        publish.payload().readBytes(payload);
        iotMsg.setPayload(payload);
        iotMsg.setTimestamp(System.currentTimeMillis());

        out.add(iotMsg);
    }

    @Override
    protected void encode(ChannelHandlerContext ctx,
                          IotMessage msg,
                          List<Object> out) {
        // 将下发的指令编码为 MQTT PUBLISH 报文
        MqttFixedHeader fixedHeader = new MqttFixedHeader(
            MqttMessageType.PUBLISH, false,
            MqttQoS.valueOf(msg.getQos()), false, 0);

        MqttPublishVariableHeader varHeader =
            new MqttPublishVariableHeader(
                msg.getTopic(), 0); // msgId=0（QoS 0 不需要 msgId）

        ByteBuf payload = ctx.alloc().buffer();
        payload.writeBytes(msg.getPayload());

        out.add(new MqttPublishMessage(
            fixedHeader, varHeader, payload));
    }
}

/**
 * 统一内部消息格式
 *
 * 不管设备用什么协议接入，业务系统只关心这个对象
 */
@Data
public class IotMessage {
    private String deviceId;
    private String protocol;   // MQTT / Modbus / 私有协议
    private String topic;
    private int qos;
    private byte[] payload;
    private long timestamp;

    // 快捷方法：将 payload 解析为 JSON
    public <T> T parsePayload(Class<T> clazz) {
        return JSON.parseObject(payload, clazz);
    }
}
```

---

## 本章总结

| 风险 | 根因 | 症状 | 解决方案 |
|------|------|------|---------|
| **畸形报文** | 固件 Bug 或恶意攻击 | 服务端尝试分配超大内存，OOM | MqttDecoder(maxPayloadSize) + 报文完整性校验 |
| **慢连接攻击** | 攻击者只建连不发数据 | 连接数打满，正常设备无法接入 | 连接速率限制 + IdleStateHandler 60 秒踢出 |
| **协议多样性** | 不同设备使用不同协议 | 业务代码重复，新增协议成本高 | MessageToMessageCodec 统一转内部格式 |
| **设备认证** | 设备证书泄露或仿冒 | 非法设备接入上报假数据 | CONNECT 时校验 username/password + Redis 缓存 |

**IoT 场景下 Netty 的核心价值**：
1. **MQTT 协议的内置编解码**——Netty 的 `io.netty.handler.codec.mqtt` 包包含了完整的 MQTT 协议实现，不需要引入额外的 MQTT Broker。这在嵌入式场景中极为重要（减少依赖）
2. **IdleStateHandler 天然适配 IoT 心跳**——大多数 IoT 设备使用 PINGREQ 维持连接，IdleStateHandler 的读空闲检测可以直接用来发现"死设备"
3. **多层 Pipeline**——安全校验、协议解码、业务处理可以分层在 Pipeline 中，每一层只做一件事。这不仅让代码清晰，更重要的是——每一层都是独立的安全防线
4. **MessageToMessageCodec 统一协议**——这是接入多种 IoT 协议的"标准模式"，使得新增协议只需要写一个新的 Codec，业务逻辑完全不需要改动