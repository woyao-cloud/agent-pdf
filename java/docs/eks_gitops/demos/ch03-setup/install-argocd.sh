#!/bin/bash
# Argo CD 安装脚本
set -e

NAMESPACE="argocd"
VERSION="7.3.1"

echo "=== 创建命名空间 ==="
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

echo "=== 安装 Argo CD (Helm) ==="
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

helm upgrade --install argocd argo/argo-cd \
  --namespace $NAMESPACE \
  --version $VERSION \
  --values argocd-values.yaml \
  --wait \
  --timeout 10m

echo "=== 等待 Pod 就绪 ==="
kubectl wait --for=condition=Ready pods --all -n $NAMESPACE --timeout=300s

echo "=== 获取初始密码 ==="
kubectl get secret argocd-initial-admin-secret \
  -n $NAMESPACE \
  -o jsonpath="{.data.password}" | base64 -d

echo ""
echo "=== 安装完成 ==="
echo "Argo CD URL: https://argocd.example.com"
echo "用户名: admin"
