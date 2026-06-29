# 第12章 可观测性基础

## 12.1 可观测性的概念与演进

### 12.1.1 从监控到可观测性

传统监控（Monitoring）回答的是"已知的未知"——你预先知道要关注什么指标，设置告警阈值，在指标越界时收到通知。而可观测性（Observability）回答的是"未知的未知"——当系统出现从未见过的异常行为时，你能通过系统对外暴露的数据来推断内部状态，而不需要预先为每一种故障模式编写检测逻辑。

这一区别至关重要。在微服务架构和云原生环境出现之前，单体应用的故障模式相对有限，CPU 高、内存泄漏、磁盘满——这些场景可以通过预设的监控规则覆盖。但在今天的分布式系统中，服务间调用链可能跨越数十个节点，故障可能由链路中任意一环的偶发延迟引发，也可能是多个服务之间的微妙交互导致。预设规则永远无法穷举所有故障模式，因此我们需要可观测性。

可观测性源于控制理论，由匈牙利数学家 Rudolf E. Kálmán 在 1960 年提出。在控制系统中，如果一个系统的内部状态可以通过其外部输出完全推断，则称该系统是"可观测的"。软件工程借用这一概念，指代通过收集和分析系统产生的数据来理解其内部运行状态的能力。

### 12.1.2 可观测性的三个支柱

业界公认的可观测性三大支柱是：

1. **指标（Metrics）**—— 数值化的聚合数据，描述系统在某个时间点的状态
2. **日志（Logs）**—— 离散的事件记录，描述系统在某个时间点发生了什么
3. **链路追踪（Traces）**—— 请求在分布式系统中的完整路径，描述请求经过的每个服务和处理时间

这三个支柱相互补充，缺一不可。指标告诉你"出问题了"，日志告诉你"出了什么问题"，链路追踪告诉你"问题出在哪里"。只有三者结合，才能形成完整的可观测性拼图。

### 12.1.3 可观测性与传统监控的关键区别

| 维度 | 传统监控 | 可观测性 |
|------|---------|---------|
| 数据采集 | 预设指标，定期轮询 | 多维数据，主动导出 |
| 查询方式 | 预定义仪表盘和告警 | 即席查询，按需探索 |
| 故障定位 | 已知模式匹配 | 未知模式探索 |
| 数据关联 | 各维度独立 | 跨维度关联（指标→日志→链路） |
| 核心问题 | 系统是否正常？ | 系统为什么异常？ |

## 12.2 三大支柱详解

### 12.2.1 指标（Metrics）

指标是数值化的、带时间戳的聚合数据，通常以时间序列的形式存储和查询。指标的特点是**低基数、高效率、长周期**——它们占用的存储空间小，查询速度快，适合长期保存和趋势分析。

**指标的类型：**

- **计数器（Counter）**：只增不减的累计值，如请求总数、错误总数。适用于衡量总量和速率。
- **仪表盘（Gauge）**：可增可减的瞬时值，如当前 CPU 使用率、内存使用量、活跃连接数。适用于快照类数据。
- **直方图（Histogram）**：观测值的分布统计，如请求延迟的 P50/P90/P99。适用于理解数据的分布特征。

**指标的维度：**

指标通常附带标签（Labels/Tags）来提供上下文。例如，一个 `http_requests_total` 指标可能带有 `method`、`path`、`status_code` 等标签，允许你按任意维度聚合和过滤。

