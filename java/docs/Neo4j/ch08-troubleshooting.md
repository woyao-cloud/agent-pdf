# 第8章 Neo4j 故障排查指南

## 8.1 概述

Neo4j 作为业界领先的图数据库，在生产环境中可能遇到各类故障。本章系统性地梳理了最常见的六类问题——连接异常、查询超时、内存溢出（OOM）、磁盘写满、事务冲突以及集群故障——并为每类问题提供诊断命令、根因分析思路和可操作的解决方案。本章内容适用于 Neo4j 4.x 和 5.x 版本，部分命令在早期版本中可能有所差异。

---

## 8.2 连接问题

### 8.2.1 现象描述

客户端无法连接到 Neo4j 实例，常见错误包括：

- `Connection refused`：连接被拒绝
- `Connection timed out`：连接超时
- `No such host is known`：主机名无法解析
- `SSL handshake failed`：SSL 握手失败
- `Too many open connections`：连接数超限

### 8.2.2 诊断命令

```bash
# 1. 检查 Neo4j 进程是否存活
ps aux | grep neo4j

# 2. 检查端口监听状态（默认 Bolt: 7687, HTTP: 7474）
netstat -an | findstr "7687"
netstat -an | findstr "7474"

# 3. 使用 curl 测试 HTTP 端点
curl -v http://localhost:7474/

# 4. 使用 neo4j-admin 检查服务器状态
neo4j-admin server status

# 5. 查看连接相关日志
# Windows: %NEO4J_HOME%\logs\neo4j.log
# Linux: /var/log/neo4j/neo4j.log
grep -i "connection\|bind\|listen" logs/neo4j.log

# 6. 检查最大连接数配置
grep "dbms.connector.bolt.listen_address" conf/neo4j.conf
grep "dbms.connector.bolt.connection_max" conf/neo4j.conf
```

### 8.2.3 根因分析

| 原因 | 典型日志 | 触发场景 |
|------|----------|----------|
| 服务未启动 | `Neo4j not running` | 服务器重启后未自动拉起 |
| 端口被占用 | `Address already in use` | 端口被其他进程占用 |
| 防火墙拦截 | 客户端 `Connection timed out` | 安全组或防火墙未放行端口 |
| SSL 证书过期 | `SSL handshake failed` | 证书超过有效期 |
| 连接池耗尽 | `Too many open connections` | 客户端未正确关闭连接 |
| 配置绑定地址错误 | `WARNING: Failed to bind to 0.0.0.0` | `dbms.connectors.default_listen_address` 配置错误 |

### 8.2.4 解决方案

**方案一：确认服务状态并重启**

```bash
# 启动 Neo4j 服务
neo4j start

# 或注册为 Windows 服务
neo4j install-service
neo4j start-service

# 查看启动日志确认无报错
tail -100 logs/neo4j.log
```

**方案二：解决端口冲突**

```bash
# 查找占用端口的进程
netstat -ano | findstr "7687"
# 输出示例: TCP 0.0.0.0:7687 0.0.0.0:0 LISTENING 12345

# 终止占用进程（Windows）
taskkill /PID 12345 /F

# 或在 neo4j.conf 中修改端口
# dbms.connector.bolt.listen_address=:7688
```

**方案三：调整连接池配置**

```properties
# conf/neo4j.conf
# 增大最大连接数
dbms.connector.bolt.connection_max=1000

# 设置连接超时（毫秒）
dbms.connector.bolt.connection_timeout=30000

# 设置线程池大小
dbms.threads.worker_count=40
```

**方案四：SSL 证书更新**

```bash
# 检查证书过期时间
keytool -list -v -keystore certificates/neo4j.keystore -storepass neo4j

# 重新生成自签名证书（开发环境）
neo4j-admin server certificate --renew

# 生产环境应使用正式 CA 签发的证书
```

**方案五：客户端连接池最佳实践（Java）**

```java
// 使用 try-with-resources 确保连接关闭
try (Driver driver = GraphDatabase.driver(
        "bolt://localhost:7687",
        AuthTokens.basic("neo4j", "password"),
        Config.builder()
            .withMaxConnectionPoolSize(50)
            .withConnectionTimeout(30, TimeUnit.SECONDS)
            .build())) {
    try (Session session = driver.session()) {
        // 执行查询
    }
}
```

---

## 8.3 查询超时

### 8.3.1 现象描述

Cypher 查询执行时间超过预期或配置的阈值，表现为：

- `Query execution timed out`：查询超时异常
- `Transaction timeout`：事务超时
- 客户端 HTTP 504 Gateway Timeout
- APOC 或 GDS 算法长时间无响应

### 8.3.2 诊断命令

