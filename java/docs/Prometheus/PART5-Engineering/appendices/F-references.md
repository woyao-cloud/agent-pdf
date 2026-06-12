# 附录 F：参考资料与推荐阅读

> 本附录整理了全书各章节引用的官方文档、经典论文、开源工具和相关书籍，方便读者按需深入查阅。

---

## 官方文档

### Prometheus

| 资源 | 链接 | 说明 |
|------|------|------|
| Prometheus 官方文档 | https://prometheus.io/docs/ | 最权威的配置、查询、API 文档 |
| Prometheus 配置详解 | https://prometheus.io/docs/prometheus/latest/configuration/configuration/ | scrape_config、relabel 等完整参考 |
| PromQL 查询语法 | https://prometheus.io/docs/prometheus/latest/querying/basics/ | 官方 PromQL 参考手册 |
| Recording Rules | https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/ | 预计算规则配置 |
| Alerting Rules | https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/ | 告警规则语法 |
| Prometheus Operator | https://prometheus-operator.dev/ | K8s 原生部署方案 |
| promtool 工具 | https://prometheus.io/docs/prometheus/latest/command-line/promtool/ | 配置检查、TSDB 分析等 CLI 工具 |

### Alertmanager

| 资源 | 链接 | 说明 |
|------|------|------|
| Alertmanager 配置 | https://prometheus.io/docs/alerting/latest/configuration/ | 路由树、接收器、抑制规则配置 |
| Alertmanager Webhook | https://prometheus.io/docs/alerting/latest/configuration/#webhook_config | 自定义通知集成 |

### Thanos

| 资源 | 链接 | 说明 |
|------|------|------|
| Thanos 官方文档 | https://thanos.io/ | 架构、部署、配置完整指南 |
| Thanos Sidecar | https://thanos.io/v0.33/thanos/components/sidecar.md/ | Sidecar 组件详解 |
| Thanos Query | https://thanos.io/v0.33/thanos/components/query.md/ | 全局查询层配置 |
| Thanos Compactor | https://thanos.io/v0.33/thanos/components/compactor.md/ | 下采样与压缩 |

### VictoriaMetrics

| 资源 | 链接 | 说明 |
|------|------|------|
| VictoriaMetrics 文档 | https://docs.victoriametrics.com/ | 单节点、集群版部署指南 |
| Remote Write 集成 | https://docs.victoriametrics.com/#how-to-import-time-series-data | Prometheus Remote Write 配置 |

### Grafana

| 资源 | 链接 | 说明 |
|------|------|------|
| Grafana 文档 | https://grafana.com/docs/grafana/latest/ | Dashboard、数据源、告警配置 |
| Grafana Loki | https://grafana.com/docs/loki/latest/ | 日志聚合系统文档 |
| Grafana Tempo | https://grafana.com/docs/tempo/latest/ | 分布式追踪后端文档 |

### OpenTelemetry

| 资源 | 链接 | 说明 |
|------|------|------|
| OTel 官方文档 | https://opentelemetry.io/docs/ | 总入口文档 |
| OTel Semantic Conventions | https://opentelemetry.io/docs/specs/semconv/ | 指标/属性命名规范 |
| OTel Collector | https://opentelemetry.io/docs/collector/ | Collector 部署与配置 |
| OTel Java SDK | https://opentelemetry.io/docs/languages/java/ | Java SDK 使用指南 |
| OTel Go SDK | https://opentelemetry.io/docs/languages/go/ | Go SDK 使用指南 |
| OTel Python SDK | https://opentelemetry.io/docs/languages/python/ | Python SDK 使用指南 |

---

## 经典论文

