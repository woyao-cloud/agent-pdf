# 第19章 SQLModel与FastAPI

## 19.1 概念与语法

### 19.1.1 SQLModel 的定位与设计哲学

SQLModel 是由 Sebastián Ramirez（FastAPI 作者）设计的 Python 库，其核心目标是**统一数据模型定义**——让同一个类既能作为 Pydantic 模型用于请求/响应验证，又能作为 SQLAlchemy 模型用于数据库持久化。

在传统 FastAPI + SQLAlchemy 架构中，开发者需要维护三套模型：

```
传统方式（三套模型）：
  Pydantic Create Schema  →  SQLAlchemy ORM Model  →  Pydantic Response Schema
  （请求验证）               （数据库持久化）          （响应序列化）

SQLModel 方式（一套模型）：
  SQLModel  ←  同时满足 Pydantic 验证 + SQLAlchemy ORM
```

SQLModel 的实现原理是利用 Python 的**元类（metaclass）**机制，让一个类同时继承自 `pydantic.BaseModel` 和 `sqlalchemy.orm.DeclarativeBase`，并通过元类协调两个框架的属性处理逻辑。

### 19.1.2 安装与依赖

```bash
# 安装 SQLModel（自动安装 SQLAlchemy 和 Pydantic）
pip install sqlmodel

# 异步支持需要额外安装异步驱动
pip install sqlmodel[asyncio]  # 安装异步扩展
pip install asyncpg            # PostgreSQL 异步驱动
pip install aiomysql           # MySQL 异步驱动
pip install aiosqlite          # SQLite 异步驱动
```

版本兼容性注意：SQLModel 的版本需与 SQLAlchemy 2.x 和 Pydantic 2.x 兼容。SQLModel 0.0.14+ 已支持 Pydantic V2 和 SQLAlchemy 2.0。

### 19.1.3 基本模型定义

```python
from typing import Optional
from sqlmodel import SQLModel, Field
import datetime


class Hero(SQLModel, table=True):
    """数据库表模型：table=True 表示这是一个数据库表"""
    __tablename__ = "heroes"  # 可选，默认使用类名小写

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, max_length=50)
    secret_name: str = Field(max_length=100)
    age: Optional[int] = Field(default=None, index=True)
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow,
        nullable=False,
    )


class HeroCreate(SQLModel):
    """创建时的请求模型：不含 id 和 created_at"""
    name: str = Field(max_length=50)
    secret_name: str = Field(max_length=100)
    age: Optional[int] = None


class HeroRead(SQLModel):
    """响应模型：包含所有字段"""
    id: int
    name: str
    secret_name: str
    age: Optional[int] = None
    created_at: datetime.datetime


class HeroUpdate(SQLModel):
    """更新模型：所有字段可选"""
    name: Optional[str] = None
    secret_name: Optional[str] = None
    age: Optional[int] = None
```

`Field` 函数的双重角色：

| 参数 | Pydantic 角色 | SQLAlchemy 角色 |
|------|-------------|----------------|
| `default` | 默认值 | 列默认值 |
| `primary_key` | N/A | 主键 |
| `index` | N/A | 创建索引 |
| `unique` | N/A | 唯一约束 |
| `foreign_key` | N/A | 外键 |
| `max_length` | 字符串最大长度 | VARCHAR 长度 |
| `nullable` | N/A | 列可空性 |
| `sa_column` | N/A | 直接指定 SQLAlchemy Column 对象 |
| `sa_column_args` | N/A | 传递给 Column 的额外参数 |
| `schema_extra` | JSON Schema 扩展 | N/A |

### 19.1.4 关系定义

SQLModel 支持与 SQLAlchemy 相同的关系定义方式，但需要使用 `Relationship` 函数：

```python
from typing import List, Optional
from sqlmodel import SQLModel, Field, Relationship
import datetime


class Team(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    headquarters: str

    # 关系：一个团队有多个英雄
    heroes: List["Hero"] = Relationship(back_populates="team")


class Hero(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    secret_name: str
    age: Optional[int] = Field(default=None, index=True)
    team_id: Optional[int] = Field(default=None, foreign_key="teams.id")

    # 关系：一个英雄属于一个团队
    team: Optional[Team] = Relationship(back_populates="heroes")


# 多对多关系
class HeroTeamLink(SQLModel, table=True):
    """多对多关联表"""
    hero_id: int = Field(foreign_key="heroes.id", primary_key=True)
    team_id: int = Field(foreign_key="teams.id", primary_key=True)


class TeamV2(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    heroes: List["Hero"] = Relationship(
        back_populates="teams",
        link_model=HeroTeamLink,  # 通过关联表建立多对多
    )


class HeroV2(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    teams: List["TeamV2"] = Relationship(
        back_populates="heroes",
        link_model=HeroTeamLink,
    )
```

### 19.1.5 数据库引擎与会话

```python
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.ext.asyncio import (
    AsyncEngine,
    create_async_engine,
    AsyncSession,
)

# 同步引擎
sync_engine = create_engine(
    "postgresql://user:pass@localhost/db",
    echo=True,
)

# 异步引擎
async_engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    echo=True,
)

# 创建表
# 同步方式
SQLModel.metadata.create_all(sync_engine)

# 异步方式
async with async_engine.begin() as conn:
    await conn.run_sync(SQLModel.metadata.create_all)

# 同步会话
with Session(sync_engine) as session:
    hero = session.get(Hero, 1)

# 异步会话
async with AsyncSession(async_engine) as session:
    hero = await session.get(Hero, 1)
```

