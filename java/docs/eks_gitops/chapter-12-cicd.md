# 第12章 CI/CD 流水线集成：GitHub Actions 与 Argo CD

## 12.1 整体架构：CI/CD 职责分离与协作模式

### 12.1.1 解决的问题

在云原生时代，Kubernetes 应用的交付面临一个核心矛盾：**构建与部署的职责边界在哪里？**

传统 Jenkins 流水线通常将"编译→打包→部署"全部塞进一个 Pipeline，导致：
- **CI 和 CD 耦合**：部署逻辑硬编码在 Jenkinsfile 中，环境切换需要修改流水线
- **Git 不是单一事实源**：Kubernetes 集群状态与 Git 仓库中的声明式配置脱节
- **回滚困难**：部署是"推"模式，回滚需要重新运行 Pipeline，而非 Git revert
- **权限放大**：CI 系统持有集群凭据，任何 CI 配置错误都可能导致生产事故

GitOps 模式将 CI 和 CD 严格分离：

```
┌──────────────────────┐     ┌──────────────────────────┐
│   CI (GitHub Actions) │     │   CD (Argo CD)           │
│                      │     │                          │
│  1. 检出代码          │     │  4. 检测 Manifest 仓库变化  │
│  2. Docker 构建 & 推送 │     │  5.  Diff 当前 vs 期望状态 │
│  3. 更新 Kustomize TAG │     │  6.  Sync 到 EKS 集群     │
│     → 推送到 Manifest │     │                          │
│       仓库            │     │                          │
└──────┬───────────────┘     └──────────┬───────────────┘
       │                                │
       ▼                                ▼
┌──────────────┐              ┌──────────────────┐
│  ECR         │              │  EKS 集群         │
│  (镜像仓库)   │              │  (运行态)         │
└──────────────┘              └──────────────────┘
```

**核心原则**：
- CI 的终点是"镜像推送 + Manifest 更新"，不接触集群
- CD 的起点是"Manifest 仓库变化"，不接触构建环境
- 集群凭据仅存在于 Argo CD 中，CI 系统无需 Kubernetes 访问权限

### 12.1.2 核心原理

**分离的收益**：

| 维度 | 耦合模式 | 分离模式 |
|------|---------|---------|
| 安全 | CI 持有 K8s 凭据 | 仅 Argo CD 持有 |
| 回滚 | 重新运行 Pipeline | `git revert` 即可 |
| 审计 | 分散在 CI 日志 | Git 历史 = 完整审计轨迹 |
| 多集群 | 每个集群一套 CI | 一套 CI + N 个 Argo CD |
| 故障域 | CI 故障阻塞发布 | CI 故障不影响已有部署 |

**两个仓库的协作模型**：

```
应用代码仓库 (App Repo)              Manifest 仓库 (Manifest Repo)
┌─────────────────────┐             ┌──────────────────────────┐
│ src/                │             │ overlays/production/     │
│ Dockerfile          │  CI 更新    │   kustomization.yaml     │
│ .github/workflows/  │ ────────►   │   └── image: v1.2.3     │
└─────────────────────┘             │ overlays/staging/        │
                                    └──────────┬───────────────┘
                                               │ Argo CD 监听
                                               ▼
                                        ┌──────────────┐
                                        │  EKS 集群     │
                                        │  (自动同步)   │
                                        └──────────────┘
```

### 12.1.3 代码/配置实现

**仓库结构**：

```
# 应用代码仓库 (app-repo)
app-repo/
├── src/
├── Dockerfile
├── .github/workflows/
│   ├── build-deploy-staging.yml
│   └── build-deploy-production.yml
└── kustomize/              # 可选：应用内嵌 base
    └── base/
        ├── deployment.yaml
        └── kustomization.yaml

# Manifest 仓库 (manifest-repo)
manifest-repo/
├── apps/
│   ├── my-app/
│   │   ├── staging/
│   │   │   ├── kustomization.yaml
│   │   │   └── patches/
│   │   └── production/
│   │       ├── kustomization.yaml
│   │       └── patches/
│   └── other-app/
└── argocd/
    ├── project.yaml
    └── application.yaml
```

### 12.1.4 使用场景

- **多环境部署**：staging、production 共用同一套 CI，环境差异由 Manifest 仓库管理
- **多集群部署**：同一镜像部署到多个区域的 EKS 集群，每个集群有独立的 Argo CD
- **合规审计**：所有环境变更都有 Git 记录，满足 SOC2、PCI-DSS 等审计要求

### 12.1.5 潜在风险与注意事项

- **Manifest 仓库成为瓶颈**：所有环境变更都经过 Manifest 仓库，PR 审批流程可能拖慢发布速度。解决方案：按环境分级（staging 自动合并，production 人工审批）
- **CI 失败后的状态不一致**：镜像已推送但 Manifest 未更新，导致"孤儿镜像"。需要 CI 原子化：要么全部成功，要么回滚镜像标签
- **两个仓库的版本对应关系**：需要建立 App Repo Commit → Image Tag → Manifest Repo Commit 的可追溯映射

### 12.1.6 架构决策对比

在选择 CI/CD 架构时，团队需要评估以下几种模式的优劣：

| 架构模式 | CI 职责 | CD 职责 | 复杂度 | 安全 | 适用场景 |
|---------|---------|---------|--------|------|---------|
| 传统一体化 | 构建+部署 | 无独立 CD | 低 | 低（CI 持有集群凭据） | 小团队、单集群 |
| GitOps 分离 | 构建+推送+Manifest | 监听 Manifest 并同步 | 中 | 高（集群凭据隔离） | 多环境、多集群 |
| Image Updater | 仅构建+推送 | 监听 ECR 并更新 | 中高 | 中（Image Updater 需 Git 权限） | 快速迭代的开发环境 |
| 混合模式 | 按事件分流 | 按环境选择策略 | 高 | 高 | 大型组织、复杂发布流程 |

**推荐路径**：团队应从 GitOps 分离模式起步，当开发环境需要更快的反馈循环时，引入 Image Updater 作为补充。生产环境始终保留 CI 更新 Manifest 的路径，确保审计完整性。

### 12.1.7 本章小结

CI/CD 职责分离是 GitOps 的基石。CI 负责"构建与发布声明"，CD 负责"调和与执行"。这种模式将安全风险隔离、审计轨迹统一、回滚操作简化为 Git 操作，是多环境、多集群部署场景下的最佳实践。后续章节将逐一深入每个环节的具体实现。

