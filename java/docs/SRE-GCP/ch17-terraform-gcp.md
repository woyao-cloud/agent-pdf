# 第 17 章 Terraform 在 GCP 上的实践

## 17.1 为什么需要基础设施即代码？

### 一个故事：手动配置的代价

某团队通过 GCP 控制台手动创建了所有基础设施——VPC 网络、防火墙规则、GKE 集群、Cloud SQL 实例。花了两周时间，配置了 50 多个资源。

3 个月后，需求变更——需要创建一个新的测试环境，要求与生产环境配置一致。团队试图回忆当初的配置，但发现：
- 没有人完整记录所有的配置项
- 控制台中的配置难以导出
- 即使重新手动配置，也无法保证与生产环境完全一致

最终，测试环境花了 1 周才搭建完成，而且与生产环境存在多处差异——防火墙规则少了 2 条，数据库配置不同。

**教训：** 手动配置基础设施是不可复现、不可审计、不可靠的。

### IaC 的三大好处

| 好处 | 说明 | 手动配置 | IaC |
|------|------|---------|-----|
| 可复现 | 同样的配置可以重复创建 | ❌ 每次都可能不同 | ✅ 完全一致 |
| 可审计 | 配置变更可以追溯 | ❌ 谁改了什么不清楚 | ✅ 版本控制 |
| 可靠 | 减少人为错误 | ❌ 容易出错 | ✅ 自动化验证 |

---

## 17.2 Terraform 的工作模式

### 三步工作流

Terraform 的工作流程可以概括为三步：

**第一步：编写（Write）**

```hcl
# main.tf
provider "google" {
  project = "my-project"
  region  = "us-central1"
}

resource "google_compute_network" "vpc" {
  name                    = "prod-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "prod-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = "us-central1"
  network       = google_compute_network.vpc.id
}
```

你编写 `.tf` 文件描述你想要的基础设施。每个资源通过资源类型和名称来标识。

**第二步：规划（Plan）**

```bash
terraform plan -out=tfplan
```

Terraform 读取你的配置文件和当前的状态文件，计算出从当前状态到目标状态需要做哪些变更。

```
Terraform will perform the following actions:

  # google_compute_network.vpc will be created
  + resource "google_compute_network" "vpc" {
      + id                            = (known after apply)
      + name                          = "prod-vpc"
      + auto_create_subnetworks       = false
    }

  # google_compute_subnetwork.subnet will be created
  + resource "google_compute_subnetwork" "subnet" {
      + id          = (known after apply)
      + name        = "prod-subnet"
      + ip_cidr_range = "10.0.1.0/24"
    }

Plan: 2 to add, 0 to change, 0 to delete.
```

**第三步：应用（Apply）**

```bash
terraform apply tfplan
```

审阅 Plan 的输出，确认无误后执行。Terraform 会创建、更新或删除资源。

### 为什么 Plan 很重要？

Plan 是一个安全检查机制：**你永远不会在不了解变更内容的情况下直接改动基础设施。**

```bash
# 在 CI/CD 中，Plan 输出会被自动发布到 PR 中
# 团队成员审查 Plan 输出，确认没有意外的变更
# 特别是要关注：是否误删了资源？是否改变了关键配置？
```

---

## 17.3 远程状态管理

### 为什么需要远程状态？

Terraform 使用状态文件（terraform.tfstate）来跟踪它管理的资源。没有远程状态管理时，状态文件保存在本地——带来了几个问题：

| 问题 | 本地状态 | 远程状态 |
|------|---------|---------|
| 共享 | 团队成员无法共享 | ✅ 多人共享 |
| 安全 | 本地文件容易丢失 | ✅ 存储在安全的 Cloud Storage |
| CI/CD 集成 | 无法在流水线中使用 | ✅ 天然支持 |
| 锁定 | 多人同时操作可能冲突 | ✅ 支持状态锁定 |

### 配置远程状态存储

```hcl
# backend.tf
terraform {
  backend "gcs" {
    bucket = "my-project-terraform-state"
    prefix = "prod/network"
  }
}
```

```bash
# 创建存储状态的 Bucket
gsutil mb gs://my-project-terraform-state

# 启用版本控制（用于状态文件回滚）
gsutil versioning set on gs://my-project-terraform-state

# 启用对象锁定（防止误删）
gsutil retention set 30d gs://my-project-terraform-state
```

### 远程状态的组织方式

```hcl
# 按环境和模块组织状态文件
terraform {
  backend "gcs" {
    bucket = "my-project-terraform-state"
    prefix = "prod/network"     # 生产环境 - 网络
  }
}

# 其他状态文件示例
# prefix = "prod/compute"      # 生产环境 - 计算资源
# prefix = "prod/database"     # 生产环境 - 数据库
# prefix = "staging/network"   # 测试环境 - 网络
```

---

## 17.4 模块化设计

### 为什么需要模块？

