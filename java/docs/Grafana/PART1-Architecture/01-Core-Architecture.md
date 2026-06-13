# 第1章 Grafana 的演进与核心架构组成

## 1.1 从"仪表盘"到"全栈可观测性平台"

### 一个真实的故事：凌晨 3 点的告警电话

小林是某电商公司的 SRE，今天凌晨 3 点他的手机响了——P0 告警。他睡眼惺忪地打开电脑，需要同时查看三个系统：Prometheus（看 CPU 和内存）、Kibana（查错误日志）、Jaeger（看 Trace）。三个系统三个网址，每次排障都要来回切换，复制粘贴 TraceID。

"如果能一个界面看完所有数据就好了。"小林想。

这正是 Grafana 要解决的问题。

### Grafana 的演进之路

Grafana 最初只是一个时序数据可视化工具，但经过多年发展，已成为覆盖 Metrics、Logs、Traces、Profiling 四大支柱的全栈可观测性平台：

| 阶段 | 版本 | 核心能力 |
|:----:|:----:|---------|
| 可视化工具 | v1-v4 | 时序图表、多数据源（Graphite/InfluxDB/OpenTSDB） |
| 告警引擎 | v5-v7 | Dashboard 内嵌告警、Alertmanager 集成 |
| 统一告警 | v8+ | Unified Alerting、跨数据源告警、表达式引擎 |
| 全栈可观测性 | v9+ | LGTM 生态（Loki/Grafana/Tempo/Mimir）、Exemplars |
| 可观测性平台 | v10+ | 插件市场、App 平台、Grafana Cloud、Grafana Faro |

> 如果把 Grafana 比作一个"超级遥控器"：v1-v4 是只能控制电视的遥控器，v8+ 变成了能控制电视、空调、音响的万能遥控器，v10+ 则是带屏幕能看监控的智能家居中控台。

### 使用场景

**场景 1：SRE 统一监控入口（解决小林的问题）**
- 把所有数据源集成到一个平台：基础设施指标（Prometheus）、应用日志（Loki）、分布式追踪（Tempo）
- 一个 Dashboard 同时显示 CPU 使用率、错误日志、慢 Trace
- 点击指标突刺 → 自动跳转到对应时间段的日志和 Trace

**场景 2：业务大盘（Business Dashboard）**
- 运营团队关心的不是 CPU 使用率，而是"今天有多少订单"、"收入是多少"
- 从 MySQL/PostgreSQL 查询订单量、用户增长、收入等业务指标
- 通过 JSON API 插件接入外部数据源：GitHub Stars、CI/CD 构建状态

**场景 3：On-Call 告警中心**
- 统一管理所有告警规则，不再需要在 Prometheus、Zabbix、云监控之间切换
- 跨数据源条件组合：CPU > 80% **且** 订单积压 > 1000 才告警
- 分级通知：P0 电话打给值班 SRE、P1 钉钉通知团队、P2 邮件周报汇总

**场景 4：多团队共享**
- 基础架构团队看集群监控、业务团队看订单大盘、DBA 看数据库性能
- 通过 Organization 和 Team 实现逻辑隔离
- 文件夹级权限控制：A 团队不能看到 B 团队的数据

### 开发者需要掌握的技能

- 理解 Grafana 的 Go 后端架构（HTTP Server、Data Proxy、Query Engine）
- 理解 React 前端渲染机制（特别是大规模数据点的性能优化）
- 熟悉 Data Frame 数据模型（所有插件的基础抽象）
- 掌握 Provisioning（YAML 配置即代码）

## 1.2 核心组件拆解

### 整体架构（一个请求的完整旅程）

假设小林在浏览器中打开 Grafana Dashboard，想看"过去 1 小时的 QPS"。这个请求经历了以下旅程：

