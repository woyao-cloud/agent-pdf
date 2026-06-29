# 第30章 腾讯云网络安全实践

## 30.1 引言

在云原生时代，网络安全不再是边界防护的单一命题，而是一个涵盖身份、网络、应用、数据多个层次的纵深防御体系。腾讯云作为国内领先的云服务商，提供了从物理网络到应用层的全栈安全产品矩阵。本章聚焦于四块核心内容：**安全组（Security Group）最佳实践**、**Web 应用防火墙（WAF）**、**Anti-DDoS 防护**，以及**VPC 流日志与审计**。每部分均包含原理剖析、生产环境配置要点和 Terraform 基础设施即代码实现，帮助读者在腾讯云上构建可审计、可自动化、可防御的生产级网络架构。

---

## 30.2 安全组最佳实践

### 30.2.1 安全组的工作原理

安全组是腾讯云提供的有状态虚拟防火墙，工作在实例的弹性网卡（ENI）层面。当数据包到达实例时，安全组规则按编号从小到大依次匹配，一旦命中则立即执行对应动作（ACCEPT/REJECT），不再继续评估后续规则。由于安全组是有状态的，当一条入站规则允许某个连接后，该连接的所有回包自动被允许，无需额外配置出站规则。同理，出站规则允许的连接，其入站回包也自动放行。

安全组与网络 ACL 的关键区别在于：安全组作用于实例级别，而网络 ACL 作用于子网级别；安全组是有状态的，网络 ACL 是无状态的（需要分别配置入站和出站规则）。在实际生产环境中，安全组是更常用的访问控制手段，而网络 ACL 通常作为额外的防御层用于子网级别的流量过滤。

腾讯云安全组支持以下规则类型：

- **来源/目的类型**：支持 CIDR IP 段、安全组 ID、参数模板（IP 地址池、端口池）。
- **协议类型**：TCP、UDP、ICMP、GRE 或 ALL。
- **策略**：ACCEPT 或 REJECT（REJECT 返回 ICMP 不可达，ACCEPT 放行）。
- **备注**：每条规则应附带清晰的描述，便于后期审计和维护。

### 30.2.2 安全组设计原则

安全组是一种有状态的虚拟防火墙，在实例（CVM、LB 等）的 ENI（弹性网卡）层面提供入站和出站流量控制。其核心特征包括：

- **有状态**：允许某条入站流量后，其对应的出站回包自动放行，无需额外规则。
- **白名单机制**：默认 Deny All，仅允许显式声明的流量。
- **规则优先级**：按规则编号从小到大顺序匹配，命中即终止评估。
- **独立于实例**：安全组与实例解耦，同一安全组可绑定多个实例，同一实例可绑定多个安全组（此时取并集）。

### 30.2.2 安全组设计原则

#### 30.2.2.1 最小权限原则

每条规则只开放必要的协议、端口和来源。避免使用 `0.0.0.0/0` 作为来源，除非明确需要全公网访问（如负载均衡器的 80/443 端口）。

**反例：**

```
入站规则：来源 0.0.0.0/0，端口 ALL，协议 ALL
```

**正例：**

```
入站规则：来源 10.0.1.0/24，端口 TCP:3306，协议 TCP
```

#### 30.2.2.2 分层设计

将安全组按职责分层，而非按实例逐一创建：

| 层级 | 安全组名称 | 用途 |
|------|-----------|------|
| L1 | sg-base | 基础运维（SSH 堡垒机、监控探针） |
| L2 | sg-web | Web 服务（80/443 来自 LB） |
| L3 | sg-app | 应用服务（仅来自 sg-web） |
| L4 | sg-db | 数据库（仅来自 sg-app） |

这种分层结构使得流量路径清晰可追溯，也便于审计。

#### 30.2.2.3 使用安全组引用而非 IP

安全组规则支持引用另一个安全组的 ID 作为来源，这是实现微隔离的关键手段。

```
# 允许 sg-web 中的实例访问 sg-app 的 8080 端口
来源：sg-web-sg-id
端口：TCP:8080
```

相比硬编码 IP 段，安全组引用在扩缩容时自动生效，无需修改规则。

### 30.2.3 生产环境配置要点

1. **SSH 管理**：不直接对 CVM 开放 22 端口，而是通过堡垒机（Bastion Host）或 SSM（Session Manager）代理访问。堡垒机安全组仅对内部运维 IP 开放 22 端口。
2. **健康检查放行**：负载均衡器的健康检查包来源为腾讯云内网 IP 段，需在 CVM 安全组中显式放行 `9.0.0.0/8` 和 `10.0.0.0/8` 的对应端口。
3. **出站规则限制**：默认出站规则为 ALL Allow，生产环境应改为白名单模式，仅允许访问特定外部服务（如 yum 源、NTP、日志服务等）。
4. **规则数量控制**：单个安全组的规则数建议不超过 50 条，过多的规则会增加评估延迟。可通过拆分安全组解决。

### 30.2.4 Terraform 实现安全组

以下 Terraform 配置演示了分层安全组的设计模式：

