# 第35章 CI/CD流水线

## 35.1 概念与语法

### 35.1.1 CI/CD 核心概念

CI/CD 是持续集成（Continuous Integration）、持续交付（Continuous Delivery）和持续部署（Continuous Deployment）的统称。

| 概念 | 缩写 | 含义 | 自动化程度 |
|------|------|------|-----------|
| 持续集成 | CI | 代码合并后自动构建和测试 | 高（全自动化） |
| 持续交付 | CD | 通过所有验证的代码随时可部署 | 中（需人工确认部署） |
| 持续部署 | CD | 通过所有验证的代码自动部署到生产 | 高（全自动化） |

流水线（Pipeline）是 CI/CD 的执行单元，由多个阶段（Stage）组成，每个阶段包含若干作业（Job）：

```
Pipeline
├── Stage: Test
│   ├── Job: unit-tests
│   ├── Job: integration-tests
│   └── Job: lint
├── Stage: Build
│   └── Job: docker-build
├── Stage: Deploy-Staging
│   └── Job: deploy-staging
└── Stage: Deploy-Production
    └── Job: deploy-production (需要人工审批)
```

### 35.1.2 GitHub Actions 工作流语法

GitHub Actions 是 GitHub 原生的 CI/CD 平台，通过 YAML 文件定义工作流。

```yaml
# .github/workflows/<name>.yml
name: <工作流名称>

on:                               # 触发条件
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:                              # 全局环境变量
  REGISTRY: ghcr.io
  IMAGE_NAME: myorg/fastapi-app

jobs:                             # 作业定义
  <job-id>:                       # 作业标识
    runs-on: ubuntu-latest         # 运行环境
    needs: [<依赖的 job-id>]      # 依赖关系
    if: <条件表达式>              # 执行条件
    permissions:                   # 权限声明
      contents: read
      packages: write

    services:                      # 服务容器
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test

    steps:                         # 步骤列表
      - name: Checkout code       # 步骤名称
        uses: actions/checkout@v4 # 使用 Action
        with:                      # Action 参数
          fetch-depth: 0

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Run tests
        run: pytest                # 执行命令
        env:                       # 步骤级环境变量
          DATABASE_URL: postgresql://test:test@localhost/test

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        if: always()              # 条件：总是执行
        with:
          name: test-results
          path: test-results/
```

### 35.1.3 触发条件详解

GitHub Actions 支持多种触发方式：

```yaml
on:
  # 分支推送
  push:
    branches: [main, "release/*"]
    tags: ["v*"]
    paths: ["app/**", "Dockerfile"]  # 仅在指定路径变化时触发

  # Pull Request
  pull_request:
    types: [opened, synchronize, reopened]

  # 定时执行
  schedule:
    - cron: "0 2 * * *"  # 每天凌晨2点

  # 手动触发
  workflow_dispatch:
    inputs:
      environment:
        description: "部署环境"
        type: choice
        options: [staging, production]
        required: true

  # 其他工作流调用
  workflow_call:
    inputs:
      image-tag:
        type: string
        required: true
```

### 35.1.4 部署策略

**蓝绿部署（Blue-Green Deployment）**：

维护两个完全相同的生产环境（蓝和绿），部署时将流量从一个环境切换到另一个。

```
部署前:                    部署后:
┌──────────┐              ┌──────────┐
│ Blue (v1)│ ◄─ 流量      │ Blue (v1)│ (空闲)
│ 活跃     │              │          │
└──────────┘              └──────────┘
┌──────────┐              ┌──────────┐
│ Green(v1)│ (空闲)       │ Green(v2)│ ◄─ 流量
│          │              │ 活跃     │
└──────────┘              └──────────┘
```

**滚动更新（Rolling Update）**：

逐步替换旧版本实例，在新实例就绪后才下线旧实例，保证零停机。

```
步骤1: [v1] [v1] [v1] [v1]        4 个 v1
步骤2: [v2] [v1] [v1] [v1]        1 个 v2 + 3 个 v1
步骤3: [v2] [v2] [v1] [v1]        2 个 v2 + 2 个 v1
步骤4: [v2] [v2] [v2] [v1]        3 个 v2 + 1 个 v1
步骤5: [v2] [v2] [v2] [v2]        4 个 v2
```

**金丝雀部署（Canary Deployment）**：

先将新版本部署到少量实例，观察指标正常后逐步扩大范围。

```
阶段1: 5% 流量 → v2, 95% 流量 → v1 (观察 10 分钟)
阶段2: 25% 流量 → v2, 75% 流量 → v1 (观察 30 分钟)
阶段3: 100% 流量 → v2 (完成)
```

### 35.1.5 Docker 镜像标签策略

