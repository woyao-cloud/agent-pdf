# 第7章 排行榜与社交 Feed 流（Leaderboard & Feed）

## 7.1 实现原理

### ZSet 的跳跃表特性

ZSet 天然适合排行榜场景——它的跳跃表（SkipList）提供了 O(log N) 的插入、更新和范围查询，同时维护元素的有序性：

```
ZSet 排行榜核心操作：
            ┌─────────────────────────────────────────────────┐
            │  ZSet: leaderboard:game:level-1                 │
            │                                                  │
            │  成员       分数 (Score)    排名 (Rank)          │
            │  ────────────────────────────────────            │
            │  user:1001    9500             #1                │
            │  user:1002    9200             #2                │
            │  user:1003    8800             #3                │
            │  user:1004    8700             #4                │
            │  user:1005    8500             #5                │
            │  ...                           ...               │
            │                                                  │
            │  支持的查询：                                     │
            │  ZREVRANGE 0 9       → Top 10                   │
            │  ZREVRANK user:1003  → 排名 #3                   │
            │  ZSCORE user:1003    → 8800 分                   │
            │  ZRANGE 0 -1         → 全量排序                  │
            └─────────────────────────────────────────────────┘
```

### Pipeline 批量操作

在排行榜场景中，经常需要批量更新分数或批量查询。Pipeline 可以将多次 Redis 往返合并为一次：

```java
@Service
public class LeaderboardService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String LEADERBOARD_KEY = "leaderboard:game:weekly";

    // 批量更新分数（Pipeline 优化）
    public void batchUpdateScores(Map<Long, Double> playerScores) {
        redisTemplate.executePipelined((RedisCallback<Void>) connection -> {
            byte[] key = LEADERBOARD_KEY.getBytes();
            playerScores.forEach((playerId, score) -> {
                connection.zSetCommands().zIncrBy(
                    key, score, String.valueOf(playerId).getBytes());
            });
            return null;
        });
        // 一次网络往返完成了 N 次 ZINCRBY
    }

    // 获取 Top N
    public List<LeaderboardEntry> getTopN(int n) {
        Set<ZSetOperations.TypedTuple<String>> entries =
            redisTemplate.opsForZSet()
                .reverseRangeWithScores(LEADERBOARD_KEY, 0, n - 1);

        List<LeaderboardEntry> result = new ArrayList<>(n);
        int rank = 1;
        for (ZSetOperations.TypedTuple<String> entry : entries) {
            result.add(new LeaderboardEntry(
                rank++,
                Long.parseLong(entry.getValue()),
                entry.getScore()
            ));
        }
        return result;
    }

    // 获取玩家排名和周围玩家（"我的排名" + "附近的人"）
    public LeaderboardWithNeighbors getPlayerWithNeighbors(
            Long playerId, int neighborCount) {

        Long rank = redisTemplate.opsForZSet()
            .reverseRank(LEADERBOARD_KEY, String.valueOf(playerId));
        if (rank == null) {
            return null; // 玩家不在排行榜中
        }

        long start = Math.max(0, rank - neighborCount);
        long end = rank + neighborCount;

        // Pipeline 同时获取附近玩家和分数
        List<Object> results = redisTemplate.executePipelined(
            (RedisCallback<Void>) connection -> {
                byte[] key = LEADERBOARD_KEY.getBytes();
                connection.zSetCommands()
                    .zRevRangeWithScores(key, start, end);
                return null;
            });

        Set<ZSetOperations.TypedTuple<String>> neighbors =
            (Set<ZSetOperations.TypedTuple<String>>) results.get(0);

        List<LeaderboardEntry> entries = new ArrayList<>();
        int baseRank = (int) start + 1;
        for (ZSetOperations.TypedTuple<String> entry : neighbors) {
            entries.add(new LeaderboardEntry(
                baseRank++, Long.parseLong(entry.getValue()),
                entry.getScore()));
        }

        return new LeaderboardWithNeighbors(
            (int) (rank + 1),
            entries
        );
    }

    // 获取排名变化（本周 vs 上周）
    public Map<Long, Integer> getRankChanges(List<Long> playerIds) {
        String lastWeekKey = "leaderboard:game:weekly:2024-W35";

        // Pipeline 批量查询上周排名
        List<Object> lastWeekRanks = redisTemplate.executePipelined(
            (RedisCallback<Void>) connection -> {
                byte[] lastWeek = lastWeekKey.getBytes();
                playerIds.forEach(id ->
                    connection.zSetCommands()
                        .zRevRank(lastWeek, String.valueOf(id).getBytes()));
                return null;
            });

        Map<Long, Integer> changes = new HashMap<>();
        for (int i = 0; i < playerIds.size(); i++) {
            Long currentRank = redisTemplate.opsForZSet()
                .reverseRank(LEADERBOARD_KEY,
                    String.valueOf(playerIds.get(i)));
            Long previousRank = (Long) lastWeekRanks.get(i);

            int change = 0;
            if (currentRank != null && previousRank != null) {
                change = (int) (previousRank - currentRank); // 正数 = 上升
            } else if (currentRank != null) {
                change = Integer.MAX_VALUE; // 新进入排行榜
            }
            changes.put(playerIds.get(i), change);
        }
        return changes;
    }

    // ===== 内部类 =====
    @Data
    @AllArgsConstructor
    public static class LeaderboardEntry {
        private int rank;
        private long playerId;
        private double score;
    }

    @Data
    @AllArgsConstructor
    public static class LeaderboardWithNeighbors {
        private int myRank;
        private List<LeaderboardEntry> neighbors;
    }
}
```

