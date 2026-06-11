# 附录 B：生产级 Prometheus + Thanos + Grafana Helm Chart 部署模板

## 前置要求

```bash
# 添加 Helm 仓库
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
```

## kube-prometheus-stack（推荐）

一键部署 Prometheus Operator + Grafana + Alertmanager：

```bash
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --version 55.0.0 \
  -f values.yaml
```

### values.yaml

```yaml
# Prometheus
prometheus:
  prometheusSpec:
    retention: 15d
    retentionSize: 50GB
    resources:
      requests:
        memory: 4Gi
      limits:
        memory: 8Gi
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 100Gi

# Alertmanager
alertmanager:
  enabled: true
  config:
    global:
      resolve_timeout: 5m
    route:
      receiver: 'default'
      routes:
        - match:
            severity: critical
          receiver: 'pagerduty'
    receivers:
      - name: 'default'
        webhook_configs:
          - url: 'http://webhook:5000/alert'

# Grafana
grafana:
  adminPassword: admin
  persistence:
    enabled: true
    size: 10Gi
  datasources:
    datasources.yaml:
      apiVersion: 1
      datasources:
        - name: Prometheus
          type: prometheus
          url: http://prometheus-operated:9090
          access: proxy
          isDefault: true
```

## Thanos 集成

```yaml
# Thanos values.yaml 片段
prometheus:
  prometheusSpec:
    thanos:
      image: quay.io/thanos/thanos:v0.33.0
      objectStorageConfig:
        name: thanos-objstore-config
        key: objstore.yml
```

### objstore.yml

```yaml
type: S3
config:
  bucket: thanos
  endpoint: s3.amazonaws.com
  access_key: YOUR_ACCESS_KEY
  secret_key: YOUR_SECRET_KEY
```

## 验证部署

```bash
# 查看所有资源
kubectl get all -n monitoring

# 查看 Prometheus Targets
kubectl port-forward -n monitoring prometheus-prometheus-0 9090:9090

# 查看 Grafana
kubectl port-forward -n monitoring service/prometheus-grafana 3000:80
```