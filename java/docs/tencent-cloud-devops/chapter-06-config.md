# 第6章 配置与密钥管理

在 TKE（以及任何生产级 Kubernetes 集群）中，配置与密钥管理是保障应用正确运行和安全性的基石。ConfigMap 将配置从容器镜像中解耦，Secret 保护敏感信息，Helm 则提供了标准化的打包和发布机制。本章从这三个维度展开，深入讲解原理、实践和风险规避。

---

## 6.1 ConfigMap 配置管理

### 6.1.1 解决的问题

传统部署方式下，配置通常硬编码在代码中或打包在镜像里。这导致三个问题：

- **环境耦合**：开发、测试、生产环境的配置不同，每次环境切换都需要重新构建镜像。
- **配置变更风险**：修改配置需要重新部署整个应用，无法快速响应配置变更。
- **配置分散**：同一应用的配置散落在多个配置文件、环境变量和启动参数中，难以统一管理。

ConfigMap 将配置从 Pod 和容器中抽离出来，作为 Kubernetes 的一等资源独立管理，实现配置与镜像的解耦。

### 6.1.2 核心原理

ConfigMap 本质上是键值对（key-value）存储，数据以 `data` 字段保存。Kubernetes 将其存储在 etcd 中，Pod 通过以下两种方式消费：

1. **环境变量注入**：将 ConfigMap 中的键值对映射为 Pod 内容器的环境变量。
2. **文件挂载**：将 ConfigMap 挂载为容器内的文件系统路径。

ConfigMap 的数据量限制为 1MB（etcd 的默认请求大小限制），超出此限制应考虑使用其他存储方案。

### 6.1.3 代码/配置实现

#### 基础 ConfigMap 定义

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  # 键值对形式
  APP_ENV: production
  LOG_LEVEL: info
  CACHE_TTL: "300"
  # 多行配置文件
  nginx.conf: |
    server {
      listen 80;
      location / {
        proxy_pass http://backend:8080;
      }
    }
```

#### 方式一：环境变量注入（valueFrom.configMapKeyRef）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:latest
          env:
            - name: APP_ENV
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: APP_ENV
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: LOG_LEVEL
            - name: CACHE_TTL
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: CACHE_TTL
```

#### 方式二：批量注入（envFrom）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:latest
          envFrom:
            - configMapRef:
                name: app-config
              # 可选前缀，避免与系统环境变量冲突
              prefix: CFG_
          # envFrom 注入后仍可单独覆盖
          env:
            - name: CFG_LOG_LEVEL
              value: debug
```

`envFrom` 会将 ConfigMap 中所有键值对注入为环境变量，适合配置项较多的场景。但需要注意：如果 ConfigMap 中有非法环境变量名（如包含连字符 `-`），Kubernetes 会跳过该键并记录 Event 警告。

#### 方式三：配置文件挂载

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          volumeMounts:
            - name: config-volume
              mountPath: /etc/nginx/conf.d
      volumes:
        - name: config-volume
          configMap:
            name: app-config
            # 可选：只挂载指定键
            items:
              - key: nginx.conf
                path: default.conf
```

#### 方式四：subPath 挂载（不覆盖目录）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:latest
          volumeMounts:
            - name: config-volume
              mountPath: /app/config/app.yaml
              subPath: app.yaml
      volumes:
        - name: config-volume
          configMap:
            name: app-config
            items:
              - key: app.yaml
                path: app.yaml
```

`subPath` 将 ConfigMap 的某个键挂载为单个文件，不会覆盖目标目录中的其他文件。但使用 `subPath` 时，ConfigMap 更新后不会自动同步到容器内文件——这是需要特别注意的限制。

### 6.1.4 使用场景

| 场景 | 推荐方式 | 原因 |
|------|----------|------|
| 应用配置参数（端口、超时、日志级别） | envFrom | 批量注入，管理简单 |
| 数据库连接参数（非敏感） | valueFrom.configMapKeyRef | 精确控制每个环境变量来源 |
| Nginx/Apache 等配置文件 | volumes + mountPath | 保持文件结构完整 |
| 多文件配置目录 | volumes + mountPath | 一次性挂载整个配置目录 |
| 需要保留目录中其他文件 | subPath | 只覆盖指定文件 |

### 6.1.5 热更新机制与限制

#### 热更新原理

当 ConfigMap 通过 volume 方式挂载时，kubelet 会定期（默认 60 秒，由 `--sync-frequency` 控制）同步 ConfigMap 的变化。更新后的数据会写入容器的挂载点，容器内的文件系统会自动感知变化。

```bash
# 更新 ConfigMap
kubectl edit configmap app-config -n production

