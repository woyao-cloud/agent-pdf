# 第13章 TKE 性能优化与成本控制

---

## 13.1 应用层性能优化

### 13.1.1 解决的问题

在 TKE 容器化环境中，应用性能问题通常表现为接口响应缓慢、CPU 使用率飙升、内存溢出（OOMKilled）、频繁 Full GC 导致 STW（Stop-The-World）过长。这些问题在传统物理机环境中已有成熟的调优方案，但在容器环境下，由于资源隔离（cgroup）、共享内核、动态调度等特性，传统调优手段往往失效或产生反效果。核心矛盾在于：**JVM 无法感知容器资源限制，导致堆大小超出 cgroup 限制而被 OOM Kill**。

### 13.1.2 核心原理

#### JVM 容器感知

JDK 8u191+ 引入了 `-XX:+UseContainerSupport` 标志，使 JVM 能够读取 cgroup 的 `memory.limit_in_bytes` 和 `cpu.shares`，从而正确识别容器分配的内存和 CPU 核数。在此之前，JVM 读取的是宿主机的 `/proc/meminfo`，导致 MaxHeap 被设置为宿主机内存的 1/4，远超容器限制。

启用后，JVM 自动将堆大小限制在容器可用内存范围内，默认 MaxRAMFraction 为 4（即使用 25% 的容器内存作为堆）。但在生产环境中，需要为 JVM 非堆内存（Metaspace、线程栈、Direct Buffer、Code Cache）预留空间，建议手动指定堆大小。

#### 垃圾回收器选型

| 回收器 | 适用场景 | 容器化优势 | 风险 |
|--------|----------|------------|------|
| G1GC | 堆 > 4GB，延迟敏感 | 可预测的停顿，Region 分区 | 小堆下性能不如 Parallel |
| ZGC | 堆 > 8GB，极低延迟 | 停顿 < 10ms，与堆大小无关 | 内存占用高，需额外预留 |
| Parallel | 批处理/离线任务 | 吞吐量优先 | STW 时间长 |

#### 连接池与缓存

数据库连接池（HikariCP）和本地缓存（Caffeine）是应用层性能的两大支柱。HikariCP 以极小的 footprint 提供高效的连接管理；Caffeine 基于 W-TinyLFU 算法，在缓存命中率和内存占用之间取得平衡。

### 13.1.3 代码/配置实现

#### JVM 参数模板

以下是一套经过生产验证的 JVM 参数配置，适用于 4C8G 容器中的 Spring Boot 应用：

```bash
# 基础参数
-Xms4g -Xmx4g
-XX:+UseContainerSupport
-XX:InitialRAMPercentage=50.0
-XX:MaxRAMPercentage=50.0
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200
-XX:ParallelGCThreads=2
-XX:ConcGCThreads=1
-XX:InitiatingHeapOccupancyPercent=70
-XX:G1HeapRegionSize=4m
-XX:+DisableExplicitGC
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/data/dump/
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-Xloggc:/data/gc/gc-%t.log
-XX:+UseGCLogFileRotation
-XX:NumberOfGCLogFiles=5
-XX:GCLogFileSize=10M

# 容器感知
-XX:+UseContainerSupport
-XX:+PreferContainerQuotaForCPUCount

# 元空间
-XX:MaxMetaspaceSize=256m
-XX:MetaspaceSize=128m

# 线程栈
-Xss512k

# 直接内存（Netty 等框架需要）
-XX:MaxDirectMemorySize=512m
```

**关键参数说明：**

- `-XX:MaxRAMPercentage=50.0`：堆占用容器内存的 50%，剩余 50% 留给 OS、元空间、线程栈、Direct Buffer
- `-XX:MaxGCPauseMillis=200`：G1GC 的目标停顿时间，调小会增加 GC 频率
- `-XX:ParallelGCThreads=2`：4C 容器建议设为 2，避免 GC 线程抢占业务 CPU
- `-XX:ConcGCThreads=1`：并发标记线程数，通常为 ParallelGCThreads 的 1/4

#### ZGC 参数（适用于 8C16G+ 容器）

```bash
-XX:+UseZGC
-XX:MaxRAMPercentage=60.0
-XX:ConcGCThreads=2
-XX:ZAllocationSpikeTolerance=2.0
-XX:+ZProactive
-XX:SoftMaxHeapSize=10g
```

ZGC 的 `SoftMaxHeapSize` 允许在内存充裕时使用更多堆，在压力下回退到软限制，避免 OOM。

#### HikariCP 配置

```yaml
# application.yml
spring:
  datasource:
    hikari:
      # 核心参数
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 3000      # 获取连接超时（毫秒）
      idle-timeout: 600000          # 空闲连接最大存活（毫秒）
      max-lifetime: 1800000         # 连接最大生命周期（毫秒）
      keepalive-time: 300000        # 心跳检测间隔（毫秒）

      # 性能参数
      pool-name: TkeHikariCP
      connection-test-query: SELECT 1
      validation-timeout: 1500
      leak-detection-threshold: 60000  # 连接泄漏检测

      # 驱动优化
      data-source-properties:
        cachePrepStmts: true
        prepStmtCacheSize: 256
        prepStmtCacheSqlLimit: 2048
        useServerPrepStmts: true
        useLocalSessionState: true
        rewriteBatchedStatements: true
        cacheResultSetMetadata: true
        cacheServerConfiguration: true
        elideSetAutoCommits: true
        maintainTimeStats: false
```

