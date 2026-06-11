# 第2章 实验：TSDB 存储引擎揭秘

## 实验目的

1. **正常数据流**：观察 Prometheus TSDB 的 Block 结构、WAL 文件、Chunk 存储
2. **高基数灾难**：亲眼见证 Label 基数增长导致的时间序列爆炸
3. **WAL 崩溃恢复**：模拟进程崩溃，验证 WAL 重放机制
4. **Compaction 过程**：观察小 Block 合并为大 Block 的完整流程

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| data-generator | :8083 | 正常低基数指标（对照组） |
| high-card-gen | :8084 | 高基数指标（实验组，默认 3000 条序列） |
| Prometheus | :9092 | 启用 Admin API，缩短 retention 加速实验 |
| promtool (工具) | — | TSDB 分析工具容器 |
| Grafana | :3002 | 可视化面板 |

## 核心环境变量（high-card-gen）

| 变量 | 默认值 | 说明 | 总序列数影响 |
|------|--------|------|-------------|
| CARD_ENDPOINT | 5 | endpoint 取值数 | 乘法因子 |
| CARD_USER | 100 | user_id 取值数 | 乘法因子 |
| CARD_REGION | 3 | region 取值数 | 乘法因子 |
| CARD_VERSION | 2 | version 取值数 | 乘法因子 |

**序列数公式**：CARD_ENDPOINT × CARD_USER × CARD_REGION × CARD_VERSION

## 实验步骤

### 实验 1：正常数据流观察

```bash
# 1. 启动环境
docker compose up -d

# 2. 验证所有服务启动
docker compose ps

# 3. 等待 2 分钟生成数据，然后观察 TSDB 结构
docker exec prom-ch02 ls -lh /prometheus/

# 4. 查看 Block 元数据
docker exec prom-ch02 cat /prometheus/$(ls /prometheus/ | grep "^01" | head -1)/meta.json

# 5. 使用 promtool 分析
docker exec prom-ch02 promtool tsdb analyze /prometheus --limit=10
```

**预期观察：**
- `/prometheus/` 目录下出现 `01xxxxx` 命名的 Block 目录
- 每个 Block 包含 chunks/、index/、meta.json
- WAL 目录中有多个编号的 WAL 段文件
- promtool 显示各指标的时间序列数和样本数

### 实验 2：高基数灾难现场

```bash
# 1. 停止当前环境，修改基数配置
docker compose down -v

# 2. 启动低基数配置（300 条序列）
$env:CARD_USER=10
docker compose up -d
# 观察：Prometheus 负载正常，内存占用低

# 3. 切换中基数配置（3000 条）
docker compose down -v
$env:CARD_USER=100
docker compose up -d
# 观察：TSDB block 明显增大，查询响应略慢

# 4. 切换高基数配置（30000 条 — 请确保至少有 2GB 可用内存）
docker compose down -v
$env:CARD_USER=1000
docker compose up -d
# 观察：Prometheus 内存占用显著上升
# 观察：scrape 耗时增加
# 观察：promtool analyze 中高基数指标的出现
```

**查询 Prometheus TSDB 状态 API：**
```bash
# 查看当前所有时间序列数
curl -s http://localhost:9092/api/v1/status/tsdb | python -m json.tool

# 查看 Top 10 高基数指标
curl -s http://localhost:9092/api/v1/status/tsdb | \
  python -c "import sys,json; d=json.load(sys.stdin)['data']; \
  [print(f\"{s['name']}: {s['seriesCount']} series\") \
  for s in sorted(d['seriesCountByMetricName'], key=lambda x:-x['seriesCount'])[:10]]"
```

### 实验 3：WAL 崩溃恢复

```bash
# 1. 确保环境已运行
docker compose up -d

# 2. 执行崩溃模拟脚本
bash scripts/simulate-crash.sh

# 3. 或者手动操作：
#    强制 kill Prometheus 进程
docker kill --signal=KILL prom-ch02

# 4. 重启并观察 WAL 恢复日志
docker start prom-ch02
docker logs prom-ch02 --tail 50 | grep -E "replay|WAL|wal|tsdb"
```

**预期观察：**
- 重启后日志显示 "replaying WAL"
- WAL replay 完成后显示 "WAL replay completed"
- TSDB 启动后，崩溃前的数据指标依然可用

### 实验 4：Compaction 过程

```bash
# 运行比较长时间的观察
bash scripts/watch-compaction.sh 30
```

**预期观察：**
- 初始时出现多个小 Block（5m 间隔）
- 30 分钟后开始 Compaction，小 Block 合并
- Block 数量减少，单个 Block 体积增大
- 查询性能逐渐优化

## 高基数防护演示

在 `prometheus/prometheus.yml` 中取消注释 `metric_relabel_configs`：
```yaml
metric_relabel_configs:
  - regex: 'user_id'
    action: labeldrop
```

重启后观察：高基数 Label 被丢弃，序列数大幅下降。

## Grafana

1. 访问 http://localhost:3002
2. 数据源：Prometheus，URL=http://prometheus:9090
3. 推荐查询：
   - `prometheus_tsdb_head_series` — 当前内存中的序列数
   - `prometheus_tsdb_blocks_loaded` — 已加载的 Block 数
   - `scrape_duration_seconds{job="high-card-gen"}` — 高基数目标的抓取耗时

## 清理

```bash
docker compose down -v
```