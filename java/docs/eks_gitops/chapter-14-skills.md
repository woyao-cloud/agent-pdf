# 第14章 Argo CD GitOps 开发者必备技能

---

## 14.1 Kubernetes 核心技能

### 14.1.1 核心资源对象

**解决的问题**

Kubernetes 是 Argo CD 的运行基础和部署目标。不理解 K8s 资源模型，就无法理解 Argo CD 管理的对象是什么、如何工作。开发者需要掌握最常用的核心资源，才能正确编写 Application 清单、诊断部署问题。

**核心原理**

K8s 采用声明式 API 模型，每个资源对象通过 YAML 或 JSON 描述"期望状态"，由对应的 controller 不断调和（reconcile）至该状态。Argo CD 本质上是一个通用的 K8s controller，它监控 Git 仓库中的资源清单并与集群实际状态做 diff。

**代码/配置实现**

以下是最常用的核心资源清单示例：

```yaml
# Pod — 最小部署单元
apiVersion: v1
kind: Pod
metadata:
  name: my-app-pod
  labels:
    app: my-app
spec:
  containers:
  - name: app
    image: my-app:1.0.0
    ports:
    - containerPort: 8080
    resources:
      requests:
        cpu: 250m
        memory: 256Mi
      limits:
        cpu: 500m
        memory: 512Mi
```

```yaml
# Deployment — 声明式 Pod 管理
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: app
        image: my-app:1.0.0
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
```

```yaml
# Service — 稳定的网络入口
apiVersion: v1
kind: Service
metadata:
  name: my-app-svc
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
  - port: 80
    targetPort: 8080
```

```yaml
# Ingress — 外部流量路由
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    kubernetes.io/ingress.class: alb
spec:
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-app-svc
            port:
              number: 80
```

```yaml
# ConfigMap — 非敏感配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  app.properties: |
    log.level=INFO
    feature.flag=true
```

```yaml
# Secret — 敏感信息（Base64 编码）
apiVersion: v1
kind: Secret
metadata:
  name: app-secret
type: Opaque
data:
  DB_PASSWORD: cGFzc3dvcmQxMjM=
```

```yaml
# PersistentVolumeClaim — 持久化存储
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-data-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

```yaml
# HorizontalPodAutoscaler — 自动扩缩容
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

**使用场景**

- **Pod**：调试时直接查看 Pod 状态和日志；理解 Pod 生命周期（Pending → Running → Succeeded/Failed）
- **Deployment**：95% 以上的工作负载使用 Deployment 管理；滚动更新策略直接影响 Argo CD sync 行为
- **Service/Ingress**：配置流量入口，配合 AWS ALB Ingress Controller 实现南北向流量
- **ConfigMap/Secret**：将配置与镜像分离，实现环境差异化
- **HPA**：生产环境必备，配合 Cluster Autoscaler 实现弹性伸缩

**潜在风险与注意事项**

- Secret 的 Base64 编码不是加密，不应将 Secret 提交到 Git 仓库；应使用 SealedSecret、External Secrets Operator 或 SOPS
- 不要在 Pod 中硬编码镜像标签 `latest`，会导致不可复现的部署
- HPA 与 Cluster Autoscaler 配合时，注意 scale-up 延迟（通常 2-5 分钟）
- 删除 PVC 前务必确认数据已备份，PVC 删除后数据可能永久丢失

**本章小结**

K8s 核心资源是 GitOps 的基石。Argo CD 管理的本质就是这些资源的 YAML 清单。掌握每个资源的 spec 字段含义、生命周期和常见问题排查方法，是 GitOps 开发者的第一项基本功。

---

### 14.1.2 kubectl 命令

**解决的问题**

kubectl 是与 K8s 集群交互的唯一 CLI 工具。在 GitOps 工作流中，虽然 Argo CD 负责自动化部署，但开发者仍需 kubectl 进行调试、排查和紧急操作。

**核心原理**

kubectl 通过 kubeconfig 文件中的集群信息向 K8s API Server 发送 REST 请求。所有操作最终都转化为对 API 资源的 CRUD 调用。

**代码/配置实现**

```bash
# 查看资源
kubectl get pods -n my-namespace
kubectl get deployments -n my-namespace -o wide
kubectl get all -n my-namespace

# 查看资源详情
kubectl describe pod my-app-pod -n my-namespace
kubectl describe deployment my-app -n my-namespace

# 查看日志
kubectl logs my-app-pod -n my-namespace
kubectl logs -l app=my-app -n my-namespace --tail=100 -f

# 进入容器
kubectl exec -it my-app-pod -n my-namespace -- /bin/sh

# 声明式资源管理
kubectl apply -f deployment.yaml
kubectl delete -f deployment.yaml

# 滚动更新管理
kubectl rollout status deployment/my-app -n my-namespace
kubectl rollout history deployment/my-app -n my-namespace
kubectl rollout undo deployment/my-app -n my-namespace --to-revision=2

# 临时端口转发
kubectl port-forward svc/my-app-svc 8080:80 -n my-namespace

# 节点管理
kubectl get nodes -o wide
kubectl describe node ip-10-0-1-100.ec2.internal
```

**使用场景**

- **get/describe**：日常查看资源状态，排查 Pod 是否 CrashLoopBackOff、Pending
- **logs**：查看应用日志定位 Bug
- **exec**：进入容器执行诊断命令（ping、curl、netstat）
- **apply/delete**：紧急情况下绕过 Argo CD 直接操作（不推荐常规使用）
- **rollout**：回滚 Deployment 到历史版本
- **port-forward**：本地调试时访问集群内服务

**潜在风险与注意事项**

- 使用 `kubectl apply/delete` 直接修改资源会导致 Argo CD 检测到 OutOfSync，应优先通过 Argo CD 或 Git 仓库操作
- 生产环境应配置 kubectl 的审计日志，记录所有命令操作
- 使用 `--context` 参数明确指定集群，避免操作错误集群
- 建议安装 `kubectx`/`kubens` 工具快速切换上下文和命名空间

**本章小结**

kubectl 是 GitOps 开发者的瑞士军刀。虽然 Argo CD 自动化了部署流程，但 kubectl 在调试、排查和紧急恢复中不可替代。建议将常用命令整理为脚本或别名，提高日常效率。

---

### 14.1.3 应用部署模式

**解决的问题**

不同的应用类型需要不同的部署策略。GitOps 开发者需要理解各种部署模式及其在 Argo CD 中的实现方式。

**核心原理**

K8s 提供多种工作负载资源来满足不同场景：无状态应用用 Deployment，有状态应用用 StatefulSet，后台任务用 Job/CronJob，守护进程用 DaemonSet。