**池大小计算公式：**

```
连接数 = (核心线程数 / (1 - 阻塞系数))
       = (CPU核数 × 2) / (1 - 0.8)  # 典型 Web 应用阻塞系数约 0.8
       = 4C × 2 / 0.2 = 40
```

实际生产中建议从 10-20 起步，通过压测逐步上调。过多的连接反而会因数据库端争用导致性能下降。

#### Caffeine 缓存配置

```java
@Configuration
public class CacheConfig {

    @Bean
    public Cache<String, OrderInfo> orderCache() {
        return Caffeine.newBuilder()
                .initialCapacity(1024)
                .maximumSize(10_000)
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .expireAfterAccess(1, TimeUnit.HOURS)
                .refreshAfterWrite(1, TimeUnit.MINUTES)
                .recordStats()
                .build();
    }

    @Bean
    public Cache<Long, ProductInfo> productCache() {
        return Caffeine.newBuilder()
                .maximumWeight(50_000_000)  // 50MB
                .weigher((Long key, ProductInfo value) -> value.getSizeBytes())
                .expireAfterWrite(10, TimeUnit.MINUTES)
                .recordStats()
                .build();
    }
}
```

**缓存监控端点：**

```java
@RestController
@RequestMapping("/internal/cache")
public class CacheMonitorController {

    private final Cache<String, OrderInfo> orderCache;

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        CacheStats stats = orderCache.stats();
        return Map.of(
            "hitRate", stats.hitRate(),
            "missRate", stats.missRate(),
            "loadTime", stats.averageLoadPenalty(),
            "evictionCount", stats.evictionCount()
        );
    }
}
```

当 `hitRate < 0.8` 时，说明缓存策略需要调整；当 `evictionCount` 持续增长时，说明最大容量设置过小。

#### Redis 缓存策略

```java
// 多级缓存：Caffeine（本地）→ Redis（分布式）→ DB
public OrderInfo getOrder(String orderId) {
    // 1. 本地缓存
    OrderInfo order = localCache.getIfPresent(orderId);
    if (order != null) return order;

    // 2. Redis 缓存（带空值缓存，防止缓存穿透）
    String json = redisTemplate.opsForValue().get("order:" + orderId);
    if (json != null) {
        if ("NULL".equals(json)) return null;  // 空值缓存
        order = JSON.parseObject(json, OrderInfo.class);
        localCache.put(orderId, order);
        return order;
    }

    // 3. 数据库查询（互斥锁防止缓存击穿）
    String lockKey = "lock:order:" + orderId;
    if (redisTemplate.opsForValue().setIfAbsent(lockKey, "1", 3, TimeUnit.SECONDS)) {
        try {
            order = orderMapper.selectById(orderId);
            if (order != null) {
                redisTemplate.opsForValue().set("order:" + orderId,
                    JSON.toJSONString(order), 30, TimeUnit.MINUTES);
                localCache.put(orderId, order);
            } else {
                // 空值缓存，防止缓存穿透
                redisTemplate.opsForValue().set("order:" + orderId,
                    "NULL", 1, TimeUnit.MINUTES);
            }
        } finally {
            redisTemplate.delete(lockKey);
        }
    } else {
        // 未获取到锁，短暂等待后重试
        Thread.sleep(50);
        return getOrder(orderId);
    }
    return order;
}
```

### 13.1.4 使用场景

- **高并发 Web 服务**：G1GC + HikariCP + Caffeine 多级缓存，适用于秒杀、订单等核心链路
- **大数据/流处理**：ParallelGC 或 G1GC 配合大堆，适用于 Flink/Spark 作业
- **低延迟金融系统**：ZGC + 堆外内存，适用于交易撮合、风控决策
- **批处理任务**：ParallelGC + 适当增大堆，适用于定时报表、数据同步

### 13.1.5 潜在风险与注意事项

1. **堆大小设置过高**：`MaxRAMPercentage` 超过 70% 时，OS 和 JVM 非堆内存不足，易触发 OOMKilled。建议 4C8G 容器设为 50%，8C16G 设为 60%
2. **G1GC 在小堆上的退化**：堆 < 2GB 时 G1GC 会退化为 SerialGC，性能反而下降。小堆建议使用 ParallelGC 或 Shenandoah
3. **连接池泄漏**：未正确关闭连接会导致连接池耗尽。务必启用 `leak-detection-threshold` 并配合监控告警
4. **缓存雪崩**：大量缓存同时过期会导致数据库被打爆。使用 `expireAfterWrite` + `refreshAfterWrite` 组合，让缓存过期前异步刷新
5. **容器 CPU Throttling**：当 Pod 的 CPU 使用接近 limit 时，CFS 配额会导致 CPU Throttling。建议 CPU Request = Limit，或使用 Burstable QoS

### 13.1.6 本章小结

