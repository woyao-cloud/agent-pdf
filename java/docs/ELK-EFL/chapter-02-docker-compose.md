# 第2章 一键拉起基础设施（Docker Compose 实战）

## 本章导读

一个常见但让人崩溃的场景：你在本地搭了一个 ELK 环境，调试了一整天终于跑通了。但当你把配置发给同事后，同事的机器上却怎么都跑不起来——版本不对、路径不同、内核参数没配、卷权限问题……

为了避免这种"在我机器上能跑"的困境，本章提供一套**经过验证的、可直接启动的** Docker Compose 配置。所有的版本、路径、环境变量都写在同一个文件里。你只需要执行 `docker-compose up -d`，然后等两分钟——一个包含 ES 集群、Kibana、Kafka、Logstash 的完整日志平台就起来了。

---

## 2.1 宿主机内核参数

在启动 Docker 容器之前，**必须**调整宿主机内核参数。ES 对系统参数有硬性要求：

```bash
# ⚠️ 以下必须在宿主机（非容器内）执行
# 如果没有这些配置，ES 节点会启动失败

# 1. ES 必需的虚拟内存映射数
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# 2. 文件描述符限制（日志系统会打开大量文件）
echo '* soft nofile 65535
* hard nofile 65535' | sudo tee -a /etc/security/limits.conf

# 3. 禁用 Swap（ES 强烈建议）
sudo swapoff -a

# 4. 验证
sysctl vm.max_map_count
ulimit -n
```

---

## 2.2 企业级 docker-compose.yml

```yaml
# docker-compose.yml
# 一键启动：docker-compose up -d
# 停止并清理：docker-compose down -v（-v 会删除数据卷）
# 查看日志：docker-compose logs -f

version: '3.8'

x-es-common: &es-common
  image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
  environment:
    - cluster.name=elk-cluster
    - bootstrap.memory_lock=true
    - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    - xpack.security.enabled=false
    - xpack.security.http.ssl.enabled=false
  ulimits:
    memlock: { soft: -1, hard: -1 }
    nofile: { soft: 65535, hard: 65535 }
  networks:
    - elastic

services:
  # ===================== ES 集群 =====================
  es-node1:
    <<: *es-common
    container_name: es-node1
    hostname: es-node1
    environment:
      - node.name=es-node1
      - discovery.seed_hosts=es-node2,es-node3
      - cluster.initial_master_nodes=es-node1,es-node2,es-node3
    volumes:
      - es_data1:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"

  es-node2:
    <<: *es-common
    container_name: es-node2
    hostname: es-node2
    environment:
      - node.name=es-node2
      - discovery.seed_hosts=es-node1,es-node3
      - cluster.initial_master_nodes=es-node1,es-node2,es-node3
    volumes:
      - es_data2:/usr/share/elasticsearch/data

  es-node3:
    <<: *es-common
    container_name: es-node3
    hostname: es-node3
    environment:
      - node.name=es-node3
      - discovery.seed_hosts=es-node1,es-node2
      - cluster.initial_master_nodes=es-node1,es-node2,es-node3
    volumes:
      - es_data3:/usr/share/elasticsearch/data

  # ===================== Kibana =====================
  kibana:
    image: docker.elastic.co/kibana/kibana:8.12.0
    container_name: kibana
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://es-node1:9200
    networks:
      - elastic
    depends_on:
      - es-node1

  # ===================== Kafka =====================
  # 使用 KRaft 模式（不需要 Zookeeper）
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    container_name: kafka
    hostname: kafka
    ports:
      - "9092:9092"
    environment:
      # KRaft 模式配置
      - CLUSTER_ID=ELK-LOG-CLUSTER-001
      - KAFKA_NODE_ID=1
      - KAFKA_PROCESS_ROLES=broker,controller
      - KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093

      # 监听配置
      - KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092
      - KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      - KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER
      - KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT

      # Topic 配置
      - KAFKA_NUM_PARTITIONS=3
      - KAFKA_DEFAULT_REPLICATION_FACTOR=1
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1

      # 日志保留
      - KAFKA_LOG_RETENTION_HOURS=168    # 保留 7 天
      - KAFKA_LOG_SEGMENT_BYTES=1073741824  # 1GB 一个文件

      # 内存配置（非 JVM 环境使用 KAFKA_HEAP_OPTS）
      - KAFKA_HEAP_OPTS=-Xms512m -Xmx512m
    volumes:
      - kafka_data:/var/lib/kafka/data
    networks:
      - elastic

  # ===================== Logstash =====================
  logstash:
    image: docker.elastic.co/logstash/logstash:8.12.0
    container_name: logstash
    hostname: logstash
    ports:
      - "5044:5044"
    volumes:
      # Logstash Pipeline 配置文件
      - ./logstash/pipeline/logstash.conf:/usr/share/logstash/pipeline/logstash.conf:ro
      # Logstash 配置文件
      - ./logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
    environment:
      - LS_JAVA_OPTS=-Xms512m -Xmx512m
    networks:
      - elastic
    depends_on:
      - kafka
      - es-node1

volumes:
  es_data1:
  es_data2:
  es_data3:
  kafka_data:

networks:
  elastic:
    driver: bridge
```

---

## 2.3 Logstash Pipeline 配置

