# Prometheus Book Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create Chapters 7-8 of the Prometheus book — Alertmanager routing/inhibition and Thanos/VictoriaMetrics HA storage.

**Architecture:** Ch07 = Python alert-generator + Prometheus + Alertmanager + webhook-receiver + MailHog. Ch08 = two independent stacks: Thanos (Sidecar + MinIO + Query + Store) and VictoriaMetrics (single-node with remote write).

**Tech Stack:** Python 3 + Flask + prometheus_client, Alertmanager, Thanos v0.33, VictoriaMetrics v1.93, MinIO, MailHog

---

### Task 1: Create Directory Structure & Chapter 7 Ebook

**Files:**
- Create: `docs/Prometheus/PART3-Advanced/07-Alertmanager.md`
- Create: `docs/Prometheus/PART3-Advanced/08-HA-Storage.md` (placeholder)

- [ ] **Step 1: Create directories**

```bash
mkdir -p docs/Prometheus/PART3-Advanced
mkdir -p docs/Prometheus/labs/ch07-alertmanager/{alertmanager,prometheus/rules,alert-generator,webhook-receiver,scripts}
mkdir -p docs/Prometheus/labs/ch08-ha-storage/{thanos/{prometheus1,prometheus2,scripts},victoriametrics/{prometheus,scripts}}
```

- [ ] **Step 2: Write Chapter 7 ebook** (to 07-Alertmanager.md)

File content should cover:
1. Alertmanager 三大核心机制 (grouping, inhibition, silences) — 30+ paragraphs
2. 路由树设计 — P0→webhook, P2→email, 多级匹配 — 20+ paragraphs
3. 告警风暴治理 — `for` duration, threshold tuning, inhibition — 25+ paragraphs
4. 实战配置 — Webhook, restore notifications, resolve_timeout — 15+ paragraphs
5. PromQL 速查 + Chapter summary

---

### Task 2: Create Ch07 Alertmanager Config

**Files:**
- Create: `docs/Prometheus/labs/ch07-alertmanager/alertmanager/config.yml`

```yaml
route:
  receiver: 'default'
  group_wait: 10s
  group_interval: 30s
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'webhook-critical'
      continue: true
    - match:
        severity: warning
      receiver: 'email-warning'
    - match:
        severity: info
      receiver: 'default'

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://webhook-receiver:5000/alert'
        send_resolved: true

  - name: 'webhook-critical'
    webhook_configs:
      - url: 'http://webhook-receiver:5000/alert'
        send_resolved: true

  - name: 'email-warning'
    email_configs:
      - to: 'dev-team@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'mailhog:1025'
        require_tls: false
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ['alertname', 'cluster']
  - source_match:
      alertname: DatacenterDown
    target_match:
      alertname: HostDown
    equal: ['datacenter']
```

---

### Task 3: Create Ch07 Prometheus Config + Alert Rules

**Files:**
- Create: `docs/Prometheus/labs/ch07-alertmanager/prometheus/prometheus.yml`
- Create: `docs/Prometheus/labs/ch07-alertmanager/prometheus/rules/alerts.yml`

prometheus.yml:
```yaml
global:
  scrape_interval: 10s
  evaluation_interval: 10s

rule_files:
  - 'rules/alerts.yml'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'alert-generator'
    static_configs:
      - targets: ['alert-generator:8088']
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

alerts.yml:
```yaml
groups:
  - name: demo
    rules:
      - alert: HighCPULoad
        expr: demo_cpu_percent > 80
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} CPU > 80%"

      - alert: HighMemoryLoad
        expr: demo_memory_percent > 85
        for: 30s
        labels:
          severity: warning
        annotations:
          summary: "Instance {{ $labels.instance }} Memory > 85%"

      - alert: DatacenterDown
        expr: demo_datacenter_down > 0
        for: 10s
        labels:
          severity: critical
        annotations:
          summary: "Datacenter {{ $labels.datacenter }} is DOWN"

      - alert: HostDown
        expr: demo_host_down > 0
        for: 10s
        labels:
          severity: critical
        annotations:
          summary: "Host {{ $labels.instance }} in {{ $labels.datacenter }} is DOWN"

      - alert: RequestErrorRate
        expr: rate(demo_errors_total[5m]) / rate(demo_requests_total[5m]) > 0.05
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Error rate > 5% on {{ $labels.instance }}"
```

---

### Task 4: Create Ch07 alert-generator + webhook-receiver

**Files:**
- Create: `docs/Prometheus/labs/ch07-alertmanager/alert-generator/generator.py`
- Create: `docs/Prometheus/labs/ch07-alertmanager/alert-generator/requirements.txt`
- Create: `docs/Prometheus/labs/ch07-alertmanager/alert-generator/Dockerfile`
- Create: `docs/Prometheus/labs/ch07-alertmanager/webhook-receiver/app.py`
- Create: `docs/Prometheus/labs/ch07-alertmanager/webhook-receiver/requirements.txt`
- Create: `docs/Prometheus/labs/ch07-alertmanager/webhook-receiver/Dockerfile`

---

### Task 5: Create Ch07 Docker Compose + Scripts

**Files:**
- Create: `docs/Prometheus/labs/ch07-alertmanager/docker-compose.yml`
- Create: `docs/Prometheus/labs/ch07-alertmanager/scripts/simulate-outage.sh`

---

### Task 6: Create Ch07 README

**Files:**
- Create: `docs/Prometheus/labs/ch07-alertmanager/README.md`

---

### Task 7: Write Chapter 8 Ebook

**Files:**
- Create: `docs/Prometheus/PART3-Advanced/08-HA-Storage.md`

File content should cover:
1. 联邦集群架构 — 20+ paragraphs
2. Thanos 核心组件 (Sidecar, Store, Query, Compactor) — 30+ paragraphs
3. VictoriaMetrics (single-node + cluster) — 20+ paragraphs
4. 架构选型指南 (small/medium/large) — 15+ paragraphs

---

### Task 8: Create Ch08 Thanos Stack

**Files:**
- Create: `docs/Prometheus/labs/ch08-ha-storage/thanos/docker-compose.yml`
- Create: `docs/Prometheus/labs/ch08-ha-storage/thanos/prometheus1/prometheus.yml`
- Create: `docs/Prometheus/labs/ch08-ha-storage/thanos/prometheus2/prometheus.yml`

---

### Task 9: Create Ch08 VictoriaMetrics Stack

**Files:**
- Create: `docs/Prometheus/labs/ch08-ha-storage/victoriametrics/docker-compose.yml`
- Create: `docs/Prometheus/labs/ch08-ha-storage/victoriametrics/prometheus/prometheus.yml`

---

### Task 10: Create Ch08 README

**Files:**
- Create: `docs/Prometheus/labs/ch08-ha-storage/README.md`