应用层性能优化的核心是让 JVM 正确感知容器资源边界，选择合适的 GC 算法，并精细化管理连接池和缓存。关键原则：**为 JVM 非堆内存预留足够空间，连接池宁小勿大，缓存务必设置过期策略和监控**。一套经过压测验证的 JVM 参数模板，配合 HikariCP 的驱动级优化和 Caffeine + Redis 的多级缓存，通常能将接口 P99 延迟降低 50% 以上。

---

## 13.2 集群层性能优化

### 13.2.1 解决的问题

集群层性能问题往往比应用层更具破坏性：节点网络吞吐瓶颈导致 Pod 间通信延迟飙升；磁盘 IOPS 耗尽导致 etcd 响应超时；内核参数默认值不适合高并发容器场景；存储选型不当导致数据库类工作负载性能不达标。这些问题通常影响整个集群而非单个 Pod。

### 13.2.2 核心原理

#### 节点规格选型

TKE 节点选型需要平衡 CPU、内存、网络带宽、磁盘 IOPS 四个维度：

| 工作负载类型 | 推荐机型 | 核存比 | 网络增强 | 说明 |
|--------------|----------|--------|----------|------|
| Web/微服务 | S5/S6 | 1:2~1:4 | 是 | 计算网络均衡 |
| 大数据/AI | GN10Xp | 1:4~1:8 | 是 | GPU 加速 |
| 数据库 | IT5/IT6 | 1:8~1:16 | 是 | 高 IOPS 本地盘 |
| 离线批处理 | S2/S3 | 1:2 | 否 | 成本优先 |

**核心原则：** 节点规格不宜过小（< 4C8G），否则 kubelet、kube-proxy 等系统组件占用比例过高；也不宜过大（> 64C256G），否则单点故障影响面过大，且 Pod 调度碎片化严重。

#### 内核参数调优

容器共享宿主机内核，内核参数直接影响所有 Pod 的网络性能。关键参数包括 TCP 连接跟踪、TIME_WAIT 复用、Socket 队列长度等。

#### 存储性能

TKE 提供三种主要存储类型：

- **CBS（云硬盘）**：持久化块存储，适合数据库，最大 36000 IOPS
- **CFS（文件存储）**：共享文件系统，适合日志、配置文件，吞吐优先
- **本地 SSD**：超高 IOPS（单盘可达 100万），适合临时数据、缓存

### 13.2.3 代码/配置实现

#### 内核参数调优（DaemonSet 方式）

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: sysctl-tuner
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: sysctl-tuner
  template:
    spec:
      hostPID: true
      containers:
      - name: tuner
        image: alpine:3.18
        securityContext:
          privileged: true
        command:
        - /bin/sh
        - -c
        - |
          # 网络层优化
          sysctl -w net.core.somaxconn=65535
          sysctl -w net.core.netdev_max_backlog=50000
          sysctl -w net.ipv4.tcp_max_syn_backlog=65535
          sysctl -w net.ipv4.tcp_slow_start_after_idle=0

          # TIME_WAIT 优化（仅在非 NAT 场景）
          sysctl -w net.ipv4.tcp_tw_reuse=1
          sysctl -w net.ipv4.tcp_fin_timeout=15
          sysctl -w net.ipv4.tcp_max_tw_buckets=2000000

          # 连接跟踪
          sysctl -w net.netfilter.nf_conntrack_max=2000000
          sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=600
          sysctl -w net.netfilter.nf_conntrack_tcp_timeout_time_wait=30

          # 内存与文件系统
          sysctl -w vm.swappiness=10
          sysctl -w vm.dirty_ratio=20
          sysctl -w vm.dirty_background_ratio=5
          sysctl -w vm.max_map_count=262144
          sysctl -w fs.file-max=1048576
          sysctl -w fs.inotify.max_user_watches=524288

          # 保持运行
          sleep infinity
```

**参数说明：**

| 参数 | 默认值 | 推荐值 | 作用 |
|------|--------|--------|------|
| `net.core.somaxconn` | 128 | 65535 | 最大 listen 队列长度，高并发下不足会导致连接拒绝 |
| `net.ipv4.tcp_tw_reuse` | 0 | 1 | 允许重用 TIME_WAIT 状态的连接，大幅提升短连接吞吐 |
| `net.ipv4.tcp_fin_timeout` | 60 | 15 | 减少 TIME_WAIT 等待时间 |
| `vm.swappiness` | 60 | 10 | 降低 swap 使用倾向，避免内存抖动 |
| `net.netfilter.nf_conntrack_max` | 65536 | 2000000 | 连接跟踪表大小，不足会导致丢包 |

#### CBS 存储性能配置

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mysql-data-pvc
  annotations:
    volume.beta.kubernetes.io/storage-class: "cbs-custom"
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 500Gi
  storageClassName: cbs-custom
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: cbs-custom
provisioner: com.tencent.cloud.csi.cbs
parameters:
  type: CLOUD_SSD
  # 按需配置 IOPS/吞吐
  iops: "36000"
  throughput: "350MBps"
  # 是否使用极速型 SSD
  # type: CLOUD_TSSD
  # iops: "100000"
reclaimPolicy: Retain
allowVolumeExpansion: true
```

**存储选型决策树：**

