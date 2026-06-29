# 第13章 腾讯云可观测平台（TCOP）监控实战

## 13.1 概述

### 13.1.1 可观测性的三大支柱

在深入 TCOP 之前，有必要先理解可观测性（Observability）的核心理念。可观测性由三大支柱构成：

**指标（Metrics）**：可聚合、可计算的数值型数据，如 CPU 使用率、QPS、响应时间。指标的特点是存储成本低、查询速度快、适合长期趋势分析和告警触发。TCOP 的核心能力就建立在指标之上。

**日志（Logs）**：带时间戳的离散事件记录，如应用日志、访问日志、错误堆栈。日志的特点是信息丰富、适合问题定位，但存储成本高、查询速度慢。TCOP 通过日志服务（CLS）提供日志采集、检索和分析能力。

**链路追踪（Traces）**：记录请求在分布式系统中的完整调用链，如一次 HTTP 请求经过网关、微服务 A、微服务 B、数据库的完整路径。链路追踪的特点是适合定位分布式系统的性能瓶颈和错误根源。TCOP 通过应用性能观测（APM）提供链路追踪能力。

三大支柱缺一不可：指标告诉你"系统出问题了"，日志告诉你"哪里出了问题"，链路追踪告诉你"为什么出问题"。本章聚焦于指标这一支柱，但会涉及与日志和链路追踪的联动场景。

### 13.1.2 TCOP 架构概览

腾讯云可观测平台（Tencent Cloud Observability Platform，简称 TCOP）是腾讯云提供的一站式可观测性服务平台，覆盖监控、告警、日志、链路追踪等核心能力。TCOP 的前身是腾讯云监控（Cloud Monitor），在 2022 年升级为可观测平台，整合了原有的云监控、云拨测、Prometheus 托管服务和应用性能观测等产品线。

TCOP 的整体架构分为四层：

1. **数据采集层**：通过 Barad Agent（云产品内置）、自定义 Agent（用户业务）、Prometheus Remote Write、云拨测节点等多种方式采集指标数据
2. **数据处理层**：对原始数据进行清洗、聚合、降采样、异常检测等处理，生成不同粒度的时序数据
3. **存储与查询层**：基于腾讯自研的时序数据库 TSDB 存储指标数据，支持毫秒级查询响应
4. **应用层**：提供告警管理、Dashboard、Grafana 集成、API 等面向用户的功能

对于 SRE 工程师而言，TCOP 是保障业务稳定性的第一道防线。在云原生架构日益复杂的今天，仅靠人工巡检已无法满足业务连续性的要求，必须建立一套自动化、智能化的监控体系。

TCOP 的核心能力可以概括为三个层面：**数据采集层**负责从云产品、业务代码、基础设施等多个维度采集指标数据；**存储与计算层**负责数据的聚合、降采样、存储和查询；**告警与可视化层**负责将数据转化为可执行的告警通知和直观的 Dashboard 展示。

本章将从基础监控指标入手，逐步深入到自定义监控、Prometheus 兼容模式、告警策略设计、告警收敛与抑制、Dashboard 构建以及 Grafana 集成，最后通过一个完整的电商平台实战案例，帮助读者构建一套完整的云上监控体系。

## 13.2 基础监控指标

### 13.2.1 云服务器（CVM）基础指标

每台 CVM 实例创建完成后，TCOP 会自动采集基础监控指标，无需额外安装 Agent。这些指标通过腾讯云内部的轻量级监控 Agent（也称为 Barad Agent）采集，默认采集周期为 15 秒，控制台展示时按 60 秒粒度聚合。指标按维度分为四类：

**CPU 相关指标**
- `CPUUsage` — CPU 使用率（%），取值为 0~100，表示 CPU 处于非空闲状态的时间占比
- `CPULoadAvg` — CPU 平均负载（1min/5min/15min），反映系统整体负载情况
- `CPUIdle` — CPU 空闲时间占比，与 CPUUsage 互补
- `CPUSteal` — 虚拟化环境中的 Steal 时间占比，过高说明宿主机资源争抢严重

**内存相关指标**
- `MemUsage` — 内存使用率（%），计算公式为 (总内存 - 可用内存) / 总内存 × 100
- `MemAvailable` — 可用内存大小（MB），包含可回收的缓存和缓冲区
- `MemUsed` — 已用内存大小（MB）
- `SwapUsage` — 交换分区使用率（%），持续升高通常意味着物理内存不足

**网络相关指标**
- `LanOuttraffic` / `LanIntraffic` — 内网出/入流量（Bps）
- `WanOuttraffic` / `WanIntraffic` — 外网出/入流量（Bps）
- `PacketDropRate` — 丢包率，网络质量的核心指标
- `TcpConnectCount` — TCP 连接数，用于判断连接泄漏

**磁盘相关指标**
- `DiskUsage` — 磁盘使用率（%），按分区统计
- `DiskReadTraffic` / `DiskWriteTraffic` — 磁盘读写流量（KB/s）
- `DiskIOAwait` — 磁盘 IO 等待时间（ms），超过 100ms 通常意味着磁盘成为瓶颈
- `DiskIOPS` — 磁盘每秒读写次数，对数据库类实例尤为重要

理解这些指标的含义和正常基线是 SRE 的基本功。例如，CPUUsage 长期超过 80% 不一定需要告警，但如果伴随 CPULoadAvg 持续升高和 IOAwait 增加，则说明系统可能处于过载状态。指标之间往往存在关联性，单一指标的阈值告警容易产生误报，这也是后面 13.5 节中告警策略设计需要关注的重点。

### 13.2.2 通过 tccli 查询监控数据

tccli 是腾讯云官方命令行工具，SRE 可以通过脚本批量拉取监控数据，用于自动化巡检或自建看板。tccli 基于腾讯云 API 3.0 封装，支持所有云产品的监控数据查询。

```bash
# 安装 tccli（如未安装）
pip install tccli

# 配置密钥
tccli configure --profile default
# 提示输入 SecretId、SecretKey、region（如 ap-guangzhou）

# 查询 CVM CPU 使用率（最近 5 分钟，周期 60s）
tccli monitor GetMonitorData \
  --Namespace QCE/CVM \
  --MetricName CPUUsage \
  --Instances '[{"Dimensions":[{"Name":"InstanceId","Value":"ins-xxxxxxx"}]}]' \
  --Period 60 \
  --StartTime "$(date -u -d '5 minutes ago' '+%Y-%m-%dT%H:%M:%S+08:00')" \
  --EndTime "$(date -u '+%Y-%m-%dT%H:%M:%S+08:00')"
```

返回结果示例：

```json
{
  "Response": {
    "StartTime": "2026-06-28T14:00:00+08:00",
    "EndTime": "2026-06-28T14:05:00+08:00",
    "Period": 60,
    "MetricName": "CPUUsage",
    "DataPoints": [
      {"Timestamps": [1751151600, 1751151660, ...], "Values": [12.3, 15.7, ...]}
    ],
    "RequestId": "xxx-xxx-xxx"
  }
}
```

`GetMonitorData` 接口的关键参数说明：

- **Namespace**：云产品命名空间，如 `QCE/CVM` 表示云服务器
- **MetricName**：指标名称，如 `CPUUsage`
- **Instances**：实例维度，JSON 数组格式，支持多实例批量查询
- **Period**：数据粒度，单位为秒。支持 60、300、3600 等，粒度越细返回数据点越多
- **StartTime / EndTime**：查询时间范围，ISO 8601 格式，最长支持查询近 30 天的数据

### 13.2.3 批量查询多个实例

生产环境中通常需要批量拉取全量机器的指标，可以结合 jq 进行管道处理：

```bash
# 查询所有 CVM 实例的 CPU 使用率
INSTANCE_IDS=$(tccli cvm DescribeInstances --Limit 100 \
  | jq -r '.InstanceSet[].InstanceId')

for ID in $INSTANCE_IDS; do
  tccli monitor GetMonitorData \
    --Namespace QCE/CVM \
    --MetricName CPUUsage \
    --Instances "[{\"Dimensions\":[{\"Name\":\"InstanceId\",\"Value\":\"$ID\"}]}]" \
    --Period 300 \
    --StartTime "$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%S+08:00')" \
    --EndTime "$(date -u '+%Y-%m-%dT%H:%M:%S+08:00')" \
    | jq '{instance: "'$ID'", avg: [.Response.DataPoints[0].Values] | add / length}'
done
```

