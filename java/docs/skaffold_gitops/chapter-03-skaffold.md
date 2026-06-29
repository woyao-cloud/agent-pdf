# 第3章 Skaffold 持续开发与部署

## 3.1 Skaffold 架构与工作流

### 3.1.1 解决的问题

在云原生开发中，开发者在本地修改代码后，通常需要经历"代码编译 → 构建镜像 → 推送镜像 → 更新 Kubernetes 清单 → 应用清单到集群"这一系列繁琐步骤。传统 CI/CD 工具（如 Jenkins、GitLab CI）虽然能自动化生产环境部署，但在本地开发阶段，每次代码变更都需要手动执行上述流程，严重拖慢开发节奏。

Skaffold 是 Google 开源的云原生持续开发工具，核心目标是**消除本地开发与 Kubernetes 部署之间的摩擦**。它自动管理代码变更的检测、构建、推送和部署全流程，让开发者专注于代码本身，而非基础设施操作。

### 3.1.2 核心原理

Skaffold 的工作流是一个六阶段循环：

```
文件变更检测 → 构建镜像 → 测试 → 部署 → 健康检查 → 持续监听
```

每个阶段的具体职责：

| 阶段 | 职责 | 可配置性 |
|------|------|----------|
| **Watch** | 监听文件系统变更，支持 Git 触发和轮询两种模式 | 可配置忽略规则 |
| **Build** | 选择构建器（Docker、Jib、Kaniko、Cloud Build 等）构建容器镜像 | 多构建器支持 |
| **Test** | 运行容器结构测试（container-structure-test） | 可选阶段 |
| **Deploy** | 通过 Helm、kubectl 或 Kustomize 将制品部署到集群 | 多部署器支持 |
| **Status Check** | 等待部署资源达到 Ready 状态 | 可配置超时 |
| **Loop** | 回到 Watch 阶段，形成持续开发循环 | dev 模式特有 |

Skaffold 提供三种运行模式：

- **`skaffold dev`**：持续开发模式。进入无限循环，监听文件变更，自动执行 build → test → deploy，并支持文件同步（file sync）和端口转发。适合本地开发。
- **`skaffold run`**：单次执行模式。执行一次完整的 build → test → deploy 流程后退出。适合 CI 管道中的一次性部署。
- **`skaffold build` / `skaffold deploy`**：分离模式。将构建和部署拆分为独立命令，适合 CI/CD 中需要将构建产物传递到后续阶段（如签名、扫描）的场景。

### 3.1.3 代码/配置实现

最简单的 Skaffold 配置：

```yaml
# skaffold.yaml
apiVersion: skaffold/v4beta6
kind: Config
build:
  artifacts:
    - image: my-app
      docker:
        dockerfile: Dockerfile
deploy:
  kubectl:
    manifests:
      - k8s/*.yaml
```

启动开发模式：

```bash
skaffold dev --port-forward
```

### 3.1.4 使用场景

- **本地快速迭代**：Java 开发者修改代码后，Skaffold 自动触发 Jib 构建（无需本地 Docker 守护进程），将新镜像部署到 minikube 或 kind 集群。
- **团队统一开发环境**：通过共享的 `skaffold.yaml` 配置，确保所有团队成员使用相同的构建和部署流程。
- **CI 管道集成**：在 CI 中执行 `skaffold run` 或 `skaffold build`，将构建产物推送到远程仓库。

### 3.1.5 潜在风险与注意事项

- Skaffold 的 dev 模式会持续占用终端进程，建议配合 tmux 或后台进程使用。
- 文件监听在大型项目（超过 10 万个文件）中可能产生性能问题，需合理配置 `watch.ignore`。
- 默认情况下，Skaffold 会部署到当前 kube-context 指向的集群，务必确认上下文正确。

### 3.1.6 本章小结

Skaffold 通过自动化的六阶段循环，将 Kubernetes 应用的开发-部署反馈周期从分钟级压缩到秒级。其三种运行模式分别覆盖了本地开发、单次部署和 CI 集成三大场景，是云原生开发中不可或缺的效率工具。

---

## 3.2 skaffold.yaml 配置详解

### 3.2.1 解决的问题

`skaffold.yaml` 是 Skaffold 的核心配置文件，定义了整个开发-部署管道的所有行为。理解其配置结构是有效使用 Skaffold 的前提。错误的配置可能导致构建失败、部署到错误集群或安全漏洞。

### 3.2.2 核心原理

`skaffold.yaml` 采用 YAML 格式，顶层结构如下：

```yaml
apiVersion: skaffold/v4beta6
kind: Config
metadata:
  name: my-config
build:
  artifacts: []
  tagPolicy: {}
  platforms: []
test:
  - image: my-app
    structureTests:
      - test/*.yaml
deploy:
  helm: {}
  kubectl: {}
  kustomize: {}
profiles:
  - name: prod
    build: {}
    deploy: {}
portForward:
  - resourceType: deployment
    resourceName: my-app
    port: 8080
    localPort: 8080
```

#### 关键字段说明

**apiVersion**
Skaffold 的 API 版本与 CLI 版本对应。推荐使用 `skaffold/v4beta6`（Skaffold v2.x）。可通过 `skaffold version` 查看当前版本，使用 `skaffold diagnose` 查看支持的 API 版本。

**build 模块**
定义如何构建容器镜像。核心子字段：

- `artifacts`：制品列表，每个制品包含 `image` 名称和构建器配置。
- `tagPolicy`：镜像标签策略，支持 `gitCommit`（基于 Git 提交哈希）、`sha256`（基于内容哈希）、`envTemplate`（基于环境变量）、`inputDigest`（基于构建输入哈希）、`customTemplate`（自定义模板）。
- `platforms`：目标平台列表，如 `["linux/amd64", "linux/arm64"]`。
- `insecureRegistries`：不安全的镜像仓库列表。

**deploy 模块**
定义如何部署到 Kubernetes 集群。支持三种部署器，可组合使用：

- `kubectl`：直接应用 YAML 清单。
- `helm`：通过 Helm chart 部署。
- `kustomize`：通过 Kustomize 渲染清单。

**profiles**
配置文件，允许为不同环境（dev/staging/prod）定义不同的构建和部署参数。

**portForward**
端口转发配置，自动将集群中的服务端口转发到本地。

### 3.2.3 代码/配置实现

#### 完整的多环境配置示例

