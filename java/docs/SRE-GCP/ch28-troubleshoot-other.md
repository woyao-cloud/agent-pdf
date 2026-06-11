# 第 28 章 其他常见故障排查

## 28.1 Cloud Run 问题

### 冷启动延迟过高

**症状：** 请求首次访问时响应时间明显偏长（数秒）。

**原因：** 实例已缩减到零，冷启动需要时间。

**解决方案：**
```bash
# 设置最小实例数，保持预热
gcloud run deploy web-api \
    --min-instances=2 \
    --max-instances=50
```

### 并发限制

**症状：** 请求被拒绝，返回 429 或 503。

**解决方案：**
```bash
# 调整并发数
gcloud run deploy web-api \
    --concurrency=80 \
    --cpu=2
```

## 28.2 Cloud Storage 问题

### 权限拒绝

**症状：** 访问存储桶时返回 403 Forbidden。

**排查：**
```bash
# 检查 IAM 权限
gcloud storage buckets get-iam-policy gs://my-bucket

# 验证访问
gcloud storage ls gs://my-bucket
```

### 跨区域复制延迟

**症状：** 跨区域复制后的数据不一致。

**原因：** 最终一致性模型，复制有延迟。

**解决方案：**
- 需要强一致性时使用同步复制
- 应用层处理最终一致性

---

> **下一章预告：** 第 29 章开始进入安全与合规部分——首先介绍 IAM 最小权限实践。