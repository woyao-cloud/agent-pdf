# 第九章：Schedule（调度器）：重试、延迟与定时任务

## 概述

在分布式系统和网络编程中，失败是常态而非例外。网络抖动、服务暂时不可用、资源竞争——这些临时性故障在任何一个生产系统中都会频繁发生。如何优雅地处理这些故障，是区分一个健壮系统和脆弱系统的关键。

传统的重试机制通常是将重试逻辑硬编码在业务代码中，导致代码重复、难以维护、无法复用。例如，在 JavaScript 中，我们经常看到这样的代码：使用 try-catch 包裹请求逻辑，在 catch 块中设置 setTimeout 进行重试，同时还需要手动管理重试次数和延迟时间。这种代码不仅难以阅读和维护，而且每个开发人员实现的重试逻辑都不尽相同，导致代码风格不统一，质量参差不齐。

Effect-TS 的 Schedule 模块提供了一种革命性的方法：**将重试策略、延迟计算和定时任务抽象为可组合的数据结构**。这意味着你不再需要手动编写重试循环，而是通过声明式的方式描述你想要的调度策略，然后将其应用到 Effect 上。这种抽象不仅简化了代码，还使得重试策略可以被复用、测试和组合。

Schedule 的核心思想是：一个调度策略就是一个值——你可以创建它、组合它、转换它，就像处理任何其他数据一样。这种设计带来了前所未有的灵活性和复用性。

本章将深入探讨 Schedule 的设计原理、核心操作、组合模式，并通过一个生产级的微服务健康检查系统来展示 Schedule 在实际工程中的强大能力。无论你是刚开始接触 Effect-TS 的新手，还是已经有一定经验的开发者，本章都将帮助你全面掌握 Schedule 的使用方法和设计思想。通过大量的代码示例和实际案例，你将学会如何在自己的项目中灵活运用 Schedule 来解决各种复杂的调度问题。

## 1. Schedule 的设计哲学

### 1.1 调度策略即数据

在 Effect-TS 中，Schedule 是一个**值**，而不是一个**函数**。这意味着你可以：

- 将 Schedule 存储在变量中。
- 将 Schedule 作为参数传递给函数。
- 从函数中返回 Schedule。
- 组合多个 Schedule 来创建新的 Schedule。

```typescript
// Schedule 是一个值
const retryPolicy: Schedule.Schedule<number, void, never> = Schedule.exponential("1 seconds", 2.0)

// 可以传递给函数
function withRetry<A, E>(effect: Effect.Effect<A, E>, policy: Schedule.Schedule<...>): Effect.Effect<A, E> {
  return effect.pipe(Effect.retry(policy))
}

// 可以从函数返回
function getPolicy(isProduction: boolean): Schedule.Schedule<...> {
  return isProduction
    ? Schedule.exponential("1 seconds", 2.0).pipe(Schedule.compose(Schedule.recurs(10)))
    : Schedule.recurs(3)
}
```

这种"策略即数据"的设计理念源自函数式编程的核心思想：将行为参数化。在传统的命令式编程中，重试逻辑通常通过循环和条件判断来实现，代码散落在各个业务逻辑中。而在 Effect-TS 中，重试策略是一个独立的值，可以被自由地传递、组合和复用。

与传统的重试库（如 JavaScript 中的 `async-retry`、`p-retry`，或 Java 中的 `Spring Retry`）相比，Schedule 的"值"抽象具有以下显著优势：

1. **类型安全**：Schedule 的类型参数（Out、In、Env）在编译期就能保证调度策略的正确使用。
2. **可组合性**：多个简单的调度策略可以通过组合操作符构建出复杂的策略，而传统库通常只提供有限的配置选项。
3. **可测试性**：由于调度策略是纯数据，可以在测试环境中轻松替换或模拟。
4. **透明性**：调度决策过程可以被观察、记录和调试，而传统库的重试逻辑通常是一个黑盒。

### 1.2 Schedule 的类型参数

Schedule 有三个类型参数：

```typescript
Schedule<Out, In, Env>
```

- **Out**：调度产生的输出值类型。每次调度决策都会产生一个输出值，这些值可以被收集、转换或用于其他目的。例如，`Schedule.recurs(3)` 的输出类型是 `number`，表示当前是第几次重试。输出值可以用于日志记录、监控指标收集、或者作为后续调度的输入。
- **In**：调度接收的输入值类型。调度可以根据输入值来决定行为（例如，根据错误类型决定是否重试）。对于 `Effect.retry`，输入是错误类型；对于 `Effect.repeat`，输入是成功值类型。这个类型参数使得调度可以感知上下文，从而做出更智能的决策。
- **Env**：调度所需的环境类型。如果调度需要访问环境（例如，随机数生成器），这个参数会指定所需的环境。`never` 表示调度不需要任何环境。当调度需要环境时，使用该调度的 Effect 也需要提供相应的环境。

例如，`Schedule.recurs(3)` 的类型是 `Schedule<number, void, never>`——它输出重试次数，不接受输入，不需要环境。

类型参数的具体含义可以通过以下例子进一步理解：

```typescript
// 输出重试次数，接受 void 输入，不需要环境
const recurs3: Schedule.Schedule<number, void, never> = Schedule.recurs(3)

// 输出 Duration，接受 void 输入，需要 Random 环境（因为使用了抖动）
const jittered: Schedule.Schedule<Duration.Duration, void, Random.Random> =
  Schedule.exponential("1 seconds", 2.0).pipe(Schedule.jittered)

// 输出 string，接受 Error 输入，不需要环境
const mapped: Schedule.Schedule<string, Error, never> =
  Schedule.recurs(3).pipe(
    Schedule.map((n) => `retry ${n}`)
  )
```

理解这三个类型参数之间的关系对于正确使用 Schedule 至关重要。Out 类型决定了你可以从调度中获取什么信息，In 类型决定了调度可以感知什么上下文，Env 类型决定了调度需要什么外部能力。这三个维度共同构成了 Schedule 的类型契约，使得编译器可以在编译期捕获类型错误。

例如，如果你尝试将一个 `Schedule<number, string, never>` 用于 `Effect.retry`（其输入是错误类型），编译器会报错，因为输入类型不匹配。这种类型安全性是传统重试库无法提供的。

### 1.3 Schedule 的核心概念

Schedule 的核心是一个**决策函数**，它接收当前状态和输入值，决定是否继续执行以及下一次执行的延迟：

```typescript
type Decision<Out> = {
  shouldContinue: boolean
  delay: Duration.Duration
  output: Out
}
```

每次调度决策都包含三个信息：

1. **是否继续**：如果为 `false`，调度结束。
2. **延迟时间**：下一次执行前需要等待的时间。
3. **输出值**：本次决策产生的输出值。

这种设计使得 Schedule 可以表达极其丰富的调度策略——从简单的固定间隔到复杂的自适应策略。

Schedule 的内部状态机可以这样理解：

```
初始状态 → [决策] → 是否继续？
  ├── 是 → 等待延迟 → 执行 Effect → 更新状态 → [决策] → ...
  └── 否 → 返回最终结果
```

每次决策都基于当前状态和输入值。状态可以是简单的计数器（如 `recurs` 的剩余次数），也可以是复杂的数据结构（如自适应策略中的历史延迟记录）。

决策函数的内部实现可以进一步分解为以下几个步骤：

第一步，调度器从内部状态存储中读取当前状态。这个状态可能是上一次决策后的结果，也可能是初始状态。第二步，调度器接收输入值，这个输入值来自被调度的 Effect 的执行结果（对于 retry 来说是错误，对于 repeat 来说是成功值）。第三步，调度器根据当前状态和输入值，计算新的决策结果，包括是否继续、延迟时间和输出值。第四步，如果决定继续，调度器会更新内部状态，并返回延迟时间供 Effect 运行时使用。

这种基于状态机的设计使得 Schedule 具有以下几个重要特性：

1. **无副作用**：决策过程是纯函数式的，不依赖外部可变状态。
2. **可组合性**：多个调度器的状态可以独立维护，组合时不会相互干扰。
3. **可序列化**：调度器的状态可以被序列化，用于持久化或分布式场景。
4. **可测试**：由于决策过程是确定性的（除了随机抖动），可以在测试中精确验证。

### 1.4 Schedule 与传统重试库的对比

为了更好地理解 Schedule 的设计优势，让我们将其与传统的重试库进行对比：

| 特性 | Effect-TS Schedule | async-retry | Spring Retry |
|------|-------------------|-------------|--------------|
| 类型安全 | 完整类型参数 | 无 | 注解驱动 |
| 可组合性 | 丰富的组合操作符 | 有限配置 | 有限配置 |
| 延迟策略 | 任意自定义 | 固定几种 | 固定几种 |
| 抖动支持 | 内置 | 需手动 | 需手动 |
| 条件重试 | 类型安全 | 回调函数 | 注解 |
| 可测试性 | TestClock 支持 | 困难 | 困难 |
| 输出收集 | 内置 | 无 | 无 |
| 流式集成 | Stream 模块 | 无 | 无 |

从对比表中可以看出，Effect-TS 的 Schedule 在多个维度上都具有显著优势。最核心的区别在于，传统重试库将重试策略视为配置参数，而 Schedule 将重试策略视为一等公民的值。这种设计理念的差异带来了质的不同。

在传统重试库中，重试策略通常通过配置对象来指定，例如设置最大重试次数、重试间隔、退避因子等。这些配置是扁平的，难以表达复杂的策略组合。例如，要实现"先快速重试三次，然后指数退避，最多重试十次"这样的策略，传统库通常需要编写自定义的重试逻辑。

而在 Schedule 中，这种策略可以通过组合操作符直接表达，代码简洁且类型安全。更重要的是，Schedule 的组合能力是开放的——你可以创建自定义的调度策略，然后与内置策略自由组合，就像搭积木一样。

此外，Schedule 的透明性也是一个重要优势。在传统重试库中，重试过程通常是一个黑盒，你无法观察到每次重试的决策过程。而 Schedule 提供了 tap、collectAll 等操作符，让你可以完全透明地观察和记录调度决策过程。

## 2. 基本调度策略

### 2.1 基于次数的调度

**Schedule.recurs：重复指定次数**

```typescript
// 重复 3 次
const recurs3 = Schedule.recurs(3)

// 重复 1 次（等价于 once）
const once = Schedule.once

// 无限重复
const forever = Schedule.forever
```

`Schedule.recurs(n)` 会执行 `n + 1` 次（初始执行 + n 次重复）。例如，`Schedule.recurs(3)` 允许一个 Effect 最多执行 4 次（初始 + 3 次重试）。

**Schedule.once 和 Schedule.forever：**

```typescript
// once：只执行一次
const once = Schedule.once

// forever：无限重复
const forever = Schedule.forever
```

**Schedule.count 和 Schedule.countByKey：**

```typescript
// 按执行次数计数
const countSchedule = Schedule.count

// 按 key 分组计数
const countByKey = Schedule.countByKey
```

`Schedule.count` 是一个简单的计数器调度，它记录执行的次数并输出当前计数。这个调度本身不会决定何时停止，通常需要与其他调度组合使用。`Schedule.countByKey` 则更进一步，它允许你根据 key 进行分组计数，适用于需要按不同维度统计执行次数的场景。

**Schedule.collectAll 和 Schedule.collectAllWhile：**

```typescript
// 收集所有输出值
const collectAll = Schedule.recurs(5).pipe(
  Schedule.collectAll
)

// 条件收集
const collectWhile = Schedule.recurs(10).pipe(
  Schedule.collectAllWhile((n) => n < 5)
)
```

`collectAll` 会将调度过程中产生的所有输出值收集到一个数组中。这在调试和监控场景中非常有用，你可以通过收集所有输出值来了解调度的完整执行历史。`collectAllWhile` 则增加了条件过滤，只在满足条件时收集输出值，这可以用于收集特定阶段的调度输出。

需要注意的是，`collectAll` 会随着执行次数的增加而消耗更多内存，因为它在内部维护一个不断增长的数组。对于长时间运行的调度，建议使用 `tap` 来处理每个输出值，而不是使用 `collectAll` 收集所有值。

### 2.2 基于时间的调度

**Schedule.fixed：固定间隔**

```typescript
// 每 1 秒执行一次
const everySecond = Schedule.fixed("1 seconds")

// 每 5 分钟执行一次
const every5Minutes = Schedule.fixed("5 minutes")
```

