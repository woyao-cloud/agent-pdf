# 第1章 Pull 模型：Prometheus 的核心设计哲学

## 1.1 故事：Zabbix 监控 1000 台服务器的雪崩

某电商公司在 2022 年双十一前一周，运维团队遇到了一个噩梦。他们使用 Zabbix 监控约 1000 台服务器，所有 Agent 被配置为每 30 秒同时向 Zabbix Server 推送数据。大促前夕，业务团队新增了 200 台服务器，监控压力陡增。

**事故发生**：凌晨 3 点，Zabbix Server 的 CPU 飙升至 100%，内存耗尽，Swap 持续读写。所有 Agent 的连接请求排队，Server 来不及处理，导致大量连接超时。Agent 检测到连接失败后重试，进一步加剧了 Server 的负载。最终 Zabbix Server 完全无响应——监控系统本身瘫痪了，而运维团队浑然不知。

**根本原因**：Push 模式下，所有 Agent 同时向 Server 发送数据。当规模增长时，Server 成为瓶颈。Agent 数量越多，Server 压力越大，形成正反馈崩溃循环。

事后，该团队迁移到 Prometheus 的 Pull 模型，同样的 1200 台服务器，Prometheus Server 的 CPU 使用率稳定在 20% 以下。

---

## 1.2 原理比喻：Push vs Pull

### Push 模型 = 所有人挤一个窗口

想象一个银行只有一个柜台窗口。Push 模式下，所有顾客（Agent）同时挤向窗口大喊自己的业务（监控数据）。柜台员（Server）手忙脚乱，窗口被堵死，谁也办不成。

- 如果 10 个人同时喊，柜台员还能应付
- 如果 100 人同时喊，柜台员开始听不清
- 如果 1000 人同时喊，柜台员完全瘫痪

### Pull 模型 = 叫号系统

Prometheus 的 Pull 模型就像银行的叫号系统：

- 顾客（被监控目标）在座位上安静等待
- 柜台员（Prometheus Server）按照自己的节奏叫号（发起 HTTP 请求）
- 叫到谁，谁就过来办理（返回指标数据）
- 柜台员可以控制节奏——忙的时候叫慢点，闲的时候叫快点

### 健康自证明 = 保安巡逻

Pull 模型还有一个隐形的优势：**如果被监控目标挂了，Prometheus 立即知道**。

这就像保安巡逻——保安按固定路线巡逻，走到某个岗位发现没人，马上就知道出事了。而在 Push 模型中，Agent 挂了只是"没人来喊"，Server 需要额外的超时机制才能发现，就像柜台员需要等很久才发现某个顾客不在了。

---

## 1.3 代码旁白：scrape_configs 逐行注释

下面是一个完整的 Prometheus 抓取配置，每一行都有"为什么这样写"的注释：

```yaml
# prometheus.yml
global:
  scrape_interval: 15s      # 每隔15秒抓取一次数据
  evaluation_interval: 15s  # 每隔15秒评估一次告警规则

# scrape_configs 定义了 Prometheus 要从哪里拉取数据
# 每个 job 代表一组同类型的目标
scrape_configs:
  # Job 1: 监控 Prometheus 自己
  - job_name: 'prometheus'
    # static_configs 表示目标地址是固定的
    # 为什么不动态发现？因为 Prometheus 自己地址不会变
    static_configs:
      - targets: ['localhost:9090']

  # Job 2: 监控 Node Exporter（Linux 系统指标）
  - job_name: 'node'
    # scrape_interval 覆盖全局设置，这里用 10s
    # 为什么？因为系统指标变化快，需要更频繁采集
    scrape_interval: 10s
    static_configs:
      - targets:
        - '192.168.1.10:9100'  # Web 服务器 1
        - '192.168.1.11:9100'  # Web 服务器 2
        - '192.168.1.12:9100'  # 数据库服务器

  # Job 3: 监控业务应用（带标签）
  - job_name: 'business-app'
    # metrics_path 指定抓取指标的 HTTP 路径
    # 为什么是 /actuator/prometheus？Spring Boot 默认暴露在此路径
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['app1.example.com:8080', 'app2.example.com:8080']
        # labels 附加自定义标签，方便查询时区分
        labels:
          env: 'production'
          team: 'backend'
```

### 配置中的常见陷阱

```yaml
# 错误配置：忘了指定 metrics_path
- job_name: 'spring-app'
  static_configs:
    - targets: ['app:8080']
# Prometheus 会去 http://app:8080/metrics 抓取
# 但 Spring Boot 默认在 /actuator/prometheus
# 结果：抓取失败，数据为零

# 正确配置：显式指定 metrics_path
- job_name: 'spring-app'
  metrics_path: '/actuator/prometheus'
  static_configs:
    - targets: ['app:8080']
```

---

## 1.4 手把手：从零搭建第一个 scrape 配置

### 前置条件

- 一台 Linux 机器（或 WSL2）
- 已安装 Prometheus（版本 2.x）
- 已安装 Node Exporter

