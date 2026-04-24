# 第38章 C扩展与Cython

## 1. 概念与语法

### 1.1 Python C 扩展全景

Python 提供了多种方式与 C 代码交互，从底层到高层：

```
┌──────────────────────────────────────────────────┐
│              Python/C 交互层次                     │
├──────────────────────────────────────────────────┤
│                                                  │
│  高层（易用）                                    │
│  ┌──────────────┐                               │
│  │  pybind11    │  C++ → Python 绑定，最推荐     │
│  ├──────────────┤                               │
│  │  Cython      │  Python超集→C，兼顾易用与性能  │
│  ├──────────────┤                               │
│  │  cffi        │  FFI接口，调用C函数            │
│  ├──────────────┤                               │
│  │  ctypes      │  标准库FFI，最简单但最慢       │
│  ├──────────────┤                               │
│  │  C API       │  原生C扩展，最底层最灵活        │
│  └──────────────┘                               │
│  低层（灵活）                                    │
└──────────────────────────────────────────────────┘
```

### 1.2 核心语法速查

```c
/* C API 核心宏与函数 */
#include <Python.h>

// 引用计数
Py_INCREF(obj)                    // 增加引用计数
Py_DECREF(obj)                    // 减少引用计数，可能释放
Py_XDECREF(obj)                  // 安全版本（允许NULL）

// 对象创建
PyLong_FromLong(42)              // C long → Python int
PyFloat_FromDouble(3.14)         // C double → Python float
PyUnicode_FromString("hello")    // C string → Python str
PyList_New(size)                 // 创建列表
PyDict_New()                     // 创建字典

// 类型检查
PyLong_Check(obj)                // 是否为 int
PyFloat_Check(obj)               // 是否为 float
PyUnicode_Check(obj)             // 是否为 str
PyList_Check(obj)                // 是否为 list

// 参数解析
PyArg_ParseTuple(args, "is", &num, &str)    // 解析位置参数
PyArg_ParseTupleAndKeywords(args, kw, "i|s", kwlist, &num, &str)

// 返回值
Py_RETURN_NONE;                  // 返回 None
Py_RETURN_TRUE;                  // 返回 True
return PyLong_FromLong(result);  // 返回整数
```

```python
# Cython 语法速查
# .pyx 文件

# 类型声明
cdef int x = 42                   # C int
cdef double y = 3.14              # C double
cdef char* s = "hello"            # C string

# 函数声明
cdef int c_func(int x):           # C函数，不能从Python调用
    return x * x

cpdef int hybrid_func(int x):     # 混合函数，C和Python都可调用
    return x * x

def py_func(int x):               # Python函数，有类型注解
    return x * x

# 类声明
cdef class FastPoint:
    cdef double x, y              # C属性，不暴露给Python

    def __init__(self, double x, double y):
        self.x = x
        self.y = y

    cpdef double magnitude(self):
        return (self.x**2 + self.y**2)**0.5
```

---

## 2. 原理与机制

### 2.1 Python C API 架构

```
Python 解释器架构:
┌──────────────────────────────────┐
│    Python 代码 (.py)              │
├──────────────────────────────────┤
│    Python 字节码 (.pyc)           │
├──────────────────────────────────┤
│    CPython 解释器 (ceval.c)      │  ← 字节码执行引擎
├──────────────────────────────────┤
│    Python C API (Python.h)        │  ← C扩展接口层
├──────────────────────────────────┤
│    内置类型对象                    │
│    PyLongObject, PyListObject... │  ← Python对象底层表示
├──────────────────────────────────┤
│    pymalloc / malloc              │  ← 内存分配
├──────────────────────────────────┤
│    操作系统                        │
└──────────────────────────────────┘
```

### 2.2 PyObject 结构与引用计数

所有 Python 对象在 C 层面都是 `PyObject*`，其核心结构：

```c
// Include/object.h
typedef struct _object {
    Py_ssize_t ob_refcnt;       // 引用计数
    PyTypeObject *ob_type;      // 类型对象指针
} PyObject;

// 每个具体类型在 PyObject_HEAD 之后有自己的字段
typedef struct {
    PyObject_HEAD                // ob_refcnt + ob_type = 16 bytes
    Py_ssize_t ob_size;         // 列表元素数量
    PyObject **ob_item;         // 元素指针数组
    Py_ssize_t allocated;       // 已分配空间大小
} PyListObject;

// 引用计数的线程安全保证:
// 1. CPython 使用 GIL (Global Interpreter Lock) 保证引用计数操作的原子性
// 2. Py_INCREF/Py_DECREF 在 GIL 保护下执行
// 3. 在没有 GIL 的自由线程构建中，使用原子操作

// 引用计数规则:
// 1. 新创建的对象 refcnt=1
// 2. 赋值/传参时 Py_INCREF
// 3. 离开作用域时 Py_DECREF
// 4. 函数返回时"转移"引用（调用者负责DECREF）
// 5. 借用引用（borrowed reference）不需要INCREF/DECREF
```

### 2.3 扩展模块的加载机制

```c
// Python 加载 C 扩展的过程:

// 1. import 语句触发模块查找
// 2. 在 sys.path 中搜索模块名
// 3. 找到 .so/.pyd 文件（编译后的扩展模块）
// 4. 调用 dlopen/LoadLibrary 加载共享库
// 5. 查找 PyInit_<module> 入口函数
// 6. 调用入口函数，获取模块对象

// 模块初始化函数模板:
PyMODINIT_FUNC PyInit_mymodule(void) {
    PyObject *m = PyModule_Create(&mymodule_module);
    if (m == NULL) return NULL;
    return m;
}

// 模块定义结构:
static struct PyModuleDef mymodule_module = {
    PyModuleDef_HEAD_INIT,
    "mymodule",           // 模块名
    module_docstring,     // 文档字符串
    -1,                   // 模块状态大小（-1=无状态）
    mymodule_methods     // 方法表
};

// 方法表:
static PyMethodDef mymodule_methods[] = {
    {"func_name", func_impl, METH_VARARGS, "function docstring"},
    {NULL, NULL, 0, NULL}  // 哨兵
};
```

