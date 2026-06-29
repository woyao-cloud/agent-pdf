# 第三章 EKS 集群搭建与 Argo CD 安装

---

## 3.1 概述

本章聚焦于 Amazon EKS（Elastic Kubernetes Service）集群的完整搭建流程，以及 Argo CD 在 EKS 上的安装与配置。我们将从基础设施即代码（IaC）的角度出发，分别使用 `eksctl` 和 Terraform 两种主流工具完成集群创建，随后深入讲解 IAM 权限模型、OIDC 集成、IRSA 机制，最后完成 Argo CD 的高可用部署并配置 TLS 和 Ingress。

本章的目标是让读者能够独立搭建一个生产就绪的 EKS 集群，并成功部署 Argo CD 作为 GitOps 的核心组件。

---

## 3.2 EKS 集群创建

### 3.2.1 解决的问题

在传统 Kubernetes 集群搭建中，运维人员需要自行管理控制平面（Control Plane）、etcd 集群、证书签发、节点加入等复杂操作。EKS 作为托管 Kubernetes 服务，由 AWS 负责控制平面的高可用性、安全补丁和版本升级，用户只需关注工作节点（Worker Nodes）和应用的部署。本章要解决的核心问题包括：

- 如何以可重复、声明式的方式创建 EKS 集群
- 如何选择并配置合适的节点组
- 如何确保集群网络、安全组和 IAM 权限的正确设置
- 如何为后续的 Argo CD 安装奠定基础设施基础

### 3.2.2 核心原理

EKS 集群的核心架构分为三个层次：

1. **控制平面（Control Plane）**：AWS 管理的 Kubernetes API Server、etcd 集群和控制器管理器，跨三个可用区（AZ）部署以实现高可用。用户无法直接访问控制平面节点，只能通过 API Server 端点进行交互。

2. **工作节点（Worker Nodes）**：运行用户容器的 EC2 实例，通过托管节点组（Managed Node Group）或自管理节点组（Self-Managed Node Group）加入集群。节点自动注册到集群，并接收来自控制平面的调度指令。

3. **网络层**：EKS 要求每个集群至少配置两个子网（通常跨两个 AZ），使用 AWS VPC CNI 插件为 Pod 分配 VPC 内的 IP 地址，实现 Pod 与 Pod、Pod 与服务的直接通信。

创建 EKS 集群的两种主流方式各有侧重：

- **eksctl**：Weaveworks 开发的 CLI 工具，封装了 CloudFormation 模板，提供最简化的创建体验，适合快速启动和开发测试环境。
- **Terraform**：HashiCorp 的 IaC 工具，通过 AWS Provider 和社区 EKS Module 实现精细化的资源管理，适合生产环境和对状态管理有严格要求的场景。

### 3.2.3 代码/配置实现

#### 3.2.3.1 使用 eksctl 创建集群

eksctl 是创建 EKS 集群最快捷的方式。以下是一个生产级别的配置文件示例：

```yaml
# cluster-config.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: production-cluster
  region: ap-northeast-1
  version: "1.30"

vpc:
  cidr: 10.0.0.0/16
  nat:
    gateway: HighlyAvailable  # 每个 AZ 一个 NAT 网关

managedNodeGroups:
  - name: platform-node-group
    instanceType: m6i.xlarge
    minSize: 3
    maxSize: 10
    desiredSize: 3
    volumeSize: 100
    volumeType: gp3
    labels:
      node-type: platform
    tags:
      Environment: production
      NodeGroup: platform
    iam:
      withAddonPolicies:
        autoScaler: true
        cloudWatch: true
        albIngress: true
    availabilityZones: ["ap-northeast-1a", "ap-northeast-1b", "ap-northeast-1c"]
    ssh:
      allow: false
    updateConfig:
      maxUnavailablePercentage: 50

  - name: spot-node-group
    instanceType: c6i.large
    spot: true
    minSize: 0
    maxSize: 20
    desiredSize: 0
    labels:
      node-type: spot
      lifecycle: Ec2Spot
    taints:
      - key: spot
        value: "true"
        effect: NoSchedule
    tags:
      Environment: production
      NodeGroup: spot

iam:
  withOIDC: true  # 启用 OIDC Provider，IRSA 的前置条件
  serviceAccounts:
    - metadata:
        name: cluster-autoscaler
        namespace: kube-system
      attachPolicyARNs:
        - "arn:aws:iam::aws:policy/AmazonEKSClusterAutoscalerPolicy"
    - metadata:
        name: aws-load-balancer-controller
        namespace: kube-system
      attachPolicyARNs:
        - "arn:aws:iam::aws:policy/AmazonEKSLoadBalancerControllerPolicy"

cloudWatch:
  clusterLogging:
    enableTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"]
    logRetentionInDays: 90
```

执行创建命令：

```bash
eksctl create cluster -f cluster-config.yaml --verbose 4
```

创建完成后验证集群状态：

```bash
eksctl get cluster --region ap-northeast-1
kubectl cluster-info --context arn:aws:eks:ap-northeast-1:<ACCOUNT_ID>:cluster/production-cluster
kubectl get nodes -o wide
```

#### 3.2.3.2 使用 Terraform 创建集群

