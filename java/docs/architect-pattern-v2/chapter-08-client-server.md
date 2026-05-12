# 第8章 客户端-服务器模式（Client-Server Pattern）

客户端-服务器模式是分布式系统最基础、最经典的交互模式。尽管第5章已将"两层架构"作为Client-Server的实现进行讨论，但Client-Server作为一种架构**模式**，其内涵远不止于"两层"。本章从模式角度系统阐述客户端-服务器架构的设计空间。

---

## 8.1 解决的问题与应用场景

### 8.1.1 核心问题

客户端-服务器模式解决的核心问题是：**如何让多个消费者安全、高效地共享一个集中式资源的访问？**

这里的关键词是"集中式资源"——它可以是数据库、文件服务器、打印服务、计算集群，或任何"多个消费者需要共享但只有一个权威来源"的东西。客户端-服务器模式通过定义清晰的主从角色来解决这个问题：服务器是权威来源（Authority），客户端是发请求的消费者（Consumer）。

### 8.1.2 应用场景

| 场景 | 服务器角色 | 客户端角色 |
|------|-----------|-----------|
| **Web 应用** | HTTP 服务器（Nginx/Tomcat） | 浏览器 |
| **数据库系统** | MySQL/PostgreSQL 实例 | JDBC 客户端/应用 |
| **文件服务** | NAS/S3/MinIO | 文件上传/下载客户端 |
| **RPC 调用** | gRPC/Dubbo 服务端 | 服务消费方 |
| **消息服务** | Kafka/RabbitMQ Broker | Producer/Consumer |

---

## 8.2 实现原理

### 8.2.1 基本交互模型

```
┌──────────┐   Request    ┌──────────┐
│  客户端   │ ───────────→ │  服务器   │
│          │              │          │
│ 发起请求  │ ←─────────── │ 处理请求  │
│ 等待响应  │   Response   │ 返回结果  │
└──────────┘              └──────────┘

核心特征：
1. 客户端主动，服务器被动（服务器不能主动推送给客户端，除非通过长连接/WebSocket）
2. 服务器是"权威源"——客户端不拥有数据，只请求数据
3. 一个服务器服务多个客户端
4. 客户端之间不直接通信（通过服务器中转）
```

### 8.2.2 Java 实现

```java
// 服务端：Spring Boot REST API
@RestController
@RequestMapping("/api/files")
public class FileServer {

    private final FileStorageService storageService;

    @GetMapping("/{fileId}")
    public ResponseEntity<Resource> download(@PathVariable String fileId) {
        FileResource file = storageService.getFile(fileId);

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(file.getContentType()))
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + file.getFileName() + "\"")
            .body(new ByteArrayResource(file.getContent()));
    }

    @PostMapping
    public ResponseEntity<FileMetadata> upload(
            @RequestParam("file") MultipartFile file) {
        FileMetadata metadata = storageService.store(file);
        return ResponseEntity.status(HttpStatus.CREATED).body(metadata);
    }
}

// 客户端：RestTemplate / WebClient
@Service
public class FileClient {

    private final RestTemplate restTemplate;

    public byte[] downloadFile(String fileId) {
        return restTemplate.getForObject(
            "http://file-server/api/files/{fileId}",
            byte[].class, fileId);
    }

    public FileMetadata uploadFile(File file) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new FileSystemResource(file));

        HttpEntity<MultiValueMap<String, Object>> request =
            new HttpEntity<>(body, headers);

        return restTemplate.postForObject(
            "http://file-server/api/files", request, FileMetadata.class);
    }
}
```

---

## 8.3 胖客户端与瘦客户端

### 8.3.1 概念辨析

在客户端-服务器模式的语境下，"胖/瘦"描述的是**业务逻辑和状态在客户端和服务器之间的分配比例**。

```java
// 瘦客户端：客户端只有展示逻辑
// 业务逻辑、校验、状态管理全部在服务器

// 客户端（浏览器/移动端）：
// - 渲染 UI
// - 发送请求
// - 展示响应
// 服务器处理一切

// 服务器端承担所有重量级工作：
@RestController
public class ThinServerExample {
    @PostMapping("/orders")
    public OrderResult createOrder(@RequestBody OrderRequest request) {
        // 校验（服务器做）
        validateOrder(request);
        // 计价（服务器做）
        BigDecimal price = priceCalculator.calculate(request);
        // 库存检查（服务器做）
        inventoryService.checkAvailability(request);
        // 创建订单（服务器做）
        return orderService.create(request, price);
    }
    // 客户端代码量：~200 行（主要是 UI）
    // 服务器代码量：~2000 行
}

// 胖客户端：客户端包含业务逻辑
// 服务器退化为数据存储和简单的 CRUD API

// 客户端包含：
// - 订单校验规则
// - 价格计算逻辑  
// - 库存检查逻辑
// - 订单状态机

// 服务器只是一个数据门面：
@RestController
public class FatServerExample {
    @PostMapping("/orders")
    public Order saveOrder(@RequestBody Order order) {
        // 客户端已经校验过了——服务器只存
        return orderRepository.save(order);
    }
    // 客户端代码量：~1500 行（包含大量业务逻辑）
    // 服务器代码量：~300 行
}
```

### 8.3.2 选择指南

