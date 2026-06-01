# 第2章 架构与进程模型

## 2.1 进程架构全景

### PostgreSQL是进程模型，不是线程模型

与MySQL（线程模型）不同，PostgreSQL使用**进程模型**。这意味着每个客户端连接对应一个独立的操作系统进程，而不是一个线程。这个设计决策贯穿了PostgreSQL的整个架构，深刻影响了其连接管理、内存管理和并发行为。

```
PostgreSQL进程架构（完整版）：
                            ┌─────────────────────────┐
                            │    Postmaster 主进程     │
                            │   (监听端口/管理子进程)   │
                            └─────────────────────────┘
                                       │
                                     fork()
                                       │
         ┌─────────────────────────────────────────────────────┐
         │          │          │          │          │         │
    ┌────┴───┐ ┌───┴────┐ ┌───┴────┐ ┌───┴────┐ ┌───┴────┐ ┌──┴──────┐
    │Backend │ │WAL     │ │Check-  │ │BgWriter│ │Auto-   │ │WAL     │
    │Process │ │Writer  │ │pointer │ │        │ │Vacuum  │ │Receiver│
    │(每个连 │ │        │ │        │ │        │ │        │ │(主从)  │
    │接一个) │ │        │ │        │ │        │ │        │ │        │
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

每个进程的职责清晰划分：

**Postmaster（主进程）**：整个数据库的"守护神"。它负责：监听客户端连接请求（默认5432端口）、fork出新的Backend Process处理每个连接、在子进程崩溃时重启系统、在服务器关闭时协调所有子进程的终止。Postmaster在启动时加载配置文件（postgresql.conf、pg_hba.conf），初始化共享内存区，然后进入等待连接的状态。

**Backend Process（后端进程）**：每个客户端连接对应一个独立的Backend Process。当客户端发送SQL查询时，Backend Process执行解析、优化、执行计划并返回结果。如果某个Backend Process崩溃了（比如遇到了内存越界访问），只有该进程死亡，其他Backend Process不受影响——这是进程模型相比线程模型的一个重要优势：隔离性更好。

**WAL Writer**：负责将WAL缓冲区中的日志记录写入WAL段文件。它定期（每wal_writer_delay毫秒）将累积的WAL数据写入磁盘，确保事务提交的数据不会丢失。

**Checkpointer**：执行检查点操作。在检查点发生时，Checkpointer将所有脏页（共享缓冲区中已修改但尚未写入磁盘的数据页）写入磁盘，并更新控制文件中的检查点位置。检查点保证了数据库在故障恢复时只需要重放WAL中从最后一个检查点之后的部分。

**BgWriter（后台写入器）**：将共享缓冲区中的脏页分批写入磁盘，减少Checkpointer的负担。它持续地将"不常用"的脏页写回磁盘，确保共享缓冲区中有足够的干净页供新数据使用。

**AutoVacuum Launcher**：自动清理死元组。AutoVacuum是PostgreSQL最具特色的机制之一——它负责回收由MVCC产生的"垃圾版本"（死元组）。AutoVacuum Launcher定期启动AutoVacuum Worker进程，对达到阈值的表执行VACUUM操作。

**WAL Receiver / WAL Sender（主从复制）**：在流复制架构中，WAL Sender从主库读取WAL数据并发送给从库，WAL Receiver在从库接收并应用这些WAL记录。

### 进程模型 vs 线程模型

| 特性 | PostgreSQL（进程） | MySQL（线程） |
|------|-------------------|--------------|
| 连接开销 | 大（fork进程消耗内存） | 小（创建线程轻量） |
| 隔离性 | 强（一个进程崩溃不影响其他进程） | 弱（一个线程崩溃可能影响整个进程） |
| 共享内存 | 需要显式配置共享内存段 | 线程天然共享进程内存 |
| 连接数扩展 | 数千连接（受内存限制） | 数万连接（受线程调度限制） |
| 多核利用 | 自动（多个进程分配到不同核） | 自动（多个线程分配到不同核） |

## 2.2 内存结构

PostgreSQL的内存分为**共享内存**（所有进程共享）和**本地内存**（每个进程独有）两部分：

```
共享内存区域（由Postmaster在启动时分配）：
┌─────────────────────────────────┐
│ shared_buffers (共享缓冲区)       │ ← 通常设置为系统内存的25%
│  数据页缓存：最近访问的数据块      │
│  脏页：已修改但未写入磁盘的页      │
├─────────────────────────────────┤
│ WAL Buffer (WAL缓冲区)           │ ← 通常设置为64MB
│  事务日志缓冲区：待写入WAL段的数据  │
├─────────────────────────────────┤
│ Clog Buffer (事务提交日志)         │
│  事务状态（进行中/已提交/已中止）    │
└─────────────────────────────────┘

