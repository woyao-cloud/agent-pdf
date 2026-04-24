# 第37章 性能分析与Profiling

## 1. 概念与语法

### 1.1 性能分析层次

```
┌──────────────────────────────────────────────────┐
│              性能分析金字塔                        │
├──────────────────────────────────────────────────┤
│                                                  │
│    ┌─────────────────┐                          │
│    │  火焰图/可视化    │  宏观瓶颈定位             │
│    ├─────────────────┤                          │
│    │  line_profiler   │  逐行热点分析             │
│    ├─────────────────┤                          │
│    │  cProfile        │  函数级时间分布           │
│    ├─────────────────┤                          │
│    │  timeit          │  微基准测试               │
│    ├─────────────────┤                          │
│    │  memory_profiler │  内存热点分析             │
│    ├─────────────────┤                          │
│    │  sys/psutil     │  系统级监控               │
│    └─────────────────┘                          │
│                                                  │
│    原则: 先宏观后微观，先时间后内存                 │
└──────────────────────────────────────────────────┘
```

### 1.2 核心 API 速查

```python
# --- timeit: 微基准测试 ---
import timeit
timeit.timeit('sum(range(100))', number=10000)
timeit.repeat('sum(range(100))', number=10000, repeat=5)
timeit.timeit(stmt='func()', setup='from __main__ import func', number=1000)

# --- cProfile: 函数级性能分析 ---
import cProfile
cProfile.run('my_function()', sort='cumulative')

# 命令行使用:
# python -m cProfile -s cumulative myscript.py

# --- profile: 纯Python实现（比cProfile慢）---
import profile

# --- pstats: 分析结果处理 ---
import pstats
p = pstats.Stats('profile_output.prof')
p.sort_stats('cumulative').print_stats(20)
p.sort_stats('time').print_stats(10)

# --- tracemalloc: 内存追踪 ---
import tracemalloc
tracemalloc.start()
# ... 代码 ...
snapshot = tracemalloc.take_snapshot()
for stat in snapshot.statistics('lineno')[:10]:
    print(stat)
```

---

## 2. 原理与机制

### 2.1 timeit 原理

`timeit` 模块通过多次执行目标代码来减少测量误差：

```python
# timeit 的核心逻辑（简化自 Lib/timeit.py）
class Timer:
    def timeit(self, number=1000000):
        it = itertools.repeat(None, number)
        # 预热：执行一次以消除启动开销
        self.inner()
        # 正式计时
        start = time.perf_counter()
        for _ in it:
            self.inner()
        elapsed = time.perf_counter() - start
        return elapsed / number  # 返回每次平均时间

    def repeat(self, repeat=5, number=1000000):
        results = []
        for _ in range(repeat):
            t = self.timeit(number)
            results.append(t)
        return results
        # 取 min(results) 作为最终结果
        # 原因：其他进程的干扰只会让时间变长，不会变短

    def autorange(self):
        """自动选择合适的 number 使得总时间在 0.2-2.0 秒之间"""
        for i in range(1, 10):
            number = 10 ** i
            time = self.timeit(number)
            if time >= 0.2:
                return number, time
        return number, time
```

**timeit 注意事项**：
- 默认禁用 GC（`timer = Timer(..., globals=globals())`，内部 `gc.disable()`）
- 使用 `time.perf_counter()` 而非 `time.time()`（更高精度）
- 只测量 CPU 时间，不包含 I/O 等待
- 默认在独立命名空间中执行，需要通过 `setup` 或 `globals` 传入变量

### 2.2 cProfile 原理

cProfile 通过在函数调用前后插入钩子来收集性能数据：

```c
// Modules/_lsprof.c — cProfile 的 C 实现（简化）
// cProfile 基于 _lsprof 模块，使用 C 实现的低开销探针

// 核心数据结构
typedef struct {
    PyObject_HEAD
    ProfilerEntry *entries;     // 函数条目数组
    int total_entries;           // 条目总数
    double starttime;           // 起始时间
    double cumulative_time;     // 累计时间
} ProfilerObject;

// 每个函数调用记录:
// - ncalls: 调用次数
// - tottime: 函数自身耗时（不含子函数）
// - cumtime: 函数总耗时（含子函数）
// - callers: 调用此函数的上层函数

// 探针开销: 约为每个函数调用增加 1-5 微秒
```

**cProfile 输出解读**：

```
         6 function calls in 0.000 seconds

   ncalls  tottime  cumtime  percall  filename:lineno(function)
        1    0.000    0.001    0.001  myscript.py:10(main)
        1    0.001    0.001    0.001  myscript.py:5(process)
        4    0.000    0.000    0.000  myscript.py:1(helper)
```

| 字段 | 含义 |
|------|------|
| ncalls | 调用次数（含递归则为 tottime/percall） |
| tottime | 函数自身耗时（不含子函数调用） |
| cumtime | 函数总耗时（含子函数调用） |
| percall | cumtime / ncalls |

