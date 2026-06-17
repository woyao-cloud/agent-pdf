# 第11章 极致的可测试性（Testability）

## 11.1 引言：为什么可测试性如此重要

在软件工程中，测试是保证代码质量的核心手段。然而，传统面向对象编程中的测试往往面临诸多挑战：依赖管理困难、副作用难以模拟、时间相关的逻辑难以验证、随机数导致测试不可重复。这些问题使得测试变得脆弱、缓慢且不可靠。

Effect 的设计从根本上解决了这些问题。Effect 的核心思想是：**将副作用抽象为 Effect 的 Requirement（R）**。在 `Effect<R, E, A>` 类型中，`R` 表示该 Effect 需要哪些依赖才能运行。这种设计使得依赖关系变得显式、可组合、可替换，从而实现了极致的可测试性。

传统依赖注入框架（如 Spring、Guice、NestJS）虽然也提供了依赖管理能力，但它们存在几个根本性的缺陷。首先，依赖关系是在运行时通过反射或代理机制解析的，类型安全无法得到编译期保证。其次，传统 DI 框架的作用域管理（Singleton、Scoped、Transient）往往需要复杂的配置，且容易引入运行时错误。第三，传统 DI 框架中的 Mock 通常需要额外的 Mock 库（如 Jest、Sinon、Mockito），这些库通过猴子补丁（Monkey Patching）或代理对象来替换依赖，这种方式在 TypeScript 中往往需要大量的类型断言和手动设置。

Effect 的 Requirement 系统从根本上解决了这些问题。依赖关系在类型层面就是显式的——`Effect<R, E, A>` 中的 `R` 是一个类型级别的依赖清单，编译器可以验证所有依赖是否都已提供。Layer 系统提供了纯函数式的依赖组合方式，无需反射、无需代理、无需运行时类型检查。Mock 实现与真实实现遵循相同的接口契约，编译器会确保它们完全一致。

此外，Effect 还提供了一套完整的测试工具，包括 TestClock、TestRandom、TestConsole 等。这些工具与 Effect 的运行时系统深度集成，使得测试时间相关逻辑、随机数逻辑和控制台输出变得简单而优雅。你不再需要 `jest.useFakeTimers` 的 hack，不再需要 `jest.spyOn(console, 'log')` 的样板代码，不再需要为随机数测试的不可重复性而烦恼。

本章将深入探讨 Effect 的测试能力，包括：

1. **副作用抽象为 Requirement**：如何将数据库、HTTP 客户端、文件系统等副作用抽象为 Effect 的依赖
2. **Mock Layer 提供**：如何使用 Layer 系统为测试提供 Mock 实现
3. **TestClock 跨越时间**：如何在测试中模拟时间流逝，无需真实等待
4. **TestRandom 确定性随机**：如何控制随机数生成，使测试可重复
5. **TestConsole 拦截输出**：如何捕获和验证控制台输出

通过这些工具，你可以编写出快速、可靠、可重复的测试，而无需担心外部依赖或环境问题。

可测试性不仅仅是编写测试的能力，更是一种架构设计理念。当你的代码天然就是可测试的时候，测试就不再是开发周期的附加环节，而是开发过程本身的一部分。Effect 通过将副作用提升为类型系统的一等公民，使得可测试性成为架构设计的自然结果，而不是事后补救的措施。这种设计哲学与函数式编程的核心思想一脉相承：将副作用推迟到程序的边界，让核心逻辑保持纯函数的形式。在 Effect 中，即使是数据库查询、HTTP 请求、文件读写这样的强副作用操作，也被表示为纯值——Effect 值。这些值在被执行之前只是描述计算的数据结构，可以被组合、转换、测试，而无需真正执行它们。这种延迟执行（Lazy Evaluation）的特性是 Effect 可测试性的基石。

在实际项目中，可测试性直接影响代码质量和开发效率。研究表明，修复一个在生产环境中发现的 bug 的成本，是在开发阶段发现的 10 到 100 倍。而编写可测试的代码，本质上就是在开发阶段发现更多潜在问题。Effect 的测试工具链使得编写测试变得如此自然，以至于开发者会主动编写更多的测试，从而显著提高代码质量。此外，可测试的代码通常也是模块化程度更高、耦合度更低的代码，这本身就是良好软件设计的标志。

## 11.2 副作用抽象为 Requirement

### 11.2.1 Effect 的类型参数

Effect 的类型签名是 `Effect<R, E, A>`，其中：

- `R`（Requirement）：Effect 运行所需的依赖
- `E`（Error）：Effect 可能产生的错误
- `A`（Success）：Effect 成功时返回的值

当 `R` 为 `never` 时，表示该 Effect 不需要任何依赖，可以直接运行。当 `R` 不为 `never` 时，你需要提供相应的依赖才能运行 Effect。

理解 `R` 参数的关键在于认识到它不是一个简单的类型参数，而是一个**类型级别的依赖清单**。当多个 Effect 通过 `Effect.gen`、`pipe` 或 `flatMap` 组合时，TypeScript 的类型系统会自动计算并合并所有子 Effect 的 `R` 参数。这意味着你永远不需要手动维护依赖列表——编译器会为你完成这项工作。

例如，假设你有三个 Effect：`effectA: Effect<ServiceA, never, number>`、`effectB: Effect<ServiceB, never, string>` 和 `effectC: Effect<ServiceC, never, boolean>`。当你将它们组合时：

```typescript
const combined = Effect.gen(function* () {
  const a = yield* effectA
  const b = yield* effectB
  const c = yield* effectC
  return { a, b, c }
})
// combined 的类型是 Effect<ServiceA | ServiceB | ServiceC, never, { a: number; b: string; c: boolean }>
```

编译器自动推断出 `combined` 需要 `ServiceA | ServiceB | ServiceC` 三个依赖。如果你忘记提供任何一个依赖，编译器会在你调用 `Effect.provide` 时报错。这种编译期的安全保障是传统 DI 框架无法提供的。

这种类型级别的依赖追踪机制在大型项目中尤其有价值。想象一个包含数十个微服务、数百个模块的大型应用，每个模块都有自己的一组依赖。在传统 DI 框架中，如果你在某个模块中添加了一个新的依赖注入，但忘记在测试模块中注册对应的 Mock，这个错误只会在运行时暴露——通常是在执行到相关代码路径时抛出异常。而在 Effect 中，同样的错误会在编译时被捕获，因为类型系统会精确地追踪每个 Effect 的依赖需求。这意味着你可以在编写代码的瞬间就发现依赖配置错误，而不是在测试运行甚至生产环境中才发现。

此外，`R` 参数的联合类型（Union Type）特性使得依赖的组合变得非常灵活。当一个 Effect 需要 `ServiceA | ServiceB` 时，它并不要求这两个服务必须同时来自同一个 Layer。你可以从不同的 Layer 分别提供这两个服务，也可以从一个 Layer 同时提供它们。这种灵活性使得依赖的提供方式可以根据不同的场景进行调整，而无需修改业务逻辑代码。

### 11.2.2 定义服务接口

在 Effect 中，服务通过 `Context.Tag` 来定义：

```typescript
class Logger extends Context.Tag("Logger")<
  Logger,
  { readonly log: (msg: string) => Effect.Effect<void> }
>() {}

class Database extends Context.Tag("Database")<
  Database,
  { readonly query: (sql: string) => Effect.Effect<unknown[]> }
>() {}
```

每个 Tag 定义了一个服务接口，包含服务的方法签名。这些方法返回 `Effect`，使得它们本身也是可组合的。

`Context.Tag` 的创建过程值得深入理解。当你调用 `Context.Tag("Logger")` 时，Effect 内部会创建一个唯一的标识符，这个标识符在运行时用于从 `Context` 中查找对应的服务实现。`Context` 本质上是一个类型安全的 `Map<Identifier, Implementation>`，它使用标识符作为键，服务实现作为值。

Tag 的泛型参数有两个：第一个是 Tag 本身的类型（用于类型安全），第二个是服务接口的类型。这种双参数设计使得 Effect 能够在编译期将 Tag 与其对应的服务接口关联起来，从而在 `yield* Logger` 时获得正确的类型推断。

你可以定义更复杂的服务接口，包含多个方法和属性：

```typescript
class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    readonly findById: (id: string) => Effect.Effect<User | null>
    readonly findByEmail: (email: string) => Effect.Effect<User | null>
    readonly create: (data: CreateUserInput) => Effect.Effect<User>
    readonly update: (id: string, data: Partial<User>) => Effect.Effect<User>
    readonly delete: (id: string) => Effect.Effect<void>
    readonly count: (filter?: UserFilter) => Effect.Effect<number>
  }
>() {}
```

服务接口的方法可以返回任意复杂的 Effect 类型，包括带有错误类型的 Effect：

```typescript
class PaymentGateway extends Context.Tag("PaymentGateway")<
  PaymentGateway,
  {
    readonly charge: (
      amount: number,
      token: string,
    ) => Effect.Effect<TransactionResult, PaymentError>
    readonly refund: (
      transactionId: string,
    ) => Effect.Effect<RefundResult, PaymentError>
    readonly getStatus: (
      transactionId: string,
    ) => Effect.Effect<TransactionStatus>
  }
>() {}
```

这里 `PaymentGateway.charge` 的返回类型是 `Effect.Effect<TransactionResult, PaymentError>`，明确声明了这个操作可能产生 `PaymentError`。在测试中，你可以利用这个错误类型来测试各种失败场景。

### 11.2.3 声明依赖

业务逻辑通过 `yield*` 来获取服务实例：

```typescript
const processUser = (userId: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    const logger = yield* Logger
    const db = yield* Database

    yield* logger.log(`开始处理用户 ${userId}`)
    const users = yield* db.query(`SELECT * FROM users WHERE id = ${userId}`)
    yield* logger.log(`查询结果: ${JSON.stringify(users)}`)
  })
```

这个函数的类型是 `Effect<Logger | Database, Error, void>`，明确声明了它需要 `Logger` 和 `Database` 两个依赖。

`yield*` 是 TypeScript 的 Generator 语法，Effect 利用它来实现类似 `async/await` 的语法。当你在 `Effect.gen` 中 `yield*` 一个 Tag 时，Effect 的运行时系统会从当前的 `Context` 中查找该 Tag 对应的服务实现。这个过程是类型安全的——编译器知道 `yield* Logger` 返回的是 `Logger` 接口的类型。

你可以将多个服务组合成更复杂的业务逻辑：

```typescript
const processOrder = (orderId: string): Effect.Effect<OrderResult, OrderError> =>
  Effect.gen(function* () {
    const logger = yield* Logger
    const db = yield* Database
    const payment = yield* PaymentGateway
    const notification = yield* NotificationService
    const cache = yield* CacheService

    yield* logger.log(`开始处理订单 ${orderId}`)

    // 检查缓存
    const cached = yield* cache.get(`order:${orderId}`)
    if (cached) {
      yield* logger.log(`订单 ${orderId} 从缓存中获取`)
      return cached as OrderResult
    }

    // 从数据库获取订单
    const order = yield* db.query(
      `SELECT * FROM orders WHERE id = ${orderId}`,
    ).pipe(
      Effect.catchAll((e) => Effect.fail(new OrderError("数据库查询失败", e))),
    )

    if (!order || order.length === 0) {
      yield* logger.log(`订单 ${orderId} 不存在`)
      return yield* Effect.fail(new OrderError("订单不存在"))
    }

    // 处理支付
    const paymentResult = yield* payment.charge(
      order[0].amount,
      order[0].paymentToken,
    ).pipe(
      Effect.catchAll((e) => Effect.fail(new OrderError("支付失败", e))),
    )

    // 更新订单状态
    yield* db.query(
      `UPDATE orders SET status = 'paid' WHERE id = ${orderId}`,
    )

    // 发送通知
    yield* notification.notify(order[0].userId, "支付成功")

    // 更新缓存
    yield* cache.set(`order:${orderId}`, paymentResult)

    yield* logger.log(`订单 ${orderId} 处理完成`)
    return paymentResult
  })
```

这个函数的类型是 `Effect<Logger | Database | PaymentGateway | NotificationService | CacheService, OrderError, OrderResult>`。类型系统精确地记录了它需要的所有依赖，以及它可能产生的错误和成功时的返回值。

### 11.2.4 依赖注入的优势

将副作用抽象为 Requirement 带来了以下优势：

在深入讨论具体优势之前，我们需要理解一个核心概念：Effect 的依赖注入与传统依赖注入有着本质的区别。传统依赖注入是一种运行时机制，它通过容器来管理对象的创建和依赖的解析。而 Effect 的依赖注入是一种编译时机制，它通过类型系统来管理依赖的声明和解析。这种区别带来了深远的影响。

在传统依赖注入中，依赖关系是在运行时通过反射或代理机制解析的。这意味着你无法在编译时知道一个对象需要哪些依赖，也无法在编译时验证所有依赖是否都已提供。依赖配置错误只会在运行时暴露，通常是在第一次创建对象时抛出异常。这种运行时依赖解析机制是许多运行时错误的根源。

在 Effect 中，依赖关系是在编译时通过类型系统解析的。每个 Effect 的 `R` 参数精确地声明了它需要哪些依赖，编译器可以验证所有依赖是否都已提供。如果某个依赖没有提供，编译器会给出类型错误。这种编译时依赖解析机制消除了整个类别的运行时错误。

此外，传统依赖注入的作用域管理（Singleton、Scoped、Transient）往往需要复杂的配置，且容易引入运行时错误。例如，在 Spring 中，如果你错误地将一个 Request 作用域的 Bean 注入到一个 Singleton 作用域的 Bean 中，运行时可能会抛出异常。在 Effect 中，作用域通过 Layer 的组合和生命周期来管理，更加直观和可预测。

传统依赖注入中的 Mock 通常需要额外的 Mock 库（如 Jest、Sinon、Mockito），这些库通过猴子补丁（Monkey Patching）或代理对象来替换依赖。这种方式在 TypeScript 中往往需要大量的类型断言和手动设置，且容易引入类型安全问题。在 Effect 中，Mock 实现与真实实现遵循相同的接口契约，编译器会确保它们完全一致。你不需要任何额外的 Mock 库，只需要创建实现了相同接口的普通对象即可。

将副作用抽象为 Requirement 带来了以下优势：

1. **显式依赖**：函数的类型签名明确声明了它需要哪些依赖，调用者一目了然。
2. **可替换性**：依赖可以在运行时替换，无需修改业务逻辑代码。
3. **可测试性**：在测试中提供 Mock 实现，在生产中提供真实实现。
4. **可组合性**：多个依赖可以组合成更大的依赖图。

除了这些基本优势，Requirement 系统还带来了更深层次的架构收益。

**编译期依赖检查**：传统 DI 框架中，如果你忘记注册某个依赖，错误只会在运行时暴露——通常是在第一次请求时抛出 `No provider for X` 异常。而在 Effect 中，如果你忘记提供某个依赖，编译器会给出类型错误。这意味着依赖配置错误在编码阶段就能被发现。

**依赖图的局部推理**：由于每个 Effect 的类型都精确声明了其依赖，你可以独立地推理任何一段代码的依赖需求，而无需了解整个应用的依赖图。这大大降低了认知负担，使得代码审查更加高效。

**零开销抽象**：Effect 的 Requirement 系统在编译时被擦除，不会产生任何运行时开销。与反射或代理机制不同，Effect 的依赖解析是纯数据结构的查找操作，性能极高。

**渐进式依赖声明**：你不需要一开始就为所有代码声明依赖。你可以从简单的函数开始，逐步将副作用提取为服务接口，将依赖声明引入代码库。这种渐进式的采用路径使得 Effect 适合各种规模的项目。

**与传统 DI 框架的对比**：在 NestJS 中，依赖通过 `@Injectable()` 装饰器和构造函数注入来管理。这种方式的问题是：依赖关系是隐式的（通过构造函数参数类型推断），Mock 需要额外的测试模块配置（`Test.createTestingModule`），且作用域管理依赖于框架的运行时代码。在 Effect 中，依赖关系是显式的类型参数，Mock 是普通的 Layer 值，作用域通过 Layer 的组合和生命周期来管理。Effect 的方式更加类型安全、更加可组合、更加可预测。