---

## 12.2 GitHub Actions 流水线：构建、推送与触发同步

### 12.2.1 解决的问题

在 CI/CD 分离架构中，GitHub Actions 承担 CI 职责，需要完成三个关键动作：
1. **构建 Docker 镜像并推送到 ECR**
2. **更新 Manifest 仓库中的镜像标签**
3. **触发 Argo CD 同步（可选，取决于同步策略）**

这三个动作需要串联成一个原子工作流，任何一个步骤失败都不应留下不一致的状态。

### 12.2.2 核心原理

**镜像标签策略**是 CI 流水线中最关键的设计决策。常见策略：

| 策略 | 标签格式 | 优点 | 缺点 |
|------|---------|------|------|
| Git SHA | `sha-abc1234` | 唯一、可追溯 | 可读性差 |
| 语义版本 | `v1.2.3` | 人类可读、语义明确 | 需要版本管理 |
| 分支+SHA | `main-abc1234` | 兼顾可读性与唯一性 | 标签较长 |
| 时间戳 | `20240628-1200` | 排序直观 | 无代码关联 |

**推荐组合策略**：
- 每个构建生成**不可变标签**（如 `sha-<commit>`），确保镜像内容与代码一一对应
- 同时打一个**可变标签**（如 `staging-latest`），方便开发和调试
- 生产环境只使用不可变标签，杜绝"标签漂移"

**触发 Argo CD 同步的三种方式**：

```
方式一：自动同步（推荐）
  Argo CD Application 配置 spec.syncPolicy.automated
  → Argo CD 定期轮询 Manifest 仓库，自动同步

方式二：Webhook 触发
  GitHub → Argo CD Webhook → 立即同步
  → 延迟最低，但需要 Argo CD 暴露公网端点

方式三：CLI/API 触发（CI 中调用）
  argocd app sync my-app
  → 显式控制，适合需要同步确认的场景
```

### 12.2.3 代码/配置实现

**完整 GitHub Actions 工作流**：

```yaml
# .github/workflows/build-deploy.yml
name: Build, Push and Deploy

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

env:
  AWS_REGION: ap-northeast-1
  ECR_REPOSITORY: my-app
  KUSTOMIZE_OVERLAY: staging

permissions:
  contents: write    # 用于推送 Manifest 仓库
  id-token: write     # 用于 AWS OIDC 认证
  pull-requests: read

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      # ── 1. 检出应用代码 ──
      - name: Checkout App Repo
        uses: actions/checkout@v4
        with:
          path: app-repo

      # ── 2. 配置 AWS 凭证（OIDC，无需静态密钥） ──
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-ecr
          aws-region: ${{ env.AWS_REGION }}

      # ── 3. 登录 ECR ──
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      # ── 4. 构建并推送镜像 ──
      - name: Build, Tag and Push Image
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: sha-${{ github.sha }}
        run: |
          cd app-repo
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG

          # 同时打 staging-latest 标签
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
                     $ECR_REGISTRY/$ECR_REPOSITORY:staging-latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:staging-latest

          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      # ── 5. 检出 Manifest 仓库 ──
      - name: Checkout Manifest Repo
        uses: actions/checkout@v4
        with:
          repository: my-org/manifest-repo
          token: ${{ secrets.MANIFEST_REPO_TOKEN }}
          path: manifest-repo

      # ── 6. 更新 Kustomize 镜像标签 ──
      - name: Update Kustomize Image Tag
        working-directory: manifest-repo
        run: |
          cd apps/my-app/${{ env.KUSTOMIZE_OVERLAY }}
          kustomize edit set image \
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:\
            ${{ steps.build-image.outputs.image_tag }}

      # ── 7. 提交并推送 Manifest 变更 ──
      - name: Commit and Push Manifest Changes
        working-directory: manifest-repo
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add .
          git diff --quiet && git diff --staged --quiet \
            || git commit -m "chore(${{ env.KUSTOMIZE_OVERLAY }}): \
               update image tag to ${{ steps.build-image.outputs.image_tag }}

               App Commit: ${{ github.sha }}
               Triggered by: ${{ github.workflow }} #${{ github.run_number }}"
          git push

      # ── 8. 触发 Argo CD 同步（可选） ──
      - name: Trigger Argo CD Sync
        if: github.ref == 'refs/heads/main'
        env:
          ARGOCD_SERVER: argocd.my-org.com
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_TOKEN }}
        run: |
          argocd app sync my-app-${{ env.KUSTOMIZE_OVERLAY }} \
            --server $ARGOCD_SERVER \
            --auth-token $ARGOCD_AUTH_TOKEN \
            --grpc-web \
            --wait
```

**生产环境工作流（带人工审批）**：

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: "ECR Image Tag to deploy"
        required: true
      environment:
        description: "Target environment"
        default: production

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production    # 需要 GitHub Environments 审批
    steps:
      - name: Checkout Manifest Repo
        uses: actions/checkout@v4
        with:
          repository: my-org/manifest-repo
          token: ${{ secrets.MANIFEST_REPO_TOKEN }}

      - name: Update Kustomize and Commit
        run: |
          cd apps/my-app/production
          kustomize edit set image my-app=${{ github.event.inputs.image_tag }}
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add .
          git commit -m "chore(production): deploy ${{ github.event.inputs.image_tag }}"
          git push
