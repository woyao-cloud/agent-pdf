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

### 文件与配置约定

- **Python 实验应用**：统一使用 `prometheus_client` 库（`pip install prometheus-client`）
- **Docker Compose 版本**：所有 Compose 文件使用 version '3.8'
- **端口规划**：ch01 系列用 9091~9099, 3001；ch02 系列用 9191~9199, 3002（避免冲突）
- **数据持久化**：命名 volume 如 `prometheus_data_ch01`、`prometheus_data_ch02`，方便清理
- **日志规范**：所有实验附带 `README.md`，包含实验目的、步骤、预期结果和观察要点