# 第11章 实验：自定义 Exporter 开发

## 实验目的
1. 理解 prometheus.Collector 接口
2. 编写 Go 和 Python 版本的自定义 MySQL Exporter
3. 体验异步缓存机制

## 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| MySQL | :3306 | 被监控的数据库 |
| Go Exporter | :9301 | Go 版本，实现 Collector 接口 |
| Python Exporter | :9302 | Python 版本，通过 REGISTRY 注册 |
| Prometheus | :9099 | 采集两个 exporter 的指标 |
| Grafana | :3099 | 可视化 |

## 实验步骤

```bash
# 1. 启动环境
docker compose up -d

# 2. 查看 Go Exporter 指标
curl http://localhost:9301/metrics | grep mysql_

# 3. 查看 Python Exporter 指标
curl http://localhost:9302/metrics | grep mysql_

# 4. 查看 Prometheus scrape 状态
# http://localhost:9099/targets

# 5. 运行模拟查询
bash scripts/simulate-queries.sh

# 6. 对比两个 exporter 的指标值
# Go: mysql_slow_queries_total
# Python: mysql_slow_queries_total
```

## 关键代码

Go Collector: `go-exporter/collector/mysql_collector.go`
Python Collector: `python-exporter/exporter.py`