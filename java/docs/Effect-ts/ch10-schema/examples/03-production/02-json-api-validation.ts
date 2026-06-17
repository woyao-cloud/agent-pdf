import { Schema } from "@effect/schema"
import { Effect } from "effect"

// JSON API 数据校验 — 处理嵌套、可选、默认值

const MetadataSchema = Schema.Struct({
  version: Schema.String.pipe(Schema.default("1.0")),
  source: Schema.optional(Schema.String),
  tags: Schema.Array(Schema.String).pipe(Schema.default([])),
})

const ProductSchema = Schema.Struct({
  id: Schema.Number,
  sku: Schema.String,
  name: Schema.String,
  price: Schema.Number.pipe(Schema.nonNegative()),
  metadata: MetadataSchema,
  variants: Schema.optionalWith(
    Schema.Array(
      Schema.Struct({
        color: Schema.String,
        size: Schema.String,
        stock: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
      }),
    ),
    { default: [] },
  ),
})

type Product = Schema.Schema.Type<typeof ProductSchema>

const program = Effect.gen(function* () {
  // 来自外部 API 的 JSON 数据（可能不完整）
  const rawJson: unknown = {
    id: 1,
    sku: "PROD-001",
    name: "无线鼠标",
    price: 99.99,
    metadata: {
      tags: ["电子", "外设"],
    },
    // 缺少 metadata.version → 使用默认值 "1.0"
    // 缺少 variants → 使用默认值 []
  }

  const product = yield* Schema.decode(ProductSchema)(rawJson)
  console.log("产品:", product.name)
  console.log("元数据版本:", product.metadata.version) // "1.0"（默认值）
  console.log("变体数量:", product.variants.length) // 0（默认值）

  // 编码回 JSON（移除默认值，保持简洁）
  const encoded = yield* Schema.encode(ProductSchema)(product)
  console.log("编码后:", JSON.stringify(encoded, null, 2))
})

Effect.runPromise(program)
