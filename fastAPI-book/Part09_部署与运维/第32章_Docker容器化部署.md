# 第32章 Docker容器化部署

## 32.1 概念与语法

### 32.1.1 容器化的本质

容器化并非简单的"打包工具"，而是操作系统级虚拟化的工程实践。Docker 利用 Linux 内核的 **namespace**（资源隔离）和 **cgroup**（资源限制）两大机制，在共享宿主内核的前提下实现进程级隔离。对于 FastAPI 应用而言，容器化的核心价值在于：将 Python 运行时、依赖库、应用代码及其配置封装为一个不可变的、可复现的交付单元。

```
+---------------------------------------------------+
|                    宿主操作系统                      |
|  +-------------+  +-------------+  +-------------+ |
|  |  Container  |  |  Container  |  |  Container  | |
|  |  FastAPI-A  |  |  FastAPI-B   |  |   Nginx     | |
|  |  Python 3.12|  |  Python 3.11 |  |             | |
|  |  uvicorn     |  |  uvicorn     |  |             | |
|  +-------------+  +-------------+  +-------------+ |
|                                                   |
|  Docker Engine (namespace + cgroup + UnionFS)     |
+---------------------------------------------------+
```

### 32.1.2 Dockerfile 指令详解

Dockerfile 是容器镜像的声明式构建脚本。每条指令生成一个 **layer**（层），Docker 通过 UnionFS（联合文件系统）将各层叠加为最终镜像。

| 指令 | 作用 | 缓存行为 |
|------|------|----------|
| `FROM` | 指定基础镜像 | 基础镜像不变则缓存命中 |
| `WORKDIR` | 设置工作目录 | 不影响缓存 |
| `COPY` | 复制文件到镜像 | 文件内容变则缓存失效 |
| `RUN` | 构建时执行命令 | 指令文本变则缓存失效 |
| `EXPOSE` | 声明端口 | 纯声明，不影响缓存 |
| `ENV` | 设置环境变量 | 指令文本变则缓存失效 |
| `CMD` | 容器启动命令 | 运行时执行 |
| `ENTRYPOINT` | 容器入口点 | 运行时执行 |
| `ARG` | 构建时变量 | 不影响运行时 |
| `HEALTHCHECK` | 健康检查 | 运行时执行 |

### 32.1.3 多阶段构建语法

多阶段构建（Multi-stage Build）是 Docker 17.05 引入的关键特性，允许在单个 Dockerfile 中定义多个 `FROM` 指令，每个 `FROM` 开启一个新的构建阶段。最终镜像仅包含最后一个阶段的产物，中间阶段的工具链和临时文件被完全丢弃。

```dockerfile
# 语法结构
FROM <image> AS <stage-name>    # 命名构建阶段
# ... 构建步骤 ...

FROM <image> AS <final-stage>  # 最终阶段
COPY --from=<stage-name> <src> <dest>  # 从指定阶段复制产物
```

**多阶段构建的核心收益**：

- 编译型依赖（如 C 扩展）的构建工具链不会泄漏到运行时镜像
- 镜像体积可缩减 50%-90%
- 减少攻击面：运行时镜像不含编译器、调试工具

### 32.1.4 Uvicorn Worker 配置参数

Uvicorn 作为 ASGI 服务器，其 Worker 模型直接决定了 FastAPI 应用的并发处理能力。

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--workers` | 1 | Worker 进程数，生产环境建议设为 `CPU核心数 * 2 + 1` |
| `--timeout-keep-alive` | 5 | Keep-Alive 连接超时（秒） |
| `--graceful-timeout` | None | 优雅关闭超时（秒），超时后强制终止 |
| `--limit-concurrency` | None | 最大并发连接数 |
| `--limit-max-requests` | None | 单 Worker 处理最大请求数，达到后重启（防内存泄漏） |
| `--backlog` | 2048 | TCP 积压队列长度 |
| `--bind` | `127.0.0.1:8000` | 监听地址 |
| `--access-log` | True | 访问日志开关 |
| `--log-level` | `info` | 日志级别 |

### 32.1.5 docker-compose 编排语法

docker-compose 通过 YAML 文件声明多容器应用的拓扑关系。

```yaml
# 核心结构
version: "3.9"                    # compose 文件版本
services:                         # 服务定义
  <service-name>:
    build:                        # 构建配置
      context: .
      dockerfile: Dockerfile
      args:                       # 构建参数
        VERSION: "1.0"
    image: <image:tag>            # 或直接使用镜像
    ports:                        # 端口映射
      - "8000:8000"
    environment:                  # 环境变量
      - KEY=VALUE
    env_file:                     # 环境变量文件
      - .env
    volumes:                      # 卷挂载
      - ./data:/app/data
    depends_on:                   # 依赖关系
      - db
    healthcheck:                  # 健康检查
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped       # 重启策略
    networks:                     # 网络配置
      - backend

