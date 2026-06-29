# 第31章 腾讯云密钥管理与加密体系

> **作者：** SRE 团队
>
> **版本：** v1.0
>
> **适用场景：** 腾讯云上的密钥管理、静态加密、传输加密与合规治理

---

## 31.1 概述

在云原生时代，数据安全是企业上云的首要关切。密钥管理与加密体系构成了云安全基础设施的基石，涵盖从密钥的生成、存储、轮换、审计到销毁的全生命周期管理，以及数据在存储态（at rest）和传输态（in transit）的加密保护。

腾讯云提供了一套完整的密钥与加密产品矩阵，包括：

- **凭据管理系统（SSM，Secrets Manager）**：集中管理数据库密码、API 密钥、SSH 密钥等敏感凭据，支持自动轮换与细粒度权限控制。
- **密钥管理系统（KMS，Key Management Service）**：基于硬件安全模块（HSM）的密钥生命周期管理服务，为云上各类资源提供加密根。
- **存储加密**：对象存储（COS）、云硬盘（CBS）、云数据库（TDSQL 等）的透明数据加密（TDE）。
- **传输加密**：负载均衡（CLB/ALB）、API 网关、CDN 等入口的 TLS/SSL 证书管理。

本章将从 SRE 的实操视角出发，逐一剖析这些服务的原理、配置方法与最佳实践，并给出基于 Terraform 的基础设施即代码（IaC）实现方案。

---

## 31.2 凭据管理系统（SSM）

### 31.2.1 什么是 SSM

凭据管理系统（Secrets Manager，SSM）是腾讯云提供的一项集中式凭据托管服务。它解决了传统运维中凭据分散存储、硬编码在配置文件或代码中的安全风险。SSM 的核心能力包括：

- **凭据托管**：支持数据库凭证、API 密钥、OAuth 令牌、SSH 密钥等多种类型。
- **自动轮换**：可配置周期性轮换策略，降低凭据泄露风险窗口。
- **细粒度权限**：通过 CAM 策略精确控制谁可以读取、管理哪些凭据。
- **版本管理**：每次轮换生成新版本，支持回滚。
- **审计日志**：所有凭据操作记录至 CloudAudit，满足合规要求。

### 31.2.2 凭据类型与适用场景

SSM 支持以下凭据类型：

| 凭据类型 | 说明 | 典型场景 |
|---------|------|---------|
| 数据库凭据 | 自动关联数据库实例，支持轮换 | RDS、TDSQL、Redis 密码管理 |
| SSH 密钥 | 托管 SSH 私钥 | 堡垒机、CVM 登录 |
| API 密钥 | SecretId/SecretKey 对 | 第三方服务鉴权 |
| OAuth 令牌 | 访问令牌与刷新令牌 | 企业微信、飞书集成 |
| 自定义凭据 | 任意键值对或文本 | 配置项、证书私钥 |

### 31.2.3 SSM 架构原理

SSM 的架构分为控制平面与数据平面：

```
┌─────────────────────────────────────────────────┐
│                  控制平面                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ CAM 鉴权  │  │ 轮换引擎  │  │ CloudAudit    │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
├─────────────────────────────────────────────────┤
│                  数据平面                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 加密存储  │  │ 版本管理  │  │ 高可用缓存    │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
└─────────────────────────────────────────────────┘
```

凭据在存储时使用 KMS 主密钥（CMK）进行加密，确保即使存储介质泄露也无法还原明文。读取凭据时，SSM 先通过 CAM 校验调用方权限，再解密返回明文。

### 31.2.4 SSM 最佳实践

**1. 最小权限原则**

为每个应用或服务创建独立的 CAM 策略，仅授予其所需凭据的读取权限：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": ["ssm:GetSecretValue"],
      "resource": ["qcs::ssm:ap-guangzhou:uin/10000:secret/prod-db-mysql-*"]
    }
  ]
}
```

**2. 凭据轮换策略**

- 数据库凭据：建议 30 天轮换一次
- API 密钥：建议 90 天轮换一次
- SSH 密钥：建议 180 天轮换一次
- 高敏感凭据：可缩短至 7 天

**3. 应用集成方式**

应用应通过 SSM SDK 运行时获取凭据，而非在部署时注入环境变量：

```python
# 正确的做法：运行时从 SSM 获取
from tencentcloud.ssm.v20190923 import ssm_client, models

