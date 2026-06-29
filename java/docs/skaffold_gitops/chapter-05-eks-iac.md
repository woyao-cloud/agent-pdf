# 第5章 EKS 集群与基础设施即代码

## 5.1 概述

Amazon Elastic Kubernetes Service（EKS）是 AWS 提供的托管 Kubernetes 服务，它屏蔽了控制平面的管理复杂性，同时保留了标准 Kubernetes 的兼容性。然而，EKS 集群的创建并非一键完成——它涉及 VPC 网络规划、IAM 权限设计、节点组配置、安全组规则、ECR 镜像仓库等多个基础设施组件的协同工作。将这些组件以代码形式管理（Infrastructure as Code, IaC），是实现可重复、可审计、可版本化的基础设施管理的关键。

本章将围绕 **Terraform 创建 EKS 集群** 这一核心场景，从模块结构、网络规划、节点组与 IAM、ECR 仓库、Python 运维脚本到潜在风险，进行系统性讲解。所有代码均基于真实生产环境实践提炼，兼顾可读性与工程严谨性。

---

## 5.2 Terraform 创建 EKS 集群

### 5.2.1 解决的问题

手动在 AWS 控制台点击创建 EKS 集群存在以下问题：

- **不可重复**：每次创建依赖人工记忆，环境之间（dev/staging/prod）难以保证一致性。
- **不可审计**：谁在什么时候修改了什么资源，没有记录。
- **配置漂移**：临时修改（如手动扩缩节点组）会导致实际状态与预期状态不一致。
- **团队协作困难**：基础设施变更无法像代码一样进行 Code Review。

Terraform 通过声明式配置将上述问题转化为代码管理流程。

### 5.2.2 核心原理

Terraform 的核心工作流程为 **Write → Plan → Apply**：

1. **Write**：编写 `.tf` 文件描述目标状态。
2. **Plan**：`terraform plan` 对比当前状态与目标状态，生成执行计划。
3. **Apply**：`terraform apply` 执行计划，调用 AWS API 创建/更新/删除资源。

对于 EKS 集群，Terraform 需要依次管理以下资源依赖链：

```
VPC → 子网 → 互联网网关 → NAT 网关 → 路由表
  → EKS 集群角色 → EKS 集群
    → 节点组角色 → 节点组
      → 安全组 → 安全组规则
```

### 5.2.3 代码/配置实现

#### 模块结构设计

推荐的生产级 Terraform 模块结构如下：

```
terraform/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   │   └── ...
│   └── prod/
│       └── ...
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── eks/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── nodegroup/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── ecr/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── backend.tf
```

#### Provider 配置

```hcl
# terraform/environments/dev/main.tf

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "my-team-terraform-state"
    key            = "eks/dev/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Project     = var.project_name
    }
  }
}
```

#### VPC 与子网

```hcl
# terraform/modules/vpc/main.tf

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name                                                        = "${var.cluster_name}-vpc"
    "kubernetes.io/cluster/${var.cluster_name}"                 = "shared"
  }
}

resource "aws_subnet" "public" {
  count             = length(var.public_subnet_cidrs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  map_public_ip_on_launch = true

  tags = {
    Name                                                        = "${var.cluster_name}-public-${count.index}"
    "kubernetes.io/cluster/${var.cluster_name}"                 = "shared"
    "kubernetes.io/role/elb"                                    = "1"
  }
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name                                                        = "${var.cluster_name}-private-${count.index}"
    "kubernetes.io/cluster/${var.cluster_name}"                 = "shared"
    "kubernetes.io/role/internal-elb"                           = "1"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${var.cluster_name}-igw"
  }
}

resource "aws_eip" "nat" {
  count  = var.single_nat_gateway ? 1 : length(var.availability_zones)
  domain = "vpc"

  tags = {
    Name = "${var.cluster_name}-nat-eip-${count.index}"
  }
}

resource "aws_nat_gateway" "this" {
  count         = var.single_nat_gateway ? 1 : length(var.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "${var.cluster_name}-nat-${count.index}"
  }

  depends_on = [aws_internet_gateway.this]
}
```

#### EKS 集群

```hcl
# terraform/modules/eks/main.tf

resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_iam_role_policy_attachment" "service_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSServicePolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = concat(var.public_subnet_ids, var.private_subnet_ids)
    endpoint_private_access = var.endpoint_private_access
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.public_access_cidrs
    security_group_ids      = [aws_security_group.cluster.id]
  }

  encryption_config {
    provider {
      key_arn = var.kms_key_arn
    }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = var.cluster_log_types

  tags = {
    Name = var.cluster_name
  }

  depends_on = [
    aws_iam_role_policy_attachment.cluster_policy,
    aws_iam_role_policy_attachment.service_policy,
  ]
}

resource "aws_security_group" "cluster" {
  name        = "${var.cluster_name}-cluster-sg"
  description = "Security group for EKS cluster control plane"
  vpc_id      = var.vpc_id

  ingress {
    description = "Allow cluster API access from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.cluster_name}-cluster-sg"
  }
}
```

#### 节点组

```hcl
# terraform/modules/nodegroup/main.tf

resource "aws_iam_role" "node" {
  name = "${var.cluster_name}-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "node_worker" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_ecr" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_ssm" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.node.name
}

resource "aws_eks_node_group" "this" {
  cluster_name    = var.cluster_name
  node_group_name = var.node_group_name
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids
  version         = var.kubernetes_version

  instance_types = var.instance_types

  scaling_config {
    desired_size = var.desired_size
    min_size     = var.min_size
    max_size     = var.max_size
  }

  update_config {
    max_unavailable = var.max_unavailable
  }

  capacity_type = var.capacity_type # ON_DEMAND 或 SPOT

  disk_size = var.disk_size_gb

  labels = var.labels

  tags = {
    Name = "${var.cluster_name}-${var.node_group_name}"
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes = [
      scaling_config[0].desired_size,
    ]
  }
}
```

