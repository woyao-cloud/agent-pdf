#!/bin/bash
# Push 模型压力测试脚本
# 模拟大量 Agent 同时向 Push Server 上报指标
#
# 用法: ./benchmark-push.sh [并发数] [请求总数]
# 默认: 并发 50，总共 500 请求

CONCURRENCY=${1:-50}
TOTAL=${2:-500}
SERVER_URL="http://localhost:5000/push"

echo "========================================="
echo "Push 模型压力测试"
echo "========================================="
echo "并发数: $CONCURRENCY"
echo "总请求: $TOTAL"
echo "目标: $SERVER_URL"
echo "========================================="

# 使用平行请求模拟并发上报
seq 1 $TOTAL | xargs -P $CONCURRENCY -I {} sh -c '
  curl -s -X POST '"$SERVER_URL"' \
    -H "Content-Type: application/json" \
    -d "{\"metric\":\"test_metric\",\"value\":$RANDOM}" \
    -o /dev/null -w "%{http_code}\n"
' | sort | uniq -c | sort -rn

echo ""
echo "Push Server 状态:"
curl -s http://localhost:5000/status | python -m json.tool

echo ""
echo "========================================="
echo "测试完成"
echo "注意：Push Server 在处理大量并发时，"
echo "响应延迟会显著增加（雪崩效应）。"
echo "========================================="
