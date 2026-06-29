#!/bin/bash
# Hub-Spoke 多集群配置脚本
set -e

HUB_CLUSTER="gitops-hub"
SPOKE_CLUSTERS=("eks-dev" "eks-staging" "eks-prod")

echo "=== 配置 Hub 集群 ==="
kubectl config use-context $HUB_CLUSTER

echo "=== 注册 Spoke 集群 ==="
for cluster in "${SPOKE_CLUSTERS[@]}"; do
  echo "注册集群: $cluster"
  argocd cluster add $cluster \
    --name $cluster \
    --label "environment=${cluster#eks-}" \
    --label "region=us-east-1"
done

echo "=== 验证集群注册 ==="
argocd cluster list

echo "=== 完成 ==="
echo "已注册 ${#SPOKE_CLUSTERS[@]} 个 Spoke 集群"
