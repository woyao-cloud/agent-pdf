# 第 32 章 安全监控与响应

## 32.1 Security Command Center（SCC）

### 功能介绍

Security Command Center 是 GCP 的安全和风险管理平台，提供集中的安全态势监控。

| 功能 | 说明 | 使用方式 |
|------|------|---------|
| 安全发现 | 自动扫描配置风险 | SCC Dashboard |
| 安全评分 | 整体安全态势评分 | SCC Dashboard |
| 威胁检测 | 检测可疑活动 | 自动告警 |

### 常见安全发现

```bash
# 查看 SCC 发现
gcloud scc findings list --project=my-project \
    --category="OPEN_FIREWALL" \
    --state="ACTIVE"

# 查看公开存储桶
gcloud scc findings list --project=my-project \
    --category="PUBLIC_BUCKET_ACL"
```

### 常见安全问题速查

| SCC 发现 | 风险等级 | 修复建议 |
|---------|---------|---------|
| 公开访问的存储桶 | 高 | 移除公开 IAM 绑定 |
| 未加密的 Cloud SQL | 中 | 启用加密 |
| 过于宽松的防火墙 | 高 | 限制来源 IP |
| 未使用的最小权限 | 中 | 检查并收缩权限 |

## 32.2 安全事件响应

### 响应流程

```
1. 确认安全告警的真实性
2. 评估影响范围
3. 隔离受影响资源
4. 收集证据（日志、快照）
5. 修复漏洞
6. 复盘和改进
```

---

> **下一章预告：** 附录将提供工具箱速查表和术语表。