# 第二章 Argo CD 架构与核心概念

## 2.1 本章导读

Argo CD 是云原生生态中最流行的 GitOps 工具之一，被 CNCF 收录为毕业项目。理解 Argo CD 的内部架构和核心概念，是正确使用和运维 GitOps 平台的基础。本章将从组件架构、资源模型、同步机制、健康检查、生态对比五个维度，深入剖析 Argo CD 的设计原理与最佳实践。

---

## 2.2 整体架构

### 2.2.1 解决的问题

在 Kubernetes 原生环境中，应用交付面临以下挑战：

- **多集群管理困难**：需要将同一套配置部署到开发、测试、生产等多个集群
- **配置漂移**：kubectl apply 是一次性操作，后续集群状态被手动修改后无法自动恢复
- **权限管控复杂**：不同团队需要访问不同的命名空间和集群，缺乏细粒度 RBAC
- **部署可观测性差**：应用是否真正达到期望状态，缺乏直观的 Dashboard 和 Diff 能力

Argo CD 通过一套清晰的组件架构，将 Git 仓库作为单一可信源，持续保障集群状态与 Git 一致。

### 2.2.2 核心原理

Argo CD 采用 **控制器模式** 架构，由四个核心组件构成：

```
┌─────────────────────────────────────────────────────────┐
│                     Argo CD Control Plane                │
│                                                          │
│  ┌──────────────┐    ┌──────────────────┐               │
│  │  API Server   │◄──►│  Repository Server │               │
│  │  (gRPC/REST)  │    │  (Git/Helm 操作)   │               │
│  └──────┬───────┘    └──────────────────┘               │
│         │                                                 │
│  ┌──────▼───────┐    ┌──────────────────┐               │
│  │  Application │    │      Redis        │               │
│  │  Controller   │◄──►│  (缓存/订阅通知)   │               │
│  └──────────────┘    └──────────────────┘               │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│  目标集群 (Managed)  │
│  ┌──────────────┐   │
│  │  Workloads    │   │
│  └──────────────┘   │
└─────────────────────┘
```

#### API Server

**角色**：Argo CD 的入口网关，对外暴露 REST/gRPC API 和 Web UI。

**核心职责**：
- 认证与授权：集成 OIDC、LDAP、SAML、GitHub OAuth 等身份提供商
- 应用管理：CRUD Application、AppProject 等资源
- 操作触发：发起 Sync、Rollback、Refresh 等操作
- WebSocket 推送：通过 Server-Sent Events 实时推送应用状态变更

**通信流程**：
```
用户 (CLI/UI/API) ──► API Server ──► Kubernetes API (存储 CRD)
                         │
                         ├──► Repository Server (拉取 Git 清单)
                         └──► Application Controller (触发同步)
```

API Server 本身是无状态的，所有持久化数据存储在 Kubernetes CRD 中，缓存数据存储在 Redis。

#### Repository Server

**角色**：负责与 Git 仓库、Helm Chart、OCI 制品仓库交互的"文件系统层"。

**核心职责**：
- 克隆 Git 仓库并缓存到本地
- 渲染 Helm Chart（执行 `helm template`）
- 生成 Kustomize 清单（执行 `kustomize build`）
- 生成 Jsonnet / YAML 清单
- 返回渲染后的 Kubernetes 资源清单

**关键设计**：
- Repository Server 内部维护一个 **Git 缓存池**，避免每次请求都重新克隆
- 使用 `git ls-remote` 检测远程变更，无需 Webhook 也能定期感知
- 支持 SSH 密钥、HTTPS 用户名密码、GitHub App Token 等多种认证方式

#### Application Controller

**角色**：Argo CD 的核心控制器，运行 **控制循环**（Reconciliation Loop）。

**核心职责**：
- 定期对比 Git 中声明的期望状态与集群中的实际状态
- 当检测到差异时，根据同步策略决定是否自动修复
- 执行同步操作（Apply / Prune / Hook）
- 评估资源健康状态
- 处理自愈逻辑

**控制循环流程**：
```
1. 从 Kubernetes CRD 中读取 Application 对象
2. 调用 Repository Server 获取渲染后的期望清单
3. 调用 Kubernetes API 获取集群中的实际资源
4. 对比期望状态与实际状态，生成 Diff
5. 如果 Auto-Sync 启用，执行同步操作
6. 评估所有资源健康状态，更新 Application 状态
7. 循环间隔：默认 3 分钟（可通过 --status-queue-timeout 调整）
```

#### Redis

**角色**：缓存和消息中间件。

**核心职责**：
- 缓存 Git 仓库元数据（减少 Repository Server 重复拉取）
- 缓存渲染后的 Kubernetes 清单
- 缓存 Application 状态快照
- 作为 API Server 和 Application Controller 之间的消息订阅通道

**高可用**：生产环境建议使用 Redis Sentinel 或 Redis Cluster 避免单点故障。

### 2.2.3 代码/配置实现

Argo CD 的安装方式有多种，以下是通过 Helm Chart 部署的典型配置：

