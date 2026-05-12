# 第23章 容器与编排

容器编排是云原生架构的操作系统——它管理着容器化应用的生命周期、网络、存储和安全。

---

## 23.1 Docker原理

### 23.1.1 核心概念

```
Docker 的三层镜像模型：

  ┌────────────┐
  │  应用层     │ ← 你的 jar + 依赖 + 启动脚本（可写层）
  ├────────────┤
  │  中间件层   │ ← JRE / Tomcat（共享，读-only）
  ├────────────┤
  │  基础层     │ ← Alpine/Ubuntu（共享，读-only）
  └────────────┘

分层的好处：
- 同一台宿主机的多个容器共享相同的基础层和中间件层（节省磁盘）
- 只传输变化的应用层（加速部署）
```

```dockerfile
# 充分利用分层缓存的 Dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
# Layer 1: 依赖（很少变 → 充分利用缓存）
COPY pom.xml .
RUN mvn dependency:go-offline -B
# Layer 2: 源码（每次变更）
COPY src/ src/
RUN mvn package -DskipTests

FROM eclipse-temurin:21-jre-alpine
COPY --from=build /app/target/*.jar /app/app.jar
USER 1000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

---

## 23.2 Kubernetes 架构

### 23.2.1 核心组件

```
Kubernetes 集群结构：

  Control Plane (Master Node)
  ┌──────────────────────────────┐
  │ API Server  ← 所有操作的入口  │
  │ etcd        ← 所有状态的存储  │
  │ Scheduler   ← 决定 Pod 放哪   │
  │ Controller Manager ← 维持期望状态│
  └──────────────────────────────┘
              │
  ┌───────────┼───────────┐
  │           │           │
  ▼           ▼           ▼
  Worker Node 1   Worker Node 2   Worker Node 3
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ kubelet  │  │ kubelet  │  │ kubelet  │
  │ Pod Pod  │  │ Pod Pod  │  │ Pod Pod  │
  └──────────┘  └──────────┘  └──────────┘

核心概念：
- Pod: 最小的调度单元（1个或多个容器共享网络/存储）
- Deployment: 管理 Pod 的期望状态（副本数/镜像版本/更新策略）
- Service: 为 Pod 提供稳定的网络标识和负载均衡
- ConfigMap/Secret: 配置和敏感数据的外部注入
- Namespace: 虚拟集群——环境隔离
```

### 23.2.2 声明式配置示例

```yaml
# 完整的微服务 K8s 配置
apiVersion: v1
kind: Service
metadata:
  name: order-service
spec:
  selector:
    app: order-service
  ports:
    - port: 80
      targetPort: 8080
---
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
        version: "1.5"
    spec:
      serviceAccountName: order-service-sa
      containers:
        - name: app
          image: order-service:1.5.0
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: order-service-config   # 配置从外部注入
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: order-db-secret      # 密码从 Secret 注入
                  key: password
          resources:
            requests: {memory: "512Mi", cpu: "500m"}
            limits: {memory: "1Gi", cpu: "2000m"}
          livenessProbe:
            httpGet: {path: /actuator/health/liveness, port: 8080}
          readinessProbe:
            httpGet: {path: /actuator/health/readiness, port: 8080}
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 10"]  # 优雅关闭
```

---

## 23.3 Pod 设计模式

```java
// Pod 设计模式的核心理念：
// 一个 Pod 中可以有多个容器——利用这个特性解决常见问题

// 模式1：Sidecar —— 辅助容器
// 应用容器 + Sidecar（如日志收集、服务网格代理）
// Pod:
//   - app-container (Spring Boot) → localhost:8080
//   - envoy-proxy (Istio sidecar) → 处理所有网络流量（TLS/路由/追踪）
// 应用不需要知道 Istio 的存在

// 模式2：Init Container —— 初始化容器
// 在主容器启动前执行初始化任务
// Pod:
//   initContainer: 等待数据库就绪 → 运行 Flyway 迁移 → 退出
//   app-container: 启动 Spring Boot（数据库 schema 已就绪）

// 模式3：Adapter —— 适配器容器
// 统一不同应用的输出格式
// Pod:
//   app-container → 输出自定义格式的 metrics
//   adapter-container → 转换为 Prometheus 格式
```

---

## 23.4 服务部署策略

```yaml
# 策略1：滚动更新（Rolling Update）—— 零停机，默认策略
# 逐步替换旧 Pod 为新 Pod
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # 可以比 replicas 多 1 个 Pod
      maxUnavailable: 0    # 不能有不可用的 Pod

# 策略2：蓝绿部署（Blue-Green）—— 一键回滚
# 蓝环境 = 当前生产，绿环境 = 新版本
# 切换 = 修改 Service 的 selector 从 blue → green
# 回滚 = selector 改回 blue（1秒）

# 策略3：金丝雀发布（Canary）
# 10% 流量 → 新版本，90% → 旧版本
# 观察 1 小时 → 无异常 → 逐渐增加到 50% → 100%
# 异常 → 回滚金丝雀（只影响 10% 的流量）
```

---

## 23.5 本章小结

Kubernetes 是云原生基础设施的事实标准。它的设计哲学——**声明期望状态，控制器持续调和实际状态向期望状态靠近**——是理解现代基础设施的关键思维模型。

从应用开发者的视角，K8s 提供了三个核心价值：(1) 自动调度和扩展——你不指定"在哪台机器上跑"，你声明"我要 3 个实例"；(2) 自我修复——Pod 挂了自动重启；(3) 声明式配置——配置、密钥、存储全部从环境注入，而非打包在镜像里。
