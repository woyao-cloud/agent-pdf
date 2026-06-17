# 第三章：极致的错误处理与领域建模

## 1. 使用场景

### 1.1 错误处理在软件工程中的核心地位

错误处理是软件工程中最重要但也最容易被忽视的环节之一。根据行业统计，在大型企业级应用中，错误处理代码通常占总代码量的 30% 到 50%。然而，尽管错误处理占据了如此大的代码比例，它却往往是质量最差、测试最不充分的部分。这主要是因为传统的错误处理机制存在诸多设计缺陷，使得开发者难以编写正确、完整、可维护的错误处理代码。

在 JavaScript/TypeScript 生态中，错误处理主要依赖于 try/catch 和 Promise 的 catch 方法。这两种机制都存在一个根本性的问题：错误是隐式的，而不是显式的。函数的类型签名无法告诉调用者它可能产生哪些错误，调用者只能通过文档注释或运行时调试来了解错误处理的需求。这种信息缺失直接导致了错误处理代码的不完整性和脆弱性。

更深层次地看，传统错误处理机制的问题根源在于：错误被视为"异常情况"，而不是程序执行路径中的正常输出。这种认知偏差导致开发者倾向于忽略错误处理，或者只在最明显的地方添加 try/catch 块。在大型项目中，这种倾向会导致大量未处理的错误在运行时才被发现，增加了调试和维护的成本。

### 1.2 Effect 错误处理的核心优势

Effect 将错误作为一等公民（First-Class Citizen）来对待，这意味着错误是类型系统的一部分，而不是运行时意外。这种设计带来了以下核心优势：

1. **类型安全**：函数签名中明确声明了可能产生的错误类型，编译器可以检查错误处理是否完整
2. **精确分类**：通过 Tagged Union 模式，可以对错误进行精确的分类和处理
3. **组合性**：错误处理操作符可以像普通函数一样组合，构建复杂的错误处理管道
4. **可恢复性**：提供了丰富的错误恢复机制，包括重试、降级、兜底等
5. **可测试性**：错误处理逻辑可以独立测试，无需依赖实际的错误产生条件
6. **可追溯性**：错误的产生和传播路径清晰可追踪，便于调试和监控
7. **可维护性**：错误类型和错误处理逻辑分离，修改错误处理不会影响业务逻辑

这些优势不是孤立的，它们相互增强。例如，类型安全使得精确分类成为可能，而精确分类又增强了组合性和可恢复性。这种协同效应使得 Effect 的错误处理机制远优于传统的 try/catch 方式。

### 1.3 适用场景

Effect 的错误处理机制特别适用于以下场景：

- **金融系统**：需要精确处理各种业务错误，如余额不足、账户锁定、风控拒绝等。在金融系统中，错误处理不仅仅是技术问题，更是业务合规的要求。每个错误都需要被精确记录和追踪。
- **微服务架构**：需要处理网络错误、服务不可用、超时等基础设施错误。微服务之间的调用链可能很长，错误需要在服务之间正确传播和转换。
- **数据管道**：需要处理数据验证错误、格式错误、转换错误等。数据管道中的错误通常需要区分哪些是可重试的，哪些是需要人工介入的。
- **用户输入处理**：需要对用户输入进行精确的验证和错误提示。良好的错误提示可以显著提升用户体验。
- **外部 API 集成**：需要处理各种 HTTP 错误、限流、认证失败等。外部 API 的错误通常需要转换为内部错误类型。
- **批处理系统**：需要在批量处理中精确记录和处理每个项目的错误。批处理中的错误不应该中断整个批处理流程。
- **物联网系统**：需要处理设备离线、数据异常、通信超时等错误。物联网场景中的错误通常具有时间敏感性。
- **游戏服务器**：需要处理玩家状态冲突、资源不足、并发访问等错误。游戏服务器的错误处理需要极低的延迟。
- **实时通信系统**：需要处理连接断开、消息丢失、协议错误等。实时通信系统的错误处理需要保证消息的可靠传递。
- **工作流引擎**：需要处理流程中断、任务失败、超时等错误。工作流引擎的错误处理需要支持补偿事务和回滚。

### 1.4 传统错误处理的痛点

在深入 Effect 的错误处理机制之前，让我们先回顾一下传统错误处理的主要痛点：

1. **错误类型丢失**：try/catch 和 Promise.catch 都会将错误归约为 any 或 unknown 类型。这意味着在 catch 块中，你无法知道具体的错误类型，只能通过 instanceof 或 message 字段来猜测。
2. **错误处理不完整**：开发者经常忘记处理某些错误，导致程序在运行时崩溃。由于错误类型不是类型系统的一部分，编译器无法帮助检查错误处理的完整性。
3. **错误处理与业务逻辑混杂**：try/catch 块使得业务逻辑和错误处理代码交织在一起，降低了代码的可读性。在复杂的业务逻辑中，try/catch 的嵌套会使代码难以理解和维护。
4. **缺乏错误分类**：所有错误都被同等对待，无法根据错误类型采取不同的处理策略。例如，网络错误可能需要重试，而验证错误只需要返回错误信息。
5. **错误恢复困难**：缺乏内置的重试、降级、兜底等错误恢复机制。开发者需要自己实现这些机制，导致代码重复和错误处理不一致。
6. **错误传播不透明**：错误的传播路径不清晰，难以追踪错误的来源。在多层调用中，错误可能被多次包装，丢失了原始上下文。
7. **测试困难**：错误处理逻辑难以独立测试。要测试某个错误处理路径，需要模拟特定的错误条件，这通常需要复杂的 mock 设置。
8. **并发错误处理复杂**：在并发场景中，多个错误可能同时发生，传统的 try/catch 无法优雅地处理多个错误。

### 1.5 Effect 错误处理与传统方式的对比

| 特性 | 传统 try/catch | Effect 错误处理 |
|------|---------------|-----------------|
| 错误类型声明 | 隐式（不在类型签名中） | 显式（在 Effect 的 E 类型参数中） |
| 类型安全 | 无（错误归约为 any/unknown） | 完整（编译器检查错误处理完整性） |
| 错误分类 | 手动（instanceof 检查） | 自动（Tagged Union 模式） |
| 错误恢复 | 手动实现 | 内置（retry, orElse, fallback） |
| 组合性 | 差（try/catch 嵌套） | 好（管道操作符组合） |
| 可测试性 | 差（需要模拟错误条件） | 好（错误处理逻辑可独立测试） |
| 并发错误处理 | 复杂 | 简单（Effect.all + either） |
| 错误传播 | 隐式（throw 传播） | 显式（类型系统追踪） |
| 性能开销 | 高（throw 的栈展开成本高） | 低（纯值操作） |

### 1.6 实际项目中的错误处理策略选择

在实际项目中，选择错误处理策略需要考虑以下因素：

1. **项目规模**：小型项目可能不需要复杂的错误处理体系，而大型项目需要系统化的错误处理方案。对于小型项目，简单的 Either 模式或 Option 模式可能就足够了；对于大型项目，需要完整的分层错误体系。
2. **团队经验**：如果团队对函数式编程不熟悉，建议从简单的错误处理模式开始，逐步引入更复杂的模式。可以先从 catchTag 和 catchAll 开始，再逐步引入 Schedule 和熔断器模式。
3. **业务复杂度**：业务逻辑越复杂，错误类型越多样，越需要精确的错误分类和处理。金融系统的错误类型可能多达几十种，而简单的 CRUD 应用可能只需要几种错误类型。
4. **可靠性要求**：对可靠性要求高的系统（如金融系统），需要更完善的错误处理机制，包括重试、降级、熔断、监控等。
5. **性能要求**：对性能要求高的系统，需要在错误处理的完备性和性能之间取得平衡。可以通过批量错误处理、轻量级错误类型等方式优化性能。

### 1.7 不同架构模式中的错误处理策略

在不同的架构模式中，错误处理策略也有所不同：

**单体架构**：错误处理相对简单，错误在同一个进程内传播。可以使用统一的分层错误体系，在系统边界处进行错误转换。

**微服务架构**：错误需要在服务之间传播，需要将错误序列化为可传输的格式。每个服务可以有自己的错误体系，在服务边界处进行错误转换。

**事件驱动架构**：错误通过事件总线传播，需要将错误建模为事件。消费者可以根据错误事件采取相应的处理策略。

**CQRS 架构**：命令和查询的错误处理策略不同。命令的错误通常需要回滚，而查询的错误通常只需要返回错误信息。

**六边形架构**：错误在端口和适配器之间传播，需要在端口边界处进行错误转换。内部领域层的错误类型应该独立于外部基础设施的错误类型。

### 1.8 错误处理与系统可观测性

错误处理与系统可观测性密切相关。良好的错误处理机制可以为可观测性提供丰富的数据：

**日志**：错误处理管道中的 tapError 操作符可以记录错误日志，包括错误类型、错误信息、上下文信息等。

**指标**：错误处理管道可以收集错误指标，如错误率、错误类型分布、错误恢复成功率等。

**追踪**：错误的传播路径可以形成追踪信息，帮助定位问题的根源。

**告警**：根据错误的严重程度和频率，可以触发不同级别的告警。

```typescript
// 可观测性集成示例
effect.pipe(
  Effect.tapError((err) =>
    Effect.sync(() => {
      // 记录日志
      logger.error({ tag: err._tag, message: err.message, context });
      // 更新指标
      metrics.incrementErrorCount(err._tag);
      // 发送告警
      if (isCriticalError(err)) {
        alerting.sendAlert(err);
      }
    })
  ),
  Effect.catchAll(handleError)
);
```

## 2. 实现原理

### 2.1 错误作为一等公民

在 Effect 中，错误是类型系统的一等公民。这意味着：

1. **错误类型在类型签名中声明**：每个 Effect 的 E 类型参数明确声明了可能产生的错误类型
2. **错误处理是强制性的**：如果调用者没有处理所有可能的错误类型，TypeScript 编译器会给出类型错误
3. **错误可以像值一样操作**：错误可以被创建、传递、转换、组合，就像普通的值一样

这种设计的思想基础是：错误不是异常情况，而是程序执行中可能出现的正常结果。一个可能失败的操作，其失败结果和成功结果一样，都是程序执行的可能输出。因此，错误应该被建模为返回值的一部分，而不是运行时意外。

在 Effect 的三维模型 `Effect<A, E, R>` 中：
- **A** 表示成功结果的类型
- **E** 表示可能产生的错误类型
- **R** 表示执行所需的上下文（依赖）

这种设计使得错误处理成为类型系统的一部分。当你看到一个函数的签名是 `Effect<User, NetworkError | NotFoundError, never>` 时，你立即知道这个函数可能产生两种错误：网络错误和未找到错误。这种信息在传统的 try/catch 方式中是完全缺失的。

```typescript
// 传统方式：错误类型完全隐藏
async function fetchUser(id: string): Promise<User> {
  // 调用者不知道可能产生哪些错误
}

// Effect 方式：错误类型显式声明
function fetchUser(id: string): Effect.Effect<User, NetworkError | NotFoundError, never> {
  // 调用者从类型签名中知道可能产生 NetworkError 或 NotFoundError
}
```

### 2.2 Tagged Union 模式

Tagged Union（也称为 Discriminated Union 或 Algebraic Data Type）是 TypeScript 中一种强大的类型模式。它使用一个特定的字段（通常命名为 `_tag`）来区分联合类型中的不同成员。

```typescript
class NetworkError {
  readonly _tag = "NetworkError";
  constructor(readonly message: string, readonly statusCode: number) {}
}

class ValidationError {
  readonly _tag = "ValidationError";
  constructor(readonly field: string, readonly message: string) {}
}

type AppError = NetworkError | ValidationError;
```

Tagged Union 的核心优势在于：

1. **类型收窄**：TypeScript 可以根据 `_tag` 字段的值自动收窄类型。当你检查 `err._tag === "NetworkError"` 时，TypeScript 知道在这个分支中 `err` 是 `NetworkError` 类型。
2. **穷举检查**：在 switch 语句中，TypeScript 可以检查是否处理了所有可能的类型。如果添加了新的错误类型但没有更新 switch 语句，编译器会报错。
3. **携带上下文**：每个错误类型可以携带与其相关的上下文信息。例如，`ValidationError` 可以携带字段名和验证失败的值。
4. **可组合性**：多个错误类型可以组合成联合类型，形成错误体系。你可以将基础设施错误、数据错误、业务错误分别定义，然后组合成应用级错误类型。

#### Tagged Union 的命名约定

在 Effect 生态中，`_tag` 字段的命名遵循以下约定：

- 使用 PascalCase 作为标签值，如 `"NetworkError"`、`"ValidationError"`
- 标签值通常与类名相同，便于识别
- 标签值应该是唯一的，避免不同错误类型使用相同的标签值

#### Tagged Union 与模式匹配

Tagged Union 与模式匹配天然契合。在 TypeScript 中，可以使用 switch 语句实现模式匹配：

```typescript
function handleError(err: AppError): string {
  switch (err._tag) {
    case "NetworkError":
      return `网络错误: ${err.message} (状态码: ${err.statusCode})`;
    case "ValidationError":
      return `验证错误: 字段 ${err.field} - ${err.message}`;
    default:
      // TypeScript 会检查这里是否穷举了所有类型
      const _exhaustive: never = err;
      return _exhaustive;
  }
}
```

`never` 类型的穷举检查是一种常见的模式。如果 `AppError` 新增了一个成员但没有更新 switch 语句，`err` 在 default 分支中就不会是 `never` 类型，编译器会报错。

### 2.3 catchTag/catchAll/mapError 操作符

Effect 提供了三个核心的错误处理操作符，它们构成了错误处理的基础设施。

#### catchTag

`catchTag` 用于捕获特定标签的错误。它接受两个参数：要捕获的错误标签和错误处理函数。