#### 环境变量文件

```hcl
# terraform/environments/dev/terraform.tfvars

aws_region           = "ap-northeast-1"
environment          = "dev"
project_name         = "my-platform"
cluster_name         = "my-platform-dev"
kubernetes_version   = "1.28"

vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["ap-northeast-1a", "ap-northeast-1c"]
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24"]

endpoint_private_access = true
endpoint_public_access  = true
public_access_cidrs     = ["10.0.0.0/8"]

cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

node_groups = {
  general = {
    instance_types = ["t3.medium", "t3.large"]
    desired_size   = 2
    min_size       = 1
    max_size       = 4
    capacity_type  = "ON_DEMAND"
    disk_size_gb   = 50
    labels         = { type = "general" }
  }
  spot = {
    instance_types = ["c6a.large", "c5a.large", "m6a.large"]
    desired_size   = 0
    min_size       = 0
    max_size       = 10
    capacity_type  = "SPOT"
    disk_size_gb   = 50
    labels         = { type = "spot-workload" }
  }
}
```

### 5.2.4 使用场景

- **多环境管理**：dev/staging/prod 使用同一套模块，仅通过 `terraform.tfvars` 差异化配置。
- **GitOps 集成**：Terraform 状态文件存储在 S3 后端，配合 ArgoCD 或 Atlantis 实现 PR 驱动的基础设施变更。
- **快速重建**：在灾难恢复场景下，可在 15-20 分钟内从零重建完整集群。

### 5.2.5 潜在风险与注意事项

- **状态文件泄露**：S3 后端必须启用 `server_side_encryption` 和 `block_public_access`，DynamoDB 用于状态锁防止并发冲突。
- **资源依赖顺序**：EKS 集群创建依赖 IAM 角色策略附加完成，缺少 `depends_on` 会导致间歇性失败。
- **版本兼容性**：Terraform provider 版本与 AWS API 版本需要匹配，建议使用 `~> 5.0` 的宽松锁定策略。

### 5.2.6 本章小结

本节从零构建了一个生产级的 Terraform EKS 模块体系，涵盖 VPC、集群、节点组三大核心组件。模块化设计使得环境间复用成为可能，S3 后端与 DynamoDB 锁保证了团队协作的安全性。下一节将深入节点组与 IAM 的细节设计。

---

## 5.3 节点组与 IAM 配置

### 5.3.1 解决的问题

Kubernetes 节点是承载 Pod 的计算资源，其生命周期管理、权限模型、扩缩容策略直接影响集群的稳定性与安全性。错误配置可能导致：

- 节点无法注册到集群（CNI 或 IAM 问题）
- Pod 无法拉取镜像（ECR 权限缺失）
- 节点组扩缩容延迟导致业务抖动
- 节点被意外终止（Spot 实例回收）

### 5.3.2 核心原理

#### 托管节点组 vs 自管理节点组

| 维度 | 托管节点组 | 自管理节点组（Auto Scaling Group） |
|------|-----------|--------------------------------|
| 控制面管理 | AWS 管理 | 用户管理 |
| 版本升级 | 自动或按需滚动更新 | 手动处理 |
| 节点修复 | AWS 自动替换不健康节点 | 需自行实现 |
| 自定义 AMI | 不支持 | 支持 |
| 启动模板 | 有限支持 | 完全控制 |
| 成本 | 无额外费用 | 无额外费用 |

**建议**：90% 的场景使用托管节点组。仅在需要自定义 AMI（如安全加固镜像）或精细控制 Launch Template 时使用自管理节点组。

#### IRSA（IAM Roles for Service Accounts）

IRSA 是 AWS 推荐的 Pod 级别 IAM 授权方式。其原理是：

1. 集群创建 OIDC 身份提供商（IAM OIDC Provider）。
2. 为 ServiceAccount 关联一个 IAM Role，Role 的 Trust Policy 限制只有特定 ServiceAccount 可以代入。
3. Pod 通过 `AssumeRoleWithWebIdentity` 获取临时凭证。

相比将节点角色附加大量策略，IRSA 遵循最小权限原则。

### 5.3.3 代码/配置实现

#### IRSA 配置

```hcl
# terraform/modules/irsa/main.tf

data "tls_certificate" "eks" {
  url = var.eks_cluster_oidc_url
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = var.eks_cluster_oidc_url
}

# 为特定 ServiceAccount 创建 IAM Role
resource "aws_iam_role" "service_account" {
  name               = "${var.cluster_name}-${var.service_account_name}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.eks.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(var.eks_cluster_oidc_url, "https://", "")}:sub" = "system:serviceaccount:${var.namespace}:${var.service_account_name}"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "custom" {
  policy_arn = var.policy_arn
  role       = aws_iam_role.service_account.name
}
```

#### Kubernetes ServiceAccount 与 IRSA 关联

```yaml
# kubernetes/serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3-reader
  namespace: application
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/my-platform-dev-s3-reader
```

#### 节点组扩缩容策略

