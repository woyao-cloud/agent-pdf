# 第7章 TKE 弹性伸缩实战

弹性伸缩是云原生架构的核心能力之一。在 Kubernetes 环境中，工作负载的流量并非恒定不变——电商大促时流量可能暴涨数十倍，深夜低谷时又可能降至冰点。如果始终按峰值容量部署资源，会造成巨大的浪费；如果按平均值部署，又无法应对突发流量。TKE（Tencent Kubernetes Engine）提供了多层次的弹性伸缩能力，从 Pod 级别的水平/垂直伸缩到集群节点级别的自动扩缩容，再到基于定时策略的 CronHPA，共同构成了完整的弹性体系。

本章将深入剖析 HPA、VPA、Cluster Autoscaler 和 CronHPA 四大伸缩组件的原理、配置、实战场景与潜在风险，帮助你在 TKE 上构建既经济又可靠的弹性架构。

---

## 7.1 HPA（Horizontal Pod Autoscaler）——水平 Pod 自动伸缩

### 7.1.1 解决的问题

传统部署方式中，当业务负载上升时，运维人员需要手动增加 Pod 副本数；负载下降后再手动缩容。这种方式存在几个致命问题：

- **响应滞后**：从发现负载升高到完成扩容，往往需要数分钟甚至更长时间，期间服务可能已经过载。
- **人力成本高**：7×24 小时的人工值守不现实，夜间的突发流量无法及时处理。
- **难以精细化**：人工判断缺乏精确指标支撑，扩容幅度要么过大造成浪费，要么过小无法缓解压力。

HPA 通过监控 Pod 的 CPU、内存或自定义指标，自动调整 Deployment/StatefulSet 的副本数，让应用始终有足够的副本处理请求，同时避免资源浪费。

### 7.1.2 核心原理

HPA 是一个控制循环（Control Loop），由 kube-controller-manager 中的 `horizontal-pod-autoscaler` 控制器负责执行，默认每 15 秒运行一次（由 `--horizontal-pod-autoscaler-sync-period` 控制）。

其核心算法如下：

```
desiredReplicas = ceil[currentReplicas × (currentMetricValue / desiredMetricValue)]
```

以 CPU 利用率为例：如果当前副本数为 10，当前 CPU 利用率为 80%，目标利用率为 50%，则期望副本数为 `ceil[10 × (80% / 50%)] = ceil[16] = 16`。

HPA 还引入了**容忍度（Tolerance）**机制，默认值为 0.1（即 10%）。当 `|currentMetricValue / desiredMetricValue - 1| < tolerance` 时，HPA 不会触发伸缩，避免频繁抖动。

### 7.1.3 基于 CPU/内存的 HPA

这是最基础也是最常用的 HPA 形式。它依赖 **Metrics Server** 收集 Pod 的 CPU 和内存使用数据。

**Metrics Server 安装（TKE 控制台）**：

在 TKE 集群的「组件管理」中找到「metrics-server」并安装即可。安装后可通过以下命令验证：

```bash
kubectl top pods
kubectl top nodes
```

**HPA YAML 示例——基于 CPU 利用率**：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa-cpu
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

**HPA YAML 示例——同时基于 CPU 和内存**：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa-cpu-mem
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
```

当多个指标同时配置时，HPA 会分别计算每个指标对应的期望副本数，然后取其中的**最大值**作为最终值。例如 CPU 要求扩容到 15 个副本，内存要求扩容到 10 个副本，则最终取 15。

`behavior` 字段是 `autoscaling/v2` 版本引入的精细化控制能力：
- `stabilizationWindowSeconds`：稳定窗口，防止指标抖动导致频繁伸缩。
- `policies`：定义伸缩策略，`Percent` 表示每次最多变化百分比，`Pods` 表示每次最多变化绝对数量。
- `scaleDown` 的稳定窗口通常比 `scaleUp` 更长，因为缩容应该更保守。

### 7.1.4 基于自定义指标的 HPA

CPU 和内存并不能完整反映应用的负载状况。例如，一个消息处理 Pod 的 CPU 利用率可能很低，但消息队列中已经积压了数万条消息。此时需要基于**自定义指标**进行伸缩。

TKE 中实现自定义指标 HPA 的典型方案是 **Prometheus + Prometheus Adapter**。

**架构流程**：

```
应用 Pod (暴露 /metrics) → Prometheus (采集) → Prometheus Adapter (适配) → 
    → custom.metrics.k8s.io API → HPA 控制器