```typescript
effect.pipe(
  Effect.catchTag("NotFoundError", (err) => {
    // 只处理 NotFoundError
    return Effect.succeed("兜底值");
  })
);
```

`catchTag` 的关键特性：

- **精确匹配**：只捕获指定标签的错误，其他错误不受影响
- **类型安全**：错误处理函数的参数类型被自动收窄为指定的错误类型
- **链式调用**：多个 catchTag 可以链式调用，形成精确的错误处理链
- **顺序敏感**：catchTag 的调用顺序很重要，先调用的先匹配

```typescript
// 链式调用示例
effect.pipe(
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchTag("ValidationError", handleValidation),
  Effect.catchTag("NetworkError", handleNetwork),
  // 如果上面都没有匹配，错误继续传播
);
```

#### catchAll

`catchAll` 用于捕获所有类型的错误。它接受一个错误处理函数，该函数需要处理所有可能的错误类型。

```typescript
effect.pipe(
  Effect.catchAll((err) => {
    // 处理所有类型的错误
    return Effect.succeed("兜底值");
  })
);
```

`catchAll` 的关键特性：

- **全面捕获**：捕获所有类型的错误，包括未被 catchTag 处理的错误
- **类型统一**：将所有错误类型统一为一种处理方式
- **兜底保障**：作为错误处理链的最后一道防线
- **注意**：catchAll 不会捕获 Defect（非预期错误）

#### mapError

`mapError` 用于转换错误类型。它接受一个错误转换函数，将原始错误转换为新的错误类型。

```typescript
effect.pipe(
  Effect.mapError((err) => {
    if (err._tag === "NetworkError") {
      return new AppError("NETWORK_ERROR", err.message);
    }
    return new AppError("UNKNOWN", "未知错误");
  })
);
```

`mapError` 的关键特性：

- **类型转换**：将一种错误类型转换为另一种错误类型
- **错误抽象**：可以将底层错误转换为高层错误，实现错误抽象
- **错误包装**：可以在原始错误的基础上添加额外的上下文信息
- **非破坏性**：原始错误信息不会丢失，可以包含在转换后的错误中

#### catchSome

`catchSome` 提供了一种条件性的错误捕获机制。它接受一个返回 `Option` 的处理函数，当返回 `Some` 时表示处理了该错误，返回 `None` 时表示不处理。

```typescript
effect.pipe(
  Effect.catchSome((err) => {
    if (err._tag === "NotFoundError" && err.entity === "User") {
      return Effect.option(Effect.succeed("默认用户"));
    }
    return Effect.option.none();
  })
);
```

#### orElse

`orElse` 在原始 Effect 失败时执行备选 Effect。它类似于"如果 A 失败，就尝试 B"的模式。

```typescript
effect.pipe(
  Effect.orElse(() => fallbackEffect)
);
```

#### orElseFail

`orElseFail` 在原始 Effect 失败时，用一个指定的错误替换原始错误。

```typescript
effect.pipe(
  Effect.orElseFail(() => new AppError("FALLBACK", "所有备选方案都失败了"))
);
```

#### orElseSucceed

`orElseSucceed` 在原始 Effect 失败时，返回一个指定的成功值。

```typescript
effect.pipe(
  Effect.orElseSucceed(() => "兜底值")
);
```

#### catchTag/catchAll/mapError 使用模式详解

在实际项目中，catchTag、catchAll 和 mapError 三个操作符构成了 Effect 错误处理的核心工具箱。理解它们的使用模式和适用场景，是掌握 Effect 错误处理的关键。

**catchTag 的使用模式**：

catchTag 适用于已知错误类型的精确处理。每个 catchTag 调用处理一种特定的错误类型，多个 catchTag 可以链式调用形成错误处理链。catchTag 的类型安全特性确保错误处理函数的参数类型被自动收窄为指定的错误类型。

```typescript
// 典型的使用模式：先精确后通用
effect.pipe(
  Effect.catchTag("NotFoundError", (err) => {
    // 只处理 NotFoundError，err 类型自动收窄为 NotFoundError
    logger.warn(`资源未找到: ${err.entity}:${err.id}`);
    return Effect.succeed(null);
  }),
  Effect.catchTag("ValidationError", (err) => {
    // 只处理 ValidationError，err 类型自动收窄为 ValidationError
    logger.warn(`验证失败: ${err.field} - ${err.message}`);
    return Effect.fail(new BusinessError("INVALID_INPUT", err.message));
  }),
  Effect.catchTag("NetworkError", (err) => {
    // 只处理 NetworkError，err 类型自动收窄为 NetworkError
    if (err.statusCode >= 500) {
      return Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.recurs(3)));
    }
    return Effect.fail(err);
  })
);
```

**catchTag 的链式调用顺序**：

catchTag 的调用顺序非常重要。Effect 会按照 catchTag 的注册顺序依次检查错误类型，第一个匹配的 catchTag 会处理该错误。因此，应该将更具体的错误类型放在前面，更通用的错误类型放在后面。

```typescript
// 正确的顺序：从具体到通用
effect.pipe(
  Effect.catchTag("NotFoundError", handleNotFound),     // 最具体
  Effect.catchTag("ValidationError", handleValidation), // 较具体
  Effect.catchTag("Error", handleGenericError),          // 较通用
  Effect.catchAll(handleUnknown)                        // 最通用
);
```

**catchAll 的使用模式**：

catchAll 适用于兜底处理，作为错误处理链的最后一道防线。它捕获所有未被前面 catchTag 处理的错误。catchAll 不会捕获 Defect，这是它与 catchAllDefect 的关键区别。

```typescript
// catchAll 的典型使用模式
effect.pipe(
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchTag("ValidationError", handleValidation),
  Effect.catchAll((err) => {
    // 兜底处理：记录日志并返回默认值
    logger.error("未处理的错误类型:", err);
    metrics.incrementCounter("unhandled_errors");
    return Effect.succeed(defaultValue);
  })
);
```

**catchAll 的常见误用**：

```typescript
// 错误做法：在管道开头使用 catchAll 会吞没所有错误
effect.pipe(
  Effect.catchAll((err) => {
    // 所有错误都被统一处理，无法区分
    return Effect.succeed("兜底值");
  }),
  Effect.catchTag("NotFoundError", handleNotFound) // 这永远不会执行
);

// 正确做法：catchAll 放在最后
effect.pipe(
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchAll((err) => Effect.succeed("兜底值"))
);
```

**mapError 的使用模式**：

mapError 适用于错误类型转换，特别是在系统边界处将底层错误转换为高层错误。mapError 不会改变 Effect 的成功值类型，只转换错误类型。

```typescript
// mapError 的典型使用模式
// 在数据访问层，将数据库错误转换为领域错误
const findUser = (id: string): Effect.Effect<User, DomainError, never> =>
  database.query(`SELECT * FROM users WHERE id = ?`, [id]).pipe(
    Effect.mapError((dbError) => {
      switch (dbError.code) {
        case "ER_DUP_ENTRY":
          return new DomainError("DUPLICATE_USER", `用户已存在: ${id}`);
        case "ER_NO_REFERENCED_ROW":
          return new DomainError("INVALID_REFERENCE", `引用的记录不存在: ${id}`);
        default:
          return new DomainError("DATABASE_ERROR", `数据库错误: ${dbError.message}`);
      }
    })
  );
```

**mapError 的分层转换**：

在分层架构中，mapError 用于在每一层将错误转换为该层的抽象级别：

```typescript
// 分层错误转换
// 基础设施层 -> 数据访问层 -> 业务层 -> 表现层
const getUserHandler = (id: string) =>
  pipe(
    findUserInDatabase(id),
    Effect.mapError((dbErr) => new DataError("QUERY_FAILED", dbErr.message)),     // 基础设施 -> 数据
    Effect.flatMap(validateUser),
    Effect.mapError((valErr) => new BusinessError("VALIDATION", valErr.message)), // 数据 -> 业务
    Effect.flatMap(formatResponse),
    Effect.mapError((bizErr) => new ApiError(400, bizErr.message))                // 业务 -> 表现
  );
```

**三种操作符的组合使用**：

在实际项目中，这三种操作符经常组合使用，形成完整的错误处理管道：

```typescript
// 完整的错误处理管道
const getUserWithFullErrorHandling = (id: string) =>
  Effect.gen(function* () {
    // 业务逻辑
    const user = yield* findUser(id);
    const validated = yield* validateUser(user);
    return yield* processUser(validated);
  }).pipe(
    // 1. 错误转换：将底层错误转换为领域错误
    Effect.mapError((err) => convertToDomainError(err)),
    // 2. 精确处理已知错误
    Effect.catchTag("NotFoundError", (err) =>
      Effect.succeed(getDefaultUser())
    ),
    Effect.catchTag("ValidationError", (err) =>
      Effect.fail(new PresentationError("INVALID_DATA", err.message))
    ),
    // 3. 兜底处理
    Effect.catchAll((err) => {
      logger.error("未处理的错误:", err);
      return Effect.fail(new PresentationError("INTERNAL_ERROR", "系统内部错误"));
    })
  );
```

**操作符选择速查表**：

| 需求 | 操作符 | 说明 |
|------|--------|------|
| 捕获特定标签的错误 | catchTag | 精确匹配，类型安全 |
| 捕获所有预期错误 | catchAll | 兜底处理，不捕获 Defect |
| 转换错误类型 | mapError | 错误抽象和分层 |
| 条件性捕获 | catchIf | 基于谓词条件捕获 |
| 选择性捕获 | catchSome | 返回 Option 的条件捕获 |
| 失败时执行备选 | orElse | 尝试备选 Effect |
| 失败时替换错误 | orElseFail | 用指定错误替换 |
| 失败时返回默认值 | orElseSucceed | 返回指定成功值 |
| 捕获所有 Defect | catchAllDefect | 捕获非预期错误 |
| 暴露所有错误 | sandbox | 将 Defect 纳入错误类型 |

### 2.4 Defect 与 Error 的区别

在 Effect 中，错误被分为两类：Error（预期错误）和 Defect（非预期错误）。

#### Error（预期错误）

Error 是在类型系统中声明的、程序预期可能发生的错误。例如：

- 网络请求失败
- 数据验证失败
- 业务逻辑错误
- 资源不存在

Error 通过 `Effect.fail` 创建，其类型被编码在 Effect 的 E 类型参数中。Error 可以被 catchTag、catchAll 等操作符捕获和处理。

#### Defect（非预期错误）

Defect 是程序中的 bug 或非预期情况，例如：

- 数组越界访问
- 空指针引用
- 断言失败
- 类型转换错误
- 除零错误

Defect 通过 `Effect.die` 创建，其类型不在 Effect 的 E 类型参数中声明。Defect 不会被 catchTag 或 catchAll 捕获，而是会导致程序崩溃。如果需要捕获 Defect，可以使用 `catchAllDefect` 操作符。

#### Error 与 Defect 的对比

| 特性 | Error（预期错误） | Defect（非预期错误） |
|------|------------------|---------------------|
| 创建方式 | `Effect.fail(err)` | `Effect.die(err)` |
| 类型声明 | 在 E 类型参数中声明 | 不在类型系统中声明 |
| 可捕获性 | 可被 catchTag/catchAll 捕获 | 不可被 catchTag/catchAll 捕获 |
| 捕获方式 | catchTag, catchAll | catchAllDefect |
| 语义 | 业务预期可能发生的错误 | 程序中的 bug 或非预期情况 |
| 处理策略 | 优雅处理（重试、降级、兜底） | 快速失败（让程序崩溃以便修复） |
| 测试策略 | 编写测试覆盖每种错误类型 | 编写测试确保不会发生 |
| 运行时行为 | 返回错误值，继续执行 | 抛出异常，中断执行 |

#### 为什么区分 Error 和 Defect？

这种区分的核心思想是：预期错误是程序正常执行路径的一部分，应该被优雅地处理；而非预期错误是程序中的 bug，应该让程序尽快失败，以便开发者及时发现和修复。

在实际应用中，这种区分有助于：

1. **明确错误边界**：开发者可以清楚地知道哪些错误是预期的，哪些是非预期的
2. **避免错误吞没**：非预期错误不会被错误处理代码吞没，而是会传播到顶层
3. **提高代码质量**：非预期错误的快速失败机制促使开发者编写更健壮的代码
4. **简化错误处理**：开发者只需要关注预期错误，非预期错误由运行时自动处理

#### 如何选择使用 Error 还是 Defect？

一个简单的判断标准是：如果错误是调用者应该处理的，使用 Error；如果错误是程序员的失误导致的，使用 Defect。

```typescript
// 应该使用 Error：调用者需要处理网络错误
function fetchData(url: string): Effect.Effect<Data, NetworkError, never> {
  // ...
}

// 应该使用 Defect：这是程序员的失误
function assertNonNull<T>(value: T | null): T {
  if (value === null) {
    return Effect.die(new Error("断言失败: 值不应为 null"));
  }
  return value;
}
```

#### Defect 与 Error 的深入对比

在实际开发中，正确区分 Defect 和 Error 是编写健壮 Effect 应用的关键。以下从多个维度深入分析两者的区别：

**创建方式对比**：

```typescript
// Error：使用 Effect.fail 创建，错误类型在 E 类型参数中声明
const error = Effect.fail(new NotFoundError("User", "123"));
// 类型: Effect<never, NotFoundError, never>

// Defect：使用 Effect.die 创建，错误类型不在类型系统中声明
const defect = Effect.die(new Error("程序错误：不应该到达这里"));
// 类型: Effect<never, never, never> — 注意 E 类型参数是 never
```

**捕获方式对比**：

