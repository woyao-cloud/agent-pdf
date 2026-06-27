# 第9章 腾讯云CLS日志采集与分析

## 9.1 概述

在云原生微服务架构中，日志是系统可观测性的三大支柱之一（日志、指标、链路追踪）。腾讯云日志服务（Cloud Log Service，CLS）提供了一站式的日志采集、存储、检索、分析和告警能力，是腾讯云上构建可观测性体系的核心基础设施。

本章将从日志采集架构设计、日志结构化规范、检索分析实践、告警配置以及潜在风险五个维度，系统性地讲解如何在腾讯云TKE（Tencent Kubernetes Engine）环境中基于CLS构建企业级日志平台。

---

## 9.2 日志采集架构

### 9.2.1 解决的问题

在Kubernetes环境中，日志采集面临以下核心挑战：

- **日志分散**：Pod随时可能被调度到不同节点，日志文件分散在集群各处，传统SSH登机查看的方式完全不可行。
- **采集稳定性**：日志采集代理不能成为业务容器的故障点，采集进程崩溃不应影响业务进程。
- **资源隔离**：日志采集消耗的CPU和内存需要与业务容器隔离，避免日志采集抢占业务资源。
- **多行日志**：Java异常栈、SQL执行计划等跨多行的日志需要被正确聚合为一条完整记录，而非被拆散成多条碎片。
- **动态发现**：新Pod创建后，日志采集配置需要自动生效，无需人工介入。

CLS通过LogListener采集代理配合LogConfig CRD（Custom Resource Definition）机制，系统性地解决了上述问题。

### 9.2.2 核心原理

CLS的日志采集体系由三个层次组成：

**1. LogListener 采集代理**

LogListener是CLS的日志采集客户端，运行在每个Kubernetes节点上。它负责监听日志文件的变化、读取新增内容、按规则进行结构化解析，并批量上报至CLS服务端。

LogListener支持两种部署模式：

| 维度 | DaemonSet 模式 | Sidecar 模式 |
|------|---------------|-------------|
| 部署方式 | 每个节点一个Pod | 每个业务Pod一个Sidecar容器 |
| 资源总量 | N个节点 × 固定资源 | N个Pod × 固定资源 |
| 配置管理 | 通过CRD集中管理 | 每个Pod独立配置 |
| 适用规模 | 大规模集群（推荐） | 小规模或特殊需求 |
| 运维成本 | 低 | 高 |

**DaemonSet模式**是生产环境的首选方案。每个Kubernetes节点上运行一个LogListener Pod，该Pod通过hostPath挂载宿主机文件系统，读取同节点上所有业务Pod的日志文件。CLS Operator监听LogConfig CRD的变化，自动将采集规则下发到对应节点的LogListener。

**Sidecar模式**在每个业务Pod中额外运行一个LogListener容器。这种模式资源开销大（每个Pod都有一份LogListener进程），但可以实现更精细的采集控制，例如为不同Pod设置不同的上报限速策略。

**2. LogConfig CRD**

LogConfig是腾讯云TKE提供的自定义资源，用于声明式地定义日志采集规则。一个LogConfig资源包含以下核心信息：

- 采集目标：通过labelSelector或namespace匹配目标Pod
- 日志路径：容器内日志文件的路径
- 解析模式：单行文本、JSON、多行聚合等
- 目标主题：CLS的日志主题（LogTopic）ID
- 采集配置：编码、过滤规则、上报频率等

CLS Operator（部署在TKE集群中）监听LogConfig资源的增删改事件，将其转换为LogListener可识别的配置，并通过内部通道下发到对应节点的LogListener进程。

**3. 多行日志聚合机制**

多行日志聚合是日志采集中最容易出错的环节。CLS通过正则表达式定义"行首匹配模式"来实现多行聚合：

- 当LogListener读取到一行日志时，判断该行是否匹配行首正则
- 如果匹配，将之前的缓存行作为一条完整日志上报，并以当前行开始新的缓存
- 如果不匹配，将当前行追加到缓存中

例如Java异常栈的首行通常以异常类名开头（如 `java.lang.NullPointerException`），后续行以 `\t` 或 `at ` 开头。通过配置行首正则 `^[A-Za-z]` 或 `^\S`，可以将整个异常栈聚合为一条日志。

### 9.2.3 代码/配置实现

**DaemonSet 模式部署 LogListener**

腾讯云TKE集群默认集成了CLS组件，但需要手动安装CLS Operator和LogListener DaemonSet。以下是通过Helm安装的参考配置：

```bash
# 添加腾讯云CLS Helm仓库
helm repo add tencent-tke https://mirrors.tencent.com/charts
helm repo update

# 安装CLS组件
helm install cls-agent tencent-tke/cls-agent \
  --namespace cls-system \
  --create-namespace \
  --set region=ap-guangzhou \
  --set clusterId=cls-xxxxxx
```

**LogConfig CRD 配置示例**

以下是一个完整的LogConfig YAML，用于采集Java应用的JSON格式日志：

