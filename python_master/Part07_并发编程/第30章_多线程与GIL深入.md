# 第30章 多线程与GIL深入

## 1. 概念与语法

### 1.1 threading 模块概览

Python 的 `threading` 模块构建于底层 `_thread` 模块之上，提供了更高级的线程管理接口：

```
threading 模块层次结构:
┌──────────────────────────────────────────────┐
│              threading (高级API)               │
│  Thread, RLock, Condition, Event, Semaphore   │
│  Barrier, Timer, local, active_count()        │
├──────────────────────────────────────────────┤
│              _thread (低级API)                 │
│  start_new_thread(), allocate_lock()          │
│  exit(), interrupt_main()                     │
├──────────────────────────────────────────────┤
│            OS Thread API                      │
│  pthread_create (Linux) / CreateThread (Win) │
└──────────────────────────────────────────────┘
```

### 1.2 Thread 对象

```python
import threading

# 方式1：传入目标函数
t = threading.Thread(
    target=function,     # 目标函数
    args=(arg1,),        # 位置参数(元组)
    kwargs={'key': 'val'},  # 关键字参数
    name='MyThread',     # 线程名称
    daemon=False,        # 是否为守护线程
    group=None,          # 保留参数，暂未实现
)

# 方式2：继承Thread类
class MyThread(threading.Thread):
    def __init__(self, value):
        super().__init__(name=f"MyThread-{value}")
        self.value = value
        self.result = None
    
    def run(self):
        """线程启动时执行的方法"""
        self.result = self.value * 2

t = MyThread(42)
t.start()       # 启动线程，调用run()
t.join()         # 等待线程完成
print(t.result)  # 84
```

### 1.3 线程同步原语

```python
import threading

# ─── Lock (互斥锁) ───
lock = threading.Lock()
with lock:              # 推荐：上下文管理器
    # 临界区代码
    pass

lock.acquire()          # 手动获取
try:
    pass                # 临界区
finally:
    lock.release()      # 手动释放

# ─── RLock (可重入锁) ───
rlock = threading.RLock()
with rlock:             # 同一线程可多次获取
    with rlock:         # 不会死锁
        pass

# ─── Event (事件) ───
event = threading.Event()
event.set()             # 设置标志
event.clear()           # 清除标志
event.is_set()          # 检查标志
event.wait(timeout=5)   # 等待标志被设置

# ─── Condition (条件变量) ───
cond = threading.Condition()
with cond:
    cond.wait()          # 等待通知
    cond.notify()        # 通知一个等待线程
    cond.notify_all()    # 通知所有等待线程

# ─── Semaphore (信号量) ───
sem = threading.Semaphore(3)  # 最多3个线程同时进入
with sem:
    pass

# ─── Barrier (屏障) ───
barrier = threading.Barrier(3)  # 3个线程同步点
barrier.wait()             # 等待所有线程到达
barrier.abort()            # 中止屏障

# ─── Timer (定时器) ───
timer = threading.Timer(5.0, function, args=[1])
timer.start()              # 5秒后执行
timer.cancel()             # 取消定时器
```

### 1.4 线程局部存储

```python
import threading

# threading.local() 为每个线程提供独立的命名空间
local_data = threading.local()

def worker():
    local_data.x = threading.current_thread().name
    print(f"{threading.current_thread().name}: x = {local_data.x}")

t1 = threading.Thread(target=worker, name="Thread-1")
t2 = threading.Thread(target=worker, name="Thread-2")
t1.start(); t2.start()
t1.join(); t2.join()
# Thread-1: x = Thread-1
# Thread-2: x = Thread-2  (每个线程看到不同的值)
```

---

## 2. 原理与机制

### 2.1 GIL 的 CPython 源码级分析

#### 2.1.1 GIL 的数据结构（Python 3.12+）

从 Python 3.12 开始，GIL 的实现从 `Python/ceval.c` 重构到 `Python/ceval_gil.c`：

```c
// Python/ceval_gil.c (Python 3.12+)
// GIL运行时状态结构
struct _gil_runtime_state {
    /* 微秒级的检查间隔 */
    unsigned long interval;
    
    /* GIL持有状态：1=被持有, 0=空闲 */
    _Py_atomic_int locked;
    
    /* GIL切换次数计数器 */
    unsigned long switch_number;
    
    /* 条件变量：等待GIL的线程在此休眠 */
    PyCOND_T cond;
    
    /* 互斥锁：保护GIL状态变更 */
    PyMUTEX_T mutex;
    
    /* 等待GIL的线程数量 */
    _Py_atomic_int waiters;
    
    /* 评估中断标志：
     * 非零表示有线程请求GIL或有待处理信号 */
    _Py_atomic_int eval_breaker;
};
```

#### 2.1.2 GIL 获取流程

当一个线程需要执行 Python 代码时，必须先获取 GIL：

