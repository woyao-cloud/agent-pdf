# 第15章 Redis 生态与前沿技术

## 15.1 RedisJSON 与 RediSearch

### RedisJSON：在 Redis 中存储 JSON

RedisJSON 是一个 Redis 模块，支持**原生的 JSON 文档存储和查询**，不需要序列化/反序列化整个对象：

```bash
# 安装 RedisJSON（Docker）
docker run -p 6379:6379 --name redis-stack \
  redis/redis-stack:latest

# 原生 JSON 操作
JSON.SET user:1001 $ '{"name":"John","age":30,"address":{"city":"Beijing","zip":"100000"}}'

# 直接读取指定字段（只返回需要的部分，节省带宽）
JSON.GET user:1001 $.name
# → "John"

JSON.GET user:1001 $.address.city
# → "Beijing"

# 更新嵌套字段
JSON.SET user:1001 $.age 31
JSON.NUMINCRBY user:1001 $.age 1  # 原子递增

# 数组操作
JSON.ARRAPPEND user:1001 $.tags '"vip"'
```

```java
// Java 使用 RedisJSON（需引入 redis-modules-java 或 Lettuce）
@Service
public class RedisJsonService {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    // 存储 Java 对象为原生 JSON（不需要提前序列化）
    public void saveUser(User user) {
        String key = "user:" + user.getId();
        // 使用 RedisJSON 模块
        redisTemplate.execute((RedisCallback<Void>) conn -> {
            // 直接存储对象，RedisJSON 内部处理 JSON 序列化
            conn.execute("JSON.SET", key.getBytes(), "$".getBytes(),
                serializeToJson(user));
            return null;
        });
    }

    // 只更新一个字段（不需要反序列化整个对象再写回）
    public void updateUserAge(Long userId, int newAge) {
        redisTemplate.execute((RedisCallback<Void>) conn -> {
            conn.execute("JSON.SET",
                ("user:" + userId).getBytes(),
                "$.age".getBytes(),
                String.valueOf(newAge).getBytes());
            return null;
        });
    }
}
```

### RediSearch：Redis 中的全文搜索

```bash
# 创建全文索引
FT.CREATE idx:products ON HASH PREFIX 1 product:
  SCHEMA name TEXT WEIGHT 5.0
         description TEXT WEIGHT 1.0
         price NUMERIC SORTABLE
         category TAG

# 搜索
FT.SEARCH idx:products "手机" LIMIT 0 10

# 模糊搜索
FT.SEARCH idx:products "%智%"

# 中文分词
FT.CREATE idx:articles ON HASH PREFIX 1 article:
  SCHEMA title TEXT WITHOFFSETS
         content TEXT LANGUAGE chinese
```

> **RediSearch vs Elasticsearch**：
> - RediSearch 适合**小规模**全文搜索（百万级文档）
> - ES 适合**大规模**搜索（亿级），功能更丰富
> - RediSearch 的优势是**不需要额外运维 ES 集群**

---

## 15.2 Redis 作为向量数据库

### 在 RAG 架构中的应用

Redis Stack 支持向量存储和检索，可以用作 AI 应用中的向量数据库：

```
RAG 架构中的 Redis：

  用户查询          Embedding 模型          Redis 向量检索         LLM
    │                    │                      │                 │
    │ "如何配置 Redis"   │                      │                 │
    │ ─────────────────► │                      │                 │
    │                    │                      │                 │
    │                    │ 生成查询向量           │                 │
    │                    │ [0.12, 0.56, ...]     │                 │
    │                    │ ──────────────────►  │                 │
    │                    │                      │                 │
    │                    │                      │ 向量相似度搜索   │
    │                    │                      │ FT.SEARCH ...   │
    │                    │                      │ ──────────────► │
    │                    │                      │ ◄── 相关知识片段 │
    │                    │                      │                 │
    │ 查询 + 上下文      │                      │                 │
    │ ◄─────────────────────────────────────────────────────────  │
```

```bash
# Redis Stack 中创建向量索引
FT.CREATE idx:embeddings ON HASH PREFIX 1 doc:
  SCHEMA content TEXT
         embedding VECTOR FLAT 6 TYPE FLOAT32 DIM 1536 DISTANCE_METRIC COSINE

# 存储文档向量
HSET doc:1 content "Redis 是一个内存数据库" embedding "\x00\x00\x00\x00..."

# 向量相似度检索（最近邻）
FT.SEARCH idx:embeddings "*=>[KNN 5 @embedding $vec AS score]"
  PARAMS 2 vec "\x12\x34..."
  SORTBY score ASC
  RETURN 3 content score
```

---

## 15.3 云原生 Redis

### AWS ElastiCache vs 自建

| 维度 | AWS ElastiCache | 自建 Redis |
|------|---------------|-----------|
| **运维成本** | 低（自动备份、自动故障转移） | 高（需要专职 DBA） |
| **扩容** | 一键扩缩容 | 手动（Cluster 迁移复杂） |
| **成本** | 中（实例价格 + 跨 AZ 流量） | 低（服务器 + 人力） |
| **延迟** | 低（同 VPC 内） | 低（同机房） |
| **定制** | 有限（不能修改内核参数） | 完全控制 |
| **适用** | 中小团队、无专职 DBA | 大团队、需要定制优化 |

### K8s 部署 Redis Operator

```yaml
# Redis Cluster on K8s（使用 Redis Operator）
apiVersion: redis.redis.opstreelabs.in/v1beta1
kind: RedisCluster
metadata:
  name: redis-cluster
spec:
  clusterSize: 3
  redisLeader:
    replicas: 3
    resources:
      requests:
        cpu: 1
        memory: 4Gi
      limits:
        cpu: 2
        memory: 8Gi
    storage:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 100Gi
  redisFollower:
    replicas: 3
    resources:
      requests:
        cpu: 500m
        memory: 2Gi
```

---

## 本章总结

| 技术 | 核心用途 | 适用场景 |
|------|---------|---------|
| **RedisJSON** | 原生 JSON 存储, 部分字段更新 | 减少序列化开销 |
| **RediSearch** | 全文搜索, 模糊匹配 | 小规模搜索, 替代 ES |
| **向量检索** | 语义搜索, RAG 知识库 | AI 应用, 相似度检索 |
| **云原生** | K8s 自动化部署, 弹性伸缩 | 容器化部署 |

> **核心思路**：Redis 早已不只是缓存。Redis Stack 将 JSON 文档、全文搜索、向量检索、图数据库合并为一体，可以用一个系统替代多个中间件。