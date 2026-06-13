# 第13章 高可用部署：让Grafana永不掉线

## 场景故事：半夜两点，Grafana 挂了

> **凌晨 2:17，手机震动了。**
>
> 不是闹钟——是值班群里瞬间涌入了上百条消息。
>
> "线上 Grafana 挂了，所有面板都打不开！"
> "哪个服务挂了？" "不是服务挂了，是 Grafana 本身挂了！"
> "那怎么看监控？！" "..."
>
> 运维老陈从床上弹起来，打开电脑。Grafana 页面返回 502，ssh 到服务器一看——Grafana 进程 OOM killed 了。
>
> 更让他崩溃的是：因为 Grafana 挂了，他看不到任何监控数据，只能靠"盲猜"来排查问题。他先重启了 Grafana，然后逐个检查后端服务。
>
> "这太讽刺了，"他事后在复盘会上说，"**我们用 Grafana 监控一切，唯独没人监控 Grafana 本身。**"
>
> 老板的指示很简单："不管用什么方法，别再让 Grafana 成为单点故障。"

这就是**单节点部署**的致命缺陷——Grafana 一挂，整个团队的"眼睛"就瞎了。高可用部署就是要解决这个问题。

---

## 13.1 什么是高可用（HA）

### 13.1.1 原理比喻：从"一辆车"到"车队"

想象你要从北京开车到上海：

- **单节点 = 一辆车**：这辆车确实能把你送到上海。但如果半路爆胎了，你就得停在路边等救援。如果发动机坏了，你就彻底到不了了。
- **高可用 = 一个车队**：你准备了 3 辆车同行。每辆车都有备用轮胎。如果一辆车爆胎了，你换到另一辆车继续开。如果一辆车没油了，其他车可以拖着它走。3 辆车共享同一个导航系统和油箱信息，无论坐哪辆车，体验都是一样的。

对应到 Grafana：
- **多节点** = 车队里的多辆车。一辆车（节点）挂了，流量切换到其他车。
- **共享数据库（MySQL/PostgreSQL）** = 共享的导航和油箱信息。所有节点读写同一个数据库，保证数据一致性。
- **负载均衡器** = 车队里的领航车，决定走哪条路（把请求分发到哪个节点）。

### 13.1.2 为什么需要高可用

| 场景 | 单节点 | 高可用 |
|---|---|---|
| 服务器宕机 | Grafana 完全不可用 | 其他节点继续服务 |
| 内存泄漏 | OOM → 服务中断 | 重启单个节点，其他节点继续工作 |
| 版本升级 | 需要停机维护 | 滚动升级，零停机 |
| 流量暴涨 | 单点压力过大 | 多节点分担负载 |
| 网络分区 | 单点失联 → 全部失联 | 其他节点仍在服务 |

---

## 13.2 高可用架构

### 13.2.1 架构图

```
                    ┌─────────────┐
                    │   Load      │
                    │  Balancer   │
                    │  (HAProxy/  │
                    │   Nginx)    │
                    └──────┬──────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
      ┌──────┴──────┐ ┌───┴───────┐ ┌──┴────────┐
      │  Grafana    │ │  Grafana  │ │  Grafana  │
      │  Node 1     │ │  Node 2   │ │  Node 3   │
      └──────┬──────┘ └───────┬───┘ └───────┬───┘
             │                │              │
             └────────────────┼──────────────┘
                              │
                    ┌─────────┴─────────┐
                    │    Shared DB      │
                    │ (MySQL/PostgreSQL)│
                    └───────────────────┘
```

### 13.2.2 核心组件

| 组件 | 作用 | 类比 |
|---|---|---|
| **负载均衡器** | 分发流量、健康检查 | 高速公路上的交通指挥 |
| **Grafana 节点** | 处理请求，无状态 | 车队中的每辆车 |
| **共享数据库** | 存储配置、用户、Dashboard | 共享油箱和导航数据 |
| **共享文件存储**（可选） | 存储 Dashboard 图片、导出文件 | 共享的后备箱 |

---

## 13.3 手把手：搭建高可用 Grafana 集群

### 13.3.1 架构设计

我们的目标是搭建一个 3 节点的高可用集群：
- 3 个 Grafana 节点（无状态）
- 1 个 MySQL 作为共享数据库
- 1 个 Nginx 作为负载均衡器
- 所有组件通过 Docker Compose 管理

### 13.3.2 步骤 1：准备环境

确保你的机器上安装了 Docker 和 Docker Compose：

```bash
docker --version
docker-compose --version
```

### 13.3.3 步骤 2：创建项目目录

