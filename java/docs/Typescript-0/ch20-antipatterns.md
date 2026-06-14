# 第20章 反模式与代码审查规范

TypeScript 给了你强大的类型系统，但权力越大，责任越大。滥用类型系统的"逃生舱"（`any`、`as`、`enum` 等）会让你失去 TS 带来的所有好处。

本章不谈"怎么写更好"，而是聚焦"什么不该写"——以及如何在团队中建立有效的代码审查机制来拦住这些反模式。

---

## 1. 核心概念

### 反模式的本质：逃避类型检查

TypeScript 的所有反模式都有一个共同点：**绕过类型系统做"更快"的事情。**

- `as any` → "这个类型太复杂，先不管了"
- `enum` → "我需要一个枚举，用 TS 自带的"
- 伪泛型 → "这里加个泛型显得更通用"

每一个反模式在短期内让你"更快"，但在长期让你付出 10 倍的调试成本。

### 比喻：安全气囊和赛车安全带

- **`any`** = 拆掉安全气囊——碰撞时不会报警，但你会受伤
- **严格类型** = 系好安全带——有点束缚，但能保命
- **`as const` + 联合类型** = 赛车专用的六点式安全带——束缚更多，但保护更好

---

## 2. 典型问题与处理

### 问题 1：滥用 any 与 as any 的代价

```typescript
// === Bad: 使用 any 逃避类型检查 ===

// ❌ 反模式 1：函数返回值用 any
function fetchData(url: string): any {
  // 返回 any 意味着调用方不知道返回值的形状
  return fetch(url).then((r) => r.json());
}

const data = fetchData("/api/user");
console.log(data.name.toUpperCase()); // ✅ TS 不报错，但运行时可能崩溃

// ❌ 反模式 2：as any 强制转换
const userInput: string = "42";
const count: number = userInput as any; // 类型检查被绕过
// 运行时 count 是字符串 "42"，不是数字 42

// ❌ 反模式 3：对象用 any 声明
const config: any = {};
config.database.host = "localhost"; // ❌ 运行时崩溃：database 是 undefined
// TS 不报错，因为 any 关闭了所有检查
```

```typescript
// === Good: 正确使用类型和类型保护 ===

// ✅ 方案 1：使用 unknown 替代 any
function fetchDataSafe(url: string): unknown {
  return fetch(url).then((r) => r.json());
}

const data = fetchDataSafe("/api/user");
// TS 强制你进行类型检查后才能使用
if (typeof data === "object" && data !== null && "name" in data) {
  const user = data as { name: string };
  console.log(user.name.toUpperCase());
}

// ✅ 方案 2：使用泛型保留类型信息
async function fetchDataTyped<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json() as T;
}

interface User {
  name: string;
  age: number;
}

const user = await fetchDataTyped<User>("/api/user");
console.log(user.name.toUpperCase()); // ✅ 类型安全

// ✅ 方案 3：双重断言 as unknown as X 的正确用法
// 当你确实需要强制转换时，先转 unknown 再转目标类型
// 这迫使你意识到"我在做一件危险的事"
const input = JSON.parse('{"x": 10}') as unknown as { x: number };
// 相比直接 as { x: number }，as unknown as 让你明确知道
// JSON.parse 返回 any，你需要自己保证类型安全
```

**为什么 Bad：** `any` 关闭了所有类型检查，把运行时错误留到生产环境才发现。
**为什么 Good：** `unknown` 强制你做类型保护，泛型保留了类型链条，双重断言提醒你这是"逃生舱操作"。

---

### 问题 2：滥用 enum 的弊端

```typescript
// === Bad: 使用 TS 原生 enum ===

// ❌ 反模式：enum 编译后产生额外运行时代码
enum Direction {
  Up = "UP",
  Down = "DOWN",
  Left = "LEFT",
  Right = "RIGHT",
}

function move(direction: Direction) {
  console.log(`Moving ${direction}`);
}

move(Direction.Up); // "Moving UP"

// 编译后的 JS 代码（有额外开销）：
// var Direction;
// (function (Direction) {
//   Direction["Up"] = "UP";
//   Direction["Down"] = "DOWN";
//   Direction["Left"] = "LEFT";
//   Direction["Right"] = "RIGHT";
// })(Direction || (Direction = {}));
```