### 2.4 Cython 编译流程

```
Cython 编译流程:

  .pyx 文件          .pxd 文件（可选头文件）
      │                    │
      ▼                    ▼
  Cython 前端解析器
      │
      ▼
  .c 文件（生成的C代码）
      │
      ▼
  C 编译器（gcc/MSVC）
      │
      ▼
  .so/.pyd 文件（共享库）
      │
      ▼
  Python import 加载
```

**Cython 生成的 C 代码核心结构**：

```c
// Cython 生成的C代码（简化）
// 1. 模块初始化
PyMODINIT_FUNC PyInit_mymodule(void) {
    // 创建模块
    // 注册类型
    // 初始化常量
}

// 2. 类型定义
typedef struct {
    PyObject_HEAD
    double x;  // Cython cdef 属性
    double y;
} __pyx_MyClass;

// 3. 函数包装
// Cython 会为每个 def/cpdef 函数生成包装器
static PyObject *__pyx_pw_mymodule_func(PyObject *__pyx_self, PyObject *__pyx_args) {
    // 解析参数
    int __pyx_v_x;
    if (!PyArg_ParseTuple(__pyx_args, "i", &__pyx_v_x))
        return NULL;
    // 调用C函数
    __pyx_r = __pyx_pf_mymodule_func(__pyx_v_x);
    return __pyx_r;
}

// 4. 实际C实现
static int __pyx_pf_mymodule_func(int __pyx_v_x) {
    // 类型化的C代码，无Python对象开销
    return __pyx_v_x * __pyx_v_x;
}
```

### 2.5 ctypes vs cffi vs pybind11 对比

```
              ctypes    cffi    pybind11    Cython    C API
性能           ★★       ★★★     ★★★★       ★★★★★    ★★★★★
易用性         ★★★★★    ★★★★     ★★★★       ★★★      ★★
类型安全       ★★       ★★★★    ★★★★★      ★★★★★    ★★★★★
C++支持        ✗        ✗        ★★★★★      ★★★      ★★★
回调支持       ★★       ★★★     ★★★★       ★★★★     ★★★★
无需编译       ✓        ✓(ABI)   ✗           ✗         ✗
标准库         ✓        ✓        ✗           ✗         ✗
ABI模式       ✓        ✓        ✗           ✗         ✗
API模式       ✗        ✓        ✓           ✓         ✓
```

---

## 3. 使用场景

### 3.1 场景一：性能关键路径加速

数值计算、图像处理、加密算法等 CPU 密集型任务，纯 Python 太慢，需要 C 级别的性能。

### 3.2 场景二：调用现有 C/C++ 库

使用已有的 C/C++ 库（如 OpenSSL、SQLite、系统 API），无需重写。

### 3.3 场景一：低级系统操作

需要直接操作内存、硬件接口、系统调用等 Python 标准库不支持的功能。

### 3.4 场景四：Python 对象的 C 层操作

需要绕过 Python 对象的常规接口，直接操作底层 C 结构（如高性能数据处理）。

---

## 4. 示例代码

### 4.1 原生 C 扩展模块

