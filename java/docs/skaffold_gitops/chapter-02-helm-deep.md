# 第2章 Helm 包管理深度解析

## 2.1 Helm Chart 结构

### 2.1.1 解决的问题

Kubernetes 原生资源管理面临三个核心痛点：**模板重复**——每个环境（开发、测试、生产）需要维护几乎相同的 YAML 文件，仅少量参数不同；**版本管理困难**——应用的多版本部署缺乏统一的打包和分发机制；**依赖关系缺失**——一个应用往往依赖数据库、缓存、消息队列等多个组件，缺乏声明式的依赖描述。Helm Chart 通过标准化的目录结构和模板引擎，将一组 Kubernetes 资源打包为可复用、可配置、可版本化的单元，从根本上解决了上述问题。

### 2.1.2 核心原理

一个标准 Helm Chart 的目录结构如下：

```
mychart/
├── Chart.yaml          # Chart 元数据（名称、版本、描述等）
├── values.yaml         # 默认配置值
├── values.schema.json  # （可选）values 的 JSON Schema 校验
├── templates/          # Go 模板文件目录
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── _helpers.tpl    # 命名模板（不直接生成资源）
│   ├── NOTES.txt       # 安装后的提示信息
│   └── tests/
│       └── test-connection.yaml
├── charts/             # 子 Chart 依赖（.tgz 或目录）
├── crds/               # CRD 定义（helm install 时优先安装）
└── .helmignore         # 打包时忽略的文件模式
```

**Chart.yaml** 是 Chart 的身份证，定义了名称、版本、API 版本、应用版本、描述、关键字、来源等元信息：

```yaml
apiVersion: v2
name: myapp
description: A comprehensive Helm chart for Kubernetes
type: application
version: 0.1.0
appVersion: "1.16.0"
kubeVersion: ">=1.19.0-0"
keywords:
  - web
  - microservice
home: https://example.com
sources:
  - https://github.com/example/mychart
maintainers:
  - name: Developer
    email: dev@example.com
dependencies:
  - name: redis
    version: ">=17.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
icon: https://example.com/icon.png
```

**values.yaml** 是 Chart 的默认配置中心，所有可配置参数在此声明默认值：

```yaml
replicaCount: 3

image:
  repository: nginx
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

ingress:
  enabled: true
  host: app.example.com
  tls:
    enabled: true
    secretName: app-tls

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 200m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: true
    password: ""
```

**templates/deployment.yaml** 是核心模板文件，使用 Go 模板语法引用 values 中的值：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "mychart.fullname" . }}
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "mychart.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "mychart.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          env:
            - name: REDIS_HOST
              value: "{{ .Release.Name }}-redis-master"
            - name: REDIS_PORT
              value: "6379"
