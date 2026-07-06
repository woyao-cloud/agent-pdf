# Microsoft GraphRAG 原理与实践：从全局摘要到 DeepSeek 集成

> 基于知识图谱的增强检索生成完整指南

## 书籍定位

本书面向 AI 工程师、RAG 开发者、NLP 研究员、知识图谱工程师和数据分析师，系统讲解 Microsoft GraphRAG 的原理、实践与 DeepSeek 大模型集成。内容覆盖从 GraphRAG 基础架构到社区检测、分层摘要、全局/局部搜索的全栈知识体系。

## 整体结构

```
Microsoft GraphRAG 原理与实践：从全局摘要到 DeepSeek 集成
├── 基础篇：GraphRAG 概述与原理
│   ├── 第1章 GraphRAG 概述与核心优势
│   ├── 第2章 GraphRAG 实现原理与架构
│   └── 第3章 GraphRAG vs 传统 RAG vs LightRAG
├── 核心篇：索引构建与查询机制
│   ├── 第4章 文档处理与图索引构建
│   ├── 第5章 社区检测与分层摘要
│   ├── 第6章 全局搜索与局部搜索
│   └── 第7章 向量检索与语义搜索
├── 实践篇：部署、优化与典型场景
│   ├── 第8章 GraphRAG 部署与配置
│   ├── 第9章 性能优化与成本控制
│   ├── 第10章 典型应用场景
│   └── 第11章 典型问题排查指南
└── 进阶篇：DeepSeek 集成与 AI 分析
    ├── 第12章 GraphRAG + DeepSeek 集成架构
    ├── 第13章 数据分析场景与 DeepSeek 应用
    └── 第14章 开发人员必备技能体系
```

## 章节列表

| 篇 | 章 | 标题 | 内容概要 |
|----|----|------|---------|
| 基础篇 | 1 | [GraphRAG 概述与核心优势](ch01-overview.md) | 为什么需要GraphRAG、核心优势、vs传统RAG、潜在风险 |
| 基础篇 | 2 | [实现原理与架构](ch02-architecture.md) | 索引阶段、查询阶段、LLM调用策略、图存储结构 |
| 基础篇 | 3 | [vs 传统 RAG vs LightRAG](ch03-comparison.md) | 三方案架构/索引/查询/Token消耗/选型对比 |
| 核心篇 | 4 | [文档处理与图索引构建](ch04-indexing.md) | 分块、实体提取、关系提取、图存储、向量嵌入 |
| 核心篇 | 5 | [社区检测与分层摘要](ch05-community.md) | Leiden算法、社区层次、摘要生成、质量评估 |
| 核心篇 | 6 | [全局搜索与局部搜索](ch06-search.md) | Global Search、Local Search、策略选择、结果融合 |
| 核心篇 | 7 | [向量检索与语义搜索](ch07-vector.md) | 嵌入模型、向量索引、混合搜索、重排序 |
| 实践篇 | 8 | [部署与配置](ch08-deploy.md) | 环境准备、settings.yaml、Docker部署、API服务 |
| 实践篇 | 9 | [性能优化与成本控制](ch09-optimization.md) | Token消耗分析、并行处理、缓存、参数调优 |
| 实践篇 | 10 | [典型应用场景](ch10-scenarios.md) | 知识库问答、文档摘要、关系推理、主题发现 |
| 实践篇 | 11 | [典型问题排查指南](ch11-troubleshooting.md) | 索引失败/Token过高/社区检测/内存溢出 |
| 进阶篇 | 12 | [GraphRAG + DeepSeek 集成](ch12-deepseek.md) | DeepSeek概述、替换LLM、提示工程适配 |
| 进阶篇 | 13 | [数据分析场景与 DeepSeek 应用](ch13-analysis.md) | 金融/社交/KG/供应链/异常检测分析 |
| 进阶篇 | 14 | [开发人员技能体系](ch14-skills.md) | RAG/Python/LLM/数据分析技能、学习路线图 |

## 每章内容模板

每章包含以下核心模块：

| 模块 | 内容 |
|------|------|
| **解决的问题** | 该章节要解决的核心问题 |
| **核心原理** | 核心概念讲解、关键机制分析 |
| **代码/配置实现** | Python 代码示例、配置文件示例 |
| **使用场景** | 适用场景分析、典型业务案例 |
| **潜在风险与注意事项** | 性能问题分析、常见错误与坑、架构陷阱 |
| **本章小结** | 核心要点回顾 |

## 代码示例

所有代码示例位于 `demos/` 目录下，按章节组织，可直接运行：

| 目录 | 内容 |
|------|------|
| `demos/ch04-indexing/` | 图索引构建示例 |
| `demos/ch05-community/` | 社区检测与摘要 |
| `demos/ch06-search/` | 全局/局部搜索 |
| `demos/ch07-vector/` | 向量检索 |
| `demos/ch08-deploy/` | 部署配置示例 |
| `demos/ch10-scenarios/` | 典型场景应用 |
| `demos/ch12-deepseek/` | DeepSeek 集成 |
| `demos/ch13-analysis/` | 数据分析场景 |

## 阅读建议

1. **基础篇（第1-3章）**：建立 GraphRAG 理论基础，适合所有读者
2. **核心篇（第4-7章）**：掌握索引构建与查询机制，开发者必读
3. **实践篇（第8-11章）**：部署优化与典型场景，DevOps 工程师重点
4. **进阶篇（第12-14章）**：DeepSeek 集成与 AI 分析，AI 工程师必读
