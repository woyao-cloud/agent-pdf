# 第27章 腾讯云网络故障排查实战

## 27.1 引言

网络是云上业务的命脉。在腾讯云的生产环境中，网络故障是最常见也最难以定位的问题类型之一。从客户端到服务端的完整链路可能经过 DNS 解析、公网网关、负载均衡、安全组、NAT 规则、路由表、对等连接、私有网络等多个环节，任何一个环节的异常都可能导致业务中断。对于 SRE 而言，掌握系统化的网络故障排查方法，是保障业务连续性的核心能力。

本章从 SRE 实战视角出发，系统梳理腾讯云网络故障的典型场景、诊断方法、根因定位和修复策略。涵盖 CLB 后端不可用（502/503）、内网连通性异常、DNS 解析故障、安全组规则冲突、CDN 回源失败五大核心场景，并提供可直接投入生产使用的诊断脚本和排查清单。每个场景均包含故障现象描述、根因分类、排查命令、排查流程图和真实案例，力求让读者在面对类似问题时能够快速定位并解决。

---

## 27.2 网络故障排查方法论

### 27.2.1 分层排查模型

腾讯云网络架构可抽象为以下层次，排查时应自底向上或自顶向下逐层验证：

| 层次 | 组件 | 典型故障 |
|------|------|----------|
| 应用层 | 业务进程、Nginx、Tomcat、PHP-FPM | 502/503、超时、响应缓慢 |
| 传输层 | CLB、四层监听器、连接池 | 端口未监听、连接耗尽、半连接队列满 |
| 网络层 | 安全组、ACL、路由表、对等连接 | 丢包、无回包、路由黑洞 |
| 链路层 | 对等连接、VPN、专线、云联网 | 链路闪断、延迟抖动、MTU 问题 |
| 物理层 | 宿主机、TOR 交换机、光模块 | 硬件故障（腾讯云兜底，但需感知） |

排查原则：**先确认影响范围，再逐层缩小**。不要一开始就深入抓包分析，而是先通过监控和日志确认问题出在哪一层。

### 27.2.2 黄金三问

遇到网络故障时，先回答三个问题：

1. **影响范围**：单机、单可用区、单地域还是全局？影响范围决定了排查的优先级和方向。全局性问题优先检查腾讯云官方公告，单机问题优先检查本地配置。
2. **变更关联**：故障前 30 分钟内是否有变更操作（安全组规则、路由表、CLB 配置、发布代码、内核参数调整）？腾讯云的大量网络故障与变更直接相关。
3. **复现条件**：是否可稳定复现？是否与客户端 IP、地域、运营商、时间相关？偶发性故障通常与资源竞争或限流相关，持续性故障通常与配置错误相关。

### 27.2.3 必备工具清单

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| `ping` | 基础连通性检测 | `-c` 次数, `-W` 超时, `-s` 包大小 |
| `telnet` / `nc` | 端口可达性检测 | `nc -zv IP PORT` |
| `traceroute` / `mtr` | 路径探测与丢包定位 | `mtr -r -c 10 IP` |
| `dig` / `nslookup` | DNS 解析诊断 | `dig @DNS_SERVER DOMAIN` |
| `curl -v` | HTTP 协议级调试 | `-H` 自定义头, `--connect-timeout` |
| `ss` / `netstat` | 本地连接状态查看 | `ss -tlnp`, `ss -tan` |
| `tcpdump` | 抓包分析 | `-i eth0 host IP and port PORT` |
| `iptables -L -n` | 本机防火墙规则检查 | `-t nat` 查看 NAT 表 |
| `sysctl` | 内核参数查看 | `net.ipv4.*` 系列参数 |
| `sar` | 网络流量历史统计 | `sar -n DEV 1 5` |

### 27.2.4 排查前的准备工作

在开始排查之前，建议完成以下准备工作：

1. **确认腾讯云服务状态**：访问腾讯云状态页面或使用 TCCLI 查询是否有已知故障
2. **收集故障时间点的监控数据**：云监控、CLB 监控、CVM 监控的历史数据
3. **准备回滚方案**：如果故障与最近的变更相关，确认回滚步骤和预期恢复时间
4. **开启详细日志**：在排查过程中开启相关组件的 debug 日志，以便获取更多信息

---

## 27.3 CLB 后端不可用（502/503）

### 27.3.1 故障现象

- 客户端访问 CLB VIP 返回 HTTP 502 Bad Gateway 或 503 Service Unavailable
- CLB 控制台「后端服务状态」显示 RS（Real Server）健康检查异常
- 业务监控出现大量 5xx 错误
- 部分客户端正常，部分客户端异常（与客户端 IP 或地域相关）

### 27.3.2 根因分类

#### 27.3.2.1 健康检查配置不当

CLB 通过健康检查判断后端 RS 是否可用。健康检查是 CLB 场景下最常见的故障根因。常见配置错误：

- **检查协议/端口不匹配**：CLB 配置的健康检查协议（HTTP/TCP）或端口与后端服务实际监听的端口不一致。例如 CLB 配置健康检查端口为 80，但后端服务监听 8080。
- **检查路径错误**：HTTP 健康检查配置的 URL 路径返回非 2xx/3xx 状态码。例如配置 `/health` 但该路径返回 404，或配置 `/` 但该路径返回 302 重定向。
- **超时时间过短**：`timeout` 小于后端服务响应时间，导致健康检查频繁失败。对于响应时间不稳定的业务，建议将 timeout 设置为 5-10 秒。
- **间隔与阈值不合理**：`interval` 过大导致故障发现延迟，`unhealthyThreshold` 过小导致抖动误判。建议 interval 为 3-5 秒，unhealthyThreshold 为 3-5 次。

**排查命令**：

```bash
# 在 RS 上验证健康检查请求是否能正常响应
curl -v http://127.0.0.1:8080/health

# 模拟 CLB 健康检查请求（带特定 User-Agent）
curl -v -H "User-Agent: CLB-HealthCheck" http://127.0.0.1:8080/health

# 查看 CLB 健康检查日志（需在 CLB 控制台开启日志）
# 日志字段：check_ip, check_port, check_path, http_status_code, check_time

# 使用 TCCLI 查看 CLB 健康检查配置
tccli clb DescribeListeners \
  --LoadBalancerId lb-xxxxxxxx \
  --query 'Listeners[0].HealthCheck'
```

#### 27.3.2.2 后端服务异常

即使健康检查配置正确，后端服务本身异常也会导致 502/503：

- 服务进程崩溃或 hang：进程仍在运行但无法处理新请求
- 线程池/连接池耗尽：所有工作线程都在处理慢请求，新请求排队超时
- 慢查询导致请求堆积：数据库查询缓慢导致应用线程阻塞
- JVM Full GC 导致应用暂停：STW（Stop-The-World）期间无法响应任何请求
- 文件描述符耗尽：`ulimit -n` 限制过低，无法建立新连接

**排查命令**：

```bash
# 检查进程状态
systemctl status nginx
ps aux | grep java
ps aux | grep httpd

# 检查端口监听
ss -tlnp | grep 8080

# 检查连接数
ss -tn | grep 8080 | wc -l
ss -tn | grep 8080 | awk '{print $1}' | sort | uniq -c | sort -rn

# 检查文件描述符使用情况
lsof -p $(pgrep -f java) | wc -l
cat /proc/$(pgrep -f java)/limits | grep "open files"

# 检查服务日志
tail -100f /var/log/nginx/error.log
tail -100f /var/log/app/error.log

# 检查 JVM 状态（Java 应用）
jstack $(pgrep -f java) | grep -c "BLOCKED"
jstat -gcutil $(pgrep -f java) 1000 5
```

#### 27.3.2.3 安全组/ACL 拦截

CLB 与 RS 之间的通信可能被安全组或网络 ACL 拦截：

- RS 的安全组未放通 CLB 的**服务化健康检查 IP**（`9.0.0.0/8` 和 `10.0.0.0/8` 段）
- RS 的安全组未放通客户端来源 IP
- 子网的网络 ACL 规则过于严格，未放通 CLB 到 RS 的流量
- 安全组规则顺序错误，允许规则被拒绝规则覆盖

**CLB 健康检查 IP 范围**（腾讯云官方，建议定期从官方文档确认）：

```
9.0.0.0/8
10.0.0.0/8
100.64.0.0/10
```

**安全组规则验证**：

```bash
# 查看 RS 安全组规则（需使用 TCCLI）
tccli vpc DescribeSecurityGroupPolicies \
  --SecurityGroupId sg-xxxxxxxx

# 在 RS 上模拟健康检查请求（使用 CLB 健康检查 IP 段中的 IP）
curl -H "Host: example.com" http://9.0.0.1:8080/health

# 在 RS 上抓包确认健康检查请求是否到达
tcpdump -i eth0 host 9.0.0.0/8 and port 8080 -nn
```

#### 27.3.2.4 CLB 实例自身问题

- CLB 实例到达最大连接数或吞吐量上限：CLB 有规格限制，超过后会出现丢包
- CLB 实例处于隔离状态（欠费）：欠费后 CLB 会停止服务
- 四层 CLB 的 RS 权重为 0：权重为 0 的 RS 不会接收新连接
- CLB 实例配置错误：监听器协议与后端协议不匹配

**排查命令**：

