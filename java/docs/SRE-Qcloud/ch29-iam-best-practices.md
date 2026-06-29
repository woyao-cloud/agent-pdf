# 第29章 CAM 最佳实践

## 29.1 概述

腾讯云访问管理（Cloud Access Management，CAM）是腾讯云提供的统一身份认证与授权管理服务。CAM 的核心能力包括：管理用户、用户组和角色的创建与生命周期；通过策略语法精确控制用户对云资源的访问权限；支持服务角色实现云服务之间的授权互信；以及通过跨账号访问实现多账号体系下的资源协作。

对于 SRE 团队而言，CAM 是云上安全的第一道防线。权限配置不当可能导致数据泄露、资源误操作、甚至整个账号被攻陷。本章从实战角度出发，系统性地阐述 CAM 的核心概念、策略语法、最小权限原则、密钥管理、STS 临时密钥以及跨账号访问等最佳实践，并辅以 Terraform 代码示例，帮助读者在生产环境中构建安全、可审计、可运维的权限体系。

## 29.2 CAM 用户、用户组与角色

### 29.2.1 CAM 用户

CAM 用户代表一个具有身份凭证的实体，可以是开发人员、运维工程师或第三方服务商。每个 CAM 用户拥有独立的登录密码和访问密钥（SecretId/SecretKey），用于登录腾讯云控制台或调用云 API。

**创建 CAM 用户的最佳实践：**

- **按人建户，禁止共享账号。** 每个工程师必须使用独立的 CAM 用户，严禁多人共享同一组密钥。共享账号会导致无法追溯具体操作人，在出现安全事件时无法定位责任人。
- **启用控制台登录与编程访问分离。** 对于仅需调用 API 的自动化程序，只开启编程访问，不开启控制台登录，减少攻击面。
- **绑定手机号和邮箱。** 确保每个 CAM 用户都绑定了有效的手机号和邮箱，以便接收操作通知和进行密码重置。
- **设置密码策略。** 在 CAM 控制台的"账号设置"中，配置密码复杂度要求（至少 8 位，包含大写、小写、数字和特殊字符）和定期更换周期（建议 90 天）。

### 29.2.2 CAM 用户组

用户组是 CAM 用户的逻辑集合。将权限附加到用户组而非单个用户，可以大幅降低权限管理的复杂度。

**用户组设计模式：**

```
┌─────────────────────────────────────────────┐
│                  账号 root                   │
│  ├── 用户组: SRE-Admins                     │
│  │   ├── 策略: AdministratorAccess          │
│  │   └── 成员: alice, bob                   │
│  ├── 用户组: SRE-Readonly                   │
│  │   ├── 策略: ReadOnlyAccess               │
│  │   └── 成员: charlie, dave                │
│  ├── 用户组: SRE-DevOps                     │
│  │   ├── 策略: custom-cvm-ops               │
│  │   ├── 策略: custom-cls-ops               │
│  │   └── 成员: eve, frank                   │
│  └── 用户组: SRE-DBAs                       │
│      ├── 策略: custom-mysql-ops              │
│      └── 成员: grace, heidi                 │
└─────────────────────────────────────────────┘
```

**最佳实践：**

- **按职责而非人头建组。** 用户组对应的是"角色"而非"个人"。当人员流动时，只需将用户移入或移出组，无需修改策略。
- **组粒度适中。** 组太少会导致权限过于宽泛，组太多则管理成本过高。建议按运维职能划分：基础设施运维组、数据库运维组、网络运维组、安全审计组等。
- **嵌套用户组。** CAM 支持用户组嵌套，可以将公共权限放在父组，专用权限放在子组，减少策略重复。

### 29.2.3 CAM 角色

角色与用户最大的区别在于：角色没有长期密钥，而是通过"扮演"（AssumeRole）的方式获取临时凭证。角色可以被 CAM 用户、腾讯云服务或另一个腾讯云账号"信任"并扮演。

**角色的三种主要用途：**

1. **服务角色：** 授权腾讯云服务（如 CVM、SCF）代表你执行操作。例如，SCF 函数需要访问 COS 存储桶，就需要一个服务角色。
2. **跨账号角色：** 允许其他腾讯云账号下的用户访问本账号的资源，实现多账号架构下的统一授权。
3. **联合身份角色：** 允许外部身份提供商（如企业 IdP）的用户通过 SAML 2.0 或 OIDC 协议登录腾讯云。

**角色使用的最佳实践：**

- **优先使用角色而非长期密钥。** 对于服务器端应用程序、云函数、容器等场景，始终使用角色获取临时密钥，避免在代码或配置文件中硬编码 SecretKey。
- **为角色配置信任策略。** 信任策略（Trust Policy）决定了谁可以扮演该角色。务必限定信任范围，避免将角色开放给整个账号或所有服务。
- **使用角色进行跨账号访问。** 跨账号协作时，不要在目标账号中创建外部用户的 CAM 用户，而是创建角色并配置信任策略。

## 29.3 策略语法与最小权限原则

### 29.3.1 CAM 策略语法

CAM 策略使用 JSON 格式描述，核心结构如下：

```json
{
    "version": "2.0",
    "statement": [
        {
            "effect": "allow",
            "action": [
                "cvm:DescribeInstances",
                "cvm:StartInstances",
                "cvm:StopInstances"
            ],
            "resource": [
                "qcs::cvm:ap-guangzhou:uin/100000000001:instance/ins-xxxxxxxx"
            ],
            "condition": {
                "ip_equal": {
                    "qcs:source_ip": ["10.0.0.0/8"]
                }
            }
        }
    ]
}
```

**各字段说明：**

| 字段 | 说明 | 必填 |
|------|------|------|
| `version` | 策略版本，固定为 `2.0` | 是 |
| `statement` | 策略语句列表，每个语句是一个独立的授权单元 | 是 |
| `effect` | `allow` 或 `deny`，显式拒绝优先于显式允许 | 是 |
| `action` | 操作列表，支持通配符 `*` | 是 |
| `resource` | 资源列表，使用 QCS（Quality Cloud Service）资源描述符 | 是 |
| `condition` | 条件约束，限定生效上下文（IP 范围、MFA 状态、时间等） | 否 |

