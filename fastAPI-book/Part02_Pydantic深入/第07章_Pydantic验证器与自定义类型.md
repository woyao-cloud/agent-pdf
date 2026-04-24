# 第07章 Pydantic验证器与自定义类型

验证器是 Pydantic 数据校验的核心扩展机制。本章从 field_validator 到 model_validator，从自定义类型到 Annotated 模式，深入剖析 Pydantic 验证体系的机制与实践。

---

## 07.1 概念与语法

### 07.1.1 field_validator 字段验证器

```python
from pydantic import BaseModel, field_validator

class User(BaseModel):
    name: str
    age: int
    email: str

    @field_validator("age")
    @classmethod
    def check_age(cls, v: int) -> int:
        if v < 0 or v > 150:
            raise ValueError("Age must be between 0 and 150")
        return v

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email format")
        return v.lower().strip()

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip().title()

# 多字段验证器
class Product(BaseModel):
    price: float
    discount_price: float | None = None

    @field_validator("discount_price")
    @classmethod
    def check_discount(cls, v: float | None, info) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Discount price cannot be negative")
        return v
```

### 07.1.2 model_validator 模型验证器

```python
from pydantic import BaseModel, model_validator

class Reservation(BaseModel):
    check_in: date
    check_out: date
    guests: int

    @model_validator(mode="after")
    def validate_dates(self) -> "Reservation":
        if self.check_out <= self.check_in:
            raise ValueError("Check-out must be after check-in")
        if self.check_out - self.check_in > timedelta(days=30):
            raise ValueError("Maximum stay is 30 days")
        return self

class PasswordChange(BaseModel):
    password: str
    confirm_password: str

    @model_validator(mode="after")
    def passwords_match(self) -> "PasswordChange":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self

# mode="before" — 在字段验证之前执行
class RawData(BaseModel):
    raw_value: str

    @model_validator(mode="before")
    @classmethod
    def preprocess(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # 在字段解析前处理原始数据
            data["raw_value"] = data.get("raw_value", "").strip()
        return data
```

### 07.1.3 Annotated 验证模式

```python
from typing import Annotated
from pydantic import BaseModel, Field, field_validator, AfterValidator

# AfterValidator — 验证后转换
def capitalize(v: str) -> str:
    return v.capitalize()

CappedStr = Annotated[str, AfterValidator(capitalize)]

class City(BaseModel):
    name: CappedStr

city = City(name="beijing")  # name="Beijing"

# 多个 AfterValidator 链式执行
def strip_whitespace(v: str) -> str:
    return v.strip()

def ensure_upper(v: str) -> str:
    return v.upper()

CodeStr = Annotated[str, AfterValidator(strip_whitespace), AfterValidator(ensure_upper)]

class Product(BaseModel):
    code: CodeStr

p = Product(code="  abc123  ")  # code="ABC123"

# 结合 Field 和验证器
PositiveInt = Annotated[int, Field(gt=0)]
Email = Annotated[str, Field(pattern=r"^[\w.-]+@[\w.-]+\.\w+$")]
```

### 07.1.4 自定义类型

