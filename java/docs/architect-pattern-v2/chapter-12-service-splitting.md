# 第12章 服务拆分模式

服务拆分（Service Decomposition）是微服务架构设计的起点，也是最难的部分。将系统拆成"刚好合适"的服务数量和粒度，决定了未来数年架构的演化成本。

---

## 12.1 按业务能力拆分

### 12.1.1 核心理念

业务能力（Business Capability）是一个组织"做什么"——创造价值的能力单元。它不关心"怎么做"（那是技术实现的事）。

```
识别业务能力的方法：看组织结构图

一家电商公司的业务能力：
  - 商品管理（Product Catalog）
  - 订单管理（Order Management）
  - 支付（Payment）
  - 物流（Logistics/Shipping）
  - 用户账户（User Account）
  - 营销（Marketing）
  - 客户服务（Customer Service）

→ 每个业务能力对应一个微服务
→ 每个服务由一个团队"拥有"
→ 团队的职责边界 = 服务的代码边界
```

```java
// 按业务能力拆分的代码组织
// 每个业务能力是一个独立的代码库 + 独立的数据库

// Order Service (codebase: git@github.com:company/order-service.git)
// 数据库: order_db → 只有订单服务的代码能访问这个数据库
@SpringBootApplication
public class OrderServiceApp { }

// Payment Service (codebase: git@github.com:company/payment-service.git)  
// 数据库: payment_db → 只有支付服务的代码能访问这个数据库
@SpringBootApplication
public class PaymentServiceApp { }
```

### 12.1.2 康威定律

> "Any organization that designs a system will produce a design whose structure is a copy of the organization's communication structure."
> — Melvin Conway, 1967

**逆康威定律**：如果你想构建一个微服务架构，先按目标服务边界重组你的团队。

---

## 12.2 按子域拆分（DDD）

### 12.2.1 领域驱动设计的分域

DDD（Domain-Driven Design）提供了比"业务能力"更精细的拆分方法：

```
业务域 (Domain) → 拆分为 →
  核心域 (Core Domain): 竞争优势所在，投入最好的资源
  支撑子域 (Supporting Subdomain): 支撑核心域运行但不产生差异化价值
  通用子域 (Generic Subdomain): 现成的解决方案或标准问题

电商系统的 DDD 子域拆分：
  核心域: 订单履约流程（这是你的竞争优势——别人做不到你这么高效）
  支撑子域: 商品分类管理（必须的，但不产生竞争优势）
  通用子域: 认证授权（用 Keycloak 的标准方案即可）
```

```java
// DDD 子域与服务映射
// 核心域 → 投入最多资源，架构最精细的内部微服务
// 支撑子域 → 标准微服务，可用现成框架
// 通用子域 → 购买现成产品或用最简实现

// 订单核心域（核心）——内部实现复杂，频繁迭代
public class OrderFulfillmentDomain {
    // 复杂的业务规则、状态机、补偿逻辑
}

// 认证（通用域）——直接接入 Keycloak
@Configuration
public class AuthConfig {
    // 不需要自己实现 OAuth2——Keycloak 提供了完整的解决方案
}
```

### 12.2.2 限界上下文（Bounded Context）

```
限界上下文是 DDD 中最重要也是最实用的概念：
  每个限界上下文内，一个术语只有一个明确的含义
  不同限界上下文之间，同一个术语可以有不同的含义

示例：电商系统中"商品"（Product）在不同上下文中的含义：

  商品管理上下文: Product = { name, description, price, images, specs }
  订单上下文:     Product = { id, name, price, quantity }  ← 只有下单需要的信息
  物流上下文:     Product = { id, name, weight, dimensions }  ← 只有物流需要的信息

→ 拆分为三个服务：ProductCatalogService, OrderService, LogisticsService
→ 各自维护自己的数据，用"Product"的不同表示
→ 没有"全局唯一的 Product 模型"——这是松耦合的代价和优势
```

---

## 12.3 按事务拆分

### 12.3.1 事务边界即服务边界

