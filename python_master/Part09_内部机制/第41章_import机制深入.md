# 第41章 import机制深入

## 41.1 概念与语法

### 41.1.1 import 语句概览

Python 的 `import` 机制不仅是模块加载器，更是一个完整的、可扩展的**模块查找与加载系统**。从 `import xxx` 到模块对象就绪，经历了查找(Find)、加载(Load)、缓存(Cache)三个核心阶段。

```python
# 基本import语法
import module_name                    # 导入整个模块
import package.module                 # 导入包中的模块
from module import name              # 导入模块中的名称
from module import name as alias     # 带别名导入
from package import module           # 从包导入子模块
from package.module import *         # 通配符导入(不推荐)

# 相对导入
from . import sibling_module         # 同级模块
from .. import parent_module         # 父级模块
from .sibling import name            # 同级模块中的名称

# __import__内置函数
module = __import__('os.path')       # 等价于 import os.path

# importlib模块 — import机制的Python实现
import importlib
module = importlib.import_module('os.path')  # 推荐方式
```

### 41.1.2 import 的完整生命周期

```python
"""
import语句的完整生命周期:

1. 解析模块名 → 确定绝对名称
2. 检查sys.modules缓存 → 命中则直接返回
3. 查找(Find) → 遍历sys.meta_path中的Finder
4. 加载(Load) → 使用Finder返回的Loader
5. 执行模块代码 → 在模块命名空间中运行
6. 缓存到sys.modules → 后续import直接返回
"""

import sys

# 查看当前已加载的所有模块
print(f"已加载模块数: {len(sys.modules)}")

# 查看模块搜索路径
print(f"搜索路径: {sys.path}")

# 查看元路径查找器
print(f"元路径查找器: {sys.meta_path}")

# 查看路径钩子
print(f"路径钩子: {sys.path_hooks}")

# 查看路径导入缓存
print(f"路径缓存: {sys.path_importer_cache}")
```

### 41.1.3 核心概念：Finder、Loader与ModuleSpec

```python
import importlib.abc
import importlib.machinery

# Finder: 查找模块，返回ModuleSpec
# 所有Finder必须实现find_module()或find_spec()
class MyFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        """查找模块，返回ModuleSpec或None"""
        # 返回None表示此Finder找不到该模块
        # 返回ModuleSpec表示找到了，包含加载信息
        pass

# Loader: 加载模块，执行模块代码
class MyLoader(importlib.abc.Loader):
    def create_module(self, spec):
        """创建模块对象(可选)"""
        # 返回None使用默认创建逻辑
        return None

    def exec_module(self, module):
        """执行模块代码"""
        # 在module.__dict__中执行模块代码
        pass

# ModuleSpec: 模块规格，连接Finder和Loader
spec = importlib.util.find_spec('json')
if spec:
    print(f"模块名: {spec.name}")
    print(f"加载器: {spec.loader}")
    print(f"来源: {spec.origin}")
    print(f"是否为包: {spec.submodule_search_locations is not None}")
    print(f"搜索路径: {spec.submodule_search_locations}")
```

---

## 41.2 原理与机制

### 41.2.1 import 的 C 层面实现

当 Python 执行 `import os` 时，C 层面的调用链如下：

```c
// Python/bltinmodule.c — 内置__import__函数
static PyObject *
builtin___import__(PyObject *self, PyObject *args, PyObject *kwds)
{
    // 调用 PyImport_ImportModuleLevelObject
    return PyImport_ImportModuleLevelObject(
        name, globals, locals, fromlist, level);
}

// Python/import.c — 核心导入函数
PyObject *
PyImport_ImportModuleLevelObject(PyObject *name,
    PyObject *globals, PyObject *locals,
    PyObject *fromlist, int level)
{
    // 1. 确定绝对模块名
    //    如果level > 0，计算相对导入的绝对名
    PyObject *abs_name = resolve_name(name, globals, level);

    // 2. 检查sys.modules缓存
    PyObject *mod = PyDict_GetItem(interp->modules, abs_name);
    if (mod != NULL) {
        // 缓存命中!
        Py_INCREF(mod);
        return mod;
    }

    // 3. 调用importlib的Python实现
    //    CPython将import的核心逻辑委托给importlib模块
    return PyObject_Call(import_function, args, NULL);
}

// 真正的导入逻辑在Lib/importlib/_bootstrap.py中
// C层面只是入口，Python层面完成实际工作
```

### 41.2.2 importlib._bootstrap 深度剖析

CPython 的 import 机制核心逻辑实际上是用 Python 写的，位于 `Lib/importlib/_bootstrap.py`：

```python
# Lib/importlib/_bootstrap.py — import核心逻辑(简化)

def _find_and_load(name, import_):
    """查找并加载模块"""
    # 第一步: 检查sys.modules缓存
    module = sys.modules.get(name, _NEEDS_LOADING)
    if module is _NEEDS_LOADING:
        return _find_and_load_unlocked(name, import_)
    # 处理fromlist
    if _hack_at_imports(name, import_):
        return module
    return module


def _find_and_load_unlocked(name, import_):
    """查找并加载模块(无锁状态)"""
    # 第二步: 查找模块
    spec = _find_spec(name, None)
    if spec is None:
        raise ModuleNotFoundError(name)

    # 第三步: 加载模块
    module = _load_unlocked(spec)
    return module


def _find_spec(name, path, target=None):
    """遍历sys.meta_path查找模块"""
    # 按顺序遍历元路径查找器
    for finder in sys.meta_path:
        # 调用每个finder的find_spec方法
        spec = finder.find_spec(name, path, target)
        if spec is not None:
            return spec
    return None


def _load_unlocked(spec):
    """加载模块(无锁状态)"""
    # 创建模块对象
    module = _create_module(spec)

    # 缓存到sys.modules(在执行代码之前!)
    # 这样循环导入时可以获取到未完全初始化的模块
    sys.modules[spec.name] = module

    try:
        # 执行模块代码
        _exec_module(spec.loader, module)
    except BaseException:
        # 加载失败: 从缓存中删除
        try:
            del sys.modules[spec.name]
        except KeyError:
            pass
        raise

    return module


def _create_module(spec):
    """创建模块对象"""
    # 调用loader的create_module方法
    if hasattr(spec.loader, 'create_module'):
        module = spec.loader.create_module(spec)
        if module is not None:
            return module
    # 默认创建ModuleType对象
    return ModuleType(spec.name)


def _exec_module(loader, module):
    """执行模块代码"""
    # 调用loader的exec_module方法
    loader.exec_module(module)
```

