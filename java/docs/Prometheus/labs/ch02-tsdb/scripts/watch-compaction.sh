#!/bin/bash
# Compaction 过程观察脚本
# 监控 Prometheus 的 Block 合并过程
#
# 用法: ./watch-compaction.sh [interval_seconds]
# 默认: 每 60 秒刷新一次

INTERVAL=${1:-60}
PROM_CONTAINER="prom-ch02"

echo "============================================="
echo "  Compaction 过程观察"
echo "============================================="
echo "刷新间隔: ${INTERVAL}s"
echo "按 Ctrl+C 停止观察"
echo ""

count=0
while true; do
    count=$((count + 1))
    echo "--- [$(date +%H:%M:%S)] 检查 #${count} ---"

    # Block 列表
    echo "Block 列表:"
    docker exec $PROM_CONTAINER ls -lh /prometheus/ 2>/dev/null | grep -E '^d' | head -20

    # Block 数量
    BLOCK_COUNT=$(docker exec $PROM_CONTAINER ls /prometheus/ 2>/dev/null | grep -E '^01' | wc -l)
    echo "Block 数量: $BLOCK_COUNT"

    # TSDB 状态摘要
    docker exec $PROM_CONTAINER promtool tsdb list /prometheus 2>/dev/null | tail -5

    # 尝试通过 API 获取 TSDB 状态
    TSDB_STATUS=$(curl -s http://localhost:9092/api/v1/status/tsdb 2>/dev/null | python -c "
import sys, json
try:
    data = json.load(sys.stdin)['data']
    print(f'  总序列数: {data.get(\"totalSeries\", \"N/A\")}')
    print(f'  内存中的序列: {data.get(\"totalLabelValuePairs\", \"N/A\")}')
except: pass
" 2>/dev/null || true)

    echo ""
    sleep $INTERVAL
done