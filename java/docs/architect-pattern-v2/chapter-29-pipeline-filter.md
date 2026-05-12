# 第29章 管道与过滤器模式

管道与过滤器（Pipeline-Filter）是一种将数据处理分解为一系列独立步骤的架构模式。每个步骤（Filter）对数据执行特定的变换，步骤之间通过管道（Pipeline/Pipe）连接，数据从一个过滤器流出后进入下一个过滤器。

---

## 29.1 解决的问题与应用场景

### 29.1.1 核心问题

在复杂的数据处理系统中，以下问题反复出现：

```
问题场景：

需求：需要对一段数据依次执行 验证 → 转换 → 加密 → 压缩 → 存储

方案 A：写一个巨大的处理方法
  void process(Data data) {
      validate(data);       // 验证
      transform(data);      // 转换
      encrypt(data);        // 加密
      compress(data);       // 压缩
      store(data);          // 存储
  }
  问题：五个步骤的代码耦合在一个方法中
       - 想加一个步骤 → 改 process 方法
       - 想跳过某个步骤 → 加 if 判断，方法越来越复杂
       - 无法独立测试某个步骤
       - 无法复用某个步骤（例如 encryption 在别处也要用）

方案 B：使用管道与过滤器模式
  Data → [Validate] → [Transform] → [Encrypt] → [Compress] → [Store] → Result

  每个 [Box] 是一个独立的 Filter
  每个 → 是 Pipe
  可以自由编排：调整顺序、增删步骤、并行执行
```

管道与过滤器的核心价值：**将复杂的数据处理流程分解为可组合、可复用、可独立测试的独立单元。**

### 29.1.2 应用场景

| 场景 | 典型例子 |
|------|---------|
| **数据 ETL 管道** | 抽取 → 清洗 → 转换 → 加载 |
| **文本处理** | 分词 → 去停用词 → 词干提取 → 索引 |
| **编译原理** | 词法分析 → 语法分析 → 语义分析 → 代码生成 |
| **图像/视频处理** | 解码 → 滤镜 → 缩放 → 编码 |
| **HTTP 请求处理** | Servlet Filter Chain：认证 → 日志 → 限流 → Controller |
| **数据验证管线** | 格式检查 → 业务规则校验 → 去重 → 持久化 |
| **消息处理** | 接收 → 反序列化 → 验签 → 业务处理 → 序列化 → 发送 |

---

## 29.2 实现原理

### 29.2.1 核心组件

```
管道与过滤器模式的核心组件：

┌──────────────────────────────────────────────────────┐
│                    Pipeline                          │
│                                                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐          │
│  │ Filter  │ →  │ Filter  │ →  │ Filter  │          │
│  │   A     │    │   B     │    │   C     │          │
│  └─────────┘    └─────────┘    └─────────┘          │
│       │              │              │                │
│       ▼              ▼              ▼                │
│  Data              Data           Data               │
│  (input)         (transformed)  (output)             │
│                                                      │
│  Pipe: Filter 之间的连接器，传递数据                   │
│  Filter: 对数据执行单一变换的独立单元                  │
│  Pipeline: 一组 Filter 的有序组合                     │
└──────────────────────────────────────────────────────┘

关键约束：
1. 每个 Filter 必须独立——不共享状态，不依赖其他 Filter 的内部实现
2. Filter 之间只通过 Pipe 传递的数据通信
3. 每个 Filter 对上游和下游的实现一无所知
```

### 29.2.2 Java 实现：基础框架