```c
/* fastutils.c — 原生C扩展模块示例
 * 编译命令（Linux）:
 *   gcc -shared -fPIC -I$(python3 -c "import sysconfig; print(sysconfig.get_path('include'))") \
 *       -o fastutils$(python3-config --extension-suffix) fastutils.c
 *
 * 编译命令（使用setup.py）:
 *   python setup.py build_ext --inplace
 */

#include <Python.h>
#include <math.h>

/* ===== 1. 简单函数 ===== */

/* 计算斐波那契数列 */
static PyObject*
fastutils_fibonacci(PyObject* self, PyObject* args)
{
    int n;
    if (!PyArg_ParseTuple(args, "i", &n))
        return NULL;

    if (n < 0) {
        PyErr_SetString(PyExc_ValueError, "n must be non-negative");
        return NULL;
    }
    if (n <= 1) {
        return PyLong_FromLong(n);
    }

    long long a = 0, b = 1;
    for (int i = 2; i <= n; i++) {
        long long temp = a + b;
        a = b;
        b = temp;
    }
    return PyLong_FromLongLong(b);
}

/* ===== 2. 带关键字参数的函数 ===== */

/* 计算统计信息 */
static PyObject*
fastutils_statistics(PyObject* self, PyObject* args, PyObject* kwargs)
{
    PyObject* list_obj;
    int ddof = 0;  /* 默认值 */
    static char* kwlist[] = {"data", "ddof", NULL};

    if (!PyArg_ParseTupleAndKeywords(args, kwargs, "O|i", kwlist,
                                     &list_obj, &ddof))
        return NULL;

    /* 验证输入是列表 */
    if (!PyList_Check(list_obj)) {
        PyErr_SetString(PyExc_TypeError, "data must be a list");
        return NULL;
    }

    Py_ssize_t n = PyList_Size(list_obj);
    if (n <= ddof) {
        PyErr_SetString(PyExc_ValueError, "not enough data points");
        return NULL;
    }

    /* 计算均值 */
    double sum = 0.0;
    for (Py_ssize_t i = 0; i < n; i++) {
        PyObject* item = PyList_GetItem(list_obj, i);  /* 借用引用 */
        double val = PyFloat_AsDouble(item);
        if (val == -1.0 && PyErr_Occurred())
            return NULL;
        sum += val;
    }
    double mean = sum / n;

    /* 计算方差 */
    double var_sum = 0.0;
    for (Py_ssize_t i = 0; i < n; i++) {
        PyObject* item = PyList_GetItem(list_obj, i);
        double val = PyFloat_AsDouble(item);
        double diff = val - mean;
        var_sum += diff * diff;
    }
    double variance = var_sum / (n - ddof);
    double std_dev = sqrt(variance);

    /* 返回字典 */
    PyObject* result = PyDict_New();
    if (result == NULL) return NULL;

    PyDict_SetItemString(result, "mean", PyFloat_FromDouble(mean));
    PyDict_SetItemString(result, "variance", PyFloat_FromDouble(variance));
    PyDict_SetItemString(result, "std_dev", PyFloat_FromDouble(std_dev));
    PyDict_SetItemString(result, "count", PyLong_FromSsize_t(n));

    return result;
}

/* ===== 3. 自定义类型 ===== */

typedef struct {
    PyObject_HEAD
    double x;
    double y;
} FastPointObject;

/* 类型析构函数 */
static void
FastPoint_dealloc(FastPointObject* self)
{
    Py_TYPE(self)->tp_free((PyObject*)self);
}

/* __init__ */
static int
FastPoint_init(FastPointObject* self, PyObject* args, PyObject* kwargs)
{
    double x = 0.0, y = 0.0;
    static char* kwlist[] = {"x", "y", NULL};

    if (!PyArg_ParseTupleAndKeywords(args, kwargs, "|dd", kwlist, &x, &y))
        return -1;

    self->x = x;
    self->y = y;
    return 0;
}

/* 方法: 计算距离 */
static PyObject*
FastPoint_distance(FastPointObject* self, PyObject* args)
{
    FastPointObject* other;
    if (!PyArg_ParseTuple(args, "O!", &FastPointType, &other))
        return NULL;

    double dx = self->x - other->x;
    double dy = self->y - other->y;
    double dist = sqrt(dx * dx + dy * dy);
    return PyFloat_FromDouble(dist);
}

/* 属性getter: magnitude */
static PyObject*
FastPoint_get_magnitude(FastPointObject* self, void* closure)
{
    double mag = sqrt(self->x * self->x + self->y * self->y);
    return PyFloat_FromDouble(mag);
}

/* 属性setter: magnitude */
static int
FastPoint_set_magnitude(FastPointObject* self, PyObject* value, void* closure)
{
    if (value == NULL) {
        PyErr_SetString(PyExc_TypeError, "cannot delete magnitude");
        return -1;
    }
    double new_mag = PyFloat_AsDouble(value);
    if (PyErr_Occurred()) return -1;

    double current_mag = sqrt(self->x * self->x + self->y * self->y);
    if (current_mag > 0) {
        double scale = new_mag / current_mag;
        self->x *= scale;
        self->y *= scale;
    }
    return 0;
}

/* __repr__ */
static PyObject*
FastPoint_repr(FastPointObject* self)
{
    return PyUnicode_FromFormat("FastPoint(%.2f, %.2f)", self->x, self->y);
}

/* 属性定义 */
static PyGetSetDef FastPoint_getsetters[] = {
    {"x", (getter)NULL, (setter)NULL, "x coordinate", NULL},  /* 简化 */
    {"y", (getter)NULL, (setter)NULL, "y coordinate", NULL},
    {"magnitude", FastPoint_get_magnitude, FastPoint_set_magnitude,
     "point magnitude", NULL},
    {NULL}
};

/* 方法定义 */
static PyMethodDef FastPoint_methods[] = {
    {"distance", (PyCFunction)FastPoint_distance, METH_VARARGS,
     "Calculate distance to another point"},
    {NULL}
};

/* 类型定义 */
static PyTypeObject FastPointType = {
    PyVarObject_HEAD_INIT(NULL, 0)
    .tp_name = "fastutils.FastPoint",
    .tp_basicsize = sizeof(FastPointObject),
    .tp_dealloc = (destructor)FastPoint_dealloc,
    .tp_repr = (reprfunc)FastPoint_repr,
    .tp_flags = Py_TPFLAGS_DEFAULT,
    .tp_doc = "A fast 2D point implemented in C",
    .tp_methods = FastPoint_methods,
    .tp_getset = FastPoint_getsetters,
    .tp_init = (initproc)FastPoint_init,
    .tp_new = PyType_GenericNew,
};

/* ===== 4. 模块定义 ===== */

static PyMethodDef fastutils_methods[] = {
    {"fibonacci", fastutils_fibonacci, METH_VARARGS,
     "Calculate fibonacci number"},
    {"statistics", (PyCFunction)fastutils_statistics,
     METH_VARARGS | METH_KEYWORDS,
     "Calculate statistics for a list of numbers"},
    {NULL, NULL, 0, NULL}
};

static struct PyModuleDef fastutils_module = {
    PyModuleDef_HEAD_INIT,
    "fastutils",
    "Fast utility functions implemented in C",
    -1,
    fastutils_methods
};

PyMODINIT_FUNC
PyInit_fastutils(void)
{
    PyObject* m;

    if (PyType_Ready(&FastPointType) < 0)
        return NULL;

    m = PyModule_Create(&fastutils_module);
    if (m == NULL)
        return NULL;

    Py_INCREF(&FastPointType);
    if (PyModule_AddObject(m, "FastPoint",
                          (PyObject*)&FastPointType) < 0) {
        Py_DECREF(&FastPointType);
        Py_DECREF(m);
        return NULL;
    }

    return m;
}
```

对应的 `setup.py`:

```python
"""
setup.py — 编译C扩展模块
使用: python setup.py build_ext --inplace
"""
from setuptools import setup, Extension

# 定义扩展模块
fastutils_ext = Extension(
    'fastutils',                          # 模块名
    sources=['fastutils.c'],              # 源文件
    extra_compile_args=['-O3'],           # 编译优化
    # Windows 可能需要:
    # libraries=['msvcrt'],
    # Linux 可能需要:
    # libraries=['m'],  # 数学库
)

setup(
    name='fastutils',
    version='1.0.0',
    description='Fast utility functions implemented in C',
    ext_modules=[fastutils_ext],
)
```

