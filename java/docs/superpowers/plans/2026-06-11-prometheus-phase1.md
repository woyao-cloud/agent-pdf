# Prometheus Book Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Chapters 1-2 of the Prometheus book (Markdown ebook + Docker Compose lab environment) under `docs/Prometheus/`.

**Architecture:** Two parallel tracks — ebook content (`PART1-Principles/`) and lab environment (`labs/`). Each lab is self-contained with its own `docker-compose.yml` and Python services. Python apps use `prometheus_client` library for Prometheus metrics exposition.

**Tech Stack:** Python 3 + prometheus_client, Flask, Docker Compose, Prometheus v2.48, Grafana 10.2, StatsD Exporter

---

### Task 1: Create Book Index Page

**Files:**
- Create: `docs/Prometheus/index.md`

- [ ] **Step 1: Write index.md**

```markdown
# 《深入理解 Prometheus：时序监控原理、PromQL 实战与云原生高可用架构》

> 本书是一本系统化、实战化的 Prometheus 技术书籍，从底层时序数据库原理到生产级高可用架构，覆盖云原生时代监控的核心痛点与解决方案。

## 内容结构

### 第一部分：解密 Prometheus——底层原理与核心设计
| 章节 | 主题 | 实验 |
|------|------|------|
| [第1章：监控哲学的重塑](PART1-Principles/01-Pull-Model.md) | Pull 模型、多维数据模型、指标类型 | [Pull vs Push 对比实验](labs/ch01-pull-model/README.md) |
| [第2章：TSDB 存储引擎揭秘](PART1-Principles/02-TSDB-Storage.md) | Head Block、Compaction、倒排索引、WAL | [TSDB 存储引擎实验](labs/ch02-tsdb/README.md) |

### 第二部分：核心应用场景实战（待补充）
### 第三部分：告警与高可用架构（待补充）
### 第四部分：生产问题排查与调优（待补充）
### 第五部分：开发者技能与工程化（待补充）

## 快速开始

```bash
# 第1章实验：Pull vs Push 模型对比
cd labs/ch01-pull-model
docker compose up -d

# 第2章实验：TSDB 存储引擎
cd labs/ch02-tsdb
docker compose up -d
```

## 环境要求
- Docker & Docker Compose
- Python 3.8+
- 浏览器（访问 Prometheus / Grafana UI）
```

---

### Task 2: Write Chapter 1 Ebook

**Files:**
- Create: `docs/Prometheus/PART1-Principles/01-Pull-Model.md`

- [ ] **Step 1: Write Chapter 1 markdown**

Write `01-Pull-Model.md` with full content covering:

1. **Push vs Pull 的历史演进** (15+ paragraphs)
   - Nagios/Zabbix 时代：Agent 定期上报的 Push 模式
   - 核心痛点：状态管理复杂、雪崩效应、服务发现困难
   - Google Borgmon 的创新：Pull 模型的诞生
   - Prometheus 的设计哲学：目标健康的"自证明"

2. **Pull 模型的三大优势** (10+ paragraphs)
   - 健康自证明：Scrape 超时 = 服务宕机
   - 服务发现：static_configs → file_sd_configs → Consul → K8s SD
   - 本地调试友好：curl localhost:8080/metrics

3. **多维数据模型** (10+ paragraphs)
   - Time Series 四元组定义
   - 关系型数据库存储监控数据的笛卡尔积灾难（给具体数值举例）
   - Label Cardinality 概念引入

4. **四种指标类型** (20+ paragraphs)
   - Counter：`$ schema = rate / increase`
   - Gauge：CPU/内存等瞬时值
   - Histogram：bucket/_sum/_count 三件套，为什么可聚合
   - Summary：`{quantile="0.95"}`，为什么不可跨实例聚合

Each section should include:
- 原理讲解
- 对比表格（如 Push vs Pull 对比表）
- 实际代码片段展示
- 常见误区 / 注意事项

```markdown
# 第1章 监控哲学的重塑：Pull 模型与多维数据模型

## 1.1 Push vs Pull：为什么 Prometheus 选择了"拉"？

### 传统 Push 模型的架构

在 Prometheus 出现之前，Zabbix、Nagios 等传统监控系统普遍采用 Push 模型...

### Push 模型的三大痛点

| 痛点 | 描述 | 后果 |
|------|------|------|
| 状态管理复杂 | Server 无法区分"目标已宕机"和"指标正常为 0" | 误告警频发 |
| 雪崩效应 | 大量 Agent 同时上报导致 Server 过载 | 监控系统自身崩溃 |
| 服务发现困难 | 新增目标需修改 Server 配置 | 运维成本高 |

### Pull 模型的诞生

Google 在 Borg 集群管理系统中设计了 Borgmon，首次采用 Pull 模型...

## 1.2 Pull 模型的三大优势

### 健康自证明

Pull 模型最优雅的设计之一是：**抓取操作的超时本身就是健康检查**...

### 服务发现无缝集成

```yaml
# Prometheus 支持多种服务发现方式
scrape_configs:
  - job_name: 'microservice'
    # 静态配置
    static_configs:
      - targets: ['localhost:8080']
    
    # 文件发现（自动检测变化）
    # file_sd_configs:
    #   - files: ['targets/*.json']
```

### 本地调试

```bash
# 开发时直接查看应用的指标输出
curl http://localhost:8080/metrics
# 输出类似：
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
# http_requests_total{method="GET"} 1024
```

## 1.3 核心数据模型：Metric + Labels

### 时间序列的本质

Prometheus 中每条时间序列由四个部分组成：
```
metric_name{label1="val1", label2="val2"} value timestamp
```

### 为什么不用关系型数据库？

假设有三个维度：method（4种）、endpoint（10种）、status（5种）
- 关系型：1 张表 × N 行，每次查询需 WHERE 过滤
- Prometheus：4×10×5 = 200 条独立时间序列，按 Label 倒排索引查询
- 数量级差异：查询遍历 1M 行 vs 直接定位 50 条序列

## 1.4 四种核心指标类型

### Counter（计数器）

单调递增的累计值。关键规则：**只看 Counter 绝对值没有意义**，必须配合 rate() 或 increase()。

```python
# 正确
rate(http_requests_total[5m])  # 每秒请求速率

# 错误——没有意义
http_requests_total  # 只是一个不断增长的数
```

### Gauge（仪表盘）

可增可减的瞬时快照，适合 CPU 使用率、内存占用、队列长度。

```python
# Gauge 的典型用法——直接看原始值
memory_usage_bytes{component="heap"}
```

### Histogram（直方图）

预定义 Bucket 的分桶统计，包含三组序列：
- `_bucket{le="0.1"}` — 耗时 ≤ 0.1s 的请求数
- `_bucket{le="+Inf"}` — 总请求数（等同于 _count）
- `_sum` — 总耗时
- `_count` — 总请求数

```promql
# 计算 P99 延迟
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

### Summary（摘要）

客户端预计算的分位数，包含 `{quantile="0.95"}` 序列。**关键限制**：无法跨实例聚合。

## 本章小结

