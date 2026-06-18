# 附录 C：常用社区生态推荐

## @effect/platform — 跨平台 I/O

`@effect/platform` 是 Effect-TS 官方提供的跨平台运行时抽象层，提供统一的 HTTP、文件系统、路径操作等 API。

**核心能力：**
- `HttpClient` — 类型安全的 HTTP 客户端，支持中间件、重试、超时
- `HttpServer` — HTTP 服务器抽象（支持 Node.js / Bun / Browser）
- `FileSystem` — 跨平台文件系统操作
- `Path` — 跨平台路径操作
- `Terminal` — 终端输入输出

**安装：**
```bash
npm install @effect/platform @effect/platform-node
```

**示例：**
```typescript
import { HttpClient } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { Effect } from "effect"

const program = Effect.gen(function*() {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.get("https://api.example.com/users")
  return yield* response.json
}).pipe(Effect.provide(NodeContext.layer))
```

## @effect/sql — 类型安全 ORM

`@effect/sql` 提供类型安全的 SQL 数据库访问，支持多种数据库后端。

**支持的后端：**
- `@effect/sql-pg` — PostgreSQL
- `@effect/sql-mysql2` — MySQL
- `@effect/sql-sqlite-node` — SQLite (Node.js)
- `@effect/sql-sqlite-bun` — SQLite (Bun)
- `@effect/sql-drizzle` — Drizzle ORM 集成
- `@effect/sql-kysely` — Kysely 查询构建器集成
- `@effect/sql-mssql` — SQL Server

**安装：**
```bash
npm install @effect/sql @effect/sql-pg
```

**示例：**
```typescript
import { SqlClient } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"
import { Effect, Layer } from "effect"

const SqlLive = PgClient.layer({
  database: "myapp",
  username: "user",
  password: "pass"
})

const program = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const users = yield* sql`SELECT * FROM users WHERE active = ${true}`
  return users
}).pipe(Effect.provide(SqlLive))
```

## @effect/cluster — 分布式集群

`@effect/cluster` 提供基于 Fiber 的分布式计算框架，支持跨节点的消息传递和工作分发。

**核心概念：**
- `Cluster` — 集群管理
- `Sharding` — 分片策略
- `RPC` — 远程过程调用

## @effect/rpc — RPC 框架

`@effect/rpc` 提供类型安全的远程过程调用框架，基于 Effect 的序列化和错误处理。

## @effect/opentelemetry — 可观测性

`@effect/opentelemetry` 集成 OpenTelemetry，提供分布式追踪和指标收集。

## @effect/printer — 类型安全打印

`@effect/printer` 提供类型安全的文档打印库，灵感来自 Haskell 的 `pretty` 库。

## @effect/vitest — 测试集成

`@effect/vitest` 提供 Vitest 测试框架的 Effect 集成，支持自动提供 TestContext。

## effect/Cron — 定时任务

Effect 内置的 Cron 调度器，支持基于 Cron 表达式的定时任务。

## 社区项目

- **effect-ts-app** — Effect-TS 全栈应用模板
- **effect-http** — 基于 Effect 的 HTTP 服务框架
- **effect-telemetry** — 遥测数据收集
- **effect-ts playground** — 在线 Playground
