# 第11章 场景一：全链路排障与"客诉秒级定位"

## 本章导读

周五下午 5:58，你正准备收拾东西下班。手机响了——客服主管打来的，语气急促：

"一个 VIP 客户投诉他的订单支付成功了，但没收到任何确认消息，也没有物流信息。这个客户是公司的重要合作伙伴，CEO 在关注。你能不能尽快查一下？"

你打开电脑，开始排查：

**没有 TraceId 的时代（大多数公司的现状）：**

```
18:00  登录订单服务服务器 → grep "order_2001" order.log
       找到一条"收到下单请求"（信息太少）
       
18:03  登录支付服务服务器 → grep "order_2001" payment.log
       看到"支付成功"，但不知道库存服务调用情况
       
18:08  登录库存服务服务器 → grep "order_2001" stock.log
       没找到记录！可能是订单号格式不一样？
       
18:12  换关键词搜索 → grep "1001" stock.log（用 userId 搜）
       找到 50 条记录，不知道哪条是这个订单的
       
18:20  确认库存扣减成功了，但为什么没发确认消息？
       去查消息服务 → 发现消息服务根本没收到通知！
       
18:25  根因：订单服务调用支付服务后，支付回调中发消息通知时
       抛了一个空指针异常，但被 catch 并吞掉了
       没有打印 error 日志，所以你不知道
       
18:30  回复客服："查到了，是代码 Bug，下个版本修复"
       （你以为花了 30 分钟，实际上已经快 2 小时了）
```

**有 TraceId 的时代（本章的目标）：**

```
  18:00  收到客服投诉
 
  18:00:05  打开 Kibana → 搜索 traceId: "abc-def-ghi-123"
            （这个 traceId 是用户提供或从订单号反查的）
 
  18:00:07  看到 15 条日志，按时间轴排列：
            1. 订单服务: 收到下单请求 ✓
            2. 订单服务: 调用支付服务 ✓
            3. 支付服务: 收到支付请求 ✓
            4. 支付服务: 调用库存服务 ✓
            5. 库存服务: 库存扣减成功 ✓
            6. 支付服务: 支付成功 ✓
            7. → 订单服务: 收到支付回调 →
            8. → 订单服务: *** 空指针异常 *** ← 根因！
            9. → 订单服务: catch 中只打了 "处理失败"
               没有打印异常栈，错误被吞了
 
  18:00:30  回复客服："查到了，是支付回调中的一个空指针异常。
            需要修复代码。我先手动给客户补发一条确认消息。"
 
  18:01    CEO 收到了客服主管的回复："已定位问题，正在修复"
  
  总耗时：不到 2 分钟
```

这就是 TraceId 的价值——**从"半小时的猜谜游戏"变成"2 分钟的确定性排查"**。本章将展示如何在实际项目中实现这种能力。

---

## 11.1 跨微服务的日志串联——TraceId 穿透

### 一次请求穿越三个服务的数据流

```
TraceId 在微服务间的传递路径：

  客户端                   订单服务                支付服务                库存服务
    │                       │                      │                      │
    │ HTTP POST /order      │                      │                      │
    │ X-Trace-Id: abc123    │                      │                      │
    │ ───────────────────►  │                      │                      │
    │                       │                      │                      │
    │                       │ MDC.put(traceId)     │                      │
    │                       │ 打印日志：收到请求    │                      │
    │                       │ traceId=abc123      │                      │
    │                       │                      │                      │
    │                       │ Feign 调用支付        │                      │
    │                       │ X-Trace-Id: abc123   │                      │
    │                       │ ──────────────────►  │                      │
    │                       │                      │ MDC.put(traceId)     │
    │                       │                      │ 打印日志：收到支付    │
    │                       │                      │ traceId=abc123      │
    │                       │                      │                      │
    │                       │                      │ 调用库存服务          │
    │                       │                      │ X-Trace-Id: abc123   │
    │                       │                      │ ──────────────────► │
    │                       │                      │                      │ MDC.put(traceId)
    │                       │                      │                      │ 打印日志：扣减库存
    │                       │                      │                      │ traceId=abc123
    │                       │                      │ ◄── 返回 ────────── │
    │                       │ ◄── 返回 ─────────── │                      │
    │ ◄── 响应 ──────────── │                      │                      │
    │                       │                      │                      │
    │                                                                    │
    │  在 Kibana 搜索 traceId: "abc123" → 跨 3 个服务的日志全部返回       │
    │  按 @timestamp 排序 → 完整的请求生命周期一目了然                      │
```

