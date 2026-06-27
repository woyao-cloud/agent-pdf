# 第5章 工作负载与资源管理

在 Kubernetes（以及腾讯云 TKE）中，工作负载（Workload）是运行容器的核心抽象，而资源管理则决定了这些容器能否稳定、高效地运行。本章从 Deployment 与 StatefulSet 的选型与配置入手，深入讲解资源请求与限制的语义、Pod 调度与亲和性策略，最后剖析生产环境中常见的资源风险及其根因。

---

## 5.1 Deployment 与 StatefulSet

### 5.1.1 解决的问题

容器化应用可以分为两大类：**无状态（Stateless）** 和 **有状态（Stateful）**。Deployment 和 StatefulSet 分别对应这两类场景。

- **Deployment**：适用于所有实例可互换、不依赖本地存储、任意顺序启停的应用。典型场景包括 Web 后端、微服务 API、任务处理器。
- **StatefulSet**：适用于每个实例有唯一网络标识（Pod 名称固定）、需要持久化存储、启停有严格顺序的应用。典型场景包括数据库主从（MySQL、PostgreSQL）、消息队列（Kafka、RabbitMQ）、分布式协调服务（ZooKeeper、etcd）。

选错 Workload 类型是生产事故的常见根源——例如用 Deployment 运行 MySQL，会导致所有 Pod 共享同一份 PV 数据，扩缩容时出现数据竞争。

### 5.1.2 核心原理

**Deployment** 通过 ReplicaSet 管理 Pod 副本数，支持声明式更新和回滚。其核心字段包括：

- `replicas`：期望副本数
- `selector.matchLabels`：标签选择器（创建后不可变）
- `template`：Pod 模板
- `strategy`：更新策略

**StatefulSet** 为每个 Pod 分配稳定的网络标识（`<statefulset-name>-<ordinal>`）和独立的持久卷声明。其核心字段包括：

- `serviceName`：Headless Service 名称，用于稳定网络标识
- `volumeClaimTemplates`：为每个 Pod 自动创建独立的 PVC
- `podManagementPolicy`：`OrderedReady`（顺序启停）或 `Parallel`（并行启停）

### 5.1.3 代码/配置实现

#### Deployment 完整示例

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
    env: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: order-service
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: order
          image: ccr.ccs.tencentyun.com/production/order-service:v2.3.1
          ports:
            - containerPort: 8080
              protocol: TCP
          env:
            - name: DB_CONN_STR
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: conn-str
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 15
            timeoutSeconds: 3
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 2
            successThreshold: 1
            failureThreshold: 2
          startupProbe:
            httpGet:
              path: /startup
              port: 8080
            initialDelaySeconds: 3
            periodSeconds: 5
            failureThreshold: 30
          lifecycle:
            preStop:
              exec:
                command:
                  - /bin/sh
                  - -c
                  - |
                    sleep 5
                    curl -X POST http://localhost:8080/shutdown
                    sleep 3
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - order-service
                topologyKey: kubernetes.io/hostname
```

#### StatefulSet 完整示例

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql-cluster
  namespace: database
spec:
  serviceName: mysql-headless
  replicas: 3
  podManagementPolicy: OrderedReady
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: mysql
          image: mysql:8.0.32
          ports:
            - containerPort: 3306
              name: mysql
          env:
            - name: MYSQL_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mysql-secret
                  key: root-password
          resources:
            requests:
              cpu: 1000m
              memory: 2Gi
            limits:
              cpu: 2000m
              memory: 4Gi
          livenessProbe:
            exec:
              command:
                - mysqladmin
                - ping
                - -u root
                - -p$(MYSQL_ROOT_PASSWORD)
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            exec:
              command:
                - mysql
                - -u root
                - -p$(MYSQL_ROOT_PASSWORD)
                - -e
                - SELECT 1
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
          volumeMounts:
            - name: data
              mountPath: /var/lib/mysql
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ "ReadWriteOnce" ]
        storageClassName: cbs-csi
        resources:
          requests:
            storage: 100Gi
```

### 5.1.4 更新策略详解

#### RollingUpdate（滚动更新）

滚动更新是 Deployment 的默认策略，通过逐步替换 Pod 实现零停机发布。

关键参数：

