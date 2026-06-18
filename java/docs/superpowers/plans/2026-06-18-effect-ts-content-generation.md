# Effect-TS 深度技术参考内容生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `docs/Effect-ts/plan.md` 大纲，生成全部 15 章 + 4 附录的深度技术参考内容，每章采用统一 8 模块模板，附带 Docker Compose 配置。

**Architecture:** 每章独立为一个 Markdown 文件，Docker Compose 文件集中放在 `assets/docker/` 下。已有内容的章节采用"保留并扩充"策略，新增缺失模块（风险、优化、排障、必备技能、Docker Compose）。新章节从头按模板生成。

**Tech Stack:** Markdown, TypeScript (effect 3.x), YAML (Docker Compose)

**Existing content baseline:**
- 全部 15 章已有 README.md（每章 56KB~153KB，书本式长篇叙事风格）
- 每章下已有 examples/ 目录含示例代码，含 docker-compose.yml
- 需要补充模板中的"潜在风险、优化策略、典型问题排查、必备技能"模块
- 需要统一整理 Docker Compose 到 assets/docker/

---

## Phase 1: 创建全局入口与 Docker Compose 文件

### Task 1: 创建入口 README.md

**Files:**
- Modify: `docs/Effect-ts/README.md`（当前 128KB，需重写为导航入口页）

- [ ] **Step 1: 读取当前 README.md 了解已有内容**

- [ ] **Step 2: 编写精简的导航入口 README.md**

  ```markdown
  # Effect-TS 深度技术参考

  基于 Effect-TS 3.x，涵盖核心原理、实战场景、高级特性、工程化实践与性能调优。

  ## 章节索引

  ### 第一部分：核心原理
  - [第 1 章：原生异步的"原罪"与 Effect 的破局](ch01-async-woes/README.md)
  - [第 2 章：执行引擎与 Fiber（纤程）模型](ch02-fiber-model/README.md)

  ### 第二部分：核心场景实战
  - [第 3 章：极致的错误处理与领域建模](ch03-error-handling/README.md)
  - [第 4 章：依赖注入与上下文管理](ch04-di-context/README.md)
  - [第 5 章：资源管理与 Scope](ch05-resource-scope/README.md)
  - [第 6 章：高并发控制与结构化并发](ch06-concurrency/README.md)

  ### 第三部分：高级特性
  - [第 7 章：Stream 流处理](ch07-stream/README.md)
  - [第 8 章：并发原语](ch08-concurrency-primitives/README.md)
  - [第 9 章：Schedule 调度器](ch09-schedule/README.md)

  ### 第四部分：工程化
  - [第 10 章：@effect/schema](ch10-schema/README.md)
  - [第 11 章：可测试性](ch11-testability/README.md)
  - [第 12 章：框架集成](ch12-framework-integration/README.md)

  ### 第五部分：排坑与调优
  - [第 13 章：开发体验痛点](ch13-dx-pain-points/README.md)
  - [第 14 章：运行时排查](ch14-runtime-debug/README.md)
  - [第 15 章：性能调优](ch15-performance-checklist/README.md)

  ### 附录
  - [附录 A：API 对照速查表](appendix-a-api-comparison.md)
  - [附录 B：pipe → Effect.gen 迁移指南](appendix-b-pipe-to-gen.md)
  - [附录 C：社区生态推荐](appendix-c-ecosystem.md)
  - [附录 D：面试高频问题](appendix-d-interview.md)

  ## Docker Compose 环境
  - [错误处理（PostgreSQL）](assets/docker/docker-compose.ch03.yml)
  - [依赖注入（多服务）](assets/docker/docker-compose.ch04.yml)
  - [并发控制（Redis）](assets/docker/docker-compose.ch06.yml)
  - [Stream（Kafka）](assets/docker/docker-compose.ch07.yml)
  - [Schedule（Redis）](assets/docker/docker-compose.ch09.yml)
  - [Schema（API Server）](assets/docker/docker-compose.ch10.yml)
  - [框架集成（Fastify + PostgreSQL）](assets/docker/docker-compose.ch12.yml)
  ```

