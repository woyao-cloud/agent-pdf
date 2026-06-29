# 第4章 使用 Kustomize 管理 Argo CD 应用配置

## 4.1 Kustomize 概述与核心价值

### 4.1.1 解决的问题

在 Kubernetes 环境中，应用部署通常需要管理多套环境（开发、测试、预发布、生产）的 YAML 清单。传统做法存在以下痛点：

- **重复复制**：为每个环境复制一份完整的 YAML 文件，修改基础配置时需同步所有环境
- **模板耦合**：使用 Helm 或手写脚本引入模板语法，导致 YAML 难以阅读和调试
- **环境差异管理困难**：不同环境之间的差异（副本数、镜像版本、资源配置）散落在多个文件中
- **缺乏声明式补丁机制**：难以在不修改原始文件的前提下对特定环境做定制

Kustomize 通过**纯 YAML 的声明式覆盖（overlay）机制**解决这些问题。它不引入模板语言，而是利用 Kubernetes 原生的补丁（patch）能力，在 base 配置之上逐层叠加环境差异。

### 4.1.2 核心原理

Kustomize 的核心思想是 **base + overlay = 最终配置**：

```
base/                  # 共享的基础配置
  kustomization.yaml   # 声明资源列表、通用标签、名称前缀等
  deployment.yaml
  service.yaml

overlays/
  dev/                 # 开发环境覆盖
    kustomization.yaml # 引用 base，叠加开发环境差异
  prod/                # 生产环境覆盖
    kustomization.yaml # 引用 base，叠加生产环境差异
```

构建过程是纯 YAML 的合并与补丁操作，不涉及模板渲染。每个 `kustomization.yaml` 声明了"我要引用哪些资源"和"我要对它们做什么修改"，Kustomize 按顺序执行这些声明式操作，输出最终的 Kubernetes 清单。

### 4.1.3 代码/配置实现

一个最简的 `kustomization.yaml` 结构如下：

```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml
  - configmap.yaml

commonLabels:
  app.kubernetes.io/name: my-app
  app.kubernetes.io/managed-by: kustomize

commonAnnotations:
  version: "1.0.0"
  environment: base

namePrefix: "app-"
nameSuffix: "-v1"

namespace: default
```

关键字段说明：

| 字段 | 作用 | 示例 |
|------|------|------|
| `resources` | 列出要包含的原始 YAML 文件 | `- deployment.yaml` |
| `commonLabels` | 为所有资源添加公共标签 | `env: base` |
| `commonAnnotations` | 为所有资源添加公共注解 | `team: platform` |
| `namePrefix` | 为所有资源名称添加前缀 | `app-` → `app-my-deployment` |
| `nameSuffix` | 为所有资源名称添加后缀 | `-v1` → `my-deployment-v1` |
| `namespace` | 为所有资源设置命名空间 | `default` |

### 4.1.4 使用场景

- 团队需要维护多套 Kubernetes 环境，且环境间差异较小
- 希望避免 Helm 的模板复杂度，保持 YAML 的纯声明式特性
- 需要将 Kubernetes 清单与 CI/CD 流程解耦，让开发者直接编辑 YAML
- 作为 Argo CD 的配置管理工具，实现 GitOps 工作流

### 4.1.5 潜在风险与注意事项

- Kustomize 不适用于需要条件逻辑的场景（如"如果环境是生产，则启用某个特性"），这类需求应使用 Helm 或 Jsonnet
- 过度使用 `namePrefix`/`nameSuffix` 会导致资源名称过长，超出 Kubernetes 的命名限制（253 字符）
- `commonLabels` 会覆盖资源中已有的同名标签，可能导致 selector 不匹配（特别是 Service 的 selector）

### 4.1.6 本章小结

Kustomize 提供了一种纯 YAML、无模板的配置管理方式，通过 base/overlay 模式解决多环境配置复用问题。其核心价值在于保持 YAML 的可读性和可审计性，同时通过声明式补丁实现环境差异管理。对于已经使用原生 Kubernetes YAML 的团队，Kustomize 是最低心智负担的配置管理方案。

---

## 4.2 Kustomize 补丁机制详解

### 4.2.1 解决的问题

多环境配置的核心挑战是：**如何在保持基础配置不变的前提下，对特定字段做精确修改？** 直接复制修改会导致配置漂移，而模板方案又牺牲了可读性。Kustomize 的补丁机制提供了第三种路径——声明式覆盖。