```

**Prometheus Adapter 配置**：

首先需要部署 Prometheus Operator 和 Prometheus Adapter。Adapter 通过一个配置文件定义如何将 Prometheus 中的指标映射为 Kubernetes 的自定义指标。

```yaml
# prometheus-adapter-values.yaml
rules:
  default: false
  custom:
    - seriesQuery: 'http_requests_total{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace:
            resource: namespace
          pod:
            resource: pod
      name:
        matches: "^(.*)_total$"
        as: "${1}_per_second"
      metricsQuery: |
        sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)
```

**基于 QPS 的 HPA YAML 示例**：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa-qps
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "500"
  behavior:
    scaleUp:
      policies:
        - type: Percent
          value: 200
          periodSeconds: 30
      stabilizationWindowSeconds: 0
    scaleDown:
      stabilizationWindowSeconds: 180
      policies:
        - type: Pods
          value: 5
          periodSeconds: 60
```

这里 `type: Pods` 表示指标是按 Pod 聚合的，`averageValue: "500"` 表示每个 Pod 的平均 QPS 目标为 500。当实际 QPS 超过 500 时，HPA 会增加副本数。

### 7.1.5 基于外部指标的 HPA

有些场景下，伸缩的依据既不是 Pod 的资源使用率，也不是 Pod 暴露的自定义指标，而是来自集群外部的指标，例如：

- 消息队列（CMQ/CKafka）的积压消息数
- 数据库的连接数
- CDN 回源带宽

这些指标通过 **external metrics** 接入 HPA。

**基于消息队列积压的 HPA YAML 示例**：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: consumer-hpa-backlog
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: message-consumer
  minReplicas: 2
  maxReplicas: 30
  metrics:
    - type: External
      external:
        metric:
          name: cmq_queue_depth
          selector:
            matchLabels:
              queue: order-processing
        target:
          type: Value
          value: "1000"
```

当 `cmq_queue_depth`（队列深度）超过 1000 时触发扩容，每个副本大约处理 1000 条积压消息。这种模式特别适合**消费者-生产者**模型的应用。

### 7.1.6 使用场景

| 场景 | 推荐指标 | 说明 |
|------|----------|------|
| 通用 Web 服务 | CPU 利用率 | 简单有效，适合大多数无状态应用 |
| 高并发 API 网关 | QPS/请求延迟 | 更精确反映实际负载 |
| 消息处理服务 | 队列深度 | 基于积压量伸缩，避免消息堆积 |
| GPU 训练任务 | GPU 利用率 | 适合 AI 推理服务 |
| 定时批处理 | 外部指标 | 结合 CronHPA 效果更佳 |

### 7.1.7 潜在风险与注意事项

1. **Metrics Server 不可用**：如果 Metrics Server 故障，HPA 无法获取指标数据，将不会执行任何伸缩操作。建议部署多个副本并配置 PDB。

2. **指标延迟**：Prometheus 采集到 HPA 消费之间存在延迟（通常 1-3 分钟），对于延迟敏感的场景需要配合 CronHPA 做预扩容。

3. **目标利用率设置不当**：`averageUtilization` 设置过低会导致过度扩容，设置过高可能导致 Pod 在负载突增时来不及扩容就已经 OOMKilled。

4. **与 VPA 冲突**：HPA 和 VPA 不能同时基于相同的指标（如 CPU）工作，否则两者会互相干扰。

5. **缩容过快导致雪崩**：如果缩容策略过于激进，大量 Pod 同时被回收，可能导致剩余 Pod 负载瞬间飙升，进而触发新一轮扩容，形成震荡。

### 7.1.8 本章小结

HPA 是 Kubernetes 弹性伸缩的基石。基于 CPU/内存的 HPA 配置简单，适合大多数通用场景；基于自定义指标（QPS、请求延迟等）的 HPA 能更精确地反映应用负载；基于外部指标（队列深度等）的 HPA 则适合与外部系统联动的场景。实际生产中，建议将 HPA 与下文介绍的 CronHPA 配合使用，以 CronHPA 做预扩容兜底，HPA 做实时微调。

---

## 7.2 VPA（Vertical Pod Autoscaler）——垂直 Pod 自动伸缩

### 7.2.1 解决的问题

HPA 通过增减副本数来应对负载变化，但有些场景下水平扩展并不适用：

- **有状态应用**：如 MySQL、Redis、Elasticsearch，增加副本涉及复杂的数据分片和同步。
- **单体应用迁移初期**：尚未完成无状态化改造，无法随意增减副本。
- **资源请求设置不合理**：开发人员设置的 `requests` 和 `limits` 往往基于经验估算，要么过大浪费资源，要么过小导致 OOM。

VPA 解决的是 Pod 级别的资源配比问题——它根据历史使用数据，自动调整 Pod 的 CPU 和内存 `requests`/`limits`，让每个 Pod 获得恰如其分的资源。

### 7.2.2 核心原理

VPA 由三个组件组成：

1. **Recommender**：基于历史指标数据（来自 Metrics Server）和当前使用率，计算推荐的资源值。它使用百分位算法（默认 P95）来确保大多数情况下资源充足。
2. **Updater**：轮询所有被 VPA 管理的 Pod，如果当前资源请求与推荐值偏差超过阈值，则执行更新操作。
3. **Admission Controller**：拦截 Pod 创建请求，将 VPA 推荐的资源值注入到 Pod 的资源配置中。

**工作流程**：

```
Pod 运行 → Metrics Server 采集 → VPA Recommender 分析历史数据 → 
    → 生成推荐值 → VPA Updater 驱逐旧 Pod → 
    → Admission Controller 为新 Pod 注入推荐值 → 新 Pod 以新资源规格运行