**Context 系统的内部机制**：Effect 的依赖注入基于 Context 系统实现。Context 本质上是一个不可变的、类型安全的键值映射，其中键是 `Context.Tag` 的实例，值是对应的服务实现。当你调用 `yield* Logger` 时，Effect 的运行时系统会在当前 Fiber 的 Context 中查找 `Logger` Tag 对应的值。如果找到了，就返回该值；如果没找到，就抛出运行时错误。Context 是不可变的，这意味着你不能在运行时修改已有的 Context，但可以通过 `Context.add` 创建包含新条目的新 Context。这种不可变性保证了依赖的确定性——在同一个 Effect 执行过程中，同一个 Tag 总是解析到同一个服务实现。

Context 的不可变性还带来了另一个重要特性：Fiber 安全的依赖隔离。每个 Fiber 都有自己的 Context，这意味着不同 Fiber 中的同一个 Tag 可以解析到不同的服务实现。这在测试中非常有用——你可以在不同的测试用例中使用不同的 Mock 实现，而不用担心它们之间的相互影响。同时，Fiber 的父子关系也体现在 Context 的继承上：子 Fiber 会继承父 Fiber 的 Context，但可以覆盖其中的特定条目。这种继承机制使得你可以在全局层面提供一些通用依赖（如 Logger），在局部层面覆盖特定依赖（如 Database）。

Context 的内部数据结构是一个基于不可变链表的映射。每个 Context 条目包含一个 Tag 和一个对应的实现值。当你在 Context 中添加新的条目时，不会修改原有的 Context，而是创建一个新的 Context 节点，指向原有的 Context。这种结构使得 Context 的创建和查找操作都非常高效——创建操作是 O(1) 的，查找操作在最坏情况下是 O(n) 的，其中 n 是 Context 中的条目数量。在实际应用中，Context 的条目数量通常不会很大（一般在 10 到 50 之间），因此查找性能是可以接受的。

Context 的另一个重要特性是它支持类型的协变和逆变。当你从 Context 中获取一个服务时，你得到的是该服务接口的具体类型。如果你定义了一个子类型接口，你可以将其赋值给父类型接口的 Tag，但反之则不行。这种类型安全性保证了 Context 中的服务始终满足接口契约。

**FiberRef 与 Context 的关系**：FiberRef 是 Effect 中另一个重要的上下文机制，它与 Context 类似但用途不同。FiberRef 用于存储 Fiber 局部的可变状态，而 Context 用于存储 Fiber 局部的不可变依赖。FiberRef 的值可以在 Fiber 内部被修改，而 Context 的值一旦设置就不能修改。在测试中，FiberRef 可以用于模拟一些全局状态，如当前用户、请求 ID、事务上下文等。TestClock 和 TestRandom 的内部实现就使用了 FiberRef 来存储它们的内部状态。

```typescript
// 使用 FiberRef 模拟当前用户
const CurrentUser = FiberRef.unsafeMake<User | null>(null)

const withUser = (user: User) =>
  Effect.fiberRefSet(CurrentUser, user)

const getCurrentUser = Effect.fiberRefGet(CurrentUser)

// 在测试中设置当前用户
const testWithUser = Effect.gen(function* () {
  yield* withUser({ id: 1, name: "测试用户", role: "admin" })
  const user = yield* getCurrentUser
  expect(user?.name).toBe("测试用户")
})
```

**服务版本控制与功能开关**：Context 系统还可以用于实现服务版本控制和功能开关。你可以为同一个服务接口定义多个版本的实现，通过不同的 Tag 来区分它们。在运行时，根据配置或条件选择使用哪个版本的实现。这种模式在微服务架构中特别有用，当你需要同时运行新旧两个版本的服务实现时，可以通过 Context 来管理它们的共存。

```typescript
class PaymentServiceV1 extends Context.Tag("PaymentServiceV1")<
  PaymentServiceV1,
  { readonly charge: (amount: number) => Effect.Effect<PaymentResult> }
>() {}

class PaymentServiceV2 extends Context.Tag("PaymentServiceV2")<
  PaymentServiceV2,
  { readonly charge: (amount: number) => Effect.Effect<PaymentResult> }
>() {}

// 根据功能开关选择版本
const getPaymentService = Effect.gen(function* () {
  const config = yield* AppConfig
  if (config.useV2Payment) {
    return yield* PaymentServiceV2
  }
  return yield* PaymentServiceV1
})
```

**与 InversifyJS 的对比**：InversifyJS 是 TypeScript 生态中最流行的 DI 框架之一，它使用装饰器和反射来实现依赖注入。InversifyJS 需要在类上添加 `@injectable()` 装饰器，在构造函数参数上添加 `@inject(TYPES.Something)` 装饰器，并在容器中注册绑定。这种方式的问题是：装饰器在编译时需要 `experimentalDecorators` 和 `emitDecoratorMetadata` 配置，反射 API 在浏览器和某些运行时环境中可能不可用，且类型安全性依赖于元数据反射的准确性。相比之下，Effect 的依赖注入不依赖任何装饰器或反射，完全基于 TypeScript 的类型系统实现，因此更加可靠和可移植。

**与 Angular DI 的对比**：Angular 的 DI 系统是 Angular 框架的核心特性之一，它通过 `@Injectable()` 装饰器和 `providedIn` 属性来管理依赖。Angular 的 DI 系统支持分层注入器（Hierarchical Injectors），每个组件可以有自己的注入器实例。这种设计在概念上与 Effect 的 Context 系统有相似之处，但 Angular 的注入器是运行时对象，依赖的类型安全性依赖于 TypeScript 的装饰器元数据。Effect 的 Context 系统则完全在类型层面工作，不需要任何运行时类型信息。

**R 参数在大型项目中的实际应用**：在大型项目中，R 参数的价值尤为突出。想象一个包含数百个服务模块的大型后端应用，每个模块都有自己的一组依赖。在传统 DI 框架中，如果你在某个模块中添加了一个新的依赖，你需要手动更新该模块的所有测试配置，否则测试会在运行时失败。在 Effect 中，当你添加一个新的依赖时，编译器会自动更新所有相关 Effect 的 R 参数，任何未提供该依赖的测试都会在编译时报错。这种编译期的安全保障在大型项目中可以节省大量的调试时间。

此外，R 参数的联合类型特性使得依赖的组合非常灵活。当一个 Effect 需要 `ServiceA | ServiceB` 时，它并不要求这两个服务必须同时来自同一个 Layer。你可以从不同的 Layer 分别提供这两个服务，也可以从一个 Layer 同时提供它们。这种灵活性使得依赖的提供方式可以根据不同的场景进行调整，而无需修改业务逻辑代码。例如，在单元测试中，你可以为每个服务提供独立的 Mock Layer；在集成测试中，你可以将多个服务的 Mock 合并到一个 Layer 中；在端到端测试中，你可以使用包含所有真实服务实现的完整 Layer。

R 参数的另一个重要特性是它支持依赖的增量提供。你可以先提供一部分依赖，运行一些测试，然后再提供剩余的依赖。这种增量提供模式在测试复杂的依赖图时非常有用，你可以逐步构建测试环境，每次只关注一部分依赖。

```typescript
// 增量提供依赖
const partialProgram = myEffect.pipe(
  Effect.provideSome(LoggerLayer),
  Effect.provideSome(DatabaseLayer),
)

// 最终提供所有依赖
const fullProgram = partialProgram.pipe(
  Effect.provide(CacheLayer),
)
```

## 11.3 Mock Layer 提供

### 11.3.1 Layer 系统

Layer 是 Effect 中用于构建依赖图的系统。一个 Layer 就是一个依赖的提供者：

```typescript
const TestLogger = Layer.succeed(Logger, {
  log: (msg) => Effect.sync(() => {
    console.log(`[测试日志] ${msg}`)
  }),
})

const TestDb = Layer.succeed(Database, {
  query: (sql) => Effect.succeed([
    { id: 1, name: "测试用户", email: "test@example.com" },
  ]),
})
```

`Layer.succeed` 是最简单的 Layer 创建方式，它接受一个 Tag 和一个服务实现，返回一个提供该服务的 Layer。这个 Layer 是同步的、无副作用的——它只是将服务实现注册到 Context 中。

除了 `Layer.succeed`，Effect 还提供了多种创建 Layer 的方式，以适应不同的场景：

```typescript
// 从 Effect 创建 Layer（适用于需要异步初始化的服务）
const DbLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* DatabaseConfig
    const pool = yield* createConnectionPool(config)
    return {
      query: (sql: string) => Effect.promise(() => pool.query(sql)),
    }
  }),
)

// 从函数创建 Layer（适用于需要清理资源的服务）
const FileSystemLayer = Layer.scoped(
  FileSystem,
  Effect.gen(function* () {
    const tempDir = yield* createTempDir
    yield* Effect.addFinalizer(() => cleanupTempDir(tempDir))
    return {
      readFile: (path: string) => Effect.promise(() => readFile(path)),
      writeFile: (path: string, data: string) =>
        Effect.promise(() => writeFile(path, data)),
    }
  }),
)

// 从已有 Layer 转换
const ExtendedDbLayer = Layer.map(
  DbLayer,
  (db) => ({
    ...db,
    queryWithLogging: (sql: string) =>
      Effect.gen(function* () {
        const logger = yield* Logger
        yield* logger.log(`执行查询: ${sql}`)
        return yield* db.query(sql)
      }),
  }),
)
```

`Layer.effect` 允许你使用 Effect 来初始化服务，这对于需要异步配置或依赖其他服务的场景非常有用。`Layer.scoped` 则更进一步，它允许你为服务添加资源清理逻辑（通过 `Effect.addFinalizer`），确保服务在不再使用时能够正确释放资源。

### 11.3.2 组合 Layer

多个 Layer 可以组合成一个完整的依赖图：

```typescript
const TestEnv = Layer.merge(TestLogger, TestDb)
```

`Layer.merge` 将两个 Layer 合并为一个，提供两者的依赖。

Effect 提供了多种 Layer 组合方式，以满足不同的依赖图构建需求：

```typescript
// 合并多个 Layer
const AllServices = Layer.mergeAll(
  TestLogger,
  TestDb,
  TestCache,
  TestPayment,
  TestNotification,
)

// 合并并覆盖重复的依赖
const ExtendedEnv = Layer.merge(
  BaseEnv,
  OverrideLogger, // 如果 BaseEnv 也提供了 Logger，OverrideLogger 会覆盖它
)

// 提供依赖给另一个 Layer
const DbWithConfig = DatabaseLive.pipe(
  Layer.provide(ConfigLayer),
)

// 合并并传递依赖
const FullEnv = Layer.mergeAll(
  TestLogger,
  TestDb,
).pipe(
  Layer.provideMerge(TestContext.TestContext),
)
```

`Layer.mergeAll` 可以一次性合并多个 Layer，比多次调用 `Layer.merge` 更加简洁。`Layer.provide` 允许你为一个需要依赖的 Layer 提供其所需的依赖，类似于 `Effect.provide` 但作用于 Layer 层面。`Layer.provideMerge` 则是在提供依赖的同时，将提供的依赖也合并到最终的 Context 中。

Layer 的组合是类型安全的。如果你尝试合并两个提供相同 Tag 的 Layer，编译器不会报错（因为这是合法的覆盖行为），但如果你尝试使用一个未提供所有必需依赖的 Layer，编译器会给出类型错误。

Layer 的组合遵循以下规则：

1. **交换律**：`Layer.merge(A, B)` 等价于 `Layer.merge(B, A)`，合并顺序不影响最终结果。
2. **结合律**：`Layer.merge(Layer.merge(A, B), C)` 等价于 `Layer.merge(A, Layer.merge(B, C))`，你可以以任意方式分组合并操作。
3. **幂等性**：如果 A 和 B 提供相同的 Tag，`Layer.merge(A, B)` 的结果中 B 的实现会覆盖 A 的实现（后合并的优先）。

这些规则使得 Layer 的组合行为是可预测的，你可以放心地以任意顺序组合 Layer。

**Layer 的生命周期管理**：Layer 的生命周期与 Effect 的执行周期紧密相关。当你使用 `Effect.provide` 为 Effect 提供 Layer 时，Layer 中的服务会在 Effect 执行期间保持活跃。如果 Layer 是通过 `Layer.scoped` 创建的，那么服务的初始化会在 Effect 开始执行时触发，服务的清理会在 Effect 执行完成后自动执行。这种生命周期管理机制确保了资源的正确分配和释放，避免了内存泄漏和资源耗尽的问题。

```typescript
// 带生命周期的 Layer
const DatabaseLayer = Layer.scoped(
  Database,
  Effect.gen(function* () {
    console.log("数据库连接池初始化")
    const pool = yield* createConnectionPool()
    // 注册清理函数
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        console.log("数据库连接池关闭")
        return pool.close()
      }),
    )
    return {
      query: (sql: string) => Effect.promise(() => pool.query(sql)),
    }
  }),
)
```

**Layer 的延迟初始化**：Layer 默认是延迟初始化的，这意味着 Layer 中的服务只有在被实际使用时才会被创建。这种延迟初始化机制避免了不必要的资源消耗，特别是在大型应用中，很多服务可能只在特定的代码路径中才会被用到。如果你需要强制初始化某个 Layer，可以使用 `Layer.build` 来手动触发初始化。

**Layer 的错误处理**：Layer 的初始化过程可能失败，例如数据库连接失败、配置文件缺失等。Effect 的 Layer 系统提供了完善的错误处理机制，你可以在 Layer 的创建过程中使用 `Effect.catchAll` 等错误处理操作符来处理初始化失败的情况。如果 Layer 初始化失败，整个 Effect 的执行也会失败，错误信息会包含具体的失败原因。

```typescript
const SafeDatabaseLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* DatabaseConfig
    return yield* createConnectionPool(config).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const logger = yield* Logger
          yield* logger.error(`数据库连接失败: ${error.message}`)
          // 使用降级方案
          return yield* createFallbackConnection()
        }),
      ),
    )
  }),
)
```

### 11.3.3 提供依赖

使用 `Effect.provide` 来为 Effect 提供依赖：

```typescript
const testProgram = processUser(1).pipe(
  Effect.provide(TestEnv),
)
```

当所有依赖都提供后，`R` 变为 `never`，Effect 就可以运行了。

Effect 提供了多种提供依赖的方式，以适应不同的使用场景：

```typescript
// 提供所有依赖
const program1 = myEffect.pipe(
  Effect.provide(FullLayer),
)

// 提供部分依赖（剩余的依赖需要后续提供）
const program2 = myEffect.pipe(
  Effect.provideSome(PartialLayer),
)

// 提供依赖并运行
const result = await Effect.runPromise(
  myEffect.pipe(Effect.provide(FullLayer)),
)

// 在测试中提供依赖
const testResult = await Effect.runPromise(
  myEffect.pipe(Effect.provide(TestLayer)),
)
```

`Effect.provide` 要求提供的 Layer 必须满足 Effect 的所有依赖需求。如果 Layer 缺少某个依赖，编译器会报错。`Effect.provideSome` 则允许你只提供部分依赖，剩余的依赖可以在后续通过再次调用 `provide` 或 `provideSome` 来提供。

在测试中，你通常会在测试套件的顶层提供依赖，然后在各个测试用例中共享：

```typescript
const testLayer = Layer.mergeAll(
  TestLogger,
  TestDb,
  TestCache,
).pipe(
  Layer.provideMerge(TestContext.TestContext),
)

const runTest = <E, A>(
  effect: Effect.Effect<never, E, A>,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(testLayer)))

// 测试用例
it("should process user correctly", async () => {
  const result = await runTest(processUser(1))
  expect(result).toEqual(expectedValue)
})

it("should handle database error", async () => {
  const result = await runTest(
    processUser(1).pipe(
      Effect.provide(
        Layer.succeed(Database, {
          query: () => Effect.fail(new Error("DB down")),
        }),
      ),
    ),
  )
  expect(result).toBeDefined()
})
```

### 11.3.4 Mock 策略

编写 Mock 时，需要考虑以下策略：

1. **简单 Mock**：返回固定值，适用于大多数测试场景。
2. **带延迟的 Mock**：模拟网络延迟，测试超时处理。
3. **错误 Mock**：模拟失败场景，测试错误处理逻辑。
4. **状态 Mock**：维护内部状态，模拟真实服务的行为。