**Prometheus 指标示例：**

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/api/users",status="200"} 1024
http_requests_total{method="POST",path="/api/users",status="500"} 3
```

### 12.2.2 日志（Logs）

日志是离散的、带时间戳的事件记录，通常以文本或结构化格式（JSON）存储。日志的特点是**高基数、高细节、短周期**——它们包含丰富的信息，但存储成本高，通常只保留较短的时间窗口。

**日志的级别：**

- **DEBUG**：调试信息，仅在开发或排障时启用
- **INFO**：常规信息，记录系统正常运行的事件
- **WARN**：警告，表示可能有问题但不影响当前功能
- **ERROR**：错误，表示功能受损
- **FATAL**：致命错误，表示系统无法继续运行

**结构化日志 vs 非结构化日志：**

非结构化日志是纯文本，难以被机器解析和查询。结构化日志使用 JSON 等格式，包含键值对，便于索引和检索。

非结构化日志示例：
```
2025-06-28 10:30:15 ERROR Failed to connect to database: timeout
```

结构化日志示例：
```json
{
  "timestamp": "2025-06-28T10:30:15.123Z",
  "level": "ERROR",
  "logger": "com.tencent.demo.db.ConnectionPool",
  "message": "Failed to connect to database",
  "error": "timeout",
  "service": "user-service",
  "region": "ap-guangzhou",
  "request_id": "req-abc123"
}
```

### 12.2.3 链路追踪（Traces）

链路追踪记录一个请求在分布式系统中经过的完整路径。每个请求被分配一个唯一的 Trace ID，在每个服务节点上创建 Span（跨度），记录该节点的处理时间和元数据。

**核心概念：**

- **Trace**：一次请求的完整调用链，由多个 Span 组成
- **Span**：调用链中的一个工作单元，包含开始时间、结束时间、状态和标签
- **Span Context**：跨服务传递的上下文信息，包括 Trace ID 和 Span ID
- **Parent-Child 关系**：Span 之间的嵌套关系，形成调用树

**链路追踪的工作流程：**

1. 客户端发起请求，生成 Trace ID
2. 请求到达服务 A，创建 Root Span
3. 服务 A 调用服务 B，通过 HTTP Header 传递 Span Context
4. 服务 B 创建 Child Span，记录处理时间
5. 所有 Span 上报到追踪后端
6. 追踪后端按 Trace ID 聚合所有 Span，重建完整调用链

**OpenTelemetry Span 示例（简化）：**

```json
{
  "trace_id": "0af7651916cd43dd8448eb211c80319c",
  "span_id": "b7ad6b7169203331",
  "parent_span_id": "b7ad6b7169203330",
  "name": "HTTP GET /api/users",
  "kind": "SPAN_KIND_SERVER",
  "start_time": "2025-06-28T10:30:15.000Z",
  "end_time": "2025-06-28T10:30:15.042Z",
  "status": { "code": "STATUS_CODE_OK" },
  "attributes": {
    "http.method": "GET",
    "http.url": "https://api.example.com/users",
    "http.status_code": 200
  }
}
```

## 12.3 黄金信号与 RED/USE 方法

### 12.3.1 四大黄金信号

Google SRE 团队在其经典著作《Site Reliability Engineering》中提出了四个"黄金信号"（Golden Signals），它们是衡量用户-facing 系统健康度的核心指标：

**1. 延迟（Latency）**

请求处理所需的时间。关键是要区分成功请求和失败请求的延迟——失败的请求可能因为快速拒绝而延迟很低，但这不代表系统健康。

- 关键指标：P50、P90、P99 延迟
- 常见来源：APM 工具、负载均衡器指标
- 告警场景：P99 延迟在 5 分钟内持续超过 500ms

**2. 流量（Traffic）**

系统承载的请求量。流量指标帮助你理解系统的负载水平，判断延迟升高是否由流量激增导致。

- 关键指标：QPS（每秒查询数）、RPS（每秒请求数）、活跃连接数
- 常见来源：负载均衡器、API 网关、服务网格
- 告警场景：流量在 10 分钟内突增 300%

**3. 错误（Errors）**

请求失败的比率。错误包括显式错误（HTTP 5xx）和隐式错误（返回 200 但业务逻辑失败）。

- 关键指标：错误率、错误数
- 常见来源：应用指标、日志分析
- 告警场景：错误率超过 1% 持续 5 分钟

**4. 饱和度（Saturation）**

系统资源的使用程度。饱和度指标告诉你系统还有多少余量，是预测容量问题的先行指标。

- 关键指标：CPU 使用率、内存使用率、磁盘 I/O 利用率、连接池使用率
- 常见来源：系统指标、中间件指标
- 告警场景：CPU 使用率持续超过 80%

### 12.3.2 USE 方法

USE（Utilization、Saturation、Errors）方法由 Brendan Gregg 提出，用于分析系统资源的性能问题。它适用于**基础设施层**（服务器、网络、存储设备）。

**USE 方法的核心问题：**

对于每一个资源，检查以下三个指标：

1. **利用率（Utilization）**：资源忙于服务的时间占比。例如 CPU 利用率 70% 表示 70% 的时间在忙。
2. **饱和度（Saturation）**：资源上有多少额外工作在排队等待。例如 CPU 运行队列长度。
3. **错误（Errors）**：资源发生的错误事件数。例如网卡丢包计数。

**USE 方法检查清单（部分）：**

| 资源 | 利用率指标 | 饱和度指标 | 错误指标 |
|------|-----------|-----------|---------|
| CPU | CPU 使用率 | 运行队列长度、负载均值 | 错误计数（罕见） |
| 内存 | 已用内存 / 总内存 | OOM Killer 计数、交换使用量 | 内存分配失败 |
| 磁盘 I/O | 磁盘利用率（% busy） | 等待队列长度、I/O 等待时间 | 磁盘错误、坏扇区 |
| 网络 | 带宽利用率 | 接口缓冲区溢出、丢包率 | 接口错误、校验和错误 |

### 12.3.3 RED 方法

RED（Rate、Errors、Duration）方法由 Tom Wilkie（Grafana Labs）提出，专为**微服务层**设计。它关注的是服务的请求行为，而非底层资源。

**RED 方法的核心问题：**

对于每一个服务，检查以下三个指标：

1. **速率（Rate）**：服务每秒处理的请求数（RPS）
2. **错误（Errors）**：失败请求的比率或数量
3. **持续时间（Duration）**：请求处理时间的分布（延迟）

**RED 方法的应用示例：**

```yaml
# 一个微服务的 RED 指标集
user-service:
  rate: 1500 rps
  errors: 0.5%
  duration:
    p50: 45ms
    p90: 120ms
    p99: 350ms