- Pull 模型解决了 Push 模型的三大痛点
- 多维数据模型是 Prometheus 灵活性的基石
- 理解四种指标类型对正确编写 PromQL 至关重要
- 实验：前往 [Pull vs Push 对比实验](../labs/ch01-pull-model/README.md) 动手验证
```

---

### Task 3: Create Ch01 Lab — push-app Service

**Files:**
- Create: `docs/Prometheus/labs/ch01-pull-model/push-app/Dockerfile`
- Create: `docs/Prometheus/labs/ch01-pull-model/push-app/app.py`
- Create: `docs/Prometheus/labs/ch01-pull-model/push-app/requirements.txt`

- [ ] **Step 1: Write push-app/app.py**

```python
"""
Push 模型模拟器 — 模拟传统监控系统的 Push 接收端

功能：
1. POST /push — 接收外部指标推送（模拟 Agent 上报）
2. GET /metrics — 暴露已收集的指标（用于对比 Pull 模型）
3. GET /status — 查看当前状态（请求数、错误率）

设计意图：
当大量并发请求涌入时，观察 Push 模型的"雪崩效应"：
- 响应延迟升高
- 内存占用增长
- 请求丢失/超时

对比 pull-app 在相同压力下的表现。
"""

from flask import Flask, request, jsonify
import threading
import time
from collections import defaultdict

app = Flask(__name__)

# 内存中存储的指标
metric_counts = defaultdict(int)
metric_values = defaultdict(float)
lock = threading.Lock()

request_count = 0
error_count = 0
start_time = time.time()


@app.route('/push', methods=['POST'])
def push_metric():
    """模拟旧式 Push 模型的指标上报端点"""
    global request_count, error_count

    data = request.get_json(silent=True)
    if not data or 'metric' not in data:
        error_count += 1
        return jsonify({"status": "error", "message": "invalid payload"}), 400

    metric_name = data['metric']
    value = float(data.get('value', 0))
    labels = data.get('labels', {})

    # 模拟带延迟的写入操作（Push 的典型瓶颈）
    time.sleep(0.001)  # 1ms 处理延迟

    with lock:
        request_count += 1
        key = (metric_name, str(labels))
        metric_counts[key] += 1
        metric_values[key] = value

    return jsonify({"status": "ok", "received": metric_name})


@app.route('/metrics', methods=['GET'])
def metrics():
    """以 Prometheus 格式暴露收集到的指标"""
    lines = [
        '# HELP push_metrics_total Metrics received via Push model',
        '# TYPE push_metrics_total counter',
    ]
    with lock:
        for (metric, labels_str), count in metric_counts.items():
            labels = eval(labels_str)  # 安全的简化用法，仅用于演示
            label_str = ",".join(f'{k}="{v}"' for k, v in labels.items())
            lines.append(f'push_{metric}_total{{{label_str}}} {count}')

    uptime = time.time() - start_time
    lines.extend([
        '',
        '# HELP push_uptime_seconds Push server uptime',
        '# TYPE push_uptime_seconds gauge',
        f'push_uptime_seconds {uptime:.0f}',
    ])
    return "\n".join(lines) + "\n"


@app.route('/status')
def status():
    """查看 Push 服务器状态"""
    with lock:
        return jsonify({
            "total_requests": request_count,
            "error_count": error_count,
            "error_rate": round(error_count / max(request_count, 1), 4),
            "unique_series": len(metric_counts),
            "uptime_seconds": int(time.time() - start_time),
        })


if __name__ == '__main__':
    print("Push Model Server starting on :5000")
    print("Endpoints:")
    print("  POST /push    - Send metrics (simulate Agent push)")
    print("  GET  /metrics - View collected metrics (Prometheus format)")
    print("  GET  /status  - Server health status")
    app.run(host='0.0.0.0', port=5000)
```

- [ ] **Step 2: Write push-app/requirements.txt**

```
flask==3.0.0
```

- [ ] **Step 3: Write push-app/Dockerfile**

```dockerfile
FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py app.py
EXPOSE 5000
CMD ["python", "app.py"]
```

---

### Task 4: Create Ch01 Lab — pull-app Service

**Files:**
- Create: `docs/Prometheus/labs/ch01-pull-model/pull-app/Dockerfile`
- Create: `docs/Prometheus/labs/ch01-pull-model/pull-app/app.py`
- Create: `docs/Prometheus/labs/ch01-pull-model/pull-app/requirements.txt`

- [ ] **Step 1: Write pull-app/app.py**

```python
"""
Pull 模型标准应用 — 演示 Prometheus Pull 模式的工作方式

设计意图：
使用 prometheus_client 库的标准方式暴露 /metrics 端点。
Prometheus 主动拉取（Pull）指标，无需应用主动上报。

对比 push-app，在相同负载下：
- Pull 模式由 Prometheus 控制节奏（scrape_interval）
- 应用只需准备好 /metrics 端点
- Prometheus 的重试和 backoff 保证采集可靠性
"""

from prometheus_client import (start_http_server, Counter, Gauge,
                               Histogram, generate_latest)
import random
import time


# === 指标定义 ===
REQUEST_COUNT = Counter(
    'http_requests_total', 'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_DURATION = Histogram(
    'http_request_duration_seconds', 'Request latency in seconds',
    ['method'],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5]
)

IN_FLIGHT = Gauge(
    'http_requests_in_flight', 'Current number of in-flight requests',
    ['method']
)

MEMORY_USAGE = Gauge(
    'process_memory_bytes', 'Process memory usage',
    ['component']
)

# 模拟的请求参数
METHODS = ['GET', 'POST', 'PUT', 'DELETE']
ENDPOINTS = ['/api/users', '/api/orders', '/api/products', '/api/auth']
STATUSES = ['200', '201', '400', '404', '500']
# 权重：正常响应占多数
STATUS_WEIGHTS = [0.70, 0.15, 0.05, 0.05, 0.05]
COMPONENTS = ['heap', 'non-heap', 'cache', 'buffer']


def simulate_request():
    """模拟一次 HTTP 请求处理"""
    method = random.choice(METHODS)
    endpoint = random.choice(ENDPOINTS)
    status = random.choices(STATUSES, weights=STATUS_WEIGHTS)[0]

    IN_FLIGHT.labels(method=method).inc()

    with REQUEST_DURATION.labels(method=method).time():
        # 模拟处理耗时，符合长尾分布
        delay = random.expovariate(1 / 0.05)  # 平均 50ms
        delay = min(delay, 1.0)  # 上限 1s
        time.sleep(delay)

    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=status).inc()
    IN_FLIGHT.labels(method=method).dec()


def update_memory():
    """模拟内存使用变化"""
    for comp in COMPONENTS:
        MEMORY_USAGE.labels(component=comp).set(
            random.randint(100, 2000) * 1024 * 1024
        )


if __name__ == '__main__':
    # 在 8080 端口启动 HTTP 服务器，暴露 /metrics
    start_http_server(8080)
    print("Pull Model App started on :8080")
    print("Prometheus scrape endpoint: http://localhost:8080/metrics")
    print("Generating simulated traffic...")

    while True:
        # 每秒模拟 10-30 个请求
        for _ in range(random.randint(10, 30)):
            simulate_request()
        update_memory()
        time.sleep(1)
