# 第28章 空间架构模式

空间架构（Space-Based Architecture）是一种为高并发、低延迟和线性扩展而设计的架构模式。它通过移除中心化数据库瓶颈，将处理和数据分布在内存中的一组处理单元之间，来消除传统架构中数据库成为扩展瓶颈的问题。

---

## 28.1 解决的问题与应用场景

### 28.1.1 核心问题

传统分层和微服务架构在极端并发下会遇到一个不可绕过的瓶颈：**数据库。**

```
传统架构的高并发困境：

  请求 → 应用服务器(可水平扩展 ✓)
            ↓
         数据库(不可水平扩展 ✗)

无论你怎么加应用服务器，数据库始终是单点瓶颈
读写分离、分库分表可以缓解，但不能消除
```

空间架构的答案：**将数据和业务逻辑一起分布在内存网格中，数据库退化为异步持久化的"备份"，不再是请求路径上的瓶颈。**

### 28.1.2 应用场景

- 高并发交易系统（票务抢购、秒杀）
- 实时竞价（RTB）系统
- 在线游戏的 matchmaking 服务
- 需要亚毫秒级响应的系统

---

## 28.2 实现原理

### 28.2.1 核心组件

```
空间架构的三个核心组件：

┌─────────────────────────────────────┐
│         虚拟化中间件                  │
│   (Virtualized Middleware)          │
│   维护：哪个处理单元负责哪部分数据      │
└─────────────────────────────────────┘
          │                    │
    ┌─────▼─────┐        ┌─────▼─────┐
    │ 处理单元 1  │  ...   │ 处理单元 N  │  ← 内存中
    │ 数据+逻辑   │        │ 数据+逻辑   │
    └─────┬─────┘        └─────┬─────┘
          │                    │
          └────────┬───────────┘
                   │ (异步)
          ┌────────▼────────┐
          │   数据写入器      │
          │   (Data Writer)  │  ← 异步持久化
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │    数据库        │
          │   (备份/查询)     │
          └─────────────────┘
```

### 28.2.2 Java 实现：基于 Hazelcast

```java
// 空间架构的 Java 实现示例
// 使用 Hazelcast（分布式内存数据网格）作为处理单元和数据网格

@Configuration
public class SpaceBasedConfig {

    @Bean
    public HazelcastInstance hazelcastInstance() {
        Config config = new Config();
        config.setClusterName("order-processing-grid");

        // 数据网格配置
        MapConfig orderMap = new MapConfig("orders");
        orderMap.setBackupCount(1);  // 每份数据的同步备份数
        config.addMapConfig(orderMap);

        return Hazelcast.newHazelcastInstance(config);
    }
}

@Service
public class OrderProcessingUnit {

    private final HazelcastInstance hazelcast;

    // 订单数据在处理单元的内存中——不查数据库
    public OrderResult processOrder(OrderRequest request) {
        // 所有处理都在内存中完成
        IMap<Long, Order> orders = hazelcast.getMap("orders");

        // 数据在内存网格中，分布在所有处理单元
        Order order = Order.create(request);
        orders.put(order.getId(), order);  // 写入内存网格（自动分区+备份）

        // 异步写入数据库（不在请求路径上）
        asyncPersist(order);

        return OrderResult.from(order);
    }

    @Async
    public void asyncPersist(Order order) {
        // 数据写入器——异步、非阻塞
        // 数据库只用于灾备和数据查询
        orderRepository.save(order.toEntity());
    }
}
```

---

## 28.3 高并发场景

```java
// 空间架构在高并发下的关键优势：
// 数据和处理在一起 = 无网络来回的数据访问

// 传统架构的请求路径：
// App → Cache(L1) → Cache(L2 Redis) → DB
//   每增加一个缓存层 = 增加一次网络来回

// 空间架构的请求路径：
// 请求 → 处理单元(数据 + 逻辑在一起，内存直接访问)
//   零网络来回——数据在同一个 JVM 的内存中

// 线性扩展的方式：
// 增加处理单元 → 数据自动重新分区 → 吞吐量和数据量同时线性增长
// 和传统架构"增加应用服务器但数据库仍然是瓶颈"不同
```

---

## 28.4 潜在风险与问题

| 风险 | 说明 |
|------|------|
| **内存成本** | 所有活跃数据必须在内存中——GB 级内存需求 |
| **数据丢失风险** | 内存中的数据在 crash 时可能丢失——必须有异步持久化和备份机制 |
| **分区容错** | 网络分区时，分区两侧可能同时认为自己是"权威源"——需要冲突解决策略 |
| **复杂性** | 开发模型与传统的 CRUD 完全不同——需要团队重新学习 |
| **冷启动** | 处理单元重启后需要从数据库加载数据到内存——可能有预热延迟 |

---

## 28.5 本章小结

空间架构是应对"数据库成为瓶颈"这一特定问题的终极答案。它的核心思路是打破 50 年来的架构常识——数据和逻辑分离——改为将数据和逻辑放在同一个 JVM 的内存中。

适用判断：只有当**数据库的延迟和吞吐量已经成为核心瓶颈，而且读写分离、缓存、分库分表都用过了还无法满足需求**时，才应该考虑空间架构。对于 95% 的系统，这些渐进式优化已经足够。