### 2.3 line_profiler 原理

line_profiler 通过在每行代码前插入计时代码来收集逐行性能数据：

```python
# line_profiler 工作原理：
# 1. 装饰 @profile 标记的函数
# 2. 使用 ast 模块重写函数，在每行前插入计时代码
# 3. 记录每行的执行次数和总时间

# 原始代码：
@profile
def process(data):
    result = []
    for item in data:
        result.append(item * 2)
    return result

# line_profiler 内部转换后（概念）：
@profile
def process(data):
    _line_profiler.line_enter(2)  # line 2
    result = []
    _line_profiler.line_exit(2)
    for item in data:
        _line_profiler.line_enter(3)  # line 3
        result.append(item * 2)
        _line_profiler.line_exit(3)
    _line_profiler.line_enter(4)  # line 4
    return result
    _line_profiler.line_exit(4)
```

### 2.4 memory_profiler 原理

memory_profiler 通过定期采样进程的内存使用来追踪内存变化：

```python
# memory_profiler 工作原理：
# 1. 使用 ast 模块在每行代码前插入内存采样
# 2. 通过 psutil.Process().memory_info() 获取当前内存
# 3. 计算每行的内存增量

# 采样代码（概念）：
import psutil
import os

process = psutil.Process(os.getpid())

def sample_memory():
    return process.memory_info().rss  # Resident Set Size

# 在每行代码前后采样，计算差值
mem_before = sample_memory()
# ... 代码行 ...
mem_after = sample_memory()
mem_diff = mem_after - mem_before
```

### 2.5 py-spy 原理

py-spy 是一个采样分析器，不修改目标程序代码：

```
py-spy 工作原理：
1. 以独立进程运行，通过 ptrace/ReadProcessMemory 读取目标进程内存
2. 定期采样（默认100次/秒）
3. 读取 Python 解释器的帧数据结构
4. 统计每帧出现在采样中的比例 = 该函数的CPU占比

优势：
- 零代码修改
- 零性能开销（约1-5%）
- 支持正在运行的生产环境程序
- 可以生成火焰图

核心数据结构（从目标进程读取）:
PyInterpreterState → PyThreadState → PyFrameObject → code, locals
```

### 2.6 火焰图原理

```
火焰图（Flame Graph）：
- X轴: 采样比例（函数占用的CPU时间）
- Y轴: 调用栈深度
- 每个矩形: 一个函数调用
- 宽度: 该函数在采样中出现的频率

          ┌──────────────────────────────────┐
          │           main()                │
          ├──────────────┬───────────────────┤
          │  process()   │    analyze()      │
          ├──────┬───────┼──────┬────────────┤
          │read()│parse() │calc()│  sort()    │
          ├──────┤───────┤──────┤─────┬──────┤
          │open()│token()│eval()│cmp()│swap() │
          └──────┴───────┴──────┴─────┴──────┘

解读:
- 宽矩形 = 热点函数（消耗更多CPU时间）
- 平顶 = 没有子函数调用的叶子函数
- 关注最宽的矩形 = 性能瓶颈
```

---

## 3. 使用场景

### 3.1 场景一：快速定位 CPU 热点

使用 cProfile 找到耗时最多的函数，再用 line_profiler 精确定位热点行。

### 3.2 场景二：内存泄漏追踪

使用 memory_profiler 或 tracemalloc 找到内存持续增长的位置。

### 3.3 场景三：生产环境性能监控

使用 py-spy 对运行中的服务进行非侵入式性能分析。

### 3.4 场景四：微基准测试与算法对比

使用 timeit 精确对比不同实现的性能差异。

---

## 4. 示例代码

### 4.1 timeit 微基准测试

