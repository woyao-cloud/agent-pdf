import { Effect, Console } from "effect";

// ============================================================
// 01-basic: 错误作为一等公民
// ============================================================

// --- 1. 定义精确的错误类型 ---
// 在 Effect 中，错误是类型系统的一部分，而不是运行时意外

class NetworkError {
  readonly _tag = "NetworkError";
  constructor(
    readonly message: string,
    readonly statusCode: number,
    readonly url: string
  ) {}
}

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
  constructor(readonly id: string, readonly entity: string) {}
}

// --- 2. 函数签名中声明错误类型 ---
// 调用者可以从类型签名中知道可能发生哪些错误

function fetchUser(id: string): Effect.Effect<
  { id: string; name: string },
  NetworkError | NotFoundError,
  never
> {
  if (id === "not-found") {
    return Effect.fail(new NotFoundError(id, "User"));
  }
  if (id === "timeout") {
    return Effect.fail(
      new NetworkError("请求超时", 408, `/api/users/${id}`)
    );
  }
  return Effect.succeed({ id, name: "张三" });
}

function validateAge(age: number): Effect.Effect<number, ValidationError, never> {
  if (age < 0) {
    return Effect.fail(
      new ValidationError("age", "年龄不能为负数", age)
    );
  }
  if (age > 150) {
    return Effect.fail(
      new ValidationError("age", "年龄不能超过 150", age)
    );
  }
  return Effect.succeed(age);
}

// --- 3. catchTag: 精确捕获特定错误 ---
const catchTagDemo = Effect.gen(function* () {
  const result = yield* fetchUser("not-found").pipe(
    Effect.catchTag("NotFoundError", (err) => {
      console.log(`[catchTag] 处理 NotFoundError: ${err.entity} ${err.id}`);
      return Effect.succeed({ id: err.id, name: "默认用户" });
    }),
    Effect.catchTag("NetworkError", (err) => {
      console.log(`[catchTag] 处理 NetworkError: ${err.message}`);
      return Effect.succeed({ id: "unknown", name: "离线用户" });
    })
  );
  return result;
});

// --- 4. catchAll: 捕获所有错误 ---
const catchAllDemo = Effect.gen(function* () {
  const result = yield* fetchUser("timeout").pipe(
    Effect.catchAll((err) => {
      console.log(`[catchAll] 捕获错误: ${err._tag}`);
      return Effect.succeed({ id: "fallback", name: "兜底用户" });
    })
  );
  return result;
});

// --- 5. mapError: 转换错误类型 ---
class AppError {
  readonly _tag = "AppError";
  constructor(
    readonly code: string,
    readonly message: string,
    readonly originalError: unknown
  ) {}
}

const mapErrorDemo = Effect.gen(function* () {
  const result = yield* fetchUser("timeout").pipe(
    Effect.mapError((err) => {
      if (err._tag === "NetworkError") {
        return new AppError("NETWORK_ERROR", err.message, err);
      }
      if (err._tag === "NotFoundError") {
        return new AppError("NOT_FOUND", `${err.entity} ${err.id} 未找到`, err);
      }
      return new AppError("UNKNOWN", "未知错误", err);
    })
  );
  return result;
});

// --- 6. catchSome: 选择性捕获 ---
const catchSomeDemo = Effect.gen(function* () {
  const result = yield* fetchUser("not-found").pipe(
    Effect.catchSome((err) => {
      if (err._tag === "NotFoundError" && err.entity === "User") {
        return Effect.option(Effect.succeed({ id: err.id, name: "默认用户" }));
      }
      return Effect.option.none();
    })
  );
  return result;
});

// --- 7. orElse: 失败时执行备选方案 ---
const orElseDemo = Effect.gen(function* () {
  const result = yield* fetchUser("not-found").pipe(
    Effect.orElse(() => fetchUser("user-1"))
  );
  return result;
});

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== 错误作为一等公民 ===\n");

  console.log("--- catchTag 精确捕获 ---");
  const r1 = await Effect.runPromise(catchTagDemo);
  console.log("结果:", r1);
  console.log("");

  console.log("--- catchAll 全部捕获 ---");
  const r2 = await Effect.runPromise(catchAllDemo);
  console.log("结果:", r2);
  console.log("");

  console.log("--- mapError 错误转换 ---");
  const r3 = await Effect.runPromise(mapErrorDemo);
  console.log("结果:", r3);
  console.log("");

  console.log("--- catchSome 选择性捕获 ---");
  const r4 = await Effect.runPromise(catchSomeDemo);
  console.log("结果:", r4);
  console.log("");

  console.log("--- orElse 备选方案 ---");
  const r5 = await Effect.runPromise(orElseDemo);
  console.log("结果:", r5);
}

main();
