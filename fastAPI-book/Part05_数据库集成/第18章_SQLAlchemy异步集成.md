# 第18章 SQLAlchemy异步集成

## 18.1 概念与语法

### 18.1.1 异步数据库编程的必要性

在传统的同步数据库访问模型中，每个数据库操作都会阻塞当前线程，等待 I/O 响应。对于一个典型的 Web 应用，一次请求可能涉及多次数据库查询（认证、授权、数据读取、日志写入等），如果这些操作串行阻塞，线程在 I/O 等待期间完全空闲，却占用着系统资源。

FastAPI 基于 Starlette 的 ASGI 事件循环运行，天生支持 `async/await` 语法。当我们在 FastAPI 的异步路径函数中调用同步数据库操作时，会发生两种严重问题：

1. **事件循环阻塞**：同步 I/O 调用会阻塞整个事件循环，所有协程都无法推进
2. **吞吐量塌缩**：在高并发场景下，少数慢查询就能拖垮整个服务的响应能力

SQLAlchemy 从 1.4 版本开始引入了对 `asyncio` 的原生支持，并在 2.0 版本中进一步完善。其异步架构不是简单的"给同步 API 加上 async 前缀"，而是基于 greenlet 适配器对整个执行栈进行了异步化改造。

### 18.1.2 核心组件一览

SQLAlchemy 异步扩展由以下关键组件构成：

| 组件 | 同步对应物 | 职责 |
|------|-----------|------|
| `create_async_engine` | `create_engine` | 创建异步引擎 |
| `AsyncSession` | `Session` | 异步会话管理 |
| `async_sessionmaker` | `sessionmaker` | 异步会话工厂 |
| `AsyncConnection` | `Connection` | 异步底层连接 |
| `AsyncAdaptedQueuePool` | `QueuePool` | 异步适配连接池 |
| `run_sync` | N/A | 在异步上下文中运行同步代码 |

### 18.1.3 异步引擎创建

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker

# 基本创建方式
async_engine = create_async_engine(
    "postgresql+asyncpg://user:password@localhost:5432/mydb",
    echo=True
)

# 带连接池参数的创建方式
async_engine = create_async_engine(
    "postgresql+asyncpg://user:password@localhost:5432/mydb",
    pool_size=20,           # 连接池大小
    max_overflow=10,        # 超出pool_size后允许的最大额外连接
    pool_timeout=30,        # 获取连接的超时时间（秒）
    pool_recycle=3600,      # 连接回收时间（秒），防止数据库端超时断开
    pool_pre_ping=True,     # 每次从池中取连接前先ping检查可用性
    echo=True,              # 打印SQL语句
    echo_pool=True,         # 打印连接池日志
)
```

**异步驱动选择**：不同数据库需要不同的异步驱动：

| 数据库 | 异步驱动 | 连接字符串格式 |
|--------|---------|--------------|
| PostgreSQL | asyncpg | `postgresql+asyncpg://...` |
| PostgreSQL | pg8000 | `postgresql+pg8000://...`（仅异步兼容，非原生异步） |
| MySQL | aiomysql | `mysql+aiomysql://...` |
| MySQL | asyncmy | `mysql+asyncmy://...` |
| SQLite | aiosqlite | `sqlite+aiosqlite://...` |

### 18.1.4 AsyncSession 与 async_sessionmaker

`AsyncSession` 是 SQLAlchemy 异步世界的核心入口，它提供了与同步 `Session` 几乎对等的 API，但所有涉及 I/O 的方法都是协程：

```python
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)

engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")

# 方式1：直接创建 AsyncSession
async with AsyncSession(engine) as session:
    async with session.begin():
        # 数据库操作
        pass

# 方式2：使用 async_sessionmaker（推荐）
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # commit后不过期对象，避免懒加载问题
)

async with async_session_factory() as session:
    # 数据库操作
    pass
```

`async_sessionmaker` 的关键参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `bind` | Engine | 绑定的引擎 |
| `class_` | type | 会话类，默认 `AsyncSession` |
| `autocommit` | bool | 自动提交模式（已弃用，2.0中移除） |
| `autoflush` | bool | 查询前自动flush，默认True |
| `expire_on_commit` | bool | commit后过期对象属性，默认True |
| `info` | dict | 附加信息字典 |

### 18.1.5 异步查询语法

SQLAlchemy 2.0 引入了全新的查询风格，使用 `select()`、`insert()`、`update()`、`delete()` 等 Core 构造：

```python
from sqlalchemy import select, insert, update, delete
from sqlalchemy.orm import selectinload, joinedload, subqueryload

# SELECT 查询
stmt = select(User).where(User.name == "Alice")
result = await session.execute(stmt)
users = result.scalars().all()

# 带关联加载的查询
stmt = select(User).options(selectinload(User.posts)).where(User.id == 1)
result = await session.execute(stmt)
user = result.scalar_one_or_none()

# INSERT
stmt = insert(User).values(name="Bob", email="bob@example.com")
await session.execute(stmt)
await session.commit()

# UPDATE
stmt = update(User).where(User.name == "Bob").values(name="Robert")
await session.execute(stmt)
await session.commit()

# DELETE
stmt = delete(User).where(User.name == "Robert")
await session.execute(stmt)
await session.commit()

# ORM 风格的新增（通过 session.add）
new_user = User(name="Charlie", email="charlie@example.com")
session.add(new_user)
await session.commit()
```

### 18.1.6 事务管理

SQLAlchemy 异步事务管理有三种模式：

