# 第3章 实验：Spring Boot 微服务监控

## 实验目的

1. 理解 Micrometer + Actuator 的 Prometheus 指标暴露机制
2. 观察 JVM 指标、Tomcat 指标、数据源指标
3. 体验高基数 URI 标签导致的时间序列爆炸
4. 掌握 Relabeling 防护规则

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| spring-boot-app | :8085 | Spring Boot 3.2 + Micrometer + Actuator |
| Prometheus | :9093 | 含 relabeling 防护规则 |
| Grafana | :3003 | 可视化 |

## 实验步骤

### 实验 1：标准 JVM 指标采集

```bash
# 1. 启动环境
docker compose up -d

# 2. 验证 Spring Boot 指标端点
curl http://localhost:8085/actuator/prometheus | head -50

# 3. 查看 JVM 指标
curl http://localhost:8085/actuator/prometheus | grep jvm_memory
```

在 Prometheus 中查询：
- `jvm_memory_used_bytes{area="heap"}` — 堆内存使用
- `jvm_gc_pause_seconds_count` — GC 暂停次数
- `jvm_threads_live_threads` — 活跃线程数
- `http_server_requests_seconds_count` — HTTP 请求计数

### 实验 2：高基数灾难 + Relabeling 防护

**步骤 A：先关闭 relabeling 观察高基数**

编辑 `prometheus/prometheus.yml`，将 `metric_relabel_configs` 部分全部注释掉，然后重启：

```bash
docker compose restart prometheus
```

运行流量生成脚本：
```bash
bash scripts/generate-traffic.sh 200 100
```

查看序列数：
```bash
curl -s http://localhost:9093/api/v1/status/tsdb | python -m json.tool | grep seriesCount
```

**步骤 B：启用 relabeling 后对比**

取消 `prometheus.yml` 中 `metric_relabel_configs` 的注释，重启：

```bash
docker compose restart prometheus
```

再次运行流量生成脚本并查看序列数，对比差异。

### 实验 3：自定义业务指标

```bash
# 创建订单
curl -X POST "http://localhost:8085/api/order/create?userId=1"

# 模拟支付
curl -X POST "http://localhost:8085/api/order/pay?orderId=123"

# 查询自定义指标
curl http://localhost:8085/actuator/prometheus | grep -E "order_|payment_|app_"
```

## Grafana

1. 访问 http://localhost:3003
2. 数据源：Prometheus，URL=http://prometheus:9090
3. 导入 JVM (Micrometer) Dashboard ID: 4701
4. 推荐查询：
   - `rate(http_server_requests_seconds_count[1m])` — QPS
   - `histogram_quantile(0.99, rate(http_server_requests_seconds_bucket[1m]))` — P99 延迟

## 清理

```bash
docker compose down -v
```