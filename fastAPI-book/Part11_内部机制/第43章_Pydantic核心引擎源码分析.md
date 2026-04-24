# 第43章 Pydantic核心引擎源码分析

Pydantic V2 用 Rust 重写了核心引擎，带来了巨大的性能提升。本章从模型构建到验证执行，从 core_schema 到 Rust 层优化，逐层剖析 Pydantic 核心引擎的源码实现。

---

## 43.1 概念与语法

### 43.1.1 Pydantic V2 架构总览

```python
"""
Pydantic V2 三层架构：

1. Python 层（pydantic/）
   - 用户 API：BaseModel, Field, validator, ConfigDict
   - 模型构建：_model_construction.py
   - Schema 生成：_generate_schema.py
   - 类型处理：_internal/_std_types_schema.py

2. Python-C 层（pydantic_core/）
   - Schema 定义：core_schema
   - 验证器：SchemaValidator
   - 序列化器：SchemaSerializer
   - 错误处理：ValidationError

3. Rust 层（pydantic-core/src/）
   - 验证核心：validators/ 目录
   - 序列化核心：serializers/ 目录
   - JSON Schema：json_schema.rs
   - Python 绑定：PyO3

数据流：
用户定义 BaseModel
→ _model_construction.py 收集字段信息
→ _generate_schema.py 生成 core_schema
→ pydantic-core 编译为 SchemaValidator/SchemaSerializer
→ 验证/序列化在 Rust 层执行
"""
```

### 43.1.2 核心源码入口

```python
"""
Pydantic V2 核心源码结构：

pydantic/
├── main.py                   — BaseModel 定义
├── _internal/
│   ├── _model_construction.py — 模型构建（__init_subclass__）
│   ├── _generate_schema.py    — core_schema 生成
│   ├── _fields.py             — 字段信息收集
│   ├── _config.py             — 配置处理
│   ├── _std_types_schema.py   — 标准类型 schema
│   └── _validate.py           — 验证逻辑
├── decorator.py               — 验证器装饰器
├── functional_serializers.py — 序列化器
├── types.py                   — 特殊类型
└── errors.py                 — 错误定义

pydantic_core/
├── core_schema.py             — Schema 定义
├── _pydantic_core.pyi         — 类型存根（Rust 绑定）
└── src/                       — Rust 源码
    ├── lib.rs                 — PyO3 入口
    ├── validators/            — 验证器实现
    │   ├── string.rs
    │   ├── int.rs
    │   ├── float.rs
    │   ├── dict.rs
    │   ├── list.rs
    │   ├── model.rs
    │   └── union.rs
    └── serializers/           — 序列化器实现
        ├── string.rs
        ├── int.rs
        └── model.rs
"""
```

---

## 43.2 原理与机制

### 43.2.1 模型构建流程

```python
"""
BaseModel 类创建时的完整流程：

1. Python 元类触发：
   class User(BaseModel):
       name: str
       age: int

   → ModelMetaclass.__new__ 被调用
   → _model_construction.complete_model_class()

2. 字段收集（_fields.py）：
   - 遍历类注解（__annotations__）
   - 为每个字段创建 FieldInfo 对象
   - 处理默认值和默认工厂
   - 处理 Field() 配置

3. core_schema 生成（_generate_schema.py）：
   - 为每个字段生成子 schema
   - 组合为 model_fields_schema
   - 嵌入验证器回调
   - 生成完整模型 schema

4. 编译为 Rust 验证器：
   SchemaValidator.from_schema(core_schema)
   → Rust 层编译为高效验证函数
   → 绑定到 cls.__pydantic_validator__

5. 编译为 Rust 序列化器：
   SchemaSerializer.from_schema(core_schema)
   → Rust 层编译为高效序列化函数
   → 绑定到 cls.__pydantic_serializer__

关键源码（_model_construction.py）：

def complete_model_class(
    cls: type[BaseModel],
    name: str,
    bases: tuple[type, ...],
    namespace: dict[str, Any],
):
    # 收集字段
    model_fields = collect_model_fields(cls, bases, namespace)

    # 生成 core_schema
    core_schema = generate_model_schema(cls, model_fields)

    # 创建 SchemaValidator
    cls.__pydantic_validator__ = SchemaValidator.from_schema(core_schema)

    # 创建 SchemaSerializer
    cls.__pydantic_serializer__ = SchemaSerializer.from_schema(core_schema)

    # 生成 JSON Schema
    cls.__pydantic_json_schema__ = generate_json_schema(core_schema)
"""
```

### 43.2.2 验证执行流程

```python
"""
模型验证的执行流程：

User(name="Alice", age="25")

1. BaseModel.__init__ 被调用
   → cls.__pydantic_validator__.validate_python(data)

2. SchemaValidator.validate_python() 调用 Rust 层
   → Rust 层查找模型 schema
   → 遍历 model_fields_schema 的每个字段

3. 每个字段的验证：
   name: str → str_schema.validate("Alice") → "Alice"
   age: int → int_schema.validate("25") → 25 (类型转换)

4. 验证器回调：
   如果字段有 @field_validator，在类型验证后执行

5. model_validator(mode="after")：
   所有字段验证完成后执行

6. 返回验证后的数据：
   → BaseModel.__init__ 设置属性
   → 创建模型实例

Rust 层验证（pydantic-core/src/validators/model.rs）：

fn validate_model(input: &PyDict, schema: &ModelSchema) -> Result<Model> {
    let mut output = Model::new();
    for (name, field_schema) in &schema.fields {
        let value = input.get(name)?;
        let validated = field_schema.validate(value)?;
        output.set(name, validated);
    }
    Ok(output)
}

性能关键点：
- 内置类型验证完全在 Rust 层完成
- 自定义验证器需要 Python 回调（有开销）
- 类型转换在 Rust 层执行（比 Python 快 10-50 倍）
- 模型嵌套验证递归执行
"""
```

