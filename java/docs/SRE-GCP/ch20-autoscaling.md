# 第 20 章 自动扩缩容策略

## 20.1 为什么自动扩缩容很重要？

### 一个故事：高峰期的手忙脚乱

某电商平台的促销活动即将开始。运维团队提前手动增加了 20 台服务器——担心流量太大扛不住。

活动开始了，流量确实很大——但比预期小得多。20 台额外服务器中只有 5 台真正用上了，另外 15 台在空转，白白浪费了成本。

而另一个服务因为没有提前扩容，在流量高峰时 CPU 飙升到 95%，请求超时率大幅上升。

**教训：** 手动扩缩容要么过度预配（浪费成本），要么预配不足（影响可用性）。自动扩缩容让系统根据实际负载动态调整资源。

### 自动扩缩容的价值

- **成本优化**：低负载时自动缩减，不为闲置资源付费
- **性能保障**：高负载时自动扩展，确保服务稳定
- **减少人力**：不需要人工判断何时扩容
- **快速响应**：秒级响应负载变化，比人工快得多

---

## 20.2 GCP 上的自动扩缩容方案

### 三种计算服务的扩缩容方式

| 服务 | 扩缩容方式 | 响应速度 | 适用场景 |
|------|-----------|---------|---------|
| Compute Engine MIG | 基于 CPU/负载均衡/自定义指标 | 分钟级 | 虚拟机集群 |
| GKE (HPA) | 基于 CPU/内存/自定义指标 | 秒级 | Pod 副本数 |
| GKE (Cluster Autoscaler) | 基于 Pod 调度需求 | 分钟级 | 节点数 |
| Cloud Run | 自动（基于请求数） | 秒级 | 无服务器 |

---

## 20.3 Compute Engine MIG 自动扩缩容

### 配置基于 CPU 的自动扩缩容

```bash
# 创建托管实例组并配置自动扩缩容
gcloud compute instance-groups managed create web-mig \
    --base-instance-name web \
    --template web-template \
    --size 3 \
    --zones us-central1-a,us-central1-b,us-central1-c

# 配置自动扩缩容
gcloud compute instance-groups managed set-autoscaling web-mig \
    --region us-central1 \
    --min-num-replicas 3 \
    --max-num-replicas 10 \
    --target-cpu-utilization 0.7 \
    --cool-down-period 60
```

**参数说明：**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `--min-num-replicas` | 最小实例数 | 2-3（确保基础容量） |
| `--max-num-replicas` | 最大实例数 | 根据预算设定 |
| `--target-cpu-utilization` | 目标 CPU 利用率 | 0.6-0.8 |
| `--cool-down-period` | 冷却时间（秒） | 60-120 |

### 配置基于负载均衡的自动扩缩容

```bash
# 基于 LB 请求量的扩缩容
gcloud compute instance-groups managed set-autoscaling web-mig \
    --region us-central1 \
    --min-num-replicas 3 \
    --max-num-replicas 20 \
    --target-load-balancing-utilization 0.8 \
    --cool-down-period 90
```

### 配置基于自定义指标的扩缩容

```bash
# 基于 Cloud Monitoring 自定义指标
gcloud compute instance-groups managed set-autoscaling web-mig \
    --region us-central1 \
    --min-num-replicas 2 \
    --max-num-replicas 15 \
    --update-stackdriver-metric \
    --stackdriver-metric "custom.googleapis.com/app/queue_depth" \
    --stackdriver-metric-utilization-target 100 \
    --stackdriver-metric-utilization-target-type GAUGE
```

### 扩缩容策略选择

| 指标类型 | 优点 | 缺点 | 适用场景 |
|---------|------|------|---------|
| CPU 使用率 | 配置简单 | 不是所有应用都 CPU 敏感 | CPU 密集型的 Web 服务 |
| LB 使用率 | 直接反映流量 | 依赖健康检查 | 负载均衡后的服务 |
| 自定义指标 | 精确反映负载 | 需要额外配置 | 需要精确控制的场景 |

