import { Effect, Context, Layer } from "effect"

// Hono + Effect 集成

// 模拟 Hono 类型
interface HonoContext {
  req: {
    param: (key: string) => string | undefined
    query: (key: string) => string | undefined
    json: <T>() => Promise<T>
  }
  json: (data: unknown, status?: number) => Response
}

// 将 Hono Context 放入 Effect Context
class HonoCtx extends Context.Tag("HonoCtx")<HonoCtx, HonoContext>() {}

// 业务服务
interface ProductService {
  readonly list: (page: number, size: number) => Effect.Effect<{ items: unknown[]; total: number }>
  readonly getById: (id: number) => Effect.Effect<unknown | null>
}

class ProductService extends Context.Tag("ProductService")<
  ProductService,
  ProductService
>() {}

// Effect 路由处理
const listProducts = Effect.gen(function* () {
  const ctx = yield* HonoCtx
  const svc = yield* ProductService

  const page = parseInt(ctx.req.query("page") ?? "1", 10)
  const size = parseInt(ctx.req.query("size") ?? "10", 10)

  const result = yield* svc.list(page, size)
  return ctx.json(result, 200)
})

const getProduct = Effect.gen(function* () {
  const ctx = yield* HonoCtx
  const svc = yield* ProductService

  const id = parseInt(ctx.req.param("id") ?? "0", 10)
  const product = yield* svc.getById(id)

  if (!product) {
    return ctx.json({ error: "产品不存在" }, 404)
  }
  return ctx.json(product, 200)
})

// Hono 路由注册
const honoRouteHandler = (ctx: HonoContext) => {
  const program = getProduct.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(HonoCtx, ctx),
        Layer.succeed(ProductService, {
          list: (page, size) =>
            Effect.succeed({
              items: [{ id: 1, name: "商品1" }],
              total: 1,
            }),
          getById: (id) =>
            Effect.succeed({ id, name: `商品${id}`, price: 99.99 }),
        }),
      ),
    ),
  )

  return Effect.runPromise(program)
}

// 测试
const mockCtx: HonoContext = {
  req: {
    param: (key) => (key === "id" ? "1" : undefined),
    query: () => undefined,
    json: async () => ({}),
  },
  json: (data, status) => {
    console.log(`状态 ${status ?? 200}:`, JSON.stringify(data))
    return new Response(JSON.stringify(data), { status: status ?? 200 })
  },
}

honoRouteHandler(mockCtx)