```

### 12.3.4 USE vs RED：如何选择

| 维度 | USE 方法 | RED 方法 |
|------|---------|---------|
| 适用层 | 基础设施（服务器、网络、存储） | 应用服务（微服务、API） |
| 关注点 | 资源是否耗尽 | 请求是否健康 |
| 典型用户 | 系统管理员、运维工程师 | 开发工程师、SRE |
| 指标来源 | 操作系统、硬件监控 | 应用埋点、服务网格 |
| 问题定位 | "哪个资源是瓶颈？" | "哪个服务有问题？" |

在实践中，USE 和 RED 是互补的。当 RED 指标显示服务延迟升高时，USE 指标可以帮助你判断是否是底层资源瓶颈导致的。

## 12.4 腾讯云可观测性产品体系

腾讯云提供了一套完整的可观测性产品矩阵，覆盖指标、日志、链路追踪三大领域。

### 12.4.1 腾讯云可观测平台（TCOP）

TCOP（Tencent Cloud Observability Platform）是腾讯云的一站式可观测性平台，提供指标监控、告警、仪表盘等功能。

**核心功能：**

- **云产品监控**：自动接入 100+ 腾讯云产品的指标数据，无需额外配置
- **自定义监控**：通过 API 或 Agent 上报自定义业务指标
- **告警管理**：支持多条件告警策略、告警静默、告警升级
- **仪表盘**：拖拽式仪表盘编辑器，支持图表联动和变量
- **事件中心**：统一管理云产品事件和自定义事件

**TCOP 指标数据模型：**

TCOP 的指标数据模型与 Prometheus 兼容，每个指标由以下部分组成：

- **指标名（MetricName）**：如 `CPUUsage`
- **维度（Dimensions）**：键值对，如 `InstanceId=i-xxxxx`、`Region=ap-guangzhou`
- **时间戳（Timestamp）**：Unix 时间戳，精确到秒
- **值（Value）**：浮点数

**TCOP 告警策略配置示例：**

```json
{
  "alarmPolicyName": "高CPU告警",
  "conditions": [
    {
      "metricName": "CPUUsage",
      "statistic": "avg",
      "period": 60,
      "evaluationPeriod": 5,
      "threshold": 80,
      "operator": ">"
    }
  ],
  "notice": {
    "notifyWay": ["EMAIL", "SMS"],
    "receiverGroup": "SRE-值班组"
  }
}
```

### 12.4.2 腾讯云日志服务（CLS）

CLS（Cloud Log Service）是腾讯云的日志管理与分析平台，支持日志采集、存储、检索、分析和告警。

**核心功能：**

- **日志采集**：支持 LogListener 采集器、API 直推、Kafka 协议接入
- **全文检索**：秒级检索十亿级日志
- **日志分析**：类 SQL 分析语法，支持聚合、统计、可视化
- **上下文关联**：一键查看日志上下文，快速定位问题
- **日志告警**：基于日志内容的告警规则

**CLS 日志分析示例：**

```sql
-- 统计过去1小时各API的错误率
SELECT
  request_path AS API,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS error_count,
  ROUND(SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS error_rate
FROM
  access_log
WHERE
  __TIMESTAMP__ > NOW() - INTERVAL 1 HOUR
GROUP BY
  request_path
ORDER BY
  error_rate DESC
```

**CLS 与 TCOP 的关联：**

CLS 和 TCOP 可以深度联动。在 TCOP 仪表盘中嵌入 CLS 日志图表，在 CLS 检索结果中跳转到 TCOP 指标视图，实现指标与日志的关联分析。

### 12.4.3 腾讯云应用性能观测（APM）

APM（Application Performance Monitoring）是腾讯云的分布式链路追踪和性能诊断产品，基于 OpenTelemetry 标准。

**核心功能：**

- **分布式追踪**：自动采集服务间调用链，支持跨协议追踪（HTTP、gRPC、MQ）
- **拓扑发现**：自动生成服务依赖拓扑图，实时展示服务间调用关系
- **性能分析**：按服务、接口、实例维度分析延迟和错误
- **慢调用分析**：自动识别慢 Span，提供调用栈和参数详情
- **数据库性能**：追踪 SQL 执行耗时，识别慢查询

**APM 支持的接入方式：**

1. **OpenTelemetry SDK 手动埋点**：最灵活的方式，适用于 Java、Python、Go、Node.js 等语言
2. **Agent 自动接入**：Java Agent 无侵入接入，自动拦截主流框架
3. **服务网格接入**：通过 Istio/Envoy 的分布式追踪能力自动接入
4. **SkyWalking 协议兼容**：支持 SkyWalking 8.x 协议上报

**APM 链路数据示例：**

```json
{
  "traceID": "0af7651916cd43dd8448eb211c80319c",
  "spans": [
    {
      "spanID": "span-001",
      "parentSpanID": "",
      "operationName": "HTTP GET /api/order/list",
      "startTime": 1719560000000000,
      "duration": 350,
      "tags": {
        "http.method": "GET",
        "http.status_code": 200,
        "peer.service": "order-service"
      }
    },
    {
      "spanID": "span-002",
      "parentSpanID": "span-001",
      "operationName": "SELECT FROM orders",
      "startTime": 1719560000050000,
      "duration": 120,
      "tags": {
        "db.type": "mysql",
        "db.instance": "orders_db",
        "db.statement": "SELECT * FROM orders WHERE user_id = ?"
      }
    }
  ]
}
```

### 12.4.4 产品选型建议

| 场景 | 推荐产品 | 说明 |
|------|---------|------|
| 云产品基础监控 | TCOP | 自动接入，零配置 |
| 业务指标监控 | TCOP 自定义监控 | 通过 API 上报业务指标 |
| 日志集中管理 | CLS | 统一日志采集、检索、分析 |
| 分布式链路追踪 | APM | 基于 OpenTelemetry 标准 |
| 统一告警管理 | TCOP 告警 | 支持多条件、多渠道告警 |
| 全栈可观测 | TCOP + CLS + APM | 三产品联动，指标-日志-链路关联 |

## 12.5 可观测性数据关联：指标-日志-链路打通

可观测性的真正价值在于**跨维度关联**。单一维度的数据只能提供有限的信息，只有将指标、日志、链路三者关联起来，才能快速定位问题的根因。

### 12.5.1 关联的核心标识

要实现跨维度关联，需要在数据采集时注入统一的关联标识：

- **Trace ID**：链路追踪的唯一标识，也可以注入到日志和指标中
- **Service Name**：服务名称，三个维度共享
- **Instance ID**：实例标识，用于关联基础设施指标
- **Request ID**：请求标识，可以在日志和链路中传递

### 12.5.2 关联分析场景

**场景一：指标异常 → 日志定位**

TCOP 告警通知 CPU 使用率超过 90%。在 TCOP 控制台查看该实例的指标趋势，确认异常时间点。然后跳转到 CLS，按实例 ID 和时间范围检索日志，发现该时间段有大量数据库连接超时日志。

**场景二：链路慢调用 → 指标验证**

APM 显示 `order-service` 的 P99 延迟从 200ms 飙升到 2s。查看该服务的链路详情，发现慢调用集中在 `SELECT FROM orders` 操作。跳转到 TCOP 查看数据库实例的指标，发现磁盘 IOPS 已接近上限。

**场景三：错误率升高 → 全链路排查**

TCOP 告警显示 `payment-service` 错误率超过 5%。在 APM 中查看该服务的拓扑图，发现下游 `wallet-service` 的调用错误率也在升高。查看 `wallet-service` 的日志，发现 Redis 连接池耗尽。查看 TCOP 中 Redis 实例的指标，确认连接数达到上限。

### 12.5.3 腾讯云产品关联配置

在腾讯云控制台中，可以通过以下方式实现产品关联：

1. **TCOP 仪表盘嵌入 CLS 图表**：在仪表盘编辑器中添加"日志"组件，配置 CLS 检索语句
2. **APM 跳转到 CLS**：在 APM 的 Span 详情中，点击"查看日志"按钮，自动携带 Trace ID 跳转到 CLS
3. **TCOP 告警关联 APM**：在告警通知中附带 APM 链路链接

## 12.6 Python 可观测性实战

本节通过一个完整的 Python 示例，演示如何在腾讯云上搭建可观测性体系。示例使用 Flask 框架实现一个简单的订单服务，集成指标、日志和链路追踪。

### 12.6.1 环境准备

```bash
# 安装依赖
pip install flask
pip install opentelemetry-api
pip install opentelemetry-sdk
pip install opentelemetry-exporter-otlp
pip install opentelemetry-instrumentation-flask
pip install opentelemetry-instrumentation-requests
pip install prometheus-client
pip install python-json-logger
pip install requests
```

### 12.6.2 完整可观测性脚本

```python
"""
observability_setup.py
腾讯云可观测性 Python 集成示例
涵盖：指标、日志、链路追踪三大支柱
"""

import json
import logging
import os
import random
import time
from datetime import datetime

import requests
from flask import Flask, jsonify, request
from prometheus_client import Counter, Gauge, Histogram, generate_latest
from prometheus_client import start_http_server as start_metrics_server
from pythonjsonlogger import jsonlogger

# ============================================================
# OpenTelemetry 导入
# ============================================================
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
    OTLPSpanExporter,
)
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Status, StatusCode