`Schedule.fixed` 使用固定的时间间隔，不受执行时间的影响。如果执行时间超过间隔，下一次执行会立即开始。

**Schedule.spaced：固定延迟**

```typescript
// 每次执行后等待 1 秒
const spaced = Schedule.spaced("1 seconds")
```

`Schedule.spaced` 在每次执行后等待固定的时间。与 `fixed` 不同，`spaced` 的间隔是从执行结束开始计算的。

**Schedule.fixed 与 Schedule.spaced 的详细对比：**

`fixed` 和 `spaced` 虽然看起来相似，但行为有本质区别：

- `fixed` 使用**绝对时间点**作为调度依据。例如，`Schedule.fixed("1 seconds")` 会在第 1 秒、第 2 秒、第 3 秒……执行，无论每次执行耗时多久。如果某次执行耗时 0.8 秒，下一次执行会在 0.2 秒后开始（因为距离下一个整秒还有 0.2 秒）。如果某次执行耗时超过 1 秒，下一次执行会立即开始。

- `spaced` 使用**相对时间间隔**作为调度依据。例如，`Schedule.spaced("1 seconds")` 会在每次执行结束后等待 1 秒再执行下一次。如果某次执行耗时 0.8 秒，下一次执行会在 0.8 + 1 = 1.8 秒后开始。

选择建议：
- 需要固定频率的周期性任务（如健康检查）→ 使用 `fixed`
- 需要在每次执行后有固定休息时间（如 API 限速）→ 使用 `spaced`

为了更直观地理解两者的区别，考虑以下场景：假设一个 Effect 每次执行耗时 0.5 秒，使用 `Schedule.fixed("1 seconds")` 时，执行时间点为 0 秒、1 秒、2 秒、3 秒……即每秒执行一次，执行间隔固定为 1 秒。而使用 `Schedule.spaced("1 seconds")` 时，执行时间点为 0 秒、1.5 秒、3 秒、4.5 秒……即每次执行结束后等待 1 秒再执行下一次，实际间隔为 1.5 秒（执行时间 0.5 秒 + 等待时间 1 秒）。

再考虑一个极端场景：假设一个 Effect 每次执行耗时 1.5 秒，使用 `Schedule.fixed("1 seconds")` 时，由于执行时间超过了间隔时间，下一次执行会立即开始，实际执行间隔为 1.5 秒。而使用 `Schedule.spaced("1 seconds")` 时，执行间隔为 2.5 秒（执行时间 1.5 秒 + 等待时间 1 秒）。这个例子清楚地展示了 fixed 和 spaced 在应对长耗时执行时的不同行为。

**Schedule.duration：指定总持续时间**

```typescript
// 在 10 秒内尽可能多地执行
const duration = Schedule.duration("10 seconds")
```

**Schedule.fromDelay 和 Schedule.fromFunction：**

```typescript
// 从固定延迟创建调度
const fromDelay = Schedule.fromDelay("2 seconds")

// 从函数创建调度
const fromFunction = Schedule.fromFunction(() => "500 millis")
```

**Schedule.identity、Schedule.never、Schedule.stop：**

```typescript
// identity：输出等于输入
const identity = Schedule.identity<number>()

// never：永不执行
const never = Schedule.never

// stop：立即停止
const stop = Schedule.stop
```

### 2.3 指数退避

**Schedule.exponential：指数退避**

```typescript
// 从 1 秒开始，每次翻倍
const exponential = Schedule.exponential("1 seconds", 2.0)
// 第 1 次重试: 1s, 第 2 次: 2s, 第 3 次: 4s, 第 4 次: 8s, ...
```

指数退避是分布式系统中最常用的重试策略之一。它的核心思想是：每次重试的延迟时间呈指数增长，给系统更多的时间来恢复。

**不同基数的指数退避：**

```typescript
// 基数 2.0：标准指数退避
const base2 = Schedule.exponential("1 seconds", 2.0)
// 1s, 2s, 4s, 8s, 16s, ...

// 基数 1.5：较平缓的指数退避
const base15 = Schedule.exponential("1 seconds", 1.5)
// 1s, 1.5s, 2.25s, 3.375s, 5.0625s, ...

// 基数 3.0：较激进的指数退避
const base3 = Schedule.exponential("1 seconds", 3.0)
// 1s, 3s, 9s, 27s, 81s, ...
```

选择指数退避的基数时，需要根据具体的业务场景来决定。基数 2.0 是最常用的选择，它在快速重试和给系统恢复时间之间取得了良好的平衡。基数 1.5 适用于对延迟敏感的场景，重试间隔增长较慢，可以更快地完成重试。基数 3.0 适用于需要快速退出的场景，重试间隔增长很快，可以避免对系统造成过大压力。

在实际生产环境中，指数退避通常需要与最大延迟限制和抖动结合使用。没有最大延迟限制的指数退避，在重试次数较多时会产生不可接受的延迟。例如，基数 2.0 的指数退避在第 10 次重试时延迟为 1024 秒（约 17 分钟），这在实际应用中通常是不合理的。因此，建议始终为指数退避设置一个合理的最大延迟上限。

**带最大延迟的指数退避：**

```typescript
// 使用 compose 限制最大延迟
const capped = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.compose(Schedule.recurs(5))
)

// 使用 modifyDelay 设置上限
const capped2 = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.modifyDelay((delay) => Math.min(delay, 30000).toString()),
  Schedule.compose(Schedule.recurs(10))
)
```

**Schedule.linear：线性退避**

```typescript
// 线性增长：1s, 2s, 3s, 4s, ...
const linear = Schedule.linear("1 seconds")
```

**Schedule.fibonacci：斐波那契退避**

```typescript
// 斐波那契增长：1s, 1s, 2s, 3s, 5s, 8s, 13s, ...
const fibonacci = Schedule.fibonacci("1 seconds")
```

斐波那契退避的增长速度介于线性退避和指数退避之间，在某些场景下比指数退避更合适，因为它避免了指数退避在后期延迟过大的问题。

### 2.4 随机抖动

**Schedule.jittered：添加随机抖动**

```typescript
// 在指数退避上添加随机抖动
const withJitter = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.jittered
)

// 自定义抖动范围
const customJitter = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.jittered({ min: 0.5, max: 1.5 })
)
```

随机抖动是防止**惊群效应**（Thundering Herd）的关键技术。当多个客户端同时重试时，如果没有抖动，它们会在完全相同的时间点发起请求，导致服务器被瞬间压垮。抖动通过在每个重试延迟上添加随机变化，将重试时间点分散开来。

**Schedule.randomBetween：随机延迟**

```typescript
// 在 1 秒到 5 秒之间随机延迟
const randomDelay = Schedule.randomBetween("1 seconds", "5 seconds")
```

### 2.5 基于时间的调度

**Schedule.cron：使用 cron 表达式**

```typescript
// 每小时执行一次
const hourly = Schedule.cron("0 * * * *")

// 每天凌晨 3 点执行
const daily = Schedule.cron("0 3 * * *")

// 每周一上午 9 点执行
const weekly = Schedule.cron("0 9 * * 1")

// 每 15 分钟执行一次
const every15Min = Schedule.cron("*/15 * * * *")

// 每月 1 号和 15 号执行
const biMonthly = Schedule.cron("0 0 1,15 * *")
```

cron 表达式格式：`分 时 日 月 周`

**Schedule.dayOfMonth / dayOfWeek / hourOfDay / minuteOfHour：**

```typescript
// 每月 15 号执行
const monthly = Schedule.dayOfMonth(15)

// 每周一执行
const weekly = Schedule.dayOfWeek(1)

// 每天上午 9 点执行
const daily = Schedule.hourOfDay(9)

// 每小时的 30 分执行
const everyHalfHour = Schedule.minuteOfHour(30)
```

**带时区的时间调度：**

```typescript
// 使用特定时区
const beijingTime = Schedule.hourOfDay(9).pipe(
  Schedule.withTimezone("Asia/Shanghai")
)

// cron 表达式带时区
const cronWithTz = Schedule.cron("0 9 * * *").pipe(
  Schedule.withTimezone("America/New_York")
)
```

## 3. Schedule 的组合

### 3.1 组合操作符

Schedule 的真正威力在于其组合能力。通过组合操作符，我们可以将简单的调度策略组合成复杂的策略。

**Schedule.compose：顺序组合**

```typescript
// 先指数退避 3 次，然后固定间隔
const composed = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.compose(Schedule.fixed("5 seconds"))
)
```

`compose` 将两个调度顺序连接：第一个调度结束后，第二个调度开始。这适用于"先快速重试，然后定期检查"的场景。

更详细的例子：

```typescript
// 第一阶段：快速重试 3 次，每次间隔 1 秒
const fastRetry = Schedule.spaced("1 seconds").pipe(
  Schedule.compose(Schedule.recurs(3))
)

// 第二阶段：慢速重试 5 次，每次间隔 10 秒
const slowRetry = Schedule.spaced("10 seconds").pipe(
  Schedule.compose(Schedule.recurs(5))
)

// 组合：先快速重试，再慢速重试
const fullRetry = fastRetry.pipe(
  Schedule.compose(slowRetry)
)
// 总重试次数：3 + 5 = 8 次
// 延迟序列：1s, 1s, 1s, 10s, 10s, 10s, 10s, 10s
```

**Schedule.union：并集组合**

```typescript
// 两个调度同时运行，取先完成的
const union = Schedule.recurs(5).pipe(
  Schedule.union(Schedule.fixed("2 seconds"))
)
```

`union` 同时运行两个调度，只要其中一个决定继续，就继续执行。这适用于"最多重试 5 次，但每次间隔至少 2 秒"的场景。

更详细的例子：

```typescript
// 调度 A：最多重试 10 次
const maxRetries = Schedule.recurs(10)

// 调度 B：最多持续 30 秒
const maxDuration = Schedule.duration("30 seconds")

// 组合：最多重试 10 次，但不超过 30 秒
const retryWithTimeout = maxRetries.pipe(
  Schedule.union(maxDuration)
)
// 只要重试次数 < 10 且总耗时 < 30 秒，就继续重试
```

`union` 的决策逻辑是：只要两个调度中有一个决定继续，就继续执行。延迟时间取两个调度中较小的那个。输出值是两个调度输出值的元组。这种组合方式非常适合实现"或"语义的调度策略，例如"最多重试 N 次，或者最多持续 M 秒，以先到者为准"。

在实际应用中，`union` 常用于以下场景：

1. **重试次数与时间上限**：限制重试次数和总耗时，任何一个条件达到就停止。
2. **频率与间隔**：同时满足频率要求和间隔要求。
3. **多条件触发**：多个条件中任何一个满足就触发执行。

**Schedule.intersect：交集组合**

```typescript
// 两个调度同时运行，取后完成的
const intersect = Schedule.recurs(3).pipe(
  Schedule.intersect(Schedule.fixed("1 seconds"))
)
```

`intersect` 同时运行两个调度，只有当两个都决定继续时，才继续执行。这适用于"最多重试 3 次，且每次间隔至少 1 秒"的场景。

更详细的例子：

```typescript
// 调度 A：最多重试 5 次
const retries = Schedule.recurs(5)

// 调度 B：至少运行 10 秒
const minDuration = Schedule.duration("10 seconds")

// 组合：必须同时满足两个条件
const strictRetry = retries.pipe(
  Schedule.intersect(minDuration)
)
// 只有在重试次数 < 5 且总耗时 < 10 秒时才继续
```

`intersect` 的决策逻辑与 `union` 相反：只有当两个调度都决定继续时，才继续执行。延迟时间取两个调度中较大的那个。输出值是两个调度输出值的元组。这种组合方式非常适合实现"与"语义的调度策略，例如"必须同时满足重试次数限制和最小持续时间要求"。

`intersect` 和 `union` 的区别可以通过一个具体的例子来理解。假设调度 A 是 `Schedule.recurs(3)`（最多执行 4 次），调度 B 是 `Schedule.duration("10 seconds")`（最多持续 10 秒）。使用 `union` 组合时，只要重试次数未达到 4 次或者总耗时未达到 10 秒，就继续执行。使用 `intersect` 组合时，必须重试次数未达到 4 次且总耗时未达到 10 秒，才继续执行。这意味着 `union` 会执行更长时间（最多 10 秒），而 `intersect` 会在重试次数达到 4 次时立即停止（即使总耗时还不到 10 秒）。

