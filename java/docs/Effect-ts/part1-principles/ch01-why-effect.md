# 第 1 章 原生异步的缺陷与 Effect 破局

## 1.1 引言

JavaScript 的异步编程经历了从回调地狱到 Promise、再到 async/await 的演进。每一次进步都让代码可读性和可维护性向前迈出一大步。然而，当我们将这套方案投入大规模、高可靠性的生产系统时，发现它远未成熟。

Promise 作为 JavaScript 原生异步原语，存在若干结构性的缺陷。这些缺陷在简单场景下可以被容忍，但在复杂业务逻辑、高并发场景和故障恢复流程中，会成为系统性风险的根源。本章将从四个核心痛点出发，逐层剖析 Promise 的局限性，然后展示 Effect-TS 如何通过 `Effect<A, E, R>` 三维模型从根本上解决这些问题。

## 1.2 使用场景：Promise 的四大痛点

### 1.2.1 catch(e: unknown) 的类型黑洞

Promise 的 catch 语句虽然简洁，却有一个广为人知但常被忽视的问题：捕获到的错误类型是 `unknown`。

```typescript
fetch("/api/user")
  .then((res) => res.json())
  .catch((e: unknown) => {
    // e 是 unknown，无法直接调用错误上的属性
    // 需要手动做类型收窄
    if (e instanceof TypeError) {
      console.log("网络异常:", e.message);
    } else if (e instanceof SyntaxError) {
      console.log("JSON 解析失败:", e.message);
    }
    // 如果业务上定义了自定义错误类呢？
    // 每个 catch 都要手动 instanceof 一遍
    return fallbackUser;
  });
```

这带来的实际后果是：**错误类型信息完全丢失**。当你需要根据不同的错误类型执行不同的恢复策略时，必须在运行时手工做类型收窄。而 TypeScript 编译器无法帮你检查是否遗漏了某个错误分支。

```typescript
// 这段代码能通过编译，但逻辑上不完整
async function getUser(id: string) {
  try {
    return await api.fetchUser(id);
  } catch (e) {
    // 忘记处理网络超时
    // 忘记处理权限不足
    // 编译器不会给出任何提示
    return DEFAULT_USER;
  }
}
```

相比之下，Effect-TS 在类型层面就区分了错误通道：

```typescript
import { Effect } from "effect";

// 错误类型在编译期就明确声明
const getUser: Effect.Effect<User, NetworkError | PermissionError | NotFoundError> =
  api.fetchUser(id);

// 编译器强制你处理所有错误分支
const program = Effect.catchAll(getUser, (error) => {
  // 这里编译器知道 error 的确切联合类型
  // 通过 switch 或 if 穷举所有分支
  switch (error._tag) {
    case "NetworkError":
      return Effect.succeed(DEFAULT_USER);
    case "PermissionError":
      return Effect.fail(error); // 重新抛出
    case "NotFoundError":
      return Effect.succeed(createUser(id));
  }
});
```

### 1.2.2 无法取消请求导致资源泄漏

Promise 规范中没有定义取消机制。一旦创建了一个 Promise，它就会不受控制地执行到底。

```typescript
// 用户快速切换页面时
function SearchComponent() {
  useEffect(() => {
    const promise = fetchSearchResults(query);
    // 组件卸载时，这个 fetch 依然在执行
    // 返回的响应会 setState 到已卸载的组件上
    // React 17 之前会报"在未挂载的组件上调用 setState"
    // React 18 虽然不报错，但网络请求本身仍在消耗资源
    return () => {
      // 你只能忽略结果，但无法终止进行中的请求
    };
  }, [query]);
}
```

在生产环境中，这意味着：

- **带宽浪费**：大量已不再需要的请求仍在传输数据。
- **内存泄漏**：请求的响应数据、回调闭包中引用的对象无法被垃圾回收。
- **竞态条件**：多个请求以不确定的顺序返回，早发出的请求反而后到达。

```typescript
// 竞态条件的经典例子
let requestId = 0;

async function search(query: string) {
  const id = ++requestId;
  const results = await fetch(`/api/search?q=${query}`);
  // 如果这里被延迟，而用户又发起了一个新搜索
  // 那么早先的结果会覆盖最新的结果
  if (id === requestId) {
    updateResults(results);
  }
}
```

Effect-TS 通过 Fiber 中断机制解决了这一问题：

