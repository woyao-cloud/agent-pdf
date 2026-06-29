# 第10章 腾讯云存储与数据库

## 10.1 概述

存储与数据库是云上应用的基石，也是 SRE 工程师日常运维中接触最频繁、故障影响面最大的基础设施组件。腾讯云提供了从对象存储、块存储到文件存储的完整存储产品矩阵，以及从关系型数据库、NoSQL 到分布式数据库的全品类数据库服务。本章将深入剖析这些产品的选型逻辑、架构原理、性能规划、容量管理以及备份恢复策略，并结合 Terraform 基础设施即代码的实践，帮助 SRE 工程师构建高可用、高性能、低成本的存储与数据库体系。

对于 SRE 而言，存储与数据库的选型决策一旦做出，后续迁移成本极高。因此，理解每个产品的底层架构、性能边界和适用场景，在项目初期做出正确的技术选型，是本章要解决的核心问题。

---

## 10.2 存储产品选型：COS / CBS / CFS

腾讯云提供三大核心存储产品：**对象存储 COS**、**块存储 CBS** 和**文件存储 CFS**。三者的底层架构、访问协议、性能特征和使用场景截然不同，选型错误将直接导致成本飙升或性能不达标。本节将从架构原理出发，给出清晰的选型决策框架。

### 10.2.1 对象存储 COS（Cloud Object Storage）

COS 是一种扁平化、无目录层次的分布式对象存储系统，数据以对象（Object）的形式存储在存储桶（Bucket）中，通过 HTTP/HTTPS 协议访问。COS 的设计理念源自 AWS S3，兼容 S3 API，因此大量云原生工具和 SDK 可以直接对接。

**架构特征：**

COS 的底层架构可以分为元数据层和数据层两个部分：

- **元数据层**：采用分布式 KV 存储引擎，负责维护 Bucket 和 Object 的元数据信息，包括对象名称、大小、ETag、创建时间、自定义元数据等。元数据层支持每秒百万级 QPS 的读写寻址，是 COS 高并发能力的核心保障。元数据按 Bucket 和 Object Key 的哈希值进行分片，确保请求均匀分布。

- **数据层**：采用分布式存储集群，数据以分片（Chunk）形式存储在数千台存储服务器上。每个 Chunk 默认保存 3 个副本，分布在不同的故障域（机架/可用区）中。对于冷数据，COS 支持纠删码（EC）模式，以 12+4 或 8+3 的 EC 策略替代三副本，在保证数据可靠性的前提下将存储成本降低 30-50%。

- **访问层**：提供统一的接入网关，负责请求认证、流量控制和协议转换。COS 的接入网关是无状态的水平扩展服务，可以根据负载自动扩缩容。

**存储等级：**

COS 提供四个存储等级，按访问频次递减排列：

| 存储等级 | 适用场景 | 持久性 | 可用性 | 最低存储时间 | 最小计费单位 |
|---------|---------|-------|-------|------------|------------|
| 标准存储（STANDARD） | 热数据、频繁访问 | 99.999999999% | 99.99% | 无 | 按实际存储量 |
| 低频存储（STANDARD_IA） | 近30天无访问的数据 | 99.999999999% | 99.99% | 30天 | 64KB |
| 归档存储（ARCHIVE） | 备份、历史数据 | 99.999999999% | 99.99%（需恢复） | 90天 | 64KB |
| 深度归档存储（DEEP_ARCHIVE） | 合规归档 | 99.999999999% | 99.99%（需恢复） | 180天 | 64KB |

**适用场景：**

- 静态网站托管：将 HTML/CSS/JS 文件上传至 COS，开启静态网站功能，配合 CDN 加速全球访问
- 图片/视频分发：作为源站存储，通过 CDN 边缘节点缓存分发，降低回源压力
- 日志归档：将应用日志、访问日志通过生命周期策略自动转为归档存储
- 大数据分析数据湖：作为 EMR、Spark、Presto 等计算引擎的共享数据源
- 云原生应用存储：兼容 AWS S3 API，MinIO、Rook 等工具可直接对接
- 备份存储：作为 CBS 快照、数据库备份、自定义备份的目标存储

**性能指标：**

- 单对象最大 5TB（上传单文件最大 5GB，超过需使用分片上传 Multipart Upload）
- 标准存储 PUT 延迟约 50-100ms，GET 延迟约 20-50ms
- 每秒请求数（QPS）默认 2000-5000，可提工单提升至数万
- 分片上传支持并发上传多个分片，每个分片最大 5GB，最小 100KB
- 内网访问免流量费，跨地域访问产生流量费

**最佳实践：**

1. **始终使用内网 Endpoint**：COS 提供内网域名 `cos.<region>.myqcloud.com`，同地域 CVM 访问免流量费，延迟更低
2. **大文件使用分片上传**：超过 100MB 的文件应使用分片上传，支持断点续传和并发加速
3. **开启版本控制**：防止误删除和覆盖，配合生命周期管理自动清理历史版本
4. **设置生命周期策略**：根据数据访问模式自动转换存储等级，降低存储成本
5. **使用 CDN 加速下载**：频繁访问的文件通过 CDN 分发，减少 COS 直接请求量

### 10.2.2 块存储 CBS（Cloud Block Storage）

CBS 提供类似物理硬盘的块级存储设备，挂载到 CVM 实例上使用。CBS 的本质是分布式存储系统对外暴露的虚拟块设备，通过 iSCSI 或 NVMe-oF 协议与 CVM 通信。对于运行在 CVM 上的操作系统和应用程序来说，CBS 就是一块普通的硬盘，可以格式化、分区、挂载。

**架构特征：**

CBS 的底层架构基于腾讯云自研的分布式存储引擎（Distributed Storage Engine, DSE）：

- **数据分布**：数据以 4MB 的 Chunk 为单位，通过一致性哈希算法分布到多个存储节点上。每个 Chunk 的 3 个副本分布在不同的故障域中，确保任意一个存储节点或机架故障不影响数据可用性。

- **IO 路径**：CVM 的 IO 请求通过高速网络（RDMA）直达存储节点，数据不经过中间层。写请求需要等待 3 副本全部确认后才返回成功，保证强一致性。

- **快照机制**：CBS 快照采用 Copy-on-Write（写时复制）技术。创建快照时，系统记录当前数据的时间点，后续写入新数据时，先将原数据块复制到快照空间，再写入新数据。这种机制使得快照创建瞬间完成，但首次写入性能会略有下降。

- **在线扩容**：CBS 支持在线扩容，无需重启 CVM。扩容后，文件系统层面需要执行 `resize2fs`（ext4）或 `xfs_growfs`（XFS）来识别新空间。

**性能模型：**

CBS 的性能由 IOPS、吞吐量和延迟三个维度衡量。不同类型云盘的性能基线如下：

| 云盘类型 | 最大 IOPS | 最大吞吐量 | 单路延迟 | 适用场景 |
|---------|-----------|-----------|---------|---------|
| 高性能云盘 | 6000 | 150 MB/s | 1-3 ms | 系统盘、低负载数据盘、日志存储 |
| SSD 云盘 | 26000 | 260 MB/s | 0.5-1 ms | 中等负载数据库、企业应用 |
| 增强型 SSD | 110000 | 1000 MB/s | 0.3-0.5 ms | 高负载 OLTP 数据库、实时分析 |
| 极速型 SSD | 1000000 | 4000 MB/s | 0.1-0.2 ms | 核心交易系统、高频交易、HPC |

**性能计算公式（以增强型 SSD 为例）：**

```
基准 IOPS = min(110000, 容量(GB) × 50)
基准吞吐量 = min(1000 MB/s, 容量(GB) × 0.5 MB/s)
```

这意味着，一块 500GB 的增强型 SSD 云盘，基准 IOPS 为 min(110000, 500×50=25000) = 25000，基准吞吐量为 min(1000, 500×0.5=250) = 250 MB/s。如果需要达到 110000 的最大 IOPS，需要购买 2200GB 以上的容量。

**突发性能：**

部分云盘类型支持 IOPS 突发。突发机制基于 Token Bucket 算法：

- 系统持续向 Token Bucket 中注入积分
- 当实际 IOPS 低于基准 IOPS 时，积分累积
- 当实际 IOPS 超过基准 IOPS 时，消耗积分
- 积分耗尽后，IOPS 被限制在基准值

突发能力对于应对流量尖峰非常有用，但需要监控积分余额，避免长时间高负载导致积分耗尽。

**适用场景：**