networks:                          # 网络定义
  backend:
    driver: bridge

volumes:                           # 卷定义
  db-data:
```

### 32.1.6 健康检查指令

Docker 健康检查（HEALTHCHECK）让容器具备自愈感知能力，编排系统据此决定是否重启容器。

```dockerfile
HEALTHCHECK [选项] CMD <命令>
```

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--interval` | 30s | 检查间隔 |
| `--timeout` | 30s | 单次检查超时 |
| `--start-period` | 0s | 容器启动宽限期（此期间检查失败不计入 retries） |
| `--retries` | 3 | 连续失败次数后标记为 unhealthy |

健康状态流转：

```
starting ──(start-period 后)──► healthy
    │                              │
    │   (检查成功)                  │ (检查失败)
    ◄──────────────────────────    ▼
                               unhealthy
```

### 32.1.7 非 root 用户与安全基线

容器默认以 root 用户运行，这在安全审计中属于高风险项。Docker 提供了多层安全机制：

- `USER` 指令：切换运行时用户
- `--cap-drop`：丢弃 Linux capabilities
- `--security-opt no-new-privileges`：禁止权限提升
- `--read-only`：只读根文件系统

```dockerfile
# 非 root 用户的标准写法
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser
```

---

## 32.2 原理与机制

### 32.2.1 镜像分层与 UnionFS

Docker 镜像由多个只读层（layer）叠加而成，每层对应 Dockerfile 中的一条指令。容器运行时，在最上层添加可写层（container layer），所有运行时修改写入此层。

```
镜像层（只读）:
+-------------------+
| Layer N: CMD      |  ← 最上层
| Layer N-1: COPY   |
| Layer N-2: RUN    |
| Layer 1: FROM     |  ← 基础镜像
+-------------------+

容器层（可写）:
+-------------------+
| Container Layer   |  ← 运行时修改
+-------------------+
```

**层缓存机制**：当某层指令或其输入未变化时，Docker 直接复用缓存。这要求 Dockerfile 中将变化频率低的指令放在前面，变化频率高的放在后面。

**Copy-on-Write（CoW）**：当容器进程需要修改底层文件时，Docker 先将文件从只读层复制到可写层，然后在可写层修改。这意味着即使底层包含 1GB 的文件，修改单个文件也只占用该文件的额外空间。

### 32.2.2 多阶段构建的内部机制

多阶段构建本质上是在同一个 Dockerfile 中执行多次独立的镜像构建，每次 `FROM` 开启全新的构建上下文。`COPY --from` 跨阶段复制时，Docker 从指定阶段的最终镜像中提取文件，而非从构建缓存中提取。

```
Stage 1: builder
  FROM python:3.12 AS builder
  RUN pip install --user -r requirements.txt
  → 产出: /root/.local/lib/python3.12/site-packages/*

Stage 2: runtime
  FROM python:3.12-slim
  COPY --from=builder /root/.local /root/.local
  → 最终镜像仅含: python:3.12-slim + 依赖包 + 应用代码
  → 不含: gcc, make, 头文件, pip 缓存等构建工具
```

**源码视角**：Docker 的构建器（builder）在解析多阶段 Dockerfile 时，为每个 `FROM` 创建独立的 **stage** 对象。`COPY --from` 指令在执行时，先解析源 stage 的最终镜像 ID，然后从该镜像的层中提取指定路径的文件。Docker 守护进程的 `daemon.buildBuildOneStage()` 函数负责逐阶段执行构建。

### 32.2.3 Uvicorn Worker 进程模型

Uvicorn 的多 Worker 模式基于 **prefork** 模式：主进程先 fork 出指定数量的 Worker 子进程，每个 Worker 独立运行事件循环。

```
                    Main Process (Supervisor)
                    │
         ┌─────────┼─────────┐
         │         │         │
    Worker 1   Worker 2   Worker 3
    (asyncio)  (asyncio)  (asyncio)
         │         │         │
    ┌─────┐   ┌─────┐   ┌─────┐
    │Req A│   │Req C│   │Req E│
    │Req B│   │Req D│   │Req F│
    └─────┘   └─────┘   └─────┘
```