# 验证容器内文件是否更新（约 1-2 分钟后）
kubectl exec -n production deploy/app -- cat /etc/nginx/conf.d/default.conf
```

#### 应用感知配置变更

大多数应用不会自动监听配置文件变化，需要借助以下机制实现热加载：

**方案一：inotify + 信号**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          lifecycle:
            preStop:
              exec:
                command: ["/usr/sbin/nginx", "-s", "quit"]
          command:
            - /bin/sh
            - -c
            - |
              nginx -g "daemon off;" &
              PID=$!
              while inotifywait -e modify /etc/nginx/conf.d; do
                nginx -s reload
              done
              wait $PID
```

**方案二：Sidecar 重载代理**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:latest
          volumeMounts:
            - name: config-volume
              mountPath: /app/config
        - name: config-reloader
          image: stakater/reloader:v1.0.0
          volumeMounts:
            - name: config-volume
              mountPath: /app/config
          env:
            - name: CONFIG_FILE
              value: /app/config/app.yaml
            - name: RELOAD_METHOD
              value: "http://localhost:8080/actuator/refresh"
```

**方案三：Reloader Operator（推荐）**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
  annotations:
    # ConfigMap 或 Secret 变更时自动触发滚动更新
    reloader.stakater.com/match: "true"
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:latest
          envFrom:
            - configMapRef:
                name: app-config
```

Reloader 会监听标注了 `reloader.stakater.com/match: "true"` 的 Deployment，当引用的 ConfigMap 或 Secret 发生变化时，自动触发滚动更新（RollingUpdate），使 Pod 重新加载配置。

#### 热更新的关键限制

1. **环境变量不会热更新**：通过 `envFrom` 或 `valueFrom.configMapKeyRef` 注入的环境变量，只在 Pod 启动时读取一次。ConfigMap 更新后，运行中的 Pod 的环境变量不会自动更新。必须重建 Pod（如通过 `kubectl rollout restart`）才能生效。

2. **subPath 挂载不会热更新**：使用 `subPath` 挂载的 ConfigMap 文件，kubelet 不会建立符号链接监听机制，更新后不会同步到容器内。

3. **更新延迟**：ConfigMap 更新到容器内文件同步存在延迟（默认 60 秒 + kubelet 同步周期），不能用于需要毫秒级响应的配置变更。

### 6.1.6 潜在风险与注意事项

- **ConfigMap 不存在导致 Pod 无法启动**：如果 Pod 引用了不存在的 ConfigMap，Pod 会处于 `CreateContainerConfigError` 状态。建议使用 `optional: true` 字段允许缺失。
- **环境变量名冲突**：`envFrom` 注入的键名可能与系统环境变量或容器镜像中预设的环境变量冲突，使用 `prefix` 字段避免覆盖。
- **ConfigMap 大小限制**：etcd 默认请求大小为 1.5MB，ConfigMap 实际可用数据量约 1MB。超出此限制应考虑使用持久卷或对象存储。
- **敏感信息不应放在 ConfigMap 中**：ConfigMap 的数据以明文存储在 etcd 中，任何有 etcd 访问权限的人都可以读取。敏感信息应使用 Secret。

### 6.1.7 本章小结

ConfigMap 是 Kubernetes 配置管理的核心资源，支持环境变量注入和文件挂载两种消费方式。环境变量注入适合简单键值对，文件挂载适合复杂配置文件。热更新机制仅对 volume 挂载方式生效，环境变量和 subPath 挂载需要重建 Pod。生产环境中建议结合 Reloader Operator 实现配置变更的自动化滚动更新。

---

