#!/bin/bash
# Pull 模型压力测试脚本
# 模拟 Prometheus 以不同的抓取间隔拉取 Pull App 指标
#
# 用法: ./benchmark-pull.sh [抓取间隔秒] [抓取次数]
# 默认: 间隔 1s，共 10 次

INTERVAL=${1:-1}
COUNT=${2:-10}
TARGET_URL="http://localhost:8080/metrics"

echo "========================================="
echo "Pull 模型压力测试"
echo "========================================="
echo "抓取间隔: ${INTERVAL}s"
echo "抓取次数: $COUNT"
echo "目标: $TARGET_URL"
echo "========================================="

TOTAL_TIME=0
SUCCESS=0
FAIL=0

for i in $(seq 1 $COUNT); do
    START=$(date +%s%N)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL")
    END=$(date +%s%N)
    ELAPSED=$(( (END - START) / 1000000 ))
    TOTAL_TIME=$((TOTAL_TIME + ELAPSED))

    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS=$((SUCCESS + 1))
        echo "  第 ${i} 次: ${ELAPSED}ms ✓"
    else
        FAIL=$((FAIL + 1))
        echo "  第 ${i} 次: ${ELAPSED}ms ✗ (HTTP $HTTP_CODE)"
    fi

    if [ $i -lt $COUNT ]; then
        sleep $INTERVAL
    fi
done

echo ""
echo "结果统计:"
echo "  成功: $SUCCESS / $COUNT"
echo "  失败: $FAIL"
echo "  平均延迟: $((TOTAL_TIME / COUNT))ms"
echo ""
echo "========================================="
echo "Pull 模型优势：Server 控制抓取节奏，"
echo "不会出现 Push 的雪崩效应。"
echo "即使目标响应变慢，也只是单个抓取超时，"
echo "不影响其他目标的采集。"
echo "========================================="
