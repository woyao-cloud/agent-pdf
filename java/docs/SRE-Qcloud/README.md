# 腾讯云 SRE 实战手册：从理论到运维

> 基于腾讯云原生生态的 SRE 落地指南

## 书籍定位

本书面向 SRE 工程师、云平台运维工程师、DevOps 工程师和架构师，系统讲解 SRE 核心理论在腾讯云环境中的落地实践。内容覆盖从 SRE 基石到故障排查的全栈知识体系，每章配有可直接在腾讯云上运行的示例代码。

## 整体结构

```
腾讯云 SRE 实战手册：从理论到运维
├── 第一篇：SRE 基石与文化（第1-4章）
├── 第二篇：腾讯云核心架构与高可用设计（第5-11章）
├── 第三篇：腾讯云可观测性体系构建（第12-16章）
├── 第四篇：基础设施即代码 (IaC) 与自动化（第17-19章）
├── 第五篇：容量规划、性能与成本管理（第20-22章）
├── 第六篇：事件响应与故障排查实战（第23-28章）
├── 第七篇：腾讯云安全与合规（第29-32章）
└── 附录：腾讯云 SRE 必备工具箱与速查表
```

## 章节列表

| 篇 | 章 | 标题 | 内容概要 |
|----|----|------|---------|
| SRE 基石 | 1 | [SRE 基础](ch01-sre-foundation.md) | SRE 起源、vs DevOps、核心原则、腾讯云落地挑战 |
| SRE 基石 | 2 | [SLI/SLO/SLA](ch02-sli-slo-sla.md) | 指标定义、目标制定、腾讯云 SLA 补偿机制 |
| SRE 基石 | 3 | [错误预算](ch03-error-budget.md) | 错误预算计算、监控、发布决策 |
| SRE 基石 | 4 | [琐事管理](ch04-toil.md) | Toil 识别、量化、自动化消除 |
| 核心架构 | 5 | [腾讯云全局基础设施](ch05-global-infra.md) | Region/AZ、国内海外区域、选型策略 |
| 核心架构 | 6 | [计算服务选型](ch06-compute-choose.md) | CVM/TKE/SCF、实例规格、竞价/预留实例 |
| 核心架构 | 7 | [TKE 高可用部署](ch07-tke-ha.md) | 集群架构、多 AZ 分布、HPA/CA、超级节点 |
| 核心架构 | 8 | [VPC 网络架构](ch08-vpc-network.md) | CIDR 规划、安全组、CCN、VPN/专线 |
| 核心架构 | 9 | [负载均衡](ch09-load-balancing.md) | CLB 七层/四层、健康检查、GSLB |
| 核心架构 | 10 | [存储与数据库](ch10-storage-db.md) | COS/CBS/CFS、TDSQL、Redis、备份恢复 |
| 核心架构 | 11 | [容灾规划](ch11-dr-planning.md) | RPO/RTO、同城双活、异地灾备、演练 |
| 可观测性 | 12 | [可观测性基础](ch12-observability-basics.md) | 三大支柱、黄金信号、TCOP/CLS/APM |
| 可观测性 | 13 | [云监控 TCOP](ch13-cloud-monitoring.md) | 基础/自定义指标、告警策略、Grafana |
| 可观测性 | 14 | [日志服务 CLS](ch14-logging.md) | LogListener、JSON 结构化、SQL 分析 |
| 可观测性 | 15 | [链路追踪 APM](ch15-tracing.md) | OpenTelemetry、采样策略、服务拓扑 |
| 可观测性 | 16 | [性能分析](ch16-profiling.md) | 代码级/数据库/网络性能分析 |
| IaC 与自动化 | 17 | [Terraform 管理腾讯云](ch17-terraform.md) | Provider、模块化、远程状态、COS |
| IaC 与自动化 | 18 | [CI/CD 基础设施流水线](ch18-cicd-infra.md) | Terraform Plan/Apply、CODING DevOps |
| IaC 与自动化 | 19 | [自动化脚本](ch19-automation-scripts.md) | Python SDK、SCF 云函数、tccli |
| 容量与成本 | 20 | [弹性伸缩](ch20-autoscaling.md) | HPA/VPA/CA、CVM 伸缩组、冷启动 |
| 容量与成本 | 21 | [成本优化](ch21-cost-optimization.md) | 成本模型、闲置资源、竞价/预留实例 |
| 容量与成本 | 22 | [账单分析](ch22-billing-analysis.md) | 成本分析工具、标签分摊、预算告警 |
| 事件响应 | 23 | [事件管理](ch23-incident-management.md) | 事件分级、ICS、On-call、企业微信通知 |
| 事件响应 | 24 | [事后复盘](ch24-postmortem.md) | 无指责复盘、Postmortem 模板、5 Whys |
| 事件响应 | 25 | [TKE 故障排查](ch25-troubleshoot-tke.md) | CrashLoopBackOff、Pending、OOMKill |
| 事件响应 | 26 | [TDSQL 故障排查](ch26-troubleshoot-tdsql.md) | 连接数、CPU 突增、慢查询、主从延迟 |
| 事件响应 | 27 | [网络故障排查](ch27-troubleshoot-network.md) | CLB 502/503、内网不通、DNS、CDN |
| 事件响应 | 28 | [其他服务故障排查](ch28-troubleshoot-other.md) | Redis/COS/SCF/CVM 故障排查 |
| 安全合规 | 29 | [CAM 最佳实践](ch29-iam-best-practices.md) | 用户/角色/策略、最小权限、STS |
| 安全合规 | 30 | [网络安全](ch30-network-security.md) | 安全组、WAF、DDoS、VPC 流日志 |
| 安全合规 | 31 | [密钥与加密](ch31-secret-encryption.md) | SSM、KMS、存储/传输加密 |
| 安全合规 | 32 | [安全监控](ch32-security-monitoring.md) | SOC、CloudAudit、等保 2.0 |

