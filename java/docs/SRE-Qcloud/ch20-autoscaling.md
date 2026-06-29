# 第20章 腾讯云弹性伸缩实战

## 20.1 弹性伸缩概述

弹性伸缩（Auto Scaling）是云原生架构中最核心的运维能力之一。它的目标很简单：**在业务低峰时缩减资源以控制成本，在业务高峰时快速扩容以保障可用性**。但在腾讯云的实际生产环境中，这个"简单"的目标涉及多个维度的伸缩机制——CVM 层面的伸缩组、TKE 集群中的 HPA/VPA/CA、以及定时与指标驱动的混合策略。

本章从工程实战角度出发，覆盖以下内容：

- **CVM 伸缩组**：基于自定义镜像和启动配置的经典伸缩方案
- **TKE HPA（Horizontal Pod Autoscaler）**：基于 CPU/内存/自定义指标的 Pod 副本数动态调整
- **TKE VPA（Vertical Pod Autoscaler）**：自动调整 Pod 的 Request/Limit
- **TKE CA（Cluster Autoscaler）**：集群节点级别的自动扩缩容
- **CronHPA**：腾讯云 TKE 扩展的定时伸缩组件
- **冷启动优化**：针对弹性伸缩场景下的启动延迟问题

## 20.2 CVM 弹性伸缩组

### 20.2.1 基本概念

CVM 弹性伸缩组（Auto Scaling Group, ASG）是腾讯云最基础的弹性伸缩产品。它围绕三个核心概念构建：

- **启动配置（Launch Configuration）**：定义伸缩组中新增 CVM 实例的规格，包括镜像、机型、云盘、安全组、带宽等
- **伸缩组（Scaling Group）**：管理一组同质 CVM 实例的逻辑集合，绑定启动配置、负载均衡、网络等
- **伸缩策略（Scaling Policy）**：触发伸缩动作的规则，包括定时策略和告警策略

### 20.2.2 启动配置的最佳实践

启动配置决定了扩容出来的机器是什么样子。以下是生产环境中的关键建议：

**1. 使用自定义镜像而非公共镜像**

```bash
# 基于现有实例创建自定义镜像
cloud-image create --instance-id ins-xxxxx --image-name prod-base-2024-01
```

自定义镜像应预装所有基础组件：JDK/Python/Node 运行时、监控 Agent（云监控 BaradAgent）、日志采集 Agent（CLS）、堡垒机 Agent、健康检查脚本等。这样扩容出来的实例无需额外初始化即可接入流量。

**2. 使用 UserData 做差异化配置**

对于无法固化到镜像中的配置（如环境标签、集群地址），通过 UserData 脚本注入：

```bash
#!/bin/bash
# 写入实例标签
echo "ENV=production" >> /etc/environment
echo "CLUSTER=asg-prod-01" >> /etc/environment
# 注册到 CMDB
curl -X POST http://cmdb.internal/register \
  -d "ip=$(hostname -I)&group=web-asg"
```

**3. 绑定 CLB（负载均衡）**

伸缩组必须绑定 CLB，新扩容的实例自动注册到 CLB 后端，缩容时自动摘除。注意设置合理的健康检查间隔（建议 5s）和不健康阈值（建议 3 次），以加快异常实例的替换。

### 20.2.3 伸缩策略配置

腾讯云 ASG 支持两种策略类型：

**定时策略（Scheduled Policy）**

适用于可预测的流量波动，如电商大促、日报计算任务：

```
名称: scale-up-promotion
执行时间: 2024-11-10 08:00:00
操作: 增加 20 台实例
重复周期: 仅一次（大促专用）
```

```
名称: scale-down-nightly
执行时间: 每天 02:00
操作: 调整到 5 台实例
重复周期: 每天
```

**告警策略（Alarm Policy）**

基于云监控指标自动触发：

| 指标 | 阈值 | 持续周期 | 操作 |
|------|------|----------|------|
| CPU 利用率 | > 75% | 3 个周期（5 分钟/周期） | 增加 3 台 |
| CPU 利用率 | < 30% | 5 个周期 | 减少 1 台 |
| 入带宽 | > 500 Mbps | 2 个周期 | 增加 5 台 |