对于大规模集群（数百台以上），建议使用 TCOP 的 API 3.0 SDK 进行并发查询，避免串行查询耗时过长。Python 并发查询示例如下：

```python
import asyncio
import aiohttp
import json

SECRET_ID = "your-secret-id"
SECRET_KEY = "your-secret-key"
REGION = "ap-guangzhou"

async def query_instance_metric(session, instance_id):
    url = f"https://monitor.{REGION}.tencentcloudapi.com"
    params = {
        "Action": "GetMonitorData",
        "Version": "2018-07-24",
        "Namespace": "QCE/CVM",
        "MetricName": "CPUUsage",
        "Period": 300,
        "Instances": json.dumps([{"Dimensions": [{"Name": "InstanceId", "Value": instance_id}]}]),
        "StartTime": "2026-06-28T14:00:00+08:00",
        "EndTime": "2026-06-28T15:00:00+08:00",
    }
    async with session.get(url, params=params) as resp:
        data = await resp.json()
        values = data.get("Response", {}).get("DataPoints", [{}])[0].get("Values", [])
        avg = sum(values) / len(values) if values else 0
        return {"instance": instance_id, "avg_cpu": round(avg, 2)}

async def main():
    instance_ids = ["ins-a", "ins-b", "ins-c"]  # 实际从 DescribeInstances 获取
    async with aiohttp.ClientSession() as session:
        tasks = [query_instance_metric(session, iid) for iid in instance_ids]
        results = await asyncio.gather(*tasks)
        for r in results:
            print(f"{r['instance']}: {r['avg_cpu']}%")

asyncio.run(main())
```

### 13.2.4 云产品命名空间速查

不同云产品的监控数据通过 `Namespace` 区分，常用命名空间如下：

| 云产品 | Namespace | 典型指标 |
|--------|-----------|----------|
| 云服务器 CVM | `QCE/CVM` | CPUUsage, MemUsage, DiskUsage |
| 云数据库 MySQL | `QCE/CDB` | ThreadsRunning, SlowQueries, QPS |
| 云数据库 Redis | `QCE/REDIS` | CpuUsage, Connections, Keys |
| 负载均衡 CLB | `QCE/LB` | Connum, Inpkg, Outpkg, Http5xx |
| 对象存储 COS | `QCE/COS` | StandardStorage, Requests, Traffic |
| 消息队列 CKafka | `QCE/CKAFKA` | MsgCount, ProduceConsumeLatency |
| 内容分发 CDN | `QCE/CDN` | TotalRequests, HitRate, Bandwidth |
| 云原生数据库 TDSQL | `QCE/TDSQL` | ActiveConnections, SlowQueryCount |
| 弹性伸缩 AS | `QCE/AS` | InstanceCount, ScaleInSuccess |
| 容器服务 TKE | `QCE/TKE` | CpuUsage, MemUsage, PodCount |

### 13.2.5 指标数据聚合与降采样

TCOP 在存储指标数据时会自动进行多级聚合。原始 15 秒粒度的数据经过降采样后生成 1 分钟、5 分钟、1 小时和 1 天粒度的数据。降采样算法支持 Average、Maximum、Minimum、Sum 和 Count 五种聚合方式。在查询时，TCOP 会根据查询的时间范围自动选择最合适的粒度：查询最近 1 小时的数据返回 1 分钟粒度，查询 7 天前的数据则自动切换到 5 分钟或 1 小时粒度。这种多级存储策略在保证查询精度的同时有效控制了存储成本。

### 13.2.6 监控数据存储与保留策略

TCOP 对不同粒度的监控数据采用不同的保留时长，了解这些限制有助于合理设计查询和告警策略：

| 数据粒度 | 保留时长 | 适用场景 |
|----------|----------|----------|
| 原始数据（15 秒） | 1 天 | 实时监控、短期问题排查 |
| 1 分钟聚合 | 15 天 | 日常监控、告警评估 |
| 5 分钟聚合 | 31 天 | 趋势分析、周报 |
| 1 小时聚合 | 6 个月 | 容量规划、季度分析 |
| 1 天聚合 | 2 年 | 合规审计、年度回顾 |

如果需要长期保存原始粒度的监控数据，建议通过 TCOP 的数据导出功能将指标数据投递到 COS（对象存储）或 CKafka，再导入自建的时间序列数据库。

## 13.3 自定义监控（Custom Metrics）

### 13.3.1 为什么需要自定义监控

基础监控只能覆盖操作系统和云产品层面的指标，业务层面的指标（如 QPS、订单量、支付成功率、队列深度）需要由业务代码主动上报。TCOP 支持通过 API 上报自定义指标，数据存储在 TCOP 中，与平台原生指标享受相同的告警、Dashboard 能力。

自定义监控的典型使用场景包括：

- **业务量监控**：如每分钟订单数、活跃用户数、支付金额
- **性能监控**：如接口 P99 延迟、数据库查询耗时分布
- **业务健康度**：如支付成功率、登录成功率、退款率
- **中间件指标**：如自建 Nginx 的活跃连接数、自建 RabbitMQ 的队列深度

### 13.3.2 通过 API 上报自定义指标

自定义指标的上报入口为 `PutMonitorData` 接口，支持批量上报。每次上报最多携带 20 个指标，每个指标可以附带多个维度标签。

```bash
# 上报单个自定义指标
tccli monitor PutMonitorData \
  --AnnounceIp "10.0.0.1" \
  --AnnounceTimestamp "$(date +%s)" \
  --Metrics '[{"MetricName":"OrderQPS","Value":1234,"Unit":"Count/Sec"}]'
```

Python SDK 上报示例：

```python
#!/usr/bin/env python3
"""上报业务自定义指标到 TCOP"""

import json
import time
import random
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.monitor.v20180724 import monitor_client, models

SECRET_ID = "your-secret-id"
SECRET_KEY = "your-secret-key"
REGION = "ap-guangzhou"


def report_metric(metric_name, value, unit, instance_id=None):
    """上报单个指标"""
    try:
        cred = credential.Credential(SECRET_ID, SECRET_KEY)
        client = monitor_client.MonitorClient(cred, REGION)

        req = models.PutMonitorDataRequest()
        req.AnnounceIp = "127.0.0.1"
        req.AnnounceTimestamp = int(time.time())
        req.Metrics = [
            {"MetricName": metric_name, "Value": value, "Unit": unit}
        ]

        resp = client.PutMonitorData(req)
        return resp.to_json_string()
    except TencentCloudSDKException as err:
        print(f"上报失败: {err}")
        return None


def report_batch_metrics(metrics_list):
    """批量上报多个指标"""
    try:
        cred = credential.Credential(SECRET_ID, SECRET_KEY)
        client = monitor_client.MonitorClient(cred, REGION)

        req = models.PutMonitorDataRequest()
        req.AnnounceIp = "127.0.0.1"
        req.AnnounceTimestamp = int(time.time())
        req.Metrics = metrics_list

        resp = client.PutMonitorData(req)
        return resp.to_json_string()
    except TencentCloudSDKException as err:
        print(f"批量上报失败: {err}")
        return None


if __name__ == "__main__":
    # 模拟业务指标上报
    metrics = [
        {"MetricName": "OrderQPS", "Value": random.randint(800, 1500), "Unit": "Count/Sec"},
        {"MetricName": "PaymentSuccessRate", "Value": round(random.uniform(98.5, 99.9), 2), "Unit": "%"},
        {"MetricName": "OrderQueueDepth", "Value": random.randint(0, 200), "Unit": "Count"},
    ]
    result = report_batch_metrics(metrics)
    print(f"上报结果: {result}")
```

### 13.3.3 自定义指标命名规范

建议为自定义指标建立统一的命名规范，避免混乱：

- **命名格式**：`<业务>/<模块>/<指标名>`，例如 `order/payment/success_rate`
- **单位统一**：QPS 统一使用 `Count/Sec`，耗时统一使用 `ms`，百分比统一使用 `%`
- **维度标签**：通过 `Dimensions` 参数携带业务标签，如 `{"name":"module","value":"checkout"}`
- **上报频率**：建议每分钟上报一次，过于频繁会增加成本，过于稀疏会导致告警延迟

### 13.3.4 自定义指标查询

自定义指标上报后，可以通过 `GetMonitorData` 接口查询，Namespace 固定为 `QCE/CUSTOM`：

