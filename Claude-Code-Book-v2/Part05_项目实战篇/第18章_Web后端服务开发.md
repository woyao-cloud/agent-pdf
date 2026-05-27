# 第18章：Web 后端服务开发

## 章节概述

本章通过开发一个待办事项（Todo）API 服务项目，展示如何使用 Claude Code 进行后端 Web 开发。你将学会从 API 设计、项目搭建、数据库集成到安全部署的完整流程。我们使用 FastAPI（Python）作为主要技术栈，因为它兼具高性能、自动生成 API 文档、类型安全等优点，与 Claude Code 的能力高度匹配。

## 学习目标

- 掌握使用 Claude Code 搭建 Web 后端服务的方法
- 学会 API 设计和路由组织
- 理解数据库集成和数据模型设计
- 能够实现完整的错误处理和中间件

## 核心知识点

### 1. 项目搭建

#### 框架选择：为什么选 FastAPI

FastAPI 是开发异步 Web API 的现代 Python 框架，其核心优势包括：

- **自动生成 OpenAPI 文档**：基于 Python 类型注解自动生成 Swagger UI 和 ReDoc，无需手动编写文档
- **请求验证**：使用 Pydantic 模型自动验证请求体，类型安全且错误信息清晰
- **异步支持**：原生支持 async/await，适合 I/O 密集型操作（数据库查询、外部 API 调用）
- **高性能**：基于 Starlette，性能接近 Node.js 和 Go

向 Claude Code 发起项目初始化：

```
/start 我需要创建一个 Todo API 后端服务，使用 FastAPI + SQLAlchemy + SQLite。
功能包括：
1. 创建待办事项（标题、描述、截止日期、优先级）
2. 列出待办事项（支持分页、筛选、排序）
3. 获取单个待办事项详情
4. 更新待办事项（支持部分更新）
5. 删除待办事项（软删除）
6. 标记完成/未完成
请帮我创建整个项目，使用清晰的目录结构。
```

#### 项目结构组织

Claude Code 生成的推荐结构：

```
todo-api/
├── app/
│   ├── __init__.py
│   ├── main.py              # 应用入口
│   ├── config.py            # 配置管理
│   ├── database.py          # 数据库连接
│   ├── models/
│   │   ├── __init__.py
│   │   └── todo.py          # SQLAlchemy 模型
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── todo.py          # Pydantic 模式
│   ├── routers/
│   │   ├── __init__.py
│   │   └── todos.py         # API 路由
│   └── services/
│       ├── __init__.py
│       └── todo_service.py  # 业务逻辑
├── tests/
│   ├── test_todos.py
│   └── conftest.py          # 测试夹具
├── requirements.txt
├── alembic.ini              # 数据库迁移
└── .env                     # 环境变量
```

这种分层架构的好处：路由层只处理 HTTP 请求/响应，服务层封装业务逻辑，模型层定义数据结构，各层职责单一，便于测试和修改。

#### 配置管理

使用 Pydantic 的 `BaseSettings` 管理配置，支持从环境变量、`.env` 文件加载：

```python
# app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Todo API"
    database_url: str = "sqlite:///./todos.db"
    debug: bool = False
    api_prefix: str = "/api/v1"
    page_size: int = 20

    class Config:
        env_file = ".env"

settings = Settings()
```

#### 数据库连接与模型

```python
# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}  # SQLite 专用
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    """Dependency: get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

使用 `get_db` 作为 FastAPI 依赖项，每次请求获取一个新的数据库会话，请求结束后自动关闭。这种模式避免了连接泄漏。

### 2. API 设计与实现

#### RESTful API 设计原则

Todo API 遵循 RESTful 设计规范：

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/v1/todos` | 列出待办事项 |
| POST | `/api/v1/todos` | 创建待办事项 |
| GET | `/api/v1/todos/{id}` | 获取单个详情 |
| PUT | `/api/v1/todos/{id}` | 全量更新 |
| PATCH | `/api/v1/todos/{id}` | 部分更新 |
| DELETE | `/api/v1/todos/{id}` | 删除 |
| PATCH | `/api/v1/todos/{id}/toggle` | 切换完成状态 |

关键原则：
- **使用名词复数作为资源路径**：`/todos` 而非 `/todo` 或 `/getTodos`
- **HTTP 方法表示操作类型**：GET 查、POST 增、PUT/PATCH 改、DELETE 删
- **PUT vs PATCH**：PUT 替换整个资源，PATCH 只更新提供的字段
- **版本控制**：通过 URL 前缀 `/api/v1/` 管理 API 版本