**Schedule.sequence：顺序调度**

```typescript
// 依次执行多个调度
const seq = Schedule.sequence(
  Schedule.recurs(2),    // 先执行 2 次
  Schedule.spaced("5 seconds"), // 然后固定间隔
  Schedule.recurs(3)     // 再执行 3 次
)
```

**Schedule.merge：合并输出**

```typescript
// 合并两个调度的输出
const merged = Schedule.recurs(3).pipe(
  Schedule.merge(Schedule.fixed("1 seconds"))
)
// 输出是两个调度输出的元组
```

**Schedule.split：拆分调度**

```typescript
// 拆分为两个独立的调度
const [left, right] = Schedule.split(Schedule.recurs(5))
```

**Schedule.choose：条件组合**

```typescript
// 根据条件选择调度
const choose = Schedule.choose(
  Schedule.recurs(3),    // 条件为 true 时使用
  Schedule.recurs(10)    // 条件为 false 时使用
)
```

**Schedule.left / Schedule.right：偏置组合**

```typescript
// 偏向左侧调度
const leftBiased = Schedule.left(Schedule.recurs(3), Schedule.fixed("1 seconds"))

// 偏向右侧调度
const rightBiased = Schedule.right(Schedule.recurs(3), Schedule.fixed("1 seconds"))
```

**Schedule.passthrough：透传输入**

```typescript
// 透传输入值作为输出
const passthrough = Schedule.recurs(3).pipe(
  Schedule.passthrough
)
// 输出等于输入，忽略调度的原始输出
```

**Schedule.ensuring：最终执行**

```typescript
// 调度结束后执行清理
const withCleanup = Schedule.recurs(3).pipe(
  Schedule.ensuring(Console.log("retry policy exhausted"))
)
```

### 3.2 转换操作符

**Schedule.map：转换输出**

```typescript
const mapped = Schedule.recurs(3).pipe(
  Schedule.map((n) => `completed ${n} times`)
)
```

**Schedule.flatMap：根据输出创建新调度**

```typescript
const flatMapped = Schedule.recurs(3).pipe(
  Schedule.flatMap((n) => Schedule.fixed(`${n * 1000} millis`))
)
```

**Schedule.filter：过滤决策**

```typescript
// 只在偶数次时执行
const filtered = Schedule.recurs(10).pipe(
  Schedule.filter((n) => n % 2 === 0)
)
```

### 3.3 条件操作符

**Schedule.check：条件检查**

```typescript
const checkSchedule = Schedule.recurs(10).pipe(
  Schedule.check((n) => n < 5 ? Effect.succeed(true) : Effect.succeed(false))
)
```

**Schedule.whileInput：根据输入条件**

```typescript
// 当输入值大于 0 时继续
const whileInput = Schedule.whileInput<number>((n) => n > 0)
```

**Schedule.stop：停止条件**

```typescript
// 当 n >= 5 时停止
const stopSchedule = Schedule.recurs(10).pipe(
  Schedule.stop((n) => n >= 5)
)
```

### 3.4 延迟操作符

**Schedule.addDelay：添加额外延迟**

```typescript
const customDelay = Schedule.recurs(5).pipe(
  Schedule.addDelay((n) => `${n * 500} millis`)
)
```

**Schedule.modifyDelay：修改现有延迟**

```typescript
const modifiedDelay = Schedule.fixed("1 seconds").pipe(
  Schedule.modifyDelay((n) => `${n * 2} seconds`)
)
```

**Schedule.normal：正态分布延迟**

```typescript
// 使用正态分布生成延迟
const normalDelay = Schedule.fixed("1 seconds").pipe(
  Schedule.normal
)
```

## 4. Effect.retry 与 Effect.repeat

### 4.1 Effect.retry：失败时重试

`Effect.retry` 是 Schedule 最常用的应用场景。当 Effect 失败时，它会按照指定的调度策略进行重试：

```typescript
// 基本用法：最多重试 3 次
const retried = effect.pipe(
  Effect.retry(Schedule.recurs(3))
)

// 指数退避 + 抖动
const retried = effect.pipe(
  Effect.retry(
    Schedule.exponential("1 seconds", 2.0).pipe(
      Schedule.compose(Schedule.recurs(5)),
      Schedule.jittered
    )
  )
)
```

**retry 的行为：**

1. 执行 Effect。
2. 如果成功，返回结果。
3. 如果失败，查询 Schedule 决定是否重试。
4. 如果 Schedule 决定继续，等待指定的延迟后重试。
5. 重复步骤 2-4，直到成功或 Schedule 决定停止。

**retryOrElse：重试失败后执行备选**

```typescript
const result = effect.pipe(
  Effect.retryOrElse(
    Schedule.recurs(3),
    (err, n) => Effect.succeed(`gave up after ${n} attempts: ${err.message}`)
  )
)
```

`retryOrElse` 在重试耗尽后不会直接返回错误，而是执行一个备选逻辑。这个备选逻辑接收两个参数：最后一次的错误和已经执行的重试次数。这使得你可以根据重试的历史信息来决定备选行为。例如，你可以返回一个默认值、从缓存中读取数据、或者调用一个降级服务。

**retryOrElseEither：重试失败后返回 Either**

```typescript
const result = effect.pipe(
  Effect.retryOrElseEither(
    Schedule.recurs(3),
    (err, n) => Effect.succeed(`fallback after ${n} attempts`)
  )
)
// 成功时返回 Right，失败时返回 Left
```

`retryOrElseEither` 与 `retryOrElse` 类似，但它的返回值类型不同。当 Effect 成功时，返回 `Either.right(result)`；当重试耗尽时，返回 `Either.left(fallbackResult)`。这种设计使得调用方可以通过 Either 类型来统一处理成功和失败的情况，而不需要分别处理两种不同的路径。

**retryN：便捷的 N 次重试**

```typescript
// 重试最多 3 次
const retried = effect.pipe(
  Effect.retryN(3)
)
```

**retryUntil 和 retryWhile：条件重试**

```typescript
// 重试直到满足条件
const retryUntil = effect.pipe(
  Effect.retryUntil((err) => err.message.includes("fatal"))
)

// 当条件满足时重试
const retryWhile = effect.pipe(
  Effect.retryWhile((err) => err.message.includes("timeout"))
)
```

**带错误过滤的重试：**

```typescript
// 只对特定错误类型重试
const retryFiltered = effect.pipe(
  Effect.catchIf(
    (err) => err._tag === "TimeoutError",
    (err) => Effect.retry(Schedule.recurs(3))
  )
)
```

**带超时的重试：**

```typescript
// 每次重试有超时限制
const retryWithTimeout = effect.pipe(
  Effect.retry(
    Schedule.recurs(3).pipe(
      Schedule.compose(Schedule.spaced("1 seconds"))
    )
  ),
  Effect.timeout("30 seconds")
)
```

**带日志的重试：**

```typescript
// 每次重试记录日志
const retryWithLogging = effect.pipe(
  Effect.retry(
    Schedule.recurs(3).pipe(
      Schedule.tap((n) => Console.log(`Retry attempt #${n + 1}`))
    )
  )
)
```

### 4.2 Effect.repeat：成功时重复

`Effect.repeat` 与 `retry` 相反——它在 Effect 成功时重复执行：

```typescript
// 重复 5 次
const repeated = effect.pipe(
  Effect.repeat(Schedule.recurs(5))
)

// 固定间隔重复
const repeated = effect.pipe(
  Effect.repeat(Schedule.fixed("1 seconds"))
)
```

**repeat 的行为：**

1. 执行 Effect。
2. 如果失败，返回错误。
3. 如果成功，查询 Schedule 决定是否重复。
4. 如果 Schedule 决定继续，等待指定的延迟后重复。
5. 重复步骤 2-4，直到失败或 Schedule 决定停止。

**repeatOrElse：重复失败后执行备选**

```typescript
const result = effect.pipe(
  Effect.repeatOrElse(
    Schedule.recurs(5),
    (err, n) => Effect.succeed(`stopped after ${n} repeats due to error`)
  )
)
```

**repeatOrElseEither：重复失败后返回 Either**

```typescript
const result = effect.pipe(
  Effect.repeatOrElseEither(
    Schedule.recurs(5),
    (err, n) => Effect.succeed(`fallback after ${n} repeats`)
  )
)
```

**repeatN：便捷的 N 次重复**

```typescript
// 重复 5 次
const repeated = effect.pipe(
  Effect.repeatN(5)
)
```

**repeatUntil 和 repeatWhile：条件重复**

```typescript
// 重复直到满足条件
const repeatUntil = effect.pipe(
  Effect.repeatUntil((value) => value >= 100)
)

// 当条件满足时重复
const repeatWhile = effect.pipe(
  Effect.repeatWhile((value) => value < 100)
)
```

**带状态累积的重复：**

```typescript
// 累积每次执行的结果
const accumulate = effect.pipe(
  Effect.repeat(
    Schedule.recurs(5).pipe(
      Schedule.collectAll
    )
  )
)
```

**带副作用的重复：**

```typescript
// 每次重复前执行副作用
const repeatWithSideEffect = effect.pipe(
  Effect.repeat(
    Schedule.recurs(5).pipe(
      Schedule.tap((n) => Console.log(`Starting repeat #${n + 1}`))
    )
  )
)
```

### 4.3 retry 与 repeat 的组合

`retry` 和 `repeat` 可以组合使用，实现"失败时重试，成功后重复"的行为：

```typescript
const combined = effect.pipe(
  Effect.retry(Schedule.recurs(3)),    // 失败时重试最多 3 次
  Effect.repeat(Schedule.fixed("1 seconds")) // 成功后每 1 秒重复
)
```

更复杂的组合模式：

```typescript
// 内部重试 + 外部重复
const complex = effect.pipe(
  Effect.retry(
    Schedule.exponential("1 seconds", 2.0).pipe(
      Schedule.compose(Schedule.recurs(3)),
      Schedule.jittered
    )
  ),
  Effect.repeat(
    Schedule.fixed("5 seconds").pipe(
      Schedule.compose(Schedule.recurs(10))
    )
  )
)
// 每次执行最多重试 3 次（指数退避 + 抖动）
// 成功后每 5 秒重复，最多重复 10 次
```

## 5. 高级调度模式

### 5.1 熔断器模式

熔断器（Circuit Breaker）是一种防止级联故障的模式。当连续失败达到阈值时，熔断器"断开"，后续请求直接失败而不执行实际操作。经过一段时间后，熔断器"半开"，允许少量请求通过测试服务是否恢复。

```typescript
class CircuitBreaker {
  private state: Ref.Ref<{
    failures: number
    lastFailureTime: number
    state: "closed" | "open" | "half-open"
  }>

  // 检查是否允许请求通过
  canProceed(): Effect.Effect<boolean> {
    return Ref.get(this.state).pipe(
      Effect.andThen((state) => {
        if (state.state === "open") {
          const elapsed = Date.now() - state.lastFailureTime
          if (elapsed > 30000) {
            // 30 秒后尝试半开
            return Ref.update(this.state, (s) => ({
              ...s, state: "half-open"
            })).pipe(Effect.andThen(true))
          }
          return Effect.succeed(false)
        }
        return Effect.succeed(true)
      })
    )
  }

  // 记录成功
  recordSuccess(): Effect.Effect<void> {
    return Ref.set(this.state, {
      failures: 0, lastFailureTime: 0, state: "closed"
    })
  }

  // 记录失败
  recordFailure(): Effect.Effect<void> {
    return Ref.update(this.state, (state) => ({
      failures: state.failures + 1,
      lastFailureTime: Date.now(),
      state: state.failures >= 5 ? "open" : "closed",
    }))
  }
}
```

更完整的熔断器实现，包含半开状态下的请求计数：

```typescript
class AdvancedCircuitBreaker {
  private state: Ref.Ref<{
    failures: number
    successes: number
    lastFailureTime: number
    state: "closed" | "open" | "half-open"
  }>

  // 半开状态下允许的请求数
  private halfOpenMaxRequests = 3