**冷却时间（Cooldown Period）**

每次伸缩动作完成后进入冷却时间（默认 300 秒），期间不会触发新的伸缩活动。这是防止"抖动"的关键机制——如果扩容后指标短暂下降又回升，冷却时间可以避免频繁扩缩。

### 20.2.4 缩容保护

生产环境必须开启**缩容保护**，防止正在处理请求的实例被突然销毁：

```json
{
  "AutoScalingGroupId": "asg-xxxxx",
  "InstanceIds": ["ins-a", "ins-b"],
  "ProtectedFromScaleIn": true
}
```

配合 CLB 的**连接耗尽（Connection Draining）** 功能，缩容时先摘除流量，等待现有连接处理完毕（默认 300s），再销毁实例。

## 20.3 TKE 弹性伸缩体系

TKE（Tencent Kubernetes Engine）提供了三层弹性伸缩能力，从内到外分别是 HPA、VPA 和 CA。理解这三层的关系和适用场景是设计生产级弹性伸缩方案的前提。

### 20.3.1 HPA（Horizontal Pod Autoscaler）

HPA 是 Kubernetes 原生的水平伸缩机制，根据 Pod 的 CPU、内存或自定义指标自动调整 Deployment/StatefulSet 的副本数。

#### 20.3.1.1 工作原理

HPA 控制循环默认每 15 秒从 Metrics Server 拉取指标，计算期望副本数：

```
期望副本数 = ceil(当前副本数 × (当前指标值 / 目标指标值))
```

例如：当前 4 个 Pod，平均 CPU 利用率 80%，目标 50%：

```
期望副本数 = ceil(4 × (80% / 50%)) = ceil(6.4) = 7
```

#### 20.3.1.2 生产级 HPA 配置

以下是一个完整的 HPA YAML，适用于生产环境的 Web 服务：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-server-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: 500
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
```

**关键参数说明：**

- **stabilizationWindowSeconds**：缩容稳定窗口设为 300 秒，避免流量短暂波动导致频繁缩容；扩容设为 0，追求快速响应
- **scaleUp policies**：支持每 15 秒最多翻倍（Percent: 100）或增加 4 个 Pod，取两者中的最大值（selectPolicy: Max）
- **scaleDown policies**：每 60 秒最多缩容 10%，防止一次缩掉太多 Pod 造成服务抖动
- **多指标联合**：HPA 取所有指标中计算出的最大副本数，确保任一指标超标都能触发扩容

#### 20.3.1.3 自定义指标扩缩容

对于非 CPU/内存密集型应用（如消息队列消费者、API 网关），基于业务指标伸缩更准确。腾讯云 TKE 支持通过 Prometheus 适配器对接自定义指标：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: consumer-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: message-consumer
  minReplicas: 2
  maxReplicas: 30
  metrics:
    - type: Object
      object:
        metric:
          name: rabbitmq_queue_messages
        describedObject:
          apiVersion: v1
          kind: Service
          name: rabbitmq-metrics
        target:
          type: Value
          value: "1000"
```

这个配置的含义：当 RabbitMQ 队列积压超过 1000 条消息时扩容消费者 Pod，积压消化后自动缩容。

### 20.3.2 VPA（Vertical Pod Autoscaler）

VPA 自动调整 Pod 的 CPU/内存 Request 和 Limit，解决"不知道给 Pod 配多少资源"的难题。

#### 20.3.2.1 VPA 模式

VPA 有三种运行模式：

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| Auto | 自动调整并重启 Pod | 无状态服务，可接受重启 |
| Initial | 只在创建时设置推荐值 | 新建应用，无历史数据 |
| Off | 仅生成推荐，不自动调整 | 先观察推荐值，人工审核后调整 |

#### 20.3.2.2 VPA 配置示例

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: recommendation-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: recommendation-engine
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: "*"
        minAllowed:
          cpu: "500m"
          memory: "512Mi"
        maxAllowed:
          cpu: "8"
          memory: "16Gi"
        controlledResources: ["cpu", "memory"]
