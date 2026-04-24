# 第08章 Pydantic序列化与配置

序列化是 Pydantic 模型与外部数据交互的关键环节。本章从 model_dump 到 JSON Schema 生成，从别名系统到序列化配置，深入剖析 Pydantic 序列化的机制与实践。

---

## 08.1 概念与语法

### 08.1.1 model_dump 系列

```python
from pydantic import BaseModel, Field

class User(BaseModel):
    name: str
    age: int
    email: str | None = None
    password: str = Field(exclude=True)  # 序列化时排除

user = User(name="Alice", age=30, email="alice@example.com", password="secret")

# model_dump — 转字典
user.model_dump()
# {"name": "Alice", "age": 30, "email": "alice@example.com"}  password 被排除

# model_dump_json — 转 JSON 字符串
user.model_dump_json()
# '{"name":"Alice","age":30,"email":"alice@example.com"}'

# 常用参数
user.model_dump(
    include={"name", "age"},       # 仅包含
    exclude={"email"},             # 排除
    by_alias=True,                 # 使用别名
    exclude_unset=True,            # 排除未设置的字段
    exclude_defaults=True,         # 排除默认值
    exclude_none=True,             # 排除 None
)

# 嵌套模型的 include/exclude
class Order(BaseModel):
    id: int
    items: list[dict]
    total: float

class Customer(BaseModel):
    name: str
    orders: list[Order]

customer = Customer(name="Alice", orders=[Order(id=1, items=[{"sku": "A"}], total=99.9)])

# 仅包含订单的 id 和 total
customer.model_dump(include={"name", "orders": {"id", "total"}})
# {"name": "Alice", "orders": [{"id": 1, "total": 99.9}]}
```

### 08.1.2 别名系统

```python
from pydantic import BaseModel, Field, ConfigDict

class User(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(alias="username")
    age: int = Field(alias="user_age")
    email: str

# 使用别名创建
user = User(username="Alice", user_age=30, email="alice@example.com")

# 使用字段名创建（需要 populate_by_name=True）
user2 = User(name="Bob", age=25, email="bob@example.com")

# 序列化使用别名
user.model_dump(by_alias=True)
# {"username": "Alice", "user_age": 30, "email": "alice@example.com"}

# 不使用别名（默认）
user.model_dump()
# {"name": "Alice", "age": 30, "email": "alice@example.com"}
```

### 08.1.3 序列化器（Custom Serializer）

```python
from pydantic import BaseModel, field_serializer
from datetime import datetime
from decimal import Decimal

class Transaction(BaseModel):
    amount: Decimal
    timestamp: datetime
    status: str

    @field_serializer("timestamp")
    @classmethod
    def serialize_timestamp(cls, v: datetime) -> str:
        return v.isoformat()

    @field_serializer("amount")
    @classmethod
    def serialize_amount(cls, v: Decimal) -> float:
        return float(v)

tx = Transaction(
    amount=Decimal("99.99"),
    timestamp=datetime(2024, 1, 15, 10, 30, 0),
    status="completed",
)
tx.model_dump()
# {"amount": 99.99, "timestamp": "2024-01-15T10:30:00", "status": "completed"}

# 使用 model_serializer 整体控制
from pydantic import model_serializer

class CompactUser(BaseModel):
    first_name: str
    last_name: str
    email: str

    @model_serializer
    def serialize_model(self) -> dict:
        return {
            "fullName": f"{self.first_name} {self.last_name}",
            "email": self.email,
        }

user = CompactUser(first_name="Alice", last_name="Smith", email="alice@example.com")
user.model_dump()
# {"fullName": "Alice Smith", "email": "alice@example.com"}
```

### 08.1.4 TypeAdapter