```
┌─────────────────────────────────────────────────────────────┐
│                       浏览器 (React SPA)                      │
│  小林点击"刷新" → React 构建查询请求                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP POST /api/ds/query
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Server & API Router                   │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────────────┐  │
│  │ 你是谁？    │  │ 去哪？   │  │ 别刷太快               │  │
│  │ Auth        │  │ Routing  │  │ Rate Limiting          │  │
│  │ (检查Token) │  │ (路由)   │  │ (限流)                 │  │
│  └─────────────┘  └──────────┘  └────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────┐
          ▼                        ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Data Proxy     │  │   Query Engine   │  │  Alerting Engine  │
│   (数据代理)     │  │   (查询引擎)     │  │  (告警评估)      │
│   帮你去取数据   │  │   并发查多个源   │  │  检查是否要告警  │
└──────┬───────────┘  └──────┬───────────┘  └──────────────────┘
       │                     │
       ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Source Plugins                        │
│  Prometheus │ Loki │ Tempo │ MySQL │ JSON API │ ...         │
│  (各个数据源的"翻译官")                                        │
└─────────────────────────────────────────────────────────────┘
```

### HTTP Server & API Router（Grafana 的"门卫"）

Grafana 的 HTTP Server 基于 Go 标准库的 `net/http`。每次请求到达时，会经过一系列中间件（Middleware）——就像进入写字楼要先过门禁（鉴权）、登记（日志）、按电梯（路由）。

**核心请求流程：**

```
请求到达 → Auth Middleware → 路由匹配 → Handler → 响应返回
  (出示证件)    (去哪层楼)    (办事)    (拿到结果)
```

**关键中间件：**
- `AuthMiddleware`：检查你是谁。支持三种方式：API Key（适合机器调用）、Session Cookie（适合浏览器登录）、OAuth Token（适合 SSO 集成）
- `RecoveryMiddleware`：安全网。如果代码 panic 崩溃了，捕获异常防止整个进程挂掉
- `LoggerMiddleware`：记录每个请求的耗时、状态码、来源 IP，方便排查问题
- `RateLimitingMiddleware`：防止恶意请求刷爆 API

```go
// 简化的中间件链实现
// 为什么用这种模式？—— 每个中间件只做一件事，灵活组合
type middleware func(http.Handler) http.Handler

func (s *HTTPServer) setupRoutes() {
    r := mux.NewRouter()
    
    // 全局中间件 —— 所有请求必经之路
    r.Use(s.AuthMiddleware)       // 1. 先检查有没有权限
    r.Use(s.LoggerMiddleware)     // 2. 记录日志
    r.Use(s.RecoveryMiddleware)   // 3. 兜底保护
    
    // API 路由 —— 不同路径不同处理
    r.HandleFunc("/api/ds/query", s.handleQueryRequest).Methods("POST")  // 数据查询
    r.HandleFunc("/api/alerts", s.handleAlertRequest).Methods("GET")     // 告警列表
    r.HandleFunc("/api/frontend-metrics", s.handleFrontendMetrics).Methods("POST") // 前端埋点
    
    // 前端静态文件 —— 最后兜底
    r.PathPrefix("/").Handler(http.FileServer(http.FS(publicAssets)))
}
```

### Data Proxy（数据代理）—— Grafana 的"前台接待员"

Data Proxy 是 Grafana 最核心的中间层之一。你可以把它想象成一个公司的前台接待员：

- **访客（前端查询请求）** 来到前台说"我要找技术部的张三（Prometheus 数据）"
- **前台（Data Proxy）** 不会直接把访客带到技术部，而是：
  1. 先确认访客有预约（鉴权凭证注入）
  2. 把访客带到正确的工位（URL 重写）
  3. 如果访客等太久就提醒（超时控制）
  4. 如果同一个人问同样的问题，直接告诉之前的结果（响应缓存）

```
浏览器                    Grafana                    Prometheus
  │                         │                           │
  │ "我要查CPU数据"          │                           │
  │────────────────────────▶│                           │
  │                         │ 前台：先注入API Key        │
  │                         │ "技术部在3楼"              │
  │                         │ GET /api/v1/query         │
  │                         │──────────────────────────▶│
  │                         │                           │
  │                         │  ◀────────────────────────│
  │                         │ 超时控制 → 30s没响应就报错 │
  │  ◀─────────────────────│                           │
  │ 缓存结果，下次不用再查   │                           │
```