```python
"""
timeit 微基准测试最佳实践
包括自动范围选择、统计分析和常见陷阱
"""
import timeit
import statistics


def timeit_best(stmt, setup='', number=None, repeat=7, globals_dict=None):
    """
    改进的 timeit 测量函数
    自动选择 number，返回统计分析结果
    """
    timer = timeit.Timer(stmt, setup=setup,
                          globals=globals_dict or globals())

    # 自动确定合适的 number
    if number is None:
        number, _ = timer.autorange()

    # 多次测量
    times = timer.repeat(repeat=repeat, number=number)

    # 统计分析
    best = min(times)
    mean = statistics.mean(times)
    stdev = statistics.stdev(times) if len(times) > 1 else 0

    return {
        'best': best,
        'mean': mean,
        'stdev': stdev,
        'number': number,
        'per_call_us': (best / number) * 1e6,
        'times': times,
    }


def compare_implementations():
    """对比不同实现的性能"""
    print("=== 微基准测试：不同实现对比 ===\n")

    setups = {
        'list_comprehension': {
            'stmt': '[x**2 for x in range(1000)]',
            'setup': '',
        },
        'map_function': {
            'stmt': 'list(map(lambda x: x**2, range(1000)))',
            'setup': '',
        },
        'generator_list': {
            'stmt': 'list(x**2 for x in range(1000))',
            'setup': '',
        },
        'numpy_array': {
            'stmt': 'np.arange(1000) ** 2',
            'setup': 'import numpy as np',
        },
    }

    print(f"{'实现':<25} {'最优(μs)':>10} {'平均(μs)':>10} {'标准差(μs)':>10}")
    print("-" * 60)

    for name, config in setups.items():
        result = timeit_best(
            stmt=config['stmt'],
            setup=config['setup'],
        )
        print(f"{name:<25} "
              f"{result['per_call_us']:>10.2f} "
              f"{result['mean']/result['number']*1e6:>10.2f} "
              f"{result['stdev']/result['number']*1e6:>10.2f}")


def timeit_pitfalls():
    """timeit 的常见陷阱"""
    print("\n\n=== timeit 常见陷阱 ===\n")

    # 陷阱1: 忘记禁用GC的影响
    print("陷阱1: GC 对测量结果的影响")
    import gc

    stmt = 'sum(range(10000))'

    gc.disable()
    t_no_gc = timeit.timeit(stmt, number=10000)
    gc.enable()

    t_with_gc = timeit.timeit(stmt, number=10000)

    print(f"  禁用GC: {t_no_gc*1000:.2f}ms")
    print(f"  启用GC: {t_with_gc*1000:.2f}ms")
    print(f"  GC开销: {(t_with_gc-t_no_gc)*1000:.2f}ms")

    # 陷阱2: 缓存效应
    print("\n陷阱2: 缓存效应（第一次运行 vs 后续运行）")
    times = timeit.repeat('sorted(list(range(10000)))',
                         number=100, repeat=10)
    print(f"  第一次: {times[0]*10:.3f}ms")
    print(f"  最佳:   {min(times)*10:.3f}ms")
    print(f"  最差:   {max(times)*10:.3f}ms")
    print("  注意: 取 min 而非 mean，因为干扰只会让时间变长")

    # 陷阱3: 常量折叠
    print("\n陷阱3: Python 可能预计算常量表达式")
    print("  '2 ** 100' 在编译期就被计算")
    print("  确保测试的代码确实在运行时执行")


if __name__ == '__main__':
    compare_implementations()
    timeit_pitfalls()
```

### 4.2 cProfile 深度实践

```python
"""
cProfile 深度实践
包括程序化控制、结果过滤、对比分析
"""
import cProfile
import pstats
import io
import time
from contextlib import contextmanager


# ===== 1. 待分析的目标代码 =====

def compute_primes(n):
    """计算质数 — 故意使用低效算法"""
    primes = []
    for num in range(2, n):
        is_prime = True
        for i in range(2, int(num ** 0.5) + 1):
            if num % i == 0:
                is_prime = False
                break
        if is_prime:
            primes.append(num)
    return primes


def process_data(data):
    """处理数据"""
    result = []
    for item in data:
        # 调用多个子函数
        validated = validate(item)
        transformed = transform(validated)
        result.append(transformed)
    return result


def validate(item):
    """验证数据"""
    time.sleep(0.001)  # 模拟IO
    return item > 0


def transform(item):
    """转换数据"""
    return item ** 2 + item * 3 + 1


def main_task():
    """主任务"""
    primes = compute_primes(10000)
    data = list(range(1000))
    result = process_data(data)
    return len(result)


# ===== 2. 程序化 cProfile 使用 =====

def profile_basic():
    """基本 cProfile 使用"""
    print("=== cProfile 基本使用 ===\n")

    profiler = cProfile.Profile()
    profiler.enable()

    main_task()

    profiler.disable()

    # 打印统计信息
    profiler.print_stats(sort='cumulative')


def profile_advanced():
    """高级 cProfile 使用：过滤和排序"""
    print("\n\n=== cProfile 高级使用 ===\n")

    profiler = cProfile.Profile()
    profiler.enable()

    main_task()

    profiler.disable()

    # 使用 pstats 进行详细分析
    stats = pstats.Stats(profiler)

    # 按累计时间排序
    print("--- 按累计时间排序 TOP 10 ---")
    stats.sort_stats('cumulative').print_stats(10)

    # 按自身时间排序
    print("\n--- 按自身时间排序 TOP 10 ---")
    stats.sort_stats('time').print_stats(10)

    # 只看特定文件/函数
    print("\n--- 只看当前文件的函数 ---")
    stats.sort_stats('cumulative').print_stats('__main__')

    # 查看调用关系
    print("\n--- 调用关系 ---")
    stats.print_callers('transform')


@contextmanager
def profile_context(name="profile_output", sort_by='cumulative', limit=20):
    """上下文管理器风格的性能分析"""
    profiler = cProfile.Profile()
    profiler.enable()
    yield profiler
    profiler.disable()

    stats = pstats.Stats(profiler)
    stats.sort_stats(sort_by)
    print(f"\n=== {name} 性能分析 TOP {limit} ===")
    stats.print_stats(limit)


def profile_with_context():
    """使用上下文管理器进行性能分析"""
    print("\n\n=== 上下文管理器风格分析 ===\n")

    with profile_context("主任务", sort_by='time', limit=15):
        main_task()


def profile_comparison():
    """性能对比分析"""
    print("\n\n=== 性能对比分析 ===\n")

    # 方案1: 低效算法
    p1 = cProfile.Profile()
    p1.enable()
    compute_primes(10000)
    p1.disable()

    # 方案2: 使用筛法
    def sieve_primes(n):
        sieve = [True] * (n + 1)
        sieve[0] = sieve[1] = False
        for i in range(2, int(n ** 0.5) + 1):
            if sieve[i]:
                for j in range(i*i, n+1, i):
                    sieve[j] = False
        return [i for i, is_p in enumerate(sieve) if is_p]

    p2 = cProfile.Profile()
    p2.enable()
    sieve_primes(10000)
    p2.disable()

    # 对比
    s1 = pstats.Stats(p1)
    s2 = pstats.Stats(p2)

    print("方案1 (低效):")
    s1.print_stats('compute_primes')

    print("\n方案2 (筛法):")
    s2.print_stats('sieve_primes')


if __name__ == '__main__':
    profile_basic()
    profile_advanced()
    profile_with_context()
    profile_comparison()
```

