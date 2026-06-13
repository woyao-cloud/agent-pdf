# 可观测性 Demo (Observability)

第 13 章示例项目，展示 Node.js 可观测性的三大支柱：**日志 (Logging)**、**链路追踪 (Tracing)**、**指标 (Metrics)**。

## 技术栈

| 维度 | 技术 | 用途 |
|------|------|------|
| 日志 | Pino | 高性能 JSON 结构化日志 |
| 链路追踪 | OpenTelemetry | 自动采集 HTTP/Express 调用链 |
| 指标 | prom-client (Prometheus) | 请求量、延迟、并发连接、事件循环延迟 |
| 可视化 | Grafana | 统一仪表盘面板 |
| 指标存储 | Prometheus | 时序数据库 |
| 链路存储 | Grafana Tempo | 分布式追踪后端 |
| 日志存储 | Grafana Loki | 日志聚合系统 |

## 项目结构

```
ch13-observability/
├── src/
│   ├── app.ts          # Express 服务入口
│   ├── tracing.ts      # OpenTelemetry 初始化
│   ├── logger.ts       # Pino 结构化日志
│   └── metrics.ts      # Prometheus 指标定义
├── tests/
│   └── app.test.ts     # 单元测试
├── docker-compose.yml  # 完整观测栈编排
├── Dockerfile          # 应用构建镜像
├── prometheus.yml      # Prometheus 抓取配置
├── package.json
└── tsconfig.json
```

## 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式运行（自动重启）
npm run dev

# 测试
npm test

# 构建
npm run build
```

### API 端点

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /metrics` | Prometheus 指标暴露 |
| `GET /api/users/:id` | 模拟用户查询 |
| `GET /api/slow` | 模拟慢查询 (500-1500ms) |
| `GET /api/error` | 模拟错误响应 (500) |

### Docker 全栈部署

一键启动完整观测栈，包含 Grafana 仪表盘：

```bash
docker compose up -d
```

启动后访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| Node App | http://localhost:3000 | 示例应用 |
| Prometheus | http://localhost:9090 | 指标查询 |
| Grafana | http://localhost:3001 | 可视化面板 (匿名登录) |
| Tempo | http://localhost:4318 | 链路追踪 OTLP 端点 |
| Loki | http://localhost:3100 | 日志聚合 |

### Grafana 数据源配置

1. 访问 http://localhost:3001
2. 添加数据源：
   - **Prometheus** → `http://prometheus:9090`
   - **Tempo** → `http://tempo:3200`
   - **Loki** → `http://loki:3100`
3. 使用 Explore 面板跨数据源关联查询

## 架构说明

- **日志**：Pino 输出 JSON 格式日志到 stdout，Loki 自动采集容器日志
- **链路追踪**：OpenTelemetry SDK 自动埋点，通过 OTLP 协议发送到 Tempo
- **指标**：prom-client 暴露 `/metrics` 端点，Prometheus 定期抓取
- **关联**：每条日志包含 `trace_id`，可在 Grafana 中从日志跳转到对应 Trace