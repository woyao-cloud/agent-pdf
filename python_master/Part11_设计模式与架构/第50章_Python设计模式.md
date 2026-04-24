# 第50章 Python设计模式

## 1. 概念与语法

设计模式（Design Patterns）是面向对象软件开发中反复出现的问题的通用解决方案。1994年 GoF（Gang of Four）在《Design Patterns: Elements of Reusable Object-Oriented Software》中正式归纳了 23 种经典模式，分为三大类：

| 类别 | 关注点 | 本章覆盖 |
|------|--------|----------|
| 创建型（Creational） | 对象创建机制 | 单例、工厂方法、抽象工厂、建造器 |
| 结构型（Structural） | 对象组合与接口适配 | 适配器、装饰器、代理 |
| 行为型（Behavioral） | 对象间通信与职责分配 | 观察者、策略、命令 |

Python 的动态特性（duck typing、first-class functions、metaclass、descriptor）使得许多经典模式可以用更简洁的 Pythonic 方式实现，而非照搬 Java/C++ 的类层次结构。

### 1.1 创建型模式

#### 单例模式（Singleton）

确保一个类只有一个实例，并提供全局访问点。

```python
# 方式一：模块级别单例（最 Pythonic）
# my_singleton.py
class _DatabaseConnection:
    def __init__(self):
        self.connected = False
    
    def connect(self):
        self.connected = True
        return f"Connected: {id(self)}"

# 模块本身就是单例——Python 模块只加载一次
instance = _DatabaseConnection()

# 使用方
# from my_singleton import instance
```

```python
# 方式二：基于 __new__ 的单例
class SingletonViaNew:
    _instance = None
    _initialized = False
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, value=None):
        # 注意：__init__ 每次都会被调用
        if not self._initialized:
            self.value = value
            self._initialized = True

# 验证
s1 = SingletonViaNew("first")
s2 = SingletonViaNew("second")  # value 仍然是 "first"
assert s1 is s2
assert s1.value == "first"
```

```python
# 方式三：基于 metaclass 的单例（最优雅、最可控）
class SingletonMeta(type):
    """线程安全的单例 metaclass"""
    _instances = {}
    _lock = threading.Lock()  # 需要 import threading
    
    def __call__(cls, *args, **kwargs):
        with cls._lock:
            if cls not in cls._instances:
                instance = super().__call__(*args, **kwargs)
                cls._instances[cls] = instance
            return cls._instances[cls]

class Database(metaclass=SingletonMeta):
    def __init__(self, host="localhost"):
        self.host = host
        self.connections = 0
    
    def query(self, sql):
        self.connections += 1
        return f"[{self.host}] Executing: {sql} (conn #{self.connections})"

# 验证
db1 = Database("primary")
db2 = Database("secondary")  # host 仍然是 "primary"
assert db1 is db2
assert db1.host == "primary"
```

#### 工厂方法模式（Factory Method）

定义创建对象的接口，让子类决定实例化哪个类。

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Type

# 产品接口
@dataclass
class Transport:
    name: str
    
    def deliver(self) -> str:
        return f"Delivering via {self.name}"

class Truck(Transport):
    def deliver(self) -> str:
        return f"Truck delivery: {self.name} on road"

class Ship(Transport):
    def deliver(self) -> str:
        return f"Ship delivery: {self.name} by sea"

class Airplane(Transport):
    def deliver(self) -> str:
        return f"Air delivery: {self.name} by air"

# 创建者基类
class Logistics(ABC):
    @abstractmethod
    def create_transport(self, name: str) -> Transport:
        """工厂方法——子类决定创建哪种 Transport"""
        ...
    
    def plan_delivery(self, name: str) -> str:
        transport = self.create_transport(name)
        return f"Plan: {transport.deliver()}"

class RoadLogistics(Logistics):
    def create_transport(self, name: str) -> Transport:
        return Truck(name)

class SeaLogistics(Logistics):
    def create_transport(self, name: str) -> Transport:
        return Ship(name)

# 使用
road = RoadLogistics()
print(road.plan_delivery("Cargo-1"))  # Plan: Truck delivery: Cargo-1 on road

sea = SeaLogistics()
print(sea.plan_delivery("Cargo-2"))  # Plan: Ship delivery: Cargo-2 by sea
```

#### 抽象工厂模式（Abstract Factory）

提供创建一系列相关对象的接口，无需指定具体类。

```python
from abc import ABC, abstractmethod

# 产品族：Button 和 Checkbox
class Button(ABC):
    @abstractmethod
    def render(self) -> str: ...

class Checkbox(ABC):
    @abstractmethod
    def render(self) -> str: ...

# Windows 风格
class WindowsButton(Button):
    def render(self) -> str:
        return "[Windows Button]"

class WindowsCheckbox(Checkbox):
    def render(self) -> str:
        return "[Windows Checkbox]"

# macOS 风格
class MacOSButton(Button):
    def render(self) -> str:
        return "{macOS Button}"

class MacOSCheckbox(Checkbox):
    def render(self) -> str:
        return "{macOS Checkbox}"

# 抽象工厂
class GUIFactory(ABC):
    @abstractmethod
    def create_button(self) -> Button: ...
    
    @abstractmethod
    def create_checkbox(self) -> Checkbox: ...

class WindowsFactory(GUIFactory):
    def create_button(self) -> Button:
        return WindowsButton()
    
    def create_checkbox(self) -> Checkbox:
        return WindowsCheckbox()

class MacOSFactory(GUIFactory):
    def create_button(self) -> Button:
        return MacOSButton()
    
    def create_checkbox(self) -> Checkbox:
        return MacOSCheckbox()

