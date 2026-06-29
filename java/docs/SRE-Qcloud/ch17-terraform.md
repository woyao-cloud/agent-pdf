# 第17章 Terraform 管理腾讯云基础设施

## 17.1 引言

基础设施即代码（Infrastructure as Code, IaC）是现代云计算运维的基石。Terraform 由 HashiCorp 公司开发，是目前业界最流行的开源 IaC 工具之一，它采用声明式配置语言 HCL（HashiCorp Configuration Language），支持跨多个云平台的一致化管理。本章聚焦于如何使用 Terraform 管理腾讯云（Tencent Cloud）资源，涵盖 Provider 配置、资源定义与依赖、模块化设计、远程状态管理（COS）、状态锁定等核心主题，并通过 VPC、CVM、TKE 的完整模块示例帮助读者建立生产级实践能力。

## 17.2 Terraform 与腾讯云 Provider 概述

### 17.2.1 Terraform 核心概念

Terraform 的核心工作流程包含三个主要阶段：

- **Write**：编写 HCL 配置文件，声明目标基础设施状态。
- **Plan**：Terraform 对比当前状态与期望状态，生成执行计划。
- **Apply**：执行计划中的变更，创建、更新或销毁资源。

每个 Terraform 项目由 `.tf` 文件组成，核心元素包括：

| 元素 | 说明 |
|------|------|
| `provider` | 声明云提供商及其认证配置 |
| `resource` | 定义具体的基础设施资源 |
| `data` | 引用已有资源的只读数据源 |
| `variable` | 输入变量，提高配置灵活性 |
| `output` | 输出值，供其他模块或用户使用 |
| `module` | 封装可复用的资源组合 |
| `terraform` | 后端配置、Provider 版本约束等 |

### 17.2.2 腾讯云 Provider

腾讯云官方 Terraform Provider 由 `tencentcloudstack` 组织维护，注册名为 `tencentcloudstack/tencentcloud`。它覆盖了计算、网络、存储、数据库、容器、安全等数十个产品类别，共计数百种资源类型。

Provider 的版本管理遵循语义化版本规范，建议在配置中锁定主版本号：

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = "~> 1.81"
    }
  }
}
```

`~> 1.81` 表示允许 >= 1.81 且 < 2.0 的版本更新，在保证兼容性的同时获取补丁级改进。

## 17.3 Provider 配置与认证

### 17.3.1 认证方式

腾讯云 Provider 支持多种认证方式，按优先级从高到低排列：

**方式一：静态凭证（仅适用于开发/测试环境）**

```hcl
provider "tencentcloud" {
  secret_id  = "AKIDxxxxxx"
  secret_key = "xxxxxxxxxxxxxx"
  region     = "ap-guangzhou"
}
```

**方式二：环境变量（推荐用于 CI/CD）**

```bash
export TENCENTCLOUD_SECRET_ID="AKIDxxxxxx"
export TENCENTCLOUD_SECRET_KEY="xxxxxxxxxxxxxx"
export TENCENTCLOUD_REGION="ap-guangzhou"
```

```hcl
provider "tencentcloud" {}
```

**方式三：CAM 角色扮演（推荐用于生产环境）**

通过腾讯云 CAM（Cloud Access Management）角色进行临时凭证交换，避免长期密钥泄露风险：

```hcl
provider "tencentcloud" {
  region = "ap-guangzhou"
  assume_role {
    role_arn     = "qcs::cam::uin/123456789:roleName/TerraformRole"
    session_name = "terraform-session"
    duration     = 3600
  }
}
```

**方式四：配置文件（不推荐）**

Terraform 会读取 `~/.tencentcloud/credentials` 文件中的 `[default]` 段落。

### 17.3.2 多区域与多账号配置

生产环境中经常需要管理多个区域或多个账号。Terraform 通过 `alias` 实现多 Provider 实例：

```hcl
provider "tencentcloud" {
  alias  = "guangzhou"
  region = "ap-guangzhou"
}

