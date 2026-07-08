# 第13章：分库分表落地实施

> 当单表数据量超过千万级别，即使索引优化到极致，查询性能也会遇到瓶颈。这时候需要"分库分表"——把数据分散到多个数据库或多张表中。但分库分表是一把双刃剑，用不好会引入更多问题。

---

## 📖 本章导读

### 一个真实的故事

小孙在一家快速增长的电商公司负责后端。他们的订单表已经超过5000万行，即使索引优化到极致，`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20` 也需要2秒。

他尝试了各种优化：加联合索引、查询重写、调整配置参数……但效果都不理想。因为问题不在SQL本身，而在于**单表的物理限制**——5000万行数据，B+Tree的深度已经达到4-5层，每次查询需要4-5次磁盘IO。即使每次IO只需要10毫秒，4-5次就是40-50毫秒——这已经是最优情况了。

最终他决定分库分表：按`user_id`取模，将订单数据分散到4个数据库中。每个库只有1250万行，B+Tree深度降到3层，查询从2秒降到了50毫秒。

但分库分表也带来了新的问题：以前`SELECT COUNT(*) FROM orders WHERE status = 'pending'`只需要查一个库，现在需要查4个库然后汇总。以前订单表和用户表可以直接JOIN，现在它们可能在不同的数据库实例中。

**分库分表是单表性能瓶颈的终极解决方案——但也是一把双刃剑。** 用好了，性能提升10倍以上；用不好，系统复杂度增加10倍，bug也增加10倍。

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **判断什么时候需要分库分表** — 不是所有慢查询都需要分库分表。90%的性能问题可以通过前12章的优化技巧解决，只有10%需要分库分表。
2. **选择合适的分片策略** — Range分片、Hash取模、一致性Hash。每种策略有自己的适用场景和局限性。
3. **选择合适的分片键** — 分片键的选择决定了查询是否需要跨分片。选错了分片键，大部分查询都会变成跨分片查询。
4. **使用ShardingSphere落地分片** — 从配置到代码的完整方案。ShardingSphere让你像操作单表一样操作分片表。
5. **处理分片后的新问题** — 跨分片查询、分布式事务、全局ID生成、数据迁移。

---

## 🧠 核心概念详解

### 什么时候需要分库分表？

很多开发人员一遇到慢查询就想到分库分表，但分库分表应该是**最后的选择**，而不是第一选择。在考虑分库分表之前，你应该已经尝试了：

1. 优化SQL和索引（第2-4章）
2. 优化JOIN和子查询（第5-6章）
3. 优化排序和分页（第7-8章）
4. 优化表结构（第10章）
5. 调整配置参数（第11章）

只有当以上优化都做了，查询仍然慢，且满足以下条件时，才考虑分库分表：

| 指标 | 阈值 | 说明 |
|------|------|------|
| 单表行数 | > 2000万 | B+Tree深度过大，IO次数增加。2000万行时B+Tree深度约3-4层，每次查询需要3-4次IO |
| 单表数据量 | > 10GB | 备份恢复慢，DDL操作（如加索引）可能需要几小时 |
| 单库QPS | > 2000 | 单库连接数不够用，CPU成为瓶颈 |
| 单库TPS | > 500 | 写入瓶颈，磁盘IO成为瓶颈 |

### 垂直分库 vs 水平分表

**垂直分库**是按业务模块拆分数据库。比如把用户相关的表放在用户库，订单相关的表放在订单库，商品相关的表放在商品库。

```
垂直分库（按业务拆分）：
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  用户库      │  │  订单库      │  │  商品库      │
│  users      │  │  orders     │  │  products   │
│  addresses  │  │  order_items│  │  categories │
└─────────────┘  └─────────────┘  └─────────────┘
```

垂直分库的优点是：每个库只负责一个业务模块，业务清晰，互不影响。缺点是：跨库JOIN变得困难——如果订单表在订单库，用户表在用户库，`SELECT * FROM orders JOIN users ON ...`就无法直接执行了。

**水平分表**是按数据行拆分。比如订单表有5000万行，按`user_id % 4`分散到4个数据库中，每个库1250万行。

```
水平分表（按数据行拆分）：
┌──────────────────┐  ┌──────────────────┐
│  订单库0          │  │  订单库1          │
│  orders (id%2=0) │  │  orders (id%2=1) │
└──────────────────┘  └──────────────────┘
```

