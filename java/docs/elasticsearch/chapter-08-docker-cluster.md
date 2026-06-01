# 第8章 【实战】基于 Docker Compose 搭建高可用 ES 集群

## 本章导读

在生产环境中落地 ES 集群，不仅涉及 ES 本身的配置，还涉及操作系统内核参数、Docker 容器资源限制、数据持久化等一系列问题。很多初学者直接在 Docker 中 `docker run elasticsearch` 启动了 ES，然后发现：节点启动失败（`max virtual memory areas vm.max_map_count is too low`）、节点频繁掉线（文件描述符不够）、重启后数据丢失（没有挂载卷）——这些问题几乎每个人都踩过。

本章提供一套**可直接运行的生产级 Docker Compose 配置**，以及详细的启动、验证和排错指南。

---

## 8.1 宿主机内核参数

ES 对操作系统的内核参数有硬性要求，错误配置会导致 ES 节点无法启动。**在运行 Docker 容器之前，必须先调整宿主机参数**：

```bash
# ⚠️ 必须执行！否则 ES 节点启动失败

# 1. 增加最大虚拟内存映射数
# ES 使用 mmap 来映射索引文件
# 默认值 65530 太小，ES 官方要求至少 262144
sudo sysctl -w vm.max_map_count=262144

# 永久生效
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# 2. 增加文件描述符限制
# ES 是一个文件描述符密集型应用
# 每个分片需要打开多个文件（倒排索引、DocValues、_source 等）
sudo bash -c 'cat >> /etc/security/limits.conf <<EOF
elasticsearch soft nofile 65535
elasticsearch hard nofile 65535
elasticsearch soft nproc 4096
elasticsearch hard nproc 4096
EOF'

# 3. 禁用 Swap（ES 官方强烈建议）
# 如果使用 Swap，ES 的性能会急剧下降
# 在 docker-compose.yml 中用 bootstrap.memory_lock=true 实现
# 但宿主机也需要配合
sudo swapoff -a

# 4. 验证配置
sysctl vm.max_map_count
ulimit -n
```

---

## 8.2 生产级 docker-compose.yml

```yaml
# docker-compose.yml —— 3 节点 ES 集群 + Kibana
# 使用方法：
#   docker-compose up -d
#   docker-compose logs -f （查看启动日志）
#   curl http://localhost:9200/_cluster/health （检查集群状态）

version: '3.8'

services:
  es-node1:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    container_name: es-node1
    hostname: es-node1
    environment:
      # 节点名称（在日志和监控中可见）
      - node.name=es-node1
      # 集群名称（同一集群的所有节点必须相同）
      - cluster.name=es-docker-cluster

      # 发现配置
      # 集群中其他节点的地址（用于节点发现）
      - discovery.seed_hosts=es-node2,es-node3
      # 集群首次启动时的候选主节点列表
      - cluster.initial_master_nodes=es-node1,es-node2,es-node3

      # 内存锁定（禁止 Swap）
      - bootstrap.memory_lock=true

      # JVM 堆大小（不超过物理内存的 50%）
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"

      # 节点角色（只做 Data，不做 Master）
      - node.roles=data,ingest

      # 安全配置（测试环境关闭）
      - xpack.security.enabled=false
      - xpack.security.enrollment.enabled=false
      - xpack.security.http.ssl.enabled=false

      # 单节点时允许单节点发现（仅用于测试，生产必须有 3 个节点）
      # - discovery.type=single-node

    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65535
        hard: 65535

    volumes:
      - es_data1:/usr/share/elasticsearch/data

    ports:
      - "9200:9200"   # HTTP API
      - "9300:9300"   # 节点间通信

    networks:
      - elastic

    # 健康检查
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9200/_cluster/health"]
      interval: 30s
      timeout: 10s
      retries: 5

    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2g
        reservations:
          cpus: '1'
          memory: 1g

  es-node2:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    container_name: es-node2
    hostname: es-node2
    environment:
      - node.name=es-node2
      - cluster.name=es-docker-cluster
      - discovery.seed_hosts=es-node1,es-node3
      - cluster.initial_master_nodes=es-node1,es-node2,es-node3
      - bootstrap.memory_lock=true
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
      - node.roles=data,ingest
      - xpack.security.enabled=false
      - xpack.security.http.ssl.enabled=false
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65535, hard: 65535 }
    volumes:
      - es_data2:/usr/share/elasticsearch/data
    networks:
      - elastic
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9200/_cluster/health"]
      interval: 30s
      timeout: 10s
      retries: 5

  es-node3:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    container_name: es-node3
    hostname: es-node3
    environment:
      - node.name=es-node3
      - cluster.name=es-docker-cluster
      - discovery.seed_hosts=es-node1,es-node2
      - cluster.initial_master_nodes=es-node1,es-node2,es-node3
      - bootstrap.memory_lock=true
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
      - node.roles=data,ingest
      - xpack.security.enabled=false
      - xpack.security.http.ssl.enabled=false
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65535, hard: 65535 }
    volumes:
      - es_data3:/usr/share/elasticsearch/data
    networks:
      - elastic
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9200/_cluster/health"]
      interval: 30s
      timeout: 10s
      retries: 5

  kibana:
    image: docker.elastic.co/kibana/kibana:8.12.0
    container_name: kibana
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://es-node1:9200
      - I18N_LOCALE=zh-CN          # 中文界面
    networks:
      - elastic
    depends_on:
      es-node1:
        condition: service_healthy

volumes:
  es_data1:
    driver: local
  es_data2:
    driver: local
  es_data3:
    driver: local

networks:
  elastic:
    driver: bridge
```

