# 第9章 腾讯云负载均衡（CLB）实战

## 9.1 概述

负载均衡是云原生架构中不可或缺的流量分发组件。腾讯云负载均衡（Cloud Load Balancer，CLB）作为流量入口，将来自公网或内网的请求分发到多个后端服务器（CVM、TKE 容器等），从而消除单点故障、提升系统吞吐量，并为弹性伸缩提供流量锚点。在微服务架构、容器化部署和混合云场景下，CLB 更是承担着服务发现、流量治理和故障隔离的关键角色。

本章从架构原理出发，覆盖 CLB 的公网/内网类型、四层（TCP/UDP）与七层（HTTP/HTTPS）协议、健康检查配置、全局负载均衡（GSLB）、性能规格，以及基于 Terraform 的基础设施即代码实践，帮助读者在生产环境中正确选型、配置与运维 CLB。同时，本章还将深入探讨 CLB 与 TKE 容器集群的集成、访问日志管理、CAM 权限控制、Anycast 加速、跨地域绑定等进阶话题，为读者提供全方位的 CLB 知识体系。

## 9.2 CLB 架构与核心概念

### 9.2.1 逻辑架构

腾讯云 CLB 采用**主备集群 + 分布式转发**架构，确保单点故障不影响整体服务：

- **VIP（Virtual IP）**：CLB 实例的入口 IP，公网 CLB 的 VIP 由腾讯云自动分配，内网 CLB 的 VIP 由用户在 VPC 子网中指定。VIP 通过 BGP 协议在多台转发服务器间漂移，实现高可用。
- **转发集群**：一组高性能转发节点，基于 DPDK（Data Plane Development Kit）技术实现用户态网络包处理，绕过内核协议栈，显著提升转发性能。转发集群负责接收流量、执行健康检查、按调度算法分发请求。
- **后端 RS（Real Server）**：实际处理请求的 CVM 或弹性网卡（ENI），通过内网与 CLB 通信。RS 可以跨多个可用区部署，实现可用区级容灾。
- **控制面**：配置管理服务，负责同步监听器、健康检查、会话保持等规则到转发集群。控制面采用最终一致性模型，配置下发通常在秒级完成。

### 9.2.2 关键术语

| 术语 | 说明 |
|------|------|
| CLB 实例 | 一个负载均衡器实体，绑定 VIP、地域、网络类型 |
| 监听器（Listener） | 监听特定协议和端口的规则集合，一个 CLB 实例可配置多个监听器 |
| 转发规则（Rule） | 七层监听器下的域名 + URL 匹配规则，支持精确匹配、前缀匹配和泛域名 |
| 后端服务（Backend） | RS 组，包含多个 CVM 实例和端口，支持按权重分配流量 |
| 虚拟服务组 | 后端 RS 的逻辑分组，支持跨可用区绑定，便于统一管理同一组 RS |
| 会话保持（Session Persistence） | 将同一客户端的请求始终转发到同一台 RS，保证状态一致性 |
| 健康检查（Health Check） | 定期探测 RS 状态，自动摘除异常 RS 并恢复健康 RS |

### 9.2.3 数据面与控制面分离

腾讯云 CLB 采用数据面与控制面分离的架构设计。数据面转发集群运行在独立的物理服务器上，不依赖控制面组件。即使控制面短暂不可用，已有配置的流量转发不受影响。这种架构设计保证了 CLB 在控制面升级或故障期间仍能持续转发流量，满足生产环境对高可用性的严苛要求。

## 9.3 公网 CLB 与内网 CLB

### 9.3.1 公网 CLB

公网 CLB 绑定公网 VIP，接收来自互联网的请求。适用于 Web 站点、API 网关、移动端接入等场景。

**特点：**

- 腾讯云自动分配公网 VIP（支持 IPv4 和 IPv6 双栈）。
- 可配合 DNS 解析实现域名接入，支持 A 记录和 CNAME 两种方式。
- 支持绑定弹性公网 IP（EIP），实现 VIP 固定，避免实例释放后 IP 变更。
- 默认提供 DDoS 基础防护（2 Gbps），可按需开启高防 IP 或 DDoS 高防包。
- 公网 CLB 的带宽上限决定了实例的最大吞吐能力，超出后会产生丢包。

**适用场景：**

- 面向公网的 Web 应用（电商、门户、SaaS）。
- 移动 App 的 API 后端。
- 游戏、直播等低延迟公网接入。
- 微信小程序后端服务。

### 9.3.2 内网 CLB

内网 CLB 仅分配内网 VIP，只能在 VPC 内部或通过专线/VPN 访问。不经过公网，延迟更低、安全性更高。

**特点：**

- VIP 在 VPC 子网范围内分配，支持指定 IP 地址，便于与现有 DNS 和防火墙规则集成。
- 不产生公网带宽费用，仅按实例数量计费（内网 CLB 实例本身免费）。
- 天然隔离公网攻击面，无需额外安全防护。
- 内网 CLB 的带宽无上限，受限于后端 RS 和 VPC 网络能力。

**适用场景：**

- 微服务间 RPC 调用（服务发现 + 负载均衡）。
- 数据库中间件层（Redis / MySQL Proxy）的流量分发。
- 多层架构中 Web 层到应用层的内部转发。
- TKE 容器集群的 Service 接入层。

### 9.3.3 选型对比

