# 第八章：并发原语：状态共享与消息传递

## 概述

在并发编程中，两个最根本的挑战是**状态共享**和**消息传递**。多个并发执行的计算单元（Fiber）需要安全地访问和修改共享状态，同时还需要一种可靠的方式来相互通信和协调。Effect-TS 提供了一套精心设计的并发原语——Ref、SynchronizedRef、Queue、Hub、Promise、Semaphore 和 MVar——来优雅地解决这些问题。

本章将深入探讨这些并发原语的设计原理、使用模式和最佳实践。我们将从 Ref 的原子状态更新开始，逐步深入到 SynchronizedRef 的复合操作、Queue 的生产者-消费者模型、Hub 的发布-订阅模式，以及 Promise、Semaphore 和 MVar 等高级原语，最后通过一个生产级的任务调度系统来展示这些原语如何协同工作。

## 1. Ref：不可变状态的原子更新

### 1.1 Ref 的基本概念

Ref 是 Effect-TS 中最基础的并发原语，它代表一个**可变的引用**，但提供了**不可变的接口**。这意味着你不能直接修改 Ref 内部的值，而是通过原子操作来安全地更新它。

```typescript
// 创建 Ref
const ref = Effect.runSync(Ref.make(0))

// 读取值
const value = Effect.runSync(Ref.get(ref)) // 0

// 设置值
Effect.runSync(Ref.set(ref, 42))

// 原子更新
Effect.runSync(Ref.update(ref, (n) => n + 1))
```

Ref 的核心特性是**原子性**。当多个 Fiber 同时更新同一个 Ref 时，每个更新操作都是原子的、不可分割的。这意味着你不会看到部分更新的中间状态。

### 1.2 Ref 的创建方式

Ref 提供了多种创建方式，以适应不同的使用场景：

```typescript
// Ref.make：创建一个新的 Ref，需要 Effect 上下文
const ref1: Effect.Effect<Ref.Ref<number>> = Ref.make(0)

// Ref.of：与 Ref.make 相同，创建 Ref
const ref2: Effect.Effect<Ref.Ref<number>> = Ref.of(0)

// Ref.unsafeMake：在 Effect 上下文之外创建 Ref（不推荐在函数式代码中使用）
const ref3: Ref.Ref<number> = Ref.unsafeMake(0)
```

`Ref.make` 和 `Ref.of` 是推荐的方式，它们在 Effect 上下文中创建 Ref，确保与 Effect 运行时的 Fiber 调度系统正确集成。`Ref.unsafeMake` 主要用于测试或与遗留代码集成，在纯函数式代码中应避免使用。

### 1.3 Ref 的原子操作

Ref 提供了丰富的原子操作，覆盖了各种更新模式：

**基础操作：**

```typescript
// get：读取当前值
Ref.get(ref): Effect.Effect<A>

// set：设置新值
Ref.set(ref, value): Effect.Effect<void>

// update：使用函数更新值
Ref.update(ref, f): Effect.Effect<void>
```

**更新并返回值的操作：**

```typescript
// updateAndGet：更新后返回新值
const newValue = Ref.updateAndGet(ref, (n) => n + 1)

// getAndUpdate：返回旧值，然后更新
const oldValue = Ref.getAndUpdate(ref, (n) => n + 1)

// getAndSet：返回旧值，然后设置新值
const oldValue = Ref.getAndSet(ref, 100)

// modify：使用函数修改，返回自定义结果
const [result, newValue] = Ref.modify(ref, (n) => [`old was ${n}`, n + 1] as const)
```

**条件操作：**

```typescript
// compareAndSet：比较并设置（CAS）
const success = Ref.compareAndSet(ref, oldValue, newValue)

// modifySome：条件修改
const modified = Ref.modifySome(ref, (n) => {
  if (n > 0) {
    return Option.some([n - 1, n] as const)
  }
  return Option.none()
}, 0)
```

### 1.4 Ref 的并发安全性

Ref 的原子性是通过 Effect 运行时的 Fiber 调度系统实现的。当一个 Fiber 执行 `Ref.update` 时，整个更新操作（读取-修改-写入）在一个不可中断的临界区内完成。这意味着：

1. **没有竞态条件**：两个 Fiber 同时更新 Ref 时，不会出现丢失更新的情况。
2. **没有脏读**：读取 Ref 时，总是看到一个一致的状态。
3. **没有死锁**：Ref 的操作是非阻塞的，不会导致死锁。

```typescript
// 并发递增：10 个 Fiber 各递增 100 次
const concurrentIncrement = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))

  const fibers = yield* _(Effect.forEach(
    Array.from({ length: 10 }),
    () => Effect.fork(
      Effect.replicate(100, Ref.update(ref, (n) => n + 1)).pipe(
        Effect.flatMap(() => Effect.void)
      )
    ),
    { concurrency: "unbounded" }
  ))

  yield* _(Fiber.joinAll(fibers))
  const final = yield* _(Ref.get(ref))
  console.log(final) // 总是 1000
})
```

### 1.5 Ref 与复杂数据结构

Ref 不仅可以存储基本类型，还可以存储复杂的数据结构，如 Map、Set 和 List：

```typescript
// 使用 Ref 管理 Map
const mapRef = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(new Map<string, number>()))

  // 添加元素
  yield* _(Ref.update(ref, (map) => {
    const newMap = new Map(map)
    newMap.set("key1", 1)
    return newMap
  }))

  // 读取元素
  const value = yield* _(Ref.modify(ref, (map) => {
    const v = map.get("key1") ?? 0
    return [v, map] as const
  }))
})

// 使用 Ref 管理 Set
const setRef = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(new Set<number>()))

  // 添加元素
  yield* _(Ref.update(ref, (set) => {
    const newSet = new Set(set)
    newSet.add(42)
    return newSet
  }))

  // 检查元素是否存在
  const exists = yield* _(Ref.modify(ref, (set) => {
    return [set.has(42), set] as const
  }))
})

// 使用 Ref 管理数组
const listRef = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make<number[]>([]))

  // 追加元素
  yield* _(Ref.update(ref, (list) => [...list, 1]))

  // 弹出最后一个元素
  const last = yield* _(Ref.modify(ref, (list) => {
    if (list.length === 0) return [Option.none(), list] as const
    const newList = list.slice(0, -1)
    return [Option.some(list[list.length - 1]), newList] as const
  }))
})
```

使用复杂数据结构时，需要注意每次更新都需要创建新的副本，这在数据量较大时可能带来性能开销。对于频繁更新的场景，可以考虑使用更高效的数据结构或分片策略。

### 1.6 Ref 的性能特性

Ref 的性能特性取决于其内部实现机制：

1. **读取操作（get）**：O(1) 时间复杂度，非常快。读取操作直接返回当前值的引用。
2. **写入操作（set）**：O(1) 时间复杂度，但涉及内存屏障，确保其他 Fiber 能看到最新值。
3. **更新操作（update）**：O(f) 时间复杂度，其中 f 是更新函数的复杂度。更新函数在临界区内执行。
4. **修改操作（modify）**：O(f) 时间复杂度，与 update 类似，但可以返回自定义结果。

性能建议：
- 更新函数应尽量轻量，避免在更新函数中执行耗时操作。
- 对于频繁更新的场景，考虑使用分片策略，将单个 Ref 拆分为多个 Ref。
- 对于读多写少的场景，Ref 是非常高效的选择。

### 1.7 Ref 的组合模式

Ref 可以组合使用，实现更复杂的状态管理：

```typescript
// 多个 Ref 组合
const compositeState = Effect.gen(function* (_) {
  const counter = yield* _(Ref.make(0))
  const total = yield* _(Ref.make(0))
  const max = yield* _(Ref.make(Number.MIN_SAFE_INTEGER))

  // 原子地更新多个 Ref
  const recordValue = (value: number) =>
    Effect.gen(function* (_) {
      yield* _(Ref.update(counter, (n) => n + 1))
      yield* _(Ref.update(total, (n) => n + value))
      yield* _(Ref.update(max, (n) => Math.max(n, value)))
    })

  yield* _(recordValue(10))
  yield* _(recordValue(20))
  yield* _(recordValue(5))
})
```

### 1.8 Ref 与 Effect.gen 实现状态机

Ref 与 Effect.gen 结合，可以实现复杂的状态机：

```typescript
type DoorState = "open" | "closed" | "locked"

const doorStateMachine = Effect.gen(function* (_) {
  const state = yield* _(Ref.make<DoorState>("closed"))

  const open = Effect.gen(function* (_) {
    const current = yield* _(Ref.getAndSet(state, "open"))
    if (current === "locked") {
      yield* _(Ref.set(state, "locked")) // 恢复原状态
      return Effect.fail(new Error("door is locked"))
    }
    return Effect.succeed("door opened")
  })

  const close = Effect.gen(function* (_) {
    yield* _(Ref.set(state, "closed"))
    return Effect.succeed("door closed")
  })

  const lock = Effect.gen(function* (_) {
    const current = yield* _(Ref.getAndSet(state, "locked"))
    if (current === "open") {
      yield* _(Ref.set(state, "open")) // 恢复原状态
      return Effect.fail(new Error("cannot lock an open door"))
    }
    return Effect.succeed("door locked")
  })
})
```

### 1.9 Ref 与错误处理

Ref 的操作本身不会失败，但可以在更新函数中处理错误逻辑：

```typescript
const safeUpdate = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make<number>(0))

  // 使用 Option 处理可能的失败
  const divideBy = (divisor: number) =>
    Ref.modify(ref, (current) => {
      if (divisor === 0) {
        return [Option.none(), current] as const
      }
      return [Option.some(current / divisor), current / divisor] as const
    })

  const result = yield* _(divideBy(2))
  if (Option.isSome(result)) {
    console.log(`result: ${result.value}`)
  }
})
```

### 1.10 Ref 与超时

Ref 的操作可以与超时结合，防止长时间等待：

```typescript
const refWithTimeout = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))

  // 带超时的读取
  const result = yield* _(
    Ref.get(ref).pipe(
      Effect.timeout("5 seconds"),
      Effect.catchAll((error) => {
        if (error instanceof TimeoutException) {
          return Effect.succeed(-1) // 超时默认值
        }
        return Effect.fail(error)
      })
    )
  )
})
```

### 1.11 Ref 的实际应用场景

**缓存实现：**

```typescript
class SimpleCache<K, V> {
  private ref: Ref.Ref<Map<K, { value: V; timestamp: number }>>

  constructor(private ttl: Duration.Duration) {
    this.ref = Ref.unsafeMake(new Map())
  }

  get(key: K): Effect.Effect<Option.Option<V>> {
    return Ref.modify(this.ref, (map) => {
      const entry = map.get(key)
      if (!entry) return [Option.none(), map] as const
      const now = Date.now()
      if (now - entry.timestamp > this.ttl.millis) {
        const newMap = new Map(map)
        newMap.delete(key)
        return [Option.none(), newMap] as const
      }
      return [Option.some(entry.value), map] as const
    })
  }

  set(key: K, value: V): Effect.Effect<void> {
    return Ref.update(this.ref, (map) => {
      const newMap = new Map(map)
      newMap.set(key, { value, timestamp: Date.now() })
      return newMap
    })
  }

  clear(): Effect.Effect<void> {
    return Ref.set(this.ref, new Map())
  }
}
```

**速率限制器：**

```typescript
class RateLimiter {
  private ref: Ref.Ref<{ count: number; resetAt: number }>

  constructor(private maxRequests: number, private window: Duration.Duration) {
    this.ref = Ref.unsafeMake({ count: 0, resetAt: Date.now() + this.window.millis })
  }

  acquire(): Effect.Effect<boolean> {
    return Ref.modify(this.ref, (state) => {
      const now = Date.now()
      if (now > state.resetAt) {
        // 重置窗口
        return [true, { count: 1, resetAt: now + this.window.millis }] as const
      }
      if (state.count >= this.maxRequests) {
        return [false, state] as const
      }
      return [true, { ...state, count: state.count + 1 }] as const
    })
  }
}
```

**连接池：**

```typescript
class ConnectionPool<A> {
  private ref: Ref.Ref<{
    available: A[]
    acquired: number
    maxSize: number
  }>

  constructor(maxSize: number, factory: () => A) {
    const connections = Array.from({ length: maxSize }, () => factory())
    this.ref = Ref.unsafeMake({
      available: connections,
      acquired: 0,
      maxSize,
    })
  }

  acquire(): Effect.Effect<Option.Option<A>> {
    return Ref.modify(this.ref, (state) => {
      const conn = state.available.pop()
      if (!conn) return [Option.none(), state] as const
      return [
        Option.some(conn),
        { ...state, acquired: state.acquired + 1 },
      ] as const
    })
  }

  release(conn: A): Effect.Effect<void> {
    return Ref.update(this.ref, (state) => ({
      ...state,
      available: [...state.available, conn],
      acquired: state.acquired - 1,
    }))
  }
}
```

### 1.12 Ref 的局限性

Ref 虽然强大，但也有其局限性：

1. **单个值的原子性**：Ref 只能保证单个值的原子更新。如果需要原子地更新多个相关的 Ref，需要使用 SynchronizedRef。
2. **无阻塞语义**：Ref 的操作不会阻塞。如果需要在条件不满足时等待，需要使用 Queue 或 Promise。
3. **无通知机制**：Ref 的值变化时，不会通知其他 Fiber。如果需要观察者模式，需要使用 Hub。
4. **无复合 Effect 支持**：Ref 的更新函数必须是纯函数，不能包含 Effect 操作。如果需要在更新过程中执行 Effect，需要使用 SynchronizedRef。

## 2. SynchronizedRef：复合操作的原子性

### 2.1 为什么需要 SynchronizedRef

Ref 的原子操作仅限于单个值的更新。但在实际应用中，我们经常需要执行**复合操作**——读取当前值，基于它执行一个 Effect，然后更新值。这种操作需要在整个过程中保持原子性。

```typescript
// 非原子操作：可能被中断
const nonAtomic = Effect.gen(function* (_) {
  const current = yield* _(Ref.get(ref))
  // 这里可能被其他 Fiber 中断
  const result = yield* _(someEffect(current))
  yield* _(Ref.set(ref, result))
})
```

`SynchronizedRef` 解决了这个问题。它保证在 `modifyEffect` 操作期间，没有其他 Fiber 可以修改 Ref 的值。

### 2.2 SynchronizedRef 的核心操作

```typescript
// 创建 SynchronizedRef
const ref = Effect.runSync(SynchronizedRef.make(0))

// modifyEffect：原子地执行基于当前值的 Effect
const result = SynchronizedRef.modifyEffect(ref, (current) =>
  someEffect(current).pipe(
    Effect.andThen((newValue) => [newValue, current] as const)
  )
)

// modify：原子地执行纯函数更新
const oldValue = SynchronizedRef.modify(ref, (n) => [n + 1, n] as const)
```

### 2.3 SynchronizedRef 与 Ref 的详细对比

| 特性 | Ref | SynchronizedRef |
|------|-----|-----------------|
| 原子性 | 单次操作原子 | 复合操作原子 |
| 更新函数 | 纯函数 | 纯函数或 Effect |
| 性能 | 高（无锁） | 中等（有锁） |
| 适用场景 | 简单状态更新 | 复杂状态转换 |
| 并发粒度 | 操作级别 | 事务级别 |

选择建议：
- 如果更新函数是纯函数且不需要执行 Effect，使用 Ref。
- 如果需要在更新过程中执行 Effect（如日志、网络请求、数据库操作），使用 SynchronizedRef。
- 如果需要原子地更新多个相关的状态，使用 SynchronizedRef。

### 2.4 SynchronizedRef 的实现原理

SynchronizedRef 内部使用一个**互斥锁**（Mutex）来保护对底层 Ref 的访问。当 `modifyEffect` 被调用时：

1. 获取互斥锁。
2. 读取当前值。
3. 执行 Effect 操作。
4. 更新值。
5. 释放互斥锁。

在整个过程中，其他尝试修改 SynchronizedRef 的 Fiber 会被挂起，直到锁被释放。这确保了复合操作的原子性。

```typescript
// SynchronizedRef 的简化实现
class SynchronizedRefImpl<A> {
  private ref: Ref.Ref<A>
  private mutex: Ref.Ref<boolean>

  constructor(initial: A) {
    this.ref = Ref.unsafeMake(initial)
    this.mutex = Ref.unsafeMake(false) // false = 未锁定
  }

  modifyEffect<R, E, B>(
    f: (a: A) => Effect.Effect<R, E, readonly [B, A]>
  ): Effect.Effect<R, E, B> {
    return Effect.gen(function* (_) {
      // 自旋等待获取锁
      while (true) {
        const acquired = yield* _(Ref.modify(this.mutex, (locked) => {
          if (locked) return [false, true] as const
          return [true, true] as const
        }))
        if (acquired) break
        yield* _(Effect.yieldNow()) // 让出执行权
      }

      try {
        const current = yield* _(Ref.get(this.ref))
        const [result, newValue] = yield* _(f(current))
        yield* _(Ref.set(this.ref, newValue))
        return result
      } finally {
        yield* _(Ref.set(this.mutex, false)) // 释放锁
      }
    })
  }
}
```

### 2.5 SynchronizedRef 的使用场景

**线程安全的计数器：**

```typescript
const safeCounter = SynchronizedRef.modifyEffect(ref, (current) =>
  Console.log(`incrementing from ${current}`).pipe(
    Effect.andThen([current + 1, current] as const)
  )
)
```

**状态机转换：**

```typescript
const transition = (from: State, to: State) =>
  SynchronizedRef.modifyEffect(ref, (state) => {
    if (state !== from) {
      return Effect.succeed([state, false] as const)
    }
    return someSideEffect().pipe(
      Effect.andThen([to, true] as const)
    )
  })
```

**资源管理：**

```typescript
const acquireResource = SynchronizedRef.modifyEffect(ref, (resource) => {
  if (resource.isAcquired) {
    return Effect.succeed([resource, false] as const)
  }
  return acquireActualResource().pipe(
    Effect.andThen((newResource) => [
      { ...resource, isAcquired: true, handle: newResource },
      true
    ] as const)
  )
})
```

### 2.6 SynchronizedRef 与外部 API 调用

SynchronizedRef 特别适合在原子操作中调用外部 API：

```typescript
const syncWithExternalAPI = Effect.gen(function* (_) {
  const ref = yield* _(SynchronizedRef.make<UserState>({ id: 1, version: 0 }))

  const updateUser = (newData: Partial<UserData>) =>
    SynchronizedRef.modifyEffect(ref, (state) =>
      Effect.gen(function* (_) {
        // 调用外部 API 更新用户数据
        const response = yield* _(
          apiCall(`/users/${state.id}`, {
            method: "PUT",
            body: { ...newData, version: state.version },
          })
        )

        // 更新本地状态
        const newState: UserState = {
          ...state,
          ...response.data,
          version: response.version,
        }

        return [response, newState] as const
      })
    )

  yield* _(updateUser({ name: "Alice" }))
})
```

