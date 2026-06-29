# AWS EKS GitOps 实战：Helm + Skaffold + Python 自动化

> 从本地开发到生产部署的全链路 GitOps 实践

## 书籍定位

本书面向中高级 DevOps 工程师、Kubernetes 开发者、SRE 和 Python 开发者，系统讲解如何使用 Helm + Skaffold + Python 三件套在 AWS EKS 上实现 GitOps 流程。内容覆盖从本地开发到生产部署的全链路实践。

## 整体结构

```
AWS EKS GitOps 实战：Helm + Skaffold + Python 自动化
├── 基础篇：工具链与 GitOps 基础
│   ├── 第1章 GitOps 与工具链概述
│   ├── 第2章 Helm 包管理深入
│   ├── 第3章 Skaffold 持续开发与部署
│   └── 第4章 Python 自动化脚本基础
├── 核心篇：EKS 集群与 CI/CD 流水线
│   ├── 第5章 EKS 集群与基础设施即代码
│   ├── 第6章 Skaffold + Helm 构建部署流水线
│   ├── 第7章 Python 脚本实现 GitOps 自动化
│   └── 第8章 多环境管理与 Promotion
├── 实践篇：高级模式与生产运维
│   ├── 第9章 Secrets 管理与安全集成
│   ├── 第10章 监控、日志与可观测性
│   ├── 第11章 渐进式发布与流量管理
│   └── 第12章 典型问题排查指南
└── 进阶篇：CI/CD 集成与技能体系
    ├── 第13章 CI/CD 流水线集成（GitHub Actions + Skaffold）
    ├── 第14章 开发人员必备技能体系
    └── 第15章 生产环境最佳实践与综合案例
```

## 章节列表

| 篇 | 章 | 标题 | 内容概要 |
|----|----|------|---------|
| 基础篇 | 1 | [GitOps 与工具链概述](chapter-01-toolchain-overview.md) | GitOps 原则、Helm/Skaffold/Python 分工、vs Argo CD |
| 基础篇 | 2 | [Helm 包管理深入](chapter-02-helm-deep.md) | Chart 结构、模板函数、依赖管理、OCI 仓库 |
| 基础篇 | 3 | [Skaffold 持续开发与部署](chapter-03-skaffold.md) | 架构、skaffold.yaml、构建/部署模块、热重载 |
| 基础篇 | 4 | [Python 自动化脚本基础](chapter-04-python.md) | k8s-client、boto3、PyYAML、子进程调用 |
| 核心篇 | 5 | [EKS 集群与 IaC](chapter-05-eks-iac.md) | Terraform 创建 EKS、ECR、Python 管理集群 |
| 核心篇 | 6 | [Skaffold + Helm 流水线](chapter-06-skaffold-helm.md) | 项目结构、多环境配置、本地/CI 工作流 |
| 核心篇 | 7 | [Python GitOps 自动化](chapter-07-python-gitops.md) | GitPython、Values 更新、Promotion、健康检查 |
| 核心篇 | 8 | [多环境管理与 Promotion](chapter-08-multi-env.md) | 分支策略、Skaffold Profiles、Python Promotion |
| 实践篇 | 9 | [Secrets 管理与安全](chapter-09-secrets.md) | AWS Secrets Manager、Helm Secrets、SOPS |
| 实践篇 | 10 | [监控日志与可观测性](chapter-10-observability.md) | CloudWatch、Prometheus、Python 健康检查 |
| 实践篇 | 11 | [渐进式发布](chapter-11-rollouts.md) | Skaffold+Helm Rollout、Python 金丝雀/蓝绿 |
| 实践篇 | 12 | [典型问题排查指南](chapter-12-troubleshooting.md) | Skaffold/Helm/Python/EKS 问题排查 |
| 进阶篇 | 13 | [CI/CD 流水线集成](chapter-13-cicd.md) | GitHub Actions + Skaffold + Python |
| 进阶篇 | 14 | [开发人员技能体系](chapter-14-skills.md) | Helm/Skaffold/Python/AWS/CI/CD 技能 |
| 进阶篇 | 15 | [生产环境最佳实践](chapter-15-best-practices.md) | 项目结构、安全、性能、电商案例 |

## 每章内容模板

每章包含以下核心模块：

| 模块 | 内容 |
|------|------|
| **解决的问题** | 该章节要解决的核心问题 |
| **核心原理** | 核心概念讲解、关键机制分析 |
| **代码/配置实现** | YAML/Python/Shell 示例、最佳实践 |
| **使用场景** | 适用场景分析、典型业务案例 |
| **潜在风险与注意事项** | 性能问题分析、常见错误与坑、架构陷阱 |
| **本章小结** | 核心要点回顾 |

## 代码示例

所有代码示例位于 `demos/` 目录下，按章节组织：

- `demos/ch02-helm/` — Helm Chart 示例
- `demos/ch03-skaffold/` — Skaffold 配置示例
- `demos/ch04-python/` — Python 自动化脚本
- `demos/ch05-eks/` — Terraform EKS 配置
- `demos/ch06-pipeline/` — Skaffold + Helm 流水线
- `demos/ch07-gitops/` — Python GitOps 脚本
- `demos/ch08-env/` — 多环境配置
- `demos/ch09-secrets/` — Secrets 管理
- `demos/ch10-monitoring/` — 监控配置
- `demos/ch11-rollouts/` — 渐进式发布
- `demos/ch13-cicd/` — GitHub Actions 流水线

## 阅读建议

1. **基础篇（第1-4章）**：建立工具链基础，适合所有读者
2. **核心篇（第5-8章）**：掌握 EKS 与 CI/CD 流水线，DevOps 工程师重点
3. **实践篇（第9-12章）**：高级模式与生产运维，SRE 必读
4. **进阶篇（第13-15章）**：CI/CD 集成与技能体系，架构师必读

## 写作顺序

1. 基础篇（第1-4章）— 建立工具链基础
2. 核心篇（第5-8章）— 掌握 EKS 与 CI/CD 流水线
3. 实践篇（第9-12章）— 高级模式与生产运维
4. 进阶篇（第13-15章）— CI/CD 集成与技能体系
