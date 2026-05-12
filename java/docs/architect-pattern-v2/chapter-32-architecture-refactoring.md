# 第32章 架构重构

架构重构是改变系统架构而保持其外部行为不变的过程。与代码级重构不同，架构重构涉及更大范围的结构变化，风险也更高。本章提供一套系统化的架构重构方法论。

---

## 32.1 何时需要重构

### 32.1.1 架构恶化的信号

```
你的架构可能需要重构的信号：

结构信号（架构层面的退化）：
  □ 修改一个功能需要改动 5+ 个模块
  □ 本来应该独立的模块，现在相互之间随意调用
  □ 出现了"上帝类"（3000+ 行、100+ 方法）
  □ 循环依赖——包 A 依赖包 B，包 B 也依赖包 A

运行时信号（性能与稳定性退化）：
  □ 部署时间从 5 分钟增长到 30 分钟
  □ 启动时间从 10 秒增长到 2 分钟
  □ 一次小改动需要回归测试整个系统
  □ 内存占用持续增长，GC 越来越频繁

组织信号（开发的摩擦增加）：
  □ "这个改动很简单" → 实际花了 3 天
  □ 新人上手时间超过 2 周
  □ 团队害怕做大改动（恐惧驱动的开发）
  □ 同一个 Bug 修复了多次还在不同模块复现
```

### 32.1.2 重构 vs 重写

```
重构（Refactoring） vs 重写（Rewrite）—— 一个经典的选择：

                                重构                    重写
                         ────────────────    ────────────────
风险：                   低（每次小步改动）     高（大爆炸式上线）
时间：                   长（持续演进）         长（可能更长）
业务连续性：             不中断                 可能需要停机或并行运行
技术债务清理：           逐步                   一次性
团队要求：               需要纪律和耐心           容易失去方向
成功率：                 高（70-80%）            低（< 50%）

Joel Spolsky 的名言：
"重写代码是软件开发中最糟糕的战略错误。"

除非：
  - 现有代码库已经彻底无法理解
  - 技术栈已经完全过时（找不到了解它的人）
  - 系统规模很小（< 2万行代码）
否则，优先选择重构。
```

### 32.1.3 重构的决策矩阵

```java
// 重构决策——不是所有代码都值得重构

// 按照"变更频率"和"业务重要性"分类：
//
//                 高变更频率          低变更频率
//               ────────────       ────────────
// 高业务重要性    优先重构           保持监控
//               (ROI 最高)         (出问题再修)
//
// 低业务重要性    考虑重写           不要碰
//               (快速重写可能更划算)  (浪费时间和风险)

// 判断标准：
// - 如果是"高频率变更 + 高业务重要性"的代码：投入重构
// - 如果是"低频率变更 + 低业务重要性"的代码：维持现状
// - 中间地带：基于风险收益比判断
```

---

## 32.2 重构策略

### 32.2.1 架构重构的四种模式

