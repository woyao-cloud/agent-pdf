# 腾讯云原生微服务：从开发到运维实战

> TKE · CNB · CLS · TCOP 全栈实践指南

## 书籍定位

本书面向中高级 Java/Go 后端开发工程师、DevOps 工程师、架构师和 SRE，系统讲解在腾讯云上开发、部署、维护 Kubernetes 微服务应用的全流程。内容聚焦腾讯云原生生态四大核心产品：TKE（容器服务）、CNB（云原生构建）、CLS（日志服务）、TCOP（云观测平台）。

## 整体结构

```
腾讯云原生微服务：从开发到运维实战
├── 基础篇：云原生与腾讯云基础
│   ├── 第1章 云原生微服务概述
│   ├── 第2章 腾讯云原生生态全景
│   └── 第3章 容器化与镜像构建
├── 核心篇：TKE 容器编排与调度
│   ├── 第4章 TKE 集群架构与网络
│   ├── 第5章 工作负载与资源管理
│   ├── 第6章 配置管理与密钥管理
│   └── 第7章 弹性伸缩与HPA
├── 实践篇：CI/CD 与可观测性
│   ├── 第8章 CNB 云原生构建与自动化发布
│   ├── 第9章 CLS 日志采集与分析
│   ├── 第10章 TCOP 监控与链路追踪
│   └── 第11章 灰度发布与流量管理
└── 进阶篇：生产保障与技能体系
    ├── 第12章 安全与合规
    ├── 第13章 性能优化与成本控制
    ├── 第14章 典型问题排查指南
    └── 第15章 开发人员必备技能体系
```

## 章节列表

| 篇 | 章 | 标题 | 内容概要 |
|----|----|------|---------|
| 基础篇 | 1 | [云原生微服务概述](chapter-01-overview.md) | 微服务演进、云原生定义、腾讯云方案解决的问题、潜在风险总览 |
| 基础篇 | 2 | [腾讯云原生生态全景](chapter-02-ecosystem.md) | TKE/CNB/CLS/TCOP 四大产品详解、服务网格/API网关/配置中心 |
| 基础篇 | 3 | [容器化与镜像构建](chapter-03-container.md) | Dockerfile最佳实践、Jib构建、TCR镜像仓库、镜像安全 |
| 核心篇 | 4 | [TKE集群架构与网络](chapter-04-tke-network.md) | 集群架构、VPC-CNI/GlobalRouter、Service/Ingress、NetworkPolicy |
| 核心篇 | 5 | [工作负载与资源管理](chapter-05-workload.md) | Deployment/StatefulSet、资源请求限制、Pod调度与亲和性 |
| 核心篇 | 6 | [配置管理与密钥管理](chapter-06-config.md) | ConfigMap/Secret、Helm Chart、腾讯云SSM凭据管理 |
| 核心篇 | 7 | [弹性伸缩与HPA](chapter-07-scaling.md) | HPA/VPA/CA/CronHPA、自定义指标伸缩、伸缩震荡防护 |
| 实践篇 | 8 | [CNB云原生构建与自动化发布](chapter-08-cnb.md) | 流水线架构、编译构建、自动部署、质量门禁、蓝绿/金丝雀发布 |
| 实践篇 | 9 | [CLS日志采集与分析](chapter-09-cls.md) | LogListener、日志结构化、检索分析、日志告警 |
| 实践篇 | 10 | [TCOP监控与链路追踪](chapter-10-tcop.md) | 指标监控、OpenTelemetry链路追踪、告警管理、服务拓扑 |
| 实践篇 | 11 | [灰度发布与流量管理](chapter-11-gray-release.md) | Ingress灰度、Istio流量路由、蓝绿/金丝雀/A-B测试 |
| 进阶篇 | 12 | [安全与合规](chapter-12-security.md) | 容器安全、网络安全、CAM/RBAC、数据安全 |
| 进阶篇 | 13 | [性能优化与成本控制](chapter-13-performance-cost.md) | JVM调优、集群优化、预留实例、混部超卖 |
| 进阶篇 | 14 | [典型问题排查指南](chapter-14-troubleshooting.md) | Pod故障、网络问题、性能问题、发布问题、日志监控问题 |
| 进阶篇 | 15 | [开发人员必备技能体系](chapter-15-skills.md) | 容器化/K8s/DevOps/可观测性/腾讯云平台技能 |

## 每章内容模板

每章包含以下核心模块：

| 模块 | 内容 |
|------|------|
| **解决的问题** | 该章节要解决的核心问题 |
| **核心原理** | 核心概念讲解、关键机制分析 |
| **代码/配置实现** | YAML/Java/Shell 示例、最佳实践 |
| **使用场景** | 适用场景分析、典型业务案例 |
| **潜在风险与注意事项** | 性能问题分析、常见错误与坑、架构陷阱 |
| **本章小结** | 核心要点回顾 |

## 代码示例

所有代码示例位于 `demos/` 目录下，按章节组织：

- `demos/ch03-container/` — Dockerfile 与镜像构建示例
- `demos/ch04-tke/` — TKE 集群配置 YAML
- `demos/ch05-workload/` — 工作负载配置示例
- `demos/ch06-config/` — ConfigMap/Secret/Helm 示例
- `demos/ch07-scaling/` — HPA 与弹性伸缩配置
- `demos/ch08-cnb/` — CNB 流水线配置
- `demos/ch09-cls/` — CLS 日志采集配置
- `demos/ch10-tcop/` — TCOP 监控与链路追踪配置
- `demos/ch11-gray/` — 灰度发布配置
- `demos/ch12-security/` — 安全配置示例
- `demos/ch14-troubleshooting/` — 问题排查脚本

## 阅读建议

1. **基础篇（第1-3章）**：建立云原生理论基础，适合所有读者
2. **核心篇（第4-7章）**：掌握 TKE 核心技术，K8s 开发者必读
3. **实践篇（第8-11章）**：CI/CD 与可观测性实战，DevOps 工程师重点
4. **进阶篇（第12-15章）**：生产保障与技能提升，架构师/SRE 必读

## 写作顺序

1. 基础篇（第1-3章）— 建立理论基础
2. 核心篇（第4-7章）— 掌握 TKE 核心技术
3. 实践篇（第8-11章）— CI/CD 与可观测性
4. 进阶篇（第12-15章）— 生产保障与技能