**QCS 资源描述符格式：**

```
qcs::<service>:<region>:<account>:<resource_type>/<resource_id>
```

例如：
- `qcs::cvm:ap-guangzhou:uin/100000000001:instance/*` — 广州地域的所有 CVM 实例
- `qcs::cos:ap-guangzhou:uin/100000000001:bucket/example-bucket-1250000000/*` — 指定 COS 存储桶的所有对象

### 29.3.2 最小权限原则

最小权限原则（Principle of Least Privilege，PoLP）是 CAM 权限管理的核心指导思想。其含义是：只授予完成工作所必需的最小权限集合，不多给任何冗余权限。

**实施最小权限的步骤：**

1. **从只读权限开始。** 对于新加入的工程师，先授予只读权限，观察其实际工作需求后再逐步开放。
2. **拒绝通配符滥用。** 避免直接使用 `action: ["*"]` 或 `resource: ["*"]`。即使使用，也要通过 `condition` 加以约束。
3. **细化资源粒度。** 将资源限定到具体实例、存储桶或 VPC，而非整个地域或整个产品。
4. **定期审计。** 使用 CAM 的"权限审计"功能，识别并回收冗余权限。

**常见反模式与改进方案：**

| 反模式 | 问题 | 改进方案 |
|--------|------|----------|
| `action: ["*"]` | 授予所有操作权限 | 列出具体操作，如 `cvm:Describe*` |
| `resource: ["*"]` | 授予所有资源权限 | 限定到具体资源 ID 或使用 `condition` 约束 |
| 使用预设策略 `AdministratorAccess` | 权限过大 | 创建自定义策略，仅包含所需操作 |
| 长期密钥直接嵌入代码 | 密钥泄露风险 | 使用 STS 临时密钥或实例角色 |

### 29.3.3 条件键的使用

条件键（Condition Key）是精细化权限控制的重要工具。常用的条件键包括：

```json
{
    "version": "2.0",
    "statement": [
        {
            "effect": "allow",
            "action": ["cvm:RunInstances"],
            "resource": ["*"],
            "condition": {
                "string_equal": {
                    "cvm:instance_type": ["S5.LARGE8", "S5.2XLARGE16"]
                },
                "ip_equal": {
                    "qcs:source_ip": ["10.0.0.0/8", "192.168.0.0/16"]
                },
                "bool_equal": {
                    "mfa_required": ["1"]
                }
            }
        }
    ]
}
```

**常用条件键分类：**

- **网络条件：** `qcs:source_ip`（来源 IP）、`qcs:source_vpc`（来源 VPC）
- **MFA 条件：** `mfa_required`（是否要求多因素认证）
- **时间条件：** `qcs:current_time`（当前时间）、`qcs:request_time`（请求时间）
- **资源标签条件：** `qcs:resource_tag`（资源标签键值对）
- **VPC 条件：** `vpc:subnet`、`vpc:vpc`（限定子网或 VPC）

**标签鉴权实践：**

基于标签的权限控制是实现大规模权限管理的关键手段。通过为资源打上标签，然后基于标签编写策略，可以实现"一次编写，到处生效"。

```json
{
    "version": "2.0",
    "statement": [
        {
            "effect": "allow",
            "action": ["cvm:*"],
            "resource": ["*"],
            "condition": {
                "for_any_value:string_equal": {
                    "qcs:resource_tag": ["env:production"]
                }
            }
        }
    ]
}
```

上述策略允许用户操作所有带有 `env:production` 标签的 CVM 资源。当新资源加入时，只要打上对应标签，权限自动生效。

## 29.4 服务角色与跨账号访问

### 29.4.1 服务角色

服务角色是授权腾讯云服务代表你执行操作的 CAM 角色。当云服务（如云函数 SCF、容器服务 TKE、弹性 MapReduce EMR）需要访问其他云资源时，必须通过服务角色获取临时权限。

**创建服务角色的流程：**

1. 在 CAM 控制台创建角色，选择"腾讯云服务"作为信任实体。
2. 选择需要授权的服务（如 `scf.qcloud.com`）。
3. 为角色附加策略，定义该服务可以执行的操作。
4. 在服务配置中指定该角色。

**Terraform 创建服务角色示例：**

```hcl
# 创建 SCF 服务角色
resource "tencentcloud_cam_role" "scf_exec_role" {
  name        = "SCF-Execution-Role"
  document    = jsonencode({
    version = "2.0"
    statement = [
      {
        effect  = "allow"
        action  = ["sts:AssumeRole"]
        principal = {
          service = ["scf.qcloud.com"]
        }
      }
    ]
  })
  description = "SCF function execution role"
}

# 为服务角色附加策略
resource "tencentcloud_cam_role_policy_attachment" "scf_cos_access" {
  role_name   = tencentcloud_cam_role.scf_exec_role.name
  policy_name = "QcloudCOSReadOnlyAccess"
}

resource "tencentcloud_cam_role_policy_attachment" "scf_cls_access" {
  role_name   = tencentcloud_cam_role.scf_exec_role.name
  policy_name = "QcloudCLSFullAccess"
}
```

**服务角色最佳实践：**

- **一个服务一个角色。** 不同的服务应使用不同的服务角色，避免权限扩散。例如，SCF 函数和 TKE 工作负载不应共享同一个角色。
- **最小化附加策略。** 只附加服务实际需要的策略。例如，如果 SCF 函数只需要读取 COS 文件，就使用 `QcloudCOSReadOnlyAccess` 而非 `QcloudCOSFullAccess`。
- **定期审查服务角色。** 检查哪些服务在扮演哪些角色，回收不再使用的服务角色。

### 29.4.2 跨账号访问

