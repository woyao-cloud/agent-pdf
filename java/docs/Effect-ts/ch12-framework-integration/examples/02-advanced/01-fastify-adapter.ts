import { Effect, Context, Layer, Scope } from "effect"

// Fastify Adapter：将 Fastify Request/Reply 转化为 Effect Scope/Context

// 模拟 Fastify 类型
interface FastifyRequest {
  url: string
  method: string
  params: Record<string, string>
  query: Record<string, string>
  body: unknown
}

interface FastifyReply {
  statusCode: number
  send: (data: unknown) => void
  header: (name: string, value: string) => FastifyReply
}

// 将 Fastify Request 放入 Effect Context
class FastifyRequestContext extends Context.Tag("FastifyRequestContext")<
  FastifyRequestContext,
  FastifyRequest
>() {}

class FastifyReplyContext extends Context.Tag("FastifyReplyContext")<
  FastifyReplyContext,
  FastifyReply
>() {}

// 业务逻辑
const handleCreateProduct = Effect.gen(function* () {
  const req = yield* FastifyRequestContext
  const reply = yield* FastifyReplyContext

  const body = req.body as { name?: string; price?: number }

  if (!body.name || !body.price) {
    reply.statusCode = 400
    reply.send({ error: "名称和价格是必填项" })
    return
  }

  // 处理业务逻辑...
  reply.statusCode = 201
  reply.header("content-type", "application/json")
  reply.send({ id: 1, name: body.name, price: body.price })
})

// Fastify 路由处理函数
const fastifyRouteHandler = (req: FastifyRequest, reply: FastifyReply) => {
  const program = handleCreateProduct.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(FastifyRequestContext, req),
        Layer.succeed(FastifyReplyContext, reply),
      ),
    ),
  )

  return Effect.runPromise(program)
}

// 测试
const mockReq: FastifyRequest = {
  url: "/products",
  method: "POST",
  params: {},
  query: {},
  body: { name: "新商品", price: 99.99 },
}

const mockReply: FastifyReply = {
  statusCode: 200,
  send: (data) => console.log("发送响应:", JSON.stringify(data)),
  header: (name, value) => {
    console.log(`设置头: ${name}=${value}`)
    return mockReply
  },
}

fastifyRouteHandler(mockReq, mockReply)