provider "tencentcloud" {
  alias  = "beijing"
  region = "ap-beijing"
}

resource "tencentcloud_vpc" "vpc_gz" {
  provider = tencentcloud.guangzhou
  name     = "vpc-gz"
  cidr_block = "10.0.0.0/16"
}

resource "tencentcloud_vpc" "vpc_bj" {
  provider = tencentcloud.beijing
  name     = "vpc-bj"
  cidr_block = "10.1.0.0/16"
}
```

对于多账号场景，可以在每个 Provider 块中指定不同的 `secret_id` 和 `secret_key`，或通过 `assume_role` 切换到目标账号的子账号角色。

## 17.4 资源定义与依赖管理

### 17.4.1 基本资源定义

Terraform 资源的通用语法为：

```hcl
resource "provider_resource_type" "local_name" {
  config_key = "value"
  # ...
}
```

以创建一个 VPC 为例：

```hcl
resource "tencentcloud_vpc" "main" {
  name         = "demo-vpc"
  cidr_block   = "10.0.0.0/16"
  is_multicast = false
  tags = {
    Environment = "production"
    ManagedBy   = "Terraform"
  }
}
```

### 17.4.2 隐式依赖与显式依赖

Terraform 通过分析资源之间的属性引用来**自动推断依赖关系**。当资源 A 的某个参数引用资源 B 的输出时，Terraform 确保 B 在 A 之前创建：

```hcl
resource "tencentcloud_vpc" "main" {
  name       = "demo-vpc"
  cidr_block = "10.0.0.0/16"
}

resource "tencentcloud_subnet" "main" {
  name              = "demo-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "ap-guangzhou-7"
}
```

当需要强制指定依赖但不存在属性引用时，使用 `depends_on` 声明显式依赖：

```hcl
resource "tencentcloud_security_group" "sg" {
  name        = "demo-sg"
  description = "Demo security group"
  vpc_id      = tencentcloud_vpc.main.id
}

resource "tencentcloud_security_group_rule" "ssh" {
  security_group_id = tencentcloud_security_group.sg.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "tcp"
  port_range        = "22"
  policy            = "accept"

  depends_on = [tencentcloud_security_group.sg]
}
```

### 17.4.3 资源生命周期管理

`lifecycle` 元参数控制资源的创建、更新和销毁行为：

```hcl
resource "tencentcloud_cvm_instance" "web" {
  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true
    ignore_changes = [
      tags["UpdatedAt"],
    ]
  }
  # ...
}
```

- `create_before_destroy`：先创建新资源再销毁旧资源，适用于需要零停机更新的场景。
- `prevent_destroy`：阻止 Terraform 销毁该资源，为关键资源提供安全网。
- `ignore_changes`：忽略指定属性的外部变更，防止 Terraform 每次 plan 都试图修正。

### 17.4.4 数据源引用

数据源（Data Source）用于查询已有资源的信息，而不创建新资源：

```hcl
data "tencentcloud_images" "ubuntu" {
  image_type = ["PUBLIC_IMAGE"]
  os_name    = "Ubuntu"
}

data "tencentcloud_instance_types" "cvm" {
  cpu_core_count = 4
  memory_size    = 8
}

output "image_id" {
  value = data.tencentcloud_images.ubuntu.images[0].image_id
}
```

## 17.5 模块化设计

### 17.5.1 模块的基本结构

模块是 Terraform 实现代码复用的核心机制。一个标准模块的目录结构如下：

```
modules/
├── vpc/
│   ├── main.tf          # 资源定义
│   ├── variables.tf     # 输入变量声明
│   ├── outputs.tf       # 输出值声明
│   └── README.md        # 模块文档
├── cvm/
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
└── tke/
    ├── main.tf
    ├── variables.tf
    └── outputs.tf
```

### 17.5.2 VPC 模块

以下是一个可复用的 VPC 模块，支持创建 VPC、子网、路由表和安全组：

**modules/vpc/variables.tf**

```hcl
variable "vpc_name" {
  description = "VPC 名称"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR 地址段"
  type        = string
}

