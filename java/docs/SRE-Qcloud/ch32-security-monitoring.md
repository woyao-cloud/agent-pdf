# 第32章 腾讯云安全监控与合规运营

## 32.1 引言

安全监控是企业上云后的核心命脉。在传统IDC时代，安全团队通过自建IDS/IPS、流量审计、日志分析平台来感知威胁；上云之后，基础设施的边界从物理机房转变为虚拟网络与API，安全监控的维度也随之扩展——不仅要关注网络流量和主机告警，更要关注**配置合规、操作审计、身份与访问管理（IAM）风险、漏洞生命周期**以及**等保合规**等云原生安全议题。

腾讯云提供了一套从底层到应用层的立体安全监控体系，涵盖：

- **云安全中心**（原主机安全）：资产指纹、漏洞扫描、基线检查、入侵检测
- **CloudAudit**（操作审计）：记录所有云API调用，支撑溯源与合规
- **安全运营中心（SOC）**：多源告警聚合、事件调查、自动化编排（SOAR）
- **等保合规服务**：一键评估、整改指引、报告生成

本章将从SRE（站点可靠性工程）的视角出发，系统讲解如何利用腾讯云原生工具构建可运营、可度量、可审计的安全监控体系，并辅以 `tccli` 命令行示例，帮助读者在日常运维中落地安全运营。

## 32.2 安全运营中心（SOC）

### 32.2.1 SOC 概述

腾讯云安全运营中心（Security Operations Center，简称 SOC）是一站式安全事件管理平台，对标业界主流的 SIEM（安全信息与事件管理）+ SOAR（安全编排自动化与响应）能力。它的核心价值在于：

1. **告警降噪**：将云安全中心、CloudAudit、WAF、DDoS 防护等分散产品的告警统一接入，通过关联分析消除重复和误报。
2. **事件调查**：提供攻击链可视化、实体时间线、威胁情报上下文，帮助安全分析师快速定位根因。
3. **自动化响应**：预置剧本（Playbook）实现告警自动处置，例如检测到恶意 IP 登录后自动封禁安全组。
4. **合规仪表盘**：内置等保 2.0、ISO 27001 等合规视角的检查项与评分。

### 32.2.2 数据接入与告警聚合

SOC 的数据源分为三类：

| 数据源类型 | 典型产品 | 接入方式 |
|-----------|---------|---------|
| 安全告警 | 云安全中心、WAF、DDoS 高防、堡垒机 | 自动接入，无需额外配置 |
| 操作日志 | CloudAudit | 自动接入 |
| 自建系统 | 自建 IDS、开源 HIDS | 通过 Syslog 或 API 推送 |

在 SOC 控制台的「日志管理」页面，可以查看各数据源的接入状态和日志量。对于自建系统，SOC 提供标准的 Syslog 接收端点，格式为：

```
<时间戳> <日志级别> <产品类型> <事件ID> <JSON 负载>
```

### 32.2.3 事件调查与攻击链还原

SOC 的事件调查模块是安全运营的核心界面。当一条告警被判定为「真阳性」后，分析师可以：

1. **查看实体时间线**：以受害资产为中心，按时间倒序展示所有相关告警、登录记录、API 调用。
2. **攻击链可视化**：SOC 自动将告警映射到 MITRE ATT&CK 框架的战术阶段（初始访问 → 执行 → 持久化 → 横向移动 → 数据泄露等）。
3. **威胁情报关联**：将告警中的 IP、域名、文件 Hash 与腾讯云威胁情报库交叉匹配，标记已知恶意指标。

### 32.2.4 自动化编排（SOAR）

SOC 内置了数十个预置剧本，覆盖以下高频场景：

- **恶意 IP 自动封禁**：检测到云服务器对外发起暴力破解 → 自动在云防火墙或安全组中封禁该 IP。
- **失陷主机隔离**：检测到挖矿木马 → 自动将主机移入隔离安全组，阻断所有入站流量。
- **敏感操作二次确认**：检测到删除云硬盘、释放公网 IP 等高风险操作 → 通过企业微信/钉钉通知管理员确认。

自定义剧本通过可视化画布编排，支持条件分支、人工审批、API 调用等节点。以下是一个简单的剧本 YAML 示例：