```java
// 第一步：定义统一的数据上下文 —— 在 Filter 之间流转的对象
@Data
@Builder
public class PipelineContext {
    private Map<String, Object> attributes;  // 携带各 Filter 产生的数据
    private boolean shouldContinue;          // 是否继续执行后续 Filter
    private List<String> executionLog;       // 执行日志

    public void setAttribute(String key, Object value) {
        attributes.put(key, value);
    }

    @SuppressWarnings("unchecked")
    public <T> T getAttribute(String key) {
        return (T) attributes.get(key);
    }

    public void stop() {
        this.shouldContinue = false;
    }
}

// 第二步：定义 Filter 接口 —— 所有的 Filter 实现这个接口
public interface Filter {
    /**
     * 对上下文执行过滤操作
     * @param context 数据上下文
     */
    void execute(PipelineContext context);

    /** Filter 名称——用于日志和排错 */
    default String getName() {
        return this.getClass().getSimpleName();
    }

    /** 优先级——数值越小越先执行，默认 0 */
    default int getOrder() {
        return 0;
    }
}

// 第三步：Pipeline —— 组装和执行 Filter 链
public class Pipeline {
    private final List<Filter> filters = new ArrayList<>();

    public Pipeline addFilter(Filter filter) {
        this.filters.add(filter);
        return this;  // 流式 API
    }

    public Pipeline addFilter(Filter filter, int order) {
        this.filters.add(new OrderedFilter(filter, order));
        return this;
    }

    public PipelineContext execute(PipelineContext context) {
        // 按优先级排序
        filters.sort(Comparator.comparingInt(Filter::getOrder));

        for (Filter filter : filters) {
            if (!context.isShouldContinue()) {
                break;  // 短路：当前面的 Filter 设置了 stop
            }
            try {
                filter.execute(context);
                context.getExecutionLog().add(
                    String.format("[OK] %s completed", filter.getName()));
            } catch (Exception e) {
                context.getExecutionLog().add(
                    String.format("[FAIL] %s: %s", filter.getName(), e.getMessage()));
                context.setAttribute("error", e);
                break;  // 出现异常，停止后续执行
            }
        }
        return context;
    }

    // 支持 Order 的内部包装类
    private record OrderedFilter(Filter delegate, int order) implements Filter {
        @Override
        public void execute(PipelineContext context) {
            delegate.execute(context);
        }

        @Override
        public String getName() {
            return delegate.getName();
        }

        @Override
        public int getOrder() {
            return order;
        }
    }
}
```

### 29.2.3 完整示例：订单处理管道

