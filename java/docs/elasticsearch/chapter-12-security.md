# 第12章 安全、权限与多租户隔离

## 本章导读

ES 的安全问题在集群暴露到公网时变得尤为尖锐。2019 年发生过一起著名的安全事件：某公司未配置任何安全认证的 ES 集群被黑客入侵，数据被加密，对方勒索比特币。ES 的默认配置是"无认证、无加密"——这在开发环境中方便，但在生产环境直接暴露公网等于敞开大门。

从 ES 7.x 开始，安全功能（认证、授权、加密）免费提供，不需要付费订阅。本章将讲解如何在 ES 中配置 RBAC（基于角色的访问控制）以及多租户隔离架构。

---

## 12.1 RBAC 权限控制

### 三个核心概念

ES 的权限控制模型建立在三个核心概念之上：

```
RBAC 模型：

  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  用户 (User)  │────►│  角色 (Role)  │────►│  权限 (Priv)  │
  ├──────────────┤     ├──────────────┤     ├──────────────┤
  │  admin       │     │  admin_role  │     │  cluster:all │
  │  log_writer  │     │  writer_role │     │  index:write │
  │  log_reader  │     │  reader_role │     │  index:read  │
  │  app_svc     │     │  svc_role    │     │  index:read  │
  └──────────────┘     └──────────────┘     └──────────────┘

  用户继承角色的所有权限
  一个用户可以拥有多个角色
```

### 开启安全功能

```yaml
# elasticsearch.yml 开启安全功能
xpack.security.enabled: true
xpack.security.enrollment.enabled: true
xpack.security.http.ssl:                # HTTP 通信加密
  enabled: true
  keystore.path: certs/http.p12
xpack.security.transport.ssl:           # 节点间通信加密
  enabled: true
  verification_mode: certificate
  keystore.path: certs/transport.p12
  truststore.path: certs/transport.p12
```

```bash
# 首次部署时生成密码
docker exec es-node1 ./bin/elasticsearch-setup-passwords auto

# 输出：
# Changed password for user elastic                     = xxxxxx
# Changed password for user kibana_system               = xxxxxx
# Changed password for user logstash_system             = xxxxxx

# 之后所有 API 调用都需要认证
curl -u elastic:xxxxxx https://localhost:9200/_cluster/health
```

### 创建角色和用户

```json
// 创建角色：logs_writer——只能写入 logs-* 索引
POST _security/role/logs_writer
{
  "cluster": ["monitor"],                  // 集群级别：只监控
  "indices": [
    {
      "names": ["logs-*"],                 // 只能操作 logs-* 索引
      "privileges": ["create", "create_index", "write"],
      "field_security": {                   // 字段级安全（FLS）
        "grant": ["@timestamp", "level", "message", "service_name"]
        // 不能写入 password、token 等敏感字段
      }
    }
  ]
}

// 创建角色：logs_reader——只能读取 logs-* 索引
POST _security/role/logs_reader
{
  "cluster": ["monitor"],
  "indices": [
    {
      "names": ["logs-*"],
      "privileges": ["read"]
    }
  ]
}

// 创建角色：order_admin——订单索引完全控制
POST _security/role/order_admin
{
  "indices": [
    {
      "names": ["orders-*"],
      "privileges": ["all"]                 // 完全控制
    }
  ]
}
```

```json
// 创建用户并分配角色

// 创建日志写入用户
POST _security/user/log_writer
{
  "password": "WriterPass123!",
  "roles": ["logs_writer"],
  "full_name": "日志写入服务",
  "metadata": { "app": "logstash" }
}

// 创建日志查询用户
POST _security/user/log_reader
{
  "password": "ReaderPass123!",
  "roles": ["logs_reader"],
  "full_name": "日志查看员"
}
```

### 文档级安全（DLS）与字段级安全（FLS）

```json
// DLS（Document Level Security）——用户只能看到部分文档
// 适用场景：多租户隔离——租户 A 只看自己的数据

POST _security/role/tenant_a_role
{
  "indices": [
    {
      "names": ["orders"],
      "privileges": ["read"],
      "query": {                           // DLS 查询条件
        "term": { "tenant_id": "tenant_a" }
      }
    }
  ]
}

// FLS（Field Level Security）——用户只能看到部分字段
// 适用场景：客服只能看到用户名称和联系方式，不能看到余额和密码
POST _security/role/customer_service
{
  "indices": [
    {
      "names": ["users"],
      "privileges": ["read"],
      "field_security": {
        "grant": ["name", "phone", "email"],
        "except": ["password", "balance", "id_card"]
      }
    }
  ]
}
```

