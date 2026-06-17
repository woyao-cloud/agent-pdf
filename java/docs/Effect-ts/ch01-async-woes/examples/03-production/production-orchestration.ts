import { Effect, Console, Schedule, Duration } from "effect";

// ============================================================
// 03-production: 生产级异步编排
// ============================================================

// --- 领域模型 ---
interface User {
  id: string;
  name: string;
  email: string;
}

interface Order {
  id: string;
  userId: string;
  amount: number;
  status: "pending" | "paid" | "shipped";
}

interface PaymentResult {
  transactionId: string;
  success: boolean;
}

// --- 错误类型（精确分类）---
class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(readonly message: string, readonly cause?: unknown) {}
}

class NetworkError {
  readonly _tag = "NetworkError";
  constructor(readonly message: string, readonly cause?: unknown) {}
}

class BusinessError {
  readonly _tag = "BusinessError";
  constructor(readonly code: string, readonly message: string) {}
}

class ValidationError {
  readonly _tag = "ValidationError";
  constructor(readonly field: string, readonly message: string) {}
}

// --- 服务接口（环境依赖）---
interface UserRepository {
  readonly findById: (id: string) => Effect.Effect<User, DatabaseError, never>;
  readonly updateBalance: (
    userId: string,
    amount: number
  ) => Effect.Effect<void, DatabaseError, never>;
}

interface OrderRepository {
  readonly create: (
    order: Omit<Order, "id">
  ) => Effect.Effect<Order, DatabaseError, never>;
  readonly updateStatus: (
    orderId: string,
    status: Order["status"]
  ) => Effect.Effect<void, DatabaseError, never>;
}

interface PaymentGateway {
  readonly charge: (
    userId: string,
    amount: number
  ) => Effect.Effect<PaymentResult, NetworkError | BusinessError, never>;
}

interface EmailService {
  readonly sendReceipt: (
    email: string,
    orderId: string
  ) => Effect.Effect<void, NetworkError, never>;
}

// --- 服务标签 ---
const UserRepository = Effect.service(UserRepository);
const OrderRepository = Effect.service(OrderRepository);
const PaymentGateway = Effect.service(PaymentGateway);
const EmailService = Effect.service(EmailService);

// --- 核心业务逻辑 ---

// 验证订单金额
const validateAmount = (amount: number): Effect.Effect<number, ValidationError, never> => {
  if (amount <= 0) {
    return Effect.fail(
      new ValidationError("amount", "订单金额必须大于零")
    );
  }
  if (amount > 100000) {
    return Effect.fail(
      new ValidationError("amount", "订单金额不能超过 100,000")
    );
  }
  return Effect.succeed(amount);
};

// 创建订单
const createOrder = (
  userId: string,
  amount: number
): Effect.Effect<Order, DatabaseError | ValidationError, UserRepository | OrderRepository> => {
  return Effect.flatMap(validateAmount(amount), (validAmount) =>
    Effect.flatMap(Effect.service(UserRepository), (userRepo) =>
      Effect.flatMap(Effect.service(OrderRepository), (orderRepo) =>
        Effect.flatMap(
          userRepo.findById(userId),
          (user) =>
            Effect.flatMap(
              orderRepo.create({
                userId: user.id,
                amount: validAmount,
                status: "pending",
              }),
              (order) => Effect.succeed(order)
            )
        )
      )
    )
  );
};

// 处理支付（带重试策略）
const processPayment = (
  userId: string,
  amount: number
): Effect.Effect<PaymentResult, DatabaseError | NetworkError | BusinessError, UserRepository | PaymentGateway> => {
  const payment = Effect.flatMap(Effect.service(PaymentGateway), (gateway) =>
    gateway.charge(userId, amount)
  );

  // 重试策略: 最多重试 3 次，指数退避
  const retryPolicy = Schedule.exponential(Duration.millis(100)).pipe(
    Schedule.whileInput((err: NetworkError | BusinessError) => {
      // 网络错误可以重试，业务错误不重试
      if (err._tag === "NetworkError") return true;
      return false;
    }),
    Schedule.recurs(3)
  );

  return payment.pipe(Effect.retry(retryPolicy));
};

// 发送通知（允许失败，不阻塞主流程）
const sendNotification = (
  email: string,
  orderId: string
): Effect.Effect<void, never, EmailService> => {
  return Effect.flatMap(Effect.service(EmailService), (emailService) =>
    emailService.sendReceipt(email, orderId)
  ).pipe(
    Effect.catchAll((err) =>
      Effect.sync(() => {
        console.error(`[非关键] 发送通知失败: ${err.message}`);
      })
    )
  );
};

// --- 完整下单流程（结构化并发）---
const placeOrder = (
  userId: string,
  amount: number
): Effect.Effect<
  { order: Order; payment: PaymentResult },
  DatabaseError | NetworkError | BusinessError | ValidationError,
  UserRepository | OrderRepository | PaymentGateway | EmailService
> => {
  return Effect.flatMap(createOrder(userId, amount), (order) =>
    Effect.flatMap(processPayment(userId, amount), (payment) => {
      if (!payment.success) {
        return Effect.fail(
          new BusinessError("PAYMENT_FAILED", "支付失败")
        );
      }

      // 更新订单状态和发送通知并行执行
      const updateStatus = Effect.flatMap(
        Effect.service(OrderRepository),
        (repo) => repo.updateStatus(order.id, "paid")
      );

      const notify = Effect.flatMap(
        Effect.service(UserRepository),
        (repo) =>
          Effect.flatMap(repo.findById(userId), (user) =>
            sendNotification(user.email, order.id)
          )
      );

      // 结构化并发: 两个任务并行，任何一个失败都会取消另一个
      return Effect.flatMap(
        Effect.all([updateStatus, notify], { concurrency: "unbounded" }),
        () => Effect.succeed({ order, payment })
      );
    })
  );
};

// --- Mock 服务实现 ---
const mockUserRepo: UserRepository = {
  findById: (id) =>
    Effect.succeed({ id, name: "张三", email: "zhangsan@example.com" }),
  updateBalance: (_, amount) =>
    Effect.sync(() => console.log(`[DB] 更新用户余额: ${amount}`)),
};

const mockOrderRepo: OrderRepository = {
  create: (order) =>
    Effect.succeed({
      ...order,
      id: `ORD-${Date.now()}`,
    }),
  updateStatus: (orderId, status) =>
    Effect.sync(() => console.log(`[DB] 订单 ${orderId} 状态更新为: ${status}`)),
};

const mockPaymentGateway: PaymentGateway = {
  charge: (userId, amount) =>
    Effect.succeed({ transactionId: `TXN-${Date.now()}`, success: true }),
};

const mockEmailService: EmailService = {
  sendReceipt: (email, orderId) =>
    Effect.sync(() => console.log(`[Email] 发送收据到 ${email}，订单: ${orderId}`)),
};

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== 生产级异步编排演示 ===\n");

  const program = placeOrder("user-001", 2999).pipe(
    Effect.provideService(UserRepository, mockUserRepo),
    Effect.provideService(OrderRepository, mockOrderRepo),
    Effect.provideService(PaymentGateway, mockPaymentGateway),
    Effect.provideService(EmailService, mockEmailService)
  );

  const result = await Effect.runPromise(program);
  console.log("\n下单成功:", JSON.stringify(result, null, 2));
}

main();
