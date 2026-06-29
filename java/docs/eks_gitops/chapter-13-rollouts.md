# 第13章 渐进式交付与 Argo Rollouts

## 13.1 渐进式交付概述

### 解决的问题

传统的 Kubernetes 应用更新依赖 Deployment 资源的 RollingUpdate 策略。滚动更新的核心逻辑是"逐步替换旧版本 Pod 为新版本 Pod"，由 ReplicaSet 控制器按照 `maxSurge` 和 `maxUnavailable` 参数控制替换速率。这种方式存在几个根本性缺陷：

- **缺乏流量控制**：滚动更新只管理 Pod 的创建与销毁，不触及 Service 的流量路由。新 Pod 一旦 Ready 就立即接入生产流量，无法实现灰度验证。
- **无法基于指标回滚**：滚动更新没有"观察新版本运行指标"的环节。如果新版本存在性能退化或错误率升高，只能依赖人工发现后手动执行 `kubectl rollout undo`。
- **无暂停/审批机制**：滚动更新是自动化的线性流程，不支持"发布到 10% 流量后暂停，等待 QA 或审批通过后再继续"的场景。
- **蓝绿切换成本高**：要实现蓝绿发布，需要手动创建两套 Service 并切换 selector，操作繁琐且容易出错。

渐进式交付（Progressive Delivery）正是为了解决这些问题而生的理念。它将发布过程从"全有或全无"的二进制决策，转变为**可观察、可控制、可自动化的渐进过程**。

### 核心原理

渐进式交付的核心思想可以概括为三个层次：

1. **流量分层**：将生产流量按比例分配给新旧版本，而非一次性切换。例如先让 5% 的流量访问新版本，观察无误后再逐步提升到 10%、25%、50%、100%。
2. **指标驱动**：在每一层流量分配后，持续采集新版本的错误率、延迟、吞吐量等关键指标，与预设的基准阈值进行比较。指标正常则继续推进，异常则自动回滚。
3. **人工审批门禁**：在关键节点（如 50% 流量时）设置暂停点，等待人工确认后再继续。这为安全发布提供了最后一道防线。

Argo Rollouts 是 CNCF Argo 项目家族中专门实现渐进式交付的组件。它与 Kubernetes 原生控制器协作，通过自定义的 `Rollout` CRD 替代 `Deployment`，并提供以下能力：

| 能力 | 说明 |
|------|------|
| 蓝绿部署 | 同时运行两套环境，一次性切换流量 |
| 金丝雀发布 | 按权重逐步增加新版本流量 |
| 指标分析 | 集成 Prometheus、Datadog 等指标系统 |
| 自动回滚 | 指标异常时自动回退到稳定版本 |
| 人工审批 | 支持暂停发布等待人工确认 |
| 流量管理 | 支持 Ingress Controller、Service Mesh 等多种流量方案 |

### 与传统滚动更新的对比

| 维度 | 滚动更新 (RollingUpdate) | 渐进式交付 (Argo Rollouts) |
|------|--------------------------|---------------------------|
| 流量控制 | 无，Pod Ready 即接入流量 | 支持权重分配、Header 路由、镜像流量 |
| 指标验证 | 无 | 支持 Prometheus/Datadog/NewRelic 等 |
| 自动回滚 | 仅支持 Pod 启动失败回滚 | 支持基于指标阈值自动回滚 |
| 人工审批 | 无 | 支持暂停点 + 手动 promote |
| 蓝绿部署 | 需手动实现 | 原生支持 |
| 回滚速度 | 逐 Pod 替换，较慢 | 一键全量切换或按权重回退 |
| 可观测性 | 仅 Pod 状态 | 完整的发布进度与指标面板 |

### 使用场景

- **关键业务服务**：支付、订单、用户认证等核心链路，任何错误都直接影响收入或用户体验。
- **大规模集群**：数百个副本的服务，滚动更新耗时且风险不可控，金丝雀发布可以快速验证并回滚。
- **A/B 测试**：需要将特定用户群体路由到新版本进行功能验证。
- **合规审计**：需要审批流程的发布场景，如金融、医疗等受监管行业。

### 潜在风险与注意事项

- 渐进式交付增加了发布流程的复杂度，需要团队具备相应的运维能力。
- 指标分析依赖完善的监控体系，如果指标采集或查询有延迟，可能导致误判。
- 流量管理方案的选择（Ingress vs Service Mesh）会影响整体架构。

### 本章小结

渐进式交付是对传统滚动更新的根本性升级。它将发布从"替换 Pod"提升到"管理流量 + 观察指标 + 自动决策"的层次。Argo Rollouts 作为 Kubernetes 生态中最成熟的渐进式交付工具，通过 `Rollout` CRD 提供了蓝绿部署、金丝雀发布、指标分析、自动回滚等完整能力。接下来的章节将深入每个能力的具体实现。

---

## 13.2 Argo Rollouts 安装

### 解决的问题

Argo Rollouts 不是一个单一的二进制文件，而是由多个组件组成的系统：控制器（运行在集群内）、kubectl 插件（用于命令行交互）、CRD（自定义资源定义）。安装过程需要确保这些组件版本匹配，并且与现有集群环境（特别是 Argo CD）兼容。

### 核心原理

Argo Rollouts 的架构分为三层：

1. **CRD 层**：定义 `Rollout`、`AnalysisTemplate`、`AnalysisRun`、`Experiment` 等自定义资源。这些 CRD 告诉 Kubernetes API 服务器存在新的资源类型。
2. **控制器层**：运行在集群中的 `argo-rollouts` Deployment，监听 Rollout 资源的变化，执行实际的 Pod 管理、流量切换、指标分析等操作。
3. **客户端层**：`kubectl-argo-rollouts` 插件，提供 `kubectl argo rollouts` 子命令，用于查看发布状态、手动 promote、回滚等操作。

### 代码/配置实现

#### 安装 CRD 和控制器

使用官方提供的 manifests 或 Helm chart 安装：

```bash
# 方式一：使用 manifests 安装
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# 方式二：使用 Helm 安装
helm repo add argo https://argoproj.github.io/argo-helm
helm install argo-rollouts argo/argo-rollouts --namespace argo-rollouts --create-namespace
```

安装后验证控制器状态：

```bash
kubectl get pods -n argo-rollouts
# 预期输出：
# NAME                            READY   STATUS    RESTARTS   AGE
# argo-rollouts-bd7b8c9d6-xkf9n   1/1     Running   0          30s

kubectl get crd | grep rollouts
# 预期输出：
# analysistemplates.argoproj.io
# analysisruns.argoproj.io
# experiments.argoproj.io
# rollouts.argoproj.io
```

#### 安装 kubectl 插件

```bash
# macOS (Homebrew)
brew install argo-rollouts

# Linux (下载二进制)
curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
chmod +x kubectl-argo-rollouts-linux-amd64
sudo mv kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo_rollouts

# Windows (使用 PowerShell)
$version = (Invoke-RestMethod https://api.github.com/repos/argoproj/argo-rollouts/releases/latest).tag_name
Invoke-WebRequest -Uri "https://github.com/argoproj/argo-rollouts/releases/download/$version/kubectl-argo-rollouts-windows-amd64" -OutFile "kubectl-argo-rollouts.exe"
# 将文件移动到 PATH 中的目录
```

验证插件安装：

```bash
kubectl argo rollouts version
# 预期输出：
# argo-rollouts: v1.6.0
#  kubectl-argo-rollouts: v1.6.0
```