```yaml
# skaffold.yaml
apiVersion: skaffold/v4beta6
kind: Config
metadata:
  name: microservice-app
build:
  artifacts:
    - image: user-service
      context: services/user
      docker:
        dockerfile: Dockerfile
      sync:
        manual:
          - src: src/**/*.py
            dest: /app
    - image: order-service
      context: services/order
      jib:
        project: com.example:order-service
      sync:
        infer:
          - "src/main/java/**/*.java"
  tagPolicy:
    gitCommit: {}
  platforms:
    - "linux/amd64"
deploy:
  kubectl:
    manifests:
      - k8s/namespaces/*.yaml
      - k8s/deployments/*.yaml
      - k8s/services/*.yaml
    defaultNamespace: dev
    flags:
      - --validate=false
portForward:
  - resourceType: service
    resourceName: user-service
    namespace: dev
    port: 8080
    localPort: 8080
  - resourceType: service
    resourceName: order-service
    namespace: dev
    port: 8081
    localPort: 8081

---
# 生产环境 Profile
apiVersion: skaffold/v4beta6
kind: Config
metadata:
  name: microservice-app-prod
build:
  artifacts:
    - image: user-service
      context: services/user
      kaniko:
        dockerfile: Dockerfile
        cache: {}
    - image: order-service
      context: services/order
      kaniko:
        dockerfile: Dockerfile
        buildArgs:
          JAR_FILE: target/*.jar
  tagPolicy:
    inputDigest: {}
  platforms:
    - "linux/amd64"
    - "linux/arm64"
deploy:
  helm:
    releases:
      - name: user-service
        chartPath: charts/user-service
        valuesFiles:
          - charts/user-service/values-prod.yaml
        namespace: prod
        createNamespace: true
      - name: order-service
        chartPath: charts/order-service
        valuesFiles:
          - charts/order-service/values-prod.yaml
        namespace: prod
        createNamespace: true
```

### 3.2.4 使用场景

- **微服务架构**：在单个 `skaffold.yaml` 中定义多个服务的构建和部署配置，实现一键启动全栈应用。
- **多环境管理**：通过 profiles 区分开发、测试、生产环境，不同环境使用不同的构建器和部署策略。
- **混合部署策略**：部分服务使用 Helm 部署，部分服务使用原生 YAML 部署，Skaffold 支持在同一配置中组合使用。

### 3.2.5 潜在风险与注意事项

- `apiVersion` 必须与 Skaffold 版本匹配，不匹配会导致解析失败。
- 多个 `kind: Config` 之间通过 `metadata.name` 区分，profile 名称必须唯一。
- `portForward` 的 `localPort` 如果被占用，Skaffold 会自动选择下一个可用端口，建议显式指定。
- 使用 `kubectl` 部署时，清单文件的顺序会影响资源创建顺序，建议先创建 Namespace 再创建 Deployment。

### 3.2.6 本章小结

`skaffold.yaml` 是 Skaffold 的配置中枢，通过 build、deploy、profiles、portForward 四大模块，完整定义了从代码到运行容器的全链路行为。合理组织多环境配置和制品定义，是高效使用 Skaffold 的基础。

---

## 3.3 构建模块详解

### 3.3.1 解决的问题

容器镜像构建是云原生开发的核心环节。不同项目有不同的构建需求：Java 项目可能需要 Maven/Gradle 构建后再打包镜像；Python/Node.js 项目可能只需要 Dockerfile；部分团队希望在集群内构建以避免依赖本地 Docker 守护进程。Skaffold 的构建模块通过抽象多种构建器，统一了这些差异。

### 3.3.2 核心原理

Skaffold 支持六种构建器，每种适用于不同的场景：

| 构建器 | 依赖 | 构建位置 | 适用语言 | 特点 |
|--------|------|----------|----------|------|
| **docker** | Docker daemon | 本地 | 任意 | 最通用，依赖本地 Docker |
| **jib** | Maven/Gradle | 本地 | Java | 无需 Docker daemon，增量构建快 |
| **kaniko** | 无 | 集群内 | 任意 | 无需 Docker daemon，安全 |
| **cloudbuild** | GCP 账号 | GCP | 任意 | 托管构建，可扩展 |
| **buildpacks** | pack CLI / Docker | 本地 | 任意 | 自动检测语言，零配置 |
| **custom** | 自定义脚本 | 任意 | 任意 | 最大灵活性 |

#### 构建流程

```
源代码 → 构建上下文 → 构建器执行 → 镜像 Tag → 推送到仓库
```

Skaffold 在构建阶段执行以下步骤：

1. 收集构建上下文（`context` 目录下的文件）。
2. 根据 `artifacts` 中的构建器配置，调用对应的构建工具。
3. 使用 `tagPolicy` 生成镜像标签。
4. 将构建好的镜像推送到配置的仓库。
5. 将镜像名称和标签注入到部署清单中。

### 3.3.3 代码/配置实现

#### Docker 构建器（最通用）

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      docker:
        dockerfile: Dockerfile
        buildArgs:
          APP_VERSION: "1.0.0"
        cacheFrom:
          - my-app:latest
        target: production
        network: host
        noCache: false
        squash: false
        secrets:
          - id: npmrc
            src: ~/.npmrc
  tagPolicy:
    gitCommit: {}
```

#### Jib 构建器（Java 项目首选）

```yaml
build:
  artifacts:
    - image: user-service
      context: services/user
      jib:
        project: com.example:user-service
        type: maven  # 或 gradle
        baseImage: eclipse-temurin:17-jre
        args:
          - -DskipTests
        extraFiles:
          - src/main/jib
        from: eclipse-temurin:17-jre
        to:
          image: user-service
          tags:
            - latest
            - "1.0.0"
  tagPolicy:
    inputDigest: {}
```

Jib 的优势在于**无需 Docker daemon**，直接通过 Maven/Gradle 插件将 Java 应用打包为容器镜像。它利用多层缓存机制，只将变更的层上传，大幅提升构建速度。

#### Kaniko 构建器（集群内构建）

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      kaniko:
        dockerfile: Dockerfile
        cache: {}
        target: production
        buildArgs:
          HTTP_PROXY: http://proxy:8080
        image: gcr.io/kaniko-project/executor:latest
        namespace: kaniko
        pullSecretName: kaniko-secret
        dockerConfig:
          secretName: docker-config
  cluster:
    pullSecretName: kaniko-secret
    namespace: kaniko
    resources:
      requests:
        cpu: 1
        memory: 1Gi
      limits:
        cpu: 4
        memory: 4Gi
```

Kaniko 在 Kubernetes 集群内以 Pod 方式运行构建，不依赖宿主机 Docker daemon，适合 CI 环境和安全要求较高的场景。

#### Cloud Build 构建器（GCP 托管）

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      cloudbuild:
        dockerfile: Dockerfile
        projectId: my-gcp-project
        diskSizeGb: 100
        machineType: "N1_HIGHCPU_32"
        timeout: 1800s
        substitutions:
          _APP_VERSION: "1.0.0"
  googleCloudBuild:
    projectId: my-gcp-project