- [ ] **Step 3: 提交**

  ```bash
  git add docs/Effect-ts/README.md
  git commit -m "docs(effect-ts): rewrite top-level README as navigation index"
  ```

---

### Task 2: 创建 Docker Compose 文件

**Files:**
- Create: `docs/Effect-ts/assets/docker/docker-compose.ch03.yml`
- Create: `docs/Effect-ts/assets/docker/docker-compose.ch04.yml`
- Create: `docs/Effect-ts/assets/docker/docker-compose.ch06.yml`
- Create: `docs/Effect-ts/assets/docker/docker-compose.ch07.yml`
- Create: `docs/Effect-ts/assets/docker/docker-compose.ch09.yml`
- Create: `docs/Effect-ts/assets/docker/docker-compose.ch10.yml`
- Create: `docs/Effect-ts/assets/docker/docker-compose.ch12.yml`

- [ ] **Step 1: 创建目录**

  ```bash
  mkdir -p docs/Effect-ts/assets/docker
  ```

- [ ] **Step 2: 创建 ch03 PostgreSQL（错误处理演示）**

  ```yaml
  version: "3.8"
  services:
    postgres:
      image: postgres:16-alpine
      container_name: effect-ts-ch03
      environment:
        POSTGRES_DB: effect_errors
        POSTGRES_USER: effect
        POSTGRES_PASSWORD: effect123
      ports:
        - "5432:5432"
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U effect -d effect_errors"]
        interval: 5s
        timeout: 5s
        retries: 5
      volumes:
        - pgdata_ch03:/var/lib/postgresql/data

  volumes:
    pgdata_ch03:
  ```

- [ ] **Step 3: 创建 ch04 多服务环境（依赖注入）**

  ```yaml
  version: "3.8"
  services:
    postgres:
      image: postgres:16-alpine
      container_name: effect-ts-ch04
      environment:
        POSTGRES_DB: effect_di
        POSTGRES_USER: effect
        POSTGRES_PASSWORD: effect123
      ports:
        - "5433:5432"
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U effect -d effect_di"]
        interval: 5s
        timeout: 5s
        retries: 5

    redis:
      image: redis:7-alpine
      container_name: effect-ts-ch04-redis
      ports:
        - "6379:6379"
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        interval: 5s
        timeout: 3s
        retries: 5
  ```

- [ ] **Step 4: 创建 ch06 Redis（并发控制-信号量/限流演示）**

  ```yaml
  version: "3.8"
  services:
    redis:
      image: redis:7-alpine
      container_name: effect-ts-ch06
      ports:
        - "6380:6379"
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        interval: 5s
        timeout: 3s
        retries: 5
  ```

- [ ] **Step 5: 创建 ch07 Kafka（Stream 流处理演示）**

  ```yaml
  version: "3.8"
  services:
    zookeeper:
      image: confluentinc/cp-zookeeper:7.6.0
      container_name: effect-ts-ch07-zk
      environment:
        ZOOKEEPER_CLIENT_PORT: 2181
        ZOOKEEPER_TICK_TIME: 2000

    kafka:
      image: confluentinc/cp-kafka:7.6.0
      container_name: effect-ts-ch07-kafka
      depends_on:
        - zookeeper
      ports:
        - "9092:9092"
      environment:
        KAFKA_BROKER_ID: 1
        KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
        KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
  ```

- [ ] **Step 6: 创建 ch09 Redis（Schedule 调度器-重试策略演示）**

  ```yaml
  version: "3.8"
  services:
    redis:
      image: redis:7-alpine
      container_name: effect-ts-ch09
      ports:
        - "6381:6379"
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        interval: 5s
        timeout: 3s
        retries: 5
  ```

