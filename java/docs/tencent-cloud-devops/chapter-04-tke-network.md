# 第四章 TKE 集群架构与网络

## 4.1 概述

腾讯云 TKE（Tencent Kubernetes Engine）是腾讯云提供的托管 Kubernetes 服务。本章深入剖析 TKE 的集群架构选型、网络模型原理、服务发现与负载均衡机制、网络策略配置，以及生产环境中常见的潜在风险与应对方案。理解这些内容是在腾讯云上构建稳定、高效、可扩展容器基础设施的前提。

---

## 4.2 TKE 集群架构

### 4.2.1 Master 节点：托管 vs 自建

#### 解决的问题

Kubernetes 集群的 Master 节点承载着 API Server、Scheduler、Controller Manager、etcd 等核心组件，其可用性直接决定集群的稳定性。用户需要根据运维能力和 SLA 需求选择 Master 的管理模式。

#### 核心原理

**托管 Master（Managed Master）**

腾讯云负责控制面全部组件的部署、监控、升级和故障恢复。用户只需关注 Worker 节点。

- API Server 多 AZ 部署，etcd 三副本跨可用区
- 自动修补安全漏洞，滚动升级控制面
- 提供 99.95% 控制面 SLA

**自建 Master（Self-Managed Master）**

用户自行在 CVM 上部署 Kubernetes 控制面组件，拥有完全控制权。

- 可自定义 API Server 参数（如 `--max-mutating-requests-inflight`）
- 可使用自定义 etcd 加密、审计日志等高级特性
- 运维责任完全由用户承担

| 对比维度 | 托管 Master | 自建 Master |
|---|---|---|
| SLA | 99.95% | 用户自行保障 |
| 运维成本 | 低（腾讯云负责） | 高（需专职团队） |
| 控制面定制 | 受限 | 完全可控 |
| 版本升级 | 一键升级 | 手动操作 |
| 成本 | 免费（仅收 Worker 费用） | 额外 3 台 CVM 成本 |
| 适用规模 | 中小型集群（单集群 ≤5000 节点） | 超大规模或特殊合规场景 |

#### 代码/配置实现

创建托管集群（TKE 控制台 / API）：

```yaml
# ClusterCreateParameters
ClusterType: MANAGED_CLUSTER
KubernetesVersion: 1.28.3
ClusterNetworkSettings:
  VpcId: vpc-xxxxxxxx
  SubnetId: subnet-yyyyyyyy
  ServiceCIDR: 10.0.0.0/16
  ClusterCIDR: 10.1.0.0/16
  IgnoreClusterCIDRConflict: false
```

创建自建 Master 集群：

```yaml
# 需先购买 3 台 CVM，手动部署控制面
ClusterType: INDEPENDENT_CLUSTER
KubernetesVersion: 1.28.3
MasterSet:
  - InstanceType: S5.LARGE8
    SubnetId: subnet-aaaa
  - InstanceType: S5.LARGE8
    SubnetId: subnet-bbbb
  - InstanceType: S5.LARGE8
    SubnetId: subnet-cccc
```

#### 使用场景

- **托管 Master**：90% 以上的生产场景。初创团队、中小规模业务、DevOps 团队的首选。
- **自建 Master**：金融合规（需控制面物理隔离）、超大规模集群（>5000 节点）、需要自定义 kube-apiserver 准入插件的场景。

#### 潜在风险与注意事项

- 托管 Master 的 etcd 存储上限为 4GB，超过后 API Server 响应变慢，需及时清理历史资源
- 自建 Master 需为 etcd 单独挂载高性能 SSD 云盘，建议使用 `local SSD` 或 `ESSD`
- 托管 Master 升级时 API Server 会短暂重启（约 30s），长连接客户端需配置重试和退避

#### 本章小结

托管 Master 是绝大多数场景的最佳选择，零运维成本且 SLA 有保障。仅在合规或超大规模场景下考虑自建。

---

### 4.2.2 节点规格选型

#### 解决的问题

TKE Worker 节点支持多种 CVM 机型，不同业务负载对 CPU、内存、GPU、本地存储的需求差异巨大，选型错误会导致资源浪费或性能不足。

#### 核心原理

腾讯云 CVM 分为三大类：

**标准型（Standard）**

- 代表机型：S5、S6、SA3（AMD）、SA5
- CPU 与内存比 1:2 ~ 1:8
- 适用：微服务、Web 应用、API 网关、CI/CD 节点
- 特点：网络增强 `max bandwidth 50Gbps`，支持开启 `CPU 硬亲和`

**大数据型（Big Data）**

- 代表机型：IT5、IT6、D3
- 配备大容量本地 HDD/SSD 盘（最高 72TB）
- 适用：ClickHouse、Elasticsearch、Hadoop/Spark、日志采集
- 特点：本地盘数据不持久，需配合数据冗余策略

**GPU 型**

