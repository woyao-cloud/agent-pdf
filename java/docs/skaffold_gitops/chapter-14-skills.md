# 第14章 Skaffold + Helm + Python GitOps 开发者核心技能

## 14.1 概述

本章面向希望在 Kubernetes 生态中高效使用 Skaffold、Helm 和 Python 构建 GitOps 工作流的开发者。我们将从工具原理出发，覆盖从本地开发到生产交付的全链路技能，并提供可直接落地的代码、配置和学习路线图。

---

## 14.2 Helm 技能

### 14.2.1 解决的问题

Helm 是 Kubernetes 的包管理器。没有 Helm 时，管理数十个 YAML 文件面临以下问题：

- 环境差异导致 YAML 重复（dev/staging/prod 各一套）
- 无法版本化发布和回滚
- 缺乏依赖管理（应用 A 依赖 CRD B）
- 团队间无法复用通用的部署模式

Helm 通过 Chart 抽象、模板引擎和仓库机制解决了这些问题。

### 14.2.2 核心原理

Helm 的核心是 **Go 模板引擎 + values 注入**。Chart 结构如下：

```
mychart/
├── Chart.yaml          # 元数据：名称、版本、依赖
├── values.yaml         # 默认值
├── values.schema.json  # 可选的 JSON Schema 校验
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── _helpers.tpl    # 可复用的命名模板
│   └── tests/
│       └── test-connection.yaml
└── charts/             # 依赖的子 Chart（helm dependency 生成）
```

渲染流程：`values.yaml` → 用户覆盖值（`-f` / `--set`）→ 合并 → 注入模板 → 输出 Kubernetes YAML。

### 14.2.3 代码/配置实现

**Chart.yaml 示例：**