```typescript
// 错误 Mock
const FailingDb = Layer.succeed(Database, {
  query: (sql) => Effect.fail(new Error("数据库连接失败")),
})

// 状态 Mock
const StatefulCache = Layer.succeed(CacheService, {
  get: (key) => Effect.sync(() => store.get(key) ?? null),
  set: (key, value) => Effect.sync(() => store.set(key, value)),
})
```

除了这些基本策略，还有一些更高级的 Mock 模式值得掌握。

**参数化 Mock 工厂**：创建可以接受参数的 Mock 工厂函数，使得在不同测试用例中使用不同的 Mock 行为：

```typescript
const createMockDb = (options: {
  shouldFail?: boolean
  delay?: Duration.Duration
  returnData?: unknown[][]
}) => Layer.succeed(Database, {
  query: (sql: string) =>
    Effect.gen(function* () {
      // 模拟延迟
      if (options.delay) {
        yield* Effect.sleep(options.delay)
      }

      // 模拟失败
      if (options.shouldFail) {
        return yield* Effect.fail(new Error("数据库错误"))
      }

      // 根据 SQL 返回不同的数据
      if (sql.includes("users")) {
        return options.returnData?.[0] ?? [
          { id: 1, name: "默认用户" },
        ]
      }
      if (sql.includes("orders")) {
        return options.returnData?.[1] ?? [
          { id: 1, amount: 100, status: "pending" },
        ]
      }
      return options.returnData?.[2] ?? []
    }),
})

// 在测试中使用
const successDb = createMockDb({ delay: Duration.millis(100) })
const failingDb = createMockDb({ shouldFail: true })
const slowDb = createMockDb({ delay: Duration.seconds(60) })
```

**Mock 验证**：验证 Mock 是否被正确调用，包括调用次数、调用参数和调用顺序：

```typescript
const createVerifiableLogger = () => {
  const calls: Array<{ method: string; args: unknown[] }> = []

  const mock = Layer.succeed(Logger, {
    log: (msg: string) =>
      Effect.sync(() => {
        calls.push({ method: "log", args: [msg] })
      }),
    warn: (msg: string) =>
      Effect.sync(() => {
        calls.push({ method: "warn", args: [msg] })
      }),
    error: (msg: string) =>
      Effect.sync(() => {
        calls.push({ method: "error", args: [msg] })
      }),
  })

  return {
    layer: mock,
    verify: {
      calledTimes: (n: number) => calls.length === n,
      calledWith: (method: string, ...args: unknown[]) =>
        calls.some(
          (c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args),
        ),
      getCalls: () => [...calls],
      clear: () => { calls.length = 0 },
    },
  }
}

// 在测试中使用
it("should log processing steps", async () => {
  const { layer, verify } = createVerifiableLogger()

  await runTest(processUser(1).pipe(Effect.provide(layer)))

  expect(verify.calledTimes(2)).toBe(true)
  expect(verify.calledWith("log", "开始处理用户 1")).toBe(true)
  expect(verify.calledWith("log", expect.stringContaining("查询结果"))).toBe(
    true,
  )
})
```

**部分 Mock**：在真实实现的基础上，只 Mock 特定的方法：

```typescript
// 真实实现
const LiveDb = Layer.succeed(Database, {
  query: async (sql) => {
    const pool = await getConnectionPool()
    return pool.query(sql)
  },
  execute: async (sql) => {
    const pool = await getConnectionPool()
    return pool.execute(sql)
  },
  beginTransaction: async () => {
    const pool = await getConnectionPool()
    return pool.beginTransaction()
  },
})

// 部分 Mock：只 Mock query 方法，其他方法使用真实实现
const PartialMockDb = Layer.succeed(Database, {
  ...LiveDb, // 展开真实实现
  query: (sql) => Effect.succeed([{ id: 1, name: "Mock 用户" }]), // 覆盖 query
})
```

**Mock 生命周期管理**：对于需要维护状态的 Mock，确保每个测试用例都使用新的 Mock 实例：

```typescript
const createFreshMockDb = () => {
  const store = new Map<string, unknown[]>()

  return Layer.succeed(Database, {
    query: (sql: string) =>
      Effect.sync(() => {
        const key = sql.trim()
        const result = store.get(key)
        if (result) return result
        const data = generateDefaultData(sql)
        store.set(key, data)
        return data
      }),
    clear: () => Effect.sync(() => store.clear()),
  })
}

// 每个测试用例使用新的 Mock
it("test 1", async () => {
  const db = createFreshMockDb()
  await runTest(someOperation.pipe(Effect.provide(db)))
})

it("test 2", async () => {
  const db = createFreshMockDb() // 全新的 Mock 状态
  await runTest(someOperation.pipe(Effect.provide(db)))
})
```

**Mock 的并发安全性**：在并发测试中，Mock 实现需要是线程安全的。Effect 的 Ref 和 MutableRef 提供了线程安全的可变状态管理，可以用于实现并发安全的 Mock。

```typescript
const createConcurrentSafeMock = () => {
  // 使用 Ref 实现线程安全的计数器
  const callCount = Ref.unsafeMake(0)
  const callArgs = Ref.unsafeMake<unknown[]>([])

  const mock = Layer.succeed(Logger, {
    log: (msg: string) =>
      Ref.update(callCount, (n) => n + 1).pipe(
        Effect.zipRight(
          Ref.update(callArgs, (args) => [...args, msg]),
        ),
      ),
  })

  return {
    layer: mock,
    getCallCount: Ref.get(callCount),
    getCallArgs: Ref.get(callArgs),
  }
}

// 在并发测试中使用
const testConcurrentMock = Effect.gen(function* () {
  const { layer, getCallCount } = createConcurrentSafeMock()

  // 启动 10 个并发 Fiber，每个都调用 Logger
  const fibers = yield* Effect.all(
    Array.from({ length: 10 }, (_, i) =>
      Effect.gen(function* () {
        const logger = yield* Logger
        yield* logger.log(`来自 Fiber ${i} 的消息`)
      }).pipe(Effect.fork),
    ),
    { concurrency: "unbounded" },
  )

  // 等待所有 Fiber 完成
  yield* Effect.all(fibers.map((f) => Fiber.join(f)))

  // 验证 Logger 被调用了 10 次
  const count = yield* getCallCount
  expect(count).toBe(10)
})
```

**Mock 的超时和重试**：在测试中，你可能需要模拟服务调用的超时和重试行为。Effect 的 Duration 和 Schedule 系统可以帮助你创建具有超时和重试行为的 Mock。

```typescript
const createTimeoutMock = (timeoutDuration: Duration.Duration) =>
  Layer.succeed(Database, {
    query: (sql: string) =>
      Effect.sleep(timeoutDuration).pipe(
        Effect.zipRight(Effect.succeed([{ id: 1, name: "超时后返回" }])),
      ),
  })

// 测试超时处理
const testTimeoutHandling = Effect.gen(function* () {
  const slowDb = createTimeoutMock(Duration.seconds(60))
  const fiber = yield* someQuery.pipe(
    Effect.timeout(Duration.seconds(30)),
    Effect.provide(slowDb),
    Effect.fork,
  )
  yield* TestClock.adjust(Duration.seconds(31))
  const result = yield* Fiber.join(fiber).pipe(
    Effect.catchAll((e) => Effect.succeed(`超时: ${e.message}`)),
  )
  expect(result).toContain("超时")
})
```

### 11.3.5 Layer 作用域与环境

Layer 的作用域管理是 Effect 测试中的一个重要概念。不同的测试场景可能需要不同的 Layer 作用域：

```typescript
// 全局作用域：所有测试用例共享
const globalLayer = Layer.mergeAll(
  TestLogger,
  TestDb,
)

// 测试套件作用域：同一个 describe 块中的测试共享
const suiteLayer = Layer.mergeAll(
  globalLayer,
  TestCache,
)

// 测试用例作用域：每个测试用例独立
const testCaseLayer = Layer.mergeAll(
  suiteLayer,
  TestPayment,
)
```

Layer 的作用域决定了依赖的生命周期。全局作用域的 Layer 在测试运行期间只创建一次，适合无状态的服务（如 Logger Mock）。测试用例作用域的 Layer 在每个测试用例运行前创建，运行后销毁，适合有状态的服务（如 Database Mock）。

Effect 的 `Layer.fresh` 可以确保每次使用 Layer 时都创建新的实例：

```typescript
const freshDbLayer = Layer.fresh(createFreshMockDb())

// 每次 provide 都会创建新的 Database 实例
const program1 = someOp.pipe(Effect.provide(freshDbLayer))
const program2 = anotherOp.pipe(Effect.provide(freshDbLayer))
// program1 和 program2 使用不同的 Database 实例
```

**Layer 的递归组合**：Layer 的组合不仅限于两层，你可以递归地组合任意数量的 Layer。Effect 提供了多种组合操作符来满足不同的组合需求。

```typescript
// 水平组合：合并多个同级别的 Layer
const HorizontalLayer = Layer.mergeAll(
  LoggerLayer,
  DatabaseLayer,
  CacheLayer,
  MetricsLayer,
)

// 垂直组合：一个 Layer 依赖另一个 Layer
const VerticalLayer = DatabaseLayer.pipe(
  Layer.provide(ConfigLayer),
)

// 混合组合：水平组合和垂直组合的结合
const FullLayer = Layer.mergeAll(
  LoggerLayer,
  DatabaseLayer.pipe(Layer.provide(ConfigLayer)),
  CacheLayer.pipe(Layer.provide(ConfigLayer)),
)
```

**Layer 的条件选择**：在某些场景下，你可能需要根据条件选择不同的 Layer 实现。Effect 的 Layer 系统支持条件选择，你可以根据配置或环境变量选择不同的 Layer。

```typescript
const DatabaseLayer = Effect.gen(function* () {
  const config = yield* AppConfig
  if (config.env === "production") {
    return ProductionDatabaseLayer
  } else if (config.env === "staging") {
    return StagingDatabaseLayer
  } else {
    return TestDatabaseLayer
  }
})
```

**Layer 的缓存和共享**：默认情况下，Layer 中的服务是共享的——同一个 Layer 提供的服务在多个 Effect 之间共享同一个实例。这种共享机制避免了重复创建服务实例，提高了性能。如果你需要每个 Effect 都使用独立的实例，可以使用 `Layer.fresh` 来创建每次使用都重新初始化的 Layer。

```typescript
// 共享实例：所有 Effect 使用同一个 Database 实例
const SharedDb = DatabaseLayer

// 独立实例：每个 Effect 使用新的 Database 实例
const FreshDb = Layer.fresh(DatabaseLayer)
```

### 11.3.6 测试不同配置

Layer 系统使得测试不同配置变得非常简单。你可以创建多个 Layer，每个 Layer 代表一种配置：

```typescript
// 生产配置
const ProductionConfig = Layer.succeed(AppConfig, {
  dbUrl: "postgres://prod:5432/db",
  cacheTtl: Duration.minutes(30),
  maxRetries: 3,
  logLevel: "info",
})

// 测试配置
const TestConfig = Layer.succeed(AppConfig, {
  dbUrl: "postgres://test:5432/test_db",
  cacheTtl: Duration.seconds(5),
  maxRetries: 1,
  logLevel: "debug",
})

// 性能测试配置
const PerfTestConfig = Layer.succeed(AppConfig, {
  dbUrl: "postgres://perf:5432/perf_db",
  cacheTtl: Duration.seconds(0), // 禁用缓存
  maxRetries: 0,
  logLevel: "error",
})

// 在测试中切换配置
it("should respect cache TTL", async () => {
  const result = await runTest(
    cacheTestProgram.pipe(Effect.provide(TestConfig)),
  )
  expect(result).toBeDefined()
})
```

## 11.4 TestClock：跨越时间

### 11.4.1 时间测试的挑战

在传统测试中，测试时间相关的逻辑非常困难。例如，测试一个 1 小时后超时的逻辑，你需要真实等待 1 小时，这显然不可行。常见的解决方案是使用 `setTimeout` 或 `jest.useFakeTimers`，但这些方案往往不够精确或不够灵活。

具体来说，传统时间测试面临以下挑战：

1. **测试速度慢**：任何涉及真实等待的测试都会显著拖慢测试套件的执行速度。如果一个测试需要等待 30 秒的超时，100 个这样的测试就需要 50 分钟。
2. **测试不稳定**：真实时间测试受系统负载、CPU 调度、垃圾回收等因素影响，可能导致测试间歇性失败。例如，一个设置 100ms 超时的测试，在 CI 环境可能因为系统负载高而提前触发超时。
3. **难以测试并发时间逻辑**：测试多个并发操作的时间交互（如竞态条件、死锁检测）在真实时间下几乎不可能。
4. **难以复现时间相关的 bug**：时间相关的 bug 往往依赖于特定的时间序列，在真实时间下很难精确复现。

Effect 的 TestClock 从根本上解决了这些问题。

### 11.4.2 TestClock 的工作原理

Effect 的 `TestClock` 提供了一个虚拟时钟，你可以在测试中自由控制时间的流逝：

```typescript
import { TestClock, Duration } from "effect"

// 推进时间
yield* TestClock.adjust(Duration.hours(1))
```

当调用 `TestClock.adjust` 时，TestClock 会立即推进虚拟时间，并触发所有等待该时间点的 Effect。

TestClock 的工作原理基于 Effect 的运行时系统对时间操作的拦截。当 Effect 代码调用 `Effect.sleep`、`Effect.timeout` 或其他时间相关操作时，运行时系统不会真正调用 `setTimeout` 或 `Date.now`，而是将这些操作注册到 TestClock 的调度队列中。TestClock 维护一个虚拟时间线，当调用 `adjust` 时，它会遍历调度队列，找到所有应该在新的虚拟时间点触发的操作，并按顺序执行它们。

这种设计的关键优势在于：

1. **确定性**：TestClock 的行为是完全确定的。给定相同的初始状态和相同的 `adjust` 调用序列，TestClock 总是产生相同的结果。
2. **零等待**：所有时间操作都是立即完成的，没有真实的等待时间。
3. **精确性**：TestClock 的时间精度可以达到纳秒级别，远高于 JavaScript 的 `setTimeout`（最小 4ms 延迟）。
4. **可观察性**：你可以随时查询 TestClock 的当前虚拟时间，了解代码执行到了哪个时间点。

TestClock 的内部实现使用了一个优先队列来管理调度事件。每个事件都有一个触发时间，当虚拟时间推进到该时间点时，事件被触发。这种实现确保了事件按照时间顺序执行，即使多个事件具有相同的触发时间，它们也会按照注册顺序执行。

TestClock 与 Effect 的运行时系统之间的集成是通过 Fiber 的调度器实现的。当 Effect 运行时系统检测到 TestClock 在 Context 中时，它会将对时间相关操作（如 `Effect.sleep`、`Effect.timeout`、`Clock.currentTimeMillis` 等）的调用重定向到 TestClock 的虚拟时间实现，而不是真实的系统时间。这种重定向是透明的——业务代码不需要做任何修改就可以在测试中使用 TestClock。

TestClock 的另一个重要特性是它能够正确处理并发时间操作。当多个 Fiber 同时等待不同的时间点时，TestClock 会按照时间顺序依次触发它们。如果多个 Fiber 等待相同的时间点，TestClock 会按照它们注册的先后顺序触发。这种确定性行为使得测试并发时间逻辑变得可预测和可调试。

在实际使用中，TestClock 的时间精度可以达到纳秒级别，远高于 JavaScript 原生 `setTimeout` 的最小 4 毫秒延迟。这意味着你可以测试非常精确的时间逻辑，例如微秒级别的超时处理。同时，TestClock 的虚拟时间不会受到系统负载、垃圾回收、CPU 调度等因素的影响，因此测试结果完全可重复。

TestClock 还支持时间快照功能，你可以在测试过程中保存当前的时间状态，执行一些操作，然后恢复到之前的时间点。这在测试复杂的时间序列时非常有用，例如测试一个需要多次时间推进的交互式流程。

```typescript
const testWithTimeSnapshots = Effect.gen(function* () {
  // 保存初始时间状态
  const snapshot = yield* TestClock.save

  // 执行一些时间操作
  yield* TestClock.adjust(Duration.hours(1))
  const timeAfter1Hour = yield* TestClock.currentTimeMillis

  // 恢复到初始时间状态
  yield* TestClock.restore(snapshot)
  const timeAfterRestore = yield* TestClock.currentTimeMillis
  // timeAfterRestore === 0，恢复到初始状态
})
```

