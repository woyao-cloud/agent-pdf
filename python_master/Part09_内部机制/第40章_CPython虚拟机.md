# 第40章 CPython虚拟机

## 40.1 概念与语法

### 40.1.1 CPython 虚拟机概述

CPython 虚拟机是 Python 语言的参考实现中的核心执行引擎，负责将编译后的字节码逐条解释执行。它是一个**栈式虚拟机**，所有操作数通过值栈(value stack)传递，而非通过寄存器。

虚拟机的核心位于 `Python/ceval.c` 文件，其主循环 `PyEval_EvalFrameDefault()` 是整个 CPython 执行引擎的枢纽——每一条 Python 字节码指令都通过这个函数的分发机制被执行。

```python
# CPython执行流程概览
# 源代码 → 字节码 → ceval.c主循环 → 各指令处理函数

# 简单理解: CPython VM 就是一个巨大的 switch-case
# for (;;) {
#     opcode = *instr_ptr++;
#     switch (opcode) {
#         case LOAD_CONST: ...
#         case LOAD_FAST:  ...
#         case BINARY_ADD: ...
#         ...
#     }
# }
```

### 40.1.2 执行入口与调用层级

从 Python 命令行到字节码执行，经过以下层级：

```
python main.c
  → Py_RunMain()
    → PyRun_SimpleFile()
      → PyRun_String()
        → PyEval_EvalCode()
          → PyEval_EvalFrameDefault()  ← 核心主循环
```

```c
// Python/pythonrun.c — 顶层执行入口
PyObject *
PyRun_String(const char *str, int start, PyObject *globals, PyObject *locals)
{
    // 1. 编译源代码
    PyObject *code = Py_CompileStringObject(str, ...);
    // 2. 执行编译后的代码对象
    return PyEval_EvalCode(code, globals, locals);
}

// Python/ceval.c — 核心执行入口
PyObject *
PyEval_EvalCode(PyCodeObject *co, PyObject *globals, PyObject *locals)
{
    // 创建帧并执行
    return PyEval_EvalCodeEx(co, globals, locals, ...);
}
```

### 40.1.3 核心数据结构

```c
// Include/internal/pycore_frame.h — 解释器帧(Python 3.11+)
typedef struct _frame {
    PyObject_VAR_HEAD
    _Py_CODEUNIT *prev_instr;    // 指向下一条待执行指令
    PyObject *func_obj;           // 函数对象(可为NULL)
    PyObject *localsplus[1];      // locals + cells + frees 变长数组
} _PyInterpreterFrame;

// Include/internal/pycore_call.h — 调用信息
typedef struct _call_info {
    PyObject *func;              // 可调用对象
    PyObject **args;             // 参数数组
    Py_ssize_t nargs;            // 位置参数数量
    PyObject *kwargs;            // 关键字参数字典
} _PyCallInfo;

// Python/ceval.c — 线程状态中的执行栈
typedef struct _err_stack_item {
    PyObject *exc_type;
    PyObject *exc_value;
    PyObject *exc_traceback;
} _PyErrStackItem;

// Include/internal/pycore_pymem.h — 栈帧分配
// Python 3.11+ 使用连续内存布局的帧栈
// 而非之前的链表结构
```

---

## 40.2 原理与机制

### 40.2.1 解释器主循环：ceval.c 深度剖析

CPython 虚拟机的核心是 `PyEval_EvalFrameDefault()` 函数，它是一个超过 3000 行的巨型函数，使用宏和 computed goto 实现高性能分发：

```c
// Python/ceval.c — 主循环核心结构(Python 3.11+版本)
PyObject *
_PyEval_EvalFrameDefault(PyThreadState *tstate, _PyInterpreterFrame *frame,
                         int throwflag)
{
    // ---- 寄存器变量声明 ----
    // 将关键变量放入CPU寄存器以加速访问
    register PyObject **stack_pointer;  // 栈指针
    register _Py_CODEUNIT *next_instr;  // 下一条指令
    register PyObject *retval;           // 返回值

    // ---- 初始化 ----
    stack_pointer = frame->localsplus + frame->f_code->co_nlocalsplus;
    next_instr = frame->prev_instr + 1;

    // ---- 分发机制: Computed Goto ----
    // 使用 GCC 扩展: 标签作为值(label-as-value)
    // 每个opcode对应一个标签地址，存储在dispatch_table中
    #ifdef USE_COMPUTED_GOTOS
    // 预计算所有opcode的标签地址
    static void *dispatch_table[256] = {
        &&_TARGET_NOP,          // 0
        &&_TARGET_LOAD_FAST,    // 1 (实际opcode值不同)
        &&_TARGET_LOAD_CONST,   // ...
        // ... 256个标签
    };
    #endif

    // ---- 主分发循环 ----
    // 每次迭代: 取指 → 译码 → 执行
    DISPATCH:  // 标签用于跳转
    {
        // 取指: 读取下一条指令
        _Py_CODEUNIT opcode_unit = *next_instr++;
        unsigned int opcode = _Py_OPCODE(opcode_unit);
        unsigned int oparg = _Py_OPARG(opcode_unit);

        // 分发: 跳转到对应的处理逻辑
        #ifdef USE_COMPUTED_GOTOS
        // Computed goto: 直接跳转，O(1)时间
        goto *dispatch_table[opcode];
        #else
        // 回退: switch-case分发
        switch (opcode) {
            case NOP:           goto _TARGET_NOP;
            case LOAD_FAST:     goto _TARGET_LOAD_FAST;
            case LOAD_CONST:    goto _TARGET_LOAD_CONST;
            // ...
        }
        #endif
    }

    // ---- 指令处理逻辑 ----

    _TARGET_LOAD_FAST:
    {
        // LOAD_FAST: 从locals数组加载到栈顶
        // 这是最频繁的指令之一
        PyObject *value = GETLOCAL(oparg);
        if (value == NULL) {
            // 未绑定的局部变量
            goto unbound_local_error;
        }
        Py_INCREF(value);      // 引用计数+1
        PUSH(value);           // 压入栈
        DISPATCH();            // 继续下一条指令
    }

    _TARGET_LOAD_CONST:
    {
        // LOAD_CONST: 从常量表加载
        PyObject *value = GETITEM(frame->f_code->co_consts, oparg);
        Py_INCREF(value);
        PUSH(value);
        DISPATCH();
    }

    _TARGET_BINARY_ADD:
    {
        // BINARY_ADD: 栈顶两个值相加
        PyObject *right = POP();
        PyObject *left = TOP();
        PyObject *sum;

        // 快速路径: 两个整数
        if (PyLong_CheckExact(left) && PyLong_CheckExact(right)) {
            // 委托给长整数加法
            sum = PyNumber_Add(left, right);
        }
        // 快速路径: 两个字符串
        else if (PyUnicode_CheckExact(left) && PyUnicode_CheckExact(right)) {
            sum = unicode_concatenate(tstate, left, right);
        }
        else {
            // 通用路径: 调用 __add__ 方法
            sum = PyNumber_Add(left, right);
        }

        Py_DECREF(left);
        Py_DECREF(right);
        SET_TOP(sum);
        if (sum == NULL) goto error;
        DISPATCH();
    }

    // ... 数百条指令处理逻辑
}
```