```

**templates/_helpers.tpl** 定义可复用的命名模板，以 `define` 开头、`end` 结尾，不直接生成 Kubernetes 资源：

```yaml
{{- define "mychart.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "mychart.labels" -}}
helm.sh/chart: {{ include "mychart.fullname" . }}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "mychart.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

**templates/NOTES.txt** 在 `helm install` 或 `helm upgrade` 成功后自动打印，指导用户如何使用该 Chart：

```
Thank you for installing {{ .Chart.Name }} v{{ .Chart.Version }}.

Application URL:
  http://{{ .Values.ingress.host }}

Get the application status:
  kubectl get pods -l "app.kubernetes.io/instance={{ .Release.Name }}"

Get the application logs:
  kubectl logs -l "app.kubernetes.io/instance={{ .Release.Name }}"

To delete the release:
  helm uninstall {{ .Release.Name }}
```

### 2.1.3 代码/配置实现

创建 Chart 的两种方式：

```bash
# 方式一：使用 helm create 脚手架
helm create mychart

# 方式二：手动创建目录结构
mkdir -p mychart/{templates,charts,crds}
touch mychart/Chart.yaml mychart/values.yaml mychart/templates/_helpers.tpl
```

**内置对象**是模板引擎的核心上下文，每个模板文件都可以访问以下全局对象：

| 对象 | 说明 | 示例 |
|------|------|------|
| `.Values` | values.yaml 中的值 | `.Values.replicaCount` |
| `.Release` | Release 元信息 | `.Release.Name`, `.Release.Namespace` |
| `.Chart` | Chart.yaml 中的元数据 | `.Chart.Version`, `.Chart.AppVersion` |
| `.Files` | Chart 中的文件访问 | `{{ .Files.Get "config/app.conf" }}` |
| `.Capabilities` | Kubernetes 集群能力 | `.Capabilities.KubeVersion` |
| `.Template` | 当前模板信息 | `.Template.Name` |

### 2.1.4 使用场景

- **微服务标准化部署**：团队统一使用 Helm Chart 模板，每个微服务只需提供 values.yaml 即可完成部署
- **多环境管理**：同一 Chart 通过不同 values 文件（values-dev.yaml、values-staging.yaml、values-prod.yaml）管理多个环境
- **应用市场分发**：将 Chart 推送到 Helm Repo 或 OCI Registry，供其他团队或社区安装使用
- **CI/CD 集成**：在 GitOps 工作流（ArgoCD、Flux）中，Helm Chart 作为应用交付的标准单元

### 2.1.5 潜在风险与注意事项

- **Chart.yaml 中 `apiVersion: v1` 已废弃**：v1 不支持依赖管理，应始终使用 `apiVersion: v2`
- **`type: application` vs `type: library`**：library Chart 不生成资源，仅提供辅助函数供其他 Chart 引用
- **`.helmignore` 容易被忽略**：打包时可能带入敏感文件（如 `.env`、`*.pem`），应始终配置 `.helmignore`
- **模板文件命名冲突**：`templates/` 下所有非 `_` 开头的 `.yaml` 文件都会生成资源，`_helpers.tpl` 以下划线开头避免误生成

### 2.1.6 本章小结

Helm Chart 的目录结构是 Helm 生态的基石。`Chart.yaml` 提供元数据，`values.yaml` 提供默认配置，`templates/` 通过 Go 模板将配置渲染为 Kubernetes 资源，`_helpers.tpl` 实现模板复用，`charts/` 管理子 Chart 依赖，`crds/` 处理 CRD 生命周期。理解每个目录和文件的职责，是掌握 Helm 包管理的第一步。

---

## 2.2 模板函数与管道

### 2.2.1 解决的问题

Kubernetes YAML 是静态的，而实际部署需要动态处理：字符串需要转义、默认值需要兜底、缺失值需要报错、复杂结构需要序列化、条件逻辑需要分支控制。Go 模板引擎通过**函数**和**管道**机制，将静态 YAML 转化为可编程的模板语言。

### 2.2.2 核心原理

Helm 使用 Go 标准库 `text/template` 作为模板引擎，并扩展了 70+ 内置函数。模板语法核心要素：

- **`{{ }}`**：模板指令定界符
- **`{{-` 和 `-}}`**：去除前/后空白字符
- **`|`**：管道操作符，将左侧输出传递给右侧函数
- **`.`**：表示当前作用域上下文

### 2.2.3 代码/配置实现

#### 内置函数详解

```yaml
# quote —— 将值用双引号包裹
env:
  - name: MESSAGE
    value: {{ quote .Values.message }}
  # 等价于: value: "hello world"

# default —— 提供默认值（值必须为 nil 才生效，空字符串不会触发）
env:
  - name: LOG_LEVEL
    value: {{ .Values.logLevel | default "info" | quote }}

# required —— 值缺失时报错并终止渲染
env:
  - name: API_KEY
    value: {{ required "apiKey is required" .Values.apiKey }}

# toYaml —— 将对象序列化为 YAML 格式
spec:
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}

# fromYaml —— 将 YAML 字符串解析为对象
{{- $config := .Values.config | fromYaml }}

# toJson —— 将对象序列化为 JSON
annotations:
  config: {{ .Values.config | toJson | quote }}

# indent / nindent —— 缩进处理
# indent: 在每行前加 N 个空格
# nindent: 换行后在新行前加 N 个空格
{{- toYaml .Values.labels | nindent 4 }}

# upper / lower / title —— 大小写转换
name: {{ .Values.name | upper }}

# trim / trimSuffix / trimPrefix —— 字符串修剪
name: {{ .Values.name | trimSuffix "-" }}

# sha256sum —— 计算 SHA256 哈希
checksum/config: {{ .Values | toYaml | sha256sum }}

# lookup —— 运行时查询集群资源（仅在 helm template 时不可用）
{{- $svc := lookup "v1" "Service" .Release.Namespace "my-service" }}
```

#### 流程控制

**if/else 条件判断**：

```yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "mychart.fullname" . }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "mychart.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
{{- end }}
```

**with 作用域切换**：

```yaml
# 使用 with 将 .Values.service 设为当前作用域
# 在 with 块内，. 指向 .Values.service
{{- with .Values.service }}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "mychart.fullname" $ }}
  labels:
    {{- include "mychart.labels" $ | nindent 4 }}
spec:
  type: {{ .type }}
  ports:
    - port: {{ .port }}
      targetPort: {{ .targetPort }}
  selector:
    {{- include "mychart.selectorLabels" $ | nindent 4 }}
{{- end }}
```

**range 循环**：

```yaml
# 遍历数组
{{- range .Values.ingress.hosts }}
    - host: {{ . | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "mychart.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
{{- end }}

# 遍历字典
{{- range $key, $value := .Values.configMap.data }}
  {{ $key }}: {{ $value | quote }}
{{- end }}
```

#### 变量作用域

```yaml
# 在 with/range 中，. 被重定向，需要用 $ 访问根作用域
{{- with .Values.database }}
env:
  - name: DB_HOST
    value: {{ .host | quote }}       # . 指向 .Values.database
  - name: DB_PORT
    value: {{ .port | quote }}
  - name: DB_NAME
    value: {{ $.Values.global.dbName | quote }}  # $ 指向根作用域
{{- end }}

# 使用 $var 定义局部变量
{{- $fullName := include "mychart.fullname" . }}
{{- $labels := include "mychart.labels" . }}
metadata:
  name: {{ $fullName }}
  labels:
    {{- $labels | nindent 4 }}
```

#### 命名模板（define / template / include）

```yaml
# _helpers.tpl 中定义
{{- define "mychart.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

# 使用 template（不能用于管道，不支持缩进控制）
metadata:
  labels:
    {{- template "mychart.labels" . }}

# 使用 include（推荐，支持管道和缩进控制）
metadata:
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
```

### 2.2.4 使用场景

- **条件化资源创建**：通过 `if/else` 控制 HPA、Ingress、ServiceMonitor 等资源是否生成
- **动态配置注入**：使用 `range` 遍历 ConfigMap 数据、Ingress 域名列表、Sidecar 容器列表
- **安全值校验**：使用 `required` 确保敏感配置（API Key、数据库密码）必须提供
- **模板复用**：通过 `_helpers.tpl` 定义标签、名称、选择器等通用逻辑，避免模板重复

### 2.2.5 潜在风险与注意事项

- **`template` vs `include` 选择**：`template` 是原生 Go 指令，不能用于管道操作；`include` 是 Helm 扩展函数，返回字符串可参与管道链。始终优先使用 `include`
- **`with` 作用域陷阱**：`with` 块内 `.` 被重定向，容易忘记使用 `$` 访问根作用域
- **`default` 的 nil 语义**：`default` 仅在值为 `nil` 时生效，空字符串 `""` 和数字 `0` 不会触发默认值
- **`required` 的渲染时机**：`required` 在模板渲染阶段执行，而非 values 解析阶段
- **缩进控制**：`{{-` 和 `-}}` 的空白控制极易出错，建议使用 `nindent` 统一管理缩进

### 2.2.6 本章小结

Helm 模板函数和管道是 Chart 灵活性的核心。`quote`、`default`、`required` 处理值的安全使用，`toYaml` 序列化复杂结构，`if/else`、`with`、`range` 实现流程控制，`define/template/include` 实现模板复用。掌握这些工具，可以将静态 YAML 转化为高度可配置的部署模板。

---

## 2.3 依赖管理

### 2.3.1 解决的问题

现代应用很少是单体——Web 应用依赖 Redis 做缓存、PostgreSQL 做持久化、RabbitMQ 做消息队列。手动管理这些组件的安装顺序和配置传递非常繁琐。Helm 的依赖管理允许一个 Chart 声明式地引用其他 Chart，自动处理下载、安装和配置传递。

### 2.3.2 核心原理

Helm 依赖管理基于 `Chart.yaml` 中的 `dependencies` 字段。执行 `helm dependency update` 时，Helm 读取依赖声明，从指定仓库下载 Chart 包（.tgz）到 `charts/` 目录。安装父 Chart 时，子 Chart 会按依赖顺序依次安装。

### 2.3.3 代码/配置实现

#### 声明依赖

```yaml
# Chart.yaml
dependencies:
  - name: redis
    version: ">=17.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
    tags:
      - cache
    import-values:
      - child: redis.auth
        parent: global.redisAuth

  - name: postgresql
    version: ">=12.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
    tags:
      - database

  - name: local-chart
    version: ">=0.1.0"
    repository: "file://./charts/local-chart"
```

#### 依赖管理命令

```bash
# 更新依赖（下载到 charts/ 目录并生成 Chart.lock）
helm dependency update ./mychart

# 查看依赖树
helm dependency list ./mychart

# 构建依赖（仅从本地 charts/ 构建，不联网下载）
helm dependency build ./mychart
```

#### 子 Chart 的 values 覆盖

父 Chart 的 values.yaml 中，以子 Chart 名称作为顶层 key 传递配置：

```yaml
# 父 Chart 的 values.yaml
redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: true
    password: "my-redis-password"
  master:
    persistence:
      size: 8Gi

postgresql:
  enabled: true
  auth:
    postgresPassword: "my-pg-password"
    database: myapp
  primary:
    persistence:
      size: 20Gi
```

子 Chart 内部通过 `.Values` 访问这些值，与父 Chart 的模板机制完全一致。

#### 全局值传递

```yaml
# 父 Chart 的 values.yaml
global:
  imageRegistry: "registry.internal.example.com"
  storageClass: "fast-ssd"
  labels:
    environment: production
    team: platform

redis:
  enabled: true
  global:
    imageRegistry: "{{ .Values.global.imageRegistry }}"
```

子 Chart 通过 `.Values.global` 访问全局值，实现跨 Chart 的配置共享。

#### 条件依赖与标签

```yaml
# 使用 condition 控制是否安装子 Chart
# 父 values.yaml
redis:
  enabled: true   # false 时跳过 redis 子 Chart

# 使用 tags 批量控制
# 安装时通过 --set 控制标签
helm install myapp ./mychart --set tags.cache=false
```

### 2.3.4 使用场景

- **应用 + 中间件一体化部署**：一个 Chart 同时部署应用和其依赖的 Redis、PostgreSQL
- **微服务聚合 Chart**：父 Chart 聚合多个微服务子 Chart，统一管理版本和配置
- **Library Chart 共享**：将通用模板（如标签规范、监控配置）封装为 library Chart，多个应用引用
- **离线环境部署**：在有网络环境执行 `helm dependency update`，将依赖打包后传输到离线环境

### 2.3.5 潜在风险与注意事项

- **`helm dependency update` 会修改 `charts/` 目录**：不应将 `charts/` 下的 .tgz 文件提交到 Git，应在 CI 中执行依赖更新
- **版本约束语法**：`>=1.2.3`、`~1.2.x`、`^1.2.3` 等语义化版本约束，不熟悉时容易导致版本解析失败
- **子 Chart 覆盖冲突**：父 Chart 的 values 会覆盖子 Chart 的默认值，但子 Chart 的 values 优先级高于父 Chart 的同名 key
- **`condition` 和 `tags` 互斥**：同一依赖同时设置 condition 和 tags 时，condition 优先
- **循环依赖**：Helm 不允许循环依赖，`helm dependency update` 会检测并报错
- **Chart.lock 文件**：锁定精确版本，确保可重现构建。更新依赖时需同时更新 Chart.lock

### 2.3.6 本章小结

Helm 依赖管理通过 `Chart.yaml` 的 `dependencies` 字段声明子 Chart，`helm dependency update` 自动下载和管理依赖。子 Chart 的 values 通过父 Chart 的 values.yaml 同名 key 覆盖，全局值通过 `global` 字段跨 Chart 共享。`condition` 和 `tags` 提供灵活的安装控制。依赖管理使 Helm 从单应用打包工具进化为完整的应用组合平台。

---

## 2.4 Values 覆盖策略

### 2.4.1 解决的问题

同一套 Chart 需要部署到开发、测试、生产等多个环境，每个环境的配置参数不同（副本数、资源限制、域名、数据库地址等）。如果每次修改 values.yaml 或维护多份 Chart 副本，会导致配置爆炸和维护灾难。Helm 提供了多层 values 覆盖机制，允许用户在不同层级注入配置，按优先级合并。

### 2.4.2 核心原理

Helm 的 values 合并遵循严格的优先级顺序（从低到高）：

1. **Chart 内建 values.yaml**（最低优先级）
2. **父 Chart 的 values.yaml**（子 Chart 场景）
3. **`-f` / `--values` 指定的文件**（按顺序，后文件覆盖前文件）
4. **`--set` 参数**
5. **`--set-string` 参数**（强制作为字符串处理）
6. **`--set-file` 参数**（文件内容作为值）
7. **`--set-json` 参数**（JSON 解析后合并）

### 2.4.3 代码/配置实现

#### 多 values 文件策略

```yaml
# values.yaml（基础配置，所有环境共享）
replicaCount: 1
image:
  repository: myapp
  tag: latest
  pullPolicy: IfNotPresent
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: false
resources:
  requests:
    cpu: 100m
    memory: 128Mi
```

```yaml
# values-dev.yaml（开发环境覆盖）
replicaCount: 1
image:
  tag: develop
ingress:
  enabled: false
resources:
  requests:
    cpu: 100m
    memory: 128Mi
```

```yaml
# values-staging.yaml（预发布环境覆盖）
replicaCount: 2
image:
  tag: staging
ingress:
  enabled: true
  host: staging.example.com
resources:
  requests:
    cpu: 250m
    memory: 256Mi
```

```yaml
# values-prod.yaml（生产环境覆盖）
replicaCount: 5
image:
  tag: stable
  pullPolicy: Always
ingress:
  enabled: true
  host: app.example.com
  tls:
    enabled: true
    secretName: app-tls-prod
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
```

#### 安装命令

```bash
# 开发环境
helm install myapp ./mychart -f values-dev.yaml

# 预发布环境
helm install myapp ./mychart -f values.yaml -f values-staging.yaml

# 生产环境（多文件叠加）
helm install myapp ./mychart \
  -f values.yaml \
  -f values-prod.yaml \
  --set image.tag=v1.2.3 \
  --set-string service.type=LoadBalancer

# 使用 --set-file 注入文件内容
helm install myapp ./mychart \
  --set-file tls.cert=./certs/tls.crt \
  --set-file tls.key=./certs/tls.key

# 使用 --set-json 注入复杂 JSON
helm install myapp ./mychart \
  --set-json '{"resources":{"limits":{"cpu":"2","memory":"2Gi"}}}'
```

#### 企业级 values 组织策略

```
config/
├── base/
│   └── values.yaml              # 全局基础配置
├── environments/
│   ├── dev/
│   │   └── values.yaml          # 开发环境覆盖
│   ├── staging/
│   │   └── values.yaml          # 预发布环境覆盖
│   └── prod/
│       └── values.yaml          # 生产环境覆盖
├── regions/
│   ├── us-east/
│   │   └── values.yaml          # 区域级覆盖
│   └── eu-west/
│       └── values.yaml
└── secrets/
    └── values.yaml               # 加密的敏感配置（配合 sops）
```

```bash
# 企业级部署命令
helm upgrade --install myapp ./mychart \
  -f config/base/values.yaml \
  -f config/environments/prod/values.yaml \
  -f config/regions/us-east/values.yaml \
  -f config/secrets/values.yaml \
  --set image.tag=${CI_COMMIT_SHA}
```

### 2.4.4 使用场景

- **环境差异化**：开发/测试/生产环境使用不同 values 文件，共享基础配置
- **多区域部署**：同一环境的不同区域（us-east、eu-west）通过区域 values 文件差异化
- **CI/CD 动态注入**：CI 流水线通过 `--set` 注入构建号、Git Commit SHA、镜像标签等动态值
- **金丝雀发布**：通过 `--set` 调整副本数和流量权重，实现渐进式发布
- **敏感配置分离**：使用 `--set-file` 或外部密钥管理工具注入证书、密码等敏感信息

### 2.4.5 潜在风险与注意事项

- **`--set` 的类型推断陷阱**：`--set service.port=8080` 会被解析为数字，`--set service.port=08080` 会被解析为字符串（前导零）。使用 `--set-string` 强制字符串类型
- **`--set` 的数组语法**：`--set servers[0].host=foo --set servers[0].port=80`，索引必须从 0 开始连续
- **values 文件合并是浅合并**：嵌套 map 会递归合并，但数组会整体替换而非合并
- **`--reset-values` 与 `--reuse-values`**：`helm upgrade` 时，`--reset-values` 重置为 Chart 默认值再应用用户值；`--reuse-values` 复用上次的值。两者互斥
- **values 文件编码**：确保 values 文件是 UTF-8 编码，BOM 会导致解析错误
- **YAML 类型一致性**：不同 values 文件中同一 key 的类型必须一致，否则合并会失败

### 2.4.6 本章小结

Helm 的多层 values 覆盖机制是配置管理的核心。通过 `-f` 指定多文件、`--set` 系列参数注入动态值，用户可以在不修改 Chart 的前提下实现环境差异化配置。企业级实践中，建议按 base/environment/region/secret 分层组织 values 文件，配合 CI/CD 动态注入，实现声明式、可追溯的配置管理。

---

## 2.5 Helm Hooks 与生命周期

### 2.5.1 解决的问题

Kubernetes 资源的创建顺序不可控——数据库迁移 Job 需要在应用 Deployment 启动前完成，备份 Job 需要在删除前执行，配置验证需要在安装后自动运行。Helm Hooks 允许用户在 Release 生命周期的特定节点插入自定义操作，实现有序的依赖执行和资源生命周期管理。

### 2.5.2 核心原理

Helm Hooks 通过在模板中添加 `helm.sh/hook` 注解，将资源绑定到 Release 的特定阶段。Helm 在对应阶段会暂停正常流程，先创建 Hook 资源，等待其完成（或根据策略处理），再继续后续流程。

**Hook 类型**：

| Hook | 触发时机 | 典型用途 |
|------|----------|----------|
| `pre-install` | 模板渲染后、资源创建前 | 数据库初始化、配置验证 |
| `post-install` | 所有资源创建成功后 | 健康检查、通知发送 |
| `pre-upgrade` | 模板渲染后、资源更新前 | 数据迁移、备份 |
| `post-upgrade` | 所有资源更新成功后 | 缓存预热、健康验证 |
| `pre-delete` | 删除请求后、资源删除前 | 数据导出、资源清理 |
| `post-delete` | 所有资源删除后 | 清理通知、DNS 清理 |
| `pre-rollback` | 回滚模板渲染后、回滚执行前 | 回滚前备份 |
| `post-rollback` | 回滚执行成功后 | 回滚验证 |
| `test` | `helm test` 执行时 | 集成测试 |

### 2.5.3 代码/配置实现

#### 数据库迁移 Hook

```yaml
# templates/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "mychart.fullname" . }}-migration
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migration
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          command: ["/app/bin/migrate"]
          env:
            - name: DB_URL
              value: "postgres://{{ .Values.database.user }}:{{ .Values.database.password }}@{{ .Values.database.host }}/{{ .Values.database.name }}"
```

#### 安装后验证 Hook

```yaml
# templates/post-install-test.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "mychart.fullname" . }}-smoke-test
  annotations:
    "helm.sh/hook": post-install
    "helm.sh/hook-weight": "10"
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: smoke-test
          image: curlimages/curl:latest
          command:
            - /bin/sh
            - -c
            - |
              curl -f http://{{ include "mychart.fullname" . }}:{{ .Values.service.port }}/health
```

#### 删除前数据导出 Hook

```yaml
# templates/pre-delete-backup.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "mychart.fullname" . }}-backup
  annotations:
    "helm.sh/hook": pre-delete
    "helm.sh/hook-weight": "0"
    "helm.sh/hook-delete-policy": before-hook-creation
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: backup
          image: postgres:15
          command:
            - /bin/sh
            - -c
            - |
              pg_dump postgres://{{ .Values.database.user }}:{{ .Values.database.password }}@{{ .Values.database.host }}/{{ .Values.database.name }} > /backup/{{ .Release.Name }}-backup.sql
          volumeMounts:
            - name: backup
              mountPath: /backup
      volumes:
        - name: backup
          persistentVolumeClaim:
            claimName: backup-pvc
```

#### Hook 权重与执行顺序

```yaml
# 权重决定同一阶段的 Hook 执行顺序
# 权重为负数的 Hook 先执行，正数的后执行
# 同权重的按名称字母序执行

# 权重 -10：先执行数据库创建
apiVersion: batch/v1
kind: Job
metadata:
  name: create-db
  annotations:
    "helm.sh/hook": pre-install
    "helm.sh/hook-weight": "-10"

# 权重 -5：再执行 Schema 迁移
apiVersion: batch/v1
kind: Job
metadata:
  name: run-migration
  annotations:
    "helm.sh/hook": pre-install
    "helm.sh/hook-weight": "-5"

# 权重 5：最后执行数据种子
apiVersion: batch/v1
kind: Job
metadata:
  name: seed-data
  annotations:
    "helm.sh/hook": pre-install
    "helm.sh/hook-weight": "5"
```

#### Hook 删除策略

```yaml
# hook-delete-policy 控制 Hook 资源何时被删除
annotations:
  "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded

# 可选值：
# before-hook-creation  — 下次创建同类型 Hook 前删除（默认行为）
# hook-succeeded        — Hook 成功后立即删除
# hook-failed           — Hook 失败后删除（保留成功记录用于调试）
```

### 2.5.4 使用场景

- **数据库 Schema 迁移**：`pre-upgrade` Hook 在应用更新前执行迁移脚本
- **基础设施预检查**：`pre-install` Hook 验证云资源配额、证书有效性、DNS 解析
- **金丝雀验证**：`post-install` Hook 执行冒烟测试，验证服务健康
- **优雅下线**：`pre-delete` Hook 从注册中心注销服务、排空连接池
- **数据备份**：`pre-upgrade` 和 `pre-delete` Hook 自动备份数据库
- **集成测试**：`test` Hook 配合 `helm test` 执行端到端验证

### 2.5.5 潜在风险与注意事项

- **Hook 失败导致 Release 失败**：`pre-install` Hook 失败会阻止整个安装，需确保 Hook 的幂等性和重试机制
- **Hook 资源不纳入 Release 管理**：Hook 资源在 Helm 的 `--history-max` 之外，`helm rollback` 不会回滚 Hook 创建的资源
- **Hook 权重范围**：权重可以是负数，建议在 -10 到 10 之间，避免极端值导致意外顺序
- **`before-hook-creation` 的竞态**：如果前一次 Hook 未完成就触发新安装，旧 Hook 资源可能残留
- **Job 超时**：Hook Job 默认无超时，应在 Job spec 中设置 `activeDeadlineSeconds`
- **`helm install --no-hooks`**：跳过所有 Hook，用于调试或紧急恢复场景

### 2.5.6 本章小结

Helm Hooks 通过注解机制将资源绑定到 Release 生命周期的特定阶段，实现有序的依赖执行。`pre-install`、`post-install`、`pre-upgrade`、`post-upgrade`、`pre-delete`、`post-delete` 等 Hook 类型覆盖了完整的 Release 生命周期。Hook 权重控制执行顺序，删除策略管理资源清理。Hooks 是 Helm 从简单模板工具进化为完整应用生命周期管理器的关键能力。

---

## 2.6 OCI Registry

### 2.6.1 解决的问题

传统 Helm Chart 分发依赖 HTTP/HTTPS 的 Chart Repository（如 ChartMuseum、Bitnami 仓库），需要维护独立的仓库服务器。OCI（Open Container Initiative）Registry 已经成为容器镜像分发的行业标准（Docker Hub、ECR、ACR、GCR、Harbor 等）。将 Helm Chart 存储在 OCI Registry 中，可以复用现有的镜像仓库基础设施、统一认证体系、利用 Registry 的访问控制和审计能力。

### 2.6.2 核心原理

OCI Registry 将 Helm Chart 作为 OCI Artifact 存储。Chart 被打包为 OCI 镜像格式，包含 manifest、config 和 layer（Chart 的 .tgz 包）。Helm v3.8+ 原生支持 OCI 注册表操作，无需额外插件。

### 2.6.3 代码/配置实现

#### 登录与认证

```bash
# AWS ECR 登录
aws ecr get-login-password --region us-west-2 | \
  helm registry login --username AWS --password-stdin \
  <account-id>.dkr.ecr.us-west-2.amazonaws.com

# Azure ACR 登录
az acr login --name myregistry
helm registry login myregistry.azurecr.io --username 00000000-0000-0000-0000-000000000000 \
  --password $(az acr login --name myregistry --expose-token -o tsv --query accessToken)

# Docker Hub
helm registry login registry-1.docker.io -u myuser

# Harbor
helm registry login harbor.example.com -u admin
```

#### 推送 Chart 到 OCI Registry

```bash
# 打包 Chart
helm package ./mychart -d ./packages/
# 输出: ./packages/mychart-0.1.0.tgz

# 推送到 OCI Registry
helm push ./packages/mychart-0.1.0.tgz \
  oci://<account-id>.dkr.ecr.us-west-2.amazonaws.com/helm-charts

# 推送到 Azure ACR
helm push ./packages/mychart-0.1.0.tgz \
  oci://myregistry.azurecr.io/helm/charts

# 推送到 Harbor
helm push ./packages/mychart-0.1.0.tgz \
  oci://harbor.example.com/charts/mychart
```

#### 从 OCI Registry 安装 Chart

```bash
# 直接安装
helm install myapp \
  oci://<account-id>.dkr.ecr.us-west-2.amazonaws.com/helm-charts/mychart \
  --version 0.1.0

# 先 pull 再安装
helm pull oci://<account-id>.dkr.ecr.us-west-2.amazonaws.com/helm-charts/mychart \
  --version 0.1.0 --untar

helm install myapp ./mychart

# 在依赖中引用 OCI Chart
# Chart.yaml
dependencies:
  - name: mychart
    version: ">=0.1.0"
    repository: "oci://<account-id>.dkr.ecr.us-west-2.amazonaws.com/helm-charts"
```

#### 企业级 OCI 配置

```yaml
# ~/.config/helm/registry/config.json
{
  "auths": {
    "<account-id>.dkr.ecr.us-west-2.amazonaws.com": {
      "auth": "<base64-encoded-credentials>",
      "identitytoken": ""
    }
  }
}
```

#### 使用 OCI 的完整 CI/CD 流水线

```yaml
# .gitlab-ci.yml 或 GitHub Actions
stages:
  - package
  - push
  - deploy

helm-package:
  stage: package
  script:
    - helm dependency update ./mychart
    - helm package ./mychart --version ${CI_COMMIT_TAG:-0.1.0}
  artifacts:
    paths:
      - "*.tgz"

helm-push:
  stage: push
  script:
    - aws ecr get-login-password --region us-west-2 | helm registry login --username AWS --password-stdin ${ECR_REGISTRY}
    - helm push mychart-${CI_COMMIT_TAG:-0.1.0}.tgz oci://${ECR_REGISTRY}/helm-charts
  needs:
    - helm-package

helm-deploy:
  stage: deploy
  script:
    - aws ecr get-login-password --region us-west-2 | helm registry login --username AWS --password-stdin ${ECR_REGISTRY}
    - helm upgrade --install myapp oci://${ECR_REGISTRY}/helm-charts/mychart --version ${CI_COMMIT_TAG:-0.1.0} -f values-prod.yaml
  needs:
    - helm-push
```

### 2.6.4 使用场景

- **企业统一制品管理**：Chart 和容器镜像存储在同一个 Registry，统一认证、审计和访问控制
- **跨团队 Chart 分发**：平台团队将基础 Chart（Redis、PostgreSQL 等）推送到 OCI Registry，业务团队直接引用
- **GitOps 集成**：ArgoCD 和 Flux 原生支持从 OCI Registry 拉取 Chart
- **离线/私有网络部署**：在私有云或隔离网络中使用内部 OCI Registry 分发 Chart
- **多版本管理**：利用 OCI 的标签和摘要机制管理 Chart 版本，支持不可变标签

### 2.6.5 潜在风险与注意事项

- **Helm 版本要求**：OCI 支持需要 Helm v3.8+，v3.7 及以下需要安装 `helm-push` 插件
- **认证凭证管理**：`helm registry login` 凭证存储在 `~/.config/helm/registry/config.json`，需确保 CI/CD 中安全传递
- **OCI 不支持 `helm search`**：无法像传统 Chart Repository 那样搜索 Chart，需要外部工具管理 Chart 目录
- **依赖解析限制**：`helm dependency update` 对 OCI 仓库的支持有限，部分场景需要手动管理
- **Registry 兼容性**：并非所有 OCI Registry 都完全支持 OCI Artifact 规范，建议使用 ECR、ACR、Harbor、Docker Hub 等经过验证的 Registry
- **网络延迟**：从 OCI Registry 拉取 Chart 比从 HTTP Repository 慢，建议在 CI/CD 中使用缓存或镜像

### 2.6.6 本章小结

OCI Registry 将 Helm Chart 分发与容器镜像基础设施统一，复用现有的认证、审计和访问控制体系。`helm push` 推送 Chart，`helm install oci://` 直接安装，`helm pull` 下载到本地。企业实践中，建议将 OCI Registry 作为 Chart 分发的标准方式，配合 CI/CD 流水线实现自动化的打包、推送和部署。

---

## 2.7 潜在风险与最佳实践

### 2.7.1 模板语法错误

**问题**：Go 模板语法错误在 `helm install` 或 `helm template` 时才会暴露，无法在开发阶段静态检测。

**解决方案**：

```bash
# 使用 helm template 本地渲染验证
helm template myapp ./mychart -f values-prod.yaml > /dev/null

# 使用 helm lint 检查 Chart 语法
helm lint ./mychart

# 使用 --debug 查看渲染后的完整输出
helm template myapp ./mychart --debug

# 使用 yamllint 验证渲染后的 YAML 格式
helm template myapp ./mychart | yamllint -

# 在 CI 中集成验证
helm lint ./mychart && helm template myapp ./mychart | kubectl apply --dry-run=client -f -
```

**常见错误**：

```yaml
# 错误：缺少 end
{{- if .Values.enabled }}
apiVersion: v1
kind: ConfigMap
# 缺少 {{- end }}

# 错误：作用域混淆
{{- with .Values.database }}
  host: {{ .host }}
  port: {{ .port }}
  # 错误：.Values 在 with 块内不可用
  globalVar: {{ .Values.global.someValue }}
  # 正确：使用 $ 访问根作用域
  globalVar: {{ $.Values.global.someValue }}
{{- end }}

# 错误：缩进不一致
{{- if .Values.enabled }}
apiVersion: v1
kind: Service
  metadata:    # 缩进错误
    name: myapp
{{- end }}
```

### 2.7.2 Values 覆盖混淆

**问题**：多文件覆盖和 `--set` 参数组合使用时，难以追踪最终生效的值。

**解决方案**：

```bash
# 使用 helm get values 查看当前 Release 的最终值
helm get values myapp

# 使用 helm show values 查看 Chart 默认值
helm show values ./mychart

# 使用 --dry-run 预览渲染结果
helm upgrade --install myapp ./mychart -f values-prod.yaml --dry-run

# 使用 helm diff 插件查看变更
helm diff upgrade myapp ./mychart -f values-prod.yaml
```

### 2.7.3 CRD 管理

**问题**：CRD 的安装、更新和删除在 Helm 中处理不当会导致集群状态不一致。

**最佳实践**：

```yaml
# crds/ 目录中的 CRD 在 helm install 时自动安装
# 但 helm upgrade 不会更新已有 CRD
# helm uninstall 不会删除 CRD（防止数据丢失）

# 推荐策略：
# 1. 将 CRD 放在 crds/ 目录
# 2. 使用独立的 CRD Chart 管理
# 3. 使用 Helm 之外的工具（kubectl apply）管理 CRD
# 4. 升级 CRD 时手动执行 kubectl apply
```

```bash
# 手动管理 CRD
kubectl apply -f crds/
helm install myapp ./mychart

# 升级 CRD
kubectl apply -f crds/
helm upgrade myapp ./mychart
```

### 2.7.4 Helm 版本兼容性

**问题**：Helm v2 到 v3 的 API 变化、Kubernetes 版本与 Helm 版本的兼容性。

**关键差异**：

| 特性 | Helm v2 | Helm v3 |
|------|---------|---------|
| Tiller | 需要 | 不需要 |
| CRD 管理 | 不支持 | crds/ 目录 |
| OCI 支持 | 插件 | 原生 |
| apiVersion | v1 | v2 |
| JSON Schema | 不支持 | values.schema.json |
| XDG 目录 | 无 | $XDG_CONFIG_HOME |

```bash
# 检查 Helm 版本
helm version

# 从 v2 迁移到 v3
helm 2to3 convert myapp

# 检查 Chart 兼容性
helm lint ./mychart --strict
```

### 2.7.5 安全风险

```yaml
# 敏感信息泄露
# 错误：将密码硬编码在 values.yaml
database:
  password: "my-secret-password"  # 不应提交到 Git

# 正确：使用外部密钥管理
database:
  password: ""  # 通过 --set 或外部工具注入

# 或使用 Helm Secrets 插件
helm secrets encrypt values-secret.yaml
```

**安全最佳实践**：

```bash
# 使用 Sealed Secrets
kubeseal --format yaml < secret.yaml > sealed-secret.yaml

# 使用 External Secrets Operator
# 从 AWS Secrets Manager / GCP Secret Manager 同步

# 使用 SOPS 加密 values 文件
sops --encrypt values-prod.yaml > values-prod.enc.yaml
helm upgrade myapp ./mychart -f values-prod.enc.yaml
```

### 2.7.6 性能与规模

```yaml
# 大型 Chart 的优化建议
# 1. 避免在模板中执行大量计算
# 2. 使用 --history-max 限制历史记录
# 3. 合理拆分 Chart 大小

# 安装时限制历史
helm install myapp ./mychart --history-max 5

# 清理旧版本
helm history myapp --max 10
```

### 2.7.7 本章小结

Helm 的潜在风险涵盖模板语法、配置覆盖、CRD 管理、版本兼容性和安全等多个维度。核心防御策略包括：在 CI 中集成 `helm lint` 和 `helm template` 验证、使用 `--dry-run` 预览变更、将敏感配置与代码分离、理解 CRD 的生命周期约束、保持 Helm 和 Kubernetes 版本的兼容性。将这些检查自动化到 CI/CD 流水线中，可以大幅降低生产事故风险。

---

## 2.8 综合实战：企业级 Helm Chart 完整示例

### 2.8.1 项目结构

```
helm-charts/
├── Chart.yaml
├── values.yaml
├── values.schema.json
├── templates/
│   ├── _helpers.tpl
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── configmap.yaml
│   ├── serviceaccount.yaml
│   ├── pdb.yaml
│   ├── servicemonitor.yaml
│   ├── pre-upgrade-migration.yaml
│   ├── post-install-test.yaml
│   └── NOTES.txt
├── crds/
│   └── myapp-crd.yaml
├── charts/
│   └── (dependency .tgz files)
└── .helmignore
```

### 2.8.2 Chart.yaml

```yaml
apiVersion: v2
name: myapp
type: application
version: 1.0.0
appVersion: "2.5.0"
kubeVersion: ">=1.22.0-0"
description: Enterprise-grade microservice deployment chart
home: https://github.com/example/myapp
sources:
  - https://github.com/example/myapp
maintainers:
  - name: Platform Team
    email: platform@example.com
dependencies:
  - name: redis
    version: ">=17.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
    tags:
      - cache
  - name: postgresql
    version: ">=12.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
    tags:
      - database
```

### 2.8.3 values.yaml

```yaml
global:
  environment: production
  region: us-east-1
  imageRegistry: registry.example.com

replicaCount: 3
revisionHistoryLimit: 3

image:
  repository: myapp
  tag: latest
  pullPolicy: IfNotPresent
  pullSecrets:
    - name: regcred

service:
  type: ClusterIP
  port: 80
  targetPort: 8080
  annotations: {}

ingress:
  enabled: true
  className: nginx
  host: app.example.com
  path: /
  pathType: Prefix
  tls:
    enabled: true
    secretName: app-tls
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 200m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 75
  targetMemoryUtilizationPercentage: 80

probes:
  liveness:
    path: /healthz
    initialDelaySeconds: 30
    periodSeconds: 10
  readiness:
    path: /ready
    initialDelaySeconds: 5
    periodSeconds: 5
  startup:
    path: /startup
    initialDelaySeconds: 0
    periodSeconds: 10
    failureThreshold: 30

config:
  logLevel: info
  logFormat: json
  featureFlags:
    newCheckout: true
    darkMode: false

database:
  host: ""
  port: 5432
  name: myapp
  user: myapp
  password: ""

redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: true
    password: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podDisruptionBudget:
  enabled: true
  minAvailable: 1

serviceMonitor:
  enabled: true
  interval: 30s
  path: /metrics
  port: http

migration:
  enabled: true
  image: myapp-migration
  tag: latest
```

### 2.8.4 values.schema.json

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["image", "service"],
  "properties": {
    "replicaCount": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "image": {
      "type": "object",
      "required": ["repository"],
      "properties": {
        "repository": { "type": "string" },
        "tag": { "type": "string" }
      }
    },
    "resources": {
      "type": "object",
      "properties": {
        "requests": {
          "type": "object",
          "properties": {
            "cpu": { "type": "string", "pattern": "^[0-9]+m?$" },
            "memory": { "type": "string", "pattern": "^[0-9]+(Mi|Gi|Ki)$" }
          }
        }
      }
    }
  }
}
```

### 2.8.5 部署命令

```bash
# 开发环境
helm upgrade --install myapp ./mychart \
  -f values.yaml \
  --set image.tag=develop \
  --set replicaCount=1 \
  --set ingress.enabled=false \
  --set autoscaling.enabled=false

# 生产环境
helm upgrade --install myapp ./mychart \
  -f values.yaml \
  -f values-prod.yaml \
  --set image.tag=v2.5.0 \
  --set database.host=prod-db.example.com \
  --set database.password=$(aws secretsmanager get-secret-value --secret-id myapp/db-password --query SecretString --output text) \
  --set redis.auth.password=$(aws secretsmanager get-secret-value --secret-id myapp/redis-password --query SecretString --output text) \
  --history-max 5

# 回滚
helm rollback myapp 3

# 查看历史
helm history myapp
```

---

## 2.9 总结

Helm 是现代 Kubernetes 应用交付的事实标准。本章从 Chart 结构、模板函数、依赖管理、Values 覆盖、Hooks 生命周期、OCI 分发到风险防范，构建了完整的 Helm 知识体系。核心要点：

1. **Chart 结构**是基础——理解每个目录和文件的职责，才能正确组织 Chart
2. **模板函数**是灵魂——`include`、`toYaml`、`required`、`range` 等函数将静态 YAML 转化为可编程模板
3. **依赖管理**解决组合问题——通过 `Chart.yaml` 声明依赖，`helm dependency update` 自动管理
4. **Values 覆盖**实现环境差异化——多文件 + `--set` 系列参数，按优先级合并
5. **Hooks** 管理生命周期——在 Release 各阶段插入自定义操作，控制执行顺序
6. **OCI Registry** 统一分发——复用容器镜像基础设施，简化 Chart 分发
7. **风险防范**是生产底线——模板验证、配置审计、CRD 管理、安全注入缺一不可

在生产环境中，建议将 Helm 与 GitOps 工具（ArgoCD、Flux）结合，实现声明式的、可审计的、自动化的应用交付流水线。