```java
// 模式 1：绞杀者模式（Strangler Fig Pattern）
// 核心思想：在新的架构中构建新功能，逐步"绞杀"旧系统

// 适用场景：从单体迁移到微服务
// 策略：不直接拆分旧代码，而是在旁边构建新服务，逐步切流

// 实施步骤：
// Step 1: 部署路由层（API Gateway）—— 所有请求先进 Gateway
// Step 2: Gateway 将特定路由转到新服务，其余转到旧系统
// Step 3: 新功能全部在新服务中开发
// Step 4: 老功能逐个迁移
// Step 5: 旧系统不再有流量 → 下线

@Configuration
public class StranglerRouter {
    // 渐进式流量切换的配置
    @Bean
    public RouteLocator stranglerRoutes(RouteLocatorBuilder builder) {
        return builder.routes()
            // 已迁移的功能 → 新服务
            .route("new-order", r -> r
                .path("/api/orders/**")
                .uri("lb://order-service"))     // 新微服务
            .route("new-payment", r -> r
                .path("/api/payments/**")
                .uri("lb://payment-service"))   // 新微服务
            // 尚未迁移的功能 → 旧系统
            .route("legacy", r -> r
                .path("/api/**")
                .uri("http://legacy-monolith:8080"))  // 旧单体
            .build();
    }
}

// 模式 2：抽象分支模式（Branch by Abstraction）
// 核心思想：引入抽象层，在抽象层之下替换实现

// 适用场景：替换技术组件（换数据库、换消息队列、换缓存）

// 示例：从 Redis 迁移到 Hazelcast
// Step 1: 定义抽象接口
public interface CacheService {
    <T> Optional<T> get(String key, Class<T> type);
    void put(String key, Object value, Duration ttl);
    void evict(String key);
}

// Step 2: 实现两套（Redis实现保留，Hazelcast实现为新）
@Service
@ConditionalOnProperty(name = "cache.provider", havingValue = "redis")
public class RedisCacheService implements CacheService { /* 现有实现 */ }

@Service
@ConditionalOnProperty(name = "cache.provider", havingValue = "hazelcast")
public class HazelcastCacheService implements CacheService { /* 新实现 */ }

// Step 3: 灰度切换
// 先 5% 流量用 Hazelcast → 监控 → 逐步扩大 → 100% → 删除 Redis 实现

// 模式 3：提取与合并（Extract & Merge）
// 核心思想：先提取公共逻辑，再合并分散的实现

// 适用场景：多个服务中有重复的类似逻辑

// 示例：三个服务各自实现了相似的通知逻辑
// Before: OrderService.sendNotification(), PaymentService.sendNotification(),
//         UserService.sendNotification() —— 三套独立的实现
// After:
@Service
public class NotificationService {   // 提取出来的统一服务
    public void send(Template template, Map<String, Object> params, User user) {
        // 统一的发送逻辑
    }
}
// 三个服务改为调用 NotificationService

// 模式 4：分解与整合（Decompose & Integrate）
// 核心思想：将大模块拆成小模块，重新定义边界

// 适用场景：模块过大、职责不清
// 示例：将 3000 行的 UserService 按职责拆分：
//   UserProfileService（用户资料管理）
//   UserAuthService（认证与授权）
//   UserNotificationService（用户通知偏好）
```

### 32.2.2 事务边界重构

```java
// 最难的重构之一：拆分事务边界

// 场景：单体中的转账操作在同一个方法、同一个事务中
// 需要拆分为两个微服务，但 ACID 事务不能再跨服务

// 重构策略：从 ACID 到最终一致性

// Before（单体，一个事务）:
@Transactional
public void transfer(Long fromAccount, Long toAccount, BigDecimal amount) {
    accountRepo.debit(fromAccount, amount);    // 扣款
    accountRepo.credit(toAccount, amount);     // 入账
    auditRepo.log("TRANSFER", fromAccount, toAccount, amount); // 审计
}
// 所有操作在一个数据库事务中 → 要么全成功要么全失败

// After（微服务，Saga 模式）:
// Step 1: 扣款服务（本地事务）
@Transactional
public DebitResult debit(DebitCommand cmd) {
    Account account = accountRepo.findById(cmd.getAccountId());
    account.debit(cmd.getAmount());
    accountRepo.save(account);

    // Outbox：写入消息表
    outboxRepo.save(OutboxMessage.of("AccountDebited", account, cmd));

    return DebitResult.success(cmd.getTransferId());
}

// Step 2: 消息进入 Kafka，入账服务消费
@KafkaListener(topics = "AccountDebited")
public void handleAccountDebited(AccountDebitedEvent event) {
    // 入账（本地事务）
    accountRepo.credit(event.getToAccount(), event.getAmount());
    // 发布 AccountCredited 事件
}

// Step 3: 如果入账失败 → 补偿事务
@KafkaListener(topics = "CreditFailed")
public void handleCreditFailed(CreditFailedEvent event) {
    // 补偿：反向操作——退钱
    accountRepo.credit(event.getFromAccount(), event.getAmount());
    // 通知用户转账失败
}
```

---

## 32.3 平滑迁移

### 32.3.1 数据迁移策略