```bash
# 查看 CLB 监控指标（TCCLI）
tccli monitor GetMonitorData \
  --Namespace QCE/LB_PUBLIC \
  --MetricName ConcurConn \
  --Instances '[{"Dimensions":[{"Name":"vip","Value":"1.2.3.4"}]}]'

# 查看 CLB 实例状态
tccli clb DescribeLoadBalancers \
  --LoadBalancerIds '["lb-xxxxxxxx"]'

# 查看 CLB 监听器配置
tccli clb DescribeListeners \
  --LoadBalancerId lb-xxxxxxxx
```

#### 27.3.2.5 客户端到 CLB 的网络路径问题

- 客户端本地防火墙拦截了到 CLB VIP 的流量
- 客户端所在网络到 CLB VIP 的路由存在黑洞
- 客户端 DNS 解析到错误的 CLB VIP（DNS 缓存污染）
- 客户端与 CLB 之间的运营商网络存在丢包

**排查命令**：

```bash
# 从客户端测试到 CLB VIP 的连通性
ping -c 10 CLB_VIP
mtr -r -c 10 CLB_VIP

# 从客户端测试 CLB 端口
telnet CLB_VIP 80
curl -v http://CLB_VIP/path

# 从客户端抓包确认请求是否发出
tcpdump -i any host CLB_VIP -nn
```

### 27.3.3 502/503 排查流程图

```
客户端报 502/503
        │
        ▼
CLB 控制台查看 RS 健康状态
        │
    ┌───┴───┐
    │       │
  正常    异常
    │       │
    ▼       ▼
检查 CLB  检查 RS 安全组
配额与    是否放通健康
监控指标  检查 IP
    │       │
    ▼       ▼
检查客户  检查 RS 上
端到 CLB  服务进程与
的网络路径端口监听
    │       │
    ▼       ▼
抓包分析  检查服务
确认是否  日志与
到达 CLB  应用健康
    │       │
    ▼       ▼
检查客户  检查健康
端 DNS   检查配置
解析      (路径/超时)
```

### 27.3.4 典型案例

**案例一：健康检查路径返回 302 导致 502**

某电商业务配置 CLB HTTP 健康检查路径为 `/`，但后端 Nginx 将 `/` 重定向到 `/index.html`（返回 302）。CLB 将 302 视为非健康状态，标记 RS 异常，导致 502。

**修复**：将健康检查路径改为 `/index.html`，或配置 Nginx 对健康检查 User-Agent 返回 200。

```nginx
location / {
    if ($http_user_agent ~* "clb-healthcheck") {
        return 200;
    }
    rewrite ^ /index.html redirect;
}
```

**案例二：CLB 连接数超限导致随机 503**

某直播业务在活动期间流量突增，CLB 最大连接数达到规格上限（100 万），新连接被丢弃，客户端随机出现 503。监控显示 CLB 的 `ConcurConn` 指标持续接近上限。

**修复**：升级 CLB 实例规格，或增加 CLB 实例做流量拆分。

```bash
# 查看 CLB 当前规格
tccli clb DescribeLoadBalancers \
  --LoadBalancerIds '["lb-xxxxxxxx"]' \
  --query 'LoadBalancerSet[0].LoadBalancerType'

# 升级 CLB 规格（共享型 → 性能保障型）
tccli clb ModifyLoadBalancerAttributes \
  --LoadBalancerId lb-xxxxxxxx \
  --LoadBalancerName "prod-lb-upgraded"
```

**案例三：后端服务线程池耗尽导致 502**

某 Java 微服务在高峰期出现大量 502，检查发现 Tomcat 线程池已满（默认 200 线程），所有线程都在等待数据库查询返回。数据库连接池也同时耗尽。

**修复**：优化数据库查询、增加线程池大小、增加 RS 实例数。

```bash
# 检查 Tomcat 线程状态
jstack $(pgrep -f tomcat) | grep "http-nio" | wc -l

# 检查数据库连接池
jstack $(pgrep -f tomcat) | grep "DBCP" | wc -l
```

---

## 27.4 内网连通性异常

### 27.4.1 故障现象

- 同一 VPC 内 CVM 之间无法互相 ping 通
- 跨 VPC（对等连接/云联网）业务调用超时
- 无法访问内网 CLB 的 VIP
- 数据库连接超时或连接被拒绝
- 部分 CVM 之间通信正常，部分异常

### 27.4.2 根因分类

#### 27.4.2.1 路由表配置错误

VPC 路由表决定了流量如何转发。腾讯云 VPC 路由表支持最长前缀匹配原则，每条路由包含目标网段、下一跳类型和下一跳 ID。常见问题：

- **目标网段的路由条目缺失**：A 到 B 不通，首先检查 A 的路由表中是否有到 B 网段的路由
- **下一跳类型错误**：如应指向对等连接却指向 NAT 网关，或应指向云联网却指向 VPN 网关
- **路由优先级冲突**：两条路由的目标网段存在包含关系，更精确的路由优先生效，但可能不是期望的行为
- **子网未关联正确的路由表**：VPC 可以创建多个路由表，每个子网只能关联一个路由表。如果子网关联了错误的路由表，该子网内所有 CVM 的路由都会异常
- **对等连接回指路由缺失**：对等连接是双向的，两端 VPC 都必须添加指向对端的路由

**排查命令**：

```bash
# 查看 VPC 下所有路由表
tccli vpc DescribeRouteTables --VpcId vpc-xxxxxxxx

# 查看子网关联的路由表
tccli vpc DescribeSubnets --SubnetIds '["subnet-xxxxxxxx"]'

# 在 CVM 上查看实际路由
ip route show
route -n

# 查看路由表详细信息（包含下一跳）
ip route get 10.0.1.100
```

**路由表配置示例**：

```
# VPC A（10.0.0.0/16）需要访问 VPC B（172.16.0.0/16）
# VPC A 的路由表需要添加：
目标网段：172.16.0.0/16
下一跳类型：对等连接
下一跳：pcx-xxxxxxxx

# VPC B 的路由表需要添加（回指路由）：
目标网段：10.0.0.0/16
下一跳类型：对等连接
下一跳：pcx-xxxxxxxx
```

#### 27.4.2.2 对等连接/云联网状态异常

- 对等连接处于「已过期」或「已拒绝」状态：跨账号对等连接需要对方接受，且有时效限制
- 云联网关联的 VPC 未生效：云联网关联 VPC 后需要几分钟生效
- 跨账号对等连接未接受：发起方创建后，接收方需要在控制台确认
- 对端 VPC 的路由表未添加回指路由：这是最常见的跨 VPC 不通的原因
- 对等连接带宽上限：对等连接有带宽限制，超过后会出现丢包

**排查命令**：

```bash
# 查看对等连接状态
tccli vpc DescribeVpcPeerConnections \
  --VpcPeerConnectionIds '["pcx-xxxxxxxx"]'

# 查看云联网路由表
tccli vpc DescribeCcnRoutes \
  --CcnId ccn-xxxxxxxx

# 查看对等连接带宽监控
tccli monitor GetMonitorData \
  --Namespace QCE/PCX \
  --MetricName InBandwidth \
  --Instances '[{"Dimensions":[{"Name":"peeringConnectionId","Value":"pcx-xxxxxxxx"}]}]'
```

**关键检查点**：对等连接是**双向**的，两端 VPC 的路由表都必须添加指向对端的路由条目。很多 SRE 只配置了一端，导致单向通信正常、反向通信失败。

#### 27.4.2.3 安全组/ACL 规则拦截

腾讯云安全组是有状态防火墙，网络 ACL 是无状态防火墙。两者的行为差异是常见的混淆点：

- **安全组（有状态）**：允许入站流量后，出站回包自动放行，无需额外规则。安全组规则按顺序匹配。
- **网络 ACL（无状态）**：必须同时配置入站和出站规则。ACL 规则按编号从小到大匹配。

常见问题：

- 安全组未放通对端 IP 或端口
- 网络 ACL 未同时放通**入站**和**出站**规则
- 安全组规则数量超限（单安全组最多 50 条规则）
- 安全组关联的 CVM 数量超限（单安全组最多关联 100 个 CVM）
- 安全组规则顺序错误，允许规则被拒绝规则覆盖

**排查命令**：

```bash
# 查看安全组关联的实例
tccli vpc DescribeInstancesWithSecurityGroup \
  --SecurityGroupId sg-xxxxxxxx

# 查看安全组规则
tccli vpc DescribeSecurityGroupPolicies \
  --SecurityGroupId sg-xxxxxxxx

# 查看网络 ACL 规则
tccli vpc DescribeNetworkAcls \
  --NetworkAclIds '["acl-xxxxxxxx"]'

# 在 CVM 上抓包确认流量是否到达
tcpdump -i eth0 host 10.0.0.1 -nn
```

#### 27.4.2.4 操作系统防火墙/内核参数

即使云上网络配置正确，操作系统层面的配置也可能导致连通性异常：

- **iptables / firewalld 规则拦截**：操作系统防火墙可能拦截了特定 IP 或端口的流量
- **rp_filter 反向路径过滤**：Linux 内核的 rp_filter 机制会检查数据包的源 IP 是否可从接收网卡路由回去。在多网卡场景下，如果从 eth1 进入的请求回包从 eth0 发出，rp_filter 严格模式会丢弃回包
- **tcp_tw_reuse / tcp_tw_recycle**：`tcp_tw_recycle` 在 NAT 环境下会导致连接异常，因为 NAT 网关后面的多个客户端共享同一个公网 IP，`tcp_tw_recycle` 的时间戳检查会丢弃部分 SYN 包
- **net.ipv4.conf.all.arp_filter**：在多网卡场景下，arp_filter 可能导致 ARP 响应异常

**排查命令**：

