# 第8章 突破单机瓶颈：高可用与长期存储架构

## 8.1 联邦集群（Federation）

### 架构模型

联邦集群是 Prometheus 原生支持的跨实例聚合方案。核心思想是：**全局 Prometheus 实例从边缘 Prometheus 实例的 `/federate` 端点拉取聚合数据**。

```
┌──────────────┐    ┌──────────────┐
│ Prometheus   │    │ Prometheus   │
│ 边缘节点 A   │    │ 边缘节点 B   │
│ (详细数据)   │    │ (详细数据)   │
└──────┬───────┘    └──────┬───────┘
       │                   │
       │ /federate         │ /federate
       ▼                   ▼
┌──────────────────────────────┐
│ Prometheus 全局节点           │
│ (聚合数据，仅保留聚合指标)    │
└──────────────────────────────┘
```

### 配置方式

全局节点的 scrape 配置使用 `honor_labels` 和 `params` 参数：

```yaml
scrape_configs:
  - job_name: 'federate-cluster-a'
    honor_labels: true
    params:
      match[]:
        - '{__name__=~"job:.*|node:.*|instance:.*"}'
    static_configs:
      - targets: ['prometheus-a:9090']
    metrics_path: /federate
```

### 适用场景

联邦集群适合**多机房**或**多集群**的场景，但不适合解决长期存储问题。全局节点只能存储聚合数据，丢失了细节。

## 8.2 Thanos 架构

### 核心组件

| 组件 | 作用 |
|------|------|
| **Sidecar** | 附加在 Prometheus 旁，将 Block 上传到对象存储，提供 Store API |
| **Store Gateway** | 从对象存储读取历史数据，提供 Store API |
| **Query** | 全局聚合查询，同时查询 Sidecar 和 Store，提供 Prometheus API |
| **Compactor** | 下采样和压缩对象存储中的 Block |

### 工作流程

1. Prometheus 正常 scrape 数据，生成 Block
2. Sidecar 自动将已落盘的 Block 上传到对象存储（S3/MinIO/GCS）
3. Store Gateway 从对象存储读取历史 Block，对外提供查询接口
4. Query 层同时查询 Sidecar（最新数据）和 Store Gateway（历史数据）
5. Compactor 定期合并对象存储中的小 Block，并进行下采样

### 关键配置

Sidecar：
```bash
thanos sidecar \
  --tsdb.path=/prometheus \
  --objstore.config-file=s3.yml \
  --prometheus.url=http://localhost:9090
```

Query：
```bash
thanos query \
  --store=store-gateway:10901 \
  --store=prometheus-sidecar-1:10902 \
  --store=prometheus-sidecar-2:10902
```

### 完整 Docker Compose 部署

```yaml
# docker-compose-thanos.yml
version: '3.8'
services:
  # Prometheus + Sidecar
  prometheus-us:
    image: prom/prometheus:v2.48.0
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=15d
      # 必须启用 Admin API 供 Sidecar 读取
      - --web.enable-admin-api
    volumes:
      - prometheus-us-data:/prometheus

  thanos-sidecar-us:
    image: quay.io/thanos/thanos:v0.33.0
    command:
      - sidecar
      - --tsdb.path=/prometheus
      - --objstore.config-file=/etc/thanos/objstore.yml
      - --prometheus.url=http://prometheus-us:9090
      - --http-address=0.0.0.0:10902
      - --grpc-address=0.0.0.0:10901
    volumes:
      - prometheus-us-data:/prometheus
      - ./objstore.yml:/etc/thanos/objstore.yml
    depends_on:
      - prometheus-us

  # 另一个集群
  prometheus-eu:
    image: prom/prometheus:v2.48.0
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=15d
      - --web.enable-admin-api
    volumes:
      - prometheus-eu-data:/prometheus

  thanos-sidecar-eu:
    image: quay.io/thanos/thanos:v0.33.0
    command:
      - sidecar
      - --tsdb.path=/prometheus
      - --objstore.config-file=/etc/thanos/objstore.yml
      - --prometheus.url=http://prometheus-eu:9090
      - --http-address=0.0.0.0:10902
      - --grpc-address=0.0.0.0:10901
    volumes:
      - prometheus-eu-data:/prometheus
      - ./objstore.yml:/etc/thanos/objstore.yml
    depends_on:
      - prometheus-eu

  # Store Gateway（从对象存储读取历史数据）
  thanos-store:
    image: quay.io/thanos/thanos:v0.33.0
    command:
      - store
      - --data-dir=/data
      - --objstore.config-file=/etc/thanos/objstore.yml
      - --http-address=0.0.0.0:10906
      - --grpc-address=0.0.0.0:10907
    volumes:
      - thanos-store-data:/data
      - ./objstore.yml:/etc/thanos/objstore.yml

  # Query（全局聚合查询）
  thanos-query:
    image: quay.io/thanos/thanos:v0.33.0
    command:
      - query
      - --store=thanos-sidecar-us:10901
      - --store=thanos-sidecar-eu:10901
      - --store=thanos-store:10907
      - --http-address=0.0.0.0:9090
      - --query.replica-label=replica
    ports:
      - "9090:9090"

  # Compactor（下采样和压缩）
  thanos-compactor:
    image: quay.io/thanos/thanos:v0.33.0
    command:
      - compact
      - --data-dir=/data
      - --objstore.config-file=/etc/thanos/objstore.yml
      - --http-address=0.0.0.0:10910
      - --retention.resolution-5m=30d
      - --retention.resolution-1h=90d
    volumes:
      - thanos-compactor-data:/data
      - ./objstore.yml:/etc/thanos/objstore.yml

volumes:
  prometheus-us-data:
  prometheus-eu-data:
  thanos-store-data:
  thanos-compactor-data:
```

