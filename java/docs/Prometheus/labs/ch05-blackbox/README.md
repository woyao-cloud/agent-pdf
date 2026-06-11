# 第5章 实验：黑盒监控与 SLA 探测

## 实验目的

1. 掌握 Blackbox Exporter 的 HTTP/TCP/ICMP/DNS 探测
2. 配置 SSL 证书过期监控
3. 利用 Recording Rules 预计算 SLA

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| blackbox-exporter | :9115 | 多协议探测 |
| web-target | :8086 | Nginx 被探测目标 |
| Prometheus | :9095 | 含 SLA recording rules |
| Grafana | :3005 | SLA 仪表盘 |

## 实验步骤

### 实验 1：手动探测

```bash
# HTTP 探测
curl 'http://localhost:9115/probe?module=http_2xx&target=http://web-target' | grep probe_success

# ICMP 探测
curl 'http://localhost:9115/probe?module=icmp&target=8.8.8.8' | grep probe_success

# TCP 探测
curl 'http://localhost:9115/probe?module=tcp_connect&target=web-target:80' | grep probe_success

# DNS 探测
curl 'http://localhost:9115/probe?module=dns_query&target=google.com' | grep probe_dns
```

### 实验 2：证书过期监控

```bash
# 探测并查看证书过期时间
curl -s 'http://localhost:9115/probe?module=http_2xx&target=https://google.com' | \
  grep probe_ssl_earliest_cert_expiry

# 在 Prometheus 中查询证书过期天数
# cert:expiry_days < 30
```

### 实验 3：SLA 模拟宕机

```bash
bash scripts/simulate-outage.sh 60
```

观察 SLA 百分比变化。

### 实验 4：Prometheus 预计算 SLA

```promql
sla:http_availability:ratio_24h     # 24h SLA
sla:http_availability:ratio_7d      # 7天 SLA
sla:http_availability:ratio_30d     # 30天 SLA
cert:expiry_days                    # 证书过期天数
```

## 清理

```bash
docker compose down -v
```