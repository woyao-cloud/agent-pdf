# 第8章 腾讯云 VPC 网络架构

## 8.1 概述

腾讯云 VPC（Virtual Private Cloud，私有网络）是用户在腾讯云上创建的隔离网络空间，是云上资源（CVM、CLB、CDB 等）之间以及云上资源与外部网络之间通信的基础。VPC 在逻辑上完全隔离，每个 VPC 相当于一个独立的虚拟数据中心，用户可以在其中自由定义 IP 地址段、划分子网、配置路由表和安全策略，构建出与传统数据中心网络同等甚至更灵活的网络环境。

VPC 网络架构是云上所有业务的基础设施底座。一个设计良好的 VPC 网络，能够同时满足高可用、可扩展、安全合规和成本可控四大目标。反之，网络规划失误（如 CIDR 重叠、子网划分不合理、安全策略过于宽松）往往在业务扩张时成为难以逾越的障碍，甚至需要推倒重来。根据腾讯云官方统计，超过 60% 的线上故障与网络配置相关，而其中大部分问题可以通过前期合理规划避免。

本章将从 CIDR 规划、子网设计、安全组与 ACL、多 VPC 互联、混合云接入、NAT 网关、DNS 解析等核心主题展开，并结合 Terraform 给出可落地的代码示例，帮助读者系统掌握腾讯云 VPC 网络架构的设计与运维。

---

## 8.2 VPC CIDR 规划

### 8.2.1 CIDR 基础

CIDR（Classless Inter-Domain Routing，无类别域间路由）以可变长子网掩码替代了传统的 A/B/C 类地址划分。VPC 的 CIDR 决定了该 VPC 内可用的 IP 地址总量，一旦创建即不可修改（但可添加辅助 CIDR）。

腾讯云 VPC 支持的私有 IP 地址段遵循 RFC 1918：

- **10.0.0.0/8**：16,777,216 个 IP，掩码范围 8\~28
- **172.16.0.0/12**：1,048,576 个 IP，掩码范围 12\~28
- **192.168.0.0/16**：65,536 个 IP，掩码范围 16\~28

选择哪个地址段取决于业务规模。10.0.0.0/8 地址空间最大，适合大型企业；172.16.0.0/12 适合中型企业；192.168.0.0/16 适合小型团队或开发环境。在实际生产环境中，绝大多数企业选择 10.0.0.0/8 段，因为它提供了最灵活的扩展空间。

### 8.2.2 规划原则

**原则一：预留足够但不过度**

VPC 创建后主 CIDR 不可修改，因此初始规划必须考虑未来 3\~5 年的增长。但也不宜过大——过大的广播域会增加网络故障域和运维复杂度。推荐：

| 环境 | 推荐 CIDR | 可用 IP | 适用场景 |
|------|-----------|---------|----------|
| 生产 | 10.0.0.0/8 内分配 /16 | 65,536 | 多业务、多可用区部署 |
| 测试 | 172.16.0.0/12 内分配 /20 | 4,096 | 中等规模测试环境 |
| 开发 | 192.168.0.0/16 内分配 /24 | 256 | 小规模开发环境 |

**原则二：避免 CIDR 重叠**

在多 VPC 互联（VPC Peering、CCN）或混合云（VPN、专线）场景中，CIDR 重叠会导致路由冲突，无法互通。规划时应为每个 VPC 分配互不重叠的地址段，并预留一段地址用于未来扩展。如果 CIDR 重叠不可避免，则需要通过 NAT 网关做地址转换（DNAT/SNAT）来解决，但这会增加架构复杂度和延迟。

**原则三：按业务维度分配**

建议将 CIDR 的第二段或第三段用于标识业务和环境：

```
10.{业务编码}.{环境编码}.0/20
```

例如：

- 10.1.0.0/20 —— 电商业务-生产
- 10.1.16.0/20 —— 电商业务-测试
- 10.2.0.0/20 —— 支付业务-生产
- 10.2.16.0/20 —— 支付业务-测试

这种编码方式的优势在于：通过 IP 地址即可快速判断业务归属和环境类型，极大降低了运维排障时的认知负担。当网络工程师看到 10.2.16.x 时，立即知道这是支付业务的测试环境。

**原则四：为未来扩展预留空间**

即使当前只需要一个 /24 子网，也建议分配一个 /20 的 CIDR 块给 VPC。多出来的地址空间可以用于：

- 新增可用区子网（每个可用区至少需要一个子网）
- 新增业务层（如缓存层、消息队列层、日志收集层）
- 容器集群（TKE）的 Pod 网络（VPC-CNI 模式下每个 Pod 占用一个 IP）
- Serverless 服务的弹性网卡
- 数据库只读副本的部署

### 8.2.3 辅助 CIDR

当主 CIDR 地址不足时，腾讯云支持为 VPC 添加辅助 CIDR。辅助 CIDR 可以与主 CIDR 来自不同的私有地址段，但同样不能与对端 VPC 或本地 IDC 重叠。

```bash
# 通过 API 添加辅助 CIDR
vpc_id = "vpc-xxxxxxxx"
new_cidr = "10.3.0.0/16"
```

辅助 CIDR 添加后，VPC 内的子网可以创建在辅助 CIDR 范围内，路由表会自动生效。需要注意：辅助 CIDR 不能通过控制台删除，只能通过 API 操作，且删除前必须确保该 CIDR 范围内没有子网。

辅助 CIDR 的典型使用场景是：当 VPC 主 CIDR 地址耗尽，但业务无法迁移到新 VPC 时，通过辅助 CIDR 扩展地址空间。但辅助 CIDR 并非万能——某些腾讯云服务（如部分老版本的 CLB）可能不支持辅助 CIDR 范围内的实例，因此最好在初始规划时就分配足够的地址空间。

### 8.2.4 多账号 CIDR 统一管理

在大型企业中，多个腾讯云账号（主账号、业务账号、测试账号）各自拥有 VPC，CIDR 管理极易失控。推荐的做法是：

1. **建立 CIDR 分配台账**：使用 Excel 或 CMDB 记录每个账号、每个 VPC 的 CIDR 分配情况
2. **分配 CIDR 管理员**：由网络团队统一分配地址段，业务团队无权自行创建 VPC
3. **自动化校验**：在 Terraform CI/CD 流水线中增加 CIDR 重叠检查步骤

```hcl
# 通过 Terraform 数据源查询已有 VPC CIDR，避免重叠
data "tencentcloud_vpc_subnets" "existing" {
  vpc_id = "vpc-xxxxxxxx"
}

# 在 CI/CD 中校验新 CIDR 是否与已有 CIDR 重叠
# 可使用第三方工具如 cidrcheck 进行校验
```

---

## 8.3 子网设计

### 8.3.1 子网的作用

子网是 VPC 内的 IP 地址段划分单位，每个子网必须绑定一个可用区（AZ）。子网的核心作用包括：

1. **故障隔离**：不同可用区的子网物理上独立，单 AZ 故障不影响其他 AZ
2. **路由控制**：每个子网关联一张路由表，决定流量走向
3. **安全边界**：子网级别可绑定网络 ACL，提供无状态的安全过滤

### 8.3.2 子网规划策略

**策略一：按可用区划分**

每个可用区至少创建一个子网，实现跨 AZ 高可用部署：

```
VPC: 10.1.0.0/16
├── 可用区 A: 10.1.0.0/20
├── 可用区 B: 10.1.16.0/20
└── 可用区 C: 10.1.32.0/20
```

跨 AZ 部署是云原生高可用的基石。当单个可用区发生故障时，流量自动切换到其他可用区，业务不受影响。腾讯云广州地域提供 6 个可用区，上海和北京提供 3\~5 个可用区，建议至少使用 2 个可用区部署生产业务。

**策略二：按访问属性划分**

将子网分为公网子网和私网子网：