```typescript
// === Good: 使用 as const 对象替代 enum ===

// ✅ 推荐方案：as const + 联合类型
const Direction = {
  Up: "UP",
  Down: "DOWN",
  Left: "LEFT",
  Right: "RIGHT",
} as const;

// 从对象值推导出联合类型
type Direction = (typeof Direction)[keyof typeof Direction];
// 等价于 type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT"

function move(direction: Direction) {
  console.log(`Moving ${direction}`);
}

move(Direction.Up); // ✅ "Moving UP"
move("UP"); // ✅ 也支持直接传字符串
// move("INVALID"); // ❌ 类型错误

// 编译后的 JS 代码（零开销）：
// const Direction = {
//   Up: "UP",
//   Down: "DOWN",
//   Left: "LEFT",
//   Right: "RIGHT",
// };

// ✅ as const 方案的额外优势：
// 1. 零运行时开销
// 2. 支持 tree-shaking（enum 不支持）
// 3. 更容易和外部类型互操作
// 4. 可以遍历键和值

// ✅ 如果需要数字枚举的行为：
const HttpStatus = {
  OK: 200,
  NotFound: 404,
  InternalServerError: 500,
} as const;

type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];

function handleStatus(code: HttpStatus) {
  if (code === HttpStatus.OK) {
    console.log("All good");
  }
}
```

**为什么 Bad：** `enum` 编译后产生 IIFE（立即执行函数），不能被 tree-shaking，而且与外部类型系统的互操作性差。
**为什么 Good：** `as const` 对象零运行时开销，完美支持 tree-shaking，类型推导自然，且与字符串字面量联合类型完全兼容。

---

### 问题 3：泛型参数只出现一次的"伪泛型"陷阱

```typescript
// === Bad: 泛型参数只使用一次 ===

// ❌ 反模式：伪泛型
function wrapInArray<T>(item: T): T[] {
  return [item];
}

// 上面的 T 只在参数中出现一次（在返回值中又用了一次，这不算伪泛型）

// ❌ 真正的伪泛型：
function processData<T>(input: string): T {
  return JSON.parse(input) as T;
}
// T 只在返回值中出现一次
// 调用方可以写 processData<User>("...") 获得 User 类型
// 但实际上 JSON.parse 返回的是 any，类型安全全靠调用方保证

// ❌ 另一个伪泛型例子：
function getLength<T>(obj: unknown): number {
  return (obj as any).length || 0;
}
// T 从未被使用过
```

```typescript
// === Good: 确保泛型参数被实际使用 ===

// ✅ 方案 1：让泛型参数在输入中出现
function processDataSafe<T>(input: string): T {
  return JSON.parse(input) as T;
}
// 问题：T 只出现在输出中——调用方可以断言任何类型
// 严格来说还是伪泛型，需要调用方自己负责

// ✅ 方案 2：用 unknown 替代
function processDataSafe(input: string): unknown {
  return JSON.parse(input);
}
// 调用方自己做类型保护

// ✅ 方案 3：参数中有泛型约束
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
// T 在参数 obj 中使用，K 在参数 key 和返回值中使用
// 这是真正的泛型——调用方传入什么，类型就推导成什么

// ✅ 方案 4：泛型约束 + 类型守卫
function assertType<T>(value: unknown, validator: (v: unknown) => v is T): T {
  if (validator(value)) {
    return value;
  }
  throw new Error("Type assertion failed");
}

// 使用：真正的运行时类型检查
interface User {
  name: string;
  age: number;
}
function isUser(v: unknown): v is User {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as User).name === "string" &&
    typeof (v as User).age === "number"
  );
}

const parsed = JSON.parse('{"name":"Alice","age":30}');
const user = assertType<User>(parsed, isUser); // ✅ 真正的类型安全
```

**为什么 Bad：** 伪泛型给了调用方错误的"安全感"——看起来是类型安全的，实际运行时可能崩溃。
**为什么 Good：** 泛型参数要么出现在输入中让 TS 自动推导，要么配合运行时验证保证真正的类型安全。

---

### 问题 4：滥用非空断言 `!`

```typescript
// === Bad: 到处使用 ! ===

// ❌ 反模式：非空断言作为"快捷方式"
interface Config {
  host?: string;
  port?: number;
}

function printConfig(config: Config) {
  // 如果 config.host 是 undefined，这里会打印 "undefined"
  console.log(config.host!.toUpperCase());
}

// ❌ 在复杂表达式中使用 !
const users = [
  { name: "Alice", address: { city: "Beijing" } },
  { name: "Bob" },
];

// 这里会运行时崩溃：Bob 没有 address
users.forEach((u) => console.log(u.address!.city));
```

```typescript
// === Good: 使用可选链和类型守卫 ===

function printConfigSafe(config: Config) {
  // ✅ 方案 1：可选链 + 空值合并
  console.log(config.host?.toUpperCase() ?? "unknown host");

  // ✅ 方案 2：提前返回
  if (!config.host) {
    console.log("host not configured");
    return;
  }
  console.log(config.host.toUpperCase());
}

users.forEach((u) => {
  // ✅ 方案 3：类型守卫
  if (u.address) {
    console.log(u.address.city);
  } else {
    console.log("No address");
  }
});
```