| 维度 | 公网 CLB | 内网 CLB |
|------|----------|----------|
| VIP 类型 | 公网 IP（自动分配或 EIP） | VPC 内网 IP |
| 公网带宽 | 按带宽或流量计费 | 无 |
| 安全风险 | 暴露于公网，需 WAF/高防 | 仅内网可达 |
| 延迟 | 增加公网链路跳数 | 纯内网，延迟最低 |
| 典型场景 | Web/API/移动端 | 微服务/中间件 |
| 带宽上限 | 受实例规格限制 | 无上限 |
| 费用 | 按带宽/流量计费 | 实例免费 |

## 9.4 四层负载均衡（TCP/UDP）

### 9.4.1 工作原理

四层 CLB 在传输层工作，仅解析 TCP/UDP 报文头，不查看应用层内容。采用 **NAT 模式** 或 **DPDK 用户态转发** 实现高吞吐转发。DPDK 技术绕过了 Linux 内核协议栈，直接在用户态处理网络报文，将转发延迟降低到微秒级别。

**核心流程：**

1. 客户端向 VIP:Port 发起 TCP 连接或 UDP 报文。
2. CLB 根据调度算法选择一台后端 RS。
3. CLB 将报文的目的 IP 和端口改写为 RS 的内网 IP 和端口（SNAT/DNAT）。
4. RS 处理请求后，回包经 CLB 返回客户端（NAT 模式），或直接回源（DSR 模式，腾讯云默认 NAT 模式）。

在 NAT 模式下，所有流量都经过 CLB 转发，CLB 成为流量路径上的关键节点。DSR 模式下，入站流量经过 CLB，出站流量直接从 RS 返回客户端，减轻 CLB 的出站带宽压力，但要求 RS 支持 lo 接口上配置 VIP。

### 9.4.2 调度算法

| 算法 | 说明 | 适用场景 |
|------|------|----------|
| 加权轮询（WRR） | 按权重轮流分配连接 | 通用场景，RS 规格一致 |
| 加权最小连接数（WLC） | 优先分配给活跃连接数最少的 RS | 长连接场景，连接持续时间不均 |
| 源地址哈希（IP Hash） | 对源 IP 哈希，固定分配到同一 RS | 需要会话保持的场景 |

**算法选择建议：**

- 后端 RS 配置均匀且请求处理时间相近时，选择加权轮询即可。
- 请求处理时间差异较大（如部分请求涉及复杂计算，部分请求为简单查询），选择加权最小连接数更优。
- 需要基于 IP 的会话保持时，选择源地址哈希，但需注意 NAT 环境下多个用户可能共享同一公网 IP。

### 9.4.3 TCP 监听器配置要点

```
协议端口：TCP : 80
调度算法：加权轮询
会话保持：关闭（TCP 层无需 Cookie 保持）
健康检查：TCP : 8080（后端健康探测端口）
超时时间：连接空闲超时 300s（默认）
```

**关键参数：**

- **连接空闲超时**：TCP 连接无数据传输时的最大保持时间，超时后 CLB 主动断开 FIN。长连接场景建议调大（如 900s），短连接场景保持默认即可。
- **最大连接数**：单实例 TCP 连接上限，取决于实例规格。共享型 50 万，标准型 200 万，高性能型 500 万，超高性能型 1000 万。
- **带宽上限**：公网 CLB 的带宽上限，超出后丢包。需根据业务峰值流量配置，建议预留 20% 余量。

### 9.4.4 UDP 监听器注意事项

UDP 无连接状态，CLB 基于五元组（源 IP、源端口、目的 IP、目的端口、协议）做会话保持。适用于 DNS、QUIC、音视频流等场景。

**限制：**

- UDP 健康检查仅支持探测端口可达性，无法验证应用状态。CLB 发送 UDP 探测报文后，若收到 ICMP Port Unreachable 则判定为异常，否则默认健康。
- 无连接超时概念，CLB 基于报文流老化（默认 60s 无报文则清除会话）。
- UDP 不保证报文顺序和可靠传输，应用层需自行处理丢包和重传。

## 9.5 七层负载均衡（HTTP/HTTPS）

### 9.5.1 工作原理

七层 CLB 在应用层工作，能够解析 HTTP 请求的域名、URL、Header、Cookie 等信息，实现精细化流量分发。七层 CLB 内部维护了一个 HTTP 连接池，与后端 RS 之间复用长连接，减少 RS 端的连接建立开销。

**核心能力：**

- **域名 + URL 路由**：根据 Host 和 Path 将请求转发到不同的后端服务，实现多站点共享同一 CLB 实例。
- **HTTPS 卸载**：在 CLB 上终结 TLS，后端 RS 无需处理加解密，降低 RS 的 CPU 开销。TLS 握手由 CLB 高性能集群处理，单实例可支持数十万级 TLS 握手。
- **HTTP 头部改写**：支持添加、修改、删除请求/响应头，用于传递客户端真实 IP（X-Forwarded-For）、协议（X-Forwarded-Proto）等信息。
- **重定向**：HTTP 自动跳转 HTTPS，或 URL 重定向（301/302）。
- **自定义错误页面**：502/503 等错误返回自定义页面，提升用户体验。
- **CORS 跨域支持**：支持配置跨域资源共享策略。

### 9.5.2 转发规则匹配

七层监听器支持配置多条转发规则，每条规则由 **域名** 和 **URL 路径** 组成：

```
example.com/api/*    → 后端组 A（API 服务）
example.com/static/* → 后端组 B（静态资源）
api.example.com/*    → 后端组 C（独立 API 域名）
```

**匹配优先级：**

1. 精确域名 > 泛域名（`*.example.com`）。精确域名完全匹配时优先于泛域名。
2. 最长 URL 前缀匹配。例如 `/api/v2/users` 优先匹配 `/api/v2/` 而非 `/api/`。
3. 默认规则（`/`）兜底。所有未匹配的请求由默认规则处理。