```bash
mkdir grafana-ha-cluster
cd grafana-ha-cluster
```

### 13.3.4 步骤 3：创建 docker-compose.yml（带逐行注释）

```yaml
# docker-compose.yml
# 高可用 Grafana 集群部署配置
# 为什么这样写：所有配置声明式管理，一键部署 3 节点集群

version: '3.8'

services:
  # ==========================================
  # 共享 MySQL 数据库
  # 作用：所有 Grafana 节点共享同一个数据库，
  #       确保用户、Dashboard、配置在所有节点间一致
  # 类比：车队的共享油箱——无论开哪辆车，油量信息都是一致的
  # ==========================================
  mysql:
    image: mysql:8.0
    container_name: grafana-mysql
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: grafana          # Grafana 会自动创建表结构
      MYSQL_USER: grafana
      MYSQL_PASSWORD: grafana_password
    volumes:
      - mysql-data:/var/lib/mysql       # 持久化数据库，防止容器重启数据丢失
    command: >
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - grafana-ha

  # ==========================================
  # Grafana 节点 1
  # 作用：处理用户请求，无状态运行
  # 关键配置：使用 MySQL 而非默认的 SQLite
  # ==========================================
  grafana-node-1:
    image: grafana/grafana:latest
    container_name: grafana-node-1
    ports:
      - "3001:3000"  # 节点 1 映射到 3001 端口
    volumes:
      - grafana-data-1:/var/lib/grafana  # 插件和临时数据
    environment:
      # 数据库配置：指向共享 MySQL
      # 为什么用 MySQL：SQLite 不支持并发读写，多节点必须用 MySQL/PostgreSQL
      - GF_DATABASE_TYPE=mysql
      - GF_DATABASE_HOST=mysql:3306
      - GF_DATABASE_NAME=grafana
      - GF_DATABASE_USER=grafana
      - GF_DATABASE_PASSWORD=grafana_password

      # 告警引擎：高可用模式下所有节点都评估告警
      - GF_UNIFIED_ALERTING_ENABLED=true

      # Session 配置：使用数据库存储 Session
      # 为什么：默认文件存储 Session 在多节点下会不同步
      - GF_SESSION_PROVIDER=mysql
      - GF_SESSION_PROVIDER_CONFIG=grafana:grafana_password@tcp(mysql:3306)/grafana

      # 安全配置
      - GF_SECURITY_ADMIN_PASSWORD=admin123

      # 日志模式：建议用 JSON 格式方便集中采集
      - GF_LOG_MODE=console
      - GF_LOG_FORMAT=json
    depends_on:
      mysql:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - grafana-ha

  # ==========================================
  # Grafana 节点 2
  # 作用：与节点 1 完全对等，分担负载
  # 类比：车队中的第二辆车——和第一辆一模一样
  # ==========================================
  grafana-node-2:
    image: grafana/grafana:latest
    container_name: grafana-node-2
    ports:
      - "3002:3000"
    volumes:
      - grafana-data-2:/var/lib/grafana
    environment:
      - GF_DATABASE_TYPE=mysql
      - GF_DATABASE_HOST=mysql:3306
      - GF_DATABASE_NAME=grafana
      - GF_DATABASE_USER=grafana
      - GF_DATABASE_PASSWORD=grafana_password
      - GF_UNIFIED_ALERTING_ENABLED=true
      - GF_SESSION_PROVIDER=mysql
      - GF_SESSION_PROVIDER_CONFIG=grafana:grafana_password@tcp(mysql:3306)/grafana
      - GF_SECURITY_ADMIN_PASSWORD=admin123
      - GF_LOG_MODE=console
      - GF_LOG_FORMAT=json
    depends_on:
      mysql:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - grafana-ha

  # ==========================================
  # Grafana 节点 3
  # 作用：与节点 1、2 完全对等，三节点集群
  # 为什么 3 个节点：奇数节点方便选举和故障转移
  # ==========================================
  grafana-node-3:
    image: grafana/grafana:latest
    container_name: grafana-node-3
    ports:
      - "3003:3000"
    volumes:
      - grafana-data-3:/var/lib/grafana
    environment:
      - GF_DATABASE_TYPE=mysql
      - GF_DATABASE_HOST=mysql:3306
      - GF_DATABASE_NAME=grafana
      - GF_DATABASE_USER=grafana
      - GF_DATABASE_PASSWORD=grafana_password
      - GF_UNIFIED_ALERTING_ENABLED=true
      - GF_SESSION_PROVIDER=mysql
      - GF_SESSION_PROVIDER_CONFIG=grafana:grafana_password@tcp(mysql:3306)/grafana
      - GF_SECURITY_ADMIN_PASSWORD=admin123
      - GF_LOG_MODE=console
      - GF_LOG_FORMAT=json
    depends_on:
      mysql:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - grafana-ha

  # ==========================================
  # Nginx 负载均衡器
  # 作用：统一入口，分发请求到 3 个 Grafana 节点
  # 类比：高速公路上的交通指挥——告诉每辆车走哪条车道
  # ==========================================
  nginx:
    image: nginx:alpine
    container_name: grafana-nginx
    ports:
      - "80:80"  # 统一入口，用户通过 80 端口访问
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf  # 挂载自定义配置
    depends_on:
      - grafana-node-1
      - grafana-node-2
      - grafana-node-3
    restart: unless-stopped
    networks:
      - grafana-ha

networks:
  grafana-ha:
    driver: bridge

volumes:
  mysql-data:
  grafana-data-1:
  grafana-data-2:
  grafana-data-3:
```