```

### 7.2.3 VPA 模式

VPA 支持三种模式，通过 `updateMode` 字段控制：

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `Auto` | 自动调整资源请求，Pod 会被驱逐重建 | 生产环境，希望完全自动化 |
| `Initial` | 仅在 Pod 创建时设置推荐值，之后不再更改 | 新部署时优化资源规格 |
| `Off` | 仅提供推荐值，不执行任何更改 | 观察模式，先看推荐值再决定 |

**VPA YAML 示例——Auto 模式**：

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: mysql-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: "apps/v1"
    kind: StatefulSet
    name: mysql
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: "*"
        minAllowed:
          cpu: "500m"
          memory: "1Gi"
        maxAllowed:
          cpu: "8"
          memory: "32Gi"
        controlledResources: ["cpu", "memory"]
```

**VPA YAML 示例——Off 模式（仅查看推荐值）**：

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: redis-vpa-off
  namespace: production
spec:
  targetRef:
    apiVersion: "apps/v1"
    kind: StatefulSet
    name: redis
  updatePolicy:
    updateMode: "Off"
```

在 Off 模式下，可以通过以下命令查看 VPA 的推荐值：

```bash
kubectl describe vpa redis-vpa-off
```

输出中的 `Recommendation` 部分会显示：

```
Recommendation:
  Container Recommendations:
    Container:  redis
    Lower Bound:
      Cpu:     750m
      Memory:  1.2Gi
    Target:
      Cpu:     1.2
      Memory:  2.5Gi
    Upper Bound:
      Cpu:     3
      Memory:  8Gi
