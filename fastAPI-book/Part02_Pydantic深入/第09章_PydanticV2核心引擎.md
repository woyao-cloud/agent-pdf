# 第09章 Pydantic V2核心引擎

Pydantic V2 用 Rust 重写了核心引擎，带来了显著的性能提升。本章从 pydantic-core 的架构到 core_schema 系统，从 V1 迁移到性能优化，深入剖析 Pydantic V2 核心引擎的底层机制。

---

## 09.1 概念与语法

### 09.1.1 V2 关键变化

```python
"""
Pydantic V1 → V2 关键变化：

1. 核心引擎：Python → Rust（pydantic-core）
2. 性能：验证速度快 5-50 倍，序列化速度快 2-10 倍
3. API 变更：
   - @validator → @field_validator
   - @root_validator → @model_validator
   - .dict() → .model_dump()
   - .json() → .model_dump_json()
   - .parse_obj() → .model_validate()
   - .parse_raw() → .model_validate_json()
   - .schema() → .model_json_schema()
   - __fields__ → model_fields
   - __validators__ → 已移除
4. 新增特性：
   - Annotated 验证模式
   - TypeAdapter
   - WrapValidator
   - model_validator(mode="before"/"after")
   - 更好的错误信息
"""
```

### 09.1.2 core_schema 系统

```python
"""
core_schema 是 Pydantic V2 的内部模式定义系统。

每个 BaseModel 在类创建时会生成一个 core_schema，
描述该模型的验证和序列化规则。

core_schema 类型层级：

1. 顶层模式：
   - model_fields_schema — 模型字段模式
   - model_schema — 完整模型模式
   - typed_dict_schema — TypedDict 模式

2. 字段模式：
   - str_schema, int_schema, float_schema, bool_schema
   - list_schema, tuple_schema, dict_schema
   - nullable_schema, union_schema, literal_schema
   - chain_schema — 链式验证

3. 验证器模式：
   - no_info_plain_validator_function
   - with_info_plain_validator_function
   - no_info_wrap_validator_function
   - with_info_wrap_validator_function

4. 序列化器模式：
   - plain_serializer_function_ser_schema
   - wrap_serializer_function_ser_schema
   - to_string_ser_schema
   - format_ser_schema
"""
```

### 09.1.3 WrapValidator

```python
from pydantic import BaseModel, WrapValidator
from typing import Annotated, Any
from pydantic_core import core_schema

# WrapValidator — 在验证前后执行自定义逻辑
def validate_with_logging(v: Any, validator: core_schema.ValidatorFunctionWrapHandler) -> str:
    print(f"Before validation: {v!r}")
    result = validator(v)  # 调用原始验证器
    print(f"After validation: {result!r}")
    return result

LoggedStr = Annotated[str, WrapValidator(validate_with_logging)]

class Item(BaseModel):
    name: LoggedStr

item = Item(name="test")
# Before validation: 'test'
# After validation: 'test'

# WrapValidator 用于修改验证行为
def coerce_to_str(v: Any, validator: core_schema.ValidatorFunctionWrapHandler) -> str:
    if isinstance(v, (int, float)):
        v = str(v)
    return validator(v)

FlexibleStr = Annotated[str, WrapValidator(coerce_to_str)]

class Config(BaseModel):
    value: FlexibleStr

c = Config(value=42)  # value="42" — 自动转换
```

### 09.1.4 性能对比

```python
"""
Pydantic V1 vs V2 性能对比（典型场景）：

操作              | V1 耗时    | V2 耗时    | 提升倍数
------------------|-----------|-----------|--------
模型验证（简单）   | 10.2 μs   | 0.8 μs    | ~12x
模型验证（复杂）   | 85.3 μs   | 4.1 μs    | ~20x
JSON 解析         | 12.5 μs   | 1.2 μs    | ~10x
model_dump()      | 3.8 μs    | 0.5 μs    | ~7x
JSON Schema 生成  | 450 μs    | 45 μs     | ~10x

性能提升来源：
1. Rust 的零成本抽象和内存安全
2. 避免了 Python 的动态类型检查开销
3. 内置类型的验证完全在 Rust 层完成
4. JSON 解析使用 Rust 的 serde_json
5. 减少了 Python ↔ Rust 的边界调用次数
"""
```

---

## 09.2 原理与机制

### 09.2.1 pydantic-core 架构

