# 第33章 架构师必备技能

架构师不是一个单纯的"高级工程师"角色。它是从"建造者"到"设计者"的转变——思维方式、关注重点、工作方法都发生了根本性的变化。本章系统化定义架构师的核心能力模型。

---

## 33.1 技术广度

### 33.1.1 T 型人才模型

```
架构师的 T 型能力结构：

              广度：了解足够多的领域（横杠）
  ┌─────────────────────────────────────────────┐
  │ 网络  安全  数据库  缓存  消息队列  容器     │
  │ 协议  加密  SQL优化  Redis  Kafka    K8s    │
  │ DNS   OAuth 分库分表  Memcached RabbitMQ Docker │
  │ CDN   JWT   事务    一致性   流处理   CI/CD  │
  ├─────────────────────────────────────────────┤
  │                                             │
  │  深度：在 1-2 个领域达到专家级（竖杠）       │
  │  Java 生态 + 分布式系统架构                 │
  │  源码级理解 Spring/Netty/Kafka              │
  │  能从 JVM 层面分析性能问题                  │
  │                                             │
  └─────────────────────────────────────────────┘

高级工程师：竖杠足够深，横杠可以窄
架构师：横杠必须足够宽，竖杠至少在一处很深
```

### 33.1.2 架构师的知识地图

```
架构师需要覆盖的技术领域：

1. 编程语言与运行时（2-3 门语言的深度使用经验）
   - JVM 生态：Java / Kotlin / Scala
   - JVM 内存模型、GC 算法、类加载机制、字节码
   - 至少了解一门脚本语言（Python/Go）用于工具开发

2. 框架与中间件（不是"会用"，而是"理解原理"）
   - Spring 全家桶：IoC/AOP/MVC/Data/Cloud/Boot
   - 消息队列：Kafka / RabbitMQ / RocketMQ 的内部机制
   - 缓存：Redis 源码级理解（数据结构、持久化、集群、哨兵）
   - RPC：Netty 为基础的网络编程、gRPC/Thrift/Dubbo

3. 数据存储（SQL + NoSQL + NewSQL）
   - MySQL/PostgreSQL：索引、锁、事务隔离级别、SQL 优化
   - Elasticsearch：倒排索引、聚合分析
   - 列式存储 / 时序数据库的基本原理

4. 基础设施与运维
   - Linux 内核基础（进程、内存、网络、文件系统）
   - 容器化：Docker / Kubernetes（理解调度、网络、存储）
   - 可观测性：Metrics + Logging + Tracing 三支柱
   - CI/CD：Jenkins / GitLab CI / ArgoCD / Tekton

5. 安全（至少到达"能设计和审查安全方案"的程度）
   - OWASP Top 10
   - 认证：OAuth2 / OIDC / SAML
   - 传输安全：TLS/mTLS、证书管理
   - 常见的攻击方式和防御手段

6. 网络与协议
   - TCP/IP、HTTP/2、HTTP/3(QUIC)
   - gRPC / Protocol Buffers
   - DNS、负载均衡（L4 vs L7）
```

### 33.1.3 广度的价值：做正确的技术选择

```
案例：为什么技术广度比深度对架构师更重要？

场景：需要选择一个消息系统

窄视角（只有 Kafka 经验）：
  "用 Kafka，Kafka 是最好的"
  问题：Kafka 需要 ZooKeeper/KRaft，运维成本高
        对于只有 3 个消费者、每天几千条消息的场景
        → Kafka 是过度设计

广视角（了解多种 MQ）：
  分析需求：
    - 消息量：5000 条/天 → 极低
    - 延迟要求：< 1s → 宽松
    - 消费者数：3 个 → 简单路由
    - 运维团队：只有 2 个人 → 需要低维护成本
  → 推荐：RabbitMQ（简单、稳定、运维成本低）
  → "如果未来消息量增长 > 100 倍，再考虑迁移到 Kafka"
```

---

## 33.2 系统设计能力

### 33.2.1 系统设计的核心思维

```
系统设计不是"画架构图"，而是：

1. 需求分析能力
   - 从模糊的"我们想做一个 XXX"中提取功能性需求
   - 发现隐藏的非功能性需求（"这个系统需要跑 10 年"）
   - 区分 Must Have / Should Have / Nice to Have

2. 抽象能力
   - 识别系统中的"不变"部分和"变化"部分
   - 为变化的部分设计扩展点（接口、策略模式、事件系统）
   - 防止过度抽象——"今天只有一个实现"就不需要接口

3. 权衡能力
   - 任何架构决策都有代价
   - 能清晰地说出"我们选择 X 是因为牺牲了 Y，换来了 Z"
   - 不追求完美架构，追求"在当前约束下最好的架构"

4. 预见能力
   - 基于经验和增长曲线预判未来 6-12 个月的瓶颈
   - 不是为了"将来可能需要"而过度设计
   - 而是确保架构"不阻止"未来的扩展方向
```

### 33.2.2 架构设计演练：URL 短链服务