- **公网子网**：关联路由表指向 NAT 网关或 Internet 网关，部署需要主动访问互联网的实例
- **私网子网**：无公网路由，部署后端服务、数据库等敏感组件

```
VPC: 10.1.0.0/16
├── 公网子网-A: 10.1.0.0/24  (route: 0.0.0.0/0 -> NAT Gateway)
├── 私网子网-A: 10.1.1.0/24  (route: 仅内网)
├── 公网子网-B: 10.1.16.0/24
└── 私网子网-B: 10.1.17.0/24
```

**策略三：按业务层划分**

将不同业务层部署在不同子网，配合网络 ACL 实现层间隔离：

| 子网 | CIDR | 部署组件 | ACL 策略 |
|------|------|----------|----------|
| Web | 10.1.0.0/24 | CLB + Nginx | 入站：80/443 |
| App | 10.1.1.0/24 | 应用服务 | 仅 Web 子网可入 |
| Cache | 10.1.2.0/24 | Redis/Memcached | 仅 App 子网可入 |
| DB | 10.1.3.0/24 | MySQL/PostgreSQL | 仅 App 子网可入 |
| MQ | 10.1.4.0/24 | Kafka/RocketMQ | 仅 App 子网可入 |

这种分层设计的好处是：每一层都可以独立扩缩容，安全策略可以精确到层级别，故障排查时可以快速定位问题层。例如，当数据库响应变慢时，可以首先检查 DB 子网的流量和 ACL 日志，而不需要排查整个 VPC。

### 8.3.3 子网掩码选择

| 掩码 | IP 总数 | 可用 IP | 适用场景 |
|------|---------|---------|----------|
| /24 | 256 | 251 | 单个组件层 |
| /23 | 512 | 507 | 中等规模组件层 |
| /22 | 1,024 | 1,019 | 较大规模组件层 |
| /20 | 4,096 | 4,091 | 单个可用区 |
| /16 | 65,536 | 65,531 | 整个 VPC |

腾讯云保留每个子网的前 4 个和后 1 个 IP 地址（网络号、网关、广播、保留），因此 /24 子网实际可用 251 个 IP。在规划时，务必使用可用 IP 数而非总 IP 数进行计算。

### 8.3.4 子网与 TKE 容器网络

当在 VPC 中部署 TKE（Tencent Kubernetes Engine）集群时，容器网络（Global Router 或 VPC-CNI）会占用额外的 IP 地址：

- **Global Router 模式**：容器 IP 从独立的 CIDR 分配，不占用 VPC 子网 IP。这是推荐模式，因为它不消耗 VPC 地址资源
- **VPC-CNI 模式**：容器直接使用 VPC 子网 IP，每个 Pod 占用一个子网 IP 地址。这种模式网络性能更好，但 IP 消耗量大

在 VPC-CNI 模式下，子网 IP 消耗量 = 实例数 × 单实例最大 Pod 数。例如 10 个节点、单节点 32 Pod，则需要 320 个可用 IP。规划子网时必须将这部分 IP 需求纳入计算。

### 8.3.5 子网命名规范

建议为子网建立统一的命名规范，便于管理和识别：

```
{环境}-{层}-{可用区}
```

例如：

- `prod-web-a`：生产环境 Web 层，可用区 A
- `prod-app-b`：生产环境应用层，可用区 B
- `test-db-a`：测试环境数据库层，可用区 A

一致的命名规范在 Terraform 管理和控制台操作中都能显著降低出错概率。

---

## 8.4 安全组与网络 ACL

### 8.4.1 安全组

安全组（Security Group）是一种**有状态**的虚拟防火墙，工作在实例级别（CVM、CLB 等）。有状态意味着：如果允许入站流量，那么该流量的出站响应自动允许，无需额外规则。

**核心特性：**

- 有状态：自动允许回包流量
- 实例级：绑定到弹性网卡（ENI）
- 支持策略优先级：规则按序号从小到大匹配
- 默认拒绝所有入站，允许所有出站
- 支持引用安全组 ID 作为规则源/目的
- 一个实例可以绑定最多 5 个安全组
- 一个安全组可以绑定最多 100 个实例

**规则匹配逻辑：**

安全组规则按序号从小到大逐条匹配。当一条规则匹配后，不再继续评估后续规则。如果所有规则都不匹配，则默认拒绝。因此：

- 精确规则放在前面（小序号）
- 宽泛规则放在后面（大序号）
- 拒绝规则需要显式配置（安全组默认只支持允许规则，拒绝需通过其他方式实现）

**安全组引用：**

安全组引用是腾讯云安全组最强大的特性之一。它允许将另一个安全组 ID 作为规则的源或目的，而不是使用 IP 地址段。这意味着：

- 当后端实例扩缩容时，安全组规则自动生效，无需修改
- 当后端实例迁移到不同子网时，安全组规则仍然有效
- 实现了"按角色授权"而非"按 IP 授权"

例如，Web 安全组可以引用 App 安全组作为源，允许来自 App 层的流量。当 App 层新增实例时，Web 层自动允许其访问，无需修改任何规则。

**最佳实践：**

1. **最小权限原则**：仅开放业务必需的端口，关闭不必要的端口（如 SSH 22 端口仅对堡垒机子网开放）
2. **使用安全组引用**：而非 IP 白名单，实现动态访问控制
3. **按角色创建安全组**：Web-SG、App-SG、DB-SG，而非按实例创建
4. **出站规则限制**：默认允许出站，生产环境应限制出站规则，防止数据泄露和恶意软件外联
5. **定期审计**：定期检查安全组规则，清理过期或过于宽松的规则

```hcl
# Terraform: 安全组定义
resource "tencentcloud_security_group" "web_sg" {
  name        = "web-sg"
  description = "Web layer security group"
}

resource "tencentcloud_security_group_rule" "web_ingress_http" {
  security_group_id = tencentcloud_security_group.web_sg.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "TCP"
  port_range        = "80,443"
  policy            = "accept"
}

resource "tencentcloud_security_group_rule" "web_ingress_app" {
  security_group_id = tencentcloud_security_group.web_sg.id
  type              = "ingress"
  cidr_ip           = "10.1.1.0/24"
  ip_protocol       = "TCP"
  port_range        = "3000-3999"
  policy            = "accept"
}

resource "tencentcloud_security_group_rule" "web_egress" {
  security_group_id = tencentcloud_security_group.web_sg.id
  type              = "egress"
  cidr_ip           = "10.1.1.0/24"
  ip_protocol       = "TCP"
  port_range        = "8080-8090"
  policy            = "accept"
}
```

### 8.4.2 网络 ACL

网络 ACL（Network Access Control List）是一种**无状态**的虚拟防火墙，工作在子网级别。无状态意味着：必须同时配置入站和出站规则，回包流量不会自动放行。

**核心特性：**

- 无状态：入站和出站规则需分别配置
- 子网级：关联到子网后，该子网内所有实例均受其约束
- 规则编号：1\~65535，按编号从小到大匹配，匹配即停
- 同时支持允许和拒绝两种策略
- 一个子网只能关联一个网络 ACL
- 一个网络 ACL 可以关联多个子网

**无状态带来的复杂性：**

由于网络 ACL 是无状态的，配置出站规则时必须考虑回包流量。例如，如果允许外部访问子网内的 Web 服务（入站 80 端口），则必须在出站规则中放行临时端口（1024\~65535）的回包流量：

```
入站规则：
  编号 100: 允许 0.0.0.0/0 TCP 80

出站规则：
  编号 100: 允许 0.0.0.0/0 TCP 1024-65535  (回包流量)
```

这是网络 ACL 最常见的配置错误——只配了入站规则而忘记配出站回包规则，导致客户端能建立连接但收不到响应。另一个常见错误是 ICMP 回包——如果允许入站 ICMP Echo，必须在出站规则中放行 ICMP Echo Reply。

### 8.4.3 安全组 vs 网络 ACL 对比

