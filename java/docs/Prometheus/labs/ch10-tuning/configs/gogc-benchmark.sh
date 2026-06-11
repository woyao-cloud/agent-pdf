#!/bin/bash
# GOGC 对比实验脚本
# 对比 GOGC=100 vs GOGC=400 时 Prometheus 的性能差异
#
# 需要：ch02-tsdb 环境中的 prometheus 容器

echo "============================================="
echo "  GOGC 调优对比实验"
echo "============================================="
echo ""

echo "▶ 实验前提："
echo "  确保 ch02-tsdb 环境已启动（高基数模式 CARD_USER=1000）"
echo ""

echo "▶ 场景 1：GOGC=100（默认）"
echo "  运行以下命令启动 Prometheus:"
echo "  docker run --rm --name prom-gogc100 \\"
echo "    -v prometheus_data_ch02:/prometheus \\"
echo "    -e GOGC=100 \\"
echo "    -p 9092:9090 \\"
echo "    prom/prometheus:v2.48.0 \\"
echo "    --config.file=/etc/prometheus/prometheus.yml \\"
echo "    --storage.tsdb.path=/prometheus"
echo ""

echo "  观察指标："
echo "  - prometheus_tsdb_head_series"
echo "  - go_memstats_gc_cpu_fraction（GC 占 CPU 比例）"
echo "  - go_memstats_heap_inuse_bytes（堆内存使用）"
echo ""

echo "▶ 场景 2：GOGC=400"
echo "  docker run --rm --name prom-gogc400 \\"
echo "    -v prometheus_data_ch02:/prometheus \\"
echo "    -e GOGC=400 \\"
echo "    -p 9093:9090 \\"
echo "    prom/prometheus:v2.48.0 \\"
echo "    --config.file=/etc/prometheus/prometheus.yml \\"
echo "    --storage.tsdb.path=/prometheus"
echo ""

echo "▶ 对比指标："
echo "  rate(go_memstats_gc_cpu_fraction[1m])  # GC 占 CPU 比例"
echo "  go_memstats_heap_inuse_bytes            # 堆内存占用"
echo "  rate(scrape_duration_seconds[1m])       # scrape 耗时"
echo ""