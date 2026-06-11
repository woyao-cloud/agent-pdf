# 《深入理解 Prometheus》电子书 + 实验平台设计文档

## 概述

本项目旨在将《深入理解 Prometheus：时序监控原理、PromQL 实战与云原生高可用架构》大纲（见 `docs/Prometheus/plan.md`）转化为可交付的内容产品。产出形式为 **Markdown 电子书 + Docker Compose 实验环境**，二者互补：电子书讲解原理和最佳实践，实验环境提供可动手验证的配套代码。

## 项目范围

按 5 个 Phase 分阶段推进：

| Phase | 章节 | 主题 | 核心内容 |
|---|---|---|---|
| 1 | 第1~2章 | 底层原理与核心设计 | Pull 模型、TSDB、WAL、倒排索引 |
| 2 | 第3~6章 | 核心应用场景实战 | Spring Boot / K8s / 黑盒 / PromQL |
| 3 | 第7~8章 | 告警与高可用架构 | Alertmanager、Thanos / VictoriaMetrics |
| 4 | 第9~10章 | 生产问题排查与调优 | OOM、抓取失败、TSDB 损坏、内核参数 |
| 5 | 第11~13章 + 附录 | 开发者技能与工程化 | 自定义 Exporter、O11y 联动、工程规范 |

本文档覆盖 **Phase 1**。Phase 2~5 将在后续设计中覆盖。

## Phase 1 设计

### 目录结构

```
docs/Prometheus/
├── index.md                          # 书籍总入口（导航）
├── PART1-Principles/                 # 第一部分：解密 Prometheus
│   ├── 01-Pull-Model.md              # 第1章：监控哲学的重塑
│   ├── 02-TSDB-Storage.md            # 第2章：TSDB 存储引擎揭秘
│   └── assets/                       # 图片、图表、流程图
├── labs/
│   ├── ch01-pull-model/
│   │   ├── docker-compose.yml        # 第1章实验编排
│   │   ├── README.md                 # 实验说明
│   │   ├── push-app/                 # Push 模型模拟器 (Python)
│   │   │   ├── Dockerfile
│   │   │   ├── app.py                # Flask Push 接收器
│   │   │   └── requirements.txt
│   │   ├── pull-app/                 # Pull 指标暴露端 (Python)
│   │   │   ├── Dockerfile
│   │   │   ├── app.py                # Prometheus client 暴露 /metrics
│   │   │   └── requirements.txt
│   │   ├── scripts/
│   │   │   ├── benchmark-push.sh     # Push 压力测试脚本
│   │   │   └── benchmark-pull.sh     # Pull 压力测试脚本
│   │   └── prometheus/
│   │       └── prometheus.yml        # Pull 模型 scrape 配置
│   │
│   ├── ch02-tsdb/
│   │   ├── docker-compose.yml        # 第2章实验编排
│   │   ├── README.md                 # 实验说明
│   │   ├── high-card-gen/            # 高基数生成器 (Python)
│   │   │   ├── Dockerfile
│   │   │   ├── generator.py          # 高基数时序数据生成
│   │   │   └── requirements.txt
│   │   ├── data-generator/           # 正常时序数据生成 (Python)
│   │   │   ├── Dockerfile
│   │   │   ├── generator.py
│   │   │   └── requirements.txt
│   │   ├── scripts/
│   │   │   ├── tsdb-analyze.sh       # TSDB 分析脚本
│   │   │   ├── simulate-crash.sh     # WAL 崩溃模拟
│   │   │   └── watch-compaction.sh   # Compaction 观察
│   │   └── prometheus/
│   │       └── prometheus.yml        # TSDB 实验配置
```

### 第 1 章设计：监控哲学的重塑

#### 电子书大纲

**1.1 Push vs Pull 的历史演进**
- 监控系统的演进脉络：Nagios → Zabbix → Borgmon → Prometheus
- 传统 Push 模型的架构特征：Agent 主动上报 → Server 接收存储
- Push 的三大痛点：
  1. 状态管理复杂：Server 无法区分"没上报"和"正常为 0"
  2. 雪崩效应：大量 Agent 同时上报时 Server 过载
  3. 服务发现困难：新增 Agent 需修改 Server 配置
- Pull 模型的革命性思路：Server 主动拉取，目标暴露 /metrics 端点

**1.2 Pull 模型的三大优势**
- **健康自证明**：目标不响应 = 服务宕机，无需额外心跳机制
- **服务发现无缝集成**：基于文件（file_sd_configs）、DNS、Consul、K8s 服务发现，新目标自动加入抓取
- **开发者本地调试友好**：`curl localhost:8080/metrics` 即可查看指标，开箱即用

**1.3 多维数据模型**
- 时间序列本质：`{__name__="http_requests_total", method="GET", status="200"} 1024 @timestamp`
- 对比关系型数据库：`SELECT * FROM metrics WHERE metric='http_requests' AND method='GET'` → 笛卡尔积灾难
- Cardinality（基数）的核心概念：一个 Label 的取值数量

