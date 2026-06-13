# 第 4 章 BFF 网关：服务聚合与高可用设计

---

## 4.1 使用场景

### 微服务架构下的 BFF 层

BFF（Backend For Frontend）是一种在微服务架构中广泛采用的架构模式，其核心理念是为每一种前端客户端（Web、iOS、Android、小程序）提供一个专属的后端服务层。在传统的微服务架构中，前端团队通常需要调用多个下游微服务来拼装一个页面所需的数据。这种方式存在几个明显的痛点：

- **客户端网络开销大**：浏览器或手机需要发起 3-5 次 HTTP 请求才能渲染一个页面，在弱网环境下延迟被成倍放大。
- **数据结构耦合**：下游微服务的数据模型通常面向通用业务设计（如订单服务返回完整的订单对象），而非针对某一个前端界面的具体需求。前端需要自己过滤和裁剪数据，增加了客户端逻辑的复杂性。
- **协议差异**：部分内部微服务使用 gRPC 或 Thrift 等二进制协议，前端无法直接调用，需要 BFF 层进行协议转换。
- **安全与鉴权逻辑分散**：每个微服务都需要重复处理 Token 校验、权限判断等逻辑，维护成本高。

BFF 层位于客户端与下游微服务之间，承担了**协议转换**、**数据聚合**、**字段裁剪**和**安全拦截**等职责，使得前端可以只关心"我需要什么数据"，而不用关心"数据从哪里来"。

### 多端 API 定制

不同终端对同一业务场景的需求存在显著差异：

| 终端   | 关注点                     | 数据需求                                     |
|--------|----------------------------|----------------------------------------------|
| Web    | 完整信息展示、SEO 友好     | 用户详情 + 订单列表 + 评论                    |
| iOS    | 流畅交互、流量优化         | 用户概要 + 最近 3 笔订单 + 缓存控制           |
| Android| 同等流畅 + 离线能力        | 用户概要 + 订单摘要 + 离线可用的精简数据      |

BFF 架构允许每个终端拥有自己专属的聚合端点（如 `/web/users/:id/dashboard` 和 `/app/users/:id/summary`），避免了一个通用 API 被迫同时满足所有端的需求而变得臃肿。

### 数据聚合与裁剪

本章项目（`src/app.ts`）展示了一个典型的 BFF 聚合场景：客户端请求 `/users/:id/aggregated`，BFF 层并发调用下游用户服务（获取用户基本信息）和订单服务（获取用户订单列表），在服务端聚合两个结果的字段，计算出 `orderCount` 和 `totalAmount` 等派生指标，再返回给客户端。这样客户端只需要一次请求，就能获得完整的 "用户+订单" 视图。

---

## 4.2 实现原理

### Fastify 插件系统

本章项目基于 **Fastify** 构建，核心选择理由如下：

- **高性能**：Fastify 的 JSON 序列化基于 `fast-json-stringify` 库的 schema 编译优化，在吞吐量和延迟上明显优于 Express。
- **插件体系**：Fastify 的插件继承自封装作用域（encapsulation），每个插件拥有独立的上下文，避免了全局污染。生产级 BFF 通常会按功能拆分为多个插件：`auth-plugin`（鉴权）、`rate-limit-plugin`（限流）、`aggregation-plugin`（聚合路由）等。
- **请求校验**：Fastify 原生支持 JSON Schema 校验请求体和参数，类型安全且零运行时开销。

在 `src/app.ts` 中，我们通过 `app.get()` 声明了两个路由——`/health` 和 `/users/:id/aggregated`，结构清晰且易于扩展。

### undici 连接池

**undici** 是 Node.js 官方团队维护的新一代 HTTP 客户端，针对高并发场景做了大量优化：

- **连接池复用**：`Pool` 对象维护到下游服务的一组 TCP 连接，避免每个请求都经历 TCP 三次握手和 TLS 协商的开销。
- **管道化（pipelining）**：支持 HTTP/1.1 管道化请求，在同一个 TCP 连接上并行发送多个请求，进一步提升吞吐量。
- **严格的超时控制**：可配置 `requestTimeout` 参数，防止请求被慢下游无限期阻塞。

