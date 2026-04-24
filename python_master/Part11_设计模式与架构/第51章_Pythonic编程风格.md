# 第51章 Pythonic编程风格

Pythonic 不仅仅是一种编码风格，更是一种深度理解 Python 设计哲学后自然流露的编程思维。本章从 Python 之禅的实践、惯用写法到反模式识别，系统阐述如何写出地道的 Python 代码。

---

## 51.1 概念与语法

### 51.1.1 Pythonic 的定义

Pythonic 代码的核心特征：

1. **利用语言特性**：使用推导式、生成器、上下文管理器等 Python 特有构造
2. **遵循 PEP 8**：社区统一的代码风格规范
3. **体现 Python 之禅**：显式优于隐式、简单优于复杂、可读性重要
4. **善用标准库**：不重复造轮子
5. **鸭子类型**：关注行为而非类型

```python
# Non-Pythonic（从其他语言带来的习惯）
result = []
for i in range(10):
    if i % 2 == 0:
        result.append(i ** 2)

# Pythonic
result = [i ** 2 for i in range(10) if i % 2 == 0]
```

### 51.1.2 PEP 8 核心规范

```python
# 命名约定
module_name.py          # 模块：小写下划线
ClassName               # 类：大驼峰
CONSTANT_NAME           # 常量：大写下划线
function_name           # 函数：小写下划线
variable_name           # 变量：小写下划线
_private_name           # 私有：前导下划线
__dunder_name__         # 魔术方法：双下划线
_name_mangling          # 名称改写：双前导下划线

# 缩进：4 个空格
# 行宽：79 字符（PEP 8），可放宽到 99
# 空行：
#   - 顶层函数/类之间：2 个空行
#   - 类内方法之间：1 个空行
#   - 函数内逻辑段落：1 个空行

# 导入顺序
import os               # 1. 标准库
import sys

import numpy as np       # 2. 第三方库
import requests

import mymodule          # 3. 本地模块
from mypackage import MyClass

# 空格
spam(ham[1], {eggs: 2})  # 逗号后加空格
if x == 4:               # 比较运算符两侧加空格
dct['key'] = lst[index]  # 索引不加空格
x = x + 1                # 赋值运算符两侧加空格
```

### 51.1.3 类型注解（Pythonic 的重要组成部分）

```python
from typing import Optional, Union, List, Dict, Callable, TypeVar, Generic

# 函数签名类型注解
def greet(name: str, times: int = 1) -> str:
    return (f"Hello, {name}! " * times).strip()

# 容器类型注解
names: List[str] = ['Alice', 'Bob']
scores: Dict[str, int] = {'Alice': 90, 'Bob': 85}

# Optional 和 Union
def find_user(user_id: int) -> Optional[dict]:
    """返回用户或 None。"""
    ...

def process(value: Union[str, int]) -> str:
    """接受 str 或 int。"""
    return str(value)

# Callable
def apply(func: Callable[[int, int], int], a: int, b: int) -> int:
    return func(a, b)

# 泛型
T = TypeVar('T')

class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

# Python 3.10+ 更简洁的语法
# def process(value: str | int) -> str:
# def find_user(user_id: int) -> dict | None:
# names: list[str] = ['Alice', 'Bob']
```

---

## 51.2 原理与机制

### 51.2.1 Pythonic 写法的底层优势

```python
# 推导式 vs for 循环的字节码差异
import dis

# 推导式
dis.dis(compile('[x**2 for x in range(10)]', '<string>', 'eval'))
# LIST_APPEND — 直接操作栈，不经过属性查找

# for + append
dis.dis(compile('''
result = []
for x in range(10):
    result.append(x**2)
''', '<string>', 'exec'))
# LOAD_ATTR append — 每次迭代都要查找 append 方法
# CALL_FUNCTION — 函数调用开销

# 性能差异约 30-50%，原因：
# 1. LIST_APPEND 是专用指令，跳过 LOAD_ATTR + CALL_FUNCTION
# 2. 推导式在独立作用域中执行，避免名称冲突
# 3. 列表预分配大小（内部优化）
```

### 51.2.2 上下文管理器的协议

