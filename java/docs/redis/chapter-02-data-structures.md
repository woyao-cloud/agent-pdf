# 第2章 核心数据结构与对象模型（底层实现）

## 2.1 字符串（String）与 SDS（简单动态字符串）

### C 字符串的"三宗罪"

在 Redis 诞生前，大多数 C 语言项目使用 `char*` 和 `\0` 结尾的标准 C 字符串。Redis 没有沿用这套方案，而是设计了 SDS（Simple Dynamic String）。原因在于 C 字符串在三个关键场景存在严重缺陷：

```
C 字符串 vs SDS 对比：
┌───────────────┬─────────────────────┬──────────────────────┐
│    场景       │    C 字符串 char*    │    Redis SDS          │
├───────────────┼─────────────────────┼──────────────────────┤
│ 获取长度      │ O(N) 遍历到 \0      │ O(1) 读 len 字段      │
│ 二进制安全    │ ❌ 遇到 \0 截断      │ ✅ 用 len 决定长度    │
│ 追加字符串    │ O(N) 重新分配内存    │ O(1) 预分配空间       │
│ 缓冲区溢出    │ ❌ 可能覆盖相邻内存  │ ✅ 自动检查剩余空间   │
└───────────────┴─────────────────────┴──────────────────────┘
```

### SDS 的底层结构

SDS 在 Redis 3.2+ 版本中有 5 种类型（sdshdr5/shdr8/sdshdr16/sdshdr32/sdshdr64），根据字符串长度选择最紧凑的头部：

```
SDS 结构（以 sdshdr8 为例）：
┌──────┬──────┬──────────┬──────────────────────┐
│ len  │ alloc│ flags    │      buf[]           │
│(1B)  │ (1B) │  (1B)    │   (实际字符串数据)    │
└──────┴──────┴──────────┴──────────────────────┘

字段说明：
  len:    已使用字节数（O(1) 获取长度）
  alloc:  已分配的总字节数（不含头部和 \0）
  flags:  低 3 位 -> SDS 类型（sdshdr5/8/16/32/64）
          高 5 位 -> 未使用
  buf[]:  实际字符数组（以 \0 结尾兼容 C 函数）
```

**关键设计**：

**预分配（Pre-allocation）**：当对 SDS 进行修改并需要扩容时，Redis 会额外分配更多空间：

```
SDS 扩容策略：
  新长度 < 1MB → 分配 2 倍新长度
  新长度 ≥ 1MB → 分配 新长度 + 1MB

示例：
  当前 buf = "hello" (len=5, alloc=5)
  执行 append " world" → 新长度 = 11
  因为 11 < 1MB，所以 alloc = 22
  实际分配: 22 (alloc) + 3 (头部) + 1 (\0) = 26 字节
  → 下次 append 不超过 11 字节时，不需要重新分配内存
```

**惰性空间释放（Lazy Free）**：缩短字符串时，SDS 不立即释放多余的内存，而是用 `free` 字段记录可复用的空间。只有内存紧张时才会真正释放。

> **实战意义**：
> 1. **存储短字符串（< 8 字节）使用 sdshdr5**：头部只有 1 字节（flags），数据直接跟在后面
> 2. **字符串追加是高频操作**（如日志聚合、消息拼接），SDS 的预分配使每次 append 的平均复杂度接近 O(1)

### Java 中的 SDS 类比

对于 Java 开发者，SDS 类似于 `StringBuilder`（可变、预分配），但有两个重要差异：

```java
// Java StringBuilder 的预分配策略
StringBuilder sb = new StringBuilder(16); // 默认容量 16
sb.append("hello"); // 已用 5，容量 16
sb.append(" world"); // 已用 11，容量 16，够用

// 当容量不足时：新容量 = 旧容量 * 2 + 2
// StringBuilder 的策略是 2 倍扩容——比 SDS 更激进
// SDS 对于大字符串（>1MB）只增加 1MB，更节省内存
```

**重要区别**：SDS 直接操作内存（C 语言），没有 JVM 的堆内存管理开销。对一个 1KB 的 SDS 字符串执行 append，Redis 的分配速度比 Java `StringBuilder` 快约 2-3 倍（没有 GC 压力、没有对象头开销）。

```java
// Redis String 在 Java 中的基本操作
redisTemplate.opsForValue().set("user:1001:name", "张三");

// SDS 预分配优势的体现——频繁追加
// Redis 中可以用 APPEND 命令
redisTemplate.opsForValue().append("log:session:123", "event1,");
redisTemplate.opsForValue().append("log:session:123", "event2,");

// 对应底层 SDS 预分配，多次 APPEND 不产生重复内存分配
```

---