**1.4 四种指标类型**
- **Counter**：单调递增计数器，`rate()` / `increase()` 才有意义
- **Gauge**：可增可减的瞬时值
- **Histogram**：预定义 Bucket 的分桶统计（`_bucket{le="0.5"}` / `_sum` / `_count`），可聚合
- **Summary**：客户端计算分位数（`{quantile="0.95"}`），不可跨实例聚合

**1.5 本章小结**

#### 实验环境

**服务清单：**

| 服务 | 作用 | 暴露端口 |
|---|---|---|
| push-server | 模拟传统 Push 模式的指标收集 HTTP 端点 | 5000 |
| pull-app | 暴露 Prometheus 格式 /metrics 的示例应用 | 8080 |
| statsd-exporter | Push-to-Pull 桥接：StatsD UDP → Prometheus 指标 | 9102, 9125/udp |
| prometheus | Prometheus 核心，Pull 抓取所有目标 | 9090 |
| grafana | 可视化面板 | 3000 |

**实验 1：Push 雪崩效应模拟**
1. 启动 push-server，发送递增的并发请求（10→50→100→500）
2. 观察 push-server 响应延迟、内存占用、丢包率
3. 切换到 pull-app 同样的压力测试，Prometheus 通过重试和 backoff 机制自动消化

**实验 2：健康自证明**
1. 正常运行时 Prometheus targets 页面显示所有目标 UP
2. 停止 push-server 容器，Prometheus 在下一个 scrape_interval 自动标记为 DOWN
3. 重启后自动恢复为 UP，无需人工介入

**实验 3：StatsD Push-to-Pull 桥接**
1. 使用 nc 或 Python 向 statsd-exporter 发送 UDP 指标
2. 查看 statsd-exporter 的 /metrics 端点，确认 Push 的指标已被转化为 Prometheus 格式
3. Prometheus 抓取 statsd-exporter，完成"Push 接入 → Pull 采集"的整条链路

#### 核心示例代码

**push-app/app.py**（模拟 Push 接收器）：
```python
from flask import Flask, request, jsonify
import time
import threading

app = Flask(__name__)

# 内存中存储的指标
metrics_store = {}
lock = threading.Lock()
request_count = 0
error_count = 0

@app.route('/push', methods=['POST'])
def push_metric():
    global request_count, error_count
    data = request.json
    with lock:
        request_count += 1
        key = (data['metric'], data.get('value', 0))
        metrics_store[key] = metrics_store.get(key, 0) + 1
    return jsonify({"status": "ok"})

@app.route('/metrics')
def metrics():
    # 模拟暴露收集到的指标（但已滞后）
    lines = []
    with lock:
        for (metric, val), count in metrics_store.items():
            lines.append(f"push_{metric}{{count=\"{count}\"}} {val}")
    return "\n".join(lines) + "\n"

@app.route('/status')
def status():
    with lock:
        return jsonify({
            "total_requests": request_count,
            "error_rate": error_count / max(request_count, 1),
            "store_size": len(metrics_store)
        })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

**pull-app/app.py**（Pull 模型标准实现）：
```python
from prometheus_client import start_http_server, Counter, Histogram, generate_latest
import random
import time

REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint'])
REQUEST_DURATION = Histogram('http_request_duration_seconds', 'Request latency',
                             ['method'], buckets=[0.01, 0.05, 0.1, 0.5, 1, 5])

def handle_request(method, endpoint):
    with REQUEST_DURATION.labels(method=method).time():
        REQUEST_COUNT.labels(method=method, endpoint=endpoint).inc()
        time.sleep(random.uniform(0.01, 0.2))  # 模拟处理耗时

if __name__ == '__main__':
    start_http_server(8080)  # 暴露 /metrics
    while True:
        handle_request(random.choice(['GET', 'POST', 'PUT']),
                       random.choice(['/api/users', '/api/orders', '/api/products']))
