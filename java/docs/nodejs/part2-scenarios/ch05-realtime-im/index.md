# 第 5 章 实时通信：WebSocket 与分布式 IM 系统

---

## 5.1 使用场景

### 即时消息

即时消息（Instant Messaging）是 WebSocket 最典型、最广泛的应用场景。与传统的 HTTP 轮询（Polling）不同，WebSocket 提供全双工通信通道，服务端可以随时主动推送消息到客户端。在一对一聊天、群组聊天、客服系统等场景中，WebSocket 替代了早期基于 Ajax 短轮询或 Comet 长轮询的技术方案，显著降低了网络延迟和带宽消耗。

以本章项目为例，用户 Alice 和 Bob 建立 WebSocket 连接后，Alice 发送的消息会经过服务端校验、持久化到 Redis、再通过 Pub/Sub 机制广播到目标节点，最终推送至 Bob 的客户端。整个过程在几十毫秒内完成，用户体验接近原生 IM 应用。

### 协作编辑

多人实时协作编辑（如 Google Docs、Notion、Figma）是 WebSocket 的高阶应用场景。协作编辑涉及的操作冲突处理通常依赖 **OT（Operational Transformation）** 或 **CRDT（Conflict-Free Replicated Data Types）** 算法，WebSocket 在此负责低延迟的操作同步通道：

- 当用户 A 输入一个字符时，客户端将该操作（position, delete/insert, character）序列化为 JSON，通过 WebSocket 发送至协作服务端。
- 服务端广播给所有协作参与者（用户 B、C、D），各客户端应用 OT 变换后更新本地文档状态。
- 协作编辑对消息顺序和可靠性的要求极高，需要配合 ACK 机制和版本向量保证一致性。

### 实时通知

实时通知是 WebSocket 的"轻度"使用场景，但也是生产环境中部署最广泛的场景之一。典型用例包括：

- **系统告警推送**：监控系统检测到异常指标后，通过 WebSocket 推送告警到运维人员的 Dashboard。
- **订单状态更新**：电商系统中，用户下单后，后端在处理流程中自动推送"已支付→已发货→已签收"的实时状态变更。
- **社交动态流**：点赞、评论、关注等轻量级社交事件通过 WebSocket 实时推送到用户的时间线。

实时通知场景通常结合消息队列（如 Redis Pub/Sub、RabbitMQ、Kafka）实现，WebSocket 服务节点从消息队列中订阅通知事件，再推送给对应长连接。

### 游戏状态同步

多人在线游戏（尤其是 HTML5 网页游戏和移动端轻度游戏）对实时通信的延迟要求最为严苛。游戏状态同步存在两种主流模式：

- **状态同步（State Synchronization）**：服务端作为权威（Authoritative），定时向所有客户端广播完整的世界状态（位置、生命值、资源等）。客户端仅负责渲染，服务端执行所有逻辑判定。这种模式安全性高，但带宽占用较大。
- **帧同步（Lockstep Synchronization）**：服务端仅转发玩家的输入操作（如"左移""攻击"），所有客户端在本地同步执行逻辑帧。延迟极低，带宽开销小，但要求运行环境一致且无浮点偏差。

无论哪种模式，WebSocket 的低延迟特性都是游戏实时通信的基础。在实际部署中，游戏服务器通常使用 UDP 作为底层传输（通过 WebRTC DataChannel 或自定义协议），对于无法穿透 NAT 的场景才回退到 WebSocket。

---

## 5.2 实现原理

### WebSocket 协议（RFC 6455）

WebSocket 协议在建立连接时通过 HTTP Upgrade 机制完成协议切换：

**Upgrade 握手（Client → Server）：**

```
GET /chat HTTP/1.1
Host: server.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

- `Upgrade: websocket` 和 `Connection: Upgrade` 告知服务器将 HTTP 协议升级为 WebSocket。
- `Sec-WebSocket-Key` 是一个 16 字节的随机 Base64 编码值，用于防止缓存代理发起非预期的 WebSocket 连接。
- `Sec-WebSocket-Version` 固定为 13（RFC 6455 标准版本）。

**Upgrade 响应（Server → Client）：**

```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

- 状态码 `101 Switching Protocols` 表示同意协议切换。
- `Sec-WebSocket-Accept` 是将客户端发送的 `Sec-WebSocket-Key` 与固定 GUID `258EAFA5-E914-47DA-95CA-5AB9E4B680A9` 拼接后执行 SHA-1 哈希并 Base64 编码得到。