### 13.3.5 步骤 4：创建 Nginx 配置

```nginx
# nginx.conf
# Nginx 负载均衡配置
# 为什么这样写：轮询 + 健康检查 + WebSocket 支持

events {
    worker_connections 1024;
}

http {
    # 定义上游 Grafana 节点组
    # 类比：车队的车辆列表
    upstream grafana_cluster {
        # 轮询算法：默认按请求顺序分发
        # 其他选项：
        #   least_conn：发到连接数最少的节点
        #   ip_hash：同一 IP 始终发到同一节点（保持 Session）
        server grafana-node-1:3000 max_fails=3 fail_timeout=30s;
        server grafana-node-2:3000 max_fails=3 fail_timeout=30s;
        server grafana-node-3:3000 max_fails=3 fail_timeout=30s;
    }

    server {
        listen 80;

        # 健康检查端点
        location /api/health {
            proxy_pass http://grafana_cluster;
            proxy_set_header Host $host;
        }

        location / {
            proxy_pass http://grafana_cluster;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket 支持（Grafana 的实时推送需要）
            # 为什么需要：Grafana 使用 WebSocket 实现面板数据的实时更新
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";

            # 超时配置
            proxy_connect_timeout 60s;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;
        }
    }
}
```

> **旁白注释**：`proxy_set_header Upgrade` 和 `Connection "upgrade"` 是 WebSocket 代理的关键配置。如果没有这两行，Grafana 的实时推送功能（如告警状态实时更新）会失效。

### 13.3.6 步骤 5：启动集群

```bash
# 启动所有服务
docker-compose up -d

# 查看启动状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 13.3.7 步骤 6：验证高可用

**验证 1：所有节点正常运行**

```bash
# 访问每个节点的健康检查接口
curl http://localhost:3001/api/health
curl http://localhost:3002/api/health
curl http://localhost:3003/api/health

# 访问负载均衡器
curl http://localhost/api/health
```

**验证 2：Session 共享**

```bash
# 登录负载均衡器
curl -c cookies.txt -X POST http://localhost/login \
  -H "Content-Type: application/json" \
  -d '{"user":"admin","password":"admin123"}'

# 用同一个 Cookie 访问不同节点
curl -b cookies.txt http://localhost/api/dashboards/home
# 应该能正常返回，说明 Session 在节点间共享
```

**验证 3：故障转移**

```bash
# 模拟节点 1 宕机
docker-compose stop grafana-node-1

# 验证负载均衡器仍然正常工作
curl http://localhost/api/health

# 恢复节点 1
docker-compose start grafana-node-1
```

### 13.3.8 步骤 7：配置 Grafana 告警 HA

从 Grafana 8 开始，告警引擎支持高可用模式。在多节点部署中，需要配置告警锁定防止重复告警：

```ini
# 在 grafana.ini 中配置（或通过环境变量）
[unified_alerting]
enabled = true

# HA 模式配置
# 为什么需要：多个节点同时评估告警会导致重复通知
# 通过数据库锁机制，确保每条告警只被一个节点处理
[unified_alerting.ha]
enabled = true
# 节点标识，用于区分告警来源
# 每个节点必须设置不同的标签
labels = "cluster=grafana-ha,node=node-1"
```

在 docker-compose 中通过环境变量配置：

```yaml
# 在每个 Grafana 节点中增加
environment:
  # 启用告警高可用
  - GF_UNIFIED_ALERTING_HA_ENABLED=true
  # 节点标签（每个节点不同）
  - GF_UNIFIED_ALERTING_HA_LABELS=cluster=grafana-ha,node=node-1
  # 告警评估间隔
  - GF_UNIFIED_ALERTING_EVAL_TIMEOUT=30s