```yaml
apiVersion: cls.cloud.tencent.com/v1
kind: LogConfig
metadata:
  name: java-app-log-config
  namespace: production
spec:
  # 通过labelSelector匹配目标Pod
  labelSelector:
    app: order-service
    version: v2
  # 日志采集配置
  clsConfig:
    # 日志主题ID（在CLS控制台创建）
    logTopicId: xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    # 日志路径：容器内的日志文件路径
    logType: json_log
    # 采集路径支持通配符
    path: /data/logs/app/*.log
    # 编码格式
    encoding: utf-8
    # 日志提取规则（json_log模式下自动解析JSON字段）
    extractRule:
      # 多行日志行首正则（JSON日志通常不需要）
      beginningRegex: ^\{
      # 过滤规则：只采集包含特定关键字的日志
      filter:
        - key: level
          type: include
          value: ERROR|WARN
      # 日志时间配置
      timeKey: timestamp
      timeFormat: "%Y-%m-%dT%H:%M:%S.%f%z"
    # 上报配置
    shipper:
      # 上报频率（秒）
      sendInterval: 3
      # 每次上报的最大日志条数
      sendCount: 1024
      # 内存缓冲区上限（MB）
      memPercent: 20
```

**多行日志聚合配置**

对于Java异常栈这类非JSON格式的多行日志，需要配置 `beginningRegex` 来定义行首匹配规则：

```yaml
apiVersion: cls.cloud.tencent.com/v1
kind: LogConfig
metadata:
  name: java-stacktrace-config
  namespace: production
spec:
  labelSelector:
    app: payment-service
  clsConfig:
    logTopicId: xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    logType: delimiter_log
    path: /data/logs/app/error.log
    extractRule:
      # 行首匹配：以非空白字符开头的行为新日志的开始
      beginningRegex: ^\S
      # 对于Java异常栈，更精确的正则：
      # beginningRegex: ^\d{4}-\d{2}-\d{2}
      # 如果日志以时间戳开头，也可以用时间格式匹配
      timeKey: timestamp
      timeFormat: "%Y-%m-%d %H:%M:%S"
    shipper:
      sendInterval: 3
      sendCount: 1024
```

**Sidecar 模式配置**