```hcl
# provider 配置
terraform {
  required_providers {
    tencentcloud = {
      source = "tencentcloudstack/tencentcloud"
      version = "~> 1.81"
    }
  }
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

# 基础层：SSH 和监控
resource "tencentcloud_security_group" "sg_base" {
  name        = "sg-base"
  description = "基础运维安全组"
  vpc_id      = var.vpc_id
}

resource "tencentcloud_security_group_rule" "sg_base_ssh" {
  security_group_id = tencentcloud_security_group.sg_base.id
  type              = "ingress"
  cidr_ip           = "10.0.0.0/8"
  ip_protocol       = "TCP"
  port_range        = "22"
  policy            = "ACCEPT"
  description       = "堡垒机 SSH 访问"
}

resource "tencentcloud_security_group_rule" "sg_base_monitor" {
  security_group_id = tencentcloud_security_group.sg_base.id
  type              = "ingress"
  cidr_ip           = "10.0.0.0/8"
  ip_protocol       = "TCP"
  port_range        = "9100"
  policy            = "ACCEPT"
  description       = "Node Exporter 监控"
}

# Web 层：仅允许 LB 流量
resource "tencentcloud_security_group" "sg_web" {
  name        = "sg-web"
  description = "Web 服务安全组"
  vpc_id      = var.vpc_id
}

resource "tencentcloud_security_group_rule" "sg_web_http" {
  security_group_id = tencentcloud_security_group.sg_web.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "TCP"
  port_range        = "80"
  policy            = "ACCEPT"
  description       = "公网 HTTP 访问"
}

resource "tencentcloud_security_group_rule" "sg_web_https" {
  security_group_id = tencentcloud_security_group.sg_web.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "TCP"
  port_range        = "443"
  policy            = "ACCEPT"
  description       = "公网 HTTPS 访问"
}

# 应用层：仅允许来自 Web 层的流量
resource "tencentcloud_security_group" "sg_app" {
  name        = "sg-app"
  description = "应用服务安全组"
  vpc_id      = var.vpc_id
}

resource "tencentcloud_security_group_rule" "sg_app_from_web" {
  security_group_id = tencentcloud_security_group.sg_app.id
  type              = "ingress"
  ip_protocol       = "TCP"
  port_range        = "8080"
  policy            = "ACCEPT"
  source_security_group = tencentcloud_security_group.sg_web.id
  description       = "仅允许 Web 层访问应用端口"
}

# 数据库层：仅允许来自应用层的流量
resource "tencentcloud_security_group" "sg_db" {
  name        = "sg-db"
  description = "数据库安全组"
  vpc_id      = var.vpc_id
}

resource "tencentcloud_security_group_rule" "sg_db_mysql" {
  security_group_id = tencentcloud_security_group.sg_db.id
  type              = "ingress"
  ip_protocol       = "TCP"
  port_range        = "3306"
  policy            = "ACCEPT"
  source_security_group = tencentcloud_security_group.sg_app.id
  description       = "仅允许应用层访问 MySQL"
}

# 绑定安全组到 CVM
resource "tencentcloud_instance" "web_server" {
  instance_name     = "web-server"
  security_groups   = [
    tencentcloud_security_group.sg_base.id,
    tencentcloud_security_group.sg_web.id,
  ]
  # ... 其他 CVM 参数
}
```

### 30.2.5 安全组常见陷阱

| 陷阱 | 说明 | 解决方案 |
|------|------|---------|
| 规则顺序错误 | 宽泛规则在前，精确规则在后，导致精确规则永不生效 | 按从精确到宽泛的顺序排列规则编号 |
| 出站规则遗漏 | 修改出站为 Deny All 后，实例无法访问 yum 源或 DNS | 提前确认依赖的外部服务 IP/域名并加入白名单 |
| 安全组数量超限 | 单个实例绑定超过 5 个安全组 | 合并安全组或使用规则更少的设计 |
| 误删默认安全组 | 删除后新建的安全组默认规则不同 | 保留默认安全组或使用 Terraform 管理 |

---

## 30.3 Web 应用防火墙（WAF）

### 30.3.1 WAF 概述

腾讯云 Web 应用防火墙（WAF）位于用户流量和源站之间，对 HTTP/HTTPS 请求进行深度检测，拦截 SQL 注入、XSS、CSRF、命令执行、文件包含、恶意爬虫等 OWASP Top 10 攻击。WAF 提供两种部署模式：

- **CLB 模式**：通过七层负载均衡（CLB）集成，WAF 作为 CLB 的流量镜像或串联网关。
- **CNAME 模式**：通过 DNS CNAME 将域名解析到 WAF 集群，适用于非腾讯云源站。

### 30.3.2 WAF 核心能力

#### 30.3.2.1 规则引擎

WAF 内置腾讯安全团队持续更新的攻击规则库，覆盖：

- **Web 漏洞**：SQL 注入、XSS、SSRF、命令注入、路径穿越、文件上传绕过等。
- **协议合规**：HTTP 协议异常、请求体过大、Content-Type 不匹配。
- **恶意爬虫**：基于 UA、频率、行为特征的爬虫识别与拦截。
- **CC 攻击**：基于 IP/Session 的速率限制，支持突发流量平滑。