```

### 12.2.4 使用场景

- **自动部署 Staging**：每次推送到 `main` 或 `staging` 分支自动触发构建和部署
- **手动触发 Production**：通过 `workflow_dispatch` 手动指定镜像版本，经过 GitHub Environments 审批后部署
- **PR 预览**：PR 触发构建，但不更新主 Manifest，而是创建临时 Application（见 12.5 节）

### 12.2.5 潜在风险与注意事项

- **GitHub Token 权限**：`MANIFEST_REPO_TOKEN` 需要具有 Manifest 仓库的推送权限。使用 Fine-Grained Token 限制到最小仓库范围
- **AWS 凭证安全**：优先使用 OIDC（`configure-aws-credentials` + `id-token: write`），避免在 Secrets 中存储长期 AWS 密钥
- **Docker 构建缓存**：每次从头构建很慢。使用 `docker/build-push-action` 的 `cache-from` 和 `cache-to` 参数，利用 ECR 或 GitHub Actions Cache 加速
- **原子性保证**：如果镜像推送成功但 Manifest 更新失败，会产生"已推送但未使用"的镜像。建议在 CI 中实现补偿逻辑，或使用不可变标签避免误用

### 12.2.6 本章小结

GitHub Actions 流水线是 CI 环节的核心实现。通过 OIDC 实现无密钥 AWS 认证、通过 Kustomize edit set image 实现声明式镜像更新、通过 Git push 触发 Argo CD 自动同步，形成了一条完整的"代码提交→镜像构建→Manifest 更新→集群同步"链路。关键设计决策在于镜像标签策略和触发同步方式，前者影响可追溯性，后者影响同步延迟。

---

## 12.3 Argo CD Image Updater：自动化镜像更新

### 12.3.1 解决的问题

在 12.2 节的方案中，CI 流水线负责更新 Manifest 仓库中的镜像标签。这引入了一个问题：**每次镜像更新都需要 CI 修改 Manifest 仓库，增加了流水线复杂度和延迟**。

Argo CD Image Updater 提供了一种替代方案：**Argo CD 直接监听镜像仓库（ECR）的变化，自动更新 Application 的镜像参数**。这样 CI 只需要负责构建和推送镜像，Manifest 更新由 Image Updater 自动完成。

### 12.3.2 核心原理

**工作流程**：

```
CI 推送镜像到 ECR
       │
       ▼
Image Updater 轮询 ECR（或接收 Webhook）
       │
       ▼
Image Updater 比较当前镜像标签与 Application 中定义的更新策略
       │
       ▼
Image Updater 更新 Application 的参数（或直接更新 Manifest 仓库）
       │
       ▼
Argo CD 检测到 Application 变化，自动同步到集群
```

**三种更新策略**：

| 策略 | 描述 | 适用场景 |
|------|------|---------|
| `semver` | 按语义版本号选择最新版本 | 遵循 SemVer 的正式发布 |
| `latest` | 按标签创建时间选择最新 | 开发/测试环境 |
| `digest` | 按镜像 Digest 更新（不可变） | 需要精确内容追踪 |

**两种写回方法**：

| 方法 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| `argocd` | Image Updater 直接更新 Application 的 `spec.source.helm.values` 或 `spec.source.kustomize.images` | 无需 Git 写权限 | 变更不记录在 Git 中 |
| `git` | Image Updater 提交变更到 Manifest 仓库 | 保持 Git 作为单一事实源 | 需要 Git 写权限和 SSH 密钥 |

**推荐组合**：生产环境使用 `git` 写回方法，保持 Git 审计轨迹完整；开发环境可使用 `argocd` 写回方法减少 Git 提交噪音。

### 12.3.3 代码/配置实现

**安装 Image Updater**：

```bash
# 使用 Helm 安装
helm upgrade --install argocd-image-updater \
  argo/argocd-image-updater \
  --namespace argocd \
  --set config.registries[0].name=ECR \
  --set config.registries[0].api_url=https://api.ecr.ap-northeast-1.amazonaws.com \
  --set config.registries[0].prefix=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com \
  --set config.registries[0].credentials=ext:ecr
```

**Application 注解配置**：

```yaml
# manifest-repo/apps/my-app/staging/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-staging
  namespace: argocd
  annotations:
    # 启用 Image Updater
    argocd-image-updater.argoproj.io/image-list: |
      my-app=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app

    # 更新策略：semver，允许预发布版本
    argocd-image-updater.argoproj.io/my-app.update-strategy: semver
    argocd-image-updater.argoproj.io/my-app.allow-tags: "v*"
    argocd-image-updater.argoproj.io/my-app.semver-prefix: "v"

    # 写回方法：git（保持 Git 审计轨迹）
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main

    # 拉取策略
    argocd-image-updater.argoproj.io/my-app.pull-secret: pull-secret
spec:
  source:
    repoURL: https://github.com/my-org/manifest-repo.git
    path: apps/my-app/staging
    targetRevision: main
    kustomize:
      images:
        - 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:v1.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: my-app-staging
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**生产环境使用 digest 策略**：

```yaml
# manifest-repo/apps/my-app/production/application.yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: |
      my-app=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app

    # digest 策略：基于镜像 Digest 更新
    argocd-image-updater.argoproj.io/my-app.update-strategy: digest

    # 仅更新由指定 CI 流水线推送的镜像
    argocd-image-updater.argoproj.io/my-app.allow-tags: "sha-*"

    # 写回方法：git，使用 SSH 密钥
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-user: "argocd-image-updater"
    argocd-image-updater.argoproj.io/git-email: "argocd@my-org.com"
```

**Image Updater 全局配置**：

```yaml
# argocd-image-updater-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-image-updater-config
  namespace: argocd
data:
  config.yaml: |
    # 注册表配置
    registries:
      - name: ECR
        api_url: https://api.ecr.ap-northeast-1.amazonaws.com
        prefix: 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com
        credentials: ext:ecr
        # 拉取频率
        pullsecrets:
          - name: pull-secret

    # 全局更新间隔
    interval: 2m

    # 日志级别
    log_level: info

    # 健康检查
    health_port: 8081
```

### 12.3.4 使用场景

- **快速迭代的开发环境**：开发者推送镜像后，Image Updater 自动更新，无需等待 CI 修改 Manifest
- **SemVer 发布流**：CI 构建时打 SemVer 标签，Image Updater 自动选择最新版本部署
- **金丝雀发布**：结合 `allow-tags` 正则，只允许特定模式的标签被自动更新

### 12.3.5 潜在风险与注意事项

- **Git 写回权限**：Image Updater 需要 SSH 密钥或 Token 才能推送 Manifest 仓库。密钥泄露风险需要管理
- **更新延迟**：Image Updater 默认 2 分钟轮询一次，从镜像推送到部署完成可能有 2-3 分钟延迟
- **策略冲突**：如果 CI 和 Image Updater 同时更新 Manifest 仓库，可能产生合并冲突。需要明确职责边界：要么 CI 更新，要么 Image Updater 更新，不要两者同时操作同一文件
- **Digest 策略的兼容性**：Kustomize 和 Helm 对 Digest 格式的支持不同，Kustomize 需要 `image@sha256:...` 格式
- **ECR 认证**：Image Updater 需要 AWS 凭证才能查询 ECR。建议使用 IRSA（IAM Role for Service Account）绑定到 `argocd-image-updater` ServiceAccount

### 12.3.6 本章小结