### 2.7 SynchronizedRef 与数据库操作

SynchronizedRef 可以确保数据库操作与内存状态的一致性：

```typescript
const syncWithDatabase = Effect.gen(function* (_) {
  const ref = yield* _(SynchronizedRef.make<AccountState>({
    balance: 1000,
    version: 0,
  }))

  const transfer = (amount: number, toAccount: string) =>
    SynchronizedRef.modifyEffect(ref, (state) =>
      Effect.gen(function* (_) {
        // 检查余额
        if (state.balance < amount) {
          return [false, state] as const
        }

        // 执行数据库事务
        const result = yield* _(
          db.transaction((tx) =>
            tx.execute(
              "UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND version = $3",
              [amount, state.id, state.version]
            )
          )
        )

        if (result.rowsAffected === 0) {
          // 乐观锁失败，重试
          return [false, state] as const
        }

        // 更新内存状态
        const newState: AccountState = {
          ...state,
          balance: state.balance - amount,
          version: state.version + 1,
        }

        return [true, newState] as const
      })
    )

  yield* _(transfer(100, "account-2"))
})
```

### 2.8 SynchronizedRef 的分布式锁模拟

虽然 SynchronizedRef 是单进程的锁，但可以模拟分布式锁的行为：

```typescript
class DistributedLockSimulator {
  private ref: SynchronizedRef.SynchronizedRef<{
    locked: boolean
    owner: string | null
    acquiredAt: number | null
  }>

  constructor() {
    this.ref = SynchronizedRef.unsafeMake({
      locked: false,
      owner: null,
      acquiredAt: null,
    })
  }

  acquire(owner: string, ttl: Duration.Duration): Effect.Effect<boolean> {
    return SynchronizedRef.modifyEffect(this.ref, (state) =>
      Effect.gen(function* (_) {
        const now = Date.now()

        // 检查锁是否过期
        if (state.locked && state.acquiredAt) {
          if (now - state.acquiredAt > ttl.millis) {
            // 锁已过期，可以重新获取
            return [
              true,
              { locked: true, owner, acquiredAt: now },
            ] as const
          }
          return [false, state] as const
        }

        // 获取锁
        return [
          true,
          { locked: true, owner, acquiredAt: now },
        ] as const
      })
    )
  }

  release(owner: string): Effect.Effect<boolean> {
    return SynchronizedRef.modifyEffect(this.ref, (state) => {
      if (state.owner !== owner) {
        return Effect.succeed([false, state] as const)
      }
      return Effect.succeed([
        true,
        { locked: false, owner: null, acquiredAt: null },
      ] as const)
    })
  }
}
```

### 2.9 SynchronizedRef 的事务操作

SynchronizedRef 可以实现类似事务的语义：

```typescript
const transactionalUpdate = Effect.gen(function* (_) {
  const ref = yield* _(SynchronizedRef.make<AccountState>({
    balance: 1000,
    reserved: 0,
  }))

  const reserveAndTransfer = (amount: number) =>
    SynchronizedRef.modifyEffect(ref, (state) =>
      Effect.gen(function* (_) {
        // 阶段1：检查并预留
        const available = state.balance - state.reserved
        if (available < amount) {
          return [false, state] as const
        }

        const reservedState = {
          ...state,
          reserved: state.reserved + amount,
        }

        // 阶段2：执行外部操作
        const externalResult = yield* _(
          externalTransferService.transfer(amount).pipe(
            Effect.timeout("5 seconds"),
            Effect.catchAll(() => Effect.succeed(false))
          )
        )

        if (!externalResult) {
          // 回滚预留
          return [
            false,
            { ...state, reserved: state.reserved - amount },
          ] as const
        }

        // 阶段3：提交
        return [
          true,
          {
            balance: state.balance - amount,
            reserved: state.reserved - amount,
          },
        ] as const
      })
    )

  yield* _(reserveAndTransfer(200))
})
```

### 2.10 SynchronizedRef 的死锁预防

使用 SynchronizedRef 时，需要注意死锁问题。以下是一些预防策略：

```typescript
// 死锁场景：两个 SynchronizedRef 交叉锁定
const deadlockRisk = Effect.gen(function* (_) {
  const refA = yield* _(SynchronizedRef.make(0))
  const refB = yield* _(SynchronizedRef.make(0))

  // 危险：可能死锁
  const fiber1 = Effect.fork(
    SynchronizedRef.modifyEffect(refA, (a) =>
      SynchronizedRef.modifyEffect(refB, (b) =>
        Effect.succeed([a + b, a + b] as const)
      )
    )
  )

  const fiber2 = Effect.fork(
    SynchronizedRef.modifyEffect(refB, (b) =>
      SynchronizedRef.modifyEffect(refA, (a) =>
        Effect.succeed([a + b, a + b] as const)
      )
    )
  )
})

// 预防策略1：固定锁顺序
const safeOrder = Effect.gen(function* (_) {
  const refA = yield* _(SynchronizedRef.make(0))
  const refB = yield* _(SynchronizedRef.make(0))

  // 总是先锁 refA，再锁 refB
  const safeOperation = SynchronizedRef.modifyEffect(refA, (a) =>
    SynchronizedRef.modifyEffect(refB, (b) =>
      Effect.succeed([a + b, a + b] as const)
    )
  )
})

// 预防策略2：使用超时
const withTimeout = SynchronizedRef.modifyEffect(ref, (state) =>
  someEffect(state).pipe(Effect.timeout("10 seconds"))
)
```

### 2.11 SynchronizedRef 的性能考量

SynchronizedRef 的性能特性：

1. **锁竞争**：高并发下，锁竞争会降低性能。临界区应尽量短。
2. **上下文切换**：锁等待涉及 Fiber 的挂起和恢复，有上下文切换开销。
3. **内存屏障**：每次修改都涉及内存屏障，确保可见性。

性能优化建议：
- 尽量缩短 modifyEffect 中的 Effect 执行时间。
- 避免在临界区内执行长时间运行的 Effect。
- 考虑将 SynchronizedRef 拆分为多个更细粒度的 SynchronizedRef。
- 对于读多写少的场景，考虑使用 Ref 替代。

## 3. Queue：生产者-消费者模型

### 3.1 Queue 的基本概念

Queue 是 Effect-TS 中实现生产者-消费者模型的核心原语。它是一个**先进先出**（FIFO）的数据结构，支持多个生产者和多个消费者并发访问。

```typescript
// 创建有界队列
const bounded = Effect.runSync(Queue.bounded<number>(10))

// 创建无界队列
const unbounded = Effect.runSync(Queue.unbounded<number>())

// 创建有策略的队列
const dropping = Effect.runSync(Queue.dropping<number>(10))
const sliding = Effect.runSync(Queue.sliding<number>(10))
```

### 3.2 Queue 的核心操作

**生产操作：**

```typescript
// offer：尝试放入元素，立即返回
const offered: boolean = Queue.offer(queue, value)

// offerAll：尝试放入多个元素
const offered: Chunk<A> = Queue.offerAll(queue, values)

// 当队列满时，offer 的行为取决于队列类型：
// - bounded: 阻塞直到有空间
// - dropping: 丢弃新元素，返回 false
// - sliding: 丢弃最旧元素，返回 true
```

**消费操作：**

```typescript
// take：取出一个元素，队列为空时阻塞
const value: A = Queue.take(queue)

// takeAll：取出所有可用元素
const values: Chunk<A> = Queue.takeAll(queue)

// takeBetween：取出指定数量的元素
const values: Chunk<A> = Queue.takeBetween(queue, min, max)

// takeN：取出恰好 N 个元素（如果不足则阻塞）
const values: Chunk<A> = Queue.takeN(queue, 5)

// takeUpTo：取出最多 N 个元素（不阻塞）
const values: Chunk<A> = Queue.takeUpTo(queue, 5)

// poll：非阻塞尝试取出
const value: Option<A> = Queue.poll(queue)

// peek：查看下一个元素但不取出
const value: Option<A> = Queue.peek(queue)
```

**队列状态操作：**

```typescript
// size：获取当前队列大小
const currentSize: number = Queue.size(queue)

// isFull：检查队列是否已满
const full: boolean = Queue.isFull(queue)

// isEmpty：检查队列是否为空
const empty: boolean = Queue.isEmpty(queue)

// capacity：获取队列容量
const cap: number = Queue.capacity(queue)

// isShutdown：检查队列是否已关闭
const shutdown: boolean = Queue.isShutdown(queue)

// awaitShutdown：等待队列关闭
const wait: Effect.Effect<void> = Queue.awaitShutdown(queue)
```

### 3.3 有界队列的背压

有界队列是背压的核心机制。当队列满时，生产者会被阻塞，直到消费者取走元素。这自然地将消费者的处理速度反向传递给生产者。

```typescript
const backpressureDemo = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(3))

  // 生产者：快速生产
  const producer = Effect.fork(
    Effect.gen(function* (_) {
      for (let i = 1; i <= 10; i++) {
        yield* _(Queue.offer(queue, i))
        console.log(`produced: ${i}`)
      }
    })
  )

  // 消费者：慢速消费
  const consumer = Effect.fork(
    Effect.gen(function* (_) {
      for (let i = 1; i <= 10; i++) {
        yield* _(Effect.sleep("500 millis"))
        const value = yield* _(Queue.take(queue))
        console.log(`consumed: ${value}`)
      }
    })
  )
})
```

在这个例子中，生产者试图快速放入 10 个元素，但队列容量只有 3。当队列满时，生产者被阻塞，直到消费者取走元素。这确保了生产者不会压垮消费者。

### 3.4 队列策略详解

Effect-TS 提供了三种队列策略，每种策略适用于不同的场景：

**Bounded（有界阻塞）：**

```typescript
const bounded = Queue.bounded<number>(10)
```

- 队列满时，`offer` 阻塞。
- 适用于需要严格背压的场景。
- 确保生产者不会超过消费者的处理能力。
- 适用于数据处理管道、任务队列等需要可靠处理的场景。

**Dropping（丢弃）：**

```typescript
const dropping = Queue.dropping<number>(10)
```

- 队列满时，新元素被丢弃，`offer` 返回 `false`。
- 适用于可以容忍数据丢失的场景。
- 适用于实时指标监控，丢失几个数据点不影响整体趋势。
- 适用于日志收集，丢失部分日志不会影响系统功能。

**Sliding（滑动）：**

```typescript
const sliding = Queue.sliding<number>(10)
```

- 队列满时，最旧的元素被丢弃，新元素加入。
- 适用于需要最新数据的场景。
- 适用于实时图表显示，只需要最新的 N 个数据点。
- 适用于传感器数据采集，只需要最近的数据。

### 3.5 Queue 与 Stream 的互操作

Queue 和 Stream 可以互相转换，实现强大的数据处理管道：

```typescript
// Queue 转 Stream
const queueToStream = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(10))

  // 将 Queue 转换为 Stream
  const stream = Queue.toStream(queue)

  // 使用 Stream 操作处理消息
  const consumer = Effect.fork(
    pipe(
      stream,
      Stream.take(10),
      Stream.map((n) => n * 2),
      Stream.runForEach((n) => Console.log(`processed: ${n}`))
    )
  )

  // 生产消息
  yield* _(Queue.offer(queue, 1))
  yield* _(Queue.offer(queue, 2))
})

// Stream 转 Queue
const streamToQueue = Effect.gen(function* (_) {
  const stream = Stream.range(1, 100)
  const queue = yield* _(Stream.toQueue(stream))

  // 从 Queue 中消费
  const value = yield* _(Queue.take(queue))
})
```

### 3.6 Queue 的多生产者多消费者

Queue 天然支持多个生产者和多个消费者：

```typescript
const multiProducerMultiConsumer = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(100))

  // 多个生产者
  const producers = yield* _(Effect.forEach(
    Array.from({ length: 3 }),
    (id) => Effect.fork(
      Effect.gen(function* (_) {
        for (let i = 0; i < 10; i++) {
          yield* _(Queue.offer(queue, i))
          console.log(`producer ${id} produced: ${i}`)
        }
      })
    )
  ))

  // 多个消费者
  const consumers = yield* _(Effect.forEach(
    Array.from({ length: 2 }),
    (id) => Effect.fork(
      Effect.gen(function* (_) {
        for (let i = 0; i < 15; i++) {
          const value = yield* _(Queue.take(queue))
          console.log(`consumer ${id} consumed: ${value}`)
        }
      })
    )
  ))

  yield* _(Fiber.joinAll([...producers, ...consumers]))
})
```

### 3.7 Queue 的优先级支持

虽然 Queue 是 FIFO 的，但可以通过自定义策略实现优先级行为：

```typescript
// 使用多个队列实现优先级
class PriorityQueue<A> {
  private high: Queue.Queue<A>
  private normal: Queue.Queue<A>
  private low: Queue.Queue<A>

  constructor(capacity: number) {
    this.high = Effect.runSync(Queue.bounded<A>(capacity))
    this.normal = Effect.runSync(Queue.bounded<A>(capacity))
    this.low = Effect.runSync(Queue.bounded<A>(capacity))
  }

  offer(priority: "high" | "normal" | "low", value: A): Effect.Effect<boolean> {
    switch (priority) {
      case "high": return Queue.offer(this.high, value)
      case "normal": return Queue.offer(this.normal, value)
      case "low": return Queue.offer(this.low, value)
    }
  }

  take(): Effect.Effect<A> {
    const tryTake = (queue: Queue.Queue<A>) =>
      Queue.poll(queue).pipe(
        Effect.andThen((option) =>
          option.pipe(
            Option.match({
              onNone: () => Effect.succeed(Option.none()),
              onSome: (value) => Effect.succeed(Option.some(value)),
            })
          )
        )
      )

    return Effect.gen(function* (_) {
      // 优先消费高优先级队列
      const highResult = yield* _(tryTake(this.high))
      if (Option.isSome(highResult)) return highResult.value

      const normalResult = yield* _(tryTake(this.normal))
      if (Option.isSome(normalResult)) return normalResult.value

      const lowResult = yield* _(tryTake(this.low))
      if (Option.isSome(lowResult)) return lowResult.value

      // 所有队列都为空，阻塞等待
      return yield* _(Queue.take(this.high))
    })
  }
}
```

### 3.8 Queue 的批处理

Queue 支持批处理操作，提高吞吐量：

```typescript
const batchProcessing = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(1000))

  // 批量消费者
  const batchConsumer = Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        // 等待至少一个元素，然后取出最多 10 个
        const batch = yield* _(Queue.takeUpTo(queue, 10))
        if (batch.length === 0) {
          yield* _(Effect.sleep("100 millis"))
          continue
        }

        // 批量处理
        const results = batch.map((n) => n * 2)
        console.log(`processed batch of ${batch.length}: ${results}`)
      }
    })
  )

  // 批量生产者
  const batchProducer = Effect.fork(
    Effect.gen(function* (_) {
      const batch = Array.from({ length: 5 }, (_, i) => i + 1)
      const remaining = yield* _(Queue.offerAll(queue, Chunk.fromIterable(batch)))
      console.log(`offered ${batch.length - remaining.length} items`)
    })
  )
})
```

### 3.9 Queue 与超时

Queue 的操作可以与超时结合，防止长时间阻塞：

```typescript
const queueWithTimeout = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(10))

  // 带超时的 take
  const result = yield* _(
    Queue.take(queue).pipe(
      Effect.timeout("5 seconds"),
      Effect.catchAll((error) => {
        if (error instanceof TimeoutException) {
          return Effect.succeed(-1) // 超时默认值
        }
        return Effect.fail(error)
      })
    )
  )

  // 带超时的 offer
  const offered = yield* _(
    Queue.offer(queue, 42).pipe(
      Effect.timeout("3 seconds"),
      Effect.catchAll(() => Effect.succeed(false))
    )
  )
})
```

### 3.10 Queue 的关闭模式

Queue 的关闭是优雅停止并发系统的关键：

```typescript
const queueShutdownPatterns = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(10))

  // 模式1：关闭后，所有等待的 take 会收到 None
  const consumer1 = Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        const result = yield* _(Queue.take(queue).pipe(
          Effect.catchAllCause((cause) => {
            if (Cause.isInterrupted(cause)) {
              return Effect.succeed(Option.none())
            }
            return Effect.failCause(cause)
          })
        ))
        if (Option.isNone(result)) break
        console.log(`got: ${result.value}`)
      }
    })
  )

  // 模式2：使用 awaitShutdown 等待关闭
  const waiter = Effect.fork(
    Effect.gen(function* (_) {
      yield* _(Queue.awaitShutdown(queue))
      console.log("queue has been shut down")
    })
  )

  // 触发关闭
  yield* _(Queue.shutdown(queue))
})

// 优雅关闭模式
const gracefulShutdown = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(100))

  const worker = Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        const item = yield* _(Queue.take(queue).pipe(
          Effect.catchAllCause((cause) => {
            if (Cause.isInterrupted(cause)) {
              return Effect.succeed(Option.none())
            }
            return Effect.failCause(cause)
          })
        ))
        if (Option.isNone(item)) break
        yield* _(processItem(item.value))
      }
    })
  )

  // 发送关闭信号
  yield* _(Queue.shutdown(queue))
  yield* _(Fiber.join(worker))
})
```

### 3.11 Queue 的工作窃取

Queue 可以用于实现工作窃取模式：

```typescript
class WorkStealingPool<A> {
  private queues: Queue.Queue<A>[]
  private stolen: Ref.Ref<number>

  constructor(numWorkers: number, capacity: number) {
    this.queues = Array.from(
      { length: numWorkers },
      () => Effect.runSync(Queue.bounded<A>(capacity))
    )
    this.stolen = Ref.unsafeMake(0)
  }

  submit(workerId: number, task: A): Effect.Effect<boolean> {
    return Queue.offer(this.queues[workerId], task)
  }

  workerLogic(workerId: number): Effect.Effect<void> {
    const processTask = (task: A) => Effect.succeed(task)

    const trySteal = Effect.gen(function* (_) {
      for (let i = 0; i < this.queues.length; i++) {
        if (i === workerId) continue
        const task = yield* _(Queue.poll(this.queues[i]))
        if (Option.isSome(task)) {
          yield* _(Ref.update(this.stolen, (n) => n + 1))
          return task.value
        }
      }
      return yield* _(Effect.succeed(null))
    })

    const loop: Effect.Effect<void> = Effect.gen(function* (_) {
      while (true) {
        // 先尝试从自己的队列取
        const ownTask = yield* _(Queue.poll(this.queues[workerId]))
        if (Option.isSome(ownTask)) {
          yield* _(processTask(ownTask.value))
        } else {
          // 尝试窃取
          const stolenTask = yield* _(trySteal)
          if (stolenTask !== null) {
            yield* _(processTask(stolenTask))
          } else {
            // 所有队列都为空，阻塞等待
            yield* _(Queue.take(this.queues[workerId]))
          }
        }
      }
    })

    return loop
  }
}
```

