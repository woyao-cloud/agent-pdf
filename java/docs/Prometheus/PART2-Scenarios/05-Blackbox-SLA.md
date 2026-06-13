# 第5章 Blackbox Exporter：SLA 监控与 SSL 证书检测

## 5.1 故事：SSL 证书过期导致线上服务不可用，损失数百万

2023 年 3 月，某知名电商平台遭遇了一次严重的服务中断事故。

**事故经过**：

```
Day 1 — 运维工程师 A 部署了新的 SSL 证书，有效期 1 年
Day 90 — 团队轮换，新同事不知道证书即将过期
Day 200 — 证书监控被遗漏（团队认为"还早"）
Day 300 — 证书还剩 65 天过期，无人关注
Day 358 — 凌晨 3:00，证书正式过期
Day 358 — 3:05，用户访问显示 "NET::ERR_CERT_DATE_INVALID"
Day 358 — 3:10，客服电话被打爆
Day 358 — 3:30，运维团队发现根因
Day 358 — 4:00，新证书部署完成，服务恢复
```

**损失统计**：
- 中断时长：1 小时
- 无法支付订单：约 50,000 笔
- 直接经济损失：约 300 万元
- 品牌声誉损失：无法估量

**根本原因**：没有自动化 SSL 证书过期监控。如果当时配置了 Blackbox Exporter 监控证书过期时间，证书到期前 30 天就会发出告警。

**事后改进**：该团队在 30 分钟内配置了 Blackbox Exporter 的 SSL 证书监控，从此再也没有因证书过期出过问题。

---

## 5.2 原理比喻：黑盒监控 vs 白盒监控

### 黑盒监控 = 假装用户访问

想象你去餐厅吃饭：

```
你（用户） → 走进餐厅 → 点餐 → 等餐 → 用餐 → 结账 → 离开
```

黑盒监控就是派一个"神秘顾客"去做同样的事情：

```
Blackbox Exporter（神秘顾客）
  → 发送 HTTP 请求（走进餐厅）
  → 检查响应状态码（有没有人接待）
  → 检查 SSL 证书（餐厅卫生是否合格）
  → 检查响应时间（上菜速度）
  → 检查内容是否包含特定关键词（菜对不对）
```

**黑盒监控只关心外部表现，不关心内部实现**。

### 白盒监控 = 检查后台

白盒监控是检查餐厅的后厨：

```
Node Exporter（卫生检查员）
  → 检查冰箱温度（CPU 温度）
  → 检查食材库存（磁盘空间）
  → 检查厨师状态（进程是否运行）
  → 检查燃气压力（内存使用率）
```

**白盒监控关心内部状态，需要被监控系统主动暴露指标**。

### 什么时候用哪个？

```
                    ┌──────────────────────┐
                    │   你的服务            │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ Prometheus     │  │  ← 白盒：Node Exporter
                    │  │ Client Library │  │     应用内置指标
                    │  └────────────────┘  │
                    └──────────────────────┘
                              │
          ─── 外部访问 ───────┤
                              │
                    ┌──────────────────────┐
                    │ Blackbox Exporter    │  ← 黑盒：模拟用户访问
                    │ 假装是用户           │
                    └──────────────────────┘
```

| 场景 | 使用黑盒 | 使用白盒 |
|------|---------|---------|
| SSL 证书过期检测 | ✅ | ❌ |
| API 响应时间（从外部） | ✅ | ❌ |
| DNS 解析是否正常 | ✅ | ❌ |
| 页面内容是否正确 | ✅ | ❌ |
| CPU 使用率 | ❌ | ✅ |
| 内存使用率 | ❌ | ✅ |
| 磁盘空间 | ❌ | ✅ |
| 应用内部错误率 | ❌ | ✅ |

---

## 5.3 手把手：配置 SSL 证书监控（module → scrape → 告警）

### 步骤 1：部署 Blackbox Exporter

```bash
# 使用 Docker 启动
docker run -d --name blackbox_exporter \
  -p 9115:9115 \
  prom/blackbox-exporter:latest
```

验证是否启动成功：