### 4.2.2 核心原理

Kustomize 支持两种补丁策略：

1. **`patchesStrategicMerge`**：使用部分 YAML 片段与目标资源进行智能合并（strategic merge）。合并规则遵循 Kubernetes 的 strategic merge patch 语义——列表默认按 `name` 字段合并而非替换。

2. **`patchesJson6902`**：使用 JSON Patch (RFC 6902) 语法，通过 JSONPath 表达式精确定位要修改的字段。适用于无法用 strategic merge 表达的场景。

补丁执行顺序：Kustomize 先应用 `patchesStrategicMerge`，再应用 `patchesJson6902`。如果多个补丁修改同一字段，后应用的补丁会覆盖先应用的。

### 4.2.3 代码/配置实现

#### patchesStrategicMerge 示例

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

patchesStrategicMerge:
  - increase-replicas.yaml
  - resource-limits.yaml
```

```yaml
# overlays/prod/increase-replicas.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 5
  template:
    spec:
      containers:
        - name: my-app
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
```

补丁文件只需包含要修改的字段，Kustomize 会将其与 base 中的完整 Deployment 进行智能合并。`name: my-app` 用于匹配目标容器。

#### patchesJson6902 示例

```yaml
# overlays/prod/kustomization.yaml
patchesJson6902:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: my-app
    path: patch-env.yaml
```

```yaml
# overlays/prod/patch-env.yaml
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: ENVIRONMENT
    value: production
- op: replace
  path: /spec/replicas
  value: 5
- op: remove
  path: /spec/template/spec/containers/0/resources
```

JSON Patch 操作类型：

| 操作 | 含义 | 说明 |
|------|------|------|
| `add` | 添加字段或数组元素 | 路径不存在时创建，数组用 `/-` 追加 |
| `remove` | 删除字段 | 路径必须存在 |
| `replace` | 替换字段值 | 路径必须存在 |
| `move` | 移动字段 | 源路径到目标路径 |
| `copy` | 复制字段 | 源路径到目标路径 |
| `test` | 测试字段值 | 满足条件才执行后续操作 |

#### ConfigMapGenerator 与 SecretGenerator

```yaml
# base/kustomization.yaml
configMapGenerator:
  - name: app-config
    literals:
      - APP_ENV=base
      - LOG_LEVEL=info
    files:
      - configs/application.properties
  - name: app-templates
    files:
      - templates/index.html

secretGenerator:
  - name: app-secret
    literals:
      - DB_PASSWORD=changeme
    type: Opaque
  - name: tls-cert
    files:
      - certs/tls.crt
      - certs/tls.key
    type: kubernetes.io/tls
```

Kustomize 会为生成的 ConfigMap/Secret 自动添加内容哈希后缀（如 `app-config-6c8b9f7d4k`），当内容变化时名称自动更新，触发 Pod 滚动更新。

禁用哈希后缀：

```yaml
generatorOptions:
  disableNameSuffixHash: true
```

### 4.2.4 使用场景

- **patchesStrategicMerge**：修改 Deployment 的副本数、资源限制、环境变量等常见字段
- **patchesJson6902**：删除特定字段、操作数组中的非 name 匹配元素、修改 CRD 资源
- **ConfigMapGenerator**：管理环境特定的配置文件，利用哈希后缀实现自动滚动更新
- **SecretGenerator**：安全地管理密钥，避免明文存储在 Git 中（结合 sops 或 sealed-secrets）

### 4.2.5 潜在风险与注意事项

- **补丁冲突**：多个补丁修改同一字段时，后应用的覆盖先应用的，且不会报错。建议保持补丁的原子性，每个补丁只修改一个关注点
- **Strategic Merge 的列表合并陷阱**：默认按 `name` 合并列表，如果容器名相同但镜像不同，会合并而非替换。需要显式使用 `$patch: delete` 标记删除元素
- **JSON Patch 路径脆弱性**：路径 `/spec/template/spec/containers/0/` 依赖容器顺序，如果 base 中容器顺序变化，补丁可能应用到错误的容器。建议使用 strategic merge 按 name 匹配
- **SecretGenerator 的安全风险**：`literals` 中的值会明文出现在 `kustomization.yaml` 中，不应提交到 Git。应使用外部工具（如 sops、external-secrets）管理敏感数据

### 4.2.6 本章小结

Kustomize 的补丁机制是环境差异化配置的核心能力。`patchesStrategicMerge` 适合大多数常见场景，`patchesJson6902` 提供更精细的控制。理解两种补丁的合并语义和适用边界，是正确使用 Kustomize 的关键。ConfigMapGenerator 和 SecretGenerator 通过哈希后缀实现了配置变更的自动感知，是 GitOps 工作流中的重要组件。

---

## 4.3 环境特定配置与 Overlay 目录结构

### 4.3.1 解决的问题

实际项目中通常需要管理开发、测试、预发布、生产等多套环境。每套环境在镜像版本、副本数、资源配置、ConfigMap 内容等方面存在差异。如何组织这些配置，使其既共享公共部分又保持环境隔离，是配置管理的核心问题。

### 4.3.2 核心原理

Kustomize 的 overlay 模式通过**分层继承**解决环境配置问题：

```
project-root/
├── base/                    # 共享基础层
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── hpa.yaml
│   └── configmap.yaml
└── overlays/
    ├── dev/                 # 开发环境
    │   ├── kustomization.yaml
    │   ├── configmap-dev.yaml
    │   └── patch-replicas.yaml
    ├── staging/             # 预发布环境
    │   ├── kustomization.yaml
    │   ├── configmap-staging.yaml
    │   └── patch-resources.yaml
    └── prod/                # 生产环境
        ├── kustomization.yaml
        ├── configmap-prod.yaml
        ├── patch-hpa.yaml
        └── ingress-prod.yaml
