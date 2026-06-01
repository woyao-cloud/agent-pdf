# 精通PostgreSQL（Java版）- 设计文档

## 元信息

- **书名**: 精通PostgreSQL（Java版）
- **副标题**: 场景·原理·实战·优化
- **目标读者**: Java后端工程师、全栈开发者、架构师、DBA
- **内容定位**: 全栈进阶指南，覆盖开发+运维+架构，场景驱动
- **风格参考**: 与《精通Kafka（Java版）》保持一致

## 整体结构

```
精通PostgreSQL（Java版）
├── 基础篇：PostgreSQL基础（4章）
│   ├── 第1章 PostgreSQL概述与优势
│   ├── 第2章 架构与进程模型
│   ├── 第3章 事务与MVCC
│   └── 第4章 WAL与持久化
├── 场景篇：15大核心场景（15章）
│   ├── 第5章 高效CRUD与批量操作
│   ├── 第6章 复杂查询与CTE
│   ├── 第7章 索引策略与优化
│   ├── 第8章 全文搜索
│   ├── 第9章 JSON/NoSQL混合
│   ├── 第10章 地理空间（PostGIS）
│   ├── 第11章 时序数据
│   ├── 第12章 分区表
│   ├── 第13章 触发器与事件
│   ├── 第14章 物化视图
│   ├── 第15章 外部数据包装器（FDW）
│   ├── 第16章 逻辑复制
│   ├── 第17章 连接池与并发控制
│   ├── 第18章 备份恢复与PITR
│   └── 第19章 高可用架构
├── 进阶篇：风险与优化（4章）
│   ├── 第20章 性能优化
│   ├── 第21章 数据一致性与锁
│   ├── 第22章 安全机制
│   └── 第23章 监控与诊断
└── 技能篇：开发者必备（3章）
    ├── 第24章 开发者核心技能
    ├── 第25章 典型问题诊断
    └── 第26章 架构设计进阶
```

## 每章内容模板

每章按以下结构编写：

```
## X.X 章节标题

### 场景描述 / 解决的问题
- 真实业务故事引入
- 核心价值一句话总结

### 实现原理
- 核心原理讲解
- 配ASCII架构图
- 关键算法/机制分析

### 代码实现
- Java代码示例（Spring Boot/Spring Data JPA/原生JDBC）
- SQL示例
- Docker Compose环境

### 使用场景
- 适用场景分析
- 与MySQL的对比（如适用）
- 典型业务案例

### 潜在风险与问题
- 性能问题分析
- 常见错误与坑
- 事务/并发问题

### 优化策略
- 使用注意事项
- 性能优化技巧
- 替代方案

### 典型问题处理
- 面试常见问题
- 工程实践问题
```

## 各章详细内容

### 第1篇：基础篇

**第1章 PostgreSQL概述与优势**
- PostgreSQL发展史（UC Berkeley Ingres → Postgres95 → PostgreSQL）
- 与MySQL的20+维度对比（ACID实现、扩展性、SQL标准兼容性、并发控制、复制、GIS支持、NoSQL能力等）
- 核心优势深度解析：MVCC实现差异、扩展生态、SQL标准兼容性、可靠性
- 版本演进关键里程碑
- 谁在使用PostgreSQL（Instacart、Uber、Reddit、Apple等的PG实践）

**第2章 架构与进程模型**
- 进程架构图：Postmaster（主进程）、WAL Writer、Checkpointer、BgWriter、AutoVacuum、WalReceiver、WalSender等
- 内存结构：shared_buffers、wal_buffers、work_mem、maintenance_work_mem、effective_cache_size
- 数据文件布局：base/、global/、pg_wal/、pg_xact/、pg_stat/等目录功能
- 物理存储格式：堆表文件（OID）、FSM（空闲空间映射）、VM（可见性映射）
- Docker Compose环境：PG 16 + pgAdmin 4

**第3章 事务与MVCC**
- 事务ID（xid）与事务快照（SnapshotData）
- 元组头信息：xmin、xmax、cmin、cmax、t_ctid
- 可见性规则公式（HeapTupleSatisfiesMVCC）
- 四种事务隔离级别的实现（读已提交 vs 可重复读的差异）
- 与InnoDB的MVCC核心差异：垃圾版本处理方式（VACUUM vs purge）、回滚段、间隙锁
- 事务ID回卷问题与冻结机制
- Docker Compose：隔离级别行为测试

**第4章 WAL与持久化**
- WAL写入流程：事务提交 → WAL缓冲区 → WAL段文件（16MB）
- LSN（日志序列号）的作用
- 检查点机制：checkpoint_completion_target、checkpoint_timeout
- Full Page Writes的成因与性能影响
- 归档模式配置（archive_mode、archive_command）
- 故障恢复过程（REDO）