**代码/配置实现**

```yaml
# 无状态应用 — Deployment（最常用）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stateless-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: stateless-app
  template:
    metadata:
      labels:
        app: stateless-app
    spec:
      containers:
      - name: app
        image: my-app:1.0.0
        volumeMounts:
        - name: config
          mountPath: /etc/config
      volumes:
      - name: config
        configMap:
          name: app-config
```

```yaml
# 有状态应用 — StatefulSet
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    spec:
      containers:
      - name: postgres
        image: postgres:15
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
```

```yaml
# 定时任务 — CronJob
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: backup-tool:1.0
            command: ["backup.sh"]
          restartPolicy: OnFailure
```

**使用场景**

- **Deployment**：Web 应用、API 服务、微服务
- **StatefulSet**：数据库（PostgreSQL、MySQL）、消息队列（Kafka）、缓存（Redis）
- **DaemonSet**：日志采集（Fluentd）、监控代理（Prometheus Node Exporter）、网络插件
- **Job/CronJob**：数据迁移、定时备份、批处理任务

**潜在风险与注意事项**

- StatefulSet 的 Pod 删除不会自动清理 PVC，需手动管理
- CronJob 的 `startingDeadlineSeconds` 设置不当可能导致任务堆积
- DaemonSet 更新时需考虑节点排水（drain）对代理类 Pod 的影响

**本章小结**

选择正确的部署模式是应用架构设计的关键。Argo CD 对所有工作负载资源一视同仁，但开发者需要理解每种模式的特性，才能设计出可靠的 GitOps 工作流。

---

## 14.2 GitOps 核心技能

### 14.2.1 Git 工作流

**解决的问题**

GitOps 的核心是"以 Git 为单一事实来源"。没有规范的 Git 工作流，GitOps 就失去了根基。开发者需要掌握适合基础设施即代码的 Git 协作模式。

**核心原理**

GitOps 推荐使用基于 PR 的工作流（GitHub Flow 或 GitLab Flow），所有对基础设施的变更都必须经过 PR → 代码审查 → 合并 → 自动同步的流程，确保变更可追溯、可回滚。

**代码/配置实现**

```bash
# 1. 从 main 分支创建功能分支
git checkout -b feature/update-app-version

# 2. 修改应用版本
sed -i 's|image: my-app:1.0.0|image: my-app:1.1.0|' k8s/deployment.yaml

# 3. 提交变更
git add k8s/deployment.yaml
git commit -m "feat: bump my-app to v1.1.0"

# 4. 推送并创建 PR
git push origin feature/update-app-version
# 在 GitHub/GitLab 上创建 Pull Request

# 5. PR 通过审查后合并到 main
git checkout main
git pull origin main
```

**使用场景**

- **功能分支**：每个变更在独立分支上开发，互不干扰
- **PR 审查**：所有基础设施变更必须经过至少一人审查
- **语义化提交**：使用 conventional commits 规范（feat/fix/chore/docs）
- **分支保护**：main 分支设置保护规则，禁止直接推送

**潜在风险与注意事项**

- 避免在 Git 仓库中存储敏感信息（密码、密钥、证书）
- 大文件不应提交到 Git 仓库，使用 Git LFS 或外部存储
- 合并冲突在 YAML 文件中较难解决，建议频繁 rebase
- 提交信息应清晰描述变更原因，而非仅描述变更内容

**本章小结**

规范的 Git 工作流是 GitOps 的基石。PR + 代码审查的模式确保了基础设施变更的安全性和可审计性。建议团队制定统一的 Git 工作流规范并严格执行。

---

### 14.2.2 声明式配置最佳实践

**解决的问题**

YAML 是 K8s 和 Argo CD 的通用语言。不规范的 YAML 配置会导致部署失败、安全漏洞和运维困难。开发者需要掌握声明式配置的编写规范。

**核心原理**

声明式配置的核心是"描述期望状态，而非操作步骤"。好的 YAML 配置应具备：幂等性（多次 apply 结果一致）、可读性（清晰的命名和结构）、可维护性（避免重复，合理抽象）。

**代码/配置实现**

```yaml
# ✅ 良好实践：使用明确的资源名称和标签
apiVersion: v1
kind: Namespace
metadata:
  name: production
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
  labels:
    app: api-server
    environment: production
    managed-by: argocd
spec:
  replicas: 3
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
        environment: production
    spec:
      containers:
      - name: api-server
        image: my-registry/api-server:1.2.3
        ports:
        - containerPort: 3000
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

```yaml
# ❌ 不良实践：缺少标签、资源限制和健康检查
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api-server
  template:
    spec:
      containers:
      - name: api-server
        image: api-server:latest
```

**使用场景**

- 所有 K8s 资源清单都应遵循声明式最佳实践
- Helm/Kustomize 模板生成的 YAML 也应符合规范
- 使用 `kubeval`、`conftest`、`kube-score` 等工具自动校验

**潜在风险与注意事项**

- 不要省略 `resources.limits`，可能导致节点资源耗尽
- 生产环境必须配置健康检查（liveness + readiness probe）
- 使用 `revisionHistoryLimit` 控制历史版本数量，避免 etcd 过载
- 标签应遵循统一规范（如 app、environment、team、tier）

**本章小结**

声明式配置的质量直接决定了 GitOps 的可靠性。遵循 YAML 最佳实践、配置资源限制和健康检查、使用自动化校验工具，是保障生产环境稳定性的基础。

---

### 14.2.3 基础设施变更的代码审查

**解决的问题**

基础设施变更的风险远高于应用代码变更。一个错误的 YAML 字段可能导致整个集群不可用。代码审查是 GitOps 安全模型的核心环节。

**核心原理**

基础设施代码审查需要关注：语法正确性、安全合规性、资源合理性、变更影响范围。审查者应具备 K8s 和 Argo CD 的专业知识。

**代码/配置实现**

```yaml
# PR 审查清单示例
# 1. 语法检查：YAML 格式是否正确？
# 2. 镜像标签：是否使用了不可变标签（非 latest）？
# 3. 资源限制：是否设置了 requests/limits？
# 4. 安全上下文：是否以非 root 用户运行？
# 5. 网络策略：是否过于宽松？
# 6. 配置变更：是否影响其他服务？
# 7. 回滚方案：如果变更失败如何回滚？

# 审查示例：以下变更是否安全？
# 变更前
# resources:
#   limits:
#     cpu: 500m
#     memory: 512Mi