```bash
tccli monitor GetMonitorData \
  --Namespace QCE/CUSTOM \
  --MetricName OrderQPS \
  --Instances '[{"Dimensions":[{"Name":"ip","Value":"10.0.0.1"}]}]' \
  --Period 60 \
  --StartTime "2026-06-28T14:00:00+08:00" \
  --EndTime "2026-06-28T15:00:00+08:00"
```

## 13.4 Prometheus 兼容模式

### 13.4.1 概述

TCOP 提供 Prometheus 兼容接口，允许用户使用标准 Prometheus 协议上报指标，并与 TCOP 原生监控体系打通。这意味着团队可以复用已有的 Prometheus 生态工具（如 exporters、client libraries），同时享受 TCOP 的告警、存储和 Dashboard 能力。

Prometheus 兼容模式的核心优势在于：不需要在每台机器上部署 TCOP Agent，只需要在已有的 Prometheus 配置中添加一个 Remote Write 端点，即可将数据同步到 TCOP。对于已经深度使用 Prometheus 的团队，迁移成本几乎为零。

### 13.4.2 接入方式

TCOP Prometheus 兼容模式通过托管 Prometheus 服务（TMP，Tencent Managed Prometheus）实现。用户只需创建一个 TMP 实例，即可获得一个标准的 Prometheus 远程写入端点。

```bash
# 通过 tccli 创建 TMP 实例
tccli monitor CreatePrometheusInstance \
  --InstanceName "prod-prometheus" \
  --VpcId "vpc-xxxxxxx" \
  --SubnetId "subnet-xxxxxxx" \
  --DataRetentionTime 15
```

创建完成后，TMP 实例会分配一个唯一的实例 ID 和访问地址，格式为 `https://<instance-id>.ap-guangzhou.monitor.tencent.com`。

### 13.4.3 配置 Remote Write

在已有 Prometheus 服务器的 `prometheus.yml` 中添加远程写入配置：

```yaml
remote_write:
  - url: "https://<tmp-instance-id>.ap-guangzhou.monitor.tencent.com/api/v1/prometheus/write"
    basic_auth:
      username: "<your-secret-id>"
      password: "<your-secret-key>"
    write_relabel_configs:
      - source_labels: [__name__]
        regex: "node_.*|container_.*"
        action: keep
    # 可选：添加队列配置以优化写入性能
    queue_config:
      max_samples_per_send: 1000
      capacity: 10000
      min_shards: 3
```

`write_relabel_configs` 用于过滤需要同步的指标，避免将所有指标都写入 TMP，从而控制存储成本。`queue_config` 中的 `min_shards` 参数在高指标量场景下可以提升写入吞吐。

### 13.4.4 使用 Prometheus Client 直接上报

对于无法部署完整 Prometheus Server 的场景（如 Serverless 函数、短期任务），可以直接使用 Prometheus Client Library 将指标推送到 TMP：

```python
#!/usr/bin/env python3
"""使用 Prometheus Client 直接上报指标到 TCOP TMP"""

import time
import random
from prometheus_client import Counter, Gauge, Histogram, push_to_gateway

# 定义指标
orders_total = Counter("app_orders_total", "Total number of orders", ["status"])
request_duration = Histogram("app_request_duration_seconds", "Request latency in seconds",
                             buckets=[0.01, 0.05, 0.1, 0.5, 1, 5])
queue_depth = Gauge("app_queue_depth", "Current queue depth")

# 模拟业务逻辑并推送
def collect_and_push():
    for _ in range(100):
        status = random.choice(["success", "failed", "pending"])
        orders_total.labels(status=status).inc()

    duration = random.gauss(0.2, 0.05)
    request_duration.observe(max(0.01, duration))

    queue_depth.set(random.randint(0, 500))

    push_to_gateway(
        "https://<tmp-instance-id>.ap-guangzhou.monitor.tencent.com/api/v1/prometheus/write",
        job="order-service",
        registry=None,
        basic_auth=("<your-secret-id>", "<your-secret-key>"),
    )


if __name__ == "__main__":
    while True:
        collect_and_push()
        time.sleep(15)
```

### 13.4.5 查询 Prometheus 指标

TMP 提供标准的 Prometheus HTTP API，支持 PromQL 查询：

```bash
# 通过 PromQL 查询指标
curl -u "<secret-id>:<secret-key>" \
  "https://<tmp-instance-id>.ap-guangzhou.monitor.tencent.com/api/v1/query?query=avg(node_cpu_seconds_total%7Bmode%3D%22idle%22%7D)%20by%20(instance)"
```

TMP 也支持 Range Query，用于 Dashboard 绘图：

```bash
# Range Query：过去 1 小时的 CPU 使用率
curl -u "<secret-id>:<secret-key>" \
  "https://<tmp-instance-id>.ap-guangzhou.monitor.tencent.com/api/v1/query_range?query=100%20-%20avg(rate(node_cpu_seconds_total%7Bmode%3D%22idle%22%7D%5B5m%5D))%20by%20(instance)&start=$(date -d '1 hour ago' +%s)&end=$(date +%s)&step=60"
```

### 13.4.6 TMP 与自建 Prometheus 的选型对比

在选择使用 TMP 还是自建 Prometheus 时，需要从多个维度进行权衡：

| 维度 | TMP（托管） | 自建 Prometheus |
|------|------------|----------------|
| 运维成本 | 零运维，腾讯云负责高可用 | 需要自行维护 Prometheus Server、Thanos 等组件 |
| 存储容量 | 按量付费，最大支持 PB 级 | 受限于自建磁盘和对象存储 |
| 数据持久性 | 多副本存储，SLA 99.95% | 取决于自建存储方案 |
| 查询性能 | 自动水平扩展 | 需要手动配置分片和联邦 |
| 与 TCOP 集成 | 原生集成，告警/Dashboard 一键打通 | 需要通过 Remote Write 或 API 桥接 |
| 成本 | 按指标数量和存储时长计费 | 需要预留服务器资源，固定成本 |

对于中小规模团队（指标数 < 10 万），推荐使用 TMP 以降低运维负担。对于超大规模或对 Prometheus 有深度定制需求的团队，可以考虑自建方案并通过 Remote Write 将数据同步到 TCOP 作为备份。

### 13.4.7 TMP 告警规则配置

TMP 支持在控制台配置 Prometheus 风格的告警规则，无需维护单独的 `rules.yml` 文件。告警规则通过 PromQL 表达式定义，支持与 TCOP 原生告警相同的通知渠道。

```yaml
# 通过 TMP API 创建的告警规则示例
groups:
  - name: node_alerts
    rules:
      - alert: NodeCPUHigh
        expr: 100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance) > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "实例 {{ $labels.instance }} CPU 使用率超过 85%"
          description: "当前值: {{ $value }}%"

      - alert: NodeDiskFull
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.15
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "实例 {{ $labels.instance }} 磁盘空间不足"
          description: "可用空间低于 15%，当前剩余: {{ $value | humanizePercentage }}"
```

### 13.2.7 通过 Python SDK 批量查询监控数据

对于需要集成到自动化平台或 CI/CD 管道的场景，使用 Python SDK 比 tccli 更灵活：

```python
from tencentcloud.monitor.v20180724 import monitor_client, models
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
import json

def query_metric(secret_id, secret_key, region, namespace, metric, instance_id, period=60, minutes=60):
    cred = credential.Credential(secret_id, secret_key)
    client = monitor_client.MonitorClient(cred, region)
    req = models.GetMonitorDataRequest()
    req.Namespace = namespace
    req.MetricName = metric
    req.Period = period
    req.Instances = json.dumps([{"Dimensions": [{"Name": "InstanceId", "Value": instance_id}]}])
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    req.StartTime = (now - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S+08:00")
    req.EndTime = now.strftime("%Y-%m-%dT%H:%M:%S+08:00")
    try:
        resp = client.GetMonitorData(req)
        data = json.loads(resp.to_json_string())
        points = data.get("Response", {}).get("DataPoints", [{}])[0].get("Values", [])
        return {"metric": metric, "avg": sum(points)/len(points) if points else 0, "max": max(points) if points else 0}
    except TencentCloudSDKException as e:
        return {"metric": metric, "error": str(e)}

result = query_metric("your-secret-id", "your-secret-key", "ap-guangzhou", "QCE/CVM", "CPUUsage", "ins-xxxxxxx")
print(f"CPU 平均使用率: {result['avg']}%")
```

## 13.5 告警策略设计

### 13.5.1 告警三要素

