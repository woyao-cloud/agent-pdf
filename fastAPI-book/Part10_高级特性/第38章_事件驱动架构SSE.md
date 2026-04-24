# 第38章 事件驱动架构（SSE）

Server-Sent Events 是服务端向客户端推送实时数据的轻量级方案。本章从 SSE 协议到 FastAPI 的实现，从连接管理到生产部署，深入剖析事件驱动架构的机制与实践。

---

## 38.1 概念与语法

### 38.1.1 SSE 基础

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

# 基本 SSE 端点
@app.get("/sse/events")
async def sse_events():
    async def event_generator():
        for i in range(10):
            yield f"data: Message {i}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# SSE 事件格式：
# data: 消息内容\n\n          — 简单消息
# data: 第一行\n               — 多行消息
# data: 第二行\n\n
# event: 自定义事件\n           — 命名事件
# data: 消息内容\n\n
# id: 123\n                    — 事件ID（用于断线重连）
# data: 消息内容\n\n
# retry: 5000\n                — 重连间隔（毫秒）
# data: 消息内容\n\n
```

### 38.1.2 SSE 连接管理

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import asyncio
from collections import defaultdict
from typing import AsyncGenerator

app = FastAPI()

class SSEManager:
    """SSE 连接管理器。"""
    def __init__(self):
        self.connections: dict[str, list[asyncio.Queue]] = defaultdict(list)

    async def connect(self, channel: str) -> asyncio.Queue:
        queue = asyncio.Queue()
        self.connections[channel].append(queue)
        return queue

    def disconnect(self, channel: str, queue: asyncio.Queue):
        self.connections[channel].remove(queue)

    async def broadcast(self, channel: str, data: str, event: str = "message"):
        message = f"event: {event}\ndata: {data}\n\n"
        for queue in self.connections[channel]:
            await queue.put(message)

manager = SSEManager()

@app.get("/sse/{channel}")
async def sse_endpoint(channel: str, request: Request):
    queue = await manager.connect(channel)
    async def event_stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30)
                    yield data
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"  # 心跳
        finally:
            manager.disconnect(channel, queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/sse/{channel}/publish")
async def publish(channel: str, message: str):
    await manager.broadcast(channel, message)
    return {"status": "sent"}
```

### 38.1.3 SSE 与 WebSocket 对比

```python
"""
SSE vs WebSocket 对比：

特性        | SSE             | WebSocket
-----------|-----------------|------------------
方向        | 服务端→客户端    | 双向
协议        | HTTP            | WS（升级协议）
重连        | 自动            | 需手动实现
消息格式    | 文本            | 文本/二进制
兼容性      | 所有浏览器       | 所有现代浏览器
代理/防火墙 | 容易穿透         | 可能被阻拦
复杂度      | 简单            | 较复杂

适用场景：
- SSE：日志推送、通知、实时数据、进度更新
- WebSocket：聊天、协同编辑、游戏
"""
```

---

## 38.2 原理与机制

### 38.2.1 SSE 协议

```python
"""
SSE 协议规范（W3C Server-Sent Events）：

1. HTTP 响应头：
   Content-Type: text/event-stream
   Cache-Control: no-cache
   Connection: keep-alive

2. 事件流格式（每行以 \n 结尾，事件以 \n\n 结尾）：
   field:value\n

   支持的字段：
   - data:  消息数据（可多行）
   - event: 事件类型（默认 message）
   - id:    事件ID（用于 Last-Event-ID 重连）
   - retry: 重连间隔（毫秒）

3. 客户端 JavaScript：
   const source = new EventSource("/sse/events");
   source.onmessage = (e) => console.log(e.data);
   source.addEventListener("custom", (e) => console.log(e.data));
   source.onerror = () => console.log("Connection lost, auto-reconnect");

4. 断线重连：
   - 浏览器自动重连
   - 发送 Last-Event-ID 头
   - 服务端可根据 ID 恢复事件

5. ASGI 层面的 SSE：
   StreamingResponse 生成异步迭代器
   → 每次迭代发送一个 http.response.body 消息
   → more_body=True 表示还有更多数据
   → more_body=False 表示结束
"""
```

### 38.2.2 SSE 的实现细节

```python
"""
SSE 实现的关键细节：

1. 心跳机制：
   - 每 15-30 秒发送注释行（: heartbeat\n\n）
   - 防止代理/负载均衡器超时断开
   - 注释行以冒号开头，客户端忽略

2. 背压处理：
   - asyncio.Queue 作为缓冲区
   - 设置队列大小限制
   - 队列满时丢弃旧消息或断开连接

3. 连接检测：
   - request.is_disconnected() 检测断开
   - 超时检测（asyncio.wait_for）
   - 心跳超时作为备选检测

4. 内存管理：
   - 断开连接时移除队列
   - 使用 try/finally 确保清理
   - 定期清理僵尸连接

5. Nginx 配置：
   location /sse/ {
       proxy_pass http://backend;
       proxy_http_version 1.1;
       proxy_set_header Connection "";
       proxy_buffering off;       # 关键：禁用缓冲
       proxy_cache off;
       proxy_read_timeout 86400s; # 长连接超时
   }
"""
```

