# Effect 资源管理与 Scope — 演示项目

本演示项目对应《Effect 实战》第五章「资源管理与 Scope」的完整代码示例。

## 项目结构

```
demos/
├── src/
│   ├── resource.ts           # acquireRelease + Scope 模式
│   ├── connection-pool.ts    # 连接池与 Scope
│   └── main.ts               # 入口演示
├── tests/
│   └── resource.test.ts      # 资源管理测试
├── package.json
├── tsconfig.json
├── jest.config.ts
└── README.md
```

## 核心概念演示

### 1. acquireRelease — 获取-释放原语

`Effect.acquireRelease` 是资源管理的基础原语，将资源使用分为三个阶段：

- **获取（Acquire）**：打开文件、建立连接等操作，此阶段不可中断
- **使用（Use）**：实际的业务逻辑，此阶段可中断
- **释放（Release）**：无论成功、失败还是中断，释放操作都会执行

```typescript
const readFile = (name: string): Effect.Effect<string, Error, never> =>
  Effect.acquireRelease(
    openFile(name),
    (file, exit) => Effect.sync(() => file.close()),
  ).pipe(
    Effect.flatMap((file) => Effect.sync(() => file.read()))
  )
```

### 2. Scope — 自动资源跟踪

多个资源在同一个 Scope 中注册后，释放顺序为注册顺序的逆序（栈顺序）：

```typescript
const processMultiple = (f1: string, f2: string) =>
  Effect.gen(function* (_) {
    const a = yield* _(readFile(f1))   // 先注册
    const b = yield* _(readFile(f2))   // 后注册
    return `${a}\n${b}`
  })
  // Scope 关闭时：先释放 b，再释放 a
```

### 3. 连接池模式

通过 acquireRelease 定义连接的获取和释放，释放操作为"归还"而非"销毁"：

```typescript
export const withConnection = <A>(use: (conn: Connection) => Effect.Effect<A, Error, never>) =>
  Effect.acquireRelease(
    createConnection(),
    (conn, exit) => Effect.sync(() => conn.close()),
  ).pipe(
    Effect.flatMap(use)
  )
```

### 4. 资源释放验证

测试中通过副作用标记（logging array）验证资源是否在成功、失败条件下都被正确释放。

## 运行方式

```bash
# 安装依赖
pnpm install

# 运行演示
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm typecheck
```

## 预期输出

运行 `pnpm dev` 时，控制台会打印每个阶段的日志，展示资源的获取、使用和释放顺序：

```
[Acquire] Opening file: data.txt
[Release on exit: Success] Closing: data.txt
File content: Content of data.txt
[Acquire] Opening file: a.txt
[Release on exit: Success] Closing: a.txt
[Acquire] Opening file: b.txt
[Release on exit: Success] Closing: b.txt
Combined:
Content of a.txt
Content of b.txt
[Conn #1] Connection established
[Conn #1] Executing: SELECT * FROM users
[Release on Success] Connection #1
[Conn #1] Connection closed
Query result: Result of: SELECT * FROM users
```