# 第 18 章 CI/CD 基础设施流水线

## 18.1 为什么基础设施需要 CI/CD？

### 一个故事：没有 CI/CD 的部署

某团队通过 Terraform 管理基础设施。但流程是这样的：开发者在本机修改 Terraform 代码，然后直接运行 `terraform apply`。

一天，开发者 A 修改了防火墙规则，没有运行 `terraform plan` 就直接 `apply`——结果误删了一条关键的安全规则，导致生产环境的外网访问中断了 30 分钟。

**问题出在哪里？**

1. 没有 Plan 审查：变更没有经过任何人审查就直接应用
2. 没有自动化验证：代码格式、语法错误没有被及时发现
3. 没有变更记录：谁在什么时候改了什么，无法追溯

### 基础设施 CI/CD 的价值

| 维度 | 手动操作 | CI/CD 流水线 |
|------|---------|-------------|
| 变更审查 | ❌ 可能跳过 | ✅ 自动触发 Plan + 人工审查 |
| 自动化验证 | ❌ 容易遗漏 | ✅ 格式检查、语法验证、安全检查 |
| 变更记录 | ❌ 难以追溯 | ✅ 所有变更在 PR 中记录 |
| 一致性 | ❌ 环境可能不同 | ✅ 同一套代码部署所有环境 |

---

## 18.2 Terraform CI/CD 流水线设计

### 流水线流程

一个典型的 Terraform CI/CD 流水线包含以下步骤：

```
开发者提交 PR → CI 自动运行 → 生成 Plan 输出 → 团队审查
                                                     ↓
                                            PR 合并到主分支
                                                     ↓
                                            CD 自动运行 Apply
```

**详细流程：**

```
PR 创建/更新
    │
    ├─ 步骤 1: 格式检查 (terraform fmt -check)
    ├─ 步骤 2: 语法验证 (terraform validate)
    ├─ 步骤 3: 安全检查 (checkov/tfsec)
    ├─ 步骤 4: Plan 生成 (terraform plan)
    └─ 步骤 5: Plan 发布到 PR 评论
                │
        ┌───────┴───────┐
        │                │
    Plan 审查通过     Plan 审查不通过
    PR 合并到主分支    开发者修改代码
        │                │
    CD 自动 Apply    重新触发 CI
        │
    └─ 步骤 6: 自动 Apply (terraform apply)
```

### 使用 Cloud Build

```yaml
# cloudbuild-tf-plan.yaml
# CI：生成 Terraform Plan
steps:
  # 步骤 1: 初始化 Terraform
  - id: terraform-init
    name: hashicorp/terraform:1.5
    entrypoint: terraform
    args:
      - init
      - -backend-config=bucket=$_TF_STATE_BUCKET
      - -backend-config=prefix=$_TF_STATE_PREFIX
    
  # 步骤 2: 验证代码格式
  - id: terraform-fmt
    name: hashicorp/terraform:1.5
    entrypoint: terraform
    args:
      - fmt
      - -check
      - -recursive
  
  # 步骤 3: 验证语法
  - id: terraform-validate
    name: hashicorp/terraform:1.5
    entrypoint: terraform
    args:
      - validate
  
  # 步骤 4: 生成 Plan
  - id: terraform-plan
    name: hashicorp/terraform:1.5
    entrypoint: terraform
    args:
      - plan
      - -out=tfplan
      - -var-file=terraform.tfvars
  
  # 步骤 5: 将 Plan 保存为构建产物
  - id: save-plan
    name: gcr.io/cloud-builders/gsutil
    args:
      - cp
      - tfplan
      - gs://$_TF_PLAN_BUCKET/plan-$BUILD_ID
  
substitutions:
  _TF_STATE_BUCKET: my-project-tf-state
  _TF_STATE_PREFIX: prod/network
  _TF_PLAN_BUCKET: my-project-tf-plans
  
options:
  logging: CLOUD_LOGGING_ONLY
```

