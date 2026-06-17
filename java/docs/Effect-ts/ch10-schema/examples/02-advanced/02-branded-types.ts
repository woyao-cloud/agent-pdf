import { Schema } from "@effect/schema"
import { Brand } from "effect"
import { Effect } from "effect"

// Branded 类型：在类型层面标记值，防止混淆

// 定义 Brand
type UserId = number & Brand.Brand<"UserId">
const UserId = Brand.nominal<UserId>()

type OrderId = number & Brand.Brand<"OrderId">
const OrderId = Brand.nominal<OrderId>()

// 在 Schema 中使用 Brand
const UserIdSchema = Schema.Number.pipe(
  Schema.brand("UserId"),
)

const OrderIdSchema = Schema.Number.pipe(
  Schema.brand("OrderId"),
)

const OrderSchema = Schema.Struct({
  orderId: OrderIdSchema,
  userId: UserIdSchema,
  amount: Schema.Number,
})

type Order = Schema.Schema.Type<typeof OrderSchema>

const program = Effect.gen(function* () {
  const raw: unknown = { orderId: 1001, userId: 42, amount: 299.99 }

  const order = yield* Schema.decode(OrderSchema)(raw)
  console.log("订单:", order)

  // 类型安全：不能将 UserId 赋值给 OrderId
  // @ts-expect-error — Branded 类型防止混淆
  const wrong: OrderId = order.userId

  // 正确用法
  const correct: OrderId = order.orderId
  const uid: UserId = order.userId
  console.log("类型安全:", correct, uid)
})

Effect.runPromise(program)
