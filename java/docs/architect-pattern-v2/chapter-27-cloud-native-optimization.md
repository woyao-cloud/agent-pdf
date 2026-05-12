# 第27章 云原生优化策略

基于第 26 章的风险分析，本章提供系统化的优化策略。

---

## 27.1 多云策略

```java
// 多云的三个层次：

// Level 1: 基础设施级多云（最低成本）
//  在多个云上运行相同的 K8s 集群，应用不感知
//  应用 → K8s API（统一的抽象）→ 各家云的 K8s 服务

// Level 2: 平台级多云
//  使用跨云的 PaaS（如 K8s + Crossplane 提供跨云的 RDS/S3/Redis）
//  应用 → Crossplane 声明式 API → 各家云的托管服务
//  代价：只能用所有云都有的"最小公倍数"功能集合

// Level 3: 应用级多云（最昂贵）
//  应用感知多云——为每个云写适配层
//  代价：维护 N 套云适配器 → 只在"必须避免供应商锁定"的场景值得
```

---

## 27.2 成本优化

```yaml
# K8s 资源优化：

# 1. 垂直伸缩 —— 设置合理的 requests/limits
# 先不做任何设置，让 Vertical Pod Autoscaler 观察推荐
# VPA 会建议：requests 应为实际使用量的 1.1x

# 2. 水平伸缩 —— 基于实际负载自动调节副本数
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service
spec:
  scaleTargetRef:
    name: order-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60    # CPU > 60% → 扩容
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 70

# 3. Cluster Autoscaler / Karpenter
# 当 Pod pending 时自动加节点，空闲节点被回收
# 配合 Spot Instance ~70% 成本降低
```

---

## 27.3 性能优化

```java
// 云原生 Java 应用的性能调优清单：

// 1. JVM 内存自适应容器限制
// -XX:MaxRAMPercentage=75.0  ← 不是 -Xmx 固定值
// JVM 自动根据容器的 memory.limit 调整最大堆

// 2. 使用现代化的 GC（ZGC / Shenandoah）
// -XX:+UseZGC  ← 亚毫秒级的 GC 暂停，适合低延迟 API

// 3. CDS (Class Data Sharing) + AppCDS
// 多个 JVM 实例共享相同的类元数据 → 节省内存 + 加速启动

// 4. Spring Boot 3.x AOT (Ahead-of-Time) compilation
// 构建时生成代理类/反射元数据 → 减少运行时反射 → 加速启动 20-40%

// 5. 连接池预热
@Configuration
public class WarmupConfig implements ApplicationRunner {
    public void run(ApplicationArguments args) {
        // 在 readinessProbe 标记 Ready 前预热连接池
        // 避免"刚 Ready 的前几个请求超时"
    }
}
```

---

## 27.4 安全加固

```yaml
# Pod 安全最佳实践
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
  containers:
    - name: app
      securityContext:
        readOnlyRootFilesystem: true    # 只读文件系统
        allowPrivilegeEscalation: false # 禁止提权
        capabilities:
          drop:
            - ALL                        # 移除所有 capabilities
      volumeMounts:
        - name: tmp
          mountPath: /tmp               # 只有 /tmp 可写
```

```yaml
# NetworkPolicy —— 零信任网络
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: order-service-policy
spec:
  podSelector:
    matchLabels:
      app: order-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway      # 只接受来自 API Gateway 的流量
      ports:
        - port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: payment-service  # 只能访问支付服务
      ports:
        - port: 8080
    - to:
        - podSelector:
            matchLabels:
              app: inventory-service # 只能访问库存服务
    # 访问任何其他 Pod 的流量被默认拒绝
```

---

## 27.5 本章小结

云原生优化的四个方向形成一个优先级链：
1. **安全性最先**：Pod 安全策略、NetworkPolicy、最小权限——这是底线
2. **成本紧随其后**：自动伸缩(HPA/VPA) + Spot Instance + 非生产环境定时关停
3. **性能在需要时**：JVM 调优、AOT 编译、连接池预热——在监控数据证明需要时才深入优化
4. **多云在合理范围内**：Level 1（基础设施可移植）是务实的；Level 3（应用级多云）只在极端需求下做

云原生篇（第22-27章）到此结束。
