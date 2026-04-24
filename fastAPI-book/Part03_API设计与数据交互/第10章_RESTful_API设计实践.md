# 第10章 RESTful API设计实践

RESTful API 是现代 Web 应用的标准接口风格。本章从 REST 原则到 FastAPI 的路由设计，从资源建模到 HATEOAS，深入剖析 RESTful API 设计的机制与实践。

---

## 10.1 概念与语法

### 10.1.1 REST 原则与 HTTP 方法

```python
"""
REST（Representational State Transfer）六大约束：
1. Client-Server：客户端与服务端分离
2. Stateless：每个请求包含所有必要信息
3. Cacheable：响应必须标识是否可缓存
4. Uniform Interface：统一接口（核心约束）
5. Layered System：可插入中间层（代理、负载均衡）
6. Code on Demand（可选）：可返回可执行代码

HTTP 方法与 CRUD 映射：
POST   → Create  → 201 Created
GET    → Read    → 200 OK
PUT    → Update（全量）→ 200 OK / 204 No Content
PATCH  → Update（部分）→ 200 OK / 204 No Content
DELETE → Delete  → 200 OK / 204 No Content
"""
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

app = FastAPI()

class ItemCreate(BaseModel):
    name: str
    price: float

class ItemResponse(BaseModel):
    id: int
    name: str
    price: float

# 资源命名使用复数名词
@app.post("/items", status_code=status.HTTP_201_CREATED, response_model=ItemResponse)
async def create_item(item: ItemCreate):
    saved = save_item(item)
    return saved

@app.get("/items", response_model=list[ItemResponse])
async def list_items(skip: int = 0, limit: int = 20):
    return query_items(skip=skip, limit=limit)

@app.get("/items/{item_id}", response_model=ItemResponse)
async def get_item(item_id: int):
    item = find_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@app.put("/items/{item_id}", response_model=ItemResponse)
async def update_item(item_id: int, item: ItemCreate):
    return replace_item(item_id, item)

@app.patch("/items/{item_id}", response_model=ItemResponse)
async def partial_update_item(item_id: int, item: ItemUpdate):
    return patch_item(item_id, item)

@app.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: int):
    remove_item(item_id)
```

### 10.1.2 状态码与响应模型

```python
from fastapi import FastAPI, status
from fastapi.responses import JSONResponse

app = FastAPI()

# 常用状态码
# 200 OK          — 成功请求
# 201 Created     — 资源创建成功
# 204 No Content  — 成功但无返回内容
# 301 Moved       — 永久重定向
# 304 Not Modified— 缓存命中
# 400 Bad Request — 客户端请求错误
# 401 Unauthorized— 未认证
# 403 Forbidden   — 无权限
# 404 Not Found   — 资源不存在
# 409 Conflict   — 资源冲突
# 422 Unprocessable— 验证失败
# 500 Internal    — 服务端错误

# 多种响应类型
from typing import Union

@app.get("/items/{item_id}", responses={
    200: {"model": ItemResponse, "description": "成功"},
    404: {"model": ErrorResponse, "description": "不存在"},
})
async def get_item(item_id: int) -> Union[ItemResponse, ErrorResponse]:
    ...

# 自定义状态码和响应头
@app.post("/items", status_code=status.HTTP_201_CREATED)
async def create_item(item: ItemCreate):
    saved = save_item(item)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=saved.model_dump(),
        headers={"Location": f"/items/{saved.id}"},
    )
```

### 10.1.3 分页、过滤与排序

```python
from fastapi import FastAPI, Query
from pydantic import BaseModel

class PaginationParams(BaseModel):
    page: int = Query(1, ge=1, description="页码")
    page_size: int = Query(20, ge=1, le=100, description="每页数量")

class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int

@app.get("/items")
async def list_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", pattern=r"^(name|price|created_at)$"),
    order: str = Query("desc", pattern=r"^(asc|desc)$"),
    name: str | None = Query(None, description="按名称过滤"),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    category: str | None = Query(None),
):
    query = build_query(
        sort_by=sort_by, order=order,
        name=name, min_price=min_price, max_price=max_price,
        category=category,
    )
    total = count_items(query)
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size,
    )
```

---

## 10.2 原理与机制

### 10.2.1 FastAPI 路由注册机制

```python
"""
FastAPI 路由注册的内部流程：

1. @app.get("/items") 装饰器调用
   ↓
2. app.add_api_route("/items", endpoint, methods=["GET"])
   ↓
3. 创建 Route 对象（starlette.routing.Route）
   - path: "/items"
   - endpoint: 用户定义的函数
   - methods: ["GET"]
   ↓
4. 路由匹配时：
   - 遍历 app.routes 查找匹配的路由
   - 使用正则匹配路径参数（如 {item_id} → (?P<item_id>[^/]+)）
   - 提取路径参数
   ↓
5. 依赖注入处理：
   - 解析函数签名的参数
   - 匹配 Depends / Query / Path / Body 等
   - 执行依赖链
   ↓
6. OpenAPI 文档生成：
   - 从函数签名提取参数信息
   - 从 response_model 提取响应 Schema
   - 从 status_code 设置响应状态码
   - 生成 OpenAPI paths 对象

源码位置：
- fastapi/routing.py: APIRoute, APIRouter
- starlette/routing.py: Route, Router
- fastapi/openapi/utils.py: get_openapi
"""
```

### 10.2.2 请求处理管线