在多账号架构中，不同账号之间的资源协作是常见需求。例如，安全审计账号需要读取所有业务账号的审计日志，DevOps 账号需要部署资源到多个业务账号。

**跨账号访问的实现方式：**

1. **账号 A（目标账号）** 创建一个角色，并在信任策略中指定账号 B 为信任实体。
2. **账号 B（发起账号）** 的用户通过调用 `sts:AssumeRole` 获取账号 A 中角色的临时密钥。
3. 使用临时密钥访问账号 A 的资源。

**Terraform 跨账号角色示例：**

```hcl
# 在目标账号中创建跨账号角色
resource "tencentcloud_cam_role" "cross_account_reader" {
  name        = "CrossAccount-ReadOnly"
  document    = jsonencode({
    version = "2.0"
    statement = [
      {
        effect  = "allow"
        action  = ["sts:AssumeRole"]
        principal = {
          qcs = ["qcs::cam::uin/200000000002:root"]
        }
      }
    ]
  })
  description = "Cross-account read-only access for DevOps account"
}

# 附加只读策略
resource "tencentcloud_cam_role_policy_attachment" "readonly" {
  role_name   = tencentcloud_cam_role.cross_account_reader.name
  policy_name = "ReadOnlyAccess"
}

# 限定只能读取特定地域的资源
resource "tencentcloud_cam_role_policy_attachment" "region_limit" {
  role_name   = tencentcloud_cam_role.cross_account_reader.name
  policy_name = tencentcloud_cam_policy.region_restrict.name
}

resource "tencentcloud_cam_policy" "region_restrict" {
  name       = "RegionRestrict-ApGuangzhou"
  document   = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = ["*"]
        resource = ["*"]
        condition = {
          string_equal = {
            "qcs:region" = ["ap-guangzhou"]
          }
        }
      }
    ]
  })
}
```

**跨账号访问最佳实践：**

- **使用角色而非用户。** 永远不要在目标账号中为外部人员创建 CAM 用户。使用跨账号角色，外部人员通过扮演角色获取临时权限。
- **限定信任账号。** 在信任策略中明确指定信任的账号 UIN，不要使用通配符。
- **限定外部用户。** 如果可能，在信任策略中进一步限定可以扮演角色的外部用户或用户组。
- **使用外部 ID。** 对于第三方服务商，使用外部 ID（External ID）防止 confused deputy 问题。

```json
{
    "version": "2.0",
    "statement": [
        {
            "effect": "allow",
            "action": ["sts:AssumeRole"],
            "principal": {
                "qcs": ["qcs::cam::uin/200000000002:root"]
            },
            "condition": {
                "string_equal": {
                    "sts:external_id": ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]
                }
            }
        }
    ]
}
```

## 29.5 访问密钥轮换与 STS 临时密钥

### 29.5.1 访问密钥管理

访问密钥（SecretId/SecretKey）是 CAM 用户调用云 API 的凭证。密钥泄露是云上安全事件的头号原因。

**密钥管理最佳实践：**

- **定期轮换密钥。** 建议每 90 天轮换一次访问密钥。CAM 支持为每个用户创建两个密钥，利用双密钥实现无中断轮换。
- **双密钥轮换流程：**

```
1. 创建新密钥（Key2），此时 Key1 和 Key2 同时有效
2. 将所有应用程序的密钥配置更新为 Key2
3. 验证所有系统正常运行
4. 禁用 Key1
5. 观察一段时间（建议 1-3 天），确认无告警
6. 删除 Key1
```

- **禁用未使用的密钥。** 定期审查所有 CAM 用户的密钥状态，禁用超过 90 天未使用的密钥。
- **监控密钥使用。** 通过云审计（CloudAudit）监控密钥的调用记录，设置异常告警。例如，某个密钥在非常用地域或非常用时间段出现调用，应立即告警。
- **禁止根账号密钥。** 根账号的访问密钥拥有最高权限，应禁止创建和使用。日常操作应通过 CAM 用户或角色进行。

**Terraform 密钥管理示例：**

```hcl
# 创建 CAM 用户
resource "tencentcloud_cam_user" "sre_user" {
  name                = "sre-alice"
  console_login       = true
  need_reset_password = true
  password            = var.initial_password
}

# 创建访问密钥
resource "tencentcloud_cam_access_key" "sre_user_key" {
  target_uin = tencentcloud_cam_user.sre_user.uin
}

# 输出密钥（仅首次 apply 时可见）
output "secret_id" {
  value     = tencentcloud_cam_access_key.sre_user_key.secret_id
  sensitive = true
}

output "secret_key" {
  value     = tencentcloud_cam_access_key.sre_user_key.secret_key
  sensitive = true
}
```

### 29.5.2 STS 临时密钥

安全令牌服务（Security Token Service，STS）提供临时、有限权限的访问凭证。临时密钥的有效期最短 15 分钟，最长 36 小时。

**STS 的核心优势：**

- **无长期密钥泄露风险。** 临时密钥过期后自动失效，即使被截获也无法长期使用。
- **精细权限控制。** 每次调用 STS 时可以指定临时策略，进一步缩小权限范围。
- **支持角色扮演。** 通过 `AssumeRole` 获取角色的临时密钥，实现权限提升的受控操作。

**STS 使用场景：**

1. **应用程序临时凭证。** 后端服务通过 STS 获取临时密钥，下发给前端或移动端应用。
2. **运维自动化。** CI/CD 流水线在执行部署任务时，通过 STS 获取临时密钥，任务完成后密钥自动失效。
3. **跨账号操作。** 通过 `AssumeRole` 获取目标账号的临时密钥，执行跨账号操作。

**STS API 调用示例（Python）：**

