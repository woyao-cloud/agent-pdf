# 第4章 实验：Kubernetes 云原生监控体系

## 实验目的

1. 使用 Prometheus Operator 搭建 K8s 监控栈
2. 理解 Node Exporter / cAdvisor / kube-state-metrics 的分工
3. 通过 ServiceMonitor 实现声明式服务发现
4. 编写 K8s 监控 PromQL 查询

## 两套方案

### 方案 A：kind（推荐）

需要安装 kind 和 kubectl。

```bash
# 1. 创建集群
cd kind
bash setup-cluster.sh

# 2. 部署监控栈
bash deploy-all.sh

# 3. 端口转发
cd ../scripts
bash port-forward.sh

# 4. 访问
# Prometheus: http://localhost:9094/targets

# 5. 清理
cd ../kind
bash teardown.sh
```

### 方案 B：已有集群

```bash
kubectl apply -f manifests/
```

## 核心实验

### 实验 1：Node Exporter 主机监控

```promql
# CPU 使用率
rate(node_cpu_seconds_total[1m])

# 内存使用率
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100

# 磁盘使用率
node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100
```

### 实验 2：cAdvisor 容器监控

```promql
# 容器 CPU
rate(container_cpu_usage_seconds_total{namespace="default"}[5m])

# 容器内存
container_memory_usage_bytes{namespace="default"}
```

### 实验 3：kube-state-metrics 对象状态

```promql
kube_pod_status_phase{phase="Running"}           # 运行中的 Pod
kube_deployment_status_replicas_available          # 可用副本
kube_node_status_condition{condition="Ready",status="true"}  # 节点健康
```

### 实验 4：ServiceMonitor 声明式服务发现

1. 查看 Prometheus Targets: http://localhost:9094/targets
2. 部署 Sample App 后自动出现在 targets
3. 删除 ServiceMonitor 后目标自动消失

## 清理

```bash
# 如果使用 kind
cd kind && bash teardown.sh

# 如果使用已有集群
kubectl delete -f manifests/
```