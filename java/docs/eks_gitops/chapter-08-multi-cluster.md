# 第8章 多集群管理与 Argo CD

## 8.1 多集群场景概述

### 8.1.1 解决的问题

单一 Kubernetes 集群在规模增长到一定程度后，会面临以下瓶颈：

- **控制面压力**：随着节点和 Pod 数量增加，etcd 和 API Server 的负载持续上升，最终触及性能天花板
- **故障半径过大**：一个集群内的故障可能影响所有运行在其上的工作负载，缺乏爆炸半径隔离
- **地域覆盖局限**：单集群通常部署在单一可用区或区域，无法为全球用户提供低延迟访问
- **环境混部风险**：开发、测试、生产负载运行在同一集群时，资源竞争和误操作风险显著增加
- **租户隔离不足**：多租户场景下，单一集群的 RBAC 和网络策略难以提供强隔离保证

多集群架构正是为了解决这些问题而诞生。通过将工作负载分散到多个 Kubernetes 集群中，可以获得以下收益：

| 维度 | 单集群 | 多集群 |
|------|--------|--------|
| 扩展性 | 受限于集群上限（~5000 节点） | 理论上无限水平扩展 |
| 故障隔离 | 爆炸半径 = 整个集群 | 爆炸半径 = 单个集群 |
| 地域分布 | 单一区域 | 全球多区域 |
| 环境隔离 | Namespace 级别软隔离 | 物理级别硬隔离 |
| 升级风险 | 影响所有工作负载 | 逐个集群灰度升级 |

### 8.1.2 核心原理

多集群管理的核心挑战在于：**如何在保持声明式一致性的前提下，跨集群管理应用的生命周期**。Argo CD 通过 Hub-Spoke 架构解决了这一问题——一个中心化的 Argo CD 实例（Hub）同时管理多个目标集群（Spoke），将 Git 中的声明式配置同步到所有注册集群。

```
┌─────────────────────────────────────────────────────────────┐
│                        Git Repository                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ app-configs │  │ cluster-    │  │ overlays/   │         │
│  │ /base       │  │ specific/   │  │ production  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└────────────────────────┬────────────────────────────────────┘
                         │ git pull
                         ▼
              ┌──────────────────────┐
              │   Hub Cluster        │
              │   (Argo CD)          │
              │                      │
              │  ┌────────────────┐  │
              │  │ Application    │  │
              │  │ Controller     │  │
              │  └───────┬────────┘  │
              │          │           │
              │  ┌───────▼────────┐  │
              │  │ ApplicationSet │  │
              │  │ Controller     │  │
              │  └───────┬────────┘  │
              └──────────┼───────────┘
                         │ sync / diff
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ Spoke Cluster│ │ Spoke Cluster│ │ Spoke Cluster│
  │ us-east-1    │ │ eu-west-1    │ │ ap-southeast-│
  │ (prod)       │ │ (staging)    │ │ 1 (dev)      │
  └──────────────┘ └──────────────┘ └──────────────┘
```

### 8.1.3 代码/配置实现

多集群架构本身不需要特定的 YAML 配置，但需要在 Hub 集群上安装 Argo CD，并确保 Hub 能够通过网络访问所有 Spoke 集群的 API Server。

```bash
# 在 Hub 集群上安装 Argo CD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### 8.1.4 使用场景

**多区域部署（Multi-Region Deployment）**

面向全球用户的 SaaS 服务需要将应用部署到多个地理区域，以降低用户访问延迟并满足数据驻留合规要求。例如，一个电商平台需要在 us-east-1（北美）、eu-west-1（欧洲）、ap-southeast-1（亚太）各部署一套服务，每个区域的集群运行相同的应用但使用不同的区域配置。

**环境隔离（Dev/Staging/Prod Isolation）**

企业通常需要三个或更多独立环境来支持软件交付流水线。使用多集群实现环境隔离，可以避免开发人员的实验性变更影响生产流量，同时每个环境可以使用不同规格的节点配置（开发环境用 spot 实例，生产环境用按需实例）。

**租户隔离（Tenant Isolation）**

在 SaaS 多租户场景中，每个租户可能需要独立的集群来满足合规要求或性能 SLA。Argo CD 的多集群管理能力使得运营团队可以通过一个控制面管理数百个租户集群。

### 8.1.5 潜在风险与注意事项

- 多集群架构引入了额外的运维复杂度，需要团队具备相应的 Kubernetes 网络和安全管理能力
- Hub 集群成为新的单点故障——如果 Hub 不可用，虽然已部署的应用不受影响，但无法进行新的部署或配置变更
- 跨集群网络通信可能引入延迟和可靠性问题，尤其是在跨区域场景下

### 8.1.6 本章小结

多集群架构是现代云原生基础设施的必然趋势。Argo CD 的 Hub-Spoke 模型提供了一种声明式、可审计的方式来管理跨集群的应用生命周期。理解多集群场景的驱动因素和架构权衡，是正确设计多集群管理方案的前提。

---

## 8.2 Hub-Spoke 架构

### 8.2.1 解决的问题

在多集群环境中，最直接的管理方式是在每个集群上独立安装 Argo CD。但这种方式存在明显缺陷：

- **配置碎片化**：每个集群的 Argo CD 配置各自独立，难以保证一致性
- **管理成本线性增长**：N 个集群需要管理 N 个 Argo CD 实例
- **缺乏全局视图**：无法在一个控制面板上查看所有集群的应用状态
- **Git 仓库访问令牌分散**：每个 Argo CD 实例都需要配置 Git 仓库凭证，增加了密钥泄露风险

Hub-Spoke 架构通过**集中控制面 + 分布式数据面**的模式解决了这些问题。

### 8.2.2 核心原理

Hub-Spoke 架构的核心思想是：

1. **Hub 集群**：运行 Argo CD 的核心组件（Application Controller、Server、Repo Server、ApplicationSet Controller）。Hub 负责从 Git 拉取配置、计算期望状态、将应用同步到目标集群。

2. **Spoke 集群**：仅运行用户工作负载，不运行 Argo CD。Spoke 集群通过 kubeconfig 或 Service Account 向 Hub 注册，Hub 通过 Spoke 的 API Server 地址来管理其上的资源。

3. **控制流**：Argo CD 在 Hub 集群上运行，通过 Kubernetes API 代理（kubectl proxy 或直接 API 调用）与 Spoke 集群通信。Argo CD 不会在 Spoke 集群上安装任何 Operator。

```
┌──────────────────────────────────────────────────────────────┐
│                        Hub Cluster                           │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ Argo CD     │  │ Application │  │ ApplicationSet       │ │
│  │ Server      │  │ Controller  │  │ Controller           │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬───────────┘ │
│         │                │                     │             │
│  ┌──────▼────────────────▼─────────────────────▼──────────┐ │
│  │                    kubeconfigs                           │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │  │ us-east  │ │ eu-west  │ │ ap-south │ │ prod-us  │  │ │
│  │  │ -1       │ │ -1       │ │ -1       │ │ -east-1  │  │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │           │           │           │
         │           │           │           │
         ▼           ▼           ▼           ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Spoke    │ │ Spoke    │ │ Spoke    │ │ Spoke    │
  │ us-east-1│ │ eu-west-1│ │ ap-south │ │ prod-us  │
  │          │ │          │ │ -1       │ │ -east-1  │
  │ (dev)    │ │ (staging)│ │ (prod)   │ │ (prod)   │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Hub 与 Spoke 之间的通信路径：