```bash
# 检查 iptables 规则
iptables -L -n -v
iptables -t nat -L -n -v

# 检查 firewalld 状态
systemctl status firewalld
firewall-cmd --list-all

# 检查 rp_filter
sysctl net.ipv4.conf.all.rp_filter
sysctl net.ipv4.conf.eth0.rp_filter
sysctl net.ipv4.conf.eth1.rp_filter

# 临时关闭 rp_filter（多网卡场景）
echo 0 > /proc/sys/net/ipv4/conf/all/rp_filter
echo 0 > /proc/sys/net/ipv4/conf/eth0/rp_filter
echo 0 > /proc/sys/net/ipv4/conf/eth1/rp_filter

# 检查 tcp_tw_recycle
sysctl net.ipv4.tcp_tw_recycle
```

#### 27.4.2.5 NAT 网关/公网网关问题

- NAT 网关到达最大连接数限制
- NAT 网关带宽上限导致丢包
- 路由表中未配置指向 NAT 网关的默认路由
- 子网未关联正确的路由表

**排查命令**：

```bash
# 查看 NAT 网关状态
tccli vpc DescribeNatGateways \
  --NatGatewayIds '["nat-xxxxxxxx"]'

# 查看 NAT 网关监控
tccli monitor GetMonitorData \
  --Namespace QCE/NAT_GATEWAY \
  --MetricName ConcurConn \
  --Instances '[{"Dimensions":[{"Name":"natId","Value":"nat-xxxxxxxx"}]}]'
```

### 27.4.3 内网连通性排查流程图

```
A 无法连通 B
        │
        ▼
A 上 ping B 的 IP
        │
    ┌───┴───┐
    │       │
  通       不通
    │       │
    ▼       ▼
检查 DNS  检查 A 的路由表
解析与    是否有到 B 网段
域名配置  的路由
    │       │
    ▼       ▼
检查 B 的  检查 B 的安全组
服务进程  是否放通 A 的 IP
与端口    和协议
    │       │
    ▼       ▼
检查对等  检查 B 的 OS
连接/云  防火墙与
联网状态  rp_filter
    │       │
    ▼       ▼
检查 B 的  在 A 上抓包
网络 ACL  确认报文是否
规则      已发出
```

### 27.4.4 典型案例

**案例一：rp_filter 导致跨 VPC 对等连接单向不通**

某业务通过对等连接访问对端 VPC 的数据库，A → B 方向正常，B → A 方向超时。排查发现 A 为双网卡 CVM（eth0 和 eth1），`rp_filter` 为严格模式（1），导致从 eth1 进入的请求回包从 eth0 发出时被内核丢弃。

**修复**：将 `rp_filter` 改为松散模式（2）或关闭（0）。

```bash
# 永久修改（/etc/sysctl.conf）
echo "net.ipv4.conf.all.rp_filter = 2" >> /etc/sysctl.conf
echo "net.ipv4.conf.eth0.rp_filter = 2" >> /etc/sysctl.conf
echo "net.ipv4.conf.eth1.rp_filter = 2" >> /etc/sysctl.conf
sysctl -p
```

**案例二：对等连接回指路由缺失导致单向不通**

VPC A（10.0.0.0/16）与 VPC B（172.16.0.0/16）建立对等连接后，A 可以访问 B，但 B 无法访问 A。排查发现 A 的路由表中有到 172.16.0.0/16 的路由，但 B 的路由表中没有到 10.0.0.0/16 的回指路由。

**修复**：在 VPC B 的路由表中添加回指路由。

```bash
# 在 VPC B 中添加回指路由
tccli vpc CreateRoute \
  --RouteTableId rtb-xxxxxxxx \
  --DestinationCidrBlock 10.0.0.0/16 \
  --GatewayType VpcPeerConnection \
  --GatewayId pcx-xxxxxxxx
```

**案例三：tcp_tw_recycle 导致 NAT 环境下连接异常**

某业务使用 NAT 网关访问公网，发现部分外部 API 调用超时。排查发现 CVM 上开启了 `tcp_tw_recycle=1`，该参数在 NAT 环境下会导致时间戳校验失败，丢弃来自 NAT 网关的 SYN 包。

**修复**：关闭 `tcp_tw_recycle`（Linux 4.12+ 内核已移除该参数）。

```bash
# 检查当前值
sysctl net.ipv4.tcp_tw_recycle

# 关闭（临时）
echo 0 > /proc/sys/net/ipv4/tcp_tw_recycle

# 永久关闭
echo "net.ipv4.tcp_tw_recycle = 0" >> /etc/sysctl.conf
sysctl -p
```

---

## 27.5 DNS 解析故障

### 27.5.1 故障现象

- 域名解析失败（`ping: unknown host`）
- 解析到错误的 IP 地址
- 解析延迟过高（页面加载慢）
- 部分地域/运营商解析结果不一致
- 内网域名解析异常，公网域名正常

### 27.5.2 根因分类

#### 27.5.2.1 DNS 解析链路中断

腾讯云 CVM 默认使用内网 DNS 服务器（`183.60.83.19` 和 `183.60.82.98`）。解析链路如下：

```
客户端 → 本地 DNS 缓存 → 内网 DNS 服务器 → 递归 DNS → 权威 DNS
```

常见故障点：

- **/etc/resolv.conf 配置错误或丢失**：DHCP 覆盖、手动修改错误、文件被误删除
- **内网 DNS 服务器不可达**：安全组拦截 UDP 53 端口、网络 ACL 拦截、路由表缺失
- **本地 DNS 缓存污染**：`nscd` 或 `systemd-resolved` 缓存了错误的解析结果
- **DNS 解析超时**：DNS 服务器响应慢，或客户端与 DNS 服务器之间的网络延迟高
- **DNS 服务器限流**：短时间内大量 DNS 请求导致被限流

**排查命令**：

```bash
# 检查 DNS 配置
cat /etc/resolv.conf

# 检查 DNS 配置的详细信息
cat /etc/resolv.conf | grep -E "^nameserver|^search|^domain"

# 测试 DNS 服务器连通性
ping -c 3 183.60.83.19
ping -c 3 183.60.82.98

# 测试 DNS 解析（指定 DNS 服务器）
dig @183.60.83.19 example.com
dig @183.60.82.98 example.com

# 测试 DNS 解析（使用系统默认 DNS）
nslookup example.com

# 检查 DNS 缓存服务状态
systemctl status nscd
systemctl status systemd-resolved

# 查看 DNS 缓存内容
nscd -g 2>/dev/null | head -20

# 清空 DNS 缓存
systemctl restart nscd
resolvectl flush-caches
```

#### 27.5.2.2 域名解析记录配置错误

- **DNS 记录指向已释放的 IP**：源站 IP 变更后未更新 DNS 记录
- **CNAME 记录链过长**：CNAME 链超过 5 层可能导致解析超时
- **TTL 设置不合理**：TTL 过长导致变更生效延迟（最长 48 小时），TTL 过短导致 DNS 请求频繁
- **DNSSEC 签名验证失败**：DNSSEC 配置错误导致解析失败
- **解析记录类型错误**：A 记录配置为 CNAME 类型，或 IPv6 客户端请求 AAAA 记录但未配置

**排查命令**：

```bash
# 查看 DNS 解析详情（完整链路）
dig example.com ANY +trace

# 查看 CNAME 链
dig example.com CNAME +short

# 查看 TTL
dig example.com +ttlid

# 对比不同 DNS 服务器的解析结果
dig @8.8.8.8 example.com
dig @1.1.1.1 example.com
dig @183.60.83.19 example.com

# 检查 DNSSEC
dig example.com +dnssec

# 检查 AAAA 记录
dig example.com AAAA
```

#### 27.5.2.3 私有域解析（Private DNS）问题

腾讯云 Private DNS 用于 VPC 内部域名解析。常见问题：

- **私有域未关联正确的 VPC**：创建了私有域但未关联到需要解析的 VPC
- **私有域记录与公网域名冲突**：私有域和公网域名相同，解析优先级混乱
- **解析优先级配置错误**：腾讯云 Private DNS 的解析优先级高于公网 DNS，但配置错误可能导致解析到错误的 IP
- **私有域记录未生效**：新增记录后需要等待一段时间生效

**排查命令**：

```bash
# 查看私有域解析列表
tccli privatedns DescribePrivateZoneList

# 查看私有域详情
tccli privatedns DescribePrivateZone \
  --ZoneId zone-xxxxxxxx

# 查看私有域关联的 VPC
tccli privatedns DescribePrivateZoneVpcList \
  --ZoneId zone-xxxxxxxx

# 查看私有域记录
tccli privatedns DescribePrivateZoneRecordList \
  --ZoneId zone-xxxxxxxx

# 测试私有域解析
dig @183.60.83.19 internal.example.com
nslookup internal.example.com 183.60.83.19
```

#### 27.5.2.4 客户端 DNS 缓存问题

- **浏览器 DNS 缓存**：浏览器会缓存 DNS 解析结果，导致域名指向旧 IP
- **操作系统 DNS 缓存**：Windows 的 `ipconfig /displaydns`，Linux 的 `nscd`
- **中间网络设备 DNS 缓存**：路由器、防火墙等设备可能缓存 DNS 解析结果
- **CDN 节点 DNS 缓存**：CDN 节点会缓存 DNS 解析结果，导致回源到错误的 IP

**排查命令**：

```bash
# Linux 清空 DNS 缓存
systemctl restart nscd
resolvectl flush-caches

# Windows 清空 DNS 缓存
ipconfig /flushdns

# 查看浏览器 DNS 缓存（Chrome）
chrome://net-internals/#dns
```

