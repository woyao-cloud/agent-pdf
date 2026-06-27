# 第三章 容器化与镜像构建

## 3.1 概述

容器化是现代云原生应用的基石。在腾讯云 DevOps 体系中，将应用打包为容器镜像并推送至 TCR（Tencent Container Registry）是标准化交付的核心环节。本章从 Dockerfile 最佳实践出发，深入探讨多阶段构建、基础镜像选型、层优化、构建缓存等关键话题，并覆盖 Jib 无 Dockerfile 构建、TCR 镜像管理、安全扫描、构建加速等生产级实践。

---

## 3.2 Dockerfile 最佳实践

### 3.2.1 解决的问题

Dockerfile 是容器镜像的"配方"。一个写得好的 Dockerfile 能显著缩小镜像体积、加快构建速度、降低攻击面、提升部署效率。反之，低质量的 Dockerfile 会导致镜像臃肿（数 GB）、构建缓慢、安全漏洞频发。

### 3.2.2 核心原理

**镜像层的概念**：Docker 镜像由只读层叠加而成。每条 `RUN`、`COPY`、`ADD` 指令都会创建一个新层。层数越多、每层体积越大，镜像拉取和存储的开销就越高。

**层缓存机制**：Docker 构建时逐层检查缓存。如果某层指令和上下文未变，则复用缓存层。指令顺序直接影响缓存命中率——变化越频繁的指令应越靠后。

### 3.2.3 代码/配置实现

#### 基础镜像选型

| 镜像类型 | 体积 | 安全性 | 兼容性 | 推荐场景 |
|---------|------|--------|--------|---------|
| Alpine | ~5MB | 中（musl libc） | 中 | 静态编译 Go/Rust 应用 |
| Distroless | ~20MB | 高（无 shell/包管理器） | 高 | Java/Python 生产镜像 |
| Ubuntu 22.04 | ~80MB | 中 | 高 | 需要系统级依赖的场景 |
| Red Hat UBI | ~80MB | 高（有安全补丁 SLA） | 高 | 企业合规场景 |

#### 多阶段构建（Multi-stage Build）

多阶段构建是缩小镜像体积最有效的手段。第一阶段包含完整的编译工具链，第二阶段仅复制编译产物。

