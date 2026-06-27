# 第15章 腾讯云K8s开发者必备技能

## 15.1 容器化技能

### 15.1.1 解决的问题

容器化是云原生应用的基石。开发者在腾讯云TKE上部署应用时，首先需要将应用打包为容器镜像。这一过程涉及三个核心问题：**镜像构建效率**（如何让构建更快）、**镜像体积**（如何让镜像更小）、**运行时安全**（如何让镜像更安全）。缺乏容器化技能会导致构建缓慢、镜像臃肿、安全漏洞频发。

### 15.1.2 核心原理

Docker镜像由只读层（Layer）堆叠而成，每一层对应Dockerfile中的一条指令。层缓存（Layer Cache）机制使得未变更的层可以被复用，但层数过多或层顺序不当会降低缓存命中率。多阶段构建（Multi-stage Build）利用这一原理，在第一个阶段编译代码，在第二个阶段仅复制编译产物，从而将运行时镜像中的构建工具链完全剥离。

### 15.1.3 代码/配置实现

**多阶段构建示例（Java Spring Boot 应用）：**

```dockerfile
# Stage 1: 编译阶段
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: 运行时阶段
FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
USER appuser
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**层优化最佳实践：**

```dockerfile
# 不好的做法：频繁变更的指令放在前面，导致缓存频繁失效
COPY . .
RUN npm install
RUN npm run build

# 好的做法：将不常变更的依赖安装放在前面
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY src ./src
RUN npm run build
```

**镜像安全加固：**

```dockerfile
FROM eclipse-temurin:17-jre-alpine

