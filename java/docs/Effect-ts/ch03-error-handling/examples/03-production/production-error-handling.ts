import { Effect, Console, Schedule, Duration } from "effect";

// ============================================================
// 03-production: 生产级错误处理
// ============================================================

// --- 1. 完整的错误体系定义 ---

// 基础设施错误
class HttpError {
  readonly _tag = "HttpError";
  constructor(
    readonly statusCode: number,
    readonly message: string,
    readonly url: string,
    readonly response?: unknown
  ) {}
}

class NetworkTimeoutError {
  readonly _tag = "NetworkTimeoutError";
  constructor(
    readonly message: string,
    readonly timeoutMs: number,
    readonly url: string
  ) {}
}

class RateLimitError {
  readonly _tag = "RateLimitError";
  constructor(
    readonly message: string,
    readonly retryAfterMs: number,
    readonly limit: number
  ) {}
}

// 数据错误
class ValidationError {
  readonly _tag = "ValidationError";
  constructor(
    readonly field: string,
    readonly message: string,
    readonly value: unknown
  ) {}
}

class NotFoundError {
  readonly _tag = "NotFoundError";
  constructor(
    readonly entity: string,
    readonly id: string
  ) {}
}

class ConflictError {
  readonly _tag = "ConflictError";
  constructor(
    readonly message: string,
    readonly resource: string
  ) {}
}

// 业务错误
class InsufficientFundsError {
  readonly _tag = "InsufficientFundsError";
  constructor(
    readonly accountId: string,
    readonly balance: number,
    readonly required: number
  ) {}
}

class AccountLockedError {
  readonly _tag = "AccountLockedError";
  constructor(
    readonly accountId: string,
    readonly reason: string,
    readonly lockedUntil: Date
  ) {}
}

class FraudDetectionError {
  readonly _tag = "FraudDetectionError";
  constructor(
    readonly transactionId: string,
    readonly riskScore: number,
    readonly reason: string
  ) {}
}

// 组合错误类型
type InfrastructureError = HttpError | NetworkTimeoutError | RateLimitError;
type DataError = ValidationError | NotFoundError | ConflictError;
type BusinessError = InsufficientFundsError | AccountLockedError | FraudDetectionError;
type AppError = InfrastructureError | DataError | BusinessError;

// --- 2. 错误分类工具 ---
function isInfrastructureError(err: AppError): err is InfrastructureError {
  return ["HttpError", "NetworkTimeoutError", "RateLimitError"].includes(err._tag);
}

function isDataError(err: AppError): err is DataError {
  return ["ValidationError", "NotFoundError", "ConflictError"].includes(err._tag);
}

function isBusinessError(err: AppError): err is BusinessError {
  return ["InsufficientFundsError", "AccountLockedError", "FraudDetectionError"].includes(err._tag);
}

// --- 3. 重试策略工厂 ---
function retryPolicyFor(error: AppError): Schedule.Schedule<unknown, AppError, number> {
  if (isInfrastructureError(error)) {
    // 基础设施错误: 指数退避 + 最多 5 次重试
    return Schedule.exponential(Duration.millis(100)).pipe(
      Schedule.recurs(5)
    );
  }
  if (isDataError(error)) {
    // 数据错误: 不重试
    return Schedule.stop();
  }
  if (isBusinessError(error)) {
    // 业务错误: 有限重试 + 固定间隔
    return Schedule.fixed(Duration.seconds(1)).pipe(
      Schedule.recurs(2)
    );
  }
  return Schedule.stop();
}

// --- 4. 熔断器模式 ---
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeoutMs: number = 30000
  ) {}

  call<A, E>(
    effect: Effect.Effect<A, E, never>
  ): Effect.Effect<A, E | Error, never> {
    return Effect.gen(this, function* () {
      // 检查熔断器状态
      if (this.state === "open") {
        const now = Date.now();
        if (now - this.lastFailureTime >= this.resetTimeoutMs) {
          this.state = "half-open";
          console.log("[熔断器] 进入半开状态");
        } else {
          return yield* Effect.fail(
            new Error("熔断器已打开，请求被拒绝")
          );
        }
      }

      // 执行请求
      const result = yield* effect.pipe(
        Effect.catchAll((err) => {
          this.recordFailure();
          return Effect.fail(err);
        })
      );

      // 成功时重置
      this.reset();
      return result;
    });
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = "open";
      console.log(`[熔断器] 打开 (失败次数: ${this.failureCount})`);
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.state = "closed";
  }

  getState(): string {
    return this.state;
  }
}

