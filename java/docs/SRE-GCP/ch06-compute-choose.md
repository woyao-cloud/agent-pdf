# 第 6 章 GCP 核心计算服务的选择与设计

## 6.1 三种计算服务，一个决策框架

### 一个故事：选错计算服务的代价

某团队开发了一个新的 API 服务，需要部署到 GCP 上。团队 leader 说："我们用 Compute Engine 吧，最灵活，想怎么配就怎么配。"

于是团队创建了 3 台 n2-standard-4 虚拟机，手动安装了运行环境，部署了应用，配置了负载均衡。整个过程花了 3 天。

3 个月后，团队发现：
- 每台虚拟机的 CPU 使用率平均只有 15%——资源严重浪费
- 每次部署都要手动 SSH 到每台机器上更新代码
- 流量高峰时需要手动创建新的虚拟机
- 每月的计算资源费用比预期高出 40%

如果当初选择了 Cloud Run 或 GKE，这些问题可能根本不会出现。

### GCP 的三种计算服务

GCP 提供了三种主要的计算服务，分别对应不同的抽象层次：

| 服务 | 抽象层次 | 管理责任 | 灵活性 | 适用场景 |
|------|---------|---------|--------|---------|
| **Compute Engine** | IaaS | 你管理 OS 和运行时 | 最高 | 需要完全控制的环境 |
| **GKE** | CaaS/PaaS | 你管理容器和编排 | 中 | 容器化应用 |
| **Cloud Run** | Serverless | 你只管代码 | 最低 | 无状态 HTTP 应用 |

---

## 6.2 Compute Engine：最灵活的虚拟机服务

### 什么是 Compute Engine？

Compute Engine 是 GCP 的 IaaS（基础设施即服务）产品，提供虚拟机实例。你可以完全控制操作系统、网络配置、存储和安全性。

### 适合的场景

- **需要完全控制操作系统和环境**：需要安装特定的内核模块、配置网络参数、使用特定的文件系统
- **有状态应用**：需要本地持久化存储、需要固定的 IP 地址
- **需要 GPU/TPU**：机器学习训练、科学计算、视频渲染
- **需要特定操作系统**：Windows Server、SAP、Oracle 数据库
- **迁移上云（Lift and Shift）**：将现有物理机或虚拟机直接迁移到云上

### SRE 视角下的关键特性

**托管实例组（MIG）**：MIG 是 Compute Engine 实现高可用的关键。它允许你定义一组虚拟机实例，GCP 会负责监控这些实例的健康状态。

```bash
# 创建跨 Zone 的托管实例组
gcloud compute instance-groups managed create web-server-mig \
    --base-instance-name web-server \
    --template web-server-template \
    --size 3 \
    --zones us-central1-a,us-central1-b,us-central1-c

# 配置自动扩缩容（基于 CPU 使用率）
gcloud compute instance-groups managed set-autoscaling web-server-mig \
    --region us-central1 \
    --min-num-replicas 3 \
    --max-num-replicals 10 \
    --target-cpu-utilization 0.7 \
    --cool-down-period 60
```

**自定义镜像**：你可以创建自定义镜像，预装应用和配置，用于快速创建一致的实例。

```bash
# 从现有实例创建自定义镜像
gcloud compute images create web-server-image \
    --source-instance web-server-prod \
    --source-instance-zone us-central1-a

# 使用自定义镜像创建实例模板
gcloud compute instance-templates create web-server-template \
    --image web-server-image \
    --machine-type n2-standard-4 \
    --tags http-server,https-server
```

### 成本优化

Compute Engine 提供了多种计费方式：

| 计费方式 | 折扣 | 适用场景 |
|---------|------|---------|
| 按需付费 | 无折扣 | 短期、不可预测的工作负载 |
| 承诺使用折扣（CUD） | 1 年 20%、3 年 50% | 长期稳定运行的生产环境 |
| Spot 实例 | 60-91% | 容错性强的批处理任务 |

---

## 6.3 GKE：容器编排的王者

### 什么是 GKE？

GKE（Google Kubernetes Engine）是 GCP 上的托管 Kubernetes 服务。它管理了 Kubernetes 控制平面（API Server、Scheduler、Controller Manager），你只需要管理工作节点。

### 适合的场景

- **容器化应用**：已经使用 Docker 容器化的应用
- **微服务架构**：多个服务需要协同工作、服务发现、流量管理
- **需要复杂的发布策略**：蓝绿部署、金丝雀发布、滚动更新
- **需要灵活的编排能力**：自动调度、自动扩缩容、自动修复
- **混合部署**：同时运行无状态和有状态应用

### SRE 视角下的关键特性

**节点池的跨 Zone 分布**：