```

- [ ] **Step 2: Write pull-app/requirements.txt**

```
prometheus-client==0.19.0
```

- [ ] **Step 3: Write pull-app/Dockerfile**

```dockerfile
FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py app.py
EXPOSE 8080
CMD ["python", "app.py"]
```

---

### Task 5: Create Ch01 Lab — Prometheus Config

**Files:**
- Create: `docs/Prometheus/labs/ch01-pull-model/prometheus/prometheus.yml`

- [ ] **Step 1: Write prometheus.yml**

```yaml
# prometheus.yml — 第1章 Pull 模型实验配置
#
# 配置说明：
# - scrape pull-app: 展示 Pull 模型的正常工作方式
# - scrape statsd-exporter: 展示 Push-to-Pull 桥接模式
# - scrape push-server: 展示 Push 模型暴露的 /metrics（对比用）

global:
  scrape_interval: 10s      # 每 10s 拉取一次
  evaluation_interval: 10s   # 每 10s 评估一次告警规则
  scrape_timeout: 5s         # 拉取超时 5s

scrape_configs:
  # 演示 1：标准的 Pull 模型应用
  - job_name: 'pull-app'
    static_configs:
      - targets: ['pull-app:8080']
    metrics_path: '/metrics'

  # 演示 2：StatsD Exporter（Push-to-Pull 桥接）
  - job_name: 'statsd-exporter'
    static_configs:
      - targets: ['statsd-exporter:9102']
    metrics_path: '/metrics'

  # 演示 3：Push 服务器的 /metrics（展示 Push 也能被 Pull 采集）
  - job_name: 'push-server'
    static_configs:
      - targets: ['push-server:5000']
    metrics_path: '/metrics'

  # Prometheus 自身健康指标
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

---

### Task 6: Create Ch01 Lab — Docker Compose

**Files:**
- Create: `docs/Prometheus/labs/ch01-pull-model/docker-compose.yml`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
version: '3.8'

services:
  # 模拟 Push 模型的指标接收服务器
  push-server:
    build: ./push-app
    container_name: prom-push-server
    ports:
      - "5001:5000"
    networks:
      - prom-net

  # 展示 Pull 模型的标准应用
  pull-app:
    build: ./pull-app
    container_name: prom-pull-app
    ports:
      - "8081:8080"
    networks:
      - prom-net

  # StatsD Exporter — Push-to-Pull 桥接演示
  statsd-exporter:
    image: prom/statsd-exporter:v0.22.8
    container_name: prom-statsd-exporter
    ports:
      - "9102:9102"     # /metrics 端点
      - "9125:9125/udp" # StatsD UDP 接收
    networks:
      - prom-net

  # Prometheus 核心
  prometheus:
    image: prom/prometheus:v2.48.0
    container_name: prom-ch01
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=7d'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data_ch01:/prometheus
    ports:
      - "9091:9090"
    depends_on:
      - pull-app
      - push-server
      - statsd-exporter
    networks:
      - prom-net

  # Grafana 可视化
  grafana:
    image: grafana/grafana:10.2.0
    container_name: prom-grafana-ch01
    ports:
      - "3001:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana_data_ch01:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - prom-net

networks:
  prom-net:
    driver: bridge

volumes:
  prometheus_data_ch01:
  grafana_data_ch01:
```

---

### Task 7: Create Ch01 Lab — Benchmark Scripts

**Files:**
- Create: `docs/Prometheus/labs/ch01-pull-model/scripts/benchmark-push.sh`
- Create: `docs/Prometheus/labs/ch01-pull-model/scripts/benchmark-pull.sh`

- [ ] **Step 1: Write benchmark-push.sh**

```bash
#!/bin/bash
# Push 模型压力测试脚本
# 向 push-server 并发发送指标，观察 Push 模型在高负载下的表现
#
# 用法: ./benchmark-push.sh [并发数] [总请求数]
# 默认: 并发 50，总请求 500

CONCURRENCY=${1:-50}
TOTAL=${2:-500}
URL="http://localhost:5001/push"

echo "========================================="
echo "Push 模型压力测试"
echo "========================================="
echo "并发数:      $CONCURRENCY"
echo "总请求数:    $TOTAL"
echo "目标地址:    $URL"
echo "========================================="

# 使用 curl 发送并发请求
START_TIME=$(date +%s%N)

for i in $(seq 1 $TOTAL); do
    (
        METHOD=$(shuf -n1 -e "GET" "POST" "PUT")
        ENDPOINT=$(shuf -n1 -e "/api/users" "/api/orders" "/api/products" "/api/auth")
        STATUS=$(shuf -n1 -e "200" "201" "400" "500")
        
        curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
            -X POST "$URL" \
            -H "Content-Type: application/json" \
            -d "{\"metric\":\"http_requests_total\",\"value\":1,\"labels\":{\"method\":\"$METHOD\",\"endpoint\":\"$ENDPOINT\",\"status\":\"$STATUS\"}}" &
        
        # 控制并发数
        if [ $((i % CONCURRENCY)) -eq 0 ]; then
            wait
        fi
    ) &
done

wait

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

echo "========================================="
echo "测试完成"
echo "总耗时:      ${DURATION}ms"
echo "吞吐量:      $(( TOTAL * 1000 / DURATION )) req/s"
echo "========================================="
echo ""
echo "检查 Push 服务器状态:"
curl -s http://localhost:5001/status | python -m json.tool
```

- [ ] **Step 2: Write benchmark-pull.sh**

```bash
#!/bin/bash
# Pull 模型压力测试脚本
# 模拟 Prometheus 的 Pull 行为，向 pull-app 发起 scrape 请求
# 对比 Push 模型在相同并发下的表现
#
# 用法: ./benchmark-pull.sh [抓取次数] [间隔秒数]
# 默认: 抓取 50 次，间隔 2s

COUNT=${1:-50}
INTERVAL=${2:-2}
URL="http://localhost:8081/metrics"

echo "========================================="
echo "Pull 模型压力测试（模拟 Prometheus Scrape）"
echo "========================================="
echo "抓取次数:   $COUNT"
echo "抓取间隔:   ${INTERVAL}s"
echo "目标地址:   $URL"
echo "========================================="

SUCCESS=0
FAILED=0
TOTAL_TIME=0

for i in $(seq 1 $COUNT); do
    START_TIME=$(date +%s%N)
    
    # 模拟 Prometheus scrape
    HTTP_CODE=$(curl -s -o /tmp/pull-metrics.txt -w "%{http_code}" "$URL" --max-time 5)
    
    END_TIME=$(date +%s%N)
    REQ_TIME=$(( (END_TIME - START_TIME) / 1000000 ))
    TOTAL_TIME=$((TOTAL_TIME + REQ_TIME))
    
    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS=$((SUCCESS + 1))
        echo "[$i] ✓ ${REQ_TIME}ms — $(wc -l < /tmp/pull-metrics.txt) 行指标"
    else
        FAILED=$((FAILED + 1))
        echo "[$i] ✗ HTTP $HTTP_CODE — ${REQ_TIME}ms"
    fi
    
    sleep $INTERVAL