- [ ] **Step 7: 创建 ch10 API Server（Schema 校验演示）**

  ```yaml
  version: "3.8"
  services:
    api:
      image: node:20-alpine
      container_name: effect-ts-ch10
      working_dir: /app
      ports:
        - "3000:3000"
      command: sh -c "npm install && npx tsx src/server.ts"
      volumes:
        - ./ch10-schema/examples:/app
      environment:
        NODE_ENV: development
  ```

- [ ] **Step 8: 创建 ch12 Fastify + PostgreSQL（框架集成演示）**

  ```yaml
  version: "3.8"
  services:
    postgres:
      image: postgres:16-alpine
      container_name: effect-ts-ch12
      environment:
        POSTGRES_DB: effect_integration
        POSTGRES_USER: effect
        POSTGRES_PASSWORD: effect123
      ports:
        - "5434:5432"
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U effect -d effect_integration"]
        interval: 5s
        timeout: 5s
        retries: 5

    app:
      image: node:20-alpine
      container_name: effect-ts-ch12-app
      working_dir: /app
      ports:
        - "3001:3000"
      depends_on:
        postgres:
          condition: service_healthy
      command: sh -c "npm install && npx tsx src/server.ts"
      volumes:
        - ./ch12-framework-integration/examples:/app
  ```

- [ ] **Step 9: 提交**

  ```bash
  git add docs/Effect-ts/assets/
  git commit -m "docs(effect-ts): add Docker Compose environment configs for all chapters"
  ```

---

## Phase 2: 补充已有章节的缺失模块

### Task 3: 补充 ch01（异步原罪）— 添加风险/优化/排障/必备技能/Docker

**Files:**
- Modify: `docs/Effect-ts/ch01-async-woes/README.md`

**Content analysis:** 现有内容覆盖了"使用场景"和"实现原理"（Promise 四大痛点、Effect 哲学），缺失以下模块：

- [ ] **Step 1: 在 README.md 末尾追加"潜在风险"模块**

  ```
  ## 潜在风险

  ### ⚠️ 风险 1：过度抽象 — 小项目引入 Effect 增加复杂度
  **现象：** 只需简单 HTTP 请求的项目使用了 Effect 全套框架
  **根因：** Effect 的学习曲线和依赖体积在小项目中可能得不偿失
  **影响：** 团队难以维护，构建体积增大

  ### ⚠️ 风险 2：Generator 语法陷阱 — yield* 遗漏导致 Effect 不执行
  **现象：** Effect.gen 中的 Effect 没有被 yield*，表现为操作无响应
  **根因：** Generator 需要 yield* 来委托执行，忘记会导致 Effect 被创建但不运行
  **影响：** 隐蔽的 bug，难以排查

  ### ⚠️ 风险 3：类型推导链过深 — 复杂 Effect 链导致 tsserver 卡顿
  **现象：** IDE 中类型检查变慢，代码补全响应延迟
  **根因：** 多层 pipe/flatMap 嵌套在 TypeScript 类型系统中的推导复杂度高
  **影响：** 开发体验下降，可能触发 "Type instantiation is excessively deep" 错误
  ```

- [ ] **Step 2: 追加"优化策略"模块**

  ```
  ## 优化策略

  ### ✅ 策略 1：合理评估项目规模
  小型项目（< 5000 行）或简单 CRUD 可先用 Promise + Zod，按需渐进引入 Effect

  ### ✅ 策略 2：TypeScript 严格模式
  开启 strict: true，避免 any 类型破坏 Effect 的类型安全保障

  ### ✅ 策略 3：使用 Effect.gen 替代 pipe 链式调用
  Effect.gen 的推导链更短，tsserver 负担更小

  ### ✅ 策略 4：显式标注关键类型
  在模块边界显式标注 Effect 的类型签名，切断编译器推导链
  ```