| 维度 | 安全组 | 网络 ACL |
|------|--------|----------|
| 作用层级 | 实例（弹性网卡） | 子网 |
| 状态 | 有状态 | 无状态 |
| 策略 | 仅允许 | 允许 + 拒绝 |
| 规则评估 | 所有规则合并评估 | 按编号顺序匹配 |
| 适用场景 | 细粒度实例级控制 | 粗粒度子网边界防护 |
| 配置复杂度 | 低（有状态自动处理回包） | 高（需手动处理回包） |
| 变更影响 | 仅影响绑定的实例 | 影响整个子网 |

### 8.4.4 典型配合策略

在实际生产环境中，安全组和网络 ACL 通常配合使用，形成纵深防御：

```
第一层：网络 ACL（子网边界）
  - 拒绝已知恶意 IP 段（黑名单）
  - 限制非业务端口（如封禁 22、3389 等管理端口）
  - 限制 ICMP（防止 ping 扫描）

第二层：安全组（实例边界）
  - 精确控制业务端口
  - 按角色精细化授权
  - 使用安全组引用实现动态访问
```

**安全架构决策树：**

```
是否需要拒绝特定流量？ ──是──→ 网络 ACL（子网级黑名单）
        │
        否
        ↓
是否需要实例级精细控制？ ──是──→ 安全组
        │
        否
        ↓
    两者结合使用
```

### 8.4.5 安全组规则管理最佳实践

**规则命名规范：**

建议为每条安全组规则添加有意义的描述，便于审计和维护：

```hcl
resource "tencentcloud_security_group_rule" "web_ingress_https" {
  security_group_id = tencentcloud_security_group.web_sg.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "TCP"
  port_range        = "443"
  policy            = "accept"
  description       = "Allow HTTPS from internet"
}
```

**变更管理：**

安全组规则的变更直接影响线上业务。建议：

1. 通过 Terraform 管理安全组规则，所有变更走代码审查流程
2. 先创建新规则再删除旧规则，避免变更窗口内无规则匹配导致断连
3. 使用 `tencentcloud_security_group_rule` 资源而非在 `tencentcloud_security_group` 中内联规则，便于单独管理
4. 对生产环境的安全组规则变更设置审批流程

---

## 8.5 多 VPC 互联

### 8.5.1 为什么需要多 VPC

在大型企业中，单一 VPC 难以满足以下需求：

- **环境隔离**：生产、测试、开发 VPC 严格隔离，防止误操作影响生产
- **业务隔离**：不同业务线（电商、支付、AI）独立 VPC，避免互相影响
- **账号隔离**：不同团队使用不同腾讯云账号，实现财务和权限隔离
- **合规要求**：敏感数据 VPC 与普通业务 VPC 物理隔离，满足等保、PCI-DSS 等合规要求
- **地域扩展**：业务扩展到多个地域，每个地域独立 VPC

### 8.5.2 VPC Peering

VPC Peering（对等连接）在两个 VPC 之间建立 1 对 1 的私有网络连接。

**工作原理：**

VPC Peering 利用腾讯云骨干网络在两个 VPC 之间建立直接连接，流量不经过公网，延迟低、安全性高。建立对等连接后，需要在两端 VPC 的路由表中分别添加指向对端 VPC 的路由。

**限制：**

- 仅支持两个 VPC 之间建立，不支持传递性（A-B 对等 + B-C 对等 ≠ A-C 互通）
- 两端 CIDR 不能重叠
- 同地域免费，跨地域按流量收费
- 跨账号对等连接需要对方账号接受请求

**适用场景：**

- 少量 VPC（<5 个）之间的简单互通
- 同账号同地域的 VPC 互联
- 临时性的 VPC 互联需求

**N 个 VPC 全互联的连接数：**

使用 VPC Peering 实现 N 个 VPC 全互联，需要建立 N×(N-1)/2 个对等连接。当 N=10 时，需要 45 个连接，管理复杂度急剧上升。这是 VPC Peering 在大规模场景下的核心痛点。

```hcl
# Terraform: VPC Peering
resource "tencentcloud_vpc" "vpc_a" {
  name       = "vpc-a"
  cidr_block = "10.1.0.0/16"
  is_multicast = false
}

resource "tencentcloud_vpc" "vpc_b" {
  name       = "vpc-b"
  cidr_block = "10.2.0.0/16"
  is_multicast = false
}

resource "tencentcloud_peering_connection" "peer_ab" {
  name               = "peer-a-to-b"
  vpc_id             = tencentcloud_vpc.vpc_a.id
  peer_vpc_id        = tencentcloud_vpc.vpc_b.id
  peer_uin           = "your_uin"
  peer_region        = "ap-guangzhou"
}

resource "tencentcloud_peering_connection_accept" "accept_ab" {
  peering_connection_id = tencentcloud_peering_connection.peer_ab.id
}

# 两端路由表添加路由
resource "tencentcloud_route_table_entry" "route_a_to_b" {
  route_table_id         = tencentcloud_vpc.vpc_a.default_route_table_id
  destination_cidr_block = "10.2.0.0/16"
  next_type              = "peering_connection"
  next_hub               = tencentcloud_peering_connection.peer_ab.id
}

resource "tencentcloud_route_table_entry" "route_b_to_a" {
  route_table_id         = tencentcloud_vpc.vpc_b.default_route_table_id
  destination_cidr_block = "10.1.0.0/16"
  next_type              = "peering_connection"
  next_hub               = tencentcloud_peering_connection.peer_ab.id
}
```

### 8.5.3 云联网（CCN）

云联网（Cloud Connect Network，CCN）是腾讯云提供的一张覆盖多地域、多账号的智能组网服务，解决了 VPC Peering 的传递性不足和 N 个 VPC 互联时 O(N²) 的连接数问题。

**核心优势：**

- **传递性**：加入同一 CCN 实例的所有 VPC 自动互通
- **多地域**：跨地域互通自动优化路径，基于腾讯云骨干网络
- **多账号**：支持跨账号 VPC 加入，实现企业级网络统一管理
- **路由自动下发**：无需手动配置路由表，CCN 自动学习并下发路由
- **QoS 保障**：支持带宽限速，可按地域粒度设置带宽上限
- **路由策略**：支持自定义路由传播和接收策略

**架构模型：**

```
          ┌─────────────┐
          │   CCN 实例   │
          └──────┬──────┘
     ┌───────────┼───────────┐
     │           │           │
  VPC-A       VPC-B       VPC-C
 (广州)      (上海)      (北京)
```

**CCN 路由表管理：**

CCN 自动学习各 VPC 的路由，但用户可以通过路由表策略控制路由的发布与接收：

- **路由传播**：控制哪些 VPC 的路由向 CCN 发布。例如，可以禁止测试 VPC 的路由传播到 CCN，防止测试路由影响生产
- **路由接收**：控制 CCN 向哪些 VPC 下发路由。例如，可以控制生产 VPC 只接收来自其他生产 VPC 的路由
- **路由优先级**：支持自定义路由优先级，当多个路由匹配时选择优先级最高的

**CCN 带宽管理：**

跨地域 CCN 通信需要购买带宽包。腾讯云提供两种带宽包模式：

- **月 95 百分位计费**：按月度峰值带宽的 95 百分位计费，适合带宽波动较大的场景
- **按带宽计费**：按购买的固定带宽计费，适合带宽稳定的场景