## 2.2 列表（List）与 ziplist/quicklist

### ziplist：紧凑的内存战士

ziplist 是 Redis 为了节省内存而设计的**压缩列表**，它将所有数据存储在连续的内存块中：

```
ziplist 内存布局（连续内存）：

┌──────┬──────────┬──────────┬──────────┐
│zlbytes│ zltail  │ zllen   │ entry1   │ → entry2 → ... → zlend
│(4B)  │  (4B)    │  (2B)   │ 可变长度  │
└──────┴──────────┴──────────┴──────────┘

每个 entry 的结构：
┌──────────┬──────────────┬──────────────────────┐
│prevlen   │ encoding     │ content              │
│(1B/5B)   │ (1B/2B/5B)  │ (实际数据)           │
└──────────┴──────────────┴──────────────────────┘
```

**ziplist 的连锁更新问题**：

这是 ziplist 最著名的"坑"。每个 entry 都保存了前一个 entry 的长度（prevlen）。当前一个 entry 的长度从 <254 变为 ≥254 时，prevlen 字段需要从 1 字节扩展到 5 字节，这可能导致后续 entry 的 prevlen 也变动，形成"多米诺骨牌效应"。

```
连锁更新触发场景：
  初始状态：entry1(200B) → entry2(200B) → entry3(200B) → ...
  修改 entry1 为 300B → entry2 的 prevlen 从 1B 变为 5B
  entry2 长度增加 4B → entry3 的 prevlen 也需要扩展
  ...一直传播下去

  最坏情况的时间复杂度：O(N²)
```

但 Redis 对此有防御：**ziplist 仅在 list/hash/zset 元素较少或较小时使用**。一旦超出阈值（默认 list: 每个 entry < 8KB，总数 < 512 个），就升级为更鲁棒的结构。

### quicklist：ziplist 的升级版

Redis 3.2+ 使用 **quicklist** 替代了纯 ziplist。quicklist 是一个 **双向链表**，但链表的每个节点内嵌一个 **ziplist**：

```
quicklist 结构：
┌──────────┐  ┌──────────┐  ┌──────────┐
│quicklist │→│quicklist │→│quicklist │→ null
│  node1   │  │  node2   │  │  node3   │
│ ┌──────┐ │  │ ┌──────┐ │  │ ┌──────┐ │
│ │ziplist││  │ │ziplist││  │ │ziplist││
│ │[A,B,C]││  │ │[D,E,F]││  │ │[G,H,I]││
│ └──────┘ │  │ └──────┘ │  │ └──────┘ │
└──────────┘  └──────────┘  └──────────┘
```

**quicklist 的 trade-off**：

| 参数 | 值 | 效果 |
|------|----|------|
| `list-max-ziplist-size` | -2（默认） | 每个节点 ziplist ≤ 8KB |
| `list-compress-depth` | 0（默认） | 不压缩，性能优先 |
| `list-compress-depth` | 1 | 首尾不压缩，中间节点压缩（节省 30-50% 内存） |

```
list-compress-depth 配置效果：
  depth=0: [A] → [B] → [C] → [D] → [E]  （全都不压缩）
  depth=1: [A] → [B] → [C] → [D] → [E]  （A 和 E 不压缩，BCD 用 LZF 压缩）
  depth=2: [A] → [B] → [C] → [D] → [E]  （A/B 和 D/E 不压缩，C 压缩）
```

> **实战建议**：
> 1. **消息队列场景**（LPUSH + BRPOP）：如果消息体积小（< 1KB），推荐保留默认值即可
> 2. **日志缓冲场景**：如果日志条目较大（> 10KB），增加 `list-max-ziplist-size` 让每个节点容纳更多条目，减少链表节点数
> 3. **冷数据场景**（很少访问中间元素）：设置 `list-compress-depth > 0`，可节省 30-50% 内存
> 4. **连锁更新实际上很少触发**：ziplist 大小有限制（默认 8KB），不会出现超长链式反应

### Java 应用：Redis List 作为消息队列

```java
@Service
public class RedisMessageQueue {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String QUEUE_KEY = "queue:task";

    // 生产者
    public void pushTask(String taskJson) {
        redisTemplate.opsForList().leftPush(QUEUE_KEY, taskJson);
    }

    // 消费者（阻塞式——底层是 BRPOP）
    public String consumeTask() {
        // 阻塞等待，最多等 5 秒
        List<String> result = redisTemplate.opsForList()
            .rightPop(QUEUE_KEY, 5, TimeUnit.SECONDS);
        return result != null ? result.get(0) : null;
    }

    // 批量拉取（非阻塞）
    public List<String> batchConsume(int batchSize) {
        List<String> messages = new ArrayList<>(batchSize);
        for (int i = 0; i < batchSize; i++) {
            // Pipeline 批量操作
            String msg = redisTemplate.opsForList()
                .rightPop(QUEUE_KEY);
            if (msg == null) break;
            messages.add(msg);
        }
        return messages;
    }

    // 获取队列长度（用于监控积压）
    public Long queueSize() {
        return redisTemplate.opsForList().size(QUEUE_KEY);
    }
}
```

