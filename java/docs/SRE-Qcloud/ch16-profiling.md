# 第16章 腾讯云性能分析实战

## 16.1 引言

性能分析是SRE工作中最核心、最具挑战性的环节之一。在腾讯云的复杂分布式环境中，一个请求可能穿越负载均衡器、API网关、微服务网格、缓存层、数据库集群和对象存储，任何一个环节的劣化都会导致端到端延迟飙升。本章从代码级性能剖析、数据库性能分析、网络性能分析和持续性能优化四个维度，系统性地介绍腾讯云环境下的性能分析方法论与工具链。

---

## 16.2 代码级性能剖析

### 16.2.1 CPU Profiling

#### 16.2.1.1 火焰图原理

火焰图（Flame Graph）是 Brendan Gregg 发明的 CPU 热点可视化工具。其核心原理是以固定频率（如 99Hz 或 1000Hz）对程序调用栈进行采样，统计每个函数在采样中出现的频次。火焰图的每个矩形代表一个函数调用，宽度表示其在 CPU 上的时间占比，纵向表示调用栈深度。

在腾讯云 CVM 上生成 Java 应用火焰图的标准流程：

```bash
# 1. 安装 async-profiler
wget https://github.com/async-profiler/async-profiler/releases/download/v3.0/async-profiler-3.0-linux-x64.tar.gz
tar xzf async-profiler-3.0-linux-x64.tar.gz

# 2. 采集 CPU 采样（持续 60 秒）
./profiler.sh -d 60 -o flamegraph -f /tmp/cpu.svg <PID>

# 3. 采集分配采样（分析内存热点）
./profiler.sh -d 60 -e alloc -o flamegraph -f /tmp/alloc.svg <PID>

# 4. 采集锁竞争采样
./profiler.sh -d 60 -e lock -o flamegraph -f /tmp/lock.svg <PID>
```

#### 16.2.1.2 火焰图解读方法

解读火焰图时遵循以下原则：

- **关注顶部宽条**：顶部函数是实际消耗 CPU 的代码。如果 `java.util.HashMap.get` 占据 30% 的宽度，说明哈希冲突严重或调用频率过高。
- **关注平顶（Flat Top）**：如果火焰图顶部出现大量等宽平顶，说明存在大量短周期函数调用，通常意味着频繁的日志输出、序列化或对象创建。
- **关注"烟囱"（Chimney）**：某个调用链异常高耸，说明存在深层嵌套调用，可能是递归或过度抽象。
- **颜色含义**：红色代表原生/内核代码，橙色代表 Java 代码，绿色代表 JIT 编译代码，蓝色代表线程管理。

#### 16.2.1.3 腾讯云 JVM 调优案例

**案例：消息推送服务 CPU 飙高**

某消息推送服务在腾讯云 CVM（8C16G）上运行，高峰期 CPU 使用率持续 95%+。通过 async-profiler 采集火焰图发现 `java.util.zip.GZIPOutputStream.write` 占据 42% 的 CPU 时间。

```bash
# 采集到火焰图后，定位到热点函数
./profiler.sh -d 120 -o flamegraph -f /tmp/push-cpu.svg 12345
```

分析发现每次推送消息时都对 JSON 负载进行 GZIP 压缩，而消息体平均仅 200 字节。对于小负载，压缩收益极低但 CPU 开销巨大。优化方案：

1. 对小于 1KB 的消息跳过压缩
2. 使用共享的 Deflater 对象池，避免重复创建

优化后 CPU 使用率降至 35%，P99 延迟从 120ms 降至 45ms。

### 16.2.2 内存分析

#### 16.2.2.1 堆转储分析

当 Java 应用出现 OOM 或 GC 频繁时，堆转储（Heap Dump）是最有效的分析手段。腾讯云上常用的采集方式：

```bash
# 方式一：jmap 手动触发
jmap -dump:live,format=b,file=/tmp/heap.hprof <PID>

# 方式二：JVM 参数自动触发（推荐）
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/data/dumps/
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-Xloggc:/data/gc/gc.log
```

使用 Eclipse MAT（Memory Analyzer Tool）分析堆转储的关键步骤：

1. **查找疑似泄漏对象**：使用 MAT 的 "Leak Suspects" 报告，自动识别最可能的内存泄漏路径。
2. **分析 GC Root 路径**：对于怀疑泄漏的对象，查看其到 GC Root 的最短路径，确认是否被意外持有。
3. **计算保留集（Retained Set）**：通过 "Calculate Retained Set" 确定对象实际占用的内存大小。

#### 16.2.2.2 腾讯云 TDSQL 连接泄漏排查

**案例：订单服务频繁 Full GC**

订单服务运行在腾讯云 TDSQL 之上，每 30 分钟触发一次 Full GC，每次停顿 3-5 秒。通过 MAT 分析堆转储发现 `com.mysql.cj.jdbc.ConnectionImpl` 对象有 1200 个实例未被释放。

```java
// 问题代码：未正确关闭连接
public void queryOrders(String userId) {
    Connection conn = dataSource.getConnection();
    Statement stmt = conn.createStatement();
    ResultSet rs = stmt.executeQuery("SELECT * FROM orders WHERE user_id = " + userId);
    // 缺少 finally 块关闭 rs、stmt、conn
}
```

修复方案：使用 try-with-resources 确保所有 JDBC 资源正确关闭。

```java
// 修复后
public List<Order> queryOrders(String userId) {
    String sql = "SELECT * FROM orders WHERE user_id = ?";
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(sql)) {
        stmt.setString(1, userId);
        try (ResultSet rs = stmt.executeQuery()) {
            return mapOrders(rs);
        }
    } catch (SQLException e) {
        log.error("query orders failed", e);
        throw new RuntimeException(e);
    }
}
```

修复后 Full GC 频率降至每 6 小时一次，Young GC 停顿从 500ms 降至 80ms。

### 16.2.3 锁竞争分析

#### 16.2.3.1 线程转储分析

线程转储（Thread Dump）是分析死锁、线程阻塞和锁竞争的基础工具。

```bash
# 采集线程转储
jstack -l <PID> > /tmp/threaddump.txt

# 连续采集多次（间隔 3 秒），观察线程状态变化
for i in {1..5}; do
    jstack -l <PID> > /tmp/td_$(date +%s).txt
    sleep 3
done
```

线程状态分析要点：

- **RUNNABLE**：正在执行，如果大量 RUNNABLE 线程集中在同一代码路径，说明 CPU 热点。
- **BLOCKED**：等待锁释放，如果大量线程 BLOCKED 在同一锁对象，说明锁竞争激烈。
- **WAITING / TIMED_WAITING**：等待条件变量，通常出现在线程池空闲或 I/O 等待场景。
- **死锁检测**：jstack 会自动检测死锁并输出 "Found one Java-level deadlock"。

#### 16.2.3.2 腾讯云 CKafka 生产者锁优化

