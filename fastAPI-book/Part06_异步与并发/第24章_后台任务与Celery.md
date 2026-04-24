# 第24章 后台任务与Celery

后台任务让 API 请求不必等待耗时操作完成。本章从 FastAPI 的 BackgroundTasks 到 Celery 的分布式任务队列，深入剖析后台任务处理的机制与实践。

---

## 24.1 概念与语法

### 24.1.1 BackgroundTasks

```python
from fastapi import FastAPI, BackgroundTasks

app = FastAPI()

def send_email(email: str, message: str):
    """模拟发送邮件。"""
    print(f"Sending email to {email}: {message}")

@app.post("/send-notification/")
async def send_notification(email: str, background_tasks: BackgroundTasks):
    # 添加后台任务
    background_tasks.add_task(send_email, email, "Welcome!")
    return {"message": "Notification sent", "email": email}

# 多个后台任务
@app.post("/process/")
async def process(background_tasks: BackgroundTasks):
    background_tasks.add_task(task1)
    background_tasks.add_task(task2, arg1, arg2)
    background_tasks.add_task(task3, kwarg=value)
    return {"message": "Processing started"}

# 异步后台任务
async def async_task(data: str):
    await asyncio.sleep(5)
    print(f"Async task completed: {data}")

@app.post("/async-task/")
async def trigger_async_task(background_tasks: BackgroundTasks):
    background_tasks.add_task(async_task, "some data")
    return {"message": "Async task started"}
```

### 24.1.2 Celery 集成

```python
# celery_app.py
from celery import Celery

celery = Celery(
    "worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

@celery.task
def process_data(data_id: int):
    """耗时数据处理任务。"""
    result = heavy_computation(data_id)
    return result

@celery.task(bind=True)
def long_running_task(self, data_id: int):
    """带进度更新的长时任务。"""
    for i in range(100):
        process_step(i)
        self.update_state(state="PROGRESS", meta={"current": i, "total": 100})
    return {"result": "done"}

# main.py
from fastapi import FastAPI
from celery_app import process_data, long_running_task

app = FastAPI()

@app.post("/process/{data_id}")
async def start_processing(data_id: int):
    task = process_data.delay(data_id)
    return {"task_id": task.id, "status": "started"}

@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    from celery.result import AsyncResult
    task = AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": task.status,
        "result": task.result if task.ready() else None,
    }
```

### 24.1.3 定时任务（Celery Beat）

```python
# celery_app.py
from celery.schedules import crontab

celery.conf.beat_schedule = {
    "cleanup-every-night": {
        "task": "app.tasks.cleanup_expired_sessions",
        "schedule": crontab(hour=2, minute=0),
    },
    "health-check-every-minute": {
        "task": "app.tasks.health_check",
        "schedule": 60.0,
    },
}
```

---

## 24.2 原理与机制

### 24.2.1 BackgroundTasks 的实现

```python
"""
BackgroundTasks 的实现原理：

1. 路由函数返回后，FastAPI 检查是否有后台任务
2. 如果有，在发送响应后执行后台任务
3. 后台任务在同一个事件循环中执行
4. 如果后台任务抛异常，会被记录但不会影响已发送的响应

源码位置：starlette/background.py

class BackgroundTask:
    def __init__(self, func, *args, **kwargs):
        self.func = func
        self.args = args
        self.kwargs = kwargs

    async def __call__(self):
        if inspect.iscoroutinefunction(self.func):
            await self.func(*self.args, **self.kwargs)
        else:
            self.func(*self.args, **self.kwargs)

class BackgroundTasks:
    def __init__(self, tasks=None):
        self.tasks = tasks or []

    def add_task(self, func, *args, **kwargs):
        self.tasks.append(BackgroundTask(func, *args, **kwargs))

    async def __call__(self):
        for task in self.tasks:
            await task()
"""
```

### 24.2.2 Celery 的工作流程

```python
"""
Celery 架构：

Producer (FastAPI) → Broker (Redis/RabbitMQ) → Worker (Celery)
                                                    ↓
                                               Result Backend (Redis)

1. FastAPI 调用 task.delay() → 将任务序列化并发送到 Broker
2. Worker 从 Broker 取出任务 → 反序列化并执行
3. 执行结果存入 Result Backend
4. 客户端通过 task.id 查询结果

任务序列化：JSON（推荐）/ Pickle / YAML
消息协议：Celery 5.x 使用 JSON 协议
"""
```

---

## 24.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| BackgroundTasks 执行过长操作 | 长任务使用 Celery |
| Celery 任务不幂等 | 确保任务可重试 |
| 不处理任务失败 | 配置 task retries 和 error handling |
| Broker 单点故障 | 使用 RabbitMQ 集群或 Redis Sentinel |
| 任务结果积压 | 设置 result_expires 过期时间 |

---

本章从 BackgroundTasks 的轻量级实现到 Celery 的分布式任务队列，从任务序列化到定时任务调度，全面剖析了 FastAPI 后台任务处理的机制与实践。