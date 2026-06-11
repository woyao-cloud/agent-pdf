# 第 29 章 身份与访问管理（IAM）最佳实践

## 29.1 IAM 的核心模型

GCP 的 IAM 模型包含三个核心元素：**谁**（身份）在**什么条件**下对**什么资源**有**什么权限**。

### 角色类型

| 角色类型 | 说明 | 建议 |
|---------|------|------|
| **基础角色** | Owner/Editor/Viewer | ❌ 不应使用，过于宽泛 |
| **预定义角色** | GCP 为每个服务定义的细粒度角色 | ✅ 主要选择 |
| **自定义角色** | 精确组合所需权限 | ✅ 需要精细控制时使用 |

### 最小权限原则

```bash
# 好的做法：使用预定义角色
gcloud projects add-iam-policy-binding my-project \
    --member="group:sre-team@example.com" \
    --role="roles/compute.instanceAdmin.v1"

# 不好的做法：使用基础角色
# ❌ gcloud projects add-iam-policy-binding my-project \
#     --member="user:admin@example.com" \
#     --role="roles/editor"
```

### 服务账号最佳实践

- 为每个服务创建独立的服务账号
- 使用 Workload Identity 而非服务账号密钥
- 避免创建和使用服务账号密钥

```bash
# GKE Workload Identity 配置
gcloud container clusters update prod-cluster \
    --region=us-central1 \
    --workload-pool=my-project.svc.id.goog

# 创建 Kubernetes 服务账号绑定
kubectl annotate serviceaccount \
    --namespace=payment \
    payment-sa \
    iam.gke.io/gcp-service-account=payment-sa@my-project.iam.gserviceaccount.com
```

---

> **下一章预告：** 第 30 章将介绍 GCP 网络安全防护策略。