```hcl
# Terraform: CCN 多 VPC 互联
resource "tencentcloud_ccn" "main" {
  name        = "global-ccn"
  description = "Global Cloud Connect Network"
  qos         = "AG"   # AG: 服务质量保障, AU: 尽力而为
  charge_type = "POSTPAID"  # 后付费
  bandwidth_limit_type = "REGION_LIMIT"  # 地域间限速
}

resource "tencentcloud_ccn_attachment" "attach_a" {
  ccn_id          = tencentcloud_ccn.main.id
  instance_type   = "VPC"
  instance_id     = tencentcloud_vpc.vpc_a.id
  instance_region = "ap-guangzhou"
}

resource "tencentcloud_ccn_attachment" "attach_b" {
  ccn_id          = tencentcloud_ccn.main.id
  instance_type   = "VPC"
  instance_id     = tencentcloud_vpc.vpc_b.id
  instance_region = "ap-guangzhou"
}

resource "tencentcloud_ccn_bandwidth_limit" "limit" {
  ccn_id          = tencentcloud_ccn.main.id
  region          = "ap-guangzhou"
  bandwidth_limit = 1000  # Mbps
}
```

### 8.5.4 VPC Peering vs CCN 选型

| 维度 | VPC Peering | CCN |
|------|-------------|-----|
| 连接数 | 2 个 VPC | 最多 100+ VPC |
| 传递性 | 不支持 | 支持 |
| 跨地域 | 支持（收费） | 支持（收费） |
| 路由管理 | 手动配置两端路由 | 自动学习下发 |
| 跨账号 | 支持 | 支持 |
| 带宽控制 | 不支持 | 支持（地域级限速） |
| 路由策略 | 不支持 | 支持（发布/接收控制） |
| 管理复杂度 | O(N²) | O(1) |
| 适用规模 | 小规模（<5 VPC） | 中大规模 |

**选型建议：**

- 2\~3 个 VPC 同地域互通，且未来不扩展 → VPC Peering
- 4 个以上 VPC 互通，或需要跨地域 → CCN
- 需要跨账号统一管理 → CCN
- 需要精细的路由策略控制 → CCN

### 8.5.5 跨账号 VPC 互联

在企业级场景中，不同业务团队使用不同腾讯云账号是常见做法。跨账号 VPC 互联有两种方式：

**方式一：跨账号 VPC Peering**

1. 账号 A 发起对等连接请求，指定账号 B 的 VPC ID
2. 账号 B 接受对等连接请求
3. 双方各自添加路由

**方式二：跨账号 CCN**

1. 账号 A 创建 CCN 实例
2. 账号 B 将 VPC 关联到账号 A 的 CCN（需要账号 A 授权）
3. CCN 自动下发路由

跨账号 CCN 是推荐的企业级方案，因为它支持集中管理——网络团队在一个账号中管理 CCN，所有业务账号的 VPC 加入即可。

---

## 8.6 混合云网络

### 8.6.1 混合云架构概述

混合云（Hybrid Cloud）将企业本地 IDC（Internet Data Center）与公有云 VPC 通过专用网络连接，实现统一管理、弹性伸缩和灾备容灾。混合云是大型企业上云的常见路径——核心敏感数据留在 IDC，弹性计算和互联网业务部署在云上。

腾讯云提供两种混合云接入方式：

- **VPN 网关**：基于互联网的加密隧道，成本低、部署快
- **专线接入（Direct Connect）**：通过物理专线连接，延迟低、带宽大、稳定性高

### 8.6.2 VPN 网关

**架构原理：**

```
IDC ── IPSec VPN ── 公网 ── IPSec VPN ── VPC
```

腾讯云 VPN 网关支持 IPSec 和 SSL 两种协议：

- **IPSec VPN**：站点到站点（Site-to-Site），连接 IDC 子网与 VPC 子网，适用于 IDC 与云上 VPC 互通
- **SSL VPN**：终端到站点（Client-to-Site），允许个人终端远程接入 VPC，适用于远程办公场景

**IPSec VPN 配置步骤：**

1. 创建 VPN 网关（选择带宽规格和可用区）
2. 创建对端网关（记录 IDC VPN 设备的公网 IP）
3. 创建 VPN 通道（配置 IKE 和 IPSec 参数、预共享密钥、SPD 策略）
4. 在 VPC 路由表中添加指向 VPN 网关的路由
5. 在 IDC 防火墙放行 UDP 500/4500 端口

**IKE 和 IPSec 参数匹配：**

VPN 通道两端必须使用相同的 IKE 和 IPSec 参数，否则无法建立连接。以下是腾讯云推荐的参数配置：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| IKE 版本 | IKEV2 | 更安全、更稳定 |
| 协商模式 | MAIN | 主模式，更安全 |
| DH 组 | GROUP2 | 1024 位 MODP |
| 加密算法 | AES128 | 平衡安全与性能 |
| 认证算法 | SHA1 | 或 SHA256（更安全） |
| SA 生命周期 | 86400 秒 | IKE SA 过期后重新协商 |
| PFS DH 组 | GROUP2 | 完美前向保密 |
| IPSec 加密 | AES128 | 与 IKE 加密算法一致 |
| IPSec 认证 | SHA1 | 与 IKE 认证算法一致 |

**SPD（Security Policy Database）策略：**

SPD 定义了哪些流量需要通过 VPN 加密传输：

```hcl
security_group_policy {
  local_chain  = ["10.1.0.0/16"]   # VPC 侧网段
  remote_chain = ["192.168.0.0/16"] # IDC 侧网段
}
```

SPD 策略必须精确匹配两端实际使用的网段，不能包含无关网段，否则会导致 VPN 隧道建立失败或流量不通。

```hcl
# Terraform: VPN 网关 + IPSec 通道
resource "tencentcloud_vpn_gateway" "vpn_gw" {
  name      = "vpn-gateway"
  vpc_id    = tencentcloud_vpc.vpc_a.id
  bandwidth = 100  # Mbps
  zone      = "ap-guangzhou-3"
}

resource "tencentcloud_customer_gateway" "idc_gw" {
  name    = "idc-gateway"
  address = "203.0.113.1"  # IDC VPN 设备公网 IP
}

resource "tencentcloud_vpn_connection" "main" {
  name                = "vpn-to-idc"
  vpc_id              = tencentcloud_vpc.vpc_a.id
  vpn_gateway_id      = tencentcloud_vpn_gateway.vpn_gw.id
  customer_gateway_id = tencentcloud_customer_gateway.idc_gw.id

  pre_share_key = "YourPreSharedKey123!"

  ike_version          = "IKEV2"
  ike_exchange_mode    = "MAIN"
  ike_local_identity   = "ADDRESS"
  ike_remote_identity  = "ADDRESS"
  ike_dh_group_name    = "GROUP2"
  ike_encrypt_algorithm = "AES128"
  ike_auth_algorithm   = "SHA1"
  ike_sa_lifetime_seconds = 86400

  ipsec_encrypt_algorithm = "AES128"
  ipsec_integrity_algorithm = "SHA1"
  ipsec_sa_lifetime_seconds  = 3600
  ipsec_pfs_dh_group         = "GROUP2"
  ipsec_sa_lifetime_traffic  = 2560  # KB

  security_group_policy {
    local_chain  = ["10.1.0.0/16"]
    remote_chain = ["192.168.0.0/16"]
  }
}

# 路由：IDC 网段指向 VPN 网关
resource "tencentcloud_route_table_entry" "to_idc" {
  route_table_id         = tencentcloud_vpc.vpc_a.default_route_table_id
  destination_cidr_block = "192.168.0.0/16"
  next_type              = "vpn_gateway"
  next_hub               = tencentcloud_vpn_gateway.vpn_gw.id
}
```

**VPN 高可用方案：**

腾讯云 VPN 网关支持双机热备，创建时选择 2 个可用区即可实现跨 AZ 高可用：

```hcl
resource "tencentcloud_vpn_gateway" "vpn_ha" {
  name           = "vpn-ha"
  vpc_id         = tencentcloud_vpc.vpc_a.id
  bandwidth      = 200
  zone           = "ap-guangzhou-3"
  vpn_ha_zone    = "ap-guangzhou-4"  # 备用可用区
}
```

在 IDC 侧，同样建议部署两台 VPN 设备做主备，配合 BGP 路由实现自动切换。

### 8.6.3 专线接入（Direct Connect）