> 如果你还没有安装，可以参考：
> - Prometheus 下载：https://prometheus.io/download/
> - Node Exporter 下载：同页面搜索 node_exporter

### 步骤 1：启动 Node Exporter

打开终端，启动 Node Exporter（作为被监控目标）：

```bash
# 启动 Node Exporter，监听在 9100 端口
./node_exporter --web.listen-address=":9100"
```

验证是否启动成功：打开浏览器访问 `http://localhost:9100/metrics`。

你会看到类似这样的输出：

```
# HELP node_cpu_seconds_total Seconds the cpus spent in each mode
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 12345.67
node_cpu_seconds_total{cpu="0",mode="system"} 234.56
```

**如果能看见这些文本，说明 Node Exporter 正在正常工作！**

### 步骤 2：编写 Prometheus 配置

创建文件 `prometheus.yml`：

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
```

### 步骤 3：启动 Prometheus

```bash
# 启动 Prometheus，指定配置文件
./prometheus --config.file=prometheus.yml
```

### 步骤 4：验证抓取是否成功

打开浏览器访问 `http://localhost:9090/targets`。

你会看到一个页面，其中 `node` job 的状态显示为 `UP`。如果显示 `DOWN`，说明 Prometheus 无法连接到 Node Exporter，请检查：

1. Node Exporter 是否在运行
2. 端口是否正确
3. 防火墙是否放行

### 步骤 5：查询第一个指标

访问 `http://localhost:9090/graph`，在查询框中输入：

```
node_cpu_seconds_total{mode="idle"}
```

点击 "Execute"，你会看到 CPU 空闲时间的时序数据。恭喜，你已经成功搭建了第一个 Prometheus 监控！

### 步骤 6：添加更多目标

回到 `prometheus.yml`，在 `static_configs` 中添加更多目标：

```yaml
scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets:
        - 'localhost:9100'
        - '192.168.1.100:9100'  # 新增：另一台服务器
        - '192.168.1.101:9100'  # 新增：第三台服务器
```

重启 Prometheus 后，再次访问 `http://localhost:9090/targets`，你会看到三个目标都已添加。

### 完整步骤图示

```
[Node Exporter]  ──暴露 /metrics ──>  [localhost:9100]
                                          ↑
                                          │ 抓取 (Pull)
                                          │
[Prometheus]  ──读取配置 ──>  scrape_configs ──>  targets: ['localhost:9100']
     │
     │ 查询
     ▼
[Grafana / PromQL]  ── node_cpu_seconds_total
```

---

## 1.5 Before/After：Push vs Pull 对比

### 场景：监控 500 台服务器

| 对比维度 | Push 模型（Zabbix） | Pull 模型（Prometheus） |
|---------|-------------------|----------------------|
| **Server CPU 峰值** | 85% | 22% |
| **网络带宽峰值** | 200 Mbps | 45 Mbps |
| **发现目标失败时间** | 60-90 秒（等待超时） | 15 秒（一个抓取周期） |
| **扩容影响** | 每加 10 台 Server 压力增 2% | 几乎无影响 |
| **配置管理** | 需管理 Agent 端配置 | 只需管理 Server 端配置 |
| **故障排查** | 需要检查 Agent 日志 | 直接看 /targets 页面 |

### 核心差异总结

```
Push 模型：Agent ──主动发送──> Server
         Server 被动接收，无法控制节奏
         瓶颈在 Server 端

Pull 模型：Server ──主动拉取──> Agent（/metrics）
         Server 掌控节奏，目标无感
         瓶颈在 Server 端但可控
```

---

## 1.6 真实案例：某公司的 Push 迁移 Pull

**背景**：某金融科技公司使用自研 Push 监控系统，维护 2000 个 Agent。

**问题**：
- 每次扩容，监控 Server 就要跟着扩容
- 网络拥堵时，Agent 重试加剧拥堵
- Server 宕机期间，大量数据丢失

**迁移方案**：
1. 在每台服务器上部署 Node Exporter（替换原有 Agent）
2. 配置 Prometheus 从所有 Node Exporter 拉取数据
3. 逐步下线旧系统

**效果**：
- Server 从 8 台减少到 2 台
- 数据采集延迟从平均 30 秒降低到 15 秒
- 运维人员从 3 人减少到 1 人（兼职）

---

## 1.7 小结

- Pull 模型让 Server 掌控数据采集节奏，避免 Push 的"羊群效应"雪崩
- 每个被监控目标暴露 `/metrics` 端点，Prometheus 按计划拉取
- 健康检查是 Pull 模型的天然优势——目标挂了立即知道
- `scrape_configs` 是 Pull 模型的配置核心，定义"从谁那里、多久一次、走什么路径"拉取数据
- 从 Zabbix 迁移到 Prometheus 的团队普遍反馈：监控系统本身终于稳定了

---

**下一步**：学习了 Pull 模型如何采集数据，接下来看第 2 章——Prometheus 如何高效存储这些数据（TSDB 存储引擎）。