```python
"""
pydantic-core 的 Rust 层架构：

1. 模块结构（Rust 源码）：
   src/
   ├── lib.rs           — Python 扩展入口
   ├── build_context.rs — 构建上下文
   ├── validators/      — 验证器实现
   │   ├── mod.rs
   │   ├── string.rs
   │   ├── numeric.rs
   │   ├── list.rs
   │   ├── dict.rs
   │   ├── model.rs
   │   └── union.rs
   └── serializers/     — 序列化器实现
       ├── mod.rs
       ├── simple.rs
       └── model.rs

2. 核心类型：
   - SchemaValidator：持有验证逻辑的 Rust 对象
   - SchemaSerializer：持有序列化逻辑的 Rust 对象
   - ValidationError：验证错误（由 Rust 构建错误列表）

3. Python ↔ Rust 边界：
   - 使用 PyO3 库进行 Python 绑定
   - SchemaValidator.validate_python(input) → Result
   - SchemaSerializer.dump_python(value) → dict
   - SchemaSerializer.dump_json(value) → bytes

4. 模式编译流程：
   Python core_schema
   → pydantic_core::build_schema()
   → 编译为 Rust 内部的 Type 和 Validator
   → 缓存在 SchemaValidator 对象中
"""
```

### 09.2.2 模型创建的内部流程

```python
"""
BaseModel 类创建时的完整流程：

1. __init_subclass__ 触发（Python 元类机制）
   ↓
2. _model_construction.complete_model_class()
   - 收集所有字段定义
   - 解析类型注解（get_origin, get_args）
   - 处理 Field 配置
   - 处理验证器装饰器
   ↓
3. 生成 core_schema
   - model_fields_schema 或 typed_dict_schema
   - 为每个字段生成对应的 sub-schema
   - 嵌入 field_validator/model_validator 回调
   ↓
4. 调用 pydantic-core 编译
   - SchemaValidator.from_schema(core_schema)
   - 生成 Rust 验证器对象
   - 绑定到 cls.__pydantic_validator__
   ↓
5. 生成 SchemaSerializer
   - SchemaSerializer.from_schema(core_schema)
   - 生成 Rust 序列化器对象
   - 绑定到 cls.__pydantic_serializer__
   ↓
6. 生成 JSON Schema
   - model_json_schema()
   - 基于 core_schema 生成 OpenAPI 兼容的 JSON Schema

关键源码位置：
- pydantic/main.py: BaseModel 定义
- pydantic/_internal/_model_construction.py: 模型构建
- pydantic/_internal/_generate_schema.py: core_schema 生成
"""
```

### 09.2.3 验证错误机制

```python
"""
ValidationError 的构建流程：

1. Rust 层验证失败
   → 收集所有失败字段和错误信息
   → 构建 ErrorList（Rust 内部结构）

2. Python 层接收错误
   → pydantic_core.ValidationError
   → 包含 error_count(), errors(), json()

3. 错误信息结构：
   {
     "type": "missing",          # 错误类型
     "loc": ("name",),           # 错误位置（字段路径）
     "msg": "Field required",    # 错误消息
     "input": None,              # 输入值
   }

4. 常见错误类型：
   - missing: 必填字段缺失
   - value_error: 值验证失败（ValueError）
   - string_type: 字符串类型错误
   - greater_than: gt 约束失败
   - missing_for_discriminated_union: 联合类型判别缺失

5. FastAPI 的错误处理：
   ValidationError → RequestValidationError → 422 Response
"""
from pydantic import BaseModel, ValidationError

class User(BaseModel):
    name: str
    age: int

try:
    User(age="invalid")
except ValidationError as e:
    print(e.errors())
    # [{"type": "missing", "loc": ("name",), "msg": "Field required"},
    #  {"type": "int_parsing", "loc": ("age",), "msg": "Input should be a valid integer"}]
    print(e.error_count())  # 2
    print(e.json())         # JSON 格式错误信息
```

---

## 09.3 使用场景

### 09.3.1 V1 到 V2 迁移

```python
"""
V1 → V2 迁移要点：

1. 替换废弃方法：
   model.dict()        → model.model_dump()
   model.json()        → model.model_dump_json()
   Model.parse_obj(d)  → Model.model_validate(d)
   Model.parse_raw(s)  → Model.model_validate_json(s)
   Model.schema()      → Model.model_json_schema()

2. 验证器替换：
   @validator("field")                    → @field_validator("field")
   @validator("field", pre=True)          → @field_validator("field", mode="before")
   @validator("*", pre=True)              → @model_validator(mode="before")
   @root_validator                        → @model_validator(mode="after")
   @root_validator(pre=True)              → @model_validator(mode="before")

3. 配置替换：
   class Config:                          → model_config = ConfigDict(...)
   class Config: arbitrary_types_allowed   → model_config = ConfigDict(arbitrary_types_allowed=True)

4. 字段替换：
   __fields__                             → model_fields
   field: str = Field(default=...)        → 不变
   Optional[str]                          → str | None

5. 使用 pydantic 的迁移辅助工具：
   pip install pydantic
   python -m pydantic.migration  # 自动检测迁移点
"""
```