```c
// Python/ceval_gil.c
static void
take_gil(PyThreadState *tstate)
{
    struct _gil_runtime_state *gil = &tstate->interp->ceval.gil;
    int drop_pending = 0;
    
    // 1. 如果当前线程已经持有GIL，直接返回（RLock语义）
    if (_Py_atomic_load_ptr_relaxed(&tstate->interp->ceval.current_thread) == tstate) {
        return;
    }
    
    // 2. 加锁保护GIL状态
    _Py_atomic_add_int(&gil->waiters, 1);
    PyMUTEX_LOCK(&gil->mutex);
    
    // 3. 等待GIL变为可用
    while (_Py_atomic_load_int(&gil->locked)) {
        // 3a. 设置eval_breaker标志，通知持有GIL的线程释放
        _Py_atomic_store_int(&gil->eval_breaker, 1);
        
        // 3b. 在条件变量上等待
        PyCOND_WAIT(&gil->cond, &gil->mutex);
    }
    
    // 4. 成功获取GIL
    _Py_atomic_store_int(&gil->locked, 1);
    _Py_atomic_store_ptr(&tstate->interp->ceval.current_thread, tstate);
    
    // 5. 减少等待者计数
    _Py_atomic_add_int(&gil->waiters, -1);
    
    // 6. 解锁
    PyMUTEX_UNLOCK(&gil->mutex);
    
    // 7. 更新操作系统级别的线程状态
    PyThread_update_threadstate(tstate, 1);
}
```

#### 2.1.3 GIL 释放流程

GIL 在以下情况被释放：

```c
// Python/ceval_gil.c
static void
drop_gil(PyThreadState *tstate)
{
    struct _gil_runtime_state *gil = &tstate->interp->ceval.gil;
    
    // 1. 加锁
    PyMUTEX_LOCK(&gil->mutex);
    
    // 2. 释放GIL
    _Py_atomic_store_int(&gil->locked, 0);
    _Py_atomic_store_ptr(&tstate->interp->ceval.current_thread, NULL);
    
    // 3. 如果有线程在等待GIL，唤醒它们
    if (_Py_atomic_load_int(&gil->waiters)) {
        PyCOND_SIGNAL(&gil->cond);
    }
    
    // 4. 解锁
    PyMUTEX_UNLOCK(&gil->mutex);
    
    // 5. 更新线程状态
    PyThread_update_threadstate(tstate, 0);
}
```

#### 2.1.4 解释器主循环中的 GIL 切换

Python 3.12+ 的评估循环中，GIL 切换基于**挂起计数 (suspend count)** 机制：

```c
// Python/ceval.c
PyObject *
_PyEval_EvalFrameDefault(PyThreadState *tstate, _PyInterpreterFrame *frame, int throwflag)
{
    // 挂起计数器，每执行一定数量字节码后检查GIL
    int16_t suspend_count = 0;
    
    // 主执行循环
    for (;;) {
        // ... 执行字节码指令 ...
        
        // 每执行一条指令，递增挂起计数
        suspend_count++;
        
        // 检查是否需要让出GIL
        if (suspend_count >= _Py_EVAL_SUSPEND_INTERVAL) {
            suspend_count = 0;
            
            // 检查eval_breaker标志
            if (_Py_atomic_load_int(&gil->eval_breaker)) {
                // 让出GIL给其他等待的线程
                drop_gil(tstate);
                take_gil(tstate);
                // 重新获取GIL后检查信号、异步异常等
            }
        }
    }
}
```

#### 2.1.5 IO 操作中的 GIL 释放

所有涉及 IO 的 C 层函数在执行前都会释放 GIL：

```c
// Modules/_io/fileio.c
// 文件读取时的GIL释放
static PyObject *
fileio_readinto(fileio *self, PyObject *args)
{
    // ...
    
    // 释放GIL，执行系统调用
    Py_BEGIN_ALLOW_THREADS    // 宏：drop_gil(tstate)
    n = read(self->fd, buf, len);
    Py_END_ALLOW_THREADS      // 宏：take_gil(tstate)
    
    // ...
}
```

这两个宏的定义：

```c
// Include/ceval.h
#define Py_BEGIN_ALLOW_THREADS \
    { PyThreadState *_save; _save = PyEval_SaveThread();

#define Py_END_ALLOW_THREADS \
    PyEval_RestoreThread(_save); }
```

### 2.2 GIL 对不同任务类型的影响机制

#### 2.2.1 CPU 密集型任务受 GIL 限制的原因

```
CPU密集型任务时间线（双线程, 双核CPU）:

Thread-1: [==Python字节码==][GIL释放][==Python字节码==][GIL释放][==Python字节码==]
Thread-2:                  [等待GIL]  [==Python字节码==][GIL释放][==Python字节码==]
           ^^^^^^^^^^^^^^^                    ^^^^^^^^^^^^^^^
           Thread-2在等待GIL时CPU空闲          Thread-1在等待GIL时CPU空闲

结果：两个核心永远无法同时执行Python字节码
```