```yaml
# cloudbuild-tf-apply.yaml
# CD：执行 Terraform Apply
steps:
  # 步骤 1: 下载 Plan 文件
  - id: download-plan
    name: gcr.io/cloud-builders/gsutil
    args:
      - cp
      - gs://$_TF_PLAN_BUCKET/plan-$_PLAN_BUILD_ID
      - tfplan
  
  # 步骤 2: 初始化 Terraform
  - id: terraform-init
    name: hashicorp/terraform:1.5
    entrypoint: terraform
    args:
      - init
      - -backend-config=bucket=$_TF_STATE_BUCKET
      - -backend-config=prefix=$_TF_STATE_PREFIX
  
  # 步骤 3: 应用 Plan
  - id: terraform-apply
    name: hashicorp/terraform:1.5
    entrypoint: terraform
    args:
      - apply
      - -auto-approve
      - tfplan
  
substitutions:
  _TF_STATE_BUCKET: my-project-tf-state
  _TF_STATE_PREFIX: prod/network
  _PLAN_BUILD_ID: ""  # 由上游 CI 传递
  
options:
  logging: CLOUD_LOGGING_ONLY
```

### 使用 GitHub Actions

```yaml
# .github/workflows/terraform-ci.yaml
name: Terraform CI

on:
  pull_request:
    paths:
      - 'environments/prod/**'
      - 'modules/**'

jobs:
  terraform-plan:
    runs-on: ubuntu-latest
    
    # 使用 Workload Identity Federation 认证（不需要密钥文件）
    permissions:
      contents: read
      pull-requests: write  # 允许发布 Plan 到 PR 评论
    
    steps:
    - uses: actions/checkout@v4
    
    - id: auth
      name: Authenticate to GCP
      uses: google-github-actions/auth@v2
      with:
        workload_identity_provider: 'projects/123456789/locations/global/workloadIdentityPools/my-pool/providers/my-provider'
        service_account: 'terraform@my-project.iam.gserviceaccount.com'
    
    - name: Setup Terraform
      uses: hashicorp/setup-terraform@v3
      with:
        terraform_version: '1.5.0'
    
    - name: Terraform Init
      run: |
        cd environments/prod
        terraform init
    
    - name: Terraform Format
      run: |
        terraform fmt -check -recursive
    
    - name: Terraform Validate
      run: |
        cd environments/prod
        terraform validate
    
    - name: Terraform Plan
      id: plan
      run: |
        cd environments/prod
        terraform plan -out=tfplan -no-color
      continue-on-error: true
    
    - name: Post Plan to PR
      uses: actions/github-script@v7
      if: github.event_name == 'pull_request'
      with:
        script: |
          const output = `## Terraform Plan Result
          
          | Status | Check |
          |--------|-------|
          | Format | ✅ |
          | Validate | ✅ |
          | Plan | ✅ |
          
          <details>
          <summary>Click to see Plan details</summary>
          
          \`\`\`
          ${process.env.TF_PLAN_OUTPUT}
          \`\`\`
          
          </details>
          
          :warning: Please review the Plan before merging.`;
          
          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: output
          });
```

```yaml
# .github/workflows/terraform-cd.yaml
name: Terraform CD

on:
  push:
    branches:
      - main
    paths:
      - 'environments/prod/**'

jobs:
  terraform-apply:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - id: auth
      name: Authenticate to GCP
      uses: google-github-actions/auth@v2
      with:
        workload_identity_provider: 'projects/123456789/locations/global/workloadIdentityPools/my-pool/providers/my-provider'
        service_account: 'terraform@my-project.iam.gserviceaccount.com'
    
    - name: Setup Terraform
      uses: hashicorp/setup-terraform@v3
    
    - name: Terraform Init
      run: |
        cd environments/prod
        terraform init
    
    - name: Terraform Apply
      run: |
        cd environments/prod
        terraform apply -auto-approve
```

---

## 18.3 Plan 审批机制

### 为什么需要审批？

Plan 审批是一个关键的安全闸门。你需要确保：

1. **看出意外变更**：Plan 输出中是否有意外的资源删除或修改？
2. **评估风险**：变更是否会影响生产环境的稳定性？
3. **责任明确**：谁批准了这次变更？

### Plan 审批流程

```
开发者提交 PR
    │
    ├─ CI 自动生成 Plan
    ├─ Plan 发布到 PR 评论
    ├─ 团队审查 Plan
    │
    ├─ 有风险？→ 修改代码 → 重新生成 Plan
    └─ 无风险？→ 批准 PR → 合并 → CD 自动 Apply