---

## 2.3 哈希（Hash）与字典（HashTable）

### 渐进式 Rehash：避免主线程阻塞的核心设计

Redis 的 Hash 底层使用字典（dict），当哈希表负载因子过高或过低时，需要进行 rehash（扩容或缩容）。**关键在于**：Redis 的 rehash 不是一次性完成的，而是**渐进式**地分批进行。

```
渐进式 Rehash 过程：
  初始状态：
  ht[0]（主表）:  [0] → [...K1...] → [2] → [...K3...] → [4]
  ht[1]（备用表）: [0] → [1] → [2] → [3] → [4] → ... → [15]
  rehashidx: 0（正在进行中）

  第 1 次访问（CRUD 操作触发）：
    迁移 ht[0][0] 的所有 key 到 ht[1] 对应位置
    ht[0][0]: → null
    ht[1][rehash(K1)]: → K1
    rehashidx: 1（迁移进度）

  第 2 次访问（另一个 CRUD 操作）：
    迁移 ht[0][1] → ht[1]
    rehashidx: 2

  ...持续执行直到 rehashidx = -1（完成）
```

**核心机制**：

- **谁触发？**：每次对 dict 执行增、删、改、查操作时，**顺带**迁移一个 bucket
- **空闲时也迁移**：如果服务器空闲，Redis 的后台定时任务会主动推进 rehash
- **如何增删改查？**：迁移期间，增操作直接在 ht[1] 上执行，删改查先查 ht[0] 再查 ht[1]
- **为什么不能一次性完成？**：如果 dict 中有 100 万个 key，一次性 rehash 会阻塞 Redis 主线程数百毫秒到数秒——所有其他命令在此期间都无法响应

```
一次性 rehash vs 渐进式 rehash：
  一次性 rehash（如果 Redis 这么做）：
    1000 万个 key → 重新计算所有 hash 值 → 主线程阻塞 ~3 秒
    → 这 3 秒内所有客户端请求全部超时

  渐进式 rehash（实际做法）：
    每次访问迁移 1 个 bucket（约 10-100 个 key）
    每次耗时 ≈ 1μs，用户完全无感知
    总共 10000 个 bucket → 经过 10000 次操作后完成
    → 没有明显的延迟尖刺
```

### Hash 底层编码选择

```bash
# 查看 Hash 的底层编码
redis-cli OBJECT ENCODING user:1001
# → "ziplist" 或 "hashtable"

# 配置编码转换阈值
hash-max-ziplist-entries 512    # 元素 ≤ 512 时使用 ziplist
hash-max-ziplist-value 64       # 单元素 ≤ 64 字节时使用 ziplist
```

```
编码转换触发条件：
  初始创建:
    HMSET user:1001 name "John" age "30" city "NYC"
    → 底层使用 ziplist（3 fields，每个 < 64B）

  触发转换到 hashtable：
    添加第 513 个 field → 超出 hash-max-ziplist-entries
    或某个 field 超过 64 字节 → 超出 hash-max-ziplist-value



  ziplist vs hashtable 的内存对比（1000 个 field）：
    ziplist:  ~15KB  （紧凑连续内存）
    hashtable: ~45KB  （每个 entry 有额外的 dictEntry 开销）
    差距：ziplist 节省约 3 倍内存
```

> **实战建议**：
> 1. **业务缓存场景**：用 Hash 代替 String 存储对象的多个字段，可以减少 key 数量（一个 Hash key 替代 N 个 String key）
> 2. **内存优化**：如果对象字段数 < 512 且字段值较小，ziplist 编码比 JSON 序列化后存入 String 节省约 40% 的内存
> 3. **渐进式 rehash 对开发透明**：不需要在代码中做任何特殊处理，Redis 自动完成

### Java 应用：Hash 存储业务对象

