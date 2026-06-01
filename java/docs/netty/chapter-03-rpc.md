# 第3章 场景一：高性能 RPC 框架通信底座（如 Dubbo/gRPC）

## 3.1 实现原理

### 基于 TCP 的长连接多路复用

RPC 框架的核心通信模式是：**客户端与服务端建立一条 TCP 长连接，在这条连接上复用多个请求-响应**。

```
RPC 长连接多路复用模型：

  客户端（Netty）                              服务端（Netty）
    │                                             │
    │ ─── 建立 TCP 连接 ──────────────────────►   │
    │                                             │
    │ ─── 请求 1 (RequestId=1) ───────────────►  │
    │                                             │
    │ ─── 请求 2 (RequestId=2) ───────────────►  │  ← 同一连接，并发发送
    │                                             │
    │ ─── 请求 3 (RequestId=3) ───────────────►  │
    │                                             │
    │ ◄── 响应 2 (RequestId=2) ─────────────────  │  ← 响应可能乱序到达
    │ ◄── 响应 1 (RequestId=1) ─────────────────  │
    │ ◄── 响应 3 (RequestId=3) ─────────────────  │
    │                                             │
    │ 请求和响应通过 RequestId 匹配               │
    │ 响应到达的顺序不要求与请求发送一致           │
```

### 自定义私有协议

RPC 框架通常不会直接使用 HTTP 协议（太臃肿），而是设计精简的私有协议：

```
自定义 RPC 协议格式（以 Dubbo 为例）：

  ┌──────────────────────────────────────────────────────────────┐
  │  魔数   │  版本   │  消息类型 │  序列化方式 │  状态  │  RequestId  │
  │ (2B)    │  (1B)   │  (1B)    │  (1B)     │  (1B) │  (8B)       │
  ├──────────────────────────────────────────────────────────────┤
  │                     消息体长度 (4B)                           │
  ├──────────────────────────────────────────────────────────────┤
  │                     消息体 (N B)                              │
  │                     （Protobuf/Kryo 序列化后的数据）           │
  └──────────────────────────────────────────────────────────────┘
```

### Netty 实现 RPC 协议解码

```java
/**
 * RPC 协议解码器
 *
 * 协议头：
 *   魔数(2B) + 版本(1B) + 类型(1B) + 序列化(1B) + 状态(1B) + RequestId(8B) + 体长(4B)
 *   协议头固定 = 18 字节
 */
public class RpcProtocolDecoder extends ByteToMessageDecoder {

    private static final short MAGIC_NUMBER = (short) 0xABCD;
    private static final int HEADER_LENGTH = 18;

    @Override
    protected void decode(ChannelHandlerContext ctx, ByteBuf in, List<Object> out) {
        // 检查是否够协议头长度
        if (in.readableBytes() < HEADER_LENGTH) {
            return;
        }

        // 标记当前读位置（如果不够完整包，需要回滚）
        in.markReaderIndex();

        // 读取魔数
        short magic = in.readShort();
        if (magic != MAGIC_NUMBER) {
            // 非法数据，关闭连接
            ctx.close();
            return;
        }

        byte version = in.readByte();
        byte messageType = in.readByte();
        byte serializeType = in.readByte();
        byte status = in.readByte();
        long requestId = in.readLong();

        // 读取消息体长度
        int bodyLength = in.readInt();

        // 检查是否够整个包（协议头 + 消息体）
        if (in.readableBytes() < bodyLength) {
            // 半包！回滚读指针，等待更多数据
            in.resetReaderIndex();
            return;
        }

        // 读取消息体
        byte[] body = new byte[bodyLength];
        in.readBytes(body);

        // 反序列化
        RpcRequest request = deserialize(body, messageType, serializeType);
        request.setRequestId(requestId);

        out.add(request);
    }

    private RpcRequest deserialize(byte[] body, byte messageType, byte serializeType) {
        // 根据序列化方式反序列化
        // 0 = JSON, 1 = Protobuf, 2 = Kryo, 3 = Hessian
        return SerializerFactory.getSerializer(serializeType).deserialize(body);
    }
}
```

