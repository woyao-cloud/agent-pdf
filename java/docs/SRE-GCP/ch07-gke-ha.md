# 第 7 章 GKE 高可用设计

## 7.1 为什么 GKE 高可用设计很重要？

### 一个故事：单节点池的教训

某团队将生产环境部署在 GKE 上，但所有节点都在同一个节点池中，且节点池只分布在两个 Zone 中。

一天，其中一个 Zone 发生网络故障，该 Zone 中的所有节点都变成了 `NotReady` 状态。由于 Pod 的反亲和性配置，部分应用的多个副本被调度到了同一个 Zone 中——结果这些应用的所有副本同时不可用。

更糟糕的是，由于 Cluster Autoscaler 没有配置跨 Zone 的节点池，故障 Zone 中的工作负载无法被调度到其他 Zone 中。

**教训：** GKE 的高可用不是默认就有的——你需要主动配置。

### GKE 高可用的三个层次

GKE 的高可用设计可以分为三个层次：

| 层次 | 范围 | 目标 | 关键配置 |
|------|------|------|---------|
| Pod 级别 | 单个集群内 | 应用副本不集中在同一节点/Zone | 反亲和性、拓扑分布约束 |
| 节点级别 | 单个集群内 | 节点资源充足，故障时自动补充 | 多 Zone 节点池、Cluster Autoscaler |
| 集群级别 | 跨 Region | 整个集群故障时流量切换 | 多集群部署、全局负载均衡 |

---

## 7.2 Pod 级别的高可用

### 反亲和性（Pod Anti-Affinity）

反亲和性确保同一个应用的多个 Pod 不会调度到同一个节点上。

```yaml
# pod-anti-affinity.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      affinity:
        podAntiAffinity:
          # 硬性要求：必须调度到不同节点
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - payment-service
            topologyKey: "kubernetes.io/hostname"
      containers:
      - name: payment-service
        image: gcr.io/my-project/payment-service:latest
```

**两种模式：**

| 模式 | 关键字 | 行为 | 适用场景 |
|------|--------|------|---------|
| 硬性（Required） | `requiredDuringScheduling` | 必须满足，否则不调度 | 关键服务，必须隔离 |
| 软性（Preferred） | `preferredDuringScheduling` | 尽量满足，不强制 | 一般服务，优先隔离 |

### 拓扑分布约束（Topology Spread Constraints）

拓扑分布约束比反亲和性更强大——它确保 Pod 在更广泛的拓扑域（如 Zone）中均匀分布。

```yaml
# topology-spread.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 6
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      topologySpreadConstraints:
      # 在 Zone 级别均匀分布
      - maxSkew: 1
        topologyKey: "topology.kubernetes.io/zone"
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: payment-service
      # 在节点级别均匀分布
      - maxSkew: 1
        topologyKey: "kubernetes.io/hostname"
        whenUnsatisfifiable: ScheduleAnyway
        labelSelector:
          matchLabels:
            app: payment-service
      containers:
      - name: payment-service
        image: gcr.io/my-project/payment-service:latest
```

**参数说明：**

| 参数 | 含义 | 示例 |
|------|------|------|
| `maxSkew` | 最大不均衡度 | 1 表示每个 Zone 的 Pod 数量差不超过 1 |
| `topologyKey` | 拓扑域 | `topology.kubernetes.io/zone` 表示按 Zone 分布 |
| `whenUnsatisfiable` | 不满足时的行为 | `DoNotSchedule` 不调度 / `ScheduleAnyway` 尽量 |

### Pod  disruption Budget（PDB）

PDB 确保在进行节点维护或升级时，不会同时中断太多 Pod。

```yaml
# pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payment-service-pdb
spec:
  minAvailable: 2  # 至少保持 2 个 Pod 可用
  selector:
    matchLabels:
      app: payment-service
```

**配置建议：**

| 服务类型 | PDB 配置 | 说明 |
|---------|---------|------|
| 关键服务 | `minAvailable: 80%` | 最多允许 20% 的 Pod 同时中断 |
| 一般服务 | `minAvailable: 50%` | 最多允许 50% 的 Pod 同时中断 |
| 批处理任务 | 不配置 PDB | 中断后可以重新调度 |

