# 第4章 Kubernetes 监控：服务发现与 Operator

## 4.1 故事：K8s 节点宕机，30 个 Pod NotReady，告警风暴

某 FinTech 公司使用 Kubernetes 管理生产环境，共 10 个节点、200 个 Pod。一天下午 2 点，其中一个节点因硬件故障宕机。

**事件时间线**：

```
14:00:00 — 节点 node-03 硬件故障，彻底宕机
14:00:15 — K8s 检测到节点 NotReady
14:00:30 — 该节点上的 30 个 Pod 变为 Unknown 状态
14:00:45 — Prometheus 首次抓取失败
14:01:00 — 告警管理器开始发送告警

告警风暴开始：
  - 30 个 Pod 每个都触发了 "PodNotReady" 告警
  - 15 个服务触发了 "ServiceDown" 告警
  - 3 个数据库触发了 "NoMetrics" 告警
  - 总共 48 条告警在 2 分钟内发出

14:02:00 — 值班手机被 48 条短信轰炸
14:02:30 — 运维工程师开始排查，但告警太多难以定位根因
14:10:00 — 定位到节点宕机，但已被告警淹没
```

**问题**：
- 告警风暴掩盖了根因（节点宕机）
- 每个 Pod 的告警是冗余的——根源都是同一个节点故障
- 没有告警聚合和抑制机制

**事后改进**：
1. 配置告警聚合：将同一个节点的告警合并为一条
2. 配置告警抑制：节点宕机时，自动抑制该节点上 Pod 的告警
3. 使用 Prometheus Operator 统一管理监控配置

---

## 4.2 原理比喻：Prometheus Operator = 管家

### 没有 Operator 之前：手动管理 Prometheus

想象一个大型酒店（K8s 集群），你需要手动管理：

1. 每次有新客人入住（新 Pod 部署），你要手动更新宾客名单（scrape_configs）
2. 每次有客人退房（Pod 销毁），你要手动删除名单
3. 客人多了，名单变得又长又乱
4. 稍微改错一个名字，整个监控就失效了

这就像没有 Operator 的 Prometheus——每次 Pod 变化都要手动更新配置。

### 有 Operator 之后：管家帮你打理

Prometheus Operator 就像酒店的管家：

```
你（运维人员）          管家（Operator）              服务员（Prometheus）
    │                       │                            │
    │  "监控所有支付服务"    │                            │
    │──────────────────────>│                            │
    │                       │  创建 ServiceMonitor        │
    │                       │  监听支付服务 Pod 变化       │
    │                       │───────────────────────────>│
    │                       │  自动更新抓取配置           │
    │                       │  支付服务扩容→自动采集      │
    │                       │  支付服务缩容→自动移除      │
```

**你只需要声明"我要监控什么"，Operator 负责"怎么监控"**。

### ServiceMonitor = 采购清单

ServiceMonitor 就是一张采购清单：

```
ServiceMonitor（采购清单）
───────────────────────────────────────────
  我要监控: 所有带有 app: payment 标签的服务
  从哪个端口: web (8080)
  走什么路径: /metrics
  多久采购一次: 每 15 秒
───────────────────────────────────────────

管家（Operator）根据这张清单：
1. 找到所有带有 app: payment 标签的 Pod
2. 从它们的 8080 端口的 /metrics 路径拉取数据
3. 每 15 秒执行一次
4. Pod 变化时自动更新
```

---

## 4.3 手把手：创建 ServiceMonitor 的完整步骤

### 前置条件

- 一个运行中的 K8s 集群（Minikube、Kind 或云厂商集群均可）
- 已安装 Prometheus Operator（建议使用 kube-prometheus-stack Helm chart）
- kubectl 已配置

> 如果你还没有 Operator，快速安装命令：
> ```bash
> helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
> helm install prometheus prometheus-community/kube-prometheus-stack
> ```

### 步骤 1：部署一个示例应用

首先创建一个带 Prometheus 指标的示例应用：

```yaml
# sample-app.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  labels:
    app: payment
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment
  template:
    metadata:
      labels:
        app: payment
        version: v1
    spec:
      containers:
      - name: app
        image: nginx:alpine
        ports:
        - containerPort: 80
          name: http
---
apiVersion: v1
kind: Service
metadata:
  name: payment-service
  labels:
    app: payment
spec:
  selector:
    app: payment
  ports:
  - port: 80
    targetPort: 80
    name: http
```

