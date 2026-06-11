#!/bin/bash
echo "=== Deleting kind cluster ==="
kind delete cluster --name prom-demo
echo "=== Cleanup complete ==="