# 客户端代码
def create_dialog(factory: GUIFactory) -> str:
    button = factory.create_button()
    checkbox = factory.create_checkbox()
    return f"Dialog: {button.render()} + {checkbox.render()}"

print(create_dialog(WindowsFactory()))  # Dialog: [Windows Button] + [Windows Checkbox]
print(create_dialog(MacOSFactory()))    # Dialog: {macOS Button} + {macOS Checkbox}
```

#### 建造器模式（Builder）

将复杂对象的构建过程与其表示分离，使同样的构建过程可以创建不同的表示。

```python
from dataclasses import dataclass, field
from typing import Optional, List

@dataclass
class Computer:
    cpu: str = ""
    ram: str = ""
    storage: str = ""
    gpu: Optional[str] = None
    monitor: Optional[str] = None
    peripherals: List[str] = field(default_factory=list)
    
    def __str__(self):
        parts = [f"CPU={self.cpu}", f"RAM={self.ram}", f"Storage={self.storage}"]
        if self.gpu:
            parts.append(f"GPU={self.gpu}")
        if self.monitor:
            parts.append(f"Monitor={self.monitor}")
        if self.peripherals:
            parts.append(f"Peripherals={','.join(self.peripherals)}")
        return f"Computer({', '.join(parts)})"

class ComputerBuilder:
    """Fluent Builder——链式调用"""
    def __init__(self):
        self._computer = Computer()
    
    def cpu(self, model: str) -> 'ComputerBuilder':
        self._computer.cpu = model
        return self
    
    def ram(self, size: str) -> 'ComputerBuilder':
        self._computer.ram = size
        return self
    
    def storage(self, size: str) -> 'ComputerBuilder':
        self._computer.storage = size
        return self
    
    def gpu(self, model: str) -> 'ComputerBuilder':
        self._computer.gpu = model
        return self
    
    def monitor(self, model: str) -> 'ComputerBuilder':
        self._computer.monitor = model
        return self
    
    def add_peripheral(self, name: str) -> 'ComputerBuilder':
        self._computer.peripherals.append(name)
        return self
    
    def build(self) -> Computer:
        if not self._computer.cpu or not self._computer.ram:
            raise ValueError("Computer must have CPU and RAM")
        result = self._computer
        self._computer = Computer()  # 重置，允许 builder 复用
        return result

# 使用
gaming_pc = (ComputerBuilder()
    .cpu("Intel i9-13900K")
    .ram("64GB DDR5")
    .storage("2TB NVMe SSD")
    .gpu("NVIDIA RTX 4090")
    .monitor("4K 144Hz")
    .add_peripheral("Mechanical Keyboard")
    .add_peripheral("Gaming Mouse")
    .build())

print(gaming_pc)
# Computer(CPU=Intel i9-13900K, RAM=64GB DDR5, Storage=2TB NVMe SSD, 
#          GPU=NVIDIA RTX 4090, Monitor=4K 144Hz, Peripherals=Mechanical Keyboard,Gaming Mouse)
```

### 1.2 结构型模式

#### 适配器模式（Adapter）

将一个类的接口转换为客户期望的另一个接口，使原本不兼容的类可以协同工作。

```python
from dataclasses import dataclass
from typing import Protocol

# 目标接口（我们期望的）
class Printer(Protocol):
    def print_document(self, content: str) -> str: ...

# 旧系统——接口不兼容
class OldPrinter:
    def send_text(self, text: str) -> str:
        return f"[OLD PRINTER] {text}"
    
    def calibrate(self) -> str:
        return "Calibrated"

# 另一个不兼容的系统
class NewPrinter:
    def render(self, data: dict) -> str:
        return f"[NEW PRINTER] {data.get('content', '')}"

# 适配器
class OldPrinterAdapter:
    """将 OldPrinter 适配为 Printer 协议"""
    def __init__(self, old_printer: OldPrinter):
        self._old_printer = old_printer
    
    def print_document(self, content: str) -> str:
        return self._old_printer.send_text(content)

class NewPrinterAdapter:
    """将 NewPrinter 适配为 Printer 协议"""
    def __init__(self, new_printer: NewPrinter):
        self._new_printer = new_printer
    
    def print_document(self, content: str) -> str:
        return self._new_printer.render({"content": content})

# 客户端代码——只依赖 Printer 协议
def print_report(printer: Printer, report: str) -> str:
    return printer.print_document(report)

old = OldPrinterAdapter(OldPrinter())
new = NewPrinterAdapter(NewPrinter())

print(print_report(old, "Monthly Report"))  # [OLD PRINTER] Monthly Report
print(print_report(new, "Annual Report"))    # [NEW PRINTER] Annual Report
```

#### 装饰器模式（Decorator）

动态地给对象添加额外职责，比继承更灵活。

```python
from abc import ABC, abstractmethod
from functools import wraps

# ============ 经典 OOP 装饰器模式 ============

class TextProcessor(ABC):
    @abstractmethod
    def process(self, text: str) -> str: ...

class PlainTextProcessor(TextProcessor):
    def process(self, text: str) -> str:
        return text

class ProcessingDecorator(TextProcessor):
    def __init__(self, wrapped: TextProcessor):
        self._wrapped = wrapped
    
    def process(self, text: str) -> str:
        return self._wrapped.process(text)

class UpperCaseDecorator(ProcessingDecorator):
    def process(self, text: str) -> str:
        return self._wrapped.process(text).upper()

class MarkdownBoldDecorator(ProcessingDecorator):
    def process(self, text: str) -> str:
        return f"**{self._wrapped.process(text)}**"

class TrimDecorator(ProcessingDecorator):
    def process(self, text: str) -> str:
        return self._wrapped.process(text).strip()

