import { Effect, Context, Layer } from "effect"

// Effect 中间件链：将 Express/Fastify 中间件转换为 Effect

// 1. 定义中间件类型
interface Middleware<R, E, A> {
  (next: Effect.Effect<R, E, A>): Effect.Effect<R, E, A>
}

// 2. 认证中间件
interface AuthContext {
  readonly userId: string
  readonly role: string
}

class AuthContext extends Context.Tag("AuthContext")<
  AuthContext,
  AuthContext
>() {}

const authMiddleware: Middleware<AuthContext, Error, void> = (next) =>
  Effect.gen(function* () {
    // 模拟认证逻辑
    const token = "valid-token"
    if (token === "valid-token") {
      // 将认证信息注入 Context
      return yield* next.pipe(
        Effect.provide(
          Layer.succeed(AuthContext, { userId: "user_001", role: "admin" }),
        ),
      )
    }
    return yield* Effect.fail(new Error("未授权"))
  })

// 3. 日志中间件
const loggingMiddleware: Middleware<never, never, void> = (next) =>
  Effect.gen(function* () {
    console.log("[请求开始]")
    const result = yield* next
    console.log("[请求结束]")
    return result
  })

// 4. 错误处理中间件
const errorHandlingMiddleware: Middleware<never, Error, void> = (next) =>
  next.pipe(
    Effect.catchAll((error) => {
      console.error(`[错误] ${error.message}`)
      return Effect.void
    }),
  )

// 5. 组合中间件链
const middlewareChain = (handler: Effect.Effect<AuthContext, Error, void>) =>
  errorHandlingMiddleware(
    loggingMiddleware(
      authMiddleware(handler),
    ),
  )

// 6. 业务逻辑
const businessLogic = Effect.gen(function* () {
  const auth = yield* AuthContext
  console.log(`处理用户 ${auth.userId} 的请求，角色: ${auth.role}`)
})

// 7. 运行
const program = middlewareChain(businessLogic)
Effect.runPromise(program)