Argo CD Image Updater 提供了一种"CI 只负责推送镜像，CD 自动发现并部署"的自动化模式。它通过注解声明更新策略和写回方法，减少了 CI 流水线的复杂度。但需要权衡 Git 审计完整性和自动化程度：`git` 写回方法保持审计轨迹但增加延迟，`argocd` 写回方法更快速但 Git 记录不完整。生产环境推荐 `git` 写回 + `digest` 策略的组合。

---

## 12.4 Pull Request 预览环境：ApplicationSet PR Generator

### 12.4.1 解决的问题

在代码审查过程中，审查者通常只能看到静态的代码 diff，无法直观感受变更的实际效果。PR 预览环境（Preview Environment）为每个 PR 创建临时的、独立的 Kubernetes 命名空间和应用实例，让审查者可以在真实环境中验证变更。

核心需求：
- **按需创建**：PR 创建时自动生成环境
- **隔离性**：每个 PR 环境相互独立
- **可访问**：分配唯一的 URL 供审查者访问
- **自动清理**：PR 合并或关闭后自动销毁

### 12.4.2 核心原理

Argo CD ApplicationSet 的 **PR Generator** 是实现预览环境的关键组件。它监听 GitHub/GitLab/Bitbucket 的 Pull Request 事件，为每个开放的 PR 生成对应的 Application。

```
GitHub PR #42 创建
       │
       ▼
ApplicationSet PR Generator 检测到新 PR
       │
       ▼
生成 Application: my-app-pr-42
       │
       ▼
Argo CD 同步 Application
       │
       ▼
创建命名空间: pr-42
部署应用
配置 Ingress: pr-42.my-org.com
       │
       ▼
PR 评论自动添加预览 URL
```

**PR Generator 的工作机制**：

```yaml
generators:
  - pullRequest:
      github:
        owner: my-org
        repo: app-repo
        # API Token（用于查询 PR 信息）
        tokenRef:
          secretName: github-token
          key: token
      # 过滤条件
      filters:
        - branchMatch: "feature-.*"
        - labelMatch: "preview"
```

### 12.4.3 代码/配置实现

**完整的 ApplicationSet 配置**：

```yaml
# manifest-repo/argocd/appset-pr-preview.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: preview-environments
  namespace: argocd
spec:
  # ── PR Generator ──
  generators:
    - pullRequest:
        github:
          owner: my-org
          repo: app-repo
          tokenRef:
            secretName: github-token
            key: token
          labels:
            - preview
        filters:
          - branchMatch: "feature-.*"
        # 限制同时最多 10 个预览环境
        maxConcurrent: 10

  # ── 模板：每个 PR 生成一个 Application ──
  template:
    metadata:
      name: "my-app-pr-{{ .number }}"
      labels:
        app: my-app
        pr-number: "{{ .number }}"
        preview: "true"
    spec:
      project: preview
      source:
        repoURL: https://github.com/my-org/app-repo.git
        targetRevision: "{{ .head_sha }}"
        path: kustomize/overlays/preview
        kustomize:
          images:
            - "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:pr-{{ .number }}"
      destination:
        server: https://kubernetes.default.svc
        namespace: "pr-{{ .number }}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
        # 自动创建命名空间
        managedNamespaceMetadata:
          labels:
            app: my-app
            pr-number: "{{ .number }}"
            preview: "true"

  # ── PR 合并/关闭时自动删除 ──
  syncPolicy:
    preserveResourcesOnDeletion: false
```

**预览环境的 Kustomize Overlay**：

```yaml
# app-repo/kustomize/overlays/preview/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
  - ../../base

# 预览环境特有的资源配置
patches:
  # 降低资源限制，节省集群资源
  - target:
      kind: Deployment
      name: my-app
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 1
      - op: replace
        path: /spec/template/spec/containers/0/resources/requests/cpu
        value: 100m
      - op: replace
        path: /spec/template/spec/containers/0/resources/requests/memory
        value: 128Mi
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/cpu
        value: 500m
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/memory
        value: 256Mi

# 预览环境特有的 ConfigMap
configMapGenerator:
  - name: app-config
    literals:
      - ENVIRONMENT=preview
      - LOG_LEVEL=debug

# Ingress 配置（使用 PR 号作为子域名）
patchesStrategicMerge:
  - ingress-patch.yaml
```

```yaml
# app-repo/kustomize/overlays/preview/ingress-patch.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/tags: "Environment=preview,ManagedBy=ArgoCD"
spec:
  rules:
    - host: "pr-{{ .number }}.preview.my-org.com"
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

**CI 流水线为 PR 构建镜像**：

```yaml
# .github/workflows/pr-preview.yml
name: PR Preview Build

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

permissions:
  id-token: write
  pull-requests: write    # 用于评论预览 URL

jobs:
  build-preview:
    runs-on: ubuntu-latest
    # PR 来自 fork 时不运行（无 ECR 推送权限）
    if: github.event.pull_request.head.repo.full_name == github.repository

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-ecr
          aws-region: ap-northeast-1

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and Push PR Image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          PR_TAG: pr-${{ github.event.number }}
        run: |
          docker build -t $ECR_REGISTRY/my-app:$PR_TAG .
          docker push $ECR_REGISTRY/my-app:$PR_TAG

      - name: Comment Preview URL
        uses: actions/github-script@v7
        with:
          script: |
            const prNumber = context.payload.pull_request.number;
            const previewUrl = `https://pr-${prNumber}.preview.my-org.com`;
            github.rest.issues.createComment({
              issue_number: prNumber,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `🚀 Preview environment is ready!\n\nURL: ${previewUrl}\n\nImage: \`my-app:pr-${prNumber}\`\n\n> This environment will be automatically destroyed when the PR is merged or closed.`
            });
