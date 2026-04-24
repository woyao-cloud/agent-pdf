# 第22章 ASGI协议与服务器

ASGI 是 Python 异步 Web 应用的基础协议。本章从 ASGI 接口规范到 uvicorn 的内部架构，深入剖析 FastAPI 运行的底层基础设施。

---

## 22.1 概念与语法

### 22.1.1 ASGI 接口规范

```python
# ASGI 接口签名
async def application(scope: dict, receive: callable, send: callable):
    """
    scope:  连接信息字典
    receive: 接收消息的协程
    send:   发送消息的协程
    """
    if scope["type"] == "http":
        # HTTP 请求处理
        message = await receive()  # 接收请求
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [[b"content-type", b"application/json"]],
        })
        await send({
            "type": "http.response.body",
            "body": b'{"message": "hello"}',
        })
    elif scope["type"] == "websocket":
        # WebSocket 处理
        ...
    elif scope["type"] == "lifespan":
        # 生命周期事件
        ...

# scope 字典的关键字段
# type: "http" | "websocket" | "lifespan"
# method: "GET" | "POST" | ...
# path: "/items/1"
# query_string: b"q=hello"
# headers: [(b"host", b"localhost"), ...]
# server: ("localhost", 8000)
# asgi: {"version": "3.0"}
```

### 22.1.2 WSGI vs ASGI

```python
# WSGI（同步，一次一个请求）
def application(environ, start_response):
    status = '200 OK'
    headers = [('Content-Type', 'text/plain')]
    start_response(status, headers)
    return [b"Hello"]

# ASGI（异步，支持 WebSocket 和长连接）
async def application(scope, receive, send):
    await send({"type": "http.response.start", "status": 200, ...})
    await send({"type": "http.response.body", "body": b"Hello"})

# 关键区别：
# | 特性     | WSGI          | ASGI            |
# |---------|---------------|-----------------|
# | 模型     | 同步          | 异步            |
# | WebSocket| 不支持        | 支持            |
# | 长连接   | 不支持        | 支持            |
# | 服务器推送| 不支持        | 支持(SSE)       |
# | 请求体   | 一次性读取    | 流式读取        |
```

### 22.1.3 ASGI 服务器

```bash
# uvicorn — 最常用的 ASGI 服务器
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# Hypercorn — 支持 HTTP/2 和 Trio
hypercorn main:app --workers 4

# Daphne — Django 团队开发
daphne main:app

# uvicorn 常用参数
uvicorn main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 4 \          # Worker 进程数
    --loop uvloop \       # 事件循环（uvloop 更快）
    --http httptools \     # HTTP 解析器（httptools 更快）
    --log-level info \
    --access-log \         # 访问日志
    --reload \             # 开发热重载
    --ssl-keyfile key.pem \
    --ssl-certfile cert.pem
```

---

## 22.2 原理与机制

### 22.2.1 uvicorn 架构

```python
"""
uvicorn 的内部架构：

1. 主进程（Arbiter）：
   - 管理多个 Worker 进程
   - 处理信号（SIGINT/SIGTERM）
   - 监控 Worker 健康

2. Worker 进程：
   - 每个 Worker 运行独立的事件循环
   - 监听端口，接受连接
   - 调用 ASGI 应用处理请求
   - 使用 asyncio/uvloop 事件循环

3. HTTP 解析：
   - httptools（C 扩展，Node.js 的 http-parser）
   - 或 h11（纯 Python）

4. 请求处理流程：
   1. accept() 接受连接
   2. 解析 HTTP 请求头和体
   3. 构建 scope 字典
   4. 调用 application(scope, receive, send)
   5. 将响应发送给客户端
   6. 关闭连接（HTTP/1.1 keep-alive 除外）

5. 热重载机制：
   - 使用 watchfiles 监控文件变化
   - 检测变化后重启 Worker
   - 使用 importlib.reload() 或完全重启
"""
```

### 22.2.2 生命周期协议

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

# lifespan 协议是 ASGI 3.0 的一部分
# 用于应用启动和关闭时的资源管理

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await connect_to_database()
    await initialize_cache()
    yield  # 应用运行期间
    # shutdown
    await close_database()
    await close_cache()

app = FastAPI(lifespan=lifespan)

# ASGI lifespan 消息类型：
# {"type": "lifespan.startup"}  → 启动
# {"type": "lifespan.shutdown"} → 关闭

# startup 完成后发送：
# {"type": "lifespan.startup.complete"}
# 或失败：
# {"type": "lifespan.startup.failed", "message": "..."}
```

---

## 22.3 使用场景

### 22.3.1 生产配置

```python
# 生产环境 uvicorn 配置
import multiprocessing

# gunicorn + uvicorn worker（推荐生产方案）
# gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# Worker 数量经验公式
workers = multiprocessing.cpu_count() * 2 + 1

# uvicorn 配置文件（uvicorn.config.py）
class Config:
    host = "0.0.0.0"
    port = 8000
    workers = workers
    loop = "uvloop"
    http = "httptools"
    log_level = "info"
    access_log = True
    proxy_headers = True
    forwarded_allow_ips = "*"
```

---

## 22.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 单 Worker 部署 | 生产环境至少 4 个 Worker |
| 不使用 uvloop | 安装 uvloop 和 httptools 提升性能 |
| 热重载在生产环境 | 仅开发使用 --reload |
| 不处理 graceful shutdown | 使用 lifespan 或信号处理 |
| GIL 影响性能 | 多 Worker 进程绕过 GIL |

---

本章从 ASGI 接口规范到 uvicorn 的多进程架构，从 WSGI/ASGI 的对比到生命周期协议，全面剖析了 FastAPI 运行的底层基础设施。