```hcl
# 在 nodegroup 模块中增加扩缩容配置

resource "aws_autoscaling_group_tag" "cluster_autoscaler" {
  autoscaling_group_name = aws_eks_node_group.this.resources[0]

  tag {
    key                 = "k8s.io/cluster-autoscaler/${var.cluster_name}"
    value               = "owned"
    propagate_at_launch = false
  }

  tag {
    key                 = "k8s.io/cluster-autoscaler/enabled"
    value               = "true"
    propagate_at_launch = false
  }
}
```

#### Karpenter 配置（进阶节点弹性方案）

```hcl
# terraform/modules/karpenter/main.tf

resource "helm_release" "karpenter" {
  name       = "karpenter"
  namespace  = "karpenter"
  repository = "oci://public.ecr.aws/karpenter"
  chart      = "karpenter"
  version    = var.karpenter_version

  set {
    name  = "settings.aws.clusterName"
    value = var.cluster_name
  }

  set {
    name  = "settings.aws.clusterEndpoint"
    value = var.cluster_endpoint
  }

  set {
    name  = "settings.aws.interruptionQueueName"
    value = var.interruption_queue_name
  }
}

resource "kubectl_manifest" "karpenter_provisioner" {
  yaml_body = <<YAML
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: "karpenter.sh/capacity-type"
          operator: In
          values: ["on-demand", "spot"]
        - key: "node.kubernetes.io/instance-type"
          operator: In
          values: ["t3.medium", "t3.large", "c6a.large", "m6a.large"]
      nodeClassRef:
        name: default
  limits:
    cpu: 100
  disruption:
    consolidationPolicy: WhenUnderutilized
    expireAfter: 720h
---
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2
  role: "KarpenterNodeRole-${var.cluster_name}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${var.cluster_name}
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${var.cluster_name}
YAML
}
```

### 5.3.4 使用场景

- **通用工作负载**：托管节点组 + ON_DEMAND 实例，适合稳定运行的无状态服务。
- **批处理/Spark 任务**：Spot 节点组 + Karpenter，利用 Spot 实例大幅降低成本（可达 60-80% 折扣）。
- **敏感数据服务**：IRSA 确保每个服务只拥有其需要的 AWS 权限，避免节点角色权限过大。

### 5.3.5 潜在风险与注意事项

- **Spot 实例中断**：AWS 可在 2 分钟前发出中断通知，需配置 `interruptionQueueName` 和 Pod 的 PDB（PodDisruptionBudget）。
- **节点组扩缩容延迟**：托管节点组扩缩容通常需要 3-8 分钟，Karpenter 可将此时间缩短到 30-60 秒。
- **IRSA 缓存问题**：Pod 中的 AWS SDK 会缓存凭证，切换 ServiceAccount 后需重启 Pod 才能生效。
- **实例类型选择**：避免选择过于小众的实例类型（如 `t4g` ARM 系列），否则 Spot 市场深度不足可能导致扩容失败。

### 5.3.6 本章小结

节点组与 IAM 是 EKS 集群的"骨骼"与"血管"。托管节点组降低了运维复杂度，IRSA 提供了细粒度的权限控制，Karpenter 则进一步优化了资源利用率与弹性效率。生产环境中建议同时保留一个小的托管节点组作为"安全网"，配合 Karpenter 处理弹性工作负载。

---

## 5.4 VPC 与网络规划

### 5.4.1 解决的问题

EKS 集群的网络规划是基础设施设计中最容易出错、最难后期修改的环节。常见问题包括：

- **CIDR 重叠**：集群 VPC 与对等 VPC 或本地网络 CIDR 冲突，导致路由不可达。
- **IP 耗尽**：Pod 数量增长超出子网可用 IP 上限，节点无法调度新 Pod。
- **NAT 网关成本**：每个可用区一个 NAT 网关，月成本可达 $100+。
- **VPC 端点缺失**：节点拉取 ECR 镜像走互联网而非 AWS 内网，产生出口流量费用且延迟更高。

### 5.4.2 核心原理

#### CIDR 规划原则

```
VPC CIDR: 10.0.0.0/16 (65536 个 IP)

┌─────────────────────────────────────────────┐
│ 可用区 A                                    │
│  ├─ 公共子网: 10.0.1.0/24  (251 可用 IP)   │
│  └─ 私有子网: 10.0.10.0/20 (4091 可用 IP)  │
├─────────────────────────────────────────────┤
│ 可用区 C                                    │
│  ├─ 公共子网: 10.0.2.0/24  (251 可用 IP)   │
│  └─ 私有子网: 10.0.16.0/20 (4091 可用 IP)  │
└─────────────────────────────────────────────┘
```

**关键决策**：
- 私有子网使用 `/20` 而非 `/24`，为 Pod 增长预留空间。
- 预留 `/16` 中的一段（如 `10.0.128.0/17`）用于未来扩展或 VPC 对等。
- 避免使用 `100.64.0.0/10` 或 `198.19.0.0/16`（AWS 预留范围）。

#### AWS VPC CNI 与 Pod IP 分配

EKS 默认使用 AWS VPC CNI 插件，Pod 直接获取 VPC 子网 IP。这意味着：

- 每个节点上的 Pod 数量受节点 ENI（弹性网络接口）数量和每个 ENI 的 IP 地址数限制。
- 节点类型决定了最大 Pod 数：`t3.medium` 最多 17 个 Pod，`c6a.large` 最多 29 个 Pod。
- 如果子网 IP 耗尽，新 Pod 将处于 `Pending` 状态。

