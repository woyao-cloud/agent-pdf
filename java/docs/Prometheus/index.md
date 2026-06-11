# 《深入理解 Prometheus：时序监控原理、PromQL 实战与云原生高可用架构》

> 本书是一本系统化、实战化的 Prometheus 技术书籍，从底层时序数据库原理到生产级高可用架构，覆盖云原生时代监控的核心痛点与解决方案。

## 内容结构

### 第一部分：解密 Prometheus——底层原理与核心设计
| 章节 | 主题 | 实验 |
|------|------|------|
| [第1章：监控哲学的重塑](PART1-Principles/01-Pull-Model.md) | Pull 模型、多维数据模型、指标类型 | [Pull vs Push 对比实验](labs/ch01-pull-model/README.md) |
| [第2章：TSDB 存储引擎揭秘](PART1-Principles/02-TSDB-Storage.md) | Head Block、Compaction、倒排索引、WAL | [TSDB 存储引擎实验](labs/ch02-tsdb/README.md) |

### 第二部分：核心应用场景实战
| 章节 | 主题 | 实验 |
|------|------|------|
| [第3章：微服务应用级监控](PART2-Scenarios/03-SpringBoot-Monitoring.md) | Micrometer、Spring Boot Actuator、高基数防护 | [Spring Boot 监控实验](labs/ch03-springboot/README.md) |
| [第4章：Kubernetes 云原生监控](PART2-Scenarios/04-Kubernetes-Monitoring.md) | Prometheus Operator、Node Exporter、kube-state-metrics | [K8s 监控实验](labs/ch04-kubernetes/README.md) |
| [第5章：黑盒监控与 SLA 探测](PART2-Scenarios/05-Blackbox-SLA.md) | Blackbox Exporter、证书监控、SLA 计算 | [黑盒监控实验](labs/ch05-blackbox/README.md) |
| [第6章：PromQL 深度解析](PART2-Scenarios/06-PromQL-Deep-Dive.md) | 向量匹配、rate vs irate、Recording Rules | [PromQL 实验](labs/ch06-promql/README.md) |
### 第三部分：告警路由与高可用架构
| 章节 | 主题 | 实验 |
|------|------|------|
| [第7章：Alertmanager 告警路由与降噪](PART3-Advanced/07-Alertmanager.md) | 路由树、分组、抑制、告警风暴治理 | [Alertmanager 实验](labs/ch07-alertmanager/README.md) |
| [第8章：高可用与长期存储](PART3-Advanced/08-HA-Storage.md) | Thanos、VictoriaMetrics、联邦集群 | [高可用存储实验](labs/ch08-ha-storage/README.md) |
### 第四部分：生产问题排查与调优
| 章节 | 主题 | 实验 |
|------|------|------|
| [第9章：生产环境三大杀手排查](PART4-Troubleshooting/09-Troubleshooting.md) | OOM/高基数、抓取失败、TSDB 损坏修复 | [排障实验](labs/ch09-troubleshooting/README.md) |
| [第10章：核心参数与内核调优](PART4-Troubleshooting/10-Tuning.md) | GOGC、并发抓取、Remote Write 队列 | [调优实验](labs/ch10-tuning/README.md) |
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