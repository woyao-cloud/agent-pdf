# 第18章 CI/CD 基础设施管道：腾讯云上的自动化运维

## 18.1 引言

基础设施即代码（Infrastructure as Code, IaC）的核心理念是将云资源的声明式配置纳入版本控制，并通过自动化管道持续交付。当 IaC 与 CI/CD 深度整合后，基础设施的变更将享有与应用代码同等的审查、测试和部署保障。本章聚焦于腾讯云环境下的 CI/CD 基础设施管道设计，涵盖 Terraform 的自动化 Plan/Apply 流程、审批工作流、CODING DevOps 集成以及完整的 YAML 管道配置实践。

## 18.2 CI/CD for IaC 的设计原则

### 18.2.1 不可变基础设施与管道

传统运维中，工程师通过 SSH 登录服务器执行命令来修复问题，这种做法被称为"可变基础设施"——服务器状态随时间累积漂移，最终难以复现。不可变基础设施（Immutable Infrastructure）要求每次变更都通过管道重新构建资源，而非原地修改。CI/CD 管道天然支持这一模式：

- **构建阶段**：解析 Terraform/HCL 配置，生成执行计划
- **测试阶段**：在隔离环境中验证计划，检查语法和策略合规
- **部署阶段**：将经过审批的计划应用到生产环境

### 18.2.2 管道即真理（Pipeline as the Source of Truth）

在 SRE 实践中，管道应成为基础设施变更的唯一入口。这意味着：

1. **禁止人工操作**：任何人不得通过控制台或 CLI 直接修改生产资源
2. **全量审计**：每一次 Apply 都对应一次 Commit，变更历史即审计日志
3. **回滚即重放**：回滚操作等价于重新执行上一个稳定版本的管道

### 18.2.3 环境分层与管道映射

典型的多环境架构在管道中体现为阶段（Stage）的串联：

| 环境 | 用途 | 触发方式 | 审批要求 |
|------|------|----------|----------|
| dev | 开发自测 | 分支推送自动触发 | 无 |
| staging | 集成验证 | PR 合并触发 | 团队 Lead 审批 |
| prod | 生产发布 | Tag 触发 | SRE 负责人 + 变更经理审批 |

每个环境对应一个独立的 Terraform Workspace 或 State 文件，管道通过参数化配置在不同环境间切换。

## 18.3 Terraform Plan/Apply 自动化

### 18.3.1 远程状态管理与锁机制

Terraform 的状态文件（`.tfstate`）记录了当前云资源的映射关系。在团队协作中，状态文件必须存储在远程后端，并支持并发锁。腾讯云上推荐使用 **CODING 制品库** 或 **对象存储 COS** 作为后端：

```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "sre-terraform-state-1234567890"
    key            = "prod/network/terraform.tfstate"
    region         = "ap-guangzhou"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
```

> **注意**：Terraform 的 `s3` 后端兼容腾讯云 COS（需配置 AWS 签名兼容模式）。更推荐使用 CODING 的 `terraform-backend` 插件，它原生支持腾讯云认证。

### 18.3.2 Plan 阶段的自动化检查

在 CI 管道中，`terraform plan` 的输出不应仅作为预览，还应通过自动化规则进行门禁检查。常见的检查项包括：

**1. 资源变更范围检查**

```bash
#!/bin/bash
# scripts/check-plan-scope.sh

plan_output=$(terraform plan -no-color -out=tfplan.binary 2>&1)

# 检查是否涉及生产关键资源
if echo "$plan_output" | grep -q "module.vpc\|resource.vpc"; then
  echo "WARNING: 本次变更涉及 VPC 核心网络资源"
  echo "需要 SRE 网络组审批"
  exit 1  # 阻断管道，等待人工审批
fi

# 检查是否涉及销毁操作
if echo "$plan_output" | grep -q "will be destroyed"; then
  echo "ERROR: 变更包含资源销毁操作，请确认后再提交"
  exit 1
fi

echo "Plan 范围检查通过"
exit 0
```

**2. Sentinel / OPA 策略即代码**

使用 HashiCorp Sentinel 或 Open Policy Agent (OPA) 执行策略检查：

```rego
# policy/terraform/deny_public_rds.rego
package terraform

deny[msg] {
  resource := input.resources[_]
  resource.type == "tencentcloud_db_instance"
  resource.values.security_groups[_] == "sg-allow-all"
  msg = sprintf("RDS 实例 %v 使用了全开安全组，禁止部署", [resource.name])
}
```