```python
# 模式1：session.begin() 上下文管理器（推荐）
async with async_session_factory() as session:
    async with session.begin():
        # 自动 commit（正常退出时）或 rollback（异常退出时）
        session.add(User(name="Alice"))
        session.add(User(name="Bob"))
    # 退出 begin() 块时自动 commit

# 模式2：手动 commit/rollback
async with async_session_factory() as session:
    session.add(User(name="Charlie"))
    # 其他操作...
    await session.commit()  # 显式提交
    # 如果不 commit，session 关闭时会 rollback

# 模式3：嵌套事务（SAVEPOINT）
async with async_session_factory() as session:
    async with session.begin():
        session.add(User(name="Parent"))
        # 开始嵌套事务
        async with session.begin_nested():
            session.add(User(name="Child1"))
            # 如果这里抛异常，只回滚到 SAVEPOINT
        session.add(User(name="Child2"))
    # 外层 begin() 结束时统一 commit
```

### 18.1.7 依赖注入中的数据库会话

在 FastAPI 中，数据库会话通过依赖注入系统提供给路径操作：

```python
from typing import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI 依赖：提供数据库会话"""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# 在路由中使用
@app.get("/users/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db_session)):
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

---

## 18.2 原理与机制

### 18.2.1 Greenlet 适配器架构

SQLAlchemy 的异步实现并非从零重写了一套 ORM，而是通过 **greenlet 适配器** 在同步代码和异步事件循环之间搭建了一座桥梁。这是理解 SQLAlchemy 异步机制的关键。

**核心设计思路**：

SQLAlchemy 的 ORM 层（`Session`、`Query`、属性加载等）全部是同步代码，包含大量复杂的内部调用链。直接将这些代码全部改写为异步版本工作量巨大且容易引入 bug。SQLAlchemy 的解法是：

1. 保持 ORM 内部逻辑不变（仍然是同步代码）
2. 在最底层的 I/O 操作点（实际发送 SQL 到数据库、接收结果）进行异步拦截
3. 通过 greenlet 实现同步调用栈到异步事件循环的"跃迁"

```
用户代码 (async/await)
    │
    ▼
AsyncSession.execute()  ← async 入口
    │
    ▼
greenlet.spawn()  ← 创建新 greenlet
    │
    ▼
Session._execute_internal()  ← 在 greenlet 内同步执行
    │                     （ORM 全部同步逻辑在此运行）
    ▼
Connection._execute()  ← 到达底层 I/O 点
    │
    ▼
AsyncAdapted_dbapi_cursor.execute()  ← 异步适配层拦截
    │
    ▼
awaitable → 切回主 greenlet  ← 跃迁回事件循环
    │
    ▼
async driver (asyncpg/aiomysql)  ← 真正的异步 I/O
    │
    ▼
结果返回 → 切回 ORM greenlet  ← 跃迁回 ORM
```

**greenlet 适配器的源码级解读**：

```python
# SQLAlchemy 内部简化示意（非实际源码，展示原理）
import greenlet

class AsyncAdaptedDBAPI:
    def execute(self, operation, parameters):
        # 当前在 ORM greenlet 中
        # 需要执行异步 I/O，但当前上下文是同步的
        current = greenlet.getcurrent()
        # 获取主 greenlet（运行事件循环的那个）
        if current.parent is None:
            raise RuntimeError("No parent greenlet")
        # 将 awaitable 发送到主 greenlet
        # 主 greenlet 会在事件循环中 await 它
        result = current.parent.switch(
            self._async_cursor.execute(operation, parameters)
        )
        return result
```

这意味着：当 ORM 的同步代码执行到数据库 I/O 时，它通过 greenlet 切换到事件循环所在的 greenlet，让事件循环执行异步 I/O，完成后再切回来。整个过程对 ORM 内部逻辑完全透明。

### 18.2.2 AsyncSession 的生命周期

理解 `AsyncSession` 的生命周期对于正确使用异步 SQLAlchemy 至关重要：

```
[创建] ──→ [使用中] ──→ [关闭]
  │            │            │
  │      ┌─────┼─────┐     │
  │      │     │     │     │
  │   begin  add    flush  │
  │      │     │     │     │
  │      ▼     ▼     ▼     │
  │   commit/rollback     │
  │      │                 │
  │      ▼                 │
  │   [可复用/可关闭]      │
  └────────────────────────┘
```

**关键状态转换**：

1. **新建状态**：`AsyncSession` 创建后，尚未执行任何操作
2. **活跃状态**：开始事务后，可以执行查询和修改
3. **挂起状态**：`begin_nested()` 创建 SAVEPOINT 后的子事务状态
4. **关闭状态**：`close()` 后，所有资源释放

```python
# 完整生命周期演示
async with async_session_factory() as session:
    # 状态：新建
    async with session.begin():
        # 状态：活跃（事务已开始）
        stmt = select(User).where(User.id == 1)
        result = await session.execute(stmt)
        user = result.scalar_one()

        user.name = "Updated Name"
        session.add(user)

        # 也可以显式 flush
        await session.flush()  # 发送 SQL 到数据库但不 commit

        # 嵌套事务
        async with session.begin_nested():
            # 状态：挂起（子事务）
            new_post = Post(title="New", user_id=user.id)
            session.add(new_post)
            # 子事务 commit
        # 回到活跃状态

    # 状态：事务已 commit