**为什么需要 Data Proxy？** 如果让浏览器直接访问 Prometheus，会有两个问题：
1. 浏览器需要知道 Prometheus 的地址和密码（安全风险）
2. 浏览器直接发跨域请求会被浏览器拦截（CORS 问题）

Data Proxy 完美解决了这两个问题。

```ini
# grafana.ini —— 为什么这些参数重要？
[dataproxy]
timeout = 30              # 请求超时（秒）。如果数据源响应慢，超过30s就报错
keep_alive_seconds = 30    # 保持连接的时间。频繁建连很费资源
dial_timeout = 10          # 建立连接的超时。网络不通时快速失败
tls_handshake_timeout = 10 # HTTPS 握手超时
max_idle_connections = 100 # 最大空闲连接数。连接池越大，并发能力越强
idle_conn_timeout = 90     # 空闲连接存活时间
```

### Query Engine（查询引擎）—— Grafana 的"厨房"

当一个 Dashboard 有多个面板，每个面板查询不同数据源时，Query Engine 就像餐厅的厨房：

- **多个厨师（goroutine）同时做菜**：Panel A 查 Prometheus，Panel B 查 MySQL，同时进行
- **每道菜做好后放在传菜口**：每个查询返回 Data Frame
- **服务员统一上菜**：Query Engine 合并所有结果，返回给前端

```
查询请求:
  Panel A: Prometheus (CPU) + MySQL (订单量)
           │                    │
           ▼                    ▼
     ┌──────────┐       ┌──────────┐
     │ 厨师1    │       │ 厨师2    │
     │ Go协程1  │       │ Go协程2  │
     │ 查CPU    │       │ 查订单   │
     └────┬─────┘       └────┬─────┘
          │                  │
          ▼                  ▼
     ┌──────────────────────────┐
     │     Query Engine         │
     │  - 等所有厨师做完        │
     │  - 把菜对齐摆盘          │
     │  - 合并成一份Data Frame  │
     └──────────┬───────────────┘
                │
                ▼
          Panel Renderer（上菜）
```

```go
// 简化的并发查询逻辑
// 为什么用 goroutine？—— 每个查询可能耗时几秒，串行执行会慢死
func (qe *QueryEngine) ExecuteQueries(ctx context.Context, queries []Query) ([]DataFrame, error) {
    results := make([]DataFrame, len(queries))
    errCh := make(chan error, len(queries))
    
    var wg sync.WaitGroup
    for i, q := range queries {
        wg.Add(1)
        go func(idx int, query Query) {
            defer wg.Done()
            // 每个查询在独立 goroutine 中执行
            // 这样即使一个查询慢，其他查询不受影响
            df, err := qe.executeSingleQuery(ctx, query)
            if err != nil {
                errCh <- err
                return
            }
            results[idx] = df
        }(i, q)
    }
    
    wg.Wait()      // 等待所有查询完成
    close(errCh)
    
    if err := <-errCh; err != nil {
        return nil, err
    }
    
    return results, nil
}
```

### Rendering Service（渲染服务）—— Grafana 的"拍照师傅"

Grafana 的图片/PDF 导出功能依赖独立的渲染服务。这个服务本质上是运行在 Docker 容器中的 Headless Chrome——就像一个没有屏幕的浏览器，专门用来截图。

**为什么要独立部署？**
想象一下：如果你在手机上同时运行微信和玩大型游戏，手机会又卡又烫。同样，如果 Grafana 主进程同时处理用户查询和渲染图片，会导致查询变慢甚至 OOM。

**渲染流程：**
```
1. 用户点击"导出 PDF"
2. Grafana 后端构造一个特殊的 URL，包含面板信息、时间范围
3. 发送 HTTP 请求到渲染服务（独立的 Docker 容器）
4. Headless Chrome 打开这个 URL，等图表加载完成
5. 截图 → 返回给 Grafana → 用户下载
```

**真实案例：** 某公司没有独立部署渲染服务，导致多人同时导出 Dashboard 图片时，Grafana 主进程 OOM 崩溃，所有用户都无法访问。这就是典型的"一个功能拖垮整个系统"。