### 4.2 Cython 扩展模块

```python
# fastmath.pyx — Cython 扩展模块示例
# 编译命令: python setup.py build_ext --inplace

import cython
from cython.view cimport array as cvarray
from libc.math cimport sqrt, pow, sin, cos, M_PI
from libc.stdlib cimport malloc, free

# ===== 1. 类型化函数 =====

def fibonacci(int n):
    """Cython 版斐波那契 — C级速度"""
    if n < 0:
        raise ValueError("n must be non-negative")
    if n <= 1:
        return n

    cdef long long a = 0
    cdef long long b = 1
    cdef long long temp
    cdef int i

    for i in range(2, n + 1):
        temp = a + b
        a = b
        b = temp

    return b


# ===== 2. cdef / cpdef 函数 =====

cdef double _magnitude(double x, double y) noexcept:
    """纯C函数 — 不能从Python调用，最快速度"""
    return sqrt(x * x + y * y)


cpdef double magnitude(double x, double y):
    """混合函数 — C和Python都可调用，有类型检查"""
    if x == 0.0 and y == 0.0:
        raise ValueError("point cannot be at origin")
    return _magnitude(x, y)


# ===== 3. 内存视图（typed memoryview）=====

def sum_array(double[:] data):
    """使用内存视图快速求和"""
    cdef double total = 0.0
    cdef Py_ssize_t i
    cdef Py_ssize_t n = data.shape[0]

    for i in range(n):
        total += data[i]

    return total


def matrix_multiply(double[:, :] A, double[:, :] B):
    """矩阵乘法 — C级速度"""
    cdef Py_ssize_t n = A.shape[0]
    cdef Py_ssize_t m = A.shape[1]
    cdef Py_ssize_t p = B.shape[1]

    if B.shape[0] != m:
        raise ValueError("incompatible matrix dimensions")

    # 使用C数组，避免Python对象开销
    cdef double[:, :] C = cvarray(shape=(n, p), itemsize=sizeof(double), format="d")
    cdef Py_ssize_t i, j, k
    cdef double s

    for i in range(n):
        for j in range(p):
            s = 0.0
            for k in range(m):
                s += A[i, k] * B[k, j]
            C[i, j] = s

    return C


# ===== 4. Cython 类 =====

cdef class FastPoint:
    """Cython 类 — C级属性，Python接口"""
    cdef double x
    cdef double y

    def __init__(self, double x=0.0, double y=0.0):
        self.x = x
        self.y = y

    @property
    def x_prop(self):
        return self.x

    @property
    def y_prop(self):
        return self.y

    cpdef double distance(self, FastPoint other):
        """计算两点间距离 — C级速度"""
        cdef double dx = self.x - other.x
        cdef double dy = self.y - other.y
        return sqrt(dx * dx + dy * dy)

    cpdef double magnitude(self):
        """计算模长"""
        return _magnitude(self.x, self.y)

    def __repr__(self):
        return f"FastPoint({self.x:.2f}, {self.y:.2f})"

    # 运算符重载
    def __add__(self, FastPoint other):
        return FastPoint(self.x + other.x, self.y + other.y)

    def __sub__(self, FastPoint other):
        return FastPoint(self.x - other.x, self.y - other.y)


# ===== 5. 释放 GIL =====

def compute_mandelbrot(int width, int height, double x_min, double x_max,
                        double y_min, double y_max, int max_iter):
    """计算 Mandelbrot 集合 — 释放GIL实现并行"""
    cdef double[:, :] result = cvarray(
        shape=(height, width), itemsize=sizeof(double), format="d"
    )
    cdef double x_scale = (x_max - x_min) / width
    cdef double y_scale = (y_max - y_min) / height
    cdef double cx, cy, zx, zy, zx2, zy2
    cdef int iter, i, j

    # 释放GIL，允许其他线程执行
    with nogil:
        for i in range(height):
            cy = y_min + i * y_scale
            for j in range(width):
                cx = x_min + j * x_scale
                zx = 0.0
                zy = 0.0
                iter = 0
                while zx * zx + zy * zy < 4.0 and iter < max_iter:
                    zy = 2.0 * zx * zy + cy
                    zx = zx * zx - zy * zy + cx
                    iter += 1
                result[i, j] = <double>iter / max_iter

    return result


# ===== 6. 使用 C 标准库 =====

def fast_stats(double[:] data):
    """使用C库函数的快速统计"""
    cdef Py_ssize_t n = data.shape[0]
    cdef double sum_val = 0.0
    cdef double sum_sq = 0.0
    cdef double mean_val, var_val, std_val
    cdef Py_ssize_t i

    for i in range(n):
        sum_val += data[i]
        sum_sq += data[i] * data[i]

    mean_val = sum_val / n
    var_val = (sum_sq / n) - (mean_val * mean_val)
    std_val = sqrt(var_val)

    return {
        'mean': mean_val,
        'variance': var_val,
        'std_dev': std_val,
        'count': n,
    }
```

对应的 `setup.py`:

```python
"""
setup.py — 编译Cython扩展模块
使用: python setup.py build_ext --inplace
"""
from setuptools import setup, Extension
from Cython.Build import cythonize
import numpy

extensions = [
    Extension(
        "fastmath",
        sources=["fastmath.pyx"],
        include_dirs=[numpy.get_include()],  # 如果使用NumPy
        extra_compile_args=['-O3'],
    ),
]

setup(
    name='fastmath',
    version='1.0.0',
    ext_modules=cythonize(
        extensions,
        compiler_directives={
            'language_level': "3",    # Python 3 语法
            'boundscheck': False,     # 禁用边界检查（性能）
            'wraparound': False,      # 禁用负索引（性能）
            'cdivision': True,        # C除法语义（不检查零除）
        }
    ),
)
```