---

## 7.2 潜在风险

### 超大 ZSet（千万级数据）的内存与性能问题

ZSet 使用 skip list + hash table 双结构——每个元素在 skip list 中有平均约 4-6 个指针（前向/后向/层指针），再加上 hash table 的 entry 开销，内存占用约为数据本身的 **2-3 倍**。

```
百万级 ZSet 的内存估算：
  每个元素：
    成员（user_id，假设 8 字节 long，String 对象 ~40 字节）
    分数（double，8 字节）
    skip list 节点开销（~60 字节，含平均 4 层指针）
    hash table entry 开销（~32 字节）

  单个元素总开销 ≈ 140 字节
  100 万个元素 ≈ 140 MB
  1000 万个元素 ≈ 1.4 GB  ← 单 key 占用 1.4G，容易 OOM
```

**问题表现**：
- 内存暴涨：单个 ZSet key 可能占用数 GB
- 查询变慢：`ZRANGE` 操作需要遍历 skip list，大数据量时延迟从 μs 级上升到 ms 级
- 持久化开销：RDB 快照和 AOF 重写需要遍历整个 ZSet

### 分数相同时的排序公平性

ZSet 的排序规则：**分数从高到低排列，分数相同时按成员字典序排列**。

```bash
# 分数相同的排行榜
ZADD leaderboard 100 "user:A"  (其实 A 的字典序在后面)
ZADD leaderboard 100 "user:B"
ZADD leaderboard 100 "user:C"

ZREVRANGE leaderboard 0 -1
# 结果: "user:C" "user:B" "user:A"  ← 按字典序降序！
# 谁先达到这个分数不重要，字典序决定排名

# 想让先达到的人排前面？
# ❌ 直接设分数不好使
# ✅ 分数设计技巧：让 score = 实际分数 + 时间因子
```

---

## 7.3 优化与应对方案

### 分数设计技巧

排行榜的核心矛盾：**分数相同** vs **先到先得**。解决方案——将分数编码为 `基础分 + 时间因子`。