GIL 切换本身也有开销：每次切换需要获取/释放互斥锁、条件变量通知、上下文切换：

```python
import sys
# 默认切换间隔：5毫秒
print(f"GIL切换间隔: {sys.getswitchinterval()}s")  # 0.005

# 对于CPU密集型任务：
# - 每5ms一次GIL切换
# - 每次切换涉及：互斥锁获取/释放、条件变量、OS上下文切换
# - 总开销：约5-10μs/次
# - 如果大量线程频繁切换，开销累积显著
```

#### 2.2.2 IO 密集型任务不受 GIL 限制的原因

```
IO密集型任务时间线（双线程, 单核即可）:

Thread-1: [==发起IO==][GIL释放]..........[GIL获取][==处理==]
Thread-2:              [==发起IO==][GIL释放]..........[GIL获取][==处理==]
                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                        Thread-1等待IO时，Thread-2可以执行

结果：IO等待期间释放GIL，其他线程可充分利用CPU
```

### 2.3 线程同步原语的实现原理

#### 2.3.1 Lock 的实现

`threading.Lock` 底层调用操作系统的互斥锁：

```c
// Modules/_threadmodule.c
// Lock对象的底层实现
typedef struct {
    PyObject_HEAD
    PyThread_type_lock lock_lock;    // 操作系统级互斥锁
    unsigned char locked;             // 锁状态
    PyObject *owner;                  // 锁持有者（用于调试）
} lockobject;

// 获取锁
static PyObject *
lock_PyThread_acquire_lock(lockobject *self, PyObject *args)
{
    int blocking = 1;  // 默认阻塞
    double timeout = -1.0;
    
    if (!PyArg_ParseTuple(args, "|id", &blocking, &timeout))
        return NULL;
    
    Py_BEGIN_ALLOW_THREADS  // 释放GIL！
    if (blocking) {
        // 阻塞获取锁
        success = PyThread_acquire_lock(self->lock_lock, 1);
    } else {
        // 非阻塞尝试获取锁
        success = PyThread_acquire_lock(self->lock_lock, 0);
    }
    Py_END_ALLOW_THREADS    // 重新获取GIL
    
    if (success) {
        self->locked = 1;
        self->owner = PyThread_get_thread_ident();
    }
    
    return PyBool_FromLong(success);
}
```

关键细节：**获取 Lock 时会释放 GIL**，使得其他线程可以在等待锁期间执行 Python 代码。

#### 2.3.2 RLock (可重入锁) 的实现

```c
// threading.py
class RLock:
    def __init__(self):
        self.__block = _allocate_lock()   # 底层Lock
        self.__owner = None                # 锁持有线程ID
        self.__count = 0                   # 重入计数
    
    def acquire(self, blocking=True, timeout=-1):
        me = get_ident()
        if self.__owner == me:
            # 同一线程再次获取：只增加计数
            self.__count += 1
            return True
        
        # 不同线程获取：等待底层Lock
        rc = self.__block.acquire(blocking, timeout)
        if rc:
            self.__owner = me
            self.__count = 1
        return rc
    
    def release(self):
        me = get_ident()
        if self.__owner != me:
            raise RuntimeError("cannot release un-acquired lock")
        self.__count -= 1
        if self.__count == 0:
            # 所有重入都释放后，真正释放底层Lock
            self.__owner = None
            self.__block.release()
```

#### 2.3.3 Condition 的实现

```c
// threading.py
class Condition:
    def __init__(self, lock=None):
        if lock is None:
            lock = RLock()       # 默认使用RLock
        self._lock = lock
        self._waiters = []       # 等待线程列表
        
    def wait(self, timeout=None):
        """释放锁，等待通知，重新获取锁"""
        waiter = _allocate_lock()   # 创建一个新Lock
        waiter.acquire()             # 先获取（使得后续acquire会阻塞）
        self._waiters.append(waiter)
        
        saved_state = self._release_save()  # 释放关联的锁
        try:
            waiter.acquire()         # 阻塞直到被notify唤醒
            # 超时或被唤醒
        finally:
            self._acquire_restore(saved_state)  # 重新获取锁
    
    def notify(self, n=1):
        """唤醒n个等待线程"""
        waiters = self._waiters[:n]
        for waiter in waiters:
            waiter.release()         # 释放waiter锁，唤醒等待线程
            self._waiters.remove(waiter)
```

### 2.4 Python 线程的操作系统映射

```c
// Python/thread_pthread.h (Linux)
// Python线程最终调用pthread_create
unsigned long
PyThread_start_new_thread(void (*func)(void *), void *arg)
{
    pthread_t th;
    int status;
    
#if defined(THREAD_STACK_SIZE) || defined(PTHREAD_STACK_MIN)
    pthread_attr_t attrs;
    pthread_attr_init(&attrs);
    
    // 设置线程栈大小
    // 默认: 8MB (Linux), 1MB (Windows)
#ifdef THREAD_STACK_SIZE
    pthread_attr_setstacksize(&attrs, THREAD_STACK_SIZE);
#endif
    
    status = pthread_create(&th, &attrs, bootstrap, func_arg);
    pthread_attr_destroy(&attrs);
#else
    status = pthread_create(&th, NULL, bootstrap, func_arg);
#endif
    
    return (unsigned long) th;
}
```