```python
from pydantic import BaseModel, GetCoreSchemaHandler
from pydantic_core import core_schema
from typing import Annotated

# 方式1：使用 Annotated + BeforeValidator
def validate_phone(v: str) -> str:
    v = "".join(c for c in str(v) if c.isdigit())
    if len(v) != 11:
        raise ValueError("Phone number must be 11 digits")
    return v

PhoneNumber = Annotated[str, BeforeValidator(validate_phone)]

class Contact(BaseModel):
    phone: PhoneNumber

# 方式2：TypeAdapter 自定义类型
from pydantic import TypeAdapter

ta = TypeAdapter(PhoneNumber)
result = ta.validate_python("+86-138-0013-8000")  # "8613800138000"（需要11位）

# 方式3：完整自定义类型（实现 __get_pydantic_core_schema__）
class Currency:
    def __init__(self, amount: int, currency: str = "CNY"):
        self.amount = amount
        self.currency = currency

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler: GetCoreSchemaHandler):
        return core_schema.no_info_plain_validator_function(
            cls._validate,
            serialization=core_schema.plain_serializer_function_ser_schema(
                cls._serialize,
            ),
        )

    @classmethod
    def _validate(cls, v):
        if isinstance(v, str):
            amount = int(float(v) * 100)
            return cls(amount=amount)
        if isinstance(v, (int, float)):
            return cls(amount=int(v * 100))
        if isinstance(v, dict):
            return cls(**v)
        raise ValueError(f"Cannot parse Currency from {type(v)}")

    @classmethod
    def _serialize(cls, v):
        return {"amount": v.amount, "currency": v.currency}

class Order(BaseModel):
    total: Currency

order = Order(total="99.99")
# total.amount=9999, total.currency="CNY"
```

---

## 07.2 原理与机制

### 07.2.1 验证器的执行顺序

```python
"""
Pydantic V2 验证器的执行顺序：

1. model_validator(mode="before")  — 最先执行，处理原始输入
2. 字段级别的 BeforeValidator     — 字段验证前
3. 字段类型验证和转换              — pydantic-core 执行
4. field_validator(mode="before")  — 字段验证前（旧风格）
5. Field 约束检查                  — gt/lt/min_length 等
6. field_validator(mode="after")   — 字段验证后
7. AfterValidator                  — 字段验证后转换
8. model_validator(mode="after")   — 最后执行，跨字段验证

重要变化（V1 → V2）：
- V1 的 @validator 被 @field_validator 替代
- V1 的 @root_validator 被 @model_validator 替代
- V2 中 field_validator 的 mode 参数默认为 "after"
- V2 使用 info: ValidationInfo 参数替代 V1 的 values 字典
"""

from pydantic import BaseModel, field_validator, ValidationInfo

class Item(BaseModel):
    name: str
    price: float
    discount: float = 0.0

    @field_validator("discount")
    @classmethod
    def check_discount(cls, v: float, info: ValidationInfo) -> float:
        # info.data 包含已验证的字段值
        if info.data.get("price", 0) < v:
            raise ValueError("Discount cannot exceed price")
        return v
```

### 07.2.2 验证器的 Rust 层实现

```python
"""
Pydantic V2 的验证器在 Rust 层执行：

1. Python 层定义验证器
2. 类创建时，验证器被编译为 core_schema
3. core_schema 传递给 pydantic-core（Rust）
4. Rust 层执行验证逻辑

core_schema 类型：
- no_info_plain_validator_function — 无信息的简单验证
- with_info_plain_validator_function — 带信息的简单验证
- chain_schema — 链式验证
- typed_dict_schema — 类似 TypedDict 的结构
- model_fields_schema — 模型字段模式

验证流程在 Rust 层的优化：
- 避免不必要的 Python 回调
- 内置类型的验证完全在 Rust 层完成
- 自定义验证器通过 Python 回调执行
- 异常信息由 Rust 层统一格式化
"""
```

---

## 07.3 使用场景

### 07.3.1 密码强度验证

```python
from pydantic import BaseModel, field_validator, Field
import re

class PasswordModel(BaseModel):
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_strength(cls, v: str) -> str:
        checks = [
            (re.search(r"[A-Z]", v), "uppercase letter"),
            (re.search(r"[a-z]", v), "lowercase letter"),
            (re.search(r"\d", v), "digit"),
            (re.search(r"[!@#$%^&*]", v), "special character"),
        ]
        missing = [label for passed, label in checks if not passed]
        if len(missing) > 1:
            raise ValueError(f"Password must contain: {', '.join(missing)}")
        return v
```

### 07.3.2 跨字段依赖验证