```yaml
# argocd-values.yaml
global:
  domain: argocd.example.com

configs:
  cm:
    # 同步周期（默认 180 秒）
    timeout.reconciliation: 180s
    # 仓库缓存过期时间
    reposerver.ignore.normalizer.jitter: 5s
  rbac:
    policy.default: role:readonly
    policy.csv: |
      p, role:team-lead, applications, sync, */*, allow
      p, role:team-lead, applications, override, */*, allow
      g, alice, role:team-lead

controller:
  replicas: 2
  resources:
    requests:
      cpu: 500m
      memory: 512Mi

server:
  replicas: 2
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: nginx
    hosts:
      - argocd.example.com

repoServer:
  replicas: 2
  resources:
    requests:
      cpu: 250m
      memory: 256Mi

redis:
  enabled: true
  architecture: standalone  # 生产环境建议使用 replication
```

### 2.2.4 使用场景

- **单集群 GitOps**：Argo CD 部署在目标集群自身，管理该集群的应用
- **多集群 GitOps**：Argo CD 部署在管理集群（Hub Cluster），通过 `kubeconfig` 或 `argocd cluster add` 管理多个工作集群
- **混合环境**：同时管理 Kubernetes 集群和非 Kubernetes 资源（如 AWS S3 策略、Cloudflare DNS 记录等，通过 Argo CD 的 Resource Customization 扩展）

### 2.2.5 潜在风险与注意事项

| 风险 | 说明 | 缓解措施 |
|------|------|----------|
| API Server 单点 | 无状态但依赖 Redis | 多副本 + Redis HA |
| Repository Server 内存 | 大量仓库同时拉取时内存飙升 | 限制并发连接数，设置资源配额 |
| 控制循环延迟 | 默认 3 分钟，变更感知慢 | 配置 Webhook 加速，或缩短 reconciliation 时间 |
| 网络隔离 | 管理集群无法直连工作集群 | 使用 Argo CD 的 Cluster Proxy 或 Tunnel |

### 2.2.6 本章小结

Argo CD 的四组件架构（API Server、Repository Server、Application Controller、Redis）各司其职，通过控制循环模式实现了 Git 与集群状态的持续同步。API Server 负责入口和认证，Repository Server 负责清单渲染，Application Controller 负责状态对比和同步执行，Redis 提供缓存和消息通道。理解这一架构是后续深入使用 Argo CD 的基础。

---

## 2.3 核心资源对象

### 2.3.1 解决的问题

Kubernetes 原生资源（Deployment、Service 等）描述的是"运行什么"，而 GitOps 需要额外的元数据来描述"从哪里同步"、"同步到哪里"、"如何同步"。Argo CD 通过自定义 CRD 来承载这些 GitOps 语义。

### 2.3.2 核心原理

Argo CD 定义了三个核心 CRD：

#### Application

Application 是 Argo CD 中最基本的资源对象，描述了一个应用的完整 GitOps 配置。

**核心字段**：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
  # 使用 finalizer 确保删除 Application 时清理已部署的资源
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  # ── 源信息 ──
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD          # 分支、标签或 commit SHA
    path: guestbook               # 仓库中的目录路径
    # 也支持 Helm Chart
    # chart: nginx
    # targetRevision: 15.0.0

  # ── 目标集群 ──
  destination:
    server: https://kubernetes.default.svc  # 目标集群 API Server 地址
    namespace: guestbook                     # 目标命名空间

  # ── 同步策略 ──
  syncPolicy:
    automated:
      prune: true        # 自动删除 Git 中已移除的资源
      selfHeal: true     # 自动修复手动修改的资源
      allowEmpty: false  # 是否允许空清单（清空命名空间）
    syncOptions:
      - CreateNamespace=true          # 自动创建目标命名空间
      - PruneLast=true                # 最后执行 Prune（先创建再删除）
      - ApplyOutOfSyncOnly=true       # 只 Apply 不同步的资源
      - RespectIgnoreDifferences=true # 尊重 ignoreDifferences 配置
      - ServerSideApply=true          # 使用服务端 Apply

  # ── 忽略差异 ──
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas              # 忽略副本数差异（用于 HPA 场景）
        - /spec/template/spec/containers/0/imagePullPolicy
    - group: autoscaling
      kind: HorizontalPodAutoscaler
      managedFieldsManagers:
        - kube-controller-manager     # 忽略特定管理者的字段

  # ── 信息（用于 UI 展示） ──
  info:
    - name: "Git URL"
      value: "https://github.com/argoproj/argocd-example-apps"
```

**Application 状态字段**：

```yaml
status:
  # 同步状态
  sync:
    status: Synced  # Synced / OutOfSync / Unknown
    comparedTo:
      source:
        repoURL: https://github.com/argoproj/argocd-example-apps.git
        path: guestbook
      destination: {}
    revision: abc123def456

  # 健康状态
  health:
    status: Healthy  # Healthy / Progressing / Degraded / Suspended / Missing / Unknown

  # 操作状态
  operationState:
    phase: Succeeded  # Running / Succeeded / Failed / Error / Terminating
    startedAt: "2024-01-01T00:00:00Z"
    finishedAt: "2024-01-01T00:01:00Z"
    syncResult:
      resources:
        - kind: Deployment
          name: guestbook
          namespace: guestbook
          status: Synced
          hookPhase: Running