# 变更后
# resources:
#   limits:
#     cpu: 2000m
#     memory: 4Gi
# 审查意见：资源提升 4 倍，需确认节点容量是否足够
```

**使用场景**

- 每次合并到 main 分支前的 PR 审查
- 版本升级（K8s、Helm、应用镜像）的变更审查
- 安全补丁和配置变更的审查
- 新环境（staging、production）的配置审查

**潜在风险与注意事项**

- 不要仅审查 diff，要理解变更的上下文和影响范围
- 使用自动化工具（conftest、OPA、kyverno）辅助审查
- 建立审查 SLA，避免审查成为部署瓶颈
- 紧急变更（hotfix）可简化审查流程，但事后需补审

**本章小结**

基础设施代码审查是 GitOps 安全模型的关键防线。结合自动化策略检查（OPA/Kyverno）和人工审查，可以在保证安全性的同时不牺牲交付速度。

---

## 14.3 Argo CD 核心技能

### 14.3.1 Application 管理

**解决的问题**

Argo CD 的核心管理单元是 Application 资源。开发者需要掌握 Application 的完整生命周期管理，包括创建、同步、回滚和删除。

**核心原理**

Argo CD Application 通过 spec 字段定义：源代码位置（source）、目标集群（destination）、同步策略（syncPolicy）。Argo CD controller 持续监控 source 的变化并与目标集群保持同步。

**代码/配置实现**

```yaml
# 完整的 Application 定义
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/my-app-config.git
    targetRevision: main
    path: k8s/overlays/production
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
    - PruneLast=true
    - ApplyOutOfSyncOnly=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

```bash
# Argo CD CLI 命令

# 创建 Application
argocd app create my-app \
  --repo https://github.com/my-org/my-app-config.git \
  --path k8s/overlays/production \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace production \
  --sync-policy automated \
  --auto-prune \
  --self-heal

# 查看 Application 状态
argocd app get my-app
argocd app list

# 手动同步
argocd app sync my-app
argocd app sync my-app --prune
argocd app sync my-app --apply-out-of-sync-only

# 查看同步状态和历史
argocd app get my-app --refresh
argocd app history my-app

# 回滚到指定版本
argocd app rollback my-app 3

# 删除 Application（不删除资源）
argocd app delete my-app

# 删除 Application 及其管理的资源
argocd app delete my-app --cascade

# 暂停自动同步
argocd app set my-app --sync-policy manual

# 查看 Application 参数
argocd app diff my-app
argocd app manifests my-app
```

**使用场景**

- 新服务上线时创建 Application
- 版本发布时触发同步
- 出现问题时回滚到稳定版本
- 服务下线时清理 Application 和资源

**潜在风险与注意事项**

- 删除 Application 时 `--cascade` 会删除所有被管理的 K8s 资源，谨慎使用
- 回滚操作会重置 Application 到历史版本，但不会自动清理中间产生的资源
- 多个 Application 管理同一命名空间时，注意资源冲突
- 使用 App of Apps 模式管理大量 Application

**本章小结**

Application 是 Argo CD 的核心抽象。掌握 Application 的创建、同步、回滚和删除操作，是 GitOps 开发者的日常基本功。建议将 Application 定义本身也纳入 Git 管理（App of Apps 模式）。

---

### 14.3.2 同步策略

**解决的问题**

同步策略决定了 Argo CD 如何将 Git 中的期望状态应用到集群。错误的策略配置可能导致服务中断或配置漂移。

**核心原理**

Argo CD 提供三种同步模式：手动同步（manual）、自动同步（automated）和自动同步 + 自愈（self-heal）。同步策略还涉及 prune（删除多余资源）和 sync options（同步行为微调）。

**代码/配置实现**

```yaml
# 策略一：手动同步（默认）
# 适用于：生产环境、需要人工确认的变更
spec:
  syncPolicy: {}
# 操作：需手动执行 argocd app sync my-app

# 策略二：自动同步（推荐 staging）
# 适用于：非生产环境、CI/CD 流水线触发
spec:
  syncPolicy:
    automated:
      prune: false
      selfHeal: false

# 策略三：自动同步 + 自愈（推荐生产）
# 适用于：生产环境、需要自动修复配置漂移
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false

# 策略四：带重试的自动同步
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    retry:
      limit: 5
      backoff:
        duration: 10s
        factor: 2
        maxDuration: 5m
```

```bash
# 同步策略相关命令

# 设置自动同步
argocd app set my-app --sync-policy automated

# 设置自动同步 + prune + self-heal
argocd app set my-app --sync-policy automated --auto-prune --self-heal

# 切换回手动同步
argocd app set my-app --sync-policy manual

# 强制同步（忽略资源冲突）
argocd app sync my-app --force

# 替换同步（先删除再创建）
argocd app sync my-app --replace

# 选择性同步特定资源
argocd app sync my-app --resource "apps/v1:Deployment:my-app"
```

**使用场景**

| 环境 | 同步策略 | 原因 |
|------|---------|------|
| 开发 | auto + self-heal | 快速迭代，自动修复 |
| 测试 | auto + prune | 自动清理废弃资源 |
| 预发布 | auto + prune + self-heal | 模拟生产行为 |
| 生产 | auto + prune + self-heal + retry | 高可靠性要求 |

**潜在风险与注意事项**

- `prune: true` 会删除 Git 仓库中不存在的资源，可能导致数据丢失
- `selfHeal: true` 会覆盖手动修改（kubectl edit），确保 Git 为唯一来源
- 自动同步 + prune 的组合在首次部署时需特别小心
- 建议在 Application 中配置 `syncOptions` 的 `PruneLast=true`，确保依赖资源先创建

**本章小结**

同步策略是 Argo CD 配置中最关键的决策点。建议 staging 环境使用自动同步，生产环境使用自动同步 + 自愈 + 重试。prune 功能虽强大但需谨慎启用，建议先在非生产环境验证。

---

### 14.3.3 故障排查

**解决的问题**

GitOps 工作流中，部署失败的原因可能来自多个环节：Git 仓库、Argo CD 配置、K8s 集群、网络连通性。开发者需要系统化的排查方法。

**核心原理**

Argo CD 的故障排查遵循"从外到内"的原则：先检查 Application 状态，再检查同步结果，最后检查 K8s 资源状态。

**代码/配置实现**

```bash
# 1. 查看 Application 整体状态
argocd app get my-app
# 输出示例：
# Name:               my-app
# Project:            default
# Server:             https://kubernetes.default.svc
# Namespace:          production
# URL:                https://argocd.example.com/applications/my-app
# Repo:               https://github.com/my-org/my-app-config.git
# Target:             main
# Path:               k8s/overlays/production
# Sync Policy:        Automated
# Sync Status:        OutOfSync  ← 关注点
# Health Status:      Degraded   ← 关注点

# 2. 查看差异详情
argocd app diff my-app
# 显示 Git 中期望状态与集群实际状态的差异

# 3. 查看同步结果
argocd app get my-app --refresh
argocd app wait my-app --health

# 4. 查看 Application 事件
kubectl get events -n argocd --field-selector involvedObject.name=my-app

# 5. 查看 Argo CD 控制器日志
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller --tail=100

# 6. 查看资源具体状态
kubectl describe deployment my-app -n production
kubectl get pods -n production
kubectl describe pod my-app-xxxxx -n production

# 7. 查看资源树
argocd app get my-app --show-operation

# 8. 强制刷新缓存
argocd app get my-app --hard-refresh
```

