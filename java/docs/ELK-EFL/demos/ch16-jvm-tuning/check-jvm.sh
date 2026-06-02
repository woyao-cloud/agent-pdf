#!/bin/bash
# ============================================
# 第16章 —— JVM 调优检查
# 验证 ES 和 Logstash 的 JVM 配置
# ============================================

ES_HOST="${ES_HOST:-http://localhost:9200}"

echo "===== JVM 调优检查 ====="
echo ""

# 1. ES 堆内存
echo ">>> ES JVM 堆内存："
curl -s "$ES_HOST/_nodes/stats/jvm?pretty" | \
  jq -r '.nodes[] | "\(.name): max_heap=\(.jvm.mem.heap_max_in_bytes/1024/1024/1024)GB, used=\(.jvm.mem.heap_used_percent)%"'

echo ""

# 2. ES memory_lock
echo ">>> ES memory_lock："
MLOCK=$(curl -s "$ES_HOST/_nodes/stats/process?filter_path=**.mlockall" | jq -r '.[].[].process.mlockall')
if [ "$MLOCK" = "true" ]; then
  echo "  ✅ memory_lock 已开启"
else
  echo "  ❌ memory_lock 未开启（建议在 docker-compose 中配置 ulimits.memlock）"
fi

echo ""

# 3. 宿主机 vm.max_map_count
echo ">>> vm.max_map_count："
CURRENT=$(sysctl -n vm.max_map_count 2>/dev/null || echo "N/A")
echo "  当前值: $CURRENT"
if [ "$CURRENT" = "N/A" ]; then
  echo "  ⚠️  无法获取（可能不在宿主机上运行）"
elif [ "$CURRENT" -ge 262144 ]; then
  echo "  ✅ >= 262144"
else
  echo "  ❌ < 262144（需要执行 sysctl -w vm.max_map_count=262144）"
fi

echo ""

# 4. Swap
echo ">>> Swap 状态："
SWAP=$(free -m | grep Swap | awk '{print $3}')
if [ "$SWAP" -eq 0 ]; then
  echo "  ✅ Swap 已关闭"
else
  echo "  ❌ Swap 已使用 ${SWAP}MB（建议关闭）"
fi

echo ""
echo "===== 检查完成 ====="