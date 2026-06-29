# 第5章 在 Argo CD 中使用 Helm Charts

## 5.1 概述

Helm 是 Kubernetes 生态中最流行的包管理工具，而 Argo CD 是声明式 GitOps 持续交付引擎。将二者结合，既能利用 Helm 强大的模板化能力管理应用配置，又能通过 Argo CD 实现自动化、可审计的部署同步。本章从 Helm 基础结构出发，深入讲解如何在 Argo CD 中集成 Helm Chart，涵盖 Chart 仓库管理、多环境 values 覆盖、依赖管理、同步钩子映射等核心实践，并分析常见风险与应对策略。

---

## 5.2 Helm Chart 基础回顾

### 5.2.1 解决的问题

在 Kubernetes 中管理 YAML 清单面临几个痛点：大量重复的配置片段、环境差异导致的多份副本、缺乏版本管理和依赖管理。Helm Chart 通过模板化、参数化、打包和版本化解决了这些问题，让 Kubernetes 应用的交付变得可重复、可配置、可分享。

### 5.2.2 核心原理

一个标准的 Helm Chart 目录结构如下：

```
mychart/
├── Chart.yaml          # Chart 元数据：名称、版本、描述、依赖
├── values.yaml         # 默认配置值，模板中通过 .Values 引用
├── values.schema.json  # （可选）values.yaml 的 JSON Schema 校验
├── charts/             # 本地依赖子 Chart（手动放置或 helm dependency 下载）
├── crds/               # CRD 定义（Helm 3 特殊处理，不随模板渲染）
├── templates/          # Go 模板文件，渲染后生成 Kubernetes 资源
│   ├── NOTES.txt      # 安装后的使用说明
│   ├── _helpers.tpl   # 可复用的命名模板（define 定义）
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── hpa.yaml
└── .helmignore         # 打包时忽略的文件模式
```

**Chart.yaml 示例：**

```yaml
apiVersion: v2
name: myapp
description: A microservice application chart
type: application
version: 1.2.3
appVersion: 2.5.0
dependencies:
  - name: redis
    version: ">=17.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
  - name: common
    version: "2.x"
    repository: "oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts"
```

**Helm 内置对象**是模板引擎的核心数据来源：

| 对象 | 来源 | 典型用途 |
|---|---|---|
| `.Release.Name` | `helm install --name` | 资源命名、标签 |
| `.Release.Namespace` | 安装目标命名空间 | 跨命名空间引用 |
| `.Release.Service` | 固定为 `"Helm"` | 条件判断 |
| `.Release.Revision` | 递增的发布版本号 | 滚动更新策略 |
| `.Values` | `values.yaml` + 用户覆盖 | 所有可配置参数 |
| `.Chart` | `Chart.yaml` | 版本信息、描述 |
| `.Files` | Chart 内文件 | 注入配置文件 |
| `.Capabilities` | 集群 K8s 版本 | 条件性 API 版本 |
| `.Template.Name` | 当前模板文件路径 | 调试 |

**模板函数与管道：**