专线接入通过物理光纤连接企业 IDC 与腾讯云接入点，提供稳定、低延迟的混合云连接。

**专线架构层级：**

```
IDC ── 物理光纤 ── 腾讯云接入点 ── 专线通道 ── 专线网关 ── VPC/CCN
```

**物理专线：**

物理专线是连接 IDC 与腾讯云接入点的物理光纤链路。腾讯云在全国多个城市设有接入点，企业可以选择最近的接入点接入。物理专线的带宽规格包括 10Mbps、100Mbps、1Gbps、10Gbps、100Gbps。

**专线通道：**

在物理专线上创建逻辑通道，用于区分不同的业务流量。一个物理专线可以创建多个专线通道，每个通道可以连接到不同的专线网关。

**专线网关：**

专线网关是 VPC 侧与专线通道的连接点。腾讯云提供三种专线网关模式：

| 模式 | 连接目标 | 适用场景 |
|------|----------|----------|
| VPC 型 | 单个 VPC | 单一 VPC 需要高带宽专线接入 |
| CCN 型 | CCN 实例 | 多 VPC 通过 CCN 统一接入专线 |
| NAT 型 | 多个 VPC（地址转换） | CIDR 重叠场景，通过 NAT 解决地址冲突 |

**专线 + CCN 混合云架构：**

这是企业级混合云的标准架构——IDC 通过专线接入 CCN，CCN 再将路由下发到所有 VPC：

```hcl
# Terraform: 专线网关 + CCN 接入
resource "tencentcloud_direct_connect_gateway" "dcg" {
  name        = "dcg-ccn"
  network_type = "CCN"
  ccn_id       = tencentcloud_ccn.main.id
}

# 专线通道（需先创建物理专线）
resource "tencentcloud_direct_connect_tunnel" "tunnel" {
  direct_connect_gateway_id = tencentcloud_direct_connect_gateway.dcg.id
  direct_connect_id         = "dc-xxxxxxxx"  # 物理专线 ID
  name                      = "tunnel-to-idc"

  route_type = "BGP"
  bgp_config {
    asn        = 65001
    auth_key   = "bgp-auth-key"
  }
}
```

**BGP 路由：**

专线通道支持静态路由和 BGP 动态路由两种方式。BGP 是推荐方式，优势包括：

- 自动学习 IDC 侧路由变化，无需手动更新
- 支持路由聚合，减少路由条目
- 支持 AS Path 属性控制路由优先级
- 配合 BFD 实现秒级故障检测

**专线 vs VPN 对比：**

| 维度 | 专线 | VPN |
|------|------|-----|
| 延迟 | 稳定（接近物理网络） | 受公网波动影响 |
| 带宽 | 最高 100Gbps | 通常 100Mbps\~1Gbps |
| 可用性 | 99.95%（双专线可达 99.99%） | 99.5% |
| 部署周期 | 数周（需物理施工） | 数小时 |
| 成本 | 高（月租 + 带宽费） | 低 |
| 适用场景 | 核心生产、大流量、低延迟 | 开发测试、灾备、小流量 |

### 8.6.4 混合云最佳实践

**主备模式（专线为主、VPN 为备）：**

```
正常时：IDC ──专线── VPC（主链路）
故障时：IDC ──VPN── VPC（备用链路）
```

通过调整路由优先级实现自动切换：

```hcl
# 专线路由（高优先级）
resource "tencentcloud_route_table_entry" "dc_main" {
  destination_cidr_block = "192.168.0.0/16"
  next_type              = "direct_connect_gateway"
  next_hub               = tencentcloud_direct_connect_gateway.dcg.id
  priority               = 10  # 数值越小优先级越高
}

# VPN 路由（低优先级）
resource "tencentcloud_route_table_entry" "vpn_backup" {
  destination_cidr_block = "192.168.0.0/16"
  next_type              = "vpn_gateway"
  next_hub               = tencentcloud_vpn_gateway.vpn_gw.id
  priority               = 20
}
```

**健康检查与自动切换：**

腾讯云路由表支持健康检查探针，当主链路不可达时自动切换到备用链路。建议在 IDC 侧部署 NQA（Network Quality Analyzer）配合 BFD（Bidirectional Forwarding Detection）实现秒级故障检测。

**双专线冗余：**

对于核心生产业务，建议接入两条物理专线（不同运营商或不同路由），实现链路级冗余：

```
IDC ── 电信专线 ── 腾讯云接入点 A
IDC ── 联通专线 ── 腾讯云接入点 B
```

两条专线通过 BGP 同时发布相同路由，利用 AS Path 长度或 MED 值控制主备切换。

---

## 8.7 NAT 网关

### 8.7.1 为什么需要 NAT 网关

私有子网中的云服务器没有公网 IP，无法主动访问互联网（如 yum 更新、Docker 拉取镜像、调用外部 API、下载模型文件等）。NAT 网关为私有子网提供源地址转换（SNAT），使多个实例共享同一公网 IP 访问互联网。

### 8.7.2 NAT 网关 vs 公网 IP

| 特性 | NAT 网关 | 实例绑定公网 IP |
|------|----------|-----------------|
| 共享 | 多实例共享 | 每实例独立 |
| 管理 | 统一管理 | 分散管理 |
| 成本 | 较低（共享带宽） | 较高（每实例 EIP） |
| 出站 SNAT | 支持 | 支持 |
| 入站访问 | 不支持（需 CLB） | 支持（直接访问） |
| 弹性 | 实例扩缩容不影响 | 需手动绑定/解绑 |

### 8.7.3 NAT 网关配置

```hcl
# Terraform: NAT 网关
resource "tencentcloud_eip" "nat_eip" {
  name = "nat-eip"
}

resource "tencentcloud_nat_gateway" "nat" {
  name        = "nat-gateway"
  vpc_id      = tencentcloud_vpc.vpc_a.id
  zone        = "ap-guangzhou-3"
  max_concurrent = 1000000
  bandwidth    = 500  # Mbps

  assigned_eip_set = [
    tencentcloud_eip.nat_eip.public_ip
  ]
}

# 路由：私网子网默认路由指向 NAT 网关
resource "tencentcloud_route_table" "private_rt" {
  name   = "private-route-table"
  vpc_id = tencentcloud_vpc.vpc_a.id
}

resource "tencentcloud_route_table_entry" "nat_default" {
  route_table_id         = tencentcloud_route_table.private_rt.id
  destination_cidr_block = "0.0.0.0/0"
  next_type              = "nat"
  next_hub               = tencentcloud_nat_gateway.nat.id
}

# 关联子网到该路由表
resource "tencentcloud_route_table_association" "private_subnet" {
  route_table_id = tencentcloud_route_table.private_rt.id
  subnet_id      = tencentcloud_subnet.private_a.id
}
```

### 8.7.4 NAT 网关高可用与容量规划

NAT 网关本身由腾讯云托管，具备多可用区容灾能力。但用户仍需关注以下容量指标：

**并发连接数：**

NAT 网关规格分为 100 万、200 万、500 万、1000 万并发连接数。选择依据：

- 100 万：小型业务，日均请求量 < 1000 万
- 200 万：中型业务，日均请求量 1000 万\~5000 万
- 500 万：大型业务，日均请求量 5000 万\~2 亿
- 1000 万：超大规模业务

**带宽：**

NAT 网关带宽规格为 100Mbps\~1000Mbps。如果业务需要更高出站带宽，可以绑定多个 EIP 实现负载分担。

**最佳实践：**

1. 选择最大并发数满足业务峰值，预留 20% 余量
2. 绑定 2\~4 个 EIP 实现出站 IP 池，避免单 IP 被外部限速
3. 监控 NAT 网关的连接数指标，设置告警阈值（>80% 最大并发）
4. 对于入站流量，使用 CLB 而非 NAT 网关（NAT 网关不支持入站转发）

### 8.7.5 NAT 网关的替代方案

