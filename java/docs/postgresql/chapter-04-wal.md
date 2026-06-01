# 第4章 WAL与持久化

## 4.1 什么是WAL

### WAL的设计哲学

WAL（Write-Ahead Logging，预写式日志）是现代关系型数据库持久化的基石。它的核心原则非常简单：**在修改数据文件之前，先写日志**。

为什么需要先写日志？考虑一个简单的更新操作：`UPDATE accounts SET amount = 0 WHERE id = 1`。如果直接修改数据文件，过程中系统断电会发生什么？可能数据文件只写了一半（partial write），数据库重启后无法确定这条数据的状态——到底是改了还是没改？

WAL解决了这个问题：

```
事务提交流程：
1. 修改shared_buffers中的数据页（脏页）
2. 将修改操作记录写入WAL缓冲区（内存）
3. 事务提交时，将WAL缓冲区刷入WAL段文件（磁盘 fsync）
4. 后台数据写入器将脏页写入数据文件（异步，可以稍后完成）

关键：第3步完成（WAL落盘）后，即使系统崩溃，数据不会丢失
恢复时：从WAL中重放（REDO）已提交但尚未写入数据文件的修改
```

### WAL文件结构

WAL段文件存储在 `pg_wal/` 目录中，每个文件固定大小为16MB：

```
pg_wal/
├── 000000010000000000000001  -- 第1个WAL段
├── 000000010000000000000002  -- 第2个WAL段
└── ...

文件名含义：00000001 (timeline) 00000000 (log id) 00000001 (log segment)
```

每个WAL段内部包含多个WAL记录。每条WAL记录对应一个原子修改操作（如插入一行、更新一行、提交事务）：

```
WAL段内部结构：
┌──────────────────────────────────┐
│ WAL Record 1: INSERT INTO users  │ ← LSN: 0/16B0A1C8
│ WAL Record 2: INSERT INTO orders │ ← LSN: 0/16B0A2D0
│ WAL Record 3: COMMIT TRANSACTION │ ← LSN: 0/16B0A3E8
│ ...                              │
└──────────────────────────────────┘
```

每条WAL记录都有一个唯一的LSN（Log Sequence Number）。LSN是WAL中的字节偏移量，格式为 `32位段号:32位段内偏移`。例如 `0/16B0A1C8` 表示第0个日志段中偏移量16B0A1C8处的WAL记录。

### LSN的作用

LSN在PostgreSQL中有多种用途：

1. **事务提交确认**：事务提交时，`pg_current_wal_lsn()` 返回该事务提交记录的位置
2. **复制进度追踪**：从库通过 `pg_last_wal_replay_lsn()` 追踪恢复进度
3. **数据页版本确认**：每个数据页头部记录了"最近修改该页的LSN"（`pd_lsn`），用于判断是否需要应用Full Page Image

```sql
-- 查看当前WAL写入位置
SELECT pg_current_wal_lsn();        -- 0/1A2B3C4D

-- 查看当前WAL刷入位置
SELECT pg_current_wal_flush_lsn();

-- 查看当前WAL文件
SELECT pg_walfile_name(pg_current_wal_lsn());

-- LSN间的字节差
SELECT '0/1A2B3C4D'::pg_lsn - '0/1A2B3C0A'::pg_lsn AS bytes_diff;  -- 1091
```

## 4.2 检查点机制

### 检查点的作用

检查点是PostgreSQL维护数据一致性的机制。它的作用是**将所有脏页写入磁盘**，确保从某个点开始，数据文件已经包含了所有已提交事务的修改：

```
没有检查点的崩溃恢复：
需要重放从"创世之初"到崩溃点的所有WAL → 恢复时间无限长

有检查点的崩溃恢复：
只需要重放从"上一个检查点"到崩溃点的WAL → 恢复时间可控
```

### 检查点触发条件

```sql
-- 查看检查点相关配置
SHOW checkpoint_timeout;           -- 默认 5min
SHOW max_wal_size;                 -- 默认 1GB
SHOW checkpoint_completion_target; -- 默认 0.9
```

检查点在以下情况触发：
1. **时间到达**：距离上次检查点超过 `checkpoint_timeout`（默认5分钟）
2. **WAL大小超过**：`max_wal_size`（默认1GB）
3. **手动触发**：执行 `CHECKPOINT` 命令