```bash
# 创建跨 Zone 的 GKE 集群
gcloud container clusters create prod-cluster \
    --region us-central1 \
    --node-locations us-central1-a,us-central1-b,us-central1-c \
    --num-nodes 3 \
    --machine-type e2-standard-4

# 添加独立的节点池
gcloud container node-pools create gpu-pool \
    --cluster prod-cluster \
    --region us-central1 \
    --machine-type n1-standard-4 \
    --accelerator type=nvidia-tesla-t4,count=1 \
    --num-nodes 2
```

**Pod 的调度策略**：

```yaml
# pod-anti-affinity.yaml
# 确保同一个应用的多个 Pod 不会调度到同一个节点上
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-server
  template:
    metadata:
      labels:
        app: web-server
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
              topologyKey: "kubernetes.io/hostname"
      containers:
      - name: web-server
        image: gcr.io/my-project/web-server:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "1Gi"
```

**拓扑分布约束（Topology Spread Constraints）**：

```yaml
# topology-spread.yaml
# 让 Pod 均匀分布到不同的 Zone 中
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-server
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
        topologyKey: "topology.kubernetes.io/zone"
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: web-server
      containers:
      - name: web-server
        image: gcr.io/my-project/web-server:latest
```

**Cluster Autoscaler**：

```bash
# 启用 Cluster Autoscaler
gcloud container clusters update prod-cluster \
    --region us-central1 \
    --enable-autoscaling \
    --min-nodes 3 \
    --max-nodes 20
```

### GKE 的发布策略

```yaml
# rolling-update.yaml
# 滚动更新配置
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-server
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # 最多比期望多 1 个 Pod
      maxUnavailable: 0  # 更新期间不能有 Pod 不可用
  template:
    spec:
      containers:
      - name: web-server
        image: gcr.io/my-project/web-server:v2
        readinessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
```

---

## 6.4 Cloud Run：无服务器的简化选择

### 什么是 Cloud Run？

Cloud Run 是一个完全托管的计算平台，可以在无服务器环境中运行容器化应用。它的最大优势在于：**你不需要管理任何基础设施。**

### 适合的场景

- **无状态 HTTP 应用**：API 服务、Web 应用后端
- **事件驱动应用**：处理 Pub/Sub 消息、Cloud Storage 事件
- **批处理任务**：定时任务、数据处理
- **Webhook 接收器**：GitHub Webhook、支付回调
- **最小化运维成本**：小团队、快速原型

### SRE 视角下的关键特性

**自动扩缩容**：Cloud Run 会自动从零扩展到数千个实例，然后在不使用时缩减到零。

```bash
# 部署 Cloud Run 服务
gcloud run deploy web-api \
    --image gcr.io/my-project/web-api:latest \
    --region us-central1 \
    --concurrency 80 \
    --max-instances 100 \
    --min-instances 1 \
    --cpu 2 \
    --memory 1Gi \
    --timeout 300
```

**关键参数说明：**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `--concurrency` | 每个实例最大并发请求数 | 80（默认） |
| `--max-instances` | 最大实例数，防止无限扩展 | 根据预算设定 |
| `--min-instances` | 最小实例数，减少冷启动 | 生产环境建议 ≥ 1 |
| `--cpu` | 每个实例的 CPU | 根据应用需求 |
| `--memory` | 每个实例的内存 | 根据应用需求 |

**冷启动优化**：

```yaml
# cloud-run-cold-start.yaml
# 通过设置最小实例数减少冷启动
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: web-api
spec:
  template:
    spec:
      containers:
      - image: gcr.io/my-project/web-api:latest
      minInstanceCount: 2  # 保持至少 2 个实例预热
```

---

## 6.5 计算服务选型决策树

```
你的应用是什么类型？
│
├─ 需要完全控制 OS 和环境？
│  ├─ 是 → Compute Engine
│  └─ 否 → 继续
│
├─ 需要 GPU/TPU？
│  ├─ 是 → Compute Engine（或 GKE + GPU 节点池）
│  └─ 否 → 继续
│
├─ 已经容器化？
│  ├─ 是 → 继续
│  └─ 否 → 继续
│
├─ 需要 Kubernetes 的编排能力？
│  ├─ 是 → GKE
│  └─ 否 → 继续
│
├─ 应用是无状态的 HTTP 服务？
│  ├─ 是 → Cloud Run
│  └─ 否 → 继续
│
├─ 需要复杂的发布策略？
│  ├─ 是 → GKE
│  └─ 否 → Cloud Run
│
└─ 不确定 → 从 Cloud Run 开始，需要时迁移到 GKE
```

### 成本对比

| 服务 | 最小成本 | 典型月成本（3 个实例） | 成本特征 |
|------|---------|---------------------|---------|
| Compute Engine | 按秒计费 | ~$150（3×n2-standard-4） | 无论是否使用都计费 |
| GKE | 集群管理费 ~$0.10/小时 | ~$150 + 集群管理费 | 节点无论是否使用都计费 |
| Cloud Run | 按请求计费，无请求免费 | ~$50（100 万请求/月） | 只有使用时才计费 |