```

#### Buildpacks 构建器（零配置）

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      buildpacks:
        builder: gcr.io/buildpacks/builder:v1
        env:
          - BP_JVM_VERSION=17
          - BP_NATIVE_IMAGE=false
        trustBuilder: true
```

#### Custom 构建器（最大灵活性）

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      custom:
        buildCommand: |
          ./build-script.sh --image {{ .IMAGE }} --tag {{ .DIGEST }}
        dependencies:
          paths:
            - src/**/*.py
            - requirements.txt
          ignore:
            - tests/
            - "*.md"
        timeout: 300
```

### 3.3.4 使用场景

- **Java 微服务项目**：使用 Jib 构建器，无需安装 Docker daemon，CI 环境配置简单，增量构建速度快。
- **安全敏感环境**：使用 Kaniko 在集群内构建，避免 Docker daemon 的 root 权限问题。
- **GCP 原生项目**：使用 Cloud Build 构建器，与 GCP 生态深度集成，支持大规模并行构建。
- **多语言项目**：使用 Docker 构建器，通过 Dockerfile 统一管理各种语言的构建流程。
- **遗留系统迁移**：使用 Custom 构建器，封装已有的构建脚本，逐步迁移到容器化。

### 3.3.5 潜在风险与注意事项

- **Docker 构建器**：依赖本地 Docker daemon，在 CI 环境中可能需要 DinD（Docker-in-Docker）配置，增加复杂度。构建缓存可能占用大量磁盘空间。
- **Jib 构建器**：仅支持 Java 项目，且需要项目已配置 Maven/Gradle 构建。对于复杂的 Dockerfile 指令（如多阶段构建中的 `COPY --from`）不支持。
- **Kaniko 构建器**：在集群内运行构建 Pod，消耗集群资源。构建速度受限于集群节点性能。需要为 Kaniko 配置 ServiceAccount 和镜像拉取密钥。
- **Cloud Build 构建器**：依赖 GCP 服务，存在厂商锁定风险。需要配置 Cloud Build API 和适当的 IAM 权限。
- **Buildpacks 构建器**：构建出的镜像体积可能较大，因为 buildpacks 会包含完整的运行环境。对构建过程的自定义能力有限。
- **Custom 构建器**：完全依赖自定义脚本，Skaffold 无法提供构建过程的错误诊断。需要自行处理缓存和增量构建逻辑。

### 3.3.6 本章小结

Skaffold 的构建模块通过六种构建器覆盖了从本地开发到生产部署的全场景需求。Docker 构建器最通用，Jib 是 Java 项目的最佳选择，Kaniko 适合安全敏感环境，Cloud Build 与 GCP 深度集成，Buildpacks 实现零配置构建，Custom 构建器提供最大灵活性。选择合适的构建器需要综合考虑语言生态、安全要求、基础设施和团队技能。

---

## 3.4 部署模块详解

### 3.4.1 解决的问题

构建容器镜像后，需要将其部署到 Kubernetes 集群。Kubernetes 生态中存在多种部署工具（Helm、kubectl、Kustomize），每种工具都有不同的配置方式和适用场景。Skaffold 的部署模块统一了这些工具的调用方式，并自动将构建产物的镜像名称注入到部署清单中。

### 3.4.2 核心原理

Skaffold 的部署流程分为三个阶段：

1. **镜像替换**：将部署清单中的镜像占位符替换为实际构建的镜像名称和标签。
2. **渲染**：根据选择的部署器渲染最终的 Kubernetes 清单。
3. **应用**：将渲染后的清单应用到目标集群。

#### 镜像替换机制

Skaffold 通过两种方式实现镜像替换：

- **模板替换**：在清单中使用 `{{ .IMAGE_NAME }}` 模板语法。
- **自动替换**：Skaffold 自动扫描清单中的 `image:` 字段，匹配 `skaffold.yaml` 中定义的 `image` 名称并替换。

```yaml
# deployment.yaml（模板替换方式）
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - image: {{ .USER_SERVICE_IMAGE }}
          name: user-service
```

```yaml
# skaffold.yaml
build:
  artifacts:
    - image: user-service
      docker:
        dockerfile: Dockerfile
deploy:
  kubectl:
    manifests:
      - deployment.yaml
    images:
      user-service: {{ .USER_SERVICE_IMAGE }}
```

### 3.4.3 代码/配置实现

#### kubectl 部署器

```yaml
deploy:
  kubectl:
    manifests:
      - k8s/*.yaml
      - k8s/**/*.yaml
    defaultNamespace: dev
    flags:
      - --validate=false
    hooks:
      before:
        - command: echo "Pre-deploy hook"
          os: linux
      after:
        - command: echo "Post-deploy hook"
          os: linux
    remoteManifests:
      - https://raw.githubusercontent.com/example/ manifests/master/namespace.yaml
```

kubectl 部署器直接使用 `kubectl apply` 命令应用清单，是最简单直接的部署方式。

#### Helm 部署器

```yaml
deploy:
  helm:
    releases:
      - name: user-service
        chartPath: charts/user-service
        remoteChart: bitnami/nginx
        version: 13.2.0
        valuesFiles:
          - charts/user-service/values.yaml
          - charts/user-service/values-dev.yaml
        values:
          replicaCount: 3
          image:
            repository: user-service
            tag: latest
        namespace: dev
        createNamespace: true
        setValues:
          service.type: ClusterIP
        setValueTemplates:
          image.tag: "{{ .DIGEST }}"
        skipBuildDependencies: false
        upgradeFlags:
          - --install
          - --timeout=5m
        wait: true
        recreatePods: false
        overrides: {}
        packaged:
          appVersion: "1.0.0"
          version: "0.1.0"
```

Helm 部署器支持完整的 Helm 功能，包括 values 文件合并、依赖管理、升级策略等。`setValueTemplates` 支持使用 Skaffold 的模板变量（如 `{{ .DIGEST }}`、`{{ .IMAGE }}`）。

#### Kustomize 部署器

```yaml
deploy:
  kustomize:
    paths:
      - k8s/overlays/dev
      - k8s/overlays/staging
    defaultNamespace: dev
    hooks:
      before:
        - command: kustomize build k8s/overlays/dev
          os: linux
    buildArgs:
      - --load-restrictor=LoadRestrictionsNone
      - --enable-helm
```

Kustomize 部署器通过 `kustomize build` 命令渲染清单，支持 Kustomize 的所有功能，包括 patches、bases、components 等。

#### 组合部署器

Skaffold 支持在同一配置中组合使用多个部署器：

```yaml
deploy:
  kubectl:
    manifests:
      - k8s/namespace.yaml
      - k8s/configmap.yaml
  helm:
    releases:
      - name: user-service
        chartPath: charts/user-service
        namespace: dev
  kustomize:
    paths:
      - k8s/overlays/dev
