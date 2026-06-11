# 第 1 章实验：Pull 模型对比

## 实验目的

1. 理解 Push 模型的三大痛点（状态模糊、雪崩效应、服务发现困难）
2. 体验 Pull 模型的"健康自证明"特性
3. 掌握 StatsD Push-to-Pull 桥接模式

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| push-server | :5000 | 模拟传统 Push 模式的指标收集 HTTP 端点 |
| pull-app | :8080 | 暴露 Prometheus 格式 /metrics 的示例应用 |
| statsd-exporter | :9102, :9125/udp | Push-to-Pull 桥接 |
| Prometheus | :9090 | Pull 抓取所有目标 |
| Grafana | :3000 | 可视化面板 |

## 启动环境

```bash
docker compose up -d

# 验证所有服务启动
docker compose ps

# 查看日志
docker compose logs -f
```

## 核心实验

### 实验 1：Push 雪崩效应模拟

**步骤 1：启动 Push Server**

```bash
# 查看 Push Server 初始状态
curl http://localhost:5000/status
```

**步骤 2：逐步增加并发请求**

```bash
# 低并发（10 并发）
bash scripts/benchmark-push.sh 10 100

# 中并发（50 并发）
bash scripts/benchmark-push.sh 50 500

# 高并发（200 并发）
bash scripts/benchmark-push.sh 200 1000
```

观察：随着并发数增加，Push Server 的响应延迟和错误率上升。

**步骤 3：对比 Pull 模型**

```bash
# Pull 模型压力测试
bash scripts/benchmark-pull.sh 1 20
```

对比：Pull 模型中 Prometheus 控制抓取节奏，不会出现雪崩效应。

### 实验 2：健康自证明

**步骤 1：查看正常状态**

访问 http://localhost:9090/targets，所有目标显示为 UP。

**步骤 2：模拟目标宕机**

```bash
docker stop prom-pull-app
```

等待 10-15 秒，刷新 Targets 页面，Pull App 目标变为 DOWN。

**步骤 3：恢复目标**

```bash
docker start prom-pull-app
```

等待 10-15 秒，目标自动恢复为 UP，无需人工介入。

### 实验 3：StatsD Push-to-Pull 桥接

**步骤 1：通过 UDP 发送 StatsD 指标**

```bash
# 使用 nc 发送 UDP 指标
echo "my_metric:100|c" | nc -w 1 -u localhost 9125
echo "my_metric:200|c" | nc -w 1 -u localhost 9125
echo "api_latency:50|ms" | nc -w 1 -u localhost 9125
```

**步骤 2：查看桥接结果**

```bash
# StatsD Exporter 已转化为 Prometheus 格式
curl http://localhost:9102/metrics | grep my_metric
```

**步骤 3：Prometheus 抓取桥接数据**

访问 http://localhost:9090/graph，查询 `statsd_my_metric_total`。

## Grafana

1. 访问 http://localhost:3000
2. 数据源：Prometheus，URL=http://prometheus:9090
3. 推荐查询：
   - `rate(http_requests_total[1m])` — Pull App QPS
   - `statsd_*` — StatsD 桥接指标

## 清理

```bash
docker compose down -v
```
