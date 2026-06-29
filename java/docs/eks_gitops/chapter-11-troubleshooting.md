# 第11章 典型问题排查指南

## 11.1 同步问题

### 解决的问题

Argo CD 同步失败是最常见的生产问题，可能由配置漂移、网络问题、资源冲突等多种原因引起。

### 核心原理

同步问题的本质是**期望状态（Git 仓库）与实际状态（Kubernetes 集群）不一致**。Argo CD 通过 diff 检测差异，尝试通过 sync 使两者一致。

### 代码/配置实现

**OutOfSync 排查步骤：**

```bash
# 1. 查看应用状态
argocd app get my-app

# 2. 查看差异详情
argocd app diff my-app

# 3. 查看同步状态
argocd app get my-app -o yaml | grep -A 10 syncStatus

# 4. 强制刷新（重新读取 Git 仓库）
argocd app get my-app --hard-refresh

# 5. 手动同步
argocd app sync my-app --prune --apply-out-of-sync-only
```

**常见 OutOfSync 原因：**

| 原因 | 现象 | 解决方案 |
|------|------|---------|
| 手动修改集群资源 | `OutOfSync` 但 Git 未变更 | 使用 `argocd app sync` 覆盖 |
| ConfigMap/Secret 热更新 | 资源被应用修改 | 使用 immutable 字段 |
| HPA 修改副本数 | Deployment 副本数变化 | 使用 `argocd app sync` |
| 资源被删除 | 资源不存在 | 使用 `--prune` 重新创建 |

**同步超时处理：**

```bash
# 增加同步超时时间
argocd app sync my-app --timeout 600

# 查看同步进度
argocd app wait my-app --health

# 取消卡住的同步
argocd app terminate-op my-app
```

### 使用场景

- 日常同步失败排查
- 配置漂移检测
- 同步冲突解决

### 潜在风险与注意事项

- `--prune` 可能删除不应删除的资源
- 强制同步可能覆盖手动变更
- 同步超时设置过短导致频繁失败

### 本章小结

- 使用 `argocd app diff` 查看差异详情
- `--hard-refresh` 强制重新读取 Git 仓库
- 谨慎使用 `--prune` 避免误删资源

---

## 11.2 连接问题

### 解决的问题

Argo CD 无法连接到 Git 仓库或 Kubernetes 集群是最常见的配置问题。

### 核心原理

Argo CD 需要与三个外部系统建立连接：
1. **Git 仓库**：Repository Server 通过 SSH/HTTPS 拉取配置
2. **Kubernetes 集群**：Application Controller 通过 kubeconfig 管理资源
3. **Webhook**：Git 平台通过 Webhook 通知 Argo CD

### 代码/配置实现

**Repository 连接失败排查：**

```bash
# 1. 测试仓库连接
argocd repo list

# 2. 查看仓库详情
argocd repo get https://github.com/company/manifests.git

# 3. 测试 SSH 连接
ssh -T git@github.com

# 4. 更新仓库凭证
argocd repo update https://github.com/company/manifests.git \
    --ssh-private-key-file ~/.ssh/id_rsa

# 5. 查看 Repository Server 日志
kubectl logs -n argocd deployment/argocd-repo-server --tail=100
```

**Cluster 注册失败排查：**

```bash
# 1. 查看已注册集群
argocd cluster list

# 2. 测试集群连接
argocd cluster get https://xxxx.gr7.us-east-1.eks.amazonaws.com

# 3. 重新注册集群
argocd cluster add my-eks-cluster

# 4. 查看 Controller 日志
kubectl logs -n argocd deployment/argocd-application-controller --tail=100
```

**Webhook 配置排查：**

```bash
# 1. 查看 Webhook 配置
kubectl get secret argocd-secret -n argocd -o jsonpath='{.data.webhook\.github\.secret}' | base64 -d

# 2. 测试 Webhook
curl -X POST https://argocd.example.com/api/webhook \
    -H "X-GitHub-Event: push" \
    -H "Content-Type: application/json" \
    -d '{"ref": "refs/heads/main"}'

# 3. 查看 API Server 日志
kubectl logs -n argocd deployment/argocd-server --tail=100 | grep webhook
```

### 使用场景

- 首次安装配置
- 仓库凭证更新
- 集群证书过期

### 潜在风险与注意事项

- SSH key 权限过于宽松
- HTTPS 凭证明文存储
- Webhook secret 泄露

### 本章小结

- Repository Server 负责连接 Git 仓库
- Application Controller 负责连接 K8s 集群
- Webhook 实现自动同步触发

---

## 11.3 部署问题

### 解决的问题

应用部署失败可能由多种原因引起，包括资源创建失败、健康检查失败、回滚失败等。

### 核心原理

Argo CD 部署流程：
1. 从 Git 拉取配置
2. 构建 K8s 资源清单
3. 应用到目标集群
4. 等待健康检查通过

### 代码/配置实现

**资源创建失败排查：**

```bash
# 1. 查看应用事件
kubectl describe app my-app -n argocd

# 2. 查看资源创建错误
argocd app get my-app -o yaml | grep -A 20 conditions

# 3. 检查 CRD 是否安装
kubectl get crd | grep -i "your-crd"

# 4. 检查资源配额
kubectl describe quota -n my-namespace

# 5. 检查准入 Webhook
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations
```

**健康检查失败排查：**

