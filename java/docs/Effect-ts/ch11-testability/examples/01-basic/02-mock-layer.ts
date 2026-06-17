import { Effect, Context, Layer, Duration, Schedule } from "effect"

// Mock Layer：为测试提供可控的依赖实现

interface EmailService {
  readonly send: (to: string, subject: string, body: string) => Effect.Effect<void>
}

class EmailService extends Context.Tag("EmailService")<
  EmailService,
  EmailService
>() {}

// 生产实现
const LiveEmailService = Layer.succeed(EmailService, {
  send: (to, subject, body) =>
    Effect.sync(() => {
      console.log(`[真实邮件] 发送至 ${to}: ${subject}`)
      // 实际发送邮件...
    }),
})

// Mock 实现 — 不真正发送邮件，只记录调用
const MockEmailService = Layer.succeed(EmailService, {
  send: (to, subject, body) =>
    Effect.sync(() => {
      console.log(`[Mock邮件] 拦截发送至 ${to}: ${subject}`)
    }),
})

// 带延迟的 Mock — 模拟网络延迟
const DelayedMockEmailService = Layer.succeed(EmailService, {
  send: (to, subject, body) =>
    Effect.sleep(Duration.millis(100)).pipe(
      Effect.andThen(
        Effect.sync(() => {
          console.log(`[延迟Mock] 发送至 ${to}: ${subject}`)
        }),
      ),
    ),
})

// 业务逻辑
const notifyUser = (userId: number, message: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    const email = yield* EmailService
    yield* email.send(`user${userId}@example.com`, "通知", message)
  })

// 测试
const testProgram = notifyUser(1, "欢迎加入！").pipe(
  Effect.provide(MockEmailService),
)

Effect.runPromise(testProgram)