- 代表机型：GN10Xp（V100）、GN7（T4）、GNV4（A100）、HCC（H800）
- 适用：AI 训练、推理服务、视频转码、渲染
- 特点：需配合 `nvidia-device-plugin`、`gpu-operator`，支持 MIG（多实例 GPU）分割

#### 代码/配置实现

节点池配置示例：

```yaml
# NodePool 配置
NodePool:
  Name: gpu-training-pool
  InstanceType: GN7.2XLARGE
  SystemDisk:
    DiskType: CLOUD_SSD
    DiskSize: 100
  DataDisk:
    - DiskType: CLOUD_PREMIUM
      DiskSize: 500
  Labels:
    node-type: gpu
    accelerator: t4
  Taints:
    - Key: nvidia.com/gpu
      Value: "true"
      Effect: NoSchedule
  AutoScaling:
    MinSize: 0
    MaxSize: 20
    DesiredSize: 5
```

GPU Pod 声明：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: gpu-inference
spec:
  containers:
    - name: inference
      image: tensorflow/serving:2.13.0-gpu
      resources:
        limits:
          nvidia.com/gpu: 1
  tolerations:
    - key: nvidia.com/gpu
      operator: Exists
```

#### 使用场景

| 业务类型 | 推荐机型 | 原因 |
|---|---|---|
| 在线微服务 | S6/SA3 | 均衡配置，网络增强 |
| 离线批处理 | S6（高配） | 计算密集，无需 GPU |
| 日志/ES | IT6 | 大容量本地盘，降低存储成本 |
| AI 训练 | GNV4/A100 | 高性能 GPU，NVLink 互联 |
| AI 推理 | GN7/T4 | 性价比高，INT8 加速 |

#### 潜在风险与注意事项

- 大数据型本地盘故障率高于云盘，务必配置 Pod 反亲和与数据副本
- GPU 节点需预留 `nvidia-device-plugin` 的 `resources.limits`，否则调度器无法识别 GPU
- 标准型 SA3（AMD）在部分 Java 应用中存在 `avx512` 指令集缺失问题，需确认应用兼容性
- 节点规格过小（如 S2.SMALL1）会导致 Pod 密度低、kubelet 开销占比高，建议 ≥ 4C8G

#### 本章小结

选型核心原则：**在线服务用标准型，存储密集型用大数据型，AI 负载用 GPU 型**。节点规格不宜过小，建议 ≥ 4C8G，并配合节点池的弹性伸缩实现成本与性能的平衡。

---

### 4.2.3 超级节点（Super Node）原理

#### 解决的问题

传统节点模式下，Pod 调度受限于 CVM 实例的可用性：扩容需等待节点创建（3-5 分钟），缩容需处理节点排空，且节点资源碎片导致利用率低。超级节点（基于弹性容器 EKS）解决了这些问题。

#### 核心原理

超级节点本质上是腾讯云 EKS（Elastic Kubernetes Service）的集成形态，将 Pod 直接调度到底层基础设施而非 CVM 节点。

**弹性调度**：当普通节点资源不足时，TKE 调度器将 Pod 调度到超级节点，超级节点按需创建底层资源，无需等待 CVM 创建。

**Pod 级隔离**：每个 Pod 运行在独立的轻量级虚拟机中，内核级别隔离，安全性高于容器级隔离。

**资源池化**：多个超级节点共享底层资源池，Pod 按实际使用量计费（按秒），消除节点级资源碎片。

```
┌─────────────────────────────────────────────┐
│              TKE 集群                         │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ CVM 节点  │  │ CVM 节点  │  │超级节点   │   │
│  │ Pod A    │  │ Pod B    │  │ Pod C    │   │
│  │ Pod D    │  │          │  │ Pod E    │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│                                              │
│        超级节点 → 弹性容器实例 (EKS)          │
│        按需创建，按秒计费，Pod 级隔离           │
└─────────────────────────────────────────────┘
```

#### 代码/配置实现

启用超级节点：

```yaml
# 在集群中启用超级节点
apiVersion: tke.cloud.tencent.com/v1
kind: SuperNode
metadata:
  name: super-node-pool
spec:
  subnetIds:
    - subnet-xxxxx
    - subnet-yyyyy
  securityGroupId: sg-zzzzz
```

将 Pod 调度到超级节点：

```yaml
apiVersion: v1
kind: Deployment
metadata:
  name: burstable-app
spec:
  replicas: 10
  template:
    spec:
      schedulerName: tke-scheduler
      containers:
        - name: app
          image: nginx:alpine
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
      tolerations:
        - key: eks.tke.cloud.tencent.com/supernode
          operator: Exists
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              preference:
                matchExpressions:
                  - key: node.tke.cloud.tencent.com/supernode
                    operator: In
                    values:
                      - "true"
