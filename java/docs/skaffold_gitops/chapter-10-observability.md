# 第10章 监控、日志与可观测性

## 10.1 概述

在 Skaffold GitOps 工作流中，应用从代码提交到集群部署的整个生命周期都需要可观测性支撑。缺乏有效的监控与日志体系，运维人员将无法感知集群状态、无法定位故障根因、也无法在问题发生前获得预警。本章围绕 CloudWatch 日志、Prometheus + Grafana 监控、健康检查脚本、告警通知、Skaffold 开发态可观测性以及潜在风险六个维度，构建一套完整的可观测性方案。

---

## 10.2 CloudWatch 容器日志

### 10.2.1 解决的问题

Kubernetes Pod 日志默认存储在节点本地，Pod 重建后日志即丢失。生产环境需要将日志持久化存储、支持全文检索、并能基于日志内容触发告警。CloudWatch Logs 作为 AWS 原生日志服务，与 EKS 深度集成，可以解决日志持久化、集中检索和告警三大问题。

### 10.2.2 核心原理

EKS 集群通过 **CloudWatch Observability Add-on** 或 **fluent-bit DaemonSet** 将容器标准输出日志发送到 CloudWatch Logs。每条日志流按以下结构组织：

- **Log Group**：通常按应用或命名空间划分，例如 `/aws/eks/skaffold-app/production`
- **Log Stream**：每个 Pod 对应一个 Log Stream，命名格式为 `pod-name-{hash}`
- **Log Event**：单条日志记录，包含时间戳和原始消息

启用 JSON 结构化日志后，CloudWatch Logs Insights 可以直接对 JSON 字段进行查询，而非仅做全文搜索。

### 10.2.3 代码/配置实现

**步骤一：安装 CloudWatch Observability Add-on**

```bash
aws eks create-addon --cluster-name skaffold-cluster \
  --addon-name amazon-cloudwatch-observability \
  --addon-version v1.3.0-eksbuild.1
```

**步骤二：fluent-bit 配置（DaemonSet）**

```yaml
# fluent-bit-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: amazon-cloudwatch
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush        1
        Log_Level    info
        Parsers_File parsers.conf

    [INPUT]
        Name              tail
        Tag               application.*
        Path              /var/log/containers/*.log
        Parser            json
        DB                /var/fluent-bit/state/flb_container.db
        Mem_Buf_Limit     50MB
        Skip_Long_Lines   On
        Refresh_Interval  10

    [FILTER]
        Name                kubernetes
        Match               application.*
        Kube_URL            https://kubernetes.default.svc:443
        Kube_Tag_Prefix     application.var.log.containers.
        Merge_Log           On
        Merge_Log_Key       log_processed
        K8S-Logging.Parser  On
        K8S-Logging.Exclude On

    [OUTPUT]
        Name                cloudwatch_logs
        Match               application.*
        log_group_name      /aws/eks/skaffold-app/production
        log_stream_prefix   pod-
        auto_create_group   On
        region              ap-northeast-1
        log_retention_days  30
```

**步骤三：应用启用 JSON 结构化日志**

```python
# app/logging_config.py
import json
import logging
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers.clear()
    root.addHandler(handler)
```

**步骤四：CloudWatch Logs Insights 查询示例**

```sql
# 查询最近一小时内 ERROR 级别的日志
fields @timestamp, message
| filter level = "ERROR"
| sort @timestamp desc
| limit 50

# 按 logger 分组统计错误数量
fields level, logger, count(*) as error_count
| filter level = "ERROR"
| stats count(*) by logger
| sort error_count desc

# 查询特定请求的完整链路
fields @timestamp, message, trace_id
| filter trace_id = "abc-123-def"
| sort @timestamp asc

# 查询响应时间超过 2 秒的请求
fields @timestamp, message.request_duration_ms, message.endpoint
| filter message.request_duration_ms > 2000
| sort message.request_duration_ms desc
```

**步骤五：Metric Filter 告警**

```bash
# 创建 Metric Filter：统计 ERROR 日志数量
aws logs put-metric-filter \
  --log-group-name /aws/eks/skaffold-app/production \
  --filter-name ErrorCount \
  --filter-pattern '{ $.level = "ERROR" }' \
  --metric-transformations \
    metricName=ErrorCount,metricNamespace=SkaffoldApp,metricValue=1

# 创建 CloudWatch Alarm
aws cloudwatch put-metric-alarm \
  --alarm-name skaffold-app-error-alarm \
  --alarm-description "ERROR 日志超过阈值" \
  --metric-name ErrorCount \
  --namespace SkaffoldApp \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:ap-northeast-1:123456789012:skaffold-alerts
```

### 10.2.4 使用场景

- **故障排查**：Pod CrashLoopBackOff 时，通过 Logs Insights 查询最后日志定位根因
- **性能分析**：统计 API 响应时间分布，识别慢请求
- **审计合规**：保留 30-90 天日志用于安全审计
- **告警触发**：ERROR 日志超过阈值时自动通知

### 10.2.5 潜在风险与注意事项

- **日志成本**：CloudWatch Logs 按 GB 计费，高流量应用每月日志费用可能超过计算资源费用。建议设置 `log_retention_days` 为 30 天，避免无限存储
- **JSON 解析失败**：非 JSON 格式日志会被 fluent-bit 丢弃，确保所有应用日志使用统一 JSON 格式
- **敏感信息泄露**：日志中不应包含密码、Token、信用卡号等敏感信息，建议在输出前做脱敏处理

### 10.2.6 本章小结

CloudWatch Logs 提供了从日志采集、结构化存储到检索告警的完整链路。核心要点：统一 JSON 格式输出、合理设置日志保留周期、利用 Metric Filter 将日志指标化。对于 EKS 环境，这是最直接且零运维的日志方案。

---

## 10.3 Prometheus + Grafana 监控

### 10.3.1 解决的问题

CloudWatch 提供基础设施层面的指标（CPU、内存、网络），但应用层面的业务指标（请求量、错误率、延迟分布、队列深度）需要 Prometheus 生态来采集和存储。Grafana 则提供统一的可视化面板，将基础设施指标与应用指标整合到同一视图。

### 10.3.2 核心原理

**kube-prometheus-stack** 是一个 Helm Chart，打包了以下组件：

