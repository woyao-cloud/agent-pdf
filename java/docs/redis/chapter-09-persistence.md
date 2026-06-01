# 第9章 持久化机制与数据恢复

## 9.1 RDB（快照）原理

### RDB 的工作流程

RDB 是 Redis 的**全量快照**持久化方式——将某个时刻的所有内存数据写入一个二进制文件（dump.rdb）：

```
RDB 持久化流程：

  ┌─────────┐      save/bgsave       ┌──────────────┐
  │         │ ──────────────────────► │   dump.rdb    │
  │  Redis  │                        │  (二进制文件)   │
  │  内存    │                        │               │
  │  数据    │     启动时加载          │  RDB 格式      │
  │         │ ◄────────────────────── │  Magic + 数据  │
  └─────────┘                        └──────────────┘

  BGSave 的具体步骤：
  1. fork() 子进程（主进程暂停处理命令 → 通常 < 1ms）
  2. 子进程开始将数据写入临时 RDB 文件
  3. 主进程继续处理命令（通过 COW 机制共享内存）
  4. 子进程写入完成，用临时文件原子替换旧 RDB 文件
```

### fork() 与 COW（写时复制）

RDB 的核心机制是 **fork()** + **COW（Copy-on-Write）**。这是 Unix 系统的进程复制机制：

```
fork() 之后的内存共享：

  fork() 瞬间：
  ┌──────────────────────┐    ┌──────────────────────┐
  │  父进程（Redis 主）     │    │  子进程（BGSave）     │
  │                        │    │                       │
  │  页表指向物理内存       │    │  页表指向**同一块**    │
  │                        │    │  物理内存             │
  │  [A] [B] [C] [D]       │    │  [A] [B] [C] [D]     │
  │                        │    │                       │
  │  物理内存：             │    │                       │
  │  ┌──┬──┬──┬──┐         │    │  （共享，不复制）      │
  │  │A │B │C │D │         │    │                       │
  │  └──┴──┴──┴──┘         │    │                       │
  └──────────────────────┘    └──────────────────────┘

  父进程修改数据 A → 发生 COW：
  ┌──────────────────────┐    ┌──────────────────────┐
  │  父进程               │    │  子进程              │
  │  页表指向**新复制**    │    │  页表指向**原始**     │
  │                       │    │                      │
  │  [A'] [B] [C] [D]    │    │  [A] [B] [C] [D]    │
  │                       │    │                      │
  │  物理内存：             │    │                      │
  │  ┌──┬──┬──┬──┬──┐     │    │                      │
  │  │A'│B │C │D │A │     │    │                      │
  │  └──┴──┴──┴──┴──┘     │    │                      │
  │      ↑    ↑           │    │                      │
  │     父   子            │    │                      │
  └──────────────────────┘    └──────────────────────┘

  ⚠️ 关键影响：
     - fork() 内存占用量 ≈ fork 瞬间使用的物理内存
     - COW 意味着 BGSave 期间有数据修改 → 需要额外内存
     - 如果 BGSave 期间写入量极大（修改了大部分数据），
       最终内存占用 ≈ 2 倍当前数据集
```

**RDB 的缺点——丢失数据窗口**：

```bash
# redis.conf 中 RDB 的触发条件（默认）
save 900 1        # 900 秒（15 分钟）内至少 1 次修改
save 300 10       # 300 秒（5 分钟）内至少 10 次修改
save 60 10000     # 60 秒内至少 10000 次修改

# 如果每隔 15 分钟才触发一次 RDB，最坏情况丢 15 分钟的数据！
# 这就是为什么生产环境必须配合 AOF
```

### 手动触发 RDB

```bash
# 同步保存（阻塞主进程，不推荐在生产使用）
redis-cli SAVE

# 异步保存（主进程 fork 子进程处理，推荐）
redis-cli BGSAVE

# 查看上次 RDB 成功时间
redis-cli LASTSAVE

# 查看 RDB 信息
redis-cli INFO persistence
# → rdb_last_save_time:1700000000
# → rdb_last_bgsave_status:ok
# → rdb_current_bgsave_time_sec:-1
```

---

## 9.2 AOF（追加文件）原理

### AOF 的工作流程

AOF（Append-Only File）记录**每一条写命令**，以 Redis 协议格式追加到文件中。重启时逐条重放这些命令来恢复数据。