握手完成后，连接从 HTTP 协议无缝切换为 WebSocket 二进制帧协议，后续通信不再携带任何 HTTP 头部，大幅减少了开销。

### WebSocket 帧格式

WebSocket 数据传输以帧（Frame）为基本单位，帧格式设计紧凑，最小仅需 2 字节头部：

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
|N|V|V|V|       |S|             |                               |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-------+-+-------------+-------------------------------+
|     Extended payload length continued, if payload len == 126  |
+-------------------------------+-------------------------------+
|           Masking-key, if MASK set to 1                       |
+-------------------------------+-------------------------------+
|          Payload Data                                         |
+---------------------------------------------------------------+
```

关键字段说明：

- **FIN（1 bit）**：标记是否为消息的最后一帧。WebSocket 消息可以被拆分为多个帧传输。
- **opcode（4 bits）**：帧类型，`0x1` 表示文本帧，`0x2` 表示二进制帧，`0x8` 表示连接关闭，`0x9` 表示 Ping，`0xA` 表示 Pong。
- **MASK（1 bit）**：客户端发送给服务端的帧必须将 MASK 置为 1，服务端发往客户端的帧必须为 0。这是协议的安全设计，防止缓存污染攻击。
- **Payload Length（7 bits / 7+16 / 7+64）**：载荷长度。小于 126 时直接编码，126 表示后续 2 字节为真实长度，127 表示后续 8 字节为真实长度。
- **Masking-Key（4 bytes）**：当 MASK=1 时，载荷数据使用此 4 字节密钥进行 XOR 掩码。

### Socket.IO 回退机制

Socket.IO 是 Node.js 生态中最流行的 WebSocket 封装库，其核心设计理念之一是**传输层透明回退**。当客户端无法建立 WebSocket 连接时（如企业防火墙屏蔽了 WebSocket、中间代理不支持 Upgrade 请求），Socket.IO 会自动回退到 HTTP Long-Polling：

```
WebSocket 连接尝试
    │
    ├── 成功 ──→ 使用 WebSocket 传输
    │
    └── 失败（超时或被拒绝）
          │
          ├── 回退到 HTTP Long-Polling（XHR Polling）
          │
          └── 若仍失败 → 最终回退到 JSONP Polling（仅浏览器）
```

本章项目直接使用 `ws` 库而非 Socket.IO，原因如下：
- `ws` 库是底层 WebSocket 实现，没有自动回退和重连机制，给了开发者更细致的控制权。
- 在容器化和 Kubernetes 环境中，WebSocket 兼容性已不再是主要问题，回退机制的收益有限。
- `ws` 库的体积更小（约 60KB），性能更高（每秒可处理数万消息），适用于对资源敏感的场景。

---

## 5.3 潜在风险

### 10 万+ 连接瓶颈

当 WebSocket 服务需要维持 10 万以上的并发长连接时，主要面临以下瓶颈：

**文件描述符（FD）耗尽**

每个 WebSocket 连接对应一个 TCP Socket，操作系统内核会分配一个文件描述符。Linux 系统的默认 ulimit 通常为 1024，远不足以支持数千连接。在部署前必须调整内核参数：

```bash
# 全局文件描述符上限
fs.file-max = 1000000

# 单进程文件描述符上限（在 /etc/security/limits.conf 中设置）
* soft nofile 1000000
* hard nofile 1000000
```

**内存开销**

每个 WebSocket 连接在 Node.js 中的内存开销约为 50-80 KB（包含 Socket 对象、发送缓冲区、接收缓冲区、TLS 上下文等）。10 万个连接的内存占用约为：

| 组件                   | 单连接估算 | 10 万连接合计 |
|------------------------|-----------|--------------|
| TCP Socket 内核结构     | ~3 KB     | ~300 MB      |
| Node.js 的 Socket 对象  | ~10 KB    | ~1 GB        |
| 发送/接收缓冲区          | ~16 KB    | ~1.6 GB      |
| 应用层数据（userId 等）  | ~5 KB     | ~500 MB      |
| **总计**                | **~34 KB** | **~3.4 GB**  |

此外还需要考虑 V8 堆内存（应用代码、消息队列等），建议实例预留 4-6 GB 内存。Node.js 进程需通过 `--max-old-space-size=4096` 明确设置堆上限。

### 消息丢失与乱序

WebSocket 底层依赖 TCP，TCP 保证数据包按序到达且不丢失，但业务层的消息丢失和乱序仍然可能发生：

- **服务端崩溃重启**：如果服务端进程异常退出，正在传输中的 WebSocket 帧可能丢失。此时需要基于消息 ID 的幂等性重试机制。
- **Redis Pub/Sub 消息丢失**：Redis Pub/Sub 是"发后即忘"模式，如果订阅者在消息发布时未连接，消息将永久丢失。对于关键消息，需要额外存储（如 Redis List、Streams）配合 ACK 确认。
- **多节点广播乱序**：当消息通过 Redis Pub/Sub 广播到多个节点时，由于网络延迟差异，不同节点的客户端可能以不同顺序收到消息。业务层需携带序列号或时间戳，由客户端进行排序。

### 弱网重连风暴（Reconnection Storm）

当服务器短暂不可用或网络抖动导致大量客户端同时断开时，这些客户端会在短时间内同时发起重连，形成**重连风暴**：

```
正常状态
    │
    ├── 网络抖动 / 服务重启（持续 2 秒）
    │
    ▼
