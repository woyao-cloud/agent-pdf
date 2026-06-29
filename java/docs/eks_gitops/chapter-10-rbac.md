# 第10章 RBAC 与多团队权限管理

## 10.1 Argo CD RBAC 模型

### 解决的问题

多团队共享 Argo CD 时，需要精细的权限控制确保团队间资源隔离。Argo CD 的 RBAC 模型通过角色-资源-动作的三元组实现细粒度访问控制。

### 核心原理

Argo CD RBAC 通过 `argocd-rbac-cm` ConfigMap 配置，使用 CSV 格式的策略定义：

```
p, <role>, <resource>, <action>, <scope>
```

**内置角色：**
- `role:admin`：完全管理权限
- `role:readonly`：只读权限

**资源类型：**
- `applications`：应用管理
- `clusters`：集群管理
- `projects`：项目管理
- `repositories`：仓库管理
- `logs`：日志查看

**动作类型：**
- `get` / `list`：查看
- `create` / `update` / `delete`：管理
- `sync` / `rollback`：操作

### 代码/配置实现

**RBAC 配置示例：**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-rbac-cm
  namespace: argocd
data:
  policy.csv: |
    # 团队 A 管理员
    p, role:team-a-admin, applications, *, team-a/*, allow
    p, role:team-a-admin, projects, get, team-a, allow
    p, role:team-a-admin, logs, get, team-a/*, allow

    # 团队 A 开发者（只能同步，不能删除）
    p, role:team-a-dev, applications, get, team-a/*, allow
    p, role:team-a-dev, applications, sync, team-a/*, allow
    p, role:team-a-dev, applications, update, team-a/*, allow
    p, role:team-a-dev, logs, get, team-a/*, allow

    # 团队 B 只读
    p, role:team-b-readonly, applications, get, team-b/*, allow
    p, role:team-b-readonly, applications, list, team-b/*, allow
    p, role:team-b-readonly, logs, get, team-b/*, allow

    # 全局只读
    p, role:global-readonly, applications, get, *, allow
    p, role:global-readonly, applications, list, *, allow

    # 角色绑定
    g, team-a-admins, role:team-a-admin
    g, team-a-developers, role:team-a-dev
    g, team-b-readers, role:team-b-readonly
    g, external-auditors, role:global-readonly
```

### 使用场景

- 多团队共享 Argo CD 实例
- 开发/测试/生产环境权限隔离
- 外部审计只读访问

### 潜在风险与注意事项

- 策略语法错误导致权限失效
- 角色定义过于宽泛
- 未及时清理离职人员权限

### 本章小结

- RBAC 通过 CSV 策略定义角色-资源-动作
- 支持内置角色和自定义角色
- 结合 AppProject 实现资源隔离

---

## 10.2 多团队配置

### 解决的问题

多团队使用同一 Argo CD 实例时，需要确保团队间的资源隔离和配额管理。

### 核心原理

**AppProject 隔离机制：**
- `sourceRepos`：允许的 Git 仓库
- `destinations`：允许的目标集群和命名空间
- `clusterResourceWhitelist`：允许的集群资源
- `namespaceResourceWhitelist`：允许的命名空间资源

### 代码/配置实现

**AppProject 配置示例：**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: team-a
  namespace: argocd
spec:
  description: Team A Project
  sourceRepos:
  - 'https://github.com/company/team-a-manifests.git'
  - 'https://github.com/company/shared-charts.git'

  destinations:
  - namespace: team-a-dev
    server: https://kubernetes.default.svc
  - namespace: team-a-staging
    server: https://kubernetes.default.svc
  - namespace: team-a-prod
    server: https://kubernetes.default.svc

  clusterResourceWhitelist:
  - group: '*'
    kind: Namespace
  - group: 'rbac.authorization.k8s.io'
    kind: '*'

  namespaceResourceBlacklist:
  - group: 'rbac.authorization.k8s.io'
    kind: 'ClusterRole'
  - group: 'rbac.authorization.k8s.io'
    kind: 'ClusterRoleBinding'

  roles:
  - name: admin
    description: Team A Administrator
    policies:
    - p, proj:team-a:admin, applications, *, team-a/*, allow
    groups:
    - team-a-admins

  - name: developer
    description: Team A Developer
    policies:
    - p, proj:team-a:developer, applications, get, team-a/*, allow
    - p, proj:team-a:developer, applications, sync, team-a/*, allow
    groups:
    - team-a-developers
```

### 使用场景

- 多团队共享 Argo CD
- 环境隔离（dev/staging/prod）
- 资源配额管理

### 潜在风险与注意事项

- 源仓库配置遗漏导致无法同步
- 目标集群配置过于宽松
- 资源白名单/黑名单冲突

### 本章小结

- AppProject 提供源仓库、目标集群、资源类型三层隔离
- 支持项目级别的角色定义
- 结合命名空间实现环境隔离

---

## 10.3 SSO 集成

### 解决的问题

管理多个 Argo CD 用户密码效率低下，且存在安全风险。SSO 集成允许使用企业身份提供商进行统一认证。

### 核心原理

Argo CD 通过 Dex 作为 OIDC 网关，支持多种身份提供商：

```
用户 → Dex → OIDC Provider (GitHub/Google/Cognito/LDAP)
```

### 代码/配置实现

**Dex 配置示例：**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  url: https://argocd.example.com

  dex.config: |
    connectors:
    - type: github
      id: github
      name: GitHub
      config:
        clientID: your-github-client-id
        clientSecret: $dex.github.clientSecret
        orgs:
        - name: your-organization
          teams:
          - team-a-admins
          - team-a-developers

    - type: oidc
      id: cognito
      name: AWS Cognito
      config:
        issuer: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxxxx
        clientID: your-cognito-client-id
        clientSecret: $dex.cognito.clientSecret
        userNameKey: email

  # 角色映射
  accounts:
    team-a-admins: []
    team-a-developers: []
    team-b-readers: []
```

**argocd-secret 配置：**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: argocd-secret
  namespace: argocd
stringData:
  dex.github.clientSecret: your-github-client-secret
  dex.cognito.clientSecret: your-cognito-client-secret
```

### 使用场景

- 企业统一身份认证
- GitHub/GitLab 组织团队映射
- AWS Cognito 用户池集成

### 潜在风险与注意事项

- OIDC 回调 URL 配置错误
- Token 过期导致登录失败
- 团队映射配置错误

### 本章小结

- Dex 作为 OIDC 网关支持多种身份提供商
- 支持 GitHub、Cognito、LDAP 等
- 通过 group 映射实现角色自动分配

---

## 10.4 审计与合规

### 解决的问题

生产环境需要记录所有操作变更，满足合规审计要求。

### 核心原理

Argo CD 的审计日志记录所有 API 调用，包括：
- 应用创建/更新/删除
- 同步操作
- 权限变更
- 登录/登出

### 代码/配置实现

**启用审计日志：**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  audit.enabled: "true"
  audit.log.format: "json"
  audit.log.path: "/var/log/argocd/audit.log"
```

**查看审计日志：**

```bash
# 查看 Argo CD 审计日志
kubectl logs -n argocd deployment/argocd-api-server | grep audit

# 通过 CloudWatch 查看
aws logs filter-log-events \
    --log-group-name /aws/eks/argocd-cluster \
    --filter-pattern "audit" \
    --start-time $(date -d '1 hour ago' +%s)000
```

### 使用场景

- 合规审计要求
- 安全事件调查
- 操作回溯

### 潜在风险与注意事项

- 审计日志占用存储空间
- 日志轮转配置
- 敏感信息脱敏

### 本章小结

- 启用审计日志记录所有 API 操作
- 结合 CloudWatch 实现日志集中管理
- 满足合规审计要求