```python
from tencentcloud.common import credential
from tencentcloud.sts.v20180813 import sts_client, models

# 使用长期密钥获取 STS 客户端
cred = credential.Credential("AKIDxxxxx", "SecretKeyxxxxx")
client = sts_client.StsClient(cred, "ap-guangzhou")

# 请求临时密钥
req = models.AssumeRoleRequest()
req.RoleArn = "qcs::cam::uin/100000000001:roleName/Deploy-Role"
req.RoleSessionName = "ci-cd-pipeline-20240601"
req.DurationSeconds = 1800  # 30 分钟

resp = client.AssumeRole(req)
print(f"SecretId: {resp.Credentials.SecretId}")
print(f"SecretKey: {resp.Credentials.SecretKey}")
print(f"Token: {resp.Credentials.Token}")
print(f"Expiration: {resp.Expiration}")
```

**STS 临时策略示例：**

在调用 `AssumeRole` 时，可以通过 `Policy` 参数传入临时策略，进一步缩小权限范围。临时策略的最终权限 = 角色基础策略 ∩ 临时策略。

```python
req.Policy = json.dumps({
    "version": "2.0",
    "statement": [
        {
            "effect": "allow",
            "action": [
                "cos:GetObject",
                "cos:PutObject"
            ],
            "resource": [
                "qcs::cos:ap-guangzhou:uid/100000000001:prefix//example-bucket-1250000000/deploy-artifacts/*"
            ]
        }
    ]
})
```

### 29.5.3 自动化密钥轮换方案

对于无法避免使用长期密钥的场景（如第三方系统集成），应实现自动化的密钥轮换机制。

**基于云函数的密钥轮换方案：**

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  定时触发器   │────▶│  SCF 轮换函数  │────▶│  创建新密钥   │
│  (每 85 天)  │     │              │     │             │
└─────────────┘     └──────┬───────┘     └──────┬──────┘
                           │                    │
                           ▼                    ▼
                    ┌──────────────┐     ┌─────────────┐
                    │  通知运维团队  │     │  更新密钥存储  │
                    │  (企业微信/钉钉)│     │  (Secrets Manager)│
                    └──────────────┘     └─────────────┘
```

**轮换函数核心逻辑：**

```python
def rotate_access_key(user_uin):
    # 1. 创建新密钥
    new_key = cam_client.create_access_key(user_uin)
    
    # 2. 将新密钥写入凭据管理系统
    secrets_manager.put_secret(
        secret_name=f"cam-key-{user_uin}",
        secret_value=json.dumps({
            "secret_id": new_key.secret_id,
            "secret_key": new_key.secret_key
        })
    )
    
    # 3. 通知应用程序重新加载密钥
    notify_apps_to_reload()
    
    # 4. 等待确认后禁用旧密钥
    wait_for_confirmation(timeout=86400)  # 等待 24 小时
    cam_client.disable_access_key(user_uin, old_key_id)
    
    # 5. 最终删除旧密钥
    wait_for_confirmation(timeout=432000)  # 再等待 5 天
    cam_client.delete_access_key(user_uin, old_key_id)
```

## 29.6 Terraform CAM 策略示例

本节提供一系列生产可用的 Terraform CAM 配置示例，覆盖常见的运维场景。

### 29.6.1 基础权限体系

```hcl
# ============================================
# 基础 CAM 权限体系
# ============================================

# 创建运维用户组
resource "tencentcloud_cam_group" "sre_admin" {
  name   = "SRE-Admins"
  remark = "SRE 管理员组 - 拥有除 IAM 外的完全管理权限"
}

resource "tencentcloud_cam_group" "sre_readonly" {
  name   = "SRE-ReadOnly"
  remark = "SRE 只读组 - 仅可查看资源"
}

resource "tencentcloud_cam_group" "sre_devops" {
  name   = "SRE-DevOps"
  remark = "SRE 运维组 - 可管理 CVM、CLB、Auto Scaling"
}

# 创建自定义策略：SRE 管理员（排除 IAM 操作）
resource "tencentcloud_cam_policy" "sre_admin_policy" {
  name     = "SRE-Admin-Policy"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = ["*"]
        resource = ["*"]
      },
      {
        effect = "deny"
        action = [
          "cam:*",
          "sts:*"
        ]
        resource = ["*"]
      }
    ]
  })
}

# 创建自定义策略：DevOps 运维策略
resource "tencentcloud_cam_policy" "devops_policy" {
  name     = "SRE-DevOps-Policy"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = [
          "cvm:DescribeInstances",
          "cvm:RunInstances",
          "cvm:StartInstances",
          "cvm:StopInstances",
          "cvm:RebootInstances",
          "cvm:TerminateInstances",
          "cvm:ModifyInstanceAttribute",
          "cvm:ResetInstance",
          "cvm:DescribeImages",
          "cvm:DescribeSecurityGroups",
          "clb:DescribeLoadBalancers",
          "clb:RegisterTargets",
          "clb:DeregisterTargets",
          "as:DescribeAutoScalingGroups",
          "as:CreateAutoScalingGroup",
          "as:UpdateAutoScalingGroup",
          "as:DeleteAutoScalingGroup",
          "as:DescribeLaunchConfigurations",
          "as:CreateLaunchConfiguration",
          "monitor:Describe*",
          "vpc:Describe*"
        ]
        resource = ["*"]
        condition = {
          string_equal = {
            "qcs:region" = ["ap-guangzhou", "ap-singapore"]
          }
        }
      }
    ]
  })
}

# 附加策略到用户组
resource "tencentcloud_cam_group_policy_attachment" "admin_policy" {
  group_id   = tencentcloud_cam_group.sre_admin.id
  policy_name = tencentcloud_cam_policy.sre_admin_policy.name
}

resource "tencentcloud_cam_group_policy_attachment" "readonly_policy" {
  group_id   = tencentcloud_cam_group.sre_readonly.id
  policy_name = "ReadOnlyAccess"
}

resource "tencentcloud_cam_group_policy_attachment" "devops_policy" {
  group_id   = tencentcloud_cam_group.sre_devops.id
  policy_name = tencentcloud_cam_policy.devops_policy.name
}