```
工作负载是否需要持久化数据？
├── 是
│   ├── 是否需要共享访问？
│   │   ├── 是 → CFS（日志、配置文件）
│   │   └── 否
│   │       ├── IOPS 要求 > 50000？ → 本地 SSD（数据库、缓存）
│   │       └── IOPS 要求 ≤ 50000？ → CBS（通用持久化）
│   └── 是否需要快照/备份？ → CBS（支持快照）
└── 否 → emptyDir + tmpfs（临时数据）
```

#### 网络性能优化（CNI 选择）

```yaml
# 使用 VPC-CNI 模式（Global Router 增强版）
apiVersion: vpc.tencentcloud.cni.tke.cloud/v1
kind: VpcCni
metadata:
  name: vpc-cni-config
spec:
  # 开启直通 Pod 模式，绕过 kube-proxy iptables
  enableDirectRouting: true
  # 开启 eBPF 加速
  enableEbpf: true
  # 最大 Pod 数（受限于节点 ENI 配额）
  maxPodPerNode: 16
```

VPC-CNI 模式相比默认的 Global Router（iptables 转发），延迟降低约 30%，吞吐提升约 50%。

### 13.2.4 使用场景

- **高并发网关集群**：`somaxconn` + `tcp_tw_reuse` + VPC-CNI 直通，可支撑单节点 10 万级并发连接
- **数据库集群**：CBS 极速型 SSD + 内核 dirty_ratio 调优，MySQL/TiDB 性能提升 2-3 倍
- **日志采集集群**：CFS 共享存储 + `fs.inotify.max_user_watches` 调大，避免 Filebeat 因 inotify 耗尽而漏采
- **AI 训练集群**：本地 SSD + 大内存节点 + 内核 `max_map_count` 调大，支撑 GPU 显存映射

### 13.2.5 潜在风险与注意事项

1. **`tcp_tw_reuse` 的 NAT 陷阱**：在 NAT 环境下（如 TKE 的 Global Router 模式），`tcp_tw_reuse` 可能导致连接复用错误，表现为 HTTP 连接被重置。仅在 VPC-CNI 直通模式下启用
2. **内核参数持久化**：DaemonSet 方式修改的内核参数在节点重启后丢失。建议配合 TKE 的节点初始化脚本（User Data）或使用 `systemd-sysctl` 持久化
3. **CBS 性能毛刺**：CBS 的 IOPS 和吞吐受限于单盘配额和存储节点负载，生产环境建议预留 20% 的 IOPS 余量
4. **本地 SSD 数据安全**：本地 SSD 是 ephemeral 存储，节点故障或迁移会导致数据丢失。务必配合副本机制（如 MySQL 主从、Kafka 副本）
5. **VPC-CNI IP 耗尽**：每个 ENI 有 IP 配额限制，大集群需要提前规划 VPC 子网 CIDR，或启用 IP 地址回收策略

### 13.2.6 本章小结

集群层性能优化是"一劳永逸"的工作：一次性的内核参数调优和存储选型，能让集群中所有工作负载受益。核心要点：**网络参数调优关注连接队列和 TIME_WAIT 复用，存储选型根据 IOPS 需求分层，网络方案优先选择 VPC-CNI 直通模式**。建议在集群创建初期就完成这些配置，避免后期大规模迁移。

---

## 13.3 资源利用率分析与成本控制

### 13.3.1 解决的问题

TKE 集群中最常见的成本浪费是资源碎片和过度申请。根据腾讯云官方统计，超过 60% 的 TKE 用户集群平均资源利用率低于 20%。具体表现为：

- 开发/测试环境 Pod 的 Request 设置过高，实际使用率仅 5-10%
- 节点规格碎片化，导致调度器无法有效装箱
- 大量 Pod 在夜间/周末处于空闲状态，但仍在消耗资源
- 预留实例（包年包月）和按量计费的比例失衡

### 13.3.2 核心原理

#### 资源利用率分析

Kubernetes 提供 `kubectl top` 命令查看实时资源使用，但历史趋势分析需要配合 Metrics Server + Prometheus。核心指标：

- **CPU Request vs Usage**：反映过度申请程度
- **Memory Request vs Usage**：反映内存浪费程度
- **Pod 密度**：每节点运行的 Pod 数量，反映装箱效率
- **资源碎片率**：节点上不可调度的剩余资源比例

#### 成本模型

TKE 的成本由三部分组成：

```
总成本 = 计算资源（CVM）+ 存储资源（CBS/CFS）+ 网络流量（CLB/NAT）
       = Σ(节点规格单价 × 数量) + Σ(存储容量 × 单价) + Σ(出网流量 × 单价)
```

其中计算资源占 70-80%，是成本优化的主要目标。

### 13.3.3 代码/配置实现

#### 资源利用率分析脚本