水平分表的优点是：每个库的数据量减少，查询变快。缺点是：跨分片查询需要聚合多个库的结果。

### 分片算法对比

**Range分片**：按范围划分，比如user_id 1-1000万在库0，1000万-2000万在库1。

- 优点：扩容简单——新增一个库，把新范围的数据放进去即可
- 缺点：热点数据集中——如果新用户更活跃，新库的压力会远大于旧库

**Hash取模**：`user_id % N`，N是分片数。

- 优点：数据均匀分布，不会出现热点
- 缺点：扩容需要重新分布——从4个库扩到8个库，所有数据都需要重新计算分片位置

**一致性Hash**：将分片节点映射到Hash环上，数据落在环上顺时针最近的节点。

- 优点：扩容时只需要迁移部分数据（约1/N）
- 缺点：实现复杂，可能出现数据倾斜

**💡 类比**：Range分片就像图书馆按"出版年份"分馆——2020年之前的书在A馆，2020年之后在B馆。Hash取模就像按"书名的拼音首字母"分馆——A-M在A馆，N-Z在B馆。一致性Hash就像动态调整分馆规则——新增一个馆时，只需要从相邻的馆搬一部分书过来。

### 分片键选择原则

分片键是分库分表中最关键的决策。选错了分片键，大部分查询都会变成跨分片查询。

**好的分片键**：
- ✅ 查询条件中经常出现（如`user_id`）——这样大部分查询只需要访问一个分片
- ✅ 数据分布均匀——不会导致某个分片数据特别多（热点分片）
- ✅ 值不会频繁变更——如果分片键的值变了，数据需要迁移到新的分片

**坏的分片键**：
- ❌ 查询条件中很少出现——导致大部分查询需要跨分片
- ❌ 数据分布不均匀——比如按"省份"分片，北京的用户远多于西藏
- ❌ 值频繁变更——比如按"状态"分片，订单状态从pending变为completed时需要迁移数据

### 分片后引入的新问题

分库分表不是"免费的午餐"，它会引入一系列新问题：

**跨分片查询**：`SELECT COUNT(*) FROM orders WHERE status = 'pending'`需要查所有分片然后汇总。解决方案：避免此类查询（用ES同步做统计），或使用广播表存储汇总数据。

**跨分片JOIN**：订单表按`user_id`分片，订单明细表按`order_id`分片——这两个表无法直接JOIN。解决方案：使用绑定表（让订单明细表和订单表使用相同的分片规则），或使用广播表。

**分布式事务**：一个业务操作可能涉及多个分片，需要分布式事务保证一致性。解决方案：ShardingSphere支持XA事务，或使用Seata等分布式事务框架，或设计最终一致性方案。

**全局ID**：分片后，每个分片的主键不能自增（会冲突）。解决方案：雪花算法（Snowflake）、号段模式、Redis自增。

**扩容**：从4个分片扩到8个分片，数据需要重新分布。解决方案：一致性Hash（减少迁移量）、双写方案（先双写新旧两套分片，再切换读）。

---

## 🛠️ 动手实践

### 架构说明

本示例使用 **ShardingSphere-Proxy** 作为分片中间件，配置2个MySQL分片。ShardingSphere-Proxy就像一个"代理"——应用连接它就像连接普通MySQL，它负责将SQL路由到正确的分片。

```
应用层（JDBC连接）
       │
       ▼
ShardingSphere-Proxy（端口3307）
       │
       ├──→ MySQL分片0（端口3318）：user_id % 2 == 0
       │
       └──→ MySQL分片1（端口3319）：user_id % 2 == 1
```

**分片规则**：
- `t_order`：按 `user_id % 2` 分片。user_id为偶数的订单在分片0，奇数的在分片1。
- `t_order_item`：按 `order_id % 2` 分片，与订单表绑定。这样订单和订单明细始终在同一个分片，可以直接JOIN。
- `t_config`：广播表。每个分片都有完整数据，适合存储配置信息。

### 第一步：启动

```bash
cd demos/13-sharding
docker compose up -d

# 等待所有服务启动（约30秒）
docker logs -f shardingsphere-proxy
# 看到 "ShardingSphere-Proxy started!" 说明启动完成
```

### 第二步：连接ShardingSphere-Proxy

```bash
docker exec -it shardingsphere-proxy mysql -h127.0.0.1 -P3307 -uroot -proot123
```