| 标签策略 | 格式 | 特点 | 适用场景 |
|----------|------|------|----------|
| Git SHA | `abc1234` | 不可变，精确对应代码版本 | 所有环境 |
| 语义版本 | `1.2.3` | 人工维护，表示功能版本 | 发布版本 |
| 分支名 | `main`, `dev` | 可变，指向分支最新构建 | 开发/预发布 |
| `latest` | `latest` | 可变，指向最新构建 | 仅开发环境 |

**生产环境最佳实践**：使用 Git SHA 标签，确保每次部署可追溯到精确的代码版本。

---

## 35.2 原理与机制

### 35.2.1 GitHub Actions 运行器架构

GitHub Actions 的运行器（Runner）是执行工作流的服务器进程，分为两类：

- **GitHub 托管运行器**：GitHub 提供的虚拟机（Ubuntu/Windows/macOS），每次作业运行在全新环境中
- **自托管运行器**：用户自己的服务器，适合需要特定硬件或网络的环境

```
GitHub Server
  │
  │ 触发工作流
  ▼
Runner Process (runs on VM)
  ├── Job 1
  │   ├── Step 1: actions/checkout
  │   ├── Step 2: actions/setup-python
  │   └── Step 3: pytest
  ├── Job 2
  │   └── ...
  └── ...
```

**作业隔离机制**：每个 Job 运行在独立的虚拟机中，Job 之间通过 **Artifact** 和 **Cache** 传递数据。

```
Job 1 (VM 1)                    Job 2 (VM 2)
  │                                │
  ├── 产出 Artifact ──────────────►├── 下载 Artifact
  │   (上传到 GitHub 存储)         │   (从 GitHub 存储下载)
  │                                │
  └── 写入 Cache ─────────────────►└── 读取 Cache
      (key-based 共享存储)            (同一 key 的缓存)
```

### 35.2.2 缓存机制深度分析

GitHub Actions 的缓存基于键值对存储，使用 `key`、`restore-keys` 实现缓存匹配和回退。

```yaml
- uses: actions/cache@v3
  with:
    path: |
      ~/.cache/pip
      ~/.cache/poetry
    key: pip-${{ runner.os }}-${{ hashFiles('**/poetry.lock') }}
    restore-keys: |
      pip-${{ runner.os }}-
```

**缓存匹配逻辑**：

1. 精确匹配 `key`：如果找到完全匹配的缓存，直接恢复
2. 前缀匹配 `restore-keys`：如果精确匹配失败，按前缀匹配最新的缓存
3. 无匹配：空缓存开始

**缓存限制**：

- 单个缓存最大 10GB（分支级别）
- 总缓存空间 10GB/仓库
- 缓存一旦创建不可更新（只能创建新缓存）
- 默认 7 天未被访问的缓存会被清除

### 35.2.3 Docker 镜像构建的层缓存

在 CI 中构建 Docker 镜像时，利用 GitHub Actions 缓存 Docker 层可显著加速构建：

```yaml
- uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**GHA 缓存模式**：

- `mode=min`（默认）：仅缓存最终镜像的层
- `mode=max`：缓存所有中间层（包括多阶段构建的中间阶段），构建加速更明显但缓存体积更大

### 35.2.4 蓝绿部署的流量切换机制

蓝绿部署的核心是流量切换，通常通过以下机制实现：

**DNS 切换**：

```
1. api.example.com → Blue IP (1.2.3.4)
2. 部署 Green 环境
3. 验证 Green 健康后
4. api.example.com → Green IP (5.6.7.8)  ← DNS 切换
5. DNS TTL 过期后，所有流量指向 Green
```

**负载均衡器切换**：

```
1. Nginx/K8s Service → Blue Pods
2. 部署 Green Pods
3. 更新 Service selector → Green Pods
4. 流量自动切换
```

**Kubernetes 实现**：

```yaml
# 通过 Service 的 selector 切换流量
apiVersion: v1
kind: Service
metadata:
  name: fastapi-service
spec:
  selector:
    app: fastapi
    version: blue    # ← 切换此值为 green
  ports:
    - port: 80
      targetPort: 8000
```

### 35.2.5 滚动更新的就绪探针机制

Kubernetes 滚动更新依赖就绪探针（Readiness Probe）来决定新 Pod 何时可以接收流量：

```
1. Deployment 更新镜像版本
2. K8s 创建新 Pod (v2)
3. 新 Pod 启动，执行 Startup Probe
4. 新 Pod 通过 Readiness Probe → 加入 Service Endpoints
5. 旧 Pod (v1) 从 Endpoints 移除
6. 旧 Pod 收到 SIGTERM，优雅关闭
7. 重复步骤 2-6 直到所有 Pod 更新
```

关键参数：

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%        # 更新时最多多创建 25% 的 Pod
      maxUnavailable: 25%  # 更新时最多 25% 的 Pod 不可用
  template:
    spec:
      containers:
        - name: fastapi
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
```

