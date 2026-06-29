# 第七章 TKE 高可用部署实战

## 7.1 引言

在云原生时代，Kubernetes 已成为事实上的容器编排标准。腾讯云 TKE（Tencent Kubernetes Engine）作为腾讯云提供的托管 Kubernetes 服务，承担了海量业务的容器化运行责任。生产环境中，集群的高可用性（High Availability, HA）不再是可选项，而是必须满足的 SLA 基线。本章将从架构设计、节点分布、调度策略、弹性伸缩、Serverless 架构以及版本升级六个维度，系统性地阐述如何在 TKE 上构建高可用的容器化工作负载。

---

## 7.2 TKE 集群架构概览

### 7.2.1 托管 Master 架构

TKE 提供两种集群模式：**托管集群** 和 **独立集群**。

- **托管集群**：Master 组件（kube-apiserver、kube-controller-manager、kube-scheduler、etcd）由腾讯云托管，分布在三个可用区（AZ），每个组件均为多副本部署，腾讯云负责其监控、备份与故障恢复。用户只需关注 Worker 节点与业务负载。
- **独立集群**：Master 由用户自行管理，部署在用户购买的 CVM 上，用户拥有完全控制权，但需要自行承担 Master 的高可用运维成本。

**生产环境强烈推荐使用托管集群**。托管 Master 的 SLA 为 99.95%，etcd 数据自动跨 AZ 冗余存储，且腾讯云会定期对 etcd 进行自动快照备份，备份保留 7 天。

### 7.2.2 集群网络模型

TKE 默认采用 **Global Router** 网络模式，VPC 内所有 Pod 与节点同网段，Pod 直接通过 VPC 路由通信，性能损耗极低。对于大规模集群（节点数 > 200），推荐使用 **VPC-CNI** 模式，该模式为每个 Pod 分配 VPC 弹性网卡（ENI）的独立 IP，彻底解决 IP 耗尽问题，同时支持网络策略（NetworkPolicy）和 Trunk ENI 特性。

```
┌─────────────────────────────────────────────────────────┐
│                     VPC (10.0.0.0/16)                    │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  AZ-A     │  │  AZ-B     │  │  AZ-C     │            │
│  │  ┌──────┐ │  │  ┌──────┐ │  │  ┌──────┐ │            │
│  │  │Node-1│ │  │  │Node-2│ │  │  │Node-3│ │            │
│  │  │Pod   │ │  │  │Pod   │ │  │  │Pod   │ │            │
│  │  └──────┘ │  │  └──────┘ │  │  └──────┘ │            │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │          托管 Master (跨 AZ 三副本)               │   │
│  │  kube-apiserver  │  etcd  │  controller-manager  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 7.2.3 高可用设计原则

在 TKE 上构建高可用架构，需要遵循以下核心原则：

1. **消除单点故障**：所有组件至少部署 3 副本，分散到不同可用区。
2. **故障隔离**：通过节点池、亲和性规则将不同服务隔离，避免级联故障。
3. **优雅降级**：通过 PDB（PodDisruptionBudget）确保主动运维操作不导致服务完全中断。
4. **弹性自愈**：配置 HPA 和 Cluster Autoscaler，实现负载驱动下的自动扩缩容。
5. **可观测性**：完善的监控、日志、告警体系，确保故障可发现、可定位。

---

## 7.3 多可用区节点分布

### 7.3.1 节点池设计

TKE 的 **节点池（Node Pool）** 是管理一组具有相同配置的节点的抽象。每个节点池可以绑定到特定的可用区，并关联特定的实例类型、数据盘大小、安全组和标签。

**生产环境节点池规划建议：**

| 节点池名称 | 可用区 | 实例类型 | 用途 | 是否开启弹性伸缩 |
|-----------|--------|---------|------|---------------|
| pool-std-a | ap-guangzhou-3 | S5.4XLARGE64 | 标准在线服务 | 是 |
| pool-std-b | ap-guangzhou-4 | S5.4XLARGE64 | 标准在线服务 | 是 |
| pool-std-c | ap-guangzhou-5 | S5.4XLARGE64 | 标准在线服务 | 是 |
| pool-cpu-heavy | ap-guangzhou-3 | S5.8XLARGE128 | CPU 密集型任务 | 是 |
| pool-gpu | ap-guangzhou-3 | GN10Xp.2XLARGE40 | GPU 推理任务 | 否 |

每个可用区至少一个节点池，确保即使某个 AZ 完全不可用，其余 AZ 的节点池仍能承载业务流量。

### 7.3.2 多 AZ 部署策略

在 TKE 控制台创建节点池时，需要为每个节点池指定 `failure-domain.beta.kubernetes.io/zone` 标签。Kubernetes 调度器会根据该标签将 Pod 调度到不同可用区的节点上。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-server
  namespace: production
spec:
  replicas: 6
  selector:
    matchLabels:
      app: web-server
  template:
    metadata:
      labels:
        app: web-server
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: web-server
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: web-server
      containers:
        - name: nginx
          image: nginx:1.25-alpine
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
          readinessProbe:
            httpGet:
              path: /healthz
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /healthz
              port: 80
            initialDelaySeconds: 15
            periodSeconds: 20
```