```python
# with 语句的字节码
import dis
dis.dis(compile('with open("f") as f: pass', '<string>', 'exec'))
# SETUP_WITH — 设置 __enter__/__exit__ 调用
# POP_BLOCK — 清理上下文

# 上下文管理器协议
class FileManager:
    def __init__(self, path, mode):
        self.path = path
        self.mode = mode

    def __enter__(self):
        self.file = open(self.path, self.mode)
        return self.file

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.file.close()
        return False  # 不抑制异常

# with 语句保证 __exit__ 总是被调用（即使有异常）
# 等价于：
# mgr = FileManager(path, mode)
# f = mgr.__enter__()
# try:
#     pass
# finally:
#     mgr.__exit__(...)
```

### 51.2.3 迭代器协议与 for 循环

```python
# Pythonic 的遍历方式
# 好：直接遍历
for item in items:
    process(item)

# 差：索引遍历
for i in range(len(items)):
    process(items[i])

# 字节码对比
import dis

# 直接遍历：GET_ITER + FOR_ITER
dis.dis(compile('for x in items: pass', '<string>', 'exec'))

# 索引遍历：LOAD_GLOBAL(len) + CALL + GET_ITER + FOR_ITER + BINARY_SUBSCR
dis.dis(compile('for i in range(len(items)): items[i]', '<string>', 'exec'))
# 索引遍历多了 len() 调用和 BINARY_SUBSCR 索引操作

# enumerate — Pythonic 的索引+值遍历
for i, item in enumerate(items):
    print(f'{i}: {item}')

# zip — Pythonic 的并行遍历
for name, score in zip(names, scores):
    print(f'{name}: {score}')
```

---

## 51.3 使用场景

### 51.3.1 数据转换的 Pythonic 写法

```python
# 字典转换
# Non-Pythonic
result = {}
for k, v in original.items():
    result[v] = k

# Pythonic
result = {v: k for k, v in original.items()}

# 过滤
# Non-Pythonic
result = []
for item in items:
    if condition(item):
        result.append(transform(item))

# Pythonic
result = [transform(item) for item in items if condition(item)]

# 展平嵌套列表
# Non-Pythonic
result = []
for row in matrix:
    for item in row:
        result.append(item)

# Pythonic
result = [item for row in matrix for item in row]

# 更 Pythonic（itertools.chain）
from itertools import chain
result = list(chain.from_iterable(matrix))
```

### 51.3.2 条件与控制的 Pythonic 写法

```python
# 真值测试
# Non-Pythonic
if len(items) > 0:
    process(items)
if items != []:
    process(items)
if items is not None and len(items) > 0:
    process(items)

# Pythonic
if items:
    process(items)

# 三目表达式
# Non-Pythonic
if condition:
    result = a
else:
    result = b

# Pythonic
result = a if condition else b

# 多条件匹配
# Non-Pythonic (if/elif 链)
if status == 400:
    msg = 'Bad request'
elif status == 404:
    msg = 'Not found'
elif status == 500:
    msg = 'Server error'

# Pythonic (字典分发)
messages = {400: 'Bad request', 404: 'Not found', 500: 'Server error'}
msg = messages.get(status, 'Unknown error')

# Python 3.10+ (match/case)
match status:
    case 400: msg = 'Bad request'
    case 404: msg = 'Not found'
    case 500: msg = 'Server error'
    case _: msg = 'Unknown error'
```

### 51.3.3 资源管理的 Pythonic 写法

```python
# Non-Pythonic
f = open('file.txt')
try:
    data = f.read()
finally:
    f.close()

# Pythonic
with open('file.txt') as f:
    data = f.read()

# 多资源管理
# Pythonic
with open('input.txt') as fin, open('output.txt', 'w') as fout:
    fout.write(fin.read())

# contextlib
from contextlib import contextmanager, suppress, redirect_stdout

@contextmanager
def timer(name):
    import time
    start = time.perf_counter()
    yield
    elapsed = time.perf_counter() - start
    print(f'{name}: {elapsed:.3f}s')

with timer('operation'):
    expensive_operation()

# suppress — 忽略指定异常
with suppress(FileNotFoundError):
    os.remove('maybe_exists.txt')
```

---

## 51.4 示例代码

### 51.4.1 Pythonic 工具集

