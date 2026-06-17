import { Effect, Console } from "effect";

// ============================================================
// 02-advanced: TaggedUnion 与精确错误分类
// ============================================================

// --- 1. 使用 TaggedUnion 定义错误体系 ---
// TaggedUnion 是 TypeScript 中的一种模式，使用 _tag 字段来区分联合类型中的不同成员

// 基础错误类型
class DatabaseConnectionError {
  readonly _tag = "DatabaseConnectionError";
  constructor(
    readonly message: string,
    readonly host: string,
    readonly port: number
  ) {}
}

class DatabaseQueryError {
  readonly _tag = "DatabaseQueryError";
  constructor(
    readonly message: string,
    readonly sql: string,
    readonly params: unknown[]
  ) {}
}

class DatabaseTimeoutError {
  readonly _tag = "DatabaseTimeoutError";
  constructor(
    readonly message: string,
    readonly timeoutMs: number
  ) {}
}

// 组合成联合类型
type DatabaseError =
  | DatabaseConnectionError
  | DatabaseQueryError
  | DatabaseTimeoutError;

// --- 2. 分层错误体系 ---
// 在实际应用中，错误通常有层次结构

// 基础设施层错误
class HttpError {
  readonly _tag = "HttpError";
  constructor(
    readonly statusCode: number,
    readonly message: string,
    readonly url: string
  ) {}
}

class SerializationError {
  readonly _tag = "SerializationError";
  constructor(
    readonly message: string,
    readonly data: unknown
  ) {}
}

// 业务层错误
class InsufficientBalanceError {
  readonly _tag = "InsufficientBalanceError";
  constructor(
    readonly userId: string,
    readonly balance: number,
    readonly required: number
  ) {}
}

class OrderAlreadyProcessedError {
  readonly _tag = "OrderAlreadyProcessedError";
  constructor(
    readonly orderId: string,
    readonly currentStatus: string
  ) {}
}

class UserSuspendedError {
  readonly _tag = "UserSuspendedError";
  constructor(
    readonly userId: string,
    readonly reason: string,
    readonly suspendedAt: Date
  ) {}
}

// 应用层错误（组合所有可能的错误）
type AppError =
  | HttpError
  | SerializationError
  | InsufficientBalanceError
  | OrderAlreadyProcessedError
  | UserSuspendedError;

// --- 3. 使用 TaggedUnion 进行模式匹配 ---
function handleAppError(err: AppError): string {
  switch (err._tag) {
    case "HttpError":
      return `HTTP ${err.statusCode}: ${err.message} (${err.url})`;
    case "SerializationError":
      return `序列化失败: ${err.message}`;
    case "InsufficientBalanceError":
      return `余额不足: 用户 ${err.userId} 需要 ${err.required}，余额 ${err.balance}`;
    case "OrderAlreadyProcessedError":
      return `订单已处理: ${err.orderId} 当前状态 ${err.currentStatus}`;
    case "UserSuspendedError":
      return `用户已停用: ${err.userId} 原因 ${err.reason}`;
    default:
      return `未知错误`;
  }
}

// --- 4. 精确的错误处理链 ---
// 模拟一个复杂的业务场景

interface Account {
  id: string;
  balance: number;
  status: "active" | "suspended";
}

interface Order {
  id: string;
  userId: string;
  amount: number;
  status: "pending" | "processed";
}

// 获取用户账户
function getAccount(userId: string): Effect.Effect<Account, HttpError, never> {
  return Effect.succeed({
    id: userId,
    balance: 5000,
    status: "active",
  });
}

// 获取订单
function getOrder(orderId: string): Effect.Effect<Order, HttpError, never> {
  return Effect.succeed({
    id: orderId,
    userId: "user-1",
    amount: 3000,
    status: "pending",
  });
}

// 检查用户状态
function checkUserStatus(
  account: Account
): Effect.Effect<Account, UserSuspendedError, never> {
  if (account.status === "suspended") {
    return Effect.fail(
      new UserSuspendedError(account.id, "账户异常", new Date())
    );
  }
  return Effect.succeed(account);
}