```

部署顺序为：kubectl → helm → kustomize。这种组合方式适合需要先创建基础设施资源（Namespace、ConfigMap），再部署应用服务的场景。

### 3.4.4 使用场景

- **简单项目**：使用 kubectl 部署器，直接管理 YAML 清单，适合小团队和原型开发。
- **复杂应用**：使用 Helm 部署器，通过 values 文件管理多环境配置，适合需要版本管理和回滚的场景。
- **配置管理**：使用 Kustomize 部署器，通过 overlay 机制管理环境差异，适合需要精细控制清单渲染的场景。
- **混合部署**：组合使用多个部署器，先部署基础设施资源，再部署应用服务。

### 3.4.5 潜在风险与注意事项

- **kubectl 部署器**：不支持 Helm 的版本管理和回滚功能。清单文件过多时，`kubectl apply` 的执行时间会显著增加。
- **Helm 部署器**：Helm chart 的依赖下载可能失败，建议使用 `skipBuildDependencies: false` 确保依赖完整。`upgradeFlags` 中的 `--timeout` 应根据应用启动时间合理设置。
- **Kustomize 部署器**：Kustomize overlay 的层级过多时，调试困难。`buildArgs` 中的 `--load-restrictor=LoadRestrictionsNone` 可能引入安全风险。
- **镜像替换**：如果清单中的镜像名称与 `skaffold.yaml` 中定义的 `image` 名称不完全匹配，镜像替换会失败。建议使用模板替换方式确保准确性。

### 3.4.6 本章小结

Skaffold 的部署模块通过 kubectl、Helm、Kustomize 三种部署器，覆盖了从简单到复杂的全部部署场景。镜像替换机制自动将构建产物注入到部署清单中，消除了手动更新镜像标签的繁琐操作。组合部署器支持在同一流程中部署基础设施和应用服务，实现了完整的端到端部署自动化。

---

## 3.5 文件监听与热重载

### 3.5.1 解决的问题

在传统开发流程中，修改代码后需要手动重新构建镜像、推送镜像、更新部署，整个过程耗时数分钟。对于解释型语言（Python、Node.js）和部分编译型语言（Java 的增量编译），这种全量构建-部署流程造成了严重的效率浪费。Skaffold 的文件监听与热重载机制，通过智能文件同步和增量构建，将反馈周期缩短到秒级。

### 3.5.2 核心原理

Skaffold 提供三种热重载策略，按效率从高到低排列：

| 策略 | 机制 | 适用场景 | 速度 |
|------|------|----------|------|
| **File Sync** | 直接复制文件到运行容器 | 静态资源、解释型语言 | 毫秒级 |
| **Artifact Mode** | 仅重建变更的制品 | 多服务架构 | 秒级 |
| **Full Rebuild** | 完整构建所有制品 | 基础镜像变更 | 分钟级 |

#### File Sync 机制

File Sync 是 Skaffold 最高效的热重载方式。它绕过构建流程，直接将变更的文件复制到运行中的容器内：

```
文件变更 → Skaffold 检测 → 匹配 sync 规则 → rsync/scp 到容器 → 应用生效
```

File Sync 支持两种模式：

- **manual**：手动指定源文件匹配模式和目标路径。
- **infer**：自动推断需要同步的文件类型（如 Java 的 `.class` 文件）。

#### 文件监听机制

Skaffold 使用两种文件监听方式：

- **fsnotify**：基于操作系统文件系统事件（Linux inotify、macOS FSEvents），响应快但资源消耗高。
- **轮询**：定期扫描文件系统，适合网络文件系统（NFS）和 CI 环境。

### 3.5.3 代码/配置实现

#### File Sync 配置

```yaml
build:
  artifacts:
    # Python 项目：同步 .py 文件到容器
    - image: python-service
      context: services/python
      docker:
        dockerfile: Dockerfile
      sync:
        manual:
          - src: "src/**/*.py"
            dest: /app
            strip: src/
          - src: "static/**/*"
            dest: /app/static
        infer:
          - "**/*.py"

    # Node.js 项目：同步 .js 文件并触发重启
    - image: node-service
      context: services/node
      docker:
        dockerfile: Dockerfile
      sync:
        manual:
          - src: "src/**/*.js"
            dest: /app/src
          - src: "package.json"
            dest: /app
        lifecycleHooks:
          postSync:
            - command: npm install
              os: linux

    # Java 项目：同步编译后的 .class 文件
    - image: java-service
      context: services/java
      jib:
        project: com.example:java-service
      sync:
        infer:
          - "target/classes/**/*.class"
        manual:
          - src: "src/main/resources/**/*"
            dest: /app/resources
```

#### 监听配置优化

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      docker:
        dockerfile: Dockerfile
watch:
  pollInterval: 1000  # 轮询间隔（毫秒）
  filePaths:
    - src/**/*.go
    - src/**/*.proto
  ignore:
    - "vendor/**"
    - "node_modules/**"
    - ".git/**"
    - "*.log"
    - "tmp/**"
    - "**/*.test.go"
  triggers:
    poll:
      enabled: true
      interval: 500
    notify:
      enabled: true
```

#### 生命周期 Hook

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      docker:
        dockerfile: Dockerfile
      hooks:
        before:
          - command: make generate-proto
            os: linux
        after:
          - command: make test
            os: linux
      sync:
        manual:
          - src: "src/**/*.py"
            dest: /app
        lifecycleHooks:
          preSync:
            - command: echo "Syncing files..."
              os: linux
          postSync:
            - command: |
                if [ -f /app/requirements.txt ]; then
                  pip install -r /app/requirements.txt
                fi
              os: linux
              container: app
