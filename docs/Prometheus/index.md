# 《深入理解 Prometheus：时序监控原理、PromQL 实战与云原生高可用架构》

> **版本:** v1.0 | **更新日期:** 2026-06-12

## 内容导览

本书从底层原理到生产实战，系统性地讲解 Prometheus 监控体系。每章配有独立 Docker Compose 实验环境，可动手验证核心概念。

---

## 第一部分：解密 Prometheus

| 章节 | 主题 | 核心内容 | 实验 |
|------|------|---------|------|
| [第 1 章：监控哲学的重塑](PART1-Principles/01-Pull-Model.md) | Pull 模型与多维数据模型 | Push vs Pull 演进、四种指标类型、基数概念 | [Pull 模型对比实验](../labs/ch01-pull-model/README.md) |
| [第 2 章：TSDB 存储引擎揭秘](PART1-Principles/02-TSDB-Storage.md) | 时序数据库内部原理 | WAL、Compaction、倒排索引、mmap | [TSDB 分析实验](../labs/ch02-tsdb/README.md) |

## 第二部分：核心应用场景实战

| 章节 | 主题 | 核心内容 | 实验 |
|------|------|---------|------|
| 第 3 章：Spring Boot 微服务监控 | Micrometer + Actuator | JVM 指标、高基数防护、Relabeling | Spring Boot 实验环境 |
| 第 4 章：Kubernetes 云原生监控 | Prometheus Operator | Node Exporter / cAdvisor / kube-state-metrics | kind 集群实验 |
| 第 5 章：黑盒监控与 SLA 探测 | Blackbox Exporter | HTTP/TCP/ICMP/DNS、证书监控、SLA 计算 | 黑盒探测实验 |
| 第 6 章：PromQL 深度解析 | 查询语言进阶 | 向量匹配、rate vs irate、Recording Rules | PromQL 练习环境 |

## 第三部分：告警治理与高可用架构

| 章节 | 主题 | 核心内容 | 实验 |
|------|------|---------|------|
| 第 7 章：Alertmanager 告警路由与降噪 | 告警治理 | 路由树、分组、抑制、静默、Webhook | 告警风暴实验 |
| 第 8 章：高可用与长期存储 | 扩展架构 | Federation、Thanos、VictoriaMetrics | 多方案对比实验 |

## 第四部分：生产问题排查与调优

| 章节 | 主题 | 核心内容 | 实验 |
|------|------|---------|------|
| 第 9 章：生产环境三大杀手排查 | 排障实战 | OOM/高基数、抓取失败、TSDB 损坏修复 | 诊断场景模拟 |
| 第 10 章：核心参数与内核调优 | 性能调优 | GOGC、并发抓取、Remote Write 队列 | 对比实验脚本 |

## 第五部分：开发者技能与工程化

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| 第 11 章：自定义 Exporter 开发 | 工程实践 | Python/Go Exporter、最佳实践 |
| 第 12 章：可观测性体系联动 | 生态整合 | Prometheus + Grafana + Loki + Tempo |
| 第 13 章：监控工程规范 | 方法论 | SLO 定义、On-Call 流程、成本控制 |
| 附录 A：PromQL 速查手册 | 参考 | 函数、运算符、最佳实践索引 |

---

## 快速开始

```bash
# 第 1 章实验：Pull 模型对比
cd labs/ch01-pull-model
docker compose up -d

# 第 2 章实验：TSDB 分析
cd ../ch02-tsdb
docker compose up -d
```

更多实验说明见各章节的 `labs/ch0X-*/README.md`。

---

## 系统要求

- Docker Engine 24+
- Docker Compose v2.20+
- Python 3.10+（部分实验应用）
- Java 17+（第 3 章 Spring Boot 实验）
- kind + kubectl（第 4 章 K8s 实验）
- 端口规划：各章 Prometheus → 909X，Grafana → 300X 递增