- CVM 系统盘和数据盘
- 关系型数据库（MySQL、SQL Server、PostgreSQL）的数据盘和日志盘
- NoSQL 数据库（MongoDB、Cassandra）的存储层
- 分布式存储系统（Ceph、MinIO）的底层 OSD 存储
- 容器持久化存储（配合 TKE 的 PV/PVC）
- 企业级应用（ERP、CRM）的数据存储

**最佳实践：**

1. **系统盘与数据盘分离**：系统盘使用高性能云盘，数据盘根据业务需求选择 SSD 或增强型 SSD
2. **数据盘与日志盘分离**：数据库场景下，将数据文件和日志文件放在不同的 CBS 云盘上，避免 IO 争用
3. **预留 20% 空闲空间**：文件系统使用率超过 80% 时，性能会显著下降，建议设置 80% 告警阈值
4. **使用 O_DIRECT**：数据库场景下，建议启用 O_DIRECT 绕过操作系统 Page Cache，减少双缓存开销
5. **定期监控 IO 延迟**：使用 `iostat -x 1` 监控 `await` 和 `svctm`，判断是否存在 IO 争用

### 10.2.3 文件存储 CFS（Cloud File Storage）

CFS 提供完全托管的 NFS/CIFS 共享文件存储，多个 CVM 实例可以同时挂载同一文件系统，实现数据共享。CFS 对用户完全透明，无需关心底层存储集群的运维。

**架构特征：**

CFS 的架构分为元数据节点和数据节点两层：

- **元数据节点（MDS）**：管理文件系统的目录结构、文件属性、权限信息。MDS 采用主备架构，主节点故障时自动切换，切换过程对客户端透明（NFS 重试机制自动恢复）。

- **数据节点（OSS）**：存储文件的实际数据。数据以 64KB 的 Chunk 为单位分布存储，每个 Chunk 三副本。数据节点可以水平扩展，容量和性能随节点数线性增长。

- **协议网关**：将 NFS/CIFS 协议请求转换为内部 RPC 请求。网关层负责连接管理、协议转换和访问控制。

**性能规格：**

| 规格类型 | 最大吞吐量 | 最大 IOPS | 延迟 | 适用场景 |
|---------|-----------|-----------|------|---------|
| 标准型 | 100 MB/s | 5000 | 5-10 ms | 文件共享、Web 服务 |
| 性能型 | 500 MB/s | 20000 | 2-5 ms | 高性能计算、媒体处理 |
| 极速型 | 2000 MB/s | 100000 | 1-2 ms | AI 训练、实时渲染 |

**适用场景：**

- 多个 CVM 共享数据（如 Web 集群共享上传目录、配置文件）
- 大数据分析（EMR 共享存储，多个计算节点访问同一份数据）
- 容器存储（TKE 的 PersistentVolume，使用 CFS 作为 ReadWriteMany 存储）
- 媒体处理、渲染农场（多个渲染节点共享素材和输出目录）
- 企业文件共享（替代传统 NAS）

**选型对比总结：**

| 维度 | COS | CBS | CFS |
|------|-----|-----|-----|
| 访问方式 | HTTP/HTTPS（RESTful API） | 块设备挂载（iSCSI/NVMe-oF） | 文件协议（NFS/CIFS） |
| 共享能力 | 全局共享（任意地点） | 单机挂载（有限共享） | 多机共享（同一 VPC） |
| 延迟 | 数十毫秒 | 亚毫秒级（0.1-0.5ms） | 毫秒级（1-10ms） |
| 扩容方式 | 自动扩容，按量计费 | 手动扩容，需规划容量 | 自动扩容，按量计费 |
| 成本 | 最低（按存储量 + 请求数） | 中等（按预配容量） | 中等（按存储量 + 吞吐量） |
| 持久化 | 三副本/EC | 三副本 | 三副本 |
| 协议兼容 | S3 兼容 | 标准块设备 | POSIX 兼容 |

**选型决策树：**

```
是否需要多机共享？
├── 是 → 是否需要 POSIX 兼容的文件语义？
│   ├── 是 → CFS
│   └── 否 → COS（对象存储语义）
└── 否 → 是否需要低延迟随机读写？
    ├── 是 → CBS
    └── 否 → COS
```

---

## 10.3 TDSQL 分布式数据库

### 10.3.1 产品体系

TDSQL 是腾讯云自研的分布式数据库产品家族，包含多个子产品线，覆盖从云原生到分布式、从 MySQL 兼容到 PostgreSQL 兼容的完整场景：

- **TDSQL-C（Cloud Native）**：云原生数据库，兼容 MySQL 8.0 和 PostgreSQL，计算与存储分离架构。适合中小型 OLTP 场景（数据量 < 2TB），支持秒级扩缩容。

- **TDSQL for MySQL**：分布式 MySQL 数据库，支持自动分片（Sharding）、读写分离、全局唯一 ID。适合大型 OLTP 场景（数据量 > 2TB 或写入 QPS > 5 万）。

- **TDSQL for PostgreSQL**：分布式 PostgreSQL 数据库，兼容 PostgreSQL 生态，支持 PostGIS、全文搜索等扩展。适合地理信息、金融风控等场景。

- **TDSQL TDStore**：基于 Paxos 协议的金融级分布式数据库，三节点强同步，数据零丢失。适合核心交易系统、支付系统等对数据一致性要求极高的场景。

### 10.3.2 TDSQL-C 架构深度解析

TDSQL-C 采用计算-存储分离架构，这是其与自建 MySQL 最本质的区别。理解这一架构差异，对于性能调优和故障排查至关重要。

**架构组件：**

```
┌─────────────────────────────────────────────┐
│              计算层 (CVM 集群)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ RW Node  │  │ RO Node  │  │ RO Node  │   │
│  │ (主节点)  │  │ (只读)   │  │ (只读)   │   │
│  │ 无状态    │  │ 无状态   │  │ 无状态   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │          │
└───────┼─────────────┼─────────────┼──────────┘
        │             │             │
        │   高速网络 (RDMA)          │
        └─────────────┼─────────────┘
                      │
        ┌─────────────┴─────────────┐
        │    存储层 (Chunk Server)    │
        │  ┌───┐ ┌───┐ ┌───┐ ┌───┐ │
        │  │C1 │ │C2 │ │C3 │ │C4 │ │
        │  └───┘ └───┘ └───┘ └───┘ │
        │  三副本 + 强一致性         │
        │  自动故障修复              │
        └───────────────────────────┘
```

**关键特性：**

1. **计算与存储分离**：计算节点（RW/RO）完全无状态，不存储任何持久化数据。故障时，新的计算节点可以在 5-10 秒内接管服务。存储节点自动处理数据分布、副本管理和故障修复。

2. **共享存储**：所有计算节点（主节点和只读节点）共享同一份存储数据。主节点写入的数据，只读节点立即可见，不存在传统主从复制的延迟问题。这意味着 TDSQL-C 的只读节点是真正的一写多读，而不是通过 Binlog 回放实现的异步复制。

3. **日志即数据库（Log is Database）**：这是 TDSQL-C 最核心的性能优化。传统 MySQL 在写入时，需要写 Redo Log 和写数据页（Page），产生两次 IO。TDSQL-C 将 Redo Log 持久化到共享存储层，数据页的更新在内存中完成，仅在需要时从存储层回放 Redo Log 构建数据页。这种方式将每次写入的网络 IO 减少约 50%。

4. **快照备份**：基于存储层的快照能力，TDSQL-C 可以在秒级创建快照，分钟级恢复到一个新实例。快照基于 Copy-on-Write 技术，创建时几乎不消耗存储空间和性能。

5. **自动弹性**：存储空间自动扩容，最大支持 6TB，无需预配存储容量。计算规格支持在线升降级，升降级过程中服务不中断。

**性能对比（与自建 MySQL 对比）：**

| 指标 | 自建 MySQL（本地 SSD） | TDSQL-C |
|------|----------------------|---------|
| 写入延迟 | 1-3 ms（双写 Redo + Data Page） | 0.5-1 ms（仅写 Redo Log） |
| 只读节点扩展 | 需搭建复制链路，有复制延迟 | 秒级添加 RO 节点，无延迟 |
| 存储扩容 | 需迁移数据，停机窗口 | 自动扩容，无感知 |
| 备份恢复 | 数小时（mysqldump/XtraBackup） | 分钟级（存储快照） |
| 故障切换 | 30-120 秒（检测 + 回放 Relay Log） | 5-10 秒（新计算节点挂载同一存储） |
| 计算规格变更 | 需重启实例 | 在线升降级 |