```typescript
import { Effect, Fiber } from "effect";

const searchTask = (query: string) =>
  Effect.gen(function* (_) {
    return yield* _(fetch(`/api/search?q=${query}`));
  });

// 组件卸载时可以中断 Fiber
const fiber = yield* _(Effect.fork(searchTask(query)));
// Fiber 被中断时，所有 Effect 资源自动清理
yield* _(Fiber.interrupt(fiber));
```

### 1.2.3 Promise.all 一个失败全部失败

`Promise.all` 是 JavaScript 中最常用的并发原语，但它的错误处理策略极其粗糙：任何一个 Promise 失败，整个组合立即失败。

```typescript
async function loadDashboard() {
  const [user, orders, notifications] = await Promise.all([
    fetchUser(),
    fetchOrders(),
    fetchNotifications(),
  ]);
  // 如果 fetchOrders 失败，user 和 notifications 也白费了
  // 但它们的请求已经发出去了，响应被丢弃
  return { user, orders, notifications };
}
```

这意味着：

- **不可控的失败传播**：一个非关键服务的失败会导致整个页面崩溃。
- **资源浪费**：已经成功返回的请求结果被丢弃。
- **缺乏部分成功处理**：无法优雅地展示部分数据。

`Promise.allSettled` 虽然能返回所有结果，但无法在类型层面区分成功与失败：

```typescript
const results = await Promise.allSettled([fetchUser(), fetchOrders()]);
// 每个元素都是 PromiseSettledResult，类型已经被擦除
// 必须手动做运行时判断
results.forEach((r) => {
  if (r.status === "fulfilled") {
    // r.value 是 User | Orders 的联合类型，信息丢失
  }
});
```

Effect-TS 提供了精细的并发控制：

```typescript
import { Effect } from "effect";

const loadDashboard = Effect.gen(function* (_) {
  // 同时运行三个 Effect
  const [user, orders, notifications] = yield* _(
    Effect.all([fetchUser(), fetchOrders(), fetchNotifications()], {
      // 配置并发策略
      concurrency: "unbounded",
    })
  );
  return { user, orders, notifications };
});

// Effect.all 默认遇到第一个失败就终止
// 但可以通过配置改为"收集所有错误"模式
const loadDashboardWithAllErrors = Effect.gen(function* (_) {
  const result = yield* _(
    Effect.all([fetchUser(), fetchOrders(), fetchNotifications()], {
      concurrency: "unbounded",
      mode: "either", // 收集所有成功和失败的
    })
  );
  // 在这里可以分别为各个分支做错误处理
  return result;
});
```

### 1.2.4 隐式副作用不可见

这是 Promise 最根本的设计问题之一。Promise 在创建时就开始执行，这意味着副作用的发生既不可控也不可预测。

```typescript
function createUser(data: UserData): Promise<User> {
  // 这个函数看似纯函数，实际上一调用就发请求
  return fetch("/api/users", { method: "POST", body: JSON.stringify(data) });
}

// 下面这段代码就有隐藏问题
const userPromise = createUser(newUser);
// 此时用户已经创建成功了！
// 但后续的代码还不确定是否真的要保存这个用户

if (validationPassed) {
  return userPromise; // 用户被创建了两次！
}
```

在 Promise 模型中，根本不存在"不执行"的选项。任何函数调用只要返回 Promise，就触发了副作用。这意味着：

- **无法控制执行时机**：无法延迟、暂停或条件执行。
- **副作用隐式传播**：任何 async 函数都隐含副作用，类型系统无法表达。
- **测试困难**：因为无法隔离副作用，测试时必须 mock 网络层。
- **表达式不具备可组合性**：你不能把 Promise 当成值来传递和组合。

## 1.3 实现原理：Effect<A, E, R> 三维模型

### 1.3.1 三个类型参数的含义

Effect-TS 的核心是一个只有三个类型参数的数据结构：

```typescript
Effect<A, E, R>
```

- **A（Success）**：成功时返回的值的类型。
- **E（Error）**：失败时返回的错误类型。
- **R（Requirements）**：执行 Effect 所需的环境依赖。

这看起来简单，但在类型层面赋予了极大的表达能力：

