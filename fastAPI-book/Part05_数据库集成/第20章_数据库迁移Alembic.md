# 第20章 数据库迁移（Alembic）

## 20.1 概念与语法

### 20.1.1 数据库迁移的必要性

在软件开发中，数据库 schema 会随着业务演进不断变化——新增字段、修改约束、创建索引、重命名表等。如果直接在数据库上执行 DDL 语句，会面临以下问题：

1. **不可追溯**：无法知道数据库当前处于哪个版本状态
2. **不可回滚**：变更出错后无法自动回退到上一个安全状态
3. **不可协作**：团队成员之间的 schema 变更无法自动同步
4. **不可重复**：在新环境（开发、测试、生产）中难以重现相同的 schema 状态

Alembic 是 SQLAlchemy 生态中的数据库迁移工具，它将每一次 schema 变更记录为一个**迁移脚本（migration script）**，形成一条有序的**版本链**，支持前进（upgrade）和后退（downgrade），确保数据库状态始终可控。

### 20.1.2 Alembic 核心概念

| 概念 | 说明 |
|------|------|
| **Migration** | 一次数据库变更，对应一个 Python 脚本文件 |
| **Revision** | 迁移脚本的唯一标识，通常是哈希字符串（如 `a1b2c3d4e5f6`） |
| **Chain** | 迁移脚本形成的链表，每个脚本指向其前驱（down_revision） |
| **Branch** | 从链表某节点分叉出的独立迁移序列 |
| **Head** | 迁移链的最新版本（可以有多个 head，对应多个分支） |
| **Base** | 迁移链的起点，通常是一个空数据库 |
| **Upgrade** | 从当前版本前进到目标版本 |
| **Downgrade** | 从当前版本后退到目标版本 |
| **Autogenerate** | 根据 SQLAlchemy 模型与数据库实际 schema 的差异，自动生成迁移脚本 |
| **Stamp** | 标记数据库的当前版本，不执行实际变更 |

### 20.1.3 安装与初始化

```bash
# 安装 Alembic
pip install alembic

# 在项目根目录初始化
cd /path/to/project
alembic init alembic
# 生成以下文件结构：
# alembic/
#   ├── versions/        # 迁移脚本目录
#   │   └── (空)
#   ├── env.py           # 环境配置（核心）
#   ├── script.py.mako   # 迁移脚本模板
#   └── README
# alembic.ini           # Alembic 主配置文件
```

### 20.1.4 alembic.ini 配置文件

```ini
# alembic.ini — Alembic 主配置

[alembic]
# 迁移脚本目录
script_location = alembic

# 模板渲染引擎
# file_template = %%(rev)s_%%(slug)s

# 数据库连接字符串（推荐从环境变量读取，不硬编码）
sqlalchemy.url = postgresql://user:pass@localhost/mydb

# 日志配置
[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

### 20.1.5 env.py 环境配置

`env.py` 是 Alembic 的核心配置文件，控制迁移的运行环境：

```python
"""Alembic 环境配置"""
import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# Alembic Config 对象
config = context.config

# 设置日志
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ─── 关键配置 ───

# 1. 导入你的 SQLAlchemy Base（或 SQLModel）
from app.models import Base  # 或 from app.models import SQLModel
target_metadata = Base.metadata  # 或 SQLModel.metadata