Helm 使用 Go 模板语法，并扩展了 60+ 模板函数（来自 Sprig 库）。管道（pipeline）是模板的核心数据流机制：

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "mychart.fullname" . }}
  labels:
    app.kubernetes.io/name: {{ include "mychart.name" . }}
    app.kubernetes.io/instance: {{ .Release.Name }}
    app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
    app.kubernetes.io/managed-by: {{ .Release.Service }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ include "mychart.name" . }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ include "mychart.name" . }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          env:
            {{- range $key, $val := .Values.env }}
            - name: {{ $key }}
              value: {{ $val | quote }}
            {{- end }}
          ports:
            - containerPort: {{ .Values.service.port }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

**`_helpers.tpl` 中的命名模板：**

```yaml
{{- define "mychart.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "mychart.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}
```

**依赖管理：**

`helm dependency update` 命令解析 `Chart.yaml` 中的 `dependencies`，下载 Chart 包到 `charts/` 目录并生成 `Chart.lock` 锁定文件：

```yaml
# Chart.lock
dependencies:
- name: redis
  repository: https://charts.bitnami.com/bitnami
  version: 17.3.7
- name: common
  repository: oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts
  version: 2.14.1
digest: sha256:abc123def456...
generated: "2025-06-27T10:00:00Z"
```

`Chart.lock` 应提交到 Git 仓库，确保所有环境使用完全相同的依赖版本，实现可重现的部署。

### 5.2.3 代码/配置实现

**values.yaml 示例：**

```yaml
# 全局配置
global:
  environment: production
  region: us-east-1

# 副本数
replicaCount: 2

# 镜像配置
image:
  repository: myapp
  tag: ""
  pullPolicy: IfNotPresent

# 环境变量
env:
  LOG_LEVEL: info
  DB_HOST: postgres.default.svc.cluster.local

# 服务配置
service:
  type: ClusterIP
  port: 8080
  targetPort: 8080

# 资源限制
resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

# 自动扩缩
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

# 探针
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 15

readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10

# 子 Chart 控制
redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: false
  master:
    persistence:
      enabled: false
```

### 5.2.4 使用场景

- **标准化应用交付**：团队统一使用 Helm Chart 定义微服务，减少 YAML 手写错误
- **多环境部署**：同一 Chart 配合不同 values 文件实现 dev/staging/prod 差异化配置
- **依赖管理**：通过 Chart 依赖自动安装中间件（Redis、PostgreSQL 等）
- **版本回滚**：Helm 内置 release 版本管理，支持一键回滚

### 5.2.5 潜在风险与注意事项

- **模板调试困难**：使用 `helm template --debug` 或 `helm install --dry-run --debug` 预览渲染结果
- **values 层级过深**：避免超过 3 层嵌套，使用 `--flat` 风格或全局变量简化
- **命名模板冲突**：不同 Chart 的 `_helpers.tpl` 中同名 `define` 会冲突，建议使用 Chart 名前缀
- **依赖版本范围**：`>=17.0.0` 可能引入破坏性变更，建议锁定精确版本

### 5.2.6 本章小结

Helm Chart 通过标准化的目录结构、Go 模板引擎和依赖管理机制，为 Kubernetes 应用提供了可打包、可版本化、可配置的交付单元。理解 Chart.yaml、values.yaml、模板函数和内置对象是后续在 Argo CD 中使用 Helm 的基础。

---

## 5.3 Argo CD 与 Helm 集成

### 5.3.1 解决的问题

在 GitOps 工作流中，Helm 的 `helm install` / `helm upgrade` 命令需要手动执行或由 CI 触发，缺乏持续同步和自动修复能力。Argo CD 作为 GitOps 控制器，可以持续监控 Git 仓库中的 Helm Chart 变更，自动将集群状态同步到 Git 中定义的期望状态，同时保留 Helm 的模板化能力。

### 5.3.2 核心原理

Argo CD 内置了 Helm 渲染引擎。当 Application 的 `source.helm` 字段被配置时，Argo CD 会在服务端执行 `helm template`（而非 `helm install`），将渲染后的 Kubernetes 资源清单与集群当前状态进行 diff，然后通过 `kubectl apply` 同步。

关键区别：Argo CD **不**使用 Helm 的 release 存储（Secret 中的 release 记录），而是完全由 Argo CD 管理应用生命周期。这意味着 `helm rollback` 等命令在 Argo CD 管理的应用上不适用——回滚应通过 Git revert 或 Argo CD Application 的 `syncPolicy` 回退实现。

**Argo CD Application 配置 Helm 的完整结构：**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/gitops-repo.git
    targetRevision: main
    path: charts/myapp
    # Helm 特定配置
    helm:
      # 指定 values 文件（相对于 source.path）
      valueFiles:
        - values.yaml
        - values-production.yaml
        - values-global.yaml

      # 参数覆盖（等价于 --set）
      parameters:
        - name: replicaCount
          value: "5"
        - name: image.tag
          value: "2.5.0"
        - name: redis.enabled
          value: "false"

      # values 对象覆盖（等价于 --set-json）
      values: |
        resources:
          limits:
            cpu: 2
            memory: 2Gi
        autoscaling:
          maxReplicas: 20

      # 忽略缺失 values 文件
      ignoreMissingValueFiles: false

      # 跳过 Helm 模板校验
      skipSchemaValidation: false

      # Release 名称（默认使用 Application 名称）
      releaseName: myapp-prod

      # 文件参数（从仓库中读取文件内容作为 values）
      fileParameters:
        - name: config.content
          path: config/app-config.json

  destination:
    server: https://kubernetes.default.svc
    namespace: production

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
      - RespectIgnoreDifferences=true
```

### 5.3.3 代码/配置实现

**多 values 文件覆盖策略：**

Argo CD 按照 `valueFiles` 列表顺序合并 values，后列出的文件优先级更高：

```yaml
spec:
  source:
    helm:
      valueFiles:
        - values.yaml              # 基础值（优先级最低）
        - values-common.yaml       # 通用覆盖
        - values-production.yaml   # 环境特定覆盖（优先级最高）
```

合并后，`parameters` 中指定的值会覆盖 `valueFiles` 中的同名键。`values` 内联块优先级最高。

**参数覆盖的三种方式对比：**

| 方式 | 配置位置 | 优先级 | 适用场景 |
|---|---|---|---|
| `valueFiles` | 仓库内文件 | 低 | 环境基线配置 |
| `parameters` | Application YAML | 中 | 少量参数微调 |
| `values` 内联 | Application YAML | 高 | 临时覆盖、敏感值（配合 sealed-secrets） |

**Helm Hooks 与 Argo CD Sync Hooks 的映射：**

Helm 通过 annotation 定义 hook，Argo CD 在同步过程中识别这些 annotation 并映射到自身的同步阶段：

| Helm Hook Annotation | Argo CD 同步阶段 | 行为 |
|---|---|---|
| `helm.sh/hook: pre-install` | PreSync | 在资源同步前执行 |
| `helm.sh/hook: post-install` | PostSync | 在资源同步成功后执行 |
| `helm.sh/hook: pre-delete` | 不支持 | Argo CD 不处理删除钩子 |
| `helm.sh/hook: pre-upgrade` | PreSync | 升级前执行 |
| `helm.sh/hook: post-upgrade` | PostSync | 升级后执行 |
| `helm.sh/hook: test` | 不支持 | 使用 Argo CD 的测试功能替代 |
| `helm.sh/hook-weight` | 无直接对应 | 通过 Argo CD 的 `sync-wave` annotation 替代 |

**Argo CD 推荐的同步波次（sync-wave）方式：**

```yaml
# 优先执行：数据库迁移 Job
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  annotations:
    argocd.argoproj.io/sync-wave: "-5"
    argocd.argoproj.io/hook: PreSync
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: myapp:2.5.0
          command: ["rake", "db:migrate"]
      restartPolicy: Never
  backoffLimit: 2
```

```yaml
# 后执行：应用部署
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  annotations:
    argocd.argoproj.io/sync-wave: "0"
spec:
  replicas: 3
  template:
    ...
```

```yaml
# 最后执行：SLA 检查
apiVersion: batch/v1
kind: Job
metadata:
  name: smoke-test
  annotations:
    argocd.argoproj.io/sync-wave: "5"
    argocd.argoproj.io/hook: PostSync
spec:
  template:
    spec:
      containers:
        - name: test
          image: curlimages/curl
          command: ["curl", "-f", "http://myapp:8080/healthz"]
      restartPolicy: Never
```

### 5.3.4 使用场景

- **Git 作为 Helm values 单一来源**：所有 values 文件存储在 Git 仓库，Argo CD 自动同步
- **环境差异化配置**：同一 Chart 通过不同 valueFiles 和 parameters 部署到 dev/staging/prod
- **数据库迁移自动化**：利用 PreSync hook 在应用更新前自动执行迁移 Job
- **金丝雀发布**：结合 Argo Rollouts 和 Helm values 中的 canary 配置实现渐进式发布

### 5.3.5 潜在风险与注意事项

- **Helm release 状态不一致**：Argo CD 不维护 Helm release 记录，`helm list` 看不到 Argo CD 部署的应用。如需迁移，使用 `argocd app get <app> --helm` 或手动创建 release 记录
- **Hook 权重冲突**：Helm 的 `hook-weight` 和 Argo CD 的 `sync-wave` 同时存在时可能导致执行顺序混乱，建议统一使用 Argo CD annotation
- **values 覆盖顺序**：`valueFiles` → `parameters` → `values` 的优先级容易混淆，建议在 Application 注释中明确标注覆盖策略
- **`helm.sh/hook: test` 不兼容**：Helm test hook 在 Argo CD 中不生效，应使用 Argo CD 的 `argocd app test` 命令

### 5.3.6 本章小结

Argo CD 通过服务端 Helm 模板渲染，将 Helm 的参数化能力与 GitOps 的持续同步机制无缝结合。通过 `valueFiles`、`parameters` 和 `values` 三种覆盖方式，以及 sync-wave 和 hook 映射机制，可以实现高度灵活且自动化的部署流程。理解 Helm 与 Argo CD 在 release 管理上的差异是避免生产事故的关键。

---

## 5.4 Chart 仓库管理

### 5.4.1 解决的问题

当 Helm Chart 数量增长到数十甚至上百个时，直接引用 Git 仓库路径管理 Chart 变得低效。Chart 仓库（Helm Repository）提供了 Chart 的索引、分发和版本管理能力。在 Argo CD 中配置 Chart 仓库，可以让 Application 直接引用仓库中的 Chart，而无需在 Git 中维护 Chart 源代码。

### 5.4.2 核心原理

**OCI  Registry 作为 Helm 仓库：**

从 Helm 3.8.0 开始，Helm 原生支持 OCI（Open Container Initiative）Registry 作为 Chart 存储后端。这意味着可以使用 Harbor、Amazon ECR、Azure ACR、Google Artifact Registry 等容器镜像仓库来存储和分发 Helm Chart。

OCI 仓库的 Chart 存储结构：

```
oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts
├── myapp
│   ├── 1.0.0
│   ├── 1.1.0
│   └── 2.0.0
├── common
│   ├── 1.0.0
│   └── 2.0.0
└── redis
    └── 17.3.7
```

**ChartMuseum：**

ChartMuseum 是一个开源的 Helm Chart 仓库服务器，支持多种存储后端（本地文件系统、Amazon S3、Google GCS、阿里云 OSS 等）。它提供 REST API 用于 Chart 的上传、搜索和下载。

**认证机制：**

Argo CD 通过 `repository.credentials` 或 `argocd repo add` 命令管理 Chart 仓库的认证信息，支持：

- HTTP 基本认证（用户名/密码）
- TLS 客户端证书
- SSH 密钥
- AWS IAM（用于 ECR）
- OAuth2 token

### 5.4.3 代码/配置实现

**在 Argo CD 中添加 OCI 仓库（ECR）：**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: repo-ecr-helm
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: helm
  name: ecr-helm
  url: oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts
  enableOCI: "true"
  # AWS IAM 方式（推荐）：为 Argo CD 服务账户附加 IAM 策略
  # 或使用 access key:
  username: AWS
  password: <aws-ecr-authorization-token>
```

**IAM 策略（ECR 访问）：**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:DescribeRepositories",
        "ecr:ListImages"
      ],
      "Resource": "*"
    }
  ]
}
```

**使用 OCI Chart 的 Application：**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-from-oci
  namespace: argocd
spec:
  project: default
  source:
    # 使用 OCI 仓库中的 Chart，而非 Git 路径
    repoURL: oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts
    chart: myapp
    targetRevision: 2.0.0
    helm:
      releaseName: myapp-prod
      values: |
        replicaCount: 3
        image:
          tag: "2.5.0"
  destination:
    server: https://kubernetes.default.svc
    namespace: production
```