```java
// 场景：订单从创建到持久化的完整处理管线
// 流程：参数校验 → 库存检查 → 价格计算 → 风险控制 → 持久化 → 通知

// Filter 1: 参数校验
@Component
public class OrderValidationFilter implements Filter {

    @Override
    public void execute(PipelineContext context) {
        OrderRequest request = context.getAttribute("request");

        if (request.getUserId() == null) {
            throw new IllegalArgumentException("userId 不能为空");
        }
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new IllegalArgumentException("订单项不能为空");
        }
        if (request.getTotalAmount() == null || request.getTotalAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("订单金额必须大于0");
        }

        context.setAttribute("validatedRequest", request);
    }

    @Override
    public int getOrder() { return 100; }
}

// Filter 2: 库存检查 —— 预占库存
@Component
public class InventoryCheckFilter implements Filter {

    private final InventoryService inventoryService;

    public InventoryCheckFilter(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @Override
    public void execute(PipelineContext context) {
        OrderRequest request = context.getAttribute("validatedRequest");

        boolean available = inventoryService.tryReserve(
            request.getItems().stream()
                .map(item -> new SkuQty(item.getSku(), item.getQuantity()))
                .toList()
        );

        if (!available) {
            throw new IllegalStateException("库存不足，无法完成订单");
        }

        context.setAttribute("inventoryReserved", true);
    }

    @Override
    public int getOrder() { return 200; }
}

// Filter 3: 价格计算 —— 应用优惠券、会员折扣、满减
@Component
public class PriceCalculationFilter implements Filter {

    private final PromotionService promotionService;

    public PriceCalculationFilter(PromotionService promotionService) {
        this.promotionService = promotionService;
    }

    @Override
    public void execute(PipelineContext context) {
        OrderRequest request = context.getAttribute("validatedRequest");

        PricingResult pricing = promotionService.calculate(
            request.getItems(),
            request.getCouponId(),
            request.getUserId()
        );

        context.setAttribute("pricingResult", pricing);
    }

    @Override
    public int getOrder() { return 300; }
}

// Filter 4: 风险控制 —— 检查是否为欺诈订单
@Component
public class RiskControlFilter implements Filter {

    private final RiskControlService riskService;

    public RiskControlFilter(RiskControlService riskService) {
        this.riskService = riskService;
    }

    @Override
    public void execute(PipelineContext context) {
        OrderRequest request = context.getAttribute("validatedRequest");
        PricingResult pricing = context.getAttribute("pricingResult");

        RiskAssessment risk = riskService.assess(request.getUserId(),
            pricing.getFinalAmount(), request.getIpAddress());

        if (risk.getLevel() == RiskLevel.HIGH) {
            context.stop();  // 高风险订单 —— 不继续处理，需要人工审核
            context.setAttribute("blocked", true);
            context.setAttribute("blockReason", risk.getReason());
        }

        context.setAttribute("riskAssessment", risk);
    }

    @Override
    public int getOrder() { return 400; }
}

// Filter 5: 持久化 —— 保存订单到数据库
@Component
public class OrderPersistenceFilter implements Filter {

    private final OrderRepository orderRepository;

    public OrderPersistenceFilter(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Override
    public void execute(PipelineContext context) {
        OrderRequest request = context.getAttribute("validatedRequest");
        PricingResult pricing = context.getAttribute("pricingResult");

        Order order = Order.builder()
            .userId(request.getUserId())
            .items(request.getItems())
            .originalAmount(pricing.getOriginalAmount())
            .discountAmount(pricing.getDiscountAmount())
            .finalAmount(pricing.getFinalAmount())
            .status(OrderStatus.CREATED)
            .build();

        order = orderRepository.save(order);
        context.setAttribute("order", order);
    }

    @Override
    public int getOrder() { return 500; }
}

// Filter 6: 通知 —— 发送订单确认
@Component
public class OrderNotificationFilter implements Filter {

    private final NotificationService notificationService;

    public OrderNotificationFilter(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @Override
    public void execute(PipelineContext context) {
        Order order = context.getAttribute("order");
        notificationService.sendOrderConfirmation(order);
    }

    @Override
    public int getOrder() { return 600; }
}
```

```java
// 组装和使用 Pipeline
@Service
public class OrderProcessingService {

    private final Pipeline orderPipeline;

    public OrderProcessingService(
            OrderValidationFilter validationFilter,
            InventoryCheckFilter inventoryFilter,
            PriceCalculationFilter priceFilter,
            RiskControlFilter riskFilter,
            OrderPersistenceFilter persistenceFilter,
            OrderNotificationFilter notificationFilter) {

        this.orderPipeline = new Pipeline()
            .addFilter(validationFilter)
            .addFilter(inventoryFilter)
            .addFilter(priceFilter)
            .addFilter(riskFilter)
            .addFilter(persistenceFilter)
            .addFilter(notificationFilter);
    }

    public OrderResult createOrder(OrderRequest request) {
        PipelineContext context = PipelineContext.builder()
            .attributes(new HashMap<>())
            .shouldContinue(true)
            .executionLog(new ArrayList<>())
            .build();

        context.setAttribute("request", request);

        PipelineContext result = orderPipeline.execute(context);

        // 处理被风控拦截的情况
        if (Boolean.TRUE.equals(result.getAttribute("blocked"))) {
            return OrderResult.blocked(result.getAttribute("blockReason"));
        }

        // 处理异常
        Exception error = result.getAttribute("error");
        if (error != null) {
            // 如果是库存预占后失败，需要释放库存
            if (Boolean.TRUE.equals(result.getAttribute("inventoryReserved"))) {
                inventoryService.releaseReservation(request);
            }
            throw new OrderProcessingException("订单处理失败", error);
        }

        return OrderResult.success(result.getAttribute("order"));
    }
}
```