```

每个 overlay 的 `kustomization.yaml` 通过 `resources` 字段引用 base 目录，然后叠加自己的补丁和额外资源。构建时，Kustomize 先渲染 base，再按 overlay 的声明逐层应用补丁。

### 4.3.3 代码/配置实现

#### 完整的 Overlay 示例

**base/kustomization.yaml**：

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml
  - hpa.yaml
  - configmap.yaml

commonLabels:
  app.kubernetes.io/name: spring-app
  app.kubernetes.io/managed-by: kustomize

namePrefix: "spring-"

namespace: default
```

**overlays/dev/kustomization.yaml**：

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

namePrefix: "dev-"

commonLabels:
  environment: dev

patchesStrategicMerge:
  - patch-replicas.yaml

configMapGenerator:
  - name: app-config
    behavior: replace
    literals:
      - APP_ENV=development
      - LOG_LEVEL=debug
      - DB_URL=jdbc:postgresql://dev-db:5432/app
```

**overlays/prod/kustomization.yaml**：

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base
  - ingress-prod.yaml

namePrefix: "prod-"

commonLabels:
  environment: production

patchesStrategicMerge:
  - patch-replicas.yaml
  - patch-resources.yaml
  - patch-hpa.yaml

configMapGenerator:
  - name: app-config
    behavior: replace
    literals:
      - APP_ENV=production
      - LOG_LEVEL=warn
      - DB_URL=jdbc:postgresql://prod-db:5432/app

images:
  - name: my-app
    newName: my-registry/my-app
    newTag: v1.2.3
```

**overlays/prod/patch-replicas.yaml**：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 5
  template:
    spec:
      containers:
        - name: my-app
          resources:
            requests:
              cpu: "1"
              memory: "1Gi"
            limits:
              cpu: "2"
              memory: "2Gi"
```

**overlays/prod/patch-hpa.yaml**：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app
spec:
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

#### 构建与验证

```bash
# 构建开发环境配置
kustomize build overlays/dev/

# 构建生产环境配置
kustomize build overlays/prod/

# 输出到文件
kustomize build overlays/prod/ > prod-manifests.yaml