# 状态：已关闭
```

### 18.2.3 异步连接池内部机制

SQLAlchemy 的异步连接池 `AsyncAdaptedQueuePool` 在同步 `QueuePool` 基础上做了异步适配：

```
┌─────────────────────────────────────┐
│       AsyncAdaptedQueuePool         │
│                                     │
│  ┌─────────────────────────────┐    │
│  │     asyncio.Queue            │    │
│  │  ┌───┐ ┌───┐ ┌───┐ ┌───┐  │    │
│  │  │ C1│ │ C2│ │ C3│ │ C4│  │    │  ← 池中可用连接
│  │  └───┘ └───┘ └───┘ └───┘  │    │
│  └─────────────────────────────┘    │
│                                     │
│  checkout (async):                  │
│    1. 尝试从 Queue 非阻塞获取       │
│    2. 如果 Queue 空，检查是否可创建 │
│    3. 如果已达上限，await 直到有连接│
│                                     │
│  checkin (async):                   │
│    1. 执行 rollback（确保干净状态） │
│    2. 放回 Queue                    │
│    3. 唤醒等待的 checkout           │
└─────────────────────────────────────┘
```

**关键参数的深层含义**：

```python
engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    pool_size=20,        # 核心连接数：池中持久保持的连接数
    max_overflow=10,     # 溢出连接数：允许临时创建的最大额外连接
                         # 总最大连接数 = pool_size + max_overflow = 30
    pool_timeout=30,     # 获取连接的超时：等待30秒后抛出 TimeoutError
    pool_recycle=3600,   # 连接存活时间：1小时后回收，防止DB端关闭连接
    pool_pre_ping=True,  # 预检测：使用前先发 SELECT 1 检测连接可用性
    pool_reset_on_return="rollback",  # 归还连接时的重置策略
)
```

**连接池事件钩子**：

```python
from sqlalchemy import event

@event.listens_for(engine.sync_engine, "connect")
def on_connect(dbapi_conn, connection_record):
    """新连接创建时触发（注意：监听的是 sync_engine）"""
    print(f"连接创建: {connection_record}")

@event.listens_for(engine.sync_engine, "checkout")
def on_checkout(dbapi_conn, connection_record, connection_proxy):
    """连接从池中取出时触发"""
    print(f"连接取出: {id(dbapi_conn)}")

@event.listens_for(engine.sync_engine, "checkin")
def on_checkin(dbapi_conn, connection_record):
    """连接归还到池中时触发"""
    print(f"连接归还: {id(dbapi_conn)}")

@event.listens_for(engine.sync_engine, "close")
def on_close(dbapi_conn, connection_record):
    """连接关闭时触发"""
    print(f"连接关闭: {id(dbapi_conn)}")
```

### 18.2.4 expire_on_commit 的异步陷阱

`expire_on_commit` 是 `AsyncSession` 中最容易踩坑的参数。默认值为 `True`，意味着 commit 后所有对象的属性被标记为"过期"，后续访问属性时需要从数据库重新加载。

在同步模式下这没问题，因为属性访问会自动触发懒加载。但在异步模式下，懒加载是**无法工作**的：

```python
# 问题场景
async with async_session_factory() as session:
    async with session.begin():
        user = User(name="Alice")
        session.add(user)
    # commit 后 user 的属性全部过期
    # 以下代码会抛出 MissingGreenlet 异常！
    print(user.name)  # DetachedInstanceError 或 MissingGreenlet

# 原因：属性访问触发了同步懒加载
# 但在异步上下文中无法执行同步 I/O
```

解决方案：

```python
# 方案1：设置 expire_on_commit=False（推荐）
async_session_factory = async_sessionmaker(
    engine,
    expire_on_commit=False,  # commit后不过期
)

# 方案2：在 commit 前显式 refresh
async with session.begin():
    user = User(name="Alice")
    session.add(user)
await session.refresh(user)  # 显式刷新
print(user.name)  # OK

# 方案3：使用 await session.get() 重新获取
async with session.begin():
    session.add(User(name="Alice"))
user = await session.get(User, 1)
print(user.name)  # OK
```

### 18.2.5 异步引擎的 run_sync 机制

`run_sync` 是 SQLAlchemy 提供的在异步上下文中运行同步数据库操作的桥接方法：

```python
# AsyncSession.run_sync
async with async_session_factory() as session:
    # 在异步上下文中执行同步函数
    def sync_operation(sync_session):
        # 这里的 sync_session 是同步 Session
        result = sync_session.execute(select(User))
        return result.scalars().all()

    users = await session.run_sync(sync_operation)

# AsyncConnection.run_sync
async with engine.connect() as conn:
    def create_tables(sync_conn):
        sync_conn.execute(text("CREATE TABLE IF NOT EXISTS ..."))

    await conn.run_sync(create_tables)
```

`run_sync` 的工作原理：

1. 创建一个 greenlet
2. 在 greenlet 内部创建同步 Session/Connection
3. 执行传入的同步函数
4. 将结果传回异步上下文

适用场景：
- DDL 操作（如 `metadata.create_all`）
- 调用只支持同步的第三方扩展
- 迁移脚本中的同步操作

---

## 18.3 使用场景

### 18.3.1 高并发 REST API

在处理大量并发请求的 REST API 中，异步数据库访问能够显著提升吞吐量：

```python
# 场景：电商平台的商品列表 API
# 同步模型：每个请求阻塞一个线程，100 个请求 = 100 个线程
# 异步模型：100 个请求在少量线程上协作运行，I/O 等待时不占线程

from fastapi import FastAPI, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

app = FastAPI()