#### 集成 Argo CD

如果集群中已经运行 Argo CD，需要额外配置以让 Argo CD 能够正确管理 Rollout 资源：

```bash
# 在 Argo CD 中注册 Rollout 资源的健康检查
kubectl apply -n argocd -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: ConfigManagementPlugin
metadata:
  name: argocd-rollouts
spec:
  generate:
    command: ["/bin/sh", "-c"]
    args: ["cat"]
EOF
```

更推荐的方式是在 Argo CD 的 `argocd-cm` ConfigMap 中添加资源自定义健康检查：

```yaml
# argocd-cm ConfigMap 配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  resource.customizations: |
    argoproj.io/Rollout:
      health.lua: |
        hs = {}
        hs.status = "Progressing"
        hs.message = ""
        if obj.status ~= nil then
          if obj.status.currentPodHash ~= obj.status.blueGreen ~= nil then
            -- 蓝绿部署：检查当前版本是否稳定
            if obj.status.blueGreen.activeSelector == obj.status.currentPodHash then
              hs.status = "Healthy"
              hs.message = "Rollout is fully promoted to the desired version"
            end
          end
          if obj.status.canary ~= nil then
            -- 金丝雀发布：检查是否已完成
            if obj.status.canary.currentStepIndex == nil or obj.status.canary.currentStepIndex >= (obj.spec.strategy.canary.steps or {}).length then
              hs.status = "Healthy"
              hs.message = "Rollout has completed canary strategy"
            end
          end
        end
        return hs
```

### 使用场景

- **新集群初始化**：在创建 EKS 集群后，Argo Rollouts 应作为基础设施组件优先安装。
- **已有 Argo CD 的集群**：需要额外配置健康检查和资源同步，确保 Argo CD 能正确管理 Rollout。
- **多集群部署**：每个集群都需要独立安装控制器，但 kubectl 插件可以在本地管理多个集群。

### 潜在风险与注意事项

- **版本兼容性**：Argo Rollouts 控制器和 kubectl 插件应使用相同版本，避免 API 不兼容。
- **RBAC 权限**：控制器需要足够的权限管理 Deployment、Service、Ingress 等资源。如果使用 Argo CD 管理 Rollout，还需要确保 Argo CD 的 ServiceAccount 有对应权限。
- **资源配额**：控制器本身占用资源较少（通常 50m CPU / 128Mi 内存），但在大规模集群中需要关注 `AnalysisRun` 的并发数量。

### 本章小结

Argo Rollouts 的安装分为控制器、CRD、kubectl 插件三个部分。控制器和 CRD 通过 manifests 或 Helm 安装到集群，kubectl 插件安装在本地用于交互操作。与 Argo CD 集成时需要额外配置健康检查逻辑，以确保 Argo CD 能正确反映 Rollout 的健康状态。安装完成后，可以通过 `kubectl argo rollouts` 命令验证控制器是否正常运行。

---

## 13.3 金丝雀发布策略

### 解决的问题

金丝雀发布（Canary Release）的核心挑战在于：如何在**最小影响范围**内验证新版本，同时具备**自动决策**能力。手动金丝雀发布需要运维人员反复调整 Service Mesh 或 Ingress 的流量权重，观察指标，再决定继续或回滚。这个过程不仅耗时，而且容易因人为疏忽导致事故。

Argo Rollouts 的金丝雀策略将这一流程自动化：定义好流量权重阶梯、每个阶梯的等待时间或指标阈值、异常判定条件，控制器会自动执行整个发布流程。

### 核心原理

金丝雀策略的工作流程：

1. 用户更新 Rollout 的 `template.spec`（例如新的容器镜像版本）。
2. Rollout 控制器创建新的 ReplicaSet（金丝雀 ReplicaSet），副本数根据 `steps` 中的权重计算。
3. 控制器更新 Service 的流量路由，将指定比例的流量导向金丝雀 ReplicaSet。
4. 控制器创建 `AnalysisRun` 资源，开始执行指标查询。
5. 如果指标正常，控制器推进到下一个 step；如果指标异常，触发自动回滚。
6. 所有 step 完成后，金丝雀 ReplicaSet 升级为 stable ReplicaSet，旧的 ReplicaSet 缩容到零。

流量权重的实现方式取决于集群中的流量管理组件：

| 流量管理方案 | 实现机制 |
|-------------|---------|
| Kubernetes Service | 通过调整 ReplicaSet 的副本数比例来间接控制流量（不精确） |
| Ingress Controller (NGINX/ALB) | 通过创建多个 Service，在 Ingress 注解中配置权重 |
| Service Mesh (Istio) | 通过 VirtualService 的权重路由精确控制 |
| SMI (Service Mesh Interface) | 通过 TrafficSplit 资源控制 |

### 代码/配置实现

#### 基础金丝雀 Rollout

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: canary-demo
  namespace: production
spec:
  replicas: 10
  revisionHistoryLimit: 2
  selector:
    matchLabels:
      app: canary-demo
  template:
    metadata:
      labels:
        app: canary-demo
    spec:
      containers:
      - name: app
        image: myregistry/app:v1.0.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 256Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 3
          periodSeconds: 5
  strategy:
    canary:
      # 金丝雀 Service：接收按权重分配的流量
      canaryService: canary-demo-canary
      # 稳定 Service：接收剩余流量
      stableService: canary-demo-stable
      trafficRouting:
        nginx:
          # 指向管理流量的 Ingress
          stableIngress: canary-demo-ingress
      steps:
      # Step 1: 5% 流量 + 等待 2 分钟观察
      - setWeight: 5
      - pause:
          duration: 2m
      # Step 2: 提升到 25%
      - setWeight: 25
      - pause:
          duration: 5m
      # Step 3: 提升到 50%，等待人工审批
      - setWeight: 50
      - pause:
          duration: 0  # 0 表示无限等待，需要 kubectl argo rollouts promote
      # Step 4: 提升到 75%
      - setWeight: 75
      - pause:
          duration: 5m
      # Step 5: 100% 流量
      - setWeight: 100
      - pause:
          duration: 3m
```

#### 关联的 Service 配置

金丝雀策略需要两个 Service：一个用于稳定版本，一个用于金丝雀版本。Ingress Controller 根据权重在两个 Service 之间分配流量。

```yaml
# 稳定版本 Service
apiVersion: v1
kind: Service
metadata:
  name: canary-demo-stable
  namespace: production
  labels:
    app: canary-demo
spec:
  selector:
    app: canary-demo
    # 稳定版本使用 stable 标签
    rollouts-pod-template-hash: stable
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
---
# 金丝雀版本 Service
apiVersion: v1
kind: Service
metadata:
  name: canary-demo-canary
  namespace: production
  labels:
    app: canary-demo
spec:
  selector:
    app: canary-demo
    # 金丝雀版本不需要特定标签选择器，控制器会自动管理
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
```

#### 关联的 Ingress 配置

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: canary-demo-ingress
  namespace: production
  annotations:
    # NGINX Ingress 金丝雀注解
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "0"
spec:
  ingressClassName: nginx
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: canary-demo-stable
            port:
              number: 80
```

> **注意**：Argo Rollouts 会自动更新 Ingress 的 `canary-weight` 注解。当金丝雀权重为 0 时，所有流量都走稳定 Service；当权重为 5 时，5% 的流量被 NGINX Ingress 路由到金丝雀 Service。

#### 带指标分析的 Rollout

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: canary-with-metrics
  namespace: production