```bash
# 1. 查看当前正在运行的查询
CALL dbms.listQueries();

# 2. 查看查询执行计划（EXPLAIN）
EXPLAIN MATCH (n:Person)-[:KNOWS]->(m:Person) RETURN n, m;

# 3. 查看带成本的执行计划（PROFILE）
PROFILE MATCH (n:Person)-[:KNOWS]->(m:Person) RETURN n, m;

# 4. 检查索引使用情况
CALL db.indexes();

# 5. 检查 schema 统计信息
CALL db.schema.visualization();

# 6. 查看慢查询日志（需开启）
# conf/neo4j.conf 中配置：
# dbms.logs.query.enabled=true
# dbms.logs.query.threshold=1000  # 毫秒
```

### 8.3.3 Cypher 查询诊断

```cypher
// 列出所有运行中的查询及其详情
CALL dbms.listQueries() YIELD queryId, query, parameters, 
    elapsedTimeMillis, waitTimeMillis, status, resourceInformation
RETURN *;

// 终止特定查询
CALL dbms.killQuery("query-1234");

// 终止所有运行超过 5 分钟的查询
CALL dbms.listQueries() YIELD queryId, elapsedTimeMillis
WHERE elapsedTimeMillis > 300000
CALL dbms.killQuery(queryId)
RETURN count(*) AS killed;

// 查看查询的锁等待信息
CALL dbms.listQueries() YIELD queryId, query, resourceInformation
RETURN *;
```

### 8.3.4 根因分析

| 原因 | 特征 | 解决方案 |
|------|------|----------|
| 缺少索引 | `NodeByLabelScan` 或 `AllNodesScan` | 为过滤条件创建索引 |
| 索引选择性差 | 使用了索引但扫描了大量节点 | 创建复合索引或全文索引 |
| 笛卡尔积 | 查询计划中出现 `CartesianProduct` | 补全关联条件 |
| 深度遍历 | 可变长度路径未设上限 | 设置最大深度 `[*1..5]` |
| 大结果集 | 返回数百万行 | 使用分页 `SKIP` / `LIMIT` |
| Eager 操作 | 查询计划中出现 `Eager` | 拆分查询或优化模式 |

### 8.3.5 解决方案

**方案一：创建合适的索引**

```cypher
// 单属性索引
CREATE INDEX person_name_idx FOR (n:Person) ON (n.name);

// 复合索引（适用于多字段过滤）
CREATE INDEX person_name_age_idx FOR (n:Person) ON (n.name, n.age);

// 全文索引（适用于模糊搜索）
CREATE FULLTEXT INDEX person_fulltext FOR (n:Person) ON EACH [n.name, n.bio];

// 文本索引（适用于 STARTS WITH / CONTAINS）
CREATE TEXT INDEX person_name_text_idx FOR (n:Person) ON (n.name);

// 范围索引（适用于 > < >= <=）
CREATE RANGE INDEX person_age_idx FOR (n:Person) ON (n.age);

// 点索引（适用于精确匹配）
CREATE POINT INDEX person_location_idx FOR (n:Person) ON (n.location);
```

**方案二：优化查询模式**

```cypher
// 错误：未设上限的深度遍历（可能导致全图扫描）
MATCH (a:Person)-[:KNOWS*]->(b:Person)
RETURN b;

// 正确：设置合理的最大深度
MATCH (a:Person)-[:KNOWS*1..5]->(b:Person)
RETURN b;

// 错误：缺少关联条件的笛卡尔积
MATCH (a:Person), (b:Company)
WHERE a.companyId = b.id
RETURN a, b;

// 正确：显式关联
MATCH (a:Person)-[:WORKS_AT]->(b:Company)
RETURN a, b;

// 错误：返回大量结果集
MATCH (n:Person)
RETURN n;

// 正确：分页查询
MATCH (n:Person)
RETURN n
SKIP 0 LIMIT 100;
```

**方案三：配置查询超时**

```properties
# conf/neo4j.conf

# 全局查询超时（秒），0 表示不限制
dbms.transaction.timeout=300

# 单个查询超时（秒）
dbms.statement.timeout=60

# 事务日志保留超时
dbms.tx_log.rotation.retention_policy=7 days
```

**方案四：使用查询路由和读副本**

```cypher
// 将分析型查询路由到只读副本
:mode reader

// 将写操作路由到主节点
:mode writer
```

**方案五：APOC 超时控制**

```cypher
// 使用 APOC 的 timeout 过程包装查询
CALL apoc.util.timeout(
    5000,  // 超时时间（毫秒）
    'MATCH (n:Person)-[:KNOWS]->(m:Person) RETURN n, m'
);
```

---

## 8.4 内存溢出（OOM）

### 8.4.1 现象描述

Neo4j 进程因内存不足被操作系统 OOM Killer 终止，或 JVM 抛出 `OutOfMemoryError`。典型表现：

- 进程突然消失，无正常关闭日志
- `java.lang.OutOfMemoryError: Java heap space`
- `java.lang.OutOfMemoryError: GC overhead limit exceeded`
- 系统日志中出现 `Out of memory: Kill process`（Linux）
- 页面置换频繁，磁盘 I/O 飙升

