# 第5章 场景三：黑盒监控与 SLA 探测（Blackbox Exporter）

## 5.1 黑盒 vs 白盒监控

### 监控的两种视角

**白盒监控**指的是从系统内部观察：应用暴露的 /metrics 端点、日志、内部状态。它回答的是"我有什么"——内部状态的详细视图。

**黑盒监控**指的是从系统外部探测：发送 HTTP 请求检查响应、Ping 检查可达性、检查 DNS 能否解析。它回答的是"用户能访问吗"——外部体验的真实反映。

### 两者互补

| 维度 | 白盒 | 黑盒 |
|------|------|------|
| 发现问题 | 能找到根本原因 | 能感知用户影响 |
| 覆盖范围 | 有 /metrics 的服务 | 一切外部可达的目标 |
| 典型场景 | JVM OOM、连接池耗尽 | 证书过期、DNS 解析失败 |
| 告警延迟 | 立即 | 依赖探测周期 |

最理想的方式是二者结合：黑盒监控在第一时间发现"用户访问不了"，白盒监控迅速定位"是 JVM 挂了还是网络断了"。

## 5.2 Blackbox Exporter 的探测协议

Blackbox Exporter 支持四种核心探测协议：

### HTTP 探测

支持自定义请求方法、期望状态码、是否跟随重定向、SSL 证书检查。

```
/probe?module=http_2xx&target=https://example.com
```

采集的指标包括：
- `probe_success` — 探测是否成功
- `probe_duration_seconds` — 探测耗时
- `probe_http_status_code` — HTTP 状态码
- `probe_http_content_length` — 响应体长度
- `probe_ssl_earliest_cert_expiry` — SSL 证书过期时间（Unix 时间戳）
- `probe_ssl_last_chain_expiry_timestamp_seconds` — 证书链最后过期时间

### TCP 探测

检查端口是否可达，测量 TCP 连接建立时间。

```
/probe?module=tcp_connect&target=example.com:443
```

### ICMP 探测

相当于 Ping，测量 RTT 和丢包率。

```
/probe?module=icmp&target=8.8.8.8
```

### DNS 探测

检查 DNS 解析是否正常，测量解析时间。

```
/probe?module=dns_query&target=google.com
```

## 5.3 模块化配置

Blackbox Exporter 的探测行为通过 modules 配置控制：

```yaml
modules:
  http_2xx:
    prober: http
    http:
      valid_status_codes: [200, 201, 302]
      follow_redirects: true
      preferred_ip_protocol: ip4

  tcp_connect:
    prober: tcp

  icmp:
    prober: icmp

  dns_query:
    prober: dns
    dns:
      query_type: A
```

Prometheus 侧的 scrape 配置通过 relabeling 将目标地址注入 Blackbox Exporter：

```yaml
scrape_configs:
  - job_name: 'blackbox-http'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets: ['https://example.com']
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

## 5.4 SSL 证书过期监控

证书过期是最容易被忽略也最有杀伤力的监控盲区。Blackbox Exporter 通过 HTTP 探测采集证书信息：

```promql
# 证书过期倒计时（天）
(probe_ssl_earliest_cert_expiry - time()) / 86400

# 30 天内过期的证书
(probe_ssl_earliest_cert_expiry - time()) / 86400 < 30
```

## 5.5 SLA 计算

```promql
# 24 小时滚动窗口 SLA
avg_over_time(probe_success{job="blackbox-http"}[24h]) * 100

# 30 天滚动窗口 SLA（SLA 标准计算方式）
avg_over_time(probe_success{job="blackbox-http"}[30d]) * 100

# SLA 告警（低于 99.9% 触发）
avg_over_time(probe_success{job="blackbox-http"}[30d]) * 100 < 99.9
```

为了降低 Grafana 渲染开销，可以使用 Recording Rule 预计算：

```yaml
rules:
  - record: sla:http_availability:ratio_24h
    expr: avg_over_time(probe_success{job="blackbox-http"}[24h])
  - record: sla:http_availability:ratio_30d
    expr: avg_over_time(probe_success{job="blackbox-http"}[30d])
```

## 5.6 PromQL 速查

```promql
# 最近 10 分钟的成功率
avg_over_time(probe_success[10m])

# 平均探测延迟
avg(probe_duration_seconds)

# 证书还剩多少天
(probe_ssl_earliest_cert_expiry - time()) / 86400

# DNS 探测延迟
probe_dns_lookup_time_seconds
```

## 本章小结

- 黑盒监控从用户视角发现问题，白盒监控定位根因
- Blackbox Exporter 支持 HTTP/TCP/ICMP/DNS 四种协议
- SSL 证书过期是最常见的"隐形炸弹"，必须纳入黑盒监控
- SLA 计算的本质是探测成功率的滚动窗口平均
- Recording Rule 预计算是高频 SLA 查询的关键优化
- 实践：[黑盒监控实验](../labs/ch05-blackbox/README.md)