```typescript
// 一个不需要任何依赖、不会失败、返回字符串的 Effect
const hello: Effect.Effect<string, never, never> = Effect.succeed("Hello");

// 一个可能失败、需要数据库连接的 Effect
const findUser: Effect.Effect<User, NotFoundError, Database> =
  Effect.gen(function* (_) {
    const db = yield* _(Database);
    return yield* _(db.query("SELECT * FROM users WHERE id = ?", [id]));
  });

// 一个既可能失败又需要多个依赖的 Effect
const complexOp: Effect.Effect<
  Report,
  NetworkError | ParseError,
  Database | HttpClient
> = Effect.gen(function* (_) {
  // 类型系统确保你提供了所有依赖
});
```

在 Promise 中，所有信息都被折叠到 `Promise<T>` 里：错误类型丢失（变成了 `unknown`），依赖信息完全不存在。

### 1.3.2 Promise 与 Effect 的对应关系

| Promise | Effect | 说明 |
|---------|--------|------|
| `Promise<T>` | `Effect<T, never, never>` | 永不失败的 Effect |
| `Promise<T>` | `Effect<T, E, R>` | 可能失败、需要依赖 |
| `async/await` | `Effect.gen` | Generator 语法 |
| `.then()` | `Effect.map` / `Effect.flatMap` | 变换和组合 |
| `.catch()` | `Effect.catchAll` / `Effect.catchTag` | 类型感知的错误处理 |
| `Promise.resolve(x)` | `Effect.succeed(x)` | 构造成功值 |
| `Promise.reject(e)` | `Effect.fail(e)` | 构造失败值 |
| `Promise.all([a, b])` | `Effect.all([a, b])` | 并发执行 |
| 不支持 | `Fiber.interrupt` | 中断/取消 |
| 不支持 | `Effect.provideService` | 依赖注入 |

### 1.3.3 惰性求值与描述式编程

Effect-TS 最重要的设计理念是**惰性求值**（Lazy Evaluation）。一个 Effect 只是一个**描述**（Description），而不是**执行**。

```typescript
// 这只是一个"食谱"（description），不是一个"菜"（execution）
const recipe: Effect.Effect<string, never, never> = Effect.sync(() => {
  console.log("煎鸡蛋");
  return "煎鸡蛋完成";
});

// 此时没有任何输出！
// recipe 只是一个数据结构的实例

// 只有在调用 run* 类函数时才真正执行
Effect.runSync(recipe); // 输出：煎鸡蛋
```

用生活化的比喻：

- Effect 是**食谱**：你可以阅读它、修改它、组合它、甚至把它放进抽屉里不做。
- Promise 是**端上桌的菜**：它从下锅的那一刻就已经不可逆转了。

```typescript
// Promise 方式 — 不可逆转
function cookEggs(): Promise<string> {
  // 一调用就开始热锅了
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("煎鸡蛋");
    }, 3000);
  });
}

// Effect 方式 — 描述式
const cookEggsPlan: Effect.Effect<string, never, never> = Effect.sync(() => {
  // 这里只是写下了步骤，没有任何动作
  return "煎鸡蛋步骤描述";
});

// 你甚至可以安全地多次"执行"同一个 Effect 描述
Effect.runSync(cookEggsPlan); // 没问题，每次执行都是独立的
Effect.runSync(cookEggsPlan); // 再执行一次，互不干扰
```

### 1.3.4 Effect.gen Generator 语法

为了接近 async/await 的开发体验，Effect-TS 提供了 `Effect.gen` 函数，使用 JavaScript 的 Generator 语法：

```typescript
import { Effect, Data } from "effect";

class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
class DatabaseError extends Data.TaggedError("DatabaseError")<{
  cause: unknown;
}> {}

class Database {
  findById(id: string): Effect.Effect<User | null, DatabaseError> {
    return Effect.tryPromise({
      try: () => db.query(`SELECT * FROM users WHERE id = $1`, [id]),
      catch: (cause) => new DatabaseError({ cause }),
    });
  }
}

// 使用 Effect.gen 模仿 async/await
const getUser = (id: string): Effect.Effect<User, UserNotFound | DatabaseError> =>
  Effect.gen(function* (_) {
    const db = yield* _(Database);
    const user = yield* _(db.findById(id));
    if (!user) {
      // 在 Effect.gen 中，yield* _(Effect.fail(x)) 相当于 throw
      return yield* _(Effect.fail(new UserNotFound({ id })));
    }
    return user;
  });
```

与 async/await 相比：