```

### 3.5.4 使用场景

- **Python/Node.js 开发**：使用 File Sync 直接同步源代码到容器，无需重新构建镜像，实现毫秒级热重载。
- **Java 开发**：配合 IDE 的自动编译功能，将编译后的 `.class` 文件同步到容器，实现增量热部署。
- **前端开发**：同步静态资源文件（HTML、CSS、JS）到容器，配合 webpack-dev-server 实现热模块替换（HMR）。
- **多服务开发**：使用 Artifact Mode，只重建变更的服务，其他服务保持运行状态。

### 3.5.5 潜在风险与注意事项

- **File Sync 限制**：同步的文件不会更新镜像层，如果容器被重新调度（如 Pod 重启），同步的文件会丢失。File Sync 不适合需要持久化的配置变更。
- **同步冲突**：如果多个开发者同时使用 File Sync 到同一个 Pod，可能产生文件冲突。建议每个开发者使用独立的命名空间。
- **监听性能**：在包含大量文件（>100,000）的项目中，文件监听可能消耗大量 CPU 和内存。建议通过 `watch.ignore` 排除不需要监听的目录。
- **容器内命令执行**：`postSync` 中的命令在容器内执行，需要确保容器内有对应的工具（如 `pip`、`npm`）。命令执行失败不会阻止文件同步，但可能导致应用状态不一致。
- **Java 热重载限制**：仅同步 `.class` 文件不支持热加载新的类结构（如新增方法、修改类继承关系），需要完整的 Jib 或 Docker 构建。

### 3.5.6 本章小结

Skaffold 的文件监听与热重载机制通过 File Sync、Artifact Mode 和 Full Rebuild 三级策略，在不同场景下实现了最优的开发效率。File Sync 为解释型语言和静态资源提供毫秒级热重载，Artifact Mode 为多服务架构提供增量构建，Full Rebuild 确保基础镜像变更时的完整性。合理配置 sync 规则和监听排除项，是发挥热重载性能的关键。

---

## 3.6 多环境 Profile 配置

### 3.6.1 解决的问题

在实际项目中，开发、测试、生产环境通常使用不同的基础设施、配置参数和部署策略。例如：
- 开发环境使用 minikube，构建使用 Docker，部署到 dev 命名空间。
- 生产环境使用 GKE，构建使用 Kaniko，部署到 prod 命名空间，需要额外的安全配置。

如果为每个环境维护独立的 `skaffold.yaml`，会导致大量配置重复和维护困难。Skaffold 的 Profile 机制通过配置继承和覆盖，解决了多环境配置管理的问题。

### 3.6.2 核心原理

Profile 机制基于以下原则：

1. **基础配置**：定义所有环境共享的配置（如制品定义、通用构建参数）。
2. **Profile 覆盖**：每个 Profile 可以覆盖或扩展基础配置中的任何字段。
3. **激活条件**：Profile 可以通过条件自动激活，减少手动指定参数的需求。
4. **配置合并**：多个 Profile 可以同时激活，Skaffold 按顺序合并配置。

#### Profile 激活方式

```bash
# 手动指定
skaffold dev --profile prod

# 通过激活条件自动激活
skaffold dev  # 自动检测 kube-context 并激活对应 Profile

# 多 Profile 组合
skaffold dev --profile prod,us-east
```

### 3.6.3 代码/配置实现

#### 完整的多环境 Profile 配置

```yaml
apiVersion: skaffold/v4beta6
kind: Config
metadata:
  name: fullstack-app
build:
  artifacts:
    - image: backend
      context: backend
      docker:
        dockerfile: Dockerfile
    - image: frontend
      context: frontend
      docker:
        dockerfile: Dockerfile
  tagPolicy:
    gitCommit: {}