  canProceed(): Effect.Effect<boolean> {
    return Ref.get(this.state).pipe(
      Effect.andThen((s) => {
        switch (s.state) {
          case "closed":
            return Effect.succeed(true)
          case "open": {
            const elapsed = Date.now() - s.lastFailureTime
            if (elapsed > 30000) {
              return Ref.update(this.state, (st) => ({
                ...st,
                state: "half-open",
                successes: 0
              })).pipe(Effect.andThen(true))
            }
            return Effect.succeed(false)
          }
          case "half-open":
            return s.successes < this.halfOpenMaxRequests
              ? Effect.succeed(true)
              : Effect.succeed(false)
        }
      })
    )
  }

  recordSuccess(): Effect.Effect<void> {
    return Ref.update(this.state, (s) => {
      if (s.state === "half-open" && s.successes + 1 >= this.halfOpenMaxRequests) {
        return { failures: 0, successes: 0, lastFailureTime: 0, state: "closed" }
      }
      return { ...s, successes: s.successes + 1, failures: 0 }
    })
  }

  recordFailure(): Effect.Effect<void> {
    return Ref.update(this.state, (s) => ({
      failures: s.failures + 1,
      successes: 0,
      lastFailureTime: Date.now(),
      state: s.failures + 1 >= 5 ? "open" : "closed",
    }))
  }
}
```

熔断器模式的核心价值在于防止级联故障。在微服务架构中，当一个服务出现故障时，如果调用方持续重试，会导致请求堆积，最终可能耗尽调用方的资源，进而影响其他依赖同一调用方的服务。这种故障传播效应就是所谓的级联故障。熔断器通过快速失败机制，在检测到服务不可用时立即返回错误，而不是继续等待或重试，从而切断了故障传播链。

熔断器的三个状态对应了三种不同的行为模式。在 closed 状态下，熔断器允许所有请求通过，同时监控失败率。当失败率达到阈值时，熔断器切换到 open 状态。在 open 状态下，所有请求直接失败，不执行实际操作，这给了下游服务恢复的时间。经过一段预设的时间后，熔断器切换到 half-open 状态，允许少量请求通过。如果这些请求成功，熔断器认为服务已恢复，切换回 closed 状态。如果请求仍然失败，熔断器回到 open 状态，继续等待。

熔断器的参数需要根据具体的业务场景来调整。失败阈值决定了熔断器的敏感度，阈值太低会导致不必要的熔断，阈值太高则无法及时保护系统。恢复时间决定了熔断器在多长时间后尝试恢复，太短可能导致服务在未恢复时就被再次压垮，太长则会影响系统的可用性。半开状态下的请求数决定了恢复测试的样本量，太少可能无法准确判断服务状态，太多则可能在服务未恢复时造成过大压力。

### 5.2 自适应重试

自适应重试策略根据系统的实时状态动态调整重试参数：

```typescript
const adaptiveRetry = (getLatency: Effect.Effect<number>) =>
  Schedule.recurs(10).pipe(
    Schedule.modifyDelay((n) =>
      getLatency.pipe(
        Effect.map((latency) => `${Math.min(latency * Math.pow(2, n), 30000)} millis`)
      )
    )
  )
```

更完善的自适应重试，考虑历史延迟：

```typescript
const adaptiveRetryWithHistory = (
  latencyHistory: Ref.Ref<number[]>
) =>
  Schedule.recurs(10).pipe(
    Schedule.modifyDelay((n) =>
      Ref.get(latencyHistory).pipe(
        Effect.map((history) => {
          const avgLatency = history.length > 0
            ? history.reduce((a, b) => a + b, 0) / history.length
            : 1000
          const delay = Math.min(avgLatency * Math.pow(2, n), 30000)
          return `${delay} millis`
        })
      )
    )
  )
```

### 5.3 分级重试

不同的错误类型需要不同的重试策略：

```typescript
const gradedRetry = (error: Error) => {
  if (error.message.includes("timeout")) {
    // 超时错误：快速重试几次
    return Schedule.recurs(3).pipe(
      Schedule.compose(Schedule.spaced("1 seconds"))
    )
  }
  if (error.message.includes("rate limit")) {
    // 限流错误：等待较长时间
    return Schedule.spaced("30 seconds").pipe(
      Schedule.compose(Schedule.recurs(2))
    )
  }
  // 其他错误：指数退避
  return Schedule.exponential("1 seconds", 2.0).pipe(
    Schedule.compose(Schedule.recurs(5))
  )
}
```

更结构化的分级重试，使用错误标签：

```typescript
type RetryableError =
  | { _tag: "TimeoutError"; message: string }
  | { _tag: "RateLimitError"; message: string; retryAfter: number }
  | { _tag: "ServiceUnavailable"; message: string }
  | { _tag: "InternalError"; message: string }

const gradedRetryByTag = (error: RetryableError): Schedule.Schedule<number, void, never> => {
  switch (error._tag) {
    case "TimeoutError":
      return Schedule.recurs(3).pipe(
        Schedule.compose(Schedule.spaced("500 millis"))
      )
    case "RateLimitError":
      return Schedule.spaced(`${error.retryAfter} millis`).pipe(
        Schedule.compose(Schedule.recurs(1))
      )
    case "ServiceUnavailable":
      return Schedule.exponential("1 seconds", 2.0).pipe(
        Schedule.compose(Schedule.recurs(5)),
        Schedule.jittered
      )
    case "InternalError":
      return Schedule.recurs(1) // 只重试一次
  }
}
```

### 5.4 指数退避 + 抖动 + 上限

将多种策略组合成一个完整的重试策略：

```typescript
const fullBackoffStrategy = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.compose(Schedule.recurs(10)),     // 最多重试 10 次
  Schedule.jittered({ min: 0.8, max: 1.2 }), // 20% 抖动
  Schedule.modifyDelay((delay) =>             // 延迟上限 30 秒
    `${Math.min(delay, 30000)} millis`
  ),
  Schedule.tap((n) => Console.log(             // 日志记录
    `Retry #${n + 1} with delay ${delay}ms`
  ))
)
```

### 5.5 带预算的重试

限制在给定时间窗口内的重试次数：

```typescript
class RetryBudget {
  private state: Ref.Ref<{
    remaining: number
    resetTime: number
  }>

  constructor(private maxRetries: number, private windowMs: number) {
    this.state = Ref.make({
      remaining: maxRetries,
      resetTime: Date.now() + windowMs
    })
  }

  consume(): Effect.Effect<boolean> {
    return Ref.modify(this.state, (s) => {
      const now = Date.now()
      if (now >= s.resetTime) {
        // 时间窗口已重置
        return [true, { remaining: this.maxRetries - 1, resetTime: now + this.windowMs }]
      }
      if (s.remaining <= 0) {
        return [false, s]
      }
      return [true, { ...s, remaining: s.remaining - 1 }]
    })
  }
}

// 使用预算限制重试
const budgetRetry = (budget: RetryBudget) =>
  Schedule.recurs(10).pipe(
    Schedule.check(() => budget.consume())
  )
```

### 5.6 带缓存的重试

在重试之间使用缓存避免重复请求：

```typescript
class RetryCache {
  private cache: Map<string, unknown> = new Map()

  getOrFetch<A>(key: string, fetch: Effect.Effect<A>): Effect.Effect<A> {
    if (this.cache.has(key)) {
      return Effect.succeed(this.cache.get(key) as A)
    }
    return fetch.pipe(
      Effect.tap((value) => Effect.sync(() => this.cache.set(key, value))),
      Effect.retry(
        Schedule.recurs(3).pipe(
          Schedule.compose(Schedule.spaced("1 seconds"))
        )
      )
    )
  }
}
```

### 5.7 带幂等键的重试

使用幂等键确保重试不会导致重复操作：

```typescript
const withIdempotencyKey = <A, E>(
  effect: Effect.Effect<A, E>,
  idempotencyKey: string
): Effect.Effect<A, E> => {
  return effect.pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        // 存储结果到幂等缓存
        idempotencyCache.set(idempotencyKey, result)
      })
    ),
    Effect.retry(
      Schedule.recurs(3).pipe(
        Schedule.compose(Schedule.spaced("1 seconds"))
      )
    )
  )
}
```

## 6. 生产案例：微服务健康检查系统

### 6.1 系统设计

我们将构建一个生产级的微服务健康检查系统，它综合运用了本章介绍的所有 Schedule 概念：

```
                    ┌─────────────────────┐
                    │   Health Checker    │
                    │  ┌───────────────┐  │
                    │  │ Circuit       │  │
                    │  │ Breaker       │  │
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │ Retry Policy  │  │
                    │  │ (Exponential  │  │
                    │  │  + Jitter)    │  │
                    │  └───────────────┘  │
                    └────────┬────────────┘
                             │
                    ┌────────┴────────┐
                    │   Alert Queue   │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │ Alert Processor │
                    └─────────────────┘
```

### 6.2 核心组件

**HealthChecker：健康检查器**

每个微服务对应一个 HealthChecker 实例，它负责：

1. 定期执行健康检查（使用 Schedule.fixed）。
2. 在检查失败时进行重试（使用指数退避 + 抖动）。
3. 通过熔断器防止级联故障。
4. 在服务异常时发送告警。

**CircuitBreaker：熔断器**

熔断器有三种状态：

- **closed（关闭）**：正常状态，请求通过。
- **open（断开）**：连续失败达到阈值，请求直接失败。
- **half-open（半开）**：经过一段时间后，允许少量请求通过测试。

**AlertProcessor：告警处理器**

从告警队列中消费告警，并根据严重级别执行不同的处理逻辑。

### 6.3 重试策略

健康检查的重试策略结合了多种 Schedule 操作：

```typescript
getRetryPolicy(): Schedule.Schedule<number, void, never> {
  return Schedule.exponential("1 seconds", 2.0).pipe(
    Schedule.compose(Schedule.recurs(3)),  // 最多重试 3 次
    Schedule.jittered({ min: 0.5, max: 1.5 }), // 添加 50% 的抖动
    Schedule.tap((n) => Console.log(`Retrying (attempt ${n})`)) // 日志记录
  )
}
```

这个策略的含义是：

1. 从 1 秒开始，每次重试延迟翻倍。
2. 最多重试 3 次。
3. 每次延迟添加 50%-150% 的随机抖动。
4. 每次重试前记录日志。

### 6.4 定期检查策略

定期健康检查使用 `Schedule.fixed`：

```typescript
getCheckSchedule(): Schedule.Schedule<number, void, never> {
  return Schedule.fixed("5 seconds").pipe(
    Schedule.tap((n) => Console.log(`Scheduled check #${n}`))
  )
}
```

每 5 秒执行一次健康检查，每次检查前记录日志。

### 6.5 熔断器集成

熔断器与重试策略协同工作：

```typescript
checkHealth(): Effect.Effect<ServiceHealth> {
  return Effect.gen(function* (_) {
    // 1. 检查熔断器状态
    const canProceed = yield* _(this.checkCircuitBreaker())
    if (!canProceed) {
      return unhealthyResult("circuit breaker open")
    }

    // 2. 执行健康检查
    const health = yield* _(this.check())

    // 3. 更新熔断器状态
    yield* _(this.updateCircuitBreaker(health))

    // 4. 发送告警
    yield* _(this.sendAlert(health))

    return health
  })
}
```

### 6.6 告警系统

告警系统使用 Queue 实现异步解耦：

```typescript
// 健康检查器发送告警
private sendAlert(health: ServiceHealth): Effect.Effect<void> {
  if (health.status === "unhealthy") {
    return Queue.offer(this.alertQueue, {
      serviceName: this.config.serviceName,
      severity: "critical",
      message: `Service is unhealthy: ${health.error}`,
      timestamp: Date.now(),
    })
  }
  // ...
}