---

## 12.2 多租户隔离架构设计

### 三种隔离方案

多租户 SaaS 系统中，租户数据的隔离有三种模式：

```
方案 A：单索引 + 字段隔离
  ┌──────────────────────────────────────────────┐
  │  orders 索引                                    │
  │  ┌──────────┬──────────┬──────────┐          │
  │  │ tenant_a │ tenant_b │ tenant_c │          │
  │  │  订单     │  订单     │  订单     │          │
  │  └──────────┴──────────┴──────────┘          │
  │                                                │
  │  优点：运维简单，一个索引管理                    │
  │  缺点：一个租户的写入压力影响其他租户               │
  │  隔离：DLS（文档级安全）+ routing                │
  └──────────────────────────────────────────────┘

方案 B：索引隔离
  ┌──────────────────────────────────────────────┐
  │  orders_tenant_a │ orders_tenant_b │ orders_c  │
  │  索引             │  索引             │  索引    │
  │                                                │
  │  优点：租户间完全隔离，一个索引的故障不影响其他       │
  │  缺点：索引数量翻倍（按租户数）                    │
  │  适用：大租户 > 100GB 数据                      │
  └──────────────────────────────────────────────┘

方案 C：集群隔离
  ┌──────────────────────────────────────────────┐
  │  Cluster A │  Cluster B  │  Cluster C         │
  │  租户 A     │  租户 B      │  租户 C            │
  │                                                │
  │  优点：物理隔离，完全不影响                    │
  │  缺点：成本高，维护 3 个集群                    │
  │  适用：金融、医疗等合规要求高的场景               │
  └──────────────────────────────────────────────┘
```

### 单索引 + Routing 的最佳实践

```json
// 方案 A 的工程化实现：单索引 + routing + DLS
// 适用于：中小租户（< 10GB / 租户）

// 1. 创建索引时设置 routing 为 tenant_id
PUT orders
{
  "mappings": {
    "properties": {
      "tenant_id": { "type": "keyword" },
      "order_id": { "type": "keyword" },
      "amount": { "type": "integer" }
    }
  },
  "settings": {
    "number_of_shards": 9,   // 分片数 = 预期租户分配均匀
    "routing_partition_size": 3  // 租户数据分散到 3 个分片
  }
}

// 2. 写入时指定 routing=tenant_id
PUT orders/_doc/order_1001?routing=tenant_a
{
  "tenant_id": "tenant_a",
  "order_id": "order_1001",
  "amount": 999
}

// 3. 搜索时指定 routing
// 这样搜索只在一个分片上进行，不需要广播
GET orders/_search?routing=tenant_a
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "tenant_id": "tenant_a" } }  // DLS
      ]
    }
  }
}
```

---

## 本章总结

| 安全功能 | 配置位置 | 解决的问题 |
|---------|---------|-----------|
| **认证（Authentication）** | `xpack.security.enabled: true` | 谁可以访问集群 |
| **RBAC 角色控制** | `_security/role` | 用户可以做什么 |
| **DLS（文档级安全）** | role 中的 `query` | 用户只能看哪些文档 |
| **FLS（字段级安全）** | role 中的 `field_security` | 用户只能看哪些字段 |
| **TLS 传输加密** | `xpack.security.http.ssl` | 通信是否加密 |
| **多租户隔离** | routing + DLS / 索引隔离 / 集群隔离 | 租户数据不能互相访问 |

**核心原则**：
1. **生产环境绝对不要裸奔**——没有认证的 ES 直接暴露公网等于数据裸奔。从 7.x 开始安全功能免费，没有理由不开启
2. **遵循最小权限原则**——只给用户完成任务所需的最小权限。写入日志的用户不应该有删除索引的权限，查询日志的用户不应该有写入权限
3. **多租户首选单索引 + routing**——对于大多数 SaaS 场景，单索引 + routing + DLS 是成本和隔离性的最佳平衡点。只有超大租户才需要独立的索引或集群