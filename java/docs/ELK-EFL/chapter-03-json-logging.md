# 第3章 日志规范化与 JSON 结构化输出

## 本章导读

在 ELK 系统中，Logstash 有一个非常"痛苦"的功能——**Grok**。它的作用是从非结构化文本（如 `2024-01-01 10:00:00 [INFO] 订单创建成功 - orderId=123`）中提取出结构化字段（时间、级别、消息、订单ID）。正则表达式写起来极其繁琐，而且容易出错。

但如果你直接把日志输出为 JSON，Logstash 就不需要 Grok 了——它可以直接解析 JSON，自动提取所有字段。这就是本章的核心主张：**在应用端做结构化，而不是在 Logstash 端做解析**。

```
文本日志 vs JSON 日志的 Logstash 处理成本对比：

  文本日志（需要 Grok）：
  Logstash 中的 Grok 正则：
  %{TIMESTAMP_ISO8601:timestamp} \[%{LOGLEVEL:level}\] %{GREEDYDATA:message}
  → 复杂、容易出错、CPU 消耗大（正则回溯可能导致 CPU 100%）
  → 字段数量受限（只提取了几个字段，额外的信息丢了）

  JSON 日志（不需要 Grok）：
  Logstash 中的配置：
  codec => json
  → 一行配置，自动解析所有字段
  → CPU 消耗低
  → 所有字段都保留
```

---

## 3.1 为什么必须输出 JSON？

```
非结构化文本日志的"四大罪状"：

  罪状 1：Logstash 解析成本高
  文本日志：2024-01-01 10:00:00 [INFO] [order-service] 订单创建成功 orderId=123 userId=456
  Logstash Grok 正则：
  %{TIMESTAMP_ISO8601:timestamp} \[%{DATA:level}\] \[%{DATA:service}\] %{GREEDYDATA:message}
  → 每解析一条日志都需要运行一次正则表达式
  → 10 万 QPS 时，Grok 能吃掉一个 CPU 核的 50%

  罪状 2：字段信息丢失
  上面的日志中包含了 orderId=123 和 userId=456 两个业务字段
  但在 Grok 解析中，它们被包含在 %{GREEDYDATA:message} 中
  → 无法在 ES 中单独搜索 orderId
  → 无法按 userId 做聚合统计

  罪状 3：异常栈无法分段
  Java 异常栈通常有 20-50 行
  文本格式下一行一条日志，无法将整个异常栈关联到一条记录
  需要 Multiline 配置合并 → 又增加了 Logstash 的处理复杂度

  罪状 4：Kibana 中无法友好展示
  文本格式下，日志在 Kibana 中显示为一个字符串
  JSON 格式下，每个字段都可以单独展示、筛选、聚合
```

**结论**：JSON 结构化日志不是"可选项"，而是"生产环境 ELK 的必要条件"。如果你还在用文本日志 + Grok，请立即迁移到 JSON。

---

## 3.2 引入 logstash-logback-encoder

```xml
<!-- pom.xml -->
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

这个库提供了将 Logback 日志输出为 JSON 格式的 Appender 和 Encoder。它支持自动将 MDC 中的字段、自定义字段、异常栈等信息序列化为 JSON。

---

## 3.3 深度定制 logback-spring.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- logback-spring.xml —— 生产级 JSON 日志配置 -->
<!--
  日志架构：
  控制台：彩色文本格式（方便开发时看）
  文件：JSON 格式（Filebeat 采集发送到 ELK）
  滚动：按天 + 按大小，保留 30 天
-->
<configuration>

    <!-- ===== 应用信息（用于日志中标记服务来源） ===== -->
    <springProperty name="APP_NAME" source="spring.application.name" defaultValue="unknown"/>
    <springProperty name="PROFILE" source="spring.profiles.active" defaultValue="dev"/>

    <!-- ===== 日志路径 ===== -->
    <property name="LOG_HOME" value="${LOG_PATH:-./logs}"/>
    <property name="LOG_FILE" value="${LOG_HOME}/${APP_NAME}.log"/>

    <!-- ===== 控制台输出（彩色文本，开发环境使用） ===== -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="ch.qos.logback.classic.encoder.PatternLayoutEncoder">
            <pattern>
                %d{yyyy-MM-dd HH:mm:ss.SSS} %highlight(%-5level) [%boldYellow(%thread)]
                [%boldGreen(%X{traceId:-no-trace})] %cyan(%logger{36}) - %msg%n
            </pattern>
        </encoder>
    </appender>

    <!-- ===== 文件输出（JSON 格式，供 Filebeat 采集） ===== -->
    <appender name="JSON_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_FILE}</file>

        <!-- JSON 编码器（核心组件） -->
        <encoder class="net.logstash.logback.encoder.LoggingEventCompositeJsonEncoder">
            <providers>
                <!-- 时间戳：ISO 8601 格式 -->
                <timestamp>
                    <timeZone>Asia/Shanghai</timeZone>
                    <pattern>yyyy-MM-dd'T'HH:mm:ss.SSS'Z'</pattern>
                </timestamp>

                <!-- 日志级别 -->
                <logLevel>
                    <fieldName>level</fieldName>
                </logLevel>

                <!-- 线程名 -->
                <threadName>
                    <fieldName>thread</fieldName>
                </threadName>

                <!-- 日志器名称 -->
                <loggerName>
                    <fieldName>logger</fieldName>
                </loggerName>

                <!-- 消息体 -->
                <message>
                    <fieldName>message</fieldName>
                </message>

                <!-- MDC 字段（traceId、userId 等都在这里） -->
                <mdc>
                    <include>traceId,spanId,userId,tenantId,orderId,requestId</include>
                </mdc>

                <!-- 异常栈 -->
                <stackTrace>
                    <fieldName>stack_trace</fieldName>
                </stackTrace>

                <!-- 自定义字段：服务名、环境 -->
                <contextName>
                    <fieldName>serviceName</fieldName>
                </contextName>

                <!-- 自定义字段：应用版本 -->
                <callerData>
                    <fieldName>class</fieldName>
                </callerData>
            </providers>
        </encoder>

        <!-- ===== 滚动策略 ===== -->
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <!-- 按天滚动 -->
            <fileNamePattern>${LOG_HOME}/${APP_NAME}.%d{yyyy-MM-dd}.%i.log</fileNamePattern>

            <!-- 同时按大小滚动 -->
            <timeBasedFileNamingAndTriggeringPolicy
                    class="ch.qos.logback.core.rolling.SizeAndTimeBasedFNATP">
                <maxFileSize>500MB</maxFileSize>    <!-- 单个文件最大 500MB -->
            </timeBasedFileNamingAndTriggeringPolicy>

            <!-- 保留 30 天的日志 -->
            <maxHistory>30</maxHistory>
            <!-- 总大小限制 -->
            <totalSizeCap>10GB</totalSizeCap>
        </rollingPolicy>
    </appender>

    <!-- ===== 异步 Appender（防止日志 I/O 阻塞业务线程） ===== -->
    <appender name="ASYNC_JSON" class="ch.qos.logback.classic.AsyncAppender">
        <!-- 不丢弃日志（队列满了也不丢） -->
        <discardingThreshold>0</discardingThreshold>
        <!-- 队列大小 -->
        <queueSize>8192</queueSize>
        <!-- 引用上面的 JSON 文件 Appender -->
        <appender-ref ref="JSON_FILE"/>
    </appender>

    <!-- ===== 按环境配置 Root Logger ===== -->
    <springProfile name="dev">
        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
            <appender-ref ref="ASYNC_JSON"/>
        </root>
    </springProfile>

    <springProfile name="prod">
        <root level="INFO">
            <appender-ref ref="ASYNC_JSON"/>  <!-- 生产环境不输出控制台 -->
        </root>
    </springProfile>
</configuration>
```

