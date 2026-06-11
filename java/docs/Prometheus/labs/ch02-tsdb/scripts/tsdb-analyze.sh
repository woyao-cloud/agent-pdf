#!/bin/bash
# TSDB 全面分析脚本
# 使用 promtool tsdb 工具分析 Prometheus 存储引擎状态
#
# 用法: ./tsdb-analyze.sh [prometheus-data-path]
# 默认: /prometheus

DATA_PATH=${1:-/prometheus}

echo "============================================="
echo "  TSDB 存储引擎全面分析"
echo "============================================="
echo ""

# 1. Block 概览
echo "▶ Block 概览"
echo "---------------------------------------------"
promtool tsdb list $DATA_PATH
echo ""

# 2. 详细分析（包含高基数指标 Top 10）
echo "▶ TSDB 详细分析（Top 10 高基数指标）"
echo "---------------------------------------------"
promtool tsdb analyze $DATA_PATH --limit=10
echo ""

# 3. Block 内部结构
echo "▶ Block 内部结构"
echo "---------------------------------------------"
for block in $(ls $DATA_PATH | grep -E '^01'); do
    echo "Block: $block"
    cat "$DATA_PATH/$block/meta.json" 2>/dev/null
    echo ""

    CHUNK_COUNT=$(ls "$DATA_PATH/$block/chunks/" 2>/dev/null | wc -l)
    echo "  Chunks: $CHUNK_COUNT"

    INDEX_SIZE=$(ls -lh "$DATA_PATH/$block/index" 2>/dev/null | awk '{print $5}')
    echo "  Index size: $INDEX_SIZE"
    echo ""
done

# 4. WAL 状态
echo "▶ WAL 状态"
echo "---------------------------------------------"
if [ -d "$DATA_PATH/wal" ]; then
    WAL_FILES=$(ls $DATA_PATH/wal/ | grep -E '^[0-9]+$' | wc -l)
    WAL_SIZE=$(du -sh $DATA_PATH/wal/ 2>/dev/null | awk '{print $1}')
    echo "  WAL files: $WAL_FILES"
    echo "  WAL total size: $WAL_SIZE"
    echo "  WAL checkpoint: $(ls $DATA_PATH/wal/checkpoint* 2>/dev/null)"
else
    echo "  WAL: not found or not accessible"
fi
echo ""

# 5. 总体统计
echo "▶ 总体统计"
echo "---------------------------------------------"
TOTAL_SIZE=$(du -sh $DATA_PATH 2>/dev/null | awk '{print $1}')
BLOCK_COUNT=$(ls $DATA_PATH/ | grep -E '^01' 2>/dev/null | wc -l)
echo "  Total TSDB size: $TOTAL_SIZE"
echo "  Total blocks: $BLOCK_COUNT"
echo "  Retention: $(promtool tsdb list $DATA_PATH 2>/dev/null | tail -1 | awk '{print $1, $2}')"