```yaml
playbook:
  name: block_malicious_ip
  trigger:
    type: alert
    condition: alert_name contains "暴力破解"
  steps:
    - action: query_alert_field
      field: src_ip
    - action: call_api
      api: DescribeSecurityGroupPolicies
      params:
        SecurityGroupId: sg-xxxxxx
    - action: call_api
      api: CreateSecurityGroupPolicy
      params:
        Direction: ingress
        Action: drop
        CidrBlock: ${src_ip}
    - action: notify
      channel: wecom
      message: "已自动封禁恶意 IP ${src_ip}"
```

### 32.2.5 SOC 的 SRE 运营建议

- **告警分级**：在 SOC 中设置告警级别（P0-P4），P0 直接触发电话告警，P4 仅记录日志。避免全员被海量低危告警淹没。
- **定期复盘**：每周对 P0/P1 事件进行复盘，更新剧本和告警规则。复盘模板应包含：发现时间、响应时间、根因、改进措施。
- **日志存储周期**：SOC 的日志存储按量计费，建议安全日志保留 180 天（满足等保要求），性能日志保留 30 天。

## 32.3 CloudAudit 操作审计

### 32.3.1 CloudAudit 是什么

CloudAudit 是腾讯云的**操作审计**服务，记录所有用户（含子账号、协作者）通过控制台、API、SDK、CLI 对云资源发起的每一次操作。每条审计日志包含：谁（主账号 ID、子账号、来源 IP）、在什么时间、通过什么方式、对什么资源、执行了什么操作、操作结果如何。

CloudAudit 的核心用途：

1. **安全溯源**：当发生安全事件时，通过审计日志还原攻击者的操作路径。
2. **合规审计**：满足等保 2.0、ISO 27001、PCI DSS 等合规框架对操作日志的要求。
3. **运维排障**：定位"谁误删了资源"、"谁修改了安全组规则"。
4. **行为分析**：通过异常操作检测发现账号泄露或内部违规。

### 32.3.2 审计日志结构

每条 CloudAudit 日志是一个 JSON 对象，核心字段如下：

```json
{
  "apiVersion": "3.0",
  "eventId": "a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "eventName": "DeleteInstances",
  "eventSource": "cvm.tencentcloudapi.com",
  "eventTime": "2025-06-15T08:30:00Z",
  "sourceIpAddress": "203.0.113.10",
  "userIdentity": {
    "principalId": "100000xxxxxx",
    "accountId": "100000xxxxxx",
    "userName": "admin",
    "type": "Root"
  },
  "requestParameters": {
    "InstanceIds": ["ins-xxxxxxxx"],
    "Region": "ap-guangzhou"
  },
  "responseElements": {
    "RequestId": "xxxx-xxxx-xxxx",
    "Status": "success"
  },
  "resources": [
    {
      "resourceType": "instance",
      "resourceName": "ins-xxxxxxxx",
      "resourceRegion": "ap-guangzhou"
    }
  ],
  "errorCode": "",
  "errorMessage": ""
}
```

关键字段说明：

- `eventName`：操作名称，如 `RunInstances`、`DeleteInstances`、`ModifySecurityGroupRules`。
- `userIdentity.type`：身份类型，`Root` 表示主账号，`SubUser` 表示子账号，`AssumedRole` 表示通过角色访问。
- `sourceIpAddress`：来源 IP，可用于判断是否来自非预期地域。
- `requestParameters`：请求参数，记录操作的具体内容。
- `responseElements.Status`：操作结果，`success` 或 `failed`。

### 32.3.3 通过 tccli 查询审计日志

`tccli` 是腾讯云官方命令行工具，通过 `cloudaudit` 模块可以查询审计日志。以下为常用操作。

**前提条件**：已安装 tccli 并配置密钥。

```bash
# 配置密钥
tccli configure --profile default
# 输入 SecretId 和 SecretKey
```

**查询最近的操作日志**：

```bash
tccli cloudaudit DescribeEvents --region ap-guangzhou \
  --StartTime "2025-06-15 00:00:00" \
  --EndTime "2025-06-15 23:59:59" \
  --MaxResults 50
```

**按事件名称过滤（查询所有删除操作）**：

