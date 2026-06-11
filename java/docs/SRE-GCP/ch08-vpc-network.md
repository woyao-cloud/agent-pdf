# 第 8 章 VPC 网络设计

## 8.1 为什么 VPC 设计很重要？

### 一个故事：网络设计混乱的代价

某公司有 5 个 GCP 项目——开发、测试、预发布、生产、数据分析。每个项目都使用默认的 VPC 网络，IP 地址段都是 `10.0.0.0/16`。

一开始没什么问题，因为各项目之间不需要通信。但后来业务需求变了——生产环境需要访问数据分析项目中的 BigQuery 数据集，测试环境需要和生产环境的数据库同步数据。

这时问题来了：**所有项目的 IP 地址段都一样，无法建立 VPC 对等连接。** 团队不得不重新规划 IP 地址空间，重建所有 VPC 网络，迁移所有资源——花了整整两周时间。

**教训：** 网络设计要从一开始就做好规划，不然后续改造成本极高。

### VPC 网络的基础概念

VPC（Virtual Private Cloud）网络是 GCP 网络的基础。每个 GCP 项目默认都有一个 VPC 网络，你的所有资源都运行在这个网络中。

**VPC 网络的关键特性：**

- **全局性**：VPC 网络是全球性的，不是区域性的。一个 VPC 网络可以包含多个 Region 的子网
- **隔离性**：不同 VPC 网络之间默认隔离，不能直接通信
- **可扩展性**：VPC 网络支持动态扩展，不需要预先规划 IP 地址
- **安全性**：通过防火墙规则控制进出流量

---

## 8.2 VPC 设计模式

### 模式一：单一 VPC

**结构：** 所有资源放在一个 VPC 网络中。

```
┌─────────────────────────────────────┐
│  项目: my-project                    │
│  VPC: default                        │
│  ├─ us-central1 子网: 10.0.1.0/24   │
│  │  ├─ GKE 集群                      │
│  │  └─ Cloud SQL 实例                │
│  ├─ europe-west1 子网: 10.0.2.0/24  │
│  │  └─ Compute Engine 实例           │
│  └─ asia-east1 子网: 10.0.3.0/24    │
│     └─ Cloud Run 服务                │
└─────────────────────────────────────┘
```

**优点：** 简单，管理成本低。

**缺点：** 缺乏隔离，所有资源在同一个网络中。

**适用场景：** 小型团队、开发测试环境、单一应用。

### 模式二：共享 VPC（Shared VPC）

**结构：** 由一个项目（主机项目）创建 VPC 网络，其他项目（服务项目）共享这个网络中的子网。

```
┌─────────────────────────────────────────────┐
│  主机项目: network-host                      │
│  VPC: shared-vpc                             │
│  ├─ us-central1 子网: 10.0.1.0/24           │
│  ├─ europe-west1 子网: 10.0.2.0/24          │
│  └─ asia-east1 子网: 10.0.3.0/24            │
└──────────────────┬──────────────────────────┘
                    │ 共享
    ┌───────────────┼───────────────┐
    │               │               │
┌───┴───────┐ ┌─────┴─────┐ ┌─────┴──────┐
│ 项目: prod │ │ 项目: staging│ │ 项目: dev  │
│ 使用子网   │ │ 使用子网   │ │ 使用子网   │
│ 10.0.1.0/24│ │ 10.0.2.0/24│ │ 10.0.3.0/24│
└───────────┘ └───────────┘ └────────────┘
```

**优点：**
- 网络由中央团队统一管理
- 各项目之间天然互通
- IP 地址空间统一规划
- 防火墙规则集中管理

**缺点：** 需要额外的组织级配置。

**适用场景：** 大型企业、多项目组织、需要中央网络管理的场景。

**Terraform 配置示例：**

