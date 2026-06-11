# 第 31 章 数据加密与密钥管理

## 31.1 GCP 的加密层次

| 层次 | 说明 | 管理方式 |
|------|------|---------|
| 静态加密 | 数据写入磁盘时自动加密 | Google 管理（默认） |
| 传输加密 | 数据传输使用 TLS 加密 | 自动启用 |
| 应用层加密 | 应用层面加密特定字段 | CMEK 或自行管理 |

## 31.2 Secret Manager 的使用

```bash
# 创建密钥
gcloud secrets create db-password \
    --replication-policy="automatic"

# 添加密钥版本
echo -n "MyP@ssw0rd" | \
    gcloud secrets versions add db-password --data-file=-

# 在应用中读取密钥
gcloud secrets versions access latest --secret=db-password
```

### 应用集成

```python
from google.cloud import secretmanager

def get_secret(secret_name, project_id):
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
    response = client.access_secret_version(name=name)
    return response.payload.data.decode('UTF-8')

# 使用
db_password = get_secret("db-password", "my-project")
```

---

> **下一章预告：** 第 32 章将介绍安全监控与响应——Security Command Center 的使用。