done

echo "========================================="
echo "测试完成"
echo "成功: $SUCCESS | 失败: $FAILED"
echo "平均延迟: $(( TOTAL_TIME / COUNT ))ms"
echo "========================================="
```

- [ ] **Step 3: Make scripts executable**

```bash
chmod +x docs/Prometheus/labs/ch01-pull-model/scripts/benchmark-push.sh
chmod +x docs/Prometheus/labs/ch01-pull-model/scripts/benchmark-pull.sh
```

---

### Task 8: Create Ch01 Lab — README

**Files:**
- Create: `docs/Prometheus/labs/ch01-pull-model/README.md`

- [ ] **Step 1: Write README.md**

```markdown
# 第1章 实验：Pull vs Push 模型对比

## 实验目的

1. 理解 Push 模型在高并发下的"雪崩效应"
2. 体验 Pull 模型的"健康自证明"特性
3. 掌握 StatsD Exporter 的 Push-to-Pull 桥接模式
4. 直观感受 Prometheus 多维数据模型

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| push-server | :5001 | 模拟 Push 接收端，POST /push 接收指标 |
| pull-app | :8081 | 标准 Pull 模型应用，暴露 /metrics |
| statsd-exporter | :9102 | Push-to-Pull 桥接 |
| Prometheus | :9091 | Pull 模式抓取所有目标 |
| Grafana | :3001 | 可视化面板 |

## 实验步骤

### 实验 1：Push 雪崩效应模拟

```bash
# 1. 启动环境
docker compose up -d

# 2. 观察正常运行状态
curl http://localhost:5001/status
# 预期：error_rate 为 0

# 3. 运行 Push 压力测试
bash scripts/benchmark-push.sh 50 500

# 4. 观察 Push 服务器负载
curl http://localhost:5001/status
# 注意观察：响应时间、错误率的变化
```

**预期观察：**
- 并发数升高后，Push 服务器的响应延迟明显增加
- 可能出现请求超时或错误
- Push 服务器内存占用升高

### 实验 2：Pull 模型健康自证明

```bash
# 1. 访问 Prometheus Targets 页面
# 浏览器打开 http://localhost:9091/targets
# 观察所有 Target 状态为 UP

# 2. 停止 push-server
docker compose stop push-server

# 3. 观察 Prometheus Targets 页面
# 等 10-15s（一个 scrape_interval），
# push-server 的 State 变为 DOWN

# 4. 重启 push-server
docker compose start push-server

# 5. 观察自动恢复
# 等 10-15s，push-server 自动恢复为 UP
```

**预期观察：**
- Pull 模型自动检测目标健康状态
- 无需额外的心跳或健康检查机制
- 目标恢复后自动重新接入采集

### 实验 3：StatsD Push-to-Pull 桥接

```bash
# 1. 使用 UDP 向 StatsD 发送指标
echo "myapp.requests:1|c|#method:GET,endpoint:/api/users" | \
  nc -w1 -u localhost 9125

echo "myapp.response_time:250|ms|#method:POST" | \
  nc -w1 -u localhost 9125

# 2. 查看 StatsD Exporter 的 /metrics
curl http://localhost:9102/metrics | grep myapp
# 预期：看到 StatsD 格式的指标已被转化为 Prometheus 格式

# 3. 在 Prometheus 中查询
# 浏览器: http://localhost:9091/graph
# 查询: statsd_myapp_requests_total
```

**预期观察：**
- StatsD 的 UDP 指标（传统 Push）被 Exporter 转换为 Prometheus 格式
- Prometheus 通过 Pull 采集 Exporter 的 /metrics
- 完整的 Push-to-Pull 桥接链路建立

## Grafana 操作

1. 浏览器打开 http://localhost:3001
2. 添加 Prometheus 数据源：URL=http://prometheus:9090
3. 导入 Dashboard 或直接在 Explore 页面查询：
   - `rate(http_requests_total[1m])`
   - `push_uptime_seconds`

## 清理

```bash
docker compose down -v
```
```

---

### Task 9: Write Chapter 2 Ebook

**Files:**
- Create: `docs/Prometheus/PART1-Principles/02-TSDB-Storage.md`

- [ ] **Step 1: Write Chapter 2 markdown**

Write `02-TSDB-Storage.md` with full content covering:

1. **时序数据库的存储挑战** (10+ paragraphs)
   - 写入特征分析
   - 存储挑战：高基数、高吞吐、长周期查询
   - Prometheus TSDB 的设计哲学

2. **Head Block 与 Persistent Block** (15+ paragraphs)
   - Head Block 的内存结构
   - 2 小时写入窗口的设计原因
   - Block 目录结构详解（chunks/ index/ meta.json/ tombstones）
   - 用实验数据展示 Block 内容

3. **Compaction 机制** (12+ paragraphs)
   - 触发条件
   - 合并流程：2h→4h→8h→24h
   - 去重和采样优化
   - 磁盘空间节省量估算

4. **倒排索引与 Posting List** (18+ paragraphs)
   - Full Table Scan 的代价计算
   - Term Dictionary → Posting List → Chunk 三级结构
   - mmap 零拷贝原理
   - 高基数场景索引膨胀的数学分析（用 Task 2 的 high-card-gen 数据）

5. **WAL 机制** (12+ paragraphs)
   - 三阶段写入流程
   - 128MB 切分策略
   - 崩溃恢复实验对照

6. **为什么 Prometheus 不适合长期存储** (5+ paragraphs)
   - 单机瓶颈分析
   - 解决方案预览：Remote Write/Thanos/VictoriaMetrics

```markdown
# 第2章 榨干磁盘与内存：TSDB 存储引擎揭秘

## 2.1 时序数据库的存储挑战

### 写入特征

时序数据的写入模式与传统数据库截然不同...

| 特征 | 时序数据 | 传统 OLTP |
|------|---------|-----------|
| 写入模式 | 追加写，几乎无更新 | 随机读写 |
| 写入规模 | 千万级/秒 | 千级/秒 |
| 数据热点 | 最新数据 | 随机访问 |
| 删除模式 | 按时间批量删除 | 单行删除 |

### Prometheus TSDB 的设计目标

1. **写入吞吐**：每秒钟处理百万级 samples
2. **压缩比**：原始数据 100x+ 的压缩率
3. **查询效率**：在大规模时间序列中快速定位

## 2.2 Head Block 与 Persistent Block

### 内存中的热数据：Head Block

Prometheus 将最近 2 小时的数据全部放在内存中...

### Block 目录结构解剖

```
01EM6Q6A1YPX4Z3X3X3X3X3X3X/
├── chunks/
│   └── 000001              # 压缩后的时序数据，每个最大 32KB
├── index/                   # 倒排索引（mmap 映射到虚拟内存）
├── meta.json               # Block 元数据
│   {
│     "minTime": 1700000000000,
│     "maxTime": 1700007200000,
│     "stats": {
│       "numSamples": 1048576,
│       "numSeries": 1500,
│       "numChunks": 4096
│     }
│   }
└── tombstones              # 删除标记（标记已删除数据）
```