Python 线程的内存开销：

```
每个Python线程的内存组成:
┌─────────────────────────────┐
│  Python线程状态 (~1KB)       │
│  - PyThreadState结构体       │
│  - 当前帧指针                │
│  - 异常信息                  │
│  - GIL状态                  │
├─────────────────────────────┤
│  线程栈 (~8MB, Linux默认)    │
│  - 局部变量                  │
│  - 调用栈帧                  │
├─────────────────────────────┤
│  OS线程控制块 (~几KB)        │
│  - pthread结构体             │
│  - TLS(Thread Local Storage)│
│  - 信号掩码                  │
├─────────────────────────────┤
│  Python线程本地存储           │
│  - threading.local()数据     │
└─────────────────────────────┘
总计: 约8MB/线程(主要来自栈)
```

---

## 3. 使用场景

### 3.1 场景：生产者-消费者模式

```python
import threading
import queue
import time
import random

class ProducerConsumer:
    """经典的生产者-消费者模式实现"""
    
    def __init__(self, buffer_size=10):
        self.queue = queue.Queue(maxsize=buffer_size)
        self.condition = threading.Condition()
        self.stop_event = threading.Event()
    
    def producer(self, producer_id):
        """生产者线程"""
        while not self.stop_event.is_set():
            item = random.randint(1, 100)
            with self.condition:
                while self.queue.full() and not self.stop_event.is_set():
                    self.condition.wait(timeout=0.1)
                if self.stop_event.is_set():
                    break
                self.queue.put(item)
                print(f"生产者{producer_id} 产生: {item}, 队列大小: {self.queue.qsize()}")
                self.condition.notify_all()
            time.sleep(random.uniform(0.01, 0.1))
    
    def consumer(self, consumer_id):
        """消费者线程"""
        while not self.stop_event.is_set() or not self.queue.empty():
            with self.condition:
                while self.queue.empty() and not self.stop_event.is_set():
                    self.condition.wait(timeout=0.1)
                if self.queue.empty():
                    break
                item = self.queue.get()
                print(f"  消费者{consumer_id} 消费: {item}, 队列大小: {self.queue.qsize()}")
                self.condition.notify_all()
            time.sleep(random.uniform(0.02, 0.2))
    
    def run(self, num_producers=2, num_consumers=3, duration=5):
        """运行生产者-消费者"""
        producers = []
        consumers = []
        
        for i in range(num_producers):
            t = threading.Thread(target=self.producer, args=(i,), daemon=True)
            t.start()
            producers.append(t)
        
        for i in range(num_consumers):
            t = threading.Thread(target=self.consumer, args=(i,), daemon=True)
            t.start()
            consumers.append(t)
        
        time.sleep(duration)
        self.stop_event.set()
        
        for t in producers + consumers:
            t.join(timeout=2)

pc = ProducerConsumer(buffer_size=5)
pc.run(duration=3)
```

### 3.2 场景：线程池与 Future 模式

```python
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request
import time

def fetch_url(url):
    """网络请求封装"""
    start = time.perf_counter()
    try:
        response = urllib.request.urlopen(url, timeout=10)
        data = response.read()
        return url, len(data), time.perf_counter() - start, None
    except Exception as e:
        return url, 0, time.perf_counter() - start, str(e)

def parallel_fetch(urls, max_workers=10):
    """使用线程池并发抓取URL"""
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 提交所有任务
        future_to_url = {
            executor.submit(fetch_url, url): url for url in urls
        }
        
        # 按完成顺序收集结果
        for future in as_completed(future_to_url):
            url, size, elapsed, error = future.result()
            if error:
                print(f"失败: {url} - {error}")
            else:
                print(f"成功: {url} - {size} bytes - {elapsed:.2f}s")
            results.append(future.result())
    
    return results

# 使用示例
if __name__ == "__main__":
    urls = [f"https://httpbin.org/delay/1" for _ in range(5)]
    start = time.perf_counter()
    results = parallel_fetch(urls)
    print(f"总耗时: {time.perf_counter() - start:.2f}s")
```

### 3.3 场景：读写锁模式

