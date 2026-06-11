# 附录：GCP SRE 必备工具箱与速查表

## 一、gcloud 排查命令速查

### 计算资源

| 场景 | 命令 |
|------|------|
| 查看实例串口输出 | `gcloud compute instances get-serial-port-output <实例> --zone <区域>` |
| 列出所有实例 | `gcloud compute instances list` |
| 查看实例详情 | `gcloud compute instances describe <实例> --zone <区域>` |
| SSH 登录 | `gcloud compute ssh <实例> --zone <区域>` |
| 查看 MIG 状态 | `gcloud compute instance-groups managed list` |

### GKE

| 场景 | 命令 |
|------|------|
| 获取集群凭据 | `gcloud container clusters get-credentials <集群> --region <区域>` |
| 列出集群 | `gcloud container clusters list` |
| 查看集群详情 | `gcloud container clusters describe <集群> --region <区域>` |
| 查看节点池 | `gcloud container node-pools list --cluster <集群> --region <区域>` |

### 数据库

| 场景 | 命令 |
|------|------|
| 列出 Cloud SQL 实例 | `gcloud sql instances list` |
| 查看实例详情 | `gcloud sql instances describe <实例>` |
| 连接数据库 | `gcloud sql connect <实例> --user=<用户>` |
| 查看操作日志 | `gcloud sql operations list --instance <实例>` |

### 网络

| 场景 | 命令 |
|------|------|
| 列出 VPC 网络 | `gcloud compute networks list` |
| 列出防火墙规则 | `gcloud compute firewall-rules list` |
| 查看 LB 健康状态 | `gcloud compute backend-services get-health <后端服务> --region <区域>` |
| 查看转发规则 | `gcloud compute forwarding-rules list` |

### 日志

| 场景 | 命令 |
|------|------|
| 查询日志 | `gcloud logging read "<查询条件>" --limit=50` |
| 列出日志类型 | `gcloud logging logs list` |
| 查看指标 | `gcloud logging metrics list` |

## 二、kubectl 排查命令速查

| 场景 | 命令 |
|------|------|
| 查看所有 Pod | `kubectl get pods -A` |
| 查看 Pod 日志 | `kubectl logs <Pod> -n <ns>` |
| 查看上一轮日志 | `kubectl logs <Pod> --previous -n <ns>` |
| 查看 Pod 详情 | `kubectl describe pod <Pod> -n <ns>` |
| 查看节点资源 | `kubectl top nodes` |
| 查看 Pod 资源 | `kubectl top pods -A` |
| 查看集群事件 | `kubectl get events -A --sort-by='.lastTimestamp'` |
| 进入容器 | `kubectl exec -it <Pod> -- /bin/sh -n <ns>` |
| 查看节点状态 | `kubectl get nodes -o wide` |

## 三、排查决策树速查

### GKE Pod CrashLoopBackOff

```
查看日志 → 查看上一轮日志 → 查看事件 → 本地复现
```

### 502/503 错误

```
检查 GCP 状态 → 检查后端健康 → 检查健康检查配置 → 检查实例组 → 检查防火墙
```

## 四、On-call 检查清单

### 启动检查
```
[ ] 确认告警真实性
[ ] 查看影响范围
[ ] 检查 GCP Status Dashboard
[ ] 确认事件级别
[ ] 开始排查
[ ] 记录所有操作
```

### 结束检查
```
[ ] 服务完全恢复？
[ ] 长期修复已排期？
[ ] 时间线已记录？
[ ] 已通知相关方？
[ ] 已安排复盘？
```