```java
// 数据迁移是架构重构中最危险的部分

// 策略 1：双写 + 逐步切换读取

// 阶段 1: 双写——新旧数据库同时写入
@Service
public class DualWriteOrderService {
    private final OrderRepository oldRepo;  // 旧 MySQL
    private final OrderRepository newRepo;  // 新数据库（分片或其他库）

    @Transactional
    public Order createOrder(Order order) {
        oldRepo.save(order);  // 先写旧库（保证可靠性）
        try {
            newRepo.save(order); // 再写新库
        } catch (Exception e) {
            // 新库写失败不影响业务——下次批量同步会修复
            alertService.send("Dual write failed for order: " + order.getId());
        }
        return order;
    }

    // 读取：暂时从旧库读
    public Order getOrder(Long id) {
        return oldRepo.findById(id).orElseThrow();
    }
}

// 阶段 2: 批量同步历史数据
@Component
public class DataMigrationJob {
    public void migrateHistoricalData() {
        // 分批处理，避免长事务和锁表
        Long lastId = 0L;
        int batchSize = 1000;
        while (true) {
            List<Order> batch = oldRepo.findByIdGreaterThan(lastId,
                PageRequest.of(0, batchSize));
            if (batch.isEmpty()) break;

            // 写入新数据库
            newRepo.saveAll(batch.stream()
                .map(this::transformToNewSchema)
                .toList());

            lastId = batch.get(batch.size() - 1).getId();
            log.info("Migrated {} orders, lastId={}", batch.size(), lastId);

            // 控制迁移速度，不影响线上业务
            Thread.sleep(100);
        }
    }
}

// 阶段 3: 切换读取——逐步把读流量切到新库（灰度）
@Service
public class ProgressiveReadSwitcher {
    private final int switchPercentage;  // 配置中心动态调整

    public Order getOrder(Long id) {
        // 按百分比或用户 ID hash 决定从哪里读
        if (Math.abs(id.hashCode() % 100) < switchPercentage) {
            return newRepo.findById(id).orElse(null);
        }
        return oldRepo.findById(id).orElseThrow();
    }
}

// 阶段 4: 验证数据一致性——对账
// 定期抽查新旧数据库中的记录是否一致
// 全量对账后 → switchPercentage = 100 → 下线旧库

// 策略 2：数据库复制 + CDC（Change Data Capture）
// 使用 Debezium / Canal 监听旧数据库的 binlog
// → 实时同步到新数据库
// → 无需修改应用代码的双写逻辑
// 适合：写操作频繁、双写成本高的场景
```

### 32.3.2 部署与回滚方案

```yaml
# 金丝雀部署 —— 架构重构的标准部署方式

# Istio VirtualService 配置：
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: order-service
spec:
  hosts:
    - order-service
  http:
    - match:
        - headers:
            x-canary:
              exact: "enabled"      # 金丝雀用户 → 新架构
      route:
        - destination:
            host: order-service
            subset: v2
    - route:
        - destination:
            host: order-service
              subset: v1           # 正常用户 → 旧架构
          weight: 95
        - destination:
            host: order-service
            subset: v2
          weight: 5                # 5% 流量验证新架构
```

```
重构的回滚方案（必须在上线前准备好）：

回滚层级：
  Level 1: 流量回滚（最快，< 1 分钟）
    将金丝雀流量从新架构切回旧架构
    → kubectl patch virtualservice order-service --type='json' ...

  Level 2: 部署回滚（< 5 分钟）
    将新服务实例替换回旧版本
    → kubectl rollout undo deployment/order-service-v2

  Level 3: 数据回滚（< 1 小时，尽量避免）
    如果新架构写入了错误数据 → 从备份恢复
    → 前提：备份已提前验证可恢复

回滚检查清单：
  □ 确认旧架构的服务镜像仍然可用（未删除）
  □ 确认数据库备份在 72 小时内且已验证
  □ 确认消息队列中未消费的消息可重放
  □ 准备好回滚后的数据对账脚本
```

### 32.3.3 渐进式迁移的时间线

