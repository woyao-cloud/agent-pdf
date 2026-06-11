# 第8章 实验：高可用与长期存储

## 实验目的

1. 理解联邦集群架构
2. 部署 Thanos（Sidecar + MinIO + Store + Query）
3. 部署 VictoriaMetrics 作为 Prometheus 远程存储
4. 对比两种方案的查询和存储效果

## 两套实验环境

本实验提供两套独立的 Docker Compose 环境：

### 方案 A：Thanos

Thanos 展示"全局查询视图"和"对象存储长期保存"。

```bash
cd thanos
docker compose up -d
```

| 服务 | 端口 | 说明 |
|------|------|------|
| Prometheus 1 | :9098 | 模拟 us-east 区域数据 |
| Prometheus 2 | :9099 | 模拟 eu-west 区域数据 |
| MinIO | :9000 (API), :9001 (Console) | S3 兼容对象存储 |
| Thanos Sidecar 1/2 | — | 上传 Block 到 MinIO |
| Thanos Store Gateway | — | 从 MinIO 读取历史数据 |
| Thanos Query | :10902 | 全局聚合查询 |
| Grafana | :3008 | 可视化 |

**实验步骤：**

1. 启动 Thanos 环境
2. 等待 5 分钟生成数据，Sidecar 将 Block 上传到 MinIO
3. 验证 MinIO 中存在数据：http://localhost:9001（admin/admin）
4. 运行查询对比脚本：`bash thanos/scripts/query-compare.sh`
5. 在 Grafana 中添加 Thanos Query 数据源：http://thanos-query:10902
6. 查询 `up` 指标，看到来自两个 region 的数据合并展示

### 方案 B：VictoriaMetrics

VM 展示"远程写入 + 高压缩率"。

```bash
cd victoriametrics
docker compose up -d
```

| 服务 | 端口 | 说明 |
|------|------|------|
| Prometheus (source) | :9100 | 数据源，配置 remote_write 到 VM |
| VictoriaMetrics | :8428 | 长期存储后端 |
| Grafana | :3009 | 可视化（数据源指向 VM） |

**实验步骤：**

1. 启动 VM 环境
2. 等待数据生成，Prometheus 通过 Remote Write 发送数据
3. 直接查询 VM：`curl -s http://localhost:8428/api/v1/query?query=up`
4. 在 Grafana 中添加 VM 数据源：http://victoriametrics:8428
5. 运行存储对比脚本：`bash victoriametrics/scripts/storage-check.sh`
6. 停止 Prometheus 源实例，VM 中的数据依然可查——证明数据已持久化

## 核心观察

1. **Thanos Query** 可以跨多个 Prometheus 实例做全局聚合查询
2. **Thanos Sidecar** 自动将 Block 上传到对象存储，实现长期保存
3. **VictoriaMetrics** 通过 Remote Write 接收数据，压缩率更高
4. 两种方案都能解决"Prometheus 单机最多存 15 天"的瓶颈

## Grafana 数据源配置

| 环境 | URL |
|------|-----|
| Thanos Query | http://thanos-query:10902 |
| VictoriaMetrics | http://victoriametrics:8428 |

## 清理

```bash
# Thanos
cd thanos && docker compose down -v

# VM
cd victoriametrics && docker compose down -v
```