// --- 5. 错误报告与日志 ---
function logError(err: AppError, context: string): void {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    context,
    tag: err._tag,
    message: err.message,
    category: isInfrastructureError(err)
      ? "infrastructure"
      : isDataError(err)
      ? "data"
      : "business",
  };
  console.log(`[错误日志] ${JSON.stringify(errorInfo, null, 2)}`);
}

// --- 6. 业务服务 ---
interface TransferRequest {
  fromAccount: string;
  toAccount: string;
  amount: number;
}

class TransferService {
  private circuitBreaker = new CircuitBreaker(3, 10000);

  transfer(
    request: TransferRequest
  ): Effect.Effect<string, AppError, never> {
    return Effect.gen(this, function* () {
      // 验证输入
      if (request.amount <= 0) {
        return yield* Effect.fail(
          new ValidationError("amount", "转账金额必须大于零", request.amount)
        );
      }

      if (request.fromAccount === request.toAccount) {
        return yield* Effect.fail(
          new ValidationError("toAccount", "不能转账到同一账户", request.toAccount)
        );
      }

      // 检查账户状态（模拟）
      if (request.fromAccount === "locked-account") {
        return yield* Effect.fail(
          new AccountLockedError(
            request.fromAccount,
            "账户异常登录",
            new Date(Date.now() + 86400000)
          )
        );
      }

      // 检查余额（模拟）
      if (request.amount > 10000) {
        return yield* Effect.fail(
          new InsufficientFundsError(
            request.fromAccount,
            5000,
            request.amount
          )
        );
      }

      // 风控检查（模拟）
      if (request.amount > 5000) {
        return yield* Effect.fail(
          new FraudDetectionError(
            `TXN-${Date.now()}`,
            0.85,
            "大额转账触发风控"
          )
        );
      }

      // 模拟网络调用
      const networkCall = Effect.sync(() => {
        if (Math.random() < 0.3) {
          throw new Error("网络连接失败");
        }
        return `转账成功: ${request.amount} 从 ${request.fromAccount} 到 ${request.toAccount}`;
      }).pipe(
        Effect.mapError(
          (err) =>
            new HttpError(503, err.message, "/api/transfer")
        )
      );

      // 使用熔断器保护网络调用
      return yield* this.circuitBreaker.call(networkCall);
    });
  }
}

// --- 7. 完整的错误处理管道 ---
function createErrorHandler() {
  return <A>(
    effect: Effect.Effect<A, AppError, never>,
    context: string
  ): Effect.Effect<A, never, never> => {
    return effect.pipe(
      // 重试策略
      Effect.retry(
        Schedule.recurs(3).pipe(
          Schedule.addDelay((err: AppError) => {
            logError(err, context);
            if (err._tag === "RateLimitError") {
              return Duration.millis(err.retryAfterMs);
            }
            return Duration.millis(100);
          })
        )
      ),
      // 错误恢复
      Effect.catchTag("NotFoundError", (err) =>
        Effect.succeed(`未找到 ${err.entity}: ${err.id}` as unknown as A)
      ),
      Effect.catchTag("ValidationError", (err) =>
        Effect.succeed(`验证失败: ${err.field} ${err.message}` as unknown as A)
      ),
      Effect.catchTag("InsufficientFundsError", (err) =>
        Effect.succeed(`余额不足: 需要 ${err.required}，余额 ${err.balance}` as unknown as A)
      ),
      Effect.catchTag("AccountLockedError", (err) =>
        Effect.succeed(`账户已锁定: ${err.reason}` as unknown as A)
      ),
      Effect.catchTag("FraudDetectionError", (err) =>
        Effect.succeed(`风控拒绝: ${err.reason} (风险评分: ${err.riskScore})` as unknown as A)
      ),
      // 兜底
      Effect.catchAll((err) => {
        logError(err, context);
        return Effect.succeed(`系统错误: ${err._tag}` as unknown as A);
      })
    );
  };
}

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== 生产级错误处理演示 ===\n");

  const transferService = new TransferService();
  const handleError = createErrorHandler();

  // 测试各种场景
  const testCases: TransferRequest[] = [
    { fromAccount: "acc-1", toAccount: "acc-2", amount: -100 },
    { fromAccount: "acc-1", toAccount: "acc-1", amount: 100 },
    { fromAccount: "locked-account", toAccount: "acc-2", amount: 100 },
    { fromAccount: "acc-1", toAccount: "acc-2", amount: 20000 },
    { fromAccount: "acc-1", toAccount: "acc-2", amount: 8000 },
    { fromAccount: "acc-1", toAccount: "acc-2", amount: 100 },
  ];

  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.fromAccount} -> ${testCase.toAccount} 金额 ${testCase.amount}`);
    const result = await Effect.runPromise(
      handleError(transferService.transfer(testCase), "transfer-service")
    );
    console.log(`结果: ${result}`);
  }
}

main();
