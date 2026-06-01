# 附录

## 附录A：Redis 常用命令速查表与复杂度分析

### Key 操作

| 命令 | 时间复杂度 | 说明 | 注意事项 |
|------|-----------|------|---------|
| `DEL key` | O(N) | 删除 key | N 为 key 数量，大 Key 用 UNLINK |
| `UNLINK key` | O(1) | 异步删除（Redis 4.0+） | 后台线程回收内存 |
| `EXISTS key` | O(1) | 检查 key 是否存在 | |
| `EXPIRE key seconds` | O(1) | 设置过期时间 | |
| `TTL key` | O(1) | 查看剩余过期时间 | -1 = 永不过期，-2 = 不存在 |
| `TYPE key` | O(1) | 返回 key 的类型 | |
| `RENAME key newkey` | O(1) | 重命名 key | |
| `SCAN cursor` | O(1) per call | **替代 KEYS** 的增量遍历 | 每次返回少量数据 + 新的 cursor |
| `SORT key` | O(N+M*log(M)) | 排序（**谨慎使用**） | 大数据量时阻塞主线程 |
| `KEYS pattern` | O(N) | **线上禁止使用！** | 用 SCAN 替代 |

### String 操作

| 命令 | 时间复杂度 | 说明 |
|------|-----------|------|
| `GET key` | O(1) | 获取值 |
| `SET key value [NX\|XX] [EX\|PX]` | O(1) | 设置值，支持 NX/XX 条件 |
| `MGET key1 key2 ...` | O(N) | 批量获取（**推荐**） |
| `MSET key1 v1 key2 v2` | O(N) | 批量设置 |
| `INCR key` | O(1) | 原子+1 |
| `INCRBY key increment` | O(1) | 原子增加指定值 |
| `DECR key` | O(1) | 原子-1 |
| `STRLEN key` | O(1) | 获取字符串长度 |
| `GETRANGE key start end` | O(N) | 获取子串 |
| `APPEND key value` | O(1) | 追加字符串（SDS 预分配收益） |
| `SETEX key seconds value` | O(1) | 设置值 + 过期时间（原子） |
| `SETNX key value` | O(1) | 不存在时设置 |

### Hash 操作

| 命令 | 时间复杂度 | 说明 |
|------|-----------|------|
| `HSET key field value` | O(1) | 设置字段 |
| `HGET key field` | O(1) | 获取字段 |
| `HMGET key field1 field2` | O(N) | 批量获取 |
| `HMSET key f1 v1 f2 v2` | O(N) | 批量设置 |
| `HGETALL key` | O(N) | 获取所有字段 **注意 N 可以很大** |
| `HKEYS key` | O(N) | 获取所有字段名 |
| `HVALS key` | O(N) | 获取所有值 |
| `HLEN key` | O(1) | 字段总数 |
| `HEXISTS key field` | O(1) | 字段是否存在 |
| `HDEL key field` | O(1) | 删除字段 |
| `HINCRBY key field increment` | O(1) | 原子递增字段 |
| `HSCAN key cursor` | O(1) per call | 增量遍历 Hash（替代 HGETALL） |

### List 操作

| 命令 | 时间复杂度 | 说明 |
|------|-----------|------|
| `LPUSH key value` | O(1) | 左侧插入 |
| `RPUSH key value` | O(1) | 右侧插入 |
| `LPOP key` | O(1) | 左侧弹出 |
| `RPOP key` | O(1) | 右侧弹出 |
| `BRPOP key timeout` | O(1) | 阻塞式右侧弹出 |
| `LLEN key` | O(1) | 列表长度 |
| `LRANGE key start stop` | O(N) | 范围获取（N=返回元素数，**注意大 List**） |
| `LTRIM key start stop` | O(N) | 裁剪列表 |
| `LINDEX key index` | O(N) | 获取指定索引元素 |
| `LSET key index value` | O(N) | 设置指定索引值 |

### Set 操作