### 41.2.3 sys.meta_path 与元路径查找器

`sys.meta_path` 是 import 系统的核心扩展点。默认包含三个 Finder：

```python
import sys

# 查看默认的元路径查找器
for i, finder in enumerate(sys.meta_path):
    print(f"{i}: {finder.__class__.__name__}")
    print(f"   {finder}")

# 输出示例:
# 0: ModuleSpec
#    <class 'importlib.machinery.ModuleSpec'>
# 1: BuiltinImporter
#    <class 'importlib.machinery.BuiltinImporter'>
# 2: FrozenImporter
#    <class 'importlib.machinery.FrozenImporter'>
# 3: WindowsRegistryFinder / PathFinder
#    <class 'importlib.machinery.WindowsRegistryFinder'>
# 4: PathFinder
#    <class 'importlib.machinery.PathFinder'>
```

每个 Finder 的职责：

```python
# 1. BuiltinImporter — 查找内置模块
#    查找sys.builtin_module_names中的模块
#    如: sys, builtins, _io, marshal等
print(f"内置模块: {sys.builtin_module_names[:10]}...")

# 2. FrozenImporter — 查找冻结模块
#    查找编译进Python二进制的模块
#    如: _frozen_importlib, _frozen_importlib_external等

# 3. PathFinder — 查找文件系统模块
#    遍历sys.path中的每个路径
#    对每个路径使用sys.path_hooks中的importer
#    查找.py, .pyc, .pyd等文件

# PathFinder的查找流程:
# for path_entry in sys.path:
#     for hook in sys.path_hooks:
#         importer = hook(path_entry)
#         spec = importer.find_spec(fullname)
#         if spec:
#             return spec
```

### 41.2.4 __pycache__ 与 .pyc 文件

```python
"""
.pyc文件的生成与查找机制
"""

import importlib
import importlib.util
import os
import sys
import struct
import marshal

# .pyc文件结构
# ====================
# | 魔数(4字节)       | — Python版本标识
# | 位标记(4字节)      | — Python 3.7+
# | 时间戳(4字节)      | — 源文件修改时间
# | 文件大小(4字节)    | — 源文件大小(Python 3.7+)
# | 字节码(marshal)   | — 序列化的Code Object
# ====================

# 查看当前Python的魔数
magic = importlib.util.MAGIC_NUMBER
print(f"魔数: {magic.hex()}")  # e.g., '0da10d0d' for Python 3.10
print(f"版本对应: {sys.version_info}")

# .pyc文件的缓存逻辑
# 1. 找到.py文件后，检查对应的__pycache__/.pyc
# 2. 比较源文件时间戳和大小(默认缓存验证)
# 3. 如果缓存有效，直接加载.pyc
# 4. 如果缓存无效或不存在，编译.py并写入.pyc

# 查看缓存的优化级别
# Python 3.8+ 支持三种优化级别:
# - 无优化: __pycache__/module.cpython-XY.pyc
# - 优化级别1(-O): __pycache__/module.cpython-XY.opt-1.pyc
# - 优化级别2(-OO): __pycache__/module.cpython-XY.opt-2.pyc

# 强制编译.pyc
import py_compile
py_compile.compile('example.py', optimize=0)

# 查看已编译的模块路径
import json
print(f"json模块来源: {json.__file__}")
print(f"json模块缓存: {json.__cached__}")
```

```c
// Python/import.c — .pyc文件校验
// 检查.pyc是否与.py同步

static int
check_pyc_file_time_and_size(FILE *pyc_fp,
    time_t source_mtime,      // 源文件修改时间
    Py_ssize_t source_size)   // 源文件大小
{
    // 1. 读取.pyc头部
    unsigned char buf[16];
    if (fread(buf, 1, 16, pyc_fp) != 16)
        return -1;

    // 2. 校验魔数
    if (get_uint32(buf) != PYC_MAGIC_NUMBER)
        return -1;  // 版本不匹配

    // 3. 校验位标记
    uint32_t flags = get_uint32(buf + 4);
    if (flags & PYC_HASH_BASED) {
        // 基于哈希的验证(--check-hash-based-pycs)
        // 比较源文件内容的哈希值
    } else {
        // 基于时间戳的验证(默认)
        // 比较源文件修改时间
        time_t pyc_mtime = get_uint32(buf + 8);
        if (pyc_mtime != source_mtime)
            return -1;  // 过期
    }

    return 0;  // 校验通过
}
```

### 41.2.5 Finder/Loader 协议详解