```python
"""
FastAPI 请求处理的完整管线：

HTTP Request
    ↓
1. ASGI Server（uvicorn）接收连接
    ↓
2. Starlette 路由匹配（Route.match）
    ↓
3. 中间件链处理（Middleware）
    ↓
4. 依赖注入解析（solve_dependencies）
   - 检查依赖图
   - 执行依赖函数
   - 缓存结果（同一请求内）
    ↓
5. 请求体解析与验证
   - 从 Query/Path/Body 提取数据
   - Pydantic 模型验证
   - 422 错误处理
    ↓
6. 路由函数执行
    ↓
7. 响应处理
   - response_model 过滤
   - jsonable_encoder 序列化
   - 设置响应头和状态码
    ↓
8. 中间件链返回（逆序）
    ↓
9. HTTP Response 发送

关键源码：
- fastapi/dependencyInjection.py: solve_dependencies()
- fastapi/routing.py: get_request_handler()
- fastapi/exception_handlers.py: validation_exception_handler
"""
```

---

## 10.3 使用场景

### 10.3.1 版本化 API

```python
from fastapi import FastAPI, APIRouter

app = FastAPI()

v1 = APIRouter(prefix="/api/v1")
v2 = APIRouter(prefix="/api/v2")

# V1 版本
@v1.get("/items")
async def list_items_v1():
    return {"version": "v1", "items": []}

# V2 版本（字段名变更）
@v2.get("/items")
async def list_items_v2():
    return {"version": "v2", "data": [], "pagination": {"page": 1, "total": 0}}

app.include_router(v1)
app.include_router(v2)

# 默认路由指向最新版本
app.include_router(v2, prefix="/api")
```

### 10.3.2 HATEOAS 实现

```python
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any

app = FastAPI()

class Link(BaseModel):
    href: str
    method: str = "GET"
    rel: str

class Resource(BaseModel):
    data: Any
    links: list[Link]

def item_links(item_id: int) -> list[Link]:
    return [
        Link(href=f"/items/{item_id}", method="GET", rel="self"),
        Link(href=f"/items/{item_id}", method="PUT", rel="update"),
        Link(href=f"/items/{item_id}", method="DELETE", rel="delete"),
    ]

@app.get("/items/{item_id}", response_model=Resource)
async def get_item(item_id: int):
    item = get_from_db(item_id)
    return Resource(data=item, links=item_links(item_id))
```

---

## 10.4 示例代码

### 10.4.1 完整的 RESTful API 设计

```python
"""电商产品 RESTful API"""
from fastapi import FastAPI, HTTPException, Query, status, Depends
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="Product API", version="1.0.0")

# === 模型定义 ===
class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0)
    description: Optional[str] = Field(None, max_length=2000)
    category: str = Field(min_length=1, max_length=50)
    stock: int = Field(ge=0, default=0)

class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    price: Optional[float] = Field(None, gt=0)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, min_length=1, max_length=50)
    stock: Optional[int] = Field(None, ge=0)

class ProductResponse(BaseModel):
    id: int
    name: str
    price: float
    description: Optional[str]
    category: str
    stock: int

class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    page: int
    page_size: int

class ErrorResponse(BaseModel):
    detail: str
    code: str

# === API 端点 ===
@app.post("/products", status_code=status.HTTP_201_CREATED, response_model=ProductResponse,
          responses={400: {"model": ErrorResponse}})
async def create_product(product: ProductCreate):
    return save_product(product)

@app.get("/products", response_model=ProductListResponse)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    sort_by: str = Query("id", pattern=r"^(id|name|price|created_at)$"),
    order: str = Query("asc", pattern=r"^(asc|desc)$"),
):
    return query_products(page, page_size, category, min_price, max_price, sort_by, order)

@app.get("/products/{product_id}", response_model=ProductResponse,
         responses={404: {"model": ErrorResponse}})
async def get_product(product_id: int):
    product = find_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@app.put("/products/{product_id}", response_model=ProductResponse)
async def replace_product(product_id: int, product: ProductCreate):
    if not exists(product_id):
        raise HTTPException(status_code=404)
    return update_product(product_id, product)

@app.patch("/products/{product_id}", response_model=ProductResponse)
async def patch_product(product_id: int, product: ProductUpdate):
    if not exists(product_id):
        raise HTTPException(status_code=404)
    return partial_update(product_id, product.model_dump(exclude_unset=True))

@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: int):
    if not exists(product_id):
        raise HTTPException(status_code=404)
    remove_product(product_id)
```

---

## 10.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 使用动词路径（/createItem） | 使用名词复数 + HTTP 方法（POST /items） |
| 路径中嵌套过深 | 最多两层嵌套（/users/{id}/orders） |
| 不使用正确的状态码 | 201 创建、204 删除、409 冲突、422 验证失败 |
| 忽略分页 | 列表端点始终支持分页 |
| 返回裸数组 | 包装为对象 `{"items": [...], "total": 100}` |
| 不提供 API 版本 | 使用 /api/v1/ 前缀版本化 |
| PUT 与 PATCH 混用 | PUT 全量替换，PATCH 部分更新 |
| 忽略幂等性 | PUT 和 DELETE 必须幂等 |

---

本章从 REST 六大约束到 HTTP 方法映射，从 FastAPI 路由注册机制到请求处理管线，从版本化 API 到 HATEOAS，全面剖析了 RESTful API 设计的底层机制与实践。