# 直接应用到集群
kustomize build overlays/prod/ | kubectl apply -f -
```

### 4.3.4 使用场景

- **多环境 GitOps**：每个 overlay 对应 Argo CD 中的一个 Application，实现环境级隔离
- **特性分支预览**：为每个 PR 动态生成 overlay，部署到临时命名空间
- **区域性部署**：为不同地理区域（us-east、eu-west）创建 overlay，覆盖区域特定的配置
- **渐进式发布**：通过 overlay 控制金丝雀部署的流量比例和副本数

### 4.3.5 潜在风险与注意事项

- **Overlay 数量膨胀**：当环境数量超过 5-8 个时，维护成本急剧上升。建议使用 Kustomize 的 `components` 特性（Kustomize v4+）将正交的配置维度拆分为可组合的组件
- **深层嵌套**：避免超过 3 层的 overlay 嵌套（base → 中间层 → 环境层），否则配置追踪困难
- **ConfigMap behavior 选择**：`behavior: replace` 会完全替换 base 中的同名 ConfigMap，`behavior: merge` 则合并。误用 `merge` 可能导致 base 中的敏感配置泄露到生产环境
- **构建性能**：大量资源文件（1000+）时 `kustomize build` 可能变慢，考虑拆分应用

### 4.3.6 本章小结

Overlay 目录结构是 Kustomize 组织多环境配置的最佳实践。通过 base 共享公共配置、overlay 叠加环境差异，实现了配置的最大化复用和最小化重复。合理的 overlay 层次（通常 2-3 层）在灵活性和可维护性之间取得平衡。对于更复杂的组合需求，Kustomize Components 提供了正交化的配置组合能力。

---

## 4.4 Argo CD 与 Kustomize 集成

### 4.4.1 解决的问题

Argo CD 作为 GitOps 工具，需要能够从 Git 仓库读取 Kubernetes 清单并同步到集群。当使用 Kustomize 管理配置时，Argo CD 需要理解 Kustomize 的构建过程——即先执行 `kustomize build` 生成最终清单，再将结果应用到集群。集成需要解决以下问题：

- 如何让 Argo CD 自动识别并构建 Kustomize 项目
- 如何在 Argo CD 的 Application 层面覆盖 Kustomize 中的参数（如镜像版本）
- 如何确保 Argo CD 中看到的配置与 `kustomize build` 输出一致

### 4.4.2 核心原理

Argo CD 内置了 Kustomize 支持。当 Application 的 `path` 指向包含 `kustomization.yaml` 的目录时，Argo CD 自动执行 `kustomize build` 来渲染清单。整个过程如下：

```
Git Repo (kustomization.yaml + YAML)
        │
        ▼
Argo CD 读取 path 目录
        │
        ▼
检测到 kustomization.yaml → 执行 kustomize build
        │
        ▼
生成最终 Kubernetes 清单
        │
        ▼
与集群当前状态对比 → 同步差异
```

Argo CD 还支持在 Application 级别覆盖 Kustomize 参数（如 `kustomize.image`），这些覆盖会在 `kustomize build` 之后额外应用，实现 CI/CD 流水线对部署参数的动态控制。

### 4.4.3 代码/配置实现

#### 基础 Application 配置

```yaml
# application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: spring-app-prod
  namespace: argocd
spec:
  project: default

  source:
    repoURL: https://github.com/my-org/my-app.git
    targetRevision: main
    path: overlays/prod
    # Kustomize 特定配置
    kustomize:
      namePrefix: prod-
      nameSuffix: -v2
      commonLabels:
        deployed-by: argocd
      commonAnnotations:
        argocd.argoproj.io/sync-options: Prune=true

  destination:
    server: https://kubernetes.default.svc
    namespace: production

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ApplyOutOfSyncOnly=true
```

#### 使用 kustomize.image 参数覆盖

```yaml
# application-with-image-override.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: spring-app-prod
spec:
  source:
    repoURL: https://github.com/my-org/my-app.git
    targetRevision: main
    path: overlays/prod
    kustomize:
      images:
        - my-app=my-registry/my-app:v1.2.3-build.456
        - sidecar=my-registry/sidecar:latest
```

这个功能在 CI/CD 流水线中特别有用——CI 构建出新镜像后，通过 Argo CD API 或 CLI 更新 Application 的 `kustomize.images` 参数，触发同步：

```bash
# 使用 argocd CLI 设置镜像覆盖
argocd app set spring-app-prod \
  --kustomize-image my-app=my-registry/my-app:v1.2.3-build.456

# 触发同步
argocd app sync spring-app-prod
```

#### 多源 Application（Argo CD 2.6+）

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: spring-app-multi-source
spec:
  sources:
    - repoURL: https://github.com/my-org/my-app.git
      targetRevision: main
      path: base
      ref: base
    - repoURL: https://github.com/my-org/my-app-config.git
      targetRevision: main
      path: overlays/prod
      kustomize:
        images:
          - my-app=my-registry/my-app:v1.2.3
```

#### Argo CD Kustomize 构建参数

```yaml
spec:
  source:
    kustomize:
      # 等同于 kustomize build --reorder=none
      reorder: none
      # 版本控制
      version: v5.0.0
      # 额外的 kustomize 命令参数
      buildOptions: "--load-restrictor LoadRestrictionsNone"
```

### 4.4.4 使用场景