```bash
curl http://localhost:9115/metrics
# 应该能看到 Blackbox Exporter 自身的指标
```

### 步骤 2：配置 Blackbox Module

创建 `blackbox.yml`：

```yaml
# blackbox.yml
modules:
  # 模块名：http_2xx
  # 作用：检查 HTTP 服务是否正常返回 200
  http_2xx:
    prober: http
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2"]
      valid_status_codes: [200, 301, 302]
      follow_redirects: true
      preferred_ip_protocol: ip4

  # 模块名：http_2xx_ssl
  # 作用：检查 SSL 证书是否有效
  http_2xx_ssl:
    prober: http
    http:
      valid_status_codes: [200]
      # SSL 证书检查配置
      tls_config:
        # 是否验证证书
        # true = 严格验证（证书过期、域名不匹配都会失败）
        insecure_skip_verify: false

  # 模块名：ssl_cert_expiry
  # 作用：专门检查 SSL 证书过期时间
  ssl_cert_expiry:
    prober: tcp
    tcp:
      # TCP 连接到 443 端口获取证书
      query_response:
        - expect: "^SSH-2.0-"
    # 超时配置
    timeout: 5s
```

使用自定义配置启动：

```bash
docker run -d --name blackbox_exporter \
  -p 9115:9115 \
  -v $(pwd)/blackbox.yml:/config/blackbox.yml \
  prom/blackbox-exporter:latest \
  --config.file=/config/blackbox.yml
```

### 步骤 3：配置 Prometheus 抓取 Blackbox Exporter

```yaml
# prometheus.yml
scrape_configs:
  # Job: blackbox-http
  # 作用：检查网站是否能正常访问
  - job_name: 'blackbox-http'
    metrics_path: /probe
    params:
      module: [http_2xx]  # 使用 http_2xx 模块
    static_configs:
      - targets:
        - https://example.com
        - https://api.example.com
        - https://shop.example.com
    relabel_configs:
      # 将目标地址作为标签，方便查询
      - source_labels: [__address__]
        target_label: __param_target
      # 替换地址为 Blackbox Exporter 的地址
      - source_labels: [__param_target]
        target_label: instance
      - replacement: localhost:9115
        target_label: __address__

  # Job: blackbox-ssl
  # 作用：检查 SSL 证书状态
  - job_name: 'blackbox-ssl'
    metrics_path: /probe
    params:
      module: [http_2xx]  # 使用 SSL 检查模块
    static_configs:
      - targets:
        - https://example.com
        - https://api.example.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - replacement: localhost:9115
        target_label: __address__
```

### 步骤 4：验证 SSL 证书指标

重启 Prometheus 后，查询以下指标：

```promql
# SSL 证书是否有效（1=有效，0=无效）
probe_ssl_earliest_cert_expiry{instance="https://example.com"}

# SSL 证书过期时间（Unix 时间戳）
probe_ssl_earliest_cert_expiry{instance="https://example.com"}

# 网站是否可访问（1=正常，0=异常）
probe_success{job="blackbox-http"}
```

### 步骤 5：计算证书剩余天数

```promql
# 证书剩余天数
# probe_ssl_earliest_cert_expiry 返回的是过期时间戳
# time() 返回当前时间戳
# 相减得到剩余秒数，除以 86400 得到天数
(
  probe_ssl_earliest_cert_expiry{instance="https://example.com"}
  - time()
) / 86400
```

### 步骤 6：配置证书过期告警

```yaml
# alerts.yml
groups:
  - name: ssl_certificate
    rules:
    # 告警：证书即将过期（30 天内）
    - alert: SSLCertExpiringSoon
      expr: |
        (
          probe_ssl_earliest_cert_expiry{job="blackbox-ssl"}
          - time()
        ) / 86400 < 30
      for: 1h
      labels:
        severity: warning
      annotations:
        summary: "SSL 证书将在 30 天内过期"
        description: |
          域名 {{ $labels.instance }} 的 SSL 证书
          将在 {{ $value | humanizeDuration }} 后过期

    # 告警：证书已过期
    - alert: SSLCertExpired
      expr: |
        (
          probe_ssl_earliest_cert_expiry{job="blackbox-ssl"}
          - time()
        ) / 86400 < 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "SSL 证书已过期！"
        description: |
          域名 {{ $labels.instance }} 的 SSL 证书已过期！
          请立即更新证书！

    # 告警：网站无法访问
    - alert: EndpointDown
      expr: probe_success{job="blackbox-http"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "{{ $labels.instance }} 无法访问"
        description: |
          Blackbox Exporter 检测到 {{ $labels.instance }}
          无法访问，请立即排查！
```