---

## 20.4 GKE 自动扩缩容三层架构

### HPA（Horizontal Pod Autoscaler）

HPA 根据 Pod 的 CPU、内存或自定义指标自动调整 Pod 副本数。

```yaml
# hpa-cpu.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-server-hpa
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
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**基于自定义指标的 HPA：**

```yaml
# hpa-custom.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-server-hpa-custom
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  minReplicas: 2
  maxReplicas: 15
  metrics:
  - type: Pods
    pods:
      metric:
        name: app_requests_per_second
      target:
        type: AverageValue
        averageValue: 1000
```

**HPA 的行为配置：**

```yaml
# hpa-behavior.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-server-hpa
spec:
  minReplicas: 3
  maxReplicas: 20
  behavior:
    # 扩容策略：快速扩容
    scaleUp:
      stabilizationWindowSeconds: 0  # 不需要等待稳定
      policies:
      - type: Percent
        value: 100  # 每秒最多扩容 100%
        periodSeconds: 15
      - type: Pods
        value: 4    # 每秒最多增加 4 个 Pod
        periodSeconds: 15
      selectPolicy: Max  # 选择更大的值
    # 缩容策略：缓慢缩容
    scaleDown:
      stabilizationWindowSeconds: 300  # 等待 5 分钟稳定
      policies:
      - type: Percent
        value: 10   # 每秒最多缩容 10%
        periodSeconds: 60
      selectPolicy: Min  # 选择更小的值
```

### VPA（Vertical Pod Autoscaler）

VPA 自动调整 Pod 的 CPU 和内存请求值——让 Pod "吃得刚刚好"。

```yaml
# vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: web-server-vpa
spec:
  targetRef:
    apiVersion: "apps/v1"
    kind: Deployment
    name: web-server
  updatePolicy:
    updateMode: "Auto"  # 自动更新资源请求
  resourcePolicy:
    containerPolicies:
    - containerName: '*'
      minAllowed:
        cpu: "100m"
        memory: "128Mi"
      maxAllowed:
        cpu: "2"
        memory: "4Gi"
```

**VPA 的三种更新模式：**

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| Off | 只提供建议，不自动修改 | 先查看建议值 |
| Initial | 只在 Pod 创建时设置 | 新部署的服务 |
| Auto | 自动更新，Pod 会重建 | 稳定的生产服务 |

### Cluster Autoscaler

Cluster Autoscaler 在节点资源不足时自动添加节点，在空闲时自动移除。

```bash
# 创建集群时启用 Cluster Autoscaler
gcloud container clusters create prod-cluster \
    --region us-central1 \
    --enable-autoscaling \
    --min-nodes 3 \
    --max-nodes 20 \
    --node-locations us-central1-a,us-central1-b,us-central1-c

# 在现有集群上启用
gcloud container clusters update prod-cluster \
    --region us-central1 \
    --enable-autoscaling \
    --min-nodes 3 \
    --max-nodes 20
```

### 三层扩缩容的协作流程

```
1. HPA 检测到 Pod CPU > 70%
2. HPA 增加 Pod 副本数
3. 新 Pod 因为资源不足而 Pending
4. Cluster Autoscaler 检测到 Pending Pod
5. Cluster Autoscaler 添加新的节点
6. 新节点就绪，Pod 被调度到新节点
7. 负载降低后，HPA 缩减 Pod
8. Pod 缩减后，节点利用率下降
9. Cluster Autoscaler 移除空闲节点
```

---

## 20.5 自定义指标扩缩容

### 使用 Prometheus Adapter

```yaml
# prometheus-adapter.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: adapter-config
  namespace: custom-metrics
data:
  config.yaml: |
    rules:
    - seriesQuery: 'app_requests_total{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace: {resource: "namespace"}
          pod: {resource: "pod"}
      name:
        matches: "app_requests_total"
        as: "app_requests_per_second"
      metricsQuery: 'sum(rate(app_requests_total{<<.LabelMatchers>>}[1m])) by (<<.GroupBy>>)'