### 29.2.4 高级变体：分支与并行管道

```java
// 场景：不同的订单类型需要不同的处理流程

// 分支管道 —— 根据条件选择不同的 Filter 序列
public class BranchingPipeline {
    private final Map<String, Pipeline> pipelines = new HashMap<>();

    public BranchingPipeline addBranch(String branchName, Pipeline pipeline) {
        pipelines.put(branchName, pipeline);
        return this;
    }

    public PipelineContext execute(String branch, PipelineContext context) {
        Pipeline pipeline = pipelines.get(branch);
        if (pipeline == null) {
            throw new IllegalArgumentException("Unknown branch: " + branch);
        }
        return pipeline.execute(context);
    }
}

// 使用示例
BranchingPipeline orderRouter = new BranchingPipeline()
    .addBranch("PHYSICAL", new Pipeline()  // 实物商品管线
        .addFilter(new InventoryCheckFilter())
        .addFilter(new ShippingCalculationFilter())
        .addFilter(new OrderPersistenceFilter()))
    .addBranch("DIGITAL", new Pipeline()    // 虚拟商品管线
        .addFilter(new LicenseGenerationFilter())
        .addFilter(new OrderPersistenceFilter()))
    .addBranch("SUBSCRIPTION", new Pipeline()  // 订阅管线
        .addFilter(new BillingCycleFilter())
        .addFilter(new AutoRenewalFilter())
        .addFilter(new OrderPersistenceFilter()));

// 并行管道 —— 多个独立 Filter 同时执行
public class ParallelPipeline {
    private final ExecutorService executor;
    private final List<Filter> parallelFilters = new ArrayList<>();

    public ParallelPipeline(int threadCount) {
        this.executor = Executors.newFixedThreadPool(threadCount);
    }

    public ParallelPipeline addFilter(Filter filter) {
        this.parallelFilters.add(filter);
        return this;
    }

    public PipelineContext execute(PipelineContext context) {
        List<CompletableFuture<Void>> futures = parallelFilters.stream()
            .map(filter -> CompletableFuture.runAsync(() -> {
                filter.execute(context);
            }, executor))
            .toList();

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

        return context;
    }
}

// 使用示例：同时执行多个独立的检查
ParallelPipeline preCheckPipeline = new ParallelPipeline(3)
    .addFilter(new CreditCheckFilter())
    .addFilter(new AddressValidationFilter())
    .addFilter(new FraudDetectionFilter());
// 三个检查同时进行，全部完成后再继续
```

---

## 29.3 数据流处理

### 29.3.1 数据流的三种模式

```java
// 模式 1：线性流（Linear Flow）
// 数据按顺序依次通过每个 Filter —— 最常见的模式
// Data → F1 → F2 → F3 → Result
// 适用：步骤之间有依赖关系（F2 需要 F1 的输出）

// 模式 2：分流（Split Flow）
// 数据进入后分流到多个并行 Filter，结果汇聚
//
//          ┌→ F2a ─┐
// Data → F1 → F2b ─→ F3 → Result
//          └→ F2c ─┘
//
// 适用：某个步骤的多个子任务可以并行执行

public class FanOutFanInPipeline {
    private Filter splitter;
    private List<Filter> workers;
    private Filter aggregator;

    public PipelineContext execute(PipelineContext context) {
        // Split
        List<PipelineContext> subContexts = splitContext(context);

        // Fan out —— 并行执行
        List<CompletableFuture<PipelineContext>> futures = subContexts.stream()
            .map(sub -> CompletableFuture.supplyAsync(() -> {
                Pipeline subPipeline = new Pipeline();
                workers.forEach(subPipeline::addFilter);
                return subPipeline.execute(sub);
            }))
            .toList();

        // Fan in —— 等待全部完成并汇聚
        List<PipelineContext> results = futures.stream()
            .map(CompletableFuture::join)
            .toList();

        // Aggregate
        PipelineContext merged = mergeResults(results);
        return aggregator != null
            ? new Pipeline().addFilter(aggregator).execute(merged)
            : merged;
    }
}

// 模式 3：递归流（Recursive Flow）
// Filter 可以将数据反馈给前面的 Filter，形成循环处理
// 适用：需要反复精炼的数据处理（例如：迭代优化算法）
public class RecursivePipeline {
    private final List<Filter> filters;
    private final int maxIterations;

    public PipelineContext execute(PipelineContext context) {
        Pipeline pipeline = new Pipeline();
        filters.forEach(pipeline::addFilter);

        int iteration = 0;
        while (iteration < maxIterations) {
            context = pipeline.execute(context);

            // 检查是否还需要继续迭代
            Boolean needsMoreWork = context.getAttribute("needsIteration");
            if (!Boolean.TRUE.equals(needsMoreWork)) {
                break;
            }
            context.setAttribute("needsIteration", false);  // 重置
            iteration++;
        }

        return context;
    }
}
```