**关键理解**：TraceId 必须在**每一个**服务调用时透传。如果某个服务透传断了，TraceId 就断了，你在 Kibana 中就搜索不完整的链路。常见的透传点有三个：**HTTP 调用（Feign/RestTemplate）、消息队列（RocketMQ/Kafka）、异步线程池**。

### Feign Client 拦截器——自动透传 TraceId

在 Spring Cloud 微服务中，Feign 是服务间调用最常用的方式。下面的拦截器确保每次 Feign 调用都自动携带当前 MDC 中的 traceId：

```java
/**
 * Feign 请求拦截器
 *
 * 功能：在每次 Feign 调用时，自动将当前线程 MDC 中的 traceId
 * 写入 HTTP 请求头 X-Trace-Id 中
 *
 * 这样下游服务收到请求后，可以从请求头中提取 traceId
 * 注入自己的 MDC，实现 traceId 的跨服务透传
 */
@Component
public class FeignTraceInterceptor implements RequestInterceptor {

    // Feign 会在每次发起 HTTP 请求前调用这个方法
    @Override
    public void apply(RequestTemplate request) {
        // 从当前线程的 MDC 中获取 traceId
        // MDC 是 Logback 的线程局部变量，与当前请求线程绑定
        String traceId = MDC.get("traceId");

        if (traceId != null && !traceId.isEmpty()) {
            // 将 traceId 写入 HTTP 请求头
            // 下游服务的 TraceIdFilter 会从这个头中读取
            request.header("X-Trace-Id", traceId);

            // 也可以兼容 Spring Cloud Sleuth 的 B3 格式
            request.header("X-B3-TraceId", traceId);
        }
    }
}
```

> **⚠️ 常见误区**：很多人只配置了 Feign 拦截器，但没有考虑**消息队列**场景。如果一个服务通过 RocketMQ/Kafka 发送消息给另一个服务，TraceId 怎么透传？MQ 消息的 header 中也要带上 traceId，消费者收到后从消息头提取 traceId 写入 MDC。

### RestTemplate 拦截器

如果你的项目使用 RestTemplate 而不是 Feign，同样需要配置拦截器：

```java
/**
 * RestTemplate 拦截器——透传 TraceId
 *
 * 当使用 RestTemplate.exchange() / getForObject() 调用下游服务时
 * 自动将 traceId 写入请求头
 */
@Component
public class RestTemplateTraceInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(
            HttpRequest request,
            byte[] body,
            ClientHttpRequestExecution execution) throws IOException {

        // 从 MDC 获取 traceId
        String traceId = MDC.get("traceId");
        if (traceId != null) {
            request.getHeaders().add("X-Trace-Id", traceId);
        }

        // 继续执行请求
        return execution.execute(request, body);
    }

    /**
     * 配置 RestTemplate 时注册拦截器
     */
    @Bean
    public RestTemplate restTemplate() {
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setInterceptors(
            List.of(new RestTemplateTraceInterceptor()));
        return restTemplate;
    }
}
```

### 下游服务接收 TraceId

下游服务（支付服务、库存服务）收到请求后，需要从请求头中读取 traceId 并注入 MDC：

```java
/**
 * TraceId 接收 Filter——在每个微服务的入口处执行
 *
 * 职责：
 *   1. 从 HTTP 请求头中读取 traceId
 *   2. 写入 MDC（Logback 的 JSON 日志自动输出）
 *   3. 在响应头中返回 traceId（方便调用方确认）
 *   4. 请求结束后清理 MDC
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        try {
            // 1. 从请求头获取 traceId（优先级顺序）
            String traceId = httpRequest.getHeader("X-Trace-Id");
            if (traceId == null || traceId.isEmpty()) {
                traceId = httpRequest.getHeader("X-B3-TraceId");
            }

            // 2. 如果调用方没有传递 traceId（比如外部请求）
            //    则自动生成一个新的 traceId
            if (traceId == null || traceId.isEmpty()) {
                traceId = UUID.randomUUID().toString().replace("-", "");
            }

            // 3. 注入 MDC
            MDC.put("traceId", traceId);
            // spanId 代表当前服务的处理单元
            MDC.put("spanId", Long.toHexString(
                ThreadLocalRandom.current().nextLong()));

            // 4. 在响应头中返回 traceId
            httpResponse.setHeader("X-Trace-Id", traceId);

            // 5. 继续执行请求
            chain.doFilter(request, response);

        } finally {
            // 6. ⚠️ 必须清理 MDC！
            // Web 服务器的线程是复用的（线程池），不清除的话
            // 下一个请求会"继承"上一个请求的 traceId
            MDC.clear();
        }
    }
}
```

