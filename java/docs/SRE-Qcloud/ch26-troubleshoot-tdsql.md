# 第26章 TDSQL 故障排查实战指南

## 26.1 概述

TDSQL 是腾讯云自研的金融级分布式数据库产品，兼容 MySQL 5.7/8.0 协议，具备自动分片（Sharding）、读写分离、弹性扩展、强同步复制、自动故障切换等核心能力。TDSQL 在腾讯内部承载了微信支付、QQ 钱包、腾讯游戏等核心业务，对外服务于大量金融、电商、政务客户。

然而，分布式系统的复杂性决定了故障场景多样且排查难度远高于单机数据库。TDSQL 的架构包含三个核心组件：调度节点（Scheduler，负责元数据管理和分片路由）、数据节点（Data Node，实际存储数据的 MySQL 实例，每个分片对应一主多从）、网关节点（Gateway，负责 SQL 解析、路由转发和结果聚合）。任何一个组件的异常都可能导致业务受损。

本章从 SRE 实战角度出发，系统梳理 TDSQL 最常见的五大类故障——连接耗尽、CPU 飙升、慢查询分析、主从复制延迟、磁盘空间满——并给出可落地的排查命令、分析思路与修复方案。每类故障均按照"现象→根因→排查步骤→解决方案"的结构展开，并提供可直接复用的 Python 脚本和诊断工具。

本章面向的读者：腾讯云 TDSQL 用户、DBA、SRE 工程师、运维开发人员。阅读本章前，建议读者具备 MySQL 基础运维知识，了解 TDSQL 的基本架构和分片原理。

---

## 26.2 连接耗尽（Connection Exhaustion）

### 26.2.1 现象

连接耗尽是最常见的数据库故障之一，典型表现包括：

- 业务报错 `ERROR 1040 (HY000): Too many connections`
- 监控面板中 `Threads_connected` 指标达到或接近 `max_connections` 上限
- 新连接无法建立，业务接口超时率上升
- 部分长连接被数据库主动断开
- TDSQL 网关节点连接数告警

### 26.2.2 根因分析

连接耗尽可能由以下一个或多个原因叠加引起：

**1. 应用层连接池配置不当**

这是最常见的原因。许多应用框架（如 Spring Boot、Django、Go Gin）默认使用连接池，但配置参数不合理：

- `maximumPoolSize` 设置过大（如 200+），多个应用实例叠加后远超数据库上限
- `minimumIdle` 设置过高，空闲连接长期占用
- `connectionTimeout` 设置过短，连接获取失败后频繁重试
- 未配置 `maxLifetime`，连接永不释放

以一个典型场景为例：20 个微服务实例，每个配置 `maximumPoolSize=50`，理论上需要 1000 个连接，而 TDSQL 默认 `max_connections` 通常为 500~800，必然导致连接耗尽。

**2. 连接未正确关闭**

应用代码中存在连接泄漏：每次请求创建新连接但未在 finally 块中关闭，或使用了 `DataSource.getConnection()` 后未调用 `close()`。Java 应用中常见的错误模式：

```java
// 错误示例：连接未关闭
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery("SELECT * FROM users");
// 缺少 rs.close(), stmt.close(), conn.close()
```

**3. 慢查询堆积**

慢查询长时间占用连接不释放。例如一个全表扫描的查询执行了 30 秒，在此期间该连接一直被占用。当并发慢查询增多时，连接池中的连接被迅速占满，后续请求无法获取连接。

**4. 突发流量**

促销、秒杀、热点事件等场景下流量突增，连接数瞬间打满。这种情况通常是暂时的，但如果不加以限流，可能导致数据库雪崩。

**5. 长连接泄漏**

应用侧未配置 `wait_timeout` 或 `interactive_timeout`，空闲连接长期不释放。MySQL 默认 `wait_timeout=28800`（8 小时），意味着一个空闲连接最多可以存活 8 小时才被服务端断开。

**6. TDSQL 网关瓶颈**

TDSQL 网关节点（Gateway）也有连接数上限。即使数据节点连接数未满，网关连接数打满同样会导致新连接无法建立。网关连接数上限通常为 4000~8000，但在高并发场景下仍可能被击穿。

### 26.2.3 排查步骤

**步骤一：确认当前连接数**

登录 TDSQL 数据节点（通过腾讯云控制台或 proxy 地址），执行以下命令：

```sql
-- 查看当前连接数
SHOW GLOBAL STATUS LIKE 'Threads_connected';

-- 查看历史最大连接数
SHOW GLOBAL STATUS LIKE 'Max_used_connections';

-- 查看连接数上限
SHOW VARIABLES LIKE 'max_connections';

-- 查看连接数使用率（计算）
SELECT ROUND(
  (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME = 'Threads_connected')
  / (SELECT VARIABLE_VALUE FROM performance_schema.global_variables WHERE VARIABLE_NAME = 'max_connections')
  * 100, 2
) AS connection_usage_pct;
```

当 `Threads_connected` 达到 `max_connections` 的 80% 以上时，需要引起警惕；达到 95% 以上时属于紧急状态。

**步骤二：查看活跃连接详情**

```sql
-- 查看所有非空闲连接，按耗时降序排列
SELECT id, user, host, db, command, time, state, info
FROM information_schema.processlist
WHERE command != 'Sleep'
ORDER BY time DESC
LIMIT 50;
```

重点关注：
- `time` 列较大的非 Sleep 连接——这些可能是慢查询或锁等待
- `state` 列为 `Waiting for table level lock` 或 `Waiting for metadata lock` 的连接——存在锁竞争
- `command` 列为 `Query` 且 `time` 持续增长的连接——慢查询

**步骤三：按用户和来源 IP 聚合**

```sql
-- 按用户聚合
SELECT user, COUNT(*) AS conn_count
FROM information_schema.processlist
GROUP BY user
ORDER BY conn_count DESC;

-- 按来源 IP 聚合
SELECT SUBSTRING_INDEX(host, ':', 1) AS source_ip, COUNT(*) AS conn_count
FROM information_schema.processlist
GROUP BY source_ip
ORDER BY conn_count DESC
LIMIT 20;
```

如果某个应用 IP 的连接数异常偏高（如占总连接数的 50% 以上），说明该应用侧可能存在连接泄漏或连接池配置过大。

**步骤四：检查空闲连接分布**

```sql
-- 查看空闲连接及其存活时间
SELECT id, user, host, db, time AS idle_seconds,
       CASE
         WHEN time > 3600 THEN '>1h'
         WHEN time > 600 THEN '>10min'
         WHEN time > 60 THEN '>1min'
         ELSE '<1min'
       END AS idle_level
FROM information_schema.processlist
WHERE command = 'Sleep'
ORDER BY time DESC
LIMIT 30;
```

如果存在大量空闲超过 10 分钟甚至 1 小时的连接，说明 `wait_timeout` 设置过长或应用未正确归还连接。

**步骤五：检查 TDSQL 网关连接数**

通过腾讯云控制台或云 API 查看网关节点连接数：

```bash
# 通过云 API 获取网关连接数（示例命令）
tdsql describe-gateway-connections --instance-id tdsql-xxxxxx
```

在 TDSQL 控制台的"监控"页面中，选择"网关节点"视图，查看 `Current connections` 指标。

### 26.2.4 解决方案

**紧急止血（按优先级）：**

| 优先级 | 操作 | 命令/操作方式 | 风险 |
|--------|------|--------------|------|
| P0 | 临时调大 max_connections | `SET GLOBAL max_connections=2000;` | 可能增加内存压力 |
| P0 | 杀掉空闲过长的连接 | `KILL <thread_id>;` | 可能导致应用报错 |
| P1 | 调小 wait_timeout | `SET GLOBAL wait_timeout=300;` | 应用需支持重连 |
| P1 | 应用侧限流 | 接入层配置限流（Nginx/Sentinel） | 可能丢弃部分请求 |

**长期修复方案：**

**1. 优化应用连接池配置**

以 Spring Boot + HikariCP 为例的推荐配置：

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      idle-timeout: 300000          # 5 分钟
      connection-timeout: 3000      # 3 秒
      max-lifetime: 600000          # 10 分钟
      validation-timeout: 1000
      leak-detection-threshold: 60000  # 连接泄漏检测阈值