| 条件 | 倾向 |
|------|------|
| 需要离线工作 | 胖客户端 |
| 客户端平台多样（iOS/Android/Web） | 瘦客户端（逻辑统一在服务器） |
| 数据安全敏感 | 瘦客户端（逻辑在受控的服务器环境） |
| 客户端性能要求高 | 胖客户端（减少网络来回） |
| 快速迭代 | 瘦客户端（改动在服务器，不需更新所有客户端） |
| 网络不稳定 | 胖客户端（离线也能做本地校验） |

---

## 8.4 潜在风险与问题

### 8.4.1 服务器单点性能瓶颈

```java
// 问题：所有客户端的请求汇聚到一个服务器
// 并发客户增加 → 服务器过载 → 所有客户端体验下降

// 缓解1：负载均衡
// Nginx / Spring Cloud LoadBalancer / K8s Service
// 将请求分发到多个服务器实例

// 缓解2：客户端缓存
// 客户端缓存频繁读取但不常变的数据
public class CachingFileClient {
    private final Map<String, byte[]> localCache = new ConcurrentHashMap<>();

    public byte[] getFile(String fileId) {
        // 先查本地缓存
        byte[] cached = localCache.get(fileId);
        if (cached != null) {
            return cached;  // 不发送请求——服务器零负载
        }

        // 缓存 miss——请求服务器
        byte[] file = remoteClient.download(fileId);
        localCache.put(fileId, file);
        return file;
    }
}
```

### 8.4.2 网络依赖

```java
// 客户端-服务器架构的一切交互都依赖网络
// 网络不可靠 = 系统不可靠

// 客户端侧的超时和重试：
@Bean
public RestTemplate resilientRestTemplate() {
    return new RestTemplateBuilder()
        .connectTimeout(Duration.ofSeconds(2))
        .readTimeout(Duration.ofSeconds(5))
        .interceptors((request, body, execution) -> {
            // 重试逻辑（仅对幂等请求）
            for (int i = 0; i < 3; i++) {
                try {
                    return execution.execute(request, body);
                } catch (ResourceAccessException e) {
                    if (i == 2) throw e;
                    log.warn("请求失败，第{}次重试", i + 1);
                }
            }
            throw new IllegalStateException("unreachable");
        })
        .build();
}
```

### 8.4.3 并发限制

```java
// 服务器能处理的并发连接数是有限的
// 当并发请求超过服务器能力时，需要在客户端做协调

// 客户端侧的限流——保护服务器不被单一客户端打满
@Component
public class RateLimitedFileClient {
    private final RateLimiter rateLimiter = RateLimiter.create(100.0); // 每秒100个请求

    public byte[] downloadFile(String fileId) {
        // 获取令牌——如果超时则快速失败而非堆积请求
        if (!rateLimiter.tryAcquire(5, TimeUnit.SECONDS)) {
            throw new RateLimitExceededException("下载请求过多，请稍后重试");
        }
        return remoteClient.download(fileId);
    }
}
```

---

## 8.5 优化策略

### 8.5.1 负载均衡

```yaml
# Spring Cloud LoadBalancer 配置
spring:
  cloud:
    loadbalancer:
      ribbon:
        enabled: false  # 使用新的 LoadBalancer 而非 Ribbon
      instances:
        file-server:
          - localhost:8081
          - localhost:8082
          - localhost:8083
    discovery:
      client:
        simple:
          instances:
            file-server:
              - uri: http://localhost:8081
              - uri: http://localhost:8082
              - uri: http://localhost:8083
```

### 8.5.2 缓存策略

```java
// HTTP 缓存头——浏览器/CDN 自动处理
@GetMapping("/api/files/{fileId}")
public ResponseEntity<Resource> download(@PathVariable String fileId) {
    FileResource file = storageService.getFile(fileId);
    String etag = DigestUtils.md5Hex(file.getContent());

    return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS)
            .cachePublic())
        .eTag(etag)
        .lastModified(file.getLastModified())
        .body(new ByteArrayResource(file.getContent()));
    // 客户端第二次请求同一文件 → 浏览器返回304 → 服务器零负载
}
```

### 8.5.3 连接池

```java
// 客户端维护和服务器之间的连接池
// 复用连接减少 TCP 握手开销

@Bean
public CloseableHttpClient httpClient() {
    PoolingHttpClientConnectionManager cm = new PoolingHttpClientConnectionManager();
    cm.setMaxTotal(200);          // 总最大连接数
    cm.setDefaultMaxPerRoute(50); // 每个服务器的最大连接数

    RequestConfig requestConfig = RequestConfig.custom()
        .setConnectionRequestTimeout(3000)  // 从池中获取连接的超时
        .setConnectTimeout(3000)            // 建立 TCP 连接的超时
        .setSocketTimeout(5000)             // 等待数据的超时
        .build();

    return HttpClients.custom()
        .setConnectionManager(cm)
        .setDefaultRequestConfig(requestConfig)
        .setKeepAliveStrategy((response, context) -> 30_000) // 30s keep-alive
        .build();
}
```

---

## 8.6 本章小结

客户端-服务器模式是分布式架构的语法糖——几乎所有更高层的架构模式（微服务、SOA、事件驱动）在微观交互层面都在使用客户端-服务器模式。客户端和服务器之间的调用关系是分布式系统最基本的原子单元。

本章的核心要点：
1. **胖瘦客户端的选择是业务需求和运营成本的权衡**——不是技术优劣的比较
2. **服务器的可靠性直接决定系统的可靠性**——负载均衡、健康检查、缓存是三个最重要的保障手段
3. **客户端应该为网络不可靠做好防御**——超时、重试、降级、缓存是客户端的必备能力
