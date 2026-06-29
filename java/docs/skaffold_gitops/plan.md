# AWS EKS GitOps 实战：Helm + Skaffold + Python 自动化

## 书籍定位

- **书名**: AWS EKS GitOps 实战：Helm + Skaffold + Python 自动化
- **副标题**: 从本地开发到生产部署的全链路 GitOps 实践
- **目标读者**: 中高级 DevOps 工程师、Kubernetes 开发者、SRE、Python 开发者
- **内容定位**: 理论+实操+排障，聚焦 Helm + Skaffold + Python 三件套实现 EKS GitOps

---

## 整体结构（四篇）

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

---

## 详细目录

### 第1篇：基础篇 — 工具链与 GitOps 基础

**第1章 GitOps 与工具链概述**
- 1.1 GitOps 核心原则回顾
- 1.2 工具链定位：Helm + Skaffold + Python 的分工
  - Helm：应用打包与配置管理
  - Skaffold：持续开发与部署流水线
  - Python：自动化编排与 GitOps 胶水代码
- 1.3 与传统 Argo CD GitOps 的对比
- 1.4 适用场景与局限性
- 1.5 潜在风险总览

**第2章 Helm 包管理深入**
- 2.1 Helm Chart 结构详解
- 2.2 模板函数与流水线
- 2.3 依赖管理与子 Chart
- 2.4 Values 覆盖策略
- 2.5 Helm Hooks 与生命周期
- 2.6 OCI 仓库与 Helm
- 2.7 潜在风险

**第3章 Skaffold 持续开发与部署**
- 3.1 Skaffold 架构与工作流
- 3.2 skaffold.yaml 配置详解
- 3.3 构建模块（Docker/Jib/Cloud Build）
- 3.4 部署模块（Helm/kubectl/kustomize）
- 3.5 文件监听与热重载
- 3.6 多环境配置（profiles）
- 3.7 与 CI/CD 集成
- 3.8 潜在风险

**第4章 Python 自动化脚本基础**
- 4.1 Python 与 Kubernetes API
- 4.2 kubernetes-client 库使用
- 4.3 boto3 AWS SDK 集成
- 4.4 PyYAML 配置处理
- 4.5 子进程调用 Helm/Skaffold
- 4.6 错误处理与重试机制
- 4.7 潜在风险

---

### 第2篇：核心篇 — EKS 集群与 CI/CD 流水线

**第5章 EKS 集群与基础设施即代码**
- 5.1 Terraform 创建 EKS 集群
- 5.2 节点组与 IAM 配置
- 5.3 VPC 与网络规划
- 5.4 ECR 镜像仓库配置
- 5.5 Python 脚本管理集群
- 5.6 潜在风险

**第6章 Skaffold + Helm 构建部署流水线**
- 6.1 项目结构设计
- 6.2 skaffold.yaml 多环境配置
- 6.3 Helm Chart 集成
- 6.4 本地开发工作流
- 6.5 CI/CD 工作流
- 6.6 镜像 Tag 策略
- 6.7 潜在风险

**第7章 Python 脚本实现 GitOps 自动化**
- 7.1 Git 仓库操作（GitPython）
- 7.2 自动更新 Helm Values
- 7.3 镜像 Tag 自动更新
- 7.4 环境 Promotion 脚本
- 7.5 健康检查与回滚脚本
- 7.6 定时同步与漂移检测
- 7.7 潜在风险

**第8章 多环境管理与 Promotion**
- 8.1 分支策略与目录结构
- 8.2 Skaffold Profiles 多环境
- 8.3 Python Promotion Pipeline
- 8.4 自动 Promotion 流程
- 8.5 手动 Promotion 与审批
- 8.6 潜在风险

---

### 第3篇：实践篇 — 高级模式与生产运维

**第9章 Secrets 管理与安全集成**
- 9.1 AWS Secrets Manager + Python
- 9.2 Helm Secrets + SOPS
- 9.3 Skaffold 与 Secrets 集成
- 9.4 Python 密钥轮转脚本
- 9.5 潜在风险

**第10章 监控、日志与可观测性**
- 10.1 CloudWatch 容器日志
- 10.2 Prometheus + Grafana 监控
- 10.3 Python 健康检查脚本
- 10.4 告警通知集成
- 10.5 潜在风险

**第11章 渐进式发布与流量管理**
- 11.1 Skaffold + Helm Rollout
- 11.2 Python 金丝雀发布脚本
- 11.3 蓝绿部署实现
- 11.4 自动回滚策略
- 11.5 潜在风险

**第12章 典型问题排查指南**
- 12.1 Skaffold 构建失败
- 12.2 Helm 部署失败
- 12.3 Python 脚本错误
- 12.4 EKS 集群问题
- 12.5 网络与权限问题

---

### 第4篇：进阶篇 — CI/CD 集成与技能体系

**第13章 CI/CD 流水线集成（GitHub Actions + Skaffold）**
- 13.1 GitHub Actions 流水线设计
- 13.2 Skaffold CI 模式
- 13.3 Python 脚本集成
- 13.4 镜像构建与推送
- 13.5 自动部署与验证
- 13.6 潜在风险

**第14章 开发人员必备技能体系**
- 14.1 Helm 技能
- 14.2 Skaffold 技能
- 14.3 Python 自动化技能
- 14.4 AWS/EKS 技能
- 14.5 CI/CD 技能
- 14.6 学习路线图

**第15章 生产环境最佳实践与综合案例**
- 15.1 项目结构最佳实践
- 15.2 安全最佳实践
- 15.3 性能优化
- 15.4 综合案例：电商平台 GitOps 实践
- 15.5 GitOps 成熟度模型

---

## 每章内容模板

```
## X.X 章节标题

### 解决的问题
- 该章节要解决的核心问题

### 核心原理
- 核心概念讲解
- 关键机制分析

### 代码/配置实现
- YAML/Python/Shell 示例
- 最佳实践

### 使用场景
- 适用场景分析
- 典型业务案例

### 潜在风险与注意事项
- 性能问题分析
- 常见错误与坑
- 架构陷阱

### 本章小结
- 核心要点回顾
```

---

## 输出格式

- 目录文件: `README.md`
- 各章内容: `chapter-XX-xxx.md`
- 代码示例: `demos/` 目录
- 格式: Markdown

---

## 写作顺序建议

1. 基础篇（第1-4章）— 建立工具链基础
2. 核心篇（第5-8章）— 掌握 EKS 与 CI/CD 流水线
3. 实践篇（第9-12章）— 高级模式与生产运维
4. 进阶篇（第13-15章）— CI/CD 集成与技能体系
