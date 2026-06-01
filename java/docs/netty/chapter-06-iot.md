# 第6章 场景四：物联网（IoT）海量设备接入（MQTT/TCP）

## 6.1 实现原理

物联网场景与传统的互联网应用有本质区别：**设备数量巨大、网络条件恶劣、协议五花八门**。

```
IoT 架构概览：

  海量设备                                       IoT 网关（Netty）                    后端
  ┌──────────┐                                    ┌──────────────┐              ┌──────────┐
  │ 温湿度传感器 │── MQTT ──►                       │  协议解析      │              │ 业务服务   │
  └──────────┘                                    │  MQTT/Modbus  │── 转发 ──►  │ 规则引擎   │
  ┌──────────┐                                    │  /私有协议    │              │ 时序数据库 │
  │ 智能电表   │── MQTT ──►                       │               │              └──────────┘
  └──────────┘                                    │  连接管理      │
  ┌──────────┐                                    │  设备认证      │
  │ 智能门锁   │── TCP 私有协议 ──►               │  限流/防攻击   │
  └──────────┘                                    └──────────────┘
  ┌──────────┐
  │ GPS 追踪器│── MQTT ──►
  └──────────┘
```

### MQTT 协议的特点

MQTT 是物联网场景事实上的标准协议，它的核心设计是**轻量级**和**低带宽**：

```
MQTT vs HTTP 协议头对比：

  HTTP 1.1 请求头（~800 字节）：
  GET /api/data HTTP/1.1
  Host: example.com
  User-Agent: Mozilla/5.0
  Accept: */*
  Content-Type: application/json
  ...

  MQTT 连接报文（~14 字节）：
  固定头(1B) + 协议名(4B "MQTT") + 协议级别(1B) + 
  连接标志(1B) + KeepAlive(2B) + ClientId(N B)
  
  一条 PUBLISH 消息的最小长度：4 字节固定头 + Topic + Payload

  在 NB-IoT 网络下，一个 HTTP 请求可能发不出去
  但一条 MQTT PUBLISH 消息只需要几十字节
```

### Netty 实现 MQTT Broker（核心）