**泛域名支持：**

七层 CLB 支持泛域名匹配，例如 `*.example.com` 可以匹配 `a.example.com`、`b.example.com` 等所有子域名。泛域名规则优先级低于精确域名规则。

### 9.5.3 HTTPS 配置

HTTPS 监听器需要绑定 SSL 证书，腾讯云 CLB 支持以下证书来源：

- **腾讯云 SSL 证书服务**：自动续签，推荐使用。支持免费 DV 证书和付费 OV/EV 证书。
- **上传自有证书**：支持 PEM 格式，需同时上传证书内容和私钥。
- **Secret Manager 托管**：通过凭据管理系统动态获取，适合证书轮换频繁的场景。

**TLS 版本与加密套件：**

```
TLS 版本：TLSv1.2、TLSv1.3（推荐仅开启 1.2 和 1.3）
加密套件：ECDHE-RSA-AES128-GCM-SHA256（前向安全性优先）
```

**HTTPS 卸载优势：**

- RS 端无需部署证书，降低运维成本。证书统一在 CLB 层管理，变更时无需逐个登录 RS 更新。
- TLS 握手由 CLB 高性能集群处理，支持大规模并发。RS 的 CPU 资源可以全部用于业务处理。
- 可在 CLB 层统一控制安全策略（HSTS、TLS 版本、加密套件优先级），实现安全策略的集中管控。
- 支持双向 TLS 认证（mTLS），CLB 验证客户端证书，适用于金融、政务等高安全场景。

### 9.5.4 HTTP/2 与 gRPC

腾讯云 CLB 七层监听器支持 HTTP/2 和 gRPC：

- **HTTP/2**：多路复用、头部压缩（HPACK）、服务器推送，显著提升页面加载性能。在弱网环境下效果尤为明显。
- **gRPC**：基于 HTTP/2 的 RPC 框架，CLB 支持 gRPC 流量透传。gRPC 使用 Protobuf 序列化，性能优于 JSON。

**配置注意：** 开启 HTTP/2 后，CLB 与客户端之间使用 HTTP/2 协议，CLB 与后端 RS 之间仍为 HTTP/1.1。这意味着 RS 无需支持 HTTP/2，降低了迁移成本。

### 9.5.5 常见七层配置示例

```
监听器：HTTPS : 443
证书：example.com（腾讯云 SSL 证书）
默认规则：/ → 后端组 Web（端口 8080）
规则 1：api.example.com /v1/* → 后端组 API（端口 8081）
规则 2：example.com /static/* → 后端组 Static（端口 8082）
HTTP/2：开启
HTTP 自动跳转 HTTPS：开启
X-Forwarded-For：开启（传递客户端真实 IP）
X-Forwarded-Proto：开启（传递原始协议）
```

## 9.6 健康检查

### 9.6.1 健康检查机制

健康检查是 CLB 自动剔除异常 RS 的核心机制。CLB 转发集群会定期向后端 RS 发送探测请求，根据响应判断 RS 状态。健康检查由每个转发节点独立执行，确保从不同网络路径均可到达 RS。

**状态流转：**

```
正常（Healthy）→ 连续 N 次探测失败 → 异常（Unhealthy）→ 摘除流量
异常（Unhealthy）→ 连续 M 次探测成功 → 正常（Healthy）→ 恢复流量
```

**关键设计考量：**

- 健康检查的探测间隔和阈值直接影响故障发现时间和误判概率。间隔越短、阈值越低，故障发现越快，但网络抖动导致的误判也越多。
- 健康检查的探测源 IP 是 CLB 转发集群的内网 IP，RS 的安全组必须放通这些 IP 的探测流量。
- 健康检查失败后，CLB 立即停止向该 RS 分发新请求，但已建立的存量连接不受影响，由连接空闲超时控制断开。

### 9.6.2 四层健康检查

| 协议 | 探测方式 | 判断标准 |
|------|----------|----------|
| TCP | 发起 TCP 三次握手 | 连接建立成功即健康 |
| UDP | 发送 UDP 探测报文 | 收到 ICMP Port Unreachable 为异常，否则默认健康 |

**配置参数：**

```
探测间隔：5 秒（默认，可配 2-60s）
超时时间：3 秒（默认）
健康阈值：3 次（连续成功判定健康）
不健康阈值：3 次（连续失败判定异常）
```

**参数调优建议：**

- 对故障恢复速度要求高的场景：探测间隔 2s，不健康阈值 2 次，约 4s 可发现故障。
- 对稳定性要求高的场景：探测间隔 10s，不健康阈值 5 次，避免网络抖动导致误判。
- 超时时间建议保持 3s，过短可能导致健康 RS 被误判为异常。

### 9.6.3 七层健康检查

七层健康检查通过发送 HTTP 请求并检查响应状态码来判断 RS 健康状态。相比四层健康检查，七层健康检查能更真实地反映应用状态。

**配置参数：**

```
探测协议：HTTP
探测域名：example.com（与转发规则域名一致）
探测路径：/healthz（建议使用独立健康检查端点）
探测间隔：5 秒
超时时间：3 秒
健康状态码：http_2xx、http_3xx（可自定义）
```

**最佳实践：**

- 后端应用暴露独立的 `/healthz` 或 `/health` 端点，返回 `200 OK`。该端点不应需要认证，避免健康检查因认证失败而误判。
- 健康检查端点应检查依赖组件（数据库、缓存）的状态，避免"假健康"——即应用进程存活但无法正常处理请求。
- 探测域名建议与转发规则域名一致，避免七层路由不匹配导致健康检查请求被错误路由。
- 健康检查端点应保持轻量，避免执行耗时操作（如复杂数据库查询），防止健康检查本身成为性能瓶颈。