```python
"""
Finder/Loader协议 — import系统的核心扩展点

Finder: 负责查找模块，返回ModuleSpec
Loader: 负责创建模块对象并执行代码
"""

import importlib.abc
import importlib.machinery
import importlib.util
import sys
import types

# ---- 自定义Finder ----

class DebugFinder(importlib.abc.MetaPathFinder):
    """调试用的元路径查找器，记录所有import请求"""

    def __init__(self):
        self.import_log = []

    def find_spec(self, fullname, path, target=None):
        """查找模块规格"""
        self.import_log.append(fullname)
        # 返回None表示不处理，交给下一个Finder
        return None

    def install(self):
        """安装到sys.meta_path最前面"""
        sys.meta_path.insert(0, self)

    def uninstall(self):
        """从sys.meta_path移除"""
        if self in sys.meta_path:
            sys.meta_path.remove(self)


# ---- 自定义Loader ----

class StringLoader(importlib.abc.Loader):
    """从字符串加载Python模块"""

    def __init__(self, source_code, is_package=False):
        self.source_code = source_code
        self.is_package = is_package

    def create_module(self, spec):
        """创建模块对象(可选方法)"""
        # 返回None使用默认模块创建
        return None

    def exec_module(self, module):
        """执行模块代码"""
        # 编译并执行源代码
        code = compile(self.source_code, module.__spec__.origin, 'exec')
        exec(code, module.__dict__)

    def get_source(self, fullname):
        """返回模块源代码(支持inspect.getsource)"""
        return self.source_code


class StringFinder(importlib.abc.MetaPathFinder):
    """从字符串字典查找模块"""

    def __init__(self, modules_dict):
        # modules_dict: {模块名: 源代码字符串}
        self.modules = modules_dict

    def find_spec(self, fullname, path, target=None):
        """查找模块规格"""
        if fullname in self.modules:
            loader = StringLoader(
                self.modules[fullname],
                is_package=False
            )
            return importlib.machinery.ModuleSpec(
                fullname,
                loader,
                origin=f'<string:{fullname}>',
            )
        # 检查包(模块名是某个包的前缀)
        for key in self.modules:
            if key.startswith(fullname + '.'):
                # 这是一个包
                loader = StringLoader(
                    self.modules.get(fullname + '.__init__', ''),
                    is_package=True,
                )
                spec = importlib.machinery.ModuleSpec(
                    fullname,
                    loader,
                    origin=f'<string:{fullname}>',
                    is_package=True,
                )
                spec.submodule_search_locations = ['<string>']
                return spec
        return None


# 使用自定义Finder从字符串导入
modules = {
    'greeting': 'def hello(name): return f"Hello, {name}!"',
    'math_utils': '''
PI = 3.14159265

def circle_area(radius):
    return PI * radius * radius

def square(x):
    return x * x
''',
}

finder = StringFinder(modules)
sys.meta_path.insert(0, finder)

# 现在可以import自定义模块!
import greeting
print(greeting.hello("World"))

import math_utils
print(f"圆面积: {math_utils.circle_area(5)}")

# 清理
sys.meta_path.remove(finder)
del sys.modules['greeting']
del sys.modules['math_utils']
```

### 41.2.6 路径钩子(sys.path_hooks)

```python
"""
sys.path_hooks — 文件系统级别的导入扩展

PathFinder使用path_hooks将路径条目转换为importer
"""

import sys

# 查看默认路径钩子
print("=== 默认路径钩子 ===")
for i, hook in enumerate(sys.path_hooks):
    print(f"  {i}: {hook}")

# 输出示例:
# 0: <class 'zipimport.zipimporter'>
#    — 处理.zip和.egg文件
# 1: <function _path_isdir_basedir at ...>
#    — 处理目录路径

# 路径钩子的工作原理:
# 1. PathFinder对sys.path中的每个条目
# 2. 尝试用每个hook处理该条目
# 3. 如果hook返回importer对象，缓存到sys.path_importer_cache
# 4. 用importer查找模块

# 示例: ZipImporter
import zipimport

# 创建一个zip文件作为模块源
import zipfile
import os
import tempfile

# 将Python代码写入zip文件
temp_dir = tempfile.mkdtemp()
zip_path = os.path.join(temp_dir, 'mymodules.zip')

with zipfile.ZipFile(zip_path, 'w') as zf:
    zf.writestr('zip_module.py', '''
CONSTANT = "from_zip"
def greet(name):
    return f"Hello from zip, {name}!"
''')
    zf.writestr('zip_package/__init__.py', '''
version = "1.0"
''')

# 将zip文件添加到sys.path
sys.path.insert(0, zip_path)

# 现在可以import zip中的模块!
import zip_module
print(zip_module.greet("Python"))

import zip_package
print(f"zip_package版本: {zip_package.version}")

# 查看路径导入缓存
print(f"\nzip路径的importer: "
      f"{sys.path_importer_cache.get(zip_path)}")

# 清理
sys.path.remove(zip_path)
del sys.modules['zip_module']
del sys.modules['zip_package']
os.remove(zip_path)
os.rmdir(temp_dir)
```

---

## 41.3 使用场景

### 41.3.1 插件系统实现