// 告警处理器消费告警
processAlerts(): Effect.Effect<void> {
  const processOne = Effect.gen(function* (_) {
    const alert = yield* _(Queue.take(this.alertQueue))
    console.log(`[AlertProcessor] ${alert.severity}: ${alert.message}`)
  })
  return processOne.pipe(Effect.forever)
}
```

### 6.7 完整系统运行

```typescript
const main = Effect.gen(function* (_) {
  // 创建告警队列
  const alertQueue = yield* _(Queue.unbounded<Alert>())

  // 创建健康检查器
  const checker1 = yield* _(HealthChecker.make(
    { serviceName: "user-service", url: "http://user-service:3000/health", ... },
    alertQueue
  ))
  const checker2 = yield* _(HealthChecker.make(
    { serviceName: "order-service", url: "http://order-service:3001/health", ... },
    alertQueue
  ))

  // 启动告警处理器
  const alertProcessor = AlertProcessor.make(alertQueue)
  const alertFiber = yield* _(Effect.fork(alertProcessor.processAlerts()))

  // 启动定期健康检查
  const healthCheck1 = yield* _(Effect.fork(
    runHealthCheckLoop(checker1)
  ))
  const healthCheck2 = yield* _(Effect.fork(
    runHealthCheckLoop(checker2)
  ))

  // 运行 30 秒后停止
  yield* _(Effect.sleep("30 seconds"))

  // 清理
  yield* _(Fiber.interrupt(healthCheck1))
  yield* _(Fiber.interrupt(healthCheck2))
  yield* _(Fiber.interrupt(alertFiber))
  yield* _(Queue.shutdown(alertQueue))
})
```

### 6.8 多服务类型与不同调度策略

不同类型的服务可以使用不同的健康检查调度策略：

```typescript
// 关键服务：频繁检查，激进重试
const criticalServiceSchedule = Schedule.fixed("2 seconds").pipe(
  Schedule.compose(Schedule.recurs(100))
)

// 普通服务：常规检查，适度重试
const normalServiceSchedule = Schedule.fixed("10 seconds").pipe(
  Schedule.compose(Schedule.recurs(50))
)

// 后台服务：低频检查，少量重试
const backgroundServiceSchedule = Schedule.fixed("30 seconds").pipe(
  Schedule.compose(Schedule.recurs(10))
)
```

### 6.9 健康检查结果聚合

```typescript
class HealthAggregator {
  private results: Ref.Ref<Map<string, ServiceHealth>>

  aggregate(): Effect.Effect<SystemHealth> {
    return Ref.get(this.results).pipe(
      Effect.map((results) => {
        const services = Array.from(results.entries())
        const unhealthy = services.filter(([_, h]) => h.status === "unhealthy")
        const degraded = services.filter(([_, h]) => h.status === "degraded")
        return {
          totalServices: services.length,
          unhealthyCount: unhealthy.length,
          degradedCount: degraded.length,
          healthyCount: services.length - unhealthy.length - degraded.length,
          overallStatus: unhealthy.length > 0 ? "unhealthy"
            : degraded.length > 0 ? "degraded"
            : "healthy",
          timestamp: Date.now()
        }
      })
    )
  }
}
```

健康检查结果聚合是微服务监控系统中的关键组件。它负责收集所有服务的健康状态，并生成一个全局的系统健康视图。聚合器可以按照不同的维度进行统计，例如按服务类型、按数据中心、按版本等。聚合结果可以用于触发全局告警、调整流量路由、或者触发自动扩缩容操作。

在实际生产环境中，健康检查结果聚合需要考虑以下几个关键因素：

第一，聚合的实时性。健康检查结果需要及时聚合，以便在服务出现故障时能够快速响应。通常建议聚合周期不超过健康检查周期的两倍。第二，聚合的准确性。需要避免因为网络延迟或时钟不同步导致的误报。第三，聚合的扩展性。当服务数量增长时，聚合器需要能够水平扩展以处理更多的健康检查结果。第四，聚合的容错性。聚合器本身也需要是高可用的，避免单点故障。

### 6.10 告警升级与去重

```typescript
class AlertEscalator {
  private alertCounts: Ref.Ref<Map<string, number>>

  processAlert(alert: Alert): Effect.Effect<Alert> {
    return Ref.update(this.alertCounts, (counts) => {
      const key = `${alert.serviceName}:${alert.severity}`
      const count = (counts.get(key) || 0) + 1
      counts.set(key, count)
      return counts
    }).pipe(
      Effect.andThen(() => {
        if (alert.severity === "critical" && this.alertCounts > 5) {
          return { ...alert, severity: "emergency" as const }
        }
        return alert
      })
    )
  }
}

// 告警去重：相同告警在 5 分钟内不重复发送
class AlertDeduplicator {
  private recentAlerts: Ref.Ref<Map<string, number>>

  shouldSend(alert: Alert): Effect.Effect<boolean> {
    return Ref.modify(this.recentAlerts, (recent) => {
      const key = `${alert.serviceName}:${alert.message}`
      const lastSent = recent.get(key) || 0
      const now = Date.now()
      if (now - lastSent < 5 * 60 * 1000) {
        return [false, recent] // 5 分钟内已发送过
      }
      recent.set(key, now)
      return [true, recent]
    })
  }
}
```

### 6.11 生产环境考量

在生产环境中使用 Schedule 时，以下因素需要仔细考虑：

1. **重试次数限制**：无限重试可能导致资源耗尽。始终使用 `Schedule.recurs` 或 `Schedule.compose` 来限制重试次数。

2. **延迟上限**：指数退避的延迟可能增长到不可接受的程度。使用 `Schedule.compose` 与固定间隔调度来设置上限。

3. **抖动范围**：抖动范围太小无法有效分散重试，太大则可能导致不必要的等待。通常建议 20%-50% 的抖动范围。

4. **熔断器参数**：熔断器的阈值和恢复时间需要根据服务的 SLA 来调整。太敏感会导致不必要的熔断，太迟钝则无法有效保护系统。

5. **监控和告警**：所有重试和熔断事件都应该被记录和监控，以便及时发现系统问题。

6. **测试**：重试策略应该在测试环境中验证，确保它们在实际故障场景中表现符合预期。

## 7. Schedule 用于定时任务

Schedule 不仅可以用于重试和重复，还可以直接用于定时任务的调度。

### 7.1 固定间隔任务

```typescript
// 每 5 秒执行一次任务
const periodicTask = Effect.repeat(
  task,
  Schedule.fixed("5 seconds")
)

// 每 30 分钟执行一次
const halfHourlyTask = Effect.repeat(
  task,
  Schedule.fixed("30 minutes")
)
```

### 7.2 Cron 定时任务

```typescript
// 每天凌晨 3 点执行数据清理
const cleanupTask = Effect.repeat(
  dataCleanup,
  Schedule.cron("0 3 * * *")
)

// 每周一上午 9 点生成周报
const weeklyReport = Effect.repeat(
  generateReport,
  Schedule.cron("0 9 * * 1")
)

// 每月 1 号执行账单计算
const monthlyBilling = Effect.repeat(
  calculateBilling,
  Schedule.cron("0 0 1 * *")
)
```

### 7.3 按星期几调度

```typescript
// 工作日执行
const weekdayTask = Schedule.dayOfWeek(1).pipe(
  Schedule.union(Schedule.dayOfWeek(2)),
  Schedule.union(Schedule.dayOfWeek(3)),
  Schedule.union(Schedule.dayOfWeek(4)),
  Schedule.union(Schedule.dayOfWeek(5))
)

// 周末执行
const weekendTask = Schedule.dayOfWeek(6).pipe(
  Schedule.union(Schedule.dayOfWeek(0))
)
```

### 7.4 按小时调度

```typescript
// 业务时间执行（9:00 - 18:00）
const businessHours = Schedule.hourOfDay(9).pipe(
  Schedule.union(Schedule.hourOfDay(10)),
  Schedule.union(Schedule.hourOfDay(11)),
  Schedule.union(Schedule.hourOfDay(12)),
  Schedule.union(Schedule.hourOfDay(13)),
  Schedule.union(Schedule.hourOfDay(14)),
  Schedule.union(Schedule.hourOfDay(15)),
  Schedule.union(Schedule.hourOfDay(16)),
  Schedule.union(Schedule.hourOfDay(17))
)

// 非业务时间执行
const offHours = Schedule.hourOfDay(0).pipe(
  Schedule.union(Schedule.hourOfDay(1)),
  Schedule.union(Schedule.hourOfDay(2)),
  Schedule.union(Schedule.hourOfDay(3)),
  Schedule.union(Schedule.hourOfDay(4)),
  Schedule.union(Schedule.hourOfDay(5)),
  Schedule.union(Schedule.hourOfDay(6)),
  Schedule.union(Schedule.hourOfDay(7)),
  Schedule.union(Schedule.hourOfDay(8)),
  Schedule.union(Schedule.hourOfDay(18)),
  Schedule.union(Schedule.hourOfDay(19)),
  Schedule.union(Schedule.hourOfDay(20)),
  Schedule.union(Schedule.hourOfDay(21)),
  Schedule.union(Schedule.hourOfDay(22)),
  Schedule.union(Schedule.hourOfDay(23))
)
```

### 7.5 组合时间调度

```typescript
// 工作日上午 9 点执行
const weekdayMorning = Schedule.dayOfWeek(1).pipe(
  Schedule.union(Schedule.dayOfWeek(2)),
  Schedule.union(Schedule.dayOfWeek(3)),
  Schedule.union(Schedule.dayOfWeek(4)),
  Schedule.union(Schedule.dayOfWeek(5)),
  Schedule.intersect(Schedule.hourOfDay(9))
)

// 每月 1 号凌晨 2 点执行
const monthlyMaintenance = Schedule.dayOfMonth(1).pipe(
  Schedule.intersect(Schedule.hourOfDay(2))
)
```

### 7.6 带时区的时间调度

```typescript
// 使用特定时区
const beijingTime = Schedule.hourOfDay(9).pipe(
  Schedule.withTimezone("Asia/Shanghai")
)

// 跨时区调度
const globalSchedule = Schedule.hourOfDay(9).pipe(
  Schedule.withTimezone("UTC")
)
```

### 7.7 实际应用场景

**数据同步任务：**

```typescript
const dataSync = Effect.repeat(
  syncData(),
  Schedule.fixed("15 minutes").pipe(
    Schedule.compose(Schedule.recurs(1000))
  )
)
```

**缓存刷新：**

```typescript
const cacheRefresh = Effect.repeat(
  refreshCache(),
  Schedule.fixed("5 minutes").pipe(
    Schedule.compose(Schedule.recurs(1000))
  )
)
```

**日志轮转：**

```typescript
const logRotation = Effect.repeat(
  rotateLogs(),
  Schedule.cron("0 0 * * *") // 每天午夜执行
)
```

**心跳监控：**

```typescript
const heartbeat = Effect.repeat(
  sendHeartbeat(),
  Schedule.fixed("10 seconds").pipe(
    Schedule.compose(Schedule.recurs(1000))
  )
)
```

**会话清理：**

```typescript
const sessionCleanup = Effect.repeat(
  cleanupExpiredSessions(),
  Schedule.fixed("1 hour").pipe(
    Schedule.compose(Schedule.recurs(1000))
  )
)
```

**报表生成：**

```typescript
const reportGeneration = Effect.repeat(
  generateDailyReport(),
  Schedule.cron("0 8 * * *") // 每天上午 8 点
)
```

这些实际应用场景展示了 Schedule 在定时任务领域的广泛用途。数据同步任务需要定期将数据从一个系统同步到另一个系统，使用 `Schedule.fixed("15 minutes")` 可以确保同步操作每 15 分钟执行一次。缓存刷新任务需要定期更新缓存中的数据，使用 `Schedule.fixed("5 minutes")` 可以确保缓存数据的新鲜度。日志轮转任务需要在每天午夜执行，使用 `Schedule.cron("0 0 * * *")` 可以精确控制执行时间。心跳监控任务需要定期发送心跳信号，使用 `Schedule.fixed("10 seconds")` 可以确保心跳信号的及时性。会话清理任务需要定期清理过期的会话数据，使用 `Schedule.fixed("1 hour")` 可以在不影响系统性能的前提下完成清理。报表生成任务需要在每天上午 8 点执行，使用 `Schedule.cron("0 8 * * *")` 可以确保报表在业务时间开始前准备好。

在设计定时任务时，需要考虑以下几个关键因素：

第一，任务的执行时间应该避开业务高峰期。例如，数据清理和报表生成等资源密集型任务应该在业务低峰期执行。第二，任务的执行频率应该根据业务需求来确定。频率太高会浪费系统资源，频率太低则可能无法满足业务需求。第三，任务应该具有幂等性，确保重复执行不会产生副作用。第四，任务应该具有超时机制，避免单个任务长时间占用系统资源。第五，任务应该具有错误处理机制，确保单个任务的失败不会影响其他任务的执行。

## 8. Schedule 与 Stream 的结合

Schedule 与 Effect-TS 的 Stream 模块深度集成，提供了丰富的流式调度能力。

### 8.1 Stream.repeat 与 Schedule

```typescript
import { Stream } from "@effect/stream"

// 重复流元素
const repeatedStream = stream.pipe(
  Stream.repeat(Schedule.recurs(3))
)