```

#### AppProject

AppProject 是 Argo CD 的 **逻辑隔离单元**，用于对 Application 进行分组和权限管控。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: platform-team
  namespace: argocd
spec:
  # ── 允许的源仓库 ──
  sourceRepos:
    - 'https://github.com/platform-team/*'
    - 'https://charts.bitnami.com/bitnami'

  # ── 允许的目标集群和命名空间 ──
  destinations:
    - namespace: 'platform-*'
      server: https://kubernetes.default.svc
    - namespace: 'production'
      server: https://prod-cluster.example.com

  # ── 允许的目标集群（白名单） ──
  clusterResourceWhitelist:
    - group: '*'
      kind: '*'

  # ── 禁止的命名空间资源 ──
  namespaceResourceBlacklist:
    - group: ''
      kind: Secret
    - group: 'rbac.authorization.k8s.io'
      kind: ClusterRoleBinding

  # ── 角色和策略 ──
  roles:
    - name: admin
      description: Platform team admin
      policies:
        - p, proj:platform-team:admin, applications, sync, platform-team/*, allow
        - p, proj:platform-team:admin, applications, delete, platform-team/*, allow
      groups:
        - platform-admins

  # ── 孤儿资源监控 ──
  orphanedResources:
    warn: true        # 警告模式（不自动清理）
    ignore:
      - group: ''
        kind: ConfigMap
        name: kube-root-ca.crt

  # ── 签名验证 ──
  signatureKeys:
    - keyID: GPG-KEY-PLATFORM-TEAM
```

**AppProject 的权限模型**：

```
AppProject
  ├── sourceRepos        → 限制 Application 可以从哪些仓库拉取
  ├── destinations       → 限制 Application 可以部署到哪些集群/命名空间
  ├── roles              → 定义项目级别的 RBAC 角色
  └── orphanedResources  → 孤儿资源检测策略
```

#### ApplicationSet

ApplicationSet 是 Argo CD 的 **批量应用生成器**，解决多集群、多环境的重复配置问题。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: guestbook-multi-env
  namespace: argocd
spec:
  # ── 生成器 ──
  generators:
    # 列表生成器：为每个条目生成一个 Application
    - list:
        elements:
          - cluster: dev
            url: https://kubernetes.default.svc
            namespace: guestbook-dev
          - cluster: staging
            url: https://staging-cluster.example.com
            namespace: guestbook-staging
          - cluster: prod
            url: https://prod-cluster.example.com
            namespace: guestbook-prod

    # Git 文件生成器：从 Git 仓库中的 JSON/YAML 文件读取参数
    - git:
        repoURL: https://github.com/argoproj/argocd-example-apps.git
        revision: HEAD
        files:
          - path: "config/clusters/*/config.json"

    # 集群生成器：自动发现 Argo CD 中注册的集群
    - clusters:
        selector:
          matchLabels:
            env: production

    # Git 目录生成器：遍历 Git 仓库中的子目录
    - git:
        repoURL: https://github.com/argoproj/argocd-example-apps.git
        revision: HEAD
        directories:
          - path: "apps/*"

    # Pull Request 生成器：为每个 PR 创建临时环境
    - pullRequest:
        provider: github
        repo: myorg/myapp
        requeueAfterSeconds: 300

    # SCM Provider 生成器：自动发现仓库
    - scmProvider:
        github:
          organization: myorg
          allBranches: true

    # Matrix 生成器：组合多个生成器的结果
    - matrix:
        generators:
          - clusters: {}
          - git:
              repoURL: https://github.com/argoproj/argocd-example-apps.git
              revision: HEAD
              files:
                - path: "config/apps/*.json"

    # Merge 生成器：合并多个生成器的结果
    - merge:
        mergeKeys:
          - name
        generators:
          - list:
              elements:
                - name: app-1
                  env: dev
          - list:
              elements:
                - name: app-1
                  replicas: 3

  # ── 模板 ──
  template:
    metadata:
      name: '{{cluster}}-guestbook'
      labels:
        env: '{{cluster}}'
    spec:
      source:
        repoURL: https://github.com/argoproj/argocd-example-apps.git
        targetRevision: HEAD
        path: guestbook
        helm:
          parameters:
            - name: replicaCount
              value: '{{replicas}}'
      destination:
        server: '{{url}}'
        namespace: '{{namespace}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true

  # ── 模板补丁（可选，覆盖模板中的特定字段） ──
  templatePatch: |
    spec:
      source:
        helm:
          values: |
            replicaCount: {{replicas}}
            env: {{cluster}}

  # ── 策略 ──
  strategy:
    type: RollingSync
    rollingSync:
      steps:
        - matchExpressions:
            - key: env
              operator: In
              values:
                - dev
          maxUpdate: 100%
        - matchExpressions:
            - key: env
              operator: In
              values:
                - staging
          maxUpdate: 50%
        - matchExpressions:
            - key: env
              operator: In
              values:
                - prod
          maxUpdate: 1