```java
/**
 * 基于 Netty 的 MQTT Broker（嵌入式）
 *
 * Netty 原生支持 MQTT 协议编解码（io.netty.handler.codec.mqtt）
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
                 // MQTT 编解码（Netty 内置）
                 p.addLast("decoder", new MqttDecoder(10240));   // 最大 10KB 报文
                 p.addLast("encoder", new MqttEncoder());
                 // 限流：防止慢连接攻击
                 p.addLast("idle", new IdleStateHandler(60, 0, 0));
                 // 业务 Handler
                 p.addLast("handler", new MqttBrokerHandler());
             }
         })
         .option(ChannelOption.SO_BACKLOG, 1024)
         .childOption(ChannelOption.SO_KEEPALIVE, true)
         .childOption(ChannelOption.TCP_NODELAY, true); // 低延迟

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
 */
public class MqttBrokerHandler extends SimpleChannelInboundHandler<MqttMessage> {

    // 设备 ID → Channel（记录在线设备）
    private final ConcurrentHashMap<String, Channel> deviceChannels = new ConcurrentHashMap<>();

    // 主题订阅关系：topic → 设备 ID 列表
    private final ConcurrentHashMap<String, Set<String>> topicSubscriptions = new ConcurrentHashMap<>();

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, MqttMessage msg) {
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
                // 心跳响应
                ctx.writeAndFlush(new MqttMessage(
                    new MqttFixedHeader(MqttMessageType.PINGRESP, false,
                        MqttQoS.valueOf(0), false, 0)));
                break;
            case DISCONNECT:
                handleDisconnect(ctx);
                break;
            default:
                log.warn("未知 MQTT 消息类型: {}", msg.fixedHeader().messageType());
        }
    }

    private void handleConnect(ChannelHandlerContext ctx, MqttConnectMessage msg) {
        String deviceId = msg.payload().clientIdentifier();

        // 1. 设备认证
        String username = msg.payload().userName();
        byte[] password = msg.payload().passwordInBytes();
        if (!authenticate(deviceId, username, password)) {
            ctx.writeAndFlush(createConnAck(MqttConnectReturnCode.CONNECTION_REFUSED_BAD_USER_NAME_OR_PASSWORD));
            ctx.close();
            return;
        }

        // 2. 如果设备已在线，踢掉旧连接
        Channel oldChannel = deviceChannels.get(deviceId);
        if (oldChannel != null && oldChannel.isActive()) {
            log.warn("设备 {} 重复连接，踢掉旧连接", deviceId);
            oldChannel.close();
        }

        // 3. 绑定设备 ID 到 Channel
        deviceChannels.put(deviceId, ctx.channel());
        ctx.channel().attr(AttributeKey.valueOf("deviceId")).set(deviceId);

        // 4. 响应连接成功
        ctx.writeAndFlush(createConnAck(MqttConnectReturnCode.CONNECTION_ACCEPTED));

        log.info("设备连接成功: deviceId={}, remote={}", deviceId, ctx.channel().remoteAddress());
    }

    private void handlePublish(ChannelHandlerContext ctx, MqttPublishMessage msg) {
        String topic = msg.variableHeader().topicName();
        ByteBuf payload = msg.payload();

        byte[] data = new byte[payload.readableBytes()];
        payload.readBytes(data);

        String deviceId = ctx.channel().attr(AttributeKey.valueOf("deviceId")).get();

        log.info("设备上报: deviceId={}, topic={}, payload={}",
            deviceId, topic, new String(data));

        // 转发给订阅了该 topic 的其他设备或后端服务
        Set<String> subscribers = topicSubscriptions.get(topic);
        if (subscribers != null) {
            for (String subscriberId : subscribers) {
                Channel subscriberChannel = deviceChannels.get(subscriberId);
                if (subscriberChannel != null && subscriberChannel.isActive()) {
                    subscriberChannel.writeAndFlush(msg.retain());
                }
            }
        }

        // 转发给后端业务服务（通过 MQ/RPC）
        forwardToBackend(deviceId, topic, data);
    }

    private void handleSubscribe(ChannelHandlerContext ctx, MqttSubscribeMessage msg) {
        String deviceId = ctx.channel().attr(AttributeKey.valueOf("deviceId")).get();

        for (MqttTopicSubscription subscription : msg.payload().topicSubscriptions()) {
            String topic = subscription.topicName();
            topicSubscriptions.computeIfAbsent(topic, k -> ConcurrentHashMap.newKeySet())
                .add(deviceId);
            log.info("设备订阅: deviceId={}, topic={}", deviceId, topic);
        }

        // 回复 SUBACK
        ctx.writeAndFlush(new MqttSubAckMessage(
            new MqttFixedHeader(MqttMessageType.SUBACK, false, MqttQoS.valueOf(0), false, 0),
            MqttMessageIdVariableHeader.from(msg.variableHeader().messageId()),
            new MqttSubAckPayload(Collections.singletonList(2))));
    }

    private void handleDisconnect(ChannelHandlerContext ctx) {
        String deviceId = ctx.channel().attr(AttributeKey.valueOf("deviceId")).get();
        if (deviceId != null) {
            deviceChannels.remove(deviceId);
            log.info("设备断开: deviceId={}", deviceId);
        }
        ctx.close();
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) {
        handleDisconnect(ctx);
    }

    private boolean authenticate(String deviceId, String username, byte[] password) {
        // 真实场景：从 DB 或缓存中验证设备凭据
        return true; // 简化处理
    }

    private MqttConnAckMessage createConnAck(MqttConnectReturnCode code) {
        return new MqttConnAckMessage(
            new MqttFixedHeader(MqttMessageType.CONNACK, false, MqttQoS.valueOf(0), false, 0),
            new MqttConnAckVariableHeader(code, true)); // Session Present
    }

    private void forwardToBackend(String deviceId, String topic, byte[] data) {
        // 通过消息队列发送到后端业务服务
        // rocketMQTemplate.convertAndSend("iot-data-topic", new IotMessage(deviceId, topic, data));
    }
}
```

---

## 6.2 两大潜在风险

### 风险一：协议解析漏洞

IoT 设备的固件质量参差不齐，有些设备可能发送**畸形报文**。如果服务端不做严格校验，可能导致服务端崩溃：

```
畸形报文攻击场景：

  正常 MQTT PUBLISH 报文：
  固定头(1B) + Topic长度(2B) + Topic(N B) + 报文标识符(2B) + Payload(N B)
  → 约 10-100 字节

  攻击报文（恶意构造）：
  ┌────────────────────────────────────────────┐
  │ 固定头:  0x3A (PUBLISH, QoS=2, 剩余长度=1)  │
  │ 剩余长度: 0xFF 0xFF 0xFF 0x7F              │
  │           ↑ 告诉服务器 Payload 有 268MB！    │
  │                                              │
  │ 服务器行为：                                   │
  │ 1. 尝试分配 268MB 内存                        │
  │ 2. OOM 或 GC 频繁                             │
  │ 3. 服务不可用                                 │
  └────────────────────────────────────────────┘
```

### 风险二：慢连接攻击（Slowloris）

```
慢连接攻击（Slowloris）：
  攻击者                          IoT 网关
    │                               │
    │ TCP 连接建立 ───────────────►  │
    │                               │
    │ 不发数据（或每秒发 1 字节）     │
    │                               │
    │ TCP 连接建立 ───────────────►  │
    │                               │
    │ 不发数据（或每秒发 1 字节）     │
    │                               │
    │ TCP 连接建立 ───────────────►  │
    │                               │
    │ ...                           │
    │                               │
    │ 服务器连接数打满                │
    │ 新连接被拒绝                    │
    │ 正常设备无法接入                │
```

---

## 6.3 优化与应对方案

### 方案一：安全防御——报文长度限制 + 读超时