### 19.1.6 CRUD 操作语法

```python
from sqlmodel import Session, select


# ─── CREATE ───
def create_hero(session: Session, hero: HeroCreate) -> Hero:
    db_hero = Hero.model_validate(hero)  # Pydantic V2
    session.add(db_hero)
    session.commit()
    session.refresh(db_hero)  # 刷新获取数据库生成的字段
    return db_hero


# ─── READ ───
def get_hero(session: Session, hero_id: int) -> Hero | None:
    return session.get(Hero, hero_id)


def list_heroes(session: Session, offset: int = 0, limit: int = 100) -> list[Hero]:
    stmt = select(Hero).offset(offset).limit(limit)
    return session.exec(stmt).all()


def get_hero_by_name(session: Session, name: str) -> Hero | None:
    stmt = select(Hero).where(Hero.name == name)
    return session.exec(stmt).first()


# ─── UPDATE ───
def update_hero(session: Session, hero_id: int, hero_update: HeroUpdate) -> Hero:
    hero = session.get(Hero, hero_id)
    if hero is None:
        raise ValueError("Hero not found")
    # 只更新非 None 的字段
    hero_data = hero_update.model_dump(exclude_unset=True)
    hero.sqlmodel_update(hero_data)  # SQLModel 提供的更新方法
    session.add(hero)
    session.commit()
    session.refresh(hero)
    return hero


# ─── DELETE ───
def delete_hero(session: Session, hero_id: int) -> bool:
    hero = session.get(Hero, hero_id)
    if hero is None:
        return False
    session.delete(hero)
    session.commit()
    return True
```

### 19.1.7 异步 CRUD 操作

```python
from sqlmodel import select
from sqlmodel.ext.asyncio import AsyncSession


async def async_create_hero(session: AsyncSession, hero: HeroCreate) -> Hero:
    db_hero = Hero.model_validate(hero)
    session.add(db_hero)
    await session.commit()
    await session.refresh(db_hero)
    return db_hero


async def async_get_hero(session: AsyncSession, hero_id: int) -> Hero | None:
    return await session.get(Hero, hero_id)


async def async_list_heroes(
    session: AsyncSession,
    offset: int = 0,
    limit: int = 100,
) -> list[Hero]:
    stmt = select(Hero).offset(offset).limit(limit)
    result = await session.exec(stmt)
    return result.all()


async def async_update_hero(
    session: AsyncSession,
    hero_id: int,
    hero_update: HeroUpdate,
) -> Hero:
    hero = await session.get(Hero, hero_id)
    if hero is None:
        raise ValueError("Hero not found")
    hero_data = hero_update.model_dump(exclude_unset=True)
    hero.sqlmodel_update(hero_data)
    session.add(hero)
    await session.commit()
    await session.refresh(hero)
    return hero


async def async_delete_hero(session: AsyncSession, hero_id: int) -> bool:
    hero = await session.get(Hero, hero_id)
    if hero is None:
        return False
    await session.delete(hero)
    await session.commit()
    return True
```

---

## 19.2 原理与机制

### 19.2.1 元类机制深度解析

SQLModel 的核心魔法在于其元类 `SQLModelMetaclass`。它继承自 Pydantic 的 `ModelMetaclass` 和 SQLAlchemy 的 `DeclarativeMeta`（或 2.0 中的 `DeclarativeAttributeIntercept`），在类创建时协调两个框架的属性注册：

```
类创建过程：
                    SQLModelMetaclass.__new__()
                              │
                              ▼
                 ┌─────────────────────────────┐
                 │  1. 收集所有 Field 定义       │
                 │  2. 判断 table=True 或 False  │
                 │                              │
                 │  如果 table=True：            │
                 │    3a. 构建 SQLAlchemy Column  │
                 │    3b. 注册到 metadata       │
                 │    3c. 处理 Relationship      │
                 │                              │
                 │  无论 table 是否为 True：     │
                 │    4. 构建 Pydantic 字段      │
                 │    5. 生成 JSON Schema       │
                 └─────────────────────────────┘
```

**源码级简化示意**：

```python
# SQLModel 元类的核心逻辑（简化版，展示原理）
class SQLModelMetaclass(ModelMetaclass, DeclarativeMeta):
    def __new__(
        mcs,
        name,
        bases,
        namespace,
        table=True,  # SQLModel 特有参数
        **kwargs,
    ):
        # 第一步：让 Pydantic 处理字段验证逻辑
        # ModelMetaclass 会处理 Field、类型注解等
        new_cls = super().__new__(mcs, name, bases, namespace, **kwargs)

        # 第二步：如果 table=True，让 SQLAlchemy 处理 ORM 映射
        if table:
            # 构建 SQLAlchemy Table 对象
            # 将 Field 定义转换为 Column 对象
            # 注册 Relationship
            # 将 Table 添加到 MetaData
            DeclarativeMeta.__init__(mcs, new_cls, bases, namespace)

        return new_cls
```

**关键设计决策**：

1. **Field 双重注册**：同一个 `Field()` 调用同时被 Pydantic 和 SQLAlchemy 解析。Pydantic 提取验证规则（`max_length`、`ge`、`le`等），SQLAlchemy 提取数据库约束（`primary_key`、`index`、`foreign_key`等）