```

关键参数说明：
- `maximum-pool-size`：单实例最大连接数，建议 10~50，根据业务并发量调整
- `minimum-idle`：最小空闲连接数，建议 5~10
- `idle-timeout`：空闲超时，建议 300 秒
- `max-lifetime`：连接最大存活时间，建议小于数据库 `wait_timeout`
- `leak-detection-threshold`：连接泄漏检测，超过该时间未归还则打印告警日志

**2. 应用层连接泄漏排查**

在应用服务器上执行：

```bash
# Linux 环境：监控连接到数据库的 TCP 连接数
watch -n 1 'netstat -anp | grep <tdsql_ip>:3306 | grep ESTABLISHED | wc -l'

# 查看每个进程的连接数
netstat -anp | grep <tdsql_ip>:3306 | grep ESTABLISHED | awk '{print $7}' | cut -d'/' -f1 | sort | uniq -c | sort -rn
```

如果连接数持续增长而不回落，说明存在连接泄漏。

**3. 配置数据库端超时**

```sql
-- 设置空闲连接超时（建议 300~600 秒）
SET GLOBAL wait_timeout = 300;
SET GLOBAL interactive_timeout = 300;

-- 设置连接超时（建议 30 秒）
SET GLOBAL connect_timeout = 30;
```

**4. 接入层限流**

在 Nginx 或 API 网关层配置限流，防止突发流量打满连接池：

```nginx
# Nginx 限流配置示例
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;

location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://backend;
}
```

---

## 26.3 CPU 飙升

### 26.3.1 现象

- 监控面板 CPU 使用率持续超过 80%，甚至达到 100%
- 业务响应变慢，接口耗时从毫秒级增加到秒级
- 数据库 QPS/TPS 下降或剧烈波动
- 数据库连接数可能同步上升（因为查询变慢，连接占用时间变长）
- TDSQL 控制台显示数据节点或网关节点 CPU 告警

### 26.3.2 根因分析

CPU 飙升的常见原因按频率排序：

**1. 大量慢查询（最常见，占 60% 以上）**

全表扫描、缺少索引、复杂 JOIN 或子查询导致 CPU 密集计算。例如：

```sql
-- 缺少索引的全表扫描
SELECT * FROM orders WHERE status = 'PENDING';

-- 复杂 JOIN 导致嵌套循环扫描
SELECT a.*, b.name FROM orders a
LEFT JOIN users b ON a.user_id = b.id
WHERE a.created_at > '2024-01-01'
ORDER BY a.total_amount DESC;
```

当 `rows_examined` 远大于 `rows_sent` 时，说明数据库扫描了大量不需要的行，CPU 浪费严重。

**2. 高并发短查询**

即使单查询很轻（执行时间 < 1ms），当 QPS 达到数万甚至数十万时，累积的 CPU 开销也会打满。这种情况在秒杀、抢票等场景中常见。

**3. DDL 操作**

大表 `ALTER TABLE`、`OPTIMIZE TABLE`、`ANALYZE TABLE` 等操作消耗大量 CPU 和 IO。`ALTER TABLE` 在 InnoDB 中需要重建表，对于上亿行的表可能耗时数小时。

**4. 锁竞争**

行锁、间隙锁、MDL 锁导致大量线程处于等待状态，上下文切换频繁。CPU 可能大量消耗在 `spin lock` 和 `mutex` 上，而不是实际的数据处理。

**5. TDSQL 调度节点压力**

在分布式事务较多、跨分片查询频繁的场景下，调度节点（Scheduler）需要协调多个分片的事务状态，计算分片路由，CPU 可能成为瓶颈。

**6. 内存不足导致 buffer pool 频繁换入换出**

当 InnoDB buffer pool 不足时，MySQL 需要频繁从磁盘读取数据页，CPU 等待 IO 的时间增加，表现为 CPU 使用率高但实际有效计算少。

### 26.3.3 排查步骤

**步骤一：定位当前消耗 CPU 的查询**

```sql
-- 查看当前正在执行的查询及其耗时
SELECT id, user, host, db, command, time, state, info
FROM information_schema.processlist
WHERE command != 'Sleep'
ORDER BY time DESC
LIMIT 20;
```

重点关注 `time` 大且 `state` 为 `Sending data`、`Sorting result`、`Creating sort index` 的查询，这些通常是最消耗 CPU 的。

**步骤二：查看 InnoDB 引擎状态**

```sql
SHOW ENGINE INNODB STATUS\G
```

重点关注以下部分：

- `LATEST DETECTED DEADLOCK`：最近发生的死锁信息
- `TRANSACTIONS`：当前活跃事务列表，关注 `ACTIVE` 时间长的
- `BUFFER POOL AND MEMORY`：buffer pool 命中率，`Database pages` 数量
- `ROW OPERATIONS`：行操作统计，关注 `queries inside InnoDB` 数量

**步骤三：分析慢查询日志**

```sql
-- 查看慢查询日志配置
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';
SHOW VARIABLES LIKE 'log_queries_not_using_indexes';

-- 查看慢查询累计数量
SHOW GLOBAL STATUS LIKE 'Slow_queries';

-- 查看最近 N 分钟内的慢查询数量（需记录两次值计算差值）
```

如果 `Slow_queries` 在短时间内快速增长，说明系统正在被慢查询拖累。

**步骤四：使用 performance_schema 定位高负载查询**

```sql
-- 按总执行时间排序（需开启 performance_schema）
SELECT THREAD_ID, EVENT_NAME, COUNT_STAR,
       ROUND(SUM_TIMER_WAIT / 1000000000000, 2) AS total_sec,
       ROUND(AVG_TIMER_WAIT / 1000000000, 2) AS avg_ms,
       ROUND(MAX_TIMER_WAIT / 1000000000, 2) AS max_ms
FROM performance_schema.events_statements_summary_by_thread_by_event_name
WHERE EVENT_NAME LIKE 'statement/sql/%'
  AND SUM_TIMER_WAIT > 0
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 10;
```

**步骤五：检查 TDSQL 各节点 CPU 分布**

通过腾讯云监控 API 或控制台查看每个数据节点和网关节点的 CPU 使用率：

1. 登录 TDSQL 控制台
2. 进入实例详情页 → 监控
3. 分别查看每个数据节点和网关节点的 CPU 使用率曲线

如果某个分片的 CPU 明显高于其他分片，说明存在**数据倾斜**——该分片承担了不成比例的负载。需要检查拆分键的设计是否合理。

**步骤六：检查 buffer pool 命中率**

```sql
-- 查看 buffer pool 命中率
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests';
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_reads';

-- 计算命中率
SELECT ROUND(
  (SELECT VARIABLE_VALUE FROM performance_schema.global_status
   WHERE VARIABLE_NAME = 'Innodb_buffer_pool_read_requests')
  / ((SELECT VARIABLE_VALUE FROM performance_schema.global_status
      WHERE VARIABLE_NAME = 'Innodb_buffer_pool_read_requests')
     + (SELECT VARIABLE_VALUE FROM performance_schema.global_status
        WHERE VARIABLE_NAME = 'Innodb_buffer_pool_reads'))
  * 100, 2
) AS buffer_pool_hit_ratio;
```

如果命中率低于 95%，说明 buffer pool 过小，需要扩容内存。

### 26.3.4 解决方案

**紧急止血：**

```sql
-- 1. 杀掉长时间运行的查询（谨慎使用，确认不影响核心业务）
KILL <thread_id>;

-- 2. 批量杀空闲超过 600 秒的连接
SELECT CONCAT('KILL ', id, ';') AS kill_command
FROM information_schema.processlist
WHERE command = 'Sleep' AND time > 600;

-- 3. 查看并杀掉锁等待的源头
SELECT blocking_pid, blocked_pid, waiting_query, blocking_query
FROM sys.innodb_lock_waits;
```

**长期修复方案：**

| 场景 | 方案 | 具体操作 |
|------|------|----------|
| 慢查询导致 | 优化 SQL 和索引 | 见 26.4 节 |
| 高并发短查询 | 扩容数据节点 | 增加分片数或提升节点规格 |
| 高并发读 | 增加只读实例 | 在控制台添加只读实例分担读压力 |
| DDL 操作 | 使用 pt-osc | 业务低峰期执行，使用 pt-online-schema-change |
| 锁竞争 | 优化事务 | 缩小事务范围，减少锁持有时间 |
| 数据倾斜 | 调整拆分键 | 重新设计 shardkey，均匀分布数据 |
| buffer pool 不足 | 扩容内存 | 提升实例规格，增加 buffer pool 大小 |

**pt-online-schema-change 使用示例：**

```bash
# 在线修改大表结构，不阻塞读写
pt-online-schema-change --alter "ADD INDEX idx_status(status)" \
  D=db_name,t=orders \
  --execute \
  --chunk-size=1000 \
  --max-lag=5 \
  --check-interval=1