- [ ] **Step 3: 追加"典型问题排查"模块**

  ```
  ## 典型问题排查

  ### 问题：Effect.runPromise 返回 Promise<never> 但程序卡住不执行
  **原因：** Effect 中存在未提供的依赖（R 类型未满足）
  **排查步骤：**
  1. 检查 Effect 的 R 类型参数有哪些依赖
  2. 确认是否调用了 Effect.provide 提供了所有 Tag
  3. 使用 Effect.runPromiseExit 获取 Exit 对象查看详细错误
  **解决方案：** 使用 Layer 组装所有依赖，或逐个 provide 测试

  ### 问题：async/await 和 Effect.gen 混用时类型不匹配
  **原因：** Promise 和 Effect 的执行模型不同，混用会导致类型错误
  **排查步骤：**
  1. 检查函数签名，确认返回值是 Effect 还是 Promise
  2. 使用 Effect.promise 或 Effect.tryPromise 适配 Promise 代码
  **解决方案：** 统一使用 Effect.gen，对外暴露时用 Effect.runPromise
  ```

- [ ] **Step 4: 追加"必备技能"模块**

  ```
  ## 必备技能

  作为 Effect-TS 开发者，需要掌握以下知识与技能：

  1. **TypeScript 类型系统深入理解**
     - 泛型、条件类型、映射类型、infer 关键字
     - 联合类型与交叉类型、类型守卫
     - 了解类型推导的局限性

  2. **函数式编程基础**
     - 纯函数、副作用、引用透明性
     - 函子（Functor）、单子（Monad）概念
     - 不可变数据、组合优于继承

  3. **Effect 核心概念**
     - Effect<A, E, R> 三维模型
     - 惰性求值与描述式编程
     - Fiber 模型与结构化并发

  4. **JavaScript 异步编程演进**
     - Callback → Promise → async/await → Effect
     - 理解每种模式的优缺点

  5. **工具链**
     - Effect.gen (Generator) 语法
     - Effect.runPromise / runSync 等运行函数
     - Effect 的调试工具（Effect.tap, Effect.log）
  ```

- [ ] **Step 5: 提交**

  ```bash
  git add docs/Effect-ts/ch01-async-woes/README.md
  git commit -m "docs(effect-ts): add risk/optimization/troubleshooting/skills modules to ch01"
  ```

---

### Task 4: 补充 ch02（执行引擎与 Fiber）

**Files:**
- Modify: `docs/Effect-ts/ch02-fiber-model/README.md`

**Content analysis:** 现有内容覆盖 Fiber 基本概念、生命周期、fork/join/中断机制。缺失"潜在风险、优化策略、典型问题排查、必备技能、Docker Compose"。

- [ ] **Step 1: 追加"潜在风险"模块**

  内容要点：
  - Fiber 泄漏：fork 后未 join 或未在 Scope 内管理，导致后台 Fiber"逃逸"
  - 中断响应不及时：在 CPU 密集型任务中 Fiber 不响应中断信号
  - Fiber 数量过多：百万级 Fiber 的调度开销、内存占用

- [ ] **Step 2: 追加"优化策略"模块**

  内容要点：
  - 尽量使用 Effect.all 而非手动 fork/join
  - 在 Fiber 中使用 Effect.checkInterruption 主动检查中断
  - 使用 Effect.scoped 确保 Fiber 生命周期与 Scope 绑定

- [ ] **Step 3: 追加"典型问题排查"模块**

  内容要点：
  - Fiber.join 永远不返回 → 子 Fiber 死循环或死锁
  - 中断后资源未释放 → Scope 未正确使用
  - Fiber.dump 监控活跃 Fiber 数量

- [ ] **Step 4: 追加"必备技能"模块**

  内容要点：
  - 理解 Runtime 与执行器机制
  - Fiber 与 OS 线程的对比认知
  - Effect.gen (Generator) 语法与 yield*

