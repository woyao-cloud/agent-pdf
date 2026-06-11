#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANIFESTS="$SCRIPT_DIR/manifests"
echo "=== Deploying monitoring stack ==="
kubectl apply -f "$MANIFESTS/namespace.yaml"
kubectl apply -f "$MANIFESTS/prometheus/operator.yaml"
kubectl wait --for=condition=Available deployment/prometheus-operator -n monitoring --timeout=120s
kubectl apply -f "$MANIFESTS/prometheus/rbac.yaml"
kubectl apply -f "$MANIFESTS/exporters/node-exporter.yaml"
kubectl apply -f "$MANIFESTS/exporters/kube-state-metrics.yaml"
kubectl apply -f "$MANIFESTS/prometheus/prometheus.yaml"
kubectl apply -f "$MANIFESTS/prometheus/servicemonitor.yaml"
kubectl apply -f "$MANIFESTS/sample-app/deployment.yaml"
kubectl apply -f "$MANIFESTS/sample-app/service.yaml"
echo "=== Deployment complete ==="
echo "Run: bash scripts/port-forward.sh"