```

### 自动化的 Plan 审查重点

在审查 Plan 输出时，特别关注以下几点：

| 操作 | 风险等级 | 需要特别关注 |
|------|---------|------------|
| 资源创建 (+) | 低 | 确认配置正确 |
| 资源修改 (~) | 中 | 确认修改不会导致服务中断 |
| 资源删除 (-) | 高 | 确认删除是预期的，不影响现有服务 |
| IAM 策略修改 | 高 | 确认权限变更不会导致访问问题 |
| 网络配置修改 | 高 | 确认不会导致网络中断 |

---

## 18.4 多环境部署策略

### 环境晋升（Promotion）模式

基础设施的变更应该从开发环境开始，逐步晋升到生产环境：

```
Dev → Staging → Prod
```

```yaml
# .github/workflows/terraform-promote.yaml
name: Terraform Environment Promotion

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options:
          - dev
          - staging
          - prod

jobs:
  promote:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    
    steps:
    - uses: actions/checkout@v4
    
    - id: auth
      uses: google-github-actions/auth@v2
      with:
        workload_identity_provider: 'projects/123456789/locations/global/workloadIdentityPools/my-pool/providers/my-provider'
        service_account: 'terraform@my-project.iam.gserviceaccount.com'
    
    - name: Terraform Init & Apply
      run: |
        cd environments/${{ github.event.inputs.environment }}
        terraform init
        terraform apply -auto-approve
```

### 环境差异化配置

不同环境使用相同的代码，但通过变量文件区分配置：

```hcl
# environments/prod/terraform.tfvars
environment       = "production"
instance_count    = 5
instance_type     = "e2-standard-4"
min_replicas      = 3
max_replicas      = 20
enable_backup     = true
backup_retention  = 30
```

```hcl
# environments/dev/terraform.tfvars
environment       = "development"
instance_count    = 1
instance_type     = "e2-small"
min_replicas      = 1
max_replicas      = 5
enable_backup     = false
backup_retention  = 7
```

---

## 18.5 基础设施的安全检查

### 在 CI 中集成安全检查

```yaml
# 在 Terraform CI 中集成 Checkov（安全检查工具）
- name: Checkov Security Scan
  uses: bridgecrewio/checkov-action@v12
  with:
    directory: environments/prod
    framework: terraform
    skip_check: CKV_GCP_1  # 可选：跳过某些检查
```

**Checkov 可以检测的安全问题：**

| 检查项 | 检测内容 | 级别 |
|--------|---------|------|
| CKV_GCP_1 | 是否启用了 VPC 流日志 | 高 |
| CKV_GCP_2 | 是否启用了 GKE 的私有集群 | 高 |
| CKV_GCP_6 | Cloud SQL 是否启用了备份 | 中 |
| CKV_GCP_12 | 存储桶是否设置了公共访问 | 高 |
| CKV_GCP_29 | 是否启用了 VPC Service Controls | 中 |

### 在 Apply 前进行人工确认

对于高风险的操作（如删除资源、修改网络配置），可以增加人工确认步骤：

```yaml
# 高风险变更需要人工确认
- name: Manual Approval for Production
  if: github.event.inputs.environment == 'prod'
  run: |
    echo "⚠️ 这是生产环境变更！"
    echo "请确认 Plan 输出中的变更都是预期的。"
    echo "如果你确认无误，请重新运行此 workflow 并输入 'CONFIRM'"
```

---

## 18.6 一个场景：完整的 CI/CD 工作流

### 场景

开发团队需要修改生产环境的防火墙规则——允许一个新的 IP 段访问 API 服务。

### 步骤

**第一步：创建 PR**

开发者创建 PR，修改 `environments/prod/firewall.tf`：

```hcl
# 添加新的 IP 白名单
resource "google_compute_firewall" "allow_new_partner" {
  name    = "allow-new-partner-ip"
  network = module.vpc.vpc_id
  
  allow {
    protocol = "tcp"
    ports    = ["443"]
  }
  
  source_ranges = ["203.0.113.0/24"]  # 新的合作伙伴 IP
  target_tags   = ["api-server"]
}
```

**第二步：CI 自动运行**

PR 提交后，GitHub Actions 自动运行：

```
1. ✅ Terraform Init 成功
2. ✅ Terraform Format 通过
3. ✅ Terraform Validate 通过
4. ✅ Checkov 安全检查通过
5. 📋 Terraform Plan 生成并发布到 PR 评论
```

**Plan 输出：**

```
Terraform will perform the following actions:

  # google_compute_firewall.allow_new_partner will be created
  + resource "google_compute_firewall" "allow_new_partner" {
      + name          = "allow-new-partner-ip"
      + source_ranges = ["203.0.113.0/24"]
      + target_tags   = ["api-server"]
      + allow {
          + ports    = ["443"]
          + protocol = "tcp"
        }
    }