```java
// 系统设计示例：设计一个 URL 短链服务（类似 bit.ly）

// Step 1: 需求分析
//
// 功能需求：
// - 用户输入长 URL → 返回短链
// - 用户访问短链 → 重定向到长 URL
// - 查看短链的点击量
//
// 非功能需求：
// - 短链生成延迟 < 100ms
// - 重定向延迟 < 20ms
// - 每月生成 1 亿条短链
// - 短链至少 3 年有效
// - 短链长度 7 位

// Step 2: 容量估算
// 1 亿条/月 × 36 个月 = 36 亿条短链
// 7 位短链，字符集 [a-zA-Z0-9] = 62 个字符
// 62^7 = ~3.5 万亿 —— 远超过 36 亿，足够
//
// 读/写比：假设 100:1
// 写 QPS: 1亿 / (30×24×3600) ≈ 39 QPS
// 读 QPS: 39 × 100 ≈ 3900 QPS

// Step 3: 架构设计
//
// 短链生成服务：
//   ID 生成器（Snowflake / 分布式 ID）→ Base62 编码 → 短链
//
//   为什么用 Base62 而不是随机字符串？
//     - 自增 ID → Base62 = 全局唯一（ID 本身不重复）
//     - 不需要检查"这个短链是否已经被用了"
//     - 可以基于 ID 做分片（ID % N）

// Step 4: 核心实现
@Service
public class UrlShortener {
    private static final String CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    private final SnowflakeIdGenerator idGenerator;
    private final UrlMappingRepository repository;
    private final Cache<String, String> redirectCache;  // Caffeine 本地缓存

    // 生成短链
    public String shorten(String longUrl) {
        // 检查是否已经存在（可选优化）
        String existing = repository.findByLongUrl(longUrl);
        if (existing != null) return existing;

        long id = idGenerator.nextId();
        String shortCode = base62Encode(id);

        repository.save(new UrlMapping(id, shortCode, longUrl));
        return "https://short.url/" + shortCode;
    }

    // 重定向（高并发读取路径）
    public String resolve(String shortCode) {
        // L1 缓存：本地 Caffeine（亚毫秒级）
        String longUrl = redirectCache.getIfPresent(shortCode);
        if (longUrl != null) return longUrl;

        // L2：数据库查询
        longUrl = repository.findByShortCode(shortCode);
        if (longUrl != null) {
            redirectCache.put(shortCode, longUrl);  // 回填 L1
        }

        return longUrl;  // null → 404
    }

    private String base62Encode(long num) {
        StringBuilder sb = new StringBuilder();
        while (num > 0) {
            sb.append(CHARS.charAt((int) (num % 62)));
            num /= 62;
        }
        return sb.reverse().toString();
    }
}

// Step 5: 演进方向
// - ID 生成器从单机 Snowflake 迁移到分布式 ID（Leaf/UID-Generator）
// - 本地缓存从 Caffeine 升级到 Redis（支持多实例缓存一致性）
// - 分库分表：按 shortCode 的 hash 分片
// - 引入 Bloom Filter 过滤短链不存在的请求（避免无效的 DB 查询）
```

---

## 33.3 业务理解能力

### 33.3.1 从技术视角到业务视角

```
技术视角 vs 业务视角：

技术视角（工程师思维）：
  "我们用 Kafka 做异步消息，用 Redis 做缓存，
   用 K8s 做容器编排，用 MongoDB 做文档存储..."

业务视角（架构师思维）：
  "订单系统需要支持促销期间的 10 倍峰值流量，
   用户下单后即使支付系统挂了也能稍后支付，
   核心交易数据绝对不能丢..."

区别：
  工程师解释"用什么技术"
  架构师解释"为什么这样设计能解决业务问题"
```

### 33.3.2 领域驱动设计（DDD）的架构价值

```java
// DDD 不是"又一种架构模式"，而是"让技术架构对齐业务的方式"

// 案例：电商退款系统

// 不经过 DDD（技术直接映射）：
// RefundController → RefundService → RefundRepository
// 看起来没问题——但退款的"业务规则"被淹没了

// 经过 DDD（用代码表达业务）：
// 核心领域模型
public class Refund {
    private RefundId id;
    private OrderId orderId;
    private Money amount;
    private RefundReason reason;
    private RefundStatus status;

    // 业务规则：只有"已支付"的订单才能退款
    public static Refund initiate(Order order, RefundReason reason) {
        if (!order.canBeRefunded()) {
            throw new RefundNotAllowedException(
                "订单状态 " + order.getStatus() + " 不支持退款");
        }
        return new Refund(order.getId(), order.getPaidAmount(), reason);
    }

    // 业务规则：退款金额不能超过已支付金额
    public void approve(Money approveAmount) {
        if (approveAmount.isGreaterThan(this.amount)) {
            throw new ExcessiveRefundException(approveAmount, this.amount);
        }
        this.status = RefundStatus.APPROVED;
    }
}

// 架构师的价值：与业务方对话时能"翻译"
// 业务方："这个退款审核流程太复杂了"
// 架构师分析代码后发现：Refund 类有 45 个字段，状态机有 18 个状态
// → 反馈：不是"架构不好"，而是"业务流程本身需要简化"
```

---

## 33.4 沟通协调能力