在管道中集成 OPA：

```yaml
# .coding-ci.yml 片段
- stage: policy_check
  steps:
    - step: opa_eval
      script: |
        terraform show -json tfplan.binary > plan.json
        opa eval --data policy/terraform --input plan.json "data.terraform.deny"
```

### 18.3.3 Apply 阶段的幂等性与重试

`terraform apply` 应设计为幂等操作。管道中建议采用以下策略：

1. **先 Plan 后 Apply**：Plan 和 Apply 分离为两个独立 Stage
2. **Apply 超时与重试**：设置合理的超时时间（通常 30 分钟），超时后自动重试一次
3. **状态回滚**：如果 Apply 失败且状态文件已更新，自动执行 `terraform destroy` 或回滚到上一个版本

```bash
#!/bin/bash
# scripts/safe-apply.sh

set -e

MAX_RETRIES=2
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if terraform apply -auto-approve tfplan.binary; then
    echo "Apply 成功"
    exit 0
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Apply 失败（第 ${RETRY_COUNT} 次），等待 30 秒后重试..."
    sleep 30
  fi
done

echo "Apply 重试耗尽，触发回滚流程"
# 调用回滚脚本
bash scripts/rollback.sh
exit 1
```

## 18.4 审批工作流设计

### 18.4.1 基于 CODING 的审批机制

CODING DevOps 提供了内置的人工审批插件，支持在管道中插入审批节点。审批工作流的设计应遵循以下原则：

- **最小权限原则**：审批人只审批其职责范围内的变更
- **四眼原则**：至少两人审批才能执行生产变更
- **时效性**：审批超时后自动拒绝，避免过期变更被执行

### 18.4.2 审批流程示例

一个典型的生产环境 Terraform Apply 审批流程如下：

```
[PR 提交] → [自动 Plan] → [Plan 结果评论到 PR] → [代码 Review] → [Merge]
    ↓
[Tag 触发] → [Plan 再次执行] → [人工审批节点] → [Apply] → [通知]
```

CODING 管道中的审批节点配置：

```yaml
# .coding-ci.yml 审批节点
stages:
  - name: 审批阶段
    approvals:
      - type: MANUAL
        min_approve: 2
        timeout: 3600
        approve_members:
          - user: sre-lead
          - user: change-manager
        notify:
          - type: WECHAT
            template: "生产环境 Terraform 变更审批：${CI_PROJECT_NAME} #${CI_BUILD_NUMBER}"
```

### 18.4.3 变更管理集成

对于重大基础设施变更，应集成企业变更管理（Change Management）流程。CODING 支持通过 Webhook 与外部系统对接：

```python
# scripts/notify-change-system.py
import os
import requests
import json

def notify_change_management(plan_summary, environment):
    webhook_url = os.environ.get("CHANGE_MGMT_WEBHOOK")
    payload = {
        "title": f"基础设施变更申请 - {environment}",
        "description": plan_summary,
        "applicant": os.environ.get("CI_COMMITTER_NAME"),
        "commit": os.environ.get("CI_COMMIT"),
        "project": os.environ.get("CI_PROJECT_NAME"),
        "risk_level": "high" if environment == "prod" else "medium",
    }
    resp = requests.post(webhook_url, json=payload, timeout=10)
    resp.raise_for_status()
    print(f"变更通知已发送，ID: {resp.json().get('change_id')}")
```

## 18.5 腾讯云 CODING DevOps 集成

### 18.5.1 CODING CI 概述

CODING DevOps 是腾讯云推出的一站式研发效能平台，其 CI 模块支持基于 YAML 的管道定义。与 Terraform 的集成点包括：

1. **凭据管理**：通过 CODING 的"环境变量"功能安全存储腾讯云 SecretId/SecretKey
2. **制品库**：存储 Terraform 二进制文件和 Provider 插件
3. **触发规则**：支持分支推送、PR、Tag、定时等多种触发方式
4. **分布式缓存**：加速 Terraform Provider 下载

### 18.5.2 完整管道配置示例

以下是一个生产级别的 CODING CI YAML 配置，实现了完整的 Terraform CI/CD 管道：

