# 第36章 OpenAPI文档定制

## 36.1 概念与语法

### OpenAPI规范概述

OpenAPI Specification（原名Swagger Specification）是一种与语言无关的RESTful API描述格式。FastAPI基于此规范自动生成API文档，其核心数据流如下：

```
Python类型注解 + Pydantic模型 → JSON Schema → OpenAPI Schema → Swagger UI / ReDoc
```

FastAPI默认生成的OpenAPI schema版本为3.1.0，该schema是一个JSON对象，包含以下顶级字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `openapi` | string | OpenAPI规范版本 |
| `info` | object | API元信息（标题、版本、描述等） |
| `paths` | object | 路径与操作定义 |
| `components` | object | 可复用的schema、参数、响应 |
| `security` | array | 全局安全声明 |
| `tags` | array | 分组标签定义 |
| `servers` | array | 服务器地址列表 |
| `externalDocs` | object | 外部文档链接 |

### FastAPI文档配置参数

创建`FastAPI`实例时，文档相关的核心参数如下：

```python
from fastapi import FastAPI

app = FastAPI(
    title="My API",                    # API标题，显示在文档顶部
    description="API描述信息",          # 支持Markdown格式的描述
    version="1.0.0",                   # API版本号
    openapi_url="/openapi.json",        # OpenAPI schema的URL路径
    docs_url="/docs",                   # Swagger UI的URL路径
    redoc_url="/redoc",                 # ReDoc的URL路径
    openapi_tags=[                      # 标签元数据，控制文档中分组的顺序和描述
        {
            "name": "users",
            "description": "用户管理相关操作",
        },
        {
            "name": "items",
            "description": "商品管理相关操作",
            "externalDocs": {
                "description": "外部文档",
                "url": "https://example.com/docs",
            },
        },
    ],
    servers=[                           # 服务器列表
        {
            "url": "https://api.example.com",
            "description": "生产环境",
        },
        {
            "url": "https://staging.example.com",
            "description": "预发布环境",
        },
        {
            "url": "http://localhost:8000",
            "description": "本地开发环境",
        },
    ],
    terms_of_service="https://example.com/terms/",
    contact={
        "name": "API Support",
        "url": "https://www.example.com/support",
        "email": "support@example.com",
    },
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0.html",
    },
)
```

### 禁用文档

在生产环境中，可能需要禁用自动文档：

```python
# 完全禁用文档
app = FastAPI(
    docs_url=None,
    redoc_url=None,
    openapi_url=None,  # 同时禁用OpenAPI schema本身
)

# 仅禁用Swagger UI，保留ReDoc
app = FastAPI(
    docs_url=None,
    redoc_url="/redoc",
)
```

### 路由操作文档注解

每个路由操作函数支持以下文档相关参数：

```python
from fastapi import APIRouter

router = APIRouter()

@router.post(
    "/items/",
    response_model=Item,                     # 响应模型
    summary="创建新商品",                       # 简短摘要
    description="在系统中创建一个新的商品记录",   # 详细描述（纯文本或Markdown）
    response_description="成功创建的商品对象",   # 响应描述
    responses={                                # 额外响应定义
        201: {"description": "商品创建成功"},
        400: {"description": "请求参数无效", "model": ErrorResponse},
        409: {"description": "商品已存在"},
    },
    deprecated=True,                          # 标记为已弃用
    tags=["items"],                            # 归属标签
    operation_id="create_item",                # 操作唯一标识符
)
async def create_item(item: Item):
    return item
```

### Pydantic模型文档定制

Pydantic v2的`model_config`支持以下文档定制选项：

```python
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

class Item(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Foo",
                    "description": "A nice item",
                    "price": 35.4,
                    "tax": 3.2,
                }
            ]
        }
    )

    name: str = Field(
        ...,                                    # 必填字段
        title="商品名称",                        # 字段标题
        description="商品的唯一名称",             # 字段描述
        min_length=1,
        max_length=100,
        examples=["Foo"],                       # 字段级示例
    )
    description: Optional[str] = Field(
        default=None,
        title="商品描述",
        description="商品的详细描述信息",
    )
    price: float = Field(
        ...,
        gt=0,
        description="商品价格，必须大于0",
        examples=[35.4],
    )
    tax: Optional[float] = Field(
        default=None,
        ge=0,
        description="税率",
    )
```

