# 第10章 实验：核心参数与内核调优

## 实验说明

本章通过对比脚本和配置模板来理解 Prometheus 核心参数的影响。

| 实验 | 依赖 | 说明 |
|------|------|------|
| GOGC 对比 | ch02-tsdb 环境 | 对比 GOGC=100 vs GOGC=400 的性能差异 |
| Remote Write 调优 | ch08-vm 环境 | 使用优化后的配置模板 |

## 实验 1：GOGC 调优

```bash
# 1. 启动 ch02 TSDB 环境（CARD_USER=1000 高基数模式）
cd ../ch02-tsdb
$env:CARD_USER=1000
docker compose up -d

# 2. 查看 GOGC 对比实验说明
cd ../ch10-tuning
cat configs/gogc-benchmark.sh

# 3. 观察默认 GOGC 下的 GC 指标
# Prometheus 查询：
# go_memstats_gc_cpu_fraction    — GC 占 CPU 比例
# go_memstats_heap_inuse_bytes   — 堆内存占用
# rate(scrape_duration_seconds[1m]) — scrape 耗时
```

## 实验 2：Remote Write 配置

```bash
# 1. 参考 remote-write-optimized.yml 中的三种配置模板
# 2. 根据你的网络环境选择合适的方案
# 3. 在 ch08-vm 环境中应用配置
```

## 参数参考

`reference/parameter-reference.md` 包含了所有核心参数的完整说明。