deploy:
  kubectl:
    manifests:
      - k8s/base/*.yaml
    defaultNamespace: dev
portForward:
  - resourceType: service
    resourceName: backend
    port: 8080
    localPort: 8080
  - resourceType: service
    resourceName: frontend
    port: 3000
    localPort: 3000

---
# 开发环境 Profile
profiles:
  - name: dev
    activation:
      - kubeContext: minikube
      - kubeContext: kind-*
    patches:
      - op: replace
        path: /deploy/kubectl/defaultNamespace
        value: dev-{USER}
    portForward:
      - resourceType: service
        resourceName: database
        port: 5432
        localPort: 5432

---
# 测试环境 Profile
profiles:
  - name: staging
    activation:
      - kubeContext: gke_staging_*
      - env: STAGING=true
    build:
      artifacts:
        - image: backend
          context: backend
          kaniko:
            dockerfile: Dockerfile
            cache: {}
        - image: frontend
          context: frontend
          kaniko:
            dockerfile: Dockerfile
            cache: {}
      tagPolicy:
        inputDigest: {}
    deploy:
      kubectl:
        manifests:
          - k8s/base/*.yaml
          - k8s/overlays/staging/*.yaml
        defaultNamespace: staging
    patches:
      - op: add
        path: /deploy/kubectl/manifests/-
        value: k8s/overlays/staging/hpa.yaml

---
# 生产环境 Profile
profiles:
  - name: prod
    activation:
      - kubeContext: gke_prod_*
    build:
      artifacts:
        - image: backend
          context: backend
          kaniko:
            dockerfile: Dockerfile
            cache: {}
            target: production
        - image: frontend
          context: frontend
          kaniko:
            dockerfile: Dockerfile
            cache: {}
      tagPolicy:
        inputDigest: {}
    deploy:
      helm:
        releases:
          - name: backend
            chartPath: charts/backend
            valuesFiles:
              - charts/backend/values-prod.yaml
            namespace: prod
            createNamespace: true
            setValueTemplates:
              image.tag: "{{ .DIGEST }}"
          - name: frontend
            chartPath: charts/frontend
            valuesFiles:
              - charts/frontend/values-prod.yaml
            namespace: prod
            createNamespace: true
            setValueTemplates:
              image.tag: "{{ .DIGEST }}"
    patches:
      - op: replace
        path: /deploy/helm/releases/0/valuesFiles
        value:
          - charts/backend/values-prod.yaml
      - op: add
        path: /deploy/helm/releases/0/setValues
        value:
          ingress.tls.enabled: "true"

---
# 区域 Profile（可与环境 Profile 组合使用）
profiles:
  - name: us-east
    activation:
      - kubeContext: *us-east*
    patches:
      - op: replace
        path: /deploy/helm/releases/0/valuesFiles
        value:
          - charts/backend/values-us-east.yaml

  - name: eu-west
    activation:
      - kubeContext: *eu-west*
    patches:
      - op: replace
        path: /deploy/helm/releases/0/valuesFiles
        value:
          - charts/backend/values-eu-west.yaml
```

#### 使用 JSON Patch 进行精细配置

Skaffold 支持 JSON Patch 操作（RFC 6902），允许对配置进行精确的增删改：

```yaml
profiles:
  - name: debug
    patches:
      # 替换字段值
      - op: replace
        path: /deploy/kubectl/defaultNamespace
        value: debug
      # 添加新字段
      - op: add
        path: /build/artifacts/-
        value:
          image: debug-sidecar
          context: sidecar
          docker:
            dockerfile: Dockerfile
      # 删除字段
      - op: remove
        path: /portForward
      # 在数组中插入
      - op: add
        path: /deploy/kubectl/manifests/0
        value: k8s/debug/*.yaml
```

### 3.6.4 使用场景

- **本地开发 vs CI 构建**：开发环境使用 Docker 构建器 + File Sync，CI 环境使用 Kaniko 构建器 + 完整构建。
- **多集群部署**：通过 kubeContext 激活条件，自动为不同集群选择对应的部署配置。
- **区域化部署**：通过组合环境 Profile 和区域 Profile，实现多区域部署配置。
- **临时调试环境**：通过 debug Profile，添加额外的调试工具和端口转发配置。

### 3.6.5 潜在风险与注意事项

- **Profile 激活顺序**：多个 Profile 同时激活时，后激活的 Profile 会覆盖先激活的配置。激活顺序由 `--profile` 参数中的顺序决定。
- **JSON Patch 路径错误**：Patch 操作中的 `path` 必须与配置结构完全匹配，路径错误会导致 Profile 应用失败。建议使用 `skaffold diagnose --profile <name>` 验证 Profile 配置。
- **配置膨胀**：过多的 Profile 和 Patch 操作会使 `skaffold.yaml` 变得复杂难懂。建议将不同环境的配置拆分到独立的文件中，通过 `requires` 字段引用。
- **激活条件冲突**：当多个 Profile 的激活条件同时满足时，所有匹配的 Profile 都会被激活。如果这些 Profile 修改了相同的配置字段，后激活的 Profile 会覆盖先激活的配置。

### 3.6.6 本章小结

Skaffold 的 Profile 机制通过配置继承、覆盖和 JSON Patch 操作，实现了灵活的多环境配置管理。激活条件支持基于 kubeContext、环境变量等多种方式自动选择 Profile，减少了手动参数传递。合理组织 Profile 层次结构，是管理复杂多环境部署的关键实践。

---

## 3.7 CI/CD 集成

### 3.7.1 解决的问题

Skaffold 不仅是一个本地开发工具，更是一个完整的 CI/CD 管道构建工具。在 CI 环境中，需要将构建和部署流程标准化、可重复化，并与现有的 CI 系统（GitHub Actions、GitLab CI、Jenkins）集成。Skaffold 的 CI/CD 模式通过分离构建和部署阶段、支持制品缓存、多仓库推送等特性，解决了生产环境持续交付的标准化问题。

### 3.7.2 核心原理

Skaffold 在 CI/CD 环境中的工作流与本地开发有所不同：

```
CI 触发 → skaffold build（构建+推送） → 制品存储 → skaffold deploy（拉取+部署）
```

#### 关键命令

| 命令 | 功能 | 适用阶段 |
|------|------|----------|
| `skaffold build` | 仅构建和推送镜像，不部署 | CI 构建阶段 |
| `skaffold deploy` | 仅部署已构建的镜像 | CI 部署阶段 |
| `skaffold run` | 构建+部署一次性完成 | 简单 CI 管道 |
| `skaffold render` | 渲染最终 Kubernetes 清单 | 清单审核阶段 |

#### 制品传递机制

在分离模式中，`skaffold build` 生成一个构建产物文件（`--file-output`），`skaffold deploy` 读取该文件（`--build-artifacts`）获取镜像信息：

```bash
# 阶段 1：构建
skaffold build --file-output=build.json --default-repo=gcr.io/my-project

# 阶段 2：部署
skaffold deploy --build-artifacts=build.json
```

### 3.7.3 代码/配置实现

#### GitHub Actions 集成

```yaml
# .github/workflows/deploy.yml
name: Deploy to GKE

on:
  push:
    branches: [main]

env:
  PROJECT_ID: my-gcp-project
  GKE_CLUSTER: prod-cluster
  GKE_ZONE: us-central1-a

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Google Cloud
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: ${{ env.PROJECT_ID }}
          service_account_key: ${{ secrets.GCP_SA_KEY }}

      - name: Configure Docker
        run: gcloud auth configure-docker

      - name: Build and push images
        run: |
          skaffold build \
            --file-output=build.json \
            --default-repo=gcr.io/${{ env.PROJECT_ID }} \
            --cache-artifacts=true \
            --profile=prod

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts
          path: build.json

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Google Cloud
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: ${{ env.PROJECT_ID }}
          service_account_key: ${{ secrets.GCP_SA_KEY }}

      - name: Get GKE credentials
        uses: google-github-actions/get-gke-credentials@v2
        with:
          cluster_name: ${{ env.GKE_CLUSTER }}
          location: ${{ env.GKE_ZONE }}

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build-artifacts

      - name: Deploy to GKE
        run: |
          skaffold deploy \
            --build-artifacts=build.json \
            --profile=prod
```

#### GitLab CI 集成

```yaml
# .gitlab-ci.yml
stages:
  - build
  - deploy

variables:
  CI_REGISTRY_IMAGE: $CI_REGISTRY_IMAGE
  SKAFFOLD_DEFAULT_REPO: $CI_REGISTRY

build:
  stage: build
  image: gcr.io/k8s-skaffold/skaffold:latest
  script:
    - skaffold build
        --file-output=build.json
        --default-repo=$CI_REGISTRY
        --cache-artifacts=true
        --profile=staging
  artifacts:
    paths:
      - build.json
    expire_in: 1 hour

deploy:
  stage: deploy
  image: gcr.io/k8s-skaffold/skaffold:latest
  script:
    - skaffold deploy
        --build-artifacts=build.json
        --profile=staging
  environment:
    name: staging
    url: https://staging.example.com
  only:
    - main
```

#### Jenkins Pipeline 集成

```groovy
// Jenkinsfile
pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: skaffold
    image: gcr.io/k8s-skaffold/skaffold:latest
    command: ["cat"]
    tty: true
  - name: docker
    image: docker:24
    command: ["cat"]
    tty: true
    volumeMounts:
    - name: docker-socket
      mountPath: /var/run/docker.sock
  volumes:
  - name: docker-socket
    hostPath:
      path: /var/run/docker.sock
'''
        }
    }
    stages {
        stage('Build') {
            steps {
                container('skaffold') {
                    sh '''
                    skaffold build \
                        --file-output=build.json \
                        --default-repo=${CI_REGISTRY} \
                        --cache-artifacts=true \
                        --profile=staging
                    '''
                }
            }
        }
        stage('Deploy') {
            steps {
                container('skaffold') {
                    sh '''
                    skaffold deploy \
                        --build-artifacts=build.json \
                        --profile=staging
                    '''
                }
            }
        }
    }
}
```

#### 缓存配置

```yaml
# skaffold.yaml（CI 优化配置）
build:
  artifacts:
    - image: my-app
      context: .
      docker:
        dockerfile: Dockerfile
        cacheFrom:
          - my-app:latest
          - gcr.io/my-project/my-app:latest
  insecureRegistries: []
  artifactsMode: selected  # 仅构建变更的制品
  dependencies:
    paths:
      - "**/*.go"
      - "go.mod"
      - "go.sum"
    ignore:
      - "**/*_test.go"
      - "vendor/**"
```

#### 多仓库推送

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      docker:
        dockerfile: Dockerfile
      platforms:
        - linux/amd64
        - linux/arm64
  multiLevelRepo: true  # 启用多级仓库路径
  defaultRepo: gcr.io/my-project
  additionalRepos:
    - us-central1-docker.pkg.dev/my-project/my-repo
    - docker.io/myorg/my-app
```