**案例：日志采集客户端吞吐不足**

日志采集服务向 CKafka 发送消息时，在 8 核机器上只能达到 2000 msg/s 的吞吐量。通过 jstack 发现大量线程 BLOCKED 在 `java.util.LinkedList.addLast` 上。

```java
// 问题代码：使用 synchronized 保护非线程安全的 LinkedList
private final LinkedList<String> batch = new LinkedList<>();

public synchronized void append(String message) {
    batch.addLast(message);
    if (batch.size() >= BATCH_SIZE) {
        flush();
    }
}
```

优化方案：使用 `ConcurrentLinkedQueue` 替代 `LinkedList`，配合 `AtomicInteger` 计数。

```java
private final ConcurrentLinkedQueue<String> batch = new ConcurrentLinkedQueue<>();
private final AtomicInteger count = new AtomicInteger(0);

public void append(String message) {
    batch.offer(message);
    if (count.incrementAndGet() >= BATCH_SIZE) {
        flush();
    }
}
```

优化后吞吐量提升至 15000 msg/s，锁竞争完全消除。

---

## 16.3 数据库性能分析

### 16.3.1 腾讯云 TDSQL 慢查询分析

#### 16.3.1.1 慢查询日志配置

TDSQL 的慢查询日志是数据库性能分析的起点。通过腾讯云控制台或 SQL 命令配置：

```sql
-- 开启慢查询日志
SET global slow_query_log = ON;
SET global long_query_time = 0.5;  -- 超过 500ms 记录
SET global log_queries_not_using_indexes = ON;

-- 查看慢查询日志状态
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';
```

慢查询日志示例：

```
# Time: 2026-06-28T10:30:15.123456Z
# User@Host: app_user[app] @  [10.0.1.100]
# Query_time: 2.345678  Lock_time: 0.000123
# Rows_sent: 1  Rows_examined: 1580000
SET timestamp=1751092215;
SELECT order_id, status, amount
FROM orders
WHERE DATE(create_time) = '2026-06-28'
  AND status = 'PAID';
```

关键指标解读：

- **Query_time**：SQL 实际执行时间，2.35 秒说明需要优化。
- **Rows_examined**：扫描行数 158 万，但只返回 1 行，典型的索引缺失。
- **Rows_sent / Rows_examined 比例**：理想值接近 1，本例中 1/1580000 说明严重偏离。

#### 16.3.1.2 执行计划分析

使用 `EXPLAIN` 分析慢查询：

```sql
EXPLAIN SELECT order_id, status, amount
FROM orders
WHERE DATE(create_time) = '2026-06-28'
  AND status = 'PAID'\G
```

输出分析：

```
id: 1
select_type: SIMPLE
table: orders
type: ALL
possible_keys: NULL
key: NULL
key_len: NULL
ref: NULL
rows: 1580000
Extra: Using where
```

- **type=ALL**：全表扫描，最差的访问方式。
- **rows=1580000**：扫描 158 万行。
- **Extra=Using where**：没有使用索引，在存储引擎层过滤。

优化方案：创建复合索引。

```sql
ALTER TABLE orders ADD INDEX idx_create_status (create_time, status);
```

优化后执行计划：

```
type: ref
key: idx_create_status
rows: 1250
Extra: Using index condition
```

查询时间从 2.35 秒降至 8 毫秒。

### 16.3.2 腾讯云 Redis 性能分析

#### 16.3.2.1 慢命令监控

腾讯云 Redis 提供了慢查询日志功能：

```bash
# 通过 redis-cli 查看慢查询
redis-cli -h <instance_id>.redis.tencentcloud.com -p 6379 -a <password>

# 设置慢查询阈值（微秒）
CONFIG SET slowlog-log-slower-than 10000

# 查看最近 100 条慢查询
SLOWLOG GET 100

# 查看慢查询长度
SLOWLOG LEN
```

慢查询输出示例：

```
1) 1) (integer) 128
   2) (integer) 1751092215
   3) (integer) 45231
   4) 1) "KEYS"
      2) "user:*"
   5) "127.0.0.1:6379"
```

- 耗时 45231 微秒（45ms）
- 命令为 `KEYS user:*`，这是典型的危险操作

#### 16.3.2.2 大 Key 分析

大 Key 是 Redis 性能问题的常见根源。腾讯云提供了 `redis-big-key` 分析工具：

```bash
# 使用 redis-cli 的 --bigkeys 选项
redis-cli -h <host> -p 6379 -a <password> --bigkeys

# 输出示例
# Biggest string found 'session:token:abc123' has 5242880 bytes
# Biggest list  found 'queue:order' has 150000 items
# Biggest hash  found 'user:profile:hash' has 85000 fields
```

大 Key 的危害：

- **阻塞操作**：`DEL` 一个包含 150 万元素的 list 会阻塞 Redis 数秒。
- **内存不均**：大 Key 导致 Redis 内存碎片化，单节点内存倾斜。
- **网络开销**：读取大 Key 产生大量网络传输，增加延迟。

优化策略：

```bash
# 使用 UNLINK 替代 DEL（异步删除）
UNLINK queue:order

# 拆分大 Hash
# 原结构：user:profile:hash -> {field1: val1, field2: val2, ...}
# 拆分后：user:profile:1 -> {field1: val1, field2: val2}
#         user:profile:2 -> {field3: val3, field4: val4}
```

#### 16.3.2.3 热 Key 发现

热 Key 导致单节点 CPU 飙高，是 Redis 集群场景下的常见问题。腾讯云 Redis 提供了 hotkey 分析功能：

```bash
# 通过腾讯云控制台开启热 Key 采集
# 或使用 redis-cli 的 monitor 命令（生产环境慎用）
redis-cli -h <host> -p 6379 -a <password> monitor | head -10000 | \
  awk '{print $4}' | sort | uniq -c | sort -rn | head -10
```

热 Key 解决方案：

1. **本地缓存**：在应用层使用 Caffeine/Guava Cache 缓存热 Key。
2. **读写分离**：腾讯云 Redis 支持读写分离架构，将读请求分散到只读副本。
3. **Key 分片**：在 Key 后加随机后缀，将访问分散到多个节点。

```java
// 热 Key 本地缓存方案
public class HotKeyCache {
    private final Cache<String, Object> localCache = Caffeine.newBuilder()
        .maximumSize(10000)
        .expireAfterWrite(Duration.ofSeconds(5))
        .build();

    public Object get(String key) {
        Object cached = localCache.getIfPresent(key);
        if (cached != null) return cached;

        Object value = redisTemplate.opsForValue().get(key);
        if (value != null) {
            localCache.put(key, value);
        }
        return value;
    }
}
```

### 16.3.3 数据库连接池调优

#### 16.3.3.1 HikariCP 配置最佳实践