#### 30.3.2.2 自定义规则

内置规则无法覆盖的业务场景，可通过自定义规则实现精细控制：

```hcl
resource "tencentcloud_waf_custom_rule" "block_sensitive_region" {
  name        = "block-non-china-ip"
  domain      = tencentcloud_waf_domain.example.domain
  status      = "1"  # 启用

  strategies {
    field     = "ip"
    compare_func = "ip_match"
    content   = "1.2.3.0/24"
    arg       = ""
  }

  action_type = "1"  # 拦截
  redirect    = ""
  sort_id     = 1
  expire_time = "0"  # 永不过期
  source      = "custom"
}
```

#### 30.3.2.3 白名单机制

对于已知合法的请求（如内部监控、健康检查、支付回调），应配置白名单规则跳过检测，避免误拦截：

```hcl
resource "tencentcloud_waf_custom_rule" "whitelist_health_check" {
  name        = "whitelist-health-check"
  domain      = tencentcloud_waf_domain.example.domain
  status      = "1"

  strategies {
    field     = "ip"
    compare_func = "ip_match"
    content   = "9.0.0.0/8"
    arg       = ""
  }

  action_type = "0"  # 放行
  sort_id     = 0
  expire_time = "0"
  source      = "custom"
}
```

### 30.3.3 WAF 部署架构

生产环境推荐采用 **CLB + WAF 串联** 架构：

```
用户 → DNS → CLB → WAF → 源站 CVM
```

优势：
- WAF 故障时 CLB 可配置 bypass 模式，保证业务连续性。
- CLB 承担 SSL 卸载，WAF 仅处理解密后的 HTTP 请求，降低延迟。
- 源站 IP 对公网不可见，减少直接攻击面。

### 30.3.4 Terraform 部署 WAF

以下配置演示完整的 WAF 接入流程，包括域名配置、规则组绑定和日志投递：

```hcl
# 查询 WAF 套餐（需要先开通服务）
data "tencentcloud_waf_packages" "available" {}

# 绑定域名到 WAF
resource "tencentcloud_waf_domain" "example" {
  domain         = "api.example.com"
  instance_id    = data.tencentcloud_waf_packages.available.packages[0].instance_id
  engine         = "11"  # 严格模式
  is_cdn         = 0     # 非 CDN 接入
  load_balancer_set = [
    {
      load_balancer_id   = "lb-xxxxxxxx"
      load_balancer_name  = "clb-web"
      listener_id         = "lbl-xxxxxxxx"
      listener_name       = "https-443"
      protocol            = "HTTPS"
      region              = "ap-guangzhou"
      vip                 = "1.2.3.4"
    }
  ]
}

# 绑定托管规则组
resource "tencentcloud_waf_rule_group" "owasp_top10" {
  domain      = tencentcloud_waf_domain.example.domain
  group_id    = "TRG_OWASP_TOP10"
  status      = 1  # 启用
  action      = 1  # 拦截
}

# 配置 CC 防护
resource "tencentcloud_waf_cc_rule" "api_rate_limit" {
  domain   = tencentcloud_waf_domain.example.domain
  url      = "/api/"
  status   = 1
  period   = 60   # 统计周期（秒）
  limit    = 1000 # 阈值
  action_type = "1"  # 拦截
  action_message = "触发 API 频率限制"
}

# 配置日志投递到 CLS
resource "tencentcloud_waf_cls" "waf_log" {
  switch = 1
}
```

### 30.3.5 WAF 计费模式与选型建议

腾讯云 WAF 提供三种套餐：**入门版**（适合个人站点）、**高级版**（适合中小企业）、**企业版**（适合高安全要求业务）。各版本在 QPS 上限、规则数量、CC 防护能力上有所区别。选型建议：

- QPS 需求低于 2000 且无合规要求：入门版即可。
- 需要自定义规则和日志分析：至少选择高级版。
- 金融、电商等强合规行业：企业版 + 独享集群，确保资源隔离。

WAF 的计费包含两部分：基础套餐费（预付费包年包月）和弹性 QPS 费（按量后付费）。建议根据业务流量峰值预留 30% 的 QPS 余量，避免弹性计费导致成本失控。

### 30.3.6 WAF 运维最佳实践

1. **先观察后拦截**：新接入的域名先设为"观察"模式运行 72 小时，确认无大规模误报后再切换为"拦截"。
2. **定期审计日志**：通过 CLS（日志服务）对 WAF 日志配置告警，如单 IP 触发规则超过阈值时自动通知。
3. **源站保护**：WAF 后方源站应仅允许 WAF 回源 IP 访问，可在安全组中配置白名单。
4. **证书管理**：WAF 支持托管 SSL 证书，建议使用腾讯云 SSL 证书服务统一管理，到期前自动续期。

---

## 30.4 Anti-DDoS 防护

### 30.4.1 DDoS 攻击现状