- [ ] **Step 5: 提交**

  ```bash
  git add docs/Effect-ts/ch02-fiber-model/README.md
  git commit -m "docs(effect-ts): add risk/optimization/troubleshooting/skills modules to ch02"
  ```

---

### Task 5: 补充 ch03（错误处理）

**Files:**
- Modify: `docs/Effect-ts/ch03-error-handling/README.md`

**Content analysis:** 现有内容覆盖使用场景、实现原理、对比表。缺失"潜在风险、优化策略、典型问题排查、必备技能、Docker Compose"。

- [ ] **Step 1: 追加"潜在风险"模块**
  - 错误类型膨胀：深层调用链导致 E 变成几十个联合类型
  - Defect 与 Error 混为一谈：未预期的异常（空指针等）当作业务错误处理
  - catchAll 滥用：捕获所有错误但未正确恢复

- [ ] **Step 2: 追加"优化策略"模块**
  - 模块边界使用 mapError 转换错误类型
  - 使用 catchTag 精准捕获特定业务错误
  - 分层错误体系：基础设施错误 → 领域错误 → 展示错误

- [ ] **Step 3: 追加"典型问题排查"模块**
  - Error 类型不匹配：两个不同的 Error 类型联合后无法匹配
  - Defect 未捕获导致程序崩溃：使用 Effect.catchAllDefect 兜底

- [ ] **Step 4: 追加"必备技能"模块**
  - Tagged Union / Data.TaggedError 模式
  - Effect 错误处理操作符体系（catchTag / catchAll / mapError / orElse）
  - Either 类型与 Effect 错误的关系

- [ ] **Step 5: 提交**

---

### Task 6: 补充 ch04（依赖注入）

**Files:**
- Modify: `docs/Effect-ts/ch04-di-context/README.md`

**Content analysis:** 现有内容覆盖 Context/Tag/Layer 基础。缺失"潜在风险、优化策略、典型问题排查、必备技能"。

- [ ] **Step 1: 追加"潜在风险"模块**
  - Context 缺失导致运行时崩溃（尽管 TS 编译期会报错）
  - Layer 循环依赖导致启动时栈溢出
  - Tag 重复注册导致覆盖

- [ ] **Step 2: 追加"优化策略"模块**
  - 使用 Layer 的依赖树自动组装，避免手动 provide
  - Live/Test/Stub 三层 Layer 结构
  - 使用 Layer.update 热替换部分依赖

- [ ] **Step 3: 追加"典型问题排查"模块**
  - MissingRequiredColumns / Requirement Not Met 错误

- [ ] **Step 4: 追加"必备技能"模块**
  - Context.Tag 定义与使用
  - Layer.merge / Layer.provideMerge 组合

- [ ] **Step 5: 提交**

---

### Task 7: 补充 ch05（资源管理）

**Files:**
- Modify: `docs/Effect-ts/ch05-resource-scope/README.md`

**Content analysis:** 现有内容非常详尽（58K），覆盖 acquireUseRelease、Scope、对比表。缺失"典型问题排查、必备技能"。

- [ ] **Step 1: 追加"典型问题排查"模块**
  - Scope 泄漏：在 Effect.gen 中打开资源但脱离了 Scope 上下文
  - 事务回滚未执行：Release 中错误被静默忽略

- [ ] **Step 2: 追加"必备技能"模块**
  - Scope / Effect.acquireUseRelease / Effect.acquireRelease
  - 与 try-with-resources、Python with 的对比
  - 数据库事务管理中的 Scope 使用

- [ ] **Step 3: 提交**

---

### Task 8: 补充 ch06（并发控制）

**Files:**
- Modify: `docs/Effect-ts/ch06-concurrency/README.md`

**Content analysis:** 现有内容覆盖 Fiber、Effect.all、Semaphore。缺失"典型问题排查、必备技能"。

- [ ] **Step 1: 追加"典型问题排查"模块**
  - Semaphore 死锁：多个 Fiber 互相等待对方持有的许可
  - 惊群效应：无限制 fork 打满数据库连接池

