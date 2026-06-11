# 第 30 章 网络安全防护

## 30.1 网络隔离策略

### VPC Service Controls

VPC Service Controls 是 GCP 防止数据外泄的关键服务。

```bash
# 创建服务边界
gcloud access-context-manager perimeters create prod-perimeter \
    --title="Production Service Perimeter" \
    --resources="projects/123456789" \
    --restricted-services="storage.googleapis.com,bigquery.googleapis.com" \
    --access-levels="accessPolicies/123/accessLevels/corp_access"
```

## 30.2 Cloud Armor：WAF 与 DDoS 防护

```bash
# 创建 Cloud Armor 安全策略
gcloud compute security-policies create waf-policy

# 添加 IP 黑白名单规则
gcloud compute security-policies rules create 1000 \
    --security-policy=waf-policy \
    --action=deny-403 \
    --src-ip-ranges="198.51.100.0/24"

# 启用速率限制
gcloud compute security-policies rules create 2000 \
    --security-policy=waf-policy \
    --action=rate-based-ban \
    --rate-limit-threshold-count=100 \
    --rate-limit-threshold-interval-sec=60 \
    --conform-action=allow \
    --exceed-action=deny-403
```

---

> **下一章预告：** 第 31 章将介绍密钥管理与加密。