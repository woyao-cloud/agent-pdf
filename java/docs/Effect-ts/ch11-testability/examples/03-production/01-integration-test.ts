import { Effect, Context, Layer, TestContext, TestClock, Duration, Clock } from "effect"

// 集成测试：组合多个服务并验证交互

interface PaymentGateway {
  readonly charge: (amount: number, token: string) => Effect.Effect<string>
}

class PaymentGateway extends Context.Tag("PaymentGateway")<
  PaymentGateway,
  PaymentGateway
>() {}

interface NotificationService {
  readonly notify: (userId: string, message: string) => Effect.Effect<void>
}

class NotificationService extends Context.Tag("NotificationService")<
  NotificationService,
  NotificationService
>() {}

interface OrderRepository {
  readonly save: (order: unknown) => Effect.Effect<void>
  readonly findById: (id: string) => Effect.Effect<unknown | null>
}

class OrderRepository extends Context.Tag("OrderRepository")<
  OrderRepository,
  OrderRepository
>() {}

// Mock 实现
const MockPayment = Layer.succeed(PaymentGateway, {
  charge: (amount, token) => Effect.succeed(`txn_${Date.now()}`),
})

const MockNotification = Layer.succeed(NotificationService, {
  notify: (userId, message) => Effect.void,
})

const MockRepo = Layer.succeed(OrderRepository, {
  save: (order) => Effect.void,
  findById: (id) => Effect.succeed(null),
})

const AllMocks = Layer.mergeAll(MockPayment, MockNotification, MockRepo).pipe(
  Layer.provideMerge(TestContext.TestContext),
)

// 完整的订单处理流程
const placeOrder = (
  userId: string,
  amount: number,
  paymentToken: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const payment = yield* PaymentGateway
    const notification = yield* NotificationService
    const repo = yield* OrderRepository

    const txnId = yield* payment.charge(amount, paymentToken)
    const order = { userId, amount, txnId, status: "paid", createdAt: new Date() }
    yield* repo.save(order)
    yield* notification.notify(userId, `订单支付成功，交易号: ${txnId}`)

    return txnId
  })

// 集成测试
const testProgram = Effect.gen(function* () {
  const result = yield* placeOrder("user_001", 99.99, "tok_test_123")
  console.log(`交易成功: ${result}`)
})

const runnable = testProgram.pipe(Effect.provide(AllMocks))
Effect.runPromise(runnable)