- **GitOps 工作流**：开发者提交 PR 修改 overlay 配置，合并后 Argo CD 自动同步
- **CI/CD 集成**：CI 流水线构建镜像后，通过 `kustomize.image` 更新 Application，实现自动部署
- **多集群部署**：同一套 Kustomize 配置部署到多个集群，通过 Argo CD Application 的 `kustomize` 字段覆盖集群特定参数
- **渐进式交付**：结合 Argo Rollouts，通过 Kustomize 管理蓝绿/金丝雀部署的配置

### 4.4.5 潜在风险与注意事项

- **参数覆盖优先级**：Argo CD 的 `kustomize.images` 覆盖优先级高于 `kustomization.yaml` 中的 `images` 字段，但低于 `patchesStrategicMerge`。理解这个优先级顺序对调试非常重要
- **版本兼容性**：Argo CD 内置的 Kustomize 版本可能落后于最新版。检查 Argo CD 版本对应的 Kustomize 版本，避免使用不支持的特性。Argo CD v2.8+ 内置 Kustomize v5.x
- **`buildOptions` 的安全风险**：使用 `--load-restrictor LoadRestrictionsNone` 允许加载 `kustomization.yaml` 目录外的文件，但可能引入安全风险。仅在必要时使用，并确保 Git 仓库的访问控制
- **Application 与 Kustomize 的 namePrefix 冲突**：如果在 Application 和 `kustomization.yaml` 中都设置了 `namePrefix`，Argo CD 会叠加两者，可能导致资源名称不符合预期

### 4.4.6 本章小结

Argo CD 对 Kustomize 的原生支持使得 GitOps 工作流中的配置管理变得简单直接。通过 Application 的 `kustomize` 字段，可以在不修改 Git 仓库的情况下动态覆盖镜像版本等参数，实现 CI/CD 与 GitOps 的灵活结合。理解 Argo CD 中 Kustomize 的构建流程和参数优先级，是正确配置生产级 GitOps 流水线的基础。

---

## 4.5 实战：Spring Boot 应用的完整 Kustomize 配置

### 4.5.1 解决的问题

以一个典型的 Spring Boot 微服务为例，展示如何从零构建完整的 Kustomize 配置。该应用需要：

- 多环境部署（开发、生产）
- 环境特定的 ConfigMap（application.yml 配置）
- 生产环境 HPA 自动扩缩容
- 生产环境使用 Ingress 暴露服务
- 不同环境的镜像版本和资源限制

### 4.5.2 核心原理

通过分层设计，将 Spring Boot 应用的通用配置放在 base 中，环境差异通过 overlay 覆盖。ConfigMap 使用 `behavior: replace` 实现环境级别的完全替换，避免 base 中的配置泄露到生产环境。

### 4.5.3 代码/配置实现

#### 完整目录结构

```
spring-app/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── hpa.yaml
│   └── configmap.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── configmap-dev.yaml
    └── prod/
        ├── kustomization.yaml
        ├── configmap-prod.yaml
        ├── ingress.yaml
        └── patches/
            ├── patch-replicas.yaml
            ├── patch-resources.yaml
            └── patch-hpa.yaml
```

#### Base 层配置

**base/kustomization.yaml**：

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml
  - hpa.yaml
  - configmap.yaml

commonLabels:
  app.kubernetes.io/name: spring-app
  app.kubernetes.io/part-of: ecommerce
  app.kubernetes.io/managed-by: kustomize

namePrefix: "spring-"

namespace: default
```

**base/deployment.yaml**：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: spring-app
  template:
    metadata:
      labels:
        app.kubernetes.io/name: spring-app
    spec:
      containers:
        - name: app
          image: my-registry/spring-app:latest
          ports:
            - containerPort: 8080
              protocol: TCP
          env:
            - name: SPRING_CONFIG_LOCATION
              value: /config/application.yml
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 5
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: config
              mountPath: /config
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: app-config
```

**base/service.yaml**：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: app
spec:
  type: ClusterIP
  ports:
    - port: 8080
      targetPort: 8080
      protocol: TCP
      name: http
  selector:
    app.kubernetes.io/name: spring-app
```

**base/hpa.yaml**：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app
  minReplicas: 1
  maxReplicas: 3
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
```