# 创建用户并加入组
resource "tencentcloud_cam_user" "alice" {
  name          = "sre-alice"
  console_login = true
  remark        = "Alice - SRE 管理员"
}

resource "tencentcloud_cam_group_membership" "alice_group" {
  group_id = tencentcloud_cam_group.sre_admin.id
  user_names = [tencentcloud_cam_user.alice.name]
}

resource "tencentcloud_cam_user" "bob" {
  name          = "sre-bob"
  console_login = true
  remark        = "Bob - SRE 运维工程师"
}

resource "tencentcloud_cam_group_membership" "bob_group" {
  group_id = tencentcloud_cam_group.sre_devops.id
  user_names = [tencentcloud_cam_user.bob.name]
}
```

### 29.6.2 基于标签的精细化权限

```hcl
# ============================================
# 基于标签的权限控制
# ============================================

# 创建标签策略：允许管理带有特定标签的 CVM
resource "tencentcloud_cam_policy" "tag_based_cvm" {
  name     = "TagBased-CVM-Manager"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = ["cvm:*"]
        resource = ["*"]
        condition = {
          for_any_value:string_equal = {
            "qcs:resource_tag" = ["project:online-booking", "env:production"]
          }
        }
      },
      {
        effect = "allow"
        action = [
          "cvm:DescribeInstances",
          "cvm:DescribeImages",
          "cvm:DescribeSecurityGroups"
        ]
        resource = ["*"]
      }
    ]
  })
}

# 创建标签策略：禁止删除带有特定标签的资源
resource "tencentcloud_cam_policy" "tag_protection" {
  name     = "TagProtection-NoDelete"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "deny"
        action = [
          "cvm:TerminateInstances",
          "cvm:DeleteSecurityGroup",
          "cos:DeleteObject",
          "cos:DeleteBucket"
        ]
        resource = ["*"]
        condition = {
          for_any_value:string_equal = {
            "qcs:resource_tag" = ["protected:true"]
          }
        }
      }
    ]
  })
}
```

### 29.6.3 跨账号访问配置

```hcl
# ============================================
# 跨账号访问配置
# ============================================

# 在目标账号（生产账号）中创建跨账号角色
resource "tencentcloud_cam_role" "prod_readonly" {
  name        = "Prod-ReadOnly-Access"
  description = "允许审计账号只读访问生产环境资源"
  document    = jsonencode({
    version = "2.0"
    statement = [
      {
        effect  = "allow"
        action  = ["sts:AssumeRole"]
        principal = {
          qcs = ["qcs::cam::uin/200000000002:root"]
        }
        condition = {
          string_equal = {
            "sts:external_id" = ["audit-2024-prod"]
          }
        }
      }
    ]
  })
}

resource "tencentcloud_cam_role_policy_attachment" "prod_readonly_attach" {
  role_name   = tencentcloud_cam_role.prod_readonly.name
  policy_name = "ReadOnlyAccess"
}

# 在发起账号（审计账号）中创建可以扮演角色的用户组
resource "tencentcloud_cam_group" "auditors" {
  name   = "Auditors"
  remark = "审计人员 - 可扮演跨账号只读角色"
}

# 创建自定义策略：允许扮演生产账号的只读角色
resource "tencentcloud_cam_policy" "assume_prod_role" {
  name     = "Assume-Prod-ReadOnly"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = ["sts:AssumeRole"]
        resource = [
          "qcs::cam::uin/100000000001:roleName/Prod-ReadOnly-Access"
        ]
      }
    ]
  })
}

resource "tencentcloud_cam_group_policy_attachment" "auditor_assume" {
  group_id    = tencentcloud_cam_group.auditors.id
  policy_name = tencentcloud_cam_policy.assume_prod_role.name
}
```

### 29.6.4 服务角色与 STS 策略

```hcl
# ============================================
# 服务角色与 STS 策略
# ============================================

# TKE 集群的服务角色
resource "tencentcloud_cam_role" "tke_cluster_role" {
  name        = "TKE-Cluster-ServiceRole"
  description = "TKE 集群管理服务角色"
  document    = jsonencode({
    version = "2.0"
    statement = [
      {
        effect  = "allow"
        action  = ["sts:AssumeRole"]
        principal = {
          service = ["tke.qcloud.com"]
        }
      }
    ]
  })
}

resource "tencentcloud_cam_role_policy_attachment" "tke_cbs" {
  role_name   = tencentcloud_cam_role.tke_cluster_role.name
  policy_name = "QcloudCBSFullAccess"
}

resource "tencentcloud_cam_role_policy_attachment" "tke_clb" {
  role_name   = tencentcloud_cam_role.tke_cluster_role.name
  policy_name = "QcloudCLBFullAccess"
}

resource "tencentcloud_cam_role_policy_attachment" "tke_vpc" {
  role_name   = tencentcloud_cam_role.tke_cluster_role.name
  policy_name = "QcloudVPCFullAccess"
}

# 为 TKE 工作负载创建专用服务角色
resource "tencentcloud_cam_role" "tke_workload_role" {
  name        = "TKE-Workload-ServiceRole"
  description = "TKE 工作负载服务角色 - 用于 Pod 获取云资源访问权限"
  document    = jsonencode({
    version = "2.0"
    statement = [
      {
        effect  = "allow"
        action  = ["sts:AssumeRole"]
        principal = {
          service = ["tke.qcloud.com"]
        }
      }
    ]
  })
}

# 工作负载角色只授予必要的权限
resource "tencentcloud_cam_policy" "tke_workload_policy" {
  name     = "TKE-Workload-Policy"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = [
          "cos:GetObject",
          "cos:PutObject",
          "cos:ListBucket"
        ]
        resource = [
          "qcs::cos:ap-guangzhou:uid/100000000001:bucket/workload-data-1250000000/*"
        ]
      },
      {
        effect = "allow"
        action = [
          "cls:DescribeLogsets",
          "cls:CreateLogset",
          "cls:PutLog"
        ]
        resource = ["*"]
      }
    ]
  })
}