### 27.5.3 DNS 故障排查流程图

```
域名解析失败
        │
        ▼
检查 /etc/resolv.conf
        │
    ┌───┴───┐
    │       │
  正确   错误/缺失
    │       │
    ▼       ▼
ping DNS  修复 resolv.conf
服务器 IP 并检查 DHCP
    │       │
    ▼       ▼
dig @DNS   检查安全组
服务器     是否放通
域名       UDP 53
    │       │
    ▼       ▼
对比公网  检查私有域
DNS 解析  解析配置
结果      与 VPC 关联
    │       │
    ▼       ▼
检查 DNS  检查客户端
记录配置  DNS 缓存
(TTL/类型) 是否过期
```

### 27.5.4 典型案例

**案例一：resolv.conf 被 DHCP 覆盖导致 DNS 解析中断**

某 CVM 在重启后 DNS 解析全部失败，检查发现 `/etc/resolv.conf` 被 DHCP 客户端覆盖，nameserver 被改为无效地址。原因是 `/etc/sysconfig/network-scripts/ifcfg-eth0` 中 `PEERDNS=yes` 导致 DHCP 覆盖 DNS 配置。

**修复**：将 `PEERDNS` 设为 `no`，或通过 `dhclient` 的 `supersede` 指令固定 DNS 服务器。

```bash
# 方法一：关闭 DHCP 覆盖 DNS
echo "PEERDNS=no" >> /etc/sysconfig/network-scripts/ifcfg-eth0

# 方法二：使用 chattr 锁定 resolv.conf
chattr +i /etc/resolv.conf

# 方法三：通过 dhclient.conf 固定 DNS
echo 'supersede domain-name-servers 183.60.83.19, 183.60.82.98;' >> /etc/dhcp/dhclient.conf
```

**案例二：DNS TTL 过长导致故障恢复延迟**

某业务将 DNS TTL 设置为 86400 秒（24 小时），在源站 IP 变更后，部分客户端在 24 小时内仍然解析到旧 IP，导致服务不可用。

**修复**：在计划变更前，先将 TTL 降低到 60 秒，等待 TTL 刷新后再变更 IP，变更完成后再将 TTL 恢复。

```bash
# 变更前：降低 TTL
# 在 DNS 服务商控制台将 TTL 改为 60 秒
# 等待 24 小时让所有缓存刷新

# 变更中：修改 A 记录指向新 IP
# 在 DNS 服务商控制台修改 A 记录

# 变更后：恢复 TTL
# 在 DNS 服务商控制台将 TTL 恢复为 86400 秒
```

**案例三：私有域未关联 VPC 导致内网域名解析失败**

某业务配置了 Private DNS 用于内网服务发现，但创建私有域后未关联到业务所在的 VPC，导致 CVM 无法解析内网域名。

**修复**：将私有域关联到正确的 VPC。

```bash
# 将私有域关联到 VPC
tccli privatedns BindPrivateZoneVpc \
  --ZoneId zone-xxxxxxxx \
  --VpcSet '[{"Region":"ap-guangzhou","VpcId":"vpc-xxxxxxxx"}]'
```

---

## 27.6 安全组规则冲突

### 27.6.1 故障现象

- 部分客户端无法访问服务，部分可以
- 安全组规则已放通但实际仍被拦截
- 修改安全组规则后未生效
- 安全组规则数量超限导致无法添加新规则
- 新增 CVM 后网络不通

### 27.6.2 根因分类

#### 27.6.2.1 安全组规则优先级理解错误

腾讯云安全组规则按**从上到下**顺序匹配，一旦匹配即停止后续规则。这是最常见的安全组配置错误来源。

常见误区：

- 认为拒绝规则的优先级高于允许规则（实际按顺序匹配，先匹配到的规则生效）
- 在允许规则之后添加了拒绝规则，导致允许规则被覆盖
- 未配置默认拒绝规则，但依赖隐式拒绝（安全组最后一条隐式拒绝所有流量）
- 认为规则可以按任意顺序排列，不关心顺序

**规则匹配示例**：

```
# 错误示例：允许规则在拒绝规则之后，拒绝规则优先生效
入站规则：
  deny   tcp 0.0.0.0/0 80     ← 先匹配到此规则，拒绝
  allow  tcp 10.0.0.0/8 80    ← 永远不会匹配到

# 正确示例：允许规则在前，拒绝规则在后
入站规则：
  allow  tcp 10.0.0.0/8 80    ← 先匹配到此规则，允许
  deny   tcp 0.0.0.0/0 80     ← 仅拒绝非 10.0.0.0/8 的流量
```

#### 27.6.2.2 安全组关联数量超限

腾讯云安全组有严格的配额限制：

- 单个 CVM 最多关联 5 个安全组
- 单个安全组最多关联 100 个 CVM
- 单个安全组最多 50 条入站规则 + 50 条出站规则
- 每个 VPC 最多 50 个安全组

超过限制时，新规则或新关联不会生效，且不会给出明确的错误提示。

**排查命令**：

```bash
# 查看 CVM 关联的安全组
tccli cvm DescribeInstances \
  --InstanceIds '["ins-xxxxxxxx"]' \
  --query 'InstanceSet[0].SecurityGroupIds'

# 查看安全组关联的实例数量
tccli vpc DescribeSecurityGroupAssociations \
  --SecurityGroupId sg-xxxxxxxx

# 查看安全组规则数量
tccli vpc DescribeSecurityGroupPolicies \
  --SecurityGroupId sg-xxxxxxxx \
  --query 'SecurityGroupPolicySet.Ingress | length(@)'
```

#### 27.6.2.3 有状态 vs 无状态混淆

安全组是**有状态**的：允许入站流量后，出站回包自动放行，无需额外规则。

网络 ACL 是**无状态**的：必须同时配置入站和出站规则。

常见错误：

- 在 ACL 中只配置了入站规则，未配置出站规则，导致回包被拦截
- 在安全组中同时配置了入站和出站规则（冗余配置，但不会导致问题）
- 误以为安全组也需要像 ACL 一样配置双向规则

**安全组与 ACL 对比**：

| 特性 | 安全组 | 网络 ACL |
|------|--------|----------|
| 状态 | 有状态 | 无状态 |
| 规则顺序 | 顺序匹配 | 编号匹配 |
| 默认行为 | 隐式拒绝所有 | 允许所有 |
| 作用范围 | CVM 级别 | 子网级别 |
| 支持规则 | 允许 + 拒绝 | 允许 + 拒绝 |

#### 27.6.2.4 安全组规则生效延迟

- 安全组规则修改通常在 10-30 秒内生效
- 在极少数情况下（大规模集群），生效时间可能延长至 1-2 分钟
- 如果超过 5 分钟仍未生效，可能是控制台/API 请求未成功提交
- 安全组规则修改后，已有连接不受影响（有状态特性），新连接使用新规则

#### 27.6.2.5 安全组规则过于宽松或过于严格

- **过于宽松**：放通了 `0.0.0.0/0` 的所有端口，存在安全风险
- **过于严格**：只放通了特定 IP，但未考虑 CLB 健康检查 IP、CDN 回源 IP 等
- **未放通 ICMP**：导致 ping 不通，但 TCP 业务正常
- **未放通 DNS（UDP 53）**：导致 DNS 解析失败

### 27.6.3 安全组规则验证方法

```bash
# 方法一：使用 TCCLI 验证规则
tccli vpc DescribeSecurityGroupPolicies \
  --SecurityGroupId sg-xxxxxxxx \
  --query 'SecurityGroupPolicySet.Ingress[?CidrBlock==`10.0.0.0/8`]'

# 方法二：在 CVM 上抓包验证
# 在 RS 上抓包，确认请求是否到达
tcpdump -i eth0 host 10.0.0.1 and port 8080 -nn

# 方法三：使用 hping3 模拟探测
hping3 -S -p 8080 10.0.0.2 -c 3

# 方法四：使用 nmap 扫描端口
nmap -sS -p 8080 10.0.0.2

# 方法五：查看安全组日志（需开启 VPC 流日志）
# VPC 流日志可以记录被安全组/ACL 拒绝的流量
tccli vpc CreateFlowLog \
  --VpcId vpc-xxxxxxxx \
  --FlowLogName "security-group-audit" \
  --ResourceType "NETWORKACL" \
  --ResourceId acl-xxxxxxxx \
  --TrafficType "REJECT" \
  --StorageType "cls"
```

### 27.6.4 安全组配置最佳实践

```bash
# 最佳实践：最小权限原则

# 1. 只放通业务需要的端口
# 2. 来源 IP 尽量精确，避免使用 0.0.0.0/0
# 3. 定期审计安全组规则，清理无效规则
# 4. 使用安全组标签管理规则用途
# 5. 为不同角色创建独立的安全组

# 安全组设计示例：
# sg-web：Web 服务器安全组
#   入站：80/443 from 0.0.0.0/0
#   入站：22 from 办公网 IP
#   出站：全部放通

# sg-app：应用服务器安全组
#   入站：8080 from sg-web
#   入站：22 from 办公网 IP
#   出站：全部放通

# sg-db：数据库服务器安全组
#   入站：3306 from sg-app
#   入站：22 from 办公网 IP
#   出站：全部放通
```

### 27.6.5 典型案例

**案例一：安全组规则顺序错误导致部分客户端 502**

某游戏业务配置了安全组，允许 `10.0.0.0/8` 访问 80 端口，拒绝其他来源。但规则顺序为：

