# 第15章 责任链模式（Chain of Responsibility）

**责任链模式**是一种行为型设计模式，它将请求的发送者和接收者解耦，使多个对象都有机会处理请求。将这些对象连成一条链，并沿着这条链传递请求，直到有一个对象处理它为止。

## 15.1 解决的问题与应用场景

### 15.1.1 问题分析

在日常业务开发中，一个请求往往需要经过多个处理步骤。例如用户提交一个订单，需要依次经过：身份验证、权限校验、参数校验、业务逻辑处理、日志记录。如果使用传统的 `if-else` 结构处理：

```java
public class OrderProcessor {
    public Result process(Request request) {
        // 1. 身份验证
        if (!authenticate(request)) {
            return Result.fail("认证失败");
        }
        // 2. 权限校验
        if (!authorize(request)) {
            return Result.fail("无权限");
        }
        // 3. 参数校验
        if (!validate(request)) {
            return Result.fail("参数错误");
        }
        // 4. 业务处理
        return doBusiness(request);
    }
}
```

这种方式的问题显而易见：

- **代码耦合严重**：所有处理逻辑集中在一个方法中，单一职责原则被破坏
- **扩展性差**：新增或删除一个处理步骤，需要修改核心方法，违反开闭原则
- **顺序调整困难**：处理步骤的顺序在代码中硬编码，无法灵活调整
- **无法动态组合**：不同的场景可能需要不同的处理链，传统方式需要为每种组合写一个方法
- **复用性差**：处理逻辑与调用方紧耦合，无法在不同场景中复用

责任链模式通过将每个处理步骤抽象为独立对象，并将它们串联成链，完美解决了上述问题。

### 15.1.2 典型应用场景

**1. Web请求过滤器链**

```java
// Servlet规范中的过滤器链正是责任链模式的典型应用
// 请求依次经过 AuthFilter -> LogFilter -> EncodingFilter -> Controller
FilterChain chain = new FilterChain();
chain.addFilter(new AuthFilter());
chain.addFilter(new LogFilter());
chain.addFilter(new EncodingFilter());
chain.doFilter(request, response);
```

**2. 审批流程**

```java
// 费用的多级审批：部门经理(<=1000) -> 总监(<=10000) -> 财务总监(<=100000) -> CEO(无上限)
ApproverChain chain = new ApproverChain();
chain.addApprover(new Manager())
     .addApprover(new Director())
     .addApprover(new CFO())
     .addApprover(new CEO());
chain.approve(new ApprovalRequest(5000));
```

**3. 事件处理冒泡**

```java
// GUI事件沿组件树向上冒泡，每个组件都有机会处理
// Button -> Panel -> Window -> Application
button.addActionListener(event -> {
    if (!handleLocally(event)) {
        event.consume(); // 停止冒泡
    }
});
```

**4. 日志处理链**

```java
// Log4j/Logback中的日志Appender链
// 一条日志同时输出到 ConsoleAppender -> FileAppender -> RemoteAppender
Logger logger = Logger.getLogger("com.example");
logger.addAppender(new ConsoleAppender());
logger.addAppender(new FileAppender("app.log"));
logger.addAppender(new RemoteAppender("log-server:9090"));
```

**5. 敏感词过滤链**

```java
// 内容发布前的多重过滤
// HTML标签过滤 -> 敏感词过滤 -> 违禁内容过滤 -> 格式规范化
ContentFilterChain chain = new ContentFilterChain();
chain.addFilter(new HtmlEscapeFilter())
     .addFilter(new SensitiveWordFilter(sensitiveWords))
     .addFilter(new ForbiddenContentFilter())
     .addFilter(new FormatNormalizer());
String safeContent = chain.filter(rawContent);
```

## 15.2 实现原理与UML

### 15.2.1 核心思想

责任链模式的核心思想可以用一句话概括：**将请求的处理者组成一条链，请求沿着链传递，每个处理者决定自己处理还是传递给下一个处理者**。

这里有两个关键设计决策：

1. **链的组织方式**：可以是链表（每个处理者持有下一个的引用），也可以是列表（使用集合统一管理）
2. **传递方式**：可以是"处理直到有人处理为止"（short-circuit），也可以是"所有人都处理一遍"（full-chain）

### 15.2.2 UML类图

```
┌─────────────────────┐        ┌─────────────────────┐
│      Client         │        │      Handler        │
│                     │        │    (抽象处理者)      │
├─────────────────────┤        ├─────────────────────┤
│                     │───────►│ - successor          │
│                     │        │ + setSuccessor()     │
│                     │        │ + handleRequest()    │
│                     │        │ + canHandle()        │
│                     │        │ + doHandle()         │
└─────────────────────┘        └──────────┬──────────┘
                                          │
                              ┌───────────┼───────────┐
                              │           │           │
                              ▼           ▼           ▼
                     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                     │ConcreteHandlerA│ │ConcreteHandlerB│ │ConcreteHandlerC│
                     │  (具体处理者A)  │ │  (具体处理者B)  │ │  (具体处理者C)  │
                     ├──────────────┤ ├──────────────┤ ├──────────────┤
                     │ + canHandle() │ │ + canHandle() │ │ + canHandle() │
                     │ + doHandle()  │ │ + doHandle()  │ │ + doHandle()  │
                     └──────────────┘ └──────────────┘ └──────────────┘
                              │               │               │
                              │    链: A -> B -> C            │
                              └───────────────┴───────────────┘
```

### 15.2.3 角色分析

| 角色 | 类型 | 职责 | 关键行为 |
|------|------|------|----------|
| **Handler** | 抽象类/接口 | 定义处理请求的接口，维护后继者引用 | `setSuccessor()`, `handleRequest()` |
| **ConcreteHandler** | 具体类 | 实现具体的处理逻辑，判断是否能处理 | `canHandle()`, `doHandle()` |
| **Client** | 调用方 | 创建处理链，向链首发起请求 | 组装链，调用链首的 `handleRequest()` |
| **Request** | 数据对象 | 封装请求的信息 | 携带处理所需的数据 |

### 15.2.4 时序图

```
Client           HandlerA         HandlerB         HandlerC
   │                  │                │                │
   │  handleRequest() │                │                │
   │ ────────────────►│                │                │
   │                  │                │                │
   │                  │ canHandle()?   │                │
   │                  │ 返回: false    │                │
   │                  │                │                │
   │                  │ handleRequest()│                │
   │                  │ ──────────────►│                │
   │                  │                │                │
   │                  │                │ canHandle()?   │
   │                  │                │ 返回: true     │
   │                  │                │                │
   │                  │                │ doHandle()     │
   │                  │                │ ───处理请求────│
   │                  │                │                │
   │                  │    result      │                │
   │ ◄────────────────│◄───────────────│                │
   │                  │                │                │
```