// 固定间隔重复流
const periodicStream = stream.pipe(
  Stream.repeat(Schedule.fixed("1 seconds"))
)
```

### 8.2 Stream.retry 与 Schedule

```typescript
// 流失败时重试
const retriedStream = stream.pipe(
  Stream.retry(Schedule.recurs(3))
)

// 指数退避重试
const retriedStream2 = stream.pipe(
  Stream.retry(
    Schedule.exponential("1 seconds", 2.0).pipe(
      Schedule.compose(Schedule.recurs(5))
    )
  )
)
```

### 8.3 Stream.schedule 与 Stream.scheduleWith

```typescript
// 按调度发射元素
const scheduledStream = stream.pipe(
  Stream.schedule(Schedule.fixed("1 seconds"))
)

// 带输出的调度
const scheduledWith = stream.pipe(
  Stream.scheduleWith(
    Schedule.fixed("1 seconds"),
    (elem, output) => `emitted ${elem} at interval ${output}`
  )
)
```

### 8.4 Stream.fixed：固定间隔发射

```typescript
// 每 1 秒发射一个元素
const fixedStream = Stream.fixed("1 seconds")

// 每 5 分钟发射
const every5Min = Stream.fixed("5 minutes")
```

### 8.5 Stream.debounce 与 Schedule

```typescript
// 防抖：在指定时间内没有新元素时才发射
const debounced = stream.pipe(
  Stream.debounce("500 millis")
)

// 使用 Schedule 自定义防抖
const customDebounce = stream.pipe(
  Stream.debounce(Schedule.spaced("500 millis"))
)
```

### 8.6 Stream.throttle 与 Schedule

```typescript
// 限速：每秒最多 10 个元素
const throttled = stream.pipe(
  Stream.throttle({
    rate: 10,
    duration: "1 seconds"
  })
)

// 使用 Schedule 自定义限速
const customThrottle = stream.pipe(
  Stream.throttle({
    rate: 5,
    duration: "1 seconds",
    schedule: Schedule.fixed("200 millis")
  })
)
```

### 8.7 Stream.sample 与 Schedule

```typescript
// 按调度采样
const sampled = stream.pipe(
  Stream.sample(Schedule.fixed("5 seconds"))
)
```

### 8.8 Stream.splitOnSchedule

```typescript
// 按调度分割流
const split = stream.pipe(
  Stream.splitOnSchedule(Schedule.fixed("10 seconds"))
)
// 每 10 秒将累积的元素作为一个批次输出
```

### 8.9 Stream.groupBy 与 Schedule 窗口

```typescript
// 按 key 分组，使用调度窗口
const grouped = stream.pipe(
  Stream.groupByKey({
    schedule: Schedule.fixed("5 seconds"),
    bufferSize: 100
  })
)
```

### 8.10 Stream.tap 与 Schedule 日志

```typescript
// 每 10 个元素记录一次日志
const loggedStream = stream.pipe(
  Stream.tap((elem, index) => {
    if (index % 10 === 0) {
      return Console.log(`Processed ${index} elements`)
    }
    return Effect.void
  })
)
```

### 8.11 Stream 心跳

```typescript
// 在流中定期插入心跳元素
const heartbeatStream = Stream.merge(
  stream,
  Stream.fixed("5 seconds").pipe(
    Stream.map(() => ({ _tag: "heartbeat" as const }))
  )
)
```

Stream 与 Schedule 的结合为流式处理提供了强大的调度能力。Stream.repeat 允许你重复消费一个流，适用于需要定期轮询数据源的场景。Stream.retry 允许你在流处理失败时重试，适用于处理不稳定的数据源。Stream.schedule 允许你按调度策略发射元素，适用于需要控制数据发射频率的场景。Stream.fixed 允许你以固定间隔发射元素，适用于需要定期生成数据的场景。Stream.debounce 允许你防抖处理，适用于需要合并高频事件的场景。Stream.throttle 允许你限速处理，适用于需要控制处理速率的场景。Stream.sample 允许你按调度采样，适用于需要降低数据频率的场景。Stream.splitOnSchedule 允许你按时间窗口分割流，适用于需要批量处理数据的场景。Stream.groupBy 允许你按 key 分组并使用调度窗口，适用于需要按维度聚合数据的场景。

在实际应用中，Stream 与 Schedule 的结合可以解决很多常见的流式处理问题。例如，在日志处理系统中，可以使用 Stream.schedule 来控制日志的发送频率，避免对后端系统造成过大压力。在物联网数据采集系统中，可以使用 Stream.sample 来降低传感器数据的采集频率。在实时监控系统中，可以使用 Stream.throttle 来限制告警通知的发送频率。在批处理系统中，可以使用 Stream.splitOnSchedule 来按时间窗口划分数据批次。

## 9. Schedule 的测试与调试

### 9.1 Schedule.tap：日志记录

```typescript
// 记录每次调度决策
const loggedSchedule = Schedule.recurs(5).pipe(
  Schedule.tap((n) => Console.log(`Decision #${n}: delay=${delay}`))
)
```

### 9.2 Schedule.tapInput 与 Schedule.tapOutput

```typescript
// 记录输入
const tapInput = Schedule.recurs(5).pipe(
  Schedule.tapInput((input) => Console.log(`Input: ${input}`))
)

// 记录输出
const tapOutput = Schedule.recurs(5).pipe(
  Schedule.tapOutput((output) => Console.log(`Output: ${output}`))
)
```

### 9.3 Schedule.collectAll：收集输出

```typescript
// 收集所有输出值
const collected = Schedule.recurs(5).pipe(
  Schedule.collectAll
)

// 使用收集结果
const withCollection = effect.pipe(
  Effect.retry(collected),
  Effect.tap((outputs) => Console.log(`All outputs: ${outputs}`))
)
```

### 9.4 使用 TestClock 测试 Schedule

Effect-TS 的 TestClock 允许我们在测试中控制时间，从而确定性测试调度策略：

```typescript
import { TestClock } from "@effect/experimental"

// 测试重试策略
const testRetryPolicy = Effect.gen(function* (_) {
  const policy = Schedule.recurs(3).pipe(
    Schedule.compose(Schedule.spaced("1 seconds"))
  )

  // 执行 Effect
  const fiber = yield* _(
    failingEffect.pipe(
      Effect.retry(policy),
      Effect.fork
    )
  )

  // 推进时间
  yield* _(TestClock.adjust("1 seconds"))
  yield* _(TestClock.adjust("1 seconds"))
  yield* _(TestClock.adjust("1 seconds"))

  // 检查结果
  const result = yield* _(Fiber.join(fiber))
  assert.strictEqual(result, "expected")
})
```

### 9.5 测试重试策略

```typescript
const testExponentialBackoff = Effect.gen(function* (_) {
  const policy = Schedule.exponential("1 seconds", 2.0).pipe(
    Schedule.compose(Schedule.recurs(3))
  )

  const fiber = yield* _(
    failingEffect.pipe(
      Effect.retry(policy),
      Effect.fork
    )
  )

  // 第 1 次重试：1 秒后
  yield* _(TestClock.adjust("1 seconds"))
  // 第 2 次重试：2 秒后
  yield* _(TestClock.adjust("2 seconds"))
  // 第 3 次重试：4 秒后
  yield* _(TestClock.adjust("4 seconds"))

  const result = yield* _(Fiber.join(fiber))
  assert.ok(result !== undefined)
})
```

### 9.6 测试重复策略

```typescript
const testRepeatPolicy = Effect.gen(function* (_) {
  let counter = 0
  const effect = Effect.sync(() => {
    counter++
    return counter
  })

  const fiber = yield* _(
    effect.pipe(
      Effect.repeat(Schedule.recurs(5)),
      Effect.fork
    )
  )

  const result = yield* _(Fiber.join(fiber))
  assert.strictEqual(result, 6) // 初始 + 5 次重复
})
```

### 9.7 测试时间调度

```typescript
const testFixedSchedule = Effect.gen(function* (_) {
  const fiber = yield* _(
    effect.pipe(
      Effect.repeat(Schedule.fixed("1 seconds")),
      Effect.fork
    )
  )

  // 推进 5 秒
  yield* _(TestClock.adjust("5 seconds"))

  // 检查执行次数
  const result = yield* _(Fiber.join(fiber))
  assert.strictEqual(result, 5)
})
```

### 9.8 属性测试

```typescript
// 测试重试策略的属性
const testRetryProperties = (policy: Schedule.Schedule<number, void, never>) =>
  Effect.gen(function* (_) {
    // 属性 1：重试次数不超过 recurs 限制
    const maxRetries = 5
    const limited = policy.pipe(
      Schedule.compose(Schedule.recurs(maxRetries))
    )

    // 属性 2：延迟时间始终为正数
    // 属性 3：延迟时间不超过上限
    // 属性 4：调度最终会停止
  })
```

### 9.9 调试技巧

```typescript
// 使用 tap 调试调度决策
const debugSchedule = Schedule.recurs(5).pipe(
  Schedule.tap((n) => Console.log(`[DEBUG] Decision: ${JSON.stringify({ n })}`))
)

// 使用 collectAll 查看完整历史
const debugHistory = Schedule.recurs(5).pipe(
  Schedule.collectAll,
  Schedule.tap((history) => Console.log(`[DEBUG] History: ${JSON.stringify(history)}`))
)
```

调试 Schedule 时，除了使用 tap 和 collectAll 之外，还有一些实用的技巧。首先，可以使用 `Schedule.tapInput` 来记录每次调度接收到的输入值，这对于理解调度如何响应不同的输入非常有帮助。其次，可以使用 `Schedule.tapOutput` 来记录每次调度产生的输出值，这对于验证调度的输出是否符合预期非常有用。第三，可以使用 `Schedule.collectAllWhile` 来有条件地收集调度输出，避免收集过多不必要的数据。第四，在测试环境中，可以使用 TestClock 来精确控制时间，从而验证调度在特定时间点的行为。

对于复杂的调度策略，建议采用渐进式调试方法。先使用简单的调度策略验证基本功能，然后逐步添加组合操作符，每次添加后都验证行为是否符合预期。这种方法可以帮助你快速定位问题，避免在复杂的组合中迷失方向。

## 10. Schedule 性能与最佳实践

### 10.1 性能分析

Schedule 的性能开销主要来自以下几个方面：

1. **状态管理**：每个 Schedule 实例维护自己的状态，状态更新是纯函数式的，开销极低。
2. **延迟计算**：延迟计算通常是 O(1) 操作，即使是复杂的组合调度也只需要常数时间。
3. **组合开销**：组合操作符（compose、union、intersect）的运行时开销极小，因为它们只是创建新的调度结构。

```typescript
// 性能测试：大量重试
const performanceTest = Effect.gen(function* (_) {
  const start = Date.now()
  const policy = Schedule.recurs(10000)
  yield* _(failingEffect.pipe(Effect.retry(policy)))
  const end = Date.now()
  console.log(`10000 retries took ${end - start}ms`)
})
```

### 10.2 内存使用

Schedule 的内存使用通常很小，但需要注意以下情况：

1. **大规模状态**：如果使用 `collectAll` 收集大量输出，内存使用会线性增长。
2. **长周期调度**：长时间运行的调度（如 `Schedule.forever`）不会累积状态。
3. **组合调度**：组合多个调度不会显著增加内存使用。

```typescript
// 注意：collectAll 会累积所有输出
const memoryIntensive = Schedule.recurs(1000000).pipe(
  Schedule.collectAll // 会收集 1000000 个元素
)

// 推荐：使用 tap 处理每个输出，而不是收集
const memoryEfficient = Schedule.recurs(1000000).pipe(
  Schedule.tap((n) => Console.log(`Processed ${n}`))
)
```

### 10.3 最佳实践

**1. 始终限制重试次数：**

```typescript
// 错误：无限重试
const bad = Schedule.exponential("1 seconds", 2.0)

// 正确：限制重试次数
const good = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.compose(Schedule.recurs(10))
)
```

**2. 设置延迟上限：**

```typescript
// 错误：延迟可能无限增长
const bad = Schedule.exponential("1 seconds", 2.0)

// 正确：设置延迟上限
const good = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.modifyDelay((delay) => `${Math.min(delay, 30000)} millis`)
)
```

**3. 添加抖动防止惊群：**

```typescript
// 错误：没有抖动
const bad = Schedule.exponential("1 seconds", 2.0)

