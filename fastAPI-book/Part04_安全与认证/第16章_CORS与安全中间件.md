# 第16章 CORS与安全中间件

CORS 和安全中间件是 Web API 安全的第一道防线。本章从 CORS 原理到安全头配置，从 CORS 中间件到安全最佳实践，深入剖析 FastAPI 安全中间件的机制与实践。

---

## 16.1 概念与语法

### 16.1.1 CORS 中间件

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 基本配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://example.com", "https://app.example.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# 开发环境（不推荐生产）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # allow_origins=["*"] 时不能设为 True
    allow_methods=["*"],
    allow_headers=["*"],
)

# CORS 参数说明：
# allow_origins    — 允许的来源列表，["*"] 表示所有
# allow_methods    — 允许的 HTTP 方法
# allow_headers    — 允许的请求头
# expose_headers    — 暴露给客户端的响应头
# allow_credentials— 是否允许发送 Cookie
# max_age          — 预检请求缓存时间（秒）
```

### 16.1.2 安全响应头

```python
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI()

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # 防止 MIME 类型嗅探
        response.headers["X-Content-Type-Options"] = "nosniff"
        # XSS 防护
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # 防止点击劫持
        response.headers["X-Frame-Options"] = "DENY"
        # HTTPS 强制
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # 内容安全策略
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        # 引用策略
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # 权限策略
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)
```

### 16.1.3 HTTPS 重定向

```python
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

app = FastAPI()

class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.scheme != "https" and request.headers.get("x-forwarded-proto") != "https":
            https_url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(https_url), status_code=301)
        return await call_next(request)

app.add_middleware(HTTPSRedirectMiddleware)
```

### 16.1.4 请求大小限制

```python
from fastapi import FastAPI, Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI()

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_size: int = 10 * 1024 * 1024):  # 10MB
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size:
            raise HTTPException(status_code=413, detail="Request body too large")
        return await call_next(request)

