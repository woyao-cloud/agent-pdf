# 第15章 数据管理模式

数据管理是微服务架构中最具挑战性的领域。当系统从"一个数据库"变成"每个服务一个数据库"，所有传统的关系数据库保证（ACID 事务、外键约束、JOIN）都被打破。本章介绍微服务数据管理的四种核心模式。

---

## 15.1 Database per Service

### 15.1.1 原则

```
这是微服务数据管理的"第一条戒律"：
  每个服务拥有自己的数据库。其他服务不能直接访问它。

  订单服务 → order_db  （只有订单服务可以读写）
  支付服务 → payment_db（只有支付服务可以读写）
  用户服务 → user_db   （只有用户服务可以读写）

规则：服务 A 需要服务 B 的数据 → 通过 B 的 API 获取，绝不可直连 B 的数据库
理由：数据库 schema 是服务内部实现细节——直连 = 紧耦合到内部实现
```

```java
// 违反 Database per Service：
@Service
public class OrderService {
    @Autowired
    private JdbcTemplate paymentDbJdbcTemplate;  // ← 直连支付服务的数据库！

    public PaymentInfo getPaymentInfo(Long orderId) {
        return paymentDbJdbcTemplate.queryForObject(
            "SELECT * FROM payment_db.transactions WHERE order_id = ?",
            PaymentInfo.class, orderId);
        // 订单服务知道了支付数据库的 schema
        // 支付团队改表结构 → 订单服务崩溃
    }
}

// 遵守 Database per Service：
@Service
public class OrderService {
    private final PaymentClient paymentClient;  // 通过 API 获取数据

    public PaymentInfo getPaymentInfo(Long orderId) {
        return paymentClient.getPaymentByOrderId(orderId);
        // 订单服务不知道支付用了什么数据库、什么表结构
        // 支付团队可以自由修改内部 schema
    }
}
```

---

## 15.2 Saga 模式

### 15.2.1 问题

一个业务操作跨越多个服务时，没有跨数据库的 ACID 事务可用。Saga 是解决方案——将全局事务分解为一系列本地事务，每个步骤有对应的补偿操作。

### 15.2.2 实现：编排型 Saga

```java
// 编排型 Saga (Orchestrated Saga)：由一个协调者管理整个流程

@Service
public class CreateOrderSagaOrchestrator {

    private final OrderService orderService;
    private final InventoryClient inventoryClient;
    private final PaymentClient paymentClient;
    private final LogisticsClient logisticsClient;

    @Transactional
    public SagaResult execute(CreateOrderCommand cmd) {
        SagaContext context = new SagaContext();

        try {
            // Step 1: 创建订单（初始状态: PENDING）
            Order order = orderService.create(cmd);
            context.setOrderId(order.getId());

            // Step 2: 预留库存
            InventoryResult inventory = inventoryClient.reserve(cmd.getItems());
            context.setReservationId(inventory.getReservationId());

            // Step 3: 处理支付
            PaymentResult payment = paymentClient.charge(
                cmd.getAmount(), order.getId());
            context.setTransactionId(payment.getTransactionId());

            // Step 4: 确认订单
            orderService.confirm(order.getId(), inventory, payment);

            // Step 5: 创建物流单
            logisticsClient.createShipment(order.getId(), cmd.getAddress());

            return SagaResult.success(order);

        } catch (Exception e) {
            log.error("Saga 执行失败，开始补偿: {}", e.getMessage());

            // 补偿：按逆序回滚
            if (context.getTransactionId() != null) {
                paymentClient.refund(context.getTransactionId());  // 退款
            }
            if (context.getReservationId() != null) {
                inventoryClient.release(context.getReservationId()); // 释放库存
            }
            if (context.getOrderId() != null) {
                orderService.cancel(context.getOrderId());           // 取消订单
            }

            return SagaResult.failure(e.getMessage());
        }
    }
}
```

---

## 15.3 CQRS 模式

### 15.3.1 理念

CQRS（Command Query Responsibility Segregation）将读和写分离为不同的模型，甚至不同的数据库。

```
传统 CRUD：同一个 Model 用于读和写
  Order { id, userId, items, status, totalAmount, payment, logistics }
  读（查询订单列表）→ 返回 20 个字段（实际只需要 5 个）
  写（创建订单）   → 用同一个 Order 对象（有 15 个写操作不关心的字段）

CQRS：
  写模型（Command Model）→ OrderAggregate → 写库（PostgreSQL：ACID 保证）
  读模型（Query Model）  → OrderSummaryProjection → 读库（Elasticsearch：搜索优化）
                        → OrderDetailProjection → 读库（MongoDB：文档聚合）
```