### 10.3.3 TDSQL for MySQL 分布式方案

当单库数据量超过 2TB 或写入 QPS 超过 5 万时，单机 MySQL 无法满足需求，需要引入分布式方案。TDSQL for MySQL 提供了对应用透明的自动分片能力。

**分片原理：**

TDSQL for MySQL 使用自动分片（Sharding）技术，对应用透明：

```
应用层
   │
   ├── SQL 请求
   │
┌──┴──────────────────────────────┐
│         SQL 引擎 (Proxy)         │
│  ┌────────────────────────────┐ │
│  │ SQL 解析 → 路由计算 → 分发  │ │
│  │ 结果聚合 → 返回             │ │
│  └────────────────────────────┘ │
└──┬──────────┬──────────┬───────┘
   │          │          │
┌──┴──┐   ┌──┴──┐   ┌──┴──┐
│Set1 │   │Set2 │   │Set3 │
│主+备│   │主+备│   │主+备│
│0-1  │   │2-3  │   │4-5  │
│TB   │   │TB   │   │TB   │
└─────┘   └─────┘   └─────┘
```

SQL 引擎（Proxy）是分布式方案的核心组件，负责：

1. **SQL 解析**：解析 SQL 语句，识别表名、条件、操作类型
2. **路由计算**：根据分片键和分片算法，计算 SQL 需要发送到哪些分片
3. **SQL 分发**：将 SQL 发送到目标分片执行
4. **结果聚合**：收集各分片的执行结果，进行排序、聚合、分页等操作
5. **返回结果**：将最终结果返回给应用

**分片键选择原则：**

分片键的选择直接影响分布式数据库的性能和扩展性，需要遵循以下原则：

1. **选择数据分布均匀的列**：如用户 ID、订单 ID、手机号。避免使用性别、地区等取值有限的列。
2. **避免使用时间戳作为分片键**：时间戳会导致数据写入集中在最新分片，产生写热点。
3. **关联查询的表使用相同的分片键**：如果订单表和订单详情表使用相同的分片键（订单 ID），关联查询可以在同一分片内完成，避免跨分片 JOIN。
4. **分片键一旦选定不可修改**：分片键是数据分布的根，修改需要重新分布全量数据，代价极高。

**分片算法：**

TDSQL 支持多种分片算法：

| 算法 | 原理 | 适用场景 |
|------|------|---------|
| HASH 取模 | 对分片键计算哈希值，对分片数取模 | 通用场景，数据分布均匀 |
| 一致性哈希 | 使用一致性哈希环，减少扩缩容时的数据迁移 | 需要频繁扩缩容的场景 |
| 范围分片 | 按分片键的值范围分片 | 按时间范围查询的场景 |
| 列表分片 | 按分片键的值列表分片 | 按地域、业务线分片的场景 |

**分布式事务：**

TDSQL 支持分布式事务（基于 XA 协议），但跨分片事务的性能开销较大：

- 两阶段提交（2PC）：Prepare 阶段和 Commit 阶段，需要多次网络往返
- 性能开销：跨分片事务的延迟约为单分片事务的 3-5 倍
- 建议：业务层面尽量避免跨分片事务，通过合理设计分片键将相关数据分布在同一分片

### 10.3.4 高可用架构

TDSQL 的高可用基于 RAFT/Paxos 一致性协议实现，确保在节点故障时数据不丢失、服务不中断：

- **三节点部署**：一主两备，分布在三个可用区。主节点处理读写请求，备节点同步数据并在主节点故障时接管。
- **自动故障检测**：通过心跳机制，5 秒内检测到节点故障。检测基于多数派决策，避免网络分区导致的误判。
- **自动切换**：10 秒内完成主备切换。切换过程对应用透明，应用只需重连即可。
- **数据零丢失**：基于强同步复制，事务提交前必须写入多数派节点（至少 2/3）。这意味着即使一个节点故障，已提交的事务数据也不会丢失。

**故障切换流程：**

```
1. 主节点故障（宕机/网络分区）
2. 备节点在 5 秒内检测到主节点心跳超时
3. 备节点发起选举，请求其他节点投票
4. 获得多数派投票的备节点成为新主节点
5. 新主节点回放 Redo Log，恢复未完成的事务
6. DNS/Proxy 更新路由信息，指向新主节点
7. 应用重连，继续提供服务
```

**RPO 和 RTO：**

- RPO = 0：基于强同步复制，已提交事务不丢失
- RTO < 10 秒：自动检测和切换，秒级恢复

---

## 10.4 Redis 内存数据库

### 10.4.1 产品类型

腾讯云 Redis 提供两种架构形态，分别适用于不同的业务场景：

| 类型 | 架构 | 分片数 | 副本数 | 适用场景 |
|------|------|--------|--------|---------|
| 标准版 | 单节点/主从 | 1 | 0-1 | 缓存、Session 共享、消息队列 |
| 集群版 | 分片集群 | 2-128 | 0-5 | 大容量（> 64GB）、高并发（> 10 万 QPS） |

**标准版**适用于数据量较小（< 64GB）、QPS 需求在 10 万以内的场景。标准版提供主从架构，主节点故障时自动切换到备节点。

**集群版**适用于数据量较大或并发要求较高的场景。集群版基于 Redis Cluster 协议，数据自动分片到多个节点，总容量和总 QPS 随分片数线性扩展。

### 10.4.2 集群版架构

集群版基于 Redis Cluster 协议，数据自动分片到 16384 个 Slot，每个 Slot 分布在不同的分片节点上：

```
┌──────────────────────────────────────┐
│           客户端 (Redis Cluster)       │
│   Smart Client / Redis Cluster SDK   │
│   自动路由到正确的分片节点             │
└────┬──────────┬──────────┬───────────┘
     │          │          │
┌────┴───┐ ┌───┴────┐ ┌───┴────┐
│Shard 1 │ │Shard 2 │ │Shard 3 │
│ 主+备  │ │ 主+备  │ │ 主+备  │
│0-5460  │ │5461-   │ │10923-  │
│ Slot   │ │10922   │ │16383   │
│ 8GB    │ │ 8GB    │ │ 8GB    │
└────────┘ └────────┘ └────────┘
```

**数据分片：**

- 16384 个 Slot 均匀分配到所有分片
- 每个 Key 通过 CRC16 哈希算法计算所属 Slot：`CRC16(key) % 16384`
- 客户端通过 CLUSTER SLOTS 命令获取 Slot 到节点的映射关系
- 支持 Hash Tag 机制：`{user:1001}.name` 和 `{user:1001}.email` 会路由到同一 Slot

**性能规划：**

- 单分片 QPS 约 8-10 万（读写混合场景）
- 总 QPS = 单分片 QPS × 分片数
- 延迟：同可用区内网 0.2-0.5ms，跨可用区 1-2ms
- 内存容量：单分片最大 64GB（标准版），集群版总容量 = 单分片容量 × 分片数

**扩缩容：**

集群版支持在线扩缩容，扩容过程对应用透明：

1. 新增分片节点
2. 将部分 Slot 从现有分片迁移到新分片
3. Slot 迁移过程中，Key 逐条迁移，迁移完成前旧分片继续提供服务
4. 迁移完成后，更新路由信息

### 10.4.3 持久化与备份

Redis 是内存数据库，但腾讯云 Redis 提供了多种持久化保障，确保数据在宕机或重启后不丢失：

**持久化方式：**

| 方式 | 原理 | 优点 | 缺点 | 默认启用 |
|------|------|------|------|---------|
| RDB | 定时生成全量快照 | 恢复速度快，文件紧凑 | 可能丢失两次快照间的数据 | 是（每 5 分钟） |
| AOF | 追加写操作日志 | 数据安全性高，丢失少 | 文件大，恢复速度慢 | 是（每秒 fsync） |
| 混合持久化 | RDB + AOF 增量 | 恢复快 + 数据安全 | 实现复杂 | 是（推荐） |

**混合持久化**是腾讯云 Redis 的默认持久化方式，结合了 RDB 和 AOF 的优点：

- 全量数据以 RDB 格式存储，恢复时直接加载，速度快
- 增量数据以 AOF 格式追加，数据安全性高
- 重启时先加载 RDB，再回放 AOF 增量，兼顾恢复速度和数据安全

**备份策略：**

- **自动备份**：每日自动备份，默认保留 7 天。备份时间窗口可配置，建议设置在业务低峰期。
- **手动备份**：随时创建备份，用于数据恢复或克隆。手动备份不会自动过期，需要手动删除。
- **跨地域备份**：将备份复制到其他地域，用于跨地域容灾。