```java
@Service
public class ScoreDesignService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final long EPOCH = 1700000000000L; // 2023-11-15 的毫秒数

    /**
     * 分数编码：score = baseScore + (1 - timeFactor)
     *
     * 原理：
     *   - baseScore：玩家的实际得分（如 10000 分）
     *   - timeFactor：时间权重，范围 (0, 1)
     *   - 时间越早，timeFactor 越小，最终 score 越大 → 先到的排前面
     *
     * 约束：
     *   - baseScore 必须是整数
     *   - 时间因子必须 < 1，确保不会影响基础分的比较
     */
    public double encodeScore(int baseScore, long timestamp) {
        // 时间因子 = (timestamp - EPOCH) / 86400000.0 / 1000
        //           = 自 EPOCH 以来的天数 / 1000
        // 1000 天内的玩家，时间因子 < 1，不影响基础分比较
        double timeFactor = (timestamp - EPOCH) / 86400000.0 / 1000;
        return baseScore + (1 - timeFactor);
    }

    // 解码分数（调试用）
    public int decodeBaseScore(double encodedScore) {
        return (int) Math.floor(encodedScore);
    }

    // 提交分数（排行榜更新）
    public void submitScore(Long playerId, int score) {
        double encodedScore = encodeScore(score, System.currentTimeMillis());
        redisTemplate.opsForZSet()
            .add("leaderboard:game", String.valueOf(playerId), encodedScore);
    }

    // 验证分数编码效果
    @Test
    public void testScoreEncoding() {
        // 玩家 A：先到，得 100 分
        double scoreA = encodeScore(100, System.currentTimeMillis());
        // 玩家 B：后到，也得 100 分（相同基础分）
        sleep(1000);
        double scoreB = encodeScore(100, System.currentTimeMillis());

        System.out.println("玩家 A 的编码分数: " + scoreA);  // 100.999...
        System.out.println("玩家 B 的编码分数: " + scoreB);  // 100.998...
        System.out.println("A 比 B 大? " + (scoreA > scoreB)); // true!

        // 玩家 C：后到，但得了 101 分
        double scoreC = encodeScore(101, System.currentTimeMillis());
        System.out.println("A vs C: " + (scoreA > scoreC)); // false! 101 > 100，基础分优先
    }
}
```

### 分桶策略（Bucket）—— 解决超大 ZSet

思路：将一个庞大的 ZSet 拆分为多个小 ZSet，每个桶管理一段分数范围或一组玩家：

```
分桶排行榜架构：

  整体排行榜（逻辑视图）
  ┌─────────────────────────────────┐
  │  #1  user:1001  9500             │
  │  #2  user:1002  9200             │
  │  #3  user:1003  8800             │
  │  ...                             │
  │  #992 user:9992  50              │
  └─────────────────────────────────┘
         ↓ 拆分为 4 个桶

  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ 桶 1     │ │ 桶 2     │ │ 桶 3     │ │ 桶 4     │
  │ 高分区间 │ │ 中高区间 │ │ 中低区间 │ │ 低分区间 │
  │ 7501-1万 │ │ 5001-7500│ │ 2501-5000│ │ 0-2500   │
  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤
  │ 1001:9500│ │ 1004:7200│ │ 1010:4800│ │ 1050:2300│
  │ 1002:9200│ │ 1005:6900│ │ 1011:4500│ │ 1051:2000│
  │ 1003:8800│ │ 1006:6500│ │ 1012:4200│ │ 1052:1500│
  │ ...      │ │ ...      │ │ ...      │ │ ...      │
  │ 约 2500  │ │ 约 2500  │ │ 约 2500  │ │ 约 2500  │
  │ 个元素   │ │ 个元素   │ │ 个元素   │ │ 个元素   │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

```java
/**
 * 分桶排行榜实现
 *
 * 思路：
 *   1. 按分数范围分桶（如每 2500 分一个桶）
 *   2. 查询 Top N：从最高分桶开始查，凑够 N 个
 *   3. 查询排名：找到玩家所在桶 + 桶内排名 + 前面桶的总元素数
 */
