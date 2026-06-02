#!/bin/bash
# ============================================
# 第14章 —— Kafka 消费 Lag 检查脚本
# 用法：bash ch14-troubleshoot-agent/check-kafka-lag.sh
# ============================================

ES_HOST="${ES_HOST:-http://localhost:9200}"
KAFKA_CONTAINER="${KAFKA_CONTAINER:-kafka}"

echo "===== Kafka 消费 Lag 检查 ====="
echo ""

# 1. 检查 Kafka 消费者组
echo ">>> Kafka 消费者组状态:"
docker exec $KAFKA_CONTAINER kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group logstash-elk \
  --describe 2>/dev/null || echo "⚠️  消费者组 logstash-elk 不存在（可能 Logstash 未启动或未连接 Kafka）"

echo ""

# 2. 检查 ES 线程池
echo ">>> ES 写入线程池状态:"
curl -s "$ES_HOST/_cat/thread_pool/write?v=true&h=name,active,queue,rejected,completed" 2>/dev/null

echo ""

# 3. 检查 ES 磁盘使用率
echo ">>> ES 磁盘使用率:"
curl -s "$ES_HOST/_cat/allocation?v&h=node,disk.percent,disk.used,disk.avail" 2>/dev/null

echo ""
echo "===== 检查完成 ====="