**源码分析**：Uvicorn 的 Worker 管理逻辑位于 `uvicorn/main.py`。当 `workers > 1` 时，Uvicorn 使用 `multiprocessing` 模块创建子进程：

```python
# uvicorn/main.py 简化逻辑
class Server:
    def run(self, sockets=None):
        if self.config.workers > 1:
            self.config.setup_event_loop()
            return Multiprocess(self.config, target=self.run, sockets=sockets)
        else:
            self.config.setup_event_loop()
            return Server(self.config)

class Multiprocess:
    def __init__(self, config, target, sockets):
        self.processes = []
        for _ in range(config.workers):
            proc = multiprocessing.Process(target=target, args=())
            proc.start()
            self.processes.append(proc)
        # 主进程监控子进程存活状态
        for proc in self.processes:
            proc.join()
```

**优雅关闭机制**：当收到 SIGTERM 信号时，Uvicorn 的 `Server.handle_exit()` 方法被触发：

```python
# uvicorn/server.py 简化逻辑
class Server:
    async def handle_exit(self, sig, frame):
        self.should_exit = True
        self.force_exit = False

        if self.config.graceful_timeout is not None:
            self.force_exit_handler = asyncio.get_event_loop().call_later(
                self.config.graceful_timeout,
                self.force_exit_handler_callback
            )

    async def force_exit_handler_callback(self):
        self.force_exit = True
        # 超时后不再等待，直接退出
```

这意味着 `--graceful-timeout` 控制了在 Docker 发送 SIGTERM 后，Uvicorn 愿意等待正在处理的请求完成的最大时间。超出此时间，进程将被强制终止。

### 32.2.4 Docker 网络与 DNS 解析

Docker Compose 创建的默认网络使用 bridge 驱动，并为每个服务分配 DNS 条目。服务间通信通过服务名解析：

```
服务名解析链:
app ──DNS──► db (172.20.0.2)
app ──DNS──► redis (172.20.0.3)
```

Docker 内置 DNS 服务器（127.0.0.11）监听容器内部的 DNS 查询，将服务名解析为对应容器的 IP 地址。这意味着 docker-compose 中的 `depends_on` 不仅控制启动顺序，还确保 DNS 条目在依赖服务就绪后才注册。

### 32.2.5 健康检查的实现机制

Docker 守护进程以独立 goroutine 周期性执行健康检查命令。检查命令在容器的 mount namespace 和 network namespace 中执行，使用容器的 PID 1 进程作为父进程。

状态转换逻辑（Docker 源码简化）：

```
health_status = "starting"

if start_period_elapsed:
    if check_succeeds:
        health_status = "healthy"
        consecutive_failures = 0
    else:
        consecutive_failures += 1
        if consecutive_failures >= retries:
            health_status = "unhealthy"
```

当容器被标记为 `unhealthy` 时，Docker 本身不会自动重启容器，但 docker-compose 的 `restart` 策略或 Kubernetes 的 liveness probe 会据此采取行动。

### 32.2.6 OCI 运行时与容器生命周期

Docker 镜像最终遵循 OCI（Open Container Initiative）规范，`docker build` 的产物可通过 `docker save` 导出为 OCI 兼容的 tar 包。容器生命周期由 OCI 运行时（默认为 runc）管理：

```
created ─► running ─► stopped
   │          │
   │    ┌─────┘
   │    ▼
   │  paused ─► running
   │
   └► running (restart policy)
```

理解 OCI 规范对 FastAPI 部署的意义：容器一旦创建，其根文件系统就是不可变的。任何运行时配置修改应通过环境变量或挂载卷实现，而非修改容器内部文件。

---

## 32.3 使用场景

### 32.3.1 开发环境标准化

团队成员使用不同操作系统和 Python 版本，导致"在我机器上能跑"的问题。通过 Docker 统一开发环境：

```bash
# 一条命令启动完整开发环境
docker-compose -f docker-compose.dev.yml up
```

### 32.3.2 CI/CD 流水线中的构建产物

Docker 镜像作为 CI/CD 的交付单元，确保从代码提交到生产部署的整个链条中使用完全相同的运行时环境：

```
代码提交 → 自动测试 → 构建镜像 → 推送镜像仓库 → 部署
```