### 8.4.2 诊断命令

```bash
# 1. 查看 JVM 堆内存配置
grep "heap" conf/neo4j.conf

# 2. 查看页面缓存配置
grep "pagecache" conf/neo4j.conf

# 3. 查看当前内存使用（Linux）
free -h
top -p $(pgrep -f neo4j)

# 4. 查看当前内存使用（Windows）
tasklist /FI "IMAGENAME eq java*" /V

# 5. 查看 GC 日志（需开启 GC 日志）
# 默认位置：logs/gc.log
grep "OutOfMemory\|Full GC\|Concurrent Mode Failure" logs/gc.log

# 6. 使用 neo4j-admin 检查内存设置建议
neo4j-admin server memory-recommendation

# 7. 查看堆转储（如果配置了 -XX:+HeapDumpOnOutOfMemoryError）
# 默认位置：数据目录下的 java_pid*.hprof
```

### 8.4.3 内存架构理解

Neo4j 的内存分为三个主要区域：

```
┌─────────────────────────────────────────────┐
│                  JVM 堆内存                    │
│  (heap)                                      │
│  用途：对象存储、查询执行、事务状态            │
│  配置：dbms.memory.heap.max_size              │
├─────────────────────────────────────────────┤
│                页面缓存                        │
│  (pagecache)                                  │
│  用途：缓存图数据文件，减少磁盘 I/O            │
│  配置：dbms.memory.pagecache.size             │
├─────────────────────────────────────────────┤
│              堆外内存（off-heap）               │
│  用途：网络缓冲区、事务日志、索引              │
│  配置：自动管理                                │
└─────────────────────────────────────────────┘
```

### 8.4.4 根因分析

| 原因 | 诊断指标 | 说明 |
|------|----------|------|
| 堆内存过小 | GC 频繁，`GC overhead limit exceeded` | 查询工作集大于堆内存 |
| 页面缓存不足 | 磁盘 I/O 高，`page fault` 频繁 | 热数据无法全部缓存 |
| 查询返回超大结果集 | 单次查询加载数百万对象到堆 | 缺少 `LIMIT` 或分页 |
| 未释放的堆外内存 | 内存持续增长但堆使用率正常 | 事务日志或网络缓冲区泄漏 |
| 并发事务过多 | 活跃事务数高，堆使用率持续高位 | 事务未及时提交或回滚 |
| 索引构建 | 创建索引时内存消耗激增 | 大图建索引需额外内存 |

### 8.4.5 解决方案

**方案一：合理配置内存**

```properties
# conf/neo4j.conf

# 堆内存：通常设为物理内存的 25%-50%，不超过 32GB
# 4GB 物理内存
dbms.memory.heap.initial_size=1G
dbms.memory.heap.max_size=2G

# 16GB 物理内存
# dbms.memory.heap.initial_size=4G
# dbms.memory.heap.max_size=8G

# 64GB 物理内存
# dbms.memory.heap.initial_size=16G
# dbms.memory.heap.max_size=32G

# 页面缓存：通常设为物理内存的 50%-75%
# 总内存 = 堆 + 页面缓存 + 系统预留（约 2GB）
# 16GB 物理内存：堆 8G + 页面缓存 6G + 系统 2G
dbms.memory.pagecache.size=6G
```

**方案二：启用堆转储和 GC 日志**

```properties
# conf/neo4j.conf

# JVM 额外参数
dbms.jvm.additional=-XX:+HeapDumpOnOutOfMemoryError
dbms.jvm.additional=-XX:HeapDumpPath=/var/log/neo4j/heapdump
dbms.jvm.additional=-XX:+PrintGCDetails
dbms.jvm.additional=-XX:+PrintGCDateStamps
dbms.jvm.additional=-Xloggc:/var/log/neo4j/gc.log
```

**方案三：优化查询减少内存压力**

```cypher
// 使用 LIMIT 限制结果集大小
MATCH (n:Person)
RETURN n
LIMIT 1000;

// 使用分页批量处理
MATCH (n:Person)
RETURN n
SKIP 0 LIMIT 1000;

// 使用 APOC 批量处理（适用于大规模更新）
CALL apoc.periodic.iterate(
    'MATCH (n:Person) RETURN n',
    'SET n.processed = true',
    {batchSize: 1000, parallel: false}
);

// 使用子查询减少中间结果
CALL {
    MATCH (n:Person)
    RETURN n
    LIMIT 1000
}
RETURN n;
```

**方案四：监控和告警**

```bash
# 使用 neo4j 监控端点
curl -u neo4j:password http://localhost:7474/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"CALL dbms.listQueries()"}]}'

# 使用 Prometheus + Grafana 监控（需安装 neo4j-exporter）
# neo4j-exporter 默认端口 2004
```

**方案五：操作系统级优化**