### 40.2.2 Computed Goto 分发机制

CPython 使用 **Computed Goto** 技术加速指令分发，这是 C 语言的 GCC/Clang 扩展特性：

```c
// Python/ceval.c — Computed Goto 实现

// 1. 定义每个opcode的标签
#define TARGET(op) \
    case op: \
    _TARGET_ ## op:  // 同时定义case标签和goto标签

// 2. 分发表: 将opcode映射到标签地址
// dispatch_table[LOAD_CONST] = &&_TARGET_LOAD_CONST
// 这样 goto *dispatch_table[opcode] 直接跳转，
// 无需switch-case的边界检查

// 3. DISPATCH宏: 读取下一条指令并跳转
#define DISPATCH() \
    do { \
        opcode = _Py_OPCODE(*next_instr); \
        oparg = _Py_OPARG(*next_instr); \
        next_instr++; \
        goto *dispatch_table[opcode]; \
    } while(0)

// 4. 为什么 Computed Goto 更快？
//    switch-case: 编译器可能生成跳转表或二分查找
//    computed goto: 直接间接跳转，CPU分支预测更友好
//    实测提升约 15-20%
```

```c
// Python/opcode_metadata.h — 指令元数据(Python 3.12+)
// 每条指令的属性定义在元数据表中

#define _PyOpcode_num_pushed(opcode) \
    (_PyOpcode_num_pushed_table[opcode])
#define _PyOpcode_num_popped(opcode) \
    (_PyOpcode_num_popped_table[opcode])

// 示例: LOAD_CONST 弹出0个，压入1个
// BINARY_ADD 弹出2个，压入1个
// CALL 弹出n+2个(3.12+格式)，压入1个
```

### 40.2.3 字节码执行流程详解

以一个简单的加法函数为例，追踪完整的执行流程：

```python
def add(a, b):
    return a + b
```

编译后字节码：
```
  1   LOAD_FAST    0 (a)    # offset 0
      LOAD_FAST    1 (b)    # offset 2
      BINARY_ADD            # offset 4  (3.11前)
                            # 3.11+: BINARY_OP + 0(add)
      RETURN_VALUE          # offset 6
```

```c
// Python/ceval.c — 执行流程追踪

// 1. 函数调用入口
// 当Python调用add(1, 2)时:
_PyInterpreterFrame *new_frame;
new_frame = _PyFrame_Push(tstate, add_func, args, 2, NULL);
// 1.1 分配帧内存(从栈或堆)
// 1.2 初始化locals: locals[0]=1(a), locals[1]=2(b)
// 1.3 设置prev_instr指向第一条指令
// 1.4 将帧推入执行栈

// 2. 进入主循环
_PyEval_EvalFrameDefault(tstate, new_frame, 0)
{
    // 初始化栈指针和指令指针
    stack_pointer = frame->localsplus + 2;  // 2个局部变量之后
    next_instr = frame->prev_instr;

    // ---- 指令1: LOAD_FAST 0 ----
    opcode = LOAD_FAST;
    oparg = 0;  // 局部变量索引
    // 执行:
    value = frame->localsplus[0];  // a = 1
    Py_INCREF(value);
    stack_pointer[0] = value;      // 压入栈
    stack_pointer++;

    // ---- 指令2: LOAD_FAST 1 ----
    opcode = LOAD_FAST;
    oparg = 1;  // 局部变量索引
    // 执行:
    value = frame->localsplus[1];  // b = 2
    Py_INCREF(value);
    stack_pointer[0] = value;      // 压入栈
    stack_pointer++;

    // ---- 指令3: BINARY_ADD ----
    // 3.11+: BINARY_OP 0 (NB_ADD)
    opcode = BINARY_OP;
    oparg = NB_ADD;
    // 执行:
    right = stack_pointer[-1];  // 弹出 2
    left = stack_pointer[-2];   // 弹出 1
    stack_pointer -= 2;

    // 类型检查快速路径
    if (PyLong_CheckExact(left) && PyLong_CheckExact(right)) {
        // 两个整数: 直接调用C层面的加法
        result = long_add((PyLongObject *)left, (PyLongObject *)right);
    } else {
        // 通用路径
        result = PyNumber_Add(left, right);
    }

    Py_DECREF(left);
    Py_DECREF(right);
    stack_pointer[0] = result;  // 压入结果 3
    stack_pointer++;

    // ---- 指令4: RETURN_VALUE ----
    opcode = RETURN_VALUE;
    // 执行:
    retval = stack_pointer[-1];  // 弹出结果 3
    Py_DECREF(retval);  // 注意: 调用者会增加引用

    // 清理帧
    _PyFrame_Pop(tstate, frame);
    return retval;  // 返回 3
}
```

### 40.2.4 快速调用机制

CPython 对函数调用有多层优化，从最慢的通用路径到最快的特化路径：

```c
// Python/ceval.c — 调用层级(从慢到快)

// 层级4: 最通用 — PyObject_Call()
PyObject *
PyObject_Call(PyObject *callable, PyObject *args, PyObject *kwargs)
{
    // 1. 类型检查
    // 2. 查找 __call__ 方法
    // 3. 调用 tp_call 槽位
    // 4. 支持任意可调用对象
}

// 层级3: Python函数调用 — _PyFunction_FastCallDict()
static PyObject *
_PyFunction_FastCallDict(PyObject *func, PyObject **args,
                          Py_ssize_t nargs, PyObject *kwargs)
{
    // 1. 检查函数类型为PyFunction
    // 2. 创建新帧
    // 3. 直接拷贝参数到帧的locals数组
    // 4. 跳转到帧执行
}

// 层级2: 向量调用协议(Python 3.9+)
// PEP 590 — Vectorcall: a fast calling protocol for CPython
typedef PyObject *(*vectorcallfunc)(PyObject *callable,
                                     PyObject **args,
                                     size_t nargsf,
                                     PyObject *kwnames);

// 每个类型可以在tp_vectorcall中存储向量调用函数
// 调用时直接通过向量调用协议，避免字典查找
PyObject *
PyObject_Vectorcall(PyObject *callable, PyObject **args,
                     size_t nargsf, PyObject *kwnames)
{
    // 1. 获取vectorcall函数指针
    vectorcallfunc func = Py_TYPE(callable)->tp_vectorcall_offset;
    // 2. 直接调用
    return func(callable, args, nargsf, kwnames);
}

// 层级1: 内联缓存特化调用(Python 3.11+)
// CALL指令特化后，直接跳转到特化处理逻辑
// 省去了类型检查和查找步骤
```

### 40.2.5 PEP 659 加速器原理