```

### 第 2 章设计：TSDB 存储引擎揭秘

#### 电子书大纲

**2.1 时序数据库的存储挑战**
- 写入特征：千万级/秒持续写入、追加写为主、极少更新删除
- 存储挑战：高基数下内存爆炸、查询需扫描大量数据
- Prometheus TSDB 设计哲学：以空间换时间、充分利用时序数据的局部性

**2.2 Head Block 与 Persistent Block**
- **Head Block**：最近 2 小时数据全在内存，支持高速写入和查询
- **落盘流程**：Head Block 在 2 小时后被冻结（Freeze），写入磁盘成为 Persistent Block
- **Block 内部结构**：
  ```
  block/
  ├── chunks/           # 原始时间序列数据（压缩后）
  │   └── 000001         # Chunk 文件，每个最大 32KB
  ├── index/             # 倒排索引（mmap 映射）
  ├── meta.json          # Block 元信息（最小时间、最大时间、序列数）
  └── tombstones         # 删除标记（已删除数据的占位符）
  ```

**2.3 Compaction（压缩）机制**
- **触发时机**：磁盘上发现有多个小 Block 时
- **合并流程**：2 个 2h Block → 1 个 4h Block → 最终合并成 1 个 24h Block
- **去重优化**：同一时间序列在多个 Block 中的重复数据被合并为一条
- **下采样**：对历史数据的采样率降低，进一步压缩存储

**2.4 倒排索引与 Posting List**
- **为什么需要倒排索引**：无索引时查询 `{job="api", method="GET"}` 需扫描全量序列
- **索引结构**：
  ```
  Term Dictionary:                    Posting List:
  job="api"            ──────────▶    [1, 3, 5, 8, 12, ...]
  method="GET"         ──────────▶    [2, 5, 7, 8, 10, ...]
  status="200"         ──────────▶    [1, 2, 5, 8, 15, ...]
  
  交集查询 {job="api", method="GET"} → [5, 8]
  ```
- **mmap 内存映射**：索引文件通过 mmap 映射到虚拟内存，由操作系统管理物理内存的加载和换出
- **高基数的致命影响**：每个 Label 的 Posting List 大到无法缓存，查询退化为全表扫描

**2.5 WAL（Write-Ahead Log）机制**
- **写入三阶段**：
  1. WAL 追加写入（最快路径：顺序写磁盘）
  2. 更新 Head Block（内存操作）
  3. 定时 Checkpoint，清理旧的 WAL
- **崩溃恢复**：启动时扫描 WAL，重放未落盘的指标
- **WAL 格式**：每 128MB 自动切分一个新文件，支持压缩（`--storage.tsdb.wal-compression`）

**2.6 为什么 Prometheus 不适合做长期存储**
- 单机架构限制：单个实例无法扩展
- 无冗余备份：WAL 只保证 Crash Safety，不防磁盘损坏
- 解决方案预览：Remote Write / Thanos / VictoriaMetrics（第 8 章展开）

#### 实验环境

**服务清单：**

| 服务 | 作用 | 暴露端口 |
|---|---|---|
| data-generator | 正常的时序数据生成（3 种指标，少量 Label） | 8081 |
| high-card-gen | 高基数场景生成器（可配置 Label 种类和基数） | 8082 |
| prometheus | 启用 Admin API 的 Prometheus（可操作 TSDB） | 9090 |
| grafana | 可视化面板 | 3000 |

**高基数生成器设计（high-card-gen/generator.py）：**

```python
from prometheus_client import start_http_server, Gauge, Counter
import os
import itertools
import random
import time

class HighCardinalityGenerator:
    """可配置的高基数时序数据生成器
    
    通过环境变量控制 Label 种类和每个 Label 的基数：
    - CARD_ENDPOINT: endpoint 标签的基数（默认 5）
    - CARD_USER: user_id 标签的基数（默认 100，核心观察变量）
    - CARD_REGION: region 标签的基数（默认 3）
    - SCRAPE_INTERVAL: 生成间隔（默认 5）
    
    总时间序列数 = CARD_ENDPOINT × CARD_USER × CARD_REGION
    """
    
    def __init__(self):
        endpoint_card = int(os.getenv('CARD_ENDPOINT', '5'))
        user_card = int(os.getenv('CARD_USER', '100'))
        region_card = int(os.getenv('CARD_REGION', '3'))
        
        # 生成所有 Label 组合（笛卡尔积）
        endpoints = [f"/api/{i}" for i in range(endpoint_card)]
        users = [f"user_{i}" for i in range(user_card)]
        regions = ['us-east', 'eu-west', 'ap-southeast'][:region_card]
        
        self.series_count = endpoint_card * user_card * region_card
        print(f"Generating {self.series_count} time series "
              f"(endpoint={endpoint_card} × user={user_card} × region={region_card})")
        
        # 为每条序列创建一个 Gauge 和 Counter
        self.gauges = {}
        self.counters = {}
        for endpoint, user, region in itertools.product(endpoints, users, regions):
            labels = {'endpoint': endpoint, 'user_id': user, 'region': region}
            self.gauges[(endpoint, user, region)] = Gauge(
                'app_request_duration_ms', 'Request duration in ms', labels)
            self.counters[(endpoint, user, region)] = Counter(
                'app_requests_total', 'Total requests', labels)
    
    def run(self):
        interval = int(os.getenv('SCRAPE_INTERVAL', '5'))
        while True:
            for key, gauge in self.gauges.items():
                gauge.set(random.uniform(10, 500))
            for key, counter in self.counters.items():
                counter.inc(random.randint(0, 5))
            time.sleep(interval)

if __name__ == '__main__':
    gen = HighCardinalityGenerator()
    start_http_server(8082)
    gen.run()
```

**正常数据生成器设计（data-generator/generator.py）：**

```python
from prometheus_client import start_http_server, Gauge, Counter, Histogram
import random, time

