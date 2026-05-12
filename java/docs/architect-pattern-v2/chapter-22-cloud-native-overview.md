# 第22章 云原生架构概述

云原生（Cloud Native）是近年来最具影响力的架构范式之一。它不是单一的"模式"，而是一套充分利用云计算模型来构建和运行可弹性扩展应用的方法论体系。

---

## 22.1 什么是云原生

### 22.1.1 CNCF 定义

> "Cloud native technologies empower organizations to build and run scalable applications in modern, dynamic environments such as public, private, and hybrid clouds."
> — CNCF (Cloud Native Computing Foundation)

工程化的翻译：**云原生是一种设计哲学——不是"把应用搬到云上运行"，而是"从一开始就为云环境而设计应用"。**

```
传统上云 ("Lift and Shift")：      云原生：
  把现有应用部署到云上的 VM      为云的动态特性而设计
  ↓                                ↓
  应用假设：硬件是固定的          应用假设：基础设施随时可能变化
  扩展：买更大的 VM              扩展：水平增加 Pod 实例
  配置：写死在配置文件里          配置：从 ConfigMap/Secrets 动态注入
  日志：写本地文件                日志：stdout/stderr → 集中式日志平台
```

### 22.1.2 云原生的核心特征

| 特征 | 含义 | 实现 |
|------|------|------|
| **容器化** | 应用和依赖打包为不可变的镜像 | Docker |
| **动态编排** | 自动调度、扩展和故障恢复 | Kubernetes |
| **微服务** | 松耦合的独立可部署单元 | Spring Boot + K8s |
| **声明式 API** | 描述期望状态，而非执行步骤 | K8s YAML |
| **不可变基础设施** | 从不修改运行中的实例——替换之 | 新镜像 + Rolling Update |
| **可观测性** | Metrics + Logging + Tracing 全覆盖 | Prometheus + Loki + Jaeger |
| **持续交付** | 每次提交都可能到达生产环境 | CI/CD Pipeline |

---

## 22.2 容器化

### 22.2.1 容器 vs 虚拟机

```
虚拟机：                        容器：
┌──────────────────┐          ┌──────────────┐
│ App A   App B     │          │ App A │App B │
├────────┬────────┤          ├───────┴──────┤
│ Guest OS│Guest OS│          │ Container    │
├────────┴────────┤          │ Runtime       │
│  Hypervisor      │          ├──────────────┤
├─────────────────┤          │  Host OS      │
│  Host OS         │          ├──────────────┤
├─────────────────┤          │  Hardware     │
│  Hardware        │          └──────────────┘
└──────────────────┘
  启动: 分钟级                   启动: 秒级
  镜像: 几 GB                    镜像: 几十 MB
  隔离: 强 (独立 OS)             隔离: 轻量 (共享 OS kernel)
```

### 22.2.2 Java 容器化最佳实践

```dockerfile
# 生产级 Spring Boot Dockerfile
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# 单独复制依赖层（利用 Docker 缓存）
COPY target/lib lib/
COPY target/app.jar app.jar

# -XX:MaxRAMPercentage —— JVM 自动根据容器内存限制调整堆大小
ENTRYPOINT ["java",
    "-XX:MaxRAMPercentage=75.0",
    "-XX:+UseZGC",
    "-jar", "app.jar"]
```

```yaml
# K8s Deployment —— 声明期望的运行状态
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: app
          image: registry.example.com/order-service:1.5.0
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "k8s"
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"     # 调度时的最小保证
            limits:
              memory: "1Gi"   # 最大可用（超出 OOM Kill）
              cpu: "2000m"
```

---

## 22.3 微服务与 DevOps

在云原生语境下，微服务和 DevOps 是同一枚硬币的两面：

- **微服务**是架构层面的答案——如何拆解系统让各个部分能独立演进
- **DevOps**是组织层面的答案——开发和运维不再是两个独立阶段，开发团队负责"从代码到生产到监控"的全生命周期

---

## 22.4 持续交付

```yaml
# 云原生的 CI/CD 黄金流水线
# 代码提交 → 构建 → 测试 → 安全扫描 → 部署到 staging → 部署到 production

# ArgoCD —— GitOps 声明式持续部署
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: order-service
spec:
  project: default
  source:
    repoURL: https://github.com/company/gitops-config
    path: k8s/overlays/production
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true        # 删除 Git 中不存在的资源
      selfHeal: true     # 如果实际状态偏离 Git，自动修复
    # Git 中的 YAML = 唯一的真相来源 (Single Source of Truth)
```

---

## 22.5 本章小结

云原生不是"使用 K8s"——它是一种**从基础设施到应用架构到团队组织的全方位设计选择**。核心原则三条：

1. **为失败设计**：云上的 Pod 可以随时消失——应用必须无状态或持久化到共享存储
2. **声明而非命令**：告诉平台"我想要什么状态"，而非"执行这些步骤"
3. **不可变且可重现**：从不修补运行中的容器——构建新镜像并替换旧的