**注意：** Cloud Run 在低流量场景下成本优势明显，但在持续高流量场景下，GKE 可能更经济。

---

## 6.6 一个场景：从 Compute Engine 迁移到 GKE

### 背景

某团队有一个运行在 Compute Engine 上的 Web 服务，使用托管实例组（MIG）管理。随着服务规模增长，团队发现手动管理容器部署越来越困难。

### 迁移步骤

**第一步：容器化应用**

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

**第二步：创建 Kubernetes 部署配置**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
      - name: web-app
        image: gcr.io/my-project/web-app:latest
        ports:
        - containerPort: 8080
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            cpu: "250m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
```

**第三步：创建 Service**

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app-service
spec:
  type: LoadBalancer
  selector:
    app: web-app
  ports:
  - port: 80
    targetPort: 8080
```

**第四步：迁移流量**

```bash
# 1. 创建 GKE 集群
gcloud container clusters create web-cluster \
    --region us-central1 \
    --num-nodes 3

# 2. 部署到 GKE
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# 3. 验证部署
kubectl get pods
kubectl get svc

# 4. 更新 DNS 记录，将流量指向 GKE 的 LoadBalancer IP
# 5. 观察一段时间，确认稳定后关闭 Compute Engine 实例
```

### 迁移效果

| 指标 | 迁移前（Compute Engine） | 迁移后（GKE） |
|------|------------------------|--------------|
| 部署时间 | 30 分钟（手动） | 2 分钟（自动） |
| 回滚时间 | 15 分钟（手动） | 30 秒（kubectl rollout undo） |
| 资源利用率 | 15% CPU | 45% CPU |
| 月成本 | ~$200 | ~$150 |

---

## 6.7 反模式：计算服务选型中的常见错误

### 反模式一：所有应用都用 Compute Engine

**表现**：不管什么应用，一律用 Compute Engine 创建虚拟机。

**后果**：管理成本高、部署效率低、资源浪费严重。

**正确的做法**：根据应用特性选择合适的计算服务。无状态 API 用 Cloud Run，容器化应用用 GKE，需要完全控制时才用 Compute Engine。

### 反模式二：为了"学习 Kubernetes"而用 GKE

**表现**：一个简单的 API 服务，只有 2 个端点，团队却用了 GKE + Istio + ArgoCD 全套方案。

**后果**：运维复杂度远高于应用本身的复杂度。一个小问题需要排查 Kubernetes、网络、服务网格等多个层面。

**正确的做法**：从简单的方案开始。Cloud Run 可以满足 80% 的应用需求。当需要更复杂的编排能力时再迁移到 GKE。

### 反模式三：Cloud Run 的冷启动不考虑

**表现**：将延迟敏感的应用部署到 Cloud Run，但没有配置最小实例数。

**后果**：请求到来时，如果所有实例都已缩减到零，需要等待新实例启动（冷启动），导致首次请求延迟高达数秒。

**正确的做法**：对延迟敏感的应用，设置 `--min-instances 1` 或更高，保持至少一个实例预热。

### 反模式四：混合使用多种计算服务但没有统一的管理方式

**表现**：同时使用 Compute Engine、GKE 和 Cloud Run，但每个服务的管理方式完全不同——有些用 SSH，有些用 kubectl，有些用 gcloud run。

**后果**：团队需要掌握多种管理工具，运维复杂度高，容易出错。

**正确的做法**：尽量统一管理方式。比如所有服务都通过 CI/CD 流水线部署，使用统一的日志和监控方案。

---

## 6.8 速查总结

### 计算服务选型速查

| 需求 | 推荐服务 | 理由 |
|------|---------|------|
| 完全控制 OS | Compute Engine | 最灵活 |
| 需要 GPU | Compute Engine / GKE | GPU 支持 |
| 容器化 + 微服务 | GKE | 编排能力强 |
| 无状态 HTTP API | Cloud Run | 运维成本最低 |
| 事件驱动 | Cloud Run | 自动扩缩容到零 |
| 批处理任务 | Cloud Run / GKE Job | 按需付费 |
| 数据库 | Cloud SQL / Spanner | 托管数据库服务 |

### 迁移路径

```
Cloud Run ← → GKE ← → Compute Engine
   ↑              ↑              ↑
最简单          最灵活        最可控
成本最低        功能最全        兼容性最好
```

### 每周计算资源检查清单

- [ ] 所有服务的 CPU 利用率是否在合理范围（40-80%）？
- [ ] 是否有实例规格过大或过小？
- [ ] Cloud Run 的冷启动是否影响用户体验？
- [ ] GKE 集群的资源是否充足？
- [ ] 是否有不再使用的计算资源在产生费用？

---

> **下一章预告：** 如果你选择了 GKE 作为计算平台，第 7 章将深入讲解如何在 GKE 上设计高可用架构——从节点池配置到多集群部署，确保你的容器化应用能够应对各种故障场景。
