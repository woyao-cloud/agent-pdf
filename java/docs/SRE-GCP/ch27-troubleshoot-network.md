# 第 27 章 故障排查实战：网络与负载均衡问题

## 27.1 负载均衡返回 502/503

### 症状

用户访问服务时收到 HTTP 502 Bad Gateway 或 503 Service Unavailable 错误。

### 排查决策树

```
收到 502/503 错误
│
├─ 检查 GCP Status Dashboard
│  ├─ GCP 自身有问题？→ 等待官方修复
│  └─ GCP 正常 → 继续
│
├─ 检查后端健康状态
│  ├─ 健康检查通过？→ 继续
│  └─ 健康检查失败？→ 检查后端日志
│
├─ 检查健康检查配置
│  ├─ 超时太短？→ 调整超时
│  ├─ 路径错误？→ 修正路径
│  └─ 配置正常 → 继续
│
├─ 检查后端实例组
│  ├─ 实例数达上限？→ 调整上限
│  ├─ 资源不足？→ 检查 CPU/内存
│  └─ 正常 → 继续
│
└─ 检查防火墙规则
   └─ 健康检查 IP 被阻止？→ 放行
```

### 排查命令

```bash
# 1. 检查负载均衡器健康状态
gcloud compute backend-services get-health global-web-backend --global

# 2. 检查后端实例组
gcloud compute instance-groups managed list-instances web-mig --region us-central1

# 3. 检查防火墙规则
gcloud compute firewall-rules list --filter="network=prod-vpc"

# 4. 查看负载均衡器日志
gcloud logging read "resource.type=http_load_balancer AND httpRequest.status>=502" --limit 50
```

### 常见原因速查

| 错误码 | 常见原因 | 应对措施 |
|-------|---------|---------|
| 502 | 后端超时或崩溃 | 检查后端日志，增加超时时间 |
| 502 | 健康检查路径错误 | 修正健康检查路径 |
| 503 | 后端实例组达上限 | 调整最大实例数 |
| 503 | 后端资源不足 | 增加实例规格 |
| 502 | 防火墙阻止健康检查 | 放行健康检查源 IP |

---

## 27.2 区域级网络中断

### 排查路径

1. 确认不是局部问题——检查多个访问点
2. 检查 GCP Status Dashboard——确认是否有官方公告
3. 如果正常，检查自己的网络配置——防火墙、路由、VPN

### 应对措施

- GCP 自身问题 → 等待修复，检查多区域部署的流量切换
- 自己配置问题 → 回滚最近网络变更
- 没有多区域部署 → 评估在另一 Region 紧急部署

---

> **下一章预告：** 第 28 章将介绍其他常见服务的故障排查，包括 Cloud Run 和 Cloud Storage。