#!/bin/bash
# Pull 模型压力测试脚本
# 模拟 Prometheus 的 Pull 行为，向 pull-app 发起 scrape 请求
# 对比 Push 模型在相同并发下的表现
#
# 用法: ./benchmark-pull.sh [抓取次数] [间隔秒数]
# 默认: 抓取 50 次，间隔 2s

COUNT=${1:-50}
INTERVAL=${2:-2}
URL="http://localhost:8081/metrics"

echo "========================================="
echo "Pull 模型压力测试（模拟 Prometheus Scrape）"
echo "========================================="
echo "抓取次数:   $COUNT"
echo "抓取间隔:   ${INTERVAL}s"
echo "目标地址:   $URL"
echo "========================================="

SUCCESS=0
FAILED=0
TOTAL_TIME=0

for i in $(seq 1 $COUNT); do
    START_TIME=$(date +%s%N)

    HTTP_CODE=$(curl -s -o /tmp/pull-metrics.txt -w "%{http_code}" "$URL" --max-time 5)

    END_TIME=$(date +%s%N)
    REQ_TIME=$(( (END_TIME - START_TIME) / 1000000 ))
    TOTAL_TIME=$((TOTAL_TIME + REQ_TIME))

    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS=$((SUCCESS + 1))
        echo "[$i] ✓ ${REQ_TIME}ms — $(wc -l < /tmp/pull-metrics.txt) 行指标"
    else
        FAILED=$((FAILED + 1))
        echo "[$i] ✗ HTTP $HTTP_CODE — ${REQ_TIME}ms"
    fi

    sleep $INTERVAL
done

echo "========================================="
echo "测试完成"
echo "成功: $SUCCESS | 失败: $FAILED"
echo "平均延迟: $(( TOTAL_TIME / COUNT ))ms"
echo "========================================="