## 6.2 Secret 密钥管理

### 6.2.1 解决的问题

应用运行需要管理大量敏感信息：数据库密码、API 密钥、TLS 证书、云服务凭证等。传统方式将这些信息硬编码在代码或配置文件中，存在严重的安全隐患：

- **泄露风险**：密钥随代码提交到 Git 仓库，或暴露在日志、环境变量转储中。
- **管理混乱**：密钥分散在多个位置，难以统一轮换和审计。
- **权限失控**：所有开发者都能访问生产密钥，无法做到最小权限原则。

Secret 提供了标准化的敏感信息管理方案，结合加密、RBAC 和外部密钥管理服务，构建完整的密钥安全体系。

### 6.2.2 核心原理

Secret 在 API 层面与 ConfigMap 类似，也是键值对存储。关键区别在于：

1. **数据编码**：Secret 的 `data` 字段要求值使用 Base64 编码；`stringData` 字段允许明文写入，但 API 返回时仍以 Base64 呈现。
2. **etcd 加密**：Kubernetes 支持对 etcd 中的 Secret 数据进行静态加密（Encryption at Rest）。
3. **节点隔离**：Secret 只分发到调度了对应 Pod 的节点，未调度 Pod 的节点不会收到 Secret 数据。
4. **内存保护**：kubelet 将 Secret 写入 tmpfs（内存文件系统），而非磁盘。

### 6.2.3 代码/配置实现

#### 内置 Secret 类型

**Opaque（通用密钥）**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
  namespace: production
type: Opaque
stringData:
  username: admin
  password: "P@ssw0rd2024!"
  conn-str: "postgresql://admin:P@ssw0rd2024!@pg-primary:5432/orders"
```

**kubernetes.io/dockerconfigjson（镜像仓库凭证）**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tencent-registry-key
  namespace: production
type: kubernetes.io/dockerconfigjson
stringData:
  .dockerconfigjson: |
    {
      "auths": {
        "ccr.ccs.tencentyun.com": {
          "username": "100000000000",
          "password": "your-token-here",
          "auth": "base64-encoded-username:password"
        }
      }
    }
```

在 TKE 中，可以通过 Service Account 自动关联 TCR 凭证，无需手动管理：

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: default
  namespace: production
imagePullSecrets:
  - name: tencent-registry-key
```

**kubernetes.io/tls（TLS 证书）**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tls-cert
  namespace: production
type: kubernetes.io/tls
stringData:
  tls.crt: |
    -----BEGIN CERTIFICATE-----
    MIIE...
    -----END CERTIFICATE-----
  tls.key: |
    -----BEGIN PRIVATE KEY-----
    MIIE...
    -----END PRIVATE KEY-----
```

TLS Secret 通常被 Ingress 引用：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  namespace: production
spec:
  tls:
    - hosts:
        - app.example.com
      secretName: tls-cert
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
```

#### Secret 消费方式

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:latest
          env:
            - name: DB_USERNAME
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: username
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: password
          envFrom:
            - secretRef:
                name: db-secret
          volumeMounts:
            - name: cert-volume
              mountPath: /etc/ssl/certs
              readOnly: true
      volumes:
        - name: cert-volume
          secret:
            secretName: tls-cert
            defaultMode: 0400
```

### 6.2.4 外部密钥管理：腾讯云 SSM 集成

Kubernetes 内置 Secret 存在两个不足：密钥明文存储在 etcd 中（即使 Base64 编码也只是混淆而非加密），且缺乏自动轮换机制。腾讯云凭据管理系统（SSM，Secrets Manager）解决了这些问题。

#### 方案一：secret-store-csi-driver

```yaml
# 安装 CSI 驱动
# helm repo add secrets-store-csi-driver https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts
# helm install csi-secrets-store secrets-store-csi-driver/csi-secrets-store-driver \
#   --namespace kube-system \
#   --set enableSecretRotation=true \
#   --set rotationPollInterval=3600

# 安装腾讯云 SSM Provider
# kubectl apply -f https://raw.githubusercontent.com/TencentCloud/tencentcloud-secrets-store-csi-driver-provider/main/deploy/provider.yaml
```