class NormalGenerator:
    """模拟正常微服务场景的指标
    
    3 个常用指标，少量 Label：
    - http_requests_total{method, endpoint, status}
    - http_request_duration_seconds{method}
    - memory_usage_bytes{component}
    """
    
    METHODS = ['GET', 'POST', 'PUT', 'DELETE']
    ENDPOINTS = ['/api/users', '/api/orders', '/api/products']
    STATUSES = ['200', '201', '400', '500']
    COMPONENTS = ['heap', 'non-heap', 'cache', 'buffer']
    
    def __init__(self):
        self.requests = Counter('http_requests_total', 'Total requests',
                                ['method', 'endpoint', 'status'])
        self.duration = Histogram('http_request_duration_seconds', 'Request latency',
                                  ['method'], buckets=[0.01, 0.05, 0.1, 0.5, 1])
        self.memory = Gauge('memory_usage_bytes', 'Memory usage', ['component'])
    
    def run(self):
        while True:
            for method in self.METHODS:
                for endpoint in self.ENDPOINTS:
                    status = random.choices(self.STATUSES, weights=[0.7, 0.15, 0.1, 0.05])[0]
                    self.requests.labels(method=method, endpoint=endpoint, status=status).inc()
                    with self.duration.labels(method=method).time():
                        time.sleep(random.uniform(0.01, 0.15))
            for comp in self.COMPONENTS:
                self.memory.labels(component=comp).set(random.randint(100, 2000))
            time.sleep(5)

if __name__ == '__main__':
    gen = NormalGenerator()
    start_http_server(8081)
    gen.run()
```

#### 四个核心实验

**实验 1：正常数据流观察**
```bash
# 启动环境
docker compose up -d

# 观察 TSDB 内部结构
docker exec ch02-tsdb-prometheus-1 ls -la /prometheus/
docker exec ch02-tsdb-prometheus-1 ls -la /prometheus/wal/
docker exec ch02-tsdb-prometheus-1 cat /prometheus/01*/meta.json

# 用 promtool 分析
docker exec ch02-tsdb-prometheus-1 promtool tsdb analyze /prometheus
```

**实验 2：高基数灾难现场**
```bash
# 启动低基数配置 → 观察正常状态
CARD_USER=10 docker compose up -d
docker exec ch02-tsdb-prometheus-1 promtool tsdb analyze /prometheus

# 逐步增加基数 → 观察膨胀
CARD_USER=100 docker compose up -d
# 再次运行分析，对比 Top 10 指标的序列数变化

CARD_USER=1000 docker compose up -d
# 观察：内存占用、scrape 耗时、查询响应时间的变化
```

**实验 3：WAL 崩溃恢复**
```bash
# 生成数据
docker compose up -d
sleep 60

# 模拟进程崩溃
docker kill --signal=KILL ch02-tsdb-prometheus-1

# 查看 WAL 目录
docker compose start prometheus
docker logs ch02-tsdb-prometheus-1 | grep -i wal

# 模拟 WAL 损坏
docker compose stop prometheus
# 删除最新的 WAL 段
docker exec ... rm /prometheus/wal/$(ls -t /prometheus/wal/ | tail -1)
docker compose start prometheus
# 观察："WAL truncation failed" 或 "corrupted segment"
# 使用 promtool 修复
docker exec ... promtool tsdb clean-tombstones /prometheus
```

**实验 4：Compaction 过程**
```bash
# 设置短 retention 加速观察
# prometheus.yml 中添加:
# --storage.tsdb.retention.time=30m
# --storage.tsdb.min-block-duration=5m

docker compose up -d
watch -n 30 'docker exec ch02-tsdb-prometheus-1 ls -lh /prometheus/ | grep -v "^total"'
# 观察小 block 逐渐合并成大 block
# 查看 compaction 日志
docker logs -f ch02-tsdb-prometheus-1 | grep -i compact
```

### Prometheus 配置

**第 1 章 prometheus.yml：**
```yaml
global:
  scrape_interval: 10s
  evaluation_interval: 10s

scrape_configs:
  # Pull 模型核心示例：Pull App
  - job_name: 'pull-app'
    static_configs:
      - targets: ['pull-app:8080']
  
  # StatsD Exporter（Push-to-Pull 桥接）
  - job_name: 'statsd-exporter'
    static_configs:
      - targets: ['statsd-exporter:9102']
  
  # Prometheus 自身
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

**第 2 章 prometheus.yml：**
```yaml
global:
  scrape_interval: 5s
  evaluation_interval: 15s

# Admin API 用于 TSDB 分析
# command 添加: --web.enable-admin-api

scrape_configs:
  - job_name: 'data-generator'
    static_configs:
      - targets: ['data-generator:8081']
  
  - job_name: 'high-card-gen'
    scrape_interval: 5s
    static_configs:
      - targets: ['high-card-gen:8082']
    # 可选：用 metric_relabel_configs 演示高基数防护
    # metric_relabel_configs:
    #   - regex: 'user_id'
    #     action: labeldrop
```