```bash
tccli cloudaudit DescribeEvents --region ap-guangzhou \
  --StartTime "2025-06-01 00:00:00" \
  --EndTime "2025-06-15 23:59:59" \
  --Filters '[{"AttributeName":"EventName","AttributeValue":"Delete"}]'
```

**按用户名过滤**：

```bash
tccli cloudaudit DescribeEvents --region ap-guangzhou \
  --StartTime "2025-06-01 00:00:00" \
  --EndTime "2025-06-15 23:59:59" \
  --Filters '[{"AttributeName":"UserName","AttributeValue":"subuser-xxx"}]'
```

**按来源 IP 过滤**：

```bash
tccli cloudaudit DescribeEvents --region ap-guangzhou \
  --StartTime "2025-06-01 00:00:00" \
  --EndTime "2025-06-15 23:59:59" \
  --Filters '[{"AttributeName":"SourceIpAddress","AttributeValue":"203.0.113.10"}]'
```

**查询失败的操作（用于监控异常）**：

```bash
tccli cloudaudit DescribeEvents --region ap-guangzhou \
  --StartTime "2025-06-01 00:00:00" \
  --EndTime "2025-06-15 23:59:59" \
  --Filters '[{"AttributeName":"EventName","AttributeValue":"Delete"},{"AttributeName":"ResourceType","AttributeValue":"instance"}]' \
  --IsReadOnly No
```

**创建跟踪（将审计日志持续投递到 COS 或 CLS）**：

```bash
tccli cloudaudit CreateAudit --region ap-guangzhou \
  --AuditName "sre-audit-trail" \
  --CosBucket "sre-logs-125xxxxxx" \
  --CosRegion "ap-guangzhou" \
  --LogFilePrefix "cloudaudit" \
  --IsCreateNewBucket false \
  --IsEnable true
```

**查看跟踪列表**：

```bash
tccli cloudaudit DescribeAudits --region ap-guangzhou
```

### 32.3.4 审计日志的投递与存储

CloudAudit 支持将日志投递到以下目标：

| 目标 | 用途 | 建议保留期 |
|------|------|-----------|
| COS（对象存储） | 长期归档、低成本存储 | 1-3 年 |
| CLS（日志服务） | 实时检索、告警、可视化 | 180 天 |
| 自建 Kafka | 对接自建 SIEM | 按需 |

**推荐架构**：同时投递 CLS 和 COS。CLS 用于日常检索和告警（180 天热数据），COS 用于长期归档（冷数据），通过 COS 的生命周期策略自动沉降到归档存储以降低成本。

### 32.3.5 基于审计日志的异常检测

SRE 团队应建立以下基于审计日志的监控规则：

1. **非工作时间敏感操作**：在 22:00-06:00 期间执行删除资源、修改安全组等操作，触发告警。
2. **异地登录/API 调用**：来源 IP 所属地域与账号常用地域不一致。
3. **权限提升操作**：子账号被授予 `QcloudCamFullAccess` 等高风险策略。
4. **批量资源销毁**：单次 API 调用删除 5 台以上 CVM 或 10 个以上安全组规则。
5. **Root 账号活动**：Root 账号应仅用于账号管理，任何资源操作都应告警。

在 CLS 中，可以通过以下 SQL 实现上述检测：

```sql
-- 检测非工作时间删除操作
SELECT
  eventName,
  userIdentity.userName,
  sourceIpAddress,
  COUNT(*) AS opCount
FROM cloudaudit_logs
WHERE
  eventName LIKE '%Delete%'
  AND (hour(parseDateTime(eventTime)) >= 22 OR hour(parseDateTime(eventTime)) <= 6)
GROUP BY eventName, userIdentity.userName, sourceIpAddress
HAVING opCount > 0
```

## 32.4 漏洞扫描与基线检查

### 32.4.1 云安全中心的漏洞管理

腾讯云安全中心（Cloud Workload Protection Platform，CWPP）提供主机层面的漏洞扫描能力，覆盖：

- **系统漏洞**：Linux/Windows 操作系统内核及系统级 CVE。
- **Web 漏洞**：Tomcat、Nginx、Apache、IIS 等中间件漏洞。
- **数据库漏洞**：MySQL、Redis、MongoDB 等数据库服务漏洞。
- **容器镜像漏洞**：镜像仓库中的镜像层漏洞（需配合容器安全服务）。