### 35.2.6 GitHub Actions 的安全模型

GitHub Actions 的安全基于 **权限最小化** 原则：

1. **GITHUB_TOKEN**：每个工作流自动获取的临时令牌，权限有限
2. **permissions** 块：显式声明工作流需要的权限
3. **环境保护规则**：生产环境可设置审批和分支限制

```yaml
permissions:
  contents: read       # 读取代码
  packages: write      # 推送镜像
  id-token: write      # OIDC 认证

environments:
  production:
    protection_rules:
      required_reviewers:
        - team:devops    # 需要审批
      branch_policies:
        - main           # 仅 main 分支可部署
```

---

## 35.3 使用场景

### 35.3.1 Pull Request 质量门禁

每次 PR 提交自动运行测试、代码检查，确保代码质量：

```yaml
on: pull_request
# 运行: lint + unit tests + integration tests
# 全部通过后才能合并
```

### 35.3.2 主分支自动部署

代码合并到 main 分支后，自动构建镜像并部署到 staging 环境：

```yaml
on:
  push:
    branches: [main]
# 流程: test → build → deploy-staging
```

### 35.3.3 版本发布流程

打 tag 触发正式发布：

```yaml
on:
  push:
    tags: ["v*"]
# 流程: test → build → deploy-staging → approve → deploy-production
```

### 35.3.4 定时安全扫描

每天定时执行安全扫描，检测依赖漏洞：

```yaml
on:
  schedule:
    - cron: "0 2 * * *"
# 流程: dependency-audit + image-scan
```

### 35.3.5 多环境渐进式部署

staging → canary → production 的渐进式部署：

```
main 合并 → staging 部署 → 自动验证 → canary (5%流量) → 验证 → 全量生产
```

### 35.3.6 紧急回滚

生产环境异常时，快速回滚到上一版本：

```bash
# 通过 workflow_dispatch 手动触发
# 回滚到指定 Git SHA 对应的镜像版本
```

---

## 35.4 示例代码

### 35.4.1 完整的 CI 工作流

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  PYTHON_VERSION: "3.12"
  POETRY_VERSION: "1.8.2"

jobs:
  # ============================================
  # 代码质量检查
  # ============================================
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install Poetry
        uses: abatilo/actions-poetry@v3
        with:
          poetry-version: ${{ env.POETRY_VERSION }}

      - name: Cache Poetry
        uses: actions/cache@v3
        with:
          path: |
            ~/.cache/pip
            ~/.cache/poetry
          key: lint-${{ runner.os }}-py${{ env.PYTHON_VERSION }}-${{ hashFiles('poetry.lock') }}
          restore-keys: |
            lint-${{ runner.os }}-py${{ env.PYTHON_VERSION }}-

      - name: Install dependencies
        run: poetry install --no-interaction --no-ansi

      - name: Ruff check
        run: poetry run ruff check . --output-format=github

      - name: Ruff format check
        run: poetry run ruff format --check .

      - name: MyPy type check
        run: poetry run mypy app/ --ignore-missing-imports --strict

  # ============================================
  # 单元测试
  # ============================================
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install Poetry
        uses: abatilo/actions-poetry@v3
        with:
          poetry-version: ${{ env.POETRY_VERSION }}

      - name: Cache Poetry
        uses: actions/cache@v3
        with:
          path: |
            ~/.cache/pip
            ~/.cache/poetry
          key: test-${{ runner.os }}-py${{ env.PYTHON_VERSION }}-${{ hashFiles('poetry.lock') }}
          restore-keys: |
            test-${{ runner.os }}-py${{ env.PYTHON_VERSION }}-

      - name: Install dependencies
        run: poetry install --no-interaction --no-ansi

      - name: Run unit tests
        run: |
          poetry run pytest tests/unit/ \
            --cov=app \
            --cov-report=xml:coverage.xml \
            --cov-report=term-missing \
            --junitxml=test-results.xml \
            -v --tb=short
        env:
          DATABASE_URL: sqlite:///test.db

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: coverage.xml
          fail_ci_if_error: false

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: unit-test-results
          path: test-results.xml

  # ============================================
  # 集成测试
  # ============================================
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: lint

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install Poetry
        uses: abatilo/actions-poetry@v3
        with:
          poetry-version: ${{ env.POETRY_VERSION }}

      - name: Cache Poetry
        uses: actions/cache@v3
        with:
          path: |
            ~/.cache/pip
            ~/.cache/poetry
          key: test-${{ runner.os }}-py${{ env.PYTHON_VERSION }}-${{ hashFiles('poetry.lock') }}
          restore-keys: |
            test-${{ runner.os }}-py${{ env.PYTHON_VERSION }}-

      - name: Install dependencies
        run: poetry install --no-interaction --no-ansi

      - name: Run integration tests
        run: |
          poetry run pytest tests/integration/ \
            --cov=app \
            --cov-report=xml:coverage.xml \
            --junitxml=test-results.xml \
            -v --tb=short
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379/0

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: integration-test-results
          path: test-results.xml

  # ============================================
  # 安全扫描
  # ============================================
  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install Poetry
        uses: abatilo/actions-poetry@v3
        with:
          poetry-version: ${{ env.POETRY_VERSION }}

      - name: Install dependencies
        run: poetry install --no-interaction --no-ansi

      - name: Safety check (dependency vulnerabilities)
        run: poetry run safety check --full-report
        continue-on-error: true

      - name: Bandit scan (code security)
        run: poetry run bandit -r app/ -f json -o bandit-report.json
        continue-on-error: true

      - name: Upload security report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: security-report
          path: bandit-report.json