## 每章内容模板

每章包含以下核心模块：

| 模块 | 内容 |
|------|------|
| **解决的问题** | 该章节要解决的核心问题 |
| **核心原理** | 核心概念讲解、关键机制分析 |
| **代码/配置实现** | Terraform/Python/Shell 示例、腾讯云控制台操作指引 |
| **使用场景** | 适用场景分析、典型业务案例 |
| **潜在风险与注意事项** | 性能问题分析、常见错误与坑、架构陷阱 |
| **本章小结** | 核心要点回顾 |

## 代码示例

所有代码示例位于 `demos/` 目录下，按章节组织，可直接在腾讯云上运行：

| 代码类型 | 覆盖章节 | 运行方式 |
|---------|---------|---------|
| Terraform | 第5/6/8/9/10/17/29/30/31章 | `terraform init && terraform apply` |
| Python 脚本 | 第1-4/11/16/19/21-22/24/26章 | `pip install tencentcloud-sdk-python && python script.py` |
| Shell 脚本 | 第25/27/28章 | `bash diagnose.sh`（需配置 SECRET_ID/KEY） |
| YAML 配置 | 第7/14/15/20章 | `kubectl apply -f` 或 TKE 控制台导入 |
| CODING CI | 第18章 | 导入 CODING DevOps 流水线 |
| tccli 命令 | 第13/32章 | 直接执行 |

## 阅读建议

1. **第一篇（第1-4章）**：SRE 理论基础，适合所有读者
2. **第二篇（第5-11章）**：腾讯云核心架构，架构师/SRE 必读
3. **第三篇（第12-16章）**：可观测性体系，DevOps 工程师重点
4. **第四篇（第17-19章）**：IaC 与自动化，平台工程师必读
5. **第五篇（第20-22章）**：容量与成本管理，FinOps 实践
6. **第六篇（第23-28章）**：事件响应与故障排查，On-call SRE 必读
7. **第七篇（第29-32章）**：安全与合规，安全工程师必读

## 写作顺序

1. 第一篇（第1-4章）— SRE 基石与文化
2. 第二篇（第5-11章）— 腾讯云核心架构与高可用
3. 第三篇（第12-16章）— 可观测性体系
4. 第四篇（第17-19章）— IaC 与自动化
5. 第五篇（第20-22章）— 容量规划与成本管理
6. 第六篇（第23-28章）— 事件响应与故障排查
7. 第七篇（第29-32章）— 安全与合规