```bash
# Linux：禁用 OOM Killer 对 Neo4j 的误杀
# 编辑 /etc/security/limits.conf
neo4j soft nofile 65536
neo4j hard nofile 65536
neo4j soft nproc 32768
neo4j hard nproc 32768

# 设置 OOM 评分（值越低越不容易被杀）
echo -1000 > /proc/$(pgrep -f neo4j)/oom_score_adj

# 启用 swap 但降低 swappiness
sysctl vm.swappiness=1
```

---

## 8.5 磁盘写满

### 8.5.1 现象描述

Neo4j 数据目录所在磁盘空间耗尽，表现为：

- `No space left on device`：磁盘无剩余空间
- 数据库进入只读模式（强制）
- 事务无法提交
- 检查点（checkpoint）失败
- 日志中出现 `Disk full` 或 `Unable to allocate space`

### 8.5.2 诊断命令

```bash
# 1. 检查磁盘使用情况
# Windows
wmic logicaldisk get size,freespace,caption
# Linux
df -h

# 2. 检查 Neo4j 各目录大小
# Windows
du -sh "%NEO4J_HOME%\data\databases"
du -sh "%NEO4J_HOME%\data\transactions"
du -sh "%NEO4J_HOME%\logs"
# Linux
du -sh /var/lib/neo4j/data/databases/*
du -sh /var/lib/neo4j/data/transactions/*
du -sh /var/log/neo4j/*

# 3. 查看事务日志大小
ls -lh data/transactions/neo4j/

# 4. 查看数据库存储大小
CALL dbms.listConfig() YIELD name, value
WHERE name CONTAINS 'data' OR name CONTAINS 'store';

# 5. 查看数据库存储统计
CALL apoc.meta.stats();
```

### 8.5.3 磁盘空间构成

```
Neo4j 磁盘空间主要消耗在以下方面：

┌─────────────────────────────────────┬──────────────┐
│ 目录                                │ 典型占比      │
├─────────────────────────────────────┼──────────────┤
│ data/databases/                     │ 60-70%       │
│   ├── graph.db/store.db             │ 节点/关系存储 │
│   ├── graph.db/neostore.*           │ 属性存储      │
│   └── graph.db/schema/index/        │ 索引存储      │
├─────────────────────────────────────┼──────────────┤
│ data/transactions/                  │ 15-25%       │
│   └── neo4j/                        │ 事务日志      │
├─────────────────────────────────────┼──────────────┤
│ logs/                               │ 5-10%        │
│   ├── neo4j.log                     │ 运行日志      │
│   ├── gc.log                        │ GC 日志      │
│   ├── query.log                     │ 查询日志      │
│   └── security.log                  │ 安全日志      │
├─────────────────────────────────────┼──────────────┤
│ conf/ + plugins/ + certificates/    │ 1-5%         │
└─────────────────────────────────────┴──────────────┘
```

### 8.5.4 根因分析

| 原因 | 特征 | 说明 |
|------|------|------|
| 事务日志未清理 | `data/transactions/` 持续增长 | 备份或日志归档未正确配置 |
| 调试日志过多 | `logs/` 目录占用异常 | 日志级别设为 DEBUG 且未轮转 |
| 索引构建 | 创建索引时临时空间需求翻倍 | 索引构建需要额外 1-2 倍数据空间 |
| 数据增长 | 数据库自然增长超出预期 | 未规划磁盘容量或数据暴增 |
| 快照/备份残留 | 存在未清理的旧备份 | 备份策略未包含自动清理 |
| 查询日志过大 | `query.log` 达数 GB | 慢查询日志未设置轮转 |

### 8.5.5 解决方案

**方案一：紧急释放空间**

```bash
# 1. 轮转并压缩日志（安全，可立即执行）
# 手动触发日志轮转
neo4j-admin logs rotate

# 压缩旧日志
gzip logs/neo4j.log.1
gzip logs/gc.log.1

# 2. 清理超过 30 天的日志
find logs/ -name "*.log.*" -mtime +30 -delete

# 3. 强制检查点（减少事务日志）
CALL dbms.checkpoint();
```

**方案二：配置事务日志管理**

```properties
# conf/neo4j.conf

# 事务日志保留策略
# 按时间：保留最近 N 天的日志
dbms.tx_log.rotation.retention_policy=7 days

# 按大小：保留最近 N 个日志文件
# dbms.tx_log.rotation.retention_policy=10 files

# 按容量：保留不超过 N 大小
# dbms.tx_log.rotation.retention_policy=1G size

# 事务日志轮转大小
dbms.tx_log.rotation.size=256M
```

**方案三：配置日志轮转**

```properties
# conf/neo4j.conf

# 调试日志轮转
dbms.logs.debug.rotation.size=20M
dbms.logs.debug.rotation.keep_number=5

# 查询日志轮转
dbms.logs.query.rotation.size=20M
dbms.logs.query.rotation.keep_number=5

# HTTP 日志轮转
dbms.logs.http.rotation.size=20M
dbms.logs.http.rotation.keep_number=5

# GC 日志轮转（JVM 参数）
dbms.jvm.additional=-XX:+UseGCLogFileRotation
dbms.jvm.additional=-XX:NumberOfGCLogFiles=5
dbms.jvm.additional=-XX:GCLogFileSize=20M
```