当你开始用 Terraform 管理基础设施时，如果所有资源定义都写在一个文件中，文件很快就会变得庞大且难以维护。

```hcl
# 不好的做法：所有资源写在一个文件中（超过 500 行）
# 难以阅读、难以维护、无法复用
```

模块是把一组相关的资源封装成一个可复用的单元。

### 创建模块

```hcl
# modules/vpc/main.tf
variable "env_name" {
  description = "Environment name (prod, staging, dev)"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR range"
  type        = string
  default     = "10.0.0.0/16"
}

resource "google_compute_network" "vpc" {
  name                    = "${var.env_name}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  count = length(var.subnet_configs)
  
  name          = "${var.env_name}-${var.subnet_configs[count.index].name}"
  ip_cidr_range = var.subnet_configs[count.index].cidr
  region        = var.subnet_configs[count.index].region
  network       = google_compute_network.vpc.id
}

output "vpc_id" {
  value = google_compute_network.vpc.id
}

output "subnet_ids" {
  value = { for s in google_compute_subnetwork.subnet : s.name => s.id }
}
```

### 使用模块

```hcl
# environments/prod/main.tf
module "vpc" {
  source = "../../modules/vpc"
  
  env_name = "prod"
  vpc_cidr = "10.0.0.0/16"
  
  subnet_configs = [
    {
      name   = "app"
      cidr   = "10.0.1.0/24"
      region = "us-central1"
    },
    {
      name   = "db"
      cidr   = "10.0.2.0/24"
      region = "us-central1"
    },
    {
      name   = "bastion"
      cidr   = "10.0.100.0/24"
      region = "us-central1"
    },
  ]
}

# 使用模块的输出
output "vpc_id" {
  value = module.vpc.vpc_id
}
```

### 模块设计原则

| 原则 | 说明 | 示例 |
|------|------|------|
| 单一职责 | 一个模块只做一件事 | VPC 模块只管理网络，不管理计算 |
| 接口明确 | 输入输出清晰定义 | 使用 variable 和 output |
| 版本管理 | 用 Git Tag 管理版本 | `source = "git::https://...//modules/vpc?ref=v1.2.0"` |
| 文档化 | 每个模块有 README | 说明用途、输入、输出 |

### 模块的版本管理

```hcl
# 使用 Git 作为模块源，并指定版本
module "vpc" {
  source = "git::https://github.com/myorg/terraform-modules.git//modules/vpc?ref=v1.2.0"
  
  env_name = "prod"
}
```

---

## 17.5 GCP Provider 的最佳实践

### Provider 配置

```hcl
# versions.tf
terraform {
  required_version = ">= 1.5"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0, < 6.0"
    }
  }
}
```

### 服务账号和认证

```bash
# 推荐：使用 Workload Identity Federation（不存储密钥文件）
# 在 CI/CD 环境中配置：
# - GitHub Actions：使用 workload_identity_provider
# - Cloud Build：使用 Cloud Build 服务账号

# 本地开发：
gcloud auth application-default login

# CI/CD（GitHub Actions）：
# 配置 Workload Identity Federation
# 不需要服务账号密钥文件
```

### 资源命名规范

```hcl
# 推荐的命名模式
resource "google_compute_instance" "web" {
  name = "prod-web-001"  # {环境}-{应用}-{编号}
}

resource "google_compute_disk" "data" {
  name = "prod-data-disk-001"  # {环境}-{用途}-{类型}-{编号}
}

# 使用标签便于管理和成本分摊
resource "google_compute_instance" "web" {
  name = "prod-web-001"
  
  labels = {
    environment = "production"
    team        = "payment"
    cost-center = "cc-123"
    terraform   = "true"
  }
}
```

---

## 17.6 一个场景：完整的多环境 Terraform 配置

### 目录结构

```
terraform/
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── gke/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── cloud-sql/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── environments/
│   ├── prod/
│   │   ├── main.tf
│   │   ├── backend.tf
│   │   ├── terraform.tfvars
│   │   └── versions.tf
│   ├── staging/
│   │   ├── main.tf
│   │   ├── backend.tf
│   │   ├── terraform.tfvars
│   │   └── versions.tf
│   └── dev/
│       ├── main.tf
│       ├── backend.tf
│       ├── terraform.tfvars
│       └── versions.tf
└── README.md
```

### 生产环境配置