### 3.12 Queue 的负载均衡

Queue 可以用于实现负载均衡：

```typescript
class LoadBalancer<A> {
  private queues: Queue.Queue<A>[]

  constructor(numWorkers: number, capacity: number) {
    this.queues = Array.from(
      { length: numWorkers },
      () => Effect.runSync(Queue.bounded<A>(capacity))
    )
  }

  // 轮询分发
  roundRobin(task: A, index: Ref.Ref<number>): Effect.Effect<boolean> {
    return Ref.modify(index, (i) => {
      const target = i % this.queues.length
      return [target, i + 1] as const
    }).pipe(
      Effect.flatMap((target) => Queue.offer(this.queues[target], task))
    )
  }

  // 最少连接分发
  leastLoaded(task: A): Effect.Effect<boolean> {
    return Effect.gen(function* (_) {
      const sizes = yield* _(Effect.forEach(
        this.queues,
        (q) => Queue.size(q)
      ))
      const minSize = Math.min(...sizes)
      const target = sizes.indexOf(minSize)
      return yield* _(Queue.offer(this.queues[target], task))
    })
  }
}
```

## 4. Hub：发布-订阅模式

### 4.1 Hub 的基本概念

Hub 是 Effect-TS 中实现发布-订阅模式的核心原语。它允许一个生产者向多个消费者广播消息，而生产者和消费者之间是解耦的。

```typescript
// 创建有界 Hub
const hub = Effect.runSync(Hub.bounded<number>(10))

// 创建无界 Hub
const hub = Effect.runSync(Hub.unbounded<number>())

// 创建有策略的 Hub
const droppingHub = Effect.runSync(Hub.dropping<number>(10))
const slidingHub = Effect.runSync(Hub.sliding<number>(10))
```

### 4.2 Hub 的核心操作

**订阅操作：**

```typescript
// subscribe：创建一个新的订阅，返回一个 Queue
const subscriber: Queue.Queue<number> = Hub.subscribe(hub)

// 每个订阅者都有自己的缓冲区
// 当 Hub 发布消息时，所有订阅者都能收到
```

**发布操作：**

```typescript
// publish：向所有订阅者广播消息
Hub.publish(hub, value)

// publishAll：向所有订阅者广播多个消息
Hub.publishAll(hub, values)
```

**Hub 状态操作：**

```typescript
// size：获取当前 Hub 中的消息数量
const currentSize: number = Hub.size(hub)

// capacity：获取 Hub 的容量
const cap: number = Hub.capacity(hub)

// isShutdown：检查 Hub 是否已关闭
const shutdown: boolean = Hub.isShutdown(hub)

// shutdown：关闭 Hub
Hub.shutdown(hub)
```

### 4.3 Hub 与 Queue 的关系

Hub 内部维护了一组 Queue，每个订阅者对应一个 Queue。当消息被发布到 Hub 时，它会被复制到所有订阅者的 Queue 中。

```typescript
// Hub 的内部结构
class Hub<A> {
  private subscribers: Set<Queue<A>>

  publish(value: A): Effect.Effect<void> {
    return Effect.forEach(
      this.subscribers,
      (queue) => Queue.offer(queue, value)
    )
  }

  subscribe(): Effect.Effect<Queue<A>> {
    const queue = Queue.bounded<A>(this.capacity)
    this.subscribers.add(queue)
    return queue
  }
}
```

### 4.4 Hub 与 Queue 的详细对比

| 特性 | Queue | Hub |
|------|-------|-----|
| 消息传递 | 点对点（一个消费者） | 广播（多个消费者） |
| 背压 | 统一背压 | 按订阅者独立背压 |
| 消费者关系 | 竞争消费 | 独立消费 |
| 适用场景 | 任务分发、工作池 | 事件广播、指标分发 |
| 消息语义 | 每个消息被消费一次 | 每个消息被所有订阅者消费 |

选择建议：
- 如果每个消息只需要被处理一次（如任务分发），使用 Queue。
- 如果每个消息需要被多个消费者独立处理（如事件广播），使用 Hub。
- 如果需要动态添加/移除消费者，使用 Hub。

### 4.5 Hub 的使用场景

**事件总线：**

```typescript
const eventBus = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<AppEvent>(100))

  // 创建不同类型的订阅者
  const allEvents = yield* _(Effect.fork(
    createSubscriber("all", hub, () => true)
  ))
  const errorEvents = yield* _(Effect.fork(
    createSubscriber("errors", hub, (e) => e.type === "error")
  ))

  // 发布事件
  yield* _(Hub.publish(hub, { type: "user-login", data: { userId: 1 } }))
  yield* _(Hub.publish(hub, { type: "error", data: { message: "error" } }))
})
```

**指标收集：**

```typescript
const metricsHub = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<Metric>(1000))

  // 多个指标收集器
  const consoleCollector = yield* _(Effect.fork(
    collectMetrics(hub, (m) => Console.log(m))
  ))
  const fileCollector = yield* _(Effect.fork(
    collectMetrics(hub, (m) => writeToFile(m))
  ))

  // 发布指标
  yield* _(Hub.publish(hub, { name: "cpu", value: 0.8 }))
})
```

**实时数据分发：**

```typescript
const dataDistribution = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<DataPoint>(100))

  // 动态添加订阅者
  const subscriber1 = yield* _(Hub.subscribe(hub))
  const subscriber2 = yield* _(Hub.subscribe(hub))

  // 发布数据
  yield* _(Hub.publish(hub, dataPoint))
})
```

### 4.6 Hub 的背压

Hub 的背压机制与 Queue 类似。每个订阅者都有自己的缓冲区，当某个订阅者消费速度慢时，它的缓冲区会满，从而对发布者产生背压。

```typescript
// 慢订阅者不会影响其他订阅者
const hubWithBackpressure = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<number>(5))

  // 快订阅者
  const fastSub = yield* _(Hub.subscribe(hub))
  // 慢订阅者
  const slowSub = yield* _(Hub.subscribe(hub))

  // 发布消息
  // 慢订阅者的缓冲区满时，发布者会被阻塞
  // 但快订阅者仍然可以正常接收消息
  yield* _(Hub.publish(hub, 1))
})
```

### 4.7 Hub 与动态订阅者

Hub 支持动态添加和移除订阅者：

```typescript
const dynamicSubscribers = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<Event>(100))
  const activeSubscribers = yield* _(Ref.make<Map<string, Queue.Queue<Event>>>(new Map()))

  const addSubscriber = (id: string) =>
    Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(hub))
      yield* _(Ref.update(activeSubscribers, (map) => {
        const newMap = new Map(map)
        newMap.set(id, queue)
        return newMap
      }))
      return queue
    })

  const removeSubscriber = (id: string) =>
    Effect.gen(function* (_) {
      yield* _(Ref.modify(activeSubscribers, (map) => {
        const newMap = new Map(map)
        const queue = newMap.get(id)
        if (queue) {
          // 关闭订阅者的队列
          Effect.runFork(Queue.shutdown(queue))
          newMap.delete(id)
        }
        return [queue, newMap] as const
      }))
    })

  // 动态添加订阅者
  yield* _(addSubscriber("sub-1"))
  yield* _(addSubscriber("sub-2"))

  // 发布事件
  yield* _(Hub.publish(hub, { type: "data", payload: "hello" }))

  // 移除订阅者
  yield* _(removeSubscriber("sub-1"))
})
```

### 4.8 Hub 与订阅者过滤

Hub 的订阅者可以实现过滤逻辑：

```typescript
const filteredSubscriber = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<LogEntry>(1000))

  // 创建过滤后的订阅者
  const createFilteredSubscriber = <A>(
    hub: Hub.Hub<A>,
    filter: (a: A) => boolean
  ) =>
    Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(hub))
      const filteredStream = Queue.toStream(queue).pipe(
        Stream.filter(filter)
      )
      return filteredStream
    })

  // 只接收错误级别的日志
  const errorStream = yield* _(
    createFilteredSubscriber(hub, (entry) => entry.level === "error")
  )

  // 只接收警告级别的日志
  const warnStream = yield* _(
    createFilteredSubscriber(hub, (entry) => entry.level === "warn")
  )
})
```

### 4.9 Hub 用于事件溯源

Hub 可以用于实现简单的事件溯源模式：

```typescript
class EventStore {
  private hub: Hub.Hub<DomainEvent>
  private eventLog: Ref.Ref<DomainEvent[]>

  constructor(capacity: number) {
    this.hub = Effect.runSync(Hub.bounded<DomainEvent>(capacity))
    this.eventLog = Ref.unsafeMake<DomainEvent[]>([])
  }

  append(event: DomainEvent): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      // 记录到事件日志
      yield* _(Ref.update(this.eventLog, (log) => [...log, event]))
      // 广播事件
      yield* _(Hub.publish(this.hub, event))
    })
  }

  subscribe(fromVersion: number = 0): Effect.Effect<Stream.Stream<DomainEvent>> {
    return Effect.gen(function* (_) {
      // 先重放历史事件
      const history = yield* _(Ref.get(this.eventLog))
      const historicalEvents = history.slice(fromVersion)

      // 然后订阅新事件
      const queue = yield* _(Hub.subscribe(this.hub))
      const liveStream = Queue.toStream(queue)

      // 合并历史事件和实时事件
      return Stream.merge(
        Stream.fromIterable(historicalEvents),
        liveStream
      )
    })
  }
}
```

### 4.10 Hub 用于 WebSocket 广播

Hub 非常适合实现 WebSocket 消息广播：

```typescript
class WebSocketBroadcaster {
  private hub: Hub.Hub<WebSocketMessage>

  constructor(capacity: number) {
    this.hub = Effect.runSync(Hub.bounded<WebSocketMessage>(capacity))
  }

  // 新客户端连接
  onConnect(clientId: string): Effect.Effect<Stream.Stream<WebSocketMessage>> {
    return Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(this.hub))
      return Queue.toStream(queue)
    })
  }

  // 广播消息
  broadcast(message: WebSocketMessage): Effect.Effect<void> {
    return Hub.publish(this.hub, message)
  }

  // 发送给特定客户端
  sendTo(clientId: string, message: WebSocketMessage): Effect.Effect<void> {
    // 实际实现需要维护 clientId 到 Queue 的映射
    return Hub.publish(this.hub, message)
  }
}
```

### 4.11 Hub 用于指标分发

Hub 可以高效地分发指标数据到多个收集器：

```typescript
class MetricsDistributor {
  private hub: Hub.Hub<MetricPoint>
  private aggregators: Ref.Ref<Map<string, AggregatorState>>

  constructor(capacity: number) {
    this.hub = Effect.runSync(Hub.bounded<MetricPoint>(capacity))
    this.aggregators = Ref.unsafeMake(new Map())
  }

  recordMetric(name: string, value: number, tags: Record<string, string>): Effect.Effect<void> {
    return Hub.publish(this.hub, { name, value, tags, timestamp: Date.now() })
  }

  addAggregator(name: string, window: Duration.Duration): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(this.hub))
      const stream = Queue.toStream(queue)

      const aggregator = Effect.fork(
        pipe(
          stream,
          Stream.groupByKey((m) => m.name),
          Stream.mergeGroupBy((key, stream) =>
            pipe(
              stream,
              Stream.slidingWindow(window, (values) => {
                const sum = values.reduce((acc, v) => acc + v.value, 0)
                return { metric: key, avg: sum / values.length, count: values.length }
              }),
              Stream.runForEach((result) => Console.log(result))
            )
          )
        )
      )

      yield* _(Ref.update(this.aggregators, (map) => {
        const newMap = new Map(map)
        newMap.set(name, { fiber: aggregator, queue })
        return newMap
      }))
    })
  }
}
```

## 5. 并发原语的组合使用

### 5.1 Ref + Queue：状态管理 + 消息传递

Ref 和 Queue 是最常用的组合。Ref 管理状态，Queue 传递消息：

```typescript
const statefulQueue = Effect.gen(function* (_) {
  const state = yield* _(Ref.make(0))
  const queue = yield* _(Queue.bounded<number>(10))

  // 处理消息并更新状态
  const processor = Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        const msg = yield* _(Queue.take(queue))
        yield* _(Ref.update(state, (n) => n + msg))
        const current = yield* _(Ref.get(state))
        console.log(`state after ${msg}: ${current}`)
      }
    })
  )
})
```

### 5.2 Queue + Stream：消息流处理

Queue 可以与 Stream 无缝集成，将消息队列转换为流：

```typescript
const queueToStream = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(10))

  // 将 Queue 转换为 Stream
  const stream = Queue.toStream(queue)

  // 使用 Stream 操作处理消息
  const consumer = Effect.fork(
    pipe(
      stream,
      Stream.take(10),
      Stream.map((n) => n * 2),
      Stream.runForEach((n) => Console.log(`processed: ${n}`))
    )
  )

  // 生产消息
  yield* _(Queue.offer(queue, 1))
  yield* _(Queue.offer(queue, 2))
})
```

### 5.3 Hub + Stream：事件流处理

Hub 与 Stream 结合，可以实现强大的事件流处理：

```typescript
const hubToStream = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<Event>(100))

  // 将 Hub 订阅转换为 Stream
  const eventStream = Stream.fromEffect(
    Hub.subscribe(hub).pipe(
      Effect.andThen((queue) => Queue.toStream(queue))
    )
  )

  // 使用 Stream 操作处理事件
  const consumer = Effect.fork(
    pipe(
      eventStream,
      Stream.filter((e) => e.type === "important"),
      Stream.groupByKey((e) => e.category),
      // 进一步处理
    )
  )
})
```

### 5.4 Ref + Hub：状态广播

Ref 与 Hub 结合，可以实现状态变化的实时广播：

```typescript
const stateBroadcaster = Effect.gen(function* (_) {
  const state = yield* _(Ref.make<AppState>({ count: 0, status: "idle" }))
  const stateHub = yield* _(Hub.bounded<AppState>(10))

  // 更新状态并广播
  const updateState = (newState: AppState) =>
    Effect.gen(function* (_) {
      yield* _(Ref.set(state, newState))
      yield* _(Hub.publish(stateHub, newState))
    })

  // 状态变化监听器
  const listener = Effect.fork(
    Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(stateHub))
      while (true) {
        const newState = yield* _(Queue.take(queue))
        console.log(`state changed:`, newState)
      }
    })
  )

  yield* _(updateState({ count: 1, status: "running" }))
})
```

### 5.5 Queue + Fiber：Actor 模式

Queue 与 Fiber 结合，可以实现 Actor 模式：

```typescript
type ActorMessage =
  | { type: "increment"; amount: number }
  | { type: "decrement"; amount: number }
  | { type: "getValue"; replyTo: Queue.Queue<number> }
  | { type: "reset" }

class CounterActor {
  private mailbox: Queue.Queue<ActorMessage>
  private fiber: Fiber.Fiber<void>

  constructor() {
    this.mailbox = Effect.runSync(Queue.unbounded<ActorMessage>())
    this.fiber = Effect.runFork(this.run())
  }

  private run(): Effect.Effect<void> {
    const loop = (state: number): Effect.Effect<void> =>
      Effect.gen(function* (_) {
        const message = yield* _(Queue.take(this.mailbox))
        switch (message.type) {
          case "increment":
            return yield* _(loop(state + message.amount))
          case "decrement":
            return yield* _(loop(state - message.amount))
          case "getValue":
            yield* _(Queue.offer(message.replyTo, state))
            return yield* _(loop(state))
          case "reset":
            return yield* _(loop(0))
        }
      })

    return loop(0)
  }

  increment(amount: number): Effect.Effect<void> {
    return Queue.offer(this.mailbox, { type: "increment", amount })
  }

  decrement(amount: number): Effect.Effect<void> {
    return Queue.offer(this.mailbox, { type: "decrement", amount })
  }

  getValue(): Effect.Effect<number> {
    return Effect.gen(function* (_) {
      const replyQueue = yield* _(Queue.unbounded<number>())
      yield* _(Queue.offer(this.mailbox, { type: "getValue", replyTo: replyQueue }))
      return yield* _(Queue.take(replyQueue))
    })
  }

  reset(): Effect.Effect<void> {
    return Queue.offer(this.mailbox, { type: "reset" })
  }

  shutdown(): Effect.Effect<void> {
    return Fiber.interrupt(this.fiber)
  }
}
```

### 5.6 完整的事件驱动系统

Ref、Queue、Hub 和 Stream 协同工作，构建完整的事件驱动系统：

```typescript
const complexSystem = Effect.gen(function* (_) {
  // 状态管理
  const state = yield* _(Ref.make(SystemState.initial))

  // 任务队列
  const taskQueue = yield* _(Queue.bounded<Task>(100))

  // 事件总线
  const eventHub = yield* _(Hub.bounded<Event>(1000))

  // 结果收集
  const resultQueue = yield* _(Queue.unbounded<Result>())

  // 工作池
  const workers = yield* _(startWorkers(taskQueue, resultQueue))

  // 事件监控
  const monitor = yield* _(startMonitor(eventHub, state))

  // 结果流处理
  const resultStream = Queue.toStream(resultQueue)
  const aggregator = yield* _(startAggregator(resultStream))
})
```

### 5.7 Stream + Queue 的背压管道

Stream 和 Queue 结合，构建带背压的数据处理管道：

```typescript
const backpressurePipeline = Effect.gen(function* (_) {
  const inputQueue = yield* _(Queue.bounded<number>(50))
  const outputQueue = yield* _(Queue.bounded<string>(50))

  // 阶段1：从输入队列读取，转换，写入输出队列
  const stage1 = Effect.fork(
    Queue.toStream(inputQueue).pipe(
      Stream.map((n) => `step1: ${n * 2}`),
      Stream.mapEffect((s) => Queue.offer(outputQueue, s)),
      Stream.runDrain
    )
  )

  // 阶段2：从输出队列读取，最终处理
  const stage2 = Effect.fork(
    Queue.toStream(outputQueue).pipe(
      Stream.take(100),
      Stream.runForEach((s) => Console.log(`final: ${s}`))
    )
  )

  // 生产者
  const producer = Effect.fork(
    Effect.gen(function* (_) {
      for (let i = 0; i < 100; i++) {
        yield* _(Queue.offer(inputQueue, i))
      }
    })
  )
})
```

### 5.8 Hub + Stream 的实时分析

Hub 和 Stream 结合，实现实时数据分析：