**方案四：数据压缩和存储优化**

```cypher
// 1. 删除不需要的数据
MATCH (n:TempData)
DETACH DELETE n;

// 2. 清理孤立节点
MATCH (n)
WHERE size((n)--()) = 0
DETACH DELETE n;

// 3. 使用 APOC 压缩属性值
MATCH (n:Person)
SET n.bio = apoc.text.compress(n.bio);

// 4. 删除未使用的索引
DROP INDEX unused_index_name;
```

**方案五：存储迁移和扩容**

```bash
# 1. 将数据目录迁移到更大的磁盘
# 停止 Neo4j
neo4j stop

# 迁移数据
mv /var/lib/neo4j/data /data/neo4j_data
ln -s /data/neo4j_data /var/lib/neo4j/data

# 修改配置
# conf/neo4j.conf
# dbms.directories.data=/data/neo4j_data

# 启动 Neo4j
neo4j start

# 2. 将日志目录迁移到独立磁盘
# conf/neo4j.conf
# dbms.directories.logs=/data/logs/neo4j
```

**方案六：磁盘空间告警配置**

```bash
# Linux：使用 cron 定期检查
# */5 * * * * /usr/local/bin/neo4j_disk_check.sh

# neo4j_disk_check.sh 内容
#!/bin/bash
THRESHOLD=90
USAGE=$(df -h /var/lib/neo4j | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $USAGE -gt $THRESHOLD ]; then
    echo "WARNING: Neo4j disk usage at ${USAGE}%"
    # 发送告警（邮件、Slack、PagerDuty 等）
fi
```

---

## 8.6 事务冲突

### 8.6.1 现象描述

多个并发事务因读写同一数据而发生冲突，典型错误：

- `Transaction was terminated due to a timeout while acquiring a lock`
- `Unable to acquire a lock within the configured timeout`
- `Deadlock detected`
- `Transaction failure: can't acquire lock`
- 写操作频繁重试

### 8.6.2 诊断命令

```bash
# 1. 查看当前锁信息
CALL dbms.listTransactions();

# 2. 查看锁等待情况
CALL dbms.listQueries() YIELD queryId, query, 
    resourceInformation, elapsedTimeMillis
WHERE resourceInformation IS NOT NULL
RETURN *;

# 3. 查看事务日志
grep -i "lock\|deadlock\|conflict\|timeout" logs/neo4j.log

# 4. 检查锁超时配置
grep "lock" conf/neo4j.conf
```

### 8.6.3 Cypher 锁诊断

```cypher
// 查看所有活跃事务
CALL dbms.listTransactions() YIELD transactionId, 
    username, metaData, startTime, status, 
    currentQuery, awaitingLocks
RETURN *;

// 查看锁统计信息
CALL dbms.listTransactions() YIELD transactionId, awaitingLocks
WHERE awaitingLocks IS NOT NULL
RETURN transactionId, awaitingLocks;

// 终止阻塞的事务
CALL dbms.killTransaction("transaction-5678");

// 查看事务等待图（APOC）
CALL apoc.lock.list();
```

### 8.6.4 根因分析

Neo4j 使用读写锁（Read-Write Lock）机制：

```
锁兼容性矩阵：

             读锁（Read）  写锁（Write）  排他锁（Exclusive）
  读锁          兼容          不兼容          不兼容
  写锁         不兼容         不兼容          不兼容
  排他锁       不兼容         不兼容          不兼容
```

| 冲突模式 | 场景 | 说明 |
|----------|------|------|
| 读-写冲突 | 一个事务读节点，另一个事务写同一节点 | 最常见，写事务阻塞读事务 |
| 写-写冲突 | 两个事务同时修改同一节点/关系 | 后到的事务等待或超时 |
| 死锁 | 事务 A 锁了资源 1 等待资源 2，事务 B 锁了资源 2 等待资源 1 | 互相等待，必须终止一方 |
| 锁升级 | 读锁升级为写锁时与其他写锁冲突 | 事务内先读后写 |

### 8.6.5 解决方案

**方案一：调整锁超时配置**

```properties
# conf/neo4j.conf

# 锁获取超时时间（秒）
dbms.lock.acquisition.timeout=60

# 事务超时时间（秒）
dbms.transaction.timeout=300
```

**方案二：优化事务设计**