`topologySpreadConstraints` 是 Kubernetes 1.19+ 提供的 Pod 拓扑分布约束。上述配置实现了两层约束：

- **AZ 级别**：`topology.kubernetes.io/zone`，6 个副本在 3 个 AZ 间均匀分布，每个 AZ 最多 2 个 Pod（maxSkew=1）。
- **节点级别**：`kubernetes.io/hostname`，同一节点上最多 1 个 Pod，避免单点故障。

### 7.3.3 节点亲和性与反亲和性

对于有状态服务或需要与特定基础设施耦合的组件，可以使用节点亲和性（Node Affinity）来精确控制调度目标。

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: node.kubernetes.io/instance-type
                operator: In
                values:
                  - S5.4XLARGE64
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          preference:
            matchExpressions:
              - key: topology.kubernetes.io/zone
                operator: In
                values:
                  - ap-guangzhou-3
```

`requiredDuringSchedulingIgnoredDuringExecution` 是硬约束，Pod 必须调度到满足条件的节点上；`preferredDuringSchedulingIgnoredDuringExecution` 是软约束，调度器会尽量满足但不保证。

---

## 7.4 Pod 反亲和性与 PodDisruptionBudget

### 7.4.1 Pod 反亲和性

Pod 反亲和性（Pod Anti-Affinity）确保同一服务的多个副本不会调度到同一节点或同一可用区，是保障高可用的关键手段。

```yaml
spec:
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchExpressions:
                - key: app
                  operator: In
                  values:
                    - web-server
            topologyKey: topology.kubernetes.io/zone
        - weight: 50
          podAffinityTerm:
            labelSelector:
              matchExpressions:
                - key: app
                  operator: In
                  values:
                    - web-server
            topologyKey: kubernetes.io/hostname
```

**硬反亲和 vs 软反亲和：**

- `requiredDuringSchedulingIgnoredDuringExecution`：硬约束，Pod 必须分散部署。当集群资源不足时，可能导致 Pod 无法调度（Pending）。适用于副本数 <= 节点数的场景。
- `preferredDuringSchedulingIgnoredDuringExecution`：软约束，调度器优先分散部署，但资源不足时可以放宽。适用于大多数生产场景。

**经验法则**：对于在线服务，使用 `preferredDuringSchedulingIgnoredDuringExecution` 配合 `topologySpreadConstraints` 的 `maxSkew: 1`，既保证均匀分布，又避免资源不足时的调度死锁。

### 7.4.2 PodDisruptionBudget

PDB 用于限制主动运维操作（如节点排水、集群升级）中同时中断的 Pod 数量，确保服务在运维期间仍能满足可用性要求。

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-server-pdb
  namespace: production
spec:
  minAvailable: 3
  selector:
    matchLabels:
      app: web-server
```

PDB 支持两种策略：