| 组件 | 作用 |
|------|------|
| prometheus-operator | 管理 Prometheus 实例的声明式配置 |
| Prometheus | 指标存储与查询引擎 |
| Alertmanager | 告警路由与去重 |
| Grafana | 可视化仪表盘 |
| node-exporter | 节点级指标 |
| kube-state-metrics | Kubernetes 对象状态指标 |

**ServiceMonitor** 是 Prometheus Operator 的自定义资源，声明式地告诉 Prometheus 从哪些 Service 抓取指标。每个 ServiceMonitor 通过 label selector 匹配 Service，再通过 `port` 字段确定抓取端点。

### 10.3.3 代码/配置实现

**步骤一：安装 kube-prometheus-stack**

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values prometheus-values.yaml \
  --version 56.0.0
```

**步骤二：自定义 values**

```yaml
# prometheus-values.yaml
grafana:
  adminPassword: admin
  ingress:
    enabled: true
    ingressClassName: nginx
    hosts:
      - grafana.skaffold.example.com
  additionalDataSources:
    - name: CloudWatch
      type: grafana-cloudwatch-datasource
      jsonData:
        authType: default
        defaultRegion: ap-northeast-1

prometheus:
  prometheusSpec:
    retention: 15d
    resources:
      requests:
        memory: 2Gi
      limits:
        memory: 4Gi
    serviceMonitorSelectorNilUsesHelmValues: false
    serviceMonitorSelector: {}

alertmanager:
  config:
    global:
      resolve_timeout: 5m
    route:
      group_by: ['namespace', 'alertname']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      receiver: 'default'
    receivers:
      - name: 'default'
        slack_configs:
          - api_url: 'https://hooks.slack.com/services/T00/B00/xxxx'
            channel: '#skaffold-alerts'
            title: '{{ .GroupLabels.alertname }}'
            text: '{{ .CommonAnnotations.description }}'
```

**步骤三：创建 ServiceMonitor**

```yaml
# service-monitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: skaffold-app-monitor
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: skaffold-app
  namespaceSelector:
    matchNames:
      - production
  endpoints:
    - port: metrics
      interval: 15s
      path: /metrics
      relabelings:
        - sourceLabels: [__meta_kubernetes_pod_name]
          targetLabel: pod
        - sourceLabels: [__meta_kubernetes_namespace]
          targetLabel: namespace
```

**步骤四：应用暴露 Prometheus 指标**

```python
# app/metrics.py
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from flask import Response
import time

REQUEST_COUNT = Counter(
    'app_requests_total',
    'Total request count',
    ['method', 'endpoint', 'status']
)

REQUEST_DURATION = Histogram(
    'app_request_duration_seconds',
    'Request duration in seconds',
    ['method', 'endpoint'],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10)
)

IN_FLIGHT_REQUESTS = Gauge(
    'app_requests_in_flight',
    'Current number of in-flight requests'
)

DB_POOL_SIZE = Gauge(
    'app_db_pool_size',
    'Current database connection pool size'
)

QUEUE_DEPTH = Gauge(
    'app_queue_depth',
    'Current task queue depth'
)


def metrics_endpoint():
    return Response(generate_latest(), mimetype='text/plain')


def track_request(endpoint: str):
    def decorator(f):
        def wrapper(*args, **kwargs):
            method = request.method
            IN_FLIGHT_REQUESTS.inc()
            start = time.time()
            try:
                resp = f(*args, **kwargs)
                REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=resp.status_code).inc()
                return resp
            except Exception as e:
                REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=500).inc()
                raise
            finally:
                IN_FLIGHT_REQUESTS.dec()
                REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(
                    time.time() - start
                )
        return wrapper
    return decorator
```

**步骤五：Flask 应用集成**

```python
# app/main.py
from flask import Flask, request
from metrics import metrics_endpoint, track_request, DB_POOL_SIZE, QUEUE_DEPTH
import psutil

app = Flask(__name__)


@app.route('/metrics')
def metrics():
    return metrics_endpoint()


@app.route('/api/orders')
@track_request('/api/orders')
def list_orders():
    return {'orders': []}


@app.route('/health')
def health():
    DB_POOL_SIZE.set(10)
    QUEUE_DEPTH.set(psutil.cpu_percent())
    return {'status': 'ok'}
```

**步骤六：Service 暴露 metrics 端口**

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: skaffold-app
  namespace: production
  labels:
    app: skaffold-app
spec:
  selector:
    app: skaffold-app
  ports:
    - name: http
      port: 8080
      targetPort: 8080
    - name: metrics
      port: 8000
      targetPort: 8000
  type: ClusterIP
```

**步骤七：Grafana 自定义 Dashboard（JSON 模型）**

```json
{
  "title": "Skaffold App Dashboard",
  "uid": "skaffold-app",
  "panels": [
    {
      "title": "Request Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(rate(app_requests_total[5m])) by (endpoint)",
          "legendFormat": "{{ endpoint }}"
        }
      ],
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 }
    },
    {
      "title": "P99 Latency",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.99, sum(rate(app_request_duration_seconds_bucket[5m])) by (le, endpoint))",
          "legendFormat": "{{ endpoint }}"
        }
      ],
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 }
    },
    {
      "title": "Error Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(rate(app_requests_total{status=~\"5..\"}[5m])) / sum(rate(app_requests_total[5m])) * 100",
          "legendFormat": "Error %"
        }
      ],
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 }
    },
    {
      "title": "Queue Depth",
      "type": "graph",
      "targets": [
        {
          "expr": "app_queue_depth",
          "legendFormat": "queue"
        }
      ],
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 }
    },
    {
      "title": "In-Flight Requests",
      "type": "graph",
      "targets": [
        {
          "expr": "app_requests_in_flight",
          "legendFormat": "in_flight"
        }
      ],
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 16 }
    },
    {
      "title": "DB Pool Size",
      "type": "stat",
      "targets": [
        {
          "expr": "app_db_pool_size",
          "legendFormat": "pool"
        }
      ],
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 16 }
    }
  ]
}
```

### 10.3.4 使用场景

- **容量规划**：通过 `app_request_duration_seconds` 的 P99 趋势判断是否需要扩容
- **异常检测**：Error Rate 突增时自动触发告警
- **发布验证**：新版本上线后对比发布前后的请求延迟和错误率
- **资源优化**：通过 Grafana 面板观察 Pod 资源使用率，调整 requests/limits

