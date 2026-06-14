# Effect-TS 深度参考书 — 生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 生成《深入理解 Effect-TS》全书 15 章内容。

**Architecture:** 混合模式 — Part 1 纯文档、Part 2 每个场景独立可运行项目（TypeScript + Docker Compose + Jest）、Part 3-5 文档为主。

**Tech Stack:** Effect-TS, TypeScript 5.x, Jest, Docker Compose

---

## 文件结构

```
docs/Effect-ts/
├── part1-principles/
│   ├── ch01-why-effect.md          ~4000 字
│   └── ch02-fiber-runtime.md       ~4000 字
├── part2-scenarios/
│   ├── ch03-error-handling/
│   │   ├── index.md, src/, tests/, docker-compose.yml, package.json
│   ├── ch04-di-context/
│   │   ├── index.md, src/, tests/, docker-compose.yml, package.json
│   ├── ch05-resource-scope/
│   │   ├── index.md, src/, tests/, docker-compose.yml, package.json
│   └── ch06-structured-concurrency/
│       ├── index.md, src/, tests/, docker-compose.yml, package.json
├── part3-advanced/
│   ├── ch07-stream.md              ~4000 字
│   ├── ch08-concurrency-primitives.md ~4000 字
│   └── ch09-schedule.md            ~4000 字
├── part4-engineering/
│   ├── ch10-schema.md              ~3000 字
│   ├── ch11-testability.md         ~3000 字
│   └── ch12-ecosystem.md           ~3000 字
└── part5-troubleshooting/
    ├── ch13-dx-pain.md             ~3000 字
    ├── ch14-runtime-debug.md       ~3000 字
    └── ch15-performance.md         ~3000 字
```

---

## Task 1: 第1章 原生异步的缺陷与 Effect 破局

**Files:**
- Create: `docs/Effect-ts/part1-principles/ch01-why-effect.md`

写入 8 模块：
- **使用场景**: Promise 处理错误时 catch(e: unknown) 的无奈、无法取消的请求导致内存泄漏、并发场景下 Promise.all 一个失败全部失败
- **实现原理**: Effect<A, E, R> 三维模型（Success/Error/Requirements）、惰性求值（Effect 是"食谱"，Promise 是"端上桌的菜"）
- **潜在风险**: 将 Effect 当 Promise 用导致副作用重复执行、不理解惰性求值导致意外行为
- **优化策略**: 使用 Effect.gen 替代 pipe 链式调用、理解 Effect 与 Promise 的桥接（Effect.runPromise）
- **典型问题**: Effect 被多次 run 导致副作用重复、Effect.gen 中 yield* 的使用误区
- **开发者技能**: 理解惰性求值/描述式编程思维

```typescript
import { Effect } from "effect"

// 定义带标签的领域错误
class UserNotFound extends Error { readonly _tag = "UserNotFound" }
class DatabaseError extends Error { readonly _tag = "DatabaseError" }

// 业务函数签名明确告知调用者可能抛出哪些错误
const getUser = (id: string): Effect.Effect<User, UserNotFound | DatabaseError> =>
  Effect.gen(function* (_) {
    const db = yield* _(Database)
    const user = yield* _(db.findById(id))
    if (!user) return yield* _(new UserNotFound())
    return user
  })
```


## Task 2: 第2章 执行引擎与 Fiber 模型

**Files:**
- Create: `docs/Effect-ts/part1-principles/ch02-fiber-runtime.md`

8 模块覆盖：Runtime 执行器、Fiber 轻量线程、中断机制、Effect.gen 语法革命。


## Task 3: 第3章 错误处理 — 可运行项目

**Files:**
- `docs/Effect-ts/part2-scenarios/ch03-error-handling/src/errors.ts` — 领域错误定义（TaggedError）
- `docs/Effect-ts/part2-scenarios/ch03-error-handling/src/service.ts` — 业务逻辑
- `docs/Effect-ts/part2-scenarios/ch03-error-handling/tests/errors.test.ts` — 错误测试
- `docs/Effect-ts/part2-scenarios/ch03-error-handling/docker-compose.yml`
- `docs/Effect-ts/part2-scenarios/ch03-error-handling/index.md`

## Task 4: 第4章 依赖注入与 Context — 可运行项目

## Task 5: 第5章 资源管理与 Scope — 可运行项目

## Task 6: 第6章 高并发控制 — 可运行项目

## Task 7-15: Part 3-5 文档章节