```typescript
// Error 可以被 catchAll 捕获
Effect.fail(new NotFoundError("User", "123")).pipe(
  Effect.catchAll((err) => {
    // err 的类型是 NotFoundError
    return Effect.succeed("已处理");
  })
);

// Defect 不能被 catchAll 捕获
Effect.die(new Error("程序错误")).pipe(
  Effect.catchAll((err) => {
    // 这个 catchAll 不会捕获 Defect
    return Effect.succeed("不会执行到这里");
  }),
  Effect.catchAllDefect((defect) => {
    // 需要使用 catchAllDefect 捕获 Defect
    console.error("捕获到 Defect:", defect);
    return Effect.succeed("从 Defect 恢复");
  })
);
```

**类型系统表现对比**：

```typescript
// Error 在类型系统中可见
function divide(a: number, b: number): Effect.Effect<number, DivideByZeroError, never> {
  if (b === 0) {
    return Effect.fail(new DivideByZeroError());
  }
  return Effect.succeed(a / b);
}
// 调用者从类型签名知道可能产生 DivideByZeroError

// Defect 不在类型系统中可见
function assertPositive(n: number): number {
  if (n <= 0) {
    Effect.die(new Error("断言失败: n 必须为正数"));
  }
  return n;
}
// 调用者无法从类型签名知道可能产生 Defect
```

**运行时行为对比**：

```typescript
// Error 的运行时行为：返回错误值，程序继续执行
const result1 = Effect.runSyncExit(
  Effect.fail(new Error("预期错误"))
);
// result1._tag === "Failure"
// result1.cause._tag === "Fail"

// Defect 的运行时行为：抛出异常，程序中断
const result2 = Effect.runSyncExit(
  Effect.die(new Error("非预期错误"))
);
// result2._tag === "Failure"
// result2.cause._tag === "Die"
```

**何时使用 Error，何时使用 Defect**：

| 场景 | 使用 Error | 使用 Defect |
|------|-----------|------------|
| 业务逻辑验证失败 | 是 | 否 |
| 网络请求失败 | 是 | 否 |
| 用户输入无效 | 是 | 否 |
| 数组越界访问 | 否 | 是 |
| 空指针引用 | 否 | 是 |
| 类型断言失败 | 否 | 是 |
| 配置缺失（可恢复） | 是 | 否 |
| 配置缺失（不可恢复） | 否 | 是 |
| 数据库连接失败（可重试） | 是 | 否 |
| 不应该发生的代码路径 | 否 | 是 |
| 第三方库抛出异常 | 是（tryPromise 转换） | 否 |

**最佳实践**：

1. **优先使用 Error**：对于所有可预见的错误情况，优先使用 `Effect.fail` 创建 Error。这使得错误类型在类型系统中可见，调用者可以精确处理。

2. **Defect 用于断言**：Defect 应该用于断言程序的不变量，而不是用于业务逻辑。例如，断言某个值不应该为 null。

3. **在边界处转换**：在系统边界处，将第三方库的异常通过 `Effect.tryPromise` 转换为 Effect 的 Error。这确保了第三方库的错误不会以 Defect 的形式传播。

4. **使用 catchAllDefect 作为安全网**：在顶层使用 `catchAllDefect` 捕获所有未预期的 Defect，记录日志并尝试恢复。

5. **记录 Defect 的上下文**：当捕获 Defect 时，记录足够的上下文信息以便调试。Defect 通常表示程序中的 bug，需要开发人员介入修复。

6. **使用 sandbox 暴露所有错误**：在需要全面错误处理的场景中，使用 `Effect.sandbox` 将 Defect 也纳入错误类型中，实现统一的错误处理。

### 2.5 错误处理管道

Effect 的错误处理机制支持构建复杂的错误处理管道。一个典型的错误处理管道包括以下阶段：

1. **错误分类**：根据错误类型进行分类
2. **错误转换**：将底层错误转换为高层错误
3. **错误恢复**：尝试从错误中恢复
4. **重试策略**：对可重试的错误进行重试
5. **降级处理**：在错误无法恢复时提供降级方案
6. **兜底处理**：作为最后一道防线的兜底处理

```typescript
effect.pipe(
  // 重试策略
  Effect.retry(retryPolicy),
  // 精确错误处理
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchTag("ValidationError", handleValidation),
  // 错误转换
  Effect.catchTag("HttpError", (err) => 
    Effect.fail(new AppError("NETWORK_ERROR", err.message))
  ),
  // 兜底处理
  Effect.catchAll(handleUnknown)
);
```

#### 错误处理管道的设计原则

1. **从精确到通用**：先处理具体的错误类型，再处理通用的错误类型
2. **从可恢复到不可恢复**：先尝试恢复错误，再处理不可恢复的错误
3. **从业务到基础设施**：先处理业务错误，再处理基础设施错误
4. **兜底保障**：始终在管道的最后添加 catchAll 作为兜底

### 2.6 重试策略与 Schedule

Effect 的 Schedule 系统提供了灵活的重试策略定义能力。Schedule 可以描述重试的次数、间隔、退避策略等。

```typescript
// 指数退避重试
const exponentialBackoff = Schedule.exponential("100 millis").pipe(
  Schedule.recurs(3),
  Schedule.whileInput((err) => err._tag === "NetworkError")
);

// 固定间隔重试
const fixedInterval = Schedule.fixed("1 second").pipe(
  Schedule.recurs(5)
);

// 自定义重试策略
const customRetry = Schedule.recurs(3).pipe(
  Schedule.addDelay((err) => {
    if (err._tag === "RateLimitError") {
      return Duration.millis(err.retryAfterMs);
    }
    return Duration.millis(100);
  })
);
```

#### Schedule 的核心概念

1. **重试次数**：通过 `Schedule.recurs(n)` 限制最大重试次数
2. **重试间隔**：通过 `Schedule.fixed`、`Schedule.exponential`、`Schedule.addDelay` 控制重试间隔
3. **重试条件**：通过 `Schedule.whileInput`、`Schedule.untilInput` 控制重试的条件
4. **退避策略**：指数退避、固定间隔、随机间隔等
5. **组合策略**：多个 Schedule 可以组合使用

#### 常见的重试策略

```typescript
// 指数退避 + 随机抖动
const exponentialWithJitter = Schedule.exponential("100 millis").pipe(
  Schedule.recurs(5),
  Schedule.jittered(Duration.millis(0), Duration.millis(50))
);

// 最大重试时间限制
const maxDurationRetry = Schedule.fixed("1 second").pipe(
  Schedule.recurs(10),
  Schedule.upTo("30 seconds")
);

// 根据错误类型选择重试策略
const smartRetry = Schedule.recurs(3).pipe(
  Schedule.addDelay((err: AppError) => {
    switch (err._tag) {
      case "NetworkTimeoutError":
        return Duration.seconds(5);  // 网络超时，等待久一点
      case "RateLimitError":
        return Duration.millis(err.retryAfterMs);  // 按限流要求等待
      case "HttpError":
        return Duration.seconds(1);  // HTTP 错误，快速重试
      default:
        return Duration.millis(100);  // 其他错误，快速重试
    }
  })
);
```

### 2.7 Effect.either 与 Effect.option

Effect 提供了 `either` 和 `option` 操作符，用于将错误转换为值，从而在类型层面消除错误。

#### Effect.either

`Effect.either` 将 `Effect<A, E, R>` 转换为 `Effect<Either<A, E>, never, R>`。Either 类型有两个变体：`Left`（包含错误）和 `Right`（包含成功值）。

```typescript
const result = yield* Effect.either(someEffect);

if (result._tag === "Left") {
  console.log("失败:", result.left);
} else {
  console.log("成功:", result.right);
}
```

`Effect.either` 的关键用途：

1. **消除错误类型**：将 E 类型参数变为 `never`，使得后续操作不需要处理错误
2. **收集所有错误**：在并发场景中，可以收集所有任务的错误
3. **条件处理**：根据成功或失败的结果进行不同的处理

#### Effect.option

`Effect.option` 将 `Effect<A, E, R>` 转换为 `Effect<Option<A>, never, R>`。Option 类型有两个变体：`Some`（包含值）和 `None`（没有值）。

```typescript
const result = yield* Effect.option(someEffect);

if (result._tag === "Some") {
  console.log("有值:", result.value);
} else {
  console.log("没有值");
}
```

`Effect.option` 的关键用途：

1. **忽略错误细节**：只关心成功或失败，不关心具体的错误类型
2. **简化处理**：当不需要区分不同的错误类型时使用
3. **可选值处理**：将可能失败的操作转换为可选值

### 2.8 Effect.flip 与错误和成功的互换

`Effect.flip` 用于交换 Effect 的成功类型和错误类型。这在某些场景中非常有用。

```typescript
// 原始类型: Effect<A, E, R>
// flip 后: Effect<E, A, R>

const flipped = Effect.flip(someEffect);
```

`Effect.flip` 的典型应用场景：

1. **错误收集**：将错误作为成功值收集起来
2. **错误优先处理**：先处理错误，再处理成功值
3. **类型转换**：在需要交换成功和错误类型的场景中使用

### 2.9 Effect.sandbox 与 Effect.unsandbox

`Effect.sandbox` 将 Defect 也纳入错误类型中，使得所有错误（包括 Defect）都可以被捕获和处理。

```typescript
// sandbox 后，Defect 也被包含在错误类型中
const sandboxed = Effect.sandbox(someEffect);
// 类型变为: Effect<A, Cause<E>, R>
// Cause<E> 包含了 Error 和 Defect
```

`Effect.unsandbox` 是 `Effect.sandbox` 的逆操作，将 Cause 类型还原为普通的错误类型。

```typescript
const unsandboxed = Effect.unsandbox(sandboxed);
// 类型恢复为: Effect<A, E, R>
```

#### Cause 类型

`Cause` 是 Effect 中表示错误原因的类型。它可以包含：

- **Fail**：预期错误（Error）
- **Die**：非预期错误（Defect）
- **Interrupt**：中断
- **Then**：顺序组合的多个原因
- **Both**：并行组合的多个原因

```typescript
type Cause<E> =
  | { readonly _tag: "Fail"; readonly error: E }
  | { readonly _tag: "Die"; readonly defect: unknown }
  | { readonly _tag: "Interrupt"; readonly fiberId: FiberId }
  | { readonly _tag: "Then"; readonly left: Cause<E>; readonly right: Cause<E> }
  | { readonly _tag: "Both"; readonly left: Cause<E>; readonly right: Cause<E> };
```

### 2.10 Effect.catchIf

`Effect.catchIf` 提供了一种基于条件的错误捕获机制。它接受一个谓词函数，只有满足条件的错误才会被捕获。

```typescript
effect.pipe(
  Effect.catchIf(
    (err) => err._tag === "NetworkError" && err.statusCode >= 500,
    (err) => Effect.succeed("服务器错误，使用缓存数据")
  )
);
```

### 2.11 Effect.firstSuccessOf

`Effect.firstSuccessOf` 接受一个 Effect 数组，依次执行每个 Effect，直到有一个成功为止。如果所有 Effect 都失败，则返回最后一个错误。

```typescript
const result = Effect.firstSuccessOf([
  fetchFromPrimary(),
  fetchFromSecondary(),
  fetchFromCache(),
]);
```

这在实现多级降级策略时非常有用。例如，先尝试从主数据库获取数据，失败时尝试从从数据库获取，再失败时尝试从缓存获取。

### 2.13 错误处理与函数式编程的关系

Effect 的错误处理机制深深植根于函数式编程的理念。理解这些理念有助于更好地掌握 Effect 的错误处理。

#### 纯函数与错误处理

纯函数是函数式编程的基石。纯函数没有副作用，相同的输入总是产生相同的输出。在 Effect 中，错误被建模为输出的一部分，而不是副作用。这意味着一个可能失败的函数仍然是纯函数，因为它的输出类型中包含了错误类型。

```typescript
// 纯函数：错误是输出的一部分
function divide(a: number, b: number): Effect.Effect<number, Error, never> {
  if (b === 0) {
    return Effect.fail(new Error("除以零"));
  }
  return Effect.succeed(a / b);
}
```

#### 引用透明性与错误处理

引用透明性是指表达式可以被其计算结果替换而不改变程序的行为。在 Effect 中，由于错误是类型系统的一部分，错误处理代码也是引用透明的。这意味着错误处理逻辑可以被提取、组合、测试，就像普通的值一样。

#### 单子与错误处理

Effect 是一个单子（Monad），它遵循单子的三个法则：左单位元、右单位元、结合律。这些法则确保了 Effect 的组合性是可靠的。错误处理操作符（如 catchTag、catchAll）也遵循这些法则，使得错误处理逻辑可以安全地组合。

#### 函子与错误处理

Effect 也是一个函子（Functor），可以通过 map 转换成功值。类似地，mapError 可以转换错误值。这种对称性体现了函数式编程中的对偶性（Duality）原则。

```typescript
// 函子操作：map 转换成功值，mapError 转换错误值
effect.pipe(
  Effect.map((value) => transformSuccess(value)),
  Effect.mapError((err) => transformError(err))
);
```

`Effect.retry` 可以与 Schedule 深度结合，实现复杂的重试逻辑。

```typescript
// 带条件的重试
effect.pipe(
  Effect.retry(
    Schedule.exponential("100 millis").pipe(
      Schedule.recurs(3),
      Schedule.whileInput((err) => err._tag === "NetworkError")
    )
  )
);

// 重试直到成功或超时
effect.pipe(
  Effect.retry(
    Schedule.fixed("1 second").pipe(
      Schedule.recurs(10),
      Schedule.upTo("30 seconds")
    )
  )
);
```

## 3. 潜在风险与优化

### 3.1 错误类型膨胀

随着应用规模的增大，错误类型的数量可能会快速增长，导致错误类型体系变得庞大和复杂。过多的错误类型会增加理解和维护的难度。

**优化策略**：