### 10.3.5 潜在风险与注意事项

- **指标基数爆炸**：`endpoint` 或 `status` 等 label 如果包含用户 ID、订单 ID 等高基数值，会导致 Prometheus 内存溢出。务必限制 label 的基数
- **存储成本**：Prometheus 本地存储受磁盘大小限制，建议设置 `retention: 15d` 并配置 Thanos 或 Cortex 做长期存储
- **ServiceMonitor 选择器冲突**：`serviceMonitorSelectorNilUsesHelmValues: false` 必须设置，否则 Helm 默认只匹配带 `release: kube-prometheus-stack` 标签的 ServiceMonitor

### 10.3.6 本章小结

kube-prometheus-stack 提供了从指标采集、存储到可视化的完整方案。ServiceMonitor 是声明式指标抓取的核心抽象，Grafana Dashboard 将业务指标与基础设施指标统一呈现。关键实践：控制 label 基数、设置合理的数据保留周期、使用 Histogram 的 bucket 分布分析延迟特征。

---

## 10.4 Python 健康检查脚本

### 10.4.1 解决的问题

Kubernetes 内置的 liveness/readiness probe 只能检测单个 Pod 的健康状态，无法从全局视角判断整个应用的可用性。一个完整的健康检查脚本需要验证：Deployment 副本数是否达标、所有 Pod 是否 Ready、Service 端点是否可达、HPA 是否正常工作。

### 10.4.2 核心原理

脚本通过 Kubernetes API（使用 `kubernetes` Python 客户端）和 HTTP 探测来执行以下检查：

1. **Deployment 检查**：读取 Deployment 的 `status.availableReplicas` 与 `spec.replicas` 对比
2. **Pod 检查**：遍历 Pod 列表，检查 `status.conditions` 中 `Ready` 和 `Initialized` 状态
3. **Service 检查**：通过 Service 的 ClusterIP 或 DNS 名称发起 HTTP 请求
4. **HPA 检查**：读取 HPA 的 `status.currentMetrics` 和 `status.desiredReplicas`

### 10.4.3 代码/配置实现