```

#### 20.3.2.3 VPA 与 HPA 的冲突

**重要警告**：VPA 和 HPA 不能同时作用于同一组 Pod 的同一类资源（CPU/内存）。如果 HPA 基于 CPU 利用率伸缩，VPA 也在调整 CPU Request，两者会互相干扰——VPA 提高 Request 导致利用率下降，HPA 因此缩容，VPA 又降低 Request，形成震荡。

**推荐方案**：
- HPA 基于自定义指标（QPS、连接数），VPA 调整 CPU/内存 → 可以共存
- 或者：HPA 负责水平伸缩，VPA 仅以 `Off` 模式提供推荐值，人工审核后手动调整

### 20.3.3 CA（Cluster Autoscaler）

当 HPA 扩容出来的 Pod 因集群资源不足而 Pending 时，CA 负责自动扩容底层 CVM 节点。

#### 20.3.3.1 CA 工作原理

CA 定期（默认 10 秒）检查集群中是否有 Pending Pod，如果有且原因是资源不足，则触发节点池扩容。缩容时，CA 会检查哪些节点利用率低且其上的 Pod 可以被调度到其他节点。

#### 20.3.3.2 节点池配置

在 TKE 中，CA 通过节点池（Node Pool）管理伸缩：

```yaml
# 通过 TKE API 创建节点池的等效配置
{
  "ClusterId": "cls-xxxxx",
  "NodePoolName": "np-gpu-a100",
  "NodeGroupType": "GPU",
  "InstanceType": "GN10Xp.2XLARGE64",
  "SystemDisk": {
    "DiskType": "CLOUD_SSD",
    "DiskSize": 100
  },
  "DataDisks": [
    {
      "DiskType": "CLOUD_PREMIUM",
      "DiskSize": 200
    }
  ],
  "InternetAccessible": {
    "InternetMaxBandwidthOut": 10
  },
  "Labels": {
    "node-type": "gpu-compute"
  },
  "Taints": [
    {
      "Key": "gpu",
      "Value": "true",
      "Effect": "NoSchedule"
    }
  ],
  "AutoScaling": {
    "MinSize": 0,
    "MaxSize": 20,
    "ScaleDownDelay": 600
  }
}
```

**生产建议：**

1. **多节点池设计**：按业务类型划分节点池，如 `np-web`（通用型实例）、`np-gpu`（GPU 实例）、`np-spot`（竞价实例）
2. **设置 MinSize=0**：允许节点池完全缩容到零，节省成本
3. **ScaleDownDelay**：节点缩容延迟设为 600 秒以上，给 Pod 优雅退出留足时间
4. **Taint + Toleration**：GPU 节点打上污点，只有带对应容忍的 Pod 才能调度上去

#### 20.3.3.3 竞价实例与 CA

腾讯云竞价实例（Spot Instance）价格约为按量计费的 10%-20%，非常适合 CA 管理的弹性节点。配置方式：

```yaml
# 节点池中指定竞价实例
"InstanceChargeType": "SPOTPAID",
"SpotSettings": {
  "MaxPrice": "2.00",
  "InterruptionProtection": false
}
```

注意：竞价实例可能被系统回收（回收前 5 分钟有告警），需要在 Pod 层面做好优雅退出和中断处理。

### 20.3.4 CronHPA

CronHPA 是腾讯云 TKE 对 Kubernetes 生态的扩展，解决了 HPA 无法应对"突发流量洪峰"的问题——HPA 需要等指标上升后才扩容，而 CronHPA 可以在预期流量到达前提前扩容。

#### 20.3.4.1 CronHPA 配置

```yaml
apiVersion: autoscaling.tkestack.io/v1
kind: CronHPA
metadata:
  name: web-cronhpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  crons:
    - schedule: "30 07 * * *"
      targetReplicas: 20
      description: "早高峰 7:30 前扩容到 20 副本"
    - schedule: "0 10 * * *"
      targetReplicas: 5
      description: "上午 10 点后缩容到 5 副本"
    - schedule: "0 19 * * *"
      targetReplicas: 15
      description: "晚高峰 19 点扩容到 15 副本"
    - schedule: "0 23 * * *"
      targetReplicas: 3
      description: "夜间缩容到 3 副本保底"