---

## 3.2 三大潜在风险

### 风险一：数据不一致 / 响应乱序

多路复用的核心问题——多个请求并发发送到同一连接，响应可能乱序返回。客户端需要将响应与对应的请求匹配。

```
响应乱序的问题：

  客户端发送顺序：Req-1, Req-2, Req-3
  服务端处理：Req-2 是简单查询（1ms），Req-1 是复杂计算（100ms）
  响应到达顺序：Resp-2, Resp-3, Resp-1

  如果没有 RequestId 匹配机制：
  客户端以为 Resp-2 是 Req-1 的响应 → 完全乱了！
```

### 风险二：序列化性能瓶颈

```
序列化是 RPC 中最容易忽视的性能陷阱：

  每种序列化方式的性能对比（10 万次序列化 + 反序列化）：
  ┌────────────┬────────────────┬──────────────┬──────────────┐
  │ 序列化方式   │ 序列化耗时 (ms) │ 反序列化耗时   │ 数据大小     │
  ├────────────┼────────────────┼──────────────┼──────────────┤
  │ JSON       │ 1200           │ 1500         │ 180B         │
  │ Protobuf   │ 400            │ 300          │ 80B          │
  │ Kryo       │ 350            │ 400          │ 75B          │
  │ Hessian    │ 500            │ 600          │ 90B          │
  └────────────┴────────────────┴──────────────┴──────────────┘

  JSON 比 Protobuf 慢 3-4 倍，数据大 2 倍！
  在 100 万 QPS 的 RPC 调用中，JSON 序列化本身就能吃掉一个 CPU 核
```

### 风险三：连接假死

```
连接假死的典型场景：
  客户端                         服务端
    │                             │
    │ ← TCP 连接建立成功 →         │
    │                             │
    │ 发送请求 ──────────────►    │
    │                             │
    │    [防火墙静默丢弃连接]      │
    │    [网线松动但操作系统没感知]  │
    │    [对端进程 crash]          │
    │                             │
    │ 等待响应...（永远等不到）      │
    │                             │
    │ 你以为连接还在，实际已经死了    │
    │ 这个连接上以后的所有请求都超时   │
```

---

## 3.3 优化与应对方案

### 方案一：RequestId 异步回调机制

```java
/**
 * RPC 请求-响应匹配器
 *
 * 核心设计：
 *   - ConcurrentHashMap 缓存所有等待响应的 Future
 *   - 每个请求分配唯一 RequestId
 *   - 响应到达时根据 RequestId 找到对应的 Future 并唤醒
 */
@Component
public class RpcResponseFutureManager {

    private final ConcurrentHashMap<Long, CompletableFuture<RpcResponse>> futureMap =
        new ConcurrentHashMap<>();

    private final AtomicLong requestIdGen = new AtomicLong(0);

    /**
     * 发送请求并异步等待响应
     */
    public CompletableFuture<RpcResponse> sendRequest(Channel channel, RpcRequest request) {
        long requestId = requestIdGen.incrementAndGet();
        request.setRequestId(requestId);

        // 创建 Future，存入 Map
        CompletableFuture<RpcResponse> future = new CompletableFuture<>();
        futureMap.put(requestId, future);

        // 发送请求
        channel.writeAndFlush(request).addListener((ChannelFutureListener) f -> {
            if (!f.isSuccess()) {
                // 发送失败，移除 Future 并设置异常
                futureMap.remove(requestId);
                future.completeExceptionally(f.cause());
            }
        });

        return future;
    }

    /**
     * 收到响应时调用——根据 RequestId 匹配并唤醒对应的 Future
     */
    public void handleResponse(RpcResponse response) {
        long requestId = response.getRequestId();
        CompletableFuture<RpcResponse> future = futureMap.remove(requestId);
        if (future != null) {
            future.complete(response);
        } else {
            log.warn("收到未知 RequestId 的响应: {}", requestId);
        }
    }

    /**
     * 处理超时——定期清理超时的 Future
     */
    @Scheduled(fixedRate = 1000)
    public void timeoutCheck() {
        long now = System.currentTimeMillis();
        futureMap.forEach((requestId, future) -> {
            if (future.isDone()) {
                return; // 已完成，跳过
            }
            // 如果 future 已经超时（假设 30 秒）
            if (future.getNow(null) == null) {
                // 检查是否超时（通过 future 的创建时间判断）
                future.completeExceptionally(
                    new TimeoutException("RPC 请求超时: " + requestId));
                futureMap.remove(requestId);
            }
        });
    }
}
```