Terraform 方式提供了更细粒度的控制。以下使用社区 EKS Module（`terraform-aws-eks`）：

```hcl
# main.tf
provider "aws" {
  region = var.region
}

data "aws_availability_zones" "available" {
  state = "available"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "eks-vpc"
  cidr = "10.0.0.0/16"

  azs             = slice(data.aws_availability_zones.available.names, 0, 3)
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = false
  enable_dns_hostnames   = true
  enable_dns_support     = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "production-cluster"
  cluster_version = "1.30"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access           = true
  cluster_endpoint_private_access          = true
  cluster_endpoint_public_access_cidrs     = ["<YOUR_OFFICE_IP>/32"]
  enable_cluster_creator_admin_permissions = true

  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
  }

  eks_managed_node_groups = {
    platform = {
      instance_types = ["m6i.xlarge", "m6a.xlarge"]
      min_size       = 3
      max_size       = 10
      desired_size   = 3
      capacity_type  = "ON_DEMAND"
      subnet_ids     = module.vpc.private_subnets

      labels = {
        node-type = "platform"
      }

      tags = {
        Environment = "production"
      }
    }

    spot = {
      instance_types = ["c6i.large", "c6a.large", "c5.large"]
      min_size       = 0
      max_size       = 30
      desired_size   = 0
      capacity_type  = "SPOT"

      taints = [
        {
          key    = "spot"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]

      tags = {
        Environment = "production"
      }
    }
  }

  node_security_group_additional_rules = {
    cluster_ingress_self = {
      description = "Node to node all ports"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "ingress"
      self        = true
    }
  }
}
```

执行 Terraform 部署：

```bash
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

获取 kubeconfig：

```bash
aws eks update-kubeconfig --region ap-northeast-1 --name production-cluster
```

#### 3.2.3.3 节点组配置详解

**托管节点组（Managed Node Group）** 与 **自管理节点组（Self-Managed Node Group）** 的核心区别：

| 特性 | 托管节点组 | 自管理节点组 |
|------|-----------|-------------|
| 节点 AMI 更新 | AWS 自动管理 | 用户自行管理 |
| 节点替换策略 | 滚动更新，AWS 控制 | 用户自定义 |
| 自动修复 | 支持（节点健康检查） | 需自行实现 |
| 启动模板 | 可选，可自定义 | 必须 |
| 节点升级 | eksctl 或 AWS 控制台 | 手动或通过 Auto Scaling Group |
| 适用场景 | 标准工作负载 | 需要深度定制 AMI 或启动配置 |

**实例类型选择建议：**

- **通用型（m6i/m6a）**：CPU 和内存均衡，适合 Argo CD、控制面组件、Web 服务
- **计算优化型（c6i/c7g）**：CPU 密集任务，适合 CI/CD 构建、数据处理
- **内存优化型（r6i/r7g）**：内存密集任务，适合缓存、数据库
- **GPU 实例（p4d/g5）**：机器学习训练和推理

**扩缩容策略：**

```yaml
# cluster-autoscaler 配置示例
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-autoscaler-status
  namespace: kube-system
data:
  status: |
    # 节点组扩缩容范围
    # 最小 3 个 On-Demand 节点 + 0 个 Spot 节点
    # 最大 10 个 On-Demand + 20 个 Spot
    # Cluster Autoscaler 根据 Pending Pod 自动调整
```

### 3.2.4 使用场景

- **开发/测试环境**：使用 eksctl 单命令创建，配合 `--fargate` 参数实现无服务器节点
- **生产环境**：使用 Terraform 管理，多 AZ 部署，混合使用 On-Demand 和 Spot 实例降低成本
- **多集群架构**：Terraform 通过 Module 参数化实现多环境（dev/staging/prod）集群创建
- **合规环境**：通过 Terraform 控制每个资源的 IAM 策略、安全组规则和加密配置

### 3.2.5 潜在风险与注意事项

1. **eksctl 版本与 EKS API 版本不匹配**：eksctl 的 `apiVersion` 字段（如 `v1alpha5`）对应不同的功能集，升级 eksctl 后需检查配置文件的兼容性
2. **VPC CIDR 规划不足**：EKS 使用 VPC CNI，每个 Pod 占用一个 VPC IP 地址，CIDR 过小会导致 IP 耗尽。建议使用 `/16` 或更大的 CIDR，或启用 VPC CNI 的自定义网络（Custom Networking）功能
3. **Spot 实例中断**：Spot 实例可能随时被回收，需配合 Pod Disruption Budget（PDB）和 Cluster Autoscaler 的 Spot 感知调度
4. **控制平面日志**：默认不启用 CloudWatch 日志，需显式开启。日志费用可能较高，建议设置合理的保留期
5. **集群升级**：EKS 不支持跨大版本升级（如 1.28 → 1.30），需先升级到 1.29 再升级到 1.30。每个版本升级前需检查 API 弃用清单

### 3.2.6 本章小结

本节介绍了使用 eksctl 和 Terraform 两种方式创建 EKS 集群的完整流程。eksctl 适合快速原型验证，Terraform 适合生产环境的精细化管理。节点组配置方面，托管节点组降低了运维复杂度，而自管理节点组提供了更高的灵活性。在实际项目中，建议将集群创建代码纳入版本管理，并通过 CI/CD 管道执行 Terraform 计划，确保基础设施变更的可追溯性。

---

## 3.3 IAM 角色与权限配置

### 3.3.1 解决的问题

Kubernetes 集群中的 Pod 经常需要访问 AWS 服务（如 S3、DynamoDB、ECR），传统做法是将 AWS 凭证硬编码到环境变量或 Secret 中，这带来了严重的安全风险。EKS 通过 OIDC（OpenID Connect）集成和 IRSA（IAM Roles for Service Accounts）机制，允许将 IAM 角色直接关联到 Kubernetes Service Account，Pod 运行时自动获取临时凭证，无需管理长期密钥。

### 3.3.2 核心原理

IRSA 的工作流程如下：

1. **OIDC Provider 注册**：EKS 集群创建时会生成一个 OIDC 发现端点（URL），格式为 `https://oidc.eks.<region>.amazonaws.com/id/<ID>`。需要在 IAM 中注册该端点为 OIDC Identity Provider
2. **IAM Role 创建**：创建 IAM Role，信任策略（Trust Policy）中指定 OIDC Provider 和允许的 Service Account
3. **Service Account 注解**：在 Kubernetes Service Account 上添加注解 `eks.amazonaws.com/role-arn: arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_NAME>`
4. **Pod 注入**：EKS Pod Identity Webhook 自动向 Pod 注入 AWS 环境变量（`AWS_ROLE_ARN`、`AWS_WEB_IDENTITY_TOKEN_FILE`），AWS SDK 通过这些变量获取临时凭证

