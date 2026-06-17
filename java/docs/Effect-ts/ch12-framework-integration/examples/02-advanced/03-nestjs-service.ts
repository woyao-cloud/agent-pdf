import { Effect, Context, Layer } from "effect"

// NestJS 服务集成：在 NestJS 中使用 Effect

// 模拟 NestJS 装饰器
function Injectable() {
  return (target: any) => target
}

// 1. 定义 Effect 服务
interface EmailService {
  readonly sendWelcome: (email: string) => Effect.Effect<void>
}

class EmailService extends Context.Tag("EmailService")<
  EmailService,
  EmailService
>() {}

// 2. NestJS 可注入服务
@Injectable()
class UserServiceNestJS {
  private readonly effectLayer: Layer.Layer<never, never, EmailService>

  constructor() {
    this.effectLayer = Layer.succeed(EmailService, {
      sendWelcome: (email) =>
        Effect.sync(() => {
          console.log(`[NestJS] 发送欢迎邮件至 ${email}`)
        }),
    })
  }

  async createUser(name: string, email: string) {
    const program = Effect.gen(function* () {
      const emailSvc = yield* EmailService
      yield* emailSvc.sendWelcome(email)
      return { id: Date.now(), name, email }
    })

    return Effect.runPromise(program.pipe(Effect.provide(this.effectLayer)))
  }
}

// 3. 使用
const nestService = new UserServiceNestJS()
nestService.createUser("Alice", "alice@example.com").then(console.log)