漏洞扫描支持**按需扫描**和**定时扫描**两种模式。SRE 团队应配置每周一次的自动扫描，并在扫描完成后自动生成报告。

**通过 tccli 触发漏洞扫描**：

```bash
# 创建一键扫描任务
tccli cwp CreateScanTask --region ap-guangzhou \
  --ModuleType "VUL" \
  --ScanType "FULL" \
  --ScanPeriod 7 \
  --ScanRange "ALL" \
  --Timer "02:00:00"
```

**查询漏洞列表**：

```bash
tccli cwp DescribeVulList --region ap-guangzhou \
  --VulCategory "SYSTEM" \
  --Level "CRITICAL" \
  --Limit 50
```

**查询指定主机的漏洞详情**：

```bash
tccli cwp DescribeVulInfo --region ap-guangzhou \
  --VulId "VUL-2025-xxxxx" \
  --Quuid "ins-xxxxxxxx"
```

### 32.4.2 漏洞生命周期管理

一个完整的漏洞管理流程应包含以下阶段：

```
发现 → 评估 → 修复 → 验证 → 关闭
```

1. **发现**：通过云安全中心定时扫描或外部情报（如腾讯云安全情报）发现新漏洞。
2. **评估**：根据 CVSS 评分、资产重要性、漏洞可利用性确定修复优先级。
   - CVSS 9.0+：24 小时内修复
   - CVSS 7.0-8.9：7 天内修复
   - CVSS 4.0-6.9：30 天内修复
   - CVSS < 4.0：下一个维护窗口修复
3. **修复**：安装补丁、升级版本、或通过 WAF/安全组进行虚拟补丁。
4. **验证**：重新扫描确认漏洞已修复。
5. **关闭**：在漏洞管理平台中关闭工单。

### 32.4.3 基线检查

基线检查是安全合规的基础。腾讯云安全中心内置了多种基线模板：

| 基线类型 | 覆盖范围 | 检查项数 |
|---------|---------|---------|
| 等保 2.0 三级 | Linux/Windows 主机 | 200+ |
| CIS Benchmark | Linux/Windows/数据库 | 150+ |
| 腾讯云最佳实践 | 云资源配置 | 80+ |
| 自定义基线 | 用户自定义规则 | 按需 |

**通过 tccli 查询基线检查结果**：

```bash
# 查询基线列表
tccli cwp DescribeBaselineList --region ap-guangzhou \
  --Limit 20

# 查询基线检查详情
tccli cwp DescribeBaselineDetail --region ap-guangzhou \
  --BaselineId 1234

# 查询指定主机的基线通过率
tccli cwp DescribeBaselineHost --region ap-guangzhou \
  --Quuid "ins-xxxxxxxx"
```

**基线检查的常见高风险项**：

1. **弱口令**：检测到 SSH/RDP/MySQL/Redis 使用弱密码。
2. **不必要的服务**：主机开放了 Telnet、FTP 等非必要服务。
3. **安全组规则过松**：安全组存在 `0.0.0.0/0` 入站规则。
4. **日志审计未开启**：操作系统未开启 auditd 或 Windows 安全审计。
5. **补丁缺失**：关键安全补丁未安装。

### 32.4.4 自动化修复策略

对于基线检查中发现的问题，SRE 团队应尽可能通过自动化方式修复：

- **基础设施即代码（IaC）**：将基线配置写入 Terraform 或 Ansible Playbook，新主机上线时自动应用。
- **自定义镜像**：将加固后的操作系统制作为自定义镜像，所有新主机从此镜像启动。
- **运维编排（OPS）**：通过腾讯云运维编排服务（OPS）定时执行修复脚本。

以下是一个 Ansible Playbook 片段，用于自动修复 Linux 基线问题：

```yaml
- name: 等保基线自动修复
  hosts: all
  become: yes
  tasks:
    - name: 关闭 Telnet 服务
      systemd:
        name: telnet.socket
        state: stopped
        enabled: no

    - name: 配置密码策略（有效期 90 天）
      lineinfile:
        path: /etc/login.defs
        regexp: '^PASS_MAX_DAYS'
        line: 'PASS_MAX_DAYS   90'

    - name: 开启 auditd 服务
      systemd:
        name: auditd
        state: started
        enabled: yes

    - name: 配置 SSH 禁止 Root 登录
      lineinfile:
        path: /etc/ssh/sshd_config
        regexp: '^PermitRootLogin'
        line: 'PermitRootLogin no'
      notify: restart sshd

  handlers:
    - name: restart sshd
      systemd:
        name: sshd
        state: restarted
```

