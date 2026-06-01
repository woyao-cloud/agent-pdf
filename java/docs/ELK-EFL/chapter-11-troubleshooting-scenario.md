# 第11章 场景一：全链路排障与"客诉秒级定位"

## 本章导读

客服投诉是开发团队的"噩梦"——"用户说下单失败了，查一下原因"。如果没有 TraceId，你需要登录多台服务器，搜索多个关键词，花 20 分钟才能定位到问题。本章展示基于 TraceId 的全链路秒级定位。

---

## 11.1 基于 orderId 的秒级定位

```kibana
# Kibana 搜索——基于订单 ID 一键拉取全链路日志
# 在 Kibana Discover 中搜索：

orderId: "order_2001"

# 结果：返回 15 条日志，包含：
# 订单服务：收到下单请求、调用支付服务、支付回调
# 支付服务：收到支付请求、调用库存服务、支付成功
# 库存服务：收到扣减请求、库存扣减成功

# 如果不知道 orderId，但知道 userId：
userId: "user_1001" AND @timestamp > now-1h

# 从 userId 的日志中找到 orderId
# 再用 orderId 搜索全链路
```

---

## 11.2 代码中透传 TraceId

```java
// Feign Client 拦截器——自动透传 TraceId
@Component
public class FeignTraceInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate request) {
        // 从当前 MDC 获取 traceId
        String traceId = MDC.get("traceId");
        if (traceId != null) {
            request.header("X-Trace-Id", traceId);
        }
    }
}
```

---

## 本章总结

TraceId 是全链路排障的核心。只要在服务间调用时透传了 TraceId，任何投诉都能在 30 秒内定位到根因。这是日志系统最直接的价值体现。