## 2.3 Compaction（压缩）机制

### 合并流程

```
2h Block ─┐
           ├──▶ 4h Block ──▶ 8h Block ──▶ 24h Block
2h Block ─┘
```

### 实验验证

启动 `ch02-tsdb` 实验，运行 30 分钟后执行：

```bash
docker exec ch02-tsdb-prometheus-1 ls -lh /prometheus/
# 观察多个小 block 逐渐合并
docker exec ch02-tsdb-prometheus-1 promtool tsdb analyze /prometheus
# 比较 compact 前后的 block 数量和大小
```

## 2.4 倒排索引与 Posting List

### 为什么需要倒排索引？

假设有 100 万条时间序列，查询 `{job="api-server", method="GET"}`：
- **无索引**：扫描全部 100 万条，对每条检查 Label 是否匹配 — O(n)
- **倒排索引**：直接定位 job="api-server" 的 Posting List 和 method="GET" 的 Posting List，取交集 — O(1)

### 索引结构

```
Term Dictionary                 Posting List
job="api-server"    ────────▶   [0, 5, 12, 18, 25, ...]  ← 序列 ID 列表
method="GET"        ────────▶   [2, 5, 8, 12, 15, ...]
status="200"        ────────▶   [0, 2, 5, 8, 12, ...]

查询 {job="api-server", method="GET"}
= [0,5,12,18,25,...] ∩ [2,5,8,12,15,...]
= [5, 12, ...]
```

### 高基数的致命影响

当 `user_id` 标签有 10 万个取值时：
- Posting List 长度为 10 万
- 索引文件大到无法全部缓存到内存
- 查询退化为磁盘 I/O 密集型操作
- 极端情况下直接 OOM

## 2.5 WAL（Write-Ahead Log）机制

### 写入三阶段

```
1. WAL Append (顺序写磁盘)
   → 最快路径，保证数据不丢
   
2. Head Block Update (内存操作)
   → 更新内存中的倒排索引和 chunk
   
3. WAL Checkpoint (定时清理)
   → 已落盘的数据从 WAL 中移除
```

### 崩溃恢复

当 Prometheus 进程意外终止后重启：

```
ts=2024-01-01T10:00:00Z caller=wal.go:301 msg="replaying WAL"
ts=2024-01-01T10:00:05Z caller=wal.go:301 msg="WAL replay completed"
ts=2024-01-01T10:00:05Z caller=main.go:527 msg="TSDB started"
```

## 2.6 为什么 Prometheus 不适合做长期存储

- **单机瓶颈**：单个 Prometheus 实例无法水平扩展
- **无内置冗余**：WAL 只防进程崩溃，不防磁盘损坏
- **有限保留期**：默认 15 天，延长 retention 需要更多磁盘
- **解决方案**：Thanos / VictoriaMetrics（详见第 8 章）

## 本章小结

- Prometheus TSDB 通过 Head Block + Persistent Block 两级结构平衡读写性能
- 倒排索引是时序数据库查询性能的关键
- 高基数是 TSDB 最大的敌人
- WAL 机制保证数据不丢，但不替代备份
- 实验：前往 [TSDB 存储引擎实验](../labs/ch02-tsdb/README.md)
```

---

### Task 10: Create Ch02 Lab — high-card-gen Service

**Files:**
- Create: `docs/Prometheus/labs/ch02-tsdb/high-card-gen/Dockerfile`
- Create: `docs/Prometheus/labs/ch02-tsdb/high-card-gen/generator.py`
- Create: `docs/Prometheus/labs/ch02-tsdb/high-card-gen/requirements.txt`

- [ ] **Step 1: Write high-card-gen/generator.py**

```python
"""
高基数时序数据生成器 — 演示 Label Cardinality 对 TSDB 的影响

通过环境变量控制 Label 种类和每个 Label 的基数：
- CARD_ENDPOINT: endpoint Label 的取值数量（默认 5）
- CARD_USER: user_id Label 的取值数量（默认 100，核心观察变量）
- CARD_REGION: region Label 的取值数量（默认 3）
- CARD_VERSION: version Label 的取值数量（默认 2）

总时间序列数 = prod(所有 CARD_*)
例如默认值：5 × 100 × 3 × 2 = 3000 条序列

实验建议：
1. CARD_USER=10 → 5×10×3×2 = 300 条（正常）
2. CARD_USER=100 → 5×100×3×2 = 3000 条（开始膨胀）
3. CARD_USER=1000 → 5×1000×3×2 = 30000 条（高基数）
4. CARD_USER=10000 → 5×10000×3×2 = 300000 条（危险！请确保有足够内存）
"""

from prometheus_client import start_http_server, Gauge, Counter
import os
import itertools
import random
import time
import sys


class HighCardinalityGenerator:
    """可配置的高基数时序数据生成器"""

    def __init__(self):
        # 从环境变量读取基数配置
        card_endpoint = int(os.getenv('CARD_ENDPOINT', '5'))
        card_user = int(os.getenv('CARD_USER', '100'))
        card_region = int(os.getenv('CARD_REGION', '3'))
        card_version = int(os.getenv('CARD_VERSION', '2'))

        # 生成每个 Label 的取值列表
        endpoints = [f"/api/svc{i}" for i in range(card_endpoint)]
        users = [f"user_{i}" for i in range(card_user)]
        regions = ['us-east', 'eu-west', 'ap-southeast', 'sa-east'][:card_region]
        versions = [f"v{maj}.{min}" for maj in range(card_version) for min in range(2)][:card_version]

        # 计算总序列数
        self.series_count = card_endpoint * card_user * card_region * card_version
        print(f"[HighCardGen] Generating {self.series_count} time series:")
        print(f"  endpoint={card_endpoint} × user={card_user} × region={card_region} × version={card_version}")
        print(f"  Memory estimate: ~{self.series_count * 256 // 1024}KB per scrape")

        # 为每条 Label 组合创建指标
        self.gauges = {}
        self.counters = {}
        for endpoint, user, region, version in itertools.product(
                endpoints, users, regions, versions):
            labels = {
                'endpoint': endpoint,
                'user_id': user,
                'region': region,
                'version': version,
            }
            self.gauges[(endpoint, user, region, version)] = Gauge(
                'app_request_duration_ms',
                'Request duration in milliseconds (high cardinality demo)',
                labels)
            self.counters[(endpoint, user, region, version)] = Counter(
                'app_requests_total',
                'Total number of requests (high cardinality demo)',
                labels)

    def run_forever(self):
        """持续生成指标数据"""
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
    print("[HighCardGen] HTTP server started on :8082, exposing /metrics")
    gen.run_forever()