每个Backend Process的本地内存：
┌─────────────────────────────────┐
│ work_mem (工作内存)               │ ← 用于排序、哈希连接等操作
│  排序操作、哈希表、位图扫描        │
├─────────────────────────────────┤
│ maintenance_work_mem (维护内存)    │ ← VACUUM/索引重建等操作
│  VACUUM、CREATE INDEX、ADD FK等   │
└─────────────────────────────────┘
```

**shared_buffers**：这是PostgreSQL最重要的内存参数。它决定了多少热数据可以缓存在内存中。设置为系统物理内存的25%是一个安全的起点。例如：服务器有32GB内存，设置shared_buffers为8GB。但注意不要设置过高（超过40%），否则会与操作系统页缓存争抢内存。

**work_mem**：用于每个查询操作的排序（ORDER BY、DISTINCT、Merge Join）和哈希表（Hash Join）。注意这个参数是个"陷阱"——它不是全局限制，而是**每个排序/哈希操作**的限制。如果一个查询中涉及3个排序操作，并且有4个并发查询，则总排序内存使用 = 3 × 4 × work_mem。默认值4MB对大多数OLTP查询是合适的，但对于复杂的分析查询（需要对数百万行排序），可能需要增加到64MB或更高。

**effective_cache_size**：这不是真正分配的内存，而是告诉优化器"操作系统页缓存有多大"的**建议值**。优化器根据这个值来估计是否值得使用Index Scan（如果有效缓存很大，索引扫描的成本会降低）。设置为系统内存的50-75%通常是合理的。

## 2.3 数据文件布局

### 数据目录结构

当 `initdb` 初始化一个新的数据目录后，目录结构如下：

```
/var/lib/postgresql/16/main/
├── PG_VERSION              # PG大版本号
├── postgresql.conf         # 主配置文件
├── pg_hba.conf             # 客户端认证配置
├── pg_ident.conf           # 用户映射配置
├── postmaster.pid          # 当前运行的Postmaster PID（数据库运行时有）
│
├── base/                   # 默认表空间（每个数据库对应一个子目录）
│   ├── 1/                  # 数据库OID=1（template1）
│   │   ├── 1255            # 表/索引的文件名=relfilenode OID
│   │   ├── 1247
│   │   └── ...
│   ├── 13476/              # 用户创建的数据库
│   └── ...
│
├── global/                 # 全局系统表（跨所有数据库）
│   ├── pg_database         # 数据库列表
│   └── pg_authid           # 用户角色信息
│
├── pg_wal/                 # WAL段文件（预写式日志）
│   ├── 000000010000000000000001   # 每个段16MB
│   ├── 000000010000000000000002
│   └── ...
│
├── pg_xact/                # 事务提交状态（CLOG）
│
├── pg_stat/                # 统计信息（运行时的持久化统计）
│
├── pg_tblspc/              # 表空间符号链接
│
└── pg_replslot/            # 复制槽（用于流复制和逻辑复制）
```

### 文件命名与OID

PostgreSQL中的每个数据库对象（表、索引、序列等）都有一个唯一的**OID**（对象标识符）。表的数据文件名为该表的relfilenode OID：

```
base/16384/1255       → 数据库OID=16384中的表，relfilenode=1255
base/16384/1255_fsm   → 该表的空闲空间映射（Free Space Map）
base/16384/1255_vm    → 该表的可见性映射（Visibility Map）
```

每个表最多有3个文件：主数据文件（.0，没有后缀）、空闲空间映射（_fsm）和可见性映射（_vm）。文件大小超过1GB时，PostgreSQL会自动创建分卷文件（1255.1、1255.2……），这是为了保证文件大小在所有操作系统中都不会超过文件系统的限制。

## 2.4 Docker Compose环境

```yaml
# docker/scenario-01-basics/docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    command: >
      -c shared_buffers=256MB
      -c work_mem=16MB
      -c effective_cache_size=1GB
      -c log_statement=all
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d mydb"]
      interval: 5s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

### 连接到PostgreSQL

```bash
# 启动环境
cd docker/scenario-01-basics
docker-compose up -d

# 通过psql连接
docker exec -it postgres psql -U appuser -d mydb

# 查看进程列表
SELECT pid, backend_start, state, query
FROM pg_stat_activity
WHERE datname = 'mydb';

# 查看共享内存配置
SHOW shared_buffers;
SHOW work_mem;
SHOW effective_cache_size;

# 查看数据目录结构
\! ls /var/lib/postgresql/data/
```