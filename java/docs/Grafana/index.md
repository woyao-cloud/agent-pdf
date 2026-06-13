# 《深入理解 Grafana：数据可视化原理、多源集成与可观测性平台实战》

> 本书旨在打破"Grafana 只是一个画图工具"的刻板印象，将其还原为**企业级可观测性数据的调度、计算与渲染中枢**。从底层 Go 语言架构与 Data Frame 数据模型切入，深度剖析其与各类异构数据源的集成原理，并提供企业级高可用部署与"配置即代码（Provisioning）"的实战指南。

## 内容结构

### 第一部分：解密 Grafana——底层架构与工作原理
| 章节 | 主题 | 实验 |
|------|------|------|
| [第1章：核心架构与组件](PART1-Architecture/01-Core-Architecture.md) | HTTP Server、Data Proxy、Query Engine、渲染服务 | [基础搭建实验](labs/ch01-basic-setup/README.md) |
| [第2章：Data Frame 数据模型](PART1-Architecture/02-Data-Frame.md) | 字段、标签、宽表与长表、数据流转链路 | — |

### 第二部分：多数据源集成与生态协同
| 章节 | 主题 | 实验 |
|------|------|------|
| [第3章：时序指标集成（Prometheus / VictoriaMetrics）](PART2-DataSources/03-Prometheus-Metrics.md) | PromQL 透传、RED 大盘、同环比计算 | [Prometheus 集成实验](labs/ch03-prometheus/README.md) |
| [第4章：日志系统集成（Loki）](PART2-DataSources/04-Loki-Logs.md) | LogQL、Derived Fields、Metrics from Logs | [Loki 集成实验](labs/ch04-loki/README.md) |
| [第5章：链路追踪集成（Tempo / Jaeger）](PART2-DataSources/05-Tempo-Traces.md) | TraceQL、Service Graph、火焰图 | [Tempo 集成实验](labs/ch05-tempo/README.md) |
| [第6章：关系型数据库与 API 集成](PART2-DataSources/06-SQL-API.md) | SQL 宏、JSON API、Infinity 插件 | [SQL 数据源实验](labs/ch06-sql/README.md) |

### 第三部分：高级可视化与仪表盘工程化设计
| 章节 | 主题 | 实验 |
|------|------|------|
| [第7章：变量与动态交互](PART3-Visualization/07-Variables.md) | 链式变量、全局变量、动态 Dashboard | [变量实验](labs/ch07-variables/README.md) |
| [第8章：数据转换（Transformations）](PART3-Visualization/08-Transformations.md) | Join、Reduce、字段计算、前端 ETL | [Transformations 实验](labs/ch08-transformations/README.md) |
| [第9章：注解与事件标记](PART3-Visualization/09-Annotations.md) | 发布标记、告警事件叠加 | — |

### 第四部分：新一代统一告警引擎
| 章节 | 主题 | 实验 |
|------|------|------|
| [第10章：统一告警架构](PART4-Alerting/10-Unified-Alerting.md) | Evaluation Groups、多条件表达式、跨数据源告警 | [告警实验](labs/ch10-alerting/README.md) |
| [第11章：告警路由与消息模板](PART4-Alerting/11-Alert-Routing.md) | 通知策略、Go Template、钉钉/飞书集成 | — |

### 第五部分：企业级高可用部署与配置即代码
| 章节 | 主题 | 实验 |
|------|------|------|
| [第12章：配置即代码（Provisioning）](PART5-Deployment/12-Provisioning.md) | GitOps、数据源/大盘/告警自动化注入 | [Provisioning 实验](labs/ch12-provisioning/README.md) |
| [第13章：高可用集群部署](PART5-Deployment/13-HA-Deployment.md) | MySQL 共享存储、Redis Session、独立渲染 | [高可用实验](labs/ch13-ha/README.md) |
| [第14章：多租户与 SSO 集成](PART5-Deployment/14-Multi-Tenant.md) | Orgs、Teams、RBAC、OAuth2/LDAP | — |

### 第六部分：生产排障与插件开发
| 章节 | 主题 | 实验 |
|------|------|------|
| [第15章：生产环境典型问题排查](PART6-Troubleshooting/15-Troubleshooting.md) | 查询超时、渲染崩溃、Proxy 错误 | [排障实验](labs/ch15-troubleshooting/README.md) |
| [第16章：Grafana 插件开发入门](PART6-Troubleshooting/16-Plugin-Dev.md) | Panel/Data Source/App 插件、SDK | — |

### 附录
| 章节 | 主题 |
|------|------|
| [附录 A：快捷键与操作效率指南](appendices/A-shortcuts.md) | 键盘快捷键、UI 操作技巧 |
| [附录 B：Dashboard JSON 模型结构](appendices/B-dashboard-json.md) | JSON 结构解析、批量修改 |
| [附录 C：常用社区插件推荐](appendices/C-plugins.md) | Polystat、Flowcharting、Business Text 等 |
| [附录 D：配置参数与安全加固](appendices/D-config-reference.md) | grafana.ini 速查、安全 Checklist |

## 快速开始

```bash
# 基础搭建：单节点 Grafana + Prometheus
cd labs/ch01-basic-setup
docker compose up -d

# Prometheus 数据源集成实验
cd labs/ch03-prometheus
docker compose up -d
```

## 环境要求
- Docker & Docker Compose
- 浏览器（访问 Grafana UI http://localhost:3000）
- 可选：Kubernetes 集群（用于第4-5章）
