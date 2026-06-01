# 第23章 监控与诊断

## 23.1 pg_stat_statements

```sql
-- 需要先创建扩展
CREATE EXTENSION pg_stat_statements;

-- 查看最耗时的前10条查询
SELECT
    query,
    calls,
    total_exec_time / 1000 AS total_seconds,
    mean_exec_time AS avg_ms,
    rows,
    shared_blks_hit,
    shared_blks_read
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

## 23.2 pg_stat_activity

```sql
-- 查看当前活动查询
SELECT
    pid,
    usename,
    state,
    wait_event_type,
    wait_event,
    query_start,
    state_change,
    query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY query_start;

-- 查看长时间运行查询（超过5分钟）
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE now() - pg_stat_activity.query_start > interval '5 minutes'
AND state = 'active';

-- 终止指定查询
SELECT pg_cancel_backend(12345);   -- 取消查询（温和）
SELECT pg_terminate_backend(12345); -- 终止连接（强制）
```

## 23.3 表大小监控

```sql
-- 查看数据库大小
SELECT
    datname,
    pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database
ORDER BY pg_database_size(datname) DESC;

-- 查看表大小（含索引）
SELECT
    relname,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    pg_size_pretty(pg_indexes_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

## 23.4 Prometheus集成

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: test

  postgres_exporter:
    image: prometheuscommunity/postgres-exporter:latest
    ports: ["9187:9187"]
    environment:
      DATA_SOURCE_NAME: "postgresql://postgres:test@postgres:5432/postgres?sslmode=disable"
    depends_on: [postgres]

  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'postgresql'
    static_configs:
      - targets: ['postgres_exporter:9187']
```