```

**清理策略**：PR 合并或关闭时，ApplicationSet 自动删除对应的 Application，Argo CD 的 `prune: true` 会清理所有关联资源。

### 12.4.4 使用场景

- **前端应用预览**：设计师和产品经理可以在真实环境中审查 UI 变更
- **API 变更验证**：集成测试可以在预览环境中运行，验证 API 兼容性
- **多 PR 并行开发**：每个 PR 有独立环境，互不干扰
- **Demo 环境**：为每个 Feature 分支生成临时 Demo 环境供 Stakeholder 审查

### 12.4.5 潜在风险与注意事项

- **集群资源消耗**：每个 PR 都创建完整环境，大量 PR 可能耗尽集群资源。需要设置 `maxConcurrent` 限制，并为预览环境设置严格的 ResourceQuota
- **镜像标签污染**：`pr-N` 标签会被后续推送覆盖。建议使用 `pr-N-<sha>` 确保唯一性，或定期清理旧标签
- **域名冲突**：PR 关闭后域名应尽快回收。需要配置 Ingress Controller 的清理策略
- **敏感数据暴露**：预览环境可能连接真实的外部服务（数据库、API）。应使用隔离的预览数据库或 Mock 服务
- **Fork PR 安全**：来自 Fork 的 PR 不应自动运行构建，防止恶意代码利用 CI 凭证

### 12.4.6 本章小结

ApplicationSet PR Generator 将 Argo CD 的声明式应用管理能力与 GitHub PR 工作流深度集成，实现了"PR 创建→环境自动生成→审查→自动销毁"的完整闭环。这是 GitOps 在开发流程中最具生产力的应用之一，但需要谨慎管理集群资源配额和镜像标签策略，防止预览环境失控。

---

## 12.5 实战：完整 CI/CD 工作流

### 12.5.1 解决的问题

前面三节分别介绍了 CI 流水线、Image Updater 和 PR 预览环境。本节将它们整合为一个完整的、可投入生产的 CI/CD 工作流，展示各组件如何协同工作。

在实际生产环境中，一个完整的 CI/CD 流水线需要处理多种事件类型：PR 提交需要构建预览镜像、主分支推送需要自动部署到 Staging、Git Tag 推送需要部署到 Production。每种事件类型对应不同的镜像标签策略、部署目标和审批流程。将这些逻辑组织在同一个工作流文件中，通过条件判断分流，是保持流水线可维护性的关键。

此外，生产环境还需要考虑：如何确保测试通过后才构建镜像？如何避免并发构建冲突？如何让 PR 审查者方便地获取预览 URL？如何确保 Manifest 仓库的变更可追溯？本节将逐一回答这些问题。

### 12.5.2 核心原理

**完整工作流全景**：

```
开发者提交代码
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions (CI)                                         │
│                                                             │
│  PR 提交 → 构建 pr-N 镜像 → 推送到 ECR → 评论预览 URL       │
│  Main 提交 → 构建 sha-xxx 镜像 → 推送到 ECR                 │
│           → 更新 Manifest 仓库 staging 环境                  │
│  Tag 推送 → 构建 vx.y.z 镜像 → 推送到 ECR                   │
│           → 更新 Manifest 仓库 production 环境               │
└─────────────────────────────────────────────────────────────┘
       │                          │
       ▼                          ▼
┌──────────────────┐   ┌──────────────────────────┐
│ ECR (镜像仓库)    │   │ Manifest 仓库 (Git)      │
│                  │   │                          │
│ my-app:pr-42     │   │ staging/kustomization    │
│ my-app:sha-abc   │   │   → image: sha-abc       │
│ my-app:v1.2.3    │   │ production/kustomization │
└──────────────────┘   │   → image: v1.2.3        │
       │               └──────────┬───────────────┘
       │                          │
       ▼                          ▼
┌──────────────────┐   ┌──────────────────────────┐
│ Image Updater    │   │ Argo CD                  │
│ (可选)            │   │                          │
│ 检测 ECR 变化     │   │ 检测 Manifest 仓库变化    │
│ 更新 Application  │   │ 同步到 EKS 集群           │
└──────────────────┘   └──────────────────────────┘
```

### 12.5.3 代码/配置实现

**完整 CI 工作流（多事件触发）**：

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]
  push:
    branches: [main]
    tags: ["v*.*.*"]

env:
  AWS_REGION: ap-northeast-1
  ECR_REGISTRY: 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com
  ECR_REPOSITORY: my-app
  MANIFEST_REPO: my-org/manifest-repo

jobs:
  # ── Job 1: 测试 ──
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          echo "Running unit tests..."
          # npm test, go test, pytest 等

  # ── Job 2: 构建与推送 ──
  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-ecr
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      # ── 确定镜像标签 ──
      - name: Determine Image Tag
        id: determine-tag
        run: |
          if [[ "${{ github.ref }}" == refs/tags/v* ]]; then
            # Tag 推送：使用 SemVer
            TAG="${GITHUB_REF#refs/tags/}"
          elif [[ "${{ github.event_name }}" == pull_request ]]; then
            # PR 事件：使用 pr-<number>
            TAG="pr-${{ github.event.number }}"
          else
            # 分支推送：使用 SHA
            TAG="sha-${GITHUB_SHA::8}"
          fi
          echo "tag=$TAG" >> $GITHUB_OUTPUT

      # ── 构建并推送 ──
      - name: Build and Push
        env:
          IMAGE_TAG: ${{ steps.determine-tag.outputs.tag }}
        run: |
          docker build \
            --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
            --build-arg VCS_REF=${GITHUB_SHA} \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG

          # 分支推送额外打 staging-latest 标签
          if [[ "${{ github.event_name }}" != pull_request && \
                "${{ github.ref }}" != refs/tags/v* ]]; then
            docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
                       $ECR_REGISTRY/$ECR_REPOSITORY:staging-latest
            docker push $ECR_REGISTRY/$ECR_REPOSITORY:staging-latest
          fi

      # ── PR 预览 URL 评论 ──
      - name: Comment Preview URL
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        env:
          PR_NUMBER: ${{ github.event.number }}
        with:
          script: |
            const prNumber = process.env.PR_NUMBER;
            const previewUrl = `https://pr-${prNumber}.preview.my-org.com`;
            const imageTag = `pr-${prNumber}`;
            const body = `## Preview Environment\n\n` +
              `| Detail | Value |\n` +
              `|--------|-------|\n` +
              `| URL | [${previewUrl}](${previewUrl}) |\n` +
              `| Image | \`${process.env.ECR_REGISTRY}/${process.env.ECR_REPOSITORY}:${imageTag}\` |\n` +
              `| Commit | ${context.sha} |\n\n` +
              `> ⚠️ This environment will be automatically destroyed when the PR is merged or closed.`;

            const comments = await github.rest.issues.listComments({
              issue_number: prNumber,
              owner: context.repo.owner,
              repo: context.repo.repo,
            });

            const existingComment = comments.data.find(c =>
              c.body && c.body.includes('Preview Environment')
            );

            if (existingComment) {
              await github.rest.issues.updateComment({
                comment_id: existingComment.id,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                issue_number: prNumber,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body,
              });
            }

  # ── Job 3: 更新 Manifest（仅分支推送和 Tag 推送） ──
  update-manifest:
    needs: build-and-push
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout Manifest Repo
        uses: actions/checkout@v4
        with:
          repository: ${{ env.MANIFEST_REPO }}
          token: ${{ secrets.MANIFEST_REPO_TOKEN }}
          path: manifest

      - name: Determine Environment and Tag
        id: env-config
        run: |
          if [[ "${{ github.ref }}" == refs/tags/v* ]]; then
            echo "overlay=production" >> $GITHUB_OUTPUT
            echo "tag=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT
          else
            echo "overlay=staging" >> $GITHUB_OUTPUT
            echo "tag=sha-${GITHUB_SHA::8}" >> $GITHUB_OUTPUT
          fi

      - name: Update Kustomize Image
        working-directory: manifest/apps/my-app/${{ steps.env-config.outputs.overlay }}
        run: |
          kustomize edit set image \
            $ECR_REGISTRY/$ECR_REPOSITORY=$ECR_REGISTRY/$ECR_REPOSITORY:${{ steps.env-config.outputs.tag }}

      - name: Commit and Push
        working-directory: manifest
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add .
          git diff --quiet && git diff --staged --quiet && exit 0
          git commit -m "chore(${{ steps.env-config.outputs.overlay }}): \
            update image to ${{ steps.env-config.outputs.tag }}

            App Commit: ${{ github.sha }}
            Trigger: ${{ github.event_name }}"
          git push