client = ssm_client.SsmClient(cred, "ap-guangzhou")
req = models.GetSecretValueRequest()
req.SecretName = "prod-db-password"
resp = client.GetSecretValue(req)
db_password = resp.SecretString
```

**4. 缓存策略**

为避免每次请求都调用 SSM API（增加延迟与费用），应在应用层做本地缓存，并监听凭据变更事件：

```python
import time
import threading

class SecretCache:
    def __init__(self, secret_name, ttl=3600):
        self.secret_name = secret_name
        self.ttl = ttl
        self._value = None
        self._expire_at = 0
        self._lock = threading.Lock()

    def get(self):
        with self._lock:
            if time.time() > self._expire_at:
                self._value = self._fetch_from_ssm()
                self._expire_at = time.time() + self.ttl
            return self._value
```

---

## 31.3 密钥管理系统（KMS）

### 31.3.1 KMS 概述

密钥管理系统（Key Management Service，KMS）是腾讯云的核心加密基础设施。它基于三级密钥体系，使用经过 FIPS 140-2 Level 2（部分区域 Level 3）认证的硬件安全模块（HSM）保护根密钥。

KMS 的核心价值在于：

- **集中管控**：所有加密密钥统一管理，避免密钥散落各处。
- **硬件隔离**：密钥在 HSM 内部使用，明文永不离开硬件边界。
- **自动轮换**：主密钥可配置自动年度轮换。
- **与云服务深度集成**：COS、CBS、TDSQL、TKE 等数十个云产品原生集成 KMS。
- **合规认证**：通过等保三级、ISO 27001、SOC 2 等认证。

### 31.3.2 三级密钥体系

腾讯云 KMS 采用三层密钥结构：

```
┌──────────────────────────────────────────────┐
│  第1层：根密钥（Root Key）                    │
│  存储在 HSM 内部，永不导出                     │
│  用途：加密第2层密钥                          │
├──────────────────────────────────────────────┤
│  第2层：主密钥（CMK - Customer Master Key）   │
│  由根密钥加密后持久化存储                       │
│  用途：加密第3层密钥                          │
├──────────────────────────────────────────────┤
│  第3层：数据密钥（DEK - Data Encryption Key） │
│  由 CMK 加密后返回给应用                       │
│  用途：加密实际数据                            │
└──────────────────────────────────────────────┘
```

**加密流程（信封加密）：**

```
应用请求数据密钥
  → KMS 生成 DEK，用 CMK 加密得到 EncryptedDEK
  → 返回 { PlaintextDEK, EncryptedDEK } 给应用
  → 应用用 PlaintextDEK 加密数据
  → 存储 EncryptedDEK 与加密数据在一起
  → 丢弃 PlaintextDEK

解密流程：
  → 读取 EncryptedDEK 与加密数据
  → 将 EncryptedDEK 发送给 KMS 解密
  → KMS 用 CMK 解密返回 PlaintextDEK
  → 用 PlaintextDEK 解密数据
  → 丢弃 PlaintextDEK
```

信封加密的核心优势在于：数据密钥的加密和解密在 KMS 服务端完成，应用仅接触数据密钥的临时明文，CMK 本身始终受 HSM 保护。

### 31.3.3 CMK 类型

| 类型 | 说明 | 计费 | 适用场景 |
|------|------|------|---------|
| 腾讯云默认 CMK | 每个地域自动创建，不可见不可管理 | 免费 | 快速启用云产品加密 |
| 用户管理 CMK | 用户创建，可配置轮换、启用/禁用 | 按月计费 | 生产环境、合规场景 |
| 外部导入 CMK | 用户在自己的 HSM 生成密钥材料，导入 KMS | 按月计费 | 混合云、BYOK 场景 |

### 31.3.4 KMS 密钥操作

**创建 CMK：**

```python
from tencentcloud.kms.v20190118 import kms_client, models

client = kms_client.KmsClient(cred, "ap-guangzhou")
req = models.CreateKeyRequest()
req.KeyName = "my-app-encryption-key"
req.KeyUsage = "ENCRYPT_DECRYPT"  # 或 ASYMMETRIC_DECRYPT_RSA_2048
req.Description = "用于加密应用敏感配置"
resp = client.CreateKey(req)
key_id = resp.KeyId  # 形如: 23e52xx7-xx7e-xx11-xx5d-xx2e0d0bxx1e
```

**启用自动轮换：**

```python
req = models.EnableKeyRotationRequest()
req.KeyId = key_id
req.RotationInterval = 365  # 天，默认 365
client.EnableKeyRotation(req)
```

**加密与解密：**

```python
# 加密
enc_req = models.EncryptRequest()
enc_req.KeyId = key_id
enc_req.Plaintext = "敏感数据base64编码"
enc_resp = client.Encrypt(enc_req)
ciphertext = enc_resp.CiphertextBlob