**使用 ChartMuseum 的 Application：**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: repo-chartmuseum
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: helm
  name: chartmuseum
  url: https://chartmuseum.company.com
  username: readonly
  password: ${CHARTMUSEUM_READONLY_TOKEN}
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-from-chartmuseum
spec:
  source:
    repoURL: https://chartmuseum.company.com
    chart: myapp
    targetRevision: 2.0.0
    helm:
      values: |
        replicaCount: 3
```

**通过 Argo CD CLI 添加仓库：**

```bash
# 添加标准 Helm 仓库
argocd repo add https://charts.bitnami.com/bitnami --type helm --name bitnami

# 添加 OCI 仓库（ECR）
argocd repo add oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts \
  --type helm --name ecr-helm --enable-oci

# 添加需要认证的 ChartMuseum
argocd repo add https://chartmuseum.company.com \
  --type helm --name company-charts \
  --username-readonly --password $TOKEN
```

**推送 Chart 到 OCI 仓库（CI 流程）：**

```bash
# 登录 ECR
aws ecr get-login-password --region us-east-1 | \
  helm registry login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-east-1.amazonaws.com

# 打包 Chart
helm package charts/myapp --version 2.0.0

# 推送
helm push myapp-2.0.0.tgz \
  oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts
```

### 5.4.4 使用场景

- **企业级 Chart 分发**：通过 ECR 或 Harbor 存储经过审批的 Chart，团队直接引用
- **多集群共享 Chart**：一个 OCI 仓库服务多个 Argo CD 实例，确保 Chart 版本一致
- **CI/CD 集成**：CI 流水线构建 Chart 后自动推送到仓库，Argo CD 检测新版本后自动同步
- **第三方 Chart 代理**：使用 ChartMuseum 代理 Bitnami、官方 Stable 等上游仓库，添加安全扫描和安全策略

### 5.4.5 潜在风险与注意事项

- **OCI 仓库认证过期**：ECR token 有效期 12 小时，需配置 Argo CD 自动刷新（使用 IRSA 或 `argocd repo add` 的 `--upsert` 定期更新）
- **Chart 签名验证**：OCI 仓库不强制 Chart 签名，建议在 CI 中使用 `helm sign` 并在 Argo CD 中配置 `--verify`
- **仓库可用性**：Chart 仓库不可用将导致 Argo CD 无法同步，建议配置多个 mirror 仓库
- **Helm 版本兼容性**：OCI 功能需要 Helm 3.8.0+，Argo CD v2.4.0+ 才完整支持 OCI

### 5.4.6 本章小结

Chart 仓库（尤其是 OCI Registry）是 Helm Chart 分发和版本管理的核心基础设施。Argo CD 支持直接引用 OCI 仓库和 ChartMuseum 中的 Chart，配合 IAM 或 token 认证实现安全的自动化部署。将 CI 构建的 Chart 推送到 OCI 仓库，再由 Argo CD 同步到集群，是生产环境推荐的 GitOps 工作流。

---

## 5.5 实战：微服务 Helm Chart 完整示例

### 5.5.1 解决的问题

本节通过一个完整的微服务 Helm Chart 示例，展示如何在实际项目中组织 Chart 结构、管理多环境 values、处理 Chart 依赖，以及如何在 Argo CD 中配置完整的 GitOps 部署流水线。

### 5.5.2 核心原理

微服务 Chart 的设计原则：

1. **单一职责**：每个微服务一个 Chart，不混入其他服务配置
2. **可组合性**：通过 values 控制所有可变行为，不修改模板
3. **环境抽象**：values 文件按环境分层，公共配置与特定配置分离
4. **依赖隔离**：中间件（Redis、PostgreSQL）作为子 Chart 或外部依赖，不内嵌到业务 Chart
5. **安全默认值**：values.yaml 提供生产安全的默认值，环境覆盖仅修改必要参数

### 5.5.3 代码/配置实现

**完整 Chart 结构：**

```
charts/
└── user-service/
    ├── Chart.yaml
    ├── values.yaml
    ├── values-dev.yaml
    ├── values-staging.yaml
    ├── values-production.yaml
    ├── charts/
    │   └── common-0.1.0.tgz    # 本地依赖（helm dependency build 生成）
    ├── templates/
    │   ├── _helpers.tpl
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   ├── ingress.yaml
    │   ├── serviceaccount.yaml
    │   ├── configmap.yaml
    │   ├── secret.yaml
    │   ├── hpa.yaml
    │   ├── pdb.yaml
    │   ├── servicemonitor.yaml
    │   ├── pre-sync-job.yaml
    │   └── post-sync-job.yaml
    └── tests/
        └── test-connection.yaml