```

### 2.3.3 代码/配置实现

**多集群 ApplicationSet 实战**：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: istio-base
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            argocd.argoproj.io/secret-type: cluster
            mesh: istio
  template:
    metadata:
      name: '{{name}}-istio-base'
    spec:
      project: service-mesh
      source:
        repoURL: https://github.com/istio/istio.git
        targetRevision: 1.20.0
        path: manifests/charts/base
      destination:
        server: '{{server}}'
        namespace: istio-system
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

### 2.3.4 使用场景

| 资源 | 典型场景 |
|------|----------|
| Application | 单个微服务的 GitOps 部署 |
| AppProject | 按团队（平台团队、业务团队）或按环境（dev、staging、prod）隔离 |
| ApplicationSet | 多集群部署、多环境部署、PR 预览环境、GitOps 批量管理 |

### 2.3.5 潜在风险与注意事项

- **ApplicationSet 的生成器爆炸**：List 生成器 + Matrix 生成器组合时，可能生成大量 Application，导致 API Server 压力过大。建议设置 `--applicationset-controller.max-clusters` 限制。
- **AppProject 的 sourceRepos 过于宽松**：使用通配符 `*` 可能导致意外来源的代码被部署。建议精确到具体的组织或仓库。
- **Application 的 finalizer**：如果不设置 `resources-finalizer.argocd.argoproj.io`，删除 Application 时不会清理已部署的资源，导致孤儿资源。

### 2.3.6 本章小结

Application、AppProject、ApplicationSet 构成了 Argo CD 的资源模型骨架。Application 定义"从哪来到哪去"，AppProject 提供"权限和隔离"，ApplicationSet 实现"批量生成"。三者配合可以管理从单个应用到数千个集群的复杂场景。

---

## 2.4 同步机制

### 2.4.1 解决的问题

Git 仓库中的声明式配置与集群中的实际运行状态之间存在天然的"时差"。同步机制要解决的核心问题是：**如何安全、可控、可观测地将 Git 中的期望状态应用到集群**，同时支持灰度发布、蓝绿部署、数据库迁移等复杂场景。

### 2.4.2 核心原理

#### 同步策略

**手动同步（Manual Sync）**：

用户通过 CLI 或 UI 手动触发同步。适用于生产环境需要人工审批的场景。

```bash
# 手动触发同步
argocd app sync guestbook

# 指定同步策略
argocd app sync guestbook --prune --apply-out-of-sync-only

# 指定同步到特定版本
argocd app sync guestbook --revision abc123
```

**自动同步（Auto Sync）**：

Argo CD 在每次控制循环中自动执行同步。适用于开发环境或成熟的 CI/CD 流水线。

```yaml
syncPolicy:
  automated:
    prune: true        # 自动删除已移除的资源
    selfHeal: true     # 自动修复手动修改
    allowEmpty: false  # 不允许空清单
```

**prune 与 selfHeal 的区别**：

| 特性 | 触发条件 | 行为 |
|------|----------|------|
| Prune | Git 中删除了某个资源 | 在集群中删除该资源 |
| SelfHeal | 集群中资源被手动修改 | 将资源恢复为 Git 中的定义 |

#### 同步阶段与 Waves

Argo CD 的同步过程分为三个阶段，每个阶段可以包含多个 Wave：

```
Sync 开始
  │
  ├── PreSync Phase
  │     ├── Wave -10: 数据库迁移 Job（创建）
  │     ├── Wave  -5: 网络策略（创建/更新）
  │     └── Wave   0: 就绪检查
  │
  ├── Sync Phase
  │     ├── Wave   0: Namespace, ServiceAccount, RBAC
  │     ├── Wave   1: ConfigMap, Secret
  │     ├── Wave   2: PersistentVolumeClaim
  │     ├── Wave   3: Service, Ingress
  │     ├── Wave   4: Deployment, StatefulSet
  │     └── Wave   5: DaemonSet
  │
  └── PostSync Phase
        ├── Wave  10: 验证 Job（检查应用是否正常运行）
        └── Wave  20: 清理 Job（清理临时资源）
```

**Wave 的排序规则**：
- 数字越小越先执行
- 相同 Wave 的资源并行 Apply
- 前一个 Wave 的所有资源达到 Healthy 后，才进入下一个 Wave

**配置方式**：在资源注解中指定 Wave：

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  annotations:
    argocd.argoproj.io/sync-wave: "-10"   # PreSync 阶段，最先执行
    argocd.argoproj.io/hook: PreSync      # 指定为 PreSync Hook
spec:
  template:
    spec:
      containers:
        - name: migration
          image: myapp:latest
          command: ["rake", "db:migrate"]
      restartPolicy: Never
  backoffLimit: 2
```