```yaml
apiVersion: v2
name: myapp
version: 0.1.0
appVersion: "1.16.0"
description: A production-grade microservice
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

**模板函数实战（templates/deployment.yaml）：**

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
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          ports:
            - containerPort: {{ .Values.service.port }}
          env:
            {{- range $key, $val := .Values.env }}
            - name: {{ $key }}
              value: {{ $val | quote }}
            {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

**_helpers.tpl 命名模板：**

```yaml
{{- define "mychart.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "mychart.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "mychart.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

**values.yaml 分层策略：**

```yaml
# values.yaml（基准层）
replicaCount: 1
image:
  repository: myapp
  tag: ""
service:
  type: ClusterIP
  port: 8080
resources:
  requests:
    cpu: 100m
    memory: 128Mi
env:
  LOG_LEVEL: info
```

```yaml
# values-prod.yaml（环境覆盖层）
replicaCount: 3
image:
  tag: "prod-20240601"
resources:
  requests:
    cpu: 500m
    memory: 512Mi
env:
  LOG_LEVEL: warn
```

**依赖管理命令：**

```bash
# 添加仓库
helm repo add bitnami https://charts.bitnami.com/bitnami

# 更新依赖
helm dependency update mychart/

# 构建依赖（将依赖打包到 charts/ 目录）
helm dependency build mychart/
```

**Helm 测试：**

```yaml
# templates/tests/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "mychart.fullname" . }}-test"
  annotations:
    "helm.sh/hook": test
spec:
  containers:
    - name: wget
      image: busybox
      command: ['wget']
      args: ['{{ include "mychart.fullname" . }}:{{ .Values.service.port }}']
  restartPolicy: Never
```

```bash
# 运行测试
helm test myrelease --namespace myns

# Lint 检查
helm lint mychart/ --strict

# 模板渲染预览（调试用）
helm template myrelease mychart/ -f values-prod.yaml --debug
```

### 14.2.4 使用场景

| 场景 | 推荐做法 |
|------|----------|
| 微服务多环境部署 | 使用 `values-{env}.yaml` 分层覆盖 |
| 依赖中间件（Redis、PG） | 通过 `dependencies` + `condition` 开关 |
| 团队共享 Chart | 推送到 OCI 仓库（`helm push`） |
| 复杂条件逻辑 | 使用 `include` 命名模板而非 `if/else` 嵌套 |

### 14.2.5 潜在风险与注意事项

- **模板调试困难**：使用 `helm template --debug` 和 `helm get manifest` 排查渲染结果
- **values 覆盖顺序**：`--set` > `-f` 传入的文件（后覆盖前）> `values.yaml`
- **依赖版本锁定**：始终使用 `helm dependency update` 生成 `Chart.lock` 并提交到 Git
- **命名模板命名冲突**：命名模板全局可见，建议用 `chartname.funcname` 前缀隔离
- **JSON Schema 校验**：为关键 values 编写 `values.schema.json`，在 CI 中提前拦截错误

### 14.2.6 本章小结

Helm 的核心价值在于 **模板化 + 分层值注入 + 依赖管理**。掌握 `_helpers.tpl` 的命名模板设计、`values.yaml` 的分层策略以及 `helm lint`/`helm test` 的质量门禁，是构建可靠 Chart 的基础。

---

## 14.3 Skaffold 技能

### 14.3.1 解决的问题

在 Kubernetes 开发中，代码变更后的反馈循环极其缓慢：

1. 修改代码 → 重新构建镜像 → 推送到仓库 → 更新 Deployment → 等待 Pod 重启
2. 多微服务项目需要同时管理多个构建和部署流程
3. 本地开发环境与 CI/CD 流程不一致

Skaffold 通过 **自动化的构建-推送-部署流水线** 和 **文件监听热重载** 解决了这些问题。

### 14.3.2 核心原理

Skaffold 的工作流是一个持续循环：

```
文件变更 → 构建（docker/buildpacks/jib） → 推送（可选） → 部署（kubectl/helm/kustomize） → 状态检查 → 文件监听
```

核心概念：

- **Profiles**：不同环境（dev/staging/prod）的配置变体
- **Modules**：多微服务项目的模块化配置
- **Port Forwarding**：自动将服务端口映射到本地
- **File Sync**：无需重建镜像即可同步静态文件到运行中的容器

### 14.3.3 代码/配置实现

**skaffold.yaml 完整示例：**

```yaml
apiVersion: skaffold/v4beta7
kind: Config
metadata:
  name: myapp
build:
  artifacts:
    - image: myapp-api
      context: services/api
      docker:
        dockerfile: Dockerfile
      hooks:
        before:
          - command: ["python", "manage.py", "collectstatic", "--noinput"]
    - image: myapp-worker
      context: services/worker
      docker:
        dockerfile: Dockerfile
  tagPolicy:
    gitCommit: {}
  local:
    push: false
    useDockerCLI: true
deploy:
  helm:
    releases:
      - name: myapp
        chartPath: charts/myapp
        namespace: myapp-dev
        createNamespace: true
        setValues:
          api.image: myapp-api
          worker.image: myapp-worker
        setValueTemplates:
          api.imageTag: "{{ .IMAGE_TAG }}"
          worker.imageTag: "{{ .IMAGE_TAG }}"
portForward:
  - resourceType: deployment
    resourceName: myapp-api
    port: 8080
    localPort: 8080
profiles:
  - name: prod
    build:
      local:
        push: true
      googleCloudBuild: {}
    deploy:
      helm:
        releases:
          - name: myapp
            chartPath: charts/myapp
            namespace: myapp-prod
            createNamespace: true
            valuesFiles:
              - charts/myapp/values-prod.yaml
            setValueTemplates:
              api.imageTag: "{{ .IMAGE_TAG }}"
              worker.imageTag: "{{ .IMAGE_TAG }}"
  - name: debug
    activation:
      - command: debug
    portForward:
      - resourceType: deployment
        resourceName: myapp-api
        port: 5678
        localPort: 5678
```

**多模块配置（monorepo 场景）：**

```yaml
apiVersion: skaffold/v4beta7
kind: Config
metadata:
  name: frontend
build:
  artifacts:
    - image: frontend
      context: frontend
deploy:
  helm:
    releases:
      - name: frontend
        chartPath: charts/frontend
---
apiVersion: skaffold/v4beta7
kind: Config
metadata:
  name: backend
build:
  artifacts:
    - image: backend
      context: backend
deploy:
  helm:
    releases:
      - name: backend
        chartPath: charts/backend
```

**开发循环命令：**

```bash
# 标准开发模式（持续监听）
skaffold dev --port-forward

# 仅构建不部署
skaffold build --file-output build.json

# 运行指定模块
skaffold dev --module backend

# 使用 Profile
skaffold run -p prod

# 调试模式（需语言支持）
skaffold debug

# 渲染最终 YAML
skaffold render --output manifests.yaml
```

**CI 集成脚本：**

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: skaffold/actions/build@v1
        with:
          skaffold-version: "2.10.0"
          file-output: build.json
      - uses: skaffold/actions/deploy@v1
        with:
          build-artifacts: build.json
          profile: prod
```

### 14.3.4 使用场景

| 场景 | 配置要点 |
|------|----------|
| 本地快速开发 | `skaffold dev` + `portForward` + `fileSync` |
| CI 构建 | `skaffold build --file-output` 分离构建与部署 |
| 多环境部署 | Profiles 区分 dev/staging/prod 的 values 和 namespace |
| 调试 Python 应用 | `skaffold debug` 自动注入 debugger 端口 |
| Monorepo 多服务 | Modules 按服务拆分，独立开发 |

### 14.3.5 潜在风险与注意事项

- **镜像标签策略**：`gitCommit` 策略在 CI 中可靠，但本地开发建议用 `inputDigest` 避免标签冲突
- **文件同步限制**：仅适用于静态文件（HTML、CSS），Python 代码变更仍需重建镜像
- **Profile 继承**：Profile 不会自动继承根配置的 `build`/`deploy` 块，需显式定义
- **Helm 版本兼容**：Skaffold 内置 Helm 版本可能落后，通过 `helm.versions` 指定
- **资源清理**：`skaffold dev` 退出时自动清理，但 `skaffold run` 不会，需手动 `skaffold delete`

### 14.3.6 本章小结

Skaffold 的核心价值是 **统一本地开发与 CI/CD 的构建部署流程**。通过 `skaffold.yaml` 的 Profile 和 Module 机制，开发者可以在本地使用 `skaffold dev` 获得秒级反馈，同时在 CI 中使用相同的配置进行生产级部署。

---

## 14.4 Python 自动化技能

### 14.4.1 解决的问题

GitOps 工作流中需要大量自动化脚本：

- 与 Kubernetes API 交互（查询状态、创建资源）
- 管理 AWS 云资源（ECR 镜像、EKS 集群）
- 解析和生成 YAML 配置
- 操作 Git 仓库（提交、PR、标签）
- 编排外部命令（Helm、kubectl、aws CLI）

Python 凭借丰富的库生态成为这些任务的首选语言。

### 14.4.2 核心原理

Python GitOps 自动化的核心模式是 **声明式资源管理 + 命令式编排**：

```
读取配置（YAML/JSON） → 转换/校验 → 调用 API/SDK → 执行外部命令 → 状态报告
```

### 14.4.3 代码/配置实现

**kubernetes-client 实战：**

```python
from kubernetes import client, config, watch
from kubernetes.client.rest import ApiException

def deploy_and_watch(namespace: str, deployment: dict, timeout: int = 300):
    config.load_kube_config()
    apps_v1 = client.AppsV1Api()
    core_v1 = client.CoreV1Api()

    try:
        apps_v1.create_namespaced_deployment(
            namespace=namespace,
            body=deployment,
        )
        print(f"Deployment {deployment['metadata']['name']} created")
    except ApiException as e:
        if e.status == 409:
            apps_v1.patch_namespaced_deployment(
                name=deployment["metadata"]["name"],
                namespace=namespace,
                body=deployment,
            )
            print(f"Deployment {deployment['metadata']['name']} updated")
        else:
            raise

    w = watch.Watch()
    for event in w.stream(
        func=core_v1.list_namespaced_pod,
        namespace=namespace,
        label_selector=f"app={deployment['metadata']['name']}",
        timeout_seconds=timeout,
    ):
        phase = event["object"].status.phase
        name = event["object"].metadata.name
        print(f"Pod {name} phase: {phase}")
        if phase == "Running":
            w.stop()
            return True
    return False
```

**boto3 ECR/EKS 管理：**

```python
import boto3
import json

ecr_client = boto3.client("ecr", region_name="ap-northeast-1")
eks_client = boto3.client("eks", region_name="ap-northeast-1")

def ensure_ecr_repo(repo_name: str):
    try:
        response = ecr_client.create_repository(
            repositoryName=repo_name,
            imageScanningConfiguration={"scanOnPush": True},
            encryptionConfiguration={"encryptionType": "AES256"},
        )
        return response["repository"]["repositoryUri"]
    except ecr_client.exceptions.RepositoryAlreadyExistsException:
        response = ecr_client.describe_repositories(repositoryNames=[repo_name])
        return response["repositories"][0]["repositoryUri"]

def get_eks_cluster_info(cluster_name: str) -> dict:
    response = eks_client.describe_cluster(name=cluster_name)
    cluster = response["cluster"]
    return {
        "endpoint": cluster["endpoint"],
        "version": cluster["version"],
        "status": cluster["status"],
        "subnets": cluster["resourcesVpcConfig"]["subnetIds"],
        "security_groups": cluster["resourcesVpcConfig"]["securityGroupIds"],
    }

def update_kubeconfig(cluster_name: str, region: str = "ap-northeast-1"):
    import subprocess, tempfile, os
    response = eks_client.describe_cluster(name=cluster_name)
    cluster = response["cluster"]

    cert_data = cluster["certificateAuthority"]["data"]
    endpoint = cluster["endpoint"]
    name = f"arn:aws:eks:{region}:{_get_account_id()}:cluster/{cluster_name}"

    kubeconfig = {
        "apiVersion": "v1",
        "kind": "Config",
        "clusters": [{"cluster": {"server": endpoint, "certificate-authority-data": cert_data}, "name": name}],
        "contexts": [{"context": {"cluster": name, "user": name}, "name": name}],
        "current-context": name,
        "users": [{"name": name, "user": {"exec": {
            "apiVersion": "client.authentication.k8s.io/v1beta1",
            "command": "aws",
            "args": ["eks", "get-token", "--cluster-name", cluster_name, "--region", region],
        }}}],
    }
    kubeconfig_path = os.path.expanduser(f"~/.kube/{cluster_name}.yml")
    with open(kubeconfig_path, "w") as f:
        yaml.dump(kubeconfig, f)
    os.environ["KUBECONFIG"] = kubeconfig_path
    return kubeconfig_path

def _get_account_id() -> str:
    sts = boto3.client("sts")
    return sts.get_caller_identity()["Account"]
```

**PyYAML 安全加载与操作：**

```python
import yaml
from yaml.loader import SafeLoader

def load_helm_values(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.load(f, Loader=SafeLoader)

def merge_values(base: dict, overlay: dict) -> dict:
    result = base.copy()
    for key, value in overlay.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = merge_values(result[key], value)
        else:
            result[key] = value
    return result

def dump_helm_values(data: dict, path: str):
    class HelmDumper(yaml.SafeDumper):
        pass
    HelmDumper.add_representer(
        type(None),
        lambda dumper, _: dumper.represent_scalar("tag:yaml.org,2002:null", "null"),
    )
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, Dumper=HelmDumper, default_flow_style=False, sort_keys=False)
```

**GitPython 仓库操作：**

```python
from git import Repo, GitCommandError
import os

class GitOpsRepo:
    def __init__(self, repo_path: str, remote_url: str = None):
        if os.path.exists(repo_path):
            self.repo = Repo(repo_path)
        else:
            self.repo = Repo.clone_from(remote_url, repo_path)
        self.path = repo_path

    def update_manifest(self, env: str, image: str, tag: str):
        values_path = os.path.join(self.path, f"values-{env}.yaml")
        with open(values_path, "r") as f:
            values = yaml.load(f, Loader=yaml.SafeLoader)
        values["image"]["tag"] = tag
        with open(values_path, "w") as f:
            yaml.dump(values, f, default_flow_style=False)

    def commit_and_push(self, message: str, branch: str = "main"):
        try:
            self.repo.git.add(A=True)
            self.repo.index.commit(message)
            origin = self.repo.remote(name="origin")
            origin.push(branch)
        except GitCommandError as e:
            print(f"Git operation failed: {e}")
            raise
```

**subprocess 安全管理：**

```python
import subprocess
import shlex
from typing import List, Optional

def run_helm_upgrade(
    release: str,
    chart: str,
    namespace: str,
    values: List[str] = None,
    timeout: int = 300,
) -> subprocess.CompletedProcess:
    cmd = ["helm", "upgrade", "--install", release, chart,
           "--namespace", namespace, "--create-namespace",
           "--wait", "--timeout", f"{timeout}s"]
    for v in (values or []):
        cmd.extend(["-f", v])
    return _run_cmd(cmd)

def run_kubectl_apply(file_path: str, namespace: str) -> subprocess.CompletedProcess:
    return _run_cmd(["kubectl", "apply", "-f", file_path, "-n", namespace])

def _run_cmd(cmd: List[str], env: dict = None) -> subprocess.CompletedProcess:
    print(f"Running: {' '.join(shlex.quote(c) for c in cmd)}")
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,
        env={**dict(**__import__("os").environ), **(env or {})},
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed (exit {result.returncode}):\n"
            f"STDOUT: {result.stdout}\nSTDERR: {result.stderr}"
        )
    return result
```

**错误处理与重试模式：**

```python
import time
from functools import wraps
from kubernetes.client.rest import ApiException

def retry_on_api_error(max_retries: int = 3, backoff: float = 2.0):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except ApiException as e:
                    if e.status in (429, 500, 502, 503, 504):
                        wait = backoff ** attempt
                        print(f"API error {e.status}, retrying in {wait}s (attempt {attempt + 1})")
                        time.sleep(wait)
                        last_exception = e
                    else:
                        raise
            raise RuntimeError(f"Max retries exceeded") from last_exception
        return wrapper
    return decorator

@retry_on_api_error(max_retries=5)
def ensure_namespace(name: str):
    core_v1 = client.CoreV1Api()
    try:
        core_v1.create_namespace(metadata=client.V1ObjectMeta(name=name))
    except ApiException as e:
        if e.status != 409:
            raise
```

### 14.4.4 使用场景

| 场景 | 推荐库 |
|------|--------|
| 自动化部署脚本 | kubernetes-client + subprocess |
| 镜像仓库管理 | boto3 (ECR) |
| GitOps 仓库同步 | GitPython |
| 配置生成与校验 | PyYAML + JSON Schema |
| CI/CD 管道脚本 | subprocess + retry 模式 |

### 14.4.5 潜在风险与注意事项

- **kubeconfig 管理**：不要在脚本中硬编码 kubeconfig，使用 `config.load_kube_config()` 或环境变量
- **API 限流**：Kubernetes API 有 QPS 限制，使用 `kubernetes.client.Configuration()` 设置 `qps` 和 `burst`
- **YAML 注入攻击**：始终使用 `yaml.safe_load()` 而非 `yaml.load()`
- **子进程超时**：所有 `subprocess.run()` 必须设置 `timeout`，防止死锁
- **幂等性设计**：所有自动化脚本应设计为可重复执行而不产生副作用

### 14.4.6 本章小结

Python 在 GitOps 自动化中的角色是 **胶水代码 + 业务逻辑编排**。kubernetes-client 提供原生 API 交互，boto3 管理 AWS 资源，GitPython 处理版本控制，subprocess 桥接外部工具。关键设计原则是幂等性、重试机制和安全的子进程管理。

---

## 14.5 AWS/EKS 技能

### 14.5.1 解决的问题

在 AWS 上运行 Kubernetes 需要管理一系列基础设施：

- EKS 集群的创建、升级和节点管理
- IAM 权限模型（IRSA：IAM Roles for Service Accounts）
- ECR 镜像仓库的生命周期管理
- CloudWatch 日志和监控
- VPC 网络规划（子网、安全组、NAT）

### 14.5.2 核心原理

EKS 的控制面由 AWS 管理，工作节点运行在用户账户的 EC2 上。IRSA 通过 OIDC 提供商将 Kubernetes ServiceAccount 映射到 AWS IAM Role，实现 Pod 级别的细粒度权限。

```
Pod (ServiceAccount A) → OIDC 令牌 → AWS STS AssumeRoleWithWebIdentity → IAM Role A → S3/DynamoDB
Pod (ServiceAccount B) → OIDC 令牌 → AWS STS AssumeRoleWithWebIdentity → IAM Role B → ECR/SecretsManager
```

### 14.5.3 代码/配置实现

**eksctl 集群创建：**

```yaml
# cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: myapp-prod
  region: ap-northeast-1
  version: "1.29"
vpc:
  cidr: 10.0.0.0/16
  subnets:
    private:
      ap-northeast-1a: { cidr: 10.0.0.0/19 }
      ap-northeast-1c: { cidr: 10.0.32.0/19 }
    public:
      ap-northeast-1a: { cidr: 10.0.64.0/19 }
      ap-northeast-1c: { cidr: 10.0.96.0/19 }
managedNodeGroups:
  - name: standard
    instanceType: m5.large
    desiredCapacity: 3
    minSize: 3
    maxSize: 10
    privateNetworking: true
    ssh:
      allow: false
    labels:
      role: worker
    iam:
      withAddonPolicies:
        autoScaler: true
        cloudWatch: true
        albIngress: true
addons:
  - name: vpc-cni
    version: latest
  - name: coredns
    version: latest
  - name: kube-proxy
    version: latest
  - name: aws-ebs-csi-driver
    version: latest
```

**IRSA 配置：**

```bash
# 创建 OIDC 提供商
eksctl utils associate-iam-oidc-provider --cluster myapp-prod --region ap-northeast-1

# 创建 IAM Role 并关联 ServiceAccount
eksctl create iamserviceaccount \
  --cluster myapp-prod \
  --namespace myapp \
  --name myapp-sa \
  --role-name myapp-role \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
  --approve
```

```yaml
# Kubernetes ServiceAccount（eksctl 自动创建）
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp-sa
  namespace: myapp
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/myapp-role
```

```python
# Python 中使用 IRSA
import boto3

def upload_to_s3(bucket: str, key: str, data: bytes):
    """Pod 内通过 IRSA 自动获取 S3 权限，无需显式凭证"""
    s3 = boto3.client("s3")
    s3.put_object(Bucket=bucket, Key=key, Body=data)
```

**ECR 生命周期策略：**

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 30 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 30
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Expire untagged images after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    }
  ]
}
```

**CloudWatch 结构化日志：**

```python
import watchtower
import logging

def setup_cloudwatch_logging(service_name: str, log_group: str, region: str):
    handler = watchtower.CloudWatchLogHandler(
        log_group=log_group,
        stream_name=service_name,
        send_interval=10,
        create_log_group=True,
    )
    formatter = logging.Formatter(
        '{"time": "%(asctime)s", "level": "%(levelname)s", '
        '"service": "%(name)s", "message": "%(message)s"}'
    )
    handler.setFormatter(formatter)
    logger = logging.getLogger(service_name)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger
```

**VPC 网络最佳实践（Terraform 片段）：**

```hcl
# 私有子网 + NAT Gateway 确保出站流量
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet("10.0.0.0/16", 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
}

resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}
```

### 14.5.4 使用场景

| 场景 | 方案 |
|------|------|
| 创建生产 EKS 集群 | eksctl + managedNodeGroups + 加密 |
| Pod 访问 AWS 服务 | IRSA（避免硬编码 AK/SK） |
| 镜像存储与清理 | ECR + 生命周期策略 |
| 应用日志采集 | CloudWatch + watchtower + 结构化日志 |
| 网络隔离 | 私有子网 + 安全组最小权限规则 |

### 14.5.5 潜在风险与注意事项

- **IRSA 信任策略**：OIDC 的 `sub` 条件必须限定到 namespace 和 ServiceAccount，防止越权
- **EKS 升级**：控制面升级后必须同步升级节点组和附加组件
- **ECR 限流**：频繁推送/拉取可能触发限流，配置 ECR Pull Through Cache
- **CloudWatch 成本**：日志量大会产生高额费用，设置日志保留期和过滤规则
- **VPC 耗尽**：每个子网的 IP 地址有限，使用 `/19` 或更大 CIDR 块

### 14.5.6 本章小结

AWS/EKS 技能的核心是 **IRSA 权限模型 + 基础设施即代码**。eksctl 简化集群创建，IRSA 提供安全的 Pod 级 AWS 访问，ECR 生命周期策略控制镜像存储成本。VPC 网络设计应遵循私有子网 + NAT Gateway 的模式，确保安全性和出站能力。

---

## 14.6 CI/CD 技能

### 14.6.1 解决的问题

从代码提交到生产部署需要经过多个阶段：

- 代码质量检查（lint、类型检查、单元测试）
- 镜像构建与安全扫描
- 集成测试与端到端测试
- 环境 promotion（dev → staging → prod）
- 审批与回滚机制

### 14.6.2 核心原理

GitOps CI/CD 的核心是 **Pull 模型**：

```
开发者提交代码 → CI 构建镜像并更新 Git 仓库中的 manifests → GitOps Operator（ArgoCD/Flux）检测到变更 → 自动同步到目标集群
```

### 14.6.3 代码/配置实现

**GitHub Actions 完整流水线：**

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  AWS_REGION: ap-northeast-1
  ECR_REPOSITORY: myapp
  CLUSTER_NAME: myapp-prod

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install ruff pytest
      - name: Lint
        run: ruff check .
      - name: Type check
        run: pip install pyright && pyright .
      - name: Unit tests
        run: pytest tests/unit --cov=src --cov-report=xml
      - name: Helm lint
        run: helm lint charts/myapp --strict
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  build-and-scan:
    needs: lint-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-role
          aws-region: ${{ env.AWS_REGION }}
      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        uses: skaffold/actions/build@v1
        with:
          skaffold-version: "2.10.0"
          file-output: build.json
          profile: prod
      - name: Scan image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }}
          format: sarif
          output: trivy-results.sarif
          severity: CRITICAL,HIGH
      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif

  deploy-staging:
    needs: build-and-scan
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-role
          aws-region: ${{ env.AWS_REGION }}
      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name ${{ env.CLUSTER_NAME }} --region ${{ env.AWS_REGION }}
      - name: Deploy to staging
        uses: skaffold/actions/deploy@v1
        with:
          build-artifacts: build.json
          profile: staging
      - name: Smoke test
        run: |
          curl -f --retry 10 --retry-delay 5 https://staging.myapp.com/health

  deploy-prod:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://myapp.com
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-role
          aws-region: ${{ env.AWS_REGION }}
      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name ${{ env.CLUSTER_NAME }} --region ${{ env.AWS_REGION }}
      - name: Deploy to production
        uses: skaffold/actions/deploy@v1
        with:
          build-artifacts: build.json
          profile: prod
      - name: Health check
        run: |
          curl -f --retry 10 --retry-delay 5 https://myapp.com/health
