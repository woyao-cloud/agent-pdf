# 第12章 安全与合规：TKE 容器安全最佳实践

## 12.1 概述

企业在将业务容器化并迁移至腾讯云 TKE 的过程中，安全与合规是必须跨越的核心门槛。容器化架构引入了镜像、运行时、编排层等多维攻击面，同时等保 2.0、CIS Benchmark 等合规要求对云原生环境提出了明确的审计与控制标准。本章从**容器安全**、**网络安全**、**身份与访问管理**、**数据安全**、**合规建设**五个维度出发，结合腾讯云原生生态产品与开源工具，提供一套可落地、可审计的 TKE 安全加固方案。

---

## 12.2 容器安全

### 12.2.1 解决的问题

容器安全的核心问题是：**如何确保从镜像构建到运行时的全链路可信**。具体包括：

- 镜像层：基础镜像是否存在已知漏洞（CVE）？是否引入了恶意软件？
- 部署层：Pod 是否以过高权限运行？是否允许特权容器？
- 运行时层：容器内是否存在异常进程、文件写入或网络连接？

### 12.2.2 核心原理

容器安全遵循"**构建时扫描 → 部署时策略 → 运行时监控**"三层防线：

1. **构建时**：在镜像推送至 TCR（Tencent Container Registry）或 CI 流水线中，使用 Trivy 等扫描工具对镜像层进行 CVE 匹配。
2. **部署时**：通过 Pod Security Admission（PSA）、Pod Security Standards（PSS）或 OPA Gatekeeper 在 API Server 层面拦截不符合安全策略的 Pod 创建请求。
3. **运行时**：通过 Falco 等运行时安全引擎，利用 eBPF 或内核模块监控容器内的系统调用，实时告警异常行为。

### 12.2.3 代码/配置实现

#### 镜像扫描：TCR 自动扫描 + Trivy CI 集成

TCR 企业版内置镜像安全扫描能力，可在镜像推送后自动触发漏洞扫描：

```yaml
# TCR 扫描配置（通过 TCR 控制台或 API 开启）
apiVersion: tcr.tencentcloud.crossplane.io/v1alpha1
kind: Instance
spec:
  forProvider:
    name: my-tcr-enterprise
    securityScanEnabled: true
    scanOnPush: true
```

CI 流水线中集成 Trivy（适用于自建镜像仓库或 TCR 同步场景）：

```yaml
# .gitlab-ci.yml 片段
trivy-scan:
  stage: test
  image: aquasec/trivy:latest
  script:
    - trivy image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed
        ${CI_REGISTRY_IMAGE}:${CI_COMMIT_SHA}
  only:
    - main
```

#### Pod 安全标准：PSA + PSS

TKE v1.22+ 支持 Pod Security Admission，通过命名空间标签强制执行 Pod 安全标准：

```yaml
# 为命名空间设置 Pod 安全准入标签
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: baseline
    pod-security.kubernetes.io/warn: baseline
```

PSS 定义了三个等级：

| 等级 | 说明 | 适用场景 |
|------|------|----------|
| `privileged` | 无限制 | 系统组件、监控 Agent |
| `baseline` | 最低限制，禁止特权容器、hostNetwork 等 | 一般业务 Pod |
| `restricted` | 严格限制，强制只读根文件系统、非 root 用户等 | 高安全敏感业务 |

#### OPA Gatekeeper 策略示例

OPA Gatekeeper 可定义 PSA 无法覆盖的自定义策略，例如禁止使用 `latest` 标签：

```yaml
# 禁止 latest 标签的约束模板
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8sblocklatesttag
spec:
  crd:
    spec:
      names:
        kind: K8sBlockLatestTag
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sblocklatesttag
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          endswith(container.image, ":latest")
          msg := sprintf("镜像 %v 禁止使用 latest 标签", [container.image])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sBlockLatestTag
metadata:
  name: block-latest-tag
spec:
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
    namespaces:
      - "production"
```