```java
@Component
public class UserCacheService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String HASH_KEY_PREFIX = "user:";

    // 用 Hash 存储单个用户的所有字段
    public void saveUser(User user) {
        String key = HASH_KEY_PREFIX + user.getId();
        Map<String, String> userMap = new HashMap<>();
        userMap.put("name", user.getName());
        userMap.put("age", String.valueOf(user.getAge()));
        userMap.put("email", user.getEmail());
        userMap.put("city", user.getCity());
        // 一次网络往返存储所有字段
        redisTemplate.opsForHash().putAll(key, userMap);
    }

    // 获取单个字段（避免反序列化整个对象）
    public String getUserField(Long userId, String field) {
        String key = HASH_KEY_PREFIX + userId;
        Object value = redisTemplate.opsForHash().get(key, field);
        return value != null ? value.toString() : null;
    }

    // 获取所有字段
    public User getUser(Long userId) {
        String key = HASH_KEY_PREFIX + userId;
        Map<Object, Object> entries = redisTemplate.opsForHash().entries(key);
        if (entries.isEmpty()) return null;
        return User.builder()
            .id(userId)
            .name((String) entries.get("name"))
            .age(Integer.parseInt((String) entries.get("age")))
            .email((String) entries.get("email"))
            .city((String) entries.get("city"))
            .build();
    }

    // 仅修改个别字段（比序列化整个对象高效）
    public void updateUserEmail(Long userId, String newEmail) {
        String key = HASH_KEY_PREFIX + userId;
        redisTemplate.opsForHash().put(key, "email", newEmail);
    }
}
```

---

## 2.4 集合（Set）与整数集合（intset）

### intset 的升级机制

当 Set 中的所有元素都是整数且数量较少时，Redis 使用 **intset（整数集合）**——一个按升序排列的整数数组：

```
intset 结构（连续内存，有序排列）：
┌──────────┬──────────┬──────────┬──────────────────────────ຈ
│ encoding │ length   │ contents[]                    │
│ (2B)     │ (4B)     │ [1, 20, 35, 100, 255]         │
└──────────┴──────────┴───────────────────────────────┘

encoding 类型：
  INTSET_ENC_INT16 (2 字节)：-32,768 ~ 32,767
  INTSET_ENC_INT32 (4 字节)：-2,147,483,648 ~ 2,147,483,647
  INTSET_ENC_INT64 (8 字节)：很大很大
```

**升级机制**：当插入一个超出当前范围的大整数时，intset 会触发"升级"——将所有元素转换为更大的编码。

```
intset 升级过程：
  初始状态（INT16，每个元素 2 字节）：
    contents: [100, 200, 300]  (3 × 2 = 6 字节)

  插入 50000（需要 INT32，每个元素 4 字节）：
    1. 重新分配内存：3 × 4 = 12 字节
    2. 从后往前迁移元素：
       [_, _, 300]    → 300 放到新位置
       [_, 200, 300]  → 200 放到新位置
       [100, 200, 300] → 100 放到新位置
    3. 在末尾插入 50000
    4. 更新 encoding 和 length

  最终状态（INT32）：
    contents: [100, 200, 300, 50000]  (4 × 4 = 16 字节)
```

**注意**：intset 不支持**降级**——一旦升级到 INT64，即使后续删除了所有大整数，也不会回到 INT32。这是 Redis 的"单向升级"设计（避免复杂度和潜在的性能抖动）。

```
编码转换触发条件：
  SADD intset-demo 1 2 3 4 5
    → intset (INT16，5 个元素)

  SADD intset-demo 70000
    → intset (INT32，6 个元素)   ← 升级了！

  SADD intset-demo "hello"
    → hashtable (放弃了 intset)  ← 非整数，切换到 hashtable

  SADD intset-demo 1000 ... (超过 512 个元素)
    → hashtable                  ← 超出 set-max-intset-entries
```

> **实战意义**：对于**用户标签**、**ID 集合**等纯整数且数量不大的场景，intset 的内存效率极高——每个元素只占 2/4/8 字节，没有额外的指针开销。

### Java 应用：Set 实现标签系统

```java
@Service
public class TagService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // 为用户添加标签
    public void addUserTags(Long userId, List<String> tags) {
        String key = "tags:user:" + userId;
        redisTemplate.opsForSet().add(key, tags.toArray(new String[0]));
    }

    // 获取用户的所有标签
    public Set<String> getUserTags(Long userId) {
        String key = "tags:user:" + userId;
        return redisTemplate.opsForSet().members(key);
    }

    // 交集：同时拥有多个标签的用户 → 打标签筛选
    public Set<String> findUsersWithAllTags(List<String> requiredTags) {
        String destKey = "tags:intersect:temp";
        // 多集合交集计算
        redisTemplate.opsForSet().intersectAndStore(
            requiredTags.stream()
                .map(tag -> "tag:" + tag + ":users")
                .collect(Collectors.toList()),
            destKey
        );
        Set<String> result = redisTemplate.opsForSet().members(destKey);
        redisTemplate.delete(destKey); // 清理临时 key
        return result;
    }

    // 差集：新增标签的用户
    public Set<String> findNewlyTaggedUsers(List<String> newTags) {
        String allKey = "tags:all:users";
        String newKey = "tags:new:" + String.join("_", newTags);
        return redisTemplate.opsForSet().difference(allKey, newKey);
    }
}
```