# 1. 使用非root用户运行
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 2. 删除不必要的系统工具
RUN rm -rf /var/cache/apk/* /tmp/*

# 3. 只读根文件系统
RUN chmod 555 / && chmod 777 /tmp

# 4. 设置安全相关的JVM参数
ENV JAVA_OPTS="-XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=75.0 \
  -Djava.security.egd=file:/dev/./urandom \
  -Dcom.sun.management.jmxremote=false"

USER appuser
COPY --chown=appuser:appgroup app.jar app.jar
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

**多架构镜像构建（使用 Docker Buildx）：**

```bash
# 创建构建器实例
docker buildx create --name multiarch --driver docker-container --use

# 构建并推送多架构镜像到腾讯云 TCR
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ccr.ccs.tencentyun.com/my-project/app:latest \
  --push .
```

**基础镜像选型对比：**

| 基础镜像 | 体积 | 安全面 | 适用场景 |
|----------|------|--------|----------|
| Alpine Linux | ~5MB | 高（攻击面小） | Go/静态编译应用 |
| Distroless | ~20MB | 最高（无shell/包管理器） | Java/Spring Boot生产镜像 |
| Ubuntu 22.04 | ~70MB | 中（需定期更新） | 需要系统工具链的场景 |
| eclipse-temurin:17-jre | ~200MB | 中 | Java应用标准选择 |
| gcr.io/distroless/java17 | ~150MB | 高 | Java生产环境推荐 |

**镜像体积优化技巧：**

```dockerfile
# 1. 使用.dockerignore排除不必要的文件
# .dockerignore
node_modules
.git
*.md
Dockerfile
docker-compose.yml

# 2. 合并RUN指令减少层数
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# 3. 使用--link优化COPY层缓存（Docker v25+）
COPY --link --from=builder /app/target/*.jar app.jar
```

**镜像安全扫描（集成到CI）：**

```bash
# 使用Trivy扫描镜像
trivy image --severity HIGH,CRITICAL \
  --ignore-unfixed \
  ccr.ccs.tencentyun.com/my-project/app:latest

# 使用腾讯云TCR内置扫描（自动触发）
# 在TCR控制台启用"自动扫描"策略
```

### 15.1.4 使用场景

- **微服务容器化**：每个微服务独立构建，多阶段编译确保运行时镜像仅含JRE
- **前端应用**：Nginx + 静态资源，第一阶段构建，第二阶段仅复制dist目录
- **AI推理服务**：基础镜像选择CUDA镜像，多阶段分离训练环境和推理环境
- **离线批处理任务**：使用轻量级Alpine镜像，减少启动时间

### 15.1.5 潜在风险与注意事项

| 风险 | 说明 | 应对措施 |
|------|------|----------|
| 基础镜像漏洞 | Alpine基础镜像可能存在CVE | 定期扫描（Trivy），订阅安全公告 |
| 层缓存污染 | CI环境中缓存未正确清理 | 使用 `--no-cache-filter` 选择性失效 |
| 多架构兼容性 | ARM64上编译的native库不兼容AMD64 | 使用Buildx多架构构建，CI中测试 |
| 密钥泄露 | 构建过程中ARG/ENV泄露密钥 | 使用 `--secret` 参数，避免写入层 |

### 15.1.6 容器调试

```bash
# 1. 进入运行中容器
kubectl exec -it pod-name -- /bin/sh

# 2. 使用临时调试容器（K8s v1.23+）
kubectl debug pod-name -it \
  --image=nicolaka/netshoot:latest \
  --target=app-container

# 3. 在TKE上调试节点问题
kubectl debug node/node-name -it \
  --image=tencentcloudcr/tshark:latest

# 4. 复制文件
kubectl cp pod-name:/app/logs/app.log ./local-app.log
```

### 15.1.7 本章小结

容器化技能是云原生开发的起点。核心要点：**多阶段构建**分离编译与运行环境，**层顺序优化**最大化缓存命中率，**非root用户**和**只读文件系统**提升安全性，**Buildx**实现多架构支持。在腾讯云TKE环境中，建议将镜像推送至TCR（Tencent Container Registry）并使用内网拉取以加速部署。

---

## 15.2 Kubernetes 技能

### 15.2.1 解决的问题

Kubernetes是容器编排的事实标准，腾讯云TKE提供了托管的K8s控制面。开发者需要掌握K8s核心资源对象和kubectl操作，才能有效管理应用的生命周期。缺乏K8s技能会导致部署配置错误、故障排查困难、资源利用率低下。

### 15.2.2 核心原理

K8s采用声明式API模型：用户通过YAML描述期望状态（Desired State），控制面中的各个控制器（Controller）不断调谐（Reconcile）当前状态至期望状态。核心资源对象包括：

- **Pod**：最小调度单元，包含一个或多个容器
- **Deployment**：管理Pod副本集，支持滚动更新和回滚
- **Service**：提供稳定的网络端点，实现服务发现和负载均衡
- **Ingress**：七层路由，将外部流量分发到内部Service
- **ConfigMap/Secret**：配置和敏感数据管理
- **PersistentVolumeClaim**：持久化存储声明

### 15.2.3 代码/配置实现

**完整的应用部署示例：**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
        version: v1
    spec:
      containers:
      - name: order
        image: ccr.ccs.tencentyun.com/my-project/order-service:1.2.3
        ports:
        - containerPort: 8080
          protocol: TCP
        env:
        - name: DB_CONNECTION
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: connection-string
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: log.level
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 8080
  selector:
    app: order-service
---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: order-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: qcloud
    ingress.cloud.tencent.com/rewrite: "/"
spec:
  rules:
  - host: order.myapp.com
    http:
      paths:
      - path: /api/orders
        pathType: Prefix
        backend:
          service:
            name: order-service
            port:
              number: 80
```

**ConfigMap 和 Secret：**

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  log.level: "INFO"
  app.mode: "production"
  cache.ttl: "300"

# secret.yaml（值需base64编码）
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
  namespace: production
type: Opaque
data:
  connection-string: cG9zdGdyZXM6Ly91c2VyOnBhc3N3b3JkQHRlbnBjZW50LmNvbTo1NDMyL2Ri
```

**kubectl 日常操作命令：**

```bash
# 命名空间操作
kubectl get ns
kubectl create ns production
kubectl config set-context --current --namespace=production

# 工作负载管理
kubectl get pods -o wide
kubectl get deployment -w
kubectl rollout status deployment/order-service
kubectl rollout history deployment/order-service
kubectl rollout undo deployment/order-service --to-revision=2

# 日志和调试
kubectl logs -f deployment/order-service --tail=100
kubectl logs -f pod/order-service-xxx --container=sidecar
kubectl describe pod order-service-xxx
kubectl get events --sort-by='.lastTimestamp'

# 端口转发（本地调试）
kubectl port-forward svc/order-service 8080:80

# 资源伸缩
kubectl scale deployment/order-service --replicas=5
kubectl autoscale deployment/order-service --min=3 --max=10 --cpu-percent=80

# 节点和集群
kubectl top nodes
kubectl top pods
kubectl get nodes -o jsonpath='{.items[*].status.nodeInfo.kubeletVersion}'
```

**故障排查命令集：**

```bash
# 排查Pod启动失败
kubectl describe pod <pod-name>
kubectl logs <pod-name> --previous

# 排查Service无法访问
kubectl get endpoints <service-name>
kubectl exec -it <any-pod> -- nslookup <service-name>
kubectl exec -it <any-pod> -- curl -v http://<service-name>:<port>

# 排查节点资源不足
kubectl describe node <node-name>
kubectl get pods --field-selector=spec.nodeName=<node-name> -o wide

# 排查PVC挂载问题
kubectl describe pvc <pvc-name>
kubectl describe pv <pv-name>
```

### 15.2.4 Helm 包管理

**Chart 目录结构：**

```
my-chart/
├── Chart.yaml          # 元数据
├── values.yaml         # 默认配置值
├── values-production.yaml  # 环境覆盖
├── charts/             # 子chart依赖
├── templates/
│   ├── _helpers.tpl    # 模板辅助函数
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── hpa.yaml
│   └── NOTES.txt       # 安装后提示信息
└── .helmignore
```

**Chart.yaml 示例：**

```yaml
apiVersion: v2
name: order-service
description: 订单服务 Helm Chart
type: application
version: 1.2.3
appVersion: "1.2.3"
dependencies:
  - name: redis
    version: "~17.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
  - name: postgresql
    version: "~12.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
```

**模板文件示例（deployment.yaml）：**

```yaml
{{- $name := include "chart.fullname" . -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ $name }}
  namespace: {{ .Values.namespace | default "default" }}
  labels:
    app: {{ $name }}
    chart: "{{ .Chart.Name }}-{{ .Chart.Version }}"
spec:
  replicas: {{ .Values.replicaCount }}
  strategy:
    type: {{ .Values.updateStrategy }}
  selector:
    matchLabels:
      app: {{ $name }}
  template:
    metadata:
      labels:
        app: {{ $name }}
        {{- if .Values.podLabels }}
        {{- toYaml .Values.podLabels | nindent 8 }}
        {{- end }}
    spec:
      {{- if .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml .Values.imagePullSecrets | nindent 8 }}
      {{- end }}
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - containerPort: {{ .Values.service.targetPort }}
        env:
        {{- range $key, $val := .Values.env }}
        - name: {{ $key }}
          value: {{ $val | quote }}
        {{- end }}
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
```

**values.yaml 示例：**

```yaml
namespace: production
replicaCount: 3
updateStrategy: RollingUpdate

image:
  repository: ccr.ccs.tencentyun.com/my-project/order-service
  tag: "1.2.3"
  pullPolicy: IfNotPresent

imagePullSecrets:
  - name: tencent-registry-key

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

ingress:
  enabled: true
  host: order.myapp.com
  path: /api/orders

resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi

env:
  LOG_LEVEL: INFO
  APP_MODE: production

redis:
  enabled: true
  auth:
    enabled: true
    password: "redis-password"

postgresql:
  enabled: false
```

**Helm 常用命令：**

```bash
# 创建新chart
helm create my-chart

# 添加仓库
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 安装/升级
helm install order-service ./my-chart -f values-production.yaml
helm upgrade order-service ./my-chart --set image.tag=1.3.0

# 回滚
helm rollback order-service 2

# 依赖管理
helm dependency update ./my-chart
helm dependency build ./my-chart

# 模板渲染预览（不安装）
helm template ./my-chart -f values-production.yaml

# 在腾讯云TKE上使用Helm
helm install app ./my-chart \
  --set image.repository=ccr.ccs.tencentyun.com/my-project/app \
  --set image.tag=latest
```

### 15.2.5 使用场景

- **微服务部署**：每个服务一个Deployment + Service + Ingress
- **有状态应用**：StatefulSet + Headless Service + PVC
- **定时任务**：CronJob + ConfigMap（脚本配置）
- **蓝绿部署**：两个Deployment + Service切换selector
- **金丝雀发布**：Ingress权重路由 + 两个Deployment

### 15.2.6 潜在风险与注意事项

| 风险 | 说明 | 应对措施 |
|------|------|----------|
| 资源限制缺失 | Pod无资源限制导致节点OOM | 始终设置requests/limits，启用LimitRange |
| 镜像拉取策略 | 默认`IfNotPresent`导致本地旧镜像 | 显式设置`imagePullPolicy: Always` |
| 配置硬编码 | 敏感信息明文在YAML中 | 使用Secret + External Secrets Operator |
| 滚动更新中断 | maxUnavailable过大导致服务不可用 | 设置PDB（PodDisruptionBudget） |
| Helm values泄露 | values文件包含密码提交到Git | 使用Sealed Secrets或Vault插件 |

### 15.2.7 本章小结

K8s技能的核心是理解**声明式API**和**控制器模式**。掌握Deployment、Service、Ingress、ConfigMap/Secret、PVC这五大核心资源即可覆盖90%的日常需求。kubectl是操作K8s的瑞士军刀，建议将常用命令写成脚本或alias。Helm将K8s资源打包为可复用的Chart，是团队标准化部署的最佳实践。在腾讯云TKE上，建议结合CLB（Cloud Load Balancer）和 CBS（Cloud Block Storage）使用。

---

## 15.3 DevOps 技能

### 15.3.1 解决的问题

DevOps旨在打破开发与运维之间的壁垒，通过自动化和协作加速软件交付。在腾讯云K8s环境中，DevOps实践解决的核心问题是：**如何从代码提交到生产部署实现全自动化**，同时保证质量、安全和可追溯性。

### 15.3.2 核心原理

DevOps流水线遵循**持续集成（CI）→ 持续交付（CD）→ 持续部署**的递进关系。CI阶段关注代码质量（lint、测试、安全扫描），CD阶段关注制品管理和环境部署。GitOps将Git仓库作为单一事实来源（Single Source of Truth），集群状态通过自动同步与Git保持一致。

### 15.3.3 代码/配置实现

**CI/CD 流水线设计（基于腾讯云CODING）：**

```yaml
# .coding-ci.yml
stages:
  - checkout
  - lint
  - test
  - build
  - scan
  - deploy-staging
  - deploy-production

checkout:
  stage: checkout
  script:
    - git checkout $CI_COMMIT_REF_NAME
    - git submodule update --init --recursive

lint:
  stage: lint
  script:
    - mvn checkstyle:check
    - mvn pmd:check
  artifacts:
    paths:
      - target/checkstyle-result.xml
    expire_in: 30 days

test:
  stage: test
  script:
    - mvn test -B
    - mvn jacoco:report
  artifacts:
    paths:
      - target/site/jacoco/
    expire_in: 30 days

build:
  stage: build
  script:
    - mvn package -DskipTests -B
    - docker build -t ccr.ccs.tencentyun.com/my-project/app:$CI_COMMIT_SHORT_SHA .
    - docker push ccr.ccs.tencentyun.com/my-project/app:$CI_COMMIT_SHORT_SHA
  artifacts:
    paths:
      - target/*.jar
    expire_in: 7 days

scan:
  stage: scan
  script:
    - trivy image ccr.ccs.tencentyun.com/my-project/app:$CI_COMMIT_SHORT_SHA
    - trivy fs --severity HIGH,CRITICAL .

deploy-staging:
  stage: deploy-staging
  script:
    - helm upgrade --install app ./charts/app \
        --set image.tag=$CI_COMMIT_SHORT_SHA \
        --namespace staging
  environment:
    name: staging
  only:
    - develop

deploy-production:
  stage: deploy-production
  script:
    - helm upgrade --install app ./charts/app \
        --set image.tag=$CI_COMMIT_SHORT_SHA \
        --namespace production
  environment:
    name: production
  when: manual
  only:
    - main
```

**GitOps 实践（ArgoCD Application）：**

```yaml
# argocd-application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: order-service
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-company/k8s-manifests.git
    targetRevision: main
    path: apps/order-service/overlays/production
    helm:
      valueFiles:
        - values-production.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
```

**GitOps 目录结构：**

```
k8s-manifests/
├── apps/
│   ├── order-service/
│   │   ├── base/
│   │   │   ├── kustomization.yaml
│   │   │   ├── deployment.yaml
│   │   │   └── service.yaml
│   │   └── overlays/
│   │       ├── staging/
│   │       │   ├── kustomization.yaml
│   │       │   └── values.yaml
│   │       └── production/
│   │           ├── kustomization.yaml
│   │           └── values.yaml
├── infrastructure/
│   ├── namespace.yaml
│   ├── rbac.yaml
│   └── network-policy.yaml
└── argocd/
    └── applications.yaml
```

### 15.3.4 基础设施即代码（IaC）

**Terraform 配置（腾讯云Provider）：**

```hcl
# main.tf
terraform {
  required_providers {
    tencentcloud = {
      source = "tencentcloudstack/tencentcloud"
      version = "~> 1.81.0"
    }
  }
}

provider "tencentcloud" {
  region = "ap-guangzhou"
}

# 创建TKE集群
resource "tencentcloud_kubernetes_cluster" "main" {
  cluster_name                    = "production-cluster"
  cluster_version                 = "1.28.3"
  cluster_os                      = "ubuntu"
  cluster_internet                = true
  cluster_internet_security_group = tencentcloud_security_group.tke_sg.id
  managed_cluster_internet        = true

  worker_config {
    count           = 3
    instance_type   = "S5.LARGE8"
    system_disk_type = "CLOUD_SSD"
    system_disk_size = 50
    subnet_id       = tencentcloud_subnet.private.id
    internet_charge_type = "TRAFFIC_POSTPAID_BY_HOUR"
    internet_max_bandwidth_out = 1
    password        = var.node_password
  }

  labels = {
    env = "production"
  }
}

# 创建TCR镜像仓库
resource "tencentcloud_tcr_instance" "main" {
  name          = "my-project-tcr"
  instance_type = "basic"
  tags = {
    Environment = "production"
  }
}

resource "tencentcloud_tcr_namespace" "app" {
  instance_id    = tencentcloud_tcr_instance.main.id
  name           = "my-project"
  is_public      = false
  is_auto_scan   = true
}

# 创建CBS存储类
resource "tencentcloud_kubernetes_storage_class" "cbs" {
  name       = "cbs-premium"
  type       = "CLOUD_PREMIUM"
  zone       = "ap-guangzhou-7"
  allow_expand = true
  mount_options = ["hard", "nfsvers=4.0"]
}

# 输出集群信息
output "cluster_endpoint" {
  value = tencentcloud_kubernetes_cluster.main.cluster_external_endpoint
}

output "cluster_ca_cert" {
  value     = tencentcloud_kubernetes_cluster.main.certification_authority
  sensitive = true
}
```

**Pulumi 配置（TypeScript）：**

```typescript
import * as tencentcloud from "@pulumi/tencentcloud";
import * as k8s from "@pulumi/kubernetes";

// 创建TKE集群
const cluster = new tencentcloud.kubernetes.Cluster("production-cluster", {
  clusterName: "production-cluster",
  clusterVersion: "1.28.3",
  clusterOs: "ubuntu",
  clusterInternet: true,
  workerConfig: {
    count: 3,
    instanceType: "S5.LARGE8",
    systemDiskType: "CLOUD_SSD",
    systemDiskSize: 50,
    subnetId: privateSubnet.id,
  },
});

// 部署应用到集群
const k8sProvider = new k8s.Provider("tke-provider", {
  kubeconfig: cluster.kubeConfig,
});

const deployment = new k8s.apps.v1.Deployment("order-service", {
  metadata: { name: "order-service", namespace: "production" },
  spec: {
    replicas: 3,
    selector: { matchLabels: { app: "order-service" } },
    template: {
      metadata: { labels: { app: "order-service" } },
      spec: {
        containers: [{
          name: "order",
          image: "ccr.ccs.tencentyun.com/my-project/order-service:latest",
          ports: [{ containerPort: 8080 }],
        }],
      },
    },
  },
}, { provider: k8sProvider });
```

**Flux CD 配置示例：**

```yaml
# flux-gitrepository.yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: order-service
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/my-company/k8s-manifests.git
  ref:
    branch: main
---
# flux-kustomization.yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: order-service
  namespace: flux-system
spec:
  interval: 5m
  path: ./apps/order-service/overlays/production
  prune: true
  sourceRef:
    kind: GitRepository
    name: order-service
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: order-service
      namespace: production
  postBuild:
    substitute:
      image_tag: "1.2.3"
```

**制品管理策略：**

```yaml
# 制品命名规范
# 镜像Tag策略
格式: <项目名>/<服务名>:<语义化版本>-<Git短SHA>
示例: my-project/order-service:1.2.3-a1b2c3d

# 制品保留策略
规则:
  开发环境: 保留最近50个版本
  测试环境: 保留最近20个版本
  生产环境: 保留所有已部署版本 + 最近100个版本

# TCR 清理策略（通过API定时执行）
tccli tcr DeleteImage \
  --RegistryId tcr-xxxxx \
  --RepositoryName my-project/order-service \
  --ImageVersion "1.1.0-xxxxx"
```

**流水线门禁设计：**

```yaml
# 质量门禁检查清单
quality_gates:
  code_quality:
    - 单元测试覆盖率 >= 80%
    - 代码规范检查通过（CheckStyle/ESLint）
    - 无已知CVE（Trivy扫描通过）

  security:
    - 依赖项安全扫描通过（Snyk/Trivy）
    - 密钥扫描（无硬编码密码）
    - SAST静态代码分析通过

  performance:
    - 构建时间不超过10分钟
    - 镜像体积不超过500MB
    - 接口响应时间基准测试通过

  approval:
    - 开发环境：自动部署
    - 测试环境：自动部署 + 集成测试通过
    - 生产环境：人工审批 + 变更窗口
```

### 15.3.5 使用场景

- **多环境部署**：dev/staging/production 环境通过Helm values差异化配置
- **自动回滚**：ArgoCD检测到集群状态与Git不一致时自动回滚
- **数据库变更管理**：CI流水线中集成Liquibase/Flyway迁移脚本
- **审批门禁**：生产环境部署需要人工审批 + 自动化质量门禁

### 15.3.6 潜在风险与注意事项

| 风险 | 说明 | 应对措施 |
|------|------|----------|
| 密钥管理 | IaC代码中硬编码密钥 | 使用Terraform Vault Provider或TencentCloud SSM |
| 漂移检测 | 手动修改集群导致IaC状态不一致 | 定期 `terraform plan`，启用Drift Detection |
| 流水线安全 | CI Token泄露可导致供应链攻击 | 使用OIDC身份认证，限制Token权限 |
| GitOps同步冲突 | 直接kubectl apply覆盖Git状态 | 启用ArgoCD `selfHeal`，禁止手动操作 |

### 15.3.7 本章小结

DevOps技能的核心是**自动化一切可自动化的事情**。CI/CD流水线确保每次代码提交都经过lint、测试、构建、扫描的完整流程。GitOps将Git作为部署的唯一入口，杜绝了"谁在服务器上改了啥"的问题。IaC将基础设施纳入版本管理，使得集群创建和配置变更可审计、可复现。在腾讯云上，推荐使用CODING DevOps + TKE + TCR的组合，实现从代码到容器的全链路自动化。

---

## 15.4 可观测性技能

### 15.4.1 解决的问题

在K8s环境中，服务实例动态变化、调用链路复杂，传统"SSH到服务器看日志"的方式已不可行。可观测性（Observability）通过**日志（Logs）**、**指标（Metrics）**、**链路追踪（Traces）** 三大支柱，帮助开发者理解系统内部状态。

### 15.4.2 核心原理

- **RED方法**：Rate（请求速率）、Errors（错误率）、Duration（响应时长）——适用于面向用户的服务
- **USE方法**：Utilization（利用率）、Saturation（饱和度）、Errors（错误率）——适用于基础设施
- **SLI/SLO**：Service Level Indicator（服务水平指标）→ Service Level Objective（服务水平目标）→ Service Level Agreement（服务水平协议）
- **OpenTelemetry**：统一的遥测数据采集标准，支持多语言SDK和多种后端

### 15.4.3 代码/配置实现

**结构化日志（Java + Logback）：**

```xml
<!-- logback-spring.xml -->
<configuration>
  <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
      <includeContext>false</includeContext>
      <customFields>{"service":"order-service","env":"production"}</customFields>
    </encoder>
  </appender>

  <root level="INFO">
    <appender-ref ref="JSON" />
  </root>
</configuration>
```

```java
// 结构化日志输出示例
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public Order createOrder(CreateOrderRequest request) {
        MDC.put("traceId", request.getTraceId());
        MDC.put("userId", request.getUserId());

        log.info("开始创建订单 order={}, amount={}", request.getOrderId(), request.getAmount());

        try {
            Order order = orderRepository.save(request.toOrder());
            MDC.put("orderId", order.getId());
            log.info("订单创建成功 durationMs={}", System.currentTimeMillis() - request.getTimestamp());
            return order;
        } catch (Exception e) {
            log.error("订单创建失败 errorType={}, errorMessage={}",
                e.getClass().getSimpleName(), e.getMessage(), e);
            throw new OrderCreationException("创建订单失败", e);
        } finally {
            MDC.clear();
        }
    }
}
```

**日志级别规范：**

| 级别 | 使用场景 | 示例 |
|------|----------|------|
| TRACE | 调试用详细日志，生产环境关闭 | SQL参数值、循环内状态 |
| DEBUG | 开发调试信息 | 配置加载、缓存命中/未命中 |
| INFO | 关键业务流程节点 | 订单创建、支付回调、用户注册 |
| WARN | 非异常但需关注的情况 | 重试、限流触发、降级执行 |
| ERROR | 需要人工介入的异常 | 数据库连接失败、第三方服务超时 |

**Metrics 设计（Prometheus + Micrometer）：**

```java
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;

@Component
public class OrderMetrics {
    private final Counter orderCreatedCounter;
    private final Counter orderFailedCounter;
    private final Timer orderProcessingTimer;
    private final Gauge pendingOrdersGauge;

    public OrderMetrics(MeterRegistry registry) {
        orderCreatedCounter = Counter.builder("orders.created.total")
            .description("累计创建订单数")
            .tag("service", "order-service")
            .register(registry);

        orderFailedCounter = Counter.builder("orders.failed.total")
            .description("累计失败订单数")
            .tag("service", "order-service")
            .register(registry);

        orderProcessingTimer = Timer.builder("orders.processing.duration")
            .description("订单处理耗时")
            .tag("service", "order-service")
            .publishPercentiles(0.5, 0.9, 0.99)
            .register(registry);

        pendingOrdersGauge = Gauge.builder("orders.pending.current", this,
            OrderMetrics::getPendingOrderCount)
            .description("当前待处理订单数")
            .register(registry);
    }

    public void recordOrderCreated() {
        orderCreatedCounter.increment();
    }

    public void recordOrderFailed(String reason) {
        orderFailedCounter.increment();
    }

    public <T> T recordOrderProcessing(Supplier<T> supplier) {
        return orderProcessingTimer.record(supplier);
    }

    private int getPendingOrderCount() {
        return orderRepository.countByStatus(OrderStatus.PENDING);
    }
}
```

**SLI/SLO 定义示例：**

```yaml
# slo.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: order-service-slo
  namespace: monitoring
spec:
  groups:
  - name: slo
    rules:
    # SLI: 请求成功率（5xx / 总请求）
    - record: job:slo_errors_total:rate5m
      expr: |
        sum(rate(http_requests_total{service="order-service",status=~"5.."}[5m]))
        / sum(rate(http_requests_total{service="order-service"}[5m]))

    # SLO: 99.9% 可用性（30天窗口）
    - alert: SLOViolation
      expr: |
        (1 - job:slo_errors_total:rate5m) < 0.999
      for: 10m
      labels:
        severity: critical
      annotations:
        summary: "订单服务SLO违反（当前: {{ $value | humanizePercentage }}）"
        description: "订单服务30天滚动窗口可用性低于99.9%"
```

**OpenTelemetry 分布式追踪（Java）：**

```java
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.Context;
import io.opentelemetry.api.trace.SpanKind;

@Service
public class OrderTracingService {
    private final Tracer tracer;

    public OrderTracingService(OpenTelemetry openTelemetry) {
        this.tracer = openTelemetry.getTracer("order-service", "1.0.0");
    }

    public Order processOrder(String orderId) {
        Span span = tracer.spanBuilder("processOrder")
            .setSpanKind(SpanKind.SERVER)
            .setAttribute("order.id", orderId)
            .setAttribute("service.name", "order-service")
            .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // 注入trace上下文到HTTP头
            HttpHeaders headers = new HttpHeaders();
            OpenTelemetryPropagators.getTextMapPropagator()
                .inject(Context.current(), headers, (carrier, key, value) ->
                    carrier.set(key, value));

            // 调用下游服务
            ResponseEntity<PaymentResult> response = restTemplate.exchange(
                "http://payment-service/api/pay/" + orderId,
                HttpMethod.POST,
                new HttpEntity<>(headers),
                PaymentResult.class
            );

            span.setAttribute("payment.status", response.getBody().getStatus());
            return buildOrder(response.getBody());
        } catch (Exception e) {
            span.recordException(e);
            span.setStatus(StatusCode.ERROR, "订单处理异常: " + e.getMessage());
            throw e;
        } finally {
            span.end();
        }
    }
}
```

**OpenTelemetry Collector 配置：**

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
  attributes:
    actions:
      - key: environment
        value: production
        action: upsert

exporters:
  otlp:
    endpoint: "ap-guangzhou.tencentcloud.com:4317"
    headers:
      "X-Tencent-Service": "tcm"
      "X-Tencent-SecretId": "${SECRET_ID}"
      "X-Tencent-SecretKey": "${SECRET_KEY}"
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: "order_service"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, attributes]
      exporters: [otlp]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

**Grafana 仪表盘配置（JSON Model）：**

```json
{
  "title": "Order Service Dashboard",
  "panels": [
    {
      "title": "请求速率（RPS）",
      "type": "graph",
      "targets": [{
        "expr": "sum(rate(http_requests_total{service=\"order-service\"}[5m]))",
        "legendFormat": "总请求"
      }],
      "gridPos": {"x": 0, "y": 0, "w": 8, "h": 6}
    },
    {
      "title": "P99 响应延迟",
      "type": "graph",
      "targets": [{
        "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service=\"order-service\"}[5m])) by (le))",
        "legendFormat": "P99"
      }],
      "gridPos": {"x": 8, "y": 0, "w": 8, "h": 6}
    },
    {
      "title": "错误率",
      "type": "graph",
      "targets": [{
        "expr": "sum(rate(http_requests_total{service=\"order-service\",status=~\"5..\"}[5m])) / sum(rate(http_requests_total{service=\"order-service\"}[5m])) * 100",
        "legendFormat": "错误率%"
      }],
      "gridPos": {"x": 16, "y": 0, "w": 8, "h": 6}
    }
  ]
}
```

**腾讯云 CLS 日志查询示例：**

```sql
# CLS 日志分析查询（SQL模式）
SELECT
  COALESCE(traceId, '-') AS trace_id,
  COUNT(*) AS log_count,
  AVAL(responseTime) AS avg_response_ms,
  MAX(responseTime) AS max_response_ms
WHERE
  service = 'order-service'
  AND __TIMESTAMP__ > NOW() - INTERVAL 1 HOUR
GROUP BY traceId
HAVING max_response_ms > 1000
ORDER BY max_response_ms DESC
LIMIT 20

# 错误日志聚合查询
SELECT
  level,
  errorType,
  COUNT(*) AS count
WHERE
  service = 'order-service'
  AND level = 'ERROR'
  AND __TIMESTAMP__ > NOW() - INTERVAL 24 HOUR
GROUP BY level, errorType
ORDER BY count DESC
```

**告警规则设计：**

```yaml
# prometheus-alerts.yaml
groups:
- name: order-service-alerts
  rules:
  # 高错误率告警
  - alert: HighErrorRate
    expr: |
      rate(http_requests_total{service="order-service",status=~"5.."}[5m])
      / rate(http_requests_total{service="order-service"}[5m]) > 0.01
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "订单服务错误率超过1%"
      description: "当前错误率: {{ $value | humanizePercentage }}"

  # P99延迟告警
  - alert: HighLatency
    expr: |
      histogram_quantile(0.99,
        rate(http_request_duration_seconds_bucket{service="order-service"}[5m])
      ) > 2.0
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "订单服务P99延迟超过2秒"

  # Pod重启告警
  - alert: PodCrashLooping
    expr: |
      rate(kube_pod_container_status_restarts_total{namespace="production"}[30m]) > 1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Pod {{ $labels.pod }} 频繁重启"
```

### 15.4.4 使用场景

- **故障定位**：通过traceId串联完整调用链，快速定位瓶颈服务
- **容量规划**：基于RED指标的历史趋势进行资源预估
- **SLO监控**：实时监控SLO达成率，在违反前触发告警
- **成本优化**：通过Metrics分析资源利用率，识别浪费

### 15.4.5 潜在风险与注意事项

| 风险 | 说明 | 应对措施 |
|------|------|----------|
| 采样率过高 | 全量采样导致存储成本激增 | 使用头采样（Head Sampling），生产环境10% |
| 日志爆炸 | 错误循环打印日志 | 实现日志熔断，Error级别限流 |
| 指标基数爆炸 | 高基数Label导致Prometheus OOM | 避免将userId、orderId作为Label |
| Trace上下文丢失 | 异步处理中未正确传递Context | 使用W3C Trace Context标准，检查传播 |

### 15.4.6 本章小结

可观测性是K8s环境下的"眼睛"。**结构化日志**确保日志可被机器解析和搜索，**RED/USE方法**提供标准化的指标设计框架，**OpenTelemetry**统一了遥测数据采集标准。在腾讯云上，日志可接入CLS（Cloud Log Service），指标可使用Prometheus + Grafana，链路追踪可接入TCM（Tencent Cloud Monitor）或自建Jaeger。建议团队制定统一的日志规范和指标命名规范，避免各自为政。

---

## 15.5 腾讯云平台技能

### 15.5.1 解决的问题

腾讯云提供了丰富的云原生产品矩阵，包括TKE（容器服务）、TCR（镜像仓库）、CLS（日志服务）、Prometheus监控等。开发者需要掌握这些平台工具的操作和API调用，才能充分发挥云平台的优势。

### 15.5.2 核心原理

腾讯云TKE是托管Kubernetes服务，控制面由腾讯云管理，用户只需关注Worker节点和应用。TKE深度集成腾讯云VPC、CLB、CBS、CLS等基础设施，提供一键部署、弹性伸缩、日志采集等能力。

### 15.5.3 代码/配置实现

**TKE 控制台操作要点：**

```
集群管理：
  1. 创建集群：选择地域、K8s版本（推荐1.28+）、节点规格
  2. 节点池管理：配置弹性伸缩、自动修复
  3. 命名空间管理：资源配额、网络策略

工作负载管理：
  1. Deployment：创建、更新、伸缩、回滚
  2. Service：ClusterIP/NodePort/LB类型选择
  3. Ingress：配置CLB HTTPS证书、重写规则

网络配置：
  1. VPC-CNI vs GlobalRouter：性能 vs IP消耗
  2. CLB 直通Pod：绕过NodePort，源IP保留
  3. 网络策略：NetworkPolicy隔离命名空间
```

**TencentCloud API 调用（Python SDK）：**

```python
#!/usr/bin/env python3
"""TKE集群管理示例"""
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.tke.v20180525 import tke_client, models

# 初始化凭证
cred = credential.Credential(
    secret_id="your-secret-id",
    secret_key="your-secret-key"
)
client = tke_client.TkeClient(cred, "ap-guangzhou")

# 1. 查询集群列表
def list_clusters():
    req = models.DescribeClustersRequest()
    req.ClusterType = "MANAGED_CLUSTER"
    req.Limit = 20

    try:
        resp = client.DescribeClusters(req)
        for cluster in resp.Clusters:
            print(f"集群ID: {cluster.ClusterId}")
            print(f"集群名称: {cluster.ClusterName}")
            print(f"集群版本: {cluster.ClusterVersion}")
            print(f"集群状态: {cluster.ClusterStatus}")
            print(f"节点数: {cluster.ClusterNodeNum}")
            print("-" * 40)
    except TencentCloudSDKException as e:
        print(f"查询失败: {e}")

# 2. 创建集群
def create_cluster():
    req = models.CreateClusterRequest()
    req.ClusterName = "demo-cluster"
    req.ClusterVersion = "1.28.3"
    req.ClusterOs = "ubuntu"
    req.ClusterType = "MANAGED_CLUSTER"
    req.VpcId = "vpc-xxxxx"
    req.SubnetId = "subnet-xxxxx"

    # 节点配置
    req.WorkerConfig = {
        "Count": 3,
        "InstanceType": "S5.LARGE8",
        "SystemDisk": {
            "DiskType": "CLOUD_SSD",
            "DiskSize": 50
        },
        "InternetAccessible": {
            "InternetChargeType": "TRAFFIC_POSTPAID_BY_HOUR",
            "InternetMaxBandwidthOut": 1
        }
    }

    try:
        resp = client.CreateCluster(req)
        print(f"集群创建中，集群ID: {resp.ClusterId}")
        return resp.ClusterId
    except TencentCloudSDKException as e:
        print(f"创建失败: {e}")

# 3. 获取集群kubeconfig
def get_kubeconfig(cluster_id: str):
    req = models.DescribeClusterKubeconfigRequest()
    req.ClusterId = cluster_id

    try:
        resp = client.DescribeClusterKubeconfig(req)
        return resp.Kubeconfig
    except TencentCloudSDKException as e:
        print(f"获取kubeconfig失败: {e}")

# 4. 伸缩节点池
def scale_node_pool(cluster_id: str, node_pool_id: str, target_size: int):
    req = models.ModifyNodePoolDesiredCapacityAboutNodePoolRequest()
    req.ClusterId = cluster_id
    req.NodePoolId = node_pool_id
    req.DesiredCapacity = target_size

    try:
        resp = client.ModifyNodePoolDesiredCapacityAboutNodePool(req)
        print(f"节点池伸缩成功，目标节点数: {target_size}")
    except TencentCloudSDKException as e:
        print(f"伸缩失败: {e}")
```

**TencentCloud API 调用（Go SDK）：**

```go
package main

import (
    "fmt"
    "os"

    tke "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/tke/v20180525"
    "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common"
    "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/errors"
    "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/profile"
)

func main() {
    // 初始化凭证
    cred := common.NewCredential(
        os.Getenv("TENCENTCLOUD_SECRET_ID"),
        os.Getenv("TENCENTCLOUD_SECRET_KEY"),
    )
    cpf := profile.NewClientProfile()
    cpf.HttpProfile.Endpoint = "tke.tencentcloudapi.com"
    client, _ := tke.NewClient(cred, "ap-guangzhou", cpf)

    // 查询集群列表
    request := tke.NewDescribeClustersRequest()
    request.Limit = common.Int64Ptr(20)

    response, err := client.DescribeClusters(request)
    if _, ok := err.(*errors.TencentCloudSDKError); ok {
        fmt.Printf("API错误: %s\n", err)
        return
    }

    for _, cluster := range response.Response.Clusters {
        fmt.Printf("集群: %s (版本: %s, 状态: %s)\n",
            *cluster.ClusterName,
            *cluster.ClusterVersion,
            *cluster.ClusterStatus)
    }

    // 创建镜像仓库
    tcrRequest := tke.NewCreateImageRepositoryRequest()
    tcrRequest.ImageRepositoryName = common.StringPtr("my-project/app")
    tcrRequest.Public = common.Int64Ptr(0)

    _, err = client.CreateImageRepository(tcrRequest)
    if err != nil {
        fmt.Printf("创建仓库失败: %s\n", err)
    } else {
        fmt.Println("镜像仓库创建成功")
    }
}
```

**成本分析与预算告警：**

```bash
# 使用腾讯云CLI查询TKE集群费用
tccli billing DescribeBillDetail \
  --region ap-guangzhou \
  --Month 2025-06 \
  --Limit 100 \
  --query "ResourceTotalSet[?ResourceName.contains(@, 'tke')]" \
  --output json

# 设置预算告警（通过API）
tccli monitor CreateAlarmPolicy \
  --Conditions '[
    {
      "MetricName": "tke_cluster_total_cost",
      "Period": 86400,
      "Operator": "gt",
      "Value": "5000"
    }
  ]' \
  --PolicyName "TKE月度预算告警" \
  --MonitorType "CUSTOM" \
  --Namespace "QCE/TKE"
```

**成本优化策略：**

```yaml
# 成本优化清单
策略:
  资源规格:
    - 使用CVM预留实例（RI）节省40-60%
    - 使用Spot实例处理批处理任务
    - 根据实际负载调整Pod requests/limits

  弹性伸缩:
    - 启用Cluster Autoscaler自动扩缩节点
    - 配置HPA/VPA按负载调整Pod副本
    - 非生产环境夜间缩容至最小

  存储优化:
    - 使用CBS快照定期备份
    - 日志使用COS归档存储
    - 临时数据使用emptyDir而非PVC

  网络优化:
    - 同地域服务使用内网通信
    - 使用CDN加速静态资源
    - 合理配置CLB规格避免浪费
```

**TKE 网络模式对比：**

| 特性 | GlobalRouter（全局路由） | VPC-CNI（弹性网卡） |
|------|------------------------|---------------------|
| Pod IP分配 | 集群内部IP，非VPC可达 | VPC内真实IP，可直接访问 |
| 网络性能 | 有NAT损耗，延迟略高 | 无NAT损耗，原生性能 |
| IP消耗 | 不占用VPC IP | 每个Pod占用一个VPC IP |
| 最大Pod数/节点 | 256 | 受限于弹性网卡配额（通常16-32） |
| 适用场景 | 大规模集群，IP资源紧张 | 对网络性能要求高的场景 |
| 腾讯云推荐 | 通用场景 | 游戏、实时通信、金融交易 |

**TKE 日志采集配置（通过CLS）：**

```yaml
# LogConfig CRD 示例（TKE日志采集）
apiVersion: cls.cloud.tencent.com/v1
kind: LogConfig
metadata:
  name: order-service-log
  namespace: production
spec:
  clsDetail:
    topicId: cls-topic-xxxxx
    logType: json_log
    extractRule:
      beginRegex: "^\\{"
      keys:
        - timestamp
        - level
        - service
        - traceId
        - message
      unMatchUpLoadSwitch: true
      unMatchLogKey: raw_message
  inputDetail:
    inputType: container_stdout
    containerStdout:
      allContainers: false
      container: order
      namespace: production
      workload:
        kind: deployment
        name: order-service
```

**TKE 弹性伸缩配置：**

```yaml
# Cluster Autoscaler 配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-autoscaler-config
  namespace: kube-system
data:
  config.json: |
    {
      "maxNodeProvisionTime": "15m",
      "maxEmptyBulkDelete": 10,
      "scaleDownEnabled": true,
      "scaleDownDelayAfterAdd": "10m",
      "scaleDownDelayAfterDelete": "10m",
      "scaleDownUnneededTime": "10m",
      "scaleDownUtilizationThreshold": 0.5,
      "skipNodesWithLocalStorage": false,
      "skipNodesWithSystemPods": false
    }
---
# HPA 配置
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 120
```

### 15.5.4 使用场景

- **自动化运维**：通过SDK批量管理多个TKE集群
- **成本管控**：通过API拉取账单数据，对接内部成本中心
- **合规审计**：通过CloudAudit记录所有TKE操作日志
- **多云管理**：Terraform统一管理腾讯云+其他云资源

### 15.5.5 潜在风险与注意事项

| 风险 | 说明 | 应对措施 |
|------|------|----------|
| API限频 | 高频调用触发限流 | 实现指数退避重试，批量请求合并 |
| 密钥泄露 | SecretKey硬编码在代码中 | 使用CAM角色 + STS临时密钥 |
| 误操作 | 控制台误删集群 | 开启删除保护，配置资源锁 |
| 成本失控 | 忘记关停测试资源 | 设置预算告警，定期清理未使用资源 |

### 15.5.6 本章小结

腾讯云平台技能的核心是**理解产品边界和API操作**。TKE控制台适合日常运维和故障排查，SDK/CLI适合自动化脚本和CI/CD集成，Terraform适合基础设施的声明式管理。建议团队建立统一的云资源管理规范，包括命名规范、标签规范、成本分摊规则。定期使用腾讯云成本 explorer 分析资源使用情况，结合预留实例和Spot实例优化成本。

---

## 15.6 学习路线图

### 15.6.1 解决的问题

云原生技术栈庞大且更新迅速，初学者容易迷失方向。一个清晰的学习路线图可以帮助开发者按阶段、有重点地掌握所需技能，避免"什么都想学、什么都没学透"的困境。

### 15.6.2 核心原理

学习路线采用**递进式**设计：每个阶段建立在前一阶段的基础上，从"能用"到"用好"再到"精通"。每个阶段都包含理论学习、动手实践和腾讯云平台操作三个维度。

### 15.6.3 学习路线

**第一阶段：入门（0-3个月）**

```
目标：能在TKE上部署一个完整的Web应用

理论学习：
  □ Docker基础：镜像、容器、Dockerfile、docker-compose
  □ K8s核心概念：Pod、Deployment、Service、Ingress
  □ 腾讯云TKE控制台操作：创建集群、部署工作负载

动手实践：
  □ 编写Dockerfile构建Spring Boot/Node.js应用镜像
  □ 使用kubectl部署应用到本地Minikube
  □ 在TKE上创建集群并部署应用
  □ 配置Ingress暴露服务

推荐资源：
  □ Docker官方文档：https://docs.docker.com
  □ Kubernetes官方教程：https://kubernetes.io/docs/tutorials
  □ 腾讯云TKE文档：https://cloud.tencent.com/product/tke
  □ 《Kubernetes in Action》第1-10章

验证标准：
  □ 能独立编写Dockerfile并构建镜像
  □ 能使用kubectl完成日常操作
  □ 能在TKE上部署应用并配置公网访问
```

**第二阶段：进阶（3-6个月）**

```
目标：掌握Helm、CI/CD、监控告警

理论学习：
  □ Helm Chart编写和模板函数
  □ CI/CD流水线设计（CODING DevOps）
  □ Prometheus + Grafana监控
  □ 日志采集（CLS）和结构化日志
  □ GitOps概念和ArgoCD基础

动手实践：
  □ 为应用编写Helm Chart并发布
  □ 搭建完整的CI/CD流水线（构建→测试→部署）
  □ 配置Prometheus监控和Grafana仪表盘
  □ 实现结构化日志并接入CLS
  □ 使用ArgoCD实现GitOps部署

推荐资源：
  □ Helm官方文档：https://helm.sh/docs
  □ 腾讯云CODING DevOps文档
  □ 《Prometheus Up & Running》
  □ ArgoCD官方教程：https://argo-cd.readthedocs.io

验证标准：
  □ 能编写可复用的Helm Chart
  □ 能设计并实现CI/CD流水线
  □ 能配置监控告警并解读指标
```

**第三阶段：高级（6-12个月）**

```
目标：掌握服务网格、安全、性能调优

理论学习：
  □ 服务网格（Istio/TCM）：流量管理、安全策略、可观测性
  □ K8s安全：RBAC、NetworkPolicy、Pod Security Admission
  □ 性能调优：JVM/Node.js调优、K8s资源优化
  □ 多集群管理：联邦集群、跨集群服务发现
  □ 云原生存储：CBS/COS/CFS选型与配置

动手实践：
  □ 在TKE上部署Istio/TCM并配置灰度发布
  □ 实现Pod安全策略和网络隔离
  □ 进行性能基准测试和资源优化
  □ 配置多集群灾备方案
  □ 实现成本分析和优化

推荐资源：
  □ Istio官方文档：https://istio.io
  □ 腾讯云TCM文档
  □ 《Kubernetes Security》
  □ CNCF Cloud Native Landscape

验证标准：
  □ 能独立设计服务网格架构
  □ 能进行安全审计和加固
  □ 能定位和解决性能瓶颈
```

### 15.6.4 学习资源汇总

| 类别 | 资源 | 说明 |
|------|------|------|
| 认证 | CKA（Certified Kubernetes Administrator） | K8s管理员认证，含金量高 |
| 认证 | CKAD（Certified Kubernetes Application Developer） | K8s应用开发者认证 |
| 认证 | 腾讯云TCA/TCP认证 | 腾讯云架构师认证 |
| 书籍 | 《Kubernetes in Action》第2版 | K8s最佳入门书籍 |
| 书籍 | 《Cloud Native Patterns》 | 云原生设计模式 |
| 书籍 | 《Site Reliability Engineering》 | Google SRE实践 |
| 实践 | Killercoda（https://killercoda.com） | 在线K8s实验环境 |
| 实践 | Play with Kubernetes（https://labs.play-with-k8s.com） | 免费K8s沙箱 |
| 社区 | K8s官方Slack（kubernetes.slack.com） | 全球K8s社区 |
| 社区 | 腾讯云+社区 | 腾讯云技术文章和案例 |

### 15.6.5 常见误区与建议

| 误区 | 正确做法 |
|------|----------|
| 一上来就学Istio | 先掌握K8s核心资源，再学习服务网格 |
| 只学理论不动手 | 每个知识点都要在TKE或Minikube上实践 |
| 追求最新版本 | 生产环境使用TKE支持的稳定版本（滞后1-2个小版本） |
| 忽略安全 | 从一开始就养成最小权限原则的习惯 |
| 不关注成本 | 每次创建资源前思考"这个资源是否必要" |

### 15.6.6 常见面试题与自测

以下面试题覆盖了本章的核心知识点，可用于自测学习效果：

**容器化方向：**
1. Docker镜像的层（Layer）是如何工作的？如何优化层缓存？
2. 多阶段构建解决了什么问题？请画出一个Java应用的多阶段构建流程。
3. Distroless镜像和Alpine镜像的区别是什么？生产环境如何选择？
4. 如何排查容器启动失败的问题？列举至少3种调试手段。

**Kubernetes方向：**
1. Deployment的滚动更新策略中，maxUnavailable和maxSurge分别控制什么？
2. Service有哪几种类型？ClusterIP、NodePort、LoadBalancer的区别是什么？
3. ConfigMap和Secret的最大区别是什么？Secret中的数据是如何编码的？
4. Helm的模板函数中，`{{ .Values }}`、`{{ include }}`、`{{ toYaml }}`分别做什么？

**DevOps方向：**
1. GitOps的核心原则是什么？ArgoCD和Flux的实现方式有何不同？
2. CI/CD流水线中，制品版本管理的最佳实践是什么？
3. Terraform的state文件为什么重要？如何安全地管理state文件？

**可观测性方向：**
1. RED方法和USE方法分别适用于什么场景？
2. OpenTelemetry的三大信号（Signals）是什么？它们之间的关系是什么？
3. 高基数（High Cardinality）指标为什么危险？如何避免？

**腾讯云方向：**
1. TKE的GlobalRouter和VPC-CNI两种网络模式如何选择？
2. 如何通过API获取TKE集群的kubeconfig？
3. 腾讯云成本优化有哪些常用策略？

### 15.6.7 本章小结

学习路线图的核心是**循序渐进、知行合一**。入门阶段聚焦Docker和K8s核心概念，在TKE上完成第一个部署；进阶阶段掌握Helm、CI/CD和监控，建立自动化运维能力；高级阶段深入服务网格、安全和性能调优，成为团队中的云原生专家。建议每个阶段都设定明确的验证标准，通过CKA/CKAD认证检验学习成果。持续关注CNCF Landscape和腾讯云新产品动态，保持技术敏感度。

---

## 附录A：常用命令速查

```bash
# ===== Docker =====
docker build -t app:latest .                    # 构建镜像
docker images                                    # 列出镜像
docker rmi <image>                               # 删除镜像
docker exec -it <container> /bin/sh              # 进入容器
docker logs -f <container>                       # 查看日志
docker stats                                     # 查看资源使用
docker system prune -a                           # 清理所有未使用资源

# ===== kubectl =====
kubectl get pods -o wide                         # 查看Pod详情
kubectl describe pod <name>                      # Pod详细信息
kubectl logs -f <pod> --tail=100                 # 查看日志
kubectl exec -it <pod> -- /bin/sh                # 进入Pod
kubectl port-forward svc/<name> 8080:80          # 端口转发
kubectl rollout undo deploy/<name>               # 回滚部署
kubectl top pod                                  # Pod资源使用
kubectl get events --sort-by='.lastTimestamp'    # 查看事件

# ===== Helm =====
helm create <name>                               # 创建Chart
helm install <name> ./chart                      # 安装
helm upgrade <name> ./chart                      # 升级
helm rollback <name> <revision>                  # 回滚
helm list                                        # 列出已安装
helm template ./chart                            # 渲染模板

# ===== 腾讯云CLI =====
tccli tke DescribeClusters                       # 查询集群
tccli tke DescribeClusterKubeconfig             # 获取kubeconfig
tccli monitor DescribeAlarmPolicies             # 查询告警策略
tccli billing DescribeBillDetail                 # 查询账单
```

## 附录B：常见故障排查清单

```yaml
# Pod 状态异常排查
Pod状态: Pending
  原因: 资源不足 / PVC未就绪 / 节点亲和性不满足
  排查:
    - kubectl describe pod <name> | grep Events
    - kubectl describe node | grep -A5 "Allocated resources"
    - kubectl get pvc | grep <pvc-name>

Pod状态: CrashLoopBackOff
  原因: 应用启动失败 / 健康检查失败 / 配置错误
  排查:
    - kubectl logs <pod> --previous
    - kubectl describe pod <name> | grep -A10 "Liveness"
    - 检查ConfigMap/Secret配置是否正确

Pod状态: ImagePullBackOff
  原因: 镜像不存在 / 镜像仓库认证失败 / 网络不通
  排查:
    - 确认镜像Tag在TCR中存在
    - kubectl describe pod <name> | grep "Failed to pull image"
    - 检查imagePullSecrets配置

# Service 访问异常
Service无法访问:
  排查:
    - kubectl get endpoints <service>  # 检查是否有endpoint
    - kubectl exec <pod> -- curl -v http://<service>:<port>
    - 检查Service selector是否匹配Pod label

Ingress不生效:
  排查:
    - kubectl describe ingress <name>
    - 检查CLB控制台是否有对应监听器
    - 确认域名DNS解析指向CLB

# 节点异常
节点NotReady:
  排查:
    - kubectl describe node <name> | grep "Conditions"
    - ssh到节点检查kubelet状态: systemctl status kubelet
    - 检查节点磁盘空间: df -h
    - 检查节点Docker状态: systemctl status docker

# 存储异常
PVC Pending:
  排查:
    - kubectl describe pvc <name>
    - 确认StorageClass存在: kubectl get sc
    - 检查CBS配额是否足够
```