# ============================================================
# 配置区 —— 根据实际环境修改
# ============================================================
CONFIG = {
    "service_name": "order-service",
    "service_version": "1.0.0",
    "environment": os.getenv("ENV", "production"),
    "region": os.getenv("REGION", "ap-guangzhou"),
    # 腾讯云 APM OTLP 接入点（从 APM 控制台获取）
    "otlp_endpoint": os.getenv("OTLP_ENDPOINT", "http://localhost:4317"),
    # 腾讯云 TCOP 自定义监控 API 密钥
    "tcop_secret_id": os.getenv("TCOP_SECRET_ID", ""),
    "tcop_secret_key": os.getenv("TCOP_SECRET_KEY", ""),
    # 腾讯云 CLS 日志主题 ID
    "cls_topic_id": os.getenv("CLS_TOPIC_ID", ""),
}

# ============================================================
# 第一部分：指标（Metrics）—— Prometheus + TCOP
# ============================================================

# Prometheus 指标定义
METRIC_HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "HTTP 请求总数",
    ["method", "endpoint", "status"],
)

METRIC_HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP 请求耗时（秒）",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)

METRIC_HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "当前正在处理的 HTTP 请求数",
    ["method"],
)

METRIC_ORDER_CREATED_TOTAL = Counter(
    "order_created_total",
    "创建的订单总数",
    ["payment_method"],
)