```bash
#!/bin/bash
# 集群资源利用率分析

echo "=== 节点资源利用率 ==="
kubectl top node | awk '
NR>1 {
    cpu_usage=$2+0; cpu_total=$3+0
    mem_usage=$4+0; mem_total=$5+0
    printf "%-20s CPU: %5.1f%%  Mem: %5.1f%%\n", $1, cpu_usage/cpu_total*100, mem_usage/mem_total*100
}'

echo ""
echo "=== 过度申请分析（Request vs Usage）==="
kubectl get pods --all-namespaces -o json | jq -r '
.items[] | 
select(.spec.containers[].resources.requests != null) |
{
    ns: .metadata.namespace,
    pod: .metadata.name,
    cpu_req: ([.spec.containers[].resources.requests.cpu] | map(if . == null then "0" else . end | gsub("[^0-9.]"; "")) | map(tonumber) | add),
    mem_req: ([.spec.containers[].resources.requests.memory] | map(if . == null then "0" else . end | gsub("[^0-9.]"; "")) | map(tonumber) | add)
}' | head -20

echo ""
echo "=== 节点资源碎片分析 ==="
kubectl describe nodes | grep -A 3 "Allocated resources" | grep -v "Allocated resources"
```

#### VPA（Vertical Pod Autoscaler）配置

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: order-service-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  updatePolicy:
    updateMode: "Auto"  # Auto/Initial/Off
  resourcePolicy:
    containerPolicies:
    - containerName: "*"
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: "4"
        memory: 8Gi
      controlledResources: ["cpu", "memory"]
```

**VPA 三种模式：**

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| Off | 仅提供推荐值，不自动调整 | 分析阶段，人工审核推荐 |
| Initial | 仅在 Pod 创建时设置 | 新部署的应用 |
| Auto | 自动更新并重启 Pod | 生产环境，需配合 PDB |

**VPA 推荐值解读：**

```bash
# 查看 VPA 推荐
kubectl describe vpa order-service-vpa

# 输出示例
# Recommendation:
#   Container order-service:
#     Lower Bound: 250m CPU, 512Mi Memory
#     Target:      500m CPU, 1Gi Memory
#     Upper Bound: 2 CPU, 4Gi Memory
#     Uncapped Target: 500m CPU, 1Gi Memory
```

- **Lower Bound**：低于此值可能导致 OOM 或 CPU Throttling
- **Target**：推荐的 Request 值
- **Upper Bound**：高于此值可能造成浪费

#### 成本分析 Dashboard（Prometheus + Grafana）

```yaml
# Prometheus 成本指标采集规则
groups:
- name: cost_analysis
  rules:
  # 节点成本（假设标准节点单价）
  - record: node:cost_per_hour
    expr: |
      label_replace(
        sum by (instance) (
          count(kube_node_info) 
        ) * 0,
        "cost", "0.5"
      )
      # 实际应通过标签映射到 CVM 定价

  # Pod 资源成本分摊
  - record: pod:cpu_cost_share
    expr: |
      sum by (namespace, pod) (
        rate(container_cpu_usage_seconds_total{container!=""}[5m])
      ) / sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) 
      * on() group_left() node:cost_per_hour

  # 资源利用率
  - record: cluster:cpu_utilization
    expr: |
      sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))
      / sum(kube_node_status_capacity_cpu_cores)
```

### 13.3.4 使用场景

- **成本审计**：每月通过 VPA 推荐值和实际使用率对比，识别过度申请的 Workload
- **资源配额管理**：基于 VPA 推荐值设置 Namespace ResourceQuota，防止团队过度申请
- **容量规划**：根据利用率趋势预测未来 3-6 个月的节点扩容需求
- **成本分摊**：按 Pod 实际使用量将成本分摊到业务线，推动业务方主动优化

### 13.3.5 潜在风险与注意事项

1. **VPA 与 HPA 冲突**：VPA 调整 Request 会影响 HPA 的扩缩容决策。建议 VPA 仅调整 Memory，CPU 由 HPA 管理
2. **VPA Auto 模式的重启影响**：VPA 调整需要重建 Pod，可能导致连接中断。务必配合 PDB（PodDisruptionBudget）使用
3. **Request 设置过低**：过度追求利用率可能导致 CPU Throttling 和 OOM。建议 Target 值 = P99 使用量 × 1.2 安全系数
4. **成本数据延迟**：CVM 账单有 1-2 天延迟，实时成本分析只能估算，不能替代官方账单

### 13.3.6 本章小结

资源利用率分析是成本控制的基础。通过 `kubectl top` 实时监控、VPA 推荐值分析、Prometheus 历史趋势三位一体，可以准确识别资源浪费。核心原则：**先测量，后优化**。不要凭经验设置 Request，而是基于 VPA 的 Target 推荐值设置，并定期（每月）复盘调整。

---

## 13.4 成本优化策略

### 13.4.1 解决的问题

在完成资源利用率分析后，需要将分析结果转化为实际的成本节省。常见的成本优化手段包括：利用竞价实例（Spot Instance）降低计算成本、通过 Right-Sizing 消除过度申请、利用弹性伸缩在低负载时缩容节点。这些策略的核心挑战在于：**如何在降低成本的同时不牺牲可用性和性能**。

### 13.4.2 核心原理

#### 竞价实例

腾讯云竞价实例（Spot Instance）以按量计费的 10-20% 价格提供同等规格的 CVM，但可能因资源紧张被回收。TKE 原生支持 Spot Pod，自动处理中断和重调度。

**定价模型：**

| 实例类型 | 按量计费 | 竞价实例 | 节省比例 |
|----------|----------|----------|----------|
| S5.4C8G | ¥0.44/小时 | ¥0.07/小时 | ~84% |
| S6.8C16G | ¥0.88/小时 | ¥0.13/小时 | ~85% |
| GN10Xp.8C32G | ¥5.28/小时 | ¥0.79/小时 | ~85% |

#### Right-Sizing

Right-Sizing 是指将 Pod 的 Request/Limit 调整到与实际使用量匹配的过程。一个典型的过度申请场景：Pod Request 4C8G，实际使用 0.5C1G，调整后每年可节省：

```
年节省 = (4 - 0.5) × 0.44 × 24 × 365 + (8 - 1) × 0.12 × 24 × 365
       = 13468 + 7358 = ¥20826/年
