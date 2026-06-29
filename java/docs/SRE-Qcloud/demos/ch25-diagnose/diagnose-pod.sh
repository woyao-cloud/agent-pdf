#!/bin/bash
# TKE Pod 故障诊断脚本
# 使用：bash diagnose-pod.sh <namespace> <pod-name>

NAMESPACE=${1:-default}
POD_NAME=$2

if [ -z "$POD_NAME" ]; then
    echo "用法: $0 <namespace> <pod-name>"
    echo "示例: $0 production my-app-7d8f9c6b7c-abcde"
    exit 1
fi

echo "=========================================="
echo "  TKE Pod 故障诊断"
echo "  命名空间: $NAMESPACE"
echo "  Pod: $POD_NAME"
echo "=========================================="

echo -e "\n--- 1. Pod 基本信息 ---"
kubectl get pod $POD_NAME -n $NAMESPACE -o wide

echo -e "\n--- 2. Pod 事件 ---"
kubectl describe pod $POD_NAME -n $NAMESPACE | grep -A 30 "Events:"

echo -e "\n--- 3. 容器日志（最近 50 行）---"
kubectl logs $POD_NAME -n $NAMESPACE --tail=50 2>/dev/null || echo "日志获取失败"

echo -e "\n--- 4. 上一轮日志（CrashLoopBackOff 时有用）---"
kubectl logs $POD_NAME -n $NAMESPACE --previous --tail=50 2>/dev/null || echo "无上一轮日志"

echo -e "\n--- 5. 资源使用 ---"
kubectl top pod $POD_NAME -n $NAMESPACE 2>/dev/null || echo "metrics-server 未安装"

echo -e "\n--- 6. 节点状态 ---"
NODE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.nodeName}' 2>/dev/null)
if [ -n "$NODE" ]; then
    kubectl describe node $NODE | grep -E "Conditions:|Pressure|Ready" | head -10
fi

echo -e "\n--- 7. 诊断建议 ---"
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}' 2>/dev/null)
case "$POD_STATUS" in
    "Pending")
        echo "Pod 处于 Pending 状态，可能原因："
        echo "  - 资源不足（CPU/内存请求超过节点可用资源）"
        echo "  - PVC 未绑定"
        echo "  - 节点亲和性不满足"
        echo "  - 镜像拉取凭证缺失"
        ;;
    "CrashLoopBackOff")
        echo "Pod 持续崩溃重启，可能原因："
        echo "  - 应用启动失败（检查日志）"
        echo "  - 配置错误（ConfigMap/Secret）"
        echo "  - 依赖服务不可用（数据库/Redis）"
        echo "  - 资源限制过低（OOMKill）"
        ;;
    "ImagePullBackOff"|"ErrImagePull")
        echo "镜像拉取失败，可能原因："
        echo "  - 镜像名称或标签错误"
        echo "  - TCR 凭证未配置"
        echo "  - 镜像不存在"
        echo "  - 网络无法访问镜像仓库"
        ;;
esac
echo -e "\n=========================================="