```python
import threading

class ReadWriteLock:
    """读写锁：允许多个读者或一个写者"""
    
    def __init__(self):
        self._read_ready = threading.Condition(threading.Lock())
        self._readers = 0
    
    def acquire_read(self):
        """获取读锁——多个读者可以同时持有"""
        with self._read_ready:
            self._readers += 1
    
    def release_read(self):
        """释放读锁"""
        with self._read_ready:
            self._readers -= 1
            if self._readers == 0:
                self._read_ready.notify_all()
    
    def acquire_write(self):
        """获取写锁——等待所有读者释放"""
        with self._read_ready:
            while self._readers > 0:
                self._read_ready.wait()
    
    def release_write(self):
        """释放写锁——唤醒等待的读者"""
        with self._read_ready:
            self._read_ready.notify_all()

# 使用示例
rw_lock = ReadWriteLock()
shared_data = {"value": 0}

def reader(reader_id):
    for _ in range(5):
        rw_lock.acquire_read()
        try:
            print(f"  读者{reader_id} 读取: {shared_data['value']}")
        finally:
            rw_lock.release_read()

def writer(writer_id):
    for i in range(3):
        rw_lock.acquire_write()
        try:
            shared_data['value'] += 1
            print(f"写者{writer_id} 写入: {shared_data['value']}")
        finally:
            rw_lock.release_write()
```

### 3.4 场景：定时任务与周期执行

```python
import threading
import time

class PeriodicTimer:
    """可取消的周期定时器"""
    
    def __init__(self, interval, callback):
        self.interval = interval
        self.callback = callback
        self._stop_event = threading.Event()
        self._thread = None
    
    def start(self):
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
    
    def _run(self):
        while not self._stop_event.is_set():
            start = time.perf_counter()
            try:
                self.callback()
            except Exception as e:
                print(f"定时器回调异常: {e}")
            elapsed = time.perf_counter() - start
            remaining = self.interval - elapsed
            if remaining > 0:
                self._stop_event.wait(remaining)
    
    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=self.interval + 1)

# 使用示例
counter = {"value": 0}

def tick():
    counter["value"] += 1
    print(f"Tick: {counter['value']}")

timer = PeriodicTimer(1.0, tick)
timer.start()
time.sleep(5.5)
timer.stop()
print(f"最终计数: {counter['value']}")  # 约5-6
```

---

## 4. 示例代码

### 4.1 线程安全计数器（对比正确与错误实现）

```python
import threading
import time

# ❌ 错误：非线程安全的计数器
class UnsafeCounter:
    def __init__(self):
        self.value = 0
    
    def increment(self):
        # 非原子操作：读取-修改-写入
        self.value = self.value + 1  # 竞态条件！

# ✅ 正确：使用Lock保护
class SafeCounter:
    def __init__(self):
        self.value = 0
        self._lock = threading.Lock()
    
    def increment(self):
        with self._lock:
            self.value += 1

# ✅ 正确：使用RLock支持重入
class ReentrantCounter:
    def __init__(self):
        self.value = 0
        self._lock = threading.RLock()
    
    def increment(self):
        with self._lock:
            self.value += 1
    
    def increment_and_double(self):
        with self._lock:
            self.increment()  # RLock允许同一线程再次获取
            self.value *= 2

def test_counter(counter_cls, num_threads=10, increments=100000):
    """测试计数器的线程安全性"""
    counter = counter_cls()
    
    def worker():
        for _ in range(increments):
            counter.increment()
    
    threads = [threading.Thread(target=worker) for _ in range(num_threads)]
    start = time.perf_counter()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    elapsed = time.perf_counter() - start
    
    expected = num_threads * increments
    actual = counter.value
    correct = actual == expected
    
    print(f"{counter_cls.__name__:20s}: "
          f"期望={expected}, 实际={actual}, "
          f"正确={'✓' if correct else '✗'}, "
          f"耗时={elapsed:.3f}s")
    return correct

if __name__ == "__main__":
    print("线程安全性测试:")
    test_counter(UnsafeCounter)  # 实际值几乎总是小于期望值
    test_counter(SafeCounter)    # 实际值等于期望值
    test_counter(ReentrantCounter)
```

### 4.2 所有同步原语的综合示例