1. **分层错误体系**：将错误分为基础设施层、数据层、业务层等层次，每层定义自己的错误类型
2. **错误类型聚合**：使用联合类型将相关的错误类型聚合在一起
3. **错误类型抽象**：在系统边界处将底层错误转换为高层错误
4. **避免过度细化**：不要为每个可能的错误都创建独立的类型，只在需要不同处理策略时才创建
5. **错误类型命名规范**：建立统一的错误类型命名规范，便于识别和查找
6. **定期审查**：定期审查错误类型体系，合并重复或相似的类型

```typescript
// 分层错误体系示例
// 基础设施层
type InfrastructureError = HttpError | NetworkTimeoutError | RateLimitError;

// 数据层
type DataError = ValidationError | NotFoundError | ConflictError;

// 业务层
type BusinessError = InsufficientFundsError | AccountLockedError | FraudDetectionError;

// 应用层
type AppError = InfrastructureError | DataError | BusinessError;
```

### 3.2 错误处理遗漏

虽然 Effect 的类型系统可以帮助发现未处理的错误，但在某些情况下，开发者可能仍然会遗漏错误处理。例如，当使用 `catchAll` 时，所有错误都被统一处理，可能会掩盖某些需要特殊处理的错误。

**优化策略**：

1. **先精确后兜底**：先使用 catchTag 处理已知的错误类型，再使用 catchAll 作为兜底
2. **错误审计**：定期审计错误处理代码，确保所有错误类型都被正确处理
3. **测试覆盖**：为每种错误类型编写测试用例，确保错误处理逻辑的正确性
4. **监控告警**：在生产环境中监控未处理的错误，及时发现和处理
5. **代码审查**：在代码审查中重点关注错误处理逻辑
6. **类型检查**：利用 TypeScript 的严格模式，确保错误处理的完整性

```typescript
// 推荐的错误处理模式
effect.pipe(
  // 先精确处理已知的错误类型
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchTag("ValidationError", handleValidation),
  Effect.catchTag("NetworkError", handleNetwork),
  // 再兜底处理未知的错误类型
  Effect.catchAll((err) => {
    // 记录日志
    console.error("未处理的错误:", err);
    // 返回兜底值
    return Effect.succeed(fallbackValue);
  })
);
```

### 3.3 性能开销

错误类型的创建和错误处理操作符的调用会带来一定的运行时开销。在性能敏感的场景中，这种开销可能成为问题。

**优化策略**：

1. **减少不必要的错误类型创建**：避免在正常执行路径中创建错误类型
2. **使用轻量级错误类型**：错误类型应该只包含必要的字段，避免携带大量数据
3. **批量错误处理**：将多个错误合并处理，减少错误处理操作符的调用次数
4. **使用 Effect.sync 包装**：将错误创建逻辑放在 Effect.sync 中，利用惰性求值减少开销
5. **避免过度重试**：合理设置重试次数和间隔，避免不必要的重试开销
6. **使用 Effect.either 减少错误处理链**：在不需要精确错误处理的场景中，使用 Effect.either 简化处理

```typescript
// 性能优化示例：使用 Effect.either 减少错误处理链
// 不推荐：复杂的错误处理链
effect.pipe(
  Effect.catchTag("ErrorA", handleA),
  Effect.catchTag("ErrorB", handleB),
  Effect.catchTag("ErrorC", handleC),
  Effect.catchAll(handleAll)
);

// 推荐：如果不需要区分错误类型，使用 either 简化
Effect.either(effect).pipe(
  Effect.map((result) => {
    if (result._tag === "Left") {
      return handleAll(result.left);
    }
    return result.right;
  })
);
```

### 3.4 错误处理与业务逻辑的耦合

虽然 Effect 的错误处理机制比 try/catch 更清晰，但如果使用不当，仍然可能导致错误处理逻辑与业务逻辑的耦合。

**优化策略**：

1. **分离关注点**：将错误处理逻辑从业务逻辑中分离出来
2. **使用错误处理管道**：通过管道操作符将错误处理逻辑串联起来
3. **定义错误处理策略**：为不同类型的错误定义统一的处理策略
4. **使用中间件模式**：在系统边界处使用中间件来处理错误
5. **错误处理函数复用**：将通用的错误处理逻辑提取为独立的函数

```typescript
// 分离错误处理逻辑
// 业务逻辑：只关注核心业务
const businessLogic = Effect.gen(function* () {
  const data = yield* fetchData();
  const validated = yield* validate(data);
  const result = yield* process(validated);
  return result;
});

// 错误处理：独立于业务逻辑
const withErrorHandling = businessLogic.pipe(
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchTag("ValidationError", handleValidation),
  Effect.catchAll(handleUnknown)
);
```

### 3.5 错误类型设计原则

设计良好的错误类型体系是有效错误处理的基础。以下是一些设计原则：

1. **单一职责**：每个错误类型只表示一种错误情况
2. **信息丰富**：错误类型应该携带足够的上下文信息，便于定位问题
3. **层次清晰**：错误类型应该有清晰的层次结构
4. **可序列化**：错误类型应该可以被序列化，便于日志记录和网络传输
5. **向前兼容**：添加新的错误类型不应该破坏现有的错误处理代码
6. **领域驱动**：错误类型应该反映领域概念，而不是技术实现细节

```typescript
// 好的错误类型设计
class InsufficientBalanceError {
  readonly _tag = "InsufficientBalanceError";
  constructor(
    readonly accountId: string,    // 哪个账户
    readonly balance: number,      // 当前余额
    readonly required: number,     // 需要多少
    readonly currency: string,    // 币种
    readonly timestamp: Date       // 发生时间
  ) {}
}

// 不好的错误类型设计
class Error1 {
  readonly _tag = "Error1";
  constructor(readonly message: string) {}  // 信息太少，无法定位问题
}
```

### 3.6 错误处理的演进策略

在实际项目中，错误处理体系的建设是一个渐进的过程。以下是一个推荐的演进路径：

#### 第一阶段：基础错误处理

从最简单的错误处理模式开始，使用 catchTag 和 catchAll 处理基本的错误场景。

```typescript
// 第一阶段：基础错误处理
effect.pipe(
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchAll(handleUnknown)
);
```

#### 第二阶段：错误类型体系

随着项目规模的增长，建立分层的错误类型体系，将错误分为基础设施层、数据层、业务层。

```typescript
// 第二阶段：分层错误体系
type AppError = InfrastructureError | DataError | BusinessError;
```

#### 第三阶段：重试与恢复

引入重试策略和错误恢复机制，对可重试的错误进行自动重试。

```typescript
// 第三阶段：重试策略
effect.pipe(
  Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.recurs(3))),
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchAll(handleUnknown)
);
```

#### 第四阶段：熔断与降级

引入熔断器模式和降级策略，保护系统稳定性。

```typescript
// 第四阶段：熔断器
const circuitBreaker = new CircuitBreaker(5, 30000);
effect.pipe(
  circuitBreaker.call,
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchAll(handleUnknown)
);
```

#### 第五阶段：监控与告警

集成监控和告警系统，实时监控错误处理的状态。

```typescript
// 第五阶段：监控集成
effect.pipe(
  Effect.tapError((err) => monitor.recordError(err)),
  Effect.retry(retryPolicy),
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchAll(handleUnknown)
);
```

### 3.7 错误处理策略的测试策略

错误处理逻辑的测试是确保系统健壮性的关键。以下是一些测试策略：

1. **单元测试**：为每个错误处理函数编写单元测试
2. **集成测试**：测试错误处理管道在真实场景中的行为
3. **边界测试**：测试错误处理的边界条件
4. **并发测试**：测试并发场景中的错误处理
5. **恢复测试**：测试错误恢复机制的正确性
6. **性能测试**：测试错误处理对系统性能的影响

```typescript
// 错误处理测试示例
import { Effect, Exit } from "effect";

// 测试 catchTag 是否正确捕获特定错误
const testCatchTag = Effect.gen(function* () {
  const result = yield* Effect.fail(new NotFoundError("User", "123")).pipe(
    Effect.catchTag("NotFoundError", (err) =>
      Effect.succeed(`兜底: ${err.entity}`)
    )
  );
  return result;
});

// 运行测试
const exit = Effect.runSyncExit(testCatchTag);
if (exit._tag === "Success") {
  console.log("测试通过:", exit.value);
} else {
  console.log("测试失败:", exit.cause);
}
```

## 4. 典型问题处理

### 4.1 如何定义精确的错误类型？

使用 Tagged Union 模式定义错误类型：

```typescript
class NotFoundError {
  readonly _tag = "NotFoundError";
  constructor(readonly entity: string, readonly id: string) {}
}

class ValidationError {
  readonly _tag = "ValidationError";
  constructor(readonly field: string, readonly message: string) {}
}

type AppError = NotFoundError | ValidationError;
```

### 4.2 如何捕获特定类型的错误？

使用 catchTag 操作符：

```typescript
effect.pipe(
  Effect.catchTag("NotFoundError", (err) => {
    console.log(`未找到 ${err.entity}: ${err.id}`);
    return Effect.succeed("兜底值");
  })
);
```

### 4.3 如何实现错误重试？

使用 Effect.retry 和 Schedule：

```typescript
const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.recurs(3),
  Schedule.whileInput((err) => err._tag === "NetworkError")
);

effect.pipe(Effect.retry(retryPolicy));
```

### 4.4 Error 和 Defect 有什么区别？

Error 是预期错误，通过 Effect.fail 创建，在类型系统中声明，可以被 catchAll 捕获。Defect 是非预期错误，通过 Effect.die 创建，不在类型系统中声明，不会被 catchAll 捕获，需要使用 catchAllDefect 来捕获。

### 4.5 如何实现熔断器模式？

使用状态机实现熔断器：

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  
  call<A, E>(effect: Effect.Effect<A, E, never>): Effect.Effect<A, E | Error, never> {
    // 检查状态，决定是否允许请求通过
    // 记录失败次数，达到阈值时打开熔断器
    // 超时后进入半开状态，允许试探性请求
  }
}
```

### 4.6 如何实现错误日志和监控？

在错误处理管道中添加日志记录：

```typescript
effect.pipe(
  Effect.tapError((err) => 
    Effect.sync(() => {
      console.error(`[错误] ${err._tag}: ${err.message}`);
      // 发送到监控系统
    })
  ),
  Effect.catchAll(handleError)
);
```

### 4.7 如何处理多个并发的错误？

使用 Effect.all 的 `either` 选项来收集所有错误：

```typescript
const results = yield* Effect.all(
  tasks.map((task) => Effect.either(task)),
  { concurrency: "unbounded" }
);

for (const result of results) {
  if (result._tag === "Left") {
    console.error(`任务失败: ${result.left}`);
  } else {
    console.log(`任务成功: ${result.right}`);
  }
}
```

### 4.8 如何将 try/catch 代码迁移到 Effect？

将传统的 try/catch 代码迁移到 Effect 是一个渐进的过程。以下是一些迁移策略：

```typescript
// 传统方式
async function fetchUser(id: string): Promise<User> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error("获取用户失败:", err);
    throw err;
  }
}

// Effect 方式
function fetchUser(id: string): Effect.Effect<User, HttpError, never> {
  return Effect.tryPromise({
    try: () => fetch(`/api/users/${id}`),
    catch: (err) => new HttpError(500, String(err), `/api/users/${id}`),
  }).pipe(
    Effect.flatMap((response) => {
      if (!response.ok) {
        return Effect.fail(new HttpError(response.status, "请求失败", `/api/users/${id}`));
      }
      return Effect.tryPromise({
        try: () => response.json(),
        catch: (err) => new HttpError(500, String(err), `/api/users/${id}`),
      });
    })
  );
}
```

### 4.9 如何处理异步错误？

Effect 提供了 `Effect.tryPromise` 和 `Effect.tryPromiseInterrupt` 来处理 Promise 中的错误。

```typescript
// 处理 Promise 错误
const effect = Effect.tryPromise({
  try: () => fetch("https://api.example.com/data"),
  catch: (err) => new HttpError(500, String(err), "https://api.example.com/data"),
});

// 可中断的 Promise 处理
const interruptibleEffect = Effect.tryPromiseInterrupt({
  try: () => fetch("https://api.example.com/data"),
  catch: (err) => new HttpError(500, String(err), "https://api.example.com/data"),
});
```

### 4.10 如何在 Effect 中处理全局错误？

在 Effect 中，全局错误通常通过以下方式处理：

1. **在程序入口处捕获所有错误**：使用 `Effect.runPromiseExit` 或 `Effect.runPromise` 的 catch 方法
2. **使用 catchAllDefect 捕获 Defect**：在顶层使用 catchAllDefect 捕获非预期错误
3. **使用 Effect.sandbox 暴露所有错误**：在需要全面错误处理的场景中使用 sandbox

```typescript
// 顶层错误处理
async function main() {
  const exit = await Effect.runPromiseExit(
    program.pipe(
      Effect.catchAllDefect((defect) => {
        console.error("捕获到非预期错误:", defect);
        return Effect.succeed("系统恢复");
      })
    )
  );
  
  if (exit._tag === "Failure") {
    console.error("程序执行失败:", exit.cause);
    process.exit(1);
  }
}
```

### 4.11 如何设计错误码体系？

错误码体系是大型应用中错误处理的重要组成部分。以下是一个错误码设计示例：

```typescript
// 错误码体系
class AppError {
  readonly _tag = "AppError";
  constructor(
    readonly code: string,        // 错误码，如 "AUTH_TOKEN_EXPIRED"
    readonly message: string,     // 人类可读的错误信息
    readonly httpStatus: number,  // HTTP 状态码
    readonly details?: unknown    // 额外的错误详情
  ) {}
}