METRIC_DB_QUERY_DURATION = Histogram(
    "db_query_duration_seconds",
    "数据库查询耗时（秒）",
    ["query_type"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1),
)

METRIC_QUEUE_DEPTH = Gauge(
    "queue_depth",
    "消息队列当前深度",
    ["queue_name"],
)


def report_to_tcop(metric_name, value, dimensions=None):
    """
    将指标上报到腾讯云 TCOP 自定义监控。
    生产环境应使用腾讯云 SDK 签名请求。
    """
    if not CONFIG["tcop_secret_id"]:
        return
    payload = {
        "MetricName": metric_name,
        "Value": value,
        "Timestamp": int(time.time()),
        "Dimensions": dimensions or [],
    }
    # 实际调用 TCOP API 的代码
    # requests.post("https://monitor.tencentcloudapi.com/", json=payload)
    print(f"[TCOP] 上报指标: {metric_name}={value}")


# ============================================================
# 第二部分：日志（Logs）—— 结构化 JSON 日志 + CLS
# ============================================================

def setup_logging():
    """配置结构化 JSON 日志"""
    log_handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s %(trace_id)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    log_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = []
    root_logger.addHandler(log_handler)
    root_logger.setLevel(logging.INFO)

    return root_logger


class TraceContextFilter(logging.Filter):
    """向日志记录注入 Trace ID"""

    def filter(self, record):
        current_span = trace.get_current_span()
        span_context = current_span.get_span_context()
        record.trace_id = (
            format(span_context.trace_id, "032x")
            if span_context.trace_id != 0
            else "00000000000000000000000000000000"
        )
        return True


logger = setup_logging()
logger.addFilter(TraceContextFilter())


def send_to_cls(log_entry):
    """
    将日志发送到腾讯云 CLS。
    生产环境应使用 CLS SDK 或 LogListener 采集。
    """
    if not CONFIG["cls_topic_id"]:
        return
    # 实际调用 CLS API 的代码
    # from tencentcloud.cls.v20201016 import cls_client
    print(f"[CLS] 发送日志: {json.dumps(log_entry)[:200]}...")


# ============================================================
# 第三部分：链路追踪（Traces）—— OpenTelemetry + APM
# ============================================================

def setup_tracing():
    """配置 OpenTelemetry 链路追踪"""
    resource = Resource.create(
        attributes={
            "service.name": CONFIG["service_name"],
            "service.version": CONFIG["service_version"],
            "deployment.environment": CONFIG["environment"],
            "cloud.region": CONFIG["region"],
            "cloud.provider": "tencent",
        }
    )

    provider = TracerProvider(resource=resource)

    # OTLP 导出器 —— 将 Span 发送到腾讯云 APM
    otlp_exporter = OTLPSpanExporter(
        endpoint=CONFIG["otlp_endpoint"],
        # 生产环境需要配置认证
        # headers={"Authentication": f"Bearer {CONFIG['apm_token']}"},
    )
    provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

    trace.set_tracer_provider(provider)
    return trace.get_tracer(__name__)


