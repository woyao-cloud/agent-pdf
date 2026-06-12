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

### 证书监控全流程实战

**Step 1：定义专用模块**

在 Blackbox Exporter 配置中创建一个专门用于证书检查的模块：

```yaml
modules:
  cert_check:
    prober: http
    http:
      valid_status_codes: []           # 不关心 HTTP 状态码
      follow_redirects: false          # 不跟随重定向
      preferred_ip_protocol: ip4
      fail_if_ssl: false               # 即使证书无效也继续探测
      tls_config:
        insecure_skip_verify: false     # 验证证书有效性
```

**Step 2：Prometheus scrape 配置**

```yaml
scrape_configs:
  - job_name: 'ssl-cert-check'
    metrics_path: /probe
    params:
      module: [cert_check]
    # 要监控证书的目标列表
    static_configs:
      - targets:
          - https://api.example.com
          - https://www.example.com
          - https://pay.example.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

**Step 3：告警规则**

```yaml
groups:
  - name: ssl-cert-alerts
    rules:
      # P2：30 天内过期 → 邮件通知
      - alert: SSLCertExpiringSoon
        expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < 30
        for: 1h
        labels: { severity: warning, pager: p2 }
        annotations:
          summary: "SSL cert for {{ $labels.instance }} expires in {{ $value | humanizeDuration }}"
          runbook: "https://wiki.example.com/ssl-renewal"

      # P1：7 天内过期 → 钉钉通知
      - alert: SSLCertExpiringCritical
        expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < 7
        for: 1h
        labels: { severity: critical, pager: p1 }
        annotations:
          summary: "SSL cert for {{ $labels.instance }} expires in {{ $value | humanizeDuration }}"
          runbook: "https://wiki.example.com/ssl-renewal"

      # P0：已过期 → 电话告警
      - alert: SSLCertExpired
        expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < 0
        for: 5m
        labels: { severity: critical, pager: p0 }
        annotations:
          summary: "SSL cert for {{ $labels.instance }} HAS EXPIRED!"
```

**Step 4：Grafana 面板**

在 Grafana 中创建一个证书监控面板，包含：
- 证书过期倒计时（按域名展示）
- 证书剩余天数热力图（绿色 > 30 天，黄色 7-30 天，红色 < 7 天）
- 证书签发机构分布
- 历史证书过期记录（用于复盘）

## 5.5 多目标探测实战：批量监控 API 网关

生产环境中通常需要监控几十甚至上百个端点。以下是一个完整的批量探测配置示例。

### 使用文件发现管理目标

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'blackbox-http-prod'
    metrics_path: /probe
    params:
      module: [http_2xx]
    file_sd_configs:
      - files: ['targets/blackbox-*.yml']
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

```yaml
# targets/blackbox-api.yml
- targets:
    - https://api.example.com/health
    - https://api.example.com/v1/status
    - https://api.internal/ping
  labels:
    group: api
    env: production

- targets:
    - https://api-staging.example.com/health
  labels:
    group: api
    env: staging
```

```yaml
# targets/blackbox-web.yml
- targets:
    - https://www.example.com
    - https://blog.example.com
    - https://docs.example.com
  labels:
    group: web
    env: production
```

### 按组聚合的 PromQL

```promql
# 按组查看整体可用性
avg by (group) (avg_over_time(probe_success{job="blackbox-http-prod"}[24h])) * 100

# 按环境查看可用性
avg by (env) (avg_over_time(probe_success{job="blackbox-http-prod"}[24h])) * 100

# 探测耗时 Top 5 的端点
topk(5, avg_over_time(probe_duration_seconds{job="blackbox-http-prod"}[1h]))
```

## 5.6 SLA 计算

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
groups:
  - name: sla-recording-rules
    rules:
      - record: sla:http_availability:ratio_24h
        expr: avg_over_time(probe_success{job="blackbox-http"}[24h])
      - record: sla:http_availability:ratio_30d
        expr: avg_over_time(probe_success{job="blackbox-http"}[30d])
```

### SLA 告警规则

```yaml
groups:
  - name: sla-alerts
    rules:
      # 当月 SLA 低于 99.9%
      - alert: SLABreach
        expr: avg_over_time(probe_success{job="blackbox-http"}[30d]) < 0.999
        for: 1h
        labels: { severity: critical }
        annotations:
          summary: "Monthly SLA {{ $value | humanizePercentage }} — below 99.9% target"
          description: |
            30-day rolling availability for {{ $labels.instance }} is {{ $value | humanizePercentage }}.
            Target: 99.9% (max 43m downtime/month)
            Current downtime: {{ (1 - $value) * 43200 | humanizeDuration }}

      # 连续 5 分钟不可用（P0 事件）
      - alert: EndpointDown
        expr: avg_over_time(probe_success[5m]) == 0
        for: 1m
        labels: { severity: critical, pager: p0 }
        annotations:
          summary: "{{ $labels.instance }} is DOWN"
          description: "Endpoint has been unreachable for 5 minutes"
```

### SLA 目标速查表

| SLA 目标 | 允许月停机时间 | 允许年停机时间 |
|---------|:-------------:|:-------------:|
| 99.9%（三个九） | 43 分钟 | 8.7 小时 |
| 99.99%（四个九） | 4.3 分钟 | 52.6 分钟 |
| 99.999%（五个九）| 26 秒 | 5.3 分钟 |

## 5.7 实战：DNS 探测与 API 功能探测

### DNS 探测

DNS 解析故障是"所有服务都挂了"的常见根因。通过 DNS 探测可以第一时间发现：

```yaml
modules:
  dns_google:
    prober: dns
    dns:
      query_name: "google.com"
      query_type: A
      valid_rcodes: [NOERROR]
      preferred_ip_protocol: ip4
```

```promql
# DNS 解析成功率
avg_over_time(probe_success{module="dns_google"}[24h]) * 100

# DNS 解析延迟
probe_dns_lookup_time_seconds

# 告警：DNS 解析连续失败 3 次
avg_over_time(probe_success{module="dns_google"}[5m]) < 0.5
```

### HTTP API 功能探测

除了检查 200 状态码，还可以验证响应内容：

```yaml
modules:
  http_api_check:
    prober: http
    http:
      method: POST
      headers:
        Content-Type: application/json
        Authorization: "Bearer ${API_TOKEN}"
      body: '{"query": "status"}'
      valid_status_codes: [200]
      # 验证响应体包含预期字段
      fail_if_body_not_matches_regexp:
        - '"status":"ok"'
      # 设置超时防止 API 慢响应拖垮探测
      timeout: 5s
```

这种探测方式可以做到：
- 验证 API 不仅"能连上"，而且"功能正常"
- 监控关键业务接口的响应体完整性
- 在用户发现问题之前主动告警

## 5.8 PromQL 速查

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