项目中的连接池配置 `connections: 100, pipelining: 10, requestTimeout: 3000` 表示最多维持 100 个 TCP 连接，每个连接最多允许 10 个未完成的管道化请求，单个请求超时 3 秒。

### opossum 断路器

**opossum** 是 Node.js 生态中最流行的断路器库，实现了经典的 **Circuit Breaker** 三态模式：

```
Closed ————(失败率 > 阈值)————→ Open
   ↑                                 ↓
   ←——(resetTimeout 后自动进入)—— Half-Open
   ←——(Half-Open 测试请求成功)——————
```

在 `src/app.ts` 中，断路器包装了 `fetchAggregated` 聚合函数，配置 `timeout: 2000`（单次调用超时 2 秒）、`errorThresholdPercentage: 50`（失败率超过 50% 时打开断路器）、`resetTimeout: 30000`（30 秒后进入 Half-Open 尝试恢复）。

当下游服务响应变慢或不可用时，断路器能快速熔断，让 BFF 返回 503 而不是在等待中耗尽资源。

### GraphQL DataLoader 概念

虽然本章项目基于 RESTful 设计，但需要提及 GraphQL DataLoader 作为一种更灵活的替代方案。DataLoader 的核心思想是**请求去重与批量合并**：

- 在一个请求上下文中，对同一实体的多次查询会被合并为一次批量查询。
- 适用于存在 N+1 查询问题的场景（如先查用户列表，再对每个用户查订单）。

在 RESTful BFF 中，我们也可以借鉴这个思路——使用合并窗口机制将短时间内对同一下游接口的重复请求合并为一次，减少下游压力（详见 4.4 节）。

---

## 4.3 潜在风险

### 雪崩效应

这是 BFF 层最容易遇到的生产级事故，触发链路如下：

```
1. 下游某个微服务因 CPU 飙高或死锁导致响应变慢（响应时间从 50ms→5s）
2. BFF 层连接池中的连接被慢请求持续占用，无法回收
3. 新请求到达 BFF 后找不到可用连接，也加入等待队列
4. 连接池队列膨胀 → BFF 自身线程被阻塞 → 所有 API 端点（包括不需要调用下游的端点）都无法响应
5. 前端 WebSocket 心跳超时或页面白屏，用户侧报障
```

**关键点**：雪崩不是一蹴而就的，而是从"某个下游变慢"到"整体不可用"的级联扩散过程。Node.js 的单线程模型意味着一旦事件循环被阻塞，整个进程的吞吐量都会降为零。

### 内存泄漏

BFF 层的内存泄漏常见于以下模式：

- **请求级别闭包缓存**：在请求处理函数中创建了闭包或对象，却意外将其挂载到全局变量或长期存在的 Map 上，导致老生代内存持续增长、GC 无法回收。
- **未被清理的定时器**：`setTimeout` 或 `setInterval` 在请求处理后未被清除，回调中持有对大对象的引用。
- **连接池泄漏**：如果 HTTP 请求的响应体未被完全消费（`body.json()` 失败但未处理），undici 的内部缓冲区会保留引用，导致连接池对象无法释放。

在生产环境中，建议对 Node.js 进程设置 `--max-old-space-size` 限制，并结合 `heapdump` 工具定期抓取堆快照进行对比分析。

---

## 4.4 优化策略

### 严格超时

高并发 BFF 的三大超时维度，缺一不可：

| 超时维度     | 配置项                  | 说明                                                                              |
|--------------|------------------------|-----------------------------------------------------------------------------------|
| 连接超时     | `connectTimeout`       | 新建 TCP 连接的最大等待时间，排除网络不可达或防火墙丢包导致的长时间阻塞            |
| 空闲超时     | `idleTimeout`          | 连接池中空闲连接的存活时间，超时后关闭释放资源，防止"僵尸连接"堆积                |
| 请求超时     | `requestTimeout`       | 单个 HTTP 请求从发起到收到完整响应的最大等待时间，防止慢下游拖垮连接池            |