```

### 35.4.2 Docker 镜像构建与推送工作流

```yaml
# .github/workflows/build-and-push.yml
name: Build & Push Docker Image

on:
  push:
    branches: [main]
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      push-image:
        type: boolean
        default: false
        description: "Push image to registry"

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    name: Build & Push
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write    # OIDC 认证

    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      # 登录容器镜像仓库
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # 设置 QEMU（多平台构建）
      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      # 设置 Docker Buildx
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # 提取 Docker 元数据和标签
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            # Git SHA 标签（始终生成）
            type=sha,prefix=
            # 语义版本标签（当推送 tag 时）
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            # 分支名标签
            type=ref,event=branch
            # latest 标签（仅 main 分支）
            type=raw,value=latest,enable={{is_default_branch}}

      # 构建并推送 Docker 镜像
      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
            VCS_REF=${{ github.sha }}
          platforms: linux/amd64,linux/arm64

      # 镜像安全扫描
      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}
          format: sarif
          output: trivy-results.sarif
          severity: HIGH,CRITICAL
          exit-code: "1"

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif
```

### 35.4.3 蓝绿部署工作流

```yaml
# .github/workflows/deploy-blue-green.yml
name: Blue-Green Deployment

on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [staging, production]
        description: "Target environment"
        required: true
      image-tag:
        type: string
        description: "Docker image tag (Git SHA)"
        required: true

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: myorg/fastapi-app