resource "tencentcloud_cam_role_policy_attachment" "tke_workload_attach" {
  role_name   = tencentcloud_cam_role.tke_workload_role.name
  policy_name = tencentcloud_cam_policy.tke_workload_policy.name
}
```

### 29.6.5 安全审计策略

```hcl
# ============================================
# 安全审计策略
# ============================================

# 审计人员专用策略：可查看所有资源的配置和审计日志
resource "tencentcloud_cam_policy" "security_audit" {
  name     = "Security-Audit-Policy"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = [
          "cam:Describe*",
          "cam:Get*",
          "cam:List*",
          "cloudaudit:Describe*",
          "cloudaudit:LookupEvents",
          "cloudaudit:GetEventHistory",
          "monitor:Describe*",
          "monitor:Get*",
          "cls:Describe*",
          "cls:SearchLog",
          "cos:GetBucketLogging",
          "vpc:DescribeFlowLogs",
          "vpc:DescribeFlowLog"
        ]
        resource = ["*"]
      },
      {
        effect = "deny"
        action = [
          "cam:Create*",
          "cam:Update*",
          "cam:Delete*",
          "cam:Attach*",
          "cam:Detach*"
        ]
        resource = ["*"]
      }
    ]
  })
}

# 创建审计用户组
resource "tencentcloud_cam_group" "security_auditors" {
  name   = "Security-Auditors"
  remark = "安全审计组 - 只读审计权限，不可修改任何配置"
}

resource "tencentcloud_cam_group_policy_attachment" "audit_policy" {
  group_id    = tencentcloud_cam_group.security_auditors.id
  policy_name = tencentcloud_cam_policy.security_audit.name
}
```

### 29.6.6 完整的 CAM 初始化模块

以下是一个完整的 Terraform 模块，用于初始化新账号的 CAM 权限体系：

```hcl
# ============================================
# modules/cam-foundation/main.tf
# 新账号 CAM 基础初始化模块
# ============================================

variable "env_name" {
  description = "环境名称 (production/staging/development)"
  type        = string
}

variable "admin_users" {
  description = "管理员用户列表"
  type = list(object({
    name     = string
    email    = string
    phone    = string
  }))
}

variable "devops_users" {
  description = "运维用户列表"
  type = list(object({
    name     = string
    email    = string
    phone    = string
  }))
}

variable "allowed_admin_ips" {
  description = "允许管理操作的来源 IP 列表"
  type        = list(string)
  default     = ["10.0.0.0/8", "172.16.0.0/12"]
}

# 创建基础用户组
resource "tencentcloud_cam_group" "admin" {
  name   = "${var.env_name}-Admins"
  remark = "${var.env_name} 环境管理员组"
}

resource "tencentcloud_cam_group" "devops" {
  name   = "${var.env_name}-DevOps"
  remark = "${var.env_name} 环境运维组"
}

resource "tencentcloud_cam_group" "readonly" {
  name   = "${var.env_name}-ReadOnly"
  remark = "${var.env_name} 环境只读组"
}

# 管理员策略：排除 IAM 和计费操作
resource "tencentcloud_cam_policy" "admin" {
  name     = "${var.env_name}-Admin-Policy"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = ["*"]
        resource = ["*"]
        condition = {
          ip_equal = {
            "qcs:source_ip" = var.allowed_admin_ips
          }
          bool_equal = {
            "mfa_required" = ["1"]
          }
        }
      },
      {
        effect = "deny"
        action = [
          "cam:Create*",
          "cam:UpdateRole*",
          "cam:DeleteRole*",
          "cam:Attach*",
          "cam:Detach*"
        ]
        resource = ["*"]
      }
    ]
  })
}

# 运维策略：限定地域和操作
resource "tencentcloud_cam_policy" "devops" {
  name     = "${var.env_name}-DevOps-Policy"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = [
          "cvm:Describe*",
          "cvm:RunInstances",
          "cvm:StartInstances",
          "cvm:StopInstances",
          "cvm:RebootInstances",
          "cvm:ModifyInstanceAttribute",
          "cvm:ResetInstance",
          "cvm:AssociateSecurityGroups",
          "cvm:DisassociateSecurityGroups",
          "cvm:ModifyInstanceDiskType",
          "cvm:ResizeInstanceDisk",
          "cvm:InquiryPrice*",
          "clb:Describe*",
          "clb:RegisterTargets",
          "clb:DeregisterTargets",
          "clb:ModifyTargetWeight",
          "clb:CreateListener",
          "clb:DeleteListener",
          "monitor:Describe*",
          "monitor:Get*",
          "vpc:Describe*",
          "vpc:CreateSecurityGroup",
          "vpc:DeleteSecurityGroup",
          "vpc:ModifySecurityGroup*",
          "vpc:CreateSecurityGroupPolicy",
          "vpc:DeleteSecurityGroupPolicy",
          "vpc:ModifySecurityGroupPolicies",
          "as:Describe*",
          "as:CreateAutoScalingGroup",
          "as:UpdateAutoScalingGroup",
          "as:DeleteAutoScalingGroup",
          "as:CreateLaunchConfiguration",
          "as:DeleteLaunchConfiguration",
          "cos:GetObject",
          "cos:PutObject",
          "cos:List*",
          "cos:Head*",
          "cos:GetBucket*",
          "cos:InitiateMultipartUpload",
          "cos:UploadPart",
          "cos:CompleteMultipartUpload",
          "cos:AbortMultipartUpload"
        ]
        resource = ["*"]
        condition = {
          ip_equal = {
            "qcs:source_ip" = var.allowed_admin_ips
          }
          bool_equal = {
            "mfa_required" = ["1"]
          }
        }
      }
    ]
  })
}

# 附加策略到组
resource "tencentcloud_cam_group_policy_attachment" "admin_attach" {
  group_id    = tencentcloud_cam_group.admin.id
  policy_name = tencentcloud_cam_policy.admin.name
}