---

## 7.3 节点级别的高可用

### 多 Zone 节点池

创建跨多个 Zone 的节点池，确保即使一个 Zone 故障，其他 Zone 的节点仍然可用。

```bash
# 创建跨 3 个 Zone 的 GKE 集群
gcloud container clusters create prod-cluster \
    --region us-central1 \
    --node-locations us-central1-a,us-central1-b,us-central1-c \
    --num-nodes 3 \
    --machine-type e2-standard-4 \
    --enable-autoscaling \
    --min-nodes 1 \
    --max-nodes 10
```

**节点池设计建议：**

```bash
# 通用工作负载节点池
gcloud container node-pools create general-pool \
    --cluster prod-cluster \
    --region us-central1 \
    --node-locations us-central1-a,us-central1-b,us-central1-c \
    --machine-type e2-standard-4 \
    --num-nodes 3 \
    --enable-autoscaling \
    --min-nodes 1 \
    --max-nodes 20

# 高内存工作负载节点池
gcloud container node-pools create high-memory-pool \
    --cluster prod-cluster \
    --region us-central1 \
    --node-locations us-central1-a,us-central1-b \
    --machine-type e2-highmem-8 \
    --num-nodes 2 \
    --enable-autoscaling \
    --min-nodes 1 \
    --max-nodes 10

# Spot 实例节点池（用于批处理任务）
gcloud container node-pools create spot-pool \
    --cluster prod-cluster \
    --region us-central1 \
    --node-locations us-central1-a,us-central1-b,us-central1-c \
    --machine-type e2-standard-4 \
    --num-nodes 2 \
    --spot \
    --enable-autoscaling \
    --min-nodes 0 \
    --max-nodes 50
```

### Cluster Autoscaler

Cluster Autoscaler 在节点资源不足时自动添加节点，在节点空闲时自动移除。

```bash
# 在现有集群上启用 Cluster Autoscaler
gcloud container clusters update prod-cluster \
    --region us-central1 \
    --enable-autoscaling \
    --min-nodes 3 \
    --max-nodes 30
```

**Cluster Autoscaler 的工作原理：**

```
1. Pod 处于 Pending 状态（资源不足）
2. Cluster Autoscaler 检测到无法调度的 Pod
3. 触发节点池扩容，创建新节点
4. 新节点加入集群，Pod 被调度
5. 负载降低后，节点利用率下降
6. Cluster Autoscaler 检测到空闲节点
7. 将 Pod 重新调度到其他节点
8. 移除空闲节点
```

**注意事项：**

- Cluster Autoscaler 不会在节点上有非镜像拉取的 Pod 时移除该节点
- 节点移除前会先执行 `kubectl drain`，确保 Pod 被优雅驱逐
- 建议设置 `--max-nodes` 防止无限扩展导致成本失控

### 节点自动修复（Node Auto-Repair）

GKE 会自动检测不健康的节点并进行修复。

```bash
# 启用节点自动修复
gcloud container node-pools update general-pool \
    --cluster prod-cluster \
    --region us-central1 \
    --enable-autorepair
```

**节点健康检查包括：**
- 节点状态是否为 `Ready`
- 节点是否能够正常调度 Pod
- 节点上的 kubelet 是否正常运行
- 节点磁盘空间是否充足

---

## 7.4 集群级别的高可用

### 多集群部署架构

对于关键业务应用，考虑在多个 Region 部署 GKE 集群，通过全局负载均衡器分发流量。

```
                    ┌──────────────────────┐
                    │  Global HTTP(S)      │
                    │  Load Balancer       │
                    └──────┬───────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
   ┌───────┴───────┐ ┌─────┴───────┐ ┌─────┴───────┐
   │ us-central1   │ │ europe-west1│ │asia-east1   │
   │ GKE Cluster  │ │ GKE Cluster │ │ GKE Cluster │
   │ (Primary)     │ │ (Secondary) │ │(Secondary)  │
   └───────┬───────┘ └─────┬───────┘ └─────┬───────┘
           │               │               │
   ┌───────┴───────┐ ┌─────┴───────┐ ┌─────┴───────┐
   │ 3 Zones       │ │ 3 Zones     │ │ 3 Zones     │
   │ 3 Node Pools  │ │ 3 Node Pools│ │ 3 Node Pools│
   └───────────────┘ └─────────────┘ └─────────────┘
```