整个流程无需管理任何长期凭证，临时凭证由 AWS STS 自动轮换，默认有效期 1 小时。

### 3.3.3 代码/配置实现

#### 3.3.3.1 创建 OIDC Provider

使用 eksctl 自动创建（已在集群配置中启用 `iam.withOIDC: true`）：

```bash
eksctl utils associate-iam-oidc-provider --cluster production-cluster --approve
```

使用 Terraform 创建：

```hcl
data "tls_certificate" "eks" {
  url = module.eks.cluster_oidc_issuer_url
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = module.eks.cluster_oidc_issuer_url
}
```

#### 3.3.3.2 为 Argo CD 创建 IRSA

Argo CD 需要访问 ECR 拉取镜像、更新 Route53 DNS 记录等操作。以下是为 Argo CD 创建最小权限 IRSA 的 Terraform 代码：

```hcl
# Argo CD IRSA
data "aws_iam_policy_document" "argocd_trust" {
  statement {
    effect = "Allow"
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }
    actions = ["sts:AssumeRoleWithWebIdentity"]
    condition {
      test     = "StringEquals"
      variable = "${replace(module.eks.cluster_oidc_issuer_url, "https://", "")}:sub"
      values   = ["system:serviceaccount:argocd:argocd-server"]
    }
  }
}

resource "aws_iam_role" "argocd" {
  name               = "eks-argocd-role"
  assume_role_policy = data.aws_iam_policy_document.argocd_trust.json
}

data "aws_iam_policy_document" "argocd_permissions" {
  # ECR 镜像拉取
  statement {
    effect = "Allow"
    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetAuthorizationToken"
    ]
    resources = ["*"]
  }

  # Route53 DNS 更新（用于 Argo CD 的 DNS 挑战）
  statement {
    effect = "Allow"
    actions = [
      "route53:ChangeResourceRecordSets",
      "route53:ListHostedZones",
      "route53:GetChange"
    ]
    resources = ["*"]
  }

  # S3 读取部署配置
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket"
    ]
    resources = [
      "arn:aws:s3:::argocd-config-bucket",
      "arn:aws:s3:::argocd-config-bucket/*"
    ]
  }
}

resource "aws_iam_role_policy" "argocd" {
  name   = "argocd-policy"
  role   = aws_iam_role.argocd.name
  policy = data.aws_iam_policy_document.argocd_permissions.json
}
```

#### 3.3.3.3 为 Argo CD 组件创建独立的 Service Account

```yaml
# argocd-irsa.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-server
  namespace: argocd
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<ACCOUNT_ID>:role/eks-argocd-role
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-application-controller
  namespace: argocd
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<ACCOUNT_ID>:role/eks-argocd-controller-role
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-repo-server
  namespace: argocd
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<ACCOUNT_ID>:role/eks-argocd-repo-role
```

#### 3.3.3.4 最小权限原则

为每个 Argo CD 组件分配独立的 IAM Role，遵循最小权限原则：

| 组件 | 需要的 AWS 权限 | 理由 |
|------|----------------|------|
| argocd-server | ECR 只读、Route53 只读 | API 和 UI 操作，无需写权限 |
| argocd-application-controller | ECR 只读、S3 只读 | 同步应用状态，需要读取制品 |
| argocd-repo-server | ECR 只读、Git 凭证管理 | 克隆仓库，需要读取镜像 |
| argocd-dex（可选） | 无 | SSO 认证，仅需 OIDC 通信 |

### 3.3.4 使用场景