# 解密
dec_req = models.DecryptRequest()
dec_req.CiphertextBlob = ciphertext
dec_resp = client.Decrypt(dec_req)
plaintext = dec_resp.Plaintext
```

### 31.3.5 密钥策略与权限隔离

KMS 的权限控制分为两层：

**1. CAM 策略**：控制谁可以调用 KMS API

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "resource": ["qcs::kms:ap-guangzhou:uin/10000:key/23e52xx7-*"]
    }
  ]
}
```

**2. 密钥策略**：控制特定密钥的访问权限，支持跨账号授权

```json
{
  "version": "2.0",
  "principal": {
    "qcs": ["qcs::cam::uin/20000:root"]
  },
  "statement": [
    {
      "effect": "allow",
      "action": ["kms:Decrypt"],
      "resource": ["*"]
    }
  ]
}
```

### 31.3.6 KMS 与 HSM 的选型对比

| 特性 | KMS | 专属密码机（Cloud HSM） |
|------|-----|------------------------|
| 管理方式 | 全托管 | 用户自行管理 |
| 合规标准 | FIPS 140-2 Level 2/3 | FIPS 140-2 Level 3 |
| 密钥导出 | 不支持 | 支持 |
| 性能 | 共享实例，有配额限制 | 独享实例，高性能 |
| 适用场景 | 大多数云上加密需求 | 金融、政务等强合规场景 |

对于绝大多数企业场景，KMS 已足够满足需求。仅在需要完全控制 HSM、自定义密码运算算法或满足特定金融监管要求时，才考虑专属密码机。

---

## 31.4 存储加密

### 31.4.1 对象存储 COS 加密

腾讯云对象存储（COS）支持多种加密方式，确保存储桶中的对象数据在写入磁盘时即被加密。

**COS 支持的加密方式：**

| 方式 | 密钥管理 | 适用场景 |
|------|---------|---------|
| COS 托管密钥（SSE-COS） | COS 自动管理 | 默认加密，零配置 |
| KMS 托管密钥（SSE-KMS） | 用户通过 KMS 管理 CMK | 合规审计、密钥自主管控 |
| 客户提供密钥（SSE-C） | 用户自行管理密钥 | 超高安全要求 |

**SSE-KMS 配置示例：**

```python
from tencentcloud.cos.cos_client import CosS3Client

client = CosS3Client(cred, region="ap-guangzhou")

# 上传时指定 KMS 加密
response = client.put_object(
    Bucket="example-bucket-1250000000",
    Body=b"敏感数据内容",
    Key="confidential/report.pdf",
    ServerSideEncryption="kms",
    SSEKMSKeyId="23e52xx7-xx7e-xx11-xx5d-xx2e0d0bxx1e"
)
```

**存储桶默认加密策略：**

```python
# 设置存储桶默认加密
client.put_bucket_encryption(
    Bucket="example-bucket-1250000000",
    EncryptionConfiguration={
        "Rule": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "kms",
                    "KMSMasterKeyID": "23e52xx7-xx7e-xx11-xx5d-xx2e0d0bxx1e"
                }
            }
        ]
    }
)
```

设置默认加密后，所有新写入的对象将自动加密，无需在每次上传时指定。

### 31.4.2 云硬盘 CBS 加密

云硬盘（CBS）加密使用 KMS 主密钥对磁盘数据进行透明加密。加密操作在宿主机内核层面完成，对云服务器（CVM）内的应用完全透明。

**CBS 加密的关键特性：**

- **透明加密**：CVM 读写数据时自动加解密，应用无感知。
- **性能影响极小**：基于 AES-NI 硬件加速，性能损耗低于 5%。
- **快照继承**：加密盘的快照和镜像自动继承加密属性。
- **不可逆**：一旦创建加密盘，无法转换为非加密盘。

**创建加密云硬盘：**

```python
from tencentcloud.cbs.v20170312 import cbs_client, models

client = cbs_client.CbsClient(cred, "ap-guangzhou")
req = models.CreateDisksRequest()
req.DiskType = "CLOUD_SSD"
req.DiskSize = 100  # GB
req.DiskName = "encrypted-data-disk"
req.Encrypt = True  # 启用加密
req.KmsKeyId = "23e52xx7-xx7e-xx11-xx5d-xx2e0d0bxx1e"
resp = client.CreateDisks(req)
```