```python
#!/usr/bin/env python3
"""
health_check.py — Skaffold GitOps 集群健康检查脚本

用法:
    python health_check.py --namespace production
    python health_check.py --namespace production --report-format json
    python health_check.py --namespace production --alert sns

环境变量:
    KUBECONFIG: kubeconfig 文件路径（默认 ~/.kube/config）
    AWS_DEFAULT_REGION: AWS 区域（默认 ap-northeast-1）
    SNS_TOPIC_ARN: SNS 主题 ARN（--alert sns 时必需）
    SLACK_WEBHOOK_URL: Slack Webhook URL（--alert slack 时必需）
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

import kubernetes
import kubernetes.client
import kubernetes.config
import kubernetes.stream


# ─── 数据模型 ────────────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    component: str
    name: str
    status: str          # PASS | FAIL | WARN
    message: str
    detail: dict = field(default_factory=dict)


@dataclass
class HealthReport:
    timestamp: str
    namespace: str
    cluster: str
    summary: dict
    checks: list[CheckResult]


# ─── Kubernetes 客户端初始化 ──────────────────────────────────────────────────

def init_k8s_client() -> kubernetes.client.CoreV1Api:
    try:
        kubernetes.config.load_incluster_config()
    except kubernetes.config.ConfigException:
        kubeconfig = os.environ.get("KUBECONFIG", os.path.expanduser("~/.kube/config"))
        kubernetes.config.load_kube_config(config_file=kubeconfig)
    return kubernetes.client.CoreV1Api()


# ─── 检查函数 ─────────────────────────────────────────────────────────────────

def check_deployment(
    apps_v1: kubernetes.client.AppsV1Api,
    namespace: str,
    deployment_name: str,
) -> CheckResult:
    try:
        dep = apps_v1.read_namespaced_deployment(deployment_name, namespace)
        spec_replicas = dep.spec.replicas or 1
        available = dep.status.available_replicas or 0
        ready = dep.status.ready_replicas or 0

        detail = {
            "spec_replicas": spec_replicas,
            "available_replicas": available,
            "ready_replicas": ready,
            "updated_replicas": dep.status.updated_replicas or 0,
        }

        if available >= spec_replicas and ready >= spec_replicas:
            return CheckResult(
                component="Deployment",
                name=deployment_name,
                status="PASS",
                message=f"所有 {spec_replicas} 个副本均可用",
                detail=detail,
            )
        elif available > 0:
            return CheckResult(
                component="Deployment",
                name=deployment_name,
                status="WARN",
                message=f"部分副本可用: {available}/{spec_replicas}",
                detail=detail,
            )
        else:
            return CheckResult(
                component="Deployment",
                name=deployment_name,
                status="FAIL",
                message=f"无可用副本: {available}/{spec_replicas}",
                detail=detail,
            )
    except kubernetes.client.ApiException as e:
        return CheckResult(
            component="Deployment",
            name=deployment_name,
            status="FAIL",
            message=f"API 错误: {e.status} {e.reason}",
        )


def check_pods(
    core_v1: kubernetes.client.CoreV1Api,
    namespace: str,
    label_selector: str = "",
) -> list[CheckResult]:
    results: list[CheckResult] = []
    pods = core_v1.list_namespaced_pod(namespace, label_selector=label_selector)

    if not pods.items:
        return [CheckResult(
            component="Pod",
            name="all",
            status="FAIL",
            message=f"命名空间 {namespace} 中未找到 Pod",
        )]

    for pod in pods.items:
        pod_name = pod.metadata.name
        phase = pod.status.phase
        conditions = {c.type: c.status for c in (pod.status.conditions or [])}
        restarts = sum(
            cs.restart_count for cs in (pod.status.container_statuses or [])
        )

        detail = {
            "phase": phase,
            "ready": conditions.get("Ready", "Unknown"),
            "initialized": conditions.get("Initialized", "Unknown"),
            "restarts": restarts,
            "node": pod.spec.node_name or "unknown",
        }

        if phase == "Running" and conditions.get("Ready") == "True":
            results.append(CheckResult(
                component="Pod",
                name=pod_name,
                status="PASS",
                message="Pod 运行正常",
                detail=detail,
            ))
        elif phase == "Pending":
            results.append(CheckResult(
                component="Pod",
                name=pod_name,
                status="WARN",
                message="Pod 处于 Pending 状态",
                detail=detail,
            ))
        else:
            results.append(CheckResult(
                component="Pod",
                name=pod_name,
                status="FAIL",
                message=f"Pod 异常: phase={phase}, ready={conditions.get('Ready')}",
                detail=detail,
            ))

    return results


def check_service(
    core_v1: kubernetes.client.CoreV1Api,
    namespace: str,
    service_name: str,
    health_endpoint: str = "/health",
    timeout: int = 5,
) -> CheckResult:
    try:
        svc = core_v1.read_namespaced_service(service_name, namespace)
        cluster_ip = svc.spec.cluster_ip
        port = svc.spec.ports[0].port if svc.spec.ports else 80

        url = f"http://{cluster_ip}:{port}{health_endpoint}"
        req = urllib.request.Request(url, method="GET")

        start = time.time()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.time() - start
            body = resp.read().decode("utf-8")
            status_code = resp.status

        detail = {
            "cluster_ip": cluster_ip,
            "port": port,
            "status_code": status_code,
            "response_time_ms": round(elapsed * 1000, 2),
            "response_body": body[:200],
        }

        if 200 <= status_code < 400:
            return CheckResult(
                component="Service",
                name=service_name,
                status="PASS",
                message=f"端点可达, 状态码 {status_code}, 耗时 {detail['response_time_ms']}ms",
                detail=detail,
            )
        else:
            return CheckResult(
                component="Service",
                name=service_name,
                status="FAIL",
                message=f"端点返回异常状态码 {status_code}",
                detail=detail,
            )
    except urllib.error.URLError as e:
        return CheckResult(
            component="Service",
            name=service_name,
            status="FAIL",
            message=f"端点不可达: {e.reason}",
        )
    except kubernetes.client.ApiException as e:
        return CheckResult(
            component="Service",
            name=service_name,
            status="FAIL",
            message=f"Service 查询失败: {e.status} {e.reason}",
        )


def check_hpa(
    autoscaling_v2: kubernetes.client.AutoscalingV2Api,
    namespace: str,
    hpa_name: str,
) -> CheckResult:
    try:
        hpa = autoscaling_v2.read_namespaced_horizontal_pod_autoscaler(hpa_name, namespace)
        current_replicas = hpa.status.current_replicas or 0
        desired_replicas = hpa.status.desired_replicas or 0
        max_replicas = hpa.spec.max_replicas

        metrics_detail = []
        for metric in (hpa.status.current_metrics or []):
            if metric.resource:
                metrics_detail.append({
                    "name": metric.resource.name,
                    "current": metric.resource.current.average_utilization,
                    "target": None,
                })

        detail = {
            "current_replicas": current_replicas,
            "desired_replicas": desired_replicas,
            "max_replicas": max_replicas,
            "metrics": metrics_detail,
        }

        if desired_replicas > current_replicas:
            return CheckResult(
                component="HPA",
                name=hpa_name,
                status="WARN",
                message=f"正在扩容: {current_replicas} -> {desired_replicas}",
                detail=detail,
            )
        elif desired_replicas >= max_replicas:
            return CheckResult(
                component="HPA",
                name=hpa_name,
                status="WARN",
                message=f"已达最大副本数 {max_replicas}，可能需要调整 HPA 上限",
                detail=detail,
            )
        else:
            return CheckResult(
                component="HPA",
                name=hpa_name,
                status="PASS",
                message=f"副本数稳定: {current_replicas}, 最大: {max_replicas}",
                detail=detail,
            )
    except kubernetes.client.ApiException as e:
        return CheckResult(
            component="HPA",
            name=hpa_name,
            status="FAIL",
            message=f"HPA 查询失败: {e.status} {e.reason}",
        )


# ─── 报告输出 ─────────────────────────────────────────────────────────────────

def generate_report(
    results: list[CheckResult],
    namespace: str,
) -> HealthReport:
    passed = sum(1 for r in results if r.status == "PASS")
    warned = sum(1 for r in results if r.status == "WARN")
    failed = sum(1 for r in results if r.status == "FAIL")

    return HealthReport(
        timestamp=datetime.now(timezone.utc).isoformat(),
        namespace=namespace,
        cluster=os.environ.get("CLUSTER_NAME", "unknown"),
        summary={
            "total": len(results),
            "passed": passed,
            "warned": warned,
            "failed": failed,
            "health_score": round(passed / len(results) * 100, 2) if results else 0,
        },
        checks=results,
    )


def print_report_text(report: HealthReport) -> None:
    print("=" * 60)
    print(f"  健康检查报告")
    print(f"  集群: {report.cluster}")
    print(f"  命名空间: {report.namespace}")
    print(f"  时间: {report.timestamp}")
    print(f"  健康评分: {report.summary['health_score']}%")
    print(f"  {report.summary['passed']} PASS / {report.summary['warned']} WARN / {report.summary['failed']} FAIL")
    print("=" * 60)

    for check in report.checks:
        icon = {"PASS": "[PASS]", "WARN": "[WARN]", "FAIL": "[FAIL]"}.get(check.status, "[????]")
        print(f"{icon} {check.component}/{check.name}")
        print(f"      {check.message}")
        if check.detail:
            print(f"      detail: {json.dumps(check.detail, ensure_ascii=False)}")
        print()


def print_report_json(report: HealthReport) -> None:
    print(json.dumps(asdict(report), ensure_ascii=False, indent=2))


# ─── 告警发送 ─────────────────────────────────────────────────────────────────

def send_sns_alert(report: HealthReport, topic_arn: str) -> None:
    import boto3
    client = boto3.client("sns", region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-northeast-1"))

    failed_checks = [c for c in report.checks if c.status == "FAIL"]
    subject = f"[ALERT] 集群 {report.cluster} 健康检查失败: {len(failed_checks)} 项异常"
    message = json.dumps(asdict(report), ensure_ascii=False, indent=2)

    client.publish(
        TopicArn=topic_arn,
        Subject=subject[:100],
        Message=message,
    )
    print(f"[SNS] 告警已发送至 {topic_arn}")


def send_slack_alert(report: HealthReport, webhook_url: str) -> None:
    failed_checks = [c for c in report.checks if c.status == "FAIL"]
    warn_checks = [c for c in report.checks if c.status == "WARN"]

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"⚠️ 集群健康检查: {report.cluster}"},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*命名空间:* {report.namespace}"},
                {"type": "mrkdwn", "text": f"*健康评分:* {report.summary['health_score']}%"},
                {"type": "mrkdwn", "text": f"*PASS:* {report.summary['passed']}"},
                {"type": "mrkdwn", "text": f"*WARN:* {report.summary['warned']}"},
                {"type": "mrkdwn", "text": f"*FAIL:* {report.summary['failed']}"},
            ],
        },
    ]

    for check in failed_checks[:5]:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*FAIL* `{check.component}/{check.name}`: {check.message}"},
        })

    if len(failed_checks) > 5:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"...以及 {len(failed_checks) - 5} 项其他失败"},
        })

    payload = json.dumps({"blocks": blocks}).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        print(f"[Slack] 告警已发送, 状态码: {resp.status}")


# ─── 主入口 ────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Skaffold GitOps 集群健康检查")
    parser.add_argument("--namespace", default="production", help="目标命名空间")
    parser.add_argument("--deployment", default="skaffold-app", help="Deployment 名称")
    parser.add_argument("--service", default="skaffold-app", help="Service 名称")
    parser.add_argument("--hpa", default="skaffold-app", help="HPA 名称")
    parser.add_argument("--label-selector", default="", help="Pod 标签选择器")
    parser.add_argument("--report-format", choices=["text", "json"], default="text")
    parser.add_argument("--alert", choices=["sns", "slack", "none"], default="none")
    parser.add_argument("--exit-on-fail", action="store_true", help="失败时返回非零退出码")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    core_v1 = init_k8s_client()
    apps_v1 = kubernetes.client.AppsV1Api()
    autoscaling_v2 = kubernetes.client.AutoscalingV2Api()

    results: list[CheckResult] = []

    results.append(check_deployment(apps_v1, args.namespace, args.deployment))
    results.extend(check_pods(core_v1, args.namespace, args.label_selector))
    results.append(check_service(core_v1, args.namespace, args.service))
    results.append(check_hpa(autoscaling_v2, args.namespace, args.hpa))

    report = generate_report(results, args.namespace)

    if args.report_format == "json":
        print_report_json(report)
    else:
        print_report_text(report)

    if args.alert == "sns":
        topic_arn = os.environ.get("SNS_TOPIC_ARN")
        if not topic_arn:
            print("[ERROR] SNS_TOPIC_ARN 环境变量未设置", file=sys.stderr)
            return 1
        send_sns_alert(report, topic_arn)
    elif args.alert == "slack":
        webhook = os.environ.get("SLACK_WEBHOOK_URL")
        if not webhook:
            print("[ERROR] SLACK_WEBHOOK_URL 环境变量未设置", file=sys.stderr)
            return 1
        send_slack_alert(report, webhook)

    if args.exit_on_fail and report.summary["failed"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

**Kubernetes CronJob 定期执行**

```yaml
# health-check-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: health-check
  namespace: monitoring
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: health-check-sa
          containers:
            - name: health-check
              image: python:3.11-slim
              command:
                - python
                - /scripts/health_check.py
              args:
                - --namespace
                - production
                - --report-format
                - json
                - --alert
                - slack
              env:
                - name: CLUSTER_NAME
                  value: skaffold-cluster
                - name: SLACK_WEBHOOK_URL
                  valueFrom:
                    secretKeyRef:
                      name: alert-secrets
                      key: slack-webhook-url
              volumeMounts:
                - name: scripts
                  mountPath: /scripts
          volumes:
            - name: scripts
              configMap:
                name: health-check-script
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: health-check-sa
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: health-check-role
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list"]
  - apiGroups: ["autoscaling"]
    resources: ["horizontalpodautoscalers"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: health-check-binding
subjects:
  - kind: ServiceAccount
    name: health-check-sa
    namespace: monitoring
roleRef:
  kind: ClusterRole
  name: health-check-role
  apiGroup: rbac.authorization.k8s.io
```

### 10.4.4 使用场景

- **CI/CD 门禁**：在 Skaffold 部署流水线中，部署完成后执行健康检查，失败则回滚
- **定时巡检**：通过 CronJob 每 5 分钟执行一次，异常时自动告警
- **发布验证**：新版本上线后手动执行，确认 Deployment、Pod、Service、HPA 全部正常
- **故障自愈**：结合告警系统，在检测到异常时自动触发 Skaffold 回滚或重新部署

### 10.4.5 潜在风险与注意事项

- **API Server 压力**：频繁调用 Kubernetes API 可能对 API Server 造成压力，建议 CronJob 间隔不低于 5 分钟
- **网络超时**：Service 端点检查可能因网络抖动而误报，建议增加重试机制
- **权限最小化**：ServiceAccount 的 RBAC 权限应精确到所需资源，避免使用 cluster-admin
- **告警风暴**：当集群整体异常时，所有检查项同时失败，应通过 Alertmanager 的 `group_wait` 和 `group_interval` 做聚合

### 10.4.6 本章小结

健康检查脚本从 Deployment、Pod、Service、HPA 四个维度提供了全局视角的可用性验证。通过 CronJob 定期执行 + 多渠道告警，可以在用户感知之前发现并通知问题。关键实践：RBAC 权限最小化、告警聚合防风暴、JSON 输出便于下游系统消费。

---

## 10.5 告警通知集成

### 10.5.1 解决的问题

监控数据只有转化为及时的通知才有价值。当集群出现异常时，需要将告警通过多种渠道（邮件、Slack、短信）送达不同角色（开发、运维、值班人员），并确保告警不重复、不遗漏。

### 10.5.2 核心原理

告警链路分为三层：

1. **告警产生层**：Prometheus Alertmanager、CloudWatch Alarm、健康检查脚本
2. **告警路由层**：Alertmanager 根据标签（namespace、severity、team）将告警路由到不同 Receiver
3. **通知送达层**：SNS（邮件/SMS）、Slack Webhook、PagerDuty、OpsGenie

### 10.5.3 代码/配置实现

**Alertmanager 完整配置**

```yaml
# alertmanager-config.yaml
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-config
  namespace: monitoring
stringData:
  alertmanager.yaml: |
    global:
      resolve_timeout: 5m
      slack_api_url: https://hooks.slack.com/services/T00/B00/xxxx
      pagerduty_url: https://events.pagerduty.com/v2/enqueue

    route:
      receiver: default
      group_by: ['namespace', 'alertname', 'severity']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      routes:
        - match:
            severity: critical
          receiver: pagerduty-critical
          repeat_interval: 10m
        - match:
            severity: warning
          receiver: slack-warning
        - match:
            namespace: production
          receiver: slack-production

    receivers:
      - name: default
        slack_configs:
          - channel: '#skaffold-alerts'
            title: '{{ .GroupLabels.alertname }}'
            text: '{{ .CommonAnnotations.description }}'
            color: '{{ if eq .CommonLabels.severity "critical" }}danger{{ else }}warning{{ end }}'

      - name: pagerduty-critical
        pagerduty_configs:
          - routing_key: your-pagerduty-routing-key
            severity: critical
            description: '{{ .CommonAnnotations.description }}'

      - name: slack-warning
        slack_configs:
          - channel: '#skaffold-warnings'
            title: '{{ .GroupLabels.alertname }}'
            text: '{{ .CommonAnnotations.description }}'
            color: warning

      - name: slack-production
        slack_configs:
          - channel: '#prod-skaffold'
            title: '[PROD] {{ .GroupLabels.alertname }}'
            text: '{{ .CommonAnnotations.description }}'
            color: danger
```

**PrometheusRule 告警规则**

```yaml
# prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: skaffold-app-rules
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: skaffold-app
      interval: 30s
      rules:
        - alert: HighErrorRate
          expr: |
            sum(rate(app_requests_total{status=~"5.."}[5m]))
            /
            sum(rate(app_requests_total[5m])) > 0.05
          for: 2m
          labels:
            severity: critical
            team: backend
          annotations:
            summary: "错误率超过 5%"
            description: "应用错误率当前为 {{ $value | humanizePercentage }}，已持续 2 分钟"

        - alert: HighLatency
          expr: |
            histogram_quantile(0.99, sum(rate(app_request_duration_seconds_bucket[5m])) by (le))
            > 2.0
          for: 3m
          labels:
            severity: warning
            team: backend
          annotations:
            summary: "P99 延迟超过 2 秒"
            description: "P99 延迟当前为 {{ $value }}s，已持续 3 分钟"

        - alert: PodCrashLooping
          expr: |
            increase(kube_pod_container_status_restarts_total[10m]) > 3
          for: 2m
          labels:
            severity: critical
            team: platform
          annotations:
            summary: "Pod 频繁重启"
            description: "Pod {{ $labels.pod }} 在 10 分钟内重启超过 3 次"

        - alert: DeploymentReplicasMismatch
          expr: |
            kube_deployment_spec_replicas != kube_deployment_status_available_replicas
          for: 5m
          labels:
            severity: warning
            team: platform
          annotations:
            summary: "Deployment 副本数不匹配"
            description: "Deployment {{ $labels.deployment }} 期望 {{ $labels.spec_replicas }} 副本，实际可用 {{ $labels.available_replicas }}"

        - alert: HPAAtMaxReplicas
          expr: |
            kube_hpa_status_current_replicas == kube_hpa_spec_max_replicas
          for: 15m
          labels:
            severity: warning
            team: backend
          annotations:
            summary: "HPA 已达最大副本数"
            description: "HPA {{ $labels.horizontalpodautoscaler }} 已达最大副本数 {{ $labels.max_replicas }}，持续 15 分钟"

        - alert: DiskSpaceLow
          expr: |
            node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.1
          for: 5m
          labels:
            severity: critical
            team: platform
          annotations:
            summary: "节点磁盘空间不足"
            description: "节点 {{ $labels.node }} 磁盘可用空间低于 10%"
```

**SNS 主题与订阅**

```bash
# 创建 SNS 主题
aws sns create-topic --name skaffold-alerts

# 创建邮件订阅
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-1:123456789012:skaffold-alerts \
  --protocol email \
  --notification-endpoint team@example.com

# 创建 Lambda 订阅（转发到 Slack）
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-1:123456789012:skaffold-alerts \
  --protocol lambda \
  --notification-endpoint arn:aws:lambda:ap-northeast-1:123456789012:function:sns-to-slack
```

**SNS → Slack Lambda 转发函数**

```python
# lambda_sns_to_slack.py
import json
import os
import urllib.request

SLACK_WEBHOOK_URL = os.environ["SLACK_WEBHOOK_URL"]


def lambda_handler(event, context):
    for record in event.get("Records", []):
        sns_message = json.loads(record["Sns"]["Message"])

        blocks = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"🚨 {record['Sns']['Subject']}"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*时间:* {record['Sns']['Timestamp']}"},
                    {"type": "mrkdwn", "text": f"*Topic:* {record['Sns']['TopicArn']}"},
                ],
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"```{json.dumps(sns_message, indent=2)[:3000]}```"},
            },
        ]

        payload = json.dumps({"blocks": blocks}).encode("utf-8")
        req = urllib.request.Request(
            SLACK_WEBHOOK_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            print(f"Slack 通知发送成功: {resp.status}")

    return {"statusCode": 200}
```

### 10.5.4 使用场景

- **值班告警**：Critical 级别告警通过 PagerDuty 或短信直接通知值班人员
- **团队通知**：Warning 级别告警发送到对应团队的 Slack 频道
- **邮件归档**：所有告警通过 SNS 邮件订阅归档到邮箱，用于事后复盘
- **告警升级**：如果告警 15 分钟内未确认，自动升级到更高一级的 Receiver

### 10.5.5 潜在风险与注意事项

- **告警疲劳**：过多的低价值告警会导致团队对告警麻木。建议严格控制 Critical 级别告警的数量，只对直接影响用户的问题触发
- **重复告警**：CloudWatch Alarm 和 Prometheus Alertmanager 可能同时触发同一问题的告警，建议统一告警源
- **Webhook 密钥泄露**：Slack Webhook URL 和 PagerDuty Routing Key 应存储在 Kubernetes Secret 中，避免明文出现在代码仓库
- **通知延迟**：Alertmanager 的 `group_wait: 30s` 意味着告警最多延迟 30 秒才发出，对于某些场景可能过长

### 10.5.6 本章小结

告警通知集成的核心是分层路由：按 severity 和 namespace 将告警分发到不同的 Receiver。Alertmanager 负责告警去重和分组，SNS 作为统一的消息总线，Lambda 函数实现自定义转发逻辑。关键实践：控制告警数量防疲劳、密钥安全管理、告警升级机制。

---

## 10.6 Skaffold 开发态可观测性

### 10.6.1 解决的问题

在 `skaffold dev` 开发模式下，代码变更自动同步到集群，但开发者需要实时了解：同步是否成功、Pod 是否重启、日志是否正常、以及能否通过本地端口访问远程服务。Skaffold 内置的可观测性功能可以解决这些问题。

### 10.6.2 核心原理

Skaffold 在开发模式下提供以下可观测性能力：

| 能力 | 实现方式 |
|------|----------|
| 日志流式输出 | `skaffold dev` 自动将 Pod 日志输出到终端 |
| 端口转发 | `portForward` 配置将远程 Pod 端口映射到本地 |
| 状态检查 | `statusCheck` 在部署后等待所有资源就绪 |
| 文件同步反馈 | 实时显示文件同步状态和错误 |
| 自定义健康检查 | `custom` deploy 模式下可配置健康检查命令 |

### 10.6.3 代码/配置实现

**Skaffold 开发配置**

```yaml
# skaffold.dev.yaml
apiVersion: skaffold/v4beta7
kind: Config
metadata:
  name: skaffold-app-dev

build:
  artifacts:
    - image: skaffold-app
      docker:
        dockerfile: Dockerfile
      sync:
        manual:
          - src: src/**/*.py
            dest: /app/src
          - src: templates/**/*
            dest: /app/templates
          - src: static/**/*
            dest: /app/static

deploy:
  kubectl:
    manifests:
      - k8s/namespace.yaml
      - k8s/deployment.yaml
      - k8s/service.yaml
      - k8s/hpa.yaml
  statusCheck:
    enabled: true
    initialDelay: 10s
    period: 5s
    deadline: 120s

portForward:
  - resourceType: service
    resourceName: skaffold-app
    namespace: production
    port: 8080
    localPort: 8080
  - resourceType: service
    resourceName: skaffold-app
    namespace: production
    port: 8000
    localPort: 8000

profiles:
  - name: debug
    portForward:
      - resourceType: pod
        resourceName: skaffold-app
        namespace: production
        port: 5678
        localPort: 5678
```

**启动开发模式**

```bash
# 启动开发模式，实时查看日志
skaffold dev --config skaffold.dev.yaml

# 使用调试模式（启用远程调试端口）
skaffold dev --config skaffold.dev.yaml --profile debug

# 仅查看日志而不部署
skaffold dev --tail-only

# 指定命名空间
skaffold dev --namespace production
```

**Skaffold 状态检查输出示例**

```
$ skaffold dev --status-check
...
Waiting for deployments to stabilize...
 - deployment/skaffold-app: waiting for 2/3 replicas to be ready... (30s)
 - deployment/skaffold-app: waiting for 3/3 replicas to be ready... (45s)
 - deployment/skaffold-app: ready (60s)
 - service/skaffold-app: ready
 - horizontalpodautoscaler.autoscaling/skaffold-app: ready
Status check succeeded in 60.2s
```

**自定义健康检查脚本集成**

```yaml
# skaffold.custom-check.yaml
apiVersion: skaffold/v4beta7
kind: Config
metadata:
  name: skaffold-app-custom

deploy:
  custom:
    - name: deploy-with-check
      deployCommand: kubectl apply -f k8s/
      statusCommand: |
        python health_check.py \
          --namespace production \
          --deployment skaffold-app \
          --service skaffold-app \
          --hpa skaffold-app \
          --report-format json \
          --exit-on-fail
      statusCheckInitialDelay: 15s
      statusCheckPeriod: 10s
      statusCheckDeadline: 180s
```

**Skaffold 日志过滤与查看**

```bash
# 查看特定 Pod 的日志
skaffold dev --tail-only --tail-containers app

# 使用 kubectl 查看 Skaffold 管理的 Pod 日志
kubectl logs -l app=skaffold-app -n production --tail=100 -f

# 结合 stern 实现多 Pod 日志聚合
stern skaffold-app -n production --template \
  '{{.PodName}} | {{.Message}}{{"\n"}}'
```

**端口转发调试**

```bash
# Skaffold 自动端口转发（在 skaffold dev 运行时）
# 本地访问：
curl http://localhost:8080/health
curl http://localhost:8000/metrics

# 远程调试（Python debugpy）
# 在 skaffold.dev.yaml 的 debug profile 中配置了 5678 端口转发
# IDE 中配置 Remote Debugger 连接到 localhost:5678
```

### 10.6.4 使用场景

- **日常开发**：`skaffold dev` 实时同步代码并查看日志，无需手动执行 `kubectl logs`
- **调试生产问题**：通过端口转发在本地调试远程集群中的 Pod
- **CI 验证**：在 CI 中使用 `skaffold deploy --status-check` 确保部署成功后再执行集成测试
- **多环境开发**：通过 profile 切换不同环境的端口转发和日志配置

### 10.6.5 潜在风险与注意事项

- **端口冲突**：本地端口已被占用时 Skaffold 会报错，建议使用 `localPort` 指定未被占用的端口
- **日志截断**：终端日志缓冲区有限，大量日志输出可能导致早期日志丢失，建议结合 CloudWatch 查看完整日志
- **statusCheck 超时**：如果 Deployment 启动时间超过 `deadline`，Skaffold 会标记为失败，需要根据应用启动时间调整 `deadline`
- **文件同步延迟**：`sync.manual` 配置的文件变更同步到容器有秒级延迟，高频文件变更可能触发多次 Pod 重启

### 10.6.6 本章小结

Skaffold 开发态可观测性通过日志流式输出、端口转发和状态检查三个能力，让开发者在本地获得接近生产环境的可见性。关键实践：合理配置 `statusCheck` 参数避免误报、使用 profile 区分开发/调试场景、结合外部工具（stern、kubectl）补充日志查看能力。

---

## 10.7 潜在风险与应对策略

### 10.7.1 日志体积成本

**风险描述**：高流量应用每天可能产生数十 GB 的日志，CloudWatch Logs 按 GB 计费（约 $0.50/GB 写入 + $0.03/GB 存储），每月日志费用可能超过计算资源费用。

**应对策略**：

```yaml
# 日志采样配置（fluent-bit）
[OUTPUT]
    Name                cloudwatch_logs
    Match               application.*
    log_group_name      /aws/eks/skaffold-app/production
    log_retention_days  7                    # 缩短保留周期
    log_stream_prefix   pod-

# 日志级别过滤（只保留 WARNING 及以上）
[FILTER]
    Name                modify
    Match               application.*
    Condition           Key_value_matches level ^(INFO|DEBUG)$
    Exclude             $level ^(INFO|DEBUG)$
```

```python
# 采样日志：高频率日志按比例丢弃
import random
import logging

logger = logging.getLogger(__name__)

def log_health_check(metrics: dict) -> None:
    if random.random() < 0.1:  # 只记录 10% 的健康检查日志
        logger.info("health_check_metrics", extra=metrics)
```

### 10.7.2 指标基数爆炸

**风险描述**：Prometheus 的存储和查询性能与时间序列数量直接相关。如果 label 包含高基数值（用户 ID、请求 ID、Email），时间序列数量会呈指数级增长，导致 Prometheus OOM。

**应对策略**：

```python
# 错误做法：包含高基数 label
REQUEST_COUNT = Counter(
    'app_requests_total',
    'Total request count',
    ['method', 'endpoint', 'user_id']  # user_id 是高基数，禁止！
)

# 正确做法：只使用低基数 label
REQUEST_COUNT = Counter(
    'app_requests_total',
    'Total request count',
    ['method', 'endpoint', 'status_code_group']  # status_code_group: 2xx, 3xx, 4xx, 5xx
)
```

```yaml
# Prometheus 指标限制配置
prometheus:
  prometheusSpec:
    retention: 15d
    resources:
      requests:
        memory: 4Gi
      limits:
        memory: 8Gi
    additionalScrapeConfigs:
      - job_name: skaffold-app
        metric_relabel_configs:
          - source_labels: [user_id]
            regex: '.+'
            action: drop        # 丢弃包含 user_id label 的指标
```

### 10.7.3 告警疲劳

**风险描述**：当告警规则过多或阈值设置不合理时，团队每天收到大量告警，导致对告警麻木，最终忽略真正重要的告警。

**应对策略**：

```yaml
# 告警规则分级
rules:
  - alert: HighErrorRate
    expr: error_rate > 0.05
    for: 2m                    # 持续 2 分钟才触发，避免瞬时报错
    labels:
      severity: critical       # 只有直接影响用户的问题才设为 critical

  - alert: SlightlyHighErrorRate
    expr: error_rate > 0.01
    for: 10m                   # 轻微问题需要持续更长时间才告警
    labels:
      severity: warning        # warning 级别只发 Slack，不打电话
```

**告警数量控制原则**：

- Critical 告警：每天不超过 3 条，直接影响用户可用性
- Warning 告警：每天不超过 20 条，需要人工关注但不紧急
- Info 告警：仅用于记录，不发送通知

### 10.7.4 Dashboard 泛滥

**风险描述**：每个团队、每个应用都创建自己的 Dashboard，导致 Grafana 中 Dashboard 数量过多，运维人员难以找到真正需要的面板。

**应对策略**：

```yaml
# Dashboard 组织规范
# 使用 folder 和 tag 进行分类
apiVersion: 1
folders:
  - title: Skaffold Apps
    uid: skaffold-apps

dashboards:
  - name: Skaffold App Overview
    folder: Skaffold Apps
    tags: ["skaffold", "production", "overview"]

  - name: Skaffold App Detail
    folder: Skaffold Apps
    tags: ["skaffold", "production", "detail"]
```

**Dashboard 管理规范**：

1. 每个应用最多 3 个 Dashboard：Overview、Detail、SLA
2. 使用一致的命名规范：`{app-name}-{view-type}`
3. 定期清理 90 天内未访问的 Dashboard
4. 使用 Grafana 的 Provisioning 功能，通过 Git 管理 Dashboard 配置

### 10.7.5 本章小结

可观测性体系的最大风险不在技术实现，而在成本控制和信息过载。日志采样、指标基数控制、告警分级、Dashboard 规范化是四个必须从一开始就建立的治理机制。没有这些约束，可观测性系统本身会成为运维负担。

---

## 10.8 本章总结

本章围绕 Skaffold GitOps 工作流构建了完整的可观测性体系：

| 维度 | 工具/方案 | 核心价值 |
|------|-----------|----------|
| 日志 | CloudWatch Logs + fluent-bit | 持久化存储、结构化检索、日志告警 |
| 指标 | Prometheus + kube-prometheus-stack | 应用级指标采集、ServiceMonitor 声明式配置 |
| 可视化 | Grafana | 统一仪表盘、业务+基础设施指标整合 |
| 健康检查 | Python 脚本 + CronJob | 全局视角可用性验证、多渠道告警 |
| 告警 | Alertmanager + SNS + Slack | 分层路由、去重聚合、多渠道送达 |
| 开发态 | Skaffold dev | 实时日志、端口转发、状态检查 |

**关键原则**：

1. **结构化优先**：所有日志使用 JSON 格式输出，便于机器消费
2. **指标标准化**：使用 Prometheus 标准 Client Library，统一指标命名和 label 规范
3. **告警可行动**：每条告警规则必须有明确的行动指南，不能只告警不解决
4. **成本可控**：日志保留周期、指标基数、告警数量都需要主动管理
5. **声明式配置**：ServiceMonitor、PrometheusRule、Grafana Dashboard 全部通过 Git 管理，与 Skaffold GitOps 理念一致

可观测性不是一次性建设，而是持续演进的过程。建议从最简单的 CloudWatch 日志 + 健康检查脚本开始，逐步引入 Prometheus 指标和 Grafana 可视化，最后完善告警通知体系。每一步都应在 Git 中留下声明式配置，与 Skaffold 的 GitOps 工作流保持一致。