variable "subnets" {
  description = "子网配置列表"
  type = list(object({
    name              = string
    cidr              = string
    availability_zone = string
  }))
}

variable "tags" {
  description = "资源标签"
  type        = map(string)
  default     = {}
}
```

**modules/vpc/main.tf**

```hcl
resource "tencentcloud_vpc" "this" {
  name         = var.vpc_name
  cidr_block   = var.vpc_cidr
  is_multicast = false
  tags         = var.tags
}

resource "tencentcloud_subnet" "this" {
  for_each = {
    for idx, subnet in var.subnets : idx => subnet
  }

  name              = each.value.name
  vpc_id            = tencentcloud_vpc.this.id
  cidr_block        = each.value.cidr
  availability_zone = each.value.availability_zone
  tags              = var.tags
}

resource "tencentcloud_route_table" "this" {
  name   = "${var.vpc_name}-rt"
  vpc_id = tencentcloud_vpc.this.id
  tags   = var.tags
}

resource "tencentcloud_route_table_association" "this" {
  for_each = tencentcloud_subnet.this

  route_table_id = tencentcloud_route_table.this.id
  subnet_id      = each.value.id
}
```

**modules/vpc/outputs.tf**

```hcl
output "vpc_id" {
  value = tencentcloud_vpc.this.id
}

output "subnet_ids" {
  value = {
    for k, subnet in tencentcloud_subnet.this : k => subnet.id
  }
}

output "route_table_id" {
  value = tencentcloud_route_table.this.id
}
```

### 17.5.3 CVM 模块

**modules/cvm/variables.tf**

```hcl
variable "instance_name" {
  description = "CVM 实例名称"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_id" {
  description = "子网 ID"
  type        = string
}

variable "image_id" {
  description = "镜像 ID"
  type        = string
}

variable "instance_type" {
  description = "实例规格"
  type        = string
  default     = "S5.LARGE8"
}

variable "security_group_ids" {
  description = "安全组 ID 列表"
  type        = list(string)
  default     = []
}

variable "password" {
  description = "实例密码"
  type        = string
  sensitive   = true
}

variable "system_disk_size" {
  description = "系统盘大小（GB）"
  type        = number
  default     = 50
}

variable "tags" {
  description = "资源标签"
  type        = map(string)
  default     = {}
}
```

**modules/cvm/main.tf**

```hcl
resource "tencentcloud_cvm_instance" "this" {
  instance_name     = var.instance_name
  availability_zone = var.availability_zone
  image_id          = var.image_id
  instance_type     = var.instance_type
  vpc_id            = var.vpc_id
  subnet_id         = var.subnet_id
  security_groups   = var.security_group_ids

  system_disk {
    disk_type = "CLOUD_PREMIUM"
    disk_size = var.system_disk_size
  }

  data_disks {
    disk_type = "CLOUD_PREMIUM"
    disk_size = 100
  }

  internet_max_bandwidth_out = 10
  allocate_public_ip         = true

  password = var.password

  tags = merge(var.tags, {
    Name = var.instance_name
  })
}
```

**modules/cvm/outputs.tf**

```hcl
output "instance_id" {
  value = tencentcloud_cvm_instance.this.id
}

output "private_ip" {
  value = tencentcloud_cvm_instance.this.private_ip
}

output "public_ip" {
  value = tencentcloud_cvm_instance.this.public_ip
}
```

### 17.5.4 TKE 模块

**modules/tke/variables.tf**

```hcl
variable "cluster_name" {
  description = "TKE 集群名称"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "集群子网 ID 列表"
  type        = list(string)
}

variable "cluster_version" {
  description = "Kubernetes 版本"
  type        = string
  default     = "1.28"
}

variable "node_pools" {
  description = "节点池配置"
  type = list(object({
    name       = string
    instance_type = string
    desired_size  = number
    max_size      = number
    min_size      = number
    subnet_id     = string
  }))
  default = []
}

