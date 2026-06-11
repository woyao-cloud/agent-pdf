#!/bin/bash
# 对比 Thanos Query 和单机 Prometheus 的查询结果

echo "========================================="
echo "Thanos Query vs 单机 Prometheus 对比"
echo "========================================="
echo ""

echo "▶ 1. 单机 Prometheus 1 (us-east):"
curl -s 'http://localhost:9098/api/v1/query?query=up{job="demo-app"}' 2>/dev/null | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d['data']['result']:
    print(f\"  {r['metric'].get('region','?')}: {r['value'][1]}\")
" 2>/dev/null || echo "  (unavailable)"

echo ""
echo "▶ 2. 单机 Prometheus 2 (eu-west):"
curl -s 'http://localhost:9099/api/v1/query?query=up{job="demo-app"}' 2>/dev/null | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d['data']['result']:
    print(f\"  {r['metric'].get('region','?')}: {r['value'][1]}\")
" 2>/dev/null || echo "  (unavailable)"

echo ""
echo "▶ 3. Thanos Query (全局视图):"
curl -s 'http://localhost:10902/api/v1/query?query=up{job="demo-app"}' 2>/dev/null | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d['data']['result']:
    print(f\"  {r['metric'].get('region','?')}: {r['value'][1]}\")
" 2>/dev/null || echo "  (unavailable)"

echo ""
echo "▶ 4. Thanos Query 跨 region 聚合:"
curl -s 'http://localhost:10902/api/v1/query?query=count(up{job="demo-app"})+by+(region)' 2>/dev/null | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d['data']['result']:
    print(f\"  region={r['metric'].get('region','?')}: {r['value'][1]}\")
" 2>/dev/null || echo "  (unavailable)"