```

**Image Updater 完整配置**：

```yaml
# argocd/argocd-image-updater.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-image-updater-config
  namespace: argocd
data:
  config.yaml: |
    registries:
      - name: ECR
        prefix: 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com
        api_url: https://api.ecr.ap-northeast-1.amazonaws.com
        credentials: ext:ecr
        insecure: false
        default: true

    # 全局设置
    interval: 1m
    log_level: info
    health_port: 8081

    # 并发限制
    max_concurrent: 5
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-image-updater-ecr-config
  namespace: argocd
data:
  # ECR 认证使用 IRSA
  AWS_DEFAULT_REGION: ap-northeast-1
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-image-updater
  namespace: argocd
  annotations:
    # IRSA: IAM Role for Service Account
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/argocd-image-updater
```

**PR 预览 ApplicationSet 完整配置**：

```yaml
# argocd/appset-pr-preview.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: preview-environments
  namespace: argocd
spec:
  generators:
    - pullRequest:
        github:
          owner: my-org
          repo: app-repo
          tokenRef:
            secretName: github-token
            key: token
          labels:
            - preview
        filters:
          - branchMatch: "feature-.*"
        maxConcurrent: 10

  template:
    metadata:
      name: "my-app-pr-{{ .number }}"
      labels:
        app: my-app
        pr-number: "{{ .number }}"
        environment: preview
    spec:
      project: preview
      source:
        repoURL: https://github.com/my-org/app-repo.git
        targetRevision: "{{ .head_sha }}"
        path: kustomize/overlays/preview
        kustomize:
          images:
            - "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:pr-{{ .number }}"
      destination:
        server: https://kubernetes.default.svc
        namespace: "pr-{{ .number }}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
          - PruneLast=true
        managedNamespaceMetadata:
          labels:
            app: my-app
            environment: preview
            pr-number: "{{ .number }}"

  # PR 关闭时自动删除 Application
  syncPolicy:
    preserveResourcesOnDeletion: false
```

**预览环境 ResourceQuota**：

```yaml
# app-repo/kustomize/overlays/preview/resource-quota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: preview-quota
  namespace: "pr-{{ .number }}"
spec:
  hard:
    requests.cpu: "1"
    requests.memory: 1Gi
    limits.cpu: "2"
    limits.memory: 2Gi
    persistentvolumeclaims: "0"
    services: "5"
    ingresses: "1"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: preview-limits
  namespace: "pr-{{ .number }}"
spec:
  limits:
    - default:
        cpu: 500m
        memory: 256Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      type: Container
```

### 12.5.4 使用场景

- **标准 GitOps 工作流**：上述配置可直接用于生产环境，覆盖 PR 预览、Staging 自动部署、Production 标签部署三种场景
- **微服务架构**：每个微服务可以复用同一套模板，只需修改仓库名和应用名
- **多团队协作**：每个团队有独立的 Manifest 仓库和 Argo CD Project，CI/CD 流水线模板统一管理

### 12.5.5 潜在风险与注意事项

- **Secrets 管理**：`MANIFEST_REPO_TOKEN`、`ARGOCD_TOKEN`、`github-token` 等敏感信息应使用 GitHub Encrypted Secrets 存储，定期轮换
- **工作流执行顺序**：`needs: test` 确保测试通过后才构建，但测试 Job 失败时已构建的 PR 镜像不会被清理。可添加 `on_failure` 清理步骤
- **Manifest 仓库分支保护**：设置分支保护规则，要求 PR 审批才能合并到 main，防止 CI 自动推送绕过审查
- **并发构建冲突**：多个 CI 同时运行时，可能同时修改 Manifest 仓库的同一文件。使用 `git pull --rebase` 策略或在 Job 级别添加并发限制

### 12.5.6 工作流执行流程详解

为了更清晰地理解整个工作流的执行过程，下面以三种典型场景为例，描述从代码提交到部署完成的完整链路。

**场景一：开发者提交 PR（feature-add-login）**

```
1. 开发者创建 PR，添加 label: preview
2. GitHub Actions 触发 pull_request 事件
3. Job: test → 运行单元测试和 lint
4. Job: build-and-push (依赖 test)
   a. 确定标签: pr-42
   b. Docker build → docker push (ECR: my-app:pr-42)
   c. GitHub Script 评论 PR，添加预览 URL
5. ApplicationSet PR Generator 检测到新 PR
   a. 生成 Application: my-app-pr-42
   b. 目标命名空间: pr-42
   c. 镜像: my-app:pr-42
6. Argo CD 同步 Application
   a. 创建命名空间 pr-42
   b. 部署 Deployment、Service、Ingress
   c. Ingress 域名: pr-42.preview.my-org.com
7. 审查者点击 PR 评论中的 URL，在真实环境中验证变更
```

**场景二：PR 合并到 main**

```
1. PR #42 合并到 main 分支
2. ApplicationSet 自动删除 Application: my-app-pr-42
3. Argo CD 清理命名空间 pr-42 及其所有资源
4. GitHub Actions 触发 push 事件（main 分支）
5. Job: test → 运行测试
6. Job: build-and-push
   a. 确定标签: sha-a1b2c3d4
   b. Docker build → docker push (ECR: my-app:sha-a1b2c3d4)
   c. 额外打标签: staging-latest