```

- [ ] **Step 2: Write high-card-gen/requirements.txt**

```
prometheus-client==0.19.0
```

- [ ] **Step 3: Write high-card-gen/Dockerfile**

```dockerfile
FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY generator.py generator.py
EXPOSE 8082
CMD ["python", "generator.py"]
```

---

### Task 11: Create Ch02 Lab — data-generator Service

**Files:**
- Create: `docs/Prometheus/labs/ch02-tsdb/data-generator/Dockerfile`
- Create: `docs/Prometheus/labs/ch02-tsdb/data-generator/generator.py`
- Create: `docs/Prometheus/labs/ch02-tsdb/data-generator/requirements.txt`

- [ ] **Step 1: Write data-generator/generator.py**

```python
"""
正常时序数据生成器 — 模拟微服务标准指标

生成 3 种标准指标类型：
1. Counter: http_requests_total{method, endpoint, status}
2. Histogram: http_request_duration_seconds{method}
3. Gauge: memory_usage_bytes{component}

Label 数量有限、基数低，作为"对照组"对比 high-card-gen 的表现。
"""

from prometheus_client import start_http_server, Counter, Gauge, Histogram
import random
import time


class NormalGenerator:
    METHODS = ['GET', 'POST', 'PUT', 'DELETE']
    ENDPOINTS = ['/api/users', '/api/orders', '/api/products']
    STATUSES = ['200', '201', '400', '404', '500']
    STATUS_WEIGHTS = [0.70, 0.15, 0.05, 0.05, 0.05]
    COMPONENTS = ['heap', 'non-heap', 'cache', 'buffer']

    def __init__(self):
        self.requests = Counter(
            'http_requests_total', 'Total HTTP requests',
            ['method', 'endpoint', 'status'])
        self.duration = Histogram(
            'http_request_duration_seconds', 'Request latency in seconds',
            ['method'],
            buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0])
        self.memory = Gauge(
            'memory_usage_bytes', 'Memory usage in bytes',
            ['component'])

    def run_forever(self):
        while True:
            for method in self.METHODS:
                for endpoint in self.ENDPOINTS:
                    status = random.choices(self.STATUSES, weights=self.STATUS_WEIGHTS)[0]
                    self.requests.labels(
                        method=method, endpoint=endpoint, status=status).inc()
                    with self.duration.labels(method=method).time():
                        time.sleep(random.uniform(0.01, 0.15))
            for comp in self.COMPONENTS:
                self.memory.labels(component=comp).set(
                    random.randint(100, 2000) * 1024 * 1024)
            time.sleep(5)


if __name__ == '__main__':
    gen = NormalGenerator()
    start_http_server(8081)
    print("[DataGen] Normal metrics generator started on :8081")
    gen.run_forever()
```

- [ ] **Step 2: Write data-generator/requirements.txt**

```
prometheus-client==0.19.0
```

- [ ] **Step 3: Write data-generator/Dockerfile**

```dockerfile
FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY generator.py generator.py
EXPOSE 8081
CMD ["python", "generator.py"]
```

---

### Task 12: Create Ch02 Lab — Prometheus Config

**Files:**
- Create: `docs/Prometheus/labs/ch02-tsdb/prometheus/prometheus.yml`

- [ ] **Step 1: Write prometheus.yml**

```yaml
# prometheus.yml — 第2章 TSDB 存储引擎实验配置
#
# 特性配置：
# - web.enable-admin-api: 启用 /api/v1/status/tsdb 等管理接口
# - wal-compression: 启用 WAL 压缩
# - retention.time=1h: 缩短保留时间，加速 Compaction 观察

global:
  scrape_interval: 5s
  evaluation_interval: 15s
  scrape_timeout: 4s

scrape_configs:
  # 正常的低基数应用指标
  - job_name: 'data-generator'
    static_configs:
      - targets: ['data-generator:8081']

  # 高基数演示应用
  - job_name: 'high-card-gen'
    scrape_interval: 5s
    scrape_timeout: 4s
    static_configs:
      - targets: ['high-card-gen:8082']
    # 实验观察点：取消注释下面的规则来演示高基数防护
    # metric_relabel_configs:
    #   # 丢弃 user_id 标签，将高基数指标降为低基数
    #   - regex: 'user_id'
    #     action: labeldrop
    #   # 丢弃 version 标签
    #   - regex: 'version'
    #     action: labeldrop

  # Prometheus 自身指标（包含 TSDB 统计信息）
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

---

### Task 13: Create Ch02 Lab — Docker Compose

**Files:**
- Create: `docs/Prometheus/labs/ch02-tsdb/docker-compose.yml`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
version: '3.8'

services:
  # 正常指标生成器（低基数对照组）
  data-generator:
    build: ./data-generator
    container_name: prom-data-gen
    ports:
      - "8083:8081"
    networks:
      - tsdb-net

  # 高基数指标生成器（实验组）
  high-card-gen:
    build: ./high-card-gen
    container_name: prom-high-card
    ports:
      - "8084:8082"
    environment:
      - CARD_ENDPOINT=5
      - CARD_USER=100        # ← 修改这个值观察基数影响
      - CARD_REGION=3
      - CARD_VERSION=2
      # 总序列数: 5 × 100 × 3 × 2 = 3000
    networks:
      - tsdb-net

  # Prometheus（启用 Admin API 和短 retention）
  prometheus:
    image: prom/prometheus:v2.48.0
    container_name: prom-ch02
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=1h'
      - '--storage.tsdb.wal-compression'
      - '--storage.tsdb.min-block-duration=5m'
      - '--storage.tsdb.max-block-duration=30m'
      - '--web.enable-admin-api'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data_ch02:/prometheus
    ports:
      - "9092:9090"
    depends_on:
      - data-generator
      - high-card-gen
    networks:
      - tsdb-net

  # Promtool 工具容器（用于 TSDB 分析）
  promtool:
    image: prom/prometheus:v2.48.0
    container_name: prom-ch02-tool
    entrypoint: ["/bin/sh"]
    volumes:
      - prometheus_data_ch02:/prometheus:ro
      - ./scripts:/scripts
    networks:
      - tsdb-net

  # Grafana
  grafana:
    image: grafana/grafana:10.2.0
    container_name: prom-grafana-ch02
    ports:
      - "3002:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
      - GF_USERS_DEFAULT_THEME=light
    volumes:
      - grafana_data_ch02:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - tsdb-net

networks:
  tsdb-net:
    driver: bridge

volumes:
  prometheus_data_ch02:
  grafana_data_ch02:
```

---

### Task 14: Create Ch02 Lab — Analysis Scripts

**Files:**
- Create: `docs/Prometheus/labs/ch02-tsdb/scripts/tsdb-analyze.sh`
- Create: `docs/Prometheus/labs/ch02-tsdb/scripts/simulate-crash.sh`
- Create: `docs/Prometheus/labs/ch02-tsdb/scripts/watch-compaction.sh`

- [ ] **Step 1: Write tsdb-analyze.sh**

```bash
#!/bin/bash
# TSDB 全面分析脚本
# 使用 promtool tsdb 工具分析 Prometheus 存储引擎状态
#
# 用法: ./tsdb-analyze.sh [prometheus-data-path]
# 默认: /prometheus

DATA_PATH=${1:-/prometheus}

echo "============================================="
echo "  TSDB 存储引擎全面分析"
echo "============================================="
echo ""

# 1. Block 概览
echo "▶ Block 概览"
echo "---------------------------------------------"
promtool tsdb list $DATA_PATH
echo ""