DDoS（分布式拒绝服务）攻击是云上业务面临的最常见威胁之一。根据腾讯云安全年报，2024 年单次攻击峰值已超过 2 Tbps，攻击类型从传统的 SYN Flood 演变为混合型攻击（反射放大 + 应用层 CC + 慢速攻击）。腾讯云 Anti-DDoS 提供三层防护能力：

| 防护层级 | 产品 | 防护能力 |
|----------|------|---------|
| 基础防护 | 免费，默认开启 | 单 IP 2-10 Gbps |
| 高防包 | 绑定 CVM/LB 的独立 IP | 最高 300 Gbps |
| 高防 IP | 独立防护 IP，转发到源站 | 最高 1 Tbps |

### 30.4.2 基础防护与清洗策略

每个腾讯云 CVM 默认享有基础 DDoS 防护，当入流量超过阈值时触发清洗（Traffic Scrubbing）。清洗策略包括：

- **协议过滤**：丢弃畸形包（如 TCP 标志位异常、IP 分片异常）。
- **速率限制**：对同一目的 IP 的每秒包数（PPS）和每秒比特数（bps）进行限速。
- **源限速**：对特定源 IP 的并发连接数和新建连接数进行限制。

基础防护的阈值由腾讯云根据 IP 的历史流量画像自动调整，用户可在控制台手动调整"弹性防护阈值"。

### 30.4.3 高防包配置

高防包绑定到负载均衡器的公网 IP 上，为整个业务入口提供防护：

```hcl
# 查询可用的高防包
data "tencentcloud_dayu_ddos_packages" "available" {
  status = "1"  # 已购买
}

# 绑定高防包到 CLB 的 EIP
resource "tencentcloud_dayu_eip" "bind_ddos" {
  instance_id    = data.tencentcloud_dayu_ddos_packages.available.list[0].instance_id
  eip            = "1.2.3.4"
  bind_resource_id = "lb-xxxxxxxx"
  bind_resource_region = "ap-guangzhou"
}
```

### 30.4.4 高防 IP 转发架构

对于核心业务，推荐使用高防 IP 作为流量入口：

```
用户 → DNS → 高防 IP → 转发规则 → CLB → CVM
```

高防 IP 将清洗后的干净流量通过 TCP/UDP 转发规则发送到源站。配置要点：

1. **转发协议**：支持 TCP、UDP、HTTP、HTTPS。
2. **源站类型**：支持 IP 地址和域名两种回源方式。
3. **回源策略**：支持主备回源、轮询回源。
4. **健康检查**：定期探测源站可用性，异常时自动切换。

```hcl
resource "tencentcloud_dayu_l4_rule" "https_forward" {
  instance_id             = "bgpip-xxxxxxxx"
  protocol                = "TCP"
  source_port             = 443
  virtual_port            = 443
  source_type             = 2  # 回源到 IP
  source_list             = ["10.0.1.10", "10.0.1.11"]
  health_check_switch     = 1
  health_check_timeout    = 30
  health_check_interval   = 100
  health_check_health_num = 3
  health_check_unhealth_num = 3
}
```

### 30.4.5 DDoS 防护最佳实践

1. **弹性防护**：设置弹性防护阈值，日常使用基础容量，攻击超过阈值时自动弹性扩容（按量计费）。
2. **告警配置**：在云监控中配置 DDoS 攻击告警，攻击开始和结束均触发通知。
3. **业务评估**：提前评估业务的正常峰值流量（PPS、bps、并发连接数），将清洗阈值设置为峰值的 1.5-2 倍。
4. **应急演练**：定期进行 DDoS 应急演练，验证清洗策略的有效性和业务恢复时间。
5. **源站 IP 保密**：高防 IP 场景下，源站 IP 不应暴露在公网 DNS 中，仅允许高防 IP 的回源 IP 段访问。

### 30.4.6 不同攻击类型的识别与应对

| 攻击类型 | 特征 | 应对措施 |
|----------|------|---------|
| SYN Flood | 大量半连接，TCP 三次握手不完成 | 开启 SYN Proxy 和源限速 |
| UDP Flood | 大流量 UDP 包，目的端口随机 | 开启 UDP 过滤，仅放行已知端口 |
| ICMP Flood | 大量 Ping 包 | 直接丢弃 ICMP 或限速 |
| HTTP CC | 大量正常 HTTP 请求，消耗应用资源 | WAF CC 规则 + 频率限制 |
| DNS 反射放大 | 源 IP 伪造为受害者，查询放大 50-70 倍 | 关闭 DNS 递归，开启源验证 |
| NTP 反射放大 | 利用 NTP monlist 命令放大流量 | 关闭 NTP monlist，过滤 UDP 123 |

对于混合型攻击（同时发起多种类型），需要组合使用多种防护策略。腾讯云高防 IP 的"智能清洗"模式可以自动识别攻击类型并匹配最优策略，建议在非攻击期间保持该模式。

### 30.4.7 攻击响应流程