# 2. 从环境变量覆盖数据库连接字符串
database_url = os.getenv("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

# 3. 异步支持标志
# 如果使用异步引擎，需要设置 run_async_migrations
RUN_ASYNC = os.getenv("ALEMBIC_ASYNC", "false").lower() == "true"


def run_migrations_offline():
    """离线模式：只生成 SQL 语句不执行"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """在线模式：连接数据库执行迁移"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # 迁移时不用连接池
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 20.1.6 异步 env.py 配置

当使用异步数据库驱动时，env.py 需要特殊处理：

```python
"""异步 Alembic 环境配置"""
import os
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from alembic import context

from app.database import async_engine  # 你的异步引擎
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# 从环境变量设置 URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/db")
config.set_main_option("sqlalchemy.url", DATABASE_URL)


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection):
    """在给定连接上执行迁移"""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # 比较类型变更（默认只比较表结构，不比较列类型）
        compare_type=True,
        # 渲染项目自定义类型
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    """异步模式执行迁移"""
    connectable = async_engine
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online():
    """在线模式入口"""
    asyncio.run(run_async_migrations())


def render_item(type_, obj, autogen_context):
    """自定义类型渲染"""
    if type_ == "type" and isinstance(obj, MyCustomType):
        return f"custom.{obj.__class__.__name__}()"
    return False  # 使用默认渲染


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 20.1.7 迁移脚本结构

每个迁移脚本由 `upgrade()` 和 `downgrade()` 两个函数组成：

```python
"""create users table

Revision ID: a1b2c3d4e5f6
Revises: None
Create Date: 2024-01-15 10:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "a1b2c3d4e5f6"
down_revision = None  # 第一个迁移
branch_labels = None
depends_on = None


def upgrade() -> None:
    """前进：创建 users 表"""
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(50), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    # 创建索引
    op.create_index("ix_users_username", "users", ["username"])


def downgrade() -> None:
    """后退：删除 users 表"""
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
```

### 20.1.8 常用命令

```bash
# 自动生成迁移（对比模型与数据库差异）
alembic revision --autogenerate -m "add users table"

# 手动创建空迁移脚本
alembic revision -m "custom data migration"

# 升级到最新版本
alembic upgrade head

# 升级到指定版本
alembic upgrade a1b2c3d4e5f6

# 升级一个版本
alembic upgrade +1

# 降级一个版本
alembic downgrade -1

# 降级到指定版本
alembic downgrade a1b2c3d4e5f6

# 降级到初始状态（删除所有表）
alembic downgrade base

# 查看当前版本
alembic current

# 查看迁移历史
alembic history

# 查看详细历史（含信息）
alembic history --verbose

# 查看两个版本之间的 SQL（不执行）
alembic show a1b2c3d4e5f6

# 生成 SQL 不执行（离线模式）
alembic upgrade head --sql

# 标记当前版本（不执行迁移）
alembic stamp head

# 合并分支
alembic merge -m "merge branches" head1 head2
```

---

## 20.2 原理与机制

### 20.2.1 版本图与链表结构

Alembic 使用**单向链表**结构管理迁移版本。每个迁移脚本通过 `down_revision` 字段指向前一个版本：

```
None ──→ [a1b2] ──→ [c3d4] ──→ [e5f6] ──→ [g7h8]  ← head
          创建       添加       修改        创建
          users表    posts表    email列     orders表
```

**版本图的数据结构**：

```python
# Alembic 内部维护的版本图（简化示意）
class RevisionMap:
    """版本图：管理所有迁移脚本的依赖关系"""

    def __init__(self, revisions: list[Revision]):
        self._revisions = {r.revision: r for r in revisions}
        self._heads = []    # 当前所有 head 节点
        self._bases = []    # 起始节点

    def get_revision(self, id: str) -> Revision:
        return self._revisions[id]

    def _add_revision(self, revision: Revision):
        if revision.down_revision is None:
            self._bases.append(revision)
        else:
            # 将此 revision 链接到前驱节点之后
            prev = self._revisions[revision.down_revision]
            prev.next_rev = revision.revision
        self._heads.append(revision)


class Revision:
    """单个迁移版本"""
    revision: str          # 唯一标识（哈希）
    down_revision: str | None  # 前驱版本
    next_rev: str | None   # 后继版本
    branch_labels: list    # 分支标签
    dependencies: list      # 跨分支依赖
```

**分支场景**：

当两个开发者同时从同一个版本创建迁移时，会产生分支：

```
                    ┌── [branch_a] ← head1
[a1b2] ──→ [c3d4] ─┤
                    └── [branch_b] ← head2
```

此时数据库有两个 head，Alembic 要求合并后才能继续：

```bash
# 合并两个分支
alembic merge -m "merge" branch_a branch_b

# 合并后的版本图：
#                     ┌── [branch_a] ──┐
# [a1b2] ──→ [c3d4] ─┤                ├── [merge_rev] ← head
#                     └── [branch_b] ──┘
```

### 20.2.2 Autogenerate 机制

Autogenerate 是 Alembic 最强大的功能——自动对比 SQLAlchemy 模型定义与数据库实际 schema 的差异，生成迁移脚本。

**工作流程**：

```
1. 读取 target_metadata（SQLAlchemy 模型定义的 schema）
2. 连接数据库，反射（reflect）当前实际 schema
3. 对比两者差异
4. 生成包含差异操作的迁移脚本
```

**对比维度**：

| 对比项 | 默认是否检测 | 说明 |
|--------|------------|------|
| 新增/删除表 | 是 | 表的存在性 |
| 新增/删除列 | 是 | 列的存在性 |
| 列类型变更 | 否（默认关闭） | 需设置 `compare_type=True` |
| 列 nullable 变更 | 是 | NOT NULL ↔ NULL |
| 索引变更 | 是 | 新增/删除索引 |
| 唯一约束变更 | 是 | 新增/删除唯一约束 |
| 外键变更 | 是 | 新增/删除外键 |
| CHECK 约束 | 部分 | 部分支持 |
| 列默认值变更 | 部分 | server_default 对比 |
| 列重命名 | 否 | 无法区分重命名与删除+新增 |
| 表重命名 | 否 | 无法区分重命名与删除+新建 |
| 数据迁移 | 否 | Autogenerate 不生成数据操作 |

**Autogenerate 的局限性**：

Alembic 无法区分"重命名"和"删除+新建"。例如，将 `name` 列重命名为 `full_name`，Alembic 会生成"删除 name 列，添加 full_name 列"，这会导致数据丢失。对于这类场景，必须手动编写迁移脚本。

### 20.2.3 op 操作指令系统

`op` 模块是 Alembic 提供的迁移操作 API，它将 DDL 操作抽象为 Python 函数调用：

```python
from alembic import op
import sqlalchemy as sa

# ─── 表操作 ───

op.create_table(
    "users",
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("name", sa.String(50)),
)

op.drop_table("users")

op.rename_table("users", "accounts")

# ─── 列操作 ───

op.add_column("users", sa.Column("email", sa.String(255)))

op.drop_column("users", "email")

op.alter_column(
    "users", "name",
    new_column_name="full_name",  # 重命名
    type_=sa.String(100),          # 修改类型
    nullable=False,                # 修改 nullable
    server_default="unnamed",      # 修改默认值
    existing_type=sa.String(50),   # 指定现有类型（某些数据库需要）
)

# ─── 索引操作 ───

op.create_index("ix_users_email", "users", ["email"], unique=True)
op.drop_index("ix_users_email", table_name="users")

# ─── 外键操作 ───

op.create_foreign_key(
    "fk_posts_user_id",
    "posts",           # 源表
    "users",           # 目标表
    ["user_id"],       # 源列
    ["id"],            # 目标列
    ondelete="CASCADE",
)

op.drop_constraint("fk_posts_user_id", "posts", type_="foreignkey")

# ─── 唯一约束 ───

op.create_unique_constraint("uq_users_email", "users", ["email"])
op.drop_constraint("uq_users_email", "users", type_="unique")

# ─── CHECK 约束 ───

op.create_check_constraint(
    "ck_users_age_positive",
    "users",
    sa.column("age") > 0,
)

# ─── 执行原始 SQL ───

op.execute("UPDATE users SET status = 'active' WHERE status IS NULL")

# ─── 批量操作（SQLite 兼容） ───

with op.batch_alter_table("users") as batch_op:
    batch_op.add_column(sa.Column("email", sa.String(255)))
    batch_op.alter_column("name", new_column_name="full_name")
    batch_op.drop_column("old_column")
```

### 20.2.4 批量操作与 SQLite 兼容

SQLite 不支持大多数 ALTER TABLE 操作（如 DROP COLUMN、ALTER COLUMN 等）。Alembic 提供了 `batch_alter_table` 机制来解决这个问题：

```
SQLite batch ALTER TABLE 原理：

1. 创建新表（包含期望的 schema）
2. 从旧表复制数据到新表
3. 删除旧表
4. 重命名新表为旧表名
5. 重建索引和约束
```

```python
def upgrade():
    # SQLite 兼容的批量操作
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("email", sa.String(255)))
        batch_op.alter_column("name", new_column_name="full_name")
        batch_op.drop_column("deprecated_column")
        batch_op.create_index("ix_users_email", ["email"])

def downgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_email")
        batch_op.drop_column("email")
        batch_op.alter_column("full_name", new_column_name="name")
        batch_op.add_column(sa.Column("deprecated_column", sa.String))
```

### 20.2.5 迁移事务性

Alembic 的迁移在事务中执行，但事务性取决于数据库方言：

| 数据库 | DDL 事务性 | 说明 |
|--------|-----------|------|
| PostgreSQL | 支持 | DDL 可以在事务中回滚 |
| MySQL / MariaDB | 不支持 | DDL 自动提交 |
| SQLite | 支持 | 但 batch 操作不使用事务 |
| SQL Server | 不支持 | 部分操作不支持 |
| Oracle | 不支持 | DDL 自动提交 |

对于不支持 DDL 事务的数据库，如果迁移中途失败，数据库可能处于不一致状态。最佳实践是：**每次迁移只做最小范围的变更，并确保 downgrade 可用**。

### 20.2.6 Alembic 与 SQLAlchemy 版本对照

| Alembic 版本 | SQLAlchemy 版本 | Python 版本 | 说明 |
|-------------|----------------|------------|------|
| 1.7.x | 1.4+ | 3.7+ | 稳定版 |
| 1.8.x | 1.4+ | 3.7+ | 新增 type rendering |
| 1.9.x | 1.4+ | 3.7+ | 性能优化 |
| 1.10.x | 1.4+ | 3.8+ | 异步改进 |
| 1.11.x | 1.4+ | 3.8+ | 分支管理增强 |
| 1.12.x | 1.4+ | 3.8+ | 最新稳定版 |
| 1.13.x | 2.0+ | 3.8+ | SQLAlchemy 2.0 适配 |

---

## 20.3 使用场景

### 20.3.1 开发阶段：迭代式 Schema 变更

在开发阶段，模型频繁变更，需要频繁生成迁移：

```bash
# 添加新模型字段后
# 1. 修改 models.py
# 2. 自动生成迁移
alembic revision --autogenerate -m "add phone to user"

# 3. 检查生成的迁移脚本（重要！）
# 打开 alembic/versions/xxx_add_phone_to_user.py
# 确认 upgrade() 和 downgrade() 正确

# 4. 应用迁移
alembic upgrade head

# 5. 如果有问题，回滚
alembic downgrade -1
```

### 20.3.2 CI/CD 集成

在 CI/CD 流水线中自动运行迁移：

```yaml
# GitHub Actions 示例
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - name: Run migrations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          alembic upgrade head
      - name: Verify migration status
        run: |
          alembic check  # 检查是否有未应用的变更
```

### 20.3.3 生产环境：零停机迁移

在生产环境中，迁移必须考虑零停机和向后兼容：

```python
# 阶段1：添加可空列（向后兼容）
def upgrade():
    op.add_column("users", sa.Column("phone", sa.String(20), nullable=True))
    # 旧代码不使用 phone 列，可以正常运行

# 阶段2：部署新代码（使用 phone 列）

# 阶段3：数据回填
def upgrade():
    op.execute("""
        UPDATE users SET phone = '' WHERE phone IS NULL
    """)

# 阶段4：添加 NOT NULL 约束
def upgrade():
    op.alter_column("users", "phone", nullable=False)
```

### 20.3.4 数据迁移

除 schema 变更外，Alembic 也可用于数据迁移：

```python
"""data migration: normalize email format

Revision ID: x1y2z3
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    # 创建临时 ORM 表进行数据操作
    users = sa.table(
        "users",
        sa.column("id", sa.Integer),
        sa.column("email", sa.String),
    )
    # 批量更新
    op.execute(
        users.update().values(email=sa.func.lower(users.c.email))
    )


def downgrade():
    # 数据迁移通常不可逆
    # 可以记录一个警告或抛出异常
    raise NotImplementedError("Cannot reverse email normalization")
```

### 20.3.5 多环境管理

不同环境（开发、测试、预发、生产）需要不同的迁移策略：

```python
# env.py 中的环境适配
import os

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

def run_migrations_online():
    configuration = config.get_section(config.config_ini_section)

    if ENVIRONMENT == "production":
        # 生产环境：更保守的策略
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=False,       # 不自动检测类型变更
            compare_server_default=False,  # 不自动检测默认值变更
            render_as_batch=False,
        )
    elif ENVIRONMENT == "development":
        # 开发环境：更宽松
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
```

### 20.3.6 多数据库支持

当应用需要支持多种数据库时，迁移脚本需要考虑方言差异：

```python
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql, mysql