### 9.6.4 健康检查设计原则

1. **轻量级**：健康检查端点不应执行耗时操作，避免影响探测效率。建议仅做基本的进程存活检查和关键依赖的快速连通性检查。
2. **真实反映**：应检查核心依赖，但不要级联故障。例如，数据库主库宕机时，如果健康检查也返回失败，会导致整个集群被摘除。更好的做法是：数据库不可用时返回 503 而非直接拒绝连接，让 CLB 仍认为 RS 健康，但应用层返回降级响应。
3. **合理阈值**：生产环境建议健康阈值 3-5 次，不健康阈值 3-5 次，避免网络抖动导致频繁摘除。阈值过低会导致 RS 频繁上下线，影响整体稳定性。
4. **独立端口**：建议使用独立端口（如 8080）做健康检查，与应用端口（如 80）分离，避免应用阻塞影响探测。即使应用端口因流量洪峰暂时阻塞，健康检查端口仍可正常响应。

## 9.7 会话保持

### 9.7.1 四层会话保持

四层 CLB 基于 **源 IP Hash** 实现会话保持，同一源 IP 的请求始终转发到同一 RS。

**局限性：**

- NAT 环境下多个用户共享同一公网 IP，导致流量倾斜。例如，公司出口 NAT 下所有员工请求都转发到同一台 RS。
- 客户端 IP 变化（如移动网络切换、WiFi 切换 4G）会导致会话丢失。
- 源 IP Hash 无法在 RS 之间均衡分配流量，可能导致部分 RS 过载。

### 9.7.2 七层会话保持

七层 CLB 支持基于 **Cookie 插入** 的会话保持：

- **CLB 自动插入 Cookie**：CLB 在首次响应中插入 `CLB` 开头的 Cookie，后续请求携带该 Cookie 则固定路由。Cookie 名称格式为 `CLB.<instance_id>`。
- **应用自定义 Cookie**：应用自行设置 Cookie，CLB 根据指定 Key 做会话保持。适用于应用已有会话管理机制的场景。

**配置示例：**

```
会话保持：开启
保持方式：CLB 自动插入 Cookie
Cookie 超时：3600 秒
```

**会话保持的适用场景：**

- 购物车、登录状态等需要保持会话状态的 Web 应用。
- 有状态的后端服务，如 WebSocket 连接。
- 需要将同一用户的请求路由到同一处理节点的场景。

**不适用场景：**

- 无状态应用（推荐）。无状态应用应关闭会话保持，让 CLB 自由分配请求，实现最佳负载均衡效果。
- 已有分布式会话管理（如 Redis 集中存储 Session）的应用。

## 9.8 全局负载均衡（GSLB）

### 9.8.1 什么是 GSLB

全局负载均衡（Global Server Load Balancing）通过 DNS 解析将用户请求分发到不同地域的 CLB 实例，实现多地域容灾和就近接入。GSLB 工作在 DNS 层面，是 CLB 实例之上的全局流量调度层。

### 9.8.2 腾讯云 GSLB 方案

腾讯云提供 **DNS 解析 + CLB 多地域部署** 的 GSLB 方案：

1. **多地域部署 CLB**：在华北（北京）、华东（上海）、华南（广州）等地域各部署一套 CLB + 后端服务。每个地域的 CLB 独立处理该地域的流量。
2. **DNS 智能解析**：通过腾讯云 DNSPod 配置智能解析策略：
   - **地理就近**：根据用户 IP 归属地解析到最近的 CLB VIP。例如，北京用户解析到北京 CLB，上海用户解析到上海 CLB。
   - **加权轮询**：按权重分配流量到不同地域。权重高的地域承担更多流量。
   - **主备切换**：主地域异常时自动切换到备地域。主地域恢复后自动切回。
3. **健康联动**：DNSPod 定期探测各 CLB VIP 的健康状态，自动摘除异常 VIP。探测频率建议 30s，TTL 建议 60s，实现分钟级故障切换。

### 9.8.3 多活与容灾架构

**双活架构：**

```
用户 → DNS（就近解析）
         ├── 北京 CLB（权重 50）→ 北京 CVM 集群
         └── 上海 CLB（权重 50）→ 上海 CVM 集群
```

双活架构下，两个地域同时承载流量，资源利用率高。但需要解决数据一致性问题，通常采用"写本地、读全局"或"最终一致性"策略。

**主备容灾架构：**

```
用户 → DNS（主备模式）
         ├── 北京 CLB（主，权重 100）→ 北京 CVM 集群
         └── 上海 CLB（备，权重 0）→ 上海 CVM 集群（故障时切换）
```

主备架构下，备地域不承载流量，资源利用率较低，但数据一致性容易保证。备地域只需保持数据同步即可。

### 9.8.4 GSLB 最佳实践

- **会话同步**：多活架构需在应用层同步会话状态（如 Redis 集中存储 Session）。推荐使用腾讯云 CRS（云数据库 Redis）跨地域同步。
- **数据层容灾**：数据库采用跨地域同步（如 MySQL 跨地域灾备实例）。腾讯云 CDB 支持跨地域灾备，RTO 分钟级，RPO 秒级。
- **DNS TTL**：建议 TTL 设置为 60-120 秒，在故障切换时快速生效。TTL 过长会导致故障切换后用户仍访问故障 VIP。
- **拨测验证**：定期从不同地域发起拨测，验证 GSLB 解析和容灾切换。推荐使用腾讯云云拨测（CAT）进行自动化拨测。
- **灰度发布**：利用 GSLB 的权重功能实现地域级灰度发布，先在一个地域发布新版本，验证无误后再逐步扩大。