```
1. 云监控告警 → 确认攻击类型和规模
2. 检查清洗是否生效（查看高防控制台流量曲线）
3. 如清洗未生效，手动调整防护策略（如开启 UDP 过滤）
4. 联系腾讯云安全团队（VIP 客户 7×24 支持）
5. 攻击结束后，分析攻击日志，优化安全组和 WAF 规则
```

---

## 30.5 VPC 流日志与审计

### 30.5.1 流日志概述

VPC 流日志（Flow Logs）捕获 VPC 中 ENI 的出入网络流量元数据，包括源 IP、目的 IP、端口、协议、动作（ACCEPT/REJECT）等。流日志不捕获流量载荷，仅记录五元组信息，因此对性能无影响。

流日志的核心用途：

- **安全审计**：追溯异常流量来源，验证安全组和 ACL 规则是否按预期生效。
- **故障排查**：分析连接失败原因（安全组拒绝、路由不可达等）。
- **容量规划**：统计业务流量模型，为带宽升级提供数据支撑。
- **合规取证**：满足等保 2.0、PCI-DSS 等合规要求的网络日志留存。

### 30.5.2 流日志配置

流日志的采集粒度可以是 VPC、交换机或单个 ENI。生产环境建议按以下策略配置：

| 采集范围 | 适用场景 | 成本 |
|----------|---------|------|
| 全 VPC | 合规审计、安全基线 | 较高 |
| 核心交换机 | 关键业务流量监控 | 中等 |
| 单个 ENI | 故障排查、特定实例审计 | 低 |

```hcl
# 创建日志集和日志主题
resource "tencentcloud_cls_logset" "flow_log_set" {
  logset_name = "vpc-flow-log"
  period      = 90  # 日志保留 90 天
}

resource "tencentcloud_cls_log_topic" "flow_log_topic" {
  logset_id  = tencentcloud_cls_logset.flow_log_set.id
  topic_name = "vpc-flow-logs"
}

# 创建 VPC 流日志
resource "tencentcloud_vpc_flow_log" "main" {
  flow_log_name        = "vpc-flow-log-main"
  resource_type        = "VPC"
  resource_id          = var.vpc_id
  traffic_type         = "ACCEPT"  # 仅记录 ACCEPT 流量
  vpc_id               = var.vpc_id
  flow_log_storage {
    storage_type = "cls"
    cls_logset_id  = tencentcloud_cls_logset.flow_log_set.id
    cls_topic_id   = tencentcloud_cls_log_topic.flow_log_topic.id
  }
}

# 同时记录 REJECT 流量用于安全审计
resource "tencentcloud_vpc_flow_log" "reject" {
  flow_log_name        = "vpc-flow-log-reject"
  resource_type        = "VPC"
  resource_id          = var.vpc_id
  traffic_type         = "REJECT"
  vpc_id               = var.vpc_id
  flow_log_storage {
    storage_type = "cls"
    cls_logset_id  = tencentcloud_cls_logset.flow_log_set.id
    cls_topic_id   = tencentcloud_cls_log_topic.flow_log_topic.id
  }
}
```

### 30.5.3 流日志字段说明

每条流日志记录包含以下关键字段：

| 字段 | 示例 | 说明 |
|------|------|------|
| srcaddr | 10.0.1.5 | 源 IP 地址 |
| dstaddr | 10.0.2.10 | 目的 IP 地址 |
| srcport | 54321 | 源端口 |
| dstport | 3306 | 目的端口 |
| protocol | 6 | 协议编号（6=TCP, 17=UDP） |
| action | ACCEPT/REJECT | 安全组评估结果 |
| bytes | 1234 | 该流的总字节数 |
| packets | 10 | 该流的总包数 |
| start | 1620000000 | 流开始时间戳 |
| end | 1620000060 | 流结束时间戳 |
| log_status | OK/SKIPDATA/NODATA | 日志记录状态 |

### 30.5.4 基于流日志的安全分析

#### 30.5.4.1 发现异常出站连接

通过 CLS 的 SQL 分析能力，可以快速发现可疑的出站流量：

```sql
-- 查询出站到公网的流量 TOP 10
SELECT
  srcaddr,
  dstaddr,
  dstport,
  SUM(bytes) AS total_bytes,
  COUNT(*) AS flow_count
FROM "vpc-flow-logs"
WHERE action = 'ACCEPT'
  AND dstaddr NOT LIKE '10.%'
  AND dstaddr NOT LIKE '172.%'
  AND dstaddr NOT LIKE '169.%'
  AND dstaddr NOT LIKE '9.%'
GROUP BY srcaddr, dstaddr, dstport
ORDER BY total_bytes DESC
LIMIT 10
```

#### 30.5.4.2 检测被拒绝的非法访问

```sql
-- 统计被安全组拒绝的流量来源
SELECT
  srcaddr,
  dstaddr,
  dstport,
  COUNT(*) AS reject_count
FROM "vpc-flow-logs"
WHERE action = 'REJECT'
GROUP BY srcaddr, dstaddr, dstport
ORDER BY reject_count DESC
LIMIT 20
```