```yaml
# SecretProviderClass：定义从 SSM 获取哪些密钥
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: tencent-ssm-provider
  namespace: production
spec:
  provider: tencentcloud
  parameters:
    # 腾讯云 SSM 凭据列表
    objects: |
      - objectName: "db-password"
        objectType: "secret"
        objectVersion: "latest"
      - objectName: "api-key"
        objectType: "secret"
        objectVersion: "latest"
      - objectName: "tls-cert"
        objectType: "secret"
        objectVersion: "latest"
  # 可选：同步为 Kubernetes Secret
  secretObjects:
    - secretName: ssm-db-secret
      type: Opaque
      data:
        - objectName: db-password
          key: password
```

```yaml
# Pod 引用 SecretProviderClass
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:latest
          volumeMounts:
            - name: secrets-store
              mountPath: /mnt/secrets
              readOnly: true
      volumes:
        - name: secrets-store
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: tencent-ssm-provider
```

#### 方案二：TKE 原生凭据集成

TKE 控制台支持将 SSM 凭据直接同步为集群 Secret：

```bash
# 通过 TKE API 创建 SSM 同步规则
tke-create-secret-sync-rule \
  --cluster-id cls-xxxxxxxx \
  --secret-name ssm-db-secret \
  --ssm-secret-id db-password \
  --region ap-guangzhou \
  --sync-interval 3600
```

#### 密钥轮换与自动同步

```yaml
# 使用 Reloader + SSM CSI 驱动实现自动轮换
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
  annotations:
    secrets-store.csi.k8s.io/auto-rotation: "true"
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:latest
          volumeMounts:
            - name: secrets-store
              mountPath: /mnt/secrets
              readOnly: true
          # 应用内监听文件变化触发重载
          lifecycle:
            postStart:
              exec:
                command:
                  - /bin/sh
                  - -c
                  - |
                    while inotifywait -e modify /mnt/secrets; do
                      curl -X POST http://localhost:8080/actuator/refresh
                    done &
      volumes:
        - name: secrets-store
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: tencent-ssm-provider
```

#### 方案三：直接通过 SDK 获取 SSM 凭据（适用于 Java 应用）

```java
// 引入腾讯云 SDK
// implementation 'com.tencentcloudapi:tencentcloud-sdk-java-ssm:3.1.1000'

import com.tencentcloudapi.common.Credential;
import com.tencentcloudapi.ssm.v20190923.SsmClient;
import com.tencentcloudapi.ssm.v20190923.models.GetSecretValueRequest;
import com.tencentcloudapi.ssm.v20190923.models.GetSecretValueResponse;

public class SsmManager {
    private final SsmClient client;

    public SsmManager(String secretId, String secretKey, String region) {
        Credential cred = new Credential(secretId, secretKey);
        this.client = new SsmClient(cred, region);
    }

    public String getSecret(String secretName, String versionId) {
        GetSecretValueRequest req = new GetSecretValueRequest();
        req.setSecretName(secretName);
        req.setVersionId(versionId);
        try {
            GetSecretValueResponse resp = client.GetSecretValue(req);
            return resp.getSecretString();
        } catch (Exception e) {
            throw new RuntimeException("Failed to fetch secret from SSM", e);
        }
    }
}
```

### 6.2.5 使用场景

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 数据库密码、API Key | Kubernetes Secret + RBAC | 简单场景，管理成本低 |
| 镜像仓库凭证 | dockerconfigjson Secret | Kubernetes 原生支持，自动拉取 |
| TLS 证书 | TLS Secret + Ingress | 与 Ingress 控制器深度集成 |
| 高安全等级密钥（PCI-DSS） | SSM + secret-store-csi-driver | 密钥不落盘，支持审计和轮换 |
| 动态密钥（临时凭证） | SSM SDK 直接获取 | 每次使用实时获取，无需存储 |
| 大规模密钥轮换 | SSM + Reloader | 自动化轮换 + 应用重载 |

### 6.2.6 潜在风险与注意事项