```python
from pydantic import TypeAdapter
from typing import List, Dict

# 验证非 BaseModel 类型
adapter = TypeAdapter(List[int])
result = adapter.validate_python(["1", "2", "3"])
# [1, 2, 3]

# 字典类型
dict_adapter = TypeAdapter(Dict[str, float])
result = dict_adapter.validate_python({"a": "1.5", "b": "2"})
# {"a": 1.5, "b": 2.0}

# 联合类型
from typing import Union
union_adapter = TypeAdapter(Union[int, str])
union_adapter.validate_python(42)     # 42 (int)
union_adapter.validate_python("hello") # "hello" (str)

# JSON 操作
adapter = TypeAdapter(List[int])
json_str = adapter.dump_json([1, 2, 3])  # b'[1,2,3]'
result = adapter.validate_json(b'[1,2,3]')  # [1, 2, 3]

# JSON Schema 生成
schema = adapter.json_schema()
# {"type": "array", "items": {"type": "integer"}}
```

---

## 08.2 原理与机制

### 08.2.1 序列化的内部流程

```python
"""
Pydantic V2 序列化流程：

1. model_dump() 调用路径：
   BaseModel.model_dump()
   → pydantic_core::SchemaSerializer::dump_python()
   → Rust 层遍历 core_schema
   → 对每个字段调用对应的序列化器

2. model_dump_json() 调用路径：
   BaseModel.model_dump_json()
   → pydantic_core::SchemaSerializer::dump_json()
   → 直接输出 JSON 字节（不经过 Python dict 中间态）

3. 关键区别：
   - dump_python: 输出 Python 对象（dict, list, str）
   - dump_json: 输出 JSON 字节串（更快，无中间转换）

4. 序列化模式：
   - plain: 直接序列化值
   - wrap: 包装序列化器（可控制输入输出）

5. exclude/include 的处理：
   - 在 Rust 层通过 schema 的 include/exclude 字段过滤
   - 嵌套 include 使用 set 嵌套结构
   - exclude_unset 基于 __pydantic_fields_set__
"""
```

### 08.2.2 JSON Schema 生成

```python
"""
Pydantic 的 JSON Schema 生成机制：

1. model_json_schema() 生成完整 JSON Schema
2. 遵循 JSON Schema Draft 2020-12 规范
3. Field 约束映射为 JSON Schema 约束：
   - gt → exclusiveMinimum
   - ge → minimum
   - lt → exclusiveMaximum
   - le → maximum
   - min_length → minLength
   - max_length → maxLength
   - pattern → pattern

4. 类型映射：
   Python 类型     → JSON Schema 类型
   str             → {"type": "string"}
   int             → {"type": "integer"}
   float           → {"type": "number"}
   bool            → {"type": "boolean"}
   list[int]       → {"type": "array", "items": {"type": "integer"}}
   dict[str, int]  → {"type": "object", "additionalProperties": {"type": "integer"}}
   Optional[str]   → {"anyOf": [{"type": "string"}, {"type": "null"}]}
   BaseModel       → {"$ref": "#/$defs/ModelName"}

5. FastAPI 利用 JSON Schema 生成 OpenAPI 文档
"""

from pydantic import BaseModel

class Item(BaseModel):
    name: str
    price: float
    in_stock: bool = True

schema = Item.model_json_schema()
# {
#   "properties": {
#     "name": {"title": "Name", "type": "string"},
#     "price": {"title": "Price", "type": "number"},
#     "in_stock": {"default": True, "title": "In Stock", "type": "boolean"}
#   },
#   "required": ["name", "price"],
#   "title": "Item",
#   "type": "object"
# }
```

---

## 08.3 使用场景

### 08.3.1 API 响应格式控制

```python
from fastapi import FastAPI
from pydantic import BaseModel, Field, field_serializer
from datetime import datetime

app = FastAPI()

class UserResponse(BaseModel):
    id: int
    name: str
    created_at: datetime = Field(exclude=True)
    email: str = Field(exclude=True)

    @field_serializer("id")
    @classmethod
    def serialize_id(cls, v: int) -> str:
        return str(v)

class UserDetailResponse(UserResponse):
    email: str = Field()  # 覆盖父类的 exclude
    created_at: datetime = Field()  # 覆盖父类的 exclude

    @field_serializer("created_at")
    @classmethod
    def serialize_datetime(cls, v: datetime) -> str:
        return v.strftime("%Y-%m-%d %H:%M:%S")
```