#### 运行时安全：Falco

Falco 通过内核模块或 eBPF 驱动监控系统调用，以下规则检测容器内启动 Shell 的行为：

```yaml
# falco_rules.yaml
- rule: Terminal shell in container
  desc: 检测容器内启动交互式 Shell
  condition: >
    spawned_process and container
    and proc.name in (bash, sh, zsh, dash)
    and not proc.name in (falco,)
  output: >
    ！！！告警：容器内启动 Shell
    (user=%user.name container_id=%container.id image=%container.image proc=%proc.cmdline)
  priority: WARNING
  tags: [container, shell]
```

部署 Falco 至 TKE 集群：

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set driver.kind=ebpf \
  --set tty=true
```

### 12.2.4 使用场景

- **金融、政务等合规敏感行业**：必须开启镜像扫描与 PSA `restricted` 等级，配合 Falco 运行时审计。
- **多租户集群**：使用 OPA Gatekeeper 实现租户级策略隔离，防止跨命名空间越权。
- **CI/CD 流水线**：在构建阶段集成 Trivy，阻断含高危漏洞的镜像进入生产环境。

### 12.2.5 潜在风险与注意事项

- PSA `restricted` 等级会拒绝大量默认配置的 Pod，需提前适配（如明确指定 `runAsNonRoot: true`、`seccompProfile` 等）。
- OPA Gatekeeper 的 Rego 策略编写门槛较高，建议从官方策略库（gatekeeper-library）起步。
- Falco 的 eBPF 驱动需内核版本 ≥ 4.15，TKE 默认内核满足要求，但自定义镜像需确认。
- 镜像扫描存在一定的误报率，建议结合 `--ignore-unfixed` 参数过滤无法修复的漏洞。

### 12.2.6 本章小结

容器安全需要构建"扫描—策略—监控"三层防线。TCR 企业版提供镜像层自动扫描，PSA/PSS 提供部署层策略管控，OPA Gatekeeper 扩展自定义策略，Falco 提供运行时实时监控。四者结合可覆盖容器全生命周期的主要安全风险。

---

## 12.3 网络安全

### 12.3.1 解决的问题

Kubernetes 网络模型默认"扁平化"——所有 Pod 可以互相通信。这在多服务、多租户环境中带来了严重的安全隐患：

- 如何隔离不同业务单元之间的网络流量？
- 如何控制南北向（外部 → 集群）与东西向（Pod ↔ Pod）流量？
- 如何防止 Pod 被恶意利用后横向移动？

### 12.3.2 核心原理

TKE 网络安全的核心架构基于腾讯云 VPC 原生网络，遵循"**网络规划 → 边界控制 → 东西隔离 → 传输加密**"四层模型：

1. **VPC 规划**：合理划分 VPC 与子网，将不同环境（开发、测试、生产）或不同业务线置于独立 VPC 或子网中。
2. **边界控制**：通过安全组（Security Group）和网络 ACL 控制进出集群 Node/Service 的流量。
3. **东西向隔离**：使用 Kubernetes NetworkPolicy 实现 Pod 级微隔离，TKE 默认的 VPC-CNI 模式原生支持 NetworkPolicy。
4. **传输加密**：通过 mTLS（如 Istio 或 cert-manager + Linkerd）实现服务间通信的加密与双向认证。

### 12.3.3 代码/配置实现

#### VPC 与子网规划

```yaml
# 腾讯云 VPC 规划示例（Terraform）
resource "tencentcloud_vpc" "main" {
  name         = "tke-production-vpc"
  cidr_block   = "10.0.0.0/16"
  is_multicast = false
}

resource "tencentcloud_subnet" "app" {
  name              = "app-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "ap-guangzhou-3"
}

