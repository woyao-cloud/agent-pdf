# 第八章 CNB 云原生构建与自动化发布

## 8.1 CNB 流水线架构

### 8.1.1 解决的问题

在微服务和云原生架构普及的今天，传统 Jenkins 单体流水线面临维护成本高、扩展性差、配置分散等痛点。CNB（Cloud Native Build，腾讯云原生构建）是腾讯云 CODING 团队推出的云原生 CI/CD 引擎，旨在解决以下核心问题：

- **构建环境标准化**：不同开发者的本地环境差异导致"在我机器上能跑"的经典问题，CNB 提供容器化构建环境，每次构建运行在隔离的容器中，环境一致且可重复。
- **弹性伸缩**：传统 Jenkins 需要预先规划 Agent 数量，高峰期排队、低峰期浪费。CNB 基于容器实现按需分配，构建任务自动调度，无需管理构建机集群。
- **多触发场景覆盖**：从代码提交到定时发布，从手动触发到 API 集成，CNB 支持多种触发方式，满足不同发布节奏的需求。
- **流水线即代码**：通过 YAML 定义流水线，纳入版本管理，实现流水线的可追溯、可评审、可回滚。

### 8.1.2 核心原理

CNB 流水线的核心模型是一个有向无环图（DAG），由阶段（Stage）、步骤（Step）和触发条件（Trigger）三个基本元素构成。

**触发类型**

CNB 支持四种触发方式，覆盖从开发到发布的全场景：

| 触发类型 | 适用场景 | 配置方式 |
|---------|---------|---------|
| 代码提交（Webhook） | 开发分支的持续集成 | 监听 Git 仓库的 push / MR 事件 |
| 定时触发 | 夜间构建、定期安全扫描 | Cron 表达式 |
| 手动触发 | 生产发布、审批后执行 | 人工点击"立即构建" |
| API 触发 | 集成到内部发布系统 | HTTP POST 调用构建 API |

**阶段与步骤**

- **阶段（Stage）**：流水线的逻辑分组单元，同一流水线内的阶段默认**串行执行**，前一个阶段成功后才进入下一阶段。阶段之间可以传递产物（Artifacts）。
- **步骤（Step）**：阶段内的最小执行单元，同一阶段内的步骤默认**并行执行**。步骤可以是脚本命令、插件调用或子流水线。
- **条件执行**：通过 `if` 条件控制阶段或步骤是否执行，支持根据分支、变量、前序步骤状态等条件动态决策。

**变量与参数**

CNB 提供三层变量体系：

1. **内置变量**：`CI_BUILD_NUMBER`（构建号）、`CI_COMMIT_REF`（分支/Tag）、`CI_COMMIT_SHA`（提交哈希）、`CI_PROJECT_ID`（项目 ID）等，由系统自动注入。
2. **自定义参数**：在流水线配置中声明，构建时由触发者传入，支持字符串、选择列表、布尔值等类型。
3. **环境变量**：在构建计划中配置的键值对，可用于存储镜像仓库地址、部署命名空间等环境差异信息。

### 8.1.3 代码/配置实现

以下是一个完整的 CNB 流水线 YAML 配置，展示了多阶段、并行步骤、条件执行和变量使用的典型模式：

```yaml
# .coding-ci.yml
version: "2.0"
stages:
  - name: 代码检查
    displayName: "代码检查与单元测试"
    if: env.CI_COMMIT_REF == "master" || env.CI_COMMIT_REF == "develop"
    steps:
      - name: checkout
        displayName: "拉取代码"
        plugin: git-checkout
        settings:
          depth: 1
      - name: unit-test
        displayName: "单元测试"
        image: maven:3.8.6-eclipse-temurin-17
        settings:
          working_dir: $WORKSPACE
        script: |
          mvn clean test -B -Dmaven.test.failure.ignore=false
      - name: code-scan
        displayName: "SonarQube 代码扫描"
        image: sonarsource/sonar-scanner-cli:4.8
        settings:
          working_dir: $WORKSPACE
        script: |
          sonar-scanner \
            -Dsonar.projectKey=${PROJECT_KEY} \
            -Dsonar.host.url=${SONAR_HOST} \
            -Dsonar.login=${SONAR_TOKEN} \
            -Dsonar.branch.name=${CI_COMMIT_REF}

  - name: build
    displayName: "编译构建与镜像打包"
    if: env.CI_COMMIT_REF == "master" || startsWith(env.CI_COMMIT_REF, "release/")
    steps:
      - name: maven-build
        displayName: "Maven 编译"
        image: maven:3.8.6-eclipse-temurin-17
        settings:
          working_dir: $WORKSPACE
          cache:
            paths:
              - /root/.m2/repository
        script: |
          mvn clean package -B -DskipTests -U
      - name: docker-build
        displayName: "Docker 镜像构建"
        image: docker:20.10
        settings:
          working_dir: $WORKSPACE
        script: |
          docker build \
            -t ${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER} \
            -t ${DOCKER_REGISTRY}/${APP_NAME}:${CI_COMMIT_SHORT_SHA} \
            -f Dockerfile .
          docker push ${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER}
          docker push ${DOCKER_REGISTRY}/${APP_NAME}:${CI_COMMIT_SHORT_SHA}

  - name: deploy
    displayName: "部署至 TKE"
    if: env.CI_COMMIT_REF == "master"
    steps:
      - name: helm-deploy
        displayName: "Helm 升级部署"
        image: alpine/helm:3.12.0
        settings:
          working_dir: $WORKSPACE
        script: |
          helm upgrade --install ${APP_NAME} ./chart \
            --namespace ${K8S_NAMESPACE} \
            --set image.repository=${DOCKER_REGISTRY}/${APP_NAME} \
            --set image.tag=${CI_BUILD_NUMBER} \
            --set replicaCount=3 \
            --wait --timeout 5m

variables:
  APP_NAME: "user-service"
  DOCKER_REGISTRY: "ccr.ccs.tencentyun.com/my-project"
  K8S_NAMESPACE: "production"
  PROJECT_KEY: "my-project_user-service"
  SONAR_HOST: "https://sonarcloud.io"
```

### 8.1.4 使用场景

- **开发分支持续集成**：监听 `feature/*` 分支的 push 事件，自动触发编译和单元测试，快速反馈代码质量。
- **预发布环境部署**：`release/*` 分支合并后触发构建，自动部署到 Staging 环境，供 QA 验证。
- **生产环境发布**：`master` 分支合并或 Tag 推送触发完整流水线，经过质量门禁后自动部署到生产环境。
- **夜间全量构建**：通过 Cron 表达式 `0 2 * * *` 定时触发，执行全量测试和安全扫描，生成质量报告。

### 8.1.5 潜在风险与注意事项

- **Webhook 风暴**：频繁提交导致流水线并发数过高，应设置并发限制和队列策略，避免构建资源耗尽。
- **条件分支遗漏**：`if` 条件中的分支匹配逻辑需谨慎，`startsWith("release/")` 可能匹配到 `release-fix` 等非预期分支，建议使用正则或精确前缀。
- **变量泄露**：敏感信息（如 SonarToken、镜像仓库密码）应使用 CODING 的凭据管理功能，避免明文写在 YAML 中。
- **阶段超时**：长时间运行的阶段（如全量测试）应设置 `timeout` 参数，避免流水线无限等待。

### 8.1.6 本章小结

CNB 流水线架构以 DAG 模型为核心，通过 YAML 声明式配置实现了流水线即代码。四种触发方式覆盖了从开发提交到生产发布的全场景，阶段串行、步骤并行的执行模型兼顾了流程严谨性和执行效率。变量体系提供了从系统内置到用户自定义的灵活传参能力。在实际使用中，需重点关注并发控制、条件匹配精度和敏感信息管理。

---

## 8.2 代码编译与镜像构建

### 8.2.1 解决的问题

Java 项目的编译和 Docker 镜像构建是 CI/CD 流水线中最耗时的两个环节。一个中等规模的 Spring Boot 项目，Maven 编译可能耗时 3-5 分钟，Docker 构建（含基础镜像拉取、依赖层安装）可能耗时 2-4 分钟。如果每次构建都从头执行，流水线总时长将超过 10 分钟，严重影响开发效率和发布频率。

核心痛点包括：
- **依赖下载重复**：每次构建都从 Maven Central 重新下载所有依赖，网络延迟和带宽瓶颈导致构建缓慢。
- **Docker 层缓存失效**：Dockerfile 编写不当导致每次构建都重新生成所有层，无法利用 Docker 的层缓存机制。
- **镜像标签混乱**：缺乏统一的镜像标签策略，生产环境难以追溯镜像对应的代码版本。

### 8.2.2 核心原理

**Maven 构建缓存**

