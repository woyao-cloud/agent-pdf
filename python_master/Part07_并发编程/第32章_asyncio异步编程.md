# 第32章 asyncio异步编程

## 1. 概念与语法

### 1.1 asyncio 核心概念

asyncio 是 Python 的异步 IO 框架，基于**事件循环 (Event Loop)** 和**协程 (Coroutine)** 实现单线程并发：

```
asyncio 核心架构:
┌────────────────────────────────────────────────────────────┐
│                     应用代码                                │
│  async def main():                                         │
│      await task1()                                         │
│      await task2()                                         │
├────────────────────────────────────────────────────────────┤
│                     asyncio API                             │
│  Task, Future, gather, create_task, wait, sleep            │
├────────────────────────────────────────────────────────────┤
│                     事件循环 (Event Loop)                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  1. 注册IO回调 (epoll/kqueue/IOCP)                  │    │
│  │  2. 检查就绪的IO事件                                │    │
│  │  3. 执行就绪的回调/协程                             │    │
│  │  4. 处理定时器                                      │    │
│  └────────────────────────────────────────────────────┘    │
├────────────────────────────────────────────────────────────┤
│                     传输层                                   │
│  Transport (底层IO操作) + Protocol (协议解析)               │
├────────────────────────────────────────────────────────────┤
│                     操作系统                                 │
│  epoll (Linux) / kqueue (Mac) / IOCP (Windows)             │
└────────────────────────────────────────────────────────────┘
```

### 1.2 协程定义与使用

```python
import asyncio

# ─── 定义协程 ───
async def my_coroutine():
    """协程函数：使用async def定义"""
    await asyncio.sleep(1)    # 非阻塞等待
    return "result"

# ─── 运行协程 ───
# Python 3.7+
result = asyncio.run(my_coroutine())

# ─── await 关键字 ───
async def chain():
    """await挂起当前协程，让出控制权给事件循环"""
    result1 = await step1()    # 等待step1完成
    result2 = await step2(result1)  # 等待step2完成
    return result2

async def step1():
    await asyncio.sleep(0.5)
    return "step1_done"

async def step2(prev):
    await asyncio.sleep(0.5)
    return f"{prev} -> step2_done"
```

### 1.3 Task 与 Future

```python
import asyncio

# ─── Task ───
async def task_example():
    """Task是协程的调度单元"""
    # 方式1：create_task（推荐）
    task = asyncio.create_task(my_coroutine(), name="MyTask")
    
    # 方式2：ensure_future（兼容旧代码）
    task = asyncio.ensure_future(my_coroutine())
    
    # Task操作
    task.get_name()           # 获取任务名
    task.set_name("NewName")  # 设置任务名
    task.cancel()             # 取消任务
    task.cancelled()          # 是否已取消
    task.done()               # 是否已完成
    
    # 等待结果
    result = await task       # 等待任务完成
    try:
        result = task.result()  # 获取结果（已完成时）
    except Exception as e:
        result = task.exception()  # 获取异常

# ─── Future ───
async def future_example():
    """Future是Task的底层抽象，代表未来的结果"""
    future = asyncio.Future()
    
    # 设置结果
    future.set_result(42)
    
    # 等待结果
    result = await future  # 42
    
    # Future是Task的基类
    assert isinstance(asyncio.create_task(my_coroutine()), asyncio.Future)

# ─── 批量创建任务 ───
async def batch_tasks():
    # asyncio.gather：并发执行，收集所有结果
    results = await asyncio.gather(
        my_coroutine(),
        my_coroutine(),
        my_coroutine(),
        return_exceptions=True  # 异常不中断，作为结果返回
    )
    
    # asyncio.TaskGroup（Python 3.11+）：更安全
    async with asyncio.TaskGroup() as group:
        task1 = group.create_task(my_coroutine())
        task2 = group.create_task(my_coroutine())
    # TaskGroup保证所有任务完成，任一任务异常则全部取消
    
    return results
```

### 1.4 asyncio 常用 API 全景

