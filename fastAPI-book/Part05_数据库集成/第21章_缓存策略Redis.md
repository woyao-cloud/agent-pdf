# 第21章 缓存策略（Redis）

缓存是提升 API 性能的关键策略。本章从 Redis 的集成方式到缓存失效策略，深入剖析 FastAPI 中的缓存机制。

---

## 21.1 概念与语法

### 21.1.1 Redis 集成

```python
import redis.asyncio as aioredis
from fastapi import FastAPI, Depends

app = FastAPI()

# Redis 连接池
redis = aioredis.from_url("redis://localhost:6379", decode_responses=True)

async def get_redis():
    return redis

@app.get("/items/{item_id}")
async def read_item(item_id: int, r: aioredis.Redis = Depends(get_redis)):
    cached = await r.get(f"item:{item_id}")
    if cached:
        return {"source": "cache", "data": cached}
    data = fetch_from_db(item_id)
    await r.set(f"item:{item_id}", data, ex=300)  # TTL 5分钟
    return {"source": "db", "data": data}
```

### 21.1.2 缓存模式

```python
# Cache-Aside 模式（推荐）
async def get_with_cache(key: str, fetcher, ttl: int = 300, r: aioredis.Redis = Depends(get_redis)):
    cached = await r.get(key)
    if cached:
        return json.loads(cached)
    data = await fetcher()
    await r.set(key, json.dumps(data), ex=ttl)
    return data

# Write-Through 模式
async def write_through(key: str, data, ttl: int = 300, r: aioredis.Redis = Depends(get_redis)):
    await save_to_db(data)
    await r.set(key, json.dumps(data), ex=ttl)

# Write-Behind 模式
async def write_behind(key: str, data, r: aioredis.Redis = Depends(get_redis)):
    await r.set(key, json.dumps(data))
    # 异步写入数据库
    await background_write_to_db(data)
```

---

## 21.2 原理与机制

### 21.2.1 Redis 协议（RESP）

```python
# RESP（REdis Serialization Protocol）是 Redis 的通信协议
# 基于 TCP 的文本协议，简单高效
# 命令格式：*参数数量\r\n$参数长度\r\n参数值\r\n
# SET key value → *3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n

# aioredis 的连接池管理：
# 1. 维护多个 TCP 连接
# 2. 请求时从池中获取连接
# 3. 使用完毕归还连接
# 4. 自动重连和健康检查
```

### 21.2.2 缓存一致性

```python
# 缓存一致性策略：
# 1. TTL 过期（最简单，允许短暂不一致）
# 2. 主动失效（更新时删除缓存）
# 3. 双删策略（更新前删+更新后删，防并发穿透）
# 4. 延迟双删（删+更新+延迟删）

# 主动失效实现
async def invalidate_cache(key: str, r: aioredis.Redis = Depends(get_redis)):
    await r.delete(key)

@app.put("/items/{item_id}")
async def update_item(item_id: int, item: ItemUpdate, r: aioredis.Redis = Depends(get_redis)):
    data = update_in_db(item_id, item)
    await r.delete(f"item:{item_id}")  # 主动失效
    return data
```

---

## 21.4 示例代码

### 21.4.1 API 响应缓存装饰器

```python
"""FastAPI API 响应缓存"""
import json
import hashlib
from functools import wraps
from typing import Optional
import redis.asyncio as aioredis
from fastapi import Request, Response

def api_cache(ttl: int = 300, key_prefix: str = "api"):
    """API 响应缓存装饰器。"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, request: Request, r: aioredis.Redis, **kwargs):
            cache_key = f"{key_prefix}:{request.url.path}:{hashlib.md5(str(kwargs).encode()).hexdigest()}"
            cached = await r.get(cache_key)
            if cached:
                return json.loads(cached)
            result = await func(*args, request=request, r=r, **kwargs)
            await r.set(cache_key, json.dumps(result), ex=ttl)
            return result
        return wrapper
    return decorator
```

---

## 21.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 缓存穿透（查询不存在的数据） | 使用布隆过滤器或缓存空值 |
| 缓存雪崩（大量缓存同时过期） | TTL 加随机偏移 |
| 缓存击穿（热点Key过期） | 互斥锁或永不过期+异步刷新 |
| 缓存与数据库不一致 | 主动失效或延迟双删 |
| Redis 内存溢出 | 设置 maxmemory 和淘汰策略 |

---

本章从 Redis 的 RESP 协议到缓存一致性策略，从 Cache-Aside 模式到缓存穿透/雪崩/击穿的防护，全面剖析了 FastAPI 缓存策略的底层机制。