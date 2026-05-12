# 第7章 多层架构（N-Tier Architecture）
多层架构是三层架构的扩展，增加更多层次以满足复杂业务需求。
## 7.1 解决的问题与应用场景
### 7.1.1 解决的问题
- 业务复杂度高，需要更多分层
- 不同的技术需求在不同层次
- 需要更清晰的职责划分
### 7.1.2 典型应用场景
- 大型企业应用
- 复杂业务系统
- 需要多级缓存的系统
## 7.2 实现原理与结构
### 7.2.1 四层架构
```          ┌──────────────────┐
│  表现层 Web层    │ - Controller
├──────────────────┤
│  应用层 Service  │ - 业务流程编排
├──────────────────┤
│  领域层 Domain   │ - 业务规则
├──────────────────┤
│  基础设施层 Infra│ - DB、缓存、消息
└──────────────────┘
```
### 7.2.2 代码示例
```java
// 应用层
@Service
public class OrderApplicationService {
    private final OrderDomainService domainService;
    private final PaymentService paymentService;
    private final NotificationService notificationService;
    
    public Order createOrder(CreateOrderCommand cmd) {
        // 1. 调用领域服务
        Order order = domainService.create(cmd);
        
        // 2. 调用外部服务
        paymentService.pay(order);
        
        // 3. 发送通知
        notificationService.notify(order);
        
        return order;
    }
}

// 领域层
@Service
public class OrderDomainService {
    public Order create(CreateOrderCommand cmd) {
        Order order = new Order(cmd.getCustomerId(), cmd.getItems());
        order.validate();
        order.calculateTotal();
        return repository.save(order);
    }
}
```
## 7.3 潜在风险与问题
- 层次过多导致性能损耗
- 职责边界不清晰
- 维护成本增加
## 7.4 优化策略
- 避免过度分层
- 合理使用依赖注入
- 异步处理非关键路径
## 7.5 本章小结
多层架构适用于复杂业务系统，需要合理控制层次数量。
---