```

**Artifact 管理策略：**

```yaml
# 使用 GitHub Artifacts 传递构建产物
- name: Upload build artifacts
  uses: actions/upload-artifact@v4
  with:
    name: skaffold-build
    path: build.json

# 下游 job 下载
- name: Download build artifacts
  uses: actions/download-artifact@v4
  with:
    name: skaffold-build
```

**安全扫描集成：**

```yaml
# Trivy 配置
- name: Scan Helm chart
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: config
    scan-ref: charts/
    format: sarif
    output: trivy-helm.sarif
    severity: CRITICAL,HIGH

# 依赖扫描
- name: Scan Python dependencies
  run: |
    pip install safety
    safety check -r requirements.txt --full-report
```

**测试策略矩阵：**

```python
# tests/test_deployment.py
import pytest
from kubernetes import client, config

@pytest.fixture(scope="module")
def k8s_client():
    config.load_kube_config()
    return client.AppsV1Api()

def test_deployment_replicas(k8s_client):
    dep = k8s_client.read_namespaced_deployment("myapp-api", "myapp-staging")
    assert dep.spec.replicas == 2

def test_deployment_resources(k8s_client):
    dep = k8s_client.read_namespaced_deployment("myapp-api", "myapp-staging")
    container = dep.spec.template.spec.containers[0]
    assert container.resources.requests["cpu"] == "250m"
    assert container.resources.requests["memory"] == "256Mi"