// 正确：添加抖动
const good = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.jittered({ min: 0.8, max: 1.2 })
)
```

**4. 记录重试事件：**

```typescript
// 错误：没有日志
const bad = Schedule.recurs(3)

// 正确：记录重试
const good = Schedule.recurs(3).pipe(
  Schedule.tap((n) => Console.log(`Retry #${n + 1}`))
)
```

**5. 使用分级重试：**

```typescript
// 错误：统一重试策略
const bad = Schedule.recurs(3)

// 正确：根据错误类型分级
const good = (error: Error) => {
  if (error.message.includes("timeout")) {
    return Schedule.spaced("500 millis").pipe(
      Schedule.compose(Schedule.recurs(3))
    )
  }
  return Schedule.exponential("1 seconds", 2.0).pipe(
    Schedule.compose(Schedule.recurs(5))
  )
}
```

### 10.4 常见错误

**错误 1：混淆 fixed 和 spaced：**

```typescript
// 错误：使用 fixed 但期望 spaced 的行为
const bad = Schedule.fixed("1 seconds") // 绝对时间点

// 正确：根据需求选择
const spaced = Schedule.spaced("1 seconds") // 相对时间间隔
const fixed = Schedule.fixed("1 seconds") // 绝对时间点
```

**错误 2：忘记限制重试次数：**

```typescript
// 错误：无限重试
const bad = effect.pipe(
  Effect.retry(Schedule.exponential("1 seconds", 2.0))
)

// 正确：限制重试次数
const good = effect.pipe(
  Effect.retry(
    Schedule.exponential("1 seconds", 2.0).pipe(
      Schedule.compose(Schedule.recurs(5))
    )
  )
)
```

**错误 3：忽略抖动：**

```typescript
// 错误：没有抖动，可能导致惊群效应
const bad = Schedule.exponential("1 seconds", 2.0)

// 正确：添加抖动
const good = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.jittered
)
```

**错误 4：过度组合：**

```typescript
// 错误：过度复杂的组合
const bad = Schedule.recurs(3).pipe(
  Schedule.union(Schedule.fixed("1 seconds")),
  Schedule.intersect(Schedule.recurs(5)),
  Schedule.compose(Schedule.spaced("2 seconds")),
  Schedule.jittered,
  Schedule.tap((n) => ...)
)

// 正确：清晰的组合
const good = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.compose(Schedule.recurs(5)),
  Schedule.jittered
)
```

### 10.5 反模式

**反模式 1：在 Effect 内部使用 Schedule：**

```typescript
// 反模式：在 Effect 内部创建 Schedule
const bad = effect.pipe(
  Effect.andThen(() => {
    const schedule = Schedule.recurs(3) // 每次执行都创建新 Schedule
    return effect2.pipe(Effect.retry(schedule))
  })
)

// 正确：在 Effect 外部创建 Schedule
const schedule = Schedule.recurs(3)
const good = effect.pipe(
  Effect.andThen(() => effect2.pipe(Effect.retry(schedule)))
)
```

**反模式 2：在 retry 中使用 repeat 语义：**

```typescript
// 反模式：在 retry 中使用 repeat 的语义
const bad = effect.pipe(
  Effect.retry(Schedule.fixed("1 seconds")) // 重试时使用固定间隔
)

// 正确：retry 使用退避策略
const good = effect.pipe(
  Effect.retry(
    Schedule.exponential("1 seconds", 2.0).pipe(
      Schedule.compose(Schedule.recurs(3))
    )
  )
)
```

**反模式 3：忽略错误类型：**

```typescript
// 反模式：对所有错误使用相同策略
const bad = effect.pipe(
  Effect.retry(Schedule.recurs(3))
)

// 正确：根据错误类型分级
const good = effect.pipe(
  Effect.catchIf(
    (err) => err._tag === "TimeoutError",
    (err) => Effect.retry(Schedule.recurs(3))
  )
)
```

### 10.6 分布式系统中的应用

在分布式系统中，Schedule 的使用需要额外注意：

```typescript
// 分布式锁 + 重试
const distributedRetry = (lock: DistributedLock) =>
  Effect.gen(function* (_) {
    const acquired = yield* _(lock.acquire())
    if (!acquired) {
      return yield* _(
        operation.pipe(
          Effect.retry(
            Schedule.spaced("1 seconds").pipe(
              Schedule.compose(Schedule.recurs(5))
            )
          )
        )
      )
    }
    return yield* _(operation)
  })
```

### 10.7 微服务中的应用

```typescript
// 服务间调用重试
const serviceCallRetry = Schedule.exponential("100 millis", 2.0).pipe(
  Schedule.compose(Schedule.recurs(5)),
  Schedule.jittered({ min: 0.9, max: 1.1 }),
  Schedule.tap((n) => Console.log(`Service call retry #${n + 1}`))
)

// 数据库操作重试
const dbRetry = Schedule.spaced("500 millis").pipe(
  Schedule.compose(Schedule.recurs(3)),
  Schedule.tap((n) => Console.log(`DB retry #${n + 1}`))
)

// 网络调用重试
const networkRetry = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.compose(Schedule.recurs(5)),
  Schedule.jittered,
  Schedule.modifyDelay((delay) => `${Math.min(delay, 10000)} millis`)
)
```

### 10.8 文件 I/O 中的应用

```typescript
// 文件操作重试
const fileRetry = Schedule.spaced("500 millis").pipe(
  Schedule.compose(Schedule.recurs(3)),
  Schedule.tap((n) => Console.log(`File operation retry #${n + 1}`))
)

// 带超时的文件读取
const safeFileRead = (path: string) =>
  Effect.try(() => fs.readFileSync(path, "utf8")).pipe(
    Effect.retry(fileRetry),
    Effect.timeout("5 seconds")
  )
```

### 10.9 Schedule 在分布式系统中的应用策略

在分布式系统中使用 Schedule 时，需要考虑分布式环境特有的挑战。首先是分布式锁与重试的结合问题。当多个节点同时执行相同的定时任务时，需要使用分布式锁来确保任务只在一个节点上执行。其次是分布式重试的幂等性问题。在分布式系统中，重试可能导致同一个操作被执行多次，因此需要确保操作是幂等的。第三是分布式重试的协调问题。当多个节点同时对同一个服务进行重试时，需要协调重试时间，避免惊群效应。

```typescript
// 分布式锁保护的重试
const distributedRetryWithLock = (lock: DistributedLock) =>
  Effect.gen(function* (_) {
    const acquired = yield* _(lock.tryAcquire())
    if (!acquired) {
      return yield* _(
        operation.pipe(
          Effect.retry(
            Schedule.spaced("1 seconds").pipe(
              Schedule.compose(Schedule.recurs(5))
            )
          )
        )
      )
    }
    try {
      return yield* _(operation)
    } finally {
      yield* _(lock.release())
    }
  })
```

### 10.10 Schedule 在微服务通信中的应用

在微服务架构中，服务间通信是最容易发生故障的环节。网络延迟、服务过载、临时不可用等问题都需要通过合理的重试策略来处理。对于不同的通信模式，需要采用不同的重试策略。

对于同步通信（如 HTTP 调用），建议使用指数退避加抖动的重试策略，并设置合理的超时时间。对于异步通信（如消息队列），建议使用固定间隔的重试策略，因为消息队列通常有内置的重试机制。对于事件驱动通信（如事件总线），建议使用快速重试策略，因为事件处理通常要求低延迟。

```typescript
// HTTP 服务调用重试
const httpRetry = Schedule.exponential("100 millis", 2.0).pipe(
  Schedule.compose(Schedule.recurs(3)),
  Schedule.jittered({ min: 0.9, max: 1.1 }),
  Schedule.modifyDelay((delay) => `${Math.min(delay, 5000)} millis`),
  Schedule.tap((n) => Console.log(`HTTP retry #${n + 1}`))
)

// 消息队列消费重试
const messageRetry = Schedule.spaced("5 seconds").pipe(
  Schedule.compose(Schedule.recurs(10)),
  Schedule.tap((n) => Console.log(`Message retry #${n + 1}`))
)
```

### 10.11 Schedule 在数据库操作中的应用

数据库操作是另一个常见的重试场景。数据库连接超时、死锁检测、主从切换等都可能导致操作失败。对于数据库操作的重试，需要特别注意事务的一致性问题。

对于读操作，重试通常是安全的，因为读操作不会修改数据。对于写操作，需要确保操作是幂等的，或者在重试前回滚事务。对于事务操作，建议在重试前重新开启事务，避免在部分提交的状态下重试。

```typescript
// 数据库读操作重试
const dbReadRetry = Schedule.spaced("200 millis").pipe(
  Schedule.compose(Schedule.recurs(3)),
  Schedule.tap((n) => Console.log(`DB read retry #${n + 1}`))
)

// 数据库写操作重试（带事务回滚）
const dbWriteWithRetry = (operation: Effect.Effect<void>) =>
  Effect.gen(function* (_) {
    const result = yield* _(
      operation.pipe(
        Effect.retry(
          Schedule.spaced("500 millis").pipe(
            Schedule.compose(Schedule.recurs(3))
          )
        )
      )
    )
    return result
  })
```

### 10.12 Schedule 在缓存策略中的应用

缓存是提高系统性能的重要手段，但缓存也引入了数据一致性的问题。Schedule 可以用于实现各种缓存策略，如缓存预热、缓存刷新、缓存过期处理等。

缓存预热是指在系统启动时，提前将热点数据加载到缓存中。可以使用 `Schedule.once` 来确保预热操作只执行一次。缓存刷新是指定期更新缓存中的数据，可以使用 `Schedule.fixed` 来实现。缓存过期处理是指在缓存过期时，异步重新加载数据，可以使用 `Schedule.spaced` 来控制重新加载的频率。

```typescript
// 缓存预热
const cacheWarmup = Effect.repeat(
  loadHotDataToCache(),
  Schedule.once
)

// 缓存刷新
const cacheRefresh = Effect.repeat(
  refreshCacheData(),
  Schedule.fixed("5 minutes").pipe(
    Schedule.compose(Schedule.recurs(1000))
  )
)

// 缓存过期处理
const cacheReload = (key: string) =>
  Effect.gen(function* (_) {
    const cached = yield* _(cache.get(key))
    if (cached === null) {
      return yield* _(
        loadFromDB(key).pipe(
          Effect.tap((data) => cache.set(key, data)),
          Effect.retry(
            Schedule.spaced("1 seconds").pipe(
              Schedule.compose(Schedule.recurs(3))
            )
          )
        )
      )
    }
    return cached
  })
```

### 10.13 Schedule 在限流与熔断中的应用

限流和熔断是保护系统不被过载的重要机制。Schedule 可以用于实现各种限流策略，如令牌桶算法、漏桶算法等。同时，Schedule 也可以与熔断器结合，实现更智能的流量控制。

令牌桶算法是一种常用的限流算法。它维护一个固定容量的令牌桶，以固定的速率向桶中添加令牌。每个请求需要消耗一个令牌，如果桶中没有令牌，请求被拒绝。使用 Schedule，我们可以实现一个基于令牌桶的限流器。

```typescript
// 基于 Schedule 的令牌桶限流器
class TokenBucket {
  private tokens: Ref.Ref<number>
  private lastRefill: Ref.Ref<number>

  constructor(
    private capacity: number,
    private refillRate: number,
    private refillInterval: Duration.Duration
  ) {
    this.tokens = Ref.make(capacity)
    this.lastRefill = Ref.make(Date.now())
  }

  // 定期补充令牌
  private refillSchedule = Schedule.fixed(this.refillInterval).pipe(
    Schedule.tap(() =>
      Ref.update(this.tokens, (t) =>
        Math.min(this.capacity, t + this.refillRate)
      )
    )
  )

  // 尝试获取令牌
  tryAcquire(): Effect.Effect<boolean> {
    return Ref.modify(this.tokens, (t) => {
      if (t > 0) {
        return [true, t - 1]
      }
      return [false, t]
    })
  }
}
```

### 10.14 Schedule 在事件驱动架构中的应用

在事件驱动架构中，事件的产生、传递和处理都需要合理的调度策略。Schedule 可以用于控制事件的产生频率、处理顺序和重试策略。

事件产生频率控制可以使用 `Schedule.spaced` 或 `Schedule.fixed` 来限制事件的发送频率，避免对下游系统造成过大压力。事件处理顺序可以使用 `Schedule.sequence` 来确保事件按特定顺序处理。事件重试策略可以使用指数退避加抖动来处理处理失败的事件。

```typescript
// 事件发送频率控制
const eventEmitter = Effect.repeat(
  sendEvent(),
  Schedule.spaced("100 millis").pipe(
    Schedule.compose(Schedule.recurs(100))
  )
)

