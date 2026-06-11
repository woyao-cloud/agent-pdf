#!/bin/bash
# 抓取失败诊断实验
#
# 模拟目标应用响应慢/体过大，观察 Prometheus 的 scrape 失败
# 然后在 Prometheus 端调优参数恢复

echo "============================================="
echo "  实验 2：抓取失败诊断"
echo "============================================="
echo ""

echo "▶ 步骤 1：查看 Prometheus Targets 状态"
echo "  浏览器打开: http://localhost:9091/targets"
echo "  观察各 target 的状态（UP/DOWN）"
echo ""

echo "▶ 步骤 2：查看 Prometheus 日志中的错误"
echo "  docker logs prom-ch01 2>&1 | grep -E 'scrape|error|timeout' | tail -10"
echo ""

echo "▶ 步骤 3：手动模拟 scrape 请求"
echo '  curl -s -o /dev/null -w "HTTP %{http_code}, Time: %{time_total}s, Size: %{size_download}B\n"'
echo "    http://localhost:8081/metrics"
echo ""

echo "▶ 步骤 4：如果响应太慢，调优 scrape 参数"
echo "  在 prometheus.yml 中调整:"
echo "  global:"
echo "    scrape_interval: 30s"
echo "    scrape_timeout: 30s"
echo ""