## 9.9 CLB 性能规格

### 9.9.1 实例规格

腾讯云 CLB 提供多种规格，满足不同规模业务需求：

| 规格 | 最大连接数 | 新建连接数（CPS） | 吞吐量 | 适用场景 |
|------|-----------|-------------------|--------|----------|
| 共享型 | 50 万 | 5 万 | 1 Gbps | 小型应用、开发测试 |
| 标准型 | 200 万 | 10 万 | 5 Gbps | 中型生产应用 |
| 高性能型 | 500 万 | 30 万 | 20 Gbps | 大型电商、直播 |
| 超高性能型 | 1000 万 | 50 万 | 40 Gbps | 超大规模、游戏 |

### 9.9.2 性能指标说明

- **最大连接数**：CLB 实例同时维持的 TCP 连接总数（含 ESTABLISHED 和 TIME_WAIT）。长连接场景（如 WebSocket）需要重点关注此指标。
- **新建连接数（CPS）**：每秒新建 TCP 连接数，影响高并发场景下的连接建立能力。短连接场景（如 HTTP API）需要重点关注此指标。
- **吞吐量**：CLB 实例的入站 + 出站带宽上限，超出后丢包。大文件传输和视频流场景需要重点关注此指标。
- **QPS（七层）**：七层监听器每秒处理的 HTTP 请求数，高性能型可达 100 万 QPS。七层转发由于需要解析 HTTP 协议，QPS 通常低于四层的 CPS。

### 9.9.3 选型建议

- **QPS 估算**：根据业务峰值 QPS × 1.5 冗余系数选择规格。例如，峰值 QPS 20 万，建议选择高性能型（支持 100 万 QPS）。
- **连接数估算**：长连接场景关注最大连接数，短连接场景关注 CPS。例如，WebSocket 应用有 10 万在线用户，每个用户维持 1 个长连接，选择标准型（200 万连接）即可。
- **带宽估算**：公网 CLB 带宽按业务峰值流量 × 1.2 冗余系数配置。例如，峰值流量 3 Gbps，建议配置 5 Gbps 带宽。
- **监控告警**：在云监控中配置 CLB 的 `ConcurrentConnections`、`NewConnections`、`OutTraffic` 等指标告警，阈值设为规格上限的 80%。

### 9.9.4 性能测试注意事项

在进行 CLB 性能压测时，需要注意以下几点：

- 压测客户端应使用多个源 IP，避免单 IP 触发 CLB 的源 IP 限速。
- 四层压测关注 CPS 和并发连接数，七层压测关注 QPS 和响应延迟。
- CLB 的性能指标是转发集群的聚合能力，单台压测客户端可能无法打满 CLB 规格。
- 建议使用多台压测客户端分布式压测，或使用腾讯云 PTS（性能测试服务）进行专业压测。

## 9.10 基于 Terraform 的 CLB 基础设施即代码

### 9.10.1 前置条件

```bash
# 安装 Terraform（Windows）
choco install terraform

# 验证安装
terraform --version

# 配置腾讯云 Provider
# 创建 provider.tf
```

### 9.10.2 Provider 配置

```hcl
# provider.tf
terraform {
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = ">= 1.81.0"
    }
  }
}

provider "tencentcloud" {
  secret_id  = var.secret_id
  secret_key = var.secret_key
  region     = var.region
}
```

### 9.10.3 创建内网 CLB 实例

```hcl
# main.tf
resource "tencentcloud_clb_instance" "internal_clb" {
  clb_name                  = "internal-clb-prod"
  network_type              = "INTERNAL"
  vpc_id                    = var.vpc_id
  subnet_id                 = var.subnet_id
  project_id                = 0
  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
```

### 9.10.4 创建公网 CLB 实例

```hcl
resource "tencentcloud_clb_instance" "public_clb" {
  clb_name                  = "public-clb-prod"
  network_type              = "OPEN"
  vpc_id                    = var.vpc_id
  project_id                = 0
  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# 绑定弹性公网 IP
resource "tencentcloud_eip" "clb_eip" {
  name = "clb-eip-prod"
}

resource "tencentcloud_clb_attachment" "eip_bind" {
  clb_id      = tencentcloud_clb_instance.public_clb.id
  eip_id      = tencentcloud_eip.clb_eip.id
}
```

### 9.10.5 配置四层 TCP 监听器

```hcl
# 四层 TCP 监听器
resource "tencentcloud_clb_listener" "tcp_80" {
  clb_id              = tencentcloud_clb_instance.public_clb.id
  listener_name       = "tcp-80"
  protocol            = "TCP"
  port                = 80
  health_check_switch = true
  health_check_time_out = 3
  health_check_interval = 5
  health_check_health_num = 3
  health_check_unhealth_num = 3
  session_expire_time = 0
  scheduler           = "WRR"
}

# 绑定后端 RS
resource "tencentcloud_clb_attachment" "tcp_80_backend" {
  clb_id      = tencentcloud_clb_instance.public_clb.id
  listener_id = tencentcloud_clb_listener.tcp_80.listener_id

  targets {
    instance_id = var.cvm_ids[0]
    port        = 8080
    weight      = 10
  }

  targets {
    instance_id = var.cvm_ids[1]
    port        = 8080
    weight      = 10
  }
}
```

### 9.10.6 配置四层 UDP 监听器