10 万客户端同时断线
    │
    ▼
10 万客户端几乎同时发起重连
    │
    ├── 服务端 FD 瞬间被占满
    ├── CPU 被 TLS 握手和 HTTP Upgrade 占满
    ├── 数据库连接池被打满
    │
    ▼
部分客户端重连失败 → 重试间隔变短 → 更严重的风暴
```

防止重连风暴的核心手段是**指数退避 + 随机抖动**（详见 5.4 节）。

---

## 5.4 优化策略

### 内核参数调优

对于高并发 WebSocket 服务，Linux 内核参数的调优直接决定了服务容量上限：

```bash
# /etc/sysctl.conf

# 系统级文件描述符上限
fs.file-max = 1000000

# 允许快速重用 TIME_WAIT 状态的连接（对 WebSocket 长连接影响较小）
net.ipv4.tcp_tw_reuse = 1

# 扩大 TCP 连接 backlog，防止握手阶段丢包
net.core.somaxconn = 65535

# 扩大临时端口范围（默认 32768-60999 在高并发下不够用）
net.ipv4.ip_local_port_range = 1024 65535

# 启用 TCP keepalive，检测僵尸连接
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 60
net.ipv4.tcp_keepalive_probes = 3

# 扩大内核 Socket 缓冲区
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
```

**注意**：以上调优需根据实际硬件和业务负载谨慎调整，建议在压测环境中逐步验证。

### 消息 ACK 机制

消息确认（ACK）是实现可靠性传输的核心模式。本章项目的 `src/server.ts` 中实现了基础的 ACK 机制：服务端收到消息后立即回复一个包含 `messageId` 和 `status` 的确认帧。ACK 机制支持两种语义：

- **至少一次（At-Least-Once）**：发送方在收到 ACK 前持续重试，确保消息至少被送达一次。代价是可能出现重复消息，需客户端去重。
- **最多一次（At-Most-Once）**：发送方不等待 ACK，不重试，消息最多传输一次。代价是可能有消息丢失。

实际 IM 系统通常对不同类型的消息采用不同语义：

| 消息类型       | 语义         | 说明                                           |
|----------------|-------------|------------------------------------------------|
| 普通文本消息    | At-Least-Once | 允许重复，客户端通过 messageId 去重            |
| 状态通知        | At-Most-Once  | 心跳、输入提示等，丢失无影响                    |
| 转账/支付指令   | Exactly-Once  | 需服务端去重 + 幂等性检查                     |

### 指数退避重连

指数退避（Exponential Backoff）是防止重连风暴的标准策略，其算法如下：

```
reconnect_delay = min(base_delay * 2^attempt, max_delay)
reconnect_delay += random(0, jitter_max)  // 添加随机抖动
```

```typescript
// 客户端重连策略示例
function calculateDelay(attempt: number): number {
  const baseDelay = 1000;      // 基础延迟 1 秒
  const maxDelay = 30000;      // 最大延迟 30 秒
  const jitterMax = 1000;      // 随机抖动 1 秒

  const exponential = baseDelay * Math.pow(2, attempt);
  const clamped = Math.min(exponential, maxDelay);
  const jitter = Math.random() * jitterMax;

  return clamped + jitter;
}

// 第一次重连：~1 秒
// 第二次重连：~3 秒
// 第三次重连：~7 秒
// 第四次重连：~15 秒
// 第五次起：~31 秒（被 maxDelay 限制）
```

指数退避保证绝大多数客户端在 N 次重试后的等待时间分散在一个较宽的区间内，避免了同步风暴。

---

## 5.5 典型问题处理

### 连接数监控

实时监控 WebSocket 连接数是最基本的运维手段。推荐组合使用以下工具：

```bash
# 查看系统级 Socket 统计
ss -s