**base/configmap.yaml**：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  application.yml: |
    server:
      port: 8080
    spring:
      application:
        name: spring-app
      datasource:
        url: jdbc:postgresql://localhost:5432/app
        username: app_user
        password: changeme
      jpa:
        hibernate:
          ddl-auto: update
        show-sql: true
    management:
      endpoints:
        web:
          exposure:
            include: health,info,metrics
```

#### Dev Overlay 配置

**overlays/dev/kustomization.yaml**：

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

namePrefix: "dev-"

commonLabels:
  environment: dev

patchesStrategicMerge:
  - configmap-dev.yaml

images:
  - name: my-registry/spring-app
    newTag: develop-latest
```

**overlays/dev/configmap-dev.yaml**：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  application.yml: |
    server:
      port: 8080
    spring:
      application:
        name: spring-app-dev
      datasource:
        url: jdbc:postgresql://dev-db.cluster.local:5432/spring_app_dev
        username: dev_user
        password: dev_password
      jpa:
        hibernate:
          ddl-auto: update
        show-sql: true
    logging:
      level:
        root: DEBUG
        com.example: DEBUG
    management:
      endpoints:
        web:
          exposure:
            include: "*"
```

#### Prod Overlay 配置

**overlays/prod/kustomization.yaml**：

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base
  - ingress.yaml

namePrefix: "prod-"

commonLabels:
  environment: production

patchesStrategicMerge:
  - configmap-prod.yaml
  - patches/patch-replicas.yaml
  - patches/patch-resources.yaml
  - patches/patch-hpa.yaml

images:
  - name: my-registry/spring-app
    newName: my-registry/spring-app
    newTag: v1.0.0
```

**overlays/prod/configmap-prod.yaml**：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  application.yml: |
    server:
      port: 8080
    spring:
      application:
        name: spring-app-prod
      datasource:
        url: jdbc:postgresql://prod-db.cluster.local:5432/spring_app_prod
        username: prod_user
        password: ${DB_PASSWORD}
      jpa:
        hibernate:
          ddl-auto: validate
        show-sql: false
    logging:
      level:
        root: WARN
        com.example: INFO
    management:
      endpoints:
        web:
          exposure:
            include: health,info,metrics
```

**overlays/prod/ingress.yaml**：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - app.mycompany.com
      secretName: app-tls
  rules:
    - host: app.mycompany.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 8080
```

**overlays/prod/patches/patch-replicas.yaml**：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
```

**overlays/prod/patches/patch-resources.yaml**：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
        - name: app
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "2"
              memory: "2Gi"
```

**overlays/prod/patches/patch-hpa.yaml**：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app
spec:
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
```

#### Argo CD Application 配置

```yaml
# spring-app-dev.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: spring-app-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/spring-app.git
    targetRevision: main
    path: overlays/dev
  destination:
    server: https://kubernetes.default.svc
    namespace: dev
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
---
# spring-app-prod.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: spring-app-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/spring-app.git
    targetRevision: main
    path: overlays/prod
    kustomize:
      images:
        - my-registry/spring-app=my-registry/spring-app:v1.0.0
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

#### 验证构建输出

```bash
# 构建开发环境
kustomize build overlays/dev/ --output dev-output.yaml

# 构建生产环境
kustomize build overlays/prod/ --output prod-output.yaml

# 对比两个环境的差异
diff <(kustomize build overlays/dev/) <(kustomize build overlays/prod/)
```

### 4.5.4 使用场景

- **Spring Boot 微服务 GitOps 部署**：完整的端到端配置，可直接用于生产项目
- **多环境 CI/CD 流水线**：CI 构建后根据分支自动选择 overlay 部署
- **配置审计**：通过 `kustomize build` 输出进行配置审查，确保环境间差异可控

### 4.5.5 潜在风险与注意事项

- **ConfigMap 中的敏感信息**：`configmap-prod.yaml` 中的 `${DB_PASSWORD}` 是占位符，实际生产环境中应使用 External Secrets Operator 或 Sealed Secrets 管理
- **HPA 与资源限制的配合**：HPA 的扩缩容决策基于 Pod 的实际资源使用率，必须确保 `requests` 设置合理。如果 `requests` 设置过高，HPA 可能永远不会触发扩容
- **Ingress 与 Service 的 namePrefix 匹配**：Ingress 中引用的 Service 名称 `app` 会被 `namePrefix: "prod-"` 修改为 `prod-app`，确保 Ingress 中引用的名称与最终生成的 Service 名称一致
- **Spring Boot 的 Actuator 路径**：确保 livenessProbe 和 readinessProbe 的路径与 Spring Boot Actuator 的实际端点匹配（Spring Boot 2.3+ 使用 `/actuator/health/liveness` 和 `/actuator/health/readiness`）