**解决方案**：
- 使用 **Custom Networking**：为 Pod 分配独立 CIDR（如 `100.64.0.0/16`），与节点子网分离。
- 使用 **IPv6**：EKS 支持双栈模式，IPv6 地址空间几乎无限。

### 5.4.3 代码/配置实现

#### VPC 端点配置

```hcl
# terraform/modules/vpc_endpoints/main.tf

resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.cluster_name}-vpc-endpoints-sg"
  description = "Security group for VPC endpoints"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id       = var.vpc_id
  service_name = "com.amazonaws.${var.region}.s3"
  route_table_ids = var.private_route_table_ids
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "sts" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.region}.sts"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "cloudwatch" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "eks" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.region}.eks"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "eks_auth" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.region}.eks-auth"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}
```

#### 私有子网路由表

```hcl
resource "aws_route_table" "private" {
  count  = length(var.private_subnet_ids)
  vpc_id = var.vpc_id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.nat_gateway_ids[count.index % length(var.nat_gateway_ids)]
  }

  tags = {
    Name = "${var.cluster_name}-private-rt-${count.index}"
  }
}

resource "aws_route_table_association" "private" {
  count          = length(var.private_subnet_ids)
  subnet_id      = var.private_subnet_ids[count.index]
  route_table_id = aws_route_table.private[count.index].id
}
```

### 5.4.4 使用场景

- **生产环境**：每个可用区独立 NAT 网关（高可用），私有子网使用 `/19` 或 `/20`，启用所有 VPC 端点。
- **开发/测试环境**：单 NAT 网关（节省成本），私有子网使用 `/24`，仅启用 ECR 和 S3 端点。
- **金融/合规场景**：`endpoint_private_access = true` + `endpoint_public_access = false`，集群 API 完全内网访问。

### 5.4.5 潜在风险与注意事项

- **NAT 网关单点故障**：单 NAT 网关模式下，如果该可用区故障，所有私有子网的出站流量中断。生产环境至少 2 个 NAT 网关。
- **VPC 端点费用**：每个 Interface 类型端点按小时计费（约 $0.01/小时/端点 + 数据处理费），7 个端点每月约 $50+。
- **S3 端点类型**：S3 支持 Gateway 和 Interface 两种端点。Gateway 端点免费且通过路由表实现，推荐使用。
- **子网 CIDR 不可扩展**：一旦子网创建，其 CIDR 不可修改。预留足够的 IP 空间，或使用 AWS CNI 的 `Custom Networking` 功能。

### 5.4.6 本章小结

VPC 网络规划是 EKS 基础设施的基石。合理的 CIDR 分配、NAT 网关高可用设计、VPC 端点配置，直接决定了集群的可用性、安全性和运营成本。建议在项目初期就进行 3-5 年的 IP 需求预测，避免后期陷入 IP 耗尽困境。

---

## 5.5 ECR 镜像仓库

### 5.5.1 解决的问题

容器镜像需要安全、高效的存储和分发机制。直接使用 Docker Hub 或公共仓库存在以下问题：

- **拉取限速**：Docker Hub 对匿名用户和免费用户有拉取频率限制。
- **安全风险**：镜像可能包含漏洞，缺乏自动扫描机制。
- **生命周期管理**：旧镜像不断堆积，占用存储空间并产生费用。
- **跨账号访问**：多账号架构下（dev/staging/prod），镜像需要在账号间共享。

### 5.5.2 核心原理

Amazon ECR（Elastic Container Registry）是 AWS 托管的 Docker 镜像仓库，与 EKS 深度集成：

- **IAM 鉴权**：通过 `aws ecr get-login-password` 获取临时令牌。
- **镜像扫描**：基于 Clair 引擎的漏洞扫描，支持扫描结果通知。
- **生命周期策略**：基于标签数量或镜像年龄自动清理。
- **跨区域复制**：支持跨 Region 自动同步镜像。

### 5.5.3 代码/配置实现

#### ECR 仓库模块

```hcl
# terraform/modules/ecr/main.tf

resource "aws_ecr_repository" "this" {
  for_each = var.repositories

  name                 = each.key
  image_tag_mutability = each.value.mutable ? "MUTABLE" : "IMMUTABLE"
  force_delete         = each.value.force_delete

  image_scanning_configuration {
    scan_on_push = each.value.scan_on_push
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key_id      = var.kms_key_id
  }

  tags = {
    Name = each.key
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each = { for k, v in var.repositories : k => v if v.lifecycle_policy != null }

  repository = aws_ecr_repository.this[each.key].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last ${each.value.lifecycle_policy.max_image_count} images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = each.value.lifecycle_policy.max_image_count
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire images older than ${each.value.lifecycle_policy.max_age_days} days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = each.value.lifecycle_policy.max_age_days
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_repository_policy" "cross_account" {
  for_each = { for k, v in var.repositories : k => v if length(v.allowed_accounts) > 0 }

  repository = aws_ecr_repository.this[each.key].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CrossAccountPull"
        Effect = "Allow"
        Principal = {
          AWS = [for acct in each.value.allowed_accounts : "arn:aws:iam::${acct}:root"]
        }
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:GetAuthorizationToken",
        ]
      }
    ]
  })
}
```

#### 变量定义

```hcl
# terraform/modules/ecr/variables.tf

variable "repositories" {
  type = map(object({
    mutable        = optional(bool, false)
    force_delete   = optional(bool, false)
    scan_on_push   = optional(bool, true)
    lifecycle_policy = optional(object({
      max_image_count = optional(number, 30)
      max_age_days    = optional(number, 90)
    }))
    allowed_accounts = optional(list(string), [])
  }))
}
```