### 29.3.2 大数据量流式处理

```java
// 当数据量很大时，不能把所有数据加载到内存中
// 需要使用流式处理 —— 利用 InputStream/OutputStream 管道

// 流式 Filter 接口
public interface StreamFilter {
    OutputStream process(InputStream input) throws IOException;
}

// 流式 Pipeline
public class StreamPipeline {
    private final List<StreamFilter> filters = new ArrayList<>();

    public StreamPipeline addFilter(StreamFilter filter) {
        filters.add(filter);
        return this;
    }

    public void execute(InputStream source, OutputStream target) throws IOException {
        InputStream current = source;

        for (int i = 0; i < filters.size(); i++) {
            // 每个 Filter 的输出成为下一个的输入
            // 使用 PipedInputStream/PipedOutputStream 连接
            if (i == filters.size() - 1) {
                // 最后一个 Filter 直接写入 target
                OutputStream out = filters.get(i).process(current);
                out.close();  // 这里可以优化为直接写入 target
            } else {
                PipedOutputStream pos = new PipedOutputStream();
                PipedInputStream pis = new PipedInputStream(pos);

                CompletableFuture.runAsync(() -> {
                    try {
                        OutputStream result = filters.get(i).process(current);
                        // 将结果写入管道
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                });

                current = pis;  // 下一个 Filter 的输入
            }
        }
    }
}

// Spring Batch 风格的块式处理 —— 更实用的方案
public class ChunkedPipeline<T> {
    private final List<Function<List<T>, List<T>>> filters = new ArrayList<>();
    private final int chunkSize;

    public ChunkedPipeline(int chunkSize) {
        this.chunkSize = chunkSize;
    }

    public ChunkedPipeline<T> addFilter(Function<List<T>, List<T>> filter) {
        filters.add(filter);
        return this;
    }

    public List<T> execute(Iterator<T> source) {
        List<T> allResults = new ArrayList<>();

        List<T> chunk = new ArrayList<>(chunkSize);
        while (source.hasNext()) {
            chunk.add(source.next());
            if (chunk.size() >= chunkSize) {
                allResults.addAll(processChunk(chunk));
                chunk.clear();
            }
        }
        // 处理最后一个不完整的 chunk
        if (!chunk.isEmpty()) {
            allResults.addAll(processChunk(chunk));
        }

        return allResults;
    }

    private List<T> processChunk(List<T> chunk) {
        List<T> current = chunk;
        for (Function<List<T>, List<T>> filter : filters) {
            current = filter.apply(current);
        }
        return current;
    }
}
```

### 29.3.3 管道模式的 Java 生态实现