```yaml
# docker-compose 独立渲染服务
services:
  renderer:
    image: grafana/grafana-image-renderer:latest
    ports:
      - "8081:8081"
    environment:
      HTTP_PORT: "8081"
      RENDERING_ARGS: "--no-sandbox --disable-gpu"
      RENDERING_MODE: "default"
      RENDERING_TIMEOUT: "30s"        # 每个渲染请求最多等30秒
      RENDERING_MAX_CONCURRENT: 5      # 最多同时渲染5个（防止OOM）
```

```ini
# grafana.ini 配置渲染服务
[rendering]
server_url = http://renderer:8081/render
callback_url = http://grafana:3000/    # 渲染服务回调Grafana拿数据
concurrent_render_request_limit = 5
```

## 1.3 前端渲染机制

### React 状态管理

Grafana 前端使用 React + Redux 管理状态。可以把 Redux 想象成一个"中央档案室"，所有组件都从这里读取数据：

```
Global State（中央档案室）
├── panels          # 面板配置：大小、位置、类型
├── datasources     # 数据源配置：地址、密码、超时
├── dashboard       # 当前 Dashboard 状态：时间范围、变量值
├── alerts          # 告警状态：哪些在触发、哪些已静默
└── explore         # Explore 页面状态：当前查询、历史记录
```

### 海量数据点渲染优化

Grafana 使用 **uPlot** 库作为默认的时序图渲染引擎。为什么不直接用 ECharts 或 Highcharts？

**用一个类比来理解：**
- **ECharts/Highcharts** 用 SVG 渲染，就像用毛笔写字——好看、动画丰富，但写一万个字手会酸（性能下降）
- **uPlot** 用 Canvas 渲染，就像用印刷机印字——不那么花哨，但印一百万份也很快

| 特性 | uPlot | ECharts | Highcharts |
|------|:-----:|:-------:|:----------:|
| 渲染方式 | Canvas | Canvas | SVG |
| 百万点渲染 | ✅ 1ms | ❌ >100ms | ❌ >500ms |
| 内存占用 | 低 | 中 | 高 |
| 动画支持 | 有限 | 丰富 | 丰富 |

**uPlot 的性能秘诀（为什么它这么快）：**
1. **Canvas 直接绘制**：跳过 DOM 操作，直接在画布上画图。就像直接在墙上画画 vs 先贴瓷砖再画
2. **无数据复制**：直接引用原始数组，不做额外封装。就像直接用原文件 vs 复印一份再用
3. **按需绘制**：只绘制屏幕上能看到的部分。滚动地图时，只画当前视野内的内容
4. **降采样**：如果数据点比屏幕像素还多，自动合并相邻点。100 万个点画在 1000 像素宽的屏幕上，一个像素只需要 1 个点

```typescript
// uPlot 的核心数据结构——直接使用 TypedArray
// 为什么不用对象数组？因为 [{time:1, value:2}, ...] 这样的数组
// 每个对象都要占额外内存，TypedArray 是连续内存块，快10倍
const data = [
    [0, 1, 2, 3, 4, 5],      // x 轴（时间戳）
    [10, 20, 15, 30, 25, 40], // y 轴（值）
];
```

### 开发者需要掌握的技能

- **React + TypeScript**：Grafana 前端完全基于 React + TypeScript
- **Redux Toolkit**：理解 Grafana 的状态管理模式
- **Canvas 渲染原理**：理解 uPlot 为什么比 SVG 图表快
- **浏览器性能调优**：了解 Layout Thrashing、GC 停顿等概念

## 1.4 潜在风险与优化

### 风险 1：Data Proxy 超时（502/504）

**错误做法：**
```ini
[dataproxy]
timeout = 10  # 太短了！稍微慢一点的查询就超时
```

**后果：** 小林查了一个复杂的 PromQL 查询，耗时 15 秒，但 Grafana 10 秒就超时了。面板显示 "502 Bad Gateway"，小林以为系统挂了，实际上只是查询慢。

**正确做法：**
```ini
[dataproxy]
timeout = 60          # 增大超时时间
max_idle_connections = 200  # 增大连接池
```