## 15.3 代码实现

### 15.3.1 链表式责任链（"有人处理即停止"模式）

这是经典的责任链实现，每个处理者持有下一个处理者的引用。

**抽象处理者**

```java
/**
 * 抽象处理者 - 使用模板方法模式
 * canHandle 和 doHandle 交给子类实现，handleRequest 是模板方法
 */
public abstract class Handler {
    protected Handler successor;

    public void setSuccessor(Handler successor) {
        this.successor = successor;
    }

    /**
     * 模板方法：处理请求
     * 先判断自己能处理吗，能就处理，不能就传递给后继者
     */
    public final void handleRequest(Request request) {
        if (canHandle(request)) {
            doHandle(request);
        } else if (successor != null) {
            successor.handleRequest(request);
        } else {
            onUnhandled(request);
        }
    }

    /** 子类实现：判断是否能处理 */
    protected abstract boolean canHandle(Request request);

    /** 子类实现：具体的处理逻辑 */
    protected abstract void doHandle(Request request);

    /** 没有人能处理时的回调 */
    protected void onUnhandled(Request request) {
        System.out.println("警告：请求未被任何处理器处理: " + request);
    }
}
```

**具体处理者 - 审批流程**

```java
/**
 * 审批请求
 */
public class ApprovalRequest {
    private final String applicant;   // 申请人
    private final double amount;      // 金额
    private final String purpose;     // 用途
    private final LocalDateTime time; // 时间

    public ApprovalRequest(String applicant, double amount, String purpose) {
        this.applicant = applicant;
        this.amount = amount;
        this.purpose = purpose;
        this.time = LocalDateTime.now();
    }

    public String getApplicant() { return applicant; }
    public double getAmount() { return amount; }
    public String getPurpose() { return purpose; }
    public LocalDateTime getTime() { return time; }

    @Override
    public String toString() {
        return String.format("审批请求[%s, ¥%.2f, %s]", applicant, amount, purpose);
    }
}

/**
 * 审批者基类
 */
public abstract class Approver extends Handler {}

/**
 * 部门经理：审批 5000 元以下
 */
public class Manager extends Approver {
    private static final double MAX_AMOUNT = 5000;

    @Override
    protected boolean canHandle(Request request) {
        if (request instanceof ApprovalRequest) {
            return ((ApprovalRequest) request).getAmount() <= MAX_AMOUNT;
        }
        return false;
    }

    @Override
    protected void doHandle(Request request) {
        ApprovalRequest req = (ApprovalRequest) request;
        System.out.printf("[部门经理] 审批通过: %s 的 %s 申请(¥%.2f)%n",
                req.getApplicant(), req.getPurpose(), req.getAmount());
    }
}

/**
 * 总监：审批 50000 元以下
 */
public class Director extends Approver {
    private static final double MAX_AMOUNT = 50000;

    @Override
    protected boolean canHandle(Request request) {
        if (request instanceof ApprovalRequest) {
            return ((ApprovalRequest) request).getAmount() <= MAX_AMOUNT;
        }
        return false;
    }

    @Override
    protected void doHandle(Request request) {
        ApprovalRequest req = (ApprovalRequest) request;
        System.out.printf("[总监] 审批通过: %s 的 %s 申请(¥%.2f)%n",
                req.getApplicant(), req.getPurpose(), req.getAmount());
    }
}

/**
 * CFO：审批 200000 元以下
 */
public class CFO extends Approver {
    private static final double MAX_AMOUNT = 200000;

    @Override
    protected boolean canHandle(Request request) {
        if (request instanceof ApprovalRequest) {
            return ((ApprovalRequest) request).getAmount() <= MAX_AMOUNT;
        }
        return false;
    }

    @Override
    protected void doHandle(Request request) {
        ApprovalRequest req = (ApprovalRequest) request;
        System.out.printf("[CFO] 审批通过: %s 的 %s 申请(¥%.2f)%n",
                req.getApplicant(), req.getPurpose(), req.getAmount());
    }
}

/**
 * CEO：审批所有金额（作为链尾的兜底处理者）
 */
public class CEO extends Approver {
    @Override
    protected boolean canHandle(Request request) {
        return request instanceof ApprovalRequest;  // CEO审批一切
    }

    @Override
    protected void doHandle(Request request) {
        ApprovalRequest req = (ApprovalRequest) request;
        System.out.printf("[CEO] 审批通过: %s 的 %s 申请(¥%.2f)%n",
                req.getApplicant(), req.getPurpose(), req.getAmount());
    }
}
```

**测试代码**

```java
public class ApprovalTest {
    public static void main(String[] args) {
        // 构建责任链：Manager -> Director -> CFO -> CEO
        Approver manager = new Manager();
        Approver director = new Director();
        Approver cfo = new CFO();
        Approver ceo = new CEO();

        manager.setSuccessor(director);
        director.setSuccessor(cfo);
        cfo.setSuccessor(ceo);

        // 测试不同金额的审批
        ApprovalRequest[] requests = {
            new ApprovalRequest("张三", 3000, "办公用品采购"),
            new ApprovalRequest("李四", 30000, "设备采购"),
            new ApprovalRequest("王五", 150000, "市场推广预算"),
            new ApprovalRequest("赵六", 500000, "新项目投资"),
        };

        for (ApprovalRequest req : requests) {
            System.out.println("===== 处理: " + req + " =====");
            manager.handleRequest(req);
            System.out.println();
        }
    }
}
```

### 15.3.2 数组式责任链（"所有人依次处理"模式）

有时候我们需要请求依次经过所有处理器，而不是在某一个处理器处停止。这种模式在过滤器链中非常常见。