### 检查点的影响

检查点期间，Checkpointer进程会扫描shared_buffers中的所有脏页并将它们写入磁盘。如果脏页数量很大（shared_buffers很大，且写入量很大），检查点会导致大量的磁盘I/O，可能影响业务查询的性能。

`checkpoint_completion_target` 参数控制检查点写入的速率：值为0.9表示检查点应该在前一个检查点区间的90%时间内完成。将这个值设置得接近1.0，可以让检查点的I/O更平缓地分散在检查点区间内，减少对业务的影响代价。

```sql
-- 查看检查点统计
SELECT *
FROM pg_stat_bgwriter;
```

## 4.3 Full Page Writes

### 为什么需要Full Page Writes

这是一个很多人不知道但非常重要的问题。PostgreSQL的数据页通常大小是8KB。操作系统写入磁盘的最小单位是512字节（扇区）。如果PostgreSQL正在写入一个8KB的数据页时系统崩溃，可能出现的情况是：数据页只写了一部分（比如只有前4KB写入成功了），导致数据页处于损坏状态。

当PostgreSQL在崩溃恢复时重放WAL，如果WAL记录的是"将第100行的amount从100改为0"，它需要一个**完整的、一致的数据页**来应用这个修改。但如果数据页本身是损坏的（partial write），应用WAL记录的结果也是错误的。

**解决方案**：在检查点后的**第一次修改**某个数据页时，将整个8KB数据页（Full Page Image）写入WAL，而不仅仅写入修改的增量。这样恢复时，先用Full Page Image恢复数据页，再在上面应用增量修改。

### Full Page Writes的性能影响

```sql
-- 查看Full Page Writes配置
SHOW full_page_writes;  -- 默认 on
```

开启Full Page Writes后，WAL的写入量会显著增加——每次检查点后的第一次修改，8KB的数据页会被完整写入WAL。对于频繁全表扫描或大量更新的工作负载，WAL写入量可能增加数倍。

但要注意：**永远不要关闭 `full_page_writes`**，除非你使用的是支持原子写入的硬件（如某些企业级SSD或ZFS文件系统）。关闭后，一旦崩溃，数据损坏的风险极高。

## 4.4 归档与PITR

### WAL归档

WAL归档是PostgreSQL实现时间点恢复（PITR）的基础。通过将已写满的WAL段文件复制到归档位置，可以在需要时从任意时间点还原数据库：

```sql
-- postgresql.conf 配置
archive_mode = on
archive_command = 'cp %p /archive/%f'
-- %p: 归档的WAL段源路径
-- %f: 归档的WAL段文件名
```

归档的工作流程：
1. WAL Writer写满一个16MB的WAL段文件
2. PostgreSQL在归档目录中生成新的WAL段文件
3. 归档进程调用 archive_command 将WAL段复制到归档位置
4. 归档成功后，该WAL段可以从主目录中删除（由checkpoint决定）

### PITR恢复流程

```bash
# 1. 恢复配置（在postgresql.conf中）
restore_command = 'cp /archive/%f %p'
recovery_target_time = '2024-10-01 14:30:00'

# 2. 创建恢复信号文件
touch /var/lib/postgresql/data/recovery.signal

# 3. 启动PostgreSQL
# 数据库会自动从WAL归档中恢复数据，直到目标时间点

# 4. 恢复完成后，数据库处于只读模式
# 确认数据正确后，通过 pg_wal_replay_resume() 恢复写入
```

## 4.5 Docker Compose：WAL与归档环境

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: testdb
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./archive:/archive
    command: >
      -c wal_level=replica
      -c archive_mode=on
      -c archive_command='cp %p /archive/%f'
      -c full_page_writes=on
      -c checkpoint_timeout=5min

volumes:
  pgdata:
```

验证WAL配置：
```bash
docker exec -it postgres psql -U postgres -d testdb

-- 查看WAL配置
SHOW wal_level;          -- replica
SHOW full_page_writes;   -- on
SHOW archive_mode;       -- on

-- 手动触发WAL切换（强制生成新的WAL段）
SELECT pg_switch_wal();

-- 查看归档状态
SELECT * FROM pg_stat_archiver;

-- 查看当前WAL统计
SELECT * FROM pg_stat_wal;
```