- [ ] **Step 2: 追加"必备技能"模块**
  - Fiber 生命周期管理
  - Semaphore 限流策略
  - Structured Concurrency 原则

- [ ] **Step 3: 提交**

---

### Task 9: 补充 ch07（Stream）

**Files:**
- Modify: `docs/Effect-ts/ch07-stream/README.md`

**Content analysis:** 现有内容（130K）非常详尽。缺失"典型问题排查、必备技能"。

- [ ] **Step 1: 追加"典型问题排查"模块**
  - 背压不足导致 OOM：生产者速度远超消费者
  - Stream 中断后资源未释放
  - 并发合并时数据乱序

- [ ] **Step 2: 追加"必备技能"模块**
  - Stream / Chunk / Sink 核心概念
  - 背压机制原理
  - Kafka / 消息队列集成模式

- [ ] **Step 3: 提交**

---

### Task 10: 补充 ch08（并发原语）

**Files:**
- Modify: `docs/Effect-ts/ch08-concurrency-primitives/README.md`

**Content analysis:** 现有内容（148K）非常详尽。缺失"典型问题排查、必备技能"。

- [ ] **Step 1: 追加"典型问题排查"模块**
  - Ref 的 ABA 问题
  - SynchronizedRef 死锁
  - Queue 消费速度过慢导致积压

- [ ] **Step 2: 追加"必备技能"模块**
  - Ref vs SynchronizedRef 选择策略
  - Queue 背压与消费者并发模型
  - Hub 发布订阅模式

- [ ] **Step 3: 提交**

---

### Task 11: 补充 ch09（Schedule）

**Files:**
- Modify: `docs/Effect-ts/ch09-schedule/README.md`

**Content analysis:** 现有内容（95K）非常详尽。缺失"典型问题排查、必备技能、Docker Compose"。

- [ ] **Step 1: 追加"典型问题排查"模块**
  - 重试风暴：大量请求同时重试压垮下游服务
  - Schedule 组合顺序错误导致策略不符合预期
  - 无限重试导致资源耗尽

- [ ] **Step 2: 追加"必备技能"模块**
  - Schedule 组合子（exponential / jittered / recurs / intersect）
  - 指数退避 + 抖动防雪崩
  - Schedule 与 retry / repeat 的关系

- [ ] **Step 3: 提交**

---

### Task 12: 补充 ch10（Schema）

**Files:**
- Modify: `docs/Effect-ts/ch10-schema/README.md`

**Content analysis:** 现有内容（100K）详尽。缺失"典型问题排查、必备技能"。

- [ ] **Step 1: 追加"典型问题排查"模块**
  - Schema 解析性能瓶颈：大型 Schema 的解析耗时长
  - Schema 与 Zod 混用时类型不匹配
  - AST 转换链过长导致内存占用高

- [ ] **Step 2: 追加"必备技能"模块**
  - Schema / ParseResult / AST 核心概念
  - Schema 与 Zod 的选型对比
  - API 校验中间件搭建

- [ ] **Step 3: 提交**

---

### Task 13: 补充 ch11（可测试性）

**Files:**
- Modify: `docs/Effect-ts/ch11-testability/README.md`

**Content analysis:** 现有内容（131K）详尽。缺失"典型问题排查、必备技能"。

- [ ] **Step 1: 追加"典型问题排查"模块**
  - TestClock 不生效：未正确提供 TestContext
  - 测试中 Layer 冲突：多个测试共享可变状态
  - 假阳性测试：异步操作未正确 await

- [ ] **Step 2: 追加"必备技能"模块**
  - TestClock / TestConsole / TestRandom
  - Layer 替换实现测试隔离
  - Effect 单元测试模式

- [ ] **Step 3: 提交**

---

### Task 14: 补充 ch12（框架集成）

**Files:**
- Modify: `docs/Effect-ts/ch12-framework-integration/README.md`