```yaml
# .coding-ci.yml
master:
  push:
    - stage: 代码检查
      steps:
        - step: terraform_fmt
          name: Terraform 格式检查
          script: |
            terraform fmt -check -recursive
            echo "所有文件格式正确"
          artifacts:
            - name: fmt_report
              path: ./fmt_output.txt

        - step: tflint
          name: Terraform Lint
          script: |
            tflint --init
            tflint --format=checkstyle > tflint_report.xml
          artifacts:
            - name: tflint_report
              path: ./tflint_report.xml

    - stage: 计划生成
      steps:
        - step: terraform_init
          name: 初始化后端
          script: |
            terraform init \
              -backend-config="bucket=${TF_STATE_BUCKET}" \
              -backend-config="key=${CI_COMMIT_REF_NAME}/terraform.tfstate" \
              -backend-config="region=ap-guangzhou"
            echo "后端初始化完成"

        - step: terraform_plan
          name: 生成执行计划
          script: |
            terraform workspace select ${CI_COMMIT_REF_NAME} || \
              terraform workspace new ${CI_COMMIT_REF_NAME}
            terraform plan \
              -var-file="environments/${CI_COMMIT_REF_NAME}.tfvars" \
              -no-color \
              -out=tfplan.binary
            terraform show -no-color tfplan.binary > plan.txt
            echo "计划已生成，请查看 plan.txt"
          artifacts:
            - name: terraform_plan
              path: ./plan.txt

        - step: plan_comment
          name: 评论 Plan 结果到 PR
          script: |
            plan_content=$(cat plan.txt)
            coding pr comment \
              --content "## Terraform Plan 结果\n\`\`\`\n${plan_content}\n\`\`\`"
            echo "Plan 结果已评论到 PR #${CI_PULL_REQUEST_NUMBER}"

    - stage: 策略检查
      steps:
        - step: opa_check
          name: OPA 策略合规检查
          script: |
            terraform show -json tfplan.binary > plan.json
            violations=$(opa eval \
              --data policy/terraform \
              --input plan.json \
              --format json \
              "data.terraform.deny")
            if [ "$violations" != "[]" ]; then
              echo "策略违规：$violations"
              exit 1
            fi
            echo "策略检查通过"

    - stage: 审批
      approvals:
        - type: MANUAL
          min_approve: 2
          timeout: 7200
          approve_members:
            - user: sre-lead
            - user: infra-manager
          notify:
            - type: WECHAT
              template: "Terraform 变更待审批：${CI_PROJECT_NAME} ${CI_COMMIT_REF_NAME}"

    - stage: 部署
      steps:
        - step: terraform_apply
          name: 执行基础设施变更
          script: |
            bash scripts/safe-apply.sh
          when: approved

        - step: smoke_test
          name: 冒烟测试
          script: |
            terraform output -json > outputs.json
            bash scripts/smoke-test.sh
          when: approved

        - step: notification
          name: 部署通知
          script: |
            bash scripts/notify-deploy.sh
          when: always
```

### 18.5.3 多项目复用：Terraform Module 管道

当组织内维护多个 Terraform Module 时，可以设计通用管道模板，通过参数化实现复用：

```yaml
# template/terraform-module.yml
parameters:
  module_path: ""
  environment: "dev"
  tf_version: "1.6.0"

stages:
  - stage: 模块测试
    steps:
      - step: unit_test
        name: 单元测试
        script: |
          cd ${module_path}
          terraform init
          terraform validate
          terraform test

      - step: integration_test
        name: 集成测试
        script: |
          cd ${module_path}/examples/complete
          terraform init
          terraform plan -var environment=${environment}
```

在具体项目中引用模板：

```yaml
# projects/vpc-module/.coding-ci.yml
include:
  - project: sre/ci-templates
    file: template/terraform-module.yml
    parameters:
      module_path: "modules/vpc"
      environment: "staging"
```

## 18.6 安全与合规

### 18.6.1 凭据管理

Terraform Provider 需要访问腾讯云 API 的凭据。在 CI 管道中，凭据绝不能明文存储。CODING 提供了多层凭据保护：

1. **环境变量加密**：在 CODING 项目设置中创建加密变量
2. **凭据服务**：集成 CODING 凭据管理，支持自动轮转
3. **临时密钥**：通过 STS 服务生成临时密钥，限制权限和有效期

```yaml
# 使用 CODING 加密环境变量
- step: configure_credentials
  script: |
    # TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY 在 CODING UI 中配置为加密变量
    export TENCENTCLOUD_SECRET_ID=${TENCENT_SECRET_ID}
    export TENCENTCLOUD_SECRET_KEY=${TENCENT_SECRET_KEY}
    export TENCENTCLOUD_REGION="ap-guangzhou"

    # 或者使用 STS 临时密钥
    # sts_cred=$(coding sts assume-role --role-arn "role/sre-terraform")
    # export TENCENTCLOUD_SECRET_ID=$(echo $sts_cred | jq -r '.Credentials.TmpSecretId')
    # export TENCENTCLOUD_SECRET_KEY=$(echo $sts_cred | jq -r '.Credentials.TmpSecretKey')
    # export TENCENTCLOUD_TOKEN=$(echo $sts_cred | jq -r '.Credentials.Token')
```

