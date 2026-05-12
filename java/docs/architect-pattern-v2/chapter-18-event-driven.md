# 第18章 事件驱动架构（EDA）

事件驱动架构（Event-Driven Architecture）是一种以事件的产生、检测和消费为核心的架构风格。不同于请求-响应模型中调用方主动发起和控制交互，EDA 中组件通过发布和订阅事件来实现松耦合的异步协作。

---

## 18.1 解决的问题与应用场景

### 18.1.1 核心问题

请求-响应模型在处理以下场景时有根本性的局限：

- **多消费者的信息传播**：订单创建后，积分、通知、审计、分析等五个系统都想知道——请求-响应需要调用方逐一通知每个消费者
- **跨服务的数据同步**：用户修改了地址 → 8 个服务缓存的用户地址全部失效
- **操作间的时序松耦合**：下单后 15 分钟还没有支付 → 自动取消

EDA 的答案：**不要主动调用其他服务做什么——而是发布"发生了这件事"的事实，让感兴趣的组件自行响应。**

### 18.1.2 应用场景

| 场景 | 事件驱动优势 |
|------|-------------|
| **订单履约系统** | 订单创建 → (支付、库存、物流、通知)各自响应 |
| **实时数据管道** | 传感器数据 → 流处理 → 告警/存储/仪表盘 |
| **CQRS 的同步层** | 写端发布事件 → 读模型更新 |
| **微服务间数据同步** | A 的实体变更 → B 和 C 的缓存失效 |
| **Saga 事务协调** | 每个 Saga 步骤完成后发布事件触发下一步 |

---

## 18.2 实现原理

### 18.2.1 核心角色

```
┌─────────────┐     发布事件     ┌──────────────┐
│  事件生产者   │ ───────────────→ │   事件通道     │
│  (Producer)  │                  │  (Channel)    │
└─────────────┘                  └──────┬───────┘
                                        │ 分发事件
                          ┌─────────────┼─────────────┐
                          ▼             ▼             ▼
                    ┌──────────┐ ┌──────────┐ ┌──────────┐
                    │ 事件消费者 │ │ 事件消费者 │ │ 事件消费者 │
                    │Consumer A│ │Consumer B│ │Consumer C│
                    └──────────┘ └──────────┘ └──────────┘

关键特征：
- 生产者不感知消费者——不知道谁在消费、是否消费成功
- 消费者彼此独立——A 处理失败不影响 B
- 事件通道负责可靠的投递保证——至少一次 / 最多一次 / 精确一次
```

### 18.2.2 事件的定义

```java
// 事件是"已发生的事实"——不是"命令"或"请求"
// 命名：过去式（OrderCreated, PaymentReceived, InventoryReserved）

// 好的事件设计：
public class OrderCreatedEvent {
    private final String eventId = UUID.randomUUID().toString();
    private final String eventType = "OrderCreated";
    private final Instant occurredAt = Instant.now();

    // 事件的负载——提供消费者可能需要的所有信息
    private final Long orderId;
    private final Long userId;
    private final BigDecimal amount;
    private final List<OrderItemInfo> items;

    // 注意：事件是不可变的——它是"已发生的事实"，不能修改
}

// 坏的事件设计：
public class DoSomethingEvent {  // 命令式的命名——这不是事件
    private String action;       // "做什么"——这是命令，不是事件
    // 事件该说"发生了什么"，不是"去做什么"
}
```

### 18.2.3 Spring 事件实现

```java
// === 生产者端 ===

@Service
@Transactional
public class OrderService {
    private final ApplicationEventPublisher eventPublisher;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public OrderResult createOrder(OrderRequest request) {
        Order order = orderRepository.save(Order.create(request));

        // 方式1：进程内事件（Spring ApplicationEvent）
        eventPublisher.publishEvent(new OrderCreatedEvent(order));

        // 方式2：分布式事件（Kafka）
        kafkaTemplate.send("order-events",
            order.getId().toString(),
            new OrderCreatedEvent(order));

        return OrderResult.from(order);
    }
}

// === 消费者端 ===

// 消费者 A：进程内消费者
@Component
public class PointsOnOrderCreated {

    @EventListener
    @Async  // 异步执行，不阻塞发布者的事务
    @Transactional(propagation = Propagation.REQUIRES_NEW)  // 独立事务
    public void handle(OrderCreatedEvent event) {
        pointsService.award(event.getUserId(), event.getAmount());
    }
}

// 消费者 B：分布式消费者（另一个服务）
@Component
public class NotificationOnOrderCreated {

    @KafkaListener(topics = "order-events")
    public void handle(OrderCreatedEvent event) {
        notificationService.sendConfirmation(event.getUserId(), event.getOrderId());
    }
}
```

---

## 18.3 事件驱动 vs 请求-响应

| 维度 | 请求-响应 | 事件驱动 |
|------|----------|----------|
| **控制权** | 调用方决定"何时、做什么" | 发布方说"发生了什么"，消费方自行决定"如何响应" |
| **耦合度** | 调用方必须知道接收方 | 发布方不知道消费者——零耦合 |
| **时序** | 同步——调用方阻塞等待 | 异步——发布后即返回 |
| **响应** | 即时结果 | 没有即时结果（最多有确认 ACK） |
| **故障处理** | 调用方收到错误并处理 | 消费者独立处理失败，生产者无感知 |
| **适用** | 查询、需要即时响应的操作 | 通知、同步、异步工作流 |

```java
// 同一场景的两种方式对比：

// 请求-响应：订单服务主导
@Service
public class OrderService {
    public void createOrder(Order order) {
        save(order);
        paymentClient.charge(order);          // 调用方控制：你去做支付
        notificationClient.send(order);       // 调用方控制：你发通知
        pointsClient.award(order);            // 调用方控制：你发积分
        // 订单服务"知道"所有后续步骤——它是上帝视角
    }
}

// 事件驱动：订单服务只做自己的事
@Service
public class OrderService {
    public void createOrder(Order order) {
        save(order);
        eventPublisher.publish(new OrderCreatedEvent(order));
        // 订单服务不知道后面发生了什么——它只关心订单本身
    }
}
```

---

## 18.4 事件驱动架构的挑战

### 18.4.1 隐式工作流

```
请求-响应：代码清晰地展示了调用关系
  OrderService → PaymentService → NotificationService
  → 调试时跟踪调用堆栈就行

事件驱动：代码中看不到"谁在响应这个事件"
  OrderService → EventBus → ？？？
  → 调试时需要在代码库中搜索 "OrderCreatedEvent" 的所有监听者
  → 可能分散在 15 个模块中 → 心智负担巨大
```

### 18.4.2 最终一致性

```java
// 事件是异步的——所以一致性是"最终"的，不是"即时"的
// 发布 OrderCreated 后：
//   T+0ms: 订单创建（用户看到订单）
//   T+50ms: 积分服务消费事件，发放积分
//   T+200ms: 通知服务消费事件，发送短信
// 在 T+0 到 T+200ms 之间，用户看到订单但没有积分——这是"正常的"不一致窗口
// 但如果通知服务永远消费不到这个事件（消费者挂了），数据就永久不一致
```

---

## 18.5 本章小结

事件驱动架构的本质是**从"我告诉你做什么"到"我告诉你发生了什么"**的思维转变。这个转变带来了解耦的收益和隐式依赖的代价。

选择 EDA 的核心判断：**你的系统有多需要松耦合和独立演进？** 如果一个事件有 3+ 个自然消费者，或者消费者和生产者由不同的团队维护——EDA 的价值大于代价。如果只有一个消费者，同步调用更简单。