**常见问题及解决方案**

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| OutOfSync | Git 与集群不一致 | 执行 sync 或检查是否有手动修改 |
| SyncFailed | YAML 语法错误 | 检查 Git 仓库中的 YAML 格式 |
| Degraded | Pod 未正常运行 | 检查 Pod 日志和事件 |
| Missing | 资源被手动删除 | 执行 sync 重新创建 |
| Unknown | 网络或权限问题 | 检查 repo 连接和 cluster 凭证 |
| HookFailed | PreSync/PostSync hook 失败 | 检查 hook Job 日志 |

**使用场景**

- 部署后 Application 状态为 OutOfSync 或 Degraded
- 同步操作卡在 Progressing 状态
- 资源创建成功但健康检查失败
- 配置变更未按预期生效

**潜在风险与注意事项**

- `--hard-refresh` 会重新拉取 Git 仓库并重建缓存，频繁使用会增加 Argo CD 负载
- 查看 controller 日志时注意过滤，避免被大量无关日志淹没
- 某些 OutOfSync 状态可能是 K8s 控制器的正常行为（如 HPA 修改 replicas）
- 使用 `argocd app wait` 在 CI/CD 流水线中等待部署完成

**本章小结**

系统化的故障排查能力是 GitOps 开发者的核心技能。掌握 `argocd app get/diff/logs` 命令组合，结合 K8s 原生排查工具，可以快速定位和解决大多数部署问题。

---

## 14.4 AWS 核心技能

### 14.4.1 EKS 集群管理

**解决的问题**

Amazon EKS 是运行 Argo CD 和 K8s 工作负载的托管平台。开发者需要掌握 EKS 集群的创建、节点组管理和版本升级。

**核心原理**

EKS 由 AWS 管理 control plane（API Server、etcd），用户负责 worker node 的管理。Argo CD 通常部署在 EKS 集群内，管理同一集群或其他集群的应用。

**代码/配置实现**

```bash
# 使用 eksctl 创建 EKS 集群
eksctl create cluster \
  --name my-cluster \
  --region us-west-2 \
  --version 1.28 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed

# 使用 eksctl 创建节点组
eksctl create nodegroup \
  --cluster my-cluster \
  --region us-west-2 \
  --name spot-workers \
  --node-type c5.large \
  --nodes 5 \
  --nodes-min 3 \
  --nodes-max 20 \
  --spot \
  --managed

# 更新 kubeconfig
aws eks update-kubeconfig --region us-west-2 --name my-cluster

# 查看集群信息
aws eks describe-cluster --name my-cluster --region us-west-2

# EKS 版本升级
eksctl upgrade cluster --name my-cluster --region us-west-2 --version 1.29

# 升级节点组
eksctl upgrade nodegroup --cluster my-cluster --name standard-workers

# 节点排水（安全移除节点）
kubectl drain ip-10-0-1-100.ec2.internal \
  --ignore-daemonsets \
  --delete-emptydir-data

# 使用 Terraform 创建 EKS（生产推荐）
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "my-cluster"
  cluster_version = "1.28"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  eks_managed_node_groups = {
    main = {
      desired_size = 3
      min_size     = 3
      max_size     = 10
      instance_types = ["t3.medium", "t3.large"]
    }
  }
}
```

**使用场景**

- 新项目初始化时创建 EKS 集群
- 业务增长时扩缩节点组
- K8s 版本生命周期结束时升级集群
- 故障节点替换和节点组滚动更新

**潜在风险与注意事项**

- EKS 版本升级需先升级 addon（CoreDNS、kube-proxy、VPC CNI），再升级 control plane，最后升级节点组
- 节点组升级时使用 `--max-unavailable` 控制并行度，避免影响业务
- 使用 Spot 实例时需配置 interruption handling 和 PodDisruptionBudget
- 集群升级前务必测试应用兼容性

**本章小结**

EKS 是 AWS 上运行 K8s 和 Argo CD 的标准平台。掌握 eksctl 和 Terraform 两种创建方式，理解版本升级流程和节点管理，是 AWS 环境下 GitOps 开发者的必备技能。

---

### 14.4.2 IAM 权限管理

**解决的问题**

AWS IAM 是 EKS 和 Argo CD 的权限基础。错误的权限配置可能导致安全漏洞或服务不可用。IRSA（IAM Roles for Service Accounts）是 EKS 上推荐的服务间认证方式。

**核心原理**

IRSA 通过 OIDC 提供商将 K8s ServiceAccount 与 AWS IAM Role 关联。Pod 中的 SDK 自动获取临时凭证，无需硬编码密钥。Argo CD 使用 IRSA 访问 ECR、S3 等 AWS 资源。

**代码/配置实现**

```bash
# 1. 创建 OIDC 提供商
eksctl utils associate-iam-oidc-provider \
  --cluster my-cluster \
  --region us-west-2 \
  --approve

# 2. 创建 IAM Role 并关联 ServiceAccount
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --region us-west-2 \
  --name argocd-manager \
  --namespace argocd \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly \
  --approve

# 3. 为 Argo CD 创建自定义 IAM 策略
cat > argocd-iam-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability",
        "ecr:DescribeRepositories",
        "ecr:ListImages"
      ],
      "Resource": "arn:aws:ecr:us-west-2:123456789:repository/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name argocd-ecr-policy \
  --policy-document file://argocd-iam-policy.json

# 4. 为 Argo CD 创建 IRSA
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --name argocd-repo-server \
  --namespace argocd \
  --attach-policy-arn arn:aws:iam::123456789:policy/argocd-ecr-policy \
  --approve

# 5. 为开发者创建最小权限策略
cat > developer-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:DescribeRepositories"
      ],
      "Resource": "*"
    }
  ]
}
EOF
```

```yaml
# K8s ServiceAccount 与 IAM Role 关联
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-repo-server
  namespace: argocd
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/argocd-repo-server
```

**使用场景**

- Argo CD 从 ECR 拉取镜像清单
- CI/CD 流水线推送镜像到 ECR
- 应用 Pod 访问 S3、DynamoDB 等 AWS 服务
- 开发者通过 kubectl 访问 EKS 集群