### 4.5.6 本章小结

通过 Spring Boot 应用的完整示例，展示了 Kustomize 从 base 到 overlay 的完整配置流程。base 层定义了应用的通用骨架（Deployment、Service、HPA、ConfigMap），dev 和 prod overlay 分别覆盖环境特定的配置。这种模式将环境差异收敛到 overlay 层，使得基础配置的变更可以自动传播到所有环境，同时每个环境仍保留独立的定制能力。结合 Argo CD 的 GitOps 工作流，实现了从代码提交到生产部署的全自动化。

---

## 4.6 Kustomize 使用中的潜在风险与最佳实践

### 4.6.1 解决的问题

Kustomize 虽然降低了配置管理的复杂度，但在大规模使用中仍会遇到各种问题。本节系统梳理常见风险，并提供经过验证的应对策略。

### 4.6.2 核心原理

Kustomize 的风险主要来自三个方面：

1. **补丁系统的语义复杂性**：Strategic Merge Patch 和 JSON Patch 的合并规则并非直观，误用导致配置与预期不符
2. **配置规模的增长**：随着环境数量和资源类型的增加，overlay 结构可能变得难以维护
3. **版本与生态兼容性**：Kustomize 版本演进、与 Argo CD 的版本匹配、与 CRD 的交互

### 4.6.3 风险详解与应对

#### 风险一：补丁冲突

**问题描述**：多个补丁修改同一字段时，后应用的覆盖先应用的，且 Kustomize 不会发出警告。例如：

```yaml
# patch-1.yaml — 设置副本数为 3
patchesStrategicMerge:
  - |-
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: app
    spec:
      replicas: 3

# patch-2.yaml — 设置副本数为 5（覆盖了 patch-1）
patchesStrategicMerge:
  - |-
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: app
    spec:
      replicas: 5
```

**应对策略**：

- 每个补丁文件只修改一个关注点（单一职责原则）
- 使用 `kustomize build` 输出进行人工审查
- 在 CI 中对比不同 overlay 的构建输出，确保差异符合预期
- 对于关键字段（如副本数），使用 `patchesJson6902` 的 `test` 操作进行断言

#### 风险二：配置膨胀

**问题描述**：当环境数量超过 5 个时，overlay 目录结构变得臃肿：

```
overlays/
├── dev/
├── test/
├── staging/
├── prod/
├── prod-us-east/
├── prod-eu-west/
├── prod-ap-southeast/
├── dr/
└── feature-xxx/
```

**应对策略**：

- 使用 Kustomize Components（v4+）将正交维度拆分为可组合组件：

```yaml
# components/high-availability/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component

patchesStrategicMerge:
  - patch-replicas.yaml
  - patch-pdb.yaml
```

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

components:
  - ../../components/high-availability
  - ../../components/monitoring
```

- 使用 Kustomize 的 `helmCharts` 字段结合 Helm Chart 管理复杂依赖
- 考虑使用 Jsonnet 或 CUE 处理高度动态的配置逻辑

#### 风险三：Kustomize 版本兼容性

**问题描述**：不同版本的 Kustomize 在特性支持和行为上存在差异：

| Kustomize 版本 | 重要变更 | Argo CD 版本 |
|----------------|----------|-------------|
| v3.x | 基础功能，`patchesStrategicMerge` | v1.8-2.0 |
| v4.x | Components、`helmCharts`、`replicas` 字段 | v2.1-2.7 |
| v5.x | `patches` 替代 `patchesStrategicMerge`、`sortOptions` | v2.8+ |

**应对策略**：

- 在 `kustomization.yaml` 中显式声明 `apiVersion`，避免隐式版本行为
- 在 Argo CD Application 中指定 Kustomize 版本：

```yaml
spec:
  source:
    kustomize:
      version: v5.0.0
```

- 在 CI 中使用与 Argo CD 匹配的 Kustomize 版本进行构建验证
- 关注 Argo CD Release Notes 中的 Kustomize 版本变更

#### 风险四：Selector 污染

**问题描述**：`commonLabels` 会添加到所有资源中，包括 Service 的 `selector` 字段。如果 base 中的 Service selector 与 `commonLabels` 冲突，可能导致 Service 无法匹配 Pod：

```yaml
# base/service.yaml
spec:
  selector:
    app: my-app