- **minAvailable**：指定最少可用的 Pod 数量（绝对值或百分比）。例如 `minAvailable: 3` 表示至少保留 3 个 Pod 正常运行。
- **maxUnavailable**：指定最多不可用的 Pod 数量（绝对值或百分比）。例如 `maxUnavailable: 1` 表示最多允许 1 个 Pod 同时不可用。

**PDB 设计原则：**

1. PDB 的值应结合 Deployment 的 replicas 和实际冗余能力设定。对于 6 副本的服务，`minAvailable: 4` 或 `maxUnavailable: 2` 是合理选择。
2. PDB 仅保护主动驱逐（`kubectl drain`、voluntary disruption），不保护节点故障、Pod 崩溃等非自愿中断（involuntary disruption）。
3. 当 PDB 与节点排水冲突时，排水操作会等待 PDB 允许后再继续，可能导致排水卡住。此时需要先调整 PDB 或手动删除 Pod。

### 7.4.3 综合调度策略对比

| 策略 | 作用域 | 保证级别 | 适用场景 |
|------|--------|---------|---------|
| topologySpreadConstraints | 全局拓扑 | 均匀分布 | 所有无状态服务 |
| podAntiAffinity | Pod 间 | 互斥调度 | 关键服务，避免同机 |
| nodeAffinity | 节点属性 | 定向调度 | GPU、高性能实例 |
| PDB | 运维保护 | 最小可用 | 所有生产服务 |

---

## 7.5 HPA + Cluster Autoscaler 弹性伸缩

### 7.5.1 水平 Pod 自动伸缩（HPA）

HPA 根据 CPU、内存或自定义指标自动调整 Deployment 的副本数。

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-server-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  minReplicas: 3
  maxReplicas: 30
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
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
```

**关键参数说明：**

- **stabilizationWindowSeconds**：缩容稳定窗口（300s），防止指标抖动导致频繁扩缩容。
- **scaleDown 策略**：`Percent: 10`，每分钟最多缩容 10% 的 Pod，避免流量突降时过度回收。
- **scaleUp 策略**：`Percent: 100` 与 `Pods: 4` 取最大值（`selectPolicy: Max`），确保快速扩容应对流量洪峰。
- **多指标联合**：CPU 和内存任一指标超过阈值即触发扩容，取两个指标计算出的最大副本数。

### 7.5.2 Cluster Autoscaler（CA）

CA 是 TKE 集群的节点级弹性组件，当集群资源不足导致 Pod 无法调度时，自动扩容节点池；当节点利用率持续低于阈值时，自动缩容节点。

**CA 工作原理：**

```
Pod Pending (资源不足)
       │
       ▼
CA 检测到不可调度 Pod
       │
       ▼
CA 计算所需节点数
       │
       ▼
调用 TKE API 创建 CVM
       │
       ▼
节点加入集群，调度 Pod
```

**CA 配置建议：**

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| 节点池最小规模 | 3（每 AZ 1 个） | 保证基础容量 |
| 节点池最大规模 | 50 | 防止意外扩容失控 |
| 扩容阈值 | 不可调度 Pod 存在 | 默认行为 |
| 缩容阈值 | 节点利用率 < 50% | 持续 10 分钟 |
| 缩容判断间隔 | 10s | 扫描周期 |

**CA 与 HPA 的协同工作流：**

```
流量上升 → HPA 扩容 Pod → 资源不足 → CA 扩容节点 → Pod 调度成功
流量下降 → HPA 缩容 Pod → 节点空闲 → CA 缩容节点 → 成本优化
```

**重要注意事项：**

1. **扩容延迟**：CA 创建 CVM 需要 2-5 分钟，对于延迟敏感的业务，建议预留 20%-30% 的缓冲资源，或使用超级节点（详见 7.6 节）。
2. **缩容保护**：为关键节点添加 `"cluster-autoscaler.kubernetes.io/safe-to-evict": "false"` 注解，防止 CA 缩容该节点。
3. **扩缩容冲突**：避免在同一节点池上同时设置 CA 和手动扩缩容，否则 CA 会不断纠正手动操作。

### 7.5.3 弹性伸缩最佳实践

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: production
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: payment-service:latest
          resources:
            requests:
              cpu: "1"
              memory: "1Gi"
          # 关键：必须设置 resources.requests，HPA 依赖它计算利用率
```