resource "tencentcloud_subnet" "db" {
  name              = "db-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "ap-guangzhou-3"
}
```

#### 安全组配置

TKE 集群节点安全组至少开放以下端口：

| 方向 | 协议 | 端口 | 来源 | 说明 |
|------|------|------|------|------|
| 入站 | TCP | 6443 | 管理节点 IP | kube-apiserver |
| 入站 | TCP | 30000-32767 | 0.0.0.0/0 | NodePort 服务 |
| 入站 | TCP | 443 | 0.0.0.0/0 | Ingress HTTPS |
| 入站 | TCP | 80 | 0.0.0.0/0 | Ingress HTTP |
| 入站 | TCP | 22 | 堡垒机 IP | SSH 运维 |
| 出站 | ALL | ALL | 0.0.0.0/0 | 默认出站 |

#### NetworkPolicy 实现东西向隔离

```yaml
# 禁止所有入站流量（默认拒绝）
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
---
# 只允许 frontend 访问 backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 8080
---
# 允许 monitoring 命名空间的 Prometheus 抓取指标
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prometheus-scrape
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring
          podSelector:
            matchLabels:
              app: prometheus
      ports:
        - protocol: TCP
          port: 9090
```

#### mTLS 配置（Istio 示例）

```yaml
# 启用命名空间级 mTLS 严格模式
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT
---
# 允许特定端口使用明文（如健康检查）
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: allow-healthcheck
  namespace: production
spec:
  selector:
    matchLabels:
      app: backend
  portLevelMtls:
    8080:
      mode: STRICT
    8081:
      mode: PERMISSIVE
```

### 12.3.4 使用场景

- **多环境隔离**：生产、预发布、开发环境使用独立 VPC 或对等连接（Peering）实现逻辑隔离。
- **微服务架构**：每个服务只开放必要的端口，通过 NetworkPolicy 限制调用关系，防止横向移动。
- **金融级合规**：开启 Istio mTLS STRICT 模式，确保所有服务间通信均经过双向 TLS 加密。
- **混合云**：通过腾讯云 VPN 或专线连接 IDC，安全组仅允许来自专线网段的入站流量。

### 12.3.5 潜在风险与注意事项

- NetworkPolicy 需要 CNI 插件支持，TKE VPC-CNI 原生支持，但 Global Router 模式需额外安装 NetworkPolicy Agent。
- 安全组有配额限制（单个安全组最多 1000 条规则），大规模集群需合理规划。
- mTLS 会引入一定的性能开销（约 5%-10% 的吞吐量下降），需在安全与性能间权衡。
- Istio 控制面与数据面的证书轮换机制需监控，避免证书过期导致通信中断。

### 12.3.6 本章小结

TKE 网络安全的核心在于"VPC 规划 + 安全组边界 + NetworkPolicy 微隔离 + mTLS 传输加密"的四层模型。VPC 原生网络使 NetworkPolicy 无需额外组件即可生效，配合腾讯云安全组实现从节点到 Pod 的全栈网络管控。对于高合规场景，建议叠加服务网格 mTLS 实现零信任网络架构。

---

## 12.4 身份与访问管理

### 12.4.1 解决的问题

Kubernetes 的访问控制模型复杂且层次多，企业上云后常面临以下问题：

- 如何统一管理腾讯云用户与 Kubernetes 集群内的权限？
- 如何为不同角色（运维、开发、审计）分配最小权限？
- 如何让 Pod 安全地访问云资源（如 COS、CMQ）而不需要硬编码密钥？

### 12.4.2 核心原理

TKE 身份与访问管理遵循"**三层权限模型**"：

1. **CAM（Cloud Access Management）层**：控制用户对 TKE 集群 API 的访问权限（创建/删除集群、调整节点池等）。
2. **RBAC 层**：控制用户或 ServiceAccount 在集群内的操作权限（get/list/create Pod 等）。
3. **IRSA（IAM Role for ServiceAccount）层**：将腾讯云 CAM Role 绑定到 Kubernetes ServiceAccount，使 Pod 可以临时获取云资源访问凭证。

### 12.4.3 代码/配置实现

#### CAM 策略：最小权限原则

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "ccs:DescribeCluster",
        "ccs:DescribeClusterInstances",
        "ccs:DescribeClusterEndpoint"
      ],
      "resource": [
        "qcs::ccs:ap-guangzhou:uin/100000000001:cluster/cls-xxxxx"
      ]
    },
    {
      "effect": "deny",
      "action": [
        "ccs:DeleteCluster",
        "ccs:ModifyCluster"
      ],
      "resource": ["*"]
    }
  ]
}
```

