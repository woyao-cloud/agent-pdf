# 第41章 FastAPI请求处理源码分析

FastAPI 的请求处理是理解框架核心的关键。本章从 ASGI 接口到路由匹配，从依赖注入到响应序列化，逐层剖析 FastAPI 请求处理的源码实现。

---

## 41.1 概念与语法

### 41.1.1 请求处理总览

```python
"""
FastAPI 请求处理完整流程：

HTTP Request
    ↓
1. uvicorn 接收连接，解析 HTTP 请求
    ↓
2. ASGI scope 字典构建
   scope = {
       "type": "http",
       "method": "GET",
       "path": "/items/1",
       "query_string": b"",
       "headers": [(b"host", b"localhost:8000"), ...],
       "server": ("localhost", 8000),
   }
    ↓
3. 中间件链处理（从外到内）
   ServerErrorMiddleware → ExceptionMiddleware → CORS → 自定义中间件
    ↓
4. 路由匹配（starlette/routing.py: Router）
   遍历 app.routes 查找匹配的 Route
    ↓
5. 依赖注入解析（fastapi/dependencyInjection.py: solve_dependencies）
   递归解析依赖图，执行依赖函数
    ↓
6. 请求体解析与验证（Pydantic）
   从 Query/Path/Body 提取数据
   Pydantic 模型验证 → 422 错误或继续
    ↓
7. 路由函数执行
   用户定义的 async def endpoint(...)
    ↓
8. 响应处理（fastapi/routing.py: serialize_response）
   response_model 过滤字段
   jsonable_encoder 序列化
    ↓
9. 中间件链返回（从内到外）
    ↓
10. ASGI 响应发送
    await send({"type": "http.response.start", "status": 200, ...})
    await send({"type": "http.response.body", "body": b"..."})
"""
```

### 41.1.2 核心源码入口

```python
"""
FastAPI 源码核心文件与功能：

fastapi/
├── main.py              — FastAPI 类定义，include_router, middleware
├── routing.py           — APIRouter, APIRoute, 请求处理
├── params.py            — Path, Query, Body, Header, Cookie, Form, File
├── dependencies/
│   └── models.py         — Dependant, Dependency 等数据模型
├── dependencyInjection.py — solve_dependencies 核心逻辑
├── exception_handlers.py — 默认异常处理器
├── responses.py         — JSONResponse 等响应类
├── encoders.py           — jsonable_encoder 序列化
├── openapi/
│   ├── utils.py          — OpenAPI schema 生成
│   └── docs.py           — Swagger UI / ReDoc
└── utils.py              — 工具函数

starlette/
├── routing.py            — Router, Route, Mount
├── middleware/
│   ├── base.py           — BaseHTTPMiddleware
│   ├── cors.py           — CORSMiddleware
│   ├── errors.py          — ServerErrorMiddleware
│   └── exceptions.py      — ExceptionMiddleware
├── requests.py           — Request 类
├── responses.py          — Response, JSONResponse 等
└── datastructures.py     — UploadFile, State 等

pydantic/
├── main.py               — BaseModel
├── _internal/
│   ├── _model_construction.py — 模型构建
│   └── _generate_schema.py   — core_schema 生成
└── core/                  — Rust 核心引擎
"""
```

---

## 41.2 原理与机制

### 41.2.1 路由匹配源码分析