**最佳实践：**

1. **系统盘也建议加密**：虽然系统盘加密需要创建自定义镜像时指定，但建议对包含敏感配置的系统盘也启用加密。
2. **使用专用 CMK**：为 CBS 加密创建独立的 CMK，便于审计和权限隔离。
3. **快照加密一致性**：确保加密盘的所有快照和镜像也使用相同的 CMK 或同级别的密钥。

### 31.4.3 云数据库 TDSQL 加密

TDSQL 是腾讯云自研的分布式数据库，支持透明数据加密（TDE）和列级加密。

**TDE 加密原理：**

```
应用 → TDSQL 代理层
  → 存储引擎层：数据写入磁盘前用 DEK 加密
  → DEK 由 KMS CMK 加密保护
  → 加密数据写入磁盘
```

**启用 TDE 加密：**

```sql
-- 通过 TDSQL 控制台或 API 启用 TDE
-- 启用后，数据文件、日志文件、临时文件均加密

-- 查看加密状态
SHOW VARIABLES LIKE '%tde%';

-- 查询加密表空间
SELECT * FROM information_schema.INNODB_TABLESPACES_ENCRYPTION;
```

**列级加密（应用层 + KMS）：**

对于需要更细粒度控制的场景，可以在应用层对特定列加密后再写入数据库：

```python
import base64
from cryptography.fernet import Fernet

# 从 KMS 获取数据密钥
kms_req = models.GenerateDataKeyRequest()
kms_req.KeyId = key_id
kms_req.KeySpec = "AES_256"
kms_resp = kms_client.GenerateDataKey(kms_req)

# 使用数据密钥加密敏感列
fernet = Fernet(base64.urlsafe_b64encode(kms_resp.Plaintext))
encrypted_id_card = fernet.encrypt(b"110101199001011234")

# 写入数据库（加密后的密文）
cursor.execute(
    "INSERT INTO user (name, id_card_encrypted) VALUES (%s, %s)",
    ("张三", encrypted_id_card)
)
```

### 31.4.4 其他存储服务加密

| 服务 | 加密方式 | 说明 |
|------|---------|------|
| 文件存储 CFS | 传输加密 + 静态加密 | NFS 协议加密需启用 Kerberos |
| 日志服务 CLS | SSE-KMS | 日志数据自动加密 |
| 消息队列 CMQ/CKafka | 静态加密 | 消息数据落盘加密 |
| 对象存储深度归档 | SSE-KMS | 归档数据加密存储 |

---

## 31.5 传输加密（TLS/SSL）

### 31.5.1 腾讯云 SSL 证书体系

传输层安全（TLS）是保护数据在网络上传输时不被窃听或篡改的核心技术。腾讯云提供完整的 SSL 证书管理服务，包括证书申请、部署、监控和自动续期。

**SSL 证书类型：**

| 类型 | 验证级别 | 颁发时间 | 适用场景 |
|------|---------|---------|---------|
| DV（域名验证） | 仅验证域名所有权 | 分钟级 | 个人站点、测试环境 |
| OV（组织验证） | 验证域名 + 企业身份 | 1-3 个工作日 | 企业官网、API 服务 |
| EV（扩展验证） | 最严格验证 | 3-7 个工作日 | 金融、电商等高信任度场景 |

### 31.5.2 负载均衡 HTTPS 配置

CLB（Cloud Load Balancer）是腾讯云流量入口的标准组件，支持 HTTPS 监听器挂载 SSL 证书。

**HTTPS 监听器配置流程：**

```
客户端 → HTTPS → CLB（解密） → HTTP → 后端 CVM
                    │
                    ▼
              证书管理（SSL Certificates Manager）
```

**Terraform 配置示例：**

```hcl
resource "tencentcloud_ssl_certificate" "api_cert" {
  name = "api-example-com"
  type = "CA"  # 上传已有证书

  cert = file("${path.module}/certs/api.example.com.pem")
  key  = file("${path.module}/certs/api.example.com.key")
}

resource "tencentcloud_clb_listener" "https_listener" {
  clb_id      = tencentcloud_clb_instance.main.id
  listener_name      = "https-443"
  port               = 443
  protocol           = "HTTPS"
  certificate_ssl_mode = "UNIDIRECTIONAL"
  certificate_id     = tencentcloud_ssl_certificate.api_cert.id
  certificate_ca_id  = ""

  health_check_switch = true
  health_check_http_code = 200
}
```