```typescript
const realtimeAnalytics = Effect.gen(function* (_) {
  const eventHub = yield* _(Hub.bounded<AnalyticsEvent>(1000))

  // 实时计算窗口统计
  const windowAnalytics = Effect.fork(
    Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(eventHub))
      yield* _(
        Queue.toStream(queue).pipe(
          Stream.groupByKey((e) => e.page),
          Stream.mergeGroupBy((page, stream) =>
            pipe(
              stream,
              Stream.slidingWindow("1 minute", (events) => ({
                page,
                count: events.length,
                uniqueUsers: new Set(events.map((e) => e.userId)).size,
                avgDuration: events.reduce((s, e) => s + e.duration, 0) / events.length,
              })),
              Stream.runForEach((stats) => Console.log(stats))
            )
          )
        )
      )
    })
  )

  // 异常检测
  const anomalyDetection = Effect.fork(
    Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(eventHub))
      yield* _(
        Queue.toStream(queue).pipe(
          Stream.filter((e) => e.duration > 10000), // 超过10秒的请求
          Stream.runForEach((anomaly) =>
            Console.log(`anomaly detected: ${JSON.stringify(anomaly)}`)
          )
        )
      )
    })
  )
})
```

## 6. 生产案例：任务调度系统

### 6.1 系统设计

我们将构建一个生产级的任务调度系统，它综合运用了本章介绍的所有并发原语：

```
                    ┌─────────────┐
                    │   Event Hub  │
                    └──────┬──────┘
                           │ 广播
    ┌──────────┐    ┌──────┴──────┐    ┌──────────┐
    │ Producer  │───>│  Task Queue  │───>│  Worker  │
    └──────────┘    └─────────────┘    └────┬─────┘
                                            │
                                    ┌───────┴───────┐
                                    │  Result Queue  │
                                    └───────┬───────┘
                                            │
                                    ┌───────┴───────┐
                                    │  Result Stream │
                                    └───────────────┘
```

### 6.2 核心组件

**TaskScheduler 类：**

```typescript
class TaskScheduler {
  private taskQueue: Queue.Queue<Task>      // 任务队列
  private resultQueue: Queue.Queue<TaskResult> // 结果队列
  private eventHub: Hub.Hub<SystemEvent>     // 事件总线
  private state: Ref.Ref<SystemState>        // 系统状态
  private workers: Ref.Ref<Fiber.Fiber<void>[]> // 工作池
}
```

### 6.3 工作池实现

工作池是系统的核心。多个 worker Fiber 从任务队列中取任务并处理：

```typescript
start(numWorkers: number): Effect.Effect<void> {
  return Effect.gen(function* (_) {
    const workerFibers = yield* _(Effect.forEach(
      Array.from({ length: numWorkers }),
      (id) => Effect.fork(this.workerLogic(id)),
      { concurrency: "unbounded" }
    ))
    yield* _(Ref.set(this.workers, workerFibers))
  })
}

private workerLogic(workerId: number): Effect.Effect<void> {
  const loop: Effect.Effect<void> = Effect.gen(function* (_) {
    while (true) {
      const task = yield* _(Queue.take(this.taskQueue))
      const result = yield* _(this.processTask(task, workerId))
      yield* _(Queue.offer(this.resultQueue, result))
    }
  })
  return loop
}
```

### 6.4 任务优先级

在任务调度系统中，不同任务可能有不同的优先级：

```typescript
type Priority = "critical" | "high" | "normal" | "low"

interface Task {
  id: string
  priority: Priority
  data: unknown
  timeout: Duration.Duration
  retryCount: number
  maxRetries: number
}

class PriorityTaskScheduler {
  private queues: Record<Priority, Queue.Queue<Task>>
  private resultQueue: Queue.Queue<TaskResult>
  private eventHub: Hub.Hub<SystemEvent>
  private state: Ref.Ref<SystemState>

  constructor() {
    this.queues = {
      critical: Effect.runSync(Queue.bounded<Task>(100)),
      high: Effect.runSync(Queue.bounded<Task>(100)),
      normal: Effect.runSync(Queue.bounded<Task>(100)),
      low: Effect.runSync(Queue.bounded<Task>(100)),
    }
    this.resultQueue = Effect.runSync(Queue.unbounded<TaskResult>())
    this.eventHub = Effect.runSync(Hub.bounded<SystemEvent>(1000))
    this.state = Ref.unsafeMake(SystemState.initial)
  }

  submit(task: Task): Effect.Effect<void> {
    return Queue.offer(this.queues[task.priority], task).pipe(
      Effect.flatMap((accepted) => {
        if (!accepted) {
          return Hub.publish(this.eventHub, {
            type: "task_rejected",
            taskId: task.id,
            reason: "queue_full",
          })
        }
        return Hub.publish(this.eventHub, {
          type: "task_submitted",
          taskId: task.id,
          priority: task.priority,
        })
      })
    )
  }

  private workerLogic(workerId: number): Effect.Effect<void> {
    const priorities: Priority[] = ["critical", "high", "normal", "low"]

    const takeNextTask = Effect.gen(function* (_) {
      for (const priority of priorities) {
        const task = yield* _(Queue.poll(this.queues[priority]))
        if (Option.isSome(task)) {
          return task.value
        }
      }
      // 所有队列都为空，阻塞等待最高优先级队列
      return yield* _(Queue.take(this.queues.critical))
    })

    const loop: Effect.Effect<void> = Effect.gen(function* (_) {
      while (true) {
        const task = yield* _(takeNextTask)
        yield* _(this.processTaskWithTimeout(task, workerId))
      }
    })

    return loop
  }
}
```

### 6.5 任务取消

支持任务取消是生产级系统的关键特性：

```typescript
class CancellableTaskScheduler {
  private taskQueue: Queue.Queue<Task>
  private cancellationRef: Ref.Ref<Set<string>>
  private eventHub: Hub.Hub<SystemEvent>

  constructor() {
    this.taskQueue = Effect.runSync(Queue.bounded<Task>(100))
    this.cancellationRef = Ref.unsafeMake(new Set<string>())
    this.eventHub = Effect.runSync(Hub.bounded<SystemEvent>(1000))
  }

  cancelTask(taskId: string): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      yield* _(Ref.update(this.cancellationRef, (set) => {
        const newSet = new Set(set)
        newSet.add(taskId)
        return newSet
      }))
      yield* _(Hub.publish(this.eventHub, {
        type: "task_cancelled",
        taskId,
      }))
    })
  }

  isCancelled(taskId: string): Effect.Effect<boolean> {
    return Ref.modify(this.cancellationRef, (set) => [
      set.has(taskId),
      set,
    ] as const)
  }

  private processTask(task: Task, workerId: number): Effect.Effect<TaskResult> {
    return Effect.gen(function* (_) {
      // 检查是否已取消
      const cancelled = yield* _(this.isCancelled(task.id))
      if (cancelled) {
        return {
          taskId: task.id,
          status: "cancelled",
          workerId,
          duration: 0,
        }
      }

      const startTime = Date.now()
      try {
        const result = yield* _(this.executeTask(task).pipe(
          Effect.timeout(task.timeout),
        ))
        return {
          taskId: task.id,
          status: "completed",
          workerId,
          duration: Date.now() - startTime,
          result,
        }
      } catch (error) {
        return {
          taskId: task.id,
          status: "failed",
          workerId,
          duration: Date.now() - startTime,
          error: String(error),
        }
      }
    })
  }
}
```

### 6.6 优雅关闭

系统关闭时，需要确保所有资源被正确释放：

```typescript
shutdown(): Effect.Effect<void> {
  return Effect.gen(function* (_) {
    yield* _(Queue.shutdown(this.taskQueue))
    yield* _(Queue.shutdown(this.resultQueue))
    yield* _(Hub.shutdown(this.eventHub))
    const workers = yield* _(Ref.get(this.workers))
    yield* _(Fiber.interruptAll(workers))
  })
}
```

### 6.7 带超时的优雅关闭

更完善的关闭策略，支持超时：

```typescript
gracefulShutdown(timeout: Duration.Duration): Effect.Effect<void> {
  return Effect.gen(function* (_) {
    // 1. 停止接受新任务
    yield* _(Queue.shutdown(this.taskQueue))

    // 2. 等待正在处理的任务完成
    yield* _(
      Queue.awaitShutdown(this.taskQueue).pipe(
        Effect.timeout(timeout),
        Effect.catchAll(() => Effect.succeed(false))
      )
    )

    // 3. 关闭结果队列
    yield* _(Queue.shutdown(this.resultQueue))

    // 4. 关闭事件总线
    yield* _(Hub.shutdown(this.eventHub))

    // 5. 中断所有 worker
    const workers = yield* _(Ref.get(this.workers))
    yield* _(Fiber.interruptAll(workers))

    // 6. 记录关闭事件
    yield* _(Console.log("system shut down gracefully"))
  })
}
```

### 6.8 错误处理与重试

生产级系统需要健壮的错误处理：

```typescript
private processTaskWithRetry(task: Task, workerId: number): Effect.Effect<TaskResult> {
  const attempt = (retryCount: number): Effect.Effect<TaskResult> =>
    Effect.gen(function* (_) {
      const startTime = Date.now()
      try {
        const result = yield* _(this.executeTask(task).pipe(
          Effect.timeout(task.timeout),
        ))
        return {
          taskId: task.id,
          status: "completed",
          workerId,
          duration: Date.now() - startTime,
          result,
          retryCount,
        }
      } catch (error) {
        if (retryCount < task.maxRetries) {
          // 指数退避
          const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
          yield* _(Effect.sleep(`${delay} millis`))
          return yield* _(attempt(retryCount + 1))
        }
        return {
          taskId: task.id,
          status: "failed",
          workerId,
          duration: Date.now() - startTime,
          error: String(error),
          retryCount,
        }
      }
    })

  return attempt(0)
}
```

### 6.9 指标收集

系统运行时的指标收集对于监控和调优至关重要：

```typescript
class MetricsCollector {
  private metrics: Ref.Ref<{
    tasksProcessed: number
    tasksFailed: number
    tasksCancelled: number
    totalDuration: number
    workerUtilization: Map<number, number>
  }>

  constructor() {
    this.metrics = Ref.unsafeMake({
      tasksProcessed: 0,
      tasksFailed: 0,
      tasksCancelled: 0,
      totalDuration: 0,
      workerUtilization: new Map(),
    })
  }

  recordResult(result: TaskResult): Effect.Effect<void> {
    return Ref.update(this.metrics, (m) => {
      const newUtilization = new Map(m.workerUtilization)
      newUtilization.set(result.workerId,
        (newUtilization.get(result.workerId) ?? 0) + result.duration
      )

      return {
        tasksProcessed: m.tasksProcessed + 1,
        tasksFailed: m.tasksFailed + (result.status === "failed" ? 1 : 0),
        tasksCancelled: m.tasksCancelled + (result.status === "cancelled" ? 1 : 0),
        totalDuration: m.totalDuration + result.duration,
        workerUtilization: newUtilization,
      }
    })
  }

  getReport(): Effect.Effect<MetricsReport> {
    return Ref.modify(this.metrics, (m) => {
      const avgDuration = m.tasksProcessed > 0
        ? m.totalDuration / m.tasksProcessed
        : 0
      const failureRate = m.tasksProcessed > 0
        ? m.tasksFailed / m.tasksProcessed
        : 0

      return [
        {
          totalTasks: m.tasksProcessed,
          failedTasks: m.tasksFailed,
          cancelledTasks: m.tasksCancelled,
          averageDuration: avgDuration,
          failureRate,
          workerUtilization: Object.fromEntries(m.workerUtilization),
        },
        m,
      ] as const
    })
  }
}
```

### 6.10 Worker 健康监控

监控 worker 的健康状态，及时发现和处理异常：

```typescript
class WorkerHealthMonitor {
  private heartbeats: Ref.Ref<Map<number, number>>
  private healthHub: Hub.Hub<HealthEvent>

  constructor() {
    this.heartbeats = Ref.unsafeMake(new Map())
    this.healthHub = Effect.runSync(Hub.bounded<HealthEvent>(100))
  }

  recordHeartbeat(workerId: number): Effect.Effect<void> {
    return Ref.set(this.heartbeats, (map) => {
      const newMap = new Map(map)
      newMap.set(workerId, Date.now())
      return newMap
    })
  }

  startMonitoring(checkInterval: Duration.Duration, timeout: Duration.Duration): Effect.Effect<void> {
    const check = Effect.gen(function* (_) {
      const now = Date.now()
      const heartbeats = yield* _(Ref.get(this.heartbeats))

      for (const [workerId, lastBeat] of heartbeats) {
        if (now - lastBeat > timeout.millis) {
          yield* _(Hub.publish(this.healthHub, {
            type: "worker_stale",
            workerId,
            lastHeartbeat: lastBeat,
          }))
        }
      }
    })

    return check.pipe(
      Effect.repeat(Schedule.fixed(checkInterval))
    )
  }

  getHealthStream(): Effect.Effect<Stream.Stream<HealthEvent>> {
    return Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(this.healthHub))
      return Queue.toStream(queue)
    })
  }
}
```

### 6.11 动态 Worker 扩缩容

根据负载动态调整 worker 数量：

```typescript
class DynamicWorkerPool {
  private taskQueue: Queue.Queue<Task>
  private workers: Ref.Ref<Fiber.Fiber<void>[]>
  private targetSize: Ref.Ref<number>
  private metrics: Ref.Ref<PoolMetrics>

  constructor(capacity: number) {
    this.taskQueue = Effect.runSync(Queue.bounded<Task>(capacity))
    this.workers = Ref.unsafeMake([])
    this.targetSize = Ref.unsafeMake(1)
    this.metrics = Ref.unsafeMake({ queueSize: 0, workerCount: 1, throughput: 0 })
  }

  scaleTo(target: number): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      yield* _(Ref.set(this.targetSize, target))
      const current = yield* _(Ref.get(this.workers))

      if (target > current.length) {
        // 扩容
        const newWorkers = yield* _(Effect.forEach(
          Array.from({ length: target - current.length }),
          (_, i) => Effect.fork(this.workerLogic(current.length + i)),
          { concurrency: "unbounded" }
        ))
        yield* _(Ref.set(this.workers, [...current, ...newWorkers]))
      } else if (target < current.length) {
        // 缩容：中断多余的 worker
        const toRemove = current.slice(target)
        const toKeep = current.slice(0, target)
        yield* _(Fiber.interruptAll(toRemove))
        yield* _(Ref.set(this.workers, toKeep))
      }
    })
  }

  autoScale(min: number, max: number, threshold: number): Effect.Effect<void> {
    const check = Effect.gen(function* (_) {
      const queueSize = yield* _(Queue.size(this.taskQueue))
      const currentSize = yield* _(Ref.get(this.targetSize))

      if (queueSize > threshold && currentSize < max) {
        yield* _(this.scaleTo(Math.min(currentSize + 1, max)))
      } else if (queueSize === 0 && currentSize > min) {
        yield* _(this.scaleTo(Math.max(currentSize - 1, min)))
      }
    })

    return check.pipe(
      Effect.repeat(Schedule.fixed("5 seconds"))
    )
  }
}
```

### 6.12 性能考量

在设计并发系统时，以下因素需要仔细考虑：

1. **队列容量**：有界队列的容量直接影响背压行为。容量太小会导致频繁阻塞，容量太大会增加内存使用。

2. **工作池大小**：worker 数量需要根据任务类型（CPU 密集型 vs IO 密集型）来调整。CPU 密集型任务的工作池大小通常不超过 CPU 核心数。

3. **Hub 缓冲区**：Hub 的缓冲区大小影响订阅者的背压行为。缓冲区太小会导致慢订阅者频繁阻塞发布者。

4. **错误处理**：在并发系统中，错误处理尤为重要。一个 worker 的失败不应该影响其他 worker。

5. **资源泄漏**：确保所有 Queue 和 Hub 在不再需要时被正确关闭，防止资源泄漏。

6. **锁粒度**：SynchronizedRef 的锁粒度影响并发性能。锁的临界区应尽量短。

7. **Fiber 数量**：过多的 Fiber 会导致调度开销增加。合理控制 Fiber 数量。

## 7. Promise：一次性同步原语

### 7.1 Promise 的基本概念

Promise 是 Effect-TS 中用于一次性同步的原语。它代表一个**将来会完成**的计算结果，可以被设置一次（成功或失败），并且可以被多个 Fiber 等待。

```typescript
// 创建 Promise
const promise: Effect.Effect<Promise.Promise<number>> = Promise.make<number>()

// 完成 Promise（成功）
Promise.succeed(promise, 42)

// 完成 Promise（失败）
Promise.fail(promise, new Error("something went wrong"))

// 等待 Promise 完成
const value: number = Promise.await(promise)
```

Promise 的核心特性是**一次性**。一个 Promise 只能被完成一次，一旦完成，它的值就不可改变。所有等待该 Promise 的 Fiber 都会收到相同的值。

### 7.2 Promise 的核心操作

```typescript
// make：创建一个新的 Promise
const promise = Promise.make<number>()

// succeed：以成功完成 Promise
Promise.succeed(promise, value): Effect.Effect<boolean>

// fail：以失败完成 Promise
Promise.fail(promise, error): Effect.Effect<boolean>

// complete：以 Effect 的结果完成 Promise
Promise.complete(promise, effect): Effect.Effect<boolean>

// await：等待 Promise 完成
Promise.await(promise): Effect.Effect<A>

// poll：非阻塞检查 Promise 是否完成
Promise.poll(promise): Effect.Effect<Option.Option<Effect.Effect<A>>>

// isDone：检查 Promise 是否已完成
Promise.isDone(promise): Effect.Effect<boolean>
```

### 7.3 Promise 与 Fiber 协调

Promise 非常适合用于 Fiber 之间的协调：

```typescript
const fiberCoordination = Effect.gen(function* (_) {
  const promise = yield* _(Promise.make<number>())

  // Fiber 1：执行计算并完成 Promise
  const fiber1 = Effect.fork(
    Effect.gen(function* (_) {
      yield* _(Effect.sleep("1 second"))
      yield* _(Promise.succeed(promise, 42))
    })
  )

  // Fiber 2：等待结果
  const fiber2 = Effect.fork(
    Effect.gen(function* (_) {
      const result = yield* _(Promise.await(promise))
      console.log(`got result: ${result}`)
    })
  )

  // Fiber 3：也等待同一个结果
  const fiber3 = Effect.fork(
    Effect.gen(function* (_) {
      const result = yield* _(Promise.await(promise))
      console.log(`also got: ${result}`)
    })
  )

  yield* _(Fiber.joinAll([fiber1, fiber2, fiber3]))
})
```

### 7.4 Promise 与超时

Promise 可以与超时结合，防止无限等待：

```typescript
const promiseWithTimeout = Effect.gen(function* (_) {
  const promise = yield* _(Promise.make<number>())

  // 带超时的等待
  const result = yield* _(
    Promise.await(promise).pipe(
      Effect.timeout("5 seconds"),
      Effect.catchAll((error) => {
        if (error instanceof TimeoutException) {
          return Effect.succeed(-1)
        }
        return Effect.fail(error)
      })
    )
  )
})
```