### 18.6.2 敏感数据扫描

在 Plan 输出中可能泄露敏感信息（如数据库密码、证书）。管道中应集成扫描工具：

```bash
#!/bin/bash
# scripts/scan-sensitive-data.sh

plan_file="plan.txt"
violations=0

# 检查密码关键字
patterns=("password" "secret" "token" "private_key" "certificate")
for pattern in "${patterns[@]}"; do
  matches=$(grep -i -n "$pattern" "$plan_file" || true)
  if [ -n "$matches" ]; then
    echo "WARNING: 发现疑似敏感信息: $pattern"
    echo "$matches"
    violations=$((violations + 1))
  fi
done

if [ $violations -gt 0 ]; then
  echo "发现 $violations 处疑似敏感信息，请检查 Plan 输出"
  exit 1
fi

echo "敏感信息扫描通过"
exit 0
```

### 18.6.3 合规审计日志

每次 Terraform Apply 的执行记录应自动归档到审计系统。腾讯云 CloudAudit 可以捕获 API 调用，但管道层面的审计更精细：

```python
# scripts/audit-log.py
import json
import datetime
import os

def generate_audit_record(action, status, plan_summary):
    record = {
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "pipeline": os.environ.get("CI_BUILD_NUMBER"),
        "project": os.environ.get("CI_PROJECT_NAME"),
        "committer": os.environ.get("CI_COMMITTER_NAME"),
        "commit": os.environ.get("CI_COMMIT"),
        "branch": os.environ.get("CI_COMMIT_REF_NAME"),
        "action": action,  # plan / apply / destroy
        "status": status,  # success / failure
        "plan_summary": plan_summary,
        "environment": os.environ.get("CI_COMMIT_REF_NAME"),
    }
    # 写入 CODING 制品库或 COS
    audit_path = f"audit/{record['timestamp']}-{record['action']}.json"
    with open(audit_path, "w") as f:
        json.dump(record, f, indent=2)
    print(f"审计记录已生成: {audit_path}")
    return audit_path
```

## 18.7 高级实践

### 18.7.1 漂移检测与自动修复

云资源可能因控制台操作、灾难恢复或其他外部因素偏离 Terraform 状态。管道应包含定期漂移检测：

```yaml
# .coding-ci.yml 定时任务
定时漂移检测:
  trigger:
    type: SCHEDULE
    schedule: "0 2 * * *"  # 每天凌晨 2 点
  stages:
    - stage: drift_detection
      steps:
        - step: terraform_plan
          name: 漂移检测
          script: |
            terraform init
            terraform plan \
              -var-file="environments/prod.tfvars" \
              -detailed-exitcode \
              -out=tfplan.binary
            exit_code=$?
            if [ $exit_code -eq 2 ]; then
              echo "检测到漂移，生成差异报告"
              terraform show -no-color tfplan.binary > drift_report.txt
              # 发送告警
              coding webhook notify \
                --type wechat \
                --content "基础设施漂移告警：${CI_PROJECT_NAME} 生产环境存在配置漂移"
            elif [ $exit_code -eq 0 ]; then
              echo "状态一致，无漂移"
            else
              echo "Plan 执行失败"
              exit 1
            fi
```

### 18.7.2 金丝雀发布与基础设施

对于负载均衡、安全组等基础设施变更，可以设计金丝雀发布策略：

1. **创建金丝雀资源**：Terraform 创建一份小规模的副本资源（如 10% 的流量）
2. **验证**：运行集成测试，确认金丝雀资源行为正常
3. **逐步切换**：通过 Terraform 调整权重，逐步将流量切到新资源
4. **清理**：确认稳定后，销毁旧资源