### 43.2.3 core_schema 类型系统

```python
"""
core_schema 类型系统：

1. 核心类型 Schema：
   any_schema          — Any 类型
   none_schema         — None 类型
   bool_schema         — bool 类型
   int_schema          — int 类型（支持 gt, ge, lt, le, multiple_of）
   float_schema        — float 类型（支持约束）
   str_schema           — str 类型（支持 min_length, max_length, pattern）
   bytes_schema         — bytes 类型
   date_schema          — date 类型
   datetime_schema     — datetime 类型

2. 容器 Schema：
   list_schema(item_schema)          — 列表
   tuple_schema(item_schemas)         — 元组
   dict_schema(key_schema, value_schema) — 字典
   set_schema(item_schema)            — 集合

3. 复合 Schema：
   model_fields_schema(fields)         — 模型字段
   model_schema(model_fields, ...)     — 完整模型
   union_schema(choices)              — 联合类型
   literal_schema(values)             — 字面量类型
   is_instance_schema(cls)            — isinstance 检查

4. 验证器 Schema：
   no_info_plain_validator_function(func)    — 无信息验证器
   with_info_plain_validator_function(func)  — 带信息验证器
   no_info_wrap_validator_function(func)     — 包装验证器

5. 序列化器 Schema：
   plain_serializer_function_ser_schema(func)  — 简单序列化器
   wrap_serializer_function_ser_schema(func)   — 包装序列化器

示例：User 模型的 core_schema
{
    "type": "model-fields-schema",
    "fields": {
        "name": {
            "type": "str-schema",
            "min_length": 1,
            "max_length": 100,
        },
        "age": {
            "type": "int-schema",
            "ge": 0,
            "le": 150,
        },
    },
}
"""
```

---

## 43.3 使用场景

### 43.3.1 调试 Pydantic 验证

```python
from pydantic import BaseModel

class User(BaseModel):
    name: str
    age: int

# 查看 core_schema
print(User.__pydantic_core_schema__)
# 输出完整的 core_schema 字典

# 查看 model_fields
print(User.model_fields)
# {'name': FieldInfo(name='name', ...), 'age': FieldInfo(name='age', ...)}

# 查看验证过程
try:
    User(name="", age="invalid")
except ValidationError as e:
    for error in e.errors():
        print(f"Field: {error['loc']}, Type: {error['type']}, Msg: {error['msg']}")

# 查看验证器
print(User.__pydantic_validator__)
# SchemaValidator 对象
```

### 43.3.2 性能优化

```python
from pydantic import BaseModel, ConfigDict, TypeAdapter

# 1. 使用 strict 模式（减少类型转换开销）
class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True)
    name: str
    age: int

# 2. 使用 TypeAdapter（避免模型类创建开销）
adapter = TypeAdapter(list[int])
result = adapter.validate_python([1, 2, 3])  # 比创建模型快

# 3. 使用 model_validate_json（跳过 Python dict 中间态）
json_bytes = b'{"name": "Alice", "age": 30}'
user = User.model_validate_json(json_bytes)  # 比 json.loads + model_validate 快

# 4. 使用 frozen 模式（更快的不变模型）
class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True)
    key: str
    value: int

# 5. 避免运行时创建模型类（模型创建慢）
# 错误：在循环中创建模型
# for data in large_dataset:
#     DynamicModel = create_model("Dynamic", **fields)  # 很慢
#     DynamicModel(**data)

# 正确：预先创建模型
# model = DynamicModel  # 一次创建
# for data in large_dataset:
#     model.model_validate(data)  # 多次使用
```

---

## 43.4 示例代码

### 43.4.1 验证流程追踪

```python
"""追踪 Pydantic 验证流程"""
from pydantic import BaseModel, Field, field_validator, model_validator

class User(BaseModel):
    name: str = Field(min_length=1)
    age: int = Field(ge=0, le=150)
    email: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        print(f"  [field_validator] name: {v!r}")
        return v.strip().title()

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: int) -> int:
        print(f"  [field_validator] age: {v!r}")
        return v

    @model_validator(mode="after")
    def validate_model(self) -> "User":
        print(f"  [model_validator] self: {self}")
        return self

# 验证追踪
print("Creating User...")
user = User(name="  alice  ", age="25")

# 输出：
# [field_validator] name: '  alice  '
# [field_validator] age: '25' (str → int 类型转换)
# [model_validator] self: User(name='Alice', age=25)

# 查看 core_schema
print("\nCore Schema:")
import json
schema = User.__pydantic_core_schema__
# schema 包含完整的验证规则
```

---

## 43.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 不了解 V1/V2 API 差异 | V2 使用 model_dump/model_validate 代替 dict/parse_obj |
| 过多自定义验证器 | 内置约束（Field gt/ge 等）在 Rust 层执行更快 |
| 运行时动态创建模型 | 预创建模型，重复使用 validate |
| 不使用 strict 模式 | 高吞吐场景使用 strict=True 减少类型转换 |
| 验证器中做重计算 | 验证器应快速，重计算放业务逻辑 |
| 不使用 model_validate_json | JSON 直接验证比两步验证快 2-5 倍 |

---

本章从 Pydantic V2 三层架构到模型构建流程，从 core_schema 类型系统到 Rust 层验证执行，从验证调试到性能优化，全面剖析了 Pydantic 核心引擎的源码实现。