**为什么 Bad：** `!` 只是告诉 TS "相信我，它不是 null"，但你不能相信你自己。运行时 null 就是 null。
**为什么 Good：** 可选链 `?.` 在遇到 null/undefined 时安全返回，类型守卫确保你只在值存在时使用。

---

## 3. 示例代码

### Code Review Checklist 实战

```typescript
// 以下是一个需要 Review 的代码片段

// ============ 需要审查的代码 ============
function processOrder(order: any) {
  return order.items.map((item: any) => {
    return {
      name: item.name,
      price: item.price as number,
      quantity: item.qty ?? 1,
    };
  });
}

enum OrderStatus {
  Pending = "PENDING",
  Shipped = "SHIPPED",
  Delivered = "DELIVERED",
}

// ============ 审查清单 ============

// ✅ 1. 有没有滥用 any？
// 发现：order: any → 应该用具体类型

// ✅ 2. 有没有滥用 as 断言？
// 发现：item.price as number → 应该提前校验或声明类型

// ✅ 3. 有没有使用 enum？
// 发现：enum OrderStatus → 应改为 as const 对象

// ✅ 4. 有没有伪泛型？
// 发现：没有泛型，但函数也不够通用——取决于需求

// ✅ 5. 有没有滥用非空断言？
// 发现：没有

// ============ 修正后的代码 ============

interface OrderItem {
  name: string;
  price: number;
  qty?: number;
}

interface Order {
  items: OrderItem[];
}

const OrderStatus = {
  Pending: "PENDING",
  Shipped: "SHIPPED",
  Delivered: "DELIVERED",
} as const;

type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

function processOrderSafe(order: Order): OrderItem[] {
  return order.items.map((item) => ({
    name: item.name,
    price: item.price, // ✅ 类型安全，不再是 any
    quantity: item.qty ?? 1,
  }));
}
```

### 团队 TS 编码规范示例

```typescript
// === .tsconfig 中强制开启的规则 ===

// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}

// === ESLint 配置 ===

// .eslintrc.cjs — 在 CI 中强制执行
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/strict-type-checked",
  ],
  rules: {
    // 禁止使用 any
    "@typescript-eslint/no-explicit-any": "error",

    // 禁止使用 ts-ignore（推荐用 ts-expect-error）
    "@typescript-eslint/ban-ts-comment": [
      "error",
      { "ts-ignore": "allow-with-description" },
    ],

    // 禁止不必要的类型断言
    "@typescript-eslint/no-unnecessary-type-assertion": "error",

    // 禁止未使用的泛型参数
    "@typescript-eslint/no-unnecessary-type-parameters": "error",

    // 要求数组元素有具体类型（避免 Array<any>）
    "@typescript-eslint/no-unsafe-array-type": "error",

    // 禁止不必要的条件表达式
    "@typescript-eslint/no-unnecessary-condition": "error",

    // 禁止 Promise 风格的 async 函数没有 await
    "@typescript-eslint/require-await": "error",

    // 强制显式返回值类型（重要函数的契约）
    "@typescript-eslint/explicit-function-return-type": [
      "warn",
      { allowExpressions: true },
    ],
  },
};
```

### CI 门禁设置

```yaml
# .github/workflows/type-check.yml
# CI 中强制执行类型检查和 lint

name: TypeScript Quality Gate

on:
  pull_request:
    paths:
      - "src/**/*.ts"
      - "src/**/*.tsx"

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      # 1. 类型检查：不允许任何编译错误
      - name: Type Check
        run: npx tsc --noEmit
        # --noEmit 只检查类型，不输出文件

      # 2. ESLint：强制执行代码规范
      - name: Lint
        run: npx eslint src/ --max-warnings 0
        # --max-warnings 0：不允许任何 warning

      # 3. 单元测试
      - name: Test
        run: npx vitest run

      # 4. 检查是否有 @ts-ignore（禁止使用）
      - name: Forbid ts-ignore
        run: grep -r "@ts-ignore" src/ && echo "❌ @ts-ignore is forbidden. Use @ts-expect-error instead." && exit 1 || exit 0
```

---

## 4. 配置/环境示例

### Code Review Checklist（打印贴在墙上）

