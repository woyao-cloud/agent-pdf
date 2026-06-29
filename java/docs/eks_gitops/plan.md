# AWS EKS GitOps 实战：Argo CD 从入门到精通

## 书籍定位

- **书名**: AWS EKS GitOps 实战：Argo CD 从入门到精通
- **副标题**: 从零搭建生产级 GitOps 流水线
- **目标读者**: 中高级 DevOps 工程师、Kubernetes 开发者、SRE、平台工程师
- **内容定位**: 理论+实操+排障，聚焦 AWS EKS + Argo CD 全栈 GitOps 实践

---

## 整体结构（四篇）

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

---

## 详细目录

### 第1篇：基础篇 — GitOps 与 Argo CD 基础

**第1章 GitOps 概述与核心原则**
- 1.1 什么是 GitOps
- 1.2 GitOps 四大核心原则
  - 声明式描述
  - 版本控制与不可变
  - 自动同步
  - 自愈（Self-Healing）
- 1.3 GitOps vs 传统 CI/CD
- 1.4 GitOps 的优势与挑战
- 1.5 Argo CD 在 GitOps 生态中的位置
- 1.6 潜在风险总览
  - 配置漂移
  - 同步冲突
  - 权限管理
  - 网络延迟

**第2章 Argo CD 架构与核心概念**
- 2.1 Argo CD 整体架构
  - API Server
  - Repository Server
  - Application Controller
  - Redis
- 2.2 核心资源对象
  - Application
  - AppProject
  - ApplicationSet
- 2.3 同步机制详解
  - 同步策略（Manual/Auto）
  - 同步阶段（PreSync/Sync/PostSync）
  - 同步钩子（Sync Hooks）
- 2.4 健康检查与自愈
- 2.5 Argo CD 与 Flux CD 对比

**第3章 EKS 集群准备与 Argo CD 安装**
- 3.1 EKS 集群创建
  - eksctl 创建集群
  - Terraform 创建集群
  - 节点组配置
- 3.2 IAM 角色与权限配置
  - OIDC Provider
  - IRSA（IAM Roles for Service Accounts）
- 3.3 Argo CD 安装方式
  - Helm Chart 安装
  - 高可用部署
  - 配置 TLS/Ingress
- 3.4 CLI 工具安装与配置
  - argocd CLI
  - kubectl 插件
- 3.5 首次登录与密码管理
- 3.6 潜在风险
  - 安装版本兼容性
  - 资源限制配置
  - 网络策略

---

### 第2篇：核心篇 — 应用部署与配置管理

**第4章 使用 Kustomize 管理应用配置**
- 4.1 Kustomize 基础
  - kustomization.yaml
  - resources/patches/patchesStrategicMerge
- 4.2 环境差异化配置
  - overlays 目录结构
  - 不同环境的 ConfigMap/Secret
- 4.3 Argo CD + Kustomize 集成
  - 配置引用
  - 参数覆盖
- 4.4 实战：Spring Boot 应用 Kustomize 配置
- 4.5 潜在风险
  - 补丁冲突
  - 配置膨胀

**第5章 使用 Helm Chart 部署应用**
- 5.1 Helm 基础回顾
  - Chart 结构
  - Values 与模板
  - 依赖管理
- 5.2 Argo CD + Helm 集成
  - values 文件覆盖
  - 参数传递
  - Helm Hooks
- 5.3 Chart 仓库管理
  - OCI 仓库
  - ChartMuseum
- 5.4 实战：微服务 Helm Chart 配置
- 5.5 潜在风险
  - Helm 版本兼容
  - values 覆盖顺序

**第6章 多环境管理与 Promotion**
- 6.1 分支策略
  - GitFlow vs Trunk-Based
  - 环境分支映射
- 6.2 目录结构设计
  - 按环境分层
  - 按应用分层
- 6.3 Promotion 策略
  - 手动 Promotion
  - 自动 Promotion（CI 触发）
  - Kustomize 镜像更新
- 6.4 ApplicationSet 多环境部署
  - Generators（List/Git/Cluster）
  - 模板化 Application
- 6.5 潜在风险
  - Promotion 阻塞
  - 环境配置不一致

**第7章 Secrets 管理与外部密钥集成**
- 7.1 Kubernetes Secrets 的局限性
- 7.2 AWS Secrets Manager + External Secrets Operator
  - 架构与原理
  - SecretStore 配置
  - ExternalSecret 资源