#### Kubernetes RBAC

```yaml
# 只读角色
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: readonly
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "endpoints", "configmaps", "secrets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets"]
    verbs: ["get", "list", "watch"]
---
# 绑定只读角色给开发人员
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dev-readonly
  namespace: development
subjects:
  - kind: User
    name: dev-user@example.com
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: readonly
  apiGroup: rbac.authorization.k8s.io
---
# 运维人员：命名空间级管理员
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: namespace-admin
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
  - nonResourceURLs: ["*"]
    verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ops-admin
  namespace: production
subjects:
  - kind: User
    name: ops-user@example.com
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: namespace-admin
  apiGroup: rbac.authorization.k8s.io
```

#### IRSA：Pod 免密访问云资源

```yaml
# 1. 创建 ServiceAccount 并关联 CAM Role
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cos-access-sa
  namespace: production
  annotations:
    tencentcloud.cam.role.name: TKE-COS-ReadWrite-Role
---
# 2. Pod 使用该 ServiceAccount
apiVersion: v1
kind: Pod
metadata:
  name: data-processor
  namespace: production
spec:
  serviceAccountName: cos-access-sa
  containers:
    - name: processor
      image: myapp/data-processor:latest
      env:
        - name: COS_BUCKET
          value: "my-app-data-1250000000"
```

对应的 CAM Role 信任策略：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "name/cos:GetObject",
        "name/cos:PutObject",
        "name/cos:ListParts"
      ],
      "resource": [
        "qcs::cos:ap-guangzhou:uid/1250000000:my-app-data-1250000000/*"
      ]
    }
  ]
}
```

### 12.4.4 使用场景

- **多团队共享集群**：通过 RBAC RoleBinding 实现命名空间级隔离，开发团队只能操作 `development` 命名空间。
- **审计合规**：为审计人员创建只读 ClusterRole，绑定到只读用户。
- **Pod 访问 COS/CKafka**：使用 IRSA 避免在代码或 ConfigMap 中存储云 API 密钥。
- **CI/CD 机器人**：为 CI 系统创建专用 ServiceAccount，仅授予部署所需的最小权限。

### 12.4.5 潜在风险与注意事项

- CAM 策略与 RBAC 策略是两层独立的权限体系，需同时配置才能实现完整管控。CAM 控制"能否操作 TKE API"，RBAC 控制"能否操作集群内资源"。
- IRSA 依赖 TKE 集群开启 OIDC 提供商，需在集群创建时启用"工作负载身份"功能。
- RBAC 的 `ClusterRole` 绑定（ClusterRoleBinding）会跨所有命名空间生效，授予时需格外谨慎。
- 定期审计 RBAC 绑定关系，移除不再使用的用户或 ServiceAccount。

### 12.4.6 本章小结

TKE 的身份与访问管理采用 CAM + RBAC + IRSA 三层模型。CAM 管控云资源操作，RBAC 管控集群内资源操作，IRSA 实现 Pod 级别的云资源访问授权。三者结合可实现从"人"到"应用"的全链路最小权限管控，是等保合规中"访问控制"要求的核心落地手段。

---

## 12.5 数据安全

### 12.5.1 解决的问题

容器环境中的数据安全面临以下挑战：

- Kubernetes 默认将 Secret 以 Base64 编码存储于 etcd，并非真正的加密。
- etcd 若被攻破，所有集群敏感数据将直接泄露。
- 持久化数据（如 PVC）在存储层是否加密？
- 谁在何时对集群做了什么操作？如何审计？

### 12.5.2 核心原理

数据安全遵循"**传输加密 → 存储加密 → 密钥管理 → 审计追溯**"四层模型：

1. **传输加密**：API Server 默认 TLS，etcd 通信启用 TLS。
2. **存储加密**：etcd 数据加密 + 云硬盘（CBS）加密 + COS 服务端加密。
3. **密钥管理**：使用腾讯云 KMS 管理加密密钥，支持自动轮换。
4. **审计追溯**：开启 CloudAudit 与 Kubernetes Audit Log，记录所有 API 操作。

### 12.5.3 代码/配置实现

#### etcd 加密

```yaml
# EncryptionConfiguration.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - kms:
          name: tencentcloud-kms
          endpoint: kms.ap-guangzhou.tencentcloudapi.com
          cachesize: 100
      - aesgcm:
          keys:
            - name: local-key
              secret: c2VjdXJlLWVuY3J5cHRpb24ta2V5
      - identity: {}