```
Argo CD Controller (Hub)
        │
        │ 1. 从 Git 拉取 Application 定义
        ▼
    Repo Server (Hub)
        │
        │ 2. 生成期望的 Kubernetes 资源清单
        ▼
Argo CD Application Controller (Hub)
        │
        │ 3. 通过 Spoke 的 API Server 地址
        │    执行 kubectl diff / apply
        ▼
Spoke API Server (Spoke Cluster)
        │
        │ 4. 将资源写入 Spoke 的 etcd
        ▼
Spoke Workload (Spoke Cluster)
```

### 8.2.3 代码/配置实现

在 Hub 集群上安装 Argo CD 后，需要配置它能够访问 Spoke 集群。这通常通过以下步骤完成：

```bash
# 1. 获取 Spoke 集群的 kubeconfig
aws eks update-kubeconfig --region us-east-1 --name spoke-cluster-dev \
  --kubeconfig ./kubeconfigs/spoke-dev.config

aws eks update-kubeconfig --region eu-west-1 --name spoke-cluster-staging \
  --kubeconfig ./kubeconfigs/spoke-staging.config

aws eks update-kubeconfig --region ap-southeast-1 --name spoke-cluster-prod \
  --kubeconfig ./kubeconfigs/spoke-prod.config
```

```yaml
# 2. 在 Hub 集群上创建 Secret 来存储 Spoke 集群的凭据
# 方式一：使用 argocd CLI 自动创建 Secret
# argocd cluster add --name spoke-dev context-name

# 方式二：手动创建 Secret（适用于自动化场景）
apiVersion: v1
kind: Secret
metadata:
  name: cluster-spoke-dev
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: cluster
type: Opaque
stringData:
  name: spoke-dev
  server: https://ABCDEFGHI1234567890.gr7.us-east-1.eks.amazonaws.com
  config: |
    {
      "bearerToken": "<service-account-token>",
      "tlsClientConfig": {
        "insecure": false,
        "caData": "<base64-encoded-ca-cert>"
      }
    }
```

### 8.2.4 使用场景

Hub-Spoke 架构适用于以下场景：

- **平台工程团队**：中央平台团队管理 Hub，各个业务团队使用 Spoke 集群，平台团队通过 Argo CD 统一发布应用
- **多环境部署**：Hub 集群部署在管理账号中，Dev/Staging/Prod 集群分别部署在不同 AWS 账号或 VPC 中
- **大规模集群管理**：管理 10 个以上集群时，Hub-Spoke 架构的管理效率优势显著

### 8.2.5 潜在风险与注意事项

- **Hub 集群高可用**：Hub 集群必须部署为多可用区高可用模式，建议使用托管 Kubernetes 服务（EKS/AKS/GKE）
- **网络连通性**：Hub 必须能够访问所有 Spoke 的 API Server。跨 VPC/跨账号场景下，需要配置 VPC Peering、Transit Gateway 或 PrivateLink
- **Hub 集群资源规划**：每个被管理的 Application 都会在 Hub 上占用一定的内存和 CPU 资源。管理 100+ 集群时，Hub 集群的规格需要相应扩展
- **灾难恢复**：需要为 Hub 集群制定备份和恢复策略，包括 Argo CD 的配置、Application 定义和集群凭据

### 8.2.6 本章小结

Hub-Spoke 架构是 Argo CD 多集群管理的核心模式。它将控制面集中到 Hub 集群，将工作负载分散到 Spoke 集群，在集中管理和分布式部署之间取得了平衡。正确设计 Hub 的高可用方案和网络连通性是成功实施的关键。

---

## 8.3 集群注册

### 8.3.1 解决的问题

在 Hub-Spoke 架构中，Hub 集群需要知道如何访问每个 Spoke 集群。这涉及三个核心问题：

1. **身份认证**：Hub 如何证明自己有权限管理 Spoke 集群？
2. **授权控制**：Hub 在 Spoke 集群上应该拥有哪些权限？如何限制权限范围？
3. **安全通信**：Hub 与 Spoke 之间的 API 调用如何保证传输安全？

### 8.3.2 核心原理

Argo CD 的集群注册机制基于 Kubernetes 的 Service Account 和 RBAC 系统：

1. 在 Spoke 集群上创建一个 Service Account（通常命名为 `argocd-manager`）
2. 为该 Service Account 绑定一个 ClusterRole，授予必要的集群资源管理权限
3. 获取该 Service Account 的 Token
4. 将 Token 和 Spoke 集群的 API Server 地址注册到 Hub 集群的 Argo CD 中
5. Argo CD 使用该 Token 向 Spoke 集群发起 API 请求

```
┌─────────────────────┐              ┌─────────────────────────┐
│   Hub Cluster       │              │   Spoke Cluster         │
│                     │              │                         │
│  ┌───────────────┐  │   HTTPS      │  ┌───────────────────┐  │
│  │ Argo CD       │──┼──────────────┼─>│ API Server        │  │
│  │ Controller    │  │  Bearer Token│  │                   │  │
│  └───────┬───────┘  │              │  └────────┬──────────┘  │
│          │          │              │           │              │
│          │          │              │  ┌────────▼──────────┐  │
│  ┌───────▼───────┐  │              │  │ argocd-manager    │  │
│  │ Secret        │  │              │  │ ServiceAccount    │  │
│  │ (cluster-creds)│  │              │  │                   │  │
│  │               │  │              │  │ ClusterRole:      │  │
│  │ server: <url> │  │              │  │  - get,list,watch │  │
│  │ config:       │  │              │  │  - create,update  │  │
│  │  bearerToken  │  │              │  │  - patch,delete   │  │
│  │  caData       │  │              │  └───────────────────┘  │
│  └───────────────┘  │              │                         │
└─────────────────────┘              └─────────────────────────┘
```