```

#### 20.3.4.2 CronHPA + HPA 联动

CronHPA 和 HPA 可以共存。典型策略是：CronHPA 提前扩容到预期水位，HPA 在此基础上做微调：

```
时间线：
08:00 CronHPA 将副本数设为 20（预期早高峰）
08:15 实际流量低于预期，HPA 自动缩到 16
08:30 流量突然飙升，HPA 自动扩到 25
09:00 流量回落，HPA 缩回 18
10:00 CronHPA 将副本数设为 5（预期早高峰结束）
```

CronHPA 的优先级高于 HPA——当 CronHPA 执行时，它会直接修改 Deployment 的 replicas，HPA 随后根据实际指标重新调整。

## 20.4 弹性伸缩策略设计

### 20.4.1 多级伸缩架构

生产环境推荐采用"三级伸缩"架构：

```
第一级：CronHPA（定时）
  → 提前扩容，应对可预测流量
  ↓
第二级：HPA（指标驱动）
  → 实时调整，应对实际负载变化
  ↓
第三级：CA（集群级）
  → 资源不足时扩容节点
```

每一级都是下一级的"安全网"：CronHPA 不准时 HPA 兜底，HPA 资源不够时 CA 兜底。

### 20.4.2 伸缩指标选择指南

| 应用类型 | 推荐指标 | 说明 |
|----------|----------|------|
| Web 服务 | QPS、CPU 利用率 | QPS 更直接反映业务负载 |
| 消息消费者 | 队列深度、处理延迟 | 队列积压是明确的扩容信号 |
| 批处理任务 | 任务积压数 | 按任务队列长度线性伸缩 |
| GPU 推理 | GPU 利用率、推理请求数 | GPU 利用率比 CPU 更关键 |
| 缓存服务 | 内存利用率、命中率 | 内存型服务关注内存水位 |

### 20.4.3 伸缩安全边界

```yaml
# 全局伸缩约束
minReplicas: 3   # 最小保底，防止缩到零导致服务不可用
maxReplicas: 100 # 最大上限，防止无限扩容打爆预算

# 节点池约束
minSize: 0   # 允许缩到零
maxSize: 50  # 单节点池上限
```

**成本控制建议**：
- 设置每日/每月资源预算告警
- 大促场景使用定时策略提前锁定最大上限
- 非生产环境设置更严格的上限

## 20.5 冷启动优化

冷启动（Cold Start）是弹性伸缩中最棘手的性能问题之一。从触发扩容到 Pod 真正开始处理请求，中间经历多个阶段：

```
触发扩容 → 镜像拉取 → 容器创建 → 应用启动 → 健康检查 → 接入流量
```

在极端情况下，整个过程可能耗时 3-5 分钟。以下是针对每个阶段的优化方案。

### 20.5.1 镜像层优化

**1. 镜像分层与缓存**

```dockerfile
# 基础层：操作系统 + 运行时（变化频率最低）
FROM tencentyun/tlinux:3.1 AS base
RUN yum install -y java-11-openjdk

# 依赖层：应用依赖（变化频率中等）
FROM base AS deps
COPY gradle/ gradle/
COPY build.gradle.kts .
RUN gradle downloadDependencies

# 应用层：业务代码（变化最频繁）
FROM deps AS app
COPY build/libs/app.jar .
CMD ["java", "-jar", "app.jar"]
```

这样分层后，只有变化的部分需要重新拉取。在 TKE 中，节点上已有缓存层时，只需拉取增量层。

**2. 使用 P2P 镜像分发**

对于大规模集群，镜像拉取是冷启动的主要瓶颈。腾讯云 TCR（Tencent Container Registry）支持 P2P 加速：

```yaml
# 在 TCR 中启用 P2P 加速
tcr:
  p2p:
    enabled: true
    maxPeers: 50
    seeders: 3
```

P2P 分发将镜像拉取从"中心化下载"变为"节点间互传"，大规模扩容时效果显著。

**3. 预热 Sidecar 容器**

对于 Istio 等服务网格场景，Sidecar 的启动时间不可忽视。使用 TKE 的**镜像预热**功能，提前在节点上缓存常用镜像：

```bash
# 通过 TKE API 预热镜像
tke prewarm-image \
  --image ccr.ccs.tencentyun.com/prod/web-server:latest \
  --node-pool np-web \
  --nodes 5
