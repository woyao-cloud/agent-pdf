#!/bin/bash
# TSDB 修复流程实验
# 需要：ch02-tsdb 环境已运行
#
# 警告：本实验会模拟 WAL 损坏，请在测试环境执行！

PROM_CONTAINER="prom-ch02"
PROM_DATA="/prometheus"

echo "============================================="
echo "  实验 3：TSDB 修复流程"
echo "============================================="
echo ""

docker ps | grep -q $PROM_CONTAINER || { echo "请先启动 ch02-tsdb 环境"; exit 1; }

echo "▶ Step 1: 备份 WAL 目录"
echo "  先查看当前的 WAL 状态:"
docker exec $PROM_CONTAINER ls -lh $PROM_DATA/wal/ 2>/dev/null | head -10

echo ""
echo "▶ Step 2: 正常修复（clean-tombstones）"
echo "  docker compose stop prometheus"
echo "  docker run --rm -v prometheus_data_ch02:/prometheus prom/prometheus:v2.48.0 \\"
echo "    promtool tsdb clean-tombstones /prometheus"
echo ""

echo "▶ Step 3: 模拟 WAL 损坏（删除最后一个 WAL 段）"
echo "  docker compose stop prometheus"
echo '  docker exec prom-ch02 rm $PROM_DATA/wal/$(ls -t $PROM_DATA/wal/ | tail -1)'
echo "  docker compose start prometheus"
echo "  docker logs prom-ch02 --tail 20 | grep -E 'replay|WAL|corrupt'"
echo ""

echo "▶ Step 4: 极端恢复（删除整个 WAL）"
echo "  # 警告：会丢失最近 2 小时未落盘的数据！"
echo "  docker compose stop prometheus"
echo "  docker exec prom-ch02 rm -rf $PROM_DATA/wal/"
echo "  docker compose start prometheus"
echo ""
echo "  # 启动成功后 promtool 显示的数据少了最近 2 小时的"
echo "  docker exec $PROM_CONTAINER promtool tsdb analyze /prometheus --limit=3"