```java
/**
 * 过滤器接口 - 每个过滤器决定是否将请求传给下一个
 */
public interface Filter {
    /**
     * @param request  请求对象
     * @param response 响应对象
     * @param chain    过滤器链，调用 chain.doFilter 将请求传给下一个过滤器
     */
    void doFilter(Request request, Response response, FilterChain chain);
}

/**
 * 请求/响应的简单封装
 */
public class Request {
    private final Map<String, Object> headers = new HashMap<>();
    private final StringBuilder body = new StringBuilder();

    public void setHeader(String key, Object value) {
        headers.put(key, value);
    }

    public Object getHeader(String key) {
        return headers.get(key);
    }

    public void appendBody(String content) {
        body.append(content);
    }

    @Override
    public String toString() {
        return String.format("Request{headers=%s, body=%s}", headers, body);
    }
}

public class Response {
    private final StringBuilder content = new StringBuilder();

    public void write(String s) {
        content.append(s);
    }

    @Override
    public String toString() {
        return "Response{" + content + "}";
    }
}

/**
 * 过滤器链 - 使用索引遍历，避免递归过深导致的栈溢出
 */
public class FilterChain {
    private final List<Filter> filters = new ArrayList<>();
    private int position = 0;

    public FilterChain addFilter(Filter filter) {
        this.filters.add(filter);
        return this;
    }

    public void doFilter(Request request, Response response) {
        if (position < filters.size()) {
            Filter filter = filters.get(position);
            position++;  // 先移动到下一个，再调用
            filter.doFilter(request, response, this);
        }
        // position >= filters.size() 时，表示所有过滤器都已执行完毕，链结束
    }

    public void reset() {
        this.position = 0;
    }

    public int size() {
        return filters.size();
    }
}
```

**具体过滤器实现**

```java
/**
 * 认证过滤器 - 验证用户是否登录
 * 如果未认证，短路不传递请求
 */
public class AuthenticationFilter implements Filter {
    @Override
    public void doFilter(Request request, Response response, FilterChain chain) {
        System.out.println("[认证过滤器] 开始认证检查...");

        String token = (String) request.getHeader("Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            System.out.println("[认证过滤器] 认证通过，传递请求");
            // 认证通过，将用户信息放入请求
            request.setHeader("user", extractUser(token));
            chain.doFilter(request, response);  // 传递给下一个过滤器
        } else {
            System.out.println("[认证过滤器] 认证失败，拒绝请求");
            response.write("{\"error\": \"未授权访问\"}");
            // 不调用 chain.doFilter，请求到此终止
        }
    }

    private String extractUser(String token) {
        // 模拟解析token获取用户信息
        return token.substring(7) + "_user";
    }
}

/**
 * 参数验证过滤器
 */
public class ValidationFilter implements Filter {
    @Override
    public void doFilter(Request request, Response response, FilterChain chain) {
        System.out.println("[验证过滤器] 开始参数验证...");

        // 验证必要参数
        if (request.getHeader("Content-Type") == null) {
            System.out.println("[验证过滤器] 缺少Content-Type，拒绝请求");
            response.write("{\"error\": \"缺少Content-Type头\"}");
            return;  // 不传递，短路
        }

        System.out.println("[验证过滤器] 参数验证通过，传递请求");
        chain.doFilter(request, response);  // 传递给下一个过滤器
    }
}

/**
 * 日志过滤器 - 记录请求处理前后
 */
public class LoggingFilter implements Filter {
    @Override
    public void doFilter(Request request, Response response, FilterChain chain) {
        long start = System.currentTimeMillis();
        System.out.printf("[日志过滤器] 开始处理请求: %s%n", request);

        chain.doFilter(request, response);  // 传递给下一个

        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("[日志过滤器] 请求处理完成, 耗时: %dms, 响应: %s%n", elapsed, response);
    }
}

/**
 * 业务处理过滤器 - 链的最后一个处理器（实际业务逻辑）
 */
public class BusinessLogicFilter implements Filter {
    @Override
    public void doFilter(Request request, Response response, FilterChain chain) {
        System.out.println("[业务处理器] 执行业务逻辑...");

        String user = (String) request.getHeader("user");
        response.write("{\"message\": \"Hello, " + user + "\"}");

        // 业务过滤器通常是链尾，不需要调用 chain.doFilter
        // 但如果链后面还有处理器（如后置日志、统计），也可以继续传递
        System.out.println("[业务处理器] 业务逻辑执行完毕");
    }
}
```

**测试代码**

```java
public class FilterChainTest {
    public static void main(String[] args) {
        // 构建过滤器链
        FilterChain chain = new FilterChain();
        chain.addFilter(new AuthenticationFilter())
             .addFilter(new ValidationFilter())
             .addFilter(new LoggingFilter())
             .addFilter(new BusinessLogicFilter());

        // 测试1：正常请求（带认证token）
        System.out.println("==================== 测试1：正常请求 ====================");
        Request req1 = new Request();
        req1.setHeader("Authorization", "Bearer token123");
        req1.setHeader("Content-Type", "application/json");
        req1.appendBody("hello");
        Response resp1 = new Response();
        chain.reset();
        chain.doFilter(req1, resp1);
        System.out.println("最终响应: " + resp1);

        System.out.println();

        // 测试2：无认证token的请求
        System.out.println("==================== 测试2：未认证请求 ====================");
        Request req2 = new Request();
        req2.setHeader("Content-Type", "application/json");
        Response resp2 = new Response();
        chain.reset();
        chain.doFilter(req2, resp2);
        System.out.println("最终响应: " + resp2);
    }
}
```

运行结果：

```
==================== 测试1：正常请求 ====================
[认证过滤器] 开始认证检查...
[认证过滤器] 认证通过，传递请求
[验证过滤器] 开始参数验证...
[验证过滤器] 参数验证通过，传递请求
[日志过滤器] 开始处理请求: Request{headers={Authorization=Bearer token123, Content-Type=application/json}, body=hello}
[业务处理器] 执行业务逻辑...
[业务处理器] 业务逻辑执行完毕
[日志过滤器] 请求处理完成, 耗时: 0ms, 响应: Response{{"message": "Hello, token123_user"}}
最终响应: Response{{"message": "Hello, token123_user"}}

==================== 测试2：未认证请求 ====================
[认证过滤器] 开始认证检查...
[认证过滤器] 认证失败，拒绝请求
最终响应: Response{{"error": "未授权访问"}}
```

### 15.3.3 可变链设计（动态增删处理者）

