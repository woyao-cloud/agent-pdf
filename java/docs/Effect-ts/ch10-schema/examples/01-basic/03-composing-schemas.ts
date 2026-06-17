import { Schema } from "@effect/schema"
import { Effect } from "effect"

// Schema 组合：将多个 Schema 组合为更复杂的结构

// 基础 Schema
const AddressSchema = Schema.Struct({
  street: Schema.String,
  city: Schema.String,
  zipCode: Schema.String.pipe(Schema.pattern(/^\d{5}$/)),
})

const ContactSchema = Schema.Struct({
  phone: Schema.String,
  email: Schema.String.pipe(Schema.email()),
})

// 组合 Schema
const EmployeeSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  address: AddressSchema,
  contact: ContactSchema,
  tags: Schema.Array(Schema.String),
})

type Employee = Schema.Schema.Type<typeof EmployeeSchema>

const program = Effect.gen(function* () {
  const raw: unknown = {
    id: 1,
    name: "张三",
    address: { street: "长安街1号", city: "北京", zipCode: "100000" },
    contact: { phone: "13800138000", email: "zhangsan@example.com" },
    tags: ["技术", "管理"],
  }

  const employee = yield* Schema.decode(EmployeeSchema)(raw)
  console.log("员工信息:", employee)
  console.log("城市:", employee.address.city)
  console.log("标签数:", employee.tags.length)
})

Effect.runPromise(program)
