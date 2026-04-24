# 第25章 WebSocket实时通信

WebSocket 提供全双工实时通信能力。本章从 WebSocket 协议原理到 FastAPI 的 WebSocket 实现，深入剖析实时通信的机制与实践。

---

## 25.1 概念与语法

### 25.1.1 FastAPI WebSocket

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"Client {client_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"Client {client_id} left")

# 接收 JSON 数据
@app.websocket("/ws/chat/{room_id}")
async def websocket_chat(websocket: WebSocket, room_id: str):
    await websocket.accept()
    while True:
        data = await websocket.receive_json()
        await websocket.send_json({"echo": data})
```

### 25.1.2 WebSocket 生命周期

```python
# WebSocket ASGI 消息类型
# 接收消息（receive）：
# {"type": "websocket.connect"}     — 连接请求
# {"type": "websocket.receive"}     — 接收数据
# {"type": "websocket.disconnect"}  — 断开连接

# 发送消息（send）：
# {"type": "websocket.accept"}      — 接受连接
# {"type": "websocket.send"}        — 发送数据
# {"type": "websocket.close"}       — 关闭连接

@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    # websocket.application_state → CONNECTING → CONNECTED → DISCONNECTED
    try:
        while True:
            text = await websocket.receive_text()
            await websocket.send_text(f"Echo: {text}")
    except WebSocketDisconnect:
        pass
```

---

## 25.2 原理与机制

### 25.2.1 WebSocket 协议

```python
"""
WebSocket 协议（RFC 6455）：

1. 握手：HTTP Upgrade 请求
   GET /ws HTTP/1.1
   Upgrade: websocket
   Connection: Upgrade
   Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
   Sec-WebSocket-Version: 13

2. 服务端响应：
   HTTP/1.1 101 Switching Protocols
   Upgrade: websocket
   Connection: Upgrade
   Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

3. Sec-WebSocket-Accept 计算：
   SHA1(Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")

4. 握手完成后，切换为 WebSocket 帧协议：
   - 文本帧（opcode 0x1）
   - 二进制帧（opcode 0x2）
   - 关闭帧（opcode 0x8）
   - Ping/Pong 帧（opcode 0x9/0xA）
"""
```

### 25.2.2 与 Redis Pub/Sub 集成

```python
"""多进程 WebSocket 广播（Redis Pub/Sub）"""
import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket

app = FastAPI()
redis = aioredis.from_url("redis://localhost:6379")

@app.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    await websocket.accept()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"channel:{channel}")

    async def publisher():
        while True:
            data = await websocket.receive_text()
            await redis.publish(f"channel:{channel}", data)

    async def subscriber():
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"].decode())

    import asyncio
    try:
        await asyncio.gather(publisher(), subscriber())
    except Exception:
        await pubsub.unsubscribe(f"channel:{channel}")
```

---

## 25.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 不处理断线重连 | 客户端实现指数退避重连 |
| 内存中存储所有连接 | 大规模使用 Redis Pub/Sub |
| WebSocket 不走负载均衡 | 配置 Nginx WebSocket 代理 |
| 不设心跳超时 | 定期发送 Ping 帧 |
| 连接泄漏 | 使用 try/finally 确保清理 |

---

本章从 WebSocket 协议的握手过程到 FastAPI 的 WebSocket API，从连接管理到 Redis Pub/Sub 的多进程广播，全面剖析了实时通信的机制与实践。