```bash
kubectl apply -f sample-app.yaml
```

### 步骤 2：创建 ServiceMonitor

```yaml
# service-monitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: payment-service-monitor
  # 注意：namespace 必须与 Prometheus Operator 所在 namespace 一致
  # 或者配置了 allowCrossNamespace 访问
  namespace: default
  labels:
    # 这个标签很重要：Prometheus 通过它找到 ServiceMonitor
    release: prometheus  # 对应 Helm release 名称
spec:
  # 选择要监控的 Service
  selector:
    matchLabels:
      app: payment  # 匹配 payment-service 的标签

  # 指定 endpoints（对应 Service 的端口）
  endpoints:
  - port: http     # Service 中定义的端口名称
    interval: 15s  # 抓取间隔
    path: /metrics # 指标路径

  # namespace 选择器
  namespaceSelector:
    matchNames:
    - default      # 只监控 default namespace
```

```bash
kubectl apply -f service-monitor.yaml
```

### 步骤 3：验证 ServiceMonitor 是否生效

```bash
# 查看 ServiceMonitor 列表
kubectl get servicemonitor -n default

# 查看 ServiceMonitor 详细信息
kubectl describe servicemonitor payment-service-monitor

# 查看 Prometheus 是否识别了 ServiceMonitor
kubectl get prometheus -n default
```

### 步骤 4：检查 Prometheus 目标

```bash
# 端口转发到 Prometheus UI
kubectl port-forward svc/prometheus-operated 9090:9090 -n default
```

打开浏览器访问 `http://localhost:9090/targets`，你应该能看到：

```
payment-service-monitor/0 (3/3 up)  ← 3 个 Pod 都正常采集
```

### 步骤 5：验证指标数据

访问 `http://localhost:9090/graph`，查询：

```promql
up{job="payment-service-monitor"}
```

应该返回 3 条记录，值都为 1（表示 UP）。

### 常见问题排查

| 现象 | 原因 | 解决方法 |
|------|------|---------|
| ServiceMonitor 已创建但 targets 为空 | Prometheus 找不到 ServiceMonitor | 检查 ServiceMonitor 的 `release` 标签是否匹配 |
| targets 显示 0/3 up | 网络不通或端口错误 | 检查 Service 的端口名称是否匹配 |
| 指标路径 404 | path 配置错误 | 确认应用的 metrics 路径 |
| Pod 重启后 target 消失 | Pod 标签变化 | 检查 Pod 是否保留了监控标签 |

---

## 4.4 真实案例：ServiceMonitor selector 写错导致采集不到

### 案例背景

某电商公司部署了新的订单服务，但 Prometheus 始终采集不到该服务的指标。

### 问题描述

```yaml
# 错误的 ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: order-service-monitor
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: order
      version: v1         # ← 问题在这里！
  endpoints:
  - port: metrics
```

Service 的标签：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  labels:
    app: order
    version: v2        # ← 版本是 v2，不是 v1！
spec:
  selector:
    app: order
  ports:
  - port: 8080
    name: metrics
```

**根因**：ServiceMonitor 的 `selector` 要求 `version: v1`，但 Service 的标签是 `version: v2`。不匹配，所以 ServiceMonitor 找不到目标。

### 排查过程

```bash
# 1. 检查 ServiceMonitor
kubectl get servicemonitor order-service-monitor -o yaml

# 2. 检查 Service 标签
kubectl get svc order-service --show-labels

# 3. 对比发现：ServiceMonitor 要求 version=v1，但 Service 是 version=v2

# 4. 修复方案：去掉 version 匹配条件
kubectl edit servicemonitor order-service-monitor
# 将 matchLabels 改为只匹配 app: order
```

### 修复后的配置

```yaml
spec:
  selector:
    matchLabels:
      app: order          # 只匹配 app 标签，不限制版本
  endpoints:
  - port: metrics
    interval: 15s