```
1. deny tcp 0.0.0.0/0 80
2. allow tcp 10.0.0.0/8 80
```

由于顺序匹配，所有流量都被第一条规则拒绝，包括内网流量。CLB 健康检查 IP（`9.0.0.0/8`）也被拒绝，导致 RS 被标记异常，返回 502。

**修复**：调整规则顺序，将允许规则放在拒绝规则之前。

```bash
# 删除原有规则
tccli vpc DeleteSecurityGroupPolicies \
  --SecurityGroupId sg-xxxxxxxx \
  --PolicySet '{"Ingress":[{"PolicyIndex":0},{"PolicyIndex":1}]}'

# 重新添加规则（正确的顺序）
tccli vpc CreateSecurityGroupPolicies \
  --SecurityGroupId sg-xxxxxxxx \
  --PolicySet '{
    "Ingress": [
      {"Protocol":"TCP","Port":"80","CidrBlock":"10.0.0.0/8","Action":"ACCEPT","PolicyIndex":0},
      {"Protocol":"TCP","Port":"80","CidrBlock":"0.0.0.0/0","Action":"DROP","PolicyIndex":1}
    ]
  }'
```

**案例二：安全组未放通 CLB 健康检查 IP 导致 502**

某业务在 RS 安全组中只放通了客户端 IP 段，未放通 CLB 健康检查 IP 段（`9.0.0.0/8` 和 `10.0.0.0/8`），导致 CLB 健康检查全部失败，RS 被标记异常，返回 502。

**修复**：在 RS 安全组中添加放通 CLB 健康检查 IP 的规则。

```bash
# 添加 CLB 健康检查 IP 放通规则
tccli vpc CreateSecurityGroupPolicies \
  --SecurityGroupId sg-xxxxxxxx \
  --PolicySet '{
    "Ingress": [
      {"Protocol":"TCP","Port":"8080","CidrBlock":"9.0.0.0/8","Action":"ACCEPT","PolicyIndex":0},
      {"Protocol":"TCP","Port":"8080","CidrBlock":"10.0.0.0/8","Action":"ACCEPT","PolicyIndex":1},
      {"Protocol":"TCP","Port":"8080","CidrBlock":"100.64.0.0/10","Action":"ACCEPT","PolicyIndex":2}
    ]
  }'
```

---

## 27.7 CDN 回源失败

### 27.7.1 故障现象

- CDN 节点返回 502/504 给终端用户
- CDN 控制台显示回源失败率升高
- 部分地域用户访问正常，部分异常
- 源站带宽突降
- 静态资源加载失败或加载缓慢

### 27.7.2 根因分类

#### 27.7.2.1 源站不可达

CDN 回源请求无法到达源站：

- **源站 IP 变更但 CDN 配置未更新**：源站迁移后忘记更新 CDN 回源配置
- **源站安全组未放通 CDN 回源 IP**：源站安全组只放通了客户端 IP，未放通 CDN 节点 IP
- **源站故障或过载**：源站进程崩溃、带宽打满、CPU 100%
- **源站配置了 IP 白名单但未包含 CDN 节点 IP**：应用层 IP 白名单拦截了 CDN 回源请求
- **源站域名解析失败**：CDN 回源使用域名，但域名解析异常

**CDN 回源 IP 范围**（腾讯云官方，建议定期更新）：

```bash
# 获取 CDN 回源 IP 列表
curl -s https://cdn.tencent.com/api/v1/get_origin_ip

# 输出示例（IP 段会定期更新，请以官方返回为准）
# 1.2.3.0/24
# 4.5.6.0/24
```

**排查命令**：

```bash
# 在源站上放通 CDN 回源 IP
# 安全组规则：允许这些 IP 访问源站端口

# 模拟 CDN 回源请求
curl -H "Host: www.example.com" \
  -H "User-Agent: TencentCDN" \
  -H "X-Forwarded-For: 1.2.3.4" \
  http://源站IP:80/path

# 从源站抓包确认 CDN 回源请求是否到达
tcpdump -i eth0 port 80 -nn

# 检查源站访问日志
tail -100f /var/log/nginx/access.log | grep "TencentCDN"
```

#### 27.7.2.2 回源协议/端口不匹配

- **CDN 配置 HTTPS 回源，但源站只监听 HTTP**：SSL 握手失败
- **CDN 配置回源端口为 443，但源站服务监听 8080**：连接被拒绝
- **源站 HTTPS 证书过期或域名不匹配**：SSL 握手失败
- **源站 HTTPS 证书链不完整**：缺少中间证书，部分客户端验证失败
- **回源协议与源站支持的协议版本不匹配**：源站只支持 TLS 1.0，但 CDN 要求 TLS 1.2

**排查命令**：

```bash
# 验证源站 HTTPS 配置
curl -v https://源站IP:443 -H "Host: www.example.com"

# 检查证书信息
echo | openssl s_client -connect 源站IP:443 \
  -servername www.example.com 2>/dev/null | \
  openssl x509 -noout -subject -dates -issuer

# 检查证书链
echo | openssl s_client -connect 源站IP:443 \
  -servername www.example.com 2>/dev/null | \
  openssl x509 -noout -text | grep -A 10 "Certificate Chain"

# 检查 TLS 版本支持
nmap --script ssl-enum-ciphers -p 443 源站IP
```

#### 27.7.2.3 回源超时配置不合理

CDN 回源超时配置过短，导致正常响应被判定为超时：

- `originTimeout`：源站响应超时（默认 10s），对于慢业务需要适当增大
- `originPollInterval`：源站探测间隔
- 源站处理大文件或慢查询时，响应时间可能超过超时配置

**排查命令**：

```bash
# 查看 CDN 回源超时配置
tccli cdn DescribeDomainsConfig \
  --Domain www.example.com \
  --query 'Domains[0].OriginTimeout'

# 测试源站响应时间
curl -o /dev/null -s -w "time_total: %{time_total}s\n" \
  http://源站IP:80/path
```

#### 27.7.2.4 回源链路过长或存在瓶颈

- **源站通过多层反向代理**：Nginx → CLB → Nginx → App，每层增加延迟和故障点
- **源站带宽不足**：回源请求排队，导致超时
- **源站与 CDN 节点之间的网络延迟过高**：跨地域回源（如华南 CDN 节点回源到华北源站）
- **源站连接数限制**：Nginx `worker_connections` 或 Tomcat `maxThreads` 限制

**排查命令**：

```bash
# 测试源站到 CDN 节点的延迟
mtr -r -c 10 源站IP

# 检查源站带宽使用
sar -n DEV 1 5

# 检查源站连接数
ss -tan | grep -c ESTAB
ss -tan | grep 80 | wc -l

# 检查 Nginx 连接数
curl -s http://127.0.0.1/nginx_status
```

#### 27.7.2.5 回源 Host 头配置错误

- CDN 回源 Host 头与源站虚拟主机配置不匹配
- 源站 Nginx 未配置对应的 server_name
- 源站根据 Host 头返回了错误的内容

**排查命令**：

```bash
# 查看 CDN 回源 Host 配置
tccli cdn DescribeDomainsConfig \
  --Domain www.example.com \
  --query 'Domains[0].OriginHost'

# 测试不同 Host 头的回源结果
curl -H "Host: www.example.com" http://源站IP:80/path
curl -H "Host: origin.example.com" http://源站IP:80/path
```

### 27.7.3 CDN 回源排查流程图

```
CDN 回源失败
        │
        ▼
CDN 控制台查看
回源状态与错误码
        │
    ┌───┴───┐
    │       │
 502/504  其他错误
    │       │
    ▼       ▼
检查源站  检查回源
服务进程  协议/端口
与端口    是否匹配
    │       │
    ▼       ▼
检查源站  检查源站
安全组是   HTTPS 证书
否放通    是否有效
CDN IP
    │       │
    ▼       ▼
检查回源  检查源站
超时配置  带宽是否
是否合理  已达上限
    │       │
    ▼       ▼
检查回源  检查源站
Host 头   Nginx 日志
配置      确认回源请求
```

### 27.7.4 典型案例

**案例一：源站 HTTPS 证书过期导致 CDN 回源失败**

某资讯网站配置 CDN 使用 HTTPS 回源自建 Nginx 源站。某日证书到期后，CDN 节点回源时 SSL 握手失败，返回 502。终端用户看到页面异常，但直接访问源站 IP 正常（浏览器缓存旧证书）。

**修复**：更新源站证书，并在 CDN 控制台验证回源配置。

```bash
# 检查证书过期时间
echo | openssl s_client -connect 源站IP:443 \
  -servername www.example.com 2>/dev/null | \
  openssl x509 -noout -enddate

# 输出示例：notAfter=Jun 10 00:00:00 2024 GMT

# 更新证书后验证
curl -v https://www.example.com
```

**案例二：CDN 回源 Host 头不匹配导致 404**

某业务将 CDN 回源 Host 头设置为源站域名，但源站 Nginx 未配置对应的 server_name，导致回源请求被默认 server 处理，返回 404。

**修复**：在源站 Nginx 中添加对应的 server_name，或修改 CDN 回源 Host 头。

```nginx
# 在源站 Nginx 中添加对应的 server_name
server {
    listen 80;
    server_name www.example.com;
    
    location / {
        proxy_pass http://backend:8080;
    }
}
```

**案例三：源站带宽打满导致 CDN 回源超时**

某视频网站在活动期间源站带宽被打满，CDN 回源请求排队，大量请求超时返回 504。监控显示源站出带宽达到 10Gbps 上限。