---

## 2.5 有序集合（ZSet）与跳跃表（SkipList）

### 为什么用 SkipList 而不是红黑树或 B+ 树？

这是 Redis 面试中最经典的问题之一。跳跃表（SkipList）是一个"用概率换性能"的数据结构——通过多级索引加速链表查询。

```
跳跃表结构（level = 3）：
  level 3:  [head] ─────────────────────────────────── [tail]
             ↓                                           ↓
  level 2:  [head] ──────────→ [50] ─────────────────── [tail]
             ↓                  ↓                        ↓
  level 1:  [head] ─→ [10] ─→ [50] ─→ [70] ─→ [90] ─→ [tail]
             ↓        ↓       ↓       ↓       ↓         ↓
  level 0:  [head] → [10] → [30] → [50] → [70] → [90] → [tail]  (数据层)
```

**查找过程（查找 70）**：
```
1. 从 level 3 开始：[head] → 下一个是 tail？降级
2. level 2：[head] → [50]，70 > 50，继续向右
3. [50] → tail，降级
4. level 1：[50] → [70]，找到！O(log N)
```

**SkipList vs 红黑树 vs B+ 树**：

| 维度 | SkipList | 红黑树 | B+ 树 |
|------|---------|--------|-------|
| 查找 | O(log N) | O(log N) | O(log N) |
| 插入 | O(log N) | O(log N)（需要旋转+变色） | O(log N)（需要分裂/合并） |
| 删除 | O(log N) | O(log N)（需要旋转+变色） | O(log N)（需要分裂/合并） |
| 范围查询 | O(log N + M) | O(log N + M)（需要中序遍历） | O(log N + M)（最擅长） |
| 实现复杂度 | **简单**（~200 行 C） | 复杂（~1000+ 行 C） | 较复杂 |
| 并发友好度 | **高**（锁单个节点粒度） | 低（需要全局锁） | 一般 |
| 内存占用 | 高（每节点多层指针） | 中（左右指针+红黑标记） | 中（页内利用率 60-70%） |

**Redis 选择 SkipList 的核心原因**：**代码简洁且适合范围查询**。SkipList 不需要复杂的旋转和染色操作，实现大幅简化——这对 Redis "简单可靠"的哲学很重要。范围查询上，SkipList 的链表结构天然支持顺序遍历，不需要像红黑树那样进行中序遍历。

### 随机层数算法

```c
// Redis 的随机层数生成算法
int zslRandomLevel(void) {
    int level = 1;
    // 每次有 25% 的概率增加一层
    while ((random() & 0xFFFF) < (0xFFFF * 0.25)) {
        level++;
    }
    // 最大层数限制（Redis 7.0: 32 层）
    return (level < ZSKIPLIST_MAXLEVEL) ? level : ZSKIPLIST_MAXLEVEL;
}
```

```
概率分布：
  层数 1:  75%  的节点
  层数 2:  18.75% 的节点（25% × 75%）
  层数 3:  4.6875% 的节点（25%² × 75%）
  层数 4:  1.171875% 的节点
  ...
  层数 32: 概率 ≈ 0.00000000000000000001%（几乎不会出现）
```

**关键理解**：高层的节点数量是指数级减少的。32 层理论上只会在包含 2³² ≈ 40 亿个元素的 ZSet 中出现——实际场景不可能。Redis 里 ZSet 的典型层高在 5-15 之间。

### 分数相同时的排序公平性

ZSet 的排序规则：**先按分数（Score）排序，分数相同时按字典序（Lexicographical Order）排序**。

```bash
# 分数相同的问题
ZADD leaderboard 100 "user:1"
ZADD leaderboard 100 "user:2"
ZADD leaderboard 100 "user:3"

# 查询结果
ZRANGE leaderboard 0 -1
# → "user:1" "user:2" "user:3"  # 按字典序排列

# 如果想让后到的排前面，需要设计分数
# 技巧：Score = 基础分 + 时间戳倒数
# score = 100 + (1 / (now - epoch))
ZADD leaderboard 100.000001 "user:1"   # 先注册的分数稍微小一点
ZADD leaderboard 100.000002 "user:2"
ZADD leaderboard 100.000003 "user:3"

ZREVRANGE leaderboard 0 -1 WITHSCORES
# → "user:3" "user:2" "user:1"  # 后注册的排前面！
```

### ZSet 的大数据量问题