### 11.4.3 基本用法

```typescript
const testProgram = Effect.gen(function* () {
  // 启动一个需要 1 小时的任务
  const fiber = yield* someLongRunningTask.pipe(Effect.fork)

  // 直接推进 1 小时
  yield* TestClock.adjust(Duration.hours(1))

  // 获取结果（无需真实等待）
  const result = yield* Fiber.join(fiber)
})
```

TestClock 的基本使用模式是：先 `fork` 一个 Effect，然后 `adjust` 时间，最后 `join` 获取结果。这种模式适用于大多数时间测试场景。

更完整的测试示例：

```typescript
import { describe, it, expect } from "vitest"
import { TestClock, Effect, Fiber, Duration } from "effect"

describe("TestClock", () => {
  it("should advance time without real waiting", async () => {
    const program = Effect.gen(function* () {
      const start = yield* TestClock.currentTimeMillis
      expect(start).toBe(0)

      yield* TestClock.adjust(Duration.hours(2))

      const end = yield* TestClock.currentTimeMillis
      expect(end).toBe(2 * 60 * 60 * 1000) // 2 小时的毫秒数
    })

    await Effect.runPromise(
      program.pipe(Effect.provide(TestContext.TestContext)),
    )
  })

  it("should trigger scheduled effects", async () => {
    const program = Effect.gen(function* () {
      const results: string[] = []

      const fiber = yield* Effect.gen(function* () {
        yield* Effect.sleep(Duration.hours(1))
        results.push("1 小时后")
        yield* Effect.sleep(Duration.hours(2))
        results.push("3 小时后")
      }).pipe(Effect.fork)

      // 推进 30 分钟
      yield* TestClock.adjust(Duration.minutes(30))
      expect(results).toEqual([]) // 还没有触发

      // 推进到 1 小时
      yield* TestClock.adjust(Duration.minutes(30))
      expect(results).toEqual(["1 小时后"])

      // 推进到 3 小时
      yield* TestClock.adjust(Duration.hours(2))
      expect(results).toEqual(["1 小时后", "3 小时后"])

      yield* Fiber.join(fiber)
    })

    await Effect.runPromise(
      program.pipe(Effect.provide(TestContext.TestContext)),
    )
  })
})
```

### 11.4.4 高级用法

TestClock 还支持更精细的时间控制：

```typescript
// 精确推进
yield* TestClock.adjust(Duration.millis(500))

// 推进到特定时间点
yield* TestClock.setTime(new Date(2024, 0, 1))

// 多次推进
yield* TestClock.adjust(Duration.seconds(30))
yield* TestClock.adjust(Duration.minutes(5))
```

除了基本的 `adjust` 和 `setTime`，TestClock 还提供了其他有用的操作：

```typescript
// 获取当前虚拟时间
const currentTime = yield* TestClock.currentTimeMillis

// 获取当前虚拟时间的 Date 对象
const currentDate = yield* TestClock.currentDate

// 保存和恢复时间状态
const snapshot = yield* TestClock.save
// ... 执行一些时间操作 ...
yield* TestClock.restore(snapshot)

// 推进到所有调度事件都被触发
yield* TestClock.proceed
```

`TestClock.save` 和 `TestClock.restore` 在测试复杂的时间序列时特别有用。你可以在测试开始时保存时间状态，执行一些操作，然后恢复到初始状态，重新测试不同的时间路径。

`TestClock.proceed` 会推进时间直到所有当前已调度的任务都完成。这在测试不确定的时间序列时很有用——你不需要知道具体需要推进多少时间，只需要告诉 TestClock "推进到所有事情都完成"。

### 11.4.5 实际应用场景

TestClock 在以下场景中特别有用：

1. **超时测试**：测试超时处理逻辑，无需真实等待。
2. **定时任务测试**：测试 Cron 任务、定时器、心跳等。
3. **重试逻辑测试**：测试指数退避、重试策略等。
4. **缓存过期测试**：测试缓存过期和刷新逻辑。
5. **会话过期测试**：测试会话超时和续期逻辑。

```typescript
// 超时测试示例
const testTimeout = Effect.gen(function* () {
  const fiber = yield* makeRequest.pipe(
    Effect.timeout(Duration.seconds(30)),
    Effect.fork,
  )

  // 推进 31 秒，触发超时
  yield* TestClock.adjust(Duration.seconds(31))

  const result = yield* Fiber.join(fiber).pipe(
    Effect.catchAll((e) => Effect.succeed(`超时: ${e.message}`)),
  )
})
```

**测试 Rate Limiter（速率限制器）**：

```typescript
const testRateLimiter = Effect.gen(function* () {
  const limiter = yield* RateLimiter

  // 发送 10 个请求
  const requests = Array.from({ length: 10 }, (_, i) =>
    limiter.submit(`request-${i}`),
  )

  const fiber = yield* Effect.all(requests, { concurrency: "unbounded" }).pipe(
    Effect.fork,
  )

  // 速率限制器可能在 1 秒内只允许 5 个请求
  // 推进 1 秒，应该完成 5 个请求
  yield* TestClock.adjust(Duration.seconds(1))
  const partialResults = yield* Fiber.poll(fiber)
  // 验证只有 5 个请求完成

  // 再推进 1 秒，剩余 5 个请求完成
  yield* TestClock.adjust(Duration.seconds(1))
  const allResults = yield* Fiber.join(fiber)
  // 验证所有 10 个请求都完成了
})
```

**测试缓存 TTL**：

```typescript
const testCacheTTL = Effect.gen(function* () {
  const cache = yield* CacheService

  // 写入缓存
  yield* cache.set("key1", "value1", Duration.minutes(5))

  // 立即读取，应该命中
  const hit1 = yield* cache.get("key1")
  expect(hit1).toBe("value1")

  // 推进 4 分钟，缓存仍然有效
  yield* TestClock.adjust(Duration.minutes(4))
  const hit2 = yield* cache.get("key1")
  expect(hit2).toBe("value1")

  // 推进到 6 分钟，缓存过期
  yield* TestClock.adjust(Duration.minutes(2))
  const miss = yield* cache.get("key1")
  expect(miss).toBeNull()
})
```

**测试重试逻辑**：

```typescript
const testRetryWithBackoff = Effect.gen(function* () {
  let attemptCount = 0

  const failingOperation = Effect.gen(function* () {
    attemptCount++
    if (attemptCount < 3) {
      return yield* Effect.fail(new Error("暂时失败"))
    }
    return "成功"
  })

  const fiber = yield* failingOperation.pipe(
    Effect.retry({
      times: 5,
      delay: (attempt) => Duration.seconds(Math.pow(2, attempt)), // 指数退避
    }),
    Effect.fork,
  )

  // 第一次重试在 2 秒后
  yield* TestClock.adjust(Duration.seconds(2))
  expect(attemptCount).toBe(2)

  // 第二次重试在 4 秒后
  yield* TestClock.adjust(Duration.seconds(4))
  expect(attemptCount).toBe(3)

  const result = yield* Fiber.join(fiber)
  expect(result).toBe("成功")
})
```

**测试轮询循环**：

```typescript
const testPollingLoop = Effect.gen(function* () {
  const results: string[] = []

  const poller = Effect.gen(function* () {
    while (true) {
      yield* Effect.sleep(Duration.seconds(10))
      results.push(`轮询时间: ${Date.now()}`)
    }
  })

  const fiber = yield* poller.pipe(Effect.fork)

  // 推进 30 秒，应该触发 3 次轮询
  yield* TestClock.adjust(Duration.seconds(30))
  expect(results.length).toBe(3)

  // 再推进 20 秒，总共 5 次
  yield* TestClock.adjust(Duration.seconds(20))
  expect(results.length).toBe(5)

  yield* Fiber.interrupt(fiber)
})
```

**测试并发操作与时间竞态**：

```typescript
const testConcurrentTimeouts = Effect.gen(function* () {
  const results: string[] = []

  const op1 = Effect.gen(function* () {
    yield* Effect.sleep(Duration.seconds(5))
    results.push("op1 完成")
  })

  const op2 = Effect.gen(function* () {
    yield* Effect.sleep(Duration.seconds(3))
    results.push("op2 完成")
  })

  const fiber = yield* Effect.all([op1, op2], { concurrency: "unbounded" }).pipe(
    Effect.fork,
  )

  // 推进 3 秒，op2 应该完成
  yield* TestClock.adjust(Duration.seconds(3))
  expect(results).toEqual(["op2 完成"])

  // 再推进 2 秒，op1 完成
  yield* TestClock.adjust(Duration.seconds(2))
  expect(results).toEqual(["op2 完成", "op1 完成"])

  yield* Fiber.join(fiber)
})
```

**测试心跳机制**：心跳机制是分布式系统中常用的健康检查手段。使用 TestClock，你可以测试心跳的发送间隔、超时检测和重连逻辑。

```typescript
const testHeartbeat = Effect.gen(function* () {
  const heartbeats: number[] = []
  const HEARTBEAT_INTERVAL = Duration.seconds(5)
  const TIMEOUT_THRESHOLD = 3 // 连续 3 次心跳未收到视为超时

  let missedCount = 0
  let isConnected = true

  const sendHeartbeat = Effect.gen(function* () {
    heartbeats.push(Date.now())
    missedCount = 0
  })

  const checkHeartbeat = Effect.gen(function* () {
    missedCount++
    if (missedCount >= TIMEOUT_THRESHOLD) {
      isConnected = false
    }
  })

  const heartbeatLoop = Effect.gen(function* () {
    while (isConnected) {
      yield* sendHeartbeat
      yield* Effect.sleep(HEARTBEAT_INTERVAL)
    }
  })

  const fiber = yield* heartbeatLoop.pipe(Effect.fork)

  // 推进 15 秒，应该发送 3 次心跳
  yield* TestClock.adjust(Duration.seconds(15))
  expect(heartbeats.length).toBe(3)
  expect(isConnected).toBe(true)

  // 模拟心跳丢失：停止发送心跳
  yield* Fiber.interrupt(fiber)

  // 推进 20 秒，应该检测到超时
  yield* TestClock.adjust(Duration.seconds(20))
  // 此时 missedCount 应该大于等于 3
  // 但由于 Fiber 被中断，checkHeartbeat 不会被调用
  // 这里只是演示 TestClock 在心跳测试中的用法
})
```

**测试并发竞态条件**：竞态条件是并发编程中最难调试的问题之一。使用 TestClock，你可以精确控制并发操作的时间序列，从而测试各种竞态条件。

```typescript
const testRaceCondition = Effect.gen(function* () {
  const results: string[] = []

  // 操作 A：在 1 秒后写入数据
  const operationA = Effect.gen(function* () {
    yield* Effect.sleep(Duration.seconds(1))
    results.push("A 写入")
  })

  // 操作 B：在 2 秒后读取数据
  const operationB = Effect.gen(function* () {
    yield* Effect.sleep(Duration.seconds(2))
    // 此时 A 应该已经写入了数据
    expect(results).toContain("A 写入")
    results.push("B 读取")
  })

  const fiber = yield* Effect.all([operationA, operationB], {
    concurrency: "unbounded",
  }).pipe(Effect.fork)

  // 推进 3 秒，两个操作都应该完成
  yield* TestClock.adjust(Duration.seconds(3))
  yield* Fiber.join(fiber)

  expect(results).toEqual(["A 写入", "B 读取"])
})
```

**测试 Schedule（调度器）**：

```typescript
const testSchedule = Effect.gen(function* () {
  const events: number[] = []

  const schedule = Schedule.spaced(Duration.seconds(5)).pipe(
    Schedule.interspaced(Duration.seconds(1)), // 初始延迟 1 秒
  )

  const fiber = yield* Schedule.run(schedule, () =>
    Effect.sync(() => {
      events.push(Date.now())
    }),
  ).pipe(Effect.fork)

  // 推进 1 秒，第一次触发
  yield* TestClock.adjust(Duration.seconds(1))
  expect(events.length).toBe(1)

  // 推进 5 秒，第二次触发
  yield* TestClock.adjust(Duration.seconds(5))
  expect(events.length).toBe(2)

  // 再推进 10 秒，应该再触发 2 次
  yield* TestClock.adjust(Duration.seconds(10))
  expect(events.length).toBe(4)

  yield* Fiber.interrupt(fiber)
})
```

## 11.5 TestRandom：确定性随机

### 11.5.1 随机数测试的挑战

随机数在测试中是一个常见的问题。如果你的代码使用了随机数，每次测试运行的结果可能不同，导致测试不可重复。这使得调试失败的测试变得非常困难。

随机数测试的具体挑战包括：

1. **不可重复性**：随机数导致每次测试运行产生不同的结果，使得失败的测试无法可靠复现。
2. **难以调试**：当测试因随机数而失败时，你无法确定是代码逻辑错误还是随机数导致的偶发失败。
3. **覆盖不完整**：随机测试可能在某些运行中覆盖了某些代码路径，而在其他运行中没有覆盖，导致测试覆盖率不稳定。
4. **CI 环境的不确定性**：在 CI 环境中，随机数生成器的种子可能因环境差异而不同，导致本地通过的测试在 CI 上失败。

Effect 的 TestRandom 通过提供可控的随机数生成器来解决这些问题。

### 11.5.2 TestRandom 的工作原理

Effect 的 `TestRandom` 提供了一个可控的随机数生成器。你可以设置种子（seed），使得随机数序列完全确定：

```typescript
import { TestRandom, Random } from "effect"

// 设置种子
yield* TestRandom.setSeed(42n)

// 后续的随机数调用将产生确定的结果
const code = yield* Random.nextIntBetween(100000, 999999)
```

TestRandom 使用了一个伪随机数生成器（PRNG），它基于给定的种子生成一个确定性的随机数序列。相同的种子总是产生相同的随机数序列，这使得测试完全可重复。

TestRandom 的 PRNG 实现基于线性同余生成器（Linear Congruential Generator, LCG），这是一种经典的伪随机数生成算法。LCG 的数学公式是：`X_{n+1} = (a * X_n + c) mod m`，其中 `a`、`c` 和 `m` 是精心选择的常数。这种算法具有以下特性：

1. **确定性**：给定相同的种子，总是产生相同的序列。
2. **高效性**：计算速度极快，仅需几次整数运算。
3. **良好的统计特性**：虽然不适用于密码学场景，但对于测试来说已经足够。

TestRandom 支持多种随机数分布，包括均匀分布、正态分布等，所有这些分布都基于同一个底层 PRNG，因此都是确定性的。

TestRandom 的 PRNG 实现经过了精心设计，以确保其统计特性满足测试需求。虽然 LCG 算法在密码学上不够安全（因为它的输出是可预测的），但对于测试来说，这种可预测性恰恰是我们需要的。TestRandom 的 PRNG 周期足够长（通常为 2^48 或更长），可以生成大量的随机数而不会出现重复模式，这使得它适用于需要大量随机数的测试场景，如蒙特卡洛模拟和基于属性的测试。

TestRandom 与 Effect 的运行时系统之间的集成方式与 TestClock 类似。当 TestRandom 在 Context 中时，所有对 `Random` 服务的调用都会被重定向到 TestRandom 的实现。这种重定向是透明的，业务代码不需要做任何修改。你只需要在测试环境中提供 TestContext，就可以自动获得 TestRandom 的能力。

TestRandom 的种子类型是 `bigint`，这意味着你可以使用任意大的整数作为种子。这为种子空间提供了极大的灵活性，你可以使用时间戳、哈希值、文件内容等任意数据作为种子。在实际测试中，通常使用固定的种子（如 `42n`）来确保测试的可重复性，但在某些场景下，你可能希望使用不同的种子来测试不同的随机数路径。

```typescript
// 使用不同的种子测试不同的随机数路径
const testWithMultipleSeeds = Effect.gen(function* () {
  const seeds = [42n, 123n, 999n, 1000n, 8888n]

  for (const seed of seeds) {
    yield* TestRandom.setSeed(seed)
    const result = yield* runRandomizedAlgorithm()
    // 验证算法在所有种子下都能正确运行
    expect(result).toBeDefined()
    expect(result).toSatisfy(allValidations)
  }
})
```