# 查看特定端口上的连接数
ss -tan | grep ':8080' | wc -l

# 按状态分类的连接数
ss -tan | grep ':8080' | awk '{print $1}' | sort | uniq -c

# 查看每个进程的文件描述符使用量
ls -1 /proc/$(pgrep -f server)/fd | wc -l
```

在实际运维中，建议接入 Prometheus 指标采集，暴露以下关键指标：
- `ws_connections_total`：当前活跃连接数
- `ws_messages_sent_total` / `ws_messages_received_total`：消息吞吐量
- `ws_connection_duration_seconds`：连接存活时间分布
- `ws_reconnect_attempts_total`：客户端重连次数

### 消息可靠性保证

生产级 IM 系统的消息可靠性需要多层保障：

1. **发送队列**：客户端将待发送消息先写入本地队列（IndexedDB 或内存缓冲区），收到服务端 ACK 后才移除。超时未收到 ACK 的消息自动重试。
2. **服务端持久化**：消息到达服务端后先写入 Redis List 持久化，再通过 Pub/Sub 广播。即使目标节点离线，消息也不会丢失。
3. **离线消息同步**：用户重新连接后，服务端查询 Redis 中存储的待推送消息列表，一次性推送给客户端。
4. **消息去重**：客户端根据 `messageId` 维护已处理消息的 Set，对重复到达的消息直接丢弃。

### 广播风暴抑制

在群组聊天或全员通知场景中，广播消息可能引发"广播风暴"：

- **问题**：当某个群组有 5000 在线用户时，一条消息的广播会产生 5000 次推送操作。如果 10 个群组同时发送消息，瞬间推送量达到 5 万次。
- **合并通知**：在短时间内（如 100ms）将同类型通知批量合并为一次推送，减少推送频次。
- **去重检查**：如果同一用户同时加入多个群组，应避免向其重复推送同一条消息的副本。
- **按需推送**：仅当用户在当前会话中确实在线且活跃时才推送，非活跃连接不参与广播。

---

## 5.6 开发者技能

### WebSocket 协议细节（RFC 6455 帧格式）

深入理解 WebSocket 帧格式对于性能调优和故障排查至关重要。需要掌握的核心知识点：

- **分片消息**：当 FIN=0 时表示消息还有后续帧。服务端需要将同一消息的多个帧拼接后再向上层交付。`ws` 库自动处理了帧拼接，但在阅读抓包结果时需要理解这一机制。
- **控制帧**：Ping（opcode=0x9）和 Pong（opcode=0xA）是 WebSocket 的保活机制。服务端收到 Ping 后必须回复 Pong。`ws` 库默认启用了 Ping/Pong 心跳，但可以自定义间隔。
- **关闭帧**：关闭连接时发送 opcode=0x8 的帧，携带状态码和原因描述。本章项目中，缺少 userId 时复用关闭帧的状态码 4001 携带错误信息。

**推荐工具**：使用 Wireshark 抓取 WebSocket 帧，或 Chrome DevTools 的 Network → WS 面板查看帧详情。

### Socket.IO 适配器

Socket.IO 的适配器模式是实现跨进程通信的关键扩展点。默认适配器（Memory Adapter）将房间信息和广播发送限制在单个进程内。生产环境下通常使用以下适配器：

- **Redis Adapter**（`@socket.io/redis-adapter`）：通过 Redis Pub/Sub 实现进程间消息广播。本章项目参考了其设计思路，直接在 `ws` 库上封装了 Redis Pub/Sub 通道。
- **MongoDB Adapter**（`@socket.io/mongo-adapter`）：利用 MongoDB Change Streams 实现广播。适用于已经使用 MongoDB 作为主存储的团队。

适配器的选择取决于基础设施现状。Redis Adapter 是社区最广泛使用的方案，成熟稳定。本章项目的 `src/redis-adapter.ts` 提供了与 Redis Adapter 相似的接口设计，实现了 `publish`、`subscribe`、`persistMessage` 等核心方法。

### ws 库底层使用 vs Socket.IO 高层 API

| 对比维度         | ws 库                            | Socket.IO                           |
|----------------|----------------------------------|-------------------------------------|
| 协议           | 原生 WebSocket（RFC 6455）        | 自定义协议（Engine.IO 层）             |
| 自动重连        | 无                                | 内置                                |
| 回退机制        | 无                                | 自动回退到 Long-Polling              |
| 房间/命名空间    | 无，需自行实现                     | 内置支持 Room 和 Namespace           |
| 广播            | 无，需自行遍历连接列表              | 内置 `io.emit()` / `socket.to()`     |
| 二进制支持       | 原生支持                          | 需额外配置                           |
| 包体积           | ~60 KB                           | ~150 KB（含客户端）                   |
| 性能（消息/秒）   | ~50,000+                         | ~20,000+                            |

**选择建议**：
- 需要低延迟、高吞吐量的场景（如高频交易、游戏帧同步）→ 选择 `ws` 库
- 需要快速开发、自动回退和广播功能的场景（如即时消息、通知系统）→ 选择 Socket.IO
- 已经使用 WebSocket 且团队熟悉原生协议 → 选择 `ws` 库

---

## 5.7 示例代码

本章项目的核心代码位于 `src/server.ts`，以下是关键模块说明：

### WebSocket 服务创建与连接管理

```typescript
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  const userId = parsedUrl.query.userId as string;
  if (!userId) {
    ws.close(4001, 'userId query parameter is required');
    return;
  }
  addConnection(userId, ws);
  // ...
});
```

`WebSocketServer` 监听指定端口，每次客户端连接时解析 URL 中的 `userId` 参数。没有 `userId` 时关闭连接并返回 4001 状态码。`userConnections` 是一个 `Map<string, Set<WebSocket>>`，建立了用户 ID 到其所有 WebSocket 连接的映射，支持一个用户多设备（如手机 + PC 同时在线）。

### 消息处理与 ACK

```typescript
ws.on('message', async (raw) => {
  msg = JSON.parse(raw.toString());
  if (!msg.id) msg.id = uuidv4();

  await redis.persistMessage(msg.from, msg);
  await redis.persistMessage(msg.to, msg);

  sendAck(ws, msg.id, 'received');

  await redis.publish('chat:messages', serialized);
  deliverLocal(msg.to, serialized);
});
```

消息处理流程：解析 JSON → 补充缺失字段（id、timestamp）→ 持久化到双方的历史记录 → 回复 ACK → 通过 Redis Pub/Sub 跨节点广播 → 本地节点直接投递。`persistMessage` 使用 Redis List 存储最近 1000 条消息，支持离线历史查询。

### Redis 跨节点通信

```typescript
await redis.subscribe('chat:messages', (_channel, raw) => {
  const msg: Message = JSON.parse(raw);
  deliverLocal(msg.to, raw);
});
```

每个服务实例在启动时订阅 `chat:messages` 频道。当其他节点通过 Redis 发布消息时，订阅回调将被触发，将消息投递给本节点的目标用户。这是实现水平扩展的核心机制。

### 客户端连接测试

测试代码位于 `tests/websocket.test.ts` 和 `tests/ack.test.ts`，核心测试用例：

```typescript
// 测试无 userId 的连接被拒绝
const ws = new WebSocket(`ws://localhost:${PORT}`);
ws.on('close', (code) => {
  expect(code).toBe(4001);
});