```

- **Lower Bound**：低于此值可能导致 OOM 或性能不足。
- **Target**：推荐的目标值。
- **Upper Bound**：高于此值可能造成浪费。

### 7.2.4 使用场景

| 场景 | 推荐模式 | 说明 |
|------|----------|------|
| 新服务上线，资源规格未知 | `Off` | 先观察一周，根据推荐值手动调整 |
| 有状态中间件（MySQL/Redis） | `Auto` | 无法水平扩展，垂直调整最合适 |
| 批处理任务 | `Initial` | 每次任务创建时使用推荐值 |
| Java 应用（内存大户） | `Auto` | Java 堆内存设置需要精确控制 |

### 7.2.5 潜在风险与注意事项

1. **Pod 重启**：VPA `Auto` 模式通过驱逐 Pod 来生效，这会导致 Pod 重建。对于有状态应用，需要考虑连接中断和数据迁移的影响。建议配合 PDB（PodDisruptionBudget）使用，确保同一时间只有少量 Pod 被重建。

2. **与 HPA 冲突**：VPA 和 HPA 不能同时基于相同的资源指标工作。如果 HPA 基于 CPU 利用率伸缩，VPA 也在调整 CPU 请求，两者会形成正反馈循环——VPA 降低 CPU 请求 → HPA 检测到 CPU 利用率升高 → HPA 扩容 → VPA 再次调整。Kubernetes 社区的建议是：**如果使用 HPA，就不要在同一 Deployment 上使用 VPA**。

3. **资源碎片化**：VPA 调整后的 Pod 资源规格可能无法被集群中任何节点容纳，导致 Pod 一直处于 Pending 状态。设置 `maxAllowed` 可以限制 VPA 的最大推荐值。

4. **OOM 风险**：VPA 的推荐基于历史数据，如果应用出现突发的内存泄漏，VPA 可能来不及调整就已经 OOM。建议同时配置 `resources.limits` 的上限。

### 7.2.6 本章小结

VPA 是 HPA 的重要补充，特别适合有状态应用和资源规格不确定的场景。生产环境中建议先用 `Off` 模式观察一段时间，确认 VPA 的推荐值合理后再切换到 `Auto` 模式。务必注意 VPA 与 HPA 的兼容性问题——两者不应在同一组资源指标上同时生效。

---

## 7.3 Cluster Autoscaler（CA）——集群自动伸缩

### 7.3.1 解决的问题

HPA 和 VPA 解决的是 Pod 级别的资源调整问题，但它们有一个前提：**集群中有足够的节点资源来调度新的 Pod**。当集群资源不足时，即使 HPA 将副本数从 10 扩展到 100，这些 Pod 也会因为节点资源不足而一直处于 Pending 状态。

Cluster Autoscaler（CA）的作用就是在集群资源不足时自动扩容节点，在资源过剩时自动缩容节点，确保 Pod 始终有地方可以运行。

### 7.3.2 核心原理

CA 定期（默认每 10 秒）检查以下条件：

**扩容条件**：存在因资源不足而 Pending 的 Pod，且这些 Pod 无法被现有节点调度。CA 会尝试模拟添加一个节点后能否调度这些 Pod，如果可以，则触发节点池扩容。

**缩容条件**：存在节点资源利用率长期低于阈值（默认 50%），且节点上的所有 Pod 可以被调度到其他节点。CA 会模拟驱逐该节点上的 Pod，如果所有 Pod 都能找到新家，则触发缩容。

**TKE 上的 CA 架构**：

```
kube-controller-manager (CA 组件) → 检测到 Pending Pod → 
    → 调用 TKE 云 API → 节点池扩容 → 新节点加入集群 → 
    → kube-scheduler 将 Pod 调度到新节点
```

### 7.3.3 节点池自动伸缩

TKE 的节点池（Node Pool）是 CA 的基本管理单元。每个节点池可以设置最小节点数和最大节点数。

**通过 TKE 控制台配置节点池伸缩**：

在「集群管理」→「节点池」中创建或编辑节点池时，可以设置：
- **节点数量范围**：最小节点数、最大节点数
- **伸缩配置**：节点规格（机型）、系统盘大小、数据盘大小
- **标签和污点**：用于 Pod 调度控制

**通过 Kubernetes API 查看节点池状态**：

```bash
# 查看节点池列表
kubectl get nodegroup

# 查看节点池详情
kubectl describe nodegroup np-xxxxxxxx
```

**CA 配置示例（通过 TKE 的 ClusterAutoscaler 组件配置）**：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-autoscaler-config
  namespace: kube-system
data:
  config.json: |
    {
      "scaleDownDelay": "10m",
      "scaleDownUnneededTime": "10m",
      "scaleDownUtilizationThreshold": 0.5,
      "skipNodesWithLocalStorage": true,
      "skipNodesWithSystemPods": true,
      "maxEmptyBulkDelete": 10,
      "newPodScaleUpDelay": "0s",
      "maxNodeProvisionTime": "15m"
    }
```