TestRandom 还支持随机数生成器的状态序列化。你可以将当前随机数生成器的状态保存下来，在需要的时候恢复。这在调试随机数相关的 bug 时特别有用——当测试失败时，你可以保存当前的随机数状态，然后在调试时恢复这个状态，精确地重现导致失败的那个随机数序列。

```typescript
const testWithStateSerialization = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  // 生成一些随机数
  const a = yield* Random.nextInt
  const b = yield* Random.nextInt

  // 保存当前状态
  const state = yield* TestRandom.getState

  // 生成更多随机数
  const c = yield* Random.nextInt
  const d = yield* Random.nextInt

  // 恢复之前的状态
  yield* TestRandom.setState(state)

  // 再次生成随机数，应该与 c 和 d 相同
  const c2 = yield* Random.nextInt
  const d2 = yield* Random.nextInt
  expect(c2).toBe(c)
  expect(d2).toBe(d)
})
```

### 11.5.3 基本用法

```typescript
const testProgram = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const code1 = yield* generateVerificationCode
  // 重置种子
  yield* TestRandom.setSeed(42n)
  const code2 = yield* generateVerificationCode
  // code1 === code2，测试可重复
})
```

TestRandom 的基本使用模式是：设置种子，执行随机操作，然后验证结果。如果需要重复测试，只需重置种子即可。

更完整的测试示例：

```typescript
import { describe, it, expect } from "vitest"
import { TestRandom, Random, Effect } from "effect"

describe("TestRandom", () => {
  it("should produce deterministic results with same seed", async () => {
    const program = Effect.gen(function* () {
      yield* TestRandom.setSeed(42n)
      const a = yield* Random.nextInt
      const b = yield* Random.nextInt
      const c = yield* Random.nextInt

      // 重置种子
      yield* TestRandom.setSeed(42n)
      const a2 = yield* Random.nextInt
      const b2 = yield* Random.nextInt
      const c2 = yield* Random.nextInt

      expect(a).toBe(a2)
      expect(b).toBe(b2)
      expect(c).toBe(c2)
    })

    await Effect.runPromise(
      program.pipe(Effect.provide(TestContext.TestContext)),
    )
  })

  it("should produce different results with different seeds", async () => {
    const program = Effect.gen(function* () {
      yield* TestRandom.setSeed(42n)
      const a = yield* Random.nextInt

      yield* TestRandom.setSeed(99n)
      const b = yield* Random.nextInt

      expect(a).not.toBe(b)
    })

    await Effect.runPromise(
      program.pipe(Effect.provide(TestContext.TestContext)),
    )
  })
})
```

### 11.5.4 高级用法

TestRandom 还支持更精细的控制：

```typescript
// 设置固定的随机数序列
yield* TestRandom.setBuffer([1, 2, 3, 4, 5])

// 每次调用 Random 时，从缓冲区中取出下一个值
const a = yield* Random.nextInt // 1
const b = yield* Random.nextInt // 2
const c = yield* Random.nextInt // 3
```

`TestRandom.setBuffer` 允许你完全控制随机数序列，这在测试特定的随机数路径时非常有用。例如，如果你需要测试一个随机数恰好为 0 的边界情况，你可以将缓冲区设置为 `[0]`。

TestRandom 还提供了其他有用的操作：

```typescript
// 重置随机数生成器到初始状态
yield* TestRandom.reset

// 获取当前随机数生成器的状态
const state = yield* TestRandom.getState

// 设置随机数生成器的状态
yield* TestRandom.setState(state)

// 生成指定范围内的随机整数
const value = yield* Random.nextIntBetween(1, 100)

// 生成随机浮点数
const float = yield* Random.next

// 生成随机布尔值
const bool = yield* Random.nextBoolean

// 从数组中随机选择
const item = yield* Random.choice(["a", "b", "c"])

// 打乱数组
const shuffled = yield* Random.shuffle([1, 2, 3, 4, 5])
```

### 11.5.5 实际应用场景

TestRandom 在以下场景中特别有用：

1. **验证码生成测试**：测试验证码生成逻辑。
2. **抽奖系统测试**：测试随机抽奖逻辑。
3. **洗牌算法测试**：测试数组随机排序。
4. **采样算法测试**：测试随机采样逻辑。
5. **密码学相关测试**：测试随机密钥生成。

**测试洗牌算法**：

```typescript
const testShuffle = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const shuffled = yield* Random.shuffle([...original])

  // 验证洗牌后的数组包含相同的元素
  expect(shuffled.sort()).toEqual(original)

  // 验证洗牌后的数组顺序与原始数组不同
  // （理论上有可能相同，但概率极低）
  const isDifferent = shuffled.some((v, i) => v !== original[i])
  expect(isDifferent).toBe(true)

  // 使用相同的种子再次洗牌，结果应该相同
  yield* TestRandom.setSeed(42n)
  const shuffled2 = yield* Random.shuffle([...original])
  expect(shuffled).toEqual(shuffled2)
})
```

**测试 A/B 测试分配**：

```typescript
const testABTestAssignment = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const assignVariant = (userId: string): Effect.Effect<"A" | "B"> =>
    Effect.gen(function* () {
      const hash = yield* Random.nextInt
      return hash % 2 === 0 ? "A" : "B"
    })

  // 测试 100 个用户的分配
  const assignments: string[] = []
  for (let i = 0; i < 100; i++) {
    const variant = yield* assignVariant(`user-${i}`)
    assignments.push(variant)
  }

  // 验证分配比例大致均匀
  const aCount = assignments.filter((v) => v === "A").length
  expect(aCount).toBeGreaterThan(30)
  expect(aCount).toBeLessThan(70)

  // 使用相同种子，分配结果应该相同
  yield* TestRandom.setSeed(42n)
  for (let i = 0; i < 100; i++) {
    const variant = yield* assignVariant(`user-${i}`)
    expect(variant).toBe(assignments[i])
  }
})
```

**测试蒙特卡洛模拟**：

```typescript
const testMonteCarloPI = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const estimatePI = (points: number): Effect.Effect<number> =>
    Effect.gen(function* () {
      let insideCircle = 0

      for (let i = 0; i < points; i++) {
        const x = yield* Random.next
        const y = yield* Random.next
        if (x * x + y * y <= 1) {
          insideCircle++
        }
      }

      return (4 * insideCircle) / points
    })

  const pi = yield* estimatePI(10000)

  // 验证估算值在合理范围内
  expect(pi).toBeGreaterThan(3.0)
  expect(pi).toBeLessThan(3.3)

  // 使用相同种子，结果应该相同
  yield* TestRandom.setSeed(42n)
  const pi2 = yield* estimatePI(10000)
  expect(pi).toBeCloseTo(pi2)
})
```

**测试随机采样**：

```typescript
const testRandomSampling = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const population = Array.from({ length: 1000 }, (_, i) => i)

  // 随机采样 50 个元素
  const sample = yield* Random.shuffle(population).pipe(
    Effect.map((shuffled) => shuffled.slice(0, 50)),
  )

  // 验证采样结果
  expect(sample.length).toBe(50)
  expect(new Set(sample).size).toBe(50) // 无重复

  // 验证所有元素都在原始范围内
  sample.forEach((item) => {
    expect(item).toBeGreaterThanOrEqual(0)
    expect(item).toBeLessThan(1000)
  })

  // 使用相同种子，采样结果应该相同
  yield* TestRandom.setSeed(42n)
  const sample2 = yield* Random.shuffle(population).pipe(
    Effect.map((shuffled) => shuffled.slice(0, 50)),
  )
  expect(sample).toEqual(sample2)
})
```

**测试随机密码生成**：密码生成是随机数的一个常见应用场景。使用 TestRandom，你可以验证密码生成算法的正确性和安全性。

```typescript
const testPasswordGeneration = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const generatePassword = (length: number): Effect.Effect<string> =>
    Effect.gen(function* () {
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
      let password = ""
      for (let i = 0; i < length; i++) {
        const index = yield* Random.nextIntBetween(0, chars.length - 1)
        password += chars[index]
      }
      return password
    })

  const password = yield* generatePassword(16)

  // 验证密码长度
  expect(password.length).toBe(16)

  // 验证密码包含至少一个大写字母
  expect(password).toMatch(/[A-Z]/)

  // 验证密码包含至少一个小写字母
  expect(password).toMatch(/[a-z]/)

  // 验证密码包含至少一个数字
  expect(password).toMatch(/[0-9]/)

  // 验证密码包含至少一个特殊字符
  expect(password).toMatch(/[!@#$%^&*]/)

  // 使用相同种子，生成的密码应该相同
  yield* TestRandom.setSeed(42n)
  const password2 = yield* generatePassword(16)
  expect(password).toBe(password2)
})
```

**测试随机 ID 生成**：在分布式系统中，唯一 ID 的生成是一个常见需求。使用 TestRandom，你可以测试 ID 生成算法的唯一性和格式正确性。

```typescript
const testRandomIdGeneration = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const generateId = (): Effect.Effect<string> =>
    Effect.gen(function* () {
      const timestamp = Date.now().toString(36)
      const randomPart = (yield* Random.nextInt).toString(36).substring(0, 8)
      return `${timestamp}-${randomPart}`
    })

  // 生成 100 个 ID
  const ids: string[] = []
  for (let i = 0; i < 100; i++) {
    const id = yield* generateId()
    ids.push(id)
  }

  // 验证所有 ID 都是唯一的
  const uniqueIds = new Set(ids)
  expect(uniqueIds.size).toBe(100)

  // 验证 ID 格式
  ids.forEach((id) => {
    expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/)
    expect(id.length).toBeGreaterThan(10)
  })

  // 使用相同种子，生成的 ID 序列应该相同
  yield* TestRandom.setSeed(42n)
  for (let i = 0; i < 100; i++) {
    const id = yield* generateId()
    expect(id).toBe(ids[i])
  }
})
```

**测试随机权重选择**：在游戏开发或推荐系统中，经常需要根据权重随机选择项目。TestRandom 可以帮助你测试权重选择算法的正确性。

```typescript
const testWeightedRandomSelection = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const items = [
    { name: "普通", weight: 70 },
    { name: "稀有", weight: 25 },
    { name: "传说", weight: 5 },
  ]

  const weightedSelect = (): Effect.Effect<string> =>
    Effect.gen(function* () {
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0)
      const random = yield* Random.nextIntBetween(1, totalWeight)
      let cumulative = 0
      for (const item of items) {
        cumulative += item.weight
        if (random <= cumulative) {
          return item.name
        }
      }
      return items[items.length - 1].name
    })

  // 执行 1000 次选择，统计分布
  const counts: Record<string, number> = { 普通: 0, 稀有: 0, 传说: 0 }
  for (let i = 0; i < 1000; i++) {
    const selected = yield* weightedSelect()
    counts[selected]++
  }

  // 验证分布大致符合权重比例
  expect(counts["普通"]).toBeGreaterThan(600)
  expect(counts["普通"]).toBeLessThan(800)
  expect(counts["稀有"]).toBeGreaterThan(150)
  expect(counts["稀有"]).toBeLessThan(350)
  expect(counts["传说"]).toBeGreaterThan(10)
  expect(counts["传说"]).toBeLessThan(100)
})
```

**结合属性测试**：

```typescript
const testSortProperty = Effect.gen(function* () {
  // 测试排序算法的属性：排序后的数组应该是有序的
  for (let i = 0; i < 50; i++) {
    yield* TestRandom.setSeed(BigInt(i))

    // 生成随机数组
    const arr = Array.from(
      { length: yield* Random.nextIntBetween(1, 100) },
      () => yield* Random.nextInt,
    )

    const sorted = [...arr].sort((a, b) => a - b)

    // 属性 1：排序后的数组长度不变
    expect(sorted.length).toBe(arr.length)

    // 属性 2：排序后的数组是有序的
    for (let j = 1; j < sorted.length; j++) {
      expect(sorted[j - 1]).toBeLessThanOrEqual(sorted[j])
    }

    // 属性 3：排序后的数组包含相同的元素
    expect([...sorted].sort((a, b) => a - b)).toEqual(sorted)
  }
})
```

## 11.6 TestConsole：拦截输出

### 11.6.1 控制台测试的挑战

在传统测试中，测试控制台输出非常困难。`console.log` 直接输出到标准输出，你无法在测试中捕获和验证这些输出。常见的做法是使用 `jest.spyOn` 来模拟 `console.log`，但这需要额外的设置和清理工作。

传统控制台测试的问题包括：

1. **测试输出污染**：被测试代码的控制台输出会混入测试运行器的输出中，使得测试结果难以阅读。
2. **清理工作繁琐**：使用 `jest.spyOn` 后需要在测试结束后恢复原始 `console` 方法，否则会影响其他测试。
3. **并发测试问题**：在并行测试中，多个测试同时修改全局 `console` 对象会导致竞态条件。
4. **结构化日志难以验证**：现代应用通常使用结构化日志（JSON 格式），传统方法难以验证日志的结构和内容。

Effect 的 TestConsole 从根本上解决了这些问题。

### 11.6.2 TestConsole 的工作原理

Effect 的 `TestConsole` 拦截所有控制台输出，将其存储在内部缓冲区中，供测试验证：

```typescript
import { TestConsole, Console } from "effect"

const testProgram = Effect.gen(function* () {
  yield* Console.log("Hello, World!")
  const output = yield* TestConsole.getOutput()
  // output 包含 "Hello, World!"
})
```

TestConsole 的工作原理是：当 Effect 的运行时系统检测到 TestConsole 在 Context 中时，它会将对 `Console` 服务的所有调用重定向到 TestConsole 的内部缓冲区，而不是真正的标准输出。这个缓冲区是一个线程安全的数据结构，可以安全地在并发测试中使用。

TestConsole 的内部缓冲区是一个 `Ref<ReadonlyArray<string>>`，每次调用 `Console.log`、`Console.warn` 或 `Console.error` 时，对应的消息会被追加到缓冲区中。`TestConsole.getOutput` 会返回当前缓冲区中的所有消息。

TestConsole 的缓冲区是 Fiber 安全的，这意味着多个并发 Fiber 可以同时写入控制台输出，而不会出现数据竞争或输出错乱的问题。每个写入操作都是原子的，缓冲区的内容始终是一致的。这种 Fiber 安全的实现使得 TestConsole 可以在并发测试中可靠地工作。

TestConsole 与 Effect 的 Console 服务之间的集成是通过 Context 系统实现的。当 TestConsole 在 Context 中时，Console 服务的所有方法（`log`、`warn`、`error`、`info`、`debug` 等）都会被重定向到 TestConsole 的实现。这种重定向是透明的，业务代码不需要做任何修改。你只需要在测试环境中提供 TestContext，就可以自动获得 TestConsole 的能力。

TestConsole 的缓冲区可以通过 `clear` 方法清空，这在测试多个独立的输出场景时非常有用。你可以在每个测试用例开始前清空缓冲区，确保测试用例之间的输出不会相互干扰。同时，`getOutput` 方法返回的是缓冲区的一个快照，而不是引用，因此你可以在获取输出后继续写入新的输出，而不会影响已经获取到的输出内容。

```typescript
const testBufferIsolation = Effect.gen(function* () {
  yield* Console.log("消息 A")
  const snapshot1 = yield* TestConsole.getOutput()
  expect(snapshot1).toEqual(["消息 A"])

  // 继续写入，不影响已获取的快照
  yield* Console.log("消息 B")
  expect(snapshot1).toEqual(["消息 A"]) // 快照不变
  const snapshot2 = yield* TestConsole.getOutput()
  expect(snapshot2).toEqual(["消息 A", "消息 B"])
})
```

TestConsole 还支持对输出内容的模式匹配和过滤。你可以使用数组方法（如 `filter`、`map`、`reduce`）来处理输出内容，验证特定模式的日志是否存在。这种灵活性使得 TestConsole 适用于各种复杂的日志验证场景。

