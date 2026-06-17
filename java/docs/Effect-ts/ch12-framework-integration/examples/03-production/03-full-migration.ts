import { Effect, Context, Layer, Scope } from "effect"

// 完整迁移示例：从 Express 到 Effect 的渐进式迁移

// === 原始代码（Express 风格）===
// async function handleCreateOrder(req, res) {
//   const { userId, items } = req.body
//   const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)
//   const order = await db.orders.create({ userId, items, total, status: 'pending' })
//   await email.send(userId, '订单已创建')
//   res.status(201).json(order)
// }

// === 迁移后（Effect 风格）===

// 1. 服务定义
interface OrderRepo {
  readonly create: (data: {
    userId: string
    items: Array<{ productId: string; price: number; qty: number }>
    total: number
    status: string
  }) => Effect.Effect<{ id: string; total: number; status: string }>
}

class OrderRepo extends Context.Tag("OrderRepo")<OrderRepo, OrderRepo>() {}

interface EmailSvc {
  readonly send: (userId: string, subject: string, body: string) => Effect.Effect<void>
}

class EmailSvc extends Context.Tag("EmailSvc")<EmailSvc, EmailSvc>() {}

// 2. 请求上下文
class CreateOrderRequest extends Context.Tag("CreateOrderRequest")<
  CreateOrderRequest,
  { userId: string; items: Array<{ productId: string; price: number; qty: number }> }
>() {}

// 3. 业务逻辑
const calculateTotal = (items: Array<{ price: number; qty: number }>): number =>
  items.reduce((sum, item) => sum + item.price * item.qty, 0)

const createOrder = Effect.gen(function* () {
  const repo = yield* OrderRepo
  const email = yield* EmailSvc
  const req = yield* CreateOrderRequest

  const total = calculateTotal(req.items)
  const order = yield* repo.create({
    userId: req.userId,
    items: req.items,
    total,
    status: "pending",
  })

  yield* email.send(req.userId, "订单已创建", `订单 #${order.id}，金额 ¥${order.total}`)
  return order
})

// 4. 生产环境 Layer
const LiveOrderRepo = Layer.succeed(OrderRepo, {
  create: (data) =>
    Effect.succeed({ id: `ord_${Date.now()}`, total: data.total, status: "pending" }),
})

const LiveEmailSvc = Layer.succeed(EmailSvc, {
  send: (userId, subject, body) =>
    Effect.sync(() => console.log(`[邮件] 发送至 ${userId}: ${subject} - ${body}`)),
})

const ProductionLayer = Layer.mergeAll(LiveOrderRepo, LiveEmailSvc)

// 5. Express 路由处理
const expressHandler = async (req: any, res: any) => {
  const program = createOrder.pipe(
    Effect.provide(
      Layer.mergeAll(
        ProductionLayer,
        Layer.succeed(CreateOrderRequest, {
          userId: req.body.userId,
          items: req.body.items,
        }),
      ),
    ),
  )

  const order = await Effect.runPromise(program)
  res.status(201).json(order)
}

// 6. 测试
const mockReq = {
  body: {
    userId: "user_001",
    items: [
      { productId: "prod_1", price: 99.99, qty: 2 },
      { productId: "prod_2", price: 49.99, qty: 1 },
    ],
  },
}

const mockRes = {
  status: (code: number) => ({
    json: (data: unknown) => console.log(`状态 ${code}:`, JSON.stringify(data)),
  }),
}

expressHandler(mockReq, mockRes)