```

### 基于 Prometheus 指标的 HPA

```yaml
# hpa-prometheus.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Pods
    pods:
      metric:
        name: app_requests_per_second
      target:
        type: AverageValue
        averageValue: 500
```

---

## 20.6 一个场景：促销活动的自动扩缩容配置

### 需求

某电商平台即将进行促销活动。预期流量会增长 3-5 倍，但具体时间不确定。

### 配置方案

```yaml
# promotion-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: shop-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: shop-api
  minReplicas: 5          # 比平时多，预热一部分容量
  maxReplicas: 50         # 给促销留出足够的扩展空间
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60  # 更敏感的扩缩容阈值
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0   # 立即扩容
      policies:
      - type: Percent
        value: 200
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 600 # 促销结束后缓慢缩容
      policies:
      - type: Percent
        value: 10
        periodSeconds: 300
```

### 促销前的预热

```bash
# 促销前 1 小时，手动增加最小 Pod 数
kubectl scale deployment shop-api --replicas=10

# 促销结束后，恢复自动扩缩容的配置
kubectl apply -f normal-hpa.yaml
```

---

## 20.7 反模式：自动扩缩容中的常见错误

### 反模式一：扩缩容阈值设置不当

**表现**：CPU 阈值设得太低（50%）导致频繁扩容；或者设得太高（95%）导致扩容来不及。

**正确的做法**：根据应用特性设置合理的阈值。Web 应用通常 60-80% 比较合适。

### 反模式二：没有设置最大实例数

**表现**：HPA 的 `maxReplicas` 设得过高或没有设置。

**后果**：突发流量导致 Pod 数量无限增长，成本失控。

**正确的做法**：根据预算和业务需求设置合理的 `maxReplicas`。

### 反模式三：缩容太快导致抖动

**表现**：负载稍微下降就立即缩容，负载回升又马上扩容。

**后果**：Pod 频繁创建和删除，造成性能抖动和成本浪费。

**正确的做法**：设置合理的 stabilizationWindow，让缩容更平滑。

### 反模式四：没有预热大流量事件

**表现**：完全依赖自动扩缩容应对促销等大流量事件。

**后果**：扩容速度跟不上流量增长速度，用户请求超时。

**正确的做法**：对于已知的大流量事件，提前增加基础容量。

---

## 20.8 速查总结

### 扩缩容配置速查

| 服务 | 组件 | 指标 | 响应速度 | 配置方式 |
|------|------|------|---------|---------|
| MIG | Autoscaler | CPU/LB/自定义 | 分钟级 | gcloud |
| GKE | HPA | CPU/内存/自定义 | 秒级 | YAML |
| GKE | VPA | CPU/内存 | 分钟级 | YAML |
| GKE | Cluster Autoscaler | 调度需求 | 分钟级 | gcloud |
| Cloud Run | 内置 | 请求数 | 秒级 | gcloud |

### 扩缩容行为建议

| 场景 | 扩容策略 | 缩容策略 |
|------|---------|---------|
| Web API 服务 | 快速扩容，稳定窗口 0 | 慢速缩容，稳定窗口 300s |
| 批处理任务 | 快速扩容，稳定窗口 0 | 快速缩容，稳定窗口 60s |
| 数据库 | 慢速扩容，稳定窗口 120s | 极慢缩容，稳定窗口 600s |

### 每周扩缩容检查清单

- [ ] HPA 是否正常工作？Pod 副本数是否合理？
- [ ] Cluster Autoscaler 是否正常？节点数是否合理？
- [ ] 扩缩容行为是否平滑？有没有频繁抖动？
- [ ] 最大/最小实例数是否需要调整？
- [ ] 是否有即将到来的大流量事件需要预热？

---

> **下一章预告：** 自动扩缩容让我们在性能上"刚刚好"，但成本上呢？第 21 章将介绍 FinOps 成本优化——如何利用 GCP 的成本分析工具和优化策略，让每一分钱都花在刀刃上。