import { Effect, Schedule, Console, pipe, Duration, Random, Fiber, Option, Either, Chunk, Array, Tuple, Ref, Queue, Stream, DateTime } from "effect"

// ============================================================
// 03-production: 生产级调度系统 —— 微服务健康检查与重试
// ============================================================

// --- 3.1 系统架构 ---

// 我们构建一个生产级的微服务健康检查系统：
// - 定期健康检查：使用 Schedule 定时检查服务状态
// - 智能重试：使用指数退避 + 抖动处理临时故障
// - 熔断器：在连续失败时停止检查
// - 告警通知：在服务异常时发送告警
// - 优雅降级：在服务不可用时使用缓存数据

// --- 3.2 类型定义 ---

interface ServiceHealth {
  serviceName: string
  status: "healthy" | "degraded" | "unhealthy"
  latency: number
  lastChecked: number
  error: Option.Option<string>
}

interface HealthCheckConfig {
  serviceName: string
  url: string
  timeout: Duration.Duration
  healthyThreshold: number
  degradedThreshold: number
}

interface CircuitBreakerState {
  failures: number
  lastFailureTime: number
  state: "closed" | "open" | "half-open"
}

interface Alert {
  serviceName: string
  severity: "info" | "warning" | "critical"
  message: string
  timestamp: number
}

// --- 3.3 健康检查器 ---

class HealthChecker {
  private config: HealthCheckConfig
  private circuitBreaker: Ref.Ref<CircuitBreakerState>
  private alertQueue: Queue.Queue<Alert>

  private constructor(
    config: HealthCheckConfig,
    circuitBreaker: Ref.Ref<CircuitBreakerState>,
    alertQueue: Queue.Queue<Alert>
  ) {
    this.config = config
    this.circuitBreaker = circuitBreaker
    this.alertQueue = alertQueue
  }

  static make(
    config: HealthCheckConfig,
    alertQueue: Queue.Queue<Alert>
  ): Effect.Effect<HealthChecker> {
    return Effect.gen(function* (_) {
      const circuitBreaker = yield* _(Ref.make<CircuitBreakerState>({
        failures: 0,
        lastFailureTime: 0,
        state: "closed",
      }))
      return new HealthChecker(config, circuitBreaker, alertQueue)
    })
  }

  // 执行健康检查
  private check(): Effect.Effect<ServiceHealth, Error> {
    return Effect.gen(function* (_) {
      const startTime = Date.now()

      // 模拟 HTTP 请求
      const response = yield* _(
        Effect.tryPromise({
          try: () => {
            // 模拟网络请求
            const delay = Math.random() * 2000
            return new Promise<{ status: number }>((resolve, reject) => {
              setTimeout(() => {
                if (Math.random() < 0.3) {
                  reject(new Error("Connection timeout"))
                } else {
                  resolve({ status: Math.random() < 0.8 ? 200 : 500 })
                }
              }, delay)
            })
          },
          catch: (err) => new Error(`HTTP request failed: ${err}`),
        })
      )

      const latency = Date.now() - startTime

      // 判断健康状态
      let status: ServiceHealth["status"]
      if (response.status === 200 && latency < 500) {
        status = "healthy"
      } else if (response.status === 200) {
        status = "degraded"
      } else {
        status = "unhealthy"
      }

      return {
        serviceName: this.config.serviceName,
        status,
        latency,
        lastChecked: Date.now(),
        error: Option.none(),
      }
    }).pipe(
      Effect.timeout(this.config.timeout),
      Effect.catchAll((err) =>
        Effect.succeed({
          serviceName: this.config.serviceName,
          status: "unhealthy" as const,
          latency: -1,
          lastChecked: Date.now(),
          error: Option.some(err.message),
        })
      )
    )
  }

  // 熔断器检查
  private checkCircuitBreaker(): Effect.Effect<boolean> {
    return Ref.get(this.circuitBreaker).pipe(
      Effect.andThen((state) => {
        if (state.state === "open") {
          const elapsed = Date.now() - state.lastFailureTime
          if (elapsed > 30000) {
            // 30 秒后尝试半开
            return Ref.update(this.circuitBreaker, (s) => ({
              ...s,
              state: "half-open",
            })).pipe(Effect.andThen(true))
          }
          return Effect.succeed(false)
        }
        return Effect.succeed(true)
      })
    )
  }

  // 更新熔断器状态
  private updateCircuitBreaker(health: ServiceHealth): Effect.Effect<void> {
    if (health.status === "unhealthy") {
      return Ref.update(this.circuitBreaker, (state) => ({
        failures: state.failures + 1,
        lastFailureTime: Date.now(),
        state: state.failures >= 5 ? "open" : "closed",
      }))
    }
    return Ref.update(this.circuitBreaker, (s) => ({
      ...s,
      failures: 0,
      state: "closed" as const,
    }))
  }

