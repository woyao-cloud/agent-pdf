# 第06章 Pydantic模型基础

Pydantic 是 FastAPI 数据验证的基石。本章从 Pydantic 模型的定义到数据验证流程，深入剖析 Pydantic V2 的核心机制。

---

## 06.1 概念与语法

### 06.1.1 BaseModel 定义

```python
from pydantic import BaseModel, Field
from typing import Optional

class User(BaseModel):
    name: str
    age: int
    email: str
    is_active: bool = True
    address: Optional[str] = None

# 创建实例
user = User(name="Alice", age=30, email="alice@example.com")

# 自动类型转换
user2 = User(name="Bob", age="25", email="bob@example.com")
# age 从 "25" 自动转为 25

# 访问属性
print(user.name)   # "Alice"
print(user.age)    # 30

# 模型转字典
print(user.model_dump())
# {"name": "Alice", "age": 30, "email": "alice@example.com", "is_active": True, "address": None}

# 模型转 JSON
print(user.model_dump_json())
# '{"name":"Alice","age":30,"email":"alice@example.com","is_active":true,"address":null}'
```

### 06.1.2 Field 字段配置

```python
from pydantic import BaseModel, Field
from typing import Annotated

class Product(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
        description="Product name",
        examples=["Widget"],
    )
    price: float = Field(
        gt=0,
        description="Price in USD",
        examples=[19.99],
    )
    quantity: int = Field(
        ge=0,
        default=0,
        description="Stock quantity",
    )
    tags: list[str] = Field(
        default_factory=list,
        max_length=10,
        description="Product tags",
    )

# Annotated 风格（推荐）
class Item(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=50)]
    price: Annotated[float, Field(gt=0)]
    description: Annotated[str | None, Field(None, max_length=500)]

# Field 约束汇总：
# 字符串：min_length, max_length, pattern
# 数值：gt, ge, lt, le, multiple_of
# 列表：min_length, max_length
# 通用：default, default_factory, alias, description, examples
```

### 06.1.3 嵌套模型

```python
from pydantic import BaseModel

class Address(BaseModel):
    street: str
    city: str
    zip_code: str
    country: str = "China"

class Company(BaseModel):
    name: str
    address: Address
    employees: int = 0

class Employee(BaseModel):
    name: str
    age: int
    company: Company
    skills: list[str] = []

# 嵌套创建
emp = Employee(
    name="Alice",
    age=30,
    company={
        "name": "TechCorp",
        "address": {
            "street": "123 Main St",
            "city": "Beijing",
            "zip_code": "100000",
        },
    },
    skills=["Python", "FastAPI"],
)

# 嵌套输出
emp.model_dump()
# {
#   "name": "Alice",
#   "age": 30,
#   "company": {
#     "name": "TechCorp",
#     "address": {"street": "123 Main St", ...},
#     "employees": 0,
#   },
#   "skills": ["Python", "FastAPI"],
# }

# 仅输出某层级
emp.model_dump(include={"name", "company": {"name"}})
# {"name": "Alice", "company": {"name": "TechCorp"}}
```

### 06.1.4 模型配置

```python
from pydantic import BaseModel, ConfigDict

class User(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,    # 自动去除字符串首尾空白
        str_min_length=1,             # 字符串最小长度
        json_schema_extra={           # 额外 JSON Schema 信息
            "examples": [{"name": "Alice", "age": 30}],
        },
        populate_by_name=True,       # 允许通过字段名或 alias 填充
        from_attributes=True,         # 支持从 ORM 对象创建
        arbitrary_types_allowed=True, # 允许任意类型
    )
    name: str
    age: int

# 另一种写法
class User2(BaseModel):
    name: str
    age: int

    class Config:
        str_strip_whitespace = True
        populate_by_name = True
        from_attributes = True
```

---

## 06.2 原理与机制

### 06.2.1 Pydantic V2 核心引擎

```python
"""
Pydantic V2 的核心变化：

1. Rust 核心引擎（pydantic-core）
   - 验证和序列化逻辑用 Rust 编写
   - 比 V1 快 5-50 倍
   - 通过 rustdoc-python 绑定到 Python

2. pydantic-core 架构：
   - Schema（模式定义）→ Validator（验证器）→ 数据流
   - 每个 BaseModel 在类创建时生成对应的 Schema
   - Schema 被编译为 Rust 的验证函数

3. 验证流程：
   输入数据 → Schema 查找 → Rust 验证函数 → 验证结果
   - 类型检查：使用 Rust 的类型系统
   - 类型转换：自动 coerce（如 "25" → 25）
   - 约束检查：gt/lt/min_length 等

4. 源码入口：
   pydantic/main.py → pydantic/_internal/_model_construction.py
   → pydantic_core::SchemaValidator::validate_python()

5. 模型创建时的核心步骤：
   a. 收集字段信息（类型、默认值、约束）
   b. 构建 core_schema（Pydantic 内部模式）
   c. 调用 pydantic-core 生成 SchemaValidator
   d. 绑定到类的 __pydantic_validator__
"""
```

### 06.2.2 model_dump 的实现

