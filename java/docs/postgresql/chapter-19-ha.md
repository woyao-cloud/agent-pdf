# 第19章 高可用架构

## 19.1 场景故事：生产环境零宕机升级方案

### 业务需求

数据库需要从PG 14升级到PG 16，且不能超过5分钟的停机时间。同时，如果主库所在的服务器故障，需要在30秒内自动切换到从库。

解决方案：**Patroni + etcd + 流复制 + HAProxy** 搭建自动故障切换的高可用集群。

---

## 19.2 实现原理

### 流复制

PostgreSQL的流复制（Streaming Replication）是高可用的基础：

```
主库                         从库1                         从库2
┌─────────────┐            ┌─────────────┐              ┌─────────────┐
│ WAL Sender  │─WAL流────→│ WAL Receiver│─WAL写入────→│ WAL Receiver│
│ 进程         │            │ 进程         │              │ 进程         │
│              │            │              │              │              │
│ 写操作       │            │ 只读查询     │              │ 只读查询     │
│ 同步复制     │            │ 同步提交     │              │ 异步复制     │
└─────────────┘            └─────────────┘              └─────────────┘
```

同步复制 vs 异步复制的权衡：
```sql
-- 同步复制：主库等待从库确认后才提交事务
-- 数据不丢失，但写入性能下降（受网络延迟影响）
-- 配置后需要在从库设置 synchronous_standby_names

-- 异步复制：主库不等待从库确认就直接提交
-- 写入性能不受影响，但主库故障时可能丢失少量数据
```

### Patroni自动切换

Patroni是一个用Python编写的高可用管理器，它管理PostgreSQL实例的生命周期：

```yaml
# patroni.yml
scope: pg_cluster
namespace: /service/
name: pg_node1

restapi:
  listen: 0.0.0.0:8008
  connect_address: 192.168.1.1:8008

etcd:
  host: 192.168.1.10:2379

bootstrap:
  dcs:
    ttl: 30                  # 租约时间
    loop_wait: 10            # 循环等待时间
    retry_timeout: 10        # 重试超时
    maximum_lag_on_failover: 1048576  # 最大复制延迟（字节）
    postgresql:
      use_pg_rewind: true
      use_slots: true
      parameters:
        wal_level: replica
        hot_standby: "on"
        wal_keep_size: 1024
        max_wal_senders: 5
        max_replication_slots: 5

  # 初始集群配置
  initdb:
  - encoding: UTF8
  - data-checksums

postgresql:
  listen: 0.0.0.0:5432
  connect_address: 192.168.1.1:5432
  data_dir: /data/patroni
  pgpass: /tmp/pgpass
  authentication:
    replication:
      username: replicator
      password: secret
    superuser:
      username: postgres
      password: admin
    rewind:
      username: rewind_user
      password: rewind_password
```

### 自动切换流程

```
1. etcd 检测到主库节点心跳超时（30秒无响应）
2. DCS（分布式配置存储）更新集群状态
3. Patroni在所有从库中选举新的主库
   - 选择复制延迟最小的从库
   - 提升从库为主库
4. HAProxy检测到主库地址变化
   - 更新后端节点列表
   - 应用的新连接指向新的主库
5. 原主库恢复后自动作为从库加入集群
```

---

## 19.3 三种高可用方案对比

| 方案 | 故障切换时间 | 复杂度 | 适用场景 |
|------|-------------|--------|---------|
| Patroni + etcd | 10-30秒 | 高 | 生产环境、需要自动切换 |
| repmgr | 30秒-2分钟 | 中 | 中规模部署 |
| 流复制 + 手动切换 | 手动操作 | 低 | 开发/测试环境 |

---

## 19.4 Docker Compose（3节点PG + Patroni + etcd）

```yaml
version: '3.8'
services:
  etcd1:
    image: bitnami/etcd:latest
    environment:
      ALLOW_NONE_AUTHENTICATION: "yes"
      ETCD_NAME: etcd1
      ETCD_INITIAL_ADVERTISE_PEER_URLS: http://etcd1:2380
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd1:2379
      ETCD_INITIAL_CLUSTER: etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380
      ETCD_INITIAL_CLUSTER_STATE: new

  etcd2:
    image: bitnami/etcd:latest
    environment:
      ALLOW_NONE_AUTHENTICATION: "yes"
      ETCD_NAME: etcd2
      ETCD_INITIAL_ADVERTISE_PEER_URLS: http://etcd2:2380
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd2:2379
      ETCD_INITIAL_CLUSTER: etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380
      ETCD_INITIAL_CLUSTER_STATE: new

  etcd3:
    image: bitnami/etcd:latest
    environment:
      ALLOW_NONE_AUTHENTICATION: "yes"
      ETCD_NAME: etcd3
      ETCD_INITIAL_ADVERTISE_PEER_URLS: http://etcd3:2380
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd3:2379
      ETCD_INITIAL_CLUSTER: etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380
      ETCD_INITIAL_CLUSTER_STATE: new

  haproxy:
    image: haproxy:latest
    ports: ["5000:5000", "7000:7000"]
    volumes:
      - ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg
    depends_on: [patroni1, patroni2, patroni3]

  patroni1:
    image: patroni:latest
    environment:
      PATRONI_SCOPE: pg_cluster
      PATRONI_NAME: pg_node1
      PATRONI_RESTAPI_CONNECT_ADDRESS: patroni1:8008
      PATRONI_ETCD3_HOSTS: ectd1:2379,etcd2:2379,etcd3:2379
      PATRONI_POSTGRESQL_DATA_DIR: /data/patroni
      PATRONI_POSTGRESQL_PGPASS: /tmp/pgpass
    volumes:
      - pgdata1:/data/patroni

  patroni2:
    image: patroni:latest
    environment:
      PATRONI_SCOPE: pg_cluster
      PATRONI_NAME: pg_node2
      PATRONI_RESTAPI_CONNECT_ADDRESS: patroni2:8008
      PATRONI_ETCD3_HOSTS: etcd1:2379,etcd2:2379,etcd3:2379
      PATRONI_POSTGRESQL_DATA_DIR: /data/patroni
    volumes:
      - pgdata2:/data/patroni

  patroni3:
    image: patroni:latest
    environment:
      PATRONI_SCOPE: pg_cluster
      PATRONI_NAME: pg_node3
      PATRONI_RESTAPI_CONNECT_ADDRESS: patroni3:8008
      PATRONI_ETCD3_HOSTS: etcd1:2379,etcd2:2379,etcd3:2379
      PATRONI_POSTGRESQL_DATA_DIR: /data/patroni
    volumes:
      - pgdata3:/data/patroni

volumes:
  pgdata1: pgdata2: pgdata3:
```

```cfg
# haproxy.cfg
frontend pg_frontend
    bind *:5000
    mode tcp
    default_backend pg_backend

backend pg_backend
    mode tcp
    option pgsql-check user postgres
    server pg_node1 patroni1:5432 check port=8008
    server pg_node2 patroni2:5432 check port=8008
    server pg_node3 patroni3:5432 check port=8008
```

验证HA：
```bash
# 查看Patroni集群状态
docker exec -it patroni1 patronictl list

# 查看当前主库
docker exec -it patroni1 patronictl top

# 模拟主库故障
docker stop patroni1

# 自动切换后再次查看
docker exec -it patroni2 patronictl list

# 恢复patroni1
docker start patroni1
```