### 4.3 line_profiler 逐行分析

```python
"""
line_profiler 逐行性能分析
需要安装: pip install line_profiler
运行方式:
  1. kernprof -l -v script.py
  2. 或程序化使用（如下）
"""
import time


# ===== 待分析的函数 =====

def process_large_dataset(data):
    """模拟数据处理管道"""
    result = []
    for item in data:
        # 步骤1: 验证
        if item < 0:
            continue
        # 步骤2: 计算
        value = item ** 2
        # 步骤3: 过滤
        if value > 1000:
            continue
        # 步骤4: 格式化
        result.append(f"value_{value}")
    return result


def process_large_dataset_optimized(data):
    """优化后的版本"""
    # 使用列表推导，减少函数调用开销
    return [f"value_{v}" for v in (x**2 for x in data if x >= 0) if v <= 1000]


# ===== 程序化使用 line_profiler =====

def run_line_profiler():
    """程序化使用 line_profiler"""
    from line_profiler import LineProfiler

    # 创建 profiler
    lp = LineProfiler()

    # 添加要分析的函数
    lp.add_wrapper(process_large_dataset)
    lp.add_wrapper(process_large_dataset_optimized)

    # 也可以用装饰器方式
    # lp = LineProfiler(process_large_dataset, process_large_dataset_optimized)

    # 准备数据
    data = list(range(100000))

    # 运行分析
    lp.runctx('process_large_dataset(data)', globals(), {'data': data})

    # 打印结果
    lp.print_stats()

    # 再次分析优化版本
    lp2 = LineProfiler(process_large_dataset_optimized)
    lp2.runctx('process_large_dataset_optimized(data)',
               globals(), {'data': data})
    lp2.print_stats()


# ===== 手动逐行计时（不依赖 line_profiler）=====

def manual_line_profiler():
    """手动逐行计时 — 不需要额外安装"""
    import time

    data = list(range(100000))
    timings = {}

    # 逐行计时
    start = time.perf_counter()
    result = []
    timings['init'] = time.perf_counter() - start

    start = time.perf_counter()
    for item in data:
        timings['loop_setup'] = timings.get('loop_setup', 0)
        t_loop = time.perf_counter()

        if item < 0:
            timings['validate'] = timings.get('validate', 0) + (time.perf_counter() - t_loop)
            continue

        t_calc = time.perf_counter()
        value = item ** 2
        timings['calculate'] = timings.get('calculate', 0) + (time.perf_counter() - t_calc)

        t_filter = time.perf_counter()
        if value > 1000:
            timings['filter'] = timings.get('filter', 0) + (time.perf_counter() - t_filter)
            continue

        t_append = time.perf_counter()
        result.append(f"value_{value}")
        timings['append'] = timings.get('append', 0) + (time.perf_counter() - t_append)

    total = sum(timings.values())
    print("=== 手动逐行计时结果 ===")
    print(f"{'操作':<20} {'时间(ms)':>10} {'占比':>8}")
    print("-" * 40)
    for name, t in sorted(timings.items(), key=lambda x: x[1], reverse=True):
        print(f"{name:<20} {t*1000:>10.2f} {t/total*100:>7.1f}%")


if __name__ == '__main__':
    try:
        run_line_profiler()
    except ImportError:
        print("line_profiler 未安装，使用手动逐行计时")
        manual_line_profiler()
        print("\n安装 line_profiler: pip install line_profiler")
        print("使用方式: kernprof -l -v script.py")
    manual_line_profiler()
```