```

#### 弹性伸缩的成本效益

HPA + Cluster Autoscaler 的组合可以在低负载时缩容 Pod 和节点，在高负载时扩容。以一个 10 节点集群为例，夜间负载降至白天的 20%，缩容到 3 节点：

```
月节省 = (10 - 3) × 0.44 × 24 × 30 = ¥2217.6/月
年节省 = ¥26611.2/年
```

### 13.4.3 代码/配置实现

#### 竞价实例节点池

```yaml
apiVersion: tke.cloud.tencent.com/v1
kind: Machine
metadata:
  name: spot-node-pool
  namespace: kube-system
spec:
  clusterId: cls-xxxxxxxx
  instanceType: S5.4C8G
  instanceChargeType: SPOTPAID
  spotMaxPrice: "0.15"  # 最高出价，超过此价格不再创建
  subnetId: subnet-xxxxxxxx
  securityGroupId: sg-xxxxxxxx
  systemDisk:
    diskType: CLOUD_SSD
    diskSize: 50
  dataDisks:
  - diskType: CLOUD_SSD
    diskSize: 100
  labels:
    node-type: spot
  taints:
  - key: spot
    value: "true"
    effect: NoSchedule
```

#### Spot Pod 调度与中断处理

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: batch-worker
  namespace: production
spec:
  replicas: 20
  selector:
    matchLabels:
      app: batch-worker
  template:
    metadata:
      labels:
        app: batch-worker
    spec:
      # 容忍竞价实例污点
      tolerations:
      - key: "spot"
        operator: "Equal"
        value: "true"
        effect: "NoSchedule"
      # 优先调度到竞价实例
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            preference:
              matchExpressions:
              - key: node-type
                operator: In
                values:
                - spot
      containers:
      - name: worker
        image: myapp/batch-worker:latest
        resources:
          requests:
            cpu: "1"
            memory: 2Gi
          limits:
            cpu: "2"
            memory: 4Gi
        # 优雅退出处理
        lifecycle:
          preStop:
            exec:
              command:
              - /bin/sh
              - -c
              - |
                # 收到中断信号后，将当前任务标记为可重试
                curl -X POST http://job-manager/mark-retry/$(hostname)
                sleep 30  # 等待任务保存
      # 中断预算
      terminationGracePeriodSeconds: 60
```

#### 中断处理策略

```java
// 竞价实例中断监听器
@Component
public class SpotInterruptionHandler {

    private static final String INTERRUPT_METADATA_URL =
        "http://metadata.tencentyun.com/latest/meta-data/spot/termination-time";

    private final JobManagerClient jobManager;

    @PostConstruct
    public void startMonitoring() {
        ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);
        scheduler.scheduleAtFixedRate(this::checkInterruption, 0, 5, TimeUnit.SECONDS);
    }

    private void checkInterruption() {
        try {
            HttpGet request = new HttpGet(INTERRUPT_METADATA_URL);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                if (response.getStatusLine().getStatusCode() == 200) {
                    // 实例即将被回收，执行优雅退出
                    String terminationTime = EntityUtils.toString(response.getEntity());
                    log.warn("Spot instance will be terminated at: {}", terminationTime);
                    jobManager.markCurrentTasksRetryable();
                    // 主动退出，让 Kubernetes 重新调度
                    System.exit(0);
                }
            }
        } catch (Exception e) {
            // 忽略，下次重试
        }
    }
}
```

#### 基于成本的 HPA 配置

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60  # 目标 CPU 利用率 60%
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # 缩容稳定窗口 5 分钟
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 4
        periodSeconds: 15
```

#### Cluster Autoscaler 配置

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-autoscaler-config
  namespace: kube-system
data:
  config: |
    # 扩容阈值
    scale-up-utilization-threshold: 0.6
    scale-up-unneeded-time: 10m
    scale-down-delay-after-add: 10m
    scale-down-delay-after-delete: 10m
    scale-down-delay-after-failure: 3m

    # 缩容策略
    scale-down-enabled: true
    scale-down-unneeded-time: 15m
    scale-down-utilization-threshold: 0.5

    # 节点组配置
    nodes:
      - group: "spot-pool"
        minSize: 0
        maxSize: 20
        instanceType: S5.4C8G
        chargeType: SPOTPAID
      - group: "ondemand-pool"
        minSize: 3
        maxSize: 10
        instanceType: S5.4C8G
        chargeType: PREPAID
```

#### 成本分析报告（Python 示例）