2. **table 参数**：`table=True` 告诉元类"这个类需要映射到数据库表"。`table=False`（默认）则只创建 Pydantic 模型，不生成 SQLAlchemy Table

3. **sa_column 桥接**：当 Field 参数无法满足 SQLAlchemy 的所有需求时，可以通过 `sa_column` 直接传递一个 `Column` 对象，绕过 SQLModel 的自动转换

### 19.2.2 模型继承体系

SQLModel 的模型继承体系是其最精巧的设计之一，也是解决"一套模型"问题的关键：

```python
# 基类：定义公共字段
class HeroBase(SQLModel):
    name: str = Field(max_length=50)
    secret_name: str = Field(max_length=100)
    age: Optional[int] = None

# 数据库表模型：继承基类，添加数据库专用字段
class Hero(HeroBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

# 创建模型：继承基类，不需要 id 和 created_at
class HeroCreate(HeroBase):
    pass  # 与 HeroBase 完全相同

# 更新模型：所有字段可选
class HeroUpdate(SQLModel):
    name: Optional[str] = None
    secret_name: Optional[str] = None
    age: Optional[int] = None

# 响应模型：继承基类，添加 id 和 created_at
class HeroRead(HeroBase):
    id: int
    created_at: datetime.datetime
```

**继承关系图**：

```
                    SQLModel (根基类)
                        │
            ┌───────────┼───────────┐
            │           │           │
        HeroBase    HeroBase    HeroBase
        (table=False) (table=False) (table=False)
            │           │           │
            ▼           ▼           ▼
    HeroCreate    HeroUpdate    HeroRead
    (table=False) (table=False) (table=False)

        HeroBase
        (table=False)
            │
            ▼
         Hero
      (table=True)
```

**继承的关键规则**：

1. `table=True` 只能出现在叶子类中（最终数据库模型）
2. 基类必须设置 `table=False`（或不设置，默认 False）
3. 子类可以覆盖父类字段（如将 `Optional` 改为必填）
4. Pydantic 的 `model_config` 可以在每层独立设置

### 19.2.3 Field 到 Column 的映射机制

SQLModel 在元类创建过程中将 `Field` 参数映射为 SQLAlchemy `Column` 参数：

```
SQLModel Field 参数         SQLAlchemy Column 属性
─────────────────────      ─────────────────────
primary_key=True     →     primary_key=True
foreign_key="t.id"   →     ForeignKey("t.id")
index=True           →     Index 自动创建
unique=True          →     unique=True
nullable=True        →     nullable=True
default=X            →     default=X
default_factory=X    →     default=X (callable)
max_length=N         →     String(N)
sa_column=Column()   →     直接使用，跳过自动映射
sa_column_args=()    →     传递给 Column 构造函数
```

**特殊类型映射**：

```python
from sqlmodel import Field
import datetime

class Example(SQLModel, table=True):
    # Python 类型 → SQLAlchemy 类型映射
    id: Optional[int] = Field(default=None, primary_key=True)           # → Integer
    name: str = Field(max_length=50)                                     # → String(50)
    bio: Optional[str] = Field(default=None)                             # → Text (无 max_length)
    count: int = Field(default=0)                                        # → Integer
    price: float = Field(default=0.0)                                    # → Float
    is_active: bool = Field(default=True)                                # → Boolean
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)  # → DateTime
    birthday: Optional[datetime.date] = None                             # → Date
    data: Optional[dict] = Field(default=None, sa_column=Column(JSON))  # → JSON (需显式指定)
    blob_data: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))  # → LargeBinary
```

### 19.2.4 Relationship 的内部实现

SQLModel 的 `Relationship` 函数是 SQLAlchemy `relationship()` 的薄包装，但做了一些适配：

```python
# SQLModel 的 Relationship
from sqlmodel import Relationship

class Team(SQLModel, table=True):
    heroes: List["Hero"] = Relationship(back_populates="team")

# 等价于 SQLAlchemy 的
from sqlalchemy.orm import relationship, Mapped

class Team(Base):
    heroes: Mapped[List["Hero"]] = relationship(back_populates="team")
```

**Relationship 参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `back_populates` | str | 双向关系的另一端属性名 |
| `link_model` | type | 多对多关联表模型 |
| `sa_relationship` | Relationship | 直接传递 SQLAlchemy relationship 对象 |
| `sa_relationship_args` | tuple | 传递给 relationship 的额外位置参数 |
| `sa_relationship_kwargs` | dict | 传递给 relationship 的额外关键字参数 |

**多对多的 link_model 机制**：

```python
# SQLModel 通过 link_model 参数自动配置多对多
class HeroTeamLink(SQLModel, table=True):
    hero_id: int = Field(foreign_key="heroes.id", primary_key=True)
    team_id: int = Field(foreign_key="teams.id", primary_key=True)

class Hero(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    teams: List["Team"] = Relationship(
        back_populates="heroes",
        link_model=HeroTeamLink,  # 指定关联表
    )

# 内部等价于 SQLAlchemy 的：
# heroes = relationship(
#     "Hero",
#     secondary="heroteamlink",  # 关联表名
#     back_populates="teams",
# )
```

### 19.2.5 session.exec() 与 session.execute() 的区别

SQLModel 为 `Session` 扩展了 `exec()` 方法，它与 SQLAlchemy 原生的 `execute()` 有关键差异：

