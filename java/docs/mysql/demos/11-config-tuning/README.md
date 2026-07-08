# 第11章：配置参数调优

> 同样的SQL，在不同的MySQL配置下性能可能差10倍。这章教你如何调整InnoDB缓冲池、连接数、排序缓冲区等关键参数，让MySQL充分发挥硬件性能。

---

## 📖 本章导读

### 一个真实的故事

小冯的公司买了一台32GB内存的服务器来跑MySQL。但系统上线后，查询性能并没有明显提升。他检查后发现，`innodb_buffer_pool_size`还是默认的128MB——32GB的内存，MySQL只用了128MB做缓存，其余全部闲置。

他把`innodb_buffer_pool_size`调到20GB后，缓冲池命中率从60%飙升到99%。大部分查询不再需要读磁盘，直接从内存返回。整体查询性能提升了5倍。

**配置调优的核心：让MySQL充分利用硬件资源。** 默认配置是为"最低配置"设计的，生产环境必须根据实际硬件调整。

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **调整InnoDB缓冲池** — 最重要的性能参数。`innodb_buffer_pool_size`应该设为物理内存的50%-70%。
2. **优化连接配置** — 避免连接不够用或连接过多。
3. **调整排序和JOIN缓冲区** — 避免磁盘临时表，但注意这些是"每会话"分配的。

---

## 🧠 核心概念详解

### innodb_buffer_pool_size — 最重要的参数

InnoDB缓冲池是MySQL中最重要的内存区域。它缓存了数据页、索引页、插入缓冲和自适应哈希索引。缓冲池越大，命中率越高，磁盘IO越少。

**如何计算合理的值？**
- 专用MySQL服务器：物理内存的50%-70%
- 共享服务器（MySQL+应用）：物理内存的30%-50%
- 最小建议：1GB

**如何验证缓冲池是否够大？**
```sql
SHOW STATUS LIKE 'Innodb_buffer_pool_read%';
-- Innodb_buffer_pool_read_requests：缓冲池读请求次数
-- Innodb_buffer_pool_reads：从磁盘读取的次数
-- 命中率 = 1 - (reads / read_requests)，应接近100%
```

### 其他关键参数

| 参数 | 建议值 | 作用 | 注意事项 |
|------|--------|------|---------|
| `innodb_buffer_pool_size` | 内存的50%-70% | 缓存数据和索引 | 越大越好，但不要超过物理内存 |
| `innodb_flush_log_at_trx_commit` | 1(安全) / 2(性能) | 日志刷新策略 | 2可能丢失1秒数据 |
| `max_connections` | 根据业务量 | 最大连接数 | 每个连接占用内存，不是越大越好 |
| `sort_buffer_size` | 256K-512K | 排序缓冲区 | 每个排序会话分配，不要设太大 |
| `join_buffer_size` | 256K-512K | JOIN缓冲区 | 每个JOIN会话分配 |
| `tmp_table_size` | 64M-256M | 内存临时表大小 | 超过此值使用磁盘临时表 |

---

## 🛠️ 动手实践

```bash
cd demos/11-config-tuning
docker compose up -d
docker exec -it mysql-config mysql -uroot -proot123 optimization_db
```

在MySQL客户端中执行：

```sql
-- 查看缓冲池命中率
SHOW STATUS LIKE 'Innodb_buffer_pool_read%';

-- 查看当前配置
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW VARIABLES LIKE 'max_connections';
SHOW VARIABLES LIKE 'sort_buffer_size';

-- 查看连接使用情况
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';

-- 查看临时表使用情况
SHOW STATUS LIKE 'Created_tmp%';
-- Created_tmp_disk_tables / Created_tmp_tables 应尽量小
```

---

## ⚠️ 常见误区

### 误区1：sort_buffer_size越大越好

sort_buffer_size是**每个需要排序的会话**分配的。如果设为256MB，10个并发排序就会占用2.5GB内存。对于大多数查询，256KB-512KB就足够了。

### 误区2：max_connections越大越好

每个连接都占用内存（约256KB-512KB）。1000个连接就是256MB-512MB。而且MySQL的并发执行能力有限，连接数过多反而会导致上下文切换开销增大。

### 误区3：innodb_flush_log_at_trx_commit设为0

设为0性能最好，但MySQL崩溃时会丢失1秒的数据。对于金融、支付等场景，必须设为1。

---

## 💭 思考题

1. 如果服务器有64GB内存，MySQL专用，`innodb_buffer_pool_size`应该设为多少？为什么不是64GB？
2. `tmp_table_size`和`max_heap_table_size`有什么区别？为什么通常设为相同的值？
3. 如何判断`sort_buffer_size`是否需要调大？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-config mysql -uroot -proot123 optimization_db
docker compose down -v
```
