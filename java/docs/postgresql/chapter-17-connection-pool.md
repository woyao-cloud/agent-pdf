# 第17章 连接池与并发控制

## 17.1 场景故事：2000个连接把数据库打死了

### 业务需求

某在线教育平台在开学季流量激增，应用服务器启动了200个实例，每个实例配置了20个最大连接数 = 4000个数据库连接。PostgreSQL在4000个连接时出现严重性能下降：CPU飙升到100%、查询响应从10ms飙升到2秒、部分连接超时。

原因：PostgreSQL是进程模型，每个连接对应一个进程。4000个进程的开销：
- 进程切换开销：操作系统需要管理4000个进程的调度
- 内存占用：每个进程约分配10MB内存（work_mem + 进程栈），4000个进程 = 40GB
- 锁竞争加剧：大量并发查询争抢共享缓冲区的锁

解决方案：引入连接池PgBouncer。

---

## 17.2 实现原理

### PgBouncer的三种模式

```ini
# pgbouncer.ini
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# 三种模式：
# session: 会话级（连接在整个会话期间保持）
# transaction: 事务级（推荐，事务结束后归还连接）
# statement: 语句级（每条语句后归还）
pool_mode = transaction

# 连接池大小
default_pool_size = 50       # 每个用户/数据库组合的最大连接数
max_client_conn = 1000       # 允许的最大客户端连接数
```

PgBouncer的工作模式：

```
应用（4000个连接）                  PgBouncer                    PostgreSQL
┌──────────────┐                ┌──────────────┐             ┌──────────────┐
│ 应用实例1     │───4000个连接──→│  连接池      │───50个连接──→│  PG Server   │
│ 应用实例2     │               │  (事务模式)   │              │  (50个进程)  │
│ 应用实例3     │               │              │              │              │
│     ...       │               │  排队机制     │              │  稳定运行    │
└──────────────┘               └──────────────┘             └──────────────┘
```

**事务级连接池的工作原理**：当事务开始时，PgBouncer从池中分配一个后端连接；当事务提交/回滚后，PgBouncer立即归还连接。下一个事务可能使用不同的后端连接。这意味着应用不能依赖会话级状态（如临时表、会话变量）。

### 连接池大小公式

```java
// 连接池大小的计算公式
// PoolSize = CPU核心数 * 2 + 磁盘数

// 例如：16核CPU，1块SSD → poolSize = 16*2 + 1 = 33

// 为什么这么小？
// 当连接数 = CPU核心数时，所有CPU都在处理请求
// 增加连接数会导致更多的上下文切换，而非更多的并行处理
// 数据库的性能瓶颈通常在CPU、IO、锁，不在连接数
```

### Spring Boot HikariCP配置

```yaml
# application.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:6432/mydb  # 连接PgBouncer而非直连PG
    username: app_user
    password: secret
    hikari:
      maximum-pool-size: 20       # 每个应用实例的最大连接数
      minimum-idle: 10            # 最小空闲连接数
      connection-timeout: 5000    # 连接超时（ms）
      idle-timeout: 300000        # 空闲超时（ms）
      max-lifetime: 600000        # 连接最大存活时间（ms）
      pool-name: PgPool
      # PG特有的参数
      data-source-properties:
        socketTimeout: 30         # 套接字超时
        tcpKeepAlive: true        # TCP心跳
        prepareThreshold: 0       # 禁用预编译缓存（配合PgBouncer）
```

---

## 17.3 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 事务级池的临时表问题 | 事务结束后后端连接被回收，临时表消失 | 使用会话级池或全局临时表 |
| 预准备语句失效 | PgBouncer的事务池模式下PREPARE无效 | 应用层禁用预编译或使用会话级池 |
| 连接泄漏 | 应用未正确关闭连接 | 监控连接数，设置idle-timeout |
| 单点故障 | PgBouncer宕机导致所有应用无法连接 | 部署多个PgBouncer + HA方案 |

---

## 17.4 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: mydb
      POSTGRES_PASSWORD: secret
    # 限制最大连接数
    command: -c max_connections=50

  pgbouncer:
    image: bitnami/pgbouncer:latest
    ports: ["6432:6432"]
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      POSTGRESQL_USERNAME: postgres
      POSTGRESQL_DATABASE: mydb
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_DEFAULT_POOL_SIZE: 20
      PGBOUNCER_MAX_CLIENT_CONN: 200
    depends_on:
      - postgres
```

验证：
```bash
# 启动环境
docker-compose up -d

# 查看PgBouncer状态
docker exec -it pgbouncer psql -U postgres -d pgbouncer -c "SHOW POOLS;"

# 查看活跃连接数
docker exec -it postgres psql -U postgres -d mydb -c "
SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname = 'mydb';
"

# 通过PgBouncer连接
psql -h localhost -p 6432 -U postgres -d mydb
```