# 组合使用
processor = MarkdownBoldDecorator(UpperCaseDecorator(PlainTextProcessor()))
print(processor.process("hello world"))  # **HELLO WORLD**

# ============ Pythonic 方式：函数装饰器 ============

def uppercase_decorator(func):
    @wraps(func)
    def wrapper(text: str) -> str:
        return func(text).upper()
    return wrapper

def bold_decorator(func):
    @wraps(func)
    def wrapper(text: str) -> str:
        result = func(text)
        return f"**{result}**"
    return result if func.__name__ != 'wrapper' else f"**{func(text)}**"

# 更 Pythonic 的做法——用函数组合
def make_bold(text_fn):
    def wrapper(text):
        return f"**{text_fn(text)}**"
    return wrapper

def make_uppercase(text_fn):
    def wrapper(text):
        return text_fn(text).upper()
    return wrapper

@make_bold
@make_uppercase
def process_text(text: str) -> str:
    return text

print(process_text("hello"))  # **HELLO**
```

#### 代理模式（Proxy）

为其他对象提供代理或占位符，以控制对原始对象的访问。

```python
from functools import wraps
import time
import threading

# ============ 虚拟代理（懒加载） ============

class HeavyResource:
    """模拟一个初始化开销很大的资源"""
    def __init__(self, config: str):
        time.sleep(0.1)  # 模拟耗时初始化
        self.config = config
        self._data = list(range(1000))
    
    def query(self, index: int) -> int:
        return self._data[index]

class LazyResourceProxy:
    """虚拟代理：延迟到真正需要时才创建真实对象"""
    def __init__(self, config: str):
        self._config = config
        self._real: HeavyResource = None
    
    def query(self, index: int) -> int:
        if self._real is None:
            self._real = HeavyResource(self._config)
        return self._real.query(index)

proxy = LazyResourceProxy("prod")
# 此时 HeavyResource 尚未创建
result = proxy.query(42)  # 此时才创建
print(result)  # 42

# ============ 保护代理（访问控制） ============

class SecretDocument:
    def __init__(self, content: str, level: int):
        self.content = content
        self.level = level  # 1=公开, 2=机密, 3=绝密

class DocumentProxy:
    """保护代理：基于用户权限控制访问"""
    def __init__(self, doc: SecretDocument, user_level: int):
        self._doc = doc
        self._user_level = user_level
    
    @property
    def content(self) -> str:
        if self._user_level < self._doc.level:
            raise PermissionError(
                f"Access denied: requires level {self._doc.level}, you have {self._user_level}"
            )
        return self._doc.content

doc = SecretDocument("Nuclear launch codes: 12345", level=3)
public_proxy = DocumentProxy(doc, user_level=1)
try:
    print(public_proxy.content)  # Access denied
except PermissionError as e:
    print(e)

admin_proxy = DocumentProxy(doc, user_level=3)
print(admin_proxy.content)  # Nuclear launch codes: 12345

# ============ 智能代理（缓存 + 日志） ============

class CachedAPIProxy:
    """智能代理：添加缓存和日志"""
    def __init__(self, api_client):
        self._client = api_client
        self._cache: dict = {}
        self._call_count: int = 0
    
    def fetch(self, endpoint: str) -> str:
        self._call_count += 1
        if endpoint in self._cache:
            print(f"[CACHE HIT] {endpoint}")
            return self._cache[endpoint]
        print(f"[CACHE MISS] Fetching {endpoint}...")
        result = self._client.fetch(endpoint)
        self._cache[endpoint] = result
        return result
    
    @property
    def stats(self) -> str:
        return f"Total calls: {self._call_count}, Cache size: {len(self._cache)}"

class RealAPIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
    
    def fetch(self, endpoint: str) -> str:
        return f"Data from {self.base_url}/{endpoint}"

client = RealAPIClient("https://api.example.com")
proxy = CachedAPIProxy(client)

print(proxy.fetch("users"))     # CACHE MISS
print(proxy.fetch("users"))     # CACHE HIT
print(proxy.fetch("orders"))    # CACHE MISS
print(proxy.stats)               # Total calls: 3, Cache size: 2
```

### 1.3 行为型模式

#### 观察者模式（Observer）

定义对象间一对多的依赖关系，当一个对象状态改变时，所有依赖者都会收到通知。

```python
from dataclasses import dataclass, field
from typing import Protocol, List, Callable, Any
from enum import Enum

# ============ 经典实现 ============

class Observer(Protocol):
    def update(self, event_type: str, data: Any) -> None: ...

class Subject:
    def __init__(self):
        self._observers: List[Observer] = []
    
    def attach(self, observer: Observer) -> None:
        if observer not in self._observers:
            self._observers.append(observer)
    
    def detach(self, observer: Observer) -> None:
        self._observers.remove(observer)
    
    def notify(self, event_type: str, data: Any = None) -> None:
        for observer in self._observers:
            observer.update(event_type, data)

class EmailNotifier:
    def update(self, event_type: str, data: Any) -> None:
        print(f"[Email] {event_type}: {data}")

class SMSNotifier:
    def update(self, event_type: str, data: Any) -> None:
        print(f"[SMS] {event_type}: {data}")

subject = Subject()
subject.attach(EmailNotifier())
subject.attach(SMSNotifier())
subject.notify("ORDER_CREATED", {"order_id": 123, "amount": 99.9})
# [Email] ORDER_CREATED: {'order_id': 123, 'amount': 99.9}
# [SMS] ORDER_CREATED: {'order_id': 123, 'amount': 99.9}

# ============ Pythonic 实现：基于回调函数 ============