```python
import asyncio

# ─── 协程调度 ───
async def scheduling_api():
    # 创建任务
    task = asyncio.create_task(coro(), name="MyTask")
    
    # 等待多个协程
    results = await asyncio.gather(coro1(), coro2(), coro3())
    
    # 等待首个完成
    done, pending = await asyncio.wait(
        [coro1(), coro2(), coro3()],
        timeout=5.0,
        return_when=asyncio.FIRST_COMPLETED
    )
    
    # 等待任一完成
    result = await asyncio.wait([coro1(), coro2()], 
                                return_when=asyncio.FIRST_COMPLETED)
    
    # 屏蔽任务（不取消但等待完成）
    result = await asyncio.shield(coro())
    
    # 超时控制
    try:
        result = await asyncio.wait_for(coro(), timeout=5.0)
    except asyncio.TimeoutError:
        print("超时")

# ─── 异步上下文管理器 ───
class AsyncContextManager:
    async def __aenter__(self):
        print("进入")
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        print("退出")

async def use_async_context():
    async with AsyncContextManager() as cm:
        print("使用中")

# ─── 异步迭代器 ───
class AsyncIterator:
    def __init__(self, items):
        self.items = iter(items)
    
    def __aiter__(self):
        return self
    
    async def __anext__(self):
        try:
            item = next(self.items)
            await asyncio.sleep(0.1)  # 模拟异步获取
            return item
        except StopIteration:
            raise StopAsyncIteration

async def use_async_iterator():
    async for item in AsyncIterator([1, 2, 3]):
        print(item)

# ─── 同步原语 ───
async def sync_primitives():
    # Lock
    lock = asyncio.Lock()
    async with lock:
        pass
    
    # Event
    event = asyncio.Event()
    event.set()
    await event.wait()
    
    # Condition
    cond = asyncio.Condition()
    async with cond:
        await cond.wait()
        cond.notify_all()
    
    # Semaphore
    sem = asyncio.Semaphore(10)
    async with sem:
        pass
    
    # Barrier (Python 3.11+)
    barrier = asyncio.Barrier(3)
    await barrier.wait()

# ─── 队列 ───
async def queue_example():
    q = asyncio.Queue(maxsize=10)
    
    await q.put("item")      # 放入（如果满则等待）
    item = await q.get()     # 取出（如果空则等待）
    q.put_nowait("item")     # 非阻塞放入
    item = q.get_nowait()    # 非阻塞取出
    q.qsize()                # 队列大小
    q.empty()                # 是否为空
    q.full()                 # 是否已满
    await q.join()            # 等待所有项目被处理

# ─── 子进程 ───
async def subprocess_example():
    proc = await asyncio.create_subprocess_exec(
        'ls', '-la',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode

# ─── 网络IO ───
async def network_example():
    reader, writer = await asyncio.open_connection('localhost', 8080)
    writer.write(b"Hello")
    await writer.drain()
    data = await reader.read(100)
    writer.close()
    await writer.wait_closed()

# ─── 定时器 ───
async def timer_example():
    await asyncio.sleep(1.0)          # 非阻塞等待1秒
    await asyncio.sleep(0)            # 让出控制权（立即重新调度）
    
    # 等待未来时间
    import time
    deadline = time.time() + 5.0
    await asyncio.sleep(deadline - time.time())
```

---

## 2. 原理与机制

### 2.1 事件循环的 CPython 实现

#### 2.1.1 事件循环的核心结构

asyncio 的事件循环在 CPython 中由 `Modules/_asynciomodule.c` 和 `Lib/asyncio/base_events.py` 共同实现：

```python
# Lib/asyncio/base_events.py (简化)
class BaseEventLoop:
    def __init__(self):
        self._ready = collections.deque()      # 就绪队列
        self._scheduled = []                     # 定时器堆（最小堆）
        self._stopping = False                  # 停止标志
        self._thread_id = None                  # 运行线程ID
        self._handler_count = 0                 # 处理器计数
        
        # IO多路复用器
        self._selector = selectors.DefaultSelector()
```

事件循环的运行逻辑：

```python
# Lib/asyncio/base_events.py (简化)
class BaseEventLoop:
    def run_forever(self):
        """事件循环主循环"""
        self._thread_id = threading.get_ident()
        
        try:
            while True:
                self._run_once()  # 执行一次循环迭代
                if self._stopping:
                    break
        finally:
            self._thread_id = None
    
    def _run_once(self):
        """事件循环的单次迭代——核心"""
        # 1. 计算IO等待超时时间
        timeout = None
        if self._ready:
            timeout = 0  # 有就绪任务，不等待IO
        elif self._scheduled:
            timeout = max(0, self._scheduled[0]._when - self.time())
        
        # 2. 等待IO事件（epoll/kqueue/IOCP）
        event_list = self._selector.select(timeout)
        
        # 3. 处理IO事件回调
        for key, events in event_list:
            callback = key.data
            callback(key.fileobj, events)
        
        # 4. 处理到期定时器
        now = self.time()
        while self._scheduled and self._scheduled[0]._when <= now:
            handle = heapq.heappop(self._scheduled)
            self._ready.append(handle)
        
        # 5. 执行就绪任务
        ntodo = len(self._ready)
        for i in range(ntodo):
            handle = self._ready.popleft()
            if not handle._cancelled:
                handle._run()  # 执行协程到下一个await
```

#### 2.1.2 IO 多路复用的底层机制

```c
// Python/selectormodule.c
// select系统调用的Python封装

// Linux: epoll
static PyObject *
selector_epoll_register(selectorObject *self, PyObject *args)
{
    int fd = ...;           // 文件描述符
    int events = ...;       // 事件掩码 (EPOLLIN|EPOLLOUT)
    
    struct epoll_event ev;
    ev.events = events;
    ev.data.fd = fd;
    
    // 调用Linux epoll_ctl系统调用
    if (epoll_ctl(self->epfd, EPOLL_CTL_ADD, fd, &ev) == -1) {
        PyErr_SetFromErrno(PyExc_OSError);
        return NULL;
    }
    Py_RETURN_NONE;
}

// 事件循环等待IO
static PyObject *
selector_epoll_select(selectorObject *self, PyObject *args)
{
    double timeout = ...;
    int maxevents = ...;
    
    // 调用Linux epoll_wait系统调用
    int nfds = epoll_wait(self->epfd, self->events, maxevents, timeout_ms);
    
    // 返回就绪的文件描述符和事件
    for (int i = 0; i < nfds; i++) {
        // 构造(fd, events)元组
    }
}
```

不同平台的 IO 多路复用实现：

| 平台 | 系统调用 | 特点 |
|------|----------|------|
| Linux | `epoll` | O(1) 复杂度，边缘触发/水平触发 |
| macOS | `kqueue` | O(1) 复杂度，事件过滤器 |
| Windows | `IOCP` (I/O Completion Ports) | 完成端口模型，内核级异步 |
| 通用 | `select` | O(n) 复杂度，最大1024连接 |