### 8.3.3 代码/配置实现

**方式一：使用 argocd CLI 注册集群（推荐）**

```bash
# 确保当前 kubeconfig 包含 Spoke 集群的上下文
kubectl config get-contexts

# 注册 Spoke 集群到 Argo CD
argocd cluster add eks-spoke-dev-cluster \
  --name spoke-dev \
  --namespace argocd \
  --label-env=dev \
  --label-region=us-east-1

# 注册多个集群
argocd cluster add eks-spoke-staging-cluster \
  --name spoke-staging \
  --label-env=staging \
  --label-region=eu-west-1

argocd cluster add eks-spoke-prod-cluster \
  --name spoke-prod \
  --label-env=prod \
  --label-region=ap-southeast-1

# 查看已注册的集群列表
argocd cluster list

# 输出示例：
# SERVER                          NAME            STATUS     MESSAGE
# https://xxxx.gr7.us-east-1.eks  spoke-dev       Successful
# https://yyyy.gr7.eu-west-1.eks  spoke-staging   Successful
# https://zzzz.gr7.ap-southeast-1  spoke-prod      Successful
```

`argocd cluster add` 命令自动完成以下操作：

1. 在 Spoke 集群上创建 `argocd-manager` Service Account（位于 `kube-system` 命名空间）
2. 创建 `argocd-manager-role` ClusterRole，授予必要的权限
3. 创建 `argocd-manager-role-binding` ClusterRoleBinding
4. 获取 Service Account 的 Token
5. 在 Hub 集群的 `argocd` 命名空间中创建一个 Secret，类型标记为 `argocd.argoproj.io/secret-type: cluster`

**方式二：手动创建 Service Account 和 Secret**

当无法直接使用 `argocd cluster add`（例如 Spoke 集群与 Hub 集群网络隔离，或需要自定义权限范围）时，可以手动创建：

```bash
# 在 Spoke 集群上执行
kubectl create namespace argocd

# 创建 Service Account
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-manager
  namespace: kube-system
EOF

# 创建 ClusterRole
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: argocd-manager-role
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - nonResourceURLs: ["*"]
    verbs: ["get", "list"]
EOF

# 创建 ClusterRoleBinding
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: argocd-manager-role-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: argocd-manager-role
subjects:
  - kind: ServiceAccount
    name: argocd-manager
    namespace: kube-system
EOF

# 获取 Token
ARGO_TOKEN=$(kubectl -n kube-system get secret \
  $(kubectl -n kube-system get serviceaccount argocd-manager -o jsonpath='{.secrets[0].name}') \
  -o jsonpath='{.data.token}' | base64 --decode)

# 获取 CA 证书
CA_DATA=$(kubectl config view --raw \
  -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')

# 获取 API Server 地址
SERVER=$(kubectl config view --raw \
  -o jsonpath='{.clusters[0].cluster.server}')
```

然后在 Hub 集群上创建 Secret：

```yaml
# hub-cluster-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: spoke-prod-manual
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: cluster
  annotations:
    # 可选：用于 ApplicationSet 的标签
    env: prod
    region: ap-southeast-1
type: Opaque
stringData:
  name: spoke-prod
  server: "https://XXXXXXXXXXXX.gr7.ap-southeast-1.eks.amazonaws.com"
  config: |
    {
      "bearerToken": "<ARGO_TOKEN>",
      "tlsClientConfig": {
        "insecure": false,
        "caData": "<CA_DATA>"
      }
    }
```

```bash
# 应用 Secret
kubectl apply -f hub-cluster-secret.yaml
```

**限制权限范围**

如果希望 Argo CD 在 Spoke 集群上只拥有特定命名空间的操作权限，可以将 ClusterRole 替换为 Role：

```yaml
# 限制到特定命名空间
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: argocd-manager-role
  namespace: team-a
rules:
  - apiGroups: ["apps", "batch", ""]
    resources: ["deployments", "services", "configmaps", "pods", "jobs"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: argocd-manager-role-binding
  namespace: team-a
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: argocd-manager-role
subjects:
  - kind: ServiceAccount
    name: argocd-manager
    namespace: kube-system
```

**TLS 证书管理**

当 Spoke 集群使用自签名证书或内部 CA 时，需要配置 TLS：

```yaml
# 使用自定义 CA 证书的集群 Secret
apiVersion: v1
kind: Secret
metadata:
  name: spoke-with-custom-ca
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: cluster
type: Opaque
stringData:
  name: spoke-with-custom-ca
  server: "https://internal-api.spoke-cluster.local:6443"
  config: |
    {
      "bearerToken": "<ARGO_TOKEN>",
      "tlsClientConfig": {
        "insecure": false,
        "caData": "<base64-custom-ca-cert>",
        "serverName": "spoke-cluster.internal"
      }
    }
```

### 8.3.4 使用场景

- **自动化集群 onboarding**：通过 CI/CD 流水线自动注册新创建的 EKS 集群
- **跨账号集群管理**：Hub 集群在 AWS 账号 A，Spoke 集群在账号 B/C/D，通过 IAM Role 跨账号访问
- **混合云管理**：Hub 管理多个云厂商（AWS EKS、GCP GKE、Azure AKS）和自建 Kubernetes 集群
- **细粒度权限控制**：为不同团队或不同环境配置不同权限范围的 Service Account

### 8.3.5 潜在风险与注意事项

- **Token 过期**：Kubernetes 1.24+ 默认不再自动创建长期有效的 Service Account Secret。Token 需要定期轮换，建议使用 Token Request API 或外部密钥管理服务
- **权限过大**：默认的 `argocd-manager-role` 授予了几乎全部资源的全部操作权限。生产环境中应根据最小权限原则进行裁剪
- **Secret 泄露**：集群凭据存储在 Hub 集群的 Secret 中，需要确保 Hub 集群自身的 RBAC 配置正确，防止未授权访问
- **网络策略**：如果 Hub 和 Spoke 之间有网络防火墙，需要放行 Hub 到 Spoke API Server 的 HTTPS 流量

