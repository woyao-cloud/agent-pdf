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

### 优势

- **更高的压缩率**：VictoriaMetrics 的磁盘占用通常只有 Prometheus TSDB 的 1/3 到 1/5
- **更低的内存占用**：同样的数据量，VM 内存占用更低
- **更快的查询速度**：特别是大时间范围的聚合查询

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