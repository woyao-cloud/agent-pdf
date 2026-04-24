# 第42章 Starlette核心机制

Starlette 是 FastAPI 的底层框架。本章从 Starlette 的架构到路由系统，从中间件到请求响应对象，深入剖析 Starlette 的核心机制。

---

## 42.1 概念与语法

### 42.1.1 Starlette 架构

```python
"""
Starlette 是 FastAPI 的底层 ASGI 框架：

FastAPI = Starlette + Pydantic + 自动 OpenAPI

Starlette 提供：
1. ASGI 应用框架（App、Router）
2. 路由系统（Route、Mount）
3. 中间件系统（Middleware）
4. 请求/响应对象（Request、Response）
5. WebSocket 支持
6. 表单处理
7. 静态文件服务
8. 会话管理
9. 测试客户端（TestClient）

FastAPI 在 Starlette 之上添加：
1. Pydantic 验证
2. 依赖注入系统
3. 自动 OpenAPI 文档
4. 路由装饰器简化
5. response_model 过滤
"""
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.responses import JSONResponse

async def homepage(request):
    return JSONResponse({"hello": "world"})

app = Starlette(routes=[
    Route("/", homepage),
    Mount("/api", routes=[
        Route("/users", list_users),
        Route("/users/{user_id}", get_user),
    ]),
])
```

### 42.1.2 路由系统

```python
from starlette.routing import Route, Mount, Router

# 基本路由
route = Route("/items/{item_id}", get_item, methods=["GET"])

# 路径参数类型转换
route = Route("/items/{item_id:int}", get_item)
route = Route("/users/{username:path}", get_user)  # 匹配 /users/a/b/c

# 路由挂载
api_routes = [
    Route("/users", list_users, methods=["GET"]),
    Route("/users", create_user, methods=["POST"]),
    Route("/users/{user_id}", get_user, methods=["GET"]),
]

app = Starlette(routes=[
    Route("/", homepage),
    Mount("/api", routes=api_routes),
])

# 路由名称和反向 URL 生成
route = Route("/items/{item_id}", get_item, name="item-detail")

# 在视图函数中生成 URL
from starlette.responses import RedirectResponse

async def redirect_to_item(request):
    item_id = 1
    url = request.url_for("item-detail", item_id=item_id)
    return RedirectResponse(url=url)
```

### 42.1.3 请求与响应

```python
from starlette.requests import Request
from starlette.responses import Response, JSONResponse, HTMLResponse

# Request 对象
async def handler(request: Request):
    # 请求信息
    method = request.method           # "GET"
    url = request.url                 # URL 对象
    path = request.url.path           # "/items/1"
    query = request.query_params      # QueryParams 对象
    headers = request.headers         # Headers 对象
    client = request.client           # (host, port)
    cookies = request.cookies         # Cookies 对象

    # 路径参数
    item_id = request.path_params["item_id"]

    # 请求体
    body = await request.body()      # bytes
    json_data = await request.json()  # 解析 JSON
    form_data = await request.form()  # 解析表单

    # 状态
    request.state.user = "Alice"      # 请求级状态

    # 客户端断开检测
    disconnected = await request.is_disconnected()

# Response 对象
async def create_response():
    # JSON 响应
    return JSONResponse({"message": "Hello"})

    # HTML 响应
    return HTMLResponse("<h1>Hello</h1>")

    # 原始响应
    return Response(content=b"Hello", media_type="text/plain", status_code=200)

    # 重定向
    from starlette.responses import RedirectResponse
    return RedirectResponse(url="/new-url", status_code=301)
```

---

## 42.2 原理与机制

### 42.2.1 ASGI 接口实现

```python
"""
Starlette ASGI 接口实现：

class Starlette:
    def __init__(self, routes=None, middleware=None, ...):
        # 构建中间件栈
        self.middleware_stack = self.build_middleware_stack()

    async def __call__(self, scope, receive, send):
        # 根据 scope 类型分发
        if scope["type"] == "http":
            await self.middleware_stack(scope, receive, send)
        elif scope["type"] == "websocket":
            await self.middleware_stack(scope, receive, send)
        elif scope["type"] == "lifespan":
            await self.lifespan(scope, receive, send)

    def build_middleware_stack(self):
        # 从内到外构建中间件栈
        # 1. ExceptionMiddleware（捕获异常）
        # 2. 用户自定义中间件
        # 3. ServerErrorMiddleware（500 错误页面）
        app = self.router
        for cls, options in reversed(self.user_middleware):
            app = cls(app, **options)
        app = ExceptionMiddleware(app, handlers=self.exception_handlers)
        app = ServerErrorMiddleware(app, debug=self.debug)
        return app

中间件栈执行顺序（请求进入）：
ServerErrorMiddleware → ExceptionMiddleware → 自定义中间件 → Router → 路由函数

中间件栈执行顺序（响应返回）：
路由函数 → Router → 自定义中间件 → ExceptionMiddleware → ServerErrorMiddleware
"""
```

### 42.2.2 路由匹配机制