#### 路由和端点定义

```python
# app/routers/todos.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..schemas.todo import (
    TodoCreate, TodoUpdate, TodoResponse, TodoListResponse
)
from ..services.todo_service import TodoService

router = APIRouter(prefix="/api/v1/todos", tags=["todos"])

@router.get("", response_model=TodoListResponse)
def list_todos(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    completed: Optional[bool] = Query(None, description="Filter by status"),
    priority: Optional[int] = Query(None, ge=1, le=3, description="Filter by priority"),
    search: Optional[str] = Query(None, description="Search in title/description"),
    sort_by: Optional[str] = Query("created_at", regex="^(created_at|updated_at|priority|due_date)$"),
    sort_order: Optional[str] = Query("desc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    """List todos with pagination, filtering, and sorting"""
    service = TodoService(db)
    items, total = service.list_todos(
        page=page, page_size=page_size,
        completed=completed, priority=priority,
        search=search, sort_by=sort_by, sort_order=sort_order,
    )
    return TodoListResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=(total + page_size - 1) // page_size,
    )

@router.post("", response_model=TodoResponse, status_code=status.HTTP_201_CREATED)
def create_todo(todo: TodoCreate, db: Session = Depends(get_db)):
    """Create a new todo item"""
    service = TodoService(db)
    return service.create_todo(todo)

@router.get("/{todo_id}", response_model=TodoResponse)
def get_todo(todo_id: int, db: Session = Depends(get_db)):
    """Get a specific todo by ID"""
    service = TodoService(db)
    todo = service.get_todo(todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo

@router.put("/{todo_id}", response_model=TodoResponse)
def update_todo(todo_id: int, todo: TodoCreate, db: Session = Depends(get_db)):
    """Full update of a todo item"""
    service = TodoService(db)
    updated = service.update_todo(todo_id, todo)
    if not updated:
        raise HTTPException(status_code=404, detail="Todo not found")
    return updated

@router.patch("/{todo_id}", response_model=TodoResponse)
def partial_update_todo(todo_id: int, todo: TodoUpdate, db: Session = Depends(get_db)):
    """Partial update of a todo item"""
    service = TodoService(db)
    updated = service.partial_update_todo(todo_id, todo)
    if not updated:
        raise HTTPException(status_code=404, detail="Todo not found")
    return updated

@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    """Soft delete a todo item"""
    service = TodoService(db)
    deleted = service.delete_todo(todo_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Todo not found")
    return None

@router.patch("/{todo_id}/toggle", response_model=TodoResponse)
def toggle_todo(todo_id: int, db: Session = Depends(get_db)):
    """Toggle completed status"""
    service = TodoService(db)
    todo = service.toggle_todo(todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo
```

**Claude Code 提示示例：**

```
请为名单添加批量删除端点 DELETE /api/v1/todos/batch，
接收 JSON 格式的 ID 列表 {"ids": [1, 2, 3]}。
```

#### Pydantic 模式定义

Pydantic 模型承担双重职责：请求体验证和响应序列化。

```python
# app/schemas/todo.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class TodoBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Todo title")
    description: Optional[str] = Field(None, max_length=2000, description="Detailed description")
    priority: int = Field(2, ge=1, le=3, description="Priority: 1=High, 2=Medium, 3=Low")
    due_date: Optional[datetime] = Field(None, description="Due date")

class TodoCreate(TodoBase):
    pass

class TodoUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    priority: Optional[int] = Field(None, ge=1, le=3)
    due_date: Optional[datetime] = Field(None)
    completed: Optional[bool] = Field(None)

class TodoResponse(TodoBase):
    id: int
    completed: bool
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]

    class Config:
        from_attributes = True

class TodoListResponse(BaseModel):
    items: list[TodoResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
```

- `TodoCreate` 用于创建时的请求体验证，所有字段必填
- `TodoUpdate` 用于部分更新，所有字段可选，这正是 PATCH 和 PUT 的区别
- `TodoResponse` 包含所有数据库字段，`from_attributes = True` 表示可以直接从 SQLAlchemy 模型实例化

### 3. 数据库集成

#### SQLAlchemy 数据模型

```python
# app/models/todo.py
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, SmallInteger
from sqlalchemy.sql import func

from ..database import Base

class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(SmallInteger, default=2, comment="1=High, 2=Medium, 3=Low")
    completed = Column(Boolean, default=False)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete
```