- 7.3 Sealed Secrets
  - 加密与解密流程
  - 与 Argo CD 集成
- 7.4 SOPS + Kustomize
- 7.5 潜在风险
  - 密钥同步延迟
  - 权限泄露

---

### 第3篇：实践篇 — 高级模式与生产运维

**第8章 多集群管理与 Hub-Spoke 模式**
- 8.1 多集群场景
  - 多区域部署
  - 开发/测试/生产隔离
- 8.2 Hub-Spoke 架构
  - Hub 集群安装 Argo CD
  - Spoke 集群注册
  - 跨集群部署
- 8.3 ApplicationSet 多集群部署
  - Cluster Generator
  - 集群标签选择
- 8.4 潜在风险
  - 网络延迟
  - 集群间依赖

**第9章 监控、告警与可观测性**
- 9.1 Argo CD 指标
  - Prometheus 指标
  - 关键告警规则
- 9.2 Argo CD 日志
  - 组件日志
  - 审计日志
- 9.3 通知与告警
  - Argo CD Notifications
  - Webhook 集成（Slack/Teams/钉钉）
- 9.4 仪表盘
  - Grafana 仪表盘
  - Argo CD Web UI
- 9.5 潜在风险
  - 告警风暴
  - 通知延迟

**第10章 RBAC 与多团队权限管理**
- 10.1 Argo CD RBAC 模型
  - 角色与策略
  - 项目隔离
- 10.2 多团队配置
  - AppProject 划分
  - 团队资源隔离
- 10.3 SSO 集成
  - Dex + OIDC
  - AWS Cognito
- 10.4 审计与合规
- 10.5 潜在风险
  - 权限过大
  - 配置错误

**第11章 典型问题排查指南**
- 11.1 同步问题
  - OutOfSync 原因分析
  - 同步超时
  - 冲突解决
- 11.2 连接问题
  - Repository 连接失败
  - Cluster 注册失败
  - Webhook 配置错误
- 11.3 部署问题
  - 资源创建失败
  - 健康检查失败
  - 回滚失败
- 11.4 性能问题
  - 大规模集群性能
  - 频繁同步
  - 资源消耗
- 11.5 权限问题
  - RBAC 配置错误
  - SSO 登录失败

---

### 第4篇：进阶篇 — CI/CD 集成与技能体系

**第12章 CI/CD 流水线集成（GitHub Actions + Argo CD）**
- 12.1 CI/CD 整体架构
  - CI 构建镜像
  - CD 自动同步
- 12.2 GitHub Actions 流水线
  - 构建与推送镜像
  - 更新 Kustomize 镜像 Tag
  - 触发 Argo CD 同步
- 12.3 Image Updater 自动更新
- 12.4 Pull Request 预览环境
- 12.5 潜在风险
  - CI/CD 权限
  - 镜像 Tag 管理

**第13章 渐进式发布（Argo Rollouts + Flagger）**
- 13.1 渐进式发布概述
  - 蓝绿部署
  - 金丝雀发布
- 13.2 Argo Rollouts 安装与配置
- 13.3 金丝雀发布策略
  - 流量权重
  - 指标分析
  - 自动回滚
- 13.4 蓝绿部署策略
- 13.5 Argo Rollouts + Argo CD 集成
- 13.6 潜在风险
  - 流量管理
  - 指标采集

**第14章 开发人员必备技能体系**
- 14.1 Kubernetes 核心技能
  - 核心资源对象
  - kubectl 命令
  - 应用部署
- 14.2 GitOps 技能
  - Git 工作流
  - 声明式配置
  - 代码审查
- 14.3 Argo CD 技能
  - Application 管理
  - 同步策略
  - 问题排查
- 14.4 AWS 技能
  - EKS 管理
  - IAM 权限
  - 网络配置
- 14.5 CI/CD 技能
  - 流水线设计
  - 镜像管理
  - 自动化测试

**第15章 生产环境最佳实践与案例**
- 15.1 高可用部署
- 15.2 灾备与恢复
- 15.3 成本优化
- 15.4 安全加固
- 15.5 综合案例：电商平台 GitOps 实践

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
- YAML/Shell 示例
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

1. 基础篇（第1-3章）— 建立 GitOps 理论基础
2. 核心篇（第4-7章）— 掌握应用部署与配置管理
3. 实践篇（第8-11章）— 高级模式与生产运维
4. 进阶篇（第12-15章）— CI/CD 集成与技能体系
