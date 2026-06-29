# AWS EKS GitOps 实战：Argo CD 从入门到精通

> 从零搭建生产级 GitOps 流水线

## 书籍定位

本书面向中高级 DevOps 工程师、Kubernetes 开发者、SRE 和平台工程师，系统讲解在 AWS EKS 上使用 Argo CD 实现微服务 GitOps 流程的全栈实践。内容覆盖从 GitOps 基础理论到生产级多集群部署的完整知识体系。

## 整体结构

```
AWS EKS GitOps 实战：Argo CD 从入门到精通
├── 基础篇：GitOps 与 Argo CD 基础
│   ├── 第1章 GitOps 概述与核心原则
│   ├── 第2章 Argo CD 架构与核心概念
│   └── 第3章 EKS 集群准备与 Argo CD 安装
├── 核心篇：应用部署与配置管理
│   ├── 第4章 使用 Kustomize 管理应用配置
│   ├── 第5章 使用 Helm Chart 部署应用
│   ├── 第6章 多环境管理与 Promotion
│   └── 第7章 Secrets 管理与外部密钥集成
├── 实践篇：高级模式与生产运维
│   ├── 第8章 多集群管理与 Hub-Spoke 模式
│   ├── 第9章 监控、告警与可观测性
│   ├── 第10章 RBAC 与多团队权限管理
│   └── 第11章 典型问题排查指南
└── 进阶篇：CI/CD 集成与技能体系
    ├── 第12章 CI/CD 流水线集成（GitHub Actions + Argo CD）
    ├── 第13章 渐进式发布（Argo Rollouts + Flagger）
    ├── 第14章 开发人员必备技能体系
    └── 第15章 生产环境最佳实践与案例
```

## 章节列表

| 篇 | 章 | 标题 | 内容概要 |
|----|----|------|---------|
| 基础篇 | 1 | [GitOps 概述与核心原则](chapter-01-gitops-overview.md) | GitOps 定义、四大原则、vs 传统 CI/CD、优势与挑战 |
| 基础篇 | 2 | [Argo CD 架构与核心概念](chapter-02-argocd-arch.md) | 架构组件、Application/AppProject/ApplicationSet、同步机制 |
| 基础篇 | 3 | [EKS 集群准备与 Argo CD 安装](chapter-03-eks-setup.md) | EKS 创建、IAM/IRSA、Helm 安装、CLI 配置 |
| 核心篇 | 4 | [Kustomize 管理应用配置](chapter-04-kustomize.md) | Kustomize 基础、环境差异化、Argo CD 集成 |
| 核心篇 | 5 | [Helm Chart 部署应用](chapter-05-helm.md) | Helm 基础、Argo CD 集成、Chart 仓库管理 |
| 核心篇 | 6 | [多环境管理与 Promotion](chapter-06-multi-env.md) | 分支策略、目录结构、Promotion、ApplicationSet |
| 核心篇 | 7 | [Secrets 管理](chapter-07-secrets.md) | External Secrets Operator、Sealed Secrets、SOPS |
| 实践篇 | 8 | [多集群管理](chapter-08-multi-cluster.md) | Hub-Spoke 架构、Cluster Generator、跨集群部署 |
| 实践篇 | 9 | [监控告警与可观测性](chapter-09-monitoring.md) | Prometheus 指标、通知、Grafana 仪表盘 |
| 实践篇 | 10 | [RBAC 与多团队权限](chapter-10-rbac.md) | RBAC 模型、AppProject、SSO 集成 |
| 实践篇 | 11 | [典型问题排查指南](chapter-11-troubleshooting.md) | 同步/连接/部署/性能/权限问题 |
| 进阶篇 | 12 | [CI/CD 流水线集成](chapter-12-cicd.md) | GitHub Actions、Image Updater、PR 预览环境 |
| 进阶篇 | 13 | [渐进式发布](chapter-13-rollouts.md) | Argo Rollouts、金丝雀/蓝绿、自动回滚 |
| 进阶篇 | 14 | [开发人员技能体系](chapter-14-skills.md) | K8s/GitOps/Argo CD/AWS/CI/CD 技能 |
| 进阶篇 | 15 | [生产环境最佳实践](chapter-15-best-practices.md) | 高可用、灾备、成本优化、安全加固、综合案例 |

## 每章内容模板

每章包含以下核心模块：

| 模块 | 内容 |
|------|------|
| **解决的问题** | 该章节要解决的核心问题 |
| **核心原理** | 核心概念讲解、关键机制分析 |
| **代码/配置实现** | YAML/Shell 示例、最佳实践 |
| **使用场景** | 适用场景分析、典型业务案例 |
| **潜在风险与注意事项** | 性能问题分析、常见错误与坑、架构陷阱 |
| **本章小结** | 核心要点回顾 |

## 代码示例

所有代码示例位于 `demos/` 目录下，按章节组织：

- `demos/ch03-setup/` — EKS 集群创建与 Argo CD 安装
- `demos/ch04-kustomize/` — Kustomize 配置示例
- `demos/ch05-helm/` — Helm Chart 示例
- `demos/ch06-multi-env/` — 多环境配置
- `demos/ch07-secrets/` — Secrets 管理配置
- `demos/ch08-multi-cluster/` — 多集群配置
- `demos/ch09-monitoring/` — 监控告警配置
- `demos/ch10-rbac/` — RBAC 配置
- `demos/ch12-cicd/` — GitHub Actions 流水线
- `demos/ch13-rollouts/` — Argo Rollouts 配置

## 阅读建议

1. **基础篇（第1-3章）**：建立 GitOps 理论基础，适合所有读者
2. **核心篇（第4-7章）**：掌握应用部署与配置管理，DevOps 工程师重点
3. **实践篇（第8-11章）**：高级模式与生产运维，SRE/平台工程师必读
4. **进阶篇（第12-15章）**：CI/CD 集成与技能体系，架构师必读

## 写作顺序

1. 基础篇（第1-3章）— 建立 GitOps 理论基础
2. 核心篇（第4-7章）— 掌握应用部署与配置管理
3. 实践篇（第8-11章）— 高级模式与生产运维
4. 进阶篇（第12-15章）— CI/CD 集成与技能体系