```java
/**
 * RPC 响应 Handler
 * 在 Netty 的 Pipeline 中处理响应
 */
public class RpcResponseHandler extends SimpleChannelInboundHandler<RpcResponse> {

    @Autowired
    private RpcResponseFutureManager futureManager;

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, RpcResponse response) {
        // 将响应交给 FutureManager 匹配对应的请求
        futureManager.handleResponse(response);
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        log.error("RPC 客户端异常", cause);
        ctx.close();
    }
}
```

```java
// 客户端使用示例
@Service
public class RpcClientService {

    @Autowired
    private RpcResponseFutureManager futureManager;

    private Channel channel; // Netty 连接（连接池管理）

    public User getUserById(Long id) {
        RpcRequest request = new RpcRequest();
        request.setMethod("getUserById");
        request.setParams(new Object[]{id});
        request.setParamTypes(new Class[]{Long.class});

        try {
            // 异步发送 + 同步等待结果
            CompletableFuture<RpcResponse> future =
                futureManager.sendRequest(channel, request);
            RpcResponse response = future.get(5, TimeUnit.SECONDS);
            return (User) response.getResult();
        } catch (TimeoutException e) {
            log.error("RPC 调用超时: method=getUserById, id={}", id);
            throw new RpcTimeoutException("调用超时");
        } catch (Exception e) {
            log.error("RPC 调用失败", e);
            throw new RpcException("调用失败", e);
        }
    }
}
```

### 方案二：Protobuf / Kryo 替代 JSON

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.esotericsoftware</groupId>
    <artifactId>kryo</artifactId>
    <version>5.6.0</version>
</dependency>
```

```java
/**
 * Kryo 序列化实现（比 JSON 快 3-4 倍）
 * 使用 ThreadLocal 避免 Kryo 实例的线程安全问题
 */
public class KryoSerializer implements RpcSerializer {

    private static final ThreadLocal<Kryo> kryoThreadLocal = ThreadLocal.withInitial(() -> {
        Kryo kryo = new Kryo();
        kryo.setRegistrationRequired(false); // 不强制注册（开发方便）
        kryo.setReferences(true);
        kryo.setInstantiatorStrategy(new StdInstantiatorStrategy());
        // 注册常用类（性能优化）
        kryo.register(RpcRequest.class);
        kryo.register(RpcResponse.class);
        kryo.register(HashMap.class);
        return kryo;
    });

    @Override
    public byte[] serialize(Object obj) {
        Kryo kryo = kryoThreadLocal.get();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        Output output = new Output(bos);
        kryo.writeClassAndObject(output, obj);
        output.close();
        return bos.toByteArray();
    }

    @Override
    public Object deserialize(byte[] data) {
        Kryo kryo = kryoThreadLocal.get();
        ByteArrayInputStream bis = new ByteArrayInputStream(data);
        Input input = new Input(bis);
        return kryo.readClassAndObject(input);
    }

    @Override
    public byte getSerializerType() {
        return 2; // 2 = Kryo
    }
}
```

### 方案三：心跳 + IdleStateHandler

```java
/**
 * 客户端——心跳检测 + 重连
 * 每 15 秒发送一次心跳，60 秒没有收到服务端响应则判定连接假死
 */
public class RpcClientInitializer extends ChannelInitializer<SocketChannel> {