项目中使用 `requestTimeout: 3000` 确保任何超过 3 秒未完成的下游请求都被强制终止，这是防雪崩的第一道防线。

### 断路器三步态

断路器的**滑动窗口算法**是决定其效果的关键，opossum 的实现基于以下参数：

- **`timeout`**：断路器认为一次调用"超时"的阈值，超时计入失败。
- **`errorThresholdPercentage`**：滑动窗口中的失败率阈值，超过则从 Closed 转入 Open。
- **`resetTimeout`**：在 Open 状态下等待多长时间后尝试恢复（Half-Open）。
- **`volumeThreshold`**：滑动窗口需要积累的最小请求数才开始计算失败率，防止在流量很低时误触发。

**最佳实践**：`timeout` 应略低于连接池的 `requestTimeout`，让断路器在下游超时前就介入熔断；`resetTimeout` 不宜过短（建议 30-60 秒），避免在半开状态下频繁尝试造成已恢复的下游再次雪崩。

### 请求合并

在每秒数千次请求的高并发场景下，下游微服务可能在同一时刻收到大量查询同一用户数据的请求。请求合并策略可以显著降低下游压力：

```typescript
// 请求合并器示例（50ms 窗口内合并相同参数的请求）
const mergeWindow = new Map<string, Promise<any>>();

async function mergeRequest(key: string, fetcher: () => Promise<any>): Promise<any> {
  if (mergeWindow.has(key)) {
    return mergeWindow.get(key)!;
  }
  const promise = fetcher().finally(() => {
    // 延迟删除，避免后续 50ms 内的重复请求再开新连接
    setTimeout(() => mergeWindow.delete(key), 50);
  });
  mergeWindow.set(key, promise);
  return promise;
}
```

这个模式在 BFF 中特别适用于以下场景：

- **热点用户数据**：热门博主或大促商品的访问短期内集中在少数实体上。
- **Webhook / 轮询请求**：多个客户端页面同时轮询同一接口。
- **批量初始化**：服务重启后大量请求涌入需要加载相同的配置数据。

---

## 4.5 典型问题处理

### 断路器频繁 Open 的根因分析

如果断路器在正常运行期间反复 Open，排查思路如下：

1. **检查下游微服务的 P99 延迟**：如果下游普遍变慢（如从 50ms 恶化到 300ms），说明断路器是正确触发了，但问题根源在下游。此时建议优化下游服务，或适当调高 `volumeThreshold` 和 `errorThresholdPercentage`。
2. **排查是否因为客户端重试造成虚假失败**：如果前端在收到 503 后立即重试，而断路器刚进入 Half-Open 就被大量重试请求冲垮，会导致断路器在 Open 和 Half-Open 之间振荡。解决方案是在 BFF 层增加基于请求 IP 或 Session 的重试限流。
3. **检查断路器的滑动窗口配置**：如果 `volumeThreshold` 设置过低，少量失败的请求就可能触发熔断。在生产流量下建议设置为 10-20。

### 连接池耗尽后快速恢复

当 undici 连接池因下游慢请求被耗尽后，即使下游恢复正常，连接池也需要一定时间重建。快速恢复策略包括：

- **被动恢复**：依赖 undici 连接池的重建机制，空闲连接超时后自动关闭，新请求触发新连接建立。
- **主动恢复**：在下游恢复后，BFF 通过健康检查可以立即重置连接池（销毁旧连接、建立新连接），加速恢复过程：

```typescript
// 连接池快速重置
async function resetPool() {
  await downstreamPool.close();       // 关闭所有现有连接
  downstreamPool = new Pool(...);     // 创建新的连接池
}
```

- **预热策略**：服务启动后，在接收真实流量之前，先发送若干探针请求到下游服务，确保连接池处于就绪状态。

---

## 4.6 开发者技能