```

**Chart.yaml：**

```yaml
apiVersion: v2
name: user-service
description: User management microservice
type: application
version: 1.5.2
appVersion: 2.3.1
kubeVersion: ">=1.24.0-0"
home: https://github.com/company/user-service
sources:
  - https://github.com/company/user-service
maintainers:
  - name: Platform Team
    email: platform@company.com
dependencies:
  - name: common
    version: 0.1.0
    repository: file://charts/common
  - name: redis
    version: "18.x"
    repository: oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts
    condition: redis.enabled
    tags:
      - cache
  - name: postgresql
    version: "14.x"
    repository: oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/helm-charts
    condition: postgresql.enabled
    tags:
      - database
```

**values.yaml（基础默认值）：**

```yaml
# --- 全局配置 ---
global:
  environment: production
  region: us-east-1
  dnsDomain: company.com

# --- 副本与扩缩 ---
replicaCount: 2
minReadySeconds: 10
revisionHistoryLimit: 3

strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0

# --- 镜像 ---
image:
  repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/user-service
  tag: ""
  pullPolicy: IfNotPresent
  pullSecrets:
    - name: ecr-regcred

# --- 服务 ---
service:
  type: ClusterIP
  port: 8080
  targetPort: http
  protocol: TCP
  annotations: {}