```
### TypeScript Code Review Checklist

### 类型安全
[ ] 没有使用 any（除了极少数经过讨论的例外）
[ ] 没有不必要的 as 断言（尤其是 as any）
[ ] 没有滥用非空断言 !
[ ] 泛型参数至少被使用两次
[ ] 没有使用 enum（改用 as const 对象）

### 代码质量
[ ] 函数有明确的输入输出类型
[ ] 没有未使用的变量或参数（noUnusedLocals 应开启）
[ ] 回调函数有类型标注，不是隐式 any
[ ] 错误处理不是简单的 catch(e) {} 或 catch(e) { console.log(e) }

### 可维护性
[ ] @ts-expect-error 有注释说明原因和 TODO 编号
[ ] 没有过度设计的泛型（泛型嵌套不超过 2 层）
[ ] 条件类型有合理的 fallback（不是简单地返回 never）
[ ] 工具类型（utility types）有文档说明用途

### 性能
[ ] 没有复杂到可能影响编译速度的递归类型
[ ] 联合类型成员不超过 50 个
[ ] 没有在 .d.ts 文件中导出大量不必要的类型
```

### 团队规范文档示例

```markdown
# 团队 TypeScript 编码规范 v2.0

### 强制规则（CI 拦截）

1. **禁止使用 any**：所有类型必须明确。确实需要宽松类型时使用 `unknown`。
2. **禁止使用 enum**：使用 `as const` 对象替代，参考 [banned enum pattern](./patterns/as-const-enum.md)。
3. **禁止使用 @ts-ignore**：使用 `@ts-expect-error` 并附加注释和 TODO。
4. **禁止非空断言 `!`**：使用类型守卫或可选链 `?.`。
5. **泛型参数必须被使用**：至少出现在参数或返回值中，不能只出现在约束中。

### 推荐规则（Code Review 检查）

1. 函数应有显式返回类型（`void` 也要写）。
2. 避免过度泛型：如果一个泛型函数只有一处调用，考虑是否过度设计。
3. 条件类型优先使用 `infer` 提取，而不是手动推导。
4. 类型文件名使用 `.types.ts` 后缀，与逻辑文件分离。
5. 共享类型定义在 `src/types/` 目录下，按模块分文件。

### 工具配置

- TypeScript: strict mode
- ESLint: @typescript-eslint/strict-type-checked
- Prettier: 所有文件格式化一致
- Husky: pre-commit hook 运行 lint-staged
- CI: 每次 PR 必须通过类型检查和 lint
```

---

## 5. 必须掌握的技能

### 开发者应带走的 5 个核心原则

1. **`any` 是毒药，不是解药**：遇到类型问题时，`any` 只是掩盖症状，不是治疗病因。用 `unknown` 替代，用类型守卫保护。
2. **`enum` 是历史包袱**：在 TS 5.x 的今天，`as const` 对象是更优选择——零开销、可 tree-shaking、与外部类型系统兼容。
3. **伪泛型 = 伪安全**：泛型参数只出现一次，说明你不需要泛型。要么重新设计，要么去掉泛型用 `unknown`。
4. **非空断言是运行时炸弹**：`!` 说"相信我，不是 null"，但你不可信。用 `?.` 和类型守卫保护自己。
5. **Code Review 是最后防线**：配置 ESLint 规则 + CI 门禁 + Code Review Checklist，形成三层防护网。

### 反模式快速自查表

| 反模式 | 问题 | 替代方案 |
|--------|------|---------|
| `as any` | 绕过类型检查 | `as unknown as X` + 注释 |
| `as X` 直接断言 | 没有强制检查 | 先校验再断言 |
| `enum` | 运行时开销 + 互操性差 | `as const` 对象 + 联合类型 |
| 伪泛型 `<T>` 只用一次 | 假的安全感 | `unknown` 或重新设计 |
| `!` 非空断言 | 运行时崩溃 | 可选链 `?.` + 类型守卫 |
| `@ts-ignore` | 永久掩盖错误 | `@ts-expect-error` + TODO |
| `Object` 类型 | 太宽泛 | `Record<string, unknown>` |
| `Function` 类型 | 无法保证参数安全 | 明确的函数签名 |
| `setTimeout`/`setInterval` 传字符串 | 类型不安全 | 传箭头函数 |

### 最后的建议

> **类型系统是契约，不是束缚。**

反模式的本质是你对类型系统的不信任——你觉得自己比编译器更懂。但 10 个 case 里有 9 个，编译器是对的。

在写 `as any` 之前，问自己三个问题：
1. 我真的不能写出正确的类型吗？
2. 如果运行时这里崩溃了，我能接受吗？
3. 半年后回来的我，还能理解这里为什么用 `any` 吗？

如果三个答案都是"是"，那用 `as any`。否则，重新设计你的类型。
