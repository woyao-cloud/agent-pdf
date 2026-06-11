#!/bin/bash
DURATION=${1:-30}
CONTAINER="prom-blackbox-web"

echo "========================================="
echo "  模拟目标宕机（${DURATION}s）"
echo "========================================="
echo ""

echo "▶ 当前 SLA:"
curl -s http://localhost:9095/api/v1/query?query=sla:http_availability:ratio_24h 2>/dev/null | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
if d['data']['result']:
    print(f\"  {float(d['data']['result'][0]['value'][1])*100:.4f}%\")
" 2>/dev/null || echo "  N/A"

echo ""
echo "▶ 停止 Web 目标..."
docker stop $CONTAINER
echo "  等待 ${DURATION}s..."

for i in $(seq 1 $((DURATION / 10))); do
    sleep 10
    STATUS=$(curl -s http://localhost:9095/api/v1/query?query=probe_success 2>/dev/null | \
      python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d['data']['result']
print(f\"up={r[0]['value'][1]}\")
" 2>/dev/null)
    echo "  第 $((i * 10))s: $STATUS"
done

echo ""
echo "▶ 恢复 Web 目标..."
docker start $CONTAINER
sleep 5

echo ""
echo "▶ 恢复后 SLA:"
curl -s http://localhost:9095/api/v1/query?query=sla:http_availability:ratio_24h 2>/dev/null | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
if d['data']['result']:
    print(f\"  {float(d['data']['result'][0]['value'][1])*100:.4f}%\")
" 2>/dev/null || echo "  N/A"

echo ""
echo "========================================="
echo "  模拟完成"
echo "========================================="