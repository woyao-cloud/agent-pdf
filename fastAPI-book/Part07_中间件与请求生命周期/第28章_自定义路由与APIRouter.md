# 第28章 自定义路由与APIRouter

APIRouter 是组织大型 API 应用的核心工具。本章从路由分组到自定义路由类，从标签系统到路由版本化，深入剖析 FastAPI 路由组织的机制与实践。

---

## 28.1 概念与语法

### 28.1.1 APIRouter 基础

```python
from fastapi import FastAPI, APIRouter

app = FastAPI()

# 创建路由器
users_router = APIRouter(prefix="/users", tags=["users"])
products_router = APIRouter(prefix="/products", tags=["products"])

@users_router.get("/")
async def list_users():
    return [{"id": 1, "name": "Alice"}]

@users_router.get("/{user_id}")
async def get_user(user_id: int):
    return {"id": user_id, "name": "Alice"}

@users_router.post("/")
async def create_user(user: UserCreate):
    return {"id": 2, "name": user.name}

@products_router.get("/")
async def list_products():
    return [{"id": 1, "name": "Widget"}]

# 注册路由器
app.include_router(users_router)
app.include_router(products_router)

# 最终路由：
# GET  /users/         → list_users
# GET  /users/{id}     → get_user
# POST /users/         → create_user
# GET  /products/      → list_products
```

### 28.1.2 路由器配置

```python
from fastapi import FastAPI, APIRouter, Depends

app = FastAPI()

# 路由器级别的依赖
async def common_parameters(q: str | None = None, skip: int = 0, limit: int = 100):
    return {"q": q, "skip": skip, "limit": limit}

router = APIRouter(
    prefix="/items",
    tags=["items"],
    dependencies=[Depends(common_parameters)],
    responses={404: {"description": "Not found"}},
)

@router.get("/")
async def list_items():
    return []

@router.get("/{item_id}", responses={200: {"description": "Success"}})
async def get_item(item_id: int):
    return {"id": item_id}

# 带前缀和标签的路由器嵌套
admin_router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_admin)],
)

@admin_router.delete("/users/{user_id}")
async def delete_user(user_id: int):
    return {"deleted": user_id}

app.include_router(router)
app.include_router(admin_router)
```

### 28.1.3 路由器嵌套

```python
from fastapi import FastAPI, APIRouter

app = FastAPI()

# 一级路由器
api_v1 = APIRouter(prefix="/api/v1")

# 二级路由器
users_v1 = APIRouter(prefix="/users", tags=["users-v1"])
products_v1 = APIRouter(prefix="/products", tags=["products-v1"])

@users_v1.get("/")
async def list_users_v1():
    return {"version": "v1", "users": []}

@products_v1.get("/")
async def list_products_v1():
    return {"version": "v1", "products": []}

# 嵌套路由器
api_v1.include_router(users_v1)
api_v1.include_router(products_v1)

# 注册到主应用
app.include_router(api_v1)

# 最终路由：
# GET /api/v1/users/     → list_users_v1
# GET /api/v1/products/  → list_products_v1
```

### 28.1.4 自定义路由类

```python
from fastapi import APIRouter, Request, Response
from fastapi.routing import APIRoute

class LoggingRoute(APIRoute):
    """自定义路由类 — 自动记录请求日志。"""
    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def custom_handler(request: Request):
            import time
            start = time.time()
            response: Response = await original_handler(request)
            duration = time.time() - start
            print(f"{request.method} {request.url.path} → {response.status_code} ({duration:.3f}s)")
            return response

        return custom_handler

router = APIRouter(route_class=LoggingRoute)

@router.get("/logged")
async def logged_endpoint():
    return {"message": "This request is logged"}

# 所有使用此路由器的路由都会自动记录日志
```

---

## 28.2 原理与机制

### 28.2.1 路由注册与匹配

```python
"""
路由注册与匹配的源码分析：

1. APIRouter.include_router() 流程：
   → 遍历子路由器的 routes
   → 为每个路由添加前缀和依赖
   → 合并到父路由器的 routes 列表

2. FastAPI.include_router() 流程：
   → 调用 APIRouter.include_router()
   → 合并 OpenAPI schema 信息
   → 添加 tags、dependencies、responses

3. 路由匹配算法（starlette/routing.py）：
   → 遍历 routes 列表
   → 对每个 Route 尝试路径匹配
   → 使用正则表达式匹配路径参数
   → 匹配成功返回 (route, path_params)
   → 无匹配返回 404

4. 路径参数编译：
   /users/{user_id} → 正则 ^/users/(?P<user_id>[^/]+)$
   /items/{item_id:int} → 正则 ^/items/(?P<item_id>-?\d+)$

5. 路由优先级：
   - 静态路径优先于动态路径
   - /users/me 匹配优先于 /users/{user_id}
   - 注册顺序决定同优先级路由的匹配顺序

源码位置：
- fastapi/routing.py: APIRouter, APIRoute
- starlette/routing.py: Router, Route, Mount
"""
```