### 8.3.6 本章小结

集群注册是 Hub-Spoke 架构的基础设施。通过 Service Account + RBAC 的机制，Argo CD 实现了安全可控的跨集群访问。生产环境中应优先使用 `argocd cluster add` 命令进行注册，并建立 Token 自动轮换机制来保证长期运行的可靠性。

---

## 8.4 ApplicationSet Cluster Generator

### 8.4.1 解决的问题

在多集群环境中，通常需要在多个集群上部署相同或相似的应用。手动为每个集群创建 Application 资源不仅效率低下，而且容易出错。当集群数量增长到数十甚至数百个时，手动管理变得完全不可行。

ApplicationSet Cluster Generator 解决了以下问题：

- **自动发现集群**：自动检测 Argo CD 中注册的所有集群，无需手动维护集群列表
- **动态生成 Application**：为每个匹配条件的集群自动生成对应的 Application 资源
- **集群标签选择**：通过标签选择器精确控制应用部署到哪些集群
- **集群特定参数注入**：将集群的名称、地址、标签等信息注入到 Application 模板中

### 8.4.2 核心原理

Cluster Generator 的工作原理如下：

1. Argo CD 维护一个已注册集群的内部列表
2. Cluster Generator 查询该列表，过滤出匹配标签选择器的集群
3. 对于每个匹配的集群，将集群的元数据作为参数注入到 Application 模板中
4. ApplicationSet Controller 为每个集群生成一个 Application 资源
5. Application Controller 负责将每个 Application 同步到对应的目标集群

```
                    ┌─────────────────────────────┐
                    │   Argo CD Cluster Registry  │
                    │                             │
                    │  ┌───────────────────────┐  │
                    │  │ spoke-dev             │  │
                    │  │  env=dev, region=us   │  │
                    │  ├───────────────────────┤  │
                    │  │ spoke-staging         │  │
                    │  │  env=staging, region=eu│  │
                    │  ├───────────────────────┤  │
                    │  │ spoke-prod            │  │
                    │  │  env=prod, region=ap  │  │
                    │  └───────────────────────┘  │
                    └───────────┬─────────────────┘
                                │
                    ┌───────────▼─────────────────┐
                    │  ApplicationSet             │
                    │                              │
                    │  spec.generators:            │
                    │    - clusters:               │
                    │        selector:             │
                    │          matchLabels:        │
                    │            env: prod         │
                    │                              │
                    │  spec.template:              │
                    │    spec:                     │
                    │      source:                 │
                    │        path: "{{name}}/"     │
                    │      destination:            │
                    │        server: "{{server}}"  │
                    └───────────┬──────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐
          │ Application     │     │ Application     │
          │ spoke-prod-app  │     │ spoke-staging-app│
          │                 │     │                  │
          │ destination:    │     │ destination:     │
          │  spoke-prod     │     │  spoke-staging   │
          └────────┬────────┘     └────────┬─────────┘
                   │                       │
                   ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐
          │ spoke-prod      │     │ spoke-staging    │
          │ (ap-southeast-1)│     │ (eu-west-1)      │
          └─────────────────┘     └─────────────────┘
```

**Cluster Generator 可用的参数变量**

当 Cluster Generator 为每个集群生成 Application 时，会注入以下参数：

| 参数名 | 描述 | 示例值 |
|--------|------|--------|
| `{{name}}` | 集群名称 | `spoke-prod` |
| `{{server}}` | 集群 API Server 地址 | `https://xxxx.gr7.ap-southeast-1.eks` |
| `{{metadata.labels.*}}` | 集群标签 | `{{metadata.labels.env}}` → `prod` |
| `{{clusterLabels.*}}` | 集群标签（别名） | `{{clusterLabels.region}}` → `ap-southeast-1` |
| `{{clusterMetadata.name}}` | 集群名称（与 `{{name}}` 相同） | `spoke-prod` |
| `{{clusterMetadata.server}}` | 集群地址（与 `{{server}}` 相同） | `https://xxxx.gr7...` |
| `{{clusterMetadata.namespace}}` | 集群 Secret 所在命名空间 | `argocd` |
| `{{clusterMetadata.labels}}` | 集群标签映射 | `{"env":"prod","region":"ap"}` |

### 8.4.3 代码/配置实现

**基础示例：部署应用到所有注册集群**

```yaml
# applicationset-all-clusters.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: guestbook-all-clusters
  namespace: argocd
spec:
  generators:
    - clusters: {}
  template:
    metadata:
      name: "guestbook-{{name}}"
      labels:
        app: guestbook
        env: "{{metadata.labels.env}}"
    spec:
      project: default
      source:
        repoURL: https://github.com/example/guestbook-configs
        targetRevision: HEAD
        path: "overlays/{{metadata.labels.env}}"
      destination:
        name: "{{name}}"
        namespace: guestbook
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

**使用标签选择器过滤集群**

```yaml
# applicationset-prod-only.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: guestbook-prod
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            env: prod
          matchExpressions:
            - key: region
              operator: In
              values:
                - ap-southeast-1
                - us-east-1
  template:
    metadata:
      name: "guestbook-prod-{{name}}"
    spec:
      project: default
      source:
        repoURL: https://github.com/example/guestbook-configs
        targetRevision: HEAD
        path: "overlays/prod"
      destination:
        name: "{{name}}"
        namespace: guestbook
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

**使用集群特定值（Cluster-Specific Values）**

```yaml
# applicationset-with-cluster-values.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: app-with-cluster-values
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            env: prod
        # 为每个集群指定不同的 values 文件
        values:
          us-east-1: |
            replicaCount: 5
            domain: us.example.com
          ap-southeast-1: |
            replicaCount: 3
            domain: ap.example.com
          eu-west-1: |
            replicaCount: 4
            domain: eu.example.com
  template:
    metadata:
      name: "myapp-{{name}}"
    spec:
      project: default
      source:
        repoURL: https://github.com/example/myapp-configs
        targetRevision: HEAD
        path: "overlays/prod"
        helm:
          valueFiles:
            - "values-{{metadata.labels.region}}.yaml"
          parameters:
            - name: replicaCount
              value: "{{values.replicaCount}}"
            - name: domain
              value: "{{values.domain}}"
      destination:
        name: "{{name}}"
        namespace: myapp
```