def test_service_exists():
    config.load_kube_config()
    core = client.CoreV1Api()
    svc = core.read_namespaced_service("myapp-api", "myapp-staging")
    assert svc.spec.ports[0].port == 8080

def test_ingress_tls():
    config.load_kube_config()
    networking = client.NetworkingV1Api()
    ing = networking.read_namespaced_ingress("myapp-ingress", "myapp-staging")
    assert ing.spec.tls is not None
```

### 14.6.4 使用场景

| 场景 | 实现 |
|------|------|
| PR 验证 | lint + test + helm lint + trivy config scan |
| 主分支构建 | 构建镜像 + 安全扫描 + 推送到 ECR |
| 环境 promotion | staging 自动部署 → prod 手动审批 |
| 回滚 | `helm rollback` + Git revert |
| 依赖更新 | Dependabot + `helm dependency update` |

### 14.6.5 潜在风险与注意事项

- **Secret 管理**：使用 GitHub Environments 的 Secrets 而非 Repository Secrets，实现环境级隔离
- **构建缓存**：Docker 层缓存可大幅加速构建，使用 `docker/build-push-action` 的 cache-from/cache-to
- **并发部署**：使用 GitHub Deployment 保护规则防止并发部署到同一环境
- **审批超时**：生产环境审批应在 24 小时内完成，超时自动关闭
- **回滚策略**：始终保留最近 N 个版本的 Helm release，确保快速回滚

### 14.6.6 本章小结

CI/CD 的核心是 **质量门禁 + 环境 promotion**。GitHub Actions 通过 job 依赖和 environment 审批实现从 lint → build → scan → staging → prod 的完整流水线。关键实践包括：构建产物传递、安全扫描集成、环境级 secret 隔离和自动化回滚能力。

---

## 14.7 学习路线图

### 14.7.1 解决的问题

Skaffold + Helm + Python GitOps 涉及的工具链庞大，初学者容易迷失方向。本节提供分阶段的学习路径，帮助开发者系统性地掌握所需技能。

### 14.7.2 核心原理

学习路线遵循 **广度优先 → 深度优先 → 跨领域整合** 的螺旋上升模式：

```
第一阶段（广度）：掌握每个工具的核心用法
第二阶段（深度）：理解每个工具的原理和最佳实践
第三阶段（整合）：将工具链串联为完整的 GitOps 工作流
```

### 14.7.3 学习路径

**第一阶段：入门（1-3 个月）**

目标：能独立完成一个微服务的 Helm 部署和 Python 自动化脚本。

| 周次 | 学习内容 | 实践项目 |
|------|----------|----------|
| 1-2 | Kubernetes 基础：Pod、Deployment、Service、ConfigMap、Secret | 在 minikube 上部署 Nginx |
| 3-4 | Helm 基础：Chart 结构、模板语法、values 注入 | 将 Nginx 部署转换为 Helm Chart |
| 5-6 | Helm 进阶：命名模板、依赖管理、helm lint/test | 编写包含 Redis 依赖的多服务 Chart |
| 7-8 | Python 基础：kubernetes-client 核心 API | 编写脚本查询集群 Pod 状态 |
| 9-10 | Python 自动化：PyYAML + subprocess | 编写自动更新 values.yaml 的脚本 |
| 11-12 | 综合项目 | 用 Helm 部署一个 Flask 应用 + Python 自动化脚本 |

**关键资源：**

- 官方 Helm 文档（helm.sh/docs）
- Kubernetes Python Client 示例（github.com/kubernetes-client/python）
- 《Kubernetes in Action》第二版

**第二阶段：中级（3-6 个月）**

目标：能使用 Skaffold 进行本地开发，管理 EKS 集群，设计 CI/CD 流水线。

| 周次 | 学习内容 | 实践项目 |
|------|----------|----------|
| 1-2 | Skaffold 基础：skaffold.yaml、dev/run 模式 | 用 Skaffold 开发上阶段的 Flask 应用 |
| 3-4 | Skaffold 进阶：Profiles、Modules、Port Forwarding | 配置多 Profile 的 monorepo 项目 |
| 5-6 | AWS 基础：VPC、IAM、EC2 基础概念 | 用 AWS Console 创建 VPC 和安全组 |
| 7-8 | EKS 集群管理：eksctl、节点组、附加组件 | 创建 EKS 集群并部署应用 |
| 9-10 | IRSA + ECR：ServiceAccount 权限映射 | 配置 Pod 访问 S3 和 ECR |
| 11-12 | GitHub Actions 基础：workflow、job、step | 编写 lint + test + build 流水线 |
| 13-14 | CI/CD 进阶：环境 promotion、artifact 传递 | 设计 staging → prod 多环境流水线 |
| 15-16 | 综合项目 | 完整的 Skaffold + Helm + EKS CI/CD |

**关键资源：**

- Skaffold 官方文档（skaffold.dev）
- eksctl 官方文档（eksctl.io）
- GitHub Actions 文档（docs.github.com/actions）
- AWS EKS 最佳实践指南

**第三阶段：高级（6-12 个月）**

目标：能设计多环境 GitOps 策略，实现渐进式交付，保障生产安全。

| 模块 | 学习内容 | 实践项目 |
|------|----------|----------|
| 多环境管理 | 环境命名空间隔离、values 分层策略、Sealed Secrets | 设计 4 层环境（dev/staging/prod/dr） |
| 渐进式交付 | ArgoCD Rollouts、蓝绿部署、金丝雀发布 | 实现基于流量权重的金丝雀发布 |
| 安全加固 | OPA/Gatekeeper 策略、Kyverno、Pod Security Standards | 编写集群安全策略 |
| 可观测性 | Prometheus + Grafana、OpenTelemetry、CloudWatch 告警 | 部署监控栈并配置告警规则 |
| 成本优化 | Karpenter 自动扩缩、ECR 生命周期、Spot 实例 | 配置 Karpenter 并分析成本 |
| 灾难恢复 | Velero 备份、跨区域复制、etcd 备份 | 设计跨区域灾备方案 |
| 平台工程 | Backstage/Port 开发者门户、Internal Developer Platform | 构建内部开发者平台 |

**高级实践项目：**

```yaml
# 金丝雀发布配置（ArgoCD Rollouts）
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: myapp-canary
spec:
  replicas: 5
  strategy:
    canary:
      steps:
        - setWeight: 20
        - pause: { duration: 5m }
        - setWeight: 50
        - pause: { duration: 10m }
        - setWeight: 80
        - pause: { duration: 5m }
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: myapp:latest
```

```python
# 多环境 promotion 自动化
class EnvironmentPromoter:
    def __init__(self, repo_path: str):
        self.repo = GitOpsRepo(repo_path)

    def promote(self, from_env: str, to_env: str, image_tag: str):
        print(f"Promoting {image_tag} from {from_env} to {to_env}")
        self.repo.update_manifest(to_env, "myapp", image_tag)
        self.repo.commit_and_push(
            f"chore: promote {image_tag} from {from_env} to {to_env}",
            branch=f"promote/{to_env}",
        )
        # 创建 PR 等待审批
        self._create_pull_request(to_env, image_tag)

    def _create_pull_request(self, env: str, tag: str):
        import subprocess
        subprocess.run([
            "gh", "pr", "create",
            "--title", f"Promote {tag} to {env}",
            "--body", f"Automated promotion of {tag} to {env}",
            "--base", "main",
        ], check=True)