```hcl
# 四层 UDP 监听器
resource "tencentcloud_clb_listener" "udp_53" {
  clb_id              = tencentcloud_clb_instance.internal_clb.id
  listener_name       = "udp-dns"
  protocol            = "UDP"
  port                = 53
  health_check_switch = true
  health_check_interval = 5
  health_check_health_num = 3
  health_check_unhealth_num = 3
  scheduler           = "WRR"
}

resource "tencentcloud_clb_attachment" "udp_53_backend" {
  clb_id      = tencentcloud_clb_instance.internal_clb.id
  listener_id = tencentcloud_clb_listener.udp_53.listener_id

  targets {
    instance_id = var.cvm_ids[0]
    port        = 53
    weight      = 10
  }
}
```

### 9.10.7 配置七层 HTTP/HTTPS 监听器

```hcl
# 七层 HTTP 监听器
resource "tencentcloud_clb_listener" "http_80" {
  clb_id        = tencentcloud_clb_instance.public_clb.id
  listener_name = "http-80"
  protocol      = "HTTP"
  port          = 80
}

# 七层 HTTPS 监听器
resource "tencentcloud_clb_listener" "https_443" {
  clb_id        = tencentcloud_clb_instance.public_clb.id
  listener_name = "https-443"
  protocol      = "HTTPS"
  port          = 443
  certificate_ssl_mode = "MUTUAL"
  certificate_id       = var.ssl_certificate_id
}

# 转发规则
resource "tencentcloud_clb_rule" "api_rule" {
  clb_id              = tencentcloud_clb_instance.public_clb.id
  listener_id         = tencentcloud_clb_listener.https_443.listener_id
  domain              = "api.example.com"
  url                 = "/v1/"
  health_check_switch = true
  health_check_interval = 5
  health_check_http_code = 200
  health_check_health_num = 3
  health_check_unhealth_num = 3
}

# 规则绑定后端
resource "tencentcloud_clb_attachment" "api_backend" {
  clb_id      = tencentcloud_clb_instance.public_clb.id
  listener_id = tencentcloud_clb_listener.https_443.listener_id
  rule_id     = tencentcloud_clb_rule.api_rule.rule_id

  targets {
    instance_id = var.cvm_ids[0]
    port        = 8081
    weight      = 10
  }
}
```

### 9.10.8 CLB 与弹性伸缩组集成

```hcl
# 弹性伸缩组
resource "tencentcloud_as_scaling_group" "web_asg" {
  scaling_group_name   = "web-asg"
  vpc_id               = var.vpc_id
  subnet_ids           = var.subnet_ids
  min_size             = 2
  max_size             = 10
  desired_size         = 2
  project_id           = 0
}

# 将 CLB 绑定到伸缩组
resource "tencentcloud_as_attachment" "clb_asg" {
  scaling_group_id = tencentcloud_as_scaling_group.web_asg.id
  clb_id           = tencentcloud_clb_instance.public_clb.id
  listener_ids     = [
    tencentcloud_clb_listener.http_80.listener_id,
    tencentcloud_clb_listener.https_443.listener_id,
  ]
}
```

### 9.10.9 完整变量定义

```hcl
# variables.tf
variable "secret_id" {
  description = "腾讯云 API 密钥 ID"
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "腾讯云 API 密钥 Key"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "部署地域"
  type        = string
  default     = "ap-guangzhou"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_id" {
  description = "子网 ID"
  type        = string
}

variable "subnet_ids" {
  description = "子网 ID 列表（用于伸缩组）"
  type        = list(string)
  default     = []
}

variable "cvm_ids" {
  description = "后端 CVM 实例 ID 列表"
  type        = list(string)
}

variable "ssl_certificate_id" {
  description = "SSL 证书 ID"
  type        = string
  default     = ""
}
```

### 9.10.10 输出

```hcl
# outputs.tf
output "public_clb_vip" {
  value = tencentcloud_clb_instance.public_clb.vip
}

output "internal_clb_vip" {
  value = tencentcloud_clb_instance.internal_clb.vip
}

output "tcp_listener_id" {
  value = tencentcloud_clb_listener.tcp_80.listener_id
}

output "https_listener_id" {
  value = tencentcloud_clb_listener.https_443.listener_id
}
```

### 9.10.11 部署命令

```bash
# 初始化
terraform init

# 预览变更
terraform plan

# 应用配置
terraform apply -auto-approve

# 销毁资源
terraform destroy
```

## 9.11 CLB 与 TKE 容器集群集成

### 9.11.1 CLB 作为 TKE Service 接入层

腾讯云 TKE（Tencent Kubernetes Engine）支持将 CLB 作为 Service 的接入层。TKE 通过 Cloud Controller Manager（CCM）组件自动管理 CLB 的生命周期。

**Service 类型：**

- **LoadBalancer**：自动创建公网或内网 CLB，将 Service 暴露到集群外部。
- **LoadBalancer（内网）**：创建内网 CLB，仅在 VPC 内部访问。

**示例 YAML：**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-service
  annotations:
    service.kubernetes.io/qcloud-loadbalancer-internal-subnetid: subnet-xxxxxx
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
  selector:
    app: web
```

### 9.11.2 CLB Ingress 控制器

TKE 支持 CLB Ingress 控制器，通过 Ingress 资源自动配置七层 CLB 的转发规则。CLB Ingress 控制器监听 Ingress 资源的变化，自动创建和更新 CLB 的七层监听器和转发规则。

**示例 Ingress：**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: example-ingress
  annotations:
    kubernetes.io/ingress.class: qcloud
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /v1/
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8081
    - host: example.com
      http:
        paths:
          - path: /static/
            pathType: Prefix
            backend:
              service:
                name: static-service
                port:
                  number: 8082
```