@Service
public class BucketedLeaderboardService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // 桶的分数范围
    private static final int BUCKET_SIZE = 2500;
    private static final String BUCKET_PREFIX = "leaderboard:bucket:";

    // 每个桶的元数据（ZSet 存储）
    private static final String BUCKET_META = "leaderboard:bucket:meta";

    // 提交分数
    public void submitScore(Long playerId, int score) {
        String bucketKey = getBucketKey(score);

        // Pipeline：同时更新玩家分数和桶计数
        redisTemplate.executePipelined((RedisCallback<Void>) connection -> {
            // 写入玩家分数
            connection.zSetCommands()
                .zAdd(bucketKey.getBytes(), score,
                    String.valueOf(playerId).getBytes());
            return null;
        });

        // 更新桶元数据（记录桶的元素数）
        String member = String.valueOf(score / BUCKET_SIZE);
        redisTemplate.opsForZSet()
            .incrementScore(BUCKET_META, member, 1);
    }

    // 获取 Top N
    public List<LeaderboardEntry> getTopN(int n) {
        // 1. 找到哪些桶有数据，从高到低
        Set<String> buckets = redisTemplate.opsForZSet()
            .reverseRange(BUCKET_META, 0, -1);

        List<LeaderboardEntry> result = new ArrayList<>(n);

        for (String bucketLevel : buckets) {
            if (result.size() >= n) break;

            int bucketMin = Integer.parseInt(bucketLevel) * BUCKET_SIZE;
            String bucketKey = BUCKET_PREFIX + bucketLevel;

            int need = n - result.size();
            Set<ZSetOperations.TypedTuple<String>> entries =
                redisTemplate.opsForZSet()
                    .reverseRangeWithScores(bucketKey, 0, need - 1);

            for (ZSetOperations.TypedTuple<String> entry : entries) {
                Long playerId = Long.parseLong(entry.getValue());
                double score = entry.getScore();
                result.add(new LeaderboardEntry(
                    result.size() + 1, playerId, score));
            }
        }
        return result;
    }

    // 获取玩家排名（跨桶计算）
    public Long getPlayerRank(Long playerId) {
        // 1. 先查玩家的分数
        Double score = null;
        // 遍历所有桶查找（实际应缓存 player->bucket 映射）
        Set<String> buckets = redisTemplate.opsForZSet()
            .reverseRange(BUCKET_META, 0, -1);

        long totalRank = 1;
        boolean found = false;

        for (String bucketLevel : buckets) {
            String bucketKey = BUCKET_PREFIX + bucketLevel;

            // 查玩家在这个桶中的排名
            Long rankInBucket = redisTemplate.opsForZSet()
                .reverseRank(bucketKey, String.valueOf(playerId));

            if (rankInBucket != null) {
                // 找到了！排名 = 前面所有桶的元素数 + 桶内排名 + 1
                found = true;
                // 计算前面桶的总元素数...
                // 简化处理：直接总分 - 桶内从名次处往后的元素数
                totalRank += rankInBucket;
                break;
            } else {
                // 这个桶没有这个玩家，加上桶大小
                Long bucketSize = redisTemplate.opsForZSet()
                    .zCard(bucketKey);
                totalRank += bucketSize != null ? bucketSize : 0;
            }
        }

        return found ? totalRank : null;
    }

    private String getBucketKey(int score) {
        int bucketLevel = score / BUCKET_SIZE;
        return BUCKET_PREFIX + bucketLevel;
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

### 冷热数据分离

排行榜具有天然的"头重脚轻"特性：Top 100 被查看的频率占 99%，而 100 名以后的玩家几乎没人看。

```
冷热数据分离策略：
  热数据（Top 1000）：
    - 存储在 Redis ZSet 中（key: leaderboard:hot）
    - 每次分数变化立即更新
    - 响应时间 < 1ms

  冷数据（1000 名以后）：
    - 存储在 MySQL/ClickHouse 中
    - 每小时批量同步一次
    - 查询时从 DB 加载，响应时间 10-50ms

  玩家查询自己的排名：
    1. 先查热数据 ZSet：如果找到，直接返回
    2. 如果没找到 → 查冷数据 DB：返回近似排名
```

```java
@Service
public class TieredLeaderboardService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private JdbcTemplate jdbcTemplate; // 冷数据存储

    private static final String HOT_KEY = "leaderboard:hot";
    private static final int HOT_THRESHOLD = 1000;

    // 更新分数
    public void updateScore(Long playerId, double score) {
        String member = String.valueOf(playerId);

        // 写入热数据
        redisTemplate.opsForZSet().add(HOT_KEY, member, score);

        // 只保留 Top 1000（定期清理）
        Long size = redisTemplate.opsForZSet().zCard(HOT_KEY);
        if (size != null && size > HOT_THRESHOLD * 1.2) {
            // 移除超出部分（尾部元素）
            redisTemplate.opsForZSet()
                .removeRange(HOT_KEY, 0, size - HOT_THRESHOLD - 1);
        }
    }

    // 查询 Top N
    public List<LeaderboardEntry> getTopN(int n) {
        Set<ZSetOperations.TypedTuple<String>> hotEntries =
            redisTemplate.opsForZSet()
                .reverseRangeWithScores(HOT_KEY, 0, Math.min(n, HOT_THRESHOLD) - 1);

        List<LeaderboardEntry> result = new ArrayList<>();
        int rank = 1;
        for (ZSetOperations.TypedTuple<String> entry : hotEntries) {
            result.add(new LeaderboardEntry(
                rank++, Long.parseLong(entry.getValue()), entry.getScore()));
        }

        // 如果 n > 热数据大小，从冷数据中补充
        if (result.size() < n) {
            List<LeaderboardEntry> coldEntries = queryColdLeaderboard(
                result.size(), n - result.size());
            result.addAll(coldEntries);
        }

        return result;
    }

    private List<LeaderboardEntry> queryColdLeaderboard(int offset, int limit) {
        return jdbcTemplate.query(
            "SELECT player_id, score, global_rank " +
            "FROM leaderboard_archive " +
            "WHERE global_rank > ? " +
            "ORDER BY global_rank ASC LIMIT ?",
            new Object[]{offset, limit},
            (rs, rowNum) -> new LeaderboardEntry(
                rs.getInt("global_rank"),
                rs.getLong("player_id"),
                rs.getDouble("score")
            )
        );
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

## 7.4 Feed 流（推模式/拉模式）

### Feed 流的三种模式

```
推模式（Fan-out on Write）：
  发帖时，将帖子"推"到所有粉丝的 Timeline 中

  张三发帖                           小红读取
    │                                │
    │ → 获取张三的 100 万粉丝列表       │
    │ → 往每个粉丝的 Timeline 里       │
    │   插入帖子 ID                   │
    │ → 写入 100 万次！              │
    │                                │
    │       粉丝 Timeline（List）      │
    │  ┌──────────────────────────┐   │
    │  │ 张三:帖1 │ 李四:帖3 │ ... │   │  ← 读取自己的 Timeline
    │  └──────────────────────────┘   │

  优点：读取极快（只需 O(1) 读取自己的 List）
  缺点：大 V 发帖时写入量巨大（100 万次写入）

拉模式（Fan-out on Read）：
  发帖时只写入自己的发件箱，粉丝读取时再拉取

  张三发帖                           小红读取
    │                                │
    │ → 写入自己的发件箱              │
    │   ZSet: user:1001:posts        │
    │   只需 1 次写入                │
    │                                │
    │                               │
    │                 小红读取时：    │
    │                 1. 获取关注列表 │
    │                 2. 遍历每个关注 │
    │                    的发件箱    │
    │                 3. 合并排序    │
    │                 4. 返回 Top N  │

  优点：发帖极快（1 次写入）
  缺点：读取时可能合并大量关注者的发件箱

推拉结合（混合模式）：
  普通用户（粉丝 < 10 万）：推模式
  大 V（粉丝 > 10 万）：拉模式
```

### 推模式实现（Redis List）

```java
@Service
public class PushFeedService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String TIMELINE_PREFIX = "timeline:user:";
    private static final String FOLLOWER_PREFIX = "followers:user:";
    private static final int TIMELINE_MAX = 500; // 每个用户 Timeline 最多 500 条

    // 发帖（推模式：写入所有粉丝的 Timeline）
    public void publishPost(Long userId, String postId) {
        // 1. 获取粉丝列表
        Set<String> followers = redisTemplate.opsForSet()
            .members(FOLLOWER_PREFIX + userId);

        if (followers == null || followers.isEmpty()) {
            return;
        }

        // 2. 批量写入每个粉丝的 Timeline
        //    使用 Pipeline 优化
        redisTemplate.executePipelined((RedisCallback<Void>) connection -> {
            byte[] postBytes = postId.getBytes();
            for (String follower : followers) {
                String timelineKey = TIMELINE_PREFIX + follower;
                // 插入帖子（左侧 = 最新在顶部）
                connection.listCommands()
                    .lPush(timelineKey.getBytes(), postBytes);
                // 裁剪到最多 500 条
                connection.listCommands()
                    .lTrim(timelineKey.getBytes(), 0, TIMELINE_MAX - 1);
            }
            return null;
        });

        // 3. 自己也要看到
        redisTemplate.opsForList()
            .leftPush(TIMELINE_PREFIX + userId, postId);
    }

    // 读取 Timeline（最新帖子）
    public List<String> getTimeline(Long userId, int page, int pageSize) {
        String key = TIMELINE_PREFIX + userId;
        long start = (long) (page - 1) * pageSize;
        long end = start + pageSize - 1;

        return redisTemplate.opsForList()
            .range(key, start, end);
    }

    // 关注用户（将用户的帖子同步到自己的 Timeline）
    public void followUser(Long followerId, Long targetId) {
        String followerKey = FOLLOWER_PREFIX + targetId;
        String timelineKey = TIMELINE_PREFIX + followerId;

        // 1. 添加关注关系
        redisTemplate.opsForSet().add(followerKey, String.valueOf(followerId));

        // 2. 将被关注者的最近帖子拉取到自己的 Timeline（用于新关注者）
        String targetTimelineKey = TIMELINE_PREFIX + targetId;
        List<String> recentPosts = redisTemplate.opsForList()
            .range(targetTimelineKey, 0, 49); // 最近 50 条

        if (recentPosts != null) {
            // 反向插入（保持时间顺序）
            Collections.reverse(recentPosts);
            recentPosts.forEach(post ->
                redisTemplate.opsForList()
                    .rightPush(timelineKey, post));
        }
    }
}
```

### 拉模式实现（ZSet 合并）

```java
@Service
public class PullFeedService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String OUTBOX_PREFIX = "outbox:user:";
    private static final String FOLLOWING_PREFIX = "following:user:";

    // 发帖（拉模式：只需写入自己的发件箱）
    public void publishPost(Long userId, String postId, double score) {
        String key = OUTBOX_PREFIX + userId;
        // score = 时间戳，用于排序
        redisTemplate.opsForZSet().add(key, postId, score);
        // 只保留最近 1000 条
        Long size = redisTemplate.opsForZSet().zCard(key);
        if (size != null && size > 1000) {
            redisTemplate.opsForZSet()
                .removeRange(key, 0, size - 1001);
        }
    }

    // 读取 Timeline（拉取所有关注者的发件箱并合并）
    public List<String> getTimeline(Long userId, int page, int pageSize) {
        // 1. 获取关注列表
        Set<String> following = redisTemplate.opsForSet()
            .members(FOLLOWING_PREFIX + userId);

        if (following == null || following.isEmpty()) {
            return Collections.emptyList();
        }

        // 2. 使用 ZUNIONSTORE 合并关注者的发件箱
        String[] followingKeys = following.stream()
            .map(fid -> OUTBOX_PREFIX + fid)
            .toArray(String[]::new);

        if (followingKeys.length == 0) {
            return Collections.emptyList();
        }

        String tempKey = "timeline:temp:" + userId;
        // ZUNIONSTORE dest numkeys key [key ...] [WEIGHTS w [w ...]] [AGGREGATE SUM|MIN|MAX]
        redisTemplate.opsForZSet()
            .unionAndStore(tempKey, Arrays.asList(followingKeys), tempKey);

        // 3. 按时间倒序获取
        long start = (long) (page - 1) * pageSize;
        long end = start + pageSize - 1;
        Set<String> posts = redisTemplate.opsForZSet()
            .reverseRange(tempKey, start, end);

        // 4. 清理临时 key
        redisTemplate.delete(tempKey);

        return new ArrayList<>(posts != null ? posts : Collections.emptySet());
    }

    // 优化版：只合并 Top N 关注者（前 200 个）
    public List<String> getTimelineOptimized(Long userId, int page, int pageSize) {
        // 如果关注者超过 200，只处理最近活跃的 200 个
        Set<String> following = redisTemplate.opsForSet()
            .members(FOLLOWING_PREFIX + userId);

        if (following == null || following.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> activeFollowing;
        if (following.size() > 200) {
            // 取最近发过帖子的 200 人（通过各自发件箱的最新帖子时间判断）
            activeFollowing = following.stream()
                .limit(200) // 简化处理：只取前 200 个（实际应排序）
                .collect(Collectors.toList());
        } else {
            activeFollowing = new ArrayList<>(following);
        }

        // 使用 Pipeline 查询每个关注者的最近 10 条帖子
        List<Object> recentPosts = redisTemplate.executePipelined(
            (RedisCallback<Void>) connection -> {
                for (String fid : activeFollowing) {
                    byte[] key = (OUTBOX_PREFIX + fid).getBytes();
                    // 取最近 10 条
                    connection.zSetCommands()
                        .zRevRangeWithScores(key, 0, 9);
                }
                return null;
            });

        // 在内存中合并排序
        List<PostEntry> merged = new ArrayList<>();
        for (int i = 0; i < activeFollowing.size(); i++) {
            Set<ZSetOperations.TypedTuple<String>> posts =
                (Set<ZSetOperations.TypedTuple<String>>) recentPosts.get(i);
            if (posts != null) {
                posts.forEach(p -> merged.add(
                    new PostEntry(p.getValue(), p.getScore())));
            }
        }

        // 排序
        merged.sort((a, b) -> Double.compare(b.score, a.score));

        // 分页
        int start = (page - 1) * pageSize;
        return merged.stream()
            .skip(start)
            .limit(pageSize)
            .map(e -> e.postId)
            .collect(Collectors.toList());
    }

    @Data
    @AllArgsConstructor
    private static class PostEntry {
        private String postId;
        private double score;
    }
}
```

### 混合模式（推拉结合）

```java
@Service
public class HybridFeedService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final long VIP_FOLLOWER_THRESHOLD = 100_000; // 10 万粉丝

    // 发帖时判断：粉丝超过阈值用拉模式，否则用推模式
    public void publishPost(Long userId, String postId, double timestamp) {
        Long followerCount = redisTemplate.opsForSet()
            .size("followers:user:" + userId);

        if (followerCount != null
                && followerCount > VIP_FOLLOWER_THRESHOLD) {
            // 大 V → 拉模式（只写自己的发件箱）
            redisTemplate.opsForZSet()
                .add("outbox:user:" + userId, postId, timestamp);
        } else {
            // 普通用户 → 推模式（写入粉丝 Timeline）
            pushToFollowers(userId, postId);
        }
    }

    // 获取用户 Timeline（先检查是否有自己的推 Timeline，没有则拉）
    public List<String> getTimeline(Long userId, int page, int pageSize) {
        String pushTimelineKey = "timeline:push:user:" + userId;

        // 检查是否有推送的 Timeline
        Boolean hasPushTimeline = redisTemplate.hasKey(pushTimelineKey);

        if (Boolean.TRUE.equals(hasPushTimeline)) {
            // 有推送 Timeline → 直接读取
            long start = (long) (page - 1) * pageSize;
            long end = start + pageSize - 1;
            return redisTemplate.opsForList()
                .range(pushTimelineKey, start, end);
        }

        // 没有推送 Timeline → 拉模式（合并关注的大 V 发件箱）
        return pullFromVIPOutboxes(userId, page, pageSize);
    }
}
```

---

## 本章总结

| 场景 | 数据结构 | 核心命令 | 注意事项 |
|------|---------|---------|---------|
| **实时排行榜** | ZSet | ZADD, ZREVRANGE, ZREVRANK | 分数设计、分桶、冷热分离 |
| **Feed 流（推）** | List | LPUSH, LTRIM, LRANGE | 大 V 写入量大 |
| **Feed 流（拉）** | ZSet | ZADD, ZUNIONSTORE, ZREVRANGE | 读取时合并开销大 |
| **Feed 流（混合）** | List + ZSet | 混合使用 | 需要区分大 V 和普通用户 |

**核心原则**：
1. **排行榜永远用 ZSet**——在 Redis 中，没有比 ZSet 更适合做排行榜的数据结构
2. **关注 Top N 查询的性能**——`ZREVRANGE 0 99` 在任何规模下都是 O(log N + M)，快得惊人。真正慢的是 `ZRANGE 0 -1`（扫描全量）
3. **Feed 流优先选混合模式**——纯推模式在大 V 发帖时可能写入百万次，纯拉模式在读取时可能合并数千个发件箱。混合模式是工程上的最优解
4. **超过单 key 容量就分桶**——单个 ZSet 不建议超过 1000 万元素。分桶策略不仅有更好的性能，也为未来的数据归档提供了便利