    @Override
    protected void initChannel(SocketChannel ch) {
        ChannelPipeline p = ch.pipeline();

        // 读超时：60 秒没读到数据 → 触发 userEventTriggered
        p.addLast(new IdleStateHandler(60, 15, 0, TimeUnit.SECONDS));

        // 编解码
        p.addLast(new RpcProtocolDecoder());
        p.addLast(new RpcProtocolEncoder());

        // 业务 Handler
        p.addLast(new RpcResponseHandler());
        p.addLast(new HeartbeatHandler()); // 心跳处理
    }
}

/**
 * 心跳处理器
 * 同时处理：发送心跳 + 检测假死 + 重连
 */
public class HeartbeatHandler extends ChannelDuplexHandler {

    private static final ByteBuf HEARTBEAT_SEQ =
        Unpooled.unreleasableBuffer(Unpooled.buffer()
            .writeByte(0xAB).writeByte(0xCD)
            .writeByte(0x00) // 心跳类型
            .writeLong(0));  // RequestId = 0

    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object evt) {
        if (evt instanceof IdleStateEvent) {
            IdleStateEvent e = (IdleStateEvent) evt;

            if (e.state() == IdleState.WRITER_IDLE) {
                // 15 秒没有写入数据 → 发送心跳
                ctx.writeAndFlush(HEARTBEAT_SEQ.retainedDuplicate());
                log.debug("发送心跳");
            }

            if (e.state() == IdleState.READER_IDLE) {
                // 60 秒没有收到数据 → 连接假死，关闭重连
                log.warn("60 秒未收到数据，连接假死，关闭重连");
                ctx.close();
                // 触发重连逻辑
                reconnect();
            }
        }
    }

    private void reconnect() {
        // 指数退避重连
        // bootstrap.connect(host, port).addListener(future -> {
        //     if (!future.isSuccess()) {
        //         // 2 秒后重试
        //         ctx.executor().schedule(this::reconnect, 2, TimeUnit.SECONDS);
        //     }
        // });
    }
}

/**
 * 服务端——IdleStateHandler 配置
 */
public class RpcServerInitializer extends ChannelInitializer<SocketChannel> {

    @Override
    protected void initChannel(SocketChannel ch) {
        ChannelPipeline p = ch.pipeline();

        // 服务端：90 秒没收到客户端数据 → 认为客户端挂了，关闭连接
        p.addLast(new IdleStateHandler(90, 0, 0, TimeUnit.SECONDS));
        p.addLast(new RpcProtocolDecoder());
        p.addLast(new RpcProtocolEncoder());
        p.addLast(new RpcServerHandler());

        // 心跳响应 Handler
        p.addLast(new SimpleChannelInboundHandler<ByteBuf>() {
            @Override
            protected void channelRead0(ChannelHandlerContext ctx, ByteBuf msg) {
                if (isHeartbeat(msg)) {
                    // 心跳包，不需要响应，直接丢弃
                    return;
                }
                ctx.fireChannelRead(msg); // 传给下一个 Handler
            }
        });
    }
}
```

---

## 本章总结

| 风险 | 原因 | 解决方案 |
|------|------|---------|
| **响应乱序** | 多路复用导致响应顺序不确定 | RequestId + CompletableFuture 异步匹配 |
| **序列化瓶颈** | JSON 序列化慢、数据量大 | Protobuf/Kryo 替代 JSON |
| **连接假死** | 网络闪断 TCP 层无法感知 | IdleStateHandler + 心跳 |
| **连接数过多** | 每个接口一个连接 | 连接池复用 Channel |

**Netty 在 RPC 中的核心价值**：
1. 请求-响应异步回调模型是 RPC 性能的基础
2. 心跳 + IdleStateHandler 保证了连接的健康管理
3. 自定义协议解码器（LengthFieldBasedFrameDecoder）解决了 TCP 粘包
4. Pipeline 的链式处理让编解码、序列化、业务逻辑清晰分离