#### 2.1.3 协程的底层实现

Python 协程基于**生成器**演化而来，经历了以下历程：

```
Python协程演进:
Python 2.x:  生成器 (yield)
Python 3.3:   yield from (委托生成器)
Python 3.4:   @asyncio.coroutine + yield from (async/await前身)
Python 3.5:   async/await 语法 (原生协程)
Python 3.7:   asyncio.run() (标准入口)
Python 3.10:  TaskGroup (结构化并发)
Python 3.11:  TaskGroup (正式稳定)
Python 3.12:  性能优化 (Task步骤计数)
```

协程的 CPython 实现核心是 `PyCoroObject`：

```c
// Include/cpython/genobject.h
typedef struct {
    PyObject_HEAD                              // Python对象头
    PyFrameObject *gi_frame;                  // 协程栈帧
    char gi_running;                           // 是否正在运行
    PyObject *gi_code;                         // 代码对象
    PyObject *gi_name;                          // 协程名
    PyObject *gi_qualname;                     // 协程限定名
    PyObject *gi_origin;                       // 创建位置(调试用)
    PyObject *cr_send;                          // send()方法
    PyObject *cr_throw;                         // throw()方法
    PyObject *cr_close;                         // close()方法
    PyObject *cr_await;                         // 正在await的对象
} PyCoroObject;
```

`await` 关键字的底层实现：

```c
// Python/ceval.c
// await表达式的字节码实现
TARGET(SEND_GEN) {
    // 发送值给被await的协程/生成器
    PyObject *receiver = PEEK(2);  // 被await的对象
    PyObject *v = POP();            // 要发送的值
    
    PyObject *retval;
    if (PyCoro_CheckExact(receiver)) {
        retval = _PyCoro_Send(receiver, v);  // 原生协程
    } else if (PyGen_CheckExact(receiver)) {
        retval = _PyGen_Send(receiver, v);   // 生成器
    } else {
        retval = PyObject_CallMethodOneArg(receiver, &_Py_ID(send), v);
    }
    
    if (retval == NULL) {
        if (_PyErr_ExceptionMatches(PyExc_StopIteration)) {
            // 协程执行完毕，提取返回值
            _PyErr_Fetch(&exc, &val, &tb);
            retval = _PyGen_FetchStopIterationValue(&val);
        }
    }
    PUSH(retval);
}
```

### 2.2 Task 的调度机制

```python
# Lib/asyncio/tasks.py (简化)
class Task(Future):
    """协程的调度单元"""
    
    def __init__(self, coro, *, loop=None, name=None):
        super().__init__(loop=loop)
        self._coro = coro            # 被调度的协程
        self._name = name or f"Task-{_task_counter}"
        self._must_cancel = False
        self._step_scheduled = False
        
        # 立即调度第一步
        self._loop.call_soon(self.__step)
    
    def __step(self, exc=None):
        """执行协程的一步"""
        coro = self._coro
        self._fut_waiter = None
        
        try:
            if exc is None:
                # 发送None给协程，继续执行
                result = coro.send(None)
            else:
                # 向协程抛出异常
                result = coro.throw(type(exc), exc, exc.__traceback__)
        except StopIteration as e:
            # 协程执行完毕，设置结果
            self.set_result(e.value)
        except CancelledError as e:
            # 协程被取消
            if not self._cancelled_exc:
                self._cancelled_exc = e
            super().cancel(msg=self._cancel_message)
        except (KeyboardInterrupt, SystemExit, GeneratorExit):
            raise
        except BaseException as exc:
            # 协程抛出异常，设置异常
            self.set_exception(exc)
        else:
            # result是一个Future/awaitable，协程在此处挂起
            # 当result完成时，继续调度__step
            blocking = getattr(result, '_asyncio_future_blocking', None)
            if blocking is not None:
                # result是Future，添加完成回调
                result.add_done_callback(self.__step)
                self._fut_waiter = result
            elif result is None:
                # await None (如asyncio.sleep(0))
                # 立即重新调度
                self._loop.call_soon(self.__step)
            else:
                # result不是Future，可能是yield from生成器
                result = _ensure_future(result, loop=self._loop)
                result.add_done_callback(self.__step)
                self._fut_waiter = result
```

Task 调度的完整流程：

```
事件循环调度流程:
                    ┌───────────────────┐
                    │   asyncio.run()    │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │  创建Task对象      │
                    │  调度__step        │
                    └────────┬──────────┘
                             │
               ┌─────────────▼─────────────┐
               │  coro.send(None)           │
               │  执行协程到第一个await       │
               └─────────────┬─────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  await asyncio.sleep(1.0)    │
              │  返回Future给Task.__step      │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  Task: 等待Future完成         │
              │  Future.add_done_callback    │
              │  (self.__step)               │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  事件循环: 等待IO/定时器       │
              │  1秒后: Future完成           │
              │  调用Task.__step              │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  coro.send(result)           │
              │  继续执行到下一个await         │
              └──────────────┬──────────────┘
                             │
                    ┌────────▼──────────┐
                    │  协程执行完毕       │
                    │  抛出StopIteration │
                    │  Task.set_result() │
                    └───────────────────┘
```

### 2.3 异步 IO 操作的底层实现

#### 2.3.1 asyncio.sleep 的实现