```

### 14.7.4 使用场景

| 阶段 | 适合人群 | 产出能力 |
|------|----------|----------|
| 入门 | 1-3 年经验的开发者 | 独立完成 Helm Chart 开发和 Python 自动化 |
| 中级 | 3-5 年经验的 DevOps/SRE | 设计 CI/CD 流水线，管理 EKS 集群 |
| 高级 | 5+ 年经验的技术负责人 | 设计 GitOps 平台，制定组织级最佳实践 |

### 14.7.5 潜在风险与注意事项

- **不要同时学习所有工具**：按阶段聚焦，每个阶段掌握 2-3 个工具
- **实践优先**：每个知识点必须有对应的动手项目，避免"看过就忘"
- **关注版本变化**：Kubernetes 和 AWS 服务更新频繁，以官方文档为准
- **建立知识库**：将踩过的坑和解决方案记录到团队 Wiki 中
- **社区参与**：关注 Skaffold、Helm、ArgoCD 的 GitHub Issues 和 Slack 频道

### 14.7.6 本章小结

学习路线图的核心是 **分阶段、重实践、螺旋上升**。入门阶段聚焦 Helm + Python 基础，中级阶段加入 Skaffold + EKS + CI/CD，高级阶段深入渐进式交付、安全加固和平台工程。每个阶段都应有明确的实践项目作为产出物。

---

## 14.8 综合实战：端到端 GitOps 工作流

### 14.8.1 工作流全景

```
开发者提交代码
    ↓