# --- 网络 ---
ingress:
  enabled: false
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: user-service.company.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: user-service-tls
      hosts:
        - user-service.company.com

# --- 应用配置 ---
config:
  logLevel: info
  logFormat: json
  db:
    host: ""
    port: 5432
    name: users
    sslMode: require
  redis:
    host: ""
    port: 6379
  jwt:
    secretName: jwt-secret
    expirationHours: 24
  rateLimit:
    enabled: true
    requestsPerSecond: 100
    burstSize: 200

# --- 环境变量（从 ConfigMap 和 Secret 注入）---
env:
  - name: JAVA_OPTS
    value: "-Xms512m -Xmx1024m -XX:+UseG1GC"
  - name: SPRING_PROFILES_ACTIVE
    valueFrom:
      configMapKeyRef:
        name: user-service-config
        key: spring.profiles.active

envFrom:
  - configMapRef:
      name: user-service-config
  - secretRef:
      name: user-service-secret

# --- 资源 ---
resources:
  limits:
    cpu: 1
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

# --- 探针 ---
probes:
  liveness:
    httpGet:
      path: /actuator/health/liveness
      port: 8081
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3
  readiness:
    httpGet:
      path: /actuator/health/readiness
      port: 8081
    initialDelaySeconds: 20
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 2
  startup:
    httpGet:
      path: /actuator/health/readiness
      port: 8081
    initialDelaySeconds: 5
    periodSeconds: 5
    failureThreshold: 30

# --- 自动扩缩 ---
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 20
  targetCPUUtilizationPercentage: 75
  targetMemoryUtilizationPercentage: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60

# --- 安全 ---
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault

containerSecurityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL

serviceAccount:
  create: true
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/user-service-sa
  name: ""

# --- 网络策略 ---
networkPolicy:
  enabled: true
  ingressRules:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: istio-system
        - podSelector:
            matchLabels:
              app: user-service
      ports:
        - port: 8080

# --- 可观测性 ---
serviceMonitor:
  enabled: true
  interval: 30s
  scrapeTimeout: 10s
  path: /actuator/prometheus
  port: 8081

# --- 中断预算 ---
podDisruptionBudget:
  enabled: true
  minAvailable: 1

# --- 数据库迁移 ---
migration:
  enabled: true
  image:
    repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/user-service-migration
    tag: "2.3.1"
  command: ["flyway", "migrate"]
  backoffLimit: 2
  ttlSecondsAfterFinished: 86400

# --- 子 Chart 控制 ---
redis:
  enabled: false
  architecture: replication
  auth:
    enabled: true
    sentinel: true
  master:
    persistence:
      size: 10Gi
  replica:
    replicaCount: 2
    persistence:
      size: 10Gi

postgresql:
  enabled: false
  architecture: replication
  auth:
    database: users
    username: user_svc
    existingSecret: postgres-user-service
  primary:
    persistence:
      size: 50Gi
  readReplicas:
    replicaCount: 1
    persistence:
      size: 50Gi
```

**values-dev.yaml：**

```yaml
global:
  environment: development

replicaCount: 1

image:
  tag: "develop-latest"
  pullPolicy: Always

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

autoscaling:
  enabled: false

config:
  logLevel: debug
  db:
    sslMode: disable
  rateLimit:
    enabled: false

ingress:
  enabled: true
  hosts:
    - host: user-service-dev.company.com
  tls:
    - secretName: user-service-dev-tls
      hosts:
        - user-service-dev.company.com

redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: false
  master:
    persistence:
      enabled: false

postgresql:
  enabled: true
  architecture: standalone
  auth:
    database: users
    username: user_svc
    password: dev-password
  primary:
    persistence:
      enabled: false

serviceMonitor:
  enabled: false

podDisruptionBudget:
  enabled: false

