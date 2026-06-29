# 第25章 TKE 故障排查

## 25.1 CrashLoopBackOff 排查

### 解决的问题

Pod 持续崩溃重启是最常见的 TKE 故障之一，需要快速定位根因。

### 核心原理

CrashLoopBackOff 表示 Pod 中的容器启动后立即退出，Kubernetes 不断重启但每次都失败。

### 代码/配置实现

**诊断脚本：**

```bash
#!/bin/bash
# TKE Pod 故障诊断脚本
NAMESPACE=${1:-default}
POD_NAME=$2

if [ -z "$POD_NAME" ]; then
    echo "用法: $0 <namespace> <pod-name>"
    exit 1
fi

echo "=== Pod 状态 ==="
kubectl get pod $POD_NAME -n $NAMESPACE -o wide

echo -e "\n=== Pod 事件 ==="
kubectl describe pod $POD_NAME -n $NAMESPACE | grep -A 20 "Events:"

echo -e "\n=== 当前日志 ==="
kubectl logs $POD_NAME -n $NAMESPACE --tail=50

echo -e "\n=== 上一轮日志 ==="
kubectl logs $POD_NAME -n $NAMESPACE --previous --tail=50 2>/dev/null || echo "无上一轮日志"

echo -e "\n=== 诊断建议 ==="
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
case "$POD_STATUS" in
    "CrashLoopBackOff")
        echo "Pod 持续崩溃，可能原因："
        echo "  - 应用启动失败（检查日志）"
        echo "  - 配置错误（ConfigMap/Secret）"
        echo "  - 依赖服务不可用（数据库/Redis）"
        echo "  - 资源限制过低（OOMKill）"
        echo "  - 存活探针配置错误"
        ;;
    "Pending")
        echo "Pod 处于 Pending 状态，可能原因："
        echo "  - 资源不足（CPU/内存）"
        echo "  - PVC 未绑定"
        echo "  - 节点亲和性不满足"
        echo "  - 镜像拉取凭证缺失"
        ;;
esac
```

### 使用场景

- On-call 响应
- 日常运维
- 发布回滚决策

### 潜在风险与注意事项

- 日志可能被滚动覆盖
- 需要查看 --previous 日志
- 部分问题需要查看节点日志

### 本章小结

- 使用 kubectl describe 查看事件
- 使用 kubectl logs --previous 查看崩溃前日志
- 常见原因：应用错误、配置错误、资源不足