```python
"""
线程同步原语综合示例：模拟数据库连接池
展示 Lock, RLock, Condition, Semaphore, Event, Barrier 的使用
"""
import threading
import time
import random

class DatabaseConnectionPool:
    """数据库连接池——综合使用多种同步原语"""
    
    def __init__(self, max_connections=5):
        self.max_connections = max_connections
        
        # Semaphore: 限制并发连接数
        self._semaphore = threading.Semaphore(max_connections)
        
        # Lock: 保护连接池内部状态
        self._pool_lock = threading.Lock()
        
        # Condition: 等待连接可用
        self._condition = threading.Condition()
        
        # Event: 通知所有线程关闭
        self._shutdown_event = threading.Event()
        
        # Barrier: 所有工作线程就绪后开始
        self._start_barrier = threading.Barrier(max_connections + 1)
        
        # RLock: 支持重入的统计操作
        self._stats_lock = threading.RLock()
        
        # 连接池和统计
        self._connections = []
        self._in_use = set()
        self._stats = {"acquired": 0, "released": 0, "timeouts": 0}
    
    def initialize(self):
        """初始化连接池"""
        with self._pool_lock:
            for i in range(self.max_connections):
                self._connections.append(f"conn-{i}")
        print(f"连接池初始化完成: {self.max_connections} 个连接")
    
    def acquire_connection(self, timeout=5.0):
        """获取一个连接"""
        if self._shutdown_event.is_set():
            raise RuntimeError("连接池已关闭")
        
        # 使用Semaphore限制并发连接数
        acquired = self._semaphore.acquire(timeout=timeout)
        if not acquired:
            with self._stats_lock:
                self._stats["timeouts"] += 1
            raise TimeoutError(f"获取连接超时({timeout}s)")
        
        with self._pool_lock:
            conn = self._connections.pop()
            self._in_use.add(conn)
        
        with self._stats_lock:
            self._stats["acquired"] += 1
        
        return conn
    
    def release_connection(self, conn):
        """释放一个连接"""
        with self._pool_lock:
            self._in_use.discard(conn)
            self._connections.append(conn)
        
        self._semaphore.release()
        
        with self._stats_lock:
            self._stats["released"] += 1
        
        # 通知等待的线程
        with self._condition:
            self._condition.notify()
    
    def get_stats(self):
        """获取统计信息（RLock支持嵌套调用）"""
        with self._stats_lock:
            available = len(self._connections)
            in_use = len(self._in_use)
            return {
                **self._stats,
                "available": available,
                "in_use": in_use,
                "utilization": f"{in_use}/{self.max_connections}"
            }
    
    def shutdown(self):
        """关闭连接池"""
        self._shutdown_event.set()
        with self._condition:
            self._condition.notify_all()
        print("连接池已关闭")

def worker(pool, worker_id, num_operations):
    """模拟数据库客户端"""
    # 等待所有工作线程就绪
    pool._start_barrier.wait()
    
    for i in range(num_operations):
        if pool._shutdown_event.is_set():
            break
        
        try:
            conn = pool.acquire_connection(timeout=2.0)
            # 模拟数据库操作
            time.sleep(random.uniform(0.01, 0.1))
            pool.release_connection(conn)
        except TimeoutError:
            print(f"  工作者{worker_id}: 获取连接超时")
        except RuntimeError:
            break

if __name__ == "__main__":
    pool = DatabaseConnectionPool(max_connections=3)
    pool.initialize()
    
    # 启动多个工作者
    threads = []
    for i in range(8):
        t = threading.Thread(target=worker, args=(pool, i, 5), daemon=True)
        t.start()
        threads.append(t)
    
    # Barrier同步：所有线程就绪后开始
    pool._start_barrier.wait()
    print("所有工作者就绪，开始执行...")
    
    # 等待完成
    for t in threads:
        t.join(timeout=10)
    
    # 打印统计
    print(f"连接池统计: {pool.get_stats()}")
    pool.shutdown()
```

### 4.3 GIL 行为的底层观测

```python
"""
使用sys模块观测GIL行为
"""
import sys
import threading
import time

def observe_gil_switching():
    """观察GIL切换频率"""
    print(f"GIL切换间隔: {sys.getswitchinterval()}s")
    print(f"当前线程数: {threading.active_count()}")
    
    # 统计线程切换次数
    switch_counts = {"main": 0, "worker": 0}
    
    def cpu_worker(name, iterations, switch_counts):
        """CPU密集型任务，观察GIL切换"""
        total = 0
        start_switches = sys.getswitchinterval()
        for i in range(iterations):
            total += i
            if i % 1_000_000 == 0:
                # 每100万次迭代打印一次
                pass
        switch_counts[name] = total
    
    # CPU密集型——GIL频繁切换
    start = time.perf_counter()
    t1 = threading.Thread(target=cpu_worker, args=("T1", 10_000_000, switch_counts))
    t2 = threading.Thread(target=cpu_worker, args=("T2", 10_000_000, switch_counts))
    t1.start(); t2.start()
    t1.join(); t2.join()
    cpu_time = time.perf_counter() - start
    print(f"双线程CPU密集型: {cpu_time:.3f}s")
    
    # 单线程对比
    start = time.perf_counter()
    cpu_worker("S1", 10_000_000, switch_counts)
    cpu_worker("S2", 10_000_000, switch_counts)
    single_time = time.perf_counter() - start
    print(f"单线程CPU密集型: {single_time:.3f}s")
    print(f"多线程/单线程比: {cpu_time/single_time:.2f}x (期望>1.0因GIL开销)")

def observe_gil_release_on_io():
    """观察IO操作中的GIL释放"""
    print("\nIO密集型任务——GIL在IO等待时释放:")
    
    def io_worker(name, duration):
        """IO密集型任务"""
        start = time.perf_counter()
        time.sleep(duration)  # sleep期间释放GIL
        print(f"  {name}: 完成, 耗时{time.perf_counter() - start:.3f}s")
    
    # 多个IO线程几乎可以同时完成
    start = time.perf_counter()
    threads = [
        threading.Thread(target=io_worker, args=(f"IO-{i}", 1.0))
        for i in range(5)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    total = time.perf_counter() - start
    print(f"  5个IO线程总耗时: {total:.3f}s (≈1s, 而非5s)")

if __name__ == "__main__":
    observe_gil_switching()
    observe_gil_release_on_io()
```

