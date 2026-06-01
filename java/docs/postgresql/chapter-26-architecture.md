# 第26章 架构设计进阶

## 26.1 MySQL迁移到PostgreSQL

### 数据类型映射

| MySQL类型 | PostgreSQL类型 | 注意事项 |
|-----------|--------------|---------|
| INT / INTEGER | INTEGER | 直接对应 |
| BIGINT | BIGINT | 直接对应 |
| VARCHAR(n) | VARCHAR(n) | 直接对应 |
| TEXT | TEXT | 直接对应 |
| DATETIME | TIMESTAMP(0) | 时区处理差异 |
| TIMESTAMP | TIMESTAMPTZ | PG推荐使用时区类型 |
| ENUM('a','b') | CREATE TYPE ... AS ENUM | 需要先创建枚举类型 |
| JSON | JSONB | PG强烈推荐JSONB |
| TINYINT(1) | BOOLEAN | PG有原生布尔类型 |
| BLOB | BYTEA | 直接对应 |
| AUTO_INCREMENT | SERIAL/BIGSERIAL | PG使用序列 |
| UNSIGNED | 无直接对应 | 使用CHECK约束 |
| CHARACTER SET | 无 | PG默认UTF8，无字符集概念 |

### 语法差异

```sql
-- MySQL的LIMIT/OFFSET
SELECT * FROM orders LIMIT 10 OFFSET 20;

-- PostgreSQL同样支持
SELECT * FROM orders LIMIT 10 OFFSET 20;

-- MySQL的REPLACE INTO（插入或替换）
REPLACE INTO orders (id, status) VALUES (1, 'shipped');
-- PostgreSQL使用UPSERT
INSERT INTO orders (id, status) VALUES (1, 'shipped')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- MySQL的GROUP BY
SELECT name, age FROM users GROUP BY name;  -- 宽松模式可用
-- PostgreSQL要求SELECT中所有非聚合列都在GROUP BY中
SELECT name, age FROM users GROUP BY name, age;

-- MySQL的SHOW TABLES
SHOW TABLES;
-- PostgreSQL的\dt
\dt
-- 或SQL:
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

### 迁移工具

推荐使用 **pgloader** 进行自动化迁移：

```bash
# 安装pgloader
# 创建迁移配置文件
cat > migrate.load << EOF
LOAD DATABASE
     FROM mysql://user:pass@mysql-host:3306/mydb
     INTO postgresql://user:pass@pg-host:5432/mydb

 WITH include drop, create tables, create indexes, reset sequences,
      disable triggers, alter schemas 'public'

 SET PostgreSQL PARAMETERS
     maintenance_work_mem = '1GB',
     work_mem = '128MB'

 CAST type datetime to timestamptz drop default drop not null using zero-dates-to-null,
      type date drop default drop not null using zero-dates-to-null;
EOF

# 执行迁移
pgloader migrate.load
```

---

## 26.2 分库分表 vs 原生分区

| 维度 | PostgreSQL原生分区 | 分库分表（Sharding） |
|------|------------------|-------------------|
| 数据分布 | 同一节点，按范围/列表/哈希分区 | 多个节点，每个节点持有部分数据 |
| 跨分区查询 | 支持，但只扫描匹配的分区 | 不支持，需要在应用层聚合 |
| 跨节点JOIN | 不涉及 | 不支持 |
| 复杂度 | 低（声明式分区） | 高（需要中间件） |
| 扩展性 | 受单机限制 | 可水平扩展 |
| 适用场景 | 大数据量表管理 | 超大规模（TB级以上） |

**选择建议**：单机可承载的数据量（TB级以内）优先使用原生分区。只有单机无法满足时才考虑分库分表。

---

## 26.3 PG vs 分布式数据库

| 维度 | PostgreSQL | TiDB | CockroachDB |
|------|-----------|------|-------------|
| 架构 | 单主+多从 | 分布式（RAFT） | 分布式（RAFT） |
| 一致性 | 强一致（主库） | 强一致 | 强一致 |
| 扩展性 | 垂直扩展为主 | 水平扩展 | 水平扩展 |
| 兼容PG协议 | 原生 | 兼容MySQL | 兼容PG部分 |
| 延迟 | 最低 | 略高（分布式开销） | 略高 |
| 适用场景 | OLTP、中等规模 | 大规模OLTP | 多区域部署 |

**选择建议**：
- 数据量<10TB → PostgreSQL（原生分区即可）
- 数据量>10TB且单机无法满足→ 考虑分布式数据库

---

## 26.4 OLTP+OLAP混合负载

```sql
-- 方案1：物化视图报表（小规模）
CREATE MATERIALIZED VIEW mv_daily_sales AS
SELECT date_trunc('day', created_at) AS day,
       product_id,
       sum(amount) AS total,
       count(*) AS orders
FROM orders
GROUP BY day, product_id;

-- 方案2：逻辑复制到分析库（中等规模）
-- 主库处理OLTP，从库/分析库处理OLAP
-- 发布端：主库
CREATE PUBLICATION oltp_pub FOR TABLE orders, payments;

-- 订阅端：分析库
CREATE SUBSCRIPTION oltp_sub CONNECTION '...' PUBLICATION oltp_pub;

-- 方案3：导出到专用分析引擎（大规模）
-- 使用pgcopydb或Debezium将PG数据导出到ClickHouse
```

---

## 26.5 避坑总结

| 错误做法 | 后果 | 正确做法 |
|---------|------|---------|
| 没有索引的JOIN | 全表扫描 | EXPLAIN检查是否走了Seq Scan |
| 使用SELECT * | 不必要的数据传输 | 只选需要的字段 |
| 大事务 | WAL膨胀、死元组积累 | 拆分事务（每万条提交一次） |
| 没有连接池 | 连接数爆满 | PgBouncer + HikariCP |
| work_mem过高 | 内存溢出 | 谨慎调整，考虑并发 |
| 无监控 | 问题发现滞后 | pg_stat_statements + Prometheus |
| autovacuum关闭 | 死元组膨胀 | 开启并调优autovacuum |
| 全表UPDATE或DELETE | 产生大量死元组 | 分批处理，使用LIMIT |
| 忽略EXPLAIN | 不知道查询为什么慢 | 每个慢查询都看执行计划 |
| 未启用备份 | 数据丢失风险 | pg_dump + WAL归档 |