#### 环境配置示例

```hcl
# terraform/environments/dev/terraform.tfvars (ECR 部分)

repositories = {
  "my-platform/api-gateway" = {
    mutable        = false
    scan_on_push   = true
    lifecycle_policy = {
      max_image_count = 30
      max_age_days    = 90
    }
    allowed_accounts = ["123456789012"] # staging 账号
  }
  "my-platform/user-service" = {
    mutable        = false
    scan_on_push   = true
    lifecycle_policy = {
      max_image_count = 50
      max_age_days    = 60
    }
  }
  "my-platform/ci-tools" = {
    mutable        = true
    scan_on_push   = false
    lifecycle_policy = {
      max_image_count = 5
      max_age_days    = 7
    }
  }
}
```

### 5.5.4 使用场景

- **微服务镜像管理**：每个服务一个独立 ECR 仓库，标签不可变确保部署可追溯。
- **CI/CD 流水线**：CI 工具（GitHub Actions / Jenkins）推送镜像时自动扫描漏洞，阻断高危镜像部署。
- **多账号架构**：中心账号管理 ECR，通过仓库策略允许其他账号拉取镜像，避免镜像重复存储。

### 5.5.5 潜在风险与注意事项

- **不可变标签**：启用 `image_tag_mutability = IMMUTABLE` 后，同名标签（如 `latest`）无法覆盖推送。建议 CI 使用唯一标签（如 commit SHA）。
- **生命周期策略误删**：策略规则按优先级执行，`imageCountMoreThan` 和 `sinceImagePushed` 的组合需要仔细测试。建议先在测试仓库验证。
- **跨账号拉取鉴权**：拉取账号需要先执行 `GetAuthorizationToken`，该操作在拉取账号的 ECR 端点上执行，而非目标账号。
- **扫描结果处理**：`scan_on_push = true` 是异步扫描，推送后需要等待几秒才能获取结果。建议结合 EventBridge 事件通知实现自动化阻断。

### 5.5.6 本章小结

ECR 是 EKS 生态中不可或缺的镜像基础设施。通过 Terraform 管理仓库的生命周期策略、扫描配置和跨账号权限，可以实现安全、高效、低成本的镜像管理。不可变标签 + 自动扫描 + 生命周期清理的组合策略，是生产环境的推荐实践。

---

## 5.6 Python 集群管理脚本

### 5.6.1 解决的问题

日常运维中，工程师需要频繁执行以下操作：

- 查看当前账号下所有 EKS 集群列表
- 获取特定集群的详细信息（版本、端点、节点组状态）
- 更新本地 kubeconfig 以访问集群
- 检查节点健康状态

虽然 AWS CLI 可以完成这些操作，但命令冗长、输出格式不统一、错误处理不友好。Python 脚本可以将这些操作封装为简洁、可组合的工具。

### 5.6.2 核心原理

使用 `boto3`（AWS SDK for Python）调用 EKS API，结合 `subprocess` 或 `kubernetes` Python 客户端与集群交互。核心依赖：

```
boto3>=1.28
kubernetes>=27.2
pyyaml>=6.0
click>=8.0  # CLI 框架
```

### 5.6.3 代码/配置实现

#### 完整管理脚本

