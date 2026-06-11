# 第4章 场景二：Kubernetes 云原生监控体系

## 4.1 Prometheus Operator 架构

### 为什么需要 Operator？

在 Kubernetes 中手动部署 Prometheus 面临几个问题：
1. Prometheus 配置（scrape targets）会随着 Pod 的创建和销毁频繁变化，手动维护不可能
2. 每个团队的 Prometheus 实例需要隔离
3. 告警规则、服务发现规则需要声明式管理

Prometheus Operator 通过 Kubernetes 的 Operator 模式解决了这些问题：它引入了一组 CRD（Custom Resource Definition），将 Prometheus 的运维知识编码到 Kubernetes 原生资源中。

### 核心 CRD

| CRD | 作用 |
|-----|------|
| `Prometheus` | 声明一个 Prometheus 实例（版本、资源、存储、ServiceMonitor 选择器等） |
| `ServiceMonitor` | 定义如何发现和 scrape 一组 Service |
| `PodMonitor` | 定义如何发现和 scrape 一组 Pod（适用于没有 Service 的场景） |
| `PrometheusRule` | 定义告警规则和记录规则 |
| `Alertmanager` | 声明一个 Alertmanager 实例 |

### Operator 的工作循环

1. Operator 持续监听 CRD 资源的变化
2. 当 ServiceMonitor 被创建/更新/删除时，Operator 自动重写 Prometheus 的 scrape 配置
3. Operator 通过 Prometheus Admin API 触发配置热重载（无需重启）
4. 整个过程对用户完全透明

## 4.2 核心组件协同

K8s 监控体系由三个核心组件分工协作，分别覆盖不同粒度的指标：

### Node Exporter（主机级）

以 DaemonSet 部署在每个节点上，采集主机的 CPU、内存、磁盘、网络指标。

**关键指标：**

| 指标 | 说明 |
|------|------|
| `node_cpu_seconds_total{mode="..."}` | CPU 各模式耗时（user/system/idle/iowait） |
| `node_memory_MemAvailable_bytes` | 可用内存 |
| `node_memory_MemTotal_bytes` | 总内存 |
| `node_filesystem_avail_bytes{mountpoint="/"}` | 磁盘可用空间 |
| `node_filesystem_size_bytes{mountpoint="/"}` | 磁盘总空间 |
| `node_network_receive_bytes_total` | 网络接收字节数 |
| `node_load1` / `node_load5` / `node_load15` | 系统负载 |

### cAdvisor（容器级）

内嵌在 Kubelet 中，无需额外部署。采集每个容器的资源使用情况。

**关键指标：**

| 指标 | 说明 |
|------|------|
| `container_cpu_usage_seconds_total` | 容器 CPU 累计使用时间 |
| `container_memory_usage_bytes` | 容器内存使用量 |
| `container_network_receive_bytes_total` | 容器网络接收字节数 |
| `container_fs_usage_bytes` | 容器文件系统使用量 |

### kube-state-metrics（K8s 对象级）

监听 Kubernetes API Server，将 K8s 对象的状态转化为指标。不采集"资源使用量"，而是采集"对象状态"。

**关键指标：**

| 指标 | 说明 |
|------|------|
| `kube_pod_status_phase{phase="Running"}` | 运行中的 Pod 数 |
| `kube_deployment_status_replicas_available` | Deployment 可用副本数 |
| `kube_node_status_condition{condition="Ready"}` | 节点 Ready 状态 |
| `kube_pod_info` | Pod 元信息（所在节点等） |

### 三者协同

这三个组件覆盖了不同层次的监控需求：
- Node Exporter：节点宕机 → 节点级别告警
- cAdvisor：容器 OOM → 应用级别排查
- kube-state-metrics：Pod 重启次数过多 → 发布回滚

```promql
# 组合使用的典型查询：
# 查看某个 Pod 所在节点的 CPU 使用率
node_cpu_seconds_total{instance="$(kube_pod_info{pod="myapp-xxx"})"}
```

## 4.3 潜在风险与优化

### API Server 压力

每个 Prometheus 实例定期调用 K8s API Server 进行服务发现。当 ServiceMonitor 数量多或 scrape_interval 很小时，API Server 可能负载过高。

**优化方案：**
1. 适当延长 scrape interval（默认 30s，可调至 60s）
2. 限制 kube-state-metrics 的监听范围（`--resources` 参数只监听需要的资源）
3. 使用 `--kubelet-node-name-prefix` 过滤节点范围

### Pod 生命周期短导致的高基数

Job 或短任务 Pod 可能在几分钟内完成并销毁。虽然 Pod 不在了，但它的指标仍会保留在 TSDB 中直到 retention 期满。

**优化方案：**
1. 不用 `pod` 标签做精细化区分（除非必要）
2. 调整 `honor_labels: false`（默认），让 Prometheus 自动补全的标签优先级高于目标自身标签

### 推荐的生产级 scrape 配置

```yaml
scrape_configs:
  - job_name: 'kubernetes-nodes'
    scrape_interval: 30s  # 节点指标变化慢，30s 足矣
    kubernetes_sd_configs:
      - role: node

  - job_name: 'kubernetes-pods'
    scrape_interval: 15s  # Pod 指标需要更精细的粒度
    kubernetes_sd_configs:
      - role: pod
```

## 4.4 PromQL 速查

```promql
# 节点 CPU 使用率（排除 idle）
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# 节点内存使用率
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# 节点磁盘使用率
(1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100

# 容器 CPU 使用率
rate(container_cpu_usage_seconds_total{namespace="default"}[5m])

# 容器内存使用量
container_memory_usage_bytes{namespace="default"}

# 可用副本数 vs 期望副本数
kube_deployment_status_replicas_available / kube_deployment_spec_replicas

# Pod 重启次数
sum by (pod) (rate(kube_pod_status_phase{phase="Running"}[5m]))
```

## 本章小结

- Prometheus Operator 通过 CRD 实现了声明式的监控管理
- Node Exporter / cAdvisor / kube-state-metrics 三者互相补充
- API Server 压力和 Pod 生命周期短是 K8s 监控的两个主要风险
- kind 工具可以在本地快速搭建实验环境
- 实践：[Kubernetes 监控实验](../labs/ch04-kubernetes/README.md)