### 下采样策略

Thanos Compactor 支持三档数据精度，显著降低历史数据的存储和查询成本：

| 精度 | 数据点间隔 | 保留时间 | 存储占比 |
|:----:|:---------:|:--------:|:--------:|
| 原始 | 15s（取决于 scrape_interval） | 永久 | 100% |
| 5m 下采样 | 每 5 分钟一个点 | 30 天 | ~5% |
| 1h 下采样 | 每 1 小时一个点 | 90 天 | ~0.4% |

```bash
# 查看下采样状态
thanos tools bucket inspect --objstore.config-file=objstore.yml

# 手动触发压缩
thanos compact --data-dir=/data --objstore.config-file=objstore.yml
```

### 对象存储配置

```yaml
# objstore.yml
type: S3
config:
  bucket: thanos-metrics
  endpoint: s3.amazonaws.com
  region: us-east-1
  access_key: ${AWS_ACCESS_KEY}
  secret_key: ${AWS_SECRET_KEY}
  # 可选：使用 MinIO（自建对象存储）
  # endpoint: minio:9000
  # insecure: true
```

Grafana 接入 Thanos Query：

```
数据源类型: Prometheus
URL: http://thanos-query:9090
Access: proxy
```

## 8.3 VictoriaMetrics

### 单节点模式

VictoriaMetrics 单节点模式兼容 Prometheus 的 Remote Write 协议，可以作为 Prometheus 的长期存储后端。

**配置方式**：在 Prometheus 中添加 remote_write 配置：

```yaml
remote_write:
  - url: http://victoriametrics:8428/api/v1/write
```

**查询方式**：Grafana 使用 VictoriaMetrics 作为 Prometheus 数据源：
```
URL: http://victoriametrics:8428
```

### Docker Compose 部署

```yaml
# docker-compose-vm.yml
version: '3.8'
services:
  victoriametrics:
    image: victoriametrics/victoriaMetrics:v1.95.0
    command:
      - -storageDataPath=/storage
      - -httpListenAddr=:8428
      - -retentionPeriod=90d        # 保留 90 天
      - -search.maxQueryDuration=1m
    ports:
      - "8428:8428"
    volumes:
      - vm-data:/storage
    restart: always

  # 使用 vmagent 替代 Prometheus 抓取（推荐）
  vmagent:
    image: victoriametrics/vmagent:v1.95.0
    command:
      - -remoteWrite.url=http://victoriametrics:8428/api/v1/write
      - -promscrape.config=/etc/vmagent/scrape.yml
    volumes:
      - ./scrape.yml:/etc/vmagent/scrape.yml
    restart: always

volumes:
  vm-data:
```

### 优势

- **更高的压缩率**：VictoriaMetrics 的磁盘占用通常只有 Prometheus TSDB 的 1/3 到 1/5
- **更低的内存占用**：同样的数据量，VM 内存占用更低
- **更快的查询速度**：特别是大时间范围的聚合查询

### VictoriaMetrics 特有功能

**MetricsQL**：VM 对 PromQL 的增强版本，支持更简洁的语法：

```promql
# 同环比（一行搞定）
rate(http_requests_total[5m]) - rate(http_requests_total[5m] offset 1w)

# 默认值填充（避免图表空洞）
avg_over_time(probe_success[5m]) default 0

# 自动分桶
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
# VM 还支持 share 函数查看占比
share_gt(http_request_duration_seconds, 1)  # 耗时 > 1s 的请求占比
```

## 8.4 架构选型指南

| 规模 | 推荐方案 | 理由 |
|------|---------|------|
| 小型（<10 主机） | Prometheus + 长 retention | 简单，不需要额外组件 |
| 中型（<100 主机） | VictoriaMetrics 单节点 | 高压缩率，运维简单 |
| 大型（>100 主机） | Thanos | 全球查询视图，对象存储低成本 |
| 跨集群 | Thanos + 联邦 | 跨集群聚合 + 长期存储 |

## 本章小结

- 联邦集群适合多机房场景，但不解决长期存储
- Thanos 通过 Sidecar + 对象存储 + Query 实现全局视图和长期存储
- VictoriaMetrics 以更高的压缩率和更简单的部署实现长期存储
- 选型取决于规模：小→Prometheus，中→VM，大→Thanos
- 实践：[高可用存储实验](../labs/ch08-ha-storage/README.md)