### 15.3.2 实现

```java
// 命令端（写操作）
@Service
@Transactional
public class OrderCommandService {
    private final OrderRepository orderRepository;  // PostgreSQL

    public OrderResult createOrder(CreateOrderCommand cmd) {
        Order order = Order.create(cmd);  // 写模型——包含完整的业务逻辑
        orderRepository.save(order);

        // 发布事件——通知读模型更新
        eventPublisher.publish(new OrderCreatedEvent(order));

        return OrderResult.from(order);
    }
}

// 查询端（读操作）——使用独立的读优化数据源
@Service
public class OrderQueryService {
    private final ElasticsearchRestTemplate esTemplate;  // Elasticsearch

    public List<OrderSummary> searchOrders(OrderSearchCriteria criteria) {
        // 在 Elasticsearch 中做全文搜索——PostgreSQL 做不到这么快
        return esTemplate.search(criteria.toQuery(), OrderSummary.class);
    }

    public OrderDetail getDetail(Long orderId) {
        // 从 MongoDB 获取预聚合的订单详情——不需要 JOIN 多个服务
        return mongoTemplate.findById(orderId, OrderDetail.class);
    }
}

// 读模型同步：监听写端发出的事件，更新读库
@Component
public class OrderProjectionUpdater {

    @KafkaListener(topics = "order-events")
    public void onOrderCreated(OrderCreatedEvent event) {
        // 更新 Elasticsearch 索引（用于搜索）
        esTemplate.save(new OrderSummaryProjection(event));

        // 更新 MongoDB 文档（用于详情展示）
        mongoTemplate.save(new OrderDetailProjection(event));
    }
}
```

---

## 15.4 事件溯源 (Event Sourcing)

### 15.4.1 理念

事件溯源不存储当前状态，而是存储导致当前状态的所有事件序列。当前状态 = 事件流的"回放"（replay）。

```
传统持久化：                   事件溯源：
orders 表                      order_events 表
id  status   amount            id  event_type      data
1   PAID    100.00             1   OrderCreated    {id:1, amount:100}
                               2   PaymentReceived {txn:abc, amount:100}
                               3   OrderConfirmed  {}

当前状态 = SELECT * FROM orders WHERE id = 1
当前状态 = 回放事件 1, 2, 3 → 推导出 Order{id:1, status:CONFIRMED, amount:100}
```

```java
// 事件溯源的核心组件

// 事件存储
public class OrderEventStore {
    private final JdbcTemplate jdbc;

    public void saveEvents(Long orderId, List<OrderEvent> events) {
        for (OrderEvent event : events) {
            jdbc.update(
                "INSERT INTO order_events (order_id, event_type, data, version) " +
                "VALUES (?, ?, ?, ?)",
                orderId, event.getType(), event.toJson(), event.getVersion());
        }
    }

    public List<OrderEvent> loadEvents(Long orderId) {
        return jdbc.query(
            "SELECT * FROM order_events WHERE order_id = ? ORDER BY version ASC",
            new OrderEventRowMapper(), orderId);
    }
}

// 聚合重建：从事件流还原当前状态
public class OrderAggregate {

    public static Order rebuild(List<OrderEvent> events) {
        Order order = new Order();  // 空白状态

        for (OrderEvent event : events) {
            order.apply(event);     // 逐个应用事件
            // {
            //   OrderCreated → order.id = 1, order.amount = 100
            //   PaymentReceived → order.status = PAID
            //   OrderConfirmed → order.status = CONFIRMED
            // }
        }
        return order;  // 最终状态：Order{id:1, status:CONFIRMED, amount:100}
    }
}
```

### 15.4.2 优势与代价

| 优势 | 代价 |
|------|------|
| 完整审计（每步变化都可追溯） | 查询当前状态需要 replay 事件（用快照优化） |
| 时间旅行调试（replay 到任意历史时刻） | 事件 schema 演化困难（老事件的格式可能和新代码不兼容） |
| CQRS 的天然基础（事件流就是写模型） | 学习成本高——开发方式与 CRUD 思维完全不同 |

---

## 15.5 本章小结

微服务数据管理的四种模式不是互斥的选择——它们通常组合使用：

- **Database per Service** 是所有模式的前提——没有这个原则，其他模式没有意义
- **Saga** 处理跨服务的业务事务 —— 编排型适合复杂流程
- **CQRS** 处理读写不对称 —— 读端为查询优化，写端为业务规则优化
- **事件溯源** 处理审计和时间旅行需求 —— 以事件为中心而非状态为中心

数据管理的选择取决于一个核心问题：**在这个系统中，数据的一致性要求、查询模式和审计需求分别是什么？**