PEP 659 (Python 3.11) 引入了 **Specializing Adaptive Interpreter**，这是 CPython 历史上最重要的性能优化之一。其核心原理是**运行时类型反馈(type feedback)驱动的指令特化**：

```c
// Include/internal/pycore_opcode.h — 特化指令定义

// 通用指令 → 特化指令的映射
// LOAD_ATTR 可特化为:
//   LOAD_ATTR_INSTANCE_VALUE — 实例属性直接偏移访问
//   LOAD_ATTR_MODULE — 模块属性缓存查找
//   LOAD_ATTR_WITH_HINT — 带偏移提示的属性查找
//   LOAD_ATTR_PROPERTY — 属性描述符(property)
//   LOAD_ATTR_GETATTRIBUTE_OVERRIDDEN — 被覆盖的__getattribute__

// BINARY_OP 可特化为:
//   BINARY_OP_ADD_INT — 整数加法
//   BINARY_OP_ADD_FLOAT — 浮点数加法
//   BINARY_OP_ADD_UNICODE — 字符串拼接
//   BINARY_OP_MULTIPLY_INT — 整数乘法
//   BINARY_OP_MULTIPLY_FLOAT — 浮点数乘法
//   BINARY_OP_SUBTRACT_INT — 整数减法
//   BINARY_OP_SUBTRACT_FLOAT — 浮点数减法

// STORE_ATTR 可特化为:
//   STORE_ATTR_INSTANCE_VALUE — 实例属性存储(偏移量已知)

// CALL 可特化为:
//   CALL_FUNCTION_EX — 函数调用(精确类型)
```

特化机制的三个阶段：

```c
// 阶段1: 快速判断(Quickening)
// 初始执行时使用通用指令
// 每执行一次，内联计数器减1
// 计数器归零时，进入特化阶段

// 阶段2: 特化(Specialization)
// 检查操作数的类型和状态
// 如果类型一致，替换为特化指令
// 特化指令使用内联缓存存储类型信息

// 阶段3: 去特化(Deoptimization)
// 如果操作数类型不匹配，回退到通用指令
// 并设置退避计数器，避免频繁重试

// Python/ceval.c — 特化逻辑伪代码
static PyObject *
specialize_LOAD_ATTR(PyObject *owner, PyObject *name)
{
    PyTypeObject *type = Py_TYPE(owner);

    // 检查1: 是否是普通实例属性?
    if (type->tp_dict != NULL) {
        // 通过类型描述符表查找属性的偏移量
        PyObject *descr = _PyType_Lookup(type, name);
        if (descr != NULL && PyMember_Check(descr)) {
            // 特化为 LOAD_ATTR_INSTANCE_VALUE
            // 直接通过偏移量访问: owner->ob_data + offset
            return LOAD_ATTR_INSTANCE_VALUE(owner, offset);
        }
    }

    // 检查2: 是否是模块属性?
    if (PyModule_Check(owner)) {
        // 模块字典通常不会改变
        // 缓存字典的版本号和键的偏移量
        return LOAD_ATTR_MODULE(owner, dict_version, hint);
    }

    // 其他情况: 保持通用指令
    return LOAD_ATTR_GENERAL(owner, name);
}
```

### 40.2.6 内联缓存(Inline Cache)

特化指令使用内联缓存存储类型信息，避免反复查找：

```c
// Include/internal/pycore_inline_cache.h — 内联缓存结构

// LOAD_ATTR的内联缓存
typedef struct {
    uint16_t counter;           // 自适应计数器
    uint16_t type_version;      // 类型版本号(快速检查)
    uint16_t hint;              // 属性偏移提示
    uint16_t keys_version;      // 字典键版本
} _PyLoadAttrCache;

// CALL的内联缓存
typedef struct {
    uint16_t counter;           // 自适应计数器
    uint16_t func_version;      // 函数版本号
    uint16_t nargs;             // 参数数量
    uint16_t flags;             // 标志位
} _PyCallCache;

// BINARY_OP的内联缓存
typedef struct {
    uint16_t counter;           // 自适应计数器
} _PyBinaryOpCache;

// 内联缓存的生命周期:
// 1. 初始状态: counter = 0(adaptive mode)
// 2. 每次执行: counter--
// 3. counter == 0: 尝试特化
// 4. 特化成功: 缓存类型信息
// 5. 类型不匹配: counter = 退避值, 回退通用指令
```

```python
# 观察内联缓存效果
import dis
import sys

class Point:
    __slots__ = ('x', 'y')
    def __init__(self, x, y):
        self.x = x
        self.y = y

def get_x(p):
    return p.x

# 初始状态
print("=== 特化前 ===")
dis.dis(get_x)

# 触发特化
for _ in range(100):
    get_x(Point(1, 2))

print("\n=== 特化后 ===")
dis.dis(get_x)

# 类型变化 → 去特化
class OtherPoint:
    def __init__(self, x, y):
        self.x = x
        self.y = y

get_x(OtherPoint(1, 2))

print("\n=== 去特化后 ===")
dis.dis(get_x)
```

### 40.2.7 异常处理机制

CPython 的异常处理在 Python 3.11+ 经历了重大重构：

```c
// Python 3.10及之前: 使用异常处理表(setup/POP_BLOCK机制)
// Python 3.11+: 使用零开销异常处理(exception table机制)

// Python 3.11+ 异常表结构
// 每个Code Object都有co_exceptiontable
// 异常表是一个压缩的区域映射表:
//   [start_offset, end_offset) → handler_offset, stack_depth, push_lasti

// Include/internal/pycore_except.h — 异常表条目
typedef struct {
    int start;           // 起始字节码偏移
    int end;             // 结束字节码偏移(不含)
    int handler;         // 异常处理器的偏移
    int depth;           // 处理器期望的栈深度
    int lasti;           // 是否压入最后指令偏移
} _PyExceptHandlerEntry;

// Python/ceval.c — 异常表查找
// 当异常发生时,VM根据当前指令偏移查找异常表
// 如果找到匹配的条目,跳转到对应的handler
// 如果未找到,异常传播到上层帧

static _PyExceptHandlerEntry *
find_exception_handler(PyCodeObject *code, int offset)
{
    // 二分查找异常表
    // 找到包含offset的[start, end)区间
    // 返回对应的handler信息
}

// 异常处理的优势:
// 3.10之前: SETUP_FINALLY/POP_BLOCK指令有运行时开销
// 3.11+: 异常表是零开销的(不执行任何指令)
// 只有异常真正发生时才查找异常表
```

---

## 40.3 使用场景

### 40.3.1 性能热点分析