- **maxSurge**：更新期间允许超出期望副本数的最大 Pod 数。可以是绝对数值或百分比。`maxSurge: 1` 表示最多比期望多 1 个 Pod。
- **maxUnavailable**：更新期间允许不可用的最大 Pod 数。`maxUnavailable: 0` 保证更新期间始终有全部副本可用（但需要集群有额外资源容纳 surge Pod）。

生产建议：对于关键服务，设置 `maxSurge: 1, maxUnavailable: 0`，确保每次只替换一个 Pod，且不中断服务容量。

#### Recreate（重建）

先删除所有旧 Pod，再创建新 Pod。适用于不允许新老版本共存的应用（如某些数据库 schema 迁移）。**注意：此策略会导致短暂停机。**

### 5.1.5 优雅终止（Graceful Termination）

Pod 终止时，Kubernetes 按以下流程执行：

1. Pod 进入 `Terminating` 状态，从 Service Endpoint 中移除
2. 执行 `preStop` hook（如果定义）
3. 向容器主进程发送 `SIGTERM` 信号
4. 等待 `terminationGracePeriodSeconds`（默认 30s）
5. 超时后发送 `SIGKILL` 强制终止

```yaml
spec:
  terminationGracePeriodSeconds: 60
  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command:
              - /bin/sh
              - -c
              - |
                # 从注册中心注销
                curl -X POST http://localhost:8080/deregister
                # 等待正在处理的请求完成
                sleep 10
```

**常见问题**：

- 应用未正确处理 `SIGTERM`，导致请求被强行中断
- `terminationGracePeriodSeconds` 设置过短，preStop 未执行完就被 SIGKILL
- preStop 脚本阻塞（如 curl 无超时），导致 Pod 长时间卡在 Terminating

### 5.1.6 健康检查机制

Kubernetes 提供三种探针（Probe），分别服务于不同的生命周期阶段：

| 探针类型 | 作用 | 失败后果 |
|---------|------|---------|
| `startupProbe` | 检测容器是否已启动完成 | 不进入就绪/存活检查逻辑 |
| `livenessProbe` | 检测容器是否存活 | 重启容器 |
| `readinessProbe` | 检测容器是否可接收流量 | 从 Service Endpoint 移除 |

**配置建议**：

- `startupProbe`：适用于启动慢的应用（如 Java Spring Boot），设置 `failureThreshold: 30`、`periodSeconds: 5`，给足 150 秒启动时间
- `livenessProbe`：`periodSeconds` 不宜过短（建议 15-30s），避免因瞬时抖动导致频繁重启
- `readinessProbe`：`periodSeconds` 可短一些（5-10s），快速反映服务可用状态

### 5.1.7 潜在风险与注意事项

- **Deployment 误用于有状态应用**：导致 Pod 名称随机、PVC 绑定混乱、数据丢失
- **StatefulSet 缩容风险**：默认按 ordinal 从大到小删除，但不会自动清理 PVC，需手动处理
- **滚动更新过慢**：`maxSurge: 1, maxUnavailable: 0` 在大规模集群中更新耗时较长，可适当调大 maxSurge
- **探针配置不当**：`livenessProbe` 依赖外部服务（如数据库）会导致级联故障——数据库抖动时所有 Pod 被重启
- **preStop 阻塞**：preStop 脚本无超时机制，导致 Pod 无法正常终止

### 5.1.8 本章小结

Deployment 和 StatefulSet 是 TKE 中最核心的两种工作负载类型。选型的关键判断标准是应用是否有状态：无状态用 Deployment，有状态用 StatefulSet。更新策略、优雅终止和健康检查是保证发布安全和运行稳定的三大支柱，每个生产环境都应该为这三者配置合理的参数。

---

## 5.2 资源请求与限制

### 5.2.1 解决的问题

Kubernetes 调度器需要知道每个 Pod 需要多少 CPU 和内存才能做出合理的调度决策。同时，当节点资源不足时，kubelet 需要决定哪些 Pod 应该被驱逐。`resources.requests` 和 `resources.limits` 就是解决这两个问题的核心机制。

- **requests**：调度依据。调度器保证节点上所有 Pod 的 requests 总和不超过节点容量。
- **limits**：运行时约束。cgroups 会限制容器不能使用超过 limits 的资源。

### 5.2.2 核心原理

#### CPU 的 requests 与 limits