// 错误码常量
const ErrorCodes = {
  // 认证错误 (AUTH-*)
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_INSUFFICIENT_PERMISSIONS: "AUTH_INSUFFICIENT_PERMISSIONS",
  
  // 验证错误 (VALIDATION-*)
  VALIDATION_INVALID_INPUT: "VALIDATION_INVALID_INPUT",
  VALIDATION_MISSING_FIELD: "VALIDATION_MISSING_FIELD",
  VALIDATION_OUT_OF_RANGE: "VALIDATION_OUT_OF_RANGE",
  
  // 业务错误 (BIZ-*)
  BIZ_INSUFFICIENT_BALANCE: "BIZ_INSUFFICIENT_BALANCE",
  BIZ_ACCOUNT_LOCKED: "BIZ_ACCOUNT_LOCKED",
  BIZ_ORDER_ALREADY_PROCESSED: "BIZ_ORDER_ALREADY_PROCESSED",
  
  // 系统错误 (SYS-*)
  SYS_INTERNAL_ERROR: "SYS_INTERNAL_ERROR",
  SYS_SERVICE_UNAVAILABLE: "SYS_SERVICE_UNAVAILABLE",
  SYS_DATABASE_ERROR: "SYS_DATABASE_ERROR",
} as const;
```

### 4.12 如何处理超时错误？

Effect 提供了 `Effect.timeout` 和 `Effect.timeoutFail` 来处理超时场景。

```typescript
// 超时后返回默认值
const withTimeout = effect.pipe(
  Effect.timeout("5 seconds"),
  Effect.catchTag("TimeoutException", () => Effect.succeed("超时默认值"))
);

// 超时后返回自定义错误
const withTimeoutFail = effect.pipe(
  Effect.timeoutFail({
    duration: "5 seconds",
    onTimeout: () => new NetworkTimeoutError("请求超时", 5000, "/api/data"),
  })
);

// 超时后重试
const withTimeoutRetry = effect.pipe(
  Effect.timeout("5 seconds"),
  Effect.catchTag("TimeoutException", () => retryEffect)
);
```

### 4.13 如何在微服务中传递错误？

在微服务架构中，错误需要在服务之间正确传递。以下是一些最佳实践：

```typescript
// 服务 A：将错误转换为可序列化的格式
class ServiceError {
  readonly _tag = "ServiceError";
  constructor(
    readonly service: string,
    readonly errorCode: string,
    readonly message: string,
    readonly timestamp: string
  ) {}
}

// 服务 B：反序列化并处理错误
function handleServiceError(response: Response): Effect.Effect<Data, ServiceError, never> {
  if (!response.ok) {
    return Effect.tryPromise({
      try: () => response.json(),
      catch: () => new ServiceError("unknown", "UNKNOWN", "无法解析错误响应", new Date().toISOString()),
    }).pipe(
      Effect.flatMap((body) => Effect.fail(
        new ServiceError(body.service, body.errorCode, body.message, body.timestamp)
      ))
    );
  }
  return Effect.tryPromise({
    try: () => response.json(),
    catch: (err) => new ServiceError("data-service", "PARSE_ERROR", String(err), new Date().toISOString()),
  });
}
```

### 4.14 如何处理并发任务中的错误聚合？

在并发场景中，多个任务可能同时失败。Effect 提供了多种错误聚合策略。

```typescript
// 策略一：收集所有错误（不中断其他任务）
const allResults = yield* Effect.all(
  tasks.map((task) => Effect.either(task)),
  { concurrency: "unbounded" }
);

const successes = allResults.filter((r) => r._tag === "Right").map((r) => r.right);
const failures = allResults.filter((r) => r._tag === "Left").map((r) => r.left);

// 策略二：第一个失败就中断
const firstFailure = yield* Effect.all(tasks, { concurrency: 3 });

// 策略三：部分成功，部分失败
const partialResults = yield* Effect.all(
  tasks.map((task) =>
    Effect.either(task).pipe(
      Effect.map((result) => {
        if (result._tag === "Left") {
          return { success: false, error: result.left };
        }
        return { success: true, value: result.right };
      })
    )
  ),
  { concurrency: "unbounded" }
);
```

### 4.15 如何实现优雅降级？

优雅降级是提高系统可用性的重要手段。以下是一些降级策略：

```typescript
// 多级降级策略
const fetchData = (id: string): Effect.Effect<Data, AppError, never> => {
  return Effect.firstSuccessOf([
    // 第一级：从主数据库获取
    fetchFromPrimary(id),
    // 第二级：从从数据库获取
    fetchFromSecondary(id),
    // 第三级：从缓存获取
    fetchFromCache(id),
    // 第四级：返回默认值
    Effect.succeed(getDefaultData(id)),
  ]);
};

// 带条件的降级
const fetchWithDegradation = effect.pipe(
  Effect.catchTag("NetworkError", () => {
    // 网络错误时使用缓存数据
    return readFromCache();
  }),
  Effect.catchTag("CacheError", () => {
    // 缓存也失败时返回默认值
    return Effect.succeed(defaultData);
  })
);
```

### 4.16 如何处理资源清理错误？

在使用资源（如文件句柄、数据库连接）时，资源清理错误需要特殊处理。

```typescript
// 使用 Effect.acquireRelease 确保资源清理
const withResource = Effect.acquireRelease(
  // 获取资源
  Effect.sync(() => {
    console.log("打开文件");
    return { fd: 1 };
  }),
  // 释放资源（无论成功还是失败）
  (resource) => Effect.sync(() => {
    console.log("关闭文件");
  })
).pipe(
  Effect.flatMap((resource) => {
    // 使用资源
    return Effect.sync(() => {
      console.log("读取文件");
      return "文件内容";
    });
  })
);

// 处理资源清理中的错误
const withResourceHandling = withResource.pipe(
  Effect.catchAll((err) => {
    console.error("资源操作失败:", err);
    return Effect.succeed("默认内容");
  })
);
```

### 4.17 如何测试错误处理逻辑？

Effect 的错误处理逻辑可以通过多种方式进行测试。

```typescript
import { Effect, Exit } from "effect";

// 测试方法一：使用 runSyncExit
function testErrorHandling() {
  const effect = Effect.fail(new NotFoundError("User", "123")).pipe(
    Effect.catchTag("NotFoundError", (err) =>
      Effect.succeed(`兜底: ${err.entity}`)
    )
  );
  
  const exit = Effect.runSyncExit(effect);
  
  if (exit._tag === "Success") {
    console.assert(exit.value === "兜底: User", "应该返回兜底值");
    console.log("测试通过");
  } else {
    console.error("测试失败:", exit.cause);
  }
}

// 测试方法二：使用 Effect.either
async function testWithEither() {
  const result = await Effect.runPromise(
    Effect.either(
      Effect.fail(new ValidationError("email", "无效的邮箱", "abc"))
    )
  );
  
  if (result._tag === "Left") {
    const error = result.left;
    console.assert(error._tag === "ValidationError", "应该是验证错误");
    console.assert(error.field === "email", "字段应该是 email");
    console.log("测试通过");
  }
}

// 测试方法三：模拟错误场景
function testRetryLogic() {
  let attempts = 0;
  
  const flakyEffect = Effect.sync(() => {
    attempts++;
    if (attempts < 3) {
      throw new Error("临时错误");
    }
    return "成功";
  }).pipe(
    Effect.mapError((err) => new HttpError(503, err.message, "/api/test")),
    Effect.retry(Schedule.recurs(3))
  );
  
  const exit = Effect.runSyncExit(flakyEffect);
  console.assert(exit._tag === "Success", "重试后应该成功");
  console.assert(exit.value === "成功", "应该返回成功值");
  console.assert(attempts === 3, "应该重试 2 次");
  console.log("测试通过");
}
```

### 4.18 如何与第三方库的错误处理集成？

在实际项目中，经常需要将第三方库的错误处理与 Effect 集成。

```typescript
// 集成 axios
import axios from "axios";

function axiosGet<T>(url: string): Effect.Effect<T, HttpError, never> {
  return Effect.tryPromise({
    try: () => axios.get<T>(url).then((res) => res.data),
    catch: (err) => {
      if (axios.isAxiosError(err)) {
        return new HttpError(
          err.response?.status ?? 500,
          err.message,
          url,
          err.response?.data
        );
      }
      return new HttpError(500, String(err), url);
    },
  });
}

// 集成 Prisma
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function findUser(id: string): Effect.Effect<User, NotFoundError | DatabaseError, never> {
  return Effect.tryPromise({
    try: () => prisma.user.findUniqueOrThrow({ where: { id } }),
    catch: (err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          return new NotFoundError("User", id);
        }
        return new DatabaseError(err.code, err.message);
      }
      return new DatabaseError("UNKNOWN", String(err));
    },
  });
}
```

### 4.19 如何处理 Effect 中的副作用错误？

Effect 中的副作用（如控制台输出、文件写入）也可能产生错误。

```typescript
// 使用 Effect.sync 包装副作用
const writeLog = (message: string): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    console.log(message);
  });

// 使用 Effect.try 处理可能失败的副作用
const writeFile = (path: string, content: string): Effect.Effect<void, Error, never> =>
  Effect.try({
    try: () => {
      require("fs").writeFileSync(path, content);
    },
    catch: (err) => new Error(`写入文件失败: ${err}`),
  });

// 组合副作用和业务逻辑
const program = Effect.gen(function* () {
  yield* writeLog("开始处理");
  const data = yield* fetchData();
  yield* writeFile("/tmp/data.json", JSON.stringify(data));
  yield* writeLog("处理完成");
  return data;
});
```

### 4.20 如何实现事务性错误处理？

在需要事务保证的场景中，错误处理需要支持回滚操作。

```typescript
// 事务性操作
class TransactionError {
  readonly _tag = "TransactionError";
  constructor(
    readonly step: string,
    readonly message: string,
    readonly cause: unknown
  ) {}
}

function transferMoney(
  from: string,
  to: string,
  amount: number
): Effect.Effect<string, TransactionError, never> {
  return Effect.gen(function* () {
    // 步骤 1：扣款
    const debitResult = yield* debit(from, amount).pipe(
      Effect.mapError((err) => new TransactionError("debit", "扣款失败", err))
    );
    
    // 步骤 2：入账
    const creditResult = yield* credit(to, amount).pipe(
      Effect.mapError((err) => {
        // 入账失败，需要回滚扣款
        rollbackDebit(from, amount);
        return new TransactionError("credit", "入账失败，已回滚", err);
      })
    );
    
    return `转账成功: ${amount}`;
  });
}
```

### 4.21 如何处理流式数据中的错误？

在流式数据处理中，错误处理需要特殊考虑，因为流中的数据是持续到达的。

```typescript
import { Stream } from "effect";

// 流式错误处理
const stream = Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
  Stream.map((n) => {
    if (n === 3) {
      throw new Error("处理失败");
    }
    return n * 2;
  }),
  Stream.mapError((err) => new AppError("STREAM_ERROR", String(err))),
  Stream.catchAll((err) => {
    console.error("流处理错误:", err);
    return Stream.empty;  // 跳过错误，继续处理
  })
);

// 或者使用 Stream.either 收集所有结果
const streamWithEither = Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
  Stream.map((n) => {
    if (n === 3) {
      return Either.left(new AppError("STREAM_ERROR", "处理失败"));
    }
    return Either.right(n * 2);
  })
);
```

### 4.22 如何处理认证和授权错误？

认证和授权错误是 Web 应用中最常见的错误类型之一。

```typescript
class AuthenticationError {
  readonly _tag = "AuthenticationError";
  constructor(readonly message: string, readonly tokenExpired: boolean) {}
}

class AuthorizationError {
  readonly _tag = "AuthorizationError";
  constructor(readonly message: string, readonly requiredRole: string) {}
}

// 认证中间件
function authenticate(token: string): Effect.Effect<User, AuthenticationError, never> {
  if (!token) {
    return Effect.fail(new AuthenticationError("未提供认证令牌", false));
  }
  // 验证 token...
  return Effect.succeed(user);
}

// 授权检查
function authorize(user: User, requiredRole: string): Effect.Effect<User, AuthorizationError, never> {
  if (!user.roles.includes(requiredRole)) {
    return Effect.fail(
      new AuthorizationError(`需要 ${requiredRole} 角色`, requiredRole)
    );
  }
  return Effect.succeed(user);
}

// 组合认证和授权
const protectedEndpoint = Effect.gen(function* () {
  const user = yield* authenticate(token);
  yield* authorize(user, "admin");
  return yield* businessLogic();
}).pipe(
  Effect.catchTag("AuthenticationError", (err) =>
    Effect.succeed({ status: 401, message: err.message })
  ),
  Effect.catchTag("AuthorizationError", (err) =>
    Effect.succeed({ status: 403, message: err.message })
  )
);
```

### 4.23 如何处理数据库错误？

数据库错误是后端应用中最常见的错误类型之一。不同的数据库错误需要不同的处理策略。

```typescript
class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(
    readonly code: string,
    readonly message: string,
    readonly sql?: string
  ) {}
}

class UniqueConstraintError {
  readonly _tag = "UniqueConstraintError";
  constructor(
    readonly constraint: string,
    readonly field: string,
    readonly value: unknown
  ) {}
}

class ForeignKeyError {
  readonly _tag = "ForeignKeyError";
  constructor(
    readonly constraint: string,
    readonly message: string
  ) {}
}

// 数据库操作错误处理
function executeQuery(sql: string): Effect.Effect<Result, DatabaseError | UniqueConstraintError | ForeignKeyError, never> {
  return Effect.tryPromise({
    try: () => db.query(sql),
    catch: (err) => {
      if (err.code === "ER_DUP_ENTRY") {
        return new UniqueConstraintError(
          err.constraint,
          extractFieldFromError(err),
          extractValueFromError(err)
        );
      }
      if (err.code === "ER_NO_REFERENCED_ROW") {
        return new ForeignKeyError(err.constraint, err.message);
      }
      return new DatabaseError(err.code, err.message, sql);
    },
  });
}