```cypher
// 错误：长时间持有锁的事务
BEGIN
MATCH (n:Account {id: 'A001'})
SET n.balance = n.balance - 100
// ... 执行其他耗时操作（网络调用、文件读取等）
MATCH (m:Account {id: 'B001'})
SET m.balance = m.balance + 100
COMMIT

// 正确：短事务，快速提交
MATCH (n:Account {id: 'A001'})
MATCH (m:Account {id: 'B001'})
SET n.balance = n.balance - 100,
    m.balance = m.balance + 100

// 错误：事务内先读后写导致锁升级
MATCH (n:Counter {id: 'visits'})
// 此时持有读锁
SET n.count = n.count + 1
// 需要升级为写锁，可能与其他读锁冲突

// 正确：使用 MERGE 或直接写操作
MATCH (n:Counter {id: 'visits'})
SET n.count = n.count + 1
```

**方案三：使用乐观锁模式**

```cypher
// 使用版本号实现乐观锁
MATCH (n:Account {id: 'A001'})
WHERE n.version = 5
SET n.balance = n.balance - 100,
    n.version = n.version + 1
RETURN n.version AS newVersion;

// 如果 version 不匹配，则更新失败，客户端重试
```

**方案四：避免死锁——固定锁顺序**

```java
// Java 示例：固定资源排序避免死锁
public void transfer(String fromId, String toId, long amount) {
    // 按 ID 排序，确保所有事务以相同顺序获取锁
    String first = fromId.compareTo(toId) < 0 ? fromId : toId;
    String second = fromId.compareTo(toId) < 0 ? toId : fromId;
    
    try (Session session = driver.session()) {
        session.writeTransaction(tx -> {
            tx.run("MATCH (a:Account {id: $first}) " +
                   "MATCH (b:Account {id: $second}) " +
                   "SET a.balance = CASE WHEN a.id = $from " +
                   "  THEN a.balance - $amount ELSE a.balance + $amount END, " +
                   "b.balance = CASE WHEN b.id = $from " +
                   "  THEN b.balance - $amount ELSE b.balance + $amount END",
                   parameters("first", first, "second", second,
                            "from", fromId, "amount", amount));
            return null;
        });
    }
}
```

**方案五：使用 APOC 锁管理**

```cypher
// 使用 APOC 的锁过程
CALL apoc.lock.nodes([$node1, $node2]);
// 显式锁定节点后执行操作
SET $node1.balance = $node1.balance - 100;
SET $node2.balance = $node2.balance + 100;
```

**方案六：重试机制**

```java
// Java 重试模板
public void executeWithRetry(TransactionWork<Void> work, int maxRetries) {
    for (int i = 0; i < maxRetries; i++) {
        try (Session session = driver.session()) {
            session.writeTransaction(work);
            return;
        } catch (TransientException e) {
            if (i == maxRetries - 1) throw e;
            // 指数退避
            Thread.sleep((long) Math.pow(2, i) * 100);
        }
    }
}
```

---

## 8.7 集群故障

### 8.7.1 现象描述

Neo4j Causal Cluster 或 Aura 集群出现故障，典型表现：

- 主节点切换（Leader switch）频繁
- 副本无法同步
- 写入失败（`Not a leader`）
- 集群成员状态异常
- 发现（Discovery）服务不可用
- 脑裂（Split-brain）现象

### 8.7.2 诊断命令

```bash
# 1. 查看集群状态
CALL dbms.cluster.overview();

# 2. 查看集群角色
CALL dbms.cluster.role();

# 3. 查看集群路由表
CALL dbms.cluster.routing.getServers();

# 4. 查看集群健康检查
CALL dbms.cluster.health();

# 5. 查看集群日志
grep -i "cluster\|raft\|discovery\|leader\|follower" logs/neo4j.log

# 6. 检查集群配置
grep "causal_clustering\|raft\|discovery" conf/neo4j.conf
```

### 8.7.3 集群架构理解

```
Neo4j Causal Cluster 架构：

                    ┌─────────────┐
                    │   负载均衡器   │
                    │  (LB/Proxy)  │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │   Core 1   │   │   Core 2   │   │   Core 3   │
    │  (Leader)  │   │ (Follower) │   │ (Follower) │
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │  Read 1   │   │  Read 2   │   │  Read 3   │
    │  Replica  │   │  Replica  │   │  Replica  │
    └───────────┘   └───────────┘   └───────────┘

Core 节点：参与 Raft 共识，可读写
Read Replica：只读副本，从 Core 异步同步
```

### 8.7.4 根因分析

| 故障模式 | 原因 | 诊断方法 |
|----------|------|----------|
| 领导者选举频繁 | 网络不稳定，节点间延迟过高 | `ping` 延迟测试，检查网络 |
| 副本同步延迟 | 网络带宽不足或写负载过高 | 检查 `catchup` 日志 |
| 写入失败 | 客户端连接到非 Leader 节点 | 检查路由表 |
| 节点被逐出集群 | 节点心跳超时 | 检查 `raft.log` |
| 发现服务失败 | DNS 解析或配置的发现地址不可达 | 检查 `discovery` 配置 |
| 脑裂 | 网络分区导致多个 Leader | 检查 Raft 日志中的 term 变化 |

### 8.7.5 解决方案

**方案一：集群配置优化**