**Content analysis:** 现有内容（153K）详尽。缺失"典型问题排查、必备技能、Docker Compose"。

- [ ] **Step 1: 追加"典型问题排查"模块**
  - Fastify 生命周期与 Effect Scope 不匹配
  - Express 中间件中无法 yield* Effect.gen
  - 混合使用 NestJS DI 和 Effect DI 导致混乱

- [ ] **Step 2: 追加"必备技能"模块**
  - 渐进式重构策略
  - Adapter 桥接模式
  - @effect/platform 的跨平台 I/O

- [ ] **Step 3: 提交**

---

### Task 15: 补充 ch13（DX 痛点）

**Files:**
- Modify: `docs/Effect-ts/ch13-dx-pain-points/README.md`

**Content analysis:** 现有内容（63K）覆盖使用场景、实现原理。缺失"潜在风险、优化策略、典型问题排查、必备技能"。

- [ ] **Step 1: 追加"潜在风险"模块**
  - 过度依赖 Effect 导致简单的同步操作也包裹在 Effect.sync 中
  - 批量导出的类型定义导致 tsserver 内存溢出

- [ ] **Step 2: 追加"优化策略"模块**
  - 拆分 Effect：将几百行的 Effect.gen 拆分为小函数
  - 类型断点：在关键节点使用 satisfies 切断推导链
  - implicitProjectConfig: { strictNullChecks: true } 优化
  - 使用 skipLibCheck 跳过 node_modules 类型检查

- [ ] **Step 3: 追加"典型问题排查"模块**
  - Type instantiation is excessively deep

- [ ] **Step 4: 追加"必备技能"模块**
  - TypeScript 编译器性能优化技巧
  - Effect 代码拆分规范
  - tsserver 监控与调试

- [ ] **Step 5: 提交**

---

### Task 16: 补充 ch14（运行时排查）

**Files:**
- Modify: `docs/Effect-ts/ch14-runtime-debug/README.md`

- [ ] **Step 1: 追加"必备技能"模块**
  - Fiber.dump 监控活跃 Fiber 数量
  - Semaphore 死锁检测模式
  - Effect 日志与追踪工具链

- [ ] **Step 2: 提交**

---

### Task 17: 补充 ch15（性能调优）

**Files:**
- Modify: `docs/Effect-ts/ch15-performance-checklist/README.md`

- [ ] **Step 1: 追加"必备技能"模块**
  - Effect.sync vs Effect.promise 选择
  - Batching 批处理模式
  - 热路径（Hot Path）优化

- [ ] **Step 2: 提交**

---

## Phase 3: 创建附录

### Task 18: 创建附录 A（API 对照速查表）

**Files:**
- Create: `docs/Effect-ts/appendix-a-api-comparison.md`

- [ ] **Step 1: 编写附录 A 内容**

  Effect ↔ Promise / async/await API 对照表：

  | Promise | Effect | 说明 |
  |---------|--------|------|
  | `new Promise(resolve => ...)` | `Effect.sync(() => ...)` | 创建惰性 Effect |
  | `Promise.resolve(val)` | `Effect.succeed(val)` | 创建成功值 |
  | `Promise.reject(err)` | `Effect.fail(err)` | 创建失败 Effect |
  | `.then(fn)` | `Effect.map(eff, fn)` | 映射成功值 |
  | `.then(fn).catch(errFn)` | `Effect.matchEffect(eff, { onSuccess, onFailure })` | 同时处理成功和失败 |
  | `Promise.all([a, b])` | `Effect.all([a, b])` | 并发执行 |
  | `Promise.race([a, b])` | `Effect.race(a, b)` | 竞速 |
  | `try/catch` | `Effect.catchAll / catchTag` | 错误捕获 |
  | `async/await` | `Effect.gen(function* () { yield* ... })` | 线性语法 |
  | `AbortController.abort()` | `Fiber.interrupt` | 取消执行 |
  | `finally` | `Effect.acquireRelease(acquire, release)` | 资源清理 |
  | `setTimeout` | `Effect.delay(eff, duration)` | 延迟执行 |
  | `Promise.resolve().then(() => ...)` | `Effect.suspend(() => ...)` | 惰性求值 |