| 论文 | 作者 | 年份 | 与本书关联章节 | 说明 |
|------|------|:----:|:-------------:|------|
| [Borgmon: Google's Monitoring System](https://storage.googleapis.com/pub-tools-public-publication-data/pdf/0201c4ae2c979bbf3b2f8cd5a6ff4a6b2f2d8a6e.pdf) | Google | 2013 | 第1章 | Pull 模型的起源，Prometheus 的设计灵感来源 |
| [Gorilla: A Fast, Scalable, In-Memory Time Series Database](https://www.vldb.org/pvldb/vol8/p1816-teller.pdf) | Facebook | 2015 | 第2章 | XOR 压缩算法的原型，Prometheus TSDB 的核心压缩算法参考 |
| [Prometheus: Monitoring at SoundCloud](https://prometheus.io/blog/2015/06/24/monitoring-at-soundcloud/) | SoundCloud | 2015 | 第1章 | Prometheus 项目诞生的背景故事 |
| [The RED Method: How to Instrument Your Services](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/) | Tom Wilkie | 2018 | 第13章 | RED 方法论的正式提出 |
| [The USE Method: Reducing Complexity in Performance Analysis](https://www.brendangregg.com/usemethod.html) | Brendan Gregg | 2012 | 第13章 | USE 方法论（利用率、饱和度、错误）的经典文章 |
| [Spirals of Silence: Alert Fatigue](https://www.usenix.org/conference/srecon17europe/program/presentation/ludwig) | USENIX | 2017 | 第7章 | 告警疲劳与告警风暴治理研究 |

---

## 开源工具

### 监控生态

| 工具 | 仓库 | 说明 |
|------|------|------|
| Prometheus | https://github.com/prometheus/prometheus | 核心时序数据库与监控系统 |
| Alertmanager | https://github.com/prometheus/alertmanager | 告警路由与管理 |
| Prometheus Operator | https://github.com/prometheus-operator/prometheus-operator | K8s 原生 Prometheus 部署 |
| Node Exporter | https://github.com/prometheus/node_exporter | 主机级指标采集 |
| Blackbox Exporter | https://github.com/prometheus/blackbox_exporter | 黑盒探测 |
| kube-state-metrics | https://github.com/kubernetes/kube-state-metrics | K8s 对象状态指标 |
| cAdvisor | https://github.com/google/cadvisor | 容器资源使用指标 |
| Pushgateway | https://github.com/prometheus/pushgateway | 批量任务指标中转 |

### 长期存储与高可用

| 工具 | 仓库 | 说明 |
|------|------|------|
| Thanos | https://github.com/thanos-io/thanos | 全局视图 + 对象存储长期存储 |
| VictoriaMetrics | https://github.com/VictoriaMetrics/VictoriaMetrics | 高性能时序数据库，兼容 Prometheus |
| Cortex | https://github.com/cortexproject/cortex | 水平可扩展的 Prometheus 兼容存储 |

### 可观测性

| 工具 | 仓库 | 说明 |
|------|------|------|
| Grafana | https://github.com/grafana/grafana | 可观测性与数据可视化平台 |
| Loki | https://github.com/grafana/loki | 日志聚合系统 |
| Tempo | https://github.com/grafana/tempo | 分布式追踪后端 |
| OpenTelemetry Collector | https://github.com/open-telemetry/opentelemetry-collector | 厂商中立的遥测数据收集器 |

### 客户端库

| 语言 | Prometheus 客户端 | OTel SDK |
|------|------------------|----------|
| Go | https://github.com/prometheus/client_golang | https://github.com/open-telemetry/opentelemetry-go |
| Java | https://github.com/prometheus/client_java | https://github.com/open-telemetry/opentelemetry-java |
| Python | https://github.com/prometheus/client_python | https://github.com/open-telemetry/opentelemetry-python |
| .NET | https://github.com/prometheus-net/prometheus-net | https://github.com/open-telemetry/opentelemetry-dotnet |

---

## 推荐书籍

### 可观测性与监控

| 书名 | 作者 | 说明 |
|------|------|------|
| 《Prometheus: Up & Running》第2版 | Brian Brazil | Prometheus 项目核心维护者撰写的最佳入门书 |
| 《SRE: Google 运维解密》 | Betsy Beyer 等 | 了解 SRE 方法论和监控哲学的必读经典 |
| 《站点可靠性工程（SRE）实战》 | Niall Murphy 等 | SRE 实践案例，包含监控和告警设计 |
| 《Observability Engineering》 | Charity Majors 等 | 可观测性工程的系统化方法论 |
| 《Distributed Systems Observability》 | Cindy Sridharan | 分布式系统可观测性的简明指南 |

### 时序数据库与存储

| 书名 | 作者 | 说明 |
|------|------|------|
| 《数据库系统概念》第7版 | Abraham Silberschatz | 理解 B-Tree、LSM-Tree、倒排索引等基础 |
| 《Designing Data-Intensive Applications》 | Martin Kleppmann | 分布式存储系统的权威参考 |

### Kubernetes 与云原生

| 书名 | 作者 | 说明 |
|------|------|------|
| 《Kubernetes in Action》第2版 | Marko Lukša | K8s 实践的最佳入门书 |
| 《Cloud Native Patterns》 | Cornelia Davis | 云原生设计模式 |
| 《Kubernetes: Up and Running》第3版 | Brendan Burns 等 | K8s 快速入门 |

---

## 博客与文章

| 标题 | 链接 | 说明 |
|------|------|------|
| Prometheus Blog | https://prometheus.io/blog/ | Prometheus 官方博客，发布新特性与最佳实践 |
| Grafana Labs Blog | https://grafana.com/blog/ | Grafana 生态的最新动态和技术分享 |
| Brian Brazil's Blog | https://www.robustperception.io/blog/ | Prometheus 核心维护者的技术博客 |
| Robust Perception | https://www.robustperception.io/ | Prometheus 咨询公司的博客，大量实战案例 |
| 《高基数监控》实践指南 | https://prometheus.io/blog/2020/08/07/high-cardinality/ | Prometheus 官方高基数问题讨论 |
| Thanos Blog | https://thanos.io/tip/thanos/getting-started.md/ | Thanos 项目博客 |
| VictoriaMetrics Blog | https://victoriametrics.com/blog/ | VictoriaMetrics 团队的技术博客 |

---

## 视频与课程

| 资源 | 平台 | 说明 |
|------|------|------|
| Prometheus 官方培训 | https://training.prometheus.io/ | 官方免费培训课程 |
| Grafana 认证 | https://grafana.com/training/ | Grafana 官方认证课程 |
| KubeCon + CloudNativeCon | https://www.youtube.com/@CNCF | CNCF 会议 Prometheus 相关演讲 |
| 《Prometheus 监控实战》 | Bilibili / YouTube | 社区中文视频教程 |

---

## 实用工具与网站

| 工具 | 链接 | 说明 |
|------|------|------|
| PromQL 在线调试 | https://prometheus.io/playground/ | 官方在线 PromQL Playground |
| Prometheus 数据生成器 | https://github.com/kfox1111/prometheus-generator | 生成模拟指标数据用于测试 |
| promdump | https://github.com/iansinnott/promdump | Prometheus 数据导出工具 |
| Prometheus-metrics-parser | https://github.com/mattbostock/prometheus-metrics-parser | Prometheus 文本协议解析器 |
| promql-langserver | https://github.com/prometheus-community/promql-langserver | PromQL 语言服务器（IDE 支持） |
| Grafana Dashboards 市场 | https://grafana.com/grafana/dashboards/ | 社区贡献的 Dashboard 模板 |
| Awesome Prometheus | https://github.com/roaldnefs/awesome-prometheus | Prometheus 生态资源汇总 |

---

## 按章节索引

| 章节 | 核心参考 |
|:----:|---------|
| 第1章 | Borgmon 论文、Prometheus 官方文档—数据模型、Pull vs Push 对比 |
| 第2章 | Gorilla 论文、Prometheus TSDB 源码、promtool 分析工具 |
| 第3章 | Micrometer 文档、Spring Boot Actuator 文档、高基数博客 |
| 第4章 | Prometheus Operator 文档、kube-state-metrics 文档、cAdvisor 文档 |
| 第5章 | Blackbox Exporter 文档、SLA 计算方法 |
| 第6章 | PromQL 官方文档、Recording Rules 文档、Prometheus Playground |
| 第7章 | Alertmanager 配置文档、Webhook 集成指南 |
| 第8章 | Thanos 文档、VictoriaMetrics 文档、Cortex 文档 |
| 第9章 | promtool tsdb analyze、TSDB status API、WAL 恢复指南 |
| 第10章 | Go GC 调优文档、Prometheus 命令行参数、Remote Write 调优 |
| 第11章 | prometheus/client_golang、prometheus/client_python、Collector 接口文档 |
| 第12章 | OTel Exemplar 文档、Loki 文档、Tempo 文档、Grafana Derived Fields |
| 第13章 | RED 方法论文、USE 方法论文、Prometheus 指标命名规范 |
| 附录 E | OTel 官方文档、OTel Semantic Conventions、OTel Collector 配置 |