```

### 经验教训

1. **ServiceMonitor 的 selector 不要过度约束**——只匹配必要标签即可
2. **版本升级时不改变 Service 标签**——或者使用 `matchExpressions` 匹配多个版本
3. **创建 ServiceMonitor 后立即检查 targets**——不要等告警才发现

---

## 4.5 真实案例：告警风暴的解决方案

### 场景复现

回顾开篇的故事，节点宕机导致 48 条告警的问题可以通过以下配置解决：

### 方案一：告警聚合（Grouping）

```yaml
# alertmanager.yml
route:
  group_by: ['alertname', 'node']  # 按告警名+节点聚合
  group_wait: 30s                   # 等待 30s，收集同组告警
  group_interval: 5m               # 同组告警每 5 分钟发送一次
  repeat_interval: 4h              # 已发送的告警每 4 小时重复一次

  # 接收者配置
  receiver: 'team-page'
```

效果：48 条告警被聚合为 2 条通知（节点宕机 + 建议检查该节点上的 Pod）。

### 方案二：告警抑制（Inhibition）

```yaml
# alertmanager.yml
inhibit_rules:
  # 如果节点宕机，抑制该节点上所有 Pod 的告警
  - source_match:
      severity: 'critical'
      alertname: 'NodeNotReady'
    target_match:
      severity: 'warning'
    equal: ['node']  # 当 source 和 target 的 node 标签值相同时抑制
```

效果：节点宕机告警发出后，该节点上的 Pod 告警全部被抑制，不再发送。

### 方案三：使用 PrometheusRule

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: k8s-rules
  labels:
    release: prometheus
spec:
  groups:
  - name: node.rules
    rules:
    - alert: NodeNotReady
      expr: kube_node_status_condition{condition="Ready",status="true"} == 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "节点 {{ $labels.node }} 不可用"
        description: "节点已宕机 5 分钟"

  - name: pod.rules
    rules:
    - alert: PodNotReady
      expr: kube_pod_status_ready{condition="true"} == 0
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Pod {{ $labels.pod }} 未就绪"
        description: "Pod 已处于 NotReady 状态超过 5 分钟"
```

---

## 4.6 手把手：部署完整的 K8s 监控栈

### 使用 kube-prometheus-stack 一键部署

```bash
# 添加 Helm 仓库
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 安装 kube-prometheus-stack
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace

# 等待所有 Pod 就绪
kubectl wait --for=condition=Ready pods --all -n monitoring --timeout=300s
```

### 验证安装

```bash
# 查看所有组件
kubectl get pods -n monitoring
# prometheus-prometheus-0         2/2  Running
# alertmanager-prometheus-0       2/2  Running
# prometheus-grafana-xxxxxxxxx    2/2  Running
# prometheus-kube-state-metrics   1/1  Running
# prometheus-operator-xxxxxxxxx   1/1  Running
```

### 访问 Grafana

```bash
# 获取 Grafana 密码
kubectl get secret prometheus-grafana -n monitoring -o jsonpath="{.data.admin-password}" | base64 --decode

# 端口转发
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring
```

打开浏览器访问 `http://localhost:3000`，用户名 `admin`，密码为上一步获取的值。

### 内置 Dashboard

kube-prometheus-stack 自带多个 K8s Dashboard：

| Dashboard | ID | 说明 |
|-----------|-----|------|
| Kubernetes Cluster | 315 | 集群整体状态 |
| Kubernetes Pods | 6417 | Pod 级别的指标 |
| Kubernetes Node | 11074 | 节点资源使用 |
| Namespace by Pod | 6879 | Namespace 维度 |

---

## 4.7 小结

- **Prometheus Operator** 是 K8s 监控的标配——它让 Prometheus 具备自动发现 K8s 资源变化的能力
- **ServiceMonitor** 声明"要监控什么"，Operator 负责"怎么监控"
- **告警聚合**防止告警风暴——把 48 条告警变成 2 条通知
- **告警抑制**消除冗余告警——节点宕机时自动抑制 Pod 告警
- **kube-prometheus-stack** 一键部署完整的 K8s 监控栈
- **常见陷阱**：ServiceMonitor selector 过于严格导致采集不到、缺少告警聚合导致告警风暴

---

**下一步**：学习了 K8s 集群监控，接下来看第 5 章——如何使用 Blackbox Exporter 监控外部服务的可用性（黑盒监控）。