#### 同步 Hooks

Hooks 是在同步的特定阶段执行的临时资源，用于处理数据库迁移、数据初始化、验证等一次性任务。

**支持的 Hook 类型**：

| Hook 类型 | 执行时机 | 典型用途 |
|-----------|----------|----------|
| PreSync | Sync 阶段之前 | 数据库迁移、预检查 |
| Sync | Sync 阶段中 | 数据初始化 |
| PostSync | Sync 阶段之后 | 集成测试、验证、通知 |
| SyncFail | 同步失败时 | 回滚、告警、清理 |
| Skip | 始终跳过 | 条件性跳过 |

**Hook 的删除策略**：

```yaml
metadata:
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded  # 成功时删除
    # 可选值: HookSucceeded / HookFailed / BeforeHookCreation / 组合使用
```

**Hook 资源类型**：
- `Job`：最常用，执行完成后自动退出
- `Pod`：简单脚本执行
- `Argo Workflow`：复杂工作流（需要安装 Argo Workflows）

**完整的 Hook 示例**：

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: smoke-test
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
    argocd.argoproj.io/sync-wave: "10"
spec:
  template:
    spec:
      containers:
        - name: test
          image: curlimages/curl:latest
          command:
            - sh
            - -c
            - |
              for i in $(seq 1 30); do
                if curl -sf http://myapp:8080/health; then
                  echo "App is healthy"
                  exit 0
                fi
                sleep 2
              done
              echo "App failed to become healthy"
              exit 1
      restartPolicy: Never
```

### 2.4.3 代码/配置实现

**生产级同步策略配置**：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: production-app
spec:
  source:
    repoURL: https://github.com/myorg/myapp.git
    targetRevision: main
    path: deploy/production
  destination:
    server: https://prod-cluster.example.com
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
      - ApplyOutOfSyncOnly=true
      - RespectIgnoreDifferences=true
      - ServerSideApply=true
      - Validate=false
    retry:
      limit: 3
      backoff:
        duration: 10s
        factor: 2
        maxDuration: 3m
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
    - group: ""
      kind: Service
      jsonPointers:
        - /status
```

**手动同步的滚动策略**：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
spec:
  strategy:
    type: RollingSync
    rollingSync:
      steps:
        - matchExpressions:
            - key: env
              operator: In
              values: [dev]
          maxUpdate: 100%
        - matchExpressions:
            - key: env
              operator: In
              values: [staging]
          maxUpdate: 50%
        - matchExpressions:
            - key: env
              operator: In
              values: [prod]
          maxUpdate: 1
```

### 2.4.4 使用场景

| 场景 | 推荐策略 |
|------|----------|
| 开发环境 | Auto Sync + prune + selfHeal，快速迭代 |
| 预发布环境 | Auto Sync + prune，允许手动调试（关闭 selfHeal） |
| 生产环境 | Manual Sync + RollingSync 策略，人工审批 |
| 数据库迁移 | PreSync Hook + Wave -10，确保迁移先于应用启动 |
| 金丝雀发布 | RollingSync + 分阶段 maxUpdate |

### 2.4.5 潜在风险与注意事项

- **Prune 误删**：`prune: true` 配合 `PruneLast: false` 时，Argo CD 会先删除再创建，可能导致服务中断。建议使用 `PruneLast: true`。
- **SelfHeal 与 HPA 冲突**：如果 Deployment 的副本数由 HPA 动态调整，开启 selfHeal 会导致 Argo CD 不断将副本数重置为 Git 中的值。解决方案：在 `ignoreDifferences` 中忽略 `/spec/replicas`。
- **Hook 超时**：默认 Hook 超时 60 秒，长时间运行的 Job 需要设置 `argocd.argoproj.io/hook-delete-policy` 和合理的 `backoffLimit`。
- **ServerSideApply 兼容性**：部分 CRD 不支持 Server-Side Apply，需要逐个验证。

### 2.4.6 本章小结

Argo CD 的同步机制通过策略（Manual/Auto）、阶段（PreSync/Sync/PostSync）、Waves、Hooks 四个维度，提供了灵活而安全的部署编排能力。Wave 控制资源创建顺序，Hook 处理数据库迁移等一次性任务，RollingSync 实现灰度发布。理解这些机制是构建生产级 GitOps 流水线的关键。

---

## 2.5 健康检查与自愈

### 2.5.1 解决的问题

Kubernetes 资源创建后，Argo CD 需要判断资源是否"健康"——即是否达到预期的运行状态。不同资源类型的健康判定标准不同（Deployment 看 Ready 副本数，Job 看 Completion，Service 看 Endpoints），且用户可能需要对自定义资源（CRD）定义健康规则。

### 2.5.2 核心原理

#### 内置健康检查

Argo CD 为 Kubernetes 内置资源提供了默认的健康检查逻辑：

| 资源类型 | 健康判定标准 |
|----------|-------------|
| Deployment | `status.availableReplicas == spec.replicas` |
| StatefulSet | `status.readyReplicas == spec.replicas` |
| DaemonSet | `status.numberReady == status.desiredNumberScheduled` |
| Job | `status.conditions[type=Complete]` 或 `status.conditions[type=Failed]` |
| Pod | `status.phase == Running` 且所有容器 Ready |
| Service | 有 Endpoints（非 Headless Service） |
| Ingress | `status.loadBalancer.ingress` 非空 |
| PersistentVolumeClaim | `status.phase == Bound` |
| HorizontalPodAutoscaler | `status.currentMetrics` 非空 |

#### 自定义健康检查（Lua 脚本）

对于 CRD 或特殊资源，可以通过 Lua 脚本自定义健康检查逻辑。

**全局配置**（在 `argocd-cm` ConfigMap 中）：

```yaml
# argocd-cm ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  resource.customizations.health.cert-manager.io_Certificate: |
    hs = {}
    hs.status = "Progressing"
    hs.message = "Certificate is being issued"
    if obj.status ~= nil then
      if obj.status.conditions ~= nil then
        for i, condition in ipairs(obj.status.conditions) do
          if condition.type == "Ready" and condition.status == "True" then
            hs.status = "Healthy"
            hs.message = "Certificate is ready"
            return hs
          end
          if condition.type == "Ready" and condition.status == "False" then
            hs.status = "Degraded"
            hs.message = condition.message
            return hs
          end
        end
      end
    end
    return hs

  resource.customizations.health.argoproj.io_Rollout: |
    hs = {}
    if obj.status ~= nil then
      if obj.status.currentStepIndex == obj.status.stepCount then
        hs.status = "Healthy"
        hs.message = "Rollout completed"
        return hs
      end
    end
    hs.status = "Progressing"
    hs.message = "Rollout is progressing"
    return hs