```python
# Lib/asyncio/tasks.py (简化)
async def sleep(delay, result=None):
    """非阻塞等待"""
    if delay <= 0:
        await __sleep0()  # 让出控制权
        return result
    
    loop = events.get_running_loop()
    future = loop.create_future()
    
    # 创建定时器回调
    h = loop.call_later(delay, future.set_result, result)
    
    try:
        return await future  # 挂起当前协程
    finally:
        h.cancel()  # 取消定时器
```

#### 2.3.2 异步网络 IO 的底层实现

```python
# Lib/asyncio/selector_events.py (简化)
class _SelectorSocketTransport(_BaseTransport):
    """基于selector的socket传输层"""
    
    def write(self, data):
        """异步写入数据"""
        if not data:
            return
        
        if not self._buffer:
            # 尝试直接写入（不经过缓冲区）
            try:
                n = self._sock.send(data)  # 非阻塞send
            except (BlockingIOError, InterruptedError):
                n = 0
            except OSError as exc:
                self._fatal_error(exc, 'write')
                return
            
            if n == len(data):
                # 全部写入完成，不需要缓冲
                return
            
            # 部分写入，将剩余数据放入缓冲区
            data = data[n:]
        
        # 添加到写缓冲区
        self._buffer.extend(data)
        
        # 注册可写事件
        self._loop.add_writer(self._sock.fileno(), self._write_ready)
    
    def _write_ready(self):
        """socket可写时调用"""
        while self._buffer:
            try:
                n = self._sock.send(self._buffer)
            except (BlockingIOError, InterruptedError):
                # 缓冲区满，等待下次可写事件
                return
            except OSError as exc:
                self._fatal_error(exc, '_write_ready')
                return
            
            del self._buffer[:n]  # 移除已写入的数据
        
        # 缓冲区已清空，取消可写事件注册
        self._loop.remove_writer(self._sock.fileno())
```

### 2.4 与多线程/多进程协作

#### 2.4.1 run_in_executor 的实现

```python
# Lib/asyncio/base_events.py (简化)
class BaseEventLoop:
    async def run_in_executor(self, executor, func, *args):
        """在线程池或进程池中运行阻塞函数"""
        if executor is None:
            executor = self._default_executor  # 默认ThreadPoolExecutor
        
        # 创建Future
        future = self.create_future()
        
        def _callback(result_future):
            """executor完成后的回调"""
            try:
                result = result_future.result()
                future.set_result(result)
            except Exception as exc:
                future.set_exception(exc)
        
        # 提交到executor
        executor_future = executor.submit(func, *args)
        executor_future.add_done_callback(
            lambda f: self.call_soon_threadsafe(_callback, f)
        )
        
        return await future
```

---

## 3. 使用场景

### 3.1 场景：高并发 HTTP 客户端

```python
import asyncio
import aiohttp
import time

async def fetch(session, url, semaphore):
    """带并发限制的HTTP请求"""
    async with semaphore:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                return await resp.text()
        except Exception as e:
            return f"Error: {e}"

async def batch_fetch(urls, max_concurrent=100):
    """批量并发HTTP请求"""
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async with aiohttp.ClientSession() as session:
        tasks = [fetch(session, url, semaphore) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    
    return results

async def main():
    urls = [f"https://httpbin.org/delay/1" for _ in range(50)]
    
    start = time.perf_counter()
    results = await batch_fetch(urls, max_concurrent=20)
    elapsed = time.perf_counter() - start
    
    success = sum(1 for r in results if not isinstance(r, Exception))
    print(f"完成 {success}/{len(urls)} 个请求，耗时 {elapsed:.2f}s")

asyncio.run(main())
```

### 3.2 场景：异步生产者-消费者

```python
import asyncio
import random

class AsyncProducerConsumer:
    """异步生产者-消费者模式"""
    
    def __init__(self, buffer_size=10):
        self.queue = asyncio.Queue(maxsize=buffer_size)
        self.stop_event = asyncio.Event()
    
    async def producer(self, producer_id):
        """生产者协程"""
        for i in range(20):
            if self.stop_event.is_set():
                break
            item = f"P{producer_id}-item{i}"
            await self.queue.put(item)
            print(f"  生产者{producer_id}: 放入 {item}")
            await asyncio.sleep(random.uniform(0.01, 0.1))
    
    async def consumer(self, consumer_id):
        """消费者协程"""
        while not self.stop_event.is_set() or not self.queue.empty():
            try:
                item = await asyncio.wait_for(
                    self.queue.get(), timeout=0.5
                )
                print(f"    消费者{consumer_id}: 取出 {item}")
                self.queue.task_done()
                await asyncio.sleep(random.uniform(0.02, 0.2))
            except asyncio.TimeoutError:
                continue
    
    async def run(self, num_producers=2, num_consumers=3, duration=5):
        """运行生产者-消费者"""
        producers = [self.producer(i) for i in range(num_producers)]
        consumers = [self.consumer(i) for i in range(num_consumers)]
        
        # 运行指定时间后停止
        await asyncio.sleep(duration)
        self.stop_event.set()
        
        # 等待所有任务完成
        await asyncio.gather(*producers, return_exceptions=True)
        await self.queue.join()
        await asyncio.gather(*consumers, return_exceptions=True)

async def main():
    pc = AsyncProducerConsumer(buffer_size=5)
    await pc.run(duration=3)

asyncio.run(main())
```

### 3.3 场景：异步 TCP 服务器