```
AOF 记录格式（实际是 Redis 协议，这里简化）：

  SET user:1001 "John"
  INCR counter:page:about
  LPUSH queue:task "msg1"

  AOF 文件内容（直接 cat 可以看到明文命令）：
  *3
  $3
  SET
  $10
  user:1001
  $4
  John
  *2
  $5
  INCR
  $19
  counter:page:about
```

### fsync 策略

将 AOF 缓冲区数据写入磁盘的频率，决定了数据安全性和性能的平衡：

```bash
# redis.conf AOF 配置
appendonly yes          # 开启 AOF
appendfilename "appendonly.aof"
appendfsync everysec    # 每秒 fsync 一次（推荐）

# fsync 策略对比
# appendfsync always    # 每次写操作都 fsync（最安全，最慢）
# appendfsync no        # 由操作系统决定何时写入（最快，最不安全）
```

| fsync 策略 | 数据安全性 | 性能 | 适用场景 |
|-----------|-----------|------|---------|
| **always** | 每次写操作后立即刷盘，最多丢 1 次操作 | 约 1000-3000 TPS | 金融交易、需最高可靠性 |
| **everysec** | 每秒刷盘一次，最多丢 1 秒数据 | 约 30000-50000 TPS | **生产环境默认推荐** |
| **no** | 由 OS 决定（通常 30 秒），可能丢大量数据 | 约 50000+ TPS | 可容忍丢失的缓存场景 |

```
AOF 写入流程（everysec 策略）：

  主线程                            后台线程                    磁盘
    │                                │                        │
    │ 写命令到达                       │                        │
    │ SET user 1001                   │                        │
    │ │                               │                        │
    │ ▼                               │                        │
    │ 写入 AOF 缓冲区                   │                        │
    │ ┌──────────────────┐            │                        │
    │ │ SET user 1001    │            │                        │
    │ │ INCR counter     │            │                        │
    │ │ ...              │            │                        │
    │ └──────────────────┘            │                        │
    │                                │                        │
    │ 每秒触发                      │                        │
    │ ───────────────────────────►  │ 执行 fsync              │
    │                                │ ──────────────────────► │
    │                                │                        │
    │                                │ fsync 完成              │
    │                                │ ◄────────────────────── │
    │                                │                        │
    │ 主线程不阻塞，继续处理命令      │                        │
```

### AOF 重写机制

AOF 文件会随着时间不断增长——一个 key 被 SET 了 1000 次，AOF 中就记录了 1000 条 SET 命令，但恢复时只需要最后一条。**AOF 重写（bgrewriteaof）** 就是为了解决这个问题。

```
AOF 重写前后对比：

  重写前 AOF（10000 条命令，10MB）：
    SET counter 1
    SET counter 2
    SET counter 3
    ...（10000 次 INCR）
    SET counter 10000
    LPUSH list A
    LPUSH list B
    LPUSH list C
    ...（5000 次 LPUSH）
    LPUSH list Z

  重写后 AOF（2 条命令，不到 1KB）：
    *3\r\n$3\r\nSET\r\n$7\r\ncounter\r\n$5\r\n10000\r\n
    *5\r\n$5\r\nRPUSH\r\n$4\r\nlist\r\n$1\r\nZ\r\n$1\r\n...
    ↑ Redis 自己反读内存中的数据，重新生成最小的 AOF

  ⚠️ 特别注意：
     AOF 重写是** Redis 4.0 之后是混合持久化的基础**
     重写过程会 fork 子进程，与 BGSave 类似，也会产生 COW 开销
```

```bash
# 自动触发重写（redis.conf）
auto-aof-rewrite-percentage 100    # AOF 文件比上次基础增长 100%（即翻倍）时触发
auto-aof-rewrite-min-size 64mb     # AOF 文件至少 64MB 才触发

# 手动触发
redis-cli BGREWRITEAOF

# 监控重写状态
redis-cli INFO persistence
# → aof_current_size: 128MB       ← 当前 AOF 大小
# → aof_base_size: 64MB           ← 上次重写后的基础大小
# → aof_rewrite_in_progress: 0    ← 是否正在重写
```

---

## 9.3 混合持久化（推荐）

### RDB + AOF 结合方案

Redis 4.0+ 引入了**混合持久化**——AOF 重写时，将当前内存数据以 RDB 格式写入 AOF 文件开头，后续增量写入继续以 AOF 格式追加。