| 命令 | 时间复杂度 | 说明 |
|------|-----------|------|
| `SADD key member` | O(1) | 添加元素 |
| `SREM key member` | O(1) | 删除元素 |
| `SISMEMBER key member` | O(1) | 是否成员 |
| `SMEMBERS key` | O(N) | 获取所有成员（**注意 N**） |
| `SCARD key` | O(1) | 元素数量 |
| `SINTER key1 key2` | O(N*M) | 交集 |
| `SUNION key1 key2` | O(N) | 并集 |
| `SDIFF key1 key2` | O(N) | 差集 |
| `SSCAN key cursor` | O(1) per call | 增量遍历 Set（替代 SMEMBERS） |

### ZSet 操作

| 命令 | 时间复杂度 | 说明 |
|------|-----------|------|
| `ZADD key score member` | O(log N) | 添加/更新元素 |
| `ZREM key member` | O(log N) | 删除元素 |
| `ZSCORE key member` | O(1) | 获取分数 |
| `ZRANK key member` | O(log N) | 升序排名 |
| `ZREVRANK key member` | O(log N) | 降序排名 |
| `ZRANGE key start stop` | O(log N + M) | 升序范围获取 |
| `ZREVRANGE key start stop` | O(log N + M) | 降序范围获取（排行榜 Top N） |
| `ZRANGEBYSCORE key min max` | O(log N + M) | 按分数范围获取 |
| `ZCARD key` | O(1) | 元素总数 |
| `ZCOUNT key min max` | O(log N) | 分数范围内元素数 |
| `ZINCRBY key increment member` | O(log N) | 原子递增分数 |
| `ZINTERSTORE dest numkeys` | O(N*K) | 交集计算（**注意性能**） |
| `ZUNIONSTORE dest numkeys` | O(N) | 并集计算 |

### Stream 操作

| 命令 | 时间复杂度 | 说明 |
|------|-----------|------|
| `XADD key * field value` | O(1) | 添加消息 |
| `XREAD COUNT N BLOCK ms` | O(1) | 读取消息（支持阻塞） |
| `XREADGROUP GROUP group` | O(1) | 消费者组读取 |
| `XACK key group id` | O(1) | 确认消息 |
| `XDEL key id` | O(1) | 删除消息 |
| `XTRIM key MAXLEN N` | O(N) | 裁剪 Stream |
| `XLEN key` | O(1) | 消息总数 |
| `XINFO key` | O(1) | Stream 信息 |

### 连接管理

| 命令 | 说明 |
|------|------|
| `AUTH password` | 身份验证 |
| `PING` | 心跳检查 |
| `SELECT index` | 切换数据库（Cluster 模式不支持） |
| `CLIENT LIST` | 查看所有客户端连接 |
| `CLIENT SETNAME name` | 设置客户端名称（方便排查） |
| `CLIENT KILL addr:port` | 杀死连接 |
| `QUIT` | 断开连接 |

---

## 附录B：生产环境 Redis 标准部署脚本

### Linux 系统初始化