jobs:
  # ============================================
  # 确定当前活跃环境
  # ============================================
  determine-active:
    name: Determine Active Environment
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    outputs:
      active: ${{ steps.check.outputs.active }}
      target: ${{ steps.check.outputs.target }}
    steps:
      - name: Check active environment
        id: check
        run: |
          # 查询当前活跃环境（通过 API 或 DNS）
          ACTIVE=$(curl -s https://api.example.com/version | jq -r '.environment')
          if [ "$ACTIVE" = "blue" ]; then
            echo "active=blue" >> $GITHUB_OUTPUT
            echo "target=green" >> $GITHUB_OUTPUT
          else
            echo "active=green" >> $GITHUB_OUTPUT
            echo "target=blue" >> $GITHUB_OUTPUT
          fi
          echo "Current active: $ACTIVE, deploying to: $( [ '$ACTIVE' = 'blue' ] && echo green || echo blue )"

  # ============================================
  # 部署到目标环境
  # ============================================
  deploy-target:
    name: Deploy to ${{ needs.determine-active.outputs.target }}
    runs-on: ubuntu-latest
    needs: determine-active
    environment: ${{ github.event.inputs.environment }}
    env:
      TARGET: ${{ needs.determine-active.outputs.target }}
      IMAGE_TAG: ${{ github.event.inputs.image-tag }}
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to target environment
        run: |
          echo "Deploying image ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG} to ${TARGET} environment..."

          # 使用 docker-compose 部署
          export COMPOSE_PROJECT_NAME=fastapi-${TARGET}
          export IMAGE=${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}

          docker compose -f docker-compose.prod.yml up -d

          echo "Deployment to ${TARGET} complete."

      - name: Wait for health check
        run: |
          echo "Waiting for ${TARGET} environment to become healthy..."
          MAX_RETRIES=30
          RETRY_INTERVAL=10

          for i in $(seq 1 $MAX_RETRIES); do
            if curl -sf "http://fastapi-${TARGET}:8000/health/ready" > /dev/null; then
              echo "${TARGET} environment is healthy!"
              exit 0
            fi
            echo "Attempt $i/$MAX_RETRIES: not ready yet, waiting..."
            sleep $RETRY_INTERVAL
          done

          echo "ERROR: ${TARGET} environment failed health check!"
          exit 1

  # ============================================
  # 切换流量
  # ============================================
  switch-traffic:
    name: Switch Traffic
    runs-on: ubuntu-latest
    needs: [determine-active, deploy-target]
    environment: ${{ github.event.inputs.environment }}
    env:
      TARGET: ${{ needs.determine-active.outputs.target }}
      ACTIVE: ${{ needs.determine-active.outputs.active }}
    steps:
      - name: Switch traffic to target
        run: |
          echo "Switching traffic from ${ACTIVE} to ${TARGET}..."

          # 更新 Nginx 配置
          ssh deploy@api.example.com "sudo update-lb-config fastapi ${TARGET}"

          # 重载 Nginx
          ssh deploy@api.example.com "sudo nginx -t && sudo nginx -s reload"

          echo "Traffic switched to ${TARGET} environment."

      - name: Verify traffic switch
        run: |
          sleep 5
          CURRENT=$(curl -s https://api.example.com/version | jq -r '.environment')
          if [ "$CURRENT" = "${TARGET}" ]; then
            echo "Traffic successfully switched to ${TARGET}"
          else
            echo "ERROR: Traffic switch failed! Current environment: $CURRENT"
            exit 1
          fi

  # ============================================
  # 烟雾测试
  # ============================================
  smoke-test:
    name: Smoke Test
    runs-on: ubuntu-latest
    needs: switch-traffic
    steps:
      - name: Run smoke tests
        run: |
          BASE_URL="https://api.example.com"

          echo "Running smoke tests against ${BASE_URL}..."

          # 健康检查
          STATUS=$(curl -sf "${BASE_URL}/health/ready" | jq -r '.status')
          if [ "$STATUS" != "ready" ]; then
            echo "ERROR: Health check failed"
            exit 1
          fi

          # API 端点测试
          HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/users/1")
          if [ "$HTTP_CODE" != "200" ]; then
            echo "ERROR: API test failed with status ${HTTP_CODE}"
            exit 1
          fi

          echo "All smoke tests passed!"

  # ============================================
  # 回滚（仅在失败时触发）
  # ============================================
  rollback:
    name: Rollback
    runs-on: ubuntu-latest
    needs: [determine-active, smoke-test]
    if: failure()
    env:
      ACTIVE: ${{ needs.determine-active.outputs.active }}
    steps:
      - name: Rollback to previous active environment
        run: |
          echo "ROLLBACK: Switching traffic back to ${ACTIVE}..."

          ssh deploy@api.example.com "sudo update-lb-config fastapi ${ACTIVE}"
          ssh deploy@api.example.com "sudo nginx -t && sudo nginx -s reload"

          echo "Rollback complete. Traffic back on ${ACTIVE}."
```

### 35.4.4 滚动更新工作流（Kubernetes）

```yaml
# .github/workflows/deploy-rolling.yml
name: Rolling Deployment to Kubernetes

on:
  push:
    branches: [main]
    tags: ["v*"]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: myorg/fastapi-app
  K8S_NAMESPACE: production

jobs:
  deploy:
    name: Deploy to Kubernetes
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write    # OIDC 认证

    steps:
      - uses: actions/checkout@v4

      # 获取镜像标签
      - name: Determine image tag
        id: image
        run: |
          if [[ "${GITHUB_REF}" == refs/tags/v* ]]; then
            TAG="${GITHUB_REF#refs/tags/}"
          else
            TAG="${GITHUB_SHA::7}"
          fi
          echo "tag=${TAG}" >> $GITHUB_OUTPUT
          echo "full-image=${REGISTRY}/${IMAGE_NAME}:${TAG}" >> $GITHUB_OUTPUT

      # 配置 kubectl
      - name: Setup kubectl
        uses: azure/setup-kubectl@v3
        with:
          version: "v1.29.0"

      # 配置 K8s 认证（使用 OIDC）
      - name: Authenticate to Kubernetes
        uses: azure/k8s-auth@v2
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBE_CONFIG }}

      # 部署前的 Pre-flight 检查
      - name: Pre-flight checks
        run: |
          echo "Checking cluster health..."
          kubectl cluster-info
          kubectl get nodes

          echo "Checking current deployment status..."
          kubectl -n ${K8S_NAMESPACE} get deployment fastapi-app -o json | \
            jq '.spec.template.spec.containers[0].image'

      # 应用 Deployment 清单
      - name: Apply Deployment
        run: |
          # 使用 envsubst 替换镜像标签
          export IMAGE=${{ steps.image.outputs.full-image }}
          envsubst < k8s/deployment.yml | kubectl apply -f -
          envsubst < k8s/service.yml | kubectl apply -f -

      # 等待滚动更新完成
      - name: Wait for rollout
        run: |
          kubectl -n ${K8S_NAMESPACE} rollout status deployment/fastapi-app \
            --timeout=300s

      # 验证部署
      - name: Verify deployment
        run: |
          # 检查所有 Pod 是否运行
          kubectl -n ${K8S_NAMESPACE} get pods -l app=fastapi-app

          # 检查镜像版本
          kubectl -n ${K8S_NAMESPACE} get deployment fastapi-app -o json | \
            jq '.spec.template.spec.containers[0].image'

          # 检查 Pod 健康状态
          READY=$(kubectl -n ${K8S_NAMESPACE} get deployment fastapi-app \
            -o jsonpath='{.status.readyReplicas}')
          DESIRED=$(kubectl -n ${K8S_NAMESPACE} get deployment fastapi-app \
            -o jsonpath='{.spec.replicas}')

          if [ "$READY" != "$DESIRED" ]; then
            echo "ERROR: Not all pods are ready (${READY}/${DESIRED})"
            exit 1
          fi

          echo "Deployment verified: ${READY}/${DESIRED} pods ready"

      # 回滚（仅在失败时触发）
      - name: Rollback on failure
        if: failure()
        run: |
          echo "Rolling back deployment..."
          kubectl -n ${K8S_NAMESPACE} rollout undo deployment/fastapi-app
          kubectl -n ${K8S_NAMESPACE} rollout status deployment/fastapi-app --timeout=300s
          echo "Rollback complete."