使用 `deleted_at` 字段实现软删除：删除操作只设置时间戳而非真正删除记录。所有查询默认加上 `WHERE deleted_at IS NULL` 条件。

#### 服务层实现

将业务逻辑从路由层分离到服务层，便于单元测试：

```python
# app/services/todo_service.py
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from datetime import datetime

from ..models.todo import Todo
from ..schemas.todo import TodoCreate, TodoUpdate

class TodoService:
    def __init__(self, db: Session):
        self.db = db

    def list_todos(self, page: int, page_size: int, **filters):
        query = self.db.query(Todo).filter(Todo.deleted_at.is_(None))

        if filters.get("completed") is not None:
            query = query.filter(Todo.completed == filters["completed"])
        if filters.get("priority"):
            query = query.filter(Todo.priority == filters["priority"])
        if filters.get("search"):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                Todo.title.ilike(search_term) | Todo.description.ilike(search_term)
            )

        sort_column = getattr(Todo, filters.get("sort_by", "created_at"))
        order_func = desc if filters.get("sort_order", "desc") == "desc" else asc
        query = query.order_by(order_func(sort_column))

        total = query.count()
        items = query.offset((page - 1) * page_size).limit(page_size).all()
        return items, total

    def create_todo(self, data: TodoCreate) -> Todo:
        todo = Todo(**data.model_dump())
        self.db.add(todo)
        self.db.commit()
        self.db.refresh(todo)
        return todo

    def get_todo(self, todo_id: int) -> Todo | None:
        return self.db.query(Todo).filter(
            Todo.id == todo_id, Todo.deleted_at.is_(None)
        ).first()

    def update_todo(self, todo_id: int, data: TodoCreate) -> Todo | None:
        todo = self.get_todo(todo_id)
        if not todo:
            return None
        for key, value in data.model_dump().items():
            setattr(todo, key, value)
        self.db.commit()
        self.db.refresh(todo)
        return todo

    def partial_update_todo(self, todo_id: int, data: TodoUpdate) -> Todo | None:
        todo = self.get_todo(todo_id)
        if not todo:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
            if key == "completed" and value:
                todo.completed_at = datetime.now()
            elif key == "completed" and not value:
                todo.completed_at = None
            setattr(todo, key, value)
        self.db.commit()
        self.db.refresh(todo)
        return todo

    def delete_todo(self, todo_id: int) -> bool:
        todo = self.get_todo(todo_id)
        if not todo:
            return False
        todo.deleted_at = datetime.now()
        self.db.commit()
        return True

    def toggle_todo(self, todo_id: int) -> Todo | None:
        todo = self.get_todo(todo_id)
        if not todo:
            return None
        todo.completed = not todo.completed
        todo.completed_at = datetime.now() if todo.completed else None
        self.db.commit()
        self.db.refresh(todo)
        return todo
```

`exclude_unset=True` 是关键细节：只更新客户端实际发送的字段，未提供的字段保持不变。

#### 数据库迁移

使用 Alembic 管理数据库迁移：

```
请帮我配置 Alembic 并生成初始迁移，
然后添加一个 category 字段到 Todo 模型。
```

Claude Code 会生成迁移文件并解释如何执行：

```bash
# 生成迁移
alembic revision --autogenerate -m "add_category_to_todo"

# 应用迁移
alembic upgrade head

# 回滚
alembic downgrade -1
```

### 4. 安全与部署

#### 应用入口与中间件

```python
# app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from .config import settings
from .database import engine, Base
from .routers import todos

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: cleanup if needed

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )

# Register routers
app.include_router(todos.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
```

#### 启动与测试

```bash
# 安装依赖
pip install fastapi uvicorn sqlalchemy pydantic-settings

# 启动开发服务器
uvicorn app.main:app --reload --port 8000
```

启动后访问：
- API: `http://localhost:8000/api/v1/todos`
- Swagger 文档: `http://localhost:8000/docs`
- ReDoc 文档: `http://localhost:8000/redoc`

**自动生成的文档界面描述**：Swagger UI 页面左侧显示所有可用的 API 端点（GET、POST、PUT、PATCH、DELETE），每个端点都标注了请求参数、请求体 JSON Schema 和响应格式。右侧有 "Try it out" 按钮，点击后可以直接在页面中发送请求测试 API，无需使用 curl 或 Postman。这是 FastAPI 相比 Flask 等框架最大的开发体验优势。

#### 部署准备

Dockerfile 用于容器化部署：

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

使用 Gunicorn + Uvicorn 实现生产级部署（多工作进程）：

```bash
pip install gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000
```

