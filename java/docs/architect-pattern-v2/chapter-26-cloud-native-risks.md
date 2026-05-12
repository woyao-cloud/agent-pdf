# 第26章 云原生潜在风险与问题

云原生架构不是银弹。它在带来弹性、敏捷和自动化的同时，也引入了一系列独特的风险。

---

## 26.1 供应商锁定

```java
// 风险：你的架构深度集成了特定云供应商的服务
// 迁移成本 = 架构重写的成本

// 轻度锁定（可接受）：
// - 用 EC2/K8s Worker —— 换云 = 在其他云上启动 K8s 节点
// - 用 RDS PostgreSQL —— 换云 = AWS DMS 迁移数据到 Cloud SQL

// 深度锁定（高成本）：
// - 用 DynamoDB + DAX + DynamoDB Streams —— 换云 = 重写数据层
// - 用 AWS Lambda + Step Functions + SQS + SNS + EventBridge
//   → 整个应用逻辑绑定在 AWS 服务上

// 缓解策略：
// 1. 在标准化的抽象层之上构建（如：用 Spring Cloud Stream 替代直接调用 SQS API）
// 2. 核心业务逻辑不依赖特定云 API
// 3. 选择可移植的开源替代方案（K8s > ECS，PostgreSQL > DynamoDB for OLTP）
```

---

## 26.2 安全性挑战

```
云原生引入的新攻击面：

1. 容器逃逸：恶意容器突破容器隔离访问宿主机
   → 缓解：非 root 运行、只读文件系统、securityContext 约束

2. 镜像供应链攻击：基础镜像被植入恶意代码
   → 缓解：私有镜像仓库 + 镜像签名 + 漏洞扫描(Trivy/Clair)

3. API Server 暴露：K8s API 是集群的控制中心
   → 缓解：RBAC 最小权限 + 网络隔离 + 审计日志

4. Secret 泄露：Git 中提交了 K8s Secret 的 base64 值
   → 缓解：External Secrets Operator + Vault + 加密 Git

5. 网络策略缺失：默认所有 Pod 可以互相通信
   → 缓解：NetworkPolicy 白名单规则
```

---

## 26.3 性能开销

```java
// 云原生栈的性能开销逐层叠加：

// 裸金属：                     基准 (100%)
// + VM 虚拟化：                 95% (~5% 开销)
// + 容器化：                    98%（几乎无开销）
// + 服务网格 (Envoy Sidecar)：   85%（15% 延迟/CPU 开销）
// + Serverless (FaaS)：          80%（冷启动 + 函数调用的额外开销）

// 累计开销可能达到 20-30%
// 对于 90% 的应用这不是问题（弹性伸缩带来的收益 > 性能开销）
// 但对于延迟敏感的金融交易系统，需要考虑"减少层数"
```

---

## 26.4 成本管理

```java
// 云原生最大的隐性风险：成本失去控制

// 典型案例：
// - "自动扩展很好" → 一个 bug 导致无限扩展 → 月账单 $50,000
// - "为每个环境建一个 K8s 集群" → 测试环境 24/7 运行 → 70% 的云费用花在非生产环境
// - "用托管服务方便" → RDS + ElastiCache + MSK + OpenSearch → 服务费 > 计算费

// 成本优化清单：
// 1. 设置预算告警和自动支出上限
// 2. 非生产环境工作时间外自动缩容到零
// 3. 合理设置资源 requests/limits（过高 = 浪费，过低 = OOM Kill）
// 4. 使用 Spot Instance / 预留实例（40-70% 折扣）
// 5. 定期审查未使用的资源（僵尸 EBS Volume、闲置 Load Balancer）
```

---

## 26.5 技能要求

```
云原生开发需要团队同时具备以下技能：
  - 容器化（Docker）
  - K8s（30+ 资源类型）
  - 服务网格（Istio/Envoy）
  - 监控（Prometheus + Grafana）
  - 日志（Loki / ELK）
  - 追踪（Jaeger）
  - CI/CD（ArgoCD / Tekton）
  - 安全（OAuth2 / mTLS / RBAC / NetworkPolicy）
  - 基础设施即代码（Terraform / Crossplane）

对比：
  单体架构：Spring Boot + MySQL + Linux → 3 项技能
  云原生：10+ 项技能 → 招聘/培训成本显著增加
```

---

## 26.6 本章小结

云原生的风险矩阵可以概括为一个 2×2：**技术风险**（供应商锁定、安全攻击面、性能开销）和**组织风险**（成本失控、技能缺口、运维复杂度）。

云原生不是"越云越好"——它是**在组织规模和系统复杂度达到一定阈值后，云原生的收益开始超过它的风险**。这个阈值通常落在：团队 > 20 人、服务 > 10 个、需要频繁且独立部署。