// 检查订单状态
function checkOrderStatus(
  order: Order
): Effect.Effect<Order, OrderAlreadyProcessedError, never> {
  if (order.status === "processed") {
    return Effect.fail(
      new OrderAlreadyProcessedError(order.id, order.status)
    );
  }
  return Effect.succeed(order);
}

// 检查余额
function checkBalance(
  account: Account,
  order: Order
): Effect.Effect<Account, InsufficientBalanceError, never> {
  if (account.balance < order.amount) {
    return Effect.fail(
      new InsufficientBalanceError(
        account.id,
        account.balance,
        order.amount
      )
    );
  }
  return Effect.succeed(account);
}

// 处理支付
function processPayment(
  account: Account,
  order: Order
): Effect.Effect<string, never, never> {
  return Effect.succeed(`支付成功: 订单 ${order.id} 金额 ${order.amount}`);
}

// --- 5. 完整的支付流程 ---
const paymentFlow = (userId: string, orderId: string) =>
  Effect.gen(function* () {
    // 获取数据
    const account = yield* getAccount(userId);
    const order = yield* getOrder(orderId);

    // 业务校验
    yield* checkUserStatus(account);
    yield* checkOrderStatus(order);
    yield* checkBalance(account, order);

    // 处理支付
    const result = yield* processPayment(account, order);
    return result;
  });

// --- 6. 分层错误处理 ---
const handlePaymentFlow = (userId: string, orderId: string) =>
  paymentFlow(userId, orderId).pipe(
    // 第一层: 处理业务错误
    Effect.catchTag("InsufficientBalanceError", (err) =>
      Effect.succeed(`余额不足: 需要 ${err.required}，余额 ${err.balance}`)
    ),
    Effect.catchTag("OrderAlreadyProcessedError", (err) =>
      Effect.succeed(`订单 ${err.orderId} 已处理`)
    ),
    Effect.catchTag("UserSuspendedError", (err) =>
      Effect.succeed(`用户 ${err.userId} 已停用: ${err.reason}`)
    ),
    // 第二层: 处理基础设施错误
    Effect.catchTag("HttpError", (err) =>
      Effect.succeed(`网络错误: ${err.statusCode} ${err.message}`)
    ),
    // 第三层: 兜底处理
    Effect.catchAll((err) =>
      Effect.succeed(`未知错误: ${err._tag}`)
    )
  );

// --- 7. Defect 与 Error 的区别 ---
// Error 是预期的错误，在类型系统中声明
// Defect 是非预期的错误，如程序 bug、断言失败等

function divide(a: number, b: number): Effect.Effect<number, Error, never> {
  if (b === 0) {
    return Effect.die(new Error("除以零")); // 这是一个 Defect，不是 Error
  }
  return Effect.succeed(a / b);
}

const defectDemo = Effect.gen(function* () {
  // Effect.die 创建的 Defect 不会被 catchAll 捕获
  const result = yield* divide(10, 0).pipe(
    Effect.catchAll((err) => {
      console.log("[catchAll] 这不会捕获 Defect");
      return Effect.succeed(-1);
    })
  );
  return result;
});

// 使用 catchAllDefect 来捕获 Defect
const catchDefectDemo = Effect.gen(function* () {
  const result = yield* divide(10, 0).pipe(
    Effect.catchAllDefect((defect) => {
      console.log("[catchAllDefect] 捕获 Defect:", defect);
      return Effect.succeed(-1);
    })
  );
  return result;
});

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== TaggedUnion 与精确错误分类 ===\n");

  console.log("--- 支付流程（正常情况）---");
  const r1 = await Effect.runPromise(handlePaymentFlow("user-1", "order-1"));
  console.log("结果:", r1);
  console.log("");

  console.log("--- Defect 与 Error 区别 ---");
  try {
    await Effect.runPromise(defectDemo);
  } catch (e) {
    console.log("[main] Defect 导致程序崩溃:", e);
  }
  console.log("");

  console.log("--- 捕获 Defect ---");
  const r3 = await Effect.runPromise(catchDefectDemo);
  console.log("结果:", r3);
}

main();