```python
#!/usr/bin/env python3
"""
eksctl.py - EKS 集群管理工具

用法:
  python eksctl.py list
  python eksctl.py info <cluster-name>
  python eksctl.py kubeconfig <cluster-name> [--region ap-northeast-1]
  python eksctl.py nodes <cluster-name> [--region ap-northeast-1]
  python eksctl.py upgrade-check <cluster-name> [--region ap-northeast-1]
"""

import argparse
import json
import subprocess
import sys
from typing import Any, Dict, List, Optional

import boto3
import yaml
from kubernetes import client, config
from kubernetes.config import ConfigException


def get_eks_client(region: str = "ap-northeast-1"):
    return boto3.client("eks", region_name=region)


def list_clusters(region: str = "ap-northeast-1") -> List[str]:
    """列出当前账号下所有 EKS 集群"""
    eks = get_eks_client(region)
    clusters = []
    paginator = eks.get_paginator("list_clusters")

    for page in paginator.paginate():
        clusters.extend(page["clusters"])

    return clusters


def get_cluster_info(cluster_name: str, region: str = "ap-northeast-1") -> Dict[str, Any]:
    """获取集群详细信息"""
    eks = get_eks_client(region)
    try:
        response = eks.describe_cluster(name=cluster_name)
        cluster = response["cluster"]

        return {
            "name": cluster["name"],
            "version": cluster["version"],
            "status": cluster["status"],
            "endpoint": cluster["endpoint"],
            "arn": cluster["arn"],
            "created_at": cluster["createdAt"].isoformat(),
            "role_arn": cluster["roleArn"],
            "platform_version": cluster["platformVersion"],
            "vpc_id": cluster["resourcesVpcConfig"]["vpcId"],
            "subnet_ids": cluster["resourcesVpcConfig"]["subnetIds"],
            "security_group_ids": cluster["resourcesVpcConfig"]["securityGroupIds"],
            "endpoint_public": cluster["resourcesVpcConfig"]["endpointPublicAccess"],
            "endpoint_private": cluster["resourcesVpcConfig"]["endpointPrivateAccess"],
            "logging": {
                log_type: enabled
                for log_type, enabled in (
                    (log["types"][0], log["enabled"])
                    for log in cluster.get("logging", {}).get("clusterLogging", [])
                )
            },
        }
    except eks.exceptions.ResourceNotFoundException:
        print(f"错误: 集群 '{cluster_name}' 不存在", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"错误: 获取集群信息失败 - {e}", file=sys.stderr)
        sys.exit(1)


def update_kubeconfig(
    cluster_name: str,
    region: str = "ap-northeast-1",
    profile: Optional[str] = None,
) -> None:
    """更新本地 kubeconfig"""
    cmd = [
        "aws", "eks", "update-kubeconfig",
        "--name", cluster_name,
        "--region", region,
    ]
    if profile:
        cmd.extend(["--profile", profile])

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(f"kubeconfig 已更新: {cluster_name}")
    except subprocess.CalledProcessError as e:
        print(f"错误: 更新 kubeconfig 失败", file=sys.stderr)
        print(e.stderr, file=sys.stderr)
        sys.exit(1)


def check_node_status(cluster_name: str, region: str = "ap-northeast-1") -> List[Dict[str, Any]]:
    """检查集群节点状态"""
    try:
        config.load_kube_config()
    except ConfigException:
        update_kubeconfig(cluster_name, region)
        config.load_kube_config()

    v1 = client.CoreV1Api()
    nodes = v1.list_node()

    node_list = []
    for node in nodes.items:
        conditions = {c.type: c.status for c in node.status.conditions}
        addresses = {a.type: a.address for a in node.status.addresses}

        node_info = {
            "name": node.metadata.name,
            "instance_type": node.metadata.labels.get(
                "node.kubernetes.io/instance-type", "unknown"
            ),
            "internal_ip": addresses.get("InternalIP", "unknown"),
            "kubelet_version": node.status.node_info.kubelet_version,
            "os_image": node.status.node_info.os_image,
            "ready": conditions.get("Ready") == "True",
            "disk_pressure": conditions.get("DiskPressure") == "True",
            "memory_pressure": conditions.get("MemoryPressure") == "True",
            "pid_pressure": conditions.get("PIDPressure") == "True",
            "age": node.metadata.creation_timestamp.strftime("%Y-%m-%d %H:%M"),
            "pods": {
                "capacity": node.status.capacity.get("pods", "0"),
                "allocatable": node.status.allocatable.get("pods", "0"),
            },
        }

        # 获取节点上运行的 Pod 数量
        field_selector = f"spec.nodeName={node.metadata.name}"
        pod_list = v1.list_pod_for_all_namespaces(
            field_selector=field_selector
        )
        node_info["running_pods"] = len(pod_list.items)

        node_list.append(node_info)

    return node_list


def check_upgrade_availability(
    cluster_name: str, region: str = "ap-northeast-1"
) -> Dict[str, Any]:
    """检查可用的升级版本"""
    eks = get_eks_client(region)
    try:
        response = eks.describe_cluster(name=cluster_name)
        current_version = response["cluster"]["version"]

        versions_response = eks.describe_cluster_versions(
            clusterType="eks",
            clusterVersion=current_version,
        )

        available_versions = []
        for version_info in versions_response.get("clusterVersions", []):
            if version_info.get("clusterType") == "eks":
                available_versions.append(version_info["clusterVersion"])

        return {
            "cluster_name": cluster_name,
            "current_version": current_version,
            "available_upgrades": sorted(set(available_versions) - {current_version}),
            "platform_version": response["cluster"]["platformVersion"],
            "status": response["cluster"]["status"],
        }
    except Exception as e:
        print(f"错误: 检查升级版本失败 - {e}", file=sys.stderr)
        sys.exit(1)


def format_output(data: Any, format: str = "table") -> str:
    """格式化输出"""
    if format == "json":
        return json.dumps(data, indent=2, ensure_ascii=False, default=str)

    if isinstance(data, list):
        if not data:
            return "无数据"
        headers = list(data[0].keys())
        col_widths = {
            h: max(len(h), max(len(str(row.get(h, ""))) for row in data))
            for h in headers
        }
        separator = " | ".join("-" * col_widths[h] for h in headers)
        header_line = " | ".join(h.ljust(col_widths[h]) for h in headers)
        rows = []
        for row in data:
            rows.append(
                " | ".join(
                    str(row.get(h, "")).ljust(col_widths[h]) for h in headers
                )
            )
        return "\n".join([header_line, separator] + rows)

    if isinstance(data, dict):
        lines = []
        for k, v in data.items():
            if isinstance(v, dict):
                lines.append(f"{k}:")
                for sk, sv in v.items():
                    lines.append(f"  {sk}: {sv}")
            else:
                lines.append(f"{k}: {v}")
        return "\n".join(lines)

    return str(data)


def main():
    parser = argparse.ArgumentParser(description="EKS 集群管理工具")
    parser.add_argument("--region", default="ap-northeast-1", help="AWS 区域")
    parser.add_argument("--format", choices=["table", "json"], default="table", help="输出格式")
    parser.add_argument("--profile", help="AWS 配置文件")

    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    subparsers.add_parser("list", help="列出所有 EKS 集群")

    # info
    info_parser = subparsers.add_parser("info", help="获取集群详细信息")
    info_parser.add_argument("cluster_name", help="集群名称")

    # kubeconfig
    kc_parser = subparsers.add_parser("kubeconfig", help="更新 kubeconfig")
    kc_parser.add_argument("cluster_name", help="集群名称")

    # nodes
    nodes_parser = subparsers.add_parser("nodes", help="检查节点状态")
    nodes_parser.add_argument("cluster_name", help="集群名称")

    # upgrade-check
    upgrade_parser = subparsers.add_parser("upgrade-check", help="检查可用升级版本")
    upgrade_parser.add_argument("cluster_name", help="集群名称")

    args = parser.parse_args()

    if args.command == "list":
        clusters = list_clusters(args.region)
        if args.format == "json":
            print(json.dumps(clusters, indent=2))
        else:
            for c in clusters:
                print(c)

    elif args.command == "info":
        info = get_cluster_info(args.cluster_name, args.region)
        print(format_output(info, args.format))

    elif args.command == "kubeconfig":
        update_kubeconfig(args.cluster_name, args.region, args.profile)

    elif args.command == "nodes":
        nodes = check_node_status(args.cluster_name, args.region)
        print(format_output(nodes, args.format))

    elif args.command == "upgrade-check":
        upgrade_info = check_upgrade_availability(args.cluster_name, args.region)
        print(format_output(upgrade_info, args.format))


if __name__ == "__main__":
    main()
```

