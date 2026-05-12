# 精通软件架构模式

**副标题**: 原理 · 设计 · 实践 · 优化

本书系统讲解 11 种主流软件架构模式，从问题分析、实现原理、代码实践到风险与优化，覆盖架构师从入门到精通的完整知识体系。

---

## 目录

### 第1篇：基础篇 —— 架构思维与设计原则

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第1章 | [软件架构概述](chapter-01-overview.md) | 架构定义、架构与设计的区别、架构模式的价值、如何选择架构模式 |
| 第2章 | [架构设计原则](chapter-02-principles.md) | SOLID 原则、迪米特法则、合成复用原则、原则的权衡与决策 |
| 第3章 | [架构质量属性](chapter-03-quality-attributes.md) | 性能、可用性、可修改性、安全性、可测试性、可扩展性 |

### 第2篇：分层架构模式

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第4章 | [单层架构（Monolithic）](chapter-04-monolithic.md) | 单体架构概述、模块化单体、ArchUnit 强制边界、演进路径 |
| 第5章 | [两层架构](chapter-05-two-tier.md) | Client-Server 基础、胖客户端 vs 瘦客户端、连接池优化 |
| 第6章 | [三层架构](chapter-06-three-tier.md) | 表现层/业务层/数据层、DDD 内部分层、Spring Boot 实现 |
| 第7章 | [多层架构（N-Tier）](chapter-07-n-tier.md) | 五层模型、BFF 模式、六边形架构、过度分层的风险 |

### 第3篇：客户端-服务器模式

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第8章 | [客户端-服务器模式](chapter-08-client-server.md) | CS 模式精讲、负载均衡、缓存策略、连接池 |

### 第4篇：面向服务的架构模式（SOA）

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第9章 | [面向服务的架构（SOA）](chapter-09-soa.md) | SOA 概述、ESB 架构、SOAP/WSDL/BPEL、轻量级 SOA |
| 第10章 | [Web 服务模式](chapter-10-web-services.md) | REST（Richardson 成熟度模型）、SOAP、GraphQL、gRPC |

### 第5篇：微服务架构模式

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第11章 | [微服务架构概述](chapter-11-microservices-overview.md) | 微服务定义、Spring Cloud 骨架、服务通信、前提条件清单 |
| 第12章 | [服务拆分模式](chapter-12-service-splitting.md) | 业务能力分解、DDD 子域拆分、事务边界、Saga 编排 |
| 第13章 | [服务通信模式](chapter-13-service-communication.md) | 同步通信（REST/gRPC）、异步通信（Kafka）、服务发现与负载均衡 |
| 第14章 | [服务治理模式](chapter-14-service-governance.md) | 限流、熔断（Resilience4j）、降级、隔离、超时控制 |
| 第15章 | [数据管理模式](chapter-15-data-management.md) | Database per Service、Saga、CQRS、Event Sourcing |
| 第16章 | [微服务潜在风险](chapter-16-microservices-risks.md) | 分布式复杂性、数据一致性、调试困难、分布式单体 |
| 第17章 | [微服务优化策略](chapter-17-microservices-optimization.md) | 服务网格、容器化、CI/CD、监控三支柱、性能优化 |

### 第6篇：事件驱动架构模式

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第18章 | [事件驱动架构（EDA）](chapter-18-event-driven.md) | EDA 核心概念、事件定义、Spring 实现、EDA vs 请求-响应 |
| 第19章 | [消息队列模式](chapter-19-message-queue.md) | RabbitMQ、Kafka、RocketMQ 对比与实战 |
| 第20章 | [事件驱动潜在风险](chapter-20-event-driven-risks.md) | 消息顺序、重复、丢失、事务一致性、调试复杂度 |
| 第21章 | [事件驱动优化策略](chapter-21-event-driven-optimization.md) | 可靠性保证、幂等性设计、顺序处理、性能调优 |

### 第7篇：云原生架构模式

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第22章 | [云原生架构概述](chapter-22-cloud-native-overview.md) | CNCF 定义、容器化 vs VM、DevOps、GitOps（ArgoCD） |
| 第23章 | [容器与编排](chapter-23-container-orchestration.md) | Docker 镜像模型、K8s 架构、Pod 设计模式、部署策略 |
| 第24章 | [无服务器架构](chapter-24-serverless.md) | FaaS（Lambda/Spring Cloud Function）、BaaS、冷启动问题 |
| 第25章 | [服务网格](chapter-25-service-mesh.md) | Istio 架构、流量管理、mTLS、可观测性、代价分析 |
| 第26章 | [云原生潜在风险](chapter-26-cloud-native-risks.md) | 供应商锁定、安全攻击面、性能开销、成本管理、技能要求 |
| 第27章 | [云原生优化策略](chapter-27-cloud-native-optimization.md) | 多云策略、成本优化、JVM 性能调优、安全加固 |

### 第8篇：空间架构模式

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第28章 | [空间架构模式](chapter-28-space-architecture.md) | 空间架构原理、Hazelcast 实现、高并发场景、内存网格 |

### 第9篇：管道与过滤器模式

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第29章 | [管道与过滤器](chapter-29-pipeline-filter.md) | Pipeline-Filter 原理、Java Stream/Reactor 实现、流式处理 |

### 第10篇：架构模式最佳实践

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第30章 | [架构模式选择](chapter-30-pattern-selection.md) | 选择方法论、场景化决策、模式组合、演进式架构 |
| 第31章 | [典型问题处理](chapter-31-typical-problems.md) | 性能/可用性/一致性/安全性/可扩展性问题诊断与处理 |
| 第32章 | [架构重构](chapter-32-architecture-refactoring.md) | 重构策略、数据迁移、平滑迁移、回滚方案 |

### 第11篇：架构师技能篇

| 章节 | 标题 | 内容概要 |
|------|------|---------|
| 第33章 | [架构师必备技能](chapter-33-architect-skills.md) | 技术广度、系统设计、业务理解、沟通协调、文档能力 |
| 第34章 | [架构文档与沟通](chapter-34-architecture-documentation.md) | 架构文档、ADR、技术方案评审、知识传递 |
| 第35章 | [架构治理](chapter-35-architecture-governance.md) | 架构规范、代码审查、技术债务管理、架构适应性 |

---

## 阅读建议

- **初学者（1-3 年经验）**：按顺序阅读第 1-3 章建立架构思维，然后选择当前项目使用的架构模式章节深入
- **中级工程师（3-7 年经验）**：重点阅读第 10-29 章（各架构模式），配合第 30-32 章（最佳实践）
- **高级/架构师（7+ 年经验）**：重点关注第 30-35 章（最佳实践与技能篇），以及各模式章节中的风险与优化部分

## 技术栈

全书代码示例基于 Java 17+ + Spring Boot 3.x + Spring Cloud 生态。