```java
// 1. Java Stream API —— 最简单的管道模式实现
List<Order> processedOrders = orders.stream()
    .filter(order -> order.getAmount().compareTo(MIN_AMOUNT) > 0)  // Filter 1
    .map(order -> applyDiscount(order))                              // Filter 2
    .map(order -> enrichWithUserInfo(order))                         // Filter 3
    .sorted(Comparator.comparing(Order::getFinalAmount).reversed())  // Filter 4
    .limit(100)                                                      // Filter 5
    .toList();

// Stream API 天然支持管道的核心特性：
// - 每个操作是独立的变换
// - 惰性求值 —— 不处理完一个 Filter 的全部数据才进入下一个
// - 可组合 —— filter → map → sorted 任意组合

// 2. Reactor / WebFlux —— 响应式管道
Flux<Order> orderFlux = Flux.fromIterable(orders)
    .filter(order -> order.isValid())
    .flatMap(order -> inventoryService.checkAsync(order))    // 异步 Filter
    .flatMap(order -> pricingService.calculateAsync(order))  // 异步 Filter
    .flatMap(order -> orderRepository.saveAsync(order))      // 异步持久化
    .doOnNext(order -> notificationService.send(order));     // 副作用

// 3. Spring Cloud Data Flow —— 企业级数据管道
// 将每个 Filter 部署为独立的微服务，通过消息队列连接
// 适合大规模 ETL 和实时数据处理

// 4. Apache Camel —— DSL 风格的管道定义
// from("file:input")
//     .filter(body().isNotNull())
//     .unmarshal().csv()
//     .bean(DataTransformer.class)
//     .to("jms:queue:processed");
```

---

## 29.4 潜在风险与问题

### 29.4.1 错误处理复杂性

```java
// 风险：管道中某个 Filter 失败，需要决定如何处理

// 问题场景：
// F1 → F2（失败）→ F3 → F4
// F2 失败了，F1 的副作用（如库存预占）需要回滚
// 但管道模式没有内置的事务回滚机制

// 解决方案 1：Compensating Action（补偿操作）
public class TransactionalPipeline extends Pipeline {
    private final Deque<Runnable> compensations = new ArrayDeque<>();

    @Override
    public Pipeline addFilter(Filter filter) {
        // 增强 Filter：支持注册补偿操作
        return super.addFilter(new CompensatingFilter(filter, compensations));
    }

    @Override
    public PipelineContext execute(PipelineContext context) {
        try {
            return super.execute(context);
        } catch (Exception e) {
            // 回滚 —— 逆序执行补偿操作
            while (!compensations.isEmpty()) {
                Runnable compensation = compensations.pollLast();
                try {
                    compensation.run();
                    context.getExecutionLog().add("[ROLLBACK] compensation executed");
                } catch (Exception rollbackError) {
                    context.getExecutionLog().add(
                        "[ROLLBACK-FAIL] " + rollbackError.getMessage());
                }
            }
            throw e;
        }
    }
}

// 在 Filter 中注册补偿操作
public class InventoryCheckFilter implements Filter {
    @Override
    public void execute(PipelineContext context) {
        inventoryService.reserve(items);
        // 注册补偿：如果后续失败，释放库存
        context.setAttribute("compensation",
            (Runnable) () -> inventoryService.release(items));
    }
}

// 解决方案 2：错误输出通道 —— 不阻断管道，将错误路由到旁路
// 主通道：正常数据流
// 错误通道：异常数据 → DLQ（死信队列）/ 错误处理 Filter
```

### 29.4.2 调试与可观测性