GitHub Actions CI
  ├── ruff lint + pyright type check
  ├── pytest 单元测试
  ├── helm lint + trivy config scan
  ├── skaffold build → ECR
  └── trivy image scan
    ↓
GitOps 仓库更新（自动 PR）
    ↓
ArgoCD 检测到变更
  ├── dev 环境：自动同步
  ├── staging 环境：自动同步 + smoke test
  └── prod 环境：手动审批 + 金丝雀发布
    ↓
CloudWatch + Prometheus 监控
```

### 14.8.2 关键脚本

```python
# deploy_pipeline.py — 完整的部署编排
import argparse
import yaml
from gitops import GitOpsRepo, run_helm_upgrade, ensure_namespace
from kubernetes import config, client

def main():
    parser = argparse.ArgumentParser(description="GitOps Deployment Pipeline")
    parser.add_argument("--env", required=True, choices=["dev", "staging", "prod"])
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--chart-path", default="charts/myapp")
    parser.add_argument("--git-repo", default="gitops-manifests")
    args = parser.parse_args()

    config.load_kube_config()

    # 1. 确保命名空间存在
    ensure_namespace(f"myapp-{args.env}")

    # 2. 更新 GitOps 仓库中的 values
    repo = GitOpsRepo(args.git_repo)
    repo.update_manifest(args.env, "myapp", args.image_tag)
    repo.commit_and_push(
        f"chore({args.env}): update myapp image to {args.image_tag}"
    )

    # 3. 执行 Helm 升级
    result = run_helm_upgrade(
        release=f"myapp-{args.env}",
        chart=args.chart_path,
        namespace=f"myapp-{args.env}",
        values=[f"values-{args.env}.yaml"],
    )
    print(result.stdout)

    # 4. 验证部署
    apps_v1 = client.AppsV1Api()
    dep = apps_v1.read_namespaced_deployment(
        "myapp-api", f"myapp-{args.env}"
    )
    print(f"Deployed replicas: {dep.spec.replicas}")
    print(f"Image: {dep.spec.template.spec.containers[0].image}")

