# 第14章 物化视图

## 14.1 场景故事：大屏报表从5秒到50ms

### 业务需求

运营大屏上需要展示实时订单统计：今日订单数、成交金额TOP10商品、昨日环比增长率。原始SQL涉及多个表的JOIN和聚合，每次执行需要3-5秒，大屏每10秒刷新一次会导致数据库负载过高。

物化视图（Materialized View）将查询结果"物化"为物理表，报表查询直接从物化视图读取，时间从5秒降到50毫秒。

---

## 14.2 实现原理

### 物化视图 vs 普通视图

```sql
-- 普通视图：只是一个保存的查询，每次查询都重新执行
CREATE VIEW order_stats AS
SELECT date_trunc('hour', created_at) AS hour,
       count(*) AS order_count,
       sum(amount) AS total_amount
FROM orders
GROUP BY hour;

-- 物化视图：查询结果实际存储在磁盘上
CREATE MATERIALIZED VIEW mv_order_stats AS
SELECT date_trunc('hour', created_at) AS hour,
       count(*) AS order_count,
       sum(amount) AS total_amount
FROM orders
GROUP BY hour
WITH DATA;  -- 立即填充数据

-- 查询物化视图（50ms vs 原始查询5秒）
SELECT * FROM mv_order_stats
WHERE hour >= now() - interval '24 hours';
```

### 刷新物化视图

```sql
-- 全量刷新（会锁表，刷新期间无法查询）
REFRESH MATERIALIZED VIEW mv_order_stats;

-- 并发刷新（不锁表，刷新期间可正常查询）
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_order_stats;
-- 前提：物化视图必须有唯一索引
CREATE UNIQUE INDEX idx_mv_order_hour ON mv_order_stats(hour);
```

### 物化视图自动刷新

```sql
-- 创建每小时自动刷新函数
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_order_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_ranking;
END;
$$ LANGUAGE plpgsql;

-- 使用pg_cron调度（需要pg_cron扩展）
SELECT cron.schedule('refresh-stats', '0 * * * *', 'SELECT refresh_materialized_views()');
```

---

## 14.3 使用场景

| 场景 | 物化视图 | 刷新策略 |
|------|---------|---------|
| 大屏报表 | 小时级别的聚合数据 | 每5分钟刷新 |
| 商品排行榜 | 按销量、评分排序 | 每10分钟刷新 |
| 月度财务汇总 | 月度聚合数据 | 每天凌晨刷新 |
| 复杂搜索视图 | 跨表JOIN后的扁平化视图 | 每小时刷新 |

---

## 14.4 典型问题处理

**问题：物化视图和普通视图怎么选择？**

```
普通视图（View）：
- 查询结果不需要缓存
- 数据需要100%实时
- 查询涉及的表很小
- 适合作为访问控制层

物化视图（Materialized View）：
- 读多写少（查询量大但数据变化频率低）
- 对实时性要求不高（秒级/分钟级延迟可接受）
- 适合复杂聚合/JOIN
- 适合报表加速
```