## 9.12 CLB 访问日志管理

### 9.12.1 访问日志概述

CLB 访问日志记录了所有经过 CLB 的请求详情，包括客户端 IP、请求时间、请求路径、响应状态码、响应延迟等信息。访问日志对故障排查、安全审计和业务分析至关重要。

### 9.12.2 开启访问日志

CLB 访问日志投递到腾讯云日志服务（CLS），需要在 CLS 中创建日志主题并配置 CLB 的日志投递：

```hcl
# Terraform 配置 CLB 访问日志
resource "tencentcloud_cls_logset" "clb_logset" {
  logset_name = "clb-access-log"
}

resource "tencentcloud_cls_log_topic" "clb_log_topic" {
  topic_name  = "clb-access-log-topic"
  logset_id   = tencentcloud_cls_logset.clb_logset.id
}

resource "tencentcloud_clb_log_topic" "clb_log" {
  load_balancer_id = tencentcloud_clb_instance.public_clb.id
  log_topic_id     = tencentcloud_cls_log_topic.clb_log_topic.id
  logset_id        = tencentcloud_cls_logset.clb_logset.id
}
```

### 9.12.3 日志字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `client_ip` | 客户端 IP | 203.0.113.1 |
| `request_time` | 请求时间 | 2025-06-28T10:00:00+08:00 |
| `request_method` | HTTP 方法 | GET |
| `request_uri` | 请求 URI | /api/v1/users |
| `status` | 响应状态码 | 200 |
| `body_bytes_sent` | 响应体大小 | 1024 |
| `upstream_addr` | 后端 RS 地址 | 10.0.0.1:8080 |
| `upstream_status` | 后端 RS 响应码 | 200 |
| `request_time_ms` | 请求处理时间 | 45 |
| `upstream_response_time` | 后端响应时间 | 40 |

### 9.12.4 日志分析场景

**场景一：排查 5XX 错误**

```sql
* | SELECT upstream_addr, count(*) as error_count
WHERE status >= 500
GROUP BY upstream_addr
ORDER BY error_count DESC
```

**场景二：分析慢请求**

```sql
* | SELECT request_uri, avg(request_time_ms) as avg_time,
         max(request_time_ms) as max_time
GROUP BY request_uri
ORDER BY avg_time DESC
LIMIT 20
```

**场景三：客户端 IP 访问统计**

```sql
* | SELECT client_ip, count(*) as request_count,
         count_if(status >= 500) as error_count
GROUP BY client_ip
ORDER BY request_count DESC
LIMIT 50
```

## 9.13 CLB 安全与权限控制

### 9.13.1 CAM 策略配置

通过腾讯云 CAM（Cloud Access Management）可以精细控制用户对 CLB 的操作权限。

**只读策略：**

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "clb:Describe*"
      ],
      "resource": "*"
    }
  ]
}
```

**运维策略（允许修改配置，不允许删除）：**

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "clb:Describe*",
        "clb:Create*",
        "clb:Modify*",
        "clb:Set*",
        "clb:Bind*"
      ],
      "resource": "*"
    },
    {
      "effect": "deny",
      "action": [
        "clb:Delete*"
      ],
      "resource": "*"
    }
  ]
}
```

### 9.13.2 安全组配置

CLB 安全组控制进出 CLB 的流量，建议遵循最小权限原则：

- 公网 CLB 安全组仅放通 80（HTTP）和 443（HTTPS）端口。
- 后端 RS 安全组仅放通 CLB 的 VPC 网段，拒绝所有其他来源。
- 管理端口（22/3389）不应在 CLB 安全组中放通。

### 9.13.3 DDoS 防护

腾讯云为公网 CLB 提供多层 DDoS 防护：

- **基础防护**：默认 2 Gbps，免费。
- **DDoS 高防包**：最高 300 Gbps，按需购买，绑定到 CLB 的 EIP。
- **DDoS 高防 IP**：独立的高防 IP 实例，通过 DNS 解析将流量引流到高防 IP，再转发到 CLB。

## 9.14 生产环境最佳实践

### 9.14.1 安全加固

- **公网 CLB 开启 WAF**：通过 Web 应用防火墙过滤 SQL 注入、XSS 等攻击。WAF 支持 CC 防护、精准白名单、地域封禁等高级功能。
- **HTTPS 强制跳转**：七层监听器配置 HTTP 自动跳转 HTTPS，确保所有流量加密传输。
- **安全组限制**：CLB 安全组仅放通必要端口，后端 RS 安全组仅放通 CLB 的 VPC 网段。
- **DDoS 高防**：公网 CLB 绑定 DDoS 高防 IP，抵御大流量攻击。
- **TLS 版本限制**：仅开启 TLSv1.2 和 TLSv1.3，禁用不安全的 SSLv3 和 TLSv1.0/1.1。

### 9.14.2 高可用设计

- **多可用区部署**：CLB 实例绑定多个可用区的 RS，单可用区故障时自动切换。建议至少选择 2 个可用区。
- **跨地域容灾**：结合 DNS 智能解析实现多地域 GSLB，RTO 分钟级。
- **优雅摘除**：RS 下线前先通过 CLB 接口将权重置为 0，等待存量连接处理完毕后再关机。建议等待时间不少于连接空闲超时时间。
- **CLB 实例冗余**：关键业务部署主备两个 CLB 实例，通过 DNS 做故障切换。

### 9.14.3 监控与告警

腾讯云 CLB 在云监控中提供以下关键指标：