对于某些场景，NAT 网关不是唯一选择：

- **少量实例**：直接为实例绑定 EIP，管理更简单
- **需要入站访问**：使用 CLB + 公网 IP，而非 NAT 网关
- **跨 VPC 访问**：通过 CCN 或 VPC Peering，不经过 NAT
- **容器集群出网**：TKE 集群可以通过 NAT 网关出网，也可以为节点绑定 EIP

---

## 8.8 DNS 解析

### 8.8.1 腾讯云 DNS 体系

腾讯云提供三层 DNS 解析能力：

| 层级 | 服务 | 作用 |
|------|------|------|
| 公网 DNS | DNSPod | 域名解析到公网 IP |
| 私网 DNS | Private DNS | VPC 内私有域名解析 |
| 实例 DNS | VPC 默认 DNS | 实例内 /etc/resolv.conf 自动配置 |

VPC 内每个实例默认的 DNS 服务器地址为 `183.60.83.19` 和 `183.60.82.98`，由腾讯云自动配置，无需用户干预。

### 8.8.2 Private DNS

Private DNS（私有域解析）允许用户在 VPC 内自定义域名解析，实现服务发现。相比在实例中手动编辑 `/etc/hosts`，Private DNS 具有以下优势：

- **集中管理**：所有解析记录在控制台统一管理
- **动态生效**：新增或修改记录后，VPC 内所有实例自动生效
- **跨 VPC 共享**：一个私有域可以绑定到多个 VPC
- **支持多种记录类型**：A、AAAA、CNAME、MX、TXT、PTR

**典型场景：**

- 数据库访问：`mysql.internal` → 10.1.2.100
- 微服务发现：`order-svc.internal` → 10.1.1.50
- 跨 VPC 服务访问：`api.prod.internal` → 10.2.1.10
- 与 IDC 域名统一：`erp.company.com` → 192.168.1.10

```hcl
# Terraform: Private DNS
resource "tencentcloud_private_dns_zone" "internal" {
  domain = "internal.example.com"
  remark = "Internal DNS zone"
  dns_forward_status = "DISABLED"
}

resource "tencentcloud_private_dns_zone_vpc_bind" "bind" {
  zone_id = tencentcloud_private_dns_zone.internal.id
  vpc_set {
    vpc_id    = tencentcloud_vpc.vpc_a.id
    region    = "ap-guangzhou"
  }
}

resource "tencentcloud_private_dns_record" "mysql" {
  zone_id = tencentcloud_private_dns_zone.internal.id
  record_type = "A"
  record_name = "mysql"
  record_value = "10.1.2.100"
  ttl = 600
}

resource "tencentcloud_private_dns_record" "order_svc" {
  zone_id = tencentcloud_private_dns_zone.internal.id
  record_type = "A"
  record_name = "order-svc"
  record_value = "10.1.1.50"
  ttl = 60
}
```

### 8.8.3 DNS 转发

当 VPC 内需要解析 IDC 的私有域名时，可以通过 DNS 转发实现。DNS 转发将 VPC 内的 DNS 查询请求转发到指定的 IDC DNS 服务器：

```hcl
resource "tencentcloud_private_dns_zone" "idc_zone" {
  domain = "idc.internal"
  dns_forward_status = "ENABLED"
  forward_address {
    ip   = "192.168.1.100"  # IDC DNS 服务器
    port = 53
  }
}
```

**DNS 解析链路：**

```
VPC 实例 → VPC 默认 DNS (183.60.83.19) → Private DNS 解析
                                        → DNS 转发 → IDC DNS 服务器
                                        → 公网 DNS (DNSPod)
```

### 8.8.4 服务发现方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| Private DNS | 集中管理、动态生效 | 不支持健康检查 | 通用服务发现 |
| Consul | 健康检查、KV 存储 | 需自行部署维护 | 微服务架构 |
| Kubernetes Service | 自动注册、负载均衡 | 仅限容器环境 | TKE 集群内 |
| /etc/hosts | 简单直接 | 管理分散、不动态 | 临时测试 |

---

## 8.9 弹性网卡与高可用网络

### 8.9.1 弹性网卡（ENI）

弹性网卡（Elastic Network Interface，ENI）是 VPC 中绑定到实例的虚拟网络接口。每个 CVM 实例可以绑定多个 ENI，每个 ENI 可以绑定多个 IP 地址。

**核心能力：**

- **多网卡绑定**：一台 CVM 最多绑定 8 个 ENI（取决于实例规格）
- **多 IP**：每个 ENI 可以绑定多个辅助私网 IP
- **热插拔**：ENI 可以在实例运行中绑定和解绑
- **跨可用区迁移**：ENI 可以解绑后绑定到另一个可用区的实例

**典型用途：**

- **高可用**：Keepalived 主备切换时，将浮动 IP 对应的 ENI 从主节点解绑并绑定到备节点
- **多业务隔离**：不同业务使用不同 ENI，流量在网卡级别隔离
- **管理网络**：管理流量和业务流量走不同 ENI，便于安全审计

### 8.9.2 高可用网络架构

**Keepalived + ENI 高可用：**

```
主 CVM ── ENI(浮动 IP) ── 备 CVM
         (Keepalived 监控)
```

当主 CVM 故障时，Keepalived 触发脚本将 ENI 解绑并绑定到备 CVM，实现 IP 级别的故障转移。切换时间通常在 3\~10 秒。

**CLB 高可用：**

对于生产业务，推荐使用 CLB（Cloud Load Balancer）而非 Keepalived。CLB 本身由腾讯云托管，具备多可用区容灾能力，无需用户管理主备切换逻辑。

---

## 8.10 综合架构案例

### 8.10.1 多 VPC 混合云架构

以下是一个完整的企业级网络架构，包含生产、测试两个 VPC，通过 CCN 互联，并通过专线 + VPN 双链路接入 IDC：

```
                          ┌─────────────────────────────────┐
                          │         腾讯云                   │
                          │  ┌─────────────────────────┐    │
                          │  │  CCN (云联网)             │    │
                          │  └────┬──────────┬──────────┘    │
                          │       │          │               │
                          │  ┌────┴──┐  ┌────┴──┐            │
                          │  │ VPC-Prod │  │ VPC-Test │       │
                          │  │10.1.0.0/16│  │10.2.0.0/16│   │
                          │  └────┬───┘  └────┬───┘          │
                          │       │            │              │
                          │  ┌────┴────┐  ┌───┴────┐        │
                          │  │专线网关 │  │VPN网关  │        │
                          │  └────┬────┘  └───┬────┘        │
                          └───────┼───────────┼──────────────┘
                                  │           │
                          ┌───────┴───────────┴──────────────┐
                          │        公网 / 物理光纤             │
                          └───────┬───────────┬──────────────┘
                                  │           │
                          ┌───────┴────┐  ┌───┴────┐
                          │ 专线路由器 │  │ VPN 设备 │
                          └───────┬────┘  └───┬────┘
                                  │           │
                          ┌───────┴───────────┴──────────────┐
                          │        企业 IDC                   │
                          │  192.168.0.0/16                   │
                          └──────────────────────────────────┘
```

### 8.10.2 完整 Terraform 实现