```

### 20.5.2 应用层优化

**1. 延迟初始化**

将非关键初始化（如定时任务、后台同步）放到应用启动之后异步执行：

```java
@SpringBootApplication
public class WebApplication {
    public static void main(String[] args) {
        // 先完成核心初始化
        SpringApplication app = new SpringApplication(WebApplication.class);
        app.setLazyInitialization(true); // 延迟 Bean 初始化
        ConfigurableApplicationContext ctx = app.run(args);

        // 后台异步加载非关键组件
        new Thread(() -> {
            ctx.getBean(ReportGenerator.class).init();
            ctx.getBean(CacheWarmer.class).warmUp();
        }).start();
    }
}
```

**2. 启动探针优化**

Kubernetes 的 startupProbe 是解决慢启动的关键：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-server
spec:
  template:
    spec:
      containers:
        - name: app
          image: web-server:latest
          startupProbe:
            httpGet:
              path: /health/startup
              port: 8080
            initialDelaySeconds: 0
            periodSeconds: 2
            failureThreshold: 60  # 最多等待 120 秒
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            periodSeconds: 5
            successThreshold: 2  # 连续 2 次成功才算就绪
```

三层探针的分工：
- **startupProbe**：给慢启动应用留足初始化时间，期间不执行 liveness 检查
- **livenessProbe**：检测应用是否存活，死锁时重启
- **readinessProbe**：检测应用是否就绪，未就绪时从 CLB 摘除流量

**3. JVM 冷启动优化**

Java 应用的冷启动是业界难题。以下方案可显著改善：

```yaml
# 使用 CRaC（Coordinated Restore at Checkpoint）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: java-app
spec:
  template:
    spec:
      containers:
        - name: app
          image: java-app:with-crac
          env:
            - name: SPRING_JVM_ARGS
              value: >
                -XX:CRaCCheckpointTo=/crac-checkpoint
                -XX:+UseZGC
                -Xms256m
                -Xmx2g
```

CRaC 技术将应用启动后的 JVM 状态保存为快照，新 Pod 直接从快照恢复，启动时间从 30 秒降至 1-2 秒。

### 20.5.3 网络层优化

**1. CLB 预热**

对于大促场景，CLB 本身也需要预热。腾讯云 CLB 有连接数上限，需要提前提交工单申请提升配额：

```bash
# 通过 TKE 控制台或 API 预热 CLB
tke prewarm-clb \
  --clb-id lb-xxxxx \
  --expected-qps 50000 \
  --expected-connections 100000
```

**2. 使用 ENI 直连**

TKE 的 VPC-CNI 模式比传统网桥模式减少一层网络转发，Pod 启动后网络就绪时间更短：

```yaml
# 在 TKE 集群中启用 VPC-CNI
apiVersion: vpc.tke.cloud.tencent.com/v1
kind: VpcCni
metadata:
  name: vpc-cni-config
spec:
  eniSubnetIds:
    - subnet-xxxxx
    - subnet-yyyyy
  eniNum: 2  # 每个节点预留 2 个 ENI
```

### 20.5.4 预扩容策略

对于已知的大流量事件（如秒杀、新品发布），不要等 HPA 自动扩容，而是提前扩容到位：

```yaml
# CronHPA 提前 30 分钟扩容
apiVersion: autoscaling.tkestack.io/v1
kind: CronHPA
metadata:
  name: flash-sale-cronhpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: flash-sale
  crons:
    - schedule: "30 09 * * *"   # 09:30 执行
      targetReplicas: 100       # 扩容到 100 副本
      description: "10 点秒杀前 30 分钟预扩容"
    - schedule: "0 10 * * *"    # 10:00 执行
      targetReplicas: 200       # 秒杀开始时再翻倍
      description: "秒杀开始，扩容到 200"
    - schedule: "30 10 * * *"   # 10:30 执行
      targetReplicas: 50        # 秒杀结束逐步缩容
      description: "秒杀结束，缩容到 50"
```

## 20.6 腾讯云弹性伸缩的监控与告警

### 20.6.1 关键监控指标