```python
"""
plugin_system.py — 基于import机制的插件系统

支持:
- 自动发现插件目录中的模块
- 热加载/重载插件
- 插件元数据
- 依赖管理
"""

import importlib
import importlib.util
import importlib.abc
import sys
import os
import inspect
from typing import Dict, List, Optional, Type
from dataclasses import dataclass


@dataclass
class PluginInfo:
    """插件元数据"""
    name: str
    version: str
    description: str
    author: str
    dependencies: List[str]


class PluginBase:
    """插件基类"""
    plugin_info: PluginInfo

    def activate(self):
        """激活插件"""
        pass

    def deactivate(self):
        """停用插件"""
        pass

    def on_load(self):
        """加载后回调"""
        pass


class PluginManager:
    """插件管理器"""

    def __init__(self, plugin_dir: str = "plugins"):
        self.plugin_dir = plugin_dir
        self.plugins: Dict[str, PluginBase] = {}
        self._finder = None

    def discover_plugins(self) -> List[str]:
        """发现插件目录中的所有模块"""
        plugins = []
        if not os.path.isdir(self.plugin_dir):
            return plugins

        for filename in os.listdir(self.plugin_dir):
            if filename.endswith('.py') and not filename.startswith('_'):
                module_name = filename[:-3]
                plugins.append(module_name)
            elif os.path.isdir(os.path.join(self.plugin_dir, filename)):
                init_file = os.path.join(self.plugin_dir, filename, '__init__.py')
                if os.path.isfile(init_file):
                    plugins.append(filename)

        return plugins

    def load_plugin(self, module_name: str) -> Optional[PluginBase]:
        """加载插件"""
        if module_name in self.plugins:
            return self.plugins[module_name]

        # 计算绝对导入名
        abs_name = f"{self.plugin_dir}.{module_name}"

        try:
            # 使用importlib动态导入
            module = importlib.import_module(abs_name)

            # 查找PluginBase的子类
            plugin_class = None
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if (issubclass(obj, PluginBase) and
                        obj is not PluginBase and
                        obj.__module__ == module.__name__):
                    plugin_class = obj
                    break

            if plugin_class is None:
                raise ImportError(
                    f"插件 {module_name} 没有找到PluginBase子类")

            # 实例化插件
            plugin = plugin_class()
            self.plugins[module_name] = plugin
            plugin.on_load()

            return plugin

        except ImportError as e:
            print(f"加载插件 {module_name} 失败: {e}")
            return None

    def load_all_plugins(self) -> List[PluginBase]:
        """加载所有发现的插件"""
        loaded = []
        for name in self.discover_plugins():
            plugin = self.load_plugin(name)
            if plugin:
                loaded.append(plugin)
        return loaded

    def reload_plugin(self, module_name: str) -> Optional[PluginBase]:
        """热重载插件"""
        abs_name = f"{self.plugin_dir}.{module_name}"

        # 停用旧插件
        if module_name in self.plugins:
            self.plugins[module_name].deactivate()

        # 重新导入模块
        if abs_name in sys.modules:
            module = importlib.reload(sys.modules[abs_name])
        else:
            module = importlib.import_module(abs_name)

        # 重新查找插件类
        plugin_class = None
        for name, obj in inspect.getmembers(module, inspect.isclass):
            if (issubclass(obj, PluginBase) and
                    obj is not PluginBase):
                plugin_class = obj
                break

        if plugin_class:
            plugin = plugin_class()
            self.plugins[module_name] = plugin
            plugin.activate()
            return plugin
        return None

    def unload_plugin(self, module_name: str):
        """卸载插件"""
        abs_name = f"{self.plugin_dir}.{module_name}"

        if module_name in self.plugins:
            self.plugins[module_name].deactivate()
            del self.plugins[module_name]

        if abs_name in sys.modules:
            del sys.modules[abs_name]

    def get_plugin(self, module_name: str) -> Optional[PluginBase]:
        """获取已加载的插件"""
        return self.plugins.get(module_name)


# 使用示例
if __name__ == "__main__":
    # 创建插件目录和示例插件
    os.makedirs("plugins", exist_ok=True)

    with open("plugins/__init__.py", "w") as f:
        f.write("")

    with open("plugins/hello_plugin.py", "w") as f:
        f.write('''
from plugin_system import PluginBase, PluginInfo

class HelloPlugin(PluginBase):
    plugin_info = PluginInfo(
        name="hello",
        version="1.0",
        description="Hello World 插件",
        author="Python Master",
        dependencies=[],
    )

    def activate(self):
        print(f"Hello插件已激活!")

    def greet(self, name):
        return f"Hello, {name}!"
''')

    # 使用插件管理器
    manager = PluginManager("plugins")
    print("发现插件:", manager.discover_plugins())

    plugin = manager.load_plugin("hello_plugin")
    if plugin:
        print(f"插件信息: {plugin.plugin_info}")
        print(f"问候: {plugin.greet('World')}")

    # 清理
    import shutil
    shutil.rmtree("plugins", ignore_errors=True)
```

### 41.3.2 延迟导入(Lazy Import)