**HPA + CA 黄金法则：**

1. **始终设置 resources.requests**：HPA 的 CPU/内存利用率基于 requests 计算，不设置 requests 会导致 HPA 无法正常工作。
2. **requests 与 limits 的比例**：建议 requests:limits = 1:2 或 1:3，既保证调度密度，又允许突发流量。
3. **避免使用默认值**：显式设置每个容器的 resources，不要依赖 namespace 级别的 LimitRange 默认值。
4. **监控扩缩容事件**：通过 `kubectl describe hpa` 和 CA 日志（TKE 控制台 -> 集群 -> 组件管理）观察扩缩容决策过程。

---

## 7.6 超级节点与 Serverless 集群

### 7.6.1 超级节点架构

超级节点（Super Node）是 TKE 的弹性容器（EKS）基础设施，本质是一个"无限资源"的虚拟节点。Pod 调度到超级节点上时，不再运行在用户管理的 CVM 上，而是运行在腾讯云托管的 EKS 容器实例中。

```
┌──────────────────────────────────────────────┐
│               TKE 集群                        │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 节点池 A  │  │ 节点池 B  │  │ 超级节点    │  │
│  │ (CVM)    │  │ (CVM)    │  │ (EKS)      │  │
│  │ Pod      │  │ Pod      │  │ Pod        │  │
│  └──────────┘  └──────────┘  └────────────┘  │
│                                               │
│  ┌────────────────────────────────────────┐   │
│  │        托管 Master (跨 AZ)              │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 7.6.2 超级节点的优势

| 特性 | 普通节点池 | 超级节点 |
|------|-----------|---------|
| 扩容速度 | 2-5 分钟（创建 CVM） | 10-30 秒（直接启动 Pod） |
| 资源上限 | 节点池最大实例数 | 无上限（按需付费） |
| 运维成本 | 需管理 OS 升级、安全补丁 | 完全托管 |
| 计费粒度 | 按 CVM 实例计费（小时） | 按 Pod 实际运行时长（秒级） |
| 网络模式 | Global Router / VPC-CNI | VPC-CNI（独立 ENI） |

### 7.6.3 超级节点调度策略

通过节点选择器将特定 Pod 调度到超级节点：

```yaml
spec:
  template:
    spec:
      nodeSelector:
        node.kubernetes.io/instance-type: eklet
      tolerations:
        - key: "eks.tke.cloud.tencent.com/eklet"
          operator: "Exists"
          effect: "NoSchedule"
```

**混合部署策略：**

- **稳态业务**：部署在普通节点池，利用预留实例节省成本。
- **弹性业务**：通过 HPA 扩容出的额外副本调度到超级节点，应对突发流量。
- **批处理任务**：直接调度到超级节点，用完即释放，无需管理节点生命周期。

### 7.6.4 Serverless 集群（EKS）

TKE Serverless 集群（EKS）是完全 Serverless 化的 Kubernetes 集群，用户无需管理任何节点，只需提交 Pod 定义即可运行容器。

**适用场景：**

- 开发测试环境：无需维护节点，环境快速搭建和销毁。
- 周期性批处理任务：定时任务运行期间自动创建 Pod，运行结束自动释放。
- 弹性扩容场景：作为普通集群的弹性补充，应对不可预测的流量洪峰。

**EKS 限制：**

- 不支持 DaemonSet（无法管理节点级组件）。
- 不支持 HostNetwork 模式。
- 不支持 privileged 容器。
- 不支持 NodePort 类型 Service（需使用 CLB 直连 Pod）。

### 7.6.5 成本优化策略

```
成本 = 普通节点池（基座） + 超级节点（弹性增量）