### 4.3 pybind11 扩展模块

```cpp
// fastbind.cpp — pybind11 C++ 扩展示例
// 编译需要: pip install pybind11
// 编译命令: c++ -O3 -shared -std=c++17
//   -I$(python3 -m pybind11 --includes)
//   $(python3-config --ldflags)
//   fastbind.cpp -o fastbind$(python3-config --extension-suffix)

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>      // 自动转换 STL 容器
#include <pybind11/numpy.h>    // NumPy 数组支持
#include <vector>
#include <cmath>
#include <numeric>
#include <algorithm>

namespace py = pybind11;

// ===== 1. 简单函数 =====

long long fibonacci(int n) {
    if (n < 0) throw std::invalid_argument("n must be non-negative");
    if (n <= 1) return n;
    long long a = 0, b = 1;
    for (int i = 2; i <= n; i++) {
        long long temp = a + b;
        a = b;
        b = temp;
    }
    return b;
}

// ===== 2. 操作 NumPy 数组 =====

py::array_t<double> smooth(const py::array_t<double>& input, int window) {
    // 获取缓冲区信息（零拷贝）
    py::buffer_info buf = input.request();
    if (buf.ndim != 1)
        throw std::runtime_error("input must be 1-dimensional");

    double* ptr = static_cast<double*>(buf.ptr);
    ssize_t size = buf.shape[0];

    // 创建输出数组
    py::array_t<double> output(size);
    py::buffer_info out_buf = output.request();
    double* out_ptr = static_cast<double*>(out_buf.ptr);

    // 计算移动平均
    int half = window / 2;
    for (ssize_t i = 0; i < size; i++) {
        double sum = 0.0;
        int count = 0;
        for (int j = -half; j <= half; j++) {
            ssize_t idx = i + j;
            if (idx >= 0 && idx < size) {
                sum += ptr[idx];
                count++;
            }
        }
        out_ptr[i] = sum / count;
    }

    return output;
}

// ===== 3. C++ 类绑定 =====

class Point {
public:
    double x, y;

    Point(double x = 0.0, double y = 0.0) : x(x), y(y) {}

    double distance(const Point& other) const {
        double dx = x - other.x;
        double dy = y - other.y;
        return std::sqrt(dx * dx + dy * dy);
    }

    double magnitude() const {
        return std::sqrt(x * x + y * y);
    }

    Point operator+(const Point& other) const {
        return Point(x + other.x, y + other.y);
    }

    std::string repr() const {
        return "Point(" + std::to_string(x) + ", " + std::to_string(y) + ")";
    }
};

// ===== 4. 模块定义 =====

PYBIND11_MODULE(fastbind, m) {
    m.doc() = "Fast functions implemented in C++ with pybind11";

    // 简单函数
    m.def("fibonacci", &fibonacci,
          "Calculate fibonacci number",
          py::arg("n"));

    // NumPy 函数
    m.def("smooth", &smooth,
          "Apply moving average smoothing",
          py::arg("input"), py::arg("window") = 3);

    // 类绑定
    py::class_<Point>(m, "Point")
        .def(py::init<double, double>(),
             py::arg("x") = 0.0, py::arg("y") = 0.0)
        .def_readwrite("x", &Point::x)
        .def_readwrite("y", &Point::y)
        .def("distance", &Point::distance)
        .def("magnitude", &Point::magnitude)
        .def(py::self + py::self)
        .def("__repr__", &Point::repr);
}
```

### 4.4 ctypes 与 cffi