spec:
  replicas: 10
  selector:
    matchLabels:
      app: canary-demo
  template:
    metadata:
      labels:
        app: canary-demo
    spec:
      containers:
      - name: app
        image: myregistry/app:v1.0.0
        ports:
        - containerPort: 8080
  strategy:
    canary:
      canaryService: canary-demo-canary
      stableService: canary-demo-stable
      trafficRouting:
        nginx:
          stableIngress: canary-demo-ingress
      steps:
      - setWeight: 10
      - pause:
          duration: 3m
      # 执行指标分析
      - analysis:
          templates:
          - templateName: success-rate-check
          args:
          - name: service-name
            value: canary-demo-canary
          - name: namespace
            value: production
      - setWeight: 50
      - pause:
          duration: 5m
      - analysis:
          templates:
          - templateName: error-rate-check
          args:
          - name: service-name
            value: canary-demo-canary
      - setWeight: 100
      - pause:
          duration: 3m
  # 全局分析：在整个发布过程中持续监控
  analysis:
    templates:
    - templateName: system-health-check
    args:
    - name: namespace
      value: production
```

#### AnalysisTemplate 定义

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate-check
  namespace: production
spec:
  args:
  - name: service-name
  - name: namespace
  # 指标查询的间隔和次数
  metrics:
  - name: success-rate
    interval: 30s
    # 失败阈值：连续 2 次失败触发回滚
    failureLimit: 2
    # 成功条件：至少需要 1 次成功
    successCondition: result[0] >= 0.95
    # 失败条件：低于 0.9 视为失败
    failureCondition: result[0] < 0.9
    # 查询次数限制
    count: 10
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          sum(
            rate(
              http_requests_total{
                service="{{args.service-name}}",
                namespace="{{args.namespace}}",
                status=~"2[0-9][0-9]|3[0-9][0-9]"
              }[1m]
            )
          ) /
          sum(
            rate(
              http_requests_total{
                service="{{args.service-name}}",
                namespace="{{args.namespace}}"
              }[1m]
            )
          )
```

#### 更复杂的 AnalysisTemplate：多指标 + 模板化

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: comprehensive-health-check
  namespace: production
spec:
  args:
  - name: service-name
  - name: namespace
  - name: latency-threshold
    value: "500"  # 默认值，单位毫秒
  metrics:
  # 指标 1：请求成功率
  - name: success-rate
    interval: 30s
    failureLimit: 3
    successCondition: result[0] >= 0.95
    failureCondition: result[0] < 0.9
    count: 10
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          1 - (
            sum(rate(http_requests_total{
              service="{{args.service-name}}",
              namespace="{{args.namespace}}",
              status=~"5[0-9][0-9]"
            }[2m]))
            /
            sum(rate(http_requests_total{
              service="{{args.service-name}}",
              namespace="{{args.namespace}}"
            }[2m]))
          )

  # 指标 2：P99 延迟
  - name: p99-latency
    interval: 30s
    failureLimit: 3
    successCondition: result[0] < {{args.latency-threshold}}
    failureCondition: result[0] >= {{args.latency-threshold}}
    count: 10
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          histogram_quantile(0.99,
            sum(rate(
              http_request_duration_seconds_bucket{
                service="{{args.service-name}}",
                namespace="{{args.namespace}"
              }[2m]
            )) by (le)
          ) * 1000

  # 指标 3：错误日志率
  - name: error-log-rate
    interval: 1m
    failureLimit: 2
    successCondition: result[0] < 10
    failureCondition: result[0] >= 10
    count: 5
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          sum(rate(
            log_entries_total{
              service="{{args.service-name}}",
              namespace="{{args.namespace}}",
              level="error"
            }[1m]
          ))
```

#### 使用 kubectl 插件管理发布

```bash
# 查看 Rollout 状态
kubectl argo rollouts get rollout canary-demo -n production

# 查看发布进度（带 watch）
kubectl argo rollouts get rollout canary-demo -n production --watch

# 手动 promote（推进到下一个 step）
kubectl argo rollouts promote canary-demo -n production

# 手动回滚
kubectl argo rollouts abort canary-demo -n production

# 重启发布
kubectl argo rollouts restart canary-demo -n production

# 以 YAML 格式查看当前状态
kubectl argo rollouts get rollout canary-demo -n production -o yaml

# 查看 AnalysisRun 详情
kubectl get analysisrun -n production -l rollouts-pod-template-hash=<hash>
```

#### 使用 Istio 进行流量路由

当集群使用 Istio Service Mesh 时，Argo Rollouts 通过 VirtualService 和 DestinationRule 实现精确的流量权重控制：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: canary-istio
  namespace: production
spec:
  replicas: 10
  selector:
    matchLabels:
      app: canary-istio
  template:
    metadata:
      labels:
        app: canary-istio
    spec:
      containers:
      - name: app
        image: myregistry/app:v1.0.0
  strategy:
    canary:
      canaryService: canary-istio-canary
      stableService: canary-istio-stable
      trafficRouting:
        istio:
          virtualService:
            name: canary-istio-vsvc
            routes:
            - primary
          destinationRule:
            name: canary-istio-dr
            stableSubsetName: stable
            canarySubsetName: canary
      steps:
      - setWeight: 5
      - pause:
          duration: 2m
      - setWeight: 25
      - pause:
          duration: 5m
      - setWeight: 50
      - pause:
          duration: 0  # 等待人工审批
      - setWeight: 100
      - pause:
          duration: 3m
---
# Istio VirtualService
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: canary-istio-vsvc
  namespace: production
spec:
  hosts:
  - app.example.com
  gateways:
  - app-gateway
  http:
  - name: primary
    route:
    - destination:
        host: canary-istio-stable
        subset: stable
      weight: 100
    - destination:
        host: canary-istio-canary
        subset: canary
      weight: 0
---
# Istio DestinationRule
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: canary-istio-dr
  namespace: production
spec:
  host: canary-istio-stable
  subsets:
  - name: stable
    labels:
      app: canary-istio
      rollouts-pod-template-hash: stable
  - name: canary
    labels:
      app: canary-istio
      rollouts-pod-template-hash: canary
```

### 使用场景

- **高流量生产服务**：每秒数千请求的服务，即使 1% 的错误流量也会影响大量用户。
- **基础设施变更**：更新 JDK 版本、框架升级、数据库连接池参数调整等，需要验证新版本在真实流量下的表现。
- **机器学习模型服务**：新模型可能存在精度退化或推理延迟增加，需要逐步放量验证。
- **多租户 SaaS 平台**：可以先让内部用户或 Beta 用户使用新版本，验证无误后再推送给所有客户。

### 潜在风险与注意事项

- **流量权重精度**：使用 NGINX Ingress 的权重是基于请求数的概率分发，在低流量服务中可能不够精确。Istio 的权重路由基于连接数，精度更高。
- **AnalysisRun 资源消耗**：每个 Rollout 的每个 step 都可能创建 AnalysisRun，大量并发 AnalysisRun 可能对 Prometheus 造成查询压力。
- **指标查询超时**：如果 Prometheus 查询响应慢，可能导致 AnalysisRun 超时失败，触发不必要的回滚。
- **金丝雀 Service 的 readiness**：金丝雀 Pod 的 readinessProbe 必须准确反映服务健康状态，否则可能导致流量路由到不可用的 Pod。

### 本章小结