### Field的examples与json_schema_extra

Pydantic v2提供了多种设置示例的方式：

```python
from pydantic import BaseModel, Field

# 方式1：使用Field的examples参数
class Model1(BaseModel):
    name: str = Field(examples=["Alice", "Bob"])

# 方式2：使用model_config的json_schema_extra
class Model2(BaseModel):
    name: str

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"name": "Alice"},
                {"name": "Bob"},
            ]
        }
    )

# 方式3：使用model_validator动态注入（高级）
from pydantic import model_validator

class Model3(BaseModel):
    name: str

    @model_validator(mode="after")
    def set_examples(self):
        # 这里可以动态修改schema
        return self
```

---

## 36.2 原理与机制

### OpenAPI Schema生成流程

FastAPI的OpenAPI schema生成经历了多个层次的处理：

```
1. 路由注册阶段
   FastAPI.include_router() / @app.get() / @app.post()
   → 路由信息存储到 app.routes 列表（类型为 List[APIRoute]）

2. Schema组装阶段
   app.openapi() 被调用
   → 遍历 app.routes 中所有 APIRoute 实例
   → 提取每个路由的依赖、参数、请求体、响应模型
   → 生成每个操作的 JSON Schema 片段

3. Schema缓存阶段
   → 首次调用 app.openapi() 时生成并缓存
   → 后续调用直接返回缓存结果
   → 缓存存储在 app.openapi_schema 属性中

4. 渲染阶段
   Swagger UI / ReDoc 读取 /openapi.json
   → 基于schema渲染交互式文档界面
```

### FastAPI.openapi()源码级解析

FastAPI的`openapi()`方法核心逻辑：

```python
# FastAPI源码简化版
def openapi(self) -> Dict[str, Any]:
    if self.openapi_schema:
        return self.openapi_schema  # 返回缓存

    openapi_schema = get_openapi(
        title=self.title,
        version=self.version,
        openapi_version=self.openapi_version,
        summary=getattr(self, "summary", None),
        description=self.description,
        routes=self.routes,             # 所有路由
        openapi_prefix=self.openapi_prefix,
    )

    # 合并自定义的security、tags、servers
    # ...

    self.openapi_schema = openapi_schema  # 缓存
    return openapi_schema
```

`get_openapi()`函数来自`fastapi.openapi.utils`，它的核心工作：

```python
from fastapi.openapi.utils import get_openapi

def get_openapi(
    *,
    title: str,
    version: str,
    openapi_version: str = "3.1.0",
    summary: Optional[str] = None,
    description: Optional[str] = None,
    routes: Sequence[BaseRoute],
    openapi_prefix: str = "",
) -> Dict[str, Any]:
    # 1. 构建基础schema结构
    output = {
        "openapi": openapi_version,
        "info": {
            "title": title,
            "version": version,
            # ... 其他info字段
        },
        "paths": {},
        "components": {},
    }

    # 2. 遍历路由，构建paths和components
    for route in routes:
        if isinstance(route, APIRoute):
            # 解析路径参数、查询参数、请求体、响应
            # 生成对应的OpenAPI操作对象
            # 将Pydantic模型转换为JSON Schema并收集到components/schemas
            pass

    # 3. 清理空的components
    # 4. 返回完整schema
    return output
```

### 路由到Schema的映射机制

每个`APIRoute`实例包含以下影响schema生成的属性：

```python
class APIRoute(routing.Route):
    # 直接影响schema生成的属性
    name: str                          # 操作名称
    summary: Optional[str]             # 摘要
    description: Optional[str]         # 描述
    responses: Dict[int, Any]           # 响应定义
    deprecated: Optional[bool]          # 是否弃用
    operation_id: Optional[str]         # 操作ID
    tags: List[str]                     # 标签
    include_in_schema: bool             # 是否包含在schema中
    response_model: Optional[Type]       # 响应模型
    dependant: Dependant                # 依赖分析结果（核心）
```

`Dependant`对象是FastAPI依赖注入系统的核心数据结构，它通过分析函数签名收集：