```hcl
# 主机项目：创建共享 VPC
resource "google_compute_shared_vpc_host_project" "host" {
  project = "network-host-project"
}

# 共享 VPC 中的子网
resource "google_compute_subnetwork" "shared_subnet" {
  name          = "shared-subnet-us-central1"
  ip_cidr_range = "10.0.1.0/24"
  region        = "us-central1"
  network       = google_compute_network.shared_vpc.id
}

resource "google_compute_network" "shared_vpc" {
  name                    = "shared-vpc"
  auto_create_subnetworks = false
}

# 服务项目：关联到共享 VPC
resource "google_compute_shared_vpc_service_project" "service" {
  host_project    = "network-host-project"
  service_project = "prod-project"
}
```

### 模式三：VPC 对等连接（VPC Peering）

**结构：** 将两个项目中的 VPC 网络连接起来，让彼此的资源可以互相通信。

```
┌─────────────────┐         ┌─────────────────┐
│ 项目: prod       │         │ 项目: analytics  │
│ VPC: prod-vpc    │◄──────►│ VPC: analytics-  │
│ 10.0.1.0/24      │  Peering│ vpc              │
│                  │         │ 10.0.2.0/24      │
└─────────────────┘         └─────────────────┘
```

**优点：**
- 网络保持独立，但可以通信
- 不需要共享 VPC 的中央管理
- 适合跨组织协作

**缺点：**
- IP 地址不能重叠（这是最常见的坑）
- 对等连接不是传递性的（A 和 B 对等，B 和 C 对等，但 A 不能通过 B 访问 C）
- 每个 VPC 最多建立 25 个对等连接

**适用场景：** 跨项目通信、与合作伙伴网络连接。

**gcloud 配置命令：**

```bash
# 在项目 A 中创建对等连接
gcloud compute networks peerings create prod-to-analytics \
    --network prod-vpc \
    --peer-project analytics-project \
    --peer-network analytics-vpc \
    --auto-create-routes

# 在项目 B 中创建对等连接（双向都需要配置）
gcloud compute networks peerings create analytics-to-prod \
    --network analytics-vpc \
    --peer-project prod-project \
    --peer-network prod-vpc \
    --auto-create-routes
```

---

## 8.3 防火墙规则设计

### 防火墙规则的基本原则

GCP VPC 防火墙规则是**有状态的**——这意味着如果允许入站流量，出站响应流量会自动被允许，不需要额外配置。

**默认规则：**

| 方向 | 行为 | 说明 |
|------|------|------|
| 入站 | 拒绝所有 | 默认拒绝所有入站流量 |
| 出站 | 允许所有 | 默认允许所有出站流量 |

### 防火墙规则设计示例

```bash
# 1. 允许健康检查流量（所有项目都需要）
gcloud compute firewall-rules create allow-health-checks \
    --network prod-vpc \
    --source-ranges 35.191.0.0/16,130.211.0.0/22 \
    --target-tags http-server \
    --allow tcp:80,tcp:443

# 2. 允许 SSH 管理访问（仅限堡垒机）
gcloud compute firewall-rules create allow-ssh-from-bastion \
    --network prod-vpc \
    --source-ranges 10.0.100.0/24 \
    --target-tags ssh-access \
    --allow tcp:22

# 3. 允许内部通信
gcloud compute firewall-rules create allow-internal \
    --network prod-vpc \
    --source-ranges 10.0.0.0/8 \
    --allow tcp,udp,icmp

# 4. 拒绝所有其他入站流量（默认已存在，但显式声明更安全）
gcloud compute firewall-rules create deny-all-ingress \
    --network prod-vpc \
    --source-ranges 0.0.0.0/0 \
    --deny all \
    --priority 65535
```

### 防火墙规则设计原则

| 原则 | 说明 | 示例 |
|------|------|------|
| 最小权限 | 只开放必要的端口和来源 | 只允许特定 IP 访问 SSH |
| 使用标签 | 通过标签控制规则的适用范围 | `target-tags=http-server` |
| 优先级管理 | 低优先级数字 = 高优先级 | 拒绝规则优先级最高（65535） |
| 日志记录 | 对关键规则开启日志 | 记录被拒绝的流量 |

---

## 8.4 混合云网络连接

### Cloud VPN

通过公共互联网建立的加密隧道连接你的本地网络和 GCP VPC。