```

#### 使用场景

- **弹性扩容**：应对突发流量，Pod 秒级启动，无需预留节点资源
- **混部**：普通节点承载稳态业务，超级节点承载弹性业务
- **CI/CD 执行器**：GitLab Runner / Jenkins Agent 按需运行，用完即销毁
- **定时任务**：CronJob 执行期间创建 Pod，执行完毕自动释放

#### 潜在风险与注意事项

- 超级节点 Pod 不支持 `hostNetwork`、`privileged` 容器、`DaemonSet`
- 网络模式固定为 VPC-CNI，每个 Pod 占用一个 VPC IP
- 日志采集需通过 `sidecar` 或 `CLS` 方式，无法复用节点级 `DaemonSet` 采集器
- 成本：按 Pod 资源请求（request）计费，闲置 request 也会产生费用

#### 本章小结

超级节点是 TKE 弹性能力的核心，适合**弹性扩容、CI/CD、定时任务**等场景。与普通节点混部可实现"稳态 + 弹性"的最佳成本结构。但需注意其功能限制（无 hostNetwork、无 DaemonSet 支持）。

---

## 4.3 网络模型

### 4.3.1 VPC-CNI（弹性网卡直连模式）

#### 解决的问题

传统 Kubernetes 网络方案（如 Flannel、Calico overlay）中 Pod IP 经过 NAT 或隧道封装，存在性能损耗且无法被 VPC 内其他服务直接访问。VPC-CNI 让每个 Pod 直接获得 VPC 内网 IP，实现零性能损耗和原生互通。

#### 核心原理

VPC-CNI 为每个 Pod 分配一张弹性网卡（ENI）的辅助 IP，Pod 流量直接通过 VPC 路由转发，无额外封装。

```
Pod ──→ veth pair ──→ ENI 辅助 IP ──→ VPC 路由 ──→ 目标
                    (无隧道，无NAT)
```

- **ENI 绑定**：每个 CVM 节点绑定若干 ENI，每个 ENI 可分配多个辅助 IP
- **IP 分配**：TKE IPAMD 组件负责 ENI 与辅助 IP 的分配和回收
- **带宽保证**：每个 ENI 有独立带宽上限，Pod 间无"吵闹邻居"效应

#### 代码/配置实现

创建 VPC-CNI 集群：

```yaml
# 集群网络配置
ClusterNetworkSettings:
  NetworkType: VPC-CNI
  VpcId: vpc-xxxxxxxx
  SubnetId: subnet-yyyyyyyy
  # 每个节点的最大 Pod 数
  MaxPodPerNode: 16
  # 是否启用 ENI 直连（默认启用）
  EnableDirectAccess: true
```

查看 ENI 分配情况：

```bash
# 查看节点 ENI 信息
kubectl get eniconfig -o yaml

# 查看 IPAMD 状态
kubectl -n kube-system logs tke-eni-ipamd-xxxxx
```

Pod 声明（无需特殊配置，VPC-CNI 自动分配 VPC IP）：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: vpc-pod
spec:
  containers:
    - name: app
      image: nginx:alpine
      ports:
        - containerPort: 80
          # Pod IP 即为 VPC 内网 IP，可直接被 CLB 或其他 VPC 资源访问
```

#### 使用场景

- **高性能网络**：延迟敏感型应用（数据库、缓存、实时通信）
- **直接互通**：Pod 需要被 VPC 内其他服务（如 CLB、Redis、Ckafka）直接访问
- **带宽敏感**：视频处理、大文件传输，需要 Pod 级带宽保障

#### 潜在风险与注意事项

- **IP 消耗大**：每个 Pod 占用一个 VPC IP，VPC IP 上限为 65534，大规模集群需规划 CIDR
- **节点 Pod 密度受限**：单节点 Pod 数受 ENI 及辅助 IP 数量限制（通常 16-32 个）
- **ENI 绑定耗时**：节点加入时需绑定 ENI，冷启动比 GlobalRouter 慢 10-20s
- **跨子网调度限制**：Pod 只能调度到已配置子网的节点

#### 本章小结

VPC-CNI 提供**原生 VPC 网络性能**，Pod 与 VPC 内资源直接互通，适合高性能和直接互通场景。代价是 IP 消耗大、Pod 密度受限，需提前规划 VPC CIDR。

---

### 4.3.2 GlobalRouter（IP 共享模式）

#### 解决的问题

VPC-CNI 的 IP 消耗和 Pod 密度限制在大规模集群中成为瓶颈。GlobalRouter 通过 IP 共享和 NAT 转发，大幅提高节点 Pod 密度并减少 IP 消耗。

#### 核心原理

GlobalRouter 使用独立的容器网络 CIDR（Cluster CIDR），Pod IP 来自该 CIDR，通过节点上的 NAT 规则转换为节点 IP 访问 VPC 网络。

```
Pod (10.1.x.x) ──→ 节点 NAT ──→ 节点 IP (172.16.x.x) ──→ VPC 目标
                    (SNAT/Masquerade)
```