腾讯云 TDSQL 推荐使用 HikariCP 连接池，以下是经过生产验证的配置：

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 50
      minimum-idle: 10
      idle-timeout: 300000
      connection-timeout: 5000
      max-lifetime: 600000
      keepalive-time: 60000
      validation-timeout: 3000
      leak-detection-threshold: 10000
```

配置参数说明：

- **maximum-pool-size**：并非越大越好。PostgreSQL 和 MySQL 的每个连接都需要一个线程，连接数过多反而导致上下文切换加剧。经验公式：`(core_count * 2) + effective_spindle_count`。
- **leak-detection-threshold**：设置为 10 秒，超过此时间未归还的连接会在日志中打印堆栈，帮助定位连接泄漏。
- **keepalive-time**：60 秒发送一次心跳，防止腾讯云内部网络设备断开空闲连接。

#### 16.3.3.2 连接池监控

```java
// 通过 Micrometer 暴露 HikariCP 指标
@Bean
public HikariPoolMXBean hikariPoolMXBean(DataSource dataSource) {
    HikariDataSource hikariDataSource = (HikariDataSource) dataSource;
    return hikariDataSource.getHikariPoolMXBean();
}

// 关键监控指标
// - ActiveConnections: 当前活跃连接数
// - IdleConnections: 空闲连接数
// - PendingThreads: 等待连接的线程数（>0 说明连接池不足）
// - TotalConnections: 总连接数
```

---

## 16.4 网络性能分析

### 16.4.1 腾讯云网络架构概述

腾讯云的网络架构分为多个层次：

1. **基础网络**：CVM 间通过 VPC 内网通信，延迟通常 < 0.5ms。
2. **CLB（Cloud Load Balancer）**：四层/七层负载均衡，引入 1-3ms 延迟。
3. **API 网关**：南北向流量入口，增加 3-10ms 延迟。
4. **跨可用区/跨地域**：同城跨 AZ 延迟 1-2ms，跨地域延迟 20-100ms。

### 16.4.2 网络延迟诊断工具

#### 16.4.2.1 mtr 综合诊断

`mtr` 结合了 `ping` 和 `traceroute`，是网络路径诊断的首选工具：

```bash
# 安装 mtr
yum install -y mtr

# 诊断到 TDSQL 实例的网络路径
mtr -r -c 100 -i 0.5 <tdsql-inner-ip>

# 输出示例
# Start: 2026-06-28T10:30:00
# HOST: app-server                    Loss%   Snt   Last   Avg  Best  Wrst StDev
# 1. 10.0.0.1                         0.0%   100   0.2   0.3   0.1   0.8   0.1
# 2. 10.0.1.254                       0.0%   100   0.3   0.4   0.2   1.2   0.2
# 3. 169.254.0.1                      0.0%   100   0.5   0.6   0.3   2.1   0.3
# 4. 10.200.0.1                       0.0%   100   0.6   0.7   0.4   3.0   0.4
# 5. 10.200.1.1                       0.0%   100   0.8   0.9   0.5   5.0   0.6
# 6. 10.200.2.1                       0.0%   100   1.0   1.1   0.7   4.0   0.5
```

解读要点：

- **Loss% 列**：任何一跳出现丢包都值得关注。中间跳的丢包可能是 ICMP 限速，但最后一跳的丢包说明真实问题。
- **StDev 列**：标准差大说明网络抖动严重，可能由拥塞或链路不稳定引起。
- **跳数变化**：如果路径跳数突然增加，说明路由发生了变化。

#### 16.4.2.2 tcpdump 抓包分析

```bash
# 抓取到 TDSQL 的流量
tcpdump -i eth0 -s 0 -w /tmp/tdsql.pcap host <tdsql-ip> and port 3306

# 分析 TCP 握手时间
tcpdump -r /tmp/tdsql.pcap -nn 'tcp[tcpflags] & (tcp-syn|tcp-syn-ack|tcp-ack) != 0'

# 使用 Wireshark 分析 TCP 时间序列
# 关注：TCP Retransmission、TCP Dup ACK、TCP Fast Retransmission
```

#### 16.4.2.3 腾讯云网络探测

腾讯云提供了 CLB 和 CVM 级别的网络探测能力：

```bash
# 使用腾讯云 CLI 创建网络探测
tccli vpc CreateNetDetect \
    --VpcId vpc-xxxxx \
    --SubnetId subnet-xxxxx \
    --DetectDestinationIp <target-ip> \
    --NextHopType DIRECT

# 查看探测结果
tccli vpc DescribeNetDetectResults \
    --Filters '[{"Name":"vpc-id","Values":["vpc-xxxxx"]}]'
```

### 16.4.3 腾讯云 CLB 性能分析

#### 16.4.3.1 CLB 监控指标

腾讯云 CLB 提供的关键性能指标：

| 指标名称 | 说明 | 告警阈值 |
|---------|------|---------|
| 并发连接数 | 当前活跃 TCP 连接数 | > 最大规格 80% |
| 新建连接数 | 每秒新建连接数 | > 50000/s |
| 入包量 | 每秒入方向数据包数 | > 100000 pps |
| 出包量 | 每秒出方向数据包数 | > 100000 pps |
| 平均延迟 | 七层转发平均延迟 | > 50ms |
| 错误码率 | 502/504 错误占比 | > 0.1% |

#### 16.4.3.2 CLB 性能瓶颈排查

**案例：CLB 502 错误排查**

某 Web 服务通过 CLB 对外暴露，高峰期出现大量 502 Bad Gateway。

排查步骤：

```bash
# 1. 检查后端 CVM 健康检查状态
tccli clb DescribeTargetHealth \
    --LoadBalancerId lb-xxxxx \
    --ListenerId lbl-xxxxx

# 2. 检查后端 CVM 连接数
ss -s | grep -E "estab|close_wait"

# 3. 检查 CLB 是否达到最大连接数
# 通过腾讯云监控查看 Conns 指标
```

发现后端 CVM 的 `close_wait` 连接数高达 8000+，说明应用层未正确关闭连接。修复后 502 错误消失。

### 16.4.4 腾讯云 API 网关性能分析

API 网关作为流量入口，其性能直接影响所有上游服务。关键分析维度：

```bash
# 查看 API 网关请求延迟分布
tccli apigateway DescribeApiUsagePlan \
    --ServiceId service-xxxxx \
    --ApiId api-xxxxx

# 分析响应大小对延迟的影响
# 大响应体（>1MB）会显著增加网关转发延迟
# 建议：启用响应压缩，或使用 COS 预签名 URL 替代大响应体
```

---

## 16.5 持续性能优化

### 16.5.1 性能基准线建立

持续性能优化的第一步是建立可靠的性能基准线。推荐使用腾讯云 Prometheus 监控服务（TPM）采集以下指标：

```yaml
# prometheus.yml 关键采集配置
scrape_configs:
  - job_name: 'cvm-node'
    static_configs:
      - targets: ['localhost:9100']  # node_exporter
  - job_name: 'jvm-metrics'
    static_configs:
      - targets: ['localhost:8080']  # JMX Exporter
  - job_name: 'tdsql-metrics'
    static_configs:
      - targets: ['localhost:9104']  # mysqld_exporter