```java
// 风险：数据在管道中逐层变换，出问题时很难定位是哪个 Filter 产生的错误

// 解决方案：在每个 Filter 前后注入观测点
public class ObservablePipeline extends Pipeline {
    private final MeterRegistry meterRegistry;
    private final Tracer tracer;

    @Override
    public PipelineContext execute(PipelineContext context) {
        for (Filter filter : filters) {
            Timer.Sample sample = Timer.start(meterRegistry);
            Span span = tracer.nextSpan().name(filter.getName()).start();

            try (var ws = span.makeCurrent()) {
                // 记录进入时的数据快照（开发/调试环境）
                context.setAttribute("before." + filter.getName(),
                    snapshotForDebug(context));

                filter.execute(context);

                sample.stop(meterRegistry.timer("pipeline.filter.duration",
                    "filter", filter.getName(), "status", "success"));

            } catch (Exception e) {
                span.setStatus(StatusCode.ERROR, e.getMessage());
                sample.stop(meterRegistry.timer("pipeline.filter.duration",
                    "filter", filter.getName(), "status", "error"));

                meterRegistry.counter("pipeline.filter.errors",
                    "filter", filter.getName()).increment();
                throw e;
            } finally {
                span.end();
            }
        }
        return context;
    }
}
```

### 29.4.3 风险总结

| 风险 | 说明 | 缓解策略 |
|------|------|---------|
| **上下文膨胀** | PipelineContext 变成一个共享的"大杂烩"，所有 Filter 往里面塞数据 | 定义强类型的阶段输入/输出接口，用编译时检查代替运行时查找 |
| **顺序耦合** | 隐式假设某些 Filter 在另一些之前执行 | 显式声明 Filter 的输入要求（需要哪些 key 存在），Pipeline 组装时做依赖检查 |
| **性能瓶颈** | 最慢的 Filter 拖慢整个管道 | 并行化独立的 Filter，异步化 I/O 密集型 Filter |
| **测试组合爆炸** | N 个 Filter 有 N! 种可能的排列，不可能全测试 | 只测试每个 Filter 独立行为 + 端到端的常见路径 |
| **过度设计** | 3 个步骤的处理也用管道模式 | "三步法则"：少于 3 个步骤 → 直接写方法调用链；3-5 个 → 考虑管道；> 5 个 → 强烈建议管道 |
| **数据丢失** | 流式管道中某个环节崩溃，内存中的数据丢失 | 使用持久化队列（Kafka）作为管道连接器，数据先持久化再处理 |

### 29.4.4 反模式：管道变成分布式单体

```java
// 反模式：把管道中的每个 Filter 部署为独立的微服务
// 结果：本来是简单的函数调用链，变成了跨网络的分布式系统

// 错误做法：
// F1(HTTP) → F2(HTTP) → F3(HTTP) → F4(HTTP)
//   每个 Filter 都是独立部署的服务，通过 REST 调用连接
//   问题：
//     - 每个步骤增加 5-10ms 的 HTTP 延迟
//     - 每个服务需要独立部署、监控、运维
//     - 4 个 Filter = 4 个微服务 = 复杂度暴增

// 正确做法：区分"处理管道"和"服务管道"
// 处理管道（进程内）：
//   同一 JVM 内的 Filter 链 —— 直接方法调用，零网络开销
// 服务管道（跨进程）：
//   整个处理流程作为一个服务，通过消息队列连接上下游
//   [上游服务] → Kafka Topic → [处理服务(Pipeline)] → Kafka Topic → [下游服务]

// 判断标准：
// - Filter 是否需要独立扩展？是 → 可以拆成独立服务
// - Filter 的数据量和延迟要求？高吞吐/低延迟 → 进程内管道
```

---

## 29.5 本章小结

管道与过滤器模式是处理"需要多个步骤对数据进行变换"这一通用问题的最优雅解决方案。它的力量来自两个简单约束：

1. **每个 Filter 只做一件事**——这让 Filter 可以独立开发、测试、复用
2. **Filter 之间只通过数据管道通信**——这让 Filter 的顺序可以任意编排

管道模式在 Java 生态中最自然的体现是 `Stream API` 和 `Servlet Filter Chain`。对于更复杂的场景，Spring Batch 的 chunk-based processing 和 Spring Cloud Data Flow 提供了生产级的管道框架。

核心权衡：管道模式的灵活性和可组合性，换取了**调试复杂度的增加**和**上下文管理的混乱风险**。当管道中的 Filter 数量超过 7-8 个时，需要考虑拆分管道或将部分 Filter 合并。