- **IP 复用**：Pod 使用 Cluster CIDR（如 10.1.0.0/16），不占用 VPC IP
- **高密度**：单节点 Pod 数仅受 kubelet `--max-pods` 限制（默认 256）
- **NAT 转发**：Pod 访问 VPC 内资源需经过节点 SNAT，对端看到的是节点 IP

#### 代码/配置实现

创建 GlobalRouter 集群：

```yaml
ClusterNetworkSettings:
  NetworkType: GlobalRouter
  VpcId: vpc-xxxxxxxx
  SubnetId: subnet-yyyyyyyy
  ClusterCIDR: 10.1.0.0/16
  ServiceCIDR: 10.0.0.0/16
  MaxPodPerNode: 64
```

GlobalRouter 模式下 Pod 访问 ClusterIP 服务的流量路径：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  type: ClusterIP
  clusterIP: 10.0.0.100
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
---
# Pod 通过 ClusterIP 访问时，iptables/IPVS 规则将请求转发到后端 Pod
# 后端 Pod 看到的源 IP 为节点 IP（因 SNAT）
```

#### 使用场景

- **大规模集群**：节点数 > 500，Pod 数 > 10000
- **IP 资源紧张**：VPC CIDR 较小，无法为每个 Pod 分配 VPC IP
- **内部服务**：服务无需被 VPC 外直接访问，通过 Service/Ingress 暴露

#### 潜在风险与注意事项

- **源 IP 丢失**：Pod 访问 VPC 内资源时，对端看到的是节点 IP，无法获取真实 Pod IP
- **性能损耗**：NAT 转发带来约 5-10% 的网络吞吐下降和微秒级延迟增加
- **ClusterIP 访问 SNAT**：默认 `masqueradeAll: false`，但跨节点 Pod 访问 ClusterIP 仍会 SNAT
- **排障困难**：网络问题排查时，tcpdump 抓包看到的是节点 IP，增加排障复杂度

#### 本章小结

GlobalRouter 通过**牺牲少量网络性能换取更高的 Pod 密度和更低的 IP 消耗**，适合大规模集群和 IP 资源紧张的场景。如果应用对源 IP 有强需求（如白名单），需配合 `externalTrafficPolicy: Local` 或使用 VPC-CNI。

---

### 4.3.3 网络模型选型对比

#### 解决的问题

面对 VPC-CNI 和 GlobalRouter 两种网络模型，用户需要清晰的选型依据。

#### 核心原理

| 对比维度 | VPC-CNI | GlobalRouter |
|---|---|---|
| Pod IP 来源 | VPC CIDR | Cluster CIDR（独立网段） |
| 每节点 Pod 上限 | 16-32（受 ENI 限制） | 64-256（可配置） |
| 网络性能 | 原生 VPC 性能 | 有 NAT 损耗（~5%） |
| 源 IP 保留 | 是 | 否（SNAT 后为节点 IP） |
| VPC IP 消耗 | 高（每 Pod 一个 IP） | 低（仅节点消耗 VPC IP） |
| 跨子网调度 | 需子网配置 | 无限制 |
| 冷启动速度 | 较慢（需绑定 ENI） | 快 |
| 适用规模 | 中小型（<500 节点） | 大型（>500 节点） |

#### 代码/配置实现

混合网络模型（部分命名空间使用 VPC-CNI，其余使用 GlobalRouter）：

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: high-performance
  annotations:
    tke.cloud.tencent.com/network-type: vpc-cni
---
apiVersion: v1
kind: Namespace
metadata:
  name: default
  annotations:
    tke.cloud.tencent.com/network-type: globalrouter
```

#### 使用场景

- **选 VPC-CNI**：数据库、缓存、实时音视频、需要源 IP 白名单的服务
- **选 GlobalRouter**：Web 后端、微服务、批处理、CI/CD、大规模集群

#### 潜在风险与注意事项

- 集群创建后**无法切换网络模型**，需提前规划
- 混合模型下，VPC-CNI Pod 和 GlobalRouter Pod 互通无问题（均在 VPC 内）
- 如果业务同时需要高密度和高性能，可考虑 GlobalRouter + `externalTrafficPolicy: Local` 的组合

#### 本章小结

**选型口诀**：性能敏感用 CNI，规模优先选 Router。两者可在同一集群混合使用，按命名空间隔离。

---

## 4.4 服务发现与负载均衡

### 4.4.1 Service 类型

#### 解决的问题

Pod 是动态创建和销毁的，其 IP 不固定。Service 提供稳定的访问入口，将请求负载均衡到一组 Pod。

#### 核心原理

**ClusterIP**

- 分配集群内虚拟 IP（Service CIDR 中），仅集群内可访问
- 通过 iptables/IPVS 规则实现四层负载均衡
- 默认类型，零额外成本