### 7.3.4 CA 与超级节点（Super Node）

TKE 的**超级节点**（Super Node）是一种 Serverless 化的节点形态。它不是一台真实的 CVM 云服务器，而是一个逻辑上的节点池，底层由腾讯云 EKS（Elastic Kubernetes Service）托管。

**超级节点的核心优势**：

- **秒级扩容**：无需等待 CVM 创建（通常需要 1-3 分钟），Pod 直接在超级节点上启动。
- **按 Pod 计费**：只为实际运行的 Pod 付费，没有节点维度的固定成本。
- **无限容量**：超级节点没有最大节点数限制，理论上可以无限扩容。

**在 TKE 上启用超级节点**：

在集群的「超级节点」页面添加超级节点即可。之后可以通过节点选择器将特定 Pod 调度到超级节点上：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: burstable-web
  namespace: production
spec:
  replicas: 10
  template:
    metadata:
      labels:
        app: burstable-web
    spec:
      nodeSelector:
        node.kubernetes.io/instance-type: eklet
      containers:
        - name: web
          image: nginx:latest
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
```

**CA + 超级节点的混合架构**：

```
                    ┌─────────────────────────┐
                    │     CLB (负载均衡器)       │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │     TKE 集群 (CA 管理)     │
                    └──────────┬──────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌────────────┐     ┌────────────┐     ┌──────────────────┐
   │ CVM 节点池  │     │ CVM 节点池  │     │  超级节点 (EKS)    │
   │ (基础容量)  │     │ (弹性容量)  │     │ (弹性容量, 秒级)   │
   │ min: 5     │     │ min: 0     │     │ min: 0           │
   │ max: 10    │     │ max: 20    │     │ max: 无上限       │
   └────────────┘     └────────────┘     └──────────────────┘
```

**最佳实践**：将稳定的基础负载部署在 CVM 节点池上，将突发的弹性负载调度到超级节点上。这样既保证了基础性能的稳定性，又获得了秒级弹性的能力。

### 7.3.5 CA 关键配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `scale-down-delay` | 10 分钟 | 节点创建后多久开始评估是否可以缩容 |
| `scale-down-unneeded-time` | 10 分钟 | 节点被标记为"不需要"后持续多久才真正缩容 |
| `scale-down-utilization-threshold` | 0.5 | 节点资源利用率低于此阈值才考虑缩容 |
| `skip-nodes-with-local-storage` | true | 是否跳过有本地存储的节点（如 HostPath） |
| `skip-nodes-with-system-pods` | true | 是否跳过运行系统组件的节点（如 DaemonSet） |
| `max-node-provision-time` | 15 分钟 | 节点创建超时时间 |
| `new-pod-scale-up-delay` | 0 秒 | 新 Pod 创建后多久开始评估扩容 |

### 7.3.6 使用场景

| 场景 | 推荐配置 | 说明 |
|------|----------|------|
| 稳定业务 + 突发流量 | CVM 节点池 + 超级节点 | 基础负载用 CVM，突发用超级节点 |
| 纯 Serverless 架构 | 仅超级节点 | 无需管理节点，完全弹性 |
| 大数据/批处理 | CVM 竞价实例节点池 | 成本敏感，可接受中断 |
| 生产关键业务 | CVM 按量计费节点池 | 需要稳定的节点生命周期 |

### 7.3.7 潜在风险与注意事项

1. **扩容延迟**：CVM 节点创建需要 1-3 分钟，加上镜像拉取和 kubelet 注册时间，总共可能需要 3-5 分钟。对于延迟敏感的业务，建议使用超级节点或预留 CVM 实例。

2. **缩容导致 Pod 中断**：CA 缩容时会驱逐节点上的 Pod，如果 Pod 没有配置 PDB（PodDisruptionBudget），可能导致服务中断。建议为关键服务配置 PDB：

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-pdb
  namespace: production
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: web-server
```