### 3.7.4 使用场景

- **GitOps 工作流**：使用 `skaffold render` 生成最终的 Kubernetes 清单，提交到 GitOps 仓库，由 ArgoCD 或 Flux 同步到集群。
- **多阶段 CI 管道**：将构建和部署分离为独立的 CI 阶段，构建阶段生成制品文件，部署阶段读取制品文件进行部署。
- **镜像签名和扫描**：在构建阶段和部署阶段之间插入镜像签名（Cosign）和漏洞扫描（Trivy）步骤。
- **多架构构建**：使用 `--platforms` 参数同时构建 amd64 和 arm64 镜像，推送到多架构仓库。

### 3.7.5 潜在风险与注意事项

- **`--cache-artifacts` 限制**：缓存基于构建上下文哈希，如果构建上下文包含大量无关文件，缓存命中率会降低。建议通过 `.dockerignore` 排除无关文件。
- **`--default-repo` 配置**：如果未设置 `--default-repo`，Skaffold 会使用 `skaffold.yaml` 中定义的镜像名称，可能导致推送到错误的仓库。在 CI 环境中必须显式设置。
- **构建产物文件安全**：`build.json` 包含镜像名称和摘要信息，应作为 CI 制品妥善保管，防止被篡改。
- **CI 环境中的 Docker daemon**：在 CI 中使用 Docker 构建器时，需要确保 CI 运行环境中有可用的 Docker daemon（如 DinD 或 Docker socket 挂载）。
- **Kaniko 在 CI 中的资源消耗**：在 CI 中使用 Kaniko 构建时，每个构建任务都会启动一个 Pod，需要合理设置资源限制，避免集群资源耗尽。

### 3.7.6 本章小结

Skaffold 的 CI/CD 集成通过分离构建和部署阶段、制品传递机制、缓存策略和多仓库推送，实现了标准化的持续交付管道。与 GitHub Actions、GitLab CI、Jenkins 等主流 CI 系统的深度集成，使得 Skaffold 成为连接本地开发和 CI/CD 管道的桥梁。合理使用 `--cache-artifacts` 和 `--default-repo` 参数，可以显著提升 CI 管道的构建效率和可靠性。

---

## 3.8 潜在风险与最佳实践

### 3.8.1 文件监听性能问题

#### 问题描述

在大型项目（包含数万个文件）中，Skaffold 的文件监听机制可能消耗大量 CPU 和内存资源，导致开发环境响应缓慢。

#### 解决方案

```yaml
# 优化文件监听配置
watch:
  pollInterval: 2000  # 增加轮询间隔
  filePaths:
    - src/**/*.go
    - src/**/*.proto
  ignore:
    - "vendor/**"
    - "node_modules/**"
    - ".git/**"
    - "build/**"
    - "dist/**"
    - "*.log"
    - "tmp/**"
    - "**/*.generated.*"
    - "**/__pycache__/**"
    - "*.pyc"
  triggers:
    poll:
      enabled: true
      interval: 2000
    notify:
      enabled: false  # 在大型项目中禁用 fsnotify
```

#### 最佳实践

- 使用 `.dockerignore` 排除构建上下文中不需要的文件。
- 将生成的文件（protobuf、OpenAPI 生成代码）放在独立目录中，加入监听忽略列表。
- 在 CI 环境中使用 `--cache-artifacts` 减少不必要的构建。
- 对于包含大量文件的 monorepo，考虑将服务拆分到独立的 `skaffold.yaml` 中。

### 3.8.2 Docker Daemon 依赖问题

#### 问题描述

Docker 构建器依赖本地 Docker daemon，在以下场景中可能遇到问题：
- CI 环境中没有 Docker daemon。
- 开发者使用 Podman 或其他容器运行时。
- Docker daemon 磁盘空间不足。
- 多架构构建需要 Docker buildx。

#### 解决方案

```yaml
# 方案 1：使用 Kaniko 替代 Docker
build:
  artifacts:
    - image: my-app
      context: .
      kaniko:
        dockerfile: Dockerfile
        cache: {}
        target: production

# 方案 2：使用 Buildpacks 替代 Docker
build:
  artifacts:
    - image: my-app
      context: .
      buildpacks:
        builder: gcr.io/buildpacks/builder:v1

# 方案 3：使用 Jib（Java 项目）
build:
  artifacts:
    - image: my-app
      context: .
      jib:
        project: com.example:my-app
```

#### 最佳实践

- 在本地开发中使用 Docker 构建器，在 CI 中使用 Kaniko 或 Cloud Build 构建器。
- 通过 Profile 机制根据环境自动切换构建器。
- 定期清理 Docker 构建缓存：`docker builder prune`。
- 使用 `--cache-from` 参数利用远程缓存加速构建。

### 3.8.3 Kaniko 集群内资源使用

#### 问题描述

Kaniko 在 Kubernetes 集群内以 Pod 方式运行构建，会消耗集群的计算资源。如果多个开发者同时使用 Kaniko 构建，可能导致集群资源竞争。

#### 解决方案

```yaml
build:
  artifacts:
    - image: my-app
      context: .
      kaniko:
        dockerfile: Dockerfile
        cache: {}
        image: gcr.io/kaniko-project/executor:latest
        namespace: kaniko-builds
        pullSecretName: kaniko-secret
        resources:
          requests:
            cpu: 1
            memory: 2Gi
          limits:
            cpu: 2
            memory: 4Gi
        volumeMounts:
          - name: kaniko-cache
            mountPath: /cache
        volumes:
          - name: kaniko-cache
            persistentVolumeClaim:
              claimName: kaniko-cache-pvc
  cluster:
    pullSecretName: kaniko-secret
    namespace: kaniko-builds
    resources:
      requests:
        cpu: 1
        memory: 2Gi
      limits:
        cpu: 4
        memory: 8Gi
    concurrency: 3  # 限制并发构建数
    timeout: 30m
```

#### 最佳实践

- 为 Kaniko 构建 Pod 设置资源限制，避免单个构建任务耗尽集群资源。
- 使用 PVC 缓存 Kaniko 的构建缓存层，加速重复构建。
- 设置 `concurrency` 限制并发构建数，避免资源竞争。
- 使用独立的命名空间（如 `kaniko-builds`）隔离构建任务。
- 在非工作时间执行大规模构建任务。

### 3.8.4 安全风险

#### 问题描述

Skaffold 在开发模式中可能引入安全风险：
- 端口转发暴露内部服务。
- File Sync 可能覆盖容器内关键文件。
- 构建密钥（如 npm token、SSH 密钥）可能泄露。

#### 最佳实践