```python
"""
model_dump 的内部机制：

1. 调用 pydantic-core 的 SchemaSerializer
2. 遍历模型的 __pydantic_fields_set__（已设置的字段）
3. 根据 include/exclude 参数过滤字段
4. 递归处理嵌套模型
5. 应用 by_alias 转换

关键参数：
- include: 仅包含指定字段
- exclude: 排除指定字段
- by_alias: 使用别名输出
- exclude_unset: 仅输出用户设置的字段（非默认值）
- exclude_defaults: 排除默认值字段
- exclude_none: 排除 None 值字段

class User(BaseModel):
    name: str
    age: int = 0
    email: str | None = None

user = User(name="Alice")

user.model_dump()
# {"name": "Alice", "age": 0, "email": None}

user.model_dump(exclude_unset=True)
# {"name": "Alice"}  — 仅用户显式设置的字段

user.model_dump(exclude_defaults=True)
# {"name": "Alice"}  — 排除默认值字段

user.model_dump(exclude_none=True)
# {"name": "Alice", "age": 0}  — 排除 None 值字段
"""
```

### 06.2.3 类型转换（Coercion）

```python
"""
Pydantic 的类型转换规则（strict=False 模式）：

输入类型 → 目标类型 → 转换行为
str → int      "25" → 25（尝试解析）
str → float    "3.14" → 3.14
str → bool     "true"/"1"/"yes" → True（不区分大小写）
int → float    25 → 25.0
int → str      25 → "25"
float → int    3.14 → 3（截断，非四舍五入）
str → bytes    "hello" → b"hello"
list → tuple   [1,2,3] → (1,2,3)
dict → Model   {"name": "A"} → Model(name="A")

strict=True 模式：
- 不执行类型转换
- 类型必须严格匹配
- int 字段接收 str 会报验证错误
"""
from pydantic import BaseModel

class StrictModel(BaseModel):
    model_config = {"strict": True}
    age: int

# StrictModel(age="25")  → ValidationError！
# StrictModel(age=25)    → OK
```

---

## 06.3 使用场景

### 06.3.1 FastAPI 请求体验证

```python
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()

class CreateItemRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: float = Field(gt=0)
    description: str | None = Field(None, max_length=500)

class ItemResponse(BaseModel):
    id: int
    name: str
    price: float
    description: str | None

@app.post("/items/", response_model=ItemResponse)
async def create_item(item: CreateItemRequest):
    # FastAPI 自动验证请求体
    # 验证失败返回 422 Unprocessable Entity
    saved = save_to_db(item)
    return ItemResponse(id=saved.id, **item.model_dump())
```

### 06.3.2 配置管理

```python
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

class AppConfig(BaseSettings):
    database_url: str = Field("sqlite:///./test.db", alias="DATABASE_URL")
    redis_url: str = Field("redis://localhost:6379", alias="REDIS_URL")
    secret_key: str = Field(..., alias="SECRET_KEY")  # 必填
    debug: bool = Field(False, alias="DEBUG")
    max_workers: int = Field(4, ge=1, le=16, alias="MAX_WORKERS")

    model_config = {"env_file": ".env", "populate_by_name": True}

# 从环境变量或 .env 文件加载
config = AppConfig()
```

### 06.3.3 数据清洗与标准化

```python
from pydantic import BaseModel, field_validator

class ContactForm(BaseModel):
    name: str
    email: str
    phone: str

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip().title()

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        return "".join(c for c in v if c.isdigit())

form = ContactForm(name="  alice smith  ", email="  Alice@Example.COM  ", phone="+86-138-0013-8000")
# name="Alice Smith", email="alice@example.com", phone="8613800138000"
```

---

## 06.4 示例代码

### 06.4.1 完整的用户管理模型

```python
"""用户管理 Pydantic 模型体系"""
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    admin = "admin"
    manager = "manager"
    user = "user"

class Address(BaseModel):
    street: str = Field(min_length=1, max_length=200)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    zip_code: str = Field(pattern=r"^\d{6}$", description="6-digit zip code")
    country: str = Field(default="China", max_length=100)

class UserBase(BaseModel):
    """共享的基础字段。"""
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    role: UserRole = UserRole.user

class UserCreate(UserBase):
    """创建用户请求。"""
    password: str = Field(min_length=8, max_length=128)
    address: Address

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Must contain at least one digit")
        return v

class UserUpdate(BaseModel):
    """更新用户请求（所有字段可选）。"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    address: Optional[Address] = None

class UserResponse(UserBase):
    """用户响应模型。"""
    id: int
    address: Address
    created_at: datetime
    is_active: bool = True

    model_config = {"from_attributes": True}

class UserListResponse(BaseModel):
    """用户列表响应。"""
    users: list[UserResponse]
    total: int
    page: int
    page_size: int
```

---

## 06.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 可变默认值（如 `tags: list = []`） | 使用 `Field(default_factory=list)` |
| 不区分 Optional 与默认值 | `Optional[str] = None` 才是可选字段 |
| model_dump() 输出包含敏感信息 | 使用 `exclude` 或单独的响应模型 |
| 在模型中写业务逻辑 | Pydantic 模型只做验证，业务逻辑放在 Service 层 |
| 忽略 strict 模式 | API 边界使用 strict=True 防止意外类型转换 |
| 嵌套过深 | 控制嵌套层级，超过 3 层考虑扁平化 |
| 大量模型重复定义 | 使用继承（Base → Create/Update/Response）减少重复 |
| 不使用 model_config | 统一配置 str_strip_whitespace 等通用规则 |

---

本章从 Pydantic BaseModel 的定义到 Field 约束，从嵌套模型到配置系统，从 V2 的 Rust 核心引擎到类型转换机制，全面剖析了 Pydantic 模型基础的底层机制。