### 32.3.3 微服务架构的服务隔离

在微服务架构中，每个 FastAPI 服务独立容器化，拥有自己的依赖版本和运行时配置，互不干扰：

```
┌─────────┐  ┌──────────┐  ┌─────────┐
│ User Svc│  │ Order Svc│  │ Pay Svc │
│ :8001   │  │ :8002    │  │ :8003   │
└─────────┘  └──────────┘  └─────────┘
```

### 32.3.4 弹性伸缩与 Kubernetes 集群

容器化是 Kubernetes 部署的前提。FastAPI 应用容器化后，可利用 K8s 的 HPA（Horizontal Pod Autoscaler）根据 CPU/内存/自定义指标自动扩缩容。

### 32.3.5 多环境一致性部署

同一镜像在不同环境（dev/staging/prod）中运行，仅通过环境变量区分配置：

```bash
# 开发环境
docker run -e ENV=dev -e DB_URL=sqlite:///dev.db myapp:latest

# 生产环境
docker run -e ENV=prod -e DB_URL=postgresql://... myapp:latest
```

### 32.3.6 灾难恢复与快速回滚

镜像版本化管理使得回滚操作秒级完成：

```bash
# 回滚到上一版本
docker run myapp:1.0.9   # 当前版本 1.1.0 出问题，回滚到 1.0.9
```

---

## 32.4 示例代码

### 32.4.1 生产级多阶段 Dockerfile

```dockerfile
# ============================================================
# 阶段1: 构建阶段 - 安装编译依赖和 Python 包
# ============================================================
FROM python:3.12-bookworm AS builder

# 构建参数
ARG PIP_VERSION=24.0
ARG POETRY_VERSION=1.8.2

WORKDIR /build

# 安装构建工具（仅构建阶段需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 升级 pip 并安装 poetry
RUN pip install --no-cache-dir --upgrade pip==${PIP_VERSION} \
    && pip install --no-cache-dir poetry==${POETRY_VERSION}

# 配置 poetry: 不创建虚拟环境（容器本身就是隔离环境）
RUN poetry config virtualenvs.create false

# 先复制依赖声明文件（利用层缓存）
COPY pyproject.toml poetry.lock ./

# 安装生产依赖到独立目录
RUN poetry install --no-dev --no-interaction --no-ansi \
    && pip install --no-cache-dir \
        pipdeptree \
    && pipdeptree -w silence-deprecated-warnings > /build/deps.txt

# ============================================================
# 阶段2: 运行时阶段 - 最小化镜像
# ============================================================
FROM python:3.12-slim-bookworm AS runtime

# 元数据标签
LABEL maintainer="devops@example.com"
LABEL description="FastAPI production image"
LABEL version="1.0.0"

# 安装运行时系统依赖（仅必要库）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge -y

# 创建非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# 从构建阶段复制安装好的 Python 包
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /build/deps.txt /app/deps.txt

# 复制应用代码（变化频率最高，放最后）
COPY --chown=appuser:appuser . .

# 环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8000

# 切换到非 root 用户
USER appuser

# 暴露端口
EXPOSE ${PORT}

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# 启动命令
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--timeout-keep-alive", "5", \
     "--graceful-timeout", "30", \
     "--limit-concurrency", "1000", \
     "--limit-max-requests", "10000", \
     "--access-log", \
     "--log-level", "info"]
```

### 32.4.2 FastAPI 应用与健康检查端点

```python
# app/main.py
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

# 应用启动时间（用于计算运行时长）
START_TIME = time.time()

# 模拟依赖服务状态
db_connected = True
redis_connected = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时：初始化连接池等
    print("Starting FastAPI application...")
    yield
    # 关闭时：清理资源
    print("Shutting down FastAPI application...")


app = FastAPI(
    title="Production FastAPI App",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    """
    基础健康检查 - Docker HEALTHCHECK 使用此端点
    仅检查进程是否存活
    """
    return {"status": "healthy", "timestamp": time.time()}


@app.get("/health/ready")
async def readiness_check():
    """
    就绪检查 - 确认应用可处理请求
    检查所有依赖服务是否可达
    """
    checks = {
        "database": db_connected,
        "redis": redis_connected,
    }

    all_healthy = all(checks.values())
    uptime = time.time() - START_TIME

    response = {
        "status": "ready" if all_healthy else "not_ready",
        "uptime_seconds": round(uptime, 2),
        "checks": checks,
    }

    if not all_healthy:
        return JSONResponse(status_code=503, content=response)

    return response


@app.get("/health/live")
async def liveness_check():
    """
    存活检查 - 确认进程未死锁
    如果此端点无法响应，说明进程存在严重问题
    """
    return {"status": "alive"}


@app.get("/")
async def root():
    return {"message": "FastAPI Docker Demo", "version": "1.0.0"}


@app.get("/api/items/{item_id}")
async def read_item(item_id: int):
    """示例业务端点"""
    return {"item_id": item_id, "name": f"Item {item_id}"}
```