**潜在风险与注意事项**

- 遵循最小权限原则，每个 ServiceAccount 只授予必要的权限
- 定期轮换 IAM 密钥，使用 IRSA 替代长期密钥
- 使用 `aws sts assume-role` 进行跨账户访问
- IAM policy 的变更需要几分钟才能生效

**本章小结**

IRSA + OIDC 是 EKS 上推荐的 IAM 最佳实践。它为每个 Pod 提供独立的 AWS 身份，避免了密钥泄露风险。GitOps 开发者需要理解 IAM Role、Policy 和 ServiceAccount 的关系，才能正确配置 Argo CD 的 AWS 访问权限。

---

### 14.4.3 网络配置

**解决的问题**

EKS 集群的网络配置直接影响应用的可用性和安全性。开发者需要理解 VPC、安全组、负载均衡器的配置方法。

**核心原理**

EKS 集群运行在 AWS VPC 中，Pod 使用 VPC CNI 插件直接分配 VPC IP 地址。Ingress Controller（AWS Load Balancer Controller）创建 ALB/NLB 将外部流量路由到 Service。

**代码/配置实现**

```bash
# 创建 VPC（使用 eksctl）
eksctl create cluster \
  --name my-cluster \
  --vpc-cidr 10.0.0.0/16 \
  --vpc-private-subnets 10.0.1.0/24,10.0.2.0/24,10.0.3.0/24 \
  --vpc-public-subnets 10.0.101.0/24,10.0.102.0/24,10.0.103.0/24

# 安装 AWS Load Balancer Controller
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --name aws-load-balancer-controller \
  --namespace kube-system \
  --attach-policy-arn arn:aws:iam::123456789:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=my-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

```yaml
# ALB Ingress 配置
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-west-2:123456789:certificate/xxxxx
    alb.ingress.kubernetes.io/healthcheck-path: /healthz
    alb.ingress.kubernetes.io/security-groups: sg-xxxxx
spec:
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-app-svc
            port:
              number: 80
```

```yaml
# NLB Service 配置
apiVersion: v1
kind: Service
metadata:
  name: my-app-nlb
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
spec:
  type: LoadBalancer
  selector:
    app: my-app
  ports:
  - port: 443
    targetPort: 8443
```

```yaml
# 网络策略
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: app-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: my-app
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - port: 8080
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: database
    ports:
    - port: 5432
```

**使用场景**

- 外部用户通过 ALB 访问 Web 应用
- 内部服务通过 NLB 进行 TCP/UDP 流量转发
- 使用 NetworkPolicy 实现微服务间隔离
- 跨 VPC 的集群间通信

**潜在风险与注意事项**

- ALB 的 `target-type: ip` 模式直接路由到 Pod IP，需确保 Pod IP 不变化
- 安全组规则应遵循最小开放原则，仅开放必要端口
- 跨 VPC 通信需配置 VPC Peering 或 Transit Gateway
- ALB 的 idle timeout 应与应用保持一致

**本章小结**

网络配置是 EKS 上最复杂的部分之一。理解 VPC 架构、ALB/NLB 的工作原理和 NetworkPolicy 的配置方法，是保障应用可访问性和安全性的基础。建议使用 AWS Load Balancer Controller 管理 Ingress 资源。

---

## 14.5 CI/CD 核心技能

### 14.5.1 流水线设计

**解决的问题**

CI/CD 流水线是 GitOps 工作流的上游。设计良好的流水线可以确保只有经过验证的变更才能进入 Git 仓库，从而触发 Argo CD 同步。

**核心原理**

GitOps 模式下的 CI/CD 流水线分为两个阶段：CI 阶段负责构建、测试和推送镜像；CD 阶段由 Argo CD 自动完成。CI 流水线的最终产物是更新后的 Git 仓库（包含新镜像标签的 YAML 清单）。

**代码/配置实现**

```yaml
# GitHub Actions 流水线示例
name: Build and Deploy

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-west-2
  ECR_REPOSITORY: my-app
  CLUSTER_NAME: my-cluster

jobs:
  # 阶段一：构建和测试
  build-and-test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'

    - name: Run unit tests
      run: ./gradlew test

    - name: Run integration tests
      run: ./gradlew integrationTest

    - name: Build Docker image
      run: docker build -t $ECR_REPOSITORY:${{ github.sha }} .

    - name: Run security scan
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: $ECR_REPOSITORY:${{ github.sha }}
        format: sarif
        severity: CRITICAL,HIGH

  # 阶段二：推送镜像
  push-image:
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
        aws-region: ${{ env.AWS_REGION }}

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v2

    - name: Build, tag, and push image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }} .
        docker tag $ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }} \
          $ECR_REGISTRY/$ECR_REPOSITORY:latest
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }}
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

  # 阶段三：更新 Git 仓库（触发 Argo CD 同步）
  update-manifest:
    needs: push-image
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
      with:
        repository: my-org/my-app-config
        token: ${{ secrets.GH_PAT }}

    - name: Update image tag in Kustomize
      run: |
        cd k8s/overlays/production
        kustomize edit set image my-app=$ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }}

    - name: Commit and push
      run: |
        git config user.name "CI Bot"
        git config user.email "ci@example.com"
        git add .
        git commit -m "chore: update my-app image to ${{ github.sha }}"
        git push
```

```yaml
# GitLab CI 流水线示例
stages:
  - test
  - build
  - push
  - update-manifest

variables:
  AWS_REGION: us-west-2
  ECR_REPOSITORY: my-app

unit-test:
  stage: test
  image: gradle:8-jdk17
  script:
    - ./gradlew test
  artifacts:
    reports:
      junit: build/test-results/**/*.xml

build-image:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker build -t $ECR_REPOSITORY:$CI_COMMIT_SHA .
    - docker tag $ECR_REPOSITORY:$CI_COMMIT_SHA $ECR_REPOSITORY:latest

push-image:
  stage: push
  image: docker:24
  services:
    - docker:24-dind
  script:
    - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com
    - docker push $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$CI_COMMIT_SHA
    - docker push $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

update-manifest:
  stage: update-manifest
  script:
    - git clone https://$GH_TOKEN@github.com/my-org/my-app-config.git
    - cd my-app-config
    - sed -i "s|image: my-app:.*|image: my-app:$CI_COMMIT_SHA|" k8s/deployment.yaml
    - git config user.name "CI Bot"
    - git config user.email "ci@example.com"
    - git commit -am "chore: update my-app to $CI_COMMIT_SHA"
    - git push