金丝雀发布是渐进式交付中最常用的策略。Argo Rollouts 通过 `steps` 定义流量权重阶梯，结合 `AnalysisTemplate` 的指标分析，实现了"发布 - 观察 - 决策"的自动化闭环。流量路由支持 NGINX Ingress、Istio、ALB Ingress Controller 等多种方案，适应不同的集群架构。指标分析模板支持 Prometheus、Datadog、NewRelic 等主流监控系统，通过 `successCondition` 和 `failureCondition` 定义判定逻辑，实现自动回滚。

---

## 13.4 蓝绿部署策略

### 解决的问题

蓝绿部署（Blue-Green Deployment）的核心需求是**快速切换和快速回滚**。与金丝雀发布的渐进式流量迁移不同，蓝绿部署同时运行两套完整的环境（蓝色 = 当前稳定版本，绿色 = 新版本），在验证通过后一次性切换所有流量。这种模式特别适合：

- 需要瞬间切换的场景（如前端页面改版）
- 回滚速度要求极高的场景（切换回旧环境只需修改 Service selector）
- 新版本需要完整环境进行预验证的场景

### 核心原理

蓝绿部署的工作流程：

1. 用户更新 Rollout 的 `template.spec`，触发新版本创建。
2. 控制器创建新的 ReplicaSet（绿色环境），副本数达到 `spec.replicas` 的完整规模。
3. 绿色环境的 Pod 全部 Ready 后，控制器创建 `preview Service` 用于内部验证。
4. 如果配置了 `autoPromotionEnabled`，等待指定时间后自动切换流量。
5. 流量切换后，旧的 ReplicaSet（蓝色环境）保留，以便快速回滚。
6. 下次更新时，角色互换：原来的绿色变成蓝色，新版本成为新的绿色。

关键概念：

| 概念 | 说明 |
|------|------|
| active Service | 当前接收生产流量的 Service |
| preview Service | 新版本的 Service，用于发布前验证 |
| activeSelector | 当前 active Service 选择的 Pod 标签 |
| scaleDownDelay | 旧版本保留的时间（秒），用于回滚窗口 |

### 代码/配置实现

#### 基础蓝绿 Rollout

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: bluegreen-demo
  namespace: production
spec:
  replicas: 6
  revisionHistoryLimit: 2
  selector:
    matchLabels:
      app: bluegreen-demo
  template:
    metadata:
      labels:
        app: bluegreen-demo
    spec:
      containers:
      - name: app
        image: myregistry/app:v1.0.0
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
  strategy:
    blueGreen:
      # active Service：接收生产流量
      activeService: bluegreen-demo-active
      # preview Service：新版本验证用
      previewService: bluegreen-demo-preview
      # 自动切换：新版本 Ready 后等待 30 秒自动切换
      autoPromotionEnabled: true
      autoPromotionSeconds: 30
      # 切换后旧版本保留 5 分钟用于回滚
      scaleDownDelaySeconds: 300
```

#### 关联的 Service 配置

```yaml
# active Service：始终指向当前稳定版本
apiVersion: v1
kind: Service
metadata:
  name: bluegreen-demo-active
  namespace: production
  labels:
    app: bluegreen-demo
spec:
  selector:
    app: bluegreen-demo
    # 控制器会自动管理这个标签
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
---
# preview Service：指向新版本
apiVersion: v1
kind: Service
metadata:
  name: bluegreen-demo-preview
  namespace: production
  labels:
    app: bluegreen-demo
spec:
  selector:
    app: bluegreen-demo
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
```

#### 带人工审批的蓝绿部署

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: bluegreen-with-approval
  namespace: production
spec:
  replicas: 6
  selector:
    matchLabels:
      app: bluegreen-demo
  template:
    metadata:
      labels:
        app: bluegreen-demo
    spec:
      containers:
      - name: app
        image: myregistry/app:v1.0.0
  strategy:
    blueGreen:
      activeService: bluegreen-demo-active
      previewService: bluegreen-demo-preview
      # 关闭自动切换，等待人工 promote
      autoPromotionEnabled: false
      # 新版本 Ready 后，preview Service 可用
      # 通过 kubectl argo rollouts promote 手动切换
      scaleDownDelaySeconds: 600  # 切换后旧版本保留 10 分钟
      # 在切换前执行指标分析
      prePromotionAnalysis:
        templates:
        - templateName: bluegreen-precheck
        args:
        - name: service-name
          value: bluegreen-demo-preview
      # 切换后持续监控
      postPromotionAnalysis:
        templates:
        - templateName: bluegreen-postcheck
        args:
        - name: service-name
          value: bluegreen-demo-active
```

#### 蓝绿部署的 AnalysisTemplate

```yaml
# 切换前验证：检查 preview Service 的健康状况
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: bluegreen-precheck
  namespace: production
spec:
  args:
  - name: service-name
  metrics:
  - name: preview-health
    interval: 15s
    failureLimit: 3
    successCondition: result[0] == 1
    failureCondition: result[0] == 0
    count: 4
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          sum(up{service="{{args.service-name}}"})
---
# 切换后监控：验证新版本的生产表现
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: bluegreen-postcheck
  namespace: production
spec:
  args:
  - name: service-name
  metrics:
  - name: post-switch-success-rate
    interval: 30s
    failureLimit: 2
    successCondition: result[0] >= 0.99
    failureCondition: result[0] < 0.95
    count: 10
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          sum(rate(http_requests_total{
            service="{{args.service-name}}",
            status=~"2[0-9][0-9]"
          }[1m])) / sum(rate(http_requests_total{
            service="{{args.service-name}}"
          }[1m]))
```

#### 蓝绿部署的完整发布流程

```bash
# 1. 更新 Rollout 镜像
kubectl argo rollouts set image bluegreen-demo app=myregistry/app:v2.0.0 -n production

# 2. 查看发布状态
kubectl argo rollouts get rollout bluegreen-demo -n production --watch

# 3. 如果 autoPromotionEnabled=false，手动 promote
kubectl argo rollouts promote bluegreen-demo -n production

# 4. 如果需要回滚
kubectl argo rollouts abort bluegreen-demo -n production

# 5. 查看 active/preview Service 的 selector
kubectl get svc bluegreen-demo-active -n production -o jsonpath='{.spec.selector}'
kubectl get svc bluegreen-demo-preview -n production -o jsonpath='{.spec.selector}'
```

### 使用场景

- **前端应用**：SPA 或 SSR 应用，切换是瞬间的，不需要渐进式流量迁移。
- **数据库迁移**：新版本使用不同的数据库 schema，需要完整环境验证后再切换。
- **重大版本升级**：如 Java 版本升级、框架重构，需要完整的预生产验证。
- **合规发布**：需要审批流程的发布，蓝绿部署的"先建后切"模式天然支持。

### 潜在风险与注意事项

- **资源消耗**：蓝绿部署同时运行两套完整环境，资源消耗翻倍。在副本数较大的服务中成本显著。
- **预热问题**：新版本 Pod 启动后需要时间预热（JIT 编译、缓存填充等），readinessProbe 需要充分考虑预热时间。
- **状态数据**：如果应用依赖本地状态（如 Session），蓝绿切换可能导致用户会话丢失。建议使用外部 Session 存储。
- **数据库兼容**：新版本可能修改数据库 schema，切换后旧版本无法正常工作。需要确保双向兼容或使用数据库迁移工具。

### 本章小结