**恢复策略：**

| 恢复方式 | 操作 | RTO | 适用场景 |
|---------|------|-----|---------|
| 恢复到新实例 | 从备份创建新实例 | 分钟级 | 数据恢复、测试环境搭建 |
| 原地恢复 | 覆盖当前实例数据 | 分钟级 | 数据误操作恢复 |
| 跨地域恢复 | 将备份复制到目标地域后恢复 | 小时级 | 跨地域容灾 |

### 10.4.4 内存淘汰策略

当 Redis 内存使用达到 `maxmemory` 限制时，Redis 会根据配置的淘汰策略删除部分 Key 以释放内存：

| 策略 | 行为 | 适用场景 |
|------|------|---------|
| noeviction | 不淘汰，写入报错（OOM） | 有状态存储，数据不可丢失 |
| allkeys-lru | 淘汰最近最少使用的 Key | 通用缓存场景 |
| volatile-lru | 淘汰设置了 TTL 的 Key 中最近最少使用的 | 混合存储（缓存 + 持久化） |
| allkeys-random | 随机淘汰 | 均匀访问场景 |
| volatile-random | 随机淘汰设置了 TTL 的 Key | 有时效性数据 |
| volatile-ttl | 淘汰 TTL 最小的 Key | 优先淘汰即将过期的数据 |
| allkeys-lfu | 淘汰最不经常使用的 Key | 访问频率差异大的场景 |
| volatile-lfu | 淘汰设置了 TTL 的 Key 中最不经常使用的 | 频率敏感的有时效性数据 |

**选型建议：**

- **纯缓存场景**：使用 `allkeys-lru`，确保缓存空间始终可用
- **有状态存储场景**：使用 `noeviction`，配合内存监控告警，在内存使用率达到 80% 时触发扩容
- **混合场景**：使用 `volatile-lru`，对需要持久化的 Key 不设置 TTL，对缓存 Key 设置 TTL

### 10.4.5 大 Key 治理

大 Key 是 Redis 最常见的性能问题来源，需要主动发现和治理：

**大 Key 的定义：**

| Key 类型 | 大 Key 阈值 | 超大 Key 阈值 |
|---------|------------|-------------|
| String | > 10KB | > 100KB |
| Hash | > 5000 字段 | > 50000 字段 |
| List | > 10000 元素 | > 100000 元素 |
| Set | > 5000 元素 | > 50000 元素 |
| Sorted Set | > 5000 元素 | > 50000 元素 |

**大 Key 的危害：**

1. **阻塞操作**：`DEL`、`KEYS`、`SMEMBERS` 等操作的时间复杂度为 O(N)，大 Key 会导致 Redis 主线程阻塞
2. **内存不均**：集群版中，大 Key 导致分片间内存分布不均，部分分片内存打满而其他分片空闲
3. **网络延迟**：大 Key 的读写操作需要传输大量数据，增加网络延迟
4. **复制延迟**：大 Key 的修改会导致主从复制传输大量数据，增加复制延迟

**大 Key 发现方法：**

```bash
# 使用 redis-cli 扫描大 Key
redis-cli --bigkeys

# 使用 MEMORY USAGE 命令分析指定 Key
redis-cli MEMORY USAGE user:session:1001

# 使用 SCAN 命令配合 TYPE 和 STRLEN/HLEN/LLEN 等命令
redis-cli --scan --pattern 'user:session:*' | xargs -I {} redis-cli STRLEN {}
```

**大 Key 治理方案：**

1. **拆分大 Key**：将大 Hash 拆分为多个小 Hash，如 `user:1001:profile`、`user:1001:orders`
2. **使用替代数据结构**：大 List 改用 Redis Stream，大 Set 改用 Bloom Filter
3. **设置 TTL**：为 Key 设置合理的过期时间，避免 Key 无限增长
4. **异步删除**：使用 `UNLINK` 替代 `DEL`，异步释放内存，不阻塞主线程

---

## 10.5 存储性能与容量规划

### 10.5.1 性能评估方法论

存储性能规划的核心是理解业务负载特征，然后匹配对应的存储产品。评估维度包括：

**IO 特征分析：**

| 维度 | OLTP 场景 | OLAP 场景 | 日志场景 |
|------|----------|----------|---------|
| IO 大小 | 4-16KB | 64KB-1MB | 1-4KB |
| 读写比例 | 80% 读 / 20% 写 | 90% 读 / 10% 写 | 100% 写 |
| 随机/顺序 | 随机 IO | 顺序 IO | 顺序 IO |
| 并发度 | 高并发（数百线程） | 低并发（数线程） | 中并发 |
| 延迟要求 | < 1ms | < 10ms | < 5ms |

**性能计算公式：**

```
IOPS 需求 = (每秒读写请求数) × (读写比例因子)
吞吐量需求 = IOPS × 平均 IO 大小
延迟要求 = 业务容忍的最大响应时间 - 计算时间 - 网络时间
```

**示例计算：**

一个电商订单系统，每秒 10000 次查询，每次查询读取 4KB 数据；每秒 500 次写入，每次写入 8KB：

```
读 IOPS = 10000
写 IOPS = 500
总 IOPS ≈ 10500
读吞吐 = 10000 × 4KB = 40MB/s
写吞吐 = 500 × 8KB = 4MB/s
总吞吐 ≈ 44MB/s
```

根据计算结果，推荐使用增强型 SSD 云盘，容量至少 500GB（基准 IOPS = 25000，基准吞吐量 = 250MB/s），满足 10500 IOPS 和 44MB/s 的需求。

### 10.5.2 容量规划

**COS 容量规划：**

```
总存储量 = 当前数据量 + 日均新增数据量 × 保留天数
月存储成本 = 各存储等级的数据量 × 对应单价
请求成本 = GET 请求数 × GET 单价 + PUT 请求数 × PUT 单价
流量成本 = 外网下行流量 × 流量单价
```

**容量优化策略：**

1. **生命周期管理**：标准存储 30 天后转为低频存储，90 天后转为归档存储
2. **版本控制开销**：每个历史版本占用额外空间，设置版本保留策略限制版本数量
3. **清单分析**：使用 COS 清单功能定期分析存储分布，识别可清理的冗余数据

**CBS 容量规划：**

```
系统盘：50GB（Linux）/ 100GB（Windows）起步
数据盘 = 业务数据量 × 1.2（20% 余量） + 日志空间 + 临时空间
```

**容量规划要点：**

1. **预留 20% 的空闲空间**：文件系统使用率超过 80% 时，碎片化加剧，性能下降
2. **监控磁盘使用率**：设置 80% 告警阈值，90% 紧急告警
3. **日志空间独立规划**：数据库 Binlog、应用日志、慢查询日志需要独立空间
4. **快照空间**：CBS 快照存储在 COS 上，不占用 CBS 容量，但会产生 COS 存储费用

**Redis 容量规划：**

```
数据量 = key 数量 × 平均 value 大小 × 序列化膨胀系数（约 1.5-2 倍）
实际内存需求 = 数据量 / (1 - 预留比例)
预留比例建议：20-30%
```

**容量规划要点：**

1. **预留 20-30% 内存**：用于 RDB 快照、复制缓冲区、客户端输出缓冲区
2. **分片间数据倾斜**：集群版中，各分片内存使用率差异应控制在 20% 以内
3. **设置 maxmemory 告警**：使用率 > 80% 触发告警，预留扩容时间
4. **Key 过期率监控**：大量 Key 同时过期会导致延迟抖动

### 10.5.3 性能监控与调优

**关键监控指标：**

| 指标 | COS | CBS | CFS | Redis |
|------|-----|-----|-----|-------|
| 延迟 | GET/PUT 延迟（P50/P99） | 平均 IO 延迟（await） | 读写延迟 | 平均/最大延迟（P99） |
| 吞吐 | 请求数/秒（QPS） | IOPS + 吞吐量（MB/s） | 吞吐量（MB/s） | QPS |
| 容量 | 存储量（GB） | 磁盘使用率（%） | 文件数/容量 | 内存使用率（%） |
| 错误率 | 4xx/5xx 状态码 | IO 错误 | 超时次数 | 连接拒绝、超时 |
| 其他 | 回源率 | IO 队列深度（avgqu-sz） | 活跃连接数 | 缓存命中率、Key 过期率 |

**CBS 性能调优：**

