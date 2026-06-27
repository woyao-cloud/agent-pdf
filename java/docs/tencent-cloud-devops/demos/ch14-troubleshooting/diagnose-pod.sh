#!/bin/bash
# Pod故障诊断脚本
set -e

NAMESPACE=${1:-default}
POD_NAME=$2

usage() {
    echo "用法: $0 <namespace> <pod-name>"
    echo "示例: $0 production user-service-7d8f9c6b7c-abcde"
    exit 1
}

if [ -z "$POD_NAME" ]; then
    usage
fi

echo "=========================================="
echo "  Pod故障诊断报告"
echo "  命名空间: $NAMESPACE"
echo "  Pod名称: $POD_NAME"
echo "=========================================="
echo ""

# 1. Pod状态
echo "--- 1. Pod状态 ---"
kubectl get pod $POD_NAME -n $NAMESPACE -o wide
echo ""

# 2. Pod事件
echo "--- 2. Pod事件 ---"
kubectl describe pod $POD_NAME -n $NAMESPACE | grep -A 20 "Events:"
echo ""

# 3. 容器日志
echo "--- 3. 容器日志（最近50行） ---"
kubectl logs $POD_NAME -n $NAMESPACE --tail=50 || echo "日志获取失败"
echo ""

# 4. 上一轮日志（CrashLoopBackOff时有用）
echo "--- 4. 上一轮容器日志 ---"
kubectl logs $POD_NAME -n $NAMESPACE --previous --tail=50 2>/dev/null || echo "无上一轮日志"
echo ""

# 5. 资源使用
echo "--- 5. 资源使用 ---"
kubectl top pod $POD_NAME -n $NAMESPACE 2>/dev/null || echo "metrics-server未安装或Pod已停止"
echo ""

# 6. 节点状态
echo "--- 6. 所在节点状态 ---"
NODE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.nodeName}' 2>/dev/null)
if [ -n "$NODE" ]; then
    kubectl describe node $NODE | grep -E "Conditions:|Pressure|Ready" | head -10
    echo ""
    kubectl top node $NODE 2>/dev/null || echo "metrics-server未安装"
fi
echo ""

# 7. 诊断建议
echo "--- 7. 诊断建议 ---"
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}' 2>/dev/null)
case "$POD_STATUS" in
    "Pending")
        echo "Pod处于Pending状态，可能原因："
        echo "  - 资源不足（CPU/内存请求超过节点可用资源）"
        echo "  - PVC未绑定"
        echo "  - 节点亲和性不满足"
        echo "  - 镜像拉取凭证缺失"
        ;;
    "Running")
        RESTARTS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.containerStatuses[0].restartCount}')
        if [ "$RESTARTS" -gt "0" ]; then
            echo "Pod正在运行但已重启 $RESTARTS 次，可能原因："
            echo "  - OOMKill（内存超限）"
            echo "  - 存活探针失败"
            echo "  - 应用崩溃"
        else
            echo "Pod正常运行"
        fi
        ;;
    "CrashLoopBackOff")
        echo "Pod持续崩溃重启，可能原因："
        echo "  - 应用启动失败（检查日志）"
        echo "  - 配置错误（ConfigMap/Secret）"
        echo "  - 依赖服务不可用（数据库/Redis）"
        echo "  - 资源限制过低"
        ;;
    "ImagePullBackOff"|"ErrImagePull")
        echo "镜像拉取失败，可能原因："
        echo "  - 镜像名称或标签错误"
        echo "  - TCR凭证未配置"
        echo "  - 镜像不存在"
        echo "  - 网络无法访问镜像仓库"
        ;;
    *)
        echo "Pod状态: $POD_STATUS"
        ;;
esac
echo ""
echo "=========================================="