  // 发送告警
  private sendAlert(health: ServiceHealth): Effect.Effect<void> {
    if (health.status === "unhealthy") {
      return Queue.offer(this.alertQueue, {
        serviceName: this.config.serviceName,
        severity: "critical",
        message: `Service ${this.config.serviceName} is unhealthy: ${health.error}`,
        timestamp: Date.now(),
      }).pipe(Effect.andThen(Console.log(`[ALERT] Critical: ${this.config.serviceName}`)))
    }
    if (health.status === "degraded") {
      return Queue.offer(this.alertQueue, {
        serviceName: this.config.serviceName,
        severity: "warning",
        message: `Service ${this.config.serviceName} is degraded (latency: ${health.latency}ms)`,
        timestamp: Date.now(),
      }).pipe(Effect.andThen(Console.log(`[ALERT] Warning: ${this.config.serviceName}`)))
    }
    return Effect.void
  }

  // 执行一次完整的健康检查周期
  checkHealth(): Effect.Effect<ServiceHealth> {
    return Effect.gen(function* (_) {
      const canProceed = yield* _(this.checkCircuitBreaker())
      if (!canProceed) {
        console.log(`Circuit breaker open for ${this.config.serviceName}, skipping check`)
        return {
          serviceName: this.config.serviceName,
          status: "unhealthy" as const,
          latency: -1,
          lastChecked: Date.now(),
          error: Option.some("circuit breaker open"),
        }
      }

      const health = yield* _(this.check())
      yield* _(this.updateCircuitBreaker(health))
      yield* _(this.sendAlert(health))

      console.log(
        `[${this.config.serviceName}] status: ${health.status}, ` +
        `latency: ${health.latency}ms`
      )

      return health
    })
  }

  // 获取重试策略
  getRetryPolicy(): Schedule.Schedule<number, void, never> {
    return Schedule.exponential("1 seconds", 2.0).pipe(
      Schedule.compose(Schedule.recurs(3)),
      Schedule.jittered({ min: 0.5, max: 1.5 }),
      Schedule.tap((n) => Console.log(`Retrying ${this.config.serviceName} (attempt ${n})`))
    )
  }

  // 获取定期检查策略
  getCheckSchedule(): Schedule.Schedule<number, void, never> {
    return Schedule.fixed("5 seconds").pipe(
      Schedule.tap((n) => Console.log(`Scheduled check #${n} for ${this.config.serviceName}`))
    )
  }
}

// --- 3.4 告警处理器 ---

class AlertProcessor {
  private alertQueue: Queue.Queue<Alert>

  private constructor(alertQueue: Queue.Queue<Alert>) {
    this.alertQueue = alertQueue
  }

  static make(alertQueue: Queue.Queue<Alert>): AlertProcessor {
    return new AlertProcessor(alertQueue)
  }

  // 处理告警
  processAlerts(): Effect.Effect<void> {
    const processOne = Effect.gen(function* (_) {
      const alert = yield* _(Queue.take(this.alertQueue))
      console.log(`[AlertProcessor] ${alert.severity}: ${alert.message}`)
    })

    return processOne.pipe(Effect.forever)
  }
}

// --- 3.5 主程序 ---

const main = Effect.gen(function* (_) {
  console.log("=== Production Health Check System ===\n")

  // 创建告警队列
  const alertQueue = yield* _(Queue.unbounded<Alert>())

  // 创建健康检查器
  const checker1 = yield* _(HealthChecker.make(
    {
      serviceName: "user-service",
      url: "http://user-service:3000/health",
      timeout: "3 seconds",
      healthyThreshold: 200,
      degradedThreshold: 500,
    },
    alertQueue
  ))

  const checker2 = yield* _(HealthChecker.make(
    {
      serviceName: "order-service",
      url: "http://order-service:3001/health",
      timeout: "3 seconds",
      healthyThreshold: 200,
      degradedThreshold: 500,
    },
    alertQueue
  ))

  // 启动告警处理器
  const alertProcessor = AlertProcessor.make(alertQueue)
  const alertFiber = yield* _(Effect.fork(alertProcessor.processAlerts()))

  // 启动定期健康检查
  const healthCheck1 = yield* _(Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        const health = yield* _(checker1.checkHealth())
        if (health.status === "unhealthy") {
          // 使用重试策略
          const retried = yield* _(
            checker1.checkHealth().pipe(
              Effect.retry(checker1.getRetryPolicy())
            )
          )
          console.log(`[${checker1["config"].serviceName}] recovered: ${retried.status}`)
        }
        yield* _(Effect.sleep("5 seconds"))
      }
    })
  ))

  const healthCheck2 = yield* _(Effect.fork(
    Effect.gen(function* (_) {
      while (true) {
        const health = yield* _(checker2.checkHealth())
        if (health.status === "unhealthy") {
          const retried = yield* _(
            checker2.checkHealth().pipe(
              Effect.retry(checker2.getRetryPolicy())
            )
          )
          console.log(`[${checker2["config"].serviceName}] recovered: ${retried.status}`)
        }
        yield* _(Effect.sleep("5 seconds"))
      }
    })
  ))

  // 运行 30 秒后停止
  yield* _(Effect.sleep("30 seconds"))

  // 清理
  yield* _(Fiber.interrupt(healthCheck1))
  yield* _(Fiber.interrupt(healthCheck2))
  yield* _(Fiber.interrupt(alertFiber))
  yield* _(Queue.shutdown(alertQueue))

  console.log("\n=== Health Check System Stopped ===")
})

Effect.runPromise(main).then(
  () => console.log("Production health check system completed"),
  (err) => console.error("System failed:", err)
)