```python
"""
ctypes 和 cffi 示例 — 无需编译的C接口
"""
import ctypes
import ctypes.util
import os
import sys


# ============================================
# 1. ctypes — 标准库，无需额外安装
# ============================================

def ctypes_example():
    """ctypes 基本用法"""

    # --- 加载共享库 ---

    # 方式1: 使用系统查找
    libc_path = ctypes.util.find_library('c')
    if libc_path:
        libc = ctypes.CDLL(libc_path)
    else:
        # Windows
        libc = ctypes.CDLL('msvcrt.dll')

    # 方式2: 指定路径
    # mylib = ctypes.CDLL('./libmylib.so')       # Linux
    # mylib = ctypes.CDLL('./mylib.dll')         # Windows

    # --- 基本类型映射 ---
    # ctypes type    → C type
    # c_int          → int
    # c_double       → double
    # c_char_p       → char*
    # c_wchar_p      → wchar_t*
    # c_void_p       → void*
    # POINTER(c_int) → int*

    # --- 调用 C 函数 ---
    # printf
    libc.printf(b"Hello from ctypes! %d\n", 42)

    # atoi
    libc.atoi.restype = ctypes.c_int
    libc.atoi.argtypes = [ctypes.c_char_p]
    result = libc.atoi(b"12345")
    print(f"atoi('12345') = {result}")

    # sqrt (需要数学库)
    try:
        if sys.platform == 'linux':
            libm = ctypes.CDLL('libm.so.6')
        elif sys.platform == 'darwin':
            libm = ctypes.CDLL('libSystem.dylib')
        else:
            libm = ctypes.CDLL('msvcrt.dll')

        libm.sqrt.restype = ctypes.c_double
        libm.sqrt.argtypes = [ctypes.c_double]
        print(f"sqrt(2.0) = {libm.sqrt(2.0)}")
    except OSError:
        print("无法加载数学库")


def ctypes_struct_example():
    """ctypes 结构体示例"""
    import platform

    # 定义 C 结构体
    class Point(ctypes.Structure):
        _fields_ = [
            ("x", ctypes.c_double),
            ("y", ctypes.c_double),
        ]

        def __repr__(self):
            return f"Point({self.x}, {self.y})"

    class PointArray(ctypes.Structure):
        _fields_ = [
            ("points", Point * 10),  # 固定大小数组
            ("count", ctypes.c_int),
        ]

    # 创建和使用
    p = Point(3.0, 4.0)
    print(f"点: {p}")
    print(f"x = {p.x}, y = {p.y}")

    # 传递给C函数（如果有的话）
    # lib.some_func(byref(p))  # byref 类似 C 的 &


def ctypes_callback_example():
    """ctypes 回调函数示例"""

    # 定义回调类型
    CMP_FUNC = ctypes.CFUNCTYPE(ctypes.c_int,
                                 ctypes.c_void_p,
                                 ctypes.c_void_p)

    # Python 回调函数
    @CMP_FUNC
    def compare(a, b):
        # 转换为整数指针并取值
        va = ctypes.cast(a, ctypes.POINTER(ctypes.c_int))[0]
        vb = ctypes.cast(b, ctypes.POINTER(ctypes.c_int))[0]
        return (va > vb) - (va < vb)

    # 创建数组并排序
    IntArray5 = ctypes.c_int * 5
    arr = IntArray5(5, 2, 8, 1, 9)

    # 使用 libc 的 qsort（Linux/Mac）
    try:
        libc_path = ctypes.util.find_library('c')
        if libc_path:
            libc = ctypes.CDLL(libc_path)
            libc.qsort(arr, 5, ctypes.sizeof(ctypes.c_int), compare)
            print(f"排序后: {list(arr)}")
    except (OSError, AttributeError):
        print("qsort 示例需要 libc")


# ============================================
# 2. cffi — 更现代的FFI
# ============================================

def cffi_example():
    """cffi 基本用法"""
    # 需要安装: pip install cffi

    try:
        from cffi import FFI
    except ImportError:
        print("cffi 未安装，跳过示例")
        print("安装: pip install cffi")
        return

    ffi = FFI()

    # --- ABI 模式（无需编译，类似ctypes但更快）---
    ffi.cdef("""
        int atoi(const char *str);
        double sqrt(double x);
        int printf(const char *format, ...);
    """)

    # 加载C标准库
    if sys.platform == 'linux':
        C = ffi.dlopen(None)  # 加载主程序（包含libc）
    elif sys.platform == 'darwin':
        C = ffi.dlopen(None)
    else:
        C = ffi.dlopen('msvcrt.dll')

    # 调用函数
    result = C.atoi(b"12345")
    print(f"atoi('12345') = {result}")
    print(f"sqrt(2.0) = {C.sqrt(2.0)}")

    # --- API 模式（需要编译，但更快更安全）---
    # 参见下方的内联API模式示例


def cffi_api_example():
    """cffi API模式 — 需要编译但性能最好"""
    try:
        from cffi import FFI
    except ImportError:
        print("cffi 未安装")
        return

    ffibuilder = FFI()

    # 定义C接口
    ffibuilder.cdef("""
        double fast_stats(double *data, int n, double *mean, double *std_dev);
    """)

    # 定义C实现
    ffibuilder.set_source("_fast_stats_cffi", r"""
        #include <math.h>

        double fast_stats(double *data, int n, double *mean, double *std_dev) {
            double sum = 0.0, sum_sq = 0.0;
            for (int i = 0; i < n; i++) {
                sum += data[i];
                sum_sq += data[i] * data[i];
            }
            *mean = sum / n;
            double var = (sum_sq / n) - (*mean * *mean);
            *std_dev = sqrt(var);
            return sum;
        }
    """)

    # 编译（通常在setup.py中完成）
    # ffibuilder.compile(verbose=True)

    print("cffi API模式需要在setup.py中编译")
    print("参见: ffibuilder.compile()")


# ============================================
# 3. 性能对比
# ============================================

def benchmark_comparison():
    """对比不同C接口方式的性能"""
    import time

    # 纯Python版本
    def py_fibonacci(n):
        if n < 0:
            raise ValueError("n must be non-negative")
        if n <= 1:
            return n
        a, b = 0, 1
        for _ in range(2, n + 1):
            a, b = b, a + b
        return b

    # 测试
    n = 100000
    iterations = 100

    start = time.perf_counter()
    for _ in range(iterations):
        py_fibonacci(n)
    py_time = time.perf_counter() - start

    print(f"纯Python fibonacci({n}): {py_time*1000:.2f}ms ({iterations}次)")
    print(f"平均每次: {py_time/iterations*1000:.4f}ms")
    print()
    print("性能排序（从快到慢）:")
    print("  1. C API 扩展    — 最快，零Python开销")
    print("  2. Cython         — 接近C速度，有类型声明开销")
    print("  3. pybind11       — 接近C速度，C++便利")
    print("  4. cffi (API模式) — 快，有编译优化")
    print("  5. cffi (ABI模式) — 较快，运行时解析")
    print("  6. ctypes         — 较慢，大量类型转换开销")
    print("  7. 纯Python       — 最慢")


if __name__ == '__main__':
    print("=== ctypes 示例 ===\n")
    ctypes_example()
    ctypes_struct_example()
    ctypes_callback_example()

    print("\n\n=== cffi 示例 ===\n")
    cffi_example()
    cffi_api_example()

    print("\n\n=== 性能对比 ===\n")
    benchmark_comparison()
```

### 4.5 完整的 C 扩展项目结构

