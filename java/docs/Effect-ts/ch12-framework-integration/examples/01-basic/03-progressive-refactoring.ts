import { Effect, Context, Layer } from "effect"

// 渐进式重构：逐步将 Express 代码迁移到 Effect

// === 阶段 1：原始 Express 风格 ===
const expressGetUser = (req: any, res: any) => {
  const userId = parseInt(req.params.id, 10)
  // 直接调用数据库
  const user = { id: userId, name: "Alice" }
  res.json(user)
}

// === 阶段 2：提取 Effect 服务 ===
interface UserRepo {
  readonly findById: (id: number) => Effect.Effect<{ id: number; name: string } | null>
}

class UserRepo extends Context.Tag("UserRepo")<UserRepo, UserRepo>() {}

// === 阶段 3：将业务逻辑提取为 Effect ===
const findUser = (id: number): Effect.Effect<{ id: number; name: string } | null> =>
  Effect.gen(function* () {
    const repo = yield* UserRepo
    return yield* repo.findById(id)
  })

// === 阶段 4：Adapter 桥接 ===
class ExpressReq extends Context.Tag("ExpressReq")<
  ExpressReq,
  { params: Record<string, string> }
>() {}

const effectGetUser = Effect.gen(function* () {
  const req = yield* ExpressReq
  const userId = parseInt(req.params["id"] ?? "0", 10)
  return yield* findUser(userId)
})

// === 阶段 5：测试 ===
const TestRepo = Layer.succeed(UserRepo, {
  findById: (id) => Effect.succeed({ id, name: "测试用户" }),
})

const testProgram = effectGetUser.pipe(
  Effect.provide(
    Layer.mergeAll(
      TestRepo,
      Layer.succeed(ExpressReq, { params: { id: "42" } }),
    ),
  ),
)

Effect.runPromise(testProgram).then(console.log)