```bash
# 创建 Cloud VPN 网关
gcloud compute target-vpn-gateways create on-prem-gateway \
    --network prod-vpc \
    --region us-central1

# 创建静态 IP
gcloud compute addresses create vpn-static-ip \
    --region us-central1

# 创建 VPN 隧道
gcloud compute vpn-tunnels create tunnel-to-on-prem \
    --region us-central1 \
    --peer-address <本地 VPN 网关公网 IP> \
    --shared-secret <预共享密钥> \
    --target-vpn-gateway on-prem-gateway \
    --ike-version 2

# 创建路由
gcloud compute routes create route-to-on-prem \
    --network prod-vpc \
    --destination-range 192.168.0.0/16 \
    --next-hop-vpn-tunnel tunnel-to-on-prem \
    --next-hop-vpn-tunnel-region us-central1
```

**Cloud VPN 的局限性：**
- 带宽上限：通常不超过 3Gbps（单个隧道）
- 延迟：取决于公共互联网的质量
- 可靠性：依赖公共互联网

### Cloud Interconnect

通过专线或合作伙伴网络直接连接到 Google 的网络。

```bash
# 创建 VLAN 连接
gcloud compute interconnects attachments create prod-attachment \
    --region us-central1 \
    --interconnect <Interconnect ID> \
    --vlan-tag-802-1q 100 \
    --router <Cloud Router 名称>
```

**Cloud Interconnect 的优势：**
- 带宽：10Gbps 或更多
- 延迟：更低、更稳定
- 可靠性：不经过公共互联网

**选择建议：**

| 需求 | 推荐方案 | 月成本估算 |
|------|---------|-----------|
| 带宽 < 3Gbps，对延迟不敏感 | Cloud VPN | ~$50 |
| 带宽 > 3Gbps，需要稳定连接 | Cloud Interconnect | ~$500+ |
| 临时连接，快速开通 | Cloud VPN | 按需付费 |
| 长期稳定连接 | Cloud Interconnect | 承诺使用折扣 |

---

## 8.5 一个完整场景：企业级 VPC 设计

### 需求

某金融企业需要在 GCP 上搭建生产环境，要求：
- 多个项目（生产、测试、开发、安全）共享网络
- 生产环境与本地数据中心通过专线连接
- 不同环境之间严格隔离
- 所有出站流量经过安全设备

### 架构设计

```
                    ┌──────────────────────┐
                    │  本地数据中心         │
                    │  192.168.0.0/16      │
                    └─────────┬────────────┘
                              │ Cloud Interconnect
                    ┌─────────┴────────────┐
                    │  主机项目: network    │
                    │  VPC: shared-prod-vpc │
                    │  10.0.0.0/16         │
                    │                      │
                    │  子网规划:            │
                    │  10.0.1.0/24 生产     │
                    │  10.0.2.0/24 测试     │
                    │  10.0.3.0/24 开发     │
                    │  10.0.100.0/24 堡垒机  │
                    │  10.0.200.0/24 安全   │
                    └──┬───────┬───────┬──┘
                        │       │       │
              ┌─────────┘       │       └─────────┐
              │                 │                 │
    ┌─────────┴───────┐ ┌──────┴──────┐ ┌────────┴──────┐
    │ 项目: prod      │ │ 项目: test  │ │ 项目: dev     │
    │ 子网: 10.0.1.0  │ │ 10.0.2.0   │ │ 10.0.3.0      │
    │ GKE + Cloud SQL │ │ GKE         │ │ GKE           │
    └─────────────────┘ └─────────────┘ └───────────────┘
```

### 关键配置

**1. IP 地址规划：**

| 用途 | CIDR | 说明 |
|------|------|------|
| 生产环境 | 10.0.1.0/24 | 254 个 IP，足够生产使用 |
| 测试环境 | 10.0.2.0/24 | 与生产隔离 |
| 开发环境 | 10.0.3.0/24 | 与生产隔离 |
| 堡垒机 | 10.0.100.0/24 | 管理入口 |
| 安全设备 | 10.0.200.0/24 | 出站流量代理 |
| 本地数据中心 | 192.168.0.0/16 | 通过 Interconnect 连接 |

**2. 防火墙规则：**