### 28.2.2 OpenAPI 文档与路由

```python
"""
路由信息如何映射到 OpenAPI 文档：

1. 路由注册时收集信息：
   - path: 路径
   - methods: HTTP 方法列表
   - endpoint: 处理函数
   - response_model: 响应模型
   - status_code: 状态码
   - tags: 标签
   - dependencies: 依赖列表

2. APIRoute 对象包含：
   - path: 编译后的路径模式
   - endpoint: 原始处理函数
   - dependant: 依赖图（Dependant 对象）
   - responses: 响应模型字典

3. OpenAPI schema 生成：
   app.openapi_schema = get_openapi(
       title=app.title,
       version=app.version,
       openapi_version=app.openapi_version,
       routes=app.routes,
   )

4. 自定义 OpenAPI：
   def custom_openapi():
       if app.openapi_schema:
           return app.openapi_schema
       schema = get_openapi(...)
       # 修改 schema
       app.openapi_schema = schema
       return schema

   app.openapi = custom_openapi
"""
```

---

## 28.3 使用场景

### 28.3.1 模块化项目结构

```python
"""模块化项目结构：

app/
├── main.py
├── routers/
│   ├── __init__.py
│   ├── users.py
│   ├── products.py
│   └── orders.py
├── dependencies.py
└── models.py
"""

# app/routers/users.py
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
async def list_users():
    return []

@router.get("/{user_id}")
async def get_user(user_id: int):
    return {"id": user_id}

# app/main.py
from fastapi import FastAPI
from app.routers import users, products, orders

app = FastAPI()
app.include_router(users.router)
app.include_router(products.router)
app.include_router(orders.router)
```

### 28.3.2 权限路由器

```python
from fastapi import APIRouter, Depends

# 只读路由器
readonly_router = APIRouter(
    dependencies=[Depends(require_read_access)],
)

# 管理路由器
admin_router = APIRouter(
    dependencies=[Depends(require_admin_access)],
)

@readonly_router.get("/reports")
async def get_reports():
    return []

@admin_router.delete("/reports/{report_id}")
async def delete_report(report_id: int):
    return {"deleted": report_id}

# 将不同权限的路由器注册到不同的前缀
app.include_router(readonly_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1/admin")
```

---

## 28.4 示例代码

### 28.4.1 完整的模块化 API 项目

```python
"""完整的模块化 API 项目结构"""

# === app/dependencies.py ===
from fastapi import Depends, HTTPException

async def get_db():
    db = Database()
    try:
        yield db
    finally:
        db.close()

async def require_auth(token: str = Header(...)):
    user = verify_token(token)
    if not user:
        raise HTTPException(401, "Invalid token")
    return user

async def require_admin(user=Depends(require_auth)):
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user

# === app/routers/users.py ===
from fastapi import APIRouter, Depends
from app.dependencies import get_db, require_auth

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_auth)],
)

@router.get("/")
async def list_users(db=Depends(get_db)):
    return await db.fetch_all("SELECT * FROM users")

@router.get("/{user_id}")
async def get_user(user_id: int, db=Depends(get_db)):
    return await db.fetch_one("SELECT * FROM users WHERE id = ?", [user_id])

# === app/routers/admin.py ===
from fastapi import APIRouter, Depends
from app.dependencies import get_db, require_admin

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, db=Depends(get_db)):
    await db.execute("DELETE FROM users WHERE id = ?", [user_id])
    return {"deleted": user_id}

# === app/main.py ===
from fastapi import FastAPI
from app.routers import users, admin

app = FastAPI(title="Modular API", version="1.0.0")
app.include_router(users.router)
app.include_router(admin.router)
```

---

## 28.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 所有路由写在 main.py | 使用 APIRouter 按功能模块拆分 |
| 不使用 prefix | 每个路由器设置 prefix 避免路径重复 |
| 不使用 tags | 使用 tags 组织 OpenAPI 文档分组 |
| 前缀和路径冲突 | 静态路径优先于动态参数 |
| 路由器依赖与路由依赖重复 | 路由器级依赖用于公共逻辑（认证等） |
| 循环导入 | 依赖提取到单独的 dependencies.py |
| 自定义路由类中不调用 super | 始终调用 super().get_route_handler() |

---

本章从 APIRouter 基础到嵌套路由器，从自定义路由类到路由匹配算法，从模块化项目结构到 OpenAPI 文档映射，全面剖析了 FastAPI 自定义路由与 APIRouter 的底层机制与实践。