基座容量 = 日常峰值 × 0.7（预留 30% 缓冲）
弹性增量 = 实际峰值 - 基座容量
```

通过合理配置 HPA 的 minReplicas 和 CA 的节点池最小规模，确保基座容量被充分利用，弹性部分由超级节点承载，实现成本与弹性的最优平衡。

---

## 7.7 集群升级策略

### 7.7.1 升级风险分析

Kubernetes 版本升级是生产集群最高风险的操作之一。主要风险包括：

1. **API 兼容性**：Kubernetes 在 1.22+ 移除了大量 beta API，升级前需要审计所有资源的 apiVersion。
2. **组件兼容性**：集群附加组件（Ingress Controller、监控组件、日志采集器）可能与新版本不兼容。
3. **节点排水风险**：升级过程中节点需要排水，如果 PDB 配置不当，可能导致服务中断。
4. **etcd 升级风险**：etcd 版本升级涉及数据格式变更，一旦失败恢复困难。

### 7.7.2 TKE 集群升级流程

TKE 托管集群的升级分为两个阶段：

**阶段一：Master 升级**

由腾讯云自动完成，用户只需在 TKE 控制台确认升级版本和时间窗口。Master 组件采用滚动升级策略：

1. 升级 kube-apiserver（多副本滚动，API 始终可用）。
2. 升级 kube-controller-manager 和 kube-scheduler。
3. 升级 etcd（逐节点滚动，确保 quorum 始终存在）。

**阶段二：节点升级**

Master 升级完成后，需要手动或自动升级 Worker 节点。TKE 提供两种节点升级方式：

- **原地升级**：保留节点，仅升级 kubelet 和 kube-proxy 版本。速度快，但无法修复 OS 层面的问题。
- **重装升级**：销毁原节点并创建新节点。可以同时升级 OS 镜像，但需要节点排水，耗时较长。

### 7.7.3 升级前检查清单

```bash
# 1. 检查所有资源的 apiVersion 是否兼容
kubectl get --all-namespaces -o json \
  'customresourcedefinitions.apiextensions.k8s.io' | \
  jq '.items[].spec.versions[].name'

# 2. 检查 PDB 配置是否完整
kubectl get pdb --all-namespaces

# 3. 检查节点状态
kubectl get nodes -o wide

# 4. 检查集群组件状态
kubectl get componentstatuses

# 5. 检查异常 Pod
kubectl get pods --all-namespaces | grep -v Running

# 6. 备份关键资源
kubectl get all --all-namespaces -o yaml > cluster-backup.yaml
```

### 7.7.4 升级策略与回滚方案

**推荐升级策略：**

```
灰度升级 → 金丝雀验证 → 批量升级 → 全量升级
```

1. **灰度升级**：选择非核心节点池（如开发环境节点池），升级 1-2 个节点验证兼容性。
2. **金丝雀验证**：将少量业务流量导入已升级节点，观察 24-48 小时。
3. **批量升级**：按节点池分批升级，每批不超过节点总数的 25%，批次间隔至少 30 分钟。
4. **全量升级**：确认无问题后，完成剩余节点升级。

**回滚方案：**

TKE 支持版本回退，但仅限升级后 72 小时内，且只能回退到升级前的版本。回滚操作同样需要节点排水和重装，风险与升级相当。因此，**升级前的充分验证比回滚能力更重要**。

### 7.7.5 节点排水与 PDB 协同

节点升级过程中的排水操作会触发 PDB 检查：

```
kubectl drain node-xxx --ignore-daemonsets --delete-emptydir-data
```

排水流程：

1. 标记节点为不可调度（NoSchedule）。
2. 逐 Pod 执行驱逐，检查对应 PDB。
3. 如果驱逐 Pod 会导致 PDB 的 minAvailable 不满足，排水操作会阻塞等待。
4. 所有 Pod 驱逐完成后，节点进入升级流程。

**排水超时处理：**

如果排水卡住超过 30 分钟，需要人工介入：

```bash
# 查看卡住的驱逐操作
kubectl get pods --all-namespaces -o wide | grep node-xxx