tracer = setup_tracing()

# ============================================================
# 第四部分：Flask 应用集成
# ============================================================

app = Flask(__name__)

# OpenTelemetry Flask 自动埋点
FlaskInstrumentor().instrument_app(app)
RequestsInstrumentor().instrument()


@app.before_request
def before_request():
    """请求前置钩子：记录正在处理的请求数"""
    METRIC_HTTP_REQUESTS_IN_PROGRESS.labels(
        method=request.method
    ).inc()
    request._start_time = time.time()


@app.after_request
def after_request(response):
    """请求后置钩子：记录指标和日志"""
    duration = time.time() - request._start_time
    endpoint = request.path
    method = request.method
    status = response.status_code

    # 记录 Prometheus 指标
    METRIC_HTTP_REQUESTS_TOTAL.labels(
        method=method, endpoint=endpoint, status=status
    ).inc()
    METRIC_HTTP_REQUEST_DURATION.labels(
        method=method, endpoint=endpoint
    ).observe(duration)

    # 记录结构化日志
    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": CONFIG["service_name"],
        "method": method,
        "endpoint": endpoint,
        "status": status,
        "duration_ms": round(duration * 1000, 2),
        "client_ip": request.remote_addr,
        "user_agent": request.headers.get("User-Agent", ""),
    }
    if status >= 500:
        logger.error("请求异常", extra=log_entry)
        send_to_cls(log_entry)
    elif status >= 400:
        logger.warning("请求警告", extra=log_entry)
    else:
        logger.info("请求成功", extra=log_entry)

    # 上报到 TCOP（采样上报，避免 API 限频）
    if random.random() < 0.1:
        report_to_tcop(
            "HttpRequestDuration",
            duration,
            [{"Name": "endpoint", "Value": endpoint}],
        )

    # 减少正在处理的请求计数
    METRIC_HTTP_REQUESTS_IN_PROGRESS.labels(
        method=method
    ).dec()

    return response


# ============================================================
# 业务接口
# ============================================================

@app.route("/api/order", methods=["POST"])
def create_order():
    """创建订单接口"""
    with tracer.start_as_current_span("create_order") as span:
        data = request.get_json()
        user_id = data.get("user_id")
        amount = data.get("amount")
        payment_method = data.get("payment_method", "wechat")

        span.set_attribute("user_id", user_id)
        span.set_attribute("amount", amount)
        span.set_attribute("payment_method", payment_method)

        try:
            # 模拟数据库写入
            with tracer.start_as_current_span("db_insert_order") as db_span:
                db_start = time.time()
                time.sleep(random.uniform(0.01, 0.05))
                db_duration = time.time() - db_start
                METRIC_DB_QUERY_DURATION.labels(
                    query_type="insert"
                ).observe(db_duration)
                db_span.set_attribute("db.operation", "INSERT")
                db_span.set_attribute("db.table", "orders")

            # 模拟调用支付服务
            with tracer.start_as_current_span("call_payment_service") as pay_span:
                pay_start = time.time()
                time.sleep(random.uniform(0.02, 0.1))
                pay_duration = time.time() - pay_start
                pay_span.set_attribute("payment.method", payment_method)
                pay_span.set_attribute("payment.amount", amount)

                # 模拟 5% 的支付失败率
                if random.random() < 0.05:
                    pay_span.set_status(
                        Status(StatusCode.ERROR, "payment declined")
                    )
                    METRIC_ORDER_CREATED_TOTAL.labels(
                        payment_method=payment_method
                    ).inc()
                    logger.error(
                        "支付失败",
                        extra={
                            "user_id": user_id,
                            "amount": amount,
                            "payment_method": payment_method,
                        },
                    )
                    return jsonify({"error": "payment_declined"}), 502

            # 模拟发送消息到队列
            with tracer.start_as_current_span("send_notification") as notify_span:
                time.sleep(random.uniform(0.005, 0.02))
                notify_span.set_attribute("notification.type", "order_confirmation")
                METRIC_QUEUE_DEPTH.labels(
                    queue_name="order_notification"
                ).set(random.randint(10, 100))

            METRIC_ORDER_CREATED_TOTAL.labels(
                payment_method=payment_method
            ).inc()

            logger.info(
                "订单创建成功",
                extra={
                    "user_id": user_id,
                    "amount": amount,
                    "payment_method": payment_method,
                },
            )

            return jsonify({
                "order_id": f"ORD-{int(time.time())}",
                "status": "created",
                "amount": amount,
            }), 201

        except Exception as e:
            span.set_status(Status(StatusCode.ERROR, str(e)))
            logger.error(
                "订单创建异常",
                extra={"user_id": user_id, "error": str(e)},
            )
            return jsonify({"error": "internal_error"}), 500