| 指标 | 说明 | 建议告警阈值 |
|------|------|-------------|
| `ConcurrentConnections` | 当前并发连接数 | 规格上限的 80% |
| `NewConnections` | 新建连接数 | 规格 CPS 上限的 80% |
| `InTraffic` | 入站流量 | 带宽上限的 80% |
| `OutTraffic` | 出站流量 | 带宽上限的 80% |
| `UnHealthCount` | 异常 RS 数量 | > 0 即告警 |
| `HttpCode_4XX` | 4XX 错误数 | 突增 100% 告警 |
| `HttpCode_5XX` | 5XX 错误数 | > 0 即告警 |
| `RequestTotal` | 总请求数 | 突增/突降 50% 告警 |

### 9.14.4 成本优化

- **内网 CLB 免费**：内网 CLB 实例不收费，仅公网 CLB 按带宽或流量计费。微服务间调用优先使用内网 CLB。
- **共享型起步**：业务初期使用共享型 CLB，随业务增长升级规格。共享型支持在线升级到更高规格。
- **按流量计费**：带宽波动大的业务选择按流量计费，带宽稳定的业务选择按带宽计费。按流量计费适合日均带宽利用率低于 30% 的业务。
- **闲置检测**：定期巡检无后端绑定的 CLB 实例，及时释放。可通过云监控的 `UnHealthCount` 指标发现闲置 CLB。
- **多站点复用**：一个公网 CLB 实例可配置多个七层监听器和转发规则，承载多个域名的流量，降低实例数量。

## 9.15 常见问题与排查

### 9.15.1 后端 RS 健康检查失败

**排查步骤：**

1. 确认 RS 端口已监听：`netstat -an | grep <port>`。
2. 确认 RS 安全组放通了 CLB 的 VPC 网段。CLB 健康检查源 IP 为 VPC 内网 IP 段。
3. 确认健康检查路径和端口配置正确。七层健康检查的探测路径必须返回 2xx/3xx 状态码。
4. 检查 RS 系统防火墙（iptables / firewalld）是否拦截了健康检查流量。
5. 查看 RS 应用日志，确认应用正常运行，没有出现 OOM 或死锁。
6. 检查 RS 的 CPU 和内存使用率，确认是否因资源耗尽导致无法响应。

### 9.15.2 连接超时

**可能原因：**

- CLB 连接空闲超时配置过小，长连接被主动断开。默认 300s，长连接场景建议调至 900s。
- 后端 RS 处理能力不足，请求排队超时。表现为 `upstream_response_time` 远大于正常值。
- 公网 CLB 带宽打满，导致丢包。检查 `OutTraffic` 指标是否接近带宽上限。
- RS 应用线程池或连接池耗尽，请求在 RS 端排队。

**解决方案：**

- 根据业务场景调整连接空闲超时（建议 300-900s）。
- 扩容后端 RS 或升级 CLB 规格。
- 监控带宽使用，及时升级带宽上限。
- 优化 RS 应用性能，增加线程池或连接池大小。

### 9.15.3 流量倾斜

**可能原因：**

- 加权轮询权重配置不合理。各 RS 权重应与规格成正比。
- 会话保持导致特定 RS 连接堆积。开启会话保持后，热门用户的请求始终落在同一台 RS。
- 源地址哈希在 NAT 环境下分布不均。公司出口 NAT 下所有员工请求都哈希到同一台 RS。

**解决方案：**

- 检查各 RS 权重配置，确保与规格匹配。
- 评估会话保持必要性，非必要场景关闭。如果必须开启，建议使用七层 Cookie 插入方式。
- 使用最小连接数算法替代加权轮询，让 CLB 根据 RS 实际负载分配请求。

### 9.15.4 CLB 配置下发延迟

**现象：** 修改 CLB 配置后，新规则未立即生效。

**原因：** CLB 控制面采用最终一致性模型，配置下发到所有转发节点需要一定时间。通常 10-30 秒内生效，大规模配置变更可能需要 1-2 分钟。

**建议：** 配置变更后等待 1-2 分钟再验证效果。避免频繁变更配置。

## 9.16 本章小结

本章系统介绍了腾讯云 CLB 的核心概念、架构原理和生产实践：

- **类型选型**：公网 CLB 面向互联网，内网 CLB 面向 VPC 内部，根据业务边界选择。公网 CLB 需要关注带宽和安全防护，内网 CLB 延迟更低且免费。
- **协议选择**：四层（TCP/UDP）适用于高性能、低延迟场景，转发效率高但无法精细化路由；七层（HTTP/HTTPS）适用于精细化路由和协议卸载场景，功能丰富但性能略低于四层。
- **健康检查**：合理配置探测间隔、阈值和路径，是保障高可用的基石。建议使用独立端口和独立健康检查端点。
- **GSLB**：通过 DNS 智能解析实现多地域容灾和就近接入，是跨地域部署的必备组件。
- **性能规格**：根据连接数、CPS、吞吐量、QPS 等指标合理选型，预留 20-50% 的冗余。
- **Terraform 管理**：通过 IaC 实现 CLB 及后端配置的版本化、自动化管理，推荐与弹性伸缩组和 TKE 集成使用。
- **安全与监控**：通过 CAM 策略、安全组、WAF、DDoS 高防构建多层安全防护；通过云监控和 CLS 日志实现可观测性。

负载均衡是云原生架构的流量入口，正确的 CLB 配置直接决定系统的可用性、性能和安全性。建议读者结合本章内容，在实际业务中逐步建立 CLB 的标准化配置规范和运维体系。随着业务规模的增长，可以进一步探索 CLB Anycast 加速、跨地域绑定、流量镜像等高级功能，构建更加弹性、高可用的云原生架构。