## 32.5 等保 2.0 合规

### 32.5.1 等保 2.0 概述

《网络安全等级保护基本要求》（GB/T 22239-2019），俗称等保 2.0，是中国网络安全领域的基础性合规标准。与等保 1.0 相比，等保 2.0 最大的变化是**将云计算、移动互联、物联网、工业控制等新场景纳入保护范围**。

等保 2.0 的安全要求分为**安全通用要求**和**安全扩展要求**。对于云上系统，需要同时满足通用要求和**云计算安全扩展要求**。

等保 2.0 的五个等级中，企业上云最常涉及的是**第二级（指导保护级）**和**第三级（监督保护级）**。三级等保是互联网企业和政务云的主流要求。

### 32.5.2 腾讯云等保合规服务

腾讯云提供**等保合规服务**（MLPS Compliance Service），帮助用户完成从测评准备到整改落地的全流程：

1. **自助评估**：通过等保自查工具，一键评估云上资产与等保要求的差距。
2. **整改指引**：针对未通过项，提供详细的整改方案和操作步骤。
3. **测评辅助**：协助准备测评材料，包括拓扑图、安全管理制度、运维记录等。
4. **持续监控**：通过云安全中心持续监控合规状态，生成合规报告。

**等保三级的关键控制点**：

| 控制点编号 | 控制点名称 | 腾讯云对应服务 |
|-----------|-----------|--------------|
| 安全物理环境 | 物理访问控制、防雷击、温湿度控制 | 腾讯云物理机房（由腾讯云负责） |
| 安全通信网络 | 网络架构、通信加密 | VPC、SSL VPN、KMS |
| 安全区域边界 | 边界防护、访问控制、入侵防范 | 云防火墙、安全组、WAF |
| 安全计算环境 | 身份鉴别、访问控制、入侵防范 | 云安全中心、堡垒机、CAM |
| 安全管理中心 | 系统管理、审计管理、安全管理 | SOC、CloudAudit、云监控 |
| 安全管理制度 | 安全策略、制度、人员管理 | 用户自行制定 |
| 安全运维管理 | 环境管理、资产管理、漏洞管理 | 云安全中心、CMDB |

### 32.5.3 等保合规的 SRE 落地实践

**1. 身份鉴别（三级要求）**

- 启用 CAM 子账号和最小权限原则，禁止使用 Root 账号进行日常运维。
- 开启登录 MFA（多因素认证）。
- 密码策略：长度 ≥ 8 位，包含大小写字母、数字、特殊字符，每 90 天更换。

**2. 访问控制**

- 使用安全组和网络 ACL 实现网络层访问控制。
- 使用 CAM 策略实现 API 级访问控制。
- 定期（每季度）审计 CAM 策略和权限分配。

**3. 安全审计**

- 开启 CloudAudit，日志投递到 CLS 并设置 180 天以上保留期。
- 开启操作系统 auditd（Linux）或安全审计（Windows）。
- 数据库开启 SQL 审计（腾讯云 DBbrain 或自建审计）。

**4. 入侵防范**

- 云安全中心开启实时告警，覆盖恶意软件、暴力破解、反弹 Shell 等场景。
- 云防火墙开启 IPS 模式，拦截常见漏洞利用流量。
- WAF 开启 Web 攻击防护。

**5. 数据完整性**

- 使用 COS 的对象锁定功能，防止审计日志被篡改。
- 对敏感数据启用 KMS 加密。

**6. 剩余信息保护**

- 销毁云硬盘时勾选「随云硬盘一起销毁的数据盘」。
- 使用 `tccli cvm TerminateInstances` 时确保 `ReleasePrepaidDataDisk` 参数为 true。

### 32.5.4 通过 tccli 管理合规相关配置

**查询 CAM 策略列表**：

```bash
tccli cam ListPolicies --region ap-guangzhou \
  --Scope "All" \
  --Limit 50
```

**查询子账号列表**：

```bash
tccli cam ListUsers --region ap-guangzhou
```

**查询子账号是否开启 MFA**：