| 指标 | 来源 | 告警阈值 | 说明 |
|------|------|----------|------|
| 伸缩活动次数 | ASG | > 10 次/小时 | 频繁伸缩可能表示策略不合理 |
| 扩容失败次数 | ASG | > 0 | 检查启动配置和配额 |
| Pending Pod 数 | TKE | > 0 | 集群资源不足，CA 可能未正常工作 |
| HPA 当前/最大副本 | TKE | 接近 maxReplicas | 可能需要提高上限 |
| 节点利用率 | TKE | > 80% | 考虑扩容节点池 |
| 镜像拉取时间 | TKE | > 60s | 考虑 P2P 分发或镜像优化 |

### 20.6.2 告警配置示例

```yaml
# 通过云监控配置告警策略
{
  "AlarmName": "asg-scale-failure",
  "MonitorType": "ASG",
  "Condition": {
    "MetricName": "scale_failure_count",
    "Period": 60,
    "Threshold": 0,
    "ComparisonOperator": ">"
  },
  "Notice": {
    "NoticeType": "SMS",
    "Phone": "138xxxxx",
    "Interval": 300
  }
}
```

## 20.7 实战案例：电商大促弹性伸缩方案

### 20.7.1 业务背景

某电商平台预计双十一流量为日常的 10 倍，需要设计一套完整的弹性伸缩方案。

### 20.7.2 架构设计

```
                    ┌─────────────┐
                    │  CLB (预热)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
         │ Web     │ │ Web     │ │ Web     │
         │ ASG     │ │ ASG     │ │ ASG     │
         │ (CVM)   │ │ (TKE)   │ │ (TKE)   │
         └─────────┘ └─────────┘ └─────────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────┴──────┐
                    │  Redis/MQ   │
                    │  (固定规格)  │
                    └─────────────┘
```

### 20.7.3 伸缩策略矩阵

| 时间段 | 预期 QPS | Web 副本数 | 节点数 | 策略 |
|--------|----------|------------|--------|------|
| 11-09 00:00 | 5000 | 10 | 5 | 日常 |
| 11-10 08:00 | 20000 | 50 | 15 | CronHPA 预扩容 |
| 11-10 20:00 | 50000 | 100 | 30 | CronHPA + HPA |
| 11-11 00:00 | 80000 | 200 | 50 | 峰值，HPA 自动调整 |
| 11-11 10:00 | 30000 | 60 | 20 | 逐步回落 |
| 11-12 00:00 | 5000 | 10 | 5 | 恢复日常 |

### 20.7.4 完整配置清单

```yaml
# 1. 基础 Web 服务 HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  minReplicas: 10
  maxReplicas: 300
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 200
          periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 5
          periodSeconds: 60

---
# 2. 大促 CronHPA
apiVersion: autoscaling.tkestack.io/v1
kind: CronHPA
metadata:
  name: promotion-cronhpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-server
  crons:
    - schedule: "0 08 10 11 *"
      targetReplicas: 50
    - schedule: "0 20 10 11 *"
      targetReplicas: 100
    - schedule: "0 00 11 11 *"
      targetReplicas: 200
    - schedule: "0 10 11 11 *"
      targetReplicas: 100
    - schedule: "0 00 12 11 *"
      targetReplicas: 10

---
# 3. 节点池配置（通过 TKE API）
# 节点池 np-web-promotion
# MinSize: 5
# MaxSize: 100
# 实例规格: S5.4XLARGE64 (16C 32G)
# 镜像: tlinux3.1-docker
# 竞价实例: 是
```

## 20.8 常见问题与排错

### 20.8.1 HPA 不工作

**现象**：CPU 利用率很高，但 HPA 不扩容。

**排查步骤**：

```bash
# 1. 检查 HPA 状态
kubectl describe hpa web-server-hpa -n production

# 2. 检查 Metrics Server 是否正常
kubectl get pods -n kube-system | grep metrics-server
kubectl top pods -n production

# 3. 检查 Deployment 是否有 Resource Request
kubectl describe deployment web-server -n production
# 确认 containers[].resources.requests.cpu 已设置
```

**常见原因**：
- Deployment 未设置 Resource Request → HPA 无法计算利用率
- Metrics Server 未部署或异常 → HPA 无数据源
- HPA 的 `scaleTargetRef` 指向错误

### 20.8.2 CA 不扩容

**现象**：Pod Pending，但 CA 没有创建新节点。

