#!/bin/bash
# 高基数诊断实验
# 需要：ch02-tsdb 环境已运行（prom-ch02 容器）
#
# 用法: bash scenarios/01-high-cardinality.sh
# 前置条件: docker compose up -d (在 ch02-tsdb 目录下)

PROM_CONTAINER="prom-ch02"
PROM_URL="http://localhost:9092"

echo "============================================="
echo "  实验 1：高基数诊断"
echo "============================================="
echo ""

# 检查环境
docker ps | grep -q $PROM_CONTAINER || { echo "请先启动 ch02-tsdb 环境"; exit 1; }

echo "▶ Step 1: 查看当前总序列数"
curl -s "$PROM_URL/api/v1/status/tsdb" | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print(f'  总序列数: {d[\"totalSeries\"]}')
print(f'  总标签对: {d[\"totalLabelValuePairs\"]}')
" 2>/dev/null

echo ""
echo "▶ Step 2: Top 5 高基数指标"
docker exec $PROM_CONTAINER promtool tsdb analyze /prometheus --limit=5 2>/dev/null | head -10

echo ""
echo "▶ Step 3: Top 5 高基数 Label"
curl -s "$PROM_URL/api/v1/status/tsdb" | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('  Label 名 -> 取值数量')
for l in sorted(d['labelValueCountByLabelName'], key=lambda x:-x['valueCount'])[:5]:
    print(f'  {l[\"name\"]}: {l[\"valueCount\"]}')
" 2>/dev/null

echo ""
echo "▶ Step 4: 如果基数过高，通过 relabeling 紧急止血"
echo "  在 prometheus.yml 中添加:"
echo '  metric_relabel_configs:'
echo '    - regex: "user_id"'
echo '      action: labeldrop'
echo ""
echo "  然后: docker compose restart prometheus"