```bash
#!/bin/bash
# init-redis-server.sh —— Redis 服务器初始化脚本
# 用途: 安装 Redis 7.2 并优化系统参数

set -euo pipefail

REDIS_VERSION="7.2.4"
REDIS_PORT="${1:-6379}"
REDIS_PASSWORD="${2:-}"
DATA_DIR="/data/redis"
LOG_DIR="/var/log/redis"

# 1. 系统参数优化
echo "=== 优化系统参数 ==="
cat >> /etc/sysctl.conf <<EOF

# Redis 优化
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 1024
net.ipv4.tcp_slow_start_after_idle = 0
net.core.netdev_max_backlog = 10000
vm.overcommit_memory = 1
vm.swappiness = 1
EOF
sysctl -p

# 2. 禁用 THP
echo "=== 禁用 Transparent Huge Pages ==="
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo "never > /sys/kernel/mm/transparent_hugepage/enabled" >> /etc/rc.local

# 3. 安装 Redis
echo "=== 安装 Redis ${REDIS_VERSION} ==="
wget https://download.redis.io/releases/redis-${REDIS_VERSION}.tar.gz
tar xzf redis-${REDIS_VERSION}.tar.gz
cd redis-${REDIS_VERSION}
make -j$(nproc)
make install

# 4. 创建目录
mkdir -p ${DATA_DIR} ${LOG_DIR}
useradd -r -s /sbin/nologin redis || true
chown -R redis:redis ${DATA_DIR} ${LOG_DIR}

# 5. 生成配置文件
echo "=== 生成 redis.conf ==="
cat > /etc/redis-${REDIS_PORT}.conf <<REDISCONF
port ${REDIS_PORT}
daemonize no
logfile ${LOG_DIR}/redis-${REDIS_PORT}.log
dir ${DATA_DIR}
loglevel notice

bind 0.0.0.0
tcp-backlog 511
timeout 0
tcp-keepalive 300

# 内存
maxmemory $(free -g | awk '/^Mem:/{printf "%d", $2 * 0.7}')gb
maxmemory-policy allkeys-lru

# 持久化（混合持久化）
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
aof-use-rdb-preamble yes
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# 安全
maxclients 10000
slowlog-log-slower-than 10000
slowlog-max-len 128
hz 10

# ACL
aclfile /etc/redis-${REDIS_PORT}.acl
REDISCONF

# 6. 生成 ACL 文件
echo "user default on >${REDIS_PASSWORD} ~* +@all -FLUSHALL -FLUSHDB -CONFIG -KEYS -SHUTDOWN" \
  > /etc/redis-${REDIS_PORT}.acl

# 7. Systemd 服务
cat > /etc/systemd/system/redis-${REDIS_PORT}.service <<SERVICE
[Unit]
Description=Redis ${REDIS_PORT}
After=network.target

[Service]
Type=simple
User=redis
Group=redis
ExecStart=/usr/local/bin/redis-server /etc/redis-${REDIS_PORT}.conf
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable redis-${REDIS_PORT}
systemctl start redis-${REDIS_PORT}
echo "=== Redis ${REDIS_PORT} 已启动 ==="
```

### Docker Compose 生产部署

```yaml
# docker-compose.yml —— Redis 主从 + Sentinel
version: '3.8'

x-redis-common: &redis-common
  image: redis:7.2-alpine
  restart: always
  sysctls:
    - net.core.somaxconn=1024
  volumes:
    - type: volume
      source: redis-data
      target: /data

services:
  redis-master:
    <<: *redis-common
    ports: ["6379:6379"]
    command: >
      redis-server --appendonly yes
        --requirepass ${REDIS_PASSWORD}
        --masterauth ${REDIS_PASSWORD}
        --maxmemory 2gb
    volumes:
      - redis-master-data:/data

  redis-slave-1:
    <<: *redis-common
    command: >
      redis-server --appendonly yes
        --replicaof redis-master 6379
        --requirepass ${REDIS_PASSWORD}
        --masterauth ${REDIS_PASSWORD}
        --maxmemory 2gb

  redis-slave-2:
    <<: *redis-common
    command: >
      redis-server --appendonly yes
        --replicaof redis-master 6379
        --requirepass ${REDIS_PASSWORD}
        --masterauth ${REDIS_PASSWORD}
        --maxmemory 2gb

  sentinel-1:
    image: redis:7.2-alpine
    command: redis-sentinel /etc/sentinel.conf
    volumes:
      - ./sentinel.conf:/etc/sentinel.conf
    depends_on:
      - redis-master

  sentinel-2:
    image: redis:7.2-alpine
    command: redis-sentinel /etc/sentinel.conf
    volumes:
      - ./sentinel-2.conf:/etc/sentinel.conf
    depends_on:
      - redis-master

  sentinel-3:
    image: redis:7.2-alpine
    command: redis-sentinel /etc/sentinel.conf
    volumes:
      - ./sentinel-3.conf:/etc/sentinel.conf
    depends_on:
      - redis-master

volumes:
  redis-master-data:
  redis-data:
```