- [ ] **Step 2: 编写使用说明和典型场景对应**

- [ ] **Step 3: 提交**

  ```bash
  git add docs/Effect-ts/appendix-a-api-comparison.md
  git commit -m "docs(effect-ts): add appendix A - API comparison cheat sheet"
  ```

---

### Task 19: 创建附录 B（pipe → Effect.gen 迁移）

**Files:**
- Create: `docs/Effect-ts/appendix-b-pipe-to-gen.md`

- [ ] **Step 1: 编写附录 B 内容**

  pipe 链式调用 vs Effect.gen Generator 语法对照，含逐步迁移示例：

  ```typescript
  // Before: pipe 链式（传统写法）
  const program = pipe(
    getUser(id),
    Effect.flatMap(user => pipe(
      getOrders(user.id),
      Effect.map(orders => ({ user, orders }))
    )),
    Effect.catchAll(err => Effect.succeed(fallback))
  );

  // After: Effect.gen（推荐写法）
  const program = Effect.gen(function*() {
    const user = yield* getUser(id);
    const orders = yield* getOrders(user.id);
    return { user, orders };
  }).pipe(Effect.catchAll(err => Effect.succeed(fallback)));
  ```

- [ ] **Step 2: 提交**

---

### Task 20: 创建附录 C（社区生态推荐）

**Files:**
- Create: `docs/Effect-ts/appendix-c-ecosystem.md`

- [ ] **Step 1: 编写附录 C 内容**

  覆盖：
  - @effect/platform — 跨平台 I/O（HTTP、FileSystem、Path）
  - @effect/cluster — 分布式集群
  - @effect/sql — 类型安全 ORM（支持 pg / mysql2 / sqlite / drizzle 等）
  - @effect/opentelemetry — 可观测性
  - @effect/rpc — RPC 框架
  - @effect/printer — 类型安全打印
  - @effect/vitest — Vitest 集成测试
  - effect/Cron — 定时任务

- [ ] **Step 2: 提交**

---

### Task 21: 创建附录 D（面试高频问题）

**Files:**
- Create: `docs/Effect-ts/appendix-d-interview.md`

- [ ] **Step 1: 编写附录 D 内容**

  QA 格式覆盖：
  - Effect vs Promise 的根本区别？
  - Effect<A, E, R> 三维模型是什么？
  - Fiber 与线程的区别？
  - Effect 如何实现取消？
  - Effect 的错误处理为什么比 try/catch 好？
  - Effect 的依赖注入如何工作？
  - Effect.all 的并发策略有哪些？
  - Stream 的背压机制是什么？
  - Effect vs RxJS 的区别和选型？
  - Effect vs Zod 的优劣对比？

- [ ] **Step 2: 提交**

---

## 执行建议

### 并行策略
- Phase 1 Task 2（Docker Compose 文件）可以一次性创建全部 7 个文件
- Phase 2（Tasks 3-17）可以并行执行，因为每个章节的修改互不依赖
- Phase 3（Tasks 18-21）可以并行执行

### 验收标准
1. 每章 README.md 包含全部 8 个模块：概述、使用场景、实现原理、潜在风险、优化策略、典型问题排查、必备技能、示例代码
2. Docker Compose 文件可正常启动，通过健康检查
3. 附录内容完整无占位符
4. 所有文档通过 git commit

### 时间预估
- Docker Compose 文件：~15 min
- 每个章节补充缺失模块：~20-30 min/章 × 15 章 = ~5-7.5h
- 附录：~30 min/个 × 4 = ~2h
- 总计：~8-10h（可并行加速到 ~2-3h）