```python
import asyncio

class EchoServer:
    """异步TCP回显服务器"""
    
    def __init__(self, host='127.0.0.1', port=8888):
        self.host = host
        self.port = port
    
    async def handle_client(self, reader, writer):
        """处理客户端连接"""
        addr = writer.get_extra_info('peername')
        print(f"新连接: {addr}")
        
        try:
            while True:
                data = await reader.read(1024)
                if not data:
                    break
                
                message = data.decode()
                print(f"  收到 {addr}: {message!r}")
                
                # 回显
                writer.write(data)
                await writer.drain()
        except Exception as e:
            print(f"  错误 {addr}: {e}")
        finally:
            writer.close()
            await writer.wait_closed()
            print(f"  断开: {addr}")
    
    async def start(self):
        server = await asyncio.start_server(
            self.handle_client, self.host, self.port
        )
        addrs = ', '.join(str(s.getsockname()) for s in server.sockets)
        print(f"服务器启动: {addrs}")
        
        async with server:
            await server.serve_forever()

if __name__ == "__main__":
    server = EchoServer()
    asyncio.run(server.start())
```

### 3.4 场景：与多线程/多进程协作

```python
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

# CPU密集型任务（在进程池中执行）
def cpu_heavy(n):
    """在进程中执行CPU密集型计算"""
    total = 0
    for i in range(n):
        total += i * i
    return total

# 阻塞IO任务（在线程池中执行）
def blocking_io(url):
    """在线程中执行阻塞IO操作"""
    import urllib.request
    response = urllib.request.urlopen(url, timeout=10)
    return len(response.read())

async def mixed_workflow():
    """混合工作流：异步IO + 多线程 + 多进程"""
    
    # 1. 纯异步IO操作
    async def async_io():
        await asyncio.sleep(1)
        return "async_io_done"
    
    # 2. 在线程池中执行阻塞IO
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=4) as thread_pool:
        blocking_result = await loop.run_in_executor(
            thread_pool, blocking_io, "https://httpbin.org/delay/1"
        )
    
    # 3. 在进程池中执行CPU密集型计算
    with ProcessPoolExecutor(max_workers=4) as process_pool:
        cpu_result = await loop.run_in_executor(
            process_pool, cpu_heavy, 10_000_000
        )
    
    # 4. 并发执行多种任务
    async_results = await asyncio.gather(
        async_io(),                                            # 异步IO
        loop.run_in_executor(None, blocking_io, "https://httpbin.org/delay/1"),  # 线程池IO
        loop.run_in_executor(process_pool, cpu_heavy, 5_000_000),   # 进程池CPU
    )
    
    print(f"混合工作流结果: {async_results}")

if __name__ == "__main__":
    asyncio.run(mixed_workflow())
```

---

## 4. 示例代码

### 4.1 事件循环深入理解

```python
"""
事件循环机制演示
展示事件循环如何调度协程
"""
import asyncio
import time

async def trace_task(name, steps):
    """追踪协程的调度过程"""
    for i in range(steps):
        print(f"  {name}: 步骤 {i+1}/{steps}")
        await asyncio.sleep(0)  # 让出控制权
    return f"{name}_done"

async def demo_event_loop():
    """演示事件循环调度"""
    print("=== 事件循环调度演示 ===")
    
    # 创建多个任务
    task1 = asyncio.create_task(trace_task("任务A", 3))
    task2 = asyncio.create_task(trace_task("任务B", 3))
    task3 = asyncio.create_task(trace_task("任务C", 2))
    
    # 事件循环交替执行各任务
    results = await asyncio.gather(task1, task2, task3)
    print(f"结果: {results}")

async def demo_task_lifecycle():
    """演示Task生命周期"""
    print("\n=== Task生命周期演示 ===")
    
    async def long_task():
        print("  长任务: 开始")
        await asyncio.sleep(5)
        print("  长任务: 完成")
        return "long_task_result"
    
    # 创建任务
    task = asyncio.create_task(long_task(), name="LongTask")
    print(f"  任务名: {task.get_name()}")
    print(f"  是否完成: {task.done()}")
    
    # 等待一小段时间
    await asyncio.sleep(0.1)
    print(f"  是否运行中: {not task.done() and not task.cancelled()}")
    
    # 取消任务
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        print(f"  任务已取消")
    print(f"  是否取消: {task.cancelled()}")

async def demo_timeout():
    """演示超时控制"""
    print("\n=== 超时控制演示 ===")
    
    async def slow_task():
        await asyncio.sleep(10)
        return "完成"
    
    # 使用wait_for设置超时
    try:
        result = await asyncio.wait_for(slow_task(), timeout=2.0)
    except asyncio.TimeoutError:
        print("  任务超时!")
    
    # 使用asyncio.timeout (Python 3.11+)
    try:
        async with asyncio.timeout(2.0):
            await slow_task()
    except TimeoutError:
        print("  async timeout 超时!")

async def demo_task_group():
    """演示TaskGroup (Python 3.11+)"""
    print("\n=== TaskGroup演示 ===")
    
    try:
        async with asyncio.TaskGroup() as group:
            t1 = group.create_task(trace_task("G-A", 2))
            t2 = group.create_task(trace_task("G-B", 2))
            # 任一任务异常则所有任务取消
    except Exception as e:
        print(f"  任务组异常: {e}")
    else:
        print(f"  结果: {t1.result()}, {t2.result()}")

if __name__ == "__main__":
    asyncio.run(demo_event_loop())
    asyncio.run(demo_task_lifecycle())
    asyncio.run(demo_timeout())
    asyncio.run(demo_task_group())
```