TCOP 告警策略由三个核心部分组成：

1. **监控对象**：要监控的云资源，可以是单个实例、实例分组或标签匹配。标签匹配支持动态绑定，新创建的实例如果带有匹配的标签，会自动加入告警范围
2. **告警条件**：触发告警的指标阈值或 PromQL 表达式。支持多条件组合（AND/OR），例如 CPU > 80% AND 内存 > 90%
3. **通知渠道**：告警触发后的通知方式（短信、邮件、企微、钉钉、Webhook）。每个通知渠道可以绑定不同的通知模板

### 13.5.2 通过 tccli 创建告警策略

```bash
# 创建 CVM CPU 告警策略
tccli monitor CreateAlarmPolicy \
  --PolicyName "CVM-CPU-高告警-生产" \
  --ConditionTemplateId 0 \
  --MonitorType "MT_QCE" \
  --Enable 1 \
  --ProjectId 0 \
  --Namespace "QCE/CVM" \
  --Conditions '{
    "MetricName": "CPUUsage",
    "Period": 60,
    "EvaluatePeriod": 5,
    "Statistic": "Average",
    "Threshold": 80,
    "Operator": "gt",
    "ContinuePeriod": 3
  }' \
  --EventConditions '[]' \
  --NoticeIds ["notice-xxxxxxx"] \
  --TriggerTasks '[]' \
  --PolicyTag '[{"Key":"env","Value":"production"}]'
```

参数说明：
- `Period`：统计周期（秒），60 表示每分钟一个数据点
- `EvaluatePeriod`：评估周期数，5 表示连续 5 个周期
- `ContinuePeriod`：持续周期数，3 表示持续 3 个周期后触发
- `Statistic`：统计方式，支持 Average、Maximum、Minimum、Sum、Count
- `Operator`：比较运算符，gt（大于）、gte（大于等于）、lt（小于）、lte（小于等于）

### 13.5.3 告警策略设计原则

**原则一：分层告警**

将告警按严重程度分为三个层级：

| 级别 | 标签 | 响应时间 | 通知方式 | 示例 |
|------|------|----------|----------|------|
| P0 紧急 | `severity:critical` | 5 分钟 | 电话 + 短信 + 企微 | 实例宕机、磁盘写满 |
| P1 警告 | `severity:warning` | 15 分钟 | 短信 + 企微 | CPU > 85% 持续 10 分钟 |
| P2 通知 | `severity:info` | 30 分钟 | 企微 | 内存 > 70% |

**原则二：避免告警风暴**

- 设置合理的持续周期数（ContinuePeriod），避免瞬时抖动触发告警
- 对批量操作（如发布、扩容）提前配置告警屏蔽
- 使用告警收敛（详见 13.6 节）
- 避免对同一故障场景设置多条冗余告警

**原则三：告警可操作性**

每条告警消息应包含：
- 问题描述（什么指标异常）
- 影响范围（哪些实例、哪个模块）
- 建议操作（如何排查、如何恢复）

**原则四：告警分级升级**

告警不应永远停留在同一级别。如果一条 P1 告警在 30 分钟内未被确认，应自动升级为 P0，通知更高级别的值班人员。

### 13.5.4 Python 批量创建告警策略

```python
#!/usr/bin/env python3
"""批量创建告警策略"""

import json
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.monitor.v20180724 import monitor_client, models

SECRET_ID = "your-secret-id"
SECRET_KEY = "your-secret-key"
REGION = "ap-guangzhou"
NOTICE_ID = "notice-xxxxxxx"


def create_cpu_alarm_policy(policy_name, instance_group_id, threshold, severity):
    """创建 CPU 告警策略"""
    try:
        cred = credential.Credential(SECRET_ID, SECRET_KEY)
        client = monitor_client.MonitorClient(cred, REGION)

        req = models.CreateAlarmPolicyRequest()
        req.PolicyName = policy_name
        req.MonitorType = "MT_QCE"
        req.Namespace = "QCE/CVM"
        req.Enable = 1
        req.ProjectId = 0
        req.NoticeIds = [NOTICE_ID]

        condition = models.AlarmPolicyCondition()
        condition.MetricName = "CPUUsage"
        condition.Period = 60
        condition.EvaluatePeriod = 5
        condition.Statistic = "Average"
        condition.Threshold = str(threshold)
        condition.Operator = "gt"
        condition.ContinuePeriod = 3
        req.Conditions = condition

        req.ConditionsTemp = models.ConditionsTemp()
        req.ConditionsTemp.TemplateId = "0"

        req.PolicyTag = [
            {"Key": "severity", "Value": severity},
            {"Key": "env", "Value": "production"},
        ]

        resp = client.CreateAlarmPolicy(req)
        result = json.loads(resp.to_json_string())
        print(f"[{severity}] 创建告警策略成功: {policy_name}, ID: {result.get('PolicyId')}")
        return result.get("PolicyId")

    except TencentCloudSDKException as err:
        print(f"创建告警策略失败: {err}")
        return None


def create_mem_alarm_policy(policy_name, threshold, severity):
    """创建内存告警策略"""
    try:
        cred = credential.Credential(SECRET_ID, SECRET_KEY)
        client = monitor_client.MonitorClient(cred, REGION)

        req = models.CreateAlarmPolicyRequest()
        req.PolicyName = policy_name
        req.MonitorType = "MT_QCE"
        req.Namespace = "QCE/CVM"
        req.Enable = 1
        req.ProjectId = 0
        req.NoticeIds = [NOTICE_ID]

        condition = models.AlarmPolicyCondition()
        condition.MetricName = "MemUsage"
        condition.Period = 60
        condition.EvaluatePeriod = 5
        condition.Statistic = "Average"
        condition.Threshold = str(threshold)
        condition.Operator = "gt"
        condition.ContinuePeriod = 3
        req.Conditions = condition

        req.PolicyTag = [
            {"Key": "severity", "Value": severity},
            {"Key": "env", "Value": "production"},
        ]

        resp = client.CreateAlarmPolicy(req)
        result = json.loads(resp.to_json_string())
        print(f"[{severity}] 创建告警策略成功: {policy_name}, ID: {result.get('PolicyId')}")
        return result.get("PolicyId")

    except TencentCloudSDKException as err:
        print(f"创建告警策略失败: {err}")
        return None


if __name__ == "__main__":
    policies = [
        ("CVM-CPU-紧急告警-生产", 90, "critical"),
        ("CVM-CPU-警告告警-生产", 80, "warning"),
        ("CVM-CPU-通知告警-生产", 70, "info"),
        ("CVM-内存-紧急告警-生产", 90, "critical"),
        ("CVM-内存-警告告警-生产", 85, "warning"),
    ]

    for name, threshold, severity in policies:
        if "CPU" in name:
            create_cpu_alarm_policy(name, None, threshold, severity)
        else:
            create_mem_alarm_policy(name, threshold, severity)
```

### 13.5.5 通知渠道配置

告警策略需要绑定通知渠道才能发送告警。通知渠道通过 `CreateAlarmNotice` 接口创建：

```bash
# 创建通知渠道（企微 + 短信）
tccli monitor CreateAlarmNotice \
  --Name "生产环境-P0通知" \
  --NoticeType "ALL" \
  --UserNotices '[
    {
      "ReceiverType": "USER",
      "UserIds": ["10001", "10002"],
      "NoticeWay": ["SMS", "EMAIL", "WECHAT"],
      "PhoneOrder": [10001, 10002],
      "PhoneCallTimes": [0, 1, 2],
      "PhoneInterval": 120,
      "NeedPhoneArriveNotice": 1
    }
  ]' \
  --UrlNotices '[
    {
      "URL": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
      "EndTime": 86400,
      "StartTime": 0,
      "WechatAccount": "_"
    }
  ]'
```

### 13.5.6 告警策略模板化

对于大规模集群，逐条创建告警策略效率太低。推荐使用告警策略模板（ConditionsTemplate），将通用的告警条件定义为模板，然后批量应用到不同的实例组：

```python
def create_alarm_template(template_name, conditions):
    """创建告警条件模板"""
    req = models.CreateConditionsTemplateRequest()
    req.TemplateName = template_name
    req.Conditions = conditions
    resp = client.CreateConditionsTemplate(req)
    return json.loads(resp.to_json_string()).get("TemplateId")

def apply_template_to_instances(template_id, instance_ids, policy_name_prefix):
    """将模板应用到多个实例"""
    for i, instance_id in enumerate(instance_ids):
        req = models.CreateAlarmPolicyRequest()
        req.PolicyName = f"{policy_name_prefix}-{instance_id}"
        req.ConditionTemplateId = template_id
        req.MonitorType = "MT_QCE"
        req.Namespace = "QCE/CVM"
        req.Enable = 1
        # ... 设置监控对象为 instance_id
        client.CreateAlarmPolicy(req)
```