```python
class Dependant:
    path_params: List[ModelField]       # 路径参数
    query_params: List[ModelField]      # 查询参数
    header_params: List[ModelField]     # 头部参数
    cookie_params: List[ModelField]     # Cookie参数
    body_params: List[ModelField]      # 请求体参数
    dependencies: List[Dependant]       # 子依赖
    name: str                           # 函数名
    call: Callable                      # 原始函数
```

### Schema缓存机制

FastAPI的OpenAPI schema在首次请求时生成并缓存。这意味着：

1. **运行时修改schema无效**：如果在应用启动后修改路由，缓存不会自动更新
2. **自定义schema的时机**：必须在`openapi_schema`属性为`None`时注入自定义逻辑

```python
# 缓存机制示意
app.openapi_schema = None  # 初始状态

@app.get("/openapi.json", include_in_schema=False)
async def custom_openapi():
    if app.openapi_schema is None:
        # 首次调用，生成schema
        app.openapi_schema = get_openapi(...)
        # 在此处可以修改schema
    return app.openapi_schema
```

### Swagger UI与ReDoc的加载机制

Swagger UI和ReDoc是纯前端应用，它们的工作方式：

```
浏览器请求 /docs
→ FastAPI返回一个HTML页面
→ HTML页面中嵌入JavaScript引用
→ JS加载后，自动请求 /openapi.json
→ 基于JSON数据渲染交互式UI
```

FastAPI默认的Swagger UI HTML模板：

```python
# fastapi/openapi/docs.py 简化
def get_swagger_ui_html(
    *,
    openapi_url: str,
    title: str,
    swagger_js_url: str = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
    swagger_css_url: str = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
) -> HTMLResponse:
    return HTMLResponse(content=f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{title}</title>
        <link rel="stylesheet" type="text/css" href="{swagger_css_url}">
    </head>
    <body>
        <div id="swagger-ui"></div>
        <script src="{swagger_js_url}"></script>
        <script>
        const ui = SwaggerUIBundle({{
            url: "{openapi_url}",
            dom_id: "#swagger-ui",
            // ...
        }})
        </script>
    </body>
    </html>
    """)
```

---

## 36.3 使用场景

### 场景1：企业级API文档规范化

在企业环境中，API文档需要统一风格、包含法务信息、联系方式等元数据。通过定制OpenAPI schema，可以确保所有微服务遵循统一的文档标准。

```python
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

app = FastAPI(
    title="Enterprise API",
    version="2.0.0",
    description="""
    # Enterprise API 文档

    本API提供企业核心业务能力。

    ## 认证方式

    所有请求需要在Header中携带 `Authorization: Bearer <token>`。

    ## 速率限制

    - 标准用户：100次/分钟
    - 高级用户：1000次/分钟

    ## 变更日志

    | 版本 | 日期 | 变更内容 |
    |------|------|----------|
    | 2.0  | 2024-01 | 全面重构 |
    | 1.5  | 2023-06 | 新增批量接口 |
    """,
    terms_of_service="https://legal.example.com/terms/",
    contact={
        "name": "API Team",
        "url": "https://wiki.example.com/api",
        "email": "api-team@example.com",
    },
    license_info={
        "name": "Proprietary",
        "url": "https://legal.example.com/license/",
    },
)
```

### 场景2：多环境文档切换

不同环境（开发、测试、生产）使用不同的服务器地址和安全配置，通过`servers`字段实现环境切换。

### 场景3：隐藏内部接口

某些内部使用的接口不应该暴露在公开文档中，使用`include_in_schema=False`隐藏。

### 场景4：API版本迁移标记

在API版本迭代中，使用`deprecated=True`标记旧接口，引导用户迁移到新版本。

### 场景5：定制品牌化文档

为Swagger UI添加公司Logo、自定义CSS样式，使其融入企业品牌体系。

---

## 36.4 示例代码

### 示例1：完整的OpenAPI Schema自定义