```typescript
const testOutputFiltering = Effect.gen(function* () {
  yield* Console.log("[INFO] 服务启动")
  yield* Console.log("[WARN] 内存使用率 80%")
  yield* Console.log("[ERROR] 数据库连接超时")
  yield* Console.log("[INFO] 请求处理完成")

  const output = yield* TestConsole.getOutput()

  // 过滤出所有错误日志
  const errors = output.filter((line) => line.includes("[ERROR]"))
  expect(errors.length).toBe(1)
  expect(errors[0]).toContain("数据库连接超时")

  // 过滤出所有警告日志
  const warnings = output.filter((line) => line.includes("[WARN]"))
  expect(warnings.length).toBe(1)
  expect(warnings[0]).toContain("内存使用率")
})
```

### 11.6.3 基本用法

```typescript
const testProgram = Effect.gen(function* () {
  yield* Console.log("开始处理")
  yield* Console.warn("警告：数据不完整")
  yield* Console.error("错误：处理失败")

  const output = yield* TestConsole.getOutput()
  // 验证输出内容
  console.log(output)
})
```

TestConsole 的基本使用模式是：执行代码，获取输出，验证输出。这种模式适用于大多数控制台测试场景。

更完整的测试示例：

```typescript
import { describe, it, expect } from "vitest"
import { TestConsole, Console, Effect } from "effect"

describe("TestConsole", () => {
  it("should capture console output", async () => {
    const program = Effect.gen(function* () {
      yield* Console.log("Hello")
      yield* Console.log("World")

      const output = yield* TestConsole.getOutput()
      expect(output).toEqual(["Hello", "World"])
    })

    await Effect.runPromise(
      program.pipe(Effect.provide(TestContext.TestContext)),
    )
  })

  it("should capture different log levels", async () => {
    const program = Effect.gen(function* () {
      yield* Console.log("info message")
      yield* Console.warn("warning message")
      yield* Console.error("error message")

      const output = yield* TestConsole.getOutput()
      expect(output).toEqual([
        "info message",
        "warning message",
        "error message",
      ])
    })

    await Effect.runPromise(
      program.pipe(Effect.provide(TestContext.TestContext)),
    )
  })
})
```

### 11.6.4 高级用法

TestConsole 还支持以下操作：

```typescript
// 清空控制台缓冲区
yield* TestConsole.clear()

// 检查是否有特定输出
const output = yield* TestConsole.getOutput()
const hasWarning = output.some(line => line.includes("警告"))

// 多次获取输出
yield* Console.log("第一次")
const out1 = yield* TestConsole.getOutput()
yield* Console.log("第二次")
const out2 = yield* TestConsole.getOutput()
```

除了这些基本操作，TestConsole 还支持更高级的用法：

```typescript
// 验证输出顺序
const testOutputOrder = Effect.gen(function* () {
  yield* Console.log("step1")
  yield* Console.log("step2")
  yield* Console.log("step3")

  const output = yield* TestConsole.getOutput()
  expect(output[0]).toBe("step1")
  expect(output[1]).toBe("step2")
  expect(output[2]).toBe("step3")
})

// 验证输出数量
const testOutputCount = Effect.gen(function* () {
  for (let i = 0; i < 5; i++) {
    yield* Console.log(`iteration ${i}`)
  }

  const output = yield* TestConsole.getOutput()
  expect(output.length).toBe(5)
})

// 验证输出格式
const testOutputFormat = Effect.gen(function* () {
  const user = { id: 1, name: "Alice" }
  yield* Console.log(`User: ${JSON.stringify(user)}`)

  const output = yield* TestConsole.getOutput()
  expect(output[0]).toContain("Alice")
  expect(output[0]).toContain('"id":1')
})

// 在并发场景下验证输出
const testConcurrentOutput = Effect.gen(function* () {
  const fiber1 = yield* Effect.gen(function* () {
    yield* Console.log("from fiber 1")
  }).pipe(Effect.fork)

  const fiber2 = yield* Effect.gen(function* () {
    yield* Console.log("from fiber 2")
  }).pipe(Effect.fork)

  yield* Fiber.join(fiber1)
  yield* Fiber.join(fiber2)

  const output = yield* TestConsole.getOutput()
  expect(output).toContain("from fiber 1")
  expect(output).toContain("from fiber 2")
})
```

### 11.6.5 实际应用场景

TestConsole 在以下场景中特别有用：

1. **日志验证**：验证代码在特定条件下是否记录了正确的日志。
2. **调试输出测试**：验证调试信息的完整性和正确性。
3. **用户界面反馈测试**：验证控制台输出的用户提示信息。
4. **错误报告测试**：验证错误信息的格式和内容。

**测试结构化日志**：

```typescript
const testStructuredLogging = Effect.gen(function* () {
  const logInfo = (event: string, data: Record<string, unknown>) =>
    Console.log(JSON.stringify({ event, data, timestamp: Date.now() }))

  yield* logInfo("user_login", { userId: 123, ip: "192.168.1.1" })

  const output = yield* TestConsole.getOutput()
  const logEntry = JSON.parse(output[0])

  expect(logEntry.event).toBe("user_login")
  expect(logEntry.data.userId).toBe(123)
  expect(logEntry.data.ip).toBe("192.168.1.1")
  expect(logEntry.timestamp).toBeDefined()
})
```

**测试不同日志级别**：

```typescript
const testLogLevels = Effect.gen(function* () {
  const logWithLevel = (level: string, msg: string) => {
    switch (level) {
      case "info":
        return Console.log(`[INFO] ${msg}`)
      case "warn":
        return Console.warn(`[WARN] ${msg}`)
      case "error":
        return Console.error(`[ERROR] ${msg}`)
      default:
        return Console.log(`[${level}] ${msg}`)
    }
  }

  yield* logWithLevel("info", "服务启动")
  yield* logWithLevel("warn", "内存使用率 80%")
  yield* logWithLevel("error", "数据库连接失败")

  const output = yield* TestConsole.getOutput()
  expect(output[0]).toMatch(/^\[INFO\]/)
  expect(output[1]).toMatch(/^\[WARN\]/)
  expect(output[2]).toMatch(/^\[ERROR\]/)
})
```

**测试生产与开发模式**：

```typescript
const testLogMode = Effect.gen(function* () {
  const isProduction = false // 测试开发模式

  const debugLog = (msg: string) =>
    isProduction
      ? Effect.void // 生产模式不输出调试日志
      : Console.log(`[DEBUG] ${msg}`)

  yield* debugLog("变量 x 的值为 42")
  yield* Console.log("[INFO] 处理完成")

  const output = yield* TestConsole.getOutput()

  if (isProduction) {
    expect(output.length).toBe(1) // 只有 INFO 日志
    expect(output[0]).toBe("[INFO] 处理完成")
  } else {
    expect(output.length).toBe(2) // 包含 DEBUG 日志
    expect(output[0]).toBe("[DEBUG] 变量 x 的值为 42")
  }
})
```

**测试日志轮转和大小限制**：在生产环境中，日志系统通常有大小限制和轮转策略。使用 TestConsole，你可以测试日志系统在达到大小限制时的行为。

```typescript
const testLogRotation = Effect.gen(function* () {
  const maxLogSize = 3
  const logBuffer: string[] = []

  const logWithRotation = (msg: string) =>
    Effect.sync(() => {
      logBuffer.push(msg)
      if (logBuffer.length > maxLogSize) {
        const rotated = logBuffer.shift()
        console.log(`[轮转] 移除旧日志: ${rotated}`)
      }
      console.log(msg)
    })

  yield* logWithRotation("日志 1")
  yield* logWithRotation("日志 2")
  yield* logWithRotation("日志 3")
  yield* logWithRotation("日志 4") // 触发轮转
  yield* logWithRotation("日志 5") // 触发轮转

  const output = yield* TestConsole.getOutput()
  expect(output.length).toBe(7) // 5 条日志 + 2 条轮转消息
  expect(output.some((l) => l.includes("[轮转]"))).toBe(true)
  expect(logBuffer.length).toBe(3) // 最多保留 3 条
  expect(logBuffer).toEqual(["日志 3", "日志 4", "日志 5"])
})
```

**测试日志采样**：在高吞吐量的系统中，通常会对日志进行采样，只记录部分请求的日志以控制存储成本。TestConsole 可以帮助你测试日志采样逻辑的正确性。

```typescript
const testLogSampling = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  const SAMPLE_RATE = 0.1 // 10% 采样率
  const sampledLogs: string[] = []

  const logWithSampling = (msg: string) =>
    Effect.gen(function* () {
      const random = yield* Random.next
      if (random < SAMPLE_RATE) {
        sampledLogs.push(msg)
        yield* Console.log(`[采样] ${msg}`)
      }
    })

  // 模拟 1000 个请求
  for (let i = 0; i < 1000; i++) {
    yield* logWithSampling(`请求 ${i} 处理完成`)
  }

  // 验证采样数量大致符合采样率
  const output = yield* TestConsole.getOutput()
  expect(output.length).toBeGreaterThan(50)
  expect(output.length).toBeLessThan(150)

  // 使用相同种子，采样结果应该相同
  yield* TestRandom.setSeed(42n)
  const sampledLogs2: string[] = []
  for (let i = 0; i < 1000; i++) {
    const random = yield* Random.next
    if (random < SAMPLE_RATE) {
      sampledLogs2.push(`请求 ${i} 处理完成`)
    }
  }
  expect(sampledLogs).toEqual(sampledLogs2)
})
```

**测试日志格式化**：在分布式系统中，日志通常需要包含特定的上下文信息，如请求 ID、服务名称、时间戳等。TestConsole 可以帮助你验证日志格式化的正确性。

```typescript
const testLogFormatting = Effect.gen(function* () {
  const formatLog = (level: string, message: string, context: Record<string, unknown>) =>
    Console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: "user-service",
        message,
        ...context,
      }),
    )

  yield* formatLog("INFO", "用户登录成功", { userId: 123, ip: "192.168.1.1" })

  const output = yield* TestConsole.getOutput()
  const logEntry = JSON.parse(output[0])

  expect(logEntry.level).toBe("INFO")
  expect(logEntry.service).toBe("user-service")
  expect(logEntry.message).toBe("用户登录成功")
  expect(logEntry.userId).toBe(123)
  expect(logEntry.ip).toBe("192.168.1.1")
  expect(logEntry.timestamp).toBeDefined()
})
```

**测试错误日志聚合**：

```typescript
const testErrorAggregation = Effect.gen(function* () {
  const errors: Array<{ message: string; count: number }> = []

  const logError = (msg: string) =>
    Effect.sync(() => {
      const existing = errors.find((e) => e.message === msg)
      if (existing) {
        existing.count++
      } else {
        errors.push({ message: msg, count: 1 })
      }
      console.error(msg)
    })

  yield* logError("连接超时")
  yield* logError("连接超时")
  yield* logError("连接超时")
  yield* logError("认证失败")

  expect(errors.length).toBe(2)
  expect(errors.find((e) => e.message === "连接超时")?.count).toBe(3)
  expect(errors.find((e) => e.message === "认证失败")?.count).toBe(1)
})
```

## 11.7 组合测试工具

### 11.7.1 多工具协同

Effect 的测试工具可以组合使用，提供完整的测试能力：

```typescript
const AllMocks = Layer.mergeAll(
  MockCache,
  MockMetrics,
  MockDatabase,
).pipe(
  Layer.provideMerge(TestContext.TestContext),
)
```

`TestContext` 包含了 `TestClock`、`TestRandom`、`TestConsole` 等所有测试工具，通过 `Layer.provideMerge` 可以将其与自定义 Mock 组合。

多工具协同的完整示例：

```typescript
const testComplexScenario = Effect.gen(function* () {
  // 设置随机数种子
  yield* TestRandom.setSeed(42n)

  // 生成随机用户数据
  const userId = yield* Random.nextIntBetween(1, 1000)
  const amount = yield* Random.nextIntBetween(10, 10000)

  // 执行业务逻辑
  const fiber = yield* processPayment(userId, amount).pipe(
    Effect.timeout(Duration.seconds(30)),
    Effect.fork,
  )

  // 推进时间，模拟网络延迟
  yield* TestClock.adjust(Duration.seconds(5))

  // 检查日志输出
  const logs = yield* TestConsole.getOutput()
  expect(logs.some((l) => l.includes("处理支付"))).toBe(true)

  // 完成操作
  yield* TestClock.adjust(Duration.seconds(25))
  const result = yield* Fiber.join(fiber)

  // 验证最终日志
  const finalLogs = yield* TestConsole.getOutput()
  expect(finalLogs.some((l) => l.includes("支付成功"))).toBe(true)
})
```

**多工具协同的复杂场景**：在实际项目中，你经常需要同时使用多个测试工具来模拟复杂的生产环境。例如，测试一个支付系统时，你可能需要同时控制时间（模拟支付超时）、控制随机数（生成测试数据）、拦截日志（验证支付流程）、以及 Mock 多个外部服务（支付网关、通知服务、数据库）。Effect 的测试工具可以无缝协同工作，因为它们在同一个 Context 中运行，共享同一个运行时环境。

```typescript
const testPaymentSystemWithAllTools = Effect.gen(function* () {
  // 1. 设置 TestRandom 种子，确保测试数据可重复
  yield* TestRandom.setSeed(42n)

  // 2. 生成随机测试数据
  const orderId = yield* Random.nextIntBetween(1000, 9999)
  const amount = yield* Random.nextIntBetween(50, 5000)

  // 3. 启动支付流程
  const paymentFiber = yield* processPayment(orderId, amount).pipe(
    Effect.timeout(Duration.seconds(30)),
    Effect.fork,
  )

  // 4. 模拟网络延迟，推进 5 秒
  yield* TestClock.adjust(Duration.seconds(5))

  // 5. 检查日志，验证支付流程已经开始
  let currentLogs = yield* TestConsole.getOutput()
  expect(currentLogs.some((l) => l.includes("开始处理支付"))).toBe(true)

  // 6. 再推进 25 秒，模拟支付处理完成
  yield* TestClock.adjust(Duration.seconds(25))

  // 7. 获取支付结果
  const result = yield* Fiber.join(paymentFiber)

  // 8. 验证最终日志
  currentLogs = yield* TestConsole.getOutput()
  expect(currentLogs.some((l) => l.includes("支付完成"))).toBe(true)
  expect(currentLogs.some((l) => l.includes(`订单 ${orderId}`))).toBe(true)

  // 9. 验证支付结果
  expect(result.status).toBe("success")
  expect(result.amount).toBe(amount)
})
```

**测试分布式事务**：分布式事务是微服务架构中最复杂的场景之一。使用 Effect 的测试工具，你可以模拟分布式事务的完整流程，包括服务调用、超时处理、补偿事务等。

```typescript
const testDistributedTransaction = Effect.gen(function* () {
  const logger = yield* Logger
  const orderService = yield* OrderService
  const paymentService = yield* PaymentService
  const inventoryService = yield* InventoryService
  const notificationService = yield* NotificationService

  yield* logger.log("开始测试分布式事务")

  // 步骤 1：创建订单
  const order = yield* orderService.createOrder({ userId: 1, items: ["item1", "item2"] })
  yield* logger.log(`订单创建成功: ${order.id}`)

  // 步骤 2：扣减库存
  const inventoryResult = yield* inventoryService.reserve(order.items)
  if (!inventoryResult.success) {
    yield* logger.log("库存不足，回滚订单")
    yield* orderService.cancelOrder(order.id)
    return { success: false, reason: "库存不足" }
  }
  yield* logger.log("库存扣减成功")

  // 步骤 3：处理支付
  const paymentResult = yield* paymentService.charge(order.total, "tok_valid")
  if (!paymentResult.success) {
    yield* logger.log("支付失败，回滚库存和订单")
    yield* inventoryService.release(order.items)
    yield* orderService.cancelOrder(order.id)
    return { success: false, reason: "支付失败" }
  }
  yield* logger.log("支付处理成功")

  // 步骤 4：发送通知
  yield* notificationService.notify(1, "订单支付成功")
  yield* logger.log("通知发送成功")

  // 验证所有步骤的日志
  const logs = yield* TestConsole.getOutput()
  expect(logs.filter((l) => l.includes("成功")).length).toBe(4)
  expect(logs.filter((l) => l.includes("失败")).length).toBe(0)
})
```

### 11.7.2 集成测试

集成测试涉及多个服务的交互。使用 Effect 的 Layer 系统，你可以轻松构建集成测试环境：