- CPU requests 是 **CPU 权重**（CFS quota 分配依据）。当节点 CPU 空闲时，容器可以超出 requests 使用 CPU。
- CPU limits 是 **硬上限**。容器在每 100ms 的周期内最多使用 `limits` 核 × 100ms 的 CPU 时间。超出则被 throttled（节流）。

#### 内存的 requests 与 limits

- 内存 requests 用于调度决策，也用于 OOM 评分计算。
- 内存 limits 是 **硬限制**。容器超出 limits 时会被 OOMKill。

### 5.2.3 QoS 类（服务质量）

Kubernetes 根据 Pod 的 requests 和 limits 配置，将 Pod 分为三个 QoS 类：

| QoS 类 | 条件 | OOM 优先级 | 驱逐优先级 |
|--------|------|-----------|-----------|
| **Guaranteed** | `limits == requests`（所有容器） | 最低 | 最低 |
| **Burstable** | 至少一个容器有 requests/limits 且不满足 Guaranteed | 中等 | 中等 |
| **BestEffort** | 没有任何资源设置 | 最高 | 最高 |

```yaml
# Guaranteed：limits == requests
resources:
  requests:
    cpu: 1000m
    memory: 1Gi
  limits:
    cpu: 1000m
    memory: 1Gi
---
# Burstable：requests < limits
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi
---
# BestEffort：不设置 resources 字段
# 不推荐生产使用
```

**生产建议**：核心服务使用 Guaranteed QoS，确保在资源竞争时不被驱逐。非关键批处理任务可使用 Burstable。

### 5.2.4 设置原则

1. **基于实际用量，留有余量**：通过 Prometheus/Grafana 监控实际资源使用，requests 设为 P99 用量的 1.2-1.5 倍，limits 设为 requests 的 1.5-2 倍。
2. **避免过度承诺**：limits 不应超过节点容量的 50%（单容器），否则调度器可能将多个大 limit 容器调度到同一节点。
3. **区分 CPU 和内存**：CPU 可超卖（空闲 CPU 可被其他 Pod 使用），内存不可超卖（OOMKill 不可逆）。
4. **使用 VPA 辅助**：在测试环境使用 Vertical Pod Autoscaler 推荐值，再人工审核后应用到生产。

### 5.2.5 使用场景

- **高优先级业务**：Guaranteed QoS + 合理 limits，确保稳定性
- **离线任务/批处理**：Burstable 或 BestEffort，利用空闲资源
- **新上线服务**：先设置较宽松的 limits，观察实际用量后再收紧

### 5.2.6 潜在风险与注意事项

- **CPU throttling 陷阱**：即使容器实际 CPU 使用低于 limits，由于 CFS 配额按 100ms 周期计算，短时间突发可能导致 throttling。解决方案：设置合理的 limits 或使用 `cpu.cfs_period_us` 调大周期。
- **OOMKill 不可预测**：当节点内存不足时，OOM killer 根据 oom_score 选择杀死的进程。Burstable 和 BestEffort Pod 优先被杀死。
- **limits 设置过高**：导致节点资源过度承诺，实际运行中多个 Pod 同时达到 limits 时触发 OOM。
- **requests 设置过低**：调度器可能将过多 Pod 调度到同一节点，实际负载超过节点容量。

### 5.2.7 本章小结

资源请求与限制是 Kubernetes 资源管理的基石。requests 决定调度位置，limits 决定运行时上限。QoS 类决定了 Pod 在资源竞争时的生死优先级。核心原则是：核心服务用 Guaranteed，基于实际监控数据设置 requests，留合理余量设置 limits，避免过度承诺。

---

## 5.3 Pod 调度与亲和性

### 5.3.1 解决的问题

默认情况下，Kubernetes 调度器仅根据资源 requests 将 Pod 分配到最合适的节点。但在生产环境中，我们通常需要更精细的控制：

- 将 Pod 调度到特定机型（如 GPU 节点、高 IOPS 节点）
- 将相关服务部署在同一节点或可用区（减少网络延迟）
- 将同一服务的多个副本分散到不同节点（高可用）
- 将某些节点预留給特定租户或工作负载（节点隔离）

### 5.3.2 核心原理

Kubernetes 调度器（kube-scheduler）的调度流程分为两个阶段：

1. **Predicates（过滤）**：筛选出满足 Pod 调度条件的节点
2. **Priorities（打分）**：对满足条件的节点打分，选择最优节点

