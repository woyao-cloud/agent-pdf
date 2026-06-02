# ELK/EFK 演示项目

本书所有章节的可运行示例代码与配置。每个章节对应 `chXX-*/` 目录，可直接启动。

## 前置条件

- Docker Desktop 4.0+ （支持 docker compose）
- 宿主机已配置：`sysctl -w vm.max_map_count=262144`
- 如只运行 Spring Boot 应用（第3、4章），需 JDK 17+ 和 Maven 3.8+

## 快速开始

```bash
# 1. 启动共享基础设施（ES 集群 + Kafka + Kibana + Logstash）
docker compose up -d

# 2. 验证基础设施就绪
curl http://localhost:9200/_cluster/health
# 预期：status 为 "green"

# 3. 设置 ILM 策略
bash ch08-ilm/setup.sh

# 4. 打开 Kibana
open http://localhost:5601

# 5. 按需运行各章节示例（见各章 README）
```

## 目录结构

| 目录 | 对应章节 | 内容 |
|------|---------|------|
| `shared/` | — | 共享父 POM 和 logback 配置 |
| `ch03-json-logging/` | 第3章 | Spring Boot JSON 日志输出 |
| `ch04-traceid/` | 第4章 | 3 微服务 TraceId 透传 |
| `ch05-filebeat/` | 第5章 | Filebeat 直连 ES 配置 |
| `ch06-kafka-logstash/` | 第6章 | Filebeat → Kafka → Logstash |
| `ch07-fluentbit/` | 第7章 | Fluent Bit 日志采集 |
| `ch08-ilm/` | 第8章 | ILM 索引生命周期脚本 |
| `ch10-alerting/` | 第10章 | 告警规则配置 |
| `ch11-troubleshooting/` | 第11章 | 排障验证脚本 |
| `ch12-audit/` | 第12章 | 审计日志独立通道 |
| `ch13-bi-metrics/` | 第13章 | 业务指标日志 |
| `ch14-agent-troubleshoot/` | 第14章 | 采集端排坑 |
| `ch15-es-troubleshoot/` | 第15章 | ES 灾难恢复 |
| `ch16-jvm-tuning/` | 第16章 | JVM 调优脚本 |

## 各章独立启动

每个章节可独立启动：

```bash
# 第3章：编译并运行 Spring Boot 应用
cd ch03-json-logging
mvn spring-boot:run

# 第5章：启动 Filebeat
docker compose -f ch05-filebeat/docker-compose.yml up -d

# 其他章节同理
```

## 清理

```bash
# 停止所有容器并删除数据
docker compose down -v
```