```python
"""
使用dis模块和字节码分析定位性能热点
"""
import dis
import time
import sys

class VMProfiler:
    """基于字节码的简单性能分析器"""

    def __init__(self):
        self.stats = {}
        self._original_trace = None

    def _trace(self, frame, event, arg):
        """trace函数，记录每条指令"""
        if event == 'line':
            code = frame.f_code
            key = f"{code.co_name}:{frame.f_lineno}"
            self.stats[key] = self.stats.get(key, 0) + 1
        return self._trace

    def profile(self, func, *args, **kwargs):
        """对函数进行性能分析"""
        self.stats.clear()
        old_trace = sys.gettrace()
        sys.settrace(self._trace)
        try:
            result = func(*args, **kwargs)
        finally:
            sys.settrace(old_trace)
        return result

    def report(self, top_n=20):
        """输出分析报告"""
        sorted_stats = sorted(self.stats.items(),
                               key=lambda x: -x[1])[:top_n]
        total = sum(self.stats.values())
        print(f"\n=== 性能分析报告 (总行命中: {total}) ===")
        for (location, count) in sorted_stats:
            pct = count / total * 100
            print(f"  {location:<40} {count:6d} ({pct:5.1f}%)")

# 使用示例
def bubble_sort(data):
    """冒泡排序 — O(n^2)算法，便于观察热点"""
    n = len(data)
    for i in range(n):
        for j in range(0, n - i - 1):
            if data[j] > data[j + 1]:
                data[j], data[j + 1] = data[j + 1], data[j]
    return data

profiler = VMProfiler()
data = list(range(100, 0, -1))
profiler.profile(bubble_sort, data.copy())
profiler.report()

# 字节码层面分析
print("\n=== bubble_sort 字节码 ===")
dis.dis(bubble_sort)
```

### 40.3.2 调试器实现原理

```python
"""
基于CPython虚拟机机制的调试器实现
"""

import sys
import linecache
from types import FrameType

class SimpleDebugger:
    """简单调试器 — 演示CPython虚拟机的调试支持"""

    def __init__(self, breakpoints=None):
        self.breakpoints = breakpoints or set()  # {filename:lineno}
        self.step_mode = False
        self.call_depth = 0

    def trace(self, frame: FrameType, event: str, arg):
        """调试trace函数"""
        code = frame.f_code
        filename = code.co_filename
        lineno = frame.f_lineno
        func_name = code.co_name

        if event == 'call':
            self.call_depth += 1
            indent = "  " * self.call_depth
            args = []
            for i in range(code.co_argcount):
                name = code.co_varnames[i]
                val = frame.f_locals.get(name, "<unbound>")
                args.append(f"{name}={val!r:.50}")
            print(f"{indent}→ {func_name}({', '.join(args)})")

            # 检查断点
            if (filename, lineno) in self.breakpoints:
                self._interactive_prompt(frame)

            return self.trace

        elif event == 'return':
            indent = "  " * self.call_depth
            print(f"{indent}← {func_name} = {arg!r:.80}")
            self.call_depth -= 1

        elif event == 'line':
            if self.step_mode or (filename, lineno) in self.breakpoints:
                source_line = linecache.getline(filename, lineno).strip()
                print(f"  {filename}:{lineno} | {source_line}")

        elif event == 'exception':
            exc_type, exc_value, exc_tb = arg
            print(f"  ! {func_name}: {exc_type.__name__}: {exc_value}")

        return self.trace

    def _interactive_prompt(self, frame):
        """交互式调试提示"""
        code = frame.f_code
        print(f"\n*** 断点命中: {code.co_name} "
              f"at {code.co_filename}:{frame.f_lineno}")
        print(f"    局部变量: {frame.f_locals}")

    def set_breakpoint(self, filename, lineno):
        self.breakpoints.add((filename, lineno))

    def __enter__(self):
        sys.settrace(self.trace)
        return self

    def __exit__(self, *args):
        sys.settrace(None)


# 使用调试器
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

def compute():
    result = factorial(5)
    return result + 10

with SimpleDebugger() as debugger:
    result = compute()
    print(f"结果: {result}")
```

### 40.3.3 JIT友好的代码模式

```python
"""
编写对CPython虚拟机和特化友好的代码
"""

import dis
import time

# 模式1: 类型稳定的函数
# CPython 3.11+会根据类型反馈特化指令
def stable_types(data):
    """始终传入相同类型 — 利于特化"""
    total = 0
    for x in data:
        total += x  # 始终是int加法
    return total

def unstable_types(data):
    """混合类型 — 不利于特化"""
    total = 0
    for x in data:
        total += x  # int和float混合
    return total

# 模式2: 减少属性查找层数
class Level1:
    def __init__(self):
        self.value = 42

class Level0:
    def __init__(self):
        self.l1 = Level1()

def deep_attr_access(obj):
    """深层属性查找 — 每层一次LOAD_ATTR"""
    return obj.l1.value

def shallow_access(l1_value):
    """直接值 — 无属性查找"""
    return l1_value

# 模式3: 避免动态属性
class StaticAttrs:
    __slots__ = ('x', 'y')  # 固定属性布局
    def __init__(self, x, y):
        self.x = x
        self.y = y

class DynamicAttrs:
    def __init__(self, x, y):
        self.x = x          # 动态属性
        self.y = y

# 模式4: 内联小型函数
def is_positive(n):
    return n > 0

def filter_positive(numbers):
    """使用内联条件而非函数调用"""
    # 慢: filter(is_positive, numbers) — 每次调用函数
    # 快: 列表推导式 — 内联比较
    return [n for n in numbers if n > 0]

# 对比字节码
print("=== stable_types ===")
dis.dis(stable_types)
print("\n=== filter_positive ===")
dis.dis(filter_positive)

# 性能测试
int_data = list(range(10000))
mixed_data = [i if i % 2 == 0 else float(i) for i in range(10000)]

start = time.perf_counter()
stable_types(int_data)
t1 = time.perf_counter()
unstable_types(mixed_data)
t2 = time.perf_counter()

print(f"\n稳定类型: {t1-start:.4f}s")
print(f"不稳定类型: {t2-t1:.4f}s")
```

---

## 40.4 示例代码

### 40.4.1 虚拟机指令执行模拟器