| async/await | Effect.gen | 差异 |
|---|---|---|
| `const x = await promise` | `const x = yield* _(effect)` | 语法不同但语义相似 |
| `throw error` | `yield* _(Effect.fail(error))` | Effect 显式返回错误 |
| `try/catch` | `Effect.catchAll / Effect.catchTag` | Effect 在类型层面区分错误 |
| 多个 await 并行 | `Effect.all` 或 `Effect.forEach` | Effect 内置并发控制 |
| `Promise.race` | `Effect.race` | 效果类似但支持取消 |

## 1.4 潜在风险

### 1.4.1 将 Effect 当 Promise 用导致副作用重复执行

从 Promise 迁移到 Effect 最常见的错误是：**不理解惰性求值，将 Effect 当做 Promise 来回传递并多次调用 run**。

```typescript
// 错误示例：将 Effect 当 Promise 反复调用
const sendEmailEffect = Effect.sync(() => {
  console.log("发送邮件...");
  return api.sendEmail(user, content);
});

// 第一次执行
Effect.runPromise(sendEmailEffect);
// 输出：发送邮件...

// 第二次执行
Effect.runPromise(sendEmailEffect);
// 输出：发送邮件...

// 第三次执行
Effect.runPromise(sendEmailEffect);
// 输出：发送邮件...

// 邮件被发送了三次！而开发者可能以为 sendEmailEffect 是一个"已缓存的 Promise"
```

在 Promise 世界中，多次 await 同一个 Promise 只会得到相同的结果，因为 Promise 有**记忆效应**（Memoization）：

```typescript
const promise = fetch("/api/data");

const a = await promise; // 实际发起请求
const b = await promise; // 不会发起新请求，返回同一个结果
// a === b
```

但在 Effect 世界中，每次 `run*` 都是从头执行：

```typescript
const effect = Effect.sync(() => Math.random());

Effect.runSync(effect); // 0.123
Effect.runSync(effect); // 0.456 — 完全不同的结果！
```

**解决方案**：如果需要 Effect 的记忆效应（Memoization），使用 `Effect.memoize`：

```typescript
const memoized = Effect.memoize(Effect.sync(() => Math.random()));

// 第一次执行
Effect.runSync(memoized); // 0.123

// 第二次执行，返回缓存的结果
Effect.runSync(memoized); // 0.123
```

### 1.4.2 不理解惰性求值导致意外行为

另一个常见问题是对表达式的求值时机产生误判：

```typescript
// 错误示例：外部变量已经被求值
const messages: string[] = [];

// 注意：下面对 Effect.sync 的调用中，console.log 是在惰性闭包内的
// 但 appendLog 函数的调用时机需要注意
const appendLog = (msg: string) =>
  Effect.sync(() => {
    messages.push(msg);
  });

// 这里 messages 可能在外部被意外修改
// 如果开发者误以为 Effect 的执行是即时的，可能会在
// 不合适的地方调用 run*

// 更好的做法是让 Effect 完全自包含
const appendLogPure = (msg: string) =>
  Effect.sync(() => {
    const newMsg = `[${new Date().toISOString()}] ${msg}`;
    return newMsg;
  });
```

另一个陷阱是，在构建 Effect 时调用了有副作用的函数：

```typescript
// 危险：Effect.sync 的参数必须是无副作用的构造逻辑
// 下面的代码看似正确，但 console.log 实际上在构造 Effect 时就执行了
const dangerous = Effect.sync(() => {
  console.log("这条日志在 runSync 时才执行"); // 正确
});

// 但下面这种情况是错误的
// badEffect 实际上在变量声明时就已经执行了副作用
const date = new Date(); // 这里已经获取了当前时间
const badEffect = Effect.sync(() => date); // 只是把已经固定的日期包裹起来

// 过了一小时后执行
Effect.runSync(badEffect); // 返回的还是创建时的日期，不是当前时间
```

正确做法是让副作用的捕获也进入惰性求值：

```typescript
const goodEffect = Effect.sync(() => new Date());

// 无论何时执行，都获取执行时的时间
setTimeout(() => {
  Effect.runSync(goodEffect); // 当前时间
}, 3600000);
```

## 1.5 优化策略

### 1.5.1 Effect.gen 替代 pipe 链式调用

虽然 Effect-TS 支持函数式管道的风格（如 `.pipe(Effect.map(...))`），但在大多数业务场景下，`Effect.gen` 生成的代码更具可读性。