### 4.2 异步 IO 多路复用演示

```python
"""
异步IO演示：同时处理多个连接
对比同步vs异步处理网络IO的差异
"""
import asyncio
import time

async def async_request(host, port, path, delay=1):
    """模拟异步HTTP请求"""
    start = time.perf_counter()
    await asyncio.sleep(delay)  # 模拟网络延迟
    elapsed = time.perf_counter() - start
    return f"GET {path} - {elapsed:.2f}s"

async def demo_concurrent_io():
    """演示并发IO处理"""
    print("=== 并发IO处理 ===")
    
    # 串行处理（假设每个请求1秒）
    start = time.perf_counter()
    results = []
    for i in range(5):
        result = await async_request("example.com", 80, f"/api/{i}", delay=1)
        results.append(result)
    serial_time = time.perf_counter() - start
    print(f"串行: {serial_time:.2f}s")
    
    # 并发处理（5个请求同时进行）
    start = time.perf_counter()
    tasks = [
        async_request("example.com", 80, f"/api/{i}", delay=1)
        for i in range(5)
    ]
    results = await asyncio.gather(*tasks)
    concurrent_time = time.perf_counter() - start
    print(f"并发: {concurrent_time:.2f}s")
    print(f"加速比: {serial_time/concurrent_time:.1f}x")

async def demo_streaming():
    """演示异步流式处理"""
    print("\n=== 异步流式处理 ===")
    
    async def data_stream(count, interval=0.1):
        """模拟数据流"""
        for i in range(count):
            await asyncio.sleep(interval)
            yield f"data_{i}"
    
    # 异步迭代
    async for data in data_stream(10, interval=0.1):
        print(f"  接收: {data}")

async def demo_pipeline():
    """演示异步管道处理"""
    print("\n=== 异步管道处理 ===")
    
    async def generate_data(queue, count):
        """数据生成器"""
        for i in range(count):
            await asyncio.sleep(0.05)
            await queue.put(f"raw_{i}")
        await queue.put(None)  # 终止信号
    
    async def process_data(in_queue, out_queue):
        """数据处理器"""
        while True:
            data = await in_queue.get()
            if data is None:
                await out_queue.put(None)
                break
            await asyncio.sleep(0.03)
            processed = data.replace("raw", "processed")
            await out_queue.put(processed)
    
    async def collect_data(queue):
        """数据收集器"""
        results = []
        while True:
            data = await queue.get()
            if data is None:
                break
            results.append(data)
        return results
    
    # 创建管道
    q1 = asyncio.Queue(maxsize=5)
    q2 = asyncio.Queue(maxsize=5)
    
    # 运行管道
    async with asyncio.TaskGroup() as group:
        group.create_task(generate_data(q1, 10))
        group.create_task(process_data(q1, q2))
        collector = group.create_task(collect_data(q2))
    
    print(f"  处理结果: {collector.result()}")

if __name__ == "__main__":
    asyncio.run(demo_concurrent_io())
    asyncio.run(demo_streaming())
    asyncio.run(demo_pipeline())
```

### 4.3 异步同步原语综合示例

```python
"""
asyncio同步原语综合示例：异步数据库连接池
展示Lock, Event, Semaphore, Condition, Barrier的使用
"""
import asyncio
import random
import time

class AsyncDatabasePool:
    """异步数据库连接池"""
    
    def __init__(self, max_connections=5):
        self.max_connections = max_connections
        self._semaphore = asyncio.Semaphore(max_connections)
        self._lock = asyncio.Lock()
        self._condition = asyncio.Condition()
        self._available = asyncio.Queue(maxsize=max_connections)
        self._connection_count = 0
        self._stats = {"acquired": 0, "released": 0, "timeouts": 0}
    
    async def initialize(self):
        """初始化连接池"""
        for i in range(self.max_connections):
            conn = f"conn-{i}"
            await self._available.put(conn)
        print(f"连接池初始化: {self.max_connections} 个连接")
    
    async def acquire(self, timeout=5.0):
        """获取连接"""
        try:
            async with asyncio.timeout(timeout):
                async with self._semaphore:
                    conn = await self._available.get()
                    self._stats["acquired"] += 1
                    return conn
        except TimeoutError:
            self._stats["timeouts"] += 1
            raise TimeoutError(f"获取连接超时({timeout}s)")
    
    async def release(self, conn):
        """释放连接"""
        await self._available.put(conn)
        self._stats["released"] += 1
        async with self._condition:
            self._condition.notify_all()
    
    def get_stats(self):
        return self._stats

async def demo_sync_primitives():
    """演示各种同步原语"""
    
    # ─── Lock：保护共享资源 ───
    print("=== Lock ===")
    lock = asyncio.Lock()
    counter = {"value": 0}
    
    async def increment(name):
        for _ in range(1000):
            async with lock:
                counter["value"] += 1
    
    await asyncio.gather(*[increment(f"T{i}") for i in range(5)])
    print(f"  计数器: {counter['value']} (期望5000)")
    
    # ─── Semaphore：限制并发 ───
    print("\n=== Semaphore ===")
    sem = asyncio.Semaphore(3)
    
    async def limited_task(name):
        async with sem:
            print(f"  {name}: 开始 (并发={5-sem._value})")
            await asyncio.sleep(1)
            print(f"  {name}: 完成")
    
    await asyncio.gather(*[limited_task(f"Task-{i}") for i in range(10)])
    
    # ─── Event：一次性通知 ───
    print("\n=== Event ===")
    event = asyncio.Event()
    
    async def waiter(name):
        print(f"  {name}: 等待事件...")
        await event.wait()
        print(f"  {name}: 事件已触发!")
    
    async def setter():
        await asyncio.sleep(1)
        print("  设置者: 触发事件!")
        event.set()
    
    await asyncio.gather(
        *[waiter(f"等待者{i}") for i in range(3)],
        setter()
    )
    
    # ─── Condition：复杂等待条件 ───
    print("\n=== Condition ===")
    condition = asyncio.Condition()
    shared_list = []
    
    async def condition_consumer():
        async with condition:
            while len(shared_list) < 3:
                await condition.wait()
            print(f"  消费者: 取到 {shared_list[:3]}")
            del shared_list[:3]
    
    async def condition_producer():
        for i in range(5):
            await asyncio.sleep(0.2)
            async with condition:
                shared_list.append(i)
                print(f"  生产者: 添加 {i}, 长度={len(shared_list)}")
                condition.notify_all()
    
    await asyncio.gather(condition_consumer(), condition_producer())

if __name__ == "__main__":
    asyncio.run(demo_sync_primitives())
```