```java
/**
 * 可动态调整的责任链
 * 支持在运行时增加、删除、调整处理器顺序
 */
public class DynamicHandlerChain {
    private final LinkedList<Handler> handlers = new LinkedList<>();

    /** 添加到链尾 */
    public DynamicHandlerChain addLast(Handler handler) {
        handlers.addLast(handler);
        rebuildLinks();
        return this;
    }

    /** 添加到链首 */
    public DynamicHandlerChain addFirst(Handler handler) {
        handlers.addFirst(handler);
        rebuildLinks();
        return this;
    }

    /** 在指定处理器之后插入 */
    public DynamicHandlerChain addAfter(Class<? extends Handler> afterClass, Handler handler) {
        int idx = findIndexOf(afterClass);
        if (idx >= 0) {
            handlers.add(idx + 1, handler);
        } else {
            handlers.addLast(handler);
        }
        rebuildLinks();
        return this;
    }

    /** 移除指定类型的处理器 */
    public DynamicHandlerChain remove(Class<? extends Handler> handlerClass) {
        handlers.removeIf(h -> h.getClass() == handlerClass);
        rebuildLinks();
        return this;
    }

    /** 获取链首 */
    public Handler getHead() {
        return handlers.isEmpty() ? null : handlers.getFirst();
    }

    /**
     * 重建链接关系
     */
    private void rebuildLinks() {
        for (int i = 0; i < handlers.size(); i++) {
            Handler current = handlers.get(i);
            Handler next = (i + 1 < handlers.size()) ? handlers.get(i + 1) : null;
            current.setSuccessor(next);
        }
    }

    private int findIndexOf(Class<? extends Handler> clazz) {
        for (int i = 0; i < handlers.size(); i++) {
            if (handlers.get(i).getClass() == clazz) {
                return i;
            }
        }
        return -1;
    }
}
```

### 15.3.4 Java 8 函数式责任链

```java
/**
 * 函数式责任链 - 使用 Consumer 和 Function 组合
 * 代码更简洁，但损失了传统模式的灵活撤销特性
 */
public class FunctionalChain<T> {
    private final List<Function<T, ChainResult>> handlers = new ArrayList<>();

    @FunctionalInterface
    public interface Handler<T> {
        /**
         * 返回 true 表示已处理（停止传递），false 表示继续传递
         */
        boolean handle(T request);
    }

    /** 添加"处理然后停止"类型的处理器 */
    public FunctionalChain<T> addShortCircuit(Handler<T> handler) {
        handlers.add(req -> {
            boolean handled = handler.handle(req);
            return new ChainResult(handled, null);
        });
        return this;
    }

    /** 添加"处理但不一定停止"类型的处理器 */
    public FunctionalChain<T> addConditional(
            Predicate<T> predicate, Consumer<T> processor) {
        handlers.add(req -> {
            if (predicate.test(req)) {
                processor.accept(req);
                return new ChainResult(true, req);
            }
            return new ChainResult(false, req);
        });
        return this;
    }

    /** 执行责任链 */
    public T execute(T request) {
        for (Function<T, ChainResult> handler : handlers) {
            ChainResult result = handler.apply(request);
            request = result.getProcessed();
            if (result.isHandled()) {
                break;  // 已处理，停止
            }
        }
        return request;
    }

    private static class ChainResult {
        private final boolean handled;
        private final Object processed;

        ChainResult(boolean handled, Object processed) {
            this.handled = handled;
            this.processed = processed;
        }

        @SuppressWarnings("unchecked")
        <T> T getProcessed() { return (T) processed; }
        boolean isHandled() { return handled; }
    }

    // ---- 使用示例 ----
    public static void main(String[] args) {
        FunctionalChain<String> chain = new FunctionalChain<String>()
            .addConditional(
                s -> s.startsWith("AUTH:"),
                s -> System.out.println("处理认证: " + s)
            )
            .addConditional(
                s -> s.startsWith("LOG:"),
                s -> System.out.println("处理日志: " + s)
            )
            .addShortCircuit(s -> {
                // 兜底处理器
                System.out.println("兜底处理: " + s);
                return true;
            });

        chain.execute("AUTH:token123");  // 被第一个处理器拦截
        chain.execute("LOG:access");     // 被第二个处理器拦截
        chain.execute("UNKNOWN");        // 被兜底处理器处理
    }
}
```

## 15.4 JDK/框架源码解析

### 15.4.1 javax.servlet.FilterChain

Servlet规范中的过滤器链是责任链模式最经典的实现。

```java
/**
 * Servlet规范中的 Filter 接口
 * 每个Filter都实现了责任链中的一个处理器角色
 */
public interface Filter {
    default void init(FilterConfig filterConfig) throws ServletException {}
    void doFilter(ServletRequest request, ServletResponse response,
                  FilterChain chain) throws IOException, ServletException;
    default void destroy() {}
}

/**
 * FilterChain接口 - 链的抽象
 */
public interface FilterChain {
    void doFilter(ServletRequest request, ServletResponse response)
            throws IOException, ServletException;
}

/**
 * org.apache.catalina.core.ApplicationFilterChain（Tomcat实现）
 * 这是Tomcat中过滤器链的核心实现
 */
// 简化版源码分析
public final class ApplicationFilterChain implements FilterChain {
    private Filter[] filters = new Filter[0];  // 过滤器数组
    private int pos = 0;                        // 当前执行位置
    private int n = 0;                          // 过滤器总数

    @Override
    public void doFilter(ServletRequest request, ServletResponse response) {
        if (pos < n) {
            // 取出当前过滤器并从索引后移
            Filter filter = filters[pos++];
            // 调用过滤器的 doFilter，传入 this（链自身）
            filter.doFilter(request, response, this);
        } else {
            // 所有过滤器执行完毕，调用最终的Servlet
            servlet.service(request, response);
        }
    }
}
```

关键设计要点：
- 使用 **索引 + 数组** 的方式组织链，避免递归中的空指针
- 过滤器调用 `chain.doFilter()` 继续传递，不调用则中断
- 链尾最终执行 Servlet 的业务逻辑

### 15.4.2 Spring Security 的 SecurityFilterChain

```java
/**
 * Spring Security 中的过滤器链
 * 每个 Security 过滤器链包含一系列安全过滤器
 */
public interface SecurityFilterChain {
    boolean matches(HttpServletRequest request);
    List<Filter> getFilters();
}

/**
 * Spring Security 核心过滤器链中的典型过滤器：
 *
 * 1. SecurityContextPersistenceFilter  - 从Session恢复SecurityContext
 * 2. UsernamePasswordAuthenticationFilter - 处理表单登录
 * 3. BasicAuthenticationFilter         - 处理HTTP Basic认证
 * 4. ExceptionTranslationFilter        - 转换安全异常为HTTP响应
 * 5. FilterSecurityInterceptor         - 授权的核心，决定是否允许访问
 *
 * 这些过滤器在 FilterChainProxy 中有序执行，形成一条完整的安全处理链
 */
public class FilterChainProxy implements Filter {
    private List<SecurityFilterChain> filterChains;

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {
        // 获取匹配当前请求的过滤器链
        List<Filter> filters = getFilters((HttpServletRequest) request);
        // 创建虚拟过滤器链并执行
        VirtualFilterChain vfc = new VirtualFilterChain(chain, filters);
        vfc.doFilter(request, response);
    }

    /** 内部类：虚拟过滤器链 */
    private static class VirtualFilterChain implements FilterChain {
        private final FilterChain originalChain;
        private final List<Filter> filters;
        private int currentPosition = 0;

        @Override
        public void doFilter(ServletRequest request, ServletResponse response) {
            if (currentPosition == filters.size()) {
                originalChain.doFilter(request, response);  // 链结束，回到原始链
            } else {
                currentPosition++;
                Filter nextFilter = filters.get(currentPosition - 1);
                nextFilter.doFilter(request, response, this);
            }
        }
    }
}
```

