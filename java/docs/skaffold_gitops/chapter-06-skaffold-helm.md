# 第6章 Skaffold + Helm 构建部署流水线

## 6.1 项目结构设计

### 解决的问题

合理的项目结构是 GitOps 流程的基础。不合理的结构会导致配置混乱、环境管理困难、团队协作效率低下。

### 核心原理

推荐的单仓库（Monorepo）结构：

```
my-app/
├── src/                    # 应用源码
│   ├── main/
│   └── test/
├── charts/                 # Helm Chart
│   └── my-app/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-dev.yaml
│       ├── values-staging.yaml
│       ├── values-prod.yaml
│       └── templates/
├── skaffold.yaml           # Skaffold 配置
├── Dockerfile
├── .dockerignore
├── scripts/               # Python 自动化脚本
│   ├── promote.py
│   ├── health_check.py
│   └── rollback.py
└── .github/
    └── workflows/
        └── deploy.yaml
```

### 代码/配置实现

**skaffold.yaml 多环境配置：**

```yaml
apiVersion: skaffold/v4beta7
kind: Config
metadata:
  name: my-app

build:
  artifacts:
  - image: my-app
    docker:
      dockerfile: Dockerfile
  tagPolicy:
    gitCommit: {}
  local:
    useBuildkit: true

deploy:
  helm:
    releases:
    - name: my-app
      chartPath: charts/my-app
      valuesFiles:
      - charts/my-app/values.yaml
      - charts/my-app/values-dev.yaml
      namespace: my-app-dev
      createNamespace: true
      setValues:
        image.repository: my-app

profiles:
- name: staging
  deploy:
    helm:
      releases:
      - name: my-app
        chartPath: charts/my-app
        valuesFiles:
        - charts/my-app/values.yaml
        - charts/my-app/values-staging.yaml
        namespace: my-app-staging
        setValues:
          image.repository: $ECR_REGISTRY/my-app

- name: prod
  deploy:
    helm:
      releases:
      - name: my-app
        chartPath: charts/my-app
        valuesFiles:
        - charts/my-app/values.yaml
        - charts/my-app/values-prod.yaml
        namespace: my-app-prod
        setValues:
          image.repository: $ECR_REGISTRY/my-app
```

### 使用场景

- 微服务项目结构标准化
- 多环境配置管理
- 团队协作开发

### 潜在风险与注意事项

- 单仓库过大导致构建缓慢
- 多模块依赖管理复杂
- 权限控制粒度不够

### 本章小结

- 推荐 Monorepo 结构管理源码和配置
- Skaffold profiles 实现多环境配置
- Helm values 文件按环境分离

---

## 6.2 本地开发工作流

### 解决的问题

开发人员在本地需要快速迭代，每次修改代码后手动构建镜像、更新部署效率低下。

### 核心原理

Skaffold 的 `dev` 模式提供持续开发体验：
1. 监听文件变化
2. 自动构建新镜像
3. 自动部署到集群
4. 流式传输日志
5. 端口转发

### 代码/配置实现

**本地开发命令：**

```bash
# 启动持续开发模式
skaffold dev --profile dev

# 指定命名空间
skaffold dev --namespace my-app-dev

# 启用文件同步（无需重建镜像）
skaffold dev --trigger notify

# 端口转发
skaffold dev --port-forward

# 仅构建不部署
skaffold build --profile dev

# 仅部署不构建
skaffold deploy --profile dev --images my-app:latest
```

**文件同步配置：**

```yaml
# skaffold.yaml 中添加 sync 配置
build:
  artifacts:
  - image: my-app
    docker:
      dockerfile: Dockerfile
    sync:
      manual:
      - src: src/main/resources/static/**
        dest: /app/static
      - src: src/main/resources/templates/**
        dest: /app/templates
```

### 使用场景

- 本地开发快速迭代
- 调试和测试
- 前端资源热更新

### 潜在风险与注意事项

- 文件同步不支持所有文件类型
- 大量文件变化导致频繁重建
- 本地 Docker 资源消耗

### 本章小结

