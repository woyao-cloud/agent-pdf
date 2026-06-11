#!/bin/bash
echo "=== Port-forwarding Prometheus ==="
echo "Prometheus: http://localhost:9094"
echo ""
kubectl port-forward -n monitoring prometheus-prometheus-0 9094:9090 &
echo "Press Ctrl+C to stop forwarding"
wait