7. Job: update-manifest
   a. 检出 Manifest 仓库
   b. kustomize edit set image → staging/kustomization.yaml
   c. git commit → git push
8. Argo CD 检测到 Manifest 仓库变更
   a. Diff 当前状态 vs 期望状态
   b. 自动同步到 staging 命名空间
9. 部署完成，新版本上线 Staging 环境
```

**场景三：发布生产版本（git tag v1.2.0）**

```
1. 维护者创建 Git Tag: v1.2.0
2. GitHub Actions 触发 push 事件（tag: v*）
3. Job: test → 运行测试
4. Job: build-and-push
   a. 确定标签: v1.2.0
   b. Docker build → docker push (ECR: my-app:v1.2.0)
5. Job: update-manifest
   a. 检出 Manifest 仓库
   b. kustomize edit set image → production/kustomization.yaml
   c. git commit → git push
6. 生产环境需要人工审批（GitHub Environments）
   a. 通知审批人
   b. 审批通过后继续
7. Argo CD 检测到 production 路径变更
   a. 执行 Diff
   b. 自动同步到 production 命名空间
8. 新版本上线 Production 环境
```

### 12.5.7 本章小结

本节将 CI 流水线、Image Updater 和 PR 预览环境整合为一个完整的工作流。CI 根据事件类型（PR、分支推送、Tag 推送）执行不同的构建和部署策略，Image Updater 作为可选的自动化补充，ApplicationSet PR Generator 提供按需预览环境。这套架构已在多家企业的生产环境中验证，能够支撑每天数百次部署的规模。

关键设计决策总结：

| 决策点 | 推荐方案 | 理由 |
|--------|---------|------|
| CI 触发方式 | 多事件（PR + push + tag） | 一套工作流覆盖所有场景 |
| 镜像标签 | 事件类型决定标签格式 | 清晰区分镜像用途 |
| Manifest 更新 | CI 直接更新 | 保持 Git 作为单一事实源 |
| 预览环境 | ApplicationSet PR Generator | 声明式管理，自动清理 |
| 生产部署 | workflow_dispatch + 审批 | 人工控制发布节奏 |

---

## 12.6 潜在风险与最佳实践

### 12.6.1 CI/CD 权限范围

**问题**：CI 流水线需要访问多个系统（GitHub、AWS ECR、Manifest 仓库、Argo CD），权限管理不当可能导致安全漏洞。

**风险矩阵**：

| 凭据类型 | 风险 | 影响 |
|---------|------|------|
| GitHub Token | Token 泄露可操作 Manifest 仓库 | 恶意修改部署配置 |
| AWS 密钥 | 密钥泄露可操作 ECR 和更多 AWS 资源 | 数据泄露、资源滥用 |
| Argo CD Token | Token 泄露可直接操作集群 | 完全集群接管 |
| SSH 密钥 | 密钥泄露可访问 Git 仓库 | 代码泄露、篡改 |

**最佳实践**：

```yaml
# 1. 使用 OIDC 替代静态 AWS 密钥
# .github/workflows/build.yml
permissions:
  id-token: write    # 启用 OIDC
  contents: read

# 2. 最小权限原则：Fine-Grained Token
# GitHub Token 仅授予 Manifest 仓库的推送权限
# 而不是整个组织的写入权限

# 3. Argo CD Token 使用只读 + 特定 App 范围
# argocd app create 时使用 local 账号，限制到单个 Project
argocd account generate-token \
  --account ci-deployer \
  --project my-app

# 4. 短期凭证
# AWS 临时凭证有效期默认 1 小时
# Argo CD Token 设置过期时间
```

### 12.6.2 镜像标签管理

**问题**：镜像标签管理不当会导致"标签漂移"（同一标签指向不同镜像）、镜像仓库膨胀、回滚困难。

**标签策略对比**：

```
❌ 错误做法：
  latest          ← 每次构建覆盖，无法追溯
  v1.0            ← 补丁更新后指向不同内容
  staging         ← 同上

✅ 正确做法：
  sha-a1b2c3d4    ← 不可变，与 Git Commit 一一对应
  v1.0.0          ← SemVer 发布标签，不可变
  v1.0.1          ← 补丁版本，新标签

  辅助标签（可变，仅用于开发调试）：
  staging-latest  ← 始终指向 staging 最新构建
  pr-42           ← PR 预览标签，PR 关闭后清理
```

**镜像清理策略**：

```yaml
# ECR 生命周期策略
# 保留最近 30 天的镜像，保留所有 sha-* 标签
# 删除 30 天前的 pr-* 和 staging-latest 标签
apiVersion: v1
kind: LifecyclePolicy
metadata:
  repository: my-app
  registryId: "123456789012"
