#!/bin/bash
# 告警风暴模拟脚本
echo "========================================="
echo "  告警场景模拟"
echo "========================================="
echo ""
echo "场景 1：正常状态"
curl -s http://localhost:8088/mode/normal 2>/dev/null || true
sleep 2
echo "查看 Webhook Receiver: http://localhost:5002/status"
echo ""
echo "场景 2：高 CPU 负载（触发 HighCPULoad 告警）"
curl -s http://localhost:8088/mode/high_cpu 2>/dev/null || true
sleep 5
echo "查看告警状态: http://localhost:9097/alerts"
echo ""
echo "场景 3：机房断网（测试 Inhibition 抑制）"
echo "观察 dc-east 的 HostDown 被 DatacenterDown 抑制"