```python
"""
完整C扩展项目结构示例
包含构建、测试和打包配置
"""

# ===== 项目目录结构 =====
"""
fastproject/
├── setup.py
├── pyproject.toml
├── README.md
├── src/
│   └── fastproject/
│       ├── __init__.py
│       ├── core.py           # 纯Python回退实现
│       └── _core.pyx         # Cython实现（可选）
├── c_src/
│   ├── fastmodule.c          # C扩展源码
│   └── helper.h              # C头文件
├── tests/
│   ├── __init__.py
│   ├── test_core.py
│   └── test_speed.py
└── benches/
    └── benchmark.py
"""

# ===== setup.py (完整版) =====

SETUP_PY = '''
from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext
import sys
import os

class BuildExtCommand(build_ext):
    """自定义构建命令，处理Cython可选依赖"""

    def initialize_options(self):
        build_ext.initialize_options(self)

    def finalize_options(self):
        build_ext.finalize_options(self)

    def build_extensions(self):
        # 如果Cython可用，编译.pyx文件
        # 否则跳过Cython扩展
        try:
            from Cython.Build import cythonize
            for ext in self.extensions:
                if ext.sources[0].endswith('.pyx'):
                    self.extensions = cythonize(
                        self.extensions,
                        compiler_directives={'language_level': "3"}
                    )
                    break
        except ImportError:
            # 移除Cython扩展
            self.extensions = [
                ext for ext in self.extensions
                if not any(s.endswith('.pyx') for s in ext.sources)
            ]

        build_ext.build_extensions(self)


# C扩展模块
c_extension = Extension(
    'fastproject._c_core',
    sources=['c_src/fastmodule.c'],
    extra_compile_args=['-O3', '-Wall'],
    define_macros=[('NDEBUG', '1')],
)

# Cython扩展模块（可选）
try:
    from Cython.Build import cythonize
    import numpy

    cython_extension = Extension(
        'fastproject._cython_core',
        sources=['src/fastproject/_core.pyx'],
        include_dirs=[numpy.get_include()],
    )
    ext_modules = [c_extension] + cythonize(
        [cython_extension],
        compiler_directives={'language_level': "3"}
    )
except ImportError:
    ext_modules = [c_extension]

setup(
    name='fastproject',
    version='1.0.0',
    packages=['fastproject'],
    ext_modules=ext_modules,
    cmdclass={'build_ext': BuildExtCommand},
    python_requires='>=3.8',
    install_requires=[],
    extras_require={
        'cython': ['cython>=0.29'],
        'numpy': ['numpy>=1.20'],
        'dev': ['pytest', 'pytest-benchmark'],
    },
)
'''

# ===== 测试文件 =====

TEST_PY = '''
import pytest
import sys

# 尝试导入C扩展，回退到纯Python实现
try:
    from fastproject._c_core import fibonacci as c_fibonacci
    HAS_C_EXT = True
except ImportError:
    HAS_C_EXT = False
    c_fibonacci = None

try:
    from fastproject._cython_core import fibonacci as cython_fibonacci
    HAS_CYTHON = True
except ImportError:
    HAS_CYTHON = False
    cython_fibonacci = None

from fastproject.core import fibonacci as py_fibonacci


class TestFibonacci:
    @pytest.mark.parametrize("n,expected", [
        (0, 0),
        (1, 1),
        (10, 55),
        (20, 6765),
    ])
    def test_python_fibonacci(self, n, expected):
        assert py_fibonacci(n) == expected

    @pytest.mark.skipif(not HAS_C_EXT, reason="C extension not available")
    def test_c_fibonacci(self):
        for n in [0, 1, 10, 20]:
            assert c_fibonacci(n) == py_fibonacci(n)

    @pytest.mark.skipif(not HAS_CYTHON, reason="Cython not available")
    def test_cython_fibonacci(self):
        for n in [0, 1, 10, 20]:
            assert cython_fibonacci(n) == py_fibonacci(n)

    def test_negative_input(self):
        with pytest.raises(ValueError):
            py_fibonacci(-1)

    @pytest.mark.skipif(not HAS_C_EXT, reason="C extension not available")
    def test_c_negative_input(self):
        with pytest.raises(ValueError):
            c_fibonacci(-1)
'''

# ===== 纯Python回退实现 =====

CORE_PY = '''
"""纯Python回退实现 — 当C扩展不可用时使用"""


def fibonacci(n: int) -> int:
    """计算第n个斐波那契数"""
    if n < 0:
        raise ValueError("n must be non-negative")
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b


def statistics(data: list) -> dict:
    """计算统计信息"""
    if not data:
        raise ValueError("data cannot be empty")

    n = len(data)
    total = sum(data)
    mean = total / n
    variance = sum((x - mean) ** 2 for x in data) / n
    std_dev = variance ** 0.5

    return {
        'mean': mean,
        'variance': variance,
        'std_dev': std_dev,
        'count': n,
    }
'''

# ===== __init__.py =====

INIT_PY = '''
"""fastproject — 高性能Python模块"""

# 尝试导入C扩展，回退到纯Python实现
try:
    from fastproject._c_core import fibonacci, statistics
    _implementation = "C extension"
except ImportError:
    try:
        from fastproject._cython_core import fibonacci, statistics
        _implementation = "Cython"
    except ImportError:
        from fastproject.core import fibonacci, statistics
        _implementation = "Pure Python"


__all__ = ['fibonacci', 'statistics']
__version__ = '1.0.0'
'''

if __name__ == '__main__':
    print("完整C扩展项目结构示例")
    print("\n项目目录结构:")
    print("  fastproject/")
    print("  ├── setup.py")
    print("  ├── src/fastproject/")
    print("  │   ├── __init__.py")
    print("  │   ├── core.py")
    print("  │   └── _core.pyx")
    print("  ├── c_src/")
    print("  │   ├── fastmodule.c")
    print("  │   └── helper.h")
    print("  └── tests/")
    print("      ├── test_core.py")
    print("      └── test_speed.py")
```

---

## 5. 常见陷阱与最佳实践

### 5.1 陷阱：引用计数错误