> **⚠️ MDC 清理陷阱**：在 Spring Boot 中，`@Async` 异步方法会使用新的线程执行，新线程中的 MDC 是空的，traceId 丢失。如果需要在异步线程中保持 traceId，必须手动传递：

```java
// 异步调用时保持 TraceId
@Service
public class AsyncTaskService {

    private static final Logger log = LoggerFactory.getLogger(AsyncTaskService.class);

    @Async
    public CompletableFuture<Void> processAsync(String taskData) {
        // ⚠️ 问题：异步线程中 MDC 是空的！
        // traceId 丢失了！
        log.info("处理异步任务: {}", taskData);
        // 这条日志在 Kibana 中没有 traceId，无法关联到原请求

        return CompletableFuture.completedFuture(null);
    }

    // ✅ 正确做法：在提交异步任务时传递 traceId
    @Async
    public CompletableFuture<Void> processAsyncWithTrace(
            String taskData, String traceId) {
        try {
            // 手动将 traceId 设置到异步线程的 MDC
            MDC.put("traceId", traceId);
            log.info("处理异步任务: {}", taskData);
            // 这条日志有 traceId，可以在 Kibana 中关联到原请求
        } finally {
            MDC.clear();
        }
        return CompletableFuture.completedFuture(null);
    }
}
```

---

## 11.2 从客服投诉到定位根因的完整流程

### 第一步：获取用户的 traceId

客服投诉时，能提供的信息通常有几种：**订单号、用户 ID、手机号、时间范围**。你需要通过这些信息定位到 traceId，或者直接用 traceId 搜索。

```
获取 traceId 的三种方式：

  方式 1：客服直接提供 traceId（推荐）
  ┌──────────────────────────────────────────────┐
  │  前端 App 在"反馈"页面显示 "反馈ID: abc123"  │
  │  客服直接提供这个 ID                          │
  │  → 在 Kibana 搜 traceId: "abc123"             │
  │  → 秒级定位                                   │
  └──────────────────────────────────────────────┘

  方式 2：通过订单号反查 traceId
  ┌──────────────────────────────────────────────┐
  │  在 Kibana 搜索：                             │
  │  orderId: "order_2001"                        │
  │  → 找到订单服务的日志                          │
  │  → 从日志中拿到 traceId                        │
  │  → 用 traceId 搜索全链路                      │
  │  订单服务日志：                                │
  │  {"level":"INFO","message":"订单创建成功",    │
  │   "orderId":"order_2001","traceId":"abc123"}  │
  └──────────────────────────────────────────────┘

  方式 3：通过 userId + 时间范围
  ┌──────────────────────────────────────────────┐
  │  用户不确定订单号，只知道大概时间              │
  │  userId: "user_1001" AND @timestamp > now-3h │
  │  → 该用户最近 3 小时的所有日志                 │
  │  → 查找相关的 orderId 或 traceId              │
  └──────────────────────────────────────────────┘
```

### 第二步：在 Kibana 中全链路搜索

