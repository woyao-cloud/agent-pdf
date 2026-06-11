# 第1章 实验：Pull vs Push 模型对比

## 实验目的

1. 理解 Push 模型在高并发下的"雪崩效应"
2. 体验 Pull 模型的"健康自证明"特性
3. 掌握 StatsD Exporter 的 Push-to-Pull 桥接模式
4. 直观感受 Prometheus 多维数据模型

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| push-server | :5001 | 模拟 Push 接收端，POST /push 接收指标 |
| pull-app | :8081 | 标准 Pull 模型应用，暴露 /metrics |
| statsd-exporter | :9102 | Push-to-Pull 桥接 |
| Prometheus | :9091 | Pull 模式抓取所有目标 |
| Grafana | :3001 | 可视化面板 |

## 实验步骤

### 实验 1：Push 雪崩效应模拟

```bash
# 1. 启动环境
docker compose up -d

# 2. 观察正常运行状态
curl http://localhost:5001/status
# 预期：error_rate 为 0

# 3. 运行 Push 压力测试
bash scripts/benchmark-push.sh 50 500

# 4. 观察 Push 服务器负载
curl http://localhost:5001/status
# 注意观察：响应时间、错误率的变化
```

**预期观察：**
- 并发数升高后，Push 服务器的响应延迟明显增加
- 可能出现请求超时或错误
- Push 服务器内存占用升高

### 实验 2：Pull 模型健康自证明

```bash
# 1. 访问 Prometheus Targets 页面
# 浏览器打开 http://localhost:9091/targets
# 观察所有 Target 状态为 UP

# 2. 停止 push-server
docker compose stop push-server

# 3. 观察 Prometheus Targets 页面
# 等 10-15s（一个 scrape_interval），
# push-server 的 State 变为 DOWN

# 4. 重启 push-server
docker compose start push-server

# 5. 观察自动恢复
# 等 10-15s，push-server 自动恢复为 UP
```

**预期观察：**
- Pull 模型自动检测目标健康状态
- 无需额外的心跳或健康检查机制
- 目标恢复后自动重新接入采集

### 实验 3：StatsD Push-to-Pull 桥接

```bash
# 1. 使用 UDP 向 StatsD 发送指标
echo "myapp.requests:1|c|#method:GET,endpoint:/api/users" | \
  nc -w1 -u localhost 9125

echo "myapp.response_time:250|ms|#method:POST" | \
  nc -w1 -u localhost 9125

# 2. 查看 StatsD Exporter 的 /metrics
curl http://localhost:9102/metrics | grep myapp
# 预期：看到 StatsD 格式的指标已被转化为 Prometheus 格式

# 3. 在 Prometheus 中查询
# 浏览器: http://localhost:9091/graph
# 查询: statsd_myapp_requests_total
```

**预期观察：**
- StatsD 的 UDP 指标（传统 Push）被 Exporter 转换为 Prometheus 格式
- Prometheus 通过 Pull 采集 Exporter 的 /metrics
- 完整的 Push-to-Pull 桥接链路建立

## Grafana 操作

1. 浏览器打开 http://localhost:3001
2. 添加 Prometheus 数据源：URL=http://prometheus:9090
3. 导入 Dashboard 或直接在 Explore 页面查询：
   - `rate(http_requests_total[1m])`
   - `push_uptime_seconds`

## 清理

```bash
docker compose down -v
```