### 08.3.2 数据库 ORM 转换

```python
from pydantic import BaseModel, ConfigDict

# SQLAlchemy 模型
class UserORM:
    def __init__(self, id, name, email, hashed_password):
        self.id = id
        self.name = name
        self.email = email
        self.hashed_password = hashed_password

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    # hashed_password 不包含在响应中

# 从 ORM 对象创建
orm_user = UserORM(id=1, name="Alice", email="alice@example.com", hashed_password="...")
response = UserResponse.model_validate(orm_user)
```

### 08.3.3 多格式导出

```python
from pydantic import BaseModel, field_serializer
from datetime import datetime
import csv
import io

class Report(BaseModel):
    title: str
    date: datetime
    value: float
    category: str

    @field_serializer("date")
    @classmethod
    def serialize_date(cls, v: datetime) -> str:
        return v.strftime("%Y-%m-%d")

    @field_serializer("value")
    @classmethod
    def serialize_value(cls, v: float) -> str:
        return f"{v:.2f}"

class ReportExporter:
    def __init__(self, reports: list[Report]):
        self.reports = reports

    def to_json(self) -> str:
        return Report.model_dump_json(self.reports, by_alias=True)

    def to_csv(self) -> str:
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["title", "date", "value", "category"])
        writer.writeheader()
        for r in self.reports:
            writer.writerow(r.model_dump())
        return output.getvalue()

    def to_dict_list(self) -> list[dict]:
        return [r.model_dump() for r in self.reports]
```

---

## 08.4 示例代码

### 08.4.1 完整的 API 序列化体系

```python
"""FastAPI 序列化体系示例"""
from fastapi import FastAPI
from pydantic import BaseModel, Field, field_serializer, model_serializer, ConfigDict
from datetime import datetime
from typing import Optional
from decimal import Decimal
from enum import Enum

app = FastAPI()

class Currency(str, Enum):
    CNY = "CNY"
    USD = "USD"
    EUR = "EUR"

class Money(BaseModel):
    amount: Decimal = Field(ge=0)
    currency: Currency = Currency.CNY

    @field_serializer("amount")
    @classmethod
    def serialize_amount(cls, v: Decimal) -> str:
        return str(v)

    def model_dump_float(self) -> dict:
        return {"amount": float(self.amount), "currency": self.currency.value}

class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    price: Money
    tags: list[str] = Field(default_factory=list, max_length=20)

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    @classmethod
    def serialize_datetime(cls, v: datetime) -> str:
        return v.isoformat()

class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    page: int = 1
    page_size: int = 20

@app.post("/products/", response_model=ProductResponse)
async def create_product(product: ProductCreate):
    saved = save_product(product)
    return ProductResponse.model_validate(saved)

@app.get("/products/", response_model=ProductListResponse)
async def list_products(page: int = 1, page_size: int = 20):
    items, total = query_products(page, page_size)
    return ProductListResponse(items=items, total=total, page=page, page_size=page_size)
```

---

## 08.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| model_dump() 包含敏感字段 | 使用 `Field(exclude=True)` 或单独响应模型 |
| 不使用 model_dump_json | JSON 输出优先使用 model_dump_json（更快） |
| 别名与字段名混用 | 统一使用 populate_by_name=True，序列化用 by_alias |
| datetime 序列化格式不一致 | 使用 field_serializer 统一格式 |
| Decimal 直接转 float 丢失精度 | 序列化为字符串或使用自定义序列化器 |
| 大模型 dump 产生冗余数据 | 使用 exclude_unset/exclude_defaults/exclude_none |
| 不生成 JSON Schema | 利用 model_json_schema 自动生成 API 文档 |
| ORM 模型不设 from_attributes | 转换 ORM 对象时必须设置 from_attributes=True |

---

本章从 model_dump 的序列化选项到别名系统，从自定义序列化器到 TypeAdapter，从 JSON Schema 生成到 Rust 层序列化流程，全面剖析了 Pydantic 序列化与配置的底层机制。