```dockerfile
# ===== 第一阶段：编译 =====
FROM maven:3.9.6-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
# 先下载依赖，利用缓存
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

# ===== 第二阶段：运行 =====
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
# 从 builder 阶段复制产物
COPY --from=builder /app/target/app.jar app.jar
# 非 root 用户
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

#### 层优化：合并 RUN 指令

```dockerfile
# ❌ 不推荐：每行一个 RUN，产生多个层
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y vim
RUN rm -rf /var/lib/apt/lists/*

# ✅ 推荐：合并为一条 RUN，清理在同一层
RUN apt-get update && \
    apt-get install -y curl vim --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*
```

#### 构建缓存优化

```dockerfile
# 利用依赖缓存层：pom.xml 不变时复用
COPY pom.xml .
RUN mvn dependency:go-offline -B

# 源码变化频繁，放在最后
COPY src ./src
RUN mvn package -DskipTests -B
```

#### .dockerignore 文件

```dockerignore
# .dockerignore
.git/
.gitignore
node_modules/
target/
*.md
Dockerfile
.dockerignore
.idea/
*.log
```

### 3.2.4 使用场景

- **微服务 Java 应用**：多阶段构建 + Alpine JRE，镜像从 800MB 降至 120MB
- **前端 Nginx 部署**：Node 构建 + Nginx 运行，最终镜像仅包含静态文件
- **Go 应用**：golang:alpine 编译 + scratch 运行，镜像可压缩至 10MB 以下

### 3.2.5 潜在风险与注意事项

1. **Alpine 的 musl libc 兼容性**：某些 Java 库（如 Netty 的 epoll 实现）依赖 glibc，在 Alpine 上可能异常。建议使用 `eclipse-temurin` 或 `ibm-semeru` 等官方 JRE 镜像。
2. **`--no-install-recommends` 必须使用**：apt 默认安装推荐包，会引入大量无用依赖。
3. **`COPY` vs `ADD`**：优先使用 `COPY`，`ADD` 的自动解压和 URL 下载功能在大多数场景下不必要且不可预测。
4. **层数不是唯一指标**：Docker 镜像最多 127 层，但更重要的是每层体积。合理合并指令，但不要过度合并导致缓存失效。

### 3.2.6 本章小结

Dockerfile 优化的核心是"小、快、安全"：多阶段构建分离编译与运行环境，合理排序指令最大化缓存命中，精选基础镜像控制攻击面。每减少 100MB 镜像体积，在千节点集群中每次部署可节省数 GB 的网络传输和磁盘占用。

---

## 3.3 Jib 构建 Java 镜像（无 Dockerfile）

### 3.3.1 解决的问题

传统 Dockerfile 构建 Java 镜像需要安装 Docker 守护进程、编写 Dockerfile、手动管理构建上下文。在 CI/CD 流水线中，这带来了以下痛点：

- CI 节点可能没有 Docker 环境
- 每次构建都要下载完整 JDK 和依赖
- 镜像层结构不优化，每次代码变更导致整层失效
- 多模块项目需要维护多个 Dockerfile

Jib 是 Google 开源的 Java 容器化工具，无需 Docker 守护进程、无需编写 Dockerfile，直接与 Maven/Gradle 构建集成。

### 3.3.2 核心原理

Jib 将 Java 应用拆分为三个标准层：

1. **依赖层（dependencies）**：所有非 SNAPSHOT 的第三方依赖 JAR
2. **资源层（resources）**：`src/main/resources` 下的静态资源
3. **类层（classes）**：编译后的 `.class` 文件

这种分层策略确保：当只修改业务代码时，仅类层失效，依赖层和资源层复用缓存，大幅加速重复构建。

Jib 通过 `jib:build` 直接推送镜像到镜像仓库，通过 `jib:dockerBuild` 构建到本地 Docker 守护进程。

### 3.3.3 代码/配置实现

#### Maven 插件配置

```xml
<plugin>
    <groupId>com.google.cloud.tools</groupId>
    <artifactId>jib-maven-plugin</artifactId>
    <version>3.4.3</version>
    <configuration>
        <!-- 基础镜像 -->
        <from>
            <image>eclipse-temurin:21-jre-alpine</image>
        </from>
        <!-- 目标镜像 -->
        <to>
            <image>ccr.ccs.tencentyun.com/${project.artifactId}:${project.version}</image>
            <auth>
                <username>${env.TCR_USERNAME}</username>
                <password>${env.TCR_PASSWORD}</password>
            </auth>
        </to>
        <!-- 容器配置 -->
        <container>
            <jvmFlags>
                <jvmFlag>-Xms512m</jvmFlag>
                <jvmFlag>-Xmx512m</jvmFlag>
                <jvmFlag>-Djava.security.egd=file:/dev/./urandom</jvmFlag>
            </jvmFlags>
            <ports>
                <port>8080</port>
            </ports>
            <environment>
                <SPRING_PROFILES_ACTIVE>prod</SPRING_PROFILES_ACTIVE>
            </environment>
            <user>nobody:nobody</user>
        </container>
        <!-- 分层优化 -->
        <extraDirectories>
            <paths>
                <path>src/main/jib</path>
            </paths>
        </extraDirectories>
    </configuration>
</plugin>
```

#### 自定义入口点

```xml
<container>
    <entrypoint>
        <entry>java</entry>
        <entry>-jar</entry>
        <entry>/app/libs/app.jar</entry>
    </entrypoint>
    <appRoot>/app</appRoot>
</container>
```

#### 多模块项目配置

在父 POM 中统一配置，子模块继承：

```xml
<!-- 父 POM -->
<pluginManagement>
    <plugins>
        <plugin>
            <groupId>com.google.cloud.tools</groupId>
            <artifactId>jib-maven-plugin</artifactId>
            <version>3.4.3</version>
            <configuration>
                <from>
                    <image>eclipse-temurin:21-jre-alpine</image>
                </from>
                <to>
                    <image>ccr.ccs.tencentyun.com/${project.artifactId}:latest</image>
                </to>
            </configuration>
        </plugin>
    </plugins>
</pluginManagement>
```

#### 构建命令

```bash
# 直接推送到 TCR
mvn compile jib:build -DTCR_USERNAME=xxx -DTCR_PASSWORD=xxx

# 构建到本地 Docker
mvn compile jib:dockerBuild

# 构建并推送指定 tag
mvn compile jib:build -Dimage=ccr.ccs.tencentyun.com/myapp:v1.2.3
```

### 3.3.4 使用场景

- **GitLab CI / Jenkins 无 Docker 环境**：Jib 不需要 `docker build` 命令，适合容器内构建
- **频繁迭代的开发阶段**：Jib 的层缓存机制让二次构建仅需数秒
- **多模块微服务项目**：统一配置，各模块独立构建镜像
- **Spring Boot 应用**：Jib 对 Spring Boot Fat JAR 有内置支持

### 3.3.5 潜在风险与注意事项

1. **Jib 不支持 Dockerfile 的所有功能**：复杂的系统级操作（如安装系统包）仍需传统 Dockerfile。
2. **认证信息管理**：不要在 POM 中硬编码 TCR 凭据，使用环境变量或 Docker 配置。
3. **SNAPSHOT 依赖处理**：Jib 将 SNAPSHOT 依赖归入"快照层"，每次重新解析，可能影响缓存。
4. **调试困难**：Jib 构建过程不产生中间层，排查问题不如 Docker build 直观。

### 3.3.6 本章小结

Jib 为 Java 应用提供了"零配置"的容器化体验。它通过智能分层策略解决了 Java 镜像构建中的缓存痛点，且不依赖 Docker 守护进程，非常适合 CI/CD 流水线。与 TCR 结合使用时，一条 `mvn jib:build` 命令即可完成从源码到镜像推送的全流程。

---

## 3.4 TCR（Tencent Container Registry）管理

### 3.4.1 解决的问题

镜像构建完成后，需要一个安全、高效、可管理的存储和分发中心。TCR 是腾讯云提供的企业级容器镜像服务，解决以下问题：

- 镜像的版本管理和生命周期
- 镜像安全漏洞扫描
- 跨地域、跨账号的镜像同步
- 访问权限控制
- 镜像清理和存储成本控制

### 3.4.2 核心原理

TCR 基于 OCI Distribution Spec 实现，兼容 Docker CLI 和 containerd。其核心概念包括：

- **实例**：独立的镜像仓库服务单元，分为标准版和企业版
- **命名空间**：镜像的逻辑分组，通常对应团队或项目
- **镜像仓库**：单个镜像的存储单元，包含多个 tag
- **Tag**：镜像版本的引用标签

TCR 企业版支持按需扫描、跨区域复制、Helm Chart 存储等高级功能。

### 3.4.3 代码/配置实现

#### 登录 TCR

```bash
# 使用 Docker CLI 登录 TCR
docker login ccr.ccs.tencentyun.com --username <账号ID> --password <访问凭证>

# 使用 tccli 获取临时凭证
tccli tcr DescribeInstanceToken --InstanceId tcr-xxxxxxx

# 使用长期访问凭证
docker login ccr.ccs.tencentyun.com -u <用户名> -p <密码>
```

#### 推送和拉取镜像

```bash
# 标记镜像
docker tag myapp:latest ccr.ccs.tencentyun.com/my-namespace/myapp:v1.0.0

# 推送镜像
docker push ccr.ccs.tencentyun.com/my-namespace/myapp:v1.0.0

# 拉取镜像
docker pull ccr.ccs.tencentyun.com/my-namespace/myapp:v1.0.0
```

#### 镜像版本策略

推荐使用语义化版本 + Git Commit SHA 的双标签策略：

```bash
# 在 CI/CD 中
GIT_SHA=$(git rev-parse --short HEAD)
VERSION=$(mvn help:evaluate -Dexpression=project.version -q -DforceStdout)

# 同时打两个标签
docker tag myapp:latest ccr.ccs.tencentyun.com/myapp:${VERSION}
docker tag myapp:latest ccr.ccs.tencentyun.com/myapp:${GIT_SHA}
docker tag myapp:latest ccr.ccs.tencentyun.com/myapp:latest

docker push ccr.ccs.tencentyun.com/myapp:${VERSION}
docker push ccr.ccs.tencentyun.com/myapp:${GIT_SHA}
docker push ccr.ccs.tencentyun.com/myapp:latest
```

#### 使用 tccli 管理 TCR

```bash
# 创建镜像仓库
tccli tcr CreateRepository \
    --RegistryId tcr-xxxxxxx \
    --NamespaceName my-namespace \
    --RepositoryName myapp \
    --BriefDesc "用户服务"

# 列出镜像版本
tccli tcr DescribeImages \
    --RegistryId tcr-xxxxxxx \
    --NamespaceName my-namespace \
    --RepositoryName myapp

# 删除镜像版本
tccli tcr DeleteImage \
    --RegistryId tcr-xxxxxxx \
    --NamespaceName my-namespace \
    --RepositoryName myapp \
    --ImageVersion v1.0.0-rc1

# 配置镜像保留策略（保留最近 30 个版本）
tccli tcr CreateTagRetentionRule \
    --RegistryId tcr-xxxxxxx \
    --NamespaceName my-namespace \
    --RetentionRule.Strategy latestPushedK \
    --RetentionRule.Value 30
```

#### 安全扫描

```bash
# 手动触发镜像扫描
tccli tcr CreateImageAccelerationService \
    --RegistryId tcr-xxxxxxx

# 查询扫描结果
tccli tcr DescribeImageManifests \
    --RegistryId tcr-xxxxxxx \
    --NamespaceName my-namespace \
    --RepositoryName myapp \
    --ImageVersion v1.0.0

# 查看漏洞详情
tccli tcr DescribeVulnerabilityOverview \
    --RegistryId tcr-xxxxxxx
```

#### 跨地域同步

```bash
# 创建跨地域同步规则
tccli tcr CreateReplicationInstance \
    --RegistryId tcr-xxxxxxx \
    --DestRegion ap-guangzhou \
    --SyncRule.Name "prod-sync" \
    --SyncRule.Namespace "my-namespace" \
    --SyncRule.Filter "[{\"type\":\"name\",\"value\":\"myapp\"}]" \
    --SyncRule.Description "生产环境同步到广州"
```

### 3.4.4 使用场景

- **多环境部署**：开发环境推送至上海 TCR，自动同步到北京和广州的生产 TCR
- **灰度发布**：使用 tag 策略区分 stable、canary、latest
- **合规审计**：TCR 企业版记录所有镜像操作日志
- **成本控制**：设置保留策略自动清理过期镜像

### 3.4.5 潜在风险与注意事项

1. **Tag 可变性**：`latest` 标签是可变的，生产环境应始终使用不可变标签（版本号或 SHA）。
2. **跨地域同步延迟**：大规模镜像同步可能有分钟级延迟，容灾切换时需考虑。
3. **扫描性能**：首次扫描大型镜像（>1GB）可能需要 5-10 分钟。
4. **存储成本**：大量历史版本会累积存储费用，务必配置保留策略。
5. **网络带宽**：推送/拉取大型镜像会消耗节点带宽，建议使用 TCR 的 VPC 内网接入点。

### 3.4.6 本章小结

TCR 是腾讯云容器生态的核心组件。通过合理的版本策略、安全扫描和跨地域同步，TCR 为企业级容器化交付提供了可靠的镜像管理底座。结合 CI/CD 流水线，可以实现从代码提交到镜像就绪的全自动化。

---

## 3.5 镜像构建安全

### 3.5.1 解决的问题

容器镜像安全是云原生安全的第一道防线。常见安全问题包括：

- 以 root 用户运行容器，逃逸后可完全控制宿主机
- 镜像中包含 shell、包管理器等非必要工具，扩大攻击面
- 基础镜像存在已知 CVE 漏洞
- 依赖库包含恶意代码或已知漏洞
- 缺乏软件物料清单（SBOM），无法追踪依赖来源

### 3.5.2 核心原理

镜像安全遵循"纵深防御"原则：

1. **最小权限**：容器内使用非 root 用户运行
2. **最小内容**：只包含运行所需的最小文件集
3. **只读文件系统**：防止运行时写入恶意文件
4. **漏洞扫描**：在构建时和运行时持续扫描
5. **SBOM**：生成标准化的依赖清单，支持供应链审计

### 3.5.3 代码/配置实现

#### 非 root 用户

```dockerfile
FROM eclipse-temurin:21-jre-alpine

# 创建非 root 用户
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app
COPY --from=builder /app/target/app.jar app.jar

# 切换到非 root 用户
USER appuser

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

#### 只读根文件系统

```yaml
# Kubernetes Deployment 配置
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
      - name: myapp
        image: ccr.ccs.tencentyun.com/myapp:latest
        securityContext:
          runAsNonRoot: true
          runAsUser: 1001
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
          allowPrivilegeEscalation: false
        # 需要写入的目录使用 emptyDir 挂载
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
```

#### Distroless 镜像

```dockerfile
# 使用 Distroless 作为运行镜像
FROM maven:3.9.6-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

# Distroless 镜像不包含 shell、包管理器、甚至 ls/cp 等工具
FROM gcr.io/distroless/java21-debian12
WORKDIR /app
COPY --from=builder /app/target/app.jar app.jar
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

#### Trivy 漏洞扫描

```bash
# 安装 Trivy
# Windows: 从 https://github.com/aquasecurity/trivy/releases 下载
# Linux: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh

# 扫描本地镜像
trivy image ccr.ccs.tencentyun.com/myapp:latest

# 扫描并输出 JSON
trivy image --format json --output scan-result.json ccr.ccs.tencentyun.com/myapp:latest

# 扫描并只输出高危及以上漏洞
trivy image --severity HIGH,CRITICAL ccr.ccs.tencentyun.com/myapp:latest

# 扫描 Dockerfile
trivy config Dockerfile

# 在 CI 中集成（失败阈值）
trivy image --exit-code 1 --severity CRITICAL ccr.ccs.tencentyun.com/myapp:latest
```

#### 生成 SBOM

```bash
# 生成 CycloneDX 格式的 SBOM
trivy image --format cyclonedx --output sbom.json ccr.ccs.tencentyun.com/myapp:latest

# 生成 SPDX 格式的 SBOM
trivy image --format spdx-json --output sbom.spdx.json ccr.ccs.tencentyun.com/myapp:latest

# 对比两个版本的 SBOM 差异
trivy sbom sbom.json
```

#### 完整的 CI 安全流水线

```yaml
# .gitlab-ci.yml 安全阶段
stages:
  - build
  - scan
  - deploy

build:
  stage: build
  script:
    - docker build -t $TCR_REPO:$CI_COMMIT_SHORT_SHA .
    - docker push $TCR_REPO:$CI_COMMIT_SHORT_SHA

scan:
  stage: scan
  script:
    # 漏洞扫描
    - trivy image --exit-code 1 --severity CRITICAL $TCR_REPO:$CI_COMMIT_SHORT_SHA
    # 生成 SBOM
    - trivy image --format cyclonedx --output sbom-$CI_COMMIT_SHORT_SHA.json $TCR_REPO:$CI_COMMIT_SHORT_SHA
    # 上传 SBOM 作为构建产物
  artifacts:
    paths:
      - sbom-*.json

deploy:
  stage: deploy
  script:
    - kubectl set image deployment/myapp myapp=$TCR_REPO:$CI_COMMIT_SHORT_SHA
  only:
    - main
```

### 3.5.4 使用场景

- **金融合规**：必须使用 Distroless 或 UBI 镜像，禁止 root 运行
- **供应链安全**：每次构建生成 SBOM，提交至审计系统
- **CI 门禁**：CRITICAL 漏洞阻断流水线，HIGH 漏洞告警
- **多租户环境**：readOnlyRootFilesystem + 非 root 用户防止容器间互相影响

### 3.5.5 潜在风险与注意事项

1. **Distroless 调试困难**：没有 shell，无法 `exec` 进入容器排查问题。建议保留一个带调试工具的 sidecar 镜像用于排障。
2. **扫描性能开销**：Trivy 首次扫描需要下载漏洞数据库，CI 中建议缓存 `~/.cache/trivy`。
3. **误报处理**：某些扫描结果可能是误报（如 Alpine 的 musl 相关 CVE），需要建立误报白名单机制。
4. **SBOM 版本管理**：SBOM 应与镜像版本一一对应，建议将 SBOM 也推送到 TCR 或独立的制品仓库。

### 3.5.6 本章小结

镜像安全不是单一措施，而是从基础镜像选型、运行时配置、漏洞扫描到 SBOM 的完整链路。非 root 用户 + 只读根文件系统 + Trivy 扫描是生产环境的最低安全基线。在腾讯云环境中，结合 TCR 的内置扫描和 CAM 权限控制，可以构建端到端的镜像安全体系。

---

## 3.6 构建加速

### 3.6.1 解决的问题

随着微服务数量增长，镜像构建成为 CI/CD 流水线的瓶颈。传统 `docker build` 的瓶颈包括：

- 每次构建从头执行 Dockerfile 指令
- 构建过程依赖 Docker 守护进程，资源隔离差
- 在 Kubernetes 集群中构建需要特权模式
- 跨节点缓存共享困难

### 3.6.2 核心原理

#### BuildKit

BuildKit 是 Docker 的下一代构建引擎，相比传统 `docker build` 的核心改进：

- **并发执行**：无依赖的指令并行执行
- **高效缓存**：支持内联缓存、注册表缓存、S3 缓存后端
- **SSH 转发**：构建时安全访问私有依赖
- **Secrets 管理**：不将密钥写入镜像层

#### Kaniko

Kaniko 是 Google 开发的在容器内构建容器镜像的工具，核心优势：

- **不需要 Docker 守护进程**：直接在用户空间解压、修改、打包镜像层
- **适合 Kubernetes 内构建**：以普通 Pod 运行，无需特权模式
- **支持多种缓存后端**：缓存层到镜像仓库或本地卷

### 3.6.3 代码/配置实现

#### BuildKit 配置

```bash
# 启用 BuildKit
export DOCKER_BUILDKIT=1

# 或设置默认启用
echo "{\"features\":{\"buildkit\":true}}" > /etc/docker/daemon.json
systemctl restart docker
```

#### BuildKit 内联缓存

```dockerfile
# syntax 指令启用 BuildKit 特性
# syntax=docker/dockerfile:1.7

FROM eclipse-temurin:21-jre-alpine AS builder
WORKDIR /app
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
    mvn dependency:go-offline -B
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests -B

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/app.jar app.jar
USER nobody
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

#### BuildKit 缓存推送

```bash
# 构建并推送缓存到镜像仓库
docker build \
  --cache-from ccr.ccs.tencentyun.com/myapp:cache \
  --cache-to type=registry,ref=ccr.ccs.tencentyun.com/myapp:cache,mode=max \
  -t ccr.ccs.tencentyun.com/myapp:latest \
  .
```

#### BuildKit 的 SSH 和 Secrets

```dockerfile
# syntax=docker/dockerfile:1.7

FROM maven:3.9.6-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .

# 使用 SSH 代理访问私有 Maven 仓库
RUN --mount=type=ssh \
    mvn dependency:go-offline -B

# 使用 Secrets 传递 Maven 设置
RUN --mount=type=secret,id=maven-settings \
    cp /run/secrets/maven-settings /root/.m2/settings.xml && \
    mvn dependency:go-offline -B

COPY src ./src
RUN mvn package -DskipTests -B
```

```bash
# 构建时传递 SSH 代理
docker build --ssh default=$SSH_AUTH_SOCK -t myapp .

# 构建时传递 Secret
docker build --secret id=maven-settings,src=./settings.xml -t myapp .
```

#### Kaniko 在 Kubernetes 中构建

```yaml
# kaniko-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: kaniko-build
spec:
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.23.2
    args:
    - "--dockerfile=Dockerfile"
    - "--context=git://github.com/myorg/myapp.git#refs/heads/main"
    - "--destination=ccr.ccs.tencentyun.com/myapp:latest"
    - "--cache=true"
    - "--cache-repo=ccr.ccs.tencentyun.com/myapp/cache"
    - "--snapshot-mode=redo"
    - "--compressed-caching=false"
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
  volumes:
  - name: docker-config
    configMap:
      name: docker-config
  restartPolicy: Never
```

```yaml
# docker-config configmap
apiVersion: v1
kind: ConfigMap
metadata:
  name: docker-config
data:
  config.json: |
    {
      "auths": {
        "ccr.ccs.tencentyun.com": {
          "auth": "<base64-encoded-username:password>"
        }
      }
    }
```

#### Kaniko 使用本地上下文

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: kaniko-build-local
spec:
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.23.2
    args:
    - "--dockerfile=/workspace/Dockerfile"
    - "--context=/workspace"
    - "--destination=ccr.ccs.tencentyun.com/myapp:latest"
    - "--cache=true"
    - "--cache-repo=ccr.ccs.tencentyun.com/myapp/cache"
    volumeMounts:
    - name: workspace
      mountPath: /workspace
    - name: docker-config
      mountPath: /kaniko/.docker
  volumes:
  - name: workspace
    hostPath:
      path: /data/jenkins/workspace/myapp
  - name: docker-config
    configMap:
      name: docker-config
  restartPolicy: Never
```

#### 构建性能对比

| 构建方式 | 首次构建 | 二次构建（仅代码变更） | 是否需要 Docker |
|---------|---------|----------------------|---------------|
| docker build | 120s | 45s | 是 |
| BuildKit | 90s | 15s | 是 |
| Kaniko | 100s | 20s | 否 |
| Jib | 80s | 8s | 否 |

### 3.6.4 使用场景

- **大规模 CI 集群**：Kaniko 在 Kubernetes Pod 中构建，无需共享 Docker socket
- **多分支并行构建**：BuildKit 的注册表缓存让各分支共享依赖层
- **安全敏感环境**：Kaniko 无需特权容器，降低安全风险
- **混合云构建**：BuildKit 支持 S3 等远程缓存后端，适合跨区域构建

### 3.6.5 潜在风险与注意事项

1. **BuildKit 缓存膨胀**：`mode=max` 会缓存所有层，长期运行后缓存仓库可能膨胀到数十 GB。建议定期清理或使用 `mode=min`。
2. **Kaniko 的 `--snapshot-mode`**：`redo` 模式更准确但更慢，`full` 模式更快但可能遗漏文件变更。
3. **Kaniko 的 `--cache` 限制**：Kaniko 缓存基于基础镜像层，如果基础镜像更新，缓存可能失效。
4. **BuildKit 的 `--cache-from` 拉取开销**：从远程仓库拉取缓存层本身需要时间，小项目可能得不偿失。

### 3.6.6 本章小结

构建加速的核心是"缓存"和"并行"。BuildKit 适合有 Docker 环境的 CI 节点，Kaniko 适合 Kubernetes 内构建，Jib 适合 Java 项目。在腾讯云环境中，推荐将 TCR 作为缓存后端，实现跨构建节点的缓存共享。对于 Java 项目，Jib + TCR 的组合在构建速度和安全性上表现最优。

---

## 3.7 综合实践：生产级 Spring Boot 应用容器化

### 3.7.1 完整 Dockerfile 示例

```dockerfile
# syntax=docker/dockerfile:1.7
FROM maven:3.9.6-eclipse-temurin-21 AS builder

WORKDIR /app

# 复制 Maven 配置
COPY pom.xml .
COPY .mvn .mvn

# 下载依赖（利用缓存）
RUN --mount=type=cache,target=/root/.m2 \
    mvn dependency:go-offline -B

# 复制源码并编译
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests -B

# 运行阶段：使用 Distroless
FROM gcr.io/distroless/java21-debian12

WORKDIR /app

# 从 builder 复制产物
COPY --from=builder /app/target/app.jar app.jar

# 非 root 用户
USER nonroot:nonroot

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD ["java", "-jar", "app.jar", "--health-check"]

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 3.7.2 完整 CI/CD 流水线

```yaml
# .gitlab-ci.yml
variables:
  TCR_REPO: ccr.ccs.tencentyun.com/my-project/myapp
  TCR_CACHE: ccr.ccs.tencentyun.com/my-project/cache

stages:
  - test
  - build
  - scan
  - deploy

unit-test:
  stage: test
  image: maven:3.9.6-eclipse-temurin-21
  script:
    - mvn test -B
  cache:
    paths:
      - .m2/repository

build:
  stage: build
  image: docker:27.0
  services:
    - docker:27.0-dind
  variables:
    DOCKER_BUILDKIT: 1
  script:
    - docker login ccr.ccs.tencentyun.com -u $TCR_USER -p $TCR_PASS
    - docker build \
        --cache-from $TCR_CACHE:latest \
        --cache-to type=registry,ref=$TCR_CACHE:latest,mode=max \
        -t $TCR_REPO:$CI_COMMIT_SHORT_SHA \
        -t $TCR_REPO:latest \
        .
    - docker push $TCR_REPO:$CI_COMMIT_SHORT_SHA
    - docker push $TCR_REPO:latest

security-scan:
  stage: scan
  image:
    name: aquasec/trivy:0.54
    entrypoint: [""]
  script:
    - trivy image --exit-code 1 --severity CRITICAL $TCR_REPO:$CI_COMMIT_SHORT_SHA
    - trivy image --format cyclonedx --output sbom.json $TCR_REPO:$CI_COMMIT_SHORT_SHA
  artifacts:
    paths:
      - sbom.json

deploy:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl set image deployment/myapp myapp=$TCR_REPO:$CI_COMMIT_SHORT_SHA
  only:
    - main
```

### 3.7.3 镜像构建决策树

```
是否需要 Docker 守护进程？
├── 是 → 是否在 Kubernetes 中构建？
│   ├── 是 → Kaniko
│   └── 否 → 是否使用 BuildKit？
│       ├── 是 → docker buildx build
│       └── 否 → docker build
└── 否 → 项目语言？
    ├── Java → Jib
    ├── Go → ko
    └── 其他 → Kaniko / buildah
```

---

## 3.8 本章总结

容器化与镜像构建是云原生 DevOps 的核心环节。本章覆盖了从 Dockerfile 优化、Jib 无 Dockerfile 构建、TCR 管理、安全加固到构建加速的完整知识体系。

**关键原则回顾**：

1. **镜像要小**：多阶段构建 + 精选基础镜像，生产环境优先 Distroless 或 Alpine
2. **构建要快**：BuildKit 并行执行 + 注册表缓存 + Jib 分层策略
3. **安全要严**：非 root 用户 + 只读根文件系统 + Trivy 扫描 + SBOM
4 **管理要规范**：语义化版本 + TCR 保留策略 + 跨地域同步

在腾讯云环境中，推荐的 Java 应用容器化方案是：**Jib 构建 → TCR 存储 → Trivy 扫描 → Kubernetes 部署**，配合 BuildKit 或 Kaniko 加速，形成完整的镜像交付流水线。