```python
"""
完整的OpenAPI Schema自定义示例
运行: uvicorn main:app --reload
访问: http://localhost:8000/docs
"""
from fastapi import FastAPI, HTTPException, Header, Security
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List


# ============ 模型定义 ============

class ErrorResponse(BaseModel):
    """统一错误响应模型"""
    error_code: str = Field(..., description="错误码", examples=["ERR_001"])
    message: str = Field(..., description="错误消息", examples=["Resource not found"])
    details: Optional[dict] = Field(default=None, description="错误详情")

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "error_code": "ERR_001",
                    "message": "Resource not found",
                    "details": {"resource_id": "123"},
                }
            ]
        }
    )


class ItemCreate(BaseModel):
    """创建商品请求模型"""
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        title="商品名称",
        description="商品的唯一名称",
        examples=["MacBook Pro"],
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        description="商品描述",
        examples=["苹果笔记本电脑"],
    )
    price: float = Field(
        ...,
        gt=0,
        description="商品价格（元）",
        examples=[12999.0],
    )
    category: str = Field(
        ...,
        description="商品分类",
        examples=["electronics"],
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "MacBook Pro",
                    "description": "14英寸苹果笔记本电脑",
                    "price": 12999.0,
                    "category": "electronics",
                }
            ]
        }
    )


class ItemResponse(BaseModel):
    """商品响应模型"""
    id: int = Field(..., description="商品ID", examples=[1])
    name: str = Field(..., description="商品名称", examples=["MacBook Pro"])
    description: Optional[str] = Field(default=None, description="商品描述")
    price: float = Field(..., description="商品价格", examples=[12999.0])
    category: str = Field(..., description="商品分类", examples=["electronics"])

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "id": 1,
                    "name": "MacBook Pro",
                    "description": "14英寸苹果笔记本电脑",
                    "price": 12999.0,
                    "category": "electronics",
                }
            ]
        }
    )


# ============ 安全方案 ============

security_scheme = HTTPBearer()


# ============ 应用实例 ============

app = FastAPI(
    title="商品管理API",
    version="2.0.0",
    description="""
    # 商品管理API文档

    本API提供商品的增删改查功能。

    ## 认证

    所有接口均需要Bearer Token认证。

    ## 速率限制

    - 标准用户：100次/分钟
    - 高级用户：1000次/分钟
    """,
    openapi_tags=[
        {
            "name": "items",
            "description": "商品管理操作",
        },
        {
            "name": "health",
            "description": "健康检查",
        },
    ],
    servers=[
        {"url": "https://api.example.com", "description": "生产环境"},
        {"url": "https://staging.example.com", "description": "预发布环境"},
        {"url": "http://localhost:8000", "description": "本地开发"},
    ],
)


# ============ 自定义OpenAPI Schema ============

def custom_openapi():
    """自定义OpenAPI Schema生成逻辑"""
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version="3.1.0",
        summary="商品管理系统RESTful API",
        description=app.description,
        routes=app.routes,
    )

    # 添加全局安全方案
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "输入JWT Token，无需添加Bearer前缀",
        }
    }

    # 设置全局安全要求（所有接口默认需要认证）
    openapi_schema["security"] = [{"BearerAuth": []}]

    # 为特定路径添加x-custom扩展字段
    for path, path_item in openapi_schema.get("paths", {}).items():
        for method, operation in path_item.items():
            if isinstance(operation, dict):
                operation["x-custom-id"] = f"{method}_{path.replace('/', '_')}"

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


# ============ 路由定义 ============

@app.get(
    "/health",
    tags=["health"],
    summary="健康检查",
    description="检查服务是否正常运行",
    include_in_schema=True,
)
async def health_check():
    """内部接口不在公开文档中显示"""
    return {"status": "ok"}


@app.post(
    "/items/",
    response_model=ItemResponse,
    status_code=201,
    tags=["items"],
    summary="创建商品",
    description="创建一个新的商品记录",
    response_description="成功创建的商品信息",
    responses={
        400: {
            "description": "请求参数错误",
            "model": ErrorResponse,
        },
        409: {
            "description": "商品名称已存在",
            "model": ErrorResponse,
        },
    },
)
async def create_item(
    item: ItemCreate,
    credentials: HTTPAuthorizationCredentials = Security(security_scheme),
):
    """创建新商品"""
    # 模拟创建逻辑
    return ItemResponse(
        id=1,
        name=item.name,
        description=item.description,
        price=item.price,
        category=item.category,
    )


@app.get(
    "/items/{item_id}",
    response_model=ItemResponse,
    tags=["items"],
    summary="获取商品详情",
    responses={
        404: {
            "description": "商品不存在",
            "model": ErrorResponse,
        },
    },
)
async def get_item(
    item_id: int,
    credentials: HTTPAuthorizationCredentials = Security(security_scheme),
):
    """根据ID获取商品详情"""
    if item_id != 1:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemResponse(
        id=item_id,
        name="MacBook Pro",
        description="14英寸苹果笔记本电脑",
        price=12999.0,
        category="electronics",
    )


@app.put(
    "/items/{item_id}",
    response_model=ItemResponse,
    tags=["items"],
    summary="更新商品",
    deprecated=True,
    description="此接口已弃用，请使用PATCH进行部分更新",
    responses={
        404: {"description": "商品不存在", "model": ErrorResponse},
    },
)
async def update_item(
    item_id: int,
    item: ItemCreate,
    credentials: HTTPAuthorizationCredentials = Security(security_scheme),
):
    """更新商品（已弃用）"""
    return ItemResponse(
        id=item_id,
        name=item.name,
        description=item.description,
        price=item.price,
        category=item.category,
    )


@app.get(
    "/items/",
    response_model=List[ItemResponse],
    tags=["items"],
    summary="获取商品列表",
)
async def list_items(
    skip: int = Field(default=0, ge=0, description="跳过记录数"),
    limit: int = Field(default=10, ge=1, le=100, description="返回记录数上限"),
    credentials: HTTPAuthorizationCredentials = Security(security_scheme),
):
    """获取商品列表，支持分页"""
    return [
        ItemResponse(
            id=1,
            name="MacBook Pro",
            description="14英寸苹果笔记本电脑",
            price=12999.0,
            category="electronics",
        )
    ]


# ============ 运行入口 ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 示例2：自定义Swagger UI与ReDoc

```python
"""
自定义文档UI示例 - 品牌化Swagger UI与ReDoc
运行: uvicorn main:app --reload
"""
from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.responses import HTMLResponse
from pydantic import BaseModel