亲和性规则在 Predicates 阶段生效（required）或在 Priorities 阶段加分（preferred）。

### 5.3.3 代码/配置实现

#### nodeSelector（最简单的节点选择）

```yaml
spec:
  nodeSelector:
    disk-type: ssd
    instance-family: S5
```

`nodeSelector` 是 `nodeAffinity` 的简化版，只支持等值匹配。生产环境推荐使用 `nodeAffinity` 以获得更丰富的表达能力。

#### nodeAffinity（节点亲和性）

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: node.kubernetes.io/instance-type
                operator: In
                values:
                  - S5.LARGE8
                  - S5.2XLARGE16
              - key: topology.kubernetes.io/zone
                operator: In
                values:
                  - ap-guangzhou-7
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 80
          preference:
            matchExpressions:
              - key: disk-type
                operator: In
                values:
                  - ssd
        - weight: 20
          preference:
            matchExpressions:
              - key: node.kubernetes.io/instance-type
                operator: In
                values:
                  - S5.LARGE8
```

**支持的 operator**：

| Operator | 行为 |
|----------|------|
| `In` | 标签值在给定集合中 |
| `NotIn` | 标签值不在给定集合中 |
| `Exists` | 标签存在（忽略值） |
| `DoesNotExist` | 标签不存在 |
| `Gt` | 标签值大于（数值比较） |
| `Lt` | 标签值小于（数值比较） |

#### podAffinity / podAntiAffinity（Pod 亲和性与反亲和性）

```yaml
spec:
  affinity:
    # 将缓存 Pod 调度到与 API Pod 相同的节点
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values:
                  - api-gateway
          topologyKey: kubernetes.io/hostname
    # 同一服务的多个副本分散到不同节点
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchExpressions:
                - key: app
                  operator: In
                  values:
                    - order-service
            topologyKey: kubernetes.io/hostname
```

**topologyKey 说明**：

- `kubernetes.io/hostname`：按节点分散
- `topology.kubernetes.io/zone`：按可用区分散
- `topology.kubernetes.io/region`：按地域分散

**required vs preferred 选择**：

- `requiredDuringSchedulingIgnoredDuringExecution`：硬约束，调度时必须满足。如果无法满足，Pod 会 Pending。
- `preferredDuringSchedulingIgnoredDuringExecution`：软约束，调度器尽量满足但不保证。通过 `weight`（1-100）控制优先级。

#### taints 与 tolerations（污点与容忍）

```yaml
# 给节点打污点
# kubectl taint nodes node-01 dedicated=gpu:NoSchedule
---
# Pod 通过 toleration 容忍污点
spec:
  tolerations:
    - key: dedicated
      operator: Equal
      value: gpu
      effect: NoSchedule
  # 同时建议设置 nodeAffinity 确保调度到正确节点
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: dedicated
                operator: In
                values:
                  - gpu