**修复**：临时增加源站带宽，或配置 CDN 缓存策略减少回源请求。

```bash
# 查看源站带宽监控
tccli monitor GetMonitorData \
  --Namespace QCE/CVM \
  --MetricName OutBandwidth \
  --Instances '[{"Dimensions":[{"Name":"InstanceId","Value":"ins-xxxxxxxx"}]}]'

# 优化 CDN 缓存策略（增加缓存命中率）
tccli cdn UpdateDomainConfig \
  --Domain www.example.com \
  --Cache '{
    "SimpleCache": {
      "CacheRules": [
        {"CacheType":"All","CacheContents":["*"],"CacheTime":3600}
      ]
    }
  }'
```

---

## 27.8 网络诊断脚本

以下脚本覆盖本章所有场景，可直接在腾讯云 CVM 上运行。脚本会逐项检查网络配置并输出诊断结果。

```bash
#!/bin/bash
#===============================================================================
# 腾讯云网络故障诊断脚本
# 适用场景：CLB 502/503、内网不通、DNS 解析异常、安全组冲突、CDN 回源失败
# 使用方法：bash qcloud-net-diag.sh [目标IP] [目标端口]
# 示例：    bash qcloud-net-diag.sh 10.0.0.1 8080
# 依赖：    curl, ping, dig, ss, iptables, tcpdump (部分功能)
#===============================================================================

set -euo pipefail

TARGET_IP="${1:-}"
TARGET_PORT="${2:-}"
SCRIPT_VERSION="1.0.0"
DIAG_TIME=$(date '+%Y-%m-%d %H:%M:%S')
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_section() { echo -e "\n${GREEN}========== $* ==========${NC}"; }

#-------------------------------------------------------------------------
# 1. 系统基本信息
#-------------------------------------------------------------------------
collect_system_info() {
    log_section "系统基本信息"
    echo "主机名:     $(hostname)"
    echo "操作系统:   $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"')"
    echo "内核版本:   $(uname -r)"
    echo "运行时间:   $(uptime -p)"
    echo "当前时间:   $DIAG_TIME"
    echo "诊断脚本版本: $SCRIPT_VERSION"
    echo "CPU 负载:   $(uptime | awk -F'load average:' '{print $2}')"
    echo "内存使用:   $(free -h | grep Mem | awk '{print $3 "/" $2}')"
}

#-------------------------------------------------------------------------
# 2. 网络接口与 IP 配置
#-------------------------------------------------------------------------
check_network_interfaces() {
    log_section "网络接口与 IP 配置"

    echo "--- 网络接口列表 ---"
    ip addr show | grep -E "^[0-9]|inet " | grep -v "127.0.0.1"

    echo -e "\n--- 路由表 ---"
    ip route show

    echo -e "\n--- ARP 表 ---"
    ip neigh show

    echo -e "\n--- 默认网关连通性 ---"
    local gw=$(ip route show | grep default | awk '{print $3}')
    if [ -n "$gw" ]; then
        if ping -c 2 -W 2 "$gw" &>/dev/null; then
            log_info "默认网关 $gw 可达"
        else
            log_error "默认网关 $gw 不可达"
        fi
    else
        log_error "未找到默认网关"
    fi

    echo -e "\n--- MTU 检查 ---"
    ip link show | grep -E "^[0-9]" | while read line; do
        local iface=$(echo $line | awk -F: '{print $2}' | tr -d ' ')
        local mtu=$(echo $line | awk '{print $NF}')
        echo "$iface: MTU=$mtu"
    done
}

#-------------------------------------------------------------------------
# 3. DNS 解析检查
#-------------------------------------------------------------------------
check_dns() {
    log_section "DNS 解析检查"

    echo "--- /etc/resolv.conf ---"
    cat /etc/resolv.conf 2>/dev/null || log_error "resolv.conf 不存在"

    local dns_servers=("183.60.83.19" "183.60.82.98" "8.8.8.8")
    for dns in "${dns_servers[@]}"; do
        if ping -c 1 -W 2 "$dns" &>/dev/null; then
            log_info "DNS 服务器 $dns 可达"
        else
            log_warn "DNS 服务器 $dns 不可达（可能被安全组拦截 UDP 53）"
        fi
    done

    if [ -n "$TARGET_IP" ]; then
        echo -e "\n--- 反向 DNS 解析 ---"
        nslookup "$TARGET_IP" 2>/dev/null || log_warn "反向解析失败"
    fi

    echo -e "\n--- 公网 DNS 解析测试 ---"
    for domain in "www.tencent.com" "www.baidu.com"; do
        local result=$(dig +short "$domain" 2>/dev/null | head -1)
        if [ -n "$result" ]; then
            log_info "$domain -> $result"
        else
            log_warn "$domain 解析失败"
        fi
    done

    echo -e "\n--- DNS 缓存服务状态 ---"
    for svc in nscd systemd-resolved dnsmasq; do
        if systemctl is-active "$svc" &>/dev/null; then
            log_info "$svc 运行中"
        fi
    done
}

#-------------------------------------------------------------------------
# 4. 安全组与防火墙检查
#-------------------------------------------------------------------------
check_firewall() {
    log_section "安全组与防火墙检查"

    echo "--- iptables 规则（filter 表） ---"
    iptables -L -n --line-numbers 2>/dev/null || log_warn "无法读取 iptables 规则（可能需要 root 权限）"

    echo -e "\n--- iptables 规则（nat 表） ---"
    iptables -t nat -L -n --line-numbers 2>/dev/null || log_warn "无法读取 nat 表规则"

    echo -e "\n--- firewalld 状态 ---"
    if systemctl is-active firewalld &>/dev/null; then
        log_warn "firewalld 运行中，可能影响网络连通性"
        firewall-cmd --list-all 2>/dev/null
    else
        log_info "firewalld 未运行"
    fi

    echo -e "\n--- rp_filter 检查 ---"
    for iface in $(ls /proc/sys/net/ipv4/conf/ 2>/dev/null); do
        local rpf=$(cat /proc/sys/net/ipv4/conf/$iface/rp_filter 2>/dev/null)
        if [ "$rpf" = "1" ] && [ "$iface" != "lo" ] && [ "$iface" != "all" ]; then
            log_warn "$iface rp_filter=1（严格模式），多网卡场景可能导致回包被丢弃"
        fi
    done

    echo -e "\n--- SELinux 状态 ---"
    if command -v getenforce &>/dev/null; then
        getenforce
    fi
}

#-------------------------------------------------------------------------
# 5. 端口与服务监听检查
#-------------------------------------------------------------------------
check_services() {
    log_section "端口与服务监听检查"

    echo "--- 所有监听端口 ---"
    ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null

    if [ -n "$TARGET_PORT" ]; then
        echo -e "\n--- 目标端口 $TARGET_PORT 监听状态 ---"
        if ss -tlnp | grep -q ":$TARGET_PORT "; then
            log_info "端口 $TARGET_PORT 已监听"
            ss -tlnp | grep ":$TARGET_PORT "
        else
            log_error "端口 $TARGET_PORT 未监听"
        fi
    fi

    echo -e "\n--- 连接状态统计 ---"
    ss -tan | awk '{print $1}' | sort | uniq -c | sort -rn

    echo -e "\n--- TIME_WAIT 连接数 ---"
    local tw=$(ss -tan | grep TIME-WAIT | wc -l)
    echo "TIME_WAIT: $tw"
    if [ "$tw" -gt 10000 ]; then
        log_warn "TIME_WAIT 连接数超过 10000，可能导致端口耗尽"
    elif [ "$tw" -gt 50000 ]; then
        log_error "TIME_WAIT 连接数超过 50000，需要立即处理"
    fi

    echo -e "\n--- SYN_RECV 连接数（半连接队列） ---"
    local syn_recv=$(ss -tan | grep SYN-RECV | wc -l)
    echo "SYN_RECV: $syn_recv"
    if [ "$syn_recv" -gt 100 ]; then
        log_warn "SYN_RECV 连接数过高，可能存在 SYN Flood 攻击或半连接队列满"
    fi
}

#-------------------------------------------------------------------------
# 6. 目标连通性测试
#-------------------------------------------------------------------------
check_connectivity() {
    log_section "目标连通性测试"

    if [ -z "$TARGET_IP" ]; then
        log_warn "未指定目标 IP，跳过连通性测试"
        echo "用法: $0 <目标IP> [目标端口]"
        return
    fi

    echo "--- ICMP 连通性 ---"
    if ping -c 4 -W 3 "$TARGET_IP" &>/dev/null; then
        local rtt=$(ping -c 4 -W 3 "$TARGET_IP" | tail -1 | awk -F/ '{print $5}')
        log_info "ICMP 可达，平均 RTT: ${rtt}ms"
        local loss=$(ping -c 10 -W 2 "$TARGET_IP" 2>&1 | grep -oP '\d+(?=% packet loss)')
        if [ -n "$loss" ] && [ "$loss" -gt 0 ]; then
            log_warn "ICMP 丢包率: $loss%"
        fi
    else
        log_error "ICMP 不可达（可能被安全组拦截 ICMP 协议）"
    fi

    if [ -n "$TARGET_PORT" ]; then
        echo -e "\n--- TCP 端口连通性 ---"
        if timeout 3 bash -c "echo >/dev/tcp/$TARGET_IP/$TARGET_PORT" 2>/dev/null; then
            log_info "TCP 端口 $TARGET_PORT 可达"
        else
            log_error "TCP 端口 $TARGET_PORT 不可达"
        fi
    fi

    echo -e "\n--- MTR 路径探测 ---"
    if command -v mtr &>/dev/null; then
        mtr -r -c 3 "$TARGET_IP" 2>/dev/null | tail -20
    elif command -v traceroute &>/dev/null; then
        traceroute -n -q 1 -w 2 "$TARGET_IP" 2>/dev/null
    else
        log_warn "mtr 和 traceroute 均不可用"
    fi
}

#-------------------------------------------------------------------------
# 7. CLB 专项检查
#-------------------------------------------------------------------------
check_clb() {
    log_section "CLB 专项检查"

    if [ -z "$TARGET_PORT" ]; then
        log_warn "未指定端口，跳过 CLB 检查"
        return
    fi

    echo "--- 本地连接数统计 ---"
    local conn_count=$(ss -tan | grep -cE "^(ESTAB|SYN-)")
    echo "当前活跃连接数: $conn_count"

    echo -e "\n--- CLB 健康检查模拟 ---"
    local http_code=$(timeout 2 curl -s -o /dev/null -w "%{http_code}" \
      --connect-timeout 2 \
      -H "User-Agent: CLB-HealthCheck" \
      "http://127.0.0.1:$TARGET_PORT/" 2>/dev/null || echo "000")

    if [ "$http_code" = "000" ]; then
        log_error "本地端口 $TARGET_PORT 无响应"
    elif [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
        log_info "本地端口 $TARGET_PORT 响应正常（HTTP $http_code）"
    else
        log_warn "本地端口 $TARGET_PORT 返回 HTTP $http_code"
    fi

    echo -e "\n--- 最大连接数限制 ---"
    sysctl net.core.somaxconn 2>/dev/null
    sysctl net.ipv4.tcp_max_syn_backlog 2>/dev/null

    echo -e "\n--- 临时端口范围 ---"
    cat /proc/sys/net/ipv4/ip_local_port_range 2>/dev/null
    local port_start=$(cat /proc/sys/net/ipv4/ip_local_port_range 2>/dev/null | awk '{print $1}')
    local port_end=$(cat /proc/sys/net/ipv4/ip_local_port_range 2>/dev/null | awk '{print $2}')
    if [ -n "$port_start" ] && [ -n "$port_end" ]; then
        echo "可用临时端口数: $((port_end - port_start))"
    fi
}

#-------------------------------------------------------------------------
# 8. CDN 回源专项检查
#-------------------------------------------------------------------------
check_cdn() {
    log_section "CDN 回源专项检查"

    if [ -z "$TARGET_IP" ] || [ -z "$TARGET_PORT" ]; then
        log_warn "未指定目标 IP 和端口，跳过 CDN 回源检查"
        return
    fi

    echo "--- 模拟 CDN 回源请求 ---"
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      --connect-timeout 5 \
      --max-time 10 \
      -H "Host: $(hostname -f 2>/dev/null || echo 'localhost')" \
      -H "User-Agent: TencentCDN" \
      -H "X-Forwarded-For: 1.2.3.4" \
      "http://$TARGET_IP:$TARGET_PORT/" 2>/dev/null || echo "000")

    if [ "$http_code" = "000" ]; then
        log_error "回源请求失败（连接超时或被拒）"
    elif [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
        log_info "回源请求成功，HTTP $http_code"
    else
        log_warn "回源请求返回 HTTP $http_code"
    fi

    echo -e "\n--- 回源响应时间 ---"
    curl -o /dev/null -s -w "\
      time_namelookup: %{time_namelookup}s\n\
      time_connect:    %{time_connect}s\n\
      time_starttransfer: %{time_starttransfer}s\n\
      time_total:      %{time_total}s\n" \
      "http://$TARGET_IP:$TARGET_PORT/" 2>/dev/null

    echo -e "\n--- HTTPS 回源证书检查 ---"
    if [ "$TARGET_PORT" = "443" ]; then
        local cert_info=$(echo | openssl s_client -connect "$TARGET_IP:443" \
          -servername "$(hostname -f 2>/dev/null || echo 'localhost')" \
          2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null)
        if [ -n "$cert_info" ]; then
            echo "$cert_info"
            local end_date=$(echo "$cert_info" | grep notAfter | cut -d= -f2)
            local end_epoch=$(date -d "$end_date" +%s 2>/dev/null)
            local now_epoch=$(date +%s)
            if [ -n "$end_epoch" ] && [ "$end_epoch" -lt "$now_epoch" ]; then
                log_error "HTTPS 证书已过期！过期时间: $end_date"
            elif [ -n "$end_epoch" ]; then
                local days_left=$(( (end_epoch - now_epoch) / 86400 ))
                if [ "$days_left" -lt 30 ]; then
                    log_warn "HTTPS 证书将在 $days_left 天后过期"
                else
                    log_info "HTTPS 证书有效，剩余 $days_left 天"
                fi
            fi
        else
            log_warn "HTTPS 证书检查失败"
        fi
    fi
}

#-------------------------------------------------------------------------
# 9. 内核网络参数检查
#-------------------------------------------------------------------------
check_kernel_params() {
    log_section "内核网络参数检查"

    local params=(
        "net.ipv4.tcp_tw_reuse"
        "net.ipv4.tcp_tw_recycle"
        "net.ipv4.tcp_syncookies"
        "net.ipv4.tcp_fin_timeout"
        "net.ipv4.tcp_keepalive_time"
        "net.core.somaxconn"
        "net.ipv4.ip_local_port_range"
        "net.ipv4.tcp_max_syn_backlog"
        "net.core.netdev_max_backlog"
        "net.ipv4.tcp_rmem"
        "net.ipv4.tcp_wmem"
    )

    for param in "${params[@]}"; do
        local val=$(sysctl -n "$param" 2>/dev/null || echo "N/A")
        printf "%-40s = %s\n" "$param" "$val"
    done

    echo -e "\n--- tcp_tw_recycle 警告 ---"
    local recycle=$(sysctl -n net.ipv4.tcp_tw_recycle 2>/dev/null || echo "0")
    if [ "$recycle" = "1" ]; then
        log_error "tcp_tw_recycle=1 在 NAT 环境下会导致连接异常，建议关闭"
    fi

    echo -e "\n--- tcp_syncookies 检查 ---"
    local cookies=$(sysctl -n net.ipv4.tcp_syncookies 2>/dev/null || echo "0")
    if [ "$cookies" = "0" ]; then
        log_warn "tcp_syncookies=0，建议开启以防御 SYN Flood 攻击"
    fi
}

#-------------------------------------------------------------------------
# 10. 综合诊断报告
#-------------------------------------------------------------------------
generate_report() {
    log_section "综合诊断报告"

    local issues=0
    local critical=0

    if [ ! -f /etc/resolv.conf ]; then
        log_error "[严重] /etc/resolv.conf 不存在"
        critical=$((critical + 1))
    elif ! grep -q "nameserver" /etc/resolv.conf 2>/dev/null; then
        log_error "[严重] /etc/resolv.conf 中无 nameserver 配置"
        critical=$((critical + 1))
    fi

    local gw=$(ip route show | grep default | awk '{print $3}')
    if [ -z "$gw" ]; then
        log_error "[严重] 无默认网关"
        critical=$((critical + 1))
    fi

    for iface in $(ls /proc/sys/net/ipv4/conf/ 2>/dev/null); do
        local rpf=$(cat /proc/sys/net/ipv4/conf/$iface/rp_filter 2>/dev/null)
        if [ "$rpf" = "1" ] && [ "$iface" != "lo" ] && [ "$iface" != "all" ]; then
            log_warn "[警告] $iface rp_filter=1"
            issues=$((issues + 1))
        fi
    done

    if [ "$(sysctl -n net.ipv4.tcp_tw_recycle 2>/dev/null)" = "1" ]; then
        log_error "[严重] tcp_tw_recycle=1"
        critical=$((critical + 1))
    fi

    local tw=$(ss -tan | grep TIME-WAIT | wc -l)
    if [ "$tw" -gt 50000 ]; then
        log_error "[严重] TIME_WAIT 连接数 $tw"
        critical=$((critical + 1))
    elif [ "$tw" -gt 10000 ]; then
        log_warn "[警告] TIME_WAIT 连接数 $tw"
        issues=$((issues + 1))
    fi

    if [ -n "$TARGET_PORT" ]; then
        if ! ss -tlnp | grep -q ":$TARGET_PORT "; then
            log_error "[严重] 目标端口 $TARGET_PORT 未监听"
            critical=$((critical + 1))
        fi
    fi

    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    if [ "$disk_usage" -gt 90 ]; then
        log_error "[严重] 磁盘使用率 $disk_usage%"
        critical=$((critical + 1))
    fi

    echo -e "\n=============================="
    if [ "$critical" -eq 0 ] && [ "$issues" -eq 0 ]; then
        log_info "未发现明显网络配置问题"
    else
        log_error "发现 $critical 个严重问题 + $issues 个警告"
        echo "请根据以上诊断结果逐一排查"
    fi
    echo "=============================="
}

#-------------------------------------------------------------------------
# 主流程
#-------------------------------------------------------------------------
main() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║       腾讯云网络故障诊断脚本 v$SCRIPT_VERSION       ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"

    collect_system_info
    check_network_interfaces
    check_dns
    check_firewall
    check_services
    check_connectivity
    check_clb
    check_cdn
    check_kernel_params
    generate_report

    echo -e "\n${GREEN}诊断完成。如需持续监控，建议使用以下命令：${NC}"
    echo "  watch -n 1 'ss -tan | grep -E \"^(ESTAB|SYN-|TIME-)\" | sort | uniq -c | sort -rn'"
    echo "  sar -n DEV 1 5"
    echo "  tcpdump -i eth0 host $TARGET_IP -nn"
    echo ""
    echo "诊断日志已保存到: qcloud-net-diag-$(date +%Y%m%d-%H%M%S).log"
}

main
```

