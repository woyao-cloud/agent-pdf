#!/bin/bash
PROM_URL=${1:-http://localhost:9096}
QUERIES=(
    "sum(rate(demo_http_requests_total[5m]))"
    "sum(rate(demo_http_requests_total[5m])) by (method)"
    "histogram_quantile(0.95, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le))"
    "demo_cpu_spike_percent > 80"
    "avg_over_time(demo_sine_wave_value[30m])"
)

echo "========================================="
echo "PromQL 查询性能基准测试"
echo "========================================="
echo ""

for query in "${QUERIES[@]}"; do
    echo "▶ 查询: $query"
    TOTAL_TIME=0
    for i in {1..5}; do
        START=$(date +%s%N)
        ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$query'''))" 2>/dev/null || echo "")
        curl -s "$PROM_URL/api/v1/query?query=$ENCODED" -o /dev/null
        END=$(date +%s%N)
        TIME_MS=$(( (END - START) / 1000000 ))
        TOTAL_TIME=$((TOTAL_TIME + TIME_MS))
        echo "  第 ${i} 次: ${TIME_MS}ms"
    done
    echo "  平均: $((TOTAL_TIME / 5))ms"
    echo ""
done