- **ECR 镜像拉取**：Argo CD 部署应用时从 ECR 拉取容器镜像，无需在每个节点上配置 docker login
- **S3 配置存储**：Argo CD 从 S3 读取 Helm Chart 或 Kustomize 配置
- **Route53 DNS 管理**：通过 ExternalDNS 或 Argo CD 自动管理 DNS 记录
- **Secrets Manager 集成**：Argo CD 通过 IRSA 读取 AWS Secrets Manager 中的敏感信息

### 3.3.5 潜在风险与注意事项

1. **OIDC Provider 信任策略过于宽松**：`sub` 条件应精确到 `system:serviceaccount:<namespace>:<name>`，避免使用通配符
2. **Token 过期**：IRSA 使用的 OIDC Token 默认有效期 24 小时，但 AWS SDK 会在凭证过期前自动刷新。如果使用非 AWS SDK 的客户端，需注意 Token 刷新逻辑
3. **Service Account 注解冲突**：如果同时使用 `eks.amazonaws.com/role-arn` 和 `kube2iam` 或 `kiam` 注解，会导致冲突
4. **跨账户访问**：IRSA 支持跨账户 IAM Role 访问，但需在信任策略中正确配置 `aud` 条件
5. **Pod Identity Webhook 故障**：如果 Webhook 不可用，新 Pod 将无法获取 IRSA 凭证。建议将 Webhook 部署为 DaemonSet 或使用高可用部署

### 3.3.6 本章小结

IRSA 是 EKS 上管理 AWS 凭证的最佳实践。通过 OIDC 集成，Kubernetes Pod 可以安全地获取临时 AWS 凭证，无需管理长期密钥。在 Argo CD 的部署中，为每个组件创建独立的 IAM Role 并遵循最小权限原则，可以有效降低安全风险。IRSA 的配置应在集群创建阶段完成，因为 OIDC Provider 的创建需要集群创建后的操作。

---

## 3.4 Argo CD 安装

### 3.4.1 解决的问题

Argo CD 是 Kubernetes 的声明式 GitOps 工具，它持续监控 Git 仓库中的应用定义，并与集群中的实际状态进行对比，自动或手动将集群状态同步到 Git 中定义的状态。安装 Argo CD 需要解决以下问题：

- 如何选择正确的安装方法（Helm Chart vs 纯 YAML）
- 如何配置高可用部署
- 如何配置 TLS 证书和 Ingress 入口
- 如何确保 Argo CD 版本与 Kubernetes 版本兼容

### 3.4.2 核心原理

Argo CD 的核心组件包括：

1. **argocd-server**：提供 gRPC/REST API 和 Web UI，处理认证、授权和应用同步请求
2. **argocd-application-controller**：持续监控已注册的应用，对比 Git 中的期望状态和集群中的实际状态
3. **argocd-repo-server**：负责克隆 Git 仓库、生成 Helm/Kustomize 清单，并缓存结果
4. **argocd-dex**（可选）：提供 OIDC 身份认证代理，支持与多种 SSO 提供商集成
5. **argocd-redis**：缓存仓库数据和应用状态，减少对 Git 仓库的直接访问

Argo CD 的工作流程：

```
Git 仓库 → argocd-repo-server（生成清单）→ argocd-application-controller（对比状态）
                                                      ↓
                                               argocd-server（展示差异，执行同步）
                                                      ↓
                                               Kubernetes API Server（应用变更）
```

### 3.4.3 代码/配置实现

#### 3.4.3.1 使用 Helm Chart 安装（推荐）

Helm Chart 是安装 Argo CD 的推荐方式，提供了最灵活的配置能力。

**添加 Helm 仓库：**

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
```

**创建命名空间：**

```bash
kubectl create namespace argocd
```

**高可用配置 values 文件：**

```yaml
# argocd-values-ha.yaml
global:
  domain: argocd.example.com

# 高可用配置
controller:
  replicas: 2
  resources:
    requests:
      cpu: 1000m
      memory: 1024Mi
    limits:
      cpu: 2000m
      memory: 2048Mi
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: argocd-application-controller
            topologyKey: topology.kubernetes.io/zone

server:
  replicas: 2
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1024Mi
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80
    targetMemoryUtilizationPercentage: 80
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: argocd-server
            topologyKey: topology.kubernetes.io/zone
  ingress:
    enabled: true
    ingressClassName: alb
    annotations:
      alb.ingress.kubernetes.io/scheme: internet-facing
      alb.ingress.kubernetes.io/target-type: ip
      alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
      alb.ingress.kubernetes.io/certificate-arn: "arn:aws:acm:ap-northeast-1:<ACCOUNT_ID>:certificate/<CERT_ID>"
      alb.ingress.kubernetes.io/ssl-policy: ELBSecurityPolicy-TLS13-1-2-2021-06
      alb.ingress.kubernetes.io/healthcheck-path: /healthz
      alb.ingress.kubernetes.io/success-codes: "200"
      alb.ingress.kubernetes.io/group.name: argocd
    hosts:
      - argocd.example.com
    paths:
      - path: /
        pathType: Prefix

repoServer:
  replicas: 2
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1024Mi
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: argocd-repo-server
            topologyKey: topology.kubernetes.io/zone
  mountSatoken: true
  serviceAccount:
    create: true
    annotations:
      eks.amazonaws.com/role-arn: arn:aws:iam::<ACCOUNT_ID>:role/eks-argocd-repo-role