### 多集群 Service 的配置

```yaml
# multi-cluster-service.yaml
# 在第一个集群中部署
apiVersion: v1
kind: Service
metadata:
  name: payment-service
  annotations:
    cloud.google.com/neg: '{"ingress": true}'
spec:
  type: ClusterIP
  selector:
    app: payment-service
  ports:
  - port: 8080
    targetPort: 8080
```

```yaml
# ingress.yaml
# 全局负载均衡器配置
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: global-ingress
  annotations:
    kubernetes.io/ingress.global-static-ip-name: "global-lb-ip"
    networking.gke.io/managed-certificates: "prod-certificate"
spec:
  defaultBackend:
    service:
      name: payment-service
      port:
        number: 8080
```

### 跨集群流量管理

在多集群部署中，你需要考虑流量如何分发：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| 就近路由 | 用户流量路由到最近的 Region | 全球用户，延迟敏感 |
| 主备模式 | 主集群处理所有流量，备集群 standby | 主 Region 故障时切换 |
| 多活模式 | 所有集群同时处理流量 | 高可用要求极高 |

**多活模式的 DNS 配置：**

```bash
# 使用 Cloud DNS 配置基于地理位置的 DNS
gcloud dns record-sets create payment.example.com \
    --zone=example-zone \
    --type=A \
    --routing-policy=geo \
    --routing-policy-data="us-central1=34.1.2.3;europe-west1=34.4.5.6;asia-east1=34.7.8.9" \
    --ttl=60
```

---

## 7.5 一个完整场景：GKE 高可用配置实战

### 需求

某金融科技公司需要部署一个支付服务，要求：
- 可用性 ≥ 99.99%
- 单 Zone 故障不影响服务
- 单 Region 故障时 5 分钟内切换到其他 Region

### 架构设计

```
全球 HTTP(S) 负载均衡器
        │
├─────────────────────┬─────────────────────┤
us-central1          europe-west1         asia-east1
│                     │                     │
├───────────────┐    ├───────────────┐    ├───────────────┐
│ Zone a,b,c    │    │ Zone a,b,c    │    │ Zone a,b,c    │
│ 3 节点池      │    │ 3 节点池      │    │ 3 节点池      │
│ 6 个 Pod      │    │ 3 个 Pod      │    │ 3 个 Pod      │
└───────────────┘    └───────────────┘    └───────────────┘
```

### 配置步骤

**第一步：创建集群**

```bash
# us-central1 主集群
gcloud container clusters create payment-us \
    --region us-central1 \
    --node-locations us-central1-a,us-central1-b,us-central1-c \
    --num-nodes 3 \
    --machine-type e2-standard-4 \
    --enable-autoscaling \
    --min-nodes 3 \
    --max-nodes 20 \
    --enable-autorepair \
    --enable-autoupgrade

# europe-west1 备用集群
gcloud container clusters create payment-eu \
    --region europe-west1 \
    --node-locations europe-west1-b,europe-west1-c,europe-west1-d \
    --num-nodes 2 \
    --machine-type e2-standard-4 \
    --enable-autoscaling \
    --min-nodes 2 \
    --max-nodes 10
```

**第二步：部署应用**

```yaml
# payment-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 6
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: "topology.kubernetes.io/zone"
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: payment-service
      containers:
      - name: payment-service
        image: gcr.io/my-project/payment-service:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "1Gi"
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 15
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payment-service-pdb
spec:
  minAvailable: 4
  selector:
    matchLabels:
      app: payment-service
```

**第三步：配置全局负载均衡器**

```bash
# 创建全局静态 IP
gcloud compute addresses create global-lb-ip \
    --global

# 创建 NEG（Network Endpoint Group）
gcloud compute network-endpoint-groups create payment-neg-us \
    --region us-central1 \
    --network-endpoint-type GCE_VM_IP_PORT

gcloud compute network-endpoint-groups create payment-neg-eu \
    --region europe-west1 \
    --network-endpoint-type GCE_VM_IP_PORT
```