```kibana
# 假设你已经拿到了 traceId: abc-def-ghi-123

# 在 Kibana → Discover 中搜索：
traceId: "abc-def-ghi-123"

# 排序：按 @timestamp 升序排列
# 结果（按时间线）：

# 时间                  服务          级别    消息
# ─────────────────────────────────────────────────
# 10:00:00.123  order-service    INFO    收到下单请求 userId=1001
# 10:00:00.200  order-service    INFO    调用支付服务 amount=999
# 10:00:00.300  payment-service  INFO    收到支付请求 orderId=2001
# 10:00:00.400  payment-service  INFO    调用库存扣减 productId=3001
# 10:00:00.450  stock-service    INFO    扣减库存成功 剩余=99
# 10:00:00.500  payment-service  INFO    支付成功
# 10:00:00.600  payment-service  INFO    发送支付回调
# 10:00:00.700  order-service    INFO    收到支付回调
# 10:00:00.701  order-service    ERROR   *** 空指针异常 *** ← 根因！
# 10:00:00.702  order-service    WARN    处理支付回调失败
#                                          ← 没有打印异常栈！

# 问题在 10:00:00.701 处一目了然：支付回调中发生了空指针异常
# 但开发者在 catch 中只打了 WARN 级别的"处理失败"，没有打印异常栈
# 所以无法通过日志知道具体是哪行代码空指针了
```

### 第三步：从日志中定位代码 Bug

```java
// 排查后发现的问题代码——catch 块中没打印异常栈

// ❌ 错误的异常处理方式
@Component
public class PaymentCallbackHandler {

    @Autowired
    private NotificationService notificationService;

    public void handlePaymentCallback(PaymentCallback callback) {
        try {
            // ...处理支付回调逻辑...

            // 空指针就发生在这句！notificationService 没有注入
            notificationService.sendNotification(
                callback.getUserId(),
                "支付成功",
                callback.getOrderId());

        } catch (Exception e) {
            // ❌ 错误：只打了简单的消息，没有异常栈
            log.warn("处理支付回调失败: orderId={}", callback.getOrderId());
            // 没有传入异常对象 e！
            // 你不知道抛了什么异常、哪行代码抛的
            // 在 ELK 中这条日志的 stack_trace 字段是空的！
        }
    }
}

// ✅ 正确的异常处理方式
public void handlePaymentCallback(PaymentCallback callback) {
    try {
        notificationService.sendNotification(...);
    } catch (Exception e) {
        // ✅ 传入异常对象 e——Logback 会自动记录 stack_trace
        // 在 ELK 中这条日志的 stack_trace 字段会包含完整堆栈
        log.error("处理支付回调失败: orderId={}", callback.getOrderId(), e);
        // ↑ 第三个参数 e 是关键！
        // 在 JSON 日志中，stack_trace 字段会包含：
        // java.lang.NullPointerException: null
        //   at com.example.order.handler.PaymentCallbackHandler.java:42
        //   at ...
    }
}
```

通过 ELK 日志快速定位到问题后，修复代码就变得非常简单：

```java
// 修复后的代码
public void handlePaymentCallback(PaymentCallback callback) {
    try {
        // 修复：确保 notificationService 已注入
        if (notificationService == null) {
            log.error("notificationService 未注入");
            return;
        }
        notificationService.sendNotification(...);
    } catch (Exception e) {
        log.error("处理支付回调失败", e);
    }
}
```

---

## 11.3 一个完整的排障案例

### 场景：客户投诉"下单后没收到确认消息"

假设你收到了客服转来的投诉：用户 ID=1001，订单 ID=ORD-20240115-001，投诉内容是"支付成功但没有收到确认消息"。

```kibana
# 步骤 1：先通过 orderId 搜索，查看订单服务的日志
# 在 Kibana Discover 中搜索：

orderId: "ORD-20240115-001" AND serviceName: "order-service"

# 你可能看到这样的结果（已按时间排序）：
# 10:00:00.123 [INFO]  收到下单请求
# 10:00:00.200 [INFO]  调用支付服务
# 10:00:01.500 [WARN]  支付回调处理失败 ← 明显有问题！
# ← 没有"订单创建成功"的日志！说明订单没有成功创建

# 步骤 2：拿到 traceId，搜索全链路
# 从第一条日志中复制 traceId

traceId: "abc-def-ghi-123"

# 结果：
# 10:00:00.123  order-service  INFO   收到下单请求
# 10:00:00.200  order-service  INFO   调用支付服务
# 10:00:00.300  payment-service INFO  收到支付请求
# 10:00:00.450  stock-service  INFO   库存扣减成功
# 10:00:00.500  payment-service INFO  支付成功，发送回调
# 10:00:01.500  order-service  WARN  支付回调处理失败
#                                     ← 没有打印异常

# 步骤 3：查看 WARN 日志的 stack_trace 字段
# 在 Kibana 中展开这条日志的 stack_trace 字段
# 如果开发者正确传入了异常对象（见上节），你会看到：
# java.lang.NullPointerException
#   at com.example.order.handler.PaymentCallbackHandler.java:42

# 步骤 4：修复代码（如上节所示）

# 步骤 5：手动补发确认消息
# 在 Kibana 中确认用户已经支付成功后，手动调用消息发送接口
# 给用户补发确认消息
```