```python
from sqlmodel import select, Session

# session.exec() —— SQLModel 扩展方法
stmt = select(Hero).where(Hero.age > 25)
result = session.exec(stmt)
heroes = result.all()  # 直接返回 Hero 对象列表

# session.execute() —— SQLAlchemy 原生方法
from sqlalchemy import select as sa_select
stmt = sa_select(Hero).where(Hero.age > 25)
result = session.execute(stmt)
rows = result.all()  # 返回 Row 对象列表，每个 Row 包含 Hero
heroes = [row[0] for row in rows]  # 需要手动提取

# 对于纯 ORM 查询，exec() 更简洁
# 对于包含聚合/标量的复杂查询，execute() 更灵活
```

**exec() 返回的 ScalarResult 的方法**：

| 方法 | 返回类型 | 说明 |
|------|---------|------|
| `.all()` | list[Model] | 返回所有结果 |
| `.first()` | Model \| None | 返回第一个结果 |
| `.one()` | Model | 返回唯一结果，否则抛异常 |
| `.one_or_none()` | Model \| None | 返回唯一结果或 None |

### 19.2.6 model_validate 与 sqlmodel_update

SQLModel 模型继承自 Pydantic BaseModel，因此可以使用 Pydantic V2 的 `model_validate()` 方法：

```python
# 从字典创建 SQLModel 实例
hero_data = {"name": "Spider-Man", "secret_name": "Peter Parker", "age": 25}
hero = Hero.model_validate(hero_data)
# hero 现在是一个 Hero 实例，可以直接 add 到 session

# 从另一个 SQLModel 实例创建（如 HeroCreate → Hero）
hero_create = HeroCreate(name="Batman", secret_name="Bruce Wayne", age=35)
hero = Hero.model_validate(hero_create)
# 这会复制所有匹配的字段

# 部分更新：sqlmodel_update
hero = session.get(Hero, 1)
update_data = {"age": 26}  # 只更新 age
hero.sqlmodel_update(update_data)
# 等价于：
# for key, value in update_data.items():
#     setattr(hero, key, value)
```

---

## 19.3 使用场景

### 19.3.1 快速原型开发

SQLModel 最大的优势在于减少样板代码。在原型阶段，开发者可以快速定义模型并立即用于 API 验证和数据库操作：

```python
# 传统方式：需要定义3-4个类
# HeroBase, HeroCreate, HeroUpdate, HeroRead, Hero(SQLAlchemy)

# SQLModel 快速原型：一个类搞定
from sqlmodel import SQLModel, Field, Session, create_engine

class Item(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    price: float
    description: str | None = None

# 立即可用于 FastAPI
@app.post("/items", response_model=Item)
def create_item(item: Item, session: Session = Depends(get_session)):
    session.add(item)
    session.commit()
    session.refresh(item)
    return item
```

### 19.3.2 渐进式重构

项目初期用 SQLModel 快速开发，后期需要更精细的控制时可以平滑迁移到纯 SQLAlchemy：

```python
# 阶段1：使用 SQLModel 快速开发
class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    price: float

# 阶段2：需要更精细控制时，用 sa_column 逐步替换
from sqlalchemy import Column, Numeric

class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    price: float = Field(sa_column=Column(Numeric(10, 2)))  # 精确小数

# 阶段3：完全迁移到 SQLAlchemy（如果需要）
# SQLModel 模型可以和纯 SQLAlchemy 模型共存
```

### 19.3.3 多租户 SaaS 应用

SQLModel 的继承体系特别适合多租户场景，公共字段在基类中定义一次：

```python
class TenantBase(SQLModel):
    """租户相关模型的公共字段"""
    tenant_id: int = Field(foreign_key="tenants.id")
    created_by: int = Field(foreign_key="users.id")


class TenantModel(TenantBase, table=True):
    """租户隔离的数据模型"""
    __tablename__ = "tenant_models"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    data: str


class TenantModelCreate(TenantBase):
    """创建请求模式"""
    name: str
    data: str


class TenantModelRead(TenantBase):
    """响应模式"""
    id: int
    name: str
    data: str
```

### 19.3.4 配置驱动的外部化模型

利用 SQLModel 的 JSON Schema 生成能力，可以将模型定义外置为配置文件：

```python
import json

# 从 SQLModel 生成 JSON Schema
schema = HeroCreate.model_json_schema()
print(json.dumps(schema, indent=2))
# {
#   "properties": {
#     "name": {"maxLength": 50, "title": "Name", "type": "string"},
#     "secret_name": {"maxLength": 100, "title": "Secret Name", "type": "string"},
#     "age": {"anyOf": [{"type": "integer"}, {"type": "null"}], "default": null, "title": "Age"}
#   },
#   "required": ["name", "secret_name"],
#   "title": "HeroCreate",
#   "type": "object"
# }

# 前端可以直接消费此 Schema 来生成表单
```

### 19.3.5 管理后台快速生成

SQLModel 的元数据可以用于自动生成管理后台界面：

```python
from sqlmodel import SQLModel
from fastapi import FastAPI, Depends
from typing import Type

def create_admin_router(model: Type[SQLModel], session_dep) -> APIRouter:
    """根据 SQLModel 自动生成 CRUD 管理路由"""
    router = APIRouter()

    @router.get(f"/{model.__name__.lower()}/", response_model=list[model])
    async def list_items(session=Depends(session_dep)):
        return (await session.exec(select(model))).all()

    @router.post(f"/{model.__name__.lower()}/", response_model=model)
    async def create_item(item: model, session=Depends(session_dep)):
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return item

    return router
```

