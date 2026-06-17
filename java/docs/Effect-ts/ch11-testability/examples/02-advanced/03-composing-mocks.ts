import { Effect, Context, Layer, TestContext, TestClock, Duration } from "effect"

// 组合多个 Mock Layer

// 服务定义
interface CacheService {
  readonly get: (key: string) => Effect.Effect<string | null>
  readonly set: (key: string, value: string) => Effect.Effect<void>
}

class CacheService extends Context.Tag("CacheService")<
  CacheService,
  CacheService
>() {}

interface MetricsService {
  readonly record: (name: string, value: number) => Effect.Effect<void>
}

class MetricsService extends Context.Tag("MetricsService")<
  MetricsService,
  MetricsService
>() {}

// Mock 实现
const MockCache = Layer.succeed(CacheService, {
  get: (key) => Effect.succeed(`cached_${key}`),
  set: (key, value) => Effect.void,
})

const MockMetrics = Layer.succeed(MetricsService, {
  record: (name, value) => Effect.void,
})

// 组合所有 Mock
const AllMocks = Layer.mergeAll(MockCache, MockMetrics).pipe(
  Layer.provideMerge(TestContext.TestContext),
)

// 业务逻辑
const businessLogic = (key: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const cache = yield* CacheService
    const metrics = yield* MetricsService

    const cached = yield* cache.get(key)
    if (cached) {
      yield* metrics.record("cache_hit", 1)
      return cached
    }

    yield* metrics.record("cache_miss", 1)
    const value = `computed_${key}`
    yield* cache.set(key, value)
    return value
  })

// 测试
const testProgram = businessLogic("test-key").pipe(
  Effect.provide(AllMocks),
)

Effect.runPromise(testProgram).then(console.log)