dex:
  enabled: false  # 如果使用 ALB 直接处理 TLS，可以禁用 Dex

redis:
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

configs:
  params:
    server.insecure: true  # 在 ALB 层面终止 TLS，Argo CD 内部使用 HTTP
  cm:
    url: https://argocd.example.com
    oidc.config: |
      name: AWS Cognito
      issuer: https://cognito-idp.ap-northeast-1.amazonaws.com/<POOL_ID>
      clientID: <COGNITO_CLIENT_ID>
      clientSecret: $argocd-secret:oidc.cognito.clientSecret
      requestedScopes:
        - openid
        - email
        - profile
      requestedIDTokenClaims:
        - groups
  rbac:
    policy.default: role:readonly
    policy.csv: |
      g, admin-team, role:admin
      g, dev-team, role:readonly
    scopes: "[email, groups]"
```

**安装 Argo CD：**

```bash
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd \
  --values argocd-values-ha.yaml \
  --version 7.x.x \
  --wait \
  --timeout 15m
```

#### 3.4.3.2 使用纯 YAML 安装（快速开始）

适用于快速验证环境，不推荐生产使用：

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

#### 3.4.3.3 ALB Ingress Controller 配置

如果使用 ALB Ingress，需要先安装 AWS Load Balancer Controller：

```bash
# 使用 Helm 安装 AWS Load Balancer Controller
helm repo add eks https://aws.github.io/eks-charts
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=production-cluster \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::<ACCOUNT_ID>:role/eks-alb-controller-role
```

#### 3.4.3.4 cert-manager 集成（替代 ALB 自带证书）

如果不想在 ALB 层面管理证书，可以使用 cert-manager 在集群内部管理 TLS：

```bash
# 安装 cert-manager
helm repo add jetstack https://charts.jetstack.io
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::<ACCOUNT_ID>:role/eks-cert-manager-role
```

```yaml
# cert-manager-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-private-key
    solvers:
      - dns01:
          route53:
            region: ap-northeast-1
            hostedZoneID: <ZONE_ID>
```

```yaml
# argocd-certificate.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: argocd-tls
  namespace: argocd
spec:
  secretName: argocd-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - argocd.example.com
