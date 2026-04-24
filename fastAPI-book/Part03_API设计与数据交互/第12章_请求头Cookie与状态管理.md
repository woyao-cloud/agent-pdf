# 第12章 请求头、Cookie与状态管理

HTTP 请求头和 Cookie 是 Web 应用状态管理的基础。本章从 Header 参数到 Cookie 操作，从会话管理到 CORS 头，深入剖析 FastAPI 中请求头与状态管理的机制与实践。

---

## 12.1 概念与语法

### 12.1.1 Header 参数

```python
from fastapi import FastAPI, Header

app = FastAPI()

# 获取请求头
@app.get("/headers")
async def get_headers(
    user_agent: str | None = Header(None),
    accept_language: str | None = Header(None),
    x_request_id: str | None = Header(None),
):
    return {
        "user_agent": user_agent,
        "accept_language": accept_language,
        "x_request_id": x_request_id,
    }

# Header 参数的特殊处理：
# 1. 下划线转连字符：x_api_key → X-API-Key
# 2. 自动去除前导空格
# 3. 重复头合并为逗号分隔字符串

# 获取所有请求头
from fastapi import Request

@app.get("/all-headers")
async def all_headers(request: Request):
    return dict(request.headers)

# 常用请求头：
# User-Agent       — 客户端信息
# Accept           — 接受的内容类型
# Accept-Language   — 接受的语言
# Authorization     — 认证信息
# Content-Type      — 请求体类型
# X-Request-ID     — 请求追踪ID
# X-Forwarded-For  — 客户端真实IP（代理后）
# X-API-Key        — API密钥
```

### 12.1.2 Cookie 操作

```python
from fastapi import FastAPI, Cookie, Response

app = FastAPI()

# 读取 Cookie
@app.get("/profile")
async def read_profile(
    session_id: str | None = Cookie(None),
    theme: str | None = Cookie(None, pattern=r"^(light|dark)$"),
):
    return {"session_id": session_id, "theme": theme}

# 设置 Cookie
from fastapi.responses import JSONResponse

@app.post("/login")
async def login(response: Response):
    token = create_session_token()
    response.set_cookie(
        key="session_id",
        value=token,
        httponly=True,      # JavaScript 无法访问
        secure=True,         # 仅 HTTPS
        samesite="lax",     # CSRF 防护
        max_age=3600,       # 1小时过期
        path="/",            # 作用路径
    )
    return {"message": "Logged in"}

# 删除 Cookie
@app.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="session_id", path="/")
    return {"message": "Logged out"}

# Cookie 参数选项：
# key        — Cookie 名称
# value      — Cookie 值
# max_age    — 生存时间（秒）
# expires    — 过期时间
# path       — 作用路径
# domain     — 作用域名
# secure     — 仅 HTTPS
# httponly   — JS 不可访问
# samesite   — "lax" | "strict" | "none"
```

### 12.1.3 会话管理

```python
from fastapi import FastAPI, Request, Response, HTTPException
from starlette.middleware.sessions import SessionMiddleware
import secrets

app = FastAPI()

# 方式1：SessionMiddleware（基于 Cookie）
app.add_middleware(SessionMiddleware, secret_key="your-secret-key")

@app.post("/login")
async def login(request: Request):
    request.session["user_id"] = 1
    request.session["role"] = "admin"
    return {"message": "Logged in"}

@app.get("/me")
async def get_me(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    return {"user_id": user_id}

# 方式2：Redis 会话（推荐生产环境）
import redis.asyncio as aioredis

redis = aioredis.from_url("redis://localhost:6379")

async def create_session(user_id: int, response: Response) -> str:
    session_id = secrets.token_urlsafe(32)
    await redis.setex(f"session:{session_id}", 3600, str(user_id))
    response.set_cookie(
        key="session_id", value=session_id,
        httponly=True, secure=True, samesite="lax",
    )
    return session_id

async def get_session(session_id: str) -> int | None:
    user_id = await redis.get(f"session:{session_id}")
    return int(user_id) if user_id else None
```

### 12.1.4 响应头设置

```python
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse

app = FastAPI()

# 方式1：在路由函数中设置
@app.get("/custom-headers")
async def custom_headers(response: Response):
    response.headers["X-Custom-Header"] = "custom-value"
    response.headers["Cache-Control"] = "no-cache"
    return {"message": "Response with custom headers"}

# 方式2：返回 JSONResponse
@app.get("/json-headers")
async def json_headers():
    return JSONResponse(
        content={"message": "Hello"},
        headers={
            "X-Request-ID": "abc123",
            "X-RateLimit-Remaining": "99",
        },
    )

# 方式3：自定义响应类
class NoCacheResponse(JSONResponse):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.headers["Cache-Control"] = "no-store"
        self.headers["Pragma"] = "no-cache"

@app.get("/no-cache", response_class=NoCacheResponse)
async def no_cache():
    return {"data": "sensitive"}
```

---

## 12.2 原理与机制

### 12.2.1 HTTP Header 传输机制

```python
"""
HTTP 请求头的传输机制：

1. HTTP/1.1 请求格式：
   GET /path HTTP/1.1\r\n
   Host: example.com\r\n
   User-Agent: Mozilla/5.0\r\n
   Cookie: session_id=abc123\r\n
   \r\n

2. Header 编码规则：
   - 名称不区分大小写
   - 值中的换行必须折叠（RFC 2616）
   - 相同名称的头可以重复（Set-Cookie）
   - 值前后的空格会被去除

3. FastAPI Header 参数解析：
   - Header() 使用下划线转连字符
   - x_api_key 在 HTTP 中是 X-Api-Key
   - 重复的 Header 值合并为逗号分隔字符串
   - 使用 list[str] 类型获取重复头的所有值

4. Cookie 的 HTTP 传输：
   请求：Cookie: name1=value1; name2=value2
   响应：Set-Cookie: session_id=abc; HttpOnly; Secure; Path=/

5. SameSite 属性（CSRF 防护）：
   - Strict: 完全禁止第三方 Cookie
   - Lax: 允许顶级导航（GET）携带
   - None: 允许跨站（必须配合 Secure）
"""
```