---

## 8.3 启动与验证

```bash
# 启动集群
docker-compose up -d

# 查看启动日志（观察节点加入过程）
docker-compose logs -f

# 等待节点全部就绪后，验证集群状态
curl http://localhost:9200/_cluster/health?pretty

# 预期输出（健康集群）：
# {
#   "cluster_name": "es-docker-cluster",
#   "status": "green",
#   "number_of_nodes": 3,
#   "number_of_data_nodes": 3,
#   "active_primary_shards": 0,
#   "active_shards": 0,
#   "relocating_shards": 0,
#   "initializing_shards": 0,
#   "unassigned_shards": 0
# }

# 查看集群中的节点列表
curl http://localhost:9200/_cat/nodes?v

# 输出示例：
# ip         heap.percent ram.percent cpu load_1m node.role
# 172.x.x.1           25          95   5    0.23 d       es-node1
# 172.x.x.2           30          95   3    0.15 d       es-node2
# 172.x.x.3           28          95   4    0.18 d       es-node3

# 查看节点角色
curl http://localhost:9200/_cat/nodes?v=true&h=name,node.role

# 创建一个测试索引
curl -X PUT "http://localhost:9200/test_index" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  }
}'

# 写入一条测试数据
curl -X POST "http://localhost:9200/test_index/_doc" -H 'Content-Type: application/json' -d'
{
  "message": "Hello ES Cluster"
}'

# 搜索测试
curl "http://localhost:9200/test_index/_search?pretty"

# 打开 Kibana
# http://localhost:5601
```

---

## 8.4 常见排错指南

```bash
# 错误 1：节点启动失败，日志显示 "max virtual memory areas vm.max_map_count"
# 原因：Docker 宿主机的内核参数不足
# 解决：在宿主机上执行 sysctl -w vm.max_map_count=262144

# 错误 2：节点启动失败，日志显示 "memory locking requested but not available"
# 原因：memlock 限制不足
# 解决：在 docker-compose.yml 的 ulimits 中设置 memlock: soft: -1, hard: -1

# 错误 3：节点启动后，集群状态为 YELLOW 或 RED
# 查看未分配分片的原因
curl "http://localhost:9200/_cluster/allocation/explain?pretty"

# 常见原因和解决：

# 原因 A：磁盘水位线限制
# → 查看磁盘使用率
curl "http://localhost:9200/_cat/allocation?v"
# → 如果磁盘使用率 > 85%（水位线），ES 不会在这个节点上分配分片
# → 解决：清理旧数据或增加磁盘

# 原因 B：分片数超过节点承载能力
# → 查看节点负载
curl "http://localhost:9200/_cat/shards?v"
# → 如果某个节点上的分片数远多于其他节点，说明分布不均
# → 解决：重新分配分片（reroute）或增加节点

# 错误 4：Kibana 无法连接到 ES
# → 检查网络：docker-compose 中 kibana 和 ES 节点是否在同一个 network
# → 检查防火墙：Docker 内部端口 9200 是否可达
# → 检查 ES 状态：使用 health API 确认 ES 正常运行
```

---

## 本章总结

```bash
# 启动集群的完整步骤（速查）

# 1. 宿主机准备
sysctl -w vm.max_map_count=262144

# 2. 启动集群
docker-compose up -d

# 3. 等待集群就绪（约 30 秒）
sleep 30

# 4. 验证集群健康
curl http://localhost:9200/_cluster/health

# 5. 打开 Kibana
open http://localhost:5601
```

**核心原则**：
1. **不要在 Docker 中跑单节点 ES 做生产**——单节点意味着唯一故障点。Docker Compose 至少 3 个节点起步
2. **`vm.max_map_count` 必须在宿主机上设置**——ES 在 Docker 中运行逃不开这个限制
3. **数据卷必须持久化**——否则容器重启后数据丢失
4. **健康检查是一定要配的**——Kibana 等组件需要等待 ES 就绪后才能连接