## Phase 2 设计

Phase 2 覆盖第 3~6 章，聚焦核心应用场景实战。

| 章节 | 主题 | 技术栈 | 实验类型 |
|------|------|--------|---------|
| 第3章 | Spring Boot 微服务监控 | Micrometer + Actuator + Prometheus | Docker Compose (含 Spring Boot 应用) |
| 第4章 | Kubernetes 云原生监控 | Prometheus Operator + Node Exporter + cAdvisor + kube-state-metrics | kind + manifests 双方案 |
| 第5章 | 黑盒监控与 SLA | Blackbox Exporter + PromQL | Docker Compose (外部探测) |
| 第6章 | PromQL 深度解析 | Recording Rules + PromQL 调优 | Docker Compose + 专用数据集 |

### 端口规划

| 章节 | Prometheus | Grafana | 其他 |
|------|-----------|---------|------|
| ch03 (Spring Boot) | 9093 | 3003 | Spring Boot: 8085 |
| ch04 (K8s) | 9094 | 3004 | — |
| ch05 (Blackbox) | 9095 | 3005 | Blackbox: 9115, Web Target: 8086 |
| ch06 (PromQL) | 9096 | 3006 | 数据生成器: 8087 |

### 第 3 章设计：微服务应用级监控（Spring Boot）

#### 电子书大纲

**3.1 Micrometer 门面模式**
- Micrometer 的核心定位：指标采集的 SLF4J
- MeterRegistry、Meter、Counter、Timer、Gauge、DistributionSummary 概念
- Spring Boot Actuator 自动装配：`micrometer-registry-prometheus`

**3.2 内置指标详解**
- JVM 指标：`jvm_memory_used_bytes`、`jvm_gc_pause_seconds`、`jvm_threads_live_threads`
- Tomcat 指标：`tomcat_sessions_active_current_sessions`
- 数据源指标：`hikaricp_connections_active`
- HTTP 请求指标：`http_server_requests_seconds`（附带 method/uri/status 标签）

**3.3 自定义业务指标**
- `@Timed` 注解的使用
- MeterRegistry 注入，手动注册 Counter/Timer/Gauge
- 业务指标示例：`order_created_total`、`payment_processing_seconds`

**3.4 潜在风险与优化**
- **高基数灾难**：动态 URI path（如 `/api/user/12345`）作为 Label → OOM
- **JVM Full GC 导致 scrape 超时**：应用暂停 → Prometheus 认为 DOWN
- **Relabeling 防高基数**：`metric_relabel_configs` 正则泛化 URI
- **Histogram Bucket 优化**：根据业务特征调整 bucket 边界

**3.5 示例配置**
```yaml
# Prometheus relabeling 防止高基数
metric_relabel_configs:
  # 将 /api/user/12345/info 泛化为 /api/user/{id}/info
  - source_labels: [__name__, uri]
    regex: 'http_server_requests_seconds_count;/api/user/\d+.*'
    target_label: uri
    replacement: '/api/user/{id}/info'
  # 丢弃 trace_id 等高基数标签
  - regex: 'trace_id'
    action: labeldrop
```

#### 实验环境

```
labs/ch03-springboot/
├── docker-compose.yml
├── README.md
├── spring-boot-app/
│   ├── Dockerfile
│   ├── pom.xml
│   ├── src/main/java/com/demo/
│   │   ├── Application.java
│   │   ├── controller/
│   │   │   ├── UserController.java      # 含高基数风险的端点
│   │   │   └── OrderController.java
│   │   └── metrics/
│   │       └── CustomMetricsConfig.java
│   └── src/main/resources/
│       └── application.yml
├── prometheus/
│   └── prometheus.yml                   # 含 relabeling 配置
└── scripts/
    └── generate-traffic.sh              # 模拟用户请求
```

**三个核心实验：**

**实验 1：标准 JVM 指标采集**
1. 启动 Spring Boot + Prometheus + Grafana
2. 观察 `jvm_memory_used_bytes{area="heap"}`、`jvm_gc_pause_seconds`
3. 导入 JVM (Micrometer) Dashboard

**实验 2：高基数灾难 + Relabeling 防护**
1. 通过 `generate-traffic.sh` 向 `UserController` 发送大量带动态 ID 的请求
2. 观察 `http_server_requests_seconds_count` 的序列数膨胀
3. 启用 `prometheus.yml` 中的 `metric_relabel_configs`
4. 对比启用前后的序列数差异

**实验 3：自定义业务指标**
1. 验证 `order_created_total`、`payment_processing_seconds` 被 Prometheus 采集
2. 在 Grafana 中创建业务指标面板

### 第 4 章设计：Kubernetes 云原生监控体系

#### 电子书大纲

**4.1 Prometheus Operator 架构**
- CRD 体系：Prometheus / ServiceMonitor / PodMonitor / PrometheusRule / Alertmanager
- Operator 模式：自动管理 Prometheus 实例的创建、更新、销毁