Spring Security使用了 **双层责任链** 结构：
- 外层：Servlet容器级别的过滤器链
- 内层：Spring Security内部的 VirtualFilterChain

### 15.4.3 Spring Interceptor 拦截器链

```java
/**
 * Spring MVC 中的 HandlerInterceptor 接口
 * 每个拦截器在请求处理的不同阶段执行
 */
public interface HandlerInterceptor {
    /** 前置处理：在Controller方法执行之前调用，返回false中断请求 */
    default boolean preHandle(HttpServletRequest request,
                              HttpServletResponse response,
                              Object handler) throws Exception {
        return true;
    }

    /** 后置处理：在Controller方法执行之后、视图渲染之前调用 */
    default void postHandle(HttpServletRequest request,
                            HttpServletResponse response,
                            Object handler,
                            ModelAndView modelAndView) throws Exception {}

    /** 完成处理：在整个请求处理完成后调用（适合清理资源） */
    default void afterCompletion(HttpServletRequest request,
                                 HttpServletResponse response,
                                 Object handler,
                                 Exception ex) throws Exception {}
}

/**
 * HandlerExecutionChain - Spring MVC 中的执行链
 * 同时包含了 Handler（Controller）和拦截器列表
 */
public class HandlerExecutionChain {
    private final Object handler;                    // 最终的处理器（Controller）
    private final List<HandlerInterceptor> interceptors = new ArrayList<>();

    /** 执行所有拦截器的 preHandle，任何一个返回false就停止 */
    boolean applyPreHandle(HttpServletRequest request,
                           HttpServletResponse response) throws Exception {
        for (HandlerInterceptor interceptor : interceptors) {
            if (!interceptor.preHandle(request, response, handler)) {
                triggerAfterCompletion(request, response, null);
                return false;
            }
        }
        return true;
    }

    /** 反向执行所有拦截器的 postHandle */
    void applyPostHandle(HttpServletRequest request,
                         HttpServletResponse response,
                         ModelAndView mv) throws Exception {
        // 注意：反向遍历，先注册的拦截器最后执行 postHandle
        for (int i = interceptors.size() - 1; i >= 0; i--) {
            interceptors.get(i).postHandle(request, response, handler, mv);
        }
    }

    /** 反向执行所有拦截器的 afterCompletion */
    void triggerAfterCompletion(HttpServletRequest request,
                                HttpServletResponse response,
                                Exception ex) {
        for (int i = interceptors.size() - 1; i >= 0; i--) {
            try {
                interceptors.get(i).afterCompletion(request, response, handler, ex);
            } catch (Throwable t) {
                logger.error("afterCompletion error", t);
            }
        }
    }
}
```

Spring拦截器链的特点：
- **分阶段执行**：preHandle 正序执行，postHandle 和 afterCompletion 逆序执行
- **短路机制**：preHandle 返回 false 时中断整条链
- **容错设计**：afterCompletion 中捕获所有异常，确保所有拦截器的清理工作都能执行

### 15.4.4 java.util.logging.Logger 过滤器链

```java
/**
 * Java标准日志框架中的 Filter 接口
 * 一个Logger可以有多个Filter，日志依次通过
 */
public interface Filter {
    /**
     * 判断日志记录是否应该被发布
     * @param record 日志记录
     * @return true 继续传递，false 丢弃这条日志
     */
    boolean isLoggable(LogRecord record);
}

/**
 * Logger 中的过滤逻辑（简化）
 */
public class Logger {
    private Filter filter;

    public void setFilter(Filter newFilter) throws SecurityException {
        filter = newFilter;
    }

    public void log(LogRecord record) {
        // 先经过Logger自身的filter
        if (filter != null && !filter.isLoggable(record)) {
            return;  // 被过滤，不继续
        }

        // 再经过Handler的filter
        for (Handler handler : getHandlers()) {
            handler.publish(record);
        }
    }
}

/**
 * 典型的过滤器链实现
 */
public class CompositeFilter implements Filter {
    private final List<Filter> filters = new ArrayList<>();

    public void addFilter(Filter filter) {
        filters.add(filter);
    }

    @Override
    public boolean isLoggable(LogRecord record) {
        for (Filter filter : filters) {
            if (!filter.isLoggable(record)) {
                return false;  // 任何一个不通过就拒绝
            }
        }
        return true;
    }
}
```

### 15.4.5 MyBatis 插件拦截链

```java
/**
 * MyBatis 插件拦截机制 - 基于动态代理的责任链
 * 所有插件包裹成一个链表，依次调用
 */
public class InterceptorChain {
    private final List<Interceptor> interceptors = new ArrayList<>();

    public Object pluginAll(Object target) {
        // 将目标对象依次用每个插件包裹
        for (Interceptor interceptor : interceptors) {
            target = interceptor.plugin(target);
        }
        return target;
    }

    public void addInterceptor(Interceptor interceptor) {
        interceptors.add(interceptor);
    }
}

/**
 * MyBatis 的插件接口
 * 每个插件拦截 Executor、StatementHandler等方法
 */
public interface Interceptor {
    Object intercept(Invocation invocation) throws Throwable;
    default Object plugin(Object target) {
        return Plugin.wrap(target, this);
    }
}
```

MyBatis插件链的精妙之处：它使用**动态代理嵌套**的方式，将一个目标对象层层包裹，最终形成一个代理嵌套链。外层代理先执行，最内层才是真正的目标对象。这与Servlet Filter那种显式链不同，利用了Java动态代理的特性。

## 15.5 使用场景与案例

### 15.5.1 订单审批工作流