### 4.4 线程间通信的多种方式对比

```python
"""
线程间通信方式对比
Queue / Pipe / Event / Condition / 共享变量
"""
import threading
import queue
import time

# ============ 方式1: queue.Queue (推荐) ============
def demo_queue():
    """最推荐的方式——线程安全、自动锁保护"""
    q = queue.Queue()
    
    def producer():
        for i in range(5):
            q.put(f"消息-{i}")
            time.sleep(0.1)
        q.put(None)  # 哨兵值
    
    def consumer():
        while True:
            item = q.get()
            if item is None:
                break
            print(f"  Queue消费者: {item}")
            q.task_done()
    
    t1 = threading.Thread(target=producer)
    t2 = threading.Thread(target=consumer)
    t1.start(); t2.start()
    t1.join(); t2.join()

# ============ 方式2: Event (信号通知) ============
def demo_event():
    """适合一次性通知——事件发生/未发生"""
    event = threading.Event()
    
    def waiter():
        print("  Event等待者: 等待事件...")
        event.wait()  # 阻塞直到事件被设置
        print("  Event等待者: 事件已发生!")
    
    def setter():
        time.sleep(0.5)
        print("  Event设置者: 触发事件!")
        event.set()
    
    t1 = threading.Thread(target=waiter)
    t2 = threading.Thread(target=setter)
    t1.start(); t2.start()
    t1.join(); t2.join()

# ============ 方式3: Condition (复杂等待条件) ============
def demo_condition():
    """适合复杂的等待/通知模式"""
    condition = threading.Condition()
    shared_list = []
    
    def consumer():
        with condition:
            while len(shared_list) < 3:  # 等待条件满足
                condition.wait()
            print(f"  Condition消费者: 取到{shared_list[:3]}")
            del shared_list[:3]
    
    def producer():
        for i in range(5):
            time.sleep(0.1)
            with condition:
                shared_list.append(i)
                print(f"  Condition生产者: 添加{i}, 队列长度={len(shared_list)}")
                condition.notify_all()
    
    t1 = threading.Thread(target=consumer)
    t2 = threading.Thread(target=producer)
    t1.start(); t2.start()
    t1.join(); t2.join()

# ============ 方式4: Barrier (同步点) ============
def demo_barrier():
    """适合多线程同步——所有线程都到达后一起继续"""
    barrier = threading.Barrier(3)
    
    def worker(name):
        print(f"  Barrier {name}: 准备")
        time.sleep(random.uniform(0.1, 0.5))
        print(f"  Barrier {name}: 到达同步点")
        barrier.wait()  # 等待所有线程
        print(f"  Barrier {name}: 继续")
    
    import random
    threads = [threading.Thread(target=worker, args=(f"线程{i}",))
               for i in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

if __name__ == "__main__":
    print("=== Queue ===")
    demo_queue()
    print("\n=== Event ===")
    demo_event()
    print("\n=== Condition ===")
    demo_condition()
    print("\n=== Barrier ===")
    demo_barrier()
```

---

## 5. 常见陷阱与最佳实践

### 5.1 陷阱：竞态条件

```python
import threading

# ❌ 错误：经典的check-then-act竞态条件
class LazyInit:
    _instance = None
    _lock = threading.Lock()
    
    @classmethod
    def get_instance_bad(cls):
        """错误的延迟初始化——存在竞态条件"""
        if cls._instance is None:          # 多个线程可能同时通过此检查
            cls._instance = LazyInit()     # 可能创建多个实例
        return cls._instance

# ✅ 正确：双重检查锁定(Double-Checked Locking)
class LazyInit:
    _instance = None
    _lock = threading.Lock()
    
    @classmethod
    def get_instance_good(cls):
        """正确的延迟初始化——双重检查锁定"""
        if cls._instance is None:          # 第一次检查（无锁）
            with cls._lock:                # 加锁
                if cls._instance is None:  # 第二次检查（有锁）
                    cls._instance = LazyInit()
        return cls._instance
```

### 5.2 陷阱：死锁