```bash
# 使用 fio 进行基准测试
# 随机读测试
fio --name=randread --ioengine=libaio --iodepth=64 --rw=randread \
    --bs=4k --direct=1 --size=10G --numjobs=4 --runtime=60 \
    --group_reporting

# 随机写测试
fio --name=randwrite --ioengine=libaio --iodepth=64 --rw=randwrite \
    --bs=4k --direct=1 --size=10G --numjobs=4 --runtime=60 \
    --group_reporting

# 混合读写测试
fio --name=randrw --ioengine=libaio --iodepth=64 --rw=randrw \
    --rwmixread=70 --bs=4k --direct=1 --size=10G --numjobs=4 \
    --runtime=60 --group_reporting
```

**调优要点：**

1. **IO 调度器**：推荐使用 none（NVMe）或 noop（SATA SSD），减少调度层开销
2. **O_DIRECT**：数据库场景启用 O_DIRECT 绕过 Page Cache，避免双缓存
3. **文件系统**：推荐 XFS（优于 ext4 的大文件和高并发场景）
4. **IO 队列深度**：适当提高队列深度（iodepth=64-128）可以提高 IOPS

**Redis 性能调优：**

```bash
# 查看慢查询日志
redis-cli SLOWLOG GET 100

# 查看内存使用详情
redis-cli INFO memory

# 查看命令统计
redis-cli INFO commandstats

# 查看客户端连接
redis-cli CLIENT LIST
```

**调优要点：**

1. **避免大 Key**：单个 String > 10KB 或单个 Hash > 5000 字段时，考虑拆分
2. **使用 Pipeline**：批量操作减少网络往返，提升吞吐量
3. **合理设置 TTL**：避免 Key 无限增长，同时避免大量 Key 同时过期
4. **连接池管理**：合理配置连接池大小，避免频繁创建和销毁连接

---

## 10.6 备份与恢复

### 10.6.1 备份策略设计原则

备份策略需要平衡三个目标：**恢复点目标（RPO）**、**恢复时间目标（RTO）** 和 **存储成本**。这三个目标相互制约，需要在成本和风险之间找到平衡点。

**备份金字塔：**

```
┌──────────────────────────────────┐
│        异地容灾备份               │  ← 跨地域，应对区域性灾难
│        RPO: 15-60 分钟            │    成本：高
├──────────────────────────────────┤
│        本地备份 + 跨可用区         │  ← 同地域跨 AZ
│        RPO: 5-30 分钟            │    成本：中
├──────────────────────────────────┤
│        每日全量备份               │  ← 每日一次
│        RPO: 24 小时              │    成本：低
├──────────────────────────────────┤
│        增量/日志备份              │  ← 每 5-30 分钟
│        RPO: 5-30 分钟            │    成本：低
├──────────────────────────────────┤
│        实时同步/复制              │  ← 秒级延迟
│        RPO: 秒级                 │    成本：最高
└──────────────────────────────────┘
```

**RPO 和 RTO 目标设定：**

| 业务等级 | RPO | RTO | 备份方案 |
|---------|-----|-----|---------|
| 核心交易系统 | 0（零丢失） | < 30 秒 | 强同步复制 + 跨 AZ 部署 |
| 重要业务系统 | < 5 分钟 | < 15 分钟 | 实时 Binlog 备份 + 每日快照 |
| 一般业务系统 | < 1 小时 | < 2 小时 | 每日全量备份 + 增量备份 |
| 非关键系统 | < 24 小时 | < 24 小时 | 每日全量备份 |

### 10.6.2 COS 备份方案

COS 本身是存储目标，但也可以作为备份源。COS 提供了多种数据保护机制：

**跨区域复制（Cross-Region Replication）：**

跨区域复制是 COS 最重要的容灾机制，将源桶的数据自动异步复制到目标地域的桶中：

- **触发条件**：源桶中对象的 PUT、POST、DELETE 操作
- **复制延迟**：RPO 约 15 分钟（取决于对象大小和网络带宽）
- **复制范围**：可以选择全桶复制或按前缀过滤
- **历史数据**：开启复制后，仅复制新写入的数据，历史数据需要手动复制

**版本控制：**

版本控制是防止误删除和覆盖的关键机制：

- 开启后，每次覆盖写操作会生成一个新版本，旧版本保留
- 删除操作会生成一个删除标记，不会真正删除数据
- 可以回滚到任意历史版本
- 需要配合生命周期管理，自动清理过期版本

**生命周期管理：**

生命周期管理可以自动执行存储等级转换和数据过期删除：

```hcl
# 生命周期策略示例
lifecycle_rule {
  filter_prefix = "logs/"
  
  # 30 天后转为低频存储
  transition {
    days          = 30
    storage_class = "STANDARD_IA"
  }
  
  # 90 天后转为归档存储
  transition {
    days          = 90
    storage_class = "ARCHIVE"
  }
  
  # 365 天后删除
  expiration {
    days = 365
  }
}
```

### 10.6.3 CBS 快照备份

CBS 快照是块存储的增量备份机制，是 CBS 数据保护的核心手段：

**快照原理：**

- **首次快照**：全量备份，记录 CBS 云盘上所有数据块的内容
- **后续快照**：增量备份，仅保存自上次快照以来发生变化的数据块
- **快照链**：快照之间存在依赖关系，删除早期快照时，数据会合并到后续快照中

**快照成本估算：**

```
每日快照成本 = 数据变化量 × 快照单价 × 保留天数

示例：100GB 数据盘，日变化量 5GB，保留 7 天
快照总大小 ≈ 100 + 5×6 = 130GB（首次全量 + 6 天增量）
月成本 ≈ 130GB × 0.12元/GB/月 = 15.6 元
```

**定期快照策略：**

腾讯云 CBS 支持自动定期快照策略，可以按小时、天、周创建快照：

| 策略类型 | 频率 | 保留规则 | 适用场景 |
|---------|------|---------|---------|
| 小时级快照 | 每 1-12 小时 | 按数量或时间 | 数据变化频繁的场景 |
| 日级快照 | 每天固定时间 | 按数量或时间 | 通用场景 |
| 周级快照 | 每周固定时间 | 按数量或时间 | 数据变化较慢的场景 |

**最佳实践：**

1. **关键数据盘开启自动快照**：数据库数据盘、应用数据盘
2. **快照保留策略**：日快照保留 7 天，周快照保留 4 周，月快照保留 12 个月
3. **快照命名规范**：`<实例名>-<盘符>-<日期>-<类型>`，便于管理和检索
4. **定期验证快照**：从快照创建云盘并挂载到测试实例，验证数据完整性

### 10.6.4 数据库备份与恢复

**TDSQL 备份体系：**

TDSQL 提供多层备份机制，覆盖不同的 RPO 需求：

| 备份类型 | 频率 | 保留时间 | RPO | RTO | 存储位置 |
|---------|------|---------|-----|-----|---------|
| 自动快照备份 | 每日 | 7 天（可配置） | 24 小时 | 分钟级 | COS |
| Binlog 备份 | 实时（每 5 秒） | 5 天（可配置） | 秒级 | 分钟级 | COS |
| 手动备份 | 按需 | 自定义 | - | 分钟级 | COS |

**时间点恢复（PITR）：**

TDSQL 支持恢复到任意时间点，原理如下：

```
恢复时间点 T
    │
    ▼
┌──────────┐    ┌──────────────────┐
│ 全量备份  │ ← 选择距离 T 最近的全量备份
│ (快照)    │
└────┬─────┘
     │ 恢复全量数据
     ▼
┌──────────┐    ┌──────────────────┐
│ Binlog   │ ← 回放从全量备份时间点到 T 的 Binlog
│ 回放      │
└──────────┘
     │
     ▼
┌──────────┐
│ 恢复完成  │
│ 数据在 T  │
│ 时间点    │
└──────────┘
```

**恢复操作类型：**

1. **恢复到新实例（克隆）**：从备份创建一个新的 TDSQL 实例，不影响现有实例
2. **原地恢复**：将备份恢复到当前实例，覆盖现有数据
3. **跨地域恢复**：将备份复制到其他地域，创建新实例

**Redis 备份体系：**

| 备份类型 | 频率 | 保留时间 | RPO | RTO |
|---------|------|---------|-----|-----|
| 自动备份 | 每日 | 7 天（可配置） | 24 小时 | 分钟级 |
| 手动备份 | 按需 | 自定义 | - | 分钟级 |

**恢复操作类型：**

1. **恢复到新实例（克隆）**：从备份创建新的 Redis 实例
2. **跨地域恢复**：将备份复制到目标地域后恢复

### 10.6.5 备份恢复演练