# 强制忽略 PDB（谨慎使用）
kubectl drain node-xxx --ignore-daemonsets --delete-emptydir-data \
  --disable-eviction=true

# 或直接删除 Pod（确保 PDB 允许）
kubectl delete pod <pod-name> -n <namespace>
```

### 7.7.6 升级后验证

```yaml
# 验证清单
1. 所有节点状态 Ready
2. 所有系统组件正常运行
3. 核心业务 Pod 运行正常
4. 网络策略和 Service 正常
5. 监控和日志采集正常
6. 存储卷挂载正常
7. 自定义资源（CRD）正常
8. 执行端到端业务测试
```

---

## 7.8 综合高可用部署示例

以下是一个完整的高可用部署示例，整合了本章介绍的所有关键技术。

### 7.8.1 命名空间与资源配额

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
---
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
    pods: "200"
```

### 7.8.2 高可用 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
    version: v2.3.1
spec:
  replicas: 6
  revisionHistoryLimit: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 1
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
        version: v2.3.1
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: order-service
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: order-service
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - order-service
                topologyKey: topology.kubernetes.io/zone
      containers:
        - name: order-service
          image: ccr.ccs.tencentyun.com/production/order-service:v2.3.1
          ports:
            - containerPort: 8080
              protocol: TCP
          resources:
            requests:
              cpu: "2"
              memory: "4Gi"
            limits:
              cpu: "4"
              memory: "8Gi"
          env:
            - name: TZ
              value: Asia/Shanghai
            - name: JAVA_OPTS
              value: "-Xms4g -Xmx4g -XX:+UseG1GC"
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 60
            periodSeconds: 20
            timeoutSeconds: 5
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 30
      terminationGracePeriodSeconds: 60
      imagePullSecrets:
        - name: tencent-registry-key
```

### 7.8.3 PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: order-service-pdb
  namespace: production
spec:
  minAvailable: 4
  selector:
    matchLabels:
      app: order-service
```

### 7.8.4 HPA 配置

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 6
  maxReplicas: 50
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 20
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 6
          periodSeconds: 15
      selectPolicy: Max
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
```

### 7.8.5 Service 与 Ingress

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
  annotations:
    service.kubernetes.io/qcloud-loadbalancer-internal-subnetid: subnet-xxxxx
    service.kubernetes.io/qcloud-loadbalancer-backend-label: app=order-service
spec:
  type: LoadBalancer
  ports:
    - port: 8080
      targetPort: 8080
      protocol: TCP
  selector:
    app: order-service
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: order-service-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: qcloud
    ingress.cloud.tencent.com/rewrite: "true"
spec:
  rules:
    - host: order.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 8080
```

---

## 7.9 高可用架构验证

### 7.9.1 故障注入测试

部署完成后，需要通过故障注入验证高可用设计的有效性：

```bash
# 测试 1：节点故障
# 模拟节点宕机
kubectl delete node <node-name>

# 验证：Pod 是否在 5 分钟内迁移到其他节点
kubectl get pods -n production -l app=order-service -o wide

# 测试 2：AZ 故障
# 封锁一个可用区的所有节点
kubectl cordon -l topology.kubernetes.io/zone=ap-guangzhou-3

# 验证：服务是否仍满足 PDB 要求
kubectl get pdb -n production

# 测试 3：Pod 故障
# 删除部分 Pod
kubectl delete pods -n production -l app=order-service --field-selector=status.phase=Running

# 验证：HPA 和 Deployment Controller 是否自动恢复
kubectl get pods -n production -l app=order-service -w
```

### 7.9.2 高可用评分卡