# 2. 详细分析（包含高基数指标 Top 10）
echo "▶ TSDB 详细分析（Top 10 高基数指标）"
echo "---------------------------------------------"
promtool tsdb analyze $DATA_PATH --limit=10
echo ""

# 3. Block 内部结构
echo "▶ Block 内部结构"
echo "---------------------------------------------"
for block in $(ls $DATA_PATH | grep -E '^01'); do
    echo "Block: $block"
    cat "$DATA_PATH/$block/meta.json" 2>/dev/null
    echo ""
    
    CHUNK_COUNT=$(ls "$DATA_PATH/$block/chunks/" 2>/dev/null | wc -l)
    echo "  Chunks: $CHUNK_COUNT"
    
    INDEX_SIZE=$(ls -lh "$DATA_PATH/$block/index" 2>/dev/null | awk '{print $5}')
    echo "  Index size: $INDEX_SIZE"
    echo ""
done

# 4. WAL 状态
echo "▶ WAL 状态"
echo "---------------------------------------------"
if [ -d "$DATA_PATH/wal" ]; then
    WAL_FILES=$(ls $DATA_PATH/wal/ | grep -E '^[0-9]+$' | wc -l)
    WAL_SIZE=$(du -sh $DATA_PATH/wal/ 2>/dev/null | awk '{print $1}')
    echo "  WAL files: $WAL_FILES"
    echo "  WAL total size: $WAL_SIZE"
    echo "  WAL checkpoint: $(ls $DATA_PATH/wal/checkpoint* 2>/dev/null)"
else
    echo "  WAL: not found or not accessible"
fi
echo ""

# 5. 总体统计
echo "▶ 总体统计"
echo "---------------------------------------------"
TOTAL_SIZE=$(du -sh $DATA_PATH 2>/dev/null | awk '{print $1}')
BLOCK_COUNT=$(ls $DATA_PATH/ | grep -E '^01' 2>/dev/null | wc -l)
echo "  Total TSDB size: $TOTAL_SIZE"
echo "  Total blocks: $BLOCK_COUNT"
echo "  Retention: $(promtool tsdb list $DATA_PATH 2>/dev/null | tail -1 | awk '{print $1, $2}')"
```

- [ ] **Step 2: Write simulate-crash.sh**

```bash
#!/bin/bash
# WAL 崩溃恢复模拟脚本
# 模拟 Prometheus 进程异常终止，观察 WAL 恢复过程
#
# 用法: ./simulate-crash.sh
# 需要: 已运行的 docker compose 环境

PROMETHEUS_CONTAINER="prom-ch02"

echo "============================================="
echo "  WAL 崩溃恢复模拟"
echo "============================================="
echo ""

# 1. 确认 Prometheus 运行中
echo "▶ Step 1: 确认 Prometheus 运行状态"
if docker ps | grep -q $PROMETHEUS_CONTAINER; then
    echo "  ✓ Prometheus 运行中"
else
    echo "  ✗ Prometheus 未运行，请先执行 docker compose up -d"
    exit 1
fi

# 2. 检查 WAL 目录
echo ""
echo "▶ Step 2: 检查 WAL 目录"
docker exec $PROMETHEUS_CONTAINER ls -lh /prometheus/wal/ 2>/dev/null || {
    echo "  WAL 目录不可访问（可能是权限问题）"
}

# 3. 生成一些测试数据
echo ""
echo "▶ Step 3: 生成测试数据（等待 30s）"
sleep 30
echo "  数据已生成"

# 4. 记录当前序列数
echo ""
echo "▶ Step 4: 记录崩溃前的 TSDB 状态"
docker exec $PROMETHEUS_CONTAINER promtool tsdb analyze /prometheus --limit=3 2>/dev/null | head -20

# 5. 模拟进程崩溃（kill -9）
echo ""
echo "▶ Step 5: 模拟进程崩溃 (kill -9)"
docker kill --signal=KILL $PROMETHEUS_CONTAINER
echo "  ✓ Prometheus 已强制终止"
sleep 2

# 6. 查看 WAL 残留
echo ""
echo "▶ Step 6: 检查 WAL 残留数据"
docker start $PROMETHEUS_CONTAINER 2>/dev/null
sleep 3
docker logs $PROMETHEUS_CONTAINER 2>&1 | grep -E "replay|WAL|wal" || true

# 7. 验证数据恢复
echo ""
echo "▶ Step 7: 验证数据恢复"
docker exec $PROMETHEUS_CONTAINER promtool tsdb analyze /prometheus --limit=3 2>/dev/null | head -10

echo ""
echo "============================================="
echo "  模拟完成"
echo "============================================="
echo "[注意] 如果 WAL 损坏导致 Prometheus 无法启动，"
echo "       可尝试以下修复命令："
echo "  docker run --rm -v prometheus_data_ch02:/prometheus \\"
echo "    prom/prometheus:v2.48.0 promtool tsdb clean-tombstones /prometheus"
```

- [ ] **Step 3: Write watch-compaction.sh**

```bash
#!/bin/bash
# Compaction 过程观察脚本
# 监控 Prometheus 的 Block 合并过程
#
# 用法: ./watch-compaction.sh [interval_seconds]
# 默认: 每 60 秒刷新一次

INTERVAL=${1:-60}
PROM_CONTAINER="prom-ch02"

echo "============================================="
echo "  Compaction 过程观察"
echo "============================================="
echo "刷新间隔: ${INTERVAL}s"
echo "按 Ctrl+C 停止观察"
echo ""