### Fastify 生命周期

理解 Fastify 的请求生命周期有助于在正确的阶段插入鉴权、日志、速率限制等中间件：

```
Request arrives
    │
    ▼
onRequest        ← 最早期钩子，此时尚未解析 body
    │
    ▼
preParsing       ← body 已接收但未解析
    │
    ▼
preValidation    ← 路由匹配之前校验 schema
    │
    ▼
preHandler       ← 路由处理函数执行前（常用做鉴权）
    │
    ▼
handler          ← 路由处理函数（业务逻辑）
    │
    ▼
preSerialization ← 响应体序列化前
    │
    ▼
onSend           ← 响应已序列化，即将发送
    │
    ▼
onResponse       ← 响应已发送（适合日志记录）
    │
    ▼
Response sent
```

在生产 BFF 中，常见的钩子使用模式：
- `preHandler`：Token 解析与权限校验。
- `onResponse`：结构化日志输出（请求耗时、状态码、下游调用次数）。
- `onRequest` + `preHandler`：记录慢请求，当请求总耗时超过阈值时输出告警日志。

### undici Pool vs Client

undici 的 `Pool` 和 `Client` 是两个核心类，它们的区别和使用场景如下：

| 特性            | Pool                                  | Client                              |
|-----------------|---------------------------------------|-------------------------------------|
| 连接管理        | 管理多个 Client，提供连接池复用       | 管理单个 TCP 连接，无复用           |
| 适用场景        | 生产环境 BFF，需要高并发连接复用       | 一次性请求或连接数极少的场景         |
| 默认行为        | 自动分配请求到空闲 Client              | 所有请求共享一个连接                 |
| 管道化支持      | 基于每个 Client 独立配置               | 支持 pipelining 配置                 |
| 错误隔离        | 某个 Client 出错不会影响其他连接       | 连接出错会影响所有排队的请求          |

**最佳实践**：在 BFF 层始终使用 `Pool`。它为每个后续服务创建一个 Pool 实例，每个 Pool 内部维护多个 Client，实现连接复用与自动伸缩。

### 断路器的滑动窗口算法

opossum 的滑动窗口基于**时间桶（time-bucket）**实现：

- 将滑动窗口（默认 10 秒）划分为若干时间桶（每个桶约 1 秒）。
- 每个桶内统计成功、失败、超时的请求计数。
- 当需要计算失败率时，聚合当前时刻之前所有有效桶的统计数据。
- 每过一个桶的时间间隔，最早的桶被丢弃，新桶被创建。

这种设计的好处是：
- **内存友好**：只需维护有限数量的桶，不存储每个请求的独立记录。
- **计算高效**：失败率计算是 O(n) 级别的桶聚合，而非 O(N) 级别的逐请求遍历。
- **时效性好**：旧的请求数据会自动过期，不会被无限期保留影响判断。

---

## 4.7 示例代码

本项目的核心代码位于 `src/app.ts`，以下是关键结构说明：

### 连接池配置

```typescript
const downstreamPool = new Pool('http://localhost:4000', {
  connections: 100,     // 最大连接数
  pipelining: 10,       // 管道化请求数
  requestTimeout: 3000, // 请求超时 3 秒
});
```

配置项 `pipelining: 10` 允许每个连接在不等待响应的前提下发送最多 10 个请求。这是提升 HTTP/1.1 吞吐量的关键手段，但前提是下游服务必须支持管道化（大多数现代 HTTP 服务器都支持）。

### 断路器包装

```typescript
const breaker = new CircuitBreaker(fetchAggregated, {
  timeout: 2000,                   // 执行超时 2 秒
  errorThresholdPercentage: 50,    // 失败率超过 50% 熔断
  resetTimeout: 30000,             // 30 秒后尝试恢复
});

breaker.fallback((userId: string) => {
  return Promise.reject(new Error('Service temporarily unavailable'));
});
```

`fallback` 函数定义了断路器处于 Open 状态时的降级行为。在更复杂的场景中，fallback 可以从本地缓存返回过期的数据，而不是直接返回错误，以提供更优雅的降级体验。