```

关键基准指标：

| 维度 | 指标 | 采集频率 | 告警阈值 |
|------|------|---------|---------|
| CPU | node_cpu_seconds_total | 15s | > 80% 持续 5min |
| 内存 | node_memory_MemAvailable_bytes | 15s | < 20% 持续 5min |
| JVM GC | jvm_gc_pause_seconds | 15s | > 1s 持续 3次 |
| JVM 堆 | jvm_memory_used_bytes | 15s | > 85% 持续 5min |
| TDSQL | mysql_global_status_threads_connected | 15s | > 200 |
| TDSQL | mysql_global_status_queries | 15s | 同比突降 > 50% |

### 16.5.2 自动化性能回归测试

#### 16.5.2.1 基于 JMeter 的回归测试

```xml
<!-- jmeter-test-plan.jmx 关键配置 -->
<ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup">
  <intProp name="ThreadGroup.num_threads">100</intProp>
  <intProp name="ThreadGroup.ramp_time">30</intProp>
  <longProp name="ThreadGroup.duration">300</longProp>
</ThreadGroup>
```

集成到 CI/CD 流水线：

```yaml
# .github/workflows/perf-test.yml
name: Performance Regression
on:
  push:
    branches: [main]
jobs:
  perf-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Staging
        run: |
          # 部署到腾讯云 TKE 测试环境
          kubectl set image deployment/app app=${{ github.sha }}
          kubectl rollout status deployment/app
      - name: Run JMeter Test
        run: |
          jmeter -n -t perf/test-plan.jmx \
            -l /tmp/results.jtl \
            -e -o /tmp/report
      - name: Compare with Baseline
        run: |
          python perf/compare_baseline.py \
            --current /tmp/results.jtl \
            --baseline perf/baseline.json \
            --threshold 10
```

#### 16.5.2.2 性能基线对比脚本

```python
#!/usr/bin/env python3
"""
性能基线对比工具
比较当前测试结果与历史基线，超过阈值则告警
"""
import json
import sys
import argparse
from pathlib import Path
from typing import Dict, List