### 常见排障场景的 KQL 查询模板

```kibana
// 场景 1：已知 traceId ——最快速
traceId: "abc-def-ghi-123"

// 场景 2：已知 orderId ——获取 traceId 后再搜
orderId: "ORD-20240115-001"

// 场景 3：已知 userId + 时间范围 ——找到 orderId 后再搜
userId: "user_1001" AND @timestamp >= now-1d
// 从结果中找到 orderId，再用 orderId 搜

// 场景 4：查某个时间段的错误 ——找到错误后看 traceId
@timestamp >= now-1h AND level: "ERROR"
// 找到错误日志，复制 traceId，搜全链路

// 场景 5：查某个接口的慢请求
serviceName: "order-service" AND duration > 5000
// 找到慢请求的 traceId，搜全链路→找到瓶颈

// 场景 6：按用户 ID 查他最近的所有操作
userId: "user_1001" AND @timestamp >= now-7d
// 返回该用户 7 天内的所有操作日志
```

---

## 11.4 生产环境的必备配置

```yaml
# application.yml —— TraceId 相关的完整配置

spring:
  application:
    name: order-service

  # 对于使用 Spring Cloud Sleuth (Spring Boot 2.x)
  sleuth:
    enabled: true

  # 对于使用 Micrometer Tracing (Spring Boot 3.x)
  # 不需要额外配置，引入依赖即可自动生效

logging:
  pattern:
    # 在控制台日志级别中显示 traceId（开发调试用）
    level: "%5p [%X{traceId:-no-trace}]"
```

```xml
<!-- logback-spring.xml 确保 traceId 出现在 JSON 日志中 -->
<encoder class="net.logstash.logback.encoder.LoggingEventCompositeJsonEncoder">
    <providers>
        <!-- ... 其他 providers ... -->

        <!-- ⚠️ 关键：输出 MDC 中的 traceId -->
        <mdc>
            <!-- 只输出指定的 MDC 字段 -->
            <include>traceId,spanId,userId,orderId</include>
        </mdc>

        <!-- ... -->
    </providers>
</encoder>
```

---

## 本章总结

```
排障方式对比：

  ┌────────────────────────┬─────────────────────┬────────────────────┐
  │                        │   无 TraceId         │   有 TraceId       │
  ├────────────────────────┼─────────────────────┼────────────────────┤
  │ 定位一个跨服务问题      │ 20-30 分钟           │ 1-2 分钟           │
  │ 需要登录的服务器数量     │ 3-5 台               │ 0 台（Kibana 搞定） │
  │ 需要沟通的人数          │ 3 人+               │ 1 人               │
  │ 是否能复现问题现场      │ 不太可能             │ 日志就是现场        │
  │ 是否能精确到代码行      │ 不一定               │ 可以（有异常栈）    │
  │ 是否能追溯历史问题      │ 日志被清理了就没了    │ 可以（只要有日志） │
  └────────────────────────┴─────────────────────┴────────────────────┘
```

**核心原则**：
1. **TraceId 是全链路排障的"银弹"**——一次请求的所有日志有了同一个 ID，就不再需要"猜"哪些日志是属于同一个请求的
2. **TraceId 必须在每个服务间透传**——Feign 拦截器、RestTemplate 拦截器、MQ 消息头、异步线程池，任何一个环节断了，链路就断了
3. **异常日志必须传入异常对象**——`log.error("消息", e)` 而不是 `log.error("消息" + e.getMessage())`。前者会在 JSON 日志中输出 stack_trace 字段，后者只能看到一个简单的错误消息
4. **前端也要展示 traceId**——在 App/Web 的"反馈"页面展示一个"反馈 ID"（就是 traceId），客服拿到 traceId 直接就能在 Kibana 中查，不需要转述"用户说几点下的单"这类模糊信息