**组合 Generator：Cluster Generator + Git Generator**

```yaml
# applicationset-matrix-generator.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: matrix-cluster-git
  namespace: argocd
spec:
  generators:
    - matrix:
        generators:
          - clusters:
              selector:
                matchLabels:
                  env: prod
          - git:
              repoURL: https://github.com/example/app-configs
              revision: HEAD
              directories:
                - path: "apps/*"
  template:
    metadata:
      name: "{{name}}-{{path.basename}}"
    spec:
      project: default
      source:
        repoURL: https://github.com/example/app-configs
        targetRevision: HEAD
        path: "{{path}}/overlays/{{metadata.labels.env}}"
      destination:
        name: "{{name}}"
        namespace: "{{path.basename}}"
```

### 8.4.4 使用场景

- **全集群基础组件部署**：将监控 Agent（Prometheus Node Exporter、Fluent Bit）、安全 Agent（Falco、Sysdig）、服务网格 Sidecar 等基础组件部署到所有集群
- **多环境部署**：通过标签选择器将不同版本的应用部署到 Dev/Staging/Prod 集群
- **区域差异化配置**：同一应用在不同区域使用不同的副本数、域名、镜像仓库地址
- **灰度发布**：先部署到少量集群验证，再逐步扩展到全部集群

### 8.4.5 潜在风险与注意事项

- **集群标签一致性**：集群注册时的标签必须规范统一，否则 Cluster Generator 的选择器可能无法正确匹配
- **大规模集群性能**：当管理 100+ 集群时，ApplicationSet 的 reconcile 周期可能变长。可以通过调整 `spec.generators[].clusters.maxConcurrency` 控制并发数
- **模板调试困难**：Cluster Generator 的参数注入在运行时完成，模板错误可能直到生成 Application 时才暴露。建议先在单个集群上验证模板
- **误部署风险**：标签选择器配置不当可能导致应用被部署到错误的集群。建议使用 `matchExpressions` 进行多条件过滤

### 8.4.6 本章小结

ApplicationSet Cluster Generator 是 Argo CD 多集群管理的核心能力。它通过自动发现集群、标签过滤和参数注入，实现了"声明式地描述应用应该部署到哪些集群"的编程模型。结合 Matrix Generator，可以构建出灵活而强大的多集群部署策略。

---

## 8.5 实战：多区域部署

### 8.5.1 解决的问题

假设我们运营一个全球化的 Web 服务，需要在三个 AWS 区域部署：

- **us-east-1**（北美）：主区域，处理最大流量
- **eu-west-1**（欧洲）：欧洲用户，需要低延迟
- **ap-southeast-1**（亚太）：亚太用户，需要低延迟

每个区域运行相同的应用代码，但使用不同的配置（域名、数据库连接、副本数等）。我们需要一个统一的 Git 工作流来管理所有区域的部署。

### 8.5.2 核心原理

多区域部署的核心原则是 **"一次配置，多处部署"**：

1. 基础配置（Base）存储在 Git 的公共目录中
2. 区域特定配置（Overlays）通过 Kustomize 的 overlay 机制覆盖
3. ApplicationSet Cluster Generator 根据集群标签自动选择正确的 overlay
4. 每个区域的 ConfigMap 包含该区域的特定参数
5. 流量路由通过外部 DNS 和负载均衡器实现

```
Git 仓库结构：

multi-region-app/
├── base/
│   ├── deployment.yaml        # 通用 Deployment 模板
│   ├── service.yaml           # 通用 Service 模板
│   ├── hpa.yaml               # 通用 HPA 模板
│   └── kustomization.yaml     # 基础 kustomization
├── overlays/
│   ├── us-east-1/
│   │   ├── kustomization.yaml # 引用 base + us-east-1 补丁
│   │   ├── configmap.yaml     # us-east-1 区域配置
│   │   └── ingress.yaml       # us-east-1 入口配置
│   ├── eu-west-1/
│   │   ├── kustomization.yaml
│   │   ├── configmap.yaml     # eu-west-1 区域配置
│   │   └── ingress.yaml
│   └── ap-southeast-1/
│       ├── kustomization.yaml
│       ├── configmap.yaml     # ap-southeast-1 区域配置
│       └── ingress.yaml
└── applicationset.yaml        # ApplicationSet 定义
```

### 8.5.3 代码/配置实现

**步骤 1：注册集群并添加区域标签**

```bash
# 注册三个区域的集群
argocd cluster add eks-us-east-1 --name prod-us-east-1 \
  --label env=prod --label region=us-east-1

argocd cluster add eks-eu-west-1 --name prod-eu-west-1 \
  --label env=prod --label region=eu-west-1

argocd cluster add eks-ap-southeast-1 --name prod-ap-southeast-1 \
  --label env=prod --label region=ap-southeast-1

# 验证注册结果
argocd cluster list
```

**步骤 2：创建基础应用配置**

```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml
  - hpa.yaml

commonLabels:
  app: multi-region-app
  managed-by: argocd
```

```yaml
# base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: multi-region-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: multi-region-app
  template:
    metadata:
      labels:
        app: multi-region-app
    spec:
      containers:
        - name: app
          image: example/multi-region-app:1.0.0
          ports:
            - containerPort: 8080
          env:
            - name: REGION
              valueFrom:
                configMapKeyRef:
                  name: region-config
                  key: region
            - name: DB_ENDPOINT
              valueFrom:
                configMapKeyRef:
                  name: region-config
                  key: db_endpoint
            - name: DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: region-config
                  key: domain
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
```

```yaml
# base/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: multi-region-app
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 8080
  selector:
    app: multi-region-app
```

```yaml
# base/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: multi-region-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: multi-region-app
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

**步骤 3：创建区域特定配置**

```yaml
# overlays/us-east-1/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: region-config
data:
  region: us-east-1
  db_endpoint: "db-us-east-1.internal.example.com:5432"
  domain: "us.example.com"
  replica_count: "5"
  cache_endpoint: "redis-us-east-1.internal.example.com:6379"
```

```yaml
# overlays/eu-west-1/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: region-config
data:
  region: eu-west-1
  db_endpoint: "db-eu-west-1.internal.example.com:5432"
  domain: "eu.example.com"
  replica_count: "3"
  cache_endpoint: "redis-eu-west-1.internal.example.com:6379"