### 7.5 Promise 用于 RPC 模式

Promise 非常适合实现 RPC（远程过程调用）模式：

```typescript
interface RpcRequest {
  id: string
  method: string
  params: unknown
}

interface RpcResponse {
  id: string
  result: unknown
  error?: string
}

class RpcClient {
  private pending: Ref.Ref<Map<string, Promise.Promise<RpcResponse>>>
  private transport: Queue.Queue<RpcRequest>

  constructor() {
    this.pending = Ref.unsafeMake(new Map())
    this.transport = Effect.runSync(Queue.unbounded<RpcRequest>())
  }

  call(method: string, params: unknown): Effect.Effect<unknown> {
    return Effect.gen(function* (_) {
      const id = crypto.randomUUID()
      const promise = yield* _(Promise.make<RpcResponse>())

      // 注册待处理的请求
      yield* _(Ref.update(this.pending, (map) => {
        const newMap = new Map(map)
        newMap.set(id, promise)
        return newMap
      }))

      // 发送请求
      yield* _(Queue.offer(this.transport, { id, method, params }))

      // 等待响应
      const response = yield* _(Promise.await(promise))

      // 清理
      yield* _(Ref.update(this.pending, (map) => {
        const newMap = new Map(map)
        newMap.delete(id)
        return newMap
      }))

      if (response.error) {
        return yield* _(Effect.fail(new Error(response.error)))
      }
      return response.result
    })
  }

  handleResponse(response: RpcResponse): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const pending = yield* _(Ref.get(this.pending))
      const promise = pending.get(response.id)
      if (promise) {
        yield* _(Promise.succeed(promise, response))
      }
    })
  }
}
```

### 7.6 Promise 用于懒初始化

Promise 可以实现线程安全的懒初始化：

```typescript
class LazyInitializer<A> {
  private promise: Ref.Ref<Option.Option<Promise.Promise<A>>>
  private factory: () => Effect.Effect<A>

  constructor(factory: () => Effect.Effect<A>) {
    this.promise = Ref.unsafeMake(Option.none())
    this.factory = factory
  }

  get(): Effect.Effect<A> {
    return Effect.gen(function* (_) {
      // 检查是否已经初始化
      const existing = yield* _(Ref.get(this.promise))
      if (Option.isSome(existing)) {
        return yield* _(Promise.await(existing.value))
      }

      // 创建新的 Promise
      const newPromise = yield* _(Promise.make<A>())

      // 尝试设置
      const set = yield* _(Ref.modify(this.promise, (current) => {
        if (Option.isSome(current)) {
          return [false, current] as const
        }
        return [true, Option.some(newPromise)] as const
      }))

      if (!set) {
        // 另一个 Fiber 已经设置了 Promise
        const existingPromise = yield* _(Ref.get(this.promise))
        return yield* _(Promise.await(existingPromise.value))
      }

      // 执行初始化
      yield* _(Effect.gen(function* (_) {
        try {
          const value = yield* _(this.factory())
          yield* _(Promise.succeed(newPromise, value))
        } catch (error) {
          yield* _(Promise.fail(newPromise, error))
        }
      }).pipe(Effect.fork))

      return yield* _(Promise.await(newPromise))
    })
  }
}
```

### 7.7 Promise 用于屏障同步

Promise 可以实现屏障同步，等待多个 Fiber 到达某个点：

```typescript
class Barrier {
  private promise: Promise.Promise<void>
  private count: Ref.Ref<number>

  constructor(private parties: number) {
    this.promise = Effect.runSync(Promise.make<void>())
    this.count = Ref.unsafeMake(0)
  }

  await(): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const newCount = yield* _(Ref.updateAndGet(this.count, (n) => n + 1))
      if (newCount >= this.parties) {
        yield* _(Promise.succeed(this.promise, void 0))
      }
      return yield* _(Promise.await(this.promise))
    })
  }

  reset(): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      this.promise = yield* _(Promise.make<void>())
      yield* _(Ref.set(this.count, 0))
    })
  }
}

// 使用屏障
const barrierDemo = Effect.gen(function* (_) {
  const barrier = new Barrier(3)

  const fibers = yield* _(Effect.forEach(
    Array.from({ length: 3 }),
    (_, i) => Effect.fork(
      Effect.gen(function* (_) {
        console.log(`fiber ${i} working...`)
        yield* _(Effect.sleep(`${(i + 1) * 1000} millis`))
        console.log(`fiber ${i} waiting at barrier`)
        yield* _(barrier.await())
        console.log(`fiber ${i} passed barrier`)
      })
    )
  ))

  yield* _(Fiber.joinAll(fibers))
})
```

### 7.8 Promise vs Queue vs Hub

| 特性 | Promise | Queue | Hub |
|------|---------|-------|-----|
| 消息数量 | 一次 | 多次 | 多次 |
| 消费者数量 | 多个（都收到） | 一个（竞争） | 多个（都收到） |
| 阻塞语义 | 等待完成 | 等待元素 | 等待元素 |
| 适用场景 | 一次性同步 | 消息传递 | 事件广播 |

选择建议：
- 如果需要等待一个一次性结果，使用 Promise。
- 如果需要多次消息传递，使用 Queue。
- 如果需要广播给多个消费者，使用 Hub。

## 8. Semaphore：信号量

### 8.1 Semaphore 的基本概念

Semaphore 是 Effect-TS 中用于资源限制的并发原语。它维护一个许可证计数，控制同时访问某个资源的 Fiber 数量。

```typescript
// 创建 Semaphore
const semaphore: Effect.Effect<Semaphore.Semaphore> = Semaphore.make(5)

// 获取许可证并执行操作
Semaphore.withPermit(semaphore, effect)

// 获取多个许可证
Semaphore.withPermits(semaphore, 3, effect)
```

### 8.2 Semaphore 的核心操作

```typescript
// make：创建 Semaphore，指定最大许可证数量
Semaphore.make(permits: number): Effect.Effect<Semaphore.Semaphore>

// withPermit：获取一个许可证，执行 Effect，然后释放
Semaphore.withPermit(semaphore, effect): Effect.Effect<A>

// withPermits：获取多个许可证，执行 Effect，然后释放
Semaphore.withPermits(semaphore, permits, effect): Effect.Effect<A>

// available：获取当前可用的许可证数量
Semaphore.available(semaphore): Effect.Effect<number>
```

### 8.3 Semaphore 用于资源限制

Semaphore 最常见的用途是限制对有限资源的并发访问：

```typescript
const resourceLimiting = Effect.gen(function* (_) {
  const semaphore = yield* _(Semaphore.make(3)) // 最多 3 个并发

  const accessResource = (id: number) =>
    Semaphore.withPermit(semaphore,
      Effect.gen(function* (_) {
        console.log(`fiber ${id} acquired permit`)
        yield* _(Effect.sleep("1 second"))
        console.log(`fiber ${id} releasing permit`)
      })
    )

  // 启动 10 个 Fiber，但只有 3 个能同时访问资源
  const fibers = yield* _(Effect.forEach(
    Array.from({ length: 10 }),
    (_, i) => Effect.fork(accessResource(i)),
    { concurrency: "unbounded" }
  ))

  yield* _(Fiber.joinAll(fibers))
})
```

### 8.4 Semaphore 用于连接池

Semaphore 可以用于实现数据库连接池：

```typescript
class DatabaseConnectionPool {
  private semaphore: Semaphore.Semaphore
  private connections: Ref.Ref<DatabaseConnection[]>

  constructor(maxConnections: number) {
    this.semaphore = Effect.runSync(Semaphore.make(maxConnections))
    this.connections = Ref.unsafeMake(
      Array.from({ length: maxConnections }, () => createConnection())
    )
  }

  withConnection<A>(f: (conn: DatabaseConnection) => Effect.Effect<A>): Effect.Effect<A> {
    return Semaphore.withPermit(this.semaphore,
      Effect.gen(function* (_) {
        // 从池中获取连接
        const conn = yield* _(Ref.modify(this.connections, (conns) => {
          const conn = conns[0]
          const rest = conns.slice(1)
          return [conn, rest] as const
        }))

        try {
          return yield* _(f(conn))
        } finally {
          // 归还连接到池
          yield* _(Ref.update(this.connections, (conns) => [...conns, conn]))
        }
      })
    )
  }
}
```

### 8.5 Semaphore 用于速率限制

Semaphore 可以用于实现简单的速率限制：

```typescript
class RateLimiter {
  private semaphore: Semaphore.Semaphore

  constructor(maxConcurrent: number) {
    this.semaphore = Effect.runSync(Semaphore.make(maxConcurrent))
  }

  withLimit<A>(effect: Effect.Effect<A>): Effect.Effect<A> {
    return Semaphore.withPermit(this.semaphore, effect)
  }
}

// 使用示例
const rateLimitedApi = Effect.gen(function* (_) {
  const limiter = new RateLimiter(10) // 最多 10 个并发请求

  const makeRequest = (url: string) =>
    limiter.withLimit(
      Effect.gen(function* (_) {
        console.log(`requesting: ${url}`)
        return yield* _(fetch(url))
      })
    )

  // 同时发起 100 个请求，但只有 10 个会并发执行
  const results = yield* _(Effect.forEach(
    urls,
    (url) => makeRequest(url),
    { concurrency: "unbounded" }
  ))
})
```

### 8.6 Semaphore vs Queue 用于限流

| 特性 | Semaphore | Queue |
|------|-----------|-------|
| 控制粒度 | 并发数 | 缓冲区大小 |
| 背压机制 | 阻塞等待许可证 | 队列满时阻塞 |
| 适用场景 | 资源访问控制 | 任务分发 |
| 公平性 | 默认公平 | FIFO |

选择建议：
- 如果需要控制并发访问某个资源的 Fiber 数量，使用 Semaphore。
- 如果需要控制任务的生产和消费速率，使用 Queue。
- 如果需要同时控制并发数和缓冲区大小，可以组合使用两者。

### 8.7 Semaphore 的公平性

Semaphore 的默认调度是公平的，即先等待的 Fiber 先获得许可证：

```typescript
const fairSemaphore = Effect.gen(function* (_) {
  const semaphore = yield* _(Semaphore.make(1))

  // Fiber 1 先请求许可证
  const fiber1 = Effect.fork(
    Semaphore.withPermit(semaphore,
      Effect.gen(function* (_) {
        yield* _(Effect.sleep("2 seconds"))
        console.log("fiber 1 done")
      })
    )
  )

  yield* _(Effect.sleep("100 millis"))

  // Fiber 2 后请求许可证
  const fiber2 = Effect.fork(
    Semaphore.withPermit(semaphore,
      Effect.gen(function* (_) {
        console.log("fiber 2 done")
      })
    )
  )

  // Fiber 2 会等待 Fiber 1 释放许可证后才执行
  yield* _(Fiber.joinAll([fiber1, fiber2]))
})
```

### 8.8 Semaphore 与数据库连接池

Semaphore 特别适合实现数据库连接池的并发控制：

```typescript
class PostgresConnectionPool {
  private semaphore: Semaphore.Semaphore
  private connections: Queue.Queue<PooledConnection>
  private metrics: Ref.Ref<PoolMetrics>

  constructor(
    private maxConnections: number,
    private connectionString: string
  ) {
    this.semaphore = Effect.runSync(Semaphore.make(maxConnections))
    this.connections = Effect.runSync(Queue.bounded<PooledConnection>(maxConnections))
    this.metrics = Ref.unsafeMake({
      activeConnections: 0,
      waitingRequests: 0,
      totalRequests: 0,
    })
  }

  initialize(): Effect.Effect<void> {
    return Effect.forEach(
      Array.from({ length: this.maxConnections }),
      () => Effect.gen(function* (_) {
        const conn = yield* _(createConnection(this.connectionString))
        yield* _(Queue.offer(this.connections, conn))
      }),
      { concurrency: "unbounded" }
    )
  }

  withConnection<A>(f: (conn: PooledConnection) => Effect.Effect<A>): Effect.Effect<A> {
    return Effect.gen(function* (_) {
      yield* _(Ref.update(this.metrics, (m) => ({
        ...m,
        waitingRequests: m.waitingRequests + 1,
      })))

      const result = yield* _(
        Semaphore.withPermit(this.semaphore,
          Effect.gen(function* (_) {
            yield* _(Ref.update(this.metrics, (m) => ({
              ...m,
              waitingRequests: m.waitingRequests - 1,
              activeConnections: m.activeConnections + 1,
              totalRequests: m.totalRequests + 1,
            })))

            const conn = yield* _(Queue.take(this.connections))
            try {
              return yield* _(f(conn))
            } finally {
              yield* _(Queue.offer(this.connections, conn))
              yield* _(Ref.update(this.metrics, (m) => ({
                ...m,
                activeConnections: m.activeConnections - 1,
              })))
            }
          })
        )
      )

      return result
    })
  }

  getMetrics(): Effect.Effect<PoolMetrics> {
    return Ref.get(this.metrics)
  }
}
```

## 9. MVar：同步单值容器

### 9.1 MVar 的基本概念

MVar 是 Effect-TS 中一个特殊的并发原语，代表一个**可变的、可以为空的单值容器**。它类似于一个容量为 1 的 Queue，但提供了更丰富的同步语义。

```typescript
// 创建空的 MVar
const emptyMVar: Effect.Effect<MVar.MVar<number>> = MVar.empty<number>()

// 创建有值的 MVar
const fullMVar: Effect.Effect<MVar.MVar<number>> = MVar.of(42)
```

MVar 的核心特性：
1. **单值容器**：最多容纳一个值。
2. **阻塞语义**：取空 MVar 会阻塞，放满 MVar 会阻塞。
3. **同步原语**：用于 Fiber 之间的同步和通信。

### 9.2 MVar 的核心操作

```typescript
// empty：创建空的 MVar
MVar.empty<A>(): Effect.Effect<MVar.MVar<A>>

// of：创建有值的 MVar
MVar.of(value: A): Effect.Effect<MVar.MVar<A>>

// put：放入值（如果已满则阻塞）
MVar.put(mvar, value): Effect.Effect<void>

// take：取出值（如果为空则阻塞）
MVar.take(mvar): Effect.Effect<A>

// tryPut：尝试放入值（非阻塞）
MVar.tryPut(mvar, value): Effect.Effect<boolean>

// tryTake：尝试取出值（非阻塞）
MVar.tryTake(mvar): Effect.Effect<Option.Option<A>>

// isEmpty：检查 MVar 是否为空
MVar.isEmpty(mvar): Effect.Effect<boolean>
```

### 9.3 MVar 用于一次性通信

MVar 非常适合 Fiber 之间的一次性通信：

```typescript
const oneShotCommunication = Effect.gen(function* (_) {
  const mvar = yield* _(MVar.empty<number>())

  // 生产者
  const producer = Effect.fork(
    Effect.gen(function* (_) {
      yield* _(Effect.sleep("1 second"))
      yield* _(MVar.put(mvar, 42))
      console.log("produced value")
    })
  )

  // 消费者
  const consumer = Effect.fork(
    Effect.gen(function* (_) {
      const value = yield* _(MVar.take(mvar))
      console.log(`consumed: ${value}`)
    })
  )

  yield* _(Fiber.joinAll([producer, consumer]))
})
```

### 9.4 MVar 用于资源交接

MVar 可以实现安全的资源交接：

```typescript
class ResourceHandoff<A> {
  private mvar: Effect.Effect<MVar.MVar<A>>

  constructor() {
    this.mvar = MVar.empty<A>()
  }

  handoff(resource: A): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const mvar = yield* _(this.mvar)
      yield* _(MVar.put(mvar, resource))
    })
  }

  receive(): Effect.Effect<A> {
    return Effect.gen(function* (_) {
      const mvar = yield* _(this.mvar)
      return yield* _(MVar.take(mvar))
    })
  }
}

// 使用示例
const resourceHandoffDemo = Effect.gen(function* (_) {
  const handoff = new ResourceHandoff<Buffer>()

  // 生产者：处理数据后交接
  const producer = Effect.fork(
    Effect.gen(function* (_) {
      const data = yield* _(readFile("input.txt"))
      const processed = processData(data)
      yield* _(handoff.handoff(processed))
      console.log("handed off processed data")
    })
  )

  // 消费者：接收数据并写入
  const consumer = Effect.fork(
    Effect.gen(function* (_) {
      const data = yield* _(handoff.receive())
      yield* _(writeFile("output.txt", data))
      console.log("received and wrote data")
    })
  )

  yield* _(Fiber.joinAll([producer, consumer]))
})
```

### 9.5 MVar 用于生产者-消费者（单槽）

MVar 可以实现单槽的生产者-消费者模式：

```typescript
const singleSlotProducerConsumer = Effect.gen(function* (_) {
  const mvar = yield* _(MVar.empty<number>())

  const producer = Effect.fork(
    Effect.gen(function* (_) {
      for (let i = 0; i < 5; i++) {
        yield* _(MVar.put(mvar, i))
        console.log(`produced: ${i}`)
      }
    })
  )

  const consumer = Effect.fork(
    Effect.gen(function* (_) {
      for (let i = 0; i < 5; i++) {
        const value = yield* _(MVar.take(mvar))
        console.log(`consumed: ${value}`)
        yield* _(Effect.sleep("500 millis"))
      }
    })
  )

  yield* _(Fiber.joinAll([producer, consumer]))
})
```

### 9.6 MVar vs Ref vs Queue

| 特性 | MVar | Ref | Queue |
|------|------|-----|-------|
| 容量 | 0 或 1 | 始终有值 | 可配置 |
| 阻塞语义 | put/take 阻塞 | 不阻塞 | offer/take 可阻塞 |
| 空状态 | 支持 | 不支持 | 支持 |
| 适用场景 | 同步、交接 | 状态管理 | 消息传递 |

选择建议：
- 如果需要 Fiber 之间的同步和一次性交接，使用 MVar。
- 如果需要管理可变状态，使用 Ref。
- 如果需要消息队列，使用 Queue。

## 10. 并发模式与最佳实践

### 10.1 Actor 模式

Actor 模式将状态封装在独立的 Actor 中，通过消息传递进行通信：

