#!/bin/bash
# ============================================
# 第15章 —— ES 集群健康检查
# 用法：bash ch15-troubleshoot-es/check-es-health.sh
# ============================================

ES_HOST="${ES_HOST:-http://localhost:9200}"

echo "===== ES 集群健康检查 ====="
echo ""

# 1. 集群总览
echo ">>> 集群健康："
curl -s "$ES_HOST/_cluster/health?pretty" | jq '{status: .status, nodes: .number_of_nodes, shards: .active_shards, unassigned: .unassigned_shards}'

echo ""

# 2. 有问题的索引
echo ">>> 异常索引："
RED=$(curl -s "$ES_HOST/_cat/indices?h=health,index&health=red" 2>/dev/null | wc -l)
YELLOW=$(curl -s "$ES_HOST/_cat/indices?h=health,index&health=yellow" 2>/dev/null | wc -l)
echo "  Red: $RED, Yellow: $YELLOW"

echo ""

# 3. 未分配分片原因
echo ">>> 未分配分片排查："
curl -s "$ES_HOST/_cluster/allocation/explain?pretty" 2>/dev/null | jq '.allocate_explanation // "没有未分配分片"'

echo ""

# 4. 磁盘
echo ">>> 磁盘使用率："
curl -s "$ES_HOST/_cat/allocation?v&h=node,disk.percent,disk.used,disk.avail" 2>/dev/null

echo ""

# 5. 线程池
echo ">>> 写入线程池："
curl -s "$ES_HOST/_cat/thread_pool/write?v&h=name,active,queue,rejected" 2>/dev/null

echo ""
echo "===== 检查完成 ====="