定期进行备份恢复演练是验证备份有效性的唯一手段。很多事故中，备份文件损坏或恢复流程不可用导致数据永久丢失，根源在于从未演练过。

**演练频率建议：**

| 演练类型 | 频率 | 说明 |
|---------|------|------|
| 全量恢复演练 | 每季度一次 | 从全量备份恢复到新实例，验证数据完整性 |
| 时间点恢复演练 | 每半年一次 | 恢复到指定时间点，验证 PITR 功能 |
| 跨地域容灾演练 | 每年一次 | 在灾备地域恢复全量数据，验证容灾流程 |
| 故障切换演练 | 每半年一次 | 模拟主节点故障，验证自动切换流程 |

**演练检查清单：**

1. 备份文件是否完整可读（校验和验证）
2. 恢复时间是否在 RTO 范围内
3. 恢复后的数据一致性是否满足要求（数据量、关键记录校验）
4. 恢复后的应用功能是否正常（冒烟测试）
5. 演练过程文档化，记录问题和改进项
6. 更新运维手册和 Runbook

**演练报告模板：**

```yaml
演练日期: 2025-06-15
演练类型: TDSQL 时间点恢复
演练目标: 验证恢复到 2025-06-14 14:30:00 的能力
演练结果: 成功
恢复耗时: 12 分钟（RTO 目标 15 分钟）
数据一致性: 通过（校验 1000 条关键记录）
发现问题:
  - 备份文件校验步骤缺失，已补充到运维手册
  - 恢复后应用连接池未自动刷新，已修复
改进措施:
  - 增加备份文件自动校验脚本
  - 优化应用连接池刷新逻辑
```

---

## 10.7 Terraform 基础设施即代码实践

### 10.7.1 环境准备

```hcl
# versions.tf
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = ">= 1.79.0"
    }
  }
}

# provider.tf
provider "tencentcloud" {
  secret_id  = var.secret_id
  secret_key = var.secret_key
  region     = var.region
}

# 灾备地域 Provider
provider "tencentcloud" {
  alias      = "dr"
  secret_id  = var.secret_id
  secret_key = var.secret_key
  region     = var.dr_region
}
```

### 10.7.2 COS 存储桶完整配置

```hcl
# cos_bucket.tf

# 生产环境存储桶
resource "tencentcloud_cos_bucket" "production" {
  bucket = "prod-data-${var.app_id}"
  acl    = "private"

  # 开启版本控制，防止误删除
  versioning_enabled = true

  # 跨区域复制到灾备地域
  replication {
    status  = "enabled"
    bucket  = tencentcloud_cos_bucket.dr.id
    prefix  = ""
  }

  # 服务端加密
  encryption {
    sse_algorithm = "AES256"
  }

  # 日志管理
  log_enabled = true
  log_prefix  = "cos-access-logs/"

  # 生命周期管理
  lifecycle_rule {
    filter_prefix = "logs/"
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 90
      storage_class = "ARCHIVE"
    }
    expiration {
      days = 365
    }
  }

  lifecycle_rule {
    filter_prefix = "backups/"
    transition {
      days          = 7
      storage_class = "ARCHIVE"
    }
    expiration {
      days = 730  # 2 年
    }
  }

  lifecycle_rule {
    filter_prefix = ""
    # 非当前版本的对象 30 天后转为归档
    noncurrent_version_transition {
      days          = 30
      storage_class = "ARCHIVE"
    }
    # 非当前版本的对象 90 天后删除
    noncurrent_version_expiration {
      days = 90
    }
  }

  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# 灾备存储桶
resource "tencentcloud_cos_bucket" "dr" {
  provider = tencentcloud.dr
  bucket   = "prod-data-dr-${var.app_id}"
  acl      = "private"
  versioning_enabled = true

  tags = {
    Environment = "dr"
    ManagedBy   = "terraform"
  }
}

# 跨账号访问策略
resource "tencentcloud_cos_bucket_policy" "cross_account" {
  bucket = tencentcloud_cos_bucket.production.id
  policy = jsonencode({
    version = "2.0"
    statement = [
      {
        effect    = "Allow"
        principal = {
          qcs = ["qcs::cam::uin/${var.backup_account_uin}:root"]
        }
        action = [
          "name/cos:GetObject",
          "name/cos:ListBucket"
        ]
        resource = [
          "qcs::cos:${var.region}:uid/${var.app_id}:${tencentcloud_cos_bucket.production.bucket}/*",
          "qcs::cos:${var.region}:uid/${var.app_id}:${tencentcloud_cos_bucket.production.bucket}/"
        ]
      }
    ]
  })
}
```

### 10.7.3 TDSQL-C MySQL 实例

```hcl
# tdsql_c.tf

# 创建 TDSQL-C MySQL 集群
resource "tencentcloud_cynosdb_cluster" "main" {
  available_zone               = var.zone
  vpc_id                       = var.vpc_id
  subnet_id                    = var.subnet_id
  db_type                      = "MYSQL"
  db_version                   = "8.0"
  storage_limit                = 1000  # GB，自动扩容上限
  cluster_name                 = "prod-tdsql-c"
  instance_maintain_duration   = 7200  # 维护窗口时长（秒）
  instance_maintain_start_time = "02:00"
  instance_maintain_weekdays   = ["Mon", "Wed", "Fri"]
  auto_renew_flag              = 1
  project_id                   = var.project_id

  # 参数模板
  param_template {
    template_id = var.mysql_param_template_id
  }

  tags = {
    Environment = "production"
    Service     = "main-database"
  }
}

# 主实例（读写节点）
resource "tencentcloud_cynosdb_readonly_instance" "primary" {
  cluster_id         = tencentcloud_cynosdb_cluster.main.id
  instance_name      = "prod-tdsql-c-primary"
  instance_cpu_core  = 8
  instance_memory_size = 32  # GB
  instance_role      = "master"
  device_type        = "exclusive"  # 独享型，保障性能稳定
}

# 只读实例（扩展读能力）
resource "tencentcloud_cynosdb_readonly_instance" "readonly" {
  count = 2

  cluster_id         = tencentcloud_cynosdb_cluster.main.id
  instance_name      = "prod-tdsql-c-ro-${count.index + 1}"
  instance_cpu_core  = 4
  instance_memory_size = 16
  instance_role      = "readonly"
  device_type        = "exclusive"
}

# 数据库账号
resource "tencentcloud_cynosdb_account" "app" {
  cluster_id   = tencentcloud_cynosdb_cluster.main.id
  account_name = "app_user"
  password     = var.db_password
  host         = "%"
  description  = "Application account"
}

# 数据库
resource "tencentcloud_cynosdb_database" "app" {
  cluster_id   = tencentcloud_cynosdb_cluster.main.id
  db_name      = "app_db"
  character_set = "utf8mb4"
}

# 账号权限
resource "tencentcloud_cynosdb_account_privileges" "app" {
  cluster_id    = tencentcloud_cynosdb_cluster.main.id
  account_name  = tencentcloud_cynosdb_account.app.account_name
  host          = tencentcloud_cynosdb_account.app.host
  db_table_privileges {
    db          = tencentcloud_cynosdb_database.app.db_name
    table_name  = "*"
    privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "INDEX"]
  }
}

# 备份策略
resource "tencentcloud_cynosdb_cluster_password_complexity" "backup_config" {
  cluster_id = tencentcloud_cynosdb_cluster.main.id

  auto_backup_enabled      = true
  auto_backup_time         = "03:00-04:00"
  auto_backup_retention_days = 7
  binlog_retention_days    = 5
}
```

### 10.7.4 TDSQL for MySQL 分布式实例

```hcl
# tdsql_distributed.tf

# 分布式数据库实例
resource "tencentcloud_dcdb_instance" "distributed" {
  instance_name      = "prod-tdsql-dist"
  shard_memory       = 16    # GB/分片
  shard_storage      = 200   # GB/分片
  shard_node_count   = 2     # 每分片节点数（一主一备）
  shard_count        = 4     # 分片数，总容量 = 4 × 200GB = 800GB
  vpc_id             = var.vpc_id
  subnet_id          = var.subnet_id
  db_version_id      = "8.0"
  project_id         = var.project_id
  security_group_ids = [var.security_group_id]

  # 参数配置
  parameters = {
    "max_connections"        = "2000"
    "character_set_server"   = "utf8mb4"
    "innodb_buffer_pool_size" = "137438953472"  # 128GB
    "long_query_time"        = "2"
    "slow_query_log"         = "ON"
  }

  tags = {
    Environment = "production"
    Service     = "distributed-database"
  }
}

# 应用账号
resource "tencentcloud_dcdb_account" "app" {
  instance_id = tencentcloud_dcdb_instance.distributed.id
  user_name   = "app_user"
  host        = "%"
  password    = var.db_password
  description = "Application account"
}

# 业务数据库
resource "tencentcloud_dcdb_database" "app" {
  instance_id   = tencentcloud_dcdb_instance.distributed.id
  db_name       = "app_db"
  character_set = "utf8mb4"
}

# 安全组规则
resource "tencentcloud_security_group_rule" "dcdb_access" {
  security_group_id = var.security_group_id
  type              = "ingress"
  cidr_ip           = var.allowed_cidr_blocks
  ip_protocol       = "TCP"
  port_range        = "3306"
  policy            = "accept"
  description       = "Allow application access to TDSQL"
}
```