---

## 附录C：面试高频 Redis 问题与架构师级解答

### Q1：Redis 为什么快？

**期望回答**（按重要性排列）：
1. **纯内存操作**——内存访问延迟约 100ns，比磁盘快 10 万倍
2. **单线程模型**——避免了上下文切换、锁竞争、CPU 缓存失效
3. **I/O 多路复用**——epoll 事件驱动，只处理活跃连接
4. **高效数据结构**——SDS 预分配、ziplist 紧凑编码、skiplist 可预期性能
5. **jemalloc 内存分配器**——减少内存碎片
6. **Redis 6.0+ 多线程 I/O**——解决网络瓶颈

### Q2：Redis 单线程为什么还能抗高并发？

**核心**：Redis 的性能瓶颈不在 CPU，而在**网络 I/O 和内存**。单线程省下了多线程的上下文切换开销（20-30% CPU），且内存操作本身就是纳秒级。

### Q3：怎么解决缓存雪崩、缓存穿透、缓存击穿？

**雪崩**：随机 TTL + 多级缓存 + 高可用架构
**穿透**：布隆过滤器 + 空值缓存
**击穿**：互斥锁 + 逻辑过期异步刷新

### Q4：Redis 的持久化机制怎么选？

**标准答案**：开启混合持久化（`aof-use-rdb-preamble yes`），AOF fsync everysec。加载时 RDB 部分快（几秒），AOF 增量部分补全最后几秒的数据。

### Q5：Redis 主从复制的原理是什么？

**分层回答**：
- **全量同步**：首次连接 → 主节点 BGSave 生成 RDB → 传输到从节点 → 加载 → 增量命令追赶
- **增量同步**：断连重连 → 从节点发送偏移量 → 主节点检查 repl_backlog → 只传输缺失部分
- **核心参数**：repl-backlog-size（决定可容忍断连时长）

### Q6：Redis Cluster 的哈希槽怎么工作的？

**CRC16(key) % 16384** → 找到槽 → 槽映射到具体节点。16384 个槽均匀分布在 N 个节点上。

### Q7：分布式锁用 Redlock 还是 Redisson？

**好答案**：
- 大多数场景 Redisson 的 RLock（单 Redis）就够了，主从切换丢锁的概率极低
- Redlock 的争议在于时钟漂移和 GC 停顿无法彻底解决
- 对一致性要求极高的场景应该用 Zookeeper

### Q8：如何设计一个高并发排行榜？

1. ZSet 是基础数据结构
2. 分数设计：`score = baseScore + (1 - timeFactor)` 解决同分排序
3. 大数据量分桶：按分数范围拆分 ZSet
4. 冷热分离：Top 1000 放 Redis，其余放 MySQL

### Q9：Redis 事务和 Lua 脚本的区别？

- Lua 脚本：**原子执行**，脚本期间没有其他命令插入
- 事务（MULTI/EXEC）：**命令打包执行**，但 WATCH 的乐观锁在冲突时回滚
- 事务中的命令只是入队，不能依赖中间结果

### Q10：你在生产环境中遇到过哪些 Redis 问题？

**推荐准备的真实案例**：
1. **大 Key 阻塞**——线上 LRANGE list 0 -1 返回 100 万条，Redis 卡死 2 秒
2. **热 Key 打满带宽**——限流 Key 被恶意刷，带宽从 100Mbps 飙升到 900Mbps
3. **主从延迟**——写入后立即从从库读，读到旧数据
4. **内存暴涨**——客户端缓冲区没限制，Pub/Sub 消费慢导致 OOM
5. **KEYS 命令事故**——有人线上执行 `KEYS *`，Redis 阻塞 10 秒

> **面试加分项**：不仅说出问题，还要说出**排查工具**（`redis-cli --bigkeys`、`SLOWLOG`、`CLIENT LIST`、`INFO memory`））。