Plan: 1 to add, 0 to change, 0 to delete.
```

**第三步：团队审查**

团队审查 Plan 输出：
- ✅ 新增了一条防火墙规则（`+` 操作）
- ✅ 只开放了 443 端口（安全）
- ✅ 只允许特定的 IP 段（最小权限）
- ✅ 没有删除或修改现有资源（低风险）

**第四步：PR 合并**

审查通过后，PR 被合并到 `main` 分支。

**第五步：CD 自动 Apply**

PR 合并触发 CD 流水线，自动执行 `terraform apply`。

**第六步：验证**

开发者验证新的防火墙规则已生效：

```bash
gcloud compute firewall-rules describe allow-new-partner-ip
```

---

## 18.7 反模式：CI/CD 中的常见错误

### 反模式一：跳过 Plan 审查

**表现**：开发者直接运行 `terraform apply`，跳过了 Plan 生成和审查步骤。

**后果**：未经审查的变更可能导致意外的资源删除或配置错误。

**正确的做法**：所有变更通过 PR 流程，CI 自动生成 Plan，团队审查后再 Apply。

### 反模式二：在 Apply 后才发现问题

**表现**：Plan 输出没有仔细审查就合并了 PR，Apply 完成后才发现误删了资源。

**后果**：已经造成的损失无法挽回。

**正确的做法**：仔细审查 Plan 输出，特别关注删除操作（`-`）和修改操作（`~`）。

### 反模式三：不同环境使用不同的代码

**表现**：开发环境和生产环境的 Terraform 代码不同步——开发环境改了某处配置，但生产环境没有。

**后果**：环境差异导致"在我机器上可以运行"的问题。

**正确的做法**：所有环境使用同一套代码，通过变量文件区分配置。

### 反模式四：CI/CD 没有通知

**表现**：CI/CD 流水线运行失败时，没有人得到通知。

**后果**：基础设施变更没有生效，但团队不知道。

**正确的做法**：配置失败通知，发送到团队的即时消息频道。

---

## 18.8 速查总结

### CI/CD 流水线步骤速查

| 步骤 | 工具 | 检查内容 | 失败处理 |
|------|------|---------|---------|
| 格式检查 | `terraform fmt` | 代码格式 | PR 标记为检查失败 |
| 语法验证 | `terraform validate` | 语法和配置 | PR 标记为检查失败 |
| 安全检查 | Checkov/tfsec | 安全最佳实践 | PR 标记为检查失败 |
| Plan 生成 | `terraform plan` | 变更预览 | PR 标记为检查失败 |
| Plan 审查 | 人工审查 | 变更合理性 | 要求修改代码 |
| Apply | `terraform apply` | 执行变更 | 通知团队回滚 |

### 推荐的工具链

| 工具 | 用途 | 说明 |
|------|------|------|
| Terraform | IaC 工具 | 声明式基础设施管理 |
| Cloud Build / GitHub Actions | CI/CD 引擎 | 自动化流水线 |
| Checkov / tfsec | 安全检查 | 检测安全风险 |
| Terragrunt | Terraform 增强 | 管理多环境配置 |
| Atlantis | Terraform PR 自动化 | 自动 Plan/Apply 在 PR 中 |

### 每周 CI/CD 检查清单

- [ ] 所有 Terraform CI 流水线是否正常运行？
- [ ] 最近的 Plan 输出是否有意外变更？
- [ ] 安全检查工具是否有新的告警？
- [ ] 状态文件是否安全存储在远程后端？
- [ ] CI/CD 的认证凭据是否需要轮换？

---

> **下一章预告：** CI/CD 流水线自动化了基础设施的部署，但日常运维中还有很多需要自动化的工作。第 19 章将介绍如何使用 GCP API 和 Python SDK 编写自动化脚本——从清理僵尸资源到轮换服务账号密钥，让你真正摆脱琐事。