### 10.7.5 Redis 内存数据库

```hcl
# redis.tf

# 标准版 Redis（主从架构，用于缓存）
resource "tencentcloud_redis_instance" "cache" {
  availability_zone  = var.zone
  type_id            = 7  # 7=标准版主从, 6=集群版
  mem_size           = 8192  # 8GB
  name               = "prod-redis-cache"
  port               = 6379
  vpc_id             = var.vpc_id
  subnet_id          = var.subnet_id
  password           = var.redis_password
  security_groups    = [var.security_group_id]

  # 自动备份
  auto_backup = true
  backup_time = "03:00-04:00"
  backup_period = ["Monday", "Wednesday", "Friday"]

  # 参数配置
  params = {
    "timeout"             = "300"
    "maxmemory-policy"    = "allkeys-lru"
    "hash-max-ziplist-entries" = "512"
    "set-max-intset-entries"   = "512"
    "zset-max-ziplist-entries" = "128"
  }

  tags = {
    Environment = "production"
    Role        = "cache"
  }
}

# 集群版 Redis（分片架构，用于 Session 存储）
resource "tencentcloud_redis_instance" "cluster" {
  availability_zone  = var.zone
  type_id            = 6  # 集群版
  mem_size           = 16384  # 16GB 总容量
  redis_shard_num    = 8      # 8 个分片，每分片 2GB
  redis_replicas_num = 1      # 每个分片 1 个副本
  name               = "prod-redis-cluster"
  port               = 6379
  vpc_id             = var.vpc_id
  subnet_id          = var.subnet_id
  password           = var.redis_password
  security_groups    = [var.security_group_id]

  # 自动备份
  auto_backup = true
  backup_time = "04:00-05:00"
  backup_period = ["Tuesday", "Thursday", "Saturday"]

  # 参数配置
  params = {
    "maxmemory-policy"    = "volatile-lru"
    "cluster-slot-cfg"    = "enabled"
    "hz"                  = "10"
  }

  tags = {
    Environment = "production"
    Role        = "session-store"
  }
}

# Redis 安全组规则
resource "tencentcloud_security_group_rule" "redis_access" {
  security_group_id = var.security_group_id
  type              = "ingress"
  cidr_ip           = var.allowed_cidr_blocks
  ip_protocol       = "TCP"
  port_range        = "6379"
  policy            = "accept"
  description       = "Allow application access to Redis"
}
```

### 10.7.6 变量与输出

```hcl
# variables.tf
variable "app_id" {
  description = "腾讯云 APP ID"
  type        = string
}

variable "region" {
  description = "主地域"
  type        = string
  default     = "ap-guangzhou"
}

variable "dr_region" {
  description = "灾备地域"
  type        = string
  default     = "ap-shanghai"
}

variable "zone" {
  description = "可用区"
  type        = string
  default     = "ap-guangzhou-3"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_id" {
  description = "子网 ID"
  type        = string
}

variable "project_id" {
  description = "项目 ID"
  type        = number
  default     = 0
}

variable "security_group_id" {
  description = "安全组 ID"
  type        = string
}

variable "allowed_cidr_blocks" {
  description = "允许访问的 CIDR 网段"
  type        = list(string)
  default     = ["10.0.0.0/8"]
}

variable "db_password" {
  description = "数据库密码"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Redis 密码"
  type        = string
  sensitive   = true
}

variable "mysql_param_template_id" {
  description = "MySQL 参数模板 ID"
  type        = number
  default     = 0
}

variable "backup_account_uin" {
  description = "备份账号 UIN"
  type        = string
  default     = ""
}

# outputs.tf
output "cos_bucket_id" {
  description = "生产 COS 存储桶 ID"
  value       = tencentcloud_cos_bucket.production.id
}

output "cos_bucket_dr_id" {
  description = "灾备 COS 存储桶 ID"
  value       = tencentcloud_cos_bucket.dr.id
}

output "tdsql_c_cluster_id" {
  description = "TDSQL-C 集群 ID"
  value       = tencentcloud_cynosdb_cluster.main.id
}

output "tdsql_c_endpoint" {
  description = "TDSQL-C 主实例连接地址"
  value       = tencentcloud_cynosdb_readonly_instance.primary.instance_addr
}

output "tdsql_c_port" {
  description = "TDSQL-C 端口"
  value       = tencentcloud_cynosdb_readonly_instance.primary.instance_port
}

output "redis_cache_endpoint" {
  description = "Redis 缓存实例连接地址"
  value       = tencentcloud_redis_instance.cache.ip
}

output "redis_cache_port" {
  description = "Redis 缓存实例端口"
  value       = tencentcloud_redis_instance.cache.port
}

output "redis_cluster_endpoint" {
  description = "Redis 集群实例连接地址"
  value       = tencentcloud_redis_instance.cluster.ip
}

output "redis_cluster_port" {
  description = "Redis 集群实例端口"
  value       = tencentcloud_redis_instance.cluster.port
}
```

### 10.7.7 状态管理与远程存储

```hcl
# backend.tf
terraform {
  backend "cos" {
    bucket     = "terraform-state-${var.app_id}"
    prefix     = "production/storage-db"
    region     = "ap-guangzhou"
    encrypt    = true
    acl        = "private"
  }
}
```

### 10.7.8 部署命令

```bash
# 初始化 Terraform
terraform init

# 预览变更
terraform plan -out=tfplan

# 应用变更
terraform apply tfplan

# 销毁资源（谨慎使用）
terraform destroy
```

---

## 10.8 最佳实践总结

### 10.8.1 存储选型速查表

| 业务场景 | 推荐方案 | 备选方案 | 关键考量 |
|---------|---------|---------|---------|
| 静态文件托管 | COS + CDN | CFS + Nginx | 成本、全球加速 |
| 数据库数据盘 | CBS 增强型 SSD | CBS 极速型 SSD | IOPS、延迟 |
| 容器持久化存储 | CFS | CBS（块存储） | 共享能力、协议兼容 |
| 日志归档 | COS 低频/归档 | - | 成本、生命周期管理 |
| 大数据分析 | COS + EMR | CFS + EMR | 吞吐量、并发访问 |
| 共享文件系统 | CFS | COS（对象语义） | POSIX 兼容性 |
| 备份存储 | COS 归档 | CBS 快照 | 成本、恢复速度 |
| 高性能计算 | CBS 极速型 SSD | CFS 极速型 | 延迟、吞吐量 |

### 10.8.2 数据库选型速查表

| 业务场景 | 推荐方案 | 备选方案 | 关键考量 |
|---------|---------|---------|---------|
| 中小型 OLTP（< 2TB） | TDSQL-C MySQL | 自建 MySQL + CBS | 运维成本、弹性 |
| 大型 OLTP（> 2TB） | TDSQL for MySQL 分布式 | TDSQL-C + 读写分离 | 分片键设计、扩展性 |
| 高并发缓存 | Redis 集群版 | Redis 标准版 + 客户端分片 | QPS、容量 |
| 分析型查询 | TDSQL-C PostgreSQL | TDSQL for PostgreSQL | 分析函数、扩展 |
| 金融级强一致性 | TDSQL TDStore | TDSQL for MySQL 三节点 | 一致性、RPO=0 |
| Session 存储 | Redis 标准版 | Redis 集群版 | 延迟、可用性 |
| 消息队列 | Redis Stream | CMQ/CKafka | 持久化、可靠性 |

### 10.8.3 成本优化建议

