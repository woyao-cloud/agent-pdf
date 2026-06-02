# ELK/EFK 演示项目

本书所有章节的可运行示例代码与配置。每个章节对应 `chXX-*/` 目录。

## 前置条件

- Docker Desktop 4.0+（支持 docker compose）
- 宿主机已配置：`sysctl -w vm.max_map_count=262144`
- Java 演示（第3、4、12、13章）需 JDK 17+ 和 Maven 3.8+

## 快速开始

```bash
# 1. 启动共享基础设施（ES 集群 + Kafka + Kibana + Logstash）
docker compose up -d

# 2. 等待集群就绪（约 30-60 秒）
curl http://localhost:9200/_cluster/health
# 预期：status 为 "green"

# 3. 创建索引模板（必须！否则 Kibana 无法创建 Data View）
bash ch08-ilm/setup.sh

# 4. 确认模板已创建
curl http://localhost:9200/_index_template/app-logs-template

# 5. 打开 Kibana
open http://localhost:5601

# 6. 按需运行各章节示例
```

## Kibana Data View 创建

```bash
# 步骤 5 之后：
# Kibana → Management → Stack Management → Data Views
# → Create Data View
# Name: app-logs
# Index pattern: app-logs-*
# Timestamp field: @timestamp
```

> **注意**：如果显示 "No data"，请确保：
> 1. 已运行 `bash ch08-ilm/setup.sh` 创建了 Index Template
> 2. 已写入至少一条日志到 ES（如通过第3章的 Spring Boot 应用）

## 启动顺序速查

```
任何章节的启动顺序都是：

  第 1 步：启动基础设施（有 ES + Kibana 的 compose）
  第 2 步：创建索引模板（bash ch08-ilm/setup.sh）
  第 3 步：启动本章的应用或采集器
  第 4 步：产生数据
  第 5 步：在 Kibana 中创建/刷新 Data View
```

## 目录结构

| 目录 | 对应章节 | 内容 |
|------|---------|------|
| `ch03-json-logging/` | 第3章 | Spring Boot JSON 日志输出 |
| `ch04-traceid/` | 第4章 | 3 微服务 TraceId 透传 |
| `ch05-filebeat/` | 第5章 | Filebeat 直连 ES（**内置完整基础设施**） |
| `ch06-kafka-logstash/` | 第6章 | Filebeat → Kafka → Logstash 配置 |
| `ch07-fluentbit/` | 第7章 | Fluent Bit 日志采集 |
| `ch08-ilm/` | 第8章 | ILM 索引生命周期脚本 |
| `ch10-alerting/` | 第10章 | 告警规则配置 |
| `ch12-audit/` | 第12章 | 审计日志独立通道 |
| `ch13-bi-metrics/` | 第13章 | 业务指标日志 |
| `ch14-troubleshoot-agent/` | 第14章 | 采集端排坑 |
| `ch15-troubleshoot-es/` | 第15章 | ES 灾难恢复 |
| `ch16-jvm-tuning/` | 第16章 | JVM 调优脚本 |
| `shared/` | — | 共享父 POM 和 logback 配置 |

## 清理

```bash
# 停止所有容器并删除数据
docker compose down -v
```