```hcl
# ============================================
# 腾讯云 VPC 网络架构完整示例
# 包含：VPC、子网、安全组、NAT、CCN、VPN、Private DNS
# ============================================

terraform {
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = "~> 1.80"
    }
  }
}

provider "tencentcloud" {
  region = "ap-guangzhou"
}

# ========== VPC ==========

resource "tencentcloud_vpc" "prod" {
  name       = "vpc-prod"
  cidr_block = "10.1.0.0/16"
}

resource "tencentcloud_vpc" "test" {
  name       = "vpc-test"
  cidr_block = "10.2.0.0/16"
}

# ========== 子网 ==========

resource "tencentcloud_subnet" "prod_web_a" {
  name              = "prod-web-a"
  vpc_id            = tencentcloud_vpc.prod.id
  cidr_block        = "10.1.0.0/24"
  availability_zone = "ap-guangzhou-3"
}

resource "tencentcloud_subnet" "prod_app_a" {
  name              = "prod-app-a"
  vpc_id            = tencentcloud_vpc.prod.id
  cidr_block        = "10.1.1.0/24"
  availability_zone = "ap-guangzhou-3"
}

resource "tencentcloud_subnet" "prod_db_a" {
  name              = "prod-db-a"
  vpc_id            = tencentcloud_vpc.prod.id
  cidr_block        = "10.1.2.0/24"
  availability_zone = "ap-guangzhou-3"
}

resource "tencentcloud_subnet" "prod_web_b" {
  name              = "prod-web-b"
  vpc_id            = tencentcloud_vpc.prod.id
  cidr_block        = "10.1.16.0/24"
  availability_zone = "ap-guangzhou-4"
}

resource "tencentcloud_subnet" "prod_app_b" {
  name              = "prod-app-b"
  vpc_id            = tencentcloud_vpc.prod.id
  cidr_block        = "10.1.17.0/24"
  availability_zone = "ap-guangzhou-4"
}

resource "tencentcloud_subnet" "prod_db_b" {
  name              = "prod-db-b"
  vpc_id            = tencentcloud_vpc.prod.id
  cidr_block        = "10.1.18.0/24"
  availability_zone = "ap-guangzhou-4"
}

# ========== 安全组 ==========

resource "tencentcloud_security_group" "web_sg" {
  name        = "web-sg"
  description = "Web layer - allow HTTP/HTTPS from internet"
}

resource "tencentcloud_security_group_rule" "web_http" {
  security_group_id = tencentcloud_security_group.web_sg.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "TCP"
  port_range        = "80,443"
  policy            = "accept"
}

resource "tencentcloud_security_group" "app_sg" {
  name        = "app-sg"
  description = "App layer - allow traffic from web SG"
}

resource "tencentcloud_security_group_rule" "app_from_web" {
  security_group_id = tencentcloud_security_group.app_sg.id
  type              = "ingress"
  ip_protocol       = "TCP"
  port_range        = "8080-8090"
  policy            = "accept"
  source_security_group_id = tencentcloud_security_group.web_sg.id
}

resource "tencentcloud_security_group" "db_sg" {
  name        = "db-sg"
  description = "DB layer - allow MySQL from app SG"
}

resource "tencentcloud_security_group_rule" "db_mysql" {
  security_group_id = tencentcloud_security_group.db_sg.id
  type              = "ingress"
  ip_protocol       = "TCP"
  port_range        = "3306"
  policy            = "accept"
  source_security_group_id = tencentcloud_security_group.app_sg.id
}

# ========== NAT 网关 ==========

resource "tencentcloud_eip" "nat_eip" {
  name = "nat-eip-prod"
}

resource "tencentcloud_nat_gateway" "prod_nat" {
  name           = "nat-prod"
  vpc_id         = tencentcloud_vpc.prod.id
  zone           = "ap-guangzhou-3"
  max_concurrent = 1000000
  bandwidth      = 500
  assigned_eip_set = [tencentcloud_eip.nat_eip.public_ip]
}

# ========== 路由表 ==========

resource "tencentcloud_route_table" "prod_private" {
  name   = "prod-private-rt"
  vpc_id = tencentcloud_vpc.prod.id
}

resource "tencentcloud_route_table_entry" "nat_default" {
  route_table_id         = tencentcloud_route_table.prod_private.id
  destination_cidr_block = "0.0.0.0/0"
  next_type              = "nat"
  next_hub               = tencentcloud_nat_gateway.prod_nat.id
}

resource "tencentcloud_route_table_association" "app_a" {
  route_table_id = tencentcloud_route_table.prod_private.id
  subnet_id      = tencentcloud_subnet.prod_app_a.id
}

resource "tencentcloud_route_table_association" "app_b" {
  route_table_id = tencentcloud_route_table.prod_private.id
  subnet_id      = tencentcloud_subnet.prod_app_b.id
}

resource "tencentcloud_route_table_association" "db_a" {
  route_table_id = tencentcloud_route_table.prod_private.id
  subnet_id      = tencentcloud_subnet.prod_db_a.id
}

resource "tencentcloud_route_table_association" "db_b" {
  route_table_id = tencentcloud_route_table.prod_private.id
  subnet_id      = tencentcloud_subnet.prod_db_b.id
}

# ========== CCN ==========

resource "tencentcloud_ccn" "main" {
  name        = "main-ccn"
  description = "Main CCN for all VPCs"
  qos         = "AG"
}

resource "tencentcloud_ccn_attachment" "prod_attach" {
  ccn_id          = tencentcloud_ccn.main.id
  instance_type   = "VPC"
  instance_id     = tencentcloud_vpc.prod.id
  instance_region = "ap-guangzhou"
}

resource "tencentcloud_ccn_attachment" "test_attach" {
  ccn_id          = tencentcloud_ccn.main.id
  instance_type   = "VPC"
  instance_id     = tencentcloud_vpc.test.id
  instance_region = "ap-guangzhou"
}

# ========== VPN ==========

resource "tencentcloud_vpn_gateway" "vpn_gw" {
  name      = "vpn-gateway-prod"
  vpc_id    = tencentcloud_vpc.prod.id
  bandwidth = 200
  zone      = "ap-guangzhou-3"
}

resource "tencentcloud_customer_gateway" "idc_gw" {
  name    = "idc-vpn-gateway"
  address = "203.0.113.1"
}

resource "tencentcloud_vpn_connection" "to_idc" {
  name                = "vpn-to-idc"
  vpc_id              = tencentcloud_vpc.prod.id
  vpn_gateway_id      = tencentcloud_vpn_gateway.vpn_gw.id
  customer_gateway_id = tencentcloud_customer_gateway.idc_gw.id
  pre_share_key       = "YourPreSharedKey123!"

  ike_version           = "IKEV2"
  ike_exchange_mode     = "MAIN"
  ike_dh_group_name     = "GROUP2"
  ike_encrypt_algorithm = "AES128"
  ike_auth_algorithm    = "SHA1"

  ipsec_encrypt_algorithm   = "AES128"
  ipsec_integrity_algorithm = "SHA1"
  ipsec_pfs_dh_group        = "GROUP2"

  security_group_policy {
    local_chain  = ["10.1.0.0/16"]
    remote_chain = ["192.168.0.0/16"]
  }
}

# VPN 路由
resource "tencentcloud_route_table_entry" "vpn_to_idc" {
  route_table_id         = tencentcloud_route_table.prod_private.id
  destination_cidr_block = "192.168.0.0/16"
  next_type              = "vpn_gateway"
  next_hub               = tencentcloud_vpn_gateway.vpn_gw.id
}

# ========== Private DNS ==========

resource "tencentcloud_private_dns_zone" "internal" {
  domain = "internal.example.com"
}

resource "tencentcloud_private_dns_zone_vpc_bind" "bind_prod" {
  zone_id = tencentcloud_private_dns_zone.internal.id
  vpc_set {
    vpc_id = tencentcloud_vpc.prod.id
    region = "ap-guangzhou"
  }
}

resource "tencentcloud_private_dns_record" "mysql" {
  zone_id      = tencentcloud_private_dns_zone.internal.id
  record_type  = "A"
  record_name  = "mysql"
  record_value = "10.1.2.100"
  ttl          = 600
}

resource "tencentcloud_private_dns_record" "redis" {
  zone_id      = tencentcloud_private_dns_zone.internal.id
  record_type  = "A"
  record_name  = "redis"
  record_value = "10.1.2.101"
  ttl          = 600
}

# ========== 输出 ==========

output "vpc_prod_id" {
  value = tencentcloud_vpc.prod.id
}

output "ccn_id" {
  value = tencentcloud_ccn.main.id
}

output "vpn_gateway_ip" {
  value = tencentcloud_vpn_gateway.vpn_gw.public_ip
}
```