```

TKE 托管集群默认在控制面启用了 etcd 加密，用户无需手动配置。自建集群需将上述文件传递给 kube-apiserver 的 `--encryption-provider-config` 参数。

#### 存储类加密

```yaml
# 使用 KMS 加密的 CBS 存储类
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: cbs-kms-encrypted
provisioner: com.tencent.cloud.csi.cbs
parameters:
  type: CLOUD_SSD
  encrypt: "true"
  kmsKeyId: "kms-xxxxxx"
reclaimPolicy: Retain
allowVolumeExpansion: true
```

#### 审计日志：CloudAudit + Kubernetes Audit

```yaml
# 开启 Kubernetes 审计日志（TKE 控制台可配置）
apiVersion: v1
kind: ConfigMap
metadata:
  name: audit-policy
  namespace: kube-system
data:
  policy.yaml: |
    apiVersion: audit.k8s.io/v1
    kind: Policy
    rules:
      - level: RequestResponse
        resources:
          - group: ""
            resources: ["secrets", "configmaps"]
      - level: Metadata
        resources:
          - group: ""
            resources: ["pods", "deployments", "services"]
      - level: None
        users: ["system:kube-controller-manager"]
        userGroups: ["system:authenticated"]
```

CloudAudit 自动记录腾讯云控制台与 API 的所有操作，可在"腾讯云控制台 → 云审计"中查询：

```bash
# 通过 TC CLI 查询审计日志
tccli cloudaudit DescribeEvents \
  --LookUpAttributes.0.AttributeKey RequestId \
  --LookUpAttributes.0.AttributeValue "req-xxxxx" \
  --StartTime "2025-06-01 00:00:00" \
  --EndTime "2025-06-27 23:59:59"