Maven 的本地仓库（`~/.m2/repository`）存储了所有已下载的依赖。CNB 支持在步骤级别配置缓存路径，将 `.m2/repository` 目录持久化到 COS（腾讯云对象存储）或本地存储。后续构建时，CNB 自动恢复缓存，仅下载新增或变更的依赖。

缓存策略分为三层：
1. **本地缓存**：构建节点本地磁盘缓存，速度最快但构建节点可能被回收。
2. **远程缓存（COS）**：将缓存上传到腾讯云 COS，构建节点间共享，适合大规模团队。
3. **依赖镜像**：在腾讯云 CODING 制品库中配置 Maven 代理仓库，将 Maven Central、Spring 等外部仓库的制品缓存到内网，大幅提升下载速度。

**Docker 构建加速**

Docker 镜像由多层（Layer）组成，每一条 `RUN`、`COPY`、`ADD` 指令都会生成一层。Docker 构建时，如果某层及其之前的层没有变化，则直接复用缓存层。

加速手段包括：
1. **层缓存优化**：将 `pom.xml` 的 COPY 和依赖下载放在业务代码 COPY 之前，利用层缓存避免每次重新下载依赖。
2. **BuildKit**：Docker 的新一代构建引擎，支持并发执行构建步骤、更好的层缓存管理和 `--cache-from` 远程缓存。
3. **Kaniko**：Google 推出的无特权容器化构建工具，在 Kubernetes 环境中安全构建镜像，无需挂载 Docker Socket，支持远程缓存到镜像仓库。

**镜像标签策略**

统一的标签策略是发布追溯的基础。推荐三种标签组合使用：

| 标签类型 | 格式示例 | 用途 |
|---------|---------|------|
| 语义版本 | `v1.2.3` | 正式发布版本，语义化版本号 |
| Git 提交哈希 | `a1b2c3d4` | 精确追溯代码版本 |
| 构建时间戳 | `20240615-143022` | 快速识别构建时间 |

### 8.2.3 代码/配置实现

**优化后的 Dockerfile（利用层缓存）**

```dockerfile
# ===== 构建阶段 =====
FROM maven:3.8.6-eclipse-temurin-17 AS builder

WORKDIR /build

# 第一步：只复制 pom.xml，利用层缓存
COPY pom.xml .
RUN mvn dependency:go-offline -B || true

# 第二步：复制源码并编译
COPY src ./src
RUN mvn clean package -B -DskipTests

# ===== 运行阶段 =====
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# 安全配置：非 root 用户运行
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

COPY --from=builder /build/target/*.jar app.jar

EXPOSE 8080

USER app

ENTRYPOINT ["java", "-jar", "app.jar"]
```

**使用 BuildKit 的流水线配置**

```yaml
# 使用 BuildKit 加速镜像构建
steps:
  - name: docker-buildkit
    displayName: "BuildKit 镜像构建"
    image: moby/buildkit:latest
    settings:
      working_dir: $WORKSPACE
    script: |
      # 使用 BuildKit 构建，启用缓存
      buildctl build \
        --frontend dockerfile.v0 \
        --local context=. \
        --local dockerfile=. \
        --output type=image,name=${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER},push=true \
        --export-cache type=registry,ref=${DOCKER_REGISTRY}/${APP_NAME}:buildcache \
        --import-cache type=registry,ref=${DOCKER_REGISTRY}/${APP_NAME}:buildcache
```

**使用 Kaniko 的流水线配置（推荐用于 TKE 环境）**

```yaml
steps:
  - name: kaniko-build
    displayName: "Kaniko 镜像构建"
    image: gcr.io/kaniko-project/executor:v1.12.0
    settings:
      working_dir: $WORKSPACE
    script: |
      # Kaniko 参数说明：
      #   --cache=true          启用层缓存
      #   --cache-repo          缓存存储仓库
      #   --destination         目标镜像地址
      #   --build-arg           构建参数
      /kaniko/executor \
        --context=${WORKSPACE} \
        --dockerfile=${WORKSPACE}/Dockerfile \
        --cache=true \
        --cache-repo=${DOCKER_REGISTRY}/kaniko-cache \
        --destination=${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER} \
        --destination=${DOCKER_REGISTRY}/${APP_NAME}:${CI_COMMIT_SHORT_SHA} \
        --build-arg=JAR_FILE=target/*.jar
```

**Maven 依赖镜像配置（settings.xml）**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                              http://maven.apache.org/xsd/settings-1.0.0.xsd">
  <mirrors>
    <!-- 腾讯云 CODING 制品库代理 -->
    <mirror>
      <id>tencent-cloud-proxy</id>
      <mirrorOf>central</mirrorOf>
      <name>Tencent Cloud Maven Proxy</name>
      <url>https://my-project-1234567.pkg.mirror.tencentyun.com/maven-central/</url>
    </mirror>
  </mirrors>

  <servers>
    <server>
      <id>tencent-cloud-releases</id>
      <username>${env.CODING_ARTIFACTS_USERNAME}</username>
      <password>${env.CODING_ARTIFACTS_PASSWORD}</password>
    </server>
  </servers>

  <profiles>
    <profile>
      <id>tencent-cloud</id>
      <repositories>
        <repository>
          <id>tencent-cloud-releases</id>
          <url>https://my-project-1234567.pkg.mirror.tencentyun.com/releases/</url>
        </repository>
      </repositories>
    </profile>
  </profiles>

  <activeProfiles>
    <activeProfile>tencent-cloud</activeProfile>
  </activeProfiles>
</settings>
```

**镜像标签脚本（自动生成多标签）**

```bash
#!/bin/bash
# tag-image.sh — 根据构建上下文生成镜像标签

set -euo pipefail

APP_NAME="${1:?APP_NAME required}"
REGISTRY="${2:?REGISTRY required}"
BUILD_NUMBER="${CI_BUILD_NUMBER:-$(date +%Y%m%d%H%M%S)}"
SHORT_SHA="${CI_COMMIT_SHORT_SHA:-$(git rev-parse --short HEAD)}"
GIT_TAG="${CI_COMMIT_TAG:-}"

# 基础标签：构建号 + 短哈希
TAGS=()
TAGS+=("${BUILD_NUMBER}")
TAGS+=("${SHORT_SHA}")