#### 30.5.4.3 端口扫描检测

```sql
-- 检测疑似端口扫描行为
SELECT
  srcaddr,
  dstaddr,
  COUNT(DISTINCT dstport) AS port_scan_count,
  COUNT(*) AS total_flows
FROM "vpc-flow-logs"
WHERE action = 'REJECT'
  AND protocol = 6  -- TCP
GROUP BY srcaddr, dstaddr
HAVING port_scan_count > 20
ORDER BY port_scan_count DESC
```

### 30.5.5 流日志告警配置

在云监控中配置基于流日志指标的告警策略：

```hcl
resource "tencentcloud_monitor_alarm_policy" "flow_log_alert" {
  policy_name  = "vpc-flow-log-anomaly"
  monitor_type = "MT_QCE"
  enable       = 1
  project_id   = 0
  conditions {
    is_union_rule = 1
    rules {
      metric_name       = "reject_flow_count"
      period            = 300
      operator          = "gt"
      value             = "1000"
      continue_period   = 2
      notice_frequency  = 3600
    }
  }
  event_conditions {
    event_name = "vpc:FlowLogRejectHigh"
  }
  notice_ids = ["notice-xxxxxxxx"]
}
```

### 30.5.6 网络审计综合方案

完整的网络审计方案应包含以下层次：

```
┌─────────────────────────────────────┐
│ 1. 安全组规则审计                    │
│    - 定期导出安全组规则（Terraform）  │
│    - 检查 0.0.0.0/0 开放的高危端口   │
│    - 对比基线，发现漂移              │
├─────────────────────────────────────┤
│ 2. VPC 流日志审计                   │
│    - 实时分析 REJECT 流量            │
│    - 检测异常出站行为                │
│    - 留存 180 天以上（合规要求）      │
├─────────────────────────────────────┤
│ 3. 操作审计（CloudAudit）            │
│    - 记录安全组、ACL 的变更操作      │
│    - 关联 CAM 用户和操作时间         │
│    - 配置变更告警                    │
├─────────────────────────────────────┤
│ 4. 定期渗透测试                      │
│    - 验证安全组规则有效性            │
│    - 验证 WAF 规则覆盖率             │
│    - 生成安全报告                    │
└─────────────────────────────────────┘
```

### 30.5.7 流日志成本控制

流日志的成本主要来自 CLS 的日志存储和索引费用。对于大规模 VPC，全量流日志的日增量可达数十 GB。以下成本控制策略值得参考：

1. **分层采集**：全 VPC 的 REJECT 流量必须采集（安全审计刚需），ACCEPT 流量仅在核心交换机采集。
2. **采样率**：腾讯云流日志支持采样率配置（如 1:10），非合规场景下可降低采样率以节省成本。
3. **生命周期**：在 CLS 中设置合理的日志保留周期。热数据保留 30 天用于实时分析，冷数据归档到 COS 长期保存。
4. **索引优化**：仅对需要查询的字段开启全文索引，避免全字段索引带来的存储膨胀。

```hcl
# 分层采集示例：核心交换机采集 ACCEPT，全 VPC 采集 REJECT
resource "tencentcloud_vpc_flow_log" "core_subnet_accept" {
  flow_log_name        = "core-subnet-accept"
  resource_type        = "SUBNET"
  resource_id          = "subnet-xxxxxxxx"
  traffic_type         = "ACCEPT"
  vpc_id               = var.vpc_id
  flow_log_storage {
    storage_type = "cls"
    cls_logset_id  = tencentcloud_cls_logset.flow_log_set.id
    cls_topic_id   = tencentcloud_cls_log_topic.flow_log_topic.id
  }
}
```

### 30.5.8 安全组规则审计脚本

以下 Python 脚本使用腾讯云 SDK 定期审计安全组中的高危规则：

```python
#!/usr/bin/env python3
"""安全组规则审计工具"""

import json
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.vpc.v20170312 import vpc_client, models

HIGH_RISK_PORTS = {22, 3389, 3306, 6379, 27017, 9200, 5432, 1433}
HIGH_RISK_DESC = "高危端口对公网开放"


def audit_security_groups(secret_id: str, secret_key: str, region: str = "ap-guangzhou"):
    cred = credential.Credential(secret_id, secret_key)
    client = vpc_client.VpcClient(cred, region)

    req = models.DescribeSecurityGroupsRequest()
    req.Limit = 100

    try:
        resp = client.DescribeSecurityGroups(req)
        sgs = json.loads(resp.to_json_string())["SecurityGroupSet"]
    except TencentCloudSDKException as e:
        print(f"API 调用失败: {e}")
        return

    findings = []
    for sg in sgs:
        req_rules = models.DescribeSecurityGroupRulesRequest()
        req_rules.SecurityGroupId = sg["SecurityGroupId"]
        resp_rules = client.DescribeSecurityGroupRules(req_rules)
        rules = json.loads(resp_rules.to_json_string())["SecurityGroupRuleSet"]

        for rule in rules:
            if rule.get("Policy") != "ACCEPT":
                continue
            if rule.get("CidrIp") != "0.0.0.0/0":
                continue

            port_range = rule.get("PortRange", "")
            for port in HIGH_RISK_PORTS:
                if str(port) in port_range.split("-")[0]:
                    findings.append({
                        "sg_id": sg["SecurityGroupId"],
                        "sg_name": sg["SecurityGroupName"],
                        "direction": "入站" if rule.get("Direction") == "ingress" else "出站",
                        "port": port_range,
                        "protocol": rule.get("IpProtocol", "ALL"),
                        "source": rule.get("CidrIp", ""),
                        "risk": HIGH_RISK_DESC,
                    })

    if findings:
        print(f"发现 {len(findings)} 条高危规则：")
        print(json.dumps(findings, ensure_ascii=False, indent=2))
    else:
        print("未发现高危规则，安全组配置合规。")


if __name__ == "__main__":
    audit_security_groups("YOUR_SECRET_ID", "YOUR_SECRET_KEY")
```

