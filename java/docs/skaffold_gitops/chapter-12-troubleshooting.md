# 第12章 Skaffold + Helm + Python GitOps 故障排查指南

## 12.1 概述

在 Skaffold + Helm + Python 的 GitOps 工作流中，故障可能发生在 CI/CD 管道的任何环节：镜像构建失败、Helm 部署拒绝、Python 自动化脚本崩溃、Kubernetes 集群资源不足，或网络/IAM 权限配置错误。本章系统性地梳理每一类故障的根因、诊断方法和修复方案，并提供可直接复用的诊断脚本和命令集。

---

## 12.2 Skaffold 构建失败

### 12.2.1 Docker 构建上下文问题

#### 解决的问题

Skaffold 在本地或 CI 中执行 `docker build` 时，因 `.dockerignore` 遗漏、上下文路径错误或 Dockerfile 中 COPY 路径不匹配导致构建失败。

#### 核心原理

Skaffold 将 `skaffold.yaml` 中 `context` 指定的目录作为 Docker 构建上下文发送给守护进程。若上下文过大（未排除 `node_modules`、`.git` 等），构建会超时或 OOM；若上下文过小（遗漏了 Dockerfile 中 COPY 所需的文件），则 COPY 步骤失败。

#### 代码/配置实现

```yaml
# skaffold.yaml 中正确配置构建上下文
build:
  artifacts:
    - image: my-app
      context: src/app          # 构建上下文目录
      docker:
        dockerfile: Dockerfile  # 相对于 context 的路径
```

```dockerignore
# .dockerignore — 必须位于 context 目录下
node_modules/
.git/
__pycache__/
*.pyc
.env
*.log
dist/
```

#### 使用场景

- 本地 `skaffold dev` 首次构建时出现 `COPY failed: file not found`
- CI 中 `skaffold build` 因上下文过大导致构建超时（>30 分钟）

#### 潜在风险与注意事项

- `.dockerignore` 必须放在 `context` 目录下，而非项目根目录
- 若使用 `--ignore-files` 参数，路径需为绝对路径或相对于 `skaffold.yaml` 的路径
- Docker 守护进程磁盘空间不足时也会静默失败，需监控 `/var/lib/docker` 使用率

#### 诊断命令

```bash
# 查看 Skaffold 实际发送的构建上下文
skaffold build --dry-run --output artifacts.json

# 检查 Docker 构建日志（详细模式）
skaffold build -v debug 2>&1 | grep "context"

# 查看 Docker 守护进程磁盘使用
docker system df

# 测试 Dockerfile 是否可独立构建
docker build -t test-image src/app
```

---

### 12.2.2 Kaniko 集群内构建错误

#### 解决的问题

在 EKS 等集群中使用 Kaniko 进行集群内镜像构建时，出现 `COPY failed`、`unable to push image` 或 `no matching credentials` 等错误。

#### 核心原理

Kaniko 以 Pod 形式运行在集群内，使用 `--context` 参数从 Git 仓库或本地目录拉取构建上下文。它不依赖 Docker 守护进程，但需要正确的镜像仓库凭证（通过 `--cache-repo` 和 `--destination` 参数指定）和 ServiceAccount 权限。

#### 代码/配置实现

```yaml
# skaffold.yaml — Kaniko 配置
build:
  artifacts:
    - image: 123456789.dkr.ecr.ap-northeast-1.amazonaws.com/my-app
      context: src/app
      kaniko:
        cache: {}
        buildArgs:
          BUILDKIT_INLINE_CACHE: "1"
  cluster:
    namespace: skaffold
    pullSecretName: ecr-credentials
    serviceAccountName: kaniko
    resources:
      requests:
        cpu: 1
        memory: 2Gi
      limits:
        cpu: 4
        memory: 8Gi
```

```yaml
# kaniko ServiceAccount 和 IAM 角色绑定
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kaniko
  namespace: skaffold
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/kaniko-ecr-push
```

#### 使用场景

- 在无 Docker 守护进程的 CI 环境（如 GitLab Runner、CodeBuild）中使用 Kaniko
- 需要集群内构建以利用 EBS 缓存加速的场景

#### 潜在风险与注意事项

- Kaniko Pod 默认使用 `emptyDir` 作为构建缓存，Pod 重建后缓存丢失
- 若 `pullSecretName` 指定的 Secret 过期，Kaniko 无法拉取基础镜像
- Kaniko 不支持 `docker build --squash` 等 Docker 特有指令
- 大镜像构建时需调整 Pod 的 `resources.limits.ephemeral-storage`

#### 诊断命令

```bash
# 查看 Kaniko Pod 日志
kubectl logs -n skaffold -l run=kaniko --tail=100

# 检查 Kaniko Pod 事件
kubectl describe pod -n skaffold -l run=kaniko

# 验证 ECR 凭证 Secret
kubectl get secret ecr-credentials -n skaffold -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d

# 手动测试 Kaniko（调试模式）
kubectl run kaniko-test --image=gcr.io/kaniko-project/executor:debug \
  --rm -it --restart=Never -- /kaniko/executor \
  --context=git://github.com/org/repo.git#refs/heads/main \
  --destination=123456789.dkr.ecr.ap-northeast-1.amazonaws.com/test:latest \
  --insecure-registry
```

---

### 12.2.3 Cloud Build 权限问题

#### 解决的问题

使用 Google Cloud Build 作为 Skaffold 构建后端时，因 Cloud Build 服务账号缺少 Artifact Registry 或 Secret Manager 的访问权限导致构建失败。

#### 核心原理

Skaffold 通过 `cloudbuild.yaml` 或 `--profile` 将构建任务提交给 Cloud Build。Cloud Build 使用其默认服务账号（`<project-number>@cloudbuild.gserviceaccount.com`）执行构建，该账号需要 `roles/artifactregistry.writer`、`roles/cloudbuild.builds.builder` 等角色。

#### 代码/配置实现

```yaml
# skaffold.yaml — Cloud Build 配置
build:
  artifacts:
    - image: us-central1-docker.pkg.dev/my-project/my-repo/my-app
      context: .
      docker:
        dockerfile: Dockerfile
  googleCloudBuild:
    projectId: my-project
    diskSizeGb: 100
    machineType: N1_HIGHCPU_32
    timeout: 1800s
```

```bash
# 授予 Cloud Build 服务账号必要权限
gcloud projects add-iam-policy-binding my-project \
  --member="serviceAccount:123456789@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding my-project \
  --member="serviceAccount:123456789@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### 使用场景

- 使用 Cloud Build 作为远程构建后端，避免本地 Docker 资源消耗
- 多项目共享 Artifact Registry 仓库时的跨项目权限配置

#### 潜在风险与注意事项

- Cloud Build 默认服务账号有每分钟 API 调用配额限制（QPS），高并发构建可能触发 `rateLimitExceeded`
- 若使用 VPC-SC（服务边界），Cloud Build 无法访问边界外的 Artifact Registry
- Cloud Build 构建超时默认为 10 分钟，大项目需显式设置 `timeout`

#### 诊断命令

```bash
# 查看 Cloud Build 构建日志
gcloud builds log $(gcloud builds list --format="value(id)" --limit=1)

# 测试服务账号权限
gcloud artifacts docker images list \
  --repository=us-central1-docker.pkg.dev/my-project/my-repo \
  --impersonate-service-account=123456789@cloudbuild.gserviceaccount.com

# 检查 Cloud Build 服务账号的 IAM 绑定
gcloud projects get-iam-policy my-project \
  --flatten="bindings[].members" \
  --format="table(bindings.role,bindings.members)" \
  --filter="bindings.members:cloudbuild.gserviceaccount.com"
```

---

### 12.2.4 镜像标签冲突

#### 解决的问题

并发 CI 管道中多个构建为同一镜像生成相同标签（如 `latest` 或相同 commit SHA），导致镜像覆盖或部署拉取到错误版本。

#### 核心原理

Skaffold 默认使用 `gitCommit` 策略生成镜像标签。当多个构建基于同一 commit 但不同代码路径时，标签冲突会导致部署的 Pod 使用旧镜像（因 `imagePullPolicy: IfNotPresent` 不会重新拉取）。

#### 代码/配置实现

```yaml
# skaffold.yaml — 标签策略配置
build:
  artifacts:
    - image: my-app
      context: .
  tagPolicy:
    envTemplate:
      template: "{{ .IMAGE_NAME }}:{{ .BRANCH }}-{{ .SHORT_SHA }}-{{ .TIMESTAMP }}"
    # 或使用 dateTime 策略
    # dateTime:
    #   format: "2006-01-02_15-04-05.999_MST"
```

```yaml
# deployment.yaml — 确保强制拉取
spec:
  template:
    spec:
      containers:
        - name: my-app
          image: my-app
          imagePullPolicy: Always  # 覆盖默认的 IfNotPresent
```

#### 使用场景

- 多个 feature 分支同时构建并推送到同一 ECR 仓库
- CI 中 `skaffold build --tag` 未指定唯一标签

#### 潜在风险与注意事项

- 使用时间戳标签会导致镜像仓库存储膨胀，需配合生命周期策略清理
- `imagePullPolicy: Always` 增加 Pod 启动延迟，生产环境建议使用唯一不可变标签
- ECR 和 GCR 都有镜像数量上限（默认每个仓库 10,000 个标签）

#### 诊断命令

```bash
# 查看 Skaffold 生成的最终标签
skaffold build --dry-run --output build.json
cat build.json | jq '.build_artifacts[].tag'

# 列出 ECR 仓库中所有标签
aws ecr list-images --repository-name my-app --region ap-northeast-1

# 检查 Pod 实际使用的镜像
kubectl get pod -l app=my-app -o jsonpath='{.items[0].spec.containers[0].image}'

# 清理旧标签
aws ecr batch-delete-image \
  --repository-name my-app \
  --image-ids "$(aws ecr list-images --repository-name my-app --query 'imageIds[?imageTag!=`latest`]' --output json)"
```

---

### 12.2.5 本章小结

Skaffold 构建失败的核心排查路径为：检查构建上下文 → 验证凭证权限 → 确认标签唯一性 → 查看构建日志。建议在 CI 中始终使用 `skaffold build -v debug` 获取详细日志，并将构建产物清单（`build.json`）持久化到构建工件中供后续排查。

---

## 12.3 Helm 部署失败

### 12.3.1 模板渲染错误

#### 解决的问题

`helm template` 或 `helm install` 时因 Go 模板语法错误、缺失值或类型不匹配导致渲染失败，错误信息如 `render error: template: ...: unexpected "}"` 或 `nil pointer evaluating interface {}`。

#### 核心原理

Helm 使用 Go `text/template` 引擎渲染 YAML 模板。模板中的 `.Values.*`、`.Release.*`、`.Chart.*` 等对象在渲染时若为 nil 或类型不匹配，会触发 panic。Skaffold 在部署前会执行 `helm template` 验证，渲染失败则中止部署。

#### 代码/配置实现

```yaml
# values.yaml — 确保所有模板引用的值都有默认值
replicaCount: 3
image:
  repository: my-app
  tag: ""
  pullPolicy: IfNotPresent