```python
"""
lazy_import.py — 延迟导入机制

只在真正使用模块时才执行导入，减少启动时间
"""

import importlib
import importlib.util
import sys
from types import ModuleType


class LazyModule(ModuleType):
    """延迟加载模块代理

    在属性访问时才真正执行导入
    """

    def __init__(self, name, import_func):
        super().__init__(name)
        self._name = name
        self._import_func = import_func
        self._real_module = None

    def _import(self):
        """执行实际导入"""
        if self._real_module is None:
            self._real_module = self._import_func()
            # 更新__dict__为真实模块的属性
            self.__dict__.update(self._real_module.__dict__)
        return self._real_module

    def __getattr__(self, name):
        """属性访问触发导入"""
        self._import()
        return getattr(self._real_module, name)

    def __repr__(self):
        if self._real_module is None:
            return f"<LazyModule '{self._name}' (未加载)>"
        return repr(self._real_module)


def lazy_import(name, package=None):
    """创建延迟导入的模块代理"""
    def import_func():
        return importlib.import_module(name, package)
    return LazyModule(name, import_func)


class LazyImporter:
    """模块级延迟导入管理器"""

    def __init__(self):
        self._lazy_modules = {}

    def register(self, name, package=None):
        """注册延迟导入"""
        self._lazy_modules[name] = (name, package)
        return LazyModule(name,
            lambda: importlib.import_module(name, package))

    def force_import(self, name):
        """强制导入模块"""
        if name in self._lazy_modules:
            module_name, package = self._lazy_modules[name]
            return importlib.import_module(module_name, package)
        raise ImportError(f"未注册的延迟导入: {name}")


# 使用示例
if __name__ == "__main__":
    import time

    print("=== 延迟导入 vs 立即导入 ===")

    # 立即导入
    start = time.perf_counter()
    import json
    import os
    import re
    import collections
    t_immediate = time.perf_counter() - start
    print(f"立即导入4个模块: {t_immediate*1000:.2f}ms")

    # 延迟导入
    start = time.perf_counter()
    json_lazy = lazy_import('json')
    os_lazy = lazy_import('os')
    re_lazy = lazy_import('re')
    collections_lazy = lazy_import('collections')
    t_lazy = time.perf_counter() - start
    print(f"延迟导入4个模块: {t_lazy*1000:.2f}ms")

    # 真正使用时才导入
    start = time.perf_counter()
    json_lazy.dumps({'key': 'value'})
    t_lazy_use = time.perf_counter() - start
    print(f"延迟导入首次使用: {t_lazy_use*1000:.2f}ms")

    print(f"\n延迟导入节省: {(t_immediate-t_lazy)*1000:.2f}ms")
    print(f"json_lazy: {json_lazy}")
    print(f"os_lazy: {os_lazy}")


def lazy_import_class(module_name, class_name, package=None):
    """延迟导入类

    使用时才加载模块和获取类
    """
    class _LazyClass:
        """代理类，首次实例化时导入真实类"""

        _real_class = None

        def __init__(self, *args, **kwargs):
            if _LazyClass._real_class is None:
                module = importlib.import_module(module_name, package)
                _LazyClass._real_class = getattr(module, class_name)
            self.__class__ = _LazyClass._real_class
            self.__init__(*args, **kwargs)

        def __getattr__(self, name):
            if _LazyClass._real_class is None:
                module = importlib.import_module(module_name, package)
                _LazyClass._real_class = getattr(module, class_name)
            return getattr(_LazyClass._real_class, name)

    _LazyClass.__name__ = class_name
    _LazyClass.__qualname__ = class_name
    return _LazyClass


# 使用延迟导入类
DataFrame = lazy_import_class('pandas', 'DataFrame')
ndarray = lazy_import_class('numpy', 'ndarray')

# 只有在实例化时才真正导入pandas/numpy
# df = DataFrame()  # 此时才导入pandas
```

### 41.3.3 模块重载

```python
"""
module_reloader.py — 安全的模块重载机制

解决importlib.reload()的常见问题
"""

import importlib
import sys
import types
from typing import Dict, Set


class ModuleReloader:
    """安全的模块重载器

    处理以下问题:
    1. 旧模块的类实例与新模块的类不兼容
    2. 已删除的名称不会被清除
    3. from ... import ...引用的名称不会更新
    4. 模块的__dict__需要正确更新
    """

    def __init__(self):
        self._reloaded: Set[str] = set()

    def reload(self, module_name: str) -> types.ModuleType:
        """安全重载模块"""
        if module_name not in sys.modules:
            raise ImportError(f"模块 {module_name} 未加载")

        old_module = sys.modules[module_name]
        old_names = set(dir(old_module))

        # 执行reload
        new_module = importlib.reload(old_module)

        # 清除已删除的名称
        new_names = set(dir(new_module))
        for name in old_names - new_names:
            if not name.startswith('_'):
                if hasattr(old_module, name):
                    delattr(old_module, name)

        self._reloaded.add(module_name)
        return new_module

    def reload_with_deps(self, module_name: str,
                         loaded_by_user: Set[str] = None) -> Dict[str, bool]:
        """重载模块及其依赖项"""
        if loaded_by_user is None:
            loaded_by_user = set()

        results = {}

        # 找到依赖于该模块的其他模块
        dependents = self._find_dependents(module_name, loaded_by_user)

        # 先重载依赖模块(逆序)
        for dep in reversed(dependents):
            try:
                self.reload(dep)
                results[dep] = True
            except Exception as e:
                results[dep] = False
                print(f"重载 {dep} 失败: {e}")

        # 重载目标模块
        try:
            self.reload(module_name)
            results[module_name] = True
        except Exception as e:
            results[module_name] = False
            print(f"重载 {module_name} 失败: {e}")

        return results

    def _find_dependents(self, module_name: str,
                         exclude: Set[str]) -> list:
        """找到依赖该模块的其他已加载模块"""
        dependents = []
        for name, module in sys.modules.items():
            if name == module_name or name in exclude:
                continue
            if not isinstance(module, types.ModuleType):
                continue
            # 检查模块属性是否引用了目标模块
            for attr_name in dir(module):
                try:
                    attr = getattr(module, attr_name)
                    if isinstance(attr, types.ModuleType):
                        if attr.__name__ == module_name:
                            if name not in dependents:
                                dependents.append(name)
                except Exception:
                    pass
        return dependents

    def deep_reload(self, module_name: str) -> Dict[str, bool]:
        """深度重载: 重载模块及其所有子模块"""
        results = {}
        prefix = module_name + '.'

        # 找到所有子模块
        submodules = [name for name in sys.modules
                      if name.startswith(prefix)]

        # 按依赖顺序排序(先子模块后父模块)
        submodules.sort(key=lambda n: -n.count('.'))

        # 重载子模块
        for name in submodules:
            try:
                self.reload(name)
                results[name] = True
            except Exception as e:
                results[name] = False
                print(f"重载 {name} 失败: {e}")

        # 重载主模块
        try:
            self.reload(module_name)
            results[module_name] = True
        except Exception as e:
            results[module_name] = False
            print(f"重载 {module_name} 失败: {e}")

        return results


# 使用示例
if __name__ == "__main__":
    # 创建测试模块
    import tempfile
    import os

    temp_dir = tempfile.mkdtemp()
    module_path = os.path.join(temp_dir, 'test_module.py')

    # 写入初始版本
    with open(module_path, 'w') as f:
        f.write('VERSION = "1.0"\n\ndef greet(name):\n    return f"Hello, {name}!"\n')

    sys.path.insert(0, temp_dir)
    import test_module

    print(f"初始版本: {test_module.VERSION}")
    print(f"初始greet: {test_module.greet('World')}")

    # 修改模块文件
    with open(module_path, 'w') as f:
        f.write('VERSION = "2.0"\n\ndef greet(name):\n    return f"Hi, {name}!!"\n')

    # 重载
    reloader = ModuleReloader()
    reloader.reload('test_module')

    print(f"重载后版本: {test_module.VERSION}")
    print(f"重载后greet: {test_module.greet('World')}")

    # 清理
    del sys.modules['test_module']
    sys.path.remove(temp_dir)
    os.remove(module_path)
    os.rmdir(temp_dir)
```