```typescript
// 管道风格 — 适合纯函数式场景
const program = fetchUser(id).pipe(
  Effect.map((user) => user.name),
  Effect.map((name) => name.toUpperCase()),
  Effect.catchAll((error) => Effect.succeed("默认用户"))
);

// Effect.gen 风格 — 适合复杂业务逻辑
const program = Effect.gen(function* (_) {
  const user = yield* _(fetchUser(id));
  const name = user.name.toUpperCase();
  return name;
});
```

选择建议：

- **简单变换**（map/filter）：管道风格更简洁。
- **复杂业务逻辑**（条件分支、循环、多个外部调用）：`Effect.gen` 更直观。
- **错误处理链**：`Effect.catchTag` 管道风格更清晰，因为 `Effect.gen` 中的错误处理需要外包给 `Effect.catchAll`。

### 1.5.2 Effect.runPromise 桥接

在现有代码中逐步引入 Effect-TS 时，需要高效的桥接机制：

```typescript
import { Effect } from "effect";

// 从 Effect 到 Promise — 在边界调用
async function expressHandler(req: Request, res: Response) {
  const effect = buildUserWorkflow(req);

  // 使用 runPromise 将 Effect 转回 Promise
  try {
    const result = await Effect.runPromise(effect);
    res.json(result);
  } catch (error) {
    // error 类型为 unknown，与 Promise 桥接的代价
    res.status(500).json({ error });
  }
}
```

对于 Express/Koa/Fastify 等框架的集成：

```typescript
// 更健壮的桥接形式
app.get("/api/user/:id", async (req, res) => {
  const result = await Effect.runPromise(
    getUserFlow(req.params.id).pipe(
      Effect.catchAll((error) => {
        // 在 Effect 层面处理错误，避免 unknown 泄漏
        switch (error._tag) {
          case "UserNotFound":
            return Effect.succeed({ status: 404, body: error });
          case "DatabaseError":
            return Effect.succeed({ status: 500, body: error });
        }
      })
    )
  );
  res.status(result.status).json(result.body);
});
```

### 1.5.3 Effect.tryPromise 安全包装

将现有的 Promise 代码安全接入 Effect 生态系统：

```typescript
import { Effect } from "effect";

class ApiError extends Data.TaggedError("ApiError")<{
  status: number;
  message: string;
}> {}

// 包装一个可能 reject 的 Promise
const safeFetch = (url: string): Effect.Effect<Response, ApiError, never> =>
  Effect.tryPromise({
    try: () => fetch(url),
    catch: (unknown) => {
      // unknown 在这里被捕获并转换为有类型的错误
      if (unknown instanceof TypeError) {
        return new ApiError({ status: 0, message: "网络异常" });
      }
      return new ApiError({ status: 500, message: String(unknown) });
    },
  });

// 现在 safeFetch 返回的是 Effect，错误类型是确切的 ApiError

const program = Effect.gen(function* (_) {
  const response = yield* _(safeFetch("/api/data"));
  const json = yield* _(
    Effect.tryPromise({
      try: () => response.json(),
      catch: () => new ApiError({ status: response.status, message: "解析失败" }),
    })
  );
  return json;
});
```

## 1.6 典型问题处理

### 1.6.1 超时控制

Promise 缺乏内置超时机制，通常需要 `Promise.race` 配合 `AbortController`：

```typescript
// Promise 方式的超时 — 繁琐且容易出错
async function fetchWithTimeout(url: string, ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// Effect 方式的超时 — 内置支持
const fetchWithTimeout = (url: string, ms: number) =>
  Effect.tryPromise(() => fetch(url)).pipe(
    // 一行代码实现超时，超时自动触发 Fiber 中断
    Effect.timeout(ms),
    // 可以自定义超时后的错误类型
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new ApiError({ status: 408, message: "请求超时" }))
    )
  );
```

### 1.6.2 重试策略

Promise 的重试需要手动实现循环和延时：

```typescript
// Promise 方式的指数退避重试 — 需要大量样板代码
async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw new Error("不可到达");
}

// Effect 方式 — 声明式重试策略
const fetchWithRetry = Effect.tryPromise(() => fetch("/api/data")).pipe(
  // 指数退避重试，最多 3 次
  Effect.retry({
    times: 3,
    schedule: Schedule.exponential("100 millis"),
  }),
  // 也可以按错误类型选择性重试
  Effect.retry({
    times: 5,
    schedule: Schedule.spaced("1 second"),
    // 只有某些错误才重试
    while: (error) => error._tag === "NetworkError",
  })
);
```