### 脚本使用方法

```bash
# 基本用法：检查本机网络配置
bash qcloud-net-diag.sh

# 检查到目标 IP 的连通性
bash qcloud-net-diag.sh 10.0.0.1

# 检查到目标 IP:Port 的连通性
bash qcloud-net-diag.sh 10.0.0.1 8080

# 保存诊断日志
bash qcloud-net-diag.sh 10.0.0.1 8080 | tee net-diag-$(date +%Y%m%d-%H%M%S).log
```

### 脚本输出解读

脚本输出分为 10 个模块，每个模块对应一个检查维度：

1. **系统基本信息**：确认主机身份和资源使用情况
2. **网络接口与 IP 配置**：检查 IP 地址、路由表、ARP 表和 MTU
3. **DNS 解析检查**：验证 DNS 配置和解析功能
4. **安全组与防火墙检查**：检查 iptables、firewalld 和 rp_filter
5. **端口与服务监听检查**：确认服务端口和连接状态
6. **目标连通性测试**：ICMP 和 TCP 端口测试
7. **CLB 专项检查**：模拟健康检查和连接数统计
8. **CDN 回源专项检查**：模拟回源请求和证书检查
9. **内核网络参数检查**：检查关键内核参数
10. **综合诊断报告**：汇总所有发现的问题

