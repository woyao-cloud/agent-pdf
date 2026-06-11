#!/bin/bash
set -e
echo "=== Creating kind cluster ==="
kind create cluster --config kind/kind-config.yaml --name prom-demo
echo "=== Cluster ready ==="
kubectl cluster-info --context kind-prom-demo