# kustomization.yaml
commonLabels:
  app: my-app-override  # 覆盖了 selector！
```

**应对策略**：

- 避免在 `commonLabels` 中使用 Service selector 相关的标签
- 使用 `patchesJson6902` 精确控制 Service selector
- 在 CI 中验证 Service 的 selector 与 Pod 标签的匹配性

#### 风险五：ConfigMap/Secret 哈希后缀的副作用

**问题描述**：`configMapGenerator` 的哈希后缀导致 ConfigMap 名称变化，如果其他资源硬编码了 ConfigMap 名称，会导致引用断裂：

```yaml
# 错误：硬编码名称
env:
  - name: CONFIG
    valueFrom:
      configMapKeyRef:
        name: app-config  # 实际名称为 app-config-6c8b9f7d4k
        key: application.yml
```

**应对策略**：

- 始终通过 Deployment 的 `volumes[].configMap.name` 引用，Kustomize 会自动更新引用
- 避免在非 Kustomize 管理的资源中引用生成的 ConfigMap
- 如果必须固定名称，设置 `disableNameSuffixHash: true`

### 4.6.4 最佳实践总结

| 实践 | 说明 | 优先级 |
|------|------|--------|
| 单一职责补丁 | 每个补丁文件只修改一个关注点 | 高 |
| CI 构建验证 | 在 CI 中执行 `kustomize build` 并对比差异 | 高 |
| 显式声明 apiVersion | 在 kustomization.yaml 中声明版本 | 高 |
| 限制 overlay 深度 | 不超过 3 层嵌套 | 中 |
| 使用 Components | 正交配置使用 Components 而非多层 overlay | 中 |
| 版本锁定 | 在 Argo CD 中指定 Kustomize 版本 | 中 |
| 避免 commonLabels 污染 selector | 谨慎使用 commonLabels | 高 |
| 定期审计构建输出 | 审查 `kustomize build` 的完整输出 | 低 |

### 4.6.5 本章小结

Kustomize 是一个强大但并非没有陷阱的工具。补丁冲突、配置膨胀、版本兼容性、selector 污染和哈希后缀副作用是实践中最常见的五类问题。通过单一职责补丁、CI 构建验证、显式版本声明和谨慎使用 commonLabels 等最佳实践，可以有效规避这些风险。关键在于理解 Kustomize 的合并语义，并在团队中建立一致的配置规范。

---

## 4.7 本章总结

Kustomize 作为 Kubernetes 原生的配置管理工具，与 Argo CD 的结合构成了 GitOps 工作流的基石。本章从基础概念到实战应用，系统性地覆盖了以下核心内容：

1. **Kustomize 基础**：通过 `kustomization.yaml` 声明资源、标签、注解、名称前缀等，实现配置的声明式管理
2. **补丁机制**：`patchesStrategicMerge` 和 `patchesJson6902` 两种补丁策略，分别适用于不同粒度的配置覆盖
3. **环境配置管理**：base/overlay 目录结构实现多环境配置复用，ConfigMapGenerator 和 SecretGenerator 提供配置的自动哈希和滚动更新
4. **Argo CD 集成**：Application 的 `kustomize` 字段实现参数动态覆盖，`kustomize.image` 支持 CI/CD 流水线的镜像版本注入
5. **Spring Boot 实战**：完整的端到端示例，涵盖 Deployment、Service、HPA、ConfigMap、Ingress 的多环境配置
6. **风险与最佳实践**：补丁冲突、配置膨胀、版本兼容性等常见问题的识别与应对

Kustomize 的核心哲学是"纯 YAML，无模板"。它不引入新的语法，而是利用 Kubernetes 原生的补丁能力实现配置的组合与覆盖。这种设计使得 Kustomize 的学习曲线平缓，但也意味着它在处理复杂条件逻辑时力不从心。在实际项目中，Kustomize 最适合管理中等复杂度的应用配置（5-20 个资源，3-8 个环境），对于更复杂的场景，可以考虑与 Helm 或 Jsonnet 结合使用。

在 Argo CD 的 GitOps 工作流中，Kustomize 的价值体现在三个方面：**可审计性**（所有配置变更都通过 Git PR 追踪）、**可复现性**（`kustomize build` 的输出是确定性的）、**可组合性**（base/overlay 模式支持灵活的配置复用）。掌握 Kustomize 与 Argo CD 的集成，是构建生产级 GitOps 平台的关键能力。