resource "tencentcloud_cam_group_policy_attachment" "devops_attach" {
  group_id    = tencentcloud_cam_group.devops.id
  policy_name = tencentcloud_cam_policy.devops.name
}

resource "tencentcloud_cam_group_policy_attachment" "readonly_attach" {
  group_id    = tencentcloud_cam_group.readonly.id
  policy_name = "ReadOnlyAccess"
}

# 创建用户并加入组
resource "tencentcloud_cam_user" "admin_users" {
  for_each = { for u in var.admin_users : u.name => u }

  name          = "${var.env_name}-${each.value.name}"
  console_login = true
  remark        = "${each.value.name} - ${var.env_name} 管理员"
}

resource "tencentcloud_cam_group_membership" "admin_members" {
  group_id   = tencentcloud_cam_group.admin.id
  user_names = [for u in tencentcloud_cam_user.admin_users : u.name]
}

resource "tencentcloud_cam_user" "devops_users" {
  for_each = { for u in var.devops_users : u.name => u }

  name          = "${var.env_name}-${each.value.name}"
  console_login = true
  remark        = "${each.value.name} - ${var.env_name} 运维工程师"
}

resource "tencentcloud_cam_group_membership" "devops_members" {
  group_id   = tencentcloud_cam_group.devops.id
  user_names = [for u in tencentcloud_cam_user.devops_users : u.name]
}

# 输出
output "admin_group_id" {
  value = tencentcloud_cam_group.admin.id
}

output "devops_group_id" {
  value = tencentcloud_cam_group.devops.id
}
```

### 29.6.7 使用 Terraform 管理 CAM 策略的注意事项

使用 Terraform 管理 CAM 策略时，需要注意以下几点：

1. **状态文件安全。** Terraform 状态文件（terraform.tfstate）中可能包含敏感信息（如 SecretId/SecretKey），必须加密存储。建议使用腾讯云 COS 作为远程状态后端，并启用服务端加密。
2. **避免配置漂移。** CAM 控制台的手动修改会导致 Terraform 状态与实际配置不一致。建议通过 Terraform 进行所有 CAM 变更，或在 CI/CD 流水线中定期执行 `terraform plan` 检测漂移。
3. **策略版本管理。** CAM 策略支持多版本，Terraform 默认创建新版本而非修改已有版本。在更新策略时，需要管理旧版本的清理。
4. **依赖顺序。** 创建用户组 → 创建策略 → 附加策略 → 创建用户 → 将用户加入组。Terraform 的隐式依赖通常能正确处理，但复杂场景下可能需要显式使用 `depends_on`。
5. **批量操作限频。** CAM API 存在调用频率限制（默认 20 QPS），在批量创建用户或附加策略时，需要控制并发数或使用 `time_sleep` 资源添加延迟。

## 29.7 CAM 监控与审计

### 29.7.1 云审计日志

云审计（CloudAudit）记录所有 CAM 相关的 API 调用，是权限审计和故障排查的基础数据源。

**需要重点监控的 CAM 事件：**

| 事件类型 | 事件名称 | 风险等级 |
|----------|----------|----------|
| 用户管理 | `CreateUser`、`DeleteUser` | 中 |
| 策略变更 | `CreatePolicy`、`UpdatePolicy`、`DeletePolicy` | 高 |
| 策略附加 | `AttachUserPolicy`、`DetachUserPolicy` | 高 |
| 密钥操作 | `CreateAccessKey`、`DeleteAccessKey`、`UpdateAccessKey` | 高 |
| 角色操作 | `CreateRole`、`UpdateRole`、`DeleteRole` | 高 |
| 角色扮演 | `AssumeRole` | 中 |
| 登录事件 | `ConsoleLogin` | 低 |
| 根账号操作 | 所有根账号操作 | 严重 |

**使用 CLS 设置 CAM 事件告警：**

```hcl
# 创建日志集和日志主题
resource "tencentcloud_cls_logset" "cloudaudit" {
  logset_name = "cloudaudit-logs"
}

resource "tencentcloud_cls_topic" "cam_events" {
  topic_name  = "cam-events"
  logset_id   = tencentcloud_cls_logset.cloudaudit.id
  auto_split  = true
  max_split_partitions = 20
}

# 创建告警规则：检测高危 CAM 操作
resource "tencentcloud_cls_alarm" "cam_high_risk" {
  name        = "CAM-HighRisk-Operations"
  monitor_time {
    time = 5
    type = "Period"
  }
  condition   = "HighRiskCount > 0"
  alarm_level = 1  # 严重
  alarm_notice {
    receivers = ["sre-team@company.com"]
    notice_type = ["Email", "Sms"]
  }
  trigger_count = 1
  alarm_period  = 5
  analysis_config {
    query      = "eventName:(CreatePolicy OR UpdatePolicy OR DeletePolicy OR CreateAccessKey OR DeleteAccessKey OR CreateRole OR DeleteRole)"
    start_time = "-5m"
    finish_time = "now"
    time_key_type = 1
  }
}
```

### 29.7.2 权限分析工具

腾讯云 CAM 控制台提供"权限分析"功能，可以自动扫描账号内的权限配置并给出优化建议。建议每季度执行一次全量扫描，重点关注以下指标：

- **权限覆盖率：** 每个用户/角色实际使用的操作与已授权操作的比率。覆盖率低于 30% 的用户应考虑回收冗余权限。
- **未使用密钥：** 超过 90 天未调用的访问密钥，应自动禁用并通知所有者。
- **闲置用户：** 超过 180 天未登录控制台的用户，应确认是否需要保留。
- **策略复杂度：** 包含超过 20 条语句的策略，应拆分为多个专注的策略。

### 29.7.3 自动化合规检查

将 CAM 合规检查集成到 CI/CD 流水线中，实现"基础设施即代码"的权限治理：

```yaml
# .github/workflows/cam-compliance.yml
name: CAM Compliance Check
on:
  schedule:
    - cron: '0 8 * * 1'  # 每周一早上 8 点
  workflow_dispatch:

jobs:
  cam-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.8.0
      
      - name: Terraform Plan
        run: terraform plan -out=tfplan
        env:
          TENCENTCLOUD_SECRET_ID: ${{ secrets.TENCENTCLOUD_SECRET_ID }}
          TENCENTCLOUD_SECRET_KEY: ${{ secrets.TENCENTCLOUD_SECRET_KEY }}
      
      - name: Check for CAM Drift
        run: |
          # 检查是否有未通过 Terraform 管理的 CAM 变更
          terraform show -json tfplan | jq -r '
            .resource_changes[]? 
            | select(.type | startswith("tencentcloud_cam_"))
            | "\(.type): \(.change.actions[0])"
          ' > cam_changes.txt
          
          if [ -s cam_changes.txt ]; then
            echo "⚠️ CAM 配置漂移检测到以下变更："
            cat cam_changes.txt
            exit 1
          else
            echo "✅ CAM 配置与代码一致，无漂移"
          fi
      
      - name: Check Overly Permissive Policies
        run: |
          # 检查 Terraform 配置中是否包含通配符策略
          grep -rn '"action":\s*\["\*"\]' terraform/ || true
          echo "检查完成"
```

## 29.8 综合最佳实践清单

### 29.7.1 权限架构设计

1. **采用多账号架构。** 生产环境、测试环境、开发环境使用独立的腾讯云账号，通过跨账号角色实现权限隔离。即使某个账号被攻陷，也不会影响其他环境。
2. **使用标签组织资源。** 建立统一的标签规范（如 `env`、`project`、`owner`、`cost-center`），基于标签编写策略，实现权限的自动化管理。
3. **分层授权。** 权限管理遵循"组织层级 → 账号层级 → 用户组层级 → 用户层级"的递进关系，避免在多个层级重复授权。

### 29.7.2 日常运维

1. **启用操作保护。** 对于高危操作（如删除资源、修改网络配置、修改 IAM 策略），开启 MFA 验证或操作保护审批。
2. **使用操作审批。** 对于生产环境的关键操作，通过 CAM 的操作审批功能，要求至少两名管理员审批后才能执行。
3. **定期权限审计。** 每季度执行一次权限审计，使用 CAM 的"权限分析"功能识别以下问题：
   - 超过 90 天未使用的用户和密钥
   - 权限过大的策略（包含 `action: ["*"]` 或 `resource: ["*"]`）
   - 未绑定任何策略的用户和角色
   - 长期未登录的控制台用户

### 29.7.3 安全加固

1. **禁用根账号。** 创建根账号后立即设置复杂的密码并妥善保管，日常操作使用 CAM 用户。为根账号启用 MFA，并将根账号密钥删除或禁用。
2. **全面启用 MFA。** 所有 CAM 用户必须启用 MFA 登录。对于拥有写权限的用户，在策略中强制要求 MFA：
   ```json
   {
       "condition": {
           "bool_equal": {
               "mfa_required": ["1"]
           }
       }
   }
   ```
3. **最小化永久密钥。** 尽可能使用 STS 临时密钥替代永久密钥。对于必须使用永久密钥的场景，实施自动化轮换。
4. **网络边界控制。** 在策略中使用 `qcs:source_ip` 条件键，限制只有公司出口 IP 或堡垒机 IP 才能执行管理操作。
5. **配置云审计。** 开启 CloudAudit 服务，记录所有 CAM 相关操作（创建用户、修改策略、扮演角色等），并设置告警。

### 29.7.4 故障排查指南

**常见问题与解决方案：**

| 问题 | 可能原因 | 排查方法 |
|------|----------|----------|
| 调用 API 返回 `AuthFailure` | 密钥错误或已禁用 | 检查 SecretId/SecretKey 是否正确，确认密钥状态为"启用" |
| 返回 `UnauthorizedOperation` | 缺少对应操作的权限 | 使用 CAM 的"模拟策略"功能测试当前策略是否包含所需操作 |
| 返回 `OperationDenied` | 条件键不满足 | 检查策略中的 `condition` 条件，确认来源 IP、MFA 状态等是否满足要求 |
| 跨账号扮演角色失败 | 信任策略配置错误 | 确认角色信任策略中的 `principal.qcs` 是否正确，外部 ID 是否匹配 |
| 临时密钥过期 | DurationSeconds 设置过长 | 临时密钥最长 36 小时，需要设计密钥刷新机制 |

**策略模拟测试：**

```bash
# 使用 camcli 工具模拟策略
camcli simulate-principal-policy \
  --policy-id "policy-xxxxxxxx" \
  --action "cvm:RunInstances" \
  --resource "qcs::cvm:ap-guangzhou:uin/100000000001:instance/*" \
  --source-ip "10.0.0.100"
```

## 29.8 总结

CAM 是腾讯云安全体系的基石。本章从 CAM 用户、用户组和角色的基本概念出发，深入讲解了策略语法和最小权限原则的实施方法，详细介绍了服务角色和跨账号访问的配置要点，系统阐述了访问密钥管理和 STS 临时密钥的最佳实践，并提供了大量生产可用的 Terraform 代码示例。

核心要点可以归纳为三条原则：

1. **最小权限。** 永远只授予完成工作所需的最小权限集合，使用条件键和标签进一步缩小权限范围。
2. **临时凭证优先。** 尽可能使用 STS 临时密钥和角色扮演，减少长期密钥的使用。必须使用长期密钥时，实施自动化轮换。
3. **可审计。** 所有权限变更和操作行为都应有日志记录，定期审计权限配置，及时发现和修复安全隐患。

在云原生时代，权限管理不再是"一次性配置"的工作，而是需要持续关注、持续优化的动态过程。SRE 团队应将 CAM 权限管理纳入日常运维流程，建立权限申请、审批、授予、审计的完整闭环，才能构建安全可靠的云上基础设施。