---

## 38.3 使用场景

### 38.3.1 实时通知系统

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio
from collections import defaultdict

app = FastAPI()

class NotificationManager:
    def __init__(self):
        self.user_queues: dict[int, asyncio.Queue] = {}

    async def connect(self, user_id: int) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=100)
        self.user_queues[user_id] = queue
        return queue

    def disconnect(self, user_id: int):
        self.user_queues.pop(user_id, None)

    async def notify(self, user_id: int, message: str, event: str = "notification"):
        if user_id in self.user_queues:
            event_str = f"event: {event}\ndata: {message}\nid: {hash(message)}\n\n"
            try:
                self.user_queues[user_id].put_nowait(event_str)
            except asyncio.QueueFull:
                pass  # 丢弃旧消息

notification_manager = NotificationManager()

@app.get("/notifications/{user_id}")
async def notification_stream(user_id: int, request: Request):
    queue = await notification_manager.connect(user_id)
    async def stream():
        try:
            while not await request.is_disconnected():
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30)
                    yield data
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            notification_manager.disconnect(user_id)
    return StreamingResponse(stream(), media_type="text/event-stream")

@app.post("/notifications/{user_id}")
async def send_notification(user_id: int, message: str):
    await notification_manager.notify(user_id, message)
    return {"status": "sent"}
```

### 38.3.2 进度推送

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio
import uuid

app = FastAPI()
tasks: dict[str, float] = {}

@app.get("/progress/{task_id}")
async def progress_stream(task_id: str, request: Request):
    async def stream():
        while not await request.is_disconnected():
            progress = tasks.get(task_id, 0)
            yield f"event: progress\ndata: {{\"progress\": {progress}}}\n\n"
            if progress >= 100:
                yield f"event: complete\ndata: {{\"task_id\": \"{task_id}\"}}\n\n"
                break
            await asyncio.sleep(0.5)
    return StreamingResponse(stream(), media_type="text/event-stream")

@app.post("/tasks")
async def create_task():
    task_id = str(uuid.uuid4())
    tasks[task_id] = 0
    asyncio.create_task(run_task(task_id))
    return {"task_id": task_id}

async def run_task(task_id: str):
    for i in range(101):
        tasks[task_id] = i
        await asyncio.sleep(0.1)
```

---

## 38.4 示例代码

### 38.4.1 完整的 SSE 事件系统

```python
"""SSE 事件系统 — 连接管理、广播、心跳"""
import asyncio
import json
import time
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()

class Event:
    def __init__(self, data: dict, event: str = "message", id: str = None):
        self.data = data
        self.event = event
        self.id = id or str(int(time.time() * 1000))

    def encode(self) -> str:
        lines = [f"event: {self.event}", f"data: {json.dumps(self.data)}"]
        if self.id:
            lines.append(f"id: {self.id}")
        return "\n".join(lines) + "\n\n"

class SSEConnection:
    def __init__(self, queue: asyncio.Queue, channel: str, client_id: str):
        self.queue = queue
        self.channel = channel
        self.client_id = client_id
        self.connected_at = time.time()

class SSEBroker:
    def __init__(self):
        self.connections: dict[str, list[SSEConnection]] = {}

    async def connect(self, channel: str, client_id: str) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=1000)
        conn = SSEConnection(queue, channel, client_id)
        if channel not in self.connections:
            self.connections[channel] = []
        self.connections[channel].append(conn)
        return queue

    def disconnect(self, channel: str, client_id: str):
        if channel in self.connections:
            self.connections[channel] = [
                c for c in self.connections[channel] if c.client_id != client_id
            ]

    async def publish(self, channel: str, event: Event):
        for conn in self.connections.get(channel, []):
            try:
                conn.queue.put_nowait(event.encode())
            except asyncio.QueueFull:
                pass

broker = SSEBroker()

@app.get("/sse/{channel}")
async def sse_endpoint(channel: str, request: Request):
    client_id = request.headers.get("X-Client-ID", str(uuid.uuid4()))
    queue = await broker.connect(channel, client_id)

    async def stream():
        try:
            while not await request.is_disconnected():
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=25)
                    yield data
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            broker.disconnect(channel, client_id)

    return StreamingResponse(
        stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/sse/{channel}")
async def publish_event(channel: str, data: dict, event: str = "message"):
    await broker.publish(channel, Event(data=data, event=event))
    return {"status": "published"}
```

---

## 38.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 不发心跳导致连接断开 | 每 25-30 秒发送心跳注释 |
| 不检测断线 | 使用 request.is_disconnected() |
| 连接泄漏 | 使用 try/finally 确保清理 |
| Nginx 缓冲 SSE | 配置 proxy_buffering off |
| SSE 与 WebSocket 混用 | 单向推送用 SSE，双向通信用 WebSocket |
| 不设 X-Accel-Buffering | 代理环境下必须设置 no |
| 队列无限增长 | 设置 Queue maxsize，满时丢弃 |

---

本章从 SSE 协议到连接管理，从心跳机制到背压处理，从通知系统到进度推送，全面剖析了 FastAPI 事件驱动架构（SSE）的机制与实践。