### 第2篇：场景篇

**第5章 高效CRUD与批量操作**
- 场景：电商订单批量导入从30分钟优化到30秒
- COPY协议（比INSERT快10倍的原因）
- UPSERT（INSERT ON CONFLICT DO UPDATE/NOTHING）
- RETURNING子句
- 批量插入的事务拆分策略
- Java示例：Spring Data JPA批量操作 + JDBC Batch
- Docker Compose：PG + 批量导入测试数据
- 风险：大量索引维护开销、死元组膨胀

**第6章 复杂查询与CTE**
- 场景：一条SQL查出组织树/环比增长率/GMV分组汇总
- 递归CTE（WITH RECURSIVE）：树形查询、图遍历
- 窗口函数：ROW_NUMBER/RANK/DENSE_RANK/LAG/LEAD/FIRST_VALUE/NTILE
- GROUPING SETS/CUBE/ROLLUP
- 物化CTE（MATERIALIZED）与非物化CTE
- Java示例：JPA Native Query + 窗口函数实现排行榜
- 风险：递归CTE死循环、窗口函数内存消耗

**第7章 索引策略与优化**
- 场景：查询从3秒到3ms的优化全过程
- 索引类型：B-tree（默认，适合范围/等值）、GiST（适合全文/GIS/范围）、GIN（适合包含/全文搜索/JSON）、BRIN（适合时序/顺序数据）、SP-GiST（适合空间划分/前缀搜索）、Hash（仅等值）
- B-tree索引内部结构：页面分裂、索引扫描类型（Index Scan/Index Only Scan/Bitmap Scan）
- 部分索引（CREATE INDEX ... WHERE condition）
- 覆盖索引（INCLUDE列）
- 索引失效场景分析
- Java示例：Spring Data JPA @Index注解 + 原生索引DDL
- Docker Compose：带测试数据的索引验证环境
- 风险：过多索引影响写入性能、索引膨胀

**第8章 全文搜索**
- 场景：搭建商品搜索系统（替代ES的轻量方案）
- tsvector/tsquery数据类型
- GIN索引加速全文搜索
- 中文分词方案（zhparser/SCWS/jieba for PG）
- 搜索排名：ts_rank/ts_rank_cd
- 高亮显示：ts_headline
- Java示例：Spring Data + 全文搜索查询
- Docker Compose：PG + zhparser + 商品数据
- 风险：中文分词质量、大数据量下不如ES

**第9章 JSON/NoSQL混合**
- 场景：用户扩展字段灵活Schema设计
- JSONB数据类型优势（vs JSON）
- 索引JSON字段：GIN (jsonb_path_ops)
- JSON操作符：@>、?、||、->>、#>>、jsonb_path_query
- JSONB与关系表的设计选择
- Java示例：Jackson + JSONB、JPA AttributeConverter
- 风险：JSONB缺乏外键约束、查询性能不如规范化表

**第10章 地理空间（PostGIS）**
- 场景：附近的人/外卖配送范围/轨迹回放
- 空间数据类型：GEOMETRY/GEOGRAPHY
- GiST索引加速空间查询
- 核心函数：ST_DWithin/ST_Distance/ST_Area/ST_Buffer/ST_AsGeoJSON
- 坐标系：WGS84（GPS）vs 投影坐标系
- Java示例：Spring Data + PostGIS、Hibernate Spatial
- Docker Compose：PG + PostGIS扩展 + 地点数据
- 风险：坐标系混淆导致的距离计算错误

**第11章 时序数据**
- 场景：IoT设备每秒百万数据点写入
- 分区表 + BRIN索引的时序最佳实践
- 连续聚合与downsampling
- 数据保留策略（自动删除过期分区）
- 与专业时序库（TimescaleDB/InfluxDB）的对比
- Java示例：JDBC批量写入 + 分区管理
- Docker Compose：PG + 模拟时序数据发生器
- 风险：分区过多导致元数据膨胀

**第12章 分区表**
- 场景：日增100万订单的分区管理
- 声明式分区（DECLARATIVE PARTITIONING）vs 继承式分区
- 分区裁剪（Constraint Exclusion/Partition Pruning）
- 分区管理：ATTACH/DETACH分区、自动创建分区
- Java示例：分区读写策略、分区路由
- 风险：分区键选择不当导致查询不裁剪、跨分区更新限制

**第13章 触发器与事件**
- 场景：数据变更自动同步到Redis/ES
- 行级触发器（FOR EACH ROW）vs 语句级触发器（FOR EACH STATEMENT）
- 触发器时机：BEFORE/AFTER/INSTEAD OF
- 事件触发器（DDL触发器）
- LISTEN/NOTIFY异步通道
- Java示例：pgjdbc-ng + LISTEN、Spring Event + 触发器
- 风险：触发器过多导致性能下降、错误处理复杂