// 事件处理重试
const eventProcessor = (event: Event) =>
  processEvent(event).pipe(
    Effect.retry(
      Schedule.exponential("1 seconds", 2.0).pipe(
        Schedule.compose(Schedule.recurs(5)),
        Schedule.jittered
      )
    )
  )
```

### 10.15 Schedule 在批处理系统中的应用

批处理系统需要定期处理大量数据，Schedule 可以用于控制批处理的执行时间、频率和并发度。

批处理任务的执行时间通常选择在业务低峰期，可以使用 `Schedule.cron` 来精确控制执行时间。批处理任务的频率取决于数据的时效性要求，可以使用 `Schedule.fixed` 来控制。批处理任务的并发度需要根据系统资源来调整，可以使用 `Schedule.spaced` 来控制任务之间的间隔。

```typescript
// 每日批处理任务
const dailyBatch = Effect.repeat(
  runBatchJob(),
  Schedule.cron("0 2 * * *") // 每天凌晨 2 点执行
)

// 批处理任务重试
const batchWithRetry = Effect.repeat(
  runBatchJob().pipe(
    Effect.retry(
      Schedule.exponential("1 minutes", 2.0).pipe(
        Schedule.compose(Schedule.recurs(3))
      )
    )
  ),
  Schedule.cron("0 2 * * *")
)
```

## 总结

本章深入探讨了 Effect-TS 的 Schedule 模块——一个将重试策略、延迟计算和定时任务抽象为可组合数据结构的强大工具。

我们从 Schedule 的设计哲学开始，理解了"调度策略即数据"这一核心思想。然后介绍了基本调度策略，包括基于次数的调度（recurs、once、forever）、基于时间的调度（fixed、spaced）、指数退避和随机抖动。

Schedule 的组合能力是其真正的威力所在。通过 compose、union、intersect 等组合操作符，我们可以将简单的调度策略组合成复杂的策略。map、flatMap、filter 等转换操作符则提供了对调度行为的精细控制。

Effect.retry 和 Effect.repeat 是 Schedule 的两个主要应用场景。retry 在 Effect 失败时重试，repeat 在 Effect 成功时重复。两者都可以与各种调度策略结合，实现复杂的重试和重复行为。

通过微服务健康检查系统的生产案例，我们展示了 Schedule 在实际工程中的应用。熔断器模式、自适应重试、分级重试等高级模式进一步扩展了 Schedule 的应用范围。

我们还探讨了 Schedule 在定时任务中的应用，包括 cron 调度、按星期/小时调度、带时区的时间调度等。Schedule 与 Stream 的结合为流式处理提供了丰富的调度能力。

在测试方面，我们学习了如何使用 TestClock 确定性测试调度策略，以及如何使用 tap、collectAll 等工具进行调试。

最后，我们总结了 Schedule 的最佳实践、常见错误和反模式，帮助你在实际项目中正确高效地使用 Schedule。

Schedule 模块是 Effect-TS 生态系统中最为精巧的设计之一。它将一个看似简单的"重试"概念提升到了前所未有的抽象层次，使得重试策略可以像其他任何数据一样被创建、组合、转换和复用。掌握 Schedule，意味着你能够以声明式、类型安全的方式处理分布式系统中的各种故障场景。

在下一章中，我们将探讨 Effect-TS 的测试模块，学习如何编写类型安全、确定性强的测试用例。

## 11. Schedule 组合子深入

### 11.1 组合子的设计哲学

Schedule 的组合子是 Effect-TS 对"组合性"这一函数式编程核心原则的完美诠释。组合子的设计哲学是：通过将简单的调度策略作为构建块,使用组合操作符将它们组合成复杂的策略,从而在保持代码简洁的同时实现强大的调度能力。

每个组合子只做一件事,但通过组合可以实现无限的可能性。例如,compose 只做"顺序组合",intersect 只做"交集",union 只做"并集"。但通过组合这些简单的组合子,可以构建出极其复杂的调度策略,如"先指数退避重试 3 次,然后固定间隔重复,最多持续 30 秒,添加 20% 抖动"。

组合子的类型安全保证了组合的正确性。Schedule 的三个类型参数(Out、In、Env)在编译期确保了组合的合法性。例如,如果两个 Schedule 的 In 类型不匹配,compose 操作会在编译期报错。这种类型安全性是传统重试库无法提供的。

组合子的惰性求值特性保证了性能。Schedule 的组合操作只是创建新的 Schedule 结构,不会立即计算延迟时间。延迟时间在实际需要时才计算,这种惰性求值使得组合操作的运行时开销极小。

### 11.2 常见组合子的使用场景

compose(顺序组合)适用于"先快速重试,后慢速检查"的场景。例如,在微服务健康检查中,先快速重试 3 次(每次间隔 1 秒),如果仍然失败,改为每 10 秒检查一次。这种策略在服务临时不可用时快速确认,在服务持续不可用时降低检查频率。

union(并集组合)适用于"或"语义的调度策略。例如,"最多重试 5 次,或者最多持续 30 秒,以先到者为准"。union 的决策逻辑是：只要两个调度中有一个决定继续,就继续执行。这种"或"语义在需要多个终止条件时非常有用。

intersect(交集组合)适用于"与"语义的调度策略。例如,"至少运行 10 秒,且最多重试 5 次"。intersect 的决策逻辑是：只有当两个调度都决定继续时,才继续执行。这种"与"语义在需要同时满足多个条件时非常有用。

### 11.3 自定义组合子

除了内置的组合子,开发者可以通过实现 Schedule 接口来创建自定义组合子。自定义组合子允许将特定业务逻辑封装为可复用的调度策略。

创建自定义组合子的基本模式是：接收一个或多个 Schedule 作为参数,返回一个新的 Schedule。新 Schedule 的决策逻辑由自定义的业务规则决定。

例如,可以实现一个"工作日调度"组合子,只在工作日执行重试。还可以实现一个"业务时间调度"组合子,只在 9:00-18:00 执行重试。这些自定义组合子可以将业务规则与调度策略分离,提高代码的可维护性和复用性。

## 12. 指数退避与随机抖动深入

### 12.1 指数退避的数学原理

指数退避的核心数学公式是：delay = baseDelay * factor^(attempt - 1)。其中,baseDelay 是初始延迟,factor 是退避因子(通常为 2),attempt 是当前重试次数(从 1 开始)。

指数退避的设计基于以下观察：临时性故障通常会在短时间内自行恢复,因此初期应该快速重试以尽快恢复服务。但如果故障持续存在,说明问题比较严重,需要给系统更多的恢复时间,因此后续重试的间隔应该越来越长。

退避因子的选择对系统行为有重要影响。因子为 2 时延迟增长较快,适用于对延迟不敏感的场景；因子为 1.5 时延迟增长较平缓,适用于需要更快重试的场景；因子为 3 时延迟增长非常快,适用于需要快速退出重试循环的场景。

最大延迟限制是指数退避的重要补充。没有最大限制的指数退避在重试次数较多时会产生不可接受的延迟。例如,基数 2.0 在第 10 次重试时延迟为 1024 秒(约 17 分钟)。因此,建议始终为指数退避设置合理的最大延迟上限。

### 12.2 随机抖动的必要性

随机抖动是防止惊群效应(Thundering Herd Problem)的关键技术。惊群效应发生在多个客户端同时重试时,如果没有抖动,它们会在完全相同的时间点发起请求,导致服务器被瞬间压垮。

随机抖动的数学原理是在计算出的延迟基础上添加随机变化。常见的抖动算法包括：全抖动(full jitter),在 0 到计算延迟之间随机选择；等比例抖动(equal jitter),在计算延迟的某个百分比范围内随机选择；以及高斯抖动,使用正态分布生成随机延迟。

抖动的范围选择需要在分散效果和延迟控制之间取得平衡。抖动范围太小,分散效果不明显；抖动范围太大,延迟可能过长。通常建议使用 20%-50% 的抖动范围,即在计算延迟的 80%-120% 或 50%-150% 之间随机选择。

在 Effect-TS 中,抖动通过 Schedule.jittered 组合子实现。jittered 接受一个配置对象,可以指定抖动的最小和最大比例。默认的最小比例为 0.8(80%),最大比例为 1.2(120%)。

### 12.3 指数退避与抖动的组合策略

指数退避与随机抖动的组合是生产环境中最常用的重试策略。组合策略的基本形式是：先用指数退避计算基础延迟,然后添加随机抖动。

这种组合策略的优势在于：指数退避保证了重试间隔的增长趋势,抖动保证了重试时间的分散性。两者结合,既避免了对系统的持续压力,又防止了惊群效应。

在实际应用中,指数退避与抖动通常还与最大延迟限制和最大重试次数限制结合使用。完整的策略包括：设置初始延迟(通常为 100ms-1s)、设置退避因子(通常为 2)、设置最大延迟(通常为 10-30s)、设置最大重试次数(通常为 3-10 次)、添加抖动(通常为 20% 范围)。

## 13. Effect.retry 深入

### 13.1 Effect.retry 的错误过滤

在 Effect.retry 中,并非所有错误都值得重试。某些错误是永久性的,如认证失败、参数校验失败、资源不存在等,对这些错误进行重试只会浪费系统资源。因此,错误过滤是 Effect.retry 的重要功能。

Effect-TS 提供了多种错误过滤方式。Effect.catchIf 允许根据错误类型或错误内容决定是否重试。Effect.retryUntil 允许指定重试的终止条件,当错误满足某个条件时停止重试。Effect.retryWhile 允许指定重试的继续条件,当错误满足某个条件时继续重试。

错误过滤的最佳实践是：为不同类型的错误定义不同的处理策略。临时性错误(如网络超时、服务不可用)应该重试,永久性错误(如认证失败、参数错误)应该立即失败。通过合理的错误过滤,可以避免不必要的重试,提高系统的效率。

### 13.2 Effect.retry 与 Effect.repeat 的协同

Effect.retry 和 Effect.repeat 可以协同使用,实现"失败时重试,成功时重复"的复杂行为。这种协同在定时任务和轮询场景中特别有用。

协同使用的基本模式是：内层使用 retry 处理失败情况,外层使用 repeat 处理成功后的重复执行。例如,一个定时拉取任务,每次拉取失败时重试 3 次(指数退避),拉取成功后等待 5 秒再次拉取。

retry 和 repeat 的协同需要注意错误传播：retry 内部发生的错误不会传播到 repeat 层,因为 retry 已经处理了这些错误。只有当 retry 耗尽重试次数后,错误才会传播到 repeat 层。在 repeat 层,错误会导致重复停止,而成功会导致重复继续。

### 13.3 Effect.retry 的内存和性能考虑

Effect.retry 的 Schedule 状态管理需要考虑内存使用。每个 retry 操作会创建 Schedule 的实例,该实例维护了内部状态(如重试次数)。如果对大量 Operation 同时使用 retry,每个 Operation 都有自己的 Schedule 状态,可能导致内存占用增加。

性能方面,Effect.retry 的 Schedule 决策开销很小,通常只有微秒级别。但需要注意的是,每次重试都涉及 Effect 的重新执行,这可能涉及 I/O 操作,开销较大。因此,重试的性能开销主要来自被重试的 Effect 本身,而非调度决策。

对于高频重试场景,建议使用缓存或短路机制来减少不必要的重试。例如,可以在内存中缓存最近失败的记录,同一资源在短时间内重复请求时直接返回缓存的结果,而不是重新发起网络请求。这种机制可以显著降低重试频率,提高系统的整体性能。

### 13.4 Effect.retry 与 Effect.repeat 的协同使用

在实际应用中,Effect.retry 和 Effect.repeat 经常需要协同使用,实现"失败时重试,成功后重复"的复杂行为。这种协同使用在定时任务和轮询场景中特别常见。例如,一个定时拉取任务需要在每次拉取失败时重试,拉取成功后等待固定间隔再次拉取。通过 retry 和 repeat 的组合,可以简洁地表达这种调度策略,同时确保类型安全和可测试性。
