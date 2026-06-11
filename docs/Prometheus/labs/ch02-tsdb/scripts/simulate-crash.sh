#!/bin/bash
# WAL 崩溃模拟脚本
# 模拟 Prometheus 进程崩溃和 WAL 恢复
#
# 用法: ./simulate-crash.sh [prometheus_container]
# 默认: ch02-tsdb-prometheus-1

CONTAINER=${1:-ch02-tsdb-prometheus-1}

echo "========================================="
echo "WAL 崩溃恢复模拟"
echo "========================================="
echo ""

echo "▶ 1. 确认 Prometheus 正在运行"
docker ps --filter name=$CONTAINER --format "  {{.Names}} 状态: {{.Status}}"
echo ""

echo "▶ 2. 查看当前 WAL 状态"
docker exec $CONTAINER ls -lh /prometheus/wal/
echo ""

echo "▶ 3. 模拟进程崩溃（SIGKILL）"
echo "   执行: docker kill --signal=KILL $CONTAINER"
docker kill --signal=KILL $CONTAINER
echo ""

echo "▶ 4. 等待 5 秒后重启..."
sleep 5
echo "   执行: docker start $CONTAINER"
docker start $CONTAINER
echo ""

echo "▶ 5. 查看重启日志（WAL 恢复信息）"
sleep 3
docker logs $CONTAINER 2>&1 | grep -iE "wal|replay|recover|checkpoint" | head -10
echo ""

echo "▶ 6. 验证 Prometheus 正常运行"
sleep 5
docker ps --filter name=$CONTAINER --format "  {{.Names}} 状态: {{.Status}}"
echo ""

echo "▶ 7. 查看恢复后的 WAL"
docker exec $CONTAINER ls -lh /prometheus/wal/ 2>/dev/null || echo "  WAL 不可用"
echo ""

echo "========================================="
echo "模拟完成"
echo "观察要点:"
echo "1. 重启时 WAL 重放日志"
echo "2. Prometheus 恢复后数据不丢失"
echo "3. 如果数据量小，恢复在秒级完成"
echo "========================================="