Sidecar模式需要在业务Deployment中手动注入LogListener容器：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        # 业务容器
        - name: app
          image: ccr.ccs.tencentyun.com/myapp/order-service:latest
          volumeMounts:
            - name: log-volume
              mountPath: /data/logs/app
        # Sidecar LogListener 容器
        - name: log-listener
          image: ccr.ccs.tencentyun.com/tke/cls-loglistener:latest
          env:
            - name: CLS_TOPIC_ID
              value: xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
            - name: CLS_REGION
              value: ap-guangzhou
            - name: LOG_FILE_PATH
              value: /data/logs/app/*.log
            - name: LOG_TYPE
              value: json_log
          volumeMounts:
            - name: log-volume
              mountPath: /data/logs/app
      volumes:
        - name: log-volume
          emptyDir: {}
```

### 9.2.4 使用场景

- **大规模微服务集群**：50个节点以上的生产集群，推荐DaemonSet + LogConfig CRD模式，运维成本最低。
- **敏感业务隔离**：金融、医疗等对数据隔离有严格要求的场景，Sidecar模式可以确保日志数据不经过共享进程。
- **混合日志格式**：同一Pod同时输出JSON业务日志和纯文本访问日志，通过多个LogConfig分别采集。
- **多集群统一归集**：跨地域多个TKE集群的日志汇聚到同一个CLS日志集，实现全局统一检索。

### 9.2.5 潜在风险与注意事项

- **hostPath 权限**：DaemonSet模式需要挂载宿主机目录，确保LogListener有足够的读取权限，同时避免日志文件包含敏感信息被非授权进程读取。
- **LogListener 资源限制**：必须为LogListener设置CPU和内存的requests/limits，避免日志量突增时LogListener耗尽节点资源。
- **日志轮转兼容性**：LogListener通过inode跟踪文件，当日志轮转（logrotate）时，如果旧文件被删除或重命名，LogListener需要正确切换到新文件。建议使用 `copytruncate` 模式而非 `create` 模式。
- **多行聚合超时**：如果异常栈的最后一行后长时间没有新日志，LogListener会通过超时机制（默认3秒）将缓存中的内容强制上报，避免日志滞留。

### 9.2.6 本章小结

日志采集架构是CLS体系的基石。生产环境推荐DaemonSet + LogConfig CRD模式，通过声明式配置实现日志采集的自动化管理。多行日志聚合是配置中最容易出错的环节，需要根据日志格式精确编写行首正则。采集架构的选择需要综合考虑集群规模、资源开销和运维成本之间的平衡。

---

## 9.3 日志结构化

### 9.3.1 解决的问题

非结构化日志（如 `2025-06-27 10:30:00 ERROR something went wrong`）在检索和分析时存在严重局限：

- 无法按字段精确过滤（如只查 `orderId=12345` 的日志）
- SQL分析无从下手（无法对非结构化文本做 `GROUP BY` 或 `AVG`）
- 日志等级无法独立提取，告警规则只能做关键词匹配
- 跨微服务的调用链无法通过traceId关联

日志结构化的核心目标是将日志从"人类可读的文本"升级为"机器可解析的结构化事件"。

### 9.3.2 核心原理

**JSON 日志格式规范**

CLS对JSON格式日志有原生支持。当日志类型设置为 `json_log` 时，LogListener会自动解析每一行JSON，将其中的每个字段提取为独立的索引字段。这意味着：

- 不需要手动配置提取规则
- 字段类型自动推断（字符串、数值、布尔）
- 支持嵌套JSON对象的展开查询

推荐的JSON日志字段规范：

| 字段 | 类型 | 含义 | 是否必选 |
|------|------|------|---------|
| `timestamp` | string | ISO 8601 时间格式 | 是 |
| `level` | string | 日志级别 | 是 |
| `logger` | string | 记录器名称 | 推荐 |
| `thread` | string | 线程名 | 推荐 |
| `message` | string | 日志消息体 | 是 |
| `traceId` | string | 链路追踪ID | 推荐 |
| `spanId` | string | 链路Span ID | 可选 |
| `userId` | string | 用户标识 | 可选 |
| `duration` | number | 耗时（毫秒） | 可选 |
| `error` | object | 错误详情 | 可选 |
| `context` | object | 业务上下文 | 可选 |

**日志级别规范**

日志级别用于标识日志的严重程度，推荐遵循SLF4J标准：

| 级别 | 含义 | 使用场景 |
|------|------|---------|
| TRACE | 追踪 | 开发调试，生产环境通常关闭 |
| DEBUG | 调试 | 诊断问题时的详细输出 |
| INFO | 信息 | 业务关键节点的正常流程记录 |
| WARN | 警告 | 非预期但可自动恢复的情况 |
| ERROR | 错误 | 需要人工关注的异常情况 |
| FATAL | 致命 | 导致服务无法继续运行（极少使用） |

**traceId 跨服务传播**

在微服务架构中，一个用户请求会穿越多个服务。traceId作为请求的唯一标识，需要在服务间透传，以便将一次请求的所有日志串联起来。

traceId的传播机制：

1. **入口生成**：网关或第一个服务接收到请求时，生成全局唯一的traceId（通常为UUID或Snowflake ID）
2. **HTTP传播**：通过HTTP Header传递，标准Header名为 `X-Request-Id` 或 `X-Trace-Id`
3. **RPC传播**：通过RPC协议的Attachment或Metadata传递
4. **MDC注入**：服务端收到请求后，将traceId注入日志框架的MDC（Mapped Diagnostic Context），后续所有日志自动携带traceId

### 9.3.3 代码/配置实现

**Logback 配置：JSON格式输出**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <!-- 定义JSON格式的Appender -->
  <appender name="JSON_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
    <file>/data/logs/app/app.log</file>
    <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
      <fileNamePattern>/data/logs/app/app.%d{yyyy-MM-dd}.log</fileNamePattern>
      <maxHistory>30</maxHistory>
      <totalSizeCap>10GB</totalSizeCap>
    </rollingPolicy>
    <encoder class="ch.qos.logback.core.encoder.LayoutWrappingEncoder">
      <layout class="ch.qos.logback.contrib.json.classic.JsonLayout">
        <!-- 是否包含MDC上下文 -->
        <includeContextName>false</includeContextName>
        <!-- 是否包含线程名 -->
        <includeThreadName>true</includeThreadName>
        <!-- 是否包含日志级别 -->
        <includeLevel>true</includeLevel>
        <!-- 是否包含记录器名称 -->
        <includeLoggerName>true</includeLoggerName>
        <!-- 时间戳格式 -->
        <timestampFormat>yyyy-MM-dd'T'HH:mm:ss.SSS'Z'</timestampFormat>
        <!-- 时间戳时区 -->
        <timestampFormatTimezoneId>UTC</timestampFormatTimezoneId>
        <!-- 是否包含异常信息 -->
        <includeFormattedMessage>true</includeFormattedMessage>
        <!-- 是否包含异常栈 -->
        <includeException>true</includeException>
        <!-- 是否包含MDC属性 -->
        <includeMdc>true</includeMdc>
      </layout>
    </encoder>
  </appender>

  <!-- 控制台输出（开发环境使用） -->
  <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
    </encoder>
  </appender>

  <!-- 异步Appender：避免日志I/O阻塞业务线程 -->
  <appender name="ASYNC_JSON" class="ch.qos.logback.classic.AsyncAppender">
    <!-- 不丢失日志，队列满时阻塞业务线程 -->
    <neverBlock>false</neverBlock>
    <!-- 队列大小 -->
    <queueSize>8192</queueSize>
    <!-- 丢弃阈值：队列剩余容量低于此比例时丢弃TRACE/DEBUG -->
    <discardingThreshold>0</discardingThreshold>
    <appender-ref ref="JSON_FILE" />
  </appender>

  <!-- 根日志级别 -->
  <root level="INFO">
    <appender-ref ref="ASYNC_JSON" />
  </root>

  <!-- 特定包的日志级别 -->
  <logger name="com.myapp.order" level="DEBUG" />
  <logger name="org.springframework" level="WARN" />
</configuration>
```

**Java 代码：traceId 自动注入**

通过Spring Boot的 `HandlerInterceptor` 或 `Filter` 实现traceId的自动注入：

```java
@Component
public class TraceIdFilter implements Filter {

    private static final String TRACE_ID_HEADER = "X-Trace-Id";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                        FilterChain chain) throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;

        // 从请求头获取traceId，如果没有则生成新的
        String traceId = httpRequest.getHeader(TRACE_ID_HEADER);
        if (traceId == null || traceId.isEmpty()) {
            traceId = UUID.randomUUID().toString().replace("-", "");
        }

        // 注入MDC
        MDC.put("traceId", traceId);
        MDC.put("spanId", generateSpanId());

        try {
            // 将traceId传递到响应头，方便客户端追踪
            HttpServletResponse httpResponse = (HttpServletResponse) response;
            httpResponse.setHeader(TRACE_ID_HEADER, traceId);

            chain.doFilter(request, response);
        } finally {
            // 请求结束后清理MDC，防止内存泄漏
            MDC.clear();
        }
    }

    private String generateSpanId() {
        return Long.toHexString(ThreadLocalRandom.current().nextLong());
    }
}
```

**Spring Cloud Feign：traceId 跨服务传递**

```java
@Configuration
public class TraceIdFeignInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate template) {
        // 从当前线程的MDC中获取traceId
        String traceId = MDC.get("traceId");
        if (traceId != null) {
            template.header("X-Trace-Id", traceId);
        }
    }
}
```

**Kafka/RocketMQ 消息中的 traceId 传递**

```java
// 生产者：发送消息时携带traceId
public void sendOrderEvent(OrderEvent event) {
    String traceId = MDC.get("traceId");
    if (traceId != null) {
        event.setTraceId(traceId);
    }
    kafkaTemplate.send("order-events", event);
}

// 消费者：消费消息时恢复traceId
@KafkaListener(topics = "order-events")
public void onOrderEvent(OrderEvent event) {
    if (event.getTraceId() != null) {
        MDC.put("traceId", event.getTraceId());
    }
    // 处理业务逻辑...
    processEvent(event);
}
```

**生成的日志示例**

```json
{
  "timestamp": "2025-06-27T10:30:00.123Z",
  "level": "ERROR",
  "thread": "http-nio-8080-exec-3",
  "logger": "com.myapp.order.service.OrderService",
  "message": "订单处理失败",
  "traceId": "a1b2c3d4e5f67890",
  "spanId": "9a8b7c6d",
  "userId": "user_10086",
  "duration": 2345,
  "error": {
    "type": "PaymentTimeoutException",
    "message": "支付服务超时",
    "stackTrace": "com.myapp.order.exception.PaymentTimeoutException: 支付服务超时\n\tat com.myapp.order.service.OrderService.process(OrderService.java:85)\n\tat com.myapp.order.controller.OrderController.create(OrderController.java:32)"
  },
  "context": {
    "orderId": "ORD202506270001",
    "amount": 299.99,
    "paymentMethod": "wechat"
  }
}
```

### 9.3.4 使用场景

- **全链路追踪**：通过traceId将网关、订单、支付、库存等服务的日志串联，快速定位跨服务故障。
- **业务监控**：通过 `context.orderId` 查询特定订单的完整处理日志，辅助客服排查用户反馈。
- **性能分析**：对 `duration` 字段做SQL聚合分析，计算P50/P95/P99响应时间。
- **错误归因**：按 `error.type` 分组统计各类异常的发生频率和趋势。

### 9.3.5 潜在风险与注意事项

- **MDC 内存泄漏**：在异步线程池或消息消费场景中，务必在 `finally` 块中调用 `MDC.clear()`，否则会导致MDC中的traceId在线程复用后污染后续请求。
- **JSON 字段膨胀**：不要在日志中包含过大的业务对象（如完整的数据库查询结果），建议只记录关键字段。过大的JSON会导致CLS存储成本上升和查询性能下降。
- **敏感信息脱敏**：日志中不应包含密码、身份证号、银行卡号等敏感信息。建议在日志输出前通过脱敏工具类处理。
- **异步日志丢失**：AsyncAppender在队列满时默认丢弃TRACE和DEBUG级别日志。如果要求不丢日志，需设置 `discardingThreshold=0` 并使用 `neverBlock=false`。

### 9.3.6 本章小结

日志结构化是CLS高效检索和分析的前提。JSON格式配合MDC自动注入traceId，可以实现跨微服务的全链路日志关联。Logback的JsonLayout可以零代码改造地输出结构化日志。traceId的跨服务传播需要同时处理HTTP同步调用和消息队列异步调用两种场景。结构化日志的字段设计应遵循"够用但不过度"的原则，避免字段膨胀导致成本失控。

---

## 9.4 日志检索与分析

### 9.4.1 解决的问题

日志采集上来之后，如果不能高效检索和分析，就只是一堆沉睡的数据。CLS提供了从基础检索到高级分析的完整能力栈：

- 海量日志的秒级检索（PB级数据量下毫秒级响应）
- 结构化字段的精确过滤和范围查询
- 类SQL聚合分析（支持窗口函数、子查询）
- 可视化仪表盘（无需额外搭建Grafana）

### 9.4.2 核心原理

CLS的检索分析引擎分为两个层次：

**1. 检索层（Search）**

检索层基于倒排索引实现。当日志被采集到CLS后，CLS对日志内容进行分词、建立倒排索引。检索时，用户输入关键词或字段条件，CLS通过索引快速定位到匹配的日志。

CLS支持两种检索模式：

- **全文检索**：在所有文本字段中搜索关键词。CLS默认的分词器按标点符号和空格分词，例如 `order-service` 会被拆分为 `order` 和 `service` 两个词。
- **字段检索**：在指定字段中搜索。字段检索利用字段级别的索引，效率更高。语法为 `fieldName:value`。

**2. 分析层（SQL Analysis）**

分析层基于CLS的SQL分析引擎，支持标准SQL语法（类似Presto/Trino）。SQL分析在检索结果的基础上进行聚合计算，适用于统计、分组、排序等场景。

CLS SQL分析的关键特性：

- 支持 `SELECT`、`GROUP BY`、`ORDER BY`、`LIMIT`
- 支持聚合函数：`COUNT`、`SUM`、`AVG`、`MAX`、`MIN`、`DISTINCT`
- 支持时间函数：`date_trunc`、`date_format`、`time_series`
- 支持窗口函数：`row_number()`、`lag()`、`lead()`
- 支持嵌套查询（子查询）

### 9.4.3 代码/配置实现

**全文检索示例**

在CLS控制台的检索框中直接输入关键词：

```
# 搜索包含"支付超时"的日志
支付超时

# 使用AND/OR/NOT组合条件
支付超时 AND orderId:ORD202506270001

# 通配符搜索
orderId:ORD*

# 范围查询
duration > 1000 AND duration < 5000

# 存在性查询
traceId:*
```

**字段检索示例**

```
# 按日志级别过滤
level:ERROR

# 按错误类型分组查询
error.type:PaymentTimeoutException

# 多条件组合
level:ERROR AND duration > 2000

# 排除特定日志
level:ERROR NOT logger:"org.springframework"

# 嵌套字段查询
context.paymentMethod:wechat AND level:ERROR
```

**CLS SQL 分析查询**

```sql
-- 按服务统计错误数量
SELECT
  logger,
  COUNT(*) AS error_count
WHERE
  level = 'ERROR'
GROUP BY
  logger
ORDER BY
  error_count DESC
LIMIT 20

-- 按分钟统计请求量
SELECT
  date_trunc('minute', __TIMESTAMP__) AS minute,
  COUNT(*) AS request_count
GROUP BY
  minute
ORDER BY
  minute ASC
LIMIT 100

-- 计算接口响应时间的百分位
SELECT
  logger,
  COUNT(*) AS total,
  AVG(duration) AS avg_duration,
  PERCENTILE(duration, 0.50) AS p50,
  PERCENTILE(duration, 0.95) AS p95,
  PERCENTILE(duration, 0.99) AS p99,
  MAX(duration) AS max_duration
WHERE
  message LIKE '%请求完成%'
GROUP BY
  logger
ORDER BY
  avg_duration DESC

-- 按错误类型统计（使用JSON字段）
SELECT
  error.type AS error_type,
  COUNT(*) AS count,
  COUNT(DISTINCT traceId) AS affected_traces
WHERE
  level = 'ERROR'
GROUP BY
  error_type
ORDER BY
  count DESC
LIMIT 20

-- 时间序列聚合：每分钟的ERROR数量
SELECT
  date_trunc('minute', __TIMESTAMP__) AS time_bucket,
  COUNT(*) AS error_count
WHERE
  level = 'ERROR'
GROUP BY
  time_bucket
ORDER BY
  time_bucket ASC
LIMIT 60

-- 按用户查询最近的错误
SELECT
  __TIMESTAMP__,
  level,
  message,
  traceId,
  context.orderId
WHERE
  userId = 'user_10086'
  AND level >= 'WARN'
ORDER BY
  __TIMESTAMP__ DESC
LIMIT 50

-- 慢查询分析：耗时超过3秒的请求
SELECT
  __TIMESTAMP__,
  traceId,
  context.orderId,
  duration,
  message
WHERE
  duration > 3000
ORDER BY
  duration DESC
LIMIT 100

-- 子查询：找出错误率超过5%的服务
SELECT
  logger,
  total_requests,
  error_count,
  CAST(error_count AS DOUBLE) / total_requests * 100 AS error_rate
FROM (
  SELECT
    logger,
    COUNT(*) AS total_requests,
    SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) AS error_count
  GROUP BY
    logger
)
WHERE
  CAST(error_count AS DOUBLE) / total_requests * 100 > 5
ORDER BY
  error_rate DESC
```

**CLS 仪表盘配置（JSON 定义）**

CLS仪表盘支持通过JSON导入导出。以下是一个业务监控仪表盘的配置示例：

```json
{
  "dashboardName": "订单服务监控",
  "dashboardCharts": [
    {
      "chartName": "请求量趋势",
      "chartType": "line",
      "query": {
        "sql": "SELECT date_trunc('minute', __TIMESTAMP__) AS time, COUNT(*) AS count GROUP BY time ORDER BY time",
        "logTopicId": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "timeRange": 3600
      }
    },
    {
      "chartName": "错误分布",
      "chartType": "pie",
      "query": {
        "sql": "SELECT error.type AS type, COUNT(*) AS count WHERE level='ERROR' GROUP BY type ORDER BY count DESC LIMIT 10",
        "logTopicId": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    },
    {
      "chartName": "P95响应时间",
      "chartType": "line",
      "query": {
        "sql": "SELECT date_trunc('minute', __TIMESTAMP__) AS time, PERCENTILE(duration, 0.95) AS p95 GROUP BY time ORDER BY time",
        "logTopicId": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    },
    {
      "chartName": "TOP 10 慢接口",
      "chartType": "bar",
      "query": {
        "sql": "SELECT logger, AVG(duration) AS avg_dur, MAX(duration) AS max_dur, COUNT(*) AS count WHERE message LIKE '%请求完成%' GROUP BY logger ORDER BY avg_dur DESC LIMIT 10",
        "logTopicId": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  ]
}
```

### 9.4.4 使用场景

- **线上故障排查**：通过traceId检索一次请求的全链路日志，从网关到各个微服务的完整调用链。
- **容量规划**：通过SQL分析统计每日日志量增长趋势，预测存储成本和CLS服务规格。
- **SLA 监控**：通过仪表盘实时监控接口响应时间的P95/P99，及时发现性能劣化。
- **用户行为分析**：通过 `userId` 和 `context` 字段分析特定用户的操作轨迹。
- **慢查询治理**：定期分析 `duration` 字段，识别需要优化的慢接口。

### 9.4.5 潜在风险与注意事项

- **索引成本**：CLS的每个索引字段都会产生额外的存储成本。不需要检索的字段应关闭索引，仅保留在原始日志中。
- **SQL 查询超时**：CLS SQL分析有15秒的超时限制，大数据量聚合建议缩小时间范围或使用预聚合。
- **分词影响**：全文检索的分词结果可能不符合预期。例如 `order-service` 被拆分为 `order` 和 `service`，搜索 `order-service` 时可能匹配到不相关的结果。建议对关键标识符使用字段检索而非全文检索。
- **查询并发限制**：CLS对单日志主题的并发查询数有限制，大量仪表盘同时刷新可能导致查询排队。

### 9.4.6 本章小结

CLS的检索分析能力覆盖了从关键词搜索到复杂SQL聚合的全场景。全文检索适合快速排查，字段检索适合精确过滤，SQL分析适合统计聚合，仪表盘适合持续监控。实际使用中应根据查询场景选择合适的检索方式，同时注意索引成本和查询性能之间的平衡。

---

## 9.5 日志告警

### 9.5.1 解决的问题

日志的价值不仅在于"事后排查"，更在于"实时预警"。日志告警需要解决以下问题：

- 业务异常发生时，第一时间通知到责任人
- 避免告警风暴：同类错误在短时间内重复告警
- 多渠道触达：不同严重级别的告警通过不同渠道通知
- 告警降噪：通过告警策略减少无效告警

### 9.5.2 核心原理

CLS告警系统由三个核心组件构成：

**1. 告警策略（Alarm Policy）**

告警策略定义了"什么时候触发告警"。CLS支持两种告警类型：

- **内容告警**：基于日志内容的匹配条件触发。例如"5分钟内ERROR日志超过10条"。
- **指标告警**：基于SQL分析结果的数值条件触发。例如"P99响应时间超过5000ms"。

告警策略的核心参数：

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| 统计周期 | 每次评估的时间窗口 | 1-15分钟 |
| 执行周期 | 多久评估一次 | 1-5分钟 |
| 触发条件 | 连续N个周期满足条件 | 连续1-3个周期 |
| 收敛周期 | 同一条告警的重复通知间隔 | 5-30分钟 |

**2. 通知渠道**

CLS支持以下通知渠道：

| 渠道 | 适用场景 | 可靠性 | 成本 |
|------|---------|--------|------|
| 电话 | P0级故障 | 高 | 高 |
| 短信 | P1级告警 | 中 | 中 |
| 微信 | 日常通知 | 中 | 低 |
| Webhook | 自建通知系统 | 高 | 低 |
| 邮件 | 日报/周报 | 低 | 低 |

**3. 告警收敛与降噪**

告警收敛机制包括：

- **间隔收敛**：同一告警规则在收敛周期内只发送一次通知
- **标签去重**：相同告警标签（如相同的错误类型）在收敛周期内合并
- **静默期**：夜间或维护窗口期自动静音非关键告警

### 9.5.3 代码/配置实现

**内容告警配置（CLS控制台/API）**

以下是通过CLS API创建告警策略的JSON配置：

```json
{
  "AlarmName": "订单服务ERROR告警",
  "MonitorTime": {
    "TimeType": "Period",
    "TimeRange": 5
  },
  "Condition": "level:ERROR",
  "TriggerCount": 3,
  "AlarmPeriod": 300,
  "AlarmNotifyType": ["Sms", "WeChat"],
  "AlarmNotices": [
    {
      "NoticeReceiver": {
        "ReceiverType": "Uin",
        "ReceiverIds": ["10001", "10002"],
        "NoticeChannels": ["Sms", "WeChat"]
      },
      "NoticeEndTime": "23:59:59",
      "NoticeStartTime": "00:00:00"
    }
  ],
  "Status": true,
  "LogTopicId": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**SQL指标告警配置**

```json
{
  "AlarmName": "P99响应时间过高",
  "MonitorTime": {
    "TimeType": "Period",
    "TimeRange": 5
  },
  "Condition": {
    "Query": "SELECT PERCENTILE(duration, 0.99) AS p99 WHERE message LIKE '%请求完成%'",
    "ComparisonOperator": "gt",
    "ComparisonValue": 5000
  },
  "TriggerCount": 2,
  "AlarmPeriod": 600,
  "AlarmNotifyType": ["Phone", "Sms"],
  "AlarmNotices": [
    {
      "NoticeReceiver": {
        "ReceiverType": "Uin",
        "ReceiverIds": ["10001"],
        "NoticeChannels": ["Phone"]
      }
    }
  ],
  "Status": true,
  "LogTopicId": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Webhook 通知对接企业微信**

CLS的Webhook通知可以对接企业微信机器人，实现告警自动同步到工作群：

```json
{
  "AlarmName": "服务错误率告警",
  "MonitorTime": {
    "TimeType": "Period",
    "TimeRange": 5
  },
  "Condition": {
    "Query": "SELECT COUNT(*) AS error_count WHERE level='ERROR'",
    "ComparisonOperator": "gt",
    "ComparisonValue": 50
  },
  "TriggerCount": 1,
  "AlarmPeriod": 300,
  "AlarmNotifyType": ["Webhook"],
  "Webhook": {
    "Url": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx-xxxx-xxxx-xxxx",
    "Content": "【告警】{{alarm_name}}\n告警时间：{{alarm_time}}\n日志主题：{{log_topic}}\n当前值：{{alarm_value}}\n触发条件：{{alarm_condition}}\n告警详情：{{alarm_detail}}"
  },
  "Status": true,
  "LogTopicId": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**告警通知模板（自定义Webhook接收端）**

如果企业微信/钉钉的默认格式不满足需求，可以自建Webhook接收服务：

```java
@RestController
@RequestMapping("/webhook")
public class AlarmWebhookController {

    @PostMapping("/cls-alarm")
    public ResponseEntity<String> receiveClsAlarm(@RequestBody ClsAlarmMessage alarm) {
        // 根据告警级别路由到不同渠道
        switch (alarm.getLevel()) {
            case "P0":
                // P0级告警：电话 + 短信 + 群通知
                phoneService.call(alarm.getOnCallPerson());
                smsService.send(alarm.getOnCallPerson(), alarm.getSummary());
                weChatGroupService.send(alarm.formatForWeChat());
                break;
            case "P1":
                // P1级告警：短信 + 群通知
                smsService.send(alarm.getOnCallPerson(), alarm.getSummary());
                weChatGroupService.send(alarm.formatForWeChat());
                break;
            default:
                // 普通告警：仅群通知
                weChatGroupService.send(alarm.formatForWeChat());
        }
        return ResponseEntity.ok("ok");
    }
}

@Data
public class ClsAlarmMessage {
    private String alarmName;
    private String alarmTime;
    private String logTopic;
    private String level;
    private String summary;
    private String detail;
    private String onCallPerson;
    private Integer alarmValue;
    private String alarmCondition;
}
```

### 9.5.4 使用场景

- **P0 故障实时告警**：支付成功率低于99%时，电话通知值班工程师。
- **错误趋势告警**：某接口的ERROR日志环比增长超过100%时触发告警。
- **日志量异常告警**：某服务的日志量突然降为0（可能服务宕机），触发告警。
- **安全告警**：检测到SQL注入、XSS攻击等安全相关日志时立即告警。
- **容量告警**：磁盘使用率超过90%的日志出现时触发告警。

### 9.5.5 潜在风险与注意事项

- **告警风暴**：一次大规模故障可能触发大量告警。建议设置合理的收敛周期（至少5分钟），并配置告警聚合策略。
- **告警疲劳**：过多的低质量告警会导致"狼来了"效应。建议对非关键告警设置更长的评估周期和更高的触发阈值。
- **通知延迟**：CLS告警的最小执行周期为1分钟，加上日志采集和索引的延迟，从日志产生到告警通知可能有2-3分钟的延迟。P0级故障建议配合其他监控手段（如Prometheus + AlertManager）。
- **Webhook 可靠性**：Webhook通知依赖接收端服务的可用性。如果接收端宕机，告警通知会丢失。关键告警建议同时配置短信或电话作为备份渠道。

### 9.5.6 本章小结

CLS告警体系覆盖了从内容匹配到SQL指标的全场景告警需求。告警配置的关键在于合理设置触发阈值、收敛周期和通知渠道的分级策略。P0级故障应使用电话通知，日常告警使用微信或Webhook。告警降噪比告警配置本身更重要——一个告警泛滥的系统比没有告警的系统更危险。

---

## 9.6 潜在风险与最佳实践

### 9.6.1 日志丢失风险

**风险分析**

日志丢失的可能原因：

1. **LogListener 崩溃**：LogListener进程异常退出，崩溃期间的日志无法采集
2. **网络故障**：LogListener到CLS服务端的网络中断，缓冲区满后开始丢弃日志
3. **磁盘故障**：日志文件所在磁盘损坏，日志数据永久丢失
4. **日志轮转竞争**：日志轮转速度超过LogListener读取速度，部分日志在读取前被删除
5. **CLS服务端限流**：日志上报速率超过CLS主题的写入配额，服务端返回限流错误

**应对措施**

```yaml
# LogConfig 中的缓冲区配置
spec:
  clsConfig:
    shipper:
      # 增大内存缓冲区
      memPercent: 30
      # 降低上报频率，减少网络抖动影响
      sendInterval: 3
      # 启用本地磁盘缓存（LogListener高级配置）
      localCache: true
      localCacheSize: 1024
```

```java
// Java端的日志保护策略
// 1. 使用双写策略：同时写本地文件和CLS
// 2. 使用可靠日志库：确保日志写入本地文件成功后再返回

// 3. 健康检查：定期检查LogListener进程状态
@Component
public class LogHealthChecker {
    private static final Logger log = LoggerFactory.getLogger(LogHealthChecker.class);

    @Scheduled(fixedRate = 30000)
    public void checkLogFile() {
        File logFile = new File("/data/logs/app/app.log");
        if (logFile.exists()) {
            long lastModified = logFile.lastModified();
            long now = System.currentTimeMillis();
            // 如果日志文件超过5分钟未更新，记录告警
            if (now - lastModified > 300_000) {
                log.warn("日志文件超过5分钟未更新，可能LogListener异常");
            }
        }
    }
}
```

### 9.6.2 采集性能开销

**风险分析**

LogListener的资源开销主要来自：

- **CPU**：日志解析（JSON解析、正则匹配）、数据压缩、加密传输
- **内存**：日志缓冲区、索引缓存、网络连接池
- **磁盘I/O**：读取日志文件、写入本地缓存
- **网络**：日志数据传输

**性能基准参考**

| 日志量 | CPU（单核） | 内存 | 网络带宽 |
|--------|-----------|------|---------|
| 1 MB/s | 5-10% | 50-100 MB | ~1.5 MB/s |
| 5 MB/s | 15-25% | 150-300 MB | ~7 MB/s |
| 10 MB/s | 30-40% | 300-500 MB | ~14 MB/s |

**优化措施**

```yaml
# LogListener 资源限制
resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

```yaml
# 采集过滤：只采集需要的日志
spec:
  clsConfig:
    extractRule:
      filter:
        # 只采集WARN及以上级别
        - key: level
          type: include
          value: WARN|ERROR
        # 排除健康检查日志
        - key: logger
          type: exclude
          value: com.myapp.health
```

```java
// Java端减少日志量的最佳实践
// 1. 避免在热点路径打印DEBUG日志
// 2. 使用参数化日志而非字符串拼接
// 错误：每次都会执行字符串拼接
log.debug("orderId=" + orderId + ", amount=" + amount);

// 正确：使用参数化，日志级别不满足时不执行拼接
log.debug("orderId={}, amount={}", orderId, amount);

// 3. 高频日志采样
@Aspect
@Component
public class LogSamplingAspect {
    private final Random random = new Random();
    private static final double SAMPLE_RATE = 0.1; // 10%采样

    @Around("@annotation(LogSampled)")
    public Object sampleLog(ProceedingJoinPoint joinPoint) throws Throwable {
        if (random.nextDouble() < SAMPLE_RATE) {
            return joinPoint.proceed();
        }
        return joinPoint.proceed();
    }
}
```

### 9.6.3 存储成本控制

**成本构成**

CLS的存储费用由以下部分组成：

| 费用项 | 计费方式 | 典型占比 |
|--------|---------|---------|
| 存储空间 | 每GB/天 | 30% |
| 索引存储 | 每GB/天（索引比原始数据大2-3倍） | 40% |
| 读写流量 | 每GB | 15% |
| SQL分析 | 每次查询扫描的数据量 | 10% |
| 数据导出 | 每GB | 5% |

**成本优化策略**

```yaml
# 1. 设置日志主题的存储周期
# CLS控制台配置：日志主题 -> 存储配置
# 建议：业务日志30天，审计日志180天，访问日志7天

# 2. 关闭不需要的字段索引
# 不需要检索的字段关闭索引，仅保留原始日志内容
spec:
  clsConfig:
    logType: json_log
    extractRule:
      # 只对以下字段开启索引
      indexedFields:
        - traceId
        - level
        - logger
        - duration
        - error.type
      # 以下字段不建索引（节省索引存储成本）
      # - message（如果不需要全文检索）
```

```java
// 3. 日志分级存储策略
// 不同级别的日志写入不同的CLS主题，设置不同的存储周期
public enum LogStoragePolicy {
    // 业务关键日志：30天
    BUSINESS("business-log", 30),
    // 访问日志：7天
    ACCESS("access-log", 7),
    // 审计日志：180天
    AUDIT("audit-log", 180),
    // 调试日志：3天
    DEBUG("debug-log", 3);

    private final String topicId;
    private final int retentionDays;
}
```

### 9.6.4 整体最佳实践清单

| 类别 | 最佳实践 | 优先级 |
|------|---------|--------|
| 采集 | 使用DaemonSet模式，避免Sidecar的资源浪费 | P0 |
| 采集 | 为LogListener设置CPU/Memory limits | P0 |
| 采集 | 配置多行日志聚合的beginningRegex | P0 |
| 结构化 | 所有服务统一JSON日志格式 | P0 |
| 结构化 | 全链路传递traceId | P0 |
| 检索 | 只对必要字段开启索引 | P1 |
| 检索 | 关键接口添加duration字段 | P1 |
| 告警 | P0级告警配置电话通知 | P0 |
| 告警 | 设置告警收敛周期，避免告警风暴 | P1 |
| 成本 | 不同日志设置不同的存储周期 | P1 |
| 成本 | 使用异步日志减少对业务的影响 | P1 |
| 运维 | 定期检查LogListener健康状态 | P2 |

### 9.6.5 本章小结

CLS日志系统的三大风险——日志丢失、性能开销、存储成本——需要在架构设计阶段就纳入考量。日志丢失通过缓冲区配置和本地缓存缓解；性能开销通过资源限制和采集过滤控制；存储成本通过分级存储和索引策略优化。没有银弹，只有根据业务场景做合理的取舍。

---

## 9.7 全章总结

本章从五个维度系统性地讲解了腾讯云CLS日志采集与分析体系：

1. **采集架构**：DaemonSet + LogConfig CRD是生产环境的标准方案，多行日志聚合通过行首正则实现，需要根据日志格式精确配置。

2. **日志结构化**：JSON格式 + traceId + MDC是全链路日志关联的基础。Logback的JsonLayout可以零改造输出结构化日志，traceId通过HTTP Header和消息Header跨服务传播。

3. **检索分析**：全文检索适合快速排查，字段检索适合精确过滤，SQL分析适合统计聚合。CLS的SQL引擎支持百分位计算、时间序列聚合等高级分析能力。

4. **告警体系**：内容告警和指标告警覆盖了从关键词匹配到数值阈值的全场景。告警收敛和分级通知是避免告警疲劳的关键。

5. **风险控制**：日志丢失、性能开销、存储成本是CLS使用的三大风险，需要通过缓冲区配置、资源限制、索引策略等手段主动管理。

CLS本身只是一个工具，真正决定日志体系质量的是规范和执行。建议团队制定统一的日志规范文档，并在代码Review中检查日志格式的合规性。一个结构良好、检索高效、告警精准的日志体系，是保障微服务系统可靠运行的重要基石。