```typescript
const testProgram = Effect.gen(function* () {
  const payment = yield* PaymentGateway
  const notification = yield* NotificationService
  const repo = yield* OrderRepository

  const txnId = yield* payment.charge(amount, token)
  yield* repo.save(order)
  yield* notification.notify(userId, "支付成功")
})
```

更复杂的集成测试场景：

```typescript
const testOrderWorkflow = Effect.gen(function* () {
  const logger = yield* Logger
  const db = yield* Database
  const payment = yield* PaymentGateway
  const notification = yield* NotificationService
  const cache = yield* CacheService
  const metrics = yield* MetricsService

  yield* logger.log("开始测试订单工作流")

  // 1. 创建订单
  const order = yield* db.query(
    "INSERT INTO orders (user_id, amount, status) VALUES (1, 100, 'pending') RETURNING *",
  )
  yield* logger.log(`订单创建成功: ${JSON.stringify(order)}`)

  // 2. 处理支付
  const paymentResult = yield* payment.charge(100, "tok_test_123")
  yield* logger.log(`支付处理成功: ${JSON.stringify(paymentResult)}`)

  // 3. 更新订单状态
  yield* db.query(
    `UPDATE orders SET status = 'paid' WHERE id = ${order[0].id}`,
  )

  // 4. 更新缓存
  yield* cache.set(`order:${order[0].id}`, { status: "paid" })

  // 5. 发送通知
  yield* notification.notify(1, "支付成功")

  // 6. 记录指标
  yield* metrics.increment("order.completed")

  // 验证所有步骤的日志
  const logs = yield* TestConsole.getOutput()
  expect(logs.some((l) => l.includes("订单创建成功"))).toBe(true)
  expect(logs.some((l) => l.includes("支付处理成功"))).toBe(true)
})
```

**测试错误恢复流程**：

```typescript
const testErrorRecovery = Effect.gen(function* () {
  const logger = yield* Logger
  const db = yield* Database
  const payment = yield* PaymentGateway

  // 模拟支付失败
  const failingPayment = Layer.succeed(PaymentGateway, {
    charge: () => Effect.fail(new PaymentError("余额不足")),
    refund: () => Effect.succeed({ status: "refunded" }),
    getStatus: () => Effect.succeed({ status: "failed" }),
  })

  const result = yield* Effect.gen(function* () {
    const payment = yield* PaymentGateway
    return yield* payment.charge(100, "tok_test_123")
  }).pipe(
    Effect.provide(failingPayment),
    Effect.catchAll((e) =>
      Effect.gen(function* () {
        yield* logger.log(`支付失败: ${e.message}`)
        yield* db.query(
          "UPDATE orders SET status = 'failed' WHERE id = 1",
        )
        return { success: false, error: e.message }
      }),
    ),
  )

  expect(result.success).toBe(false)
  expect(result.error).toBe("余额不足")

  const logs = yield* TestConsole.getOutput()
  expect(logs.some((l) => l.includes("支付失败"))).toBe(true)
})
```

### 11.7.3 基于属性的测试

基于属性的测试（Property-based Testing）是一种测试方法，它通过大量随机输入来验证函数的属性。结合 TestRandom，你可以实现基于属性的测试：

```typescript
const runPropertyTests = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  for (let i = 0; i < 100; i++) {
    const amount = yield* Random.nextIntBetween(-100000, 100000)
    // 验证属性
    if (!property_containsDigits(amount)) {
      console.log(`失败: amount=${amount}`)
    }
  }
})
```

更完整的基于属性的测试示例：

```typescript
// 测试数组反转的属性
const testReverseProperties = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  for (let i = 0; i < 100; i++) {
    // 生成随机数组
    const length = yield* Random.nextIntBetween(0, 50)
    const arr: number[] = []
    for (let j = 0; j < length; j++) {
      arr.push(yield* Random.nextInt)
    }

    const reversed = [...arr].reverse()

    // 属性 1：反转两次等于原数组
    expect([...reversed].reverse()).toEqual(arr)

    // 属性 2：反转后的数组长度不变
    expect(reversed.length).toBe(arr.length)

    // 属性 3：反转后的第一个元素等于原数组的最后一个元素
    if (arr.length > 0) {
      expect(reversed[0]).toBe(arr[arr.length - 1])
      expect(reversed[reversed.length - 1]).toBe(arr[0])
    }
  }
})

// 测试字符串处理的属性
const testStringProperties = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  for (let i = 0; i < 100; i++) {
    // 生成随机字符串
    const length = yield* Random.nextIntBetween(0, 20)
    let str = ""
    for (let j = 0; j < length; j++) {
      const charCode = yield* Random.nextIntBetween(97, 122) // a-z
      str += String.fromCharCode(charCode)
    }

    const trimmed = str.trim()
    const upper = str.toUpperCase()
    const lower = str.toLowerCase()

    // 属性 1：trim 不会增加字符串长度
    expect(trimmed.length).toBeLessThanOrEqual(str.length)

    // 属性 2：toUpperCase 后 toLowerCase 等于原字符串的小写
    expect(upper.toLowerCase()).toBe(lower)

    // 属性 3：空字符串的 trim 仍然是空字符串
    if (str.length === 0) {
      expect(trimmed).toBe("")
    }
  }
})
```

**测试服务降级策略**：在微服务架构中，当某个服务不可用时，系统需要优雅地降级而不是完全崩溃。使用 Effect 的测试工具，你可以测试各种降级策略的正确性。

```typescript
const testServiceDegradation = Effect.gen(function* () {
  const logger = yield* Logger
  const cache = yield* CacheService
  const db = yield* Database

  // 模拟推荐服务不可用
  const failingRecommendation = Layer.succeed(RecommendationService, {
    getRecommendations: (userId: number) =>
      Effect.fail(new Error("推荐服务超时")),
  })

  // 降级策略：当推荐服务不可用时，使用缓存中的历史推荐
  const degradedRecommendation = Effect.gen(function* () {
    const recommendation = yield* RecommendationService
    return yield* recommendation.getRecommendations(1).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* logger.warn(`推荐服务不可用，使用缓存: ${error.message}`)
          const cached = yield* cache.get(`recommendations:1`)
          if (cached) {
            return cached as string[]
          }
          // 缓存也没有，返回默认推荐
          yield* logger.warn("缓存也没有推荐数据，返回默认推荐")
          return ["默认商品 A", "默认商品 B", "默认商品 C"]
        }),
      ),
    )
  })

  const result = yield* degradedRecommendation.pipe(
    Effect.provide(failingRecommendation),
  )

  expect(result.length).toBe(3)
  expect(result).toContain("默认商品 A")

  const logs = yield* TestConsole.getOutput()
  expect(logs.some((l) => l.includes("推荐服务不可用"))).toBe(true)
})
```

**测试重试与回退策略**：在微服务架构中，服务调用失败时的重试和回退策略是保证系统可用性的关键。使用 Effect 的测试工具，你可以全面测试重试和回退策略的各种场景。

```typescript
const testRetryWithFallback = Effect.gen(function* () {
  const logger = yield* Logger
  let attemptCount = 0

  // 模拟一个在前 3 次调用失败、第 4 次成功的外部服务
  const unreliableService = Effect.gen(function* () {
    attemptCount++
    if (attemptCount < 4) {
      return yield* Effect.fail(new Error(`第 ${attemptCount} 次调用失败`))
    }
    return "最终成功"
  })

  // 主服务调用（带重试）
  const mainService = unreliableService.pipe(
    Effect.retry({
      times: 3,
      delay: (attempt) => Duration.seconds(Math.pow(2, attempt)),
    }),
  )

  // 回退服务
  const fallbackService = Effect.succeed("回退服务返回")

  // 主服务失败后使用回退
  const fiber = yield* mainService.pipe(
    Effect.catchAll(() => fallbackService),
    Effect.fork,
  )

  // 第一次重试在 2 秒后
  yield* TestClock.adjust(Duration.seconds(2))
  expect(attemptCount).toBe(2)

  // 第二次重试在 4 秒后
  yield* TestClock.adjust(Duration.seconds(4))
  expect(attemptCount).toBe(3)

  // 第三次重试在 8 秒后
  yield* TestClock.adjust(Duration.seconds(8))
  expect(attemptCount).toBe(4)

  const result = yield* Fiber.join(fiber)
  expect(result).toBe("最终成功")

  const logs = yield* TestConsole.getOutput()
  expect(logs.some((l) => l.includes("重试"))).toBe(false) // 没有使用回退
})
```

**测试缓存与数据库一致性**：在分布式系统中，缓存与数据库之间的一致性是一个关键问题。使用 Effect 的测试工具，你可以模拟缓存和数据库之间的各种交互场景。

```typescript
const testCacheConsistency = Effect.gen(function* () {
  const logger = yield* Logger
  const cache = yield* CacheService
  const db = yield* Database

  yield* logger.log("开始测试缓存一致性")

  // 场景 1：先更新数据库，再更新缓存
  yield* db.query("UPDATE users SET name = '新名称' WHERE id = 1")
  yield* cache.set("user:1", { id: 1, name: "新名称" })

  let cachedUser = yield* cache.get("user:1")
  expect(cachedUser?.name).toBe("新名称")

  // 场景 2：缓存过期后从数据库重新加载
  yield* TestClock.adjust(Duration.hours(2)) // 缓存过期
  cachedUser = yield* cache.get("user:1")
  expect(cachedUser).toBeNull()

  // 从数据库重新加载
  const dbUser = yield* db.query("SELECT * FROM users WHERE id = 1")
  yield* cache.set("user:1", dbUser[0])

  cachedUser = yield* cache.get("user:1")
  expect(cachedUser).toBeDefined()

  // 验证日志
  const logs = yield* TestConsole.getOutput()
  expect(logs.some((l) => l.includes("缓存一致性"))).toBe(true)
})
```

**测试分布式系统的属性**：

```typescript
const testDistributedSystemProperties = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  for (let i = 0; i < 50; i++) {
    // 模拟分布式系统中的节点数量
    const nodeCount = yield* Random.nextIntBetween(3, 10)

    // 模拟网络延迟
    const latencies: number[] = []
    for (let j = 0; j < nodeCount; j++) {
      latencies.push(yield* Random.nextIntBetween(1, 1000))
    }

    // 属性 1：至少有一个节点是最快的
    const minLatency = Math.min(...latencies)
    expect(latencies.some((l) => l === minLatency)).toBe(true)

    // 属性 2：所有延迟都是正数
    latencies.forEach((l) => {
      expect(l).toBeGreaterThan(0)
    })

    // 属性 3：延迟排序后，最小值等于 minLatency
    const sorted = [...latencies].sort((a, b) => a - b)
    expect(sorted[0]).toBe(minLatency)
  }
})
```

## 11.8 测试套件组织

### 11.8.1 测试结构

在 Effect 项目中，建议按以下方式组织测试：

```
src/
  __tests__/
    services/
      user.service.test.ts
      payment.service.test.ts
    effects/
      process-order.test.ts
    utils/
      format-currency.test.ts
```

除了基本的目录结构，还建议遵循以下命名和组织约定：

1. **测试文件命名**：使用 `.test.ts` 或 `.spec.ts` 后缀，与源文件保持相同的目录结构。
2. **测试套件命名**：使用 `describe` 块按功能模块组织测试，每个 `describe` 块对应一个服务或模块。
3. **测试用例命名**：使用 `it` 块描述具体的行为，命名应该清晰表达测试的意图。

更完整的测试结构示例：

```
src/
  services/
    user.service.ts
    payment.service.ts
    notification.service.ts
  effects/
    process-order.ts
    send-notification.ts
  utils/
    format-currency.ts
    validate-email.ts
  __tests__/
    services/
      user.service.test.ts
      payment.service.test.ts
      notification.service.test.ts
    effects/
      process-order.test.ts
      send-notification.test.ts
    utils/
      format-currency.test.ts
      validate-email.test.ts
    integration/
      order-workflow.test.ts
      payment-flow.test.ts
    performance/
      cache-benchmark.test.ts
```

### 11.8.2 测试辅助函数

创建可复用的测试辅助函数，减少重复代码：

```typescript
const createTestUser = (name: string, email: string) =>
  Effect.gen(function* () {
    const svc = yield* UserService
    return yield* svc.createUser(name, email)
  })
```

更完整的测试辅助函数库：

```typescript
// 测试环境构建器
class TestEnvironmentBuilder {
  private layers: Layer.Layer<unknown, never, unknown>[] = []
  private seed: bigint | undefined
  private config: Record<string, unknown> = {}

  withLogger(mock?: Partial<Logger>): this {
    this.layers.push(
      Layer.succeed(Logger, {
        log: mock?.log ?? ((msg) => Effect.sync(() => console.log(`[TEST] ${msg}`))),
        warn: mock?.warn ?? ((msg) => Effect.sync(() => console.warn(`[TEST] ${msg}`))),
        error: mock?.error ?? ((msg) => Effect.sync(() => console.error(`[TEST] ${msg}`))),
      }),
    )
    return this
  }

  withDatabase(mock?: Partial<Database>): this {
    this.layers.push(
      Layer.succeed(Database, {
        query: mock?.query ?? ((sql) => Effect.succeed([])),
        execute: mock?.execute ?? ((sql) => Effect.succeed({ rowCount: 0 })),
      }),
    )
    return this
  }

  withCache(mock?: Partial<CacheService>): this {
    this.layers.push(
      Layer.succeed(CacheService, {
        get: mock?.get ?? ((key) => Effect.succeed(null)),
        set: mock?.set ?? ((key, value) => Effect.void),
        delete: mock?.delete ?? ((key) => Effect.void),
      }),
    )
    return this
  }

  withRandomSeed(seed: bigint): this {
    this.seed = seed
    return this
  }

  withConfig(config: Record<string, unknown>): this {
    this.config = config
    return this
  }

  build(): Layer.Layer<never, never, unknown> {
    const allLayers = [
      ...this.layers,
      TestContext.TestContext,
    ]

    if (this.seed !== undefined) {
      allLayers.push(
        Layer.effect(
          TestRandom,
          Effect.gen(function* () {
            yield* TestRandom.setSeed(this.seed!)
            return TestRandom.TestRandom
          }),
        ),
      )
    }

    return Layer.mergeAll(...allLayers)
  }
}

// 使用示例
const testEnv = new TestEnvironmentBuilder()
  .withLogger()
  .withDatabase({
    query: (sql) => Effect.succeed([{ id: 1, name: "Test" }]),
  })
  .withCache()
  .withRandomSeed(42n)
  .build()
```

### 11.8.3 测试套件模式

推荐使用以下模式组织测试套件：

```typescript
const testSuite = Effect.gen(function* () {
  // 设置
  const env = yield* buildTestEnvironment()

  // 测试用例 1
  yield* testCase1(env)
  console.log("测试 1 通过")

  // 测试用例 2
  yield* testCase2(env)
  console.log("测试 2 通过")

  // 清理
  yield* cleanup(env)
})
```

更完整的测试套件模式：

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"

// 全局测试 Layer
let testLayer: Layer.Layer<never, never, unknown>

beforeAll(() => {
  testLayer = new TestEnvironmentBuilder()
    .withLogger()
    .withDatabase()
    .withCache()
    .withRandomSeed(42n)
    .build()
})

// 辅助函数：运行测试
const run = <E, A>(effect: Effect.Effect<never, E, A>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(testLayer)))

describe("UserService", () => {
  it("should create a user", async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* UserService
        return yield* svc.createUser("Alice", "alice@example.com")
      }),
    )
    expect(result).toBeDefined()
    expect(result.name).toBe("Alice")
  })

  it("should find user by id", async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* UserService
        return yield* svc.findById(1)
      }),
    )
    expect(result).toBeDefined()
  })

  it("should handle user not found", async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* UserService
        return yield* svc.findById(99999).pipe(
          Effect.catchAll((e) => Effect.succeed(null)),
        )
      }),
    )
    expect(result).toBeNull()
  })
})

describe("PaymentService", () => {
  it("should process payment successfully", async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* PaymentService
        return yield* svc.charge(100, "tok_valid")
      }),
    )
    expect(result.status).toBe("success")
  })

  it("should handle payment failure", async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* PaymentService
        return yield* svc.charge(100, "tok_fail").pipe(
          Effect.catchAll((e) => Effect.succeed({ status: "failed", error: e.message })),
        )
      }),
    )
    expect(result.status).toBe("failed")
  })
})
```

### 11.8.4 测试运行器配置

Effect 测试可以与多种测试运行器集成，包括 Vitest、Jest、Mocha 等。推荐使用 Vitest，因为它对 TypeScript 和 ESM 有更好的支持，且性能优于 Jest。

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 10000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
    },
  },
})
```