def parse_jtl(filepath: str) -> Dict[str, float]:
    """解析 JMeter JTL 文件，提取关键百分位指标"""
    import csv
    latencies = []
    with open(filepath, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            latencies.append(int(row['elapsed']))

    latencies.sort()
    n = len(latencies)
    return {
        'p50': latencies[int(n * 0.50)],
        'p90': latencies[int(n * 0.90)],
        'p95': latencies[int(n * 0.95)],
        'p99': latencies[int(n * 0.99)],
        'avg': sum(latencies) / n,
        'throughput': n / (int(row['timeStamp']) - int(latencies[0])) * 1000,
        'total_requests': n,
    }


def load_baseline(filepath: str) -> Dict:
    with open(filepath, 'r') as f:
        return json.load(f)


def compare(current: Dict, baseline: Dict, threshold: float) -> List[str]:
    """对比当前结果与基线，返回超过阈值的指标列表"""
    violations = []
    for metric in ['p50', 'p90', 'p95', 'p99', 'avg']:
        cur_val = current.get(metric, 0)
        base_val = baseline.get(metric, 0)
        if base_val == 0:
            continue
        change_pct = (cur_val - base_val) / base_val * 100
        if change_pct > threshold:
            violations.append(
                f"{metric}: {cur_val}ms vs {base_val}ms "
                f"(+{change_pct:.1f}%, threshold={threshold}%)"
            )

    # 吞吐量下降检测
    cur_tp = current.get('throughput', 0)
    base_tp = baseline.get('throughput', 0)
    if base_tp > 0:
        tp_change = (cur_tp - base_tp) / base_tp * 100
        if tp_change < -threshold:
            violations.append(
                f"throughput: {cur_tp:.0f} req/s vs {base_tp:.0f} req/s "
                f"({tp_change:.1f}%, threshold={threshold}%)"
            )

    return violations


def update_baseline(current: Dict, baseline_path: str):
    """更新基线文件"""
    with open(baseline_path, 'w') as f:
        json.dump(current, f, indent=2)
    print(f"基线已更新: {baseline_path}")


def main():
    parser = argparse.ArgumentParser(description='性能基线对比工具')
    parser.add_argument('--current', required=True, help='当前测试结果 JTL 文件')
    parser.add_argument('--baseline', required=True, help='基线 JSON 文件')
    parser.add_argument('--threshold', type=float, default=10,
                       help='告警阈值百分比（默认 10%%）')
    parser.add_argument('--update', action='store_true',
                       help='通过后更新基线')
    args = parser.parse_args()

    current = parse_jtl(args.current)
    baseline = load_baseline(args.baseline)

    print(f"当前结果: P50={current['p50']}ms, "
          f"P99={current['p99']}ms, "
          f"吞吐={current['throughput']:.0f} req/s")
    print(f"基线数据: P50={baseline['p50']}ms, "
          f"P99={baseline['p99']}ms, "
          f"吞吐={baseline['throughput']:.0f} req/s")

    violations = compare(current, baseline, args.threshold)
    if violations:
        print("\n❌ 性能退化检测:")
        for v in violations:
            print(f"  - {v}")
        sys.exit(1)
    else:
        print("\n✅ 性能指标在阈值范围内")

    if args.update:
        update_baseline(current, args.baseline)


if __name__ == '__main__':
    main()
```

### 16.5.3 全链路性能分析脚本

以下是一个综合性的 Python 性能分析脚本，可用于腾讯云环境的日常巡检：

```python
#!/usr/bin/env python3
"""
腾讯云全链路性能分析工具
支持：CPU/内存/磁盘/网络/数据库/Redis 一站式诊断
"""
import os
import sys
import json
import time
import socket
import subprocess
import argparse
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict


@dataclass
class PerfReport:
    timestamp: str
    hostname: str
    cpu: Dict
    memory: Dict
    disk: Dict
    network: Dict
    tcp: Dict
    jvm: Optional[Dict] = None
    mysql: Optional[Dict] = None
    redis: Optional[Dict] = None
    recommendations: List[str] = None

    def __post_init__(self):
        if self.recommendations is None:
            self.recommendations = []


def get_cpu_info() -> Dict:
    """采集 CPU 信息"""
    result = {}
    with open('/proc/stat', 'r') as f:
        cpu_line = [l for l in f if l.startswith('cpu ')][0]
        fields = cpu_line.split()
        # user, nice, system, idle, iowait, irq, softirq, steal
        total = sum(int(x) for x in fields[1:])
        idle = int(fields[4])
        result['total_jiffies'] = total
        result['idle_jiffies'] = idle

    # 获取 CPU 负载
    with open('/proc/loadavg', 'r') as f:
        parts = f.read().strip().split()
        result['load_1min'] = float(parts[0])
        result['load_5min'] = float(parts[1])
        result['load_15min'] = float(parts[2])

    # 获取 CPU 核心数
    result['core_count'] = os.cpu_count() or 1

    # 计算 CPU 使用率（两次采样）
    with open('/proc/stat', 'r') as f:
        line1 = [l for l in f if l.startswith('cpu ')][0]
    time.sleep(1)
    with open('/proc/stat', 'r') as f:
        line2 = [l for l in f if l.startswith('cpu ')][0]

    def parse_cpu(line: str) -> list:
        return [int(x) for x in line.split()[1:]]

    c1 = parse_cpu(line1)
    c2 = parse_cpu(line2)
    total_delta = sum(c2) - sum(c1)
    idle_delta = c2[3] - c1[3]
    result['usage_percent'] = round(
        (1 - idle_delta / total_delta) * 100, 2
    )

    return result


def get_memory_info() -> Dict:
    """采集内存信息"""
    result = {}
    with open('/proc/meminfo', 'r') as f:
        for line in f:
            parts = line.split(':')
            if len(parts) != 2:
                continue
            key = parts[0].strip()
            val_str = parts[1].strip().split()[0]
            try:
                val_kb = int(val_str)
            except ValueError:
                continue

            if key == 'MemTotal':
                result['total_kb'] = val_kb
            elif key == 'MemAvailable':
                result['available_kb'] = val_kb
            elif key == 'MemFree':
                result['free_kb'] = val_kb
            elif key == 'Buffers':
                result['buffers_kb'] = val_kb
            elif key == 'Cached':
                result['cached_kb'] = val_kb

    if result.get('total_kb'):
        result['usage_percent'] = round(
            (1 - result['available_kb'] / result['total_kb']) * 100, 2
        )
        result['total_gb'] = round(result['total_kb'] / 1024 / 1024, 2)
        result['available_gb'] = round(result['available_kb'] / 1024 / 1024, 2)

    return result


def get_disk_info() -> Dict:
    """采集磁盘 I/O 信息"""
    result = {}
    try:
        # 使用 iostat 获取磁盘信息
        output = subprocess.check_output(
            ['iostat', '-x', '1', '2'],
            stderr=subprocess.STDOUT
        ).decode('utf-8')
        lines = output.strip().split('\n')

        # 解析 iostat 输出
        devices = []
        in_device_section = False
        for line in lines:
            if 'Device' in line and 'r/s' in line:
                in_device_section = True
                continue
            if in_device_section and line.strip():
                parts = line.split()
                if len(parts) >= 10:
                    devices.append({
                        'device': parts[0],
                        'rps': float(parts[1]),   # 读请求/s
                        'wps': float(parts[2]),   # 写请求/s
                        'rkb': float(parts[3]),   # 读 KB/s
                        'wkb': float(parts[4]),   # 写 KB/s
                        'await': float(parts[9]), # 平均等待 ms
                        'svctm': float(parts[10]),# 服务时间 ms
                        'util': float(parts[11]),  # 使用率 %
                    })
        result['devices'] = devices
    except (subprocess.CalledProcessError, FileNotFoundError):
        result['error'] = 'iostat not available'

    # 获取磁盘空间
    try:
        df_output = subprocess.check_output(
            ['df', '-h', '--type=ext4', '--type=xfs'],
            stderr=subprocess.STDOUT
        ).decode('utf-8')
        result['disk_usage'] = df_output.strip().split('\n')
    except subprocess.CalledProcessError:
        result['disk_usage'] = []

    return result


def get_network_info() -> Dict:
    """采集网络信息"""
    result = {}
    with open('/proc/net/dev', 'r') as f:
        lines = f.readlines()[2:]  # 跳过标题行
        interfaces = {}
        for line in lines:
            parts = line.split(':')
            if len(parts) != 2:
                continue
            iface = parts[0].strip()
            data = parts[1].split()
            interfaces[iface] = {
                'rx_bytes': int(data[0]),
                'rx_packets': int(data[1]),
                'rx_errors': int(data[2]),
                'rx_drop': int(data[3]),
                'tx_bytes': int(data[8]),
                'tx_packets': int(data[9]),
                'tx_errors': int(data[10]),
                'tx_drop': int(data[11]),
            }
        result['interfaces'] = interfaces

    # 获取网络连接状态
    try:
        ss_output = subprocess.check_output(
            ['ss', '-s'],
            stderr=subprocess.STDOUT
        ).decode('utf-8')
        result['ss_summary'] = ss_output.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    return result


def get_tcp_info() -> Dict:
    """采集 TCP 连接状态统计"""
    result = {}
    states = {
        'established': 0, 'syn_sent': 0, 'syn_recv': 0,
        'fin_wait1': 0, 'fin_wait2': 0, 'time_wait': 0,
        'close': 0, 'close_wait': 0, 'last_ack': 0,
        'listen': 0, 'closing': 0,
    }

    try:
        output = subprocess.check_output(
            ['ss', '-tan'],
            stderr=subprocess.STDOUT
        ).decode('utf-8')
        for line in output.split('\n')[1:]:
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 1:
                state = parts[0].lower()
                if state in states:
                    states[state] += 1
        result['states'] = states
        result['total_connections'] = sum(states.values())

        # 告警：TIME_WAIT 过多
        if states.get('time_wait', 0) > 10000:
            result['warning'] = (
                f"TIME_WAIT 连接数过高: {states['time_wait']}"
            )
        # 告警：CLOSE_WAIT 过多
        if states.get('close_wait', 0) > 1000:
            result['warning'] = (
                f"CLOSE_WAIT 连接数过高: {states['close_wait']}"
            )
    except (subprocess.CalledProcessError, FileNotFoundError):
        result['error'] = 'ss not available'

    return result


def get_jvm_info(pid: Optional[int] = None) -> Optional[Dict]:
    """采集 JVM 信息"""
    result = {}

    # 查找 Java 进程
    if pid is None:
        try:
            output = subprocess.check_output(
                ['pgrep', '-f', 'java'],
                stderr=subprocess.STDOUT
            ).decode('utf-8').strip()
            if not output:
                return None
            pid = int(output.split('\n')[0])
        except (subprocess.CalledProcessError, FileNotFoundError):
            return None

    result['pid'] = pid

    try:
        # GC 统计
        gc_output = subprocess.check_output(
            ['jstat', '-gc', str(pid), '1000', '1'],
            stderr=subprocess.STDOUT
        ).decode('utf-8')
        lines = gc_output.strip().split('\n')
        if len(lines) >= 2:
            parts = lines[1].split()
            result['gc'] = {
                's0c': float(parts[0]),  # Survivor 0 容量 (KB)
                's1c': float(parts[1]),  # Survivor 1 容量
                's0u': float(parts[2]),  # Survivor 0 使用量
                's1u': float(parts[3]),  # Survivor 1 使用量
                'ec': float(parts[4]),   # Eden 容量
                'eu': float(parts[5]),   # Eden 使用量
                'oc': float(parts[6]),   # Old 容量
                'ou': float(parts[7]),   # Old 使用量
                'mc': float(parts[8]),   # Metaspace 容量
                'mu': float(parts[9]),   # Metaspace 使用量
                'ygc': int(parts[12]),   # Young GC 次数
                'ygct': float(parts[13]), # Young GC 耗时
                'fgc': int(parts[14]),   # Full GC 次数
                'fgct': float(parts[15]),# Full GC 耗时
            }
            old_usage = result['gc']['ou'] / result['gc']['oc'] * 100
            result['gc']['old_usage_percent'] = round(old_usage, 2)
    except (subprocess.CalledProcessError, FileNotFoundError, IndexError):
        result['gc_error'] = 'jstat not available'

    try:
        # 线程数
        thread_output = subprocess.check_output(
            ['jstack', '-l', str(pid)],
            stderr=subprocess.STDOUT,
            timeout=10
        ).decode('utf-8')
        thread_count = thread_output.count('"')
        result['thread_count'] = thread_count

        # 死锁检测
        if 'deadlock' in thread_output.lower():
            result['deadlock_detected'] = True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        result['thread_error'] = 'jstack not available'

    return result


def get_mysql_info(host: str = 'localhost',
                   port: int = 3306,
                   user: str = 'root',
                   password: str = '') -> Optional[Dict]:
    """采集 MySQL/TDSQL 信息"""
    result = {}
    try:
        import pymysql
        conn = pymysql.connect(
            host=host, port=port, user=user,
            password=password, connect_timeout=5
        )
        cursor = conn.cursor()

        # 连接数
        cursor.execute("SHOW GLOBAL STATUS LIKE 'Threads_connected'")
        result['threads_connected'] = int(cursor.fetchone()[1])

        cursor.execute("SHOW GLOBAL STATUS LIKE 'Threads_running'")
        result['threads_running'] = int(cursor.fetchone()[1])

        # 慢查询
        cursor.execute("SHOW GLOBAL STATUS LIKE 'Slow_queries'")
        result['slow_queries'] = int(cursor.fetchone()[1])

        # QPS
        cursor.execute("SHOW GLOBAL STATUS LIKE 'Questions'")
        questions_before = int(cursor.fetchone()[1])
        time.sleep(1)
        cursor.execute("SHOW GLOBAL STATUS LIKE 'Questions'")
        questions_after = int(cursor.fetchone()[1])
        result['qps'] = questions_after - questions_before

        # InnoDB 状态
        cursor.execute("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests'")
        result['innodb_read_requests'] = int(cursor.fetchone()[1])

        cursor.execute("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_reads'")
        result['innodb_reads'] = int(cursor.fetchone()[1])

        # 缓存命中率
        total_reads = result['innodb_read_requests']
        disk_reads = result['innodb_reads']
        if total_reads > 0:
            result['buffer_pool_hit_rate'] = round(
                (1 - disk_reads / total_reads) * 100, 2
            )

        # 长事务
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.innodb_trx
            WHERE TIME_TO_SEC(TIMEDIFF(NOW(), trx_started)) > 30
        """)
        result['long_running_transactions'] = cursor.fetchone()[0]

        conn.close()
    except ImportError:
        result['error'] = 'pymysql not installed'
    except Exception as e:
        result['error'] = str(e)

    return result


def get_redis_info(host: str = 'localhost',
                   port: int = 6379,
                   password: str = '') -> Optional[Dict]:
    """采集 Redis 信息"""
    result = {}
    try:
        import redis
        r = redis.Redis(
            host=host, port=port,
            password=password or None,
            socket_connect_timeout=5
        )
        info = r.info()

        result['used_memory_human'] = info.get('used_memory_human')
        result['used_memory_peak_human'] = info.get('used_memory_peak_human')
        result['total_connections_received'] = info.get('total_connections_received')
        result['connected_clients'] = info.get('connected_clients')
        result['instantaneous_ops_per_sec'] = info.get('instantaneous_ops_per_sec')
        result['keyspace_hitrate'] = round(
            info.get('keyspace_hits', 0) / max(
                info.get('keyspace_hits', 0) + info.get('keyspace_misses', 1), 1
            ) * 100, 2
        )

        # 慢查询
        slow_log = r.slowlog_get(5)
        result['recent_slow_commands'] = [
            {
                'duration_us': entry['duration'],
                'command': ' '.join(entry['args']),
                'time': datetime.fromtimestamp(entry['start_time']).isoformat()
            }
            for entry in slow_log
        ]

        # 大 Key 扫描（仅对小于 1000 个 key 的实例安全）
        if info.get('db0', {}).get('keys', 0) < 1000:
            big_keys = []
            for key in r.scan_iter(count=100):
                try:
                    type_ = r.type(key)
                    if type_ == b'string':
                        size = r.strlen(key)
                    elif type_ == b'list':
                        size = r.llen(key)
                    elif type_ == b'set':
                        size = r.scard(key)
                    elif type_ == b'zset':
                        size = r.zcard(key)
                    elif type_ == b'hash':
                        size = r.hlen(key)
                    else:
                        continue
                    if size > 10000:
                        big_keys.append({
                            'key': key.decode(),
                            'type': type_.decode(),
                            'size': size
                        })
                except Exception:
                    continue
            result['big_keys'] = big_keys

    except ImportError:
        result['error'] = 'redis-py not installed'
    except Exception as e:
        result['error'] = str(e)

    return result


def generate_recommendations(report: PerfReport) -> List[str]:
    """根据采集数据生成优化建议"""
    recs = []

    # CPU 建议
    cpu_usage = report.cpu.get('usage_percent', 0)
    if cpu_usage > 80:
        recs.append(f"CPU 使用率 {cpu_usage}% 过高，建议使用火焰图分析热点函数")
    load = report.cpu.get('load_1min', 0)
    cores = report.cpu.get('core_count', 1)
    if load > cores * 0.7:
        recs.append(f"CPU 负载 {load:.2f} 偏高（核心数 {cores}），建议扩容或优化代码")

    # 内存建议
    mem_usage = report.memory.get('usage_percent', 0)
    if mem_usage > 85:
        recs.append(f"内存使用率 {mem_usage}% 过高，建议检查是否有内存泄漏")
    if report.memory.get('available_gb', 0) < 1:
        recs.append("可用内存不足 1GB，建议扩容或排查内存泄漏")

    # 磁盘建议
    for dev in report.disk.get('devices', []):
        if dev.get('util', 0) > 80:
            recs.append(f"磁盘 {dev['device']} 使用率 {dev['util']}% 过高，建议升级云硬盘或优化 I/O")
        if dev.get('await', 0) > 30:
            recs.append(f"磁盘 {dev['device']} 平均等待 {dev['await']}ms，建议检查是否有排队")

    # TCP 建议
    tcp_states = report.tcp.get('states', {})
    if tcp_states.get('time_wait', 0) > 10000:
        recs.append(f"TIME_WAIT 连接数 {tcp_states['time_wait']} 过高，建议启用 tcp_tw_reuse")
    if tcp_states.get('close_wait', 0) > 1000:
        recs.append(f"CLOSE_WAIT 连接数 {tcp_states['close_wait']} 过高，建议检查应用层连接管理")

    # JVM 建议
    if report.jvm:
        gc = report.jvm.get('gc', {})
        if gc.get('old_usage_percent', 0) > 70:
            recs.append(f"JVM Old 区使用率 {gc['old_usage_percent']}%，建议增大堆内存或排查内存泄漏")
        if gc.get('fgc', 0) > 10:
            recs.append(f"Full GC 次数 {gc['fgc']}，建议优化 GC 参数或排查内存泄漏")
        if report.jvm.get('deadlock_detected'):
            recs.append("检测到 JVM 死锁！请立即使用 jstack 分析")

    # MySQL 建议
    if report.mysql:
        if report.mysql.get('buffer_pool_hit_rate', 100) < 95:
            recs.append(f"InnoDB 缓冲池命中率 {report.mysql['buffer_pool_hit_rate']}%，建议增大 buffer_pool_size")
        if report.mysql.get('slow_queries', 0) > 100:
            recs.append(f"慢查询累计 {report.mysql['slow_queries']} 次，建议开启慢查询日志并分析")
        if report.mysql.get('long_running_transactions', 0) > 5:
            recs.append(f"长事务数 {report.mysql['long_running_transactions']}，建议排查事务未提交问题")

    # Redis 建议
    if report.redis:
        if report.redis.get('keyspace_hitrate', 100) < 90:
            recs.append(f"Redis 缓存命中率 {report.redis['keyspace_hitrate']}%，建议检查过期策略")
        if report.redis.get('big_keys'):
            recs.append(f"发现 {len(report.redis['big_keys'])} 个大 Key，建议拆分或使用 UNLINK 删除")

    return recs


def run_diagnostics(args: argparse.Namespace) -> PerfReport:
    """执行全链路诊断"""
    print("=" * 60)
    print("腾讯云全链路性能分析工具 v1.0")
    print(f"时间: {datetime.now().isoformat()}")
    print("=" * 60)

    report = PerfReport(
        timestamp=datetime.now().isoformat(),
        hostname=socket.gethostname(),
        cpu={},
        memory={},
        disk={},
        network={},
        tcp={},
    )

    # CPU
    print("\n[1/6] 采集 CPU 信息...")
    report.cpu = get_cpu_info()
    print(f"  CPU 使用率: {report.cpu.get('usage_percent', 'N/A')}%")
    print(f"  负载: {report.cpu.get('load_1min', 'N/A')} / {report.cpu.get('core_count', 'N/A')} 核")

    # 内存
    print("\n[2/6] 采集内存信息...")
    report.memory = get_memory_info()
    print(f"  内存: {report.memory.get('available_gb', 'N/A')}GB / {report.memory.get('total_gb', 'N/A')}GB 可用")
    print(f"  使用率: {report.memory.get('usage_percent', 'N/A')}%")

    # 磁盘
    print("\n[3/6] 采集磁盘信息...")
    report.disk = get_disk_info()
    for dev in report.disk.get('devices', []):
        print(f"  {dev['device']}: util={dev['util']}%, await={dev['await']}ms")

    # 网络
    print("\n[4/6] 采集网络信息...")
    report.network = get_network_info()
    for iface, data in report.network.get('interfaces', {}).items():
        if iface == 'lo':
            continue
        rx_mb = data['rx_bytes'] / 1024 / 1024
        tx_mb = data['tx_bytes'] / 1024 / 1024
        print(f"  {iface}: RX={rx_mb:.1f}MB, TX={tx_mb:.1f}MB")

    # TCP
    print("\n[5/6] 采集 TCP 连接信息...")
    report.tcp = get_tcp_info()
    states = report.tcp.get('states', {})
    print(f"  总连接: {report.tcp.get('total_connections', 'N/A')}")
    print(f"  ESTAB: {states.get('established', 0)}, "
          f"TIME_WAIT: {states.get('time_wait', 0)}, "
          f"CLOSE_WAIT: {states.get('close_wait', 0)}")

    # JVM / MySQL / Redis
    if not args.skip_jvm:
        print("\n[6/6] 采集 JVM 信息...")
        report.jvm = get_jvm_info(args.pid)
        if report.jvm:
            gc = report.jvm.get('gc', {})
            print(f"  PID: {report.jvm.get('pid', 'N/A')}")
            print(f"  Old 区使用率: {gc.get('old_usage_percent', 'N/A')}%")
            print(f"  Full GC: {gc.get('fgc', 'N/A')} 次")
        else:
            print("  未发现 Java 进程")

    if args.mysql_host:
        print("\n[额外] 采集 MySQL/TDSQL 信息...")
        report.mysql = get_mysql_info(
            args.mysql_host, args.mysql_port,
            args.mysql_user, args.mysql_password
        )
        if report.mysql and 'error' not in report.mysql:
            print(f"  连接数: {report.mysql.get('threads_connected', 'N/A')}")
            print(f"  QPS: {report.mysql.get('qps', 'N/A')}")
            print(f"  缓冲池命中率: {report.mysql.get('buffer_pool_hit_rate', 'N/A')}%")
        else:
            print(f"  MySQL 采集失败: {report.mysql.get('error', '未知错误')}")

    if args.redis_host:
        print("\n[额外] 采集 Redis 信息...")
        report.redis = get_redis_info(
            args.redis_host, args.redis_port, args.redis_password
        )
        if report.redis and 'error' not in report.redis:
            print(f"  内存: {report.redis.get('used_memory_human', 'N/A')}")
            print(f"  OPS: {report.redis.get('instantaneous_ops_per_sec', 'N/A')}")
            print(f"  命中率: {report.redis.get('keyspace_hitrate', 'N/A')}%")
        else:
            print(f"  Redis 采集失败: {report.redis.get('error', '未知错误')}")

    # 生成建议
    print("\n" + "=" * 60)
    print("优化建议")
    print("=" * 60)
    report.recommendations = generate_recommendations(report)
    if report.recommendations:
        for i, rec in enumerate(report.recommendations, 1):
            print(f"  {i}. {rec}")
    else:
        print("  未发现明显性能问题")

    return report


def main():
    parser = argparse.ArgumentParser(
        description='腾讯云全链路性能分析工具'
    )
    parser.add_argument('--pid', type=int, help='Java 进程 PID')
    parser.add_argument('--skip-jvm', action='store_true', help='跳过 JVM 采集')
    parser.add_argument('--mysql-host', help='MySQL/TDSQL 主机地址')
    parser.add_argument('--mysql-port', type=int, default=3306)
    parser.add_argument('--mysql-user', default='root')
    parser.add_argument('--mysql-password', default='')
    parser.add_argument('--redis-host', help='Redis 主机地址')
    parser.add_argument('--redis-port', type=int, default=6379)
    parser.add_argument('--redis-password', default='')
    parser.add_argument('--output', '-o', help='输出 JSON 文件路径')
    args = parser.parse_args()

    report = run_diagnostics(args)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(asdict(report), f, ensure_ascii=False, indent=2)
        print(f"\n报告已保存: {args.output}")


if __name__ == '__main__':
    main()
```

### 16.5.4 腾讯云 TKE 容器性能监控

在腾讯云 TKE（Tencent Kubernetes Engine）环境中，容器级别的性能监控需要额外关注：

```yaml
# 部署性能采集 DaemonSet
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: perf-agent
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: perf-agent
  template:
    metadata:
      labels:
        app: perf-agent
    spec:
      hostPID: true
      containers:
      - name: perf-agent
        image: perf-agent:latest
        securityContext:
          privileged: true
        volumeMounts:
        - name: proc
          mountPath: /host/proc
          readOnly: true
      volumes:
      - name: proc
        hostPath:
          path: /proc
```

容器环境性能分析要点：

1. **资源限制**：检查 Pod 的 CPU/Memory limits 是否合理，避免 Limit 设置过低导致容器被 throttled。
2. **节点资源争抢**：使用 `kubectl top node` 和 `kubectl top pod` 查看资源分配。
3. **网络 CNI 插件**：腾讯云 TKE 默认使用 tke-eni 或 tke-route 模式，不同模式对网络性能有显著影响。

```bash
# 查看 Pod CPU throttling
kubectl exec -it <pod> -- cat /sys/fs/cgroup/cpu/cpu.stat | grep throttled

# 查看容器网络延迟
kubectl exec -it <pod> -- ping -c 10 <target-service>
```

### 16.5.5 性能优化闭环

持续性能优化不是一次性活动，而是一个闭环流程：

```
┌─────────────────────────────────────────────────────┐
│  ① 建立基线 → ② 持续监控 → ③ 发现劣化 → ④ 定位根因  │
│         ↑                              ↓           │
│         └── ⑥ 验证效果 ← ⑤ 实施优化 ←──┘           │
└─────────────────────────────────────────────────────┘
```

每个环节的关键实践：

**① 建立基线**
- 在每次大版本发布后更新性能基线
- 记录 P50/P90/P99/吞吐量四个核心指标
- 保存基线到版本控制系统中

**② 持续监控**
- 使用腾讯云 Prometheus 监控服务（TPM）采集指标
- 设置多级告警（Warning / Critical）
- 告警阈值基于基线动态调整，避免静态阈值导致的误报

**③ 发现劣化**
- 自动化性能回归测试在 CI/CD 中运行
- 对比当前结果与基线，超过阈值则阻断发布
- 记录性能劣化趋势，提前发现潜在问题

**④ 定位根因**
- 使用本章介绍的工具链（火焰图、堆转储、线程转储、慢查询分析）
- 从全链路视角分析，避免局部优化
- 记录根因分析过程到知识库

**⑤ 实施优化**
- 制定优化方案，评估收益和风险
- 在灰度环境验证，逐步放量
- 回滚预案就绪

**⑥ 验证效果**
- 对比优化前后的性能指标
- 确认优化未引入新的问题
- 更新性能基线

---

## 16.6 典型性能问题案例集

### 案例一：TKE Pod CPU Throttling

**现象**：服务延迟周期性飙升，P99 从 20ms 跳到 500ms。

**排查**：
```bash
# 查看 Pod CPU 限制
kubectl get pod <pod> -o json | jq '.spec.containers[0].resources'

# 查看 CPU throttling
cat /sys/fs/cgroup/cpu/cpu.stat
# nr_throttled: 15230
# throttled_time: 4523012345
```

**根因**：Pod 的 CPU limit 设置为 1 核，但服务实际需要 2 核。CFS 调度器对超过 limit 的线程进行 throttling，导致周期性停顿。

**解决**：将 CPU limit 调整为 2 核，并配置合适的 CPU request。

### 案例二：TDSQL 连接风暴

**现象**：应用启动时大量请求超时，TDSQL 监控显示连接数瞬间飙升至 2000+。

**排查**：
```sql
-- 查看当前连接数
SHOW STATUS LIKE 'Threads_connected';
-- 结果: 2048

-- 查看连接来源
SELECT SUBSTRING_INDEX(host, ':', 1) AS ip, COUNT(*) AS cnt
FROM information_schema.processlist
GROUP BY ip
ORDER BY cnt DESC;
```

**根因**：应用启动时，20 个 Pod 同时初始化，每个 Pod 的 HikariCP 连接池配置了 `maximum-pool-size: 100`，导致瞬间建立 2000 个连接，超过 TDSQL 最大连接数。

**解决**：
1. 降低连接池大小：`maximum-pool-size: 20`
2. 使用腾讯云 TDSQL 的连接池管理功能
3. 应用启动时增加初始化延迟，避免同时建立连接

### 案例三：Redis 缓存雪崩

**现象**：凌晨 0 点数据库负载飙升 10 倍，大量查询超时。

**排查**：
```bash
# 查看 Redis 过期 Key 数量
redis-cli info keyspace
# db0:keys=50000,expires=48000,avg_ttl=0

# 查看数据库慢查询
# 发现大量相同的全表扫描查询
```

**根因**：所有缓存 Key 设置了相同的过期时间（24 小时），导致凌晨 0 点同时过期。大量请求穿透到数据库。

**解决**：
```java
// 在过期时间上增加随机偏移
long baseTtl = 86400; // 24 小时
long randomOffset = ThreadLocalRandom.current().nextLong(3600); // 0-1 小时随机
redisTemplate.expire(key, baseTtl + randomOffset, TimeUnit.SECONDS);
```

---

## 16.7 本章小结

性能分析是 SRE 工作中最具技术深度的领域之一。本章从代码级、数据库、网络和持续优化四个维度，系统性地介绍了腾讯云环境下的性能分析方法论：

1. **代码级剖析**：火焰图定位 CPU 热点，堆转储分析内存泄漏，线程转储诊断锁竞争。
2. **数据库分析**：慢查询日志 + EXPLAIN 执行计划分析，Redis 大 Key 和热 Key 治理。
3. **网络分析**：mtr 路径诊断，tcpdump 抓包分析，CLB 和 API 网关性能监控。
4. **持续优化**：建立基线、自动化回归、全链路诊断脚本、优化闭环流程。

核心原则：**先测量，后优化。没有数据的优化是盲目的，没有基线的测量是无意义的。** 在腾讯云环境中，充分利用云平台提供的监控和诊断工具，结合本章介绍的方法论，可以系统性地发现和解决性能问题。