class EventEmitter:
    """基于信号/槽的轻量级事件系统"""
    def __init__(self):
        self._handlers: dict[str, List[Callable]] = {}
    
    def on(self, event: str, handler: Callable) -> 'EventEmitter':
        self._handlers.setdefault(event, []).append(handler)
        return self  # 支持链式调用
    
    def off(self, event: str, handler: Callable) -> None:
        if event in self._handlers:
            self._handlers[event] = [h for h in self._handlers[event] if h is not handler]
    
    def emit(self, event: str, *args, **kwargs) -> None:
        for handler in self._handlers.get(event, []):
            handler(*args, **kwargs)
    
    def once(self, event: str, handler: Callable) -> None:
        def wrapper(*args, **kwargs):
            self.off(event, wrapper)
            handler(*args, **kwargs)
        self.on(event, wrapper)

emitter = EventEmitter()

emitter.on("user_login", lambda name: print(f"Welcome, {name}!"))
emitter.on("user_login", lambda name: print(f"[LOG] User {name} logged in"))

emitter.emit("user_login", "Alice")
# Welcome, Alice!
# [LOG] User Alice logged in

# once 示例
emitter.once("first_order", lambda: print("First order bonus activated!"))
emitter.emit("first_order")  # 触发
emitter.emit("first_order")  # 不再触发
```

#### 策略模式（Strategy）

定义一系列算法，将每个算法封装起来，并使它们可以互换。

```python
from typing import Protocol, List
from dataclasses import dataclass

# ============ 经典策略模式 ============

class SortStrategy(Protocol):
    def sort(self, data: List[int]) -> List[int]: ...

class BubbleSort:
    def sort(self, data: List[int]) -> List[int]:
        result = data.copy()
        n = len(result)
        for i in range(n):
            for j in range(0, n - i - 1):
                if result[j] > result[j + 1]:
                    result[j], result[j + 1] = result[j + 1], result[j]
        return result