```python
"""
Starlette 路由匹配机制（starlette/routing.py）：

class Router:
    async def __call__(self, scope, receive, send):
        # 遍历所有路由
        for route in self.routes:
            # 尝试匹配
            match, child_scope = route.match(scope)
            if match == Match.FULL:
                # 完全匹配，调用路由处理器
                await route.app(child_scope, receive, send)
                return
            elif match == Match.PARTIAL:
                # 部分匹配（Mount），继续
                await route.app(child_scope, receive, send)
                return

        # 无匹配，404
        if scope["type"] == "http":
            response = Response(status_code=404)
            await response(scope, receive, send)

class Route:
    def __init__(self, path, endpoint, methods=None, name=None):
        # 编译路径为正则表达式
        self.path_regex, self.path_format, self.param_convertors = compile_path(path)

    def match(self, scope):
        # 1. 检查 HTTP 方法
        if self.methods and scope["method"] not in self.methods:
            return Match.NONE, {}

        # 2. 正则匹配路径
        match = self.path_regex.match(scope["path"])
        if not match:
            return Match.NONE, {}

        # 3. 提取和转换路径参数
        path_params = {}
        for key, value in match.groupdict().items():
            convertor = self.param_convertors[key]
            path_params[key] = convertor.convert(value)

        return Match.FULL, {**scope, "path_params": path_params}

路径参数转换器：
- str: 默认，匹配 [^/]+
- int: 匹配 -?\\d+，转换为 int
- float: 匹配 -?\\d+(\\.\\d+)?，转换为 float
- path: 匹配 .+，包含 /
- uuid: 匹配 UUID 格式
"""
```

### 42.2.3 中间件栈

```python
"""
Starlette 中间件栈构建过程：

1. 用户注册中间件（add_middleware）：
   app.add_middleware(CORSMiddleware, ...)
   app.add_middleware(TrustedHostMiddleware, ...)

2. 构建中间件栈（build_middleware_stack）：
   # 从内到外
   app = Router                    # 核心路由
   app = ExceptionMiddleware(app)  # 异常处理
   app = CORSMiddleware(app, ...)   # CORS
   app = TrustedHostMiddleware(app, ...)  # 主机验证
   app = ServerErrorMiddleware(app) # 500 错误

3. 请求处理顺序：
   Request → ServerErrorMiddleware
           → TrustedHostMiddleware
           → CORSMiddleware
           → ExceptionMiddleware
           → Router
           → 路由函数

4. 响应返回顺序（逆序）：
   路由函数 → Router
            → ExceptionMiddleware
            → CORSMiddleware
            → TrustedHostMiddleware
            → ServerErrorMiddleware
            → Response

关键中间件：
- ServerErrorMiddleware：最外层，捕获所有未处理异常，返回500页面
- ExceptionMiddleware：处理 HTTPException 和自定义异常处理器
- 用户中间件：CORSMiddleware、SecurityHeaders 等
- Router：路由匹配和分发
"""
```

---

## 42.3 使用场景

### 42.3.1 纯 Starlette 应用

```python
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

async def homepage(request):
    return JSONResponse({"message": "Hello World"})

async def health(request):
    return JSONResponse({"status": "ok"})

routes = [
    Route("/", homepage),
    Route("/health", health),
]

middleware = [
    Middleware(CORSMiddleware, allow_origins=["*"]),
]

app = Starlette(
    routes=routes,
    middleware=middleware,
    debug=True,
)
```

### 42.3.2 自定义 ASGI 中间件

```python
class TimingMiddleware:
    """纯 ASGI 中间件（高性能）。"""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.time()

        async def send_with_timing(message):
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                headers[b"x-process-time"] = f"{time.time() - start:.4f}s".encode()
                message["headers"] = list(headers.items())
            await send(message)

        await self.app(scope, receive, send_with_timing)
```

---

## 42.4 示例代码

### 42.4.1 Starlette 核心组件分析

```python
"""Starlette 核心组件追踪"""
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse

# 请求生命周期追踪
async def traced_handler(request):
    # 1. Request 对象构建
    print(f"Method: {request.method}")
    print(f"URL: {request.url}")
    print(f"Headers: {dict(request.headers)}")
    print(f"Path params: {request.path_params}")
    print(f"Query params: {dict(request.query_params)}")

    # 2. 请求体读取
    if request.method in ("POST", "PUT", "PATCH"):
        body = await request.json()
        print(f"Body: {body}")

    # 3. 状态管理
    request.state.process_time = time.time()

    # 4. 响应构建
    return JSONResponse({"message": "ok"})

# 路由注册
routes = [
    Route("/", traced_handler, methods=["GET", "POST"]),
    Route("/items/{item_id:int}", traced_handler, methods=["GET"]),
]

app = Starlette(routes=routes, debug=True)

# 查看路由信息
for route in app.routes:
    print(f"Route: {route.path} → {route.endpoint.__name__}")
    print(f"  Methods: {route.methods}")
    print(f"  Regex: {route.path_regex.pattern}")
```

---

## 42.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 不了解 FastAPI 与 Starlette 的关系 | FastAPI = Starlette + Pydantic + OpenAPI |
| 使用 BaseHTTPMiddleware 读取请求体 | 请求体只能读取一次，中间件中避免读取 |
| 路由匹配顺序错误 | 静态路径放在动态参数前 |
| 不使用 Mount 组织路由 | 使用 Mount 按功能分组 |
| 中间件顺序混乱 | 理解洋葱模型，按正确顺序添加 |
| 不了解 Starlette 的 Request 对象 | Request 是 Starlette 的核心，不是 FastAPI 的 |

---

本章从 Starlette 架构到 ASGI 接口实现，从路由匹配机制到中间件栈构建，从请求响应对象到纯 ASGI 中间件，全面剖析了 Starlette 核心机制的底层原理。