---

## 19.4 示例代码

### 19.4.1 完整项目：博客系统

以下是一个完整的博客系统，演示 SQLModel 的各种用法。

**database.py**：

```python
"""数据库配置"""
import os
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.ext.asyncio import (
    AsyncEngine,
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/blog",
)

# 异步引擎
async_engine = create_async_engine(DATABASE_URL, echo=True)

# 异步会话工厂
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_async_session() -> AsyncSession:
    """获取异步会话"""
    async with AsyncSessionLocal() as session:
        yield session
        await session.commit()
```

**models.py**：

```python
"""数据模型定义"""
import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, Text, Index


# ────────── 公共混入 ──────────

class TimestampMixin(SQLModel):
    """时间戳混入"""
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow,
    )
    updated_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow,
        sa_column_kwargs={"onupdate": datetime.datetime.utcnow},
    )


# ────────── 用户模型 ──────────

class UserBase(SQLModel):
    """用户基类"""
    username: str = Field(min_length=3, max_length=50, index=True, unique=True)
    email: str = Field(max_length=255, index=True, unique=True)
    display_name: str = Field(max_length=100)
    bio: Optional[str] = Field(default=None, sa_column=Column(Text))


class User(UserBase, TimestampMixin, table=True):
    """用户数据库模型"""
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str = Field(max_length=255)

    # 关系
    posts: List["Post"] = Relationship(back_populates="author")
    comments: List["Comment"] = Relationship(back_populates="user")


class UserCreate(UserBase):
    """创建用户请求"""
    password: str = Field(min_length=8, max_length=128)


class UserRead(UserBase, TimestampMixin):
    """用户响应"""
    id: int


class UserUpdate(SQLModel):
    """更新用户请求"""
    display_name: Optional[str] = None
    email: Optional[str] = None
    bio: Optional[str] = None


# ────────── 文章模型 ──────────

class PostBase(SQLModel):
    """文章基类"""
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(sa_column=Column(Text))
    is_published: bool = Field(default=False)


class Post(PostBase, TimestampMixin, table=True):
    """文章数据库模型"""
    __tablename__ = "posts"

    id: Optional[int] = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="users.id")

    # 关系
    author: Optional[User] = Relationship(back_populates="posts")
    comments: List["Comment"] = Relationship(back_populates="post")
    tags: List["Tag"] = Relationship(back_populates="posts", link_model=PostTag)

    __table_args__ = (
        Index("ix_posts_author_published", "author_id", "is_published"),
    )


class PostCreate(PostBase):
    """创建文章请求"""
    tag_names: List[str] = []


class PostRead(PostBase, TimestampMixin):
    """文章响应"""
    id: int
    author_id: int
    author: Optional[UserRead] = None
    tags: List["TagRead"] = []


class PostUpdate(SQLModel):
    """更新文章请求"""
    title: Optional[str] = None
    content: Optional[str] = None
    is_published: Optional[bool] = None


# ────────── 评论模型 ──────────

class CommentBase(SQLModel):
    """评论基类"""
    content: str = Field(max_length=2000)


class Comment(CommentBase, TimestampMixin, table=True):
    """评论数据库模型"""
    __tablename__ = "comments"

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="posts.id")
    user_id: int = Field(foreign_key="users.id")

    post: Optional[Post] = Relationship(back_populates="comments")
    user: Optional[User] = Relationship(back_populates="comments")


class CommentCreate(CommentBase):
    """创建评论请求"""
    pass


class CommentRead(CommentBase, TimestampMixin):
    """评论响应"""
    id: int
    post_id: int
    user_id: int
    user: Optional[UserRead] = None


# ────────── 标签模型 ──────────

class TagBase(SQLModel):
    """标签基类"""
    name: str = Field(max_length=50, unique=True, index=True)


class Tag(TagBase, table=True):
    """标签数据库模型"""
    __tablename__ = "tags"

    id: Optional[int] = Field(default=None, primary_key=True)
    posts: List["Post"] = Relationship(back_populates="tags", link_model=PostTag)


class TagRead(TagBase):
    """标签响应"""
    id: int


# ────────── 关联表 ──────────

class PostTag(SQLModel, table=True):
    """文章-标签多对多关联表"""
    __tablename__ = "post_tags"

    post_id: int = Field(foreign_key="posts.id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.id", primary_key=True)
```

**crud.py**：