// 测试消息 ACK 确认
ws.send(JSON.stringify({ id: messageId, from: userId, to: targetId, content: 'Test', type: 'text' }));
ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  expect(response.messageId).toBe(messageId);
  expect(response.status).toBe('received');
});
```

测试用例通过 `jest.mock` 模拟 RedisAdapter，避免了测试依赖真实的 Redis 实例。`beforeAll` 启动服务器实例，`afterAll` 关闭清理，确保测试之间不互相影响。

---

## 5.8 Docker Compose

本章项目通过 Docker Compose 提供了一个完整的分布式 IM 可运行环境，配置文件位于 `docker-compose.yml`。

### 服务架构

Compose 文件中定义了四个服务：

```
                        ┌─────────────────────────────────┐
                        │          Nginx (port 80)         │
                        │   WebSocket 负载均衡 + 升级代理   │
                        └────┬──────────────┬──────────────┘
                             │              │
                        ws://│              │ws://
                             ▼              ▼
                   ┌─────────────────┐  ┌─────────────────┐
                   │   im-server     │  │  im-server-2    │
                   │   (port 8080)   │  │  (port 8082)    │
                   └───────┬─────────┘  └────────┬────────┘
                           │                      │
                           │   Redis Pub/Sub       │
                           │   (cross-node msg)    │
                           ▼                      ▼
                   ┌─────────────────────────────────┐
                   │        Redis (port 6379)         │
                   │      7-alpine + AOF 持久化       │
                   └─────────────────────────────────┘