---

## 41.4 示例代码

### 41.4.1 完整的import追踪器

```python
"""
import_tracer.py — 完整的import过程追踪器

独立运行，深度追踪import机制的每一步
"""

import sys
import importlib
import importlib.abc
import importlib.machinery
import os
import time
from collections import defaultdict


class ImportTracer(importlib.abc.MetaPathFinder):
    """import过程追踪器

    安装到sys.meta_path后，记录每次import的详细信息:
    - 查找过程(哪些Finder被尝试)
    - 加载过程(哪个Loader被执行)
    - 缓存命中/未命中
    - 导入时间
    """

    def __init__(self):
        self.events = []
        self._depth = 0
        self._start_time = None

    def find_spec(self, fullname, path, target=None):
        """记录查找过程"""
        event = {
            'type': 'find_spec',
            'module': fullname,
            'path': path,
            'depth': self._depth,
            'time': time.perf_counter(),
        }
        self.events.append(event)

        # 返回None，让后续Finder继续查找
        return None

    def install(self):
        """安装追踪器到sys.meta_path最前面"""
        sys.meta_path.insert(0, self)
        self._start_time = time.perf_counter()

    def uninstall(self):
        """卸载追踪器"""
        if self in sys.meta_path:
            sys.meta_path.remove(self)

    def report(self):
        """生成追踪报告"""
        print(f"\n{'='*70}")
        print(f"  Import追踪报告")
        print(f"{'='*70}")

        # 按模块分组
        by_module = defaultdict(list)
        for event in self.events:
            by_module[event['module']].append(event)

        print(f"\n总导入事件数: {len(self.events)}")
        print(f"涉及模块数: {len(by_module)}")
        print(f"追踪时间: {time.perf_counter() - self._start_time:.4f}s")

        print(f"\n--- 模块导入详情 ---")
        for module, events in sorted(by_module.items()):
            find_events = [e for e in events if e['type'] == 'find_spec']
            print(f"\n  模块: {module}")
            print(f"    查找次数: {len(find_events)}")
            if find_events:
                cached = module in sys.modules
                print(f"    缓存状态: {'命中' if cached else '未命中'}")

    def trace_import(self, module_name):
        """追踪特定模块的import过程"""
        self.events.clear()
        self.install()

        # 清除缓存以观察完整导入过程
        was_loaded = module_name in sys.modules
        if was_loaded:
            del sys.modules[module_name]

        try:
            start = time.perf_counter()
            module = importlib.import_module(module_name)
            elapsed = time.perf_counter() - start

            print(f"\n=== import {module_name} 追踪 ===")
            print(f"导入耗时: {elapsed*1000:.2f}ms")
            print(f"模块来源: {getattr(module, '__file__', '<内置>')}")

            if hasattr(module, '__spec__') and module.__spec__:
                spec = module.__spec__
                print(f"模块规格:")
                print(f"  名称: {spec.name}")
                print(f"  加载器: {spec.loader}")
                print(f"  来源: {spec.origin}")
                print(f"  是否为包: {spec.submodule_search_locations is not None}")

            # 查找器调用详情
            find_events = [e for e in self.events
                          if e['module'] == module_name and e['type'] == 'find_spec']
            print(f"\n查找过程:")
            for event in find_events:
                print(f"  path={event.get('path')}")

        finally:
            self.uninstall()
            # 恢复缓存状态
            if was_loaded:
                pass  # 模块已重新加载


# 使用追踪器
if __name__ == "__main__":
    tracer = ImportTracer()

    # 追踪标准库模块导入
    tracer.trace_import('collections')

    # 追踪子模块导入
    tracer.trace_import('os.path')

    # 追踪第三方模块(如果安装了)
    try:
        tracer.trace_import('json')
    except ImportError:
        pass

    # 生成完整报告
    tracer.install()

    # 导入一组模块
    for mod in ['itertools', 'functools', 'operator', 'textwrap']:
        try:
            importlib.import_module(mod)
        except ImportError:
            pass

    tracer.report()
    tracer.uninstall()
```

### 41.4.2 自定义导入器