// 使用
executeQuery("INSERT INTO users ...").pipe(
  Effect.catchTag("UniqueConstraintError", (err) =>
    Effect.succeed(`用户已存在: ${err.field} = ${err.value}`)
  ),
  Effect.catchTag("ForeignKeyError", (err) =>
    Effect.fail(new ValidationError("reference", err.message))
  ),
  Effect.catchTag("DatabaseError", (err) => {
    logger.error("数据库错误:", err);
    return Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.recurs(3)));
  })
);
```

### 4.24 如何处理缓存错误？

缓存错误通常不应该影响主业务流程。缓存失败时，应该降级到直接查询数据源。

```typescript
class CacheError {
  readonly _tag = "CacheError";
  constructor(readonly message: string, readonly operation: string) {}
}

// 缓存操作
function getFromCache<T>(key: string): Effect.Effect<T | null, CacheError, never> {
  return Effect.tryPromise({
    try: () => redis.get(key).then((data) => data ? JSON.parse(data) : null),
    catch: (err) => new CacheError(String(err), "get"),
  });
}

function setToCache<T>(key: string, value: T, ttl: number): Effect.Effect<void, CacheError, never> {
  return Effect.tryPromise({
    try: () => redis.setex(key, ttl, JSON.stringify(value)),
    catch: (err) => new CacheError(String(err), "set"),
  });
}

// 缓存穿透保护
function getWithCache<T>(
  key: string,
  fetchFn: () => Effect.Effect<T, AppError, never>,
  ttl: number
): Effect.Effect<T, AppError, never> {
  return getFromCache<T>(key).pipe(
    Effect.flatMap((cached) => {
      if (cached !== null) {
        return Effect.succeed(cached);
      }
      return fetchFn().pipe(
        Effect.flatMap((data) =>
          setToCache(key, data, ttl).pipe(
            Effect.catchTag("CacheError", () => Effect.succeed(void 0)), // 缓存失败不影响主流程
            Effect.map(() => data)
          )
        )
      );
    }),
    Effect.catchTag("CacheError", () => fetchFn()) // 缓存错误时直接查询
  );
}
```

## 5. 必备知识与技能

### 5.1 TypeScript 高级类型

1. **联合类型**：理解联合类型及其在错误处理中的应用。联合类型允许一个值可以是多种类型中的一种，是 Tagged Union 的基础。
2. **类型收窄**：理解类型守卫和类型收窄机制。通过 `_tag` 字段的值，TypeScript 可以自动收窄错误类型。
3. **字面量类型**：理解字面量类型在 Tagged Union 中的应用。`_tag` 字段使用字面量类型作为区分标志。
4. **泛型约束**：理解泛型约束在错误处理中的应用。Effect 的泛型参数 `A`、`E`、`R` 都有特定的约束。
5. **条件类型**：理解条件类型在错误类型转换中的应用。例如，`Effect.Effect<A, E, R>` 中的类型推断。
6. **映射类型**：理解映射类型在错误类型转换中的应用。例如，将错误类型映射为错误码。
7. **模板字面量类型**：理解模板字面量类型在错误码设计中的应用。

```typescript
// 联合类型示例
type Result<T, E> = { success: true; value: T } | { success: false; error: E };

// 类型收窄示例
function handleResult<T, E>(result: Result<T, E>): T | never {
  if (result.success) {
    return result.value;  // TypeScript 知道这里 result 是 { success: true; value: T }
  }
  throw result.error;  // TypeScript 知道这里 result 是 { success: false; error: E }
}

// 字面量类型示例
type ErrorTag = "NetworkError" | "ValidationError" | "NotFoundError";
```

### 5.2 代数数据类型

1. **积类型**：理解 Product Type（如 class、interface）。积类型表示"同时拥有"的关系，如 `{ name: string; age: number }`。
2. **和类型**：理解 Sum Type（如联合类型）。和类型表示"要么是 A，要么是 B"的关系，如 `NetworkError | ValidationError`。
3. **代数数据类型**：理解 ADT 的概念和应用。ADT 是积类型和和类型的组合，可以精确地建模领域概念。
4. **模式匹配**：理解模式匹配的概念和在 TypeScript 中的实现。模式匹配是处理 ADT 的标准方式。
5. **穷举检查**：理解穷举检查在错误处理中的重要性。通过 `never` 类型确保所有错误类型都被处理。

```typescript
// 代数数据类型示例
// 积类型：表示"同时拥有"的关系
interface User {
  id: string;
  name: string;
  email: string;
}

// 和类型：表示"要么是 A，要么是 B"的关系
type ApiResult<T> = 
  | { _tag: "success"; data: T }
  | { _tag: "error"; code: string; message: string }
  | { _tag: "loading" };

// 模式匹配
function handleApiResult<T>(result: ApiResult<T>): string {
  switch (result._tag) {
    case "success":
      return `成功: ${JSON.stringify(result.data)}`;
    case "error":
      return `错误: [${result.code}] ${result.message}`;
    case "loading":
      return "加载中...";
    default:
      const _exhaustive: never = result;
      return _exhaustive;
  }
}
```

### 5.3 错误处理模式

1. **Result 模式**：理解 Result 类型（成功/失败）的概念。Result 模式将操作的结果建模为成功或失败两种状态。
2. **Either 模式**：理解 Either 类型（左值/右值）的概念。Either 模式通常约定左值表示错误，右值表示成功。
3. **Option 模式**：理解 Option 类型（Some/None）的概念。Option 模式用于表示可能存在也可能不存在的值。
4. **错误恢复模式**：理解重试、降级、兜底等错误恢复模式。
5. **熔断器模式**：理解熔断器模式的概念和实现。熔断器模式用于防止级联故障。
6. **舱壁模式**：理解舱壁模式在错误隔离中的应用。舱壁模式通过隔离资源来限制错误的影响范围。
7. **重试模式**：理解重试模式的各种变体，包括固定间隔重试、指数退避重试、随机抖动重试等。
8. **超时模式**：理解超时模式在错误处理中的应用。超时模式用于防止操作无限期等待。

```typescript
// 各种错误处理模式示例

// Result 模式
type Result<T, E> = { success: true; value: T } | { success: false; error: E };

// Either 模式
type Either<L, R> = { _tag: "Left"; left: L } | { _tag: "Right"; right: R };

// Option 模式
type Option<T> = { _tag: "Some"; value: T } | { _tag: "None" };

// 舱壁模式：为不同服务分配独立的资源池
class Bulkhead {
  private semaphore: number;
  
  constructor(private maxConcurrent: number) {
    this.semaphore = maxConcurrent;
  }
  
  call<A, E>(effect: Effect.Effect<A, E, never>): Effect.Effect<A, E | Error, never> {
    return Effect.gen(function* () {
      if (this.semaphore <= 0) {
        return yield* Effect.fail(new Error("舱壁已满，请求被拒绝"));
      }
      this.semaphore--;
      try {
        return yield* effect;
      } finally {
        this.semaphore++;
      }
    });
  }
}
```

### 5.4 领域驱动设计

1. **领域模型**：理解领域模型的概念和设计方法。错误类型应该是领域模型的一部分，反映领域中的业务规则和约束。
2. **限界上下文**：理解限界上下文在错误分类中的应用。不同的限界上下文可能有不同的错误类型体系。
3. **值对象**：理解值对象在错误类型设计中的应用。错误类型通常被设计为值对象，具有不可变性。
4. **领域服务**：理解领域服务在错误处理中的应用。领域服务可以封装复杂的错误处理逻辑。
5. **聚合根**：理解聚合根在错误处理中的作用。聚合根负责保证聚合内部的一致性，包括错误处理的一致性。
6. **领域事件**：理解领域事件在错误传播中的应用。错误可以作为领域事件在系统内部传播。

```typescript
// 领域驱动设计示例
// 值对象：错误类型
class Money {
  constructor(
    readonly amount: number,
    readonly currency: string
  ) {
    if (amount < 0) {
      throw new Error("金额不能为负数");
    }
  }
}

// 领域服务：转账服务
class TransferService {
  transfer(
    from: Account,
    to: Account,
    amount: Money
  ): Effect.Effect<TransferResult, TransferError, never> {
    return Effect.gen(function* () {
      // 业务规则验证
      if (from.balance.amount < amount.amount) {
        return yield* Effect.fail(
          new InsufficientBalanceError(from.id, from.balance.amount, amount.amount)
        );
      }
      
      if (from.status === "suspended") {
        return yield* Effect.fail(
          new AccountSuspendedError(from.id, from.suspendedReason!)
        );
      }
      
      // 执行转账
      from.balance = new Money(from.balance.amount - amount.amount, amount.currency);
      to.balance = new Money(to.balance.amount + amount.amount, amount.currency);
      
      return new TransferResult("success", amount);
    });
  }
}
```

### 5.5 Effect 核心概念

1. **Effect 三维模型**：理解 `Effect<A, E, R>` 的含义。A 是成功类型，E 是错误类型，R 是依赖类型。
2. **Effect 操作符**：理解 map、flatMap、pipe 等核心操作符。
3. **Effect.gen**：理解 Effect.gen 的用法，它提供了类似 async/await 的编程体验。
4. **Effect 运行器**：理解 Effect.runPromise、Effect.runSync、Effect.runSyncExit 等运行器。
5. **依赖注入**：理解 Effect 的依赖注入机制（R 类型参数）。
6. **并发模型**：理解 Effect 的 Fiber 和并发模型。
7. **资源管理**：理解 Effect.acquireRelease 等资源管理机制。

```typescript
// Effect 核心概念示例

// 三维模型
// Effect<成功类型, 错误类型, 依赖类型>
type MyEffect = Effect.Effect<string, Error, Database>;

// Effect.gen 的使用
const program = Effect.gen(function* () {
  const user = yield* fetchUser("123");
  const posts = yield* fetchPosts(user.id);
  return { user, posts };
});

// 依赖注入
class Database {
  query(sql: string): Effect.Effect<unknown, Error, never> {
    return Effect.tryPromise({
      try: () => this.client.query(sql),
      catch: (err) => new Error(`数据库查询失败: ${err}`),
    });
  }
}

// 提供依赖
const runnable = program.pipe(
  Effect.provideService(Database, new Database())
);
```

### 5.6 错误处理与系统设计

错误处理不仅仅是技术问题，更是系统设计问题。良好的错误处理需要从系统设计的角度进行思考。

#### 错误边界

错误边界是系统中错误处理的边界。在错误边界处，错误被捕获、转换、记录。常见的错误边界包括：

1. **系统边界**：系统与外部交互的边界，如 HTTP 接口、消息队列、数据库等
2. **模块边界**：模块之间的调用边界，如服务层与数据访问层之间
3. **线程边界**：不同线程或协程之间的边界，如并发任务的错误聚合

```typescript
// 系统边界错误处理
function apiHandler(request: Request): Effect.Effect<Response, never, never> {
  return businessLogic(request).pipe(
    Effect.map((data) => new Response(JSON.stringify(data), { status: 200 })),
    Effect.catchTag("NotFoundError", (err) =>
      Effect.succeed(new Response(JSON.stringify({ error: err.message }), { status: 404 }))
    ),
    Effect.catchTag("ValidationError", (err) =>
      Effect.succeed(new Response(JSON.stringify({ error: err.message }), { status: 400 }))
    ),
    Effect.catchAll((err) =>
      Effect.succeed(new Response(JSON.stringify({ error: "内部错误" }), { status: 500 }))
    )
  );
}
```

#### 错误传播策略

错误在系统中的传播需要遵循一定的策略：

1. **向上传播**：错误从底层向高层传播，在每层可以添加上下文信息
2. **横向传播**：错误在同一个层次的服务之间传播，如微服务之间的错误传递
3. **向下转化**：高层错误可以转化为底层错误，用于错误恢复

#### 错误恢复策略

错误恢复策略决定了系统在错误发生时的行为：

1. **立即重试**：对临时性错误立即重试
2. **延迟重试**：对需要等待的错误延迟重试
3. **降级处理**：在错误无法恢复时提供降级方案
4. **快速失败**：对不可恢复的错误快速失败
5. **人工介入**：对需要人工处理的错误发出告警

### 5.7 函数式编程基础

1. **纯函数**：理解纯函数的概念。纯函数没有副作用，相同的输入总是产生相同的输出。
2. **不可变性**：理解不可变性的概念。错误类型应该是不可变的，避免状态变化导致的错误。
3. **函数组合**：理解函数组合的概念。错误处理操作符可以通过 pipe 组合。
4. **函子**：理解 Functor 的概念。Effect 是一个函子，可以通过 map 转换成功值。
5. **单子**：理解 Monad 的概念。Effect 是一个单子，可以通过 flatMap 组合 Effect。
6. **柯里化**：理解柯里化的概念。Effect 的操作符通常支持柯里化调用。

```typescript
// 函数式编程基础示例

// 纯函数
function add(a: number, b: number): number {
  return a + b;  // 纯函数：没有副作用，相同输入总是相同输出
}

// 不可变性
class ImmutableError {
  readonly _tag: string;
  readonly message: string;
  
  constructor(tag: string, message: string) {
    this._tag = tag;
    this.message = message;
    Object.freeze(this);  // 确保不可变性
  }
}