#### 使用示例

```bash
# 列出所有集群
python eksctl.py list

# 获取集群详细信息（JSON 格式）
python eksctl.py info my-platform-dev --format json

# 更新 kubeconfig
python eksctl.py kubeconfig my-platform-dev

# 检查节点状态
python eksctl.py nodes my-platform-dev

# 检查可用升级版本
python eksctl.py upgrade-check my-platform-dev
```

#### 输出示例

```
# python eksctl.py nodes my-platform-dev

name          | instance_type | internal_ip   | ready | running_pods | kubelet_version | os_image
------------- | ------------- | ------------- | ----- | ------------ | --------------- | --------
ip-10-0-10-5  | t3.medium     | 10.0.10.5     | True  | 12           | v1.28.3-eks     | Amazon Linux 2
ip-10-0-11-12 | t3.large      | 10.0.11.12    | True  | 8            | v1.28.3-eks     | Amazon Linux 2
ip-10-0-10-20 | c6a.large     | 10.0.10.20    | True  | 15           | v1.28.3-eks     | Amazon Linux 2
```

### 5.6.4 使用场景

- **日常巡检**：每天早上执行 `python eksctl.py nodes <cluster>` 检查节点健康状态。
- **CI/CD 集成**：在部署流水线中调用 `python eksctl.py kubeconfig <cluster>` 配置 kubectl 上下文。
- **故障排查**：`python eksctl.py info <cluster> --format json` 快速获取集群完整配置，辅助问题定位。
- **版本管理**：`python eksctl.py upgrade-check <cluster>` 在升级前确认可用版本。

### 5.6.5 潜在风险与注意事项

- **kubeconfig 覆盖**：`update-kubeconfig` 会覆盖本地 kubeconfig 中同名的集群配置。建议使用 `KUBECONFIG` 环境变量隔离不同集群的配置。
- **Python 依赖版本**：`kubernetes` 库的版本需要与集群版本兼容。`boto3` 建议使用最新版本以支持最新的 EKS API。
- **权限不足**：脚本依赖的 IAM 权限包括 `eks:DescribeCluster`、`eks:ListClusters` 和 `sts:GetCallerIdentity`。建议创建一个专用的 IAM 角色或用户。
- **kubectl 依赖**：`update_kubeconfig` 命令依赖本地安装的 `aws` CLI 工具，版本需 >= 2.0。

### 5.6.6 本章小结

Python 管理脚本将 AWS CLI 的零散命令封装为统一、可组合的运维工具。通过 `boto3` 获取集群元数据，`kubernetes` 客户端检查节点状态，`subprocess` 调用 `aws eks update-kubeconfig`，实现了从集群信息查询到日常巡检的完整覆盖。建议将此脚本纳入团队的 `bin/` 目录并版本化管理。

---

## 5.7 潜在风险与最佳实践

### 5.7.1 Terraform 状态管理

**风险**：
- 状态文件包含明文敏感信息（如数据库密码、IAM 密钥），存储在 S3 中可能泄露。
- 多人同时执行 `terraform apply` 导致状态冲突和数据损坏。
- 状态文件损坏或丢失后，Terraform 无法管理已有资源。

**最佳实践**：
```hcl
# backend.tf - 安全配置
terraform {
  backend "s3" {
    bucket         = "my-team-terraform-state"
    key            = "eks/prod/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
    kms_key_id     = "alias/terraform-state-key"
  }
}
```

- 启用 S3 桶的 `block_public_access` 和 `versioning`。
- 使用 DynamoDB 实现状态锁，防止并发写入。
- 定期备份状态文件到另一个区域。
- 考虑使用 Terraform Cloud 或 TACOS（TF Automation and Collaboration Software）管理状态。

### 5.7.2 EKS 版本升级

**风险**：
- EKS 仅支持当前版本 + 前两个版本（例如 1.28 发布后，1.25 将很快不可用）。
- 跳过多个版本升级不被支持，必须逐版本升级。
- 控制平面升级与节点组升级不同步，可能导致 API 兼容性问题。
- 第三方组件（Ingress Controller、Prometheus Operator）可能与新版本不兼容。

**升级流程**：
```
1. 检查兼容性: python eksctl.py upgrade-check my-cluster
2. 更新 Terraform 中的 kubernetes_version
3. terraform apply 升级控制平面 (约 30 分钟)
4. 升级节点组: terraform apply (滚动更新)
5. 升级附加组件: CoreDNS, kube-proxy, VPC CNI
6. 验证: python eksctl.py nodes my-cluster
```