```conf
# logstash/pipeline/logstash.conf
# Logstash 主 Pipeline 配置
# 
# Input：从 Kafka 消费日志
# Filter：清洗、脱敏、路由
# Output：写入 ES 索引

input {
  beats {
    port => 5044        # Filebeat 的输入端口
    codec => json       # 直接接收 JSON 格式的数据
  }

  # 备用输入：直接从 Kafka 消费（当 Filebeat 输出到 Kafka 时）
  kafka {
    bootstrap_servers => "kafka:9092"
    topics => ["app-logs"]
    group_id => "logstash-consumer"
    codec => "json"
    consumer_threads => 3
    auto_offset_reset => "latest"
  }
}

filter {
  # 1. 日期格式化（确保 @timestamp 使用日志中的时间）
  date {
    match => ["timestamp", "ISO8601", "yyyy-MM-dd HH:mm:ss.SSS"]
    target => "@timestamp"
  }

  # 2. 敏感信息脱敏
  # 手机号脱敏：138****1234
  mutate {
    gsub => [
      "message", "(1[3-9]\\d)\\d{4}(\\d{4})", "\\1****\\2"
    ]
  }

  # 身份证脱敏
  mutate {
    gsub => [
      "message", "\\d{6}(\\d{8})\\d{4}", "******\\1****"
    ]
  }

  # 3. 根据日志级别动态索引路由
  # 在 Logstash 6.x+ 中，可以在 output 中动态设置 index
}

output {
  # ERROR 日志写入独立的 ERROR 索引（便于快速定位问题）
  if [level] == "ERROR" or [level] == "WARN" {
    elasticsearch {
      hosts => ["es-node1:9200", "es-node2:9200", "es-node3:9200"]
      index => "app-logs-error-%{+YYYY.MM.dd}"
      data_stream => false
    }
  }
  # INFO/DEBUG 日志写入主索引
  else {
    elasticsearch {
      hosts => ["es-node1:9200", "es-node2:9200", "es-node3:9200"]
      index => "app-logs-%{+YYYY.MM.dd}"
      data_stream => false
    }
  }
}
```

---

## 2.4 目录挂载与权限管理

```bash
# 创建必要的目录结构
mkdir -p logstash/pipeline logstash/config

# 创建 logstash.yml（最小配置）
cat > logstash/config/logstash.yml <<EOF
http.host: "0.0.0.0"
xpack.monitoring.elasticsearch.hosts: ["http://es-node1:9200"]
xpack.monitoring.enabled: false
EOF

# 创建 logstash.conf
# （内容在 2.3 节，复制到 logstash/pipeline/logstash.conf）

# 启动所有服务
docker-compose up -d

# 查看启动日志
docker-compose logs -f

# 等待约 1 分钟后验证
echo "===== 验证 ES 集群 ====="
curl -s http://localhost:9200/_cluster/health?pretty | jq '.status'

echo "===== 验证 Kafka ====="
docker exec kafka kafka-topics --bootstrap-server localhost:9092 --list

echo "===== 验证 Logstash ====="
docker logs logstash --tail 20
```

---

## 2.5 验证集群健康

```bash
# ES 集群健康
curl http://localhost:9200/_cluster/health?pretty
# 期望输出：status: "green"

# 节点列表
curl http://localhost:9200/_cat/nodes?v

# 创建应用日志模板（预先定义 Mapping）
curl -X PUT "http://localhost:9200/_index_template/app-logs-template" -H 'Content-Type: application/json' -d'
{
  "index_patterns": ["app-logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "refresh_interval": "5s"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":    { "type": "date" },
        "level":         { "type": "keyword" },
        "logger":        { "type": "keyword" },
        "thread":        { "type": "keyword" },
        "message":       { "type": "text" },
        "traceId":       { "type": "keyword" },
        "spanId":        { "type": "keyword" },
        "userId":        { "type": "keyword" },
        "tenantId":      { "type": "keyword" },
        "serviceName":   { "type": "keyword" },
        "duration":      { "type": "long" },
        "exception":     { "type": "text" },
        "stack_trace":   { "type": "text", "index": false }
      }
    }
  }
}'
```

---

## 本章总结

```bash
# 速查：一键启动 ELK 日志平台

# 1. 宿主机准备
sysctl -w vm.max_map_count=262144

# 2. 创建配置目录
mkdir -p logstash/pipeline logstash/config

# 3. 启动所有服务
docker-compose up -d

# 4. 等待就绪（约 1-2 分钟）
sleep 60

# 5. 验证
curl http://localhost:9200/_cluster/health   # green?
curl http://localhost:5601                    # Kibana 可用?

# 6. 打开 Kibana
open http://localhost:5601
```

**核心原则**：
1. **基础设施代码化**——所有配置写在一个 `docker-compose.yml` 中，任何人都可以在一台新机器上一键拉起
2. **提前创建 Index Template**——在写入任何日志之前定义好 Mapping。等日志写进去了再想改 Mapping 就晚了
3. **Logstash 的 Pipeline 配置是 ELK 的核心**——数据清洗、脱敏、路由都在这里。建议在开发环境的模拟数据上先验证 Pipeline 配置正确
4. **ELK 的启动顺序很重要**——ES 集群就绪 → Kafka 就绪 → Logstash 就绪 → Kibana 就绪。Logstash 可以接受数据但不会发到未就绪的 ES