### 33.4.1 架构师的沟通场景

```
架构师的不同沟通对象和策略：

对管理层（说服和争取资源）：
  不要讲：技术细节、性能优化多少毫秒
  要讲：业务风险、ROI、对增长的影响
  示例：
    "不做微服务拆分的话，再过一个季度，所有团队的发布都会互相阻塞，
     预计每周损失 2 个发布窗口，也就是少上线 6 个功能。"

对产品经理（理解需求并管理期望）：
  不要讲：这个需求技术上做不了
  要讲：这个需求的核心目标是什么？我们可以用什么替代方案实现？
  示例：
    PM: "能不能做实时个性化推荐？"
    Arch: "实时推荐需要 Spark Streaming + 特征平台，搭建周期 3 个月。
           我们可以先用基于规则的推荐上线（1 周），同时搭建实时推荐基础。"

对开发团队（传达设计意图和培养共识）：
  不要讲：你这样做不对，应该按我说的做
  要讲：这样设计的原因是什么，如果换一种方式会有什么问题
  示例：
    "这个字段放在 Redis 而不是数据库的原因是：它的读取频率
     是每秒 5000 次，写频率是每小时 1 次。放数据库会造成不必要的负载。
     如果将来写频率增加了，我们再考虑换方案。"
```

### 33.4.2 技术决策的"解释"框架

```java
// 架构决策不只是一种技术选择，还需要能被非技术人员理解

// ADR（Architecture Decision Record）—— 记录"为什么"的模板
// 见第 34.2 节详细讨论

// 决策的解释框架：
//
// 1. 上下文：我们面临什么问题？
// 2. 选项：我们考虑了哪些方案？
// 3. 决策：我们选择了什么？
// 4. 后果：这个选择带来了什么好处和代价？

// 示例 ADR:
// ============================================
// ADR-013: 订单服务与支付服务的通信方式
//
// 状态：已采纳
// 日期：2025-03-15
//
// 上下文：
//   订单创建后需要通知支付服务发起扣款。
//   当前方案是同步 HTTP 调用，在促销峰值时支付服务响应慢导致订单服务超时。
//
// 考虑的选项：
//   1. 同步 HTTP + 重试 + 熔断
//   2. 异步消息（Kafka）
//   3. gRPC 替代 HTTP
//
// 决策：选择异步消息（Kafka）
//
// 理由：
//   - 订单创建和支付执行不需要同步完成（用户不期望下单后立即扣款）
//   - Kafka 提供消息持久化和天然的回压能力
//   - 支付服务出问题时，订单服务不受影响（消息积压在 Kafka 中）
//
// 后果：
//   - 好处：订单服务和支付服务完全解耦，各自可以独立故障
//   - 代价：增加最终一致性的复杂度，需要处理支付结果的异步通知
//   - 运维成本：需要维护 Kafka 集群
```

---

## 33.5 文档能力

### 33.5.1 架构文档的原则

```
架构文档的黄金法则：

1. 文档的最重要读者是"6 个月后的你"
   - 今天的你记得为什么这样设计
   - 6 个月后你完全不记得了
   - 文档是给"未来的你和团队"看的

2. 图表 > 文字（但图表需要文字解释）
   - 一张好的架构图胜过 2000 字
   - 但只有图没有说明 = 无法搜索、无法复现

3. 记录决策，而不是描述实现
   - 代码已经是"实现"的权威来源
   - 文档要记录"为什么"——代码里没有的信息
   - 重点：架构决策记录（ADR）

4. 保持更新或标记过期
   - 过期的文档比没有文档更危险
   - 如果无法保持更新 → 在文档顶部标注"最后更新日期"和大字警告
```

### 33.5.2 必备的架构图

```
四种最基本的架构图（C4 模型）：

1. 系统上下文图（System Context）
   - 系统在业务环境中的位置
   - 与哪些外部系统交互
   - 用户是谁
   核心：让非技术人员也能看懂系统边界

2. 容器图（Container Diagram）
   - 系统由哪些"容器"组成（服务、数据库、消息队列）
   - 容器之间的通信方式（HTTP/gRPC/消息队列）
   核心：回答"这个系统有哪些可部署的单元"

3. 组件图（Component Diagram）
   - 单个容器内部的组件结构
   - 组件的职责和接口
   核心：回答"这个服务内部是怎么组织的"

4. 代码图（Code Diagram）
   - 关键类/接口的设计
   - 只在需要时才画（大部分代码图会快速过时）
   核心：只在代码评审和关键设计讨论中使用

工具建议：PlantUML / Mermaid / Draw.io
核心原则：图要能版本控制（PlantUML 和 Mermaid 都是纯文本格式）
```

---

## 33.6 本章小结

架构师的能力模型是一个五角星：**技术广度 + 系统设计 + 业务理解 + 沟通协调 + 文档能力**。

这五项能力的核心共同点是：**从"做事"到"做决策"的转变。** 架构师不再只是写最好的代码，而是做出对整个系统最好的决策，并让团队理解和执行这些决策。

最重要的能力不是任何一项具体的技术——而是**在不确定的情况下做出合理决策，并为这个决策负责。**