```python
"""CRUD 操作封装"""
from sqlmodel import select, Session
from sqlmodel.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Sequence


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    stmt = select(User).where(User.username == username)
    result = await db.exec(stmt)
    return result.first()


async def create_user(db: AsyncSession, user_in: UserCreate) -> User:
    # 在实际应用中应使用 passlib 或 bcrypt 哈希密码
    hashed = f"hashed_{user_in.password}"  # 仅示意
    user = User(
        username=user_in.username,
        email=user_in.email,
        display_name=user_in.display_name,
        bio=user_in.bio,
        hashed_password=hashed,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def create_post(
    db: AsyncSession,
    post_in: PostCreate,
    author_id: int,
) -> Post:
    post = Post(
        title=post_in.title,
        content=post_in.content,
        is_published=post_in.is_published,
        author_id=author_id,
    )
    db.add(post)
    await db.flush()

    # 处理标签
    for tag_name in post_in.tag_names:
        tag_stmt = select(Tag).where(Tag.name == tag_name)
        tag_result = await db.exec(tag_stmt)
        tag = tag_result.first()
        if tag is None:
            tag = Tag(name=tag_name)
            db.add(tag)
            await db.flush()
        # 创建关联
        link = PostTag(post_id=post.id, tag_id=tag.id)
        db.add(link)

    await db.commit()
    await db.refresh(post)
    return post


async def get_post_with_relations(db: AsyncSession, post_id: int) -> Post | None:
    """获取文章及其关联数据"""
    stmt = (
        select(Post)
        .where(Post.id == post_id)
        .options(
            selectinload(Post.author),
            selectinload(Post.tags),
            selectinload(Post.comments).selectinload(Comment.user),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_posts_paginated(
    db: AsyncSession,
    page: int = 1,
    size: int = 20,
    published_only: bool = True,
) -> tuple[Sequence[Post], int]:
    """分页列出文章"""
    from sqlalchemy import func

    base_stmt = select(Post)
    if published_only:
        base_stmt = base_stmt.where(Post.is_published.is_(True))

    # 计数
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar()

    # 分页
    stmt = (
        base_stmt
        .options(selectinload(Post.author), selectinload(Post.tags))
        .order_by(Post.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    posts = result.scalars().all()

    return posts, total


async def create_comment(
    db: AsyncSession,
    post_id: int,
    user_id: int,
    content: str,
) -> Comment:
    comment = Comment(
        content=content,
        post_id=post_id,
        user_id=user_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


async def add_tag_to_post(db: AsyncSession, post_id: int, tag_name: str) -> Post:
    """给文章添加标签"""
    # 获取或创建标签
    tag_stmt = select(Tag).where(Tag.name == tag_name)
    tag_result = await db.exec(tag_stmt)
    tag = tag_result.first()
    if tag is None:
        tag = Tag(name=tag_name)
        db.add(tag)
        await db.flush()

    # 检查关联是否已存在
    link_stmt = select(PostTag).where(
        PostTag.post_id == post_id,
        PostTag.tag_id == tag.id,
    )
    link_result = await db.exec(link_stmt)
    if link_result.first() is None:
        link = PostTag(post_id=post_id, tag_id=tag.id)
        db.add(link)
        await db.commit()

    return await get_post_with_relations(db, post_id)
```

**main.py**：

```python
"""FastAPI 应用入口"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status, Query
from sqlmodel import select
from sqlmodel.ext.asyncio import AsyncSession

from .database import async_engine, AsyncSessionLocal, get_async_session
from .models import (
    SQLModel, User, UserCreate, UserRead, UserUpdate,
    Post, PostCreate, PostRead, PostUpdate,
    Comment, CommentCreate, CommentRead,
    Tag, TagRead, PostTag,
)
from . import crud


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    await async_engine.dispose()


app = FastAPI(title="SQLModel Blog", lifespan=lifespan)


# ────────── 用户路由 ──────────

@app.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user_endpoint(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_async_session),
):
    existing = await crud.get_user_by_username(db, user_in.username)
    if existing:
        raise HTTPException(status_code=409, detail="Username exists")
    return await crud.create_user(db, user_in)


@app.get("/users/{user_id}", response_model=UserRead)
async def read_user(user_id: int, db: AsyncSession = Depends(get_async_session)):
    user = await crud.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ────────── 文章路由 ──────────

@app.post("/posts", response_model=PostRead, status_code=status.HTTP_201_CREATED)
async def create_post_endpoint(
    post_in: PostCreate,
    author_id: int,  # 实际中从认证信息获取
    db: AsyncSession = Depends(get_async_session),
):
    return await crud.create_post(db, post_in, author_id)


@app.get("/posts", response_model=dict)
async def list_posts_endpoint(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_session),
):
    posts, total = await crud.list_posts_paginated(db, page, size)
    return {"total": total, "page": page, "size": size, "items": posts}


@app.get("/posts/{post_id}", response_model=PostRead)
async def read_post(post_id: int, db: AsyncSession = Depends(get_async_session)):
    post = await crud.get_post_with_relations(db, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


# ────────── 评论路由 ──────────

@app.post(
    "/posts/{post_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment_endpoint(
    post_id: int,
    comment_in: CommentCreate,
    user_id: int,  # 实际中从认证信息获取
    db: AsyncSession = Depends(get_async_session),
):
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return await crud.create_comment(db, post_id, user_id, comment_in.content)


# ────────── 标签路由 ──────────

@app.post("/posts/{post_id}/tags/{tag_name}", response_model=PostRead)
async def add_tag_endpoint(
    post_id: int,
    tag_name: str,
    db: AsyncSession = Depends(get_async_session),
):
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return await crud.add_tag_to_post(db, post_id, tag_name)
```

### 19.4.2 高级模式：sa_column 自定义

当 SQLModel 的 Field 无法满足需求时，可以通过 `sa_column` 直接传递 SQLAlchemy Column：