3. **竞价实例中断**：使用竞价实例（Spot Instance）作为节点池时，云平台可能随时回收实例。需要确保应用支持优雅退出和快速恢复。

4. **成本失控**：CA 扩容没有成本上限的概念。如果 HPA 配置了很大的 `maxReplicas`，CA 会无限制地创建节点来满足 Pod 调度需求。建议结合 TKE 的**节点池上限**和**集群资源配额**来控制成本。

### 7.3.8 本章小结

Cluster Autoscaler 是集群维度的弹性伸缩组件，解决了"Pod 有地方可跑"的问题。在 TKE 上，CA 与节点池深度集成，支持 CVM 节点和超级节点两种弹性模式。对于生产环境，推荐采用"基础 CVM 节点池 + 弹性超级节点"的混合架构，兼顾性能、成本和弹性速度。

---

## 7.4 CronHPA——定时弹性伸缩

### 7.4.1 解决的问题

HPA 和 CA 都是**反应式**伸缩——它们只有在检测到指标变化后才会触发操作。这种模式存在一个天然缺陷：**从负载上升到扩容完成之间存在时间差**。

对于可预见的流量高峰（如电商大促、每日早高峰、直播开播），反应式伸缩往往来不及。CronHPA 提供了一种**预测式**伸缩能力——在流量到达之前，提前扩容到预期规模。

### 7.4.2 核心原理

CronHPA 是 TKE 提供的扩展组件（非 Kubernetes 原生），它基于 Cron 表达式定义的时间表，在指定时间点将目标工作负载的副本数调整到指定值。

**工作流程**：

```
CronHPA 控制器 → 监听 Cron 表达式 → 到达指定时间 → 
    → 修改 Deployment/StatefulSet 的 replicas → 
    → 保持副本数直到下一个时间点
```

### 7.4.3 Cron 表达式语法

CronHPA 使用标准的 Cron 表达式，格式为：

```
┌───── 分钟 (0-59)
│ ┌───── 小时 (0-23)
│ │ ┌───── 日 (1-31)
│ │ │ ┌───── 月 (1-12)
│ │ │ │ ┌───── 星期 (0-6, 0=周日)
│ │ │ │ │
* * * * *
```

常用示例：

| 表达式 | 含义 |
|--------|------|
| `0 9 * * *` | 每天 9:00 |
| `30 18 * * *` | 每天 18:30 |
| `0 8-18 * * *` | 每天 8:00 到 18:00 每小时 |
| `*/5 * * * *` | 每 5 分钟 |
| `0 0 * * 6,0` | 每周六、周日 0:00 |
| `0 0 1 * *` | 每月 1 日 0:00 |

### 7.4.4 CronHPA YAML 示例

**基础示例——每天早晚高峰伸缩**：

```yaml
apiVersion: autoscaling.tkestack.io/v1
kind: CronHPA
metadata:
  name: web-cronhpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  crontabs:
    - schedule: "0 8 * * *"
      targetReplicas: 20
    - schedule: "0 22 * * *"
      targetReplicas: 5
```

**复杂示例——大促活动期间多段伸缩**：

```yaml
apiVersion: autoscaling.tkestack.io/v1
kind: CronHPA
metadata:
  name: promotion-cronhpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  crontabs:
    # 大促前 1 小时预扩容到 30 副本
    - schedule: "0 19 * * 11-15"
      targetReplicas: 30
      description: "618 大促预扩容"
    # 大促正式开始，扩容到 80 副本
    - schedule: "0 20 * * 11-15"
      targetReplicas: 80
      description: "618 大促正式开始"
    # 大促高峰，扩容到 150 副本
    - schedule: "0 21 * * 11-15"
      targetReplicas: 150
      description: "618 大促高峰"
    # 大促结束，逐步缩容
    - schedule: "0 2 * * 12-16"
      targetReplicas: 30
      description: "618 大促结束缩容"
    # 恢复正常
    - schedule: "0 8 * * 16"
      targetReplicas: 10
      description: "618 恢复正常"
```

### 7.4.5 CronHPA 与 HPA 协同工作

CronHPA 和 HPA 可以同时作用于同一个 Deployment。CronHPA 负责在可预见的流量高峰前做**预扩容**，HPA 负责在流量波动时做**实时微调**。