if __name__ == "__main__":
    main()
```

---

## 14.9 总结

本章覆盖了 Skaffold + Helm + Python GitOps 开发者所需的五大核心技能领域：

| 技能领域 | 核心工具 | 关键能力 |
|----------|----------|----------|
| Helm | Chart、模板、values | 声明式应用打包与多环境管理 |
| Skaffold | skaffold.yaml、Profiles | 统一本地开发与 CI/CD 构建部署 |
| Python 自动化 | kubernetes-client、boto3、GitPython | 基础设施编排与 GitOps 仓库管理 |
| AWS/EKS | eksctl、IRSA、ECR、CloudWatch | 云原生基础设施管理 |
| CI/CD | GitHub Actions、Trivy | 质量门禁与安全交付流水线 |

**核心原则：**

1. **声明式优先**：所有配置都应声明式定义，避免命令式操作
2. **安全内建**：IRSA 替代硬编码凭证，Trivy 扫描替代人工审查
3. **自动化一切**：从 lint 到部署，减少人工干预
4. **可观测性**：日志、指标、告警三位一体
5. **渐进式交付**：金丝雀发布和蓝绿部署降低发布风险

掌握这些技能后，开发者可以构建从本地开发到生产交付的完整 GitOps 工作流，实现快速、安全、可重复的 Kubernetes 应用交付。