```bash
# 只允许堡垒机 SSH 访问生产环境
gcloud compute firewall-rules create allow-ssh-from-bastion \
    --network shared-prod-vpc \
    --source-ranges 10.0.100.0/24 \
    --target-tags prod-ssh \
    --allow tcp:22

# 生产环境出站流量经过安全设备
gcloud compute firewall-rules create route-traffic-to-security \
    --network shared-prod-vpc \
    --destination-ranges 0.0.0.0/0 \
    --target-tags prod-instances \
    --allow tcp,udp \
    --direction EGRESS
```

**3. 网络隔离：**

```bash
# 不同环境之间默认隔离（通过防火墙规则控制）
# 只允许生产环境访问本地数据中心
gcloud compute firewall-rules create allow-prod-to-onprem \
    --network shared-prod-vpc \
    --source-ranges 10.0.1.0/24 \
    --destination-ranges 192.168.0.0/16 \
    --allow tcp,udp \
    --direction EGRESS
```

---

## 8.6 反模式：VPC 设计中的常见错误

### 反模式一：IP 地址不规划

**表现**：使用默认 VPC 的自动分配 IP 地址，不规划 IP 地址空间。

**后果**：后续需要 VPC 对等连接或混合云连接时，发现 IP 地址冲突，需要重建网络。

**正确的做法**：从一开始就规划好 IP 地址空间，为每个环境分配独立的 CIDR 段。

### 反模式二：所有环境共用一个 VPC

**表现**：生产、测试、开发环境都在同一个 VPC 网络中。

**后果**：缺乏隔离，测试环境的误操作可能影响生产环境。

**正确的做法**：使用共享 VPC 但为不同环境分配不同的子网，通过防火墙规则实现隔离。

### 反模式三：防火墙规则过于宽松

**表现**：防火墙规则使用 `0.0.0.0/0` 作为来源，开放所有端口。

**后果**：资源暴露在互联网上，安全风险极高。

**正确的做法**：遵循最小权限原则，只开放必要的端口和来源。

### 反模式四：忽略 VPC 对等连接的非传递性

**表现**：A 和 B 对等，B 和 C 对等，以为 A 可以通过 B 访问 C。

**后果**：A 无法访问 C，需要排查半天才发现是对等连接的非传递性导致的。

**正确的做法**：理解 VPC 对等连接的非传递性。如果需要 A 访问 C，需要建立 A 和 C 的直接对等连接，或者使用共享 VPC。

---

## 8.7 速查总结

### VPC 设计模式选择速查

| 模式 | 隔离性 | 管理复杂度 | 适用规模 |
|------|--------|-----------|---------|
| 单一 VPC | 低 | 低 | 小（1-2 个项目） |
| 共享 VPC | 中 | 中 | 中（3-10 个项目） |
| VPC 对等连接 | 高 | 高 | 大（10+ 项目） |

### 混合云连接选择速查

| 方案 | 带宽 | 延迟 | 成本 | 开通时间 |
|------|------|------|------|---------|
| Cloud VPN | < 3Gbps | 中 | 低 | 小时级 |
| Cloud Interconnect | 10Gbps+ | 低 | 高 | 周级 |

### 防火墙规则设计原则

| 原则 | 说明 |
|------|------|
| 最小权限 | 只开放必要的端口和来源 |
| 使用标签 | 通过标签控制规则的适用范围 |
| 优先级管理 | 拒绝规则优先级最高 |
| 日志记录 | 对关键规则开启日志 |
| 定期审计 | 定期检查是否有过于宽松的规则 |

### 每周网络检查清单

- [ ] 防火墙规则是否有过于宽松的配置？
- [ ] VPC 对等连接是否正常？
- [ ] Cloud VPN/Interconnect 的连接状态是否正常？
- [ ] 是否有未使用的公网 IP？
- [ ] 网络流量是否有异常增长？

---

> **下一章预告：** VPC 网络设计好了，接下来我们需要把流量引入到服务中。第 9 章将介绍 GCP 的全局负载均衡器——如何配置健康检查、实现区域故障切换、以及排查常见的 502/503 错误。