```python
"""Pythonic 编程风格常用模式集合"""
from itertools import islice, chain, groupby
from collections import namedtuple
from contextlib import contextmanager
from typing import Iterable, TypeVar
import functools

T = TypeVar('T')


# 分块迭代
def chunks(iterable: Iterable[T], size: int) -> Iterable[list]:
    """将可迭代对象分成指定大小的块。"""
    it = iter(iterable)
    while chunk := list(islice(it, size)):
        yield chunk


# 去重但保持顺序
def dedupe(iterable: Iterable[T], key=None) -> Iterable[T]:
    """去重但保持首次出现的顺序。"""
    seen = set()
    for item in iterable:
        k = key(item) if key else item
        if k not in seen:
            seen.add(k)
            yield item


# 扁平化
def flatten(nested: Iterable) -> Iterable:
    """递归展平嵌套可迭代对象。"""
    for item in nested:
        if isinstance(item, (list, tuple)):
            yield from flatten(item)
        else:
            yield item


# 分组
def group_by(iterable: Iterable[T], key) -> dict:
    """按 key 函数分组。"""
    groups = {}
    for item in sorted(iterable, key=key):
        k = key(item)
        groups.setdefault(k, []).append(item)
    return groups


# 使用
print(list(chunks(range(10), 3)))          # [[0,1,2], [3,4,5], [6,7,8], [9]]
print(list(dedupe([1, 2, 2, 3, 1, 4])))    # [1, 2, 3, 4]
print(list(flatten([[1, 2], [3, [4, 5]]]))) # [1, 2, 3, 4, 5]
```

### 51.4.2 数据类替代 namedtuple 和普通类

```python
from dataclasses import dataclass, field
from typing import List


# Non-Pythonic（手动编写 __init__、__repr__、__eq__）
class PointOld:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f'PointOld({self.x}, {self.y})'

    def __eq__(self, other):
        return self.x == other.x and self.y == other.y


# Pythonic（dataclass 自动生成）
@dataclass
class Point:
    x: float
    y: float

    def distance_to(self, other: 'Point') -> float:
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5


@dataclass
class Circle:
    center: Point
    radius: float = 1.0

    @property
    def area(self) -> float:
        return 3.14159 * self.radius ** 2


@dataclass
class Student:
    name: str
    grades: List[float] = field(default_factory=list)

    @property
    def average(self) -> float:
        return sum(self.grades) / len(self.grades) if self.grades else 0.0


# 使用
p1 = Point(0, 0)
p2 = Point(3, 4)
print(p1)                        # Point(x=0.0, y=0.0)
print(p1.distance_to(p2))       # 5.0
print(p1 == Point(0, 0))        # True
```

---

## 51.5 常见陷阱与最佳实践

### 51.5.1 反模式识别

```python
# 反模式1：滥用类（Java 风格）
class StringUtils:
    @staticmethod
    def capitalize(s):
        return s.capitalize()

# Pythonic：使用模块函数
def capitalize(s):
    return s.capitalize()

# 反模式2：过度使用 getter/setter
class Person:
    def __init__(self):
        self._name = None

    def get_name(self):
        return self._name

    def set_name(self, name):
        self._name = name

# Pythonic：使用属性
class Person:
    @property
    def name(self):
        return self._name

    @name.setter
    def name(self, value):
        self._name = value

# 反模式3：返回错误码
def divide(a, b):
    if b == 0:
        return -1  # 错误码
    return a / b

# Pythonic：抛出异常
def divide(a, b):
    if b == 0:
        raise ValueError('Cannot divide by zero')
    return a / b
```

### 51.5.2 总结

| 反模式 | Pythonic 替代 |
|--------|--------------|
| 索引遍历 `for i in range(len(x))` | 直接遍历 `for item in x` |
| 手动 append 循环 | 推导式/生成器表达式 |
| `if len(x) > 0` | `if x` |
| Java 风格 getter/setter | `@property` |
| 手动 `__init__`/`__repr__`/`__eq__` | `@dataclass` |
| 返回错误码 | 抛出异常 |
| 类只放静态方法 | 模块级函数 |
| 手动资源管理 | `with` 语句 |
| 字符串拼接用 `+` | `join()` 或 f-string |

---

本章从 Pythonic 的定义到反模式识别，从底层字节码优势到惯用写法的实践，全面阐述了如何写出地道的 Python 代码。Pythonic 不仅关乎风格，更关乎对语言设计的深度理解。