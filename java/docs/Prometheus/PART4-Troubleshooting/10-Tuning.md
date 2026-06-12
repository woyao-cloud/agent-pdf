# 第10章 核心参数与内核调优

## 10.1 GOGC 环境变量调优

### 原理

Go 语言的 GC 触发阈值为：`GOGC` 百分比。默认 `GOGC=100` 表示当堆内存增长 100% 时触发 GC。

- **GOGC=100**（默认）：总内存 = 2 × 活跃内存，GC 频繁但内存占用低
- **GOGC=400**：总内存 = 5 × 活跃内存，GC 次数减少 75%，但内存占用更高

### 对 Prometheus 的影响

Prometheus 是内存密集型应用。在高基数场景下，TSDB 的 Head Block 和 Posting List 占用了大量内存。频繁的 GC 会导致：

1. **CPU 浪费**：GC 本身消耗 CPU，高并发 scrape 场景下 GC 占比可达 20-30%
2. **STW 延迟**：GC 停顿导致 scrape 超时
3. **内存碎片**：频繁 GC 导致内存碎片化

### 调优建议

```bash
# 生产环境推荐（内存充足的机器）
GOGC=400 prometheus --config.file=prometheus.yml

# 内存紧张的环境保持默认
GOGC=100 prometheus --config.file=prometheus.yml

# 极端场景（仅当内存 >= 64GB）
GOGC=800 prometheus --config.file=prometheus.yml
```

### 对比实验

| 场景 | GOGC=100 | GOGC=400 | 差异 |
|------|----------|----------|------|
| GC 次数/分钟 | ~60 | ~15 | ↓ 75% |
| 堆内存 | ~2GB | ~4GB | ↑ 100% |
| CPU 占用 | ~30% | ~20% | ↓ 33% |
| scrape 超时率 | 0.5% | 0.1% | ↓ 80% |

## 10.2 并发抓取调优

### 关键参数

| 参数 | 默认值 | 说明 | 推荐值 |
|------|--------|------|--------|
| `--query.max-concurrency` | 20 | 并发查询上限 | 20-100 |
| `--storage.tsdb.max-block-chunk-segment-size` | 32MB | Block Chunk 段大小 | 32MB-128MB |

### 何时调大

```bash
# 高并发场景（大量 scrape target）
--query.max-concurrency=50
--storage.tsdb.max-block-chunk-segment-size=64MB
```

### 何时调小

```bash
# 小内存场景（< 4GB）
--query.max-concurrency=10
--storage.tsdb.max-block-chunk-segment-size=16MB
```

## 10.3 Remote Write 调优

### 队列参数详解

```yaml
remote_write:
  - url: http://victoriametrics:8428/api/v1/write
    queue_config:
      # 队列容量（每条 shard 的最大样本数）
      capacity: 2500
      # 每批发送的最大样本数
      max_samples_per_send: 500
      # 最小 Shard 数（低流量时保留）
      min_shards: 1
      # 最大 Shard 数（高流量时自动扩容）
      max_shards: 200
      # 重试间隔
      min_backoff: 30ms
      max_backoff: 5s
      # 最大重试次数
      max_retries: 3
      # 批处理间隔
      batch_send_deadline: 5s
```

### 参数调优原则

1. **capacity**：如果网络质量好、远端接收快，可以设大（5000+）；反之设小防止积压
2. **max_shards**：shard 数量决定了并发度。发现写入积压时调大 max_shards
3. **min_backoff/max_backoff**：远端压力大时，放慢重试节奏，避免雪上加霜

### 队列积压的排查

```promql
# 查看 Remote Write 队列状态
prometheus_remote_storage_shards                         # 当前 shard 数
prometheus_remote_storage_shards_desired                 # 期望 shard 数
rate(prometheus_remote_storage_samples_total[5m])        # 写入速率
rate(prometheus_remote_storage_failed_samples_total[5m]) # 失败速率
prometheus_remote_storage_samples_pending                # 排队中的样本数
```