```typescript
type BankMessage =
  | { type: "deposit"; amount: number; replyTo: Queue.Queue<number> }
  | { type: "withdraw"; amount: number; replyTo: Queue.Queue<boolean> }
  | { type: "balance"; replyTo: Queue.Queue<number> }

class BankAccountActor {
  private mailbox: Queue.Queue<BankMessage>
  private fiber: Fiber.Fiber<void>

  constructor(initialBalance: number) {
    this.mailbox = Effect.runSync(Queue.unbounded<BankMessage>())
    this.fiber = Effect.runFork(this.run(initialBalance))
  }

  private run(balance: number): Effect.Effect<void> {
    const process = (msg: BankMessage): Effect.Effect<number> => {
      switch (msg.type) {
        case "deposit":
          return Effect.succeed(balance + msg.amount)
        case "withdraw":
          if (balance >= msg.amount) {
            return Effect.succeed(balance - msg.amount)
          }
          return Effect.succeed(balance)
        case "balance":
          return Effect.succeed(balance)
      }
    }

    const loop = (currentBalance: number): Effect.Effect<void> =>
      Effect.gen(function* (_) {
        const msg = yield* _(Queue.take(this.mailbox))
        const newBalance = yield* _(process(msg))

        // 发送回复
        switch (msg.type) {
          case "deposit":
            yield* _(Queue.offer(msg.replyTo, newBalance))
            break
          case "withdraw":
            yield* _(Queue.offer(msg.replyTo, newBalance !== currentBalance))
            break
          case "balance":
            yield* _(Queue.offer(msg.replyTo, currentBalance))
            break
        }

        return yield* _(loop(newBalance))
      })

    return loop(balance)
  }

  deposit(amount: number): Effect.Effect<number> {
    return Effect.gen(function* (_) {
      const replyTo = yield* _(Queue.unbounded<number>())
      yield* _(Queue.offer(this.mailbox, { type: "deposit", amount, replyTo }))
      return yield* _(Queue.take(replyTo))
    })
  }

  withdraw(amount: number): Effect.Effect<boolean> {
    return Effect.gen(function* (_) {
      const replyTo = yield* _(Queue.unbounded<boolean>())
      yield* _(Queue.offer(this.mailbox, { type: "withdraw", amount, replyTo }))
      return yield* _(Queue.take(replyTo))
    })
  }

  getBalance(): Effect.Effect<number> {
    return Effect.gen(function* (_) {
      const replyTo = yield* _(Queue.unbounded<number>())
      yield* _(Queue.offer(this.mailbox, { type: "balance", replyTo }))
      return yield* _(Queue.take(replyTo))
    })
  }

  shutdown(): Effect.Effect<void> {
    return Fiber.interrupt(this.fiber)
  }
}
```

### 10.2 Supervisor 模式

Supervisor 模式监控子 Fiber 的状态，在失败时重启：

```typescript
class Supervisor {
  private children: Ref.Ref<Map<string, Fiber.Fiber<any, any>>>
  private restartPolicy: Ref.Ref<Map<string, number>>

  constructor() {
    this.children = Ref.unsafeMake(new Map())
    this.restartPolicy = Ref.unsafeMake(new Map())
  }

  supervise<A, E>(
    name: string,
    effect: Effect.Effect<A, E>,
    maxRestarts: number = 3
  ): Effect.Effect<Fiber.Fiber<A, E>> {
    return Effect.gen(function* (_) {
      const startFiber = () =>
        Effect.fork(
          effect.pipe(
            Effect.catchAllCause((cause) =>
              Effect.gen(function* (_) {
                const restarts = yield* _(Ref.modify(
                  this.restartPolicy,
                  (map) => {
                    const count = (map.get(name) ?? 0) + 1
                    const newMap = new Map(map)
                    newMap.set(name, count)
                    return [count, newMap] as const
                  }
                ))

                if (restarts <= maxRestarts) {
                  console.log(`restarting ${name} (attempt ${restarts})`)
                  return yield* _(startFiber())
                }

                console.log(`${name} failed permanently`)
                return yield* _(Effect.failCause(cause))
              })
            )
          )
        )

      const fiber = yield* _(startFiber())
      yield* _(Ref.update(this.children, (map) => {
        const newMap = new Map(map)
        newMap.set(name, fiber)
        return newMap
      }))

      return fiber
    })
  }

  getChildren(): Effect.Effect<Map<string, Fiber.Fiber<any, any>>> {
    return Ref.get(this.children)
  }
}
```

### 10.3 发布-订阅模式

使用 Hub 实现完整的发布-订阅系统：

```typescript
class PubSubSystem<A> {
  private hub: Hub.Hub<A>
  private subscribers: Ref.Ref<Map<string, { queue: Queue.Queue<A>; filter: (a: A) => boolean }>>

  constructor(capacity: number) {
    this.hub = Effect.runSync(Hub.bounded<A>(capacity))
    this.subscribers = Ref.unsafeMake(new Map())
  }

  subscribe(id: string, filter: (a: A) => boolean = () => true): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(this.hub))
      yield* _(Ref.update(this.subscribers, (map) => {
        const newMap = new Map(map)
        newMap.set(id, { queue, filter })
        return newMap
      }))
    })
  }

  unsubscribe(id: string): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      yield* _(Ref.modify(this.subscribers, (map) => {
        const entry = map.get(id)
        if (entry) {
          Effect.runFork(Queue.shutdown(entry.queue))
        }
        const newMap = new Map(map)
        newMap.delete(id)
        return [entry, newMap] as const
      }))
    })
  }

  publish(value: A): Effect.Effect<void> {
    return Hub.publish(this.hub, value)
  }

  getSubscriberStream(id: string): Effect.Effect<Option.Option<Stream.Stream<A>>> {
    return Effect.gen(function* (_) {
      const subscribers = yield* _(Ref.get(this.subscribers))
      const entry = subscribers.get(id)
      if (!entry) return Option.none()

      const filteredStream = Queue.toStream(entry.queue).pipe(
        Stream.filter(entry.filter)
      )
      return Option.some(filteredStream)
    })
  }
}
```

### 10.4 工作池模式

使用 Queue 和 Fiber 实现可伸缩的工作池：

```typescript
class WorkPool<A, B> {
  private inputQueue: Queue.Queue<A>
  private outputQueue: Queue.Queue<B>
  private workers: Ref.Ref<Fiber.Fiber<void>[]>

  constructor(
    capacity: number,
    private workerFn: (input: A) => Effect.Effect<B>,
    numWorkers: number
  ) {
    this.inputQueue = Effect.runSync(Queue.bounded<A>(capacity))
    this.outputQueue = Effect.runSync(Queue.unbounded<B>())
    this.workers = Ref.unsafeMake([])
    this.startWorkers(numWorkers)
  }

  private startWorkers(numWorkers: number): void {
    const workerLogic = Effect.gen(function* (_) {
      while (true) {
        const input = yield* _(Queue.take(this.inputQueue))
        const output = yield* _(this.workerFn(input))
        yield* _(Queue.offer(this.outputQueue, output))
      }
    })

    const fibers = Array.from(
      { length: numWorkers },
      () => Effect.runFork(workerLogic)
    )
    this.workers = Ref.unsafeMake(fibers)
  }

  submit(input: A): Effect.Effect<boolean> {
    return Queue.offer(this.inputQueue, input)
  }

  results(): Stream.Stream<B> {
    return Queue.toStream(this.outputQueue)
  }

  shutdown(): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      yield* _(Queue.shutdown(this.inputQueue))
      yield* _(Queue.shutdown(this.outputQueue))
      const workers = yield* _(Ref.get(this.workers))
      yield* _(Fiber.interruptAll(workers))
    })
  }
}
```

### 10.5 管道模式

使用多个 Queue 构建处理管道：

```typescript
class ProcessingPipeline<A, B, C> {
  private stage1Queue: Queue.Queue<A>
  private stage2Queue: Queue.Queue<B>
  private outputQueue: Queue.Queue<C>

  constructor(
    capacity: number,
    stage1: (input: A) => Effect.Effect<B>,
    stage2: (input: B) => Effect.Effect<C>
  ) {
    this.stage1Queue = Effect.runSync(Queue.bounded<A>(capacity))
    this.stage2Queue = Effect.runSync(Queue.bounded<B>(capacity))
    this.outputQueue = Effect.runSync(Queue.unbounded<C>())

    // 启动管道阶段
    Effect.runFork(this.runStage(stage1, this.stage1Queue, this.stage2Queue))
    Effect.runFork(this.runStage(stage2, this.stage2Queue, this.outputQueue))
  }

  private runStage<X, Y>(
    fn: (input: X) => Effect.Effect<Y>,
    input: Queue.Queue<X>,
    output: Queue.Queue<Y>
  ): Effect.Effect<void> {
    return Queue.toStream(input).pipe(
      Stream.mapEffect((x) => fn(x)),
      Stream.mapEffect((y) => Queue.offer(output, y)),
      Stream.runDrain
    )
  }

  submit(input: A): Effect.Effect<boolean> {
    return Queue.offer(this.stage1Queue, input)
  }

  results(): Stream.Stream<C> {
    return Queue.toStream(this.outputQueue)
  }
}
```

### 10.6 状态机模式

使用 Ref 和 Schedule 实现状态机：

```typescript
type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting"

class ConnectionStateMachine {
  private state: Ref.Ref<ConnectionState>
  private transitions: Ref.Ref<number>

  constructor() {
    this.state = Ref.unsafeMake<ConnectionState>("disconnected")
    this.transitions = Ref.unsafeMake(0)
  }

  connect(): Effect.Effect<boolean> {
    return Effect.gen(function* (_) {
      const current = yield* _(Ref.get(this.state))
      if (current !== "disconnected") return false

      yield* _(Ref.set(this.state, "connecting"))
      yield* _(Ref.update(this.transitions, (n) => n + 1))

      // 模拟连接
      yield* _(Effect.sleep("1 second"))
      yield* _(Ref.set(this.state, "connected"))
      return true
    })
  }

  disconnect(): Effect.Effect<boolean> {
    return Effect.gen(function* (_) {
      const current = yield* _(Ref.get(this.state))
      if (current !== "connected") return false

      yield* _(Ref.set(this.state, "disconnected"))
      return true
    })
  }

  reconnect(): Effect.Effect<void> {
    const policy = Schedule.exponential("1 second").pipe(
      Schedule.whileInput((state: ConnectionState) => state !== "connected"),
      Schedule.intersect(Schedule.recurs(5))
    )

    return Effect.gen(function* (_) {
      yield* _(Ref.set(this.state, "reconnecting"))

      const attempt = Effect.gen(function* (_) {
        yield* _(this.connect())
        return yield* _(Ref.get(this.state))
      })

      yield* _(
        attempt.pipe(
          Effect.retry(policy),
          Effect.catchAll(() => Effect.succeed(false))
        )
      )
    })
  }

  getState(): Effect.Effect<ConnectionState> {
    return Ref.get(this.state)
  }
}
```

### 10.7 资源池模式

使用 Semaphore 和 Ref 实现资源池：

```typescript
class ResourcePool<A> {
  private semaphore: Semaphore.Semaphore
  private resources: Ref.Ref<A[]>
  private factory: () => Effect.Effect<A>
  private destroy: (a: A) => Effect.Effect<void>

  constructor(
    size: number,
    factory: () => Effect.Effect<A>,
    destroy: (a: A) => Effect.Effect<void>
  ) {
    this.semaphore = Effect.runSync(Semaphore.make(size))
    this.resources = Ref.unsafeMake<A[]>([])
    this.factory = factory
    this.destroy = destroy
  }

  initialize(): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const resources = yield* _(Effect.forEach(
        Array.from({ length: 5 }),
        () => this.factory(),
        { concurrency: "unbounded" }
      ))
      yield* _(Ref.set(this.resources, resources))
    })
  }

  use<B>(f: (a: A) => Effect.Effect<B>): Effect.Effect<B> {
    return Semaphore.withPermit(this.semaphore,
      Effect.gen(function* (_) {
        const resource = yield* _(Ref.modify(this.resources, (resources) => {
          const [head, ...tail] = resources
          return [head, tail] as const
        }))

        try {
          return yield* _(f(resource))
        } finally {
          yield* _(Ref.update(this.resources, (resources) => [...resources, resource]))
        }
      })
    )
  }

  shutdown(): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const resources = yield* _(Ref.get(this.resources))
      yield* _(Effect.forEach(
        resources,
        (r) => this.destroy(r),
        { concurrency: "unbounded" }
      ))
      yield* _(Ref.set(this.resources, []))
    })
  }
}
```

### 10.8 常见陷阱

**死锁：**

```typescript
// 死锁示例：两个 SynchronizedRef 交叉锁定
const deadlockExample = Effect.gen(function* (_) {
  const refA = yield* _(SynchronizedRef.make(0))
  const refB = yield* _(SynchronizedRef.make(0))

  // Fiber 1：锁 A，然后锁 B
  const fiber1 = Effect.fork(
    SynchronizedRef.modifyEffect(refA, (a) =>
      SynchronizedRef.modifyEffect(refB, (b) =>
        Effect.succeed([a + b, a + b] as const)
      )
    )
  )

  // Fiber 2：锁 B，然后锁 A
  const fiber2 = Effect.fork(
    SynchronizedRef.modifyEffect(refB, (b) =>
      SynchronizedRef.modifyEffect(refA, (a) =>
        Effect.succeed([a + b, a + b] as const)
      )
    )
  )

  // 可能死锁！
  yield* _(Fiber.joinAll([fiber1, fiber2]))
})

// 预防：固定锁顺序
const safeLocking = Effect.gen(function* (_) {
  const refA = yield* _(SynchronizedRef.make(0))
  const refB = yield* _(SynchronizedRef.make(0))

  // 总是按相同顺序获取锁
  const safeOperation = SynchronizedRef.modifyEffect(refA, (a) =>
    SynchronizedRef.modifyEffect(refB, (b) =>
      Effect.succeed([a + b, a + b] as const)
    )
  )
})
```

**活锁：**

```typescript
// 活锁示例：两个 Fiber 互相让步
const livelockExample = Effect.gen(function* (_) {
  const refA = yield* _(Ref.make(false))
  const refB = yield* _(Ref.make(false))

  const fiber1 = Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        yield* _(Ref.set(refA, true))
        const b = yield* _(Ref.get(refB))
        if (!b) {
          // 执行操作
          break
        }
        yield* _(Ref.set(refA, false))
        yield* _(Effect.yieldNow())
      }
    })
  )

  const fiber2 = Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        yield* _(Ref.set(refB, true))
        const a = yield* _(Ref.get(refA))
        if (!a) {
          // 执行操作
          break
        }
        yield* _(Ref.set(refB, false))
        yield* _(Effect.yieldNow())
      }
    })
  )
})

// 预防：引入随机延迟
const withRandomDelay = Effect.gen(function* (_) {
  const refA = yield* _(Ref.make(false))
  const refB = yield* _(Ref.make(false))

  const fiber1 = Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        yield* _(Ref.set(refA, true))
        const b = yield* _(Ref.get(refB))
        if (!b) break
        yield* _(Ref.set(refA, false))
        yield* _(Effect.sleep(`${Math.random() * 100} millis`))
      }
    })
  )
})
```

**Fiber 泄漏：**

```typescript
// Fiber 泄漏示例
const fiberLeak = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))

  // 每次调用都创建新的 Fiber，但不跟踪
  const increment = () =>
    Effect.fork(
      Ref.update(ref, (n) => n + 1)
    )

  // 多次调用导致大量 Fiber 泄漏
  yield* _(increment())
  yield* _(increment())
  yield* _(increment())
})

// 预防：跟踪 Fiber
const safeFiberManagement = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))
  const fibers = yield* _(Ref.make<Fiber.Fiber<void>[]>([]))

  const increment = () =>
    Effect.gen(function* (_) {
      const fiber = yield* _(Effect.fork(Ref.update(ref, (n) => n + 1)))
      yield* _(Ref.update(fibers, (f) => [...f, fiber]))
    })

  yield* _(increment())
  yield* _(increment())

  // 清理
  const allFibers = yield* _(Ref.get(fibers))
  yield* _(Fiber.interruptAll(allFibers))
})
```

### 10.9 测试并发代码

测试并发代码需要特殊的策略：

```typescript
// 使用 TestClock 控制时间
const testConcurrentCode = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(3))

  const producer = Effect.fork(
    Effect.gen(function* (_) {
      for (let i = 0; i < 5; i++) {
        yield* _(Queue.offer(queue, i))
      }
    })
  )

  const consumer = Effect.fork(
    Effect.gen(function* (_) {
      const results: number[] = []
      for (let i = 0; i < 5; i++) {
        const value = yield* _(Queue.take(queue))
        results.push(value)
      }
      return results
    })
  )

  yield* _(Fiber.joinAll([producer, consumer]))
})

// 使用 Fiber 的 join 等待结果
const testWithAssertions = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))

  const fibers = yield* _(Effect.forEach(
    Array.from({ length: 10 }),
    () => Effect.fork(Ref.update(ref, (n) => n + 1)),
    { concurrency: "unbounded" }
  ))

  yield* _(Fiber.joinAll(fibers))
  const result = yield* _(Ref.get(ref))

  // 断言
  if (result !== 10) {
    return yield* _(Effect.fail(new Error(`expected 10, got ${result}`)))
  }
  return Effect.succeed(result)
})
```

### 10.10 性能调优指南

1. **选择合适的队列类型**：
   - 有界队列：需要背压时使用。
   - 无界队列：生产者远快于消费者时使用（注意内存）。
   - 滑动队列：只需要最新数据时使用。
   - 丢弃队列：可以容忍数据丢失时使用。

2. **合理设置队列容量**：
   - 容量太小：频繁阻塞，降低吞吐量。
   - 容量太大：增加内存使用，延迟增加。
   - 经验公式：容量 = 预期并发数 * 平均处理时间 / 平均到达间隔。

3. **优化 Fiber 数量**：
   - CPU 密集型：Fiber 数 <= CPU 核心数。
   - IO 密集型：Fiber 数可以远大于 CPU 核心数。
   - 混合型：根据实际负载测试确定。

4. **减少锁竞争**：
   - 使用更细粒度的锁。
   - 减少临界区大小。
   - 使用读写锁（如果适用）。

5. **避免不必要的同步**：
   - 使用局部变量减少 Ref 访问。
   - 批量更新减少 Queue 操作。
   - 使用 Stream 的批处理操作。

6. **监控和诊断**：
   - 使用 Fiber 的 dump 功能查看 Fiber 状态。
   - 监控 Queue 和 Hub 的大小变化。
   - 记录关键操作的耗时。

## 总结

本章深入探讨了 Effect-TS 的七个核心并发原语：Ref、SynchronizedRef、Queue、Hub、Promise、Semaphore 和 MVar。

Ref 提供了不可变状态的原子更新，是构建并发安全状态的基础。SynchronizedRef 在 Ref 的基础上增加了复合操作的原子性，使得读取-修改-写入的完整操作序列不可中断。Queue 实现了生产者-消费者模型，通过有界队列的背压机制自然地协调了生产者和消费者的速度。Hub 实现了发布-订阅模式，允许一个生产者向多个消费者广播消息。Promise 提供了一次性同步原语，用于 Fiber 之间的协调。Semaphore 控制并发访问资源的 Fiber 数量。MVar 提供了同步单值容器，用于 Fiber 之间的交接和同步。

这些原语的设计遵循了函数式编程的原则——不可变性、组合性和类型安全。它们不是简单的并发工具，而是经过精心设计的抽象，能够与 Effect-TS 的整个生态系统无缝集成。