## 13.6 告警收敛与抑制

### 13.6.1 为什么需要告警收敛

当一台 CVM 宕机时，可能会同时触发 CPU 不可达、内存不可达、进程存活检查失败、上游健康检查失败等多条告警。如果不做收敛，值班 SRE 会在短时间内收到几十条重复告警，造成"告警疲劳"，反而容易遗漏真正重要的告警。

告警收敛的核心目标是：**将多条相关的告警合并为一条可执行的告警**，减少噪音，提高告警的信噪比。

### 13.6.2 TCOP 告警收敛机制

TCOP 提供三种告警收敛方式：

**1. 基于标签的分组收敛**

将相同维度的告警合并为一条。例如，同一台机器的所有告警合并为一条聚合消息：

```bash
tccli monitor UpdateAlarmPolicy \
  --PolicyId "policy-xxxxxxx" \
  --ConditionTemplateId 0 \
  --Conditions '{
    "MetricName": "CPUUsage",
    "Period": 60,
    "EvaluatePeriod": 5,
    "Statistic": "Average",
    "Threshold": 80,
    "Operator": "gt",
    "ContinuePeriod": 3,
    "IsUnionRule": 1
  }'
```

`IsUnionRule=1` 表示启用规则聚合，相同维度的告警将合并发送。

**2. 告警屏蔽**

在已知的变更窗口内屏蔽告警，避免因发布、扩容等操作产生误告警：

```bash
# 创建告警屏蔽
tccli monitor CreateAlarmShield \
  --ShieldType 1 \
  --StartTime "2026-06-29 02:00:00" \
  --EndTime "2026-06-29 04:00:00" \
  --ShieldObject "ins-xxxxxxx" \
  --Reason "计划内发布，屏蔽告警"
```

告警屏蔽支持三种类型：
- **实例屏蔽**：屏蔽指定实例的所有告警
- **策略屏蔽**：屏蔽指定告警策略的所有告警
- **全局屏蔽**：屏蔽所有告警（仅用于重大变更窗口）

**3. 告警静默期**

同一告警策略在静默期内不会重复发送通知。静默期默认 5 分钟，可通过告警策略的 `RepeatInterval` 参数调整：

```python
# 设置告警静默期为 30 分钟
req.RepeatInterval = 1800  # 单位：秒
```

### 13.6.3 告警抑制策略设计

推荐的分层抑制策略：

```
收到告警 → 判断是否在屏蔽窗口 → 是 → 丢弃
         → 否 → 判断是否与已有告警同维度 → 是 → 合并到已有告警
              → 否 → 判断告警级别
                   → P0 → 立即通知（电话 + 短信）
                   → P1 → 延迟 2 分钟通知（短信 + 企微）
                   → P2 → 延迟 5 分钟通知（企微）
```

### 13.6.4 通过 Webhook 实现自定义收敛

对于更复杂的收敛逻辑，可以通过告警 Webhook 将告警转发到自建服务：

```python
#!/usr/bin/env python3
"""告警 Webhook 接收与自定义收敛服务"""

from flask import Flask, request, jsonify
from collections import defaultdict
import time
import threading
import requests

app = Flask(__name__)

alarm_cache = defaultdict(list)
LOCK = threading.Lock()
WINDOW_SECONDS = 300  # 5 分钟收敛窗口


def send_merged_alarm(instance_id, alarms):
    """发送合并后的告警"""
    merged_msg = {
        "instance_id": instance_id,
        "alarm_count": len(alarms),
        "alarms": [
            {
                "metric": a.get("MetricName"),
                "value": a.get("CurrentValue"),
                "threshold": a.get("Threshold"),
                "level": a.get("Severity"),
            }
            for a in alarms
        ],
        "summary": f"实例 {instance_id} 在 {WINDOW_SECONDS}s 内有 {len(alarms)} 条告警",
    }

    webhook_url = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
    requests.post(webhook_url, json={
        "msgtype": "markdown",
        "markdown": {
            "content": (
                f"## 合并告警通知\n"
                f"**实例**: {instance_id}\n"
                f"**告警数量**: {len(alarms)}\n"
                f"**详情**:\n"
                + "\n".join(
                    f"- {a['metric']}: {a['value']} (阈值: {a['threshold']}, 级别: {a['level']})"
                    for a in alarms
                )
            )
        },
    })


@app.route("/webhook/alarm", methods=["POST"])
def alarm_webhook():
    """接收 TCOP 告警回调"""
    data = request.json
    instance_id = data.get("Dimensions", {}).get("InstanceId", "unknown")

    with LOCK:
        alarm_cache[instance_id].append({
            "MetricName": data.get("MetricName"),
            "CurrentValue": data.get("CurrentValue"),
            "Threshold": data.get("Threshold"),
            "Severity": data.get("Severity"),
            "ReceivedAt": time.time(),
        })

    threading.Timer(WINDOW_SECONDS, flush_alarms, args=[instance_id]).start()

    return jsonify({"status": "received"}), 200


def flush_alarms(instance_id):
    """刷新并发送合并告警"""
    with LOCK:
        alarms = alarm_cache.pop(instance_id, [])
    if alarms:
        send_merged_alarm(instance_id, alarms)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
```

### 13.6.5 告警升级机制

告警升级是告警收敛的补充。当一条告警在指定时间内未被确认时，应自动升级到更高一级的处理人：

```python
"""告警升级服务"""

import time
import threading

class AlarmEscalation:
    def __init__(self):
        self.alarms = {}  # alarm_id -> {level, created_at, acknowledged}
        self.escalation_rules = {
            "P0": {"timeout": 300, "escalate_to": "tech_manager"},
            "P1": {"timeout": 900, "escalate_to": "team_lead"},
            "P2": {"timeout": 1800, "escalate_to": "senior_engineer"},
        }

    def on_alarm_created(self, alarm_id, level):
        self.alarms[alarm_id] = {
            "level": level,
            "created_at": time.time(),
            "acknowledged": False,
        }
        rule = self.escalation_rules.get(level)
        if rule:
            threading.Timer(rule["timeout"], self.check_escalation, args=[alarm_id]).start()

    def acknowledge(self, alarm_id):
        if alarm_id in self.alarms:
            self.alarms[alarm_id]["acknowledged"] = True

    def check_escalation(self, alarm_id):
        alarm = self.alarms.get(alarm_id)
        if alarm and not alarm["acknowledged"]:
            rule = self.escalation_rules.get(alarm["level"])
            print(f"告警 {alarm_id} 未确认，升级到 {rule['escalate_to']}")
            # 发送升级通知
```

## 13.7 Dashboard 构建

### 13.7.1 默认 Dashboard

TCOP 为每个云产品提供预置 Dashboard，登录控制台后进入"云监控 → Dashboard"即可查看。默认 Dashboard 包含：

- CVM 概览：CPU、内存、网络、磁盘四维健康面板
- 负载均衡：连接数、请求量、延时分布
- 数据库：慢查询、连接数、QPS、磁盘空间

### 13.7.2 自定义 Dashboard

对于复杂的业务场景，需要创建自定义 Dashboard。推荐的设计思路：

**1. 按层级组织 Dashboard**

```
Dashboard: 生产环境总览
├── 行 1: 全局健康状态（各服务平均响应时间、错误率）
├── 行 2: 计算层（CVM CPU/内存/网络）
├── 行 3: 存储层（MySQL QPS/慢查询、Redis 命中率）
├── 行 4: 中间件（CKafka 积压、CLB 连接数）
└── 行 5: 业务指标（订单 QPS、支付成功率）
```

**2. 通过 tccli 管理 Dashboard**

```bash
# 创建 Dashboard
tccli monitor CreateDashboard \
  --DashboardName "生产环境总览" \
  --DashboardConfig '{
    "widgets": [
      {
        "title": "CPU 使用率 TOP 10",
        "type": "bar",
        "metrics": [
          {
            "namespace": "QCE/CVM",
            "metricName": "CPUUsage",
            "statistic": "Average",
            "period": 60
          }
        ],
        "width": 6,
        "height": 6
      },
      {
        "title": "网络流量",
        "type": "line",
        "metrics": [
          {
            "namespace": "QCE/CVM",
            "metricName": "LanOuttraffic",
            "statistic": "Average",
            "period": 60
          }
        ],
        "width": 6,
        "height": 6
      }
    ]
  }'
```

