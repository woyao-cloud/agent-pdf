# 第6章 日志收集

## 场景描述

集中式日志收集是Kafka最成熟的应用场景之一。将分布式系统中所有服务的日志统一收集到Kafka，再通过Logstash/Fluentd消费并写入Elasticsearch，实现集中式日志查询和分析。

### 解决的问题

```
传统日志：ssh到每台机器 → grep/less查找 → 效率极低
Kafka日志：所有日志 → Kafka → Elasticsearch → Kibana可视搜索
```

### 实现原理

```
[应用1] → Filebeat → Kafka → Logstash → Elasticsearch → Kibana
[应用2] → Filebeat → Kafka → Logstash → Elasticsearch → Kibana
[应用3] → Filebeat → Kafka → Logstash → Elasticsearch → Kibana

                    ↓ Kafka作为日志缓冲区
                    ↓ 削峰填谷：突发日志不会冲垮ES
                    ↓ 解耦：日志生产和消费独立扩展
```

### Docker Compose（ELK + Kafka）

```yaml
# docker/scenario-06-logging/docker-compose.yml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    ports: ["9092:9092"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.10.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports: ["9200:9200"]

  kibana:
    image: docker.elastic.co/kibana/kibana:8.10.0
    depends_on: [elasticsearch]
    ports: ["5601:5601"]
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200

  logstash:
    image: docker.elastic.co/logstash/logstash:8.10.0
    depends_on: [kafka, elasticsearch]
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
```

**logstash.conf**：
```
input {
  kafka {
    bootstrap_servers => "kafka:9092"
    topics => ["app-logs"]
    group_id => "logstash"
    codec => "json"
  }
}

filter {
  # 解析日志级别、时间等
  grok {
    match => { "message" => "%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{GREEDYDATA:msg}" }
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "app-logs-%{+YYYY.MM.dd}"
  }
}
```

### Java示例代码

```java
// ============ 1. 自定义日志Appender ============
public class KafkaAppender extends AppenderBase<ILoggingEvent> {
    private KafkaTemplate<String, String> kafkaTemplate;
    private String topic = "app-logs";
    
    @Override
    protected void append(ILoggingEvent event) {
        if (kafkaTemplate == null) return;
        
        try {
            LogMessage log = new LogMessage();
            log.setTimestamp(event.getTimeStamp());
            log.setLevel(event.getLevel().toString());
            log.setLogger(event.getLoggerName());
            log.setThread(event.getThreadName());
            log.setMessage(event.getFormattedMessage());
            log.setServiceName(System.getenv("SERVICE_NAME"));
            log.setHost(InetAddress.getLocalHost().getHostName());
            
            kafkaTemplate.send(topic, objectMapper.writeValueAsString(log));
        } catch (Exception e) {
            // 日志收集失败不应影响主业务
            addError("Failed to send log to Kafka", e);
        }
    }
}
```

```java
// ============ 2. Spring Boot集成Logback ============
// logback-spring.xml
<appender name="KAFKA" class="com.example.KafkaAppender">
    <topic>app-logs</topic>
</appender>

<root level="INFO">
    <appender-ref ref="KAFKA"/>
</root>

// application.yml
kafka:
  bootstrap-servers: localhost:9092
  topic: app-logs
```

```java
// ============ 3. 结构化日志 ============
// 使用logstash-logback-encoder生成JSON格式日志
<appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <includeContext>false</includeContext>
        <customFields>{"service":"order-service","env":"prod"}</customFields>
    </encoder>
</appender>
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **日志丢失** | 异步发送可能丢失日志 | 同步发送（性能换可靠性） |
| **业务延迟** | 同步发送阻塞业务线程 | 独立线程池/使用异步appender |
| **磁盘爆满** | 日志量过大 | 设置Topic保留时间和大小 |
| **日志格式不统一** | 各团队日志格式各异 | 统一日志规范 + JSON结构化 |

**优化配置**：
```properties
# Topic日志保留策略
log.retention.hours=72           # 保留72小时
log.retention.bytes=1073741824   # 每个分区最大1GB

# 如果日志量巨大，使用多个分区
partitions=12                    # 提高日志并行消费能力
```

### 典型问题处理

**问题：日志采集影响业务性能怎么办？**

```
方案1：异步日志发送（推荐）
- 使用独立的线程池发送日志到Kafka
- 日志发送失败不影响主业务

方案2：采样率控制
- 低级别日志采样（如DEBUG 10%概率发送）
- ERROR级别全量发送

方案3：本地缓冲区
- 先写入本地文件
- Filebeat/Logstash采集本地文件发送到Kafka
- 即使Kafka不可用，日志不丢失
```

### 关键技能

- 熟悉ELKB（Elasticsearch + Logstash + Kibana + Beats）栈
- 掌握JSON结构化日志
- 了解日志采样和降级策略
- 理解日志保留策略和数据生命周期管理