通过本章的学习，你应该能够：

1. 使用 Ref 和 SynchronizedRef 安全地管理共享状态。
2. 使用 Queue 构建生产者-消费者系统，利用背压控制流量。
3. 使用 Hub 实现发布-订阅模式，解耦事件生产者和消费者。
4. 使用 Promise 实现 Fiber 之间的协调和同步。
5. 使用 Semaphore 控制并发访问。
6. 使用 MVar 实现 Fiber 之间的交接。
7. 组合使用这些原语构建复杂的并发系统。
8. 理解并发系统中的常见陷阱和最佳实践。

在下一章中，我们将探讨 Schedule 模块——一个将重试策略、延迟和定时任务抽象为可组合数据结构的强大工具。

## 11. Ref/SynchronizedRef 安全状态共享深入

### 11.1 Ref 的原子性保证机制

Ref 的原子性是通过 Effect-TS 运行时的 Fiber 调度系统实现的。当一个 Fiber 执行 Ref.update 时,整个"读取-修改-写入"操作在一个不可中断的临界区内完成。这意味着在更新操作完成之前,没有其他 Fiber 可以读取或修改该 Ref 的值。

Ref 的原子性保证了以下特性：没有竞态条件,两个 Fiber 同时更新 Ref 时不会出现丢失更新的情况；没有脏读,读取 Ref 时总是看到一个一致的状态；没有死锁,Ref 的操作是非阻塞的,不会导致死锁。

Ref 的内部实现使用 CAS(Compare-And-Swap)操作而非锁。CAS 是一种乐观并发控制机制,它通过比较当前值和期望值来确定是否可以写入。如果当前值与期望值一致,说明没有其他 Fiber 修改过,写入成功；否则写入失败并重试。CAS 的性能优于锁,因为它不会导致 Fiber 挂起和唤醒的开销。

Ref 的 get 操作返回当前值的引用。这意味着如果 Ref 存储的是可变对象,通过 get 获取引用后修改该对象会导致 Ref 的状态发生变化,但 Ref 无法感知这种变化。因此,建议 Ref 存储不可变数据,或者每次更新时创建新的副本。

### 11.2 Ref 的性能优化策略

Ref 的性能优化主要关注减少竞争和降低更新成本。以下是一些实用的性能优化策略：

第一,分片策略。当多个 Fiber 频繁更新同一个 Ref 时,竞争会非常激烈。可以将一个 Ref 拆分为多个 Ref,每个 Fiber 更新其中一个分片,然后定期合并分片的结果。例如,在一个计数器场景中,可以将一个全局计数器拆分为 10 个分片计数器,每个 Fiber 更新随机的一个分片,定期将所有分片的值相加得到总数。

第二,批量更新策略。当需要频繁更新 Ref 时,可以将多个小更新合并为一个大更新,减少更新次数。例如,在一个实时统计系统中,可以将每秒的多次更新合并为一次批量更新。

第三,使用 modify 而非 updateAndGet。modify 允许在更新函数中返回自定义结果,避免了更新后再次 get 的开销。updateAndGet 需要两次 Ref 操作(更新和获取),而 modify 只需要一次。

第四,避免在更新函数中执行耗时操作。Ref 的更新函数在临界区内执行,耗时操作会阻塞其他 Fiber。更新函数应尽量轻量,只包含必要的计算。

### 11.3 SynchronizedRef 的复合操作设计

SynchronizedRef 的设计目标是解决 Ref 无法原子地执行复合操作的问题。在 Ref 中,如果需要先读取当前值,基于它执行一个 Effect,然后更新值,这三个步骤不是原子的,可能在中间被其他 Fiber 中断。SynchronizedRef 通过内部互斥锁将这三个步骤绑定在一起,确保整个操作的原子性。

SynchronizedRef 的核心方法是 modifyEffect,它接受一个函数 f,该函数接收当前值并返回 Effect。modifyEffect 保证在整个过程中,没有其他 Fiber 可以修改 SynchronizedRef 的值。

SynchronizedRef 的使用场景包括：需要在更新过程中调用外部 API；需要在更新过程中执行数据库操作；需要原子地更新多个相关的状态；需要在更新过程中记录日志或发送事件。

使用 SynchronizedRef 时需要注意其性能特性：锁竞争在高并发下会降低性能,因此 modifyEffect 中的 Effect 执行时间应尽量短；嵌套使用多个 SynchronizedRef 时需要注意死锁问题；对于读多写少的场景,使用 Ref 替代 SynchronizedRef 以提高性能。

### 11.4 Ref 在状态机中的应用

Ref 非常适合实现状态机,因为状态机的状态转换需要原子性。使用 Ref 实现状态机的基本模式是：定义一个状态类型,使用 Ref 存储当前状态,使用 Ref.modify 原子地执行状态转换。

状态机的状态转换函数通常需要检查当前状态是否允许转换到目标状态。如果允许,执行转换并可能执行副作用；如果不允许,返回错误或保持原状态。通过 Ref.modify,状态转换和状态检查可以在一个原子操作中完成,避免了竞态条件。

例如,一个连接状态机包含 disconnected、connecting、connected、reconnecting 四个状态。connect 操作只有在当前状态为 disconnected 时才能执行,connect 操作将状态从 disconnected 转换为 connecting,连接建立后将状态从 connecting 转换为 connected。如果连接失败,状态从 connecting 回退到 disconnected。所有这些转换都需要原子性,防止多个 Fiber 同时尝试连接导致状态混乱。

## 12. Queue 生产者-消费者深入

### 12.1 Queue 的背压机制详解

背压(Backpressure)是 Queue 最核心的设计特性。背压允许消费者控制生产者的生产速度,防止消费者被数据淹没。在 Effect-TS 的 Queue 中,背压通过队列容量来实现。

有界 Queue 的背压机制：当队列已满时,生产者的 offer 操作会被阻塞,直到消费者取走元素腾出空间。这种阻塞自然地将消费者的处理速度反向传递给生产者。如果消费者处理速度慢,队列会持续满,生产者被阻塞,生产速度自动降低。如果消费者处理速度快,队列经常为空,生产者可以快速生产。

背压的粒度控制：通过调整队列容量,可以控制背压的敏感度。小容量队列提供更强的背压,生产者更容易被阻塞,系统对消费者的处理速度更加敏感。大容量队列提供较弱的背压,生产者不容易被阻塞,但消费者可能积压较多数据。

背压与丢包策略：对于某些实时系统,背压导致的阻塞是不可接受的。Effect-TS 提供了两种替代策略：dropping(新元素被丢弃)和 sliding(旧元素被丢弃)。这些策略避免了生产者阻塞,但代价是数据丢失。

背压在分布式系统中的延伸：在分布式系统中,背压的概念可以延伸到服务间通信。当一个服务接收请求的速度超过其处理能力时,可以通过背压信号通知上游服务降低发送速度。这种端到端的背压机制可以防止级联故障。

### 12.2 Queue 的批处理与性能优化

Queue 的批处理操作可以显著提高吞吐量。批处理的核心思想是将多个操作合并为一次操作,减少操作次数和上下文切换开销。

takeUpTo 是批处理消费的关键操作。它从队列中取出最多指定数量的元素,如果队列中的元素不足则取出所有可用元素。通过一次取出多个元素,可以减少 take 操作的次数,降低 Fiber 切换开销。

offerAll 是批处理生产的关键操作。它将多个元素一次性放入队列,减少了 offer 操作的次数。offerAll 返回未成功放入的元素(队列已满时),这些元素需要后续处理。

批处理与窗口大小：批处理的大小选择是性能优化的关键。批处理太小,优化效果不明显；批处理太大,单次处理时间过长,可能导致其他 Fiber 等待。通常建议批处理大小在 10-100 之间,具体取决于业务场景。

### 12.3 有界队列与无界队列的选择

选择有界队列还是无界队列取决于具体的业务需求。有界队列提供了背压机制,可以控制数据的流入速度,防止系统过载。无界队列不限制容量,所有数据都可以进入队列,但可能导致内存耗尽。

有界队列适用于以下场景：生产者速度可能超过消费者速度；需要控制内存使用；需要背压机制协调生产者和消费者的速度；系统对资源使用有严格的限制。

无界队列适用于以下场景：生产者和消费者的速度匹配良好；数据丢失不可接受；消息量可控；消费者的处理速度通常超过生产者的生产速度。

在实际应用中,推荐优先使用有界队列。有界队列的安全边界可以防止系统在突发流量下崩溃。如果担心有界队列导致生产者频繁阻塞,可以适当增大队列容量,或者在队列满时使用 dropping 或 sliding 策略。

### 12.4 Queue 在分布式系统中的应用

在分布式系统中,Queue 的概念可以扩展到跨进程通信。Effect-TS 的 Queue 是进程内的通信机制,但可以通过与其他组件结合,实现分布式队列的效果。

本地 Queue 与数据库结合：将本地 Queue 与数据库表结合,可以实现持久化的消息队列。本地 Queue 负责缓冲消息,后台 Fiber 定期将 Queue 中的消息写入数据库表。即使应用崩溃,数据库中的消息也不会丢失。

本地 Queue 与消息代理结合：将本地 Queue 与外部消息代理(如 RabbitMQ、Kafka、Redis)结合,可以实现分布式消息传递。本地 Queue 负责处理应用内部的消息传递,外部消息代理负责跨服务的消息传递。本地 Queue 作为消息代理的缓冲区,减少网络通信次数。

## 13. Hub 发布-订阅深入

### 13.1 Hub 的内部实现机制

Hub 内部维护了一组 Queue,每个订阅者对应一个独立的 Queue。当消息被发布到 Hub 时,它会被复制到所有订阅者的 Queue 中。这种设计实现了发布-订阅模式的"一对多"语义：一个生产者发布的消息可以被多个消费者独立消费。

Hub 的实现需要考虑消息复制的性能。对于少量订阅者,消息复制开销很小；对于大量订阅者,每条消息都需要被复制多次,开销显著增加。在 Effect-TS 中,Hub 的消息复制使用 forEach 操作,依次将消息放入每个订阅者的 Queue。

Hub 的背压机制与 Queue 的背压机制相同,但按订阅者独立管理。每个订阅者都有自己的 Queue,因此每个订阅者的消费速度独立影响其对生产者的背压。慢订阅者不会影响快订阅者,快订阅者可以继续正常消费。

Hub 的容量决定了每个订阅者 Queue 的大小。创建 Hub 时指定的容量会被用于初始化每个订阅者的 Queue。这意味着 Hub 的总容量是容量乘以订阅者数量。对于大量订阅者,需要合理选择容量,避免内存占用过高。

### 13.2 Hub 与 EventBus 的对比

Hub 和 EventBus 都是实现发布-订阅模式的机制,但它们的设计目标和特性有所不同。

Hub 是一个低级别的原语,提供了基本的发布和订阅功能。它没有事件过滤、事件转换等高级功能,但性能更高,内存占用更小。Hub 适合需要高性能广播的场景。

EventBus 是一个更高层次的抽象,通常基于 Hub 实现。EventBus 提供了事件类型过滤、事件转换、事件路由等高级功能。EventBus 适合需要复杂事件处理逻辑的场景。

选择 Hub 还是 EventBus 取决于具体的需求：如果只需要简单的广播功能,使用 Hub；如果需要复杂的事件处理逻辑,使用 EventBus；如果需要高性能,优先考虑 Hub。

### 13.3 Hub 的背压与慢订阅者处理

Hub 的背压机制需要特别关注慢订阅者的处理。当某个订阅者的消费速度明显慢于其他订阅者时,它的 Queue 会持续满,导致发布者被阻塞。

慢订阅者的处理策略包括：增加 Hub 容量,为慢订阅者提供更大的缓冲区；使用 sliding 策略,丢弃慢订阅者的旧消息；使用 dropping 策略,丢弃慢订阅者的新消息；或者将慢订阅者从 Hub 中移除,由独立的处理流程处理。

在实际应用中,推荐为 Hub 设置合理的容量,并监控每个订阅者的消费速度。如果发现某个订阅者持续慢速,应该分析其处理逻辑是否存在性能问题,而不是简单地增加缓冲区大小。

### 13.4 Hub 在实时数据分发中的应用

Hub 在实时数据分发场景中有广泛的应用。以下是一些典型的使用案例：

实时仪表盘：将实时数据通过 Hub 广播到多个仪表盘实例。每个仪表盘实例是 Hub 的一个订阅者,独立接收和处理实时数据。当数据源发生变化时,所有仪表盘同时更新。

WebSocket 广播：将 Hub 与 WebSocket 结合,实现消息的实时推送。每个 WebSocket 连接是 Hub 的一个订阅者,当消息发布到 Hub 时,所有连接的客户端都会收到消息。

缓存失效通知：当缓存数据发生变化时,通过 Hub 通知所有相关的缓存实例清除过期的缓存数据。每个缓存实例作为 Hub 的订阅者,收到通知后立即清除对应的缓存项。

## 14. 有界队列背压深入

### 14.1 背压的核心原理

背压的核心原理是：当消费者的处理能力不足以应对生产者的生产速度时,消费者通过某种机制通知生产者降低速度。在 Effect-TS 中,这种机制通过有界 Queue 的阻塞 offer 实现。

背压的实现需要以下条件：生产者和消费者之间有明确的边界(即 Queue)；Queue 的容量是有限的；offer 操作在队列满时阻塞；take 操作在队列空时阻塞。

背压的关键参数是 Queue 的容量。容量决定了系统可以缓冲的数据量。容量越大,系统对短暂的速度波动越不敏感,但突发流量下的最大延迟也越大。容量越小,系统的响应越及时,但生产者被阻塞的频率也越高。

选择容量的经验公式：容量 = 预期的最大生产速度 × 可接受的等待时间 / 单个消息的大小。例如,如果最大生产速度是 1000 msg/s,可接受的最大等待时间是 100ms,那么容量至少需要 100 个槽位。

### 14.2 背压在流处理中的应用

在流处理系统中,背压是保证系统稳定的关键机制。Effect-TS 的 Stream 模块与 Queue 深度集成,提供了天然的背压支持。

Stream 的背压通过内部的 Queue 实现。当 Stream 的生产者(数据源)速度超过消费者(处理器)速度时,Stream 内部的 Queue 会满,生产者被阻塞,生产速度自动降低。

Stream 的背压与调度器的交互：Stream 的背压不仅影响数据源的读取速度,还影响 Fiber 的调度。当 Stream 阻塞时,当前的 Fiber 让出 CPU,其他 Fiber 可以获得执行机会。这种协作式调度确保了系统资源的高效利用。

Stream 的背压与错误处理：当 Stream 的背压导致数据源阻塞时,如果阻塞时间超过设定的超时,Stream 可以报告错误,由错误处理器决定是重试还是跳过。

### 14.3 背压与弹性伸缩

背压与弹性伸缩是两个互补的机制。背压在微观层面控制数据流,弹性伸缩在宏观层面调整系统容量。

在基于背压的系统中,当消费者负载过高时,背压会减慢生产者的速度。但长期来看,需要增加消费者的数量或提高消费者的处理能力。弹性伸缩根据负载情况动态调整资源分配,从根本上解决负载问题。

背压与弹性伸缩的结合：背压信号可以作为弹性伸缩的触发条件。当 Queue 持续满时,说明消费者处理能力不足,可以触发扩容操作。当 Queue 持续空时,说明消费者处理能力过剩,可以触发缩容操作。

在实际系统中,背压和弹性伸缩通常配合使用。背压作为第一道防线,处理瞬时的负载波动。弹性伸缩作为第二道防线,处理持续性的负载变化。这种分层设计既保证了系统的稳定性,又提高了资源的利用效率。

## 15. Ref/SynchronizedRef 高级状态共享实战

### 15.1 多层缓存状态共享

在大型应用中,状态共享往往涉及多层结构。使用 Ref 管理多层缓存状态需要精细的设计。典型的多层缓存包括本地内存缓存(L1)、分布式缓存(L2)、数据库(L3)三个层级。

```typescript
class MultiLayerCache<K, V> {
  private l1Cache: Ref.Ref<Map<K, { value: V; timestamp: number }>>
  private l2CacheRef: Ref.Ref<Map<K, { value: V; timestamp: number }>>
  private stats: Ref.Ref<{ l1Hits: number; l2Hits: number; l3Hits: number }>

  constructor(private l2TTL: Duration.Duration, private l1TTL: Duration.Duration) {
    this.l1Cache = Ref.unsafeMake(new Map())
    this.l2CacheRef = Ref.unsafeMake(new Map())
    this.stats = Ref.unsafeMake({ l1Hits: 0, l2Hits: 0, l3Hits: 0 })
  }

  get(key: K, fetchFromDB: (key: K) => Effect.Effect<V>): Effect.Effect<V> {
    return Effect.gen(function* (_) {
      const now = Date.now()

      // L1 缓存检查
      const l1Result = yield* _(Ref.modify(this.l1Cache, (map) => {
        const entry = map.get(key)
        if (entry && now - entry.timestamp < this.l1TTL.millis) {
          return [Option.some(entry.value), map] as const
        }
        return [Option.none(), map] as const
      }))
      if (Option.isSome(l1Result)) {
        yield* _(Ref.update(this.stats, (s) => ({ ...s, l1Hits: s.l1Hits + 1 })))
        return l1Result.value
      }

      // L2 缓存检查
      const l2Result = yield* _(Ref.modify(this.l2CacheRef, (map) => {
        const entry = map.get(key)
        if (entry && now - entry.timestamp < this.l2TTL.millis) {
          return [Option.some(entry.value), map] as const
        }
        return [Option.none(), map] as const
      }))
      if (Option.isSome(l2Result)) {
        yield* _(Ref.update(this.l1Cache, (map) => {
          const newMap = new Map(map)
          newMap.set(key, { value: l2Result.value, timestamp: now })
          return newMap
        }))
        yield* _(Ref.update(this.stats, (s) => ({ ...s, l2Hits: s.l2Hits + 1 })))
        return l2Result.value
      }

      // L3 数据库查询
      const value = yield* _(fetchFromDB(key))
      yield* _(Ref.update(this.l1Cache, (map) => {
        const newMap = new Map(map)
        newMap.set(key, { value, timestamp: now })
        return newMap
      }))
      yield* _(Ref.update(this.l2CacheRef, (map) => {
        const newMap = new Map(map)
        newMap.set(key, { value, timestamp: now })
        return newMap
      }))
      yield* _(Ref.update(this.stats, (s) => ({ ...s, l3Hits: s.l3Hits + 1 })))
      return value
    })
  }

  getStats(): Effect.Effect<{ l1HitRate: number; l2HitRate: number }> {
    return Ref.get(this.stats).pipe(
      Effect.map((s) => {
        const total = s.l1Hits + s.l2Hits + s.l3Hits
        return {
          l1HitRate: total > 0 ? s.l1Hits / total : 0,
          l2HitRate: total > 0 ? s.l2Hits / total : 0,
        }
      })
    )
  }

  invalidate(key: K): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      yield* _(Ref.update(this.l1Cache, (map) => {
        const newMap = new Map(map)
        newMap.delete(key)
        return newMap
      }))
      yield* _(Ref.update(this.l2CacheRef, (map) => {
        const newMap = new Map(map)
        newMap.delete(key)
        return newMap
      }))
    })
  }
}
```