```

```yaml
# overlays/ap-southeast-1/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: region-config
data:
  region: ap-southeast-1
  db_endpoint: "db-ap-southeast-1.internal.example.com:5432"
  domain: "ap.example.com"
  replica_count: "4"
  cache_endpoint: "redis-ap-southeast-1.internal.example.com:6379"
```

```yaml
# overlays/us-east-1/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base
  - configmap.yaml
  - ingress.yaml

patches:
  - patch: |-
      - op: replace
        path: /spec/replicas
        value: 5
    target:
      kind: Deployment
      name: multi-region-app

configMapGenerator:
  - name: region-config
    behavior: replace
    files:
      - configmap.yaml
```

```yaml
# overlays/us-east-1/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: multi-region-app
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/certificate-arn: "arn:aws:acm:us-east-1:123456789:certificate/xxxx"
    external-dns.alpha.kubernetes.io/hostname: "us.example.com"
spec:
  rules:
    - host: us.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: multi-region-app
                port:
                  number: 80
```

**步骤 4：创建 ApplicationSet**

```yaml
# applicationset.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: multi-region-app
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            env: prod
  template:
    metadata:
      name: "multi-region-app-{{name}}"
      labels:
        app: multi-region-app
        env: "{{metadata.labels.env}}"
        region: "{{metadata.labels.region}}"
    spec:
      project: default
      source:
        repoURL: https://github.com/example/multi-region-app
        targetRevision: HEAD
        path: "overlays/{{metadata.labels.region}}"
      destination:
        name: "{{name}}"
        namespace: multi-region-app
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
          - PruneLast=true
        retry:
          limit: 5
          backoff:
            duration: 5s
            factor: 2
            maxDuration: 3m
```

```bash
# 部署 ApplicationSet
kubectl apply -f applicationset.yaml

# 查看生成的 Application
kubectl get applications -n argocd

# 输出示例：
# NAME                              SYNC STATUS   HEALTH STATUS
# multi-region-app-prod-us-east-1    Synced        Healthy
# multi-region-app-prod-eu-west-1   Synced        Healthy
# multi-region-app-prod-ap-southeast-1 Synced     Healthy
```

**步骤 5：配置流量路由**

多区域部署的流量路由通常使用 AWS Route53 的地理位置路由策略：

```
用户请求
    │
    ▼
Route53 (全局 DNS)
    │
    ├── us-east-1 用户 ──> us-east-1 ALB ──> us-east-1 EKS (multi-region-app)
    │
    ├── eu-west-1 用户 ──> eu-west-1 ALB ──> eu-west-1 EKS (multi-region-app)
    │
    └── ap-southeast-1 用户 ──> ap-southeast-1 ALB ──> ap-southeast-1 EKS (multi-region-app)