app = FastAPI(
    title="品牌化API文档",
    docs_url=None,   # 禁用默认Swagger UI
    redoc_url=None,  # 禁用默认ReDoc
)


class Item(BaseModel):
    name: str
    price: float


@app.get("/items/", tags=["items"])
async def list_items():
    return [{"name": "Item1", "price": 10.0}]


# ============ 自定义Swagger UI路由 ============

@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    """完全自定义的Swagger UI页面"""
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Swagger UI",
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
        # 自定义Favicon
        swagger_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
    )


# 带自定义CSS的Swagger UI
CUSTOM_SWAGGER_CSS = """
<style>
    /* 自定义顶部栏颜色 */
    .swagger-ui .topbar {
        background-color: #1a1a2e;
    }
    /* 自定义Logo区域 */
    .swagger-ui .topbar-wrapper .link::after {
        content: "My Company API";
        color: #e94560;
        font-size: 1.5em;
        font-weight: bold;
    }
    /* 自定义按钮颜色 */
    .swagger-ui .btn.authorize {
        background-color: #0f3460;
        border-color: #0f3460;
    }
    .swagger-ui .btn.execute {
        background-color: #e94560;
        border-color: #e94560;
    }
    /* 自定义字体 */
    .swagger-ui {
        font-family: 'Microsoft YaHei', sans-serif;
    }
    /* Try-it-out区域样式 */
    .swagger-ui .opblock.opblock-post {
        border-color: #49cc90;
        background: rgba(73, 204, 144, 0.1);
    }
</style>
"""


@app.get("/docs-branded", include_in_schema=False)
async def branded_swagger_ui():
    """品牌化Swagger UI页面"""
    html = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title="品牌化API文档",
    )
    # 注入自定义CSS
    content = html.body.decode("utf-8")
    content = content.replace("</head>", f"{CUSTOM_SWAGGER_CSS}</head>")
    return HTMLResponse(content=content)


# ============ 自定义ReDoc路由 ============

@app.get("/redoc", include_in_schema=False)
async def custom_redoc_html():
    """自定义ReDoc页面"""
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - ReDoc",
        redoc_js_url="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js",
        # 自定义Favicon
        redoc_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
    )