### 09.3.2 高性能验证场景

```python
from pydantic import BaseModel, TypeAdapter, ConfigDict
from typing import Annotated
from pydantic import Field, AfterValidator

# 1. 批量验证（使用 TypeAdapter）
adapter = TypeAdapter(list[int])

def validate_batch(data: list) -> list[int]:
    return adapter.validate_python(data)

# 2. Strict 模式（减少类型转换开销）
class StrictConfig(BaseModel):
    model_config = ConfigDict(strict=True)
    id: int
    name: str

# StrictConfig(id="1", name="test")  → ValidationError
# StrictConfig(id=1, name="test")     → OK

# 3. 复用 SchemaValidator
class FastModel(BaseModel):
    model_config = ConfigDict(frozen=True)  # 不可变，更快的 hash
    key: str
    value: int

# 4. JSON 直接验证（跳过 Python dict 中间态）
adapter = TypeAdapter(FastModel)
json_bytes = b'{"key":"test","value":42}'
result = adapter.validate_json(json_bytes)
# 直接从 JSON 字节解析为模型，比先 json.loads 再 model_validate 更快
```

---

## 09.4 示例代码

### 09.4.1 自定义 core_schema 完整示例

```python
"""自定义类型完整 core_schema 示例"""
from pydantic import BaseModel, GetCoreSchemaHandler
from pydantic_core import core_schema
from typing import Any

class IPv4Address:
    """自定义 IPv4 地址类型。"""
    __slots__ = ("address",)

    def __init__(self, address: str):
        self.address = address

    def __repr__(self) -> str:
        return f"IPv4Address({self.address!r})"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, IPv4Address) and self.address == other.address

    def __hash__(self) -> int:
        return hash(self.address)

    @classmethod
    def _validate(cls, value: Any) -> "IPv4Address":
        if isinstance(value, cls):
            return value
        if not isinstance(value, str):
            raise ValueError("IPv4 address must be a string")
        parts = value.split(".")
        if len(parts) != 4:
            raise ValueError("IPv4 must have 4 octets")
        for part in parts:
            try:
                n = int(part)
            except ValueError:
                raise ValueError(f"Invalid octet: {part}")
            if n < 0 or n > 255:
                raise ValueError(f"Octet out of range: {part}")
        return cls(value)

    @classmethod
    def _serialize(cls, value: "IPv4Address") -> str:
        return value.address

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type: Any, handler: GetCoreSchemaHandler) -> core_schema.CoreSchema:
        return core_schema.no_info_plain_validator_function(
            cls._validate,
            serialization=core_schema.plain_serializer_function_ser_schema(
                cls._serialize,
                info_arg=False,
            ),
        )

    @classmethod
    def __get_pydantic_json_schema__(cls, _schema: core_schema.CoreSchema) -> dict:
        return {"type": "string", "format": "ipv4", "examples": ["192.168.1.1"]}

class Server(BaseModel):
    name: str
    ip: IPv4Address
    port: int = 80

server = Server(name="web-01", ip="192.168.1.100", port=8080)
server.model_dump()  # {"name": "web-01", "ip": "192.168.1.100", "port": 8080}
```

---

## 09.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 直接使用 .dict()/.json() | V2 使用 .model_dump()/.model_dump_json() |
| 验证器中返回值与字段类型不匹配 | 验证器返回值必须符合字段类型声明 |
| 不使用 TypeAdapter 验证非模型类型 | TypeAdapter 是验证原始类型的正确方式 |
| V1 迁移不彻底 | 使用 `pydantic.migration` 工具检测 |
| 忽略 strict 模式的性能优势 | 高吞吐场景使用 strict=True |
| 自定义类型不实现序列化 | 必须同时实现验证和序列化 |
| 大模型 class 创建慢 | 避免运行时动态创建模型类 |
| 不使用 frozen 模式 | 不可变模型更安全，hash 更快 |

---

本章从 Pydantic V2 的核心变化到 pydantic-core 的 Rust 架构，从 core_schema 系统到 WrapValidator，从验证错误机制到 V1 迁移要点，全面剖析了 Pydantic V2 核心引擎的底层机制。