- **Secret 泄露到 Git**：避免将 Secret YAML 文件提交到代码仓库。使用 SealedSecret、Helm Secrets 或外部密钥管理服务。建议在 `.gitignore` 中添加 `*secret*.yaml` 模式。
- **etcd 未加密**：默认情况下 Secret 在 etcd 中以 Base64 编码存储，并非加密。必须启用 EncryptionConfiguration 对 etcd 中的 Secret 进行静态加密。
- **环境变量泄露**：通过 `env` 注入的 Secret 在进程崩溃时可能出现在 core dump 中，也容易被 `kubectl exec` 查看。高安全场景应使用 volume 挂载。
- **RBAC 权限过大**：避免使用 `cluster-admin` 或 `*` 权限访问 Secret。遵循最小权限原则，只授予 `get` 特定 Secret 的权限。
- **Secret 更新延迟**：与 ConfigMap 相同，通过环境变量注入的 Secret 不会自动更新，需要重建 Pod。

### 6.2.7 本章小结

Secret 是 Kubernetes 中管理敏感信息的标准资源，支持 Opaque、dockerconfigjson 和 TLS 三种内置类型。对于生产环境的高安全需求，建议结合腾讯云 SSM 和 secret-store-csi-driver 实现密钥的外部托管和自动轮换。核心安全原则包括：启用 etcd 加密、严格 RBAC 权限、避免密钥落入 Git、使用 volume 挂载而非环境变量。

---

## 6.3 Helm Chart 包管理

### 6.3.1 解决的问题

直接编写 Kubernetes YAML 管理应用存在以下痛点：

- **重复编写**：每个环境（开发、测试、生产）都需要维护一套相似的 YAML，差异点散落在多个文件中。
- **缺乏版本管理**：YAML 文件没有版本概念，无法追踪"谁在什么时候部署了什么版本"。
- **回滚困难**：部署出错时，需要手动恢复上一版本的 YAML 并重新 apply，操作繁琐且容易出错。
- **缺乏标准化**：不同团队编写的 YAML 风格各异，缺乏统一的模板和参数化机制。

Helm 作为 Kubernetes 的包管理器，通过 Chart 标准化应用的打包、配置和发布流程。

### 6.3.2 核心原理

Helm 的核心概念包括：

- **Chart**：应用的打包格式，包含描述应用运行所需的所有 Kubernetes 资源模板。
- **Release**：Chart 的一次部署实例。同一个 Chart 可以部署多次，每次生成一个独立的 Release。
- **Repository**：Chart 的存储仓库，用于分发和共享 Chart。
- **Values**：模板参数，通过 `values.yaml` 和命令行 `--set` 注入。

Helm 的工作流程：

1. 加载 Chart 模板和 values 文件
2. 模板引擎（Go template）渲染生成最终的 Kubernetes YAML
3. 将渲染后的 YAML 提交给 Kubernetes API Server
4. 记录 Release 信息到 Secret（存储在集群中）

### 6.3.3 代码/配置实现

#### Chart 标准目录结构

```
my-app/
├── Chart.yaml                # Chart 元信息
├── values.yaml               # 默认配置值
├── values-dev.yaml           # 开发环境覆盖
├── values-prod.yaml           # 生产环境覆盖
├── templates/                # Go 模板文件
│   ├── _helpers.tpl          # 辅助模板（命名、标签）
│   ├── deployment.yaml       # Deployment 模板
│   ├── service.yaml          # Service 模板
│   ├── ingress.yaml          # Ingress 模板
│   ├── configmap.yaml        # ConfigMap 模板
│   ├── secret.yaml           # Secret 模板
│   ├── hpa.yaml              # HPA 模板
│   └── NOTES.txt             # 部署后提示信息
├── charts/                   # 子 Chart 依赖
│   └── redis/                # Redis 子 Chart
└── .helmignore               # 打包忽略规则
```

#### Chart.yaml

```yaml
apiVersion: v2
name: my-app
description: 生产级微服务应用
type: application
version: 1.2.0
appVersion: 2.5.1
kubeVersion: ">=1.24.0"
keywords:
  - microservice
  - web
home: https://github.com/example/my-app
sources:
  - https://github.com/example/my-app
maintainers:
  - name: DevOps Team
    email: devops@example.com
dependencies:
  - name: redis
    version: "~17.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
  - name: postgresql
    version: "~12.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
```