**真实案例：** 某公司迁移数据后发现 Grafana 所有面板都报 502。排查了两天才发现是迁移后数据源响应变慢了，而 `dataproxy.timeout` 还是默认的 30s。把 timeout 调到 60s 后问题解决。

### 风险 2：渲染服务 OOM

**错误做法：**
```yaml
services:
  renderer:
    image: grafana/grafana-image-renderer:latest
    # 没有设置内存限制！
    # 也没有限制并发数！
```

**后果：** 5 个人同时导出报表，渲染服务启动 5 个 Chrome 进程，每个占 500MB 内存，总共 2.5GB。容器 OOM 被杀，所有导出请求失败。

**正确做法：**
```yaml
services:
  renderer:
    image: grafana/grafana-image-renderer:latest
    deploy:
      resources:
        limits:
          memory: 1G    # 限制最大内存
    environment:
      RENDERING_MAX_CONCURRENT: 3  # 最多同时渲染3个
```

### 风险 3：浏览器端数据点过多

**错误做法：** 在面板中直接查询 `http_requests_total`（没有聚合、没有过滤），返回 100 万个数据点。

**后果：** 浏览器需要处理 100 万个点 → 卡死 → 用户强制关闭标签页。

**正确做法：**
1. 使用 `$__interval` 变量自动降采样
2. 设置最大数据点限制
3. 在查询中使用聚合函数

```ini
[query]
max_data_points = 500000  # 超过这个数就自动降采样
```

### 风险 4：SQLite 并发写入冲突

**错误做法：** 生产环境使用默认的 SQLite 数据库，部署了两个 Grafana 节点做高可用。

**后果：** 两个节点同时写入 SQLite → 数据库损坏 → Grafana 无法启动 → 所有监控不可用。

**正确做法：** 切换到 MySQL/PostgreSQL（详见第13章）。

## 1.5 典型问题处理

### 问题 1：面板显示 "Query timeout"

**一个真实的排查过程：**

小林看到面板报 "Query timeout"，他没有慌，按以下步骤排查：

```
Step 1: 检查数据源能否连通
  → 打开 Configuration → Data Sources → Prometheus
  → 点击 "Save & Test"
  → ✅ "Data source is working"（数据源本身没问题）

Step 2: 检查查询语句
  → 点击面板标题 → Explore
  → 同样的 PromQL 在 Explore 中执行
  → ✅ 能查到数据，但耗时 25s（发现是查询慢）

Step 3: 检查数据源端性能
  → 登录 Prometheus 容器执行相同的查询
  → 发现查询耗时 20s（根因：这个指标数据量太大）

Step 4: 修复
  → 增大 dataproxy.timeout 到 60s
  → 或者优化查询：添加 Recording Rule 预计算
```

### 问题 2：Dashboard 加载缓慢

**排查步骤：**
1. 打开浏览器开发者工具（F12）→ Network 标签
2. 刷新 Dashboard
3. 按耗时排序 → 找出最慢的请求
4. 优化最慢的查询：添加 Recording Rule 或减小时间范围

### 问题 3：图片导出失败

**排查步骤：**
1. 检查渲染服务是否运行：`curl http://renderer:8081/render`
2. 检查渲染服务日志是否有 Chrome 崩溃记录
3. 检查 Grafana 的 `callback_url` 配置是否正确（Grafana 节点必须能访问自身）
4. 确认渲染服务有足够的可用内存

## 本章小结

- Grafana 已经从可视化工具演变为全栈可观测性平台
- 核心架构由 HTTP Server、Data Proxy、Query Engine、Rendering Service 四层组成
- Data Proxy 负责鉴权注入、URL 重写、超时控制——就像公司的前台接待员
- Query Engine 负责并发查询调度与结果合并——就像厨房的多个厨师同时做菜
- 渲染服务基于 Headless Chrome，需要独立部署和资源隔离——否则会影响主进程
- uPlot 是 Grafana 高性能渲染的关键，百万数据点毫秒级渲染
- 实践：[基础搭建实验](../labs/ch01-basic-setup/README.md)
