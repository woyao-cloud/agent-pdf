# 生产环境三大杀手排查 (Troubleshooting Demo)

本 Demo 演示 Node.js 生产环境中最常见的三类问题及其排查方法。

## 三大杀手

### 1. 内存泄漏 (Memory Leak)

- **源码**：`src/leak-demo.ts`
- **场景**：全局数组不断增长，模拟未释放的引用
- **排查工具**：`heapdump` 生成堆快照，使用 Chrome DevTools Memory 面板对比
- **运行**：`npm run leak`

### 2. CPU 飙高 (CPU Spike)

- **源码**：`src/cpu-demo.ts`
- **场景**：正则表达式回溯攻击 + 大量 JSON 序列化
- **排查工具**：`clinic.js` flamegraph 或 Node.js 内置 `--prof`
- **运行**：`npm run cpu`，然后访问 `/evil` 和 `/json-bomb`

### 3. 事件循环阻塞 (Event Loop Lag)

- **源码**：`src/app.ts` / `src/monitor.ts`
- **场景**：使用 `perf_hooks.monitorEventLoopDelay` 实时监控延迟
- **排查工具**：内置监控 + Prometheus + Grafana
- **运行**：`npm run dev` 或 `npm run monitor`

## 快速开始

```bash
# 安装依赖
npm install

# 启动监控仪表盘
npm run monitor

# 启动 Express 服务
npm run dev

# 启动 CPU Demo（另一个终端）
npm run cpu

# 运行测试
npm test
```

## Docker 部署

```bash
# 启动所有服务
docker compose up -d

# 访问地址
# - Node App:          http://localhost:3000
# - CPU Demo:          http://localhost:3001
# - Prometheus:        http://localhost:9090
# - Grafana:           http://localhost:3002
```

## 目录结构

```
ch11-troubleshooting/
├── src/
│   ├── app.ts          # Express + 事件循环监控 + 堆快照
│   ├── leak-demo.ts    # 内存泄漏模拟
│   ├── cpu-demo.ts     # CPU 飙高模拟
│   └── monitor.ts      # 监控仪表盘
├── tests/
│   └── monitor.test.ts # 百分位计算测试
├── docker-compose.yml   # Docker 编排
├── Dockerfile           # 多阶段构建
├── prometheus.yml       # Prometheus 配置
└── package.json
```