**第14章 物化视图**
- 场景：大屏报表从5秒到50ms
- 物化视图原理：快照存储
- CONCURRENTLY刷新（避免锁表）
- REFRESH策略选择
- Java示例：定时刷新调度（Spring @Scheduled）
- 风险：数据陈旧、刷新期间资源消耗

**第15章 外部数据包装器（FDW）**
- 场景：跨库查询MySQL+PG+CSV统一入口
- postgres_fdw：跨PG库查询
- mysql_fdw/file_fdw：异构数据源
- IMPORT FOREIGN SCHEMA
- 下推优化（pushdown）
- Java示例：跨库查询封装
- Docker Compose：PG + MySQL + FDW
- 风险：跨库查询性能、数据类型映射差异

**第16章 逻辑复制**
- 场景：数据库实时同步到另一个PG集群
- 发布/订阅模型
- 冲突处理策略
- DDL同步限制
- pgoutput插件
- 逻辑复制 vs 流复制
- Java示例：复制状态监控
- Docker Compose：双PG + 逻辑复制配置
- 风险：DDL不同步、大事务导致延迟

**第17章 连接池与并发控制**
- 场景：2000个连接把PG打死了怎么办
- PgBouncer三种模式：事务级/语句级/会话级
- PgBouncer vs Pgpool-II vs 应用连接池（HikariCP）
- 连接风暴预防机制
- 连接池大小公式：2*CPU+磁盘数
- Java示例：HikariCP配置详解
- Docker Compose：PG + PgBouncer
- 风险：连接泄漏、事务级连接池的临时表问题

**第18章 备份恢复与PITR**
- 场景：误删表后的紧急恢复
- pg_dump/pg_restore逻辑备份
- pg_basebackup物理备份
- 连续归档 + PITR时间点恢复
- 备份验证策略
- Docker Compose：PG + 定时备份脚本
- 风险：备份文件损坏、PITR的WAL连续性要求

**第19章 高可用架构**
- 场景：生产环境零宕机升级方案
- 流复制同步/异步模式
- Patroni + etcd自动主从切换
- HAProxy/Keepalived负载均衡
- 脑裂防护
- Java示例：连接故障切换配置
- Docker Compose：3节点PG + Patroni + etcd + HAProxy
- 风险：异步复制数据丢失窗口、同步复制性能下降

### 第3篇：进阶篇

**第20章 性能优化**
- 查询计划解读：EXPLAIN ANALYZE详解、节点类型（Seq Scan/Index Scan/Nested Loop/Hash Join/Merge Join）
- 参数调优：shared_buffers/wal_buffers/effective_cache_size/work_mem/maintenance_work_mem
- VACUUM管理：autovacuum调优、vacuum freeze、膨胀监控
- 存储IO优化：表空间、SSD调整、RAID策略
- 并行查询配置
- 配真实查询计划解析案例

**第21章 锁与一致性**
- 锁类型：表锁（ACCESS SHARE/ROW EXCLUSIVE等8种）、行锁（FOR UPDATE/FOR NO KEY UPDATE）、咨询锁
- 锁等待与阻塞链定位
- 死锁检测与处理
- 可序列化快照隔离（SSI）原理
- 配锁监控SQL脚本

**第22章 安全机制**
- SSL连接加密配置
- 行级安全策略（RLS）
- 审计日志（pgaudit扩展）
- SCRAM-SHA-256密码认证
- 最小权限原则实践

**第23章 监控与诊断**
- pg_stat_statements慢查询跟踪
- pgBadger日志分析
- Prometheus + postgres_exporter集成
- pg_stat_activity/pg_stat_user_tables等关键视图

### 第4篇：技能篇

**第24章 开发者核心技能**
- psql高级技巧
- Spring Data JPA/Spring JDBC集成配置模板
- Flyway/Liquibase版本管理
- Extension管理
- PG类型系统：数组/枚举/区间/自定义类型

**第25章 典型问题诊断**
- 决策树流程图：慢查询排查、连接数爆满、锁等待定位、VACUUM异常、XID回卷预防、膨胀处理

**第26章 架构设计进阶**
- MySQL迁移PG最佳实践
- 分库分表 vs 原生分区选择
- PG vs 分布式数据库（TiDB/CockroachDB）选型
- OLTP+OLAP混合负载方案

## 输出格式

- 目录文件: `docs/postgresql/README.md`
- 各章内容: `docs/postgresql/chapter-XX-xxx.md`
- Docker Compose: `docs/postgresql/docker/<scenario>/`
- 代码示例: `docs/postgresql/code/`
- 格式: Markdown