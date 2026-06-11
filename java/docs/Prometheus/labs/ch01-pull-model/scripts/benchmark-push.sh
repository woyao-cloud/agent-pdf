#!/bin/bash
# Push 模型压力测试脚本
# 向 push-server 并发发送指标，观察 Push 模型在高负载下的表现
#
# 用法: ./benchmark-push.sh [并发数] [总请求数]
# 默认: 并发 50，总请求 500

CONCURRENCY=${1:-50}
TOTAL=${2:-500}
URL="http://localhost:5001/push"

echo "========================================="
echo "Push 模型压力测试"
echo "========================================="
echo "并发数:      $CONCURRENCY"
echo "总请求数:    $TOTAL"
echo "目标地址:    $URL"
echo "========================================="

START_TIME=$(date +%s%N)

for i in $(seq 1 $TOTAL); do
    (
        METHOD=$(shuf -n1 -e "GET" "POST" "PUT")
        ENDPOINT=$(shuf -n1 -e "/api/users" "/api/orders" "/api/products" "/api/auth")
        STATUS=$(shuf -n1 -e "200" "201" "400" "500")

        curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
            -X POST "$URL" \
            -H "Content-Type: application/json" \
            -d "{\"metric\":\"http_requests_total\",\"value\":1,\"labels\":{\"method\":\"$METHOD\",\"endpoint\":\"$ENDPOINT\",\"status\":\"$STATUS\"}}" &

        if [ $((i % CONCURRENCY)) -eq 0 ]; then
            wait
        fi
    ) &
done

wait

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

echo "========================================="
echo "测试完成"
echo "总耗时:      ${DURATION}ms"
echo "吞吐量:      $(( TOTAL * 1000 / DURATION )) req/s"
echo "========================================="
echo ""
echo "检查 Push 服务器状态:"
curl -s http://localhost:5001/status | python -m json.tool