```python
"""
mini_vm.py — 最小化Python虚拟机模拟器

模拟CPython虚拟机的核心执行机制：
栈式架构、指令分发、帧管理等
"""

from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import IntEnum
import dis


class OpCode(IntEnum):
    """简化的字节码操作码"""
    # 加载/存储
    LOAD_CONST = 100
    LOAD_FAST = 124
    LOAD_NAME = 101
    LOAD_GLOBAL = 116
    STORE_FAST = 125
    STORE_NAME = 90
    POP_TOP = 1
    DUP_TOP = 4
    # 算术
    BINARY_ADD = 23
    BINARY_SUBTRACT = 24
    BINARY_MULTIPLY = 20
    BINARY_TRUE_DIVIDE = 27
    BINARY_MODULO = 22
    BINARY_POWER = 19
    UNARY_NEGATIVE = 11
    UNARY_NOT = 12
    # 比较
    COMPARE_OP = 107
    # 控制流
    JUMP_FORWARD = 110
    JUMP_BACKWARD = 140
    POP_JUMP_IF_TRUE = 115
    POP_JUMP_IF_FALSE = 114
    # 函数
    MAKE_FUNCTION = 132
    CALL = 171
    RETURN_VALUE = 83
    RETURN_CONST = 155
    # 数据结构
    BUILD_LIST = 103
    BUILD_TUPLE = 102
    BUILD_MAP = 105
    BUILD_STRING = 157
    # 迭代
    GET_ITER = 68
    FOR_ITER = 93
    # 其他
    NOP = 9
    PRINT_EXPR = 70


@dataclass
class Instruction:
    """指令对象"""
    offset: int
    opcode: int
    opname: str
    arg: Optional[int] = None
    argval: Any = None


@dataclass
class Frame:
    """执行帧"""
    code: 'CodeObject'
    locals_: Dict[str, Any] = field(default_factory=dict)
    globals_: Dict[str, Any] = field(default_factory=dict)
    stack: List[Any] = field(default_factory=list)
    pc: int = 0  # 程序计数器
    return_value: Any = None


@dataclass
class CodeObject:
    """代码对象"""
    co_name: str
    co_code: List[Instruction]
    co_consts: Tuple
    co_names: Tuple
    co_varnames: Tuple
    co_filename: str = '<mini_vm>'


class MiniVM:
    """最小化Python虚拟机"""

    def __init__(self):
        self.frames: List[Frame] = []
        self.builtins = {
            'print': print,
            'len': len,
            'range': range,
            'int': int,
            'float': float,
            'str': str,
            'list': list,
            'abs': abs,
            'max': max,
            'min': min,
            'isinstance': isinstance,
            'type': type,
        }

    def run(self, code: CodeObject,
            globals_: Optional[Dict] = None,
            locals_: Optional[Dict] = None) -> Any:
        """执行代码对象"""
        frame = Frame(
            code=code,
            globals_=globals_ or {},
            locals_=locals_ or {},
        )
        self.frames.append(frame)
        return self._execute(frame)

    def _execute(self, frame: Frame) -> Any:
        """主执行循环 — 模拟ceval.c"""
        code = frame.code
        instructions = code.co_code

        while frame.pc < len(instructions):
            instr = instructions[frame.pc]
            frame.pc += 1

            result = self._dispatch(frame, instr)
            if result is not None:
                # RETURN_VALUE信号
                self.frames.pop()
                return result

        self.frames.pop()
        return None

    def _dispatch(self, frame: Frame, instr: Instruction) -> Any:
        """指令分发 — 对应ceval.c的switch-case"""

        op = instr.opcode
        stack = frame.stack

        # ---- 加载指令 ----
        if op == OpCode.LOAD_CONST:
            stack.append(instr.argval)

        elif op == OpCode.LOAD_FAST or op == OpCode.LOAD_NAME:
            name = instr.argval
            if name in frame.locals_:
                stack.append(frame.locals_[name])
            elif name in frame.globals_:
                stack.append(frame.globals_[name])
            else:
                raise NameError(f"name '{name}' is not defined")

        elif op == OpCode.LOAD_GLOBAL:
            name = instr.argval
            if name in frame.globals_:
                stack.append(frame.globals_[name])
            elif name in self.builtins:
                stack.append(self.builtins[name])
            else:
                raise NameError(f"name '{name}' is not defined")

        elif op == OpCode.STORE_FAST or op == OpCode.STORE_NAME:
            name = instr.argval
            value = stack.pop()
            frame.locals_[name] = value

        # ---- 栈操作 ----
        elif op == OpCode.POP_TOP:
            stack.pop()

        elif op == OpCode.DUP_TOP:
            stack.append(stack[-1])

        # ---- 算术运算 ----
        elif op == OpCode.BINARY_ADD:
            right = stack.pop()
            left = stack.pop()
            stack.append(left + right)

        elif op == OpCode.BINARY_SUBTRACT:
            right = stack.pop()
            left = stack.pop()
            stack.append(left - right)

        elif op == OpCode.BINARY_MULTIPLY:
            right = stack.pop()
            left = stack.pop()
            stack.append(left * right)

        elif op == OpCode.BINARY_TRUE_DIVIDE:
            right = stack.pop()
            left = stack.pop()
            stack.append(left / right)

        elif op == OpCode.BINARY_MODULO:
            right = stack.pop()
            left = stack.pop()
            stack.append(left % right)

        elif op == OpCode.BINARY_POWER:
            right = stack.pop()
            left = stack.pop()
            stack.append(left ** right)

        elif op == OpCode.UNARY_NEGATIVE:
            stack.append(-stack.pop())

        elif op == OpCode.UNARY_NOT:
            stack.append(not stack.pop())

        # ---- 比较操作 ----
        elif op == OpCode.COMPARE_OP:
            right = stack.pop()
            left = stack.pop()
            cmp_ops = {
                0: lambda a, b: a < b,
                1: lambda a, b: a <= b,
                2: lambda a, b: a == b,
                3: lambda a, b: a != b,
                4: lambda a, b: a > b,
                5: lambda a, b: a >= b,
            }
            stack.append(cmp_ops[instr.arg](left, right))

        # ---- 控制流 ----
        elif op == OpCode.JUMP_FORWARD:
            frame.pc = instr.argval

        elif op == OpCode.JUMP_BACKWARD:
            frame.pc = instr.argval

        elif op == OpCode.POP_JUMP_IF_TRUE:
            cond = stack.pop()
            if cond:
                frame.pc = instr.argval

        elif op == OpCode.POP_JUMP_IF_FALSE:
            cond = stack.pop()
            if not cond:
                frame.pc = instr.argval

        # ---- 数据结构 ----
        elif op == OpCode.BUILD_LIST:
            items = [stack.pop() for _ in range(instr.arg)]
            stack.append(list(reversed(items)))

        elif op == OpCode.BUILD_TUPLE:
            items = [stack.pop() for _ in range(instr.arg)]
            stack.append(tuple(reversed(items)))

        elif op == OpCode.BUILD_MAP:
            items = {}
            for _ in range(instr.arg):
                v = stack.pop()
                k = stack.pop()
                items[k] = v
            stack.append(items)

        elif op == OpCode.BUILD_STRING:
            parts = [stack.pop() for _ in range(instr.arg)]
            stack.append(''.join(reversed(parts)))

        # ---- 迭代 ----
        elif op == OpCode.GET_ITER:
            stack.append(iter(stack.pop()))

        elif op == OpCode.FOR_ITER:
            iterator = stack[-1]
            try:
                value = next(iterator)
                stack.append(value)
            except StopIteration:
                stack.pop()  # 移除迭代器
                frame.pc = instr.argval  # 跳到循环结束

        # ---- 函数 ----
        elif op == OpCode.MAKE_FUNCTION:
            # 简化: 从栈中获取函数名和代码
            qualname = stack.pop()
            code_obj = stack.pop()
            func = VMFunction(code_obj, frame.globals_, self)
            stack.append(func)

        elif op == OpCode.CALL:
            # 简化: 栈顶是参数列表，下面是可调用对象
            nargs = instr.arg
            args = [stack.pop() for _ in range(nargs)]
            args.reverse()
            callable_obj = stack.pop()
            result = self._call(callable_obj, args)
            stack.append(result)

        elif op == OpCode.RETURN_VALUE:
            self.frames[-1].return_value = stack.pop() if stack else None
            return self.frames[-1].return_value

        elif op == OpCode.RETURN_CONST:
            self.frames[-1].return_value = instr.argval
            return instr.argval

        elif op == OpCode.NOP:
            pass

        elif op == OpCode.PRINT_EXPR:
            value = stack.pop()
            print(value)

        else:
            raise RuntimeError(f"未实现的操作码: {instr.opname} ({instr.opcode})")

        return None

    def _call(self, func, args):
        """调用函数 — 模拟CALL指令"""
        if callable(func):
            # 内置函数
            return func(*args)
        elif isinstance(func, VMFunction):
            # Python函数: 创建新帧并执行
            locals_ = {}
            for i, name in enumerate(func.code.co_varnames[:len(args)]):
                locals_[name] = args[i]
            return self.run(func.code, func.globals_, locals_)
        else:
            raise TypeError(f"'{type(func).__name__}' object is not callable")


class VMFunction:
    """虚拟机中的函数对象"""
    def __init__(self, code, globals_, vm):
        self.code = code
        self.globals_ = globals_
        self.vm = vm
        self.__name__ = code.co_name

    def __call__(self, *args):
        return self.vm._call(self, list(args))

    def __repr__(self):
        return f"<function {self.code.co_name}>"


def compile_to_minivm(source: str, filename: str = '<input>') -> CodeObject:
    """将Python源代码编译为MiniVM的Code Object"""
    import ast

    tree = ast.parse(source, filename)
    compiler = MiniVMCompiler(filename)
    return compiler.compile(tree)


class MiniVMCompiler:
    """将AST编译为MiniVM指令"""

    def __init__(self, filename: str):
        self.filename = filename
        self.instructions: List[Instruction] = []
        self.consts: List[Any] = []
        self.names: List[str] = []
        self.varnames: List[str] = []
        self.offset = 0

    def compile(self, tree: ast.AST) -> CodeObject:
        """编译AST"""
        for node in tree.body:
            self._compile_node(node)

        self._emit(OpCode.RETURN_CONST, argval=None)

        return CodeObject(
            co_name='<module>',
            co_code=self.instructions,
            co_consts=tuple(self.consts),
            co_names=tuple(self.names),
            co_varnames=tuple(self.varnames),
            co_filename=self.filename,
        )

    def _emit(self, opcode, arg=None, argval=None):
        """发射一条指令"""
        instr = Instruction(
            offset=self.offset,
            opcode=opcode,
            opname=OpCode(opcode).name,
            arg=arg,
            argval=argval,
        )
        self.instructions.append(instr)
        self.offset += 1
        return instr.offset

    def _add_const(self, value):
        """添加常量"""
        if value not in self.consts:
            self.consts.append(value)
        return self.consts.index(value)

    def _compile_node(self, node):
        """编译AST节点"""
        if isinstance(node, ast.Expr):
            self._compile_node(node.value)
            if isinstance(node.value, (ast.Call, ast.BinOp)):
                self._emit(OpCode.POP_TOP)

        elif isinstance(node, ast.Assign):
            for target in node.targets:
                self._compile_node(node.value)
                self._compile_store(target)

        elif isinstance(node, ast.Return):
            if node.value:
                self._compile_node(node.value)
            else:
                self._emit(OpCode.LOAD_CONST, argval=None)
            self._emit(OpCode.RETURN_VALUE)

        elif isinstance(node, ast.Constant):
            self._emit(OpCode.LOAD_CONST, argval=node.value)

        elif isinstance(node, ast.Name):
            self._emit(OpCode.LOAD_NAME, argval=node.id)

        elif isinstance(node, ast.BinOp):
            self._compile_node(node.left)
            self._compile_node(node.right)
            op_map = {
                ast.Add: OpCode.BINARY_ADD,
                ast.Sub: OpCode.BINARY_SUBTRACT,
                ast.Mult: OpCode.BINARY_MULTIPLY,
                ast.Div: OpCode.BINARY_TRUE_DIVIDE,
                ast.Mod: OpCode.BINARY_MODULO,
                ast.Pow: OpCode.BINARY_POWER,
            }
            self._emit(op_map[type(node.op)])

        elif isinstance(node, ast.Compare):
            self._compile_node(node.left)
            self._compile_node(node.comparators[0])
            cmp_map = {
                ast.Lt: 0, ast.LtE: 1, ast.Eq: 2,
                ast.NotEq: 3, ast.Gt: 4, ast.GtE: 5,
            }
            self._emit(OpCode.COMPARE_OP, arg=cmp_map[type(node.ops[0])])

        elif isinstance(node, ast.If):
            self._compile_node(node.test)
            else_jump = self._emit(OpCode.POP_JUMP_IF_FALSE)
            for body_node in node.body:
                self._compile_node(body_node)
            end_jump = self._emit(OpCode.JUMP_FORWARD)
            # 修补else跳转目标
            self.instructions[else_jump].argval = self.offset
            for else_node in node.orelse:
                self._compile_node(else_node)
            # 修补end跳转目标
            self.instructions[end_jump].argval = self.offset

        elif isinstance(node, ast.Call):
            self._compile_node(node.func)
            for arg in node.args:
                self._compile_node(arg)
            self._emit(OpCode.CALL, arg=len(node.args))

        elif isinstance(node, ast.List):
            for elt in node.elts:
                self._compile_node(elt)
            self._emit(OpCode.BUILD_LIST, arg=len(node.elts))

        else:
            raise NotImplementedError(f"未实现: {type(node).__name__}")


# ===== 运行示例 =====
if __name__ == "__main__":
    vm = MiniVM()

    # 示例1: 简单计算
    code = compile_to_minivm("""
x = 10
y = 20
z = x + y * 2
print(z)
""")
    print("=== 示例1: 简单计算 ===")
    vm.run(code)

    # 示例2: 条件判断
    code2 = compile_to_minivm("""
x = 42
if x > 40:
    print(x)
""")
    print("\n=== 示例2: 条件判断 ===")
    vm.run(code2)
```