```java
/**
 * 订单审批工作流
 * 不同级别的订单走不同的审批路径
 */
public class OrderApprovalWorkflow {

    // 创建审批链的工厂方法
    public static Approver createStandardChain() {
        Approver manager = new Manager();
        Approver director = new Director();
        Approver cfo = new CFO();
        Approver ceo = new CEO();

        manager.setSuccessor(director);
        director.setSuccessor(cfo);
        cfo.setSuccessor(ceo);
        return manager;  // 返回链首
    }

    // 特殊订单可以定制链
    public static Approver createExpressChain() {
        Approver director = new Director();
        Approver ceo = new CEO();
        director.setSuccessor(ceo);
        return director;  // 快速通道：总监 -> CEO
    }

    public static void main(String[] args) {
        Approver standardChain = createStandardChain();

        // 处理一批订单
        Order[] orders = {
            new Order("ORD-001", 3000, "standard"),
            new Order("ORD-002", 50000, "standard"),
            new Order("ORD-003", 15000, "express"),
        };

        for (Order order : orders) {
            Approver chain = order.isExpress()
                    ? createExpressChain()
                    : standardChain;
            chain.handleRequest(new ApprovalRequest(
                    order.getCreator(), order.getAmount(), order.getDescription()));
        }
    }
}
```

### 15.5.2 事件处理管道

```java
/**
 * 事件处理管道 - 模拟消息中间件的处理流程
 */
public class EventPipeline {
    private final List<EventHandler> handlers = new ArrayList<>();

    @FunctionalInterface
    public interface EventHandler {
        boolean handle(Event event);
    }

    public EventPipeline addHandler(EventHandler handler) {
        handlers.add(handler);
        return this;
    }

    /**
     * 将事件依次通过所有处理器
     * 任何一个处理器返回false（表示事件已消费），就停止传递
     */
    public void process(Event event) {
        for (EventHandler handler : handlers) {
            if (event.isConsumed()) {
                break;  // 事件已消费，停止
            }
            boolean shouldContinue = handler.handle(event);
            if (!shouldContinue) {
                event.consume();  // 标记为已消费
            }
        }
    }

    // 使用示例
    public static void main(String[] args) {
        EventPipeline pipeline = new EventPipeline()
                .addHandler(event -> {
                    if ("ORDER".equals(event.getType())) {
                        System.out.println("订单事件处理: " + event);
                        return false;  // 已处理，停止
                    }
                    return true;  // 未处理，继续
                })
                .addHandler(event -> {
                    if ("PAYMENT".equals(event.getType())) {
                        System.out.println("支付事件处理: " + event);
                        return false;
                    }
                    return true;
                })
                .addHandler(event -> {
                    System.out.println("默认处理: " + event);
                    return false;
                });

        pipeline.process(new Event("ORDER", "订单创建"));
        pipeline.process(new Event("PAYMENT", "支付成功"));
        pipeline.process(new Event("UNKNOWN", "未知事件"));
    }
}
```

### 15.5.3 敏感词过滤链

```java
/**
 * 敏感词过滤链 - 内容发布前的多层过滤
 */
public class ContentFilterChain {
    private final List<ContentFilter> filters = new ArrayList<>();

    @FunctionalInterface
    public interface ContentFilter {
        /**
         * 过滤内容
         * @param content 原始内容
         * @param chain   过滤器链（调用chain.filter继续传递）
         * @return 过滤后的内容
         */
        String filter(String content, ContentFilterChain chain);
    }

    private int position = 0;

    public ContentFilterChain addFilter(ContentFilter filter) {
        filters.add(filter);
        return this;
    }

    public String filter(String content) {
        position = 0;
        return doFilter(content);
    }

    private String doFilter(String content) {
        if (position >= filters.size()) {
            return content;
        }
        ContentFilter filter = filters.get(position++);
        return filter.filter(content, this);
    }

    // ---- 具体过滤器实现 ----

    /** HTML标签转义过滤器 */
    public static class HtmlEscapeFilter implements ContentFilter {
        @Override
        public String filter(String content, ContentFilterChain chain) {
            String escaped = content
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace("\"", "&quot;");
            return chain.doFilter(escaped);
        }
    }

    /** 敏感词替换过滤器 */
    public static class SensitiveWordFilter implements ContentFilter {
        private final Map<String, String> sensitiveMap;

        public SensitiveWordFilter(Map<String, String> sensitiveMap) {
            this.sensitiveMap = sensitiveMap;
        }

        @Override
        public String filter(String content, ContentFilterChain chain) {
            String filtered = content;
            for (Map.Entry<String, String> entry : sensitiveMap.entrySet()) {
                filtered = filtered.replace(entry.getKey(), entry.getValue());
            }
            return chain.doFilter(filtered);
        }
    }

    /** 长度截断过滤器 */
    public static class LengthLimitFilter implements ContentFilter {
        private final int maxLength;

        public LengthLimitFilter(int maxLength) {
            this.maxLength = maxLength;
        }

        @Override
        public String filter(String content, ContentFilterChain chain) {
            if (content.length() > maxLength) {
                content = content.substring(0, maxLength) + "...";
            }
            return chain.doFilter(content);
        }
    }

    // ---- 使用示例 ----
    public static void main(String[] args) {
        Map<String, String> sensitive = new HashMap<>();
        sensitive.put("违禁词A", "***");
        sensitive.put("违禁词B", "###");

        ContentFilterChain chain = new ContentFilterChain()
                .addFilter(new HtmlEscapeFilter())
                .addFilter(new SensitiveWordFilter(sensitive))
                .addFilter(new LengthLimitFilter(100));

        String safe = chain.filter("<script>alert('违禁词A')</script>");
        System.out.println("过滤后: " + safe);
        // 输出: 过滤后: &lt;script&gt;alert('***')&lt;/script&gt;
    }
}
```

### 15.5.4 日志框架Appender链

