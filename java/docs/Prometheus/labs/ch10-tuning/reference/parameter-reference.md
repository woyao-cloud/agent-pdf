# Prometheus 核心参数参考手册

## 通用参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--config.file` | prometheus.yml | 配置文件路径 |
| `--storage.tsdb.path` | data/ | TSDB 数据目录 |
| `--storage.tsdb.retention.time` | 15d | 数据保留时间 |
| `--storage.tsdb.retention.size` | 0（无限制） | 数据保留大小（如 50GB） |
| `--storage.tsdb.wal-compression` | false | 启用 WAL 压缩 |
| `--web.listen-address` | 0.0.0.0:9090 | 监听地址 |
| `--web.enable-admin-api` | false | 启用管理 API（/api/v1/status/tsdb 等） |

## 查询参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--query.max-concurrency` | 20 | 并发查询上限 |
| `--query.timeout` | 2m | 查询超时时间 |
| `--query.max-samples` | 50000000 | 查询最大样本数 |

## TSDB 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--storage.tsdb.min-block-duration` | 2h | 最小 Block 时长 |
| `--storage.tsdb.max-block-duration` | 36h | 最大 Block 时长 |
| `--storage.tsdb.max-block-chunk-segment-size` | 32MB | Block Chunk 段大小 |

## Remote Write 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--storage.remote.write-max-shards` | 200 | 最大 shard 数 |
| `--storage.remote.write-max-samples-per-send` | 500 | 每批最大样本数 |
| `--storage.remote.write-retry-on-http-429` | true | HTTP 429 时重试 |

## Remote Read 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--storage.remote.read-concurrent-limit` | 10 | 并发读取上限 |
| `--storage.remote.read-max-bytes-in-frame` | 1048576 | 单帧最大字节 |