```

### 多节点 IM 服务器

`im-server` 和 `im-server-2` 是两个完全相同的服务实例，通过 Dockerfile 构建。它们的关键特性：

- **水平扩展**：两个节点处理 WebSocket 连接并在 Redis 层交换消息。理论上可以扩展至任意数量。
- **无状态设计**：所有持久化状态（消息历史）存放在 Redis 中，节点本身不存储用户数据，便于滚动升级和弹性伸缩。
- **端口映射**：宿主机 8080 → im-server:8080，宿主机 8082 → im-server-2:8080，方便直接调试单个节点。

### Redis 消息枢纽

Redis 在本项目中承担双重角色：

1. **消息持久化**：使用 Redis List 存储每个用户的消息历史（上限 1000 条），通过 `persistMessage` 方法实现。List 的 LPUSH + LTRIM 组合保证了消息的先进后出存取顺序和列表大小控制。
2. **跨节点消息路由**：使用 Redis Pub/Sub 在多个 IM 服务器实例之间转发消息。当一个节点发布消息到 `chat:messages` 频道时，所有订阅该频道的节点都会收到通知，并投递给本节点的目标用户。

Redis 的 AOF（Append Only File）持久化通过 `--appendonly yes` 启用，在容器重启后不会丢失已经持久化的消息数据。

### Nginx 负载均衡

Nginx 配置在 `nginx.conf` 中，承担 WebSocket 的负载均衡和反向代理职责：

```nginx
upstream im_backend {
  server im-server:8080;
  server im-server-2:8080;
}

location / {
  proxy_pass http://im_backend;

  # WebSocket 升级头
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";

  # 长连接超时配置（24 小时）
  proxy_read_timeout 86400s;
  proxy_send_timeout 86400s;
}
```

关键配置说明：
- `proxy_http_version 1.1`：Nginx 与后端通信使用 HTTP/1.1，这是 WebSocket upgrade 的必要条件。
- `Upgrade` 和 `Connection` 头：Nginx 通过这两个头将 HTTP 请求升级为 WebSocket 长连接。`$http_upgrade` 变量动态获取客户端的 `Upgrade` 请求头值。
- `86400s` 超时：WebSocket 是长连接，代理超时需设置为极大值（通常 24 小时以上），防止 Nginx 过早切断空闲连接。

### 启动与实验

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 连接 Nginx 代理
ws = new WebSocket('ws://localhost?userId=alice')

# 直连单个节点
ws = new WebSocket('ws://localhost:8080?userId=alice')

# 观察两个节点之间的消息路由
ws1 = new WebSocket('ws://localhost?userId=alice')   # 通过 Nginx 可能路由到 im-server
ws2 = new WebSocket('ws://localhost:8082?userId=bob') # 直连 im-server-2
# alice 发消息给 bob → 消息通过 Redis Pub/Sub 跨越节点

# 停止服务
docker-compose down
```

### 实验验证

实验的关键验证点：Alice 连接到 im-server，Bob 连接到 im-server-2，Alice 发送的消息经过 Redis Pub/Sub 路由到 Bob 所在的节点并成功投递。这个实验验证了分布式 IM 系统的核心能力——跨节点消息路由。

---

## 小结

本章围绕 WebSocket 实时通信这一主题，从使用场景、协议原理、潜在风险到优化策略进行了系统性讲解。通过本章配套的项目代码（ws + Redis Pub/Sub + Nginx），读者可以亲手搭建一个具备跨节点消息路由、ACK 确认机制和容器化部署能力的生产级分布式 IM 系统。

关键要点回顾：

- **WebSocket 协议核心**：Upgrade 握手、帧格式（opcode/MASK/payload length）是理解 WebSocket 性能和安全特性的基础。
- **分布式节点通信**：Redis Pub/Sub 是实现 IM 服务水平扩展的最轻量级方案，适合中小规模部署。
- **连接瓶颈管理**：10 万+ 连接需要系统级调优（`fs.file-max`、`tcp_tw_reuse`）和应用层策略（指数退避、心跳检测）。
- **消息可靠性**：ACK 机制 + 消息持久化 + 去重是保障消息可靠传输的三步组合拳。
- **容器化部署**：Docker Compose 多节点 + Nginx 负载均衡提供了可复现的本地开发与测试环境。