class QuickSort:
    def sort(self, data: List[int]) -> List[int]:
        if len(data) <= 1:
            return data.copy()
        pivot = data[len(data) // 2]
        left = [x for x in data if x < pivot]
        middle = [x for x in data if x == pivot]
        right = [x for x in data if x > pivot]
        return self.sort(left) + middle + self.sort(right)

class BuiltInSort:
    def sort(self, data: List[int]) -> List[int]:
        return sorted(data)

@dataclass
class Sorter:
    strategy: SortStrategy
    
    def sort(self, data: List[int]) -> List[int]:
        return self.strategy.sort(data)

data = [64, 34, 25, 12, 22, 11, 90]

sorter = Sorter(strategy=QuickSort())
print(sorter.sort(data))  # [11, 12, 22, 25, 34, 64, 90]

sorter = Sorter(strategy=BuiltInSort())  # 运行时切换策略
print(sorter.sort(data))  # [11, 12, 22, 25, 34, 64, 90]

# ============ Pythonic 方式：函数即策略 ============

def bubble_sort_fn(data: list) -> list:
    result = data.copy()
    n = len(result)
    for i in range(n):
        for j in range(0, n - i - 1):
            if result[j] > result[j + 1]:
                result[j], result[j + 1] = result[j + 1], result[j]
    return result

def quick_sort_fn(data: list) -> list:
    if len(data) <= 1:
        return data.copy()
    pivot = data[len(data) // 2]
    left = [x for x in data if x < pivot]
    middle = [x for x in data if x == pivot]
    right = [x for x in data if x > pivot]
    return quick_sort_fn(left) + middle + quick_sort_fn(right)

@dataclass
class FlexibleSorter:
    strategy: callable = sorted  # 默认使用内置排序
    
    def sort(self, data: list) -> list:
        return self.strategy(data)

flex_sorter = FlexibleSorter(strategy=quick_sort_fn)
print(flex_sorter.sort(data))

# 运行时切换——直接赋值一个函数
flex_sorter.strategy = bubble_sort_fn
print(flex_sorter.sort(data))
```

#### 命令模式（Command）

将请求封装为对象，从而允许用队列、请求和日志来参数化客户。

```python
from dataclasses import dataclass, field
from typing import Protocol, List, Any
from enum import Enum

# ============ 经典命令模式 ============

class Command(Protocol):
    def execute(self) -> str: ...
    def undo(self) -> str: ...

class Light:
    def __init__(self, name: str):
        self.name = name
        self.on = False
    
    def turn_on(self) -> str:
        self.on = True
        return f"{self.name} light is ON"
    
    def turn_off(self) -> str:
        self.on = False
        return f"{self.name} light is OFF"

class LightOnCommand:
    def __init__(self, light: Light):
        self._light = light
    
    def execute(self) -> str:
        return self._light.turn_on()
    
    def undo(self) -> str:
        return self._light.turn_off()

class LightOffCommand:
    def __init__(self, light: Light):
        self._light = light
    
    def execute(self) -> str:
        return self._light.turn_off()
    
    def undo(self) -> str:
        return self._light.turn_on()

class RemoteControl:
    """Invoker——调用者"""
    def __init__(self):
        self._history: List[Command] = []
    
    def execute(self, command: Command) -> str:
        result = command.execute()
        self._history.append(command)
        return result
    
    def undo(self) -> str:
        if not self._history:
            return "Nothing to undo"
        command = self._history.pop()
        return command.undo()

# 使用
living_room = Light("Living Room")
remote = RemoteControl()

print(remote.execute(LightOnCommand(living_room)))  # Living Room light is ON
print(remote.execute(LightOffCommand(living_room)))  # Living Room light is OFF
print(remote.undo())  # Living Room light is ON（撤销了关灯）
print(remote.undo())  # Living Room light is OFF（撤销了开灯）

# ============ Pythonic 命令模式：用闭包和 callable ============

class CommandHistory:
    def __init__(self):
        self._undo_stack: List[tuple] = []  # (undo_fn, description)
        self._redo_stack: List[tuple] = []
    
    def execute(self, do_fn, undo_fn, description: str = ""):
        result = do_fn()
        self._undo_stack.append((undo_fn, description))
        self._redo_stack.clear()  # 新命令清空 redo 栈
        return result
    
    def undo(self) -> str:
        if not self._undo_stack:
            return "Nothing to undo"
        undo_fn, desc = self._undo_stack.pop()
        result = undo_fn()
        self._redo_stack.append((undo_fn, desc))
        return f"Undo '{desc}': {result}"
    
    def redo(self) -> str:
        if not self._redo_stack:
            return "Nothing to redo"
        redo_fn, desc = self._redo_stack.pop()
        result = redo_fn()
        self._undo_stack.append((redo_fn, desc))
        return f"Redo '{desc}': {result}"

# 使用闭包构建命令
class BankAccount:
    def __init__(self, balance: float = 0):
        self.balance = balance
    
    def deposit(self, amount: float):
        self.balance += amount
        return f"Deposited {amount}, balance: {self.balance}"
    
    def withdraw(self, amount: float):
        if amount > self.balance:
            raise ValueError("Insufficient funds")
        self.balance -= amount
        return f"Withdrew {amount}, balance: {self.balance}"

account = BankAccount(100)
history = CommandHistory()

# 存款命令
print(history.execute(
    do_fn=lambda: account.deposit(50),
    undo_fn=lambda: account.withdraw(50),
    description="Deposit $50"
))
# Deposited 50, balance: 150.0

# 取款命令
print(history.execute(
    do_fn=lambda: account.withdraw(30),
    undo_fn=lambda: account.deposit(30),
    description="Withdraw $30"
))
# Withdrew 30, balance: 120.0

print(history.undo())   # Undo 'Withdraw $30': ...
print(account.balance)   # 150.0（恢复了取款前的余额）
```

## 2. 原理与机制

### 2.1 Python 元编程与设计模式的关系

Python 的元编程能力使得许多 GoF 模式可以被大幅简化：

```python
# ============ 用 __class_getitem__ 实现类型安全的工厂 ============

class TypedFactory:
    """利用 Python 3.9+ 的 __class_getitem__ 实现泛型工厂"""
    _registry: dict = {}
    
    def __class_getitem__(cls, key):
        if key not in cls._registry:
            raise KeyError(f"No implementation registered for {key}")
        return cls._registry[key]
    
    @classmethod
    def register(cls, key, implementation):
        cls._registry[key] = implementation
    
    @classmethod
    def create(cls, key, *args, **kwargs):
        return cls[key](*args, **kwargs)

# 使用
class Animal:
    def __init__(self, name: str):
        self.name = name

class Dog(Animal):
    def speak(self) -> str:
        return f"{self.name}: Woof!"

class Cat(Animal):
    def speak(self) -> str:
        return f"{self.name}: Meow!"

TypedFactory.register("dog", Dog)
TypedFactory.register("cat", Cat)

dog = TypedFactory.create("dog", "Buddy")
print(dog.speak())  # Buddy: Woof!
```

### 2.2 描述符协议与代理/装饰器模式

Python 的描述符协议（`__get__`, `__set__`, `__delete__`）是实现代理和装饰器模式的底层机制：

```python
class Validated:
    """基于描述符的属性验证——装饰器/代理模式的底层机制"""
    def __init__(self, *validators):
        self.validators = validators
        self.name = None
    
    def __set_name__(self, owner, name):
        self.name = f"_{name}"
    
    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        return getattr(obj, self.name, None)
    
    def __set__(self, obj, value):
        for validator in self.validators:
            if not validator(value):
                raise ValueError(f"Validation failed for {self.name}: {value}")
        setattr(obj, self.name, value)

def is_positive(x):
    return x > 0

def is_integer(x):
    return isinstance(x, int)

class Product:
    price = Validated(is_positive)
    quantity = Validated(is_positive, is_integer)
    
    def __init__(self, name: str, price: float, quantity: int):
        self.name = name
        self.price = price
        self.quantity = quantity

p = Product("Widget", 9.99, 10)
try:
    p.price = -5  # ValueError
except ValueError as e:
    print(e)
```

### 2.3 MRO 与多重继承下的设计模式

Python 的 C3 线性化（Method Resolution Order）影响混入（Mixin）类在模式中的作用：

```python
class LogMixin:
    """日志混入——可以与任何模式组合"""
    def log(self, message: str):
        print(f"[{self.__class__.__name__}] {message}")

class CacheMixin:
    """缓存混入"""
    _cache: dict = {}
    
    def get_cached(self, key: str):
        if key in self._cache:
            self.log(f"Cache hit: {key}")
            return self._cache[key]
        return None
    
    def set_cached(self, key: str, value):
        self._cache[key] = value
        self.log(f"Cache set: {key}")

class ObservableMixin:
    """观察者混入"""
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._observers = []
    
    def subscribe(self, observer):
        self._observers.append(observer)
    
    def notify_all(self, event: str, data=None):
        for obs in self._observers:
            obs(event, data)

# 组合多个 Mixin
class SmartRepository(LogMixin, CacheMixin, ObservableMixin):
    def __init__(self):
        super().__init__()
        self._data = {}
    
    def save(self, key: str, value):
        self._data[key] = value
        self.set_cached(key, value)
        self.notify_all("saved", {"key": key, "value": value})
        self.log(f"Saved: {key}")

def on_save(event, data):
    print(f"  Observer notified: {event} -> {data}")

repo = SmartRepository()
repo.subscribe(on_save)
repo.save("user:1", {"name": "Alice"})
# [SmartRepository] Cache set: user:1
# [SmartRepository] Saved: user:1
#   Observer notified: saved -> {'key': 'user:1', 'value': {'name': 'Alice'}}
```

## 3. 使用场景

### 3.1 创建型模式使用场景

| 模式 | 典型场景 | Python 替代方案 |
|------|----------|----------------|
| 单例 | 数据库连接池、配置管理、日志管理器 | 模块级变量、`@lru_cache` |
| 工厂方法 | 框架中创建框架用户定义的对象 | 简单函数工厂、dict 映射 |
| 抽象工厂 | 跨平台 UI 组件创建 | 函数 + 配置字典 |
| 建造器 | 复杂配置对象、SQL 查询构建 | dataclass + Builder、流畅接口 |

### 3.2 结构型模式使用场景

| 模式 | 典型场景 | Python 替代方案 |
|------|----------|----------------|
| 适配器 | 集成第三方 API、旧系统迁移 | Protocol + 适配函数 |
| 装饰器 | 日志、缓存、权限、I/O 流处理 | 函数装饰器 `@decorator` |
| 代理 | 远程对象访问、懒加载、访问控制 | `property`、`__getattr__` |

### 3.3 行为型模式使用场景

| 模式 | 典型场景 | Python 替代方案 |
|------|----------|----------------|
| 观察者 | 事件系统、消息总线、GUI 事件 | `blinker` 库、asyncio 事件 |
| 策略 | 排序算法切换、支付方式选择 | 函数作为参数、dict 映射 |
| 命令 | 撤销/重做、任务队列、宏录制 | 闭包、callable 对象 |

### 3.4 综合场景：电商订单系统

```python
from dataclasses import dataclass, field
from typing import Protocol, Optional, List, Callable
from enum import Enum
from datetime import datetime

# ===== 领域模型 =====
class OrderStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

@dataclass
class Order:
    id: str
    items: List[str]
    total: float
    status: OrderStatus = OrderStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

# ===== 策略模式：折扣策略 =====
class DiscountStrategy(Protocol):
    def apply(self, total: float) -> float: ...

class NoDiscount:
    def apply(self, total: float) -> float:
        return total

class PercentageDiscount:
    def __init__(self, percent: float):
        self.percent = percent
    
    def apply(self, total: float) -> float:
        return total * (1 - self.percent / 100)

class FixedAmountDiscount:
    def __init__(self, amount: float):
        self.amount = amount
    
    def apply(self, total: float) -> float:
        return max(0, total - self.amount)

# ===== 命令模式：订单操作 =====
class OrderCommand(Protocol):
    def execute(self) -> Order: ...
    def undo(self) -> Order: ...

class ConfirmOrderCommand:
    def __init__(self, order: Order):
        self._order = order
        self._previous_status = order.status
    
    def execute(self) -> Order:
        self._order.status = OrderStatus.CONFIRMED
        return self._order
    
    def undo(self) -> Order:
        self._order.status = self._previous_status
        return self._order

class CancelOrderCommand:
    def __init__(self, order: Order):
        self._order = order
        self._previous_status = order.status
    
    def execute(self) -> Order:
        self._order.status = OrderStatus.CANCELLED
        return self._order
    
    def undo(self) -> Order:
        self._order.status = self._previous_status
        return self._order

# ===== 观察者模式：订单事件通知 =====
class OrderEventEmitter:
    def __init__(self):
        self._listeners: dict[str, List[Callable]] = {}
    
    def on(self, event: str, listener: Callable):
        self._listeners.setdefault(event, []).append(listener)
    
    def emit(self, event: str, order: Order):
        for listener in self._listeners.get(event, []):
            listener(order)

# ===== 工厂模式：订单创建 =====
class OrderFactory:
    _counter = 0
    
    @classmethod
    def create_order(cls, items: List[str], total: float) -> Order:
        cls._counter += 1
        return Order(id=f"ORD-{cls._counter:04d}", items=items, total=total)

# ===== 综合使用 =====
emitter = OrderEventEmitter()

# 注册观察者
emitter.on("confirmed", lambda o: print(f"[Email] Order {o.id} confirmed"))
emitter.on("confirmed", lambda o: print(f"[Inventory] Reserving items for {o.id}"))
emitter.on("cancelled", lambda o: print(f"[Email] Order {o.id} cancelled"))

# 创建订单
order = OrderFactory.create_order(["Book", "Pen"], 50.0)

# 应用折扣策略
discount = PercentageDiscount(10)  # 10% 折扣
discounted_total = discount.apply(order.total)
print(f"Original: ${order.total}, After discount: ${discounted_total:.2f}")

# 执行命令
confirm_cmd = ConfirmOrderCommand(order)
confirm_cmd.execute()
emitter.emit("confirmed", order)

# 撤销
confirm_cmd.undo()
print(f"Order status after undo: {order.status.value}")

# 取消
cancel_cmd = CancelOrderCommand(order)
cancel_cmd.execute()
emitter.emit("cancelled", order)
```

## 4. 示例代码

### 4.1 线程安全的单例注册表

```python
import threading
from typing import Dict, Type, Any

class SingletonRegistry:
    """全局单例注册表——统一管理所有单例"""
    _instances: Dict[Type, Any] = {}
    _lock = threading.Lock()
    
    @classmethod
    def get_instance(cls, target_class: Type, *args, **kwargs) -> Any:
        if target_class not in cls._instances:
            with cls._lock:
                # 双重检查锁定
                if target_class not in cls._instances:
                    instance = target_class(*args, **kwargs)
                    cls._instances[target_class] = instance
        return cls._instances[target_class]
    
    @classmethod
    def reset(cls):
        """仅用于测试"""
        with cls._lock:
            cls._instances.clear()

# 使用
class ConfigManager:
    def __init__(self, env: str = "dev"):
        self.env = env
        self.settings = {"debug": env == "dev"}

class CacheManager:
    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self._cache = {}

config = SingletonRegistry.get_instance(ConfigManager, env="prod")
config2 = SingletonRegistry.get_instance(ConfigManager, env="test")
assert config is config2  # 同一个实例
assert config.env == "prod"  # 参数只在第一次创建时生效

cache = SingletonRegistry.get_instance(CacheManager, max_size=5000)
print(f"Config env: {config.env}, Cache max: {cache.max_size}")
```

### 4.2 插件式工厂与策略组合

```python
from typing import Dict, Type, Callable, Any
from dataclasses import dataclass

@dataclass
class PaymentResult:
    success: bool
    transaction_id: str
    message: str

class PaymentGateway:
    """插件式支付网关——注册策略，运行时选择"""
    _gateways: Dict[str, Callable] = {}
    
    @classmethod
    def register(cls, name: str):
        """装饰器：注册支付网关"""
        def decorator(fn):
            cls._gateways[name] = fn
            return fn
        return decorator
    
    @classmethod
    def pay(cls, gateway: str, amount: float, **kwargs) -> PaymentResult:
        if gateway not in cls._gateways:
            raise ValueError(f"Unknown gateway: {gateway}. Available: {list(cls._gateways.keys())}")
        return cls._gateways[gateway](amount, **kwargs)
    
    @classmethod
    def available_gateways(cls) -> list:
        return list(cls._gateways.keys())

# 注册各种支付网关
@PaymentGateway.register("alipay")
def alipay_payment(amount: float, **kwargs) -> PaymentResult:
    order_id = f"ALI-{id(amount)}-{amount}"
    return PaymentResult(success=True, transaction_id=order_id, message="Alipay payment processed")

@PaymentGateway.register("wechat")
def wechat_payment(amount: float, **kwargs) -> PaymentResult:
    order_id = f"WX-{id(amount)}-{amount}"
    return PaymentResult(success=True, transaction_id=order_id, message="WeChat payment processed")

@PaymentGateway.register("stripe")
def stripe_payment(amount: float, **kwargs) -> PaymentResult:
    currency = kwargs.get("currency", "USD")
    order_id = f"STR-{currency}-{amount}"
    return PaymentResult(success=True, transaction_id=order_id, message=f"Stripe payment ({currency}) processed")

# 使用
print(PaymentGateway.available_gateways())  # ['alipay', 'wechat', 'stripe']

result = PaymentGateway.pay("alipay", 99.9)
print(f"{result.message}: {result.transaction_id}")

result = PaymentGateway.pay("stripe", 49.99, currency="EUR")
print(f"{result.message}: {result.transaction_id}")
```

### 4.3 事件总线：观察者模式的进阶

```python
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Set
from collections import defaultdict
import asyncio

@dataclass
class Event:
    """事件对象"""
    type: str
    data: Any = None
    source: str = ""

class EventBus:
    """类型安全的发布/订阅事件总线"""
    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = defaultdict(list)
        self._once_handlers: Dict[str, Set[Callable]] = defaultdict(set)
        self._history: List[Event] = []
    
    def on(self, event_type: str, handler: Callable) -> 'EventBus':
        """订阅事件"""
        self._handlers[event_type].append(handler)
        return self
    
    def once(self, event_type: str, handler: Callable) -> 'EventBus':
        """只订阅一次"""
        self._once_handlers[event_type].add(handler)
        self._handlers[event_type].append(handler)
        return self
    
    def off(self, event_type: str, handler: Callable) -> 'EventBus':
        """取消订阅"""
        handlers = self._handlers[event_type]
        self._handlers[event_type] = [h for h in handlers if h != handler]
        self._once_handlers[event_type].discard(handler)
        return self
    
    def emit(self, event_type: str, data: Any = None, source: str = "") -> 'EventBus':
        """发布事件"""
        event = Event(type=event_type, data=data, source=source)
        self._history.append(event)
        
        # 处理一次性订阅
        once_handlers = self._once_handlers.pop(event_type, set())
        for handler in list(self._handlers[event_type]):
            try:
                handler(event)
            except Exception as e:
                print(f"[EventBus] Error in handler {handler.__name__}: {e}")
            finally:
                # 如果是一次性处理器，移除它
                if handler in once_handlers:
                    self.off(event_type, handler)
        
        return self
    
    def get_history(self, event_type: str = None) -> List[Event]:
        """获取事件历史"""
        if event_type:
            return [e for e in self._history if e.type == event_type]
        return self._history.copy()

# 使用
bus = EventBus()

def on_user_created(event: Event):
    print(f"  [Handler 1] New user: {event.data}")

def on_user_created_welcome(event: Event):
    print(f"  [Handler 2] Sending welcome email to: {event.data}")

def on_user_deleted(event: Event):
    print(f"  [Handler] User deleted: {event.data}")

bus.on("user_created", on_user_created)
bus.on("user_created", on_user_created_welcome)
bus.once("user_created", lambda e: print("  [One-time] First user event!"))
bus.on("user_deleted", on_user_deleted)

print("--- Events ---")
bus.emit("user_created", "Alice")
bus.emit("user_created", "Bob")
bus.emit("user_deleted", "Charlie")

print("\n--- History ---")
for event in bus.get_history():
    print(f"  {event.type}: {event.data}")
```

## 5. 常见陷阱与最佳实践

### 5.1 陷阱：单例中的 `__init__` 重复调用

```python
# 错误：每次 SingletonViaNew("second") 都会执行 __init__
class BadSingleton:
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, value):
        self.value = value  # 每次都会覆盖！

s1 = BadSingleton("first")
s2 = BadSingleton("second")
print(s2.value)  # "second" —— 被覆盖了！

# 正确：使用 _initialized 标志或 metaclass
class GoodSingleton:
    _instance = None
    _initialized = False
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, value):
        if not self._initialized:
            self.value = value
            self._initialized = True