```java
/**
 * IoT 防攻击 Handler
 *
 * 防御手段：
 *   1. 最大报文长度限制（通过 MqttDecoder 构造函数）
 *   2. 读超时踢出慢连接（IdleStateHandler）
 *   3. 连接速率限制
 */
public class IotSecurityHandler {

    // 1. 在 Pipeline 中加入限制
    public static void addSecurityHandlers(ChannelPipeline p) {
        // 限制 MQTT 报文最大 10KB
        p.addLast("decoder", new MqttDecoder(10240));

        // 60 秒没有收到任何数据 → 踢出
        p.addLast("idle", new IdleStateHandler(60, 0, 0));

        // 超时处理
        p.addLast("timeout", new ChannelDuplexHandler() {
            @Override
            public void userEventTriggered(ChannelHandlerContext ctx, Object evt) {
                if (evt instanceof IdleStateEvent) {
                    log.warn("设备 60 秒无数据，踢出: remote={}",
                        ctx.channel().remoteAddress());
                    ctx.close();
                }
            }
        });
    }

    // 2. 连接速率限制（每 IP 每秒最多 10 个连接）
    public static class ConnectionRateLimiter extends ChannelInboundHandlerAdapter {

        private final Cache<String, RateLimiter> ipLimiters =
            Caffeine.newBuilder()
                .maximumSize(10000)
                .expireAfterWrite(1, TimeUnit.MINUTES)
                .build();

        @Override
        public void channelActive(ChannelHandlerContext ctx) {
            String ip = ctx.channel().remoteAddress().toString();
            RateLimiter limiter = ipLimiters.get(ip, k -> RateLimiter.create(10));

            if (!limiter.tryAcquire()) {
                log.warn("IP 连接速率超限: {}", ip);
                ctx.close(); // 直接断开
                return;
            }

            ctx.fireChannelActive();
        }
    }

    // 3. 校验报文完整性
    public static class MessageValidator extends SimpleChannelInboundHandler<MqttMessage> {

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, MqttMessage msg) {
            try {
                // 校验固定头
                if (msg.fixedHeader() == null) {
                    throw new IllegalArgumentException("缺少固定头");
                }

                // 校验剩余长度（防止畸形报文）
                int remainingLength = msg.fixedHeader().remainingLength();
                if (remainingLength < 0 || remainingLength > 10240) {
                    throw new IllegalArgumentException("非法报文长度: " + remainingLength);
                }

                ctx.fireChannelRead(msg);
            } catch (Exception e) {
                log.error("报文校验失败: {}", e.getMessage());
                ctx.close();
            }
        }
    }
}
```

### 方案二：协议适配器——MessageToMessageCodec

当需要支持多种 IoT 协议时，使用 `MessageToMessageCodec` 将不同协议的报文统一为内部消息格式：

```java
/**
 * MQTT → 内部统一消息格式 编解码器
 *
 * 将不同协议的设备上报，统一为 IotMessage 对象
 * 后续的业务逻辑只需要处理 IotMessage，不需要关心底层协议
 */
public class MqttToIotMessageCodec extends MessageToMessageCodec<MqttMessage, IotMessage> {

    // ===== 解码：MQTT → IotMessage =====
    @Override
    protected void decode(ChannelHandlerContext ctx, MqttMessage msg, List<Object> out) {
        if (msg instanceof MqttPublishMessage) {
            MqttPublishMessage publish = (MqttPublishMessage) msg;
            String topic = publish.variableHeader().topicName();
            ByteBuf payload = publish.payload();

            byte[] data = new byte[payload.readableBytes()];
            payload.readBytes(data);

            // 统一的内部消息
            IotMessage iotMsg = new IotMessage();
            iotMsg.setTopic(topic);
            iotMsg.setPayload(data);
            iotMsg.setProtocol("MQTT");
            iotMsg.setTimestamp(System.currentTimeMillis());

            out.add(iotMsg);
        }
    }

    // ===== 编码：IotMessage → MQTT（下发指令） =====
    @Override
    protected void encode(ChannelHandlerContext ctx, IotMessage msg, List<Object> out) {
        // 将内部消息编码为 MQTT PUBLISH 报文下发到设备
        // 略
    }
}

/**
 * 内部统一消息格式
 */
@Data
public class IotMessage {
    private String topic;
    private byte[] payload;
    private String protocol; // MQTT / Modbus / 私有协议
    private String deviceId;
    private long timestamp;
    private int qos;
}
```

---

## 本章总结

| 风险 | 危害 | 解决方案 |
|------|------|---------|
| **畸形报文** | OOM、CPU 100%、服务崩溃 | 严格限制报文长度 + 格式校验 |
| **慢连接攻击** | 连接数耗尽 | IdleStateHandler 踢出 + 连接速率限制 |
| **协议多样性** | 每种协议一套处理逻辑 | MessageToMessageCodec 统一为内部格式 |

**IoT 场景下 Netty 的核心价值**：
1. MQTT 协议的内置编解码——Netty 原生支持 MQTT，不需要引入额外的 MQTT Broker
2. IdleStateHandler 天然适合物联网——大多数 IoT 设备都靠心跳维持连接
3. 连接数不是问题——单机百万级别，IoT 场景下完全够用