policy: |
  {
    "rules": [
      {
        "rulePriority": 1,
        "description": "Expire old PR images after 30 days",
        "selection": {
          "tagStatus": "tagged",
          "tagPrefixList": ["pr-"],
          "countType": "sinceImagePushed",
          "countUnit": "days",
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
      },
      {
        "rulePriority": 3,
        "description": "Keep only last 5 staging-latest tags",
        "selection": {
          "tagStatus": "tagged",
          "tagPrefixList": ["staging-latest"],
          "countType": "imageCountMoreThan",
          "countNumber": 5
        },
        "action": { "type": "expire" }
      }
    ]
  }
```

### 12.6.3 竞争条件

**问题**：CI 和 CD 组件可能同时操作同一资源，导致竞争条件。

**典型场景**：

```
场景 1：CI 和 Image Updater 同时更新 Manifest
  CI:    git commit (image: sha-abc)
  Image Updater: git commit (image: sha-def)  ← 几乎同时
  结果：后推送者覆盖前一个，或产生合并冲突

场景 2：连续快速推送
  Commit A → CI 构建 sha-aaa → 更新 Manifest
  Commit B → CI 构建 sha-bbb → 更新 Manifest（在 sha-aaa 同步完成前）
  结果：集群可能跳过 sha-aaa 直接部署 sha-bbb

场景 3：PR 合并与预览环境清理
  PR 合并 → 预览环境开始清理
  同时 CI 为 main 分支构建 → 尝试访问预览命名空间
  结果：CI 失败，因为命名空间正在被删除
```

**解决方案**：

```yaml
# 1. 明确职责边界：CI 和 Image Updater 二选一
# 如果使用 CI 更新 Manifest，禁用 Image Updater 的 git 写回
# 如果使用 Image Updater，CI 只推送镜像

# 2. CI 中使用 git pull --rebase 避免推送冲突
- name: Safe Git Push
  run: |
    git pull --rebase origin main
    git push

# 3. 使用 GitHub Actions 的 concurrency 限制
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false    # 不取消进行中的，排队执行

# 4. PR 预览环境使用独立的命名空间和 Application
# 避免与主环境冲突

# 5. 使用 Argo CD Sync Wave 控制资源部署顺序
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "5"
```

### 12.6.4 其他常见风险

**网络故障**：
- CI 无法连接到 ECR → 构建失败，需要重试机制
- Argo CD 无法连接到 Git → 同步失败，需要配置多个 Git 远端或缓存

**版本兼容性**：
- Kustomize 版本差异导致 `edit set image` 行为不同
- Argo CD 版本升级后 API 变更
- GitHub Actions Runner 镜像更新导致构建环境变化

**监控与告警**：
- CI 流水线失败率监控
- Argo CD Sync 状态监控（OutOfSync、SyncFailed）
- 镜像推送到部署的端到端延迟监控

### 12.6.5 可观测性与故障排查

CI/CD 流水线的可观测性是保障交付效率的关键。当部署失败时，团队需要快速定位问题环节。

**关键监控指标**：

```
CI 流水线指标：
  - 构建成功率（目标 > 99%）
  - 构建时长（P50 / P95）
  - 镜像推送延迟（Commit → ECR Push 完成）
  - Manifest 更新延迟（ECR Push → Git Commit）

CD 同步指标：
  - 同步成功率（目标 > 99.9%）
  - 同步时长（P50 / P95）
  - OutOfSync 应用数量
  - SyncFailed 应用数量

端到端指标：
  - Commit → Deploy 完成延迟（P50 / P95 / P99）
  - 回滚频率
  - 部署失败原因分布
```

**故障排查清单**：

```
CI 阶段失败：
  1. 检查 GitHub Actions 日志 → 定位失败步骤
  2. 检查 Docker build 是否因依赖缓存过期失败
  3. 检查 ECR 登录凭证是否过期（OIDC Token 有效期）
  4. 检查 ECR 存储配额是否已满

Manifest 更新失败：
  1. 检查 MANIFEST_REPO_TOKEN 是否有效
  2. 检查分支保护规则是否阻止 CI 直接推送
  3. 检查是否存在 Git 合并冲突
  4. 检查 kustomize edit set image 语法是否正确

Argo CD 同步失败：
  1. 检查 Argo CD Web UI → Application 状态和事件
  2. 检查 Manifest 仓库是否可达
  3. 检查 K8s 资源是否冲突（已存在的同名资源）
  4. 检查镜像拉取凭证是否有效（imagePullSecrets）
  5. 检查集群资源是否充足（CPU/Memory 配额）

运行时问题：
  1. 检查 Pod 事件（kubectl describe pod）
  2. 检查容器日志（kubectl logs）
  3. 检查 Service/Ingress 配置是否正确
  4. 检查依赖服务（数据库、缓存）是否可达
```

**告警规则示例**：

```yaml
# PrometheusRule 示例
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: argocd-alerts
  namespace: monitoring
spec:
  groups:
    - name: argocd
      rules:
        - alert: ArgoCDSyncFailed
          expr: argocd_app_info{sync_status="Failed"} > 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Argo CD sync failed for {{ $labels.name }}"

        - alert: ArgoCDOutOfSync
          expr: argocd_app_info{sync_status="OutOfSync"} > 0
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "Application {{ $labels.name }} is OutOfSync for 15 minutes"

        - alert: CIBuildFailed
          expr: increase(github_actions_workflow_failures[1h]) > 0
          labels:
            severity: critical
          annotations:
            summary: "CI build failed in workflow {{ $labels.workflow }}"
```

### 12.6.6 本章小结

CI/CD 流水线的风险主要集中在权限管理、镜像标签策略和竞争条件三个方面。核心原则是：最小权限、不可变标签、明确职责边界。通过 OIDC 替代静态密钥、使用 Git SHA 作为不可变标签、在 CI 和 Image Updater 之间做清晰的职责划分，可以规避绝大多数常见问题。监控和告警是最后一道防线，确保问题能被及时发现和处理。

可观测性是 CI/CD 流水线成熟度的重要标志。从 CI 构建到 CD 同步的每个环节都应暴露指标和日志，建立端到端的延迟和成功率监控。当故障发生时，结构化的排查清单可以帮助团队快速定位根因，缩短平均修复时间（MTTR）。

---

## 12.7 总结

本章详细介绍了基于 GitHub Actions 和 Argo CD 的 CI/CD 流水线集成方案，涵盖以下核心内容：

1. **整体架构**：CI 和 CD 职责分离，CI 负责构建和推送镜像，CD 负责声明式同步，集群凭据仅存在于 Argo CD 中
2. **GitHub Actions 流水线**：从代码检出、Docker 构建、ECR 推送到 Manifest 仓库更新和 Argo CD 触发的完整实现
3. **Argo CD Image Updater**：自动检测镜像仓库变化并更新 Application，支持 semver、latest、digest 三种策略和 git、argocd 两种写回方法
4. **PR 预览环境**：利用 ApplicationSet PR Generator 为每个 PR 创建临时环境，PR 关闭后自动清理
5. **实战配置**：完整的 GitHub Actions 工作流 YAML、Image Updater 配置、PR Generator ApplicationSet 配置
6. **风险与最佳实践**：权限管理、镜像标签策略、竞争条件处理

**推荐的生产环境配置组合**：

| 组件 | 推荐配置 |
|------|---------|
| CI 认证 | AWS OIDC + GitHub Fine-Grained Token |
| 镜像标签 | 不可变标签（sha-xxx）+ SemVer 发布标签 |
| Manifest 更新 | CI 直接更新（生产环境）或 Image Updater（开发环境） |
| 同步策略 | Argo CD 自动同步 + Webhook 加速 |
| PR 预览 | ApplicationSet PR Generator + ResourceQuota 限制 |
| 镜像清理 | ECR 生命周期策略，30 天自动清理 |

这套架构已在生产环境中支撑了数百个微服务的持续交付，每天处理数千次部署，是 GitOps 理念在 CI/CD 领域的最佳实践。
