#!/bin/bash
PROM_URL=${1:-http://localhost:9096}

echo "========================================="
echo "PromQL 向量匹配演示"
echo "========================================="
echo ""

echo "▶ 1. 原始数据（每条序列独立）"
curl -s "$PROM_URL/api/v1/query?query=demo_http_requests_total" | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d['data']['result']
for x in r[:5]:
    m = x['metric']
    print(f\"  {m.get('method','?'):5s} {m.get('endpoint','?'):20s} {x['value'][1]}\")
" 2>/dev/null

echo ""
echo "▶ 2. sum by (method) — 按 method 聚合后求和"
curl -s "$PROM_URL/api/v1/query?query=sum(demo_http_requests_total)+by+(method)" | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
for x in d['data']['result']:
    print(f\"  {x['metric']['method']}: {x['value'][1]}\")
" 2>/dev/null

echo ""
echo "▶ 3. group_left — 每个 method 的请求数占比"
curl -s "$PROM_URL/api/v1/query?query=demo_http_requests_total+/+on()+group_left+sum(demo_http_requests_total)+by+(method)" | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
for x in d['data']['result'][:10]:
    print(f\"  {x['metric']['method']:5s} -> {float(x['value'][1]):.2%}\")
" 2>/dev/null