s1 = GoodSingleton("first")
s2 = GoodSingleton("second")
print(s2.value)  # "first" —— 正确保持初值
```

### 5.2 陷阱：循环依赖导致观察者内存泄漏

```python
import gc
import weakref

class BadObservable:
    """问题：持有观察者的强引用，阻止垃圾回收"""
    def __init__(self):
        self._observers = []
    
    def attach(self, observer):
        self._observers.append(observer)  # 强引用！

class GoodObservable:
    """正确：使用 weakref 避免循环引用"""
    def __init__(self):
        self._observers: list[weakref.ref] = []
    
    def attach(self, observer):
        # 只持有弱引用
        self._observers.append(weakref.ref(observer, self._on_observer_gone))
    
    def _on_observer_gone(self, ref):
        """当观察者被回收时，自动清理引用"""
        self._observers.remove(ref)
    
    def notify(self, message):
        for ref in self._observers:
            observer = ref()
            if observer is not None:
                observer(message)

# 验证
observable = GoodObservable()

class Observer:
    def __call__(self, msg):
        print(f"Received: {msg}")

obs = Observer()
observable.attach(obs)
observable.notify("Hello")  # Received: Hello

del obs  # 观察者被回收
gc.collect()
observable.notify("World")  # 不会报错，引用已自动清理
```

### 5.3 陷阱：装饰器模式与 Python 装饰器混淆

```python
# 混淆：Python 装饰器 @语法 是语法糖，用于函数/类的包装
# 不是 GoF 装饰器模式（动态添加职责）