```python
"""
custom_importer.py — 完整的自定义导入器实现

支持:
- 从HTTP服务器导入模块
- 从数据库导入模块
- 加密模块导入
- 内存模块导入
"""

import importlib
import importlib.abc
import importlib.machinery
import sys
import types
import os
import base64
import hashlib


# ==========================================
# 1. 内存模块导入器
# ==========================================

class MemoryLoader(importlib.abc.Loader):
    """从内存字符串加载模块"""

    def __init__(self, source_code, origin='<memory>'):
        self.source_code = source_code
        self.origin = origin

    def create_module(self, spec):
        return None  # 使用默认模块创建

    def exec_module(self, module):
        code = compile(self.source_code, self.origin, 'exec')
        exec(code, module.__dict__)

    def get_source(self, fullname):
        return self.source_code

    def get_code(self, fullname):
        return compile(self.source_code, self.origin, 'exec')


class MemoryFinder(importlib.abc.MetaPathFinder):
    """在内存字典中查找模块"""

    _modules = {}  # {模块名: 源代码}

    @classmethod
    def register(cls, name, source):
        """注册内存模块"""
        cls._modules[name] = source

    @classmethod
    def unregister(cls, name):
        """取消注册"""
        cls._modules.pop(name, None)

    def find_spec(self, fullname, path, target=None):
        if fullname in self._modules:
            loader = MemoryLoader(
                self._modules[fullname],
                origin=f'<memory:{fullname}>'
            )
            return importlib.machinery.ModuleSpec(
                fullname, loader,
                origin=f'<memory:{fullname}>',
            )
        return None


# ==========================================
# 2. 加密模块导入器
# ==========================================

class EncryptedLoader(importlib.abc.Loader):
    """加载加密的Python模块"""

    def __init__(self, key, file_path):
        self.key = key
        self.file_path = file_path

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        # 读取加密文件
        with open(self.file_path, 'rb') as f:
            encrypted = f.read()

        # 解密
        decrypted = self._decrypt(encrypted)

        # 编译并执行
        code = compile(decrypted, self.file_path, 'exec')
        exec(code, module.__dict__)

    def _decrypt(self, data):
        """简单解密(XOR + Base64)"""
        decoded = base64.b64decode(data)
        key_bytes = self.key.encode()
        result = bytearray(len(decoded))
        for i, byte in enumerate(decoded):
            result[i] = byte ^ key_bytes[i % len(key_bytes)]
        return result.decode('utf-8')

    @staticmethod
    def encrypt(source, key):
        """加密Python源代码"""
        key_bytes = key.encode()
        result = bytearray(len(source.encode()))
        for i, char in enumerate(source.encode()):
            result[i] = char ^ key_bytes[i % len(key_bytes)]
        return base64.b64encode(bytes(result))


class EncryptedFinder(importlib.abc.MetaPathFinder):
    """在指定目录查找加密模块(.pye文件)"""

    def __init__(self, key, search_path):
        self.key = key
        self.search_path = search_path

    def find_spec(self, fullname, path, target=None):
        # 将模块名转换为文件路径
        module_file = os.path.join(
            self.search_path,
            fullname.replace('.', os.sep) + '.pye'
        )

        if os.path.isfile(module_file):
            loader = EncryptedLoader(self.key, module_file)
            return importlib.machinery.ModuleSpec(
                fullname, loader,
                origin=module_file,
            )
        return None


# ==========================================
# 3. 数据库模块导入器
# ==========================================

class DatabaseLoader(importlib.abc.Loader):
    """从SQLite数据库加载模块"""

    def __init__(self, db_path, module_id):
        self.db_path = db_path
        self.module_id = module_id

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        import sqlite3
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute(
                "SELECT source FROM modules WHERE name = ?",
                (self.module_id,)
            )
            row = cursor.fetchone()
            if row:
                code = compile(row[0], f'<db:{self.module_id}>', 'exec')
                exec(code, module.__dict__)
            else:
                raise ImportError(f"数据库中未找到模块: {self.module_id}")
        finally:
            conn.close()


class DatabaseFinder(importlib.abc.MetaPathFinder):
    """在SQLite数据库中查找模块"""

    def __init__(self, db_path):
        self.db_path = db_path
        # 初始化数据库
        self._init_db()

    def _init_db(self):
        import sqlite3
        conn = sqlite3.connect(self.db_path)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS modules (
                name TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                version TEXT DEFAULT '1.0',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()

    def find_spec(self, fullname, path, target=None):
        import sqlite3
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute(
                "SELECT name FROM modules WHERE name = ?",
                (fullname,)
            )
            if cursor.fetchone():
                loader = DatabaseLoader(self.db_path, fullname)
                return importlib.machinery.ModuleSpec(
                    fullname, loader,
                    origin=f'<db:{fullname}>',
                )
        finally:
            conn.close()
        return None


# ==========================================
# 演示
# ==========================================

if __name__ == "__main__":
    print("=== 1. 内存模块导入器 ===")
    # 注册并导入内存模块
    MemoryFinder.register('math_utils', '''
PI = 3.14159265

def circle_area(radius):
    return PI * radius ** 2

def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
''')

    sys.meta_path.insert(0, MemoryFinder())
    import math_utils
    print(f"圆面积(半径=5): {math_utils.circle_area(5)}")
    print(f"10的阶乘: {math_utils.factorial(10)}")
    sys.meta_path.remove(MemoryFinder())
    del sys.modules['math_utils']

    print("\n=== 2. 加密模块导入器 ===")
    # 创建加密模块
    key = "my_secret_key"
    source = '''
def secret_function():
    return "这是一个加密模块的秘密!"
SECRET = "hidden_value"
'''
    encrypted = EncryptedLoader.encrypt(source, key)
    print(f"加密后: {encrypted[:50]}...")

    # 保存加密模块
    temp_dir = os.path.join(os.path.dirname(__file__), 'encrypted_modules')
    os.makedirs(temp_dir, exist_ok=True)
    with open(os.path.join(temp_dir, 'secret.pye'), 'wb') as f:
        f.write(encrypted)

    # 注册加密导入器
    enc_finder = EncryptedFinder(key, temp_dir)
    sys.meta_path.insert(0, enc_finder)
    import secret
    print(f"解密后函数: {secret.secret_function()}")
    print(f"解密后常量: {secret.SECRET}")
    sys.meta_path.remove(enc_finder)
    del sys.modules['secret']

    # 清理加密模块文件
    os.remove(os.path.join(temp_dir, 'secret.pye'))
    os.rmdir(temp_dir)

    print("\n=== 3. 数据库模块导入器 ===")
    # 创建数据库并插入模块
    db_path = ':memory:'  # 内存数据库
    db_finder = DatabaseFinder(db_path)

    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.execute('''
        INSERT INTO modules (name, source) VALUES (?, ?)
    ''', ('db_module', '''
DB_VERSION = "1.0"
def db_query(table):
    return f"SELECT * FROM {table}"
'''))
    conn.commit()
    conn.close()

    sys.meta_path.insert(0, db_finder)
    import db_module
    print(f"数据库模块版本: {db_module.DB_VERSION}")
    print(f"查询: {db_module.db_query('users')}")
    sys.meta_path.remove(db_finder)
    del sys.modules['db_module']

    print("\n所有自定义导入器测试完成!")
```