**NodePort**

- 在每个节点上开放一个静态端口（30000-32767）
- 集群外可通过 `NodeIP:NodePort` 访问
- 适合测试环境或非标准场景

**LoadBalancer**

- 自动创建腾讯云 CLB（Cloud Load Balancer）
- CLB 将公网/内网流量转发到 NodePort 或 Pod（直连模式）
- 支持 TCP/UDP 四层和 HTTP/HTTPS 七层

#### 代码/配置实现

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-service
  annotations:
    # 指定 CLB 规格
    service.kubernetes.io/tke-existed-lbid: lb-xxxxxxxx
    # 开启 CLB 直连 Pod（VPC-CNI 模式）
    service.kubernetes.io/direct-access: "true"
    # 会话保持
    service.kubernetes.io/qcloud-loadbalancer-session-expire: "3600"
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
  selector:
    app: web
  # 保留客户端源 IP
  externalTrafficPolicy: Local
```

#### 使用场景

| Service 类型 | 使用场景 |
|---|---|
| ClusterIP | 微服务间内部调用 |
| NodePort | 调试、自建入口网关 |
| LoadBalancer | 对外暴露服务（生产环境） |

#### 潜在风险与注意事项

- `externalTrafficPolicy: Local` 会导致流量分布不均（仅转发到有 Pod 的节点）
- CLB 默认健康检查间隔为 5s，不健康阈值 3 次，Pod 启动慢时需调整
- 大量 Service 会导致 iptables 规则膨胀（建议使用 IPVS 模式）

#### 本章小结

Service 是 Kubernetes 服务发现的基础。生产环境对外暴露使用 LoadBalancer，内部通信使用 ClusterIP。VPC-CNI 模式下建议开启 CLB 直连 Pod 以消除额外跳转。

---

### 4.4.2 Ingress

#### 解决的问题

Service 工作在四层（TCP/UDP），无法根据 HTTP 路径、域名等七层属性进行路由。Ingress 提供七层流量入口，支持域名和路径转发。

#### 核心原理

**CLB Ingress（腾讯云负载均衡器）**

- 由 TKE 组件 `tke-ingress-controller` 自动管理 CLB 七层规则
- 支持 HTTPS 证书自动挂载、重定向、CORS 等
- 控制面管理，无需部署额外组件

**nginx-ingress（自建）**

- 在集群内部署 nginx-ingress-controller，类型为 LoadBalancer
- 高度可定制：自定义 lua 脚本、速率限制、灰度发布
- 需自行管理高可用和版本升级

| 对比维度 | CLB Ingress | nginx-ingress |
|---|---|---|
| 部署维护 | 零运维 | 需自行部署和升级 |
| 性能 | CLB 硬件卸载，高吞吐 | Nginx 软件转发，可调优 |
| 定制能力 | 受限（仅支持 CLB 功能） | 高度灵活（lua、annotations） |
| 成本 | 额外 CLB 费用 | 额外节点资源费用 |
| 灰度发布 | 不支持原生 | 支持（canary annotation） |
| 证书管理 | 自动挂载 SSL 证书 | 需手动管理 Secret |

#### 代码/配置实现

CLB Ingress：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  annotations:
    # 指定使用 CLB Ingress
    kubernetes.io/ingress.class: qcloud
    # HTTPS 证书 ID
    ingress.cloud.tencent.com/certificate-id: "xxxxx"
    # HTTP 重定向到 HTTPS
    ingress.cloud.tencent.com/rewrite-support: "true"
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /v1
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
          - path: /v2
            pathType: Prefix
            backend:
              service:
                name: api-v2-service
                port:
                  number: 8080
    - host: web.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-service
                port:
                  number: 80
  tls:
    - hosts:
        - api.example.com
        - web.example.com
      secretName: example-tls
```

nginx-ingress：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nginx-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    # 灰度发布：基于 Header
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"
    nginx.ingress.kubernetes.io/canary-by-header-value: "true"
    # 速率限制
    nginx.ingress.kubernetes.io/limit-rps: "100"
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app-service
                port:
                  number: 80
