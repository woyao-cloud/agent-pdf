#!/bin/bash
# 对比存储压缩率：Prometheus vs VictoriaMetrics

echo "========================================="
echo "存储压缩率对比"
echo "========================================="
echo ""

echo "▶ Prometheus 源实例存储使用:"
docker exec prom-vm-source du -sh /prometheus 2>/dev/null || echo "  N/A"

echo ""
echo "▶ VictoriaMetrics 存储使用:"
docker exec prom-vm du -sh /storage 2>/dev/null || echo "  N/A"

echo ""
echo "▶ VM 内部指标:"
curl -s 'http://localhost:8428/metrics' 2>/dev/null | grep -E "vm_data_size_bytes|vm_rows" | head -5

echo ""
echo "▶ Direct query VictoriaMetrics:"
curl -s 'http://localhost:8428/api/v1/query?query=up' 2>/dev/null | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"  Rows returned: {len(d['data']['result'])}\")
" 2>/dev/null || echo "  (unavailable)"