### 步骤 7：在 Grafana 中展示

1. 打开 Grafana，添加 Prometheus 数据源
2. 导入 Dashboard ID: `7587`（Blackbox Exporter Dashboard）
3. 你会看到 SSL 证书过期时间的可视化图表

### 完整架构图

```
[目标网站] ←── HTTPS 请求 ──→ [Blackbox Exporter]
                                   ↑
                                   │ 抓取 /probe?target=...
                                   │
                              [Prometheus]
                                   │
                                   ├── 存储指标
                                   │   probe_success
                                   │   probe_ssl_earliest_cert_expiry
                                   │
                                   ├── 告警规则 → [Alertmanager] → [通知]
                                   │
                                   └── 查询 → [Grafana Dashboard]
```

---

## 5.4 真实案例：证书过期导致电商无法支付

### 案例背景

2023 年 6 月，某中型电商平台的支付网关 SSL 证书过期，导致用户在支付环节全部失败。

### 事故详情

```
平台：电商平台（日活 50 万）
影响：支付环节完全中断
持续时间：45 分钟
损失：约 200 万元

根因：支付网关的 SSL 证书过期
    团队只监控了主站（www.example.com）的证书
    但支付网关（pay.example.com）的证书被遗漏了
```

### 事故前后的监控对比

**事故前（没有黑盒监控）**：

```
SSL 证书管理方式：
  ┌─────────────────────────────────────┐
  │ 人工记录证书到期时间（Excel 表格）     │
  │  ┌─────────┬──────────┬──────────┐ │
  │  │ 域名     │ 到期时间  │ 状态     │ │
  │  ├─────────┼──────────┼──────────┤ │
  │  │ www     │ 2024-01  │ 正常     │ │
  │  │ api     │ 2024-03  │ 正常     │ │
  │  │ pay     │ 2023-06  │ ❌ 遗漏  │ │  ← 没人更新
  │  └─────────┴──────────┴──────────┘ │
  │ 更新频率：每季度人工检查一次          │
  │ 风险：完全依赖人的责任心              │
  └─────────────────────────────────────┘
```

**事故后（配置了 Blackbox Exporter）**：

```yaml
# 所有域名自动监控，无需人工
scrape_configs:
  - job_name: 'blackbox-ssl'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
        - https://www.example.com     # 主站
        - https://api.example.com     # API
        - https://pay.example.com     # 支付网关 ← 这次被覆盖了
        - https://m.example.com       # 移动端
        - https://admin.example.com   # 管理后台
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - replacement: localhost:9115
        target_label: __address__
```

### 自动化告警

```promql
# 这个查询会检查所有被监控域名
# 任何域名证书少于 30 天都会触发告警
(
  probe_ssl_earliest_cert_expiry
  - time()
) / 86400 < 30
```

### 事后经验总结

1. **监控所有域名**，不只是主站——支付、API、管理后台都可能被遗忘
2. **设置足够的提前期**——证书到期前 30 天告警，不是 1 天
3. **自动化，不依赖人**——Excel 表格管理证书是灾难的源头
4. **定期检查监控配置**——确保新域名及时加入监控列表

---

## 5.5 手把手：配置完整的 SLA 监控

### 场景：监控一个电商网站的可用性

### 步骤 1：定义 SLA 指标