### 32.4.3 docker-compose 生产编排

```yaml
# docker-compose.yml
version: "3.9"

services:
  # FastAPI 应用服务
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        PIP_VERSION: "24.0"
        POETRY_VERSION: "1.8.2"
    image: myapp:1.0.0
    container_name: myapp-api
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - ENV=production
      - DATABASE_URL=postgresql://appuser:secret@db:5432/appdb
      - REDIS_URL=redis://redis:6379/0
      - SECRET_KEY=${SECRET_KEY}
      - WORKERS=4
      - LOG_LEVEL=info
    env_file:
      - .env.production
    volumes:
      - app-logs:/app/logs
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - backend
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 1G
        reservations:
          cpus: "0.5"
          memory: 256M
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=100M

  # PostgreSQL 数据库
  db:
    image: postgres:16-bookworm
    container_name: myapp-db
    restart: unless-stopped
    environment:
      - POSTGRES_USER=appuser
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=appdb
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - backend
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M

  # Redis 缓存
  redis:
    image: redis:7-alpine
    container_name: myapp-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M

volumes:
  db-data:
    driver: local
  redis-data:
    driver: local
  app-logs:
    driver: local

networks:
  backend:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### 32.4.4 开发环境 docker-compose 覆盖文件

```yaml
# docker-compose.override.yml (开发环境自动加载)
version: "3.9"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: builder  # 使用构建阶段，保留调试工具
    command: >
      uvicorn app.main:app
      --host 0.0.0.0
      --port 8000
      --reload
      --log-level debug
    ports:
      - "8000:8000"
      - "5678:5678"  # debugpy 调试端口
    environment:
      - ENV=development
      - DATABASE_URL=postgresql://appuser:secret@db:5432/appdb
      - REDIS_URL=redis://redis:6379/0
      - DEBUG=true
    volumes:
      - .:/app  # 挂载源码实现热重载
      - app-logs:/app/logs
    healthcheck:
      disable: true  # 开发环境禁用健康检查

  db:
    ports:
      - "5432:5432"  # 暴露端口供本地工具连接

  redis:
    ports:
      - "6379:6379"  # 暴露端口供本地工具连接
```

### 32.4.5 .dockerignore 文件

```text
# .dockerignore
# 版本控制
.git
.gitignore
.github

# IDE
.vscode
.idea
*.swp
*.swo

# Python
__pycache__
*.pyc
*.pyo
*.pyd
.Python
*.so
*.egg
*.egg-info
dist
build
.eggs

# 虚拟环境
.venv
venv
env

# 测试与覆盖率
.pytest_cache
.coverage
htmlcov
.mypy_cache
.ruff_cache

# Docker
Dockerfile
docker-compose*.yml
.dockerignore

# 文档
docs
*.md
LICENSE

# 环境变量
.env
.env.*
!.env.example

# 日志
logs
*.log

# 操作系统
.DS_Store
Thumbs.db
```

### 32.4.6 镜像构建与运行脚本

```bash
#!/bin/bash
# scripts/docker-build.sh - 镜像构建脚本

set -euo pipefail

# 配置
IMAGE_NAME="myapp"
IMAGE_TAG="${1:-latest}"
REGISTRY="${REGISTRY:-docker.io/myorg}"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo "=========================================="
echo "Building Docker image: ${FULL_IMAGE}"
echo "=========================================="

# 构建镜像
docker build \
    --build-arg PIP_VERSION=24.0 \
    --build-arg POETRY_VERSION=1.8.2 \
    --no-cache \
    --label "org.opencontainers.image.source=https://github.com/myorg/myapp" \
    --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -t "${FULL_IMAGE}" \
    -f Dockerfile \
    .

# 验证镜像
echo ""
echo "Image built successfully!"
echo ""