```c
/* 错误：忘记增加引用计数 */
static PyObject*
bad_function(PyObject* self, PyObject* args)
{
    PyObject* list = PyList_New(3);
    PyObject* item = PyLong_FromLong(42);

    /* PyList_SetItem 会"窃取"item的引用，
     * 所以不需要 Py_DECREF(item)。
     * 但如果 PyList_SetItem 失败，item 会泄漏！
     */
    PyList_SetItem(list, 0, item);  /* 正确：窃取引用 */

    /* 错误示例：PyList_Append 不会窃取引用 */
    PyObject* item2 = PyLong_FromLong(99);
    PyList_Append(list, item2);  /* 增加列表的引用 */
    Py_DECREF(item2);            /* 必须手动DECREF! */

    return list;
}

/* 正确：错误处理路径中的引用计数 */
static PyObject*
correct_function(PyObject* self, PyObject* args)
{
    PyObject* list = PyList_New(0);
    if (list == NULL) return NULL;

    for (int i = 0; i < 10; i++) {
        PyObject* item = PyLong_FromLong(i);
        if (item == NULL) {
            Py_DECREF(list);  /* 错误时释放列表 */
            return NULL;
        }
        if (PyList_Append(list, item) < 0) {
            Py_DECREF(item);   /* 追加失败时释放item */
            Py_DECREF(list);   /* 释放列表 */
            return NULL;
        }
        Py_DECREF(item);  /* 追加成功后释放item */
    }

    return list;  /* 返回列表，转移引用 */
}

/* 引用计数规则总结:
 * 1. PyList_SetItem, PyTuple_SetItem: 窃取引用（不需要DECREF）
 * 2. PyList_Append, PyDict_SetItem: 不窃取引用（需要DECREF）
 * 3. 函数返回新引用: 调用者负责DECREF
 * 4. 函数返回借用引用: 调用者不应DECREF
 * 5. 错误路径中必须释放所有已获取的引用
 */
```

### 5.2 陷阱：GIL 死锁

```c
/* 错误：在持有GIL时等待另一个线程 */
static PyObject*
deadlock_function(PyObject* self, PyObject* args)
{
    /* 线程1: 持有GIL，等待锁A */
    Py_BEGIN_ALLOW_THREADS
    pthread_mutex_lock(&mutex_a);  /* 可能死锁！ */
    Py_END_ALLOW_THREADS

    /* 如果线程2持有锁A并需要GIL，就会死锁 */

    pthread_mutex_unlock(&mutex_a);
    Py_RETURN_NONE;
}

/* 正确：先释放GIL，再获取锁 */
static PyObject*
correct_locking(PyObject* self, PyObject* args)
{
    PyObject* result;

    /* 释放GIL，允许其他Python线程运行 */
    Py_BEGIN_ALLOW_THREADS

    /* 在没有GIL的情况下获取锁 */
    pthread_mutex_lock(&mutex_a);

    /* 做纯C计算（不涉及Python对象）*/
    /* ... */

    /* 释放锁 */
    pthread_mutex_unlock(&mutex_a);

    Py_END_ALLOW_THREADS  /* 重新获取GIL */

    return result;
}
```

### 5.3 陷阱：Cython 类型声明遗漏

```python
# 错误：忘记类型声明，回退到Python对象操作
def slow_sum(data):
    total = 0          # 类型未知，回退到Python int
    for item in data:  # Python循环，不是C循环
        total += item  # Python加法，不是C加法
    return total

# 正确：使用类型声明
def fast_sum(double[:] data):  # memoryview类型声明
    cdef double total = 0.0    # C double
    cdef Py_ssize_t i           # C整数循环变量
    cdef Py_ssize_t n = data.shape[0]

    for i in range(n):          # Cython将此编译为C循环
        total += data[i]        # C加法，无Python对象
    return total

# 使用 cython -a fastmath.pyx 查看黄色高亮
# 黄色 = Python交互（慢）
# 白色 = 纯C代码（快）
```

### 5.4 陷阱：ctypes 类型不匹配

```python
import ctypes

# 错误：类型不匹配导致段错误
libc = ctypes.CDLL(ctypes.util.find_library('c'))

# 错误：未指定返回类型（默认c_int）
result = libc.sqrt(2.0)  # 返回值被截断为int！
print(result)  # 可能是1而不是1.414...

# 正确：显式指定参数和返回类型
libc.sqrt.restype = ctypes.c_double
libc.sqrt.argtypes = [ctypes.c_double]
result = libc.sqrt(2.0)
print(result)  # 1.4142135623730951

# 错误：传递Python对象而非ctypes类型
# libc.printf("Hello %d", 42)  # 类型错误！
# 正确：
libc.printf(b"Hello %d\n", 42)

# 错误：忘记编码字符串
# libc.puts("hello")  # TypeError！
# 正确：
libc.puts(b"hello")       # bytes
libc.puts("hello".encode('utf-8'))
```

### 5.5 最佳实践总结

| 实践 | 说明 |
|------|------|
| **选择合适的工具** | ctypes/cffi 调用现有库，Cython/C API 写新代码 |
| **引用计数成对** | 每个 Py_INCREF 必须有对应的 Py_DECREF |
| **错误路径清理** | 所有错误路径必须释放已获取的引用 |
| **GIL 管理** | 长时间C计算用 `Py_BEGIN_ALLOW_THREADS` 释放GIL |
| **Cython 类型声明** | 用 `cython -a` 检查，消除黄色（Python交互） |
| **编译优化** | Release 构建使用 `-O3`，禁用 `boundscheck` |
| **纯Python回退** | C扩展不可用时提供Python实现 |
| **CI 测试** | 同时测试C扩展和Python回退 |
| **内存视图** | Cython 优先用 `double[:]` 而非 NumPy 数组 |
| **pybind11 推荐** | C++ 项目首选 pybind11，比手动 C API 简单10倍 |
| **ABI vs API** | cffi ABI模式无需编译，API模式更快更安全 |
| **调试** | 编译时加 `-g -O0`，运行时用 `PYTHONFAULTHANDLER=1` |