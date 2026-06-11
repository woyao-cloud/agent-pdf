#!/bin/bash
TOTAL=${1:-200}
USERS=${2:-100}
BASE_URL="http://localhost:8085"

echo "========================================="
echo "Spring Boot 流量生成器"
echo "========================================="
echo "总请求: $TOTAL"
echo "模拟用户: $USERS"
echo "========================================="

for i in $(seq 1 $TOTAL); do
    USER_ID=$(( RANDOM % USERS + 1 ))
    ENDPOINT=$(( RANDOM % 3 ))

    case $ENDPOINT in
        0)
            curl -s -o /dev/null "$BASE_URL/api/user/$USER_ID/profile"
            ;;
        1)
            ORDER_ID=$(( RANDOM % 10000 + 1 ))
            curl -s -o /dev/null "$BASE_URL/api/user/$USER_ID/order/$ORDER_ID"
            ;;
        2)
            curl -s -o /dev/null -X POST "$BASE_URL/api/order/create?userId=$USER_ID"
            ;;
    esac

    if [ $((i % 50)) -eq 0 ]; then
        echo "  已完成 $i / $TOTAL 请求"
        sleep 1
    fi
done

echo "========================================="
echo "流量生成完成"
echo "========================================="
echo "查看序列数: http://localhost:9093/api/v1/status/tsdb"