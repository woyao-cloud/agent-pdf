# 第 25 章 故障排查实战：GKE Pod 问题

## 25.1 CrashLoopBackOff

### 症状

`kubectl get pods` 显示 Pod 状态为 `CrashLoopBackOff`——Pod 启动后崩溃，Kubernetes 尝试重启，又再次崩溃，如此循环。

### 排查路径

```
收到 CrashLoopBackOff 告警
│
├─ 第一步：查看 Pod 日志
│  kubectl logs <pod-name> -n <namespace>
│  → 日志通常直接显示崩溃原因
│
├─ 第二步：查看上一轮日志（如果最新日志不够）
│  kubectl logs <pod-name> --previous -n <namespace>
│  → 上一轮可能包含崩溃前的完整信息
│
├─ 第三步：查看 Pod 事件
│  kubectl describe pod <pod-name> -n <namespace>
│  → 事件中可能包含调度、镜像拉取、健康检查失败等信息
│
└─ 第四步：在本地复现
   docker run <image>  → 在本地用同样的镜像运行，看能否复现
```

### 常见原因

| 原因 | 排查方法 | 修复方案 |
|------|---------|---------|
| 应用配置错误 | 查看日志中的配置错误信息 | 修正 ConfigMap 或环境变量 |
| 依赖服务不可用 | 检查数据库、Redis 等依赖 | 先启动依赖服务 |
| 资源限制过低 | 查看 Pod 的资源限制 | 增加 CPU/内存限制 |
| 健康检查过于严格 | 查看事件中的健康检查失败 | 调整健康检查参数 |
| 代码 bug | 在本地复现 | 修复代码 |

---

## 25.2 Pending 状态

### 症状

Pod 长时间处于 `Pending` 状态，无法进入 `Running` 状态。

### 排查路径

```bash
# 第一步：查看 Pod 事件
kubectl describe pod <pod-name> -n <namespace>

# 第二步：检查集群资源
kubectl describe nodes | grep -A 5 "Capacity"
kubectl top nodes

# 第三步：检查是否有资源配额限制
kubectl get resourcequota -n <namespace>
```

### 常见原因

| 原因 | 检查方法 | 解决方案 |
|------|---------|---------|
| 集群资源不足 | `kubectl describe nodes` 查看节点容量 | 等待 Cluster Autoscaler 扩容 |
| PVC 未绑定 | `kubectl describe pvc` | 检查存储类配置 |
| 节点选择器不匹配 | 查看 Pod 的 nodeSelector | 修正节点标签或选择器 |
| 镜像拉取失败 | 检查事件中的拉取错误 | 修正镜像地址或密钥 |

---

## 25.3 OOMKilled

### 症状

Pod 反复重启，查看状态显示 `OOMKilled`。

### 排查路径

```bash
# 查看 Pod 的内存使用情况
kubectl top pod <pod-name> -n <namespace>

# 查看内存限制
kubectl describe pod <pod-name> -n <namespace> | grep -A 2 "Limits"

# 临时缓解：增加内存限制
kubectl edit deployment <deployment-name> -n <namespace>
```

---

## 25.4 排查命令速查

| 场景 | 命令 |
|------|------|
| 查看 Pod 状态 | `kubectl get pods -A` |
| 查看 Pod 日志 | `kubectl logs <pod> -n <ns>` |
| 查看上一轮日志 | `kubectl logs <pod> --previous -n <ns>` |
| 查看 Pod 详情 | `kubectl describe pod <pod> -n <ns>` |
| 查看节点资源 | `kubectl top nodes` |
| 查看 Pod 资源 | `kubectl top pods -A` |
| 查看集群事件 | `kubectl get events -A --sort-by='.lastTimestamp'` |

---

> **下一章预告：** 第 26 章将介绍 Cloud SQL 的常见故障排查——连接数耗尽、CPU 突增和磁盘空间不足。