```

### 12.5.4 使用场景

- **等保二级/三级**：必须开启 etcd 加密与存储加密，审计日志保存 ≥ 180 天。
- **金融行业**：使用 KMS 托管密钥并开启自动轮换，满足密钥管理合规要求。
- **敏感数据存储**：数据库类应用使用加密存储类，确保数据落盘加密。
- **安全事件溯源**：通过 CloudAudit + Kubernetes Audit Log 还原攻击路径。

### 12.5.5 潜在风险与注意事项

- KMS 加密会引入额外的 API 调用延迟（约 5-10ms），高频 Secret 读取场景需评估性能影响。
- 加密密钥丢失将导致数据无法恢复，务必开启 KMS 密钥备份与多区域容灾。
- 审计日志会占用大量存储空间，建议设置日志生命周期策略（如 180 天自动转储至 COS 归档）。
- etcd 加密仅对静态数据生效，etcd 进程内存中的数据仍为明文。

### 12.5.6 本章小结

数据安全是合规的底线。TKE 通过 KMS 加密、加密存储类、etcd 加密和审计日志四层机制，覆盖数据从传输到落盘再到追溯的全链路。建议所有生产集群至少开启 etcd 加密与审计日志，敏感业务叠加 KMS 加密存储类。

---

## 12.6 合规建设

### 12.6.1 解决的问题

合规建设解决的核心问题是：**如何证明你的容器平台满足监管要求**。具体包括：

- 如何对标等保 2.0 通用安全要求？
- 如何验证 Kubernetes 集群配置是否符合 CIS Benchmark？
- 如何建立持续的安全评估机制？

### 12.6.2 核心原理

合规建设遵循"**标准对标 → 自动化检查 → 持续改进**"的闭环：

1. **标准对标**：将等保 2.0 三级要求映射到 TKE 的具体配置项（如访问控制、审计日志、数据加密等）。
2. **自动化检查**：使用 kube-bench 执行 CIS Benchmark 检查，使用 Trivy 进行漏洞评估，使用 OPA Gatekeeper 进行策略合规校验。
3. **持续改进**：将合规检查集成到 CI/CD 流水线，定期生成合规报告。

### 12.6.3 代码/配置实现

#### 等保 2.0 三级映射

| 等保要求 | TKE 对应措施 | 验证方式 |
|----------|-------------|----------|
| 身份鉴别 | CAM + RBAC 最小权限 | 定期审计权限绑定 |
| 访问控制 | NetworkPolicy + 安全组 | 网络策略覆盖率检查 |
| 安全审计 | CloudAudit + Kubernetes Audit | 审计日志完整性检查 |
| 数据完整性 | etcd 加密 + TLS | 加密配置检查 |
| 数据保密性 | KMS 加密存储类 | 存储类加密属性检查 |
| 资源控制 | LimitRange + ResourceQuota | 配额配置检查 |

#### CIS Benchmark 自动化检查

```bash
# 使用 kube-bench 检查 TKE 节点
docker run --rm \
  --pid=host \
  -v /etc:/etc:ro \
  -v /var:/var:ro \
  -v $(which kubectl):/usr/local/mount-from-host/bin/kubectl \
  -v /etc/kubernetes:/etc/kubernetes:ro \
  aquasec/kube-bench:latest \
  --version 1.8 \
  --check 4.1,4.2
```

#### 定期漏洞评估流水线

```yaml
# GitHub Actions 定期扫描
name: Weekly Security Scan
on:
  schedule:
    - cron: "0 2 * * 0"
jobs:
  trivy-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Scan production images
        run: |
          trivy image --severity CRITICAL \
            --format sarif \
            --output trivy-results.sarif \
            ccr.ccs.tencentyun.com/production/app:latest
      - name: Upload SARIF results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: trivy-results.sarif
```

#### 合规仪表盘：使用 Prometheus + Grafana

```yaml
# kube-bench 指标暴露
apiVersion: v1
kind: Service
metadata:
  name: kube-bench-exporter
  namespace: monitoring
  labels:
    app: kube-bench-exporter
spec:
  selector:
    app: kube-bench-exporter
  ports:
    - port: 8080
      targetPort: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kube-bench-exporter
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kube-bench-exporter
  template:
    metadata:
      labels:
        app: kube-bench-exporter
    spec:
      containers:
        - name: exporter
          image: aquasec/kube-bench:latest
          command:
            - /bin/sh
            - -c
            - |
              kube-bench --json --outputfile /tmp/results.json
              # 解析 JSON 并暴露 Prometheus 指标
              jq -r '.Controls[] | .tests[] | .results[] |
                "kube_bench_check{id=\"\(.test_number)\",status=\"\(.status)\"} 1"'
                /tmp/results.json > /tmp/metrics
              python3 -m http.server 8080 --directory /tmp
          ports:
            - containerPort: 8080