```

**Application 级别的忽略配置**：

```yaml
spec:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
    - group: ""
      kind: Secret
      managedFieldsManagers:
        - kube-controller-manager
```

#### 资源定制化（Resource Customization）

除了健康检查，还可以定制资源的同步行为：

```yaml
# argocd-cm ConfigMap
data:
  # 资源动作：跳过特定资源的同步
  resource.customizations.actions.argoproj.io_Rollout: |
    - name: "restart"
      action.lua: |
        obj.spec.template.metadata.annotations["rollout-restart"] = os.time()
        return obj

  # 资源忽略差异
  resource.customizations.ignoreDifferences.argoproj.io_Rollout: |
    jsonPointers:
      - /status
      - /spec/template/metadata/annotations/rollout-restart
```

### 2.5.3 代码/配置实现

**生产级健康检查配置**：

```yaml
# argocd-cm ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  # ── 自定义 CRD 健康检查 ──
  resource.customizations.health.elasticsearch.k8s.elastic.co_Elasticsearch: |
    hs = {}
    if obj.status ~= nil and obj.status.phase == "green" then
      hs.status = "Healthy"
      return hs
    end
    if obj.status ~= nil and obj.status.phase == "red" then
      hs.status = "Degraded"
      return hs
    end
    hs.status = "Progressing"
    return hs

  resource.customizations.health.mongodbcommunity.mongodb.com_MongoDBCommunity: |
    hs = {}
    if obj.status ~= nil and obj.status.phase == "Running" then
      hs.status = "Healthy"
      return hs
    end
    if obj.status ~= nil and obj.status.phase == "Failed" then
      hs.status = "Degraded"
      return hs
    end
    hs.status = "Progressing"
    return hs

  # ── 忽略特定资源的差异 ──
  resource.customizations.ignoreDifferences.admissionregistration.k8s.io_MutatingWebhookConfiguration: |
    jsonPointers:
      - /webhooks/0/clientConfig/caBundle

  resource.customizations.ignoreDifferences.admissionregistration.k8s.io_ValidatingWebhookConfiguration: |
    jsonPointers:
      - /webhooks/0/clientConfig/caBundle
