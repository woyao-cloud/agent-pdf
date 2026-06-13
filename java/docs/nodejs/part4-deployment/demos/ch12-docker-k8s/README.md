# 第12章：容器化部署与进程守护

本 demo 演示了如何将一个生产级 Node.js 应用容器化，并通过 Docker Compose 和 Kubernetes 进行部署，同时使用 PM2 实现进程守护。

## 目录结构

```
ch12-docker-k8s/
├── src/
│   └── app.ts              # Express 应用（健康检查、优雅关闭）
├── tests/
│   └── app.test.ts         # 单元测试
├── ecosystem.config.js     # PM2 集群模式配置
├── Dockerfile              # 多阶段构建
├── docker-compose.yml      # 本地编排
├── k8s-deployment.yaml     # K8s Deployment + Service
├── .dockerignore
├── package.json
└── tsconfig.json
```

## 快速开始

### 1. 本地开发

```bash
npm install
npm run build
npm run start
```

访问 http://localhost:3000/health 查看健康状态。

### 2. Docker 构建与运行

```bash
# 构建镜像（多阶段构建，产物精简）
npm run docker:build

# 运行容器
npm run docker:run

# 或者使用 Docker Compose（含自动健康检查）
docker-compose up -d
```

### 3. PM2 进程守护

```bash
# 编译 TypeScript
npm run build

# PM2 集群模式启动（使用所有 CPU 核心）
npm run pm2:start

# 查看进程状态
pm2 list

# 查看日志
pm2 logs docker-k8s-demo

# 重新加载（零宕机）
pm2 reload ecosystem.config.js
```

### 4. 部署到 Kubernetes

```bash
# 部署到 K8s 集群
kubectl apply -f k8s-deployment.yaml

# 查看 Pod 状态
kubectl get pods -l app=node-app

# 查看 Service
kubectl get svc node-app-service

# 扩容
kubectl scale deployment node-app --replicas=5

# 滚动更新
kubectl set image deployment/node-app app=node-app:v2
```

## 关键特性

| 特性 | 实现方式 |
|------|---------|
| 健康检查 | `/health` 端点（Liveness Probe） |
| 就绪检查 | `/ready` 端点（Readiness Probe） |
| 优雅关闭 | SIGTERM/SIGINT 信号处理 |
| 进程守护 | PM2 Cluster 模式 |
| 资源限制 | K8s requests/limits 配置 |
| 安全 | 多阶段构建 + 非 root 用户 |
| 日志 | Pino 结构化日志 / PM2 日志轮转 |