```

#### 使用场景

- **CLB Ingress**：标准 Web 服务，无需复杂路由逻辑，希望降低运维成本
- **nginx-ingress**：需要灰度发布、自定义认证、速率限制、WebSocket 等高级功能

#### 潜在风险与注意事项

- CLB Ingress 的规则更新有 1-3 分钟生效延迟（CLB 配置下发时间）
- nginx-ingress 需预留足够资源，建议独立节点池并配置 HPA
- 大量 Ingress 规则会导致 nginx reload 频繁，影响长连接
- 建议所有 Ingress 配置 `annotation` 指定 `ingress.class`，避免冲突

#### 本章小结

**简单场景用 CLB Ingress，复杂场景用 nginx-ingress**。CLB Ingress 零运维但功能受限，nginx-ingress 灵活但需自行管理。生产环境建议 nginx-ingress + 独立节点池。

---

### 4.4.3 CoreDNS 配置优化

#### 解决的问题

CoreDNS 是 Kubernetes 集群的 DNS 解析核心，其性能直接影响服务发现延迟和成功率。默认配置在大规模集群中容易出现超时和解析失败。

#### 核心原理

CoreDNS 以 Deployment 形式运行在 `kube-system` 命名空间，监听 Service CIDR 的 DNS 端口（53），处理 Pod 的 DNS 查询。

**关键优化方向**：

1. **缓存调优**：增大 DNS 缓存，减少对上游 DNS 的查询
2. **存根域（Stub Domain）**：配置私有域名的解析转发
3. **自动扩缩（Autoscaler）**：根据集群规模自动调整 CoreDNS 副本数

#### 代码/配置实现

优化后的 CoreDNS ConfigMap：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
data:
  Corefile: |
    .:53 {
        # 开启错误日志
        errors
        # 健康检查
        health {
            lameduck 5s
        }
        # 优化缓存：30s 成功缓存，5s 失败缓存
        cache {
            success 10000 30
            denial 1000 5
        }
        # 重试机制
        reload
        # 负载均衡
        loadbalance
        # 就绪检查
        ready
        # Kubernetes 插件
        kubernetes cluster.local in-addr.arpa ip6.arpa {
            pods insecure
            fallthrough in-addr.arpa ip6.arpa
            ttl 30
        }
        # 存根域：私有域名转发到自建 DNS
        example.com {
            forward . 10.0.0.100:53 {
                max_concurrent 1000
            }
        }
        # 外部域名转发到腾讯云 DNS
        forward . 183.60.83.19 183.60.82.98 {
            max_concurrent 1000
            prefer_udp
        }
        # 优化：缩短超时时间
        prometheus :9153
        # 查询超时
        forward . 183.60.83.19:53 {
            expire 10s
        }
    }
```

CoreDNS Autoscaler 配置：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: coredns-hpa
  namespace: kube-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: coredns
  minReplicas: 2
  maxReplicas: 10
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
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120
```

NodeLocal DNS Cache 部署：

```yaml
# 在每个节点上部署本地 DNS 缓存，减少对 CoreDNS 的查询压力
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-local-dns
  namespace: kube-system
  labels:
    k8s-app: node-local-dns
spec:
  selector:
    matchLabels:
      k8s-app: node-local-dns
  template:
    metadata:
      labels:
        k8s-app: node-local-dns
    spec:
      hostNetwork: true
      dnsPolicy: Default
      tolerations:
        - operator: Exists
      containers:
        - name: node-cache
          image: registry.cn-hangzhou.aliyuncs.com/google_containers/k8s-dns-node-cache:1.22.20
          args:
            - -localip
            - 169.254.20.10
            - -conf
            - /etc/Corefile
          securityContext:
            capabilities:
              add:
                - NET_ADMIN
          volumeMounts:
            - name: config-volume
              mountPath: /etc/coredns
      volumes:
        - name: config-volume
          configMap:
            name: node-local-dns
            items:
              - key: Corefile
                path: Corefile.base
```

#### 使用场景

- **缓存调优**：所有集群的基线配置，减少 CoreDNS 负载
- **存根域**：需要解析内部私有域名（如 `company.internal`、`db.private`）
- **Autoscaler**：集群规模 > 50 节点，或 CoreDNS CPU > 50%
- **NodeLocal DNS**：集群规模 > 200 节点，或 DNS 超时问题频发

#### 潜在风险与注意事项

- 缓存时间过长会导致 DNS 更新延迟（如 Service 删除后仍有解析）
- `ndots:5` 默认值会导致大量 DNS 查询失败，建议优化 Pod `dnsConfig`
- CoreDNS 内存泄漏问题（已知 issue），建议定期重启或设置资源上限
- NodeLocal DNS 与网络策略冲突时需调整策略规则

Pod 级 DNS 配置优化：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: dns-optimized-app
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
      - name: single-request-reopen
        value: "true"
      - name: attempts
        value: "2"
  containers:
    - name: app
      image: nginx:alpine
```

#### 本章小结

CoreDNS 优化是**大规模集群的必选项**。核心三板斧：增大缓存、配置 Autoscaler、部署 NodeLocal DNS Cache。同时优化 Pod 的 `ndots` 和 `attempts` 参数，减少无效 DNS 查询。

---

## 4.5 网络策略（NetworkPolicy）

### 4.5.1 Kubernetes NetworkPolicy API

#### 解决的问题

默认情况下，Kubernetes 集群中所有 Pod 可以互相通信，这不符合最小权限原则。NetworkPolicy 通过标签选择器定义 Pod 间的网络访问规则。

#### 核心原理