### 13.7.3 Dashboard 设计最佳实践

1. **每个 Dashboard 聚焦一个主题**：不要将不相关的指标混在一起
2. **合理设置时间范围**：默认展示最近 1 小时，但应提供 6h/24h/7d 快捷切换
3. **使用同比/环比**：在图表中叠加上周同期的数据，帮助判断异常
4. **添加阈值线**：在图表中标注告警阈值，直观显示是否接近告警
5. **共享 Dashboard**：通过 TCOP 的 Dashboard 分享功能，将关键看板分享给团队
6. **使用变量**：通过模板变量实现实例、地域的动态切换，避免为每个实例创建独立的 Dashboard

### 13.7.4 Dashboard 权限管理

TCOP Dashboard 支持细粒度的权限控制，可以通过访问管理（CAM）策略控制不同团队成员的访问范围：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": ["monitor:DescribeDashboard"],
      "resource": ["qcs::monitor::uin/10001:dashboard/prod-overview"]
    }
  ]
}
```

建议的权限划分：
- **只读权限**：授予全体开发人员，用于日常巡检
- **编辑权限**：授予 SRE 团队，用于维护 Dashboard 配置
- **管理权限**：授予监控负责人，用于创建和删除 Dashboard

## 13.8 Grafana 集成

### 13.8.1 概述

对于已经使用 Grafana 的团队，TCOP 提供两种集成方式：

1. **TCOP Grafana 数据源插件**：直接查询 TCOP 中的指标数据
2. **Prometheus 数据源**：通过 TMP 的 Prometheus 接口接入

### 13.8.2 安装 TCOP 数据源插件

```bash
# 在 Grafana 插件目录中安装 TCOP 数据源
grafana-cli plugins install tencentcloud-monitor-app

# 重启 Grafana
systemctl restart grafana-server
```

### 13.8.3 配置 TCOP 数据源

在 Grafana 中进入 Configuration → Data Sources → Add data source，选择 "Tencent Cloud Monitor"：

- **SecretId / SecretKey**：腾讯云 API 密钥
- **Region**：默认地域
- **监控类型**：支持云产品监控和自定义监控

### 13.8.4 通过 Prometheus 数据源接入 TMP

如果已安装 Prometheus 数据源，可以直接配置 TMP 作为 Prometheus 数据源：

```
URL: https://<tmp-instance-id>.ap-guangzhou.monitor.tencent.com/api/v1/prometheus
Access: Server (default)
Auth: Basic Auth
User: <your-secret-id>
Password: <your-secret-key>
```

### 13.8.5 导入预置 Dashboard

TCOP 提供官方 Dashboard 模板，可以通过 Grafana 的 Import 功能导入：

```json
{
  "dashboard": {
    "title": "TCOP CVM 监控",
    "panels": [
      {
        "title": "CPU 使用率",
        "type": "graph",
        "datasource": "Tencent Cloud Monitor",
        "targets": [
          {
            "namespace": "QCE/CVM",
            "metricName": "CPUUsage",
            "statistic": "Average",
            "period": 60,
            "instances": ["ins-xxxxxxx"]
          }
        ]
      },
      {
        "title": "内存使用率",
        "type": "graph",
        "datasource": "Tencent Cloud Monitor",
        "targets": [
          {
            "namespace": "QCE/CVM",
            "metricName": "MemUsage",
            "statistic": "Average",
            "period": 60,
            "instances": ["ins-xxxxxxx"]
          }
        ]
      }
    ]
  }
}
```

### 13.8.6 Grafana 告警与 TCOP 告警联动

对于已经在 Grafana 中配置了告警规则的团队，可以通过 Webhook 将 Grafana 告警转发到 TCOP，实现统一的告警管理：

```python
#!/usr/bin/env python3
"""Grafana Webhook 转发到 TCOP 告警"""

from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

TCOP_WEBHOOK_URL = "https://api.monitor.tencent.com/v3/alarm/notice"


@app.route("/grafana/webhook", methods=["POST"])
def grafana_webhook():
    """接收 Grafana 告警并转发到 TCOP"""
    data = request.json

    tcop_alarm = {
        "PolicyName": data.get("ruleName", "grafana-rule"),
        "MetricName": data.get("metric", "unknown"),
        "CurrentValue": data.get("value", 0),
        "Threshold": data.get("condition", {}).get("threshold", 0),
        "Severity": data.get("state", "alerting"),
        "Dimensions": {
            "InstanceId": data.get("labels", {}).get("instance", "unknown"),
        },
        "Message": data.get("message", ""),
    }

    headers = {"Content-Type": "application/json"}
    resp = requests.post(TCOP_WEBHOOK_URL, json=tcop_alarm, headers=headers)

    return jsonify({"status": "forwarded", "tcop_response": resp.status_code})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
```

### 13.8.7 Grafana 告警通知模板

在 Grafana 中配置告警通知模板，可以使告警消息包含更丰富的上下文信息：

```yaml
# Grafana alert notification template (contact point)
apiVersion: 1
contactPoints:
  - orgId: 1
    name: TCOP Webhook
    receivers:
      - uid: tcop-webhook
        type: webhook
        settings:
          url: http://your-server:5000/grafana/webhook
          httpMethod: POST
        disableResolveMessage: false
```

## 13.9 实战案例：构建完整的监控体系

### 13.9.1 需求分析

假设我们管理一个电商平台，部署在腾讯云上，架构如下：

- 前端：CLB + CVM（Web 集群，10 台）
- 后端：CVM（微服务集群，20 台）
- 数据库：MySQL（主从）+ Redis（缓存）
- 消息队列：CKafka
- 对象存储：COS

### 13.9.2 监控体系设计

**第一层：基础设施监控**

| 监控对象 | 指标 | 告警阈值 | 级别 |
|----------|------|----------|------|
| CVM CPU | CPUUsage | > 85% 持续 5 分钟 | P1 |
| CVM 内存 | MemUsage | > 90% 持续 5 分钟 | P1 |
| CVM 磁盘 | DiskUsage | > 85% | P0 |
| CVM 网络 | 丢包率 | > 1% | P1 |
| MySQL | ThreadsRunning | > 200 | P1 |
| MySQL | SlowQueries | > 10/min | P1 |
| Redis | Connections | > 5000 | P1 |
| CLB | 5xx 率 | > 1% | P0 |

**第二层：业务指标监控**

| 指标 | 采集方式 | 告警阈值 | 级别 |
|------|----------|----------|------|
| 订单 QPS | 自定义指标 | 低于基线 50% | P0 |
| 支付成功率 | 自定义指标 | < 99% | P0 |
| 下单响应时间 | 自定义指标 | P99 > 2s | P1 |
| 队列积压 | CKafka 指标 | > 10000 | P1 |

**第三层：可用性监控**

- 通过云拨测（CAT）模拟用户请求，监控各接口可用性
- 每 5 分钟探测一次，连续 3 次失败触发 P0 告警

### 13.9.3 一键部署脚本

```python
#!/usr/bin/env python3
"""一键部署电商平台监控体系"""

import json
import sys
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.monitor.v20180724 import monitor_client, models

SECRET_ID = "your-secret-id"
SECRET_KEY = "your-secret-key"
REGION = "ap-guangzhou"
NOTICE_ID_P0 = "notice-p0-xxxx"
NOTICE_ID_P1 = "notice-p1-xxxx"
NOTICE_ID_P2 = "notice-p2-xxxx"