---

## 30.6 CAM 与网络安全集成

### 30.6.1 基于 CAM 的安全组变更管控

安全组规则变更直接影响业务可用性，必须通过 CAM（Cloud Access Management）进行严格的权限管控。推荐策略：

1. **职责分离**：网络管理员拥有安全组的创建和删除权限，应用运维仅拥有修改规则权限，只读人员仅拥有查询权限。
2. **标签授权**：通过资源标签实现细粒度授权。例如，生产环境安全组打标 `env:production`，仅允许 SRE 团队修改。
3. **审批流程**：高危操作（如开放 0.0.0.0/0 端口）必须通过 CAM 角色扮演 + 临时密钥的方式执行，确保操作可追溯。

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "vpc:ModifySecurityGroupPolicies",
        "vpc:ModifySecurityGroupAttributes"
      ],
      "resource": [
        "qcs::vpc:ap-guangzhou:uin/10000:sg/*"
      ],
      "condition": {
        "for_any_value:string_equal": {
          "qcs:resource_tag": ["env:production"]
        }
      }
    }
  ]
}
```

### 30.6.2 操作审计（CloudAudit）

CloudAudit 记录所有安全组、WAF、VPC 等网络资源的 API 调用日志。关键审计事件包括：

| 事件名称 | 风险等级 | 说明 |
|----------|---------|------|
| ModifySecurityGroupPolicies | 高 | 修改安全组规则 |
| DeleteSecurityGroup | 高 | 删除安全组 |
| CreateSecurityGroupPolicy | 中 | 新增安全组规则 |
| AssociateSecurityGroups | 中 | 绑定安全组到实例 |
| ModifyWafDomainConfig | 高 | 修改 WAF 域名配置 |
| DeleteWafDomain | 高 | 删除 WAF 域名 |

建议在 CloudAudit 中配置"高风险事件"的告警通知，确保安全组和 WAF 的变更在 5 分钟内被感知。

## 30.8 综合安全架构

### 30.6.1 多层纵深防御架构

将本章所有安全产品整合为一个完整的防御体系：

```
                    ┌──────────────┐
                    │   Anti-DDoS  │  第 1 层：网络层 DDoS 清洗
                    │   高防 IP     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │     WAF      │  第 2 层：应用层攻击检测
                    │  Web 防火墙   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  CLB 负载均衡  │  第 3 层：流量分发 + SSL 卸载
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼───┐ ┌──────▼───┐ ┌──────▼───┐
       │ 安全组    │ │ 安全组    │ │ 安全组    │  第 4 层：主机防火墙
       │ sg-web   │ │ sg-app   │ │ sg-db    │
       └──────┬───┘ └──────┬───┘ └──────┬───┘
              │            │            │
       ┌──────▼───┐ ┌──────▼───┐ ┌──────▼───┐
       │  Web 节点  │ │ 应用节点  │ │ 数据库节点 │  第 5 层：业务实例
       └───────────┘ └──────────┘ └──────────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼───────┐
                    │  VPC 流日志   │  第 6 层：网络审计与监控
                    │  + CloudAudit│
                    └──────────────┘
```

### 30.6.2 安全基线检查清单

| 检查项 | 标准 | 工具/方法 |
|--------|------|----------|
| 安全组最小权限 | 无 0.0.0.0/0 开放高危端口 | 审计脚本 + Terraform 合规检查 |
| WAF 规则覆盖 | OWASP Top 10 全部开启 | WAF 控制台规则组状态 |
| DDoS 防护 | 核心业务绑定高防包/高防 IP | 控制台资源绑定检查 |
| 流日志开启 | 全 VPC 开启 ACCEPT + REJECT | Terraform 资源状态 |
| 日志留存 | ≥ 180 天 | CLS 日志集周期配置 |
| 操作审计 | CloudAudit 开启 | 控制台操作记录查询 |
| 堡垒机 | 无直接 SSH 暴露 | 安全组规则检查 |
| 密钥轮转 | 每 90 天轮转一次 | CAM 密钥使用时间审计 |

### 30.6.3 Terraform 完整部署示例

以下代码整合了本章所有安全组件，形成一个可复用的安全基础设施模块：

```hcl
# modules/security/main.tf