```python
import threading
import time

# ❌ 歙误：经典死锁——循环等待
lock_a = threading.Lock()
lock_b = threading.Lock()

def task1():
    with lock_a:                    # 获取lock_a
        time.sleep(0.1)
        with lock_b:                # 等待lock_b → 死锁!
            pass

def task2():
    with lock_b:                    # 获取lock_b
        time.sleep(0.1)
        with lock_a:                # 等待lock_a → 死锁!
            pass

# ✅ 正确：按固定顺序获取锁
def task1_safe():
    with lock_a:                    # 始终先获取lock_a
        time.sleep(0.1)
        with lock_b:                # 再获取lock_b
            pass

def task2_safe():
    with lock_a:                    # 也先获取lock_a
        time.sleep(0.1)
        with lock_b:                # 再获取lock_b
            pass

# ✅ 正确：使用超时避免死锁
def task1_timeout():
    with lock_a:
        time.sleep(0.1)
        if lock_b.acquire(timeout=1.0):
            try:
                pass
            finally:
                lock_b.release()
        else:
            print("获取lock_b超时，放弃操作")
```

### 5.3 陷阱：忘记释放锁

```python
import threading

lock = threading.Lock()

# ❌ 错误：异常导致锁未释放
def bad_practice():
    lock.acquire()
    # 如果这里抛出异常，锁永远不会被释放！
    result = 1 / 0  # ZeroDivisionError
    lock.release()

# ✅ 正确：使用上下文管理器确保锁释放
def good_practice():
    with lock:  # 即使异常也会自动释放
        result = 1 / 0  # ZeroDivisionError → 锁已释放

# ✅ 正确：手动获取时使用try/finally
def also_good():
    lock.acquire()
    try:
        result = 1 / 0
    finally:
        lock.release()  # 确保释放
```

### 5.4 陷阱：GIL 导致多线程 CPU 任务更慢

```python
import threading
import time

def cpu_heavy(n):
    """纯Python计算"""
    total = 0
    for i in range(n):
        total += i
    return total

def benchmark():
    N = 10_000_000
    
    # 单线程
    start = time.perf_counter()
    cpu_heavy(N)
    cpu_heavy(N)
    single = time.perf_counter() - start
    
    # 多线程（GIL导致更慢）
    start = time.perf_counter()
    t1 = threading.Thread(target=cpu_heavy, args=(N,))
    t2 = threading.Thread(target=cpu_heavy, args=(N,))
    t1.start(); t2.start()
    t1.join(); t2.join()
    multi = time.perf_counter() - start
    
    print(f"单线程: {single:.3f}s")
    print(f"多线程: {multi:.3f}s")
    print(f"多线程更慢: {multi > single} (GIL切换开销)")

# 教训：CPU密集型任务永远不要用多线程！
```

### 5.5 陷阱：线程泄漏

```python
import threading
import time

# ❌ 错误：创建大量线程但未控制数量
def bad_fetch(urls):
    """为每个URL创建一个线程——可能创建数千线程"""
    results = {}
    def fetch(url):
        time.sleep(0.1)  # 模拟网络请求
        results[url] = f"data-{url}"
    
    threads = [threading.Thread(target=fetch, args=(url,)) for url in urls]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    # 10000个URL → 10000个线程 → 约80GB内存！

# ✅ 正确：使用线程池控制并发数
from concurrent.futures import ThreadPoolExecutor

def good_fetch(urls, max_workers=100):
    """使用线程池限制并发数"""
    def fetch(url):
        time.sleep(0.1)
        return f"data-{url}"
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = dict(zip(urls, executor.map(fetch, urls)))
    return results
```

### 5.6 最佳实践总结

| 实践 | 说明 |
|------|------|
| **优先使用 `queue.Queue` 通信** | 内置线程安全，避免手动加锁 |
| **总是使用 `with` 语句管理锁** | 确保异常时锁也能释放 |
| **按固定顺序获取多个锁** | 避免循环等待导致的死锁 |
| **使用锁超时** | `lock.acquire(timeout=N)` 避免永久阻塞 |
| **CPU 密集型不用线程** | 使用多进程或 asyncio + ProcessPoolExecutor |
| **控制线程数量** | 使用 ThreadPoolExecutor，max_workers=CPU*5~10 |
| **守护线程谨慎使用** | 确保资源可被正确清理，优先使用 Event 信号退出 |
| **避免嵌套锁** | 使用 RLock 替代嵌套的 Lock |
| **不要在中断处理中获取锁** | signal handler 中获取锁可能死锁 |
| **线程安全的数据结构优先** | 使用 `queue.Queue`、`collections.deque`(线程安全的append/popleft) |
| **最小化临界区** | 只在必要时代码段加锁，减少锁持有时间 |
| **使用 `concurrent.futures`** | 比手动管理线程更简洁、更安全 |

### 5.7 同步原语选择指南

| 原语 | 用途 | 复杂度 |
|------|------|--------|
| `Lock` | 互斥访问共享资源 | 低 |
| `RLock` | 需要重入的互斥（如递归函数） | 低 |
| `Event` | 一次性通知（启动/停止信号） | 低 |
| `Condition` | 复杂等待条件（生产者-消费者） | 中 |
| `Semaphore` | 限制并发访问数量（连接池） | 中 |
| `Barrier` | 多线程同步点（并行计算汇总） | 中 |
| `queue.Queue` | 线程间数据传递（最推荐） | 低 |