当 ZSet 元素超过默认阈值（128 个）或元素大小超过 64 字节时，底层从 ziplist 切换为 **skip list + hash table** 的组合结构：

```
ZSet 底层结构（大数据量时）：
  ┌────────────────────────────┐
  │         ZSet                │
  │  ┌─────────┐ ┌──────────┐  │
  │  │ dict    │ │ skiplist  │  │
  │  │ (哈希表) │ │ (跳跃表)   │  │
  │  ├─────────┤ ├──────────┤  │
  │  │ key=成员 │ │ level=3  │  │
  │  │ val=分数 │ │ ...       │  │
  │  └─────────┘ └──────────┘  │
  │                            │
  │  作用：                       │
  │  dict     → O(1) 查分数     │
  │  skiplist → O(log N) 范围   │
  └────────────────────────────┘
```

为什么需要两个数据结构？因为 ZSet 需要支持两种操作：
- `ZSCORE key member` → 查询某个成员的分数 → 用 dict 实现 O(1)
- `ZRANGE key start stop` → 按分数范围查询成员 → 用 skiplist 实现 O(log N)

两个结构**共享同一份内存**（成员和分数指针，不重复存储数据），不存在 2 倍内存浪费的问题。

### Java 应用：ZSet 排行榜

```java
@Service
public class LeaderboardService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String LEADERBOARD_KEY = "leaderboard:game:weekly";

    // 更新玩家分数
    public void updateScore(Long playerId, double score) {
        redisTemplate.opsForZSet()
            .add(LEADERBOARD_KEY, String.valueOf(playerId), score);
    }

    // 增加玩家分数（增量更新）
    public Double incrementScore(Long playerId, double delta) {
        return redisTemplate.opsForZSet()
            .incrementScore(LEADERBOARD_KEY, String.valueOf(playerId), delta);
    }

    // 获取 Top N 排行榜
    public List<LeaderboardEntry> getTopN(int n) {
        // ZREVRANGE key 0 N-1 WITHSCORES → 从高到低
        Set<ZSetOperations.TypedTuple<String>> topScores =
            redisTemplate.opsForZSet()
                .reverseRangeWithScores(LEADERBOARD_KEY, 0, n - 1);

        List<LeaderboardEntry> result = new ArrayList<>(n);
        int rank = 1;
        for (ZSetOperations.TypedTuple<String> entry : topScores) {
            result.add(new LeaderboardEntry(
                rank++,
                Long.parseLong(entry.getValue()),
                entry.getScore()
            ));
        }
        return result;
    }

    // 获取某个玩家的排名和附近玩家
    public List<LeaderboardEntry> getPlayerNeighbors(
            Long playerId, int neighborCount) {

        Long rank = redisTemplate.opsForZSet()
            .reverseRank(LEADERBOARD_KEY, String.valueOf(playerId));
        if (rank == null) return Collections.emptyList();

        long start = Math.max(0, rank - neighborCount);
        long end = rank + neighborCount;

        Set<ZSetOperations.TypedTuple<String>> neighbors =
            redisTemplate.opsForZSet()
                .reverseRangeWithScores(LEADERBOARD_KEY, start, end);

        List<LeaderboardEntry> result = new ArrayList<>();
        int baseRank = (int) start + 1;
        for (ZSetOperations.TypedTuple<String> entry : neighbors) {
            result.add(new LeaderboardEntry(
                baseRank++,
                Long.parseLong(entry.getValue()),
                entry.getScore()
            ));
        }
        return result;
    }

    // 获取排名区间内的玩家（用于分页展示）
    public List<LeaderboardEntry> getRankRange(int page, int pageSize) {
        long start = (long) (page - 1) * pageSize;
        long end = start + pageSize - 1;

        Set<ZSetOperations.TypedTuple<String>> scores =
            redisTemplate.opsForZSet()
                .reverseRangeWithScores(LEADERBOARD_KEY, start, end);

        if (scores == null || scores.isEmpty()) {
            return Collections.emptyList();
        }

        List<LeaderboardEntry> result = new ArrayList<>(pageSize);
        // 需要知道全局排名，所以先查起始排名
        String firstMember = scores.iterator().next().getValue();
        Long globalRank = redisTemplate.opsForZSet()
            .reverseRank(LEADERBOARD_KEY, firstMember);

        int rank = (globalRank != null) ? globalRank.intValue() + 1 : 1;
        for (ZSetOperations.TypedTuple<String> entry : scores) {
            result.add(new LeaderboardEntry(
                rank++, Long.parseLong(entry.getValue()), entry.getScore()));
        }
        return result;
    }

    @Data
    @AllArgsConstructor
    public static class LeaderboardEntry {
        private int rank;
        private long playerId;
        private double score;
    }
}
```