### 41.4.3 __pycache__ 与字节码缓存管理

```python
"""
pycache_manager.py — .pyc缓存管理工具

可独立运行，深度分析__pycache__机制
"""

import importlib
import importlib.util
import marshal
import os
import struct
import sys
import hashlib
import time
from pathlib import Path


def analyze_pyc_file(pyc_path):
    """深度分析.pyc文件结构"""
    with open(pyc_path, 'rb') as f:
        data = f.read()

    pos = 0

    # 1. 魔数(4字节) — Python版本标识
    magic = struct.unpack('<I', data[pos:pos+4])[0]
    pos += 4
    print(f"魔数: 0x{magic:08X} ({data[:4].hex()})")
    print(f"Python版本对应魔数: {importlib.util.MAGIC_NUMBER.hex()}")

    # 2. 位标记(4字节) — Python 3.7+
    flags = struct.unpack('<I', data[pos:pos+4])[0]
    pos += 4
    print(f"位标记: 0x{flags:08X}")
    print(f"  基于哈希验证: {bool(flags & 0x01)}")
    print(f"  基于时间戳验证: {bool(flags & 0x02)}")

    # 3. 时间戳或哈希(4或8字节)
    if flags & 0x01:  # 基于哈希
        source_hash = data[pos:pos+8]
        pos += 8
        print(f"源文件哈希: {source_hash.hex()}")
    else:  # 基于时间戳
        timestamp = struct.unpack('<I', data[pos:pos+4])[0]
        pos += 4
        print(f"编译时间戳: {time.ctime(timestamp)}")

        # 源文件大小(4字节) — Python 3.7+
        source_size = struct.unpack('<I', data[pos:pos+4])[0]
        pos += 4
        print(f"源文件大小: {source_size} 字节")

    # 4. 字节码(marshal序列化的Code Object)
    code = marshal.loads(data[pos:])
    print(f"\n字节码信息:")
    print(f"  模块名: {code.co_name}")
    print(f"  参数数量: {code.co_argcount}")
    print(f"  局部变量: {code.co_varnames}")
    print(f"  常量表: {code.co_consts}")
    print(f"  字节码长度: {len(code.co_code)} 字节")

    return code


def find_pycache_dirs(root_dir='.'):
    """递归查找所有__pycache__目录"""
    pycache_dirs = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        if '__pycache__' in dirnames:
            cache_dir = os.path.join(dirpath, '__pycache__')
            pyc_files = [f for f in os.listdir(cache_dir)
                        if f.endswith('.pyc')]
            pycache_dirs.append({
                'path': cache_dir,
                'file_count': len(pyc_files),
                'total_size': sum(
                    os.path.getsize(os.path.join(cache_dir, f))
                    for f in pyc_files
                ),
                'files': pyc_files,
            })
    return pycache_dirs


def clear_pycache(root_dir='.', dry_run=False):
    """清理所有__pycache__目录"""
    caches = find_pycache_dirs(root_dir)
    total_files = 0
    total_size = 0

    for cache in caches:
        total_files += cache['file_count']
        total_size += cache['total_size']

        if not dry_run:
            import shutil
            shutil.rmtree(cache['path'])
            print(f"已删除: {cache['path']} "
                  f"({cache['file_count']} 文件)")
        else:
            print(f"将删除: {cache['path']} "
                  f"({cache['file_count']} 文件)")

    action = "将释放" if dry_run else "已释放"
    print(f"\n{action} {total_size / 1024:.1f}KB ({total_files} 文件)")
    return total_files, total_size


def compile_to_pyc(source_path, optimize=0):
    """手动编译.py文件为.pyc"""
    import py_compile
    cfile = py_compile.compile(source_path, optimize=optimize)
    print(f"编译完成: {source_path} → {cfile}")
    return cfile


# 演示
if __name__ == "__main__":
    print(f"Python版本: {sys.version}")
    print(f"当前魔数: {importlib.util.MAGIC_NUMBER.hex()}")
    print(f"优化级别: {sys.flags.optimize}")

    # 查找并分析缓存文件
    print("\n=== __pycache__ 目录 ===")
    caches = find_pycache_dirs()
    if caches:
        for cache in caches:
            print(f"\n{cache['path']}:")
            print(f"  文件数: {cache['file_count']}")
            print(f"  总大小: {cache['total_size']/1024:.1f}KB")
            for f in cache['files'][:5]:
                print(f"  - {f}")
            if len(cache['files']) > 5:
                print(f"  ... 还有 {len(cache['files'])-5} 个文件")
    else:
        print("未找到__pycache__目录")

    # 查看已加载模块的缓存信息
    print("\n=== 已加载模块缓存信息 ===")
    important_modules = ['json', 'os', 'sys', 'importlib']
    for name in important_modules:
        if name in sys.modules:
            mod = sys.modules[name]
            cached = getattr(mod, '__cached__', None)
            origin = getattr(mod, '__file__', None)
            if cached:
                print(f"\n{name}:")
                print(f"  来源: {origin}")
                print(f"  缓存: {cached}")
                if os.path.exists(cached):
                    size = os.path.getsize(cached)
                    mtime = os.path.getmtime(cached)
                    print(f"  缓存大小: {size} 字节")
                    print(f"  缓存时间: {time.ctime(mtime)}")
```