@app.route("/api/order/<order_id>", methods=["GET"])
def get_order(order_id):
    """查询订单接口"""
    with tracer.start_as_current_span("get_order") as span:
        span.set_attribute("order_id", order_id)

        # 模拟数据库查询
        with tracer.start_as_current_span("db_select_order") as db_span:
            db_start = time.time()
            time.sleep(random.uniform(0.005, 0.03))
            db_duration = time.time() - db_start
            METRIC_DB_QUERY_DURATION.labels(
                query_type="select"
            ).observe(db_duration)
            db_span.set_attribute("db.operation", "SELECT")
            db_span.set_attribute("db.table", "orders")

        # 模拟 2% 的订单不存在
        if random.random() < 0.02:
            logger.warning("订单不存在", extra={"order_id": order_id})
            return jsonify({"error": "not_found"}), 404

        return jsonify({
            "order_id": order_id,
            "user_id": "user-001",
            "amount": 99.50,
            "status": "paid",
            "created_at": "2025-06-28T10:30:00Z",
        }), 200


@app.route("/health", methods=["GET"])
def health_check():
    """健康检查接口"""
    return jsonify({
        "service": CONFIG["service_name"],
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }), 200


@app.route("/metrics", methods=["GET"])
def metrics_endpoint():
    """Prometheus 指标暴露端点"""
    return generate_latest(), 200, {
        "Content-Type": "text/plain; charset=utf-8"
    }


# ============================================================
# 启动入口
# ============================================================

if __name__ == "__main__":
    # 启动 Prometheus 指标 HTTP 服务（端口 8000）
    start_metrics_server(8000)
    logger.info(
        "服务启动",
        extra={
            "service": CONFIG["service_name"],
            "environment": CONFIG["environment"],
            "region": CONFIG["region"],
            "metrics_port": 8000,
            "app_port": 5000,
        },
    )
    # 启动 Flask 应用（端口 5000）
    app.run(host="0.0.0.0", port=5000)
```

### 12.6.3 脚本说明

上述脚本实现了以下可观测性能力：

**指标层：**
- 使用 Prometheus Client 定义了 Counter、Gauge、Histogram 三类指标
- 在 `/metrics` 端点暴露 Prometheus 格式指标，供 TCOP 或 Prometheus 服务端抓取
- 通过 `report_to_tcop` 函数将关键指标上报到腾讯云 TCOP 自定义监控
- 覆盖了 RED 方法的核心指标：请求速率（Counter）、错误数（Counter）、延迟分布（Histogram）

**日志层：**
- 使用 `python-json-logger` 输出结构化 JSON 日志
- 通过 `TraceContextFilter` 自动注入 Trace ID，实现日志与链路的关联
- 日志级别分级：INFO（正常请求）、WARNING（4xx）、ERROR（5xx 和业务异常）
- 通过 `send_to_cls` 函数将关键错误日志发送到腾讯云 CLS

**链路层：**
- 使用 OpenTelemetry SDK 配置分布式追踪
- 通过 FlaskInstrumentor 自动拦截所有 HTTP 请求
- 手动创建业务 Span（`create_order`、`db_insert_order`、`call_payment_service`）
- 通过 OTLP 协议将 Span 导出到腾讯云 APM
- 在 Span 中注入业务属性（user_id、amount、payment_method）

### 12.6.4 运行与验证

```bash
# 启动服务
python observability_setup.py

# 测试健康检查
curl http://localhost:5000/health

# 创建订单
curl -X POST http://localhost:5000/api/order \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user-001", "amount": 99.50, "payment_method": "wechat"}'

# 查询订单
curl http://localhost:5000/api/order/ORD-1719560000

# 查看 Prometheus 指标
curl http://localhost:8000/metrics

# 压测（模拟流量）
for i in $(seq 1 100); do
  curl -X POST http://localhost:5000/api/order \
    -H "Content-Type: application/json" \
    -d "{\"user_id\": \"user-$i\", \"amount\": $((RANDOM % 1000)), \"payment_method\": \"wechat\"}" &