# Python 装饰器（语法糖）
def timing_decorator(func):
    """这是 Python 的装饰器语法——AOP 风格的函数包装"""
    import time
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.4f}s")
        return result
    return wrapper

@timing_decorator  # 等价于 my_func = timing_decorator(my_func)
def my_func():
    return sum(range(1000000))

# GoF 装饰器模式（运行时组合）
class TextComponent:
    def render(self) -> str:
        return "Hello"

class BoldDecorator(TextComponent):
    def __init__(self, component: TextComponent):
        self._component = component
    
    def render(self) -> str:
        return f"<b>{self._component.render()}</b>"

# 区别：
# Python 装饰器：编译时确定，静态包装
# GoF 装饰器模式：运行时动态组合
```

### 5.4 陷阱：策略模式中可变默认参数

```python
# 错误：可变默认参数被共享
class BadSorter:
    def __init__(self, strategy="quick", history=[]):  # 危险！
        self.strategy = strategy
        self.history = history  # 所有实例共享同一个列表！

s1 = BadSorter()
s2 = BadSorter()
s1.history.append("sort1")
print(s2.history)  # ['sort1'] —— 意外共享！

# 正确：使用 None 默认值
class GoodSorter:
    def __init__(self, strategy: str = "quick", history: list = None):
        self.strategy = strategy
        self.history = history if history is not None else []