```

### 2.5.4 使用场景

- **CRD 健康检查**：Elasticsearch Operator、MongoDB Operator、Cert-Manager 等 Operator 管理的 CRD
- **Argo Rollouts 集成**：自定义 Rollout 资源的健康检查，实现蓝绿/金丝雀发布
- **忽略动态字段**：Service 的 `status`、Deployment 的 `metadata.generation`、HPA 的 `status.currentMetrics`
- **忽略平台注入**：Istio Sidecar 注入、Service Mesh 的 Annotation 修改

### 2.5.5 潜在风险与注意事项

- **Lua 脚本错误**：Lua 语法错误会导致健康检查失败，所有匹配的资源都会显示 Unknown 状态。建议先在测试环境验证。
- **忽略差异过于宽泛**：`ignoreDifferences` 使用 `*` 通配符可能隐藏真正的配置漂移。建议精确到具体字段。
- **健康检查性能**：大量 CRD 的自定义健康检查 Lua 脚本会增加 Application Controller 的 CPU 负载。建议只对关键 CRD 配置健康检查。

### 2.5.6 本章小结

健康检查是 Argo CD 判断应用是否"真正运行正常"的核心机制。内置健康检查覆盖了 Kubernetes 标准资源，Lua 脚本扩展支持任意 CRD。配合 `ignoreDifferences` 和资源定制化，可以精确控制哪些差异需要告警、哪些是预期行为。自愈（SelfHeal）则在此基础上自动修复非预期的状态变更。

---

## 2.6 Argo CD vs Flux CD

### 2.6.1 解决的问题

在 GitOps 工具选型时，Argo CD 和 Flux CD 是两个最主流的选择。理解两者的差异有助于根据团队和场景做出合理的技术决策。

### 2.6.2 核心原理对比

| 维度 | Argo CD | Flux CD |
|------|---------|---------|
| **架构** | 控制器模式（API Server + Controller + Repo Server + Redis） | 控制器模式（Source Controller + Kustomize Controller + Helm Controller + Notification Controller） |
| **安装复杂度** | 中等，需要管理 Redis | 简单，纯控制器，无外部依赖 |
| **多集群** | 原生支持（Hub Cluster 模式） | 通过 KubeConfig 或 Cluster API 支持 |
| **Web UI** | 功能丰富的 Dashboard | 无官方 UI（社区提供 Weave GitOps） |
| **同步触发** | 轮询 + Webhook | 轮询 + Webhook + GitRepository CRD |
| **Helm 支持** | 通过 Repo Server 渲染 | 原生 Helm Controller |
| **Kustomize** | 原生支持 | 原生支持 |
| **RBAC** | 内置 RBAC（Project + Role） | 依赖 Kubernetes RBAC |
| **同步策略** | PreSync/Sync/PostSync + Waves + Hooks | 无内置 Hook 机制（依赖 Kustomize 或 Helm 的 post-renderer） |
| **健康检查** | 内置 + Lua 脚本扩展 | 内置 + 自定义检查器 |
| **Secrets 管理** | 支持 SOPS、Vault、External Secrets | 支持 SOPS、Vault、Sealed Secrets |
| **性能** | 大规模场景需优化 Redis 和 Repo Server | 轻量，资源占用更低 |

### 2.6.3 代码/配置实现对比

**Argo CD Application**：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
spec:
  source:
    repoURL: https://github.com/myorg/myapp.git
    path: deploy
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**Flux CD Kustomization**：

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: myapp
  namespace: flux-system
spec:
  interval: 3m
  url: https://github.com/myorg/myapp.git
  ref:
    branch: main
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: myapp
  namespace: flux-system
spec:
  interval: 3m
  path: ./deploy
  prune: true
  sourceRef:
    kind: GitRepository
    name: myapp
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: myapp
      namespace: myapp
```

### 2.6.4 选型建议

| 场景 | 推荐工具 | 理由 |
|------|----------|------|
| 需要功能丰富的 Web UI | Argo CD | 内置 Dashboard，应用拓扑可视化 |
| 多集群管理 | Arco CD | 原生多集群支持，Hub Cluster 模式成熟 |
| 复杂部署编排（Hook/Wave） | Argo CD | PreSync/PostSync + Waves 机制 |
| 轻量级、资源敏感 | Flux CD | 无 Redis 依赖，资源占用低 |
| 纯 Helm 工作流 | Flux CD | Helm Controller 更原生 |
| 安全合规要求高 | Flux CD | 更小的攻击面，无外部依赖 |
| 团队需要 RBAC 隔离 | Argo CD | AppProject 提供细粒度权限 |
| 已有 Argo 生态（Workflows/Rollouts） | Argo CD | 同一生态，集成更紧密 |

### 2.6.5 潜在风险与注意事项

- **不要同时使用两者**：Argo CD 和 Flux CD 会互相冲突，同时管理同一资源会导致状态震荡。
- **迁移成本**：从 Flux 迁移到 Argo CD（或反之）需要重写所有配置，建议在项目初期就确定选型。
- **社区趋势**：两者都是 CNCF 项目，Argo CD 是毕业项目，Flux CD 是孵化项目，但 Flux 的社区活跃度持续增长。

### 2.6.6 本章小结

Argo CD 和 Flux CD 都是优秀的 GitOps 工具，但设计哲学不同。Argo CD 偏向"平台化"，提供丰富的 UI、RBAC、Hook 机制，适合需要复杂编排和多团队隔离的场景。Flux CD 偏向"轻量原生"，无外部依赖，资源占用低，适合对简洁性和安全性要求高的场景。选型时应根据团队的技术栈、运维能力和业务需求综合判断。

---

## 2.7 关键概念深度解析

### 2.7.1 Refresh vs Sync

这是 Argo CD 中最容易混淆的两个概念。

| 操作 | 行为 | 触发方式 |
|------|------|----------|
| **Refresh** | 重新拉取 Git 仓库，重新渲染清单，重新对比状态，**但不执行 Apply** | `argocd app refresh <app>` / UI 刷新按钮 |
| **Sync** | 在 Refresh 的基础上，**执行 Apply 操作**，将期望状态写入集群 | `argocd app sync <app>` / UI 同步按钮 |