| 检查项 | 标准 | 验证方法 |
|--------|------|---------|
| 多 AZ 部署 | 至少 3 AZ | `kubectl get pods -o wide` 检查分布 |
| PDB 配置 | 所有生产服务已配置 | `kubectl get pdb --all-namespaces` |
| HPA 配置 | 所有无状态服务已配置 | `kubectl get hpa --all-namespaces` |
| 资源限制 | 所有容器已设置 requests/limits | `kubectl describe pod` 检查 resources |
| 健康检查 | 所有容器已配置探针 | `kubectl describe pod` 检查 probes |
| 优雅终止 | terminationGracePeriodSeconds >= 30 | `kubectl get pod -o yaml` 检查 |
| 拓扑分布 | maxSkew <= 1 | 检查 topologySpreadConstraints |
| 节点池冗余 | 每 AZ 至少 1 个节点池 | TKE 控制台检查节点池配置 |

---

## 7.10 常见问题与排障

### 7.10.1 Pod 调度失败

**现象**：Pod 长时间处于 Pending 状态。

**排查步骤**：

```bash
# 查看 Pod 事件
kubectl describe pod <pod-name> -n <namespace>

# 检查节点资源
kubectl top nodes

# 检查节点是否可调度
kubectl get nodes | grep -v Ready

# 检查是否有匹配的节点标签
kubectl get nodes --show-labels | grep <label-key>
```

**常见原因**：

1. 节点资源不足 → 检查 CA 是否正常工作，或手动扩容节点池。
2. 节点选择器不匹配 → 检查 nodeSelector 和 nodeAffinity 配置。
3. 持久卷无法挂载 → 检查 PV/PVC 状态和存储后端。
4. 端口冲突 → 检查 hostPort 配置是否与已有 Pod 冲突。

### 7.10.2 HPA 不生效

**现象**：CPU 利用率已超过阈值，但 HPA 未扩容。

**排查步骤**：

```bash
# 查看 HPA 状态
kubectl describe hpa <hpa-name> -n <namespace>

# 检查 Pod 是否设置了 resources.requests
kubectl get pod <pod-name> -n <namespace> -o yaml | grep resources -A 5

# 检查 metrics-server 是否正常运行
kubectl get pods -n kube-system -l k8s-app=metrics-server
```

**常见原因**：

1. Pod 未设置 `resources.requests` → HPA 无法计算利用率。
2. metrics-server 异常 → 检查 metrics-server Pod 日志。
3. HPA 的 stabilizationWindowSeconds 导致扩容延迟 → 适当缩短窗口时间。

### 7.10.3 节点排水卡住

**现象**：节点升级或缩容时排水操作长时间卡住。

**排查步骤**：

```bash
# 查看节点上的 Pod
kubectl get pods --all-namespaces -o wide | grep <node-name>

# 检查 PDB 是否阻止驱逐
kubectl get pdb --all-namespaces -o yaml | grep -A 10 <pod-label>

# 强制驱逐（谨慎使用）
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data \
  --force --grace-period=30
```

---

## 7.11 总结

本章从六个维度系统性地阐述了 TKE 高可用部署的完整方法论：

1. **架构设计**：托管 Master 跨 AZ 三副本部署，消除控制面单点故障。
2. **多 AZ 节点分布**：通过节点池和 topologySpreadConstraints 实现业务负载的跨可用区均匀分布。
3. **Pod 反亲和与 PDB**：反亲和确保副本物理隔离，PDB 保障运维操作期间的服务可用性。
4. **HPA + CA 弹性伸缩**：Pod 级与节点级双层弹性，应对流量波动的同时控制成本。
5. **超级节点与 Serverless**：作为弹性补充层，提供秒级扩容能力和无限资源池。
6. **集群升级**：灰度验证、分批执行、PDB 协同，将升级风险降至最低。

高可用不是一次性建设，而是一个持续迭代的过程。建议团队建立定期的高可用巡检机制，结合混沌工程定期验证架构的韧性，确保系统在面对真实故障时能够自愈和降级。

---

## 参考资源

- 腾讯云 TKE 官方文档：https://cloud.tencent.com/document/product/457
- Kubernetes 官方文档：https://kubernetes.io/docs/concepts/
- Cluster Autoscaler 文档：https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler
- TKE 超级节点文档：https://cloud.tencent.com/document/product/457/77957
