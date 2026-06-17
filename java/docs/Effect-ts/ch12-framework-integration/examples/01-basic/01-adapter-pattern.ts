import { Effect, Context, Layer } from "effect"

// Adapter 桥接模式：将外部框架的 Request/Response 转换为 Effect 的 Context

// 1. 定义 Effect 服务
interface UserService {
  readonly findById: (id: number) => Effect.Effect<{ id: number; name: string } | null>
}

class UserService extends Context.Tag("UserService")<
  UserService,
  UserService
>() {}

// 2. 定义外部框架的 Request/Response 类型（模拟）
interface ExpressRequest {
  params: Record<string, string>
  query: Record<string, string>
  body: unknown
}

interface ExpressResponse {
  json: (data: unknown) => void
  status: (code: number) => ExpressResponse
}

// 3. Adapter：将 Express 的 Request 转换为 Effect 可以使用的 Context
class RequestContext extends Context.Tag("RequestContext")<
  RequestContext,
  ExpressRequest
>() {}

class ResponseContext extends Context.Tag("ResponseContext")<
  ResponseContext,
  ExpressResponse
>() {}

// 4. 业务逻辑 — 从 Context 中获取 Request，使用 UserService
const handleGetUser = Effect.gen(function* () {
  const req = yield* RequestContext
  const svc = yield* UserService
  const res = yield* ResponseContext

  const userId = parseInt(req.params["id"] ?? "0", 10)
  const user = yield* svc.findById(userId)

  if (user) {
    res.json(user)
  } else {
    res.status(404).json({ error: "用户不存在" })
  }
})

// 5. 运行 Adapter
const mockRequest: ExpressRequest = {
  params: { id: "1" },
  query: {},
  body: {},
}

const mockResponse: ExpressResponse = {
  json: (data) => console.log("响应 JSON:", data),
  status: (code) => {
    console.log("状态码:", code)
    return mockResponse
  },
}

const MockUserService = Layer.succeed(UserService, {
  findById: (id) => Effect.succeed({ id, name: "Alice" }),
})

const program = handleGetUser.pipe(
  Effect.provide(
    Layer.mergeAll(
      MockUserService,
      Layer.succeed(RequestContext, mockRequest),
      Layer.succeed(ResponseContext, mockResponse),
    ),
  ),
)

Effect.runPromise(program)