### 4.4 asyncio 性能基准测试

```python
"""
asyncio性能基准测试
对比asyncio与threading在不同场景下的表现
"""
import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor

async def async_io_task(delay=0.01):
    """模拟异步IO操作"""
    await asyncio.sleep(delay)
    return delay

def sync_io_task(delay=0.01):
    """模拟同步IO操作"""
    time.sleep(delay)
    return delay

def benchmark_asyncio(task_count=1000, delay=0.01):
    """asyncio基准测试"""
    async def run():
        start = time.perf_counter()
        tasks = [async_io_task(delay) for _ in range(task_count)]
        results = await asyncio.gather(*tasks)
        elapsed = time.perf_counter() - start
        return elapsed, len(results)
    
    elapsed, count = asyncio.run(run())
    return elapsed, count

def benchmark_threading(task_count=1000, delay=0.01, max_workers=100):
    """threading基准测试"""
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(sync_io_task, [delay] * task_count))
    elapsed = time.perf_counter() - start
    return elapsed, len(results)

def run_benchmark():
    """运行完整基准测试"""
    task_counts = [10, 100, 1000, 5000]
    delay = 0.01
    
    print("异步IO基准测试 (模拟网络延迟)")
    print(f"每个任务延迟: {delay}s")
    print("=" * 70)
    print(f"{'任务数':>8} {'asyncio':>12} {'threading':>12} {'加速比':>8}")
    print("-" * 70)
    
    for count in task_counts:
        async_time, _ = benchmark_asyncio(count, delay)
        thread_time, _ = benchmark_threading(count, delay)
        speedup = thread_time / async_time if async_time > 0 else 0
        
        print(f"{count:>8} {async_time:>10.3f}s {thread_time:>10.3f}s {speedup:>8.2f}x")

if __name__ == "__main__":
    run_benchmark()
```

---

## 5. 常见陷阱与最佳实践

### 5.1 陷阱：在协程中调用阻塞函数

```python
import asyncio
import time

# ❌ 错误：在协程中调用阻塞函数——阻塞整个事件循环
async def bad_example():
    time.sleep(5)          # 阻塞！事件循环停滞5秒
    result = requests.get(url)  # 阻塞！
    return result

# ✅ 正确方式1：使用异步替代
async def good_example_async():
    await asyncio.sleep(5)  # 非阻塞
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            return await resp.text()

# ✅ 正确方式2：使用run_in_executor
async def good_example_executor():
    loop = asyncio.get_event_loop()
    
    # 在线程池中运行阻塞函数
    result = await loop.run_in_executor(None, time.sleep, 5)
    
    # 在进程池中运行CPU密集型函数
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor() as pool:
        result = await loop.run_in_executor(pool, cpu_heavy, data)
    
    return result
```

### 5.2 陷阱：忘记 await

```python
import asyncio

async def fetch_data():
    await asyncio.sleep(1)
    return "data"

# ❌ 错误：忘记await——协程对象被当作结果
async def bad():
    result = fetch_data()  # 返回协程对象，不是结果！
    print(type(result))    # <class 'coroutine'>
    # 运行时警告: "coroutine 'fetch_data' was never awaited"

# ✅ 正确：使用await获取结果
async def good():
    result = await fetch_data()  # 等待协程完成
    print(result)  # "data"

# ✅ 正确：使用create_task创建并发任务
async def good_concurrent():
    task = asyncio.create_task(fetch_data())  # 立即开始执行
    # 可以做其他事情...
    result = await task  # 在需要时等待结果
```

### 5.3 陷阱：创建任务后不等待

```python
import asyncio

async def important_task():
    await asyncio.sleep(1)
    return "重要结果"

# ❌ 错误：fire-and-forget——任务可能未完成就被取消
async def bad():
    asyncio.create_task(important_task())  # 创建但不等待
    # 函数返回后，如果事件循环关闭，任务会被取消！
    print("完成")  # important_task可能还没执行完

# ✅ 正确：等待任务完成
async def good():
    task = asyncio.create_task(important_task())
    result = await task  # 等待任务完成
    print(f"结果: {result}")

# ✅ 正确：使用TaskGroup确保所有任务完成
async def good_group():
    async with asyncio.TaskGroup() as group:
        task = group.create_task(important_task())
    # TaskGroup退出时保证所有任务完成
    print(f"结果: {task.result()}")
```