```

---

## 26.4 慢查询分析

### 26.4.1 现象

- 业务接口响应时间从毫秒级增加到秒级甚至分钟级
- 慢查询日志中记录了大量超过 `long_query_time` 阈值的 SQL
- 数据库 CPU 和 IOPS 持续偏高
- 数据库连接数上升（因为查询变慢，连接占用时间变长）
- 用户投诉系统响应慢

### 26.4.2 根因分析

慢查询的根因可以归纳为以下几类：

**1. 索引问题（最常见，占 70% 以上）**

- **索引缺失**：WHERE 条件列、JOIN 关联列、ORDER BY 列未建索引
- **索引选择性差**：索引列重复率过高（如性别、状态列），优化器可能放弃使用
- **索引失效**：隐式类型转换、函数包裹索引列、LIKE 前导通配符
- **复合索引顺序不当**：未遵循最左前缀原则

**2. SQL 写法问题**

- `SELECT *` 返回不需要的列，增加网络传输和内存占用
- 未使用 LIMIT，一次返回大量数据
- 在 WHERE 条件中对索引列使用函数：`WHERE DATE(create_time) = '2024-01-01'`
- 隐式类型转换：`WHERE user_id = '123'`（user_id 为整数列）
- 子查询优化不佳，被优化为依赖子查询（DEPENDENT SUBQUERY）

**3. 数据量增长**

表数据量从百万级增长到千万级、亿级后，即使有索引，B+ 树高度增加，IO 次数增加，查询性能自然下降。此时需要考虑分库分表或使用 TDSQL 的分片能力。

**4. TDSQL 分片键选择不当**

TDSQL 中，不带拆分键的查询会广播到所有分片，然后在网关节点聚合结果。这种查询的性能取决于最慢的分片，且网关节点需要做大量聚合计算。

```sql
-- 假设 orders 表的分片键是 order_id
-- 以下查询会广播到所有分片（性能差）
SELECT * FROM orders WHERE user_id = 12345;

-- 以下查询只路由到目标分片（性能好）
SELECT * FROM orders WHERE order_id = 'ORD20240101001';
```

**5. 锁等待**

查询本身执行很快（几毫秒），但被其他事务的行锁或 MDL 锁阻塞，导致实际响应时间很长。这种情况在 `SHOW PROCESSLIST` 中表现为 `time` 很大但 `state` 为 `Waiting for table level lock` 或 `Waiting for metadata lock`。

### 26.4.3 排查步骤

**步骤一：开启慢查询日志**

```sql
-- 开启慢查询日志（生产环境建议始终开启）
SET GLOBAL slow_query_log = ON;

-- 设置阈值：超过 1 秒的记录（生产环境建议 1~2 秒）
SET GLOBAL long_query_time = 1;

-- 记录未使用索引的查询
SET GLOBAL log_queries_not_using_indexes = ON;

-- 设置慢查询日志文件名
SET GLOBAL slow_query_log_file = '/data/tdsql/log/slow.log';
```

**步骤二：使用 EXPLAIN 分析执行计划**

```sql
EXPLAIN SELECT * FROM orders WHERE order_id = 'ORD20240101001'\G
```

输出示例及解读：

```
*************************** 1. row ***************************
           id: 1
  select_type: SIMPLE
        table: orders
   partitions: NULL
         type: ref
possible_keys: PRIMARY,idx_order_id
          key: idx_order_id
      key_len: 62
          ref: const
         rows: 1
     filtered: 100.00
        Extra: NULL
```

关键字段解读：

| 字段 | 说明 | 优 | 差 |
|------|------|----|----|
| `type` | 访问类型 | `const` > `eq_ref` > `ref` > `range` > `index` > `ALL` |
| `rows` | 估算扫描行数 | 接近实际结果集 | 远大于实际结果集 |
| `key` | 使用的索引 | 有值 | `NULL` |
| `Extra` | 额外信息 | `Using index`（覆盖索引） | `Using filesort`、`Using temporary`、`Using where` |

**type 字段详解：**

- `const`：主键或唯一索引等值查询，最多返回一行，最快
- `eq_ref`：JOIN 时使用主键或唯一索引关联，每次匹配一行
- `ref`：普通索引等值查询，返回多行
- `range`：索引范围查询（`>`、`<`、`BETWEEN`、`IN`）
- `index`：扫描整个索引树，比全表扫描略好
- `ALL`：全表扫描，最差

**Extra 字段危险信号：**

- `Using filesort`：需要额外排序操作，通常因为 ORDER BY 列未建索引
- `Using temporary`：使用了临时表，通常因为 GROUP BY 或 DISTINCT 未走索引
- `Using where`：使用了 WHERE 过滤但未使用索引
- `Using index condition`：使用了索引下推（ICP），MySQL 5.6+ 的优化
- `Using index`：覆盖索引，不需要回表查询，最优

**步骤三：分析慢查询日志**

```bash
# 使用 mysqldumpslow 工具汇总慢查询日志
# -s t：按总耗时排序
# -t 10：显示 Top 10
mysqldumpslow -s t -t 10 /data/tdsql/slow.log

# 按平均耗时排序
mysqldumpslow -s at -t 10 /data/tdsql/slow.log

# 按查询次数排序
mysqldumpslow -s c -t 10 /data/tdsql/slow.log
```

输出示例：

```
Reading mysql slow query log from /data/tdsql/slow.log
Count: 4231  Time=3.60s (15234s)  Lock=0.01s (42s)  Rows=1.0 (4231)
  SELECT * FROM orders WHERE status = 'N'

Count: 3120  Time=2.86s (8912s)  Lock=0.02s (62s)  Rows=1000.0 (3120000)
  SELECT * FROM order_items WHERE order_id = 'S'
```

解读：第一条 SQL 执行了 4231 次，平均耗时 3.60 秒，总耗时 15234 秒，是优化优先级最高的。

**步骤四：检查分片键使用情况**

```sql
-- 查看表的分片键定义
SHOW CREATE TABLE orders;

-- 查看 TDSQL 分片信息（需在 TDSQL 控制台或通过特定命令）
-- 检查查询是否包含分片键
EXPLAIN SELECT * FROM orders WHERE non_shard_key = 'value';
```

如果 `EXPLAIN` 结果显示扫描了所有分片，说明查询条件不包含分片键，需要优化。

**步骤五：检查锁等待**

```sql
-- 查看当前锁等待情况
SELECT * FROM sys.innodb_lock_waits;

-- 查看当前事务
SELECT trx_id, trx_state, trx_started, trx_mysql_thread_id,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS running_seconds,
       trx_rows_locked, trx_rows_modified
FROM information_schema.innodb_trx
ORDER BY trx_started ASC
LIMIT 20;
```

### 26.4.4 慢查询分析脚本

以下 Python 脚本可对 TDSQL 慢查询日志进行自动化分析，输出 Top N 慢查询及其统计信息，并给出优化建议：

```python
#!/usr/bin/env python3
"""
TDSQL 慢查询日志分析工具 (tdsql_slow_analyzer.py)
功能：
  1. 解析 TDSQL/MySQL 慢查询日志
  2. 按归一化 SQL 聚合统计
  3. 输出 Top N 慢查询及优化建议
  4. 输出慢查询时间分布
  5. 输出慢查询按小时分布（用于识别高峰期）
"""

import re
import sys
import argparse
from collections import defaultdict
from datetime import datetime


class SlowQuery:
    """慢查询条目"""

    def __init__(self):
        self.timestamp = ""
        self.user_host = ""
        self.query_time = 0.0
        self.lock_time = 0.0
        self.rows_sent = 0
        self.rows_examined = 0
        self.sql = ""
        self.db = ""
        self.hour = -1  # 用于按小时统计