variable "vpc_id" {}
variable "domain" {}
variable "clb_id" {}
variable "app_cvm_ids" {
  type = list(string)
}

# ── 安全组 ──
module "security_groups" {
  source = "./modules/sg"
  vpc_id = var.vpc_id
}

# ── WAF ──
module "waf" {
  source   = "./modules/waf"
  domain   = var.domain
  clb_id   = var.clb_id
  app_cvm_ids = var.app_cvm_ids
}

# ── 高防包 ──
module "antiddos" {
  source = "./modules/antiddos"
  clb_id = var.clb_id
}

# ── 流日志 ──
module "flow_logs" {
  source = "./modules/flowlog"
  vpc_id = var.vpc_id
}

# ── 告警 ──
module "alerts" {
  source = "./modules/alerts"
  vpc_id = var.vpc_id
  domain = var.domain
}
```

---

## 30.8 安全事件自动化响应

### 30.8.1 基于 SCF 的自动封禁

结合 VPC 流日志、云监控告警和云函数（SCF），可以实现安全事件的自动化响应。以下是一个典型的自动化封禁流程：

```
流日志检测到异常 → 云监控告警触发 → SCF 执行封禁 → 写入安全组规则
```

```python
# SCF 函数：自动封禁恶意 IP
import json
import os
from tencentcloud.common import credential
from tencentcloud.vpc.v20170312 import vpc_client, models

def main_handler(event, context):
    alarm_data = json.loads(event.get("Message", "{}"))
    malicious_ip = alarm_data.get("dimensions", [{}])[0].get("value", "")

    if not malicious_ip:
        return {"code": -1, "msg": "未提取到恶意 IP"}

    cred = credential.Credential(
        os.environ.get("TENCENTCLOUD_SECRET_ID"),
        os.environ.get("TENCENTCLOUD_SECRET_KEY")
    )
    client = vpc_client.VpcClient(cred, "ap-guangzhou")

    req = models.DescribeSecurityGroupsRequest()
    req.Filters = [{"Name": "security-group-name", "Values": ["sg-blocklist"]}]
    resp = client.DescribeSecurityGroups(req)
    sg_id = json.loads(resp.to_json_string())["SecurityGroupSet"][0]["SecurityGroupId"]

    req2 = models.CreateSecurityGroupPoliciesRequest()
    req2.SecurityGroupId = sg_id
    req2.SecurityGroupPolicySet = {
        "Ingress": [{
            "PolicyIndex": 0,
            "Protocol": "ALL",
            "PortRange": "ALL",
            "CidrBlock": f"{malicious_ip}/32",
            "Action": "DROP",
            "PolicyDescription": f"SCF 自动封禁 {malicious_ip}"
        }]
    }
    client.CreateSecurityGroupPolicies(req2)

    return {"code": 0, "msg": f"已封禁 {malicious_ip}"}
```

### 30.8.2 自动化响应注意事项

自动化封禁虽然高效，但也存在误封风险。生产环境应遵循以下原则：

1. **分级响应**：低置信度告警仅发送通知，高置信度告警才触发自动封禁。
2. **临时封禁**：自动添加的规则设置 TTL（如 24 小时后自动移除），避免永久封禁导致误伤。
3. **人工确认**：封禁操作同时通知 SRE 值班人员，允许一键回滚。
4. **速率限制**：单日内自动封禁的 IP 数量设置上限，防止攻击者通过伪造源 IP 耗尽安全组规则配额。

## 30.9 总结

本章从四个维度系统性地介绍了腾讯云的网络安全体系：

1. **安全组**作为最基础的网络访问控制层，通过分层设计、最小权限和安全组引用实现微隔离。Terraform 管理安全组可以确保基础设施即代码的版本控制和审计追溯。

2. **WAF**在应用层提供深度检测能力，覆盖 OWASP Top 10 攻击和恶意爬虫。CLB 串联部署模式兼顾了高可用和安全，先观察后拦截的策略有效降低误报风险。

3. **Anti-DDoS**构建了从基础免费防护到高防 IP 的阶梯式防御体系。弹性防护机制在保证业务连续性的同时控制成本，完善的告警和应急流程确保攻击发生时快速响应。

4. **VPC 流日志与审计**提供了网络流量的可见性，是安全运营的基础数据源。结合 CLS 的 SQL 分析能力，可以实时发现异常流量、验证安全策略有效性，满足合规审计要求。

安全是一个持续演进的过程，而非一次性建设。建议读者在实际生产环境中：
- 建立安全基线的自动化检查机制（如 CI/CD 中的 Terraform 合规扫描）
- 定期进行红蓝对抗演练，验证防御体系的有效性
- 关注腾讯云安全产品更新，及时应用新的防护能力
- 将安全运营纳入日常运维流程，而非事后补救

下一章将深入探讨腾讯云容器服务（TKE）的安全实践，包括镜像安全、运行时防护和 Kubernetes RBAC 配置。