```python
from pydantic import BaseModel, model_validator
from datetime import date, timedelta

class Booking(BaseModel):
    start_date: date
    end_date: date
    room_type: str
    guests: int

    @model_validator(mode="after")
    def validate_booking(self) -> "Booking":
        # 日期逻辑
        if self.end_date < self.start_date:
            raise ValueError("End date must be after start date")
        if (self.end_date - self.start_date).days > 14:
            raise ValueError("Maximum booking duration is 14 days")

        # 房间类型与人数关系
        max_guests = {"single": 1, "double": 2, "suite": 4}
        if self.guests > max_guests.get(self.room_type, 2):
            raise ValueError(f"{self.room_type} room supports max {max_guests[self.room_type]} guests")

        return self
```

### 07.3.3 数据脱敏

```python
from pydantic import BaseModel, field_validator
import re

class SensitiveData(BaseModel):
    id_card: str
    phone: str
    bank_account: str
    name: str

    @field_validator("id_card")
    @classmethod
    def validate_id_card(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.match(r"^\d{17}[\dX]$", v):
            raise ValueError("Invalid ID card number")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) != 11:
            raise ValueError("Phone must be 11 digits")
        return digits

    @field_validator("bank_account")
    @classmethod
    def validate_bank_account(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10 or len(digits) > 20:
            raise ValueError("Invalid bank account number")
        return digits

    def masked_dump(self) -> dict:
        return {
            "name": self.name,
            "id_card": self.id_card[:3] + "***********" + self.id_card[-1:],
            "phone": self.phone[:3] + "****" + self.phone[-4:],
            "bank_account": "****" + self.bank_account[-4:],
        }
```

---

## 07.4 示例代码

### 07.4.1 完整的订单验证体系

```python
"""电商订单验证体系"""
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional
from enum import Enum

class OrderStatus(str, Enum):
    pending = "pending"
    paid = "paid"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"

class OrderItem(BaseModel):
    product_id: int = Field(gt=0)
    product_name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(gt=0, le=999)
    unit_price: float = Field(gt=0)
    discount: float = Field(ge=0, le=1, default=0)

    @field_validator("unit_price")
    @classmethod
    def round_price(cls, v: float) -> float:
        return round(v, 2)

    @property
    def subtotal(self) -> float:
        return round(self.quantity * self.unit_price * (1 - self.discount), 2)

class ShippingInfo(BaseModel):
    recipient: str = Field(min_length=1, max_length=50)
    phone: str = Field(pattern=r"^\d{11}$")
    province: str
    city: str
    district: str
    detail: str = Field(min_length=1, max_length=200)

class CreateOrder(BaseModel):
    items: list[OrderItem] = Field(min_length=1, max_length=100)
    shipping: ShippingInfo
    coupon_code: Optional[str] = None
    remark: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def validate_order(self) -> "CreateOrder":
        total = sum(item.subtotal for item in self.items)
        if total < 0.01:
            raise ValueError("Order total must be at least 0.01")
        if len(self.items) > 50:
            raise ValueError("Order cannot have more than 50 items")
        return self

    @property
    def total_amount(self) -> float:
        return round(sum(item.subtotal for item in self.items), 2)
```

---

## 07.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| field_validator 中访问其他未验证字段 | 使用 model_validator(mode="after") 做跨字段验证 |
| 验证器中抛出非 ValueError | 验证器只能抛 ValueError（其他异常会导致 500） |
| 在 mode="before" 验证器中依赖已验证数据 | mode="before" 时字段尚未验证，info.data 可能不完整 |
| 自定义类型不支持序列化 | 实现 `__get_pydantic_core_schema__` 时配置 serialization |
| 过多内联验证器 | 提取为 Annotated 自定义类型，提高复用性 |
| 验证器与 Field 约束重复 | Field 做简单约束，验证器做复杂逻辑 |
| 忘记 @classmethod | field_validator/model_validator 必须是类方法 |

---

本章从 field_validator 到 model_validator，从 Annotated 验证模式到自定义类型的 core_schema，从验证器执行顺序到 Rust 层实现，全面剖析了 Pydantic 验证器与自定义类型的机制与实践。