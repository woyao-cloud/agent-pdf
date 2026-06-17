import { Effect, Context, Layer, TestContext, TestClock, Duration, Clock } from "effect"

// 测试套件组织：结构化测试

interface UserService {
  readonly createUser: (name: string, email: string) => Effect.Effect<{ id: number; name: string; email: string }>
  readonly getUser: (id: number) => Effect.Effect<{ id: number; name: string; email: string } | null>
}

class UserService extends Context.Tag("UserService")<
  UserService,
  UserService
>() {}

// 内存存储 Mock
const InMemoryUserStore = Layer.succeed(UserService, {
  createUser: (name, email) =>
    Effect.sync(() => ({
      id: Math.floor(Math.random() * 10000),
      name,
      email,
    })),
  getUser: (id) =>
    Effect.succeed({ id, name: "测试用户", email: "test@example.com" }),
})

const TestEnv = Layer.mergeAll(InMemoryUserStore).pipe(
  Layer.provideMerge(TestContext.TestContext),
)

// 测试辅助函数
const createTestUser = (name: string, email: string) =>
  Effect.gen(function* () {
    const svc = yield* UserService
    return yield* svc.createUser(name, email)
  })

// 测试用例 1：创建用户
const testCreateUser = Effect.gen(function* () {
  const user = yield* createTestUser("Alice", "alice@example.com")
  console.log(`创建用户: id=${user.id}, name=${user.name}`)
})

// 测试用例 2：获取用户
const testGetUser = Effect.gen(function* () {
  const svc = yield* UserService
  const user = yield* svc.getUser(1)
  console.log(`获取用户: ${JSON.stringify(user)}`)
})

// 测试套件
const testSuite = Effect.gen(function* () {
  console.log("=== 测试套件开始 ===")

  yield* testCreateUser
  console.log("测试 1 通过")

  yield* testGetUser
  console.log("测试 2 通过")

  console.log("=== 测试套件结束 ===")
})

const runnable = testSuite.pipe(Effect.provide(TestEnv))
Effect.runPromise(runnable)