```hcl
# canary.tf
resource "tencentcloud_clb_instance" "main" {
  clb_name = "prod-clb"
  network_type = "OPEN"
  vpc_id = var.vpc_id
}

resource "tencentcloud_clb_instance" "canary" {
  count = var.enable_canary ? 1 : 0
  clb_name = "prod-clb-canary"
  network_type = "OPEN"
  vpc_id = var.vpc_id
}

# 通过 DNS 权重控制流量
resource "tencentcloud_private_dns_record" "api" {
  zone_id = var.private_zone_id
  record_type = "A"
  record_name = "api.internal"
  value = tencentcloud_clb_instance.main.vip
  weight = var.canary_weight > 0 ? 100 - var.canary_weight : 100
  ttl = 60
}

resource "tencentcloud_private_dns_record" "api_canary" {
  count = var.enable_canary ? 1 : 0
  zone_id = var.private_zone_id
  record_type = "A"
  record_name = "api.internal"
  value = tencentcloud_clb_instance.canary[0].vip
  weight = var.canary_weight
  ttl = 60
}
```

### 18.7.3 依赖关系编排

复杂基础设施往往存在资源依赖关系（如先创建 VPC 再创建 CVM）。Terraform 通过 `depends_on` 隐式或显式处理依赖，但在管道层面，可以进一步拆分 Stage 以并行执行无依赖的资源组：

```yaml
stages:
  - stage: 基础网络
    steps:
      - step: vpc_subnet
        script: terraform apply -target=module.vpc -auto-approve

  - stage: 安全与存储
    parallel:
      - step: security_group
        script: terraform apply -target=module.security -auto-approve
      - step: cos_bucket
        script: terraform apply -target=module.storage -auto-approve

  - stage: 计算资源
    steps:
      - step: cvm_tke
        script: terraform apply -target=module.compute -auto-approve
```

> **注意**：使用 `-target` 会破坏 Terraform 的声明式完整性，仅建议在大型迁移或首次部署时使用。日常变更应始终执行完整的 `terraform apply`。

## 18.8 故障排查与恢复

### 18.8.1 常见管道失败场景

| 失败场景 | 原因 | 解决方案 |
|----------|------|----------|
| State Lock 冲突 | 并发执行多个管道 | 确保后端支持锁，设置合理的超时 |
| Provider 认证失败 | 凭据过期或权限不足 | 检查 CODING 加密变量，验证 STS 策略 |
| 资源已存在 | 状态文件与真实状态不一致 | 执行 `terraform import` 同步状态 |
| API 限频 | 腾讯云 API 调用超限 | 在 Provider 中设置 `max_retries` 和 `retry_interval` |

### 18.8.2 状态文件恢复

当状态文件损坏或丢失时，恢复流程如下：

```bash
# 从 COS 备份恢复
# 1. 从备份 Bucket 下载最近的状态文件
coding artifacts download \
  --project sre-terraform \
  --artifact terraform-state-backup \
  --version latest \
  --output ./backup.tfstate

# 2. 手动推送状态到后端
terraform state push backup.tfstate

# 3. 验证状态一致性
terraform plan
```

### 18.8.3 回滚策略

基础设施回滚比应用回滚更复杂，因为云资源之间存在依赖关系。推荐以下策略：

1. **版本化 State**：每次 Apply 前备份当前 State 文件
2. **Git Revert**：回滚 Git 提交，重新执行管道
3. **State 回退**：如果 Git Revert 不可行，直接恢复 State 文件到上一个版本

```bash
#!/bin/bash
# scripts/rollback-terraform.sh

ROLLBACK_VERSION=$1  # 回滚到的提交 SHA

echo "=== 开始基础设施回滚 ==="
echo "目标版本: ${ROLLBACK_VERSION}"

# 1. 备份当前状态
terraform state pull > "state-backup-$(date +%Y%m%d%H%M%S).json"

# 2. 切换到目标版本
git checkout ${ROLLBACK_VERSION} -- .

# 3. 重新初始化并 Apply
terraform init
terraform plan -out=rollback.tfplan
echo "请人工确认回滚计划"
terraform apply rollback.tfplan

echo "=== 回滚完成 ==="
```

## 18.9 总结

本章详细阐述了在腾讯云环境下构建 CI/CD 基础设施管道的完整方法论。从 IaC 的设计原则出发，我们探讨了 Terraform Plan/Apply 的自动化实现、基于 CODING DevOps 的审批工作流、安全合规实践以及高级运维场景。

核心要点总结如下：

1. **管道即入口**：所有基础设施变更必须通过 CI/CD 管道执行，杜绝人工直接操作
2. **Plan 即文档**：Terraform Plan 输出是变更的唯一真实来源，应自动评论到 PR 中供审查
3. **审批即门禁**：生产环境变更必须经过至少两人审批，审批节点应嵌入管道而非独立于管道
4. **审计即合规**：每次 Apply 的执行记录应自动归档，满足内部审计和合规要求
5. **漂移即告警**：通过定时管道检测基础设施漂移，确保声明式配置与实际状态一致