migration:
  enabled: true
  backoffLimit: 1
```

**values-staging.yaml：**

```yaml
global:
  environment: staging

replicaCount: 2

image:
  tag: "staging-latest"

resources:
  limits:
    cpu: 1
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 6

config:
  logLevel: debug
  rateLimit:
    requestsPerSecond: 50

ingress:
  enabled: true
  hosts:
    - host: user-service-staging.company.com
  tls:
    - secretName: user-service-staging-tls
      hosts:
        - user-service-staging.company.com

redis:
  enabled: true
  architecture: replication
  auth:
    enabled: true
    sentinel: false
  master:
    persistence:
      size: 5Gi
  replica:
    replicaCount: 1
    persistence:
      size: 5Gi

postgresql:
  enabled: true
  architecture: replication
  auth:
    database: users
    username: user_svc
    existingSecret: postgres-user-service-staging
  primary:
    persistence:
      size: 20Gi
  readReplicas:
    replicaCount: 1
    persistence:
      size: 20Gi

migration:
  enabled: true
```

**values-production.yaml：**

```yaml
global:
  environment: production

replicaCount: 4

image:
  tag: "2.3.1"

resources:
  limits:
    cpu: 2
    memory: 2Gi
  requests:
    cpu: 1
    memory: 1Gi

autoscaling:
  enabled: true
  minReplicas: 4
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 75

config:
  logLevel: info
  rateLimit:
    requestsPerSecond: 200
    burstSize: 400

ingress:
  enabled: true
  hosts:
    - host: user-service.company.com
  tls:
    - secretName: user-service-tls
      hosts:
        - user-service.company.com

redis:
  enabled: true
  architecture: replication
  auth:
    enabled: true
    sentinel: true
  master:
    persistence:
      size: 20Gi
  replica:
    replicaCount: 3
    persistence:
      size: 20Gi

postgresql:
  enabled: true
  architecture: replication
  auth:
    database: users
    username: user_svc
    existingSecret: postgres-user-service
  primary:
    persistence:
      size: 100Gi
  readReplicas:
    replicaCount: 2
    persistence:
      size: 100Gi

podDisruptionBudget:
  enabled: true
  minAvailable: 2

migration:
  enabled: true
  backoffLimit: 3
```

**templates/deployment.yaml：**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "user-service.fullname" . }}
  labels:
    {{- include "user-service.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  revisionHistoryLimit: {{ .Values.revisionHistoryLimit }}
  minReadySeconds: {{ .Values.minReadySeconds }}
  strategy:
    {{- toYaml .Values.strategy | nindent 4 }}
  selector:
    matchLabels:
      {{- include "user-service.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "user-service.labels" . | nindent 8 }}
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "user-service.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          env:
            {{- toYaml .Values.env | nindent 12 }}
          envFrom:
            {{- toYaml .Values.envFrom | nindent 12 }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          livenessProbe:
            {{- toYaml .Values.probes.liveness | nindent 12 }}
          readinessProbe:
            {{- toYaml .Values.probes.readiness | nindent 12 }}
          startupProbe:
            {{- toYaml .Values.probes.startup | nindent 12 }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          securityContext:
            {{- toYaml .Values.containerSecurityContext | nindent 12 }}
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

**templates/pre-sync-job.yaml（数据库迁移）：**

```yaml
{{- if .Values.migration.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "user-service.fullname" . }}-migration
  annotations:
    argocd.argoproj.io/sync-wave: "-5"
    argocd.argoproj.io/hook: PreSync
spec:
  template:
    spec:
      serviceAccountName: {{ include "user-service.serviceAccountName" . }}
      restartPolicy: Never
      containers:
        - name: migration
          image: "{{ .Values.migration.image.repository }}:{{ .Values.migration.image.tag | default .Values.image.tag | default .Chart.AppVersion }}"
          command: {{ toJson .Values.migration.command }}
          env:
            - name: DB_HOST
              value: {{ .Values.config.db.host | default (printf "%s-postgresql.%s.svc.cluster.local" (include "user-service.fullname" .) .Release.Namespace) }}
            - name: DB_PORT
              value: {{ .Values.config.db.port | quote }}
            - name: DB_NAME
              value: {{ .Values.config.db.name }}
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.postgresql.auth.existingSecret | default (printf "%s-postgresql" (include "user-service.fullname" .)) }}
                  key: username
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.postgresql.auth.existingSecret | default (printf "%s-postgresql" (include "user-service.fullname" .)) }}
                  key: password
      backoffLimit: {{ .Values.migration.backoffLimit }}
      ttlSecondsAfterFinished: {{ .Values.migration.ttlSecondsAfterFinished }}
{{- end }}
```

**templates/servicemonitor.yaml：**

```yaml
{{- if .Values.serviceMonitor.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "user-service.fullname" . }}
  labels:
    {{- include "user-service.labels" . | nindent 4 }}
    release: prometheus