```

### 12.6.4 使用场景

- **等保测评前准备**：使用 CIS Benchmark 检查清单逐项整改，生成合规自评报告。
- **金融行业合规**：满足《金融数据安全分级指南》与《商业银行信息科技风险管理指引》要求。
- **SaaS 多租户平台**：通过 OPA Gatekeeper 实现租户级策略合规，确保租户间隔离。
- **供应链安全**：在 CI 流水线中集成 Trivy 扫描，阻断含已知漏洞的镜像进入生产。

### 12.6.5 潜在风险与注意事项

- CIS Benchmark 的部分检查项在 TKE 托管集群中不可修改（如 kube-apiserver 参数），需在 CIS 报告中标记为"托管侧已处理"。
- 等保 2.0 三级要求审计日志保存 ≥ 180 天，需提前规划日志存储成本（建议使用 COS 归档存储）。
- 合规检查不是一次性工作，建议建立月度合规巡检机制。
- 部分安全加固措施（如 PSA `restricted`）可能影响业务 Pod 的正常部署，需提前进行兼容性测试。

### 12.6.6 本章小结

合规建设不是终点，而是持续的过程。通过将等保 2.0 要求映射到 TKE 具体配置，使用 kube-bench 和 Trivy 实现自动化检查，并将合规检查集成到 CI/CD 流水线，企业可以建立"标准对标 → 自动检查 → 持续改进"的合规闭环。TKE 的托管特性已满足大量等保基础要求，用户只需聚焦于业务层和应用层的安全加固。

---

## 12.7 总结与最佳实践

### 12.7.1 安全基线清单

| 维度 | 必选措施 | 推荐措施 |
|------|----------|----------|
| 容器安全 | 开启 TCR 镜像扫描 | PSA `restricted` + Falco |
| 网络安全 | 安全组限制 NodePort | NetworkPolicy 默认拒绝 + mTLS |
| 访问控制 | RBAC 最小权限 | IRSA + CAM 精细化策略 |
| 数据安全 | etcd 加密 + 审计日志 | KMS 加密存储类 |
| 合规 | CIS Benchmark 季度检查 | 等保 2.0 三级对标 + 月度巡检 |

### 12.7.2 实施路线图

1. **第 1 周**：开启 TCR 镜像扫描，配置安全组，启用审计日志。
2. **第 2 周**：实施 RBAC 最小权限，移除所有 `cluster-admin` 的过度授权。
3. **第 3 周**：部署 NetworkPolicy 默认拒绝策略，逐步开放必要端口。
4. **第 4 周**：部署 PSA `baseline` 等级，运行 kube-bench 并修复高危项。
5. **第 5-6 周**：部署 OPA Gatekeeper 自定义策略，集成 Trivy 到 CI 流水线。
6. **第 7-8 周**：部署 Falco 运行时监控，配置告警通知，建立合规巡检机制。

### 12.7.3 常见误区

- **误区一**：开启安全组就足够。安全组只控制节点级流量，Pod 级隔离仍需 NetworkPolicy。
- **误区二**：Secret 是安全的。Base64 编码不是加密，必须开启 etcd 加密。
- **误区三**：CAM 策略可以替代 RBAC。CAM 控制云 API，RBAC 控制集群内 API，两者缺一不可。
- **误区四**：合规是一次性工作。合规是持续过程，需要定期检查与改进。

### 12.7.4 展望

随着云原生安全生态的成熟，TKE 安全体系正在向"**零信任**"和"**安全左移**"方向演进：

- **零信任网络**：以 Istio/Linkerd 的 mTLS 为基础，结合 SPIFFE 身份体系，实现服务级零信任。
- **安全左移**：在开发阶段即嵌入安全扫描（Trivy in IDE）、策略即代码（Policy as Code），将安全问题的修复成本降至最低。
- **AI 辅助安全**：利用 AI 分析审计日志与 Falco 告警，自动识别异常行为模式，降低安全运营人力成本。

---

> **本章作者注**：安全与合规是云原生实践的"守门员"。TKE 提供了从底层基础设施到上层编排的完整安全能力矩阵，但工具只是手段，真正的安全来自于对威胁模型的持续思考和对最小权限原则的坚持。建议读者根据自身业务合规等级，从本章的安全基线清单出发，逐步构建适合自己团队的 TKE 安全体系。