variable "tags" {
  description = "资源标签"
  type        = map(string)
  default     = {}
}
```

**modules/tke/main.tf**

```hcl
resource "tencentcloud_kubernetes_cluster" "this" {
  vpc_id                  = var.vpc_id
  subnet_ids              = var.subnet_ids
  cluster_name            = var.cluster_name
  cluster_version         = var.cluster_version
  cluster_max_pod_num     = 64
  cluster_max_service_num = 128

  cluster_internet = true
  cluster_intranet = false

  managed_cluster_internet_security_group_ids = []

  tags = var.tags
}

resource "tencentcloud_kubernetes_node_pool" "this" {
  for_each = {
    for idx, pool in var.node_pools : idx => pool
  }

  name             = each.value.name
  cluster_id       = tencentcloud_kubernetes_cluster.this.id
  node_pool_subnet_ids = [each.value.subnet_id]

  auto_scaling_config {
    instance_type      = each.value.instance_type
    system_disk_type   = "CLOUD_PREMIUM"
    system_disk_size   = 50
    security_group_ids = []
    data_disk {
      disk_type = "CLOUD_PREMIUM"
      disk_size = 100
    }
    internet_max_bandwidth_out = 5
    allocate_public_ip         = false
  }

  auto_scaling_group_config {
    desired_capacity = each.value.desired_size
    max_size         = each.value.max_size
    min_size         = each.value.min_size
    vpc_id           = var.vpc_id
    subnet_ids       = [each.value.subnet_id]
    retry_policy     = "INCREMENTAL_INTERVALS"
  }

  labels = {
    "node-pool" = each.value.name
  }
}
```

**modules/tke/outputs.tf**

```hcl
output "cluster_id" {
  value = tencentcloud_kubernetes_cluster.this.id
}

output "kubeconfig" {
  value     = tencentcloud_kubernetes_cluster.this.kube_config
  sensitive = true
}

output "cluster_endpoint" {
  value = tencentcloud_kubernetes_cluster.this.cluster_external_endpoint
}
```

### 17.5.5 模块调用示例

在根模块中调用上述子模块：

```hcl
module "vpc" {
  source = "./modules/vpc"

  vpc_name = "production-vpc"
  vpc_cidr = "10.0.0.0/16"
  subnets = [
    {
      name              = "subnet-az1"
      cidr              = "10.0.1.0/24"
      availability_zone = "ap-guangzhou-7"
    },
    {
      name              = "subnet-az2"
      cidr              = "10.0.2.0/24"
      availability_zone = "ap-guangzhou-4"
    },
  ]
  tags = {
    Environment = "production"
    ManagedBy   = "Terraform"
  }
}

module "cvm" {
  source = "./modules/cvm"

  instance_name     = "web-server-01"
  vpc_id            = module.vpc.vpc_id
  subnet_id         = module.vpc.subnet_ids["0"]
  image_id          = "img-xxxxxx"
  instance_type     = "S5.LARGE8"
  security_group_ids = [tencentcloud_security_group.web_sg.id]
  password          = var.cvm_password
  tags = {
    Role = "web-server"
  }
}

module "tke" {
  source = "./modules/tke"