```

---

## 13.4 生产环境高可用 Checklist

### 13.4.1 数据库高可用

MySQL 本身也需要高可用，否则 MySQL 挂了所有 Grafana 节点都无法工作：

| 方案 | 描述 | 适用场景 |
|---|---|---|
| MySQL Replication | 主从复制，主库故障手动切换 | 中小规模 |
| MySQL Group Replication | 多主复制，自动故障转移 | 中等规模 |
| Galera Cluster | 同步多主集群 | 大规模 |
| 托管服务（RDS/Aurora） | 云厂商代管，自动故障转移 | 任何规模 |

### 13.4.2 负载均衡器高可用

Nginx 本身也是单点！需要用 Keepalived 或云厂商的 LB 做 Nginx 的高可用：

```bash
# 使用 Keepalived 实现 Nginx 高可用
# 两个 Nginx 节点共享一个虚拟 IP（VIP）
# 主节点宕机后，VIP 自动漂移到备用节点

# keepalived.conf 配置示例
vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 100
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass 1234
    }
    virtual_ipaddress {
        192.168.1.100/24  # 虚拟 IP
    }
}
```

### 13.4.3 共享文件存储

如果使用 Dashboard 图片导出、CSV 导出等功能，需要共享文件存储：

```yaml
# 使用 NFS 或 S3 作为共享存储
environment:
  # 使用 S3 存储导出文件
  - GF_IMAGE_STORAGE_PROVIDER=s3
  - GF_IMAGE_STORAGE_S3_BUCKET=grafana-exports
  - GF_IMAGE_STORAGE_S3_REGION=us-east-1
```

---

## 13.5 升级策略：滚动升级

高可用部署的一大优势是零停机升级。步骤如下：

```
步骤 1：从负载均衡器摘掉节点 1
  → docker-compose stop grafana-node-1

步骤 2：升级节点 1
  → 修改 docker-compose.yml 中的镜像版本
  → docker-compose up -d grafana-node-1

步骤 3：验证节点 1 正常
  → curl http://localhost:3001/api/health

步骤 4：将节点 1 重新加入负载均衡器
  → 无需操作，Nginx 会自动检测到节点恢复

步骤 5：重复步骤 1-4 依次升级节点 2、节点 3
```

---

## 13.6 真实案例：Grafana 宕机事故

**某金融科技公司** 使用单节点 Grafana 部署，运行了两年一直相安无事。直到有一天：

- 上午 10:00：运营团队发现线上 Grafana 响应缓慢
- 上午 10:15：Grafana 完全不可用，返回 502
- 上午 10:20：运维排查发现 Grafana 内存占用达到 4GB，触发了 OOM Killer
- 上午 10:25：Grafana 重启成功，但 10 分钟后再次 OOM
- 上午 10:45：紧急扩容服务器内存从 4GB 到 16GB
- 上午 11:00：服务恢复

**事故原因**：某个 Dashboard 的 PromQL 查询没有加时间范围限制，导致每次加载都查询全量数据，内存暴涨。

**事故影响**：
- 45 分钟完全不可用
- 期间线上出现了一次数据库慢查询，但因为 Grafana 挂了，没有人及时发现
- 最终 DBA 通过命令行排查才发现，慢查询持续了 30 分钟

**迁移到高可用后的效果**：
- 同样的 OOM 事件再次发生时，只有 1 个节点宕机
- 负载均衡器自动将流量切换到其他节点
- 运维有充足的时间排查和修复问题
- **对用户来说，完全无感知**

---

## 13.7 常见陷阱与解决方案

| 陷阱 | 症状 | 解决方案 |
|---|---|---|
| SQLite 被用于多节点 | 报错 "database is locked" | 切换到 MySQL/PostgreSQL |
| Session 未共享 | 登录节点 1 后切到节点 2 要重新登录 | 配置 Session Provider 为 MySQL/Redis |
| Dashboard 图片不一致 | 不同节点看到不同的图片 | 使用 S3/NFS 共享存储 |
| 时钟不同步 | 告警时间戳混乱 | 所有节点配置 NTP |
| 插件未同步 | 节点 A 有插件 B，节点 B 没有 | 使用 Provisioning 统一安装插件 |

---

## 13.8 练习

1. 使用 Docker Compose 部署 3 节点 Grafana 集群
2. 模拟一个节点宕机，验证故障转移是否正常
3. 配置 Nginx 负载均衡并测试 WebSocket 支持
4. 尝试滚动升级到新版本的 Grafana
5. 配置 Grafana Alerting HA 并验证不产生重复告警