NetworkPolicy 是 Kubernetes 原生资源，由网络插件（CNI）实现。它通过 `podSelector`、`namespaceSelector`、`ipBlock` 等选择器定义入站（ingress）和出站（egress）规则。

**关键概念**：

- **默认允许**：未定义 NetworkPolicy 时，所有流量允许
- **默认拒绝**：一旦有 NetworkPolicy 选中 Pod，未显式允许的流量被拒绝
- **规则方向**：`ingress`（入站）和 `egress`（出站）独立配置

#### 代码/配置实现

默认拒绝所有入站流量：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
```

允许特定 Pod 访问数据库：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-allow-app
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: mysql
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: backend
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - protocol: TCP
          port: 3306
```

允许出站到特定外部地址：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-egress-external
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: worker
  policyTypes:
    - Egress
  egress:
    - to:
        - ipBlock:
            cidr: 10.0.0.0/8
            except:
              - 10.0.1.0/24
      ports:
        - protocol: TCP
          port: 443
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 53
        - protocol: UDP
          port: 53
```

#### 使用场景

- **零信任网络**：每个命名空间默认拒绝，显式放行必要流量
- **多租户隔离**：不同团队命名空间之间禁止互访
- **数据库保护**：仅允许应用 Pod 访问数据库，禁止其他来源
- **出站控制**：限制 Pod 只能访问特定外部服务

#### 潜在风险与注意事项

- NetworkPolicy 依赖 CNI 实现，GlobalRouter 模式需额外安装 Calico 或 TKE 网络策略组件
- 规则过多（>1000 条）会导致 iptables 性能下降
- `ipBlock` 规则在 Pod IP 变化时需注意 CIDR 更新
- 调试困难：流量被拒绝时无明确错误日志，需结合 `kubectl describe networkpolicy` 排查

#### 本章小结

NetworkPolicy 是实现**容器网络零信任的基础设施**。建议采用"默认拒绝 + 显式放行"模式，从核心服务（数据库、缓存）开始逐步覆盖。

---

### 4.5.2 Calico / TKE 网络策略实现

#### 解决的问题

Kubernetes 原生 NetworkPolicy 功能有限（不支持 DNS 策略、全局策略、优先级等）。Calico 提供了更丰富的网络策略能力。

#### 核心原理

TKE 支持两种网络策略引擎：

**Calico**

- 使用 Felix 组件管理 iptables/IPVS 规则
- 支持 `GlobalNetworkPolicy`（全局策略）、`NetworkSet`（IP 集合）
- 支持 egress 访问控制到域名（通过 DNS 解析动态更新）

**TKE 网络策略组件**

- 腾讯云自研，与 VPC-CNI 深度集成
- 通过 VPC 安全组实现策略，性能优于 iptables
- 支持可视化策略管理（TKE 控制台）

#### 代码/配置实现

Calico 全局策略：

```yaml
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: deny-all-non-istio
spec:
  selector: all()
  ingress:
    - action: Deny
      source:
        notSelector: "istio.io/dataplane-mode == true"
  order: 1000
```

Calico 基于域名的 egress 策略：

```yaml
apiVersion: projectcalico.org/v3
kind: NetworkPolicy
metadata:
  name: allow-egress-dns
  namespace: production
spec:
  selector: app == 'worker'
  types:
    - Egress
  egress:
    - action: Allow
      protocol: UDP
      destination:
        ports:
          - 53
    - action: Allow
      destination:
        domains:
          - "*.example.com"
          - "api.tencent.com"
      protocol: TCP
      destination:
        ports:
          - 443
```

TKE 网络策略（通过控制台或 API）：

```yaml
apiVersion: tke.cloud.tencent.com/v1
kind: TkeNetworkPolicy
metadata:
  name: tke-policy-demo
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: istio-system
      ports:
        - protocol: TCP
          port: 8080
```

#### 使用场景

- **Calico**：需要全局策略、域名 egress 控制、策略优先级等高级功能
- **TKE 网络策略**：VPC-CNI 集群，希望利用 VPC 安全组性能优势

#### 潜在风险与注意事项

- Calico 与 VPC-CNI 同时使用时需注意 Felix 与 IPAMD 的交互
- Calico 策略变更时 iptables 全量更新，大规模规则下可能造成秒级延迟
- TKE 网络策略仅在 VPC-CNI 模式下可用

#### 本章小结

**Calico 适合 GlobalRouter 集群和需要高级策略的场景**，TKE 网络策略适合 VPC-CNI 集群。建议从"默认拒绝"策略开始，逐步细化。

---

## 4.6 潜在风险与应对方案

### 4.6.1 CNI IP 耗尽

#### 风险描述

VPC-CNI 模式下，每个 Pod 消耗一个 VPC 内网 IP。当 VPC IP 池耗尽时，新 Pod 无法调度，导致服务扩容失败。

#### 根因分析

- VPC CIDR 规划过小（如 `/24` 仅 256 个 IP）
- 未及时回收已删除 Pod 的 IP（IPAMD 组件异常）
- 超级节点和普通节点共享同一子网，IP 竞争

#### 应对方案

1. **合理规划 VPC CIDR**：生产环境建议 VPC CIDR ≥ `/16`（65536 IP）
2. **多子网配置**：为 VPC-CNI 配置多个子网，分散 IP 消耗
3. **监控告警**：监控 VPC IP 使用率，设置 ≥ 80% 告警

```yaml
# 多子网配置
apiVersion: tke.cloud.tencent.com/v1
kind: TKEENIConfig
metadata:
  name: multi-subnet-config