@app.get("/api/v1/products")
async def list_products(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    category: str | None = None,
    db: AsyncSession = Depends(get_db_session),
):
    # 构建基础查询
    stmt = select(Product)
    if category:
        stmt = stmt.where(Product.category == category)

    # 计数查询（可并行）
    count_stmt = select(func.count()).select_from(
        stmt.subquery()
    )

    # 分页查询
    offset = (page - 1) * size
    stmt = stmt.offset(offset).limit(size)

    # 并行执行两个查询
    from asyncio import gather
    count_result, items_result = await gather(
        db.execute(count_stmt),
        db.execute(stmt),
    )

    total = count_result.scalar()
    items = items_result.scalars().all()

    return {
        "total": total,
        "page": page,
        "size": size,
        "items": items,
    }
```

### 18.3.2 WebSocket 长连接中的数据库操作

WebSocket 连接是长生命周期的，如果使用同步数据库访问会阻塞整个事件循环：

```python
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select

@app.websocket("/ws/live-feed/{channel_id}")
async def websocket_live_feed(
    websocket: WebSocket,
    channel_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # 异步写入消息
            message = Message(
                channel_id=channel_id,
                content=data,
            )
            db.add(message)
            await db.commit()

            # 异步查询最新消息列表
            stmt = (
                select(Message)
                .where(Message.channel_id == channel_id)
                .order_by(Message.created_at.desc())
                .limit(10)
            )
            result = await db.execute(stmt)
            messages = result.scalars().all()

            await websocket.send_json([
                {"content": m.content, "time": m.created_at.isoformat()}
                for m in messages
            ])
    except WebSocketDisconnect:
        pass
```

### 18.3.3 批量数据处理

异步 SQLAlchemy 特别适合处理大量小事务的场景，例如批量导入数据：

```python
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession

async def batch_import(records: list[dict], batch_size: int = 100):
    """异步批量导入，每批单独事务"""
    async with async_session_factory() as session:
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            async with session.begin():
                for record in batch:
                    user = User(**record)
                    session.add(user)
            # 每 batch_size 条 commit 一次
            # 即使失败也只影响当前批次
```

### 18.3.4 多数据库异步访问

微服务或遗留系统集成场景中，经常需要同时连接多个数据库：

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# 主数据库（读写）
primary_engine = create_async_engine(
    "postgresql+asyncpg://user:pass@primary-host:5432/main_db",
    pool_size=10,
)
PrimarySession = async_sessionmaker(primary_engine, expire_on_commit=False)

# 只读副本
replica_engine = create_async_engine(
    "postgresql+asyncpg://user:pass@replica-host:5432/main_db",
    pool_size=20,  # 读副本通常需要更多连接
)
ReplicaSession = async_sessionmaker(replica_engine, expire_on_commit=False)

# 依赖注入
async def get_read_db():
    async with ReplicaSession() as session:
        yield session

async def get_write_db():
    async with PrimarySession() as session:
        yield session

# 使用：读操作走副本，写操作走主库
@app.get("/users/{user_id}")
async def read_user(user_id: int, db=Depends(get_read_db)):
    ...

@app.post("/users")
async def create_user(user: UserCreate, db=Depends(get_write_db)):
    ...
```

### 18.3.5 后台任务中的异步数据库操作

FastAPI 的 `BackgroundTasks` 或独立的 `asyncio.Task` 中也需要异步数据库访问：

```python
from fastapi import BackgroundTasks

async def log_access(user_id: int, path: str):
    """后台记录访问日志"""
    async with async_session_factory() as session:
        async with session.begin():
            log = AccessLog(user_id=user_id, path=path)
            session.add(log)

@app.get("/some-resource")
async def get_resource(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
):
    # 前台快速返回结果
    result = await db.execute(select(Resource).limit(10))
    # 后台异步记录日志，不阻塞响应
    background_tasks.add_task(log_access, user_id=1, path="/some-resource")
    return result.scalars().all()
```

---

## 18.4 示例代码

### 18.4.1 完整项目结构

以下是一个完整的 FastAPI + SQLAlchemy 异步集成项目，包含模型定义、依赖注入、CRUD 操作和关系查询。

**项目结构**：

```
project/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI 应用入口
│   ├── database.py      # 数据库配置
│   ├── models.py         # ORM 模型
│   ├── schemas.py        # Pydantic 模式
│   ├── dependencies.py   # 依赖注入
│   ├── crud.py           # CRUD 操作
│   └── routers/
│       ├── __init__.py
│       └── users.py      # 用户路由
├── alembic/              # 数据库迁移
├── alembic.ini
├── requirements.txt
└── .env
```

### 18.4.2 database.py — 数据库配置

```python
"""数据库配置模块"""
import os
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.pool import AsyncAdaptedQueuePool

# 从环境变量读取配置
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/fastapi_demo"
)

# 创建异步引擎
engine = create_async_engine(
    DATABASE_URL,
    poolclass=AsyncAdaptedQueuePool,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
)

# 创建会话工厂
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=True,
)
```

### 18.4.3 models.py — ORM 模型

```python
"""ORM 模型定义"""
import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Index
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship
)


class Base(DeclarativeBase):
    """声明式基类"""
    pass


class TimestampMixin:
    """时间戳混入类"""
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 关系
    posts: Mapped[list["Post"]] = relationship(
        back_populates="author",
        cascade="all, delete-orphan",
        lazy="selectin",  # 异步友好的加载策略
    )
    profile: Mapped["Profile"] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    # 索引
    __table_args__ = (
        Index("ix_users_username_email", "username", "email", unique=True),
    )

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}')>"


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    user: Mapped["User"] = relationship(back_populates="profile", lazy="selectin")


class Post(TimestampMixin, Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    author_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )

    author: Mapped["User"] = relationship(back_populates="posts", lazy="selectin")
    tags: Mapped[list["Tag"]] = relationship(
        secondary="post_tags",
        back_populates="posts",
        lazy="selectin",
    )


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    posts: Mapped[list["Post"]] = relationship(
        secondary="post_tags",
        back_populates="tags",
        lazy="selectin",
    )


class PostTag(Base):
    """多对多关联表"""
    __tablename__ = "post_tags"

    post_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
```

### 18.4.4 dependencies.py — 依赖注入

```python
"""数据库依赖注入"""
from typing import AsyncGenerator
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .database import AsyncSessionLocal
from .models import User


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = "dummy-token",  # 实际中从 OAuth2 获取
) -> User:
    """获取当前认证用户"""
    # 简化示例：通过 token 查询用户
    stmt = select(User).where(User.username == "current_user")
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return user
```

### 18.4.5 crud.py — CRUD 操作

```python
"""CRUD 操作封装"""
from typing import Sequence
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import User, Post, Profile, Tag
from .schemas import UserCreate, UserUpdate, PostCreate, PostUpdate


# ──────────────── User CRUD ────────────────

async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    """通过 ID 获取用户（含关联数据）"""
    stmt = (
        select(User)
        .options(selectinload(User.profile), selectinload(User.posts))
        .where(User.id == user_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    """通过用户名获取用户"""
    stmt = select(User).where(User.username == username)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_users_paginated(
    db: AsyncSession,
    offset: int = 0,
    limit: int = 20,
) -> tuple[Sequence[User], int]:
    """分页获取用户列表"""
    # 查询总数
    count_stmt = select(func.count()).select_from(User)
    total = (await db.execute(count_stmt)).scalar()

    # 查询当前页
    stmt = select(User).offset(offset).limit(limit).order_by(User.id)
    result = await db.execute(stmt)
    users = result.scalars().all()

    return users, total


async def create_user(db: AsyncSession, user_in: UserCreate) -> User:
    """创建用户"""
    user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=user_in.hashed_password,  # 实际中应哈希
    )
    db.add(user)
    await db.flush()  # 获取 user.id

    # 同时创建 Profile
    profile = Profile(user_id=user.id, bio=user_in.bio or "")
    db.add(profile)

    await db.flush()
    return user


async def update_user(db: AsyncSession, user_id: int, user_in: UserUpdate) -> User:
    """更新用户"""
    stmt = (
        update(User)
        .where(User.id == user_id)
        .values(**user_in.model_dump(exclude_unset=True))
        .returning(User)
    )
    result = await db.execute(stmt)
    user = result.scalar_one()
    await db.flush()
    return user


async def delete_user(db: AsyncSession, user_id: int) -> bool:
    """删除用户"""
    stmt = delete(User).where(User.id == user_id)
    result = await db.execute(stmt)
    return result.rowcount > 0


# ──────────────── Post CRUD ────────────────

async def create_post(
    db: AsyncSession,
    post_in: PostCreate,
    author_id: int,
) -> Post:
    """创建文章"""
    post = Post(
        title=post_in.title,
        content=post_in.content,
        author_id=author_id,
    )
    db.add(post)
    await db.flush()

    # 处理标签
    if post_in.tag_names:
        for tag_name in post_in.tag_names:
            tag_stmt = select(Tag).where(Tag.name == tag_name)
            tag_result = await db.execute(tag_stmt)
            tag = tag_result.scalar_one_or_none()
            if tag is None:
                tag = Tag(name=tag_name)
                db.add(tag)
                await db.flush()
            post.tags.append(tag)

    await db.flush()
    return post


async def get_post_with_author(db: AsyncSession, post_id: int) -> Post | None:
    """获取文章（含作者和标签）"""
    stmt = (
        select(Post)
        .options(
            selectinload(Post.author).selectinload(User.profile),
            selectinload(Post.tags),
        )
        .where(Post.id == post_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_post(
    db: AsyncSession,
    post_id: int,
    post_in: PostUpdate,
) -> Post | None:
    """更新文章"""
    stmt = (
        update(Post)
        .where(Post.id == post_id)
        .values(**post_in.model_dump(exclude_unset=True))
    )
    await db.execute(stmt)
    await db.flush()
    return await get_post_with_author(db, post_id)


async def delete_post(db: AsyncSession, post_id: int) -> bool:
    """删除文章"""
    stmt = delete(Post).where(Post.id == post_id)
    result = await db.execute(stmt)
    return result.rowcount > 0


async def list_published_posts(
    db: AsyncSession,
    offset: int = 0,
    limit: int = 20,
) -> tuple[Sequence[Post], int]:
    """列出已发布的文章（分页）"""
    base = select(Post).where(Post.is_published.is_(True))

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar()

    stmt = (
        base.options(selectinload(Post.author), selectinload(Post.tags))
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    posts = result.scalars().all()

    return posts, total
```

### 18.4.6 schemas.py — Pydantic 模式

```python
"""Pydantic 请求/响应模式"""
import datetime
from pydantic import BaseModel, EmailStr, Field


# ────── User Schemas ──────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    hashed_password: str
    bio: str | None = None


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    is_active: bool | None = None


class ProfileOut(BaseModel):
    bio: str | None
    avatar_url: str | None
    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    profile: ProfileOut | None = None
    created_at: datetime.datetime
    model_config = {"from_attributes": True}


class UserListOut(BaseModel):
    total: int
    items: list[UserOut]


# ────── Post Schemas ──────

class PostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str
    tag_names: list[str] = []


class PostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    is_published: bool | None = None


class TagOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class AuthorOut(BaseModel):
    id: int
    username: str
    profile: ProfileOut | None = None
    model_config = {"from_attributes": True}


class PostOut(BaseModel):
    id: int
    title: str
    content: str
    is_published: bool
    author: AuthorOut
    tags: list[TagOut] = []
    created_at: datetime.datetime
    updated_at: datetime.datetime
    model_config = {"from_attributes": True}


class PostListOut(BaseModel):
    total: int
    items: list[PostOut]
```

### 18.4.7 routers/users.py — 路由实现

```python
"""用户和文章路由"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db, get_current_user
from ..models import User
from .. import crud, schemas

router = APIRouter(prefix="/api/v1", tags=["users"])


# ──────────────── User Routes ────────────────

@router.post("/users", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: schemas.UserCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await crud.get_user_by_username(db, user_in.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )
    user = await crud.create_user(db, user_in)
    return user


@router.get("/users/{user_id}", response_model=schemas.UserOut)
async def read_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    user = await crud.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.get("/users", response_model=schemas.UserListOut)
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    users, total = await crud.get_users_paginated(db, offset, size)
    return {"total": total, "items": users}


@router.patch("/users/{user_id}", response_model=schemas.UserOut)
async def update_user(
    user_id: int,
    user_in: schemas.UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )
    user = await crud.update_user(db, user_id, user_in)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superusers can delete users",
        )
    deleted = await crud.delete_user(db, user_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )


# ──────────────── Post Routes ────────────────

@router.post("/posts", response_model=schemas.PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    post_in: schemas.PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = await crud.create_post(db, post_in, current_user.id)
    # 需要重新获取以加载关联数据
    return await crud.get_post_with_author(db, post.id)


@router.get("/posts/{post_id}", response_model=schemas.PostOut)
async def read_post(post_id: int, db: AsyncSession = Depends(get_db)):
    post = await crud.get_post_with_author(db, post_id)
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )
    return post


@router.get("/posts", response_model=schemas.PostListOut)
async def list_posts(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    posts, total = await crud.list_published_posts(db, offset, size)
    return {"total": total, "items": posts}


@router.patch("/posts/{post_id}", response_model=schemas.PostOut)
async def update_post(
    post_id: int,
    post_in: schemas.PostUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = await crud.get_post_with_author(db, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    updated = await crud.update_post(db, post_id, post_in)
    return updated


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = await crud.get_post_with_author(db, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")
    await crud.delete_post(db, post_id)
```

### 18.4.8 main.py — 应用入口

```python
"""FastAPI 应用入口"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import text

from .database import engine, AsyncSessionLocal
from .models import Base
from .routers import users


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时：创建表（仅开发环境，生产环境用 Alembic）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    # 关闭时：释放连接池
    await engine.dispose()


app = FastAPI(
    title="FastAPI + SQLAlchemy Async Demo",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(users.router)


@app.get("/health")
async def health_check(db: AsyncSessionLocal = Depends(get_db)):
    """健康检查，验证数据库连接"""
    result = await db.execute(text("SELECT 1"))
    return {"status": "healthy", "db": result.scalar()}


# 需要导入 Depends
from fastapi import Depends
from .dependencies import get_db
```

### 18.4.9 高级查询示例

```python
"""高级异步查询模式"""
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, contains_eager

from .models import User, Post, Tag


async def complex_join_query(db: AsyncSession, user_id: int):
    """复杂连接查询：获取用户及其已发布文章数"""

    # 方法1：使用子查询统计
    published_count = (
        select(func.count(Post.id))
        .where(
            Post.author_id == User.id,
            Post.is_published.is_(True),
        )
        .correlate(User)
        .scalar_subquery()
        .label("published_count")
    )

    stmt = select(User, published_count).where(User.id == user_id)
    result = await db.execute(stmt)
    row = result.one_or_none()
    return row


async def filtered_search(
    db: AsyncSession,
    search: str | None = None,
    tag: str | None = None,
    author: str | None = None,
    page: int = 1,
    size: int = 20,
):
    """多条件筛选搜索"""

    stmt = select(Post).options(
        selectinload(Post.author),
        selectinload(Post.tags),
    )

    conditions = []
    if search:
        conditions.append(
            or_(
                Post.title.ilike(f"%{search}%"),
                Post.content.ilike(f"%{search}%"),
            )
        )
    if tag:
        stmt = stmt.join(Post.tags).where(Tag.name == tag)
    if author:
        stmt = stmt.join(Post.author).where(User.username == author)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    stmt = stmt.where(Post.is_published.is_(True))
    stmt = stmt.order_by(Post.created_at.desc())
    stmt = stmt.offset((page - 1) * size).limit(size)

    result = await db.execute(stmt)
    return result.scalars().all()


async def bulk_upsert_tags(db: AsyncSession, tag_names: list[str]):
    """批量 upsert 标签"""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    stmt = pg_insert(Tag).values(
        [{"name": name} for name in tag_names]
    )
    stmt = stmt.on_conflict_do_nothing(index_elements=["name"])
    await db.execute(stmt)
    await db.flush()

    # 获取所有标签
    result = await db.execute(
        select(Tag).where(Tag.name.in_(tag_names))
    )
    return result.scalars().all()


async def concurrent_queries(db: AsyncSession):
    """并行执行多个独立查询"""
    import asyncio

    # 创建多个独立的 awaitable
    users_task = db.execute(
        select(func.count()).select_from(User)
    )
    posts_task = db.execute(
        select(func.count()).select_from(Post)
    )
    tags_task = db.execute(
        select(func.count()).select_from(Tag)
    )

    # 并行执行
    # 注意：同一个 session 上的并行查询在 SQLAlchemy 中
    # 需要小心处理，因为 session 不是线程安全的
    # 更安全的做法是使用多个 session
    user_count, post_count, tag_count = await asyncio.gather(
        users_task, posts_task, tags_task
    )

    return {
        "users": user_count.scalar(),
        "posts": post_count.scalar(),
        "tags": tag_count.scalar(),
    }
```

### 18.4.10 中间件级别的事务管理

```python
"""中间件级别的事务管理——每个请求一个事务"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession


class TransactionMiddleware(BaseHTTPMiddleware):
    """自动事务中间件：每个 HTTP 请求一个事务"""

    def __init__(self, app, session_factory):
        super().__init__(app)
        self.session_factory = session_factory

    async def dispatch(self, request: Request, call_next):
        async with self.session_factory() as session:
            # 将 session 存入 request state
            request.state.db = session

            try:
                response = await call_next(request)
                # 根据响应状态码决定 commit 或 rollback
                if 200 <= response.status_code < 400:
                    await session.commit()
                else:
                    await session.rollback()
                return response
            except Exception:
                await session.rollback()
                raise


# 使用方式
def get_db_from_request(request: Request) -> AsyncSession:
    """从 request state 获取数据库会话"""
    return request.state.db
```

---

## 18.5 常见陷阱与最佳实践

### 18.5.1 陷阱：同步驱动与异步引擎混用

**错误**：使用同步驱动（如 `psycopg2`）创建异步引擎

```python
# 错误：同步驱动无法与 create_async_engine 配合
engine = create_async_engine(
    "postgresql+psycopg2://user:pass@localhost/db"  # psycopg2 是同步驱动！
)
# 运行时会抛出：InterfaceError: cannot create async engine with sync driver
```

**正确**：始终使用异步驱动

```python
# 正确：PostgreSQL 使用 asyncpg
engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db"
)
```

### 18.5.2 陷阱：在异步上下文中使用同步懒加载

**错误**：访问未加载的关系属性

```python
# 错误：触发同步懒加载
async with async_session_factory() as session:
    stmt = select(User).where(User.id == 1)
    result = await session.execute(stmt)
    user = result.scalar_one()
    # user.posts 未加载，访问会触发懒加载
    print(len(user.posts))  # MissingGreenlet 异常！
```

**正确**：在查询时显式指定加载策略

```python
# 正确方式1：使用 selectinload
stmt = select(User).options(selectinload(User.posts)).where(User.id == 1)
result = await session.execute(stmt)
user = result.scalar_one()
print(len(user.posts))  # OK，数据已在查询时加载

# 正确方式2：使用 joinedload
stmt = select(User).options(joinedload(User.posts)).where(User.id == 1)

# 正确方式3：在模型定义中设置 lazy="selectin"
class User(Base):
    posts: Mapped[list["Post"]] = relationship(lazy="selectin")
```

### 18.5.3 陷阱：忘记 await session.commit()

**错误**：修改数据后忘记 commit

```python
# 错误：修改后未 commit
async with async_session_factory() as session:
    user = await session.get(User, 1)
    user.name = "New Name"
    session.add(user)
    # 忘记 await session.commit()
    # 数据不会被持久化！
```

**正确**：始终显式 commit 或使用 begin() 上下文

```python
# 正确方式1：显式 commit
async with async_session_factory() as session:
    user = await session.get(User, 1)
    user.name = "New Name"
    await session.commit()

# 正确方式2：使用 begin() 自动 commit（推荐）
async with async_session_factory() as session:
    async with session.begin():
        user = await session.get(User, 1)
        user.name = "New Name"
    # 自动 commit
```

### 18.5.4 陷阱：连接池耗尽

**场景**：高并发下连接池被耗尽，新请求超时

```python
# 问题代码：长事务占用连接
async def slow_operation(db: AsyncSession):
    async with db.begin():
        # 执行一些快速数据库操作
        result = await db.execute(select(User))
        users = result.scalars().all()
        # 然后做大量非数据库的耗时计算
        await asyncio.sleep(30)  # 模拟耗时操作
        # 事务期间连接一直被占用！
```

**正确**：将数据库操作和耗时计算分离

```python
# 正确：快速完成数据库操作
async def better_operation(db: AsyncSession):
    # 快速完成数据库读取
    async with db.begin():
        result = await db.execute(select(User))
        users = result.scalars().all()

    # 数据库连接已释放，做耗时计算
    await asyncio.sleep(30)
    # 如果还需要写入，再获取新事务
```

**连接池监控**：

```python
# 监控连接池状态
from sqlalchemy import event

@event.listens_for(engine.sync_engine, "checkout")
def on_checkout(dbapi_conn, record, proxy):
    pool = record.pool
    print(f"池状态 - 已用: {pool.checkedout()}, 空闲: {pool.checkedin()}, 溢出: {pool.overflow()}")

# 在 FastAPI 中暴露连接池状态
@app.get("/debug/pool-status")
async def pool_status():
    pool = engine.pool
    return {
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
    }
```

### 18.5.5 陷阱：会话泄漏

**错误**：在异常路径中忘记关闭会话

```python
# 错误：异常时 session 未关闭
async def bad_example():
    session = AsyncSessionLocal()
    user = await session.get(User, 1)
    if user is None:
        raise ValueError("Not found")  # session 泄漏！
    await session.close()
```

**正确**：始终使用上下文管理器

```python
# 正确：使用 async with 确保会话关闭
async def good_example():
    async with AsyncSessionLocal() as session:
        user = await session.get(User, 1)
        if user is None:
            raise ValueError("Not found")
        return user
    # session.close() 在 __aexit__ 中自动调用
```

### 18.5.6 最佳实践：分层架构

将数据库操作严格分层，避免在路由层直接写 SQL：

```
Router 层        →  处理 HTTP 请求/响应
  │
  ▼
Service 层       →  业务逻辑编排
  │
  ▼
Repository 层    →  数据访问抽象
  │
  ▼
Model 层         →  ORM 模型定义
```

### 18.5.7 最佳实践：测试中的数据库会话

```python
"""异步 SQLAlchemy 测试工具"""
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# 测试专用引擎（SQLite 内存数据库）
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=True)
TestSessionFactory = async_sessionmaker(
    test_engine, expire_on_commit=False
)


@pytest.fixture
async def db_session():
    """测试用数据库会话"""
    # 创建表
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 提供会话
    async with TestSessionFactory() as session:
        # 每个测试在独立事务中运行
        async with session.begin():
            yield session
            # 测试结束后 rollback，保持数据库干净
            await session.rollback()

    # 清理表
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# 测试示例
async def test_create_user(db_session: AsyncSession):
    user = User(username="test", email="test@example.com", hashed_password="xxx")
    db_session.add(user)
    await db_session.flush()

    stmt = select(User).where(User.username == "test")
    result = await db_session.execute(stmt)
    found = result.scalar_one()
    assert found.username == "test"
```

### 18.5.8 最佳实践：优雅关闭

```python
"""应用关闭时优雅释放数据库资源"""
from contextlib import asynccontextmanager
from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动逻辑
    yield
    # 关闭逻辑：释放连接池
    await engine.dispose()
    # 确保所有连接关闭，防止 "connection already closed" 错误


app = FastAPI(lifespan=lifespan)
```

### 18.5.9 最佳实践：连接池配置调优

根据应用场景选择合适的连接池参数：

| 场景 | pool_size | max_overflow | pool_recycle | 说明 |
|------|-----------|-------------|-------------|------|
| 开发环境 | 5 | 5 | 3600 | 小池即可 |
| 中等负载 API | 20 | 10 | 3600 | 默认推荐 |
| 高并发读多写少 | 30 | 20 | 1800 | 更多连接应对并发 |
| 长事务（报表） | 10 | 5 | 7200 | 较少连接，长存活 |
| Serverless | 5 | 0 | 300 | 最小化空闲连接 |

**数据库端最大连接数参考**：

```
PostgreSQL: max_connections 默认 100
MySQL: max_connections 默认 151
```

连接池的 `pool_size + max_overflow` 总和不应超过数据库端最大连接数的 80%，为管理连接和监控工具预留空间。

### 18.5.10 最佳实践：避免 N+1 查询

N+1 查询是 ORM 最常见的性能问题，在异步环境下更加严重：

```python
# N+1 问题：先查所有文章，再逐个查作者
async def bad_n_plus_one(db: AsyncSession):
    stmt = select(Post)
    result = await db.execute(stmt)
    posts = result.scalars().all()
    # 下面这行会触发 N 次额外查询（每个 post 查一次 author）
    authors = [post.author for post in posts]  # N+1 查询！
    return posts

# 解决方案1：使用 selectinload（推荐，适合集合加载）
async def good_selectin(db: AsyncSession):
    stmt = select(Post).options(selectinload(Post.author))
    result = await db.execute(stmt)
    return result.scalars().all()

# 解决方案2：使用 joinedload（适合一对一/多对一）
async def good_joined(db: AsyncSession):
    stmt = select(Post).options(joinedload(Post.author))
    result = await db.execute(stmt)
    # 注意：joinedload 可能产生重复行，需要 unique()
    return result.unique().scalars().all()

# 解决方案3：使用 subqueryload
async def good_subquery(db: AsyncSession):
    stmt = select(Post).options(subqueryload(Post.author))
    result = await db.execute(stmt)
    return result.scalars().all()
```

**三种加载策略对比**：

| 策略 | SQL 特征 | 适用场景 | 优缺点 |
|------|---------|---------|--------|
| `selectinload` | 先查主表，再用 IN 查关联 | 集合加载（一对多、多对多） | 最佳通用选择，避免笛卡尔积 |
| `joinedload` | LEFT JOIN 一次查询 | 一对一、多对一 | 减少 SQL 次数，但可能产生大量重复行 |
| `subqueryload` | 子查询方式加载 | 需要排序/分页的关联 | 兼容分页，但子查询可能慢 |
| `lazy="noload"` | 不加载 | 确定不需要关联数据 | 最高效——零查询 |
| `lazy="raise"` | 访问时抛异常 | 防止意外懒加载 | 开发调试利器 |

### 18.5.11 最佳实践：使用 lazy="raise" 防止异步懒加载

在异步环境中，最安全的做法是在模型定义中将所有关系设为 `lazy="raise"`，强制开发者显式指定加载策略：

```python
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 使用 lazy="raise" 防止意外懒加载
    posts: Mapped[list["Post"]] = relationship(
        back_populates="author",
        lazy="raise",  # 访问 user.posts 不指定加载策略会抛异常
    )
    profile: Mapped["Profile"] = relationship(
        back_populates="user",
        uselist=False,
        lazy="raise",
    )

# 查询时必须显式指定加载策略
stmt = select(User).options(
    selectinload(User.posts),
    selectinload(User.profile),
)
```

这种做法虽然增加了查询时的代码量，但能在开发阶段立即发现遗漏的加载策略，而不是在生产环境遇到 `MissingGreenlet` 异常。