**排查步骤**：

```bash
# 1. 检查 Pending Pod 的原因
kubectl describe pod pending-pod -n production
# 确认原因是 "Insufficient cpu" 或 "Insufficient memory"

# 2. 检查 CA 日志
kubectl logs -n kube-system deployment/cluster-autoscaler

# 3. 检查节点池配置
# 确认节点池的 MinSize/MaxSize 设置正确
# 确认实例类型在当前可用区有库存
```

**常见原因**：
- 节点池 MaxSize 已达上限
- 所选实例类型在当前可用区售罄
- Pod 的 PDB（PodDisruptionBudget）阻止了节点缩容
- 节点上有非 Deployment/StatefulSet 管理的 Pod，CA 无法安全缩容

### 20.8.3 伸缩震荡

**现象**：副本数频繁增减，服务不稳定。

**解决方案**：

```yaml
# 增加缩容稳定窗口
behavior:
  scaleDown:
    stabilizationWindowSeconds: 600  # 延长到 10 分钟
    policies:
      - type: Percent
        value: 5  # 降低单次缩容比例
        periodSeconds: 120
```

同时检查指标是否抖动过大，考虑使用滑动平均或更平滑的指标。

## 20.9 成本优化

### 20.9.1 竞价实例混合部署

将 Web 服务部署在"竞价实例 + 按量计费"混合节点池中：

```yaml
# 节点池混合策略
"MixedInstancesPolicy": {
  "SpotInstanceTypes": [
    "S5.4XLARGE64",
    "S5.8XLARGE64"
  ],
  "OnDemandInstanceTypes": ["S5.4XLARGE64"],
  "OnDemandBaseCapacity": 5,      # 保底 5 台按量计费
  "OnDemandPercentageAboveBase": 30  # 超出部分 30% 按量，70% 竞价
}
```

### 20.9.2 资源超卖

TKE 支持节点级别的资源超卖（Overcommit），提高资源利用率：

```yaml
# 在节点池中启用超卖
apiVersion: node.tke.cloud.tencent.com/v1
kind: NodePool
spec:
  overcommit:
    cpu: 1.5   # CPU 超卖比例 1.5 倍
    memory: 1.2  # 内存超卖比例 1.2 倍
```

注意：超卖适用于 CPU 密集型但非持续高负载的场景。内存超卖风险较高，建议不超过 1.2 倍。

### 20.9.3 缩容到零

对于非核心服务（如开发环境、定时任务），允许缩容到零：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: dev-job-hpa
  namespace: development
spec:
  minReplicas: 0  # 允许缩到零
  maxReplicas: 5
  metrics:
    - type: Pods
      pods:
        metric:
          name: job_queue_depth
        target:
          type: AverageValue
          averageValue: 10
```

配合节点池 `MinSize: 0`，非工作时间集群可以完全缩容，成本趋近于零。

## 20.10 总结与最佳实践

### 核心原则

1. **分层设计**：CronHPA 做预期伸缩，HPA 做实时调整，CA 兜底资源不足
2. **安全边界**：始终设置 min/max 副本数和节点数，防止无限伸缩
3. **冷启动优化**：镜像分层、P2P 分发、启动探针、预扩容，多管齐下
4. **成本控制**：竞价实例、资源超卖、缩容到零，按需组合

### 检查清单

- [ ] 所有 Deployment 设置了 Resource Request
- [ ] HPA 配置了合理的 minReplicas 和 maxReplicas
- [ ] 缩容稳定窗口已设置（建议 300-600 秒）
- [ ] 节点池 CA 已启用，MinSize/MaxSize 已配置
- [ ] 关键业务配置了 CronHPA 预扩容
- [ ] 镜像已分层优化，P2P 分发已启用
- [ ] 启动探针（startupProbe）已配置
- [ ] 竞价实例已配置中断处理机制
- [ ] 伸缩活动监控告警已配置
- [ ] 大促前已提交 CLB 预热工单

弹性伸缩不是"配置完就一劳永逸"的。它需要持续观察、调优——每次大促后复盘伸缩记录，调整策略参数，优化冷启动时间。只有经过反复迭代，才能达到"成本可控、弹性无损"的理想状态。