```java
// 拆分最简单也最实用的规则：
// 需要在一个数据库事务中完成的操作 → 必须在同一个服务内
// 可以分开在两个数据库中完成的操作 → 可以拆分为两个服务

// 事务边界分析：
@Transactional  // 这个事务跨越了两个业务概念
public void createOrder(OrderRequest request) {
    // 步骤1：扣库存 ← 必须和订单创建在同一个事务中吗？
    inventoryService.deduct(request.getItems());

    // 步骤2：创建订单
    orderRepository.save(order);

    // 步骤3：扣除优惠券 ← 必须吗？
    couponService.use(request.getCouponCode());
}

// 分析结果：
// 扣库存：如果库存不足，订单应该创建失败 → 应该在同一个事务中
//                                     → 不应该拆分为独立服务
// 扣除优惠券：如果优惠券扣除失败，订单应该回滚吗？
//            → 如果Yes → 同一个事务/服务
//            → 如果No  → 可以异步处理 → 可以拆分为独立服务
```

### 12.3.2 Saga 模式——跨服务事务的补偿

```java
// 当业务逻辑天然跨越多个服务时，不能用 ACID 事务
// Saga 通过"每个步骤的本地事务 + 失败时的补偿操作"实现最终一致性

@Service
public class CreateOrderSaga {

    // Step 1: 创建订单（本地事务）
    @Transactional
    public Order createOrder(CreateOrderCommand cmd) {
        Order order = new Order(cmd.getUserId(), cmd.getItems());
        order.markPending();
        orderRepository.save(order);
        return order;
    }

    // Step 2: 预留库存（远程调用）
    public InventoryResult reserveInventory(Order order) {
        try {
            return inventoryClient.reserve(order.getItems());
        } catch (Exception e) {
            // 补偿：取消订单
            cancelOrder(order, "库存预留失败");
        }
    }

    // Step 3: 处理支付（远程调用）
    public PaymentResult processPayment(Order order) {
        try {
            return paymentClient.charge(order.getAmount());
        } catch (Exception e) {
            // 补偿：释放库存 + 取消订单
            inventoryClient.release(order.getReservationId());
            cancelOrder(order, "支付失败");
        }
    }
}
```

---

## 12.4 拆分粒度选择

### 12.4.1 粒度过细 vs 过粗的信号

```java
// 服务过细的信号：
// 1. 完成一个简单的"用户下单"需要 6 个服务同时参与
// 2. 每次修改一个服务 A，都必须在 B 和 C 中做联动修改
// 3. 服务间的网络调用延迟超过了业务逻辑本身的时间
// 4. 一个开发者必须同时理解 5+ 个服务的代码才能完成一个任务

// 服务过粗的信号：
// 1. 一个"服务"的代码量超过了 5 万行
// 2. 同一个服务内的两个模块有不同的部署频率
// 3. 一个团队修改代码经常被另一个团队的修改挡路
// 4. 数据库表被 10+ 个不相关的模块同时访问

// 实用粒度准则：
// "一个服务 = 一个两披萨团队（6-8人）能理解和维护的范围"
// "一个服务的代码量 = 一个开发者能在两周内从零读懂的规模"
```

### 12.4.2 演进式拆分策略

```java
// 不是"一次性拆好"——是"每次只拆一个，验证后再拆下一个"

// 演进路径：
// 阶段1：模块化单体（Package by Feature + 严格模块边界）
// 阶段2：提取第一个高变化的服务（如：独立的 Payment Service）
// 阶段3：验证 Payment Service 稳定 → 提取第二个服务
// ...

// 每次拆分检查：
// 1. 拆出后的服务能否被一个团队完全拥有？
// 2. 跨服务的数据一致性是否可管理（Saga/事件溯源）？
// 3. 运维成本是否可接受（监控/部署/追踪）？
```

---

## 12.5 本章小结

服务拆分的核心原则：**不是技术告诉你该怎么拆——是业务和组织告诉你该怎么拆。** 技术是"拆分之后如何运作"的问题，而非"该在哪里拆分"的问题。

拆分的四种方法形成一个优先级链：先看业务能力（最宏观），不够细再看 DDD 子域，然后在事务边界上验证你的拆分方案，最后持续监控"粒度过细/过粗"的信号来调整。