```

**使用场景**

- 每次代码合并到 main 分支时自动构建和部署
- 多环境部署（dev → staging → production）
- 需要安全扫描和合规检查的部署流程
- 需要人工审批的生产环境部署

**潜在风险与注意事项**

- CI 流水线使用的 GitHub Token 应具有最小权限（仅写入配置仓库）
- 镜像构建应使用不可变标签（commit SHA），而非 `latest`
- 流水线失败时应有通知机制（Slack、邮件）
- 配置仓库和应用代码仓库应分离，避免 CI 权限过大

**本章小结**

GitOps 模式下的 CI/CD 流水线以 Git 仓库为分界点：CI 负责构建和验证，CD 由 Argo CD 自动完成。这种分离降低了部署风险，提高了安全性。建议使用 GitHub Actions 或 GitLab CI 实现流水线。

---

### 14.5.2 镜像管理

**解决的问题**

容器镜像管理是 CI/CD 流水线的核心环节。不合理的镜像标签策略和生命周期管理会导致存储成本增加、部署混乱和安全风险。

**核心原理**

镜像管理涉及三个关键决策：标签策略（使用不可变标签）、存储策略（ECR 生命周期规则）、安全策略（镜像扫描）。Argo CD 通过镜像更新器（Argo CD Image Updater）自动检测新镜像并更新配置。

**代码/配置实现**

```bash
# 镜像标签策略：使用 Git commit SHA
docker build -t my-app:a1b2c3d4e5f6 .
docker tag my-app:a1b2c3d4e5f6 my-app:1.2.3
docker tag my-app:a1b2c3d4e5f6 my-app:latest

# 推送所有标签
docker push my-app:a1b2c3d4e5f6
docker push my-app:1.2.3
docker push my-app:latest

# ECR 生命周期策略
cat > ecr-lifecycle-policy.json << EOF
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "保留最近 30 个镜像",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 30
      },
      "action": {
        "type": "expire"
      }
    },
    {
      "rulePriority": 2,
      "description": "保留 tagged 镜像（版本标签）",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v"],
        "countType": "imageCountMoreThan",
        "countNumber": 100
      },
      "action": {
        "type": "expire"
      }
    },
    {
      "rulePriority": 3,
      "description": "删除超过 90 天的 untagged 镜像",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 90
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
EOF

aws ecr put-lifecycle-policy \
  --repository-name my-app \
  --lifecycle-policy-text file://ecr-lifecycle-policy.json

# 镜像扫描
aws ecr put-image-scanning-configuration \
  --repository-name my-app \
  --image-scanning-configuration scanOnPush=true

# 查看扫描结果
aws ecr describe-image-scan-findings \
  --repository-name my-app \
  --image-id imageTag=a1b2c3d4e5f6
```

```yaml
# Argo CD Image Updater 配置
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  annotations:
    argocd-image-updater.argoproj.io/image-list: my-app=123456789.dkr.ecr.us-west-2.amazonaws.com/my-app
    argocd-image-updater.argoproj.io/my-app.update-strategy: semver
    argocd-image-updater.argoproj.io/my-app.allow-tags: regex:^v[0-9]+\.[0-9]+\.[0-9]+$
    argocd-image-updater.argoproj.io/write-back-method: git:secret:argocd/git-creds
spec:
  source:
    repoURL: https://github.com/my-org/my-app-config.git
    path: k8s/overlays/production
```

**使用场景**

- 每次 CI 构建后推送新镜像到 ECR
- 自动清理过期镜像，控制存储成本
- 使用 Argo CD Image Updater 自动检测新版本
- 镜像安全扫描确保无高危漏洞

**潜在风险与注意事项**

- `latest` 标签不可用于生产部署，它是不变的引用
- ECR 生命周期规则删除镜像后，正在运行的 Pod 不受影响
- 镜像扫描结果应作为 CI 流水线的门禁（gate）
- 多架构镜像（arm64/amd64）需使用 manifest list

**本章小结**

镜像管理是 CI/CD 流水线的重要环节。使用不可变标签（commit SHA）、配置 ECR 生命周期规则、启用镜像扫描，是保障镜像安全和控制成本的最佳实践。Argo CD Image Updater 可以进一步自动化镜像更新流程。

---

### 14.5.3 自动化测试

**解决的问题**

在 GitOps 工作流中，错误的配置变更可能影响整个集群。自动化测试可以在变更到达生产环境之前发现错误，是 GitOps 安全模型的重要组成部分。

**核心原理**

GitOps 的测试金字塔包括：单元测试（验证 YAML 语法和结构）、集成测试（验证 K8s 资源交互）、端到端测试（验证完整业务流程）。测试在 CI 流水线中执行，通过后才允许合并到 main 分支。

**代码/配置实现**

```yaml
# 单元测试：使用 conftest 验证 YAML 策略
# policy/require-resource-limits.rego
package main

deny[msg] {
  input.kind == "Deployment"
  not input.spec.template.spec.containers[_].resources.limits
  msg = "所有容器必须设置资源 limits"
}

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  container.resources.limits.cpu == ""
  msg = sprintf("容器 %v 必须设置 CPU limit", [container.name])
}

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  container.resources.limits.memory == ""
  msg = sprintf("容器 %v 必须设置 Memory limit", [container.name])
}
```

```yaml
# 策略测试：禁止使用 latest 标签
package main

deny[msg] {
  input.kind == "Deployment"
  some container
  container := input.spec.template.spec.containers[_]
  endswith(container.image, ":latest")
  msg = sprintf("容器 %v 禁止使用 latest 标签", [container.name])
}

deny[msg] {
  input.kind == "Deployment"
  input.spec.replicas < 2
  msg = "生产环境 Deployment 副本数必须 >= 2"
}
```

```bash
# 在 CI 中执行策略测试
conftest test k8s/overlays/production/ \
  --policy policy/ \
  --namespace main

