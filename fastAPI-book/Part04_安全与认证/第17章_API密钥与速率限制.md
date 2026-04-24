# 第17章 API密钥与速率限制

API 密钥和速率限制是 API 安全与稳定性的重要保障。本章从 API Key 认证到速率限制算法，从固定窗口到令牌桶，深入剖析 FastAPI API 密钥与速率限制的机制与实践。

---

## 17.1 概念与语法

### 17.1.1 API Key 认证

```python
from fastapi import FastAPI, Security, HTTPException, Depends
from fastapi.security import APIKeyHeader, APIKeyQuery, APIKeyCookie

app = FastAPI()

# 方式1：Header 传递 API Key
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# 方式2：Query 参数传递 API Key
api_key_query = APIKeyQuery(name="api_key", auto_error=False)

# 方式3：Cookie 传递 API Key
api_key_cookie = APIKeyCookie(name="api_key", auto_error=False)

# 验证 API Key
VALID_API_KEYS = {"key1": "user1", "key2": "user2", "key3": "admin"}

async def get_api_key(
    header_key: str | None = Security(api_key_header),
    query_key: str | None = Security(api_key_query),
    cookie_key: str | None = Security(api_key_cookie),
):
    key = header_key or query_key or cookie_key
    if not key or key not in VALID_API_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    return VALID_API_KEYS[key]

@app.get("/protected")
async def protected_endpoint(user: str = Depends(get_api_key)):
    return {"user": user, "message": "Access granted"}

# 多种 API Key 传递方式的优先级：
# Header > Query > Cookie
```

### 17.1.2 简单速率限制

```python
from fastapi import FastAPI, Request, HTTPException
from collections import defaultdict
import time

app = FastAPI()

class SimpleRateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)

    def check(self, client_id: str) -> bool:
        now = time.time()
        # 清除过期记录
        self.requests[client_id] = [
            t for t in self.requests[client_id]
            if now - t < self.window_seconds
        ]
        if len(self.requests[client_id]) >= self.max_requests:
            return False
        self.requests[client_id].append(now)
        return True

limiter = SimpleRateLimiter(max_requests=100, window_seconds=60)

@app.get("/api/data")
async def get_data(request: Request):
    client_id = request.client.host
    if not limiter.check(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    return {"data": "success"}
```

### 17.1.3 令牌桶算法

```python
import time
from collections import defaultdict

class TokenBucket:
    """令牌桶速率限制器。"""
    def __init__(self, rate: float, capacity: int):
        self.rate = rate          # 每秒添加令牌数
        self.capacity = capacity  # 桶容量（最大突发量）
        self.tokens: dict[str, float] = defaultdict(lambda: capacity)
        self.last_time: dict[str, float] = defaultdict(time.time)

    def allow(self, client_id: str) -> bool:
        now = time.time()
        elapsed = now - self.last_time[client_id]
        self.last_time[client_id] = now

        # 补充令牌
        self.tokens[client_id] = min(
            self.capacity,
            self.tokens[client_id] + elapsed * self.rate,
        )

        # 尝试消耗令牌
        if self.tokens[client_id] >= 1:
            self.tokens[client_id] -= 1
            return True
        return False

# 使用示例
bucket = TokenBucket(rate=10, capacity=20)  # 每秒10个，突发20个

@app.get("/api/data")
async def rate_limited_endpoint(request: Request):
    client_id = request.client.host
    if not bucket.allow(client_id):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": "1"},
        )
    return {"data": "success"}
```

### 17.1.4 Redis 速率限制

```python
import redis.asyncio as aioredis
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()
redis = aioredis.from_url("redis://localhost:6379")

async def rate_limit(request: Request, max_requests: int = 100, window: int = 60):
    """基于 Redis 的滑动窗口速率限制。"""
    client_id = request.client.host
    key = f"rate_limit:{client_id}"

    # 使用 Redis 事务确保原子性
    pipe = redis.pipeline()
    now = time.time()
    pipe.zremrangebyscore(key, 0, now - window)  # 移除过期记录
    pipe.zadd(key, {str(now): now})                # 添加当前请求
    pipe.zcard(key)                                 # 计算当前窗口内请求数
    pipe.expire(key, window)                        # 设置过期时间
    results = await pipe.execute()

    request_count = results[2]
    if request_count > max_requests:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {max_requests} requests per {window}s",
            headers={"Retry-After": str(window)},
        )

@app.get("/api/data")
async def get_data(request: Request):
    await rate_limit(request, max_requests=100, window=60)
    return {"data": "success"}
```

---

## 17.2 原理与机制

### 17.2.1 速率限制算法对比

```python
"""
速率限制算法对比：

1. 固定窗口（Fixed Window）：
   - 将时间划分为固定窗口（如每分钟）
   - 每个窗口内计数请求
   - 缺点：窗口边界突发（2倍流量）
   - 实现：简单计数器

2. 滑动窗口（Sliding Window）：
   - 固定窗口的改进版
   - 根据当前时间与窗口起点的比例加权
   - 实现更复杂但更平滑

3. 滑动窗口日志（Sliding Log）：
   - 记录每个请求的时间戳
   - 统计窗口内的请求数
   - 精确但内存消耗大
   - Redis ZSET 实现就是这种

4. 令牌桶（Token Bucket）：
   - 桶中令牌以固定速率补充
   - 每个请求消耗一个令牌
   - 允许突发流量（桶满时）
   - 最常用的算法

5. 漏桶（Leaky Bucket）：
   - 请求进入桶中排队
   - 以固定速率处理请求
   - 不允许突发，输出速率恒定
   - 适合流量整形

算法选择：
- 简单场景：固定窗口
- 允许突发：令牌桶
- 严格限流：漏桶
- 精确限流：滑动窗口日志（Redis ZSET）
"""
```