### 31.5.3 API 网关的 TLS 配置

API 网关（APIGateway）作为微服务 API 的统一入口，支持自定义域名和 HTTPS 绑定：

```hcl
resource "tencentcloud_api_gateway_custom_domain" "api_domain" {
  service_id         = tencentcloud_api_gateway_service.main.id
  sub_domain         = "api.example.com"
  protocol           = "https"
  certificate_id     = tencentcloud_ssl_certificate.api_cert.id
  is_default_mapping = false
  net_type           = "OUTER"
  is_forced_https    = true  # 强制 HTTPS 重定向
}
```

### 31.5.4 mTLS（双向 TLS）

对于服务间通信，特别是微服务架构，mTLS 提供了比单向 TLS 更强的安全保障——客户端也需要出示证书证明身份。

**TKE 服务网格的 mTLS 配置：**

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: prod
spec:
  mtls:
    mode: STRICT  # 强制 mTLS
```

**CLB 双向认证配置：**

```hcl
resource "tencentcloud_clb_listener" "mtls_listener" {
  clb_id      = tencentcloud_clb_instance.main.id
  listener_name      = "mtls-8443"
  port               = 8443
  protocol           = "HTTPS"
  certificate_ssl_mode = "MUTUAL"  # 双向认证
  certificate_id     = tencentcloud_ssl_certificate.server_cert.id
  certificate_ca_id  = tencentcloud_ssl_certificate.ca_cert.id
}
```

### 31.5.5 TLS 版本与密码套件最佳实践

| 配置项 | 推荐值 | 说明 |
|-------|--------|------|
| TLS 版本 | TLS 1.2 / 1.3 | 禁用 SSLv3、TLS 1.0、TLS 1.1 |
| 密码套件 | ECDHE-RSA-AES128-GCM-SHA256 等 | 优先使用 AEAD 套件 |
| 前向安全性 | 启用 ECDHE | 确保即使私钥泄露也无法解密历史流量 |
| HSTS | `max-age=31536000; includeSubDomains` | 强制浏览器使用 HTTPS |

**CLB 安全策略配置：**

```hcl
resource "tencentcloud_clb_security_policy" "modern" {
  policy_name = "modern-tls"
  ciphers = [
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
  ]
  tls_versions = ["TLSv1.2", "TLSv1.3"]
}
```

---

## 31.6 Terraform 实战：SSM + KMS 基础设施即代码

本节给出完整的 Terraform 配置，用于在生产环境中一键部署 SSM 凭据和 KMS 密钥。

### 31.6.1 项目结构

```
terraform/
├── main.tf              # 主配置文件
├── variables.tf         # 变量定义
├── outputs.tf           # 输出定义
├── kms.tf               # KMS 密钥资源
├── ssm.tf               # SSM 凭据资源
├── cam.tf               # CAM 策略与角色
└── terraform.tfvars     # 环境变量
```

### 31.6.2 KMS 密钥配置

```hcl
# kms.tf

# 创建应用主密钥
resource "tencentcloud_kms_key" "app_main_key" {
  key_name          = "${var.env_name}-app-main-key"
  description       = "应用主加密密钥 - ${var.env_name} 环境"
  key_usage         = "ENCRYPT_DECRYPT"
  key_spec          = "AES_256"
  is_enabled        = true
  pending_delete_in_days = 7  # 误删除保护

  tags = {
    Environment = var.env_name
    ManagedBy   = "Terraform"
    Purpose     = "Application Encryption"
  }
}

# 启用自动轮换
resource "tencentcloud_kms_key_rotation" "app_key_rotation" {
  key_id            = tencentcloud_kms_key.app_main_key.id
  enable_rotation   = true
  rotation_interval = 365  # 每年轮换一次
}

# 创建数据库专用 CMK
resource "tencentcloud_kms_key" "db_encrypt_key" {
  key_name          = "${var.env_name}-db-encrypt-key"
  description       = "数据库 TDE 加密密钥 - ${var.env_name} 环境"
  key_usage         = "ENCRYPT_DECRYPT"
  key_spec          = "AES_256"
  is_enabled        = true
  pending_delete_in_days = 30

  tags = {
    Environment = var.env_name
    ManagedBy   = "Terraform"
    Purpose     = "Database TDE"
  }
}