app.add_middleware(RequestSizeLimitMiddleware, max_size=10 * 1024 * 1024)
```

---

## 16.2 原理与机制

### 16.2.1 CORS 的工作流程

```python
"""
CORS（Cross-Origin Resource Sharing）的工作流程：

1. 简单请求（不触发预检）：
   条件：GET/HEAD/POST + 简单头 + 简单 Content-Type
   
   浏览器发送：
   GET /api/data HTTP/1.1
   Origin: https://app.example.com
   
   服务器响应：
   Access-Control-Allow-Origin: https://app.example.com
   Access-Control-Allow-Credentials: true

2. 预检请求（Preflight）：
   非简单请求先发送 OPTIONS 请求
   
   浏览器发送：
   OPTIONS /api/data HTTP/1.1
   Origin: https://app.example.com
   Access-Control-Request-Method: PUT
   Access-Control-Request-Headers: Authorization
   
   服务器响应：
   Access-Control-Allow-Origin: https://app.example.com
   Access-Control-Allow-Methods: GET, POST, PUT, DELETE
   Access-Control-Allow-Headers: Authorization, Content-Type
   Access-Control-Max-Age: 86400

3. CORS 中间件处理流程：
   a. 检查请求是否有 Origin 头
   b. 检查 Origin 是否在允许列表中
   c. 如果是预检请求（OPTIONS），返回允许的方法和头
   d. 如果是实际请求，添加 CORS 响应头
   e. 如果 Origin 不匹配，不加 CORS 头（浏览器会拒绝）

源码位置：starlette/middleware/cors.py
"""
```

### 16.2.2 CORSMiddleware 源码分析

```python
"""
CORSMiddleware 的核心逻辑（starlette/middleware/cors.py）：

class CORSMiddleware:
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        origin = request.headers.get("origin")
        if not origin:
            # 无 Origin 头，直接通过
            await self.app(scope, receive, send)
            return

        if request.method == "OPTIONS":
            # 预检请求
            response = self.preflight_response(request, origin)
            await response(scope, receive, send)
            return

        # 实际请求
        async def send_with_cors(message):
            if message["type"] == "http.response.start":
                # 添加 CORS 响应头
                headers = dict(message.get("headers", []))
                headers.update(self.get_cors_headers(origin))
                message["headers"] = list(headers.items())
            await send(message)

        await self.app(scope, receive, send_with_cors)

关键点：
1. 预检请求不进入应用层，直接由中间件处理
2. 实际请求的响应头在 send 时注入
3. allow_origins=["*"] 时不能设置 allow_credentials=True
   因为浏览器规范禁止 * 与 credentials 同时使用
"""
```

### 16.2.3 中间件执行顺序

```python
"""
中间件的执行顺序（洋葱模型）：

添加顺序：app.add_middleware(A) → app.add_middleware(B) → app.add_middleware(C)

执行顺序：
请求 → C.dispatch → B.dispatch → A.dispatch → 路由处理 → A.after → B.after → C.after → 响应

即：最后添加的中间件最先执行请求阶段，最后执行响应阶段。

推荐中间件顺序（从外到内）：
1. TrustedHostMiddleware  — 主机白名单
2. HTTPSRedirectMiddleware — HTTPS 重定向
3. SecurityHeadersMiddleware — 安全头
4. CORSMiddleware          — CORS
5. SessionMiddleware       — 会话
6. 自定义中间件             — 业务逻辑

添加顺序（代码从下到上）：
app.add_middleware(CustomMiddleware)      # 最内层
app.add_middleware(SessionMiddleware, ...)
app.add_middleware(CORSMiddleware, ...)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(HTTPSRedirectMiddleware)
app.add_middleware(TrustedHostMiddleware, ...)  # 最外层
"""
```

---

## 16.3 使用场景

### 16.3.1 多域名 CORS 配置

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 动态来源验证
from starlette.middleware.cors import CORSMiddleware as StarletteCORSMiddleware

class DynamicCORSMiddleware(StarletteCORSMiddleware):
    """支持动态来源验证的 CORS 中间件。"""
    def __init__(self, app, allow_origins_regex=None, **kwargs):
        super().__init__(app, allow_origins=(), **kwargs)
        import re
        self.allow_origins_regex = re.compile(allow_origins_regex) if allow_origins_regex else None

    def is_allowed_origin(self, origin):
        if self.allow_origins_regex:
            return bool(self.allow_origins_regex.match(origin))
        return super().is_allowed_origin(origin)

app.add_middleware(
    DynamicCORSMiddleware,
    allow_origins_regex=r"https://.*\.example\.com$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 16.3.2 CSP 策略配置

```python
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI()

class CSPMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # 根据路径设置不同的 CSP 策略
        if request.url.path.startswith("/api/"):
            # API 端点不需要 CSP
            return response

        if request.url.path.startswith("/admin/"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; "
                "connect-src 'self' https://api.example.com; "
                "frame-ancestors 'none'"
            )
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self'; "
                "img-src 'self'; "
                "frame-ancestors 'none'"
            )
        return response

app.add_middleware(CSPMiddleware)
```

---

## 16.4 示例代码

### 16.4.1 完整的安全中间件配置

```python
"""生产级安全中间件配置"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
import time

app = FastAPI(title="Secure API")

# 1. 主机白名单
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["api.example.com", "*.example.com"])

# 2. 安全响应头
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# 3. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Request-ID"],
    max_age=86400,
)

# 4. 请求计时
class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start
        response.headers["X-Response-Time"] = f"{duration:.3f}s"
        return response

app.add_middleware(TimingMiddleware)
```

---

## 16.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| allow_origins=["*"] 加 allow_credentials=True | 浏览器禁止此组合，指定具体域名 |
| 中间件添加顺序错误 | 安全头 → CORS → 业务中间件 |
| 不设置安全响应头 | 使用 SecurityHeadersMiddleware 统一设置 |
| CSP 策略过于宽松 | 从严格策略开始，按需放开 |
| 不处理预检请求缓存 | 设置 max_age 减少预检请求 |
| 开发环境 CORS 配置用于生产 | 使用环境变量区分配置 |
| 忽略 X-Forwarded 系列头 | 代理后正确配置 forwarded_allow_ips |

---

本章从 CORS 预检请求机制到安全响应头配置，从 CORSMiddleware 源码到中间件执行顺序，从 CSP 策略到生产级安全配置，全面剖析了 FastAPI 安全中间件的底层机制与实践。