```

### 35.4.5 Kubernetes Deployment 清单

```yaml
# k8s/deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fastapi-app
  namespace: production
  labels:
    app: fastapi-app
    version: ${IMAGE_TAG}
spec:
  replicas: 4
  selector:
    matchLabels:
      app: fastapi-app
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # 滚动更新时最多多创建 1 个 Pod
      maxUnavailable: 0    # 滚动更新时不允许有 Pod 不可用（零停机）
  template:
    metadata:
      labels:
        app: fastapi-app
        version: ${IMAGE_TAG}
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: fastapi
          image: ${IMAGE}
          ports:
            - containerPort: 8000
          env:
            - name: ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: fastapi-secrets
                  key: database-url
            - name: SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: fastapi-secrets
                  key: secret-key
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "512Mi"
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]
                # 等待 5 秒，让 K8s 从 Endpoints 移除 Pod 后再关闭
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
---
apiVersion: v1
kind: Service
metadata:
  name: fastapi-service
  namespace: production
spec:
  selector:
    app: fastapi-app
  ports:
    - port: 80
      targetPort: 8000
  type: ClusterIP
```

### 35.4.6 自动化测试配置

```python
# tests/conftest.py
"""
测试配置 - CI 环境适配
"""
import os
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
async def client():
    """异步 HTTP 测试客户端"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session")
def db_url():
    """CI 环境使用环境变量配置的数据库 URL"""
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://test:test@localhost:5432/testdb"
    )


# tests/unit/test_health.py
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_liveness_check(client: AsyncClient):
    """测试存活检查端点"""
    response = await client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"


@pytest.mark.anyio
async def test_readiness_check(client: AsyncClient):
    """测试就绪检查端点"""
    response = await client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"


# tests/integration/test_api.py
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_create_and_get_user(client: AsyncClient):
    """集成测试: 创建用户并获取"""
    # 创建用户
    create_response = await client.post(
        "/api/users",
        json={"name": "Test User", "email": "test@example.com"}
    )
    assert create_response.status_code == 201
    user = create_response.json()
    user_id = user["id"]

    # 获取用户
    get_response = await client.get(f"/api/users/{user_id}")
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "Test User"
```

### 35.4.7 pyproject.toml 完整配置

```toml
# pyproject.toml
[tool.poetry]
name = "fastapi-app"
version = "1.0.0"
description = "Production FastAPI Application"

[tool.poetry.dependencies]
python = "^3.12"
fastapi = "^0.109.0"
uvicorn = {extras = ["standard"], version = "^0.27.0"}
pydantic = "^2.5.0"
sqlalchemy = "^2.0.0"
asyncpg = "^0.29.0"
redis = "^5.0.0"
structlog = "^24.1.0"
opentelemetry-api = "^1.22.0"
opentelemetry-sdk = "^1.22.0"
opentelemetry-instrumentation-fastapi = "^0.43b0"
opentelemetry-exporter-otlp = "^1.22.0"
prometheus-client = "^0.20.0"

[tool.poetry.group.dev.dependencies]
pytest = "^7.4.0"
pytest-asyncio = "^0.23.0"
pytest-cov = "^4.1.0"
httpx = "^0.26.0"
ruff = "^0.2.0"
mypy = "^1.8.0"
safety = "^3.0.0"
bandit = "^1.7.0"

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = "-v --tb=short"

[tool.ruff]
target-version = "py312"
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "SIM"]

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
disallow_untyped_defs = true
```

### 35.4.8 版本发布工作流

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write
  packages: write
  id-token: write

jobs:
  # ============================================
  # 运行完整测试
  # ============================================
  test:
    name: Run Tests
    uses: ./.github/workflows/ci.yml  # 复用 CI 工作流

  # ============================================
  # 构建并推送镜像
  # ============================================
  build:
    name: Build & Push
    needs: test
    uses: ./.github/workflows/build-and-push.yml
    with:
      push-image: true
    secrets: inherit

  # ============================================
  # 创建 GitHub Release
  # ============================================
  release:
    name: Create Release
    runs-on: ubuntu-latest
    needs: [test, build]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        id: changelog
        run: |
          # 获取上一个 tag
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

          if [ -n "$PREV_TAG" ]; then
            CHANGELOG=$(git log ${PREV_TAG}..HEAD --pretty=format:"- %s (%h)" --no-merges)
          else
            CHANGELOG=$(git log --pretty=format:"- %s (%h)" --no-merges | head -50)
          fi

          # 写入文件（多行内容）
          echo "$CHANGELOG" > CHANGELOG.md
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGELOG" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ github.ref_name }}
          name: Release ${{ github.ref_name }}
          body: |
            ## Changes

            ${{ steps.changelog.outputs.changelog }}

            ## Docker Image

            ```
            docker pull ghcr.io/myorg/fastapi-app:${{ github.ref_name }}
            docker pull ghcr.io/myorg/fastapi-app:$(echo ${{ github.sha }} | cut -c1-7)
            ```
          draft: false
          prerelease: ${{ contains(github.ref_name, 'rc') || contains(github.ref_name, 'beta') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # ============================================
  # 部署到 Staging
  # ============================================
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [build, release]
    environment: staging
    steps:
      - name: Deploy to staging
        run: |
          echo "Deploying ${{ github.ref_name }} to staging..."
          # 部署逻辑（K8s / docker-compose / SSH）
          kubectl set image deployment/fastapi-app \
            fastapi=ghcr.io/myorg/fastapi-app:${{ github.ref_name }} \
            -n staging

      - name: Run smoke tests on staging
        run: |
          sleep 30
          curl -sf https://staging.api.example.com/health/ready || exit 1

  # ============================================
  # 部署到生产（需审批）
  # ============================================
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment: production  # 需要审批
    steps:
      - name: Deploy to production
        run: |
          echo "Deploying ${{ github.ref_name }} to production..."
          kubectl set image deployment/fastapi-app \
            fastapi=ghcr.io/myorg/fastapi-app:${{ github.ref_name }} \
            -n production

      - name: Verify production deployment
        run: |
          sleep 30
          curl -sf https://api.example.com/health/ready || exit 1
          echo "Production deployment verified!"
```

### 35.4.9 可复用工作流

```yaml
# .github/workflows/reusable-test.yml
name: Reusable Test Workflow

on:
  workflow_call:
    inputs:
      python-version:
        type: string
        default: "3.12"
      test-path:
        type: string
        default: "tests/"
      coverage-threshold:
        type: number
        default: 80

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ inputs.python-version }}

      - name: Install and test
        run: |
          pip install poetry
          poetry install
          poetry run pytest ${{ inputs.test-path }} \
            --cov=app \
            --cov-fail-under=${{ inputs.coverage-threshold }} \
            -v
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
```

调用方：

```yaml
# 在其他工作流中调用
jobs:
  unit-tests:
    uses: ./.github/workflows/reusable-test.yml
    with:
      test-path: "tests/unit/"
      coverage-threshold: 80

  integration-tests:
    uses: ./.github/workflows/reusable-test.yml
    with:
      test-path: "tests/integration/"
      coverage-threshold: 70
```

---

## 35.5 常见陷阱与最佳实践

### 35.5.1 陷阱：CI 中跳过测试直接部署

**问题**：为加快部署速度，在 CI 中跳过测试步骤，直接构建和部署。导致未经测试的代码进入生产。

**最佳实践**：部署必须依赖测试作业的成功：

```yaml
jobs:
  test:
    # ... 测试步骤

  deploy:
    needs: test  # 测试必须先通过
    # ... 部署步骤
```

### 35.5.2 陷阱：Docker 镜像使用 latest 标签部署生产

**问题**：`latest` 标签是可变的，不同时间拉取的 `latest` 可能是不同版本。部署时无法确认当前运行的确切版本。

**最佳实践**：生产环境始终使用不可变标签（Git SHA 或语义版本）：

```yaml
# 使用 Git SHA
tags: ghcr.io/myorg/fastapi-app:${{ github.sha }}

# 或使用语义版本
tags: ghcr.io/myorg/fastapi-app:${{ github.ref_name }}
```

### 35.5.3 陷阱：CI 缓存配置不当导致构建缓慢

**问题**：未配置缓存或缓存 key 不合理，每次 CI 运行都重新安装所有依赖。

**最佳实践**：

```yaml
# 缓存 key 包含依赖锁文件的哈希
key: pip-${{ runner.os }}-${{ hashFiles('**/poetry.lock') }}
# 回退 key 允许部分命中
restore-keys: |
  pip-${{ runner.os }}-
```

### 35.5.4 陷阱：蓝绿部署未验证就切换流量

**问题**：新环境部署后立即切换流量，如果新版本有 Bug，所有用户立刻受影响。

**最佳实践**：

1. 部署新版本后等待健康检查通过
2. 运行烟雾测试
3. 可选：先用少量流量验证（金丝雀）
4. 确认无误后切换全部流量

```yaml
deploy-target:
  # 部署到 Green
switch-traffic:
  needs: deploy-target
  # 等待 Green 健康检查通过后才切换流量
smoke-test:
  needs: switch-traffic
  # 切换后运行烟雾测试
rollback:
  needs: smoke-test
  if: failure()
  # 烟雾测试失败则自动回滚
```

### 35.5.5 陷阱：滚动更新中 Pod 优雅关闭不完整

**问题**：K8s 发送 SIGTERM 后立即从 Endpoints 移除 Pod，但 Nginx/Client 仍可能有请求发往该 Pod。同时，如果应用关闭过慢，K8s 会在 `terminationGracePeriodSeconds` 后发送 SIGKILL。

**最佳实践**：

```yaml
spec:
  terminationGracePeriodSeconds: 60  # 给予 60 秒优雅关闭
  containers:
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh", "-c", "sleep 5"]
          # 等 5 秒让 K8s 从 Endpoints 移除 Pod
          # 此期间 Pod 仍可处理已接收的请求
```

### 35.5.6 陷阱：GitHub Secrets 管理不当

**问题**：将密钥硬编码在 YAML 文件中，或将密钥存储在 Fork 的仓库中。

**最佳实践**：

1. 使用 GitHub Secrets 存储敏感信息
2. 使用 OIDC 认证代替长期有效的密钥
3. 为不同环境使用不同的 Secrets
4. 定期轮转密钥

```yaml
# 使用 OIDC 认证（推荐）
permissions:
  id-token: write

# 使用 Secrets（传统方式）
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### 35.5.7 陷阱：工作流权限过大

**问题**：`GITHUB_TOKEN` 默认权限过大，可能导致恶意 PR 通过工作流执行危险操作。

**最佳实践**：

```yaml
# 最小权限原则
permissions:
  contents: read       # 只读代码
  packages: write      # 仅写镜像包

# 在仓库设置中禁用默认写权限
# Settings → Actions → General → Workflow permissions → Read-only
```

### 35.5.8 陷阱：未设置部署环境保护规则

**问题**：任何人合并 PR 都自动部署到生产环境，缺少审批环节。

**最佳实践**：为生产环境设置保护规则：

1. GitHub 仓库 Settings → Environments → production
2. 设置 Required reviewers（审批人）
3. 设置 Branch policies（仅允许 main 分支部署）
4. 设置 Wait timer（等待时间，如 5 分钟冷却期）

### 35.5.9 最佳实践清单

1. **测试先行**：部署作业必须依赖测试作业
2. **不可变镜像标签**：生产使用 Git SHA 或语义版本
3. **合理配置缓存**：加速 CI 构建
4. **蓝绿部署 + 烟雾测试**：确保新版本健康后才切换流量
5. **滚动更新 + Readiness Probe**：零停机部署
6. **优雅关闭**：配置 preStop hook 和 terminationGracePeriodSeconds
7. **最小权限**：GitHub Token 和工作流权限
8. **环境保护规则**：生产环境需要审批
9. **多平台构建**：支持 amd64 和 arm64
10. **镜像安全扫描**：CI 中集成 Trivy 扫描
11. **可复用工作流**：减少重复配置
12. **结构化日志**：CI 日志可机器解析
13. **版本化部署清单**：K8s YAML 与代码同版本管理
14. **自动回滚**：部署失败时自动回滚到上一版本
15. **监控部署指标**：部署后自动验证关键指标