# 创建非对称密钥（用于数字签名）
resource "tencentcloud_kms_key" "signing_key" {
  key_name          = "${var.env_name}-signing-key"
  description       = "数字签名密钥 - ${var.env_name} 环境"
  key_usage         = "ASYMMETRIC_SIGN_VERIFY_RSA_2048"
  is_enabled        = true
  pending_delete_in_days = 7

  tags = {
    Environment = var.env_name
    ManagedBy   = "Terraform"
    Purpose     = "Digital Signature"
  }
}
```

### 31.6.3 SSM 凭据配置

```hcl
# ssm.tf

# 创建数据库凭据
resource "tencentcloud_ssm_secret" "db_credential" {
  secret_name  = "${var.env_name}-db-mysql-main"
  version_id   = "v1"
  secret_string = jsonencode({
    host     = var.db_host
    port     = var.db_port
    username = var.db_username
    password = var.db_password
    database = var.db_database
  })
  description  = "主数据库连接凭据 - ${var.env_name} 环境"
  kms_key_id   = tencentcloud_kms_key.app_main_key.id

  tags = {
    Environment = var.env_name
    ManagedBy   = "Terraform"
    SecretType  = "Database"
  }
}

# 创建 API 密钥凭据
resource "tencentcloud_ssm_secret" "api_credential" {
  secret_name  = "${var.env_name}-api-third-party"
  version_id   = "v1"
  secret_string = jsonencode({
    api_key    = var.third_party_api_key
    api_secret = var.third_party_api_secret
    endpoint   = var.third_party_endpoint
  })
  description  = "第三方 API 凭据 - ${var.env_name} 环境"
  kms_key_id   = tencentcloud_kms_key.app_main_key.id

  tags = {
    Environment = var.env_name
    ManagedBy   = "Terraform"
    SecretType  = "APIKey"
  }
}

# 创建 SSH 密钥凭据
resource "tencentcloud_ssm_secret" "ssh_credential" {
  secret_name  = "${var.env_name}-ssh-bastion"
  version_id   = "v1"
  secret_string = var.bastion_ssh_private_key
  description  = "堡垒机 SSH 私钥 - ${var.env_name} 环境"
  kms_key_id   = tencentcloud_kms_key.app_main_key.id

  tags = {
    Environment = var.env_name
    ManagedBy   = "Terraform"
    SecretType  = "SSHKey"
  }
}
```

### 31.6.4 CAM 权限配置

```hcl
# cam.tf

# 应用服务角色
resource "tencentcloud_cam_role" "app_service_role" {
  name        = "${var.env_name}-app-service-role"
  document    = jsonencode({
    version   = "2.0"
    statement = [
      {
        effect    = "allow"
        action    = ["sts:AssumeRole"]
        principal = {
          service = ["cvm.qcloud.com"]
        }
      }
    ]
  })
  description = "应用服务角色 - ${var.env_name} 环境"
}

# SSM 读取策略
resource "tencentcloud_cam_policy" "ssm_read_policy" {
  name        = "${var.env_name}-ssm-read-only"
  document    = jsonencode({
    version   = "2.0"
    statement = [
      {
        effect    = "allow"
        action    = [
          "ssm:GetSecretValue",
          "ssm:DescribeSecret"
        ]
        resource = [
          "qcs::ssm:${var.region}:uin/${var.account_id}:secret/${var.env_name}-*"
        ]
      }
    ]
  })
  description = "SSM 凭据只读策略 - ${var.env_name} 环境"
}

# KMS 加解密策略
resource "tencentcloud_cam_policy" "kms_crypto_policy" {
  name        = "${var.env_name}-kms-crypto-ops"
  document    = jsonencode({
    version   = "2.0"
    statement = [
      {
        effect    = "allow"
        action    = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        resource = [
          "qcs::kms:${var.region}:uin/${var.account_id}:key/${tencentcloud_kms_key.app_main_key.id}",
          "qcs::kms:${var.region}:uin/${var.account_id}:key/${tencentcloud_kms_key.db_encrypt_key.id}"
        ]
      }
    ]
  })
  description = "KMS 加解密操作策略 - ${var.env_name} 环境"
}

# 绑定策略到角色
resource "tencentcloud_cam_role_policy_attachment" "ssm_read_attach" {
  role_name   = tencentcloud_cam_role.app_service_role.name
  policy_id   = tencentcloud_cam_policy.ssm_read_policy.id
}

resource "tencentcloud_cam_role_policy_attachment" "kms_crypto_attach" {
  role_name   = tencentcloud_cam_role.app_service_role.name
  policy_id   = tencentcloud_cam_policy.kms_crypto_policy.id
}
```

### 31.6.5 变量与输出

```hcl
# variables.tf
variable "env_name" {
  description = "环境名称（prod/staging/dev）"
  type        = string
}