---

## 8.11 网络运维与监控

### 8.11.1 关键监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| VPC 内网出带宽 | 子网/实例出方向流量 | > 80% 规格 |
| VPC 内网入带宽 | 子网/实例入方向流量 | > 80% 规格 |
| NAT 网关并发连接数 | 当前活跃连接数 | > 80% 最大并发 |
| NAT 网关出带宽 | NAT 出方向流量 | > 80% 带宽规格 |
| VPN 隧道状态 | 隧道是否 UP | 状态 != UP |
| VPN 出入带宽 | 隧道流量 | > 80% 带宽规格 |
| CCN 跨地域带宽 | 地域间流量 | > 80% 购买带宽 |
| 专线状态 | 物理链路是否正常 | 状态 != 正常 |
| 专线延迟 | 端到端延迟 | > 50ms |
| 专线丢包率 | 端到端丢包 | > 0.1% |

### 8.11.2 流日志

VPC 流日志（Flow Logs）记录网络流量元数据，用于安全审计和故障排查。流日志可以捕获以下信息：

- 源 IP 和目的 IP
- 源端口和目的端口
- 协议类型
- 动作（ACCEPT/REJECT）
- 包数量和字节数
- 时间戳

```hcl
resource "tencentcloud_vpc_flow_log" "main" {
  flow_log_name        = "vpc-flow-log"
  resource_type        = "VPC"
  resource_id          = tencentcloud_vpc.prod.id
  traffic_type         = "ALL"     # ACCEPT / REJECT / ALL
  cloud_log_id         = tencentcloud_cls_logset.main.id
  storage_id           = tencentcloud_cls_topic.main.id
  flow_log_description = "VPC flow log for security audit"
}
```

**流日志最佳实践：**

1. 对生产 VPC 开启流日志，记录所有流量（ALL）
2. 将流日志投递到 CLS（日志服务），设置合理的保存周期（建议 180 天）
3. 定期分析 REJECT 流量，发现异常扫描行为
4. 使用 CLS 的 SQL 分析能力，快速定位故障流量

### 8.11.3 常见故障排查

**场景一：跨 VPC 无法互通**

排查步骤：

1. 检查 CCN 路由表是否已学习到对端 VPC 路由：在 CCN 控制台查看路由表
2. 检查安全组入站/出站规则是否放行：确认对端实例的安全组允许本端 IP 访问
3. 检查网络 ACL 规则：确认子网关联的 ACL 没有拒绝流量
4. 确认两端 CIDR 无重叠：重叠 CIDR 会导致路由冲突
5. 检查 CCN 带宽是否充足：跨地域 CCN 需要购买带宽包

**场景二：VPN 隧道不稳定**

排查步骤：

1. 检查 IDC 侧防火墙是否放行 UDP 500/4500 端口
2. 检查 IKE 和 IPSec 参数是否两端一致（常见原因：DH 组不匹配、加密算法不一致）
3. 检查公网链路质量（丢包率、延迟）：使用 mtr 或 ping 检测
4. 确认预共享密钥一致
5. 检查 SPD 策略是否精确匹配两端网段
6. 查看 VPN 隧道日志：腾讯云控制台提供详细的隧道协商日志

**场景三：NAT 网关访问超时**

排查步骤：

1. 检查私网子网路由表是否指向 NAT 网关：`0.0.0.0/0 -> NAT_GATEWAY`
2. 检查 NAT 网关并发连接数是否超限：查看监控指标
3. 检查安全组出站规则：确认实例安全组允许出站流量
4. 确认 EIP 未被封禁：检查 EIP 状态
5. 检查目标服务是否可达：在实例中直接 curl 测试

**场景四：DNS 解析异常**

排查步骤：

1. 检查实例 DNS 配置：`cat /etc/resolv.conf` 确认 DNS 服务器地址
2. 测试 DNS 解析：`nslookup mysql.internal`
3. 检查 Private DNS 绑定关系：确认私有域已绑定到 VPC
4. 检查 DNS 转发配置：确认转发地址可达
5. 检查域名是否存在冲突：公网域名和私有域名冲突时，私有域名优先

### 8.11.4 网络变更管理

网络变更（路由修改、安全组规则变更、CCN 配置变更）可能影响大量业务。建议：

1. **所有变更走 Terraform**：通过代码审查和 CI/CD 流水线
2. **先小范围验证**：先在测试 VPC 验证，再应用到生产 VPC
3. **变更窗口**：网络变更安排在业务低峰期
4. **回滚方案**：每次变更前确认回滚步骤
5. **变更记录**：记录每次变更的时间、原因、操作人

---

## 8.12 成本优化

### 8.12.1 网络成本构成

腾讯云网络成本主要包括：

| 组件 | 计费方式 | 优化建议 |
|------|----------|----------|
| NAT 网关 | 实例费 + 带宽费 | 选择合适的并发规格，避免过度配置 |
| VPN 网关 | 实例费 + 带宽费 | 按需选择带宽，避免闲置 |
| CCN | 跨地域流量费 | 优化跨地域通信模式，减少不必要的跨地域流量 |
| 专线 | 端口费 + 带宽费 | 选择合理的带宽规格，避免过度配置 |
| 公网 IP | IP 占用费 + 流量费 | 及时释放未绑定的 EIP |
| 共享带宽包 | 带宽费 | 多个 EIP 加入共享带宽包，降低单价 |

### 8.12.2 成本优化策略

**NAT 网关优化：**

- 选择合适的并发规格，避免过度配置
- 多个 EIP 加入共享带宽包，降低带宽单价
- 监控 NAT 网关利用率，及时降配

**跨地域流量优化：**

- 将频繁通信的服务部署在同一地域
- 使用 CCN 的带宽包模式（月 95）应对突发流量
- 对于非实时数据同步，使用离线传输工具（如 COS 跨地域复制）

**公网 IP 优化：**

- 及时释放未绑定的 EIP（EIP 未绑定时按小时收费）
- 使用共享带宽包替代按流量计费
- 对于出站流量大的业务，使用共享带宽包的月 95 计费模式

---

## 8.13 总结

本章系统介绍了腾讯云 VPC 网络架构的核心组件与设计方法：

- **CIDR 规划**是网络设计的起点，合理的地址分配为后续扩展奠定基础。建议按业务和环境维度编码，预留扩展空间，避免 CIDR 重叠
- **子网设计**需综合考虑可用区分布、访问属性和业务分层。跨 AZ 部署是高可用的基石，分层设计是安全隔离的基础
- **安全组与网络 ACL**分别工作在实例级和子网级，配合使用实现纵深防御。安全组有状态、配置简单；网络 ACL 无状态、支持拒绝策略
- **多 VPC 互联**场景下，CCN 优于 VPC Peering，尤其在中大规模部署中。CCN 支持传递性、自动路由、跨账号、带宽控制
- **混合云接入**推荐专线为主、VPN 为备的主备模式。专线稳定低延迟，VPN 快速部署成本低，两者配合实现高可用
- **NAT 网关**为私网实例提供共享出网能力，需关注并发连接数和带宽规格
- **Private DNS** 实现 VPC 内服务发现，降低配置耦合，支持 DNS 转发到 IDC

通过 Terraform 基础设施即代码的方式，可以将上述设计标准化、版本化，实现网络架构的自动化部署与持续演进。在实际项目中，建议结合企业自身的合规要求、业务规模和团队能力，灵活选择上述组件的组合方案。

网络架构是云上业务的基石——设计阶段的投入，会在后续的运维、排障、扩展中持续产生回报。一个经过深思熟虑的网络架构，可以让团队在业务快速增长时从容应对，而不是在地址耗尽、路由冲突、安全漏洞中疲于奔命。