```

### 3.4.4 使用场景

- **多团队 GitOps**：通过 Argo CD 的 RBAC 和 Project 机制，为不同团队隔离应用管理权限
- **多集群部署**：Argo CD 支持管理多个目标集群，通过 `argocd cluster add` 注册集群
- **渐进式交付**：结合 Argo Rollouts 实现蓝绿部署、金丝雀发布
- **合规审计**：所有集群变更都通过 Git 提交触发，提供完整的变更审计链

### 3.4.5 潜在风险与注意事项

1. **Helm Chart 版本与 Argo CD 版本对应关系**：argo-cd Helm Chart 的版本号与 Argo CD 版本不同，需查阅 Chart 的 `appVersion` 字段确认对应关系
2. **高可用部署的资源开销**：3 副本的 Argo CD 部署需要约 6-8 GB 内存和 4-6 个 CPU 核心，小集群可能资源不足
3. **Ingress 超时配置**：Argo CD 的 gRPC 流式连接需要较长的超时时间，ALB 的闲置超时（Idle Timeout）建议设置为 600 秒以上
4. **WebSocket 支持**：Argo CD UI 使用 WebSocket 进行日志流式传输，ALB 默认支持 WebSocket，但需确保安全组规则允许
5. **Redis 单点故障**：默认部署的单副本 Redis 是潜在的单点故障，生产环境建议使用 Redis Sentinel 或外部 Redis 集群

### 3.4.6 本章小结

Argo CD 的安装推荐使用 Helm Chart 方式，通过 values 文件集中管理所有配置。高可用部署需要配置多副本、Pod 反亲和性和资源限制。TLS 配置可以选择在 ALB 层面终止（使用 ACM 证书）或在集群内部使用 cert-manager 管理。对于生产环境，务必启用 HPA、配置资源请求和限制，并考虑 Redis 的高可用方案。

---

## 3.5 CLI 工具配置

### 3.5.1 解决的问题

Argo CD 提供了功能丰富的 Web UI，但在自动化脚本、CI/CD 管道和日常运维中，CLI 工具是更高效的选择。本节介绍 argocd CLI 和 kubectl 插件的安装与配置。

### 3.5.2 核心原理

argocd CLI 通过 gRPC 协议与 argocd-server 通信，支持所有 API 操作，包括应用管理、项目配置、仓库注册、同步操作等。kubectl 插件（`kubectl argocd`）是 CLI 的另一种使用方式，通过 kubectl 的插件机制调用 argocd 命令。

### 3.5.3 代码/配置实现

#### 3.5.3.1 argocd CLI 安装

**macOS：**

```bash
brew install argocd
```

**Linux：**

```bash
# 下载最新版本
VERSION=$(curl -s https://api.github.com/repos/argoproj/argo-cd/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -sSL -o argocd-linux-amd64 "https://github.com/argoproj/argo-cd/releases/download/${VERSION}/argocd-linux-amd64"
sudo install -m 755 argocd-linux-amd64 /usr/local/bin/argocd
rm argocd-linux-amd64
```

**Windows（PowerShell）：**

```powershell
$VERSION = (Invoke-RestMethod -Uri "https://api.github.com/repos/argoproj/argo-cd/releases/latest").tag_name
Invoke-WebRequest -Uri "https://github.com/argoproj/argo-cd/releases/download/${VERSION}/argocd-windows-amd64.exe" -OutFile "argocd.exe"
Move-Item .\argocd.exe -Destination "$env:USERPROFILE\bin\argocd.exe"
```

#### 3.5.3.2 kubectl 插件安装

```bash
# 下载 argocd 插件
curl -sSL -o /usr/local/bin/kubectl-argocd "https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64"
chmod +x /usr/local/bin/kubectl-argocd

# 验证安装
kubectl argocd version
kubectl argocd app list
```

#### 3.5.3.3 登录 Argo CD

**通过端口转发登录（开发环境）：**

```bash
# 端口转发到 argocd-server
kubectl port-forward svc/argocd-server -n argocd 8080:443 &

# 获取初始密码
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 登录
argocd login localhost:8080 --username admin --password <PASSWORD> --insecure
```

**通过 ALB 登录（生产环境）：**

```bash
# 获取 ALB DNS 名称
ALB_DNS=$(kubectl get ingress -n argocd argocd-server -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# 登录
argocd login $ALB_DNS --username admin --password <PASSWORD> --grpc-web
```

#### 3.5.3.4 CLI 常用操作

```bash
# 查看集群状态
argocd cluster list

# 注册仓库
argocd repo add https://github.com/example/gitops-repo.git \
  --username <USER> \
  --password <TOKEN>

# 创建应用
argocd app create guestbook \
  --repo https://github.com/example/gitops-repo.git \
  --path guestbook \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default

# 同步应用
argocd app sync guestbook

# 查看应用状态
argocd app get guestbook

# 查看同步差异
argocd app diff guestbook

# 设置自动同步
argocd app set guestbook --sync-policy automated --auto-prune --self-heal
```

### 3.5.4 使用场景

- **CI/CD 管道集成**：在 Jenkins、GitLab CI 或 GitHub Actions 中使用 argocd CLI 触发同步
- **批量操作**：通过脚本批量创建、更新或删除多个应用
- **自动化故障恢复**：监控脚本检测到集群状态异常时，通过 CLI 触发同步
- **审计和报告**：通过 `argocd app list` 和 `argocd app get` 收集所有应用的状态信息

### 3.5.5 潜在风险与注意事项

1. **CLI 版本与服务器版本不匹配**：argocd CLI 应尽量与服务器版本保持一致，大版本差异可能导致 API 兼容性问题
2. **--grpc-web 参数**：通过 ALB 或 Nginx 访问时，如果负载均衡器不支持 HTTP/2，需要添加 `--grpc-web` 参数
3. **Token 管理**：CI/CD 场景应使用 `argocd account generate-token` 生成 API Token，而非使用 admin 密码
4. **会话超时**：CLI 登录会话默认 24 小时过期，长时间运行的脚本需处理 Token 刷新

### 3.5.6 本章小结

argocd CLI 是 Argo CD 日常运维的核心工具。安装方式支持主流操作系统，kubectl 插件提供了更自然的 Kubernetes 操作体验。在 CI/CD 集成中，建议使用 API Token 而非 admin 密码进行认证，并注意 CLI 版本与服务器版本的兼容性。

---

## 3.6 首次登录与密码管理

### 3.6.1 解决的问题

Argo CD 安装完成后，管理员需要进行首次登录、修改默认密码，并根据组织需求配置认证方式。本节涵盖初始密码获取、密码轮换策略和 SSO 集成概览。

### 3.6.2 核心原理

Argo CD 安装时会自动生成一个随机密码，存储在 `argocd-initial-admin-secret` Secret 中。该 Secret 仅在首次安装时创建，如果 Secret 被删除，Argo CD 不会自动重新生成。密码以 bcrypt 哈希形式存储在 `argocd-secret` Secret 的 `admin.password` 字段中。

### 3.6.3 代码/配置实现

#### 3.6.3.1 获取初始密码

```bash
# 方法一：直接获取
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 方法二：保存到文件
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d > argocd-admin-password.txt

# 方法三：使用 argocd CLI 自动登录
argocd admin initial-password -n argocd
```

#### 3.6.3.2 修改密码

```bash
# 通过 CLI 修改密码
argocd account update-password \
  --current-password <CURRENT_PASSWORD> \
  --new-password <NEW_PASSWORD>

# 通过直接更新 Secret（当忘记密码时）
# 生成新的 bcrypt 哈希
htpasswd -bnBC 10 "" <NEW_PASSWORD> | tr -d ':\n'

# 更新 Secret
kubectl patch secret argocd-secret -n argocd \
  -p "{\"stringData\": {\"admin.password\": \"<BCRYPT_HASH>\", \"admin.passwordMtime\": \"$(date +%Y-%m-%dT%H:%M:%SZ)\"}}"
```

#### 3.6.3.3 密码轮换策略

```bash
# 定期轮换密码脚本示例
#!/bin/bash
# rotate-argocd-password.sh

NEW_PASSWORD=$(openssl rand -base64 32)
CURRENT_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)

argocd account update-password \
  --current-password "$CURRENT_PASSWORD" \
  --new-password "$NEW_PASSWORD"

# 更新 Secret 中的初始密码记录
kubectl patch secret argocd-initial-admin-secret -n argocd \
  -p "{\"stringData\": {\"password\": \"$NEW_PASSWORD\"}}"

echo "Password rotated at $(date)"
```

#### 3.6.3.4 SSO 配置概览

Argo CD 支持多种 SSO 提供商。以下以 AWS Cognito 为例：

```yaml
# argocd-cm ConfigMap 中的 OIDC 配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  url: https://argocd.example.com
  oidc.config: |
    name: AWS Cognito
    issuer: https://cognito-idp.ap-northeast-1.amazonaws.com/<POOL_ID>
    clientID: <COGNITO_CLIENT_ID>
    clientSecret: $argocd-secret:oidc.cognito.clientSecret
    requestedScopes:
      - openid
      - email
      - profile
    requestedIDTokenClaims:
      - groups
  rbac.csv: |
    g, admin-team, role:admin
    g, dev-team, role:readonly
  scopes: "[email, groups]"
```

配置完成后，用户可以通过 "Log in via AWS Cognito" 按钮进行 SSO 登录。

### 3.6.4 使用场景

- **团队协作**：通过 SSO 集成，团队成员使用公司统一账号登录 Argo CD
- **审计合规**：SSO 提供统一的认证审计日志，满足 SOC2、ISO 27001 等合规要求
- **自动化密码管理**：通过脚本实现 admin 密码的定期轮换，减少凭证泄露风险
- **多环境管理**：不同环境（dev/staging/prod）使用不同的 SSO 配置和 RBAC 策略

### 3.6.5 潜在风险与注意事项

1. **初始 Secret 删除**：`argocd-initial-admin-secret` 被删除后不会自动重建，建议在首次登录后将其备份到安全位置
2. **SSO 配置错误导致锁定**：错误的 OIDC 配置可能导致所有用户无法登录。建议在配置 SSO 前保留一个 admin 会话，或配置备用本地账号
3. **RBAC 配置冲突**：SSO 的 group 映射与本地 RBAC 策略可能冲突，需确保策略的优先级和覆盖关系清晰
4. **Client Secret 泄露**：OIDC Client Secret 存储在 `argocd-secret` 中，需确保该 Secret 的访问权限受到严格控制

### 3.6.6 本章小结

首次登录 Argo CD 后，应立即修改默认密码并考虑配置 SSO。密码管理应纳入组织的凭证轮换策略，SSO 集成可以显著提升团队协作效率和安全性。在配置 SSO 时，务必保留备用登录方式，防止配置错误导致管理锁定。

---

## 3.7 潜在风险与最佳实践

### 3.7.1 版本兼容性

Argo CD 与 Kubernetes 的版本兼容性矩阵：

| Argo CD 版本 | 最低 K8s 版本 | 推荐 K8s 版本 | EKS 版本 |
|-------------|-------------|-------------|---------|
| 2.10.x | 1.23 | 1.26+ | 1.26-1.29 |
| 2.11.x | 1.24 | 1.27+ | 1.27-1.30 |
| 2.12.x | 1.25 | 1.28+ | 1.28-1.30 |
| 2.13.x | 1.26 | 1.29+ | 1.29-1.31 |

**检查版本兼容性：**

```bash
# 检查 EKS 版本
aws eks describe-cluster --name production-cluster --query "cluster.version"

# 检查 Argo CD 版本
argocd version --short

# 检查 Helm Chart 对应的 Argo CD 版本
helm show chart argo/argo-cd | grep appVersion
```

### 3.7.2 资源限制

Argo CD 在大规模集群中的资源消耗：

| 管理应用数 | 建议 Server 资源 | 建议 Controller 资源 | 建议 Repo Server 资源 |
|-----------|----------------|---------------------|---------------------|
| < 50 | 500m CPU / 512Mi | 500m CPU / 512Mi | 250m CPU / 256Mi |
| 50-200 | 1 CPU / 1Gi | 1 CPU / 1Gi | 500m CPU / 512Mi |
| 200-1000 | 2 CPU / 2Gi | 2 CPU / 2Gi | 1 CPU / 1Gi |
| > 1000 | 4 CPU / 4Gi | 4 CPU / 4Gi | 2 CPU / 2Gi |

**配置 Resource Quota：**

```yaml
# argocd-resource-quota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: argocd-quota
  namespace: argocd
spec:
  hard:
    requests.cpu: "8"
    requests.memory: "16Gi"
    limits.cpu: "16"
    limits.memory: "32Gi"
    persistentvolumeclaims: "2"
    pods: "20"
```

### 3.7.3 网络策略

如果集群启用了 NetworkPolicy，需要确保 Argo CD 组件之间的通信不被阻断：

```yaml
# argocd-network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: argocd-allow
  namespace: argocd
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: argocd
    - from:
        - ipBlock:
            cidr: 10.0.0.0/16  # VPC CIDR，允许 ALB 健康检查
      ports:
        - protocol: TCP
          port: 8080
        - protocol: TCP
          port: 443
  egress:
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
          except:
            - 169.254.169.254/32  # 阻止元数据服务访问（安全加固）
      ports:
        - protocol: TCP
          port: 443
        - protocol: TCP
          port: 80
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: TCP
          port: 443  # 允许访问 API Server
```

### 3.7.4 安全加固清单

```yaml
# argocd-security-hardening.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  # 禁用匿名访问
  users.anonymous.enabled: "false"
  
  # 启用审计日志
  audit.log.enabled: "true"
  
  # 限制 API 速率
  server.disable.auth: "false"
  
  # 启用 TLS
  server.insecure: "false"
  
  # 配置 RBAC
  policy.default: role:readonly
```

### 3.7.5 监控与告警

```yaml
# argocd-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: argocd-monitor
  namespace: argocd
spec:
  selector:
    matchLabels:
      app.kubernetes.io/instance: argocd
  endpoints:
    - port: server
      path: /metrics
      interval: 30s
    - port: controller
      path: /metrics
      interval: 30s
    - port: repo-server
      path: /metrics
      interval: 30s
```

### 3.7.6 本章小结

EKS 集群和 Argo CD 的生产部署涉及多个维度的考量：版本兼容性决定了可用的功能集，资源限制影响大规模集群的稳定性，网络策略和安全加固是合规的基础。建议在部署前完成兼容性检查，部署后配置监控和告警，并定期审查安全配置。

---

## 3.8 综合实战：从零到 Argo CD

### 3.8.1 完整部署流程

以下是从零开始创建 EKS 集群并部署 Argo CD 的完整命令序列：

```bash
# 1. 创建 EKS 集群（使用 eksctl）
eksctl create cluster -f cluster-config.yaml

# 2. 验证集群
kubectl cluster-info
kubectl get nodes

# 3. 安装 AWS Load Balancer Controller
helm repo add eks https://aws.github.io/eks-charts
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=production-cluster \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller

# 4. 创建 Argo CD 命名空间
kubectl create namespace argocd

# 5. 安装 Argo CD
helm repo add argo https://argoproj.github.io/argo-helm
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd \
  --values argocd-values-ha.yaml

# 6. 等待所有 Pod 就绪
kubectl wait --for=condition=Ready pods --all -n argocd --timeout=300s

# 7. 获取 ALB DNS
kubectl get ingress -n argocd

# 8. 获取初始密码
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 9. 登录 Argo CD
argocd login <ALB_DNS> --username admin --password <PASSWORD> --grpc-web

# 10. 修改密码
argocd account update-password

# 11. 验证安装
argocd version
argocd cluster list
```

### 3.8.2 验证清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| 集群节点 | `kubectl get nodes` | 所有节点 Ready |
| Argo CD Pod | `kubectl get pods -n argocd` | 所有 Pod Running |
| Ingress | `kubectl get ingress -n argocd` | ALB DNS 已分配 |
| TLS | `curl -vI https://argocd.example.com` | TLS 握手成功 |
| CLI 登录 | `argocd account get-user-info` | 返回 admin 信息 |
| 仓库连接 | `argocd repo list` | 空列表（无错误） |

### 3.8.3 故障排查

```bash
# Argo CD Pod 日志
kubectl logs -n argocd deployment/argocd-server
kubectl logs -n argocd deployment/argocd-application-controller
kubectl logs -n argocd deployment/argocd-repo-server

# 检查 ALB 事件
kubectl describe ingress -n argocd argocd-server

# 检查 Service Account 注解
kubectl describe sa -n argocd argocd-server

# 检查 IRSA 环境变量
kubectl exec -n argocd deployment/argocd-server -- env | grep AWS

# 检查 OIDC Provider
aws eks describe-cluster --name production-cluster --query "cluster.identity.oidc"
```

---

## 3.9 总结

本章详细介绍了 EKS 集群搭建和 Argo CD 安装的完整流程，涵盖以下关键内容：

1. **集群创建**：eksctl 适合快速启动，Terraform 适合生产环境的精细化管理。托管节点组降低了运维复杂度，自管理节点组提供了更高的灵活性。

2. **IAM 权限模型**：IRSA 是 EKS 上管理 AWS 凭证的最佳实践。通过 OIDC 集成，Pod 可以安全地获取临时 AWS 凭证。为 Argo CD 各组件创建独立的 IAM Role 并遵循最小权限原则。

3. **Argo CD 安装**：推荐使用 Helm Chart 方式，通过 values 文件集中管理配置。高可用部署需要配置多副本、Pod 反亲和性和资源限制。TLS 配置可以选择 ALB 层面终止或 cert-manager 内部管理。

4. **CLI 工具**：argocd CLI 是日常运维的核心工具，支持所有 API 操作。CI/CD 集成应使用 API Token 而非 admin 密码。

5. **密码与认证**：首次登录后应立即修改密码，SSO 集成可以提升团队协作效率。配置 SSO 时需保留备用登录方式。

6. **风险防范**：版本兼容性、资源限制、网络策略和安全加固是生产部署的关键考量。建议部署前完成兼容性检查，部署后配置监控和告警。

通过本章的学习，读者应该能够独立完成 EKS 集群的创建和 Argo CD 的部署，为后续的 GitOps 实践奠定坚实的基础。