```python
"""
路由匹配源码（starlette/routing.py）：

class Router:
    async def __call__(self, scope, receive, send):
        # 1. 查找匹配的路由
        for route in self.routes:
            match, child_scope = route.match(scope)
            if match:
                # 2. 调用匹配的路由
                await route.app(child_scope, receive, send)
                return

        # 3. 无匹配路由
        if scope["type"] == "http":
            response = Response(status_code=404)
            await response(scope, receive, send)

class Route:
    def match(self, scope):
        # 1. 检查 HTTP 方法
        if self.methods and scope["method"] not in self.methods:
            return None, {}

        # 2. 正则匹配路径
        match = self.path_regex.match(scope["path"])
        if not match:
            return None, {}

        # 3. 提取路径参数
        path_params = match.groupdict()
        # 转换类型（如 {item_id:int} → int）
        for key, value in path_params.items():
            converter = self.param_convertors.get(key)
            if converter:
                path_params[key] = converter.convert(value)

        # 4. 更新 scope
        new_scope = {**scope, "path_params": path_params}
        return Match.FULL, new_scope

关键点：
1. 路由按注册顺序匹配（最先匹配优先）
2. 静态路径优先于动态参数路径
3. 路径参数使用正则匹配和类型转换
4. {item_id:int} 使用 IntegerConverter 转换
5. 路由匹配不区分大小写（可配置）
"""
```

### 41.2.2 依赖注入源码分析

```python
"""
依赖注入源码（fastapi/dependencyInjection.py: solve_dependencies）：

async def solve_dependencies(
    request: Request,
    dependant: Dependant,
    dependency_overrides_provider: Any = None,
    dependency_cache: dict | None = None,
):
    # 1. 初始化缓存
    if dependency_cache is None:
        dependency_cache = {}

    # 2. 遍历依赖图
    for sub_dependant in dependant.dependencies:
        # 3. 检查依赖覆盖
        call = sub_dependant.call
        if dependency_overrides_provider:
            overrides = dependency_overrides_provider.dependency_overrides
            if call in overrides:
                call = overrides[call]

        # 4. 检查缓存（同一请求内）
        if call in dependency_cache:
            sub_dependant.cache_key = call
            values[sub_dependant.name] = dependency_cache[call]
            continue

        # 5. 递归解析子依赖
        sub_values, sub_errors = await solve_dependencies(
            request=request,
            dependant=sub_dependant,
            dependency_overrides_provider=dependency_overrides_provider,
            dependency_cache=dependency_cache,
        )

        # 6. 执行依赖函数
        if sub_errors:
            errors.extend(sub_errors)
        else:
            value = await call(**sub_values)
            # 7. 缓存结果
            if sub_dependant.use_cache:
                dependency_cache[call] = value
            values[sub_dependant.name] = value

    # 8. 返回解析结果和错误
    return values, errors

关键特性：
1. 依赖图递归解析
2. 同一请求内依赖缓存（use_cache=True）
3. dependency_overrides 机制
4. yield 依赖的资源管理（try/finally）
5. 子依赖的依赖也会被递归解析
"""
```

### 41.2.3 请求验证与响应序列化

```python
"""
请求验证源码（fastapi/routing.py: get_request_handler）：

async def get_request_handler(
    dependant: Dependant,
    body_field: BodyFieldInfo | None,
    status_code: int,
    response_model: type | None,
    response_class: type,
):
    # 1. 构建参数解析器
    # 根据 dependant.dependencies 收集参数信息
    # 包括 Query、Path、Body、Header 等

    async def app(request: Request) -> Response:
        # 2. 解析依赖
        values, errors = await solve_dependencies(
            request=request,
            dependant=dependant,
        )

        # 3. 处理验证错误
        if errors:
            raise RequestValidationError(errors)

        # 4. 执行路由函数
        raw_response = await dependant.call(**values)

        # 5. 响应处理
        if isinstance(raw_response, Response):
            return raw_response

        # 6. response_model 过滤
        if response_model:
            raw_response = response_model.model_validate(raw_response)

        # 7. 序列化
        content = jsonable_encoder(raw_response)
        return response_class(content=content, status_code=status_code)

    return app

jsonable_encoder 源码（fastapi/encoders.py）：

def jsonable_encoder(obj, include=None, exclude=None, by_alias=False):
    # 1. Pydantic 模型 → model_dump()
    if isinstance(obj, BaseModel):
        return obj.model_dump(include=include, exclude=exclude, by_alias=by_alias)

    # 2. datetime → ISO 格式
    if isinstance(obj, datetime):
        return obj.isoformat()

    # 3. Enum → 值
    if isinstance(obj, Enum):
        return obj.value

    # 4. 列表/字典递归处理
    if isinstance(obj, list):
        return [jsonable_encoder(item) for item in obj]
    if isinstance(obj, dict):
        return {k: jsonable_encoder(v) for k, v in obj.items()}

    # 5. 其他类型直接返回
    return obj
"""
```