# 查看镜像大小
docker images "${FULL_IMAGE}"

# 安全扫描（需要安装 trivy）
if command -v trivy &> /dev/null; then
    echo "Running security scan..."
    trivy image --severity HIGH,CRITICAL "${FULL_IMAGE}"
fi

# 推送到镜像仓库
if [ "${PUSH:-false}" = "true" ]; then
    echo "Pushing image to registry..."
    docker push "${FULL_IMAGE}"
fi

echo ""
echo "Done! Image: ${FULL_IMAGE}"
```

### 32.4.7 使用 Gunicorn 管理 Uvicorn Worker

对于更高可靠性的生产部署，推荐使用 Gunicorn 作为进程管理器，Uvicorn 作为 Worker class：

```dockerfile
# Dockerfile (Gunicorn + Uvicorn 方案)
FROM python:3.12-slim-bookworm AS runtime

RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser . .

USER appuser

ENV PORT=8000

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Gunicorn 启动命令
CMD ["gunicorn", "app.main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--max-requests", "10000", \
     "--max-requests-jitter", "1000", \
     "--access-logfile", "-", \
     "--log-level", "info"]
```

对应的 Gunicorn 配置文件：

```python
# gunicorn.conf.py
import multiprocessing

# Worker 配置
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "uvicorn.workers.UvicornWorker"

# 超时配置
timeout = 120          # Worker 超时（秒），处理长时间请求
graceful_timeout = 30  # 优雅关闭超时
keepalive = 5          # Keep-Alive 超时

# 请求限制
max_requests = 10000        # 单 Worker 最大请求数（防内存泄漏）
max_requests_jitter = 1000 # 随机抖动，避免所有 Worker 同时重启

# 绑定地址
bind = "0.0.0.0:8000"

# 日志
accesslog = "-"
loglevel = "info"

# 预加载应用（减少内存占用，但 Worker 间不能安全共享连接）
preload_app = False

# Worker 临时目录
worker_tmp_dir = "/dev/shm"  # 使用内存文件系统提升性能
```

### 32.4.8 完整的 Python 项目结构

```
project/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── api/                  # 路由模块
│   │   ├── __init__.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       └── endpoints/
│   ├── core/                 # 核心配置
│   │   ├── __init__.py
│   │   └── config.py
│   └── models/               # 数据模型
│       └── __init__.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   └── test_main.py
├── scripts/
│   └── docker-build.sh
├── Dockerfile
├── docker-compose.yml
├── docker-compose.override.yml
├── .dockerignore
├── gunicorn.conf.py
├── pyproject.toml
├── poetry.lock
└── .env.example
```

---

## 32.5 常见陷阱与最佳实践

### 32.5.1 陷阱：Dockerfile 层缓存失效导致构建变慢

**问题**：将 `COPY . .` 放在 `RUN pip install` 之前，任何代码修改都会导致依赖安装步骤缓存失效，重新下载所有包。

```dockerfile
# 错误：代码变化导致依赖安装缓存失效
COPY . .
RUN pip install -r requirements.txt

# 正确：先复制依赖声明，利用缓存
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
```

**原则**：变化频率低的指令放前面，变化频率高的放后面。

### 32.5.2 陷阱：Worker 数量过多导致资源争抢

**问题**：在 1 核 1GB 内存容器中设置 `--workers 8`，导致 CPU 上下文切换开销远大于并发收益。

**正确做法**：Worker 数量应匹配容器资源配额。

```bash
# 经验公式
workers = CPU_cores * 2 + 1

# 1 核容器: workers = 3
# 2 核容器: workers = 5
# 4 核容器: workers = 9
```

同时在 docker-compose 中设置资源限制：

```yaml
deploy:
  resources:
    limits:
      cpus: "2.0"
      memory: 1G
```

### 32.5.3 陷阱：以 root 用户运行容器

**问题**：默认 Docker 容器以 root 运行。如果攻击者通过应用漏洞获取容器内执行权限，将拥有 root 权限，可执行任意系统调用。

**最佳实践**：

```dockerfile
# 1. 创建专用用户
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 2. 确保文件权限正确
COPY --chown=appuser:appuser . .

# 3. 切换用户
USER appuser

# 4. docker-compose 中额外安全选项
security_opt:
  - no-new-privileges:true
read_only: true
tmpfs:
  - /tmp:size=100M