class MonitorDeployer:
    """监控体系部署器"""

    def __init__(self):
        self.cred = credential.Credential(SECRET_ID, SECRET_KEY)
        self.client = monitor_client.MonitorClient(self.cred, REGION)
        self.results = []

    def create_policy(self, name, namespace, metric, threshold, operator,
                      period=60, evaluate_period=5, continue_period=3,
                      statistic="Average", severity="warning", notice_id=None):
        """创建告警策略"""
        try:
            req = models.CreateAlarmPolicyRequest()
            req.PolicyName = name
            req.MonitorType = "MT_QCE"
            req.Namespace = namespace
            req.Enable = 1
            req.ProjectId = 0
            req.NoticeIds = [notice_id or NOTICE_ID_P1]

            condition = models.AlarmPolicyCondition()
            condition.MetricName = metric
            condition.Period = period
            condition.EvaluatePeriod = evaluate_period
            condition.Statistic = statistic
            condition.Threshold = str(threshold)
            condition.Operator = operator
            condition.ContinuePeriod = continue_period
            req.Conditions = condition

            req.PolicyTag = [
                {"Key": "severity", "Value": severity},
                {"Key": "service", "Value": name.split("-")[0].lower()},
            ]

            resp = self.client.CreateAlarmPolicy(req)
            policy_id = json.loads(resp.to_json_string()).get("PolicyId")
            self.results.append({"name": name, "policy_id": policy_id, "status": "success"})
            print(f"  ✓ {name} → {policy_id}")
            return policy_id

        except TencentCloudSDKException as err:
            self.results.append({"name": name, "error": str(err), "status": "failed"})
            print(f"  ✗ {name} → {err}")
            return None

    def deploy(self):
        """执行部署"""
        print("=" * 60)
        print("开始部署监控体系...")
        print("=" * 60)

        print("\n[基础设施监控]")
        self.create_policy("CVM-CPU-高", "QCE/CVM", "CPUUsage", 85, "gt",
                           severity="warning", notice_id=NOTICE_ID_P1)
        self.create_policy("CVM-内存-高", "QCE/CVM", "MemUsage", 90, "gt",
                           severity="warning", notice_id=NOTICE_ID_P1)
        self.create_policy("CVM-磁盘-满", "QCE/CVM", "DiskUsage", 85, "gt",
                           severity="critical", notice_id=NOTICE_ID_P0)
        self.create_policy("CVM-网络-丢包", "QCE/CVM", "PacketDropRate", 1, "gt",
                           severity="warning", notice_id=NOTICE_ID_P1)

        print("\n[数据库监控]")
        self.create_policy("MySQL-连接数-高", "QCE/CDB", "ThreadsRunning", 200, "gt",
                           severity="warning", notice_id=NOTICE_ID_P1)
        self.create_policy("MySQL-慢查询-多", "QCE/CDB", "SlowQueries", 10, "gt",
                           severity="warning", notice_id=NOTICE_ID_P1)
        self.create_policy("Redis-连接数-高", "QCE/REDIS", "Connections", 5000, "gt",
                           severity="warning", notice_id=NOTICE_ID_P1)

        print("\n[负载均衡监控]")
        self.create_policy("CLB-5xx-率高", "QCE/LB", "Http5xx", 1, "gt",
                           severity="critical", notice_id=NOTICE_ID_P0)

        print("\n" + "=" * 60)
        success = sum(1 for r in self.results if r["status"] == "success")
        failed = sum(1 for r in self.results if r["status"] == "failed")
        print(f"部署完成: {success} 成功, {failed} 失败")
        print("=" * 60)

        return self.results


if __name__ == "__main__":
    deployer = MonitorDeployer()
    deployer.deploy()
```

### 13.9.4 多地域监控架构

对于部署在多个地域的电商平台，需要设计跨地域的监控架构。TCOP 支持通过全局视图查看所有地域的监控数据，但需要注意以下设计要点：

**数据聚合策略**：每个地域的指标数据独立存储，全局视图通过 API 聚合展示。建议为每个地域创建独立的 Dashboard，再创建一个全局汇总 Dashboard 展示跨地域的对比数据。

**告警策略复制**：同一套告警策略需要复制到每个地域。可以通过 Python 脚本遍历地域列表批量创建：

```python
REGIONS = ["ap-guangzhou", "ap-shanghai", "ap-beijing", "ap-singapore"]

def deploy_policies_across_regions():
    for region in REGIONS:
        print(f"部署地域: {region}")
        deployer = MonitorDeployer(region=region)
        deployer.deploy()
```

**跨地域告警聚合**：对于全局性故障（如 CDN 回源异常），需要将多个地域的告警聚合为一条全局告警，避免每个地域独立告警造成告警风暴。

### 13.9.5 监控体系验证

部署完成后，需要进行验证以确保监控体系正常工作：

```python
"""监控体系验证脚本"""

def verify_monitoring():
    checks = []

    # 验证 1：告警策略是否存在
    resp = tccli monitor DescribeAlarmPolicies()
    policy_count = len(resp["Response"]["Policies"])
    checks.append(("告警策略数量", policy_count >= 8, f"期望 >= 8, 实际 {policy_count}"))

    # 验证 2：自定义指标是否可查询
    resp = tccli monitor GetMonitorData(
        Namespace="QCE/CUSTOM",
        MetricName="OrderQPS",
        Period=60,
    )
    has_data = len(resp["Response"]["DataPoints"][0]["Values"]) > 0
    checks.append(("自定义指标数据", has_data, "期望有数据点"))

    # 验证 3：TMP 实例是否正常
    resp = tccli monitor DescribePrometheusInstances()
    tmp_status = resp["Response"]["InstanceSet"][0]["InstanceStatus"]
    checks.append(("TMP 实例状态", tmp_status == 2, f"期望 2(正常), 实际 {tmp_status}"))

    # 输出结果
    for name, passed, detail in checks:
        status = "✓" if passed else "✗"
        print(f"{status} {name}: {detail}")

verify_monitoring()
```

## 13.10 监控体系运营最佳实践

### 13.10.1 告警治理

告警治理是一个持续优化的过程，建议每季度进行一次告警治理评审：

1. **告警有效性统计**：统计每条告警策略的触发次数、确认率、误报率
2. **清理无效告警**：对于连续 30 天未触发或确认率低于 50% 的告警，考虑删除或降级
3. **调整阈值**：根据业务周期变化，动态调整告警阈值
4. **告警去重**：检查是否存在多条告警策略覆盖同一故障场景，保留最有效的一条

### 13.10.2 监控覆盖度检查

使用以下清单定期检查监控覆盖度：

- [ ] 所有 CVM 是否已接入基础监控
- [ ] 所有关键端口是否已配置存活探测
- [ ] 所有核心业务接口是否已配置自定义指标
- [ ] 所有数据库实例是否已配置慢查询告警
- [ ] 所有 CLB 是否已配置后端健康检查告警
- [ ] 所有定时任务是否已配置执行失败告警
- [ ] 证书过期是否已配置提前告警（建议提前 30 天）
- [ ] 所有云产品是否已配置资源使用率告警（如 COS 存储量、CDN 带宽）

### 13.10.3 告警响应 SLA

| 级别 | 响应时间 | 确认方式 | 升级机制 |
|------|----------|----------|----------|
| P0 | 5 分钟 | 电话确认 | 5 分钟未确认 → 升级到技术经理 |
| P1 | 15 分钟 | 企微确认 | 15 分钟未确认 → 升级到值班组长 |
| P2 | 30 分钟 | 企微确认 | 30 分钟未确认 → 升级到值班工程师 |

### 13.10.4 故障复盘与监控改进

每次故障后，应回答以下问题：

1. 故障是否被监控系统第一时间发现？如果没有，缺少什么指标？
2. 告警是否及时通知到了正确的人？如果没有，通知链路有什么问题？
3. 告警信息是否足够定位问题？如果没有，需要补充什么上下文？
4. 是否存在同类风险的其他实例？是否需要扩大监控范围？

### 13.10.5 告警值班轮转

建立告警值班轮转机制，确保告警始终有人处理：

```python
"""告警值班排班系统"""

import datetime
import itertools

class OnCallSchedule:
    def __init__(self, engineers):
        self.engineers = engineers

    def generate_schedule(self, start_date, weeks=4):
        """生成轮转排班表"""
        schedule = {}
        current = start_date
        for i in range(weeks * 7):
            engineer = self.engineers[i % len(self.engineers)]
            schedule[current.strftime("%Y-%m-%d")] = engineer
            current += datetime.timedelta(days=1)
        return schedule

    def get_current_oncall(self):
        """获取当前值班人"""
        today = datetime.date.today().strftime("%Y-%m-%d")
        schedule = self.generate_schedule(datetime.date.today())
        return schedule.get(today, "未排班")

# 使用示例
team = OnCallSchedule(["张三", "李四", "王五", "赵六"])
print(f"今日值班: {team.get_current_oncall()}")
```

### 13.10.6 告警通知模板设计

告警通知模板直接影响值班 SRE 的响应效率。一个好的告警模板应该让接收者在 10 秒内理解问题并知道如何行动。推荐模板格式：

```
[级别] [产品] [指标] 异常 - [实例信息]