  cluster_name = "production-cluster"
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = [for k, v in module.vpc.subnet_ids : v]
  node_pools = [
    {
      name          = "cpu-pool"
      instance_type = "S5.LARGE8"
      desired_size  = 3
      max_size      = 10
      min_size      = 1
      subnet_id     = module.vpc.subnet_ids["0"]
    },
  ]
}
```

### 17.5.6 模块来源

Terraform 模块可以从多种来源加载：

| 来源 | 示例 |
|------|------|
| 本地路径 | `source = "./modules/vpc"` |
| Git 仓库 | `source = "git::https://github.com/org/terraform-modules.git//vpc?ref=v1.0.0"` |
| Terraform Registry | `source = "tencentcloudstack/tencentcloud-xxx"` |
| HTTP URL | `source = "https://example.com/module.tar.gz"` |

生产环境推荐将模块托管在 Git 仓库中，通过 `ref` 参数锁定版本，确保环境一致性。

## 17.6 远程状态管理

### 17.6.1 本地状态的局限性

Terraform 默认将状态文件（`terraform.tfstate`）存储在本地工作目录。这种方式在团队协作中存在严重问题：

- **共享困难**：团队成员无法自动获取最新状态。
- **状态冲突**：多人同时执行 `apply` 可能导致状态损坏。
- **环境隔离差**：开发、测试、生产环境的状态混在一起。
- **安全风险**：状态文件可能包含明文密码、密钥等敏感信息。

### 17.6.2 COS 作为远程后端

腾讯云对象存储（COS）是官方推荐的远程状态后端。配置方式如下：

```hcl
terraform {
  backend "cos" {
    bucket = "terraform-state-1234567890"
    region = "ap-guangzhou"
    prefix = "production/vpc"
    key    = "terraform.tfstate"
    encrypt = true
  }
}
```

参数说明：

| 参数 | 说明 |
|------|------|
| `bucket` | COS 存储桶名称，需全局唯一 |
| `region` | 存储桶所在地域 |
| `prefix` | 状态文件在桶内的路径前缀 |
| `key` | 状态文件名，默认 `terraform.tfstate` |
| `encrypt` | 是否启用服务端加密 |

### 17.6.3 多环境状态隔离

推荐按环境 + 项目组织状态文件路径：

```hcl
# 生产环境 - VPC
terraform {
  backend "cos" {
    bucket = "tf-state-company"
    region = "ap-guangzhou"
    prefix = "production/vpc"
  }
}

# 生产环境 - TKE
terraform {
  backend "cos" {
    bucket = "tf-state-company"
    region = "ap-guangzhou"
    prefix = "production/tke"
  }
}

# 开发环境
terraform {
  backend "cos" {
    bucket = "tf-state-company"
    region = "ap-guangzhou"
    prefix = "development/vpc"
  }
}
```

### 17.6.4 后端配置的动态化

使用 `-backend-config` 参数在初始化时动态指定后端配置，避免将敏感信息硬编码：

```bash
terraform init \
  -backend-config="bucket=tf-state-company" \
  -backend-config="region=ap-guangzhou" \
  -backend-config="prefix=production/vpc"