```python
#!/usr/bin/env python3
"""TKE 成本分析报告生成器"""

import requests
from datetime import datetime, timedelta
from collections import defaultdict

# 定价表（示例，实际应从 API 获取）
PRICING = {
    "S5.4C8G": {"ondemand": 0.44, "spot": 0.07},
    "S5.8C16G": {"ondemand": 0.88, "spot": 0.13},
    "S6.4C8G": {"ondemand": 0.46, "spot": 0.08},
}

def analyze_cluster_cost(prometheus_url, cluster_id):
    """分析集群成本并生成优化建议"""

    # 查询节点信息
    nodes_query = '''
        sum by (instance, instance_type, charge_type) (
            count(kube_node_info{cluster="%s"}) by (instance, instance_type, charge_type)
        )
    ''' % cluster_id

    # 查询 Pod 资源使用
    pod_usage_query = '''
        sum by (namespace, pod) (
            rate(container_cpu_usage_seconds_total{cluster="%s"}[5m])
        ) > 0.01
    ''' % cluster_id

    # 计算当前成本
    total_cost = 0
    node_details = []

    for node_type, count in get_node_counts(prometheus_url, nodes_query):
        instance_type = node_type["instance_type"]
        charge_type = node_type["charge_type"]
        price = PRICING.get(instance_type, {}).get(charge_type, 0)
        monthly_cost = price * 24 * 30 * count

        total_cost += monthly_cost
        node_details.append({
            "type": instance_type,
            "charge": charge_type,
            "count": count,
            "monthly_cost": monthly_cost
        })

    # 生成优化建议
    recommendations = []

    # 1. 识别过度申请
    over_provisioned = find_over_provisioned_pods(prometheus_url, cluster_id)
    for pod in over_provisioned[:10]:
        cpu_saving = (pod["cpu_request"] - pod["cpu_usage"]) * 0.44 * 24 * 30
        mem_saving = (pod["mem_request_gb"] - pod["mem_usage_gb"]) * 0.12 * 24 * 30
        recommendations.append({
            "type": "right-sizing",
            "pod": f"{pod['namespace']}/{pod['name']}",
            "current": f"{pod['cpu_request']}C/{pod['mem_request_gb']}Gi",
            "recommended": f"{pod['cpu_usage'] * 1.3:.1f}C/{pod['mem_usage_gb'] * 1.3:.1f}Gi",
            "monthly_saving": cpu_saving + mem_saving
        })

    # 2. 识别可迁移到竞价实例的工作负载
    spot_candidates = find_spot_candidates(prometheus_url, cluster_id)
    for workload in spot_candidates[:10]:
        current_cost = workload["cpu_cores"] * 0.44 * 24 * 30
        spot_cost = workload["cpu_cores"] * 0.07 * 24 * 30
        recommendations.append({
            "type": "spot-migration",
            "workload": f"{workload['namespace']}/{workload['name']}",
            "current_cost": current_cost,
            "spot_cost": spot_cost,
            "monthly_saving": current_cost - spot_cost
        })

    # 3. 识别空闲资源
    idle_nodes = find_idle_nodes(prometheus_url, cluster_id)
    for node in idle_nodes:
        price = PRICING.get(node["type"], {}).get("ondemand", 0.44)
        recommendations.append({
            "type": "idle-reclamation",
            "node": node["name"],
            "monthly_saving": price * 24 * 30
        })

    return {
        "cluster_id": cluster_id,
        "analysis_time": datetime.now().isoformat(),
        "total_monthly_cost": total_cost,
        "node_details": node_details,
        "recommendations": recommendations,
        "total_potential_saving": sum(r["monthly_saving"] for r in recommendations)
    }


def print_report(report):
    """打印成本分析报告"""
    print(f"""
╔══════════════════════════════════════════════════╗
║         TKE 成本分析报告                          ║
╠══════════════════════════════════════════════════╣
║ 集群: {report['cluster_id']:<35} ║
║ 时间: {report['analysis_time']:<35} ║
║ 当前月成本: ¥{report['total_monthly_cost']:<15.2f}      ║
║ 可优化节省: ¥{report['total_potential_saving']:<15.2f}      ║
║ 优化比例: {report['total_potential_saving']/report['total_monthly_cost']*100:>5.1f}%{'':>28} ║
╚══════════════════════════════════════════════════╝

=== 节点详情 ===
""")
    for n in report["node_details"]:
        print(f"  {n['type']:>12} {n['charge']:<10} x{n['count']:<3} = ¥{n['monthly_cost']:<10.2f}/月")

    print("\n=== 优化建议 ===\n")
    for r in report["recommendations"][:5]:
        if r["type"] == "right-sizing":
            print(f"  [Right-Sizing] {r['pod']}")
            print(f"    当前: {r['current']} → 推荐: {r['recommended']}")
            print(f"    月节省: ¥{r['monthly_saving']:.2f}\n")
        elif r["type"] == "spot-migration":
            print(f"  [竞价实例] {r['workload']}")
            print(f"    当前: ¥{r['current_cost']:.2f}/月 → 竞价: ¥{r['spot_cost']:.2f}/月")
            print(f"    月节省: ¥{r['monthly_saving']:.2f}\n")
        elif r["type"] == "idle-reclamation":
            print(f"  [空闲回收] {r['node']}")
            print(f"    月节省: ¥{r['monthly_saving']:.2f}\n")
```

### 13.4.4 使用场景