```
混合持久化的 AOF 文件结构：
  ┌────────────────────────────────────────────────┐
  │  RDB 格式（二进制，紧凑）                       │
  │  ┌────────────────────────────────────────┐     │
  │  │ Redis 在重写时刻的**全量快照**           │     │
  │  │（用 RDB 格式存储，比 AOF 小 3-5 倍）    │     │
  │  └────────────────────────────────────────┘     │
  │  ───────────────────────────────────────────     │
  │  AOF 格式（文本协议，增量）                      │
  │  ┌────────────────────────────────────────┐     │
  │  │ 重写之后的增量写命令                    │     │
  │  │（直到下一次重写为止）                   │     │
  │  └────────────────────────────────────────┘     │
  └────────────────────────────────────────────────┘

  启动加载时：
  1. Redis 识别 AOF 文件开头的 RDB 格式 → 直接加载到内存（快！）
  2. 继续重放 AOF 格式的增量命令 → 补全最后几秒的变更
  3. 整个加载时间比纯 AOF 快 **3-5 倍**
```

**为什么混合持久化是推荐方案？**：

| 维度 | 纯 RDB | 纯 AOF | 混合持久化 |
|------|--------|--------|-----------|
| 文件大小 | 小（快照） | 大（逐条命令） | 中（RDB 开头 + 小量 AOF） |
| 加载速度 | **最快**（直接加载到内存） | 慢（逐条重放） | **快**（RDB 加载 + 少量重放） |
| 数据丢失 | 可能丢 5-60 分钟 | 最多丢 1 秒（everysec） | 最多丢 1 秒 |
| 可读性 | 二进制，不可读 | **纯文本，可读** | 开头不可读，尾部可读 |

```bash
# redis.conf 开启混合持久化（Redis 4.0+）
aof-use-rdb-preamble yes

# 同时开启 RDB + AOF（生产标准配置）
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
aof-use-rdb-preamble yes
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

### 数据恢复实验

```bash
# 实验：模拟 Redis 宕机后的数据恢复

# 1. 写入数据
redis-cli SET user:1001 "John"
redis-cli INCR counter
redis-cli LPUSH queue task1

# 2. 模拟宕机：强制 kill Redis 进程
redis-cli DEBUG SEGFAULT

# 3. 重启 Redis
redis-server /path/to/redis.conf

# 4. 检查数据是否恢复
redis-cli GET user:1001     # → "John"（应该恢复）
redis-cli GET counter        # → "1"
redis-cli LRANGE queue 0 -1  # → "task1"
```

### 生产环境持久化配置模板

```bash
# redis.conf 持久化配置（生产推荐）
# ===== 混合持久化 =====
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes    # BGSave 失败时禁止写入
rdbcompression yes                 # RDB 压缩（用 LZF）
rdbchecksum yes                    # RDB 校验和

appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec               # 每秒 fsync
no-appendfsync-on-rewrite no       # 重写时是否不 fsync

aof-use-rdb-preamble yes           # 混合持久化（关键！）
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# ===== 注意事项 =====
# 1. 如果同时用 RDB + AOF，Redis 启动时**只加载 AOF**
#    （因为 AOF 数据更完整）
# 2. AOF 文件损坏时可以用 redis-check-aof 修复
# 3. RDB 适合做定时备份（复制到灾备机房）
```

---

## 本章总结

| 机制 | 数据安全级别 | 恢复速度 | 磁盘占用 | 性能影响 |
|------|------------|---------|---------|---------|
| **RDB** | 低（丢 5-60 分钟） | **最快** | 小 | 中（fork + COW） |
| **AOF everysec** | 中（丢 1 秒） | 慢 | 大 | 低（后台 fsync） |
| **AOF always** | **最高（丢 1 次操作）** | 慢 | 很大 | 高（每次 fsync） |
| **混合持久化** | 中（丢 1 秒） | **快** | 中 | 中 |

**核心原则**：
1. **永远开启持久化**——即使只是缓存场景，没有持久化的 Redis 宕机后重建缓存可能把 DB 打挂
2. **优先选择混合持久化**——它结合了 RDB 的加载速度和 AOF 的数据安全性
3. `appendfsync everysec` 是性能和安全的黄金平衡点
4. **定期验证 RDB/AOF 文件的可用性**——一个损坏的备份等于没有备份

```bash
# AOF 文件修复
redis-check-aof --fix appendonly.aof

# RDB 文件检查
redis-check-rdb dump.rdb

# 定期备份到远程
# crontab 每小时将 RDB 复制到 S3/OSS
0 * * * * cp /data/redis/dump.rdb /backup/redis/dump-$(date +\%Y\%m\%d\%H).rdb
```