# 第18章 备份恢复与PITR

## 18.1 场景故事：误删表后的紧急恢复

### 业务需求

某DBA在生产环境上执行了：
```sql
DROP TABLE orders;
```

万幸的是，PostgreSQL有完整的数据恢复方案——通过 **连续归档 + PITR（Point-In-Time Recovery）**，可以将数据库恢复到误操作发生前的瞬间。

---

## 18.2 实现原理

### 备份方式对比

```sql
-- 1. 逻辑备份（pg_dump）：适合单库/单表
pg_dump -h localhost -U postgres -d mydb -f mydb_backup.sql
pg_dump -h localhost -U postgres -d mydb -t orders -f orders_backup.sql

-- 2. 自定义格式（支持压缩和并行）
pg_dump -h localhost -U postgres -d mydb -F c -f mydb_backup.dump

-- 3. 目录格式（支持并行备份，最快）
pg_dump -h localhost -U postgres -d mydb -F d -j 4 -f /backup/mydb_dir/

-- 恢复
pg_restore -h localhost -U postgres -d mydb -F c mydb_backup.dump
pg_restore -h localhost -U postgres -d mydb -t orders mydb_backup.dump  -- 恢复单表
```

### 物理备份（pg_basebackup）

物理备份对WAL归档进行基础备份，是PITR的基础：

```bash
# 创建基础备份（含所有WAL信息）
pg_basebackup -h localhost -U postgres -D /backup/basebackup -P -v

# 配合WAL归档使用
# postgresql.conf 配置：
wal_level = replica
archive_mode = on
archive_command = 'cp %p /archive/%f'
```

### PITR恢复完整步骤

```bash
# 1. 停止数据库
pg_ctl stop

# 2. 将数据目录替换为备份副本
rm -rf /data/pgdata/*
cp -r /backup/basebackup/* /data/pgdata/

# 3. 创建恢复配置
cat > /data/pgdata/postgresql.conf << EOF
restore_command = 'cp /archive/%f %p'
recovery_target_time = '2024-10-01 14:30:00'  # 恢复到误操作前的时间点
recovery_target_inclusive = false              # 不包含目标时间点
EOF

# 4. 创建恢复信号文件
touch /data/pgdata/recovery.signal

# 5. 启动数据库（自动进入恢复模式）
pg_ctl start
# 数据库会自动进入恢复模式，直到目标时间点
# 恢复完成后，数据库处于只读状态

# 6. 验证数据正确后，恢复可写状态
pg_wal_replay_resume();

# 7. 或者恢复到指定时间点后以只读方式检查
# 然后使用 pg_ctl promote 提升为主库
```

---

## 18.3 备份策略

| 策略 | 备份方式 | RPO（数据损失） | RTO（恢复时间） |
|------|---------|----------------|----------------|
| 逻辑备份每日一次 | pg_dump | 最多24小时 | 数小时 |
| 物理备份每日一次 + WAL连续归档 | pg_basebackup + archive | 秒级（WAL写入频率） | 1-2小时 |
| 流复制热备 + WAL连续归档 | 流复制 + archive | 几乎为零 | 分钟级 |

---

## 18.4 典型问题处理

**问题：如何验证备份是有效的？**

```
最有效的方法：定期在测试环境恢复备份
不要依赖"备份成功了"——备份文件可能无声损坏

验证策略：
1. 每天自动将备份恢复到测试环境
2. 执行数据完整性检查（行数校验、约束检查）
3. 确认恢复后的数据可用
```

---

## 18.5 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: backup_demo
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./archive:/archive
      - ./backup:/backup
    command: >
      -c wal_level=replica
      -c archive_mode=on
      -c archive_command='cp %p /archive/%f'
      -c max_wal_senders=10

volumes:
  pgdata:
```

```bash
# 测试备份恢复
docker exec -it postgres pg_dump -U postgres -d backup_demo -F c -f /backup/full_backup.dump
docker exec -it postgres psql -U postgres -d backup_demo -c "DROP TABLE IF EXISTS test_data;"

# 验证恢复
docker exec -it postgres pg_restore -U postgres -d backup_demo -F c /backup/full_backup.dump
```