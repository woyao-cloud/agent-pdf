# Amazon Neptune 图数据库：原理、实践与 DeepSeek 集成

> 从图存储到 Graph RAG 的完整指南

## 书籍定位

本书面向中高级后端开发工程师、数据工程师、架构师和 AI/ML 工程师，系统讲解 Amazon Neptune 图数据库的原理、实践与 DeepSeek 大模型集成。内容覆盖从 Neptune 基础架构到 Graph RAG 完整实现的全栈知识体系。

## 整体结构

```
Amazon Neptune 图数据库：原理、实践与 DeepSeek 集成
├── 基础篇：Neptune 与图数据库基础
│   ├── 第1章 Neptune 概述与优势
│   ├── 第2章 Neptune 架构与实现原理
│   └── 第3章 数据模型与查询语言
├── 核心篇：存储、性能与安全
│   ├── 第4章 存储引擎与数据管理
│   ├── 第5章 性能优化与内存管理
│   ├── 第6章 安全、备份与高可用
│   └── 第7章 典型问题排查指南
├── 实践篇：典型应用场景
│   ├── 第8章 社交网络与推荐系统
│   ├── 第9章 知识图谱构建
│   ├── 第10章 金融风控与欺诈检测
│   └── 第11章 供应链与网络拓扑
└── 进阶篇：DeepSeek 集成与 AI 分析
    ├── 第12章 Neptune + DeepSeek 集成架构
    ├── 第13章 Graph RAG 实战
    ├── 第14章 数据分析场景与 DeepSeek 应用
    └── 第15章 开发人员必备技能体系
```

## 章节列表

| 篇 | 章 | 标题 | 内容概要 |
|----|----|------|---------|
| 基础篇 | 1 | [Neptune 概述与优势](chapter-01-overview.md) | 为什么选择Neptune、核心优势、vs其他图DB、引擎类型、潜在风险 |
| 基础篇 | 2 | [Neptune 架构与实现原理](chapter-02-architecture.md) | 存算分离架构、存储引擎、查询引擎、事务机制、集群架构、Streams |
| 基础篇 | 3 | [数据模型与查询语言](chapter-03-query-language.md) | 属性图/RDF模型、Gremlin/SPARQL/openCypher、选型指南 |
| 核心篇 | 4 | [存储引擎与数据管理](chapter-04-storage.md) | 共享卷存储、批量加载、数据建模、生命周期管理 |
| 核心篇 | 5 | [性能优化与内存管理](chapter-05-performance.md) | 性能模型、查询优化、实例规格、内存管理、IOPS配置 |
| 核心篇 | 6 | [安全、备份与高可用](chapter-06-security.md) | VPC/IAM、加密、备份恢复、多AZ、跨区域容灾 |
| 核心篇 | 7 | [典型问题排查指南](chapter-07-troubleshooting.md) | 连接/查询/性能/数据/集群问题排查 |
| 实践篇 | 8 | [社交网络与推荐系统](chapter-08-social.md) | 社交关系建模、好友推荐、影响力分析、内容推荐 |
| 实践篇 | 9 | [知识图谱构建](chapter-09-knowledge-graph.md) | KG数据模型、实体识别、关系抽取、知识推理 |
| 实践篇 | 10 | [金融风控与欺诈检测](chapter-10-fraud.md) | 交易网络建模、环形检测、风险传播、实时风控 |
| 实践篇 | 11 | [供应链与网络拓扑](chapter-11-supply-chain.md) | 供应链建模、多级供应商分析、瓶颈识别 |
| 进阶篇 | 12 | [Neptune + DeepSeek 集成架构](chapter-12-deepseek-arch.md) | DeepSeek概述、集成架构、Graph RAG原理、向量检索 |
| 进阶篇 | 13 | [Graph RAG 实战](chapter-13-graph-rag.md) | 数据准备、检索策略、提示工程、完整问答系统 |
| 进阶篇 | 14 | [数据分析场景与 DeepSeek 应用](chapter-14-deepseek-scenarios.md) | 金融/社交/KG/供应链/异常检测分析 |
| 进阶篇 | 15 | [开发人员必备技能体系](chapter-15-skills.md) | 图DB/AWS/编程/AI技能、学习路线图 |

## 每章内容模板

每章包含以下核心模块：

| 模块 | 内容 |
|------|------|
| **解决的问题** | 该章节要解决的核心问题 |
| **核心原理** | 核心概念讲解、关键机制分析 |
| **代码/配置实现** | Java/Python/YAML 示例、最佳实践 |
| **使用场景** | 适用场景分析、典型业务案例 |
| **潜在风险与注意事项** | 性能问题分析、常见错误与坑、架构陷阱 |
| **本章小结** | 核心要点回顾 |

## 代码示例

所有代码示例位于 `demos/` 目录下，按章节组织：

- `demos/ch01-basics/` — Neptune 基础连接与操作
- `demos/ch03-query/` — Gremlin/SPARQL/openCypher 查询示例
- `demos/ch04-data/` — 数据导入导出示例
- `demos/ch08-social/` — 社交网络应用
- `demos/ch09-kg/` — 知识图谱构建
- `demos/ch10-fraud/` — 金融风控
- `demos/ch11-supply-chain/` — 供应链分析
- `demos/ch12-deepseek/` — DeepSeek 集成
- `demos/ch13-graph-rag/` — Graph RAG 完整实现
- `demos/ch14-analysis/` — 数据分析场景

## 阅读建议

1. **基础篇（第1-3章）**：建立 Neptune 理论基础，适合所有读者
2. **核心篇（第4-7章）**：掌握存储、性能与安全，架构师/SRE 必读
3. **实践篇（第8-11章）**：典型应用场景实战，开发工程师重点
4. **进阶篇（第12-15章）**：DeepSeek 集成与 AI 分析，AI 工程师必读

## 写作顺序

1. 基础篇（第1-3章）— 建立 Neptune 理论基础
2. 核心篇（第4-7章）— 掌握存储、性能与安全
3. 实践篇（第8-11章）— 典型应用场景实战
4. 进阶篇（第12-15章）— DeepSeek 集成与 AI 分析