spec:
  selector:
    matchLabels:
      {{- include "user-service.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: {{ .Values.serviceMonitor.port | quote }}
      interval: {{ .Values.serviceMonitor.interval }}
      scrapeTimeout: {{ .Values.serviceMonitor.scrapeTimeout }}
      path: {{ .Values.serviceMonitor.path }}
  namespaceSelector:
    matchNames:
      - {{ .Release.Namespace }}
{{- end }}
```

**Argo CD Application 配置（生产环境）：**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: user-service-production
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: production
  source:
    repoURL: https://github.com/company/gitops-repo.git
    targetRevision: main
    path: charts/user-service
    helm:
      valueFiles:
        - values.yaml
        - values-production.yaml
      releaseName: user-service
      parameters:
        - name: image.tag
          value: "2.3.1"
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
      - RespectIgnoreDifferences=true
      - PruneLast=true
    retry:
      limit: 3
      backoff:
        duration: 30s
        factor: 2
        maxDuration: 5m
```

**Argo CD Application 配置（开发环境）：**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: user-service-development
  namespace: argocd
spec:
  project: development
  source:
    repoURL: https://github.com/company/gitops-repo.git
    targetRevision: develop
    path: charts/user-service
    helm:
      valueFiles:
        - values.yaml
        - values-dev.yaml
      releaseName: user-service-dev
  destination:
    server: https://kubernetes.default.svc
    namespace: development
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 2
      backoff:
        duration: 15s
        factor: 2
        maxDuration: 2m
```

**ApplicationSet 批量生成多环境 Application：**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: user-service
  namespace: argocd
spec:
  generators:
    - matrix:
        generators:
          - git:
              repoURL: https://github.com/company/gitops-repo.git
              revision: HEAD
              directories:
                - path: charts/user-service
          - list:
              elements:
                - environment: development
                  valuesFile: values-dev.yaml
                  namespace: development
                  targetRevision: develop
                  cluster: https://kubernetes.default.svc
                - environment: staging
                  valuesFile: values-staging.yaml
                  namespace: staging
                  targetRevision: main
                  cluster: https://kubernetes.default.svc
                - environment: production
                  valuesFile: values-production.yaml
                  namespace: production
                  targetRevision: main
                  cluster: https://kubernetes.default.svc
  template:
    metadata:
      name: "user-service-{{.environment}}"
      namespace: argocd
    spec:
      project: "{{.environment}}"
      source:
        repoURL: https://github.com/company/gitops-repo.git
        targetRevision: "{{.targetRevision}}"
        path: charts/user-service
        helm:
          valueFiles:
            - values.yaml
            - "{{.valuesFile}}"
          releaseName: "user-service-{{.environment}}"
      destination:
        server: "{{.cluster}}"
        namespace: "{{.namespace}}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

### 5.5.4 使用场景

- **多环境 GitOps 部署**：开发、预发布、生产环境使用同一 Chart，通过不同 values 文件和 Git 分支隔离
- **数据库迁移自动化**：PreSync hook 在应用更新前自动执行 Flyway/Liquibase 迁移
- **可观测性集成**：ServiceMonitor 自动注册到 Prometheus Operator，无需手动配置
- **安全合规**：PodSecurityContext、NetworkPolicy、PodDisruptionBudget 默认启用，满足 SOC2 合规要求

### 5.5.5 潜在风险与注意事项

- **values 文件膨胀**：随着环境增多，values 文件数量线性增长。建议使用 `values-common.yaml` 提取公共配置，环境文件仅包含差异
- **依赖版本漂移**：`Chart.lock` 必须提交到 Git，否则不同环境可能拉取不同版本的子 Chart
- **迁移 Job 幂等性**：PreSync hook 的 Job 必须是幂等的，否则重复执行可能导致数据损坏。使用 `--check` 模式或 Flyway 的基线迁移
- **Secret 管理**：values 文件中不应包含明文密码。使用 External Secrets Operator、Sealed Secrets 或 AWS Secrets Manager 注入敏感信息

### 5.5.6 本章小结

通过完整的微服务 Helm Chart 示例，展示了从 Chart 结构设计、多环境 values 分层、子 Chart 依赖管理到 Argo CD Application 配置的全链路实践。ApplicationSet 进一步将多环境部署模板化，实现"一次定义，到处部署"的 GitOps 工作流。核心原则是：Chart 模板保持环境无关，values 文件承载环境差异，Argo CD 负责持续同步。

---

## 5.6 潜在风险与最佳实践

### 5.6.1 Helm 版本兼容性

**风险：** Argo CD 服务端使用内置的 Helm 库进行模板渲染，与客户端 `helm` 命令的版本可能存在差异。Helm 2 的 Tiller 架构已被废弃，Argo CD 仅支持 Helm 3。

**解决方案：**

```yaml
# 在 Application 中指定 Helm 版本（Argo CD v2.6+）
spec:
  source:
    helm:
      # 可选值：v3（默认）
      version: v3
```

- 确保 Argo CD 版本 >= 2.0.0（Helm 3 支持）
- 在 CI 中使用与 Argo CD 相同版本的 Helm 客户端进行 `helm template` 验证
- 避免使用 Helm 2 的 `--name` 模板语法（`$name` 在 Helm 3 中已废弃）

### 5.6.2 Values 覆盖顺序

**风险：** Argo CD 中 values 的覆盖顺序与原生 Helm 不完全一致，容易导致预期外的覆盖结果。

**覆盖优先级（从低到高）：**

```
1. values.yaml（Chart 内默认值）
2. valueFiles[0]（第一个外部 values 文件）
3. valueFiles[1]（后续 values 文件，后列出的优先级更高）
4. parameters（helm.parameters 列表）
5. values（内联 values 块，优先级最高）
```

**最佳实践：**

```yaml
spec:
  source:
    helm:
      # 1. 基础值（所有环境共享）
      valueFiles:
        - values.yaml
        # 2. 环境特定值
        - values-production.yaml
      # 3. 少量参数覆盖（仅用于 CI/CD 动态注入）
      parameters:
        - name: image.tag
          value: "2.5.0"
      # 4. 内联覆盖（仅用于紧急情况或敏感值）
      values: |
        replicaCount: 5
```

- 优先使用 `valueFiles`，将环境差异放在 Git 仓库中
- `parameters` 仅用于 CI/CD 动态注入的少量参数（如镜像 tag）
- `values` 内联块仅用于临时覆盖或敏感值（配合 Sealed Secrets）
- 在 Application 注释中记录覆盖策略

### 5.6.3 CRD 管理

**风险：** Helm 3 对 CRD 有特殊处理：`crds/` 目录中的 CRD 只在 `helm install` 时安装，`helm upgrade` 不会更新 CRD。Argo CD 使用 `helm template` 而非 `helm install`，因此 `crds/` 目录中的 CRD 不会被渲染。

**解决方案：**

方案一：将 CRD 放在独立 Application 中管理：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: crds
  namespace: argocd
spec:
  project: infrastructure
  source:
    repoURL: https://github.com/company/gitops-repo.git
    path: crds
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: false  # 绝不删除 CRD
      selfHeal: true
```

方案二：使用 PreSync hook 安装 CRD：

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: install-crds
  annotations:
    argocd.argoproj.io/sync-wave: "-10"
    argocd.argoproj.io/hook: PreSync
spec:
  template:
    spec:
      serviceAccountName: crd-installer
      restartPolicy: Never
      containers:
        - name: kubectl
          image: bitnami/kubectl:1.28
          command:
            - kubectl
            - apply
            - -f
            - https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml
```

方案三：使用 Argo CD 的 `SkipCRDs` 选项：

```yaml
spec:
  syncPolicy:
    syncOptions:
      - SkipCRDs=true  # 跳过 crds/ 目录
```

**推荐方案：** 将 CRD 作为独立 Application 管理，与业务 Application 分离。CRD Application 使用 `prune: false` 防止意外删除。

### 5.6.4 其他常见风险

| 风险 | 影响 | 解决方案 |
|---|---|---|
| `helm template` 与 `helm install` 行为差异 | Argo CD 不创建 Helm release，`helm list` 不可见 | 使用 Argo CD CLI 管理，不依赖 Helm release |
| values 中 YAML 缩进错误 | 模板渲染失败，同步阻塞 | 在 CI 中运行 `helm lint` 和 `helm template` 验证 |
| 子 Chart 版本未锁定 | 不同环境使用不同版本子 Chart | 提交 `Chart.lock` 到 Git |
| 大 Chart 渲染超时 | Argo CD 同步超时（默认 3 分钟） | 拆分 Chart，或增加 `syncPolicy.retry` 和 Argo CD `--timeout` 参数 |
| Secret 明文存储 | 敏感信息泄露 | 使用 Sealed Secrets、External Secrets 或 SOPS |

### 5.6.5 本章小结

在 Argo CD 中使用 Helm 时，需要特别注意 Helm 版本兼容性、values 覆盖顺序、CRD 管理策略以及 Argo CD 与 Helm 在 release 管理上的根本差异。通过遵循"CRD 独立管理、values 分层覆盖、Chart.lock 锁定依赖"等最佳实践，可以构建稳定、可审计的 GitOps 部署流水线。

---

## 5.7 总结

本章从 Helm Chart 的基础结构出发，深入讲解了在 Argo CD 中集成 Helm 的完整技术栈：

1. **Helm 基础**：Chart 目录结构、模板函数与管道、内置对象、依赖管理是理解后续内容的前提
2. **Argo CD + Helm 集成**：通过 `valueFiles`、`parameters`、`values` 三种覆盖方式实现灵活的参数化部署，sync-wave 和 hook 映射机制管理同步顺序
3. **Chart 仓库管理**：OCI Registry（ECR）和 ChartMuseum 是生产环境推荐的 Chart 分发方式，配合 IAM 认证实现安全自动化
4. **微服务实战**：完整的 Chart 结构、多环境 values 分层、子 Chart 依赖、PreSync hook 迁移 Job，以及 ApplicationSet 批量部署
5. **风险与最佳实践**：Helm 版本兼容性、values 覆盖顺序、CRD 管理是生产环境中最容易踩坑的三个领域

Helm + Argo CD 的组合，将 Helm 的模板化能力与 GitOps 的声明式持续同步相结合，是云原生微服务部署的事实标准。掌握本章内容，读者应能独立设计、实现和维护基于 Helm Chart 的 GitOps 部署流水线。