```

也可以使用部分后端配置文件：

```hcl
# backend.hcl
bucket = "tf-state-company"
region = "ap-guangzhou"
```

```bash
terraform init -backend-config=backend.hcl
```

### 17.6.5 状态文件的安全管理

COS 后端支持通过存储桶策略限制访问权限：

```hcl
resource "tencentcloud_cos_bucket" "tf_state" {
  bucket = "tf-state-company"
  acl    = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "tencentcloud_cos_bucket_policy" "tf_state_policy" {
  bucket = tencentcloud_cos_bucket.tf_state.bucket
  policy = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        principal = {
          qcs = ["qcs::cam::uin/1234567890:role/TerraformRole"]
        }
        action = [
          "name/cos:GetObject",
          "name/cos:PutObject",
          "name/cos:DeleteObject",
          "name/cos:HeadObject",
        ]
        resource = ["qcs::cos:ap-guangzhou:uid/1234567890:tf-state-company/*"]
      },
      {
        effect = "deny"
        principal = { qcs = ["*"] }
        action = ["name/cos:*"]
        resource = ["qcs::cos:ap-guangzhou:uid/1234567890:tf-state-company/*"]
        condition = {
          bool = {
            "cos:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
```

## 17.7 状态锁定

### 17.7.1 为什么需要状态锁定

当多个团队成员或 CI/CD 流水线同时执行 `terraform apply` 时，可能出现以下问题：

1. **竞态条件**：两个进程同时读取同一状态文件，各自生成 plan，后完成的 apply 可能覆盖前一个的变更。
2. **状态损坏**：并发写入导致状态文件格式错误。
3. **资源泄漏**：一个进程创建了资源但状态被另一个进程覆盖，导致无法追踪。

状态锁定机制确保同一时间只有一个进程能修改状态文件。

### 17.7.2 COS 后端的锁定机制

Terraform 的 COS 后端内置了基于 DynamoDB 的锁定机制（腾讯云侧使用类似的分布式锁服务）。当使用 COS 后端时，Terraform 会自动在状态文件所在路径创建一个 `.tflock` 标记文件。

锁定流程：

1. `terraform apply` 开始时，Terraform 尝试在 COS 中创建锁定文件。
2. 如果锁定文件已存在（表明有其他进程在执行），当前进程阻塞等待。
3. 操作完成后，Terraform 删除锁定文件释放锁。
4. 如果进程异常退出导致锁未释放，需要手动强制解锁。

### 17.7.3 强制解锁

当锁定因进程崩溃、网络中断等原因未能正常释放时，使用 `force-unlock` 命令：

```bash
terraform force-unlock <LOCK_ID>
```

`LOCK_ID` 在 `terraform plan` 或 `terraform apply` 失败时会显示在错误信息中。也可以通过 COS 控制台手动删除 `.tflock` 文件。

**注意**：强制解锁是危险操作，只有在确认没有其他进程正在执行 `apply` 时才能执行。

### 17.7.4 CI/CD 中的锁定策略

在 CI/CD 流水线中，建议采用以下策略避免锁定冲突：

```yaml
# GitLab CI 示例
stages:
  - plan
  - apply

terraform:plan:
  stage: plan
  script:
    - terraform init
    - terraform plan -out=plan.tfplan
  only:
    - merge_requests
    - main

terraform:apply:
  stage: apply
  script:
    - terraform init
    - terraform apply plan.tfplan
  only:
    - main
  resource_group: terraform-apply
```

`resource_group` 确保同一时间只有一个 pipeline 执行 apply 阶段，与 Terraform 的状态锁定形成双重保护。

## 17.8 完整生产环境示例

### 17.8.1 项目结构

```
terraform-tencent/
├── environments/
│   ├── production/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── terraform.tfvars
│   │   └── backend.hcl
│   └── staging/
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── terraform.tfvars
│       └── backend.hcl
├── modules/
│   ├── vpc/
│   ├── cvm/
│   ├── tke/
│   └── security/
├── scripts/
│   └── init.sh
└── README.md
```

### 17.8.2 生产环境配置

**environments/production/main.tf**

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = "~> 1.81"
    }
  }
  backend "cos" {
    bucket = "tf-state-company"
    region = "ap-guangzhou"
    prefix = "production"
  }
}

provider "tencentcloud" {
  region = "ap-guangzhou"
}

# 数据源：查询最新的 Ubuntu 镜像
data "tencentcloud_images" "ubuntu" {
  image_type = ["PUBLIC_IMAGE"]
  os_name    = "Ubuntu"
  filter {
    name   = "image-state"
    values = ["AVAILABLE"]
  }
}

# VPC 模块
module "vpc" {
  source = "../../modules/vpc"

  vpc_name = "prod-main-vpc"
  vpc_cidr = "10.0.0.0/16"
  subnets = [
    {
      name              = "prod-az1-app"
      cidr              = "10.0.1.0/24"
      availability_zone = "ap-guangzhou-7"
    },
    {
      name              = "prod-az2-app"
      cidr              = "10.0.2.0/24"
      availability_zone = "ap-guangzhou-4"
    },
    {
      name              = "prod-az1-db"
      cidr              = "10.0.3.0/24"
      availability_zone = "ap-guangzhou-7"
    },
  ]
  tags = var.tags
}

# 安全组
module "web_sg" {
  source = "../../modules/security"

  name        = "prod-web-sg"
  description = "Web server security group"
  vpc_id      = module.vpc.vpc_id
  rules = [
    {
      type        = "ingress"
      ip_protocol = "tcp"
      port_range  = "80,443"
      cidr_ip     = "0.0.0.0/0"
      policy      = "accept"
    },
    {
      type        = "ingress"
      ip_protocol = "tcp"
      port_range  = "22"
      cidr_ip     = "10.0.0.0/8"
      policy      = "accept"
    },
  ]
  tags = var.tags
}

# CVM 实例
module "bastion" {
  source = "../../modules/cvm"

  instance_name     = "prod-bastion"
  vpc_id            = module.vpc.vpc_id
  subnet_id         = module.vpc.subnet_ids["0"]
  image_id          = data.tencentcloud_images.ubuntu.images[0].image_id
  instance_type     = "S5.SMALL2"
  security_group_ids = [module.web_sg.security_group_id]
  password          = var.bastion_password
  tags              = var.tags
}

# TKE 集群
module "tke" {
  source = "../../modules/tke"

  cluster_name  = "prod-k8s"
  vpc_id        = module.vpc.vpc_id
  subnet_ids    = [module.vpc.subnet_ids["0"], module.vpc.subnet_ids["1"]]
  cluster_version = "1.30"
  node_pools = [
    {
      name          = "prod-cpu-pool"
      instance_type = "S5.LARGE8"
      desired_size  = 5
      max_size      = 20
      min_size      = 3
      subnet_id     = module.vpc.subnet_ids["0"]
    },
  ]
  tags = var.tags
}
```

**environments/production/variables.tf**

```hcl
variable "bastion_password" {
  description = "堡垒机密码"
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "全局标签"
  type        = map(string)
  default = {
    Environment = "production"
    ManagedBy   = "Terraform"
    Project     = "platform"
  }
}
```

**environments/production/terraform.tfvars**

```hcl
bastion_password = "YourSecurePassword123!"
```

**environments/production/outputs.tf**

```hcl
output "vpc_id" {
  value = module.vpc.vpc_id
}

output "bastion_public_ip" {
  value = module.bastion.public_ip
}

output "tke_cluster_id" {
  value = module.tke.cluster_id
}

output "tke_kubeconfig" {
  value     = module.tke.kubeconfig
  sensitive = true
}
```

### 17.8.3 部署流程

```bash
# 1. 初始化（使用 COS 后端）
cd environments/production
terraform init -backend-config=backend.hcl

# 2. 格式化与验证
terraform fmt -recursive
terraform validate

# 3. 查看执行计划
terraform plan -out=plan.tfplan

# 4. 应用变更
terraform apply plan.tfplan

# 5. 查看已管理资源
terraform state list

# 6. 销毁（谨慎操作）
terraform destroy
```

## 17.9 最佳实践

### 17.9.1 代码组织

- **按环境拆分目录**：每个环境（dev/staging/prod）使用独立的目录和后端配置。
- **模块化设计**：将可复用的资源组合封装为模块，模块应遵循单一职责原则。
- **版本锁定**：在 `terraform` 块中锁定 Provider 版本，在模块源中通过 `ref` 锁定模块版本。

### 17.9.2 状态管理

- **始终使用远程后端**：团队协作必须使用 COS 等远程后端。
- **环境隔离**：每个环境使用独立的 COS 路径前缀。
- **敏感信息保护**：状态文件可能包含密码和密钥，通过 COS 的访问策略限制访问范围。
- **定期备份**：COS 本身提供多副本冗余，但建议开启版本控制以支持状态文件回滚。

### 17.9.3 安全实践

- **避免硬编码凭证**：使用环境变量或 CAM 角色代替明文密钥。
- **使用 sensitive 标记**：对密码、密钥等变量标记 `sensitive = true`。
- **最小权限原则**：Terraform 使用的 CAM 账号应仅授予所需资源的最小权限集。
- **审计日志**：开启 CloudAudit 记录所有 Terraform 操作。

### 17.9.4 CI/CD 集成

- **Plan 在 MR/PR 阶段执行**：让团队成员在合并前审查基础设施变更。
- **Apply 仅在主干执行**：通过分支策略控制 apply 的执行时机。
- **状态锁定保护**：结合 CI 的 resource_group 和 Terraform 的状态锁定，防止并发冲突。
- **自动化测试**：在沙箱环境中自动执行 `terraform plan` 和 `terraform apply` 验证模块正确性。

### 17.9.5 常见陷阱与规避

| 陷阱 | 解决方案 |
|------|----------|
| 手动修改云控制台资源导致状态漂移 | 使用 `terraform refresh` 同步状态，或通过 `lifecycle.ignore_changes` 忽略已知的外部变更 |
| 状态文件泄露敏感信息 | 开启 COS 服务端加密，限制存储桶访问策略 |
| 模块版本不统一 | 所有模块通过 Git tag 锁定版本，使用 `ref` 参数引用 |
| 大状态文件导致性能下降 | 按业务域拆分状态文件，每个状态文件管理的资源不超过 500 个 |
| 误删生产资源 | 对关键资源设置 `prevent_destroy`，使用 `terraform plan` 仔细审查销毁操作 |

## 17.10 故障排查

### 17.10.1 常见错误

**错误 1：Provider 认证失败**

```
Error: Failed to query available provider packages
│
│ Could not retrieve the list of available versions for provider
│ tencentcloudstack/tencentcloud
```

解决方案：检查 `TENCENTCLOUD_SECRET_ID` 和 `TENCENTCLOUD_SECRET_KEY` 环境变量是否正确设置，或确认 `provider` 块中的凭证配置。

**错误 2：状态锁定超时**

```
Error: Error acquiring the state lock
│
│ Error message: lock was already acquired
```

解决方案：确认没有其他进程在执行 `apply`，然后执行 `terraform force-unlock <LOCK_ID>`。

**错误 3：资源已存在**

```
Error: Code=ResourceInUse, Message=The VPC already exists
```

解决方案：将已有资源导入 Terraform 管理：`terraform import tencentcloud_vpc.main vpc-xxxxxx`。

### 17.10.2 调试技巧

```bash
# 启用详细日志
export TF_LOG=DEBUG
export TF_LOG_PATH=./terraform.log

# 查看资源当前状态
terraform state show tencentcloud_vpc.main

# 列出所有托管资源
terraform state list

# 从状态中移除资源（不移除实际资源）
terraform state rm tencentcloud_cvm_instance.web

# 将已有资源纳入管理
terraform import tencentcloud_cvm_instance.web ins-xxxxxx
```

## 17.11 总结

本章详细介绍了使用 Terraform 管理腾讯云基础设施的完整方法论。从 Provider 配置与认证入手，深入讲解了资源定义、依赖管理、模块化设计等核心概念。远程状态管理部分阐述了 COS 后端的配置与安全策略，状态锁定机制则解决了团队协作中的并发冲突问题。通过 VPC、CVM、TKE 三个完整的模块示例，读者可以快速上手构建生产级基础设施。最后的最佳实践和故障排查指南为日常运维提供了实用参考。

Terraform 将基础设施的管理从手动操作转变为代码化、版本化、自动化的工程实践，是 SRE 和云运维工程师不可或缺的核心技能。结合腾讯云丰富的产品生态，Terraform 能够帮助团队实现高效、可靠、可审计的云基础设施管理。

## 17.12 参考资源

- 腾讯云 Terraform Provider 文档：https://registry.terraform.io/providers/tencentcloudstack/tencentcloud/latest/docs
- Terraform 官方文档：https://developer.hashicorp.com/terraform/docs
- 腾讯云 COS 后端文档：https://developer.hashicorp.com/terraform/language/settings/backends/cos
- 腾讯云 Terraform 最佳实践：https://cloud.tencent.com/document/product/1213
- Terraform 模块注册中心：https://registry.terraform.io/browse?provider=tencentcloud