```

**污点效果（effect）**：

| Effect | 行为 |
|--------|------|
| `NoSchedule` | 不调度新 Pod 到该节点（已有 Pod 不受影响） |
| `PreferNoSchedule` | 尽量不调度（软约束） |
| `NoExecute` | 不调度新 Pod，且驱逐已有不匹配的 Pod |

**TKE 内置污点**：

- `node.kubernetes.io/unschedulable:NoSchedule`
- `node.kubernetes.io/network-unavailable:NoSchedule`
- `node.kubernetes.io/not-ready:NoExecute`
- `node.kubernetes.io/unreachable:NoExecute`
- `node.kubernetes.io/disk-pressure:NoSchedule`
- `node.kubernetes.io/memory-pressure:NoSchedule`
- `node.kubernetes.io/pid-pressure:NoSchedule`

### 5.3.4 使用场景

| 场景 | 方案 |
|------|------|
| GPU 任务调度到 GPU 节点 | taint + toleration + nodeAffinity |
| 数据库独占节点，避免被其他 Pod 干扰 | taint + toleration |
| 服务多副本跨节点/跨可用区部署 | podAntiAffinity + topologyKey |
| 缓存与 API 同节点部署减少延迟 | podAffinity |
| 大规格 Pod 调度到大机型 | nodeAffinity + instance-type |
| 测试/生产工作负载隔离 | 不同节点池 + taint |

### 5.3.5 潜在风险与注意事项

- **podAntiAffinity 导致调度死锁**：当 replicas > 可用节点数时，required 级别的 podAntiAffinity 会导致部分 Pod 永远 Pending。解决方案：使用 `preferred` 而非 `required`，或确保节点数 ≥ 副本数。
- **topologyKey 选择不当**：使用 `kubernetes.io/hostname` 做 podAntiAffinity 时，如果节点数少于副本数，部分 Pod 无法调度。
- **taint 误操作**：给节点打 `NoExecute` 污点会驱逐所有不匹配的已有 Pod，可能导致大面积服务中断。
- **调度器性能**：大量 podAffinity/podAntiAffinity 规则会增加调度器计算开销，大规模集群（1000+ 节点）需关注调度延迟。
- **required 与 preferred 混淆**：required 是硬约束，一旦条件不满足 Pod 就 Pending，且不会自动恢复。preferred 是软约束，调度器尽量满足。

### 5.3.6 本章小结

Pod 调度与亲和性策略是精细化运维的核心工具。nodeAffinity 控制 Pod 与节点的关系，podAffinity/podAntiAffinity 控制 Pod 之间的关系，taint/toleration 实现节点隔离。生产环境中，建议优先使用 preferred 级别的软约束，避免 required 硬约束导致调度死锁。taint 操作需谨慎，尤其是 NoExecute 效果。

---

## 5.4 潜在风险与最佳实践

### 5.4.1 资源碎片化

**问题描述**：集群中每个节点剩余资源都不足以运行一个大 Pod，但所有节点的剩余资源总和却很大。这导致资源利用率低、Pod Pending。

**根因分析**：

- 节点规格不统一：多种机型混部，大 Pod 无法调度到小节点
- Pod 规格差异大：大量小 Pod 占满节点后，大 Pod 无处可去
- requests 设置过高：实际用量远低于 requests，但调度器按 requests 决策

**解决方案**：

1. **统一节点规格**：每个节点池使用相同机型，避免碎片化
2. **集群自动缩放（CA）**：配置 Cluster Autoscaler，当 Pod Pending 时自动扩容
3. **合理设置 requests**：基于实际监控数据，避免 requests 虚高
4. **使用 descheduler**：定期重平衡 Pod 分布，如 `RemovePodsViolatingNodeAffinity`、`LowNodeUtilization` 策略

```yaml
# descheduler 策略示例：将低利用率节点上的 Pod 重新调度
apiVersion: v1
kind: ConfigMap
metadata:
  name: descheduler-policy
  namespace: kube-system
data:
  policy.yaml: |
    apiVersion: descheduler/v1alpha2
    kind: DeschedulerPolicy
    strategies:
      LowNodeUtilization:
        enabled: true
        params:
          nodeResourceUtilizationThresholds:
            thresholds:
              cpu: 20
              memory: 20
            targetThresholds:
              cpu: 50
              memory: 50
```

### 5.4.2 调度热点

**问题描述**：多个大规格 Pod 同时被调度到同一节点，导致节点过载、性能下降。

**根因分析**：

- 调度器在打分阶段倾向于将 Pod 调度到资源利用率低的节点，多个大 Pod 可能同时选择同一节点
- 缺乏 podAntiAffinity 约束
- 节点初始状态相同（同时加入集群）

**解决方案**：

1. **使用 podAntiAffinity**：将同一服务的副本分散到不同节点
2. **启用调度器抢占**：高优先级 Pod 可以抢占低优先级 Pod
3. **分批创建**：避免大量 Pod 同时创建
4. **使用 descheduler 的 `PodTopologySpread`**：确保 Pod 均匀分布

```yaml
# PodTopologySpread 约束
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: kubernetes.io/hostname
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app: order-service
```

### 5.4.3 OOMKill 与资源争抢

**问题描述**：Pod 因内存超限被 OOMKill，或 CPU 被 throttled 导致性能急剧下降。

**根因分析**：

- **内存 limit 过低**：应用实际内存使用超过 limit，被 cgroup OOM killer 杀死
- **节点内存不足**：节点上所有 Pod 的内存使用总和超过节点容量，kubelet 开始驱逐 Pod
- **CPU throttling**：即使平均 CPU 使用不高，突发峰值也会触发 CFS quota 限制
- **limits 与 requests 差距过大**：Burstable Pod 在资源竞争时优先被驱逐

**排查方法**：

```bash
# 查看 Pod 被 OOMKill 的原因
kubectl describe pod <pod-name>
# 输出中查找：State: Terminated / Reason: OOMKilled