### 聚合端点

```typescript
app.get<{ Params: { id: string } }>('/users/:id/aggregated', async (request, reply) => {
  try {
    const result = await breaker.fire(request.params.id);
    return result;
  } catch (err) {
    // ... 错误处理与状态码选择
  }
});
```

`breaker.fire()` 是断路器的执行入口，如果当前状态为 Closed 或 Half-Open，则执行业务函数；如果为 Open，则直接调用 fallback 返回 503。

完整的类型定义请参考 `src/types.ts`，其中定义了 `User`、`Order` 和 `AggregatedUserResponse` 三个接口，用于保证聚合返回体的类型安全。

### 测试代码

本章配套的单元测试位于 `tests/gateway.test.ts`，使用 Fastify 的 `app.inject()` 方法模拟 HTTP 请求，无需启动真实服务器即可验证路由行为。关键测试点包括：

- `/health` 端点返回 200 和 `{ status: 'ok' }`。
- 下游不可达时断路器返回 502 或 503。
- OPTIONS 请求验证正确的 CORS 响应状态码。

---

## 4.8 Docker Compose

本章项目通过 Docker Compose 提供了一个完整的本地运行环境，文件位于 `docker-compose.yml`。

### 服务架构

Compose 文件中定义了两个服务：

```
┌──────────┐     HTTP     ┌──────────────┐
│  Gateway  │ ──────────▶ │  Downstream  │
│ (port 3000)│            │ (port 8080)  │
└──────────┘              └──────────────┘
      │                          │
      │                     Node.js 原生
      │                     http.createServer
      │                     模拟微服务
      ▼
  Fastify + undici
  + opossum 断路器
```

### Gateway 服务

- 读取 `Dockerfile` 构建多阶段镜像，先编译 TypeScript，再以最小运行镜像启动。
- 环境变量 `NODE_ENV=production` 抑制测试相关的启动行为。
- 暴露 3000 端口。

### Downstream 服务

- 基于 `node:20-alpine` 镜像，使用 Node.js 原生 HTTP 模块启动一个极简的 mock 服务。
- 三个关键路径：
  - `/users/:id` —— 返回模拟用户数据（id、name、email）。
  - `/users/:id/orders` —— 返回模拟订单数组（单条订单，金额 99.99）。
  - `/users/slow/*` —— 模拟慢响应，延迟 5 秒返回（用于测试断路器和超时）。
- 暴露端口 8080，在 Compose 网络中被映射到宿主机 8081 方便调试。

### 实验方法

启动容器后，可以使用 curl 模拟中断与恢复场景：

```bash
# 正常请求
curl http://localhost:3000/users/1/aggregated

# 慢响应请求（触发断路器）
curl http://localhost:3000/users/slow/aggregated

# 健康检查
curl http://localhost:3000/health
```

慢响应请求会触发下游的 5 秒延迟，超过断路器配置的 2 秒超时，连续请求会使断路器进入 Open 状态。此时所有聚合请求直接返回 503，下游恢复正常后 30 秒内断路器自动尝试恢复。

---

## 小结

本章围绕 BFF 网关这一微服务架构中的关键组件，从使用场景、实现原理、潜在风险到优化策略进行了系统性讲解。通过本章配套的项目代码（Fastify + undici + opossum），读者可以亲手搭建一个具备数据聚合、断路器熔断和容器化部署能力的生产级 BFF 服务。

关键要点回顾：
- **BFF 的核心价值**：为不同终端提供定制化数据聚合，减少客户端网络开销。
- **连接池管理**：严格超时是防雪崩的第一道防线，连接池配置需要根据下游性能和流量特点反复调优。
- **断路器**：滑动窗口算法决定了断路器的灵敏度和稳定性，错误阈值和恢复时间需按实际流量模式设置。
- **容器化部署**：Docker 多阶段构建 + Docker Compose 提供了一键可复现的本地开发与测试环境。