// 函数组合
const composed = pipe(
  fetchUser,
  Effect.flatMap(validateUser),
  Effect.flatMap(processUser),
  Effect.catchAll(handleError)
);
```

## 6. 示例代码与配置

### 6.1 项目结构

```
ch03-error-handling/
├── docker-compose.yml                    # Docker 运行环境配置
├── examples/
│   ├── 01-basic/
│   │   └── error-first-class.ts          # 错误作为一等公民
│   ├── 02-advanced/
│   │   └── tagged-union-errors.ts        # TaggedUnion 与精确错误分类
│   └── 03-production/
│       └── production-error-handling.ts  # 生产级错误处理
└── README.md                             # 本章文档
```

### 6.2 运行方式

使用 Docker Compose 运行所有示例：

```bash
docker-compose up
```

或者单独运行某个示例：

```bash
npx tsx examples/01-basic/error-first-class.ts
npx tsx examples/02-advanced/tagged-union-errors.ts
npx tsx examples/03-production/production-error-handling.ts
```

### 6.3 示例一：错误作为一等公民

文件 `examples/01-basic/error-first-class.ts` 演示了 Effect 中错误作为一等公民的核心概念：

1. **精确的错误类型定义**：使用 class 定义带有 _tag 字段的错误类型。每个错误类型都包含与其相关的上下文信息，如 NetworkError 包含 statusCode 和 url，ValidationError 包含 field 和 value。
2. **函数签名中声明错误类型**：在 Effect 的 E 类型参数中声明可能产生的错误。调用者可以从类型签名中知道函数可能产生哪些错误。
3. **catchTag 精确捕获**：使用 catchTag 捕获特定标签的错误。catchTag 只捕获指定标签的错误，其他错误不受影响。
4. **catchAll 全面捕获**：使用 catchAll 捕获所有类型的错误。catchAll 作为错误处理链的最后一道防线。
5. **mapError 错误转换**：使用 mapError 将错误类型转换为另一种类型。这在系统边界处特别有用，可以将底层错误转换为高层错误。
6. **catchSome 选择性捕获**：使用 catchSome 选择性捕获某些错误。catchSome 接受一个返回 Option 的处理函数，可以基于条件决定是否捕获。
7. **orElse 备选方案**：在失败时执行备选方案。orElse 在原始 Effect 失败时执行备选 Effect。

### 6.4 示例二：TaggedUnion 与精确错误分类

文件 `examples/02-advanced/tagged-union-errors.ts` 演示了 Tagged Union 模式在错误分类中的应用：

1. **TaggedUnion 定义错误体系**：使用 _tag 字段区分不同的错误类型。每个错误类型都有唯一的 _tag 值，TypeScript 可以根据 _tag 值自动收窄类型。
2. **分层错误体系**：将错误分为基础设施层、数据层、业务层。每层定义自己的错误类型，然后组合成应用级错误类型。
3. **模式匹配**：使用 switch 语句对 Tagged Union 进行模式匹配。TypeScript 可以检查是否处理了所有可能的错误类型。
4. **精确的错误处理链**：构建从精确到通用的错误处理链。先处理业务错误，再处理基础设施错误，最后兜底处理。
5. **Defect 与 Error 的区别**：演示 Defect 和 Error 的不同行为。Defect 不会被 catchAll 捕获，需要使用 catchAllDefect。
6. **catchAllDefect 捕获 Defect**：使用 catchAllDefect 捕获非预期错误。catchAllDefect 可以捕获 Defect 并从中恢复。

### 6.5 示例三：生产级错误处理

文件 `examples/03-production/production-error-handling.ts` 演示了生产级的错误处理方案：

1. **完整的错误体系定义**：定义了基础设施错误（HttpError、NetworkTimeoutError、RateLimitError）、数据错误（ValidationError、NotFoundError、ConflictError）、业务错误（InsufficientFundsError、AccountLockedError、FraudDetectionError）。
2. **错误分类工具**：提供了判断错误类型的工具函数。isInfrastructureError、isDataError、isBusinessError 等函数可以根据错误标签判断错误类别。
3. **重试策略工厂**：根据错误类型自动选择重试策略。基础设施错误使用指数退避重试，数据错误不重试，业务错误使用有限重试。
4. **熔断器模式**：实现了熔断器模式保护系统稳定性。熔断器有三种状态：closed（关闭）、open（打开）、half-open（半开）。
5. **错误报告与日志**：实现了结构化的错误日志记录。错误日志包含时间戳、上下文、错误标签、错误信息、错误类别等字段。
6. **完整的错误处理管道**：构建了从重试到兜底的完整错误处理管道。管道包括重试策略、精确错误处理、错误恢复、兜底处理等阶段。

### 6.6 Docker 配置说明

`docker-compose.yml` 使用 `node:20-alpine` 镜像，自动安装 `@effect/platform` 包，并依次运行三个示例。这种配置确保了运行环境的一致性，避免了本地环境差异导致的问题。

## 7. 常见错误与陷阱

### 7.1 过度使用 catchAll 导致错误被吞没

**问题**：在错误处理管道的开头就使用 catchAll，导致所有错误都被统一处理，无法区分不同的错误类型。

```typescript
// 错误做法
effect.pipe(
  Effect.catchAll((err) => {
    // 所有错误都被统一处理，无法区分
    return Effect.succeed("兜底值");
  })
);
```

**解决方案**：先使用 catchTag 处理已知的错误类型，再使用 catchAll 作为兜底。

```typescript
// 正确做法
effect.pipe(
  Effect.catchTag("NotFoundError", handleNotFound),
  Effect.catchTag("ValidationError", handleValidation),
  Effect.catchAll(handleUnknown)
);
```

### 7.2 忽略 Defect 的处理

**问题**：认为 catchAll 可以捕获所有错误，忽略了 Defect 的存在。

```typescript
// 错误做法：认为 catchAll 可以捕获所有错误
effect.pipe(
  Effect.catchAll((err) => {
    // 这不会捕获 Defect
    return Effect.succeed("兜底值");
  })
);
```

**解决方案**：在需要全面错误处理的场景中，使用 catchAllDefect 或 sandbox。

```typescript
// 正确做法：同时处理 Error 和 Defect
effect.pipe(
  Effect.catchAllDefect((defect) => {
    console.error("捕获到 Defect:", defect);
    return Effect.succeed("从 Defect 中恢复");
  }),
  Effect.catchAll((err) => {
    return Effect.succeed("从 Error 中恢复");
  })
);
```

### 7.3 错误类型设计过于复杂

**问题**：为每个可能的错误都创建独立的类型，导致错误类型体系过于庞大。

**解决方案**：只在需要不同处理策略时才创建独立的错误类型。对于不需要特殊处理的错误，可以使用统一的错误类型。

```typescript
// 过于复杂的错误类型
class ErrorA { readonly _tag = "ErrorA"; constructor(readonly message: string) {} }
class ErrorB { readonly _tag = "ErrorB"; constructor(readonly message: string) {} }
class ErrorC { readonly _tag = "ErrorC"; constructor(readonly message: string) {} }
// ... 几十个类似的错误类型

// 简化的错误类型
class AppError {
  readonly _tag = "AppError";
  constructor(
    readonly code: string,
    readonly message: string,
    readonly details?: unknown
  ) {}
}
```

### 7.4 在 Effect.gen 中直接抛出异常

**问题**：在 Effect.gen 中使用 throw 而不是 Effect.fail。

```typescript
// 错误做法
const program = Effect.gen(function* () {
  if (condition) {
    throw new Error("出错了");  // 这会创建一个 Defect，而不是 Error
  }
  return result;
});
```

**解决方案**：使用 Effect.fail 创建预期错误。

```typescript
// 正确做法
const program = Effect.gen(function* () {
  if (condition) {
    return yield* Effect.fail(new AppError("ERROR", "出错了"));
  }
  return result;
});
```

### 7.5 重试策略设置不当

**问题**：重试次数过多或重试间隔过短，导致系统负载增加。

**解决方案**：根据错误类型和业务需求合理设置重试策略。

```typescript
// 合理的重试策略
const reasonableRetry = Schedule.exponential("100 millis").pipe(
  Schedule.recurs(3),  // 最多重试 3 次
  Schedule.jittered(),  // 添加随机抖动，避免惊群效应
  Schedule.whileInput((err) => err._tag === "NetworkError")  // 只在网络错误时重试
);
```

### 7.6 忘记处理并发错误

**问题**：在并发场景中，只处理了第一个错误，忽略了其他错误。

```typescript
// 错误做法：只处理第一个错误
const result = yield* Effect.all(tasks, { concurrency: 3 });
// 如果某个任务失败，其他任务的结果被忽略
```

**解决方案**：使用 Effect.either 收集所有错误。

```typescript
// 正确做法：收集所有错误
const results = yield* Effect.all(
  tasks.map((task) => Effect.either(task)),
  { concurrency: 3 }
);

