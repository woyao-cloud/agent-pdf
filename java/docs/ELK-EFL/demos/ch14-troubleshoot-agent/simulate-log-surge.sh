#!/bin/bash
# ============================================
# 第14章 —— 模拟日志暴涨
# 向 ES 快速写入大量日志，模拟高负载场景
# ============================================
# 用法：bash ch14-troubleshoot-agent/simulate-log-surge.sh [条数]

COUNT=${1:-10000}
ES_HOST="${ES_HOST:-http://localhost:9200}"

echo "===== 模拟日志暴涨 ====="
echo "将要写入 $COUNT 条日志到 ES..."

# 用 curl 模拟大量日志写入
for i in $(seq 1 $COUNT); do
  curl -s -X POST "$ES_HOST/app-logs/_doc" \
    -H 'Content-Type: application/json' \
    -d "{
      \"@timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
      \"level\": \"ERROR\",
      \"message\": \"模拟错误日志 #$i\",
      \"serviceName\": \"stress-test\",
      \"traceId\": \"stress-$i\"
    }" > /dev/null

  if [ $((i % 1000)) -eq 0 ]; then
    echo "... 已写入 $i 条"
  fi
done

echo "写入完成！共写入 $COUNT 条日志"

# 检查写入结果
echo ""
echo ">>> 查看索引状态:"
curl -s "$ES_HOST/_cat/indices/app-logs-*?v&h=index,docs.count,store.size"