```

```terraform
# main.tf - Route53 地理位置路由配置（示例）
resource "aws_route53_record" "app_geo" {
  zone_id = var.hosted_zone_id
  name    = "example.com"
  type    = "A"

  set_identifier = "us-east-1"
  geo_location {
    continent_code = "NA"
  }
  alias {
    name                   = module.alb_us_east_1.dns_name
    zone_id                = module.alb_us_east_1.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "app_geo_eu" {
  zone_id = var.hosted_zone_id
  name    = "example.com"
  type    = "A"

  set_identifier = "eu-west-1"
  geo_location {
    continent_code = "EU"
  }
  alias {
    name                   = module.alb_eu_west_1.dns_name
    zone_id                = module.alb_eu_west_1.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "app_geo_ap" {
  zone_id = var.hosted_zone_id
  name    = "example.com"
  type    = "A"

  set_identifier = "ap-southeast-1"
  geo_location {
    continent_code = "AS"
  }
  alias {
    name                   = module.alb_ap_southeast_1.dns_name
    zone_id                = module.alb_ap_southeast_1.zone_id
    evaluate_target_health = true
  }
}
```

**步骤 6：区域级滚动更新**

当需要灰度发布新版本时，可以逐步更新每个区域的 overlay：

```yaml
# 第一阶段：更新 us-east-1（先验证）
# overlays/us-east-1/kustomization.yaml
images:
  - name: example/multi-region-app
    newTag: 1.1.0

# 第二阶段：更新 eu-west-1
# overlays/eu-west-1/kustomization.yaml
images:
  - name: example/multi-region-app
    newTag: 1.1.0

# 第三阶段：更新 ap-southeast-1
# overlays/ap-southeast-1/kustomization.yaml
images:
  - name: example/multi-region-app
    newTag: 1.1.0
```

或者使用 ApplicationSet 的 `maxConcurrency` 控制并发部署：

```yaml
# 在 ApplicationSet 中限制并发数
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            env: prod
  strategy:
    type: RollingSync
    rollingSync:
      steps:
        - matchExpressions:
            - key: region
              operator: In
              values:
                - us-east-1
          maxUpdate: 100%
        - matchExpressions:
            - key: region
              operator: In
              values:
                - eu-west-1
          maxUpdate: 100%
        - matchExpressions:
            - key: region
              operator: In
              values:
                - ap-southeast-1
          maxUpdate: 100%
```

### 8.5.4 使用场景

- **全球 SaaS 服务**：为全球用户提供低延迟访问，同时满足 GDPR 等数据驻留法规
- **内容分发网络**：在多个区域部署内容服务，配合全局负载均衡实现就近访问
- **金融合规**：某些金融监管要求数据必须在特定区域内处理，多区域部署可以满足这一要求
- **灾难恢复**：主区域故障时，通过 DNS 切换将流量导向备用区域

### 8.5.5 潜在风险与注意事项

- **配置漂移**：各区域的 overlay 配置可能随时间产生差异，需要定期审计确保一致性
- **数据库同步**：多区域部署需要解决数据库跨区域同步问题，通常使用主动-被动或多主复制方案
- **DNS 缓存**：DNS 变更存在 TTL 延迟，故障切换时流量不会立即转移
- **跨区域依赖**：如果应用依赖全局服务（如统一认证服务），需要确保该服务在所有区域都可访问
- **成本**：多区域部署意味着基础设施成本成倍增加，需要评估收益是否覆盖成本

### 8.5.6 本章小结

通过 ApplicationSet Cluster Generator 实现多区域部署，是 Argo CD 多集群管理能力的典型应用。结合 Kustomize overlay 机制，可以实现"基础配置统一、区域配置差异化"的部署模式。配合外部 DNS 和全局负载均衡器，可以构建出生产级别的全球多区域服务体系。

---

## 8.6 潜在风险与最佳实践

### 8.6.1 网络延迟：Hub 与 Spoke 之间的通信

**风险描述**

Hub 集群与 Spoke 集群之间的网络延迟是最大的潜在风险。当 Hub 和 Spoke 位于不同区域时，每次 Argo CD 的 sync/reconcile 操作都需要跨区域 API 调用。跨区域的网络延迟通常在 50ms-300ms 之间，而 Argo CD 的 reconcile 周期默认是 3 分钟，每次 reconcile 可能需要数十到数百次 API 调用。

**影响分析**

```
场景：Hub 在 us-east-1，Spoke 在 ap-southeast-1
延迟：约 150ms

一次典型的 reconcile 流程：
1. 列出所有 Application（1 次调用）
2. 比较期望状态和实际状态（N 次调用，N = 资源数量）
3. 执行 sync（M 次调用，M = 需要更新的资源数量）

假设管理 50 个资源，每次 reconcile 需要约 100 次 API 调用
额外延迟 = 100 × 150ms = 15 秒
```

**解决方案**

```yaml
# 调整 Argo CD 的 reconcile 参数
# argocd-cm ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  # 增加 reconcile 超时时间（默认 180 秒）
  timeout.reconciliation: "300s"
  # 为远程集群设置更长的操作超时
  timeout.operation: "120s"
  # 禁用状态缓存（如果状态频繁变化）
  status.enable.cache: "true"
```

```yaml
# 为每个 Application 设置独立的 sync 策略
apiVersion: argoproj.io/v1alpha1
kind: Application
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    retry:
      limit: 3
      backoff:
        duration: 10s
        factor: 2
        maxDuration: 60s
```

**最佳实践**

- 将 Hub 集群部署在中心区域（如 us-east-1），使其到各区域的网络延迟相对均衡
- 对于延迟敏感的场景，考虑在每个区域部署独立的 Argo CD 实例（区域级 Hub）
- 使用 Argo CD 的 `status.enable.cache` 减少跨区域 API 调用
- 监控 Hub 到 Spoke 的网络延迟，设置告警阈值

### 8.6.2 集群认证过期

**风险描述**

Kubernetes 1.24+ 版本默认不再为 Service Account 自动创建长期有效的 Secret。Service Account Token 的过期时间取决于 Token 的签发方式：

| Token 类型 | 有效期 | 自动轮换 |
|-----------|--------|---------|
| 静态 Secret Token（1.24 之前） | 永不过期 | 否 |
| TokenRequest API（1.24+） | 默认 1 年 | 取决于实现 |
| EKS 集群的 IAM 认证 | IAM Role 有效期 | 通过 awscli 刷新 |
| OIDC Token | 取决于 IdP 配置 | 取决于 IdP |

当 Token 过期后，Argo CD 将无法再管理该 Spoke 集群上的应用，表现为 Application 状态变为 `Unknown` 或 `OutOfSync`。

**解决方案**

方案一：使用 TokenRequest API 创建长期 Token（适用于 1.24+）

```bash
# 在 Spoke 集群上创建绑定到 Service Account 的长期 Token
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: argocd-manager-token
  namespace: kube-system
  annotations:
    kubernetes.io/service-account.name: argocd-manager
type: kubernetes.io/service-account-token
EOF

# 获取 Token
ARGO_TOKEN=$(kubectl get secret argocd-manager-token -n kube-system \
  -o jsonpath='{.data.token}' | base64 --decode)
```

方案二：使用外部密钥管理服务自动轮换

```yaml
# 使用 External Secrets Operator 自动管理集群凭据
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: spoke-cluster-credential
  namespace: argocd
spec:
  refreshInterval: "24h"
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: cluster-spoke-prod
    template:
      metadata:
        labels:
          argocd.argoproj.io/secret-type: cluster
  data:
    - secretKey: name
      remoteRef:
        key: argocd/cluster-credentials/spoke-prod
        property: name
    - secretKey: server
      remoteRef:
        key: argocd/cluster-credentials/spoke-prod
        property: server
    - secretKey: config
      remoteRef:
        key: argocd/cluster-credentials/spoke-prod
        property: config
```

方案三：定期刷新脚本

```bash
#!/bin/bash
# refresh-cluster-token.sh
# 定期刷新所有 Spoke 集群的 Token

CLUSTERS=("spoke-dev" "spoke-staging" "spoke-prod")

for cluster in "${CLUSTERS[@]}"; do
  echo "Refreshing token for $cluster..."

  # 切换到 Spoke 集群上下文
  kubectl config use-context "$cluster"

  # 删除旧的 Token Secret
  kubectl delete secret argocd-manager-token -n kube-system --ignore-not-found

  # 创建新的 Token Secret
  cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: argocd-manager-token
  namespace: kube-system
  annotations:
    kubernetes.io/service-account.name: argocd-manager
type: kubernetes.io/service-account-token
EOF

  # 获取新 Token
  NEW_TOKEN=$(kubectl get secret argocd-manager-token -n kube-system \
    -o jsonpath='{.data.token}' | base64 --decode)

  # 更新 Hub 集群上的 Secret
  kubectl config use-context hub-cluster
  kubectl get secret "cluster-$cluster" -n argocd -o json \
    | jq --arg token "$NEW_TOKEN" '.data.config |= (fromjson | .bearerToken = $token | tojson | @base64)' \
    | kubectl apply -f -

  echo "Token refreshed for $cluster"
done
```

### 8.6.3 跨集群依赖管理

**风险描述**

在多集群环境中，应用之间可能存在跨集群依赖关系。例如：

- 服务 A 部署在 us-east-1，需要调用部署在 eu-west-1 的服务 B
- 全局配置服务需要在所有集群就绪后才能启动
- 数据库迁移需要在主区域完成后，从区域才能开始部署

Argo CD 本身不提供跨集群的依赖管理能力，每个 Application 的同步是独立的。

**解决方案**

方案一：使用 Sync Waves 控制同一集群内的资源依赖

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-with-dependencies
spec:
  source:
    repoURL: https://github.com/example/app
    path: .
  destination:
    name: spoke-prod
    namespace: myapp
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
---
# 在资源上标注 Sync Wave
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  annotations:
    argocd.argoproj.io/sync-wave: "-5"  # 最先执行
spec:
  template:
    spec:
      containers:
        - name: migration
          image: example/db-migration:1.0.0
      restartPolicy: Never
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  annotations:
    argocd.argoproj.io/sync-wave: "0"  # 默认 wave
spec:
  ...
---
apiVersion: v1
kind: Service
metadata:
  name: myapp
  annotations:
    argocd.argoproj.io/sync-wave: "1"  # 最后创建
spec:
  ...
```

方案二：使用 PreSync/PostSync Hooks 实现跨集群协调

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-primary-region
spec:
  source:
    repoURL: https://github.com/example/app
    path: overlays/us-east-1
  destination:
    name: prod-us-east-1
    namespace: myapp
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-secondary-region
  annotations:
    # 等待主区域同步完成后再同步
    argocd.argoproj.io/sync-wave: "1"
spec:
  source:
    repoURL: https://github.com/example/app
    path: overlays/eu-west-1
  destination:
    name: prod-eu-west-1
    namespace: myapp
```

方案三：使用外部编排工具

对于复杂的跨集群依赖，建议使用专门的编排工具（如 Argo Workflows、Tekton）来协调多集群部署顺序：

```yaml
# Argo Workflow 示例：按顺序部署到多个集群
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: multi-cluster-rollout
spec:
  entrypoint: rollout
  templates:
    - name: rollout
      steps:
        - - name: deploy-us-east
            template: deploy-region
            arguments:
              parameters:
                - name: region
                  value: us-east-1
        - - name: wait-for-health
            template: health-check
            arguments:
              parameters:
                - name: region
                  value: us-east-1
        - - name: deploy-eu-west
            template: deploy-region
            arguments:
              parameters:
                - name: region
                  value: eu-west-1
        - - name: deploy-ap-southeast
            template: deploy-region
            arguments:
              parameters:
                - name: region
                  value: ap-southeast-1

    - name: deploy-region
      inputs:
        parameters:
          - name: region
      script:
        image: argocli:latest
        command: [argocd]
        args:
          - app
          - sync
          - "multi-region-app-prod-{{inputs.parameters.region}}"
          - --prune
          - --wait
```

### 8.6.4 其他风险与最佳实践汇总

| 风险类别 | 风险描述 | 缓解措施 |
|---------|---------|---------|
| Hub 单点故障 | Hub 集群不可用时无法进行新部署 | Hub 集群多可用区部署；制定 DR 计划 |
| 配置漂移 | 各集群配置随时间产生差异 | 定期审计；使用 Kustomize/Helm 统一管理 |
| 密钥泄露 | 集群凭据存储在 Secret 中 | 加密存储；最小权限；定期轮换 |
| 资源竞争 | 多个 Application 同时同步到同一集群 | 设置 maxConcurrency；使用 sync wave |
| 版本兼容性 | 不同集群的 K8s 版本不同 | 在 CI 中测试多版本兼容性 |
| 成本失控 | 多集群导致基础设施成本倍增 | 使用标签追踪成本；定期清理未使用资源 |

**监控与告警**

```yaml
# PrometheusRule 示例：监控集群连接状态
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: argocd-cluster-alerts
  namespace: monitoring
spec:
  groups:
    - name: argocd-cluster
      rules:
        - alert: ArgoCDClusterUnreachable
          expr: |
            argocd_cluster_connection_status{status="Unreachable"} == 1
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Argo CD cannot reach cluster {{ $labels.name }}"
            description: "Cluster {{ $labels.name }} ({{ $labels.server }}) has been unreachable for 5 minutes"

        - alert: ArgoCDClusterSyncFailure
          expr: |
            argocd_app_info{sync_status="OutOfSync"} > 0
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Application {{ $labels.name }} is OutOfSync"
            description: "Application {{ $labels.name }} on cluster {{ $labels.destination_cluster }} is out of sync"

        - alert: ArgoCDClusterTokenExpiring
          expr: |
            time() - argocd_cluster_info_created > 86400 * 30
          labels:
            severity: warning
          annotations:
            summary: "Cluster {{ $labels.name }} token is 30+ days old"
            description: "Consider rotating the service account token for cluster {{ $labels.name }}"
```

### 8.6.5 本章小结

多集群管理虽然带来了架构上的灵活性，但也引入了网络延迟、认证过期、依赖管理等新的风险。这些风险并非 Argo CD 特有的问题，而是分布式系统固有的挑战。通过合理的架构设计（如区域级 Hub）、自动化运维（如 Token 自动轮换）和适当的监控告警，可以将这些风险控制在可接受的范围内。核心原则是：**能自动化的事情不要手动做，能提前发现的问题不要等到故障发生**。

---

## 8.7 本章总结

多集群管理是 Argo CD 最强大的能力之一，也是从"管理一个集群"到"管理一群集群"的质变。本章涵盖了以下核心内容：

1. **多集群场景**：多区域部署、环境隔离、租户隔离是三种最常见的多集群需求，每种场景对一致性、隔离性和延迟的要求各不相同

2. **Hub-Spoke 架构**：通过集中控制面管理分布式数据面，在管理效率和故障隔离之间取得平衡。Hub 集群的高可用设计是架构成功的基础

3. **集群注册**：基于 Service Account + RBAC 的认证授权机制，支持细粒度的权限控制。Token 生命周期管理是生产环境中的关键运维事项

4. **ApplicationSet Cluster Generator**：自动发现集群、标签过滤、参数注入三位一体，实现了声明式的多集群部署策略。结合 Matrix Generator 可以构建更复杂的部署模式

5. **多区域部署实战**：通过 Kustomize overlay + Cluster Generator 的组合，实现了"一次配置，全球部署"的自动化工作流

6. **风险与最佳实践**：网络延迟、认证过期、跨集群依赖是三大核心风险，需要通过架构设计、自动化运维和监控告警来系统性地应对

**下一步学习方向**：

- 结合 Argo Rollouts 实现多集群蓝绿部署和金丝雀发布
- 使用 Argo Workflows 编排复杂的多集群部署流水线
- 探索 Cluster API（CAPI）与 Argo CD 的集成，实现集群生命周期的完全自动化
- 研究服务网格（Istio/Ambient Mesh）在多集群场景下的流量管理