const successes = results.filter((r) => r._tag === "Right");
const failures = results.filter((r) => r._tag === "Left");
```

### 7.7 在错误类型中携带过多数据

**问题**：错误类型中携带了大量不必要的数据，导致性能开销。

```typescript
// 错误做法：携带过多数据
class ErrorWithTooMuchData {
  readonly _tag = "ErrorWithTooMuchData";
  constructor(
    readonly message: string,
    readonly largeData: any[],  // 大量数据
    readonly heavyObject: any,  // 重量级对象
    readonly stackTrace: string // 完整的堆栈
  ) {}
}
```

**解决方案**：错误类型只携带必要的上下文信息。

```typescript
// 正确做法：只携带必要信息
class ErrorWithContext {
  readonly _tag = "ErrorWithContext";
  constructor(
    readonly code: string,
    readonly message: string,
    readonly referenceId: string  // 引用 ID，用于关联日志
  ) {}
}
```

## 总结

本章深入探讨了 Effect 的错误处理机制。Effect 将错误作为一等公民，通过 `Effect<A, E, R>` 三维模型中的 E 类型参数精确声明可能产生的错误类型。Tagged Union 模式为错误分类提供了强大的类型安全保障，使得开发者可以在编译时检查错误处理的完整性。

### 核心要点回顾

1. **错误是一等公民**：在 Effect 中，错误是类型系统的一部分，而不是运行时意外。函数签名中明确声明了可能产生的错误类型，编译器可以检查错误处理是否完整。

2. **Tagged Union 模式**：通过 `_tag` 字段区分不同的错误类型，TypeScript 可以根据 `_tag` 值自动收窄类型，实现精确的错误分类和处理。

3. **错误处理操作符**：catchTag 用于精确捕获特定标签的错误，catchAll 用于全面捕获所有错误，mapError 用于转换错误类型。这些操作符可以组合使用，构建复杂的错误处理管道。

4. **Error 与 Defect 的区分**：Error 是预期错误，应该被优雅地处理；Defect 是非预期错误，应该让程序快速失败。这种区分确保了预期错误被正确处理，非预期错误能够被及时发现。

5. **重试策略与 Schedule**：Effect 的 Schedule 系统提供了灵活的重试策略定义能力，支持指数退避、固定间隔、自定义延迟等重试策略。

6. **错误处理管道**：从错误分类到错误转换，从错误恢复到重试策略，从降级处理到兜底处理，Effect 提供了完整的错误处理管道构建能力。

7. **错误类型设计原则**：良好的错误类型设计是有效错误处理的基础。错误类型应该遵循单一职责、信息丰富、层次清晰、可序列化、向前兼容、领域驱动等原则。

8. **测试策略**：错误处理逻辑的测试是确保系统健壮性的关键。应该为每种错误类型编写测试用例，确保错误处理逻辑的正确性。

### 最佳实践总结

1. **设计错误类型体系**：根据业务领域设计分层的错误类型体系，避免错误类型膨胀。
2. **先精确后兜底**：在错误处理管道中，先使用 catchTag 处理已知的错误类型，再使用 catchAll 作为兜底。
3. **分离关注点**：将错误处理逻辑从业务逻辑中分离出来，提高代码的可维护性。
4. **合理使用重试**：根据错误类型选择合适的重试策略，避免过度重试导致系统负载增加。
5. **监控和日志**：在生产环境中监控未处理的错误，及时发现和处理潜在问题。
6. **测试覆盖**：为每种错误类型编写测试用例，确保错误处理逻辑的正确性。
7. **避免常见陷阱**：注意避免过度使用 catchAll、忽略 Defect、错误类型设计过于复杂、在 Effect.gen 中直接抛出异常、重试策略设置不当、忘记处理并发错误、在错误类型中携带过多数据等常见陷阱。

### 进阶方向

1. **Cause 类型**：深入理解 Cause 类型，掌握 Effect.sandbox 和 Effect.unsandbox 的使用。Cause 类型可以表示复杂的错误组合，包括顺序组合和并行组合。
2. **Fiber 错误处理**：学习 Fiber 级别的错误处理，掌握并发场景中的错误管理。Fiber 是 Effect 中的轻量级线程，每个 Fiber 都有自己的错误处理机制。
3. **自定义 Schedule**：学习如何创建自定义的 Schedule 策略，满足特定的重试需求。自定义 Schedule 可以实现复杂的重试逻辑，如根据错误类型动态调整重试间隔。
4. **错误传播模式**：学习在微服务架构中如何正确传播和转换错误。错误在服务之间传播时，需要保持错误信息的完整性和可追溯性。
5. **领域事件与错误**：学习如何将错误建模为领域事件，实现更细粒度的错误追踪和分析。领域事件可以记录错误的产生、传播和处理过程。
6. **错误监控与告警**：学习如何将 Effect 的错误处理与监控系统集成，实现实时的错误告警和自动化处理。
7. **错误恢复自动化**：学习如何实现自动化的错误恢复机制，如自动重试、自动降级、自动熔断等。

### 本章在 Effect 学习路径中的位置

错误处理是 Effect 的核心能力之一，也是学习 Effect 的重要里程碑。掌握好本章的内容，将为后续学习打下坚实的基础。在后续的章节中，我们将进一步探讨 Effect 在更复杂场景中的应用：

- **资源管理**：学习如何使用 Effect.acquireRelease 等机制管理资源生命周期，确保资源在错误发生时也能被正确释放。
- **依赖注入**：学习如何使用 Effect 的依赖注入机制管理系统依赖，实现模块化和可测试的设计。
- **流式处理**：学习如何使用 Effect 的 Stream 处理大规模数据流，包括流式错误处理。
- **并发编程**：学习如何使用 Effect 的 Fiber 和并发原语实现高效的并发编程。
- **测试**：学习如何使用 Effect 的测试工具编写高质量的测试。

错误处理作为贯穿所有这些主题的基础能力，将在后续的章节中不断被提及和深化。建议读者在继续学习之前，充分理解和掌握本章的内容，特别是 Tagged Union 模式、错误处理操作符的使用、Error 与 Defect 的区分等核心概念。这些概念不仅是 Effect 错误处理的基础，也是理解 Effect 整体设计思想的关键。

### 本章常见问题解答

**Q: Error 和 Defect 的根本区别是什么？**
A: Error 是预期错误，通过 Effect.fail 创建，在类型系统中声明，可以被 catchAll 捕获。Defect 是非预期错误，通过 Effect.die 创建，不在类型系统中声明，不会被 catchAll 捕获。Error 代表程序正常执行路径中可能出现的失败情况，Defect 代表程序中的 bug 或非预期情况。

**Q: 什么时候应该使用 catchAll 而不是 catchTag？**
A: catchAll 应该在错误处理管道的最后使用，作为兜底处理。catchTag 应该在错误处理管道的前面使用，用于精确处理特定类型的错误。优先使用 catchTag 处理已知的错误类型，然后使用 catchAll 处理未知的错误类型。

**Q: 如何设计良好的错误类型体系？**
A: 遵循以下原则：单一职责（每个错误类型只表示一种错误情况）、信息丰富（错误类型应该携带足够的上下文信息）、层次清晰（错误类型应该有清晰的层次结构）、可序列化（错误类型应该可以被序列化）、向前兼容（添加新的错误类型不应该破坏现有的错误处理代码）、领域驱动（错误类型应该反映领域概念）。

**Q: Effect 的错误处理与 try/catch 相比有哪些优势？**
A: Effect 的错误处理具有以下优势：类型安全（错误类型在编译时检查）、精确分类（通过 Tagged Union 精确区分错误类型）、组合性（错误处理操作符可以自由组合）、可恢复性（提供重试、降级、兜底等恢复机制）、可测试性（错误处理逻辑可以独立测试）。

**Q: 如何在 Effect 中处理第三方库的错误？**
A: 使用 Effect.tryPromise 或 Effect.try 将第三方库的错误转换为 Effect 的错误类型。在转换过程中，可以将原始错误包装为自定义的错误类型，保留原始错误信息。对于不同的第三方库，可以创建不同的适配器函数。

**Q: Effect 的 Schedule 系统支持哪些重试策略？**
A: Schedule 系统支持多种重试策略：固定间隔重试（Schedule.fixed）、指数退避重试（Schedule.exponential）、斐波那契退避重试（Schedule.fibonacci）、递归重试（Schedule.recurs）、条件重试（Schedule.whileInput）、自定义延迟重试（Schedule.modifyDelay）等。多个策略可以组合使用。

**Q: 如何测试错误处理逻辑？**
A: 可以使用 Effect.runSyncExit 获取 Effect 的退出状态，然后检查退出状态是否正确。也可以使用 Effect.either 将错误转换为值，然后断言结果。对于重试逻辑，可以使用 TestClock 加速时间，避免在测试中等待真实时间。

**Q: 在微服务架构中如何传递错误？**
A: 在微服务架构中，错误需要在服务之间正确传递。建议将错误序列化为可传输的格式（如 JSON），在服务边界处进行错误转换。每个服务应该定义自己的错误类型，并在服务边界处将内部错误转换为外部错误。

**Q: Effect 的错误处理与 Either 类型有什么关系？**
A: Effect 的 Effect<A, E, R> 本质上是一个带错误类型的 Either。Effect.either 操作符可以将 Effect 转换为 Either，使得错误可以作为值被处理。Either 类型有两个变体：Left（包含错误）和 Right（包含成功值）。

**Q: 如何避免错误类型膨胀？**
A: 遵循分层错误体系设计，将错误分为基础设施层、数据层、业务层等层次。只在需要不同处理策略时才创建独立的错误类型。对于不需要特殊处理的错误，可以使用统一的错误类型。定期审查错误类型体系，合并重复或相似的类型。

**Q: Effect 的错误处理与 Rust 的 Result 类型有什么异同？**
A: Effect 的错误处理与 Rust 的 Result 类型在理念上非常相似，都是将错误作为值来处理。Rust 的 Result<T, E> 对应 Effect 的 Effect<A, E, never>。两者的主要区别在于：Effect 支持异步操作、依赖注入、资源管理等高级特性，而 Rust 的 Result 是纯同步的。此外，Effect 的 E 维度支持联合类型，可以精确表达多种错误类型。

**Q: 如何在大型项目中组织错误类型？**
A: 在大型项目中，建议按照模块或领域来组织错误类型。每个模块定义自己的错误类型，然后在系统边界处进行错误转换。可以使用命名空间或模块前缀来避免错误类型名称冲突。例如，UserModule 的错误类型可以以 User 为前缀，OrderModule 的错误类型可以以 Order 为前缀。

**Q: Effect 的错误处理与函数式编程中的 Either 单子有什么关系？**
A: Effect 的错误处理本质上是一个 Either 单子的实现。Effect<A, E, R> 可以看作是一个带依赖的 Either<E, A>。Effect 提供了 Either 单子的所有操作，包括 map、flatMap、catchAll 等。此外，Effect 还提供了 Either 单子没有的特性，如依赖注入、资源管理、并发控制等。

**Q: 如何实现自定义的错误恢复策略？**
A: 可以通过组合 Effect 的错误处理操作符来实现自定义的错误恢复策略。例如，先使用 catchTag 处理已知的错误类型，然后使用 catchAll 处理未知的错误类型。在错误处理函数中，可以根据错误的上下文信息决定恢复策略，如重试、降级、使用缓存数据等。

**Q: Effect 的错误处理与日志系统如何集成？**
A: Effect 提供了内置的日志支持，可以通过 Effect.tapError 在错误发生时记录日志。也可以使用 Effect 的 Logger 服务来集成外部的日志系统，如 Winston、Pino 等。在生产环境中，建议使用结构化的日志格式，包含时间戳、错误类型、错误信息、错误上下文等字段。

**Q: 如何在 Effect 中实现错误码？**
A: 可以在错误类型中添加 code 字段来表示错误码。错误码应该具有层次结构，便于分类和查找。例如，使用 AUTH_TOKEN_EXPIRED 表示认证令牌过期，VALIDATION_INVALID_EMAIL 表示邮箱格式无效。错误码应该与错误类型一一对应，便于在代码中引用。

**Q: Effect 的错误处理与 OpenTelemetry 如何集成？**
A: Effect 提供了与 OpenTelemetry 集成的支持。可以使用 Effect.withSpan 为 Effect 添加追踪跨度，Effect.tapError 在错误发生时记录追踪事件。在分布式系统中，这种集成可以帮助开发者追踪错误的传播路径，快速定位问题根因。

**Q: 如何实现错误处理的 AOP（面向切面编程）？**
A: 在 Effect 中，可以通过组合操作符来实现类似 AOP 的错误处理。例如，创建一个 withErrorHandling 函数，它接受一个 Effect 并返回一个带有统一错误处理的 Effect。这种模式可以在不修改业务逻辑的情况下，为多个 Effect 添加统一的错误处理逻辑。

**Q: Effect 的错误处理与 GraphQL 的错误处理如何配合？**
A: 在 GraphQL 中，错误处理需要区分 GraphQL 执行错误和业务错误。Effect 的错误处理机制可以很好地与 GraphQL 配合：使用 Effect 的错误类型来表示业务错误，使用 catchAll 来捕获 GraphQL 执行错误。在 GraphQL 的 resolver 中，可以将 Effect 的错误转换为 GraphQL 的错误格式。

**Q: Effect 的错误处理与 Express 中间件如何集成？**
A: 在 Express 应用中，可以将 Effect 的错误处理与 Express 的错误处理中间件集成。在路由处理函数中，使用 Effect.runPromise 运行 Effect，然后在 catch 中调用 next(error) 将错误传递给 Express 的错误处理中间件。在错误处理中间件中，可以根据 Effect 的错误类型返回不同的 HTTP 状态码和错误信息。

**Q: Effect 的错误处理与 React 的 Error Boundary 如何配合？**
A: 在前端 React 应用中，Effect 的错误处理可以与 React 的 Error Boundary 配合使用。在组件中，使用 Effect.runPromise 运行 Effect，然后在 catch 中使用 setState 更新组件的错误状态。Error Boundary 可以捕获组件中的未处理错误，显示降级 UI。Effect 的错误类型可以帮助开发者精确地控制哪些错误应该显示给用户，哪些错误应该被静默处理。

**Q: Effect 的错误处理与 WebSocket 如何集成？**
A: 在 WebSocket 应用中，错误处理需要考虑连接的稳定性和消息的可靠性。Effect 的错误处理机制可以帮助开发者管理 WebSocket 连接的生命周期，处理连接断开、消息超时、消息格式错误等异常情况。使用 Effect 的 Stream 模块可以方便地处理 WebSocket 的消息流，使用 catchTag 可以精确处理不同类型的 WebSocket 错误。

**Q: Effect 的错误处理与数据库事务如何配合？**
A: 在数据库操作中，错误处理需要保证事务的原子性。Effect 的 STM 模块提供了事务性的错误处理能力。在 STM 事务中，如果发生错误，事务会自动回滚，所有修改都会被撤销。STM 还支持自动重试冲突的事务，确保数据的一致性。使用 Effect 的 acquireRelease 可以确保数据库连接在错误发生时被正确释放。

**Q: Effect 的错误处理与消息队列如何集成？**
A: 在消息队列应用中，错误处理需要考虑消息的可靠投递和消费。Effect 的错误处理机制可以帮助开发者管理消息的消费生命周期，处理消息格式错误、消费超时、消费失败等异常情况。使用 Effect 的 retry 操作符可以实现消息的自动重试，使用 catchTag 可以精确处理不同类型的消息错误。对于无法处理的消息，可以将其发送到死信队列。

**Q: Effect 的错误处理与缓存系统如何配合？**
A: 在缓存系统中，错误处理需要考虑缓存穿透、缓存雪崩、缓存击穿等问题。Effect 的错误处理机制可以帮助开发者实现缓存穿透保护、缓存降级、缓存预热等策略。使用 Effect 的 catchTag 可以精确处理缓存错误，使用 orElse 可以在缓存失败时降级到数据库查询。使用 Effect 的 Ref 可以实现本地缓存，使用 Effect 的 Service 可以管理远程缓存连接。

**Q: Effect 的错误处理与认证授权系统如何集成？**
A: 在认证授权系统中，错误处理需要考虑令牌过期、权限不足、认证失败等场景。Effect 的错误处理机制可以帮助开发者精确处理不同类型的认证授权错误。使用 catchTag 可以分别处理令牌过期、权限不足、认证失败等错误，使用 retry 可以在令牌过期时自动刷新令牌。使用 Effect 的 Service 可以管理认证授权服务的依赖，使用 Layer 可以注入不同的认证授权实现。

**Q: Effect 的错误处理与文件系统操作如何配合？**
A: 在文件系统操作中，错误处理需要考虑文件不存在、权限不足、磁盘空间不足等场景。Effect 的错误处理机制可以帮助开发者精确处理不同类型的文件系统错误。使用 catchTag 可以分别处理文件不存在、权限不足、磁盘空间不足等错误，使用 retry 可以在磁盘空间不足时等待后重试。使用 Effect 的 acquireRelease 可以确保文件句柄在错误发生时被正确关闭。

**Q: Effect 的错误处理与网络请求如何集成？**
A: 在网络请求中，错误处理需要考虑网络超时、DNS 解析失败、连接被拒绝、HTTP 错误状态码等场景。Effect 的错误处理机制可以帮助开发者精确处理不同类型的网络错误。使用 catchTag 可以分别处理超时、连接失败、HTTP 错误等，使用 retry 可以实现指数退避重试。使用 Effect 的 timeout 可以设置请求超时，使用 Effect 的 race 可以实现请求的快速失败。

**Q: Effect 的错误处理与日志聚合系统如何配合？**
A: 在日志聚合系统中，错误处理需要考虑日志写入失败、日志格式错误、日志队列满等场景。Effect 的错误处理机制可以帮助开发者实现日志的可靠写入和错误恢复。使用 Effect 的 Queue 可以实现日志的异步写入，使用 Effect 的 retry 可以在写入失败时重试。对于无法写入的日志，可以将其保存到本地文件，等待系统恢复后重新发送。

**Q: Effect 的错误处理与监控告警系统如何集成？**
A: 在监控告警系统中，错误处理需要考虑告警发送失败、告警重复、告警风暴等场景。Effect 的错误处理机制可以帮助开发者实现告警的可靠发送和去重。使用 Effect 的 Ref 可以实现告警的去重，使用 Effect 的 retry 可以在发送失败时重试。使用 Effect 的 Schedule 可以实现告警的降频，避免告警风暴。使用 Effect 的 catchTag 可以精确处理不同类型的告警错误。

**Q: Effect 的错误处理与配置管理系统如何配合？**
A: 在配置管理系统中，错误处理需要考虑配置读取失败、配置格式错误、配置版本冲突等场景。Effect 的错误处理机制可以帮助开发者实现配置的可靠读取和热更新。使用 Effect 的 Ref 可以实现配置的热更新，使用 Effect 的 catchTag 可以精确处理不同类型的配置错误。使用 Effect 的 Schedule 可以实现配置的定期刷新，使用 Effect 的 orElse 可以在配置读取失败时使用默认配置。