### 40.4.2 特化指令效果测量

```python
"""
specialization_benchmark.py — 测量特化指令的性能提升

独立运行，对比特化前后的执行时间
"""

import dis
import time
import sys

def benchmark(name, func, *args, warmup=10, runs=1000):
    """性能基准测试"""
    # 预热(触发特化)
    for _ in range(warmup):
        func(*args)

    # 正式测试
    start = time.perf_counter()
    for _ in range(runs):
        func(*args)
    elapsed = time.perf_counter() - start
    print(f"  {name}: {elapsed:.4f}s "
          f"({elapsed/runs*1e6:.2f}us/call)")
    return elapsed


def run_specialization_tests():
    """特化效果测试"""
    print(f"Python版本: {sys.version}")
    print(f"支持特化: {sys.version_info >= (3, 11)}\n")

    # 测试1: 属性访问特化
    class Vec2D:
        __slots__ = ('x', 'y')
        def __init__(self, x, y):
            self.x = x
            self.y = y

    class Vec2DNoSlots:
        def __init__(self, x, y):
            self.x = x
            self.y = y

    v_slots = Vec2D(1.0, 2.0)
    v_noslots = Vec2DNoSlots(1.0, 2.0)

    def access_slots(v):
        return v.x + v.y

    def access_noslots(v):
        return v.x + v.y

    print("1. 属性访问特化:")
    t1 = benchmark("  __slots__", access_slots, v_slots)
    t2 = benchmark("  普通类", access_noslots, v_noslots)
    print(f"  __slots__更快: {t2/t1:.2f}x")

    # 测试2: 二元运算特化
    def add_int(a, b):
        return a + b

    def add_float(a, b):
        return a + b

    def add_mixed(a, b):
        return a + b

    print("\n2. 二元运算特化:")
    t_int = benchmark("  int+int", add_int, 1, 2, runs=100000)
    t_float = benchmark("  float+float", add_float, 1.0, 2.0, runs=100000)

    # 多态测试
    for _ in range(50000):
        add_mixed(1, 2)
        add_mixed(1.0, 2.0)
    t_mixed = benchmark("  int/float混合", add_mixed, 1, 2, runs=100000)

    # 测试3: 函数调用特化
    def simple_func(x):
        return x * 2 + 1

    print("\n3. 函数调用:")
    t_direct = benchmark("  直接调用", simple_func, 42, runs=100000)

    # 测试4: 全局vs局部变量
    g_val = 42

    def global_access():
        return g_val + 1

    def local_access():
        x = g_val  # 缓存到局部
        return x + 1

    print("\n4. 全局vs局部变量:")
    t_global = benchmark("  全局变量", global_access, runs=100000)
    t_local = benchmark("  局部变量", local_access, runs=100000)
    print(f"  局部更快: {t_global/t_local:.2f}x")


if __name__ == "__main__":
    run_specialization_tests()

    # 展示字节码差异
    print("\n" + "="*60)
    print("字节码差异展示")
    print("="*60)

    def add_func(a, b):
        return a + b

    print("\n=== add_func 字节码 ===")
    dis.dis(add_func)

    class Point:
        __slots__ = ('x',)
        def __init__(self, x):
            self.x = x

    def get_x(p):
        return p.x

    print("\n=== get_x 字节码(特化前) ===")
    dis.dis(get_x)

    # 触发特化
    p = Point(1)
    for _ in range(100):
        get_x(p)

    if sys.version_info >= (3, 11):
        print("\n=== get_x 字节码(特化后) ===")
        dis.dis(get_x)
```