```bash
# 1. 查看健康状态详情
argocd app get my-app -o yaml | grep -A 20 healthStatus

# 2. 查看 Pod 状态
kubectl get pods -n my-namespace

# 3. 查看 Deployment 状态
kubectl describe deployment my-app -n my-namespace

# 4. 自定义健康检查（argocd-cm）
kubectl edit configmap argocd-cm -n argocd
# 添加：
# resource.customizations.health.apps.k8s.io.Deployment: |
#   hs = {}
#   hs.status = "Healthy"
#   hs.message = "Custom health check passed"
#   return hs
```

**回滚失败排查：**

```bash
# 1. 查看部署历史
argocd app get my-app -o yaml | grep -A 10 history

# 2. 回滚到指定版本
argocd app rollback my-app 3

# 3. 查看回滚状态
argocd app wait my-app --health

# 4. 如果回滚失败，手动恢复
argocd app sync my-app --revision v1.0.0
```

### 使用场景

- 新应用首次部署
- 应用版本更新
- 故障恢复

### 潜在风险与注意事项

- CRD 版本不兼容导致资源创建失败
- 健康检查配置过于严格
- 回滚导致数据迁移问题

### 本章小结

- 使用 `kubectl describe app` 查看应用事件
- 自定义健康检查适配特殊资源
- 回滚前确认数据兼容性

---

## 11.4 性能问题

### 解决的问题

随着管理应用数量增长，Argo CD 可能出现性能瓶颈，影响同步速度和系统稳定性。

### 核心原理

Argo CD 性能瓶颈通常出现在：
- **Application Controller**：管理大量应用时的 reconciliation 压力
- **Repository Server**：大量仓库的 Git 操作
- **Redis**：缓存压力

### 代码/配置实现

**大规模集群优化：**

```yaml
# argocd-cm 配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  # 降低 reconciliation 频率
  controller.reconciliation.timeout: "180"  # 默认 180 秒
  controller.status.timeout: "180"

  # 限制并发同步数
  controller.sync.timeout: "300"
  controller.sync.parallel.limit: "10"

  # 启用缓存
  reposerver.cache.max.size: "500MB"
```

**资源限制调整：**

```yaml
# Application Controller HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: argocd-application-controller
  namespace: argocd
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: argocd-application-controller
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
```

**性能诊断命令：**

```bash
# 查看 Controller 资源使用
kubectl top pod -n argocd -l app.kubernetes.io/name=argocd-application-controller

# 查看 Redis 内存使用
kubectl exec -n argocd deployment/argocd-redis -- redis-cli INFO memory

# 查看 Repository Server 缓存命中率
kubectl logs -n argocd deployment/argocd-repo-server | grep "cache hit"

# 查看同步队列长度
kubectl logs -n argocd deployment/argocd-application-controller | grep "queue depth"
```

### 使用场景

- 管理 100+ 应用的 Argo CD 实例
- 频繁同步导致性能下降
- 内存/CPU 使用率持续高位

### 潜在风险与注意事项

- 降低 reconciliation 频率会延长漂移检测时间
- 增加并发同步数可能导致集群压力
- 缓存过大可能导致 OOM

### 本章小结

- 调整 reconciliation 频率平衡性能和实时性
- 为组件配置 HPA 自动伸缩
- 监控 Redis 缓存和队列深度

---

## 11.5 权限问题

### 解决的问题

RBAC 配置错误导致用户无法执行预期操作，或 SSO 登录失败。

### 核心原理

Argo CD 权限验证链路：
```
用户 → SSO 登录 → Dex/OIDC → 获取用户信息 → RBAC 策略匹配 → 授权/拒绝
```

### 代码/配置实现

**RBAC 配置错误排查：**

```bash
# 1. 查看当前 RBAC 配置
kubectl get configmap argocd-rbac-cm -n argocd -o yaml

# 2. 验证策略语法
argocd admin settings rbac validate

# 3. 测试用户权限
argocd account get-user-info

# 4. 查看当前用户角色
argocd account get-user-info -o yaml

# 5. RBAC 调试模式
kubectl edit configmap argocd-cm -n argocd
# 添加：
# server.rbac.log.enforce.enforce: "true"
# server.rbac.log.enforce.decision: "true"
```

**SSO 登录失败排查：**

```bash
# 1. 查看 Dex 配置
kubectl get configmap argocd-cm -n argocd -o yaml | grep -A 50 dex.config

# 2. 查看 Dex 日志
kubectl logs -n argocd deployment/argocd-dex-server --tail=100

# 3. 测试 OIDC 连接
curl -v https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxxxx/.well-known/openid-configuration

# 4. 检查回调 URL
# 确保 Argo CD URL 配置正确
kubectl get configmap argocd-cm -n argocd -o yaml | grep url
```

**常见权限问题：**

```bash
# 问题：用户无法创建应用
# 检查 AppProject 是否存在
argocd proj list

# 检查用户是否有 project 权限
# 在 argocd-rbac-cm 中添加：
# p, role:developer, applications, create, my-project/*, allow

# 问题：用户无法同步应用
# 检查 sync 权限
# p, role:developer, applications, sync, my-project/*, allow

# 问题：用户无法查看日志
# 检查 logs 权限
# p, role:developer, logs, get, my-project/*, allow
```

### 使用场景

- 新用户加入团队
- 权限变更
- SSO 配置更新

### 潜在风险与注意事项

- RBAC 策略变更后需要重启 API Server
- SSO 回调 URL 必须与 Argo CD URL 完全匹配
- Token 过期时间设置过短导致频繁登录

### 本章小结

- 使用 `argocd admin settings rbac validate` 验证策略
- 启用 RBAC 调试日志排查授权问题
- SSO 配置注意回调 URL 和 Token 过期时间