### 4.4 memory_profiler 内存分析

```python
"""
memory_profiler 内存使用分析
需要安装: pip install memory-profiler psutil
运行方式: python -m memory_profiler script.py
"""
import time


# ===== 待分析的内存密集型代码 =====

def memory_intensive_task():
    """模拟内存密集型任务"""
    # 阶段1: 创建大列表
    data1 = [i ** 2 for i in range(1000000)]
    # 阶段2: 创建字典
    data2 = {i: i ** 2 for i in range(100000)}
    # 阶段3: 创建集合
    data3 = set(range(100000))
    # 阶段4: 处理并释放
    result = sum(data1[:10000])
    del data1
    # 阶段5: 返回
    return result


def memory_efficient_task():
    """内存高效版本"""
    # 使用生成器，避免一次性创建大列表
    result = sum(i ** 2 for i in range(10000))
    return result


# ===== 手动内存追踪（不依赖 memory_profiler）=====

def manual_memory_profile():
    """手动内存追踪"""
    import tracemalloc
    import gc

    tracemalloc.start()

    # 基准快照
    gc.collect()
    baseline = tracemalloc.take_snapshot()

    # 执行代码
    result = memory_intensive_task()

    # 执行后快照
    gc.collect()
    after = tracemalloc.take_snapshot()

    # 分析差异
    print("=== 内存分配差异 ===\n")
    stats = after.compare_to(baseline, 'lineno')
    for stat in stats[:10]:
        print(stat)

    # 按文件分组
    print("\n=== 按文件分组 ===\n")
    file_stats = after.compare_to(baseline, 'filename')
    for stat in file_stats[:5]:
        print(stat)

    tracemalloc.stop()
    return result


# ===== 内存使用时间线 =====

def memory_timeline():
    """记录内存使用时间线"""
    import tracemalloc
    import gc

    tracemalloc.start()
    snapshots = []

    def take_snapshot(label):
        gc.collect()
        snapshots.append((label, tracemalloc.take_snapshot()))

    take_snapshot("开始")

    # 阶段1: 创建数据
    data1 = [i ** 2 for i in range(500000)]
    take_snapshot("创建大列表")

    # 阶段2: 创建字典
    data2 = {i: i ** 2 for i in range(100000)}
    take_snapshot("创建大字典")

    # 阶段3: 创建集合
    data3 = set(range(100000))
    take_snapshot("创建大集合")

    # 阶段4: 部分释放
    del data1
    gc.collect()
    take_snapshot("释放列表")

    # 阶段5: 更多释放
    del data2
    gc.collect()
    take_snapshot("释放字典")

    # 打印内存变化
    print("=== 内存使用时间线 ===\n")
    current = snapshots[0][1]
    print(f"{'阶段':<15} {'当前内存':>12} {'增量':>12}")
    print("-" * 42)
    for i, (label, snap) in enumerate(snapshots):
        current_mb = sum(s.size for s in snap.statistics('filename')) / 1024 / 1024
        if i == 0:
            delta_mb = 0
        else:
            delta = snap.compare_to(snapshots[i-1][1], 'filename')
            delta_mb = sum(s.size_diff for s in delta) / 1024 / 1024
        print(f"{label:<15} {current_mb:>10.2f} MB {delta_mb:>+10.2f} MB")

    tracemalloc.stop()


# ===== 程序化使用 memory_profiler =====

def run_memory_profiler_programmatic():
    """程序化使用 memory_profiler"""
    try:
        from memory_profiler import profile, memory_usage

        # 方法1: 装饰器
        @profile
        def profiled_task():
            return memory_intensive_task()

        # 方法2: memory_usage 函数
        mem_usage = memory_usage((memory_intensive_task, (), {}),
                                  interval=0.01,
                                  timeout=30)
        print(f"\n内存使用峰值: {max(mem_usage):.1f} MiB")
        print(f"内存使用均值: {sum(mem_usage)/len(mem_usage):.1f} MiB")

    except ImportError:
        print("memory_profiler 未安装")
        print("安装: pip install memory-profiler psutil")
        print("使用: python -m memory_profiler script.py")


if __name__ == '__main__':
    print("=== 手动内存追踪 ===\n")
    manual_memory_profile()

    print("\n\n=== 内存使用时间线 ===\n")
    memory_timeline()

    print("\n\n=== memory_profiler ===\n")
    run_memory_profiler_programmatic()
```

### 4.5 py-spy 与火焰图