**第四步：配置健康检查和故障切换**

```yaml
# 健康检查配置
gcloud compute health-checks create http payment-health-check \
    --request-path /healthz \
    --port 8080 \
    --check-interval 10 \
    --timeout 5 \
    --unhealthy-threshold 3 \
    --healthy-threshold 2
```

### 故障模拟

**场景：us-central1 的一个 Zone 故障**

1. 该 Zone 中的节点变为 `NotReady`
2. 节点上的 Pod 被驱逐，状态变为 `Unknown`
3. GKE 在其他 Zone 的健康节点上重新创建 Pod
4. 负载均衡器的健康检查检测到故障 Zone 的 Pod 不健康
5. 流量自动路由到其他 Zone 的健康 Pod
6. 整个过程在 1-2 分钟内完成，用户无感知

---

## 7.6 反模式：GKE 高可用中的常见错误

### 反模式一：所有节点在同一个 Zone

**表现**：GKE 集群的所有节点都在同一个 Zone 中。

**后果**：该 Zone 故障时，整个集群不可用。

**正确的做法**：至少将节点分布到 3 个 Zone 中。

### 反模式二：没有配置 PDB

**表现**：没有为关键服务配置 PodDisruptionBudget。

**后果**：节点升级或维护时，所有 Pod 可能同时被驱逐，导致服务中断。

**正确的做法**：为所有关键服务配置 PDB，确保至少有一定数量的 Pod 始终可用。

### 反模式三：Cluster Autoscaler 没有上限

**表现**：Cluster Autoscaler 的 `--max-nodes` 设置得过高或没有设置。

**后果**：突发流量导致集群无限扩展，月底收到天价账单。

**正确的做法**：根据预算和业务需求设置合理的 `--max-nodes` 值。

### 反模式四：多集群但没有流量管理

**表现**：部署了多个集群，但没有配置全局负载均衡器或 DNS 故障切换。

**后果**：主集群故障时，流量不会自动切换到备用集群。

**正确的做法**：使用全局负载均衡器或 Cloud DNS 的地理位置路由，实现自动故障切换。

---

## 7.7 速查总结

### GKE 高可用配置清单

| 层次 | 配置项 | 建议值 | 作用 |
|------|--------|-------|------|
| Pod | 反亲和性 | `requiredDuringScheduling` | 防止 Pod 集中在同一节点 |
| Pod | 拓扑分布约束 | `maxSkew: 1` | 确保 Pod 均匀分布到 Zone |
| Pod | PDB | `minAvailable: 80%` | 防止同时中断过多 Pod |
| 节点 | 多 Zone 节点池 | 至少 3 个 Zone | 单 Zone 故障不影响 |
| 节点 | Cluster Autoscaler | 按需配置 | 自动扩缩容 |
| 节点 | 节点自动修复 | 启用 | 自动修复不健康节点 |
| 集群 | 多集群部署 | 至少 2 个 Region | 单 Region 故障不影响 |
| 集群 | 全局负载均衡器 | 配置健康检查 | 自动故障切换 |

### 常用命令速查

```bash
# 查看 Pod 分布
kubectl top pods -A
kubectl get pods -o wide

# 查看节点状态
kubectl get nodes -o wide
kubectl describe node <node-name>

# 查看集群事件
kubectl get events -A --sort-by='.lastTimestamp'

# 查看 Pod 调度情况
kubectl describe pod <pod-name> | grep -A 5 "Events"

# 测试 Pod 反亲和性
kubectl get pods -l app=payment-service -o wide
```

### 每周 GKE 健康检查清单

- [ ] 所有节点是否都是 `Ready` 状态？
- [ ] 所有 Pod 是否都在正常运行？
- [ ] 节点资源使用率是否在合理范围？
- [ ] Cluster Autoscaler 是否正常工作？
- [ ] 是否有 Pending 状态的 Pod？
- [ ] 最近的集群事件是否有异常？

---

> **下一章预告：** 计算层的高可用设计好了，接下来我们需要确保网络层也是高可用的。第 8 章将介绍 GCP 的 VPC 网络设计模式，包括共享 VPC、VPC 对等连接和混合云网络连接。