### 第三步：执行分片测试

在MySQL客户端中执行以下SQL，观察ShardingSphere如何自动路由：

```sql
USE sharding_db;

-- 插入测试数据
-- user_id=1（奇数）→ 分片1，user_id=2（偶数）→ 分片0
INSERT INTO t_order (user_id, product_name, amount, status) VALUES
(1, 'iPhone 15', 8999.00, 'completed'),
(1, 'AirPods Pro', 1899.00, 'pending'),
(2, 'MacBook Air', 10999.00, 'completed'),
(2, 'iPad Air', 5999.00, 'shipped');

-- 查询所有订单（ShardingSphere自动聚合两个分片的结果）
-- 执行预期：返回4条记录，来自两个分片
SELECT * FROM t_order ORDER BY user_id;

-- 按分片键查询（只路由到一个分片）
-- 执行预期：只查询分片1，返回user_id=1的2条记录
SELECT * FROM t_order WHERE user_id = 1;

-- 非分片键查询（需要查询所有分片）
-- 执行预期：查询两个分片，聚合结果
SELECT * FROM t_order WHERE status = 'completed';

-- 广播表查询（从任意分片读取）
SELECT * FROM t_config;
```

### 第四步：验证分片效果

```bash
# 直接连接分片0，查看数据
# 执行预期：只有user_id=2的订单（偶数）
docker exec -it mysql-shard0 mysql -uroot -proot123 order_db -e "SELECT * FROM t_order;"

# 直接连接分片1，查看数据
# 执行预期：只有user_id=1的订单（奇数）
docker exec -it mysql-shard1 mysql -uroot -proot123 order_db -e "SELECT * FROM t_order;"

# 广播表：两个分片都有完整数据
docker exec -it mysql-shard0 mysql -uroot -proot123 order_db -e "SELECT * FROM t_config;"
docker exec -it mysql-shard1 mysql -uroot -proot123 order_db -e "SELECT * FROM t_config;"
```

---

## ⚠️ 常见误区

### 误区1：过早分库分表

很多团队在单表只有几百万行时就开始分库分表，结果系统复杂度大幅增加，但性能提升微乎其微。记住：**先优化，再分片。** 90%的性能问题可以通过前12章的优化技巧解决。

### 误区2：分片键选择不当

用`status`作为分片键，导致查询`WHERE user_id = ?`需要跨分片——这是最常见的分片键选择错误。分片键应该选择**查询条件中最常出现的字段**，通常是`user_id`或`order_id`。

### 误区3：忘记处理跨分片查询

分片后，`SELECT COUNT(*) FROM t_order WHERE status = 'pending'`需要查所有分片。如果这种查询很频繁，性能反而会下降。解决方案：用ES同步数据做统计查询，或使用广播表。

### 误区4：忽略分布式事务

分片后，一个业务操作可能涉及多个分片。比如"创建订单+扣减库存"，订单在分片0，库存可能在分片1——需要分布式事务保证一致性。ShardingSphere支持XA事务，但性能有损耗。更好的方案是设计最终一致性。

---

## 💭 思考题

1. 如果订单表按`user_id`分片，但有一个需求是"按创建时间查询最近7天的所有订单"，应该怎么处理？
2. 一致性Hash和Hash取模有什么区别？从4个分片扩到8个分片，两种方案各需要迁移多少数据？
3. 雪花算法生成的ID为什么是全局唯一的？它的64位分别代表什么？

---

## 📚 扩展阅读

- [ShardingSphere官方文档](https://shardingsphere.apache.org/document/current/cn/overview/) — 分片中间件完整指南
- [MySQL分库分表最佳实践](https://shardingsphere.apache.org/blog/cn/material/) — 官方博客
- [雪花算法详解](https://github.com/twitter-archive/snowflake) — Twitter Snowflake

---

## 🏃 运行命令速查

```bash
# 启动
docker compose up -d

# 连接ShardingSphere-Proxy
docker exec -it shardingsphere-proxy mysql -h127.0.0.1 -P3307 -uroot -proot123

# 查看分片0数据
docker exec -it mysql-shard0 mysql -uroot -proot123 order_db -e "SELECT * FROM t_order;"

# 查看分片1数据
docker exec -it mysql-shard1 mysql -uroot -proot123 order_db -e "SELECT * FROM t_order;"

# 停止
docker compose down -v
```
