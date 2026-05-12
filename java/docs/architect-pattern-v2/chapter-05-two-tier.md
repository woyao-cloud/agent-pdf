# 第5章 两层架构（Two-Tier / Client-Server Architecture）

两层架构——也常被归入客户端-服务器（Client-Server）模式的经典实现——将系统划分为两个层次：客户端层和服务器层。它是从单体架构向多模块分布式系统演进的第一站。

---

## 5.1 解决的问题与应用场景

### 5.1.1 核心问题

两层架构解决的核心问题是：**如何让多个用户/客户端共享同一个数据源和业务逻辑，同时保持各客户端独立运行？**

在单体架构中，所有功能在一台机器上，用户通过终端直接操作。两层架构引入了一个关键分离——客户端负责用户界面和交互，服务器负责数据和业务逻辑的集中管理。

### 5.1.2 典型应用场景

| 场景 | 描述 |
|------|------|
| **桌面企业应用** | ERP客户端 + 数据库服务器（SAP、金蝶） |
| **传统 Web 应用** | 浏览器 + Web 服务器 + 数据库 |
| **移动应用** | App（富客户端） + 后端 API 服务器 |
| **部门级管理系统** | 少量并发用户（<500），实时性要求高 |
| **内网工具** | 无需 Internet 级别的可扩展性 |

### 5.1.3 两层架构的判断条件

```java
public class TwoTierFitness {

    public static boolean isSuitable(ProjectProfile profile) {
        // 两层架构适合：
        // - 用户数有限（<1000 并发）
        // - 业务逻辑不太复杂（不需要中间层来组织）
        // - 不需要支持多种客户端类型
        // - 实时交互为主，非批处理
        return profile.getConcurrentUsers() < 1000
            && profile.getBusinessComplexity() <= 5
            && profile.getClientTypes().size() == 1
            && !profile.isBatchOriented();
    }
}
```

---

## 5.2 实现原理与结构

### 5.2.1 核心结构

```
┌──────────────────────────┐
│     客户端层 (Tier 1)      │
│                           │
│  ┌─────────────────────┐ │
│  │   UI + 部分业务逻辑   │ │
│  │   (胖客户端可能包含)    │ │
│  └──────────┬──────────┘ │
└─────────────┼────────────┘
              │ 网络（JDBC / HTTP / RMI）
┌─────────────┼────────────┘
│     服务器层 (Tier 2)      │
│                           │
│  ┌─────────────────────┐ │
│  │   数据库管理系统       │ │
│  │   + 存储过程/触发器   │ │
│  └─────────────────────┘ │
└──────────────────────────┘
```

### 5.2.2 Java 实现示例

```java
// 两层架构在 Java 中的典型实现：Swing/JavaFX 客户端 + 数据库直连

// 客户端侧——包含 UI 和业务逻辑
public class OrderManagementClient extends JFrame {

    // 客户端直接持有数据库连接
    private Connection connection;

    public OrderManagementClient() {
        // 直接连接到数据库服务器
        this.connection = DriverManager.getConnection(
            "jdbc:mysql://192.168.1.100:3306/orders_db",
            "app_user", "password");
    }

    public List<Order> getPendingOrders() {
        // 业务逻辑写在客户端
        List<Order> orders = new ArrayList<>();
        try (Statement stmt = connection.createStatement()) {
            ResultSet rs = stmt.executeQuery(
                "SELECT * FROM orders WHERE status = 'PENDING'");

            while (rs.next()) {
                orders.add(Order.fromResultSet(rs));
            }
        }
        return orders;
    }

    // 校验逻辑也在客户端
    public void createOrder(Order order) throws ValidationException {
        validateOrder(order);  // 客户端校验

        try (PreparedStatement stmt = connection.prepareStatement(
            "INSERT INTO orders (user_id, amount, status) VALUES (?, ?, ?)")) {
            stmt.setLong(1, order.getUserId());
            stmt.setBigDecimal(2, order.getAmount());
            stmt.setString(3, "PENDING");
            stmt.executeUpdate();
        }
    }
}
```

---

## 5.3 胖客户端 vs 瘦客户端