#### values.yaml

```yaml
# 全局配置
global:
  environment: production
  region: ap-guangzhou

# 镜像配置
image:
  repository: ccr.ccs.tencentyun.com/production/my-app
  tag: 2.5.1
  pullPolicy: IfNotPresent

# 副本数
replicaCount: 3

# 服务配置
service:
  type: ClusterIP
  port: 8080
  targetPort: 8080

# 资源配置
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi

# 配置
config:
  appEnv: production
  logLevel: info
  cacheTtl: 300

# 密钥引用
secrets:
  dbPassword:
    existingSecret: db-secret
    key: password

# Ingress
ingress:
  enabled: true
  host: app.example.com
  tls:
    enabled: true
    secretName: tls-cert

# 自动扩缩容
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70

# 依赖组件
redis:
  enabled: true
  architecture: replication
  auth:
    enabled: true
    password: ""

postgresql:
  enabled: false
```

#### templates/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-app.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "my-app.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "my-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "my-app.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          env:
            - name: APP_ENV
              value: {{ .Values.config.appEnv }}
            - name: LOG_LEVEL
              value: {{ .Values.config.logLevel }}
            - name: CACHE_TTL
              value: {{ .Values.config.cacheTtl | quote }}
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.secrets.dbPassword.existingSecret }}
                  key: {{ .Values.secrets.dbPassword.key }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          livenessProbe:
            httpGet:
              path: /healthz
              port: {{ .Values.service.targetPort }}
          readinessProbe:
            httpGet:
              path: /ready
              port: {{ .Values.service.targetPort }}
```

#### templates/_helpers.tpl

```yaml
{{- define "my-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "my-app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "my-app.labels" -}}
helm.sh/chart: {{ include "my-app.name" . }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "my-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "my-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "my-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

#### Values 覆盖策略

**多 values 文件分层覆盖**

```bash
# 基础值 + 环境覆盖
helm upgrade --install my-app ./my-app \
  --values values.yaml \
  --values values-prod.yaml \
  --namespace production

# 优先级：命令行 values 文件 > 默认 values.yaml
# 后指定的文件优先级高于先指定的文件
```

**values-prod.yaml**

```yaml
replicaCount: 5
config:
  appEnv: production
  logLevel: warn
resources:
  requests:
    cpu: 1000m
    memory: 1Gi
  limits:
    cpu: 2000m
    memory: 2Gi
autoscaling:
  minReplicas: 5
  maxReplicas: 30
```

**--set 命令行覆盖**

```bash
# 临时覆盖单个值（适合 CI/CD 动态注入）
helm upgrade --install my-app ./my-app \
  --values values.yaml \
  --values values-prod.yaml \
  --set image.tag=2.6.0 \
  --set replicaCount=10 \
  --set-string config.cacheTtl=600 \
  --namespace production

# --set-file：从文件读取值
helm upgrade --install my-app ./my-app \
  --set-file config.tlsCert=tls.crt \
  --namespace production
```

**优先级规则**：`--set` > `--values` 后指定 > `--values` 先指定 > `values.yaml` 默认值

#### 版本管理与回滚

```bash
# 部署第一个版本
helm upgrade --install my-app ./my-app \
  --values values-prod.yaml \
  --namespace production

# 查看 Release 历史
helm list -n production
# NAME    NAMESPACE   REVISION    UPDATED                 STATUS      CHART
# my-app  production  1           2024-06-01 10:00:00     deployed    my-app-1.0.0
# my-app  production  2           2024-06-15 14:30:00     deployed    my-app-1.1.0
# my-app  production  3           2024-06-20 09:15:00     deployed    my-app-1.2.0

# 查看特定 Release 的详细历史
helm history my-app -n production
# REVISION  UPDATED          STATUS     CHART          APP VERSION  DESCRIPTION
# 1         Jun 01 10:00     deployed   my-app-1.0.0   2.3.0        Install complete
# 2         Jun 15 14:30     deployed   my-app-1.1.0   2.4.0        Upgrade complete
# 3         Jun 20 09:15     deployed   my-app-1.2.0   2.5.0        Upgrade complete
# 4         Jun 21 08:30     deployed   my-app-1.2.0   2.5.1        Upgrade complete

# 回滚到版本 3
helm rollback my-app 3 -n production

# 回滚并等待就绪
helm rollback my-app 3 -n production --wait --timeout 5m

# 回滚并保留历史（不删除失败版本）
helm rollback my-app 3 -n production --cleanup-on-fail
```

#### 依赖管理

```bash
# 更新 Chart 依赖
helm dependency update ./my-app

# 查看依赖树
helm dependency list ./my-app
# NAME        VERSION   REPOSITORY                        STATUS
# redis       ~17.0.0   https://charts.bitnami.com/bitnami  ok
# postgresql  ~12.0.0   https://charts.bitnami.com/bitnami  ok

# 构建依赖（下载 Chart 到 charts/ 目录）
helm dependency build ./my-app
```

### 6.3.4 使用场景

| 场景 | 实践 | 说明 |
|------|------|------|
| 多环境部署 | 多 values 文件 | 每个环境一份 values 文件，差异点集中管理 |
| CI/CD 集成 | --set 动态注入 | 构建号、镜像 Tag 等 CI 变量通过 --set 注入 |
| 组件依赖 | charts/ 子 Chart | Redis、MySQL 等中间件作为子 Chart 管理 |
| 生产回滚 | helm rollback | 发布异常时快速回滚到上一稳定版本 |
| 配置审计 | helm get values | 查看 Release 实际使用的 values，审计配置变更 |
| 团队协作 | Chart Repository | 通过 Harbor 或 OCI 仓库分发 Chart |

### 6.3.5 潜在风险与注意事项

- **版本号缺失**：`image.tag` 使用 `latest` 或未指定版本号，导致不同节点拉取到不同版本的镜像。必须显式指定语义化版本号。
- **不兼容升级**：Chart 大版本升级时 API 版本可能变更（如 `extensions/v1beta1` 升级到 `networking.k8s.io/v1`），导致部署失败。升级前使用 `helm template` 预览渲染结果。
- **Secret 泄露**：values 文件中包含明文密码。使用 `--set` 从 CI/CD 密钥系统注入，或使用 Helm Secrets 插件加密 values 中的敏感字段。
- **回滚副作用**：`helm rollback` 不会自动回滚依赖的子 Chart 版本。回滚后应验证所有组件的状态。
- **Release 历史堆积**：默认保留所有 Release 历史，大量历史记录会占用 etcd 空间。使用 `--history-max` 限制保留的版本数。

```bash
# 限制 Release 历史保留数量
helm upgrade --install my-app ./my-app \
  --namespace production \
  --history-max 5
```

### 6.3.6 本章小结

Helm 通过 Chart 标准化了 Kubernetes 应用的打包、配置和发布流程。多 values 文件分层覆盖策略实现了环境差异的集中管理，`--set` 注入适合 CI/CD 动态参数。版本管理和回滚机制为发布安全提供了保障。生产环境中应遵循以下最佳实践：显式指定镜像版本、使用 `helm template` 预览变更、限制 Release 历史数量、敏感信息通过外部密钥系统注入。

---

## 6.4 配置与密钥管理的综合风险

### 6.4.1 ConfigMap 更新延迟导致配置不一致

**问题**：ConfigMap 更新后，不同 Pod 的文件同步时间不一致，导致同一 Deployment 下的 Pod 使用不同版本的配置。

**根因**：kubelet 的同步周期（`--sync-frequency`，默认 60 秒）和 ConfigMap 的缓存机制导致更新传播存在窗口期。

**解决方案**：

```yaml
# 使用 Checksum 注解触发滚动更新
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
  annotations:
    # 当 ConfigMap 内容变化时，此注解的 checksum 会变化
    # 触发 Deployment 滚动更新，确保所有 Pod 使用新配置
    checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
spec:
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

### 6.4.2 Secret 泄露途径与防护

| 泄露途径 | 风险等级 | 防护措施 |
|----------|----------|----------|
| 提交到 Git 仓库 | 高 | `.gitignore` 过滤、pre-commit hook 扫描、使用 SealedSecret |
| 暴露在 Pod 日志 | 中 | 日志脱敏、禁止 Secret 环境变量打印 |
| kubectl exec 查看 | 中 | RBAC 限制 exec 权限、审计日志 |
| etcd 未加密 | 高 | 启用 EncryptionConfiguration |
| 节点磁盘残留 | 中 | 使用 tmpfs、节点用完销毁 |
| 镜像层缓存 | 高 | 多阶段构建、不将密钥写入 Dockerfile |

**etcd 加密配置示例**：

```yaml
# EncryptionConfiguration
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <base64-encoded-32-byte-key>
      - identity: {}
```

在 TKE 中，可以通过控制台启用 KMS 加密：

```bash
# 通过 TKE API 启用 KMS 加密
tke-enable-kms-encryption \
  --cluster-id cls-xxxxxxxx \
  --kms-key-id kms-xxxxxxxx \
  --region ap-guangzhou
```

### 6.4.3 Helm 版本混乱

**问题**：生产环境中多个 Release 版本共存，缺乏版本约束导致升级失败。

**常见场景**：

1. **Chart 版本与 App 版本混淆**：`version: 1.0.0` 是 Chart 的版本，`appVersion: 2.5.1` 是应用的版本。升级应用时只更新 `appVersion` 而忘记更新 `version`，导致无法区分 Chart 包版本。

2. **依赖版本不兼容**：子 Chart 升级后 API 变更，主 Chart 未同步更新。

3. **缺少版本约束**：`requirements.yaml` 或 `Chart.yaml` 中未指定依赖版本范围，`helm dependency update` 拉取到不兼容的最新版本。

**解决方案**：

```yaml
# Chart.yaml 中严格约束依赖版本
dependencies:
  - name: redis
    version: ">=17.0.0 <18.0.0"  # 只允许 17.x 版本
    repository: "https://charts.bitnami.com/bitnami"
```

```bash
# 升级前预览变更
helm diff upgrade my-app ./my-app \
  --values values-prod.yaml \
  -n production

# 使用 --dry-run 验证
helm upgrade --install my-app ./my-app \
  --values values-prod.yaml \
  -n production \
  --dry-run

# 锁定依赖版本
helm dependency update ./my-app
# 生成 Chart.lock 文件，锁定所有依赖的精确版本
```

### 6.4.4 本章小结

配置与密钥管理的风险主要集中在三个方面：ConfigMap 更新延迟导致配置不一致、Secret 泄露途径多样且后果严重、Helm 版本管理混乱导致升级失败。应对策略包括：使用 checksum 注解确保配置一致性、启用 etcd 加密和 KMS 保护密钥、严格管理 Helm 依赖版本并预览变更。安全是配置管理的底线，任何疏忽都可能导致生产事故或数据泄露。

---

## 本章总结

配置与密钥管理是 TKE 生产运维的核心环节。本章从三个维度展开：

1. **ConfigMap 配置管理**：支持环境变量注入和文件挂载两种消费方式。热更新仅对 volume 挂载生效，环境变量和 subPath 需要重建 Pod。生产环境推荐使用 Reloader Operator 实现配置变更的自动化滚动更新。

2. **Secret 密钥管理**：Kubernetes 内置 Opaque、dockerconfigjson 和 TLS 三种 Secret 类型。高安全场景应结合腾讯云 SSM 和 secret-store-csi-driver 实现密钥外部托管和自动轮换。核心原则：启用 etcd 加密、严格 RBAC、避免密钥落入 Git。

3. **Helm Chart 包管理**：通过 Chart 标准化应用的打包和发布。多 values 文件分层覆盖实现环境差异管理，`--set` 注入适合 CI/CD 动态参数。版本管理和回滚机制保障发布安全。

生产环境的最佳实践是：配置与镜像解耦、密钥外部托管、Helm 版本严格管理、变更前预览验证、变更后监控确认。只有将配置、密钥和发布三者统一管理，才能构建安全可靠的 TKE 生产集群。