```

### 32.5.4 陷阱：健康检查端点执行重量级操作

**问题**：在 `/health` 端点中执行数据库查询或外部 API 调用。当依赖服务变慢时，健康检查超时，导致容器被标记为 unhealthy 并被重启，形成级联故障。

**最佳实践**：

```python
# 错误：健康检查依赖外部服务
@app.get("/health")
async def health_check():
    await db.execute("SELECT 1")  # 数据库慢 → 健康检查超时
    return {"status": "healthy"}

# 正确：分层健康检查
@app.get("/health")           # liveness: 仅检查进程存活
async def health():
    return {"status": "healthy"}

@app.get("/health/ready")     # readiness: 检查依赖服务
async def readiness():
    checks = {}
    try:
        await db.execute("SELECT 1")
        checks["database"] = True
    except Exception:
        checks["database"] = False
    return {"checks": checks}
```

### 32.5.5 陷阱：忽略 graceful shutdown

**问题**：容器停止时直接发送 SIGKILL，正在处理的请求被强制中断，可能导致数据不一致。

**最佳实践**：

```dockerfile
# Dockerfile 中设置 graceful timeout
CMD ["uvicorn", "app.main:app", \
     "--graceful-timeout", "30"]
```

```yaml
# docker-compose 中设置 stop_grace_period
services:
  app:
    stop_grace_period: 30s  # 等待 30 秒后再发送 SIGKILL
```

### 32.5.6 陷阱：镜像体积过大

**问题**：使用 `python:3.12` 完整镜像（约 1GB）而非 slim 变体（约 150MB），包含大量不必要的系统包。

**最佳实践**：

| 基础镜像 | 体积 | 适用场景 |
|----------|------|----------|
| `python:3.12` | ~1GB | 需要编译 C 扩展的构建阶段 |
| `python:3.12-slim` | ~150MB | 运行时阶段 |
| `python:3.12-alpine` | ~50MB | 无 C 扩展依赖的纯 Python 应用 |

**注意**：Alpine 使用 musl libc 而非 glibc，部分 Python 包的预编译 wheel 不兼容 Alpine，需要从源码编译，反而增大构建时间和镜像体积。推荐使用 slim 变体。

### 32.5.7 陷阱：在容器中存储持久数据

**问题**：应用日志或上传文件写入容器文件系统。容器重建后数据丢失。

**最佳实践**：

```yaml
# 使用 volume 持久化数据
volumes:
  - app-logs:/app/logs
  - app-uploads:/app/uploads
```

```python
# 日志输出到 stdout/stderr（容器最佳实践）
import logging
import sys

logging.basicConfig(
    stream=sys.stdout,  # 输出到 stdout，由 Docker 日志驱动收集
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
```

### 32.5.8 陷阱：.dockerignore 缺失或不完整

**问题**：没有 .dockerignore 文件，`COPY . .` 会将 `.git` 目录、虚拟环境、IDE 配置等全部复制到镜像中，导致镜像体积膨胀和构建变慢。

**最佳实践**：始终创建完整的 .dockerignore 文件，排除所有非必要文件（见 32.4.5 节）。

### 32.5.9 最佳实践清单

1. **始终使用多阶段构建**：构建阶段安装编译依赖，运行时阶段使用 slim 镜像
2. **固定基础镜像版本**：使用 `python:3.12-slim-bookworm` 而非 `python:3.12-slim`（防止 tag 漂移）
3. **以非 root 用户运行**：创建专用用户并切换
4. **设置健康检查**：区分 liveness 和 readiness
5. **利用层缓存**：先复制依赖声明，再复制代码
6. **限制容器资源**：在 docker-compose 中设置 CPU 和内存限制
7. **优雅关闭**：设置 `--graceful-timeout` 和 `stop_grace_period`
8. **日志输出到 stdout**：遵循容器日志最佳实践
9. **使用 .dockerignore**：减少构建上下文大小
10. **镜像安全扫描**：在 CI 中集成 Trivy 或 Snyk 扫描
11. **设置 Worker 数量匹配容器资源**：避免资源争抢
12. **使用 `--limit-max-requests`**：防止单 Worker 长期运行导致的内存泄漏
13. **预加载 vs 不预加载**：Gunicorn 的 `preload_app = True` 可减少内存，但 Worker 间无法安全共享数据库连接池
14. **使用 `--limit-concurrency`**：设置最大并发连接数，防止过载
15. **最小化暴露端口**：仅暴露必要端口，内部服务间通信不需要端口映射