service:
  port: 8080
ingress:
  enabled: false
  host: ""
  tls: {}
```

```yaml
# templates/deployment.yaml — 使用 default 函数防御 nil
spec:
  replicas: {{ .Values.replicaCount | default 1 }}
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default "latest" }}"
          ports:
            - containerPort: {{ .Values.service.port | default 8080 }}
```

```yaml
# templates/_helpers.tpl — 命名模板中的防御性检查
{{- define "my-app.fullname" -}}
{{- if .Values.fullnameOverride -}}
  {{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
  {{- $name := default .Chart.Name .Values.nameOverride -}}
  {{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
```

#### 使用场景

- 新增模板后 `helm template` 报 `unexpected "}}"` 等语法错误
- 升级 Chart 版本后，新模板引用了旧 values 中不存在的字段

#### 潜在风险与注意事项

- `required` 函数比 `default` 更安全：`{{ required "image.tag is required" .Values.image.tag }}` 可在缺失时给出明确错误
- `toYaml` 和 `fromYaml` 在输入为空时也会报错，需配合 `empty` 检查
- 模板中不能使用 `range` 遍历 nil map，必须前置 `if` 判断

#### 诊断命令

```bash
# 本地渲染模板查看错误
helm template my-release ./chart --debug 2>&1

# 使用 --dry-run 模拟安装
helm install my-release ./chart --dry-run --debug 2>&1

# 仅渲染单个模板文件
helm template my-release ./chart -s templates/deployment.yaml

# 使用 Skaffold 的 Helm 调试
skaffold deploy -v debug 2>&1 | grep -A 20 "helm template"

# 验证 YAML 语法
python -c "import yaml, sys; yaml.safe_load(open(sys.argv[1]))" chart/templates/deployment.yaml
```

---

### 12.3.2 Values 校验失败

#### 解决的问题

Helm Chart 使用 `values.schema.json` 进行 values 校验，当用户提供的 values 不满足 schema 约束时（如类型错误、缺少必填字段、枚举值不合法），`helm install` 或 `helm upgrade` 拒绝执行。

#### 核心原理

Helm 3 支持在 Chart 根目录放置 `values.schema.json`，使用 JSON Schema Draft-07 规范校验用户提供的 values。校验失败时 Helm 输出详细的 JSON path 和错误原因。

#### 代码/配置实现

```json
// chart/values.schema.json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["image", "replicaCount"],
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
        "tag": { "type": "string", "pattern": "^[a-zA-Z0-9._-]+$" },
        "pullPolicy": {
          "type": "string",
          "enum": ["Always", "IfNotPresent", "Never"]
        }
      }
    },
    "ingress": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "host": { "type": "string", "format": "hostname" }
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

```yaml
# skaffold.yaml — 部署前执行 values 校验
deploy:
  helm:
    releases:
      - name: my-release
        chartPath: chart
        valuesFiles:
          - values.yaml
        # 在 Skaffold 中启用 Helm 的 --validate 标志
        helmFlags:
          - "--validate"
```

#### 使用场景

- 多环境（dev/staging/prod）使用不同 values 文件，需确保所有环境都提供必填字段
- 开放给第三方使用的公共 Chart，需通过 schema 约束用户输入

#### 潜在风险与注意事项

- JSON Schema 不支持 `oneOf` 和 `if/then` 等高级校验（Helm 3 的 JSON Schema 实现有限）
- `values.schema.json` 中的 `default` 不会自动填充到 values 中，仅用于文档
- Schema 校验在 `helm lint` 和 `helm install` 时都会执行，但 `helm template` 不会校验

#### 诊断命令

```bash
# 使用 helm lint 校验 values
helm lint ./chart --values values.yaml --strict

# 查看 schema 校验错误详情
helm install my-release ./chart --values values.yaml --dry-run 2>&1

# 手动验证 values 是否符合 schema
python -c "
import json, jsonschema
with open('chart/values.schema.json') as f:
    schema = json.load(f)
with open('values.yaml') as f:
    import yaml
    values = yaml.safe_load(f)
jsonschema.validate(values, schema)
print('Values validation passed')
"

# 列出所有 values 路径（用于排查缺失字段）
helm show values ./chart | python -c "
import yaml, sys
def flatten(d, prefix=''):
    for k, v in d.items():
        path = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            flatten(v, path)
        else:
            print(f'{path}: {v}')
flatten(yaml.safe_load(sys.stdin))
"
```

---

### 12.3.3 CRD 未找到

#### 解决的问题

Helm Chart 依赖的自定义资源定义（CRD）尚未安装到集群中，导致 `helm install` 时报 `unable to recognize "": no matches for kind "..." in version "..."`。

#### 核心原理

Helm 3 将 CRD 放在 `crds/` 目录下，`helm install` 时会先安装 CRD 再渲染模板。但 CRD 安装是尽力而为的——如果 CRD 已存在则跳过，不会更新。若 CRD 由其他 Chart 管理或手动安装，时序问题会导致模板中的 CR 先于 CRD 被应用。

#### 代码/配置实现

```yaml
# chart/crds/cronjobs.timescaledb.operator.sql.com
# 注意：crds/ 目录下只能放 CRD YAML，不能放 CR（Custom Resource）
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: cronjobs.timescaledb.operator.sql.com
spec:
  group: timescaledb.operator.sql.com
  names:
    kind: CronJob
    listKind: CronJobList
    plural: cronjobs
    singular: cronjob
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          x-kubernetes-preserve-unknown-fields: true
```

```yaml
# skaffold.yaml — 使用 helm hook 确保 CRD 先安装
deploy:
  helm:
    releases:
      - name: my-release
        chartPath: chart
        # 使用 --skip-crds 跳过 CRD 安装（如果由外部管理）
        helmFlags:
          - "--skip-crds"
```

```yaml
# templates/cronjob.yaml — 使用 conditional 避免 CRD 未就绪时渲染
{{- if .Values.cronjob.enabled }}
{{- if .Capabilities.APIVersions.Has "timescaledb.operator.sql.com/v1/CronJob" }}
apiVersion: timescaledb.operator.sql.com/v1
kind: CronJob
metadata:
  name: my-cronjob
spec:
  schedule: "*/5 * * * *"
{{- end }}
{{- end }}
```

#### 使用场景

- 安装依赖 Operator（如 Prometheus Operator、Cert-Manager、Crossplane）的 Chart
- 多 Chart 部署时，一个 Chart 的 CRD 被另一个 Chart 的 CR 引用

#### 潜在风险与注意事项

- Helm 不会更新 `crds/` 中已存在的 CRD，CRD 升级需手动执行 `kubectl apply`
- CRD 安装是集群范围的，需确保 Helm 有集群级别 RBAC 权限
- 使用 `--skip-crds` 时需确保 CRD 已通过其他方式安装

#### 诊断命令

```bash
# 检查集群中是否已安装 CRD
kubectl get crd | grep timescaledb

# 查看 CRD 的 API 版本
kubectl get crd cronjobs.timescaledb.operator.sql.com -o jsonpath='{.spec.versions[*].name}'

# 检查 Helm 安装日志中的 CRD 阶段
helm install my-release ./chart --debug 2>&1 | grep -i crd

# 手动安装 CRD
kubectl apply -f chart/crds/

# 检查 API 服务是否可用
kubectl get apiservice | grep timescaledb
```

---

### 12.3.4 资源配额超限

#### 解决的问题

Helm 部署时因 Namespace 资源配额（ResourceQuota）或 LimitRange 限制导致 Pod 创建失败，错误信息如 `exceeded quota: compute-resources, requested: cpu=2, used: cpu=8, limited: cpu=10`。

#### 核心原理

Kubernetes 通过 ResourceQuota 限制 Namespace 级别的资源总量，LimitRange 设置 Pod/Container 级别的默认资源请求和限制。Helm 部署的 Pod 若未设置 `resources.requests` 和 `resources.limits`，LimitRange 会注入默认值，可能超出 Quota。

#### 代码/配置实现

```yaml
# chart/templates/deployment.yaml — 显式设置资源请求和限制
spec:
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

```yaml
# values.yaml — 合理的资源默认值
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

```yaml
# 检查 Namespace 的 ResourceQuota
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: my-namespace
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    persistentvolumeclaims: "10"
    pods: "50"
```

#### 使用场景

- 多团队共享集群时，每个 Namespace 有严格的资源配额
- 部署大型应用（如多个微服务同时发布）时触发配额上限

#### 潜在风险与注意事项

- ResourceQuota 是 Namespace 级别的，跨 Namespace 的 Pod 不受影响
- 若同时设置了 `requests` 和 `limits`，两者都计入配额
- 删除 ResourceQuota 不会自动恢复已拒绝的 Pod，需重新部署

#### 诊断命令

```bash
# 查看 Namespace 的资源配额和使用量
kubectl get resourcequota -n my-namespace -o yaml

# 查看配额使用详情
kubectl describe quota -n my-namespace

# 检查 Pod 是否因配额被拒绝
kubectl get events -n my-namespace --sort-by='.lastTimestamp' | grep -i quota

# 计算当前 Namespace 已使用的资源
kubectl top pod -n my-namespace --sum

# 查看 LimitRange 默认值
kubectl get limitrange -n my-namespace -o yaml

# 模拟部署检查配额（dry-run）
helm install my-release ./chart --values values.yaml --dry-run=server -n my-namespace
```

---

### 12.3.5 Helm Hook 失败

#### 解决的问题

Helm 的 pre-install、post-install、pre-upgrade、post-upgrade 等 hook 执行失败（如 Job 超时、Pod 崩溃），导致整个 `helm install` 或 `helm upgrade` 操作被回滚或阻塞。

#### 核心原理

Helm Hook 是带有特殊 annotation（`helm.sh/hook`）的 Kubernetes 资源（通常是 Job）。Helm 在 release 生命周期的特定阶段创建这些资源，并等待其完成。Hook 失败时，Helm 根据 `--atomic` 和 `--wait` 标志决定是否回滚。

#### 代码/配置实现

```yaml
# templates/migration-job.yaml — 数据库迁移 Hook
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ .Release.Name }}-migration
  annotations:
    helm.sh/hook: pre-upgrade
    helm.sh/hook-weight: "1"
    helm.sh/hook-delete-policy: hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migration
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          command: ["python", "manage.py", "migrate"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
      # 设置超时避免 Hook 无限等待
      activeDeadlineSeconds: 300
```

```yaml
# skaffold.yaml — 配置 Helm 部署等待和超时
deploy:
  helm:
    releases:
      - name: my-release
        chartPath: chart
        helmFlags:
          - "--atomic"       # 失败时自动回滚
          - "--wait"         # 等待所有资源就绪
          - "--timeout=10m"  # 总超时时间
```

#### 使用场景

- 数据库 Schema 迁移作为 pre-upgrade Hook
- 部署前检查依赖服务是否就绪的验证 Hook
- 部署后执行健康检查或缓存预热

#### 潜在风险与注意事项

- Hook Job 默认不会在失败后自动重试，需设置 `backoffLimit`
- `hook-delete-policy: hook-succeeded` 只在成功时删除，失败时保留 Job 供排查
- 多个 Hook 按 `hook-weight` 升序执行，同权重的按资源名称字母序执行
- `--atomic` 回滚时不会自动删除失败的 Hook Job，需手动清理

#### 诊断命令

```bash
# 查看 Helm release 的 hook 状态
helm status my-release --show-resources

# 查看 Hook Job 日志
kubectl logs -n my-namespace -l job-name=my-release-migration

# 查看 Hook Job 详情
kubectl describe job my-release-migration -n my-namespace

# 手动触发 Hook Job 测试
kubectl create job --from=cronjob/my-release-migration manual-test -n my-namespace

# 查看 Helm 历史中的 hook 执行记录
helm history my-release -n my-namespace

# 清理失败的 Hook Job
kubectl delete job my-release-migration -n my-namespace

# 查看 Helm 回滚详情
helm rollback my-release 1 -n my-namespace --debug 2>&1
```

---

### 12.3.6 本章小结

Helm 部署失败的核心排查路径为：模板渲染 → values 校验 → CRD 就绪 → 资源配额 → Hook 执行。建议在 `skaffold.yaml` 中始终启用 `--atomic` 和 `--wait`，并在 CI 中捕获 `helm template --debug` 的输出作为构建工件。对于复杂的多 Chart 部署，使用 `helm dependency update` 确保依赖 Chart 版本一致。

---

## 12.4 Python 脚本错误

### 12.4.1 子进程超时

#### 解决的问题

Python 自动化脚本中通过 `subprocess` 调用 `skaffold`、`helm`、`kubectl` 等外部命令时，因命令执行时间过长导致进程挂起或超时，阻塞整个 CI 管道。

#### 核心原理

`subprocess.run()` 默认不设超时，若调用的命令因网络问题、资源等待或死锁而无限阻塞，Python 进程也会永久挂起。需通过 `timeout` 参数设置合理的超时阈值，并在超时时优雅处理。

#### 代码/配置实现

```python
# scripts/deploy_runner.py — 带超时和重试的子进程执行器
import subprocess
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

class CommandRunner:
    def __init__(self, timeout: int = 300, retries: int = 2):
        self.timeout = timeout
        self.retries = retries

    def run(
        self,
        cmd: List[str],
        cwd: Optional[str] = None,
        env: Optional[dict] = None,
    ) -> subprocess.CompletedProcess:
        last_error = None
        for attempt in range(1 + self.retries):
            try:
                logger.info(f"Running: {' '.join(cmd)} (attempt {attempt + 1})")
                result = subprocess.run(
                    cmd,
                    cwd=cwd,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                    check=True,
                )
                logger.debug(f"stdout: {result.stdout[:500]}")
                return result
            except subprocess.TimeoutExpired as e:
                logger.warning(
                    f"Command timed out after {self.timeout}s: {' '.join(cmd)}"
                )
                last_error = e
                if attempt < self.retries:
                    logger.info(f"Retrying... ({attempt + 1}/{self.retries})")
            except subprocess.CalledProcessError as e:
                logger.error(
                    f"Command failed (rc={e.returncode}): {e.stderr[:500]}"
                )
                raise
        raise TimeoutError(
            f"Command failed after {self.retries} retries: {' '.join(cmd)}"
        ) from last_error
```

```python
# scripts/deploy.py — 使用示例
from deploy_runner import CommandRunner

runner = CommandRunner(timeout=600, retries=1)

# 调用 skaffold build
runner.run(
    ["skaffold", "build", "--profile", "prod", "-v", "debug"],
    cwd="/workspace",
)

# 调用 helm upgrade
runner.run(
    [
        "helm", "upgrade", "--install", "my-release", "./chart",
        "--values", "values-prod.yaml",
        "--atomic", "--timeout", "10m",
    ],
    cwd="/workspace",
)
```

#### 使用场景

- CI 中 Python 脚本调用 `skaffold build` 构建大镜像（>1GB）
- 调用 `helm upgrade --wait` 等待所有 Pod 就绪（可能因 Pending 而超时）

#### 潜在风险与注意事项

- 超时时间需根据实际场景调整：镜像构建建议 600s，Helm 部署建议 900s
- `capture_output=True` 会在内存中缓存全部输出，大输出可能导致 OOM，建议使用 `stdout=PIPE` 并流式读取
- 子进程超时后不会自动终止孙子进程，需使用 `process.kill()` 或 `process.terminate()`

#### 诊断命令

```bash
# 设置 Python 子进程调试日志
export SKAFFOLD_DEBUG=1
python scripts/deploy.py 2>&1 | tee deploy.log

# 查看超时时的系统资源
timeout 30 strace -f -e trace=network python scripts/deploy.py 2>&1 | grep "connect("

# 使用 timeout 命令作为外层保护
timeout 600 python scripts/deploy.py
```

---

### 12.4.2 API 速率限制

#### 解决的问题

Python 脚本频繁调用 Kubernetes API（通过 `kubectl` 或客户端库）或云厂商 API（AWS ECR、GCR）时，触发 API 速率限制，错误信息如 `rate limit exceeded` 或 `429 Too Many Requests`。

#### 核心原理

Kubernetes API Server 默认 QPS 限制为 `--max-requests-inflight=400`（读取）和 `--max-mutating-requests-inflow=200`（写入）。AWS 和 GCP API 也有基于账户和区域的速率限制。Python 脚本中高频循环调用 API 时极易触发限制。

#### 代码/配置实现

```python
# scripts/api_client.py — 带指数退避的 API 客户端
import time
import random
import logging
from functools import wraps
from typing import Callable, Any

logger = logging.getLogger(__name__)

def retry_with_backoff(
    max_retries: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: bool = True,
) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_error = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    if "429" in str(e) or "rate limit" in str(e).lower():
                        delay = min(
                            base_delay * (2 ** attempt) + (random.random() * 2 if jitter else 0),
                            max_delay,
                        )
                        logger.warning(
                            f"Rate limited (attempt {attempt + 1}/{max_retries}), "
                            f"retrying in {delay:.1f}s"
                        )
                        time.sleep(delay)
                    else:
                        raise
            raise last_error
        return wrapper
    return decorator


# 使用示例
class ECRClient:
    def __init__(self, region: str = "ap-northeast-1"):
        import boto3
        self.client = boto3.client("ecr", region_name=region)

    @retry_with_backoff(max_retries=5, base_delay=2.0)
    def describe_images(self, repository_name: str) -> list:
        response = self.client.describe_images(
            repositoryName=repository_name,
            maxResults=100,
        )
        return response.get("imageDetails", [])

    @retry_with_backoff(max_retries=3, base_delay=1.0)
    def batch_delete_image(self, repository_name: str, image_ids: list) -> dict:
        return self.client.batch_delete_image(
            repositoryName=repository_name,
            imageIds=image_ids,
        )
```

```python
# scripts/k8s_client.py — Kubernetes API 客户端限速
from kubernetes import client, config
from kubernetes.client.rest import ApiException

class K8sClient:
    def __init__(self):
        config.load_kube_config()
        # 配置客户端 QPS 和 Burst
        self.core = client.CoreV1Api(
            api_client=client.ApiClient(
                configuration=client.Configuration(
                    host="",
                    api_key={},
                    # 限制客户端自身请求速率
                    max_retries=3,
                )
            )
        )

    @retry_with_backoff(max_retries=3, base_delay=0.5)
    def list_pods(self, namespace: str, label_selector: str = "") -> list:
        try:
            response = self.core.list_namespaced_pod(
                namespace=namespace,
                label_selector=label_selector,
                timeout_seconds=30,
            )
            return response.items
        except ApiException as e:
            if e.status == 429:
                raise RuntimeError(f"rate limit: {e}") from e
            raise
```

#### 使用场景

- Python 脚本批量操作大量 Kubernetes 资源（如批量删除 1000 个旧 Pod）
- CI 中频繁调用 ECR/GCR API 检查镜像是否存在

#### 潜在风险与注意事项

- AWS API 速率限制是账户级别的，一个脚本触发限制会影响同一账户下的其他操作
- Kubernetes API 的 `watch` 连接不计入 QPS 限制，但 `list` 操作计入
- 使用 `kubectl` 时可通过 `--cache-dir` 和 `--request-timeout` 缓解

#### 诊断命令

```bash
# 查看 Kubernetes API Server 的请求统计
kubectl get --raw /metrics | grep apiserver_request_total | head -20

# 查看 AWS ECR API 调用配额
aws ecr describe-registry --region ap-northeast-1

# 检查 kubectl 客户端 QPS 配置
kubectl config view --minify -o jsonpath='{.users[0].user}'

# 使用 kubectl 的 --v=6 查看 API 请求详情
kubectl get pods -n my-namespace --v=6 2>&1 | grep "curl"
```

---

### 12.4.3 凭证过期

#### 解决的问题

Python 脚本中使用的 AWS/GCP/Kubernetes 凭证在长时间运行的 CI 管道或定时任务中过期，导致 API 调用返回 `401 Unauthorized` 或 `ExpiredToken`。

#### 核心原理

AWS 临时凭证（STS）默认有效期 1 小时，GCP 访问令牌默认 1 小时，Kubernetes ServiceAccount Token 默认 1 小时（1.21+）。长时间运行的部署脚本（如大型镜像构建 + 多环境部署）可能跨越凭证有效期。

#### 代码/配置实现

```python
# scripts/credential_manager.py — 凭证自动刷新
import os
import boto3
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

class CredentialManager:
    def __init__(self):
        self._session: Optional[boto3.Session] = None
        self._expiry: Optional[datetime] = None

    def get_session(self) -> boto3.Session:
        now = datetime.now(timezone.utc)
        if self._session and self._expiry and now < self._expiry:
            return self._session

        logger.info("Refreshing AWS credentials")
        # 使用 EKS Pod Identity 或 IRSA
        self._session = boto3.Session()
        credentials = self._session.get_credentials()
        if credentials:
            frozen = credentials.get_frozen_credentials()
            # 提前 5 分钟刷新
            self._expiry = now.replace(
                hour=now.hour + 1, minute=now.minute - 5
            )
        return self._session

    def get_ecr_password(self) -> str:
        """获取 ECR 登录密码（有效期 12 小时）"""
        ecr = self.get_session().client("ecr")
        response = ecr.get_authorization_token()
        return response["authorizationData"][0]["authorizationToken"]
```

```python
# scripts/k8s_token_refresh.py — Kubernetes 令牌刷新
import subprocess
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class K8sTokenRefresher:
    def __init__(self, cluster_name: str, region: str = "ap-northeast-1"):
        self.cluster_name = cluster_name
        self.region = region

    def refresh_kubeconfig(self) -> None:
        """刷新 EKS kubeconfig（令牌过期后自动刷新）"""
        logger.info(f"Refreshing kubeconfig for cluster: {self.cluster_name}")
        subprocess.run(
            [
                "aws", "eks", "update-kubeconfig",
                "--name", self.cluster_name,
                "--region", self.region,
                "--alias", self.cluster_name,
            ],
            check=True,
            capture_output=True,
        )

    def get_current_token_expiry(self) -> datetime:
        """检查当前令牌过期时间"""
        result = subprocess.run(
            ["kubectl", "config", "view", "--raw", "-o", "json"],
            check=True, capture_output=True, text=True,
        )
        config = json.loads(result.stdout)
        for user in config.get("users", []):
            if user.get("name", "").startswith("arn:aws"):
                exec_config = user.get("user", {}).get("exec", {})
                if exec_config:
                    logger.info(
                        f"Using exec auth: {exec_config.get('command')}"
                    )
        return datetime.now(timezone.utc)
```

#### 使用场景

- CI 管道中 `skaffold build`（30 分钟）+ `helm upgrade`（10 分钟）+ 多环境部署（20 分钟）总时长超过 1 小时
- 定时任务（如每日镜像清理脚本）运行时间不确定

#### 潜在风险与注意事项

- AWS CLI 的 `credential_process` 和 `exec` 插件（如 `aws --profile`）会在每次调用时自动刷新令牌
- Kubernetes 1.21+ 的 ServiceAccount Token 自动过期，建议使用 `token-request` API 或 `exec` 认证插件
- 不要在环境变量中硬编码长期凭证（`AWS_ACCESS_KEY_ID`），优先使用 IRSA 或 IAM Roles Anywhere

#### 诊断命令

```bash
# 检查 AWS 凭证过期时间
aws sts get-caller-identity
aws sts get-access-key-info --access-key-id $(aws configure get aws_access_key_id)

# 检查 kubeconfig 中的认证方式
kubectl config view --raw -o jsonpath='{.users[0].user}'

# 手动刷新 EKS kubeconfig
aws eks update-kubeconfig --name my-cluster --region ap-northeast-1

# 测试凭证是否有效
aws ecr describe-repositories --region ap-northeast-1

# 查看 Kubernetes ServiceAccount Token 过期时间
kubectl get secret -n my-namespace my-sa-token -o jsonpath='{.data.token}' | base64 -d | cut -d. -f2 | base64 -d | jq '.exp'
```

---

### 12.4.4 YAML 解析错误

#### 解决的问题

Python 脚本解析 Kubernetes 或 Helm 生成的 YAML 时，因缩进错误、特殊字符（`!`、`|`、`>`）、锚点（`&`、`*`）或大文件导致 `yaml.parser.ParserError` 或 `yaml.scanner.ScannerError`。

#### 核心原理

YAML 对缩进敏感，且支持锚点、标签、多行字符串等复杂语法。Python 的 `PyYAML` 默认使用 `Loader`（不安全），`CSafeLoader` 性能更好但不支持所有 YAML 1.2 特性。Helm 模板渲染后的 YAML 可能包含 `{{ }}` 残留或缩进错误。

#### 代码/配置实现

```python
# scripts/yaml_utils.py — 健壮的 YAML 解析器
import yaml
import logging
from typing import Any, Iterator

logger = logging.getLogger(__name__)

class SafeYAMLParser:
    @staticmethod
    def safe_load(path: str) -> Any:
        """安全加载 YAML 文件，带详细错误信息"""
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            return yaml.safe_load(content)
        except yaml.YAMLError as e:
            if hasattr(e, "problem_mark"):
                mark = e.problem_mark
                logger.error(
                    f"YAML parse error at line {mark.line + 1}, "
                    f"column {mark.column + 1}: {e.problem}"
                )
                # 打印错误上下文
                with open(path, "r") as f:
                    lines = f.readlines()
                start = max(0, mark.line - 2)
                end = min(len(lines), mark.line + 3)
                for i in range(start, end):
                    prefix = ">>>" if i == mark.line else "   "
                    logger.error(f"{prefix} {i + 1}: {lines[i].rstrip()}")
            raise

    @staticmethod
    def safe_load_all(path: str) -> Iterator[Any]:
        """加载多文档 YAML（如 Helm 渲染结果）"""
        try:
            with open(path, "r", encoding="utf-8") as f:
                for doc in yaml.safe_load_all(f):
                    if doc is not None:
                        yield doc
        except yaml.YAMLError as e:
            logger.error(f"Multi-doc YAML parse error: {e}")
            raise

    @staticmethod
    def validate_yaml(content: str) -> bool:
        """验证 YAML 字符串是否合法"""
        try:
            yaml.safe_load(content)
            return True
        except yaml.YAMLError:
            return False

    @staticmethod
    def lint_yaml(path: str) -> list:
        """YAML lint 检查，返回所有问题列表"""
        issues = []
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        for i, line in enumerate(lines, 1):
            stripped = line.rstrip("\n")
            # 检查混用 tab 和空格
            if "\t" in stripped:
                issues.append(f"Line {i}: Tab character found")
            # 检查行尾多余空格
            if stripped != stripped.rstrip():
                issues.append(f"Line {i}: Trailing whitespace")
            # 检查缩进不一致
            if stripped.startswith(" ") and len(stripped) - len(stripped.lstrip()) % 2 != 0:
                issues.append(f"Line {i}: Odd indentation (not multiple of 2)")

        return issues
```

```python
# scripts/validate_helm_output.py — 验证 Helm 渲染结果
from yaml_utils import SafeYAMLParser
import subprocess
import sys

def validate_helm_template(chart_path: str, values_file: str) -> None:
    """验证 Helm 渲染后的 YAML 是否合法"""
    result = subprocess.run(
        ["helm", "template", "test-release", chart_path,
         "--values", values_file],
        capture_output=True, text=True,
    )

    if result.returncode != 0:
        print(f"Helm template error: {result.stderr}")
        sys.exit(1)

    # 将 Helm 输出写入临时文件并逐文档解析
    with open("/tmp/helm_output.yaml", "w") as f:
        f.write(result.stdout)

    parser = SafeYAMLParser()
    doc_count = 0
    for doc in parser.safe_load_all("/tmp/helm_output.yaml"):
        doc_count += 1
        kind = doc.get("kind", "unknown")
        name = doc.get("metadata", {}).get("name", "unknown")
        print(f"  ✓ {kind}/{name}")

    print(f"\nTotal: {doc_count} resources, all valid YAML")
```

#### 使用场景

- CI 中 Python 脚本解析 `helm template` 输出以提取镜像列表或资源名称
- 动态生成或修改 Kubernetes YAML 后验证其合法性

#### 潜在风险与注意事项

- `yaml.safe_load` 不支持 YAML 1.2 的 `!!str` 等显式标签，需使用 `yaml.full_load` 或 `yaml.load(..., Loader=yaml.CSafeLoader)`
- 大 YAML 文件（>100MB）建议使用流式解析 `yaml.safe_load_all` 逐文档处理
- Helm 模板中的 `{{ }}` 若未正确渲染，会作为字面量出现在 YAML 中，导致解析失败

#### 诊断命令

```bash
# 使用 Python 验证 YAML 语法
python -c "import yaml; yaml.safe_load(open('deployment.yaml'))"

# 使用 yamllint 检查格式
yamllint -d "{extends: relaxed, rules: {line-length: {max: 200}}}" deployment.yaml

# 查看 Helm 渲染后的原始 YAML
helm template my-release ./chart --debug > /tmp/rendered.yaml

# 使用 kubectl 验证 YAML
kubectl apply --validate=true --dry-run=client -f /tmp/rendered.yaml

# 使用 Python 逐文档解析 Helm 输出
python -c "
import yaml
with open('/tmp/rendered.yaml') as f:
    for i, doc in enumerate(yaml.safe_load_all(f)):
        if doc:
            print(f'Doc {i}: {doc.get(\"kind\")}/{doc.get(\"metadata\",{}).get(\"name\")}')
"
```

---

### 12.4.5 Git 冲突

#### 解决的问题

Python 自动化脚本在执行 Git 操作（如推送更新后的 manifests、创建 PR、合并分支）时遇到冲突，导致 GitOps 仓库状态不一致或 CI 管道失败。

#### 核心原理

GitOps 工作流中，Python 脚本通常负责：从 Helm 渲染 manifests → 写入 Git 仓库 → 提交并推送。当多个管道同时操作同一仓库，或脚本在未同步的状态下执行推送时，会触发 `merge conflict` 或 `non-fast-forward` 错误。

#### 代码/配置实现

```python
# scripts/git_ops.py — 安全的 Git 操作封装
import subprocess
import logging
import os
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

class GitOps:
    def __init__(self, repo_path: str, branch: str = "main"):
        self.repo_path = Path(repo_path)
        self.branch = branch

    def _git(self, args: List[str]) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git"] + args,
            cwd=self.repo_path,
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
        )

    def sync_and_push(
        self,
        file_paths: List[str],
        commit_message: str,
    ) -> None:
        """安全地同步远程变更并推送"""
        # 1. 暂存本地变更
        self._git(["stash", "--include-untracked"])

        try:
            # 2. 拉取最新远程变更
            self._git(["fetch", "origin", self.branch])

            # 3. 重置到远程分支
            self._git(["reset", "--hard", f"origin/{self.branch}"])

            # 4. 恢复暂存的变更
            stash_result = subprocess.run(
                ["git", "stash", "pop"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if stash_result.returncode != 0:
                if "conflict" in stash_result.stderr.lower():
                    # 处理冲突：保留本地版本
                    logger.warning("Merge conflict detected, resolving...")
                    self._resolve_conflicts(file_paths)
                    self._git(["add", "."])
                    self._git(
                        ["commit", "-m", "Auto-resolve merge conflicts"]
                    )

            # 5. 添加并提交
            self._git(["add"] + file_paths)
            self._git(["commit", "-m", commit_message])

            # 6. 推送（带重试）
            self._push_with_retry()

        except subprocess.CalledProcessError as e:
            logger.error(f"Git operation failed: {e.stderr}")
            raise
        finally:
            # 清理 stash
            self._git(["stash", "drop"])

    def _resolve_conflicts(self, file_paths: List[str]) -> None:
        """使用本地版本解决冲突"""
        for path in file_paths:
            full_path = self.repo_path / path
            if full_path.exists():
                self._git(["checkout", "--ours", path])

    def _push_with_retry(self, max_retries: int = 3) -> None:
        """带重试的推送（处理非快进冲突）"""
        for attempt in range(max_retries):
            try:
                self._git(["push", "origin", self.branch])
                return
            except subprocess.CalledProcessError as e:
                if "non-fast-forward" in e.stderr:
                    logger.warning(
                        f"Non-fast-forward push, retrying "
                        f"({attempt + 1}/{max_retries})"
                    )
                    self._git(["pull", "--rebase", "origin", self.branch])
                else:
                    raise
        raise RuntimeError(
            f"Failed to push after {max_retries} retries"
        )

    def create_pr(
        self,
        title: str,
        body: str,
        base_branch: str = "main",
    ) -> str:
        """创建 Pull Request 并返回 URL"""
        # 创建新分支
        feature_branch = f"auto/{int(__import__('time').time())}"
        self._git(["checkout", "-b", feature_branch])
        self._git(["add", "."])
        self._git(["commit", "-m", title])
        self._git(["push", "origin", feature_branch])

        # 使用 gh CLI 创建 PR
        result = subprocess.run(
            [
                "gh", "pr", "create",
                "--title", title,
                "--body", body,
                "--base", base_branch,
                "--head", feature_branch,
            ],
            capture_output=True, text=True, check=True, timeout=30,
        )
        return result.stdout.strip()
```

#### 使用场景

- Python 脚本自动更新 GitOps 仓库中的 manifests 并推送
- 多团队同时向同一 GitOps 仓库提交变更

#### 潜在风险与注意事项

- `git stash` 在冲突时返回非零退出码，需妥善处理
- 使用 `--rebase` 时若冲突无法自动解决，rebase 会中止并保留中间状态
- 频繁的 `git push --force` 会丢失远程变更，应严格禁止

#### 诊断命令

```bash
# 查看 Git 冲突状态
git status
git diff --name-only --diff-filter=U

# 查看冲突内容
git diff HEAD...origin/main -- manifests/

# 手动解决冲突
git mergetool

# 查看推送历史
git reflog --date=iso

# 检查远程分支状态
git fetch origin
git log --oneline HEAD..origin/main

# 使用 gh CLI 查看 PR 冲突
gh pr view --json body,headRefName,baseRefName,mergeable
```

---

### 12.4.6 本章小结

Python 脚本错误的排查路径为：子进程超时 → API 限速 → 凭证过期 → YAML 解析 → Git 冲突。建议所有外部命令调用都设置 `timeout`，所有 API 调用都实现指数退避重试，所有凭证管理都使用自动刷新机制。将 `logging.DEBUG` 级别的日志输出到文件，配合 `SKAFFOLD_DEBUG=1` 环境变量获取完整的调试信息。

---

## 12.5 EKS 集群问题

### 12.5.1 节点组扩缩容

#### 解决的问题

EKS 节点组（Node Group）因资源不足无法调度新 Pod，或 Cluster Autoscaler 未触发扩容，导致 Pod 长时间处于 `Pending` 状态。

#### 核心原理

EKS 节点组使用 Auto Scaling Group（ASG）管理 EC2 实例。Cluster Autoscaler 监控集群中不可调度的 Pod，当检测到因资源不足而 Pending 的 Pod 时，触发 ASG 扩容。扩容延迟通常为 2-5 分钟（EC2 启动 + kubelet 注册）。

#### 代码/配置实现

```yaml
# cluster-autoscaler 部署
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
  namespace: kube-system
spec:
  template:
    spec:
      containers:
        - name: cluster-autoscaler
          image: registry.k8s.io/autoscaling/cluster-autoscaler:v1.28.1
          command:
            - ./cluster-autoscaler
            - --v=4
            - --stderrthreshold=info
            - --cloud-provider=aws
            - --skip-nodes-with-local-storage=false
            - --expander=least-waste
            - --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled
            - --balance-similar-node-groups
            - --skip-nodes-with-system-pods=false
          env:
            - name: AWS_REGION
              value: ap-northeast-1
```

```bash
# 手动触发节点组扩容（紧急情况）
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name "eks-ng-1-xxxxx" \
  --desired-capacity 5 \
  --honor-cooldown

# 查看 ASG 活动
aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name "eks-ng-1-xxxxx"
```

#### 使用场景

- 部署新应用时 Pod 因 CPU/内存不足而 Pending
- 突发流量导致 Pod 数激增，现有节点无法容纳

#### 潜在风险与注意事项

- Cluster Autoscaler 不会缩减运行关键系统组件的节点
- ASG 的 `max-size` 限制了最大节点数，需根据业务峰值合理设置
- 缩容时 PodDisruptionBudget 可能阻止节点排空
- EC2 实例类型在特定可用区可能库存不足，建议使用多个可用区和实例类型

#### 诊断命令

```bash
# 查看 Cluster Autoscaler 日志
kubectl logs -n kube-system -l app.kubernetes.io/name=cluster-autoscaler --tail=50

# 查看不可调度的 Pod
kubectl get pods --all-namespaces --field-selector=status.phase=Pending

# 查看 Pod 不可调度的原因
kubectl describe pod <pending-pod> | grep -A 10 Events

# 查看节点资源使用
kubectl top nodes

# 查看 ASG 状态
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "eks-ng-1-xxxxx" \
  --query "AutoScalingGroups[0].[MinSize,MaxSize,DesiredCapacity,Instances[*].InstanceId]"

# 查看 EC2 实例类型库存
aws ec2 describe-instance-type-offerings \
  --location-type availability-zone \
  --filters "Name=instance-type,Values=t3.medium" \
  --region ap-northeast-1
```

---

### 12.5.2 Pod Pending（资源/亲和性）

#### 解决的问题

Pod 因资源请求超出节点可用容量、节点亲和性/反亲和性规则不满足、或容忍度（Toleration）不匹配而持续处于 `Pending` 状态。

#### 核心原理

Kubernetes 调度器（kube-scheduler）在调度 Pod 时依次检查：节点资源是否满足 Pod 的 `requests`、节点选择器（`nodeSelector`）和亲和性规则是否匹配、容忍度是否覆盖节点污点（Taint）。任一条件不满足则 Pod 保持 Pending。

#### 代码/配置实现

```yaml
# deployment.yaml — 合理的资源请求和亲和性配置
spec:
  template:
    spec:
      containers:
        - name: my-app
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 1
              memory: 1Gi
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: my-app
                topologyKey: kubernetes.io/hostname
      tolerations:
        - key: "dedicated"
          operator: "Equal"
          value: "my-app"
          effect: "NoSchedule"
```

```bash
# 查看节点污点
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.taints}{"\n"}{end}'

# 查看节点资源容量
kubectl describe node <node-name> | grep -A 5 "Capacity"

# 查看节点已分配资源
kubectl describe node <node-name> | grep -A 10 "Allocated resources"
```

#### 使用场景

- 新部署的 Pod 始终 Pending，但集群中有空闲节点
- 使用 `nodeSelector` 或 `affinity` 将 Pod 调度到特定节点组

#### 潜在风险与注意事项

- `requiredDuringSchedulingIgnoredDuringExecution` 是硬约束，不满足则 Pod 永远无法调度
- `preferredDuringSchedulingIgnoredDuringExecution` 是软约束，不满足时 Pod 仍可调度到其他节点
- 节点上的 `kubelet` 预留资源（`--system-reserved` 和 `--kube-reserved`）会从总容量中扣除

#### 诊断命令

```bash
# 查看调度器日志
kubectl logs -n kube-system -l component=kube-scheduler --tail=50

# 查看 Pod 调度事件
kubectl get events --sort-by='.lastTimestamp' | grep -i "failedScheduling\|triggeredScaleUp"

# 模拟调度（查看调度器决策）
kubectl create -f pod.yaml --dry-run=server -o json 2>&1

# 查看节点可用资源
kubectl describe node <node-name> | grep -E "^\s+(cpu|memory)"

# 检查 Pod 的调度约束
kubectl get pod <pod-name> -o jsonpath='{.spec.affinity}' | python -m json.tool

# 查看节点标签
kubectl get nodes --show-labels
```

---

### 12.5.3 负载均衡器预置

#### 解决的问题

Service 类型为 `LoadBalancer` 时，AWS Load Balancer Controller 创建 ALB/NLB 失败或超时，导致 Service 的 `EXTERNAL-IP` 一直处于 `<pending>` 状态。

#### 核心原理

AWS Load Balancer Controller 监听 Service 和 Ingress 资源的变化，通过 AWS API 创建和管理 ALB/NLB。创建过程涉及：安全组规则、目标组注册、监听器配置、DNS 记录。任一环节失败（如子网缺少 `kubernetes.io/role/elb` 标签）都会导致预置失败。

#### 代码/配置实现

```yaml
# service.yaml — LoadBalancer Service
apiVersion: v1
kind: Service
metadata:
  name: my-app
  annotations:
    # 指定使用 NLB（网络负载均衡器）
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    # 跨可用区负载均衡
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
    # 健康检查路径
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-path: "/health"
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
  selector:
    app: my-app
```

```yaml
# ingress.yaml — ALB Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/subnets: subnet-xxx,subnet-yyy
spec:
  rules:
    - host: my-app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app
                port:
                  number: 80
```

#### 使用场景

- 新部署的服务需要对外暴露，但 `EXTERNAL-IP` 一直 Pending
- Ingress 创建后返回 503 或 404

#### 潜在风险与注意事项

- 子网必须带有 `kubernetes.io/role/elb`（公有子网）或 `kubernetes.io/role/internal-elb`（私有子网）标签
- ALB 创建需要至少两个不同可用区的子网
- 安全组必须允许负载均衡器与目标 Pod 之间的流量
- NLB 的 `target-type: instance` 要求 NodePort 端口在安全组中开放

#### 诊断命令

```bash
# 查看 Service 事件
kubectl describe svc my-app

# 查看 Ingress 事件
kubectl describe ingress my-app

# 查看 AWS Load Balancer Controller 日志
kubectl logs -n kube-system -l app.aws-load-balancer-controller --tail=100

# 检查子网标签
aws ec2 describe-subnets --subnet-ids subnet-xxx \
  --query "Subnets[0].Tags"

# 检查安全组规则
aws ec2 describe-security-groups \
  --group-ids sg-xxxxx \
  --query "SecurityGroups[0].IpPermissions"

# 查看 ALB 状态
aws elbv2 describe-load-balancers --names "k8s-*"

# 查看目标组健康状态
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:...:targetgroup/...
```

---

### 12.5.4 IRSA 权限

#### 解决的问题

使用 IAM Roles for Service Accounts（IRSA）为 Pod 授予 AWS 权限时，因 OIDC 提供商配置错误、信任策略不匹配或 ServiceAccount annotation 缺失导致 Pod 无法获取 AWS 凭证。

#### 核心原理

IRSA 的工作原理：Pod 的 ServiceAccount 通过 `eks.amazonaws.com/role-arn` annotation 关联 IAM 角色。AWS IAM 的信任策略允许 OIDC 提供商（EKS 集群的 OIDC 端点）代入该角色。kubelet 在 Pod 启动时将 AWS 临时凭证（通过 STS AssumeRoleWithWebIdentity）注入到 Pod 的 `/var/run/secrets/eks.amazonaws.com/serviceaccount/token`。

#### 代码/配置实现

```yaml
# service-account.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app
  namespace: my-namespace
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/my-app-role
```

```json
// IAM 角色信任策略
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789:oidc-provider/oidc.eks.ap-northeast-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B716D3041E"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.ap-northeast-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B716D3041E:sub": "system:serviceaccount:my-namespace:my-app",
          "oidc.eks.ap-northeast-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B716D3041E:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

```python
# scripts/verify_irsa.py — 验证 IRSA 配置
import subprocess
import json
import sys

def verify_irsa(namespace: str, service_account: str):
    """验证 IRSA 配置是否正确"""
    # 1. 检查 ServiceAccount annotation
    result = subprocess.run(
        ["kubectl", "get", "sa", service_account, "-n", namespace,
         "-o", "jsonpath={.metadata.annotations.eks\\.amazonaws\\.com/role-arn}"],
        capture_output=True, text=True,
    )
    role_arn = result.stdout.strip()
    if not role_arn:
        print("✗ ServiceAccount missing eks.amazonaws.com/role-arn annotation")
        sys.exit(1)
    print(f"✓ ServiceAccount role-arn: {role_arn}")

    # 2. 检查 OIDC 提供商
    cluster_name = subprocess.run(
        ["kubectl", "config", "current-context"],
        capture_output=True, text=True,
    ).stdout.strip()
    result = subprocess.run(
        ["aws", "eks", "describe-cluster", "--name", cluster_name,
         "--query", "cluster.identity.oidc.issuer",
         "--output", "text"],
        capture_output=True, text=True,
    )
    oidc_issuer = result.stdout.strip()
    print(f"✓ OIDC Issuer: {oidc_issuer}")

    # 3. 检查 IAM 信任策略
    role_name = role_arn.split("/")[-1]
    result = subprocess.run(
        ["aws", "iam", "get-role", "--role-name", role_name,
         "--query", "Role.AssumeRolePolicyDocument"],
        capture_output=True, text=True,
    )
    trust_policy = json.loads(result.stdout)
    print(f"✓ IAM Role: {role_name}")
    print(f"  Trust Policy: {json.dumps(trust_policy, indent=2)}")

    # 4. 测试凭证获取
    result = subprocess.run(
        ["kubectl", "run", "irsa-test", "--image=amazon/aws-cli",
         "--restart=Never", "--rm", "-it",
         "--overrides={\"spec\":{\"serviceAccountName\":\"" + service_account + "\"}}",
         "--", "aws", "sts", "get-caller-identity"],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode == 0:
        print(f"✓ IRSA working: {result.stdout.strip()}")
    else:
        print(f"✗ IRSA failed: {result.stderr}")

if __name__ == "__main__":
    verify_irsa("my-namespace", "my-app")
```

#### 使用场景

- Pod 需要访问 S3、DynamoDB、ECR 等 AWS 服务
- 从传统 IAM 角色（节点组角色）迁移到 IRSA

#### 潜在风险与注意事项

- OIDC 提供商 URL 中的 ID 是 EKS 集群的唯一标识，创建后不可更改
- 信任策略中的 `aud` 条件必须为 `sts.amazonaws.com`
- IRSA 凭证默认有效期 15 分钟，AWS SDK 会自动刷新
- 每个 ServiceAccount 只能关联一个 IAM 角色

#### 诊断命令

```bash
# 检查 ServiceAccount annotation
kubectl get sa my-app -n my-namespace -o yaml | grep eks.amazonaws.com

# 检查 OIDC 提供商是否存在
aws iam list-open-id-connect-providers | grep $(aws eks describe-cluster --name my-cluster --query "cluster.identity.oidc.issuer" --output text | cut -d/ -f4)

# 测试 Pod 内凭证
kubectl exec -it <pod-name> -- aws sts get-caller-identity

# 查看 Pod 内的凭证文件
kubectl exec -it <pod-name> -- ls -la /var/run/secrets/eks.amazonaws.com/serviceaccount/

# 检查 IAM 角色信任策略
aws iam get-role --role-name my-app-role --query "Role.AssumeRolePolicyDocument"

# 查看 Pod 环境变量中的 AWS 配置
kubectl exec -it <pod-name> -- env | grep AWS
```

---

### 12.5.5 本章小结

EKS 集群问题的排查路径为：节点资源 → Pod 调度 → 负载均衡器 → IRSA 权限。建议在集群中部署 `cluster-autoscaler` 和 `aws-load-balancer-controller` 并监控其日志。对于 Pod Pending 问题，优先使用 `kubectl describe pod` 查看 Events 字段，它直接给出了不可调度的原因。

---

## 12.6 网络与权限问题

### 12.6.1 VPC/子网配置

#### 解决的问题

Pod 间通信失败、Pod 无法访问外部网络、或负载均衡器无法将流量路由到 Pod，通常由 VPC 子网配置错误引起。

#### 核心原理

EKS 集群的 Pod 网络基于 AWS VPC CNI 插件。Pod 被分配 VPC 子网中的 IP 地址，因此子网的 CIDR 范围、路由表、NAT 网关配置直接影响 Pod 的网络连通性。私有子网需要 NAT 网关才能访问互联网（拉取镜像等）。

#### 代码/配置实现

```yaml
# security-group-policy.yaml — 控制 Pod 安全组
apiVersion: vpcresources.k8s.aws/v1beta1
kind: SecurityGroupPolicy
metadata:
  name: my-app-policy
  namespace: my-namespace
spec:
  podSelector:
    matchLabels:
      app: my-app
  securityGroups:
    groupIds:
      - sg-xxxxx  # 允许 Pod 访问 RDS 的安全组
```

```bash
# 检查子网是否可路由到互联网
aws ec2 describe-route-tables \
  --filters "Name=association.subnet-id,Values=subnet-xxx" \
  --query "RouteTables[0].Routes"

# 检查 NAT 网关状态
aws ec2 describe-nat-gateways \
  --filter "Name=vpc-id,Values=vpc-xxxxx" \
  --query "NatGateways[0].[State,NatGatewayAddresses[0].PublicIp]"
```

#### 使用场景

- Pod 无法拉取外部镜像（`ImagePullBackOff`）
- 跨可用区的 Pod 间通信延迟高或失败
- 负载均衡器将流量路由到 Pod 但连接超时

#### 潜在风险与注意事项

- EKS 集群的子网 CIDR 不能重叠，且需预留足够的 IP 地址（每个 Pod 占用一个 IP）
- 私有子网必须通过 NAT 网关或 VPC 端点访问 AWS 服务
- VPC CNI 的 `WARM_ENI_TARGET` 和 `WARM_IP_TARGET` 配置影响 Pod 启动速度

#### 诊断命令

```bash
# 检查 VPC CNI 配置
kubectl describe configmap -n kube-system amazon-vpc-cni

# 查看 VPC CNI 日志
kubectl logs -n kube-system -l k8s-app=aws-node --tail=50

# 检查 ENI 分配
aws ec2 describe-network-interfaces \
  --filters "Name=vpc-id,Values=vpc-xxxxx" \
  --query "NetworkInterfaces[0].[NetworkInterfaceId,PrivateIpAddress,Status]"

# 测试 Pod 网络连通性
kubectl exec -it <pod-name> -- ping -c 3 8.8.8.8
kubectl exec -it <pod-name> -- nslookup google.com

# 检查子网可用 IP 数
aws ec2 describe-subnets \
  --subnet-ids subnet-xxx \
  --query "Subnets[0].AvailableIpAddressCount"
```

---

### 12.6.2 安全组规则

#### 解决的问题

Pod 无法访问 RDS、ElastiCache 等 AWS 托管服务，或负载均衡器健康检查失败，通常由安全组规则未正确配置引起。

#### 核心原理

AWS 安全组是有状态防火墙，控制进出 ENI（弹性网络接口）的流量。EKS 集群的安全组分为：集群安全组（控制控制平面与工作节点通信）、节点安全组（控制节点间通信）、Pod 安全组（通过 SecurityGroupPolicy 控制 Pod 级流量）。

#### 代码/配置实现

```bash
# 查看 EKS 集群安全组
aws eks describe-cluster --name my-cluster \
  --query "cluster.resourcesVpcConfig.securityGroupIds"

# 查看节点安全组规则
aws ec2 describe-security-groups \
  --group-ids sg-xxxxx \
  --query "SecurityGroups[0].IpPermissions[?FromPort==`443`]"

# 添加安全组规则（允许 Pod 访问 RDS）
aws ec2 authorize-security-group-ingress \
  --group-id sg-rds-sg \
  --protocol tcp \
  --port 5432 \
  --source-group sg-eks-node-sg
```

```yaml
# 使用 SecurityGroupPolicy 允许 Pod 访问 RDS
apiVersion: vpcresources.k8s.aws/v1beta1
kind: SecurityGroupPolicy
metadata:
  name: allow-rds-access
  namespace: my-namespace
spec:
  podSelector:
    matchLabels:
      app: my-app
  securityGroups:
    groupIds:
      - sg-rds-access-sg  # 允许 5432 端口入站
```

#### 使用场景

- 应用日志显示 `connection refused` 或 `connection timed out` 到 RDS/ElastiCache
- ALB 健康检查返回 502/503

#### 潜在风险与注意事项

- 安全组有入站和出站规则，出站规则默认允许所有流量，但企业环境可能限制出站
- 安全组规则有数量上限（每个安全组 60 条入站 + 60 条出站规则）
- 修改安全组规则后立即生效，但已有连接不受影响

#### 诊断命令

```bash
# 测试到 RDS 的网络连通性
kubectl exec -it <pod-name> -- nc -zv my-db.xxxxx.ap-northeast-1.rds.amazonaws.com 5432

# 查看安全组规则详情
aws ec2 describe-security-groups \
  --group-ids sg-xxxxx \
  --query "SecurityGroups[0].IpPermissions"

# 查看节点安全组关联
aws ec2 describe-instances \
  --filters "Name=tag:eks:nodegroup-name,Values=my-ng" \
  --query "Reservations[0].Instances[0].SecurityGroups"

# 使用 VPC Reachability Analyzer 测试路径
aws ec2 create-network-insights-path \
  --source arn:aws:ec2:...:instance/i-xxxxx \
  --destination arn:aws:ec2:...:instance/i-yyyyy \
  --protocol TCP --destination-port 5432
```

---

### 12.6.3 IAM 角色信任策略

#### 解决的问题

AWS 服务（如 Cluster Autoscaler、Load Balancer Controller、External DNS）无法执行其功能，通常因 IAM 角色信任策略或权限策略配置错误。

#### 核心原理

IAM 角色信任策略定义了谁可以代入该角色（Principal），权限策略定义了代入后可以执行哪些操作（Action）。信任策略错误导致 `AssumeRole` 失败，权限策略错误导致 API 调用返回 `AccessDenied`。

#### 代码/配置实现

```json
// Cluster Autoscaler IAM 角色信任策略
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789:oidc-provider/oidc.eks.ap-northeast-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B716D3041E"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.ap-northeast-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B716D3041E:sub": "system:serviceaccount:kube-system:cluster-autoscaler",
          "oidc.eks.ap-northeast-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B716D3041E:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

```json
// Cluster Autoscaler IAM 权限策略
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "autoscaling:DescribeAutoScalingGroups",
        "autoscaling:DescribeAutoScalingInstances",
        "autoscaling:DescribeLaunchConfigurations",
        "autoscaling:DescribeTags",
        "autoscaling:SetDesiredCapacity",
        "autoscaling:TerminateInstanceInAutoScalingGroup",
        "ec2:DescribeLaunchTemplateVersions"
      ],
      "Resource": "*"
    }
  ]
}
```

#### 使用场景

- Cluster Autoscaler 日志显示 `AccessDenied` 或 `AssumeRole` 失败
- 新部署的 AWS Load Balancer Controller 无法创建 ALB

#### 潜在风险与注意事项

- 信任策略中的 `sub` 条件格式为 `system:serviceaccount:<namespace>:<service-account-name>`，区分大小写
- 权限策略应遵循最小权限原则，避免使用 `"Resource": "*"` 的宽松策略
- IAM 策略变更有约 15 秒的传播延迟

#### 诊断命令

```bash
# 模拟 AssumeRole
aws sts assume-role --role-arn "arn:aws:iam::123456789:role/my-app-role" \
  --role-session-name test --duration-seconds 900

# 使用 IAM Access Analyzer 验证策略
aws accessanalyzer validate-policy \
  --policy-type IDENTITY_POLICY \
  --policy-document file://policy.json

# 查看 IAM 角色权限边界
aws iam get-role --role-name my-app-role \
  --query "Role.PermissionsBoundary"

# 查看 IAM 角色附加的策略
aws iam list-attached-role-policies --role-name my-app-role

# 测试特定 API 权限
aws iam simulate-principal-policy \
  --policy-source-arn "arn:aws:iam::123456789:role/my-app-role" \
  --action-names "autoscaling:SetDesiredCapacity" \
  --resource-arns "*"
```

---

### 12.6.4 ServiceAccount Annotation

#### 解决的问题

ServiceAccount 的 `eks.amazonaws.com/role-arn` annotation 拼写错误、格式不正确或指向不存在的 IAM 角色，导致 IRSA 静默失败。

#### 核心原理

kubelet 在 Pod 启动时检查 ServiceAccount 的 annotation。若 annotation 存在且格式正确，kubelet 会通过 OIDC 流程获取 AWS 临时凭证并挂载到 Pod。若 annotation 拼写错误（如 `eks.amazonaws.com/roleArn` 而非 `eks.amazonaws.com/role-arn`），kubelet 会忽略它，Pod 使用节点组角色。

#### 代码/配置实现

```yaml
# 正确的 annotation 格式
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app
  namespace: my-namespace
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/my-app-role
```

```bash
# 验证 annotation 是否正确
kubectl get sa my-app -n my-namespace -o json | jq '.metadata.annotations'

# 检查 annotation 拼写（常见错误）
kubectl get sa my-app -n my-namespace -o json | jq '.metadata.annotations | keys'
# 正确: eks.amazonaws.com/role-arn
# 错误: eks.amazonaws.com/roleArn
# 错误: eks.amazonaws.com/role_arn
# 错误: eks.amazonaws.com/rolearn
```

#### 使用场景

- ServiceAccount 已配置 annotation，但 Pod 内 `aws sts get-caller-identity` 返回节点组角色
- 新创建的 ServiceAccount 未生效

#### 潜在风险与注意事项

- annotation 值必须是完整的 IAM 角色 ARN（`arn:aws:iam::<account-id>:role/<role-name>`）
- ServiceAccount 创建后修改 annotation 只影响新 Pod，已有 Pod 需重建
- 多个 ServiceAccount 可共享同一 IAM 角色，但信任策略中的 `sub` 条件需包含所有 ServiceAccount

#### 诊断命令

```bash
# 检查 ServiceAccount annotation
kubectl get sa my-app -n my-namespace -o yaml | grep -A 2 annotations

# 检查 Pod 使用的 ServiceAccount
kubectl get pod <pod-name> -o jsonpath='{.spec.serviceAccountName}'

# 检查 Pod 内凭证
kubectl exec -it <pod-name> -- sh -c 'cat /var/run/secrets/eks.amazonaws.com/serviceaccount/token | cut -d. -f2 | base64 -d | jq .'

# 重建 Pod 使新 annotation 生效
kubectl rollout restart deployment my-app -n my-namespace

# 查看 Pod 事件中的 IRSA 相关日志
kubectl describe pod <pod-name> | grep -i "eks\|iam\|role"
```

---

### 12.6.5 本章小结

网络与权限问题的排查路径为：VPC 子网 → 安全组 → IAM 信任策略 → ServiceAccount annotation。建议使用 AWS VPC Reachability Analyzer 测试网络路径，使用 IAM Access Analyzer 验证策略，使用 `kubectl describe pod` 查看 IRSA 凭证挂载状态。网络问题通常表现为连接超时，权限问题通常表现为 AccessDenied。

---

## 12.7 诊断命令与脚本

### 12.7.1 Skaffold 诊断

#### 解决的问题

快速定位 Skaffold 配置错误、构建失败或部署异常的根本原因。

#### 核心原理

Skaffold 提供了 `diagnose` 子命令，输出完整的配置解析结果（包括 profile 合并后的最终配置）、依赖图、以及构建和部署的详细计划。

#### 代码/配置实现

```bash
# 输出 Skaffold 的完整诊断信息
skaffold diagnose -v debug > skaffold-diagnose.log

# 查看 Skaffold 的依赖图
skaffold diagnose --yaml | grep -A 10 "dependencies:"

# 检查特定 profile 的配置
skaffold diagnose -p prod -v debug

# 查看 Skaffold 版本和模块信息
skaffold version
skaffold diagnose --modules

# 验证 skaffold.yaml 配置
skaffold config validate
```

```python
# scripts/skaffold_diagnose.py — Skaffold 诊断脚本
import subprocess
import json
import sys
import yaml

def diagnose_skaffold(profile: str = None):
    """运行 Skaffold 诊断并解析结果"""
    cmd = ["skaffold", "diagnose", "--yaml"]
    if profile:
        cmd.extend(["-p", profile])

    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=60
    )

    if result.returncode != 0:
        print(f"Skaffold diagnose failed: {result.stderr}")
        sys.exit(1)

    config = yaml.safe_load(result.stdout)

    # 检查构建配置
    build = config.get("build", {})
    artifacts = build.get("artifacts", [])
    print(f"Build artifacts: {len(artifacts)}")
    for art in artifacts:
        print(f"  - {art['image']} (context: {art.get('context', 'N/A')})")

    # 检查部署配置
    deploy = config.get("deploy", {})
    helm_releases = deploy.get("helm", {}).get("releases", [])
    print(f"Helm releases: {len(helm_releases)}")
    for rel in helm_releases:
        print(f"  - {rel['name']} (chart: {rel.get('chartPath', 'N/A')})")

    # 检查依赖
    deps = config.get("dependencies", [])
    print(f"Dependencies: {len(deps)}")

    return config

if __name__ == "__main__":
    profile = sys.argv[1] if len(sys.argv) > 1 else None
    diagnose_skaffold(profile)
```

---

### 12.7.2 Helm 诊断

#### 解决的问题

查看已部署 release 的完整资源清单、values 值和历史版本，定位部署差异和回滚点。

#### 核心原理

Helm 将 release 信息存储在 Secret 中（`helm.sh/release.v1`）。`helm get` 系列命令从这些 Secret 中提取 manifests、values、notes 等信息，无需重新连接集群。

#### 代码/配置实现

```bash
# 查看 release 的完整 manifests
helm get manifest my-release -n my-namespace > /tmp/manifests.yaml

# 查看 release 的 values（合并后的最终值）
helm get values my-release -n my-namespace -o yaml

# 查看 release 的 values（仅用户覆盖的值）
helm get values my-release -n my-namespace -o yaml --all

# 查看 release 的 notes
helm get notes my-release -n my-namespace

# 查看 release 历史
helm history my-release -n my-namespace

# 查看特定版本的 manifests
helm get manifest my-release --revision 3 -n my-namespace

# 比较两个版本的差异
diff <(helm get manifest my-release --revision 2 -n my-namespace) \
     <(helm get manifest my-release --revision 3 -n my-namespace)
```

```python
# scripts/helm_diagnose.py — Helm 诊断脚本
import subprocess
import yaml
import json
from typing import Optional

def helm_diagnose(release: str, namespace: str, revision: Optional[int] = None):
    """收集 Helm release 的诊断信息"""
    info = {}

    # 获取 release 状态
    result = subprocess.run(
        ["helm", "status", release, "-n", namespace, "-o", "json"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0:
        info["status"] = json.loads(result.stdout)

    # 获取 values
    result = subprocess.run(
        ["helm", "get", "values", release, "-n", namespace, "-o", "yaml"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0:
        info["values"] = yaml.safe_load(result.stdout)

    # 获取历史
    result = subprocess.run(
        ["helm", "history", release, "-n", namespace, "-o", "yaml"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0:
        info["history"] = yaml.safe_load(result.stdout)

    # 获取 manifests
    cmd = ["helm", "get", "manifest", release, "-n", namespace]
    if revision:
        cmd.extend(["--revision", str(revision)])
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0:
        info["manifest_count"] = len([
            d for d in yaml.safe_load_all(result.stdout) if d
        ])

    return info

def compare_releases(
    release: str, namespace: str, rev_a: int, rev_b: int
):
    """比较两个 release 版本的差异"""
    def get_resources(rev: int):
        result = subprocess.run(
            ["helm", "get", "manifest", release, "-n", namespace,
             "--revision", str(rev)],
            capture_output=True, text=True, timeout=30,
        )
        resources = {}
        for doc in yaml.safe_load_all(result.stdout):
            if doc:
                key = f"{doc.get('kind', '')}/{doc.get('metadata', {}).get('name', '')}"
                resources[key] = doc
        return resources

    old_resources = get_resources(rev_a)
    new_resources = get_resources(rev_b)

    added = set(new_resources) - set(old_resources)
    removed = set(old_resources) - set(new_resources)
    common = set(old_resources) & set(new_resources)

    print(f"=== Release {release} revision {rev_a} vs {rev_b} ===")
    print(f"Added resources ({len(added)}):")
    for r in sorted(added):
        print(f"  + {r}")
    print(f"Removed resources ({len(removed)}):")
    for r in sorted(removed):
        print(f"  - {r}")
    print(f"Changed resources:")
    for r in sorted(common):
        if old_resources[r] != new_resources[r]:
            print(f"  ~ {r}")
```

---

### 12.7.3 Python 调试日志

#### 解决的问题

在 Python 自动化脚本中启用详细的调试日志，记录每个步骤的执行时间、输入输出和错误信息，便于定位问题。

#### 核心原理

使用 Python 的 `logging` 模块，结合 `contextlib` 和装饰器，实现自动化的函数调用跟踪、执行时间统计和异常捕获。

#### 代码/配置实现

```python
# scripts/debug_logging.py — 调试日志配置
import logging
import time
import functools
import os
from contextlib import contextmanager
from typing import Optional

# 日志格式
LOG_FORMAT = (
    "%(asctime)s [%(levelname)s] %(name)s.%(funcName)s:%(lineno)d "
    "- %(message)s"
)
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

def setup_logging(
    name: str = "skaffold_gitops",
    level: Optional[str] = None,
    log_file: Optional[str] = None,
) -> logging.Logger:
    """配置日志系统"""
    level = level or os.environ.get("LOG_LEVEL", "INFO").upper()
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level))

    formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)

    # 控制台输出
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(console)

    # 文件输出
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


# 函数调用跟踪装饰器
def trace(logger: Optional[logging.Logger] = None):
    """装饰器：记录函数调用、参数、返回值和执行时间"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            nonlocal logger
            if logger is None:
                logger = logging.getLogger(func.__module__)

            # 记录调用
            arg_str = ", ".join(
                [str(a)[:100] for a in args] +
                [f"{k}={str(v)[:100]}" for k, v in kwargs.items()]
            )
            logger.debug(f"→ {func.__name__}({arg_str})")

            start = time.time()
            try:
                result = func(*args, **kwargs)
                elapsed = time.time() - start
                logger.debug(
                    f"← {func.__name__} completed in {elapsed:.2f}s"
                )
                return result
            except Exception as e:
                elapsed = time.time() - start
                logger.error(
                    f"✗ {func.__name__} failed after {elapsed:.2f}s: {e}"
                )
                raise
        return wrapper
    return decorator


# 上下文管理器：记录代码块的执行时间
@contextmanager
def timed_block(name: str, logger: Optional[logging.Logger] = None):
    """上下文管理器：记录代码块的执行时间"""
    if logger is None:
        logger = logging.getLogger("timed_block")
    start = time.time()
    logger.debug(f"▶ {name}")
    try:
        yield
    finally:
        elapsed = time.time() - start
        logger.debug(f"◼ {name} completed in {elapsed:.2f}s")


# 使用示例
logger = setup_logging(level="DEBUG", log_file="deploy.log")

@trace(logger)
def deploy_application(environment: str, tag: str):
    logger.info(f"Deploying {tag} to {environment}")
    with timed_block("skaffold_build", logger):
        # 构建逻辑
        pass
    with timed_block("helm_deploy", logger):
        # 部署逻辑
        pass
```

```python
# scripts/collect_diagnostics.py — 一键收集所有诊断信息
import subprocess
import sys
from pathlib import Path
from debug_logging import setup_logging, trace, timed_block

logger = setup_logging(level="DEBUG", log_file="diagnostics.log")

@trace(logger)
def collect_skaffold_info():
    subprocess.run(
        ["skaffold", "diagnose", "--yaml"],
        capture_output=True, text=True, check=True, timeout=60,
    )

@trace(logger)
def collect_helm_info(release: str, namespace: str):
    commands = [
        ["helm", "status", release, "-n", namespace],
        ["helm", "get", "values", release, "-n", namespace, "-o", "yaml"],
        ["helm", "history", release, "-n", namespace],
        ["helm", "get", "manifest", release, "-n", namespace],
    ]
    for cmd in commands:
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=30,
            )
            logger.info(f"Command: {' '.join(cmd)}")
            logger.info(f"Output:\n{result.stdout[:2000]}")
            if result.stderr:
                logger.warning(f"Stderr: {result.stderr[:500]}")
        except Exception as e:
            logger.error(f"Command failed: {e}")

@trace(logger)
def collect_k8s_info(namespace: str):
    commands = [
        ["kubectl", "get", "pods", "-n", namespace],
        ["kubectl", "get", "events", "-n", namespace,
         "--sort-by=.lastTimestamp"],
        ["kubectl", "get", "nodes", "-o", "wide"],
        ["kubectl", "describe", "resourcequota", "-n", namespace],
    ]
    for cmd in commands:
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=30,
            )
            logger.info(f"Command: {' '.join(cmd)}")
            logger.info(f"Output:\n{result.stdout[:2000]}")
        except Exception as e:
            logger.error(f"Command failed: {e}")

if __name__ == "__main__":
    release = sys.argv[1] if len(sys.argv) > 1 else "my-release"
    namespace = sys.argv[2] if len(sys.argv) > 2 else "default"

    with timed_block("diagnostics_collection", logger):
        collect_skaffold_info()
        collect_helm_info(release, namespace)
        collect_k8s_info(namespace)

    logger.info("Diagnostics collected. Check diagnostics.log for details.")
```

---

### 12.7.4 本章小结

诊断命令和脚本是故障排查的基础工具。建议将 `skaffold diagnose`、`helm get manifest`、`helm get values` 和 Python 调试日志集成到 CI 管道的失败处理流程中，在每次部署失败时自动收集诊断信息并保存为构建工件。Python 的 `@trace` 装饰器和 `timed_block` 上下文管理器可以零侵入地为现有脚本添加详细的执行跟踪。

---

## 12.8 综合故障排查流程

### 12.8.1 标准化排查步骤

当 Skaffold + Helm + Python GitOps 管道失败时，按以下标准化流程排查：

```
Step 1: 检查 CI 构建日志
  └─ 定位失败阶段（build / deploy / test）
  └─ 查看错误堆栈和退出码

Step 2: 运行诊断命令
  └─ skaffold diagnose -v debug
  └─ helm status <release> --show-resources
  └─ kubectl describe pod <pending-pod>

Step 3: 检查集群状态
  └─ kubectl get events --sort-by='.lastTimestamp'
  └─ kubectl top nodes && kubectl top pods
  └─ kubectl describe quota -n <namespace>

Step 4: 检查网络和权限
  └─ kubectl exec -it <pod> -- nc -zv <service> <port>
  └─ kubectl exec -it <pod> -- aws sts get-caller-identity
  └─ aws ec2 describe-security-groups --group-ids <sg-id>

Step 5: 检查 GitOps 仓库状态
  └─ git status && git log --oneline -5
  └─ git diff HEAD...origin/main
  └─ gh pr view --json mergeable
```

### 12.8.2 常见错误速查表

| 错误信息 | 可能原因 | 诊断命令 | 修复方案 |
|---------|---------|---------|---------|
| `COPY failed: file not found` | Docker 上下文路径错误 | `skaffold build --dry-run` | 修正 `context` 或 `.dockerignore` |
| `unable to push image` | 镜像仓库凭证过期 | `aws ecr get-login-password` | 刷新 ECR 登录令牌 |
| `render error: nil pointer` | Helm 模板引用缺失值 | `helm template --debug` | 添加 `default` 函数或 values 默认值 |
| `no matches for kind` | CRD 未安装 | `kubectl get crd` | 安装 CRD 或使用 `--skip-crds` |
| `exceeded quota` | Namespace 资源配额不足 | `kubectl describe quota` | 调整配额或减少部署资源 |
| `429 Too Many Requests` | API 速率限制 | `kubectl get --raw /metrics` | 实现指数退避重试 |
| `ExpiredToken` | AWS 凭证过期 | `aws sts get-caller-identity` | 刷新 STS 令牌 |
| `Pending` (Pod) | 资源不足或亲和性不匹配 | `kubectl describe pod` | 调整资源请求或节点选择器 |
| `EXTERNAL-IP <pending>` | 负载均衡器创建失败 | `kubectl describe svc` | 检查子网标签和安全组 |
| `AccessDenied` | IAM 权限不足 | `aws iam simulate-principal-policy` | 补充 IAM 策略 |

### 12.8.3 预防性措施

1. **构建阶段**：在 CI 中启用 `skaffold build --cache-artifacts` 加速构建，设置 `--default-repo` 避免标签冲突
2. **部署阶段**：使用 `helm upgrade --atomic --wait --timeout 10m` 确保部署原子性
3. **脚本阶段**：所有外部命令调用设置 `timeout`，所有 API 调用实现重试机制
4. **监控阶段**：部署 Prometheus + Grafana 监控集群资源使用，设置配额告警
5. **审计阶段**：定期使用 `aws iam simulate-principal-policy` 验证 IAM 策略，使用 `kubectl audit` 跟踪 API 调用

---

## 12.9 全章总结

本章系统性地覆盖了 Skaffold + Helm + Python GitOps 工作流中六大类故障的排查方法：

- **Skaffold 构建失败**（12.2）：从 Docker 上下文、Kaniko 集群构建、Cloud Build 权限到镜像标签冲突，覆盖了镜像构建的全链路故障
- **Helm 部署失败**（12.3）：从模板渲染、values 校验、CRD 依赖、资源配额到 Hook 执行，覆盖了 Chart 部署的完整生命周期
- **Python 脚本错误**（12.4）：从子进程超时、API 限速、凭证过期、YAML 解析到 Git 冲突，覆盖了自动化脚本的常见陷阱
- **EKS 集群问题**（12.5）：从节点组扩缩容、Pod 调度、负载均衡器预置到 IRSA 权限，覆盖了 EKS 集群的核心运维场景
- **网络与权限问题**（12.6）：从 VPC 子网、安全组、IAM 信任策略到 ServiceAccount annotation，覆盖了基础设施层的配置错误
- **诊断命令与脚本**（12.7）：提供了可直接复用的诊断命令集和 Python 调试脚本，将排查流程工具化

核心原则：**先诊断后修复，用数据说话**。每次故障都应先收集诊断信息（`skaffold diagnose`、`helm get`、`kubectl describe`），再根据错误信息定位根因，最后实施最小修复。建议将本章的诊断脚本集成到 CI 管道的失败处理钩子中，实现故障信息的自动采集和持久化。