**4.2 核心组件协同**
- **Node Exporter**：主机级指标，DaemonSet 部署
- **cAdvisor**：内嵌在 Kubelet 中，`container_*` 指标
- **kube-state-metrics**：K8s 对象状态指标
- 三者的数据关联方式

**4.3 潜在风险与优化**
- API Server 压力：ServiceMonitor 数量过多导致频繁 reload
- Pod 生命周期短：已销毁 Pod 的指标残留在 TSDB 中
- 优化：调整 `scrape_interval`、RBAC 限制监听范围、`honor_labels` 的正确使用

#### 实验环境

提供两套方案：

**方案 A：kind（推荐）**
```
labs/ch04-kubernetes/
├── README.md
├── kind/
│   ├── kind-config.yaml         # 1 control + 1 worker
│   ├── setup-cluster.sh         # 一键创建 kind 集群
│   ├── teardown.sh
│   └── deploy-all.sh            # 部署所有组件
├── manifests/
│   ├── namespace.yaml
│   ├── prometheus/
│   │   ├── operator.yaml        # Prometheus Operator
│   │   ├── rbac.yaml
│   │   ├── servicemonitor.yaml  # ServiceMonitor 定义
│   │   └── prometheus.yaml      # Prometheus CR 实例
│   ├── exporters/
│   │   ├── node-exporter.yaml   # DaemonSet + Service + ServiceMonitor
│   │   └── kube-state-metrics.yaml
│   └── sample-app/
│       ├── deployment.yaml      # 含 metrics 端点的演示应用
│       └── service.yaml
├── grafana/
│   └── dashboards/
│       ├── node-exporter-full.json
│       └── k8s-cluster-monitoring.json
└── scripts/
    └── port-forward.sh          # kubectl port-forward 到 localhost
```

**方案 B：仅 Manifests**
在已有 K8s 集群上直接 `kubectl apply -f manifests/` 即可。

#### 四个核心实验

**实验 1：Node Exporter 主机监控**
- 使用 `rate(node_cpu_seconds_total[1m])` 计算 CPU 使用率
- `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100` 计算内存使用率
- `node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100` 计算磁盘使用率

**实验 2：cAdvisor 容器监控**
- `container_cpu_usage_seconds_total{namespace="default"}` 容器 CPU
- `container_memory_usage_bytes{namespace="default"}` 容器内存
- `rate(container_cpu_usage_seconds_total[5m])` 容器 CPU 使用率

**实验 3：kube-state-metrics 对象状态**
- `kube_pod_status_phase{phase="Running"}` → 运行中的 Pod 数
- `kube_deployment_status_replicas_available` → 可用副本数
- `kube_node_status_condition{condition="Ready",status="true"}` → 节点健康

**实验 4：ServiceMonitor 声明式服务发现**
1. 部署 Sample App，查看没有 ServiceMonitor 时 Prometheus 是否抓取
2. 创建 ServiceMonitor，确认 Prometheus 自动发现目标
3. 删除 ServiceMonitor，确认 scrape 自动停止

### 第 5 章设计：黑盒监控与 SLA 探测

#### 电子书大纲

**5.1 黑盒 vs 白盒监控**
- 白盒：应用内部的 /metrics 端点，看到的是"我有什么"
- 黑盒：从外部探测，看到的是"用户能访问吗"
- 两者互补：白盒定位问题，黑盒感知影响

**5.2 Blackbox Exporter 的探测协议**
- **HTTP**：状态码、响应时间、SSL 证书信息、重定向追踪
- **TCP**：端口可达性、连接延迟
- **ICMP**：Ping 延迟、丢包率
- **DNS**：域名解析时间、SOA 记录查询

**5.3 模块化配置**
```yaml
modules:
  http_2xx:
    prober: http
    http:
      valid_status_codes: [200, 201, 302]
      follow_redirects: true
  tcp_connect:
    prober: tcp
  icmp:
    prober: icmp
  dns_query:
    prober: dns
    dns:
      query_type: A
```

**5.4 SLA 计算 PromQL**
```promql
# 30 天滚动窗口 SLA
avg_over_time(probe_success{job="blackbox-http"}[30d]) * 100

# 99.9% 黄金指标告警
avg_over_time(probe_success{job="blackbox-http"}[30d]) * 100 < 99.9
```

#### 实验环境

```
labs/ch05-blackbox/
├── docker-compose.yml
├── README.md
├── blackbox-exporter/
│   └── config.yml
├── prometheus/
│   ├── prometheus.yml
│   └── rules/
│       └── sla-rules.yml     # Recording Rules
├── web-target/
│   ├── Dockerfile
│   └── default.conf
└── scripts/
    └── simulate-outage.sh
```

#### 三个核心实验