### 40.4.3 异常处理机制演示

```python
"""
exception_handling_internals.py — 异常处理机制深度演示

对比Python 3.11前后异常处理的变化
"""

import dis
import sys

def demonstrate_exception_table():
    """演示Python 3.11+异常表"""

    def try_except():
        try:
            x = 1 / 0
        except ZeroDivisionError:
            x = 0
        return x

    def try_except_else():
        try:
            x = 1 / 1
        except ZeroDivisionError:
            x = 0
        else:
            x = x + 1
        return x

    def try_finally():
        try:
            x = risky()
        finally:
            cleanup()
        return x

    def nested_try():
        try:
            try:
                x = 1 / 0
            except ZeroDivisionError:
                x = -1
        except Exception:
            x = 0
        return x

    def risky():
        return 42

    def cleanup():
        pass

    # 显示异常表(Python 3.11+)
    for func in [try_except, try_except_else, try_finally, nested_try]:
        print(f"\n=== {func.__name__} 字节码 ===")
        dis.dis(func)

        code = func.__code__
        if hasattr(code, 'co_exceptiontable'):
            print(f"  异常表: {code.co_exceptiontable}")
        if hasattr(code, 'co_linetable'):
            print(f"  行号表长度: {len(code.co_linetable)}")


def demonstrate_exception_flow():
    """演示异常在帧间的传播"""

    import traceback

    def inner():
        raise ValueError("来自inner")

    def middle():
        try:
            inner()
        except ValueError:
            print("  middle捕获ValueError，重新抛出")
            raise  # 重新抛出

    def outer():
        try:
            middle()
        except ValueError as e:
            print(f"  outer捕获: {e}")
            traceback.print_exc()

    print("\n=== 异常传播演示 ===")
    outer()


def demonstrate_exception_zero_cost():
    """演示零开销异常处理"""

    import time

    def no_exception(n):
        """无异常路径"""
        total = 0
        for i in range(n):
            total += i
        return total

    def with_try_except(n):
        """try-expt但无异常"""
        total = 0
        for i in range(n):
            try:
                total += i
            except Exception:
                total = 0
        return total

    n = 1000000

    print("\n=== 零开销异常处理测试 ===")
    start = time.perf_counter()
    no_exception(n)
    t1 = time.perf_counter()

    with_try_except(n)
    t2 = time.perf_counter()

    print(f"  无try-except: {t1-start:.4f}s")
    print(f"  有try-except(无异常): {t2-t1:.4f}s")
    print(f"  开销: {(t2-t1)/(t1-start) - 1:.2%}")

    # Python 3.11+: try-except在无异常路径上几乎零开销
    # Python 3.10-: try-except有明显开销(SETUP_FINALLY/POP_BLOCK)


if __name__ == "__main__":
    print(f"Python版本: {sys.version}")
    demonstrate_exception_table()
    demonstrate_exception_flow()
    demonstrate_exception_zero_cost()
```

---

## 40.5 常见陷阱与最佳实践

### 40.5.1 虚拟机版本兼容性陷阱

```python
"""
陷阱：依赖特定版本的字节码或内部数据结构
"""

import sys
import types

# 陷阱1: CodeType构造函数参数变化
# Python 3.8: co_kwonlyargcount在co_nlocals之前
# Python 3.8-3.10: (argcount, kwonlyargcount, nlocals, ...)
# Python 3.11+: (argcount, posonlyargcount, kwonlyargcount, nlocals, ...)

code_template = None

def example():
    return 42

original = example.__code__

# 错误做法: 硬编码参数顺序
# new_code = types.CodeType(argcount, kwonlyargcount, nlocals, ...)
# 不同版本参数顺序不同!

# 正确做法: 使用code.replace()
if hasattr(original, 'replace'):
    # Python 3.8+ 支持 replace()
    new_code = original.replace(
        co_consts=(None, 99),  # 修改常量表
        co_name="modified_example",
    )
    print(f"修改后: {new_code.co_name}")
    print(f"常量: {new_code.co_consts}")
else:
    # Python 3.7及以下需要手动构造
    print("警告: 当前版本不支持code.replace()")

# 陷阱2: 字节码指令变化
# Python 3.12: 移除了PRECALL指令
# Python 3.11: 引入了PRECALL, 3.12移除
# Python 3.11+: BINARY_OP替代了BINARY_ADD等

# 正确做法: 使用dis模块抽象版本差异
import dis
instructions = list(dis.Bytecode(example))
for instr in instructions:
    # 使用opname而非opcode数值
    print(f"  {instr.opname}")  # 可靠
    # 避免使用instr.opcode  # 版本相关
```