当前值: [value] (阈值: [threshold])
时间: [timestamp]
实例: [instance_id] ([instance_name])
建议操作:
1. 登录服务器检查进程状态: systemctl status [service]
2. 查看最近日志: journalctl -u [service] --since "5 min ago"
3. 如果无法恢复，联系: [oncall_engineer]
```

在 TCOP 中可以通过通知模板的自定义变量实现上述格式。模板变量包括 `${metricName}`、`${currentValue}`、`${threshold}`、`${instanceId}`、`${alarmTime}` 等。

### 13.10.7 监控成本控制

TCOP 的计费与指标数量和存储时长相关，合理控制监控成本也是 SRE 的职责之一：

1. **指标降采样**：对于不需要高精度的指标，使用更长的采集周期
2. **指标过滤**：在 Prometheus Remote Write 中过滤掉不必要的指标
3. **存储周期**：根据业务需求设置合理的存储周期，不需要长期保留的指标缩短保留时间
4. **定期清理**：删除不再使用的告警策略和 Dashboard，避免产生不必要的存储费用

## 13.11 事件监控与云拨测

### 13.11.1 事件监控

除了指标监控，TCOP 还提供事件监控能力，用于捕获云资源的状态变更事件。事件与指标的区别在于：指标是连续数值型数据（如 CPU 使用率），事件是离散的状态变更记录（如实例重启、磁盘挂载）。

TCOP 事件监控支持以下事件类型：

- **云产品事件**：实例创建/销毁、磁盘挂载/卸载、EIP 绑定/解绑、安全组规则变更
- **运维事件**：宿主机维护、网络设备升级、磁盘故障迁移
- **健康事件**：底层硬件故障通知、宿主机宕机预告

通过 tccli 查询事件：

```bash
# 查询最近 24 小时的事件
tccli monitor DescribeAlarmEvents \
  --Module "monitor" \
  --StartTime "$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%S+08:00')" \
  --EndTime "$(date -u '+%Y-%m-%dT%H:%M:%S+08:00')" \
  --Order "DESC" \
  --Limit 50
```

事件监控的最佳实践是将关键事件（如实例重启、磁盘故障）配置为 P0 告警，因为这些事件通常意味着底层基础设施出现问题，需要立即介入。

### 13.11.2 云拨测（CAT）

云拨测（Cloud Automated Testing，CAT）是 TCOP 提供的主动探测服务，通过分布在全国甚至全球的探测节点，模拟真实用户请求来监控服务的可用性和性能。

云拨测的核心能力：

1. **HTTP/HTTPS 探测**：监控 Web 页面的可用性、响应时间、状态码
2. **Ping 探测**：监控网络延迟和丢包率
3. **DNS 探测**：监控域名解析的正确性和耗时
4. **TCP/UDP 探测**：监控端口可达性
5. **全链路拨测**：模拟用户从登录到下单的完整业务流程

通过 tccli 创建拨测任务：

```bash
# 创建 HTTP 拨测任务
tccli cat CreateProbeTask \
  --Name "首页可用性探测" \
  --TaskType "HTTP" \
  --TargetAddress "https://www.example.com" \
  --Period 300 \
  --Nodes '["node-beijing", "node-shanghai", "node-guangzhou"]' \
  --Parameters '{"method":"GET","timeout":10}'
```

云拨测与 TCOP 告警联动：当拨测任务连续失败达到阈值时，自动触发 P0 告警，通知值班 SRE 介入排查。这是发现 CDN 故障、DNS 解析异常、后端服务不可用等问题的第一道防线。

## 13.12 日志监控与 CMQ 告警

### 13.12.1 基于日志的指标提取

TCOP 的日志服务（CLS）支持从日志中提取指标并关联告警。这对于无法直接修改业务代码来上报自定义指标的场景尤为有用。

配置流程：
1. 在 CLS 中采集业务日志
2. 使用日志的键值对提取功能，将日志中的数值字段提取为指标
3. 在 TCOP 中为提取的指标配置告警策略

例如，从 Nginx 访问日志中提取响应时间指标：

```
# CLS 日志提取规则示例
提取字段: $request_time
指标名称: nginx_request_time
聚合方式: avg, p99, max
```

### 13.12.2 告警自愈与自动化运维

告警自愈是 SRE 追求的终极目标之一。TCOP 支持通过告警触发自动化运维操作，实现"告警即处理"的闭环。TCOP 的告警自愈能力通过以下方式实现：

**触发腾讯云自动化助手（TAT）**：当告警触发时，自动在目标 CVM 上执行预定义的脚本。例如，当磁盘使用率超过 85% 时，自动执行清理临时文件的脚本。

```bash
# 创建告警触发任务
tccli monitor CreateAlarmPolicy \
  --PolicyName "磁盘自动清理" \
  --TriggerTasks '[{
    "Type": "TAT",
    "TaskConfig": {
      "CommandId": "cmd-xxxxxxx",
      "Parameters": "{\"cleanup_path\":\"/tmp\",\"days\":7}"
    }
  }]'
```

**触发 SCF 云函数**：对于更复杂的自愈逻辑，可以触发云函数执行。例如，当 CLB 后端健康实例数低于阈值时，自动调用云函数扩容。

**触发 AS 伸缩组**：当 CPU 使用率持续超过阈值时，自动触发弹性伸缩组扩容，实现计算资源的动态调整。

### 13.12.3 CMQ 告警通知

对于需要高可靠告通知的场景，TCOP 支持通过消息队列 CMQ（Cloud Message Queue）发送告警。CMQ 模式相比 Webhook 的优势在于：消息队列具有持久化存储和重试机制，不会因为接收端故障而丢失告警。

```bash
# 配置 CMQ 告警通知
tccli monitor CreateAlarmNotice \
  --Name "CMQ-告警通知" \
  --NoticeType "ALL" \
  --CmqNotice '{
    "Region": "ap-guangzhou",
    "TopicName": "alarm-topic",
    "SecretId": "your-secret-id",
    "SecretKey": "your-secret-key"
  }'
```

### 13.12.4 告警数据驱动决策

告警数据不仅是故障处理工具，更是容量规划和架构优化的数据来源。建议 SRE 团队定期分析告警数据，从中发现系统瓶颈和架构缺陷：

- **容量规划**：分析 CPU、内存、磁盘使用率的长期趋势，预测资源耗尽时间点，提前扩容
- **架构优化**：如果某个模块频繁触发告警，说明该模块存在设计缺陷，需要重构或拆分
- **成本优化**：如果某些实例长期处于低负载状态，考虑降配或合并，降低云资源成本

通过将告警数据与成本数据、业务数据关联分析，SRE 团队可以从被动救火转向主动优化，真正实现数据驱动的运维管理。

## 13.13 小结

本章详细介绍了腾讯云可观测平台（TCOP）的核心功能与实战技巧。从基础监控指标的采集与查询，到自定义指标的上报；从 Prometheus 兼容模式的接入，到告警策略的精细化设计；从告警收敛与抑制的最佳实践，到 Dashboard 和 Grafana 的可视化集成，覆盖了 SRE 在云上构建监控体系的完整链路。

核心要点回顾：

1. **基础监控**：TCOP 自动采集 CVM 等云产品的 CPU、内存、网络、磁盘指标，通过 tccli 可批量查询
2. **自定义监控**：通过 `PutMonitorData` API 上报业务指标，与平台原生指标统一管理
3. **Prometheus 兼容**：TMP 提供标准 Remote Write 和 PromQL 查询接口，复用 Prometheus 生态
4. **告警策略**：分层设计（P0/P1/P2），合理设置持续周期和静默期，避免告警风暴
5. **告警收敛**：利用标签分组、告警屏蔽、静默期三种机制，减少重复告警
6. **可视化**：TCOP Dashboard 和 Grafana 双轨并行，满足不同团队的看板需求
7. **运营治理**：定期进行告警有效性评审、监控覆盖度检查、故障复盘，持续优化监控体系

监控体系的建设不是一次性工作，而是一个持续迭代的过程。建议 SRE 团队建立监控治理的定期评审机制，不断优化告警质量、提升监控覆盖度，最终实现"发现快、定位准、通知到"的监控目标。在云原生时代，好的监控体系不仅是故障发现工具，更是系统稳定性的基石和团队信心的来源。
