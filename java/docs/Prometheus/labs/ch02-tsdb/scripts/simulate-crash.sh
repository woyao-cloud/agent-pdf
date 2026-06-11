#!/bin/bash
# WAL 崩溃恢复模拟脚本
# 模拟 Prometheus 进程异常终止，观察 WAL 恢复过程
#
# 用法: ./simulate-crash.sh
# 需要: 已运行的 docker compose 环境

PROMETHEUS_CONTAINER="prom-ch02"

echo "============================================="
echo "  WAL 崩溃恢复模拟"
echo "============================================="
echo ""

# 1. 确认 Prometheus 运行中
echo "▶ Step 1: 确认 Prometheus 运行状态"
if docker ps | grep -q $PROMETHEUS_CONTAINER; then
    echo "  ✓ Prometheus 运行中"
else
    echo "  ✗ Prometheus 未运行，请先执行 docker compose up -d"
    exit 1
fi

# 2. 检查 WAL 目录
echo ""
echo "▶ Step 2: 检查 WAL 目录"
docker exec $PROMETHEUS_CONTAINER ls -lh /prometheus/wal/ 2>/dev/null || {
    echo "  WAL 目录不可访问（可能是权限问题）"
}

# 3. 生成一些测试数据
echo ""
echo "▶ Step 3: 生成测试数据（等待 30s）"
sleep 30
echo "  数据已生成"

# 4. 记录当前序列数
echo ""
echo "▶ Step 4: 记录崩溃前的 TSDB 状态"
docker exec $PROMETHEUS_CONTAINER promtool tsdb analyze /prometheus --limit=3 2>/dev/null | head -20

# 5. 模拟进程崩溃（kill -9）
echo ""
echo "▶ Step 5: 模拟进程崩溃 (kill -9)"
docker kill --signal=KILL $PROMETHEUS_CONTAINER
echo "  ✓ Prometheus 已强制终止"
sleep 2

# 6. 查看 WAL 残留
echo ""
echo "▶ Step 6: 检查 WAL 残留数据"
docker start $PROMETHEUS_CONTAINER 2>/dev/null
sleep 3
docker logs $PROMETHEUS_CONTAINER 2>&1 | grep -E "replay|WAL|wal" || true

# 7. 验证数据恢复
echo ""
echo "▶ Step 7: 验证数据恢复"
docker exec $PROMETHEUS_CONTAINER promtool tsdb analyze /prometheus --limit=3 2>/dev/null | head -10

echo ""
echo "============================================="
echo "  模拟完成"
echo "============================================="
echo "[注意] 如果 WAL 损坏导致 Prometheus 无法启动，"
echo "       可尝试以下修复命令："
echo "  docker run --rm -v prometheus_data_ch02:/prometheus \\"
echo "    prom/prometheus:v2.48.0 promtool tsdb clean-tombstones /prometheus"