```hcl
# environments/prod/main.tf
module "vpc" {
  source = "../../modules/vpc"
  
  env_name = "prod"
  subnet_configs = [
    { name = "app", cidr = "10.0.1.0/24", region = "us-central1" },
    { name = "db",  cidr = "10.0.2.0/24", region = "us-central1" },
  ]
}

module "gke" {
  source = "../../modules/gke"
  
  env_name    = "prod"
  region      = "us-central1"
  node_locations = ["us-central1-a", "us-central1-b", "us-central1-c"]
  node_count  = 3
  machine_type = "e2-standard-4"
  vpc_id      = module.vpc.vpc_id
  subnet_id   = module.vpc.subnet_ids["prod-app"]
}

module "cloud_sql" {
  source = "../../modules/cloud-sql"
  
  env_name        = "prod"
  region          = "us-central1"
  database_version = "POSTGRES_15"
  tier            = "db-custom-4-16384"
  vpc_id          = module.vpc.vpc_id
  subnet_id       = module.vpc.subnet_ids["prod-db"]
}

# 输出
output "gke_cluster_name" {
  value = module.gke.cluster_name
}

output "cloud_sql_instance" {
  value = module.cloud_sql.instance_name
}
```

```hcl
# environments/prod/terraform.tfvars
project_id = "my-project-prod"
region     = "us-central1"

# 生产环境使用较高的资源规格
gke_machine_type = "e2-standard-4"
gke_node_count   = 3
sql_tier         = "db-custom-4-16384"
```

### 部署命令

```bash
# 部署生产环境
cd environments/prod

terraform init
terraform plan -out=tfplan
terraform apply tfplan

# 销毁生产环境（谨慎操作）
terraform destroy
```

---

## 17.7 反模式：Terraform 实践中的常见错误

### 反模式一：硬编码敏感信息

**表现**：数据库密码、API 密钥直接写在配置文件中。

```hcl
# ❌ 不好的做法：硬编码密码
resource "google_sql_database_instance" "db" {
  settings {
    user_password = "MyP@ssw0rd123!"  # 密码被提交到 Git
  }
}
```

**正确的做法**：

```hcl
# ✅ 使用 Secret Manager 或变量
variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true  # 标记为敏感，不会在 Plan 输出中显示
}

resource "google_sql_database_instance" "db" {
  settings {
    user_password = var.db_password
  }
}
```

### 反模式二：手动在控制台修改 Terraform 管理的资源

**表现**：在 GCP 控制台中手动修改了某个资源（如防火墙规则），但该资源由 Terraform 管理。

**后果**：下次运行 `terraform apply` 时，Terraform 会把资源改回代码中定义的状态——你的手动修改被覆盖了。

**正确的做法**：如果资源由 Terraform 管理，所有变更都通过修改代码和运行 Terraform 来完成。

### 反模式三：一个 Terraform 项目管理所有资源

**表现**：所有环境的全部资源都在同一个 Terraform 项目中。

**后果**：状态文件巨大，Plan 执行缓慢。一次变更可能影响多个环境。

**正确的做法**：按环境和模块拆分——每个环境一个独立的 Terraform 项目，每个功能模块独立的子项目。

### 反模式四：没有锁定 Terraform 版本

**表现**：`required_version` 没有指定，或者 Provider 版本没有锁定。

```hcl
# ❌ 不好的做法：没有版本锁定
terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
    }
  }
}
```

**后果**：不同时间执行 `terraform init` 可能使用不同版本的 Provider，导致行为不一致。

**正确的做法**：

```hcl
# ✅ 锁定版本
terraform {
  required_version = ">= 1.5, < 2.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"  # 5.x 版本，不会自动升级到 6.x
    }
  }
}
```

---

## 17.8 速查总结

### Terraform 命令速查

| 命令 | 用途 | 说明 |
|------|------|------|
| `terraform init` | 初始化工作目录 | 下载 Provider、配置后端 |
| `terraform fmt` | 格式化代码 | 检查代码格式 |
| `terraform validate` | 验证配置 | 检查语法错误 |
| `terraform plan` | 预览变更 | 安全地查看将要执行的操作 |
| `terraform apply` | 执行变更 | 应用配置到云平台 |
| `terraform destroy` | 销毁资源 | 删除所有管理的资源 |
| `terraform state list` | 列出状态中的资源 | 查看当前管理的资源列表 |
| `terraform import` | 导入已有资源 | 将手动创建的资源纳入管理 |

### 目录结构模板

```
terraform/
├── modules/                    # 可复用的模块
│   ├── vpc/
│   ├── gke/
│   └── cloud-sql/
├── environments/               # 环境配置
│   ├── prod/
│   ├── staging/
│   └── dev/
├── .gitignore                  # 忽略 .terraform/ 和 *.tfstate
└── README.md
```

### 每周 Terraform 检查清单

- [ ] 所有环境都能成功执行 `terraform plan`？
- [ ] 状态文件是否安全存储在远程后端？
- [ ] 敏感信息是否存储在 Secret Manager 中？
- [ ] Provider 和 Terraform 版本是否锁定？
- [ ] 模块是否需要更新或发布新版本？

---

> **下一章预告：** 单靠 Terraform 还不够——你需要 CI/CD 流水线来自动化基础设施的部署和变更。第 18 章将介绍如何构建 Terraform CI/CD 流水线，包括 Plan 审批机制和 GitOps 实践。