---

## 27.9 监控与告警配置建议

### 27.9.1 关键监控指标

| 指标 | 来源 | 告警阈值 | 说明 |
|------|------|----------|------|
| CLB 后端健康率 | 云监控 | < 100% 持续 1 分钟 | 后端 RS 异常 |
| CLB 5xx 错误率 | 云监控 | > 1% 持续 5 分钟 | 应用层异常 |
| CLB 并发连接数 | 云监控 | > 80% 规格上限 | CLB 规格不足 |
| 内网 ping 丢包率 | 自定义监控 | > 0% | 网络链路异常 |
| DNS 解析成功率 | 自定义监控 | < 100% | DNS 故障 |
| CDN 回源失败率 | CDN 控制台 | > 1% | 源站异常 |
| TCP 连接成功率 | 自定义监控 | < 99% | 端口/服务异常 |
| 安全组拒绝次数 | VPC 流日志 | > 0 | 安全组配置问题 |
| 网络带宽使用率 | 云监控 | > 80% | 带宽瓶颈 |
| TIME_WAIT 连接数 | 自定义监控 | > 10000 | 连接耗尽风险 |

### 27.9.2 告警通知配置

```bash
# 使用 TCCLI 配置 CLB 健康检查告警
tccli monitor CreateAlarmPolicy \
  --PolicyName "CLB-后端健康率告警" \
  --PolicyType "CVM" \
  --Conditions '[
    {
      "MetricName": "UnHealthProportion",
      "Period": 60,
      "Operator": "gt",
      "Value": "0"
    }
  ]' \
  --NoticeIds "notice-xxxxxxxx"

# 配置 VPC 流日志告警（安全组拒绝事件）
tccli monitor CreateAlarmPolicy \
  --PolicyName "VPC-安全组拒绝告警" \
  --PolicyType "VPC" \
  --Conditions '[
    {
      "MetricName": "acl_reject",
      "Period": 300,
      "Operator": "gt",
      "Value": "100"
    }
  ]' \
  --NoticeIds "notice-xxxxxxxx"
```

### 27.9.3 自定义监控脚本

```bash
#!/bin/bash
# 自定义网络监控脚本，可集成到腾讯云自定义监控
# 检查 TCP 连接成功率

TARGET_IP="10.0.0.1"
TARGET_PORT="8080"
SUCCESS=0
TOTAL=5

for i in $(seq 1 $TOTAL); do
    if timeout 2 bash -c "echo >/dev/tcp/$TARGET_IP/$TARGET_PORT" 2>/dev/null; then
        SUCCESS=$((SUCCESS + 1))
    fi
    sleep 0.5
done

SUCCESS_RATE=$((SUCCESS * 100 / TOTAL))
echo "tcp_connect_success_rate $SUCCESS_RATE"
```

---

## 27.10 故障预防最佳实践

### 27.10.1 网络架构设计原则

1. **多可用区部署**：CLB 后端 RS 至少分布在两个可用区，避免单可用区故障导致业务完全中断
2. **冗余 DNS**：至少配置两个 DNS 服务器，避免单点故障。腾讯云内网 DNS 默认提供主备两个服务器
3. **安全组最小权限**：仅放通必要的 IP 和端口，定期审计安全组规则，清理无效规则
4. **健康检查路径独立**：为健康检查设计独立的 URL 路径，返回轻量级响应，避免与业务逻辑耦合
5. **回源链路简化**：CDN 回源尽量直连源站，避免多层代理。每增加一层代理，故障概率和延迟都会增加
6. **网络分层隔离**：Web 层、应用层、数据层使用不同的安全组和子网，实现网络隔离
7. **预留冗余容量**：CLB、NAT 网关、带宽等网络资源的规格预留 20-30% 的冗余容量

### 27.10.2 变更管理规范

1. **变更前**：
   - 备份当前配置（安全组规则、路由表、CLB 配置）
   - 评估影响范围（变更涉及哪些子网、哪些 CVM）
   - 准备回滚方案（回滚步骤、预期恢复时间）
   - 在测试环境验证变更

2. **变更中**：
   - 灰度发布（先变更少量实例，观察 5-10 分钟）
   - 监控关键指标（错误率、延迟、连接数）
   - 记录变更时间点和操作人

3. **变更后**：
   - 验证业务正常（功能测试、性能测试）
   - 记录变更日志（变更内容、变更原因、变更结果）
   - 更新相关文档

### 27.10.3 定期巡检清单

| 检查项 | 频率 | 说明 |
|--------|------|------|
| 安全组规则审计 | 每月 | 清理无效规则，检查是否过于宽松，确认规则顺序正确 |
| 路由表审计 | 每月 | 确认路由条目有效，无冲突，对等连接回指路由完整 |
| DNS 解析验证 | 每周 | 确认关键域名解析正常，TTL 配置合理 |
| CLB 健康检查 | 每日 | 确认所有 RS 健康状态正常，健康检查配置合理 |
| CDN 回源状态 | 每日 | 确认回源失败率正常，回源配置正确 |
| 证书过期检查 | 每月 | 确认 HTTPS 证书在有效期内，提前 30 天告警 |
| 网络带宽使用率 | 每日 | 确认未达到上限，预留冗余容量 |
| 对等连接状态 | 每周 | 确认对等连接未过期，带宽未超限 |
| VPC 流日志分析 | 每周 | 分析被安全组/ACL 拒绝的流量，发现异常访问 |
| 内核参数检查 | 每月 | 确认 tcp_tw_recycle 已关闭，rp_filter 配置正确 |

### 27.10.4 故障演练建议

定期进行故障演练可以验证监控告警的有效性和团队的应急响应能力：

1. **CLB 健康检查故障演练**：手动停止 RS 上的服务进程，验证告警是否触发，确认自动恢复机制是否生效
2. **安全组规则变更演练**：模拟误修改安全组规则，验证回滚流程是否顺畅
3. **DNS 故障演练**：修改 /etc/resolv.conf 为无效 DNS 服务器，验证备用 DNS 切换机制
4. **网络分区演练**：模拟对等连接中断，验证多可用区部署的容灾能力

---

## 27.11 总结

腾讯云网络故障排查的核心在于**分层诊断、逐层排除**。本章从 SRE 实战视角出发，系统梳理了五大高频场景的排查方法：

1. **CLB 502/503**：优先检查健康检查配置、后端服务状态和安全组规则。健康检查配置不当是最常见的根因，其次是后端服务异常和安全组拦截。

2. **内网不通**：逐层检查路由表、对等连接、安全组和 OS 防火墙。路由表配置错误和对等连接回指路由缺失是跨 VPC 通信失败的主要原因。

3. **DNS 解析故障**：检查 resolv.conf、DNS 服务器可达性和解析记录配置。resolv.conf 被 DHCP 覆盖和 DNS 缓存污染是最常见的问题。

4. **安全组冲突**：注意规则顺序、有状态/无状态差异和关联数量限制。规则顺序错误和安全组未放通 CLB 健康检查 IP 是高频问题。

5. **CDN 回源失败**：检查源站可达性、协议匹配、证书有效性和超时配置。源站安全组未放通 CDN 回源 IP 和 HTTPS 证书过期是最常见的根因。

提供的诊断脚本可直接在 CVM 上运行，一键收集网络配置信息并生成诊断报告。建议将脚本集成到自动化运维平台，实现故障快速定位。

网络故障排查的最终目标是**缩短 MTTR（平均修复时间）**。通过建立标准化的排查流程、完善的监控告警体系和定期的巡检机制，可以将大部分网络故障的定位时间控制在 15 分钟以内。同时，通过故障演练和变更管理规范，可以从源头减少网络故障的发生。

最后，记住排查网络故障时的三个原则：

1. **先确认影响范围，再逐层缩小**——不要一开始就深入技术细节
2. **先检查变更，再检查配置**——大部分故障与最近的变更相关
3. **先验证假设，再深入排查**——用简单的命令验证你的猜测，而不是盲目抓包
