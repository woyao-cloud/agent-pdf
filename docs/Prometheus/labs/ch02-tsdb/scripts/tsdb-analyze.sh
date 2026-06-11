#!/bin/bash
# TSDB 分析脚本
# 使用 promtool 分析 TSDB 内部结构
#
# 用法: ./tsdb-analyze.sh [prometheus_container]
# 默认: ch02-tsdb-prometheus-1

CONTAINER=${1:-ch02-tsdb-prometheus-1}
PROM_PATH="/prometheus"

echo "========================================="
echo "TSDB 分析工具"
echo "========================================="
echo ""

echo "▶ 1. TSDB 目录结构"
docker exec $CONTAINER ls -lh $PROM_PATH | grep -v "^total"
echo ""

echo "▶ 2. Block 列表"
docker exec $CONTAINER ls -lh $PROM_PATH/ | grep -E "^0"
echo ""

echo "▶ 3. 最新 Block 元信息"
LATEST_BLOCK=$(docker exec $CONTAINER ls $PROM_PATH | grep -E "^0" | sort | tail -1)
if [ -n "$LATEST_BLOCK" ]; then
    docker exec $CONTAINER cat $PROM_PATH/$LATEST_BLOCK/meta.json | python -m json.tool
fi
echo ""

echo "▶ 4. WAL 目录"
docker exec $CONTAINER ls -lh $PROM_PATH/wal/ | head -10
echo ""

echo "▶ 5. promtool tsdb analyze（Top 10 高基数指标）"
docker exec $CONTAINER promtool tsdb analyze $PROM_PATH 2>/dev/null | head -30 || \
    echo "  promtool 不可用或需要 --web.enable-admin-api"
echo ""

echo "▶ 6. TSDB 统计信息（通过 Admin API）"
docker exec $CONTAINER wget -q -O- http://localhost:9090/api/v1/status/tsdb 2>/dev/null | \
    python -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', {})
print(f\"  序列总数: {data.get('seriesCountByMetricValue', 'N/A')}\")
print(f\"  标签名总数: {data.get('labelValueCountByLabelName', 'N/A')}\")
print(f\"  内存中的序列: {data.get('seriesCountByLabelPair', 'N/A')}\")
" 2>/dev/null || echo "  Admin API 不可用"

echo ""
echo "========================================="
echo "分析完成"
echo "========================================="
