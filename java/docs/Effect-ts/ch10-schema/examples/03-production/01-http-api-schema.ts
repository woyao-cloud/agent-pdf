import { Schema } from "@effect/schema"
import { Effect } from "effect"

// 生产级 HTTP API Schema 定义

// 通用 API 响应包装
const ApiResponse = <A>(schema: Schema.Schema<A>) =>
  Schema.Struct({
    success: Schema.Boolean,
    data: schema,
    timestamp: Schema.Number,
    requestId: Schema.String,
  })

// 用户 API Schema
const UserSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String.pipe(Schema.email()),
  createdAt: Schema.String,
})

// 创建用户请求
const CreateUserRequest = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.String.pipe(Schema.email()),
  password: Schema.String.pipe(Schema.minLength(8)),
})

// 分页参数
const PaginationParams = Schema.Struct({
  page: Schema.Number.pipe(Schema.int(), Schema.positive()),
  pageSize: Schema.Number.pipe(Schema.int(), Schema.between(1, 100)),
})

// 用户列表响应
const UserListResponse = ApiResponse(
  Schema.Struct({
    items: Schema.Array(UserSchema),
    total: Schema.Number,
    page: Schema.Number,
    pageSize: Schema.Number,
  }),
)

type CreateUserRequest = Schema.Schema.Type<typeof CreateUserRequest>
type UserListResponse = Schema.Schema.Type<typeof UserListResponse>

// 模拟处理函数
const handleCreateUser = (req: CreateUserRequest): Effect.Effect<UserListResponse> =>
  Effect.succeed({
    success: true,
    data: {
      items: [
        {
          id: 1,
          name: req.name,
          email: req.email,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    },
    timestamp: Date.now(),
    requestId: "req-001",
  })

const program = Effect.gen(function* () {
  // 验证请求
  const rawReq: unknown = {
    name: "Alice",
    email: "alice@example.com",
    password: "securePass123",
  }

  const validReq = yield* Schema.decode(CreateUserRequest)(rawReq)
  const response = yield* handleCreateUser(validReq)
  console.log("API 响应:", JSON.stringify(response, null, 2))
})

Effect.runPromise(program)
