#!/bin/bash
# Compaction 过程观察脚本
# 实时监控 TSDB Block 的合并过程
#
# 用法: ./watch-compaction.sh [prometheus_container] [观察秒数]
# 默认: ch02-tsdb-prometheus-1, 120 秒

CONTAINER=${1:-ch02-tsdb-prometheus-1}
DURATION=${2:-120}

echo "========================================="
echo "Compaction 过程观察"
echo "========================================="
echo "容器: $CONTAINER"
echo "观察时长: ${DURATION}s"
echo ""
echo "开始时间: $(date '+%H:%M:%S')"
echo ""

# 先记录初始状态
echo "▶ 初始 Block 状态:"
docker exec $CONTAINER ls -lh /prometheus/ | grep -E "^0|^1"
echo ""

echo "▶ 开始监控 Compaction 日志..."
echo ""

# 监控容器日志中的 compaction 事件
docker logs $CONTAINER --tail 50 2>&1 | grep -iE "compact|merge|block" | tail -10

echo ""
echo "▶ 每 30 秒检查一次 Block 变化:"

for i in $(seq 1 $((DURATION / 30))); do
    sleep 30
    echo ""
    echo "  [$(date '+%H:%M:%S')] Block 状态:"
    docker exec $CONTAINER ls -lh /prometheus/ 2>/dev/null | grep -E "^0|^1" | \
        awk '{print "    " $NF "  " $5}'
done

echo ""
echo "▶ 最终 Block 状态:"
docker exec $CONTAINER ls -lh /prometheus/ | grep -E "^0|^1"
echo ""

echo "========================================="
echo "观察完成"
echo "观察要点:"
echo "1. 小 Block 逐渐合并为大 Block"
echo "2. 合并后 Block 数量减少"
echo "3. 查看 meta.json 中的 compaction.level 变化"
echo "========================================="