```python
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime
from sqlalchemy import func
import datetime


class Product(SQLModel, table=True):
    """产品模型——演示 sa_column 高级用法"""

    id: int | None = Field(default=None, primary_key=True)

    # 精确小数：Field 不支持 Numeric，必须用 sa_column
    price: float = Field(
        sa_column=Column(Numeric(10, 2), nullable=False)
    )

    # 带服务器端默认值的字段
    code: str = Field(
        sa_column=Column(
            String(20),
            unique=True,
            server_default=func.generate_product_code(),  # PostgreSQL 函数
        )
    )

    # 全文搜索字段（PostgreSQL tsvector）
    search_vector: str | None = Field(
        default=None,
        sa_column=Column(
            "search_vector",
            Text,
            nullable=True,
        ),
    )

    # 带触发器的时间戳
    updated_at: datetime.datetime = Field(
        sa_column=Column(
            DateTime,
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        )
    )
```

### 19.4.3 自定义验证器

SQLModel 支持在模型上添加 Pydantic 验证器：

```python
from sqlmodel import SQLModel, Field
from pydantic import field_validator, model_validator


class Account(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(max_length=255)
    password: str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email format")
        return v.lower()

    @model_validator(mode="after")
    def passwords_match(self) -> "Account":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self
```

### 19.4.4 读取模式排除敏感字段

```python
class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str
    email: str
    hashed_password: str  # 敏感字段，不应出现在响应中
    is_superuser: bool = False


class UserRead(SQLModel):
    """安全响应模式：排除密码和超管标识"""
    id: int
    username: str
    email: str

    model_config = {"from_attributes": True}
```

### 19.4.5 同步与异步模式切换

SQLModel 支持同步和异步两种模式，可以在同一项目中混用：

```python
"""同步与异步混用示例"""
from sqlmodel import SQLModel, Session, create_engine, select
from sqlmodel.ext.asyncio import AsyncSession, create_async_engine


# 同步引擎（用于脚本、测试、简单场景）
sync_engine = create_engine("sqlite:///dev.db")
sync_session = Session(sync_engine)

# 异步引擎（用于 FastAPI 应用）
async_engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")

# 同步操作
def sync_seed_data():
    with Session(sync_engine) as session:
        hero = Hero(name="Superman", secret_name="Clark Kent", age=30)
        session.add(hero)
        session.commit()

# 异步操作
async def async_get_heroes():
    async with AsyncSession(async_engine) as session:
        result = await session.exec(select(Hero))
        return result.all()
```

---

## 19.5 常见陷阱与最佳实践

### 19.5.1 陷阱：table=True 与 table=False 的混淆

**错误**：在非数据库模型上设置 `table=True`

```python
# 错误：HeroCreate 不应该有 table=True
class HeroCreate(SQLModel, table=True):  # 会导致创建一个意外的数据库表
    name: str
    secret_name: str
```

**正确**：只有实际映射数据库表的模型才设置 `table=True`

```python
# 正确
class Hero(SQLModel, table=True):      # 数据库表
    id: int | None = Field(default=None, primary_key=True)
    name: str
    secret_name: str

class HeroCreate(SQLModel):             # 请求验证模型
    name: str
    secret_name: str
```

### 19.5.2 陷阱：关系字段出现在创建/更新模式中

**错误**：在 Create 模式中包含关系字段

```python
class HeroCreate(SQLModel):
    name: str
    team_id: int | None = Field(default=None, foreign_key="teams.id")
    team: Team | None = None  # 错误！关系不应出现在请求模式中
    # 客户端不应该发送 team 对象，只发送 team_id
```

**正确**：关系字段只在 Read 模式和 table 模型中出现

```python
class HeroCreate(SQLModel):
    name: str
    team_id: int | None = Field(default=None, foreign_key="teams.id")
    # 不包含 team 关系

class HeroRead(SQLModel):
    id: int
    name: str
    team_id: int | None
    team: TeamRead | None = None  # 只在响应中返回关系数据
```

### 19.5.3 陷阱：Optional 字段的数据库语义

**错误**：混淆 Python `Optional` 和数据库 `NULL`

```python
class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    age: int | None = None  # 这意味着什么？
    # Python: age 可以是 int 或 None
    # 数据库: age 列默认允许 NULL（因为类型是 Optional）
    # 但如果你希望 age 必须提供，只是可以是 None：
```

**正确**：明确区分"字段可选"和"值可空"

```python
from pydantic import Field as PydanticField

class HeroCreate(SQLModel):
    # 方式1：age 必须提供，但可以是 None
    age: int | None  # 请求体中必须包含 age 字段，值可以是 null

    # 方式2：age 完全可选（可以不提供）
    age: int | None = None  # 请求体中可以省略 age

class Hero(SQLModel, table=True):
    # 数据库列：允许 NULL
    age: int | None = Field(default=None, nullable=True)

    # 数据库列：NOT NULL，有默认值
    is_active: bool = Field(default=True, nullable=False)
```

### 19.5.4 陷阱：SQLModel 版本与 Pydantic V1/V2 兼容性

**问题**：SQLModel 0.0.14 之前的版本使用 Pydantic V1 API

```python
# 旧版（Pydantic V1 风格）
hero = Hero.parse_obj(data)        # V1: parse_obj
hero_dict = hero.dict()            # V1: dict()
Hero.schema()                       # V1: schema()

# 新版（Pydantic V2 风格）
hero = Hero.model_validate(data)    # V2: model_validate
hero_dict = hero.model_dump()       # V2: model_dump
Hero.model_json_schema()            # V2: model_json_schema
```

**最佳实践**：始终使用 SQLModel 0.0.14+ 和 Pydantic V2 语法

### 19.5.5 陷阱：session.exec() 与 await 的误用