# 带自定义配置的ReDoc
CUSTOM_REDOC_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>{title}</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{
            margin: 0;
            padding: 0;
        }}
    </style>
</head>
<body>
    <redoc spec-url='{openapi_url}'
           scroll-y-offset="nav"
           hide-hostname="true"
           hide-download-button="false"
           expand-responses="200"
           required-props-first="true"
           sort-props-alphabetically="true"
           theme='{{
               "colors": {{
                   "primary": {{
                       "main": "#e94560"
                   }}
               }},
               "sidebar": {{
                   "backgroundColor": "#1a1a2e",
                   "textColor": "#ffffff"
               }},
               "typography": {{
                   "fontSize": "14px",
                   "fontFamily": "Microsoft YaHei, sans-serif"
               }}
           }}'>
    </redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>
"""


@app.get("/redoc-branded", include_in_schema=False)
async def branded_redoc():
    """品牌化ReDoc页面"""
    html = CUSTOM_REDOC_HTML.format(
        title="品牌化API文档 - ReDoc",
        openapi_url=app.openapi_url,
    )
    return HTMLResponse(content=html)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 示例3：动态OpenAPI Schema修改

```python
"""
动态修改OpenAPI Schema示例
运行: uvicorn main:app --reload
"""
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel
from typing import Dict, Any


app = FastAPI(title="动态Schema API")


class Item(BaseModel):
    name: str
    price: float


@app.get("/items/", tags=["items"])
async def list_items():
    return []


@app.post("/items/", tags=["items"])
async def create_item(item: Item):
    return item


@app.get("/internal/metrics", include_in_schema=False)
async def metrics():
    """内部监控接口，不出现在文档中"""
    return {"requests": 0}


def customize_openapi() -> Dict[str, Any]:
    """深度定制OpenAPI Schema"""
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version="1.0.0",
        routes=app.routes,
    )

    # 1. 添加全局安全方案
    openapi_schema.setdefault("components", {}).setdefault("securitySchemes", {})
    openapi_schema["components"]["securitySchemes"]["ApiKeyAuth"] = {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
    }

    # 默认不全局应用安全要求，让每个接口自行声明

    # 2. 为所有操作添加x-internal扩展标记
    paths = openapi_schema.get("paths", {})
    for path, methods in paths.items():
        for method, operation in methods.items():
            if isinstance(operation, dict) and method in ("get", "post", "put", "delete", "patch"):
                # 添加操作级别的扩展字段
                operation["x-order"] = {"get": 1, "post": 2, "put": 3, "delete": 4}.get(method, 99)

                # 为POST操作添加安全要求
                if method == "post":
                    operation.setdefault("security", []).append({"ApiKeyAuth": []})

    # 3. 修改schema中的模型定义
    schemas = openapi_schema.get("components", {}).get("schemas", {})
    if "Item" in schemas:
        # 添加自定义字段描述
        schemas["Item"]["x-model-gen"] = {
            "package": "com.example.models",
            "class_name": "ItemDTO",
        }

    # 4. 添加外部文档链接
    openapi_schema["externalDocs"] = {
        "description": "更多API文档请访问Wiki",
        "url": "https://wiki.example.com/api",
    }

    # 5. 添加x-tagGroups用于ReDoc分组
    openapi_schema["x-tagGroups"] = [
        {
            "name": "核心功能",
            "tags": ["items"],
        },
    ]

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = customize_openapi


# ============ 验证端点 ============

@app.get("/schema-info", include_in_schema=False)
async def schema_info():
    """查看当前schema信息"""
    schema = app.openapi()
    return {
        "openapi_version": schema.get("openapi"),
        "title": schema.get("info", {}).get("title"),
        "path_count": len(schema.get("paths", {})),
        "schema_count": len(schema.get("components", {}).get("schemas", {})),
        "security_schemes": list(schema.get("components", {}).get("securitySchemes", {}).keys()),
        "tag_groups": schema.get("x-tagGroups", []),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 示例4：多版本API文档管理

```python
"""
多版本API文档管理示例
运行: uvicorn main:app --reload
"""
from fastapi import FastAPI, APIRouter, Depends
from pydantic import BaseModel
from typing import Dict, Any


class ItemV1(BaseModel):
    name: str
    price: float


class ItemV2(BaseModel):
    name: str
    price: float
    currency: str = "CNY"


# ============ V1 应用 ============

app_v1 = FastAPI(
    title="商品API",
    version="1.0.0",
    description="API版本1 - 基础功能",
    openapi_url="/v1/openapi.json",
    docs_url="/v1/docs",
    redoc_url="/v1/redoc",
)


@app_v1.get("/items/", tags=["items"])
async def list_items_v1():
    return [{"name": "Item1", "price": 10.0}]


@app_v1.post("/items/", tags=["items"])
async def create_item_v1(item: ItemV1):
    return item


# ============ V2 应用 ============

app_v2 = FastAPI(
    title="商品API",
    version="2.0.0",
    description="API版本2 - 新增货币支持",
    openapi_url="/v2/openapi.json",
    docs_url="/v2/docs",
    redoc_url="/v2/redoc",
)


@app_v2.get("/items/", tags=["items"])
async def list_items_v2():
    return [{"name": "Item1", "price": 10.0, "currency": "CNY"}]


@app_v2.post("/items/", tags=["items"])
async def create_item_v2(item: ItemV2):
    return item


# ============ 主应用（聚合两个版本） ============

main_app = FastAPI(
    title="商品API Gateway",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

main_app.mount("/v1", app_v1)
main_app.mount("/v2", app_v2)


@main_app.get("/", include_in_schema=False)
async def root():
    return {
        "versions": {
            "v1": {
                "docs": "/v1/docs",
                "openapi": "/v1/openapi.json",
            },
            "v2": {
                "docs": "/v2/docs",
                "openapi": "/v2/openapi.json",
            },
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:main_app", host="0.0.0.0", port=8000)
```

### 示例5：条件性文档暴露

```python
"""
基于环境变量控制文档可见性
运行: ENABLE_DOCS=true uvicorn main:app --reload
"""
import os
from fastapi import FastAPI, Request
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel


ENABLE_DOCS = os.getenv("ENABLE_DOCS", "false").lower() == "true"

app = FastAPI(
    title="条件性文档API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None if not ENABLE_DOCS else "/openapi.json",
)


class Item(BaseModel):
    name: str
    price: float


@app.get("/items/")
async def list_items():
    return []


if ENABLE_DOCS:
    @app.get("/docs", include_in_schema=False)
    async def swagger_ui():
        return get_swagger_ui_html(
            openapi_url="/openapi.json",
            title=app.title,
        )

    @app.get("/redoc", include_in_schema=False)
    async def redoc():
        return get_redoc_html(
            openapi_url="/openapi.json",
            title=app.title,
        )

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_schema():
        return JSONResponse(app.openapi())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 36.5 常见陷阱与最佳实践

### 陷阱1：Schema缓存导致修改无效

**问题**：在应用启动后调用`app.openapi()`修改schema，但修改不会生效。

**原因**：FastAPI缓存了首次生成的schema，后续调用直接返回缓存。

**解决方案**：在自定义`openapi`函数内部检查缓存状态。

```python
# 错误做法：在启动后直接修改
app.openapi_schema["info"]["title"] = "New Title"  # 可能KeyError或无效

# 正确做法：覆盖openapi方法
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    schema["info"]["title"] = "New Title"  # 在生成时修改
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi
```

### 陷阱2：include_in_schema=False仍然被依赖分析

**问题**：使用`include_in_schema=False`的路由虽然不出现在文档中，但其依赖项仍会影响其他路由的schema生成。

**解决方案**：将内部接口的依赖声明在独立函数中，避免与文档化的路由共享依赖。

### 陷阱3：Pydantic v2的example与examples混淆

**问题**：Pydantic v2中`example`（单数）已废弃，应使用`examples`（复数）。混用会导致schema不一致。

```python
# Pydantic v2 错误写法
name: str = Field(example="Alice")  # 已废弃，但仍可用

# Pydantic v2 正确写法
name: str = Field(examples=["Alice", "Bob"])  # 推荐
```

### 陷阱4：自定义docs_url导致静态资源加载失败

**问题**：在离线环境或内网中，Swagger UI的JS/CSS从CDN加载会失败。

**解决方案**：将静态资源下载到本地，使用静态文件服务。

```python
from fastapi.staticfiles import StaticFiles

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/docs", include_in_schema=False)
async def custom_docs():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=app.title,
        swagger_js_url="/static/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui.css",
    )
```

### 陷阱5：response_model覆盖了responses中的schema

**问题**：同时定义`response_model`和`responses`字典时，`response_model`会覆盖200响应的定义。

```python
# response_model会自动设置200响应
@app.get("/items/{item_id}", response_model=ItemResponse)
async def get_item(item_id: int):
    pass

# 如果在responses中也定义了200，需要注意合并方式
@app.get(
    "/items/{item_id}",
    response_model=ItemResponse,
    responses={
        200: {"description": "成功"},  # 这里的description会与response_model合并
        404: {"description": "未找到", "model": ErrorResponse},
    },
)
async def get_item(item_id: int):
    pass
```

### 最佳实践1：统一错误响应模型

为所有接口定义统一的错误响应模型，并在`responses`中引用：

```python
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from typing import Dict

# 定义标准错误响应
STANDARD_ERRORS = {
    400: {"description": "请求参数无效"},
    401: {"description": "未认证"},
    403: {"description": "无权限"},
    500: {"description": "服务器内部错误"},
}

@app.get("/items/")
async def list_items():
    pass

# 或在自定义openapi中全局注入
def inject_standard_errors(schema: Dict) -> Dict:
    for path in schema.get("paths", {}).values():
        for method in path.values():
            if isinstance(method, dict):
                for status_code, error_def in STANDARD_ERRORS.items():
                    if str(status_code) not in method.get("responses", {}):
                        method.setdefault("responses", {})[str(status_code)] = error_def
    return schema
```

### 最佳实践2：使用operation_id生成客户端代码

为每个操作设置唯一的`operation_id`，以便代码生成器（如openapi-generator）生成一致的方法名：

```python
@app.get("/items/", operation_id="list_items")
async def list_items():
    pass

@app.get("/items/{item_id}", operation_id="get_item_by_id")
async def get_item(item_id: int):
    pass

@app.post("/items/", operation_id="create_item")
async def create_item(item: ItemCreate):
    pass
```

### 最佳实践3：生产环境禁用文档

```python
import os

ENV = os.getenv("ENVIRONMENT", "development")

app = FastAPI(
    title="My API",
    docs_url="/docs" if ENV != "production" else None,
    redoc_url="/redoc" if ENV != "production" else None,
    openapi_url="/openapi.json" if ENV != "production" else None,
)
```

### 最佳实践4：Markdown丰富描述内容

利用OpenAPI 3.1支持Markdown的特性，在description中使用表格、代码块、链接等丰富内容：

```python
app = FastAPI(
    description="""
    # API概述

    ## 认证方式

    ```http
    Authorization: Bearer <jwt_token>
    ```

    ## 错误码对照表

    | 错误码 | 说明 | 处理建议 |
    |--------|------|----------|
    | ERR_001 | 参数无效 | 检查请求参数 |
    | ERR_002 | 未认证 | 检查Token |
    | ERR_003 | 权限不足 | 联系管理员 |

    > **注意**：所有时间戳均为UTC格式。
    """,
)
```

### 最佳实践5：使用x-扩展字段传递元数据

OpenAPI规范允许使用`x-`前缀的自定义扩展字段，用于传递代码生成、监控等额外元数据：

```python
def custom_openapi():
    schema = get_openapi(...)
    # 为特定操作添加x-rate-limit扩展
    for path, methods in schema.get("paths", {}).items():
        for method, operation in methods.items():
            if isinstance(operation, dict):
                operation["x-rate-limit"] = {
                    "requests": 100,
                    "period": "minute",
                }
    return schema
```

### 最佳实践6：Schema版本兼容性管理

当API版本升级导致schema不兼容时，使用独立的OpenAPI URL：

```python
app = FastAPI(
    openapi_url="/openapi.json",    # 当前版本
)

# 同时提供历史版本的schema
@app.get("/openapi/v1.json", include_in_schema=False)
async def openapi_v1():
    return JSONResponse(V1_SCHEMA)  # 预生成的v1 schema
```