```bash
tccli cam GetUser --region ap-guangzhou \
  --Name "subuser-xxx" | Select-String "Mfa"
```

**查询安全组规则（检查 0.0.0.0/0 入站）**：

```bash
tccli vpc DescribeSecurityGroupRules --region ap-guangzhou \
  --SecurityGroupId "sg-xxxxxx" \
  --Filters '[{"Name":"direction","Values":["ingress"]}]'
```

**查询云硬盘是否加密**：

```bash
tccli cbs DescribeDisks --region ap-guangzhou \
  --Filters '[{"Name":"disk-id","Values":["disk-xxxxxx"]}]' \
  | Select-String "Encrypt"
```

### 32.5.5 等保测评材料清单

SRE 团队在等保测评前应准备以下材料：

1. **系统定级报告**：明确系统的安全保护等级。
2. **网络拓扑图**：标注安全区域边界、安全设备部署位置。
3. **资产清单**：包含所有云资源（CVM、数据库、存储、网络等）。
4. **安全管理制度**：包含安全策略、操作规程、应急预案等文档。
5. **运维记录**：包含漏洞修复记录、变更记录、事件处置记录。
6. **审计日志**：CloudAudit 日志、操作系统日志、数据库日志的留存证明。
7. **渗透测试报告**：近期的第三方渗透测试报告（三级等保通常要求每半年一次）。

## 32.6 安全监控体系集成

### 32.6.1 统一告警架构

一个成熟的安全监控体系应将多个数据源统一到一个告警管道中。推荐架构如下：

```
数据源层：
  ├── 云安全中心（主机告警）
  ├── CloudAudit（操作日志）
  ├── WAF（Web 攻击）
  ├── 云防火墙（网络入侵）
  ├── CLB 访问日志
  └── 自建 HIDS

   ↓ 统一接入

分析层：
  ├── SOC（安全事件关联分析）
  ├── CLS（日志检索与告警）
  └── 云监控（指标告警）

   ↓ 通知

通知层：
  ├── 企业微信/钉钉/飞书
  ├── 短信/电话（P0 事件）
  └── 自研告警平台（Webhook）
```

### 32.6.2 告警分级与响应 SLA

| 级别 | 定义 | 响应时间 | 修复时间 | 通知方式 |
|------|------|---------|---------|---------|
| P0 | 数据泄露、大规模服务不可用 | 5 分钟 | 2 小时 | 电话 + 短信 + 即时消息 |
| P1 | 主机失陷、敏感操作未授权 | 15 分钟 | 4 小时 | 短信 + 即时消息 |
| P2 | 高危漏洞、基线严重偏离 | 1 小时 | 24 小时 | 即时消息 |
| P3 | 中危漏洞、合规告警 | 24 小时 | 7 天 | 邮件 |
| P4 | 信息提示 | 不响应 | 下一个迭代 | 周报 |

### 32.6.3 安全监控的度量指标

SRE 团队应持续跟踪以下安全指标：

1. **MTTD（平均检测时间）**：从安全事件发生到被检测到的时间。目标：< 15 分钟。
2. **MTTR（平均响应时间）**：从检测到完成处置的时间。目标：P0 < 2 小时。
3. **漏洞修复率**：在 SLA 时间内完成修复的漏洞比例。目标：> 95%。
4. **基线合规率**：通过基线检查的资产比例。目标：> 90%。
5. **审计覆盖率**：开启 CloudAudit 的账号比例。目标：100%。
6. **告警误报率**：被确认为误报的告警比例。目标：< 20%。

## 32.7 实战案例：构建自动化安全运营流水线

### 32.7.1 场景描述

某互联网公司有 200 台 CVM 部署在腾讯云，需要满足等保三级要求。SRE 团队只有 2 人，需要尽可能通过自动化手段降低安全运营人力成本。

### 32.7.2 实施方案

**Step 1：基础安全配置**

```bash
# 1. 开启所有主机的云安全中心专业版
tccli cwp CreateScanTask --region ap-guangzhou \
  --ModuleType "VUL" \
  --ScanType "FULL" \
  --ScanPeriod 7 \
  --ScanRange "ALL" \
  --Timer "02:00:00"

# 2. 创建 CloudAudit 跟踪，投递到 CLS
tccli cloudaudit CreateAudit --region ap-guangzhou \
  --AuditName "prod-audit" \
  --CosBucket "prod-logs-125xxxxxx" \
  --CosRegion "ap-guangzhou" \
  --LogFilePrefix "cloudaudit" \
  --IsEnable true

# 3. 开启 CLS 告警：检测 Root 账号登录
# 在 CLS 控制台创建 SQL 告警
```