如果 `prometheus_remote_storage_samples_pending` 持续增长，说明远端写入速度跟不上，需要：
1. 检查远端存储（VM/Thanos）的健康状态
2. 增大 `max_shards` 提高并发度
3. 增大 `capacity` 减少队列溢出

### Remote Write 常见问题与解决方案

| 问题 | 现象 | 解决方案 |
|------|------|---------|
| 远端写入过慢 | pending 持续增长 | 增大 max_shards，增加远端资源 |
| 网络抖动 | 偶发写入失败 | 增大 min_backoff/max_backoff，增加 max_retries |
| 数据重复 | 日志报 "sample with same timestamp" | 确保只有一个 Prometheus 写入同一远端 |
| 内存暴涨 | Remote Write 队列占满内存 | 减小 capacity 和 max_shards |
| 远端不可用 | 大量写入失败 | 减小 min_backoff，更快触发告警 |

```yaml
# 网络不稳定场景的推荐配置
remote_write:
  - url: http://victoriametrics:8428/api/v1/write
    queue_config:
      capacity: 5000
      max_samples_per_send: 1000
      min_shards: 1
      max_shards: 50
      min_backoff: 1s        # 增大重试间隔
      max_backoff: 30s       # 最多等 30s
      max_retries: 5         # 更多重试次数
      batch_send_deadline: 10s
```

## 10.4 内核参数与系统调优

### ulimit 设置

Prometheus 在高并发场景下需要同时打开大量文件（网络连接、WAL 文件、mmap 索引文件）：

```bash
# 查看当前限制
ulimit -n

# 临时修改（推荐 65535 以上）
ulimit -n 65535

# 永久修改（/etc/security/limits.conf）
prometheus soft nofile 65535
prometheus hard nofile 65535
```

### 网络参数调优

```bash
# 增大 TCP 连接队列长度（应对大量 scrape 连接）
sysctl -w net.core.somaxconn=1024

# 增大临时端口范围（大量出站 scrape 连接）
sysctl -w net.ipv4.ip_local_port_range="1024 65535"

# 缩短 TIME_WAIT 时间
sysctl -w net.ipv4.tcp_fin_timeout=15

# 启用 TCP keepalive
sysctl -w net.ipv4.tcp_keepalive_time=60
sysctl -w net.ipv4.tcp_keepalive_intvl=10
sysctl -w net.ipv4.tcp_keepalive_probes=6
```

### 磁盘 I/O 调优

Prometheus 的 TSDB 对磁盘 I/O 有持续压力，特别是 compaction 期间：

```bash
# 查看磁盘 I/O 队列深度
iostat -x 1

# 使用 SSD 并确保 noatime 挂载
# /etc/fstab
/dev/sdb1 /prometheus ext4 defaults,noatime,nodiratime 0 0

# 设置磁盘调度器为 noop/NONE（SSD 推荐）
echo none > /sys/block/sdb/queue/scheduler
```

### Docker/K8s 容器化调优

```yaml
# docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:v2.48.0
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: '4'
    # 必须限制内存，否则 OOM 可能影响宿主机
    # 推荐留 25% 余量：如果预期使用 6G，limit 设为 8G
```

```yaml
# K8s Deployment
resources:
  requests:
    memory: 6Gi
    cpu: 2
  limits:
    memory: 8Gi
    cpu: 4
```

## 10.5 生产环境推荐配置清单

```bash
# 完整的生产环境启动参数
prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=15d \
  --storage.tsdb.wal-compression \
  --storage.tsdb.min-block-duration=2h \
  --storage.tsdb.max-block-duration=48h \
  --query.max-concurrency=50 \
  --query.timeout=2m \
  --web.max-connections=512 \
  --web.read-timeout=5m \
  --storage.remote.write-max-shards=200
```

## 本章小结

- GOGC 调优是"用内存换 CPU"的权衡，推荐生产环境设为 400
- 并发抓取参数根据目标数量和可用内存动态调整
- Remote Write 队列调优的关键是观察 pending 样本数
- 完整的参数清单需要结合具体的硬件和业务规模
- 实践：[调优实验](../labs/ch10-tuning/README.md)