```properties
# conf/neo4j.conf（所有 Core 节点）

# 集群名称（所有节点必须一致）
causal_clustering.expected_core_cluster_size=3

# 发现配置（推荐使用 DNS 或静态配置）
# DNS 发现
causal_clustering.discovery.type=DNS
causal_clustering.discovery.dns_resolver=cluster.neo4j.internal

# 静态发现（适用于固定 IP 环境）
# causal_clustering.discovery.type=LIST
# causal_clustering.initial_discovery_members=192.168.1.10:5000,192.168.1.11:5000,192.168.1.12:5000

# Raft 配置
causal_clustering.raft_messages_log_enable=true
causal_clustering.raft_log_rotation_size=1G
causal_clustering.raft_log_pruning_frequency=10m

# 网络配置
causal_clustering.transaction_advertised_address=:6000
causal_clustering.raft_advertised_address=:7000
causal_clustering.discovery_advertised_address=:5000
```

**方案二：处理领导者选举问题**

```bash
# 1. 检查当前领导者
CALL dbms.cluster.overview();

# 2. 强制触发领导者选举（仅在必要时）
# 在 Core 节点上执行
CALL dbms.cluster.forceElection();

# 3. 检查 Raft 日志
grep "election\|term\|vote" logs/neo4j.log

# 4. 网络延迟测试
# 在三个 Core 节点之间测试延迟
ping -n 10 192.168.1.11
ping -n 10 192.168.1.12
```

**方案三：处理副本同步延迟**

```cypher
// 检查副本同步状态
CALL dbms.cluster.overview() YIELD id, address, state, 
    databases, groups
RETURN *;

// 检查数据库同步状态
CALL dbms.database.state("neo4j");

// 查看 catchup 状态
CALL dbms.cluster.catchupProgress();
```

**方案四：集群节点替换**

```bash
# 1. 优雅移除故障节点
# 在正常节点上执行
CALL dbms.cluster.removeServer("core-01");

# 2. 停止故障节点
neo4j stop

# 3. 清理故障节点数据（谨慎操作）
rm -rf data/databases/
rm -rf data/transactions/

# 4. 启动节点，它将自动加入集群并同步数据
neo4j start

# 5. 验证节点状态
CALL dbms.cluster.overview();
```

**方案五：处理脑裂（Split-Brain）**

```bash
# 脑裂检测步骤：

# 1. 检查所有 Core 节点的 Raft term
# 在每个节点上执行
CALL dbms.cluster.overview();

# 2. 如果存在多个 Leader，确定正确的 Leader
# 比较每个节点的 Raft term，term 最大的 Leader 是合法的
# 或检查哪个节点拥有最新的事务

# 3. 停止非法的 Leader 节点
neo4h stop

# 4. 在合法的 Leader 上执行强制选举
CALL dbms.cluster.forceElection();

# 5. 重启被停止的节点
neo4j start
```

**方案六：客户端驱动配置**

```java
// Java 驱动集群配置
Config config = Config.builder()
    .withMaxConnectionPoolSize(50)
    .withConnectionAcquisitionTimeout(30, TimeUnit.SECONDS)
    .withFetchSize(1000)
    .withResolver(address -> {
        // 自定义地址解析
        return Collections.singletonList(
            new BoltServerAddress("core-01", 7687)
        );
    })
    .build();

// 使用集群路由
Driver driver = GraphDatabase.driver(
    "neo4j://cluster.example.com",  // neo4j:// 协议自动路由
    AuthTokens.basic("neo4j", "password"),
    config
);
```

**方案七：集群监控**

```bash
# 1. 启用 Prometheus 监控端点
# conf/neo4j.conf
metrics.prometheus.enabled=true
metrics.prometheus.endpoint=:2004

# 2. 关键集群指标
# neo4j_cluster_leader               - 是否为 Leader
# neo4j_cluster_raft_term            - Raft term 编号
# neo4j_cluster_replication_lag     - 复制延迟
# neo4j_cluster_member_count         - 集群成员数
# neo4j_cluster_network_messages     - 网络消息统计

# 3. 使用 neo4j 健康检查端点
curl -u neo4j:password http://localhost:7474/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"CALL dbms.cluster.health()"}]}'
```

---

## 8.8 故障排查通用工具集

### 8.8.1 neo4j-admin 命令汇总

```bash
# 数据库一致性检查
neo4j-admin database check --verbose

# 数据库恢复
neo4j-admin database restore --from=<backup-path> --database=neo4j

# 数据库导入
neo4j-admin database import full --nodes=<header> --relationships=<header>

# 报告生成
neo4j-admin report --to=/tmp/neo4j-report.zip

# 内存建议
neo4j-admin server memory-recommendation

# 系统信息
neo4j-admin system-info
```

### 8.8.2 关键系统表查询

