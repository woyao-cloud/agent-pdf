# 第9章 实验：生产环境三大杀手排查

## 实验说明

本章实验不新建 Docker Compose 环境，而是**复用前面章节已搭建的环境**进行诊断操作。

| 实验 | 依赖环境 | 说明 |
|------|---------|------|
| 高基数诊断 | ch02-tsdb | 使用 high-card-gen 制造高基数场景，练习诊断工具 |
| 抓取失败 | ch01-pull-model | 模拟目标响应慢，观察 scrape 失败 |
| TSDB 修复 | ch02-tsdb | 模拟 WAL 损坏，练习修复流程 |

## 实验 1：高基数诊断

```bash
# 1. 启动 ch02 TSDB 环境（高基数模式）
cd ../ch02-tsdb
docker compose up -d

# 设置高基数
$env:CARD_USER=1000
docker compose up -d

# 2. 运行诊断脚本
cd ../ch09-troubleshooting
bash scenarios/01-high-cardinality.sh

# 3. 应用 relabeling 紧急止血
# 编辑 ch02-tsdb/prometheus/prometheus.yml 取消注释 metric_relabel_configs
docker compose restart prometheus

# 4. 再次运行诊断脚本，对比序列数变化
bash scenarios/01-high-cardinality.sh
```

## 实验 2：抓取失败诊断

```bash
# 1. 启动 ch01 环境
cd ../ch01-pull-model
docker compose up -d

# 2. 运行诊断脚本
cd ../ch09-troubleshooting
bash scenarios/02-scrape-failed.sh
```

## 实验 3：TSDB 修复

```bash
# 1. 启动 ch02 环境
cd ../ch02-tsdb
docker compose up -d

# 2. 执行修复实验
cd ../ch09-troubleshooting
bash scenarios/03-tsdb-repair.sh
```

## 参考

完整的排障命令手册：`cheatsheet/troubleshooting.md`