variable "region" {
  description = "腾讯云地域"
  type        = string
  default     = "ap-guangzhou"
}

variable "account_id" {
  description = "腾讯云账号 ID"
  type        = string
}

variable "db_host" {
  description = "数据库主机地址"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "数据库密码"
  type        = string
  sensitive   = true
}

variable "third_party_api_key" {
  description = "第三方 API Key"
  type        = string
  sensitive   = true
}

variable "bastion_ssh_private_key" {
  description = "堡垒机 SSH 私钥内容"
  type        = string
  sensitive   = true
}

# outputs.tf
output "kms_app_key_id" {
  description = "应用主密钥 ID"
  value       = tencentcloud_kms_key.app_main_key.id
}

output "kms_db_key_id" {
  description = "数据库加密密钥 ID"
  value       = tencentcloud_kms_key.db_encrypt_key.id
}

output "ssm_db_secret_name" {
  description = "数据库凭据名称"
  value       = tencentcloud_ssm_secret.db_credential.secret_name
}

output "app_service_role_name" {
  description = "应用服务角色名称"
  value       = tencentcloud_cam_role.app_service_role.name
}
```

### 31.6.6 部署命令

```bash
# 初始化 Terraform
terraform init

# 预览变更
terraform plan -var-file=terraform.tfvars

# 应用配置
terraform apply -var-file=terraform.tfvars -auto-approve

# 销毁资源（谨慎操作）
terraform destroy -var-file=terraform.tfvars
```

---

## 31.7 企业级加密治理框架

### 31.7.1 加密策略矩阵

| 数据分类 | 存储加密 | 传输加密 | 密钥管理 | 轮换周期 |
|---------|---------|---------|---------|---------|
| 公开数据 | 推荐 SSE-COS | 推荐 HTTPS | 默认 CMK | 不适用 |
| 内部数据 | 强制 SSE-KMS | 强制 HTTPS/TLS 1.2+ | 专用 CMK | 365 天 |
| 敏感数据 | 强制 SSE-KMS + TDE | 强制 mTLS | 独立 CMK + 访问审计 | 180 天 |
| 机密数据 | 强制 SSE-KMS + 列加密 | 强制 mTLS + 证书固定 | 外部导入 CMK + HSM | 90 天 |

### 31.7.2 密钥生命周期管理

```
创建 → 启用 → 使用 → 禁用 → 计划删除 → 删除
  │       │       │        │         │
  │       │       │        │         └── 7-30 天等待期
  │       │       │        └── 可重新启用
  │       │       └── 监控使用频率与异常
  │       └── 配置自动轮换
  └── 设置标签与描述
```

**关键控制点：**

1. **创建时**：设置合理的描述和标签，便于后续审计。
2. **使用中**：通过 CloudAudit 监控密钥使用情况，设置异常告警。
3. **轮换时**：确保应用使用密钥别名（Alias）而非直接引用 KeyId。
4. **删除时**：设置合理的等待期（建议 30 天），确认无依赖后再删除。

### 31.7.3 审计与监控

**CloudAudit 关键事件：**

```python
# 查询 KMS 密钥操作
from tencentcloud.cloudaudit.v20190319 import cloudaudit_client, models

client = cloudaudit_client.CloudauditClient(cred, "ap-guangzhou")
req = models.DescribeEventsRequest()
req.StartTime = "2025-01-01 00:00:00"
req.EndTime = "2025-06-28 23:59:59"
req.LookupAttribute = [
    {"AttributeKey": "ResourceType", "AttributeValue": "kms"},
    {"AttributeKey": "EventName", "AttributeValue": "Decrypt"}
]
resp = client.DescribeEvents(req)
```

**监控告警规则：**

| 告警指标 | 阈值 | 说明 |
|---------|------|------|
| KMS Decrypt 调用频率异常 | 超过基线 3 倍 | 可能的数据泄露尝试 |
| SSM GetSecretValue 调用频率异常 | 超过基线 5 倍 | 可能的凭据滥用 |
| CMK 禁用/删除操作 | 任何一次 | 高危操作即时告警 |
| SSL 证书即将过期 | 30 天 | 证书续期提醒 |

### 31.7.4 灾难恢复与密钥备份

**跨地域密钥备份策略：**

```
主地域（ap-guangzhou）          备地域（ap-singapore）
┌─────────────────┐          ┌─────────────────┐
│ CMK-A (主)       │   同步   │ CMK-A (副本)     │
│ SSM 凭据         │ ──────→ │ SSM 凭据（加密）  │
│ 加密数据 + DEK   │          │ 加密数据 + DEK   │
└─────────────────┘          └─────────────────┘
```

**备份方案：**

1. **KMS 密钥备份**：KMS 密钥本身无法导出，但可以通过跨地域同步功能在异地创建副本。
2. **SSM 凭据备份**：定期将凭据导出加密存储到 COS（跨地域复制），使用不同的 CMK 加密。
3. **证书备份**：SSL 证书私钥导出后加密存储到安全位置，建议使用离线介质保存。

---

## 31.8 常见问题与排障

### 31.8.1 KMS 限流与重试

KMS 有 API 调用频率限制（QPS），高并发场景下可能触发限流：

```python
import time
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException

def kms_call_with_retry(func, max_retries=3):
    for attempt in range(max_retries):
        try:
            return func()
        except TencentCloudSDKException as e:
            if "RequestLimitExceeded" in str(e):
                wait = 2 ** attempt  # 指数退避
                time.sleep(wait)
                continue
            raise
    raise Exception("KMS 调用超过最大重试次数")
```

### 31.8.2 密钥删除后的数据恢复

**场景：** CMK 被误删除后，所有使用该 CMK 加密的数据将无法解密。

**预防措施：**

1. 设置 `pending_delete_in_days` 为 30 天，利用等待期恢复。
2. 在删除前使用 KMS 的 `DescribeKey` 检查密钥状态。
3. 使用 Terraform 管理密钥时，启用 `prevent_destroy`：

```hcl
resource "tencentcloud_kms_key" "critical_key" {
  # ... 其他配置
  lifecycle {
    prevent_destroy = true
  }
}
```

### 81.8.3 SSM 凭据版本冲突

当多个客户端同时更新同一凭据时可能产生版本冲突。解决方案：

1. 使用 SSM 的版本管理功能，每次更新自动创建新版本。
2. 应用层使用版本号指定读取特定版本。
3. 避免手动编辑凭据，优先使用自动化轮换。

### 31.8.4 SSL 证书常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 证书不信任 | 使用了自签名证书或中间证书不完整 | 使用受信任 CA 签发的证书，补全证书链 |
| 证书过期 | 未及时续期 | 设置过期前 30 天告警，启用自动续期 |
| 域名不匹配 | 证书 CN/SAN 与实际域名不符 | 确保证书包含所有访问域名 |
| 协议不兼容 | 客户端使用过旧 TLS 版本 | 服务端兼容 TLS 1.2，引导客户端升级 |

---

## 31.9 总结与最佳实践清单

### 核心原则

1. **永远不要硬编码凭据**：所有敏感信息必须通过 SSM 或类似服务管理。
2. **默认加密**：所有存储服务默认启用加密，所有传输默认启用 TLS。
3. **最小权限**：密钥和凭据的访问权限遵循最小够用原则。
4. **自动轮换**：所有密钥和凭据配置自动轮换，缩短泄露影响窗口。
5. **全面审计**：所有加密操作记录审计日志，设置异常告警。

### 实施检查清单

- [ ] 所有 COS 存储桶已启用默认加密（SSE-KMS）
- [ ] 所有 CBS 云硬盘已启用加密
- [ ] 所有数据库已启用 TDE
- [ ] 所有公网服务已配置 HTTPS 证书
- [ ] 服务间通信已启用 mTLS
- [ ] 数据库密码等凭据已迁移至 SSM
- [ ] KMS 密钥已配置自动轮换
- [ ] CAM 策略遵循最小权限原则
- [ ] CloudAudit 已启用并配置告警
- [ ] Terraform 配置已纳入版本管理
- [ ] 密钥删除保护已启用（prevent_destroy）
- [ ] SSL 证书过期监控已配置

### 推荐阅读

- [腾讯云 SSM 产品文档](https://cloud.tencent.com/document/product/1522)
- [腾讯云 KMS 产品文档](https://cloud.tencent.com/document/product/573)
- [腾讯云 SSL 证书文档](https://cloud.tencent.com/document/product/400)
- [腾讯云 Terraform Provider](https://registry.terraform.io/providers/tencentcloudstack/tencentcloud/latest/docs)
- [NIST SP 800-57 密钥管理指南](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)

---

> **版权声明：** 本文档由腾讯云 SRE 团队编写，仅供内部技术参考。未经授权，禁止对外传播。
