# 《深入理解 Prometheus：时序监控原理、PromQL 实战与云原生高可用架构》

> 本书是一本系统化、实战化的 Prometheus 技术书籍，从底层时序数据库原理到生产级高可用架构，覆盖云原生时代监控的核心痛点与解决方案。

## 内容结构

### 第一部分：解密 Prometheus——底层原理与核心设计
| 章节 | 主题 | 实验 |
|------|------|------|
| [第1章：监控哲学的重塑](PART1-Principles/01-Pull-Model.md) | Pull 模型、多维数据模型、指标类型 | [Pull vs Push 对比实验](labs/ch01-pull-model/README.md) |
| [第2章：TSDB 存储引擎揭秘](PART1-Principles/02-TSDB-Storage.md) | Head Block、Compaction、倒排索引、WAL | [TSDB 存储引擎实验](labs/ch02-tsdb/README.md) |

### 第二部分：核心应用场景实战（待补充）
### 第三部分：告警与高可用架构（待补充）
### 第四部分：生产问题排查与调优（待补充）
### 第五部分：开发者技能与工程化（待补充）

## 快速开始

```bash
# 第1章实验：Pull vs Push 模型对比
cd labs/ch01-pull-model
docker compose up -d

# 第2章实验：TSDB 存储引擎
cd labs/ch02-tsdb
docker compose up -d
```

## 环境要求
- Docker & Docker Compose
- Python 3.8+
- 浏览器（访问 Prometheus / Grafana UI）