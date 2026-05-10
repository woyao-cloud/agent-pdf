# 第7章 面向服务的架构（SOA）
SOA是一种将系统功能封装为可复用服务的架构模式，强调服务之间的松耦合和互操作。
## 7.1 解决的问题与应用场景
### 7.1.1 问题
- 遗留系统集成困难
- 跨系统业务流程复杂
- 服务复用率低
### 7.1.2 典型场景
- 企业级系统集成
- 跨部门业务流程
- 多系统统一服务
## 7.2 实现原理
### 7.2.1 核心概念
```java
// 服务定义
public interface OrderService {
    @WebMethod
    Order createOrder(@WebParam(name = "order") Order order);
    
    @WebMethod  
    Order getOrder(@WebParam(name = "id") Long id);
}

// 服务实现
@WebService(serviceName = "OrderService")
public class OrderServiceImpl implements OrderService {
    public Order createOrder(Order order) { return orderRepository.save(order); }
    public Order getOrder(Long id) { return orderRepository.findById(id); }
}
```ESB企业服务总线：
```          ┌─────────┐     ┌─────────┐     ┌─────────┐
System A ─►│   ESB   │◄───►│ System B│◄───►│ System C│
          └─────────┘     └─────────┘     └─────────┘```## 7.3 与微服务的区别| 方面 | SOA | 微服务 |
|------|-----|--------|
| 服务粒度 | 粗粒度 | 细粒度 |
| 通信 | ESB总线 | 轻量级HTTP |
| 部署 | 整体部署 | 独立部署 |
| 治理 | 中央化 | 去中心化 |
## 7.4 潜在风险- ESB单点故障- 性能开销- 复杂性增加- 版本管理困难## 7.5 本章小结
SOA适合大型企业集成， 但复杂度高， 现代系统更多采用微服务架构。