### 1.6.3 依赖注入

Promise 的依赖是隐式的，导致测试困难：

```typescript
// Promise 方式 — 依赖通过全局变量或 module 级别注入
// 测试时不得不 mock 整个模块
const db = getDatabase(); // 全局变量
async function getUser(id: string) {
  const row = await db.query("SELECT * FROM users WHERE id = ?", [id]);
  return row;
}

// Effect 方式 — 依赖在类型层面声明
const getUser = (id: string): Effect.Effect<User, Error, Database> =>
  Effect.gen(function* (_) {
    const db = yield* _(Database);
    return yield* _(db.findById(id));
  });

// 测试时注入 mock 依赖
const testDb = new MockDatabase();
const testProgram = Effect.provideService(getUser("123"), Database, testDb);
const result = Effect.runSync(testProgram);
```

## 1.7 开发者技能：从 Promise 思维到 Effect 思维的转变

### 1.7.1 核心思维转变

从 Promise 到 Effect 不仅是 API 的切换，更是思维方式的转变：

| Promise 思维 | Effect 思维 | 本质变化 |
|---|---|---|
| "创建一个任务并立即执行" | "构建一个描述，再选择时机执行" | 分离定义与执行 |
| "await 等待结果" | "yield* _ 组合描述" | 从拉取到组合 |
| "try/catch 捕获异常" | "Effect.catchAll 类型化处理" | 从异常到值 |
| "所有依赖隐式全局" | "依赖在类型中显式声明" | 从隐式到显式 |
| "new Promise 包装回调" | "Effect.async 安全包装" | 统一异步原语 |

### 1.7.2 逐步迁移策略

不必一次性将整个代码库转换为 Effect。推荐渐进式迁移：

**第一阶段：新代码使用 Effect**

在新编写的模块中使用 Effect 构建核心逻辑，保持与旧代码的接口为 Promise。

```typescript
// 旧代码使用 Promise
class UserService {
  async getUser(id: string): Promise<User> {
    // 内部实现可以是 Effect
    return Effect.runPromise(buildGetUserEffect(id));
  }
}
```

**第二阶段：纯函数使用 Effect**

将无副作用的业务逻辑迁移到 Effect，利用其可组合性。

**第三阶段：依赖注入替换全局依赖**

将数据库连接、HTTP 客户端等基础设施替换为 Effect Service。

**第四阶段：全量迁移**

当上下游都迁移至 Effect 后，移除 Promise 桥接。

### 1.7.3 常见误区自查

- **误区一**：`Effect.sync(() => doSomething())` 和 `doSomething()` 没有区别。**事实**：前者延迟执行，后者立即执行。
- **误区二**：`Effect.runPromise(effect)` 和 `await promise` 完全等价。**事实**：Effect 提供了中断、重试、超时等 Promise 不支持的能力。
- **误区三**：`Effect<A, E, R>` 中的三个类型参数总是需要明确定义。**事实**：TypeScript 可以自动推断大部分类型。
- **误区四**：Effect 的内存开销比 Promise 大很多。**事实**：Effect 的运行时经过高度优化，额外开销极小。

## 1.8 小结

本章深入剖析了 Promise 的四个结构性缺陷：

1. **类型安全缺失**：错误类型收缩为 `unknown`，无法在编译期保证分支完备性。
2. **无法取消**：Promise 从创建就不可逆，导致资源泄漏和竞态条件。
3. **并发控制粗放**：`Promise.all` 一个失败全部失败，缺乏细粒度错误隔离。
4. **隐式副作用**：Promise 的执行时机不受控，副作用的传播不可追踪。

Effect-TS 通过 `Effect<A, E, R>` 三维模型从根本上解决了这些问题：

- **E 通道**将错误提升到类型层面，编译器强制处理所有分支。
- **Fiber 中断机制**提供了比 `AbortController` 更优雅的取消能力。
- **Effect.all 与 Effect.race** 提供了声明式并发控制，支持部分失败。
- **惰性求值**使得 Effect 成为可组合、可测试的值，与执行彻底分离。

从 Promise 到 Effect 的迁移需要思维方式的转变，但付出的学习成本将获得数十倍的回报 — 尤其是在构建大规模、高可靠性的分布式系统时。下一章将深入 Effect 的执行引擎和 Fiber 模型，进一步揭示 Effect 在并发和中断方面的设计精髓。