### JSON 日志示例

```json
// 日志配置生效后，输出的 JSON 文件中的一条记录示例
{
  "@timestamp": "2024-01-15T10:30:00.123Z",
  "level": "INFO",
  "thread": "http-nio-8080-exec-3",
  "logger": "com.example.order.service.OrderService",
  "message": "订单创建成功",
  "serviceName": "order-service",
  "traceId": "abc-def-ghi-123",
  "spanId": "456",
  "userId": "user_1001",
  "orderId": "order_2001",
  "stack_trace": null
}

// 异常日志的 JSON 输出
{
  "@timestamp": "2024-01-15T10:30:01.456Z",
  "level": "ERROR",
  "thread": "http-nio-8080-exec-5",
  "logger": "com.example.order.controller.OrderController",
  "message": "订单创建失败：库存不足",
  "serviceName": "order-service",
  "traceId": "abc-def-ghi-123",
  "userId": "user_1001",
  "orderId": "order_2001",
  "stack_trace": "java.lang.RuntimeException: 库存不足\n\tat com.example.order.service.OrderService.create(OrderService.java:42)\n\tat ..."
}
```

---

## 3.4 统一异常处理

```java
/**
 * 全局异常处理器
 * 确保所有异常都有统一的日志输出格式，包含 TraceId 和业务上下文
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 业务异常（已知异常）——打印 WARN 级别的日志
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(
            BusinessException e, HttpServletRequest request) {

        // WARN 级别，记录异常信息
        log.warn("业务异常: code={}, message={}, userId={}, requestURI={}",
            e.getCode(), e.getMessage(),
            MDC.get("userId"),
            request.getRequestURI());

        return ResponseEntity
            .status(e.getHttpStatus())
            .body(new ErrorResponse(e.getCode(), e.getMessage()));
    }

    /**
     * 系统异常（未知异常）——打印 ERROR 级别的日志，含完整堆栈
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(
            Exception e, HttpServletRequest request) {

        // ERROR 级别，记录完整异常栈
        log.error("系统异常: requestURI={}, userId={}",
            request.getRequestURI(),
            MDC.get("userId"),
            e);  // 传入异常对象，Logback 会自动记录 stack_trace

        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("SYSTEM_ERROR", "服务器内部错误"));
    }
}
```

---

## 本章总结

```java
// 一行代码打印 JSON 格式的日志
// 不需要任何额外配置——logback-spring.xml 自动将输出序列化为 JSON

// 在 Service 层使用
log.info("订单创建成功, orderId={}, userId={}, amount={}",
    orderId, userId, amount);

// 在 Controller 层使用
log.warn("库存不足, orderId={}, productId={}", orderId, productId);

// 异常日志（自动包含堆栈）
try {
    // ...
} catch (Exception e) {
    log.error("调用支付服务失败, orderId={}", orderId, e);
    throw e;
}
```

**核心原则**：
1. **JSON 结构化日志是 ELK 的基础**——没有 JSON，Logstash 需要 Grok 解析（消耗 CPU），ES 无法自动识别字段类型，Kibana 无法友好展示
2. **logstash-logback-encoder 是 Java 生态中输出 JSON 日志的标准库**——它自动集成 MDC、异常栈、自定义字段。不要自己写 JSON 序列化的 Logger
3. **异步 Appender 是必须的**——日志 I/O 不应该阻塞业务线程。使用 `AsyncAppender` 后，日志写入的延迟不影响业务请求的响应时间
4. **生产环境不要打印控制台日志**——控制台日志最终被 Docker 重定向到 stdout，在 K8s 环境会被 `kubectl logs` 捕获。但在物理机场景下，控制台日志浪费 IO 且不会被 Filebeat 采集