---

## 41.3 使用场景

### 41.3.1 自定义请求处理

```python
from fastapi import FastAPI, Request, Response
from fastapi.routing import APIRoute
import time

class TimedRoute(APIRoute):
    """自定义路由类 — 记录请求处理时间。"""
    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def custom_handler(request: Request):
            start = time.time()
            response: Response = await original_handler(request)
            process_time = time.time() - start
            response.headers["X-Process-Time"] = f"{process_time:.4f}s"

            # 记录到请求状态
            request.state.process_time = process_time
            return response

        return custom_handler

app = FastAPI()
router = APIRouter(route_class=TimedRoute)

@router.get("/items/{item_id}")
async def get_item(item_id: int):
    return {"item_id": item_id}

app.include_router(router)
```

### 41.3.2 请求拦截

```python
from fastapi import FastAPI, Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

class RequestInterceptor(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 请求前拦截
        if request.url.path.startswith("/admin"):
            token = request.headers.get("Authorization")
            if not verify_admin_token(token):
                raise HTTPException(403, "Admin access required")

        # 执行请求
        response = await call_next(request)

        # 响应后处理
        response.headers["X-API-Version"] = "1.0"
        return response

app = FastAPI()
app.add_middleware(RequestInterceptor)
```

---

## 41.4 示例代码

### 41.4.1 请求处理流程追踪

```python
"""追踪 FastAPI 请求处理全流程"""
from fastapi import FastAPI, Request, Depends
from fastapi.routing import APIRoute
import time
import logging

logger = logging.getLogger("trace")

class TraceRoute(APIRoute):
    """追踪路由处理流程。"""
    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def trace_handler(request: Request):
            # 1. 路由匹配阶段
            logger.info(f"[1-Route] {request.method} {request.url.path}")

            # 2. 依赖注入阶段
            start = time.time()
            response = await original_handler(request)
            di_time = time.time() - start

            # 3. 响应阶段
            logger.info(f"[3-Response] status={response.status_code} time={di_time:.4f}s")
            response.headers["X-Trace-Time"] = f"{di_time:.4f}s"
            return response

        return trace_handler

app = FastAPI(title="Trace API")
router = APIRouter(route_class=TraceRoute)

@router.get("/items/{item_id}")
async def get_item(item_id: int):
    logger.info(f"[2-Handler] Processing item_id={item_id}")
    return {"item_id": item_id}

app.include_router(router)

# 中间件追踪
@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    logger.info(f"[0-Middleware] Start {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"[4-Middleware] End {response.status_code}")
    return response
```

---

## 41.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 不了解中间件执行顺序 | 记住洋葱模型：最后添加最先执行请求阶段 |
| 依赖注入中的循环依赖 | 检查依赖图，避免循环 |
| response_model 过滤掉必要字段 | 合理设计请求和响应模型 |
| jsonable_encoder 性能差 | 使用 response_model + model_dump_json |
| 不了解 dependency_overrides 作用范围 | 测试后必须清理 |
| 自定义路由类忘记调 super | 始终调用 super().get_route_handler() |
| 不追踪请求处理时间 | 自定义路由类记录处理时间 |

---

本章从 ASGI 请求入口到路由匹配，从依赖注入解析到请求验证，从响应序列化到中间件栈，逐层剖析了 FastAPI 请求处理的完整源码实现。