```yaml
# blackbox.yml
modules:
  # 核心模块：检查首页
  http_homepage:
    prober: http
    http:
      valid_status_codes: [200]
      follow_redirects: true
      preferred_ip_protocol: ip4
      # 超时设置：超过 5 秒算失败
      timeout: 5s

  # 检查 API 响应
  http_api:
    prober: http
    http:
      valid_status_codes: [200]
      # 验证响应体包含特定内容
      fail_if_not_body_matches_regexp:
        - "status.*ok"
      timeout: 3s  # API 应该更快

  # TCP 端口检查
  tcp_connect:
    prober: tcp
    tcp:
      query_response:
        - expect: "SSH-2.0-"  # 检查 SSH 服务
    timeout: 5s

  # ICMP Ping（需要 root 权限）
  icmp_ping:
    prober: icmp
    timeout: 5s
```

### 步骤 2：配置 Prometheus 抓取

```yaml
scrape_configs:
  # 首页监控
  - job_name: 'sla-homepage'
    metrics_path: /probe
    params:
      module: [http_homepage]
    static_configs:
      - targets:
        - https://shop.example.com
        - https://www.example.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - replacement: localhost:9115
        target_label: __address__

  # API 监控
  - job_name: 'sla-api'
    metrics_path: /probe
    params:
      module: [http_api]
    static_configs:
      - targets:
        - https://api.example.com/health
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - replacement: localhost:9115
        target_label: __address__
```

### 步骤 3：计算 SLA

```promql
# 计算最近 30 天的可用性
# probe_success=1 表示成功，=0 表示失败
# 平均值就是可用性百分比
avg_over_time(
  probe_success{job="sla-homepage"}[30d]
) * 100
```

### 步骤 4：配置 SLA 告警

```yaml
groups:
  - name: sla
    rules:
    # 5 分钟连续失败
    - alert: SLABreach
      expr: |
        (
          avg_over_time(probe_success{job="sla-homepage"}[5m])
          < 0.8
        )
      for: 2m
      labels:
        severity: critical
      annotations:
        summary: "SLA 可能被违反"
        description: |
          {{ $labels.instance }} 在过去 5 分钟内
          可用性降至 {{ $value | humanizePercentage }}
```

---

## 5.6 Before/After：有黑盒监控 vs 没有

### 对比场景：SSL 证书管理

| 维度 | 没有黑盒监控 | 有黑盒监控 |
|------|------------|-----------|
| **检查方式** | 人工记录 Excel | 自动每 15 秒检查 |
| **发现延迟** | 证书过期后用户反馈 | 过期前 30 天告警 |
| **覆盖范围** | 容易遗漏（支付网关被忽略） | 所有域名统一配置 |
| **人力成本** | 每季度人工检查一次 | 零维护 |
| **故障响应** | 被动（用户投诉才发现） | 主动（提前预警） |
| **事故概率** | 高（依赖人的责任心） | 极低（自动化） |

### 对比场景：网站可用性监控

| 维度 | 没有黑盒监控 | 有黑盒监控 |
|------|------------|-----------|
| **检测粒度** | 用户报告 | 每 15 秒 |
| **MTTR** | 30-60 分钟（等用户发现） | 2-5 分钟（自动检测） |
| **报告准确性** | 用户说"网站好慢" | P99 延迟精确到毫秒 |
| **SLA 报告** | 估算 | 精确计算 |

---

## 5.7 小结

- **黑盒监控**从用户视角检查服务，不依赖服务内部暴露指标
- **Blackbox Exporter** 支持 HTTP/HTTPS/TCP/ICMP/DNS 等多种探测方式
- **SSL 证书监控**是黑盒监控最典型的应用——证书过期是常见的生产事故
- **配置流程**：定义 module → 配置 scrape → 编写告警规则
- **SLA 计算**：`avg_over_time(probe_success[30d]) * 100` 即可得到月度可用性
- **最佳实践**：监控所有域名、设置 30 天提前期、自动化不依赖人

---

**你已经完成了 Prometheus 基础篇的学习！** 现在你可以：
- 用 Pull 模型采集数据（第 1 章）
- 理解 TSDB 如何高效存储（第 2 章）
- 监控 Spring Boot 应用（第 3 章）
- 监控 K8s 集群（第 4 章）
- 用黑盒监控保障 SLA（第 5 章）