**实验 1：多种协议探测**
```bash
curl 'http://localhost:9115/probe?module=http_2xx&target=http://web-target'
curl 'http://localhost:9115/probe?module=icmp&target=8.8.8.8'
curl 'http://localhost:9115/probe?module=dns_query&target=google.com'
```

**实验 2：证书过期监控**
- `probe_ssl_earliest_cert_expiry` → Unix 时间戳
- `probe_ssl_earliest_cert_expiry - time()` → 剩余秒数
- `(probe_ssl_earliest_cert_expiry - time()) / 86400 < 30` → 30 天内过期告警

**实验 3：SLA 可用性计算**
- Recording Rule 预计算 30d / 7d / 24h 滚动 SLA
- `simulate-outage.sh` 模拟目标宕机 → 观察 SLA 百分比下降

### 第 6 章设计：PromQL 深度解析与性能调优

#### 电子书大纲

**6.1 向量类型与匹配机制**
- Instant Vector vs Range Vector
- `on()` 和 `ignoring()` 的语义
- `group_left` 多对一 / `group_right` 一对多

**6.2 rate() vs irate()**
- `rate[1m]`：窗口内平均速率，平滑但有延迟
- `irate[5m]`：最后两点的瞬时速率，敏感但锯齿
- 适用场景：CPU 突刺用 irate，QPS 趋势用 rate

**6.3 性能杀手排查**
- 未限制的通配符：`sum(metric{})` → 扫描全量序列
- Range Vector 时间窗口：窗口越长 → 内存越大
- Subquery：`avg(rate(metric[5m])[30m:1m])` → 嵌套查询代价翻倍

**6.4 Recording Rules**
```yaml
groups:
  - name: default
    rules:
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)
```

#### 实验环境

```
labs/ch06-promql/
├── docker-compose.yml
├── README.md
├── prometheus/
│   ├── prometheus.yml
│   └── rules/
│       ├── recording-rules.yml
│       └── demo-rules.yml
├── promql-generator/
│   ├── Dockerfile
│   └── generator.py           # 多模式数据
├── datasets/
│   └── queries.md             # PromQL 练习集
└── scripts/
    ├── benchmark-query.sh
    └── explain-vector.sh
```

#### 三个核心实验

**实验 1：rate vs irate 对比**
- 生成带瞬发突刺的指标
- 同时在 Grafana 叠加 `rate[1m]` 和 `irate[5m]`
- 观察差异

**实验 2：Recording Rules 性能对比**
- 不启用 recording rules → 记录查询耗时
- 启用 recording rules → 查询预计算结果
- 对比差异

**实验 3：向量匹配练习**
```promql
# 每个 method 的请求数占比
http_requests_total / on() group_left sum(http_requests_total) by (method)
```

## Phase 3 设计

Phase 3 覆盖第 7~8 章，聚焦告警治理与高可用架构。

| 章节 | 主题 | 技术栈 | 实验类型 |
|------|------|--------|---------|
| 第7章 | Alertmanager 告警路由与降噪 | Alertmanager + 路由树 + Inhibition + Webhook | Docker Compose (含告警生成器、Webhook 接收器) |
| 第8章 | 高可用与长期存储 | Thanos (Sidecar+MinIO+Query) + VictoriaMetrics | Docker Compose (两套独立方案) |

### 端口规划

| 章节 | 服务 | 端口 |
|------|------|------|
| ch07 | Prometheus | 9097 |
| ch07 | Grafana | 3007 |
| ch07 | Alertmanager | 9093 |
| ch07 | MailHog | 8025 (Web UI), 1025 (SMTP) |
| ch07 | webhook-receiver | 5002 |
| ch07 | alert-generator | 8088 |
| ch08 (Thanos) | Prometheus-1 | 9098 |
| ch08 (Thanos) | Prometheus-2 | 9099 |
| ch08 (Thanos) | Grafana | 3008 |
| ch08 (Thanos) | MinIO Console | 9001 |
| ch08 (Thanos) | MinIO API | 9000 |
| ch08 (Thanos) | Thanos Query | 10902 |
| ch08 (VM) | VictoriaMetrics | 8428 |
| ch08 (VM) | Prometheus (source) | 9100 |

### 第 7 章设计：Alertmanager 深度剖析与告警降噪

#### 电子书大纲

**7.1 Alertmanager 三大核心机制**
- **分组（Grouping）**：将同类告警合并为一条通知。关键参数：`group_wait`、`group_interval`、`repeat_interval`
- **抑制（Inhibition）**：当某条告警触发时，抑制与其相关的其他告警。典型场景：机房断网→抑制该机房所有主机告警
- **静默（Silences）**：在窗口期内手动屏蔽指定告警，常用于"已知问题，正在修复"的场景

**7.2 路由树设计**
- Alertmanager 的路由树基于 Label 匹配，支持多级分发
- 示例：P0→电话/PagerDuty，P1→短信/钉钉，P2→邮件
- 路由树的匹配顺序和默认路由