```cypher
// 数据库配置
CALL dbms.listConfig();

// 数据库信息
CALL dbms.listDatabases();

// 数据库状态
CALL dbms.database.status("neo4j");

// 节点和关系计数
MATCH (n) RETURN count(n) AS nodes;
MATCH ()-[r]->() RETURN count(r) AS relationships;

// 标签分布
CALL db.labels() YIELD label
CALL apoc.cypher.run("MATCH (n:" + label + ") RETURN count(n) AS count", {})
YIELD value
RETURN label, value.count AS count
ORDER BY count DESC;

// 关系类型分布
CALL db.relationshipTypes() YIELD relationshipType
CALL apoc.cypher.run(
    "MATCH ()-[r:" + relationshipType + "]->() RETURN count(r) AS count", {})
YIELD value
RETURN relationshipType, value.count AS count
ORDER BY count DESC;
```

### 8.8.3 日志分析速查表

| 日志模式 | 含义 | 严重级别 |
|----------|------|----------|
| `OutOfMemoryError` | JVM 堆内存耗尽 | CRITICAL |
| `No space left on device` | 磁盘空间耗尽 | CRITICAL |
| `Unable to acquire lock` | 锁获取超时 | WARNING |
| `Deadlock detected` | 检测到死锁 | ERROR |
| `Connection refused` | 连接被拒绝 | ERROR |
| `Not a leader` | 非 Leader 节点收到写请求 | WARNING |
| `Election started` | 领导者选举开始 | INFO |
| `Checkpoint failed` | 检查点失败 | ERROR |
| `Transaction log pruning` | 事务日志清理 | INFO |
| `Page cache fault` | 页面缓存未命中 | DEBUG |

### 8.8.4 性能基线指标

| 指标 | 健康范围 | 告警阈值 |
|------|----------|----------|
| 堆内存使用率 | < 70% | > 85% |
| GC 暂停时间 | < 200ms | > 1s |
| 页面缓存命中率 | > 99% | < 95% |
| 磁盘使用率 | < 70% | > 85% |
| 查询平均耗时 | < 100ms | > 1s |
| 事务冲突率 | < 1% | > 5% |
| 集群复制延迟 | < 1s | > 10s |
| 连接池使用率 | < 60% | > 80% |

---

## 8.9 故障恢复流程

### 8.9.1 标准恢复步骤

```
1. 评估影响范围
   ├── 确认故障类型（连接/查询/OOM/磁盘/事务/集群）
   ├── 确认影响用户和业务
   └── 确认是否有数据丢失

2. 紧急止损
   ├── 隔离故障节点（集群环境）
   ├── 切换到备用节点/副本
   └── 必要时降级服务（如关闭写服务）

3. 根因诊断
   ├── 收集日志和诊断信息
   ├── 使用本章提供的诊断命令
   └── 确定根本原因

4. 实施修复
   ├── 按照对应章节的解决方案操作
   ├── 先在测试环境验证
   └── 逐步应用到生产环境

5. 验证恢复
   ├── 确认服务正常
   ├── 确认数据一致性
   └── 确认性能指标恢复

6. 事后复盘
   ├── 记录故障时间线和根因
   ├── 补充监控和告警
   └── 更新运维手册
```

### 8.9.2 紧急联系人清单模板

```
Neo4j 故障紧急联系人清单
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DBA 负责人：    ___________  电话：___________
系统管理员：    ___________  电话：___________
网络工程师：    ___________  电话：___________
安全负责人：    ___________  电话：___________
业务方联系人：  ___________  电话：___________

Neo4j 版本：    ___________
部署方式：      [ ] 单机  [ ] 集群  [ ] Aura
数据目录：      ___________
日志目录：      ___________
备份目录：      ___________
```

---

## 8.10 总结

本章系统性地介绍了 Neo4j 生产环境中六类最常见的故障场景及其排查方法。核心要点总结如下：

1. **连接问题**：优先检查进程存活、端口监听和防火墙规则，其次检查 SSL 证书和连接池配置。
2. **查询超时**：使用 `EXPLAIN` 和 `PROFILE` 分析执行计划，确保查询使用了正确的索引，避免笛卡尔积和深度无界遍历。
3. **内存溢出**：合理配置堆内存和页面缓存的比例（通常 1:1 到 1:2），使用 `apoc.periodic.iterate` 分批处理大规模更新。
4. **磁盘写满**：配置事务日志和调试日志的轮转策略，将数据和日志目录分离到不同磁盘。
5. **事务冲突**：保持事务短小精悍，避免在事务中执行耗时操作，使用固定锁顺序避免死锁。
6. **集群故障**：确保网络稳定，合理配置发现机制和 Raft 参数，客户端使用 `neo4j://` 协议实现自动路由。

故障排查的核心方法论是：**先止损，后诊断，再修复，终复盘**。建议将本章的诊断命令和解决方案整理为运维脚本库，配合监控系统实现自动化告警和故障自愈。

---

*本章内容适用于 Neo4j 4.4 LTS 和 5.x 版本。部分命令和配置项在更早版本中可能有所不同，请以官方文档为准。*