### 40.5.2 引用计数与内存管理陷阱

```python
"""
陷阱：不理解CPython的引用计数机制导致的内存问题
"""

import sys
import gc
import weakref

# 陷阱1: 循环引用导致内存泄漏
class Node:
    def __init__(self, name):
        self.name = name
        self.parent = None
        self.children = []

    def add_child(self, child):
        self.children.append(child)
        child.parent = self  # 创建循环引用!

# 创建循环引用
root = Node("root")
child1 = Node("child1")
child2 = Node("child2")
root.add_child(child1)
root.add_child(child2)

# root → child1 → root (循环!)
# root → child2 → root (循环!)

print(f"root引用计数: {sys.getrefcount(root)}")
print(f"child1引用计数: {sys.getrefcount(child1)}")

# 删除变量后，循环引用对象仍存在
del root
del child1
del child2

# gc.collect() 可以回收循环引用
collected = gc.collect()
print(f"GC回收对象数: {collected}")

# 正确做法1: 使用weakref打破循环
class TreeNode:
    def __init__(self, name):
        self.name = name
        self._parent_ref = None  # 弱引用
        self.children = []

    @property
    def parent(self):
        if self._parent_ref is not None:
            return self._parent_ref()
        return None

    @parent.setter
    def parent(self, value):
        if value is not None:
            self._parent_ref = weakref.ref(value)
        else:
            self._parent_ref = None

# 正确做法2: 定义__del__时小心
# __del__会阻止GC回收循环引用!
class BadNode:
    def __init__(self, name):
        self.name = name
        self.next = None

    def __del__(self):
        print(f"BadNode {self.name} 被回收")
        # __del__使得GC无法回收包含此对象的循环引用

# 正确做法3: 使用weakref.WeakKeyDictionary/WeakValueDictionary
class Cache:
    def __init__(self):
        # 弱引用字典，键不被强引用
        self._cache = weakref.WeakValueDictionary()

    def get(self, key):
        return self._cache.get(key)

    def set(self, key, value):
        self._cache[key] = value
```

### 40.5.3 GIL与并发陷阱

```python
"""
陷阱：误解GIL导致的并发问题

CPython的GIL(Global Interpreter Lock)确保同一时刻只有一个
线程执行Python字节码。但这不意味着线程安全!
"""

import threading
import time

# 陷阱1: GIL不保证原子性
# 虽然"GIL确保字节码原子执行"，但高级操作不是原子的

counter = 0

def increment():
    global counter
    for _ in range(1000000):
        counter += 1  # 不是原子操作!
        # 字节码: LOAD_GLOBAL → LOAD_CONST → BINARY_ADD → STORE_GLOBAL

threads = [threading.Thread(target=increment) for _ in range(10)]
for t in threads:
    t.start()
for t in threads:
    t.join()

print(f"期望counter: 10000000, 实际: {counter}")
# 实际结果通常小于10000000!

# 正确做法: 使用锁
counter_safe = 0
lock = threading.Lock()

def increment_safe():
    global counter_safe
    for _ in range(1000000):
        with lock:
            counter_safe += 1

threads = [threading.Thread(target=increment_safe) for _ in range(10)]
for t in threads:
    t.start()
for t in threads:
    t.join()

print(f"加锁后counter: {counter_safe}")  # 正确: 10000000

# 陷阱2: GIL只在纯Python代码时持有
# C扩展在执行无Python对象的C代码时会释放GIL
# 这意味着:
# 1. I/O操作(文件、网络)会释放GIL
# 2. NumPy等C扩展在计算时释放GIL
# 3. 其他线程可以并行执行Python代码

# 陷阱3: GIL检查间隔
# Python 3.2+: GIL每5ms切换一次(sys.getswitchinterval())
print(f"\nGIL切换间隔: {sys.getswitchinterval()*1000:.1f}ms")

# 最佳实践:
# 1. I/O密集型 → 使用多线程(GIL在I/O时释放)
# 2. CPU密集型 → 使用多进程(multiprocessing)
# 3. 混合型 → 使用进程池+线程池
# 4. 需要真正并行 → 考虑C扩展释放GIL或使用asyncio
```

### 40.5.4 最佳实践总结

```python
"""
CPython虚拟机 — 最佳实践清单
"""

# === 编码实践 ===

# 1. 保持类型稳定
#    同一函数中始终使用相同类型的操作数
#    让adaptive interpreter有效特化

def stable_types(items):
    """好: 类型一致"""
    return [x * 2 for x in items]  # 全部int或全部float

def unstable_types(items):
    """差: 类型混合"""
    result = []
    for x in items:
        result.append(x * 2 if isinstance(x, int) else x * 2.0)
    return result

# 2. 优先使用局部变量
#    LOAD_FAST > LOAD_GLOBAL > LOAD_NAME > LOAD_ATTR

def fast_access():
    """缓存全局和属性查找"""
    from math import sin, cos  # 局部化导入
    _sin = sin  # 缓存到局部变量
    _cos = cos
    return _sin(0) + _cos(0)

# 3. 使用__slots__减少属性查找开销
class OptimizedPoint:
    __slots__ = ('x', 'y')
    def __init__(self, x, y):
        self.x = x
        self.y = y

# 4. 避免不必要的函数调用
#    列表推导式 > map > for循环+append
#    内联比较 > 函数调用比较

# 5. try-except几乎零开销(Python 3.11+)
#    使用EAFP(请求宽恕比许可容易)风格

def eafp_style(obj, key):
    """Python风格: 先尝试，后捕获"""
    try:
        return obj[key]
    except (KeyError, TypeError):
        return None

# 6. 避免在热路径上使用sys._getframe()
#    帧访问有显著开销

# 7. 理解GIL的限制
#    CPU密集型用multiprocessing
#    I/O密集型用threading或asyncio

# === 调试实践 ===

# 8. 使用dis模块理解代码行为
#    dis.dis(func) 是性能分析的第一步

# 9. 使用code.replace()修改Code Object
#    不要手动构造CodeType

# 10. 使用timeit进行微基准测试
#     避免手动time.perf_counter()

import timeit
result = timeit.timeit(
    "''.join(str(i) for i in range(100))",
    number=10000,
)
print(f"字符串拼接基准: {result:.4f}s")
```