# 使用 kube-score 检查 K8s 最佳实践
kube-score score k8s/overlays/production/*.yaml

# 使用 kubeval 验证 YAML 语法
kubeval k8s/overlays/production/*.yaml \
  --kubernetes-version 1.28.0

# 使用 pluto 检查弃用 API
pluto detect-files -d k8s/overlays/production/

# 集成测试：使用 kind 创建临时集群
kind create cluster --name test-cluster
kubectl apply -f k8s/overlays/test/
kubectl wait --for=condition=Available deployment/my-app --timeout=60s
kubectl port-forward svc/my-app-svc 8080:80 &
curl http://localhost:8080/healthz
kind delete cluster --name test-cluster
```

```yaml
# GitHub Actions 中的测试阶段
name: Validate Infrastructure

on:
  pull_request:
    paths:
    - 'k8s/**'
    - 'policy/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Validate YAML syntax
      run: |
        find k8s -name "*.yaml" -exec yamllint {} \;

    - name: Check deprecated APIs
      uses: fairwinds/pluto-action@main
      with:
        files: k8s

    - name: Run OPA policy tests
      uses: instrumenta/conftest-action@v1
      with:
        files: k8s/overlays/production
        policy: policy

    - name: Score Kubernetes manifests
      uses: actions/setup-go@v5
      run: |
        go install github.com/zegl/kube-score/cmd/kube-score@latest
        kube-score score k8s/overlays/production/*.yaml

    - name: Dry run against cluster
      run: |
        kubectl apply -f k8s/overlays/production/ --dry-run=server
```

**使用场景**

- PR 创建时自动验证基础设施变更
- 部署前验证 YAML 语法和策略合规性
- 使用临时集群进行集成测试
- 端到端测试验证完整业务流程

**潜在风险与注意事项**

- 策略测试不能替代人工审查，只能作为辅助工具
- 集成测试使用临时集群时，注意测试数据的隔离
- 端到端测试耗时较长，建议在关键路径上使用
- 测试覆盖率应逐步提升，避免一次性要求过高

**本章小结**

自动化测试是 GitOps 安全模型的重要防线。conftest + OPA 策略测试可以捕获大部分常见错误，kind 临时集群可以验证实际部署效果。建议在 CI 流水线中集成多层测试，确保变更安全可靠。

---

## 14.6 学习路线图

### 14.6.1 初级阶段：K8s 基础与 Git

**解决的问题**

初学者面对 K8s 和 GitOps 的庞大知识体系，容易迷失方向。明确的学习路线可以帮助开发者循序渐进地掌握必要技能。

**核心原理**

初级阶段的目标是建立 K8s 和 Git 的基础知识体系，为后续的 GitOps 学习打下坚实基础。

**学习内容**

| 主题 | 具体内容 | 学习目标 |
|------|---------|---------|
| K8s 核心概念 | Pod、Deployment、Service、Namespace | 理解 K8s 基本架构和资源模型 |
| kubectl 基础 | get、describe、logs、exec、apply、delete | 能够独立操作 K8s 集群 |
| Git 工作流 | clone、commit、push、pull、branch、merge、rebase | 掌握 Git 协作基本操作 |
| YAML 基础 | 语法、数据结构、多文档 | 能够编写和阅读 K8s 清单 |
| 容器基础 | Dockerfile、镜像构建、容器运行时 | 理解容器化原理 |

**推荐资源**

- **K8s 官方教程**：Kubernetes Basics 互动教程
- **K8s the Hard Way**：深入理解 K8s 组件
- **Git 练习**：Learn Git Branching 互动网站
- **Docker 入门**：Docker Get Started 官方指南

**实践项目**

1. 在本地使用 kind 或 minikube 搭建单节点集群
2. 部署一个 Nginx Deployment 并暴露为 Service
3. 使用 ConfigMap 修改 Nginx 配置
4. 练习 Git 分支操作和 PR 流程

**本章小结**

初级阶段的目标是建立扎实的基础。不要急于学习 Argo CD，先确保能够独立操作 K8s 集群、编写 YAML 清单、使用 Git 协作。这个阶段通常需要 2-4 周。

---

### 14.6.2 中级阶段：Argo CD、Helm 与 Kustomize

**解决的问题**

掌握基础后，开发者需要学习 GitOps 的核心工具链：Argo CD 作为 CD 引擎，Helm 和 Kustomize 作为配置管理工具。

**核心原理**

中级阶段的核心是理解"声明式配置 + 自动化同步"的 GitOps 工作流。Helm 适合管理复杂应用的版本化部署，Kustomize 适合管理环境差异化的配置覆盖。

**学习内容**

| 主题 | 具体内容 | 学习目标 |
|------|---------|---------|
| Argo CD 基础 | 安装、Application 管理、同步策略 | 能够独立部署和管理 Argo CD |
| Helm 基础 | Chart 结构、模板、values、依赖 | 能够编写和使用 Helm Chart |
| Kustomize 基础 | overlay、base、patch、generator | 能够使用 Kustomize 管理环境差异 |
| Argo CD 进阶 | App of Apps、Project、RBAC、SSO | 能够设计多团队 GitOps 架构 |
| 配置管理 | SealedSecret、External Secrets、Vault | 能够安全管理敏感配置 |

**推荐资源**

- **Argo CD 官方文档**：完整的概念和操作指南
- **Helm 官方文档**：Chart 开发最佳实践
- **Kustomize 官方文档**：配置管理进阶
- **Argo CD 实战**：Awesome Argo CD 示例集合

**实践项目**

1. 在 EKS 集群上安装 Argo CD
2. 使用 Helm Chart 部署应用并通过 Argo CD 管理
3. 使用 Kustomize 管理 dev/staging/production 三个环境
4. 实现 App of Apps 模式管理微服务集群
5. 集成 SealedSecret 管理敏感配置

**本章小结**

中级阶段是 GitOps 开发者的核心能力建设期。掌握 Argo CD、Helm 和 Kustomize 三件套后，可以应对大多数企业级 GitOps 场景。这个阶段通常需要 4-8 周。

---

### 14.6.3 高级阶段：多集群、渐进式交付与安全

**解决的问题**

企业级 GitOps 面临多集群管理、灰度发布和安全合规等复杂挑战。高级阶段的目标是掌握这些进阶技能。

**核心原理**

高级阶段涉及三个方向：多集群管理（Argo CD 的 hub-and-spoke 架构）、渐进式交付（Argo Rollouts 的蓝绿/金丝雀发布）、安全加固（RBAC、OPA、审计）。

**学习内容**

| 主题 | 具体内容 | 学习目标 |
|------|---------|---------|
| 多集群管理 | Argo CD 多集群注册、Cluster Secret、多集群 Application | 能够管理 10+ 集群 |
| 渐进式交付 | Argo Rollouts、蓝绿部署、金丝雀发布、Analysis | 能够实现灰度发布 |
| 安全加固 | Argo CD RBAC、Project 隔离、OPA 策略、审计日志 | 能够设计安全的多租户架构 |
| 监控告警 | Argo CD Metrics、Prometheus/Grafana、通知集成 | 能够监控 GitOps 流水线 |
| 灾备恢复 | Disaster Recovery、Velero、跨区域部署 | 能够设计高可用 GitOps 架构 |

**代码/配置实现**

```yaml
# Argo Rollouts 金丝雀发布
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: my-app-rollout
spec:
  replicas: 10
  strategy:
    canary:
      steps:
      - setWeight: 10
      - pause: {duration: 5m}
      - setWeight: 30
      - pause: {duration: 5m}
      - setWeight: 60
      - pause: {duration: 5m}
      - setWeight: 100
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: app
        image: my-app:1.2.0
```

```yaml
# 多集群 Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-multi-cluster
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/my-app-config.git
    targetRevision: main
    path: k8s/overlays/production
  destination:
    name: production-cluster-1
    namespace: production
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-dr
spec:
  source:
    repoURL: https://github.com/my-org/my-app-config.git
    targetRevision: main
    path: k8s/overlays/dr
  destination:
    name: dr-cluster
    namespace: production
```

```yaml
# Argo CD Project 多租户隔离
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: team-platform
  namespace: argocd
spec:
  sourceRepos:
  - 'https://github.com/my-org/platform-*'
  destinations:
  - namespace: 'platform-*'
    server: 'https://kubernetes.default.svc'
  clusterResourceWhitelist:
  - group: ''
    kind: ['Namespace', 'PersistentVolume']
  roles:
  - name: admin
    policies:
    - p, proj:team-platform:admin, applications, *, team-platform/*, allow
  - name: developer
    policies:
    - p, proj:team-platform:developer, applications, sync, team-platform/*, allow
    - p, proj:team-platform:developer, applications, get, team-platform/*, allow
```

**推荐资源**

- **Argo Rollouts 官方文档**：渐进式交付完整指南
- **Argo CD 多集群管理**：官方多集群最佳实践
- **CNCF Security**：云原生安全白皮书
- **AWS Well-Architected Framework**：AWS 架构最佳实践

**实践项目**

1. 管理 3 个以上 EKS 集群（dev/staging/production/DR）
2. 实现金丝雀发布并集成 Prometheus 指标分析
3. 设计多租户 Argo CD Project 架构
4. 实现跨区域灾备恢复方案
5. 集成 OPA 策略引擎实现合规检查

**潜在风险与注意事项**

- 多集群管理时注意网络延迟和 API 版本差异
- 渐进式交付需要完善的监控和告警体系
- 安全配置应遵循最小权限原则，定期审计
- 灾备方案需要定期演练，确保可用

**本章小结**

高级阶段的目标是成为 GitOps 架构师。多集群管理、渐进式交付和安全合规是企业级 GitOps 的核心挑战。掌握这些技能后，可以设计和管理大规模、高可用的 GitOps 平台。这个阶段需要持续学习和实践，通常需要 3-6 个月。

---

## 14.7 综合实战案例

### 14.7.1 端到端 GitOps 工作流

**场景描述**

某团队需要为微服务应用搭建完整的 GitOps 工作流，包括：代码仓库、CI 流水线、配置仓库、Argo CD 部署、多环境管理。

**架构设计**

```
开发者提交代码
    ↓
GitHub 代码仓库（应用源码）
    ↓
CI 流水线（GitHub Actions）
  ├── 单元测试
  ├── 集成测试
  ├── 镜像构建 & 安全扫描
  └── 推送镜像到 ECR
    ↓
GitHub 配置仓库（更新镜像标签）
    ↓
Argo CD 检测到 Git 变更
    ↓
自动同步到 EKS 集群
  ├── dev 环境（自动同步）
  ├── staging 环境（自动同步 + 人工审批）
  └── production 环境（自动同步 + 自愈 + 重试）
```

**完整配置**

```yaml
# 1. 配置仓库目录结构
# k8s/
# ├── base/
# │   ├── deployment.yaml
# │   ├── service.yaml
# │   ├── ingress.yaml
# │   └── kustomization.yaml
# ├── overlays/
# │   ├── dev/
# │   │   ├── kustomization.yaml
# │   │   └── patch-replicas.yaml
# │   ├── staging/
# │   │   ├── kustomization.yaml
# │   │   └── patch-resources.yaml
# │   └── production/
# │       ├── kustomization.yaml
# │       ├── patch-hpa.yaml
# │       └── patch-ingress.yaml
# └── argocd/
#     ├── dev-app.yaml
#     ├── staging-app.yaml
#     └── production-app.yaml

# 2. Argo CD Application 定义（App of Apps）
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/my-app-config.git
    targetRevision: main
    path: k8s/overlays/dev
  destination:
    server: https://kubernetes.default.svc
    namespace: dev
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-staging
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/my-app-config.git
    targetRevision: main
    path: k8s/overlays/staging
  destination:
    server: https://kubernetes.default.svc
    namespace: staging
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/my-app-config.git
    targetRevision: main
    path: k8s/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    retry:
      limit: 5
      backoff:
        duration: 10s
        factor: 2
        maxDuration: 5m
```

**部署验证**

```bash
# 验证 Argo CD 安装
kubectl get pods -n argocd
kubectl get svc -n argocd

# 登录 Argo CD
argocd login argocd.example.com --sso

# 查看 Application 状态
argocd app list
argocd app get my-app-production

# 手动触发同步
argocd app sync my-app-production

# 验证部署结果
kubectl get pods -n production
kubectl get svc -n production
kubectl get ingress -n production

# 测试应用健康
curl https://app.example.com/healthz
```

---

## 14.8 本章总结

Argo CD GitOps 开发者需要掌握一套跨领域的技能组合：

1. **Kubernetes 核心技能**是基础——理解资源模型、熟练使用 kubectl、掌握部署模式，是操作 Argo CD 的前提
2. **GitOps 核心技能**是方法论——规范的 Git 工作流、声明式配置最佳实践、基础设施代码审查，构成了 GitOps 的三大支柱
3. **Argo CD 核心技能**是工具——Application 管理、同步策略配置、故障排查，是日常工作的主要内容
4. **AWS 核心技能**是平台——EKS 管理、IAM 权限、网络配置，是 AWS 环境下 GitOps 的必备知识
5. **CI/CD 核心技能**是流水线——流水线设计、镜像管理、自动化测试，构成了 GitOps 的上游环节
6. **学习路线图**是成长路径——从 K8s 基础到多集群架构，循序渐进地提升技能水平

GitOps 的核心思想可以概括为一句话：**一切皆代码，一切皆审查，一切可回滚**。掌握本章所述的技能，开发者可以构建安全、可靠、可审计的云原生交付流水线。

---

## 参考资源

- Argo CD 官方文档：https://argo-cd.readthedocs.io/
- Argo Rollouts 官方文档：https://argoproj.github.io/rollouts/
- Kubernetes 官方文档：https://kubernetes.io/docs/
- AWS EKS 文档：https://docs.aws.amazon.com/eks/
- Helm 官方文档：https://helm.sh/docs/
- Kustomize 官方文档：https://kustomize.io/
- Open Policy Agent：https://www.openpolicyagent.org/
- Conftest：https://www.conftest.dev/