### 12.2.2 Session 机制

```python
"""
Session 机制的两种实现：

1. Cookie-based Session（SessionMiddleware）：
   - 使用 itsdangerous 库签名
   - Session 数据存储在 Cookie 中
   - 大小受 Cookie 限制（~4KB）
   - 源码：starlette/middleware/sessions.py

   签名流程：
   data → JSON serialize → zlib compress → base64 encode → itsdangerous sign
   → Set-Cookie: session=<signed_data>

2. Server-side Session（Redis/数据库）：
   - Session ID 存储在 Cookie 中
   - Session 数据存储在服务端（Redis）
   - 无大小限制
   - 支持过期和主动失效

   流程：
   Client → Cookie(session_id) → Server 查询 Redis → Session 数据

3. SessionMiddleware 源码关键逻辑：
   class SessionMiddleware:
       def __init__(self, app, secret_key, session_cookie="session", ...):
           self.signer = itsdangerous.TimestampSigner(secret_key)

       async def __call__(self, scope, receive, send):
           if scope["type"] in ("http", "websocket"):
               # 从 Cookie 读取 session 数据
               # 验证签名 → 解压 → 反序列化
               # 注入 scope["session"]
               # 请求完成后序列化 → 压缩 → 签名 → 设置 Cookie
"""
```

---

## 12.3 使用场景

### 12.3.1 API 版本协商

```python
from fastapi import FastAPI, Header, HTTPException

app = FastAPI()

@app.get("/api/data")
async def get_data(
    accept_version: str = Header(..., alias="Accept-Version"),
):
    versions = {"1.0": data_v1, "2.0": data_v2}
    handler = versions.get(accept_version)
    if not handler:
        raise HTTPException(400, detail=f"Unsupported version: {accept_version}")
    return handler()
```

### 12.3.2 多语言支持

```python
from fastapi import FastAPI, Header, Request

app = FastAPI()

SUPPORTED_LANGUAGES = ["en", "zh", "ja"]

@app.get("/content")
async def get_content(
    accept_language: str = Header("en"),
):
    lang = accept_language.split(",")[0].split("-")[0].lower()
    if lang not in SUPPORTED_LANGUAGES:
        lang = "en"
    return get_localized_content(lang)
```

### 12.3.3 请求追踪

```python
from fastapi import FastAPI, Header, Request
import uuid

app = FastAPI()

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

@app.get("/trace")
async def trace(request: Request):
    return {"request_id": request.state.request_id}
```

---

## 12.4 示例代码

### 12.4.1 完整的会话管理系统

```python
"""基于 Redis 的会话管理系统"""
import secrets
import time
from fastapi import FastAPI, Cookie, HTTPException, Response, Depends
from pydantic import BaseModel
import redis.asyncio as aioredis

app = FastAPI()
redis = aioredis.from_url("redis://localhost:6379", decode_responses=True)

SESSION_EXPIRE = 3600  # 1小时

class LoginRequest(BaseModel):
    username: str
    password: str

class SessionData(BaseModel):
    user_id: int
    username: str
    role: str
    created_at: float

async def get_session(session_id: str | None = Cookie(None)) -> SessionData:
    if not session_id:
        raise HTTPException(401, "Not authenticated")
    data = await redis.get(f"session:{session_id}")
    if not data:
        raise HTTPException(401, "Session expired")
    return SessionData.model_validate_json(data)

@app.post("/login")
async def login(req: LoginRequest, response: Response):
    user = authenticate(req.username, req.password)
    if not user:
        raise HTTPException(401, "Invalid credentials")

    session_id = secrets.token_urlsafe(32)
    session = SessionData(
        user_id=user.id, username=user.username,
        role=user.role, created_at=time.time(),
    )
    await redis.setex(
        f"session:{session_id}", SESSION_EXPIRE,
        session.model_dump_json(),
    )
    response.set_cookie(
        key="session_id", value=session_id,
        httponly=True, secure=True, samesite="lax",
        max_age=SESSION_EXPIRE,
    )
    return {"message": "Logged in"}

@app.get("/me")
async def me(session: SessionData = Depends(get_session)):
    return session

@app.post("/logout")
async def logout(response: Response, session_id: str | None = Cookie(None)):
    if session_id:
        await redis.delete(f"session:{session_id}")
    response.delete_cookie(key="session_id")
    return {"message": "Logged out"}
```

---

## 12.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| Cookie 存储敏感信息 | 敏感数据仅存服务端，Cookie 只存 Session ID |
| 不设置 HttpOnly/Secure | 生产环境始终设置 HttpOnly、Secure、SameSite |
| Session 无过期 | 设置合理的过期时间（max_age/TTL） |
| Header 名大小写混乱 | HTTP Header 名称不区分大小写，FastAPI 自动转换 |
| 下划线与连字符混淆 | FastAPI Header 参数中下划线自动转为连字符 |
| 不使用请求追踪 | 每个请求生成唯一 X-Request-ID |
| CORS 头不正确 | 使用 CORSMiddleware 统一配置 |
| Session 固定攻击 | 登录后重新生成 Session ID |

---

本章从 Header 参数解析到 Cookie 操作，从 Session 机制到响应头控制，从 HTTP 头传输到会话管理，全面剖析了 FastAPI 请求头与状态管理的底层机制与实践。