def parse_slow_log(filepath):
    """解析 TDSQL/MySQL 慢查询日志，返回 SlowQuery 对象列表"""
    queries = []
    current = None
    sql_lines = []

    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.rstrip("\n")

            # 匹配慢查询开始行
            if line.startswith("# Time:"):
                if current and current.sql:
                    current.sql = " ".join(sql_lines)
                    queries.append(current)
                current = SlowQuery()
                timestamp_str = line.replace("# Time:", "").strip()
                current.timestamp = timestamp_str
                # 尝试解析小时
                try:
                    # 格式: 2026-06-28T14:30:00
                    dt = datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M:%S")
                    current.hour = dt.hour
                except ValueError:
                    try:
                        # 格式: 240628 14:30:00
                        dt = datetime.strptime(timestamp_str, "%y%m%d %H:%M:%S")
                        current.hour = dt.hour
                    except ValueError:
                        current.hour = -1
                sql_lines = []
                continue

            if current is None:
                continue

            # 解析 User@Host
            if line.startswith("# User@Host:"):
                current.user_host = line.replace("# User@Host:", "").strip()
                continue

            # 解析查询统计
            if line.startswith("# Query_time:"):
                parts = line.strip().split()
                for i, p in enumerate(parts):
                    if p == "Query_time:":
                        current.query_time = float(parts[i + 1].strip())
                    elif p == "Lock_time:":
                        current.lock_time = float(parts[i + 1].strip())
                    elif p == "Rows_sent:":
                        current.rows_sent = int(parts[i + 1].strip())
                    elif p == "Rows_examined:":
                        current.rows_examined = int(parts[i + 1].strip())
                continue

            # 解析数据库
            if line.startswith("# Database:"):
                current.db = line.replace("# Database:", "").strip()
                continue

            # 跳过 SET timestamp
            if line.startswith("SET timestamp="):
                continue

            # 跳过 USE database
            if line.startswith("USE "):
                continue

            # 收集 SQL 行
            if line and not line.startswith("#"):
                sql_lines.append(line.strip())

    # 处理最后一条
    if current and current.sql:
        current.sql = " ".join(sql_lines)
        queries.append(current)

    return queries


def normalize_sql(sql):
    """
    归一化 SQL：将具体值替换为占位符，用于聚合同类 SQL。
    例如：
      SELECT * FROM users WHERE id = 123
      → SELECT * FROM users WHERE id = ?
    """
    # 替换引号内的字符串
    normalized = re.sub(r"'[^']*'", "?", sql)
    # 替换数字（保留小数点和负号）
    normalized = re.sub(r"\b\d+\.?\d*\b", "?", normalized)
    # 替换 IN 列表
    normalized = re.sub(r"\(\s*\?\s*(,\s*\?\s*)*\)", "(?)", normalized)
    # 合并连续空格
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def generate_optimization_advice(sql, stats):
    """根据 SQL 特征生成优化建议"""
    advice = []
    sql_upper = sql.upper()

    if "SELECT *" in sql_upper:
        advice.append("避免 SELECT *，只查询需要的列，减少网络传输和内存占用")

    if "WHERE" in sql_upper:
        # 检查 WHERE 条件中可能的隐式转换
        where_clause = sql[sql_upper.index("WHERE"):]
        if re.search(r"WHERE\s+\w+\s*=\s*\d+", sql):
            # 检查列名是否可能是字符串类型
            pass  # 需要表结构信息才能准确判断
        advice.append("检查 WHERE 条件列是否有索引，使用 EXPLAIN 确认执行计划")

    if "ORDER BY" in sql_upper and "LIMIT" not in sql_upper:
        advice.append("ORDER BY 未配合 LIMIT 可能导致大量排序，建议添加 LIMIT")

    if "JOIN" in sql_upper:
        advice.append("JOIN 查询请确保关联列有索引，且驱动表选择正确")

    if "LIKE" in sql_upper:
        if "'%" in sql or "'%" in sql:
            advice.append("LIKE 前导通配符 '%...' 无法使用索引，考虑使用全文索引或搜索引擎")

    if "NOT IN" in sql_upper:
        advice.append("NOT IN 通常无法使用索引，考虑改写为 NOT EXISTS 或 LEFT JOIN ... IS NULL")

    if "GROUP BY" in sql_upper and "ORDER BY" not in sql_upper:
        advice.append("GROUP BY 默认会排序，如果不需要排序请添加 ORDER BY NULL")

    if stats["total_rows_examined"] > stats["total_rows_sent"] * 100:
        advice.append(
            f"扫描行数 ({stats['total_rows_examined']}) 远大于发送行数 "
            f"({stats['total_rows_sent']})，强烈建议优化索引"
        )

    if stats["max_time"] > 10:
        advice.append(f"最大耗时 {stats['max_time']:.2f}s，考虑拆分大查询或增加缓存")

    if not advice:
        advice.append("使用 EXPLAIN 分析执行计划，确认是否使用了合适的索引")

    return advice


def analyze(queries, top_n=10):
    """分析慢查询，输出统计报告"""
    if not queries:
        print("未解析到慢查询记录，请检查日志格式。")
        return

    # 按归一化 SQL 聚合
    sql_stats = defaultdict(lambda: {
        "count": 0,
        "total_time": 0.0,
        "max_time": 0.0,
        "min_time": float("inf"),
        "avg_time": 0.0,
        "total_rows_examined": 0,
        "total_rows_sent": 0,
        "sample_sql": "",
        "sample_db": "",
    })

    for q in queries:
        key = normalize_sql(q.sql)
        stats = sql_stats[key]
        stats["count"] += 1
        stats["total_time"] += q.query_time
        stats["max_time"] = max(stats["max_time"], q.query_time)
        stats["min_time"] = min(stats["min_time"], q.query_time)
        stats["total_rows_examined"] += q.rows_examined
        stats["total_rows_sent"] += q.rows_sent
        if not stats["sample_sql"]:
            stats["sample_sql"] = q.sql[:500]
            stats["sample_db"] = q.db

    # 计算平均值
    for stats in sql_stats.values():
        stats["avg_time"] = round(stats["total_time"] / stats["count"], 2)

    # 按总耗时排序
    sorted_sql = sorted(
        sql_stats.items(), key=lambda x: x[1]["total_time"], reverse=True
    )

    # ========== 输出报告 ==========
    print("=" * 100)
    print("  TDSQL 慢查询分析报告")
    print("=" * 100)
    print(f"  分析时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  日志文件: {args.logfile}")
    print(f"  慢查询总数: {len(queries)}")
    print(f"  归一化 SQL 种类: {len(sql_stats)}")
    print(f"  总耗时: {sum(s['total_time'] for s in sql_stats.values()):.2f}s")
    print("=" * 100)

    # ========== Top N 慢查询 ==========
    print(f"\n{'='*100}")
    print(f"  Top {top_n} 慢查询（按总耗时排序）")
    print(f"{'='*100}")
    print(
        f"{'排名':<6}{'次数':<8}{'总耗时(s)':<12}{'平均(s)':<10}"
        f"{'最大(s)':<10}{'扫描行':<12}{'返回行':<10}  SQL 样本"
    )
    print("-" * 100)

    for i, (normalized, stats) in enumerate(sorted_sql[:top_n], 1):
        sample = stats["sample_sql"][:55].replace("\n", " ")
        print(
            f"{i:<6}{stats['count']:<8}{stats['total_time']:<12.2f}"
            f"{stats['avg_time']:<10.2f}{stats['max_time']:<10.2f}"
            f"{stats['total_rows_examined']:<12}{stats['total_rows_sent']:<10}"
            f"  {sample}..."
        )

    # ========== 详细分析 ==========
    print(f"\n{'='*100}")
    print("  Top 5 慢查询详细分析与优化建议")
    print(f"{'='*100}")

    for i, (normalized, stats) in enumerate(sorted_sql[:5], 1):
        print(f"\n--- 第 {i} 名 ---")
        print(f"  数据库: {stats['sample_db']}")
        print(f"  执行次数: {stats['count']}")
        print(f"  总耗时: {stats['total_time']:.2f}s")
        print(f"  平均耗时: {stats['avg_time']:.2f}s")
        print(f"  最大耗时: {stats['max_time']:.2f}s")
        print(f"  最小耗时: {stats['min_time']:.2f}s")
        print(f"  总扫描行数: {stats['total_rows_examined']}")
        print(f"  总返回行数: {stats['total_rows_sent']}")
        print(f"  SQL 样本:")
        # 格式化输出 SQL
        sql_lines = stats["sample_sql"][:300].split("\n")
        for line in sql_lines:
            print(f"    {line}")
        print(f"  优化建议:")
        advice_list = generate_optimization_advice(
            stats["sample_sql"], stats
        )
        for j, adv in enumerate(advice_list, 1):
            print(f"    {j}. {adv}")

    # ========== 时间分布 ==========
    print(f"\n{'='*100}")
    print("  慢查询时间分布")
    print(f"{'='*100}")

    buckets = [
        (0, 1, "0~1s"),
        (1, 2, "1~2s"),
        (2, 5, "2~5s"),
        (5, 10, "5~10s"),
        (10, 30, "10~30s"),
        (30, 60, "30~60s"),
        (60, float("inf"), ">60s"),
    ]

    for low, high, label in buckets:
        count = sum(1 for q in queries if low <= q.query_time < high)
        pct = count / len(queries) * 100
        bar_len = int(pct / 2)
        bar = "#" * bar_len if bar_len > 0 else ""
        print(f"  {label:>8}: {count:>6} 次 ({pct:>5.1f}%)  {bar}")

    # ========== 按小时分布 ==========
    hourly_queries = [q for q in queries if q.hour >= 0]
    if hourly_queries:
        print(f"\n{'='*100}")
        print("  慢查询按小时分布（用于识别高峰期）")
        print(f"{'='*100}")

        hourly_count = defaultdict(int)
        for q in hourly_queries:
            hourly_count[q.hour] += 1

        max_count = max(hourly_count.values()) if hourly_count else 1
        for hour in range(24):
            count = hourly_count.get(hour, 0)
            bar_len = int(count / max_count * 40)
            bar = "#" * bar_len
            print(f"  {hour:02d}:00: {count:>6} 次 {bar}")

    # ========== 总结 ==========
    print(f"\n{'='*100}")
    print("  总结与建议")
    print(f"{'='*100}")

    total_time = sum(s["total_time"] for s in sql_stats.values())
    if sorted_sql:
        top1 = sorted_sql[0][1]
        print(f"  - Top 1 慢查询（{top1['sample_sql'][:50]}...）占总耗时的 "
              f"{top1['total_time']/total_time*100:.1f}%，建议优先优化")

    high_freq = [s for s in sql_stats.values() if s["count"] > 1000]
    if high_freq:
        print(f"  - 执行超过 1000 次的慢查询有 {len(high_freq)} 种，"
              f"建议重点关注高频低耗时的查询")

    print(f"  - 建议将优化后的 SQL 加入慢查询白名单，持续监控")
    print(f"  - 建议设置慢查询告警：当每分钟慢查询数超过阈值时告警")