随着组织规模的扩大，建议进一步探索以下方向：

- **Terraform Cloud/Enterprise**：提供更完善的状态管理、策略即代码和团队协作能力
- **Crossplane + Kubernetes**：将基础设施声明式管理扩展到 Kubernetes 控制平面
- **GitOps 工作流**：使用 ArgoCD 或 Flux 实现基础设施的 GitOps 模式，进一步简化运维

CI/CD 基础设施管道不是一蹴而就的工程，它需要 SRE 团队、开发团队和安全团队的持续协作。通过本章提供的方法论和实践，读者可以在腾讯云上构建一套可靠、可审计、可回滚的基础设施交付体系，为业务的稳定运行提供坚实保障。

---

## 附录 A：完整管道配置参考

```yaml
# .coding-ci.yml — 完整生产级 Terraform CI/CD 管道
# 适用于腾讯云 CODING DevOps 平台

variables:
  TF_VERSION: "1.6.0"
  TF_PROVIDER_VERSION: "1.81.0"
  TF_STATE_BUCKET: "sre-tf-state-prod"
  TF_STATE_REGION: "ap-guangzhou"

stages:
  - name: 代码质量
    steps:
      - step: setup
        script: |
          wget https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip
          unzip terraform_${TF_VERSION}_linux_amd64.zip
          chmod +x terraform
          mv terraform /usr/local/bin/
          terraform --version

      - step: fmt_check
        script: terraform fmt -check -recursive

      - step: validate
        script: |
          terraform init -backend=false
          terraform validate

  - name: 安全扫描
    steps:
      - step: tfsec
        script: |
          wget https://github.com/aquasecurity/tfsec/releases/latest/download/tfsec-linux-amd64
          chmod +x tfsec-linux-amd64
          ./tfsec-linux-amd64 --format sarif > tfsec.sarif

      - step: checkov
        script: |
          pip install checkov
          checkov -d . --framework terraform --output junitxml > checkov.xml

  - name: 计划与审批
    steps:
      - step: plan
        script: |
          terraform init
          terraform workspace select ${CI_COMMIT_REF_NAME} || \
            terraform workspace new ${CI_COMMIT_REF_NAME}
          terraform plan -var-file="envs/${CI_COMMIT_REF_NAME}.tfvars" -out=plan.binary
          terraform show -no-color plan.binary > plan.txt
          coding artifact upload --path plan.txt --name "plan-${CI_BUILD_NUMBER}.txt"

    approvals:
      - type: MANUAL
        min_approve: 2
        timeout: 3600
        approve_members:
          - user: sre-lead
          - user: infra-manager

  - name: 部署
    steps:
      - step: apply
        script: |
          terraform apply plan.binary
          terraform output -json > outputs.json

      - step: integration_test
        script: |
          python scripts/test_infra.py --outputs outputs.json

      - step: notify
        script: |
          curl -X POST $WEBHOOK_URL \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"部署完成: ${CI_PROJECT_NAME} ${CI_COMMIT_REF_NAME}\"}"
```

## 附录 B：推荐的腾讯云 Terraform Provider 配置

```hcl
# versions.tf
terraform {
  required_version = ">= 1.3.0"
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = "~> 1.81.0"
    }
  }
}

provider "tencentcloud" {
  region = var.region
  # 优先使用环境变量 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY
  # CI 管道中通过 CODING 加密变量注入
}
```

## 附录 C：术语对照表

| 英文 | 中文 | 说明 |
|------|------|------|
| Infrastructure as Code (IaC) | 基础设施即代码 | 通过代码管理云资源 |
| Immutable Infrastructure | 不可变基础设施 | 每次变更重建而非修改 |
| State Drift | 状态漂移 | 实际资源与配置不一致 |
| Plan | 执行计划 | Terraform 生成的变更预览 |
| Apply | 应用执行 | 将计划应用到云环境 |
| Backend | 后端 | 状态文件的远程存储位置 |
| Workspace | 工作区 | 同一配置的多环境隔离 |
| Sentinel / OPA | 策略引擎 | 基础设施合规检查工具 |
| GitOps | Git 运维模式 | 以 Git 仓库为唯一真实来源 |
| Canary Deployment | 金丝雀发布 | 逐步灰度新版本 |