```
示例：从单体到微服务的 6 个月迁移计划

月 1（准备）:
  - 建立监控基线（关键指标：延迟、错误率、吞吐量）
  - 自动化部署（CI/CD）
  - 拆分代码结构（包级模块化，但还在一个 JAR 中）
  - 引入 ArchUnit 守护模块边界

月 2（拆分第一个服务）:
  - 将用户认证模块拆为独立服务
  - 部署 API Gateway，路由流量
  - 双写运行 2 周 → 验证数据同步

月 3（扩展拆分）:
  - 拆出订单服务和支付服务
  - 引入 Kafka，异步事件通信
  - 灰度 5% → 20% → 100%

月 4（优化完善）:
  - 拆出剩余的 3-5 个服务
  - 部署服务网格（Istio）
  - 完善分布式追踪

月 5（稳定化）:
  - 全面监控和分析
  - 性能调优
  - 清理死代码和废弃的 API

月 6（收尾）:
  - 下线旧单体中的已迁移模块
  - 文档整理和知识传递
  - 复盘和流程改进
```

---

## 32.4 回滚方案

### 32.4.1 回滚的工程保障

```java
// 架构重构必须为失败做好准备

// 1. Feature Flag —— 不用重新部署就能关闭新架构
@Component
public class ArchitectureToggle {
    private final FeatureFlagService featureFlag;

    public <T> T execute(String flagName, Supplier<T> newArch,
                          Supplier<T> oldArch) {
        if (featureFlag.isEnabled(flagName)) {
            try {
                return newArch.get();
            } catch (Exception e) {
                log.error("New architecture failed, falling back", e);
                meterRegistry.counter("arch.fallback", "flag", flagName).increment();
                return oldArch.get();  // 自动降级
            }
        }
        return oldArch.get();
    }
}

// 使用
@RestController
public class OrderController {
    private final ArchitectureToggle toggle;

    @PostMapping("/orders")
    public OrderResult createOrder(@RequestBody OrderRequest request) {
        return toggle.execute(
            "new-order-architecture",
            () -> newOrderService.create(request),  // 新架构
            () -> legacyOrderService.create(request)  // 旧架构
        );
    }
}

// 2. Kill Switch —— 紧急情况下自动切断新架构
// 当新架构的错误率超过阈值时自动降级
@EventListener
public void onCircuitBreakerOpen(CircuitBreakerOpenEvent event) {
    if (event.getName().startsWith("new-")) {
        // 新架构的熔断器打开了 → 自动关闭 Feature Flag
        featureFlag.disable(event.getName().replace("new-", ""));
        alertService.critical("New architecture disabled: " + event.getName());
    }
}
```

### 32.4.2 重构的风险控制原则

```
架构重构的风险控制原则：

1. 小步前进
   每次变更必须可以在 5 分钟内回滚
   如果一次变更太大 → 拆成更小的步骤

2. 可观测性先行
   在重构之前，先确保：
     - 可以实时看到新旧架构的延迟、错误、吞吐量对比
     - 可以追踪一个请求完整经过新架构还是旧架构
   看不见的东西无法控制

3. 验证而非信任
   不要以为"代码写对了就是对的"
   用对账脚本、数据校验、端到端监控来验证

4. 灰度渐进
   0.1% → 1% → 5% → 20% → 50% → 100%
   每个阶段至少观察 30 分钟
   出现任何异常 → 立即回滚

5. 保持退路
   旧架构的代码不下线、数据库不删除
   直到新架构稳定运行 30 天以上
```

---

## 32.5 本章小结

架构重构的核心方法论：

1. **判断时机**——不是所有代码都需要重构，优先重构"高频变更 + 高业务重要性"的部分
2. **选择策略**——绞杀者模式是最安全的架构迁移方式；抽象分支适合技术组件替换
3. **管理数据**——双写 + 批量同步 + 灰度读切换，是数据迁移的标准路径
4. **保障回滚**——Feature Flag + Kill Switch + 流量切换，三个层次的回滚能力
5. **小步渐进**——每次变更 5 分钟可回滚，灰度从 0.1% 开始

最重要的心态：架构重构是外科手术，不是爆破拆除。**每一次提交都应该可以安全地部署到生产环境。**