**错误**：在异步上下文中使用同步 `exec()`

```python
# 错误：AsyncSession.exec() 需要 await
async with AsyncSession(async_engine) as session:
    result = session.exec(select(Hero))  # 缺少 await！
    # 返回的是 Awaitable 而不是结果
```

**正确**：异步会话中所有操作都需要 await

```python
async with AsyncSession(async_engine) as session:
    result = await session.exec(select(Hero))  # 正确
    heroes = result.all()
```

### 19.5.6 最佳实践：模型分层策略

推荐使用以下分层策略组织 SQLModel 模型：

```
models/
├── base.py          # 基类和混入（TimestampMixin, SoftDeleteMixin）
├── user.py          # 用户相关模型
├── post.py          # 文章相关模型
├── comment.py       # 评论相关模型
└── __init__.py      # 重导出所有模型
```

```python
# base.py
class TimestampMixin(SQLModel):
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    updated_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)


class SoftDeleteMixin(SQLModel):
    is_deleted: bool = Field(default=False, index=True)
    deleted_at: datetime.datetime | None = None


# user.py
class UserBase(SQLModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(max_length=255)


class User(UserBase, TimestampMixin, SoftDeleteMixin, table=True):
    id: int | None = Field(default=None, primary_key=True)
    hashed_password: str


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserRead(UserBase):
    id: int
    created_at: datetime.datetime
```

### 19.5.7 最佳实践：使用 sa_column 应对复杂场景

SQLModel 的 Field 抽象层不能覆盖 SQLAlchemy Column 的所有功能。以下场景应使用 `sa_column`：

| 场景 | Field 的局限 | sa_column 解决方案 |
|------|-------------|------------------|
| 精确小数 | 不支持 `Numeric` | `sa_column=Column(Numeric(10,2))` |
| 复合索引 | 不支持 | `sa_column_kwargs` + `__table_args__` |
| 服务器端默认值 | 不支持 `server_default` | `sa_column=Column(String, server_default="active")` |
| 数据库函数默认值 | 不支持 `func.now()` | `sa_column=Column(DateTime, server_default=func.now())` |
| 自定义类型 | 不支持 | `sa_column=Column(custom_type)` |
| Computed 列 | 不支持 | `sa_column=Column(String, Computed("..."))` |

### 19.5.8 最佳实践：测试策略

```python
"""SQLModel 测试最佳实践"""
import pytest
from sqlmodel import SQLModel, Session, create_engine, select
from sqlmodel.ext.asyncio import AsyncSession, create_async_engine


# 使用 SQLite 内存数据库进行测试
TEST_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_URL, echo=False)


@pytest.fixture(autouse=True)
async def setup_database():
    """每个测试前创建表，测试后删除"""
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest.fixture
async def db_session():
    async with AsyncSession(test_engine) as session:
        yield session


async def test_create_hero(db_session: AsyncSession):
    hero = Hero(name="Test Hero", secret_name="Secret", age=25)
    db_session.add(hero)
    await db_session.commit()
    await db_session.refresh(hero)

    assert hero.id is not None
    assert hero.name == "Test Hero"


async def test_hero_query(db_session: AsyncSession):
    # 准备数据
    hero1 = Hero(name="Hero1", secret_name="S1", age=25)
    hero2 = Hero(name="Hero2", secret_name="S2", age=30)
    db_session.add_all([hero1, hero2])
    await db_session.commit()

    # 查询
    stmt = select(Hero).where(Hero.age > 26)
    result = await db_session.exec(stmt)
    heroes = result.all()

    assert len(heroes) == 1
    assert heroes[0].name == "Hero2"
```

### 19.5.9 最佳实践：与 Alembic 集成

SQLModel 与 Alembic 的集成方式与纯 SQLAlchemy 相同，但需要注意 `target_metadata` 的设置：

```python
# alembic/env.py
from sqlmodel import SQLModel
from app.models import *  # 确保所有模型被导入

# SQLModel.metadata 等价于 SQLAlchemy 的 Base.metadata
target_metadata = SQLModel.metadata

# 其余配置与普通 SQLAlchemy 相同
def run_migrations_online():
    connectable = create_async_engine(DATABASE_URL)
    async with connectable.connect() as connection:
        await connection.run_sync(
            do_run_migrations,
            target_metadata,
        )
```

### 19.5.10 最佳实践：何时选择 SQLModel vs 纯 SQLAlchemy

| 维度 | SQLModel | 纯 SQLAlchemy + Pydantic |
|------|----------|-------------------------|
| 学习曲线 | 低（一套模型） | 高（两套模型） |
| 代码量 | 少 30-50% | 多 |
| 灵活性 | 中等（复杂场景需 sa_column） | 完全灵活 |
| 社区生态 | 较新，生态较小 | 成熟，生态丰富 |
| 调试难度 | 较高（元类魔法） | 较低（逻辑清晰） |
| 团队协作 | 适合小团队快速迭代 | 适合大团队长期维护 |
| 数据库高级特性 | 需要退回到 sa_column | 原生支持 |
| 性能优化 | 受限于 Field 抽象层 | 完全控制 |

**推荐决策**：
- 新项目、小团队、快速迭代 → SQLModel
- 大项目、复杂查询、长期维护 → 纯 SQLAlchemy + Pydantic
- 已有 SQLAlchemy 项目 → 无需迁移，可以逐步引入 SQLModel 用于新功能