```yaml
# 安全配置示例
build:
  artifacts:
    - image: my-app
      context: .
      docker:
        dockerfile: Dockerfile
        secrets:
          - id: npmrc
            src: ~/.npmrc  # 使用 Docker BuildKit 密钥，不会留在镜像层中
  insecureRegistries: []  # 避免使用不安全的镜像仓库
deploy:
  kubectl:
    defaultNamespace: dev-{USER}  # 每个开发者使用独立的命名空间
portForward:
  - resourceType: service
    resourceName: my-app
    port: 8080
    localPort: 8080
    address: 127.0.0.1  # 仅绑定到本地回环地址
```

- 使用 Docker BuildKit 的 `--secret` 功能传递构建密钥，避免密钥留在镜像层中。
- 端口转发绑定到 `127.0.0.1`，避免暴露到外部网络。
- 每个开发者使用独立的命名空间，避免资源冲突和安全隔离问题。
- 在 `skaffold.yaml` 中避免硬编码敏感信息，使用环境变量或外部密钥管理服务。

### 3.8.5 本章小结

Skaffold 虽然极大地简化了 Kubernetes 应用的开发-部署流程，但在实际使用中仍需关注文件监听性能、Docker daemon 依赖、Kaniko 资源消耗和安全风险等问题。通过合理的配置优化、构建器选择和 Profile 管理，可以有效规避这些风险，充分发挥 Skaffold 在持续开发与部署中的价值。

---

## 3.9 综合实战：构建完整的 Skaffold 工作流

### 3.9.1 项目结构

```
microservice-app/
├── skaffold.yaml
├── .dockerignore
├── .gitignore
├── services/
│   ├── user-service/
│   │   ├── Dockerfile
│   │   ├── pom.xml
│   │   └── src/
│   └── order-service/
│       ├── Dockerfile
│       ├── package.json
│       └── src/
├── k8s/
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── user-deployment.yaml
│   │   ├── user-service.yaml
│   │   ├── order-deployment.yaml
│   │   └── order-service.yaml
│   └── overlays/
│       ├── dev/
│       │   └── kustomization.yaml
│       └── prod/
│           └── kustomization.yaml
└── charts/
    ├── user-service/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   └── templates/
    └── order-service/
        ├── Chart.yaml
        ├── values.yaml
        └── templates/
```

### 3.9.2 完整 skaffold.yaml

```yaml
apiVersion: skaffold/v4beta6
kind: Config
metadata:
  name: microservice-app
build:
  artifacts:
    - image: user-service
      context: services/user-service
      jib:
        project: com.example:user-service
        type: maven
      sync:
        infer:
          - "target/classes/**/*.class"
        manual:
          - src: "src/main/resources/**/*"
            dest: /app/resources
    - image: order-service
      context: services/order-service
      docker:
        dockerfile: Dockerfile
      sync:
        manual:
          - src: "src/**/*.js"
            dest: /app/src
          - src: "package.json"
            dest: /app
  tagPolicy:
    gitCommit: {}
  platforms:
    - "linux/amd64"
deploy:
  kustomize:
    paths:
      - k8s/overlays/dev
    defaultNamespace: dev
portForward:
  - resourceType: service
    resourceName: user-service
    namespace: dev
    port: 8080
    localPort: 8080
  - resourceType: service
    resourceName: order-service
    namespace: dev
    port: 8081
    localPort: 8081

---
profiles:
  - name: prod
    build:
      artifacts:
        - image: user-service
          context: services/user-service
          kaniko:
            dockerfile: Dockerfile
            cache: {}
        - image: order-service
          context: services/order-service
          kaniko:
            dockerfile: Dockerfile
            cache: {}
      tagPolicy:
        inputDigest: {}
    deploy:
      helm:
        releases:
          - name: user-service
            chartPath: charts/user-service
            valuesFiles:
              - charts/user-service/values-prod.yaml
            namespace: prod
            createNamespace: true
            setValueTemplates:
              image.tag: "{{ .DIGEST }}"
          - name: order-service
            chartPath: charts/order-service
            valuesFiles:
              - charts/order-service/values-prod.yaml
            namespace: prod
            createNamespace: true
            setValueTemplates:
              image.tag: "{{ .DIGEST }}"
```

### 3.9.3 开发工作流

```bash
# 1. 本地开发（自动监听、构建、部署）
skaffold dev --port-forward

# 2. 仅构建（CI 构建阶段）
skaffold build \
  --file-output=build.json \
  --default-repo=gcr.io/my-project \
  --cache-artifacts=true \
  --profile=prod

# 3. 仅部署（CI 部署阶段）
skaffold deploy \
  --build-artifacts=build.json \
  --profile=prod

# 4. 渲染清单（GitOps 工作流）
skaffold render \
  --build-artifacts=build.json \
  --profile=prod \
  --output=rendered.yaml

# 5. 诊断配置
skaffold diagnose --profile=prod

# 6. 清理部署
skaffold delete --profile=prod
```

### 3.9.4 本章小结

通过综合实战可以看出，Skaffold 从本地开发到生产部署提供了完整的工具链支持。开发阶段使用 `skaffold dev` 实现热重载，CI 阶段使用 `skaffold build` 和 `skaffold deploy` 实现标准化构建部署，GitOps 场景使用 `skaffold render` 生成清单。合理组织项目结构和 Profile 配置，是充分发挥 Skaffold 能力的关键。

---

## 3.10 总结与展望

Skaffold 作为 Google 开源的云原生持续开发工具，通过自动化的六阶段循环（Watch → Build → Test → Deploy → Status Check → Loop），将 Kubernetes 应用的开发-部署反馈周期从分钟级压缩到秒级。其核心价值体现在：

1. **开发效率**：File Sync 机制为解释型语言提供毫秒级热重载，Artifact Mode 为多服务架构提供增量构建。
2. **配置统一**：通过 `skaffold.yaml` 和 Profile 机制，统一管理开发、测试、生产环境的构建和部署配置。
3. **工具链集成**：支持 Docker、Jib、Kaniko、Cloud Build、Buildpacks 等多种构建器，以及 Helm、kubectl、Kustomize 等多种部署器。
4. **CI/CD 标准化**：通过分离构建和部署阶段、制品传递机制，实现标准化的持续交付管道。

随着云原生生态的持续发展，Skaffold 也在不断演进。未来值得关注的趋势包括：

- **多集群部署**：Skaffold 正在加强对多集群部署场景的支持。
- **GitOps 深度集成**：与 ArgoCD、Flux 等 GitOps 工具的集成将更加紧密。
- **AI 辅助配置**：利用 AI 技术自动生成和优化 `skaffold.yaml` 配置。
- **Serverless 构建**：与更多 Serverless 构建服务（如 AWS CodeBuild、Azure ACR Tasks）的集成。

Skaffold 不仅是一个工具，更是一种云原生开发范式——让开发者专注于代码，让工具处理基础设施。