def main():
    parser = argparse.ArgumentParser(
        description="TDSQL 慢查询日志分析工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  %(prog)s /data/tdsql/slow.log
  %(prog)s /data/tdsql/slow.log --top 20
  %(prog)s /data/tdsql/slow.log --top 5 > report.txt
        """,
    )
    parser.add_argument("logfile", help="慢查询日志文件路径")
    parser.add_argument(
        "--top", type=int, default=10, help="显示 Top N 慢查询 (默认 10)"
    )
    global args
    args = parser.parse_args()

    print(f"正在解析慢查询日志: {args.logfile}")
    queries = parse_slow_log(args.logfile)
    analyze(queries, top_n=args.top)


if __name__ == "__main__":
    main()
```

**使用方式：**

```bash
# 基本使用
python3 tdsql_slow_analyzer.py /data/tdsql/slow.log

# 显示 Top 20
python3 tdsql_slow_analyzer.py /data/tdsql/slow.log --top 20

# 输出到文件
python3 tdsql_slow_analyzer.py /data/tdsql/slow.log --top 5 > slow_report_20260628.txt
```

**脚本输出示例：**

```
正在解析慢查询日志: /data/tdsql/slow.log
====================================================================================================
  TDSQL 慢查询分析报告
====================================================================================================
  分析时间: 2026-06-28 14:30:00
  日志文件: /data/tdsql/slow.log
  慢查询总数: 15234
  归一化 SQL 种类: 47
  总耗时: 45678.23s
====================================================================================================

====================================================================================================
  Top 10 慢查询（按总耗时排序）
====================================================================================================
排名    次数    总耗时(s)  平均(s)   最大(s)   扫描行        返回行      SQL 样本
1       4231    15234.23   3.60      12.34     84562341     4231       SELECT * FROM orders WHERE status = ?...
2       3120    8912.45    2.86      8.91      31200000     3120       SELECT * FROM order_items WHERE order_i...
3       2100    5678.12    2.70      6.54      21000000     2100       SELECT a.*,b.name FROM orders a LEFT JO...
...
```

### 26.4.5 慢查询优化 Checklist

| 检查项 | 操作 | 验证方法 |
|--------|------|----------|
| 索引检查 | `SHOW INDEX FROM table;` 确认索引覆盖 WHERE 条件 | EXPLAIN 的 key 字段不为 NULL |
| 隐式转换 | 检查字段类型与查询值类型是否一致 | EXPLAIN 的 type 为 ALL 且 rows 很大 |
| 分片键 | 确认查询条件包含拆分键 | 查看 TDSQL 路由日志 |
| 分页优化 | 大偏移量分页改用游标分页 | `WHERE id > ? LIMIT ?` 替代 `LIMIT ?, ?` |
| 避免 SELECT * | 只查询需要的列 | 减少网络传输和内存占用 |
| 批量操作 | 大批量操作拆分为小批次 | 每批 1000~5000 行，使用 LIMIT 分批 |
| 覆盖索引 | 将查询列包含到索引中 | Extra 显示 `Using index` |
| 索引合并 | 多个单列索引考虑合并为复合索引 | 查看优化器是否使用索引合并 |

---

## 26.5 主从复制延迟

### 26.5.1 现象

- 从库（只读实例）数据与主库不一致
- 业务刚写入的数据在只读实例上查询不到
- 监控面板 `Seconds_Behind_Master` 持续增大
- TDSQL 控制台显示复制延迟告警
- 强同步模式下，主库写入性能也受到影响（因为需要等待从库确认）

### 26.5.2 根因分析

TDSQL 主从复制延迟的常见原因：

**1. 主库写入压力过大（最常见）**

主库的 binlog 生成速度超过从库的回放速度。当主库 QPS 很高时，binlog 事件产生速率可能达到数百 MB/s，而从库受限于单线程回放（SQL Thread），无法及时消化。

**2. 从库配置不足**

从库的 CPU、内存、IOPS 规格低于主库。这是非常常见的配置错误——为了节省成本，客户给从库配置了较低的规格，导致从库回放能力不足。

**3. 大事务**

单条 SQL 影响大量行（如 `UPDATE` 全表、`DELETE` 大批量数据），生成的 binlog 巨大。从库在回放大事务时，SQL 线程是单线程执行的，大事务会阻塞后续所有 binlog 事件的回放。

一个更新 100 万行的事务，binlog 大小可能达到数百 MB，从库回放可能需要数分钟。在此期间，从库落后主库的时间持续增加。

**4. DDL 操作**

`ALTER TABLE` 等 DDL 在从库执行时，需要获取 MDL 锁，可能阻塞 SQL 线程。DDL 操作在从库是串行执行的，执行期间从库无法回放其他 binlog 事件。

**5. 网络延迟**

主从之间的网络带宽不足或延迟高。跨可用区部署时，网络延迟通常在 1~5ms，但带宽可能成为瓶颈。当 binlog 生成速率接近带宽上限时，IO 线程无法及时拉取 binlog。

**6. 从库存在慢查询**

从库上的查询长时间占用 CPU/IO，拖慢 SQL 线程的回放速度。从库不仅要回放 binlog，还要响应查询请求，两者共享 CPU 和 IO 资源。

**7. TDSQL 强同步机制**

TDSQL 默认使用强同步（强一致）复制，主库需要等待至少一个从库确认写入后才返回客户端。如果从库确认延迟，主库的写入性能也会受到影响。这是分布式系统 CAP 理论中一致性和可用性的权衡。

### 26.5.3 排查步骤

**步骤一：查看复制状态**

```sql
-- 在从库执行
SHOW SLAVE STATUS\G
```

关键字段解读：

| 字段 | 说明 | 正常值 | 异常值 |
|------|------|--------|--------|
| `Slave_IO_Running` | IO 线程是否运行 | Yes | No / Connecting |
| `Slave_SQL_Running` | SQL 线程是否运行 | Yes | No |
| `Seconds_Behind_Master` | 从库落后主库的秒数 | 0 | > 0 且增长 |
| `Relay_Log_Space` | 中继日志占用空间 | 稳定 | 持续增长 |
| `Exec_Master_Log_Pos` | 已执行到的 binlog 位置 | 接近主库位置 | 与主库差距大 |
| `Read_Master_Log_Pos` | 已读取到的 binlog 位置 | 接近主库位置 | 与主库差距大 |
| `Last_IO_Errno` | IO 线程错误号 | 0 | 非 0 |
| `Last_SQL_Errno` | SQL 线程错误号 | 0 | 非 0 |
| `Master_Log_File` | 当前读取的 binlog 文件 | 与主库一致 | 落后 |
| `Relay_Master_Log_File` | 当前回放的 binlog 文件 | 与主库一致 | 落后 |

**步骤二：查看主库 binlog 生成速度**

```sql
-- 在主库执行，记录当前 binlog 位置
SHOW MASTER STATUS;

-- 等待 60 秒后再次执行，计算差值
-- 差值即为 60 秒内生成的 binlog 大小
```

**步骤三：查看从库回放速度**

```sql
-- 在从库执行，查看是否有锁等待
SHOW PROCESSLIST;

-- 关注 State 为以下值的线程：
-- - 'System lock'：等待表锁
-- - 'Waiting for table level lock'：等待表级锁
-- - 'Waiting for metadata lock'：等待 MDL 锁
-- - 'Slave has read all relay log'：从库已追上，正常状态
```

**步骤四：检查大事务**

```sql
-- 查看当前正在执行的事务（按修改行数降序）
SELECT trx_id, trx_state, trx_started, trx_mysql_thread_id,
       trx_rows_locked, trx_rows_modified,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS running_seconds
FROM information_schema.innodb_trx
WHERE trx_rows_modified > 1000
ORDER BY trx_rows_modified DESC
LIMIT 10;
```

**步骤五：检查从库的查询负载**

```sql
-- 在从库查看当前查询
SELECT id, user, host, db, command, time, state, info
FROM information_schema.processlist
WHERE command != 'Sleep'
ORDER BY time DESC
LIMIT 20;
```

如果从库上有大量慢查询，这些查询会与 SQL 线程争抢 CPU 和 IO 资源。

**步骤六：查看 relay log 积压**

```sql
-- 查看 relay log 大小
SHOW GLOBAL STATUS LIKE 'Relay_log_space%';

-- 如果 Relay_Log_Space 持续增长，说明 SQL 线程回放速度跟不上 IO 线程拉取速度
```

### 26.5.4 解决方案

**紧急止血：**

| 操作 | 命令/方式 | 说明 |
|------|-----------|------|
| 暂停从库查询 | 将查询流量切到其他只读实例 | 让从库专注回放 |
| 跳过错误 | `SET GLOBAL sql_slave_skip_counter = 1;` | 跳过导致 SQL 线程停止的错误 |
| 重启复制 | `STOP SLAVE; START SLAVE;` | 解决临时性故障 |
| 重新搭建从库 | 控制台重建只读实例 | 当 relay log 损坏时 |

**长期修复方案：**

**1. 从库升配**

在腾讯云控制台提升从库规格，确保从库的 CPU、内存、IOPS 不低于主库。建议从库规格至少为主库的 80%。

**2. 拆分大事务**

大批量 UPDATE/DELETE 使用 LIMIT 分批执行：

```sql
-- 错误做法：一次更新 100 万行
UPDATE orders SET status = 'archived' WHERE created_at < '2024-01-01';

-- 正确做法：分批更新，每批 5000 行
DELIMITER $$
CREATE PROCEDURE batch_archive()
BEGIN
  DECLARE affected_rows INT DEFAULT 1;
  WHILE affected_rows > 0 DO
    UPDATE orders SET status = 'archived'
    WHERE created_at < '2024-01-01' AND status != 'archived'
    LIMIT 5000;
    SET affected_rows = ROW_COUNT();
    -- 提交事务，释放锁
    COMMIT;
    -- 暂停 100ms，给从库回放留出时间
    DO SLEEP(0.1);
  END WHILE;
END$$
DELIMITER ;
CALL batch_archive();
```

**3. 避免高峰期 DDL**

DDL 安排在业务低峰期执行。对于大表，使用 pt-online-schema-change 工具：

```bash
pt-online-schema-change --alter "ADD INDEX idx_created_at(created_at)" \
  D=db_name,t=orders \
  --execute \
  --chunk-size=2000 \
  --max-lag=10 \
  --check-interval=1 \
  --critical-load="Threads_running=200"
```

**4. 增加只读实例**

如果从库既要回放 binlog 又要承担查询压力，建议增加只读实例，将查询分散到多个只读实例上，让每个从库的负载降低。

**5. 调整同步模式**

对于非核心业务，可以在 TDSQL 控制台将同步模式从强同步调整为异步复制。但需要注意，异步复制可能丢失数据。

**6. 监控网络**

检查主从节点是否在同一可用区。如果跨可用区部署，网络延迟会增加。建议将主从节点部署在同一可用区，或使用腾讯云的内网高速通道。

**7. 启用并行回放**

TDSQL 支持并行复制（slave_parallel_workers），可以在从库启用多线程回放：

```sql
-- 在从库设置并行回放线程数（需要重启生效）
SET GLOBAL slave_parallel_workers = 4;
SET GLOBAL slave_parallel_type = 'LOGICAL_CLOCK';
```

注意：并行回放需要 binlog 格式为 ROW，且事务之间没有冲突。

---

## 26.6 磁盘空间满

### 26.6.1 现象

- 监控面板磁盘使用率超过 90% 或达到 100%
- 数据库写入报错 `ERROR 1114 (HY000): The table 'xxx' is full`
- 数据库进入只读模式或完全不可用
- 慢查询日志无法写入
- binlog 无法写入，复制中断
- TDSQL 控制台磁盘告警

### 26.6.2 根因分析

磁盘空间满的常见原因：

**1. 数据量增长超出预期（最常见）**

业务增长快，磁盘初始分配不足。或者业务侧进行了大批量数据导入（如数据迁移、历史数据回填），导致磁盘空间迅速耗尽。

**2. binlog 堆积**

- `expire_logs_days` 设置过长（如 30 天），binlog 文件堆积
- 从库异常断开，主库的 binlog 无法被清理（MySQL 会保留从库尚未读取的 binlog）
- 主库写入量大，binlog 生成速度快于清理速度

**3. 慢查询日志和错误日志过大**

未配置日志轮转，日志文件持续增长。在极端情况下，慢查询日志可能达到数十 GB。

**4. 临时表空间膨胀**

大量使用 `Using temporary` 的查询在磁盘上创建临时表。如果并发量大，临时表空间可能迅速膨胀。

**5. undo 表空间过大**

长事务导致 undo 日志无法清理。InnoDB 的 MVCC 机制需要保留 undo 日志以支持事务回滚和一致性读。如果存在长时间未提交的事务，undo 表空间无法收缩。

**6. 数据碎片**

频繁的 DELETE/UPDATE 导致表碎片。InnoDB 的 B+ 树在删除数据后不会立即释放磁盘空间，而是标记为可重用。当碎片率较高时，实际占用空间远大于数据量。

### 26.6.3 排查步骤

**步骤一：查看磁盘使用概况**

```sql
-- 按数据库统计表空间使用量
SELECT table_schema AS db_name,
       ROUND(SUM(data_length + index_length) / 1024 / 1024 / 1024, 2) AS total_gb,
       ROUND(SUM(data_length) / 1024 / 1024 / 1024, 2) AS data_gb,
       ROUND(SUM(index_length) / 1024 / 1024 / 1024, 2) AS index_gb,
       COUNT(*) AS table_count,
       ROUND(SUM(data_free) / 1024 / 1024 / 1024, 2) AS frag_gb
FROM information_schema.tables
GROUP BY table_schema
ORDER BY total_gb DESC;
```

**步骤二：查看 Top 10 大表**

```sql
SELECT table_schema, table_name,
       ROUND((data_length + index_length) / 1024 / 1024 / 1024, 2) AS size_gb,
       ROUND(data_length / 1024 / 1024 / 1024, 2) AS data_gb,
       ROUND(index_length / 1024 / 1024 / 1024, 2) AS index_gb,
       ROUND(data_free / 1024 / 1024, 2) AS frag_mb,
       table_rows,
       ROUND((data_free) / (data_length + index_length) * 100, 2) AS frag_pct
FROM information_schema.tables
WHERE table_schema NOT IN ('mysql', 'performance_schema', 'sys', 'information_schema')
  AND (data_length + index_length) > 0
ORDER BY (data_length + index_length) DESC
LIMIT 10;
```

`frag_pct` 表示碎片率，超过 30% 时建议重建表释放空间。

**步骤三：查看 binlog 占用**

```sql
-- 查看 binlog 文件列表及大小
SHOW BINARY LOGS;

-- 查看 binlog 过期时间配置
SHOW VARIABLES LIKE 'expire_logs_days';
SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';  -- MySQL 8.0
```

```bash
# 在操作系统层面查看 binlog 目录大小
ls -lh /data/tdsql/binlog/
du -sh /data/tdsql/binlog/
```

**步骤四：查看临时文件**

```sql
-- 查看临时表配置
SHOW VARIABLES LIKE 'tmp_table_size';
SHOW VARIABLES LIKE 'max_heap_table_size';
SHOW VARIABLES LIKE 'tmpdir';
```

```bash
# 查看临时目录大小
du -sh /data/tdsql/tmp/
```

**步骤五：查看 undo 表空间**

```sql
-- 查看是否有长事务（undo 无法清理的原因）
SELECT trx_id, trx_started, trx_mysql_thread_id,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS running_seconds,
       trx_isolation_level
FROM information_schema.innodb_trx
ORDER BY trx_started ASC
LIMIT 10;

-- 查看 undo 表空间大小（MySQL 8.0）
SELECT TABLESPACE_NAME, FILE_NAME,
       ROUND(SUM(FILE_SIZE) / 1024 / 1024 / 1024, 2) AS size_gb
FROM information_schema.INNODB_TABLESPACES
WHERE TABLESPACE_NAME LIKE '%undo%'
GROUP BY TABLESPACE_NAME, FILE_NAME;
```

**步骤六：查看数据文件分布**

```bash
# 查看数据目录下各子目录的大小
du -sh /data/tdsql/data/*/ | sort -rh | head -10
```

### 26.6.4 解决方案

**紧急止血（按优先级）：**

| 优先级 | 操作 | 说明 |
|--------|------|------|
| P0 | 磁盘扩容 | 在腾讯云控制台扩容数据盘，最快止血方案 |
| P0 | 清理 binlog | `PURGE BINARY LOGS BEFORE NOW() - INTERVAL 1 DAY;` |
| P1 | 清理慢查询日志 | 关闭慢查询日志 → 删除/截断日志文件 → 重新开启 |
| P1 | 清理历史数据 | DELETE 过期数据 + OPTIMIZE TABLE |
| P2 | 重建表释放碎片 | `ALTER TABLE table_name ENGINE=InnoDB;` |

**紧急清理脚本：**

```sql
-- 1. 清理 1 天前的 binlog（紧急情况可以清理到只剩当前 binlog）
PURGE BINARY LOGS BEFORE DATE_SUB(NOW(), INTERVAL 1 DAY);

-- 2. 调整 binlog 保留期为 3 天
SET GLOBAL expire_logs_days = 3;

-- 3. 清理慢查询日志
SET GLOBAL slow_query_log = OFF;
-- 手动删除或 truncate 慢查询日志文件（在操作系统层面执行）
-- sudo truncate -s 0 /data/tdsql/log/slow.log
SET GLOBAL slow_query_log = ON;

-- 4. 清理过期数据（示例：删除 90 天前的订单）
DELETE FROM orders WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
LIMIT 10000;
-- 重复执行直到影响行数为 0

-- 5. 重建大表释放碎片
ALTER TABLE orders ENGINE=InnoDB;
-- 注意：ALTER TABLE 会重建表，需要足够的额外磁盘空间
```

**长期修复方案：**

**1. 设置合理的 binlog 保留期**

```sql
-- 建议保留 3~7 天
SET GLOBAL expire_logs_days = 3;
-- MySQL 8.0
SET GLOBAL binlog_expire_logs_seconds = 259200;  -- 3 天
```

**2. 使用分区表管理历史数据**

对于按时间范围查询的表，建议使用分区表，方便快速删除历史分区：

```sql
-- 创建分区表
CREATE TABLE orders (
    id BIGINT NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    -- 其他字段...
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p202401 VALUES LESS THAN (TO_DAYS('2024-02-01')),
    PARTITION p202402 VALUES LESS THAN (TO_DAYS('2024-03-01')),
    PARTITION p202403 VALUES LESS THAN (TO_DAYS('2024-04-01')),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- 删除历史分区（秒级完成，远快于 DELETE）
ALTER TABLE orders DROP PARTITION p202401;

-- 添加新分区
ALTER TABLE orders REORGANIZE PARTITION p_future INTO (
    PARTITION p202404 VALUES LESS THAN (TO_DAYS('2024-05-01')),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

**3. 定期重建表释放碎片**

```sql
-- 查看碎片率
SELECT table_schema, table_name,
       ROUND(data_free / 1024 / 1024, 2) AS frag_mb,
       ROUND(data_free / (data_length + index_length) * 100, 2) AS frag_pct
FROM information_schema.tables
WHERE data_free > 104857600  -- 碎片超过 100MB
  AND (data_length + index_length) > 0
ORDER BY data_free DESC;

-- 重建碎片率高的表
ALTER TABLE table_name ENGINE=InnoDB;
```

**4. 配置日志轮转**

在操作系统层面配置 logrotate，定期轮转慢查询日志和错误日志：

```bash
# /etc/logrotate.d/tdsql
/data/tdsql/log/slow.log
/data/tdsql/log/error.log
{
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 mysql mysql
    postrotate
        /usr/bin/mysql -e 'FLUSH LOGS;'
    endscript
}
```

**5. 设置磁盘告警**

在腾讯云监控中配置磁盘使用率告警：

- 警告阈值：磁盘使用率 > 80%
- 严重阈值：磁盘使用率 > 90%
- 紧急阈值：磁盘使用率 > 95%

---

## 26.7 综合故障处理流程

当 TDSQL 出现故障时，建议按照以下标准化流程进行排查和处理：

```
┌─────────────────────────────────────────────────────────┐
│                   故障告警触发                            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 第一步：确认影响范围                                     │
│  ├─ 哪些业务或接口受影响？                               │
│  ├─ 影响时间多长？                                       │
│  ├─ 是否只读 / 完全不可用 / 部分功能异常？               │
│  └─ 影响用户量级？                                       │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 第二步：查看监控面板                                     │
│  ├─ CPU / 内存 / 磁盘 / 连接数                           │
│  ├─ QPS / TPS / 响应延迟                                 │
│  ├─ 复制延迟（Seconds_Behind_Master）                     │
│  ├─ 各分片负载是否均衡                                   │
│  └─ 网关节点状态                                         │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 第三步：快速止血（15 分钟内完成）                         │
│  ├─ 连接耗尽 → 临时调大 max_connections / 杀空闲连接     │
│  ├─ CPU 飙升 → 杀慢查询 / 限流 / 临时扩容                │
│  ├─ 磁盘满 → 清理 binlog / 扩容磁盘                      │
│  ├─ 复制延迟 → 暂停从库查询 / 跳过错误                   │
│  └─ 记录止血操作和时间点                                  │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 第四步：根因定位（止血后进行）                             │
│  ├─ 分析慢查询日志（使用 26.4.4 节的 Python 脚本）        │
│  ├─ 检查应用侧连接池配置                                  │
│  ├─ 检查分片键使用是否合理                                │
│  ├─ 检查大事务和长事务                                    │
│  ├─ 检查数据倾斜情况                                      │
│  └─ 检查网络和硬件层面                                    │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 第五步：长期修复                                         │
│  ├─ 优化 SQL / 索引                                      │
│  ├─ 调整连接池配置                                        │
│  ├─ 扩容 / 拆分 / 增加只读实例                            │
│  ├─ 配置合理的告警阈值                                    │
│  └─ 建立容量规划机制                                      │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 第六步：复盘与文档化                                     │
│  ├─ 记录故障时间线（什么时间发生了什么、做了什么）         │
│  ├─ 根因分析（5 Whys 方法）                               │
│  ├─ 改进措施（技术 + 流程）                               │
│  ├─ 更新监控告警和应急预案                                │
│  └─ 更新故障知识库                                        │
└─────────────────────────────────────────────────────────┘
```

### 故障复盘模板

每次故障后，建议按以下模板进行复盘：

```
## 故障复盘报告

### 基本信息
- 故障编号：INC-2026-06-28-001
- 故障等级：P0/P1/P2
- 发现时间：2026-06-28 14:30:00
- 恢复时间：2026-06-28 15:15:00
- 故障时长：45 分钟
- 值班人：张三

### 影响范围
- 受影响业务：订单服务、支付服务
- 影响用户数：约 10 万
- 影响指标：订单创建成功率从 99.9% 降至 85%

### 故障时间线
| 时间 | 事件 | 操作人 |
|------|------|--------|
| 14:30 | 告警：数据库 CPU 100% | 监控系统 |
| 14:32 | 确认影响范围，通知相关方 | 张三 |
| 14:35 | 定位到慢查询：SELECT * FROM orders WHERE status='PENDING' | 张三 |
| 14:38 | 添加索引：CREATE INDEX idx_status ON orders(status) | 张三 |
| 14:42 | CPU 恢复正常 | 监控系统 |
| 14:45 | 分析根因：该查询缺少索引，上线新功能后流量增加导致 | 张三 |
| 15:15 | 复盘会议 | 全体 |

### 根因分析（5 Whys）
1. 为什么 CPU 飙升？→ 因为大量慢查询
2. 为什么有慢查询？→ 因为 status 列没有索引
3. 为什么没有索引？→ 因为上线新功能时未 review SQL
4. 为什么未 review？→ 因为发布流程中缺少 SQL review 环节
5. 为什么缺少该环节？→ 因为 DBA 未参与发布评审

### 改进措施
1. 短期：为 status 列添加索引（已完成）
2. 中期：在发布流程中增加 SQL review 环节
3. 长期：建立慢查询自动告警机制，当慢查询数超过阈值时自动通知

### 监控改进
- 新增告警：每分钟慢查询数 > 100
- 新增告警：CPU 使用率 > 80% 持续 5 分钟
```

---

## 26.8 常用诊断命令速查表

| 诊断目标 | 命令 |
|----------|------|
| 查看连接数 | `SHOW GLOBAL STATUS LIKE 'Threads_connected';` |
| 查看最大连接数 | `SHOW VARIABLES LIKE 'max_connections';` |
| 查看活跃查询 | `SELECT * FROM information_schema.processlist WHERE command != 'Sleep';` |
| 按 IP 聚合连接 | `SELECT SUBSTRING_INDEX(host,':',1) AS ip, COUNT(*) FROM information_schema.processlist GROUP BY ip ORDER BY COUNT(*) DESC;` |
| 查看慢查询配置 | `SHOW VARIABLES LIKE 'slow_query%';` |
| 查看慢查询数量 | `SHOW GLOBAL STATUS LIKE 'Slow_queries';` |
| 查看执行计划 | `EXPLAIN SELECT ...\G` |
| 查看索引 | `SHOW INDEX FROM table_name;` |
| 查看复制状态 | `SHOW SLAVE STATUS\G` |
| 查看大表 | `SELECT table_schema, table_name, ROUND((data_length+index_length)/1024/1024/1024,2) AS size_gb FROM information_schema.tables ORDER BY size_gb DESC LIMIT 10;` |
| 查看碎片 | `SELECT table_schema, table_name, ROUND(data_free/1024/1024,2) AS frag_mb FROM information_schema.tables WHERE data_free > 1048576 ORDER BY frag_mb DESC;` |
| 查看 binlog | `SHOW BINARY LOGS;` |
| 清理 binlog | `PURGE BINARY LOGS BEFORE NOW() - INTERVAL 3 DAY;` |
| 查看 InnoDB 状态 | `SHOW ENGINE INNODB STATUS\G` |
| 查看锁等待 | `SELECT * FROM sys.innodb_lock_waits;` |
| 查看长事务 | `SELECT * FROM information_schema.innodb_trx ORDER BY trx_started;` |
| 查看 buffer pool 命中率 | `SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read%';` |
| 查看表结构 | `SHOW CREATE TABLE table_name;` |
| 查看 TDSQL 分片信息 | `SHOW TABLE STATUS;`（TDSQL 扩展） |
| 查看当前用户 | `SELECT USER(), CURRENT_USER();` |
| 查看数据库版本 | `SELECT VERSION();` |

---

## 26.9 告警配置建议

在腾讯云监控中配置以下告警项，可以在故障发生前提前预警：

| 告警项 | 阈值 | 严重级别 | 说明 |
|--------|------|----------|------|
| 连接使用率 | > 80% | Warning | 提前扩容或排查连接泄漏 |
| 连接使用率 | > 95% | Critical | 紧急处理，可能无法建立新连接 |
| CPU 使用率 | > 80% 持续 5 分钟 | Warning | 检查慢查询或扩容 |
| CPU 使用率 | > 95% 持续 2 分钟 | Critical | 紧急处理，业务可能受损 |
| 磁盘使用率 | > 85% | Warning | 计划扩容或清理 |
| 磁盘使用率 | > 95% | Critical | 紧急处理，可能无法写入 |
| 复制延迟 | > 10 秒 | Warning | 检查大事务或从库负载 |
| 复制延迟 | > 60 秒 | Critical | 紧急处理，数据一致性风险 |
| 慢查询数量 | > 100/分钟 | Warning | 分析慢查询日志 |
| 慢查询数量 | > 500/分钟 | Critical | 紧急处理，系统可能过载 |
| QPS 突增 | 变化 > 100% | Warning | 检查业务流量是否异常 |
| QPS 突降 | 变化 > 50% | Critical | 可能数据库不可用 |
| IOPS 使用率 | > 80% | Warning | 检查 IO 密集型查询 |
| 内存使用率 | > 90% | Warning | 检查 buffer pool 配置 |

---

## 26.10 总结

TDSQL 故障排查的核心思路是：**先止血、再定位、后根治**。本章覆盖了 TDSQL 最常见的五大类故障场景——连接耗尽、CPU 飙升、慢查询分析、主从复制延迟、磁盘空间满——每个场景都按照"现象→根因→排查→修复"的结构展开，并提供了可直接落地的命令、脚本和配置示例。

在实际运维中，建议 SRE 团队做好以下工作：

**1. 建立基线**

记录业务低峰期和高峰期的连接数、QPS、响应时间、CPU 使用率、磁盘使用率等指标。基线数据是异常检测的基础——没有基线，就无法判断当前指标是否异常。

**2. 定期巡检**

建议每周执行一次以下巡检任务：

- 慢查询分析（使用 26.4.4 节的 Python 脚本）
- 大表检查（Top 10 大表）
- 碎片检查（碎片率 > 30% 的表）
- 复制延迟检查
- 连接数趋势分析

**3. 容量规划**

根据业务增长曲线，提前 1~3 个月规划扩容。容量规划的核心指标：

- 磁盘增长速率（GB/天）
- QPS 增长速率
- 数据量增长速率
- 连接数增长趋势

**4. 演练验证**

每季度进行一次故障演练，验证应急预案的有效性。建议演练场景：

- 模拟数据节点宕机，验证自动切换
- 模拟磁盘满，验证清理流程
- 模拟慢查询打满 CPU，验证限流和杀查询流程
- 模拟网络分区，验证复制恢复

**5. 文档沉淀**

每次故障后更新故障知识库，沉淀排查经验。建议建立以下文档：

- 故障复盘报告（按 26.7 节的模板）
- 应急预案（按故障类型分类）
- 常用命令速查表
- 值班交接手册

TDSQL 的分布式架构虽然增加了排查复杂度，但只要掌握了正确的排查方法和工具链，大多数故障都可以在 15 分钟内完成定位和止血。本章提供的 Python 慢查询分析脚本和诊断命令速查表，可以作为日常运维工具箱中的常备武器。

最后，记住故障排查的三条黄金法则：

1. **不要慌**：按照标准化流程一步步排查，不要跳跃式操作
2. **先止血**：先恢复业务，再找根因，不要为了找根因而延长故障时间
3. **记录一切**：记录每个操作的时间点和结果，复盘时这些信息至关重要