```python
"""
py-spy 使用指南
需要安装: pip install py-spy
注意: py-spy 是命令行工具，不是 Python 模块

常见用法:
1. 实时监控: py-spy top --pid <PID>
2. 生成火焰图: py-spy record --pid <PID> -o flamegraph.svg
3. 快速dump: py-spy dump --pid <PID>
4. 分析脚本: py-spy record python myscript.py -o profile.svg

火焰图生成和分析
"""
import subprocess
import sys
import time


def generate_sample_flamegraph_data():
    """
    生成火焰图数据（folded stack format）
    如果安装了 py-spy，可以直接用它生成 SVG
    """
    # 模拟 folded stack 格式数据
    # 格式: "stack_frame;stack_frame;... count"
    folded_data = """
main;process_data;validate 45
main;process_data;transform 30
main;process_data;transform;calculate 120
main;compute_primes;check_prime 80
main;compute_primes;check_prime;modulo 60
main;compute_primes;sieve 200
main;io_operation;read_file 50
main;io_operation;parse_json 35
main;io_operation;write_output 25
"""
    return folded_data.strip()


def create_flamegraph_html(folded_data, title="Python 火焰图"):
    """
    创建一个简单的HTML火焰图可视化
    使用纯HTML/CSS/JS，不依赖外部工具
    """
    # 解析 folded stack 数据
    stacks = []
    max_depth = 0
    total_count = 0

    for line in folded_data.strip().split('\n'):
        if not line.strip():
            continue
        parts = line.rsplit(' ', 1)
        if len(parts) == 2:
            frames = parts[0].split(';')
            count = int(parts[1])
            stacks.append((frames, count))
            max_depth = max(max_depth, len(frames))
            total_count += count

    # 生成HTML
    html = f"""<!DOCTYPE html>
<html>
<head>
<title>{title}</title>
<style>
  body {{ font-family: monospace; margin: 0; }}
  .flame {{ 
    display: flex; flex-direction: column-reverse;
    width: 100%; height: {max_depth * 24 + 30}px;
  }}
  .frame {{
    height: 22px; margin: 1px; padding: 0 4px;
    overflow: hidden; white-space: nowrap;
    text-overflow: ellipsis; cursor: pointer;
    border: 1px solid #999;
    font-size: 12px; line-height: 22px;
  }}
  .frame:hover {{ border-color: #000; font-weight: bold; }}
  .depth-0 {{ background-color: #ff6666; }}
  .depth-1 {{ background-color: #ff9966; }}
  .depth-2 {{ background-color: #ffcc66; }}
  .depth-3 {{ background-color: #99cc66; }}
  .depth-4 {{ background-color: #66cccc; }}
  .depth-5 {{ background-color: #6699cc; }}
  .depth-6 {{ background-color: #9966cc; }}
  .depth-7 {{ background-color: #cc66cc; }}
</style>
</head>
<body>
<h2>{title}</h2>
<p>Total samples: {total_count}</p>
<div class="flame">
"""
    # 为每个stack生成frame
    y_pos = {}
    for frames, count in stacks:
        width_pct = (count / total_count) * 100
        for depth, frame_name in enumerate(frames):
            key = (depth, frame_name)
            if key not in y_pos:
                y_pos[key] = {'width': 0, 'name': frame_name}
            y_pos[key]['width'] += width_pct

    for (depth, name), info in sorted(y_pos.items()):
        html += f"""
  <div class="frame depth-{depth % 8}" 
       style="width: {info['width']:.1f}%; order: {depth};"
       title="{name} ({info['width']:.1f}%)">
    {name} ({info['width']:.1f}%)
  </div>"""

    html += """
</div>
</body>
</html>"""
    return html


def py_spy_guide():
    """py-spy 使用指南"""
    guide = """
=== py-spy 使用指南 ===

1. 安装:
   pip install py-spy

2. 实时监控运行中的Python程序:
   py-spy top --pid <PID>

3. 生成火焰图:
   py-spy record --pid <PID> -o flamegraph.svg
   py-spy record --duration 30 --pid <PID> -o profile.svg

4. 分析脚本执行:
   py-spy record -- python myscript.py
   py-spy record --output profile.svg -- python myscript.py

5. 快速dump当前调用栈:
   py-spy dump --pid <PID>

6. 生成报告:
   py-spy report --pid <PID>

7. 常用参数:
   --rate      采样频率 (默认100)
   --duration  记录时长 (秒)
   --format    输出格式: flamegraph|speedscope|raw
   --subprocesses  同时监控子进程

注意事项:
- Linux/Mac: 可能需要 sudo 或设置 ptrace 权限
- Windows: 需要管理员权限
- 对目标程序的性能影响约 1-5%
"""
    print(guide)


if __name__ == '__main__':
    # 生成示例火焰图
    folded_data = generate_sample_flamegraph_data()
    html = create_flamegraph_html(folded_data, title="Python 性能分析火焰图")

    output_file = "flamegraph_sample.html"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"火焰图已保存到: {output_file}")
    print("用浏览器打开查看交互式火焰图\n")

    # 打印 py-spy 指南
    py_spy_guide()
```