这是两层架构中最重要的设计决策——业务逻辑放在客户端还是服务器？

```java
// 胖客户端 (Thick/Fat Client)：
// - 客户端包含 UI + 业务逻辑 + 数据访问
// - 服务器只是数据库

// 优点：服务器负载低、离线也可工作（本地逻辑）
// 缺点：升级困难（要更新所有客户端）、安全性差（业务逻辑在客户端暴露）
// 适用：局域网环境、用户量少、功能稳定

public class FatClientExample {
    // 所有逻辑在客户端——计算总价、计算折扣、校验库存
    // 数据库只负责存储数据的 CRUD
}

// 瘦客户端 (Thin Client)：
// - 客户端只包含 UI
// - 服务器包含业务逻辑 + 数据访问

// 优点：升级简单（只升级服务器）、安全性好、客户端简单
// 缺点：每次交互都要网络调用、服务器负载高
// 适用：Web 浏览器应用、移动 App

// 现代实践中，瘦客户端是主流——
// Web 前端(浏览器) + REST API 后端 + 数据库 就是一种"瘦客户端 + 两层架构"的变体
//（但通常被视为三层架构或多层架构）
```

| 维度 | 胖客户端 | 瘦客户端 |
|------|----------|----------|
| 业务逻辑位置 | 客户端 | 服务器 |
| 数据库位置 | 服务器 | 服务器 |
| 客户端升级 | 需要分发新版本 | 不需要 |
| 网络依赖 | 低（只在数据操作时） | 高（每次UI操作都可能需要） |
| 安全风险 | 高（逻辑暴露在客户端） | 低（逻辑在服务器保护） |
| 典型实现 | Java Swing + MySQL | Web Browser + REST API + MySQL |

---

## 5.4 潜在风险与问题

### 5.4.1 单点故障

```java
// 两层架构中，数据库是唯一的数据源
// 数据库挂了 = 整个系统不可用（没有备份处理能力）

// 问题场景：
// 数据库服务器硬件故障 → 所有客户端白屏 → 业务停滞

// 缓解措施：
// 1. 主从复制 (Master-Slave Replication)
// 2. 自动故障转移 (Failover)
// 3. 读写分离（从库承担查询，主库只负责写）
```

### 5.4.2 网络延迟

```java
// 瘦客户端每次 UI 交互都可能触发网络调用
// 网络质量直接影响用户体验

// 问题场景：
// 用户点击"搜索"→ 客户端发送请求 → 等待 300ms → 收到结果
// 如果网络抖动 → 等待 5 秒 → 用户重复点击 → 服务器接收 3 个重复请求

// 缓解措施：
@Component
public class ResilientClient {

    private final RestTemplate restTemplate;

    // 客户端加超时和重试
    public ResilientClient(RestTemplateBuilder builder) {
        this.restTemplate = builder
            .connectTimeout(Duration.ofSeconds(2))   // 连接超时
            .readTimeout(Duration.ofSeconds(5))       // 读取超时
            .build();
    }

    // 带降级的查询
    public List<Order> getOrders(Long userId) {
        try {
            return restTemplate.getForObject(
                "http://server/api/orders?userId={userId}",
                List.class, userId);
        } catch (ResourceAccessException e) {
            // 网络故障：返回本地缓存数据
            log.warn("服务器不可达，使用本地缓存");
            return localCache.getOrders(userId);
        }
    }
}
```

### 5.4.3 扩展性限制

```
两层架构的扩展瓶颈：

客户端层：可以随意加实例（每个用户自己安装客户端/打开浏览器）
  ↓ 瓶颈在这里
服务器层：单数据库实例是瓶颈
  - 垂直扩展：换更大的数据库机器（有上限）
  - 水平扩展：需要分区分片（复杂度大幅增加）

两层架构在"用户增加 → 数据库压力增大"这条路径上最容易崩
三层架构通过加入应用服务器层来解决这个问题
```

---

## 5.5 优化策略

### 5.5.1 引入缓存层