- `skaffold dev` 提供持续开发体验
- 文件同步加速前端开发
- 端口转发方便本地调试

---

## 6.3 CI/CD 工作流

### 解决的问题

CI/CD 流水线需要自动化构建、测试、部署，同时保证环境一致性。

### 核心原理

Skaffold 的 CI 模式分两步：
1. `skaffold build`：构建并推送镜像到 ECR
2. `skaffold deploy`：从 ECR 拉取镜像部署到 EKS

### 代码/配置实现

**CI 构建命令：**

```bash
# 构建并推送镜像
skaffold build --profile prod \
  --default-repo $ECR_REGISTRY \
  --file-output build-artifacts.json \
  --tag $GIT_SHA

# 部署到集群
skaffold deploy --profile prod \
  --build-artifacts build-artifacts.json \
  --images my-app=$ECR_REGISTRY/my-app:$GIT_SHA

# 运行测试
helm test my-app --namespace my-app-prod
```

**镜像 Tag 策略：**

```yaml
# skaffold.yaml tagPolicy
build:
  tagPolicy:
    gitCommit:
      variant: AbbrevCommitSha
  # 或使用自定义模板
  # tagPolicy:
  #   envTemplate:
  #     template: "{{.GIT_SHA}}-{{.TIMESTAMP}}"
```

### 使用场景

- CI/CD 流水线自动化
- 多环境部署
- 版本追溯

### 潜在风险与注意事项

- 构建产物文件管理
- 镜像 Tag 冲突
- 部署顺序依赖

### 本章小结

- CI 模式分构建和部署两步
- `--file-output` 传递构建产物
- `--default-repo` 指定镜像仓库

---

## 6.4 完整流水线示例

### 解决的问题

将本地开发和 CI/CD 工作流整合为完整的端到端流水线。

### 核心原理

完整流水线流程：
```
代码提交 → CI 构建 → 镜像推送 → 自动部署(dev) → 测试验证 → Promotion(staging) → 审批 → Promotion(prod)
```

### 代码/配置实现

**完整 skaffold.yaml：**

```yaml
apiVersion: skaffold/v4beta7
kind: Config
metadata:
  name: my-app

build:
  artifacts:
  - image: my-app
    docker:
      dockerfile: Dockerfile
      cacheFrom:
      - $ECR_REGISTRY/my-app:latest
    sync:
      manual:
      - src: src/main/resources/static/**
        dest: /app/static
  tagPolicy:
    gitCommit:
      variant: AbbrevCommitSha
  local:
    useBuildkit: true
    concurrency: 0

deploy:
  helm:
    releases:
    - name: my-app
      chartPath: charts/my-app
      valuesFiles:
      - charts/my-app/values.yaml
      - charts/my-app/values-dev.yaml
      namespace: my-app-dev
      createNamespace: true
      setValues:
        image.repository: my-app
      setValueTemplates:
        image.tag: "{{.IMAGE_TAG}}"

profiles:
- name: staging
  deploy:
    helm:
      releases:
      - name: my-app
        chartPath: charts/my-app
        valuesFiles:
        - charts/my-app/values.yaml
        - charts/my-app/values-staging.yaml
        namespace: my-app-staging
        setValueTemplates:
          image.tag: "{{.IMAGE_TAG}}"

- name: prod
  deploy:
    helm:
      releases:
      - name: my-app
        chartPath: charts/my-app
        valuesFiles:
        - charts/my-app/values.yaml
        - charts/my-app/values-prod.yaml
        namespace: my-app-prod
        setValueTemplates:
          image.tag: "{{.IMAGE_TAG}}"

portForward:
- resourceType: Service
  resourceName: my-app
  namespace: my-app-dev
  port: 8080
  localPort: 8080
```

### 使用场景

- 生产级 GitOps 流水线
- 多环境自动化部署
- 开发/CI 配置统一

### 潜在风险与注意事项

- 配置文件复杂度随环境增加
- 不同环境配置差异管理
- 本地和 CI 环境一致性

### 本章小结

- 统一 skaffold.yaml 管理所有环境
- Profiles 实现环境差异化
- 本地开发和 CI 使用相同配置