### 4.6 综合性能分析工具

```python
"""
综合性能分析工具类
整合 timeit、cProfile、tracemalloc 的使用
"""
import time
import cProfile
import pstats
import io
import tracemalloc
import gc
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import List, Optional, Callable


@dataclass
class ProfileResult:
    """性能分析结果"""
    name: str
    wall_time: float = 0.0          # 实际耗时(秒)
    cpu_time: float = 0.0           # CPU耗时(秒)
    memory_peak: int = 0             # 内存峰值(字节)
    memory_delta: int = 0            # 内存增量(字节)
    call_count: int = 0              # 函数调用次数
    cprofile_stats: Optional[str] = None


class Profiler:
    """综合性能分析器"""

    def __init__(self, name: str = "profile"):
        self.name = name
        self.results: List[ProfileResult] = []

    @contextmanager
    def measure(self, name: str, profile_cpu=False, profile_memory=False):
        """上下文管理器方式的性能测量"""
        result = ProfileResult(name=name)

        # 内存追踪
        if profile_memory:
            tracemalloc.start()
            gc.collect()
            snapshot_before = tracemalloc.take_snapshot()

        # CPU profiling
        profiler = None
        if profile_cpu:
            profiler = cProfile.Profile()
            profiler.enable()

        # 计时
        start_wall = time.perf_counter()
        start_cpu = time.process_time()

        yield result

        # 计时结束
        end_wall = time.perf_counter()
        end_cpu = time.process_time()
        result.wall_time = end_wall - start_wall
        result.cpu_time = end_cpu - start_cpu

        # CPU profiling 结果
        if profiler:
            profiler.disable()
            s = io.StringIO()
            ps = pstats.Stats(profiler, stream=s)
            ps.sort_stats('cumulative')
            ps.print_stats(20)
            result.cprofile_stats = s.getvalue()

        # 内存追踪结果
        if profile_memory:
            snapshot_after = tracemalloc.take_snapshot()
            current, peak = tracemalloc.get_traced_memory()
            result.memory_peak = peak
            result.memory_delta = current

            # 内存差异详情
            top_stats = snapshot_after.compare_to(snapshot_before, 'lineno')
            if result.cprofile_stats is None:
                result.cprofile_stats = ""
            result.cprofile_stats += "\n=== 内存热点 TOP 5 ===\n"
            for stat in top_stats[:5]:
                result.cprofile_stats += f"  {stat}\n"

            tracemalloc.stop()

        self.results.append(result)

    def compare(self, baseline: str = None):
        """对比分析结果"""
        if len(self.results) < 2:
            print("需要至少2个测量结果才能对比")
            return

        print(f"\n{'='*70}")
        print(f"性能对比: {self.name}")
        print(f"{'='*70}")
        print(f"{'名称':<20} {'耗时(ms)':>10} {'CPU(ms)':>10} "
              f"{'内存峰值(MB)':>14} {'内存增量(KB)':>14}")
        print("-" * 70)

        baseline_result = None
        for result in self.results:
            if result.name == baseline:
                baseline_result = result

            mem_peak_mb = result.memory_peak / 1024 / 1024
            mem_delta_kb = result.memory_delta / 1024
            print(f"{result.name:<20} "
                  f"{result.wall_time*1000:>10.2f} "
                  f"{result.cpu_time*1000:>10.2f} "
                  f"{mem_peak_mb:>12.2f} "
                  f"{mem_delta_kb:>12.2f}")

        if baseline_result:
            print(f"\n相对于 '{baseline}' 的加速比:")
            for result in self.results:
                if result.name != baseline:
                    speedup = baseline_result.wall_time / result.wall_time
                    print(f"  {result.name}: {speedup:.2f}x")

    def print_details(self, index: int = -1):
        """打印详细分析结果"""
        if not self.results:
            print("无分析结果")
            return

        result = self.results[index]
        print(f"\n{'='*50}")
        print(f"详细分析: {result.name}")
        print(f"{'='*50}")
        print(f"实际耗时: {result.wall_time*1000:.2f} ms")
        print(f"CPU耗时:   {result.cpu_time*1000:.2f} ms")
        print(f"内存峰值: {result.memory_peak/1024/1024:.2f} MB")
        print(f"内存增量: {result.memory_delta/1024:.2f} KB")

        if result.cprofile_stats:
            print(f"\n{result.cprofile_stats}")


# ===== 使用示例 =====

def demo_profiler():
    """综合性能分析演示"""
    profiler = Profiler("数据处理对比")

    # 方案1: 低效实现
    with profiler.measure("列表推导", profile_cpu=True, profile_memory=True):
        result = [x ** 2 for x in range(100000)]

    # 方案2: 生成器
    with profiler.measure("生成器表达式", profile_cpu=True, profile_memory=True):
        result = sum(x ** 2 for x in range(100000))

    # 方案3: map
    with profiler.measure("map函数", profile_cpu=True, profile_memory=True):
        result = sum(map(lambda x: x ** 2, range(100000)))

    # 方案4: NumPy
    try:
        import numpy as np
        with profiler.measure("NumPy", profile_cpu=True, profile_memory=True):
            result = np.sum(np.arange(100000) ** 2)
    except ImportError:
        pass

    # 对比结果
    profiler.compare(baseline="列表推导")

    # 查看详细结果
    profiler.print_details(0)


if __name__ == '__main__':
    demo_profiler()
```