蓝绿部署通过同时运行两套完整环境实现"瞬间切换"和"快速回滚"。Argo Rollouts 的蓝绿策略支持 `activeService` 和 `previewService` 的自动管理，`autoPromotionEnabled` 控制是否自动切换，`prePromotionAnalysis` 和 `postPromotionAnalysis` 在切换前后执行指标验证。蓝绿部署适合前端应用、重大版本升级等场景，但资源消耗较高，需要评估成本。

---

## 13.5 Argo Rollouts + Argo CD 集成

### 解决的问题

Argo CD 是声明式的 GitOps 持续交付工具，Argo Rollouts 是渐进式交付工具。两者结合时面临几个关键问题：

1. **资源管理冲突**：Argo CD 管理 Rollout 资源，但 Rollout 控制器会动态创建 ReplicaSet、AnalysisRun 等子资源。Argo CD 需要理解这些子资源与 Rollout 的关系。
2. **健康状态映射**：Argo CD 默认的健康检查逻辑不识别 Rollout 的"金丝雀发布中"状态。一个正在执行金丝雀策略的 Rollout 在 Argo CD 中可能被错误地标记为 "Progressing" 或 "Degraded"。
3. **同步策略**：Argo CD 的自动同步可能干扰 Rollout 的发布流程。例如，Argo CD 检测到 Rollout 的 `currentPodHash` 与期望状态不一致时，可能触发不必要的同步。

### 核心原理

Argo CD 与 Argo Rollouts 的集成基于三个关键机制：

1. **资源自定义健康检查**：通过 `resource.customizations` 配置，告诉 Argo CD 如何判断 Rollout 的健康状态。Argo CD 根据 Rollout 的 `status` 字段判断当前是"健康"、"进行中"还是"异常"。
2. **同步波次（Sync Waves）**：利用 Argo CD 的同步波次功能，控制 Rollout 及其依赖资源（Service、Ingress、AnalysisTemplate）的创建顺序。
3. **忽略差异**：配置 Argo CD 忽略 Rollout 状态字段的差异，避免 Argo CD 反复尝试"修复" Rollout 的状态。

### 代码/配置实现

#### Argo CD 健康检查配置