s1 = GoodSorter()
s2 = GoodSorter()
s1.history.append("sort1")
print(s2.history)  # [] —— 各自独立
```

### 5.5 最佳实践总结

1. **优先使用 Pythonic 方式**：函数 > 类，模块 > 单例，dict > switch，Protocol > ABC（当只需要接口定义时）
2. **组合优于继承**：优先使用 Mixin 和组合，而非深层类层次
3. **使用 `Protocol` 做鸭子类型约束**：Python 3.8+ 的 `typing.Protocol` 提供了结构性子类型（structural subtyping），比 ABC 更灵活
4. **单例用模块或 `@lru_cache`**：Python 模块天然是单例的，`functools.lru_cache` 可以用于缓存昂贵实例
5. **策略模式用函数**：Python 的 first-class function 使得策略模式可以用简单函数替代类
6. **观察者注意内存**：使用 `weakref` 避免观察者模式导致的循环引用和内存泄漏
7. **工厂用注册表模式**：比条件分支更易扩展，新类型只需注册即可
8. **命令模式用闭包**：Python 的闭包比命令类更简洁，但需要可撤销操作时仍需类
9. **避免过度设计**：Python 的动态特性意味着很多 GoF 模式可以简化；不要为了用模式而用模式
10. **可测试性优先**：所有依赖注入和策略选择都应便于在测试中替换为 mock

```python
# 最佳实践：用 @lru_cache 实现单例
from functools import lru_cache

@lru_cache(maxsize=1)
def get_database_connection():
    """线程安全的单例——@lru_cache 本身是线程安全的（Python 3.9+）"""
    print("Creating database connection...")
    return {"connection": "established", "id": id(object())}

conn1 = get_database_connection()  # Creating database connection...
conn2 = get_database_connection()  # 缓存命中，不重新创建
assert conn1 is conn2  # 同一个对象

# 最佳实践：用 Protocol 替代 ABC 做接口定义
from typing import Protocol

class Closeable(Protocol):
    def close(self) -> None: ...

class Flushable(Protocol):
    def flush(self) -> None: ...

# 任何有 close() 方法的类都满足 Closeable——鸭子类型 + 类型检查
class MyResource:
    def close(self) -> None:
        print("Closed")

def safe_close(resource: Closeable) -> None:
    resource.close()  # mypy 会检查类型

safe_close(MyResource())  # 类型安全，无需显式继承
```