---

## 2.6 Redis 对象（redisObject）与编码转换

### redisObject 结构

Redis 中的所有键值对，在底层都以 **redisObject** 的形式存在：

```
redisObject 结构（16 字节）：
┌──────┬──────┬──────┬──────────────────────────────┐
│ type │encoding│ lru │ refcount │ ptr              │
│(4bit)│ (4bit)│(24bit)│ (4B)    │ (8B 指针)        │
└──────┴──────┴──────┴──────────────────────────────┘

字段说明：
  type:      数据类型（STRING/LIST/HASH/SET/ZSET/STREAM）
  encoding:  底层编码（INT/EMBSTR/RAW/ZIPLIST/LINKEDLIST 等）
  lru:       LRU 时间戳或 LFU 计数器（用于内存淘汰）
  refcount:  引用计数（共享对象用）
  ptr:       指向实际数据结构的指针
```

### 编码转换全景

```
所有数据类型的编码转换（Redis 7.0）：

String:
  ←── 整数（≤ 10000）──→ INT (8 字节 long)
  ←── 短字符串（≤ 44 字节）──→ EMBSTR (redisObject + SDS 连续分配)
  ←── 长字符串（> 44 字节）──→ RAW (redisObject 和 SDS 分开分配)

List:
  ←── 所有元素符合条件 ──→ QUICKLIST
  (Redis 3.2+ 只有 QUICKLIST，不再使用纯 ziplist)

Hash:
  ←── 元素 ≤ 512 且每个值 ≤ 64B ──→ ZIPLIST
  ←── 超出限制 ──→ HASHTABLE (字典)

Set:
  ←── 全是整数且元素 ≤ 512 ──→ INTSET (整数集合)
  ←── 超出限制 ──→ HASHTABLE (字典)

ZSet:
  ←── 元素 ≤ 128 且每个值 ≤ 64B ──→ ZIPLIST
  ←── 超出限制 ──→ SKIPLIST (跳跃表 + 字典)
```

### 查看对象编码

```bash
# 查看键的底层编码
127.0.0.1:6379> SET mykey 100
127.0.0.1:6379> OBJECT ENCODING mykey
"int"  # 整数编码

127.0.0.1:6379> SET mykey "hello"
127.0.0.1:6379> OBJECT ENCODING mykey
"embstr"  # 短字符串，一次性分配

127.0.0.1:6379> SET mykey "A"...(45 个字符以上)
127.0.0.1:6379> OBJECT ENCODING mykey
"raw"  # 长字符串，分开分配

127.0.0.1:6379> SADD myset 1 2 3 4 5
127.0.0.1:6379> OBJECT ENCODING myset
"intset"  # 整数集合

127.0.0.1:6379> SADD myset "hello"
127.0.0.1:6379> OBJECT ENCODING myset
"hashtable"  # 转为哈希表（非整数元素）
```

### 引用计数与共享对象

Redis 为一些小整数（0-9999，可配置）维护了全局共享对象，避免重复创建：

```bash
# 共享对象示例
127.0.0.1:6379> SET key1 100
127.0.0.1:6379> SET key2 100

# key1 和 key2 的 value 指向同一个 redisObject
# 它的 refcount > 1
```

```
共享对象池的限制：
  - 只对 INT 编码的整数有效（因为整数可以精确比较）
  - 对字符串无效（字符串比较成本高）
  - 最大共享值通过 redis.conf 的 maxmemory 配置影响：
    - maxmemory > 0 时共享对象池关闭
    - 因为 LRU/LFU 淘汰需要每个 key 独立记录访问时间
```

### Java 应用：对象编码的内存监控