def upgrade():
    # 方言检测
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # PostgreSQL 特有操作
        op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
        op.add_column("users", sa.Column(
            "uuid", postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
        ))
    elif dialect == "mysql":
        op.add_column("users", sa.Column(
            "uuid", sa.String(36),
            server_default=sa.text("UUID()"),
        ))
    else:
        # SQLite 等其他数据库
        import uuid
        op.add_column("users", sa.Column("uuid", sa.String(36)))
```

---

## 20.4 示例代码

### 20.4.1 完整项目配置

以下是一个完整的 FastAPI + Alembic 项目配置。

**项目结构**：

```
project/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── database.py
│   ├── models/
│   │   ├── __init__.py      # 导入所有模型
│   │   ├── user.py
│   │   ├── post.py
│   │   └── base.py
│   └── config.py
├── alembic/
│   ├── versions/
│   ├── env.py
│   ├── script.py.mako
│   └── README
├── alembic.ini
├── requirements.txt
└── .env
```

**app/config.py**：

```python
"""应用配置"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost/fastapi_demo"
    DEBUG: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
```

**app/database.py**：

```python
"""数据库连接配置"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=20,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
)
```

**app/models/base.py**：

```python
"""模型基类"""
from sqlalchemy.orm import DeclarativeBase
import datetime
from sqlalchemy import Column, DateTime, func


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
```

**app/models/user.py**：

```python
"""用户模型"""
from sqlalchemy import Column, Integer, String, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_username_lower", "username"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    full_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    posts: Mapped[list["Post"]] = relationship(back_populates="author")
```

**app/models/post.py**：

```python
"""文章模型"""
from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class Post(TimestampMixin, Base):
    __tablename__ = "posts"
    __table_args__ = (
        Index("ix_posts_author_published", "author_id", "is_published"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    author_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )

    author: Mapped["User"] = relationship(back_populates="posts")
```

**app/models/__init__.py**：

```python
"""模型包——确保所有模型被导入"""
from .base import Base, TimestampMixin
from .user import User
from .post import Post

__all__ = ["Base", "TimestampMixin", "User", "Post"]
```

### 20.4.2 env.py 完整配置（异步）

```python
"""Alembic 环境配置（异步版本）"""
import os
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from alembic import context

# 导入配置
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 导入模型元数据
from app.models import Base
target_metadata = Base.metadata

# 从环境变量设置数据库 URL
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    # Alembic 需要同步驱动 URL 进行反射
    # 将 asyncpg 替换为 psycopg2
    sync_url = DATABASE_URL.replace("+asyncpg", "+psycopg2")
    config.set_main_option("sqlalchemy.url", sync_url)


def run_migrations_offline():
    """离线模式"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection):
    """在给定连接上执行迁移"""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        render_as_batch=True,  # SQLite 兼容
        include_object=include_object_filter,
        include_name=include_name_filter,
    )
    with context.begin_transaction():
        context.run_migrations()


def include_object_filter(object, name, type_, reflected, compare_to):
    """过滤不需要版本控制的表"""
    # 忽略某些表（如 pg_stat_statements 等系统表）
    if type_ == "table" and name.startswith("pg_"):
        return False
    # 忽略 spatial_ref_sys 等 PostGIS 表
    if type_ == "table" and name in ("spatial_ref_sys", "geometry_columns"):
        return False
    return True


def include_name_filter(name, type_, parent_names):
    """名称过滤"""
    return True


async def run_async_migrations():
    """异步执行迁移"""
    from app.database import engine as async_engine
    async with async_engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await async_engine.dispose()


def run_migrations_online():
    """在线模式入口"""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 20.4.3 迁移脚本示例集

**初始迁移：创建用户表**：

```python
"""create users table

Revision ID: 001_initial
Revises: None
Create Date: 2024-01-15 10:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("full_name", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
```

**添加文章表**：

```python
"""create posts table

Revision ID: 002_posts
Revises: 001_initial
Create Date: 2024-01-16 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "002_posts"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "posts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_posts_author_published",
        "posts",
        ["author_id", "is_published"],
    )


def downgrade() -> None:
    op.drop_index("ix_posts_author_published", table_name="posts")
    op.drop_table("posts")
```

**添加列迁移**：

```python
"""add avatar_url to users

Revision ID: 003_avatar
Revises: 002_posts
"""
from alembic import op
import sqlalchemy as sa

revision = "003_avatar"
down_revision = "002_posts"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
```

**修改列类型迁移**：

```python
"""change post title length

Revision ID: 004_title_len
Revises: 003_avatar
"""
from alembic import op
import sqlalchemy as sa

revision = "004_title_len"
down_revision = "003_avatar"


def upgrade() -> None:
    # 某些数据库（如 MySQL）需要指定 existing_type
    op.alter_column(
        "posts", "title",
        existing_type=sa.String(200),
        type_=sa.String(500),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "posts", "title",
        existing_type=sa.String(500),
        type_=sa.String(200),
        existing_nullable=False,
    )
```

**数据迁移**：

```python
"""populate default categories

Revision ID: 005_seed
Revises: 004_title_len
"""
from alembic import op
import sqlalchemy as sa

revision = "005_seed"
down_revision = "004_title_len"


def upgrade() -> None:
    # 创建 categories 表
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # 使用 sa.table 创建临时表引用（用于批量插入）
    categories = sa.table(
        "categories",
        sa.column("name", sa.String),
        sa.column("slug", sa.String),
    )

    op.bulk_insert(categories, [
        {"name": "Technology", "slug": "technology"},
        {"name": "Science", "slug": "science"},
        {"name": "Business", "slug": "business"},
        {"name": "Health", "slug": "health"},
    ])


def downgrade() -> None:
    op.drop_table("categories")
```

### 20.4.4 自动生成迁移的工作流脚本

```python
"""自动化迁移工作流脚本"""
import os
import sys
import subprocess
from pathlib import Path


def check_migration_quality(migration_file: Path) -> list[str]:
    """检查自动生成的迁移脚本质量"""
    warnings = []
    content = migration_file.read_text()

    # 检查1：空迁移（没有实际操作）
    if "pass" in content and "upgrade()" in content:
        warnings.append("迁移脚本可能为空（upgrade 中只有 pass）")

    # 检查2：downgrade 不完整
    if "downgrade()" in content and "pass" in content.split("def downgrade")[1]:
        warnings.append("downgrade() 未实现，回滚不可用")

    # 检查3：drop_table 操作（数据丢失风险）
    if "op.drop_table" in content:
        warnings.append("包含 drop_table 操作，可能导致数据丢失")

    # 检查4：drop_column 操作
    if "op.drop_column" in content:
        warnings.append("包含 drop_column 操作，数据将被永久删除")

    # 检查5：未审核的 autogenerate
    if "autogenerate" in content.lower():
        warnings.append("自动生成脚本，请人工审核")

    return warnings


def create_migration(message: str, autogenerate: bool = True):
    """创建迁移脚本并执行质量检查"""
    cmd = ["alembic", "revision"]
    if autogenerate:
        cmd.append("--autogenerate")
    cmd.extend(["-m", message])

    # 生成迁移
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"迁移生成失败: {result.stderr}")
        sys.exit(1)

    # 找到生成的文件
    output = result.stdout
    print(output)

    # 提取文件路径
    for line in output.split("\n"):
        if line.strip().endswith(".py") and "generating" in line.lower():
            file_path = Path(line.strip().split()[-1])
            warnings = check_migration_quality(file_path)
            if warnings:
                print("\n迁移脚本质量警告：")
                for w in warnings:
                    print(f"  - {w}")
                print("\n请审核迁移脚本后再执行 alembic upgrade head")
                sys.exit(1)

    print("迁移脚本质量检查通过")


def apply_migration(target: str = "head"):
    """应用迁移"""
    subprocess.run(["alembic", "upgrade", target], check=True)
    print(f"已升级到: {target}")


def rollback(steps: int = 1):
    """回滚迁移"""
    subprocess.run(["alembic", "downgrade", f"-{steps}"], check=True)
    print(f"已回滚 {steps} 个版本")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Alembic 迁移工具")
    subparsers = parser.add_subparsers(dest="command")

    # create 命令
    create_parser = subparsers.add_parser("create", help="创建迁移")
    create_parser.add_argument("message", help="迁移描述")
    create_parser.add_argument("--manual", action="store_true", help="手动创建")

    # upgrade 命令
    upgrade_parser = subparsers.add_parser("upgrade", help="应用迁移")
    upgrade_parser.add_argument("--target", default="head", help="目标版本")

    # downgrade 命令
    downgrade_parser = subparsers.add_parser("downgrade", help="回滚迁移")
    downgrade_parser.add_argument("--steps", type=int, default=1, help="回滚步数")

    args = parser.parse_args()

    if args.command == "create":
        create_migration(args.message, autogenerate=not args.manual)
    elif args.command == "upgrade":
        apply_migration(args.target)
    elif args.command == "downgrade":
        rollback(args.steps)
```

### 20.4.5 FastAPI 集成：启动时自动迁移

```python
"""FastAPI 启动时自动执行迁移"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from alembic.config import Config
from alembic import command
import os


def run_alembic_migrations():
    """执行 Alembic 迁移"""
    alembic_cfg = Config("alembic.ini")
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        alembic_cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时自动迁移（仅开发环境！生产环境不建议）
    if os.getenv("AUTO_MIGRATE", "false").lower() == "true":
        run_alembic_migrations()
    yield


app = FastAPI(lifespan=lifespan)
```

### 20.4.6 自定义迁移模板

```mako
# script.py.mako — 自定义迁移脚本模板
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

---

## 20.5 常见陷阱与最佳实践

### 20.5.1 陷阱：盲目信任 Autogenerate

Autogenerate 生成的迁移脚本**必须人工审核**。它可能遗漏或错误处理以下情况：

```python
# 陷阱1：列重命名被误判为删除+新增
# 模型中将 name 改为 full_name
# Autogenerate 生成：
def upgrade():
    op.drop_column("users", "name")         # 数据丢失！
    op.add_column("users", sa.Column("full_name", sa.String(100)))

# 正确做法：手动修改为
def upgrade():
    op.alter_column("users", "name", new_column_name="full_name")

# 陷阱2：类型变更可能丢失数据
# 将 String(50) 改为 String(20)，已有数据超过20字符会被截断

# 陷阱3：server_default 变更可能被忽略
# 默认不比较 server_default，需要设置 compare_server_default=True
```

### 20.5.2 陷阱：忘记实现 downgrade()

```python
# 错误：downgrade 只有 pass
def downgrade() -> None:
    pass  # 无法回滚！

# 正确：始终实现 downgrade
def downgrade() -> None:
    op.drop_column("users", "avatar_url")
```

**例外**：某些数据迁移确实不可逆。此时应明确标注：

```python
def downgrade() -> None:
    # 数据迁移不可逆
    raise NotImplementedError("Cannot reverse data migration")
```

### 20.5.3 陷阱：多个 head 未合并

当两个开发者从同一个版本创建迁移时，会产生两个 head：

```bash
$ alembic heads
a1b2c3d4  (head)
e5f6g7h8  (head)

# 错误：直接 upgrade head 会失败
$ alembic upgrade head
# Multiple head revisions exist
```

**解决**：合并分支

```bash
# 合并两个 head
alembic merge -m "merge dev branches" a1b2c3d4 e5f6g7h8

# 合并后再升级
alembic upgrade head
```

### 20.5.4 陷阱：SQLite 的 ALTER TABLE 限制

SQLite 不支持大部分 ALTER TABLE 操作。如果忘记使用 `batch_alter_table`，迁移会失败：

```python
# 错误：SQLite 不支持 DROP COLUMN
def upgrade():
    op.drop_column("users", "deprecated_field")  # OperationalError in SQLite!

# 正确：使用 batch_alter_table
def upgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("deprecated_field")
```

### 20.5.5 陷阱：迁移脚本中的 ORM 导入

**错误**：在迁移脚本中导入应用 ORM 模型

```python
# 错误：迁移脚本导入 ORM 模型
from app.models import User  # 如果模型改变了，旧迁移脚本会失败！

def upgrade():
    # 使用 User 模型做数据操作
    pass
```

**原因**：迁移脚本必须是**自包含的**。如果 ORM 模型后来被修改（如删除了某个字段），旧的迁移脚本在运行时会因为导入失败而中断。

**正确**：使用 `sa.table` 和 `sa.column` 创建轻量引用

```python
# 正确：使用 sa.table
def upgrade():
    users = sa.table(
        "users",
        sa.column("id", sa.Integer),
        sa.column("email", sa.String),
    )
    op.execute(
        users.update().where(users.c.email.is_(None)).values(email="")
    )
```

### 20.5.6 最佳实践：迁移脚本命名与组织

```bash
# 使用有意义的迁移描述
alembic revision --autogenerate -m "add user phone column"
alembic revision -m "populate default roles"

# 使用 alembic.ini 中的 file_template 自定义文件名格式
# 默认: <revision>_<message>.py
# 推荐: <date>_<revision>_<message>.py
# 在 alembic.ini 中设置:
# file_template = %%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s
```

### 20.5.7 最佳实践：版本号管理策略

| 策略 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| 随机哈希（默认） | 无冲突 | 不直观 | 大团队 |
| 递增数字前缀 | 直观有序 | 可能冲突 | 小团队 |
| 日期+哈希 | 时间可读 | 略长 | 中等团队 |

```bash
# 递增数字前缀
# 修改 script.py.mako 模板，在 revision 赋值时添加前缀
# 或使用 alembic --rev-id=001 方式
```

### 20.5.8 最佳实践：生产环境迁移清单

在执行生产环境迁移前，必须完成以下检查：

- [ ] 在开发环境测试 upgrade 和 downgrade
- [ ] 在 staging 环境使用生产数据副本测试
- [ ] 确认 downgrade 可用且经过测试
- [ ] 备份数据库
- [ ] 评估迁移对大表的影响（ALTER TABLE 可能锁表）
- [ ] 检查迁移是否向后兼容（零停机部署）
- [ ] 在低峰期执行
- [ ] 准备回滚方案

### 20.5.9 最佳实践：大表迁移策略

对于包含百万行以上的大表，直接 ALTER TABLE 可能导致长时间锁表：

```python
# PostgreSQL 大表迁移策略

# 策略1：使用 pg_repack 扩展（零锁表重建表）
# 不通过 Alembic，使用 PostgreSQL 扩展

# 策略2：分步迁移
def upgrade():
    # 步骤1：添加可空列（快速，短锁）
    op.add_column("large_table", sa.Column("new_col", sa.String(255), nullable=True))

    # 步骤2：数据回填（在应用层分批执行，不在迁移中）
    # for offset in range(0, total, batch_size):
    #     batch_update(offset, batch_size)

    # 步骤3：添加 NOT NULL 约束（在数据回填后）
    op.alter_column("large_table", "new_col", nullable=False)

# 策略3：使用 PostgreSQL 的 CREATE INDEX CONCURRENTLY
def upgrade():
    # 普通索引会锁表
    # op.create_index("ix_large_table_col", "large_table", ["col"])

    # 并发创建索引（不锁表）
    op.execute("CREATE INDEX CONCURRENTLY ix_large_table_col ON large_table (col)")


def downgrade():
    # 并发删除索引
    op.execute("DROP INDEX CONCURRENTLY ix_large_table_col")
```

### 20.5.10 最佳实践：迁移测试

```python
"""迁移完整性测试"""
import pytest
from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, inspect


@pytest.fixture
def alembic_cfg():
    return Config("alembic.ini")


def test_upgrade_downgrade_cycle(alembic_cfg, test_database_url):
    """测试完整的升级-降级循环"""
    engine = create_engine(test_database_url)

    # 从空数据库升级到最新
    command.upgrade(alembic_cfg, "head")

    # 验证表存在
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "users" in tables
    assert "posts" in tables

    # 降级到 base
    command.downgrade(alembic_cfg, "base")

    # 验证表被删除
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "users" not in tables
    assert "posts" not in tables


def test_single_step_upgrade_downgrade(alembic_cfg, test_database_url):
    """测试逐步升级和逐步降级"""
    from alembic.script import ScriptDirectory
    from alembic.runtime.migration import MigrationContext

    # 获取所有迁移版本
    script = ScriptDirectory.from_config(alembic_cfg)
    revisions = list(script.walk_revisions())

    engine = create_engine(test_database_url)

    # 逐步升级
    for rev in reversed(revisions):
        command.upgrade(alembic_cfg, rev.revision)
        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current = context.get_current_revision()
            assert current == rev.revision

    # 逐步降级
    for rev in revisions:
        command.downgrade(alembic_cfg, rev.down_revision or "base")
```

### 20.5.11 最佳实践：Alembic 与 Docker 集成

```dockerfile
# Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# 迁移将在容器启动时执行

# entrypoint.sh
#!/bin/bash
set -e
echo "Running database migrations..."
alembic upgrade head
echo "Starting application..."
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: fastapi_demo
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@db:5432/fastapi_demo
    depends_on:
      - db
    command: >
      bash -c "
        while ! pg_isready -h db -U postgres; do sleep 1; done &&
        alembic upgrade head &&
        uvicorn app.main:app --host 0.0.0.0 --port 8000
      "

volumes:
  pgdata:
```