### 17.2.2 API Key 安全机制

```python
"""
API Key 的安全考量：

1. Key 格式：
   - 前缀标识：sk_live_xxxxx（可辨识类型和环境）
   - 足够长度：至少 32 字符随机数据
   - 可校验：包含校验位防止输入错误

2. Key 存储：
   - 数据库存储：key_hash = SHA256(key)
   - 查询时：SHA256(input_key) → 查询 hash
   - 原始 key 只在创建时显示一次

3. Key 权限：
   - 读写分离：sk_read_xxx / sk_write_xxx
   - 范围限制：指定可访问的 API 路径
   - IP 白名单：限制来源 IP
   - 过期时间：设置 TTL

4. Key 传输：
   - 优先：X-API-Key Header
   - 备选：Query 参数（仅限 GET，有日志风险）
   - 避免：Cookie（CSRF 风险）
   - 绝对避免：URL 路径中（会被代理记录）

5. Key 轮换：
   - 支持双 Key 过渡期
   - 旧 Key 到期后失效
   - 新 Key 立即生效
"""
```

---

## 17.3 使用场景

### 17.3.1 分级速率限制

```python
from fastapi import FastAPI, Request, HTTPException, Depends

app = FastAPI()

# 不同级别用户的速率限制
RATE_LIMITS = {
    "free":     {"max_requests": 100, "window": 3600},   # 100/hour
    "basic":    {"max_requests": 1000, "window": 3600},  # 1000/hour
    "premium":  {"max_requests": 10000, "window": 3600}, # 10000/hour
}

async def get_user_tier(api_key: str = Depends(get_api_key)) -> str:
    return get_tier_by_key(api_key)

@app.get("/api/data")
async def get_data(request: Request, tier: str = Depends(get_user_tier)):
    limits = RATE_LIMITS[tier]
    await rate_limit(request, **limits)
    return {"data": "success"}
```

### 17.3.2 slowapi 集成

```python
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

app = FastAPI()

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
    )

app.add_middleware(SlowAPIMiddleware)

# 路由级别速率限制
@app.get("/slow")
@limiter.limit("1/minute")
async def slow_endpoint(request: Request):
    return {"message": "This is rate limited"}

@app.get("/fast")
@limiter.limit("100/minute")
async def fast_endpoint(request: Request):
    return {"message": "This allows more requests"}

# 动态速率限制（根据用户类型）
@app.get("/dynamic")
@limiter.limit(lambda: get_rate_limit_for_user())
async def dynamic_endpoint(request: Request):
    return {"message": "Dynamic rate limit"}
```

---

## 17.4 示例代码

### 17.4.1 完整的 API Key 管理系统

```python
"""API Key 管理系统 — 创建、验证、速率限制"""
import hashlib
import secrets
import time
from fastapi import FastAPI, Depends, HTTPException, Request
from pydantic import BaseModel

app = FastAPI()

# 模拟数据库
API_KEYS = {}  # key_hash → {user_id, tier, scopes, created_at, expires_at}

class APIKeyCreate(BaseModel):
    user_id: str
    tier: str = "free"
    scopes: list[str] = ["read"]
    expires_in_days: int = 30

class APIKeyResponse(BaseModel):
    api_key: str
    key_prefix: str
    expires_at: float

def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()

def generate_api_key(prefix: str = "sk") -> str:
    return f"{prefix}_{secrets.token_urlsafe(32)}"

@app.post("/api-keys", response_model=APIKeyResponse)
async def create_api_key(data: APIKeyCreate):
    raw_key = generate_api_key()
    key_hash = hash_key(raw_key)
    expires_at = time.time() + data.expires_in_days * 86400

    API_KEYS[key_hash] = {
        "user_id": data.user_id,
        "tier": data.tier,
        "scopes": data.scopes,
        "created_at": time.time(),
        "expires_at": expires_at,
    }

    return APIKeyResponse(
        api_key=raw_key,
        key_prefix=raw_key[:8] + "...",
        expires_at=expires_at,
    )

async def verify_api_key(request: Request):
    key = request.headers.get("X-API-Key")
    if not key:
        raise HTTPException(401, "Missing API Key")

    key_hash = hash_key(key)
    key_data = API_KEYS.get(key_hash)
    if not key_data:
        raise HTTPException(401, "Invalid API Key")

    if time.time() > key_data["expires_at"]:
        raise HTTPException(401, "API Key expired")

    return key_data

@app.get("/protected")
async def protected(key_data: dict = Depends(verify_api_key)):
    return {"user": key_data["user_id"], "tier": key_data["tier"]}
```

---

## 17.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| API Key 明文存储数据库 | 存储 SHA256 哈希，原始 Key 只显示一次 |
| 速率限制只用 IP | API Key + IP 双维度限制 |
| 不设置速率限制响应头 | 返回 X-RateLimit-* 头和 Retry-After |
| 固定窗口边界突发 | 使用令牌桶或滑动窗口算法 |
| 速率限制状态仅存内存 | 生产环境使用 Redis 持久化 |
| API Key 通过 URL 传输 | 使用 Header 传输，避免日志泄露 |
| 不支持 Key 轮换 | 支持双 Key 过渡期机制 |
| 不区分用户级别 | 实现分级速率限制（free/premium） |

---

本章从 API Key 认证到速率限制算法，从固定窗口到令牌桶，从内存限制到 Redis 分布式限流，从分级限流到 slowapi 集成，全面剖析了 FastAPI API 密钥与速率限制的底层机制与实践。