```java
@Component
public class RedisMemoryMonitor {

    @Autowired
    private StringRedisTemplate redisTemplate;

    /**
     * 诊断某个 key 的底层编码和内存占用
     */
    public void diagnoseKey(String key) {
        // OBJECT ENCODING
        RedisConnection connection = null;
        try {
            connection = redisTemplate.getConnectionFactory().getConnection();
            byte[] rawKey = key.getBytes(StandardCharsets.UTF_8);

            // 获取编码类型
            String encoding = new String(
                connection.objectEncoding(rawKey));
            System.out.println("Key: " + key);
            System.out.println("Encoding: " + encoding);

            // 获取内存占用（MEMORY USAGE 命令）
            Long memoryUsage = connection.memoryUsage(rawKey);
            System.out.println("Memory Usage: " + memoryUsage + " bytes");

            // 获取类型
            String type = connection.type(rawKey);
            System.out.println("Type: " + type);

        } finally {
            if (connection != null) {
                connection.close();
            }
        }
    }

    /**
     * 批量分析所有业务 key 的内存分布
     */
    public void analyzeMemoryDistribution(String pattern) {
        Set<String> keys = redisTemplate.keys(pattern);
        Map<String, Long> memoryByType = new HashMap<>();

        for (String key : keys) {
            Long bytes = redisTemplate.execute(
                (RedisCallback<Long>) conn -> conn.memoryUsage(key.getBytes()));
            if (bytes == null) continue;

            String type = redisTemplate.type(key);
            memoryByType.merge(type, bytes, Long::sum);
        }

        long total = memoryByType.values().stream().mapToLong(Long::longValue).sum();
        System.out.println("=== 内存分布（pattern: " + pattern + "）===");
        memoryByType.forEach((type, bytes) -> {
            double pct = (bytes * 100.0) / total;
            System.out.printf("%-10s: %10d bytes (%5.1f%%)%n",
                type, bytes, pct);
        });
        System.out.printf("总计       : %10d bytes%n", total);
    }
}
```

---

## 本章实践：内存对比实验

```java
// 不同数据结构的 Java 端内存行为对比
@SpringBootTest
class DataStructureMemoryTest {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Test
    void compareStringVsHashMemory() {
        // 方案 A：用 String 存 1000 个用户字段
        // user:1001:name, user:1001:age, ...（每个字段一个 key）
        long startMem = getUsedMemory();
        for (int i = 0; i < 100; i++) {
            redisTemplate.opsForValue()
                .set("user:" + i + ":name", "user_" + i);
            redisTemplate.opsForValue()
                .set("user:" + i + ":age", String.valueOf(20 + i % 50));
            redisTemplate.opsForValue()
                .set("user:" + i + ":city", "city_" + i % 10);
        }
        long stringMem = getUsedMemory() - startMem;
        System.out.println("String 方式内存占用: " + stringMem + " bytes");

        // 清理
        redisTemplate.delete(redisTemplate.keys("user:*"));

        // 方案 B：用 Hash 存同样的数据（每个用户一个 key，3 个 field）
        startMem = getUsedMemory();
        for (int i = 0; i < 100; i++) {
            Map<String, String> fields = new HashMap<>();
            fields.put("name", "user_" + i);
            fields.put("age", String.valueOf(20 + i % 50));
            fields.put("city", "city_" + i % 10);
            redisTemplate.opsForHash()
                .putAll("user:" + i, fields);
        }
        long hashMem = getUsedMemory() - startMem;
        System.out.println("Hash 方式内存占用: " + hashMem + " bytes");
        System.out.println("节省比例: " +
            (1 - (double) hashMem / stringMem) * 100 + "%");
        // 通常 Hash 节省 30-50%
    }

    private long getUsedMemory() {
        return redisTemplate.execute(
            (RedisCallback<Long>) conn -> {
                // INFO memory 中的 used_memory
                return conn.serverCommands().info("memory")
                    .entrySet().stream()
                    .filter(e -> e.getKey().equals("used_memory"))
                    .map(e -> Long.parseLong(
                        new String(e.getValue(), StandardCharsets.UTF_8)))
                    .findFirst()
                    .orElse(0L);
            });
    }
}
```

---

## 本章总结

| 数据结构 | 小/少时编码 | 大/多时编码 | 核心设计亮点 |
|---------|-----------|-----------|------------|
| **String** | INT/EMBSTR | RAW | SDS 预分配、二进制安全 |
| **List** | quicklist (始终) | quicklist | ziplist 节点 + LZF 压缩 |
| **Hash** | ziplist | hashtable | 渐进式 rehash、连续内存 |
| **Set** | intset | hashtable | 整数升级、紧凑存储 |
| **ZSet** | ziplist | skiplist | 可预期性能、范围查询、随机层数 |

**对 Java 开发者的启示**：

1. **选择正确的数据结构比优化代码更重要**：用 ZSet 做排行榜只需要几行代码，自己实现一个高效排行榜可能需要数百行
2. **了解编码转换边界**：`hash-max-ziplist-entries 512` 这个配置不是随便设的——512 以内用 ziplist 省内存，超出后用 hashtable  保证性能。当业务上 hash 字段数在 500-1000 之间时，你需要权衡内存和性能
3. **内存不是无限的**：intset 存 1000 个整数约 8KB，hashtable 存 1000 个相同数据约 32KB。对于千万级用户标签，这个差距就是几百 MB 的差别
4. **OBJECT ENCODING 是诊断利器**：当怀疑 Redis 性能问题时，先看看底层编码——如果应该用 intset 的 Set 却变成了 hashtable，说明有非整数元素混入，需要排查