**协同策略**：

```
时间线:  08:00         09:00         10:00         11:00
CronHPA: 预扩容到 20    ────────── 预缩容到 10  ──────────
HPA:     ── 实时调整 ──  ── 实时调整 ──  ── 实时调整 ──
实际副本: 20 → 25 → 30  30 → 28 → 25  25 → 15 → 10  10 → 12 → 15
```

**注意事项**：CronHPA 和 HPA 同时存在时，CronHPA 的优先级更高。当 CronHPA 修改了 `replicas` 后，HPA 会基于新的副本数重新计算。如果 CronHPA 设置的副本数远高于 HPA 的计算结果，HPA 不会主动缩容（因为 HPA 的缩容有稳定窗口和容忍度限制）。

### 7.4.6 使用场景

| 场景 | 策略 | 说明 |
|------|------|------|
| 每日早高峰 | 08:00 预扩容，22:00 缩容 | 适合资讯类、在线教育类应用 |
| 电商大促 | 提前 1 小时预扩容，分阶段递增 | 618、双 11 等大促活动 |
| 月末结算 | 每月最后一天扩容 | 财务系统、报表系统 |
| 工作日/周末 | 工作日扩容，周末缩容 | 办公类系统 |

### 7.4.7 潜在风险与注意事项

1. **时间精度**：CronHPA 的精度受控制器轮询间隔影响，通常有秒级到分钟级的误差。对于需要精确到秒的场景不适用。

2. **与 HPA 的交互**：如果 CronHPA 缩容后，HPA 立即因为当前负载高而再次扩容，会导致不必要的震荡。建议在 CronHPA 缩容的时间点，确保负载已经确实下降。

3. **时区问题**：Cron 表达式默认使用控制器的时区（通常是 UTC）。在 TKE 上，需要确认 CronHPA 控制器的时区设置，或者使用 `TZ=Asia/Shanghai` 前缀指定时区。

4. **过度规划**：CronHPA 的副本数是静态配置的，如果预估的流量与实际不符，可能导致资源浪费或容量不足。建议结合历史流量数据来校准 CronHPA 的副本数。

### 7.4.8 本章小结

CronHPA 是 TKE 提供的预测式伸缩能力，弥补了 HPA 反应式伸缩的滞后性缺陷。对于流量模式可预测的业务（如每日高峰、大促活动），CronHPA 是最经济有效的弹性方案。生产环境中，推荐将 CronHPA 与 HPA 配合使用——CronHPA 做预扩容兜底，HPA 做实时微调。

---

## 7.5 弹性伸缩的潜在风险与最佳实践

### 7.5.1 伸缩震荡（Thrashing）

**问题描述**：系统在短时间内反复扩容和缩容，导致 Pod 频繁创建和销毁，集群资源剧烈波动。

**产生原因**：
- 指标抖动：CPU/内存使用率在阈值附近波动
- HPA 与 CronHPA 冲突：CronHPA 缩容后 HPA 立即扩容
- 多个 HPA 作用于同一 Deployment

**解决方案**：

1. **设置合理的稳定窗口**：

```yaml
behavior:
  scaleDown:
    stabilizationWindowSeconds: 300  # 5 分钟稳定窗口
    policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

2. **使用多个指标取最大值**：配置 CPU 和内存两个指标，HPA 会取两者中要求更高的副本数，避免单一指标抖动。

3. **避免 CronHPA 与 HPA 目标冲突**：CronHPA 的 `targetReplicas` 应该与 HPA 的 `minReplicas` 和 `maxReplicas` 协调。

### 7.5.2 冷启动延迟

**问题描述**：新创建的 Pod 需要一定时间才能开始处理请求，这段时间内服务容量不足。

**延迟来源**：

| 阶段 | 典型耗时 | 优化方案 |
|------|----------|----------|
| 镜像拉取 | 10s - 数分钟 | 使用预缓存镜像、P2P 分发（如 Dragonfly） |
| 容器启动 | 1-5s | 优化 Dockerfile，减少启动脚本 |
| 应用初始化 | 5s - 30s+ | 懒加载、预热缓存、启动探针优化 |
| 注册到服务发现 | 1-3s | 使用就绪探针（Readiness Probe） |

**优化示例——使用就绪探针和预停止钩子**：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-server
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: web
          image: registry.example.com/web-server:latest
          imagePullPolicy: IfNotPresent
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 10"]
```