**最佳实践**：
- 在非生产环境先验证升级。
- 升级前备份关键工作负载。
- 使用 `node_group.version` 锁定节点组版本，控制平面升级后逐步升级节点组。
- 订阅 AWS EKS 版本发布通知，提前规划升级窗口。

### 5.7.3 节点组扩缩容延迟

**风险**：
- 托管节点组扩缩容需要 3-8 分钟，流量突增时可能导致 Pod 调度延迟。
- Cluster Autoscaler 默认每 10 秒评估一次，扩容决策有滞后。
- Spot 实例中断时，如果节点组没有足够的 On-Demand 容量，Pod 可能无法重新调度。

**最佳实践**：
- 使用 Karpenter 替代 Cluster Autoscaler，扩容时间缩短到 30-60 秒。
- 配置 PodDisruptionBudget（PDB）确保服务可用性。
- 为关键服务预留缓冲区节点（Over-provisioning）。
- 使用 Cluster Autoscaler 的 `scale-down-delay-after-add` 参数防止频繁缩容。

```yaml
# over-provisioning 示例
apiVersion: apps/v1
kind: Deployment
metadata:
  name: overprovisioning
  namespace: kube-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: overprovisioning
  template:
    metadata:
      labels:
        app: overprovisioning
    spec:
      priorityClassName: system-cluster-critical
      containers:
      - name: pause
        image: registry.k8s.io/pause:3.9
      tolerations:
      - operator: "Exists"
```

### 5.7.4 VPC IP 耗尽

**风险**：
- 每个 AWS VPC CNI 分配的 Pod IP 来自子网 CIDR，子网 IP 耗尽后新 Pod 无法调度。
- 节点 ENI 数量限制 + 每个 ENI 的 IP 数量限制，决定了单节点的最大 Pod 数。
- 后期扩展子网 CIDR 不可行，只能新建子网并迁移节点组。

**最佳实践**：
- 私有子网使用 `/19` 或 `/20` CIDR，预留充足 IP。
- 启用 AWS VPC CNI 的 **Custom Networking** 功能，为 Pod 分配独立 CIDR。
- 考虑使用 **IPv6** 双栈模式，彻底解决 IP 耗尽问题。
- 监控子网 IP 使用率，设置 CloudWatch 告警（使用率 > 70% 触发通知）。

```hcl
# 启用 Custom Networking 的 Terraform 配置
resource "aws_eks_addon" "vpc_cni" {
  cluster_name = var.cluster_name
  addon_name   = "vpc-cni"
  addon_version = "v1.16.0-eksbuild.1"

  configuration_values = jsonencode({
    env = {
      AWS_VPC_K8S_CNI_CUSTOM_NETWORK_CFG = "true"
      ENI_CONFIG_LABEL_DEF               = "topology.kubernetes.io/zone"
    }
  })
}

# 为每个可用区创建辅助 CIDR 和子网
resource "aws_vpc_ipv4_cidr_block_association" "pod_cidr" {
  vpc_id     = var.vpc_id
  cidr_block = "100.64.0.0/16"
}
```

### 5.7.5 安全风险

**风险**：
- 集群 API 端点公开暴露，可能遭受暴力破解或 DDoS 攻击。
- 节点角色权限过大，Pod 被攻破后可以访问所有 AWS 资源。
- 镜像漏洞被利用，攻击者通过容器逃逸获取节点权限。
- 缺少网络策略，Pod 之间可以任意通信。

**最佳实践**：
- 生产环境设置 `endpoint_private_access = true`，API 端点仅内网访问。
- 严格使用 IRSA 而非节点角色授权。
- 启用 ECR 镜像扫描，结合 CI/CD 阻断高危镜像部署。
- 部署 Kubernetes NetworkPolicy 或使用服务网格（Istio/Envoy）实现零信任网络。

---

## 5.8 本章总结

本章围绕 EKS 集群与基础设施即代码这一主题，从五个核心维度进行了系统性讲解：

1. **Terraform 创建 EKS 集群**：模块化设计、Provider 配置、VPC/子网、集群与节点组的完整 HCL 实现，以及多环境管理的最佳实践。

2. **节点组与 IAM 配置**：托管节点组与自管理节点组的选型对比、IRSA 的细粒度权限模型、Karpenter 的弹性调度方案。

3. **VPC 与网络规划**：CIDR 规划原则、NAT 网关高可用设计、VPC 端点配置、Pod IP 耗尽问题的解决方案。

4. **ECR 镜像仓库**：生命周期策略、镜像扫描、跨账号访问的 Terraform 实现。

5. **Python 集群管理脚本**：从集群列表查询到节点健康检查的完整工具链。

6. **潜在风险与最佳实践**：状态文件安全、版本升级策略、扩缩容延迟、IP 耗尽、安全加固等生产环境必须关注的问题。

**核心原则回顾**：

- **一切皆代码**：基础设施、配置、策略都应版本化管理。
- **最小权限**：IAM 角色、安全组规则、网络策略都应遵循最小权限原则。
- **可观测性**：日志、指标、告警是运维的基石，在 IaC 中一并配置。
- **渐进式变更**：通过 Terraform Plan、Code Review、多环境部署实现安全变更。

EKS 集群的 IaC 实践不是一次性工作，而是随着业务发展持续演进的过程。建议团队建立基础设施的 Code Review 机制、定期进行 Terraform 版本升级、持续优化网络和 IAM 配置，才能真正发挥 IaC 的价值。