```java
// 在两层架构中加缓存，减少数据库直接压力

@Service
public class ProductService {
    private final RedisTemplate<String, Product> redis;
    private final ProductRepository productRepository;

    public Product getProduct(Long id) {
        String cacheKey = "product:" + id;

        // L1 缓存：本地 Caffeine（更快但每个实例独立）
        Product cached = caffeineCache.getIfPresent(cacheKey);
        if (cached != null) return cached;

        // L2 缓存：Redis（稍慢但共享）
        cached = redis.opsForValue().get(cacheKey);
        if (cached != null) {
            caffeineCache.put(cacheKey, cached);
            return cached;
        }

        // 数据库（最慢但权威）
        Product product = productRepository.findById(id)
            .orElseThrow();
        redis.opsForValue().set(cacheKey, product, Duration.ofMinutes(30));
        caffeineCache.put(cacheKey, product);
        return product;
    }
}
```

### 5.5.2 连接池优化

```java
// 两层架构中，数据库连接是最昂贵的资源
// 连接池是保护数据库的最重要防线

@Configuration
public class ConnectionPoolConfig {

    @Bean
    public DataSource dataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:mysql://db-server:3306/orders");
        config.setUsername("app");

        // 关键配置：
        config.setMaximumPoolSize(20);      // 最大连接数
        config.setMinimumIdle(5);           // 最小空闲连接
        config.setConnectionTimeout(30000); // 等待连接的最长时间
        config.setMaxLifetime(1800000);     // 单个连接的最大存活时间（30分钟）
        config.setLeakDetectionThreshold(10000); // 连接泄漏检测（10秒）

        return new HikariDataSource(config);
    }
}

// 监控连接池状态
@Component
public class PoolMonitor {
    private final HikariDataSource dataSource;

    @Scheduled(fixedRate = 30000)
    public void logPoolStats() {
        HikariPoolMXBean pool = dataSource.getHikariPoolMXBean();
        log.info("连接池状态: active={}, idle={}, waiting={}, total={}",
            pool.getActiveConnections(),
            pool.getIdleConnections(),
            pool.getThreadsAwaitingConnection(),
            pool.getTotalConnections());

        if (pool.getThreadsAwaitingConnection() > 0) {
            log.warn("有 {} 个线程正在等待数据库连接——连接池可能太小",
                pool.getThreadsAwaitingConnection());
        }
    }
}
```

### 5.5.3 从两层到三层的演进信号

```java
// 当你看到以下信号时，就应该从两层架构演进到三层：

public enum MigrationSignal {
    BUSINESS_LOGIC_DUPLICATION(
        // "为什么每个客户端都有自己的订单校验逻辑？"
        // 校验逻辑改了——需要更新所有客户端 → 不可维护
    ),
    DATABASE_OVERLOAD(
        // "为什么一个报表查询就把整个数据库打满了？"
        // 因为没有中间的应用层来管理查询优化和排队
    ),
    MULTIPLE_CLIENT_TYPES(
        // "我们现在需要支持 iOS App 和 Web 前端两个客户端"
        // 两层架构意味着在每种客户端里重写业务逻辑
    ),
    SECURITY_CONCERN(
        // "客户端怎么能直接有数据库的读写权限？"
        // 数据库密码在客户端代码里——安全审计的噩梦
    ),
    CONNECTION_POOL_EXHAUSTION(
        // "怎么 200 个用户就把数据库连接打满了？"
        // 因为每个客户端直接 hold 数据库连接
    );
}
```

---

## 5.6 本章小结

两层架构是分布式架构的入门模式。它的核心思想——**将用户界面和数据管理分离**——仍然是今天大多数系统设计的基础。

两层架构的合理使用场景很窄：**小规模（<1000 并发）、业务逻辑简单、客户端类型单一的部门级应用**。在这些场景下，它比三层架构少了中间层的复杂度，比单体架构多了客户端独立性。

当你的系统出现业务逻辑在多个客户端之间重复、数据库压力随用户线性增长、或需要支持多种客户端类型时——你已经超出了两层架构的适用边界，需要演进到三层架构。

在下一章中，我们将探讨三层架构——通过引入独立的业务逻辑层来解决两层架构的核心矛盾。