# 如果是 Tag 触发，添加语义版本标签
if [ -n "$GIT_TAG" ]; then
  TAGS+=("${GIT_TAG}")
  # 解析主版本和次版本
  if [[ $GIT_TAG =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    TAGS+=("v${BASH_REMATCH[1]}.${BASH_REMATCH[2]}")
    TAGS+=("v${BASH_REMATCH[1]}")
  fi
fi

# 如果是 master 分支，添加 latest 标签
if [ "${CI_COMMIT_REF:-}" = "master" ]; then
  TAGS+=("latest")
fi

# 构建并推送所有标签
for TAG in "${TAGS[@]}"; do
  docker tag "${APP_NAME}:${BUILD_NUMBER}" "${REGISTRY}/${APP_NAME}:${TAG}"
  docker push "${REGISTRY}/${APP_NAME}:${TAG}"
done

echo "已推送标签: ${TAGS[*]}"
```

### 8.2.4 使用场景

- **高频迭代项目**：每日多次发布的微服务项目，通过 Maven 远程缓存和 BuildKit 层缓存，将构建时间从 8 分钟压缩到 2 分钟以内。
- **多环境部署**：同一镜像使用不同标签部署到开发、测试、预发布和生产环境，通过标签策略确保版本可追溯。
- **离线/内网环境**：通过 CODING 制品库的 Maven 代理仓库，将外部依赖缓存到内网，避免公网下载失败。

### 8.2.5 潜在风险与注意事项

- **缓存污染**：`dependency:go-offline` 可能因网络超时导致部分依赖未下载完成，后续构建使用不完整缓存会报错。建议在缓存恢复后执行 `mvn dependency:resolve` 验证。
- **层缓存失效**：Dockerfile 中 `COPY pom.xml` 后的 `RUN mvn dependency:go-offline` 虽然利用了层缓存，但如果 `pom.xml` 频繁变更，缓存命中率会下降。对于大型项目，可考虑将依赖锁定文件（如 `pom.xml.lock`）与业务代码分离。
- **Kaniko 缓存膨胀**：`--cache-repo` 中的缓存镜像会持续增长，建议定期清理或设置缓存保留策略。
- **标签覆盖**：`latest` 标签被频繁覆盖，生产环境应避免使用 `latest`，始终使用具体版本号。

### 8.2.6 本章小结

代码编译和镜像构建是 CI/CD 流水线的性能瓶颈所在。通过 Maven 三层缓存（本地缓存、COS 远程缓存、CODING 依赖镜像）和 Docker 构建加速（层缓存优化、BuildKit、Kaniko），可以将构建时间缩短 60%-80%。统一的镜像标签策略（构建号 + 短哈希 + 语义版本）确保了版本的可追溯性。在实际应用中，需关注缓存一致性和标签管理的最佳实践。

---

## 8.3 自动部署至 TKE

### 8.3.1 解决的问题

构建完成后的镜像需要自动部署到 Kubernetes 集群。传统的手动 `kubectl set image` 方式存在操作繁琐、回滚困难、环境差异等问题。TKE（Tencent Kubernetes Engine）是腾讯云提供的托管 Kubernetes 服务，CNB 流水线需要与之集成，实现从镜像构建到服务更新的全自动化。

核心挑战包括：
- **配置管理**：不同环境的 Kubernetes 资源清单（Deployment、Service、ConfigMap）需要统一管理。
- **部署策略**：如何实现零停机更新，避免更新过程中服务不可用。
- **状态等待**：如何确保部署真正完成（Pod 全部就绪）后再继续流水线。

### 8.3.2 核心原理

CNB 支持三种部署方式，适用于不同场景：

**kubectl apply**

最直接的部署方式，通过 `kubectl apply` 将 YAML 清单提交到 Kubernetes API Server。适用于简单的 Deployment 更新，配置管理依赖 Git 仓库中的 YAML 文件。

**Helm upgrade**

Helm 是 Kubernetes 的包管理工具，通过 Chart 将一组相关的 Kubernetes 资源打包管理。`helm upgrade --install` 命令实现安装或升级，支持模板化配置和版本管理。适用于复杂应用的部署，特别是涉及多个 Kubernetes 资源（Deployment、Service、ConfigMap、Ingress 等）的场景。

**滚动更新与健康检查**

Kubernetes 的滚动更新（Rolling Update）策略逐步替换旧版本 Pod，确保服务不中断。核心机制包括：

- **Readiness Probe（就绪探针）**：Kubernetes 通过 HTTP、TCP 或命令方式检查 Pod 是否就绪。只有就绪的 Pod 才会接收流量。
- **Rollout Status**：`kubectl rollout status` 命令等待部署完成，确保所有新 Pod 通过健康检查后再继续流水线。
- **Max Surge / Max Unavailable**：控制滚动更新过程中最多可以超出期望副本数的比例和最多不可用副本数。

### 8.3.3 代码/配置实现

**Helm Chart 结构**

```
chart/
├── Chart.yaml              # Chart 元信息
├── values.yaml             # 默认配置值
├── values-production.yaml  # 生产环境覆盖值
├── templates/
│   ├── _helpers.tpl        # 模板辅助函数
│   ├── deployment.yaml     # Deployment 定义
│   ├── service.yaml        # Service 定义
│   ├── configmap.yaml      # 配置映射
│   └── hpa.yaml            # 水平自动伸缩
```

**Chart.yaml**

```yaml
apiVersion: v2
name: user-service
description: 用户服务 Helm Chart
type: application
version: 1.0.0
appVersion: 1.0.0
```

**values.yaml**

```yaml
# 默认配置
replicaCount: 3

image:
  repository: ccr.ccs.tencentyun.com/my-project/user-service
  tag: latest
  pullPolicy: Always

imagePullSecrets:
  - name: tencent-registry-secret

nameOverride: ""
fullnameOverride: ""

service:
  type: ClusterIP
  port: 8080

ingress:
  enabled: true
  className: ""
  annotations:
    kubernetes.io/ingress.class: nginx
  hosts:
    - host: user-service.example.com
      paths:
        - path: /
          pathType: Prefix
  tls: []

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

# 就绪探针和存活探针
probes:
  readiness:
    path: /actuator/health/readiness
    port: 8080
    initialDelaySeconds: 10
    periodSeconds: 10
    timeoutSeconds: 3
    failureThreshold: 3
  liveness:
    path: /actuator/health/liveness
    port: 8080
    initialDelaySeconds: 30
    periodSeconds: 15
    timeoutSeconds: 3
    failureThreshold: 5

# 滚动更新策略
rollingUpdate:
  maxSurge: 1
  maxUnavailable: 0

env:
  - name: SPRING_PROFILES_ACTIVE
    value: "production"
  - name: JAVA_OPTS
    value: "-Xmx512m -Xms256m"
```

**templates/deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "user-service.fullname" . }}
  labels:
    {{- include "user-service.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: {{ .Values.rollingUpdate.maxSurge }}
      maxUnavailable: {{ .Values.rollingUpdate.maxUnavailable }}
  selector:
    matchLabels:
      {{- include "user-service.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "user-service.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: 8080
              protocol: TCP
          env:
            {{- toYaml .Values.env | nindent 12 }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          readinessProbe:
            httpGet:
              path: {{ .Values.probes.readiness.path }}
              port: {{ .Values.probes.readiness.port }}
            initialDelaySeconds: {{ .Values.probes.readiness.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.readiness.periodSeconds }}
            timeoutSeconds: {{ .Values.probes.readiness.timeoutSeconds }}
            failureThreshold: {{ .Values.probes.readiness.failureThreshold }}
          livenessProbe:
            httpGet:
              path: {{ .Values.probes.liveness.path }}
              port: {{ .Values.probes.liveness.port }}
            initialDelaySeconds: {{ .Values.probes.liveness.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
            timeoutSeconds: {{ .Values.probes.liveness.timeoutSeconds }}
            failureThreshold: {{ .Values.probes.liveness.failureThreshold }}
```

**CNB 流水线部署步骤（Helm 方式）**

```yaml
stages:
  - name: deploy-tke
    displayName: "部署至 TKE"
    steps:
      - name: helm-deploy
        displayName: "Helm 升级部署"
        image: alpine/helm:3.12.0
        settings:
          working_dir: $WORKSPACE
        script: |
          # 登录 TKE 集群
          tke-cli login --cluster-id ${TKE_CLUSTER_ID} --region ap-guangzhou

          # 执行 Helm 部署
          helm upgrade --install ${APP_NAME} ./chart \
            --namespace ${K8S_NAMESPACE} \
            --values ./chart/values.yaml \
            --values ./chart/values-production.yaml \
            --set image.tag=${CI_BUILD_NUMBER} \
            --set replicaCount=5 \
            --wait --timeout 5m \
            --history-max 5

          # 等待 rollout 完成
          kubectl rollout status deployment/${APP_NAME} \
            --namespace ${K8S_NAMESPACE} \
            --timeout=5m

      - name: verify-deploy
        displayName: "部署验证"
        image: alpine/curl:8.4.0
        script: |
          # 获取 Service 的 ClusterIP
          SERVICE_IP=$(kubectl get svc ${APP_NAME} \
            --namespace ${K8S_NAMESPACE} \
            -o jsonpath='{.spec.clusterIP}')

          # 健康检查端点验证
          HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
            http://${SERVICE_IP}:8080/actuator/health)

          if [ "$HTTP_CODE" != "200" ]; then
            echo "健康检查失败，HTTP 状态码: $HTTP_CODE"
            exit 1
          fi
          echo "部署验证通过，服务健康"
```

**CNB 流水线部署步骤（kubectl apply 方式）**

```yaml
steps:
  - name: kubectl-apply
    displayName: "kubectl 直接部署"
    image: bitnami/kubectl:1.28
    settings:
      working_dir: $WORKSPACE
    script: |
      # 使用 envsubst 替换模板变量
      envsubst < k8s/deployment.yaml | kubectl apply -f -
      kubectl apply -f k8s/service.yaml
      kubectl apply -f k8s/configmap.yaml

      # 等待滚动更新完成
      kubectl rollout status deployment/${APP_NAME} \
        --namespace ${K8S_NAMESPACE} \
        --timeout=5m
```

**k8s/deployment.yaml（envsubst 模板）**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: ${K8S_NAMESPACE}
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
        - name: user-service
          image: ${DOCKER_REGISTRY}/user-service:${CI_BUILD_NUMBER}
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 15
```

### 8.3.4 使用场景

- **标准微服务部署**：使用 Helm Chart 管理 Deployment、Service、HPA 等资源，通过 `helm upgrade --install` 实现幂等部署。
- **配置频繁变更的服务**：使用 ConfigMap 管理配置，Helm 升级时自动更新 ConfigMap 并触发 Pod 滚动重启。
- **多环境复用 Chart**：同一套 Chart 通过不同的 values 文件（`values-dev.yaml`、`values-staging.yaml`、`values-production.yaml`）实现环境差异化配置。

### 8.3.5 潜在风险与注意事项

- **滚动更新卡死**：如果新版本 Pod 的 Readiness Probe 持续失败，滚动更新会阻塞。应设置 `progressDeadlineSeconds`（默认 10 分钟）作为超时兜底。
- **镜像拉取失败**：TKE 节点拉取镜像超时或认证失败会导致 Pod 处于 `ImagePullBackOff` 状态。建议提前在节点上缓存基础镜像，或使用 TKE 的镜像拉取加速功能。
- **ConfigMap 热更新**：Kubernetes 不会自动重启 Pod 来响应 ConfigMap 变更。如果应用不支持热加载，需要在 Helm 升级时通过 `--set` 注入一个变更值（如 `restartAt=$(date +%s)`）触发 Pod 重启。
- **资源配额不足**：滚动更新期间，新旧 Pod 可能同时运行，导致节点资源不足。需确保集群有足够的余量，或设置 `maxSurge: 0` 先停止旧 Pod 再启动新 Pod。

### 8.3.6 本章小结

自动部署至 TKE 是 CNB 流水线的最终执行环节。Helm 提供了模板化、版本化的 Kubernetes 资源管理能力，结合滚动更新和健康检查机制，实现了零停机的自动化部署。`kubectl apply` 方式适合简单场景，Helm 方式适合复杂应用。无论哪种方式，都必须配置 Readiness Probe 和 Rollout Status 等待，确保部署真正成功后再继续后续流程。

---

## 8.4 质量门禁

### 8.4.1 解决的问题

自动化流水线在追求效率的同时，不能牺牲代码质量。没有质量门禁的流水线，相当于"自动制造缺陷"。质量门禁（Quality Gate）是一组在流水线中自动执行的质量检查关卡，只有通过所有关卡才能进入下一阶段。

核心目标：
- **防止低质量代码进入生产环境**：在编译阶段拦截编译错误，在测试阶段拦截测试失败，在扫描阶段拦截安全漏洞。
- **量化质量指标**：通过测试覆盖率、代码异味、安全漏洞等指标，客观评估代码质量。
- **自动化质量反馈**：将质量检查结果自动通知到开发团队，缩短问题发现和修复的周期。

### 8.4.2 核心原理

CNB 流水线中的质量门禁通常包含三个层次：

**单元测试（Maven Surefire）**

Maven Surefire Plugin 是 Java 项目的标准单元测试框架，支持 JUnit 4/5、TestNG。Surefire 生成 XML 格式的测试报告，CNB 可以解析报告并判断测试通过率。

关键配置：
- `-Dmaven.test.failure.ignore=false`：测试失败时终止构建。
- 测试报告收集：CNB 自动收集 `target/surefire-reports/*.xml` 并在构建详情中展示。

**代码扫描（SonarQube）**

SonarQube 是业界主流的代码质量平台，通过静态分析发现代码异味、Bug、安全漏洞和安全热点。SonarQube 的质量门禁（Quality Gate）是一组可配置的阈值条件，如：

- 新增代码覆盖率 < 80%
- 新增代码异味密度 > 3%
- 新增 Bug 或漏洞数量 > 0
- 重复代码比例 > 5%

**镜像安全扫描（Trivy）**

Trivy 是 Aqua Security 开源的容器镜像漏洞扫描工具，能够检测操作系统包（apt、yum、apk）和应用依赖（Maven、npm、pip）中的已知 CVE 漏洞。Trivy 支持按严重级别（CRITICAL、HIGH、MEDIUM、LOW）设置阈值，超过阈值的镜像禁止部署。

### 8.4.3 代码/配置实现

**Maven Surefire 配置（pom.xml）**

```xml
<build>
  <plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-surefire-plugin</artifactId>
      <version>3.1.2</version>
      <configuration>
        <!-- 测试失败时终止构建 -->
        <failIfNoTests>true</failIfNoTests>
        <!-- 并行执行测试 -->
        <parallel>methods</parallel>
        <threadCount>4</threadCount>
        <!-- 测试报告格式 -->
        <reportsDirectory>${project.build.directory}/surefire-reports</reportsDirectory>
        <!-- 包含的测试模式 -->
        <includes>
          <include>**/*Test.java</include>
          <include>**/*Tests.java</include>
        </includes>
        <!-- 排除的测试模式 -->
        <excludes>
          <exclude>**/*IntegrationTest.java</exclude>
          <exclude>**/*IT.java</exclude>
        </excludes>
      </configuration>
    </plugin>

    <!-- JaCoCo 覆盖率插件 -->
    <plugin>
      <groupId>org.jacoco</groupId>
      <artifactId>jacoco-maven-plugin</artifactId>
      <version>0.8.11</version>
      <executions>
        <execution>
          <id>prepare-agent</id>
          <goals>
            <goal>prepare-agent</goal>
          </goals>
        </execution>
        <execution>
          <id>report</id>
          <phase>test</phase>
          <goals>
            <goal>report</goal>
          </goals>
        </execution>
        <execution>
          <id>check</id>
          <phase>verify</phase>
          <goals>
            <goal>check</goal>
          </goals>
          <configuration>
            <rules>
              <rule>
                <element>BUNDLE</element>
                <limits>
                  <limit>
                    <counter>LINE</counter>
                    <value>COVEREDRATIO</value>
                    <minimum>0.80</minimum>
                  </limit>
                </limits>
              </rule>
            </rules>
          </configuration>
        </execution>
      </executions>
    </plugin>
  </plugins>
</build>
```

**SonarQube 集成流水线步骤**

```yaml
stages:
  - name: quality-gate
    displayName: "质量门禁"
    steps:
      - name: sonar-scan
        displayName: "SonarQube 代码扫描"
        image: sonarsource/sonar-scanner-cli:4.8
        settings:
          working_dir: $WORKSPACE
        script: |
          sonar-scanner \
            -Dsonar.projectKey=${PROJECT_KEY} \
            -Dsonar.projectName="用户服务" \
            -Dsonar.host.url=${SONAR_HOST} \
            -Dsonar.login=${SONAR_TOKEN} \
            -Dsonar.branch.name=${CI_COMMIT_REF} \
            -Dsonar.java.binaries=target/classes \
            -Dsonar.coverage.jacoco.xmlReportPaths=target/site/jacoco/jacoco.xml \
            -Dsonar.exclusions="**/test/**/*,**/generated/**/*" \
            -Dsonar.qualitygate.wait=true \
            -Dsonar.qualitygate.timeout=300

      - name: trivy-scan
        displayName: "Trivy 镜像安全扫描"
        image: aquasec/trivy:0.48
        settings:
          working_dir: $WORKSPACE
        script: |
          # 扫描镜像，仅输出 CRITICAL 和 HIGH 级别漏洞
          trivy image \
            --severity CRITICAL,HIGH \
            --ignore-unfixed \
            --exit-code 1 \
            --format table \
            ${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER}

      - name: quality-report
        displayName: "质量报告汇总"
        image: alpine:3.18
        script: |
          echo "========================================="
          echo "  质量门禁检查结果"
          echo "========================================="
          echo "✓ 单元测试: 已通过"
          echo "✓ 代码覆盖率: 已达标 (>= 80%)"
          echo "✓ SonarQube: 质量门禁通过"
          echo "✓ Trivy: 无高危/严重漏洞"
          echo "========================================="
          echo "构建 ${CI_BUILD_NUMBER} 质量门禁全部通过"
```

**Trivy 高级配置（trivy-config.yaml）**

```yaml
# trivy-config.yaml
severity: CRITICAL,HIGH
ignore-unfixed: true
exit-code: 1
format: table
output: trivy-report.txt

vulnerability:
  # 忽略特定 CVE
  exclude:
    - CVE-2023-12345  # 已确认不影响当前使用方式

scan:
  # 跳过无需扫描的路径
  skip-dirs:
    - /usr/share/doc
    - /usr/share/man

timeout: 10m
```

**质量门禁流水线（完整版，含失败阻断）**

```yaml
stages:
  - name: unit-test
    displayName: "单元测试"
    steps:
      - name: run-tests
        displayName: "执行单元测试"
        image: maven:3.8.6-eclipse-temurin-17
        settings:
          working_dir: $WORKSPACE
          cache:
            paths:
              - /root/.m2/repository
        script: |
          mvn clean test jacoco:report -B
        # 测试失败时阻断流水线
        when:
          - status: failure
            action: abort

  - name: code-analysis
    displayName: "代码分析"
    steps:
      - name: sonar-scan
        displayName: "SonarQube 扫描"
        image: sonarsource/sonar-scanner-cli:4.8
        settings:
          working_dir: $WORKSPACE
        script: |
          sonar-scanner \
            -Dsonar.projectKey=${PROJECT_KEY} \
            -Dsonar.host.url=${SONAR_HOST} \
            -Dsonar.login=${SONAR_TOKEN} \
            -Dsonar.qualitygate.wait=true \
            -Dsonar.qualitygate.timeout=300
        # SonarQube 质量门禁失败时阻断
        when:
          - status: failure
            action: abort

  - name: image-scan
    displayName: "镜像安全扫描"
    steps:
      - name: trivy-scan
        displayName: "Trivy 漏洞扫描"
        image: aquasec/trivy:0.48
        settings:
          working_dir: $WORKSPACE
        script: |
          trivy image \
            --severity CRITICAL,HIGH \
            --ignore-unfixed \
            --exit-code 1 \
            ${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER}
        when:
          - status: failure
            action: abort
```

### 8.4.4 使用场景

- **生产发布流水线**：所有质量门禁必须全部通过，任何一项失败都阻断发布。
- **开发分支持续集成**：仅执行单元测试和 SonarQube 扫描（不阻断），用于快速反馈。
- **夜间全量构建**：执行完整质量门禁（含 Trivy 全量扫描），生成质量报告发送给团队。

### 8.4.5 潜在风险与注意事项

- **SonarQube 超时**：大型项目的首次扫描可能超过 `qualitygate.timeout`（默认 300 秒）。建议增量扫描或延长超时时间。
- **Trivy 误报**：部分 CVE 在特定运行时环境中不构成实际威胁（如通过内网隔离缓解的网络攻击）。建议维护 `.trivyignore` 文件管理已知误报。
- **测试环境依赖**：单元测试如果依赖外部服务（数据库、Redis），可能导致测试不稳定。应使用 Testcontainers 或 Mock 框架隔离外部依赖。
- **覆盖率虚高**：仅追求覆盖率数字可能导致"为覆盖而覆盖"的无效测试。应结合变异测试（Pitest）评估测试质量。

### 8.4.6 本章小结

质量门禁是自动化流水线的"守门员"。通过 Maven Surefire 单元测试、SonarQube 代码扫描和 Trivy 镜像安全扫描三层门禁，从代码质量、安全漏洞、依赖风险三个维度保障发布质量。质量门禁的阈值需要根据团队和项目的实际情况动态调整，过严会阻碍交付效率，过松则失去意义。建议采用渐进式策略：先收集基线数据，再逐步收紧阈值。

---

## 8.5 发布策略

### 8.5.1 解决的问题

将新版本部署到生产环境是软件交付中最关键也最危险的环节。直接替换所有 Pod 的方式（Recreate 策略）会导致服务中断；而简单的滚动更新虽然保证了可用性，但无法在问题扩散前快速止损。

发布策略需要解决的核心问题：
- **风险控制**：如何将新版本的影响范围控制在最小，在发现问题时快速回退。
- **流量管理**：如何精确控制新旧版本之间的流量分配比例。
- **可观测性**：如何在发布过程中实时监控服务状态，及时发现异常。

### 8.5.2 核心原理

**蓝绿部署（Blue-Green Deployment）**

蓝绿部署维护两套完全独立的环境（蓝环境和绿环境），同一时刻只有一套环境对外提供服务。

工作流程：
1. 当前生产流量指向蓝环境（旧版本）。
2. 新版本部署到绿环境，执行完整的健康检查和冒烟测试。
3. 确认绿环境正常后，将流量入口（Service/Ingress）从蓝环境切换到绿环境。
4. 蓝环境保留作为回滚目标。

**金丝雀发布（Canary Release）**

金丝雀发布将新版本逐步引入，先让少量用户使用新版本，观察指标正常后再逐步扩大范围。

工作流程：
1. 部署新版本（金丝雀），初始只分配 5%-10% 的流量。
2. 监控错误率、延迟、业务指标。
3. 如果指标正常，逐步增加流量比例（20% → 50% → 100%）。
4. 如果指标异常，立即将流量切回旧版本。

**回滚机制**

- **Helm rollback**：`helm rollback RELEASE REVISION` 将 Helm Release 回滚到指定版本，自动恢复所有 Kubernetes 资源到之前的状态。
- **kubectl rollout undo**：`kubectl rollout undo deployment/NAME` 将 Deployment 回滚到上一个版本。

### 8.5.3 代码/配置实现

**蓝绿部署脚本**

```bash
#!/bin/bash
# blue-green-deploy.sh — 蓝绿部署实现

set -euo pipefail

APP_NAME="${1:?APP_NAME required}"
NAMESPACE="${2:?NAMESPACE required}"
IMAGE="${3:?IMAGE required}"

# 确定当前活跃环境
CURRENT_COLOR=$(kubectl get svc "${APP_NAME}-svc" \
  --namespace "${NAMESPACE}" \
  -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo "blue")

if [ "$CURRENT_COLOR" = "blue" ]; then
  NEW_COLOR="green"
  OLD_COLOR="blue"
else
  NEW_COLOR="blue"
  OLD_COLOR="green"
fi

echo "当前活跃环境: ${OLD_COLOR}"
echo "部署新版本到: ${NEW_COLOR}"

# 部署新版本
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${APP_NAME}-${NEW_COLOR}
  namespace: ${NAMESPACE}
spec:
  replicas: 5
  selector:
    matchLabels:
      app: ${APP_NAME}
      color: ${NEW_COLOR}
  template:
    metadata:
      labels:
        app: ${APP_NAME}
        color: ${NEW_COLOR}
    spec:
      containers:
        - name: ${APP_NAME}
          image: ${IMAGE}
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 15
EOF

# 等待新环境就绪
echo "等待 ${NEW_COLOR} 环境就绪..."
kubectl rollout status deployment/${APP_NAME}-${NEW_COLOR} \
  --namespace ${NAMESPACE} \
  --timeout=5m

# 执行冒烟测试
echo "执行冒烟测试..."
SMOKE_IP=$(kubectl get pod -l "app=${APP_NAME},color=${NEW_COLOR}" \
  --namespace ${NAMESPACE} \
  -o jsonpath='{.items[0].status.podIP}' | head -1)

HTTP_CODE=$(kubectl exec -n ${NAMESPACE} \
  deployment/${APP_NAME}-${NEW_COLOR} -- \
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/actuator/health)

if [ "$HTTP_CODE" != "200" ]; then
  echo "冒烟测试失败，HTTP 状态码: $HTTP_CODE"
  echo "回滚中..."
  kubectl delete deployment/${APP_NAME}-${NEW_COLOR} -n ${NAMESPACE}
  exit 1
fi

# 切换流量
echo "切换流量到 ${NEW_COLOR} 环境..."
kubectl patch svc "${APP_NAME}-svc" \
  --namespace "${NAMESPACE}" \
  -p "{\"spec\":{\"selector\":{\"color\":\"${NEW_COLOR}\"}}}"

echo "蓝绿部署完成！"
echo "新版本环境: ${NEW_COLOR}"
echo "旧版本环境: ${OLD_COLOR}（保留用于回滚）"
```

**金丝雀发布脚本**

```bash
#!/bin/bash
# canary-deploy.sh — 金丝雀发布实现

set -euo pipefail

APP_NAME="${1:?APP_NAME required}"
NAMESPACE="${2:?NAMESPACE required}"
IMAGE="${3:?IMAGE required}"

# 金丝雀发布阶段
canary_stages=(5 20 50 100)

# 部署金丝雀版本（初始 5%）
echo "部署金丝雀版本（5% 流量）..."
kubectl set image deployment/${APP_NAME}-canary \
  --namespace ${NAMESPACE} \
  ${APP_NAME}=${IMAGE}

kubectl scale deployment/${APP_NAME}-canary \
  --namespace ${NAMESPACE} \
  --replicas=1

# 等待金丝雀就绪
kubectl rollout status deployment/${APP_NAME}-canary \
  --namespace ${NAMESPACE} \
  --timeout=3m

# 逐步增加流量
for PERCENT in "${canary_stages[@]}"; do
  echo "扩容金丝雀到 ${PERCENT}%..."

  # 计算副本数
  TOTAL_REPLICAS=10
  CANARY_REPLICAS=$(( TOTAL_REPLICAS * PERCENT / 100 ))
  STABLE_REPLICAS=$(( TOTAL_REPLICAS - CANARY_REPLICAS ))

  kubectl scale deployment/${APP_NAME}-canary \
    --namespace ${NAMESPACE} \
    --replicas=${CANARY_REPLICAS}

  kubectl scale deployment/${APP_NAME}-stable \
    --namespace ${NAMESPACE} \
    --replicas=${STABLE_REPLICAS}

  # 等待就绪
  kubectl rollout status deployment/${APP_NAME}-canary \
    --namespace ${NAMESPACE} \
    --timeout=3m

  # 监控指标检查（示例：检查错误率）
  echo "检查 ${PERCENT}% 阶段的错误率..."
  sleep 30  # 等待指标采集

  # 实际项目中应调用监控 API 检查
  # 这里简化为模拟检查
  ERROR_RATE=$(curl -s "http://monitor-api/query?query=error_rate{app='${APP_NAME}'}" \
    | jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")

  if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
    echo "错误率过高 (${ERROR_RATE}%)，触发回滚！"
    # 执行回滚
    kubectl scale deployment/${APP_NAME}-canary \
      --namespace ${NAMESPACE} \
      --replicas=0
    kubectl scale deployment/${APP_NAME}-stable \
      --namespace ${NAMESPACE} \
      --replicas=10
    exit 1
  fi

  echo "${PERCENT}% 阶段通过"
done

# 金丝雀发布完成，将稳定版本更新为新版本
echo "金丝雀发布完成，更新稳定版本..."
kubectl set image deployment/${APP_NAME}-stable \
  --namespace ${NAMESPACE} \
  ${APP_NAME}=${IMAGE}

kubectl scale deployment/${APP_NAME}-stable \
  --namespace ${NAMESPACE} \
  --replicas=10

kubectl scale deployment/${APP_NAME}-canary \
  --namespace ${NAMESPACE} \
  --replicas=0

echo "金丝雀发布成功完成！"
```

**Helm 回滚流水线步骤**

```yaml
stages:
  - name: rollback
    displayName: "回滚操作"
    if: env.ROLLBACK_REVISION != ""
    steps:
      - name: helm-rollback
        displayName: "Helm 回滚"
        image: alpine/helm:3.12.0
        settings:
          working_dir: $WORKSPACE
        script: |
          # 查看发布历史
          helm history ${APP_NAME} --namespace ${K8S_NAMESPACE}

          # 回滚到指定版本
          helm rollback ${APP_NAME} ${ROLLBACK_REVISION} \
            --namespace ${K8S_NAMESPACE} \
            --wait --timeout 5m

          # 验证回滚状态
          kubectl rollout status deployment/${APP_NAME} \
            --namespace ${K8S_NAMESPACE} \
            --timeout=5m

      - name: rollback-verify
        displayName: "回滚验证"
        image: alpine/curl:8.4.0
        script: |
          echo "回滚完成，执行健康检查..."
          kubectl get pods -n ${K8S_NAMESPACE} -l app=${APP_NAME}
          echo "回滚验证通过"
```

**kubectl rollout undo 回滚**

```yaml
steps:
  - name: kubectl-rollback
    displayName: "kubectl 回滚"
    image: bitnami/kubectl:1.28
    script: |
      # 查看部署历史
      kubectl rollout history deployment/${APP_NAME} \
        --namespace ${K8S_NAMESPACE}

      # 回滚到上一个版本
      kubectl rollout undo deployment/${APP_NAME} \
        --namespace ${K8S_NAMESPACE}

      # 或回滚到指定版本
      # kubectl rollout undo deployment/${APP_NAME} \
      #   --namespace ${K8S_NAMESPACE} \
      #   --to-revision=3

      # 等待回滚完成
      kubectl rollout status deployment/${APP_NAME} \
        --namespace ${K8S_NAMESPACE} \
        --timeout=5m
```

**CNB 流水线完整发布策略（含人工审批）**

```yaml
stages:
  - name: deploy-canary
    displayName: "金丝雀发布"
    steps:
      - name: canary-deploy
        displayName: "部署金丝雀版本"
        image: alpine/helm:3.12.0
        script: |
          helm upgrade --install ${APP_NAME}-canary ./chart \
            --namespace ${K8S_NAMESPACE} \
            --set image.tag=${CI_BUILD_NUMBER} \
            --set replicaCount=1 \
            --set canary.enabled=true \
            --wait --timeout 3m

  - name: manual-approve
    displayName: "人工审批"
    steps:
      - name: approval
        displayName: "确认金丝雀版本正常"
        plugin: manual-approval
        settings:
          timeout: 3600
          approvers:
            - "team-lead"
            - "qa-lead"
          description: |
            金丝雀版本已部署，请确认：
            1. 错误率无异常上升
            2. 响应延迟在正常范围内
            3. 业务指标正常

  - name: full-release
    displayName: "全量发布"
    steps:
      - name: scale-up
        displayName: "扩容新版本"
        image: alpine/helm:3.12.0
        script: |
          helm upgrade --install ${APP_NAME} ./chart \
            --namespace ${K8S_NAMESPACE} \
            --set image.tag=${CI_BUILD_NUMBER} \
            --set replicaCount=10 \
            --wait --timeout 5m

          # 清理金丝雀
          helm delete ${APP_NAME}-canary --namespace ${K8S_NAMESPACE} || true
```

### 8.5.4 使用场景

- **核心业务服务**：用户服务、订单服务等核心链路，推荐蓝绿部署，确保发布过程中服务完全可用。
- **实验性功能**：推荐金丝雀发布，先让内部用户或小部分外部用户使用，收集反馈后再全量发布。
- **紧急修复**：Hotfix 场景下，使用滚动更新快速修复，保留回滚能力。
- **大版本升级**：涉及数据库 Schema 变更的大版本，建议蓝绿部署 + 灰度验证，确保数据兼容性。

### 8.5.5 潜在风险与注意事项

- **蓝绿部署资源消耗**：需要维护两套完整环境，资源成本翻倍。对于资源紧张的项目，可考虑金丝雀发布。
- **金丝雀流量切分精度**：基于副本数的流量切分是粗粒度的（如 1:9 比例），对于流量极小的服务，1 个金丝雀 Pod 可能承担 50% 流量。建议使用 Service Mesh（如 Istio）实现精确的百分比流量路由。
- **回滚时的 Schema 兼容性**：如果新版本引入了数据库 Schema 变更（如新增列、修改索引），回滚到旧版本可能导致数据不一致。建议遵循"向前兼容"原则，新 Schema 变更分多步发布。
- **回滚超时**：回滚操作本身也可能失败（如新版本无法正常停止）。应设置回滚超时，超时后强制删除 Pod。
- **发布审批疲劳**：每次发布都需要人工审批会导致审批流于形式。建议根据变更类型差异化审批策略：普通变更自动发布，高风险变更人工审批。

### 8.5.6 本章小结

发布策略是 DevOps 成熟度的核心体现。蓝绿部署通过环境隔离实现了零风险切换，适合核心业务；金丝雀发布通过渐进式流量迁移实现了风险可控的灰度发布，适合实验性功能。无论哪种策略，都必须配套完善的回滚机制。Helm rollback 和 kubectl rollout undo 提供了不同粒度的回滚能力。在实际应用中，发布策略的选择需要综合考虑业务重要性、资源成本和风险容忍度。

---

## 8.6 潜在风险

### 8.6.1 解决的问题

自动化流水线虽然提升了效率，但也引入了新的风险维度。一个配置不当的流水线可能比手动操作造成更大的破坏——自动化只是放大了操作的速度，同时也放大了错误的影响范围。

本节系统梳理 CNB 流水线全生命周期中的潜在风险，帮助团队建立风险意识和应对预案。

### 8.6.2 核心风险分析

**一、流水线阻塞**

| 风险类型 | 表现 | 影响 |
|---------|------|------|
| 依赖下载失败 | Maven Central 不可用、网络超时 | 构建卡在依赖下载阶段 |
| 构建超时 | 测试执行时间过长、Docker 构建卡死 | 流水线超时失败 |
| 资源不足 | 构建节点 CPU/内存不足 | 构建任务排队或 OOM |
| 并发冲突 | 多个构建同时操作同一资源 | 镜像标签覆盖、部署冲突 |

**二、构建环境不一致**

| 风险类型 | 表现 | 影响 |
|---------|------|------|
| JDK 版本差异 | 本地 JDK 11，CI 环境 JDK 17 | 编译通过但运行时行为不同 |
| 操作系统差异 | 本地 macOS，CI 环境 Linux | 文件路径、字符编码问题 |
| 依赖版本漂移 | CI 环境使用最新快照版本 | 本地测试通过，CI 构建失败 |
| 时区/区域设置 | 本地 Asia/Shanghai，CI UTC | 时间相关测试失败 |

**三、回滚失败**

| 风险类型 | 表现 | 影响 |
|---------|------|------|
| Schema 不兼容 | 新版本新增 NOT NULL 列，回滚后数据丢失 | 数据损坏 |
| API 不兼容 | 新版本修改了 API 响应格式，回滚后客户端报错 | 服务不可用 |
| 数据迁移不可逆 | 回滚无法恢复已迁移的数据 | 数据不一致 |
| 回滚超时 | 新版本 Pod 无法正常终止 | 回滚卡住 |

### 8.6.3 应对方案

**依赖下载失败应对**

```yaml
steps:
  - name: maven-build
    displayName: "Maven 编译（带重试）"
    image: maven:3.8.6-eclipse-temurin-17
    settings:
      working_dir: $WORKSPACE
      retry: 3  # 失败自动重试 3 次
      retry_interval: 30  # 重试间隔 30 秒
    script: |
      # 使用国内镜像源
      mvn clean package -B -DskipTests \
        -Dmaven.repo.local=/root/.m2/repository \
        -Dsettings.file=ci/settings.xml

      # 如果失败，输出详细日志
      if [ $? -ne 0 ]; then
        echo "Maven 构建失败，检查依赖下载状态..."
        ls -la /root/.m2/repository/ 2>/dev/null | head -20
        exit 1
      fi
```

**构建环境一致性保障**

```yaml
# 使用固定版本的构建镜像，避免版本漂移
steps:
  - name: build
    displayName: "标准化构建环境"
    # 使用精确版本标签，不使用 latest
    image: maven:3.8.6-eclipse-temurin-17
    settings:
      working_dir: $WORKSPACE
    script: |
      # 验证构建环境
      echo "Java 版本:"
      java -version 2>&1
      echo "Maven 版本:"
      mvn --version 2>&1 | head -3
      echo "操作系统:"
      uname -a

      # 设置统一的时区和编码
      export TZ=Asia/Shanghai
      export LANG=zh_CN.UTF-8

      # 执行构建
      mvn clean package -B -DskipTests
```

**数据库 Schema 兼容性检查脚本**

```bash
#!/bin/bash
# schema-check.sh — 数据库 Schema 兼容性检查

set -euo pipefail

DB_HOST="${1:?DB_HOST required}"
DB_PORT="${2:?DB_PORT required}"
DB_NAME="${3:?DB_NAME required}"
NEW_VERSION="${4:?NEW_VERSION required}"

echo "检查 Schema 兼容性..."

# 使用 Flyway 的检查模式（dry-run）
flyway -url="jdbc:mysql://${DB_HOST}:${DB_PORT}/${DB_NAME}" \
  -user=${DB_USER} \
  -password=${DB_PASSWORD} \
  -locations=filesystem:db/migrations \
  -target=${NEW_VERSION} \
  -dryRunOutput=dry-run.sql \
  migrate

# 检查是否有破坏性变更
if grep -qE "(DROP TABLE|DROP COLUMN|ALTER.*DROP|RENAME TABLE)" dry-run.sql; then
  echo "⚠️ 检测到破坏性 Schema 变更！"
  echo "以下操作可能导致回滚困难："
  grep -nE "(DROP TABLE|DROP COLUMN|ALTER.*DROP|RENAME TABLE)" dry-run.sql
  echo ""
  echo "建议："
  echo "1. 将破坏性变更拆分为多个版本"
  echo "2. 先 ADD 新列/表，再逐步废弃旧列/表"
  echo "3. 确保变更可逆"
  exit 1
fi

echo "Schema 兼容性检查通过"
```

**回滚预检查脚本**

```bash
#!/bin/bash
# pre-rollback-check.sh — 回滚前置检查

set -euo pipefail

APP_NAME="${1:?APP_NAME required}"
NAMESPACE="${2:?NAMESPACE required}"
TARGET_REVISION="${3:?TARGET_REVISION required}"

echo "执行回滚前置检查..."

# 1. 检查目标版本是否存在
echo "检查 Helm Release 历史..."
helm history ${APP_NAME} --namespace ${NAMESPACE}

if ! helm history ${APP_NAME} --namespace ${NAMESPACE} \
  | grep -q "${TARGET_REVISION}"; then
  echo "错误：目标版本 ${TARGET_REVISION} 不存在"
  exit 1
fi

# 2. 检查当前版本状态
echo "检查当前部署状态..."
CURRENT_STATUS=$(kubectl rollout status deployment/${APP_NAME} \
  --namespace ${NAMESPACE} \
  --timeout=30s 2>&1 || echo "unhealthy")

if [ "$CURRENT_STATUS" = "unhealthy" ]; then
  echo "⚠️ 当前部署状态异常，回滚可能失败"
  echo "建议手动排查后再执行回滚"
fi

# 3. 检查关键资源
echo "检查 PVC/存储状态..."
kubectl get pvc -n ${NAMESPACE} -l app=${APP_NAME}

# 4. 检查数据库连接
echo "检查数据库连接..."
kubectl exec -n ${NAMESPACE} deployment/${APP_NAME} -- \
  curl -s http://localhost:8080/actuator/health 2>/dev/null \
  | grep -q "UP" && echo "数据库连接正常" || echo "⚠️ 数据库连接异常"

echo "回滚前置检查完成"
```

**流水线超时和熔断配置**

```yaml
stages:
  - name: build
    displayName: "编译构建"
    # 阶段级别超时
    timeout: 600
    steps:
      - name: maven-build
        displayName: "Maven 编译"
        image: maven:3.8.6-eclipse-temurin-17
        # 步骤级别超时
        settings:
          timeout: 300
          working_dir: $WORKSPACE
        script: |
          mvn clean package -B -DskipTests

  - name: deploy
    displayName: "部署"
    timeout: 600
    steps:
      - name: helm-deploy
        displayName: "Helm 部署"
        image: alpine/helm:3.12.0
        settings:
          timeout: 300
        script: |
          helm upgrade --install ${APP_NAME} ./chart \
            --namespace ${K8S_NAMESPACE} \
            --set image.tag=${CI_BUILD_NUMBER} \
            --wait --timeout 5m
```

### 8.6.4 风险监控与告警

```yaml
# 流水线风险监控配置
stages:
  - name: risk-monitor
    displayName: "风险监控"
    steps:
      - name: build-duration
        displayName: "构建耗时监控"
        image: alpine:3.18
        script: |
          # 记录构建耗时
          START_TIME=$(date +%s)
          # ... 构建逻辑 ...
          END_TIME=$(date +%s)
          DURATION=$((END_TIME - START_TIME))

          # 如果构建耗时超过基线 2 倍，发出告警
          BASELINE=180  # 3 分钟基线
          if [ $DURATION -gt $((BASELINE * 2)) ]; then
            echo "⚠️ 构建耗时异常: ${DURATION}s (基线: ${BASELINE}s)"
            # 发送告警到企业微信/钉钉
            curl -X POST ${WEBHOOK_URL} \
              -H "Content-Type: application/json" \
              -d "{
                \"msgtype\": \"text\",
                \"text\": {
                  \"content\": \"构建耗时告警: ${APP_NAME} 构建 ${CI_BUILD_NUMBER} 耗时 ${DURATION}s，超过基线 ${BASELINE}s\"
                }
              }"
          fi

      - name: failure-rate
        displayName: "失败率监控"
        image: alpine:3.18
        script: |
          # 查询最近 10 次构建状态
          # 如果失败率超过 20%，发出告警
          echo "检查最近构建失败率..."
          # 实际项目中通过 CODING API 查询
```

### 8.6.5 风险应对策略总结

| 风险类别 | 预防措施 | 检测手段 | 应急方案 |
|---------|---------|---------|---------|
| 依赖下载失败 | 内网镜像仓库、缓存预热 | 构建日志监控 | 自动重试、切换备用源 |
| 构建超时 | 设置合理超时、优化构建步骤 | 超时告警 | 拆分构建、增加资源 |
| 环境不一致 | 容器化构建环境、固定版本镜像 | 环境检查步骤 | 统一构建镜像版本 |
| Schema 不兼容 | 向前兼容设计、分步变更 | 自动 Schema 检查 | 数据备份、手动修复 |
| 回滚失败 | 回滚预检查、保留旧版本 | 回滚状态监控 | 手动 kubectl 操作 |
| 并发冲突 | 互斥锁、构建队列 | 构建状态检查 | 串行化关键操作 |

### 8.6.6 本章小结

自动化流水线的风险不是"要不要面对"的问题，而是"如何管理"的问题。依赖下载失败、构建环境不一致、回滚失败是三大高频风险。通过容器化构建环境、内网镜像仓库、Schema 兼容性检查和回滚预检查等机制，可以将风险控制在可接受范围内。关键原则是：**自动化之前先标准化，标准化之后才自动化**。没有标准化流程的自动化，只会让错误跑得更快。

---

## 8.7 综合实战：从代码提交到生产发布

### 8.7.1 完整流水线示例

以下是一个完整的 CNB 流水线，整合了本章介绍的所有核心能力：

```yaml
# .coding-ci.yml — 完整生产发布流水线
version: "2.0"

# ===== 全局配置 =====
timeout: 1800
parallel: 1
queue:
  mode: fifo
  max: 3

# ===== 变量定义 =====
variables:
  APP_NAME: "user-service"
  DOCKER_REGISTRY: "ccr.ccs.tencentyun.com/my-project"
  K8S_NAMESPACE: "production"
  SONAR_HOST: "https://sonarcloud.io"
  TKE_CLUSTER_ID: "cls-xxxxxxxx"

# ===== 阶段定义 =====
stages:
  # ===== 阶段 1：代码检查 =====
  - name: code-check
    displayName: "代码检查"
    if: env.CI_COMMIT_REF == "master" || startsWith(env.CI_COMMIT_REF, "release/")
    steps:
      - name: checkout
        displayName: "拉取代码"
        plugin: git-checkout
        settings:
          depth: 1
          submodule: false

      - name: unit-test
        displayName: "单元测试"
        image: maven:3.8.6-eclipse-temurin-17
        settings:
          working_dir: $WORKSPACE
          cache:
            paths:
              - /root/.m2/repository
          retry: 2
        script: |
          mvn clean test jacoco:report -B \
            -Dmaven.test.failure.ignore=false \
            -s ci/settings.xml

      - name: sonar-scan
        displayName: "SonarQube 扫描"
        image: sonarsource/sonar-scanner-cli:4.8
        settings:
          working_dir: $WORKSPACE
        script: |
          sonar-scanner \
            -Dsonar.projectKey=${PROJECT_KEY} \
            -Dsonar.host.url=${SONAR_HOST} \
            -Dsonar.login=${SONAR_TOKEN} \
            -Dsonar.qualitygate.wait=true \
            -Dsonar.qualitygate.timeout=300

  # ===== 阶段 2：编译构建 =====
  - name: build
    displayName: "编译构建"
    steps:
      - name: maven-package
        displayName: "Maven 打包"
        image: maven:3.8.6-eclipse-temurin-17
        settings:
          working_dir: $WORKSPACE
          cache:
            paths:
              - /root/.m2/repository
        script: |
          mvn clean package -B -DskipTests \
            -s ci/settings.xml

      - name: docker-build
        displayName: "Docker 构建"
        image: docker:20.10
        settings:
          working_dir: $WORKSPACE
        script: |
          # 登录镜像仓库
          docker login ${DOCKER_REGISTRY} \
            -u ${DOCKER_USERNAME} \
            -p ${DOCKER_PASSWORD}

          # 构建并推送
          docker build \
            -t ${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER} \
            -t ${DOCKER_REGISTRY}/${APP_NAME}:${CI_COMMIT_SHORT_SHA} \
            -f Dockerfile .

          docker push ${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER}
          docker push ${DOCKER_REGISTRY}/${APP_NAME}:${CI_COMMIT_SHORT_SHA}

      - name: trivy-scan
        displayName: "Trivy 安全扫描"
        image: aquasec/trivy:0.48
        settings:
          working_dir: $WORKSPACE
        script: |
          trivy image \
            --severity CRITICAL,HIGH \
            --ignore-unfixed \
            --exit-code 1 \
            ${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER}

  # ===== 阶段 3：金丝雀发布 =====
  - name: canary
    displayName: "金丝雀发布"
    steps:
      - name: deploy-canary
        displayName: "部署金丝雀"
        image: alpine/helm:3.12.0
        script: |
          helm upgrade --install ${APP_NAME}-canary ./chart \
            --namespace ${K8S_NAMESPACE} \
            --values ./chart/values.yaml \
            --values ./chart/values-production.yaml \
            --set image.tag=${CI_BUILD_NUMBER} \
            --set replicaCount=1 \
            --set canary.enabled=true \
            --wait --timeout 5m

      - name: canary-verify
        displayName: "金丝雀验证"
        image: alpine/curl:8.4.0
        script: |
          # 健康检查
          CANARY_POD=$(kubectl get pod -n ${K8S_NAMESPACE} \
            -l "app=${APP_NAME},canary=true" \
            -o jsonpath='{.items[0].metadata.name}')

          HTTP_CODE=$(kubectl exec -n ${K8S_NAMESPACE} ${CANARY_POD} -- \
            curl -s -o /dev/null -w "%{http_code}" \
            http://localhost:8080/actuator/health)

          if [ "$HTTP_CODE" != "200" ]; then
            echo "金丝雀健康检查失败"
            helm delete ${APP_NAME}-canary -n ${K8S_NAMESPACE}
            exit 1
          fi
          echo "金丝雀版本验证通过"

  # ===== 阶段 4：人工审批 =====
  - name: approval
    displayName: "发布审批"
    steps:
      - name: manual-approval
        displayName: "确认全量发布"
        plugin: manual-approval
        settings:
          timeout: 3600
          approvers:
            - "team-lead"
          description: |
            金丝雀版本已部署并验证通过。
            请确认是否执行全量发布。

  # ===== 阶段 5：全量发布 =====
  - name: full-release
    displayName: "全量发布"
    steps:
      - name: helm-upgrade
        displayName: "Helm 全量升级"
        image: alpine/helm:3.12.0
        script: |
          helm upgrade --install ${APP_NAME} ./chart \
            --namespace ${K8S_NAMESPACE} \
            --values ./chart/values.yaml \
            --values ./chart/values-production.yaml \
            --set image.tag=${CI_BUILD_NUMBER} \
            --set replicaCount=10 \
            --wait --timeout 5m

          # 清理金丝雀
          helm delete ${APP_NAME}-canary -n ${K8S_NAMESPACE} || true

      - name: rollout-verify
        displayName: "部署验证"
        image: bitnami/kubectl:1.28
        script: |
          kubectl rollout status deployment/${APP_NAME} \
            --namespace ${K8S_NAMESPACE} \
            --timeout=5m

          kubectl get pods -n ${K8S_NAMESPACE} \
            -l app=${APP_NAME}

  # ===== 阶段 6：通知 =====
  - name: notify
    displayName: "发布通知"
    steps:
      - name: send-notification
        displayName: "发送通知"
        image: alpine:3.18
        script: |
          echo "发布完成: ${APP_NAME} 构建 ${CI_BUILD_NUMBER}"
          echo "镜像: ${DOCKER_REGISTRY}/${APP_NAME}:${CI_BUILD_NUMBER}"
          echo "环境: ${K8S_NAMESPACE}"
          echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
```

### 8.7.2 流水线执行流程

```
代码提交 (master)
    │
    ▼
┌─────────────────────┐
│ 阶段 1: 代码检查     │
│  ├─ 拉取代码         │
│  ├─ 单元测试         │
│  └─ SonarQube 扫描   │
└─────────┬───────────┘
          │ 通过
          ▼
┌─────────────────────┐
│ 阶段 2: 编译构建     │
│  ├─ Maven 打包       │
│  ├─ Docker 构建      │
│  └─ Trivy 安全扫描   │
└─────────┬───────────┘
          │ 通过
          ▼
┌─────────────────────┐
│ 阶段 3: 金丝雀发布   │
│  ├─ 部署 1 个 Pod    │
│  └─ 健康检查验证     │
└─────────┬───────────┘
          │ 通过
          ▼
┌─────────────────────┐
│ 阶段 4: 人工审批     │
│  └─ 团队负责人确认   │
└─────────┬───────────┘
          │ 批准
          ▼
┌─────────────────────┐
│ 阶段 5: 全量发布     │
│  ├─ Helm 升级        │
│  └─ Rollout 验证     │
└─────────┬───────────┘
          │ 完成
          ▼
┌─────────────────────┐
│ 阶段 6: 通知         │
│  └─ 发送发布通知     │
└─────────────────────┘
```

### 8.7.3 本章总结

本章从 CNB 流水线架构出发，系统介绍了云原生构建与自动化发布的完整技术栈。从触发方式、阶段步骤、变量参数等基础概念，到 Maven/Docker 构建加速、TKE 自动部署、质量门禁、发布策略和风险管控，覆盖了从代码提交到生产发布的完整链路。

核心要点回顾：

1. **流水线即代码**：通过 YAML 声明式配置，将发布流程标准化、版本化、可追溯。
2. **构建加速**：Maven 三层缓存 + Docker 层缓存优化 + BuildKit/Kaniko，将构建时间缩短 60% 以上。
3. **质量门禁**：单元测试 + SonarQube + Trivy 三层防线，在代码进入生产前拦截质量问题。
4. **渐进式发布**：金丝雀发布 + 蓝绿部署 + 滚动更新，根据业务场景选择合适策略。
5. **风险管控**：从依赖下载到 Schema 兼容性，全链路风险识别和应对。

云原生构建与自动化发布的最终目标是：**让每次代码提交都能安全、快速、可靠地到达生产环境**。这需要工具链的支撑，更需要团队在流程规范、风险意识和持续改进上的投入。