```java
/**
 * 模拟Logback的Appender链
 * 一条日志可以同时输出到多个目的地
 */
public class LoggerAppenderChain {
    private final List<Appender> appenders = new ArrayList<>();
    private final String loggerName;

    public LoggerAppenderChain(String loggerName) {
        this.loggerName = loggerName;
    }

    public LoggerAppenderChain addAppender(Appender appender) {
        appenders.add(appender);
        return this;
    }

    public void log(LogLevel level, String message) {
        LogEvent event = new LogEvent(loggerName, level, message, Instant.now());

        for (Appender appender : appenders) {
            if (appender.getLevel().compareTo(level) <= 0) {
                appender.append(event);
            }
        }
    }

    public enum LogLevel {
        DEBUG, INFO, WARN, ERROR;
    }

    public static class LogEvent {
        private final String loggerName;
        private final LogLevel level;
        private final String message;
        private final Instant timestamp;

        public LogEvent(String loggerName, LogLevel level, String message, Instant timestamp) {
            this.loggerName = loggerName;
            this.level = level;
            this.message = message;
            this.timestamp = timestamp;
        }

        @Override
        public String toString() {
            return String.format("[%s] %s %s - %s", timestamp, level, loggerName, message);
        }
    }

    public interface Appender {
        void append(LogEvent event);
        LogLevel getLevel();
    }

    public static class ConsoleAppender implements Appender {
        private final LogLevel level;

        public ConsoleAppender(LogLevel level) {
            this.level = level;
        }

        @Override
        public void append(LogEvent event) {
            System.out.println("[CONSOLE] " + event);
        }

        @Override
        public LogLevel getLevel() {
            return level;
        }
    }

    public static class FileAppender implements Appender {
        private final LogLevel level;
        private final String filePath;

        public FileAppender(LogLevel level, String filePath) {
            this.level = level;
            this.filePath = filePath;
        }

        @Override
        public void append(LogEvent event) {
            // 模拟写入文件
            System.out.println("[FILE:" + filePath + "] " + event);
        }

        @Override
        public LogLevel getLevel() {
            return level;
        }
    }

    // 使用示例
    public static void main(String[] args) {
        LoggerAppenderChain logger = new LoggerAppenderChain("com.example.Service")
                .addAppender(new ConsoleAppender(LogLevel.DEBUG))
                .addAppender(new FileAppender(LogLevel.INFO, "/logs/app.log"))
                .addAppender(new FileAppender(LogLevel.ERROR, "/logs/error.log"));

        logger.log(LogLevel.DEBUG, "这是一条调试信息");
        logger.log(LogLevel.INFO, "服务启动成功");
        logger.log(LogLevel.ERROR, "数据库连接失败");
    }
}
```

## 15.6 潜在风险与问题

### 15.6.1 请求未被处理

如果链中没有合适的处理器，请求到达链尾时没有任何处理器处理。这可能导致请求无声丢失。

```java
// 问题示例：链中没有能处理"REVIEW"类型的处理器
Handler a = new HandlerA();  // 只处理类型A
Handler b = new HandlerB();  // 只处理类型B
a.setSuccessor(b);
a.handleRequest(new Request("REVIEW", null));  // 无人处理！

// 解决方案1：链尾设置兜底处理器
public class FallbackHandler extends Handler {
    @Override
    protected boolean canHandle(Request request) {
        return true;  // 处理所有未被前面的处理器处理的请求
    }

    @Override
    protected void doHandle(Request request) {
        System.out.println("兜底处理: " + request.getType());
    }
}

// 解决方案2：在Handler中声明默认处理逻辑
public abstract class SafeHandler {
    protected void onUnhandled(Request request) {
        throw new UnsupportedOperationException("无法处理请求: " + request);
    }
}
```

### 15.6.2 链太长影响性能

当处理链中的处理器数量过多时，请求需要经过大量对象才能得到处理。

```java
// 性能问题示例
// 如果有50个过滤器，请求需要经过50次方法调用
long start = System.nanoTime();
chain.doFilter(request, response);
long elapsed = System.nanoTime() - start;
if (elapsed > TimeUnit.MILLISECONDS.toNanos(10)) {
    logger.warn("过滤器链执行时间过长: {} ns, 共{}个过滤器", elapsed, chain.size());
}

// 优化方案1：分组处理，减少链长度
public class GroupedFilterChain {
    // 将相关的过滤器分组，每组并行选择执行
    Optional<Filter> selectBestFilter(List<Filter> group, Request request) {
        return group.stream()
                .filter(f -> f.matches(request))
                .findFirst();
    }
}

// 优化方案2：使用HashMap快速定位处理器，而不是遍历链
public class HashedHandlerChain {
    private final Map<String, Handler> handlerMap = new HashMap<>();

    public void registerHandler(String requestType, Handler handler) {
        handlerMap.put(requestType, handler);
    }

    public void handleRequest(Request request) {
        Handler handler = handlerMap.get(request.getType());
        if (handler != null) {
            handler.doHandle(request);
        } else {
            handleUnmatched(request);  // 兜底
        }
    }
}
```

### 15.6.3 调试复杂性

问题在于难以直观地看到请求经过了哪些处理器、在哪个处理器被中断。

```java
// 解决方案：增强的可追踪责任链
public class TraceableFilterChain extends FilterChain {
    private final List<FilterExecutionRecord> trace = new ArrayList<>();

    @Override
    public void doFilter(Request request, Response response) {
        if (position < filters.size()) {
            Filter filter = filters.get(position);
            position++;
            long start = System.nanoTime();

            try {
                filter.doFilter(request, response, this);
                trace.add(new FilterExecutionRecord(
                        filter.getClass().getSimpleName(), "COMPLETED",
                        System.nanoTime() - start));
            } catch (Exception e) {
                trace.add(new FilterExecutionRecord(
                        filter.getClass().getSimpleName(), "ERROR: " + e.getMessage(),
                        System.nanoTime() - start));
                throw e;
            }
        }
    }

    public List<FilterExecutionRecord> getTrace() {
        return Collections.unmodifiableList(trace);
    }

    public static class FilterExecutionRecord {
        private final String filterName;
        private final String status;
        private final long duration;

        public FilterExecutionRecord(String filterName, String status, long duration) {
            this.filterName = filterName;
            this.status = status;
            this.duration = duration;
        }

        @Override
        public String toString() {
            return String.format("  [%s] %s (%dns)", filterName, status, duration);
        }
    }
}
```

### 15.6.4 循环链风险

如果链的配置出现错误，可能导致循环引用。

```java
// 危险的循环配置
Handler handlerA = new HandlerA();
Handler handlerB = new HandlerB();
handlerA.setSuccessor(handlerB);
handlerB.setSuccessor(handlerA);  // 循环！A -> B -> A -> ...

// 解决方案：在构建链时检测循环
public class SafeChainBuilder {
    public static Handler buildChain(List<Handler> handlers) {
        if (hasCycle(handlers)) {
            throw new IllegalStateException("检测到链中存在循环引用");
        }

        for (int i = 0; i < handlers.size() - 1; i++) {
            handlers.get(i).setSuccessor(handlers.get(i + 1));
        }
        return handlers.get(0);
    }

    private static boolean hasCycle(List<Handler> handlers) {
        Set<Handler> visited = new HashSet<>();
        for (Handler handler : handlers) {
            if (handler.getSuccessor() != null && visited.contains(handler.getSuccessor())) {
                return true;
            }
            visited.add(handler);
        }
        return false;
    }
}
```

## 15.7 优化策略

### 15.7.1 确保终端处理器

始终在链尾设置一个兜底处理器，避免请求丢失。

