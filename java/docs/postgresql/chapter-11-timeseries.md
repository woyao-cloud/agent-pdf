# 第11章 时序数据

## 11.1 场景故事：IoT设备数据采集

### 业务需求

某智能家居平台需要存储数百万台设备每秒上报的传感器数据（温度、湿度、PM2.5等）。数据特征：

- **写入量大**：每台设备每5秒上报一条，100万台设备每秒20万条写入
- **查询模式固定**：查询最近1小时的数据，按时间降序
- **数据有生命周期**：原始数据保留7天，聚合数据保留1年
- **很少更新**：时序数据一旦写入不再修改

---

## 11.2 实现原理

### 分区 + BRIN索引的最佳实践

PostgreSQL处理时序数据的标准方案是：**按时间分区的堆表 + BRIN索引**。

**BRIN索引**（Block Range Index）与B-tree的本质区别：

```
B-tree：为每一行建立索引条目
  大小：约为表数据的20-30%
  适用：高基数、随机分布的列（如user_id）
  特点：查询精度高，但索引大、插入慢

BRIN：为每个连续的数据块范围建立摘要
  大小：约为表数据的0.1-0.5%（比B-tree小200倍！）
  适用：与物理顺序高度相关的时间序列
  特点：查询精度略低，但极小、插入极快
```

```sql
-- 创建分区表
CREATE TABLE sensor_data (
    device_id int NOT NULL,
    ts timestamptz NOT NULL,
    temperature numeric(5,2),
    humidity numeric(5,2),
    pm25 int
) PARTITION BY RANGE (ts);

-- 创建每日分区
CREATE TABLE sensor_data_20241001 PARTITION OF sensor_data
    FOR VALUES FROM ('2024-10-01') TO ('2024-10-02');
CREATE TABLE sensor_data_20241002 PARTITION OF sensor_data
    FOR VALUES FROM ('2024-10-02') TO ('2024-10-03');

-- 在每个分区上创建BRIN索引
CREATE INDEX idx_sensor_ts_20241001 ON sensor_data_20241001 USING brin(ts);
CREATE INDEX idx_sensor_ts_20241002 ON sensor_data_20241002 USING brin(ts);
```

### 分区裁剪

PostgreSQL在查询时能够自动跳过不需要的分区：

```sql
-- 只查询2024-10-01的数据，PostgreSQL只扫描对应分区
EXPLAIN SELECT * FROM sensor_data
WHERE ts >= '2024-10-01 10:00' AND ts < '2024-10-01 11:00'
AND device_id = 100;

-- 查询计划显示只扫描了sensor_data_20241001分区
-- 其他分区被自动裁剪（Partition Pruned）
```

### 自动分区管理

```sql
-- 创建自动分区管理函数
CREATE OR REPLACE FUNCTION create_daily_partition()
RETURNS void AS $$
DECLARE
    partition_date date;
    partition_name text;
    start_date text;
    end_date text;
BEGIN
    partition_date := current_date + interval '1 day';
    partition_name := 'sensor_data_' || to_char(partition_date, 'YYYYMMDD');
    start_date := to_char(partition_date, 'YYYY-MM-DD');
    end_date := to_char(partition_date + 1, 'YYYY-MM-DD');
    
    EXECUTE format(
        'CREATE TABLE %I PARTITION OF sensor_data FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
    
    -- 在新建分区上创建BRIN索引
    EXECUTE format(
        'CREATE INDEX idx_%I ON %I USING brin(ts)',
        partition_name, partition_name
    );
END;
$$ LANGUAGE plpgsql;

-- 删除超过7天的旧分区
CREATE OR REPLACE FUNCTION drop_old_partitions()
RETURNS void AS $$
BEGIN
    FOR partition_name IN
        SELECT inhrelid::regclass::text
        FROM pg_inherits
        WHERE inhparent = 'sensor_data'::regclass
        AND substring(relname from '\d{8}')::date < current_date - interval '7 days'
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || partition_name;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### vs TimescaleDB

对于大规模时序数据，TimescaleDB（基于PostgreSQL的时序数据库扩展）提供了更多便捷功能：

```sql
-- TimescaleDB的超表
SELECT create_hypertable('sensor_data', 'ts');

-- 连续聚合（自动维护的物化视图）
CREATE MATERIALIZED VIEW sensor_data_hourly
WITH (timescaledb.continuous) AS
SELECT
    device_id,
    time_bucket('1 hour', ts) AS hour,
    AVG(temperature) AS avg_temp,
    MAX(temperature) AS max_temp,
    MIN(temperature) AS min_temp
FROM sensor_data
GROUP BY device_id, hour;

-- 自动刷新策略
SELECT add_continuous_aggregate_policy('sensor_data_hourly',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');
```

如果时序数据量达到TB级别，强烈建议使用TimescaleDB（本质上是PG + 时序优化扩展），而不是手写分区管理。

---

## 11.3 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 分区过多 | 每日分区导致数千个分区 | 考虑按月分区，或使用TimescaleDB |
| 写入瓶颈 | 单机写入TPS上限 | 使用COPY协议批量写入 |
| 索引膨胀 | BRIN索引的pages_per_range不合理 | 根据数据增长速度调整 |
| 删除开销 | DROP PARTITION的元数据影响 | 在低峰期执行 |



## 11.4 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: tsdb
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-ts.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-ts.sql
CREATE TABLE sensor_data (
    device_id int NOT NULL,
    ts timestamptz NOT NULL,
    temperature numeric(5,2),
    humidity numeric(5,2)
) PARTITION BY RANGE (ts);

-- 创建本周每日分区
SELECT format('CREATE TABLE sensor_data_%s PARTITION OF sensor_data FOR VALUES FROM (%L) TO (%L)',
    to_char(d, 'YYYYMMDD'), d, d + 1)
FROM generate_series(current_date, current_date + interval '6 days', '1 day') AS d;
\gexec

-- 生成模拟数据
INSERT INTO sensor_data (device_id, ts, temperature, humidity)
SELECT
    (random() * 100)::int + 1,
    generate_series(now() - interval '1 day', now(), interval '10 seconds'),
    round((random() * 15 + 20)::numeric, 2),
    round((random() * 30 + 40)::numeric, 2);
```