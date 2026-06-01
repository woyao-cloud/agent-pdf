# 第6章 日志收集

## 6.1 场景故事：从SSH到集中式日志平台

### 传统日志查看的狼狈

在很多团队中，排查线上问题的方式仍然停留在"SSH到服务器上grep日志"的阶段。这个流程通常是这样：

1. **定位问题服务**：告警通知某个接口返回了500错误，但分布式系统中可能有10个甚至50个微服务实例，先在Kubernetes Dashboard上找到是哪个Pod异常。
2. **SSH到目标服务器**：获取Pod所在的Node IP，SSH登录上去。
3. **用命令查看日志**：`kubectl logs --tail=500 pod-name` 查看最近500行日志。如果日志量很大，或者问题发生在几个小时前，需要加上时间范围过滤：`kubectl logs --since=2h pod-name | grep "ERROR"`。
4. **在多个节点间切换**：如果问题可能涉及多个服务实例，需要在不同Pod之间反复切换查看。

这种方式在以下场景中几乎不可行：
- **问题发生在数小时或数天前**：日志已经被轮转（rotated）了
- **涉及多个服务的关联排查**：需要在多个Pod的日志之间跳转，手动关联时间戳
- **流量异常时日志量大增**：grep命令需要扫描海量日志，响应极慢

### 集中式日志平台的解决方案

一个成熟的集中式日志平台（ELK Stack + Kafka）让这一切变得简单：

```yaml
# 部署在Kubernetes中的日志采集架构
[Pod-1] → Filebeat (Sidecar)
[Pod-2] → Filebeat (Sidecar)       → Kafka
[Pod-3] → Filebeat (Sidecar)          ↓
[Pod-4] → Filebeat (Sidecar)       Logstash
                                       ↓
                                  Elasticsearch
                                       ↓
                                  Kibana (搜索、可视化)
```

在Kibana中，开发者可以：
- **通过简单搜索框查询**：输入 `level:ERROR AND service:order-service` 即可查看所有订单服务的错误日志
- **关联多个服务的日志**：用 `traceId:"abc123"` 搜索一次HTTP请求经过的所有服务的完整日志链路
- **查看历史趋势**：Kibana的图表功能可以展示过去7天各服务的错误率趋势图

## 6.2 实现原理

### 为什么需要Kafka做缓冲层

在日志收集中，Kafka扮演的角色不是"消息队列"，而是**削峰填谷的缓冲区**。它的价值在流量高峰期得到了充分体现：

没有Kafka时：
```
流量突发 → Logstash/ES处理不过来 → 日志堆积在Logstash内存中
         → Logstash OOM → 日志采集系统崩溃 → 所有日志丢失
```

有Kafka时：
```
流量突发 → Filebeat快速写入Kafka（不管ES是否处理得过来）
         → 日志到达Kafka即"安全落地"（写入磁盘）
         → Logstash/ES按自己的节奏缓慢消费Kafka
         → 即使ES宕机，日志在Kafka中完整保留，ES恢复后可继续消费
```

### 日志的生命周期

一条日志从产生到被查询，经历以下阶段：

1. **应用产生日志**：Java应用通过Logback/Log4j2输出日志，格式化为JSON结构化日志
2. **Filebeat采集**：Filebeat作为Sidecar容器运行在应用Pod中，监听日志文件的变化
3. **写入Kafka**：Filebeat将新产生的日志行批量发送到Kafka的 `app-logs` Topic
4. **Logstash消费**：Logstash从Kafka消费日志，进行过滤、格式转换、字段提取
5. **写入Elasticsearch**：Logstash将处理后的日志批量写入ES，按天创建索引（如 `app-logs-2024.10.01`）
6. **Kibana展示**：用户通过Kibana的Discover页面搜索和查看日志

### Docker Compose环境

```yaml
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
    mem_limit: 2g  # ES很吃内存，至少分配2GB

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

Logstash配置将Kafka中的日志解析后写入Elasticsearch：
```
input {
  kafka {
    bootstrap_servers => "kafka:9092"
    topics => ["app-logs"]
    group_id => "logstash"
    codec => "json"
    consumer_threads => 3
    auto_offset_reset => "latest"
  }
}

filter {
  # 如果日志不是JSON格式，使用grok解析
  if [message] {
    grok {
      match => { "message" => "%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{DATA:logger} - %{GREEDYDATA:msg}" }
    }
  }
  
  # 添加时间戳字段用于ES的@timestamp
  date {
    match => ["timestamp", "ISO8601"]
    target => "@timestamp"
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "app-logs-%{+YYYY.MM.dd}"
    # 批量写入，提高吞吐
    flush_size => 500
    idle_flush_time => 5
  }
}
```

### Java结构化日志

```java
// logback-spring.xml — 输出JSON格式的结构化日志
<configuration>
    <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <!-- 包含全链路追踪ID -->
            <includeMdcKeyName>traceId</includeMdcKeyName>
            <includeMdcKeyName>spanId</includeMdcKeyName>
            <includeMdcKeyName>userId</includeMdcKeyName>
            <!-- 定义固定的自定义字段 -->
            <customFields>{
                "service":"order-service",
                "env":"production",
                "node":"${HOSTNAME}"
            }</customFields>
        </encoder>
    </appender>
    
    <!-- 同步日志配置（用于Kafka Appender） -->
    <appender name="KAFKA" class="com.example.KafkaAppender">
        <topic>app-logs</topic>
        <bootstrapServers>localhost:9092</bootstrapServers>
    </appender>
    
    <root level="INFO">
        <appender-ref ref="JSON"/>
        <appender-ref ref="KAFKA"/>
    </root>
</configuration>
```

这样输出的日志在Kibana中可以直接用字段名搜索，比如 `service:order-service AND level:ERROR` 就能快速定位订单服务的所有错误日志。

## 6.3 关键配置与优化

### 日志Topic的配置建议

```properties
# 日志Topic的保留策略
log.retention.hours=72           # 日志保留3天，超过后删除
log.retention.bytes=107374182400 # 每个分区最多100GB，防止日志撑满磁盘
# 日志量大的场景增加分区
partitions=12                    # 提高日志并行消费能力
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **日志丢失** | 异步发送可能丢失日志 | 同步发送（性能换可靠性） |
| **业务延迟** | 同步发送阻塞业务线程 | 独立线程池/使用异步appender |
| **磁盘爆满** | 日志量过大 | 设置Topic保留时间和大小 |
| **日志格式不统一** | 各团队日志格式各异 | 统一日志规范 + JSON结构化 |

日志采集影响业务性能怎么办？推荐方案是本地缓冲区：先写入本地文件，Filebeat采集本地文件发送到Kafka，即使Kafka不可用，日志也不丢失（因为日志都在本地文件中）。