```java
/**
 * 带兜底处理器的责任链构建器
 */
public class ChainBuilder {
    private final List<Handler> handlers = new ArrayList<>();

    public ChainBuilder addHandler(Handler handler) {
        handlers.add(handler);
        return this;
    }

    public Handler build() {
        // 没有自定义处理器时，至少有一个默认处理器
        if (handlers.isEmpty()) {
            return new FallbackHandler();
        }

        // 最后一个处理器的 canHandle 应该始终返回true
        Handler last = handlers.get(handlers.size() - 1);
        if (!(last instanceof FallbackHandler)) {
            handlers.add(new FallbackHandler());
        }

        for (int i = 0; i < handlers.size() - 1; i++) {
            handlers.get(i).setSuccessor(handlers.get(i + 1));
        }

        return handlers.get(0);
    }
}
```

### 15.7.2 链执行监控

```java
/**
 * 带监控指标的责任链
 */
public class MonitoredFilterChain extends FilterChain {
    private long totalExecuted = 0;
    private long totalFailures = 0;
    private long totalProcessingTime = 0;

    @Override
    public void doFilter(Request request, Response response) {
        if (position < filters.size()) {
            Filter filter = filters.get(position);
            position++;
            long start = System.nanoTime();
            totalExecuted++;

            try {
                filter.doFilter(request, response, this);
            } catch (Exception e) {
                totalFailures++;
                throw e;
            } finally {
                totalProcessingTime += (System.nanoTime() - start);
            }
        }
    }

    public double getAverageProcessingTime() {
        return totalExecuted == 0 ? 0 :
                (double) totalProcessingTime / totalExecuted;
    }

    public double getFailureRate() {
        return totalExecuted == 0 ? 0 :
                (double) totalFailures / totalExecuted * 100;
    }

    public String getStatus() {
        return String.format(
                "Chain[执行:%d, 失败:%d (%.1f%%), 平均耗时: %.2fns]",
                totalExecuted, totalFailures, getFailureRate(), getAverageProcessingTime()
        );
    }
}
```

### 15.7.3 熔断保护

```java
/**
 * 带熔断机制的责任链
 * 当链执行时间过长时自动熔断
 */
public class CircuitBreakFilterChain extends FilterChain {
    private static final long TIMEOUT_MS = 5000;  // 5秒超时
    private static final int FAILURE_THRESHOLD = 3;
    private static final int HALF_OPEN_WINDOW = 2;

    private enum State { CLOSED, OPEN, HALF_OPEN }
    private State state = State.CLOSED;
    private int consecutiveFailures = 0;
    private int halfOpenSuccesses = 0;

    @Override
    public void doFilter(Request request, Response response) {
        if (state == State.OPEN) {
            response.write("{\"error\": \"服务暂不可用(熔断保护)\"}");
            return;
        }

        if (state == State.HALF_OPEN) {
            // 半开状态，尝试处理
            internalDoFilter(request, response);
            return;
        }

        long start = System.currentTimeMillis();
        try {
            internalDoFilter(request, response);
            resetIfNeeded();
        } catch (Exception e) {
            recordFailure();
            throw e;
        }

        if (System.currentTimeMillis() - start > TIMEOUT_MS) {
            recordFailure();
        }
    }

    private void internalDoFilter(Request request, Response response) {
        super.doFilter(request, response);
    }

    private void recordFailure() {
        consecutiveFailures++;
        if (consecutiveFailures >= FAILURE_THRESHOLD) {
            state = State.OPEN;
            System.out.println("[熔断器] 链已熔断 (连续失败" + consecutiveFailures + "次)");
        }
    }

    private void resetIfNeeded() {
        if (state == State.HALF_OPEN) {
            halfOpenSuccesses++;
            if (halfOpenSuccesses >= HALF_OPEN_WINDOW) {
                state = State.CLOSED;
                consecutiveFailures = 0;
                halfOpenSuccesses = 0;
                System.out.println("[熔断器] 已恢复正常");
            }
        } else {
            consecutiveFailures = 0;
        }
    }

    public void attemptReset() {
        if (state == State.OPEN) {
            state = State.HALF_OPEN;
            halfOpenSuccesses = 0;
            System.out.println("[熔断器] 进入半开状态，尝试恢复");
        }
    }
}
```

### 15.7.4 责任链模式与其他模式对比

| 对比维度 | 责任链模式 | 策略模式 | 装饰器模式 |
|----------|------------|----------|------------|
| **目的** | 将请求沿链传递，找合适处理器 | 封装可互换的算法 | 动态增强对象功能 |
| **关注点** | 请求的分发与处理 | 算法的选择 | 功能的叠加 |
| **运行时行为** | 链式传递，动态决定 | 选择一种策略 | 层层包裹 |
| **处理器关系** | 后继者关系 | 并列关系 | 嵌套关系 |
| **典型场景** | 审批流程、过滤器链 | 支付方式、排序算法 | IO流、缓存 |

## 本章小结

本章系统介绍了责任链模式的设计思想、实现方式与实际应用。

**核心要点回顾：**

1. **解决的问题**：将请求与处理者解耦，使多个处理器沿链对请求进行处理，支持动态组合处理流程

2. **UML与角色**：Handler（抽象处理者）维护后继引用，ConcreteHandler实现canHandle/doHandle，Client组装链并向链首发请求

3. **两种实现风格**：
   - **链表式**："有人处理即停止"，适合审批流等场景
   - **数组式**："所有人依次处理"，适合过滤器链、拦截器链等场景

4. **框架应用**：
   - Servlet FilterChain：Tomcat使用索引+数组实现，调用chain.doFilter继续传递
   - Spring Security：双层责任链，外层容器链+内层VirtualFilterChain
   - Spring MVC Interceptor：分阶段（pre/post/after）正序/逆序执行
   - MyBatis Plugin：使用动态代理嵌套构建拦截链

5. **潜在问题**：请求未处理（需兜底处理器）、性能衰退（监控+分组）、循环引用（构建时检测）、调试困难（添加追踪）

6. **优化策略**：兜底处理器、执行监控（平均时间、失败率）、熔断保护、动态链配置

责任链模式的核心价值在于**将"做什么"与"谁来做"完全解耦**：请求发送者不需要知道哪个处理器会处理请求，处理器的组合和顺序可以在运行时动态调整。这种灵活性使得它成为构建可扩展、可维护的管道式处理系统的首选模式。

---

在下一章中，我们将学习命令模式，它通过将请求封装为对象，实现请求的参数化、队列化和可撤销操作。