---

## 5. 常见陷阱与最佳实践

### 5.1 陷阱：测量偏差

```python
# 错误：测量未隔离的代码
import time

start = time.time()
# ... 包含IO操作的代码 ...
elapsed = time.time() - start
# IO等待时间也被计入，误导性强！

# 正确：区分CPU时间和实际时间
start_cpu = time.process_time()  # 只计CPU时间
start_wall = time.perf_counter()  # 实际经过时间
# ... 代码 ...
cpu_time = time.process_time() - start_cpu
wall_time = time.perf_counter() - start_wall
io_time = wall_time - cpu_time  # IO等待时间

print(f"CPU: {cpu_time*1000:.2f}ms, Wall: {wall_time*1000:.2f}ms, IO: {io_time*1000:.2f}ms")

# 错误：只测量一次
t = time.perf_counter()
my_function()
elapsed = time.perf_counter() - t  # 可能有噪声

# 正确：多次测量取最小值
times = [time.perf_counter() for _ in range(2)]
for i in range(100):
    my_function()
times.append(time.perf_counter())
elapsed = min(t2 - t1 for t1, t2 in zip(times, times[1:])) / 100
```

### 5.2 陷阱：cProfile 开销

```python
# cProfile 会增加约 5-10% 的额外开销
# 对于非常快速的函数，开销比例可能很高

# 错误：用cProfile分析微操作
import cProfile
cProfile.run('sum(range(1000))')
# cProfile的开销可能比操作本身还大！

# 正确：微操作用 timeit，函数级分析用 cProfile
import timeit
timeit.timeit('sum(range(1000))', number=10000)

# cProfile 适合分析：
# - 函数调用关系
# - 哪个函数消耗了最多时间
# - 调用次数是否异常
# 不适合分析：
# - 单行代码的性能
# - 微秒级操作
```

### 5.3 陷阱：内存测量的时机

```python
# 错误：在GC前测量内存
import tracemalloc

tracemalloc.start()
data = [i ** 2 for i in range(100000)]
snapshot = tracemalloc.take_snapshot()  # 可能包含未回收的对象！

# 正确：在GC后测量
import gc

tracemalloc.start()
data = [i ** 2 for i in range(100000)]
gc.collect()  # 先回收垃圾对象
snapshot = tracemalloc.take_snapshot()

# 错误：混淆进程内存和Python对象内存
import psutil
process = psutil.Process()
print(process.memory_info().rss)  # 包含Python未释放给OS的内存

# Python可能已释放对象，但pymalloc保留了arena
# 导致RSS > 实际Python对象内存
```

### 5.4 陷阱：过度优化微基准测试

```python
# 错误：微基准测试与实际场景不一致
# timeit 在隔离环境中运行，可能触发不同的优化路径

# 例如：小列表 vs 大列表的排序性能可能不同
import timeit

# 小列表：Python可能使用不同的排序策略
t1 = timeit.timeit('sorted([1,2,3])', number=100000)

# 大列表：Timsort的实际性能特征
t2 = timeit.timeit('sorted(range(10000))', number=100)

# 正确：使用接近实际的数据规模
realistic_data = generate_realistic_dataset()
timer = timeit.Timer('func(data)', globals={'func': my_func, 'data': realistic_data})
```

### 5.5 最佳实践总结

| 实践 | 工具 | 场景 |
|------|------|------|
| **微基准测试** | timeit | 对比单行/单函数实现 |
| **函数级热点定位** | cProfile | 找到最耗时的函数 |
| **逐行分析** | line_profiler | 定位函数内的热点行 |
| **内存追踪** | tracemalloc | 定位内存分配来源 |
| **内存时间线** | memory_profiler | 观察内存增长趋势 |
| **生产环境分析** | py-spy | 不修改代码分析运行中程序 |
| **可视化** | 火焰图 | 直观展示调用栈和时间分布 |
| **先测量后优化** | 所有工具 | 永远不要凭直觉优化 |
| **区分CPU/IO** | process_time vs perf_counter | CPU密集型 vs IO密集型 |
| **控制变量** | 多次运行取min | 减少系统噪声影响 |