1. **COS 生命周期策略**：30 天未访问数据自动转为低频存储，90 天转为归档存储，可节省 50-80% 存储成本
2. **CBS 快照管理**：删除过期快照，使用定期快照策略而非手动快照，避免快照链过长
3. **TDSQL 存储自动扩容**：设置合理的存储上限，避免过度预配，TDSQL-C 按实际使用量计费
4. **Redis 内存规划**：使用 `allkeys-lru` 淘汰策略，避免内存浪费；合理设置 TTL 及时释放空间
5. **预留实例**：长期使用的 CBS 和 TDSQL 实例购买预留实例（1 年/3 年），节省 30-50% 成本
6. **按需扩缩容**：TDSQL-C 支持秒级升降级，低峰期降低规格，高峰期提升规格
7. **COS 请求优化**：批量操作减少请求次数，使用 CDN 缓存减少直接请求

### 10.8.4 运维检查清单

**每日检查：**

- COS 存储桶访问日志是否有异常（错误率突增）
- CBS 云盘 IOPS 和延迟是否在基线范围内
- TDSQL 慢查询日志，分析 TOP 10 慢 SQL
- Redis 内存使用率和 Key 过期率
- 数据库连接数和活跃会话数

**每周检查：**

- 备份任务执行状态和备份文件完整性
- 存储容量趋势，预测剩余可用天数
- 数据库 Binlog 备份延迟
- CBS 快照链长度和存储空间

**每月检查：**

- 备份恢复演练结果回顾
- 成本分析报告，识别异常增长
- 安全合规检查（加密、访问控制、审计日志）
- 存储性能趋势分析，识别性能退化

**每季度检查：**

- 全量恢复演练（从备份恢复到新实例）
- 容量规划回顾和扩容计划
- 架构评审（是否需要引入分布式方案）
- Terraform 配置审计（是否有漂移）

---

## 10.9 常见问题排查

### 10.9.1 COS 访问延迟高

**可能原因：**

1. **跨地域访问**：客户端与 COS 不在同一地域，请求经过公网
2. **未使用内网 Endpoint**：使用公网域名而非内网域名
3. **大文件未分片上传**：单文件超过 100MB 未使用分片上传
4. **请求频率过高触发限流**：QPS 超过默认限制

**排查步骤：**

```bash
# 1. 确认客户端与 COS 在同一地域
curl -s http://cos.ap-guangzhou.myqcloud.com/ | head -5

# 2. 检查是否使用内网域名
# 内网域名格式：<bucket>.cos.<region>.myqcloud.com
# 公网域名格式：<bucket>.cos.<region>.myqcloud.com（同地域 CVM 自动解析为内网 IP）

# 3. 测试延迟
time curl -o /dev/null -s http://<bucket>.cos.ap-guangzhou.myqcloud.com/test.txt

# 4. 查看 COS 监控
# 控制台 → COS → 监控 → 请求延迟
```

**解决方案：**

1. 确保 CVM 和 COS 在同一地域
2. 使用内网 Endpoint（同地域 CVM 自动解析）
3. 大文件使用分片上传 SDK
4. 提工单提升 QPS 限制

### 10.9.2 CBS 性能不达标

**可能原因：**

1. **云盘类型选择不当**：使用高性能云盘运行数据库
2. **操作系统 IO 调度器配置不当**：使用 CFQ 而非 none/noop
3. **实例规格限制**：突发性能实例的 CPU 积分不足
4. **数据盘未格式化对齐**：分区未 4K 对齐
5. **文件系统使用率过高**：超过 80% 导致性能下降

**排查步骤：**

```bash
# 1. 使用 fio 验证云盘基准性能
fio --name=test --ioengine=libaio --iodepth=64 --rw=randread \
    --bs=4k --direct=1 --size=10G --numjobs=4 --runtime=60 \
    --group_reporting

# 2. 检查 IO 调度器
cat /sys/block/vda/queue/scheduler
# 推荐输出: [none] mq-deadline 或 [noop] deadline

# 3. 检查分区对齐
parted /dev/vda align-check optimal 1
# 输出: 1 aligned

# 4. 检查磁盘使用率
df -h /data
# 使用率应 < 80%

# 5. 监控 IO 延迟
iostat -x 1
# 关注: await（平均 IO 延迟）, svctm（服务时间）, avgqu-sz（队列深度）
```

**解决方案：**

1. 升级云盘类型（高性能云盘 → SSD → 增强型 SSD）
2. 调整 IO 调度器为 none 或 noop
3. 升级实例规格
4. 重新分区并 4K 对齐
5. 扩容云盘或清理数据

### 10.9.3 TDSQL 慢查询

**可能原因：**

1. **缺少索引或索引选择错误**：全表扫描
2. **数据分布不均导致跨分片查询**：分布式场景
3. **锁等待**：行锁、间隙锁、MDL 锁
4. **大事务导致 Undo 膨胀**：长事务
5. **Buffer Pool 不足**：频繁的磁盘 IO

**排查步骤：**

```sql
-- 1. 查看慢查询日志
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';

-- 2. 分析慢 SQL 执行计划
EXPLAIN SELECT * FROM orders WHERE user_id = 1001;

-- 3. 查看当前运行的查询
SHOW FULL PROCESSLIST;

-- 4. 查看锁等待
SELECT * FROM information_schema.INNODB_TRX\G
SELECT * FROM information_schema.INNODB_LOCKS\G
SELECT * FROM information_schema.INNODB_LOCK_WAITS\G

-- 5. 查看 Buffer Pool 状态
SHOW ENGINE INNODB STATUS\G
```

**解决方案：**

1. 添加合适的索引
2. 优化 SQL 语句，避免 SELECT *
3. 拆分大事务为小事务
4. 增加 Buffer Pool 大小
5. 分布式场景优化分片键设计

### 10.9.4 Redis 内存打满

**可能原因：**

1. **大 Key 未及时清理**：单个 Key 占用大量内存
2. **内存淘汰策略配置不当**：使用 noeviction 导致写入报错
3. **业务流量突增**：短时间内大量数据写入
4. **Key 未设置 TTL**：数据持续增长不释放

**排查步骤：**

```bash
# 1. 查看内存使用详情
redis-cli INFO memory
# 关注: used_memory, used_memory_rss, maxmemory, mem_fragmentation_ratio

# 2. 扫描大 Key
redis-cli --bigkeys

# 3. 分析 Key 的 TTL 分布
redis-cli --scan --pattern '*' | head -1000 | while read key; do
    ttl=$(redis-cli TTL "$key")
    if [ "$ttl" -eq -1 ]; then
        echo "NO TTL: $key"
    fi
done

# 4. 查看命令统计
redis-cli INFO commandstats

# 5. 查看客户端连接
redis-cli CLIENT LIST
```

**解决方案：**

1. 拆分大 Key（大 Hash 拆分为多个小 Hash）
2. 调整淘汰策略为 allkeys-lru
3. 为 Key 设置合理的 TTL
4. 扩容 Redis 实例
5. 使用 UNLINK 异步删除大 Key

---

## 10.10 本章小结

本章从 SRE 工程师的视角，系统性地介绍了腾讯云存储与数据库产品的选型、架构、性能规划、备份恢复和基础设施即代码实践。

**核心要点回顾：**

1. **存储选型**：根据共享需求、延迟要求和访问协议选择 COS/CBS/CFS。COS 适合对象存储和归档，CBS 适合低延迟块存储，CFS 适合多机共享文件存储。

2. **数据库选型**：根据数据量、并发量和一致性要求选择 TDSQL-C 或 TDSQL 分布式。TDSQL-C 适合中小型 OLTP 场景，TDSQL 分布式适合大型 OLTP 场景。

3. **Redis 规划**：关注内存使用率、大 Key 和淘汰策略。标准版适合中小规模缓存，集群版适合大容量高并发场景。

4. **备份策略**：平衡 RPO、RTO 和成本，定期演练验证。COS 跨区域复制、CBS 快照、TDSQL Binlog 备份和 Redis 自动备份构成了完整的备份体系。

5. **基础设施即代码**：使用 Terraform 管理存储和数据库资源，实现可重复、可审计的部署。状态文件存储在 COS 上，实现团队协作。

**SRE 黄金法则：**

- **监控先行**：在部署任何存储或数据库资源之前，先配置好监控和告警
- **容量规划**：持续监控容量趋势，提前规划扩容
- **备份验证**：定期演练恢复流程，确保备份可用
- **文档化**：所有架构决策、运维流程、故障处理步骤文档化
- **自动化**：使用 Terraform 等 IaC 工具管理基础设施，减少人工操作

下一章将深入探讨腾讯云网络架构，包括 VPC 设计、NAT 网关、对等连接和混合云网络方案。