spec:
  subnets:
    - subnet-aaaaa  # 可用区 A
    - subnet-bbbbb  # 可用区 B
    - subnet-ccccc  # 可用区 C
  # IP 预热：提前申请 IP 减少调度延迟
  ipPreempt:
    enable: true
    preemptPercent: 10
```

### 4.6.2 CLB 性能瓶颈

#### 风险描述

CLB 作为流量入口，其规格直接影响服务可用性。CLB 连接数或带宽达到上限时，新连接被拒绝，服务降级。

#### 根因分析

- CLB 规格选择过小（共享型 CLB 最大连接数 500 万）
- 未配置 CLB 闲置连接超时，导致连接数持续增长
- 单个 CLB 后端 RS（Real Server）数量超过推荐值

#### 应对方案

1. **选择合适 CLB 规格**：生产环境使用性能保障型 CLB
2. **配置连接超时**：设置合理的 `keepalive_timeout`
3. **多 CLB 分发**：通过 DNS 轮询或 Global Traffic Manager 分发到多个 CLB

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-service
  annotations:
    # 使用性能保障型 CLB
    service.kubernetes.io/loadbalancer-type: "classic"
    # 连接空闲超时（秒）
    service.kubernetes.io/qcloud-loadbalancer-idle-timeout: "120"
    # 跨可用区容灾
    service.kubernetes.io/qcloud-loadbalancer-multi-zone: "true"
spec:
  type: LoadBalancer
  ports:
    - port: 443
      targetPort: 443
      protocol: TCP
```

### 4.6.3 DNS 解析延迟

#### 风险描述

CoreDNS 性能不足或配置不当导致 DNS 解析延迟，进而引发服务调用超时、连接失败等问题。

#### 根因分析

- CoreDNS 副本数不足，无法处理突发 DNS 查询
- `ndots:5` 导致大量无效 DNS 查询（每个域名查询拼接 5 次 search 域）
- Pod 的 `resolv.conf` 中 search 域过多

#### 应对方案

1. **优化 ndots**：设置 `ndots: 2` 或 `ndots: 1`
2. **部署 NodeLocal DNS Cache**：减少跨节点 DNS 查询
3. **CoreDNS HPA**：根据 CPU/内存自动扩缩

```yaml
# Pod 级 DNS 优化
apiVersion: apps/v1
kind: Deployment
metadata:
  name: latency-sensitive-app
spec:
  template:
    spec:
      dnsConfig:
        options:
          - name: ndots
            value: "1"
          - name: single-request-reopen
            value: "true"
          - name: timeout
            value: "2"
          - name: attempts
            value: "2"
      dnsPolicy: None
      containers:
        - name: app
          image: nginx:alpine
```

---

## 4.7 本章总结

TKE 集群架构与网络是容器化基础设施的基石，核心要点总结如下：

| 领域 | 关键决策 | 推荐方案 |
|---|---|---|
| Master 模式 | 托管 vs 自建 | 托管（99.95% SLA） |
| 节点规格 | 标准/大数据/GPU | 标准型 ≥ 4C8G |
| 弹性能力 | 超级节点 | 稳态 + 弹性混部 |
| 网络模型 | VPC-CNI vs GlobalRouter | 性能敏感用 CNI，规模优先用 Router |
| 服务暴露 | Service + Ingress | CLB Ingress 简单场景，nginx-ingress 复杂场景 |
| DNS 优化 | CoreDNS | 缓存 + HPA + NodeLocal DNS |
| 网络安全 | NetworkPolicy | 默认拒绝 + 显式放行 |

**最佳实践清单**：

1. 创建集群前规划好 VPC CIDR（建议 ≥ /16）
2. 生产环境使用托管 Master + 多可用区节点池
3. 网络模型按业务需求选择，同一集群可混合使用
4. CoreDNS 配置缓存和 HPA，部署 NodeLocal DNS Cache
5. 实施 NetworkPolicy 默认拒绝策略，逐步放行必要流量
6. 监控 VPC IP 使用率、CLB 连接数、CoreDNS 延迟
7. 使用超级节点承载弹性流量，降低资源预留成本

本章内容覆盖了 TKE 集群架构与网络的完整知识体系，为后续章节（CI/CD、监控、安全）奠定基础。