**7.3 告警风暴治理**
- **问题**：阈值设置不合理，缺乏 `for` 持续时间判定 → 告警频繁抖动 → "狼来了"效应
- **方案 1**：为告警规则添加 `for: 5m`，确保持续 5 分钟才触发
- **方案 2**：合理设置告警阈值（预留 buffer，如内存 80% 告警、90% 紧急）
- **方案 3**：Inhibition 规则消除级联告警

**7.4 实战配置**
- Webhook 集成钉钉/飞书/企业微信
- 告警恢复通知配置
- `resolve_timeout` 与告警自动解决

#### 实验环境

```
labs/ch07-alertmanager/
├── docker-compose.yml
├── README.md
├── alertmanager/
│   └── config.yml              # 路由树 + 分组 + 抑制 + Webhook
├── prometheus/
│   ├── prometheus.yml
│   └── rules/
│       └── alerts.yml           # 告警规则（含 for 持续判定）
├── alert-generator/             # Python 模拟告警触发
│   ├── Dockerfile
│   └── generator.py
├── webhook-receiver/            # 捕获并展示告警
│   ├── Dockerfile
│   └── app.py
└── scripts/
    └── simulate-outage.sh       # 模拟"机房断网"
```

**四个核心实验：**

**实验 1：路由树与分级分发**
1. 启动环境
2. P0 告警触发→webhook-receiver 显示告警
3. P2 告警触发→MailHog 收到邮件通知
4. 验证不同的路由匹配

**实验 2：分组与告警降噪**
1. 触发 10 个同类型的 `host_high_cpu` 告警（不同 instance）
2. 未分组前：10 条独立告警
3. 配置分组后：仅收到 1 条聚合告警 `[10] 实例 CPU 过高`

**实验 3：Inhibition 抑制**
1. 触发 `datacenter_down` 告警（模拟机房断网）
2. 该机房的所有 `host_down` 告警被自动抑制
3. 其他机房的 `host_down` 告警依然正常发送

**实验 4：告警恢复通知**
1. 触发告警后，模拟问题修复
2. 观察 Alertmanager 发送告警恢复通知到 Webhook

### 第 8 章设计：高可用与长期存储

#### 电子书大纲

**8.1 联邦集群（Federation）**
- 架构：边缘 Prometheus 抓取细节数据，全局 Prometheus 从边缘拉取聚合
- 适用场景：多机房、多集群
- `honor_labels` 在联邦中的用法

**8.2 Thanos 架构**
- Sidecar：附加在 Prometheus 旁，将 Block 上传到对象存储
- Store Gateway：从对象存储读取数据
- Query：全局聚合查询，实现跨 Prometheus 的全局视图
- Compactor：下采样和压缩历史 Block

**8.3 VictoriaMetrics**
- 单节点 vs 集群模式
- Remote Write 协议兼容性
- 更高的压缩率和更低的资源占用

**8.4 架构选型指南**
- 小型部署（<10 台主机）：Prometheus 单机 + 长 retention
- 中型部署（<100 台）：VictoriaMetrics 单节点
- 大型部署（>100 台或跨集群）：Thanos 全栈

#### 实验环境

**Thanos 方案：**
```
labs/ch08-ha-storage/thanos/
├── docker-compose.yml
├── prometheus1/
│   └── prometheus.yml
├── prometheus2/
│   └── prometheus.yml
└── scripts/
    └── query-compare.sh
```

**VM 方案：**
```
labs/ch08-ha-storage/victoriametrics/
├── docker-compose.yml
├── prometheus/
│   └── prometheus.yml      # remote_write 配置
└── scripts/
    └── storage-check.sh
```

**五个核心实验：**

**实验 1：联邦集群**
- 两个 Prometheus 实例各自抓取不同的模拟目标
- 全局 Prometheus 通过 `/federate` 端点拉取聚合数据

**实验 2：Thanos Sidecar + MinIO**
- Sidecar 自动上传 Block 到 MinIO
- `thanos tools bucket verify` 验证数据完整性

**实验 3：Thanos Query 全局视图**
- 查询 `up` 指标，看来自两个 Prometheus 的数据合并展示
- 对比单机查询和 Thanos Query 的结果差异

**实验 4：VM Remote Write**
- Prometheus 配置远程写入 VM
- 停止 Prometheus 后，VM 中的数据依然可查

**实验 5：存储压缩率对比**
- 同数据集写入 Prometheus 和 VM
- 对比磁盘占用

## 文件与配置约定

- Python 实验应用：统一使用 `prometheus_client` 库（`pip install prometheus-client`）
- Docker Compose 版本：所有 Compose 文件使用 version '3.8'
- 端口规划：ch07→9097/3007/9093/8025/1025/5002/8088, ch08→9098/9099/3008/9000/9001/10902/8428/9100
- 数据持久化：命名 volume 如 `prometheus_data_ch0X`
- 日志规范：所有实验附带 README.md，包含实验目的、步骤、预期结果和观察要点