done
wait
```

### 12.6.5 腾讯云产品接入配置

**TCOP 自定义监控接入：**

1. 登录腾讯云控制台，进入"云监控" > "自定义监控"
2. 创建命名空间，如 `order-service`
3. 创建指标，如 `HttpRequestDuration`，维度为 `endpoint`
4. 在脚本中配置 `TCOP_SECRET_ID` 和 `TCOP_SECRET_KEY`
5. 调用 TCOP API 上报指标数据

**CLS 日志接入：**

1. 登录腾讯云控制台，进入"日志服务"
2. 创建日志主题，如 `order-service-log`
3. 在日志主题中配置索引（全文索引或键值索引）
4. 在脚本中配置 `CLS_TOPIC_ID`
5. 使用 LogListener 采集本地日志文件，或通过 API 直推

**APM 链路接入：**

1. 登录腾讯云控制台，进入"应用性能观测"
2. 创建应用，选择接入语言（Python）
3. 获取 OTLP 接入点和 Token
4. 在脚本中配置 `OTLP_ENDPOINT`
5. 启动应用后，APM 控制台自动展示调用链和拓扑

## 12.7 可观测性最佳实践

### 12.7.1 指标设计原则

1. **USE 和 RED 覆盖**：确保每个服务和每个资源都有对应的 USE 或 RED 指标
2. **四个黄金信号**：每个面向用户的服务至少暴露延迟、流量、错误、饱和度四类指标
3. **标签有界**：避免高基数标签（如 user_id、request_id），它们会导致指标存储爆炸
4. **命名规范**：指标名使用 `namespace_metricname_unit` 格式，如 `order_db_query_duration_seconds`
5. **桶分布合理**：Histogram 的桶分布要覆盖业务延迟的典型范围

### 12.7.2 日志管理原则

1. **结构化日志**：始终使用 JSON 格式，便于机器解析和检索
2. **注入上下文**：每条日志包含 service、trace_id、request_id 等关联字段
3. **分级存储**：热日志（7天）使用 SSD 存储，冷日志（30天）使用低频存储，归档日志（长期）使用 COS
4. **避免敏感信息**：日志中不得包含密码、密钥、身份证号等敏感数据
5. **采样策略**：高流量服务对 DEBUG 和 INFO 日志进行采样，ERROR 日志全量保留

### 12.7.3 链路追踪原则

1. **端到端覆盖**：从入口网关到后端服务的完整链路
2. **采样策略**：高流量服务使用头部采样（Head-based Sampling）或尾部采样（Tail-based Sampling）
3. **Span 命名规范**：使用 `HTTP <METHOD> <path>` 或 `RPC <service>/<method>` 格式
4. **关键属性注入**：在 Span 中注入业务关键属性，便于在 APM 中按属性过滤
5. **异步链路**：消息队列场景需要传递 Span Context，保持链路完整

### 12.7.4 告警设计原则

1. **告警应可操作**：每个告警都应该有明确的排查步骤和应急预案
2. **避免告警风暴**：使用告警聚合、依赖告警抑制、告警静默
3. **多维度告警**：结合指标、日志、链路三个维度的数据判断
4. **告警分级**：P0（立即处理，影响用户）、P1（尽快处理，可能影响用户）、P2（工作日处理）、P3（记录跟踪）
5. **告警自愈优先**：对于已知的故障模式，优先实现自动恢复而非告警

### 12.7.5 成本控制

可观测性系统的成本可能远超预期，需要合理控制：

1. **指标采样**：高基数指标使用分位数估算而非精确计算
2. **日志采样**：INFO 日志采样率 1:10，DEBUG 日志采样率 1:100
3. **链路采样**：生产环境通常采样率 1% 即可满足大部分排查需求
4. **数据生命周期**：不同粒度的数据设置不同的保存周期
5. **标签治理**：定期清理不再使用的指标和标签

## 12.8 本章小结

可观测性是现代 SRE 工作的基石。本章从可观测性的基本概念出发，详细介绍了三大支柱（指标、日志、链路追踪）、四大黄金信号（延迟、流量、错误、饱和度）以及 USE 和 RED 两种分析方法。

在腾讯云生态中，TCOP 提供指标监控和告警能力，CLS 提供日志管理和分析能力，APM 提供分布式链路追踪能力。三个产品协同工作，构成了完整的可观测性解决方案。

本章提供的 Python 实战脚本展示了如何在一个微服务中同时集成指标、日志和链路追踪，并将数据上报到腾讯云的三款可观测性产品。读者可以根据实际业务需求，将此脚本作为起点，构建自己的可观测性体系。

最后，请记住可观测性的核心原则：**不是为了监控而监控，而是为了更快地定位和解决问题。** 在设计可观测性系统时，始终以"能否帮助我更快地找到故障根因"为衡量标准。

## 参考资源

- Google SRE 书系：*Site Reliability Engineering*、*The Site Reliability Workbook*
- Brendan Gregg：*USE Method*（https://www.brendangregg.com/usemethod.html）
- Tom Wilkie：*RED Method*（https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/）
- OpenTelemetry 官方文档：https://opentelemetry.io/docs/
- 腾讯云可观测平台（TCOP）：https://cloud.tencent.com/product/monitor
- 腾讯云日志服务（CLS）：https://cloud.tencent.com/product/cls
- 腾讯云应用性能观测（APM）：https://cloud.tencent.com/product/apm
- Prometheus 官方文档：https://prometheus.io/docs/