count=0
while true; do
    count=$((count + 1))
    echo "--- [$(date +%H:%M:%S)] 检查 #${count} ---"
    
    # Block 列表
    echo "Block 列表:"
    docker exec $PROM_CONTAINER ls -lh /prometheus/ 2>/dev/null | grep -E '^d' | head -20
    
    # Block 数量
    BLOCK_COUNT=$(docker exec $PROM_CONTAINER ls /prometheus/ 2>/dev/null | grep -E '^01' | wc -l)
    echo "Block 数量: $BLOCK_COUNT"
    
    # TSDB 状态摘要
    docker exec $PROM_CONTAINER promtool tsdb list /prometheus 2>/dev/null | tail -5
    
    # 尝试通过 API 获取 TSDB 状态
    TSDB_STATUS=$(curl -s http://localhost:9092/api/v1/status/tsdb 2>/dev/null | python -c "
import sys, json
try:
    data = json.load(sys.stdin)['data']
    print(f\"  总序列数: {data.get('totalSeries', 'N/A')}\")
    print(f\"  内存中的序列: {data.get('totalLabelValuePairs', 'N/A')}\")
except: pass
" 2>/dev/null || true)
    
    echo ""
    sleep $INTERVAL
done
```

- [ ] **Step 4: Make scripts executable**

```bash
chmod +x docs/Prometheus/labs/ch02-tsdb/scripts/tsdb-analyze.sh
chmod +x docs/Prometheus/labs/ch02-tsdb/scripts/simulate-crash.sh
chmod +x docs/Prometheus/labs/ch02-tsdb/scripts/watch-compaction.sh
```

---

### Task 15: Create Ch02 Lab — README

**Files:**
- Create: `docs/Prometheus/labs/ch02-tsdb/README.md`

- [ ] **Step 1: Write README.md**

```markdown
# 第2章 实验：TSDB 存储引擎揭秘

## 实验目的

1. **正常数据流**：观察 Prometheus TSDB 的 Block 结构、WAL 文件、Chunk 存储
2. **高基数灾难**：亲眼见证 Label 基数增长导致的时间序列爆炸
3. **WAL 崩溃恢复**：模拟进程崩溃，验证 WAL 重放机制
4. **Compaction 过程**：观察小 Block 合并为大 Block 的完整流程

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| data-generator | :8083 | 正常低基数指标（对照组） |
| high-card-gen | :8084 | 高基数指标（实验组，默认 3000 条序列） |
| Prometheus | :9092 | 启用 Admin API，缩短 retention 加速实验 |
| promtool (工具) | — | TSDB 分析工具容器 |
| Grafana | :3002 | 可视化面板 |

## 核心环境变量（high-card-gen）

| 变量 | 默认值 | 说明 | 总序列数影响 |
|------|--------|------|-------------|
| CARD_ENDPOINT | 5 | endpoint 取值数 | 乘法因子 |
| CARD_USER | 100 | user_id 取值数 | 乘法因子 |
| CARD_REGION | 3 | region 取值数 | 乘法因子 |
| CARD_VERSION | 2 | version 取值数 | 乘法因子 |

**序列数公式**：CARD_ENDPOINT × CARD_USER × CARD_REGION × CARD_VERSION

## 实验步骤

### 实验 1：正常数据流观察

```bash
# 1. 启动环境
docker compose up -d

# 2. 验证所有服务启动
docker compose ps

# 3. 等待 2 分钟生成数据，然后观察 TSDB 结构
docker exec prom-ch02 ls -lh /prometheus/

# 4. 查看 Block 元数据
docker exec prom-ch02 cat /prometheus/$(ls /prometheus/ | grep "^01" | head -1)/meta.json

# 5. 使用 promtool 分析
docker exec prom-ch02 promtool tsdb analyze /prometheus --limit=10
```

**预期观察：**
- `/prometheus/` 目录下出现 `01xxxxx` 命名的 Block 目录
- 每个 Block 包含 chunks/、index/、meta.json
- WAL 目录中有多个编号的 WAL 段文件
- promtool 显示各指标的时间序列数和样本数

### 实验 2：高基数灾难现场

```bash
# 1. 停止当前环境，修改基数配置
docker compose down -v

# 2. 启动低基数配置（300 条序列）
$env:CARD_USER=10
docker compose up -d
# 观察：Prometheus 负载正常，内存占用低

# 3. 切换中基数配置（3000 条）
docker compose down -v
$env:CARD_USER=100
docker compose up -d
# 观察：TSDB block 明显增大，查询响应略慢

# 4. 切换高基数配置（30000 条 — 请确保至少有 2GB 可用内存）
docker compose down -v
$env:CARD_USER=1000
docker compose up -d
# 观察：Prometheus 内存占用显著上升
# 观察：scrape 耗时增加
# 观察：promtool analyze 中高基数指标的出现
```

**查询 Prometheus TSDB 状态 API：**
```bash
# 查看当前所有时间序列数
curl -s http://localhost:9092/api/v1/status/tsdb | python -m json.tool

# 查看 Top 10 高基数指标
curl -s http://localhost:9092/api/v1/status/tsdb | \
  python -c "import sys,json; d=json.load(sys.stdin)['data']; \
  [print(f\"{s['name']}: {s['seriesCount']} series\") \
  for s in sorted(d['seriesCountByMetricName'], key=lambda x:-x['seriesCount'])[:10]]"
```

### 实验 3：WAL 崩溃恢复

```bash
# 1. 确保环境已运行
docker compose up -d

# 2. 执行崩溃模拟脚本
bash scripts/simulate-crash.sh

# 3. 或者手动操作：
#    强制 kill Prometheus 进程
docker kill --signal=KILL prom-ch02

# 4. 重启并观察 WAL 恢复日志
docker start prom-ch02
docker logs prom-ch02 --tail 50 | grep -E "replay|WAL|wal|tsdb"
```

**预期观察：**
- 重启后日志显示 "replaying WAL"
- WAL replay 完成后显示 "WAL replay completed"
- TSDB 启动后，崩溃前的数据指标依然可用

### 实验 4：Compaction 过程

```bash
# 运行比较长时间的观察
bash scripts/watch-compaction.sh 30
```

**预期观察：**
- 初始时出现多个小 Block（5m 间隔）
- 30 分钟后开始 Compaction，小 Block 合并
- Block 数量减少，单个 Block 体积增大
- 查询性能逐渐优化

## 高基数防护演示

在 `prometheus/prometheus.yml` 中取消注释 `metric_relabel_configs`：
```yaml
metric_relabel_configs:
  - regex: 'user_id'
    action: labeldrop
```

重启后观察：高基数 Label 被丢弃，序列数大幅下降。

## Grafana

1. 访问 http://localhost:3002
2. 数据源：Prometheus，URL=http://prometheus:9090
3. 推荐查询：
   - `prometheus_tsdb_head_series` — 当前内存中的序列数
   - `prometheus_tsdb_blocks_loaded` — 已加载的 Block 数
   - `scrape_duration_seconds{job="high-card-gen"}` — 高基数目标的抓取耗时

## 清理

```bash
docker compose down -v
```
```

---

## Self-Review Checklist

### Spec Coverage
| Spec Requirement | Covered By |
|---|---|
| 第1章 电子书 | Task 2 (01-Pull-Model.md) |
| 第1章 push-server 实验 | Task 3 (push-app) |
| 第1章 pull-app 实验 | Task 4 (pull-app) |
| 第1章 Prometheus Pull 配置 | Task 5 (prometheus.yml) |
| 第1章 StatsD Exporter | Task 6 (docker-compose.yml statsd-exporter) |
| 第1章 压测脚本 | Task 7 (benchmark-*.sh) |
| 第1章 实验说明 | Task 8 (README.md) |
| 第2章 电子书 | Task 9 (02-TSDB-Storage.md) |
| 第2章 高基数生成器 | Task 10 (high-card-gen) |
| 第2章 正常数据生成器 | Task 11 (data-generator) |
| 第2章 TSDB 实验配置 | Task 12 (prometheus.yml) |
| 第2章 docker-compose | Task 13 |
| 第2章 分析脚本 | Task 14 (3 scripts) |
| 第2章 实验说明 | Task 15 (README.md) |
| 书籍总入口 | Task 1 (index.md) |

### Placeholder Scan
- All tasks contain complete code (not TBD/TODO)
- All file paths are full absolute paths under `docs/Prometheus/`

### Type Consistency
- All Python services use the same `prometheus-client==0.19.0` library
- Ports mapped consistently: ch01 uses 9091/3001/5001/8081, ch02 uses 9092/3002/8083/8084
- Environment variables for high-card-gen follow consistent naming (`CARD_*`)
- Docker Compose container naming follows pattern: `prom-*` and `prom-*-ch0*`