**Refresh 的三种模式**：

```bash
# 普通 Refresh：重新拉取 Git 并对比
argocd app refresh guestbook

# 硬刷新：强制重新拉取（忽略缓存）
argocd app refresh guestbook --hard-refresh

# 仅刷新 Git 状态（不重新渲染）
argocd app refresh guestbook --refresh-type=git
```

**典型工作流**：

```
Git Push ──► Webhook ──► Refresh（更新状态）──► Auto-Sync（执行同步）
                │
                ▼
          UI 显示 OutOfSync
                │
                ▼
          人工审核 Diff
                │
                ▼
          手动 Sync（生产环境）
```

### 2.7.2 资源修剪（Pruning）

Pruning 是 Argo CD 删除集群中不再存在于 Git 中的资源的过程。

**Prune 的安全机制**：

```yaml
syncPolicy:
  automated:
    prune: true
  syncOptions:
    - PruneLast=true  # 先创建新资源，再删除旧资源
```

**Prune 的防护**：

```yaml
# 在 AppProject 级别禁止 Prune
spec:
  roles:
    - name: readonly
      policies:
        - p, proj:myproject:readonly, applications, sync, myproject/*, allow
        # 注意：没有赋予 prune 权限
```

**Prune 白名单**：

```yaml
# 在 argocd-cm 中配置
data:
  resource.exclusions: |
    - apiGroups:
      - "batch"
      kinds:
      - Job
    - apiGroups:
      - ""
      kinds:
      - Event
```

### 2.7.3 孤儿资源（Orphaned Resources）

孤儿资源是指集群中存在但未被任何 Application 管理的资源。通常由以下原因产生：

1. 删除 Application 时未设置 finalizer
2. 手动创建资源后未通过 Argo CD 管理
3. Application 的 source path 变更后，旧路径的资源未被清理

**检测与告警**：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
spec:
  orphanedResources:
    warn: true
    ignore:
      - group: ""
        kind: ConfigMap
        name: kube-root-ca.crt
      - group: ""
        kind: Secret
        name: default-token-*
```

**清理孤儿资源**：

```bash
# 列出孤儿资源
argocd app list --orphaned

# 手动删除孤儿资源
kubectl delete <resource> -n <namespace> <name>
```

### 2.7.4 资源 Hooks

Hooks 是 Argo CD 同步机制中最重要的扩展点之一。以下是 Hook 的完整行为模型：

**Hook 的生命周期**：

```
1. 同步开始
2. Argo CD 检查是否有 PreSync Hook
3. 创建 PreSync Hook 资源（Job/Pod）
4. 等待 Hook 完成（成功或失败）
5. 如果成功，继续 Sync 阶段
6. 如果失败，根据策略决定是否继续
7. Sync 阶段完成后，执行 PostSync Hook
8. 如果同步失败，执行 SyncFail Hook
9. 根据 delete-policy 清理 Hook 资源
```

**Hook 的删除策略组合**：

```yaml
metadata:
  annotations:
    argocd.argoproj.io/hook-delete-policy: |
      HookSucceeded
      BeforeHookCreation
```

| 策略 | 行为 |
|------|------|
| `HookSucceeded` | Hook 成功后删除 |
| `HookFailed` | Hook 失败后删除 |
| `BeforeHookCreation` | 创建新 Hook 前删除旧的同名 Hook |

**条件性 Hook**：

```yaml
metadata:
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
    # 仅在满足条件时执行
    argocd.argoproj.io/hook-condition: "{{.status.sync.status}} == Synced"
```

### 2.7.5 本章小结

Refresh 与 Sync 的区别在于是否执行 Apply，理解这一差异有助于排查"状态已更新但未生效"的问题。Pruning 是 GitOps 的核心能力之一，但需要配合 `PruneLast` 和 RBAC 确保安全。孤儿资源监控是运维大规模 Argo CD 集群的必备能力。Hooks 则为数据库迁移、集成测试等场景提供了灵活的扩展机制。

---

## 2.8 本章总结

本章从五个维度深入剖析了 Argo CD 的架构与核心概念：

1. **整体架构**：API Server、Repository Server、Application Controller、Redis 四组件各司其职，通过控制循环实现 Git 与集群的持续同步
2. **核心资源**：Application 定义同步源和目标，AppProject 提供权限隔离，ApplicationSet 实现批量生成
3. **同步机制**：通过策略（Manual/Auto）、阶段（PreSync/Sync/PostSync）、Waves、Hooks 四层模型，提供灵活安全的部署编排
4. **健康检查**：内置检查覆盖标准资源，Lua 脚本扩展支持 CRD，配合 ignoreDifferences 精确控制差异告警
5. **生态对比**：Argo CD 适合平台化、多集群、复杂编排场景；Flux CD 适合轻量、安全优先场景

掌握这些核心概念，是构建生产级 GitOps 平台的基础。下一章将深入 Argo CD 的安装配置与生产环境最佳实践。