## 实战练习

### 完整项目步骤

**步骤 1**: 与 Claude Code 对话初始化项目

```
请帮我用 FastAPI 创建一个 Todo API 项目，
项目名为 todo-api，包含完整的 CRUD、软删除、分页筛选功能。
```

**步骤 2**: 创建测试数据并验证 API

```bash
# 启动服务
uvicorn app.main:app --reload

# 创建待办事项
curl -X POST http://localhost:8000/api/v1/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "完成第18章写作", "priority": 1, "due_date": "2025-06-01T00:00:00"}'

# 创建多个条目
curl -X POST http://localhost:8000/api/v1/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "阅读 FastAPI 文档", "priority": 2}'

curl -X POST http://localhost:8000/api/v1/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "练习 SQLAlchemy 查询", "priority": 3}'

# 列出所有（带分页）
curl "http://localhost:8000/api/v1/todos?page=1&page_size=10"

# 按优先级筛选
curl "http://localhost:8000/api/v1/todos?priority=1"

# 搜索
curl "http://localhost:8000/api/v1/todos?search=FastAPI"

# 获取单个
curl http://localhost:8000/api/v1/todos/1

# 部分更新
curl -X PATCH http://localhost:8000/api/v1/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"priority": 2}'

# 切换完成状态
curl -X PATCH http://localhost:8000/api/v1/todos/1/toggle

# 删除（软删除）
curl -X DELETE http://localhost:8000/api/v1/todos/2
```

**步骤 3**: 在 Swagger UI 中测试

打开浏览器访问 `http://localhost:8000/docs`，交互式测试每个端点。你也可以要求 Claude Code 为每个端点添加更多详细信息：

```
请为所有 Todo API 端点添加更详细的 description 和 summary，
包括响应的示例值，这样 Swagger UI 文档会更完善。
```

**步骤 4**: 编写测试

```
请为 Todo API 编写 pytest 测试，包括：
1. 创建待办事项测试
2. 列表分页测试
3. 更新和删除测试
4. 搜索和筛选测试
5. 软删除后不可见测试
使用 FastAPI 的 TestClient。
```

## 本章小结

1. **分层架构是后端项目的基石**：路由层（Routers）→ 服务层（Services）→ 数据层（Models），每层职责单一，便于测试和修改。不要在路由函数中直接操作数据库。

2. **FastAPI 的类型系统贯穿全栈**：Pydantic 模型同时负责请求验证、响应序列化和 OpenAPI 文档生成，一次定义多处使用。类型注解不仅是文档，更是运行时验证。

3. **RESTful 设计遵循资源导向**：URL 表示资源，HTTP 方法表示操作。一致性比灵活性更重要——所有列表接口统一使用分页参数，所有错误响应统一格式。

4. **软删除比物理删除更安全**：使用 `deleted_at` 字段标记删除而非 DELETE FROM，可以轻松实现"回收站"功能和数据恢复。所有查询默认过滤已删除记录。

5. **自动文档是 FastAPI 的核心优势**：Swagger UI 不仅用于查看文档，更是交互式测试工具。开发时可以大幅减少使用 curl/Postman 的频率。

6. **从开发到生产的平滑过渡**：SQLite 适合开发，PostgreSQL/MySQL 适合生产，切换只需修改 `database_url` 配置。Uvicorn 开发，Gunicorn+Uvicorn 生产，配置方式基本一致。

## 思考题

1. **API 设计中如何平衡灵活性和简洁性？**
   - **提示**: 灵活性体现在查询参数（筛选、排序、分页）和部分更新（PATCH），简洁性体现在端点数量（不要为每个变体创建单独端点）和默认值（合理的默认行为）。参考 Google API Design Guide：使用查询参数而非路径参数控制行为，为每个资源提供统一的标准字段（created_at、updated_at），使用 `fields` 参数允许客户端选择返回字段。

2. **Web 后端开发中最常见的安全漏洞有哪些？**
   - **提示**: OWASP Top 10 排名靠前的包括：(1) SQL 注入——始终使用 ORM 参数化查询而非拼接 SQL；(2) 认证失效——Token 过期机制、密码强度、暴力破解防护；(3) 敏感数据泄露——HTTPS 传输、不在日志中记录密码/Token；(4) 越权访问——每个端点验证用户是否有权操作该资源；(5) 输入验证不足——对用户输入的长度、格式、范围做严格校验。Claude Code 可以帮助进行安全代码审查（提示："请审查这个端点的安全性，检查是否有越权风险"）。