### 7.5.3 成本失控

**问题描述**：弹性伸缩导致集群资源无限制增长，月底账单远超预算。

**风险来源**：
- HPA 的 `maxReplicas` 设置过大
- CA 的节点池 `max` 设置过大
- 超级节点无限容量导致成本不可控
- 竞价实例被回收后，CA 用按量计费实例替代

**成本控制最佳实践**：

1. **设置资源配额**：

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "100"
    requests.memory: "200Gi"
    limits.cpu: "200"
    limits.memory: "400Gi"
    count/pods: "200"
```

2. **使用 TKE 的弹性伸缩记录**：定期查看 CA 的伸缩历史，分析节点创建和销毁的模式，调整节点池配置。

3. **设置预算告警**：在腾讯云监控中设置费用告警，当集群费用超过阈值时发送通知。

4. **混合使用按量计费和竞价实例**：将稳定的基础负载放在按量计费节点上，弹性负载优先使用竞价实例。

### 7.5.4 本章小结

弹性伸缩是一把双刃剑。配置得当可以大幅提升资源利用率和业务稳定性；配置不当则可能导致服务震荡、成本失控。核心原则是：**伸缩策略应该保守扩容、谨慎缩容**。扩容要快（甚至提前），缩容要慢（留足观察窗口）。同时，务必为关键业务配置 PDB、ResourceQuota 和费用告警，形成完整的弹性伸缩治理体系。

---

## 7.6 总结

本章详细介绍了 TKE 上的四大弹性伸缩组件：

| 组件 | 维度 | 伸缩依据 | 响应方式 | 适用场景 |
|------|------|----------|----------|----------|
| HPA | Pod 副本数 | CPU/内存/自定义指标 | 反应式 | 无状态应用 |
| VPA | Pod 资源规格 | 历史使用数据 | 反应式 | 有状态应用 |
| CA | 节点数 | Pod 调度状态 | 反应式 | 集群资源不足 |
| CronHPA | Pod 副本数 | 时间计划 | 预测式 | 可预见的流量高峰 |

**推荐的生产架构**：

```
                    ┌─────────────────────────────────┐
                    │         CronHPA (预扩容)          │
                    │   08:00 → 20 副本, 22:00 → 5 副本 │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │         HPA (实时微调)            │
                    │   CPU 60% / QPS 500 / 队列深度 1000 │
                    │   min: 3, max: 50               │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │         Deployment/StatefulSet    │
                    └──────────────┬──────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌──────────────┐       ┌──────────────┐       ┌──────────────────┐
   │ CVM 节点池    │       │ CVM 节点池    │       │  超级节点 (EKS)   │
   │ (基础, 5-10)  │       │ (弹性, 0-20)  │       │ (弹性, 0-∞)      │
   │ 按量计费      │       │ 竞价实例      │       │ 按 Pod 计费       │
   └──────────────┘       └──────────────┘       └──────────────────┘
                                   │
                          ┌────────▼────────┐
                          │  Cluster Autoscaler │
                          │  (节点自动扩缩容)   │
                          └─────────────────┘
```

**核心原则回顾**：

1. **预测 + 反应结合**：CronHPA 做预测式预扩容，HPA 做反应式微调。
2. **保守缩容**：缩容的稳定窗口要长于扩容，避免震荡。
3. **成本可控**：设置 ResourceQuota、节点池上限和费用告警。
4. **容量规划**：即使有弹性伸缩，也应该做基础的容量规划，确保核心业务在极端情况下有保底资源。
5. **持续观察**：弹性伸缩策略不是一劳永逸的，需要根据业务流量变化持续调整。

弹性伸缩的终极目标是：**让应用始终拥有恰如其分的资源，不多不少，不早不晚**。希望本章的内容能帮助你在 TKE 上构建出既经济又可靠的弹性架构。