这个多层缓存实现中,L1 缓存使用极短的 TTL,提供最快的访问速度但容量有限。L2 缓存使用较长的 TTL,提供次快的访问速度但容量更大。L3 是数据库回源,是最慢但数据最完整的方式。stat 计数器的设计让开发者可以清晰地了解缓存的命中率分布,从而优化 TTL 和缓存容量配置。

### 15.2 SynchronizedRef 的乐观锁模式

SynchronizedRef 的 modifyEffect 本质上是一个悲观锁——它通过互斥锁确保复合操作的原子性。对于某些场景,使用乐观锁(基于 Ref 的 CAS 操作)可以获得更高的性能。

```typescript
// 乐观锁模式：使用 Ref 实现 CAS 操作
const optimisticUpdate = <A>(ref: Ref.Ref<A>, f: (a: A) => A): Effect.Effect<A> => {
  const attempt: Effect.Effect<A> = Effect.gen(function* (_) {
    const current = yield* _(Ref.get(ref))
    const newValue = f(current)
    const success = yield* _(Ref.compareAndSet(ref, current, newValue))
    if (!success) {
      // CAS 失败,重试
      return yield* _(attempt)
    }
    return newValue
  })
  return attempt
}
```

乐观锁模式适用于读多写少、冲突概率低的场景。当多个 Fiber 同时更新 Ref 时,只有第一个成功,其他 Fiber 需要重试。这种模式避免了互斥锁的开销,但在高冲突场景下会导致大量重试,反而降低性能。

### 15.3 SynchronizedRef 的分片锁优化

当 SynchronizedRef 保护的共享状态包含多个独立的部分时,可以使用分片锁来减少锁竞争。每个分片有独立的 SynchronizedRef,不同 Fiber 更新不同分片时互不干扰。

```typescript
class ShardedCounter {
  private shards: SynchronizedRef.SynchronizedRef<number>[]
  private numShards: number

  constructor(numShards: number = 16) {
    this.numShards = numShards
    this.shards = Array.from({ length: numShards }, () =>
      Effect.runSync(SynchronizedRef.make(0))
    )
  }

  private getShard(key: string): number {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) | 0
    }
    return Math.abs(hash) % this.numShards
  }

  increment(key: string, amount: number = 1): Effect.Effect<number> {
    const shardIndex = this.getShard(key)
    return SynchronizedRef.modify(
      this.shards[shardIndex],
      (current) => [current + amount, current + amount] as const
    )
  }

  getTotal(): Effect.Effect<number> {
    return Effect.forEach(
      this.shards,
      (shard) => SynchronizedRef.modify(shard, (n) => [n, n] as const),
      { concurrency: "unbounded" }
    ).pipe(
      Effect.map((counts) => counts.reduce((a, b) => a + b, 0))
    )
  }
}
```

分片锁的核心思想是将一个锁拆分为多个更细粒度的锁,降低每个锁上的竞争概率。分片数量的选择需要在减少竞争和增加管理开销之间取得平衡。通常建议分片数量为 CPU 核心数的 2-4 倍。

## 16. Queue 背压深度实战

### 16.1 自适应背压控制

在某些场景中,固定的队列容量无法适应变化的负载。自适应背压根据系统的实时状态动态调整队列容量,在低负载时减少内存占用,在高负载时提供更大的缓冲区。

```typescript
class AdaptiveBackpressureQueue<A> {
  private queue: Ref.Ref<{ items: A[]; capacity: number }>
  private metrics: Ref.Ref<{ totalEnqueued: number; totalDequeued: number; lastAdjustTime: number }>

  constructor(initialCapacity: number = 100) {
    this.queue = Ref.unsafeMake({ items: [], capacity: initialCapacity })
    this.metrics = Ref.unsafeMake({ totalEnqueued: 0, totalDequeued: 0, lastAdjustTime: Date.now() })
  }

  offer(item: A): Effect.Effect<boolean> {
    return Effect.gen(function* (_) {
      const state = yield* _(Ref.get(this.queue))
      if (state.items.length >= state.capacity) {
        return false // 队列满,由调用方决定重试或丢弃
      }
      yield* _(Ref.update(this.queue, (s) => ({
        ...s,
        items: [...s.items, item]
      })))
      yield* _(Ref.update(this.metrics, (m) => ({
        ...m,
        totalEnqueued: m.totalEnqueued + 1
      })))
      return true
    })
  }

  take(): Effect.Effect<Option.Option<A>> {
    return Effect.gen(function* (_) {
      const result = yield* _(Ref.modify(this.queue, (state) => {
        if (state.items.length === 0) return [Option.none(), state] as const
        const [head, ...tail] = state.items
        return [Option.some(head), { ...state, items: tail }] as const
      }))
      if (Option.isSome(result)) {
        yield* _(Ref.update(this.metrics, (m) => ({
          ...m,
          totalDequeued: m.totalDequeued + 1
        })))
      }
      return result
    })
  }

  adjustCapacity(): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const m = yield* _(Ref.get(this.metrics))
      const now = Date.now()
      const elapsed = now - m.lastAdjustTime
      if (elapsed < 5000) return // 每 5 秒调整一次

      const queueLength = m.totalEnqueued - m.totalDequeued
      const state = yield* _(Ref.get(this.queue))
      const currentCapacity = state.capacity

      let newCapacity = currentCapacity
      if (queueLength > currentCapacity * 0.8) {
        newCapacity = Math.min(currentCapacity * 2, 10000) // 扩容
      } else if (queueLength < currentCapacity * 0.2 && currentCapacity > 100) {
        newCapacity = Math.max(currentCapacity / 2, 100) // 缩容
      }

      if (newCapacity !== currentCapacity) {
        yield* _(Ref.update(this.queue, (s) => ({ ...s, capacity: newCapacity })))
      }
      yield* _(Ref.update(this.metrics, (m) => ({
        ...m,
        totalEnqueued: 0,
        totalDequeued: 0,
        lastAdjustTime: now
      })))
    })
  }
}
```

自适应背压的核心是持续监控队列的积压情况,据此动态调整容量。当积压比例超过 80% 时扩容,低于 20% 时缩容。调整间隔设为 5 秒可以避免频繁调整导致的震荡。

### 16.2 背压与健康检查的结合

背压信息可以作为系统健康状态的重要指标。通过监控 Queue 的积压情况,可以判断系统是否处于健康状态,并在必要时触发保护措施。

```typescript
class HealthAwareQueue<A> {
  private queue: Queue.Queue<A>
  private healthRef: Ref.Ref<"healthy" | "stressed" | "critical">

  constructor(capacity: number) {
    this.queue = Effect.runSync(Queue.bounded<A>(capacity))
    this.healthRef = Ref.unsafeMake<"healthy" | "stressed" | "critical">("healthy")
  }

  getHealth(): Effect.Effect<"healthy" | "stressed" | "critical"> {
    return Effect.gen(function* (_) {
      const size = yield* _(Queue.size(this.queue))
      const capacity = Queue.capacity(this.queue)
      const ratio = size / capacity

      if (ratio > 0.9) {
        yield* _(Ref.set(this.healthRef, "critical"))
      } else if (ratio > 0.6) {
        yield* _(Ref.set(this.healthRef, "stressed"))
      } else {
        yield* _(Ref.set(this.healthRef, "healthy"))
      }

      return yield* _(Ref.get(this.healthRef))
    })
  }

  offerWithProtection(item: A): Effect.Effect<boolean> {
    return Effect.gen(function* (_) {
      const health = yield* _(this.getHealth())
      if (health === "critical") {
        // 达到临界状态,拒绝新请求并触发降级
        return false
      }
      if (health === "stressed") {
        // 压力状态,尝试 offer 但设置超时
        return yield* _(
          Queue.offer(this.queue, item).pipe(
            Effect.timeout("100 millis"),
            Effect.catchAll(() => Effect.succeed(false))
          )
        )
      }
      // 健康状态,正常 offer
      return yield* _(Queue.offer(this.queue, item))
    })
  }
}
```

健康感知队列根据积压比例定义三级健康状态,不同状态采取不同的处理策略。临界状态直接拒绝请求,压力状态使用超时 offer,健康状态正常处理。这种分级保护机制可以防止系统在过载时完全崩溃。

## 17. Hub 高级发布-订阅模式

### 17.1 Hub 的分级路由

在复杂的发布-订阅系统中,消息通常需要根据类型或优先级路由到不同的订阅者。基于 Hub 可以实现分级路由模式。

```typescript
type EventPriority = "low" | "normal" | "high" | "critical"

interface RoutedEvent {
  type: string
  priority: EventPriority
  payload: unknown
  timestamp: number
}

class PriorityHub {
  private hubs: Record<EventPriority, Hub.Hub<RoutedEvent>>
  private metrics: Ref.Ref<Map<EventPriority, number>>

  constructor(capacity: number) {
    this.hubs = {
      low: Effect.runSync(Hub.bounded<RoutedEvent>(capacity)),
      normal: Effect.runSync(Hub.bounded<RoutedEvent>(capacity)),
      high: Effect.runSync(Hub.bounded<RoutedEvent>(capacity)),
      critical: Effect.runSync(Hub.bounded<RoutedEvent>(capacity)),
    }
    this.metrics = Ref.unsafeMake(new Map<EventPriority, number>())
  }

  publish(event: RoutedEvent): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      yield* _(Hub.publish(this.hubs[event.priority], event))
      yield* _(Ref.update(this.metrics, (map) => {
        const newMap = new Map(map)
        newMap.set(event.priority, (newMap.get(event.priority) ?? 0) + 1)
        return newMap
      }))
    })
  }

  subscribe(priorities: EventPriority[]): Effect.Effect<Stream.Stream<RoutedEvent>> {
    return Effect.gen(function* (_) {
      const queues = yield* _(Effect.forEach(
        priorities,
        (p) => Hub.subscribe(this.hubs[p]),
        { concurrency: "unbounded" }
      ))
      const streams = queues.map((q) => Queue.toStream(q))
      return Stream.mergeAll(streams, { concurrency: "unbounded" })
    })
  }

  subscribeByPriority(priority: EventPriority): Effect.Effect<Stream.Stream<RoutedEvent>> {
    return Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(this.hubs[priority]))
      return Queue.toStream(queue)
    })
  }

  getMetrics(): Effect.Effect<Record<EventPriority, number>> {
    return Ref.get(this.metrics).pipe(
      Effect.map((map) => ({
        low: map.get("low") ?? 0,
        normal: map.get("normal") ?? 0,
        high: map.get("high") ?? 0,
        critical: map.get("critical") ?? 0,
      }))
    )
  }
}
```

分级路由的设计使得高优先级事件不会因为低优先级事件的积压而被阻塞。每个优先级对应独立的 Hub,订阅者可以选择订阅感兴趣的优先级级别。这种设计在监控系统和告警系统中尤为重要——critical 级别的告警必须实时传递,不受普通日志事件的影响。

### 17.2 Hub 的扇出与扇入模式

扇出(Fan-out)是指将一个消息分发到多个处理单元,扇入(Fan-in)是指将多个消息源聚合到一个处理单元。Hub 天然支持扇出,配合 Queue 可以实现扇入。

```typescript
// 扇入模式：多个数据源聚合到同一个 Hub
class FanInHub<A> {
  private hub: Hub.Hub<A>
  private sources: Ref.Ref<Map<string, Fiber.Fiber<void>>>

  constructor(capacity: number) {
    this.hub = Effect.runSync(Hub.bounded<A>(capacity))
    this.sources = Ref.unsafeMake(new Map())
  }

  addSource(name: string, stream: Stream.Stream<A>): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const fiber = yield* _(Effect.fork(
        stream.pipe(
          Stream.runForEach((item) => Hub.publish(this.hub, item))
        )
      ))
      yield* _(Ref.update(this.sources, (map) => {
        const newMap = new Map(map)
        newMap.set(name, fiber)
        return newMap
      }))
    })
  }

  removeSource(name: string): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      const fiber = yield* _(Ref.modify(this.sources, (map) => {
        const newMap = new Map(map)
        const fiber = newMap.get(name)
        newMap.delete(name)
        return [fiber, newMap] as const
      }))
      if (fiber) {
        yield* _(Fiber.interrupt(fiber))
      }
    })
  }

  subscribe(): Effect.Effect<Stream.Stream<A>> {
    return Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(this.hub))
      return Queue.toStream(queue)
    })
  }
}
```

扇入模式通常用于日志聚合、指标收集和事件整合场景。多个数据源(如不同的微服务实例)将数据发送到同一个 Hub,订阅者从 Hub 获取聚合后的数据。

### 17.3 Hub 与 Fiber 的生命周期绑定

在实际应用中,Hub 的订阅者通常与 Fiber 的生命周期绑定。当 Fiber 结束时,订阅者应该自动从 Hub 中移除,防止资源泄漏。

```typescript
class ScopedHubSubscriber<A> {
  private activeSubscriptions: Ref.Ref<Map<string, { queue: Queue.Queue<A>; fiber: Fiber.Fiber<void> }>>

  constructor() {
    this.activeSubscriptions = Ref.unsafeMake(new Map())
  }

  subscribeInScope(
    hub: Hub.Hub<A>,
    id: string,
    handler: (item: A) => Effect.Effect<void>
  ): Effect.Effect<void> {
    return Effect.scoped(
      Effect.gen(function* (_) {
        const scope = yield* _(Scope.make())
        const queue = yield* _(Hub.subscribe(hub))
        const fiber = yield* _(Effect.forkIn(scope,
          Queue.toStream(queue).pipe(
            Stream.runForEach((item) => handler(item))
          )
        ))
        yield* _(Ref.update(this.activeSubscriptions, (map) => {
          const newMap = new Map(map)
          newMap.set(id, { queue, fiber })
          return newMap
        }))

        // Scope 关闭时自动清理
        yield* _(Effect.addFinalizer(() =>
          Ref.update(this.activeSubscriptions, (map) => {
            const newMap = new Map(map)
            newMap.delete(id)
            return newMap
          })
        ))
      })
    )
  }

  getActiveCount(): Effect.Effect<number> {
    return Ref.get(this.activeSubscriptions).pipe(
      Effect.map((map) => map.size)
    )
  }
}
```

使用 Scope 管理 Hub 订阅者的生命周期是最佳实践。Scope 关闭时,所有注册的 Fiber 被中断,订阅者队列被清理,确保不会发生 Fiber 泄漏。

通过本章的学习,我们深入理解了 Ref/SynchronizedRef 的状态共享机制、Queue 的背压原理以及 Hub 的发布-订阅模式。这些并发原语是构建高可靠、高并发 Effect-TS 应用的基石。掌握这些原语的最佳使用方式,可以帮助开发者编写出既安全又高效的生产级并发代码。

## 18. 并发原语的监控与诊断

### 18.1 Ref 竞争监控

在高并发场景下,Ref 的竞争情况是评估系统健康状态的重要指标。当多个 Fiber 频繁更新同一个 Ref 时,竞争会导致吞吐量下降。监控 Ref 竞争的方法包括记录每次更新操作的等待时间、统计 CAS 重试次数、以及分析 Ref 的更新频率。

Ref 竞争监控的实现方式：在 Ref 的更新操作前后记录时间戳,计算更新操作的耗时。如果耗时超过正常范围,说明存在竞争。对于使用 CAS 的 Ref,记录 CAS 重试次数,重试次数过高说明竞争激烈。通过定期采样这些指标,可以了解 Ref 的竞争趋势。

缓解 Ref 竞争的策略包括：使用分片 Ref 将竞争分散到多个 Ref 上；使用 SynchronizedRef 替代 Ref 但注意锁竞争的开销；对于读多写少的场景,考虑使用 Copy-on-Write 模式减少写操作频率。

### 18.2 Queue 背压水平监控

Queue 的背压水平是判断系统负载状态的关键指标。通过监控 Queue 的积压比例(当前大小/容量),可以了解消费者的处理能力是否足够。积压比例持续高于 80% 说明消费者处理能力不足,需要扩容或优化消费者逻辑。

Queue 背压监控的实践方法：定期调用 Queue.size 获取当前队列大小,计算积压比例。记录积压比例的时间序列数据,用于趋势分析。设置多级告警阈值：积压比例超过 60% 时记录警告日志,超过 80% 时触发告警,超过 95% 时触发紧急处理流程。

Queue 的吞吐量监控同样重要。记录单位时间内成功 offer 和 take 的次数,计算生产速度和消费速度。如果生产速度持续高于消费速度,说明背压正在积累,需要采取措施。如果消费速度持续高于生产速度,说明系统有富余的处理能力。

### 18.3 Hub 订阅者健康监控

Hub 的订阅者健康监控是确保发布-订阅系统可靠运行的关键。每个订阅者独立消费消息,一个慢订阅者可能影响整个 Hub 的发布性能。监控每个订阅者的消费速度和积压情况,可以及时发现和处理慢订阅者。

Hub 订阅者监控的实现：为每个订阅者记录消费的消息数量和消费时间。计算每个订阅者的平均消费速度和积压消息数。如果某个订阅者的积压持续增长,说明该订阅者处理能力不足。对于关键订阅者,设置积压告警阈值,超过阈值时触发告警。

慢订阅者的处理策略包括：增加订阅者的处理资源(如增加 Fiber 数量)；优化订阅者的处理逻辑减少处理时间；使用 sliding 或 dropping 策略丢弃部分消息；将慢订阅者从 Hub 中移除,由独立的处理流程异步处理。

### 18.4 并发原语的指标导出

将并发原语的监控指标导出到外部监控系统,可以实现对系统状态的持续观察。推荐的指标导出方式包括 Prometheus 指标导出和结构化日志记录。

Prometheus 指标导出：将 Ref 竞争次数、Queue 积压比例、Hub 订阅者数量等指标注册为 Prometheus Gauge 或 Counter。定期更新这些指标的值,Prometheus 定期拉取。在 Grafana 中创建仪表盘可视化这些指标的变化趋势。

结构化日志记录：在关键操作(如 Ref 更新、Queue offer/take、Hub publish/subscribe)前后记录结构化日志。日志包含操作名称、耗时、当前状态等信息。通过日志分析系统(如 ELK Stack)可以查询和分析这些日志,发现性能瓶颈和异常模式。

通过建立完善的监控体系,开发者可以及时发现并发原语的使用问题,在它们影响系统稳定性之前采取措施。监控数据还可以指导性能优化方向,帮助开发者做出数据驱动的优化决策。