**Step 2：配置 SOC 告警聚合**

在 SOC 控制台中完成以下配置：

1. 确认所有安全产品已接入 SOC。
2. 创建告警分级规则：将「挖矿木马」、「反弹 Shell」、「暴力破解成功」设为 P0。
3. 启用预置剧本：「恶意 IP 自动封禁」、「失陷主机自动隔离」。

**Step 3：基线检查与修复**

1. 在云安全中心创建基线检查计划，每周日凌晨执行。
2. 配置自动修复脚本（通过运维编排 OPS 触发）。
3. 每月生成合规报告，提交给安全审计部门。

**Step 4：定期演练**

每季度进行一次红蓝对抗演练，验证安全监控的有效性：

- 红队：模拟攻击者，尝试通过 Web 漏洞入侵、横向移动、数据窃取。
- 蓝队：通过 SOC 监控告警，记录检测时间和响应时间。
- 复盘：分析告警覆盖盲区，优化检测规则和剧本。

### 32.7.3 效果

实施上述方案后，该团队实现了：

- 安全告警 100% 集中到 SOC 平台，无需登录多个控制台。
- P0 事件自动处置率达到 80%（剩余 20% 需要人工判断）。
- 基线合规率从 45% 提升到 92%。
- 等保三级测评一次性通过。

## 32.8 本章小结

安全监控不是一次性项目，而是一个持续运营的过程。腾讯云提供了从主机安全（云安全中心）、操作审计（CloudAudit）、安全运营（SOC）到合规评估（等保服务）的完整工具链。SRE 团队的核心任务不是「搭建」这些工具，而是**将它们嵌入到日常运维流程中**，实现安全运营的自动化和可度量。

本章的核心要点：

1. **SOC 是安全运营的枢纽**，统一接入所有告警，通过 SOAR 实现自动化响应。
2. **CloudAudit 是合规和溯源的基石**，必须开启并投递到 CLS/COS 长期保存。
3. **漏洞管理需要生命周期化**，从发现到关闭形成闭环，按 CVSS 评分确定修复优先级。
4. **基线检查是等保合规的基础**，应通过 IaC 实现自动化修复。
5. **等保 2.0 是云上系统的基本合规要求**，腾讯云提供了从自查到测评的全流程支持。
6. **度量指标驱动改进**，持续跟踪 MTTD、MTTR、漏洞修复率等关键指标。

在下一章中，我们将深入探讨腾讯云的成本优化与资源治理，帮助 SRE 团队在保障安全的同时控制云上支出。

---

## 附录：tccli 安全审计常用命令速查

```bash
# 查询审计事件
tccli cloudaudit DescribeEvents --region ap-guangzhou --StartTime "2025-01-01 00:00:00" --EndTime "2025-06-30 23:59:59" --MaxResults 50

# 创建审计跟踪
tccli cloudaudit CreateAudit --region ap-guangzhou --AuditName "sre-audit" --CosBucket "my-bucket" --CosRegion "ap-guangzhou" --IsEnable true

# 查询漏洞列表
tccli cwp DescribeVulList --region ap-guangzhou --Level "CRITICAL" --Limit 50

# 触发漏洞扫描
tccli cwp CreateScanTask --region ap-guangzhou --ModuleType "VUL" --ScanType "FULL" --ScanPeriod 7 --ScanRange "ALL" --Timer "02:00:00"

# 查询基线列表
tccli cwp DescribeBaselineList --region ap-guangzhou --Limit 20

# 查询安全组规则
tccli vpc DescribeSecurityGroupRules --region ap-guangzhou --SecurityGroupId "sg-xxxxxx"

# 查询 CAM 子账号
tccli cam ListUsers --region ap-guangzhou

# 查询云硬盘加密状态
tccli cbs DescribeDisks --region ap-guangzhou --Filters '[{"Name":"disk-id","Values":["disk-xxxxxx"]}]'
```