在 `argocd-cm` ConfigMap 中配置 Rollout 资源的健康检查逻辑：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  resource.customizations: |
    argoproj.io/Rollout:
      health.lua: |
        -- 获取 Rollout 状态
        local status = obj.status
        if status == nil then
          return { status = "Progressing", message = "Rollout status not available yet" }
        end

        -- 检查是否被中止（回滚）
        if status.abort ~= nil and status.abort then
          return { status = "Degraded", message = "Rollout has been aborted" }
        end

        -- 蓝绿部署健康检查
        if status.blueGreen ~= nil then
          local bg = status.blueGreen
          -- 如果 activeSelector 等于 currentPodHash，说明已经完成切换
          if bg.activeSelector ~= nil and status.currentPodHash ~= nil and bg.activeSelector == status.currentPodHash then
            return { status = "Healthy", message = "BlueGreen: active selector matches current pod hash" }
          end
          -- 如果 preview Service 已经 Ready，等待 promote
          if bg.previewSelector ~= nil and bg.previewSelector ~= "" then
            return { status = "Progressing", message = "BlueGreen: preview environment is ready, waiting for promotion" }
          end
          return { status = "Progressing", message = "BlueGreen: progressing" }
        end

        -- 金丝雀发布健康检查
        if status.canary ~= nil then
          local canary = status.canary
          -- 检查是否已完成所有步骤
          if canary.currentStepIndex == nil or canary.currentStepIndex >= (#(obj.spec.strategy.canary.steps or {}) - 1) then
            -- 检查 stableRS 是否等于 currentPodHash
            if status.stableRS == status.currentPodHash then
              return { status = "Healthy", message = "Canary: rollout completed successfully" }
            end
          end
          -- 检查是否有失败的 AnalysisRun
          for i, step in ipairs(obj.spec.strategy.canary.steps or {}) do
            if step.analysis ~= nil then
              local runName = status.canary.currentStepRun or ""
              if runName ~= "" then
                local run, err = k8s.get({
                  apiVersion = "argoproj.io/v1alpha1",
                  kind = "AnalysisRun",
                  namespace = obj.metadata.namespace,
                  name = runName
                })
                if run ~= nil and run.status ~= nil then
                  if run.status.status == "Failed" then
                    return { status = "Degraded", message = "Canary: analysis run failed" }
                  end
                  if run.status.status == "Error" then
                    return { status = "Degraded", message = "Canary: analysis run encountered error" }
                  end
                end
              end
            end
          end
          return { status = "Progressing", message = "Canary: progressing through steps" }
        end

        -- 默认状态
        return { status = "Progressing", message = "Unknown strategy type" }
```

#### Argo CD Application 配置

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: production-rollouts
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/example/gitops-repo.git
    targetRevision: main
    path: environments/production/rollouts
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      # 允许自动同步，但仅在检测到 Rollout spec 变化时触发
      prune: true
      selfHeal: true
      # 允许空同步（避免在 Rollout 进行中时强制同步）
      allowEmpty: true
    syncOptions:
    # 创建资源时先创建依赖资源
    - CreateNamespace=true
    # 跳过 Rollout 状态字段的差异检查
    - RespectIgnoreDifferences=true
    # 使用 ServerSide Apply 避免字段冲突
    - ServerSideApply=true
  ignoreDifferences:
  # 忽略 Rollout 的状态字段
  - group: argoproj.io
    kind: Rollout
    jsonPointers:
    - /status
  # 忽略 ReplicaSet 的 replicas 字段（Rollout 控制器管理）
  - group: apps
    kind: ReplicaSet
    jsonPointers:
    - /spec/replicas
  # 忽略 Service 的 selector（Rollout 控制器管理）
  - group: ""
    kind: Service
    jsonPointers:
    - /spec/selector
```

#### 使用 Sync Waves 控制资源创建顺序

```yaml
# 同步波次：-10 最先创建，10 最后创建
---
# 波次 -10：先创建 AnalysisTemplate
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: app-health-check
  namespace: production
  annotations:
    argocd.argoproj.io/sync-wave: "-10"
spec:
  metrics:
  - name: success-rate
    interval: 30s
    failureLimit: 2
    successCondition: result[0] >= 0.95
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: "sum(rate(http_requests_total{status=~\"2[0-9][0-9]\"}[1m])) / sum(rate(http_requests_total{}[1m]))"
---
# 波次 -5：创建 Service
apiVersion: v1
kind: Service
metadata:
  name: app-active
  namespace: production
  annotations:
    argocd.argoproj.io/sync-wave: "-5"
spec:
  selector:
    app: app
  ports:
  - port: 80
    targetPort: 8080
---
# 波次 0：创建 Rollout
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: app
  namespace: production
  annotations:
    argocd.argoproj.io/sync-wave: "0"
spec:
  replicas: 5
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
      - name: app
        image: myregistry/app:v1.0.0
  strategy:
    canary:
      canaryService: app-canary
      stableService: app-stable
      trafficRouting:
        nginx:
          stableIngress: app-ingress
      steps:
      - setWeight: 10
      - pause:
          duration: 2m
      - setWeight: 50
      - pause:
          duration: 5m
      - setWeight: 100
---
# 波次 5：创建 Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  namespace: production
  annotations:
    argocd.argoproj.io/sync-wave: "5"
spec:
  ingressClassName: nginx
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-stable
            port:
              number: 80
```

#### Argo CD 与 Rollouts 的 Dashboard 集成

Argo Rollouts 提供了独立的 Dashboard，也可以与 Argo CD 的 UI 集成：

```bash
# 安装 Argo Rollouts Dashboard
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/dashboard-install.yaml

# 通过端口转发访问
kubectl port-forward -n argo-rollouts svc/argo-rollouts-dashboard 3100:3100
# 访问 http://localhost:3100
```

在 Argo CD 中查看 Rollout 的实时状态：

```bash
# 通过 Argo CD CLI 查看 Rollout
argocd app get production-rollouts

# 查看 Rollout 的实时事件
kubectl get events -n production --field-selector involvedObject.kind=Rollout --watch
```

### 使用场景

- **GitOps 工作流**：所有 Rollout 配置存储在 Git 仓库中，通过 Argo CD 自动同步到集群。
- **多环境管理**：开发、测试、预发布、生产环境使用不同的 Rollout 策略，通过 Argo CD Application 管理。
- **审计合规**：所有发布变更都有 Git 提交记录，Argo CD 提供完整的发布历史。

### 潜在风险与注意事项

- **同步冲突**：Argo CD 的 `selfHeal` 可能与 Rollout 控制器的状态更新冲突。建议使用 `ignoreDifferences` 忽略状态字段。
- **自动同步时机**：如果 Argo CD 在 Rollout 执行金丝雀策略时触发同步，可能导致发布中断。建议使用 `manual sync` 或配置合理的 sync wave。
- **健康检查误判**：自定义健康检查 Lua 脚本需要与 Rollout 策略匹配。策略变更时，健康检查逻辑也需要同步更新。

### 本章小结

Argo CD 与 Argo Rollouts 的集成通过自定义健康检查、同步波次、忽略差异三个机制实现。健康检查 Lua 脚本让 Argo CD 能正确识别 Rollout 的"发布中"、"健康"、"异常"状态；同步波次控制资源创建顺序；忽略差异避免状态字段冲突。这种集成使得 GitOps 工作流可以无缝管理渐进式发布，实现"Git 提交 -> Argo CD 同步 -> Rollout 渐进发布"的完整自动化链路。

---

## 13.6 实战：完整金丝雀发布配置

### 解决的问题

前面的章节分别介绍了金丝雀发布、蓝绿部署、Argo CD 集成的各个组件。本节将这些组件整合为一个完整的、可直接部署的金丝雀发布配置。目标是展示从 Rollout YAML 到 AnalysisTemplate、Service、Ingress、Argo CD Application 的完整配置链路。

### 核心原理

完整配置的架构关系：

```
Git 仓库
  └── environments/production/
      ├── rollout.yaml          # Rollout 资源定义
      ├── analysis-template.yaml # 指标分析模板
      ├── services.yaml         # 稳定和金丝雀 Service
      ├── ingress.yaml         # Ingress 配置
      └── application.yaml     # Argo CD Application
                │
                ▼
          Argo CD 同步
                │
                ▼
          Kubernetes 集群
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
  Rollout   Service    Ingress
      │
      ├── ReplicaSet (stable)
      ├── ReplicaSet (canary)
      ├── AnalysisRun
      └── Events/Status
```

### 代码/配置实现

#### 1. Rollout 配置

```yaml
# rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: production-app
  namespace: production
  labels:
    app.kubernetes.io/name: production-app
    app.kubernetes.io/part-of: ecommerce-platform
spec:
  replicas: 10
  revisionHistoryLimit: 3
  selector:
    matchLabels:
      app: production-app
  template:
    metadata:
      labels:
        app: production-app
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
    spec:
      containers:
      - name: app
        image: myregistry/production-app:1.0.0
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 9779
          name: prometheus
        env:
        - name: APP_VERSION
          value: "1.0.0"
        - name: JAVA_OPTS
          value: "-Xms512m -Xmx1024m -XX:+UseG1GC"
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1024Mi
        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: http
          initialDelaySeconds: 15
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        startupProbe:
          httpGet:
            path: /actuator/health/readiness
            port: http
          initialDelaySeconds: 5
          periodSeconds: 3
          failureThreshold: 15
        lifecycle:
          preStop:
            exec:
              command:
              - /bin/sh
              - -c
              - sleep 30
      terminationGracePeriodSeconds: 60
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - production-app
              topologyKey: kubernetes.io/hostname
  strategy:
    canary:
      canaryService: production-app-canary
      stableService: production-app-stable
      trafficRouting:
        nginx:
          stableIngress: production-app-ingress
      steps:
      # Step 1: 2% 流量，快速验证基本可用性
      - setWeight: 2
      - pause:
          duration: 3m
      # Step 2: 10% 流量，执行指标分析
      - setWeight: 10
      - analysis:
          templates:
          - templateName: production-app-canary-analysis
          args:
          - name: service-name
            value: production-app-canary
          - name: namespace
            value: production
      # Step 3: 25% 流量，等待人工审批
      - setWeight: 25
      - pause:
          duration: 0
      # Step 4: 50% 流量，再次执行指标分析
      - setWeight: 50
      - analysis:
          templates:
          - templateName: production-app-canary-analysis
          args:
          - name: service-name
            value: production-app-canary
          - name: namespace
            value: production
      # Step 5: 75% 流量
      - setWeight: 75
      - pause:
          duration: 5m
      # Step 6: 100% 流量
      - setWeight: 100
      - pause:
          duration: 3m
  # 全局分析：在整个发布过程中持续监控
  analysis:
    templates:
    - templateName: production-app-global-analysis
    args:
    - name: namespace
      value: production
```

#### 2. AnalysisTemplate 配置

```yaml
# analysis-template.yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: production-app-canary-analysis
  namespace: production
spec:
  args:
  - name: service-name
  - name: namespace
  - name: error-rate-threshold
    value: "0.01"
  - name: latency-p99-threshold
    value: "1000"
  metrics:
  # 指标 1：HTTP 错误率
  - name: http-error-rate
    interval: 15s
    failureLimit: 3
    successCondition: result[0] < {{args.error-rate-threshold}}
    failureCondition: result[0] >= {{args.error-rate-threshold}}
    count: 20
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          sum(rate(
            http_requests_total{
              service="{{args.service-name}}",
              namespace="{{args.namespace}}",
              status=~"5[0-9][0-9]"
            }[1m]
          )) / sum(rate(
            http_requests_total{
              service="{{args.service-name}}",
              namespace="{{args.namespace}}"
            }[1m]
          ))

  # 指标 2：P99 响应延迟
  - name: p99-latency
    interval: 15s
    failureLimit: 3
    successCondition: result[0] < {{args.latency-p99-threshold}}
    failureCondition: result[0] >= {{args.latency-p99-threshold}}
    count: 20
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          histogram_quantile(0.99,
            sum(rate(
              http_request_duration_seconds_bucket{
                service="{{args.service-name}}",
                namespace="{{args.namespace}}"
              }[1m]
            )) by (le)
          ) * 1000

  # 指标 3：请求量（确保有流量到达金丝雀）
  - name: request-volume
    interval: 15s
    failureLimit: 5
    successCondition: result[0] > 0
    failureCondition: result[0] == 0
    count: 4
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          sum(rate(
            http_requests_total{
              service="{{args.service-name}}",
              namespace="{{args.namespace}}"
            }[30s]
          ))
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: production-app-global-analysis
  namespace: production
spec:
  args:
  - name: namespace
  metrics:
  # 全局指标：集群级别的健康检查
  - name: cluster-health
    interval: 1m
    failureLimit: 1
    successCondition: result[0] == 1
    failureCondition: result[0] == 0
    count: 3
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          count(kube_node_status_condition{condition="Ready",status="true"}) > 0
```

#### 3. Service 配置

```yaml
# services.yaml
apiVersion: v1
kind: Service
metadata:
  name: production-app-stable
  namespace: production
  labels:
    app: production-app
    role: stable
spec:
  selector:
    app: production-app
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: http
  type: ClusterIP
---
apiVersion: v1
kind: Service
metadata:
  name: production-app-canary
  namespace: production
  labels:
    app: production-app
    role: canary
spec:
  selector:
    app: production-app
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: http
  type: ClusterIP
```

#### 4. Ingress 配置

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: production-app-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
    # 金丝雀注解：Argo Rollouts 会自动更新权重
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "0"
spec:
  tls:
  - hosts:
    - app.example.com
    secretName: app-example-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: production-app-stable
            port:
              name: http
```

#### 5. Argo CD Application 配置

```yaml
# application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: production-app
  namespace: argocd
  finalizers:
  - resources-finalizer.argocd.argoproj.io
spec:
  project: production
  source:
    repoURL: https://github.com/example/gitops-repo.git
    targetRevision: main
    path: environments/production/app
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: true
    syncOptions:
    - CreateNamespace=true
    - RespectIgnoreDifferences=true
    - ServerSideApply=true
    - ApplyOutOfSyncOnly=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
  ignoreDifferences:
  - group: argoproj.io
    kind: Rollout
    jsonPointers:
    - /status
  - group: apps
    kind: ReplicaSet
    jsonPointers:
    - /spec/replicas
  - group: ""
    kind: Service
    jsonPointers:
    - /spec/selector
  info:
  - name: "监控面板"
    value: "https://grafana.example.com/d/rollouts"
  - name: "发布文档"
    value: "https://wiki.example.com/deployment-process"
```

#### 6. 完整的发布操作流程

```bash
# 第一步：开发人员提交代码变更
git commit -m "feat: upgrade app to v2.0.0 with new recommendation engine"
git push origin main

# 第二步：Argo CD 自动同步（或手动同步）
argocd app sync production-app

# 第三步：查看 Rollout 状态
kubectl argo rollouts get rollout production-app -n production --watch

# 第四步：在 25% 流量时，QA 团队验证后手动 promote
kubectl argo rollouts promote production-app -n production

# 第五步：如果指标异常，自动回滚
# 控制器会自动执行 abort，无需人工操作

# 第六步：发布完成后的验证
kubectl argo rollouts get rollout production-app -n production
# 预期输出显示 status: Healthy

# 第七步：如果需要紧急回滚
kubectl argo rollouts abort production-app -n production
# 或者修改 Rollout 的镜像版本回退
kubectl argo rollouts set image production-app app=myregistry/production-app:1.0.0 -n production
```

#### 7. 使用 Helm Chart 封装

对于更复杂的场景，可以将上述配置封装为 Helm Chart：

```yaml
# Chart.yaml
apiVersion: v2
name: production-app
version: 1.0.0
description: Production application with canary deployment
```

```yaml
# values.yaml
replicaCount: 10
image:
  repository: myregistry/production-app
  tag: 1.0.0
  pullPolicy: Always

strategy:
  type: canary
  canary:
    steps:
    - setWeight: 2
      pause:
        duration: 3m
    - setWeight: 10
      analysis:
        templateName: production-app-canary-analysis
    - setWeight: 25
      pause:
        duration: 0
    - setWeight: 50
      analysis:
        templateName: production-app-canary-analysis
    - setWeight: 75
      pause:
        duration: 5m
    - setWeight: 100
      pause:
        duration: 3m

analysis:
  errorRateThreshold: "0.01"
  latencyP99Threshold: "1000"

ingress:
  host: app.example.com
  tls:
    enabled: true
    clusterIssuer: letsencrypt-prod

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1024Mi
```

```yaml
# templates/rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: {{ .Values.nameOverride | default .Chart.Name }}
  namespace: {{ .Values.namespace | default .Release.Namespace }}
spec:
  replicas: {{ .Values.replicaCount }}
  revisionHistoryLimit: {{ .Values.revisionHistoryLimit | default 3 }}
  selector:
    matchLabels:
      app: {{ .Values.nameOverride | default .Chart.Name }}
  template:
    metadata:
      labels:
        app: {{ .Values.nameOverride | default .Chart.Name }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - containerPort: 8080
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
  strategy:
    canary:
      canaryService: {{ .Values.nameOverride | default .Chart.Name }}-canary
      stableService: {{ .Values.nameOverride | default .Chart.Name }}-stable
      trafficRouting:
        nginx:
          stableIngress: {{ .Values.nameOverride | default .Chart.Name }}-ingress
      steps:
      {{- range .Values.strategy.canary.steps }}
      - setWeight: {{ .setWeight }}
      {{- if .pause }}
      - pause:
          duration: {{ .pause.duration }}
      {{- end }}
      {{- if .analysis }}
      - analysis:
          templates:
          - templateName: {{ .analysis.templateName }}
          args:
          - name: service-name
            value: {{ $.Values.nameOverride | default $.Chart.Name }}-canary
          - name: namespace
            value: {{ $.Values.namespace | default $.Release.Namespace }}
      {{- end }}
      {{- end }}
```

### 使用场景

- **生产环境标准发布流程**：所有生产服务统一使用此配置模板，确保发布流程的一致性。
- **CI/CD 流水线集成**：Jenkins/GitLab CI/GitHub Actions 构建新镜像后，自动更新 Git 仓库中的镜像版本，触发 Argo CD 同步和 Rollout 发布。
- **多服务协同发布**：多个微服务同时发布时，每个服务独立执行金丝雀策略，互不干扰。

### 潜在风险与注意事项

- **配置复杂度**：完整的金丝雀发布涉及 5 个 YAML 文件，维护成本较高。建议使用 Helm Chart 或 Kustomize 模板化。
- **镜像版本管理**：确保 Git 仓库中的镜像版本与实际构建的镜像一致。建议 CI 流水线自动更新 values.yaml。
- **AnalysisTemplate 版本管理**：AnalysisTemplate 的变更会影响所有引用它的 Rollout。建议使用 AnalysisRun 的独立版本控制。

### 本章小结

本节提供了一个完整的金丝雀发布配置模板，涵盖 Rollout、AnalysisTemplate、Service、Ingress、Argo CD Application 五个核心组件。配置实现了"2% 快速验证 -> 10% 指标分析 -> 25% 人工审批 -> 50% 指标分析 -> 75% 观察 -> 100% 完成"的完整发布流程。通过 Helm Chart 封装可以降低多服务部署的维护成本。这套配置可以直接应用于生产环境，作为标准发布流程的基础模板。

---

## 13.7 潜在风险与最佳实践

### 流量管理复杂度

#### 解决的问题

Argo Rollouts 的流量管理依赖集群中的流量管理组件（Ingress Controller 或 Service Mesh）。不同的流量管理方案有不同的配置方式和限制，选择不当会导致流量分发不精确或配置复杂度过高。

#### 核心原理

流量管理的核心是"如何将一定比例的请求路由到新版本 Pod"。不同方案的实现机制：

| 方案 | 精度 | 配置复杂度 | 适用场景 |
|------|------|-----------|---------|
| NGINX Ingress | 概率分发，低流量不精确 | 低 | 简单场景，无 Service Mesh |
| AWS ALB Ingress | 基于权重，较精确 | 中 | AWS 环境 |
| Istio | 基于连接，精确 | 高 | 已有 Istio 的集群 |
| SMI | 基于流量拆分 | 中 | 多 Service Mesh 兼容 |

#### 代码/配置实现

NGINX Ingress 的低流量问题：

```yaml
# 当金丝雀权重为 1% 时，NGINX 的概率分发可能不精确
# 特别是在请求量较小的服务中
# 解决方案：使用 Istio 的精确权重路由
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: precise-routing
spec:
  hosts:
  - app.example.com
  http:
  - match:
    - headers:
        x-canary:
          exact: "true"
    route:
    - destination:
        host: app-canary
      weight: 100
  - route:
    - destination:
        host: app-stable
      weight: 100
```

#### 最佳实践

- **低流量服务（<100 req/s）**：使用 Istio 或 Header 路由，避免概率分发的不精确。
- **高流量服务（>1000 req/s）**：NGINX Ingress 的权重分发已经足够精确。
- **已有 Service Mesh**：优先使用 Istio 的流量路由，避免引入额外的 Ingress Controller。

### 指标采集延迟

#### 解决的问题

指标分析依赖 Prometheus 的查询结果。如果指标采集有延迟（scrape interval 为 15s，查询窗口为 1m），可能导致 AnalysisRun 在指标尚未稳定时做出错误判断。

#### 核心原理

指标采集的端到端延迟：

```
应用暴露指标 → Prometheus Scrape (15s) → 存储 → 查询 → 返回结果
     ↓              ↓                      ↓       ↓        ↓
   即时           最多 15s 延迟          即时     即时     即时
```

总延迟 = scrape interval + query range + 网络延迟

#### 代码/配置实现

调整 AnalysisTemplate 的查询参数以应对延迟：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: latency-aware-analysis
spec:
  metrics:
  - name: success-rate
    interval: 30s
    failureLimit: 3
    successCondition: result[0] >= 0.95
    failureCondition: result[0] < 0.9
    count: 10
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        # 使用较长的查询窗口（5m）来平滑指标波动
        query: |
          sum(rate(http_requests_total{
            status=~"5[0-9][0-9]"
          }[5m])) / sum(rate(http_requests_total{}[5m]))
```

#### 最佳实践

- **查询窗口**：使用 `[5m]` 或更长的窗口，避免短期波动导致误判。
- **failureLimit**：设置 `failureLimit: 3` 以上，容忍偶发的指标抖动。
- **预热时间**：在金丝雀 step 中先 pause 一段时间（如 2m），让指标稳定后再开始分析。
- **Prometheus 优化**：确保 Prometheus 的 scrape interval 不超过 15s，避免数据空洞。

### AnalysisTemplate 错误

#### 解决的问题

AnalysisTemplate 的 PromQL 查询语法错误、参数引用错误、指标名称错误等问题，会导致 AnalysisRun 失败，进而触发不必要的回滚。

#### 核心原理

AnalysisTemplate 的常见错误类型：

1. **PromQL 语法错误**：括号不匹配、函数名错误、标签选择器语法错误。
2. **参数引用错误**：`{{args.service-name}}` 拼写错误或参数未定义。
3. **指标不存在**：应用未暴露 Prometheus 指标，或指标名称变更。
4. **类型不匹配**：`successCondition` 中的比较操作符与返回值的类型不匹配。

#### 代码/配置实现

安全的 AnalysisTemplate 设计：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: safe-analysis
spec:
  args:
  - name: service-name
  - name: namespace
  - name: error-threshold
    value: "0.05"  # 提供默认值
  metrics:
  - name: error-rate
    interval: 30s
    failureLimit: 3
    # 使用宽松的成功条件 + 严格的失败条件
    successCondition: result[0] >= 0.95
    failureCondition: result[0] < 0.9
    count: 10
    provider:
      prometheus:
        address: http://prometheus-server.monitoring:80
        query: |
          # 使用 coalesce 处理指标不存在的情况
          coalesce(
            sum(rate(http_requests_total{
              service="{{args.service-name}}",
              namespace="{{args.namespace}}",
              status=~"5[0-9][0-9]"
            }[2m])) / sum(rate(http_requests_total{
              service="{{args.service-name}}",
              namespace="{{args.namespace}}"
            }[2m])),
            0
          )
```

#### 最佳实践

- **本地验证 PromQL**：在 Prometheus UI 或 Grafana Explore 中先验证查询语句。
- **使用默认参数值**：为所有 `args` 提供默认值，避免参数未传递时 AnalysisRun 失败。
- **宽松的成功条件**：`successCondition` 设置宽松阈值，`failureCondition` 设置严格阈值，中间区域视为"不确定"。
- **监控 AnalysisRun**：设置告警规则，监控 AnalysisRun 的失败率。

### 其他风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| 控制器单点故障 | 发布流程中断 | 多副本部署 argo-rollouts 控制器 |
| 金丝雀 Pod 资源不足 | 指标异常导致误回滚 | 确保金丝雀 Pod 有足够的资源配额 |
| 数据库 schema 不兼容 | 新版本无法正常工作 | 使用 Flyway/Liquibase 管理 schema 版本 |
| 缓存预热不足 | 新版本响应慢 | 使用 startupProbe 延长预热时间 |
| 配置漂移 | Rollout 状态与 Git 不一致 | Argo CD 的 selfHeal 自动修复 |

### 本章小结

Argo Rollouts 的渐进式交付能力强大，但在实际使用中需要注意流量管理方案的选择、指标采集延迟的处理、AnalysisTemplate 的正确性等关键问题。流量管理应根据服务流量大小选择合适的方案（低流量用 Istio，高流量用 NGINX）；指标分析应使用较长的查询窗口和合理的 failureLimit 来容忍指标波动；AnalysisTemplate 应提供默认参数值并在本地验证 PromQL 语法。通过合理的配置和最佳实践，可以充分发挥 Argo Rollouts 的能力，实现安全、可控的自动化发布。

---

## 13.8 总结

渐进式交付是现代云原生应用发布的核心理念。Argo Rollouts 作为 Kubernetes 生态中最成熟的渐进式交付工具，通过 `Rollout` CRD 提供了金丝雀发布、蓝绿部署、指标分析、自动回滚等完整能力。

本章从渐进式交付的基本概念出发，详细介绍了 Argo Rollouts 的安装部署、金丝雀发布策略、蓝绿部署策略、与 Argo CD 的集成方案，并提供了一个完整的实战配置模板。最后分析了流量管理、指标采集、AnalysisTemplate 等方面的潜在风险和最佳实践。

关键要点：

1. **金丝雀发布**适合需要逐步验证的场景，通过 `steps` 定义流量权重阶梯，结合 `AnalysisTemplate` 实现自动化决策。
2. **蓝绿部署**适合需要瞬间切换的场景，通过 `activeService` 和 `previewService` 实现快速切换和回滚。
3. **Argo CD 集成**通过自定义健康检查、同步波次、忽略差异三个机制实现 GitOps 工作流。
4. **流量管理**应根据服务流量大小选择合适的方案，低流量服务推荐使用 Istio。
5. **指标分析**应使用较长的查询窗口和合理的 failureLimit，避免指标抖动导致误判。

通过 Argo Rollouts，团队可以将发布从"高风险的手动操作"转变为"可观察、可控制、可自动化的标准流程"，在保证服务稳定性的前提下，加速功能交付速度。