### 5.4 陷阱：asyncio 不是线程安全的

```python
import asyncio
import threading

# ❌ 错误：从其他线程直接操作asyncio对象
async def bad_thread_interaction():
    loop = asyncio.get_event_loop()
    
    def thread_func():
        # 不能从其他线程直接调用asyncio API！
        # asyncio.sleep(1)  # ❌ RuntimeError
        pass
    
    t = threading.Thread(target=thread_func)
    t.start()

# ✅ 正确：使用call_soon_threadsafe或run_coroutine_threadsafe
async def good_thread_interaction():
    loop = asyncio.get_event_loop()
    result_future = None
    
    def thread_func():
        # 方式1：调度回调到事件循环
        loop.call_soon_threadsafe(
            lambda: print("来自线程的消息")
        )
        
        # 方式2：从线程提交协程
        future = asyncio.run_coroutine_threadsafe(
            important_task(), loop
        )
        result = future.result(timeout=10)  # 等待结果
    
    t = threading.Thread(target=thread_func)
    t.start()
    t.join()
```

### 5.5 陷阱：协程中的 CPU 密集型操作

```python
import asyncio

# ❌ 错误：CPU密集型操作阻塞事件循环
async def bad_cpu_task():
    total = 0
    for i in range(10_000_000):  # 阻塞几秒！
        total += i
    return total

# ✅ 正确方式1：分片+让出控制权
async def good_cpu_task_chunked():
    total = 0
    for i in range(10_000_000):
        total += i
        if i % 100_000 == 0:
            await asyncio.sleep(0)  # 定期让出控制权
    return total

# ✅ 正确方式2：使用进程池
async def good_cpu_task_process():
    def cpu_heavy(n):
        return sum(range(n))
    
    loop = asyncio.get_event_loop()
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor() as pool:
        result = await loop.run_in_executor(pool, cpu_heavy, 10_000_000)
    return result

# ✅ 正确方式3：使用asyncio.to_thread（Python 3.9+）
async def good_blocking_task():
    result = await asyncio.to_thread(blocking_function, arg1, arg2)
    return result
```

### 5.6 陷阱：异常处理

```python
import asyncio

async def failing_task():
    raise ValueError("任务失败")

# ❌ 错误：gather中的异常会立即传播
async def bad_gather():
    try:
        results = await asyncio.gather(
            failing_task(),
            asyncio.sleep(1),
        )
    except ValueError:
        # sleep(1)也会被取消！
        print("一个任务失败导致所有任务失败")

# ✅ 正确：使用return_exceptions=True
async def good_gather():
    results = await asyncio.gather(
        failing_task(),
        asyncio.sleep(1),
        return_exceptions=True  # 异常作为结果返回
    )
    for result in results:
        if isinstance(result, Exception):
            print(f"任务失败: {result}")
        else:
            print(f"任务成功: {result}")

# ✅ 正确：使用TaskGroup（Python 3.11+）——任一异常取消所有任务
async def good_task_group():
    try:
        async with asyncio.TaskGroup() as group:
            group.create_task(failing_task())
            group.create_task(asyncio.sleep(1))
    except ExceptionGroup as eg:
        for e in eg.exceptions:
            print(f"异常: {e}")
```

### 5.7 最佳实践总结

| 实践 | 说明 |
|------|------|
| **使用 `asyncio.run()`** | 标准入口，自动创建/关闭事件循环 |
| **始终 `await` 协程** | 避免 "coroutine was never awaited" 警告 |
| **阻塞函数用 `run_in_executor`** | 避免阻塞事件循环 |
| **CPU 密集型用进程池** | `ProcessPoolExecutor` 绕过 GIL |
| **使用 `asyncio.gather` 并发** | 比顺序 `await` 高效 |
| **使用 `TaskGroup`** | Python 3.11+，结构化并发 |
| **使用 `return_exceptions=True`** | 防止一个任务失败取消所有任务 |
| **限制并发数量** | 使用 `Semaphore` 或 `asyncio.BoundedSemaphore` |
| **使用超时** | `asyncio.wait_for` 或 `asyncio.timeout` |
| **优先使用异步库** | aiohttp > requests, aiomysql > pymysql |
| **避免从线程直接操作 asyncio** | 使用 `call_soon_threadsafe` |
| **资源清理用 `async with`** | 确保连接、文件等正确关闭 |

### 5.8 同步原语选择指南（asyncio 版）

| 原语 | 对应 threading | 用途 | async 版特点 |
|------|---------------|------|-------------|
| `asyncio.Lock` | `threading.Lock` | 互斥访问 | `async with lock` |
| `asyncio.Event` | `threading.Event` | 一次性通知 | `await event.wait()` |
| `asyncio.Condition` | `threading.Condition` | 复杂等待 | `async with cond: await cond.wait()` |
| `asyncio.Semaphore` | `threading.Semaphore` | 限制并发 | `async with sem` |
| `asyncio.Barrier` | `threading.Barrier` | 同步点 (3.11+) | `await barrier.wait()` |
| `asyncio.Queue` | `queue.Queue` | 数据传递 | `await q.put() / await q.get()` |