**Jest 配置**：如果你使用 Jest，需要安装 `@swc/jest` 或 `ts-jest` 来支持 TypeScript。Jest 的配置相对复杂，但同样可以很好地与 Effect 测试配合使用。

```typescript
// jest.config.ts
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  testTimeout: 30000,
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json",
    },
  },
}
```

**测试脚本配置**：在 `package.json` 中配置测试脚本，支持不同的测试模式。

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --reporter=verbose",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

**并行测试执行**：Effect 测试天然支持并行执行，因为每个测试用例都在独立的 Fiber 中运行，拥有独立的 Context。在 CI 环境中，你可以利用并行执行来显著缩短测试时间。

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]  # 分片并行
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx vitest run --shard=${{ matrix.shard }}/4
```

**测试环境隔离**：在 CI 环境中，测试环境隔离是一个重要的考虑因素。每个测试运行应该使用独立的数据库、缓存和其他外部资源，避免测试之间的相互干扰。Effect 的 Layer 系统天然支持环境隔离——每个测试用例可以使用独立的 Layer 实例。

```yaml
# docker-compose.test.yml
version: "3.8"
services:
  test-db:
    image: postgres:15
    environment:
      POSTGRES_DB: test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5432:5432"
    tmpfs: /var/lib/postgresql/data  # 使用内存文件系统

  test-cache:
    image: redis:7
    ports:
      - "6379:6379"
```

**测试报告和覆盖率**：在 CI 环境中，生成测试报告和覆盖率报告是重要的质量保障措施。Vitest 支持多种报告格式，可以集成到各种 CI 平台中。

```yaml
- run: npx vitest run --coverage
- uses: davelosert/vitest-coverage-report-action@v2
```

### 11.8.6 CI 集成

Effect 测试可以轻松集成到 CI 流水线中：

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
```

在 CI 环境中，建议使用以下配置：

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000, // Effect 测试可能涉及时间操作
    hookTimeout: 10000,
    pool: "forks", // 使用 fork 模式避免内存泄漏
    poolOptions: {
      forks: {
        singleFork: true, // 单进程模式，避免 Layer 共享问题
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
    },
  },
})
```

## 11.9 最佳实践

### 11.9.1 测试金字塔

在 Effect 项目中，建议遵循测试金字塔原则：

1. **单元测试**（最多）：测试单个 Effect 或函数，使用 Mock 隔离依赖。
2. **集成测试**（中等）：测试多个服务的交互，使用部分 Mock。
3. **端到端测试**（最少）：测试完整的工作流，使用真实服务。

在 Effect 中，测试金字塔的实现更加自然。由于依赖通过 `R` 参数显式声明，你可以在不同层次的测试中提供不同粒度的依赖：

```typescript
// 单元测试：完全 Mock
const unitTest = myEffect.pipe(
  Effect.provide(FullMockLayer),
)

// 集成测试：部分 Mock
const integrationTest = myEffect.pipe(
  Effect.provide(PartialMockLayer),
)

// 端到端测试：真实实现
const e2eTest = myEffect.pipe(
  Effect.provide(ProductionLayer),
)
```

### 11.9.2 Mock 设计原则

1. **最小 Mock**：只 Mock 必要的依赖，不要过度 Mock。
2. **行为验证**：验证 Mock 是否被正确调用，而不仅仅是返回值。
3. **错误场景**：测试 Mock 返回错误时的处理逻辑。
4. **边界条件**：测试空值、超时、并发等边界条件。

除了这些基本原则，还有一些更具体的 Mock 设计建议：

**Mock 应该简单**：Mock 实现应该尽可能简单，避免在 Mock 中引入复杂的逻辑。如果 Mock 本身需要测试，说明它太复杂了。

**Mock 应该可配置**：Mock 应该允许测试用例配置其行为，而不是硬编码特定的返回值。参数化 Mock 工厂是实现这一目标的好方法。

**Mock 应该可观察**：Mock 应该记录其被调用的信息，以便测试用例可以验证调用行为。可验证的 Mock 包装器是实现这一目标的好方法。

**Mock 应该隔离**：每个测试用例应该使用独立的 Mock 实例，避免测试用例之间的状态污染。`Layer.fresh` 和工厂函数可以帮助实现隔离。

### 11.9.3 测试可重复性

1. **使用固定种子**：在测试中使用固定的 TestRandom 种子。
2. **避免外部依赖**：使用 Mock 替代外部服务。
3. **控制时间**：使用 TestClock 控制时间流逝。
4. **清理状态**：每个测试用例之间清理 Mock 状态。

确保测试可重复性的具体做法：

```typescript
beforeEach(async () => {
  // 重置 TestRandom 种子
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* TestRandom.setSeed(42n)
    }).pipe(Effect.provide(TestContext.TestContext)),
  )

  // 清空 TestConsole 缓冲区
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* TestConsole.clear()
    }).pipe(Effect.provide(TestContext.TestContext)),
  )

  // 重置 TestClock
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(new Date(0))
    }).pipe(Effect.provide(TestContext.TestContext)),
  )
})
```

### 11.9.4 测试速度

1. **使用 TestClock**：避免真实等待，使用 TestClock 推进时间。
2. **内存 Mock**：使用内存数据结构替代数据库。
3. **并行测试**：Effect 的测试可以并行运行，提高测试速度。

优化测试速度的具体策略：

```typescript
// 慢：真实等待
const slowTest = Effect.gen(function* () {
  yield* Effect.sleep(Duration.seconds(60))
  return yield* fetchData()
})

// 快：使用 TestClock
const fastTest = Effect.gen(function* () {
  const fiber = yield* fetchData().pipe(
    Effect.timeout(Duration.seconds(60)),
    Effect.fork,
  )
  yield* TestClock.adjust(Duration.seconds(60))
  return yield* Fiber.join(fiber)
})
```

### 11.9.5 测试数据管理

测试数据的管理是测试编写中的一个重要方面。在 Effect 中，你可以利用 TestRandom 和 Mock Layer 来管理测试数据，确保测试数据的可控性和可重复性。

**测试数据工厂**：创建可复用的测试数据工厂函数，减少测试中的样板代码。

```typescript
const createTestUser = (overrides?: Partial<UserInput>): UserInput => ({
  name: "测试用户",
  email: "test@example.com",
  age: 25,
  role: "user",
  ...overrides,
})

const createTestOrder = (overrides?: Partial<OrderInput>): OrderInput => ({
  userId: 1,
  items: [{ productId: "p1", quantity: 1 }],
  total: 100,
  currency: "CNY",
  ...overrides,
})
```

**测试数据清理**：每个测试用例运行后，确保清理测试数据，避免测试用例之间的数据污染。

```typescript
afterEach(async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* Database
      yield* db.query("DELETE FROM test_users")
      yield* db.query("DELETE FROM test_orders")
    }).pipe(Effect.provide(testLayer)),
  )
})
```

### 11.9.6 测试命名与组织

良好的测试命名和组织可以提高测试的可维护性：

```typescript
describe("UserService", () => {
  describe("createUser", () => {
    it("should create a user with valid input", async () => { /* ... */ })
    it("should reject duplicate email", async () => { /* ... */ })
    it("should validate email format", async () => { /* ... */ })
    it("should hash password before storing", async () => { /* ... */ })
  })

  describe("findById", () => {
    it("should return user when found", async () => { /* ... */ })
    it("should return null when not found", async () => { /* ... */ })
    it("should handle invalid id format", async () => { /* ... */ })
  })
})
```

### 11.9.7 测试文档和注释

良好的测试文档可以帮助团队成员理解测试的意图和设计。在 Effect 测试中，建议为每个测试套件添加清晰的文档注释。

```typescript
/**
 * UserService 测试套件
 *
 * 测试范围：
 * - 用户创建、查询、更新、删除
 * - 用户认证和授权
 * - 用户数据的验证和错误处理
 *
 * Mock 策略：
 * - Database：使用内存数据库 Mock
 * - Logger：使用 TestConsole 捕获日志
 * - Cache：使用内存缓存 Mock
 *
 * 测试数据：
 * - 使用 TestRandom 生成测试数据
 * - 使用固定种子确保可重复性
 */
describe("UserService", () => {
  // 测试用例...
})
```

### 11.9.8 测试与文档的关联

测试不仅是质量保障手段，也是活文档（Living Documentation）。良好的测试可以清晰地描述系统的行为和约束。在 Effect 项目中，测试代码本身就是一种文档形式。

```typescript
/**
 * @description 用户注册流程测试
 * @feature 用户注册
 * @story 作为新用户，我希望能够注册账号，以便使用系统功能
 *
 * 验收条件：
 * 1. 用户提供有效的邮箱和密码可以注册成功
 * 2. 重复的邮箱会被拒绝
 * 3. 密码强度不足会被拒绝
 * 4. 注册成功后发送欢迎邮件
 */
describe("用户注册", () => {
  it("应该使用有效邮箱和密码注册成功", async () => {
    // 测试代码...
  })

  it("应该拒绝重复的邮箱注册", async () => {
    // 测试代码...
  })

  it("应该拒绝强度不足的密码", async () => {
    // 测试代码...
  })

  it("注册成功后应该发送欢迎邮件", async () => {
    // 测试代码...
  })
})
```

### 11.9.9 测试重构

随着项目的发展，测试代码也需要重构。以下是一些测试重构的指导原则：

1. **消除重复**：将重复的测试设置提取为辅助函数或测试夹具。
2. **简化断言**：使用清晰的断言，避免复杂的条件判断。
3. **分离关注点**：每个测试用例只测试一个行为。
4. **保持测试独立**：测试用例之间不应该有依赖关系。
5. **更新文档**：当测试逻辑变化时，同步更新测试文档。

### 11.9.10 测试与性能

测试不仅影响代码质量，也影响开发效率。在 Effect 项目中，测试性能是一个重要的考虑因素。以下是一些提高测试性能的建议：

1. **使用 TestClock 替代真实等待**：任何涉及时间等待的测试都应该使用 TestClock，而不是真实的 `setTimeout` 或 `sleep`。这可以将测试时间从几秒或几分钟缩短到几毫秒。
2. **使用内存 Mock 替代外部服务**：在单元测试和集成测试中，使用内存 Mock 替代数据库、缓存、消息队列等外部服务。这不仅可以提高测试速度，还可以消除对外部环境的依赖。
3. **并行执行测试**：Effect 测试天然支持并行执行。在 CI 环境中，利用并行执行可以显著缩短测试时间。Vitest 默认使用 Worker 线程并行执行测试文件。
4. **按需初始化 Layer**：使用延迟初始化的 Layer，只在需要时才创建服务实例。避免在测试套件初始化时创建所有服务的实例。
5. **共享全局 Layer**：对于无状态的 Mock 服务（如 Logger Mock），使用全局共享的 Layer 实例，避免在每个测试用例中重复创建。

```typescript
// 性能优化示例：共享全局 Layer
const globalTestLayer = Layer.mergeAll(
  LoggerMock,
  ConfigMock,
).pipe(
  Layer.provideMerge(TestContext.TestContext),
)

// 每个测试用例使用独立的 Database Mock
const createTestCaseLayer = () =>
  Layer.mergeAll(
    globalTestLayer,
    createFreshDatabaseMock(),
  )
```

### 11.9.11 测试覆盖率

虽然覆盖率不是测试质量的唯一指标，但它可以帮助发现未测试的代码路径：

```typescript
// 确保测试覆盖所有错误路径
describe("PaymentService.charge", () => {
  it("should succeed with valid payment", async () => { /* ... */ })
  it("should fail with insufficient balance", async () => { /* ... */ })
  it("should fail with invalid card", async () => { /* ... */ })
  it("should fail with expired card", async () => { /* ... */ })
  it("should fail with network error", async () => { /* ... */ })
  it("should handle timeout gracefully", async () => { /* ... */ })
  it("should retry on transient failure", async () => { /* ... */ })
  it("should not retry on permanent failure", async () => { /* ... */ })
})
```

## 11.10 总结

Effect 的测试能力是其最强大的特性之一。通过将副作用抽象为 Requirement，Effect 实现了依赖的显式声明和可替换性。Layer 系统提供了灵活的依赖注入机制，使得在测试中提供 Mock 实现变得简单而优雅。

TestClock 解决了时间相关逻辑的测试难题。你可以在测试中自由控制时间的流逝，测试超时、定时任务、重试逻辑等时间相关的场景，而无需真实等待。这使得测试变得快速、可靠、可重复。

TestRandom 解决了随机数测试的难题。通过设置种子，你可以使随机数序列完全确定，从而确保测试的可重复性。这在测试验证码生成、抽奖系统、洗牌算法等场景中特别有用。

TestConsole 解决了控制台输出的测试难题。通过拦截控制台输出，你可以在测试中捕获和验证日志内容，确保代码在正确的时机输出了正确的信息。

这些测试工具可以组合使用，提供完整的测试能力。通过 Layer 系统的组合能力，你可以构建复杂的测试环境，模拟真实的生产场景。基于属性的测试结合 TestRandom，可以验证函数在大量随机输入下的行为，发现边界条件和隐藏的 bug。

在 Effect 项目中，测试不再是负担，而是开发过程的一部分。通过遵循最佳实践，你可以编写出快速、可靠、可维护的测试，确保代码质量的同时提高开发效率。

回顾本章的核心要点：

1. **Effect<R, E, A> 的 R 参数**是类型级别的依赖清单，编译器可以验证所有依赖是否都已提供，这是传统 DI 框架无法比拟的类型安全保障。
2. **Layer 系统**提供了纯函数式的依赖组合方式，支持合并、覆盖、作用域管理、生命周期管理等高级特性。
3. **TestClock** 通过虚拟时钟机制，使得时间相关测试变得快速、精确、可重复，支持超时、重试、调度、缓存过期等场景。
4. **TestRandom** 通过确定性随机数生成器，使得随机数测试完全可重复，支持洗牌、采样、A/B 测试、蒙特卡洛模拟等场景。
5. **TestConsole** 通过拦截控制台输出，使得日志验证变得简单可靠，支持结构化日志、日志级别、并发输出等场景。
6. **组合测试工具**可以协同工作，提供完整的测试能力，从单元测试到集成测试再到端到端测试，Effect 都提供了优雅的解决方案。

Effect 的测试哲学可以概括为三个核心原则。第一，**可测试性是架构设计的结果，而不是事后补救的措施**。通过将副作用抽象为 Requirement，Effect 使得可测试性成为类型系统的一部分，而不是依赖于外部工具或约定。第二，**测试应该是快速的、可靠的、可重复的**。TestClock、TestRandom、TestConsole 等工具确保了测试不受外部环境的影响，每次运行都产生相同的结果。第三，**测试工具应该与业务代码无缝集成**。Effect 的测试工具通过 Context 系统与运行时深度集成，业务代码不需要做任何修改就可以在测试环境中运行。

在实际项目中应用 Effect 的测试能力时，建议从以下几个方面入手。首先，识别代码中的副作用，将其抽象为服务接口。这包括数据库操作、HTTP 请求、文件系统操作、时间操作、随机数操作、控制台输出等。其次，为每个服务接口创建 Mock 实现，使用 Layer 系统组织这些 Mock。第三，在测试中使用 TestContext 提供的测试工具，控制时间、随机数和控制台输出。最后，遵循测试金字塔原则，合理分配单元测试、集成测试和端到端测试的比例。

Effect 的测试能力不仅提高了测试的质量和效率，还改变了开发者的测试思维方式。在传统开发模式中，测试往往被视为一种负担——你需要编写额外的代码来模拟依赖、控制时间、处理随机数。而在 Effect 中，测试是开发过程的自然延伸——你编写的业务代码本身就是可测试的，测试工具与业务代码使用相同的抽象机制。这种一致性降低了测试的心理负担，使得开发者更愿意编写测试，从而形成良性循环。

在下一章中，我们将探讨 Effect 与现有框架的融合，包括如何将 Effect 集成到 NestJS、Fastify 和 Hono 等流行的 Node.js 框架中。