# 查看节点资源压力
kubectl describe node <node-name>
# 输出中查找 Conditions 中的 MemoryPressure / DiskPressure

# 查看容器实际资源使用
kubectl top pod <pod-name>
kubectl top node
```

**解决方案**：

1. **合理设置内存 limits**：基于 P99 实际用量的 1.5-2 倍
2. **核心服务使用 Guaranteed QoS**：limits == requests，降低被驱逐概率
3. **配置内存预留**：kubelet 的 `--system-reserved` 和 `--kube-reserved` 为系统和 kubelet 预留资源
4. **监控与告警**：对 OOMKill 和 CPU throttling 设置告警

```yaml
# kubelet 预留资源示例（在 TKE 节点初始化脚本中配置）
# --system-reserved=cpu=500m,memory=1Gi
# --kube-reserved=cpu=200m,memory=512Mi
# --eviction-hard=memory.available<500Mi
```

### 5.4.4 节点压力驱逐

当节点资源不足时，kubelet 按以下顺序驱逐 Pod：

1. BestEffort Pod（无 requests/limits）
2. Burstable Pod（requests < limits），按实际使用超出 requests 的比例排序
3. Guaranteed Pod（limits == requests），仅在节点资源严重不足时驱逐

**关键参数**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--eviction-hard` | `memory.available<100Mi` | 触发驱逐的硬阈值 |
| `--eviction-soft` | 无 | 触发驱逐的软阈值（需配合 grace period） |
| `--eviction-soft-grace-period` | 无 | 软阈值持续多久后触发驱逐 |
| `--eviction-minimum-reclaim` | 无 | 驱逐后至少回收多少资源 |

### 5.4.5 最佳实践总结

| 实践 | 说明 |
|------|------|
| 统一节点规格 | 每个节点池使用相同机型，减少碎片 |
| 基于监控设置 requests | 使用 P99 实际用量的 1.2-1.5 倍 |
| 核心服务 Guaranteed | limits == requests，降低驱逐风险 |
| 使用 podAntiAffinity | 服务多副本跨节点部署 |
| 配置 Cluster Autoscaler | 自动扩缩节点，应对突发负载 |
| 部署 descheduler | 定期重平衡 Pod 分布 |
| 设置 PodTopologySpread | 确保 Pod 在拓扑域中均匀分布 |
| 监控 OOMKill 和 throttling | 设置告警，及时调整资源规格 |
| 合理设置 terminationGracePeriod | 确保优雅终止，避免请求中断 |
| 探针不依赖外部服务 | livenessProbe 只检查自身进程状态 |

### 5.4.6 本章小结

资源碎片化、调度热点和 OOMKill 是生产环境中最常见的三大资源风险。碎片化源于节点规格不统一和 requests 设置不合理；调度热点源于缺乏反亲和性约束和调度器行为特性；OOMKill 源于内存 limit 设置过低或节点过度承诺。应对这些风险需要从节点规划、资源设置、调度策略和监控告警四个维度综合治理。

---

## 本章总结

工作负载与资源管理是 TKE 运维的核心能力。本章从三个层面展开：

1. **工作负载选型**：Deployment 用于无状态服务，StatefulSet 用于有状态服务。更新策略、优雅终止和健康检查是保证发布安全的三大关键配置。
2. **资源管理**：requests 决定调度，limits 决定上限。QoS 类决定了 Pod 在资源竞争时的生死优先级。核心原则是基于实际用量设置 requests，合理设置 limits，避免过度承诺。
3. **调度策略**：nodeAffinity 控制 Pod-节点关系，podAffinity/podAntiAffinity 控制 Pod-Pod 关系，taint/toleration 实现节点隔离。preferred 级别优于 required，避免调度死锁。

生产环境的最佳实践是：统一节点规格、基于监控设置资源参数、核心服务使用 Guaranteed QoS、配置反亲和性分散 Pod、部署 Cluster Autoscaler 和 descheduler、建立 OOMKill 和 CPU throttling 告警。只有将工作负载、资源和调度三者有机结合，才能构建稳定高效的 TKE 集群。