- **离线批处理/大数据作业**：100% 使用竞价实例，配合中断处理机制，成本降低 80%
- **Web 服务混合部署**：核心服务用包年包月保证稳定性，弹性部分用竞价实例降低成本
- **开发/测试环境**：非工作时间缩容到 0，结合竞价实例，成本降低 90%+
- **CI/CD 构建集群**：使用竞价实例作为构建节点，构建任务可中断重试

### 13.4.5 潜在风险与注意事项

1. **竞价实例回收率**：热门机型（如 GPU 实例）的回收率可达 20-30%。建议监控 `spot/termination-time` 元数据，实现优雅退出
2. **包年包月退费损失**：提前退订包年包月实例会收取手续费。建议包年包月覆盖基础容量（70%），按量/竞价覆盖弹性容量（30%）
3. **缩容震荡**：HPA 和 Cluster Autoscaler 配合不当会导致频繁扩缩容。务必设置 `stabilizationWindowSeconds` 和 `scale-down-delay-after-add`
4. **业务优先级**：成本优化不应影响核心业务 SLA。建议按业务重要性分级：P0 用包年包月，P1 用按量，P2/P3 用竞价
5. **Right-Sizing 的连锁反应**：降低 Request 后，节点上可以调度更多 Pod，可能导致节点资源争用。建议逐步调整，每次调整后观察 1-2 周

### 13.4.6 本章小结

成本优化是一个持续迭代的过程，而非一次性动作。最佳实践是建立"分析-优化-验证"的闭环：

1. **分析**：每月运行成本分析脚本，识别过度申请、空闲资源、竞价实例迁移机会
2. **优化**：按优先级执行 Right-Sizing、迁移竞价实例、缩容空闲节点
3. **验证**：观察优化后的 P99 延迟和错误率，确保 SLA 不受影响

**成本优化的黄金法则：** 包年包月保底（60-70% 的基础容量），按量计费应对波动（20-30%），竞价实例处理弹性（10-20% 的容错工作负载）。通过 VPA 推荐值 + HPA 弹性伸缩 + Cluster Autoscaler 节点自动扩缩容，可以在保证 SLA 的前提下，将集群总成本降低 40-60%。

---

## 13.5 综合案例：电商平台 TKE 性能优化与成本控制实战

### 13.5.1 背景

某电商平台 TKE 集群规模：50 个节点（S5.4C8G），运行 200+ 微服务。面临问题：

- 接口 P99 延迟 800ms+，远超 200ms 的 SLO
- 集群平均 CPU 利用率仅 15%，月成本 ¥15 万+
- 频繁出现 OOMKilled，业务稳定性差

### 13.5.2 优化方案

**第一阶段：应用层优化（第 1-2 周）**

| 问题 | 优化措施 | 效果 |
|------|----------|------|
| JVM 堆过大导致 OOM | 统一使用 `-XX:MaxRAMPercentage=50` | OOM 减少 90% |
| Full GC 频繁 | 从 ParallelGC 切换到 G1GC | STW 从 5s 降至 200ms |
| 连接池耗尽 | HikariCP 从 100 降至 20，启用驱动优化 | 连接等待时间降低 70% |
| 缓存命中率低 | 引入 Caffeine 本地缓存 + Redis 多级缓存 | DB 查询量降低 60% |

**第二阶段：集群层优化（第 3 周）**

- 内核参数调优：`somaxconn=65535`，`tcp_tw_reuse=1`
- 网络方案从 Global Router 切换到 VPC-CNI 直通
- 数据库 Pod 迁移到 CBS 极速型 SSD

**第三阶段：成本优化（第 4 周起持续）**

- 运行成本分析脚本，识别出 40 个过度申请的 Pod
- 将 30% 的离线任务迁移到竞价实例节点池
- 配置 HPA + Cluster Autoscaler，夜间缩容到 20 节点

### 13.5.3 优化结果

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| P99 延迟 | 800ms | 120ms | 85% |
| CPU 利用率 | 15% | 45% | 200% |
| 月成本 | ¥15 万 | ¥8.2 万 | 45% |
| OOM 次数/周 | 15+ | 0 | 100% |
| 节点数 | 50 | 20-35（动态） | 30-60% |

### 13.5.4 经验总结

1. **先优化性能，再控制成本**：性能问题会导致资源浪费（如重试、超时），先解决性能问题往往能顺带降低资源消耗
2. **监控先行**：没有完善的监控（P99 延迟、GC 耗时、缓存命中率），优化就是盲人摸象
3. **渐进式调整**：每次只改一个变量，观察 1-2 天再继续。同时修改多个参数导致问题无法定位
4. **自动化持续优化**：将 VPA 推荐、成本分析、Right-Sizing 建议集成到 CI/CD 流程中，实现持续优化

---

> **本章总结：** TKE 性能优化与成本控制是一个从应用到集群、从技术到管理的系统工程。应用层关注 JVM 容器适配和中间件调优，集群层关注内核参数和存储选型，成本控制层关注资源利用率和计费模式选择。三者相互关联：性能优化降低资源消耗，资源消耗降低带来成本节省，成本节省又为性能预留更多空间。建议读者根据自身业务阶段，按"先应用、再集群、后成本"的顺序逐步推进。
